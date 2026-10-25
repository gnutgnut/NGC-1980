import { createWheeledSim } from '../../game/js/units/wheeled/index.js';
import { aiInput } from '../../game/js/units/wheeled/driver.js';
import { makeEnv, heightAt } from '../../game/dev/vehicle-ground.js';
const DT = 1 / 60, env = makeEnv({ g: 9.81 });
const v = createWheeledSim('m35'); const { sim, driver } = v;
sim.reset([-12.5, heightAt(-12.5, -118), -118], 0, { running: true }); sim.placeOnGround(env); driver.reset(sim);
const hullHits = () => { const out = []; for (const p of sim.spec.hull) { const w = sim.worldPoint(p); const g = env.ground(w[0], w[2], {}); if (g.h > w[1]) out.push(p.map(v => +v.toFixed(2)).join(',') + ' d' + (g.h - w[1]).toFixed(2)); } return out; };
for (let k = 0; k < 60 * 30; k++) {
  const a = aiInput(sim, { x: -12.5, z: -400 }, 2.8); a.range = 'L'; const c = driver.update(sim, a, DT); c.range = 'L'; sim.step(DT, c, env);
  if (k % 30 === 0) console.log((k * DT).toFixed(1), 'z', sim.pos[2].toFixed(2), 'y', sim.pos[1].toFixed(2), 'pitch', (sim.pitch * 57.3).toFixed(1), 'roll', (sim.roll * 57.3).toFixed(1), 'kmh', sim.kmh.toFixed(1), 'g', sim.gear, 'Fz', sim.wheels.map(w => (w.Fz / 1000).toFixed(0)).join(' '), 's', sim.wheels.map(w => w.s.toFixed(2)).join(' '), 'hull', sim.hullContact, hullHits().join(' | '));
}
