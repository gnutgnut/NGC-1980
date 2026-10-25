// NGC-1980 air defence polish (ngc/defence-polish): the units in their AA emplacements with their crews, the towed
// guns (M167, ZU-23-2), loaders keeping the guns fed, tracer streaks, damage and wreck states, the LOD stand-ins.
//   node snap.mjs scenes/defencepolish.mjs           DP_PART=look|crew|wreck|lod to run one part
// Engagements are stepped with __D.run(sec) (fixed 1/30 s steps), so they are deterministic enough to assert on.
const PART = process.env.DP_PART || 'all';
const on = p => PART === 'all' || PART === p;
const CAM = {   // yaw, pitch, dist, tx, ty, tz
  vads: '2.5,0.32,13,0,1.4,0.6', vadst: '2.4,0.35,10,0,1.0,0.4', shilka: '2.4,0.32,14,0,1.4,0', zu23: '2.3,0.38,9,0,0.9,0.4',
  talon: '2.2,0.35,19,0,2.0,0', lance: '2.5,0.3,14,0,2.2,0',
};
export default async function (h) {
  if (on('look')) {
    for (const [type, cam] of Object.entries(CAM)) {
      await h.goto(`dev/defence.html?mode=fight&unit=${type}&drones=3&hill=0&panel=0&revet=1`);
      await h.waitFor('window.__D && __D.unit', 15000);
      // fight until the gun has fired a while (crews moving, tracers out), then frame it close from behind the shoulder
      await h.eval(`(() => { __D.pause(); __D.run(5); for (let i = 0; i < 300; i++) { __D.run(1 / 30); const D = __D.unit.def; if (D.flashT > 0 || (D.beam && D.beam.st === 'on') || __D.def.missiles.length) break; }
        const [y, p, d, x, yy, z] = '${cam}'.split(',').map(Number); Object.assign(__D.cam, { yaw: y, pitch: p, dist: d }); __D.cam.t.set(x, yy, z);
        const ud = __D.unit.mesh.userData; return { type: ud.defType, crew: ud.crew.length, ammo: __D.unit.def.ammo, tris: ud.stats && ud.stats.tris, lod: __D.unit.mesh.isLOD }; })()`);
      await h.wait(400); await h.shot(`look-${type}`);
      await h.expect(`!!(__D.unit.mesh.isLOD && __D.unit.mesh.userData.hi && __D.unit.mesh.userData.lo)`);
    }
    // in the revetment: nose to the pad (-z), the turret over the slot centre
    await h.expect(`(() => { const m = __D.unit.mesh, f = new __D.THREE.Vector3(0, 0, -1).applyQuaternion(m.quaternion); return f.z < -0.95; })()`);
  }
  if (on('crew')) {
    // the ZU-23-2's two 50-round boxes go fast: the loaders must keep it fed (deliveries) and it must keep scoring
    await h.goto('dev/defence.html?mode=fight&unit=zu23&drones=3&hill=0&panel=0&revet=1');
    await h.waitFor('window.__D && __D.unit', 15000);
    await h.eval(`(() => { __D.pause(); window.__low = 1e9; window.__jobs = {}; for (let i = 0; i < 25 * 30; i++) { __D.run(1 / 30); const D = __D.unit.def; __low = Math.min(__low, D.ammo); for (const c of __D.unit.mesh.userData.crew) if (c.job) __jobs[c.job] = (__jobs[c.job] || 0) + 1; }
      const D = __D.unit.def; return { ammo: D.ammo, low: __low, fed: D.fed, hits: __D.S.hits, kills: __D.S.kills, jobs: __jobs }; })()`);
    await h.expect(`__D.unit.def.fed >= 1 && __low < 60 && __D.S.hits > 0`);
    // freeze on a loader carrying or heaving a box up
    await h.eval(`(() => { for (let i = 0; i < 600; i++) { __D.run(1 / 30); if (__D.unit.mesh.userData.crew.some(c => c.job === 'load' || c.job === 'bring')) break; }
      Object.assign(__D.cam, { yaw: 2.0, pitch: 0.3, dist: 8 }); __D.cam.t.set(0, 0.9, 1.0); return __D.unit.mesh.userData.crew.map(c => c.job || c.spot.role); })()`);
    await h.wait(400); await h.shot('crew-zu23-loaders');
    // tracer streaks are out while it fires
    await h.eval(`(() => { for (let i = 0; i < 300; i++) { __D.run(1 / 30); if (__D.def.tracers().n > 3) break; } __D.frame(); return __D.def.tracers().n; })()`);
    await h.expect(`__D.def.tracers().n > 0`);
    await h.wait(300); await h.shot('tracers-zu23');
    // the TALON's TICK climbs onto the deck after a missile goes, and comes down again once the packs are full
    await h.goto('dev/defence.html?mode=fight&unit=talon&drones=3&hill=0&panel=0&revet=1');
    await h.waitFor('window.__D && __D.unit', 15000);
    await h.eval(`(() => { __D.pause(); window.__up = 0; for (let i = 0; i < 30 * 30; i++) { __D.run(1 / 30); const t = __D.unit.mesh.userData.crew[0]; if (t.s > 0.99) { __up++; if (__up === 20) break; } } const t = __D.unit.mesh.userData.crew[0];
      Object.assign(__D.cam, { yaw: 2.6, pitch: 0.35, dist: 9 }); __D.cam.t.set(0.5, 2.4, 3.5); return { s: +t.s.toFixed(2), up: __up, spent: __D.unit.def.cellsSpent, cd: +__D.unit.def.mslCd.toFixed(1) }; })()`);
    await h.expect(`__up >= 20`);
    await h.wait(400); await h.shot('crew-talon-tick');
  }
  if (on('wreck')) {
    for (const type of ['shilka', 'vadst', 'talon']) {
      await h.goto(`dev/defence.html?mode=fight&unit=${type}&drones=0&hill=0&panel=0&revet=1`);
      await h.waitFor('window.__D && __D.unit', 15000);
      await h.eval(`(() => { __D.pause(); __D.run(1); __D.hurt(__D.unit.hp * 0.6); __D.run(3); return __D.unit.mesh.userData.state; })()`);
      await h.expect(`__D.unit.mesh.userData.state === 'damaged'`);
      await h.eval(`(() => { const c = '${CAM[type]}'.split(',').map(Number); Object.assign(__D.cam, { yaw: c[0], pitch: c[1], dist: c[2] * 1.3 }); __D.cam.t.set(c[3], c[4], c[5]); return 1; })()`);
      await h.wait(300); await h.shot(`damaged-${type}`);
      await h.eval(`(() => { __D.kill(); __D.run(4); const ud = __D.unit.mesh.userData; return { state: ud.state, crewVisible: ud.crew.some(c => c.fig.g.visible), lamp: ud.lamp.visible }; })()`);
      await h.expect(`__D.unit.mesh.userData.state === 'destroyed' && !__D.unit.mesh.userData.crew.some(c => c.fig.g.visible)`);
      await h.wait(300); await h.shot(`wreck-${type}`);
    }
  }
  if (on('war')) {
    // in the game: knock out PELICAN's gun (war.js blast -> killStruct -> setState): the burnt wreck stays in its
    // revetment; order a new gun (command board) and it goes up on the same slot, the wreck hauled away
    await h.goto('?debug&kb&res=0.45&peace');
    await h.waitFor('window.__G', 10000);
    await h.key('tap', 'Enter'); await h.wait(1500);
    await h.eval(`(() => { __G.G.bench = true; const I = __G.ISLANDS.find(I => I.name === 'PELICAN'), s = I.structs.find(s => s.kind === 'aa' && !s.dead); window.__old = s;
      __G.war.blast(s.x, s.y + 1, s.z, 5, 30, 2); return { dead: s.dead, state: s.mesh.userData.state, type: s.def.type }; })()`);
    await h.expect(`__old.dead && __old.mesh.userData.state === 'destroyed' && !!__old.mesh.parent && __old.mesh.visible`);
    await h.eval(`(() => { const s = __old, c = __G.war.carrier.p, a = Math.atan2(c.x - s.x, c.z - s.z) + 0.5, T = __G.THREE;
      const px = s.x + Math.sin(a) * 40, pz = s.z + Math.cos(a) * 40; __G.H.reset(new T.Vector3(px, Math.max(__G.terrainH(px, pz), 0) + 25, pz), a, false, 1); __G.HI.setCollective(0.47);
      if (!window.__ovOn) { window.__ovOn = 1; const r = __G.renderer, orig = r.render.bind(r); r.render = (sc, cam) => { const o = window.__ov; if (o && cam === __G.zCam) { cam.position.set(...o.p); cam.lookAt(...o.t); cam.updateMatrixWorld(); } return orig(sc, cam); }; }
      window.__ov = { p: [s.x + Math.sin(a) * 13, s.y + 6, s.z + Math.cos(a) * 13], t: [s.x, s.y + 1, s.z] }; return 1; })()`);
    await h.wait(2500); await h.shot('war-wreck');
    await h.eval(`(() => { __G.war.P.mat = 200; const I = __G.ISLANDS.find(I => I.name === 'PELICAN'); const msg = __G.war.orderAA(I); const s = I.structs.filter(s => s.kind === 'aa').pop(); window.__new = s; s.building = 0.01;
      return { msg, sameSlot: Math.hypot(s.x - __old.x, s.z - __old.z) < 1, wreckGone: !__old.mesh.parent, type: s.def.type }; })()`);
    await h.expect(`Math.hypot(__new.x - __old.x, __new.z - __old.z) < 1 && !__old.mesh.parent`);
    await h.wait(2500); await h.shot('war-new-gun');
  }
  if (on('lod')) {
    // the far level takes over beyond ~220 m; the lineup of every type from far away; build cost of an instance
    await h.goto('dev/defence.html?mode=fight&unit=shilka&drones=0&hill=0&panel=0');
    await h.waitFor('window.__D && __D.unit', 15000);
    await h.eval(`(() => { __D.pause(); const m = __D.unit.mesh, c = __D.camera; c.position.set(0, 20, 400); c.updateMatrixWorld(); m.update(c); const far = m.userData.lo.visible && !m.userData.hi.visible;
      c.position.set(0, 5, 30); c.updateMatrixWorld(); m.update(c); const near = m.userData.hi.visible && !m.userData.lo.visible; window.__lod = { far, near }; return __lod; })()`);
    await h.expect(`__lod.far && __lod.near`);
    await h.eval(`(() => {
      const b = performance.now(); for (let i = 0; i < 20; i++) __D.build(['vads', 'vadst', 'shilka', 'zu23', 'talon', 'lance'][i % 6], i % 6 < 4 ? 1 : 2); const per = (performance.now() - b) / 20;
      let calls = { hi: 0, lo: 0 }; __D.unit.mesh.userData.hi.traverse(o => { if (o.isMesh) calls.hi++; }); __D.unit.mesh.userData.lo.traverse(o => { if (o.isMesh) calls.lo++; });
      window.__perf = { msPerUnit: +per.toFixed(2), meshesHi: calls.hi, meshesLo: calls.lo }; return __perf; })()`);
    await h.expect(`__perf.msPerUnit < 25 && __perf.meshesLo <= 5`);
    await h.goto('dev/defence.html?mode=lineup&ui=0&cam=0.35,0.25,300,0,1.5,0');
    await h.waitFor('window.__D', 15000);
    await h.wait(600); await h.shot('lineup-far-lod');
    await h.goto('dev/defence.html?mode=lineup&ui=0&cam=0.35,0.22,62,0,1.5,0');
    await h.waitFor('window.__D', 15000);
    await h.wait(600); await h.shot('lineup-near');
  }
}
