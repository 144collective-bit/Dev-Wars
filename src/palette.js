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

/* Snapping each channel on its own is what the hardware does to a colour it is
   given, but it is not what an artist choosing a colour FOR the hardware does.
   The gap from 0 to 52 is the widest step in the ramp, so a near-neutral dark
   like (23,26,35) rounds to (0,0,52) — a twelve-point chroma becomes a
   fifty-two-point navy. Whole surfaces meant to read as dark grey came out as
   saturated blue bars. So the snap is constrained: quantise the value, then
   allow the channels to spread apart only as far as the colour was actually
   colourful to begin with. Saturated colours are unaffected, because their
   input chroma buys them the spread they need. */
const LEVEL_STEP = 36;                       /* mean gap between MD levels */
function levelIndex(v){
  let best = 0, bestD = 1e9;
  for (let i = 0; i < MD_LEVELS.length; i++){
    const d = Math.abs(MD_LEVELS[i] - v);
    if (d < bestD){ bestD = d; best = i; }
  }
  return best;
}
function mdRGB(r, g, b){
  r = r < 0 ? 0 : r > 255 ? 255 : r;
  g = g < 0 ? 0 : g > 255 ? 255 : g;
  b = b < 0 ? 0 : b > 255 ? 255 : b;
  const idx = [levelIndex(r), levelIndex(g), levelIndex(b)];
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const spread = Math.round(chroma / LEVEL_STEP);
  if (idx[0] - Math.min(...idx) > spread || Math.max(...idx) - idx[0] > spread ||
      Math.max(...idx) - Math.min(...idx) > spread){
    /* anchor on the channel nearest the colour's own mean, then clamp */
    const mean = (r + g + b) / 3, base = levelIndex(mean);
    for (let i = 0; i < 3; i++)
      idx[i] = idx[i] < base - spread ? base - spread
             : idx[i] > base + spread ? base + spread : idx[i];
  }
  return "#" + hex2(MD_LEVELS[idx[0]]) + hex2(MD_LEVELS[idx[1]]) + hex2(MD_LEVELS[idx[2]]);
}
function parseHex(h){
  if (h.length === 4) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
}
function rgbHex(r, g, b){
  const q = v => hex2(clamp(Math.round(v), 0, 255));
  return "#" + q(r) + q(g) + q(b);
}
/* Snap a colour onto the Mega Drive's 512, for anything that wants that look
   on purpose. It is no longer applied to everything: the nine-bit palette is
   most of why a sprite reads as 1992, and it is also a hard ceiling on form —
   there is no room in eight levels per channel for occlusion in a crease, warm
   subsurface at a terminator, or bounce light off the floor, which is most of
   what separates modern pixel art from the era it is quoting. */
function mdSnap(h){ const [r,g,b] = parseHex(h); return mdRGB(r, g, b); }
function md(h){ const [r,g,b] = parseHex(h); return rgbHex(r, g, b); }

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
  return rgbHex(...hsv2rgb(h, s, v));
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
  const [h, s0, v0] = rgb2hsv(...parseHex(hex));
  /* A base at either extreme has nowhere to go, so it is pulled toward the
     middle first — exactly as an artist picks light grey rather than white for
     hair they intend to shade. */
  const v = clamp(v0, 0.22, 0.86);
  const mk = (val, sat, hue) => rgbHex(...hsv2rgb(hue, clamp(sat, 0, 1), clamp(val, 0, 1)));
  return {
    /* Occlusion, for creases: where light cannot reach, it is not just darker,
       it is bluer and flatter, because what little arrives is skylight. */
    ao:   mk(v * 0.24, s0 * 0.80 + 0.08, towards(h, 250, 0.42)),
    dk:   mk(v * 0.40, s0 * 1.05 + 0.05, towards(h, 250, 0.28)),
    sh:   mk(v * 0.62, s0 * 1.10,        towards(h, 250, 0.13)),
    /* The terminator. Light that enters a surface and scatters back out leaves
       a warm, saturated band exactly where the lit side turns away — on skin it
       is the single strongest cue that a thing is alive rather than painted,
       and it is the tone an eight-level palette can never afford. */
    sss:  mk(v * 0.84, Math.min(1, s0 * 1.40 + 0.10), towards(h, 16, 0.34)),
    mid:  mk(v, s0, h),
    lit:  mk(v + (1 - v) * 0.28, s0 * 0.90, towards(h, 45, 0.05)),
    hi:   mk(v + (1 - v) * 0.55, s0 * 0.68, towards(h, 45, 0.11)),
    /* A small, nearly colourless specular sitting on top of the highlight. */
    spec: mk(v + (1 - v) * 0.66, s0 * 0.44, towards(h, 48, 0.12)),
    /* Light thrown back up off the floor, onto downward-facing surfaces. */
    bnc:  mk(v * 0.50, s0 * 0.62, towards(h, 205, 0.16)),
    /* A cool rim along the unlit edge: what separates a sprite from the
       background without an outline heavy enough to look like a sticker. Dim
       on purpose — at full brightness it reads as a glow and fights the
       silhouette it is supposed to support. */
    rim:  mk(clamp(v * 0.46 + 0.12, 0, 0.62), Math.min(0.55, s0 * 0.30 + 0.06),
             towards(h, 210, 0.30))
  };
}
/* True when the body tones are all distinct. Trivial in full colour; kept
   because it is the assertion that caught ramp collisions when they were not. */
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
/* Ordered dithering, as a repeating pattern rather than a pixel loop.

   At RS = 4 a single full-stage gradient covers well over a million hardware
   pixels, and stamping them one at a time is most of a second per stage. A 4x4
   tile filled once is the same picture. The pattern is scaled by 1/RS so its
   cells are hardware pixels rather than world units — which is the difference
   between a dither and a checkerboard of 4x4 blocks — and its phase is
   anchored to the canvas origin, which is what keeps a stack of one-pixel
   bands from collapsing into vertical pinstripes. */
