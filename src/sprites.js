/* ============================================================================
   FIGHTER SPRITE RENDERING
   ----------------------------------------------------------------------------
   A pose is rasterised into a small offscreen canvas and cached, keyed by
   character + pose + facing + tint. Poses are held for several frames at a
   time, so in practice each unique frame is drawn once for the whole match.
   ========================================================================== */

const SPRITE_W = 150, SPRITE_H = 130, SPRITE_OX = 75, SPRITE_OY = 112;
const spriteCache = new Map();

/* Chunky capsule between two points: stamps square pixels along the segment
   so edges stay hard instead of antialiasing into mush. */
function limb(ctx, x0, y0, x1, y1, t, color){
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const h = t >> 1;
  ctx.fillStyle = color;
  for (let i = 0; i <= steps; i++){
    const x = Math.round(x0 + dx * i / steps) - h;
    const y = Math.round(y0 + dy * i / steps) - h;
    ctx.fillRect(x, y, t, t);
  }
}
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

   Passes, back to front: a cool rim offset away from the light, then the
   shadow side at full width, then progressively narrower bands stepped
   towards the light. Those offsets are the whole trick — they turn a flat
   capsule into something with a round side, which is the difference between
   this and the two-tone version it replaces. It costs nothing at draw time
   because every pose is rasterised once and cached. */
