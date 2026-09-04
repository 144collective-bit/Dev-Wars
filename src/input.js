/* ============================================================================
   INPUT
   ========================================================================== */

/* --- Bindings and saved preferences ---------------------------------------
   Every input source — keyboard, gamepad, on-screen pad — is reduced to the
   same bitmask, so the game itself never learns which one you used.        */

const ACTIONS = [
  ["up",   "Up / jump",     IN_UP],
  ["down", "Down / crouch", IN_DOWN],
  ["left", "Left",          IN_LEFT],
  ["right","Right",         IN_RIGHT],
  ["lp",   "Light punch",   IN_LP],
  ["mp",   "Medium punch",  IN_MP],
  ["hp",   "Heavy punch",   IN_HP],
  ["lk",   "Light kick",    IN_LK],
  ["mk",   "Medium kick",   IN_MK],
  ["hk",   "Heavy kick",    IN_HK]
];
const DEFAULT_BINDS = {
  p1: { up:"KeyW", down:"KeyS", left:"KeyA", right:"KeyD",
        lp:"KeyT", mp:"KeyY", hp:"KeyU", lk:"KeyG", mk:"KeyH", hk:"KeyJ" },
  p2: { up:"ArrowUp", down:"ArrowDown", left:"ArrowLeft", right:"ArrowRight",
        lp:"KeyI", mp:"KeyO", hp:"KeyP", lk:"KeyK", mk:"KeyL", hk:"Semicolon" }
};

/* Preferences live in localStorage, which throws outright in some privacy
   modes — so every access is guarded and the game runs fine without it. */
const STORE_KEY = "ironcircuit.settings.v1";
const Settings = {
  binds: JSON.parse(JSON.stringify(DEFAULT_BINDS)),
  muted:false, diff:"normal", p1:"kestrel", p2:"brick", touchMode:"auto",
  load(){
    let raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch(e){ return; }
    if (!raw) return;
    let o; try { o = JSON.parse(raw); } catch(e){ return; }
    if (!o || typeof o !== "object") return;
    for (const side of ["p1","p2"])
      if (o.binds && o.binds[side])
        for (const [act] of ACTIONS)
          if (typeof o.binds[side][act] === "string") this.binds[side][act] = o.binds[side][act];
    if (typeof o.muted === "boolean") this.muted = o.muted;
    if (["easy","normal","hard"].includes(o.diff)) this.diff = o.diff;
    if (typeof o.p1 === "string" && CHAR_KEYS.includes(o.p1)) this.p1 = o.p1;
    if (typeof o.p2 === "string" && CHAR_KEYS.includes(o.p2)) this.p2 = o.p2;
    if (["auto","on","off"].includes(o.touchMode)) this.touchMode = o.touchMode;
  },
  save(){
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        binds:this.binds, muted:this.muted, diff:this.diff,
        p1:this.p1, p2:this.p2, touchMode:this.touchMode
      }));
    } catch(e){ /* storage unavailable or full — preferences just won't stick */ }
  },
  resetBinds(){ this.binds = JSON.parse(JSON.stringify(DEFAULT_BINDS)); rebuildMaps(); this.save(); }
};

