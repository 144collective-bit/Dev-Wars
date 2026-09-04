/* ============================================================================
   MENUS, SCENES AND THE MAIN LOOP
   ========================================================================== */

const NOTATION = {
  bolt:"↓ ↘ → + Punch",       rise:"→ ↓ ↘ + Punch",
  heel:"↓ ↙ ← + Kick",        rush:"↓ ↘ → + Punch",
  clasp:"← ↙ ↓ ↘ → + Punch",
  anvil:"↓ ↙ ← + Kick",
  lance:"Hold ← (1s) then → + Punch",
  fang:"Hold ↓ (1s) then ↑ + Kick",
  razor:"↓ ↘ → + Kick",
  tempest:"↓↘→ ×2 + Punch (needs SUPER)",
  wrecking:"↓↘→ ×2 + Punch (needs SUPER)",
  circuit:"↓↘→ ×2 + Kick (needs SUPER)"
};

const uiRoot = document.getElementById("ui");
let scene = "title", titleFrame = 0;
let game = null, mode = "cpu", ai = null, aiSide = 1, netStalled = 0, paused = false;
let sel = { p1:"kestrel", p2:"brick", diff:"normal" };   /* overwritten by Settings.load() at boot */

function panel(html){
  uiRoot.innerHTML = '<div class="panel">' + html + "</div>";
  uiRoot.classList.remove("hide");
  const first = uiRoot.querySelector("button, input");
  if (first) first.focus();
}
function closePanel(){ uiRoot.innerHTML = ""; }
function $(sel){ return uiRoot.querySelector(sel); }
function bind(id, fn){ const el = uiRoot.querySelector(id); if (el) el.addEventListener("click", e => { Sfx.unlock(); Sfx.play("select"); fn(e); }); }

function charCardsHTML(selectedKey, label){
  let h = '<h3>' + label + '</h3><div class="csgrid">';
  for (const c of CHARACTERS){
    h += '<div class="cscard' + (c.key === selectedKey ? " sel" : "") + '" data-key="' + c.key + '">' +
         '<canvas width="64" height="76" data-portrait="' + c.key + '"></canvas>' +
         '<div class="nm">' + c.name + '</div><div class="rl">' + c.role + '</div></div>';
  }
  return h + "</div>";
}
function paintPortraits(){
  uiRoot.querySelectorAll("canvas[data-portrait]").forEach(cv => {
    const ch = CHAR_BY_KEY[cv.dataset.portrait];
    const spr = getSprite(ch, POSE.idle1, 1, null);
    const c = cv.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, cv.width, cv.height);
    c.drawImage(spr, SPRITE_OX - 32, SPRITE_OY - 74, 64, 76, 0, 0, 64, 76);
  });
}
function charInfoHTML(key){
  const c = CHAR_BY_KEY[key];
  let h = '<p><b>' + c.name + '</b> — ' + c.role + '. ' + c.blurb + '</p><div class="movelist">';
  for (const s of c.specials) h += '<div><b>' + s.make(IN_MP).name + '</b> — ' + (NOTATION[s.key] || "") + "</div>";
  h += '<div><b>' + c.super.name + '</b> — ' + (NOTATION[c.super.key] || "") + "</div></div>";
  return h;
}
function wireCharCards(onPick){
  uiRoot.querySelectorAll(".cscard").forEach(el => {
    el.addEventListener("click", () => { Sfx.unlock(); Sfx.play("select"); onPick(el.dataset.key); });
  });
  paintPortraits();
}

/* ---- screens -------------------------------------------------------------- */

function sceneTitle(){
  scene = "title";
  Net.reset();
  panel(
    '<h1>Iron Circuit</h1><h2>An original arcade fighter</h2>' +
    '<button class="mi" id="mOnline">Online match<span class="sub">Play a friend anywhere — share a five-letter room code</span></button>' +
    '<button class="mi" id="mCpu">Practice vs CPU<span class="sub">Single player, three difficulty levels</span></button>' +
    '<button class="mi" id="mLocal">Local versus<span class="sub">Two players, one keyboard</span></button>' +
    '<div class="row"><button class="mi ghost" id="mHelp" style="text-align:center">How to play</button>' +
    '<button class="mi ghost" id="mSettings" style="text-align:center">Settings</button></div>' +
    '<div class="foot">Best of three rounds. Original characters and art.<br>' +
    '<span id="muteLbl">' + (Sfx.muted ? "Sound off" : "Sound on") + '</span> — press M to toggle.' +
    '<br>Version ' + GAME_VERSION + '</div>'
  );
  bind("#mOnline", () => sceneCharSelect("net"));
  bind("#mCpu",    () => sceneCharSelect("cpu"));
  bind("#mLocal",  () => sceneCharSelect("local"));
  bind("#mHelp",   sceneHelp);
  bind("#mSettings", sceneSettings);
}

