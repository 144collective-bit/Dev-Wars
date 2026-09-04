#!/usr/bin/env node
/* Behavioural tests.

   The goldens prove nothing changed; these prove the rules are right in the
   first place. They assert the things a fighting game must get correct —
   what blocks what, what a throw beats, whether a cancel comes out — plus
   the netcode invariants that online play depends on. */
import { openGame } from "./harness.mjs";

let passed = 0, failed = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok){ passed++; console.log("  pass  " + name); }
  else { failed++; console.error("  FAIL  " + name + "\n          got  " + JSON.stringify(got) +
                                 "\n          want " + JSON.stringify(want)); }
};
const ok = (name, cond) => eq(name, !!cond, true);
const group = n => console.log("\n" + n);

const { browser, page, errors } = await openGame();

/* ---------------------------------------------------------------- combat -- */
group("Guard rules");
const guard = await page.evaluate(() => {
  const S_ = S;
  /* Pin player two against the right wall so they cannot simply retreat out
     of range; their blocking direction is therefore RIGHT. */
  const pinned = () => {
    const g = new Game(["kestrel","brick"], 3);
    for (let i = 0; i < 110; i++) g.step([0,0]);            /* clear the intro */
    for (let i = 0; i < 600; i++) g.step([IN_RIGHT, IN_RIGHT]);
    return g;
  };
  const BACK = IN_RIGHT;
  const trial = (atk, guardMask, frames) => {
    const g = pinned(), hp = g.fighters[1].hp;
    let blocked = false, hit = false;
    for (let i = 0; i < frames; i++){
      g.step([atk(i), guardMask]);
      if (g.fighters[1].state === S_.BLOCKSTUN) blocked = true;
      if (g.fighters[1].state === S_.HITSTUN || g.fighters[1].state === S_.KNOCKDOWN) hit = true;
    }
    return { dmg: hp - g.fighters[1].hp, blocked, hit };
  };
  const poke = btn => i => i < 3 ? btn : 0;
  const jumpIn = (guardMask, pressAt) => {
    const g = pinned(), hp = g.fighters[1].hp;
    let blocked = false;
    for (let i = 0; i < 70; i++){
      g.step([ i < 2 ? IN_UP : (i >= pressAt && i < pressAt + 3 ? IN_HK : 0), guardMask ]);
      if (g.fighters[1].state === S_.BLOCKSTUN) blocked = true;
    }
    return { dmg: hp - g.fighters[1].hp, blocked };
  };
  return {
    midVsStand:    trial(poke(IN_MP), BACK, 30),
    midVsCrouch:   trial(poke(IN_MP), BACK | IN_DOWN, 30),
    midVsOpen:     trial(poke(IN_MP), 0, 30),
    lowVsStand:    trial(poke(IN_DOWN | IN_HK), BACK, 40),
    lowVsCrouch:   trial(poke(IN_DOWN | IN_HK), BACK | IN_DOWN, 40),
    overVsCrouch:  jumpIn(BACK | IN_DOWN, 30),
    overVsStand:   jumpIn(BACK, 30)
  };
});
ok("a mid is blocked standing",              guard.midVsStand.blocked && guard.midVsStand.dmg === 0);
ok("a mid is blocked crouching",             guard.midVsCrouch.blocked && guard.midVsCrouch.dmg === 0);
ok("a mid connects against no guard",        guard.midVsOpen.hit && guard.midVsOpen.dmg > 0);
ok("a sweep beats a standing guard",         guard.lowVsStand.hit && guard.lowVsStand.dmg > 0);
ok("a sweep is blocked crouching",           guard.lowVsCrouch.blocked && guard.lowVsCrouch.dmg === 0);
ok("a jump-in beats a crouching guard",      guard.overVsCrouch.dmg > 0);
ok("a jump-in is blocked standing",          guard.overVsStand.blocked && guard.overVsStand.dmg === 0);

