/* ============================================================================
   THE SIMULATION
   ----------------------------------------------------------------------------
   One `step()` is exactly one 60Hz frame and touches only integers, so two
   machines running the same inputs produce byte-identical state. Anything
   cosmetic (camera, sparks, screen shake) is derived here too, but is never
   allowed to feed back into the numbers the checksum covers.
   ========================================================================== */

const PH = { INTRO:0, FIGHT:1, KO:2, ROUNDEND:3, MATCHEND:4 };
const ROUND_FRAMES = 99 * 60;
const WINS_NEEDED   = 2;

class Game {
  constructor(charKeys, seed){
    this.seed = seed >>> 0;
    this.rng = makeRNG(this.seed);
    this.fighters = [ new Fighter(CHAR_BY_KEY[charKeys[0]], 0),
                      new Fighter(CHAR_BY_KEY[charKeys[1]], 1) ];
    this.stage = this.fighters[0].ch.stageKey;
    this.round = 1; this.matchOver = false; this.matchWinner = -1;
    this.frame = 0;
    this.effects = []; this.projectiles = [];
    this.camX = (STAGE_W - W) / 2; this.shake = 0;
    this.announce = ""; this.announceT = 0;
    this.startRound(true);
  }
  startRound(full){
    const mid = STAGE_W / 2;
    this.fighters[0].reset(mid - 52, 1, full);
    this.fighters[1].reset(mid + 52, -1, full);
    if (!full) for (const f of this.fighters) f.hp = f.maxHp;   /* meter carries over */
    this.projectiles.length = 0; this.effects.length = 0;
    this.timer = ROUND_FRAMES;
    this.phase = PH.INTRO; this.phaseTimer = 0;
    this.hitstop = 0; this.koSide = -1;
    this.setAnnounce("ROUND " + this.round, 70);
  }
  setAnnounce(t, dur){ this.announce = t; this.announceT = dur; }
  fx(type, x, y, extra){
    const e = Object.assign({ type, x, y, t:0, life:14 }, extra||{});
    this.effects.push(e);
    if (this.effects.length > 60) this.effects.shift();
  }

  /* ---------------------------------------------------------------- step -- */
  step(inputs){
    this.frame++;
    if (this.announceT > 0) this.announceT--;
    if (this.shake > 0) this.shake--;

    if (this.hitstop > 0){
      this.hitstop--;
      /* Freeze frames stop the action, not the controller. Inputs made during
         hitstop are still read and buffered, which is exactly how you confirm
         a hit and cancel the normal into a special. */
      for (let i = 0; i < 2; i++) this.bufferInput(this.fighters[i], inputs[i]|0);
      this.updateEffects();
      this.updateCamera();
      return;
    }

    if (this.phase === PH.INTRO){
      this.phaseTimer++;
      if (this.phaseTimer === 72) this.setAnnounce("FIGHT!", 46);
      if (this.phaseTimer >= 100){
        this.phase = PH.FIGHT;
        for (const f of this.fighters) f.setState(S.IDLE, ANIM.idle);
      }
      for (const f of this.fighters){ f.animFrame++; }
      this.updateCamera();
      return;
    }

    if (this.phase === PH.FIGHT){
      for (let i = 0; i < 2; i++)
        this.updateFighter(this.fighters[i], this.fighters[1-i], inputs[i]|0);
      this.physics();
      this.separate();
      this.updateProjectiles();
      this.detectHits();
      this.checkKO();
      for (const f of this.fighters){ f.stateFrame++; f.animFrame++; if (f.invuln > 0) f.invuln--; if (f.flash > 0) f.flash--;
        if (f.comboTimer > 0){ f.comboTimer--; if (f.comboTimer === 0) f.comboHits = 0; }
        if (f.comboShowT > 0) f.comboShowT--; }
      this.timer--;
      this.checkRoundEnd();
    }
    else if (this.phase === PH.KO || this.phase === PH.ROUNDEND || this.phase === PH.MATCHEND){
      this.phaseTimer++;
      for (let i = 0; i < 2; i++) this.updateFighter(this.fighters[i], this.fighters[1-i], 0);
      this.physics();
      this.separate();
      this.updateProjectiles();
      for (const f of this.fighters){ f.stateFrame++; f.animFrame++; if (f.flash > 0) f.flash--; }
      if (this.phase === PH.KO && this.phaseTimer > 96) this.finishRound();
      if (this.phase === PH.ROUNDEND && this.phaseTimer > 150) this.startRound(false);
    }
    this.updateEffects();
    this.updateCamera();
  }

