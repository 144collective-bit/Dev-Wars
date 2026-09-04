/* ============================================================================
   COLOUR — a Mega Drive palette, and the shading that goes with it
   ----------------------------------------------------------------------------
   The console look is a set of constraints, not a filter. The VDP stored three
   bits per channel, so every colour on a Mega Drive is one of 512, and those
   eight levels per channel are not an even split of 0-255 — they are what the
   DAC actually put out. Snapping to them is most of the look.

   The other half is what the hardware could not do: there was no alpha
   blending, so anything see-through was a checkerboard of two solid colours,
   and there was no per-pixel lighting, so form came from hand-placed tone
   ramps. Both are reproduced here rather than approximated with transparency.
   ========================================================================== */

const MD_LEVELS = [0, 52, 87, 116, 144, 172, 206, 255];

function mdLevel(v){
  v = v < 0 ? 0 : v > 255 ? 255 : v;
  let best = 0, bestD = 1e9;
  for (const l of MD_LEVELS){ const d = Math.abs(l - v); if (d < bestD){ bestD = d; best = l; } }
  return best;
}
const hex2 = v => v.toString(16).padStart(2, "0");
function mdRGB(r, g, b){ return "#" + hex2(mdLevel(r)) + hex2(mdLevel(g)) + hex2(mdLevel(b)); }
function parseHex(h){
  if (h.length === 4) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
}
/* Snap any colour onto the console's palette. */
function md(h){ const [r,g,b] = parseHex(h); return mdRGB(r, g, b); }

/* Lighter and darker versions of a colour.

   Done in HSV, not by scaling RGB channels. Scaling channels independently
   pushes them into the same quantisation bucket at low values, and an eight
   level ramp is coarse enough that a "dark skin tone" comes out grey. Pixel
   artists never darken that way either: shadows keep their saturation and
   rotate towards blue, highlights lose saturation and rotate towards warm.
   Doing that keeps the hue alive after the colour is snapped to the console
   palette, which is the whole point. */
function rgb2hsv(r, g, b){
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn;
  let h = 0;
  if (d){
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (mx === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, mx ? d / mx : 0, mx];
}
function hsv2rgb(h, s, v){
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60){ r = c; g = x; } else if (h < 120){ r = x; g = c; }
  else if (h < 180){ g = c; b = x; } else if (h < 240){ g = x; b = c; }
  else if (h < 300){ r = x; b = c; } else { r = c; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
/* Rotate a hue the short way round towards a target. */
function towards(h, target, amt){
  let d = ((target - h + 540) % 360) - 180;
  return h + d * amt;
}
function tone(hex, amt){
  let [h, s, v] = rgb2hsv(...parseHex(hex));
  if (amt >= 0){
    v = v + (1 - v) * amt * 0.86;
    s = s * (1 - amt * 0.46);
    h = towards(h, 45, amt * 0.30);          /* highlights drift warm */
  } else {
    const a = -amt;
    v = v * (1 - a * 0.62);
    s = Math.min(1, s * (1 + a * 0.55) + a * 0.10);
    h = towards(h, 250, a * 0.26);           /* shadows drift cool */
  }
  return mdRGB(...hsv2rgb(h, s, v));
}

/* Five tones per material: the most a 16-colour palette can spend on one
   surface and still leave room for everything else.

   A base colour near white or near black has nowhere to go — pure white
   cannot be highlighted, and five shades of near-black all snap to the same
   value. So the base is first pulled into the middle of the range, exactly as
   an artist picks light grey rather than white for hair they intend to shade.
   The tones are then nudged apart until all five survive the quantiser as
   different colours, which the loop below guarantees rather than assumes. */
function ramp(hex){
  let [h, s0, v0] = rgb2hsv(...parseHex(hex));
  const v = clamp(v0, 0.32, 0.76);
  const lo = Math.max(0.08, v * 0.34);
  const hi = Math.min(1, v + (1 - v) * 0.66);
  const at = (val, warm) => {
    const t = (val - v) / (val >= v ? Math.max(0.001, hi - v) : Math.max(0.001, v - lo));
    /* Highlights lose only a little saturation. Draining it turns a saturated
       red into peach, which then collides with skin — an outfit that reads as
       bare arms. Bright and still coloured is what a lit surface looks like. */
    const sat = val >= v ? s0 * (1 - t * 0.28) : Math.min(1, s0 * (1 + (-t) * 0.50) + (-t) * 0.09);
    /* Highlights barely rotate. Sending a hue "towards warm" takes the short
       way round the wheel, and for anything blue that route runs through
       green — a blue tunic with a mint highlight. Desaturating and raising
       the value is what actually reads as lit; the hue can stay put. */
    const hue = val >= v ? towards(h, 45, t * 0.08) : towards(h, 250, (-t) * 0.28);
    return mdRGB(...hsv2rgb(hue, clamp(sat, 0, 1), clamp(val, 0, 1)));
  };
  const targets = [lo, lo + (v - lo) * 0.52, v, v + (hi - v) * 0.48, hi];
  const out = [];
  for (let i = 0; i < 5; i++){
    let val = targets[i], col = at(val, i > 2);
    /* Walk it away from its neighbour until the quantiser tells them apart. */
    for (let tries = 0; tries < 24 && i > 0 && col === out[i - 1]; tries++){
      val = clamp(val + 0.035, 0, 1);
      col = at(val, i > 2);
    }
    out.push(col);
  }
  /* A base that is already near white cannot be pushed up any further, so the
     collision has to be resolved by pulling the tone below it down instead.
     Running both directions is what makes white hair shadeable at all. */
  for (let i = 4; i > 0; i--){
    let val = targets[i - 1];
    for (let tries = 0; tries < 24 && out[i] === out[i - 1]; tries++){
      val = clamp(val - 0.035, 0, 1);
      out[i - 1] = at(val, i - 1 > 2);
    }
  }
  return {
    dk: out[0], sh: out[1], mid: out[2], lit: out[3], hi: out[4],
    /* A cool rim along the unlit edge: what separates a sprite from the
       background without an outline heavy enough to look like a sticker. */
    /* Dim on purpose. A rim is a hint that the figure has a far side, not a
       neon outline — at full brightness it reads as a glow effect and fights
       the silhouette it is supposed to support. */
    rim: mdRGB(...hsv2rgb(towards(h, 212, 0.60), Math.min(1, s0 * 0.42 + 0.10),
                          clamp(v * 0.42 + 0.16, 0, 0.62)))
  };
}
/* True when all five body tones snapped to different colours. */
function rampIsDistinct(r){
  const v = [r.hi, r.lit, r.mid, r.sh, r.dk];
  return new Set(v).size === v.length;
}

/* --- dithering -------------------------------------------------------------
   The hardware had no translucency, so a 50% anything was two solid colours in
   a checkerboard. Ordered dithering with a 4x4 Bayer matrix gives the same
   effect at any ratio and is what the sky gradients and shadows use here. */
const BAYER4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5]
];
/* Fills a rect with `over` on `under`, mixed by ordered dither. ratio 0..1. */
function ditherRect(ctx, x, y, w, h, under, over, ratio){
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (under){ ctx.fillStyle = under; ctx.fillRect(x, y, w, h); }
  const cut = Math.round(ratio * 16);
  if (cut <= 0) return;
  ctx.fillStyle = over;
  if (cut >= 16){ ctx.fillRect(x, y, w, h); return; }
  /* Indexed by absolute canvas position, not position within this rect. Keyed
     to the rect, a one-pixel-tall band only ever reads row 0 of the matrix and
     the dither collapses into vertical pinstripes — and a gradient drawn as a
     stack of thin bands is exactly that case. */
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++)
      if (BAYER4[(y + j) & 3][(x + i) & 3] < cut) ctx.fillRect(x + i, y + j, 1, 1);
}
/* A vertical gradient between two colours, dithered rather than blended —
   the Mega Drive sky. */
