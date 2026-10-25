import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(pathToFileURL(new URL('../../game/vendor/three.module.min.js', import.meta.url).pathname).href)}, shortCircuit: true }; return n(s, c); }`));
const { createC130Sim, C130, aeroCoeffs, K_EQ, KT, LB, FPM } = await import('../../game/js/units/air/c130fm.js');
const THREE = await import('three');
const DT = 1 / 60, deg = r => (r * 180 / Math.PI).toFixed(1), lb = x => x / LB;
const land = { groundY: () => 0, water: () => false }, sea = { groundY: () => -1000, water: () => false };
const ctl = (o = {}) => ({ pitch: 0, roll: 0, yaw: 0, throttle: [0.5, 0.5, 0.5, 0.5], brakeL: 0, brakeR: 0, ...o });
const which = process.argv[2];
function air(kias, h, m, o = {}) {
  const A = createC130Sim();
  const rho = 4.9 * Math.exp(-h / 6000), tas = kias / KT * Math.sqrt(1.225 / rho);
  A.reset(new THREE.Vector3(0, h, 0), 0, tas, { flap: o.flap ?? 0, gear: o.gear ?? 0, lever: 60 });
  A.fuel = 8000; A.payload = Math.max(0, m - C130.EMPTY - A.fuel);
  return A;
}
if (which === 'gi') {
  const E = createC130Sim().resetGround(0, 0, 0, 0); E.fuel = 8000;
  for (let t = 0; t < 5; t += DT) { E.step(DT, ctl({ lever: [18, 18, 18, 18], brakeL: 1, brakeR: 1 }), land); if (Math.round(t * 60) % 15 === 0) { const e = E.eng[0]; console.log(t.toFixed(2), 'N', e.N.toFixed(3), 'b', e.beta.toFixed(1), 'shp', e.shp.toFixed(0), 'T', e.thrust.toFixed(0), 'Qa', e.Qa.toFixed(0), 'vi', e.vi.map(v => v.toFixed(1)), 'v', E.vel.length().toFixed(2)); } }
}
if (which === 'climb') {
  const C = air(160, 150, lb(155000)); let lv = 0.8;
  for (let t = 0; t < 60; t += DT) { const c = C.autopilot(DT, { track: 0, alt: 3000, kias: 160, vsMax: 30, flc: true }); lv += (19500 - Math.max(...C.eng.map(e => e.torque))) * 2e-6; lv = Math.max(0.3, Math.min(1, lv)); c.throttle = [lv, lv, lv, lv]; C.step(DT, c, sea);
    if (Math.round(t * 60) % 60 === 0) console.log(t.toFixed(0), 'kias', C.kias.toFixed(0), 'vs', C.vel.y.toFixed(2), 'vsF', (C.apState.vsF ?? 0).toFixed(2), 'pitch', deg(C.pitch), 'a', deg(C.alpha), 'ele', deg(C.surf.ele), 'trim', C.trim.toFixed(2), 'I', C.apState.I.toFixed(3), 'Iq', C.apState.Iq.toFixed(3), 'tq', C.eng[0].torque.toFixed(0)); }
}
if (which === 'stall') {
  const A = air(120, 800, lb(120000), { flap: 0.5 });
  for (let t = 0; t < 25; t += DT) { A.step(DT, ctl({ pitch: t < 15 ? 1 : -0.3, throttle: [0, 0, 0, 0] }), sea); if (Math.round(t * 60) % 30 === 0) console.log(t.toFixed(1), 'kias', A.kias.toFixed(0), 'a', deg(A.alpha), 'b', deg(A.beta), 'bank', deg(A.bank), 'pitch', deg(A.pitch), 'sep', A.sep.toFixed(2), 'p', A.w.x.toFixed(2), 'r', A.w.z.toFixed(2)); }
}
if (which === 'to') {
  const A = createC130Sim().resetGround(0, 0, 0, 0); A.fuel = 12000; A.payload = lb(155000) - C130.EMPTY - A.fuel; A.flapSel = A.flap = 0.5; let lv = 0.5;
  for (let t = 0; t < 45; t += DT) { lv += (19600 - Math.max(...A.eng.map(e => e.torque))) * 3e-6; lv = Math.max(0, Math.min(1, lv)); const rot = A.kias > 105; A.step(DT, ctl({ throttle: [lv, lv, lv, lv], pitch: rot ? Math.max(-0.5, Math.min(1, (0.12 - A.pitch) * 5 - A.w.y * 3)) : -0.05 }), land);
    if (Math.round(t * 60) % 60 === 0) console.log(t.toFixed(0), 'x', (-A.pos.z * 4 * 3.28).toFixed(0), 'h', (A.pos.y - 2.62).toFixed(1), 'kias', A.kias.toFixed(0), 'pitch', deg(A.pitch), 'a', deg(A.alpha), 'ele', deg(A.surf.ele), 'wow', A.wow.map(v => v.toFixed(2)).join(','), 'Tc', A.Tc.toFixed(2), 'vs', A.vel.y.toFixed(1)); }
}