function sceneSettings(){
  scene = "settings";
  const pads = Pad.connected();
  const row = (act, label) =>
    '<tr><td>' + label + '</td>' +
    ['p1','p2'].map(side =>
      '<td><button class="keycap" data-side="' + side + '" data-act="' + act + '">' +
      keyLabel(Settings.binds[side][act]) + "</button></td>").join("") + "</tr>";
  panel(
    '<h1>Settings</h1><h2>Controls and preferences</h2>' +
    '<h3>Keyboard</h3>' +
    '<p>Click a key, then press the one you want. <b>Esc</b> cancels.</p>' +
    '<table class="binds"><tr><th>Action</th><th>Player 1</th><th>Player 2</th></tr>' +
    ACTIONS.map(a => row(a[0], a[1])).join("") + "</table>" +
    '<div class="status" id="bindMsg"></div>' +
    '<h3>On-screen controls</h3><div class="row">' +
    ["auto","on","off"].map(t =>
      '<button class="mi' + (Settings.touchMode === t ? "" : " ghost") + '" data-touch="' + t +
      '" style="text-align:center">' + t + "</button>").join("") + "</div>" +
    '<p>Auto shows the on-screen pad on touch devices only.</p>' +
    '<h3>Gamepad</h3><p>' +
    (pads ? pads + " controller" + (pads > 1 ? "s" : "") + " connected. Face buttons are the light and medium " +
            "attacks, shoulders the heavies. Press a button on a pad if it is not detected yet."
          : "No controller detected. Plug one in and press a button on it — browsers hide gamepads until you do.") +
    "</p>" +
    '<div class="row"><button class="mi ghost" id="reset" style="text-align:center">Reset keys</button>' +
    '<button class="mi" id="back" style="text-align:center">Done</button></div>'
  );
  const msg = t => { const el = $("#bindMsg"); if (el){ el.textContent = t || ""; el.className = "status" + (t ? " err" : ""); } };
  uiRoot.querySelectorAll(".keycap").forEach(btn => btn.addEventListener("click", () => {
    if (Input.capturing) return;
    Sfx.unlock(); Sfx.play("select");
    msg("");
    btn.classList.add("listening");
    btn.textContent = "PRESS A KEY";
    Input.capturing = true;
    const grab = e => {
      e.preventDefault(); e.stopPropagation();
      removeEventListener("keydown", grab, true);
      Input.capturing = false;
      btn.classList.remove("listening");
      const { side, act } = btn.dataset;
      if (e.code !== "Escape"){
        const clash = bindConflict(e.code, side, act);
        if (clash) msg(keyLabel(e.code) + " is already " + clash.side.toUpperCase() + " " +
                       (ACTIONS.find(a => a[0] === clash.act) || [,"?"])[1].toLowerCase() + ".");
        else { Settings.binds[side][act] = e.code; rebuildMaps(); Settings.save(); }
      }
      btn.textContent = keyLabel(Settings.binds[side][act]);
    };
    addEventListener("keydown", grab, true);
  }));
  uiRoot.querySelectorAll("[data-touch]").forEach(b => b.addEventListener("click", () => {
    Settings.touchMode = b.dataset.touch; Settings.save(); Touch.apply(); Sfx.play("select");
    uiRoot.querySelectorAll("[data-touch]").forEach(x => x.classList.toggle("ghost", x.dataset.touch !== Settings.touchMode));
  }));
  bind("#reset", () => { Settings.resetBinds(); sceneSettings(); });
  bind("#back", sceneTitle);
}