function limbShaded(ctx, x0, y0, x1, y1, t, tn, lx, ly){
  if (tn.rim && t >= 5) limb(ctx, x0 - lx, y0 - ly, x1 - lx, y1 - ly, t, tn.rim);
  limb(ctx, x0, y0, x1, y1, t, tn.sh);
  if (t >= 4)  limb(ctx, x0 + lx,     y0 + ly,     x1 + lx,     y1 + ly,     t - 2, tn.mid);
  if (t >= 7)  limb(ctx, x0 + lx*2,   y0 + ly*2,   x1 + lx*2,   y1 + ly*2,   t - 4, tn.lit);
  if (t >= 14) limb(ctx, x0 + lx*3,   y0 + ly*3,   x1 + lx*3,   y1 + ly*3,   t - 8, tn.hi);
}

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

  const wUA = 6 + b, wFA = 5 + b, wTH = 9 + b, wSH = 7 + b, wTO = 16 + b*2;
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
  const suitB = set(null,  P.suitDk, P.suitSh,  P.suitMid, P.suitLit);
  /* The rig drew the whole body from one material, which is fine for a gi and
     wrong for anyone wearing a top and trousers. A character that declares a
     `pants` material gets it on the legs. */
  const pantsF = P.pantsMid
    ? set(P.rim, P.pantsDk || P.pantsMid, P.pantsMid, P.pantsLit || P.pantsMid, P.pantsLit || P.pantsMid)
    : suitF;
  const pantsB = P.pantsMid
    ? set(null, P.pantsDk || P.pantsMid, P.pantsDk || P.pantsMid, P.pantsMid, P.pantsLit || P.pantsMid)
    : suitB;
  const skinF = set(P.rim, P.skinDk, P.skinMid, P.skinLit, P.skinHi);
  const skinB = set(null,  P.skinDk, P.skinDk,  P.skinMid, P.skinLit);
  const col = x => flash ? W_ : x;
  const OL = flash ? W_ : P.line;

  /* Kit a character carries that the shared rig knows nothing about. Because
     the rig is joint-based, all of it follows the pose for free — a weapon
     drawn along the forearm vector is correct in all 54 frames without any
     of them being redrawn. That is cheap here and expensive on a hand-drawn
     sheet, which is worth remembering when deciding what a fighter holds. */
  const G = ch.gear || {};
  const footW = G.bigFeet ? 13 : 9, footH = G.bigFeet ? 6 : 4;
  const footMid = G.bigFeet ? P.pawMid : P.trimMid;
  const footLit = G.bigFeet ? P.pawLit : P.trimLit;

  /* Pass 1: silhouette outline, one pixel fatter than every part. */
  limb(c, J.sB[0],J.sB[1], J.eB[0],J.eB[1], wUA+2, OL);
  limb(c, J.eB[0],J.eB[1], J.hB[0],J.hB[1], wFA+2, OL);
  limb(c, hipB[0],hipB[1], J.kB[0],J.kB[1], wTH+2, OL);
  limb(c, J.kB[0],J.kB[1], J.fB[0],J.fB[1], wSH+2, OL);
  limb(c, J.pv[0],J.pv[1], J.nk[0],J.nk[1], wTO+2, OL);
  limb(c, hipF[0],hipF[1], J.kF[0],J.kF[1], wTH+2, OL);
  limb(c, J.kF[0],J.kF[1], J.fF[0],J.fF[1], wSH+2, OL);
  limb(c, J.sF[0],J.sF[1], J.eF[0],J.eF[1], wUA+2, OL);
  limb(c, J.eF[0],J.eF[1], J.hF[0],J.hF[1], wFA+2, OL);
  blob(c, J.hd[0], J.hd[1], headW+2, headH+2, OL);
  blob(c, J.fF[0]+facing*2, J.fF[1], footW+2, footH+2, OL);
  blob(c, J.fB[0]+facing*2, J.fB[1], footW+2, footH+2, OL);
  if (G.hood) blob(c, J.nk[0] - facing*5, J.nk[1] + 2, 15, 12, OL);

  /* Pass 2: the parts, back to front. The far arm and leg use tones one step
     down the ramp, which is how a sprite this small says "behind". */
  limbShaded(c, J.sB[0],J.sB[1], J.eB[0],J.eB[1], wUA, suitB, lx, ly);
  limbShaded(c, J.eB[0],J.eB[1], J.hB[0],J.hB[1], wFA-1, skinB, lx, ly);
  blob(c, J.hB[0], J.hB[1], wFA+1, wFA+1, col(P.skinDk));
  limbShaded(c, hipB[0],hipB[1], J.kB[0],J.kB[1], wTH, pantsB, lx, ly);
  limbShaded(c, J.kB[0],J.kB[1], J.fB[0],J.fB[1], wSH, pantsB, lx, ly);
  blob(c, J.fB[0]+facing*2, J.fB[1], footW-2, footH-1, col(G.bigFeet ? P.pawDk : P.trimMid));
  if (G.hood){
    blob(c, J.nk[0] - facing*5, J.nk[1] + 2, 13, 10, col(P.suitSh));
    blob(c, J.nk[0] - facing*6, J.nk[1] + 1, 9, 7, col(P.suitDk));
  }

  /* torso */
  limbShaded(c, J.pv[0],J.pv[1], J.nk[0],J.nk[1], wTO, suitF, lx, ly);
  /* belt, with its own lit edge so it reads as a band and not a smear */
  blob(c, J.pv[0], J.pv[1] + 1, wTO, 4, col(P.trimMid));
  blob(c, J.pv[0] + lx, J.pv[1], wTO - 4, 1, col(P.trimLit));

  /* neck sits in the chin's shadow */
  blob(c, J.nk[0], J.nk[1] + 3, 7, 5, col(P.skinDk));

  /* head */
  const hx = J.hd[0] - (headW>>1), hy = J.hd[1] - (headH>>1);
  roundRect(c, hx, hy, headW, headH, col(P.skinMid));
  if (!flash){
    /* lit on the side the light comes from, shaded on the other */
    c.fillStyle = P.skinLit;
    c.fillRect(facing > 0 ? hx + headW - 5 : hx + 1, hy + 4, 4, headH - 7);
    c.fillStyle = P.skinDk;
    c.fillRect(facing > 0 ? hx : hx + headW - 1, hy + 3, 1, headH - 5);
    c.fillRect(hx + 1, hy + headH - 3, headW - 2, 2);            /* jaw */
    /* a single lit pixel column at nose height reads as a profile */
    c.fillStyle = P.skinHi;
    c.fillRect(J.hd[0] + facing * ((headW>>1) - 1), hy + 7, 1, 2);
  }
  /* beard first, so the hat and hair sit over it */
  if (G.beard && !flash){
    c.fillStyle = P.hairMid;
    c.fillRect(facing > 0 ? hx + 1 : hx + 1, hy + 9, headW - 2, headH - 9);
    c.fillRect(facing > 0 ? hx + headW - 2 : hx, hy + 8, 2, 4);
    c.fillStyle = P.hairDk;
    c.fillRect(hx + 1, hy + headH - 2, headW - 2, 2);
    c.fillStyle = P.hairLit;
    c.fillRect(facing > 0 ? hx + headW - 4 : hx + 2, hy + 10, 2, 3);
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
    const ear = (bx) => {
      const draw = (pass) => {
        for (let i = 0; i < 6; i++){
          const w = Math.max(2, 6 - i);
          const x = Math.round(bx - facing * i * 0.9) - (w >> 1);
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
    /* hair: cap across the crown, wedge down the back of the skull */
    roundRect(c, hx, hy, headW, 5, col(P.hairMid));
    if (!flash){
      c.fillStyle = P.hairLit;
      c.fillRect(facing > 0 ? hx + 4 : hx + 2, hy + 1, headW - 6, 1);
      c.fillStyle = P.hairDk;
      c.fillRect(facing > 0 ? hx : hx + headW - 2, hy + 1, 2, 4);
    }
    c.fillStyle = col(P.hairMid);
    c.fillRect(facing > 0 ? hx : hx + headW - 3, hy + 4, 3, 5);
  }
  if (!flash){
    c.fillStyle = P.line;
    c.fillRect(J.hd[0] + facing * 2, hy + 7, 2, 3);              /* eye */
  }

  /* front leg and front arm carry the key light */
  limbShaded(c, hipF[0],hipF[1], J.kF[0],J.kF[1], wTH, pantsF, lx, ly);
  limbShaded(c, J.kF[0],J.kF[1], J.fF[0],J.fF[1], wSH, pantsF, lx, ly);
  blob(c, J.fF[0]+facing*2, J.fF[1], footW, footH, col(footMid));
  blob(c, J.fF[0]+facing*2, J.fF[1]-1, footW-2, 1, col(footLit));
  if (G.bigFeet && !flash){
    c.fillStyle = P.pawDk;
    for (let t = 0; t < 3; t++)
      c.fillRect(J.fF[0] + facing*(3 + t*3) - 1, J.fF[1] - 1, 2, 2);
  }
  limbShaded(c, J.sF[0],J.sF[1], J.eF[0],J.eF[1], wUA, suitF, lx, ly);
  limbShaded(c, J.eF[0],J.eF[1], J.hF[0],J.hF[1], wFA, skinF, lx, ly);
  blob(c, J.hF[0], J.hF[1], wFA+3, wFA+3, col(P.skinMid));
  blob(c, J.hF[0] + lx, J.hF[1] + ly, wFA, wFA, col(P.skinLit));

  /* The weapon rides the forearm vector, so it is correct in every pose. */
  if (G.weapon === "spoon"){
    const dx = J.hF[0] - J.eF[0], dy = J.hF[1] - J.eF[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const tx = J.hF[0] + ux * 12, ty = J.hF[1] + uy * 12;
    limb(c, J.hF[0], J.hF[1], tx, ty, 4, OL);
    blob(c, tx, ty, 8, 7, OL);
    limb(c, J.hF[0] + ux*2, J.hF[1] + uy*2, tx - ux*3, ty - uy*3, 2, col(P.spoonMid));
    blob(c, tx, ty, 6, 5, col(P.spoonMid));
    blob(c, tx - ux, ty - uy - 1, 4, 3, col(P.spoonLit));
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
