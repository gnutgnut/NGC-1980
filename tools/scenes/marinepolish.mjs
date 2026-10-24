// THE 1980 MARINE, polish batch 2 (ngc/marine-polish), the player's side, on the ALBATROSS:
//   1. the Marine's kit close up (third person): M1 helmet, M1955 flak vest, LC-2 belt and suspenders, M67s on the
//      ammo pouches, the M7 bayonet, the e-tool carrier, canteens, the ALICE medium pack with its poncho roll
//   2. SELF AID (K): a leg wound bleeding - K picks the FM 21-11 next step from his own kit (a field dressing / the
//      cravat), the rifle goes down, both hands on the wound (first and third person); it finishes and the bleeding drops
//   3. the island ladder: first person, both hands on the rails, the rifle slung; third person on the rungs
//   4. swimming off the ship's side: first-person breaststroke hands, third-person stroke
//   5. an M67 cooked in the hand and he is knocked out: it falls LIVE at his feet and goes off (last: it may kill him)
//   CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/marinepolish.mjs
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 30000);
  await h.eval(`(window.__F = {
    m: () => __G.marine,
    loc: () => { const c = __G.war.carrier, W = __G.foot.W, s = __G.GR.toShip(c, W.x, W.y, W.z); return { x: +s.x.toFixed(2), z: +s.z.toFixed(2), y: +s.y.toFixed(2) }; },
    place: (lx, lz, yawRel) => { const c = __G.war.carrier, w = __G.GR.toWorld(c, lx, lz); return __G.foot.spawnAt({ x: w.x, y: c.p.y + 8, z: w.z, yaw: c.yaw + yawRel }); },
    L: () => __G.war.carrier.parts.ladders,
    // a camera around the Marine: (yaw from his facing, distance, height, look-at height)
    orbit: (yaw, d, hgt, ty = 1.1) => { const W = __G.foot.W, S = __G.marine.S, T = __G.THREE, a = S.yaw + yaw; window.__cam = { p: new T.Vector3(W.x - Math.sin(a) * d, W.y + hgt, W.z - Math.cos(a) * d), t: new T.Vector3(W.x, W.y + ty, W.z) }; },
  }, 1)`);
  await h.eval(`(() => { const r = __G.renderer, orig = r.render.bind(r); r.render = (sc, cam) => { const C = window.__cam; if (C && cam === __G.zCam) { cam.position.copy(C.p); cam.up.set(0, 1, 0); cam.lookAt(C.t); cam.updateMatrixWorld(); } orig(sc, cam); }; return 1; })()`);
  await h.key('tap', 'KeyY'); await h.wait(600);
  await h.expect("__G.G.craft === 'foot' && __G.foot.exists && !!__G.marine", 'out of the Huey as the Marine');
  // ---- 1. the kit, close up (third person)
  await h.eval(`(() => { __F.place(10, 30, 0.3); __G.marine.view = 'third'; return 1; })()`); await h.wait(1500);
  await h.eval(`(__F.orbit(-0.55, 2.3, 1.45, 1.05), 1)`); await h.wait(900); await h.shot('kit-front');
  await h.eval(`(__F.orbit(2.5, 2.4, 1.5, 1.05), 1)`); await h.wait(900); await h.shot('kit-back');
  await h.eval(`(__F.orbit(-1.57, 1.3, 1.0, 0.95), 1)`); await h.wait(900); await h.shot('kit-left-hip');
  await h.eval(`(window.__cam = null, 1)`);
  // ---- 2. self aid with K
  await h.eval(`(() => { const M = __G.marine.M; M.hit({ part: 'legL', dmg: 26, pen: 99, kind: 'bullet', bleed: 1.6, source: 'TEST' }, []); return { bleed: Math.round(M.bleedRate()), bleeds: M.bleeds.filter(b => !b.stopped).map(b => b.type + ' ' + b.region) }; })()`);
  await h.wait(600);
  await h.eval(`(window.__b0 = __G.marine.M.bleedRate(), __G.marine.view = 'first', __G.marine.aim(__G.marine.S.yaw, -0.75), __G.marine.key('KeyK'), { action: __G.marine.M.action && { label: __G.marine.M.action.label, T: __G.marine.M.action.T, kind: __G.marine.M.action.kind, region: __G.marine.M.action.region } })`);
  await h.expect(`!!__G.marine.M.action && __G.marine.M.action.by.self`, 'K: self aid from his own kit (FM 21-11: the next thing to do for the worst bleed)');
  await h.waitFor(`__G.marine.BV.k > 0.9 && __G.marine.TV.k > 0.9`, 15000);
  await h.expect(`__G.marine.BV.mode === 'aid' && __G.marine.TV.k > 0.9`, 'first person: the rifle down on its sling, both hands on the wound');
  await h.shot('self-aid-first-person');
  await h.eval(`(__G.marine.view = 'third', __F.orbit(-0.9, 2.4, 1.3, 0.6), 1)`); await h.wait(1500); await h.shot('self-aid-third-person');
  await h.eval(`(window.__cam = null, __G.marine.view = 'first', 1)`);
  await h.eval(`(() => { const st = __G.marine.hud(); return { hint: st.hint }; })()`);
  await h.expect(`/SELF AID/.test(__G.marine.hud().hint)`, 'the HUD counts the self aid down');
  await h.waitFor(`!__G.marine.M.action`, 120000);
  await h.eval(`({ was: Math.round(__b0), now: Math.round(__G.marine.M.bleedRate()), dressed: __G.marine.M.bleeds.filter(b => b.dressed).length, tq: __G.marine.M.regions.legL.tq.length })`);
  await h.expect(`__G.marine.M.bleedRate() < __b0 * 0.6 && (__G.marine.M.bleeds.some(b => b.dressed) || __G.marine.M.regions.legL.tq.length > 0)`, 'done: the bleeding is under control');
  await h.waitFor(`__G.marine.BV.k < 0.05`, 15000);
  // ---- 3. the island ladder
  await h.eval(`(() => { const L = __F.L()[0]; __F.place(L.lx - 2.4, L.lz, -Math.PI / 2); __G.marine.view = 'first'; return 1; })()`);
  await h.key('down', 'KeyW'); await h.waitFor('!!__G.foot.W.ladder', 20000);
  await h.wait(1200); await h.key('up', 'KeyW');
  await h.eval(`(__G.marine.aim(__G.marine.S.yaw, 0.15), { y: __F.loc().y, mode: __G.marine.BV.mode, k: __G.marine.BV.k })`);
  await h.expect(`__G.foot.W.ladder && __G.marine.BV.mode === 'ladder' && __G.marine.BV.k > 0.9 && !__G.marine.vm.model.group.visible`, 'on the ladder: first person, hands on the rails, the rifle slung (not in the hands)');
  await h.shot('ladder-first-person');
  await h.eval(`(() => { const W = __G.foot.W, a = __G.marine.S.yaw, T = __G.THREE; window.__cam = { p: new T.Vector3(W.x + Math.sin(a) * 2.6 + Math.cos(a) * 1.6, W.y + 1.4, W.z + Math.cos(a) * 2.6 - Math.sin(a) * 1.6), t: new T.Vector3(W.x, W.y + 1.3, W.z) }; __G.marine.view = 'third'; return 1; })()`);
  await h.key('down', 'KeyW'); await h.wait(500); await h.key('up', 'KeyW'); await h.wait(900); await h.shot('ladder-third-person');
  await h.eval(`(window.__cam = null, __G.marine.view = 'first', 1)`);
  await h.key('tap', 'Space'); await h.wait(1500);
  // ---- 4. swimming off the port side
  await h.eval(`(() => { const c = __G.war.carrier, w = __G.GR.toWorld(c, -48, 40); __G.foot.spawnAt({ x: w.x, y: -1.3, z: w.z, yaw: c.yaw + Math.PI / 2 }, { force: true }); __G.marine.view = 'first'; __G.marine.aim(c.yaw + Math.PI / 2, -0.25); return { depth: -__G.terrainH(w.x, w.z) }; })()`);
  await h.wait(1200);
  await h.key('down', 'KeyW'); await h.waitFor(`__G.foot.W.swim && Math.hypot(__G.foot.W.vx, __G.foot.W.vz) > 0.3 && __G.marine.BV.k > 0.9`, 20000);
  await h.wait(800);
  await h.expect(`__G.foot.W.swim && __G.marine.BV.mode === 'swim'`, 'swimming: first-person breaststroke, the rifle slung');
  await h.shot('swim-first-person');
  await h.eval(`(__G.marine.view = 'third', __F.orbit(-0.7, 3.2, 1.6, 0.0), 1)`); await h.wait(1200); await h.shot('swim-third-person');
  await h.key('up', 'KeyW');
  await h.eval(`(window.__cam = null, 1)`);
  // ---- 5. a cooked M67 and his throwing arm is hit: it falls live
  await h.eval(`(() => { __F.place(-6, -60, 0); __G.marine.view = 'third'; __G.marine.M.restore(); return 1; })()`); await h.wait(1500);
  await h.eval(`(__G.marine.input({ throwHeld: true }), __G.marine.key('KeyG'), { th: __G.marine.throwState() && __G.marine.throwState().phase })`);
  await h.waitFor(`__G.marine.throwState() && __G.marine.throwState().phase === 'cook' && __G.marine.throwState().cook > 0.5`, 20000);
  await h.eval(`(window.__d0 = __G.marine.stats.dropped || 0, window.__bo = __G.marine.stats.booms || 0, __G.marine.M.regions.armR.hp = 0, 1)`);   // (his throwing arm hit: the hand won't hold it)
  await h.waitFor(`(__G.marine.stats.dropped || 0) > __d0`, 10000);
  await h.eval(`(() => { const g = __G.marine.lastThrow; window.__cam = { p: new __G.THREE.Vector3(g.x + 1.6, g.y + 1.1, g.z + 1.6), t: new __G.THREE.Vector3(g.x, g.y, g.z) }; return { fuse: +g.fuse.toFixed(2), dropped: !!g.dropped, th: __G.marine.throwState() }; })()`);
  await h.expect(`__G.marine.lastThrow.dropped && __G.marine.lastThrow.fuse < 4.2 && !__G.marine.throwState()`, 'his throwing arm hit with the spoon gone: the M67 falls at his feet, live');
  await h.shot('dropped-live-grenade');
  await h.waitFor(`(__G.marine.stats.booms || 0) > __bo`, 20000);
  await h.expect(`(__G.marine.stats.booms || 0) > __bo`, 'and it goes off');
}