const cap = code => "<kbd>" + keyLabel(code) + "</kbd>";
function sceneHelp(){
  scene = "help";
  panel(
    '<h1>How to play</h1><h2>Controls</h2>' +
    '<table class="keys">' +
    '<tr><td>' + ["up","left","down","right"].map(a => cap(Settings.binds.p1[a])).join("") +
    ' or arrows</td><td>Move · up jumps · down crouches · hold back to block</td></tr>' +
    '<tr><td>' + ["lp","mp","hp"].map(a => cap(Settings.binds.p1[a])).join("") + '</td><td>Light, medium, heavy <b>punch</b></td></tr>' +
    '<tr><td>' + ["lk","mk","hk"].map(a => cap(Settings.binds.p1[a])).join("") + '</td><td>Light, medium, heavy <b>kick</b></td></tr>' +
    '<tr><td>' + cap(Settings.binds.p1.lp) + ' + ' + cap(Settings.binds.p1.lk) + ' up close</td><td>Throw — beats blocking</td></tr>' +
    '<tr><td><kbd>Esc</kbd> · <kbd>M</kbd></td><td>Pause (offline) · mute</td></tr>' +
    '</table>' +
    '<p>Player two on one keyboard uses ' +
    ["up","left","down","right"].map(a => cap(Settings.binds.p2[a])).join("") + ', ' +
    ["lp","mp","hp"].map(a => cap(Settings.binds.p2[a])).join("") + ' for punches and ' +
    ["lk","mk","hk"].map(a => cap(Settings.binds.p2[a])).join("") + ' for kicks. ' +
    'All of it is remappable under <b>Settings</b>.</p>' +
    '<p><b>Gamepads</b> work too — face buttons are the light and medium attacks, ' +
    'shoulders the heavies. On a phone or tablet an <b>on-screen pad</b> appears ' +
    'automatically: sweep your thumb around the ring for quarter-circles.</p>' +
    '<h3>The rules that matter</h3>' +
    '<p><b>Blocking</b> is holding away from your opponent. Stand-block stops overheads and jump-ins; ' +
    'crouch-block stops sweeps and low kicks. Nothing blocks a throw.<br><br>' +
    '<b>Cancelling</b> — a light or medium normal that connects can be cancelled straight into a special, ' +
    'which is how combos are built.<br><br>' +
    '<b>The super meter</b> fills as you deal and take damage. Full meter, one super.</p>' +
    '<button class="mi" id="back">Back</button>'
  );
  bind("#back", sceneTitle);
}

function sceneCharSelect(m, stage){
  mode = m;
  stage = stage || 1;
  scene = "select";
  const who = m === "net" ? "Choose your fighter" :
              stage === 1 ? "Player one — choose your fighter" :
              m === "cpu" ? "Choose your opponent" : "Player two — choose your fighter";
  const cur = stage === 1 ? sel.p1 : sel.p2;
  let extra = "";
  if (m === "cpu" && stage === 2){
    extra = '<h3>Difficulty</h3><div class="row">' +
      ["easy","normal","hard"].map(d =>
        '<button class="mi' + (sel.diff === d ? "" : " ghost") + '" data-diff="' + d + '" style="text-align:center">' + d + '</button>').join("") +
      "</div>";
  }
  panel(
    '<h1>Select</h1><h2>' + who + "</h2>" +
    charCardsHTML(cur, "Fighters") +
    '<div id="info">' + charInfoHTML(cur) + "</div>" + extra +
    '<div class="row"><button class="mi ghost" id="back" style="text-align:center">Back</button>' +
    '<button class="mi" id="go" style="text-align:center">Confirm</button></div>'
  );
  const setCur = k => {
    if (stage === 1){ sel.p1 = k; Settings.p1 = k; } else { sel.p2 = k; Settings.p2 = k; }
    Settings.save();
  };
  wireCharCards(k => {
    setCur(k);
    uiRoot.querySelectorAll(".cscard").forEach(el => el.classList.toggle("sel", el.dataset.key === k));
    $("#info").innerHTML = charInfoHTML(k);
  });
  uiRoot.querySelectorAll("[data-diff]").forEach(b => b.addEventListener("click", () => {
    sel.diff = b.dataset.diff; Settings.diff = sel.diff; Settings.save(); Sfx.play("select");
    uiRoot.querySelectorAll("[data-diff]").forEach(x => x.classList.toggle("ghost", x.dataset.diff !== sel.diff));
  }));
  bind("#back", () => stage === 2 ? sceneCharSelect(m, 1) : sceneTitle());
  bind("#go", () => {
    if (m === "net") sceneOnline();
    else if (stage === 1) sceneCharSelect(m, 2);
    else startOfflineMatch();
  });
}

