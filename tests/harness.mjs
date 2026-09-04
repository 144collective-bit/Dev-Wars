/* Shared test plumbing: find Playwright, open the game, and hash the world. */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const GAME_URL = "file://" + resolve(ROOT, "fighter.html");

/* Prefer a local devDependency; fall back to a global install so the suite
   runs in a bare container too. */
export async function loadPlaywright(){
  try { return await import("playwright"); }
  catch { return await import("/opt/node22/lib/node_modules/playwright/index.mjs"); }
}

export async function openGame({ viewport = { width:1024, height:640 } } = {}){
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/ERR_|TUNNEL/.test(m.text())) errors.push(m.text()); });
  await page.goto(GAME_URL);
  await page.waitForFunction(() => typeof Game !== "undefined");
  return { browser, page, errors };
}

/* Installed into the page.

   Folds one frame of simulation state into a rolling hash. Every frame is
   mixed in, not every Nth — sampling periodically lets a transient difference
   (a pose held for a few frames, a hitbox that appears and is gone again)
   slip between the samples, which is precisely the class of change this
   suite exists to catch. Deeper than the game's own desync checksum, because
   a golden test should fail on ANY drift, not just what matters to netplay. */
export const INSTALL_DEEP_HASH = () => {
  globalThis.__foldFrame = function(g, h){
    const mix = v => { h ^= (v | 0); h = Math.imul(h, 0x01000193) >>> 0; };
    mix(g.frame); mix(g.timer); mix(g.phase); mix(g.phaseTimer);
    mix(g.round); mix(g.hitstop); mix(g.matchOver ? 1 : 0); mix(g.matchWinner);
    for (const f of g.fighters){
      mix(f.x); mix(f.y); mix(f.vx); mix(f.vy); mix(f.facing);
      mix(f.hp); mix(f.meter); mix(f.wins);
      mix(f.state); mix(f.stateFrame); mix(f.moveId);
      mix(f.hitstun); mix(f.blockstun); mix(f.downTimer); mix(f.invuln);
      mix(f.airborne ? 1 : 0); mix(f.crouching ? 1 : 0); mix(f.guarding ? 1 : 0);
      mix(f.hitCount); mix(f.rehitTimer); mix(f.comboHits); mix(f.projCount);
      mix(f.cancelOk ? 1 : 0); mix(f.pressBuf); mix(f.prevIn); mix(f.curIn);
      mix(f.mb.chargeBack); mix(f.mb.chargeDown);
      /* Hurtboxes are derived from the current pose, so folding them in is
         what makes an art-only edit visible to this suite. */
      for (const b of f.hurtBoxes()){
        mix(Math.round(b.x)); mix(Math.round(b.y));
        mix(Math.round(b.w)); mix(Math.round(b.h));
      }
      const hb = f.hitBox();
      mix(hb ? Math.round(hb.x) : -1); mix(hb ? Math.round(hb.y) : -1);
      mix(hb ? Math.round(hb.w) : -1); mix(hb ? Math.round(hb.h) : -1);
    }
    mix(g.projectiles.length);
    for (const p of g.projectiles){
      mix(p.x); mix(p.y); mix(p.vx); mix(p.owner); mix(p.hits); mix(p.life); mix(p.facing);
    }
    return h >>> 0;
  };
};
