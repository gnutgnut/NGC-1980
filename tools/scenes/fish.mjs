// SEALIFE (ngc/waterfish): fish, water clarity, the view under water.   [PARTS=look,fps,hull,wash,blast,under] node snap.mjs scenes/fish.mjs
// - the shallows off HOME ISLAND from above: sand through clear water, sea grass deeper, schools of fish
// - fps with the fish on and off (same camera, same frames)
// - a hull, the Huey's downwash and an explosion frighten / stun them
// - a Marine swims out, dives (hold C) and the camera goes under: fog, sea bed, the surface from below, fish
// Every wait is on GAME time (the sea's clock), not wall time: a headless build runs ~8 fps.
export default async function (h) {
  await h.goto('?debug&kb&peace&res=0.6&sea=3');
  await h.waitFor('window.__G', 20000);
  await h.key('tap', 'Enter'); await h.wait(1500);
  await h.waitFor("__G.G.state === 'play'", 15000);
  const parts = (process.env.PARTS || 'all').split(','), want = p => parts.includes(p) || parts.includes('all');
  // scripted camera (renderer.render patched: the camera that renders is what sealife reads), game-time waits, fps
  await h.eval(`(() => {
    const r = __G.renderer, orig = r.render.bind(r), T = __G.THREE, a = new T.Vector3(), b = new T.Vector3();
    r.render = (sc, cam) => { const C = window.__cam; if (C && cam === __G.zCam) { a.set(...C.p); b.set(...C.t); cam.position.copy(a); cam.up.set(0, 1, 0); cam.lookAt(b); cam.updateMatrixWorld(); } orig(sc, cam); };
    window.__gt = () => __G.war.sea.t;   // game seconds
    window.__until = s => { window.__gEnd = __gt() + s; return true; };
    window.__fps = (n = 120) => { window.__ft = []; window.__lt = performance.now(); (function f(t){ __ft.push(t - __lt); __lt = t; if (__ft.length < n) requestAnimationFrame(f); })(performance.now()); return true; };
    window.__fpsRes = () => { const a = __ft.slice(8).sort((x, y) => x - y), avg = a.reduce((s, x) => s + x, 0) / a.length; return { avgMs: +avg.toFixed(1), fps: +(1000 / avg).toFixed(2), p90: +a[Math.floor(a.length * 0.9)].toFixed(1), simMs: +__G.sealife.ms.toFixed(2), fish: __G.sealife.fishDrawn }; };
    const SL = __G.sealife, S = SL.sim;
    window.__fishNear = (x, z, r) => S.fish().filter(f => Math.hypot(f.x - x, f.z - z) < r);
    window.__mean = (a, k) => a.length ? a.reduce((s, f) => s + f[k], 0) / a.length : 0;
    // a spot off HOME ISLAND's east coast: the first water 2.5-4 m deep going out from the centre, and deep water further out
    const I = __G.ISLANDS[0]; let sh = null, dp = null;
    for (let d = 40; d < 260 && !dp; d += 1) { const x = I.x + d, z = I.z, hh = __G.terrainH(x, z); if (!sh && hh < -2.5 && hh > -4) sh = [x, z]; if (sh && hh < -11) dp = [x, z]; }
    window.__SH = sh; window.__DP = dp;
    // the Huey waits high and out of the way (it starts on the ALBATROSS)
    __G.H.reset(new T.Vector3(I.x - 60, 140, I.z - 120), 0, false, 1); __G.HI.setCollective(0.475);
    return { shallow: sh, deep: dp, hS: sh && __G.terrainH(...sh), hD: dp && __G.terrainH(...dp) };
  })()`);
  await h.expect('!!window.__SH && !!window.__DP', 'found a shallow shelf and deep water off HOME ISLAND');
  const waitGame = async (s, label) => { await h.eval(`__until(${s})`); await h.waitFor('__gt() >= window.__gEnd', 20000 + s * 4000); };

  if (want('look')) {
    // looking down on the shelf from 14 m: sand, sea grass, fish
    await h.eval(`(window.__cam = { p: [__SH[0] + 26, 12, __SH[1] + 12], t: [__SH[0] - 4, -2, __SH[1]] }, 1)`);
    await h.eval(`(() => { const S = __G.sealife.sim; S.spawnSchool('mullet', __SH[0] + 2, __SH[1]); S.spawnSchool('mullet', __SH[0] + 4, __SH[1] + 5); S.spawnSchool('sardine', __SH[0] + 18, __SH[1] + 6); S.spawnSchool('mackerel', __DP[0], __DP[1]); return 1; })()`);
    await waitGame(5);
    await h.eval(`({ schools: __G.sealife.sim.schools.map(s => [s.sp, s.n, +s.cx.toFixed(0), +s.cz.toFixed(0), +s.cy.toFixed(1)]), drawn: __G.sealife.fishDrawn, under: __G.sealife.under })`);
    await h.expect('__G.sealife.fishDrawn > 60 && __G.sealife.sim.schools.length >= 3', 'schools of fish round the camera');
    await h.expect('__fishNear(__SH[0], __SH[1], 60).length > 20', 'fish in the shallows by the camera');
    await h.expect('!__G.sealife.under', 'above water: not the underwater view');
    await h.shot('shallows-from-14m');
    await h.eval(`(window.__cam = { p: [__SH[0] + 9, 3.5, __SH[1] + 4], t: [__SH[0] - 2, -2.5, __SH[1]] }, 1)`);
    await waitGame(1.5);
    await h.shot('shallows-close');
    await h.eval(`(window.__cam = { p: [__SH[0] + 90, 40, __SH[1] + 70], t: [__SH[0] - 10, -3, __SH[1]] }, 1)`);
    await waitGame(1.5);
    await h.shot('coast-clarity-from-45m');
  }

  if (want('fps')) {
    // the same camera, fish on then off then on: the cost of the fish (draw + sim)
    await h.eval(`(window.__cam = { p: [__SH[0] + 26, 12, __SH[1] + 12], t: [__SH[0] - 4, -2, __SH[1]] }, __G.sealife.fishOn = true, 1)`);
    await waitGame(2);
    // alternating blocks (the machine is shared: one long block each way is at the mercy of other load); compare the
    // median block. Also the CPU side alone: sealife.ms (sim + threats + instance upload).
    await h.eval('(window.__blk = { on: [], off: [] }, 1)');
    for (const on of [true, false, true, false, true, false]) {
      await h.eval(`(__G.sealife.fishOn = ${on}, 1)`); await waitGame(on ? 2 : 0.5);
      await h.eval('__fps(50)'); await h.waitFor('__ft.length >= 50', 60000);
      await h.eval(`(__blk.${on ? 'on' : 'off'}.push(__fpsRes()), 1)`);
    }
    await h.eval('(__G.sealife.fishOn = true, 1)');
    await h.eval('(() => { const med = a => a.map(r => r.avgMs).sort((x, y) => x - y)[1]; window.__fpsCmp = { on: med(__blk.on), off: med(__blk.off), simMs: med(__blk.on.map(r => ({ avgMs: r.simMs }))), fish: __blk.on[0].fish }; __fpsCmp.costMs = +(__fpsCmp.on - __fpsCmp.off).toFixed(1); return { ...__fpsCmp, blocks: __blk }; })()');
    await h.expect('__fpsCmp.on < __fpsCmp.off * 1.1 + 3 && __fpsCmp.simMs < 4', 'the fish cost: median frame within ~10 % (software-rendered, shared machine), CPU under 4 ms');
  }

  if (want('hull')) {
    // a school right beside the ALBATROSS's hull: they get away from it
    await h.eval(`(() => { const c = __G.war.carrier, sx = c.p.x + Math.cos(c.yaw) * 30, sz = c.p.z - Math.sin(c.yaw) * 30; window.__HS = [sx, sz];
      window.__cam = { p: [c.p.x + Math.cos(c.yaw) * 70, 30, c.p.z - Math.sin(c.yaw) * 70], t: [sx, -3, sz] };
      const wl = c.parts.waterline || { hl: c.dims.L / 2, hw: c.dims.W * 0.4 }, o = wl.hw + 3; const s = __G.sealife.sim.spawnSchool('mackerel', c.p.x + Math.cos(c.yaw) * o, c.p.z - Math.sin(c.yaw) * o); window.__HSC = s; return { depth: -__G.terrainH(sx, sz), n: s && s.n, hw: wl.hw, hl: wl.hl, speed: c.speed }; })()`);
    await waitGame(1.5);
    await h.eval(`({ fear: +Math.max(...__G.sealife.sim.fish().filter(f => f.school === __HSC).map(f => f.fear)).toFixed(2), off: +(__mean(__G.sealife.sim.fish().filter(f => f.school === __HSC).map(f => ({ d: Math.hypot(f.x - __G.war.carrier.p.x, f.z - __G.war.carrier.p.z) })), 'd')).toFixed(1) })`);
    await h.expect('__G.sealife.sim.fish().filter(f => f.school === __HSC).some(f => f.fear > 0.3)', 'the hull frightens the school beside it');
    await h.shot('school-beside-albatross');
  }

  if (want('wash')) {
    // the Huey hovers low over a sardine school: they open out and go down
    await h.eval(`(() => { const S = __G.sealife.sim, x = __DP[0] - 20, z = __DP[1]; const s = S.spawnSchool('sardine', x, z); window.__WS = s;
      __G.H.reset(new __G.THREE.Vector3(s.cx, 8, s.cz), 0, false, 1); __G.HI.setCollective(0.52);
      window.__cam = { p: [x - 30, 18, z - 24], t: [x, -2, z] }; window.__w0 = { y: s.cy }; return { y0: +s.cy.toFixed(2) }; })()`);
    await waitGame(4);
    await h.eval(`({ agl: +__G.H.agl.toFixed(1), fear: +Math.max(...__G.sealife.sim.fish().filter(f => f.school === __WS).map(f => f.fear)).toFixed(2), y: +__WS.cy.toFixed(2), y0: +__w0.y.toFixed(2) })`);
    await h.expect('__G.sealife.sim.fish().filter(f => f.school === __WS).some(f => f.fear > 0.3)', 'the downwash frightens the school under the Huey');
    await h.shot('downwash-over-sardines');
    await h.eval(`(__G.H.reset(new __G.THREE.Vector3(__G.ISLANDS[0].x - 60, 140, __G.ISLANDS[0].z - 120), 0, false, 1), __G.HI.setCollective(0.475), 1)`);
  }

  if (want('blast')) {
    // a shell into a mackerel school: some stunned (belly up at the surface), a few killed; the rest flee
    await h.eval(`(() => { const S = __G.sealife.sim, x = __DP[0] + 10, z = __DP[1] + 20; const s = S.spawnSchool('mackerel', x, z); window.__BS = s;
      window.__cam = { p: [x - 5, 4, z - 4], t: [x, -0.5, z] }; return 1; })()`);
    await waitGame(2);
    await h.eval(`(__G.fx.explode(__BS.cx, 0.2, __BS.cz, 1.6), window.__cam = { p: [__BS.cx - 5, 4, __BS.cz - 4], t: [__BS.cx, -0.3, __BS.cz] }, 1)`);
    await waitGame(5);
    await h.eval(`({ stunned: __G.sealife.sim.fish().filter(f => f.school === __BS && f.stun > 0 && !f.dead).length, dead: __G.sealife.sim.fish().filter(f => f.school === __BS && f.dead).length, stats: __G.sealife.sim.stats })`);
    await h.expect('__G.sealife.sim.fish().filter(f => f.school === __BS && (f.stun > 0 || f.dead)).length > 3', 'the explosion stunned / killed fish (fx.explode reaches them)');
    await h.shot('stunned-fish-after-blast');
  }

  if (want('under')) {
    // a Marine in the water off the shelf; hold C: he dives and the camera goes under
    await h.eval(`(() => { const x = __DP[0] - 12, z = __DP[1] + 4; window.__cam = null; __G.toHeli();
      __G.foot.spawnAt({ x, y: -1.3, z, yaw: Math.PI / 2 }, { force: true }); __G.crafts.control('foot', 0, __G.crafts.active.id); if (__G.marine) { __G.marine.view = 'first'; __G.marine.aim(-Math.PI / 2, -0.15); }
      const S = __G.sealife.sim; S.spawnSchool('sardine', x + 9, z - 2); S.spawnSchool('amberjack', x + 14, z + 6); S.spawnSchool('mackerel', x + 6, z + 10);
      return { craft: __G.G.craft, depth: -__G.terrainH(x, z) }; })()`);
    await waitGame(2);
    await h.eval(`({ swim: __G.foot.W ? __G.foot.W.swim : null, y: __G.zCam.position.y, under: __G.sealife.under })`);
    await h.shot('swimmer-at-surface');
    await h.eval(`(__G.marine.input({ dive: true }), 1)`);
    await h.waitFor('__G.sealife.under && __G.sealife.camDepth > 1.5', 60000);
    await waitGame(2);
    await h.eval(`({ camY: +__G.zCam.position.y.toFixed(2), depth: +__G.sealife.camDepth.toFixed(2), bed: __G.sealife.bedReady, fish: __fishNear(__G.zCam.position.x, __G.zCam.position.z, 25).length, breath: __G.foot.W && __G.foot.W.breath })`);
    await h.expect('__G.sealife.under && __G.sealife.bedReady && __G.sealife.bedMesh.visible', 'under water: the view switches, the sea bed is built');
    await h.shot('underwater-diver');
    await h.eval(`(__G.marine.aim(-Math.PI / 2 + 0.3, 0.7), 1)`); await waitGame(1);
    await h.shot('underwater-looking-up');
    await h.eval(`(__G.marine.aim(-Math.PI / 2 - 0.2, -0.5), 1)`); await waitGame(1);
    await h.shot('underwater-looking-down');
    await h.eval('__fps(60)'); await h.waitFor('__ft.length >= 60', 60000);
    await h.eval('(window.__fpsUW = __fpsRes())');
    // let go: up again
    await h.eval(`(__G.marine.input({ dive: false }), 1)`);
    await h.waitFor('!__G.sealife.under', 60000);
    await h.expect('!__G.sealife.under && __G.sky ? true : !__G.sealife.under', 'back at the surface: the normal view');
    await h.shot('surfaced');
  }
}
