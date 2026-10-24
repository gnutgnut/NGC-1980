// quick probe (not a test): the driver's periscopes looking down the home hard at the sea (the coloured band?)
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 30000);
  await h.eval(`(() => { const H = __G.HARDS.find(d => d.I === __G.HOME_B.isl), p = H.at(H.u1 - 5); __G.m60C.spawnAt({ x: p[0], z: p[1], yaw: H.yaw + Math.PI, state: 'hot' }); __G.crafts.control('m60', 0, 'foot'); return 1; })()`);
  await h.wait(3000); await h.shot('periscope-to-sea');
  await h.eval('(__G.m60C.fov = () => 14, 1)'); await h.wait(1500); await h.shot('periscope-to-sea-zoom');
  await h.eval('(__G.m60C.fov = ck => ck, __G.crafts.cycleSeat(2), __G.m60C.hatchWant.cupola = 0, 1)'); await h.wait(3000); await h.shot('commander-blocks-to-sea');
  await h.eval('(__G.crafts.cycleSeat(-1), 1)'); await h.wait(2500); await h.shot('gunner-sight-to-sea');
  await h.key('tap', 'KeyO'); await h.wait(2500); await h.shot('gunner-tts-to-sea');
}
