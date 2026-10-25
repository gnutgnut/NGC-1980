import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { LADA } from '../../game/js/units/wheeled/civilian.js';
const G = 9.81, DT = 1 / 120;
const v0 = +(process.argv[2] || 20);
const env = { g: G, ground: (x, z, o) => { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = 0; o.vx = o.vy = o.vz = 0; return o; } };
const S = createVehicleSim(LADA); S.reset([-3, 0, 0], 0, { running: true });
for (let k = 0; k < 60; k++) S.step(DT, { gear: 0, clutch: 0 }, env);
S.vel[0] = v0 / 3.6;
for (let k = 0; k < 120; k++) {
  S.step(DT, { gear: 0, clutch: 1, brake: 0.3 }, env);
  if (k % 6 === 0) console.log((k * DT).toFixed(2), 'vx', S.vel[0].toFixed(2), 'roll', (S.roll * 57.3).toFixed(1), 'w', S.w.map(v => v.toFixed(2)).join(','), 's', S.wheels.map(w => w.s.toFixed(3)).join(' '), 'N', S.wheels.map(w => (w.N / 1000).toFixed(1)).join(' '), 'Fy', S.wheels.map(w => (w.ts.Fy / 1000).toFixed(1)).join(' '), 'vy', S.wheels.map(w => w.vy.toFixed(1)).join(' '), 'y', S.pos[1].toFixed(2));
}
