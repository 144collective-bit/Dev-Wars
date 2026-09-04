/* ============================================================================
   IRON CIRCUIT — a browser fighting game
   ----------------------------------------------------------------------------
   Original characters and art. Inspired by the arcade fighting genre; contains
   no third-party sprites, names, audio, or other assets.

   Architecture
     - Deterministic integer-only simulation at a fixed 60Hz tick.
     - Rendering is decoupled and may use floats freely.
     - Online play is lockstep: both peers run the identical simulation and
       exchange only input bitmasks, with a few frames of input delay.
   ========================================================================== */

/* ---- Configuration you may want to change -------------------------------- */

/* Signalling broker used only to introduce two browsers to each other. Once
   connected, match traffic is peer-to-peer and never touches this server.
   The default is PeerJS's free public broker: fine for play, best-effort
   uptime. To use your own PeerServer, replace this whole object, e.g.
     { host:"peer.example.com", port:443, secure:true, path:"/" }            */
const PEER_SERVER_CONFIG = null;  /* null = PeerJS public cloud broker */

/* ICE servers for NAT traversal. STUN alone connects most home networks; a
   TURN server (which you would have to run or rent) covers the rest.        */
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" }
];

const ROOM_PREFIX  = "ironcircuit-v1-";  /* namespaces room codes on the broker */

/* Two peers must be running identical code or their simulations will drift
   apart. Bump this on EVERY release: a mismatched pair is refused up front
   with a "refresh the page" message, which is a far cheaper failure than a
   match that silently desyncs halfway through. */
const GAME_VERSION = "1.2.0";
const NET_DELAY    = 3;                  /* frames of input delay in online play */

/* ---- Screen / world constants -------------------------------------------- */

const W = 384, H = 216;          /* internal resolution, scaled up on display */
const GROUND_Y   = 186;          /* y of the floor line, in screen pixels     */
const STAGE_W    = 880;          /* playfield width in world pixels           */
const FP         = 256;          /* fixed-point scale: 1px = 256 units        */
const GRAVITY    = 62;           /* fixed-point units per frame^2             */
const TICK_MS    = 1000 / 60;

/* Input bits. Directions are stored raw (screen-relative); the simulation
   converts them to facing-relative values so replays and netplay agree.      */
const IN_UP=1, IN_DOWN=2, IN_LEFT=4, IN_RIGHT=8,
      IN_LP=16, IN_MP=32, IN_HP=64, IN_LK=128, IN_MK=256, IN_HK=512;
const PUNCHES = IN_LP|IN_MP|IN_HP;
const KICKS   = IN_LK|IN_MK|IN_HK;
const BUTTONS = PUNCHES|KICKS;

/* ---- Small deterministic helpers ----------------------------------------- */

const clamp = (v,lo,hi) => v < lo ? lo : v > hi ? hi : v;
const sign  = v => v < 0 ? -1 : v > 0 ? 1 : 0;

/* Seeded LCG. The host picks the seed and sends it, so both peers roll the
   same numbers. Only ever used for cosmetic-but-synced things (hit sparks,
   AI jitter) — never for anything a desync check would miss. */
function makeRNG(seed){
  let s = (seed >>> 0) || 1;
  return function(){
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
}

/* FNV-1a over the parts of the game state that must match across peers. */
function hashState(g){
  let h = 0x811c9dc5;
  const mix = v => { h ^= (v|0); h = Math.imul(h, 0x01000193) >>> 0; };
  mix(g.frame); mix(g.timer); mix(g.phase);
  for (const f of g.fighters){
    mix(f.x); mix(f.y); mix(f.vx); mix(f.vy);
    mix(f.hp); mix(f.state); mix(f.stateFrame); mix(f.facing);
    mix(f.moveId); mix(f.hitstun); mix(f.blockstun); mix(f.meter); mix(f.comboHits);
    mix(f.wins); mix(f.airborne ? 1 : 0);
  }
  return h >>> 0;
}
