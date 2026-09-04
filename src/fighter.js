/* ============================================================================
   MOVE REGISTRY
   ----------------------------------------------------------------------------
   Every move gets a stable numeric id so the desync checksum can include
   "which move is this fighter doing" without hashing object references.
   Both peers build the registry in the same order, so the ids agree.
   ========================================================================== */

const ALL_MOVES = [];
function registerMove(m){ m.num = ALL_MOVES.length + 1; ALL_MOVES.push(m); return m; }
for (const k in NORMALS) registerMove(NORMALS[k]);
const BUTTON_LIST = [IN_LP, IN_MP, IN_HP, IN_LK, IN_MK, IN_HK];
for (const ch of CHARACTERS){
  ch.spMoves = {};
  for (const s of ch.specials){
    ch.spMoves[s.key] = {};
    for (const b of BUTTON_LIST) ch.spMoves[s.key][b] = registerMove(s.make(b));
  }
  ch.superMove = registerMove(ch.super.make());
}

/* ============================================================================
   FIGHTER
   ========================================================================== */

const S = { IDLE:0, WALKF:1, WALKB:2, CROUCH:3, JUMP:4, LAND:5, ATTACK:6,
            HITSTUN:7, BLOCKSTUN:8, KNOCKDOWN:9, GETUP:10, THROWN:11,
            WIN:12, INTRO:13, DEFEAT:14 };

function animPose(anim, frame){
  const fr = anim.frames;
  let total = 0;
  for (const x of fr) total += x[1];
  if (total <= 0) return fr[0][0];
  let t = anim.loop ? (frame % total) : Math.min(frame, total - 1);
  for (const x of fr){ if (t < x[1]) return x[0]; t -= x[1]; }
  return fr[fr.length - 1][0];
}
const boxOverlap = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

class Fighter {
  constructor(ch, id){
    this.ch = ch; this.id = id;
    this.maxHp = ch.hp;
    this.mb = new MotionBuffer();
    this.wins = 0;
    this.reset(0, 1, true);
  }
  reset(x, facing, full){
    this.x = x * FP; this.y = 0; this.vx = 0; this.vy = 0;
    this.facing = facing;
    if (full){ this.hp = this.maxHp; this.meter = 0; }
    this.state = S.INTRO; this.stateFrame = 0;
    this.anim = ANIM.intro; this.animFrame = 0;
    this.move = null; this.moveId = 0;
    this.hitstun = 0; this.blockstun = 0; this.downTimer = 0;
    this.airborne = false; this.crouching = false; this.guarding = false;
    this.hitDone = new Set(); this.rehitTimer = 0; this.hitCount = 0;
    this.invuln = 0; this.flash = 0; this.comboHits = 0; this.comboTimer = 0;
    this.comboShow = 0; this.comboShowT = 0;
    this.prevIn = 0; this.curIn = 0; this.cancelOk = false;
    this.projCount = 0; this.throwVictim = null; this.jumpDir = 0;
    this.pressBuf = 0;
    this.mb.reset();
  }
  get scale(){ return this.ch.scale; }
  get pushHalf(){ return Math.round(17 * this.scale * FP); }
  get px(){ return this.x / FP; }          /* float, for rendering only */
  get py(){ return this.y / FP; }

  pose(){
    if (this.state === S.ATTACK && this.move) return animPose(this.move.anim, this.stateFrame);
    return animPose(this.anim, this.animFrame);
  }
  setAnim(a){ if (this.anim !== a){ this.anim = a; this.animFrame = 0; } }
  setState(st, anim){
    this.state = st; this.stateFrame = 0;
    if (anim) this.setAnim(anim);
  }

  /* Hurtboxes follow the pose, so crouching really does duck under a high
     attack and a jumping fighter really is a smaller target. Extended limbs
     are deliberately not vulnerable — it keeps trades readable. */
  hurtBoxes(){
    const p = this.pose(), sc = this.scale, fx = this.facing;
    const wx = this.px, wy = GROUND_Y - this.py;
    const at = (j) => ({ x: wx + fx * p[j][0] * sc, y: wy + p[j][1] * sc });
    const hd = at("hd"), nk = at("nk"), pv = at("pv");
    const hw = 9 * sc, tw = 11 * sc, lw = 12 * sc;
    const top = Math.min(nk.y, pv.y), bot = Math.max(nk.y, pv.y);
    return [
      { x: hd.x - hw, y: hd.y - 9*sc, w: hw*2, h: 18*sc },
      { x: Math.min(nk.x, pv.x) - tw, y: top, w: Math.abs(nk.x-pv.x) + tw*2, h: bot - top + 2 },
      { x: pv.x - lw, y: pv.y, w: lw*2, h: (wy - pv.y) + 1 }
    ];
  }
  hitBox(){
    const m = this.move;
    if (!m || !m.hit) return null;
    const f = this.stateFrame;
    if (f < m.startup || f >= m.startup + m.active) return null;
    if (this.hitCount >= m.maxHits) return null;
    const sc = this.scale, wx = this.px, wy = GROUND_Y - this.py;
    const h = m.hit;
    const x = this.facing > 0 ? wx + h.x * sc : wx - (h.x + h.w) * sc;
    return { x, y: wy + h.y * sc, w: h.w * sc, h: h.h * sc };
  }
  isInvulnerable(){
    if (this.invuln > 0) return true;
    if (this.state === S.ATTACK && this.move && this.stateFrame < this.move.invuln) return true;
    return false;
  }
  canAct(){
    return this.state === S.IDLE || this.state === S.WALKF || this.state === S.WALKB ||
           this.state === S.CROUCH || this.state === S.JUMP;
  }
  addMeter(v){ this.meter = clamp(this.meter + v, 0, METER_MAX); }
}

/* --- move selection ------------------------------------------------------- */

function pickSpecial(f, pressed){
  const ch = f.ch;
  if (f.meter >= METER_MAX && ch.super.check(f.mb, pressed))
    return { move: ch.superMove, superMove: true };
  for (const s of ch.specials){
    if (!s.check(f.mb, pressed)) continue;
    const btn = BUTTON_LIST.find(b => pressed & b) || IN_LP;
    if (s.charge) f.mb.consumeCharge(s.charge);
    return { move: ch.spMoves[s.key][btn], superMove: false };
  }
  return null;
}
function pickNormal(f, pressed){
  const stance = f.airborne ? "air" : f.crouching ? "crouch" : "stand";
  const table = NORMAL_TABLE[stance];
  for (const b of BUTTON_LIST) if (pressed & b){
    const key = table[b];
    if (key) return NORMALS[key];
  }
  return null;
}
function startMove(f, m, isSuper){
  f.move = m; f.moveId = m.num;
  f.setState(S.ATTACK, null);
  f.hitDone.clear(); f.hitCount = 0; f.rehitTimer = 0;
  f.cancelOk = false;
  if (isSuper) f.meter = 0;
}
