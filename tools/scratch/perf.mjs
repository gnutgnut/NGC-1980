import { createWheeledSim } from '../../game/js/units/wheeled/index.js';
import { makeEnv, ZONES, heightAt } from '../../game/dev/vehicle-ground.js';
const env = makeEnv({ g: 9.81 }), DT = 1 / 60;
for (const [label, o] of [['full (9 probes, 600 Hz)', {}], ['mid (5 probes, 600 Hz)', { probes: 5 }], ['far (1 probe, 240 Hz)', { probes: 1, sub: 1 / 240 }]]) {
  const out = [];
  for (const id of ['m151', 'm35', 'lada']) {
    const v = createWheeledSim(id, o); const z = ZONES.dirt; v.sim.reset([z.x, heightAt(z.x, z.z), z.z], z.yaw); v.sim.placeOnGround(env); v.driver.reset(v.sim);
    for (let k = 0; k < 60; k++) v.sim.step(DT, v.driver.update(v.sim, { throttle: 0.6 }, DT), env);
    const t0 = performance.now(); let n = 0;
    while (performance.now() - t0 < 1500) { v.sim.step(DT, v.driver.update(v.sim, { throttle: 0.6, steer: Math.sin(n / 60) * 0.3, steerAbs: true }, DT), env); n++; }
    const ms = (performance.now() - t0) / n;
    out.push(`${id} ${ms.toFixed(3)} ms/frame (${(ms / 16.67 * 100).toFixed(1)}% of a 60 Hz frame), ok ${isFinite(v.sim.pos[1]) && v.sim.up[1] > 0.5}`);
  }
  console.log(label.padEnd(26), out.join(' | '));
}