let KEYMAP_P1 = {}, KEYMAP_P2 = {}, KEYMAP_SOLO = {};
function rebuildMaps(){
  KEYMAP_P1 = {}; KEYMAP_P2 = {};
  for (const [act,, bit] of ACTIONS){
    const a = Settings.binds.p1[act], b = Settings.binds.p2[act];
    if (a) KEYMAP_P1[a] = bit;
    if (b) KEYMAP_P2[b] = bit;
  }
  /* In one-local-player modes we accept either layout, so nobody has to learn
     the "wrong" side of the keyboard. */
  KEYMAP_SOLO = Object.assign({}, KEYMAP_P1, KEYMAP_P2, {
    Numpad4:IN_LEFT, Numpad6:IN_RIGHT, Numpad8:IN_UP, Numpad2:IN_DOWN
  });
}
/* Which player, if any, already uses this key. */
function bindConflict(code, side, action){
  for (const s of ["p1","p2"])
    for (const [act] of ACTIONS)
      if (Settings.binds[s][act] === code && !(s === side && act === action)) return { side:s, act };
  return null;
}
const KEY_LABELS = { Semicolon:";", Comma:",", Period:".", Slash:"/", Quote:"'",
  BracketLeft:"[", BracketRight:"]", Backslash:"\\", Minus:"-", Equal:"=", Backquote:"`",
  Space:"SPACE", ShiftLeft:"L SHIFT", ShiftRight:"R SHIFT", ControlLeft:"L CTRL",
  ControlRight:"R CTRL", AltLeft:"L ALT", AltRight:"R ALT", Enter:"ENTER", Backspace:"BKSP" };
function keyLabel(code){
  if (!code) return "—";
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  return code.replace(/^Key|^Digit/, "").replace(/^Arrow/, "").replace(/^Numpad/, "NUM ").toUpperCase();
}

const Input = {
  down: Object.create(null),
  capturing: false,      /* true while the settings screen is grabbing a key */
  swallow: new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","Tab"]),
  init(){
    addEventListener("keydown", e => {
      if (e.repeat || this.capturing) return;
      this.down[e.code] = true;
      if (this.swallow.has(e.code)) e.preventDefault();
      Sfx.unlock();
    });
    addEventListener("keyup", e => { this.down[e.code] = false; });
    addEventListener("blur", () => { this.down = Object.create(null); });
  },
  read(map){
    let m = 0;
    for (const code in map) if (this.down[code]) m |= map[code];
    return m;
  },
  isDown(code){ return !!this.down[code]; }
};

/* Opposite directions cancel, so a stuck key, a drifting stick and a thumb
   sliding across the pad can never wedge a fighter. Applied once, after all
   the input sources for a player have been merged. */
function cleanMask(m){
  if ((m & IN_LEFT) && (m & IN_RIGHT)) m &= ~(IN_LEFT|IN_RIGHT);
  if ((m & IN_UP)   && (m & IN_DOWN))  m &= ~IN_UP;
  return m;
}

/* --- Gamepads --------------------------------------------------------------
   Standard-mapping layout, arranged the way a fight pad usually is: the face
   buttons are the light and medium attacks, the shoulders the heavies.     */
const PAD_DEADZONE = 0.45;
const Pad = {
  connected(){
    const gp = navigator.getGamepads ? navigator.getGamepads() : [];
    let n = 0;
    for (const g of gp) if (g) n++;
    return n;
  },
  readOne(g){
    if (!g) return 0;
    let m = 0;
    const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
    if (ax < -PAD_DEADZONE) m |= IN_LEFT; else if (ax > PAD_DEADZONE) m |= IN_RIGHT;
    if (ay < -PAD_DEADZONE) m |= IN_UP;   else if (ay > PAD_DEADZONE) m |= IN_DOWN;
    const b = i => !!(g.buttons[i] && g.buttons[i].pressed);
    if (b(12)) m |= IN_UP;   if (b(13)) m |= IN_DOWN;
    if (b(14)) m |= IN_LEFT; if (b(15)) m |= IN_RIGHT;
    if (b(2)) m |= IN_LP;  if (b(3)) m |= IN_MP;  if (b(5) || b(4)) m |= IN_HP;
    if (b(0)) m |= IN_LK;  if (b(1)) m |= IN_MK;  if (b(7) || b(6)) m |= IN_HK;
    return m;
  },
  /* nth connected pad, so unplugging one does not shuffle the others */
  read(slot){
    const gp = navigator.getGamepads ? navigator.getGamepads() : [];
    let i = 0;
    for (const g of gp){ if (!g) continue; if (i++ === slot) return this.readOne(g); }
    return 0;
  },
  readAny(){
    const gp = navigator.getGamepads ? navigator.getGamepads() : [];
    let m = 0;
    for (const g of gp) if (g) m |= this.readOne(g);
    return m;
  }
};

