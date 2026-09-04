/* ============================================================================
   CHARACTERS
   ----------------------------------------------------------------------------
   Three originals covering the classic archetype spread: an all-rounder, a
   slow heavy hitter, and a fast charge character. They share the rig and the
   normal-move table; what differs is palette, proportions, stats and specials.
   ========================================================================== */

const METER_MAX = 120;

/* Helper for special-move definitions. `check` inspects the motion buffer and
   the button that was just pressed, and returns true if the input matches. */
const sp = (o) => mkMove(Object.assign({ type:"special", meterHit:34, meterBlock:14, meterWhiff:8 }, o));

const CHARACTERS = [
{
  key:"kestrel", name:"Kestrel", role:"All-rounder",
  blurb:"Even walk speed, a projectile to control space, and a rising uppercut that beats anything jumping in. The one to learn the game on.",
  hp:1000, walkF:300, walkB:245, jumpV:1420, jumpX:290, scale:1.00, bulk:0,
  stageKey:"dockyard",
  pal:{ skin:"#e8b58a", skinS:"#b8825c", skinB:"#8a5f42", suit:"#3a6ee0", suitS:"#24479c",
        trim:"#f2f2f4", hair:"#5a3a20", belt:"#e8e2d4", glow:"#7fd8ff", eye:"#20202c" },
  specials:[
    { key:"bolt", check:(mb,b)=> (b & PUNCHES) && mb.qcf(),
      make:(b)=> sp({ id:"bolt_"+b, name:"Gale Bolt", startup:11, active:2, recovery:29,
        dmg:0, sfx:"fire", poses:[POSE.boltWind,POSE.boltFire,POSE.boltFire], hit:null,
        proj:{ kind:"bolt", vx: b===IN_LP?740:b===IN_MP?900:1080, dmg:12, chip:3,
               hitstun:16, blockstun:12, w:18, h:14, oy:-46, ox:20, pushHit:520 } }) },
    { key:"rise", check:(mb,b)=> (b & PUNCHES) && mb.dp(),
      make:(b)=> sp({ id:"rise_"+b, name:"Talon Rise", startup:3, active:12, recovery:24,
        dmg: b===IN_LP?16:b===IN_MP?19:22, hitstun:22, blockstun:14, chip:4,
        knockdown:true, launch:1000, pushHit:420, invuln: b===IN_LP?6:8,
        moveX: b===IN_HP?300:220, moveY:1360, air:true, sfx:"heavy",
        poses:[POSE.riseWind,POSE.rise,POSE.rise], hit:{x:2,y:-80,w:24,h:44} }) },
    { key:"heel", check:(mb,b)=> (b & KICKS) && mb.qcb(),
      make:(b)=> sp({ id:"heel_"+b, name:"Cyclone Heel", startup:7, active:16, recovery:20,
        dmg:8, hitstun:14, blockstun:10, chip:2, maxHits:2, rehit:8, sfx:"kick",
        moveX: b===IN_LK?210:b===IN_MK?270:330, pushHit:300, pushBlock:200,
        poses:[POSE.spin1,POSE.spin2,POSE.spin1], hit:{x:6,y:-58,w:30,h:36} }) }
  ],
  super:{ key:"tempest", name:"Tempest Bolt", check:(mb,b)=> (b & PUNCHES) && mb.doubleQcf(),
    make:()=> sp({ id:"super_tempest", name:"Tempest Bolt", type:"super",
      startup:14, active:2, recovery:38, dmg:0, invuln:12, sfx:"super",
      poses:[POSE.superHold,POSE.boltFire,POSE.boltFire], hit:null,
      proj:{ kind:"tempest", vx:660, dmg:11, chip:3, hitstun:16, blockstun:12,
             w:34, h:30, oy:-52, ox:22, hits:4, pushHit:900 } }) }
},
{
  key:"brick", name:"Brick", role:"Heavy",
  blurb:"Walks like a cement mixer and hits like one. A command grab that goes straight through guard, and enough health to walk into range.",
  hp:1150, walkF:222, walkB:180, jumpV:1330, jumpX:250, scale:1.12, bulk:2,
  stageKey:"foundry",
  /* A deeper red than it looks like it wants to be: at the top of its ramp a
     mid red lightens into salmon and lands on top of his own skin tones, so
     the overalls read as bare arms. Starting darker keeps the whole ramp
     clearly outfit-coloured. */
  pal:{ skin:"#cf9464", skinS:"#a46a48", skinB:"#78482f", suit:"#a82a22", suitS:"#8c2a1c",
        trim:"#3a3a46", hair:"#2a2a32", belt:"#5a4a32", glow:"#ffb347", eye:"#20202c" },
  specials:[
    { key:"rush", check:(mb,b)=> (b & PUNCHES) && mb.qcf(),
      make:(b)=> sp({ id:"rush_"+b, name:"Slab Rush", startup:12, active:14, recovery:26,
        dmg: b===IN_LP?16:b===IN_MP?19:22, hitstun:20, blockstun:14, chip:4,
        knockdown:true, pushHit:900, pushBlock:520, sfx:"heavy",
        moveX: b===IN_LP?420:b===IN_MP?520:640,
        poses:[POSE.fierceWind,POSE.fierce,POSE.straight], hit:{x:8,y:-62,w:32,h:40} }) },
    { key:"clasp", check:(mb,b)=> (b & PUNCHES) && mb.hcf(),
      make:()=> sp({ id:"clasp", name:"Iron Clasp", type:"throw", level:"throw",
        startup:5, active:3, recovery:26, dmg:30, knockdown:true, meterHit:46, sfx:"throw",
        poses:[POSE.grabReach,POSE.grabHold,POSE.grabReach], hit:{x:8,y:-62,w:26,h:50} }) },
    { key:"anvil", check:(mb,b)=> (b & KICKS) && mb.qcb(),
      make:(b)=> sp({ id:"anvil_"+b, name:"Anvil Drop", level:"low", startup:14, active:8, recovery:22,
        dmg:20, hitstun:20, blockstun:14, chip:5, knockdown:true, sfx:"heavy",
        moveX: b===IN_LK?160:b===IN_MK?240:320, moveY:1150, air:true,
        poses:[POSE.jumpUp,POSE.sweep,POSE.sweepWind], hit:{x:-14,y:-16,w:50,h:16} }) }
  ],
  super:{ key:"wrecking", name:"Wrecking Line", check:(mb,b)=> (b & PUNCHES) && mb.doubleQcf(),
    make:()=> sp({ id:"super_wrecking", name:"Wrecking Line", type:"super",
      startup:10, active:26, recovery:34, dmg:9, hitstun:14, blockstun:10, chip:3,
      maxHits:5, rehit:6, invuln:10, knockdown:true, moveX:420, sfx:"super",
      poses:[POSE.superHold,POSE.fierce,POSE.straight], hit:{x:6,y:-64,w:36,h:46} }) }
},
{
  key:"vex", name:"Vex", role:"Speed / charge",
  blurb:"Fastest walk in the game and a charge projectile that fires almost instantly. Low health — you win by never being where the hit lands.",
  hp:900, walkF:362, walkB:305, jumpV:1500, jumpX:330, scale:0.95, bulk:-1,
  stageKey:"neon",
  pal:{ skin:"#efc6a8", skinS:"#bd8f72", skinB:"#8d6a54", suit:"#7d3ce0", suitS:"#4d1f96",
        trim:"#25f0d0", hair:"#f2f2f8", belt:"#25f0d0", glow:"#25f0d0", eye:"#20202c" },
  specials:[
    { key:"lance", check:(mb,b)=> (b & PUNCHES) && mb.chargedFwd(), charge:"back",
      make:(b)=> sp({ id:"lance_"+b, name:"Static Lance", startup:8, active:2, recovery:26,
        dmg:0, sfx:"fire", poses:[POSE.jabStart,POSE.lance,POSE.lance], hit:null,
        proj:{ kind:"lance", vx: b===IN_LP?980:b===IN_MP?1140:1320, dmg:10, chip:2,
               hitstun:15, blockstun:11, w:20, h:10, oy:-48, ox:22, pushHit:460 } }) },
    { key:"fang", check:(mb,b)=> (b & KICKS) && mb.chargedUp(), charge:"down",
      make:(b)=> sp({ id:"fang_"+b, name:"Sky Fang", startup:4, active:14, recovery:22,
        dmg: b===IN_LK?14:b===IN_MK?16:18, hitstun:20, blockstun:13, chip:3,
        knockdown:true, launch:900, invuln:5, moveX: b===IN_HK?360:260, moveY:1440,
        air:true, sfx:"kick", poses:[POSE.riseWind,POSE.fang,POSE.fang], hit:{x:0,y:-84,w:26,h:46} }) },
    { key:"razor", check:(mb,b)=> (b & KICKS) && mb.qcf(),
      make:(b)=> sp({ id:"razor_"+b, name:"Razor Spin", startup:6, active:14, recovery:19,
        dmg:7, hitstun:13, blockstun:10, chip:2, maxHits:2, rehit:7, sfx:"kick",
        moveX: b===IN_LK?300:b===IN_MK?380:460, pushHit:280, pushBlock:200,
        poses:[POSE.spin2,POSE.spin1,POSE.spin2], hit:{x:6,y:-52,w:32,h:34} }) }
  ],
  super:{ key:"circuit", name:"Circuit Break", check:(mb,b)=> (b & KICKS) && mb.doubleQcf(),
    make:()=> sp({ id:"super_circuit", name:"Circuit Break", type:"super",
      startup:8, active:24, recovery:30, dmg:7, hitstun:12, blockstun:9, chip:2,
      maxHits:6, rehit:4, invuln:8, knockdown:true, moveX:480, sfx:"super",
      poses:[POSE.superHold,POSE.spin1,POSE.spin2], hit:{x:4,y:-58,w:34,h:40} }) }
}
,
{
  key:"sommi", name:"Sommi", role:"Zoner",
  blurb:"Longest reach in the game, on the end of a spoon. Walks backwards faster than he walks forwards, so he wins by making you come to him — and punishes you for arriving.",
  hp:940, walkF:246, walkB:300, jumpV:1360, jumpX:235, scale:1.08, bulk:-1,
  /* The spoon. Applies to punches only, and defaults to 1 for everyone else. */
  reach:1.22,
  stageKey:"neon",
  pal:{ skin:"#e0b088", skinS:"#a87a52", skinB:"#7e5636", suit:"#8a8072", suitS:"#5e564c",
        trim:"#6e6558", hair:"#8a5a30", belt:"#4a4238", glow:"#ffd23d", eye:"#20202c" },
  /* Materials the other three do not have. The hat is his one loud colour and
     has to carry him, since a grey hoodie disappears against concrete. */
  extras:{ hat:{ hex:"#ffd23d", tones:3 },
           pants:{ hex:"#3f5f86", tones:3 },
           paw:{ hex:"#9a6438", tones:3 },
           spoon:{ hex:"#b4b8c0", tones:2 } },
  gear:{ hat:true, ears:true, beard:true, hood:true, bigFeet:true, weapon:"spoon" },
  poses:{ idle1:POSE.sommiIdle1, idle2:POSE.sommiIdle2, idle3:POSE.sommiIdle3 },
  specials:[
    { key:"flick", check:(mb,b)=> (b & PUNCHES) && mb.qcb(),
      make:(b)=> sp({ id:"flick_"+b, name:"Spoon Flick", startup:10, active:2, recovery:26,
        dmg:0, sfx:"fire", poses:[POSE.jabStart,POSE.lance,POSE.lance], hit:null,
        proj:{ kind:"bolt", vx: b===IN_LP?520:b===IN_MP?620:720, dmg:8, chip:3,
               hitstun:14, blockstun:11, w:14, h:12, oy:-44, ox:22, pushHit:420 } }) },
    { key:"slipper", check:(mb,b)=> (b & KICKS) && mb.dp(),
      make:(b)=> sp({ id:"slipper_"+b, name:"Slipper Rise", startup:4, active:12, recovery:26,
        dmg: b===IN_LK?14:b===IN_MK?16:18, hitstun:20, blockstun:13, chip:3,
        knockdown:true, launch:880, invuln: b===IN_LK?5:7, moveX:200, moveY:1330,
        air:true, sfx:"kick", poses:[POSE.riseWind,POSE.fang,POSE.fang],
        hit:{x:0,y:-80,w:26,h:44} }) },
    { key:"slide", check:(mb,b)=> (b & KICKS) && mb.hcf(),
      make:(b)=> sp({ id:"slide_"+b, name:"Sock Slide", level:"low", startup:9, active:10,
        recovery:26, dmg:13, hitstun:17, blockstun:12, chip:3, knockdown:true,
        moveX: b===IN_LK?420:b===IN_MK?520:620, pushHit:560, sfx:"sweep",
        poses:[POSE.sweepWind,POSE.sweep,POSE.sweepWind], hit:{x:12,y:-12,w:32,h:12} }) }
  ],
  super:{ key:"service", name:"Full Service", check:(mb,b)=> (b & PUNCHES) && mb.doubleQcf(),
    make:()=> sp({ id:"super_service", name:"Full Service", type:"super",
      startup:11, active:24, recovery:32, dmg:8, hitstun:13, blockstun:10, chip:2,
      maxHits:6, rehit:5, invuln:9, knockdown:true, moveX:330, sfx:"super",
      poses:[POSE.superHold,POSE.straight,POSE.jab], hit:{x:14,y:-58,w:38,h:26} }) }
}
];

/* Each fighter's palette, derived once from its base hues. */
for (const c of CHARACTERS) c.p16 = characterPalette(c.pal, c.extras);

const CHAR_BY_KEY = {};
for (const c of CHARACTERS) CHAR_BY_KEY[c.key] = c;
const CHAR_KEYS = CHARACTERS.map(c => c.key);
