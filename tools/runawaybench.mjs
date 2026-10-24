#!/usr/bin/env node
// runawaybench.mjs - node checks for the RUNAWAY ground forces (no browser):
//   A. RW-1 STRIDER locomotion: speeds, 20° slopes (walk + run, 8 headings), island roaming, IK limits, push recovery,
//      hit stumbles, falls and get-ups, damage states, the uncanny traits (level glide, stabilised head), determinism
//   B. RW-7 hover tank: hover gap / lift = weight, heave damping, top speed, slopes, drift, weight shift, recoil, fan loss,
//      terrain following on the sandbox island
//   C. Seized MBTs: dimensions vs published, speed, grade
//   D. Squad AI in the sandbox: cover use, flanking (right), retreat when outnumbered, suppression, target priority,
//      link-node loss, volley sync, combined-arms stand-off, defend radius, and the cost of a fight
// Numbers for the fictional RUNAWAY machines are DESIGN targets (see the sim headers); the MBT dimensions are their
// commonly published figures. Weapons are game-tuned throughout.        node tools/runawaybench.mjs [--v] [--only A|B|C|D]
import { createStrider, flatEnv, slopeEnv, STRIDER } from '../game/js/units/runaway/strider.js';
import { createHoverTank, RW7 } from '../game/js/units/runaway/hovertank.js';
import { createMBT, MBT } from '../game/js/units/runaway/mbt.js';
import { sandboxIsland, makeWorldQuery, rng } from '../game/js/units/runaway/rwworld.js';
import { createSandbox, setupScenario } from '../game/js/units/runaway/sandbox.js';
import { hitFromAmmo } from '../game/js/units/runaway/hit.js';

