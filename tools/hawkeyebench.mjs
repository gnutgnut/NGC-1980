#!/usr/bin/env node
// hawkeyebench.mjs - the TASK FORCE's parity units in node, against published numbers:
//   E-2C HAWKEYE  (game/js/units/air/hawkeyefm.js) on the parametric airframe: trimmed cruise and max level speed,
//                 climb, stall (clean / landing configuration), the AI pilot's orbit (as the game flies the REAPER),
//                 a catapult launch into the orbit, one engine out
// World scale: the air is 4x sea-level density: EAS is real, true speeds half, a world climb rate half the real one
// (both are printed).        node tools/hawkeyebench.mjs [--v] [--only=hawkeye]
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(pathToFileURL(new URL('../game/vendor/three.module.min.js', import.meta.url).pathname).href)}, shortCircuit: true }; return n(s, c); }`));
const { createPilot } = await import('../game/js/units/air/pilot.js');
const { aeroCoeffs } = await import('../game/js/units/air/airframe.js');
const HK = await import('../game/js/units/air/hawkeyefm.js');
const V = process.argv.includes('--v'), ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
const G = 9.0, DT = 1 / 60, KT = 1.94384, FPM = 196.85, K_EQ = 2, LB = 2.20462;
let pass = 0, fail = 0;
const check = (name, ok, got, want = '', tag = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(56)} ${got}${want ? '   (want ' + want + (tag ? ', ' + tag : '') + ')' : ''}`); };
const deg = r => r * 180 / Math.PI, clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const run = (secs, each) => { for (let t = 0; t < secs; t += DT) if (each(t) === false) return t; return secs; };
const sea = { groundY: () => 0, water: () => true, terrain: () => 0 };

// level flight at `alt` through the pilot's own flight director (stick for g, wings level), throttle given
function level(A, alt, thr) {
  const FD = (A._fd ||= createPilot(A, {}).FD);
  const n = Math.cos(A.attitude().pitch) + clamp((alt - A.pos.y) * 0.02 - A.vel.y * 0.1, -0.6, 0.6);
  FD.ctl.pitch = FD.pitchFor(n, DT); FD.ctl.roll = FD.rollFor(0); FD.ctl.yaw = clamp(A.beta * 3, -0.6, 0.6);
  FD.ctl.throttle[0] = FD.ctl.throttle[1] = thr; return FD.ctl;
}
function hawk(alt = 300, eas = 90, fuel = HK.HAWKEYE.FUEL_MAX) {
  const A = HK.createHawkeyeSim(G); A.reset(0, 0, 0, 0, { running: true, airborne: true, alt, speed: eas / 2 });
  for (const e of A.eng) e.n = 0.7; A.fuel = fuel; return A;
}

