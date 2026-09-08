/* ============================================================================
   FIGHTER SPRITE RENDERING
   ----------------------------------------------------------------------------
   A pose is rasterised into a small offscreen canvas and cached, keyed by
   character + pose + facing + tint. Poses are held for several frames at a
   time, so in practice each unique frame is drawn once for the whole match.

   The rig gives joint positions; this file decides what a body made of those
   joints looks like. It used to stamp a uniform capsule between each pair,
   which produced articulated geometry rather than a character: arms ending in
   stumps, a head with one pixel for an eye, a torso that was one flat mass.

   What replaced it is closer to how cut-out animation works. Every segment
   gets a local frame — one axis along the limb, one across it — and detail is
   authored in THAT space: a cuff, a knuckle, a boot sole, a fold at the waist.
   Because the detail is placed in the segment's own coordinates and rasterised
   at its final orientation, it stays crisp at any angle. Nothing is rotated
   after the fact, so nothing resamples into mush, and all 57 poses get the
   detail for free without a single frame being redrawn by hand.
   ========================================================================== */

const SPRITE_W = 150, SPRITE_H = 130, SPRITE_OX = 75, SPRITE_OY = 112;

/* Sprites are rasterised at RS density but everything below still draws in
   world units, because the canvas carries a scale transform. That is what lets
   the resolution change without touching a single coordinate: a feature that
   wants to stay chunky keeps its whole-unit position, and a feature that wants
   real detail simply uses fractions of a unit — 1/RS is one hardware pixel. */

/* A pose only ever fills a fifth of the full sprite box, and at RS = 4 the
   difference between storing the box and storing the figure is 1.25MB versus
   about 300KB per frame. The bounds come from the joints rather than from
   reading the pixels back, which would cost more than drawing them. */
function poseBounds(pose, sc){
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const k in pose){
    const jx = pose[k][0] * sc, jy = pose[k][1] * sc;
    if (jx < x0) x0 = jx; if (jx > x1) x1 = jx;
    if (jy < y0) y0 = jy; if (jy > y1) y1 = jy;
  }
  /* Padding for limb thickness, boots, a weapon at arm's length, and the
     tallest hat on the roster. */
  return { x0: x0 - 20, x1: x1 + 20, y0: y0 - 30, y1: y1 + 12 };
}

/* An LRU, because at this density the whole roster's worth of frames does not
   fit in memory. Sized in bytes rather than entries so a big pose and a small
   one cost what they actually cost. */
const SPRITE_BUDGET = 96 * 1024 * 1024;
const spriteCache = new Map();
let spriteBytes = 0;
function cachePut(key, cv){
  const bytes = cv.width * cv.height * 4;
  spriteCache.set(key, cv);
  spriteBytes += bytes;
  for (const k of spriteCache.keys()){
    if (spriteBytes <= SPRITE_BUDGET) break;
    const old = spriteCache.get(k);
    spriteBytes -= old.width * old.height * 4;
    spriteCache.delete(k);
  }
}

/* A segment's own coordinate system: `a` runs along it from (x0,y0), `b` runs
   across it. Everything a limb wears is authored in these terms. */
function frameOf(x0, y0, x1, y1){
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  return {
    x0, y0, len, ux, uy, vx: -uy, vy: ux,
    at(a, b){ return [ x0 + ux * a + this.vx * b, y0 + uy * a + this.vy * b ]; }
  };
}
function dot(ctx, p, color){
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(p[0]), Math.round(p[1]), 1, 1);
}
/* A strip across a limb at distance `a`: cuffs, straps, seams, sole edges. */
function band(ctx, F, a, thick, half, color){
  ctx.fillStyle = color;
  for (let i = 0; i < thick; i++)
    for (let j = -half; j <= half; j++){
      const p = F.at(a + i, j);
      ctx.fillRect(Math.round(p[0]), Math.round(p[1]), 1, 1);
    }
}
/* A patch in segment space: a..a+la along, b..b+lb across. */
function patch(ctx, F, a, b, la, lb, color){
  ctx.fillStyle = color;
  for (let i = 0; i < la; i++)
    for (let j = 0; j < lb; j++){
      const p = F.at(a + i, b + j);
      ctx.fillRect(Math.round(p[0]), Math.round(p[1]), 1, 1);
    }
}

/* Chunky capsule between two points, with independent end widths. The taper
   is most of what separates a limb from a pipe: an upper arm is thicker at the
   shoulder than the elbow, a shin thicker at the knee than the ankle, and at
   this size that difference is what reads as anatomy. */
const snap = v => Math.round(v * RS) / RS;

/* Row spans for the capsule rasteriser, reused so a limb allocates nothing. */
const _spanA = new Float32Array(2048), _spanB = new Float32Array(2048);

/* A limb, solved as a capsule instead of stamped as a chain of squares.

   Stamping was the whole reason the fighters read as blocky. A diagonal limb
   was a run of overlapping axis-aligned boxes, so its edge quantised to the
   STAMP rather than to the pixel grid — at 1x that was invisible, but at RS=4
   each stamp is a 28x28 block and the staircase it leaves is enormous. Every
   limb, every outline and every fist inherited it.

   Solving the horizontal span per pixel row instead gives the exact silhouette
   with hard edges, which is what pixel art is: the curve is right, and it is
   still one solid colour per pixel with nothing blended. It also emits one
   fillRect per row rather than one per stamp, so it is no more expensive. */
