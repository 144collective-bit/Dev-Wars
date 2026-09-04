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
  m.anim = { loop:false, frames:[
    [p[0], m.startup],
    [p[1], m.active],
    [p[2] !== undefined ? p[2] : p[1], m.recovery]
  ]};
  m.total = m.startup + m.active + m.recovery;
  return m;
}

/* --- the normal moves every fighter shares -------------------------------- */
const NORMALS = {
  stLP: mkMove({ id:"stLP", name:"Jab", startup:3, active:3, recovery:6,
    dmg:6, hitstun:12, blockstun:8, cancelable:true, pushHit:380, pushBlock:300,
    hit:{x:17,y:-58,w:20,h:14}, poses:[POSE.jabStart,POSE.jab,POSE.jabStart] }),
  stMP: mkMove({ id:"stMP", name:"Straight", startup:5, active:4, recovery:11,
    dmg:11, hitstun:15, blockstun:11, cancelable:true,
    hit:{x:20,y:-56,w:21,h:14}, poses:[POSE.jabStart,POSE.straight,POSE.jab] }),
  stHP: mkMove({ id:"stHP", name:"Fierce", startup:8, active:5, recovery:18,
    dmg:17, hitstun:19, blockstun:13, cancelable:true, pushHit:760, pushBlock:520,
    hit:{x:22,y:-55,w:23,h:16}, poses:[POSE.fierceWind,POSE.fierce,POSE.straight] }),
  stLK: mkMove({ id:"stLK", name:"Short", startup:4, active:3, recovery:8,
    dmg:6, hitstun:12, blockstun:8, cancelable:true, sfx:"kick",
    hit:{x:16,y:-33,w:20,h:13}, poses:[POSE.shortStart,POSE.shortKick,POSE.shortStart] }),
  stMK: mkMove({ id:"stMK", name:"Forward", startup:6, active:4, recovery:13,
    dmg:12, hitstun:15, blockstun:11, cancelable:true, sfx:"kick",
    hit:{x:20,y:-38,w:22,h:13}, poses:[POSE.shortStart,POSE.midKick,POSE.shortKick] }),
  stHK: mkMove({ id:"stHK", name:"Roundhouse", startup:9, active:5, recovery:20,
    dmg:18, hitstun:20, blockstun:14, knockdown:true, pushHit:900, pushBlock:600, sfx:"kick",
    hit:{x:19,y:-55,w:24,h:18}, poses:[POSE.shortStart,POSE.highKick,POSE.midKick] }),

  crLP: mkMove({ id:"crLP", name:"Crouch Jab", stance:"crouch", startup:3, active:3, recovery:6,
    dmg:5, hitstun:11, blockstun:8, cancelable:true, pushHit:340, pushBlock:260,
    hit:{x:15,y:-45,w:19,h:12}, poses:[POSE.crouch,POSE.crJab,POSE.crouch] }),
  crMP: mkMove({ id:"crMP", name:"Crouch Strong", stance:"crouch", startup:5, active:4, recovery:11,
    dmg:10, hitstun:14, blockstun:10, cancelable:true,
    hit:{x:16,y:-54,w:19,h:15}, poses:[POSE.crouch,POSE.crStrong,POSE.crouch] }),
  crHP: mkMove({ id:"crHP", name:"Crouch Fierce", stance:"crouch", startup:6, active:6, recovery:17,
    dmg:16, hitstun:18, blockstun:12, launch:900, knockdown:true, cancelable:false,
    hit:{x:8,y:-72,w:20,h:28}, poses:[POSE.crouch,POSE.crFierce,POSE.crouch] }),
  crLK: mkMove({ id:"crLK", name:"Crouch Short", stance:"crouch", level:"low", startup:4, active:3, recovery:7,
    dmg:5, hitstun:11, blockstun:8, cancelable:true, sfx:"kick",
    hit:{x:14,y:-13,w:19,h:12}, poses:[POSE.crouch,POSE.crShort,POSE.crouch] }),
  crMK: mkMove({ id:"crMK", name:"Crouch Forward", stance:"crouch", level:"low", startup:6, active:4, recovery:13,
    dmg:11, hitstun:14, blockstun:10, cancelable:true, sfx:"kick",
    hit:{x:16,y:-15,w:23,h:13}, poses:[POSE.crouch,POSE.crMid,POSE.crouch] }),
  crHK: mkMove({ id:"crHK", name:"Sweep", stance:"crouch", level:"low", startup:8, active:5, recovery:23,
    dmg:14, hitstun:18, blockstun:13, knockdown:true, pushHit:600, sfx:"sweep",
    hit:{x:15,y:-11,w:28,h:11}, poses:[POSE.sweepWind,POSE.sweep,POSE.sweepWind] }),

  jLP: mkMove({ id:"jLP", name:"Air Jab", stance:"air", level:"overhead", air:true,
    startup:4, active:9, recovery:2, dmg:7, hitstun:13, blockstun:9,
    hit:{x:15,y:-58,w:20,h:16}, poses:[POSE.airJab,POSE.airJab,POSE.airJab] }),
  jMP: mkMove({ id:"jMP", name:"Air Strong", stance:"air", level:"overhead", air:true,
    startup:5, active:9, recovery:2, dmg:12, hitstun:16, blockstun:11,
    hit:{x:17,y:-54,w:21,h:18}, poses:[POSE.airJab,POSE.airFierce,POSE.airFierce] }),
  jHP: mkMove({ id:"jHP", name:"Air Fierce", stance:"air", level:"overhead", air:true,
    startup:6, active:9, recovery:2, dmg:16, hitstun:19, blockstun:13, pushHit:700,
    hit:{x:17,y:-52,w:23,h:20}, poses:[POSE.airJab,POSE.airFierce,POSE.airFierce] }),
  jLK: mkMove({ id:"jLK", name:"Air Short", stance:"air", level:"overhead", air:true, sfx:"kick",
    startup:4, active:11, recovery:2, dmg:7, hitstun:13, blockstun:9,
    hit:{x:13,y:-36,w:20,h:16}, poses:[POSE.airShort,POSE.airShort,POSE.airShort] }),
  jMK: mkMove({ id:"jMK", name:"Air Forward", stance:"air", level:"overhead", air:true, sfx:"kick",
    startup:5, active:11, recovery:2, dmg:12, hitstun:16, blockstun:11,
    hit:{x:17,y:-38,w:21,h:16}, poses:[POSE.airShort,POSE.airHeavy,POSE.airHeavy] }),
  jHK: mkMove({ id:"jHK", name:"Air Roundhouse", stance:"air", level:"overhead", air:true, sfx:"kick",
    startup:6, active:11, recovery:2, dmg:17, hitstun:20, blockstun:14, pushHit:760,
    hit:{x:18,y:-38,w:24,h:20}, poses:[POSE.airShort,POSE.airHeavy,POSE.airHeavy] }),

  throwAttempt: mkMove({ id:"throw", name:"Throw", type:"throw", level:"throw",
    startup:2, active:2, recovery:18, dmg:24, hitstun:0, blockstun:0, knockdown:true,
    meterHit:40, sfx:"throw", hit:{x:12,y:-58,w:22,h:44},
    poses:[POSE.grabReach,POSE.grabHold,POSE.grabReach] })
};

/* The button a normal comes out of, per stance. */
const NORMAL_TABLE = {
  stand:  { [IN_LP]:"stLP", [IN_MP]:"stMP", [IN_HP]:"stHP", [IN_LK]:"stLK", [IN_MK]:"stMK", [IN_HK]:"stHK" },
  crouch: { [IN_LP]:"crLP", [IN_MP]:"crMP", [IN_HP]:"crHP", [IN_LK]:"crLK", [IN_MK]:"crMK", [IN_HK]:"crHK" },
  air:    { [IN_LP]:"jLP",  [IN_MP]:"jMP",  [IN_HP]:"jHP",  [IN_LK]:"jLK",  [IN_MK]:"jMK",  [IN_HK]:"jHK" }
};
