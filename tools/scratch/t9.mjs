import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { M151 } from '../../game/js/units/wheeled/m151.js';
const G = 9.81, DT = 1 / 60, D2R = Math.PI / 180;
const v0 = +(process.argv[2] || 60), surf = +(process.argv[3] ?? 3);
const env = { g: G, ground: (x, z, o) => { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = surf; o.vx = o.vy = o.vz = 0; return o; } };
const S = createVehicleSim(M151); S.reset([0, 0, 0], 0, { running: true });
for (let k = 0; k < 30; k++) S.step(DT, { gear: 0, clutch: 0 }, env);
const r0 = S.wheels[0].r, gear = 3;
S.vel[2] = -v0 / 3.6; for (const W of S.wheels) S.solver.w[4 + W.i] = v0 / 3.6 / W.r;
S.solver.w[2] = 4.86 * v0 / 3.6 / r0; S.solver.w[1] = S.solver.w[2]; S.solver.w[3] = S.solver.w[2]; S.solver.w[0] = S.solver.w[1] * 1.84; S.gear = gear;
for (let k = 0; k < 240; k++) {
  const t = k * DT; S.step(DT, { throttle: t < 0.2 ? 0.3 : 0, gear, clutch: 0, steer: Math.min(1, t / 0.3) }, env);
  if (k % 6 === 0) console.log(t.toFixed(2), 'roll', (S.roll / D2R).toFixed(1), 'latG', S.latG.toFixed(2), 'v', S.vel.map(v => v.toFixed(1)).join(','), 'hdg', (S.heading / D2R).toFixed(0), 'Fz', S.wheels.map(w => w.Fz.toFixed(0)).join(' '), 's', S.wheels.map(w => w.s.toFixed(2)).join(' '), 'plow', S.wheels.map(w => (w.ts.plow * 100).toFixed(1)).join(' '), 'Fy', S.wheels.map(w => w.ts.Fy.toFixed(0)).join(' '), 'y', S.pos[1].toFixed(2), 'hull', S.hullContact);
}
