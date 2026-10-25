import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { createDriver } from '../../game/js/units/wheeled/driver.js';
import { M35 } from '../../game/js/units/wheeled/m35.js';
import { M151 } from '../../game/js/units/wheeled/m151.js';
const G = 9.81, DT = 1 / 60;
const which = process.argv[2] || 'm35';
let env, spec, inp;
if (which === 'm35') { spec = M35; env = { g: G, ground: (x, z, o) => { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = 0; o.vx = o.vy = o.vz = 0; return o; } }; inp = S => ({ throttle: S.kmh < 40 ? 0.5 : 0.25 }); }
else { spec = M151; const g = 0.12, n = Math.hypot(g, 1), z0 = -1.5; env = { g: G, ground: (x, z, o) => { const up = z < z0; o.h = up ? (z0 - z) * g : 0; o.nx = 0; o.ny = up ? 1 / n : 1; o.nz = up ? g / n : 0; o.surf = 5; o.vx = o.vy = o.vz = 0; return o; } }; inp = S => ({ throttle: 0.8, fwd: true }); }
const S = createVehicleSim(spec); S.reset([0, 0, 0], 0, { running: true, fwd: true });
const D = createDriver(spec); D.reset(S);
for (let k = 0; k < 60 * 25; k++) {
  const c = D.update(S, inp(S), DT); if (which !== 'm35') c.fwd = true;
  S.step(DT, c, env);
  if (k % 30 === 0) console.log((k * DT).toFixed(1), 'z', S.pos[2].toFixed(2), 'v', S.kmh.toFixed(1), 'g', S.gear, 'rpm', S.eng.rpm.toFixed(0), 'cl', c.clutch.toFixed(2), 'le', D.le.toFixed(2), 'thr', c.throttle.toFixed(2), 'brk', c.brake.toFixed(2), 'tq', (S.eng.tqInd - S.eng.fric).toFixed(0), 'k', S.wheels.map(w => w.ts.kappa.toFixed(2)).join(' '), 'sink', S.wheels.map(w => (w.ts.sink * 100).toFixed(0)).join(' '), 'spr', (S.spragTq || 0).toFixed(0));
}
