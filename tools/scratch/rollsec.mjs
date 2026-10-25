// J-turn / fishhook: steady speed, steering-wheel input profile steer(t), throttle off after the input; records max roll,
// two-wheel lift, rollover, spin-out. The vehicle is pre-spun to speed in a suitable gear.
function manoeuvre(spec, v0, steerFn, surf = SURF.tarmac, load, T = 4) {
  const v = make(spec, { env: flat(surf), load }); settle(v, 0.5);
  const S = v.S, r0 = S.wheels[0].r;
  const gear = Math.min(spec.gearbox.ratios.length, v0 > 60 ? 4 : 3);
  S.vel[2] = -v0 / 3.6; for (const W of S.wheels) S.solver.w[4 + W.i] = v0 / 3.6 / W.r;
  const ar = spec.axles.find(a => a.driven === 'R'); S.solver.w[2] = ar.final * v0 / 3.6 / r0; S.solver.w[1] = S.solver.w[2] * spec.transfer.high;
  const af = spec.axles.find(a => a.driven === 'F'); if (af) S.solver.w[3] = af.final * v0 / 3.6 / r0;
  S.solver.w[0] = S.solver.w[1] * spec.gearbox.ratios[gear - 1]; S.gear = gear;
  let maxRoll = 0, lift = 0, rolled = false, spun = false, h0 = S.heading, maxLat = 0;
  run(v, T, (S, tt) => ({ raw: { throttle: tt < 0.2 ? 0.3 : 0, brake: 0, clutch: 0, gear, steer: steerFn(tt), ignition: true } }), S => {
    maxRoll = Math.max(maxRoll, Math.abs(S.roll)); maxLat = Math.max(maxLat, Math.abs(S.latG));
    if (S.wheels.filter(W => W.spec.x > 0).every(W => !W.contact) || S.wheels.filter(W => W.spec.x < 0).every(W => !W.contact)) lift = 1;
    if (S.up[1] < 0.2) rolled = true;
    // spun: the body turned well past the path (velocity direction vs. heading > 60 deg)
    const sp = Math.hypot(S.vel[0], S.vel[2]); if (sp > 3 && Math.abs(S.speed) / sp < 0.5) spun = true;
  });
  void h0; return { maxRoll, lift, rolled, spun, maxLat, S };
}
const jturnSteer = lock => t => Math.min(1, t / 0.3) * lock;                         // step to lock in 0.3 s
const fishSteer = lock => t => t < 0.35 ? t / 0.35 * lock : t < 0.85 ? lock - (t - 0.35) / 0.25 * lock : -lock;   // NHTSA-style fishhook
const sweep = (spec, fn, surf, from, to, step = 5) => { for (let v0 = from; v0 <= to; v0 += step) { const r = manoeuvre(spec, v0, fn, surf); if (V) console.log(`      ${spec.id} ${v0} km/h on ${surf}: roll ${fmt(r.maxRoll / D2R)}° lat ${fmt(r.maxLat, 2)} g lift ${r.lift} rolled ${r.rolled} spun ${r.spun}`); if (r.rolled) return { v: v0, r }; } return { v: 0 }; };
// steady-state roll gradient: constant-radius circle, rising speed
function rollGradient(spec) {
  const v = make(spec); settle(v, 0.5); let pts = [];
  run(v, 30, (S, t) => ({ throttle: S.kmh < 10 + t * 1.2 ? 0.5 : 0.2, steer: 0.25, steerAbs: true }), S => { if (S.odometer > 20 && Math.abs(S.latG) > 0.15 && Math.abs(S.latG) < 0.5) pts.push(Math.abs(S.roll) / D2R / Math.abs(S.latG)); });
  return pts.length ? pts.reduce((a, b) => a + b) / pts.length : 0;
}
if (want('m151')) {
  const rg = rollGradient(M151);
  check('m151: roll gradient (steady circle)', rg > 3 && rg < 8, `${fmt(rg, 1)}°/g`, 'soft-sprung utility 4x4: ~4-7°/g', 'INFERRED');
  // dry tarmac: bias-ply mu ~0.85 < SSF 1.12: the jeep slides or spins before it tips on a flat road
  const js = []; for (const v0 of [40, 60, 80]) js.push([v0, manoeuvre(M151, v0, jturnSteer(1))]);
  const anyRoll = js.some(([, r]) => r.rolled);
  check('m151: J-turn on dry tarmac: slides / spins, peak lateral g near the tyre limit', !anyRoll && js.every(([, r]) => r.maxLat > 0.6), js.map(([v0, r]) => `${v0}: ${fmt(r.maxLat, 2)} g ${fmt(r.maxRoll / D2R)}°${r.lift ? ' LIFT' : ''}${r.spun ? ' spun' : ''}`).join(', '), 'untripped rollover needs a_y > ~SSF; tyre mu 0.85 < 1.12', 'CONFIRMED (physics) / INFERRED (mu)');
  const fh = sweep(M151, fishSteer(1), SURF.tarmac, 50, 100, 10);
  console.log(`      m151 fishhook on tarmac: ${fh.v ? 'rolls at ' + fh.v + ' km/h' : 'no rollover to 100 km/h'}`);
  // tripped: the same J-turn on grass / dirt: the sliding tyres dig in and trip the jeep (the M151's real killer)
  const g151 = sweep(M151, jturnSteer(1), SURF.grass, 30, 90), d151 = sweep(M151, jturnSteer(1), SURF.dirt, 30, 100);
  const gLada = sweep(LADA, jturnSteer(1), SURF.grass, 30, 110), gLR = sweep(LANDROVER, jturnSteer(1), SURF.grass, 30, 100), gVW = sweep(BEETLE, jturnSteer(1), SURF.grass, 30, 110);
  check('m151: tripped rollover, J-turn sliding on grass', g151.v > 0 && g151.v <= 65, `rolls at ${g151.v || '>90'} km/h on grass, ${d151.v || '>100'} km/h on a dirt road`, 'M151 rollovers: mostly sliding off the road at moderate speed (Army safety studies, 1970s)', 'UNVERIFIED');
  check('m151 rolls sooner than the low, wide saloon (Lada)', g151.v > 0 && (gLada.v === 0 || gLada.v > g151.v), `grass: M151 ${g151.v || '>90'}, Land Rover ${gLR.v || '>100'}, Beetle ${gVW.v || '>110'}, Lada ${gLada.v || '>110'} km/h`, 'ordering by SSF and suspension: high CG / narrow track tip first', 'INFERRED');
}

