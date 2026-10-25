import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { M151 } from '../../game/js/units/wheeled/m151.js';
import { LADA, LANDROVER, BEETLE, HILUX } from '../../game/js/units/wheeled/civilian.js';
import { M35 } from '../../game/js/units/wheeled/m35.js';
const G = 9.81, DT = 1 / 60, D2R = Math.PI / 180;
function slide(spec, v0, surf) {
  const env = { g: G, ground: (x, z, o) => { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = x > 0.5 ? surf : 0; o.vx = o.vy = o.vz = 0; return o; } };
  const S = createVehicleSim(spec); S.reset([-3, 0, 0], 0, { running: true });
  for (let k = 0; k < 30; k++) S.step(DT, { gear: 0, clutch: 0 }, env);
  S.vel[0] = v0 / 3.6;   // sliding to its right, off the tarmac onto the soft verge
  let maxRoll = 0, rolled = false;
  for (let k = 0; k < 240; k++) { S.step(DT, { gear: 0, clutch: 1, brake: 0.3 }, env); maxRoll = Math.max(maxRoll, Math.abs(S.roll)); if (S.up[1] < 0.2) rolled = true; }
  return { maxRoll: maxRoll / D2R, rolled };
}
for (const spec of [M151, LANDROVER, HILUX, BEETLE, LADA, M35]) {
  const out = [];
  for (const surf of [3, 2, 4]) { let vr = 0; for (let v = 10; v <= 60; v += 5) { const r = slide(spec, v, surf); if (r.rolled) { vr = v; break; } } out.push(['grass', 'dirt', 'sand'][[3, 2, 4].indexOf(surf)] + ' ' + (vr || '>60')); }
  console.log(spec.id.padEnd(10), out.join('  '));
}