function sceneOnline(){
  scene = "online";
  panel(
    '<h1>Online</h1><h2>Playing as ' + CHAR_BY_KEY[sel.p1].name + "</h2>" +
    '<button class="mi" id="host">Host a room<span class="sub">You get a code — send it to your opponent</span></button>' +
    '<button class="mi" id="join">Join a room<span class="sub">Enter the code they sent you</span></button>' +
    '<button class="mi ghost" id="back">Back</button>' +
    '<div class="foot">Matches run browser-to-browser over WebRTC. A public broker is used only ' +
    'to introduce the two of you; no game data passes through it.<br><br>' +
    'Online play needs this page served over <b>https</b> from a site that allows outbound ' +
    'connections. Opening the file from disk, or from a sandboxed preview, gives you the ' +
    'offline modes only.</div>'
  );
  bind("#host", sceneHost);
  bind("#join", sceneJoin);
  bind("#back", () => sceneCharSelect("net"));
}

function netStatusHook(){
  Net.onStatus = (msg, kind) => {
    const el = $(".status");
    if (el){ el.textContent = msg; el.className = "status" + (kind ? " " + kind : ""); }
  };
  Net.onStart = (charKeys, seed, mySide) => startNetMatch(charKeys, seed, mySide);
  Net.onEnd = msg => {
    if (scene === "match" || scene === "results") sceneDisconnected(msg);
    else { const el = $(".status"); if (el){ el.textContent = msg; el.className = "status err"; } }
  };
}

function sceneHost(){
  scene = "lobby";
  panel(
    '<h1>Your room</h1><h2>Send this code to your opponent</h2>' +
    '<div class="bigcode" id="code">·····</div>' +
    '<div class="row"><button class="mi ghost" id="copy" style="text-align:center">Copy code</button>' +
    '<button class="mi ghost" id="cancel" style="text-align:center">Cancel</button></div>' +
    '<div class="status">Opening room…</div>'
  );
  netStatusHook();
  Net.host(sel.p1);
  $("#code").textContent = Net.code || "—";
  bind("#copy", () => {
    const t = Net.code;
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(
      () => Net.status("Code copied.", "ok"), () => Net.status("Copy failed — read it out instead."));
    else Net.status("Copy is unavailable here — read it out instead.");
  });
  bind("#cancel", () => { Net.leave(); sceneOnline(); });
}

function sceneJoin(){
  scene = "lobby";
  panel(
    '<h1>Join</h1><h2>Enter the five-letter code</h2>' +
    '<input class="code" id="codein" maxlength="5" autocomplete="off" spellcheck="false" placeholder="-----">' +
    '<div class="row" style="margin-top:10px"><button class="mi ghost" id="cancel" style="text-align:center">Back</button>' +
    '<button class="mi" id="go" style="text-align:center">Connect</button></div>' +
    '<div class="status"></div>'
  );
  netStatusHook();
  const inp = $("#codein");
  inp.focus();
  inp.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key === "Enter") $("#go").click();
  });
  bind("#go", () => {
    const code = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length < 5){ Net.status("That code is five characters long.", "err"); return; }
    Net.join(code, sel.p1);
  });
  bind("#cancel", () => { Net.leave(); sceneOnline(); });
}

function sceneDisconnected(msg){
  scene = "results";
  Net.reset();
  panel('<h1>Disconnected</h1><h2>' + msg + "</h2>" +
    '<button class="mi" id="back">Back to menu</button>');
  bind("#back", sceneTitle);
}

/* ---- starting and ending matches ------------------------------------------ */

let netSide = 0, rematchMe = false, rematchThem = false;

function startOfflineMatch(){
  const seed = (Date.now() & 0x7fffffff) >>> 0;
  game = new Game([sel.p1, sel.p2], seed);
  ai = mode === "cpu" ? new AI(sel.diff, seed ^ 0x5bf03635) : null;
  aiSide = 1;
  hud[0].trail = hud[1].trail = 1;
  paused = false; scene = "match";
  closePanel();
  Sfx.unlock(); Sfx.play("round");
}
function startNetMatch(charKeys, seed, mySide){
  netSide = mySide;
  mode = "net";
  game = new Game(charKeys, seed);
  hud[0].trail = hud[1].trail = 1;
  rematchMe = rematchThem = false;
  netStalled = 0; paused = false; scene = "match";
  closePanel();
  Sfx.unlock(); Sfx.play("round");
}

