/* ============================================================================
   STAGES
   ----------------------------------------------------------------------------
   Each stage is baked once into a few parallax layers, then blitted per frame.
   Backgrounds are purely cosmetic and never touch the simulation.
   ========================================================================== */

function newLayer(w, h){
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  return cv;
}
/* Banded vertical gradient — stepped on purpose, so it dithers like pixel art
   instead of smearing like a CSS gradient. */
function bands(ctx, x, y, w, h, colors){
  const n = colors.length, step = h / n;
  for (let i = 0; i < n; i++){
    ctx.fillStyle = colors[i];
    ctx.fillRect(x, Math.round(y + i*step), w, Math.ceil(step) + 1);
  }
}
function noiseSpeckle(ctx, x, y, w, h, color, count, rng){
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++)
    ctx.fillRect(x + rng() % w, y + rng() % h, 1, 1);
}

function buildStage(key){
  const rng = makeRNG(key.length * 7717 + 13);
  const far = newLayer(STAGE_W, H), near = newLayer(STAGE_W, H);
  const f = far.getContext("2d"), n = near.getContext("2d");
  const FL = GROUND_Y;                       /* floor line */
  let floorTop, floorBot, accent;

  if (key === "dockyard"){
    accent = "#7fd8ff";
    bands(f, 0, 0, STAGE_W, FL - 30, ["#2a2148","#3a2b58","#54386a","#7a4a72","#a5636f","#d08a6f","#e8ab74"]);
    /* sea */
    f.fillStyle = "#243a5e"; f.fillRect(0, FL - 42, STAGE_W, 26);
    for (let i = 0; i < 220; i++){
      const yy = FL - 42 + (rng() % 24);
      f.fillStyle = (rng() % 3) ? "#3a5c86" : "#c8916a";
      f.fillRect(rng() % STAGE_W, yy, 2 + (rng() % 5), 1);
    }
    /* distant cranes */
    for (let i = 0; i < 7; i++){
      const bx = 40 + i * 130 + (rng() % 40), bh = 46 + (rng() % 26);
      f.fillStyle = "#1d2036";
      f.fillRect(bx, FL - 42 - bh, 5, bh);
      f.fillRect(bx - 26, FL - 42 - bh, 60, 4);
      f.fillRect(bx + 26, FL - 42 - bh, 3, 14);
      f.fillStyle = "#e8ab74";
      f.fillRect(bx + 1, FL - 44 - bh, 3, 2);
    }
    /* containers */
    const cols = ["#b8442f","#2f6fb8","#c9a021","#3a8c5c","#7a3fa0"];
    for (let i = 0; i < 26; i++){
      const cw = 46 + (rng()%20), chh = 22, cx = (rng() % (STAGE_W - 60)), stack = 1 + (rng() % 3);
      for (let s = 0; s < stack; s++){
        const cy = FL - 18 - chh*(s+1);
        n.fillStyle = "#14141f"; n.fillRect(cx-1, cy-1, cw+2, chh+2);
        n.fillStyle = cols[rng() % cols.length]; n.fillRect(cx, cy, cw, chh);
        n.fillStyle = "rgba(0,0,0,.22)";
        for (let r = 4; r < cw - 3; r += 5) n.fillRect(cx + r, cy + 3, 2, chh - 6);
      }
    }
    /* shadowed dock wall, so the backdrop meets the floor instead of ending */
    n.fillStyle = "#1b1420"; n.fillRect(0, FL - 20, STAGE_W, 22);
    n.fillStyle = "#2a1f2c"; n.fillRect(0, FL - 20, STAGE_W, 3);
    floorTop = "#6b4a30"; floorBot = "#3b2718";
  }
  else if (key === "foundry"){
    accent = "#ffb347";
    bands(f, 0, 0, STAGE_W, FL - 20, ["#1d1218","#24141a","#31171c","#401c1e","#522420","#6b2f22"]);
    /* roof trusses and hanging lamps, so the top half is not dead space */
    f.fillStyle = "#0e0a10";
    f.fillRect(0, 8, STAGE_W, 7);
    for (let x = 0; x < STAGE_W; x += 26){
      f.fillRect(x, 15, 3, 10);
      f.fillRect(x, 24, 26, 3);
    }
    for (let i = 0; i < 12; i++){
      const lx = 34 + i * 74;
      f.fillStyle = "#0e0a10"; f.fillRect(lx, 27, 2, 14);          /* chain */
      f.fillStyle = "#241820"; f.fillRect(lx - 7, 41, 16, 5);      /* shade */
      f.fillStyle = "#ffd98a"; f.fillRect(lx - 4, 46, 10, 2);      /* filament */
      f.fillStyle = "rgba(255,190,90,.10)";
      for (let k = 0; k < 5; k++) f.fillRect(lx - 5 - k*4, 48 + k*7, 12 + k*8, 7);
    }
    /* furnace mouths glowing */
    for (let i = 0; i < 6; i++){
      const bx = 60 + i * 145, by = FL - 96;
      f.fillStyle = "#0d0810"; f.fillRect(bx - 30, by, 76, 78);
      for (let g = 0; g < 7; g++){
        f.fillStyle = ["#3a1408","#5c1e08","#8a2f08","#c4550c","#ee8a18","#ffcc44","#ffe9a8"][g];
        f.fillRect(bx - 20 + g*2, by + 26 + g*2, 56 - g*4, 44 - g*4);
      }
    }
    /* girders */
    n.fillStyle = "#1a1a24";
    for (let i = 0; i < 14; i++) n.fillRect(i*68, FL - 130, 9, 118);
    n.fillRect(0, FL - 134, STAGE_W, 8);
    n.fillStyle = "#2a2a38";
    for (let i = 0; i < 14; i++) n.fillRect(i*68 + 2, FL - 130, 3, 118);
    n.fillStyle = "#3a3a4c";
    for (let i = 0; i < 14; i++){ n.fillRect(i*68 - 4, FL - 128, 17, 3); n.fillRect(i*68 - 4, FL - 74, 17, 3); }
    /* molten channel behind the fighters */
    n.fillStyle = "#14141f"; n.fillRect(0, FL - 16, STAGE_W, 6);
    n.fillStyle = "#ff8c1a"; n.fillRect(0, FL - 15, STAGE_W, 4);
    noiseSpeckle(n, 0, FL - 15, STAGE_W, 4, "#ffe9a8", 400, rng);
    floorTop = "#3c3742"; floorBot = "#1a1820";
  }
  else { /* neon */
    accent = "#25f0d0";
    bands(f, 0, 0, STAGE_W, FL - 6, ["#08061c","#100a2c","#191040","#28154e","#3c1c56","#57235a","#7c3057"]);
    /* far skyline: flat silhouettes only, so the near towers read as nearer */
    for (let i = 0; i < 44; i++){
      const bw = 24 + (rng()%52), bh = 26 + (rng()%62), bx = (rng() % (STAGE_W - 40));
      f.fillStyle = "#180f32";
      f.fillRect(bx, FL - 26 - bh, bw, bh + 26);
    }
    /* near towers, lit edge and window grid */
    for (let i = 0; i < 18; i++){
      const bw = 40 + (rng()%38), bh = 58 + (rng()%80), bx = (rng() % (STAGE_W - 52));
      const top = FL - 24 - bh;
      n.fillStyle = "#0b0818"; n.fillRect(bx - 1, top - 1, bw + 2, bh + 26);
      n.fillStyle = "#1b1636"; n.fillRect(bx, top, bw, bh + 24);
      n.fillStyle = "#282249"; n.fillRect(bx, top, 3, bh + 24);
      n.fillStyle = "#100c22"; n.fillRect(bx + bw - 3, top, 3, bh + 24);
      for (let wy = top + 6; wy < FL - 30; wy += 8)
        for (let wx = bx + 5; wx < bx + bw - 5; wx += 7)
          if (rng() % 3 === 0){
            n.fillStyle = (rng()%4) ? "#f2d98a" : "#7fe8ff";
            n.fillRect(wx, wy, 3, 4);
          }
    }
    /* hanging neon banners */
    const neons = ["#ff3d8b","#25f0d0","#ffd93d","#8a5cff","#4dd2ff"];
    for (let i = 0; i < 14; i++){
      const cx = 26 + i*62 + (rng()%22), cy = FL - 100 - (rng()%44);
      const col = neons[rng() % neons.length], wdt = 7 + (rng()%4), hgt = 26 + (rng()%22);
      n.fillStyle = "rgba(255,255,255,.06)"; n.fillRect(cx - 4, cy - 4, wdt + 8, hgt + 8);
      n.fillStyle = "#0b0818"; n.fillRect(cx - 1, cy - 1, wdt + 2, hgt + 2);
      n.fillStyle = col; n.fillRect(cx, cy, wdt, hgt);
      n.fillStyle = "rgba(255,255,255,.55)"; n.fillRect(cx + 1, cy + 1, 2, hgt - 2);
      n.fillStyle = "rgba(0,0,0,.34)";
      for (let t = 5; t < hgt - 2; t += 6) n.fillRect(cx, cy + t, wdt, 2);
    }
    /* street-level wall and its reflected glow */
    n.fillStyle = "#07091a"; n.fillRect(0, FL - 24, STAGE_W, 26);
    n.fillStyle = "#161d38"; n.fillRect(0, FL - 24, STAGE_W, 3);
    for (let x = 8; x < STAGE_W; x += 46){
      n.fillStyle = "rgba(37,240,208,.30)"; n.fillRect(x, FL - 18, 18, 2);
      n.fillStyle = "rgba(255,61,139,.22)"; n.fillRect(x + 24, FL - 12, 12, 2);
    }
    floorTop = "#20222e"; floorBot = "#0e0f16";
  }

  /* floor is shared geometry; only the palette changes per stage */
  const floor = newLayer(STAGE_W, H - FL + 10);
  const fc = floor.getContext("2d");
  bands(fc, 0, 0, STAGE_W, H - FL + 10, [floorTop, floorTop, floorBot]);
  fc.fillStyle = "rgba(0,0,0,.35)";
  for (let x = 0; x < STAGE_W; x += 16) fc.fillRect(x, 0, 1, H - FL + 10);
  for (let y = 4; y < H - FL + 10; y += 6) fc.fillRect(0, y, STAGE_W, 1);
  fc.fillStyle = "#14141f"; fc.fillRect(0, 0, STAGE_W, 2);

  return { far, near, floor, accent, floorY: FL };
}

const STAGES = {};
function stageFor(key){
  if (!STAGES[key]) STAGES[key] = buildStage(key);
  return STAGES[key];
}