/* --- On-screen controls ----------------------------------------------------
   A round pad rather than four arrow buttons: a quarter-circle is a thumb
   sweep, which is the only way special moves are playable on glass. Multiple
   pointers are tracked at once so you can hold a direction and press.      */
const Touch = {
  active:false, mask:0, pointers:new Map(), root:null, pad:null, nub:null, btns:[],
  init(){
    this.root = document.getElementById("touch");
    if (!this.root) return;
    this.root.innerHTML =
      '<div id="tpad"><div id="tnub"></div></div>' +
      '<div id="tbtns">' +
        '<div class="tbtn p" data-bit="' + IN_LP + '">LP</div>' +
        '<div class="tbtn p" data-bit="' + IN_MP + '">MP</div>' +
        '<div class="tbtn p" data-bit="' + IN_HP + '">HP</div>' +
        '<div class="tbtn k" data-bit="' + IN_LK + '">LK</div>' +
        '<div class="tbtn k" data-bit="' + IN_MK + '">MK</div>' +
        '<div class="tbtn k" data-bit="' + IN_HK + '">HK</div>' +
      '</div>' +
      '<div id="thint">Rotate for a bigger screen</div>' +
      '<div id="tpause">II</div>';
    this.pad  = this.root.querySelector("#tpad");
    this.nub  = this.root.querySelector("#tnub");
    this.btns = Array.from(this.root.querySelectorAll(".tbtn"));
    const pause = this.root.querySelector("#tpause");

    const onDown = e => {
      if (e.target === pause){ e.preventDefault(); Sfx.unlock(); togglePause(); return; }
      Sfx.unlock();
      e.preventDefault();
      this.pointers.set(e.pointerId, 0);
      this.track(e);
    };
    const onMove = e => { if (this.pointers.has(e.pointerId)){ e.preventDefault(); this.track(e); } };
    const onUp = e => {
      if (!this.pointers.has(e.pointerId)) return;
      e.preventDefault();
      this.pointers.delete(e.pointerId);
      this.recompute();
    };
    this.root.addEventListener("pointerdown", onDown, { passive:false });
    this.root.addEventListener("pointermove", onMove, { passive:false });
    this.root.addEventListener("pointerup", onUp, { passive:false });
    this.root.addEventListener("pointercancel", onUp, { passive:false });
    this.root.addEventListener("contextmenu", e => e.preventDefault());
  },
  track(e){
    let bits = 0;
    const pr = this.pad.getBoundingClientRect();
    const cx = pr.left + pr.width/2, cy = pr.top + pr.height/2;
    const dx = e.clientX - cx, dy = e.clientY - cy;
    const r = Math.hypot(dx, dy);
    /* Generous catch radius: the thumb wanders off the drawn circle. */
    if (r < pr.width * 0.95){
      if (r > pr.width * 0.16){
        const oct = ((Math.round(Math.atan2(-dy, dx) / (Math.PI/4)) % 8) + 8) % 8;
        bits |= [IN_RIGHT, IN_RIGHT|IN_UP, IN_UP, IN_UP|IN_LEFT,
                 IN_LEFT, IN_LEFT|IN_DOWN, IN_DOWN, IN_DOWN|IN_RIGHT][oct];
      }
    } else {
      for (const b of this.btns){
        const br = b.getBoundingClientRect();
        const bx = br.left + br.width/2, by = br.top + br.height/2;
        if (Math.hypot(e.clientX - bx, e.clientY - by) < br.width * 0.72)
          bits |= parseInt(b.dataset.bit, 10);
      }
    }
    this.pointers.set(e.pointerId, bits);
    this.recompute();
  },
  recompute(){
    let m = 0;
    for (const bits of this.pointers.values()) m |= bits;
    this.mask = m;
    for (const b of this.btns) b.classList.toggle("on", !!(m & parseInt(b.dataset.bit, 10)));
    if (this.nub){
      const dx = (m & IN_LEFT) ? -1 : (m & IN_RIGHT) ? 1 : 0;
      const dy = (m & IN_UP)   ? -1 : (m & IN_DOWN)  ? 1 : 0;
      this.nub.style.transform = "translate(" + (dx*52) + "%," + (dy*52) + "%)";
    }
  },
  read(){ return this.mask; },
  apply(){
    const want = Settings.touchMode === "on" ? true
               : Settings.touchMode === "off" ? false
               : (matchMedia("(pointer: coarse)").matches || "ontouchstart" in window);
    this.active = want;
    document.body.classList.toggle("touch", want);
    if (!want){ this.pointers.clear(); this.mask = 0; }
    if (typeof fit === "function") fit();
  }
};

