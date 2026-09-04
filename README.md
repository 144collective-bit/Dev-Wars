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
| `ICE_SERVERS` | STUN servers for NAT traversal. Add a TURN server here to cover the ~10% of networks STUN cannot punch through. |
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

## Development

```
npm install          # Playwright, for the headless test browser
npm test             # behavioural tests, then the golden replays
npm run build        # derive dist/fighter-artifact.html from fighter.html
```

There is no build step for the game itself — `fighter.html` is the
deliverable, edited directly. `npm run build` only derives the Artifact
variant, which is the same page with the document wrapper stripped because
the Artifact host supplies its own.

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

Art edits count. Hurtboxes are currently derived from the rig's joint
positions, so changing a pose to look better also changes where that fighter
can be hit.

## Tuning the game

Everything is in one file and grouped by section:

- `POSE` / `ANIM` — the jointed rig. A pose is a set of joint positions in
  low-res pixels; the renderer draws chunky pixel limbs between them and
  caches the result, so editing a number changes the art immediately.
- `NORMALS` — frame data for every normal move: startup, active, recovery,
  damage, hitstun, blockstun, hitbox.
- `CHARACTERS` — palettes, proportions, walk speeds, health, and each
  fighter's specials and super.
- `Game` — the simulation. Integer-only by design; keep it that way or online
  play will desync.

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
