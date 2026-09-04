# Iron Circuit

A Street Fighter II–style arcade fighter that runs in a browser window. One
self-contained HTML file — no build step, no assets, no server of your own.

Original characters, original art. Nothing from any commercial fighting game
is used: the sprites are drawn procedurally in code, the sounds are
synthesised with WebAudio, and the only external file is the peer-to-peer
library used for online play.

## Putting it on your site

**Option A — upload it.** Copy `fighter.html` anywhere your site serves static
files and link to it. It works on Squarespace, Wix, WordPress, Netlify,
GitHub Pages, an S3 bucket, or a plain folder on a web host.

**Option B — embed it in a page.**

```html
<iframe src="/fighter.html"
        style="width:100%;aspect-ratio:16/9;border:0"
        title="Iron Circuit" allow="autoplay"></iframe>
```

The canvas scales itself to whatever box you give it and keeps a crisp
integer pixel scale wherever it can.

> Online play needs the page served over **https** (or from `localhost`).
> WebRTC will not open a connection on a plain `http://` origin. Opening the
> file directly from disk works for the offline modes only.

## Controls

| | |
|---|---|
| `W` `A` `S` `D` or arrows | Move · up jumps · down crouches · **hold back to block** |
| `T` `Y` `U` | Light, medium, heavy punch |
| `G` `H` `J` | Light, medium, heavy kick |
| `T` + `G` up close | Throw — goes straight through a guard |
| `Esc` · `M` | Pause (offline only) · mute |

Player two on one keyboard uses the arrow keys, `I` `O` `P` for punches and
`K` `L` `;` for kicks. **Every key is remappable** under Settings, and the
bindings are saved in the browser along with your difficulty, chosen fighter
and mute state.

**Gamepads** work with any standard-mapping controller: face buttons are the
light and medium attacks, shoulders the heavies, stick or d-pad to move. In
local versus, the first pad is player one and the second is player two.
Browsers hide a gamepad until you press a button on it.

**Phones and tablets** get an on-screen pad automatically — a round stick on
the left and six buttons on the right. Sweep your thumb around the ring to
throw a quarter-circle. Landscape gives a much bigger screen; the layout
adapts to either. You can force the pad on or off in Settings.

## The rules, briefly

- **Blocking** is holding away from your opponent. Standing guard stops mid
  attacks and jump-ins; crouching guard stops mid attacks and sweeps. A
  sweep beats a standing guard, a jump-in beats a crouching guard, and a
  throw beats both.
- **Cancelling** — a light or medium normal that *connects* can be cancelled
  into a special move during hitstop. That is where combos come from.
- **The super meter** fills as you deal and take damage. Full meter buys one
  super.
- Best of three rounds, 99 seconds each, chip damage on blocked specials.

## Online play

Matches are **peer-to-peer over a WebRTC data channel**. A free public
signalling broker (PeerJS) is used only to introduce the two browsers to each
other with a five-letter room code — no game data ever passes through it, and
you do not run a server.

The netcode is **deterministic lockstep**: neither side sends game state, only
its own input bitmask for a frame a few ticks ahead, and a frame is simulated
once both inputs are in hand. That is why the whole simulation is integer-only
— both machines have to produce byte-identical results. A rolling checksum is
exchanged every second and the game says so plainly if the two ever diverge.

The tradeoff versus rollback netcode: your own inputs take `NET_DELAY` frames
(default 3, so 50 ms) to appear on screen. Fine on a normal connection,
noticeably floaty across an ocean.

### Knobs at the top of the file

| Constant | What it does |
|---|---|
| `PEER_SERVER_CONFIG` | `null` uses the free public broker. Point it at your own PeerServer for reliability: `{host:"peer.example.com", port:443, secure:true, path:"/"}` |
| `TURN_SERVERS` | Empty by default. A TURN relay covers the networks STUN cannot punch through — see below. |
| `RECONNECT_WINDOW_MS` | How long a dropped match keeps trying to come back. |
| `NET_DELAY` | Input delay in frames. Lower feels sharper, higher survives worse connections. |
| `ROOM_PREFIX` | Namespaces your room codes on the shared broker. |
| `GAME_VERSION` | Both players must be on the same build. See below. |

### Bump `GAME_VERSION` on every release

Lockstep only works if both browsers run identical code, so the two peers
compare versions during the handshake and **refuse to start** if they differ,
telling both players to refresh. Someone with your page cached from last week
therefore gets a clear message instead of a match that quietly falls apart
halfway through.

The cost of forgetting to bump it is a silent desync; the cost of bumping it
unnecessarily is one refresh. Bump it whenever you change the file.

## Deployment

`.github/workflows/ci.yml` runs the suite on every push and pull request, then
publishes to GitHub Pages from `main` — but only after the tests pass, so a
red build cannot reach players.

**Pages needs enabling once, by hand.** The workflow tries to enable it, but
creating a Pages site is not something the workflow token is allowed to do:
it fails with `Resource not accessible by integration`. Go to
**Settings → Pages → Build and deployment** and set **Source: GitHub Actions**.
Every deploy after that is automatic.

## Development

```
npm install          # Playwright, for the headless test browser
npm run build        # src/ -> fighter.html and dist/fighter-artifact.html
npm test             # build check, behavioural tests, golden replays
```

**Edit `src/`, never `fighter.html`.** The deployable page is generated;
`npm test` starts with `build --check` and fails if the two have drifted.