/* --- Motion inputs --------------------------------------------------------
   Directions are reduced to numpad notation relative to the fighter's facing
   (6 is always "toward the opponent"). A rolling history of the last frames
   lets us recognise quarter-circles, dragon-punch motions and charges the way
   the arcade games do — leniently, and without demanding exact frames.      */

function numpadDir(mask, facing){
  const fwd = facing > 0 ? IN_RIGHT : IN_LEFT;
  const bck = facing > 0 ? IN_LEFT  : IN_RIGHT;
  let h = (mask & fwd) ? 1 : (mask & bck) ? -1 : 0;
  let v = (mask & IN_UP) ? 1 : (mask & IN_DOWN) ? -1 : 0;
  return 5 + h + v * 3;   /* 1..9, 5 = neutral */
}

const MOTION_WINDOW = 14;    /* frames a motion may span */
const CHARGE_FRAMES = 42;    /* frames a charge must be held */

class MotionBuffer {
  constructor(){ this.dirs = []; this.chargeBack = 0; this.chargeDown = 0; this.releasedBack = 99; this.releasedDown = 99; }
  push(dir){
    this.dirs.push(dir);
    if (this.dirs.length > 40) this.dirs.shift();
    /* Charge tracking: holding back/down-back builds a horizontal charge,
       holding any down builds a vertical one. */
    if (dir === 4 || dir === 1 || dir === 7) this.chargeBack++;
    else { if (this.chargeBack >= CHARGE_FRAMES) this.releasedBack = 0; this.chargeBack = 0; }
    if (dir === 2 || dir === 1 || dir === 3) this.chargeDown++;
    else { if (this.chargeDown >= CHARGE_FRAMES) this.releasedDown = 0; this.chargeDown = 0; }
    this.releasedBack++; this.releasedDown++;
  }
  /* Was this ordered sequence of directions walked through recently?
     Extra directions in between are tolerated; order is not. */
  has(seq){
    const n = this.dirs.length;
    const start = Math.max(0, n - MOTION_WINDOW);
    let si = 0;
    for (let i = start; i < n && si < seq.length; i++){
      if (seq[si].includes(this.dirs[i])) si++;
    }
    return si === seq.length;
  }
  qcf(){ return this.has([[2],[3],[6]]); }                 /* down, down-fwd, fwd */
  qcb(){ return this.has([[2],[1],[4]]); }                 /* down, down-back, back */
  dp(){  return this.has([[6],[2,3],[3]]); }               /* fwd, down, down-fwd */
  hcf(){ return this.has([[4],[1],[2],[3],[6]]); }         /* half circle forward */
  doubleQcf(){ return this.has([[2],[3],[6],[2],[3],[6]]); }
  chargedFwd(){ return this.releasedBack <= 11 && (this.dirs[this.dirs.length-1] === 6 || this.dirs[this.dirs.length-1] === 9 || this.dirs[this.dirs.length-1] === 3); }
  chargedUp(){  return this.releasedDown <= 11 && this.dirs[this.dirs.length-1] >= 7; }
  consumeCharge(kind){ if (kind === "back") this.releasedBack = 99; else this.releasedDown = 99; }
  reset(){ this.dirs.length = 0; }
}
