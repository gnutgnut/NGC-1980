import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { createDriver } from '../../game/js/units/wheeled/driver.js';
import { M35 } from '../../game/js/units/wheeled/m35.js';
import { LANDROVER } from '../../game/js/units/wheeled/civilian.js';
const G = 9.81, DT = 1 / 60, D2R = Math.PI / 180;
const env = { g: G, ground: (x, z, o) => { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = 0; o.vx = o.vy = o.vz = 0; return o; } };
for (const spec of [LANDROVER, M35]) {
  const S = createVehicleSim(spec); S.reset([0, 0, 0], 0, { running: true }); const D = createDriver(spec); D.reset(S);
  for (let k = 0; k < 60 * 30; k++) {
    const c = D.update(S, { throttle: S.kmh < 6 ? 0.3 : 0, brake: S.kmh > 8 ? 0.3 : 0, steer: 1, steerAbs: true }, DT); S.step(DT, c, env);
    if (k % 120 === 0) console.log(spec.id, k, 'v', S.speed.toFixed(2), 'yawr', S.yawRate.toFixed(3), 'R', (S.speed / S.yawRate).toFixed(2), 'gear', S.gear, 'cl', c.clutch.toFixed(2), 'rpm', S.eng.rpm.toFixed(0), 'steer', S.wheels.map(w => (w.steer / D2R).toFixed(1)).join(' '), 'alpha', S.wheels.map(w => (w.ts.alpha / D2R).toFixed(1)).join(' '), 'ev', S.events.map(e => e.e).join());
  }
}