const V = process.argv.includes('--v'), ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
let pass = 0, fail = 0; const fails = [];
const check = (name, ok, got, want) => { (ok ? pass++ : fail++); if (!ok) fails.push(name); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} ${got}${want ? '   (want ' + want + ')' : ''}`); };
const deg = r => r * 180 / Math.PI, DT = 1 / 60;
const sec = (s) => (!ONLY || ONLY === s);

// ------------------------------------------------------------------------------------------------ A. STRIDER
function walkRun(env, cmd, secs, place = [0, 0, 0], each) {
  const S = createStrider(); S.place(place[0], place[1], place[2], env);
  let falls = 0, c0 = null, t0 = 0, steps = 0;
  for (let t = 0; t < secs; t += DT) {
    const ev = S.step(DT, typeof cmd === 'function' ? cmd(t, S) : cmd, env);
    for (const e of ev) { if (e.e === 'fall') falls++; if (e.e === 'step') steps++; }
    if (!c0 && t >= 3) { c0 = [S.c[0], S.c[2]]; t0 = t; }
    if (each) each(S, t);
  }
  const sp = c0 ? Math.hypot(S.c[0] - c0[0], S.c[2] - c0[1]) / (secs - t0) : 0;
  return { S, falls, sp, steps };
}
if (sec('A')) {
  console.log('--- A. RW-1 STRIDER locomotion ---');
  { const r = walkRun(flatEnv(), { vx: 0, vz: -STRIDER.WALK }, 12); check('walk on the flat: speed', Math.abs(r.sp - STRIDER.WALK) < 0.16 && !r.falls, `${r.sp.toFixed(2)} m/s, ${(r.steps / 12 * 60).toFixed(0)} steps/min`, `${STRIDER.WALK} ±0.16`); }
  { const r = walkRun(flatEnv(), { vx: 0, vz: -STRIDER.RUN, run: true }, 12); check('run on the flat: speed', Math.abs(r.sp - STRIDER.RUN) < 0.46 && !r.falls, `${r.sp.toFixed(2)} m/s, ${(r.steps / 12 * 60).toFixed(0)} steps/min`, `${STRIDER.RUN} ±10%`); }
  // 20° slopes, 8 headings relative to the fall line, walking and running, 60 s each
  for (const run of [false, true]) {
    let falls = 0, worst = 99, stretch = 0, clear = 9;
    for (let k = 0; k < 8; k++) {
      const env = slopeEnv(20, 0), h = k * Math.PI / 4, sp = run ? STRIDER.RUN : STRIDER.WALK;
      const r = walkRun(env, { vx: -Math.sin(h) * sp, vz: -Math.cos(h) * sp, run }, 60);
      falls += r.falls; worst = Math.min(worst, r.sp); stretch = Math.max(stretch, r.S.stats.maxStretch); clear = Math.min(clear, r.S.stats.minFootClear);
    }
    check(`20° slope, ${run ? 'running' : 'walking'}, 8 headings x 60 s: no falls`, falls === 0, `${falls} falls, slowest heading ${worst.toFixed(2)} m/s, max leg stretch ${stretch.toFixed(3)}, min swing clearance ${clear.toFixed(3)} m`);
    if (!run) check('20° slope: legs stay within reach, feet clear the ground', stretch <= 1.0 && clear > 0.03, `stretch ${stretch.toFixed(3)} clearance ${clear.toFixed(3)}`, '<= 1, > 0.03 m');
  }
  { let falls = 0; for (let k = 0; k < 4; k++) { const h = k * Math.PI / 2; falls += walkRun(slopeEnv(26, 0), { vx: -Math.sin(h) * 1.6, vz: -Math.cos(h) * 1.6 }, 40).falls; } check('26° slope (beyond spec), walking 4 headings: no falls', falls === 0, `${falls} falls`); }
  // the sandbox island, roaming between random points
  {
    const I = sandboxIsland(), W = makeWorldQuery(I), env = { height: I.height, normal: (x, z) => W.normal(x, z) }, R = rng(3);
    let falls = 0, dist = 0, maxSl = 0;
    for (let k = 0; k < 8; k++) {
      const S = createStrider(); let x = -60 + R() * 120, z = -60 + R() * 120; while (W.isWater(x, z)) { x *= 0.5; z *= 0.5; }
      S.place(x, z, R() * 6, env); let goal = null, last = [x, z]; const run = k % 2 === 1;
      for (let t = 0; t < 90; t += 1 / 30) {
        if (!goal || Math.hypot(goal[0] - S.c[0], goal[1] - S.c[2]) < 3) do { goal = [-150 + R() * 300, -150 + R() * 300]; } while (W.isWater(goal[0], goal[1]));
        const [ux, uz] = W.steer(S.c[0], S.c[2], goal[0] - S.c[0], goal[1] - S.c[2], 0.6, 5), sp = run ? 4.2 : 1.6;
        for (const e of S.step(1 / 30, { vx: ux * sp, vz: uz * sp, run }, env)) if (e.e === 'fall') falls++;
        dist += Math.hypot(S.c[0] - last[0], S.c[2] - last[1]); last = [S.c[0], S.c[2]];
        maxSl = Math.max(maxSl, deg(Math.acos(W.normal(S.c[0], S.c[2])[1])));
      }
    }
    check('sandbox island: 8 machines roam 90 s (4 walking, 4 running)', falls === 0, `${falls} falls over ${(dist / 1000).toFixed(2)} km, steepest ground ${maxSl.toFixed(0)}°`);
  }
  // uncanny traits: a level glide (no bob) and a gyro-stabilised head
  {
    let ymin = 9, ymax = -9, hmin = 9, hmax = -9;
    walkRun(flatEnv(), { vx: 0, vz: -1.6, aimYaw: 0 }, 10, [0, 0, 0], (S, t) => { if (t > 4) { ymin = Math.min(ymin, S.c[1]); ymax = Math.max(ymax, S.c[1]); hmin = Math.min(hmin, S.headYaw); hmax = Math.max(hmax, S.headYaw); } });
    check('uncanny: the body glides level while walking (no bob)', ymax - ymin < 0.02, `CoM bob ${((ymax - ymin) * 100).toFixed(1)} cm`, '< 2 cm (a human bobs ~5 cm)');
    check('uncanny: the sensor head holds still in space', deg(hmax - hmin) < 1, `head yaw wander ${deg(hmax - hmin).toFixed(2)}°`, '< 1°');
  }
  // push recovery (impulse at the CoM while standing)
  {
    const push = (J, dirDeg, walking = false) => { const S = createStrider(), env = flatEnv(); S.place(0, 0, 0, env); let fell = false, upAgain = null, tf = null;
      for (let t = 0; t < 9; t += DT) { if (Math.abs(t - 2) < DT / 2) { const a = dirDeg * Math.PI / 180; S.push(Math.sin(a) * J, 0, -Math.cos(a) * J); } for (const e of S.step(DT, walking ? { vx: 0, vz: -1.6 } : {}, env)) { if (e.e === 'fall') { fell = true; tf = t; } if (e.e === 'up' && upAgain === null) upAgain = t - tf; } }
      return { fell, upAgain, mode: S.mode }; };
    const fb = [0, 180].map(d => push(400, d)), sd = [90, 270].map(d => push(240, d));
    check('push recovery: 400 N s (2.7 m/s) fore / aft, standing', fb.every(r => !r.fell), fb.map(r => r.fell ? 'FELL' : 'stepped').join(', '), 'recovers by stepping');
    check('push recovery: 240 N s (1.6 m/s) sideways, standing', sd.every(r => !r.fell), sd.map(r => r.fell ? 'FELL' : 'stepped').join(', '), 'recovers (cross-step limited)');
    const w = [0, 90, 180, 270].map(d => push(300, d, true));
    check('push recovery: 300 N s any direction while walking', w.every(r => !r.fell), w.map(r => r.fell ? 'FELL' : 'ok').join(', '));
    const big = push(900, 90);
    check('a 900 N s side blow knocks it down, it gets back up', big.fell && big.upAgain !== null && big.upAgain < 4.5 && big.mode === 'stand', `fell ${big.fell}, up after ${big.upAgain?.toFixed(2)} s, ends ${big.mode}`, 'up < 4.5 s');
  }
  // hits through the hit-info contract
  {
    const env = flatEnv(), mk = () => { const S = createStrider(); S.place(0, 0, 0, env); return S; };
    // a 30-round rifle burst into the thorax while walking
    { const S = mk(); let fell = false; for (let t = 0; t < 8; t += DT) { if (t > 3 && t < 6 && Math.round(t * 60) % 6 === 0) S.hit(hitFromAmmo('rifle', { dir: [1, 0, 0], part: 'thorax', side: 1 })); for (const e of S.step(DT, { vx: 0, vz: -1.6 }, env)) if (e.e === 'fall') fell = true; }
      check('30 rifle rounds into the thorax while walking: no fall', !fell && S.alive, `fell ${fell}, thorax ${S.hp.thorax.toFixed(1)}/${STRIDER.HP.thorax}`, 'rifles do not stop it'); }
    // a machine-gun burst into a stance leg while running: it stumbles
    { const S = mk(); let maxStum = 0, fell = false; for (let t = 0; t < 7; t += DT) { if (t > 3 && t < 3.5 && Math.round(t * 60) % 4 === 0) S.hit(hitFromAmmo('mg', { dir: [1, 0, 0], part: S.stance === 0 ? 'legL' : 'legR', side: 1 })); for (const e of S.step(DT, { vx: 0, vz: -4.2, run: true }, env)) if (e.e === 'fall') fell = true; if (t > 3) maxStum = Math.max(maxStum, S.stumble); }
      check('MG burst into the stance leg while running: it stumbles', maxStum > 0.5, `stumble peak ${maxStum.toFixed(2)}, ${fell ? 'went down' : 'kept its feet'}, leg hp ${Math.min(S.hp.legL, S.hp.legR).toFixed(0)}`); }
    // rifle to the head: blinded; launcher: destroyed / down; leg destroyed: disabled, still armed
    { const S = mk(); for (let i = 0; i < 12; i++) S.hit(hitFromAmmo('rifle', { dir: [0, 0, 1], part: 'head', side: 1 })); check('rifle hits to the sensor head blind it', S.blind && S.alive, `blind ${S.blind}, head ${S.hp.head.toFixed(1)}`); }
    { const S = mk(); S.hit(hitFromAmmo('law', { dir: [0, 0, 1], part: 'thorax', side: 1 })); let m = S.mode; for (let t = 0; t < 3; t += DT) S.step(DT, {}, env); check('a rocket in the chest destroys it (falls, lies still)', !S.alive && S.mode === 'dead', `alive ${S.alive}, mode ${S.mode}`); }
    { const S = mk(); for (let i = 0; i < 6; i++) S.hit(hitFromAmmo('hmg', { dir: [1, 0, 0], part: 'legR', side: 1 })); for (let t = 0; t < 6; t += DT) S.step(DT, {}, env); check('leg shot off: down for good, still armed (shoots prone)', S.mode === 'disabled' && S.alive && S.armed, `mode ${S.mode}, legR ${S.hp.legR.toFixed(0)}, armed ${S.armed}`); }
  }
  // determinism
  { const a = walkRun(slopeEnv(15, 0.5), t => ({ vx: Math.sin(t) * 2, vz: -2, run: true }), 15).S, b = walkRun(slopeEnv(15, 0.5), t => ({ vx: Math.sin(t) * 2, vz: -2, run: true }), 15).S; check('deterministic (same inputs, same machine)', a.c.every((v, i) => v === b.c[i]), `dx ${Math.abs(a.c[0] - b.c[0])}`); }
}

// ------------------------------------------------------------------------------------------------ B. RW-7
function hover(env, cmd, secs, place = [0, 0, 0], each) {
  const T = createHoverTank(); T.place(place[0], place[1], place[2], env);
  for (let t = 0; t < secs; t += DT) { T.step(DT, typeof cmd === 'function' ? cmd(t, T) : cmd, env); if (each) each(T, t); }
  return T;
}
if (sec('B')) {
  console.log('--- B. RW-7 hover tank ---');
  { const T = hover(flatEnv(), { vx: 0, vz: 0 }, 8); const lift = T.press.reduce((s, p) => s + p * RW7.CELL_A, 0) / (RW7.MASS * RW7.G);
    check('hover: hem clearance and cushion lift = weight', Math.abs(T.gap[0] - RW7.GAP_T) < 0.05 && Math.abs(lift - 1) < 0.02, `gap ${T.gap.map(g => g.toFixed(2)).join('/')} m, lift/weight ${lift.toFixed(3)}, cushion ${(T.press[0] / 1000).toFixed(2)} kPa, fans ${(T.fan[0] * 100).toFixed(0)}%`, `${RW7.GAP_T} m, 1.00`); }
  { let ymin = 9, settle = null; const y0 = RW7.GAP_T - RW7.SKIRT_Y; const T = hover(flatEnv(), { vx: 0, vz: 0 }, 6, [0, 0, 0], (T, t) => { if (t < 0.02) { T.p[1] = y0 + 0.3; T.v[1] = 0; } if (t > 0.1) { ymin = Math.min(ymin, T.p[1]); if (settle === null && Math.abs(T.p[1] - y0) < 0.03 && Math.abs(T.v[1]) < 0.05 && t > 0.5) settle = t; } });
    check('heave: dropped 0.3 m onto its cushion, damped (no skirt strike)', y0 - ymin < 0.3 && T.stats.minGap > 0.02 && settle !== null && settle < 3, `undershoot ${(y0 - ymin).toFixed(2)} m, lowest hem ${T.stats.minGap.toFixed(2)} m, settled in ${settle?.toFixed(1)} s`); }
  { const T = hover(flatEnv(), { vx: 0, vz: -30 }, 30); check('top speed (governed)', Math.abs(T.speed - RW7.TOP) < 1.5, `${T.speed.toFixed(1)} m/s (${(T.speed * 3.6).toFixed(0)} km/h)`, `${RW7.TOP} m/s`); }
  { const T = hover(slopeEnv(20, 0), { vx: 0, vz: -8 }, 15); check('climbs a 20° grade', T.speed > 3 && T.tilt() < 0.4 && T.stats.minGap > -0.05, `${T.speed.toFixed(1)} m/s up the slope, hull tilt ${deg(T.tilt()).toFixed(1)}°, min gap ${T.stats.minGap.toFixed(2)}`); }
  { let x0; const T = hover(slopeEnv(20, Math.PI / 2), { vx: 0, vz: 0 }, 20, [0, 0, 0], (T, t) => { if (Math.abs(t - 10) < DT / 2) x0 = [T.p[0], T.p[2]]; }); const d = Math.hypot(T.p[0] - x0[0], T.p[2] - x0[1]);
    check('holds station across a 20° slope (no slide away)', d < 1.0, `drift ${d.toFixed(2)} m in 10 s`, '< 1 m'); }
  { let maxDrift = 0; hover(flatEnv(), (t) => t < 5 ? { vx: 0, vz: -16 } : { vx: -16, vz: 0 }, 9, [0, 0, 0], T => { maxDrift = Math.max(maxDrift, Math.abs(T.drift)); });
    check('hard 90° turn at 16 m/s: the hull drifts (no grip)', deg(maxDrift) > 20, `peak drift ${deg(maxDrift).toFixed(0)}° between nose and travel`, '> 20°'); }
  { let tilt = 0; const T = hover(flatEnv(), (t) => ({ vx: 0, vz: 0, turret: t > 1 ? Math.PI : 0 }), 14, [0, 0, 0], T => tilt = Math.max(tilt, T.tilt()));
    check('weight shift: turret slewed aft rocks the hull, the trim works it off', deg(tilt) > 0.5 && deg(T.tilt()) < 0.5, `peak tilt ${deg(tilt).toFixed(2)}°, after ${deg(T.tilt()).toFixed(2)}°, turret ${deg(T.turretYaw).toFixed(0)}°`, 'visible, then < 0.5°'); }
  { const T = hover(flatEnv(), { vx: 0, vz: 0 }, 6); T.charge = 1; const v0 = T.v[2]; T.fire(); const dv = T.v[2] - v0;
    check('coilgun recoil kicks the hull back', Math.abs(dv - RW7.RECOIL / RW7.MASS) < 0.02, `${dv.toFixed(3)} m/s`, `${(RW7.RECOIL / RW7.MASS).toFixed(3)} m/s`); }
  { let tilt = 0; const T = hover(flatEnv(), (t, T) => { if (t > 2) T.fanHp[2] = 0; return { vx: 0, vz: t > 5 ? -6 : 0 }; }, 12, [0, 0, 0], T => tilt = Math.max(tilt, T.tilt()));
    check('a dead lift fan: its corner sags, the hull still flies', T.gap[2] < T.gap[1] && T.speed > 3 && deg(tilt) < 20, `gaps ${T.gap.map(g => g.toFixed(2)).join('/')}, ${T.speed.toFixed(1)} m/s, max tilt ${deg(tilt).toFixed(1)}°, skirt load ${(T.stats.scrape / 1000).toFixed(0)} kN`); }
  {
    const I = sandboxIsland(), W = makeWorldQuery(I), env = { height: I.height, normal: (x, z) => W.normal(x, z) }, R = rng(9);
    let minGap = 9, maxTilt = 0, dist = 0, last;
    const T = createHoverTank(); T.place(-40, 60, 0, env); last = [T.p[0], T.p[2]]; let goal = null;
    for (let t = 0; t < 120; t += 1 / 30) {
      if (!goal || Math.hypot(goal[0] - T.p[0], goal[1] - T.p[2]) < 15) do { goal = [-140 + R() * 280, -140 + R() * 280]; } while (W.isWater(goal[0], goal[1]));
      const [ux, uz] = W.steer(T.p[0], T.p[2], goal[0] - T.p[0], goal[1] - T.p[2], 2.5, 12, 0.32);
      T.step(1 / 30, { vx: ux * 12, vz: uz * 12 }, env); minGap = Math.min(minGap, ...T.gap); maxTilt = Math.max(maxTilt, T.tilt());
      dist += Math.hypot(T.p[0] - last[0], T.p[2] - last[1]); last = [T.p[0], T.p[2]];
    }
    check('terrain following over the island at 12 m/s (120 s)', minGap > -0.15 && deg(maxTilt) < 40, `${(dist / 1000).toFixed(2)} km, lowest hem ${minGap.toFixed(2)} m, max tilt ${deg(maxTilt).toFixed(0)}°`);
  }
}

// ------------------------------------------------------------------------------------------------ C. MBTs
if (sec('C')) {
  console.log('--- C. Seized MBTs (published dimensions) ---');
  // published overall figures (commonly quoted): hull length, length gun forward, width, height, mass, road speed
  const PUB = { m1a2: { hullL: 7.93, lenGun: 9.77, W: 3.66, H: 2.44, mass: 66800, vmax: 67 }, t90m: { hullL: 6.86, lenGun: 9.63, W: 3.78, H: 2.22, mass: 48000, vmax: 60 } };
  for (const id of ['m1a2', 't90m']) {
    const P = MBT[id], pub = PUB[id];
    const lenGun = P.hullL / 2 - (P.turretRing[1] + P.gunZ - P.gunL);   // hull rear to the muzzle, gun forward
    check(`${P.name}: hull length / length with gun / width / height`, Math.abs(P.hullL - pub.hullL) < 0.05 && Math.abs(lenGun - pub.lenGun) / pub.lenGun < 0.02 && Math.abs(P.W - pub.W) < 0.05 && Math.abs(P.H - pub.H) < 0.05,
      `${P.hullL} / ${lenGun.toFixed(2)} / ${P.W} / ${P.H} m`, `${pub.hullL} / ${pub.lenGun} / ${pub.W} / ${pub.H}`);
    const T = createMBT(P); const env = flatEnv(); T.place(0, 0, 0, env); for (let t = 0; t < 40; t += DT) T.step(DT, { throttle: 1 }, env);
    check(`${P.name}: road speed (placeholder drive)`, Math.abs(T.speed * 3.6 - pub.vmax) < 3, `${(T.speed * 3.6).toFixed(1)} km/h, ${(P.mass / 1000).toFixed(1)} t, ${(P.power / P.mass).toFixed(1)} W/kg`, `${pub.vmax} km/h`);
    const T2 = createMBT(P), e2 = slopeEnv(20, 0); T2.place(0, 0, 0, e2); for (let t = 0; t < 30; t += DT) T2.step(DT, { throttle: 1 }, e2);
    check(`${P.name}: climbs a 20° grade`, T2.speed > 2, `${(T2.speed * 3.6).toFixed(1)} km/h on 20°`);
  }
}

// ------------------------------------------------------------------------------------------------ D. squad AI
function fight(name, secs, seed = 1980, each) {
  const B = setupScenario(createSandbox({ seed }), name); const t0 = performance.now();
  for (let t = 0; t < secs; t += 1 / 30) { const ev = B.step(1 / 30); if (each) each(B, t, ev); }
  B.wall = performance.now() - t0; return B;
}
if (sec('D')) {
  console.log('--- D. Squad AI (sandbox fights) ---');
  // cover: during contact, striders that are not bounding sit at cover points
  {
    let atCover = 0, samples = 0;
    const B = fight('assault', 150, 1980, (B, t) => {
      if (Math.round(t * 30) % 15) return;
      for (const S of B.ai.squads) if (S.state === 'contact' && S.threat) for (const m of S.members) if (m.alive && m.up && !m.vehicle && m.ai.state === 'cover / suppress' && !m.ai.move) { samples++; const ty = B.world.height(S.threat[0], S.threat[1]) + 1.5; if (B.world.coverPoints(m.x, m.z, 2.5).length || !B.world.los(S.threat[0], ty, S.threat[1], m.x, m.y + 0.8, m.z)) atCover++; }
    });
    check('cover: machines holding in contact are in cover (wall, rock or a fold in the ground)', samples > 20 && atCover / samples > 0.6, `${(100 * atCover / Math.max(1, samples)).toFixed(0)}% of ${samples} samples`, '> 60%');
    const usedStates = new Set(B.ai.log.map(l => l.st));
    check('fire and manoeuvre: contact -> bounds -> flank cycle', usedStates.has('contact') && usedStates.has('flank'), [...usedStates].join(', '));
  }
  // The fights are chaotic (a millimetre early or late changes who sees whom), so the tactical checks run on three
  // seeds and ask for the behaviour in at least two of them; every seed's result is printed.
  const SEEDS = [1980, 7, 42];
  // flanking: always to the squad's right, the flankers get there
  {
    const res = SEEDS.map(seed => {
      let fl = null, reached = false, axis = null;
      fight('flank', 120, seed, (B) => {
        const S = B.ai.squads[0];
        if (S.state === 'flank' && !fl) { fl = { ...S.flank }; axis = { cx: S.cx, cz: S.cz, tx: S.threat[0], tz: S.threat[1] }; }
        if (fl && S.state === 'flank') for (const m of S.members) if (m.ai.flanker && m.alive && Math.hypot(m.x - fl.x, m.z - fl.z) < 15) reached = true;
      });
      // y up, x right, z toward the viewer: facing (fx, fz) the right-hand side is (-fz, fx), so p . right = fx pz - fz px > 0
      let side = 0; if (fl) { const fx = axis.tx - axis.cx, fz = axis.tz - axis.cz, px = fl.x - axis.cx, pz = fl.z - axis.cz; side = fx * pz - fz * px; }
      return { fl: !!fl, right: !!fl && side > 0, reached };
    });
    check('flanking: a stalled fight sends a team round the RIGHT', res.filter(r => r.right).length >= 2 && res.every(r => !r.fl || r.right), res.map(r => r.fl ? (r.right ? 'right' : 'LEFT') : 'none').join(', '), 'right in >= 2/3, never left');
    check('flanking: the flankers reach the flank point', res.filter(r => r.reached).length >= 2, res.map(r => r.reached ? 'reached' : 'no').join(', '));
  }
  // retreat when outnumbered, and move away
  {
    const res = SEEDS.map(seed => {
      let d0 = null, d1 = null, retreated = false;
      fight('outnumbered', 120, seed, (B) => {
        const S = B.ai.squads[0]; const alive = B.dummies.filter(d => d.alive), ex = alive.reduce((s, d) => s + d.x, 0) / alive.length, ez = alive.reduce((s, d) => s + d.z, 0) / alive.length;
        if (S.state === 'retreat' && !retreated) { retreated = true; d0 = Math.hypot(S.cx - ex, S.cz - ez); }
        if (retreated) d1 = Math.max(d1 ?? 0, Math.hypot(S.cx - ex, S.cz - ez));
      });
      return { retreated, d0, d1, ok: retreated && d1 - d0 > 30 };
    });
    check('outnumbered: the squad falls back (bounding withdrawal)', res.filter(r => r.ok).length >= 2, res.map(r => r.retreated ? `${r.d0.toFixed(0)}->${r.d1.toFixed(0)} m` : 'no retreat').join(', '), '>= 30 m back in 2/3');
  }
  // suppression response + target priority + link node + volley sync (one controlled setup)
  {
    const flat = { height: () => 2, water: () => false, obstacles: [], trees: [], spawn: { rw: [[0, 0]], tf: [[0, -80]], pad: [0, 0] } };
    const B = createSandbox({ seed: 5, island: flat });
    const ms = [0, 1, 2, 3].map(i => B.addStrider(-6 + i * 4, -20, 0));
    B.addSquad(ms, { type: 'hold' });
    const at = B.addDummy('at', 4, -95, { crouch: false }), inf = [B.addDummy('inf', -8, -92), B.addDummy('inf', 12, -90)];
    for (const d of [at, ...inf]) { d.wpn = { ...d.wpn, range: 0 }; d.laws = 0; d.hp = 1e6; }   // silent, unkillable targets
    let pr = 0, prN = 0, offFire = 0, onFire = 0;
    for (let t = 0; t < 12; t += 1 / 30) {
      B.step(1 / 30);
      if (t > 6) for (const m of ms) if (m.ai.aimId != null) { prN++; if (m.ai.aimId === at.id) pr++; }
      const S = B.ai.squads[0], ph = ((B.ai.time - S.volley0) % 3.3); for (const m of ms) if (m.ai.fire) { if (ph > 2.4) offFire++; else onFire++; }
    }
    check('target priority: every machine takes the AT gunner first', prN > 20 && pr / prN > 0.95, `${(100 * pr / Math.max(1, prN)).toFixed(0)}% of aims on the AT gunner`);
    check('synchronised volleys: nobody fires in the off window', onFire > 10 && offFire === 0, `${onFire} on-window firing frames, ${offFire} off`);
    const m = ms[2]; for (let i = 0; i < 8; i++) B.ai.nearMiss(m.id, 0.15);
    let sup = false; for (let t = 0; t < 1; t += 1 / 30) { B.step(1 / 30); if (m.ai.state === 'suppressed') sup = true; }
    check('suppression: near misses put a machine into cover', sup, `state ${m.ai.state}, supp ${m.ai.supp.toFixed(2)}`);
    const S = B.ai.squads[0], lead = S.leaderNow; ms.find(q => q.id === lead).sim.kill();
    let froze = false, down = false; for (let t = 0; t < 2; t += 1 / 30) { B.step(1 / 30); if (S.freeze > 0) froze = true; if (S.linkDown > 0) down = true; }
    check('link node destroyed: the squad freezes and loses the link', froze && down && B.ai.log.some(l => l.st === 'LINK LOST'), `freeze ${froze}, link down ${down}, new node ${S.leaderNow}`);
  }
  // ngc/rwground-polish: an aircraft working a squad over - the walkers that aren't shooting back go to cover from IT
  // (hidden from where it is, crouched) and spread out (nobody within 7 m of a squad mate). A helicopter orbits 140 m
  // out at 35 m, firing; the squad starts bunched on the farm plain (2 m apart). Baseline: the same squad, no aircraft.
  {
    const run = (withAir, seed) => {
      const B = createSandbox({ seed });
      const ms = [0, 1, 2, 3].map(i => B.addStrider(-20 + i * 2, 40 + (i % 2) * 2, 0));
      B.addSquad(ms, { type: 'hold' });
      const base = B.targets, air = { id: 'heli', side: 1, kind: 'air', x: 0, y: 0, z: 0, vx: 0, vz: 0, h: 3, alive: true, firing: 0, cover: 0 };
      if (withAir) B.targets = () => [...base(), air];
      let hid = 0, n = 0, spread = 0, sn = 0, air_ = 0;
      for (let t = 0; t < 30; t += 1 / 30) {
        const a = t * 0.12; air.x = -17 + Math.cos(a) * 140; air.z = 41 + Math.sin(a) * 140; air.y = B.world.height(air.x, air.z) + 35; air.vx = -Math.sin(a) * 17; air.vz = Math.cos(a) * 17;
        B.step(1 / 30);
        if (t < 12 || Math.round(t * 30) % 10) continue;
        const live = ms.filter(m => m.alive && m.up);
        for (const m of live) {
          if (/^air/.test(m.ai.state)) air_++;
          if (m.ai.aimId === 'heli' && m.ai.fire) continue;   // (the one shooting back)
          n++; if (!B.world.los(air.x, air.y, air.z, m.x, m.y + 0.75, m.z) || !B.world.los(air.x, air.y, air.z, m.x, m.y + 1.4, m.z)) hid++;
          let nd = 1e9; for (const q of live) if (q !== m) nd = Math.min(nd, Math.hypot(q.x - m.x, q.z - m.z)); spread += nd; sn++;
        }
      }
      return { hid: hid / Math.max(1, n), spread: spread / Math.max(1, sn), air: air_ };
    };
    const A = [1980, 7].map(s => run(true, s)), Z = [1980, 7].map(s => run(false, s));
    const hidA = (A[0].hid + A[1].hid) / 2, hidZ = (Z[0].hid + Z[1].hid) / 2, spA = (A[0].spread + A[1].spread) / 2, spZ = (Z[0].spread + Z[1].spread) / 2;
    check('air attack: walkers take cover from the aircraft', hidA > hidZ + 0.15 && A.every(r => r.air > 0), `hidden from it ${(100 * hidA).toFixed(0)}% (no aircraft: ${(100 * hidZ).toFixed(0)}%)`, '+15 points');
    check('air attack: the squad spreads out', spA > 6 && spA > spZ + 1.5, `nearest squad mate ${spA.toFixed(1)} m (no aircraft: ${spZ.toFixed(1)} m)`, '> 6 m');
  }
  // combined arms: armour keeps away from AT gunners; the fight costs
  {
    let wall = 0, simS = 0, stats = null; const armour = [];
    const res = SEEDS.map(seed => {
      let minAT = 1e9, contact = false; const vshots = {}, vstart = {}, vmoved = {};
      const B = fight('combined', 150, seed, (B, t, ev) => {
        for (const e of ev) if (e.e === 'shot' && e.side === 2) { const m = B.units.find(u => u.id === e.src); if (m && m.vehicle) vshots[m.kind] = (vshots[m.kind] || 0) + 1; }
        for (const m of B.units) if (m.vehicle) { vstart[m.kind] = vstart[m.kind] || [m.x, m.z]; vmoved[m.kind] = Math.max(vmoved[m.kind] || 0, Math.hypot(m.x - vstart[m.kind][0], m.z - vstart[m.kind][1])); }
        if (B.ai.squads.some(S => S.state !== 'advance')) contact = true;
        if (!contact) return;
        // (a gunner counts once it has been known for 8 s - the time to react and back off)
        for (const d of B.dummies) if (d.alive && d.kind === 'at' && B.ai.squads.some(S => S.know.has(d.id))) { d.knownT = d.knownT ?? B.time; if (B.time - d.knownT > 8) for (const m of B.units) if (m.vehicle && m.alive && m.ai.state === 'stand-off (AT)' && B.ai.time - m.ai.stateT0 > 6) minAT = Math.min(minAT, Math.hypot(m.x - d.x, m.z - d.z)); }
      });
      wall += B.wall; simS += 150; stats = B.stats; armour.push({ vshots, vmoved });
      return minAT;
    });
    check('combined arms: the armour manoeuvres (> 40 m, every seed) and gets shots in (2/3 seeds)', armour.every(a => ['hovertank', 'mbt'].every(k => (a.vmoved[k] || 0) > 40)) && armour.filter(a => ['hovertank', 'mbt'].every(k => (a.vshots[k] || 0) > 0)).length >= 2, armour.map(a => ['hovertank', 'mbt'].map(k => `${k} ${(a.vmoved[k] || 0).toFixed(0)} m / ${a.vshots[k] || 0} rds`).join(' ')).join(' | '));
    check('combined arms: standing off, armour keeps out of known AT range', res.filter(d => d > 140).length >= 2 && res.every(d => d > 110), res.map(d => d > 1e8 ? 'n/a' : d.toFixed(0) + ' m').join(', '), '> 140 m in 2/3, never < 110 (game: M1 front 150, RW-7 with PD 180)');
    // (13 agents share this machine: the budget allows for a loaded CPU)
    const ms = wall / simS;
    check('cost: a combined-arms fight (10 machines, 10 dummies)', ms < 40, `${ms.toFixed(1)} ms of CPU per simulated second (${(ms / 30).toFixed(2)} ms per 30 Hz step)`, '< 40 ms/s');
    if (V) console.log('     ', JSON.stringify(stats));
  }
  // defend: stays round the point
  {
    let maxOut = 0;
    const B = fight('defend', 120, 1980, (B) => { const S = B.ai.squads[0], O = S.order; for (const m of S.members) if (m.alive && m.up && !m.vehicle) maxOut = Math.max(maxOut, Math.hypot(m.x - O.x, m.z - O.z)); });
    check('defend: the squad holds round the point', maxOut < B.ai.squads[0].order.r + 20, `furthest machine ${maxOut.toFixed(0)} m from the point (r ${B.ai.squads[0].order.r})`);
  }
}

console.log(`\n${pass} passed, ${fail} failed${fail ? ': ' + fails.join('; ') : ''}`);
process.exit(fail ? 1 : 0);
