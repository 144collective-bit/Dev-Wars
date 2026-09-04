#!/usr/bin/env node
/* Bakes the sprite-sheet templates and per-character reference atlases.

   The reference atlases are the current rig art laid out in the shipping
   sheet format. An artist replaces them frame for frame: same grid, same
   origin, same silhouette timing, better art. Because the layout and the
   animation timings come from the game itself, a repainted sheet drops
   straight in — there is no second source of truth to keep in step.

     node tools/bake-atlas.mjs
*/
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { openGame, ROOT } from "../tests/harness.mjs";

/* Cell geometry. The drawn art currently spans 93x95 px, so a 128 cell leaves
   roughly 20 px of growing room on every side for cloth, hair and weapons. */
const CELL = 128, COLS = 8, ROWS = 8;
const OX = 64;    /* the fighter's centre line, in cell pixels          */
const OY = 112;   /* the floor: the soles of the feet rest on this row  */

/* Sheet order. Grouped so a row reads as one idea, which matters when someone
   is working through 54 frames. Empty slots are reserved, not spare. */
const LAYOUT = [
  ["idle1","idle2","idle3","crouch","blockHi","blockLo","land","win"],
  ["walk1","walk2","walk3","walk4","walk5","jumpUp","jumpBall","jumpFall"],
  ["hitHi","hitLo","hitAir","fall1","fall2","down","getup",null],
  ["jabStart","jab","straight","fierceWind","fierce","crJab","crStrong","crFierce"],
  ["shortStart","shortKick","midKick","highKick","crShort","crMid","sweepWind","sweep"],
  ["airJab","airFierce","airShort","airHeavy",null,null,null,null],
  ["boltWind","boltFire","riseWind","rise","spin1","spin2","grabReach","grabHold"],
  ["lance","fang","superHold",null,null,null,null,null]
];
const ROW_LABELS = ["STANCE","LOCOMOTION","REACTIONS","PUNCHES","KICKS","AIR ATTACKS","SPECIALS","SPECIALS"];

const { browser, page, errors } = await openGame();