// ------------------------------------------------------------------------------------------------- E-2C HAWKEYE
if (!ONLY || ONLY === 'hawkeye') {
  const P = HK.HAWKEYE.PERF;
  console.log(`--- E-2C HAWKEYE: mass ${(HK.HAWKEYE.EMPTY + HK.HAWKEYE.FUEL_MAX).toFixed(0)} kg (${((HK.HAWKEYE.EMPTY + HK.HAWKEYE.FUEL_MAX) * LB).toFixed(0)} lb) with full internal fuel ---`);
  // max level speed, full power, low level
  { const A = hawk(300, 140); run(150, () => A.step(DT, level(A, 300, 1), sea));
    check('max level speed, full power, 300 m', A.eas * KT > 310 && A.eas * KT < 360 && !A.dead, `${(A.eas * KT).toFixed(0)} KEAS (world true ${(A.tas * KT).toFixed(0)} kt), ${(A.totalThrust() / 1000).toFixed(1)} kN`, `~${P.VMAX_KT} kt TAS at altitude, so 310-360 KEAS low down`, 'CONFIRMED (WIKI) / INFERRED'); }
  // cruise: ~70 % power
  { const A = hawk(300, 120); run(150, () => A.step(DT, level(A, 300, 0.6), sea));
    check('cruise, 60 % power, 300 m', A.eas * KT > 230 && A.eas * KT < 290, `${(A.eas * KT).toFixed(0)} KEAS, AoA ${deg(A.alpha).toFixed(1)}°, fuel flow ${((A.eng[0].ff + A.eng[1].ff) * 3600).toFixed(0)} kg/h`, `~${P.VCRUISE_KT} kt`, 'CONFIRMED (WIKI) / INFERRED'); }
  // climb: full power at ~160 KEAS, max take-off weight
  { const A = hawk(120, 82, HK.HAWKEYE.MTOW - HK.HAWKEYE.EMPTY); const FD = createPilot(A, {}).FD; let vs = 0, n = 0, kias = 0;
    run(70, t => { const err = 82 - A.eas; const gam = clamp(0.09 - err * 0.012, -0.05, 0.25); FD.steer(FD.dirHdg(0, gam), DT, { gmax: 1.5, k: 1 }); FD.setThrottle(1); A.step(DT, FD.ctl, sea); if (t > 40) { vs += A.vel.y; kias += A.eas * KT; n++; } });
    vs /= n; kias /= n; const fpm = vs * K_EQ * FPM;
    check('climb, full power, max take-off weight (53,000 lb)', fpm > P.ROC_FPM * 0.75 && fpm < P.ROC_FPM * 1.35, `${fpm.toFixed(0)} fpm real-equivalent (world ${vs.toFixed(1)} m/s) at ${kias.toFixed(0)} KEAS`, `${P.ROC_FPM} fpm`, 'CONFIRMED (WIKI), weight unstated'); }
  // stall speeds from the aero tables: 1 g at CLmax (+ the props' thrust component), clean and landing configuration
  { const K = HK.HAWKEYE_AF.aero, W = 22680 * 9.81, Wl = 20410 * 9.81;   // 50,000 lb / 45,000 lb landing weight
    const clmax = flap => { let best = 0; for (let a = 0; a < 0.6; a += 0.002) best = Math.max(best, aeroCoeffs(K, a, 0, 0.2, { flap, lef: 0, gear: flap, brake: 0, stores: 0, stab: 0, rud: 0 }).CL); return best; };
    const c0 = clmax(0), c1 = clmax(1), vs0 = Math.sqrt(2 * W / (1.225 * HK.HAWKEYE.S * c0)) * KT, vs1 = Math.sqrt(2 * Wl / (1.225 * HK.HAWKEYE.S * c1)) * KT;
    check('stall, clean, 50,000 lb (1 g, power off)', vs0 > 105 && vs0 < 125, `${vs0.toFixed(0)} KEAS (CLmax ${c0.toFixed(2)})`, `~${P.VS_CLEAN_KT} kt`, 'INFERRED');
    check('approach speed 1.2 Vs, landing config, 45,000 lb', vs1 * 1.2 > 95 && vs1 * 1.2 < 112, `Vs ${vs1.toFixed(0)} KEAS, 1.2 Vs ${(vs1 * 1.2).toFixed(0)} KEAS (CLmax ${c1.toFixed(2)})`, `~${P.VAPP_KT} kt`, 'UNVERIFIED'); }
  // slow flight on the FCS AoA limit, idle power: it must not depart
  { const A = hawk(400, 100); run(60, () => A.step(DT, level(A, 400, 0), sea));
    const v = A.eas * KT; check('slow flight at the AoA limit, idle (no departure)', v > 100 && v < 135 && !A.dead && Math.abs(deg(A.attitude().roll)) < 10, `${v.toFixed(0)} KEAS, AoA ${deg(A.alpha).toFixed(1)}°, sink ${(-A.vel.y).toFixed(1)} m/s, roll ${deg(A.attitude().roll).toFixed(0)}°`); }
  // one engine out: the rudder and ailerons hold it, it can still hold height at a reduced speed
  { const A = hawk(300, 100), mods = { eng: [0, 1], hyd: 1, fcsOk: true, gearOk: true, hookOk: true }; const env = { ...sea, mods }; let maxRoll = 0;
    run(90, t => { const c = level(A, 300, 1); A.step(DT, c, env); if (t > 10) maxRoll = Math.max(maxRoll, Math.abs(deg(A.attitude().roll))); });
    check('left engine out, full power on the right', !A.dead && Math.abs(A.pos.y - 300) < 30 && maxRoll < 15, `${(A.eas * KT).toFixed(0)} KEAS, alt ${A.pos.y.toFixed(0)} m, beta ${deg(A.beta).toFixed(1)}°, max roll ${maxRoll.toFixed(0)}°, heading drift ${deg(A.heading()).toFixed(0)}°`); }
  // the AI pilot in its orbit (as airwar.js flies the REAPER: createPilot(A, { side, capAlt, capR }), spawnAir('patrol'))
  for (const [label, o] of [['default (capAlt 300, capR 450)', {}], ['as the REAPER is spawned (capAlt 230, capR 260)', { capAlt: 230, capR: 260 }], ['wide (capAlt 350, capR 700)', { capAlt: 350, capR: 700 }]]) {
    const A = hawk(260, 90); A.eng[0].n = A.eng[1].n = 0.6; const PQ = createPilot(A, { side: 1, ...o }); const anc = { x: 500, y: 0, z: -400 }; PQ.anchor = anc; PQ.spawnAir('patrol');
    const R = o.capR ?? 450, alt = o.capAlt ?? 300; let rmin = 1e9, rmax = 0, amin = 1e9, amax = 0, nzMax = 0, eas = 0, n = 0;
    run(300, t => { PQ.update(DT, sea); if (t > 150) { const r = Math.hypot(A.pos.x - anc.x, A.pos.z - anc.z); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); amin = Math.min(amin, A.pos.y); amax = Math.max(amax, A.pos.y); nzMax = Math.max(nzMax, A.nz); eas += A.eas; n++; } if (A.dead) return false; });
    check(`AI orbit ${label}`, !A.dead && rmin > R * 0.6 && rmax < R * 1.45 && Math.abs((amin + amax) / 2 - alt) < 50 && nzMax < 2.6, `r ${rmin.toFixed(0)}-${rmax.toFixed(0)} m, alt ${amin.toFixed(0)}-${amax.toFixed(0)} m, ${(eas / n * KT).toFixed(0)} KEAS, max ${nzMax.toFixed(2)} g, fuel ${A.fuel.toFixed(0)} kg`, `r ~${R}, alt ~${alt}`);
    if (V) console.log(PQ.log.map(l => `   ${l.t} ${l.msg}`).join('\n'));
  }
  // off the ALBATROSS's catapult into the orbit over the ship (the way the Tomcats launch: pilot.launch(env))
  { const c = { x: 0, z: 0, yaw: 0.3, speed: 6 };
    const W = { terrain: () => 0, groundY: (x, z) => { const dx = x - c.x, dz = z - c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw), lx = dx * co - dz * si, lz = dx * si + dz * co; return Math.abs(lx) < 14 && lz > -66 && lz < 60 ? 8 : 0; },
      water: () => false, surfVel: () => ({ vx: -Math.sin(c.yaw) * c.speed, vz: -Math.cos(c.yaw) * c.speed, w: 0, cx: c.x, cz: c.z }),
      carrier: () => ({ x: c.x, z: c.z, yaw: c.yaw, deck: 8, vx: -Math.sin(c.yaw) * c.speed, vz: -Math.cos(c.yaw) * c.speed, speed: c.speed, w: 0 }), anchor: () => ({ x: c.x, y: 8, z: c.z }) };
    W.water = (x, z) => W.groundY(x, z) < 1;
    const A = HK.createHawkeyeSim(G); A.reset(0, 8, 0, 0, { running: true }); const PL = createPilot(A, { side: 1, name: 'CLOSEOUT 600' }); PL.launch(W);
    let endEAS = 0, minY = 1e9, capT = null; const seen = new Set();
    run(220, t => { PL.update(DT, W); c.x += -Math.sin(c.yaw) * c.speed * DT; c.z += -Math.cos(c.yaw) * c.speed * DT; seen.add(PL.state);
      for (const e of A.events) if (e.e === 'catend') endEAS = A.eas; if (PL.state === 'climb') minY = Math.min(minY, A.pos.y); if (PL.state === 'cap' && capT === null) capT = t; if (A.dead) return false; });
    if (V || A.dead) console.log(PL.log.map(l => `   ${l.t} ${l.msg}`).join('\n'));
    const r = Math.hypot(A.pos.x - c.x, A.pos.z - c.z);
    check('cat shot off the ALBATROSS, climb, orbit over the ship', !A.dead && endEAS * KT > 100 && minY > 8 && capT !== null && r < 900, `end speed ${(endEAS * KT).toFixed(0)} KEAS, sink off the bow to ${minY.toFixed(1)} m, orbit at ${capT?.toFixed(0)} s, r ${r.toFixed(0)} m, alt ${A.pos.y.toFixed(0)} m`); }
}


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
