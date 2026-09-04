#!/usr/bin/env node
/* Soak test: every character pairing at every difficulty, played to a result,
   checking invariants that must never break no matter what the fighters do.

   This is the net that catches the bugs unit tests do not describe — a
   position going non-finite, health outside its range, a fighter escaping the
   stage, a state machine wedged forever, projectile bookkeeping drifting from
   the projectiles that actually exist. Slower than `npm test`, so it is kept
   out of it: run `npm run test:soak` before a release.
*/
import { openGame } from "./harness.mjs";
const { browser, page, errors } = await openGame();
const r = await page.evaluate(() => {
  const problems = [];
  const note = (kind, detail) => { if (problems.length < 60) problems.push(kind + ": " + detail); };
  const pairs = [];
  for (const a of CHAR_KEYS) for (const b of CHAR_KEYS) pairs.push([a,b]);
  let matches = 0, totalFrames = 0, longest = 0, neverEnded = 0;
  const stateNames = Object.fromEntries(Object.entries(S).map(([k,v]) => [v,k]));

  for (let p = 0; p < pairs.length; p++){
    for (const level of ["easy","normal","hard"]){
      const seed = 1000 + p * 37 + level.length * 13;
      const g = new Game(pairs[p], seed);
      const ai = [new AI(level, seed ^ 1), new AI(level, seed ^ 2)];
      let f = 0;
      const stuck = [ {st:-1, sf:-1, n:0}, {st:-1, sf:-1, n:0} ];
      while (!g.matchOver && f < 60 * 60 * 8){
        g.step([ ai[0].think(g.fighters[0], g.fighters[1], g),
                 ai[1].think(g.fighters[1], g.fighters[0], g) ]);
        f++;
        for (let i = 0; i < 2; i++){
          const fi = g.fighters[i];
          if (!Number.isFinite(fi.x) || !Number.isFinite(fi.y) || !Number.isFinite(fi.vx) || !Number.isFinite(fi.vy))
            note("non-finite position", pairs[p] + " " + level + " frame " + f + " fighter " + i);
          if (fi.hp < 0 || fi.hp > fi.maxHp)
            note("hp out of range", fi.hp + "/" + fi.maxHp + " " + pairs[p] + " frame " + f);
          if (fi.y < 0) note("below the floor", fi.y + " frame " + f);
          const px = fi.x / FP;
          if (px < 0 || px > STAGE_W) note("outside the stage", px + " frame " + f);
          if (fi.meter < 0 || fi.meter > METER_MAX) note("meter out of range", fi.meter);
          /* a fighter frozen in one state for ten seconds is a softlock */
          const s = stuck[i];
          if (fi.state === s.st && fi.stateFrame === s.sf){ if (++s.n === 600) note("frozen state", stateNames[fi.state] + " sf " + fi.stateFrame + " " + pairs[p] + " frame " + f); }
          else { s.st = fi.state; s.sf = fi.stateFrame; s.n = 0; }
          /* projectile bookkeeping must match reality */
          const owned = g.projectiles.filter(pr => pr.owner === i && pr.single).length;
          if (fi.projCount !== owned) note("projectile count drift", fi.projCount + " tracked vs " + owned + " live, frame " + f);
        }
        if (g.projectiles.length > 12) note("projectile pile-up", g.projectiles.length + " at frame " + f);
      }
      matches++; totalFrames += f; longest = Math.max(longest, f);
      if (!g.matchOver){ neverEnded++; note("match never ended", pairs[p] + " " + level + " after " + f + " frames, hp " + g.fighters.map(x=>x.hp)); }
      if (g.matchOver && g.matchWinner >= 0 && g.fighters[g.matchWinner].wins < WINS_NEEDED && g.round <= 3)
        note("winner without the wins", "winner " + g.matchWinner + " wins " + g.fighters.map(x=>x.wins) + " round " + g.round);
    }
  }
  return { matches, totalFrames, longest, neverEnded, problems, spriteCache: spriteCache.size };
});
await browser.close();
const bad = r.problems.length + (errors.length ? 1 : 0);
console.log(r.matches + " matches, " + r.totalFrames.toLocaleString() + " frames simulated" +
            " (longest " + r.longest.toLocaleString() + ")");
console.log("sprite cache: " + r.spriteCache + " entries");
if (r.neverEnded) console.error(r.neverEnded + " match(es) never reached a result");
if (errors.length) console.error("page errors:\n  " + errors.join("\n  "));
if (r.problems.length){
  console.error(r.problems.length + " invariant violation(s):");
  for (const p of r.problems) console.error("  " + p);
}
if (bad || r.neverEnded){ process.exit(1); }
console.log("No invariant violations.");
