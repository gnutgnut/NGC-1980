// PARITY debug: the cobra sortie on the dev page, sampled every 5 s (no screenshots but the last)
export default async function (h) {
  await h.goto('dev/rotary.html?ac=cobra&paused&res=0.3'); await h.waitFor('window.__R', 15000); await h.wait(300);
  for (let t = 5; t <= 250; t += 5) {
    await h.eval(`(__R.run(5), (() => { const U = __R.unit.U, S = U.S; return [__R.simT.toFixed(0), U.phase, U.AI.mode, 'agl', S.agl.toFixed(0), 'd', Math.hypot(S.body.pos[0] - __R.unit.target.x, S.body.pos[2] - __R.unit.target.z).toFixed(0), 'gun', U.fired.gun, 'rk', U.fired.rockets, 'aimErr', U.aimErr.toFixed(2), 'fg', U.AI.fireGun, 'tok', U.AI.turretOk, 'hits', __R.unit.stats().hits, U.dead || ''].join(' '); })())`);
  }
  await h.shot('end');
}
