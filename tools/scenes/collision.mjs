// COLLISION (wave 3 #3): the one collision world in the real game (game/js/collision.js).
//   1. an M151A2 driven (an AI follower, no avoidance) into an M60A3 at ~30 km/h: the jeep stops at the hull, the tank
//      barely moves
//   2. the M60A3 drives through a parked Beetle: the car is shoved ahead of it (mass: 52.6 t against 0.8 t)
//   3. two AI M151s driving head-on along the same line: both keep right and pass, and get where they were going
//   4. a Huey (rotor turning) set beside a tree, the disc into its crown: a ROTOR STRIKE (main rotor damaged, the tree down)
//   5. on the ALBATROSS deck: a HORNET taxiing at ~9 kt into a parked TOMCAT stops at its tail, damaged, not destroyed
//   6. the Marine walks into the parked Hornet's wing and is blocked by it (a compound body: fuselage, wings, tails)
// The scene's own camera (window.__cam) frames each test; sims run in real time (headless: a few fps), so every wait is
// on the game's state.     node snap.mjs scenes/collision.mjs
const HOOK = `(() => { const G = __G, T = G.THREE, r = G.renderer, cam = new T.PerspectiveCamera(50, 1, 0.3, 2500), orig = r.render.bind(r);
  const t = new T.Vector3(), p = new T.Vector3();
  r.render = (s, c) => {
    const m = window.__cam; if (c !== G.zCam || !m) return orig(s, c);
    p.set(...m.at); t.set(...m.look);
    { const gy = Math.max(G.terrainH(p.x, p.z), 0); if (p.y < gy + 1.2) p.y = gy + 1.2; }
    cam.position.copy(p); cam.up.set(0, 1, 0); cam.lookAt(t); cam.aspect = c.aspect; cam.updateProjectionMatrix();
    return orig(s, cam);
  };
  return true; })()`;
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 40000);
  await h.eval(HOOK);
  await h.eval(`(window.__C = {
    pos: V => V.sim ? { x: V.sim.pos[0], z: V.sim.pos[2] } : (o => ({ x: o[0], z: o[2] }))(V.fm.origin()),
    spd: V => V.sim ? Math.hypot(V.sim.vel[0], V.sim.vel[2]) : Math.hypot(V.fm.vel[0], V.fm.vel[2]),
    // a straight, flat, clear line on the home island near its pad (no parked vehicle, tree, wall within 2.8 m of it,
    // the fenced cave shaft 13.5 m away, the ground within 1.2 m of the middle's height), nearest the pad first
    line: (L = 32) => { const I = __G.HOME_B.isl, p = I.pad, T = __G.terrainH, C = [];
      for (let i = -9; i <= 9; i++) for (let j = -9; j <= 9; j++) C.push([p.x + i * 6, p.z + j * 6]);
      C.sort((a, b) => Math.hypot(a[0] - p.x, a[1] - p.z) - Math.hypot(b[0] - p.x, b[1] - p.z));
      for (const [mx, mz] of C) { const h0 = T(mx, mz); if (h0 < 2) continue;
        for (let k = 0; k < 12; k++) { const a = k * Math.PI / 12, dx = Math.cos(a), dz = Math.sin(a); let ok = true;
          for (let s = -L; s <= L && ok; s += 2) { const x = mx + dx * s, z = mz + dz * s; if (Math.abs(T(x, z) - h0) > 1.2 || !__G.GR.clearAt(x, z, 2.8) || __G.BASES.some(b => Math.hypot(b.x - x, b.z - z) < 13.5)) ok = false; }
          if (ok) return { a, dx, dz, x0: mx - dx * L, z0: mz - dz * L, x1: mx + dx * L, z1: mz + dz * L, mx, mz, yaw: Math.atan2(-dx, -dz) }; } }
      return null; },
    look: (x, z, d = 26, hh = 12, a = 0.8) => { const y = __G.terrainH(x, z); window.__cam = { at: [x + Math.cos(a) * d, y + hh, z + Math.sin(a) * d], look: [x, y + 1, z] }; return true; },
    rec: null, track: (f, ms = 100) => { clearInterval(__C.tI); __C.rec = { n: 0 }; __C.tI = setInterval(() => { try { f(__C.rec); __C.rec.n++; } catch (e) { __C.rec.err = String(e); } }, ms); },
    stop: () => { clearInterval(__C.tI); return __C.rec; },
  }, 1)`);
  await h.key('tap', 'KeyY'); await h.wait(500);   // out of the Huey: it stays on the deck, rotor turning (the AI tests run without us)
  await h.expect("__G.G.craft === 'foot'", 'on foot on the ALBATROSS deck'); await h.eval("(__G.foot.view = 'third', __G.marine.view = 'third', 1)");   // (no first-person arms over the scene's camera)
  await h.eval(`(window.__L = __C.line()) && { a: +__L.a.toFixed(2), mid: [Math.round(__L.mx), Math.round(__L.mz)] }`, 'a clear line on the home island');
  if (!await h.expect('!!window.__L', 'found a clear 64 m line on the home island')) return;

  // ---------------------------------------------------------------- 1. a jeep into a tank
  await h.eval(`(() => { const L = __L, P = __G.pool;
    const T = __G.m60C.spawnAt({ x: L.mx, z: L.mz, yaw: L.yaw + Math.PI / 2 });   // across the line
    window.__T0 = __C.pos(T);
    const J = P.spawnM151({ x: L.x0 + L.dx * 6, z: L.z0 + L.dz * 6, yaw: L.yaw, exact: true }, { running: true }); window.__J = J;
    P.autopilot(J, [{ x: L.mx, z: L.mz }, { x: L.x1, z: L.z1 }], 9, { avoid: false });
    __C.look(L.mx, L.mz, 24, 9, L.a + 1.9);
    __C.track(r => { const j = __C.pos(J), t = __C.pos(__G.m60C), s = (j.x - t.x) * L.dx + (j.z - t.z) * L.dz; r.vmax = Math.max(r.vmax || 0, __C.spd(J)); r.sMax = Math.max(r.sMax ?? -99, s); r.tmove = Math.hypot(t.x - __T0.x, t.z - __T0.z); r.jv = __C.spd(J); const c = J._cwb && __G.m60C._cwb ? __G.CW.contact(J._cwb, __G.m60C._cwb) : null; r.pen = Math.max(r.pen || 0, c ? c.depth : 0); });
    return { jeep: __C.pos(J), tank: __T0 }; })()`, 'M60A3 parked across the line, an M151A2 driving at it');
  await h.waitFor('__C.rec && __C.rec.vmax > 6 && __C.rec.jv < 0.6 && __C.rec.n > 30', 90000);
  await h.wait(1200);
  await h.eval('__C.stop()', 'jeep into the tank');
  await h.shot('1-jeep-into-tank');
  await h.expect('__C.rec.vmax > 6', 'the jeep was doing better than 6 m/s (22 km/h)');
  await h.expect('__C.rec.sMax < -2.2 && __C.rec.pen < 0.6', 'it stopped at the hull: its centre never got within 2.2 m of the tanks middle, overlap under 0.6 m');
  await h.expect('__C.rec.tmove < 0.35', 'the tank (52.6 t) barely moved');

  // ---------------------------------------------------------------- 2. the tank pushes a parked car
  await h.eval(`(() => { const L = __L, P = __G.pool; __J.stow();
    const T = __G.m60C.spawnAt({ x: L.x0 + L.dx * 4, z: L.z0 + L.dz * 4, yaw: L.yaw, state: 'hot' });
    const B = P.spawnBeetle({ x: L.x0 + L.dx * 17, z: L.z0 + L.dz * 17, yaw: L.yaw + Math.PI / 2, exact: true }, {}); window.__B = B; window.__B0 = __C.pos(B); window.__TT0 = __C.pos(T);
    T.order([[L.x1 - L.dx * 6, L.z1 - L.dz * 6]], { speed: 3.5, arrive: 3 });
    __C.look(L.x0 + L.dx * 18, L.z0 + L.dz * 18, 28, 10, L.a + 1.4);
    __C.track(r => { const b = __C.pos(B), t = __C.pos(T); r.carMove = (b.x - __B0.x) * L.dx + (b.z - __B0.z) * L.dz; r.tankMove = (t.x - __TT0.x) * L.dx + (t.z - __TT0.z) * L.dz; r.gap = (b.x - t.x) * L.dx + (b.z - t.z) * L.dz; r.minGap = Math.min(r.minGap ?? 99, r.gap); const c = B._cwb && T._cwb ? __G.CW.contact(B._cwb, T._cwb) : null; r.pen = Math.max(r.pen || 0, c ? c.depth : 0); r.cb = !!(B._cwb && B._cwb.enabled); r.asleep = B.asleep; });
    return { car: __B0, tank: __TT0, carMass: Math.round(B.sim.massNow) }; })()`, 'M60A3 ordered down the line, a Beetle parked across it');
  await h.waitFor('__C.rec && (__C.rec.carMove > 6 || __C.rec.tankMove > 40)', 120000);
  await h.wait(800);
  await h.eval('__C.stop()', 'the tank and the car');
  await h.shot('2-tank-pushes-car');
  await h.expect('__C.rec.carMove > 3', 'the car was shoved along the line by the tank');
  await h.expect('__C.rec.pen < 0.7', 'the tank never drove through it (worst overlap under 0.7 m at the headless frame rate): shoved ahead, then aside');

  // ---------------------------------------------------------------- 3. two AI vehicles head-on
  await h.eval(`(() => { const L = __L, P = __G.pool; __G.m60C.stow(); __B.stow();
    const A = P.spawnM151({ x: L.x0 + L.dx * 4, z: L.z0 + L.dz * 4, yaw: L.yaw, exact: true }, { running: true });
    const B = P.spawnM151({ x: L.x1 - L.dx * 4, z: L.z1 - L.dz * 4, yaw: L.yaw + Math.PI, exact: true }, { running: true });
    window.__A = A; window.__Bj = B; window.__gA = { x: L.x1 - L.dx * 2, z: L.z1 - L.dz * 2 }; window.__gB = { x: L.x0 + L.dx * 2, z: L.z0 + L.dz * 2 };
    P.autopilot(A, [{ x: L.mx, z: L.mz }, __gA], 7); P.autopilot(B, [{ x: L.mx + 0.3 * L.dz, z: L.mz - 0.3 * L.dx }, __gB], 7);
    __C.look(L.mx, L.mz, 30, 14, L.a + 1.6);
    __C.track(r => { const a = __C.pos(A), b = __C.pos(B), d = Math.hypot(a.x - b.x, a.z - b.z); r.minD = Math.min(r.minD ?? 99, d); if (__G.CW.contact(A._cwb, B._cwb)) r.hits = (r.hits || 0) + 1; r.dA = Math.hypot(a.x - __gA.x, a.z - __gA.z); r.dB = Math.hypot(b.x - __gB.x, b.z - __gB.z); r.av = (r.av || 0) + (A.auto && A.auto.avoiding ? 1 : 0) + (B.auto && B.auto.avoiding ? 1 : 0); if (d < 9 && !r.shot) r.shot = 1; });
    return true; })()`, 'two M151s on autopilot, head-on along the line');
  await h.waitFor('__C.rec && __C.rec.shot === 1', 60000);
  await h.shot('3-two-jeeps-passing');
  await h.waitFor('__C.rec && __C.rec.dA < 7 && __C.rec.dB < 7', 90000);
  await h.eval('__C.stop()', 'two jeeps head-on');
  await h.expect('!__C.rec.hits && __C.rec.minD > 2.2', 'they kept apart (no contact; centres over 2.2 m apart)');
  await h.expect('__C.rec.av > 0', 'the drivers steered round each other (the avoidance acted)');
  await h.expect('__C.rec.dA < 7 && __C.rec.dB < 7', 'and both got where they were going');

  // ---------------------------------------------------------------- 4. the Huey's rotor into a tree
  await h.eval(`(() => { __A.stow(); __Bj.stow();
    const T = __G.TREES, H = __G.H, R = 7.32;
    // a lone tree on gentle ground: no other tree within 16 m
    let tr = null; for (const t of T) { if (t.down || t.h < 5) continue; if (T.some(o => o !== t && Math.hypot(o.x - t.x, o.z - t.z) < 16)) continue; const g = __G.terrainH; if (Math.abs(g(t.x + 9, t.z) - t.y) > 3 || Math.abs(g(t.x - 9, t.z) - t.y) > 3) continue; tr = t; break; }
    if (!tr) return null; window.__tr = tr;
    const hy = tr.y + 0.3 * tr.h, rr = tr.cr * 0.7, d = R + rr - 1.6;   // the disc 1.6 m into the crown 30 % up the tree
    H.reset(new __G.THREE.Vector3(tr.x - d, hy - 2.0, tr.z), Math.PI / 2, true, 1); __G.HI.setCollective(0.45);
    window.__rs0 = __G.RSTAT.strikes; window.__rot0 = __G.D.hp.rotor;
    window.__cam = { at: [tr.x - d / 2, hy + 6, tr.z + 24], look: [tr.x - d / 2, hy, tr.z] };
    return { tree: [Math.round(tr.x), Math.round(tr.z)], h: +tr.h.toFixed(1), crown: +tr.cr.toFixed(2), hubY: +hy.toFixed(1), d: +d.toFixed(2) }; })()`, 'the Huey set with its disc into a tree crown, rotor at 100%');
  await h.expect('!!window.__tr', 'found a lone tree');
  await h.waitFor('__G.RSTAT.strikes > __rs0', 20000);
  await h.wait(300);
  await h.eval('({ rstat: __G.RSTAT, rotor: +__G.D.hp.rotor.toFixed(2), down: !!__tr.down, enabled: __tr.body.enabled })', 'rotor strike');
  await h.shot('4-huey-rotor-strike');
  await h.expect('__G.D.hp.rotor < __rot0 - 0.1', 'the main rotor is damaged');
  await h.expect('__tr.down && !__tr.body.enabled', 'the tree is cut down (out of the collision world)');
  await h.eval('(__G.G.heliStowed = true, 1)');   // (the damaged Huey out of the way: she would come down in the trees)

  // ---------------------------------------------------------------- 5. a Hornet taxiing into a parked Tomcat
  await h.eval(`(() => { const c = __G.war.carrier, GR = __G.GR, D = c.dims.DECK;
    // a strip of flat, empty deck 6 m wide and 48 m long, ship frame (the landing area in peace time)
    let lane = null;
    for (const lx of [-2.5, -5, 0, -8, 2.5]) { let ok = true;
      for (let lz = -4; lz <= 46 && ok; lz += 2) for (const ox of [-3, 0, 3]) { const h = c.parts.localDeck ? c.parts.localDeck(lx + ox, lz) : D; if (Math.abs(h - D) > 0.05) { ok = false; break; } }
      if (ok) { lane = lx; break; } }
    if (lane === null) return null; window.__lane = lane;
    const w = (lx, lz) => GR.toWorld(c, lx, lz, {});
    // the Tomcat: on cat 1 from the fleet, then spotted on the lane, engines off, parked
    const TC = __G.tomcatC, TP = TC.TP, A = TP.A; if (!TP.launch()) return 'no tomcat';
    const tp = w(lane, 8); A.reset(tp.x, GR.deckH(tp.x, tp.z), tp.z, c.yaw, { running: false });
    const pk = TC.park; pk.x = A.pos.x; pk.y = GR.deckH(tp.x, tp.z); pk.z = A.pos.z; pk.yaw = c.yaw; pk.plat = null; pk.loc = null; pk.cat = false; GR.settle(pk, true); pk.on = true;
    return { lane, tomcat: [Math.round(tp.x), Math.round(tp.z)] }; })()`, 'the Tomcat parked on the deck');
  await h.expect('typeof window.__lane === "number" && __G.tomcatC.present()', 'a Tomcat parked on a clear lane of the deck');
  await h.eval(`(() => { const c = __G.war.carrier, GR = __G.GR, J = __G.JP.J;
    __G.jetC.launch({ command: true });   // a Hornet to the cat, and you in it
    const hp = GR.toWorld(c, __lane, 8 + 9.6 + 8.6 + 5, {});
    J.reset(hp.x, GR.deckH(hp.x, hp.z), hp.z, c.yaw, { running: true, speed: 0 });
    const sv = __G.war.surfVel(hp.x, hp.z) || { vx: 0, vz: 0 }, sp = 4.6; J.vel.set(sv.vx - Math.sin(c.yaw) * sp, 0, sv.vz - Math.cos(c.yaw) * sp);
    __G.JP.pbrake = false; __G.JP.thr = 0; window.__jc0 = __G.jetC.contacts;
    const m = GR.toWorld(c, __lane - 18, 8 + 12, {}); window.__cam = { at: [m.x, GR.deckH(m.x, m.z) + 7, m.z], look: [hp.x + (GR.toWorld(c, __lane, 8, {}).x - hp.x) * 0.6, GR.deckH(hp.x, hp.z) + 1.5, hp.z + (GR.toWorld(c, __lane, 8, {}).z - hp.z) * 0.6] };
    return { craft: __G.G.craft, jet: [Math.round(J.pos.x), Math.round(J.pos.z)] }; })()`, 'a Hornet rolling at 9 kt down the lane toward the parked Tomcats tail');
  await h.expect("__G.G.craft === 'jet' && !__G.JP.J.cat", 'in the Hornet, off the catapult, rolling');
  await h.waitFor('__G.jetC.lastContact || !__G.JP.alive', 30000);
  await h.eval('(__G.JP.pbrake = true, { contact: __G.jetC.lastContact, alive: __G.JP.alive, tomcat: __G.tomcatC.present() })', 'the Hornet hits the Tomcat');
  await h.wait(1500);
  await h.shot('5-hornet-into-tomcat');
  await h.expect("__G.jetC.lastContact && (__G.jetC.lastContact.band === 'damage' || __G.jetC.lastContact.band === 'bump') && __G.jetC.lastContact.speed > 2", 'a contact at taxi speed: damage (not a nudge, not a crash)');
  await h.expect('__G.JP.alive && __G.tomcatC.present()', 'both jets survive it');
  await h.expect(`(() => { const c = __G.war.carrier, GR = __G.GR, a = GR.toLocal(c, __G.JP.J.pos.x, __G.JP.J.pos.z), b = GR.toLocal(c, __G.tomcatC.TP.A.pos.x, __G.tomcatC.TP.A.pos.z); window.__sep = a[1] - b[1]; return a[1] - b[1] > 14; })()`, 'the Hornet stopped behind the Tomcat (centres more than 14 m apart along the deck)');

  // ---------------------------------------------------------------- 6. the Marine blocked by the parked Hornet's wing
  await h.waitFor('__G.JP.stoppedOnDeck()', 20000);
  await h.key('tap', 'KeyY'); await h.wait(500);
  await h.expect("__G.G.craft === 'foot'", 'out of the Hornet, on foot');
  await h.eval(`(() => { const J = __G.jetC, w = __G.crafts.toWorld(J, [-9.5, 0, 1.6]), c = __G.crafts.toWorld(J, [0, 0, 1.6]), f = J.frame({});
    __G.foot.spawnAt({ x: w.x, y: f.y - 1.4, z: w.z, yaw: Math.atan2(-(c.x - w.x), -(c.z - w.z)) }); __G.foot.view = 'third';
    __G.marine.aim(Math.atan2(-(c.x - w.x), -(c.z - w.z)), 0);
    window.__cam = { at: [w.x + (c.x - w.x) * 0.4 + 9 * Math.sin(f.yaw), f.y + 3, w.z + (c.z - w.z) * 0.4 + 9 * Math.cos(f.yaw)], look: [w.x + (c.x - w.x) * 0.5, f.y - 0.5, w.z + (c.z - w.z) * 0.5] };
    return { at: [Math.round(w.x), Math.round(w.z)] }; })()`, 'the Marine 9.5 m off the Hornets port side, at the wing, facing it');
  await h.key('down', 'KeyW');
  await h.waitFor(`(() => { const W = __G.foot.W, J = __G.jetC, f = J.frame({}), dx = W.x - f.x, dz = W.z - f.z, lx = dx * Math.cos(f.yaw) - dz * Math.sin(f.yaw); window.__lx = lx; return Math.abs(lx) < 6.4; })()`, 30000);
  await h.wait(2500);
  await h.key('up', 'KeyW'); await h.wait(300);
  await h.eval(`(() => { const W = __G.foot.W, f = __G.jetC.frame({}), dx = W.x - f.x, dz = W.z - f.z; return { lx: +(dx * Math.cos(f.yaw) - dz * Math.sin(f.yaw)).toFixed(2), lz: +(dx * Math.sin(f.yaw) + dz * Math.cos(f.yaw)).toFixed(2), tall: W.tall }; })()`, 'where the Marine stopped (jet frame)');
  await h.shot('6-marine-blocked-by-the-wing');
  await h.expect(`(() => { const W = __G.foot.W, f = __G.jetC.frame({}), dx = W.x - f.x, dz = W.z - f.z, lx = dx * Math.cos(f.yaw) - dz * Math.sin(f.yaw); return Math.abs(lx) > 5.7 && Math.abs(lx) < 6.4; })()`, 'he walked up to the wingtip and no further (5.7 m half-span + his 0.3 m)');
  await h.eval('({ cw: __G.PROF.cw.toFixed(3), sim: __G.PROF.sim.toFixed(2), bodies: __G.CW.bodies.length, statics: __G.CW.stats.statics, pairs: __G.CW.stats.pairs })', 'collision world cost (ms / frame, smoothed)');
}