function limbT(ctx, x0, y0, x1, y1, t0, t1, color){
  const ax = x0 * RS, ay = y0 * RS, bx = x1 * RS, by = y1 * RS;
  const ra = Math.max(0.5, t0 * RS / 2), rb = Math.max(0.5, t1 * RS / 2);
  const yTop = Math.floor(Math.min(ay - ra, by - rb));
  const yBot = Math.ceil (Math.max(ay + ra, by + rb));
  const H = yBot - yTop + 1;
  if (H <= 0 || H > 2048) return;
  for (let i = 0; i < H; i++){ _spanA[i] = 1e9; _spanB[i] = -1e9; }
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  /* Discs half a radius apart overlap enough that the union of their spans is
     the capsule to well under a pixel, and it keeps the inner loop short. */
  const steps = Math.max(1, Math.ceil(len / Math.max(1, Math.min(ra, rb) * 0.9)));
  for (let s2 = 0; s2 <= steps; s2++){
    const t = s2 / steps;
    const cx = ax + dx * t, cy = ay + dy * t, r = ra + (rb - ra) * t, r2 = r * r;
    const j0 = Math.max(yTop, Math.floor(cy - r)), j1 = Math.min(yBot, Math.ceil(cy + r));
    for (let yy = j0; yy <= j1; yy++){
      const d = (yy + 0.5) - cy, q = r2 - d * d;
      if (q <= 0) continue;
      const hw = Math.sqrt(q), i = yy - yTop;
      const lo = cx - hw, hi = cx + hw;
      if (lo < _spanA[i]) _spanA[i] = lo;
      if (hi > _spanB[i]) _spanB[i] = hi;
    }
  }
  /* One fillRect per row is correct and far too many draw calls — a long limb
     is three hundred of them where the stamp version was thirty. Rows with an
     identical span are merged into a single rect, which collapses the vertical
     and near-vertical runs that make up most of a body. */
  ctx.fillStyle = color;
  const inv = 1 / RS;
  let i = 0;
  while (i < H){
    if (_spanB[i] < _spanA[i]){ i++; continue; }
    const xa = Math.round(_spanA[i]);
    let xb = Math.round(_spanB[i]);
    if (xb <= xa) xb = xa + 1;                 /* never lose a thin limb */
    let j = i + 1;
    while (j < H && _spanB[j] >= _spanA[j] && Math.round(_spanA[j]) === xa){
      let e = Math.round(_spanB[j]);
      if (e <= xa) e = xa + 1;
      if (e !== xb) break;
      j++;
    }
    ctx.fillRect(xa * inv, (yTop + i) * inv, (xb - xa) * inv, (j - i) * inv);
    i = j;
  }
}
/* Back-compatible uniform capsule. */
function limb(ctx, x0, y0, x1, y1, t, color){ limbT(ctx, x0, y0, x1, y1, t, t, color); }

function blob(ctx, x, y, w, h, color){
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x - w/2), Math.round(y - h/2), w, h);
}
/* Rectangle with the four corner pixels knocked out — reads as "round" at
   this resolution without any antialiasing. */
function roundRect(ctx, x, y, w, h, color){
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y, w - 2, h);
  ctx.fillRect(x, y + 1, w, h - 2);
}

/* A limb shaded as a cylinder.

   The tone bands step ACROSS the limb rather than along the world light
   vector. That is the difference between a limb that happens to be lighter on
   one side and one that reads as round: the highlight follows the arm when the
   arm swings, and the terminator stays parallel to the bone. Which side gets
   the light is decided once, by projecting the key light onto the segment's
   own across-axis. */
function limbShadedT(ctx, F, t0, t1, tn, lx, ly){
  const [x1, y1] = F.at(F.len, 0);
  const x0 = F.x0, y0 = F.y0;
  const s = (lx * F.vx + ly * F.vy) >= 0 ? 1 : -1;
  const ox = F.vx * s, oy = F.vy * s;
  const t = (t0 + t1) / 2;
  const put = (off, shrink, col) =>
    limbT(ctx, x0 + ox*off, y0 + oy*off, x1 + ox*off, y1 + oy*off,
          t0 * (1 - shrink), t1 * (1 - shrink), col);
  /* Light the floor throws back up, on the surface turned away from the key.
     Without it the shadow side goes dead and the limb reads as a cut-out. */
  if (tn.bnc) put(-t * 0.30, 0.62, tn.bnc);
  /* The ladder, widest and darkest first, each band narrowing and stepping
     toward the light. Seven bands across a limb is only possible at this
     density — at 1x there were four pixels to spend and no room for the two
     that matter most, the occlusion at the edge and the warm terminator. */
  let seq = [tn.dk, tn.sh, tn.sss, tn.mid, tn.lit, tn.hi, tn.spec].filter(Boolean);
  /* Bands are only worth solving while each still lands on its own pixels. */
  const room = Math.max(3, Math.min(seq.length, Math.round(t * RS / 5)));
  if (room < seq.length){
    const pick = [];
    for (let k = 0; k < room; k++)
      pick.push(seq[Math.round(k * (seq.length - 1) / (room - 1))]);
    seq = pick;
  }
  const n = seq.length;
  for (let k = 0; k < n; k++){
    const f = k / n;
    /* Bunched toward the lit edge. Spread evenly the bands read as an airbrush
       gradient; a real cylinder spends most of its width in the mid tones and
       turns fast at the end. */
    put(Math.pow(f, 1.35) * t * 0.56, Math.pow(f, 0.82) * 0.93, seq[k]);
  }
}

/* The same limb, flattened: one dark mass and a single edge. Used for
   everything on the far side of the body, where detail is a lie anyway. */
function limbFar(ctx, F, t0, t1, tn, lx, ly){
  const [x1, y1] = F.at(F.len, 0);
  const s = (lx * F.vx + ly * F.vy) >= 0 ? 1 : -1;
  const step = Math.max(1, Math.round((t0 + t1) / 12));
  limbT(ctx, F.x0, F.y0, x1, y1, t0, t1, tn.sh);
  limbT(ctx, F.x0 + F.vx*s*step, F.y0 + F.vy*s*step,
             x1 + F.vx*s*step, y1 + F.vy*s*step,
             Math.max(1, t0 - 3), Math.max(1, t1 - 3), tn.mid);
  if (tn.bnc)
    limbT(ctx, F.x0 - F.vx*s*step, F.y0 - F.vy*s*step,
               x1 - F.vx*s*step, y1 - F.vy*s*step,
               t0 * 0.30, t1 * 0.30, tn.bnc);
}

