import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { M151 } from '../../game/js/units/wheeled/m151.js';
import { M35 } from '../../game/js/units/wheeled/m35.js';
const G = 9.81, DT = 1 / 60, D2R = Math.PI / 180;
const spec = process.argv[2] === 'm35' ? M35 : M151;
const T = { th: 0 }, env = { g: G, ground: (x, z, o) => { const t = T.th; o.h = -x * Math.tan(t); o.nx = Math.sin(t); o.ny = Math.cos(t); o.nz = 0; o.surf = 6; o.mu = 2; o.vx = o.vy = o.vz = 0; return o; } };
const S = createVehicleSim(spec); S.reset([0, 0, 0], 0, { running: false });
for (let k = 0; k < 60; k++) S.step(DT, { handbrake: 1, brake: 1, gear: 1, clutch: 0 }, env);
for (let th = 0; th <= 60; th += 0.5) {
  T.th = th * D2R; for (let k = 0; k < 12; k++) S.step(DT, { handbrake: 1, brake: 1, gear: 1, clutch: 0 }, env);
  if (th % 5 === 0) console.log(th, 'Fz', S.wheels.map(w => w.Fz.toFixed(0)).join(' '), 's', S.wheels.map(w => w.s.toFixed(3)).join(' '), 'roll', (S.roll / D2R).toFixed(1), 'pos', S.pos.map(v => v.toFixed(2)).join(','), 'Fbx', S.wheels.map(w => w.Fbx.toFixed(0)).join(' '), 'jack', S.wheels.map(w => w.Fjack.toFixed(0)).join(' '), 'hull', S.hullContact, 'pt', S.wheels.map(w => w.pt ? 1 : 0).join(''));
}
