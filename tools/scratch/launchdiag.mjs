// diagnostic: the cockpit scene's launch in the browser, logged every 0.4 s
export default async function (h) {
  await h.goto('dev/vehicle.html?debug&ui=0&v=m151&zone=road&cam=cockpit');
  await h.waitFor('window.__V && __V.sim', 15000);
  await h.eval(`__V.setVehicle('landrover', {}, 'road').then(() => 1)`);
  for (const [y, p] of [[0, 0], [0.12, -0.42], [-0.35, -0.85], [0.9, -0.15], [-1.2, -0.1]]) { await h.eval(`(__V.cam('cockpit', { headYaw: ${y}, headPitch: ${p} }), 1)`); await h.wait(450); await h.shot('look'); }
  await h.eval(`({ simT: __V.sim._t, kmh: __V.sim.kmh, gear: __V.sim.gear, pos: __V.sim.pos, yaw: __V.sim.fwdv })`);
  await h.eval(`(window.__T0 = __V.sim._t, __V.drive({ throttle: 1, steer: 0.0 }), 1)`);
  for (let i = 0; i < 14; i++) {
    await h.wait(400);
    await h.eval(`({ simT: +(__V.sim._t - __T0).toFixed(2), kmh: +__V.sim.kmh.toFixed(1), gear: __V.sim.gear, rpm: Math.round(__V.sim.eng.rpm), cl: +__V.driver.ctl.clutch.toFixed(2), thr: +__V.driver.ctl.throttle.toFixed(2), br: +__V.driver.ctl.brake.toFixed(2), rev: __V.driver.reverse, sh: +__V.driver.shift.toFixed(2), le: +(__V.driver.le || 0).toFixed(2), hb: __V.driver.ctl.handbrake, kap: __V.sim.wheels.map(w => +w.ts.kappa.toFixed(2)), pitch: +(__V.sim.pitch * 57.3).toFixed(1) })`);
  }
}
