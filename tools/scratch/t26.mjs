// cockpit scene drive step in node: spawn on the road, full throttle 4.5 s, then half throttle + steer
import { createWheeledSim } from '../../game/js/units/wheeled/index.js';
import { makeEnv, ZONES, heightAt } from '../../game/dev/vehicle-ground.js';
const DT = 1 / 60, env = makeEnv({ g: 9.81 });
const id = process.argv[2] || 'landrover', idle = +(process.argv[3] || 0);
const v = createWheeledSim(id, { mode: 'auto' }); const { sim, driver } = v; const z = ZONES.road;
sim.reset([z.x, heightAt(z.x, z.z), z.z], z.yaw, { running: true }); sim.placeOnGround(env); driver.reset(sim);
const IN = { throttle: 0, brake: 0, steer: 0, handbrake: 0, clutch: 0, fwd: false, range: 'H', lock: false, ignition: true, starter: false, horn: false, kit: false };
let t = 0;
const run = (sec, o) => { for (let k = 0; k < sec * 60; k++) { t += DT; const c = driver.update(sim, { ...IN, ...o }, DT); const ev = sim.step(DT, c, env); if (k % (+process.env.EVERY || 15) === 0) console.log(t.toFixed(2), 'kmh', sim.kmh.toFixed(1), 'g', sim.gear, 'rpm', sim.eng.rpm.toFixed(0), 'thr', c.throttle.toFixed(2), 'cl', c.clutch.toFixed(2), 'br', c.brake.toFixed(2), 'sh', driver.shift.toFixed(2), 'rev', driver.reverse, 'st', sim.wheels[0].steer?.toFixed?.(2), 'yawR', sim.yawRate?.toFixed?.(2), 'beta', (Math.atan2(sim.vel[0]*sim.fwdv[2]-sim.vel[2]*sim.fwdv[0], sim.vel[0]*sim.fwdv[0]+sim.vel[2]*sim.fwdv[2])*57.3).toFixed(0), 'kap', sim.wheels.map(w => w.ts.kappa.toFixed(2)).join(' '), 'al', sim.wheels.map(w => (w.ts.alpha*57.3).toFixed(0)).join(' '), 'Fz', sim.wheels.map(w => (w.Fz/1000).toFixed(1)).join(' '), 'roll', (sim.roll*57.3).toFixed(1), ev.map(e => e.e).join()); } };
run(idle, {});
run(4.5, { throttle: 1 });
run(+(process.argv[4] || 0.5), { throttle: +(process.argv[5] ?? 0.5), steer: 0.35 });
