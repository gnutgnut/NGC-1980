import { createVehicleSim } from '../../game/js/units/wheeled/vehiclefm.js';
import { createDriver } from '../../game/js/units/wheeled/driver.js';
import { M35 } from '../../game/js/units/wheeled/m35.js';
const G = 9.81, DT = 1 / 60;
const g = 0.6, n = Math.hypot(g, 1), z0 = -1.5;
const env = { g: G, ground: (x, z, o) => { const up = z < z0; o.h = up ? (z0 - z) * g : 0; o.nx = 0; o.ny = up ? 1 / n : 1; o.nz = up ? g / n : 0; o.surf = 0; o.vx = o.vy = o.vz = 0; return o; } };
const S = createVehicleSim(M35); S.reset([0, 0, -1.5 + 1.955 + 0.45], 0, { running: true });
S.setLoad([{ kg: M35.payload.xc, at: M35.cargoAt, size: [2, 0.6, 3.5] }]);
const D = createDriver(M35); D.reset(S);
for (let k = 0; k < 60 * 30; k++) {
  const c = D.update(S, { throttle: 1, range: 'L', fwd: true }, DT); c.range = 'L'; c.fwd = true;
  S.step(DT, c, env);
  if (k % 30 === 0) console.log((k * DT).toFixed(1), 'z', S.pos[2].toFixed(2), 'v', S.speed.toFixed(2), 'g', S.gear + S.range, 'rpm', S.eng.rpm.toFixed(0), 'cl', c.clutch.toFixed(2), 'thr', c.throttle.toFixed(2), 'tq', (S.eng.tqInd - S.eng.fric).toFixed(0), 'boost', S.eng.boost.toFixed(2), 'Fz', S.wheels.map(w => w.Fz.toFixed(0)).join(' '), 'k', S.wheels.map(w => w.ts.kappa.toFixed(2)).join(' '), 'ev', S.events.map(e => e.e).join(), 'D', D.shift.toFixed(2), D.shiftTo, (D.t - D.lastShift).toFixed(1), 'wOut', S.solver.w[1].toFixed(2), 'cg', c.gear);
}
