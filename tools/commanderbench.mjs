// node tools/commanderbench.mjs - COMMANDER: the fleet ledger (units/commander/fleet.js) and the Huey's AI pilot
// (units/commander/heliai.js) that takes a Huey the commander leaves in the air home: to a pad on land, onto the
// ALBATROSS's deck while she steams, from a fast low run and from a climb. The Huey here is the real flight model
// (hueyfm.js at 9.81, as the game flies it).
import { FM, THREE } from './hueypilot.mjs';
const { createFleet, FLEET_TYPES } = await import('../game/js/units/commander/fleet.js');
const { createHeliAI } = await import('../game/js/units/commander/heliai.js');

let fails = 0, n = 0;
const check = (name, ok, got, want) => { n++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(54)} ${got}${want ? '   (want ' + want + ')' : ''}`); if (!ok) fails++; };

// ------------------------------------------------------------------ the ledger
{
  const F = createFleet();
  check('fleet: every type starts with a reserve', FLEET_TYPES.every(t => F.n[t.id] === t.start), JSON.stringify(F.n));
  check('fleet: Huey reserve 3 (the old lives)', F.n.heli === 3, F.n.heli, 3);
  check('fleet: take one out', F.take('jet') && F.n.jet === 1, F.n.jet, 1);
  F.take('jet'); check('fleet: none left to take', !F.take('jet') && F.n.jet === 0, F.n.jet, 0);
  const S = { mat: 90 }; const why = F.buy('jet', S);
  check('fleet: materiel buys one', why === '' && F.n.jet === 1 && S.mat === 10, `${F.n.jet} / mat ${S.mat}`);
  check('fleet: too dear says so', /COSTS/.test(F.buy('tomcat', S)) && S.mat === 10, F.buy('tomcat', S));
  F.lose('jet', 'SHOT DOWN'); check('fleet: a loss is counted', F.lost.jet === 1 && F.losses() === 1, F.lost.jet, 1);
  F.give('marine'); check('fleet: a Marine stands down into reserve', F.n.marine === 7, F.n.marine, 7);
  check('fleet: not spent while reserves remain', !F.spent(), F.total());
  for (const t of FLEET_TYPES) F.n[t.id] = 0;
  check('fleet: spent with no reserve and nothing out', F.spent(() => false), 'spent');
  check('fleet: not spent while one unit is still out', !F.spent(id => id === 'm113'), 'M113 out');
  const st = createFleet().strip(id => id === 'heli');
  check('fleet: HUD strip lists out units', st.find(s => s.id === 'heli').out === 1 && st.find(s => s.id === 'jet').out === 0, st.map(s => `${s.short} ${s.n}+${s.out}`).join(' '));
}

// ------------------------------------------------------------------ the Huey AI
const DT = 1 / 60, V = (x, y, z) => new THREE.Vector3(x, y, z);
function huey(pos, vel, yaw = 0, coll = 0.42) {
  const H = FM.createHueySim(9.81); H.reset(pos, yaw, false, 1); H.vel.copy(vel); H.fuelKg = FM.UH1H.FUEL_KG * 0.7; H.c.coll = coll; return H;
}
// fly with the AI until it reports landed (and has settled) or time runs out
function run(H, AI, env, secs, ctlBase = { throttle: 1, gov: 'AUTO', fuel: true }) {
  let t = 0, td = null, maxPitch = 0, minAgl = 1e9, landedT = -1, ev = null;
  for (; t < secs; t += DT) {
    const c = AI.step(H, DT, { ground: env.ground });
    const e = H.step(DT, { ...ctlBase, ...c }, env);
    if (env.tick) env.tick(DT);
    if (e && !ev && e !== 'land') ev = e;
    if (e === 'land' && !td) td = { vy: H.vel.y, t };
    if (H.dead) return { dead: H.dead, t };
    maxPitch = Math.max(maxPitch, Math.abs(H.attitude().pitch));
    if (AI.phase === 'transit') minAgl = Math.min(minAgl, H.pos.y - env.ground(H.pos.x, H.pos.z));
    if (AI.phase === 'landed' && landedT < 0) landedT = t;
    if (landedT >= 0 && t - landedT > 3) break;
  }
  return { t, td, maxPitch, minAgl, landed: H.landed, phase: AI.phase, ev };
}
{   // 1. over land to a pad 420 m away (the pad on a 6 m plateau, a 40 m hill on the way)
  const pad = { x: 300, y: 6, z: -290 };
  const ground = (x, z) => { const hill = 40 * Math.exp(-((x - 150) ** 2 + (z + 145) ** 2) / (2 * 40 * 40)); return 6 + hill; };
  const env = { groundY: ground, water: false, ground };
  const H = huey(V(0, 60, 0), V(0, 0, -22)), AI = createHeliAI();
  AI.engage(H, () => ({ x: pad.x, y: pad.y, z: pad.z, vx: 0, vz: 0, hdg: null }));
  const r = run(H, AI, env, 120), d = Math.hypot(H.pos.x - pad.x, H.pos.z - pad.z);
  check('huey AI: lands on a pad 420 m away over a hill', !r.dead && r.landed && r.phase === 'landed', `${r.dead || r.phase} in ${r.t.toFixed(0)} s`);
  check('huey AI: on the spot (within 4 m)', d < 4, d.toFixed(1) + ' m', '< 4 m');
  check('huey AI: gentle touchdown (sink < 1.5 m/s)', r.td && r.td.vy > -1.5, r.td ? r.td.vy.toFixed(2) + ' m/s' : 'none');
  check('huey AI: clears the hill en route (> 20 m)', r.minAgl > 20, r.minAgl.toFixed(0) + ' m', '> 20 m');
  check('huey AI: no wild attitudes (pitch < 25 deg)', r.maxPitch < 25 * Math.PI / 180, (r.maxPitch * 57.3).toFixed(0) + ' deg');
  check('huey AI: collective down once landed', H.c.coll < 0.1, H.c.coll.toFixed(2));
}
{   // 2. over the sea onto a carrier deck steaming at 7 m/s (the aft helicopter spot)
  const ship = { x: 200, z: 0, yaw: Math.PI / 2, v: 7, DECK: 18 };   // bow along -x... yaw: forward = (-sin, -cos) -> (-1, 0)
  const fw = () => [-Math.sin(ship.yaw), -Math.cos(ship.yaw)];
  const local = (x, z) => { const dx = x - ship.x, dz = z - ship.z, c = Math.cos(ship.yaw), s = Math.sin(ship.yaw); return [dx * c - dz * s, dx * s + dz * c]; };
  const onDeck = (x, z) => { const [lx, lz] = local(x, z); return Math.abs(lx) < 18 && Math.abs(lz) < 130; };
  const ground = (x, z) => onDeck(x, z) ? ship.DECK : 0;
  const env = {
    groundY: (x, z) => onDeck(x, z) ? ship.DECK : -20, water: (x, z) => !onDeck(x, z), ground,
    surfVel: (x, z) => onDeck(x, z) ? { vx: fw()[0] * ship.v, vy: 0, vz: fw()[1] * ship.v, w: 0, cx: ship.x, cz: ship.z } : null,
    tick: dt => { const [fx, fz] = fw(); ship.x += fx * ship.v * dt; ship.z += fz * ship.v * dt; },
  };
  const spot = () => { const lx = -2, lz = 32, c = Math.cos(ship.yaw), s = Math.sin(ship.yaw), [fx, fz] = fw(); return { x: ship.x + lx * c + lz * s, y: ship.DECK, z: ship.z - lx * s + lz * c, vx: fx * ship.v, vz: fz * ship.v, hdg: -ship.yaw }; };
  const H = huey(V(-150, 45, 120), V(15, 0, 0), -Math.PI / 2), AI = createHeliAI();
  AI.engage(H, spot);
  const r = run(H, AI, env, 150), s = spot(), d = Math.hypot(H.pos.x - s.x, H.pos.z - s.z);
  check('huey AI: lands on a deck under way (7 m/s)', !r.dead && r.landed && r.phase === 'landed' && onDeck(H.pos.x, H.pos.z), `${r.dead || r.phase} in ${r.t.toFixed(0)} s, ${r.ev || 'clean'}`);
  check('huey AI: on the aft spot (within 6 m)', d < 6, d.toFixed(1) + ' m', '< 6 m');
  check('huey AI: deck touchdown sink < 1.5 m/s', r.td && r.td.vy > -1.5, r.td ? r.td.vy.toFixed(2) + ' m/s' : 'none');
  check('huey AI: rides the deck after (no slide off)', Math.hypot(H.vel.x - fw()[0] * ship.v, H.vel.z - fw()[1] * ship.v) < 0.5, Math.hypot(H.vel.x - fw()[0] * ship.v, H.vel.z - fw()[1] * ship.v).toFixed(2) + ' m/s rel');
}
{   // 3. handed over in a fast, low, descending run (45 m/s, 25 m, sinking 4 m/s) over flat ground
  const ground = () => 0, env = { groundY: ground, water: false, ground };
  const H = huey(V(0, 25, 0), V(0, -4, -45), 0, 0.3), AI = createHeliAI();
  AI.engage(H, () => ({ x: 0, y: 0, z: -900, vx: 0, vz: 0, hdg: null }));
  let minY = 1e9; const r = run(H, { ...AI, step: (H, dt, e) => { if (AI.phase === 'transit') minY = Math.min(minY, H.pos.y); return AI.step(H, dt, e); }, get phase() { return AI.phase; } }, env, 150);
  check('huey AI: recovers a fast low descent', !r.dead && minY > 8, `lowest ${minY.toFixed(1)} m${r.dead ? ' ' + r.dead : ''}`, '> 8 m');
  check('huey AI: and lands at the spot', r.landed && AI.phase === 'landed' && Math.hypot(H.pos.x, H.pos.z + 900) < 4, `${AI.phase} ${Math.hypot(H.pos.x, H.pos.z + 900).toFixed(1)} m`);
}
{   // 4. left on the ground: it stays down (no lift-off)
  const ground = () => 0, env = { groundY: ground, water: false, ground };
  const H = FM.createHueySim(9.81); H.reset(V(0, 1.9, 0), 0, true, 1); const AI = createHeliAI(); AI.engage(H, () => ({ x: 50, y: 0, z: 0 }));
  run(H, AI, env, 5);
  check('huey AI: a landed Huey stays landed', H.landed && H.pos.y < 3, `y ${H.pos.y.toFixed(2)}`);
}
// ------------------------------------------------------------------ the jets' wingman (pilot.js on the player's airframes)
{
  const { createJetSim } = await import('../game/js/jetfm.js');
  const { createTomcatSim } = await import('../game/js/units/air/tomcatfm.js');
  const { createWingman } = await import('../game/js/units/commander/wingman.js');
  // the ALBATROSS as airbench.mjs has it: 120 x 28 m deck 8 m up, island to starboard, sailing
  function carrierWorld(c) {
    const loc = (x, z) => { const dx = x - c.x, dz = z - c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw); return [dx * co - dz * si, dx * si + dz * co]; };
    const deckAt = (x, z) => { const [lx, lz] = loc(x, z); let hw = 14 * 0.97, h = -1e9; if (lz < -44) hw *= Math.max(0, (lz + 66) / 22); if (Math.abs(lx) < hw && lz > -66 && lz < 60) h = 8; if (Math.abs(lx - 10.5) < 2.9 && Math.abs(lz - 6) < 9) h = 25; return h; };
    return {
      c, terrain: () => 0, groundY: (x, z) => Math.max(0, deckAt(x, z)), water: (x, z) => deckAt(x, z) < 0,
      surfVel: (x, z) => deckAt(x, z) > 0 ? { vx: -Math.sin(c.yaw) * c.speed, vz: -Math.cos(c.yaw) * c.speed, w: 0, cx: c.x, cz: c.z } : null,
      carrier: () => ({ x: c.x, z: c.z, yaw: c.yaw, deck: 8, vx: -Math.sin(c.yaw) * c.speed, vz: -Math.cos(c.yaw) * c.speed, speed: c.speed, w: 0 }),
      anchor: () => ({ x: c.x, y: 8, z: c.z }), foes: function* () {}, missiles: function* () {}, inFlight: () => 0, fire: () => {},
      tick(dt) { c.x += -Math.sin(c.yaw) * c.speed * dt; c.z += -Math.cos(c.yaw) * c.speed * dt; },
    };
  }
  for (const [kind, make] of [['HORNET', () => createJetSim(9)], ['TOMCAT', () => createTomcatSim(9)]]) {
    const W = carrierWorld({ x: 0, z: 0, yaw: 0.4, speed: 5 });
    const A = make(); A.reset(600, 0, -500, 1.2, { running: true, airborne: true, alt: 260, speed: 80 }); for (const e of A.eng) e.n = 0.85; A.gearCmd = 0; A.flapSel = 0;
    const P = createWingman(A, kind, kind);
    const st0 = P.state; let t = 0, recalled = false, minY = 1e9, seenCap = false;
    for (; t < 700; t += DT) {
      if (P.state === 'cap') seenCap = true;
      if (!recalled && t > 40) { P.recall(); recalled = true; }
      P.update(DT, W); W.tick(DT);
      if (P.state !== 'final' && P.state !== 'trapped' && !A.onGround) minY = Math.min(minY, A.pos.y);
      if (A.dead || P.recovered) break;
    }
    check(`wingman ${kind}: takes over in the air on CAP`, st0 === 'cap' && seenCap, `${st0}`);
    check(`wingman ${kind}: recalled, flies the pattern and traps`, P.recovered && !A.dead, P.recovered ? `${P.trapped.wire} wire at ${t.toFixed(0)} s, ${P.waveoffs} wave-offs` : `${A.dead || P.state} ${P.why}`);
    check(`wingman ${kind}: never below 60 m outside the approach`, minY > 60, minY.toFixed(0) + ' m');
  }
  {   // just off the cat, gear down, low: climbs out first
    const W = carrierWorld({ x: 0, z: 0, yaw: 0, speed: 5 });
    const A = createJetSim(9); A.reset(0, 0, -200, 0, { running: true, airborne: true, alt: 40, speed: 75 }); A.gearCmd = 1; A.flapSel = 1; for (const e of A.eng) e.n = 0.9;
    const P = createWingman(A, 'HORNET', 'HORNET'); const st0 = P.state; let minY = 1e9;
    for (let t = 0; t < 60; t += DT) { P.update(DT, W); W.tick(DT); minY = Math.min(minY, A.pos.y); if (A.dead) break; }
    check('wingman HORNET: low and dirty off the bow -> climbs, cleans up', st0 === 'climb' && !A.dead && A.gearCmd === 0 && A.pos.y > 150, `${st0} -> ${P.state}, y ${A.pos.y.toFixed(0)}, gear ${A.gearCmd}, min ${minY.toFixed(0)} m`);
  }
}
// ------------------------------------------------------------------ more than one Huey: swapping whole states (swapstate.js)
// main.js keeps one set of Huey objects (the sim, the AI crew) and swaps the state of every other Huey out through them
// each frame. A Huey that is swapped in, stepped and swapped out every frame must fly exactly as one that never was.
{
  const { swapState } = await import('../game/js/units/commander/swapstate.js');
  const pad = { x: 120, y: 0, z: -160 }, ground = () => 0, env = { groundY: ground, water: false, ground };
  const mk = () => { const H = huey(V(0, 40, 0), V(4, 0, -18), 0.3), AI = createHeliAI(); AI.engage(H, () => ({ x: pad.x, y: pad.y, z: pad.z, vx: 0, vz: 0, hdg: null })); return { H, AI }; };
  const ref = mk();   // never swapped
  const main = mk(), other = mk();   // "main": the game's one set; "slot": a Huey parked on the ground, swapped through main every step
  other.H.reset(V(-300, 1.9, 40), 1, true, 1); other.AI.off();
  const swapAll = () => { swapState(main.H, other.H); swapState(main.AI, other.AI); const t = main.AI.target; main.AI.target = other.AI.target; other.AI.target = t; };
  const step = (S, ctlBase = { throttle: 1, gov: 'AUTO', fuel: true }) => { const c = S.AI.step(S.H, DT, { ground }) || { cx: 0, cy: 0, pedal: 0, coll: 0 }; S.H.step(DT, { ...ctlBase, ...c }, env); };
  let maxD = 0, slotY0 = other.H.pos.y;
  for (let t = 0; t < 40; t += DT) {
    step(ref);
    swapAll(); step(main); swapAll();   // the slot (parked) runs through the main objects...
    step(main);                          // ...then the main Huey flies on in them
    maxD = Math.max(maxD, ref.H.pos.distanceTo(main.H.pos));
  }
  check('huey swap: a Huey stepped through swapped-in objects flies identically', maxD < 1e-6, maxD.toExponential(1) + ' m', '< 1e-6');
  check('huey swap: the AI phase / target went with her', main.AI.phase === ref.AI.phase && Math.abs(main.AI.err - ref.AI.err) < 1e-6, `${main.AI.phase} / ${ref.AI.phase}`);
  check('huey swap: the parked one stayed parked (its own skid state)', other.H.landed && Math.abs(other.H.pos.y - slotY0) < 0.1 && other.H.pos.distanceTo(V(-300, other.H.pos.y, 40)) < 0.05, `y ${other.H.pos.y.toFixed(2)}, drift ${other.H.pos.distanceTo(V(-300, other.H.pos.y, 40)).toFixed(3)} m`);
  const keep = main.H.pos; swapAll(); check('huey swap: references stay valid (contents swapped, not objects)', main.H.pos === keep && main.H.pos.distanceTo(V(-300, main.H.pos.y, 40)) < 0.05, 'H.pos is the same Vector3');
}
console.log(`\n${n - fails}/${n} pass`);
process.exit(fails ? 1 : 0);
