import { createWheeledSim } from '../../game/js/units/wheeled/index.js';
import { makeEnv, ZONES, heightAt } from '../../game/dev/vehicle-ground.js';
import { SURF_NAMES } from '../../game/js/units/wheeled/tyre.js';
const env = makeEnv({ g: 9.81 }), DT = 1 / 60;
const id = process.argv[2] || 'lada';
const v = createWheeledSim(id); const z = ZONES.dirt; v.sim.reset([z.x, heightAt(z.x, z.z), z.z], z.yaw); v.sim.placeOnGround(env); v.driver.reset(v.sim);
let n = 0, rolled = false;
for (; n < 60 * 60; n++) {
  const steer = Math.sin(n / 60) * 0.3;
  const ev = v.sim.step(DT, v.driver.update(v.sim, { throttle: 0.6, steer, steerAbs: true }, DT), env);
  const S = v.sim;
  if (n % 60 === 0 || ev.some(e => e.e === 'rollover')) console.log((n * DT).toFixed(1), 'kmh', S.kmh.toFixed(1), 'v', Math.hypot(S.vel[0], S.vel[2]).toFixed(1), 'steer', steer.toFixed(2), 'roll', (S.roll * 57.3).toFixed(0), 'latG', S.latG.toFixed(2), 'yaw', (S.yawRate * 57.3).toFixed(0), 'surf', S.wheels.map(w => SURF_NAMES[w.surf][0]).join(''), 'plow', S.wheels.map(w => (w.ts.plow * 100).toFixed(1)).join(' '), 'slide', S.wheels.map(w => w.slide.toFixed(1)).join(' '), 'h', S.pos[1].toFixed(1), ev.map(e => e.e).join());
  if (ev.some(e => e.e === 'rollover')) { rolled = true; break; }
}