| | |
|---|---|
| `src/shell.html` | Markup, styles, and the `//__BUNDLE__` marker |
| `src/config.js` | Tunables, world constants, input bits, helpers |
| `src/input.js` | Bindings, saved settings, keyboard, gamepad, touch |
| `src/rig.js` | Poses and animation data |
| `src/hurtboxes.js` | What can be hit, per pose (generated) |
| `src/moves.js` · `characters.js` | Frame data and the roster |
| `src/font.js` · `sprites.js` · `stages.js` | Everything that draws |
| `src/fighter.js` · `game.js` | Fighter state and the simulation |
| `src/audio.js` · `render.js` | Sound and the per-frame draw |
| `src/ai.js` · `net.js` · `ui.js` | CPU, netcode, menus and main loop |

The modules are **plain scripts concatenated into one inline `<script>`**, not
ES modules. They share a single top-level scope, exactly as they did when this
was one file, so every declaration stays visible to every other module with no
export bookkeeping and the shipped page carries no module semantics. The price
is that **order matters** — top-level `const` and `let` are not hoisted across
files — so `MODULES` in `tools/build.mjs` is the load order, and a new module
gets placed deliberately rather than dropped into a folder.

The split was verified by rebuilding and diffing: the generated `fighter.html`
came out byte-identical to the single file it replaced.

### The two test suites do different jobs

**`tests/behaviour.mjs`** asserts that the rules are *right*: what blocks
what, that a throw goes through a guard, that a connected light cancels into
a special, that lockstep peers never diverge, that mismatched versions refuse
to play. Read it as the specification.

**`tests/golden.mjs`** asserts that nothing *changed*. Each scenario replays a
fixed input script, folding every frame of simulation state — positions,
velocities, hurtboxes, hitboxes, projectiles — into a rolling hash, recorded
every 60 frames in `tests/golden.json`. Any drift fails and names the frame it
started at.

Every frame is folded in, not every sixtieth. Sampling periodically lets a
transient difference slip between the samples, and the first version of this
suite did exactly that: moving one joint of one pose by a single pixel
changed a hurtbox, and every scenario still passed. That is the precise class
of change the suite exists to catch, so it now hashes continuously.

### When a golden fails

Decide whether you meant it.

- **You did not** — you have found a real regression. Fix it.
- **You did** — re-record with `npm run test:record`, review the diff to
  `tests/golden.json`, and **bump `GAME_VERSION`**. An intended simulation
  change is still a change that makes this build incompatible with the last
  one online.

Art edits no longer count. Hurtboxes live in `src/hurtboxes.js` rather than
being derived from the rig, so moving a joint changes only the drawing —
verified by moving one and watching all eight scenarios still pass. Editing
`src/hurtboxes.js` is the deliberate gameplay change, and all eight fail when
you make one.

### When a connection drops

A drop mid-match is recoverable rather than fatal. Both sides keep every input
of the match so far, so when a channel comes back they tell each other where
they had got to, backfill the inputs the other is missing, and carry on from
the later of the two positions. The few frames beyond that point were
generated but never simulated by either side, so both discard them and
re-prime the input delay exactly as a match start does.

The game keeps trying for `RECONNECT_WINDOW_MS` (20 seconds by default) and
shows a countdown while it does. Losing the broker is treated separately: the
data channel is peer-to-peer and keeps working without it, so the page quietly
reconnects to the broker in the background and the room code answers again
afterwards.

One failure is called out specially. If ICE reports `failed`, the two browsers
could not find a path to each other at all — that is a NAT problem, not an
opponent problem, and retrying will not fix it. The fix is a TURN relay, so
the message says so instead of blaming the other player.

### Adding a TURN server

STUN is enough on most home networks. It is not enough on symmetric NATs —
common on corporate and mobile networks — where the only way through is a
relay both sides send their traffic to. Set `TURN_SERVERS` with the
credentials your provider gives you.

Long-lived TURN credentials sitting in a public page can be harvested and used
to relay someone else's traffic at your expense. Prefer a provider that issues
short-lived credentials, and fetch them at runtime rather than pasting them
into the file.

## Tuning the game

- `src/rig.js` — `POSE` and `ANIM`. A pose is a set of joint positions in
  low-res pixels; the renderer draws chunky pixel limbs between them and
  caches the result, so editing a number changes the art immediately, and
  changes *only* the art.
- `src/hurtboxes.js` — what can be hit, one rectangle set per pose, in rig
  space. Baked once by `tools/bake-hurtboxes.mjs` from the formula this used
  to be derived from; edited by hand from here on. This is gameplay data, not
  art data.
- `src/moves.js` — `NORMALS`, the frame data for every normal move: startup,
  active, recovery, damage, hitstun, blockstun, hitbox.
- `src/characters.js` — palettes, proportions, walk speeds, health, and each
  fighter's specials and super.
- `src/game.js` — the simulation. Integer-only by design; keep it that way or
  online play will desync.

## Known limits

- **Lockstep, not rollback.** Good on decent connections; a long-distance
  match will feel the input delay.
- **The public broker is best-effort.** If it is down, hosting fails with a
  clear message and the offline modes keep working. Run your own PeerServer
  if the game matters to you.
- **No TURN server**, so a small share of restrictive networks (some
  corporate and mobile ones) will fail to connect.
- **Touch play is harder than pad play.** A thumb sweep for a quarter-circle
  works, but charge moves (Vex) are awkward on glass.
