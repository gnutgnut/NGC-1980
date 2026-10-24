// NGC-1980 air defence units in the real game: who stands where, what they look like on the islands and the
// ALBATROSS, and the player-facing rules (lock needs line of sight; a missile comes after the lock; hiding behind
// terrain breaks it).   node snap.mjs scenes/defencewar.mjs
// Views use a camera override installed by this scene (it wraps __G.renderer.render), so the helicopter is parked
// nearby only to explore the fog of war.
const Q = '?debug&kb&res=0.45';
// put the helicopter `back` m from point (x, z), `up` m above the ground, nose on it
const park = (x, z, back, up, side = 0) => `(() => { const T = __G.THREE, x = ${x}, z = ${z}, a = Math.atan2(-(x - __G.war.carrier.p.x), -(z - __G.war.carrier.p.z)) + ${side};
  const px = x + Math.sin(a) * ${back}, pz = z + Math.cos(a) * ${back}, py = Math.max(__G.terrainH(px, pz), 0) + ${up};
  __G.H.reset(new T.Vector3(px, py, pz), a, false, 1); __G.HI.setCollective(0.47); return [px, py, pz].map(v => +v.toFixed(1)); })()`;
const OVERRIDE = `(() => { if (window.__ovOn) return 1; window.__ovOn = 1; const r = __G.renderer, orig = r.render.bind(r);
  r.render = (s, c) => { const o = window.__ov; if (o && c === __G.zCam) { c.position.set(o.p[0], o.p[1], o.p[2]); c.lookAt(o.t[0], o.t[1], o.t[2]); c.updateMatrixWorld(); } return orig(s, c); }; return 1; })()`;
// look at object o (with .x/.y/.z or a world position) from `dist` m at bearing `brg` (rad, from the object toward the carrier + brg) and elevation `el`
const look = (o, dist, brg, el, dy = 1.5) => `(() => { const o = ${o}, c = __G.war.carrier.p, a = Math.atan2(c.x - o.x, c.z - o.z) + ${brg};
  window.__ov = { p: [o.x + Math.sin(a) * Math.cos(${el}) * ${dist}, o.y + ${dy} + Math.sin(${el}) * ${dist}, o.z + Math.cos(a) * Math.cos(${el}) * ${dist}], t: [o.x, o.y + ${dy}, o.z] }; return window.__ov.p.map(v => +v.toFixed(1)); })()`;
