/* ============================================================================
   CPU OPPONENT
   ----------------------------------------------------------------------------
   The AI does not reach into the simulation; it only produces the same input
   bitmask a human would, one frame at a time. Motion inputs are queued out
   frame by frame, so the CPU has to execute a quarter-circle just like you do.
   ========================================================================== */

const AI_LEVELS = {
  easy:   { react: 16, block: 35, aggro: 26, special: 12, antiAir: 20 },
  normal: { react:  9, block: 62, aggro: 44, special: 30, antiAir: 45 },
  hard:   { react:  4, block: 84, aggro: 62, special: 52, antiAir: 74 }
};

class AI {
  constructor(level, seed){
    this.cfg = AI_LEVELS[level] || AI_LEVELS.normal;
    this.rng = makeRNG(seed || 12345);
    this.queue = [];
    this.cool = 0;
  }
  roll(n){ return this.rng() % n; }
  /* Queue a motion, holding each step for a couple of frames so the game's
     own leniency window sees it. */
  push(masks, hold){
    hold = hold || 2;
    for (const m of masks) for (let i = 0; i < hold; i++) this.queue.push(m);
    this.queue.push(0);
  }
  qcf(btn, fwd){ this.push([IN_DOWN, IN_DOWN|fwd, fwd, fwd|btn]); }
  qcb(btn, back){ this.push([IN_DOWN, IN_DOWN|back, back, back|btn]); }
  dp(btn, fwd){ this.push([fwd, IN_DOWN, IN_DOWN|fwd, IN_DOWN|fwd|btn]); }
  press(btn, hold){ this.push([btn], hold || 3); }

  think(me, opp, g){
    if (this.queue.length) return this.queue.shift();
    if (g.phase !== PH.FIGHT) return 0;
    if (me.state === S.HITSTUN || me.state === S.KNOCKDOWN || me.state === S.THROWN) return 0;
    if (this.cool > 0){ this.cool--; return this.holdMask || 0; }

    const c = this.cfg;
    const dist = Math.abs(me.px - opp.px);
    const fwd  = me.facing > 0 ? IN_RIGHT : IN_LEFT;
    const back = me.facing > 0 ? IN_LEFT  : IN_RIGHT;
    this.holdMask = 0;

    /* incoming projectile */
    for (const pr of g.projectiles){
      if (pr.owner === me.id) continue;
      const toward = (pr.x - me.x) * pr.vx < 0;
      const d = Math.abs(pr.x - me.x) / FP;
      if (toward && d < 110){
        if (this.roll(100) < c.block){ this.cool = 14; this.holdMask = back|IN_DOWN; return back|IN_DOWN; }
        this.push([IN_UP|fwd], 3); this.cool = 4; return IN_UP|fwd;
      }
    }
    /* anti-air: they are above and coming down at us */
    if (opp.airborne && dist < 70 && opp.py > 20 && this.roll(100) < c.antiAir){
      if (me.ch.specials.some(s => s.key === "rise")) this.dp(IN_HP, fwd);
      else if (me.ch.specials.some(s => s.key === "fang")) this.push([IN_DOWN,IN_DOWN,IN_DOWN,IN_UP|IN_HK], 6);
      else this.push([IN_DOWN|IN_HP], 4);
      this.cool = 8; return this.queue.shift();
    }
    /* respect an attack in progress */
    if (opp.state === S.ATTACK && dist < 78 && this.roll(100) < c.block){
      this.cool = c.react + 6;
      this.holdMask = back | (this.roll(2) ? IN_DOWN : 0);
      return this.holdMask;
    }
    /* super when it is available and they are close */
    if (me.meter >= METER_MAX && dist < 90 && this.roll(100) < c.special + 20){
      const btn = me.ch.super.key === "circuit" ? IN_MK : IN_MP;
      this.push([IN_DOWN, IN_DOWN|fwd, fwd, IN_DOWN, IN_DOWN|fwd, fwd, fwd|btn], 2);
      this.cool = 10; return this.queue.shift();
    }

    if (dist < 44){
      const r = this.roll(100);
      if (r < 14){ this.push([IN_LP|IN_LK], 3); }                        /* throw */
      else if (r < 30) this.press(IN_DOWN|IN_LK, 3);
      else if (r < 50) this.press(IN_MP, 3);
      else if (r < 66) this.press(IN_DOWN|IN_HK, 4);
      else if (r < 66 + c.special){
        const s = me.ch.specials[this.roll(me.ch.specials.length)];
        if (s.key === "rise") this.dp(IN_MP, fwd);
        else if (s.key === "clasp") this.push([back, IN_DOWN|back, IN_DOWN, IN_DOWN|fwd, fwd, fwd|IN_HP], 2);
        else if (s.charge === "back"){ this.push([back,back,back,back,back,back,back,back], 8); this.push([fwd|IN_MP], 3); }
        else if (s.charge === "down"){ this.push([IN_DOWN], 44); this.push([IN_UP|IN_MK], 3); }
        else if (s.key === "heel" || s.key === "anvil") this.qcb(IN_MK, back);
        else this.qcf(s.key === "razor" ? IN_MK : IN_MP, fwd);
      }
      else { this.cool = c.react; this.holdMask = back; return back; }
      this.cool = 6;
      return this.queue.length ? this.queue.shift() : 0;
    }
    if (dist < 96){
      const r = this.roll(100);
      if (r < c.aggro){ this.cool = 10; this.holdMask = fwd; return fwd; }
      if (r < c.aggro + 18){ this.press(IN_DOWN|IN_MK, 4); this.cool = 6; return this.queue.shift(); }
      if (r < c.aggro + 30){ this.push([IN_UP|fwd], 3); this.cool = 6; return IN_UP|fwd; }
      this.cool = 12; this.holdMask = back; return back;
    }
    /* long range */
    const r = this.roll(100);
    if (r < c.special){
      const s = me.ch.specials[0];
      if (s.charge === "back"){ this.push([back,back,back,back,back,back,back,back], 8); this.push([fwd|IN_HP], 3); }
      else this.qcf(IN_HP, fwd);
      this.cool = 8;
      return this.queue.length ? this.queue.shift() : 0;
    }
    this.cool = 12; this.holdMask = fwd;
    return fwd;
  }
}