function showResults(){
  scene = "results";
  const w = game.matchWinner;
  const title = w < 0 ? "Draw game" : game.fighters[w].ch.name + " wins";
  let sub;
  if (mode === "net") sub = w === netSide ? "You win the set." : w < 0 ? "Even on rounds." : "You lost the set.";
  else if (mode === "cpu") sub = w === 0 ? "You win." : "The CPU takes it.";
  else sub = "Player " + (w + 1) + " takes the set.";

  let html = "<h1>" + title + "</h1><h2>" + sub + "</h2>" +
    "<p>" + game.fighters[0].ch.name + " " + game.fighters[0].wins + " — " +
    game.fighters[1].wins + " " + game.fighters[1].ch.name + "</p>";
  if (mode === "net") html += '<div class="status" id="rmStatus">' +
    (Net.ping ? "Ping " + Net.ping + "ms" : "") + "</div>";
  html += '<button class="mi" id="again">Rematch</button>' +
          '<button class="mi ghost" id="chars">Change fighter</button>' +
          '<button class="mi ghost" id="menu">Main menu</button>';
  panel(html);

  bind("#again", () => {
    if (mode === "net"){
      rematchMe = true;
      Net.send({ t:"rematch" });
      const el = $("#rmStatus");
      if (el){ el.textContent = "Rematch requested — waiting for your opponent…"; el.className = "status"; }
      tryRematch();
    } else startOfflineMatch();
  });
  bind("#chars", () => {
    if (mode === "net"){ Net.leave(); sceneCharSelect("net"); }
    else sceneCharSelect(mode, 1);
  });
  bind("#menu", () => { if (mode === "net") Net.leave(); sceneTitle(); });
}
function tryRematch(){
  if (!(rematchMe && rematchThem)) return;
  rematchMe = rematchThem = false;
  if (Net.isHost) Net.restart(sel.p1);
  /* the guest simply waits for the host's "start" */
}

/* ---- pause ---------------------------------------------------------------- */
function togglePause(){
  if (scene !== "match" || mode === "net") return;
  paused = !paused;
  if (paused){
    panel('<h1>Paused</h1><h2>' + game.fighters[0].ch.name + " vs " + game.fighters[1].ch.name + "</h2>" +
      '<button class="mi" id="resume">Resume</button>' +
      '<button class="mi ghost" id="restart">Restart match</button>' +
      '<button class="mi ghost" id="quit">Quit to menu</button>');
    bind("#resume", togglePause);
    bind("#restart", startOfflineMatch);
    bind("#quit", sceneTitle);
  } else closePanel();
}

/* ---- attract screen ------------------------------------------------------- */
function renderTitle(){
  const st = stageFor("neon");
  const camX = (titleFrame * 0.22) % (STAGE_W - W);
  sctx.fillStyle = "#05060f"; sctx.fillRect(0, 0, W, H);
  sctx.drawImage(st.far,  Math.round(-camX * 0.25), 0);
  sctx.drawImage(st.near, Math.round(-camX * 0.55), 0);
  sctx.drawImage(st.floor, Math.round(-camX), GROUND_Y - 2);
  const spots = [[58, 1], [W - 58, -1]];
  for (let i = 0; i < 2; i++){
    const ch = CHARACTERS[i === 0 ? 0 : 1];
    const pose = animPose(ANIM.idle, titleFrame + i * 13);
    const spr = getSprite(ch, pose, spots[i][1], null);
    sctx.fillStyle = "rgba(0,0,0,.34)";
    sctx.fillRect(spots[i][0] - 15, GROUND_Y - 2, 30, 4);
    sctx.drawImage(spr, spots[i][0] - SPRITE_OX, GROUND_Y - SPRITE_OY);
  }
  sctx.fillStyle = "rgba(5,6,15,.55)"; sctx.fillRect(0, 0, W, H);
  drawTextC(sctx, "IRON CIRCUIT", W/2 + 2, 26, "#3a1020", 3, 3);
  drawTextC(sctx, "IRON CIRCUIT", W/2, 24, "#ffcc33", 3, 3);
  if (((titleFrame >> 5) & 1) === 0)
    drawTextC(sctx, "INSERT NOTHING - PLAY FREE", W/2, H - 22, "#8b88a3", 1, 1);
}

/* ---- main loop ------------------------------------------------------------ */
let acc = 0, last = performance.now();

