// THE GROUND WAR in the real game (units/groundwar/):
//   1. an MV-22 lands eight STRIDERs on SANDBAR (neutral): they come off the ramp, form up and take the island;
//   2. a CH-46 lands thirteen Marines to take it back: the squads fight it out (screenshots from the air and close up);
//   3. the Huey's door gun and rockets kill STRIDERs (a scripted gunner fires the war's own rounds);
//   4. an RW-7 hover tank crosses from the KRAKEN and comes ashore; an LCAC lands a seized M1A2.
// The war is stepped in fast-forward loops between screenshots (the browser is slow headless); the Huey is parked on
// the island so the game draws the terrain round it.     node snap.mjs scenes/groundwar.mjs
const HOOK = `(() => { const G = __G, T = G.THREE, r = G.renderer, cam = new T.PerspectiveCamera(50, 1, 0.3, 2500), orig = r.render.bind(r);
  const t = new T.Vector3(), p = new T.Vector3();
  r.render = (s, c) => {
    const m = window.__cam; if (c !== G.zCam || !m || (!m.follow && !m.at)) return orig(s, c);
    if (m.follow) { const u = m.follow; t.set(u.x ?? u.p.x, (u.y ?? u.p.y) + (m.ty ?? 1.2), u.z ?? u.p.z); p.set(t.x + Math.sin(m.yaw) * m.d, t.y + m.h, t.z + Math.cos(m.yaw) * m.d); }
    else { p.set(...m.at); t.set(...m.look); }
    { const gy = Math.max(G.terrainH(p.x, p.z), 0); if (p.y < gy + 1.2) p.y = gy + 1.2; }   // never inside a hill
    cam.position.copy(p); cam.up.set(0, 1, 0); cam.lookAt(t); cam.aspect = c.aspect; cam.updateProjectionMatrix();
    G.zCam.position.copy(p);   // the war's ear and the LOD follow this camera
    return orig(s, cam);
  };
  // fast-forward the war (no rendering): n seconds at dt
  window.__ff = (secs, dt = 1 / 30, until) => { const W = G.war; for (let i = 0; i < secs / dt; i++) { W.update(dt, G.PL, !!window.__peace); G.fx.update(dt); if (until && until()) return true; } return false; };
  window.__gw = () => { const GS = G.war.ground.sim, I = window.__I; const n = (s, k) => GS.units.filter(u => u.alive && u.side === s && (!k || u.kind === k) && (u.kind !== 'marine' || u.able)).length;
    return { t: Math.round(G.war.time), owner: I.owner, striders: n(2, 'strider'), hover: n(2, 'hovertank'), mbt: n(2, 'mbt'), marines: n(1), kia: GS.stats.kia, wia: GS.stats.wia, kills: GS.stats.kills[1], proxies: G.war.units.filter(u => u.ground).map(u => u.side + ':' + u.hp + (u.landed ? 'L' : '')).join(' '), proj: GS.proj.length }; };
  return true; })()`;
