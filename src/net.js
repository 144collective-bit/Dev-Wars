/* ============================================================================
   NETPLAY — deterministic lockstep over a WebRTC data channel
   ----------------------------------------------------------------------------
   Neither peer sends game state. Each sends only its own input for a frame a
   few ticks in the future; a frame is simulated once both inputs for it are
   in hand. That keeps bandwidth at a few bytes per frame and guarantees both
   machines see exactly the same match — provided the simulation is
   deterministic, which is why it is integer-only. A rolling checksum catches
   it immediately if that ever stops being true.

   The tradeoff versus rollback netcode: your own inputs take NET_DELAY frames
   to appear. At 3 frames that is 50ms, which is unnoticeable at close range
   and honest at long range.
   ========================================================================== */

const Net = {
  peer:null, conn:null, isHost:false, code:"", state:"idle",
  localInputs:new Map(), remoteInputs:new Map(),
  simFrame:0, sendFrame:0, mySide:0,
  remoteChar:null, myChar:null, seed:0,
  stallFrames:0, desync:false, lastPing:0, ping:0,
  onStatus:null, onStart:null, onEnd:null, onRematch:null,

  makeCode(){
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    const buf = new Uint8Array(5);
    (window.crypto || {}).getRandomValues
      ? crypto.getRandomValues(buf)
      : buf.forEach((_, i) => buf[i] = Math.floor(Math.random()*256));
    for (let i = 0; i < 5; i++) s += abc[buf[i] % abc.length];
    return s;
  },
  status(msg, kind){ if (this.onStatus) this.onStatus(msg, kind); },

  newPeer(id){
    if (typeof Peer === "undefined"){
      this.status("Could not load the peer-to-peer library. Check your connection, or play offline.", "err");
      return null;
    }
    const opts = { debug:0, config:{ iceServers: ICE_SERVERS } };
    if (PEER_SERVER_CONFIG) Object.assign(opts, PEER_SERVER_CONFIG);
    return id ? new Peer(id, opts) : new Peer(opts);
  },

  host(charKey){
    this.reset();
    this.isHost = true; this.myChar = charKey;
    this.code = this.makeCode();
    this.seed = (Date.now() ^ (Math.random()*0xffffffff)) >>> 0;
    this.state = "hosting";
    this.status("Opening room…");
    const p = this.newPeer(ROOM_PREFIX + this.code);
    if (!p){ this.code = ""; return; }
    this.peer = p;
    p.on("open", () => this.status("Room open. Give your friend the code."));
    p.on("error", e => this.handlePeerError(e));
    p.on("connection", c => {
      if (this.conn){ c.close(); return; }
      this.conn = c;
      this.wire(c);
    });
  },
  join(code, charKey){
    this.reset();
    this.isHost = false; this.myChar = charKey;
    this.code = String(code || "").toUpperCase().trim();
    this.state = "joining";
    this.status("Connecting to " + this.code + "…");
    const p = this.newPeer(null);
    if (!p) return;
    this.peer = p;
    p.on("error", e => this.handlePeerError(e));
    p.on("open", () => {
      const c = p.connect(ROOM_PREFIX + this.code, { reliable:true, serialization:"json" });
      this.conn = c;
      this.wire(c);
      setTimeout(() => {
        if (this.state === "joining") this.status("No answer. Check the code, or ask them to re-open the room.", "err");
      }, 12000);
    });
  },
  handlePeerError(e){
    const t = (e && e.type) || "";
    if (t === "peer-unavailable") this.status("No room with that code. Check the letters and try again.", "err");
    else if (t === "unavailable-id") this.status("That room code is taken. Go back and host again.", "err");
    else if (t === "network" || t === "server-error") this.status("Cannot reach the matchmaking server. Try again in a moment.", "err");
    else if (t === "browser-incompatible") this.status("This browser does not support peer-to-peer play.", "err");
    else this.status("Connection problem" + (t ? " (" + t + ")" : "") + ".", "err");
  },
  wire(c){
    c.on("open", () => {
      this.state = "handshake";
      this.status("Connected. Syncing…", "ok");
      this.send({ t:"hello", char:this.myChar, ver:GAME_VERSION });
      this.pingTimer = setInterval(() => {
        this.lastPing = performance.now();
        this.send({ t:"ping" });
      }, 2000);
    });
    c.on("data", d => this.onData(d));
    c.on("close", () => this.dropped("Opponent disconnected."));
    c.on("error", () => this.dropped("Connection lost."));
  },
  onData(d){
    if (!d || typeof d !== "object") return;
    switch (d.t){
      case "hello":
        if (this.versionClash(d.ver)) break;
        this.remoteChar = d.char;
        if (this.isHost) this.tryStart();
        break;
      case "badver":
        this.reportVersionClash(d.ver);
        break;
      case "start":
        if (this.versionClash(d.ver)) break;
        this.seed = d.seed >>> 0;
        this.remoteChar = d.hostChar;
        this.mySide = 1;
        this.beginMatch([d.hostChar, this.myChar]);
        break;
      case "i":
        if ((d.s >>> 0) !== this.seed) break;   /* stale packet from a previous match */
        this.remoteInputs.set(d.f, d.m|0);
        break;
      case "c":
        if ((d.s >>> 0) !== this.seed) break;
        this.checkSum(d.f, d.h >>> 0);
        break;
      case "ping": this.send({ t:"pong" }); break;
      case "pong": this.ping = Math.round(performance.now() - this.lastPing); break;
      case "rematch": if (this.onRematch) this.onRematch(d); break;
      case "bye": this.dropped("Opponent left."); break;
    }
  },
  tryStart(){
    if (!this.isHost || !this.remoteChar || this.state === "playing") return;
    this.mySide = 0;
    this.send({ t:"start", seed:this.seed, hostChar:this.myChar, ver:GAME_VERSION });
    this.beginMatch([this.myChar, this.remoteChar]);
  },
  /* Host only: roll a fresh seed and start another set. */
  restart(myChar){
    if (!this.isHost || !this.conn || !this.conn.open) return;
    this.myChar = myChar || this.myChar;
    this.seed = (Date.now() ^ (Math.random()*0xffffffff)) >>> 0;
    this.mySide = 0;
    this.send({ t:"start", seed:this.seed, hostChar:this.myChar, ver:GAME_VERSION });
    this.beginMatch([this.myChar, this.remoteChar]);
  },
  /* Refuse the match rather than let two different builds drift apart. */
  versionClash(theirs){
    if (theirs === GAME_VERSION) return false;
    this.send({ t:"badver", ver:GAME_VERSION });
    this.reportVersionClash(theirs);
    return true;
  },
  reportVersionClash(theirs){
    this.status("Different game versions — you are on " + GAME_VERSION +
                ", they are on " + (theirs || "an older build") +
                ". Both of you refresh the page, then try again.", "err");
    this.state = "dead";
    clearInterval(this.pingTimer);
    try { if (this.conn) this.conn.close(); } catch(e){}
  },
  beginMatch(charKeys){
    this.localInputs.clear(); this.remoteInputs.clear();
    for (let i = 0; i < NET_DELAY; i++){ this.localInputs.set(i, 0); this.remoteInputs.set(i, 0); }
    this.simFrame = 0; this.sendFrame = NET_DELAY;
    this.stallFrames = 0; this.desync = false;
    this.state = "playing";
    this.pendingChecks = new Map();
    if (this.onStart) this.onStart(charKeys, this.seed, this.mySide);
  },
  send(o){ try { if (this.conn && this.conn.open) this.conn.send(o); } catch(e){ /* channel closing */ } },

  /* Called once per simulated frame with our own input; returns the pair of
     inputs to step with, or null if we are still waiting on the opponent. */
  exchange(localMask, game){
    if (this.state !== "playing") return null;
    if (!this.localInputs.has(this.sendFrame)){
      this.localInputs.set(this.sendFrame, localMask);
      this.send({ t:"i", f:this.sendFrame, m:localMask, s:this.seed });
      this.sendFrame++;
    }
    const f = this.simFrame;
    if (!this.remoteInputs.has(f)){ this.stallFrames++; return null; }
    this.stallFrames = 0;
    const mine = this.localInputs.get(f) | 0, theirs = this.remoteInputs.get(f) | 0;
    this.simFrame++;
    /* prune */
    if (f > 240){ this.localInputs.delete(f - 240); this.remoteInputs.delete(f - 240); }
    /* periodic desync check */
    if (game && f % 60 === 0){
      const h = hashState(game);
      this.pendingChecks.set(f, h);
      this.send({ t:"c", f, h, s:this.seed });
      if (this.pendingChecks.size > 20) this.pendingChecks.delete(this.pendingChecks.keys().next().value);
    }
    return this.mySide === 0 ? [mine, theirs] : [theirs, mine];
  },
  checkSum(f, h){
    if (!this.pendingChecks) return;
    if (!this.pendingChecks.has(f)) { this.pendingLate = this.pendingLate || new Map(); this.pendingLate.set(f, h); return; }
    if (this.pendingChecks.get(f) !== h && !this.desync){
      this.desync = true;
      this.status("Desync detected — the match is no longer in sync.", "err");
    }
  },
  dropped(msg){
    if (this.state === "dead") return;
    this.state = "dead";
    clearInterval(this.pingTimer);
    if (this.onEnd) this.onEnd(msg);
  },
  reset(){
    clearInterval(this.pingTimer);
    try { if (this.conn) this.conn.close(); } catch(e){}
    try { if (this.peer) this.peer.destroy(); } catch(e){}
    this.peer = null; this.conn = null; this.state = "idle";
    this.localInputs.clear(); this.remoteInputs.clear();
    this.remoteChar = null; this.desync = false; this.ping = 0;
  },
  leave(){ this.send({ t:"bye" }); this.reset(); }
};
