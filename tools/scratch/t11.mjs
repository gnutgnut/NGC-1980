import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { createDriver } from '../../game/js/units/wheeled/driver.js';
import { M151 } from '../../game/js/units/wheeled/m151.js';
import { LADA, BEETLE } from '../../game/js/units/wheeled/civilian.js';
const G = 9.81, DT = 1 / 60, D2R = Math.PI / 180;
const env = { g: G, ground: (x, z, o) => { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = 0; o.vx = o.vy = o.vz = 0; return o; } };
for (const spec of [M151, LADA, BEETLE]) for (const [kmh, st] of [[35, 0.3], [42, 0.3], [50, 0.25], [60, 0.2]]) {
  const S = createVehicleSim(spec); S.reset([0, 0, 0], 0, { running: true }); const D = createDriver(spec); D.reset(S);
  let t = 0;
  for (let k = 0; k < 60 * 18; k++) { t += DT; S.step(DT, D.update(S, { throttle: S.kmh < kmh ? 0.8 : 0.3, steer: t > 4 ? st : 0, steerAbs: true }, DT), env); }
  const r1 = Math.abs(S.yawRate), g1 = Math.abs(S.latG), b1 = Math.atan2(-(S.vel[0] * S.fwdv[2] - S.vel[2] * S.fwdv[0]), S.speed);
  let rMax = 0, bMax = 0; for (let k = 0; k < 90; k++) { S.step(DT, D.update(S, { throttle: 0, steer: st, steerAbs: true }, DT), env); rMax = Math.max(rMax, Math.abs(S.yawRate)); }
  console.log(spec.id.padEnd(8), kmh, 'steady', (r1 / D2R).toFixed(1), '°/s', g1.toFixed(2), 'g -> lift peak', (rMax / D2R).toFixed(1), 'ratio', (rMax / r1).toFixed(3), 'gear', S.gear);
}
