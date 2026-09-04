/* ============================================================================
   FIGHTER SPRITE RENDERING
   ----------------------------------------------------------------------------
   A pose is rasterised into a small offscreen canvas and cached, keyed by
   character + pose + facing + tint. Poses are held for several frames at a
   time, so in practice each unique frame is drawn once for the whole match.
   ========================================================================== */

const SPRITE_W = 150, SPRITE_H = 130, SPRITE_OX = 75, SPRITE_OY = 112;
const spriteCache = new Map();
const OUTLINE = "#14141f";

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

function buildSprite(ch, pose, facing, tint){
  const cv = document.createElement("canvas");
  cv.width = SPRITE_W; cv.height = SPRITE_H;
  const c = cv.getContext("2d");
  const sc = ch.scale, b = ch.bulk, pal = ch.pal;
  const J = {};
  for (const k in pose){
    J[k] = [ SPRITE_OX + facing * Math.round(pose[k][0] * sc),
             SPRITE_OY + Math.round(pose[k][1] * sc) ];
  }
  const hipF = [ J.pv[0] + facing * 3, J.pv[1] + 1 ];
  const hipB = [ J.pv[0] - facing * 3, J.pv[1] + 1 ];

  const wUA = 6 + b, wFA = 5 + b, wTH = 9 + b, wSH = 7 + b, wTO = 16 + b*2;
  const headW = 14 + (b > 0 ? 2 : 0), headH = 15 + (b > 0 ? 1 : 0);

  const col = tint === "flash" ? () => "#ffffff" : (x => x);
  const OL = tint === "flash" ? "#ffffff" : OUTLINE;

  /* Pass 1: silhouette outline, one pixel fatter than every part. */
  const outline = () => {
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
    blob(c, J.fF[0]+facing*2, J.fF[1], 11, 6, OL);
    blob(c, J.fB[0]+facing*2, J.fB[1], 11, 6, OL);
  };
  outline();

  /* Pass 2: the parts themselves, back to front. */
  /* back arm + back leg sit in shadow */
  limb(c, J.sB[0],J.sB[1], J.eB[0],J.eB[1], wUA, col(pal.suitS));
  limb(c, J.eB[0],J.eB[1], J.hB[0],J.hB[1], wFA - 1, col(pal.skinB));
  blob(c, J.hB[0], J.hB[1], wFA+1, wFA+1, col(pal.skinB));
  limb(c, hipB[0],hipB[1], J.kB[0],J.kB[1], wTH, col(pal.suitS));
  limb(c, J.kB[0],J.kB[1], J.fB[0],J.fB[1], wSH, col(pal.suitS));
  blob(c, J.fB[0]+facing*2, J.fB[1], 9, 4, col(pal.trim));

  /* torso, belt, head */
  limb(c, J.pv[0],J.pv[1], J.nk[0],J.nk[1], wTO, col(pal.suit));
  limb(c, J.pv[0],J.pv[1], J.nk[0],J.nk[1], Math.max(3, wTO-8), col(pal.suitS));
  blob(c, J.pv[0], J.pv[1] + 1, wTO, 4, col(pal.belt));
  blob(c, J.nk[0], J.nk[1] + 3, 7, 5, col(pal.skin));
  const hx = J.hd[0] - (headW>>1), hy = J.hd[1] - (headH>>1);
  roundRect(c, hx, hy, headW, headH, col(pal.skin));
  /* hair: a cap across the crown, plus a wedge down the back of the skull so
     the head reads as facing somewhere even at this size */
  roundRect(c, hx, hy, headW, 5, col(pal.hair));
  c.fillStyle = col(pal.hair);
  c.fillRect(facing > 0 ? hx : hx + headW - 3, hy + 4, 3, 5);
  if (tint !== "flash"){
    c.fillStyle = pal.skinS;
    c.fillRect(hx + 1, hy + 5, headW - 2, 1);                    /* brow */
    c.fillRect(hx + (facing > 0 ? 1 : 2), hy + headH - 3, headW - 3, 2); /* jaw */
    c.fillStyle = pal.eye;
    c.fillRect(J.hd[0] + facing * 2, hy + 7, 2, 3);              /* eye */
  }

  /* front leg + front arm read as lit */
  limb(c, hipF[0],hipF[1], J.kF[0],J.kF[1], wTH, col(pal.suit));
  limb(c, J.kF[0],J.kF[1], J.fF[0],J.fF[1], wSH, col(pal.suit));
  blob(c, J.fF[0]+facing*2, J.fF[1], 9, 4, col(pal.trim));
  limb(c, J.sF[0],J.sF[1], J.eF[0],J.eF[1], wUA, col(pal.suit));
  limb(c, J.eF[0],J.eF[1], J.hF[0],J.hF[1], wFA, col(pal.skin));
  blob(c, J.hF[0], J.hF[1], wFA+3, wFA+3, col(pal.skin));
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
