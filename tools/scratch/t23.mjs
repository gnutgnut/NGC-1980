// the browser sequence of wheeleddrive.mjs in node: dirt loop under AI with fwd, then teleport to slope60 and full throttle
import { createWheeledSim } from '../../game/js/units/wheeled/index.js';
import { aiInput } from '../../game/js/units/wheeled/driver.js';
import { makeEnv, ZONES, heightAt } from '../../game/dev/vehicle-ground.js';
const DT = 1 / 60, env = makeEnv({ g: 9.81 });
const v = createWheeledSim('m151'); const { sim, driver } = v;
const tp = z => { sim.reset([z.x, heightAt(z.x, z.z), z.z], z.yaw, { running: true }); sim.placeOnGround(env); driver.reset(sim); };
tp(ZONES.dirt);
for (let k = 0; k < 60 * 12; k++) { const a0 = Math.atan2(sim.pos[2] + 70, sim.pos[0] - 95) - 0.22; const a = aiInput(sim, { x: 95 + Math.cos(a0) * 50, z: -70 + Math.sin(a0) * 50 }, 11); a.fwd = true; const c = driver.update(sim, a, DT); c.fwd = true; sim.step(DT, c, env); }
tp(ZONES.slope60);
for (let k = 0; k < 60 * 12; k++) {
  const c = driver.update(sim, { throttle: 1, fwd: true }, DT); c.fwd = true; const ev = sim.step(DT, c, env);
  if (k % 20 === 0 || ev.some(e => e.e === 'scrape')) console.log((k * DT).toFixed(2), 'x', sim.pos[0].toFixed(2), 'kmh', sim.kmh.toFixed(1), 'pitch', (sim.pitch * 57.3).toFixed(1), 'g', sim.gear, 'rpm', sim.eng.rpm.toFixed(0), 'cl', c.clutch.toFixed(2), 'N', sim.wheels.map(w => (w.N / 1000).toFixed(1)).join(' '), 'k', sim.wheels.map(w => w.ts.kappa.toFixed(2)).join(' '), 'hull', sim.hullContact, ev.map(e => e.e).join());
  if (sim.pos[0] > 32) break;
}
