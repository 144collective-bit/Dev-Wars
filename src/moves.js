/* ============================================================================
   MOVES
   ----------------------------------------------------------------------------
   Frame data reads the way a fighting-game player expects: startup frames
   before the hitbox appears, active frames while it is out, recovery frames
   before you can act again. Hitboxes are given in rig space (origin between
   the feet, y negative upward, facing right) and mirrored with the fighter.

   level  "mid"      blockable standing or crouching
          "low"      must be blocked crouching
          "overhead" must be blocked standing
          "throw"    unblockable, requires proximity
   ========================================================================== */

/* A phase used to hold a single drawing for its whole length: an eighteen
   frame recovery was one pose for eighteen frames, which was the most retro
   thing left in the game. A phase may now be a list, spread across the SAME
   frame count — so the frame data the game is actually played on is untouched
   while the number of drawings filling it goes up.

   Entries are a pose, or [pose, frames]. The last entry absorbs whatever is
   left, so a list always fills its phase exactly however the frame data is
   tuned later, and a phase too short for its list simply drops the tail. */
function expandPhase(spec, total){
  if (total <= 0) return [];
  if (!Array.isArray(spec)) return [[spec, total]];
  const out = [];
  let used = 0;
  for (let i = 0; i < spec.length && used < total; i++){
    const e = spec[i], pose = Array.isArray(e) ? e[0] : e;
    let n = (i === spec.length - 1) ? total - used
          : Array.isArray(e) ? e[1]
          : Math.max(1, Math.round(total / spec.length));
    n = Math.max(0, Math.min(n, total - used));
    if (n > 0){ out.push([pose, n]); used += n; }
  }
  if (used < total && out.length) out[out.length - 1][1] += total - used;
  return out.length ? out : [[Array.isArray(spec[0]) ? spec[0][0] : spec[0], total]];
}

function mkMove(o){
  const m = Object.assign({
    type:"normal", level:"mid", stance:"stand",
    startup:5, active:4, recovery:10,
    dmg:10, chip:0, hitstun:14, blockstun:10,
    pushHit:520, pushBlock:340, launch:0, knockdown:false,
    cancelable:false, maxHits:1, rehit:0,
    meterHit:26, meterBlock:10, meterWhiff:4,
    invuln:0, moveX:0, moveY:0, air:false, sfx:"punch",
    poses:[POSE.idle1, POSE.idle1, POSE.idle1], hit:null, onActive:null
  }, o);
  const p = m.poses;
  m.anim = { loop:false, frames:
    expandPhase(p[0], m.startup)
      .concat(expandPhase(p[1], m.active))
      .concat(expandPhase(p[2] !== undefined ? p[2] : p[1], m.recovery)) };
  m.total = m.startup + m.active + m.recovery;
  return m;
}

