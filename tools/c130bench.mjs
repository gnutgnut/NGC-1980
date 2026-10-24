#!/usr/bin/env node
// c130bench.mjs - flight-model checks for game/js/units/air/c130fm.js in plain node: control signs, stability, the
// propeller / engine logic, and the performance envelope against published C-130H numbers.   node tools/c130bench.mjs [--v]
//
// World scale (see c130fm.js): air is 4x sea-level density, so dynamic pressure, IAS and forces are real, world true
// speeds are half (K_EQ = 2). Converted here for the comparison: real-equivalent TAS = 2 x world TAS, real-equivalent
// climb rate = 2 x world vertical speed (same climb gradient), real-equivalent ground distance = 4 x world distance
// (same forces, half the speed: half the time at half the speed). Density altitude d (ft) -> world height with the same
// density ratio: sigma(d) from the ISA, h = -6000 ln(sigma).
//
// Tags (sources in c130fm.js): CONFIRMED = published value, INFERRED = derived from published values, UNVERIFIED = no
// source; the pass bands say how far the model may sit from the number.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(pathToFileURL(new URL('../game/vendor/three.module.min.js', import.meta.url).pathname).href)}, shortCircuit: true }; return n(s, c); }`));
const { createC130Sim, C130, aeroCoeffs, clmaxOf, slipDcl, K_EQ, KT, FT, LB, FPM } = await import('../game/js/units/air/c130fm.js');
const THREE = await import('three');
const VERBOSE = process.argv.includes('--v');
const G = 9.80665, DT = 1 / 60;
let pass = 0, fail = 0;
const check = (name, ok, got, want, tag = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${(tag ? `[${tag}] ` : '') + name}`.padEnd(70) + ` ${got}${want ? '   (want ' + want + ')' : ''}`); };
const deg = r => r * 180 / Math.PI;
const sigmaISA = ft => Math.pow(1 - 6.8756e-6 * ft, 4.2559);
const worldAlt = ft => -6000 * Math.log(sigmaISA(ft));
const lb = x => x / LB;

const sea = { groundY: () => -1000, water: () => false };
const land = { groundY: () => 0, water: () => false };
const ctl = (o = {}) => ({ pitch: 0, roll: 0, yaw: 0, throttle: [0.5, 0.5, 0.5, 0.5], brakeL: 0, brakeR: 0, ...o });
// an aircraft in level flight at `kias` and world height h, with mass m (kg), flaps f, gear g
function air(kias, h, m, o = {}) {
  const A = createC130Sim(G);
  const rho = 4.9 * Math.exp(-h / 6000), tas = kias / KT * Math.sqrt(1.225 / rho);
  A.reset(new THREE.Vector3(0, h, 0), 0, tas, { flap: o.flap ?? 0, gear: o.gear ?? 0, lever: 60 });
  A.pos.set(0, h, 0);
  A.fuel = 8000; A.payload = Math.max(0, m - C130.EMPTY - A.fuel);
  if (A.payload === 0) A.fuel = m - C130.EMPTY;
  // pitch to the expected level-flight AoA so the first seconds are calm
  const qS = 0.5 * 1.225 * (kias / KT) ** 2 * C130.S, CL = m * G / qS; let a = 0;
  for (let i = 0; i < 40; i++) { const c = aeroCoeffs(a, 0, { flap: A.flap, gear: A.gear, ramp: 0, doorL: 0, doorR: 0, dclp: 0 }); a += (CL - c.CL) / 5; }
  A.q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
  return A;
}
function fly(A, secs, c, env = sea, each) {
  for (let t = 0; t < secs; t += DT) {
    const cc = typeof c === 'function' ? c(A, t) : c;
    const ev = A.step(DT, cc, env); if (each) each(A, t, ev); if (A.dead) return A.dead;
  }
  return null;
}
// autopilot hold of altitude / speed / track, with optional overrides of its output
const ap = (cmd, over) => (A, t) => { const c = A.autopilot(DT, typeof cmd === 'function' ? cmd(A, t) : cmd); return over ? over(c, A, t) : c; };
const tq = A => Math.max(...A.eng.map(e => e.torque));

console.log('--- control signs (130 KIAS, flaps 50 %) ---');
{
  const m = lb(120000);
  let A = air(130, 300, m, { flap: 0.5 }); fly(A, 1.5, ctl({ roll: 1 })); check('yoke right rolls right', A.bank > 0.25, `bank ${deg(A.bank).toFixed(0)}°`);
  A = air(130, 300, m, { flap: 0.5 }); fly(A, 1.5, ctl({ pitch: 0.6 })); check('yoke aft pitches up', A.pitch > 0.06 && A.nz > 1.2, `pitch ${deg(A.pitch).toFixed(1)}° nz ${A.nz.toFixed(2)}`);
  A = air(130, 300, m, { flap: 0.5 }); fly(A, 1.5, ctl({ pitch: -0.6 })); check('yoke forward pitches down', A.pitch < -0.04, `pitch ${deg(A.pitch).toFixed(1)}°`);
  A = air(130, 300, m, { flap: 0.5 }); const h0 = A.heading; fly(A, 3, ctl({ yaw: 1 })); check('right pedal: nose right, left sideslip', h0 - A.heading > 0.03 && A.beta < -0.02, `dHdg ${deg(h0 - A.heading).toFixed(1)}° beta ${deg(A.beta).toFixed(1)}°`);
}
console.log('--- stability (fixed controls after trim) ---');
{
  const m = lb(130000), A = air(180, 400, m);
  fly(A, 40, ap({ track: 0, alt: 400, kias: 180 }));
  const trimC = A.autopilot(DT, { track: 0, alt: 400, kias: 180 }); trimC.roll = 0; trimC.yaw = 0; trimC.trimRate = 0;
  check('autopilot trims level at 180 KIAS', Math.abs(A.vel.y) < 0.5 && Math.abs(A.kias - 180) < 4 && Math.abs(A.bank) < 0.03, `vs ${A.vel.y.toFixed(2)} m/s ${A.kias.toFixed(0)} KIAS, AoA ${deg(A.alpha).toFixed(1)}°, elevator ${deg(A.surf.ele).toFixed(1)}°, trim ${A.trim.toFixed(2)}`);
  A.w.y += 0.08; let qmax = 0; fly(A, 4, trimC, sea, A => qmax = Math.max(qmax, Math.abs(A.w.y)));
  check('pitch kick damps (short period) within 4 s', Math.abs(A.w.y) < 0.01, `q ${A.w.y.toFixed(4)} rad/s`);
  A.w.x += 0.15; A.w.z += 0.05; fly(A, 8, trimC);
  check('roll / yaw kick damps (dutch roll) within 8 s', Math.abs(A.w.x) < 0.02 && Math.abs(A.w.z) < 0.02, `p ${A.w.x.toFixed(3)} r ${A.w.z.toFixed(3)}  beta ${deg(A.beta).toFixed(1)}°`);
  const B = air(180, 400, m); fly(B, 40, ap({ track: 0, alt: 400, kias: 180 })); const tc = B.autopilot(DT, { track: 0, alt: 400, kias: 180 }); tc.roll = tc.yaw = tc.trimRate = 0;
  const y0 = B.pos.y; let ymin = 1e9, ymax = -1e9; fly(B, 30, tc, sea, B => { ymin = Math.min(ymin, B.pos.y); ymax = Math.max(ymax, B.pos.y); });
  check('hands off for 30 s after trim: gentle phugoid', ymax - ymin < 60 && Math.abs(B.bank) < 0.35, `height band ${(ymax - ymin).toFixed(1)} m  bank ${deg(B.bank).toFixed(1)}°  ${B.kias.toFixed(0)} KIAS`);
}
console.log('--- stall (1 g, flight idle, 1 kt/s deceleration) ---');
{
  // static: Vs = sqrt(2 W / (rho S CLmax)) with the props at flight idle (no slipstream lift)
  const vsStatic = (w, f) => { let cm = 0; for (let a = 0; a < 0.5; a += 0.002) cm = Math.max(cm, aeroCoeffs(a, 0, { flap: f, gear: 0, ramp: 0, doorL: 0, doorR: 0, dclp: 0 }).CL); return Math.sqrt(2 * lb(w) * G / (1.225 * C130.S * cm)) * KT; };
  // dynamic: hold height with the yoke, flight idle, until the nose drops / the yoke is full aft
  function vsDyn(w, f, power) {
    const A = air(150, 600, lb(w), { flap: f }); let vmin = 999;
    fly(A, 70, (A, t) => { const c = ctl({ pitch: Math.max(-1, Math.min(1, (600 - A.pos.y) * 0.03 - A.vel.y * 0.12 + Math.min(0.9, t / 70))), throttle: [power, power, power, power] }); return c; }, sea, A => { if (Math.abs(A.vel.y) < 1.2 && A.sep < 0.5) vmin = Math.min(vmin, A.kias); });
    return vmin;
  }
  const s0 = vsStatic(155000, 0), s100 = vsStatic(122000, 1), s50 = vsStatic(130000, 0.5);
  check('Vs clean 155,000 lb, power off', s0 > 109 && s0 < 121, `${s0.toFixed(0)} KIAS`, '~115 (180 = Vs + 65, OPS)', 'INFERRED');
  check('Vs 100 % flaps 122,000 lb, power off', s100 > 80 && s100 < 90, `${s100.toFixed(0)} KIAS`, '81-88 (105 KIAS landing = 1.2-1.3 Vs)', 'INFERRED');
  check('Vs 50 % flaps 130,000 lb, power off', s50 > 88 && s50 < 100, `${s50.toFixed(0)} KIAS`, '~89-98', 'UNVERIFIED');
  const d50 = vsDyn(130000, 0.5, 0);
  check('stall in flight 50 % flaps, idle: matches the static Vs', Math.abs(d50 - s50) < 6, `${d50.toFixed(0)} KIAS (static ${s50.toFixed(0)})`);
  // power-on (static): ~140 kN total thrust (about 2/3 torque at stall speed) blowing the wing
  const vsPower = (w, f, T) => { let V = 50; for (let i = 0; i < 30; i++) { const qS = 0.5 * 1.225 * V * V * C130.S, d = slipDcl(T / qS, f); let cm = 0; for (let a = 0; a < 0.5; a += 0.002) cm = Math.max(cm, aeroCoeffs(a, 0, { flap: f, gear: 0, ramp: 0, doorL: 0, doorR: 0, dclp: d }).CL); V = Math.sqrt(2 * lb(w) * G / (1.225 * C130.S * cm)); } return V * KT; };
  const p50 = vsPower(130000, 0.5, 140000);
  check('power-on stall below power-off (blown wing)', p50 < s50 * 0.95 && p50 > s50 * 0.8, `${p50.toFixed(0)} KIAS (power off ${s50.toFixed(0)})`, '5-20 % lower', 'INFERRED');
  // past the stall: buffet first, then a nose drop (and a wing drop) that the yoke can recover from
  const A = air(120, 800, lb(120000), { flap: 0.5 }); let buf = 0, sepMax = 0, rollMax = 0;
  fly(A, 25, (A, t) => ctl({ pitch: t < 15 ? 1 : -0.3, throttle: [0, 0, 0, 0] }), sea, A => { buf = Math.max(buf, A.buffet); sepMax = Math.max(sepMax, A.sep); rollMax = Math.max(rollMax, Math.abs(A.bank)); });
  fly(A, 20, ap({ track: 0, alt: A.pos.y, kias: 140 }));
  check('full aft yoke: buffet, stall break, wing drop < 60°, recovery', buf > 0.5 && sepMax > 0.3 && rollMax < 1.05 && !A.dead && A.kias > 120, `buffet ${buf.toFixed(2)} sep ${sepMax.toFixed(2)} max bank ${deg(rollMax).toFixed(0)}°, recovered at ${A.kias.toFixed(0)} KIAS`);
}
console.log('--- speed and climb ---');
{
  // max level speed at 20,000 ft, max power (TIT limit), 120,000 lb
  const h = worldAlt(20000), A = air(220, h, lb(120000));
  fly(A, 260, ap({ track: 0, alt: h, kias: 400 }, c => { c.throttle = [1, 1, 1, 1]; return c; }));
  const ktas = A.tas * K_EQ * KT;
  check('max speed 20,000 ft, max power, 120,000 lb', ktas > 305 && ktas < 335 && Math.abs(A.vel.y) < 0.5, `${ktas.toFixed(0)} KTAS (${A.kias.toFixed(0)} KIAS) TIT ${A.eng[0].tit.toFixed(0)} shp ${A.eng[0].shp.toFixed(0)} beta ${A.eng[0].beta.toFixed(1)}°`, '320 KTAS (WIKI)', 'CONFIRMED');
  // cruise: max continuous TIT 1010 at 20,000 ft
  const B = air(220, h, lb(120000)); let lev = 0.9;
  fly(B, 260, ap({ track: 0, alt: h, kias: 400 }, (c, B) => { lev += (1010 - B.eng[0].tit) * 0.00002; lev = Math.max(0.3, Math.min(1, lev)); c.throttle = [lev, lev, lev, lev]; return c; }));
  const kc = B.tas * K_EQ * KT;
  check('cruise 20,000 ft at max continuous TIT 1010 °C', kc > 280 && kc < 310, `${kc.toFixed(0)} KTAS, ff ${(B.eng[0].ff * 4).toFixed(0)} lb/h total`, '292 KTAS (WIKI cruise)', 'CONFIRMED');
  // climb at sea level, 155,000 lb, climb power (TIT 1010 °C, OPS "Climb - 1010°C"), 160 KIAS on the yoke (FLC)
  const C = air(160, 150, lb(155000)); let lv = 0.8, vs = 0, tqm = 0;
  fly(C, 60, ap((C, t) => ({ track: 0, alt: 3000, kias: 160, vsMax: 30, flc: true }), (c, C) => { lv += (1010 - C.eng[0].tit) * 0.00003; lv = Math.max(0.3, Math.min(1, lv)); c.throttle = [lv, lv, lv, lv]; return c; }), sea, (C, t) => { if (t > 40) { vs = C.vel.y; tqm = tq(C); } });
  const fpm = vs * K_EQ * FPM;
  check('climb rate sea level 155,000 lb, climb power', fpm > 1550 && fpm < 2100, `${fpm.toFixed(0)} fpm real-equivalent (world ${vs.toFixed(1)} m/s) at ${C.kias.toFixed(0)} KIAS, torque ${tqm.toFixed(0)}`, '1,830 fpm (WIKI)', 'CONFIRMED');
}
console.log('--- para-drop configuration: 130 KIAS, flaps 50 %, 120,000 lb ---');
{
  const A = air(130, 300, lb(120000), { flap: 0.5 });
  fly(A, 60, ap({ track: 0, alt: 300, kias: 130 }));
  const t = tq(A);
  check('drop run trims level at 130 KIAS (FM: 130-135 KIAS)', Math.abs(A.kias - 130) < 3 && Math.abs(A.vel.y) < 0.4, `${A.kias.toFixed(0)} KIAS, AoA ${deg(A.alpha).toFixed(1)}°, pitch ${deg(A.pitch).toFixed(1)}°, torque ${t.toFixed(0)} in-lb, rpm ${(A.eng[0].N * 100).toFixed(1)} %, beta ${A.eng[0].beta.toFixed(1)}°`, '', 'CONFIRMED');
  check('drop attitude: deck near level for the jumpers', deg(A.pitch) > -2 && deg(A.pitch) < 6, `pitch ${deg(A.pitch).toFixed(1)}°`, '0-5° nose up', 'UNVERIFIED');
  const ff = A.eng.reduce((s, e) => s + e.ff, 0);
  check('drop-run fuel flow plausible', ff > 3000 && ff < 6500, `${ff.toFixed(0)} lb/h total`, '~4,000-5,500', 'UNVERIFIED');
  // doors and ramp add drag: open both doors, the speed hold needs more torque
  A.doorCmd = [1, 1]; A.rampCmd = 1; fly(A, 30, ap({ track: 0, alt: 300, kias: 130 }));
  check('doors + ramp open: more torque for the same speed', tq(A) > t + 300, `torque ${tq(A).toFixed(0)} in-lb (was ${t.toFixed(0)})`);
  // roll performance: time to 30° bank, full aileron
  const R = air(130, 300, lb(120000), { flap: 0.5 }); fly(R, 10, ap({ track: 0, alt: 300, kias: 130 })); let t30 = null;
  fly(R, 5, (R, t) => { const c = R.autopilot(DT, { track: 0, alt: 300, kias: 130 }); c.roll = 1; c.yaw = 0; return c; }, sea, (R, t) => { if (t30 === null && R.bank > 30 / 57.3) t30 = t; });
  check('time to 30° bank, full aileron, 130 KIAS', t30 && t30 > 1.4 && t30 < 3.2, `${t30 ? t30.toFixed(2) : '-'} s`, '~2-2.5 s (MIL-F-8785C class III)', 'UNVERIFIED');
  // a 2 min drop run: altitude and speed stay in the box through a 90° turn
  const Q = air(130, 300, lb(120000), { flap: 0.5 }); let hErr = 0, vErr = 0;
  fly(Q, 120, ap((Q, t) => ({ track: t > 30 ? -Math.PI / 2 : 0, alt: 300, kias: 130 })), sea, (Q, t) => { if (t > 15) { hErr = Math.max(hErr, Math.abs(Q.pos.y - 300)); vErr = Math.max(vErr, Math.abs(Q.kias - 130)); } });
  check('autopilot: 90° turn on the run, holds ±15 m, ±8 kt', hErr < 15 && vErr < 8 && Math.abs(Q.heading + Math.PI / 2) < 0.05, `max ${hErr.toFixed(1)} m, ${vErr.toFixed(1)} kt, heading ${deg(Q.heading).toFixed(0)}°`);
}
console.log('--- propellers and engines ---');
{
  // governing: a slam from flight idle to max at 160 KIAS keeps the rpm in the 98-102 % band after the transient
  const A = air(160, 300, lb(120000)); fly(A, 15, ap({ track: 0, alt: 300, kias: 160 }, c => { c.throttle = [0, 0, 0, 0]; return c; }));
  let nmin = 2, nmax = 0, n3 = 0;
  fly(A, 6, ap({ track: 0, alt: 300, kias: 160 }, c => { c.throttle = [1, 1, 1, 1]; return c; }), sea, (A, t) => { nmin = Math.min(nmin, A.eng[0].N); nmax = Math.max(nmax, A.eng[0].N); if (t > 3) n3 = Math.max(n3, Math.abs(A.eng[0].N - 1)); });
  check('governor: idle -> max slam, rpm stays 100 %', nmax < 1.04 && nmin > 0.96 && n3 < 0.02, `rpm ${(nmin * 100).toFixed(1)}-${(nmax * 100).toFixed(1)} %, after 3 s ±${(n3 * 100).toFixed(1)} %, beta ${A.eng[0].beta.toFixed(1)}°`, '98-102 % (OPS)', 'CONFIRMED');
  // engine cut on #1 at 140 KIAS: the NTS coarsens the windmilling prop, the condition lever feathers it in ~5 s
  const B = air(140, 400, lb(120000), { flap: 0.5 }); fly(B, 20, ap({ track: 0, alt: 400, kias: 140 }));
  B.setCond(0, 'stop'); let ntsSeen = false, tq0 = 0;
  fly(B, 4, ap({ track: 0, alt: 400, kias: 140 }), sea, B => { if (B.eng[0].nts) ntsSeen = true; tq0 = B.eng[0].torque; });
  const nWind = B.eng[0].N;
  check('engine cut: NTS limits the windmilling drag', ntsSeen && tq0 > -3500, `NTS ${ntsSeen}, torque ${tq0.toFixed(0)} in-lb, rpm ${(nWind * 100).toFixed(0)} %, beta ${B.eng[0].beta.toFixed(0)}°`, 'NTS at -1,260 in-lb (OPS)', 'CONFIRMED');
  B.setCond(0, 'feather'); let tf = null;
  fly(B, 12, ap({ track: 0, alt: 400, kias: 140 }), sea, (B, t) => { if (tf === null && B.eng[0].beta > 92) tf = t; });
  check('feathered: 92.5° in ~4-6 s, prop stops', tf && tf < 7 && B.eng[0].N < 0.05, `feathered in ${tf ? tf.toFixed(1) : '-'} s, rpm ${(B.eng[0].N * 100).toFixed(1)} %`, '92.5° (OPS)', 'CONFIRMED');
  // three engines: holds height and heading at 140 KIAS with rudder, 120,000 lb
  const y0 = B.pos.y; fly(B, 40, ap({ track: 0, alt: 400, kias: 140 }));
  check('three engines: holds 140 KIAS level with rudder trim', Math.abs(B.pos.y - 400) < 15 && Math.abs(B.kias - 140) < 6 && Math.abs(B.heading) < 0.05, `alt ${B.pos.y.toFixed(0)} ${B.kias.toFixed(0)} KIAS rudder ${deg(B.surf.rud).toFixed(1)}° bank ${deg(B.bank).toFixed(1)}° beta ${deg(B.beta).toFixed(1)}°`);
  // Vmca: outboard feathered, the other three at take-off power, full rudder: the slowest speed that holds heading
  let vmca = null;
  for (let k = 140; k >= 80; k -= 4) {
    const C = air(k, 400, lb(120000), { flap: 0.5 }); C.setCond(0, 'feather'); C.eng[0].beta = 92.5; C.eng[0].N = 0; C.eng[0].run = false;
    let lost = false; const h0 = 0;
    fly(C, 25, ap({ track: 0, alt: 400 + 0, kias: k, vsMax: 30, bankMax: 0.09 }, (c, C) => { c.throttle = [1, 1, 1, 1]; return c; }), sea, (C, t) => { if (t > 8 && Math.abs(C.heading - h0) > 0.35) lost = true; });
    if (lost) { vmca = k + 4; break; }
  }
  check('Vmca (outboard feathered, others max, ≤5° bank)', vmca && vmca > 85 && vmca < 112, `${vmca ?? '<80'} KIAS`, '~95 (UNVERIFIED)', 'UNVERIFIED');
  // air start: unfeather with AIR START, windmill, light-off, back to RUN on speed
  const D = air(160, 400, lb(120000)); D.setCond(0, 'feather'); D.eng[0].beta = 92.5; D.eng[0].N = 0; D.eng[0].run = false; fly(D, 5, ap({ track: 0, alt: 400, kias: 160 }));
  D.setCond(0, 'airstart'); let tl = null;
  fly(D, 30, ap({ track: 0, alt: 400, kias: 160 }), sea, (D, t, ev) => { for (const e of ev) if (e.e === 'lightoff' && tl === null) tl = t; });
  D.setCond(0, 'run'); fly(D, 10, ap({ track: 0, alt: 400, kias: 160 }));
  check('air start: unfeather, light-off, on speed', tl !== null && tl < 15 && D.eng[0].run && Math.abs(D.eng[0].N - 1) < 0.02, `light-off at ${tl ? tl.toFixed(1) : '-'} s, rpm ${(D.eng[0].N * 100).toFixed(1)} %, shp ${D.eng[0].shp.toFixed(0)}`);
  // static thrust: take-off torque on the ground
  const E = createC130Sim(G).resetGround(0, 0, 0, 0); E.fuel = 8000; E.payload = lb(120000) - C130.EMPTY - E.fuel;
  fly(E, 4, ctl({ lever: [18, 18, 18, 18], brakeL: 1, brakeR: 1 }), land);
  const gi = { N: E.eng[0].N, T: E.totalThrust(), beta: E.eng[0].beta };
  check('ground idle (beta): ~100 % rpm, small thrust (it creeps)', Math.abs(gi.N - 1) < 0.03 && Math.abs(gi.T) < 4 * 9000, `rpm ${(gi.N * 100).toFixed(1)} % thrust ${(gi.T / 1000).toFixed(1)} kN beta ${gi.beta.toFixed(1)}°`, '94-102 % (OPS)', 'CONFIRMED');
  // brakes (anti-skid, mu 0.42) hold run-up power; at full take-off torque on all four a 120,000 lb C-130 slides
  let lv = 0.5; fly(E, 8, (E) => { lv += (10000 - tq(E)) * 2e-6; lv = Math.max(0, Math.min(1, lv)); return ctl({ throttle: [lv, lv, lv, lv], brakeL: 1, brakeR: 1 }); }, land);
  check('brakes hold 10,000 in-lb on all four', Math.hypot(E.vel.x, E.vel.z) < 0.3, `creep ${Math.hypot(E.vel.x, E.vel.z).toFixed(2)} m/s, ${(E.totalThrust() / 1000).toFixed(0)} kN`);
  E.pos.set(0, E.pos.y, 0); E.vel.set(0, 0, 0);
  fly(E, 8, (E) => { lv += (19600 - tq(E)) * 2e-6; lv = Math.max(0, Math.min(1, lv)); E.pos.z = 0; E.vel.z = 0; return ctl({ throttle: [lv, lv, lv, lv], brakeL: 1, brakeR: 1 }); }, land);   // (held in place)
  const Ts = E.totalThrust() / 4;
  check('static thrust per engine at 19,600 in-lb', Ts > 52000 && Ts < 70000, `${(Ts / 1000).toFixed(1)} kN (${(Ts * 0.2248).toFixed(0)} lbf), beta ${E.eng[0].beta.toFixed(1)}°, TIT ${E.eng[0].tit.toFixed(0)}`, '~55-65 kN (FM 0.75 momentum)', 'INFERRED');
  fly(E, 3, ctl({ lever: [0, 0, 0, 0], brakeL: 1, brakeR: 1 }), land);
  check('max reverse: negative thrust', E.totalThrust() < -40000, `${(E.totalThrust() / 1000).toFixed(0)} kN beta ${E.eng[0].beta.toFixed(1)}° rpm ${(E.eng[0].N * 100).toFixed(0)} %`, 'reverse -5..-8° (OPS)', 'CONFIRMED');
}
console.log('--- ground: take-off, landing, taxi ---');
{
  // take-off at 155,000 lb, flaps 50 %, 19,600 in-lb: rotate at 115 KIAS to 7.5°, distances real-equivalent (4 x world).
  // The 3,586 ft is the take-off run (Jane's C-130H: T-O run 1,091 m, T-O to 15 m 1,573 m, quoted from memory: UNVERIFIED)
  const A = createC130Sim(G).resetGround(0, 0, 0, 0); A.fuel = 12000; A.payload = lb(155000) - C130.EMPTY - A.fuel; A.flapSel = A.flap = 0.5;
  let lv = 0.5, x50 = null, xlo = null, vlo = 0;
  fly(A, 60, (A, t) => { lv += (19600 - tq(A)) * 3e-6; lv = Math.max(0, Math.min(1, lv)); const rot = A.kias > 115; const c = ctl({ throttle: [lv, lv, lv, lv], pitch: rot ? Math.max(-0.5, Math.min(1, (0.13 - A.pitch) * 9 - A.w.y * 1.5)) : -0.05 }); return c; }, land,
    (A, t, ev) => { const d = -A.pos.z; if (xlo === null && !A.onGround && A.pos.y > 3.2) { xlo = d; vlo = A.kias; } if (x50 === null && A.pos.y - 2.62 > 15.24) x50 = d; });
  check('take-off run, 155,000 lb, flaps 50 %', xlo && xlo * 4 * FT > 3050 && xlo * 4 * FT < 4100, `${xlo ? (xlo * 4 * FT).toFixed(0) : '-'} ft real-equivalent, lift-off ${vlo.toFixed(0)} KIAS`, '3,586 ft (WIKI)', 'CONFIRMED');
  // the airborne segment is NOT scaled by 4: heights are real, so half the vertical speed for twice the time at half the
  // forward speed covers the real distance
  const d50 = x50 && xlo ? (xlo * 4 + (x50 - xlo)) * FT : 0;
  check('take-off to 50 ft', d50 > 3800 && d50 < 6200, `${d50.toFixed(0)} ft real-equivalent (air segment ${((x50 - xlo) * FT).toFixed(0)} ft)`, '~5,160 ft (Jane\'s, from memory)', 'UNVERIFIED');
  // landing: 122,000 lb, 100 % flaps, 105 KIAS touchdown, max reverse + brakes
  const L = air(110, 30, lb(122000), { flap: 1, gear: 1 }); L.pos.y = 12; let td = null, xs = 0;
  fly(L, 70, (L, t) => {
    if (td) { const slow = Math.hypot(L.vel.x, L.vel.z) < 4; return ctl({ lever: Array(4).fill(slow ? 18 : 0), brakeL: 1, brakeR: 1, pitch: -0.2 }); }   // reverse, then ground idle when slow
    const c = L.autopilot(DT, { track: 0, alt: 2.62, kias: 105, vsMax: 1.0 }); c.throttle = c.throttle.map(v => Math.min(v, 0.5)); return c;
  }, land, (L, t, ev) => { for (const e of ev) if (e.e === 'touchdown' && !td) { td = { t, z: L.pos.z, k: L.kias, vy: e.vy }; } });
  const roll = td ? (td.z - L.pos.z) * 4 * FT : 0;
  check('landing: touchdown and stop with reverse + brakes', td && !L.dead && Math.hypot(L.vel.x, L.vel.z) < 0.5 && roll > 700 && roll < 2600, td ? `touchdown ${td.k.toFixed(0)} KIAS at ${(td.vy * K_EQ * FPM).toFixed(0)} fpm, ground roll ${roll.toFixed(0)} ft real-equivalent` : `no touchdown (${L.dead})`, '~1,000-2,000 ft', 'UNVERIFIED');
  // taxi: the tiller turns it
  const T = createC130Sim(G).resetGround(0, 0, 0, 0); T.fuel = 8000; fly(T, 2, ctl({ lever: [18, 18, 18, 18] }), land);
  let turned = 0, hp = T.heading; fly(T, 20, (T) => ctl({ lever: Array(4).fill(Math.hypot(T.vel.x, T.vel.z) < 3 ? 30 : 18), tiller: 0.5 }), land, T => { let d = T.heading - hp; d = (d + 3 * Math.PI) % (2 * Math.PI) - Math.PI; turned += d; hp = T.heading; });
  check('taxi: tiller right turns right', turned < -0.5 && T.onGround, `turned ${deg(-turned).toFixed(0)}° right, ${Math.hypot(T.vel.x, T.vel.z).toFixed(1)} m/s`);
  const p0 = T.pos.clone(); fly(T, 10, ctl({ lever: [18, 18, 18, 18], brakeL: 1, brakeR: 1 }), land); const p1 = T.pos.clone(); fly(T, 6, ctl({ lever: [18, 18, 18, 18], brakeL: 1, brakeR: 1 }), land);
  check('brakes: stops, then no creep (< 1 cm/s)', T.pos.distanceTo(p1) < 0.06, `creep ${T.pos.distanceTo(p1).toFixed(3)} m, sits at ${T.pos.y.toFixed(2)} (wow ${T.wow.map(v => v.toFixed(2))}) pitch ${deg(T.pitch).toFixed(1)}°`);
}
console.log('--- ground start (T.O. 1C-130H-1 normal start; OPS card limits) ---');
{
  // cold and dark on the ground: battery, GTC, then engines 3, 4, 2, 1 on bleed air
  const A = createC130Sim(G).resetGround(0, 0, 0, 0, { running: false }); A.fuel = 8000; A.payload = 2000;
  const c0 = ctl({ lever: [18, 18, 18, 18], brakeL: 1, brakeR: 1 });
  check('no battery: the start button does nothing', A.startEngine(2) === false && !A.eng[2].starter, `starter ${A.eng[2].starter}`);
  A.battery = true;
  check('no bleed air (GTC off): no start', A.startEngine(2) === false, `bleed ${A.bleed}`);
  A.gtc.cmd = true; let tg = null; fly(A, 40, c0, land, (A, t) => { if (tg === null && A.bleed) tg = t; });
  check('GTC on-speed, bleed air on the manifold', tg !== null && tg > 10 && tg < 35, `bleed after ${tg ? tg.toFixed(1) : '-'} s`, '~20 s', 'UNVERIFIED');
  const ev3 = {}; A.setCond(2, 'run'); A.startEngine(2);
  fly(A, 70, c0, land, (A, t, evs) => { for (const e of evs) if (e.k === 2 && !ev3[e.e]) ev3[e.e] = { t, ...e }; });
  const lo = ev3.lightoff, so = ev3.starterout, on = ev3.onspeed;
  check('#3 light-off at 16 % (fuel and ignition)', lo && lo.N > 0.15 && lo.N < 0.2, lo ? `${(lo.N * 100).toFixed(0)} % at ${lo.t.toFixed(1)} s` : 'no light-off', 'ignition by 35 % (OPS)', 'CONFIRMED');
  check('#3 TIT peak in the normal start band', on && on.peakTit > 740 && on.peakTit < 830, on ? `${on.peakTit.toFixed(0)} C` : '-', '750-830 C (OPS)', 'CONFIRMED');
  check('#3 starter drops out at 60 %', so && so.N >= 0.59 && so.N < 0.63, so ? `${(so.N * 100).toFixed(0)} % at ${so.t.toFixed(1)} s` : '-', '60 % (OPS)', 'CONFIRMED');
  check('#3 to ground idle in under a minute', on && on.t < 60 && Math.abs(A.eng[2].N - 1) < 0.03, on ? `on speed at ${on.t.toFixed(1)} s, now ${(A.eng[2].N * 100).toFixed(1)} %` : '-', '94-102 % (OPS)', 'CONFIRMED');
  // the others start on the running engine's bleed with the GTC off; the order 3-4-2-1
  A.gtc.cmd = false; fly(A, 15, c0, land);
  for (const k of [3, 1, 0]) { A.setCond(k, 'run'); A.startEngine(k); fly(A, 45, c0, land); }
  check('3-4-2-1 all running on cross-bleed, rpm 94-102 %', A.eng.every(e => e.run && e.N > 0.94 && e.N < 1.02), A.eng.map(e => (e.N * 100).toFixed(0) + '%').join(' '));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