function ditherGradient(ctx, x, y, w, h, top, bottom, steps){
  steps = steps || h;
  const band = h / steps;
  for (let s = 0; s < steps; s++){
    const t = steps === 1 ? 0 : s / (steps - 1);
    const y0 = Math.round(y + s * band), y1 = Math.round(y + (s + 1) * band);
    ditherRect(ctx, x, y0, w, y1 - y0, top, bottom, t);
  }
}

/* --- a character's 16 colours ----------------------------------------------
   The VDP gave a sprite one 16-entry palette, and one of those entries was
   transparent. Fifteen colours for a whole fighter is the constraint that
   forces the look: you cannot afford a five-tone ramp on every material, so
   the outfit gets the most, skin next, and small parts share.

   Budgeting it explicitly — rather than letting colours accumulate — is what
   keeps a roster looking like one game. `paletteSize` is asserted in the
   tests. */
const OUTLINE = "#14141f";

function characterPalette(pal, opts){
  opts = opts || {};
  const skin = ramp(pal.skin), suit = ramp(pal.suit),
        hair = ramp(pal.hair), trim = ramp(pal.trim);
  /* A character with an extra material — a hat, a weapon, a second garment —
     has to buy the slot from somewhere. Dropping trim to a single tone pays
     for it: a small part reads fine flat, where the outfit carrying the form
     does not. */
  const extra = {};
  if (opts.accent) extra.accent = md(opts.accent);
  if (opts.trimTones === 1) return Object.assign({
    /* 1  outline, doubling as the eye — near-black twice over is a colour
       a sprite this size cannot afford to spend */
    line:    md(OUTLINE),
    /* 4  skin */
    skinDk:  skin.sh,  skinMid: skin.mid, skinLit: skin.lit, skinHi:  skin.hi,
    /* 5  the outfit, which carries most of the form */
    suitDk:  suit.dk,  suitSh:  suit.sh,  suitMid: suit.mid,
    suitLit: suit.lit, suitHi:  suit.hi,
    /* 3  hair */
    hairDk:  hair.dk,  hairMid: hair.mid, hairLit: hair.lit,
    /* 1  boots, gloves, belt — flat */
    trimMid: trim.mid, trimLit: trim.mid,
    /* 1  the cool rim that lifts the silhouette off the background */
    rim:     suit.rim
  }, extra);
  return Object.assign({
    line:    md(OUTLINE),
    skinDk:  skin.sh,  skinMid: skin.mid, skinLit: skin.lit, skinHi:  skin.hi,
    suitDk:  suit.dk,  suitSh:  suit.sh,  suitMid: suit.mid,
    suitLit: suit.lit, suitHi:  suit.hi,
    hairDk:  hair.dk,  hairMid: hair.mid, hairLit: hair.lit,
    /* 2  boots, gloves, belt */
    trimMid: trim.mid, trimLit: trim.lit,
    /* 1  the cool rim that lifts the silhouette off the background */
    rim:     suit.rim
  }, extra);
}
const paletteSize = p => new Set(Object.values(p)).size;
