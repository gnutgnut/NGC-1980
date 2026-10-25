import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { M151 } from '../../game/js/units/wheeled/m151.js';
const env = { g: 9.81, ground: (x, z, o) => { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = 0; o.vx = o.vy = o.vz = 0; return o; } };
const S = createVehicleSim(M151); S.reset([0, 0, 0], 0, { running: true, gear: 1 });
const dt = 1 / 60;
for (let i = 0; i < 180; i++) { S.step(dt, { throttle: 0.6, clutch: i < 30 ? 1 : 0.3, gear: 1 }, env);
 if (i % 15 === 0) console.log(i, 'kmh', S.kmh.toFixed(2), 'rpm', S.eng.rpm.toFixed(0), 'clTq', S.clutchTq?.toFixed(0), 'w', [...S.solver.w].map(v=>v.toFixed(2)).join(' '), 'Fx', S.wheels.map(w=>w.ts.Fx.toFixed(0)).join(' '), 'k', S.wheels.map(w=>w.ts.kappa.toFixed(3)).join(' ')); }