export default async function (h) {
  await h.goto('?debug&kb&res=0.45');
  await h.waitFor('window.__G', 10000); await h.wait(500);
  await h.key('tap', 'Enter'); await h.waitFor(`__G.G.state === 'play'`, 10000); await h.wait(1200);
  await h.eval(HOOK);
  // SANDBAR (neutral fuel island); the Huey parked on its pad's edge (the game draws terrain round the player)
  await h.eval(`(() => { const I = __G.ISLANDS.find(i => i.name === 'SANDBAR'); window.__I = I; const W = __G.war;
    W.E.mat = 0; W.transT = 1e9; __G.G.bench = true;   // the commander stays out of it (this scene places the forces); nothing hurts the parked Huey
    const x = I.pad.x - 22, z = I.pad.z + 14; __G.H.reset(new __G.THREE.Vector3(x, __G.terrainH(x, z) + 1.9, z), 0.6, true, 1); __G.HI.setCollective(0);
    __G.war.ground.godPlayer = true; return { owner: I.owner, pad: [I.pad.x, I.pad.z] }; })()`);
  // ---- 1. the Osprey: lands the STRIDERs
  await h.eval(`(() => { const W = __G.war, u = W.rotary.make('transport', 2, 0, 0, 0, { target: __I }); W.units.push(u); window.__u = u; window.__cam = { follow: u, yaw: 2.2, d: 46, h: 12 }; return { lz: u.lz }; })()`);
  await h.expect(`__u.kind === 'mv22'`, 'an MV-22 on the KRAKEN for SANDBAR');
  await h.eval(`__ff(240, 1 / 30, () => __u.rot.AI.phase === 'ground' || __u.dead)`);
  await h.eval(`(window.__cam = { follow: __u, yaw: 2.6, d: 30, h: 7 }, __ff(4), __gw())`);
  await h.shot('osprey-down');
  await h.eval(`__ff(25, 1 / 30, () => __G.war.ground.sim.units.filter(u => u.kind === 'strider').length >= 8)`);
  await h.eval(`(() => { const s = __G.war.ground.sim.units.find(u => u.kind === 'strider'); window.__s = s; window.__cam = { follow: s, yaw: 3.4, d: 9, h: 2.2 }; __ff(2); return __gw(); })()`);
  await h.shot('striders-off-the-ramp');
  await h.expect(`__G.war.ground.sim.units.filter(u => u.kind === 'strider' && u.alive).length === 8`, 'eight STRIDERs came off the ramp');
  await h.eval(`__ff(120, 1 / 30, () => __I.owner === 2)`);
  await h.eval(`__gw()`);
  await h.expect(`__I.owner === 2`, 'the STRIDERs took SANDBAR');
  await h.eval(`(window.__cam = { at: [__I.pad.x + 70, __I.pad.h + 60, __I.pad.z + 70], look: [__I.pad.x, __I.pad.h, __I.pad.z] }, __ff(1), true)`);
  await h.shot('sandbar-taken-air');
  // ---- 2. the Huey's door gun and rockets thin them out first (a scripted gunner: the war's own rounds, aimed at a STRIDER)
  await h.eval(`(() => { const W = __G.war, GS = W.ground.sim, T = __G.THREE; let shots = 0;
    const k0 = GS.stats.kills[1];
    for (let n = 0; n < 1800 && GS.units.filter(u => u.kind === 'strider' && u.alive).length > 2; n++) {   // (down to two: SANDBAR is 60 m across, the Sea Knight's LZ can't be far from them)
      const s = GS.units.filter(u => u.kind === 'strider' && u.alive).sort((a, b) => Math.hypot(a.x - __I.pad.x, a.z - __I.pad.z) - Math.hypot(b.x - __I.pad.x, b.z - __I.pad.z))[0]; if (!s) break;
      const gx = s.x + 40, gy = s.y + 35, gz = s.z + 25, d = Math.hypot(s.x - gx, s.y + 1.3 - gy, s.z - gz);
      if (n % 3 === 0) { const v = new T.Vector3(s.x - gx, s.y + 1.3 - gy + 2.2 * (d / 75) * (d / 75) / 2, s.z - gz).normalize().multiplyScalar(75); v.x += (Math.random() - 0.5) * 2; v.y += (Math.random() - 0.5) * 2; v.z += (Math.random() - 0.5) * 2; W.fireBullet(new T.Vector3(gx, gy, gz), v); shots++; }
      if (n % 60 === 30) { const v = new T.Vector3(s.x - gx, s.y + 1 - gy + 1.2 * (d / 105) * (d / 105) / 2, s.z - gz).normalize().multiplyScalar(105); W.fireRocket(new T.Vector3(gx, gy, gz), v); shots++; }
      __ff(1 / 30);
    }
    for (const s of __I.structs) if (s.kind === 'aa' && s.side === 2 && !s.dead) W.damage(s, 99, 1);   // and the rockets take out the TALON the machines brought (the advisor: KNOCK IT OUT FIRST)
    window.__gunKills = GS.stats.kills[1] - k0; return { shots, kills: window.__gunKills, aa: W.aliveAA(__I), ...__gw() }; })()`);
  await h.expect(`window.__gunKills >= 2`, "the door gun and rockets kill STRIDERs");
  await h.eval(`(() => { const s = __G.war.ground.sim.units.find(u => u.kind === 'strider' && !u.alive) || __G.war.ground.sim.units.find(u => u.kind === 'strider'); window.__cam = { follow: s, yaw: 2.0, d: 8, h: 3 }; return true; })()`);
  await h.shot('strider-down');
  // ---- 3. a CH-46 with Marines to take it back from the survivors
  await h.eval(`(() => { __G.G.mat = 200; __G.war.P.mat = 200; const r = __G.war.sendDrone(__I); const c = __G.war.units.find(u => u.kind === 'ch46'); window.__c = c; if (c) { c.hp = c.hpMax = 400; }   /* (the scene is about the fight on the ground: coilgun hits on the Sea Knight on its way in - below half its hp it loses an engine and turns for home - must not end it; ngc/infdepth-fix) */ window.__cam = { follow: c, yaw: 2.4, d: 40, h: 10 }; return r; })()`);
  await h.expect(`!!window.__c`, 'a Sea Knight launched with Marines for SANDBAR');
  await h.eval(`__ff(260, 1 / 30, () => __c.rot.AI.phase === 'ground' || __c.dead)`);
  // the rounds so far (the STRIDERs' at the island's empty pad, none of the Marines'): 'both sides fire' counts from here
  await h.eval(`(() => { const st = __G.war.ground.sim.stats; window.__s0 = { 1: st.shots[1], 2: st.shots[2], rich: st.richShots }; window.__richMax = 0; return window.__s0; })()`);
  await h.eval(`(window.__cam = { follow: __c, yaw: 1.8, d: 26, h: 6 }, __ff(6), { ...__gw(), heli: __G.Z.alive, death: __G.Z.lastDeath, c: __c.dead || __c.dying, hp: __c.hp, lz: __c.lz })`);
  await h.shot('seaknight-unloading');
  await h.eval(`__ff(20, 1 / 30, () => __G.war.ground.sim.units.filter(u => u.kind === 'marine').length >= 13)`);
  await h.eval(`(() => { __ff(20, 1 / 30, () => { window.__richMax = Math.max(window.__richMax, __G.war.ground.sim.units.filter(u => u.richOn).length); }); const m = __G.war.ground.sim.units.find(u => u.kind === 'marine' && u.alive); window.__m = m; window.__cam = { follow: m, yaw: 0.8, d: 6, h: 1.6, ty: 0.8 }; return __gw(); })()`);
  await h.shot('marines-close');
  await h.expect(`__G.war.ground.sim.units.filter(u => u.kind === 'marine').length + __G.war.ground.sim.stats.evac === 13`, 'thirteen Marines came off the ramp (ngc/infdepth: counting the wounded the Sea Knight took back out)');
  await h.eval(`(() => { __ff(30); window.__cam = { at: [__I.pad.x - 60, __I.pad.h + 45, __I.pad.z + 55], look: [__I.pad.x, __I.pad.h + 2, __I.pad.z] }; return __gw(); })()`);
  await h.shot('firefight-air');
  await h.eval(`(() => { const st = __G.war.ground.sim.stats; return { since: { 1: st.shots[1] - __s0[1], 2: st.shots[2] - __s0[2], rich: st.richShots - __s0.rich }, richMax: __richMax, shots: st.shots, hits: st.hits, warHits: st.warHits, ...__gw() }; })()`);
  // every ground-war round of side 1 since the landing (the cheap model's and the rich Marines' from their real muzzles,
  // M203 and LAW: groundsim's shoot()); the rich men near the camera fire their share (richShots, a subset)
  await h.expect(`(() => { const st = __G.war.ground.sim.stats; return st.shots[1] - __s0[1] > 20 && st.shots[2] - __s0[2] > 20 && (__richMax === 0 || st.richShots - __s0.rich > 0); })()`, 'both sides fire (since the landing; the rich Marines\' rounds counted)');
  // ---- 4. armour: an RW-7 over the sea, an LCAC with a seized M1A2
  await h.eval(`(() => { const GW = __G.war.ground; window.__hv = GW.launchHover(__I); window.__lc = GW.launchMBT(__I, 'm1a2'); return { hover: !!__hv, lcac: !!__lc }; })()`);
  await h.expect(`!!window.__hv && !!window.__lc`, 'an RW-7 and an LCAC launched');
  await h.eval(`(window.__cam = { follow: __hv, yaw: 2.2, d: 22, h: 6 }, __ff(60, 1 / 30, () => !__hv.transit), __gw())`);
  await h.shot('hovertank-ashore');
  await h.expect(`!__hv.transit && __hv.B && __hv.B.I === __I`, 'the hover tank came ashore and joined the fight');
  await h.eval(`(window.__cam = { follow: { x: __lc.x, y: 2, z: __lc.z }, yaw: 2.4, d: 45, h: 14 }, __ff(120, 1 / 30, () => __lc.phase === 'ramp'), { phase: __lc.phase })`);
  await h.eval(`(() => { window.__cam = { follow: { x: __lc.x, y: 2, z: __lc.z }, yaw: __lc.yaw + 2.6, d: 34, h: 9 }; __ff(10, 1 / 30, () => !!__lc.mbt); return { phase: __lc.phase, mbt: !!__lc.mbt }; })()`);
  await h.shot('lcac-ramp-down');
  await h.eval(`(() => { __ff(12); const t = __lc.mbt; window.__cam = { follow: t, yaw: 2.8, d: 16, h: 5 }; return { mbt: !!t, speed: t && t.sim.speed, gear: t && t.sim.drive.gear, pos: t && [t.x, t.y, t.z].map(Math.round), ground: t && __G.terrainH(t.x, t.z), lcac: [__lc.x, __lc.z].map(Math.round), lcGround: __G.terrainH(__lc.x, __lc.z) }; })()`);
  await h.shot('m1a2-ashore');
  await h.expect(`!!__lc.mbt && __lc.mbt.alive`, 'the seized M1A2 drove off the landing craft');
  await h.eval(`(() => { __ff(40); window.__cam = { at: [__I.pad.x - 80, __I.pad.h + 70, __I.pad.z - 60], look: [__I.pad.x, __I.pad.h, __I.pad.z] }; return __gw(); })()`);
  await h.shot('battle-air');
  await h.eval(`(() => { const GS = __G.war.ground.sim; return { ...__gw(), shots: GS.stats.shots, hits: GS.stats.hits, feed: document.getElementById('feed').textContent.slice(0, 300) }; })()`);
}
