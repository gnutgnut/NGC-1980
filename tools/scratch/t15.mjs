import { createWheeledSim } from '../../game/js/units/wheeled/index.js';
import { aiInput } from '../../game/js/units/wheeled/driver.js';
import { makeEnv, ZONES, heightAt } from '../../game/dev/vehicle-ground.js';
const DT = 1 / 60, env = makeEnv({ g: 9.81 });
const which = process.argv[2] || 'ramp';
function spawn(id, zone) { const v = createWheeledSim(id); const z = ZONES[zone]; v.sim.reset([z.x, heightAt(z.x, z.z), z.z], z.yaw, { running: true }); v.sim.placeOnGround(env); v.driver.reset(v.sim); return v; }
if (which === 'ramp') {
  const { sim, driver } = spawn('m151', 'slope60');
  for (let k = 0; k < 60 * 14; k++) {
    const c = driver.update(sim, { throttle: 1, fwd: true }, DT); c.fwd = true; const ev = sim.step(DT, c, env);
    if (k % 15 === 0 || ev.length) console.log((k * DT).toFixed(2), 'x', sim.pos[0].toFixed(2), 'y', sim.pos[1].toFixed(2), 'kmh', sim.kmh.toFixed(1), 'pitch', (sim.pitch * 57.3).toFixed(1), 'roll', (sim.roll * 57.3).toFixed(1), 'up', sim.up[1].toFixed(2), 'g', sim.gear, 'Fz', sim.wheels.map(w => (w.Fz / 1000).toFixed(1)).join(' '), 'pt', sim.wheels.map(w => w.pt ? 1 : 0).join(''), 'hull', sim.hullContact, 'rpm', sim.eng.rpm.toFixed(0), sim.eng.running, 'cl', c.clutch.toFixed(2), 'thr', c.throttle.toFixed(2), 'br', c.brake.toFixed(2), 'k', sim.wheels.map(w => w.ts.kappa.toFixed(2)).join(' '), 'nY', sim.wheels.map(w => w.ny.toFixed(2)).join(' '), ev.map(e => e.e).join());
    if (sim.pos[0] > 40) break;
  }
} else {
  const { sim, driver } = spawn('m35', 'bumps');
  for (let k = 0; k < 60 * 150; k++) {
    const a = aiInput(sim, { x: -12.5, z: -400 }, 2.8); a.range = 'L'; const c = driver.update(sim, a, DT); c.range = 'L'; const ev = sim.step(DT, c, env);
    if (k % 30 === 0) console.log((k * DT).toFixed(1), 'z', sim.pos[2].toFixed(2), 'kmh', sim.kmh.toFixed(1), 'g', sim.gear, 'rpm', sim.eng.rpm.toFixed(0), 'cl', c.clutch.toFixed(2), 'thr', c.throttle.toFixed(2), 'brk', c.brake.toFixed(2), 'le', driver.le.toFixed(2), 'Fz', sim.wheels.map(w => (w.Fz / 1000).toFixed(1)).join(' '), 'k', sim.wheels.map(w => w.ts.kappa.toFixed(2)).join(' '), ev.map(e => e.e).join());
    if (sim.pos[2] < -170) break;
  }
}