group("Attacks, throws and cancels");
const combat = await page.evaluate(() => {
  const fresh = (a, b) => { const g = new Game([a,b], 3); for (let i = 0; i < 110; i++) g.step([0,0]); return g; };
  const approach = (g, gap) => { for (let n = 0; n < 400 && Math.abs(g.fighters[0].px - g.fighters[1].px) > gap; n++) g.step([IN_RIGHT, 0]); };
  const out = {};

  let g = fresh("kestrel","brick"); approach(g, 40);
  let hp = g.fighters[1].hp;
  for (let i = 0; i < 30; i++) g.step([i < 3 ? IN_MP : 0, 0]);
  out.cleanHit = { dmg: hp - g.fighters[1].hp, meter: g.fighters[0].meter };

  g = fresh("kestrel","brick"); approach(g, 34);
  hp = g.fighters[1].hp;
  for (let i = 0; i < 30; i++) g.step([i < 4 ? (IN_LP | IN_LK) : 0, IN_RIGHT]);   /* guard held */
  out.throwBeatsGuard = hp - g.fighters[1].hp;

  /* A light normal that connects should cancel into a special during hitstop. */
  g = fresh("kestrel","brick"); approach(g, 38);
  hp = g.fighters[1].hp;
  const script = [IN_DOWN|IN_LP, IN_DOWN|IN_LP, IN_DOWN];
  [IN_DOWN, IN_DOWN|IN_RIGHT, IN_RIGHT, IN_RIGHT|IN_MP].forEach(m => script.push(m, m));
  for (const m of script) g.step([m, 0]);
  let sawSpecial = false;
  for (let i = 0; i < 50; i++){ g.step([0,0]); if (ALL_MOVES.find(mv => mv.num === g.fighters[0].moveId)?.type === "special") sawSpecial = true; }
  out.cancel = { dmg: hp - g.fighters[1].hp, sawSpecial };

  /* Chip damage on a blocked projectile. */
  g = fresh("kestrel","brick");
  const s2 = []; [IN_DOWN, IN_DOWN|IN_RIGHT, IN_RIGHT, IN_RIGHT|IN_HP].forEach(m => s2.push(m,m,m));
  for (const m of s2) g.step([m, 0]);
  hp = g.fighters[1].hp;
  for (let i = 0; i < 120; i++) g.step([0, IN_RIGHT]);
  out.chip = hp - g.fighters[1].hp;

  /* Motion inputs. */
  const motion = (chars, script, holds) => {
    const gg = fresh(chars[0], chars[1]);
    for (const m of script) for (let k = 0; k < (holds||3); k++) gg.step([m, 0]);
    for (let i = 0; i < 16; i++) gg.step([0,0]);
    return gg;
  };
  out.fireball = motion(["kestrel","brick"], [IN_DOWN, IN_DOWN|IN_RIGHT, IN_RIGHT, IN_RIGHT|IN_HP]).projectiles.length;
  const dpG = motion(["kestrel","brick"], [IN_RIGHT, IN_DOWN, IN_DOWN|IN_RIGHT, IN_DOWN|IN_RIGHT|IN_MP]);
  out.dragonPunch = dpG.fighters[0].airborne;
  const chG = fresh("vex","brick");
  for (let i = 0; i < 60; i++) chG.step([IN_LEFT, 0]);
  for (let i = 0; i < 6; i++)  chG.step([IN_RIGHT | IN_HP, 0]);
  for (let i = 0; i < 14; i++) chG.step([0,0]);
  out.chargeProjectile = chG.projectiles.length;

  /* Round flow and stage bounds. */
  g = fresh("kestrel","brick"); g.fighters[1].hp = 4; approach(g, 36);
  for (let i = 0; i < 20; i++) g.step([i < 3 ? IN_HP : 0, 0]);
  const koPhase = g.phase;
  for (let i = 0; i < 260; i++) g.step([0,0]);
  out.ko = { koPhase, round: g.round, wins: g.fighters[0].wins };

  g = fresh("kestrel","brick");
  for (let i = 0; i < 900; i++) g.step([IN_LEFT, IN_LEFT]);
  out.corner = g.fighters.map(f => Math.round(f.px));
  return out;
});
ok("a clean hit deals damage and builds meter", combat.cleanHit.dmg > 0 && combat.cleanHit.meter > 0);
ok("a throw goes through a held guard",         combat.throwBeatsGuard > 0);
ok("a connected light cancels into a special",  combat.cancel.sawSpecial && combat.cancel.dmg > combat.cleanHit.dmg / 2);
ok("a blocked projectile chips",                combat.chip > 0);
eq("quarter-circle throws a projectile",        combat.fireball, 1);
ok("dragon-punch motion leaves the ground",     combat.dragonPunch);
eq("charge motion throws a projectile",         combat.chargeProjectile, 1);
ok("a KO ends the round and awards it",         combat.ko.koPhase === 2 && combat.ko.round === 2 && combat.ko.wins === 1);
ok("fighters cannot leave the stage",           combat.corner[0] >= 0 && combat.corner[0] < 60);

