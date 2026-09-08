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
const spriteCache = new Map();

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
function limbT(ctx, x0, y0, x1, y1, t0, t1, color){
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  ctx.fillStyle = color;
  for (let i = 0; i <= steps; i++){
    const f = i / steps;
    const t = Math.max(1, Math.round(t0 + (t1 - t0) * f));
    const h = t >> 1;
    ctx.fillRect(Math.round(x0 + dx * f) - h, Math.round(y0 + dy * f) - h, t, t);
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
  /* How far each band shifts, and how much narrower it gets, both scale with
     the part. Fixed steps were tuned on a six-pixel arm and, applied to a
     sixteen-pixel torso, put the widest highlight band across nearly the whole
     chest — every fighter came out flat and over-lit from the waist up. */
  const t = (t0 + t1) / 2;
  const step = Math.max(1, Math.round(t / 6));
  const nar  = Math.max(2, Math.round(t / 4));
  const at = (k, w) => limbT(ctx, x0 + ox*step*k, y0 + oy*step*k,
                                  x1 + ox*step*k, y1 + oy*step*k,
                                  t0 - nar*k, t1 - nar*k, w);
  at(0, tn.sh);
  if (t >= 4)  at(1, tn.mid);
  if (t >= 6)  at(2, tn.lit);
  if (t >= 10) at(3, tn.hi);
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
  const cv = document.createElement("canvas");
  cv.width = SPRITE_W; cv.height = SPRITE_H;
  const c = cv.getContext("2d");
  const sc = ch.scale, b = ch.bulk, P = ch.p16;
  const J = {};
  for (const k in pose){
    J[k] = [ SPRITE_OX + facing * Math.round(pose[k][0] * sc),
             SPRITE_OY + Math.round(pose[k][1] * sc) ];
  }
  const hipF = [ J.pv[0] + facing * 3, J.pv[1] + 1 ];
  const hipB = [ J.pv[0] - facing * 3, J.pv[1] + 1 ];

  /* Every limb is a pair now — thick end, thin end. */
  const wUA = 6 + b, wFA = 5 + b, wTH = 9 + b, wSH = 7 + b, wTO = 16 + b*2;
  const UA = [wUA + 1, wUA - 1], FA = [wFA, wFA - 2];
  const TH = [wTH + 1, wTH - 2], SH = [wSH, wSH - 3];
  const TO = [wTO - 4, wTO];
  const headW = 14 + (b > 0 ? 2 : 0), headH = 15 + (b > 0 ? 1 : 0);

  /* The key light sits in front of the fighter and above, so it follows the
     facing: turn around and the lit side turns with you, exactly as it does
     when a hand-drawn sprite sheet is mirrored. */
  const lx = facing, ly = -1;

  /* On a hit the whole fighter flashes white for a few frames. Swapping the
     tone sets rather than compositing keeps it a two-colour sprite. */
  const W_ = "#ffffff";
  const flash = tint === "flash";
  const set = (rim, sh, mid, lit, hi) => flash
    ? { rim:null, sh:W_, mid:W_, lit:W_, hi:W_ }
    : { rim, sh, mid, lit, hi };
  const suitF = set(P.rim, P.suitSh, P.suitMid, P.suitLit, P.suitHi);
  const suitB = set(null,  P.suitDk, P.suitSh,  P.suitSh,  P.suitSh);
  /* The rig drew the whole body from one material, which is fine for a gi and
     wrong for anyone wearing a top and trousers. A character that declares a
     `pants` material gets it on the legs. */
  const pantsF = P.pantsMid
    ? set(P.rim, P.pantsDk || P.pantsMid, P.pantsMid, P.pantsLit || P.pantsMid, P.pantsLit || P.pantsMid)
    : suitF;
  const pantsB = P.pantsMid
    ? set(null, P.pantsDk || P.pantsMid, P.pantsMid, P.pantsMid, P.pantsMid)
    : suitB;
  const skinF = set(P.rim, P.skinDk, P.skinMid, P.skinLit, P.skinHi);
  const skinB = set(null,  P.skinDk, P.skinDk,  P.skinDk,  P.skinDk);
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
    const a = F.len, h = (w >> 1) + 1;
    if (pass === 0){ band(c, F, a - 3, w + 5, h + 2, OL); return; }
    band(c, F, a - 2, w + 3, h, tone.mid);
    const s = (lx * F.vx + ly * F.vy) >= 0 ? 1 : -1;
    patch(c, F, a - 2, s * h, w + 3, 1, tone.lit);          /* lit side */
    patch(c, F, a - 2, -s * h, w + 3, 1, tone.sh);          /* shaded side */
    if (!flash){
      for (let k = -1; k <= 1; k++)                          /* knuckles */
        patch(c, F, a + w, k * 2 - 1, 1, 2, tone.lit);
      patch(c, F, a - 1, s * (h - 1), 3, 1, tone.hi);        /* thumb */
    }
    band(c, F, a - 4, 2, h, col(P.trimMid));                 /* wrist cuff */
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
  limbShadedT(c, Fto, TO[0], TO[1],
              { rim:null, sh:suitF.sh, mid:suitF.mid, lit:suitF.lit, hi:suitF.hi }, lx, ly);
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
  const headRow = (r) => {
    const i = clamp(Math.round(r / (hh - 1) * (SKULL.length - 1)), 0, SKULL.length - 1);
    const w = Math.max(3, Math.round(hw * SKULL[i]));
    /* the muzzle: the mid rows push forward, which is what puts a face on the
       profile instead of a flat wall */
    const push = (r >= 5 && r <= 10) ? 1 : 0;
    return [ hx + ((hw - w) >> 1) + facing * push, w ];
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
  c.fillStyle = OL;
  for (let r = -1; r <= hh; r++){
    const [x, w] = headRow(clamp(r, 0, hh - 1));
    c.fillRect(x - 1, hy + r, w + 2, 1);
  }
  for (let r = 0; r < hh; r++){
    const [x, w] = headRow(r);
    c.fillStyle = col(P.skinMid);
    c.fillRect(x, hy + r, w, 1);
  }
  if (!flash){
    for (let r = 2; r <= hh - 4; r++){                       /* the lit plane */
      c.fillStyle = P.skinLit; c.fillRect(fx(r, 1, 3), hy + r, 3, 1);
    }
    for (let r = 1; r <= hh - 3; r++){                       /* back of the skull */
      c.fillStyle = P.skinDk;  c.fillRect(bx(r, 0, 2), hy + r, 2, 1);
    }
    c.fillStyle = P.skinDk;                                  /* brow and socket */
    c.fillRect(fx(6, 0, 6), hy + 6, 6, 1);
    c.fillRect(fx(7, 0, 5), hy + 7, 5, 1);
    c.fillStyle = P.skinHi;  c.fillRect(fx(7, 1, 3), hy + 7, 3, 2);   /* eye */
    c.fillStyle = P.line;    c.fillRect(fx(7, 1, 2), hy + 7, 2, 2);   /* pupil */
    c.fillStyle = P.skinLit; c.fillRect(fx(8, -1, 2), hy + 8, 2, 1);  /* nose */
    c.fillStyle = P.skinHi;  c.fillRect(fx(8, -1, 1), hy + 8, 1, 1);
    c.fillStyle = P.skinDk;  c.fillRect(fx(9, -1, 2), hy + 9, 2, 1);
    c.fillStyle = P.skinDk;  c.fillRect(fx(11, 2, 3), hy + 11, 3, 1); /* mouth */
    const [jxx, jww] = headRow(hh - 2);                      /* jaw */
    c.fillStyle = P.skinDk;  c.fillRect(jxx + 1, hy + hh - 2, jww - 2, 1);
    c.fillStyle = P.skinDk;  c.fillRect(bx(8, 0, 2), hy + 7, 2, 3);   /* ear */
    c.fillStyle = P.skinMid; c.fillRect(bx(8, 0, 1), hy + 8, 1, 1);
  }
  /* beard first, so the hat and hair sit over it */
  if (G.beard && !flash){
    c.fillStyle = P.hairMid;
    for (let r = 9; r < hh; r++){
      const [x, w] = headRow(r);
      c.fillRect(x + 1, hy + r, w - 2, 1);
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
    for (let r = 0; r < 6; r++){
      const [x, w] = headRow(r);
      c.fillStyle = col(P.hairMid);
      c.fillRect(x, hy + r, w, 1);
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
  limbShadedT(c, Fth, TH[0], TH[1], pantsF, lx, ly);
  if (!flash) band(c, Fth, 2, 2, (TH[0] >> 1) - 1, col(P.pantsLit || P.suitLit));
  limbShadedT(c, Fsh, SH[0], SH[1], pantsF, lx, ly);
  if (!flash) band(c, Fsh, Fsh.len - 5, 1, (SH[1] >> 1) + 1, col(P.pantsDk || P.suitDk));
  boot(Ffo, footLen, footH, footMid, footLit, footDk, 1);
  if (G.bigFeet && !flash){
    /* toe pads, spaced along the slipper */
    for (let t = 0; t < 3; t++)
      for (let j = -1; j <= 0; j++)
        dot(c, Ffo.at(3 + t * 3, j * (Ffo.vy >= 0 ? 1 : -1) - 1), P.pawDk);
  }
  limbShadedT(c, Fua, UA[0], UA[1], suitF, lx, ly);
  if (!flash) band(c, Fua, Fua.len - 3, 2, (UA[1] >> 1) + 1, col(P.suitLit));
  limbShadedT(c, Ffa, FA[0], FA[1], skinF, lx, ly);
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
  const key = ch.key + "|" + poseKey(pose) + "|" + facing + "|" + (tint||"");
  let s = spriteCache.get(key);
  if (!s){ s = buildSprite(ch, pose, facing, tint); spriteCache.set(key, s); }
  return s;
}