export default async function (h) {
  await h.goto(Q + '&peace');
  await h.waitFor('window.__G', 10000);
  await h.key('tap', 'Enter'); await h.wait(1500);
  await h.eval(`(__G.G.bench = true, __G.ISLANDS.filter(I => I.structs.some(s => s.kind === 'aa')).map(I => I.name + ': ' + I.structs.filter(s => s.kind === 'aa').map(s => s.def && s.def.type).join('/')))`);
  await h.expect(`__G.ISLANDS.every(I => I.structs.filter(s => s.kind === 'aa').every(s => s.def && (I.owner === 1 ? ['shilka', 'zu23'].includes(s.def.type) : ['talon', 'lance'].includes(s.def.type))))`);
  await h.expect(`__G.war.carrier.guns.map(g => g.def.type).sort().join() === 'ciws,ciws,sparrow,sparrow'`);
  // defence polish: every island gun sits in its revetment the way it drove in - nose to the pad, the turret on the slot
  await h.eval(`(window.__seat = __G.ISLANDS.flatMap(I => I.structs.filter(s => s.kind === 'aa' && !s.dead).map(s => { const T = __G.THREE, m = s.mesh, f = new T.Vector3(0, 0, -1).applyQuaternion(m.quaternion), p = I.pad;
    const tp = m.userData.yaw.getWorldPosition(new T.Vector3()), l = Math.hypot(p.x - s.x, p.z - s.z);
    return { t: s.def.type, face: +((f.x * (p.x - s.x) + f.z * (p.z - s.z)) / Math.hypot(f.x, f.z) / l).toFixed(3), off: +Math.hypot(tp.x - s.x, tp.z - s.z).toFixed(2) }; })), __seat.slice(0, 8))`);
  await h.expect(`__seat.length > 10 && __seat.every(q => q.face > 0.97 && q.off < 1.2)`);
  await h.eval(OVERRIDE);
  // the ALBATROSS's fit: a close-in gun and a missile box at each end
  await h.eval(`(window.__cg = __G.war.carrier.guns[0].mesh.getWorldPosition(new __G.THREE.Vector3()), window.__cg2 = __G.war.carrier.guns[1].mesh.getWorldPosition(new __G.THREE.Vector3()), 1)`);
  await h.eval(park('__cg.x', '__cg.z', 60, 30, 1.5));
  await h.eval(`(() => { const a = __cg, b = __cg2; window.__mid = { x: (a.x + b.x) / 2, y: a.y, z: (a.z + b.z) / 2 }; return 1; })()`);
  await h.eval(look('__mid', 34, 2.6, 0.32, 1.5));
  await h.wait(1200); await h.shot('albatross-bow-mounts');
  await h.eval(look('__cg', 9, 2.3, 0.15, 1.6)); await h.wait(600); await h.shot('albatross-ciws');
  await h.eval(look('__cg2', 11, -2.4, 0.18, 1.6)); await h.wait(600); await h.shot('albatross-sparrow');
  for (const [isl, type, dist, brg, el] of [['HOME ISLAND', 'shilka|zu23', 14, 0.7, 0.25], ['ANVIL', 'talon', 20, 0.6, 0.22], ['IRONHOLD', 'lance', 14, 0.5, 0.18], ['IRONHOLD', 'talon', 20, -0.6, 0.25]]) {
    await h.eval(`(() => { window.__s = __G.ISLANDS.find(I => I.name === '${isl}').structs.find(s => s.def && /^(${type})$/.test(s.def.type)); return 1; })()`);
    await h.eval(park('__s.x', '__s.z', 40, 25));
    await h.eval(look('__s', dist, brg, el, 1.6));
    await h.wait(1500); await h.shot(`${type.replace('|', '-')}-${isl.split(' ')[0].toLowerCase()}`);
  }
  // command 2 builds an M163 on our island
  await h.eval(`(() => { __G.G.mat = 200; const I = __G.ISLANDS.find(I => I.name === 'PELICAN'); __G.selIsl = I; __G.command(2); const s = I.structs.filter(s => s.kind === 'aa').pop(); window.__v = s; s.building = 0.01; return s.def.type; })()`);
  await h.expect(`['vads', 'vadst'].includes(__v.def.type)`);
  await h.eval(park('__v.x', '__v.z', 40, 25));
  await h.eval(look('__v', 12, 0.8, 0.22, 1.4));
  await h.wait(1500); await h.shot('vads-pelican');

  // ---- the fight: a TALON on ANVIL against the player (no peace)
  await h.goto(Q);
  await h.waitFor('window.__G', 10000);
  await h.key('tap', 'Enter'); await h.wait(1200);
  await h.eval(OVERRIDE);
  await h.eval(`(() => { __G.G.bench = true; const I = __G.ISLANDS.find(I => I.name === 'ANVIL'); const t = I.structs.find(s => s.def && s.def.type === 'talon'); window.__t = t;
    for (const s of I.structs) if (s.kind === 'aa' && s !== t) { s.dead = true; s.mesh.visible = false; }   // one gun, so the test reads clearly
    for (const u of __G.war.units) if (u.type === 'gunship') u.dead = true;
    return [t.x, t.y, t.z].map(v => +v.toFixed(1)); })()`);
  // out in the open, 120 m off, 45 m up: it locks, fires tracer / airbursts, then a missile
  await h.eval(`(() => { const t = __t, I = __G.ISLANDS.find(I => I.name === 'ANVIL'), a = Math.atan2(t.x - I.x, t.z - I.z);
    const px = t.x + Math.sin(a) * 120, pz = t.z + Math.cos(a) * 120; __G.H.reset(new __G.THREE.Vector3(px, Math.max(__G.terrainH(px, pz), 0) + 45, pz), Math.atan2(-(t.x - px), -(t.z - pz)), false, 1); __G.HI.setCollective(0.47); return 1; })()`);
  await h.waitFor(`__t.def.key === 'P' && __t.def.lockT > 0.3`, 15000);
  await h.eval(`({ lock: +__t.def.lockT.toFixed(2), d: +__t.def.d.toFixed(0), los: __t.def.los, lamp: __t.mesh.userData.lamp.visible })`);
  await h.waitFor(`__G.war.defence.missiles.length > 0 && __G.war.defence.missiles[0].age > 0.6`, 20000);
  await h.eval(`(() => { const t = __t, p = __G.H.pos, mx = (t.x + p.x) / 2, mz = (t.z + p.z) / 2, dx = p.x - t.x, dz = p.z - t.z, l = Math.hypot(dx, dz);
    window.__ov = { p: [mx + dz / l * 70, Math.max(t.y, 0) + 30, mz - dx / l * 70], t: [mx, (t.y + p.y) / 2, mz] }; return { lock: +__t.def.lockT.toFixed(2), missiles: __G.war.defence.missiles.length }; })()`);
  await h.wait(500); await h.shot('missile-inbound');
  await h.expect(`document.getElementById('feed').textContent.includes('MISSILE LAUNCH')`);
  // drop low behind a hill: the lock bleeds away and nothing new fires
  await h.eval(`(() => { const I = __G.ISLANDS.find(I => I.name === 'ANVIL'), t = __t, L = __G.war.defence.los; let best = null;
    let bd = 1e9;   // the nearest spot within 220 m of the truck that it cannot see at 4, 10 or 18 m above the ground
    for (let x = t.x - 220; x <= t.x + 220; x += 8) for (let z = t.z - 220; z <= t.z + 220; z += 8) { const d = Math.hypot(x - t.x, z - t.z), g = Math.max(__G.terrainH(x, z), 0);
      if (d > 60 && d < 220 && d < bd && [4, 10, 18].every(u => !L(t.x, t.y + 3, t.z, x, g + u, z))) { best = [x, z]; bd = d; } }
    if (!best) return 'no hidden spot';
    window.__ov = null; __G.H.reset(new __G.THREE.Vector3(best[0], Math.max(__G.terrainH(best[0], best[1]), 0) + 8, best[1]), Math.atan2(-(t.x - best[0]), -(t.z - best[1])), false, 1); __G.HI.setCollective(0.47); window.__hid = best; return best.map(v => +v.toFixed(0)); })()`);
  await h.wait(5000);
  await h.eval(`({ key: String(__t.def.key), los: __t.def.los, lock: +__t.def.lockT.toFixed(2), py: +__G.H.pos.y.toFixed(1), msl: __G.war.defence.missiles.length })`);
  await h.expect(`!__t.def.los && __t.def.lockT < 0.5`);
  await h.shot('hidden');
}
