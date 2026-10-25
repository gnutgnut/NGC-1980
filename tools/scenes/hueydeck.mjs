// The Huey left running on the ALBATROSS's deck while she zig-zags, at a low frame rate (CPU throttled SLOW=8 by
// default, ~6 fps): she must keep her spot (integ blocker 2: a stepped ship yaw rate threw her off; findings/commander2.md).
//   SLOW=8 CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/hueydeck.mjs
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.page.emulateCPUThrottling(+(process.env.SLOW || 8));
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 120000);
  await h.key('tap', 'KeyY'); await h.wait(500);
  await h.eval(`(window.__P = () => { const c = __G.war.carrier, s = __G.GR.toShip(c, __G.H.pos.x, __G.H.pos.y, __G.H.pos.z); return { t: Math.round(__G.war.time), alive: __G.Z.alive, death: __G.Z.lastDeath && __G.Z.lastDeath.why, lx: +s.x.toFixed(2), lz: +s.z.toFixed(2), ly: +s.y.toFixed(2), w: +(c.w||0).toFixed(3), yaw: +c.yaw.toFixed(2), spd: +c.speed.toFixed(1), ai: __G.heliAI.phase, landed: __G.H.landed, wp: __G.H.pos.toArray().map(Math.round), sp: c.p.toArray().map(Math.round), on: __G.war.shipAt(__G.H.pos.x, __G.H.pos.z) === c }; }, window.__p0 = __P(), __p0)`);
  for (let k = 0; k < 6; k++) {
    await h.eval(`(() => { const c = __G.war.carrier, a = c.yaw + (${k} % 2 ? -1.2 : 1.2); __G.war.orderCarrier(c.p.x - Math.sin(a) * 500, c.p.z - Math.cos(a) * 500); return 1; })()`);
    for (let j = 0; j < 5; j++) { await h.wait(6000); const r = await h.eval('__P()'); if (!r.alive) break; }
    if (!(await h.eval('__G.Z.alive'))) break;
  }
  await h.expect('__G.Z.alive && __G.war.shipAt(__G.H.pos.x, __G.H.pos.z) === __G.war.carrier && Math.hypot(__P().lx - window.__p0.lx, __P().lz - window.__p0.lz) < 1.5', 'the parked Huey kept her deck spot through the zig-zag');
  await h.shot('end');
}
