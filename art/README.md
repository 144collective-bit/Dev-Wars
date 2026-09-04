# Art specification

Everything needed to draw a character or a stage that drops straight into the
game. Every number here was measured from the running build.

Regenerate the templates after any change to the rig or the animation tables:

```
node tools/bake-atlas.mjs           # sprite template + one reference sheet per character
node tools/bake-stage-template.mjs  # the three background layer guides
```

`bake-atlas.mjs` cross-checks the sheet layout against the rig and fails if a
frame is missing from either side, so the template cannot drift from the game.

## Files

| File | What it is |
|---|---|
| `sprite-sheet-template.png` | The blank grid: guides, frame names, existing art ghosted in |
| `reference-kestrel.png` etc. | The current art in sheet order — repaint over it |
| `stage-far-template.png` etc. | Background layer guides at their exact canvas sizes |
| `atlas-layout.json` | Frame order and every animation timing, machine-readable |

## Character sheets

**1024 × 1024 PNG**, 32-bit with transparency. An **8 × 8 grid of 128 × 128
cells**, read left to right, top to bottom. 54 cells used, 10 reserved and left
empty.

**The origin in every cell is (64, 112).** Everything else is preference; this
is not.

- **Row 112 is the floor.** The soles rest on it in every grounded frame. A
  frame one pixel out makes the character bob as the animation plays.
- **Column 64 is the body's centre.** The torso sits on it; limbs reach past it
  freely. A drifting body reads as the character sliding.
- **Airborne frames sit above the floor line.** The engine adds the height —
  don't re-centre them in the cell.

Drawn art currently occupies 93 × 95 px of the 128 cell, leaving about 20 px on
every side for hair, cloth, weapons and follow-through.

**Each character has its own size and the engine does not rescale sprites.**
Brick is 12% larger than Kestrel, Vex 5% smaller. Each reference sheet is
already at that character's final size — match it, don't normalise.

### Technical rules

- Transparent background, **no baked shadow** — the game draws a contact shadow
  and squashes it by height.
- **Draw facing right.** The engine mirrors for the other side, so asymmetric
  details flip.
- **Hard edges only.** No anti-aliasing, no semi-transparent pixels; alpha is
  fully on or fully off. The game scales with nearest-neighbour.
- 12–20 colours per character, near-black outline on the outer silhouette,
  light from the front-top so the near limb is lit and the far limb shaded.

### Frames

The 54 names, their grouping and their purpose are in `atlas-layout.json` and
on the template image itself. Several do double duty: `crouch` is both the
ducking pose and the hold frame for every crouching attack; `jabStart` and
`shortStart` are wind-ups reused as recovery.

Attacks are three frames — wind-up, hit, recovery — held for the move's
startup, active and recovery counts. The middle frame is on screen at the
moment of impact, usually with the game frozen on it, so it has to read
instantly at 1× zoom.

## Stage backgrounds

Three PNGs per stage. Screen is 384 × 216; the ground line is `y = 186`.

| Layer | Size | Scroll | Visible range |
|---|---|---|---|
| far | 880 × 216 | 0.25× | x 0–508 |
| near | 880 × 216 | 0.55× | x 0–657 |
| floor | 880 × 40 | 1× | all of it |

The camera travels 496 px across an 880 px stage, so the slower back layers
show less of themselves — painting the full width of the far layer is wasted
effort. The templates mark where to stop.

The floor layer's **row 0 is the ground line**.

- Keep the band around the ground line dark and low-contrast. Fighters are only
  70 px tall on a 216 px screen and must stay readable against it.
- The far layer must be fully opaque; holes in it show as black.
- Edges never wrap — the camera stops before either end.

## Engine work to accept sheets

The art side and the engine side are independent; the sheets can be drawn
before any of this exists.

1. **Loader** — read the atlas plus `atlas-layout.json` into a frame lookup,
   replacing `getSprite`'s runtime rasteriser. The rig stays in the tree as the
   thing the references were baked from.
2. **Renderer** — `drawFighter` blits a cell instead of a cached pose canvas.
   Mirroring stays where it is. Nothing else in the draw path changes.
3. **Delivery** — the sheet ships as a separate PNG next to the HTML rather
   than a data URI: base64 inflates by a third and compresses badly.
   `fighter.html` stops being a single file at this point.
4. **Validator** — `tools/check-sheet.mjs`: dimensions, reserved cells empty,
   lowest opaque pixel on row 112 for grounded frames, torso centred on column
   64 across the walk cycle, no partial alpha, no art crossing a cell boundary.
   Run it on delivery so mistakes come back the same day.
5. **Goldens** — a pure art swap must leave all eight golden replays passing.
   That is the point of hurtboxes being separate data. If they fail, the swap
   changed gameplay and it is a bug, not a new baseline.
