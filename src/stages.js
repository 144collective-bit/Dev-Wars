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

/* Three stages, built with the console's own toolkit: dithered gradients
   instead of blends, silhouettes in flat tone steps, and detail deliberately
   kept away from the band where the fighters stand. Atmospheric perspective
   does the depth — distant shapes are lighter and bluer, near ones darker and
   more saturated — which is how a 16-bit background reads as deep without
   ever leaving the palette. */
function buildStage(key){
  const rng = makeRNG(key.length * 7717 + 13);
  const far = newLayer(STAGE_W, H), near = newLayer(STAGE_W, H);
  const f = far.getContext("2d"), n = near.getContext("2d");
  const FL = GROUND_Y;
  let floorTop, floorMid, floorBot, accent;
  const pick = a => a[rng() % a.length];

  if (key === "dockyard"){
    accent = md("#7fd8ff");
    /* Dusk, dithered through four hue steps rather than blended. */
    ditherGradient(f, 0, 0, STAGE_W, 46, md("#241a4e"), md("#4a2a63"));
    ditherGradient(f, 0, 46, STAGE_W, 44, md("#4a2a63"), md("#8a4668"));
    ditherGradient(f, 0, 90, STAGE_W, 34, md("#8a4668"), md("#c8705c"));
    ditherGradient(f, 0, 124, STAGE_W, 22, md("#c8705c"), md("#e8a86a"));
    /* A low sun and its glow, dithered outward. */
    const sunX = 250, sunY = 138;
    for (let r = 30; r > 0; r -= 3)
      ditherRect(f, sunX - r*2, sunY - r/2, r*4, r, null, md("#ffce90"), 1 - r/32);
    f.fillStyle = md("#ffe9a8"); f.fillRect(sunX - 13, sunY - 4, 26, 9);

    /* Distant cranes: pale and blue with distance. */
    for (let i = 0; i < 9; i++){
      const bx = 20 + i * 104 + (rng() % 50), bh = 40 + (rng() % 30);
      f.fillStyle = md("#6a5a86");
      f.fillRect(bx, FL - 44 - bh, 4, bh);
      f.fillRect(bx - 22, FL - 44 - bh, 52, 3);
      f.fillRect(bx + 24, FL - 44 - bh, 2, 12);
    }
    /* Water, with a dithered band of reflected sun. */
    ditherGradient(f, 0, FL - 44, STAGE_W, 28, md("#3a5c86"), md("#1e2f52"));
    for (let i = 0; i < 260; i++){
      const yy = FL - 44 + (rng() % 26);
      const near_ = (yy - (FL - 44)) / 26;
      f.fillStyle = (rng() % 5) ? md("#4a74a0") : md("#e8a86a");
      f.fillRect(rng() % STAGE_W, yy, 2 + (rng() % (near_ > 0.5 ? 6 : 3)), 1);
    }

    /* Containers, each a three-tone box with a lit top edge. */
    const cols = ["#b8442f","#2f6fb8","#c9a021","#3a8c5c","#7a3fa0","#c25e1e"];
    for (let i = 0; i < 30; i++){
      const cw = 44 + (rng()%22), chh = 22, cx = (rng() % (STAGE_W - 60)), stack = 1 + (rng() % 3);
      const R = ramp(pick(cols));
      for (let s2 = 0; s2 < stack; s2++){
        const cy = FL - 22 - chh*(s2+1);
        n.fillStyle = md("#14141f"); n.fillRect(cx-1, cy-1, cw+2, chh+2);
        n.fillStyle = R.sh;  n.fillRect(cx, cy, cw, chh);
        n.fillStyle = R.mid; n.fillRect(cx, cy, cw, chh - 4);
        n.fillStyle = R.lit; n.fillRect(cx, cy, cw, 2);
        n.fillStyle = R.dk;
        for (let r = 4; r < cw - 3; r += 5) n.fillRect(cx + r, cy + 3, 2, chh - 7);
      }
    }
    /* The dock wall the fighters stand in front of: dark, so the sprites pop. */
    ditherGradient(n, 0, FL - 24, STAGE_W, 26, md("#2a1f2c"), md("#140f18"));
    n.fillStyle = md("#3a2c3e"); n.fillRect(0, FL - 24, STAGE_W, 2);
    for (let x = 6; x < STAGE_W; x += 48){
      n.fillStyle = md("#241a26"); n.fillRect(x, FL - 22, 5, 22);
    }
    floorTop = md("#7a5636"); floorMid = md("#5a3e26"); floorBot = md("#2e1e14");
  }
  else if (key === "foundry"){
    accent = md("#ffb347");
    ditherGradient(f, 0, 0, STAGE_W, 60, md("#160f18"), md("#2a1620"));
    ditherGradient(f, 0, 60, STAGE_W, 60, md("#2a1620"), md("#4a2020"));
    ditherGradient(f, 0, 120, STAGE_W, FL - 140, md("#4a2020"), md("#6e2e1e"));
    /* Roof trusses and lamps with dithered light cones. */
    f.fillStyle = md("#100b12"); f.fillRect(0, 8, STAGE_W, 7);
    for (let x = 0; x < STAGE_W; x += 26){ f.fillRect(x, 15, 3, 10); f.fillRect(x, 24, 26, 3); }
    for (let i = 0; i < 12; i++){
      const lx = 34 + i * 74;
      for (let k = 0; k < 4; k++)
        ditherRect(f, lx - 6 - k*4, 46 + k*8, 14 + k*8, 8, null, md("#ffb347"), 0.34 - k*0.07);
      f.fillStyle = md("#100b12"); f.fillRect(lx, 27, 2, 14);
      f.fillStyle = md("#2a1c22"); f.fillRect(lx - 7, 41, 16, 5);
      f.fillStyle = md("#ffe9a8"); f.fillRect(lx - 4, 46, 10, 2);
    }
    /* Furnace mouths: concentric dithered heat rather than hard rings. */
    for (let i = 0; i < 6; i++){
      const bx = 60 + i * 145, by = FL - 100;
      f.fillStyle = md("#0d0810"); f.fillRect(bx - 32, by, 78, 82);
      const heat = ["#3a1408","#6e2208","#a83a0a","#d4600c","#ffa020","#ffe9a8"];
      for (let g = 0; g < heat.length; g++){
        const inset = g * 4;
        f.fillStyle = md(heat[g]);
        f.fillRect(bx - 24 + inset, by + 26 + inset, 62 - inset*2, 48 - inset*2);
        /* a single dithered row where each step meets the next, so the rings
           blend without turning the whole mouth into speckle */
        if (g < heat.length - 1)
          ditherRect(f, bx - 24 + inset, by + 26 + inset, 62 - inset*2, 2,
                     null, md(heat[g + 1]), 0.5);
      }
    }
    /* Girders, three tones so they read as steel and not cardboard. */
    for (let i = 0; i < 14; i++){
      const gx = i*68;
      n.fillStyle = md("#14141c"); n.fillRect(gx - 1, FL - 132, 11, 122);
      n.fillStyle = md("#2e2e3c"); n.fillRect(gx, FL - 132, 9, 122);
      n.fillStyle = md("#4a4a5e"); n.fillRect(gx + 1, FL - 132, 3, 122);
      n.fillStyle = md("#5e5e74");
      n.fillRect(gx - 5, FL - 128, 19, 3); n.fillRect(gx - 5, FL - 74, 19, 3);
    }
    n.fillStyle = md("#14141c"); n.fillRect(0, FL - 138, STAGE_W, 9);
    /* Molten channel, glowing up into the dark. */
    ditherGradient(n, 0, FL - 26, STAGE_W, 20, md("#1a1016"), md("#4a1e10"));
    n.fillStyle = md("#14141f"); n.fillRect(0, FL - 8, STAGE_W, 4);
    ditherRect(n, 0, FL - 6, STAGE_W, 5, md("#d4600c"), md("#ffa020"), 0.5);
    noiseSpeckle(n, 0, FL - 6, STAGE_W, 5, md("#ffe9a8"), 340, rng);
    floorTop = md("#4a4456"); floorMid = md("#302c3a"); floorBot = md("#16141c");
  }
  else { /* neon */
    accent = md("#25f0d0");
    ditherGradient(f, 0, 0, STAGE_W, 70, md("#0a0620"), md("#181048"));
    ditherGradient(f, 0, 70, STAGE_W, 60, md("#181048"), md("#3a1a5e"));
    ditherGradient(f, 0, 130, STAGE_W, FL - 140, md("#3a1a5e"), md("#8a2f56"));
    /* Far skyline: light and hazy, no detail — distance. */
    for (let i = 0; i < 46; i++){
      const bw = 24 + (rng()%52), bh = 26 + (rng()%60), bx = (rng() % (STAGE_W - 40));
      f.fillStyle = md("#2e1f52"); f.fillRect(bx, FL - 30 - bh, bw, bh + 30);
    }
    ditherRect(f, 0, FL - 64, STAGE_W, 40, null, md("#5e2f6e"), 0.35);
    /* Near towers: darker, lit windows, a lit edge down the near side. */
    for (let i = 0; i < 18; i++){
      const bw = 40 + (rng()%38), bh = 58 + (rng()%80), bx = (rng() % (STAGE_W - 52));
      const top = FL - 26 - bh;
      n.fillStyle = md("#08061a"); n.fillRect(bx - 1, top - 1, bw + 2, bh + 28);
      n.fillStyle = md("#181236"); n.fillRect(bx, top, bw, bh + 26);
      n.fillStyle = md("#2a2050"); n.fillRect(bx, top, 3, bh + 26);
      for (let wy = top + 6; wy < FL - 32; wy += 8)
        for (let wx = bx + 5; wx < bx + bw - 5; wx += 7)
          if (rng() % 3 === 0){
            n.fillStyle = (rng()%4) ? md("#f2d98a") : md("#7fe8ff");
            n.fillRect(wx, wy, 3, 4);
          }
    }
    /* Signs, each with a dithered halo — the closest the hardware got to bloom. */
    const neons = ["#ff3d8b","#25f0d0","#ffd93d","#8a5cff","#4dd2ff"];
    for (let i = 0; i < 14; i++){
      const cx = 26 + i*62 + (rng()%22), cy = FL - 104 - (rng()%40);
      const col = md(pick(neons)), wdt = 7 + (rng()%4), hgt = 26 + (rng()%22);
      ditherRect(n, cx - 4, cy - 4, wdt + 8, hgt + 8, null, col, 0.16);
      ditherRect(n, cx - 2, cy - 2, wdt + 4, hgt + 4, null, col, 0.42);
      n.fillStyle = md("#08061a"); n.fillRect(cx - 1, cy - 1, wdt + 2, hgt + 2);
      n.fillStyle = col; n.fillRect(cx, cy, wdt, hgt);
      n.fillStyle = "#ffffff"; n.fillRect(cx + 1, cy + 1, 2, hgt - 2);
      n.fillStyle = md("#08061a");
      for (let t = 7; t < hgt - 3; t += 9) n.fillRect(cx, cy + t, wdt, 2);
    }
    /* Street level: dark, with the signs bleeding onto the wet wall. */
    ditherGradient(n, 0, FL - 26, STAGE_W, 28, md("#0e1226"), md("#05060f"));
    n.fillStyle = md("#1a2244"); n.fillRect(0, FL - 26, STAGE_W, 2);
    for (let x = 8; x < STAGE_W; x += 46){
      ditherRect(n, x, FL - 20, 20, 3, null, md("#25f0d0"), 0.5);
      ditherRect(n, x + 26, FL - 13, 14, 3, null, md("#ff3d8b"), 0.35);
    }
    floorTop = md("#242838"); floorMid = md("#161a26"); floorBot = md("#0a0c14");
  }

  /* The floor: a dithered gradient away from the camera, a scuff texture, and
     a bright lip at the ground line so the fighters have something to stand on. */
  const floor = newLayer(STAGE_W, H - FL + 10);
  const fc = floor.getContext("2d");
  const fh = H - FL + 10;
  ditherGradient(fc, 0, 0, STAGE_W, Math.round(fh * 0.55), floorTop, floorMid);
  ditherGradient(fc, 0, Math.round(fh * 0.55), STAGE_W, fh - Math.round(fh * 0.55), floorMid, floorBot);
  fc.fillStyle = "rgba(0,0,0,.30)";
  for (let x = 0; x < STAGE_W; x += 16) fc.fillRect(x, 0, 1, fh);
  noiseSpeckle(fc, 0, 3, STAGE_W, fh - 4, floorBot, 700, rng);
  fc.fillStyle = md("#14141f"); fc.fillRect(0, 0, STAGE_W, 2);
  fc.fillStyle = floorTop; fc.fillRect(0, 2, STAGE_W, 1);

  return { far, near, floor, accent, floorY: FL };
}

const STAGES = {};
function stageFor(key){
  if (!STAGES[key]) STAGES[key] = buildStage(key);
  return STAGES[key];
}