function tick(){
  titleFrame++;
  if (scene !== "match" || !game || paused) return;

  if (mode === "net"){
    if (Net.state !== "playing") return;
    const local = cleanMask(Input.read(KEYMAP_SOLO) | Pad.readAny() | Touch.read());
    const pair = Net.exchange(local, game);
    if (!pair){ netStalled++; return; }
    netStalled = 0;
    game.step(pair);
  } else if (mode === "local"){
    /* Two players share the keyboard; a pad each takes precedence if present. */
    const i0 = cleanMask(Input.read(KEYMAP_P1) | Pad.read(0) | Touch.read());
    const i1 = cleanMask(Input.read(KEYMAP_P2) | Pad.read(1));
    game.step([i0, i1]);
  } else {
    const i0 = cleanMask(Input.read(KEYMAP_SOLO) | Pad.readAny() | Touch.read());
    const i1 = ai.think(game.fighters[1], game.fighters[0], game);
    game.step([i0, i1]);
  }
  if (game.phase === PH.MATCHEND && game.phaseTimer > 140) showResults();
}

let touchShown = null;
function draw(){
  /* The on-screen pad covers the whole frame, so it may only be up while a
     match is actually running — otherwise it would swallow menu taps. */
  const playing = scene === "match" && !paused;
  if (playing !== touchShown){
    touchShown = playing;
    document.body.classList.toggle("playing", playing);
    if (!playing){ Touch.pointers.clear(); Touch.recompute(); }
  }
  if ((scene === "match" || scene === "results") && game){
    render(game);
    if (mode === "net" && netStalled > 30){
      const msg = netStalled > 600 ? "OPPONENT NOT RESPONDING" : "WAITING FOR OPPONENT";
      sctx.fillStyle = "rgba(5,6,15,.72)"; sctx.fillRect(0, H/2 - 16, W, 32);
      drawTextC(sctx, msg, W/2, H/2 - 4, "#ffcc33", 1, 1);
    }
    if (mode === "net" && Net.desync){
      sctx.fillStyle = "rgba(120,10,20,.8)"; sctx.fillRect(0, 4, W, 12);
      drawTextC(sctx, "DESYNC - RESULT UNRELIABLE", W/2, 6, "#fff", 1, 1);
    }
  } else {
    renderTitle();
  }
}

function frame(now){
  requestAnimationFrame(frame);
  let dt = now - last; last = now;
  if (dt > 250) dt = 250;
  acc += dt;
  let steps = 0;
  while (acc >= TICK_MS && steps < 6){ acc -= TICK_MS; steps++; tick(); }
  draw();
}

/* ---- fit the canvas to the window ---------------------------------------- */
function fit(){
  const wrap = document.getElementById("wrap");
  const aw = wrap.clientWidth - 12;
  /* In portrait the on-screen controls sit below the screen rather than over
     it, so the canvas only gets the top half. */
  const portrait = wrap.clientHeight > wrap.clientWidth;
  const ah = (Touch.active && portrait ? wrap.clientHeight * 0.52 : wrap.clientHeight) - 12;
  let s = Math.min(aw / W, ah / H);
  s = Touch.active
    ? Math.max(0.4, Math.round(s * 20) / 20)                    /* fill a small screen */
    : (s >= 1 ? Math.floor(s) : Math.max(0.4, Math.floor(s * 20) / 20));  /* stay crisp */
  screen.style.width  = Math.round(W * s) + "px";
  screen.style.height = Math.round(H * s) + "px";
}

/* ---- boot ----------------------------------------------------------------- */
Settings.load();
rebuildMaps();
sel.p1 = Settings.p1; sel.p2 = Settings.p2; sel.diff = Settings.diff;
Input.init();
Touch.init();
Touch.apply();
Sfx.muted = Settings.muted;
addEventListener("resize", () => { Touch.apply(); fit(); });
addEventListener("orientationchange", () => setTimeout(() => { Touch.apply(); fit(); }, 120));
addEventListener("gamepadconnected", () => { if (scene === "settings") sceneSettings(); });
addEventListener("keydown", e => {
  if (e.target && (e.target.tagName === "INPUT")) return;
  if (Input.capturing) return;
  if (e.code === "Escape") togglePause();
  if (e.code === "KeyM"){
    const m = Sfx.toggleMute();
    Settings.muted = m; Settings.save();
    const l = document.getElementById("muteLbl");
    if (l) l.textContent = m ? "Sound off" : "Sound on";
  }
});
Net.onRematch = () => { rematchThem = true; tryRematch(); };
fit();
sceneTitle();
requestAnimationFrame(frame);
