// M35 at the 20 cm kerb of the bump course, low range, AI: does it climb?
import { createWheeledSim } from '../../game/js/units/wheeled/index.js';
import { aiInput } from '../../game/js/units/wheeled/driver.js';
import { makeEnv, heightAt } from '../../game/dev/vehicle-ground.js';
const DT = 1 / 60, env = makeEnv({ g: 9.81 });
const x0 = +(process.argv[2] ?? -13.7), z0 = +(process.argv[3] ?? -118);
const v = createWheeledSim('m35'); const { sim, driver } = v;
sim.reset([x0, heightAt(x0, z0), z0], 0, { running: true }); sim.placeOnGround(env); driver.reset(sim);
for (let k = 0; k < 60 * 40; k++) {
  const a = aiInput(sim, { x: -12.5, z: -400 }, 2.8); const inp = { ...a, range: 'L' };
  const c = driver.update(sim, inp, DT); c.range = 'L'; const ev = sim.step(DT, c, env);
  if (k % 30 === 0) console.log((k * DT).toFixed(1), 'x', sim.pos[0].toFixed(1), 'z', sim.pos[2].toFixed(2), 'kmh', sim.kmh.toFixed(1), 'g', sim.gear, 'rpm', sim.eng.rpm.toFixed(0), 'thr', c.throttle.toFixed(2), 'cl', c.clutch.toFixed(2), 'br', c.brake.toFixed(2), 'N', sim.wheels.map(w => (w.N / 1000).toFixed(0)).join(' '), 'kap', sim.wheels.map(w => w.ts.kappa.toFixed(2)).join(' '), 'hull', sim.hullContact, 'clTq', (sim.clutchTq || 0).toFixed(0), ev.map(e => e.e).join());
  if (sim.pos[2] < -134) { console.log('over at', (k * DT).toFixed(1)); break; }
}