  /* ------------------------------------------------------------- fighters -- */
  /* Read a frame of input without advancing the game: used during hitstop. */
  bufferInput(f, input){
    f.prevIn = f.curIn; f.curIn = input;
    f.pressBuf |= (input & ~f.prevIn) & BUTTONS;
    f.mb.push(numpadDir(input, f.facing));
  }
  updateFighter(f, opp, input){
    f.prevIn = f.curIn; f.curIn = input;
    const pressed = (input & ~f.prevIn) | f.pressBuf;
    f.pressBuf = 0;

    /* Face the opponent whenever you are free to move — never mid-move. */
    if (!f.airborne && f.canAct() && f.px !== opp.px)
      f.facing = opp.px > f.px ? 1 : -1;
    f.mb.push(numpadDir(input, f.facing));

    switch (f.state){
      case S.HITSTUN:
        if (--f.hitstun <= 0 && !f.airborne) f.setState(S.IDLE, ANIM.idle);
        break;
      case S.BLOCKSTUN:
        if (--f.blockstun <= 0) f.setState(S.IDLE, ANIM.idle);
        break;
      case S.KNOCKDOWN:
        if (!f.airborne){
          if (--f.downTimer <= 0){ f.setState(S.GETUP, ANIM.getup); f.invuln = 16; }
        }
        break;
      case S.GETUP:
        if (f.stateFrame >= 14) f.setState(S.IDLE, ANIM.idle);
        break;
      case S.THROWN:
        if (f.stateFrame >= 18){ f.setState(S.KNOCKDOWN, ANIM.fall); f.downTimer = 30; f.airborne = false; }
        break;
      case S.LAND:
        if (f.stateFrame >= 4) f.setState(S.IDLE, ANIM.idle);
        break;
      case S.WIN: case S.DEFEAT: case S.INTRO:
        break;
      case S.ATTACK:
        this.advanceAttack(f, opp, input, pressed);
        break;
      default:
        this.freeActions(f, opp, input, pressed);
    }
  }

  freeActions(f, opp, input, pressed){
    const fwd  = f.facing > 0 ? IN_RIGHT : IN_LEFT;
    const back = f.facing > 0 ? IN_LEFT  : IN_RIGHT;
    f.crouching = !f.airborne && !!(input & IN_DOWN);
    f.guarding  = !f.airborne && !!(input & back);

    if (pressed & BUTTONS){
      /* Throw: light punch and light kick together, in range, on the floor. */
      const lightPair = (pressed & (IN_LP|IN_LK)) && (input & IN_LP) && (input & IN_LK);
      if (lightPair && !f.airborne && !f.crouching &&
          Math.abs(f.px - opp.px) < 46 * f.scale && !opp.airborne){
        startMove(f, NORMALS.throwAttempt, false);
        return;
      }
      const spec = pickSpecial(f, pressed);
      if (spec){ startMove(f, spec.move, spec.superMove); Sfx.play(spec.superMove ? "super" : "whiff"); return; }
      const nrm = pickNormal(f, pressed);
      if (nrm){ startMove(f, nrm, false); Sfx.play("whiff"); return; }
    }

    if (f.airborne){ f.setAnim(f.vy > 0 ? ANIM.jumpRise : ANIM.jumpFall); return; }

    if (input & IN_UP){
      const dir = (input & fwd) ? 1 : (input & back) ? -1 : 0;
      f.vy = f.ch.jumpV;
      f.vx = dir * f.facing * f.ch.jumpX;
      f.airborne = true; f.jumpDir = dir;
      f.setState(S.JUMP, ANIM.jumpRise);
      Sfx.play("jump");
      this.fx("dust", f.px, GROUND_Y, { life: 12 });
      return;
    }
    if (input & IN_DOWN){ f.vx = 0; f.setState(S.CROUCH, ANIM.crouch); return; }
    if (input & fwd){ f.vx = f.facing * f.ch.walkF; if (f.state !== S.WALKF) f.setState(S.WALKF, ANIM.walkF); return; }
    if (input & back){ f.vx = -f.facing * f.ch.walkB; if (f.state !== S.WALKB) f.setState(S.WALKB, ANIM.walkB); return; }
    f.vx = 0;
    if (f.state !== S.IDLE) f.setState(S.IDLE, ANIM.idle);
  }

