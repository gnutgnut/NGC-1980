// sweep the plow coefficient: sideways trip speeds per vehicle on grass / dirt / sand
import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { TYRE_TUNING, SURF } from '../../game/js/units/wheeled/tyre.js';
import { M151 } from '../../game/js/units/wheeled/m151.js';
import { M35 } from '../../game/js/units/wheeled/m35.js';
import { LANDROVER, HILUX, BEETLE, LADA } from '../../game/js/units/wheeled/civilian.js';
const G = 9.81, DT = 1 / 60;
function trip(spec, surf) {
  for (let v0 = 10; v0 <= 70; v0 += 5) {
    const env = { g: G, ground: (x, z, o) => { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = x > 0.5 ? surf : 0; o.vx = o.vy = o.vz = 0; return o; } };
    const S = createVehicleSim(spec); S.reset([-3, 0, 0], 0, { running: true });
    for (let k = 0; k < 30; k++) S.step(DT, { gear: 0, clutch: 0 }, env);
    S.vel[0] = v0 / 3.6; let rolled = false;
    for (let k = 0; k < 240; k++) { S.step(DT, { gear: 0, clutch: 1, brake: 0.3 }, env); if (S.up[1] < 0.2) { rolled = true; break; } }
    if (rolled) return v0;
  }
  return 0;
}
for (const k of process.argv.slice(2).map(Number)) {
  TYRE_TUNING.plowK = k; const out = [];
  for (const s of [M151, LANDROVER, M35, HILUX, BEETLE, LADA]) out.push(s.id + ' ' + [SURF.grass, SURF.dirt, SURF.sand].map(su => trip(s, su) || '>70').join('/'));
  console.log('plowK', k, '|', out.join('  '));
}
