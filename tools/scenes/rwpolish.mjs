// RUNAWAY ground units + ground war POLISH (ngc/rwground-polish), in the real game:
//   1. a fight on SANDBAR (eight STRIDERs vs a reinforced Marine squad): tracers from the air (red-orange ours, cyan
//      theirs), the minimap's ground units and CONTACT ring;
//   2. the far level of detail: the instanced STRIDER stand-ins close up (LOD forced to 5 m for the picture) and the
//      draw calls of the same view with and without them;
//   3. damage states and wrecks: a STRIDER with an arm shot off (stump + sparks), a smoking RW-7 with a dead fan, burnt-
//      out RW-7 and MBT wrecks (one MBT's turret thrown);
//   4. the machines react to a helicopter working them over (cover from it, disperse);
//   5. the big map with the ground war on it.
//     node snap.mjs scenes/rwpolish.mjs
const HOOK = `(() => { const G = __G, T = G.THREE, r = G.renderer, cam = new T.PerspectiveCamera(50, 1, 0.3, 2500), orig = r.render.bind(r);
  const t = new T.Vector3(), p = new T.Vector3();
  r.render = (s, c) => {
    const m = window.__cam; if (c !== G.zCam || !m || (!m.follow && !m.at)) return orig(s, c);
    if (m.follow) { const u = m.follow; t.set(u.x ?? u.p.x, (u.y ?? u.p.y) + (m.ty ?? 1.2), u.z ?? u.p.z); p.set(t.x + Math.sin(m.yaw) * m.d, t.y + m.h, t.z + Math.cos(m.yaw) * m.d); }
    else { p.set(...m.at); t.set(...m.look); }
    { const gy = Math.max(G.terrainH(p.x, p.z), 0); if (p.y < gy + 1.2) p.y = gy + 1.2; }
    cam.position.copy(p); cam.up.set(0, 1, 0); cam.lookAt(t); cam.aspect = c.aspect; cam.updateProjectionMatrix();
    G.zCam.position.copy(p);
    const out = orig(s, cam); window.__calls = r.info.render.calls; return out;
  };
  window.__ff = (secs, dt = 1 / 30, until) => { const W = G.war; for (let i = 0; i < secs / dt; i++) { W.update(dt, G.PL, !!window.__peace); G.fx.update(dt); if (until && until()) return true; } return false; };
  window.__gs = () => G.war.ground.sim;
  return true; })()`;