  advanceAttack(f, opp, input, pressed){
    const m = f.move;
    if (!m){ f.setState(S.IDLE, ANIM.idle); return; }

    if (f.rehitTimer > 0){
      f.rehitTimer--;
      if (f.rehitTimer === 0 && f.hitCount < m.maxHits) f.hitDone.clear();
    }
    /* Impulses and projectiles fire on the first active frame. */
    if (f.stateFrame === m.startup){
      if (m.moveY){ f.vy = m.moveY; f.airborne = true; }
      if (m.moveX) f.vx = f.facing * m.moveX;
      if (m.proj) this.spawnProjectile(f, m);
    }
    /* Cancel a connected normal into a special or super, the way chains work
       in the arcade games: only after it touched something. */
    if (f.cancelOk && m.cancelable && (pressed & BUTTONS) && f.stateFrame >= m.startup){
      const spec = pickSpecial(f, pressed);
      if (spec){ startMove(f, spec.move, spec.superMove); Sfx.play(spec.superMove ? "super" : "whiff"); return; }
    }
    if (f.stateFrame >= m.total){
      f.move = null; f.moveId = 0;
      if (f.airborne) f.setState(S.JUMP, ANIM.jumpFall);
      else f.setState(S.IDLE, ANIM.idle);
    }
  }

  /* -------------------------------------------------------------- physics -- */
  physics(){
    for (const f of this.fighters){
      if (f.airborne){
        f.vy -= GRAVITY;
        f.y += f.vy;
        if (f.y <= 0){
          f.y = 0; f.vy = 0; f.airborne = false;
          this.onLand(f);
        }
      } else {
        f.y = 0;
        /* ground friction: walking overwrites vx anyway, so this only decays
           knockback and the momentum of rushing specials */
        if (f.state !== S.WALKF && f.state !== S.WALKB){
          if (f.vx > 0) f.vx = Math.max(0, f.vx - 46);
          else if (f.vx < 0) f.vx = Math.min(0, f.vx + 46);
        }
      }
      f.x += f.vx;
      const half = f.pushHalf;
      if (f.x < half){ f.x = half; if (f.vx < 0) f.vx = 0; }
      if (f.x > STAGE_W*FP - half){ f.x = STAGE_W*FP - half; if (f.vx > 0) f.vx = 0; }
    }
  }
  onLand(f){
    this.fx("dust", f.px, GROUND_Y, { life: 12 });
    if (f.state === S.HITSTUN || f.state === S.KNOCKDOWN){
      f.setState(S.KNOCKDOWN, ANIM.down);
      f.downTimer = 30; f.vx = 0;
      Sfx.play("thud"); this.shake = Math.max(this.shake, 6);
    } else if (f.state === S.ATTACK){
      f.move = null; f.moveId = 0;
      f.setState(S.LAND, ANIM.land);
    } else {
      f.setState(S.LAND, ANIM.land);
      Sfx.play("land");
    }
  }
  separate(){
    const [a, b] = this.fighters;
    if (a.state === S.KNOCKDOWN || b.state === S.KNOCKDOWN) return;
    const minD = a.pushHalf + b.pushHalf;
    let d = b.x - a.x;
    const s = d >= 0 ? 1 : -1;
    if (Math.abs(d) >= minD) return;
    const push = minD - Math.abs(d);
    const halfPush = (push >> 1) + 1;
    a.x -= s * halfPush; b.x += s * halfPush;
    for (const f of this.fighters){
      const half = f.pushHalf;
      if (f.x < half) f.x = half;
      if (f.x > STAGE_W*FP - half) f.x = STAGE_W*FP - half;
    }
    /* If one fighter is jammed into a wall, the other eats the whole push. */
    let d2 = b.x - a.x;
    if (Math.abs(d2) < minD){
      const short = minD - Math.abs(d2);
      if (a.x <= a.pushHalf) b.x += s * short;
      else if (b.x >= STAGE_W*FP - b.pushHalf) a.x -= s * short;
    }
  }
  updateCamera(){
    const [a, b] = this.fighters;
    const mid = (a.px + b.px) / 2;
    let target = clamp(mid - W/2, 0, STAGE_W - W);
    this.camX += (target - this.camX) * 0.18;
    if (Math.abs(this.camX - target) < 0.4) this.camX = target;
  }

