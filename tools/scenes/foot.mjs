// ON FOOT (FOUNDATION): get out of the Huey on the ALBATROSS's deck, walk the deck while the carrier sails and turns
// (platform-relative: you stay on your deck spot), climb the island ladders to its roof, go over the side and swim to the
// stern ladder and climb back aboard, walk an island pad, get back in the Huey and take off.

export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 30000);
  // helpers: the soldier in the carrier's frame
  await h.eval(`(window.__F = {
    W: () => __G.foot.W,
    loc: () => { const c = __G.war.carrier, W = __G.foot.W; const s = __G.GR.toShip(c, W.x, W.y, W.z); return { x: +s.x.toFixed(2), z: +s.z.toFixed(2), y: +s.y.toFixed(2) }; },
    state: () => { const W = __G.foot.W, c = __G.war.carrier; return { craft: __G.G.craft, x: +W.x.toFixed(1), y: +W.y.toFixed(2), z: +W.z.toFixed(1), plat: W.plat ? W.plat.type : null, swim: W.swim, ladder: !!W.ladder, stance: W.stance, surface: W.surface, onGround: W.onGround, ship: [+c.p.x.toFixed(1), +c.p.z.toFixed(1), +c.yaw.toFixed(3)], alive: __G.foot.alive }; },
    place: (lx, lz, yawRel) => { const c = __G.war.carrier, w = __G.GR.toWorld(c, lx, lz); return __G.foot.spawnAt({ x: w.x, y: c.p.y + 8, z: w.z, yaw: c.yaw + yawRel }); },
  }, 1)`);
  // 1. get out: collective is down on the deck
  await h.key('tap', 'KeyY'); await h.wait(500);
  await h.expect("__G.G.craft === 'foot' && __G.foot.exists && __G.foot.W.plat === __G.war.carrier");
  await h.eval('__F.state()');
  await h.eval('(__G.marine.aim(__G.marine.S.yaw + 2.2, -0.05), 1)'); await h.wait(1200);
  await h.shot('out-on-deck-first-person');
  await h.eval("(__G.marine.view = 'third', 1)"); await h.wait(1200); await h.shot('out-on-deck-third-person');
  await h.expect('Math.hypot(__G.foot.W.x - __G.H.pos.x, __G.foot.W.z - __G.H.pos.z) < 5');
  // 2. the carrier sails and turns; standing still, the soldier keeps his deck spot
  await h.eval(`(() => { const c = __G.war.carrier; __G.war.orderCarrier(c.p.x - Math.sin(c.yaw + 0.8) * 600, c.p.z - Math.cos(c.yaw + 0.8) * 600); window.__l0 = __F.loc(); window.__s0 = [c.p.x, c.p.z, c.yaw]; return __l0; })()`);
  await h.waitFor('(() => { const c = __G.war.carrier; return Math.hypot(c.p.x - __s0[0], c.p.z - __s0[1]) > 12 && Math.abs(c.yaw - __s0[2]) > 0.05; })()', 60000);
  await h.eval('({ before: __l0, after: __F.loc(), state: __F.state() })');
  await h.expect('Math.hypot(__F.loc().x - __l0.x, __F.loc().z - __l0.z) < 0.15 && Math.abs(__F.loc().y - 8) < 0.1 && __G.foot.W.onGround');
  // 3. walk forward along the deck while she steams: the walk is relative to the deck
  await h.eval("(__G.marine.aim(__G.war.carrier.yaw, 0), __G.marine.view = 'first', window.__l1 = __F.loc(), 1)");
  await h.key('down', 'KeyW'); await h.waitFor('__l1.z - __F.loc().z > 8', 30000); await h.key('up', 'KeyW');
  await h.eval('({ from: __l1, to: __F.loc(), state: __F.state() })');
  await h.expect('Math.abs(__F.loc().x - __l1.x) < 1 && __G.foot.W.plat === __G.war.carrier');
  await h.shot('walking-the-deck-under-way');
  // 4. the island ladder (NAVAL: two flights from the model, parts.ladders): the lower one up the island's port face to
  // the O-7 catwalk, aft along it, the caged upper one to the island top deck
  await h.eval('(() => { const L = __G.war.carrier.parts.ladders[0]; __F.place(L.lx - 2.4, L.lz, -Math.PI / 2); return 1; })()');   // facing +x (starboard)
  await h.key('down', 'KeyW'); await h.waitFor('!!__G.foot.W.ladder', 20000);
  await h.eval('__F.state()');
  await h.waitFor('!__G.foot.W.ladder && __G.foot.W.onGround', 30000); await h.key('up', 'KeyW');
  await h.eval("(__G.marine.aim(__G.war.carrier.yaw + Math.PI, 0), 1)");
  await h.key('down', 'KeyW'); await h.waitFor('__F.loc().z > __G.war.carrier.parts.ladders[1].lz - 0.1', 20000); await h.key('up', 'KeyW');
  await h.eval("(__G.marine.aim(__G.war.carrier.yaw - Math.PI / 2, 0), 1)");
  await h.key('down', 'KeyW'); await h.waitFor('!!__G.foot.W.ladder', 20000);
  await h.waitFor('__G.foot.W.y > __G.war.carrier.p.y + 21 && !__G.foot.W.ladder', 60000); await h.key('up', 'KeyW');
  await h.eval('({ loc: __F.loc(), state: __F.state() })');
  await h.expect('Math.abs(__F.loc().y - 21.33) < 0.2 && __G.foot.W.onGround');
  await h.eval("(__G.marine.aim(__G.war.carrier.yaw + Math.PI * 0.75, -0.35), 1)"); await h.wait(800);
  await h.shot('on-the-island-roof');
  // 5. over the side: off the port deck edge into the sea, swim aft to the stern ladder, climb back aboard
  await h.eval('(__F.place(-11, 30, Math.PI / 2), 1)');   // facing -x (port), 3 m from the edge
  await h.key('down', 'KeyW'); await h.waitFor('__G.foot.W.swim', 30000); await h.key('up', 'KeyW');
  await h.eval('__F.state()'); await h.wait(600); await h.shot('swimming-beside-the-hull');
  await h.eval('(() => { const c = __G.war.carrier; c.path = []; c.goal = null; c.speed = 0; c.v.set(0, 0, 0); const w = __G.GR.toWorld(c, -7, 62); const W = __G.foot.W; W.x = w.x; W.z = w.z; W.y = -1.3; __G.marine.aim(c.yaw, 0); W.vx = W.vz = 0; W.plat = null; W.loc = null; return 1; })()');
  await h.key('down', 'KeyW'); await h.waitFor('__G.foot.W.ladder', 20000);
  await h.eval('__F.state()'); await h.wait(300); await h.eval("(__G.marine.view = 'third', 1)"); await h.wait(500); await h.shot('stern-ladder');
  await h.waitFor('!__G.foot.W.ladder && __G.foot.W.onGround', 40000); await h.key('up', 'KeyW');
  await h.eval('({ loc: __F.loc(), state: __F.state() })');
  await h.expect('Math.abs(__G.foot.W.y - __G.war.deckY(__G.foot.W.x, __G.foot.W.z)) < 0.1 && __G.foot.W.plat === __G.war.carrier');
  await h.eval("(__G.marine.view = 'first', 1)");
  // 6. an island pad (the home island): walk onto it from the grass
  await h.eval('(() => { const p = __G.PAD; return __G.foot.spawnAt({ x: p.x + 16, y: p.h, z: p.z, yaw: Math.PI / 2 }); })()');
  await h.key('down', 'KeyW'); await h.waitFor('Math.hypot(__G.foot.W.x - __G.PAD.x, __G.foot.W.z - __G.PAD.z) < 4', 30000); await h.key('up', 'KeyW');
  await h.eval('__F.state()');
  await h.expect("__G.foot.W.onGround && Math.abs(__G.foot.W.y - __G.PAD.h) < 0.3 && __G.foot.W.surface === 'road'");
  await h.eval("(__G.marine.view = 'third', __G.marine.aim(__G.marine.S.yaw + Math.PI, 0), 1)"); await h.wait(900); await h.shot('on-the-home-pad');
  // war hooks: what war.js sees of a soldier, and a round's hit point routed to a body part
  await h.eval("__G.marine.input({ stance: 'prone' })"); await h.waitFor("__G.foot.W.stance === 'prone' && __G.foot.W.eye < 0.4", 10000);
  await h.eval("({ kind: __G.PL.kind, hitR: __G.PL.hitR, detect: __G.PL.detect, sight: __G.PL.sight, capTime: __G.PL.capTime, landed: __G.PL.landed, alive: __G.PL.alive })");
  await h.expect("__G.PL.kind === 'foot' && __G.PL.hitR < 0.4 && __G.PL.detect < 0.25 && __G.PL.landed && __G.PL.capTime === 12");
  await h.eval("__G.marine.input({ stance: 'stand' })"); await h.waitFor("__G.foot.W.stance === 'stand' && __G.foot.W.eye > 1.5", 10000);
  // a WASP bolt through the chest and one through the legs: body parts from the round's closest point (MEDINV wounds)
  await h.eval("(() => { const W = __G.foot.W, M = __G.marine.M; M.restore(); M.log.length = 0; __G.hurtPlayer(0.2, 'HIT', { x: W.x, y: W.y + 1.3, z: W.z }, { x: 50, y: 0, z: 0 }, 'b'); __G.hurtPlayer(0.2, 'HIT', { x: W.x + 0.1, y: W.y + 0.45, z: W.z }, { x: 50, y: 0, z: 0 }, 'b'); return { hits: M.log.filter(e => e.type === 'hit').map(e => e.region + '/' + e.zone + ' ' + e.hp + (e.penetrated ? '' : ' (armour)')), alive: __G.foot.alive, blood: M.vitals().bloodMl }; })()");
  await h.expect("(() => { const hs = __G.marine.M.log.filter(e => e.type === 'hit'); return hs.length === 2 && hs[0].region === 'thorax' && hs[1].region.startsWith('leg') && __G.foot.alive; })()");
  await h.eval('(__G.marine.M.restore(), 1)');
  await h.eval("(__G.marine.view = 'first', 1)");
  // 7. back to the Huey (on the deck), get in by the pilot's door, take off
  await h.eval(`(() => { const c = __G.war.carrier, d = __G.crafts.toWorld(__G.heliC, [2.6, -1.84, -1.9]); return __G.foot.spawnAt({ x: d.x, y: c.p.y + 8, z: d.z, yaw: d.yaw + Math.PI / 2 }); })()`);
  await h.wait(500);
  await h.eval("document.getElementById('hint').textContent");
  await h.expect("document.getElementById('hint').textContent.startsWith('Y: GET IN THE UH-1H')");
  await h.shot('at-the-huey-door');
  await h.key('tap', 'KeyY'); await h.wait(500);
  await h.expect("__G.G.craft === 'heli' && !__G.foot.exists");
  await h.key('down', 'Space'); await h.waitFor('!__G.H.landed && __G.H.agl > 4', 30000); await h.key('up', 'Space');
  await h.eval('({ agl: __G.H.agl, alive: __G.Z.alive, craft: __G.G.craft })');
  await h.expect('__G.Z.alive && __G.H.agl > 4');
  await h.wait(800); await h.shot('took-off-again');
}
