// TERRAIN (wave 3): frame time over the islands from fixed viewpoints, so builds before / after a terrain change compare
// like for like (uses only __G.terrainH, H, HI, renderer: runs on older builds too).   node snap.mjs scenes/terrainfps.mjs
// Views: low over HOME ISLAND's north-east shore (the fine grid in view), 180 m over it, a low pass along CITADEL, and
// the game's own chase camera hovering at the home pad. Each: 120 frames, mean / p90 ms, triangles and draw calls.
export const query = '?debug&kb&peace&res=0.45';
export default async function (h) {
  await h.goto(query);
  await h.waitFor('window.__G', 20000);
  await h.key('tap', 'Enter'); await h.wait(1200);
  await h.waitFor("__G.G.state === 'play'", 10000);
  await h.eval(`(() => {
    const r = __G.renderer, orig = r.render.bind(r), T = __G.THREE, a = new T.Vector3(), b = new T.Vector3();
    r.render = (sc, cam) => { const C = window.__cam; if (C) { a.set(...C.wp); b.set(...C.wt); cam.position.copy(a); cam.up.set(0, 1, 0); cam.lookAt(b); cam.updateMatrixWorld(); } orig(sc, cam); };
    window.__shot = (wp, wt) => { window.__cam = { wp, wt }; __G.H.reset(new T.Vector3(wp[0], Math.max(wp[1], __G.terrainH(wp[0], wp[2])) + 40, wp[2]), 0, false, 1); __G.HI.setCollective(0.475); };
    return 1; })()`);
  const out = [];
  const fps = async (label) => {
    await h.wait(2500);
    await h.eval(`(window.__ft = [], window.__lt = performance.now(), (function f(t) { __ft.push(t - __lt); __lt = t; if (__ft.length < 125) requestAnimationFrame(f); })(performance.now()), 1)`);
    await h.waitFor('window.__ft.length >= 125', 90000);
    const r = await h.eval(`(() => { const a = __ft.slice(5).sort((x, y) => x - y), avg = a.reduce((s, x) => s + x, 0) / a.length; return { view: '${label}', avgMs: +avg.toFixed(1), fps: +(1000 / avg).toFixed(1), p90: +a[Math.floor(a.length * 0.9)].toFixed(1), tris: __G.renderer.info.render.triangles, calls: __G.renderer.info.render.calls, sim: +__G.PROF.sim.toFixed(1), prep: +__G.PROF.prep.toFixed(1), render: +__G.PROF.render.toFixed(1) }; })()`);
    out.push(r); await h.shot(label.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
  };
  await h.eval(`(__shot([-336, 6, 475], [-396, 4, 421]), 1)`); await fps('low over the home shore');
  await h.eval(`(__shot([-336, 180, 475], [-396, 0, 421]), 1)`); await fps('180 m over home island');
  await h.eval(`(__shot([-150, 12, 40], [0, 6, 0]), 1)`); await fps('low pass at citadel');
  await h.eval(`(window.__cam = null, __G.H.reset(new __G.THREE.Vector3(__G.HOME_B.x + 12, 30, __G.HOME_B.z + 24), 0, false, 1), __G.HI.setCollective(0.47), 1)`); await fps('chase cam hovering at home');
  h.log('FPS ' + JSON.stringify(out));
}