  /* ---------------------------------------------------------- projectiles -- */
  spawnProjectile(f, m){
    const p = m.proj;
    const single = p.kind !== "tempest";
    if (single && f.projCount > 0) return;      /* one fireball at a time */
    if (single) f.projCount++;
    this.projectiles.push({
      owner: f.id, single, kind: p.kind, facing: f.facing,
      x: f.x + f.facing * Math.round(p.ox * f.scale) * FP,
      y: Math.round(-p.oy * f.scale) * FP,
      vx: f.facing * p.vx,
      w: p.w, h: p.h, dmg: p.dmg, chip: p.chip,
      hitstun: p.hitstun, blockstun: p.blockstun, pushHit: p.pushHit || 480,
      hits: p.hits || 1, hitDone: new Set(), rehit: 0, life: 240, t: 0
    });
    Sfx.play("fire");
  }
  projBox(pr){
    return { x: pr.x/FP - pr.w/2, y: GROUND_Y - pr.y/FP - pr.h/2, w: pr.w, h: pr.h };
  }
  killProjectile(pr, i){
    if (pr.single) this.fighters[pr.owner].projCount = Math.max(0, this.fighters[pr.owner].projCount - 1);
    this.projectiles.splice(i, 1);
  }
  updateProjectiles(){
    for (let i = this.projectiles.length - 1; i >= 0; i--){
      const pr = this.projectiles[i];
      pr.x += pr.vx; pr.t++;
      if (pr.rehit > 0 && --pr.rehit === 0) pr.hitDone.clear();
      const px = pr.x / FP;
      if (--pr.life <= 0 || px < -30 || px > STAGE_W + 30){ this.killProjectile(pr, i); continue; }
    }
    /* Opposing projectiles trade and both disappear — the classic fireball war. */
    for (let i = this.projectiles.length - 1; i >= 0; i--){
      for (let j = i - 1; j >= 0; j--){
        const a = this.projectiles[i], b = this.projectiles[j];
        if (!a || !b || a.owner === b.owner) continue;
        if (boxOverlap(this.projBox(a), this.projBox(b))){
          this.fx("spark", (a.x + b.x)/(2*FP), GROUND_Y - a.y/FP, { life: 14, big: true });
          Sfx.play("clash");
          this.killProjectile(a, i); this.killProjectile(b, j);
          break;
        }
      }
    }
  }