// lift-off oversteer: a steady circle near the limit on part throttle, then lift: with the semi-trailing-arm rear the tail
// steps out (yaw rate rises at constant steering)
if (want('m151')) {
  const v = make(M151); settle(v, 0.5);
  run(v, 16, (S, t) => ({ throttle: S.kmh < 42 ? 0.7 : 0.45, steer: t > 3 ? 0.3 : 0, steerAbs: true }));
  const r1 = Math.abs(v.S.yawRate), v1 = v.S.speed, g1 = v.S.latG;
  let rMax = 0; run(v, 1.5, { throttle: 0, steer: 0.3, steerAbs: true }, S => { rMax = Math.max(rMax, Math.abs(S.yawRate)); });
  check('m151: lift-off near the limit tightens the line (tuck-in)', rMax > r1 * 1.05, `yaw ${fmt(r1 / D2R)}°/s at ${kmh(v1)} (${fmt(Math.abs(g1), 2)} g) -> peak ${fmt(rMax / D2R)}°/s after lifting`, 'semi-trailing-arm lift-off oversteer (Army / TACOM M151 handling reports)', 'INFERRED');
}

// ------------------------------------------------------------------------------------------------ 6. turning circle
head('turning circle (full lock, walking pace; outer front tyre path, kerb to kerb)');
for (const spec of [M151, M35, LANDROVER]) {
  if (!want(spec.id)) continue;
  const v = make(spec); settle(v, 0.3);
  const fl = spec.wheels.find(w => w.id === 'FL'), p = [fl.x - 0.1, 0, fl.z], q = [0, 0, 0];   // outer (left) tyre in a right turn
  let xmin = 1e9, xmax = -1e9;
  run(v, 60, (S) => ({ throttle: S.kmh < 5 ? 0.35 : 0, brake: S.kmh > 7 ? 0.3 : 0, steer: 1, steerAbs: true }), S => { if (S.odometer > 3) { S.worldPoint(p, q); xmin = Math.min(xmin, q[0]); xmax = Math.max(xmax, q[0]); } });
  const d = xmax - xmin, pub = spec.published.turnCircle;
  check(`${spec.id}: turning circle`, Math.abs(d - pub) / pub < 0.12, `${fmt(d)} m`, `${fmt(pub)} m`, spec.id === 'm151' ? 'UNVERIFIED (AMG 35 ft 9 in)' : spec.id === 'm35' ? 'CONFIRMED ~ (TM35 ~72 ft)' : 'CONFIRMED ~ (LR 47 ft)');
}