/* --- the normal moves every fighter shares -------------------------------- */
const NORMALS = {
  stLP: mkMove({ id:"stLP", name:"Jab", startup:3, active:3, recovery:6,
    dmg:6, hitstun:12, blockstun:8, cancelable:true, pushHit:380, pushBlock:300,
    hit:{x:17,y:-58,w:20,h:14}, poses:[[[POSE.jabCoil,1],POSE.jabStart],
           [[POSE.jabSmear,1],POSE.jab],
           [[POSE.jabFollow,2],[POSE.jabStart,2],[POSE.jabSettle,1],POSE.jabSettle2]] }),
  stMP: mkMove({ id:"stMP", name:"Straight", startup:5, active:4, recovery:11,
    dmg:11, hitstun:15, blockstun:11, cancelable:true,
    hit:{x:20,y:-56,w:21,h:14}, poses:[[[POSE.strCoil,2],POSE.jabStart],
           [[POSE.strSmear,1],POSE.straight],
           [[POSE.strFollow,3],[POSE.jab,3],[POSE.strSettle,3],POSE.strSettle2]] }),
  stHP: mkMove({ id:"stHP", name:"Fierce", startup:8, active:5, recovery:18,
    dmg:17, hitstun:19, blockstun:13, cancelable:true, pushHit:760, pushBlock:520,
    hit:{x:22,y:-55,w:23,h:16}, poses:[[[POSE.fceCoilA,3],[POSE.fierceWind,3],POSE.fceCoilB],
           [[POSE.fceSmear,1],POSE.fierce],
           [[POSE.fceFollow,4],[POSE.straight,5],[POSE.fceSettle,5],POSE.fceSettle2]] }),
  stLK: mkMove({ id:"stLK", name:"Short", startup:4, active:3, recovery:8,
    dmg:6, hitstun:12, blockstun:8, cancelable:true, sfx:"kick",
    hit:{x:16,y:-33,w:20,h:13}, poses:[[[POSE.kckCoil,2],POSE.shortStart],
           [[POSE.kckSmear,1],POSE.shortKick],
           [[POSE.kckFollow,3],[POSE.shortStart,2],[POSE.kckSettle,2],POSE.kckSettle2]] }),
  stMK: mkMove({ id:"stMK", name:"Forward", startup:6, active:4, recovery:13,
    dmg:12, hitstun:15, blockstun:11, cancelable:true, sfx:"kick",
    hit:{x:20,y:-38,w:22,h:13}, poses:[[[POSE.kckCoil,3],POSE.shortStart],
           [[POSE.midSmear,1],POSE.midKick],
           [[POSE.midFollow,4],[POSE.shortKick,3],[POSE.kckSettle,3],POSE.midSettle2]] }),
  stHK: mkMove({ id:"stHK", name:"Roundhouse", startup:9, active:5, recovery:20,
    dmg:18, hitstun:20, blockstun:14, knockdown:true, pushHit:900, pushBlock:600, sfx:"kick",
    hit:{x:19,y:-55,w:24,h:18}, poses:[[[POSE.kckCoil,3],[POSE.shortStart,3],POSE.hiCoil],
           [[POSE.hiSmear,1],POSE.highKick],
           [[POSE.hiFollow,5],[POSE.midKick,5],[POSE.hiSettle,5],POSE.hiSettle2]] }),

  crLP: mkMove({ id:"crLP", name:"Crouch Jab", stance:"crouch", startup:3, active:3, recovery:6,
    dmg:5, hitstun:11, blockstun:8, cancelable:true, pushHit:340, pushBlock:260,
    hit:{x:15,y:-45,w:19,h:12}, poses:[[[POSE.crCoil,1],POSE.crouch],
           [[POSE.crJabSmear,1],POSE.crJab],
           [[POSE.crJabBack,2],POSE.crouch]] }),
  crMP: mkMove({ id:"crMP", name:"Crouch Strong", stance:"crouch", startup:5, active:4, recovery:11,
    dmg:10, hitstun:14, blockstun:10, cancelable:true,
    hit:{x:16,y:-54,w:19,h:15}, poses:[[[POSE.crCoil,2],POSE.crouch],
           [[POSE.crStrSmear,1],POSE.crStrong],
           [[POSE.crStrBack,4],POSE.crouch]] }),
  crHP: mkMove({ id:"crHP", name:"Crouch Fierce", stance:"crouch", startup:6, active:6, recovery:17,
    dmg:16, hitstun:18, blockstun:12, launch:900, knockdown:true, cancelable:false,
    hit:{x:8,y:-72,w:20,h:28}, poses:[[[POSE.crCoil,3],POSE.crouch],
           [[POSE.crFceSmear,1],POSE.crFierce],
           [[POSE.crFceBack,5],[POSE.crSettle,4],POSE.crouch]] }),
  crLK: mkMove({ id:"crLK", name:"Crouch Short", stance:"crouch", level:"low", startup:4, active:3, recovery:7,
    dmg:5, hitstun:11, blockstun:8, cancelable:true, sfx:"kick",
    hit:{x:14,y:-13,w:19,h:12}, poses:[[[POSE.crCoil,1],POSE.crouch],
           [[POSE.crKckSmear,1],POSE.crShort],
           [[POSE.crKckBack,3],POSE.crouch]] }),
  crMK: mkMove({ id:"crMK", name:"Crouch Forward", stance:"crouch", level:"low", startup:6, active:4, recovery:13,
    dmg:11, hitstun:14, blockstun:10, cancelable:true, sfx:"kick",
    hit:{x:16,y:-15,w:23,h:13}, poses:[[[POSE.crCoil,2],POSE.crouch],
           [[POSE.crMidSmear,1],POSE.crMid],
           [[POSE.crMidBack,4],POSE.crouch]] }),
  crHK: mkMove({ id:"crHK", name:"Sweep", stance:"crouch", level:"low", startup:8, active:5, recovery:23,
    dmg:14, hitstun:18, blockstun:13, knockdown:true, pushHit:600, sfx:"sweep",
    hit:{x:15,y:-11,w:28,h:11}, poses:[[[POSE.swpCoil,3],POSE.sweepWind],
           [[POSE.swpSmear,1],POSE.sweep],
           [[POSE.swpFollow,5],[POSE.sweepWind,4],[POSE.crSettle,4],POSE.crouch]] }),

  jLP: mkMove({ id:"jLP", name:"Air Jab", stance:"air", level:"overhead", air:true,
    startup:4, active:9, recovery:2, dmg:7, hitstun:13, blockstun:9,
    hit:{x:15,y:-58,w:20,h:16}, poses:[POSE.jumpBall,
           [[POSE.airJabSm,1],POSE.airJab],
           [[POSE.airJabBk,3],POSE.jumpBall]] }),
  jMP: mkMove({ id:"jMP", name:"Air Strong", stance:"air", level:"overhead", air:true,
    startup:5, active:9, recovery:2, dmg:12, hitstun:16, blockstun:11,
    hit:{x:17,y:-54,w:21,h:18}, poses:[[[POSE.jumpBall,2],POSE.airJab],
           [[POSE.airFceSm,1],POSE.airFierce],
           [[POSE.airFceBk,4],POSE.jumpBall]] }),
  jHP: mkMove({ id:"jHP", name:"Air Fierce", stance:"air", level:"overhead", air:true,
    startup:6, active:9, recovery:2, dmg:16, hitstun:19, blockstun:13, pushHit:700,
    hit:{x:17,y:-52,w:23,h:20}, poses:[[[POSE.jumpBall,2],POSE.airJab],
           [[POSE.airFceSm,1],POSE.airFierce],
           [[POSE.airFceBk,4],POSE.jumpBall]] }),
  jLK: mkMove({ id:"jLK", name:"Air Short", stance:"air", level:"overhead", air:true, sfx:"kick",
    startup:4, active:11, recovery:2, dmg:7, hitstun:13, blockstun:9,
    hit:{x:13,y:-36,w:20,h:16}, poses:[POSE.jumpBall,
           [[POSE.airShtSm,1],POSE.airShort],
           [[POSE.airShtBk,3],POSE.jumpBall]] }),
  jMK: mkMove({ id:"jMK", name:"Air Forward", stance:"air", level:"overhead", air:true, sfx:"kick",
    startup:5, active:11, recovery:2, dmg:12, hitstun:16, blockstun:11,
    hit:{x:17,y:-38,w:21,h:16}, poses:[[[POSE.jumpBall,2],POSE.airShort],
           [[POSE.airHvySm,1],POSE.airHeavy],
           [[POSE.airHvyBk,4],POSE.jumpBall]] }),
  jHK: mkMove({ id:"jHK", name:"Air Roundhouse", stance:"air", level:"overhead", air:true, sfx:"kick",
    startup:6, active:11, recovery:2, dmg:17, hitstun:20, blockstun:14, pushHit:760,
    hit:{x:18,y:-38,w:24,h:20}, poses:[[[POSE.jumpBall,2],POSE.airShort],
           [[POSE.airHvySm,1],POSE.airHeavy],
           [[POSE.airHvyBk,4],POSE.jumpBall]] }),

  throwAttempt: mkMove({ id:"throw", name:"Throw", type:"throw", level:"throw",
    startup:2, active:2, recovery:18, dmg:24, hitstun:0, blockstun:0, knockdown:true,
    meterHit:40, sfx:"throw", hit:{x:12,y:-58,w:22,h:44},
    poses:[POSE.grabReach,
           [[POSE.grabPull,2],POSE.grabHold],
           [[POSE.grabHold,3],POSE.grabReach]] })
};

/* The button a normal comes out of, per stance. */
const NORMAL_TABLE = {
  stand:  { [IN_LP]:"stLP", [IN_MP]:"stMP", [IN_HP]:"stHP", [IN_LK]:"stLK", [IN_MK]:"stMK", [IN_HK]:"stHK" },
  crouch: { [IN_LP]:"crLP", [IN_MP]:"crMP", [IN_HP]:"crHP", [IN_LK]:"crLK", [IN_MK]:"crMK", [IN_HK]:"crHK" },
  air:    { [IN_LP]:"jLP",  [IN_MP]:"jMP",  [IN_HP]:"jHP",  [IN_LK]:"jLK",  [IN_MK]:"jMK",  [IN_HK]:"jHK" }
};
