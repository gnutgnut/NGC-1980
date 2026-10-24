// NAVAL: the ALBATROSS island ladders as a Marine climbs them. The ladders come from the ship model
// (parts.ladders, drawn by albatross.js) and ground.js reads them: walk up to the lower flight on the island's port
// face, climb to the O-7 catwalk, step off, walk aft to the caged upper flight, climb to the island top deck, step
// off and walk across it. Third-person shots on the rungs show the hands on the ladder. Then the stern Jacob's ladder.
//   node snap.mjs scenes/ladder.mjs
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.6');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 30000);
  await h.eval(`(window.__F = {
    loc: () => { const c = __G.war.carrier, W = __G.foot.W; const s = __G.GR.toShip(c, W.x, W.y, W.z); return { x: +s.x.toFixed(2), z: +s.z.toFixed(2), y: +s.y.toFixed(2) }; },
    state: () => { const W = __G.foot.W; return { loc: __F.loc(), ladder: W.ladder ? W.ladder.name : null, onGround: W.onGround }; },
    place: (lx, lz, yawRel) => { const c = __G.war.carrier, w = __G.GR.toWorld(c, lx, lz); return __G.foot.spawnAt({ x: w.x, y: c.p.y + 8, z: w.z, yaw: c.yaw + yawRel }); },
    L: () => __G.war.carrier.parts.ladders,
    // the third-person camera: from behind-left of the climber, looking at his hands
    cam: (dx, dy, dz) => { const c = __G.war.carrier, W = __G.foot.W, T = __G.THREE, co = Math.cos(c.yaw), si = Math.sin(c.yaw);
      const p = new T.Vector3(W.x + dx * co + dz * si, W.y + dy, W.z - dx * si + dz * co); window.__cam = { p, t: new T.Vector3(W.x + 0.45 * co, W.y + 1.5, W.z - 0.45 * si) }; },
  }, 1)`);
  // a scripted camera on top of the game's (only while window.__cam is set)
  await h.eval(`(() => { const r = __G.renderer, orig = r.render.bind(r); r.render = (sc, cam) => { const C = window.__cam; if (C) { cam.position.copy(C.p); cam.up.set(0, 1, 0); cam.lookAt(C.t); cam.updateMatrixWorld(); } orig(sc, cam); }; return 1; })()`);
  await h.key('tap', 'KeyY'); await h.wait(500);
  await h.expect("__G.G.craft === 'foot' && __G.foot.exists");
  await h.eval('__F.L().map(L => [L.name, +L.lx.toFixed(2), +L.lz.toFixed(2), +L.y0.toFixed(2), +L.y1.toFixed(2)])');
  await h.expect('__F.L().length === 3 && __F.L().every(L => L.drawn)', 'the carrier exports its three ladders');
  // the lower flight: stand on the deck abeam it, face the island (+x) and walk in
  await h.eval(`(() => { const L = __F.L()[0]; __F.place(L.lx - 2.4, L.lz, -Math.PI / 2); return 1; })()`);
  await h.eval("(__G.marine.view = 'third', 1)");
  await h.key('down', 'KeyW'); await h.waitFor('!!__G.foot.W.ladder', 20000);
  await h.wait(1600); await h.eval('__F.state()');
  await h.expect("__G.foot.W.ladder && __G.foot.W.ladder.name === 'ISLAND LADDER'", 'on the lower flight');
  await h.eval('(__F.cam(-2.6, 1.0, 1.9), 1)'); await h.wait(700); await h.shot('lower-flight-hands-on-rungs');
  await h.eval('(window.__cam = null, 1)');
  await h.waitFor('!__G.foot.W.ladder && __G.foot.W.onGround', 30000); await h.key('up', 'KeyW');
  await h.eval('__F.state()');
  await h.expect('Math.abs(__F.loc().y - 14.4) < 0.15', 'stepped off onto the O-7 catwalk (6.4 m up the island)');
  // walk aft along the catwalk to the upper flight, face it, climb
  await h.eval("(__G.marine.aim(__G.war.carrier.yaw + Math.PI, 0), 1)");
  await h.key('down', 'KeyW'); await h.waitFor(`__F.loc().z > __F.L()[1].lz - 0.1`, 20000); await h.key('up', 'KeyW');
  await h.eval('__F.state()');
  await h.expect('Math.abs(__F.loc().y - 14.4) < 0.15 && __G.foot.W.onGround', 'walked the catwalk');
  await h.eval("(__G.marine.aim(__G.war.carrier.yaw - Math.PI / 2, 0), 1)");
  await h.key('down', 'KeyW'); await h.waitFor('!!__G.foot.W.ladder', 20000); await h.wait(2200);
  await h.expect("__G.foot.W.ladder && __G.foot.W.ladder.name === 'ISLAND LADDER (UPPER)'", 'on the caged upper flight');
  await h.eval('(__F.cam(-2.8, 0.6, 2.2), 1)'); await h.wait(700); await h.shot('upper-flight-in-the-cage');
  await h.eval('(window.__cam = null, 1)');
  await h.waitFor('!__G.foot.W.ladder && __G.foot.W.onGround', 30000); await h.key('up', 'KeyW');
  await h.eval('__F.state()');
  await h.expect('Math.abs(__F.loc().y - 21.33) < 0.15', 'stepped off onto the island top deck');
  // walk across the top deck to starboard and back aft a little: it holds you, the rails stop you
  await h.eval("(__G.marine.aim(__G.war.carrier.yaw - Math.PI / 2, 0), window.__t0 = __F.loc(), 1)");
  await h.key('down', 'KeyW'); await h.wait(3500); await h.key('up', 'KeyW');
  await h.eval('({ from: __t0, to: __F.loc() })');
  await h.expect('Math.abs(__F.loc().y - 21.33) < 0.15 && __F.loc().x > __t0.x + 2 && __F.loc().x < 13.2', 'walked the top deck to the starboard rail');
  await h.eval('(__F.cam(-6, 3.5, 5), 1)'); await h.wait(700); await h.shot('on-the-island-top-deck');
  await h.eval('(window.__cam = null, 1)');
  // the stern Jacob's ladder, from the water
  await h.eval('(() => { const c = __G.war.carrier; c.path = []; c.goal = null; c.speed = 0; c.v.set(0, 0, 0); const w = __G.GR.toWorld(c, -7, 62); const W = __G.foot.W; W.x = w.x; W.z = w.z; W.y = -1.3; __G.marine.aim(c.yaw, 0); W.vx = W.vz = 0; W.plat = null; W.loc = null; return 1; })()');
  await h.key('down', 'KeyW'); await h.waitFor('!!__G.foot.W.ladder', 20000); await h.wait(2500);
  await h.eval('(__F.cam(-2.5, 0.8, 2.6), 1)'); await h.wait(700); await h.shot('stern-jacobs-ladder');
  await h.eval('(window.__cam = null, 1)');
  await h.waitFor('!__G.foot.W.ladder && __G.foot.W.onGround', 40000); await h.key('up', 'KeyW');
  await h.expect('Math.abs(__F.loc().y - 8) < 0.15', 'back aboard over the fantail');
}
