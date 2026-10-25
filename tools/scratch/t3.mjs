import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { createDriver } from '../../game/js/units/wheeled/driver.js';
import { M151 } from '../../game/js/units/wheeled/m151.js';
import { M35 } from '../../game/js/units/wheeled/m35.js';
import { CIVILIANS } from '../../game/js/units/wheeled/civilian.js';
const env = { g: 9.81, ground: (x, z, o) => { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = 0; o.vx = o.vy = o.vz = 0; return o; } };
for (const spec of [M151, M35, ...Object.values(CIVILIANS)]) {
  const S = createVehicleSim(spec); S.reset([0, 0, 0], 0, { running: true });
  const D = createDriver(spec, 'auto'); D.reset(S);
  const dt = 1 / 60;
  for (let i = 0; i < 120; i++) S.step(dt, D.update(S, {}, dt), env);
  const st = `y ${S.pos[1].toFixed(3)} pitch ${(S.pitch * 57.3).toFixed(2)} s ${S.wheels.map(w => w.s.toFixed(3)).join(',')}`;
  let t = 0, t60 = 0, t100 = 0;
  for (let i = 0; i < 60 * 90; i++) { const c = D.update(S, { throttle: 1 }, dt); S.step(dt, c, env); t += dt; if (!t60 && S.kmh >= 60) t60 = t; if (!t100 && S.kmh >= 100) t100 = t; }
  console.log(spec.id.padEnd(10), st, '| 0-60', t60.toFixed(1), '0-100', t100.toFixed(1), 'vmax', S.kmh.toFixed(1), 'rpm', S.eng.rpm.toFixed(0), 'gear', S.gear, 'fuel L/h', (S.eng.fuelFlow * 3600 / 0.74).toFixed(1), 'ev', S.events.map(e => e.e).join());
}
