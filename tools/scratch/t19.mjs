import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { createDriver } from '../../game/js/units/wheeled/driver.js';
import { M151 } from '../../game/js/units/wheeled/m151.js';
const G = 9.81, DT = 1 / 60;
const env = { g: G, ground: (x, z, o) => { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = 0; o.vx = o.vy = o.vz = 0; return o; } };
const S = createVehicleSim(M151); S.reset([0, 0, 0], 0, { running: true }); const D = createDriver(M151); D.reset(S);
let t = 0;
for (let k = 0; k < 60 * 30; k++) {
  t += DT; const c = D.update(S, { throttle: S.kmh < 10 + t * 1.2 ? 0.5 : 0.2, steer: 0.25, steerAbs: true }, DT); S.step(DT, c, env);
  if (k % 60 === 0 && k > 300) console.log(t.toFixed(0), 'kmh', S.kmh.toFixed(1), 'latG', S.latG.toFixed(3), 'roll', (S.roll * 57.3).toFixed(2), 'grad', (S.roll * 57.3 / S.latG).toFixed(1), 's', S.wheels.map(w => w.s.toFixed(3)).join(' '), 'Fz', S.wheels.map(w => (w.Fz / 1000).toFixed(2)).join(' '), 'Fs', S.wheels.map(w => (w.Fs / 1000).toFixed(2)).join(' '), 'jack', S.wheels.map(w => w.Fjack.toFixed(0)).join(' '), 'y', S.pos[1].toFixed(3));
}
