import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { createDriver } from '../../game/js/units/wheeled/driver.js';
import { M151 } from '../../game/js/units/wheeled/m151.js';
const env = { g: 9.81, ground: (x, z, o) => { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = 0; o.vx = o.vy = o.vz = 0; return o; } };
const S = createVehicleSim(M151); S.reset([0, 0, 0], 0, { running: true });
const D = createDriver(M151, 'auto'); D.reset(S);
const dt = 1 / 60;
for (let i = 0; i < 120; i++) S.step(dt, D.update(S, {}, dt), env);
console.log('static', S.pos.map(v => v.toFixed(3)), 'wheels s', S.wheels.map(w => w.s.toFixed(3) + '/' + w.Fz.toFixed(0)), 'rpm', S.eng.rpm.toFixed(0));
let t = 0, t60 = 0;
for (let i = 0; i < 60 * 60; i++) { const c = D.update(S, { throttle: 1 }, dt); S.step(dt, c, env); t += dt; if (!t60 && S.kmh >= 60) t60 = t;
  if (i % 60 === 0) console.log(t.toFixed(0), 'kmh', S.kmh.toFixed(1), 'rpm', S.eng.rpm.toFixed(0), 'gear', S.gear, 'clutch', c.clutch.toFixed(2), 'pitch', (S.pitch*57.3).toFixed(1), 'ev', S.events.map(e=>e.e).join(','), 'fuel', S.eng.fuelFlow.toFixed(4), 'y', S.pos[1].toFixed(3)); }
console.log('0-60', t60.toFixed(1), 'vmax', S.kmh.toFixed(1));
