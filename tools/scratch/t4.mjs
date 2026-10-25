import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { createDriver } from '../../game/js/units/wheeled/driver.js';
import { M151 } from '../../game/js/units/wheeled/m151.js';
const G = 9.81, DT = 1 / 60;
const grade = (g, surf = 0, z0 = -2) => { const n = Math.hypot(g, 1); return { g: G, ground: (x, z, o) => { const up = z < z0; o.h = up ? (z0 - z) * g : 0; o.nx = 0; o.ny = up ? 1 / n : 1; o.nz = up ? g / n : 0; o.surf = surf; o.vx = o.vy = o.vz = 0; return o; } }; };
const S = createVehicleSim(M151); S.reset([0, 0, 0], 0, { running: true, fwd: true });
const D = createDriver(M151); D.reset(S);
const env = grade(0.6, 0, -1.5);
for (let k = 0; k < 600; k++) {
  const c = D.update(S, { throttle: 1, fwd: true }, DT); c.fwd = true;
  S.step(DT, c, env);
  if (k % 20 === 0 || !isFinite(S.pos[1])) console.log(k, S.pos.map(v => v.toFixed(2)).join(','), 'v', S.speed.toFixed(2), 'g', S.gear, 'rpm', S.eng.rpm.toFixed(0), 'cl', c.clutch.toFixed(2), 'Fz', S.wheels.map(w => w.Fz.toFixed(0)).join(' '), 'hull', S.hullContact);
  if (!isFinite(S.pos[1])) break;
}
const S2 = createVehicleSim(M151); S2.reset([0, 0, 0], 0, { running: false });
for (let k = 0; k < 120; k++) { S2.step(DT, { starter: true, ignition: true, gear: 0, clutch: 0, throttle: 0 }, { g: G, ground: grade(0).ground }); if (k % 10 === 0) console.log('start', k, S2.eng.rpm.toFixed(0), S2.eng.running, S2.eng.starter, S2.eng.crank.toFixed(2), S2.battery); }
