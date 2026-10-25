// browser sequence of wheeleddrive.mjs step 4: M35 on the bump course under AI, low range
import { createWheeledSim } from '../../game/js/units/wheeled/index.js';
import { aiInput, createUnstick } from '../../game/js/units/wheeled/driver.js'; const U = createUnstick();
import { makeEnv, ZONES, heightAt } from '../../game/dev/vehicle-ground.js';
const DT = 1 / 60, env = makeEnv({ g: 9.81 });
const v = createWheeledSim('m35'); const { sim, driver } = v;
const z = { ...ZONES.bumps, yaw: +(process.argv[2] || 0), x: ZONES.bumps.x + +(process.argv[3] || 0) };
sim.reset([z.x, heightAt(z.x, z.z), z.z], z.yaw, { running: true }); sim.placeOnGround(env); driver.reset(sim);
for (let k = 0; k < 60 * 150; k++) {
  const a = U.update(sim, aiInput(sim, { x: -12.5, z: -400 }, 2.8)); const inp = { ...a, range: 'L' };
  const c = driver.update(sim, inp, DT); c.range = 'L'; const ev = sim.step(DT, c, env);
  if ((k % 60 === 0 && k * DT > 50 && k * DT < 150) || (k * DT > +(process.env.T0 || 1e9) && k * DT < +(process.env.T0 || 1e9) + 3 && k % 3 === 0)) console.log((k * DT).toFixed(1), 'x', sim.pos[0].toFixed(2), 'yaw', (Math.atan2(sim.fwdv[0], -sim.fwdv[2])*57.3).toFixed(1), 'z', sim.pos[2].toFixed(1), 'kmh', sim.kmh.toFixed(1), 'g', sim.gear, c.gear, 'rng', sim.range, U.state, 'rpm', sim.eng.rpm.toFixed(0), 'run', sim.eng.running, 'thr', c.throttle.toFixed(2), 'cl', c.clutch.toFixed(2), 'br', c.brake.toFixed(2), 'sh', driver.shift.toFixed(2), 'N', sim.wheels.map(w => (w.N / 1000).toFixed(0)).join(' '), 'hull', sim.hullContact, 'kap', sim.wheels.map(w => w.ts.kappa.toFixed(2)).join(' '), 'om', sim.wheels.map(w => w.omega.toFixed(1)).join(' '), 'pitch', (sim.pitch*57.3).toFixed(1), 'roll', (sim.roll*57.3).toFixed(1), 'y', sim.pos[1].toFixed(2), 'vel', sim.vel.map(a => a.toFixed(1)).join(' '), 'w', sim.w.map(a => a.toFixed(1)).join(' '), 's', sim.wheels.map(w => w.s.toFixed(2)).join(' '), 'dz', sim.wheels.map(w => (w.dz ?? w.defl ?? 0).toFixed?.(2)).join(' '), 'Fx', sim.wheels.map(w => ((w.Fx||0)/1000).toFixed(1)).join(' '), ev.map(e => e.e).join());
  if (sim.pos[2] < -160) { console.log('through at', (k * DT).toFixed(1)); break; }
}
