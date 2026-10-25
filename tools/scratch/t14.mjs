import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { createDriver } from '../../game/js/units/wheeled/driver.js';
import { BEETLE } from '../../game/js/units/wheeled/civilian.js';
const G = 9.81, DT = 1 / 60;
const depth = +(process.argv[2] || 0.6), z0 = -12;
const env = { g: G, ground: (x, z, o) => { o.h = z < z0 ? -depth : 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = 2; o.vx = o.vy = o.vz = 0; return o; }, water: (x, z) => z < z0 ? 0 : -Infinity };
const S = createVehicleSim(BEETLE); S.reset([0, 0, 0], 0, { running: true }); const D = createDriver(BEETLE); D.reset(S);
for (let k = 0; k < 60 * 30; k++) {
  const c = D.update(S, { throttle: S.kmh < 6 ? 0.45 : 0.1 }, DT); S.step(DT, c, env);
  if (k % 30 === 0) console.log((k * DT).toFixed(1), 'z', S.pos[2].toFixed(2), 'y', S.pos[1].toFixed(2), 'v', S.kmh.toFixed(1), 'run', S.eng.running, 'wet', S.eng.wet.toFixed(2), 'inW', S.inWater.toFixed(2), 'depth', S.depth.toFixed(2), 'ign', S.worldPoint(BEETLE.water.ignition).map(v => v.toFixed(2)).join(','), 'ev', S.events.map(e => e.e).join());
}
