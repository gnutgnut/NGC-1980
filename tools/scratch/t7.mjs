import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { M151 } from '../../game/js/units/wheeled/m151.js';
const G = 9.81, DT = 1 / 60, D2R = Math.PI / 180;
function tiltAngle(spec) {
  const T = { th: 0 }, env = { g: G, ground: (x, z, o) => { const t = T.th; o.h = -x * Math.tan(t); o.nx = Math.sin(t); o.ny = Math.cos(t); o.nz = 0; o.surf = 6; o.mu = 3; o.vx = o.vy = o.vz = 0; return o; } };
  const S = createVehicleSim(spec); S.reset([0, 0, 0], 0, { running: false });
  for (let k = 0; k < 60; k++) S.step(DT, { handbrake: 1, brake: 1, gear: 1, clutch: 0 }, env);
  for (let th = 0; th <= 70; th += 0.25) {
    T.th = th * D2R; for (let k = 0; k < 6; k++) S.step(DT, { handbrake: 1, brake: 1, gear: 1, clutch: 0 }, env);
    const up = S.wheels.filter(W => W.spec.x < 0);
    if (up.some(W => W.Fz < 50)) return th + ' first lift ' + up.map(w => w.Fz.toFixed(0)) + ' slide ' + S.pos[0].toFixed(2);
  }
}
const clone = o => JSON.parse(JSON.stringify(o));
const a = clone(M151); console.log('as is', tiltAngle(a));
const b = clone(M151); b.axles.forEach(x => x.rc = 0); console.log('rc 0', tiltAngle(b));
const c = clone(M151); c.axles.forEach(x => { x.rc = 0; x.freq *= 3; }); console.log('rc 0 stiff', tiltAngle(c));