  /* --------------------------------------------------------------- combat -- */
  detectHits(){
    /* melee */
    for (let i = 0; i < 2; i++){
      const a = this.fighters[i], d = this.fighters[1-i];
      if (a.state !== S.ATTACK || !a.move) continue;
      const hb = a.hitBox();
      if (!hb || a.hitDone.has(d.id)) continue;
      if (d.isInvulnerable()) continue;
      if (this.overlapsFighter(hb, d)) this.resolveHit(a, d, a.move, null);
    }
    /* projectiles */
    for (let i = this.projectiles.length - 1; i >= 0; i--){
      const pr = this.projectiles[i];
      const d = this.fighters[1 - pr.owner];
      if (pr.hitDone.has(d.id) || d.isInvulnerable()) continue;
      if (this.overlapsFighter(this.projBox(pr), d)){
        const fake = { level:"mid", dmg:pr.dmg, chip:pr.chip, hitstun:pr.hitstun,
                       blockstun:pr.blockstun, pushHit:pr.pushHit, pushBlock:300,
                       launch:0, knockdown:false, type:"projectile",
                       meterHit:20, meterBlock:8, sfx:"hit" };
        this.resolveHit(this.fighters[pr.owner], d, fake, pr);
        pr.hitDone.add(d.id);
        if (--pr.hits <= 0) this.killProjectile(pr, i);
        else pr.rehit = 6;
      }
    }
  }
  overlapsFighter(box, f){
    for (const hb of f.hurtBoxes()) if (boxOverlap(box, hb)) return true;
    return false;
  }
  scaledDamage(base, comboHits){
    const scale = comboHits <= 1 ? 100 : comboHits === 2 ? 88 : comboHits === 3 ? 74 : comboHits === 4 ? 60 : 45;
    return Math.max(1, Math.floor(base * scale / 100));
  }
  resolveHit(a, d, m, pr){
    const dir = pr ? sign(pr.vx) : a.facing;
    const cx = (a.px + d.px) / 2;
    const cy = GROUND_Y - (d.py + 44 * d.scale);

    /* Throws ignore guard entirely, but cannot catch an airborne or downed
       opponent — the standard rule, and what makes them a read, not a mash. */
    if (m.level === "throw"){
      if (d.airborne || d.state === S.KNOCKDOWN || d.state === S.THROWN) return;
      a.hitDone.add(d.id); a.hitCount++;
      const dmg = this.scaledDamage(m.dmg, 1);
      d.hp = Math.max(0, d.hp - dmg);
      d.setState(S.THROWN, ANIM.fall);
      d.airborne = true; d.vy = 820; d.vx = -a.facing * 620;
      d.facing = -a.facing; d.flash = 6;
      d.comboHits = 0; a.comboShow = 0; a.comboShowT = 0;
      a.addMeter(m.meterHit); d.addMeter(14);
      this.hitstop = 12; this.shake = 8;
      this.fx("spark", cx, cy, { big:true, life:16 });
      Sfx.play("throw");
      return;
    }

    const canBlock =
      d.guarding && !d.airborne &&
      d.state !== S.ATTACK && d.state !== S.HITSTUN && d.state !== S.KNOCKDOWN &&
      (m.level === "mid" ||
       (m.level === "low"      &&  d.crouching) ||
       (m.level === "overhead" && !d.crouching));

    if (!pr){ a.hitDone.add(d.id); a.hitCount++; a.rehitTimer = m.rehit || 0; }
    a.cancelOk = true;

    if (canBlock){
      const chip = m.chip && (m.type === "special" || m.type === "super" || m.type === "projectile")
        ? Math.max(1, m.chip) : 0;
      if (chip) d.hp = Math.max(0, d.hp - chip);
      d.setState(S.BLOCKSTUN, d.crouching ? ANIM.blockLo : ANIM.blockHi);
      d.blockstun = m.blockstun;
      d.vx = -dir * (m.pushBlock || 320);
      a.vx = a.airborne ? a.vx : a.facing * -Math.round((m.pushBlock || 320) * 0.35);
      a.addMeter(m.meterBlock); d.addMeter(Math.round(m.meterBlock * 1.4));
      this.hitstop = 6;
      this.fx("guard", d.px + d.facing * 16, cy, { life: 12 });
      Sfx.play("block");
      return;
    }

    /* clean hit */
    d.comboTimer = 60;
    d.comboHits = Math.min(d.comboHits + 1, 9);
    a.comboShow = d.comboHits; a.comboShowT = 74;
    const dmg = this.scaledDamage(m.dmg, d.comboHits);
    d.hp = Math.max(0, d.hp - dmg);
    d.flash = 5;
    d.hitstun = m.hitstun;
    a.addMeter(m.meterHit); d.addMeter(Math.round(m.meterHit * 0.5));

    const heavy = m.dmg >= 15 || m.knockdown;
    this.hitstop = heavy ? 11 : 6;
    this.shake = Math.max(this.shake, heavy ? 6 : 3);

    if (m.knockdown || m.launch || d.airborne){
      d.setState(S.KNOCKDOWN, d.airborne ? ANIM.hitAir : ANIM.fall);
      d.airborne = true;
      d.vy = Math.max(m.launch || 0, 720);
      d.vx = -dir * (m.pushHit || 600);
    } else {
      const low = m.level === "low";
      d.setState(S.HITSTUN, low ? ANIM.hitLo : ANIM.hitHi);
      d.vx = -dir * (m.pushHit || 520);
    }
    this.fx("spark", cx, cy, { big: heavy, life: heavy ? 16 : 12 });
    Sfx.play(heavy ? "heavy" : (m.sfx === "kick" ? "kick" : "hit"));
  }
  /* Deliberately does not end the round here. Two fighters can be killed in
     the same frame — a trade where both connect — and ending it inside the
     first hit's resolution would hand the win to whichever fighter the hit
     loop happened to reach first, which is always player one. The decision
     is made once, after every hit on the frame has been resolved. */
  checkKO(){
    if (this.phase !== PH.FIGHT) return;
    const dead = [this.fighters[0].hp <= 0, this.fighters[1].hp <= 0];
    if (!dead[0] && !dead[1]) return;
    if (dead[0] && dead[1]) this.triggerDoubleKO();
    else this.triggerKO(dead[0] ? 1 : 0);
  }

