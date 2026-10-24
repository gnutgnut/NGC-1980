// COLLISION (wave 3 #3): CPU per frame in a big fight, with the collision world working and switched off (CW.off: the
// avoidance passes through, the contact step does nothing; the bodies and the circle pushes stay). Two reinforced
// Marine squads (26 men) dug in on SANDBAR against sixteen STRIDERs and an RW-7 coming to take it, the camera on the
// fight (full simulation, the near Marines on the rich sims). Timing: war.update (the ground war's step, with the
// avoidance) and the collision world's own work (avoid + circle pushes + contact step), averaged over 25 s of each.
//     node snap.mjs scenes/collisionperf.mjs
const HOOK = `(() => { const G = __G, T = G.THREE, r = G.renderer, cam = new T.PerspectiveCamera(50, 1, 0.3, 2500), orig = r.render.bind(r);
  const t = new T.Vector3(), p = new T.Vector3();
  r.render = (s, c) => { const m = window.__cam; if (c !== G.zCam || !m) return orig(s, c); p.set(...m.at); t.set(...m.look); cam.position.copy(p); cam.lookAt(t); cam.aspect = c.aspect; cam.updateProjectionMatrix(); G.zCam.position.copy(p); return orig(s, cam); };
  const W = G.war, CW = G.CW, wu = W.update.bind(W), st = CW.step.bind(CW);
  window.__P = { war: 0, cw: 0, n: 0, reset() { this.war = 0; this.cw = 0; this.n = 0; } };
  W.update = (...a) => { const t0 = performance.now(); const r = wu(...a); __P.war += performance.now() - t0; __P.cw += CW.stats.ms; __P.n++; return r; };
  CW.step = dt => { const t0 = performance.now(); st(dt); __P.cw += performance.now() - t0; };
  return true; })()`;
export default async function (h) {
  await h.goto('?debug&kb&res=0.45');
  await h.waitFor('window.__G', 10000); await h.wait(500);
  await h.key('tap', 'Enter'); await h.waitFor(`__G.G.state === 'play'`, 10000); await h.wait(1200);
  await h.eval(HOOK);
  await h.eval(`(() => { const I = __G.ISLANDS.find(i => i.name === 'SANDBAR'); window.__I = I; const W = __G.war;
    W.E.mat = 0; W.transT = 1e9; __G.G.bench = true; W.ground.godPlayer = true;
    const x = I.pad.x - 22, z = I.pad.z + 14; __G.H.reset(new __G.THREE.Vector3(x, __G.terrainH(x, z) + 1.9, z), 0.6, true, 1); __G.HI.setCollective(0);
    const GS = W.ground.sim, B = GS.battle(I), R = ['sl', 'tl', 'mg', 'aar', 'gren', 'tl', 'ar', 'aar', 'gren', 'tl', 'ar', 'aar', 'gren'], mar = [], rw = [];
    for (let k = 0; k < 26; k++) mar.push(GS.addMarine(B, R[k % 13], I.pad.x + (k % 6) * 2.5 - 6, I.pad.z + 8 + Math.floor(k / 6) * 2.5, 0, { seed: k + 3 }));
    GS.squadMarines(B, mar.slice(0, 13), { type: 'defend', x: I.pad.x, z: I.pad.z, r: 22 }); GS.squadMarines(B, mar.slice(13), { type: 'defend', x: I.pad.x, z: I.pad.z, r: 22 });
    const ax = I.pad.x - 110, az = I.pad.z - 40;
    for (let k = 0; k < 16; k++) rw.push(GS.addStrider(B, ax + (k % 4) * 3.5, az + Math.floor(k / 4) * 3.5, 0, { weapon: k % 4 === 0 ? 'coil' : 'xm7' }));
    for (let k = 0; k < 16; k += 4) GS.squadRW(B, rw.slice(k, k + 4), { type: 'take', x: I.pad.x, z: I.pad.z, r: 30 });
    const ht = GS.addHover(B, ax - 12, az, 0); GS.join(B, ht, { type: 'take', x: I.pad.x, z: I.pad.z, r: 30 });
    window.__cam = { at: [I.pad.x - 60, I.pad.h + 45, I.pad.z + 60], look: [I.pad.x - 40, I.pad.h, I.pad.z - 10] };
    return { units: GS.units.length, bodies: __G.CW.bodies.length }; })()`, '26 Marines on SANDBAR, 16 STRIDERs and an RW-7 coming');
  await h.wait(8000);
  await h.shot('big-fight');
  const run = async (off, label) => {
    await h.eval(`(__G.CW.off = ${off}, __P.reset(), 1)`);
    await h.wait(25000);
    await h.eval(`(() => { const GS = __G.war.ground.sim; return { ${label ? 'mode: "' + label + '",' : ''} frames: __P.n, warMs: +(__P.war / __P.n).toFixed(2), cwMs: +(__P.cw / __P.n).toFixed(3), simMs: +__G.PROF.sim.toFixed(2), alive: GS.units.filter(u => u.alive).length, shots: GS.stats.shots }; })()`, label);
  };
  await run(false, 'collision world ON');
  await run(true, 'collision world OFF (before)');
  await run(false, 'collision world ON again');
  await h.shot('big-fight-later');
  await h.expect('__G.CW.bodies.length > 40', 'the fight\\u2019s units are bodies in the collision world');
}