/* --------------------------------------------------------------- netcode -- */
group("Netcode");
const net = await page.evaluate(() => {
  const out = {};
  const mkNet = (isHost, side, seed) => {
    const n = Object.create(Net);
    n.localInputs = new Map(); n.remoteInputs = new Map(); n.pendingChecks = new Map();
    n.isHost = isHost; n.mySide = side; n.seed = seed >>> 0;
    n.simFrame = 0; n.sendFrame = NET_DELAY; n.state = "playing";
    n.stallFrames = 0; n.desync = false;
    for (let i = 0; i < NET_DELAY; i++){ n.localInputs.set(i, 0); n.remoteInputs.set(i, 0); }
    return n;
  };
  /* Two peers wired straight to each other must stay bit-identical. */
  const SEED = 5150;
  const A = mkNet(true, 0, SEED), B = mkNet(false, 1, SEED);
  A.send = o => B.onData(o); B.send = o => A.onData(o);
  const gA = new Game(["kestrel","vex"], SEED), gB = new Game(["kestrel","vex"], SEED);
  const rnd = makeRNG(4242);
  const mk = x => (x < 26 ? IN_RIGHT : x < 44 ? IN_LEFT : x < 54 ? IN_DOWN : x < 62 ? IN_UP : 0) |
                  (x >= 64 && x < 72 ? IN_LP : x >= 72 && x < 80 ? IN_MP : x >= 80 && x < 88 ? IN_HK : 0);
  let stepped = 0, diverged = -1;
  for (let i = 0; i < 1500; i++){
    const pa = A.exchange(mk(rnd()%100), gA); if (pa){ gA.step(pa); }
    const pb = B.exchange(mk(rnd()%100), gB); if (pb){ gB.step(pb); stepped++; }
    if (hashState(gA) !== hashState(gB)){ diverged = i; break; }
  }
  out.lockstep = { stepped, diverged, sides: A.mySide === 0 && B.mySide === 1 };

  /* The desync detector must actually fire. */
  const C = mkNet(true,0,7), D = mkNet(false,1,7);
  C.send = o => D.onData(o); D.send = o => C.onData(o);
  const gC = new Game(["brick","vex"],7), gD = new Game(["brick","vex"],7);
  for (let i = 0; i < 200; i++){
    const pa = C.exchange(0,gC); if (pa) gC.step(pa);
    const pb = D.exchange(0,gD); if (pb) gD.step(pb);
    if (i === 90) gD.fighters[0].hp -= 137;
  }
  out.desyncDetected = C.desync || D.desync;

  /* A packet from a previous match must not leak into this one. */
  const E = mkNet(true,0,111); E.remoteInputs.clear();
  E.onData({ t:"i", f:5, m:IN_HP, s:999 });
  const stale = !E.remoteInputs.has(5);
  E.onData({ t:"i", f:5, m:IN_HP, s:111 });
  out.sessionFilter = stale && E.remoteInputs.get(5) === IN_HP;

  /* Version handshake: matching builds start, mismatched builds refuse. */
  const pair = (guestVer) => {
    const H = mkNet(true, 0, 1), G = mkNet(false, 1, 1);
    H.state = G.state = "handshake"; H.myChar = "kestrel"; G.myChar = "vex";
    H.sent = []; H.msgs = [];
    H.send = o => { H.sent.push(o); G.onData(o); };
    G.send = () => {};
    H.onStatus = (m,k) => H.msgs.push((k||"") + ":" + m);
    H.onStart = () => { H.started = true; };
    H.onData({ t:"hello", char:"vex", ver:guestVer });
    return H;
  };
  const good = pair(GAME_VERSION), bad = pair("0.9.0");
  out.handshake = {
    matchingStarts: !!good.started && good.sent.some(m => m.t === "start"),
    mismatchRefused: !bad.started && !bad.sent.some(m => m.t === "start"),
    mismatchWarned: bad.msgs.some(m => /err:/.test(m) && /version/i.test(m)),
    mismatchTold: bad.sent.some(m => m.t === "badver"),
    mismatchClosed: bad.state === "dead"
  };
  return out;
});
eq("lockstep peers never diverge",            net.lockstep.diverged, -1);
ok("lockstep simulated the full run",         net.lockstep.stepped > 1400 && net.lockstep.sides);
ok("a desync is detected",                    net.desyncDetected);
ok("stale packets from a past match ignored", net.sessionFilter);
ok("matching versions start a match",         net.handshake.matchingStarts);
ok("mismatched versions never start",         net.handshake.mismatchRefused);
ok("mismatched versions warn the player",     net.handshake.mismatchWarned);
ok("mismatched versions tell the peer",       net.handshake.mismatchTold);
ok("mismatched versions close the link",      net.handshake.mismatchClosed);

