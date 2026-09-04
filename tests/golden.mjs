#!/usr/bin/env node
/* Replay-hash golden tests.

   The simulation is deterministic, so a fixed input script must always produce
   the same state. Each scenario is replayed and hashed every 60 frames; the
   hashes are committed in golden.json. Any unintended change to the
   simulation — a nudged pushback value, a changed hurtbox, a reordered move
   registry — fails here immediately and names the frame it first diverged.

     node tests/golden.mjs            check against the committed hashes
     node tests/golden.mjs --update   rewrite them (only for intended changes)
*/
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { openGame, ROOT, INSTALL_DEEP_HASH } from "./harness.mjs";
import { SCENARIOS, INSTALL_DRIVERS } from "./scenarios.mjs";

const GOLDEN_PATH = resolve(ROOT, "tests/golden.json");
const UPDATE = process.argv.includes("--update");
const CHECKPOINT = 60;

const { browser, page, errors } = await openGame();
await page.evaluate(INSTALL_DEEP_HASH);
await page.evaluate(INSTALL_DRIVERS);

const results = {};
for (const sc of SCENARIOS){
  results[sc.name] = await page.evaluate(({ sc, checkpoint }) => {
    const g = new Game(sc.chars, sc.seed);
    const drive = __makeDriver(sc);
    const marks = [];
    let h = 0x811c9dc5;
    for (let i = 0; i < sc.frames; i++){
      g.step(drive(g));
      h = __foldFrame(g, h);                       /* every frame, not every Nth */
      if ((i + 1) % checkpoint === 0) marks.push(h);
      if (g.matchOver) break;
    }
    return {
      marks,
      final: h,
      frames: g.frame,
      hp: g.fighters.map(f => f.hp),
      wins: g.fighters.map(f => f.wins),
      round: g.round,
      over: g.matchOver
    };
  }, { sc, checkpoint: CHECKPOINT });
}
await browser.close();

if (errors.length){
  console.error("Page errors during replay:\n  " + errors.join("\n  "));
  process.exit(1);
}

if (UPDATE || !existsSync(GOLDEN_PATH)){
  writeFileSync(GOLDEN_PATH, JSON.stringify(results, null, 1) + "\n");
  console.log((existsSync(GOLDEN_PATH) ? "Wrote" : "Created") + " goldens for " +
              Object.keys(results).length + " scenarios.");
  for (const [n, r] of Object.entries(results))
    console.log("  " + n.padEnd(22) + r.frames + " frames, hp " + r.hp.join("/") +
                ", rounds " + r.wins.join("-") + (r.over ? ", match over" : ""));
  process.exit(0);
}

const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
let failed = 0;
for (const sc of SCENARIOS){
  const got = results[sc.name], want = golden[sc.name];
  if (!want){ console.error("FAIL " + sc.name + " — no golden recorded. Run with --update."); failed++; continue; }
  if (got.final === want.final && got.frames === want.frames){
    console.log("pass " + sc.name.padEnd(22) + got.frames + " frames");
    continue;
  }
  failed++;
  const at = got.marks.findIndex((h, i) => h !== want.marks[i]);
  const frame = at < 0 ? got.frames : (at + 1) * CHECKPOINT;
  console.error("FAIL " + sc.name);
  console.error("     first divergence at frame ~" + frame +
                (at < 0 ? " (tail of the run)" : " (checkpoint " + at + ")"));
  console.error("     frames  " + want.frames + " -> " + got.frames);
  console.error("     hp      " + want.hp.join("/") + " -> " + got.hp.join("/"));
  console.error("     rounds  " + want.wins.join("-") + " -> " + got.wins.join("-"));
}
if (failed){
  console.error("\n" + failed + " scenario(s) diverged. If the change was intended, " +
                "re-record with:  node tests/golden.mjs --update\n" +
                "Remember that an intended simulation change also needs GAME_VERSION bumped.");
  process.exit(1);
}
console.log("\nAll " + SCENARIOS.length + " scenarios match the committed goldens.");