export default async function (h) {
  await h.goto('?debug&kb&res=0.45');
  await h.waitFor('window.__G', 10000); await h.wait(500);
  await h.key('tap', 'Enter'); await h.waitFor(`__G.G.state === 'play'`, 10000); await h.wait(1200);
  await h.eval(HOOK);
  await h.eval(`(() => { const I = __G.ISLANDS.find(i => i.name === 'SANDBAR'); window.__I = I; const W = __G.war;
    W.E.mat = 0; W.transT = 1e9; __G.G.bench = true;
    const x = I.pad.x - 22, z = I.pad.z + 14; __G.H.reset(new __G.THREE.Vector3(x, __G.terrainH(x, z) + 1.9, z), 0.6, true, 1); __G.HI.setCollective(0);
    W.ground.godPlayer = true; return { pad: [I.pad.x, I.pad.z], r: I.r }; })()`);
  // (flat dry ground round the pad, away from the fight: r0 out from the pad, searching round from angle a0)
  await h.eval(`(window.__spot = (r0, a0) => { const I = __I; for (let r = r0; r < r0 + 60; r += 4) for (let k = 0; k < 24; k++) { const a = a0 + k / 24 * 6.283, x = I.pad.x + Math.cos(a) * r, z = I.pad.z + Math.sin(a) * r, y = __G.terrainH(x, z); if (y > 1.2 && Math.abs(__G.terrainH(x + 7, z) - y) < 1.6 && Math.abs(__G.terrainH(x, z + 7) - y) < 1.6 && Math.abs(__G.terrainH(x - 7, z) - y) < 1.6 && !I.structs.some(s => Math.hypot(s.x - x, s.z - z) < 12)) return [x, z]; } return [I.pad.x, I.pad.z]; }, true)`);
  // ---- 1. the fight: machines dug in round the pad, Marines coming in from the far side
  await h.eval(`(() => { const W = __G.war, GW = W.ground, I = __I;
    window.__R = GW.addSquad(2, I, 8, I.pad.x + 12, I.pad.z - 6, { order: { type: 'defend', x: I.pad.x, z: I.pad.z, r: 25 } });
    const mp = __spot(36, 2.64); window.__M = GW.addSquad(1, I, 13, mp[0], mp[1]);
    return { rw: __R.members.length, mar: __M.members.length }; })()`);
  await h.eval(`__ff(90, 1 / 30, () => __gs().proj.length > 6)`);
  await h.eval(`(window.__cam = { at: [__I.pad.x - 70, __I.pad.h + 45, __I.pad.z + 60], look: [__I.pad.x - 15, __I.pad.h, __I.pad.z + 10] }, __ff(20, 1 / 30, () => __gs().proj.length > 8), { tracers: __G.war.ground.GFX.tracers, proj: __gs().proj.length })`);
  await h.wait(250);
  await h.expect(`__G.war.ground.GFX.tracers > 0 || __gs().proj.length > 0`, 'rounds in the air over the fight (tracers drawn)');
  await h.shot('fight-tracers-air');
  await h.eval(`(() => { window.__cam = { at: [__I.pad.x - 40, __I.pad.h + 14, __I.pad.z + 40], look: [__I.pad.x, __I.pad.h + 1, __I.pad.z] }; __ff(20, 1 / 30, () => __gs().proj.length > 8); return { tracers: __G.war.ground.GFX.tracers, proj: __gs().proj.length }; })()`);
  await h.wait(250);
  await h.shot('fight-tracers-low');
  // (the look, controlled: bursts both ways across the pad - an M60's belt and a coil carbine's darts - every round a
  // tracer, photographed in flight)
  await h.eval(`(() => { const GS = __gs(), I = __I, gy = I.pad.h + 1.5, a = { id: -1, B: null }, b = { id: -2, B: null };
    for (let i = 0; i < 18; i++) { const k = i / 18;
      GS.shoot(1, a, 'm60', [I.pad.x - 30, gy, I.pad.z + 20], [I.pad.x + 300, gy + 6 + k * 10, I.pad.z - 120 + k * 40], 0.004).tr = true;
      GS.shoot(2, b, 'needle', [I.pad.x + 20, gy, I.pad.z - 20], [I.pad.x - 300, gy + 4 + k * 8, I.pad.z + 200 - k * 60], 0.004).tr = true; }
    for (const p of GS.proj) if (p.src < 0) { const t = Math.random() * 0.25; p.x += p.vx * t; p.y += p.vy * t; p.z += p.vz * t; }
    window.__cam = { at: [I.pad.x - 10, I.pad.h + 35, I.pad.z + 70], look: [I.pad.x, I.pad.h, I.pad.z] };
    window.__wu = __G.war.update; __G.war.update = () => {};   // (the war held still for the photograph)
    __G.zCam.position.set(...window.__cam.at); __G.war.ground.GFX.tracersUpdate(__G.zCam.position); return { proj: GS.proj.length, tracers: __G.war.ground.GFX.tracers }; })()`);
  await h.wait(600);
  await h.shot('tracers-controlled');
  await h.eval(`(__G.war.update = window.__wu, true)`);
  // ---- 2. far LOD: the stand-ins close up, then the draw calls with and without them
  await h.eval(`(() => { const GW = __G.war.ground; GW.T.LOD_STRIDER = 5; const s = __gs().units.find(u => u.kind === 'strider' && u.alive); window.__s = s; window.__cam = { follow: s, yaw: 2.4, d: 11, h: 2.5 }; return true; })()`);
  await h.wait(1500);
  await h.expect(`__G.war.ground.LOD.count > 0`, 'the far STRIDERs are drawn by the instanced stand-ins');
  await h.shot('lod-standins-close');
  await h.eval(`(() => { window.__peace = true; window.__cam = { at: [__I.pad.x - 180, __I.pad.h + 60, __I.pad.z + 160], look: [__I.pad.x, __I.pad.h, __I.pad.z] }; return true; })()`);
  await h.wait(1500);
  await h.eval(`(window.__callsLOD = window.__calls, __G.war.ground.T.LOD_STRIDER = 1e9, true)`);
  await h.wait(1500);
  await h.eval(`(() => { window.__callsFull = window.__calls; __G.war.ground.T.LOD_STRIDER = 160; return { lod: __callsLOD, full: __callsFull, lodCount: __G.war.ground.LOD.count }; })()`);
  await h.expect(`__callsLOD < __callsFull`, 'fewer draw calls with the far STRIDERs instanced');
  await h.eval(`window.__peace = false`);
  // ---- 3. damage states and wrecks (on the island's quiet side)
  await h.eval(`(() => { const GS = __gs(), I = __I, B = GS.battle(I), sp = [__spot(26, 0.5), __spot(26, 1.6), __spot(26, 2.7), __spot(30, 3.8)];
    const m = sp.slice(0, 3).map((p, k) => GS.addMBT(k % 2 ? 't90m' : 'm1a2', B, p[0], p[1], 0.3 + k)), hv = GS.addHover(B, sp[3][0], sp[3][1], 0.6);
    GS.squadRW(B, [hv, ...m], { type: 'hold' });   // (in a squad: stepped, so their kills raise the war's events)
    hv.sim.kill(); for (const t of m) t.sim.kill();
    const p2 = __spot(34, 5.0), hv2 = GS.addHover(B, p2[0], p2[1], 2.2); hv2.sim.fanHp[1] = 0; hv2.sim.hp.hull *= 0.3;   // a smoking RW-7 with a wrecked fan (alive, no orders: it sits)
    const p3 = __spot(20, 4.4), s = GS.addStrider(B, p3[0], p3[1], 1.0, { weapon: 'xm7' }); s.sim.hp.armL = 0; window.__s = s;   // (arm shot off; no orders: it stands)
    window.__wrecks = { hv, hv2, m }; return { ids: m.map(t => t.id), cat: m.map(t => ((t.id * 7 + 3) % 5) < 2) }; })()`);
  await h.eval(`__ff(4)`);
  for (const k of [0, 1, 2]) {
    await h.eval(`(() => { const t = __wrecks.m[${k}]; window.__cam = { follow: { x: t.x, y: t.y, z: t.z }, yaw: ${0.9 + k * 0.7}, d: 15, h: 5, ty: 1 }; return { cat: ((t.id * 7 + 3) % 5) < 2, alive: t.alive }; })()`);
    await h.wait(1500); await h.shot('wreck-mbt-' + k);
  }
  await h.eval(`(() => { const t = __wrecks.hv; window.__cam = { follow: { x: t.x, y: t.y, z: t.z }, yaw: 2.4, d: 15, h: 5, ty: 0.5 }; return { y: t.sim.p[1], ground: __G.terrainH(t.x, t.z) }; })()`);
  await h.wait(1500);
  await h.expect(`__wrecks.m.every(t => !t.alive) && !__wrecks.hv.alive && __wrecks.hv2.alive`, 'three MBT wrecks and an RW-7 wreck; the hurt RW-7 lives');
  await h.shot('wreck-rw7');
  await h.eval(`(() => { const w = __wrecks; window.__cam = { follow: w.hv2, yaw: -0.7, d: 16, h: 6 }; return { hp: w.hv2.hp, fan: w.hv2.sim.fanHp }; })()`);
  await h.wait(1800);
  await h.shot('rw7-damaged');
  await h.eval(`(() => { const s = __s; window.__G.war.ground.T.LOD_STRIDER = 160; window.__cam = { follow: s, yaw: 1.0 + 1.3, d: 4.5, h: 0.6 }; return { arm: s.sim.hp.armL, stumps: __G.war.ground.views.get(s.id)?.stumps }; })()`);
  await h.wait(1500);
  await h.expect(`(__G.war.ground.views.get(__s.id)?.stumps || []).includes('armL')`, 'the STRIDER shows its arm stump');
  await h.shot('strider-stump');
  // ---- 4. a helicopter working the machines over: they break for cover from it and spread out
  await h.eval(`(() => { const GS = __gs(), I = __I, rw = GS.units.filter(u => u.side === 2 && u.kind === 'strider' && u.alive);
    const S = rw[0]?.squad; if (!S) return null; const c = rw.reduce((a, u) => [a[0] + u.x / rw.length, a[1] + u.z / rw.length], [0, 0]);
    const dsc = Object.getOwnPropertyDescriptor(__G.PL, 'landed'); Object.defineProperty(__G.PL, 'landed', { get: () => false, configurable: true });   // (flying, not the Huey parked on the pad)
    window.__airStates = new Set();
    for (let i = 0; i < 300; i++) {   // (10 s: the Huey 120 m off, 30 m up, its door gun going)
      const a = i / 300 * 1.2; __G.PL.pos.set(c[0] + Math.cos(a) * 120, Math.max(0, __G.terrainH(c[0], c[1])) + 30, c[1] + Math.sin(a) * 120); __G.PL.vel.set(-Math.sin(a) * 15, 0, Math.cos(a) * 15);
      __G.war.ground.playerFiredT = 0; __ff(1 / 30); for (const u of rw) if (u.ai && /^air/.test(u.ai.state)) __airStates.add(u.ai.state);
    }
    Object.defineProperty(__G.PL, 'landed', dsc); return [...__airStates]; })()`);
  await h.expect(`window.__airStates && __airStates.size > 0`, 'the STRIDERs react to the helicopter (air: to cover / disperse)');
  // ---- 5. the big map
  await h.eval(`(() => { const x = __I.pad.x - 22, z = __I.pad.z + 14; __G.H.reset(new __G.THREE.Vector3(x, __G.terrainH(x, z) + 1.9, z), 0.6, true, 1); window.__cam = null; return true; })()`);
  await h.key('tap', 'KeyM'); await h.wait(1500);
  await h.shot('bigmap');
  await h.key('tap', 'KeyM');
  await h.eval(`(() => { const GS = __gs(); return { units: GS.units.length, alive: GS.units.filter(u => u.alive).length, tracers: __G.war.ground.GFX.tracers, kills: GS.stats.kills }; })()`);
}