function limbShaded(ctx, x0, y0, x1, y1, t, tn, lx, ly){
  limbShadedT(ctx, frameOf(x0, y0, x1, y1), t, t, tn, lx, ly);
}

/* The skull in profile, row by row as a fraction of the head's width. A brow
   that overhangs, a cheek, and a chin that comes to a point — the three things
   that stop a head reading as a box. */
const SKULL = [0.60, 0.80, 0.92, 0.99, 1.00, 1.00, 1.00, 1.00,
               0.99, 0.96, 0.92, 0.85, 0.76, 0.62, 0.44];

function buildSprite(ch, pose, facing, tint){
  const P = ch.p16;
  /* The joints this fighter actually has, rather than the shared skeleton
     scaled by one number. */
  const J0 = applyBuild(ch.build, pose);
  const b = (ch.build || BUILD_DEFAULT).girth;
  const bd = poseBounds(J0, 1);
  /* The drawing origin, in world units, relative to the figure's own origin
     (the point between the feet). Mirrored with the facing. */
  const ox = facing > 0 ? Math.floor(bd.x0) : -Math.ceil(bd.x1);
  const oy = Math.floor(bd.y0);
  const wUnits = Math.ceil(bd.x1 - bd.x0) + 2, hUnits = Math.ceil(bd.y1 - bd.y0) + 2;
  const cv = document.createElement("canvas");
  cv.width = wUnits * RS; cv.height = hUnits * RS;
  cv.ox = ox; cv.oy = oy;
  const c = cv.getContext("2d");
  c.setTransform(RS, 0, 0, RS, 0, 0);
  c.imageSmoothingEnabled = false;
  const AX = -ox, AY = -oy;                 /* figure origin inside the canvas */
  const J = {};
  for (const k in J0){
    J[k] = [ AX + facing * J0[k][0], AY + J0[k][1] ];
  }
  const hipF = [ J.pv[0] + facing * 3, J.pv[1] + 1 ];
  const hipB = [ J.pv[0] - facing * 3, J.pv[1] + 1 ];

  /* Every limb is a pair now — thick end, thin end. */
  const wUA = 6 + b, wFA = 5 + b, wTH = 9 + b, wSH = 7 + b, wTO = 16 + b*2;
  const UA = [wUA + 1, wUA - 1], FA = [wFA, wFA - 2];
  const TH = [wTH + 1, wTH - 2], SH = [wSH, wSH - 3];
  const TO = [wTO - 6, wTO + 1];
  const headW = 14 + (b > 0 ? 2 : 0), headH = 15 + (b > 0 ? 1 : 0);

  /* The key light sits in front of the fighter and above, so it follows the
     facing: turn around and the lit side turns with you, exactly as it does
     when a hand-drawn sprite sheet is mirrored. */
  const lx = facing, ly = -1;

  /* On a hit the whole fighter flashes white for a few frames. Swapping the
     tone sets rather than compositing keeps it a two-colour sprite. */
  const flash = tint === "flash";
  const W_ = "#ffffff";
  const near = (r) => flash
    ? { dk:W_, sh:W_, sss:null, mid:W_, lit:W_, hi:W_, spec:null, bnc:null }
    : r;
  const far = (r) => flash
    ? { sh:W_, mid:W_, bnc:null }
    : { sh: r.dk, mid: r.sh, bnc: r.bnc };
  const R = {
    skin:  { ao:P.skinAO, dk:P.skinDk, sh:P.skinSh, sss:P.skinSSS, mid:P.skinMid,
             lit:P.skinLit, hi:P.skinHi, spec:P.skinSpec, bnc:P.skinBnc },
    suit:  { ao:P.suitAO, dk:P.suitDk, sh:P.suitSh, sss:null, mid:P.suitMid,
             lit:P.suitLit, hi:P.suitHi, spec:null, bnc:P.suitBnc },
    pants: P.pantsMid
      ? { ao:P.pantsAO || P.pantsDk, dk:P.pantsDk, sh:P.pantsDk, sss:null,
          mid:P.pantsMid, lit:P.pantsLit, hi:P.pantsHi || P.pantsLit,
          spec:null, bnc:P.suitBnc }
      : null
  };
  if (!R.pants) R.pants = R.suit;
  const suitF = near(R.suit), suitB = far(R.suit);
  const pantsF = near(R.pants), pantsB = far(R.pants);
  const skinF = near(R.skin), skinB = far(R.skin);
  const col = x => flash ? W_ : x;
  const OL = flash ? W_ : P.line;

  /* Kit a character carries that the shared rig knows nothing about. Because
     the rig is joint-based, all of it follows the pose for free — a weapon
     drawn along the forearm vector is correct in all 54 frames without any
     of them being redrawn. That is cheap here and expensive on a hand-drawn
     sheet, which is worth remembering when deciding what a fighter holds. */
  const G = ch.gear || {};
  const footLen = G.bigFeet ? 8 : 6, footH = G.bigFeet ? 3 : 2;
  const footMid = col(G.bigFeet ? P.pawMid : P.trimMid);
  const footLit = col(G.bigFeet ? P.pawLit : P.trimLit);
  const footDk  = col(G.bigFeet ? (P.pawDk || P.pawMid) : P.trimMid);

  /* --- the frames every part is authored in ----------------------------- */
  const Fua = frameOf(J.sF[0],J.sF[1], J.eF[0],J.eF[1]);
  const Ffa = frameOf(J.eF[0],J.eF[1], J.hF[0],J.hF[1]);
  const Fua2= frameOf(J.sB[0],J.sB[1], J.eB[0],J.eB[1]);
  const Ffa2= frameOf(J.eB[0],J.eB[1], J.hB[0],J.hB[1]);
  const Fth = frameOf(hipF[0],hipF[1], J.kF[0],J.kF[1]);
  const Fsh = frameOf(J.kF[0],J.kF[1], J.fF[0],J.fF[1]);
  const Fth2= frameOf(hipB[0],hipB[1], J.kB[0],J.kB[1]);
  const Fsh2= frameOf(J.kB[0],J.kB[1], J.fB[0],J.fB[1]);
  const Fto = frameOf(J.pv[0],J.pv[1], J.nk[0],J.nk[1]);

  /* Standing, the foot points forward while the shin points down, so the two
     are perpendicular. In a kick the leg is horizontal and the toe should
     carry on along it instead. Rotating by how vertical the shin is gives
     both, and everything between them, from one line. */
  const footFrame = (Fs, fx, fy) => {
    const t = Math.abs(Fs.uy);
    const ang = -Math.PI / 2 * facing * t;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    return frameOf(fx, fy, fx + (Fs.ux*cs - Fs.uy*sn), fy + (Fs.ux*sn + Fs.uy*cs));
  };
  const Ffo = footFrame(Fsh, J.fF[0], J.fF[1]);
  const Ffo2= footFrame(Fsh2, J.fB[0], J.fB[1]);

  /* --- parts ------------------------------------------------------------ */

  /* A fist, built in the forearm's frame so the knuckles always lead the
     punch. It used to be a square blob, which is what made every attack read
     as a fighter waving a stump. */
  const fist = (F, w, tone, pass) => {
    const a = F.len, W2 = w + 2;
    const P0 = F.at(a - 1.5, 0), P1 = F.at(a + w * 0.55, 0);
    if (pass === 0){ limbT(c, P0[0],P0[1], P1[0],P1[1], W2 + 2.5, W2 + 2, OL); return; }
    const s2 = (lx * F.vx + ly * F.vy) >= 0 ? 1 : -1;
    limbT(c, P0[0],P0[1], P1[0],P1[1], W2 + 0.5, W2, tone.sh);   /* palm */
    if (tone.bnc){
      const B0 = F.at(a - 1.5, -s2 * W2 * 0.36), B1 = F.at(a + w * 0.5, -s2 * W2 * 0.36);
      limbT(c, B0[0],B0[1], B1[0],B1[1], W2 * 0.4, W2 * 0.35, tone.bnc);
    }
    /* Four fingers curled over the leading face, each its own tube with a
       seam between. This is the detail the old square blob had no room for and
       the reason every attack read as a fighter waving a stump. */
    for (let k = 0; k < 4; k++){
      const off = (k - 1.5) * W2 / 4;
      const A = F.at(a - 0.25, off), B = F.at(a + w * 0.5, off);
      limbT(c, A[0],A[1], B[0],B[1], W2 / 4 + 0.5, W2 / 4 + 0.25, tone.dk);
      const A2 = F.at(a - 0.25, off + s2 * 0.25), B2 = F.at(a + w * 0.44, off + s2 * 0.25);
      limbT(c, A2[0],A2[1], B2[0],B2[1], W2 / 4 - 0.25, W2 / 4 - 0.5, tone.mid);
      if (!flash && k >= 2){
        const K = F.at(a + w * 0.36, off + s2 * 0.5);
        limbT(c, K[0],K[1], K[0],K[1], 0.75, 0.75, tone.lit);   /* knuckle */
      }
    }
    /* thumb, wrapped across the front on the light side */
    const T0 = F.at(a - 1.25, s2 * (W2 / 2)), T1 = F.at(a + w * 0.28, s2 * (W2 / 4));
    limbT(c, T0[0],T0[1], T1[0],T1[1], 2, 1.5, tone.dk);
    const T2 = F.at(a - 1, s2 * (W2 / 2 - 0.25));
    limbT(c, T2[0],T2[1], T1[0],T1[1], 1.25, 1, tone.mid);
    if (!flash) limbT(c, T2[0],T2[1], T2[0],T2[1], 0.75, 0.75, tone.lit);
    band(c, F, a - 3, 1, (W2 >> 1) + 1, tone.dk);               /* wrist crease */
    band(c, F, a - 4.5, 1.5, (W2 >> 1) + 1, col(P.trimMid));    /* cuff */
  };

  /* A boot in the foot's own frame: sole, upper, toe cap, ankle cuff. */
  const boot = (F, len, hgt, mid, lit, dk, pass) => {
    const down = F.vy >= 0 ? 1 : -1;
    if (pass === 0){
      for (let a = -3; a <= len + 1; a++)
        for (let j = -hgt - 2; j <= hgt + 1; j++) dot(c, F.at(a, j * down), OL);
      return;
    }
    for (let a = -2; a <= len; a++)
      for (let j = -hgt - 1; j <= hgt; j++) dot(c, F.at(a, j * down), mid);
    for (let a = -2; a <= len; a++) dot(c, F.at(a, hgt * down), OL);          /* sole */
    if (!flash){
      for (let j = -hgt - 1; j <= hgt - 1; j++) dot(c, F.at(len, j * down), lit);
      for (let a = -2; a <= 0; a++) dot(c, F.at(a, (-hgt - 1) * down), lit);  /* ankle */
      dot(c, F.at(len - 1, (-hgt - 1) * down), lit);
      for (let a = 0; a <= len - 2; a++) dot(c, F.at(a, (hgt - 1) * down), dk);
    }
  };

  /* --- pass 1: silhouette, one pixel fatter than every part -------------- */
  limbT(c, Fua2.x0,Fua2.y0, J.eB[0],J.eB[1], UA[0]+2, UA[1]+2, OL);
  limbT(c, Ffa2.x0,Ffa2.y0, J.hB[0],J.hB[1], FA[0]+2, FA[1]+2, OL);
  fist(Ffa2, wFA - 1, skinB, 0);
  limbT(c, Fth2.x0,Fth2.y0, J.kB[0],J.kB[1], TH[0]+2, TH[1]+2, OL);
  limbT(c, Fsh2.x0,Fsh2.y0, J.fB[0],J.fB[1], SH[0]+2, SH[1]+2, OL);
  boot(Ffo2, footLen, footH, null, null, null, 0);
  limbT(c, Fto.x0,Fto.y0, J.nk[0],J.nk[1], TO[0]+2, TO[1]+2, OL);
  limbT(c, Fth.x0,Fth.y0, J.kF[0],J.kF[1], TH[0]+2, TH[1]+2, OL);
  limbT(c, Fsh.x0,Fsh.y0, J.fF[0],J.fF[1], SH[0]+2, SH[1]+2, OL);
  boot(Ffo, footLen, footH, null, null, null, 0);
  limbT(c, Fua.x0,Fua.y0, J.eF[0],J.eF[1], UA[0]+2, UA[1]+2, OL);
  limbT(c, Ffa.x0,Ffa.y0, J.hF[0],J.hF[1], FA[0]+2, FA[1]+2, OL);
  fist(Ffa, wFA, skinF, 0);
  blob(c, J.hd[0], J.hd[1], headW+2, headH+2, OL);
  if (G.hood) blob(c, J.nk[0] - facing*5, J.nk[1] + 2, 15, 12, OL);

  /* The rim, once, over the silhouette. Everything drawn from here on covers
     the interior, so what survives is the unlit outer edge and nothing else. */
  if (!flash && P.rim){
    const rimOf = (F, t0, t1) => {
      const [x1, y1] = F.at(F.len, 0);
      const s2 = (lx * F.vx + ly * F.vy) >= 0 ? 1 : -1;
      limbT(c, F.x0 - F.vx*s2, F.y0 - F.vy*s2, x1 - F.vx*s2, y1 - F.vy*s2,
            t0, t1, P.rim);
    };
    rimOf(Fto, TO[0], TO[1]);
    rimOf(Fua, UA[0], UA[1]); rimOf(Ffa, FA[0], FA[1]);
    rimOf(Fth, TH[0], TH[1]); rimOf(Fsh, SH[0], SH[1]);
  }

  /* --- pass 2: the far side, one tone step down the ramp ----------------- */
  limbFar(c, Fua2, UA[0], UA[1], suitB, lx, ly);
  limbFar(c, Ffa2, FA[0], FA[1], skinB, lx, ly);
  fist(Ffa2, wFA - 1, skinB, 1);
  limbFar(c, Fth2, TH[0], TH[1], pantsB, lx, ly);
  limbFar(c, Fsh2, SH[0], SH[1], pantsB, lx, ly);
  boot(Ffo2, footLen, footH, footDk, footMid, footDk, 1);
  if (G.hood){
    blob(c, J.nk[0] - facing*5, J.nk[1] + 2, 13, 10, col(P.suitSh));
    blob(c, J.nk[0] - facing*6, J.nk[1] + 1, 9, 7, col(P.suitDk));
  }

  /* --- pass 3: the torso, and what it is wearing ------------------------- */
  /* Two masses rather than one capsule: a narrow waist off the hips and a
     wider chest over it. A single tapered tube is the shape of a bollard, and
     it was the largest flat area left on the body. The overlap is what makes
     the waist read as a waist. */
  {
    const body = { rim:null, ao:suitF.ao, dk:suitF.dk, sh:suitF.sh, mid:suitF.mid,
                   lit:suitF.lit, hi:suitF.hi, spec:null, bnc:suitF.bnc };
    const waistTop = Fto.len * 0.62, chestBot = Fto.len * 0.34;
    const wp = Fto.at(waistTop, 0), cb = Fto.at(chestBot, 0), nk = Fto.at(Fto.len, 0);
    const Fw = frameOf(Fto.x0, Fto.y0, wp[0], wp[1]);
    const Fc = frameOf(cb[0], cb[1], nk[0], nk[1]);
    if (!flash){
      limbT(c, Fto.x0, Fto.y0, wp[0], wp[1], TO[0] + 1.5, TO[0] + 0.5, OL);
      limbT(c, cb[0], cb[1], nk[0], nk[1], TO[1] - 0.5, TO[1] + 1.5, OL);
    }
    limbShadedT(c, Fw, TO[0], TO[0] - 1, body, lx, ly);
    limbShadedT(c, Fc, TO[1] - 2, TO[1], body, lx, ly);
  }
  const ts = (lx * Fto.vx + ly * Fto.vy) >= 0 ? 1 : -1;   /* the front/lit side */
  const half = TO[1] >> 1, TL = Fto.len;
  /* Shoulder caps. A deltoid is the difference between an arm bolted to a box
     and an arm growing out of a body. */
  blob(c, J.sF[0], J.sF[1], wUA + 3, wUA + 2, OL);
  blob(c, J.sF[0], J.sF[1], wUA + 1, wUA, col(P.suitMid));
  if (!flash) blob(c, J.sF[0] + lx, J.sF[1] + ly, wUA - 2, wUA - 3, P.suitLit);
  if (!flash){
    /* the line down the sternum, and two folds where the top gathers into
       the belt */
    for (let i = 0; i < 7; i++) dot(c, Fto.at(TL - 5 - i, ts * (half - 3)), P.suitLit);
    for (let i = 0; i < 4; i++) dot(c, Fto.at(5, -ts * (half - 2 - i)), P.suitDk);
    for (let i = 0; i < 3; i++) dot(c, Fto.at(9, -ts * (half - 3 - i)), P.suitDk);
  }
  /* belt, with its own lit edge so it reads as a band and not a smear */
  band(c, Fto, 0, 4, half - 1, col(P.trimMid));
  if (!flash) band(c, Fto, 1, 1, half - 3, P.trimLit);

  if (!flash){
    const garb = G.garb;
    if (garb === "overalls"){
      /* Bib and straps. Brick was a red silhouette; this is what says workman. */
      for (let i = 0; i < 11; i++)
        for (let j = 0; j < 6; j++)
          dot(c, Fto.at(TL - 14 + i, ts * (half - 1) - j), P.suitLit);
      for (let j = 0; j < 6; j++) dot(c, Fto.at(TL - 14, ts * (half - 1) - j), P.suitHi);
      for (let i = 0; i < 12; i++){                       /* the two straps */
        dot(c, Fto.at(TL - 3 - i, ts * (half - 2)), P.trimMid);
        dot(c, Fto.at(TL - 3 - i, -ts * (half - 3)), P.trimMid);
      }
      dot(c, Fto.at(TL - 13, ts * (half - 2)), P.trimLit);   /* the two buckles */
      dot(c, Fto.at(TL - 13, -ts * (half - 3)), P.trimLit);
    } else if (garb === "gi"){
      /* The lapel crossing down to the belt. */
      for (let i = 0; i < 12; i++){
        const a = TL - 3 - i, off = half - 2 - Math.floor(i * 0.42);
        dot(c, Fto.at(a, ts * off), P.suitHi);
        dot(c, Fto.at(a, ts * (off - 1)), P.suitLit);
        dot(c, Fto.at(a - 1, -ts * (off - 2)), P.suitDk);
      }
    } else if (garb === "hoodie"){
      /* Kangaroo pocket, and a pair of drawstrings off the collar. */
      for (let i = 0; i < 5; i++)
        for (let j = 0; j < 5; j++)
          dot(c, Fto.at(5 + i, ts * (half - 1) - j), P.suitDk);
      for (let j = 0; j < 5; j++) dot(c, Fto.at(5, ts * (half - 1) - j), P.suitSh);
      for (let i = 0; i < 5; i++) dot(c, Fto.at(9, ts * (half - 1) - i), P.suitSh);
      for (let i = 0; i < 4; i++){
        dot(c, Fto.at(TL - 5 - i, ts * (half - 3)), P.trimLit);
        dot(c, Fto.at(TL - 5 - i, ts * (half - 6)), P.trimLit);
      }
    } else if (garb === "suit"){
      /* A zip and a high collar. */
      for (let i = 0; i < 13; i++) dot(c, Fto.at(TL - 3 - i, ts * (half - 2)), P.suitHi);
      for (let i = 0; i < 5; i++) dot(c, Fto.at(TL - 2, ts * (half - 2 - i)), P.trimLit);
    }
  }

  /* neck sits in the chin's shadow */
  blob(c, J.nk[0], J.nk[1] + 3, 7, 5, col(P.skinDk));

  /* --- pass 4: the head -------------------------------------------------- */
  const hw = headW, hh = headH;
  const hx = J.hd[0] - (hw >> 1), hy = J.hd[1] - (hh >> 1);
  /* The skull, sampled between profile entries rather than snapped to one.
     Drawn a whole world unit at a time it had flat sides and square corners —
     which read as blocky the moment the limbs became real capsules. */
  const headSpan = (r) => {
    const f = clamp(r / (hh - 1), 0, 1) * (SKULL.length - 1);
    const i = Math.min(SKULL.length - 2, Math.floor(f)), g = f - i;
    const t = SKULL[i] + (SKULL[i + 1] - SKULL[i]) * g;
    const w = Math.max(3, hw * t);
    /* the muzzle: the mid rows push forward, which is what puts a face on the
       profile instead of a flat wall */
    const push = (r >= 4.5 && r <= 10.5) ? 1 : 0;
    return [ hx + (hw - w) / 2 + facing * push, w ];
  };
  /* Feature placement still works in whole rows, snapped to the pixel grid. */
  const headRow = (r) => {
    const [x, w] = headSpan(r);
    return [ snap(x), snap(w) ];
  };
  /* `back` counts pixels in from the face; negative protrudes past it. */
  const fx = (r, back, wid) => {
    const [x, w] = headRow(r);
    return facing > 0 ? x + w - back - wid : x + back;
  };
  const bx = (r, off, wid) => {
    const [x, w] = headRow(r);
    return facing > 0 ? x + off : x + w - off - wid;
  };
  const Q = 1 / RS;
  c.fillStyle = OL;
  for (let py = -RS; py < (hh + 1) * RS; py++){
    const [x, w] = headSpan(clamp(py * Q, 0, hh - 1));
    c.fillRect(snap(x - 0.75), hy + py * Q, snap(w + 1.5), Q);
  }
  c.fillStyle = col(P.skinMid);
  for (let py = 0; py < hh * RS; py++){
    const [x, w] = headSpan(py * Q);
    c.fillRect(snap(x), hy + py * Q, snap(w), Q);
  }
  if (!flash){
    /* The face, in quarter-unit steps — one hardware pixel at this density.
       The head is 56 by 60 real pixels, and until now four of them were the
       eye. Everything below is drawn in the head's own frame so it mirrors
       with the facing without a second set of numbers. */
    const dr = (x, y, w, h, color) => {
      c.fillStyle = color;
      c.fillRect(snap(x), snap(y), snap(w), snap(h));
    };
    /* `back` counts in from the face; negative protrudes past the profile. */
    const F_ = (r, back, wid) => {
      const [x, w] = headRow(clamp(Math.round(r), 0, hh - 1));
      return facing > 0 ? x + w - back - wid : x + back;
    };
    const B_ = (r, off, wid) => {
      const [x, w] = headRow(clamp(Math.round(r), 0, hh - 1));
      return facing > 0 ? x + off : x + w - off - wid;
    };

    /* form: the lit plane of the face, the shaded back of the skull, and the
       warm band where one turns into the other */
    for (let r = 2; r <= hh - 4; r++){
      dr(F_(r, 0.75, 2.75), hy + r, 2.75, 1, P.skinLit);
    }
    for (let r = 1; r <= hh - 3; r++) dr(B_(r, 0, 2), hy + r, 2, 1, P.skinDk);
    for (let r = 3; r <= hh - 5; r++) dr(B_(r, 2, 1), hy + r, 1, 1, P.skinSh);
    dr(F_(3, 0.75, 2.5), hy + 2.5, 2.5, 1, P.skinHi);         /* forehead */
    for (let r = 9; r <= hh - 3; r++){                        /* jaw terminator */
      const [bxx, bww] = headRow(r);
      dr(bxx + (facing > 0 ? 0.25 : bww - 1), hy + r, 0.75, 1, P.skinSSS);
    }

    /* brow ridge, and the socket it casts into */
    dr(F_(6, 0.25, 4.5), hy + 5.75, 4.5, 0.5, P.skinSh);
    dr(F_(6, 0.5, 3.75), hy + 6.25, 3.75, 0.25, P.skinDk);
    dr(F_(5, 0.5, 3.25), hy + 5.25, 3.25, 0.5, P.hairMid);    /* eyebrow */
    dr(F_(5, 2.5, 1.25), hy + 5, 1.25, 0.5, P.hairMid);

    /* the eye: lid, white, iris, pupil, catchlight, lower lid */
    dr(F_(7, 1.25, 2.75), hy + 6.75, 2.75, 1.25, P.skinAO);
    dr(F_(7, 1.5, 2.25), hy + 7, 2.25, 0.75, P.skinHi);
    dr(F_(7, 1.5, 1.25), hy + 7, 1.25, 0.75, P.eyeMid || P.trimDk);
    dr(F_(7, 1.75, 0.5), hy + 7.25, 0.5, 0.5, P.line);
    dr(F_(7, 2.25, 0.25), hy + 7, 0.25, 0.25, P.skinSpec);
    dr(F_(8, 1.5, 2.25), hy + 7.75, 2.25, 0.25, P.skinLit);

    /* nose: bridge, tip stepping off the profile, nostril, and the shadow it
       throws onto the lip */
    dr(F_(7, 0.25, 0.5), hy + 7, 0.5, 1, P.skinLit);
    dr(F_(8, -0.25, 0.75), hy + 8, 0.75, 0.75, P.skinLit);
    dr(F_(8, -0.25, 0.5), hy + 8, 0.5, 0.25, P.skinHi);
    dr(F_(9, 0, 0.75), hy + 8.75, 0.75, 0.5, P.skinSh);
    dr(F_(9, 0.5, 0.5), hy + 8.75, 0.5, 0.25, P.skinAO);      /* nostril */
    dr(F_(9, 0, 1.75), hy + 9.25, 1.75, 0.25, P.skinSh);

    /* mouth: the line, an upper lip in shadow, a lit lower lip */
    dr(F_(11, 0.75, 2.25), hy + 10.75, 2.25, 0.25, P.skinSh);
    dr(F_(11, 0.75, 2), hy + 11, 2, 0.25, P.skinAO);
    dr(F_(11, 1, 1.75), hy + 11.25, 1.75, 0.25, P.skinLit);

    /* cheek and jaw */
    dr(F_(10, 1.25, 1.5), hy + 9.75, 1.5, 0.75, P.skinHi);
    const [jxx, jww] = headRow(hh - 2);
    dr(jxx + 0.5, hy + hh - 2, jww - 1, 0.75, P.skinSh);
    dr(F_(12, 1, 1.75), hy + 12, 1.75, 0.5, P.skinLit);       /* chin */
    dr(jxx + 0.5, hy + hh - 1.25, jww - 1, 0.5, P.skinAO);

    /* ear: helix, bowl, and the canal in shadow */
    dr(B_(8, -0.25, 1.75), hy + 6.75, 1.75, 3, P.skinSh);
    dr(B_(8, 0.25, 1.25), hy + 7, 1.25, 2.5, P.skinMid);
    dr(B_(8, 0.75, 0.75), hy + 7.5, 0.75, 1.5, P.skinDk);
    dr(B_(8, 0, 0.5), hy + 6.75, 0.5, 0.5, P.skinLit);
  }
  /* beard first, so the hat and hair sit over it */
  if (G.beard && !flash){
    c.fillStyle = P.hairMid;
    for (let py = 9 * RS; py < hh * RS; py++){
      const [x, w] = headSpan(py / RS);
      c.fillRect(snap(x + 0.5), hy + py / RS, snap(w - 1), 1 / RS);
    }
    c.fillRect(bx(8, 1, 2), hy + 8, 2, 4);
    c.fillStyle = P.hairDk;
    const [jx2, jw2] = headRow(hh - 1);
    c.fillRect(jx2 + 1, hy + hh - 1, jw2 - 2, 1);
    c.fillStyle = P.hairLit;
    c.fillRect(fx(10, 2, 2), hy + 10, 2, 3);
    c.fillStyle = P.skinDk;                                    /* the mouth in it */
    c.fillRect(fx(11, 2, 3), hy + 11, 3, 1);
  }
  if (G.hat){
    /* A novelty animal hat: bright, eared, and deliberately its own animal —
       longer swept-back ears with brown tips, a pale snout patch and a side
       stripe rather than round cheeks. */
    const brim = facing > 0 ? hx + headW - 2 : hx - 3;
    c.fillStyle = OL; c.fillRect(brim - (facing > 0 ? 0 : 2), hy + 3, 5, 3);
    c.fillStyle = col(P.hatDk); c.fillRect(brim - (facing > 0 ? 0 : 1), hy + 3, 4, 2);
    c.fillStyle = OL; c.fillRect(hx - 1, hy - 4, headW + 2, 10);
    roundRect(c, hx, hy - 3, headW, 8, col(P.hatMid));
    if (!flash){
      c.fillStyle = P.hatLit; c.fillRect(hx + 2, hy - 3, headW - 4, 2);
      c.fillStyle = P.hatDk;  c.fillRect(hx + 1, hy + 3, headW - 2, 2);
      /* side stripe and pale snout: the two marks that make him his own
         animal rather than a recognisable one */
      c.fillStyle = P.pawDk;  c.fillRect(facing > 0 ? hx + 2 : hx + headW - 5, hy - 1, 3, 2);
      c.fillStyle = P.skinHi; c.fillRect(facing > 0 ? hx + headW - 4 : hx + 1, hy - 1, 3, 3);
    }
    /* Ears: wide at the base, six steps tall, swept back off the facing.
       Longer than this and they stop reading as ears and start reading as
       antennae. */
    const ear = (bxx) => {
      const draw = (pass) => {
        for (let i = 0; i < 6; i++){
          const w = Math.max(2, 6 - i);
          const x = Math.round(bxx - facing * i * 0.9) - (w >> 1);
          if (pass === 0){ c.fillStyle = OL; c.fillRect(x - 1, hy - 5 - i*2, w + 2, 3); }
          else {
            c.fillStyle = col(i >= 4 ? P.pawDk : i < 2 ? P.hatLit : P.hatMid);
            c.fillRect(x, hy - 5 - i*2, w, 2);
          }
        }
      };
      draw(0); draw(1);
    };
    ear(hx + 3); ear(hx + headW - 4);
  } else {
    /* Hair, cut to the skull rather than laid on it as a cap: it follows the
       crown's own taper, falls further down the back, and takes a lit streak
       where the key light crosses it. */
    c.fillStyle = col(P.hairMid);
    for (let py = 0; py < 6 * RS; py++){
      const [x, w] = headSpan(py / RS);
      c.fillRect(snap(x), hy + py / RS, snap(w), 1 / RS);
    }
    for (let r = 6; r < 10; r++){
      c.fillStyle = col(P.hairMid);
      c.fillRect(bx(r, 0, 3), hy + r, 3, 1);
    }
    if (!flash){
      c.fillStyle = P.hairLit;
      c.fillRect(fx(1, 3, 4), hy + 1, 4, 1);
      c.fillRect(fx(2, 2, 3), hy + 2, 3, 1);
      c.fillStyle = P.hairDk;
      c.fillRect(bx(1, 0, 2), hy + 1, 2, 4);
      c.fillRect(bx(9, 0, 3), hy + 9, 3, 1);
      c.fillStyle = P.hairMid;                                 /* hairline */
      c.fillRect(fx(5, 1, 3), hy + 5, 3, 1);
    }
  }

  /* --- pass 5: the near side, carrying the key light --------------------- */
  const edged = (F, t0, t1, tone) => {
    if (!flash){
      const [ex, ey] = F.at(F.len, 0);
      limbT(c, F.x0, F.y0, ex, ey, t0 + 1.5, t1 + 1.5, OL);
    }
    limbShadedT(c, F, t0, t1, tone, lx, ly);
  };
  edged(Fth, TH[0], TH[1], pantsF);
  if (!flash) band(c, Fth, 2, 2, (TH[0] >> 1) - 1, col(P.pantsLit || P.suitLit));
  edged(Fsh, SH[0], SH[1], pantsF);
  if (!flash) band(c, Fsh, Fsh.len - 5, 1, (SH[1] >> 1) + 1, col(P.pantsDk || P.suitDk));
  boot(Ffo, footLen, footH, footMid, footLit, footDk, 1);
  if (G.bigFeet && !flash){
    /* toe pads, spaced along the slipper */
    for (let t = 0; t < 3; t++)
      for (let j = -1; j <= 0; j++)
        dot(c, Ffo.at(3 + t * 3, j * (Ffo.vy >= 0 ? 1 : -1) - 1), P.pawDk);
  }
  edged(Fua, UA[0], UA[1], suitF);
  if (!flash) band(c, Fua, Fua.len - 3, 2, (UA[1] >> 1) + 1, col(P.suitLit));
  edged(Ffa, FA[0], FA[1], skinF);
  fist(Ffa, wFA, skinF, 1);

  /* The weapon rides the forearm vector, so it is correct in every pose. */
  if (G.weapon === "spoon"){
    const F = Ffa, a = F.len + (wFA >> 1);
    const [gx, gy] = F.at(a - 2, 0);
    const [tx, ty] = F.at(a + 10, 0);
    limb(c, gx, gy, tx, ty, 4, OL);
    blob(c, tx, ty, 8, 7, OL);
    limb(c, gx, gy, tx - F.ux * 3, ty - F.uy * 3, 2, col(P.spoonMid));
    blob(c, tx, ty, 6, 5, col(P.spoonMid));
    if (!flash) blob(c, tx - F.ux, ty - F.uy - 1, 4, 3, P.spoonLit);
  }
  return cv;
}