const out = await page.evaluate(({ CELL, COLS, ROWS, OX, OY, LAYOUT, ROW_LABELS }) => {
  const W = CELL * COLS, H = CELL * ROWS;
  const missing = [];
  for (const row of LAYOUT) for (const n of row) if (n && !POSE[n]) missing.push(n);
  /* A pose used only as a per-character override does not get a cell of its
     own: it replaces that character's existing cell, on that character's own
     sheet. Sommi's slouch is cell 00 on his sheet and the shared idle is cell
     00 on everyone else's. */
  const overrides = new Set();
  for (const ch of CHARACTERS)
    for (const k in (ch.poses || {})) overrides.add(ch.poses[k].$name);
  const unplaced = Object.keys(POSE)
    .filter(n => !LAYOUT.some(r => r.includes(n)) && !overrides.has(n));

  const sheet = (draw) => {
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const c = cv.getContext("2d");
    c.imageSmoothingEnabled = false;
    draw(c);
    return cv.toDataURL("image/png").split(",")[1];
  };
  const cellAt = (r, i) => ({ x: i * CELL, y: r * CELL });

  /* --- reference atlas: the rig art, ready to be painted over ------------- */
  const reference = {};
  for (const ch of CHARACTERS){
    reference[ch.key] = sheet(c => {
      for (let r = 0; r < ROWS; r++) for (let i = 0; i < COLS; i++){
        const name = LAYOUT[r][i];
        if (!name) continue;
        const { x, y } = cellAt(r, i);
        const pose = (ch.poses && ch.poses[name]) || POSE[name];
        const spr = getSprite(ch, pose, 1, null);
        c.drawImage(spr, x + OX - SPRITE_OX, y + OY - SPRITE_OY);
      }
    });
  }

  /* --- blank template: guides only, with the art ghosted underneath ------- */
  const template = sheet(c => {
    c.fillStyle = "#101018"; c.fillRect(0, 0, W, H);
    for (let r = 0; r < ROWS; r++) for (let i = 0; i < COLS; i++){
      const { x, y } = cellAt(r, i);
      const name = LAYOUT[r][i];
      c.fillStyle = name ? ((r + i) % 2 ? "#181824" : "#141420") : "#0c0c12";
      c.fillRect(x, y, CELL, CELL);
      if (name){
        c.globalAlpha = 0.22;
        const spr = getSprite(CHARACTERS[0], POSE[name], 1, null);
        c.drawImage(spr, x + OX - SPRITE_OX, y + OY - SPRITE_OY);
        c.globalAlpha = 1;
        /* the floor line and the centre line: the two things that must match */
        c.fillStyle = "rgba(255,80,120,.85)";
        c.fillRect(x, y + OY, CELL, 1);
        c.fillStyle = "rgba(80,180,255,.55)";
        c.fillRect(x + OX, y, 1, CELL);
        c.fillStyle = "#ffcc33";
        c.fillRect(x + OX - 4, y + OY, 9, 1); c.fillRect(x + OX, y + OY - 4, 1, 9);
        /* index and name both at the top: the bottom of the cell belongs to
           the floor line and the row label. */
        c.font = "9px ui-monospace,Menlo,monospace"; c.textBaseline = "top";
        c.fillStyle = "#6a7a96"; c.fillText(String(r * COLS + i).padStart(2, "0"), x + 5, y + 5);
        c.fillStyle = "#e8e6f0"; c.fillText(name, x + 22, y + 5);
      } else {
        c.strokeStyle = "rgba(255,255,255,.06)"; c.beginPath();
        c.moveTo(x, y); c.lineTo(x + CELL, y + CELL); c.stroke();
        c.font = "9px ui-monospace,Menlo,monospace"; c.fillStyle = "#3a3a4a";
        c.textBaseline = "top"; c.fillText("reserved", x + 4, y + 4);
      }
      c.strokeStyle = "rgba(255,255,255,.16)";
      c.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
    }
    /* row labels down the left gutter */
    c.save(); c.font = "10px ui-monospace,Menlo,monospace"; c.textBaseline = "alphabetic";
    for (let r = 0; r < ROWS; r++){
      c.save();
      c.translate(12, r * CELL + CELL - 8); c.rotate(-Math.PI/2);
      c.fillStyle = "rgba(0,0,0,.55)"; c.fillRect(-2, -10, c.measureText(ROW_LABELS[r]).width + 6, 13);
      c.fillStyle = "rgba(255,204,51,.9)"; c.fillText(ROW_LABELS[r], 2, 0);
      c.restore();
    }
    c.restore();
  });

  /* --- animation timing table, straight from the game -------------------- */
  const anims = {};
  for (const k in ANIM) anims[k] = { loop: ANIM[k].loop, frames: ANIM[k].frames.map(f => [f[0].$name, f[1]]) };
  const moves = {};
  for (const m of ALL_MOVES){
    if (moves[m.name]) continue;
    moves[m.name] = { startup:m.startup, active:m.active, recovery:m.recovery,
                      frames:m.anim.frames.map(f => f[0].$name) };
  }
  return { reference, template, missing, unplaced, anims, moves,
           counts:{ frames: LAYOUT.flat().filter(Boolean).length, poses: Object.keys(POSE).length } };
}, { CELL, COLS, ROWS, OX, OY, LAYOUT, ROW_LABELS });

await browser.close();
if (errors.length){ console.error("Page errors:\n  " + errors.join("\n  ")); process.exit(1); }
if (out.missing.length){ console.error("Layout names not in the rig: " + out.missing.join(", ")); process.exit(1); }
if (out.unplaced.length){ console.error("Rig poses missing from the layout: " + out.unplaced.join(", ")); process.exit(1); }

const dir = resolve(ROOT, "art");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "sprite-sheet-template.png"), Buffer.from(out.template, "base64"));
for (const [key, data] of Object.entries(out.reference))
  writeFileSync(resolve(dir, "reference-" + key + ".png"), Buffer.from(data, "base64"));
writeFileSync(resolve(dir, "atlas-layout.json"), JSON.stringify({
  cell: CELL, cols: COLS, rows: ROWS, originX: OX, originY: OY,
  sheetWidth: CELL*COLS, sheetHeight: CELL*ROWS,
  layout: LAYOUT, rowLabels: ROW_LABELS,
  animations: out.anims, moves: out.moves
}, null, 1) + "\n");

console.log("atlas " + (CELL*COLS) + "x" + (CELL*ROWS) + ", " + COLS + "x" + ROWS +
            " cells of " + CELL + "px, origin (" + OX + "," + OY + ")");
console.log(out.counts.frames + " frames placed, " + out.counts.poses + " poses in the rig — all accounted for");
console.log("wrote art/sprite-sheet-template.png, " + Object.keys(out.reference).length +
            " reference sheets, art/atlas-layout.json");