  /* ----------------------------------------------------------- round flow -- */
  triggerDoubleKO(){
    this.phase = PH.KO; this.phaseTimer = 0; this.koSide = -1;
    this.hitstop = 16; this.shake = 12;
    for (const f of this.fighters){
      f.setState(S.KNOCKDOWN, ANIM.fall);
      f.airborne = true; f.vy = 860; f.vx = f.facing * -640;
    }
    this.setAnnounce("DOUBLE K.O.", 120);
    Sfx.play("ko");
  }
  triggerKO(winner){
    this.phase = PH.KO; this.phaseTimer = 0; this.koSide = winner;
    this.hitstop = 16; this.shake = 12;
    const loser = this.fighters[1 - winner];
    loser.setState(S.KNOCKDOWN, ANIM.fall);
    loser.airborne = true; loser.vy = 880; loser.vx = -this.fighters[winner].facing * 700;
    this.setAnnounce("K.O.", 120);
    Sfx.play("ko");
  }
  checkRoundEnd(){
    if (this.timer <= 0){
      const [a, b] = this.fighters;
      const pa = a.hp / a.maxHp, pb = b.hp / b.maxHp;
      this.phase = PH.KO; this.phaseTimer = 0;
      this.koSide = pa === pb ? -1 : (pa > pb ? 0 : 1);
      if (this.koSide >= 0){
        const loser = this.fighters[1 - this.koSide];
        loser.setState(S.KNOCKDOWN, ANIM.fall);
        loser.airborne = true; loser.vy = 700;
      }
      this.setAnnounce("TIME UP", 120);
      Sfx.play("ko");
    }
  }
  finishRound(){
    const w = this.koSide;
    if (w >= 0){
      const winner = this.fighters[w];
      winner.wins++;
      winner.setState(S.WIN, ANIM.win);
      const perfect = winner.hp === winner.maxHp;
      if (winner.wins >= WINS_NEEDED){
        this.matchOver = true; this.matchWinner = w;
        this.phase = PH.MATCHEND; this.phaseTimer = 0;
        this.setAnnounce(winner.ch.name.toUpperCase() + " WINS", 600);
        Sfx.play("win");
        return;
      }
      this.setAnnounce(perfect ? "PERFECT" : winner.ch.name.toUpperCase() + " WINS", 140);
    } else {
      this.setAnnounce("DRAW", 140);
    }
    /* Both fighters at two wins each would be a draw game; capped at 3 rounds. */
    this.round++;
    if (this.round > 3){
      this.matchOver = true;
      this.matchWinner = this.fighters[0].wins === this.fighters[1].wins ? -1 :
                         (this.fighters[0].wins > this.fighters[1].wins ? 0 : 1);
      this.phase = PH.MATCHEND; this.phaseTimer = 0;
      this.setAnnounce(this.matchWinner < 0 ? "DRAW GAME" :
        this.fighters[this.matchWinner].ch.name.toUpperCase() + " WINS", 600);
      return;
    }
    this.phase = PH.ROUNDEND; this.phaseTimer = 0;
  }

  updateEffects(){
    for (let i = this.effects.length - 1; i >= 0; i--){
      const e = this.effects[i];
      if (++e.t >= e.life) this.effects.splice(i, 1);
    }
  }
}