let spriteKeyCounter = 0;
function poseKey(pose){
  if (pose.__k === undefined) Object.defineProperty(pose, "__k", { value: ++spriteKeyCounter });
  return pose.__k;
}
function getSprite(ch, pose, facing, tint){
  /* The hit flash is the same silhouette filled white. Rasterising and caching
     a second copy of every frame for it doubled the memory for something that
     is one composite away from the frame we already have. */
  if (tint === "flash"){
    const base = getSprite(ch, pose, facing, null);
    const key = "F|" + ch.key + "|" + poseKey(pose) + "|" + facing;
    let f = spriteCache.get(key);
    if (!f){
      f = document.createElement("canvas");
      f.width = base.width; f.height = base.height;
      f.ox = base.ox; f.oy = base.oy;
      const fc = f.getContext("2d");
      fc.imageSmoothingEnabled = false;
      fc.drawImage(base, 0, 0);
      fc.globalCompositeOperation = "source-in";
      fc.fillStyle = "#ffffff";
      fc.fillRect(0, 0, f.width, f.height);
      cachePut(key, f);
    } else { spriteCache.delete(key); spriteCache.set(key, f); }
    return f;
  }
  const key = ch.key + "|" + poseKey(pose) + "|" + facing;
  let s = spriteCache.get(key);
  if (!s){ s = buildSprite(ch, pose, facing, tint); cachePut(key, s); }
  else { spriteCache.delete(key); spriteCache.set(key, s); }   /* touch: LRU */
  return s;
}