/* ------------------------------------------------------------ input path -- */
group("Input");
const input = await page.evaluate(() => {
  const fake = { axes:[0,0], buttons:Array.from({length:16},()=>({pressed:false})), connected:true };
  navigator.getGamepads = () => [fake];
  const set = o => { fake.axes = [o.ax||0, o.ay||0]; fake.buttons.forEach((b,i)=> b.pressed = !!(o.b||[]).includes(i)); return Pad.readAny(); };
  const before = Settings.binds.p1.lp;
  Settings.binds.p1.lp = "KeyQ"; rebuildMaps();
  const remapped = KEYMAP_P1.KeyQ === IN_LP && KEYMAP_P1[before] === undefined;
  Settings.binds.p1.lp = before; rebuildMaps();
  return {
    stickLeft: set({ ax:-0.9 }) === IN_LEFT,
    stickDeadzone: set({ ax:0.3 }) === 0,
    dpadUp: set({ b:[12] }) === IN_UP,
    faceButtons: set({ b:[2] }) === IN_LP && set({ b:[0] }) === IN_LK,
    shoulders: set({ b:[5] }) === IN_HP && set({ b:[7] }) === IN_HK,
    combined: set({ ax:0.9, b:[2,0] }) === (IN_RIGHT|IN_LP|IN_LK),
    remapped,
    restored: KEYMAP_P1[before] === IN_LP,
    opposedCancel: cleanMask(IN_LEFT|IN_RIGHT) === 0 && cleanMask(IN_UP|IN_DOWN) === IN_DOWN
  };
});
ok("stick direction and deadzone",      input.stickLeft && input.stickDeadzone);
ok("d-pad and face buttons map",        input.dpadUp && input.faceButtons);
ok("shoulders are the heavy attacks",   input.shoulders);
ok("directions and buttons combine",    input.combined);
ok("rebinding rewrites the keymap",     input.remapped && input.restored);
ok("opposed directions cancel",         input.opposedCancel);

await browser.close();
if (errors.length){ console.error("\nPage errors:\n  " + errors.join("\n  ")); failed++; }
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
