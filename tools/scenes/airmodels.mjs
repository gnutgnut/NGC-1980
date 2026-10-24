// Air unit models on dev/air.html: the TOMCAT from several angles and states (sweep 20 / 68 / 75 oversweep, gear,
// hook, canopy, afterburner, vanes), plus the SHRIKE, REAPER and SHAHED; contract checks for the Tomcat (wheel bottoms
// on y -2.5 like the sim's GEAR, hook tip at the sim's HOOK_TIP).        node snap.mjs scenes/airmodels.mjs
const TOMCAT_VIEWS = [
  ['tomcat_front34', '2.4,0.3,26', {}],
  ['tomcat_side', '1.5708,0.02,24', {}],
  ['tomcat_top20', '0,1.5,30', { gear: 0 }],
  ['tomcat_top68', '0,1.5,30', { sweep: 68, gear: 0, vane: 1 }],
  ['tomcat_top75_deck', '0.3,1.2,28', { sweep: 75 }],
  ['tomcat_rear_ab', '0.5,0.15,24,0,0,4', { eng: [{ n: 1, nozzle: 1, ab: 1 }, { n: 1, nozzle: 1, ab: 1 }], surf: { brake: 1 }, hook: 1 }],
  ['tomcat_below', '2.6,-0.5,22,0,-1,0', { hook: 1, launchBar: true }],
  ['tomcat_cockpit', '2.3,0.45,8,0,0.8,-5', { canopy: 1 }],
  ['tomcat_surfaces', '0.9,0.5,24', { surf: { stab: 0.3, ail: 0.4, rud: 0.4, flap: 1, lef: 1 } }],
  ['tomcat_tail', '1.2,0.2,10,2,1.4,6.5', {}],
];
export default async function (h) {
  await h.goto('dev/air.html?model=tomcat&ui=0');
  await h.waitFor('window.__A', 10000);
  const base = JSON.stringify({ surf: { stab: 0, ail: 0, rud: 0, flap: 0, lef: 0, brake: 0 }, sweep: 20, vane: 0, gear: 1, hook: 0, canopy: 0, steer: 0, wow: [0, 0, 0], launchBar: false, eng: [{ n: 0.7, nozzle: 0.6, ab: 0 }, { n: 0.7, nozzle: 0.6, ab: 0 }], lights: true });
  for (const [name, cam, st] of TOMCAT_VIEWS) {
    await h.eval(`(() => { const A = __A, [y, p, d, x, yy, z] = '${cam}'.split(',').map(Number); Object.assign(A.cam, { yaw: y, pitch: p, dist: d }); A.cam.t.set(x || 0, yy || 0, z || 0);
      const st = ${JSON.stringify(st)}, b = ${base}; Object.assign(A.S, b, st); A.S.surf = Object.assign(b.surf, st.surf || {}); return true; })()`);
    await h.wait(350); await h.shot(name);
  }
  await h.eval(`(() => { const A = __A, T = A.THREE; Object.assign(A.S, ${base}, { hook: 1 }); A.render(); A.model.group.updateMatrixWorld(true);
    const out = {}, bb = new T.Box3();
    A.model.group.traverse(o => { if (o.name === 'tyre') { bb.setFromObject(o); out['tyre@' + ((bb.min.x + bb.max.x) / 2).toFixed(2)] = [+bb.min.y.toFixed(3), +((bb.min.z + bb.max.z) / 2).toFixed(2)]; } });
    out.hookTip = A.model.hookTip(new T.Vector3()).toArray().map(v => +v.toFixed(2));
    let tris = 0, meshes = 0; A.model.group.traverse(o => { if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
    out.tris = tris; out.meshes = meshes; window.__chk = out; return out; })()`);
  await h.expect(`Object.entries(__chk).filter(([k]) => k.startsWith('tyre')).every(([, v]) => Math.abs(v[0] + 2.5) < 0.04)`);
  await h.expect(`Math.hypot(__chk.hookTip[1] + 2.35, __chk.hookTip[2] - 8.0) < 0.15`);
  // (airai-polish) the crew figures: helmets, visors, masks, harness (the heads scan when nobody gives them a look)
  await h.eval(`(() => { const A = __A; Object.assign(A.cam, { yaw: 2.0, pitch: 0.35, dist: 5 }); A.cam.t.set(0, 1, -4.9); Object.assign(A.S, { canopy: 0 }); return 1; })()`);
  await h.wait(350); await h.shot('tomcat_crew');
  for (const m of ['shrike', 'reaper', 'shahed']) {
    await h.goto(`dev/air.html?model=${m}&ui=0`);
    await h.waitFor('window.__A', 10000);
    const d = { shrike: 18, reaper: 30, shahed: 7 }[m];
    for (const [n, cam] of [['front34', `2.4,0.35,${d}`], ['top', `0.2,1.45,${d * 1.1}`], ['rear', `0.6,0.2,${d * 0.9}`]]) {
      await h.eval(`(() => { const A = __A, [y, p, dd] = '${cam}'.split(',').map(Number); Object.assign(A.cam, { yaw: y, pitch: p, dist: dd }); A.S.gear = 0; A.S.eng = [{ n: 0.95, nozzle: 0.6, ab: 0 }]; return 1; })()`);
      await h.wait(350); await h.shot(`${m}_${n}`);
    }
    // (airai-polish) damage state, killed (lights / glow / seams out), the far level of detail
    for (const [q, n] of [['&dmg=0.3', 'damaged'], ['&dmg=0.3&dead=1', 'dead'], ['&lod=far', 'farLOD']]) {
      await h.goto(`dev/air.html?model=${m}&ui=0${q}&cam=2.4,0.35,${d}`);
      await h.waitFor('window.__A', 10000); await h.wait(350); await h.shot(`${m}_${n}`);
    }
  }
}
