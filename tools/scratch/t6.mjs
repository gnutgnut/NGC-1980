import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { M151 } from '../../game/js/units/wheeled/m151.js';
const G = 9.81, DT = 1 / 60, D2R = Math.PI / 180;
const T = { th: 0 }, env = { g: G, ground: (x, z, o) => { const t = T.th; o.h = -x * Math.tan(t); o.nx = Math.sin(t); o.ny = Math.cos(t); o.nz = 0; o.surf = 6; o.mu = 2; o.vx = o.vy = o.vz = 0; return o; } };
const S = createVehicleSim(M151); S.reset([0, 0, 0], 0, { running: false });
for (let k = 0; k < 60; k++) S.step(DT, { handbrake: 1, brake: 1, gear: 1, clutch: 0 }, env);
for (let th = 0; th <= 10; th += 0.5) { T.th = th * D2R; for (let k = 0; k < 12; k++) S.step(DT, { handbrake: 1, brake: 1, gear: 1, clutch: 0 }, env); }
for (let k = 0; k < 120; k++) S.step(DT, { handbrake: 1, brake: 1, gear: 1, clutch: 0 }, env);
const m = S.mass;
console.log('specific force (should be g up the plane normal):', S._acc.map(v => v.toFixed(3)), 'g*n', [Math.sin(10 * D2R) * G, Math.cos(10 * D2R) * G].map(v => v.toFixed(3)));
let fx = 0, fy = 0;
for (const W of S.wheels) { fx += W.Fz * W.nx; fy += W.Fz * W.ny; console.log(W.id, 'Fz', W.Fz.toFixed(0), 'n', W.nx.toFixed(3), W.ny.toFixed(3), 'Fbx', W.Fbx.toFixed(0), 'ts', W.ts.Fx.toFixed(0), W.ts.Fy.toFixed(0), 'vy', W.vy.toFixed(4), 'uy', W.ts.uy.toFixed(4)); }
console.log('normals world', fx.toFixed(0), fy.toFixed(0), 'mg', (m * G).toFixed(0), 'roll', (S.roll / D2R).toFixed(2), 'R row X', S.up);