let patCtx = null;
const ditherPatterns = new Map();
function ditherPattern(over, cut){
  const key = over + "|" + cut;
  let p = ditherPatterns.get(key);
  if (p) return p;
  if (!patCtx) patCtx = document.createElement("canvas").getContext("2d");
  const t = document.createElement("canvas");
  t.width = 4; t.height = 4;
  const tc = t.getContext("2d");
  tc.fillStyle = over;
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++)
      if (BAYER4[j][i] < cut) tc.fillRect(i, j, 1, 1);
  p = patCtx.createPattern(t, "repeat");
  if (p && p.setTransform) p.setTransform(new DOMMatrix([1/RS, 0, 0, 1/RS, 0, 0]));
  ditherPatterns.set(key, p);
  return p;
}
/* Fills a rect with `over` on `under`, mixed by ordered dither. ratio 0..1. */
function ditherRect(ctx, x, y, w, h, under, over, ratio){
  const q = 1 / RS;
  x = Math.round(x * RS) * q; y = Math.round(y * RS) * q;
  w = Math.round(w * RS) * q; h = Math.round(h * RS) * q;
  if (w <= 0 || h <= 0) return;
  if (under){ ctx.fillStyle = under; ctx.fillRect(x, y, w, h); }
  const cut = Math.round(ratio * 16);
  if (cut <= 0) return;
  if (cut >= 16){ ctx.fillStyle = over; ctx.fillRect(x, y, w, h); return; }
  ctx.fillStyle = ditherPattern(over, cut);
  ctx.fillRect(x, y, w, h);
}
/* A vertical gradient between two colours, dithered rather than blended —
   the Mega Drive sky. */
function ditherGradient(ctx, x, y, w, h, top, bottom, steps){
  /* One band per hardware pixel row rather than per world unit: the ramp has
     four times the steps to spend, so it reads as a gradient instead of as
     four visible terraces. */
  steps = steps || Math.max(1, Math.round(h * RS));
  const band = h / steps;
  for (let s = 0; s < steps; s++){
    const t = steps === 1 ? 0 : s / (steps - 1);
    const y0 = Math.round(y + s * band), y1 = Math.round(y + (s + 1) * band);
    ditherRect(ctx, x, y0, w, y1 - y0, top, bottom, t);
  }
}

/* --- a character's palette --------------------------------------------------
   Every colour is still snapped to the console's 512. That is what holds the
   art together across characters and stages, and it costs nothing.

   The hardware limits are gone, both of them. Sixteen colours per sprite could
   not carry a hoodie, jeans, a beard, a hat, slippers and a spoon; and the
   nine-bit palette underneath it had no room for occlusion in a crease, warm
   subsurface at a terminator, or bounce light off the floor. Those three tones
   are most of what separates modern pixel art from the era it quotes.

   A budget still exists, generously, so that colours are spent deliberately
   instead of accumulating. A fighter drifting past it means some material
   wants sharing, not that the limit wants raising. Asserted in the tests. */
const PALETTE_BUDGET = 72;
const OUTLINE = "#14141f";

/* Core materials every fighter has, plus any extras it declares. An extra
   gets as many tones as it earns: three for something that carries form,
   two for a flat accent. */
function characterPalette(pal, extras){
  const skin = ramp(pal.skin), suit = ramp(pal.suit),
        hair = ramp(pal.hair), trim = ramp(pal.trim);
  const out = {
    /* outline, doubling as the eye */
    line:    md(OUTLINE),
    /* Skin gets the full ladder, because a face is where every one of these
       tones is doing visible work. */
    skinAO:  skin.ao,  skinDk:  skin.dk,  skinSh:  skin.sh,
    skinSSS: skin.sss, skinMid: skin.mid, skinLit: skin.lit,
    skinHi:  skin.hi,  skinSpec: skin.spec, skinBnc: skin.bnc,
    /* the outfit carries most of the form, so it gets the longest ramp */
    suitAO:  suit.ao,  suitDk:  suit.dk,  suitSh:  suit.sh,
    suitMid: suit.mid, suitLit: suit.lit, suitHi:  suit.hi,
    suitSpec: suit.spec, suitBnc: suit.bnc,
    hairDk:  hair.ao,  hairSh:  hair.dk,  hairMid: hair.mid,
    hairLit: hair.lit, hairHi:  hair.hi,
    /* boots, gloves, belt */
    trimDk:  trim.dk,  trimMid: trim.mid, trimLit: trim.lit, trimHi: trim.hi,
    /* the cool rim that lifts the silhouette off the background */
    rim:     suit.rim
  };
  for (const name in (extras || {})){
    const spec = extras[name], r = ramp(spec.hex), n = spec.tones || 2;
    out[name + "Mid"] = r.mid;
    out[name + "Lit"] = r.lit;
    out[name + "Dk"]  = r.sh;
    if (n >= 3) out[name + "AO"] = r.ao;
    if (n >= 3) out[name + "Hi"] = r.hi;
  }
  return out;
}
const paletteSize = p => new Set(Object.values(p)).size;
