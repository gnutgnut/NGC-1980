import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { createDriver } from '../../game/js/units/wheeled/driver.js';
import { M151 } from '../../game/js/units/wheeled/m151.js';
const G = 9.81, DT = 1 / 60;
const env = { g: G, ground: (x, z, o) => { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = 0; o.vx = o.vy = o.vz = 0; return o; } };
const S = createVehicleSim(M151); S.reset([0, 0, 0], 0, { running: true }); const D = createDriver(M151, 'semi'); D.reset(S);
let t = 0;
const line = tag => console.log(tag, t.toFixed(2), 'kmh', S.kmh.toFixed(1), 'k', (Math.abs(S.yawRate) / Math.max(1, Math.abs(S.speed))).toFixed(4), 'latG', S.latG.toFixed(2), 'lonG', S.lonG.toFixed(2), 's', S.wheels.map(w => w.s.toFixed(3)).join(' '), 'toe', S.wheels.map(w => ((w.toe || 0) * 57.3).toFixed(2)).join(' '), 'Fz', S.wheels.map(w => (w.Fz / 1000).toFixed(2)).join(' '), 'al', S.wheels.map(w => (w.ts.alpha * 57.3).toFixed(1)).join(' '), 'kap', S.wheels.map(w => w.ts.kappa.toFixed(3)).join(' '));
for (let k = 0; k < 60 * 18; k++) { t += DT; S.step(DT, D.update(S, { throttle: S.kmh < 35 ? 0.8 : 0.3, steer: t > 4 ? 0.3 : 0, steerAbs: true, gear: t < 2 ? 1 : t < 5 ? 2 : 3 }, DT), env); }
line('before');
for (let k = 0; k < 120; k++) { t += DT; S.step(DT, D.update(S, { throttle: 0, brake: +(process.argv[2] || 0.25), steer: 0.3, steerAbs: true, gear: 3 }, DT), env); if (k % 15 === 0) line('lift  '); }
