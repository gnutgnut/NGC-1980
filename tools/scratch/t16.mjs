import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { createDriver } from '../../game/js/units/wheeled/driver.js';
import { M35 } from '../../game/js/units/wheeled/m35.js';
const G = 9.81, DT = 1 / 60;
const env = { g: G, ground: (x, z, o) => { const s = x > 0 && z < -3 && z > -3.9; o.h = s ? 0.3 : 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = 2; o.vx = o.vy = o.vz = 0; return o; } };
const S = createVehicleSim(M35); S.reset([0, 0, 0], 0, { running: true }); const D = createDriver(M35); D.reset(S);
for (let k = 0; k < 60 * 14; k++) {
  const c = D.update(S, { throttle: S.kmh < 4 ? 1 : 0.3, range: 'L' }, DT); c.range = 'L'; S.step(DT, c, env);
  if (k % 30 === 0) console.log((k * DT).toFixed(1), 'z', S.pos[2].toFixed(2), 'kmh', S.kmh.toFixed(1), 'g', S.gear, 'rpm', S.eng.rpm.toFixed(0), 'cl', c.clutch.toFixed(2), 'thr', c.throttle.toFixed(2), 'Fz', S.wheels.map(w => (w.Fz / 1000).toFixed(1)).join(' '), 'Fx', S.wheels.map(w => (w.ts.Fx / 1000).toFixed(1)).join(' '), 'k', S.wheels.map(w => w.ts.kappa.toFixed(2)).join(' '), 'n', S.wheels.map(w => w.ny.toFixed(2)).join(' '), 'le', D.le.toFixed(2), 'clTq', (S.clutchTq||0).toFixed(0));
}
