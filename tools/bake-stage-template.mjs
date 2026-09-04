#!/usr/bin/env node
/* Draws the background templates: one guide per parallax layer, at the exact
   canvas size the engine expects, marked with the part of it a player can
   actually see. Layers scroll at different rates, so the far layer needs far
   less width than the floor — painting all of them full width is wasted work.

     node tools/bake-stage-template.mjs
*/
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { openGame, ROOT } from "../tests/harness.mjs";

const { browser, page, errors } = await openGame();
const out = await page.evaluate(() => {
  const camMax = STAGE_W - W;                       /* how far the camera travels */
  const LAYERS = [
    { key:"far",   rate:0.25, h:H,               note:"sky, horizon, distant scenery" },
    { key:"near",  rate:0.55, h:H,               note:"mid scenery: the layer behind the fighters" },
    { key:"floor", rate:1.00, h:H - GROUND_Y + 10, note:"the ground the fighters stand on", drawnAt:GROUND_Y - 2 }
  ];
  const sheets = {};
  for (const L of LAYERS){
    const visible = Math.ceil(camMax * L.rate) + W;   /* the only part ever on screen */
    const cv = document.createElement("canvas");
    cv.width = STAGE_W; cv.height = L.h;
    const c = cv.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.fillStyle = "#101018"; c.fillRect(0, 0, STAGE_W, L.h);
    /* the region that is never on screen */
    c.fillStyle = "#07070c"; c.fillRect(visible, 0, STAGE_W - visible, L.h);
    c.fillStyle = "rgba(255,255,255,.05)";
    for (let x = 0; x < STAGE_W; x += 32) c.fillRect(x, 0, 1, L.h);
    for (let y = 0; y < L.h; y += 32) c.fillRect(0, y, STAGE_W, 1);
    /* one screen width, marked at both ends of the camera's travel */
    c.strokeStyle = "rgba(80,180,255,.9)"; c.lineWidth = 2;
    c.strokeRect(1, 1, W - 2, L.h - 2);
    c.strokeStyle = "rgba(80,180,255,.35)";
    c.strokeRect(Math.round(camMax * L.rate) + 1, 1, W - 2, L.h - 2);
    if (visible < STAGE_W){
      c.fillStyle = "rgba(255,80,120,.9)"; c.fillRect(visible, 0, 2, L.h);
    }
    if (L.key !== "floor"){
      c.fillStyle = "rgba(255,204,51,.9)"; c.fillRect(0, GROUND_Y, STAGE_W, 1);
      c.fillStyle = "rgba(255,204,51,.25)"; c.fillRect(0, GROUND_Y, STAGE_W, L.h - GROUND_Y);
    }
    c.font = "12px ui-monospace,Menlo,monospace"; c.textBaseline = "top";
    c.fillStyle = "#ffcc33";
    c.fillText(L.key.toUpperCase() + "  " + STAGE_W + "x" + L.h + "  scrolls at " + L.rate + "x", 8, 8);
    c.fillStyle = "#8fa0c0";
    c.fillText(L.note, 8, 24);
    c.fillText("only x 0-" + visible + " is ever visible" +
               (visible < STAGE_W ? " — everything right of the red line is wasted effort" : ""), 8, 40);
    if (L.key !== "floor") c.fillText("ground line y=" + GROUND_Y + "; the shaded band below it is hidden by the floor layer", 8, 56);
    else c.fillText("this layer is drawn at screen y=" + L.drawnAt + ", so its row 0 is the ground line", 8, 56);
    c.fillStyle = "rgba(80,180,255,.9)";
    c.fillText("blue: one screen (" + W + "x" + H + ") at each end of the camera's travel", 8, 72);
    sheets[L.key] = { data: cv.toDataURL("image/png").split(",")[1], w: STAGE_W, h: L.h, visible, rate: L.rate };
  }
  return { sheets, W, H, GROUND_Y, STAGE_W, camMax };
});
await browser.close();
if (errors.length){ console.error("Page errors:\n  " + errors.join("\n  ")); process.exit(1); }

const dir = resolve(ROOT, "art");
mkdirSync(dir, { recursive: true });
for (const [k, v] of Object.entries(out.sheets)){
  writeFileSync(resolve(dir, "stage-" + k + "-template.png"), Buffer.from(v.data, "base64"));
  console.log("stage-" + k + "-template.png  " + v.w + "x" + v.h +
              "  scroll " + v.rate + "x  visible 0-" + v.visible);
}
console.log("screen " + out.W + "x" + out.H + ", ground line y=" + out.GROUND_Y +
            ", stage width " + out.STAGE_W + ", camera travel " + out.camMax + "px");
