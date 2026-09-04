/* Scenario definitions.

   Each scenario is a seed, a pair of characters, and a rule for producing the
   two input masks on any given frame. Nothing is stored frame-by-frame: the
   scripts are regenerated deterministically, so the file stays small and the
   goldens stay readable. */

export const SCENARIOS = [
  { name:"random-kestrel-vex",  chars:["kestrel","vex"],   seed:4242, frames:1800, driver:"random" },
  { name:"random-brick-vex",    chars:["brick","vex"],     seed:909,  frames:1800, driver:"random" },
  { name:"random-kestrel-brick",chars:["kestrel","brick"], seed:31337,frames:2400, driver:"random" },
  { name:"mirror-brick",        chars:["brick","brick"],   seed:777,  frames:1500, driver:"random" },
  { name:"ai-vs-ai-hard",       chars:["brick","vex"],     seed:77,   frames:9000, driver:"ai", level:"hard" },
  { name:"ai-vs-ai-normal",     chars:["kestrel","brick"], seed:5150, frames:9000, driver:"ai", level:"normal" },
  { name:"pressure-corner",     chars:["kestrel","brick"], seed:11,   frames:1200, driver:"pressure" },
  { name:"specials-drill",      chars:["vex","kestrel"],   seed:23,   frames:1500, driver:"specials" }
];

/* Runs inside the page: builds a driver function for a scenario. */
export const INSTALL_DRIVERS = () => {
  globalThis.__makeDriver = function(sc){
    const rnd = makeRNG(sc.seed);
    const dirBit = x => x < 26 ? IN_RIGHT : x < 44 ? IN_LEFT : x < 55 ? IN_DOWN : x < 63 ? IN_UP : 0;
    const btnBit = x =>
      x < 8 ? IN_LP : x < 16 ? IN_MP : x < 23 ? IN_HP :
      x < 31 ? IN_LK : x < 38 ? IN_MK : x < 45 ? IN_HK : 0;

    /* Pure noise leaves the two of them flailing at opposite ends of the
       stage, which tests almost nothing. Biasing towards the opponent while
       they are far apart makes the mashing actually connect. */
    if (sc.driver === "random")
      return g => {
        const far = Math.abs(g.fighters[0].px - g.fighters[1].px) > 66;
        const one = (me, opp) => {
          const d = rnd() % 100;
          const toward = me.px < opp.px ? IN_RIGHT : IN_LEFT;
          return (far && d < 52 ? toward : dirBit(d)) | btnBit(rnd() % 100);
        };
        return [ one(g.fighters[0], g.fighters[1]), one(g.fighters[1], g.fighters[0]) ];
      };

    if (sc.driver === "ai"){
      const a = new AI(sc.level, sc.seed ^ 0x5bf0), b = new AI(sc.level, sc.seed ^ 0x1c9d);
      return g => [ a.think(g.fighters[0], g.fighters[1], g),
                    b.think(g.fighters[1], g.fighters[0], g) ];
    }

    /* One fighter walks the other into the corner and pokes; the other guards
       high and low in turn. Exercises blockstun, pushback and wall behaviour. */
    if (sc.driver === "pressure")
      return g => {
        const f = g.frame;
        const atk = f % 47 < 3 ? (f % 141 < 47 ? IN_MP : f % 141 < 94 ? (IN_DOWN|IN_HK) : IN_HK)
                               : IN_RIGHT;
        const def = (f % 120 < 60) ? IN_RIGHT : (IN_RIGHT | IN_DOWN);
        return [atk, def];
      };

    /* Cycles every motion input the game recognises, so a change to the
       motion buffer or the charge timers shows up immediately. */
    const F = IN_RIGHT, B = IN_LEFT;
    const seq = [];
    const push = (masks, hold) => { for (const m of masks) for (let i = 0; i < (hold||3); i++) seq.push(m); seq.push(0); };
    for (const btn of [IN_LP, IN_MP, IN_HP]) push([IN_DOWN, IN_DOWN|F, F, F|btn]);       /* quarter-circle fwd */
    for (const btn of [IN_LP, IN_HP])        push([F, IN_DOWN, IN_DOWN|F, IN_DOWN|F|btn]); /* dragon punch */
    for (const btn of [IN_LK, IN_MK])        push([IN_DOWN, IN_DOWN|B, B, B|btn]);       /* quarter-circle back */
    push([B, IN_DOWN|B, IN_DOWN, IN_DOWN|F, F, F|IN_HP]);                                /* half circle */
    push([B], 50); push([F|IN_MP]);                                                      /* charge back */
    push([IN_DOWN], 50); push([IN_UP|IN_MK]);                                            /* charge down */
    push([IN_DOWN, IN_DOWN|F, F, IN_DOWN, IN_DOWN|F, F, F|IN_MP]);                       /* super */
    return g => [ seq[g.frame % seq.length], (g.frame % 90 < 45) ? IN_LEFT : 0 ];
  };
};
