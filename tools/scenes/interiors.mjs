// INTERIORS (ngc/interiors): the ALBATROSS's island and hangar deck on foot, watertight doors that block until opened,
// the bridge and its hatch to the top deck; a house in a village: the front door blocks, opens, the rooms behind it;
// a seat in the Huey's cabin (the RIDE craft) and the people in the seats.
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 30000);
  await h.eval(`(window.__F = {
    loc: () => { const c = __G.war.carrier, W = __G.foot.W; const s = __G.GR.toShip(c, W.x, W.y, W.z); return { tx: +(s.x - 10.5).toFixed(2), tz: +(s.z - 6).toFixed(2), y: +s.y.toFixed(2) }; },
    // put the Marine in the tower frame (tx, tz), at ship height y, facing yawRel (0: the bow, PI: aft, -PI/2: starboard)
    place: (tx, y, tz, yawRel) => { const c = __G.war.carrier, w = __G.GR.toWorld(c, 10.5 + tx, 6 + tz); const ok = __G.foot.spawnAt({ x: w.x, y: c.p.y + y, z: w.z, yaw: c.yaw + yawRel }); __G.marine.aim(c.yaw + yawRel, 0); return ok; },
    look: (yawRel, pitch = 0) => (__G.marine.aim(__G.war.carrier.yaw + yawRel, pitch), 1),
    door: k => __DOORS.get('ALBATROSS#' + k),
  }, 1)`);
  await h.key('tap', 'KeyY'); await h.wait(500);
  await h.expect("__G.G.craft === 'foot' && __G.foot.exists");
  // the carrier stops (the walk is platform-relative anyway: foot.mjs covers her under way)
  await h.eval('(() => { const c = __G.war.carrier; c.path = []; c.goal = null; c.speed = 0; c.v.set(0, 0, 0); return !!c.interior; })()');
  await h.expect('!!__G.war.carrier.interior && !!__IN.carrier()');
  // 1. the island's port door, shut: walk at it - it blocks
  await h.eval('__F.place(-3.4, 8, -1.0, -Math.PI / 2)'); await h.wait(600);
  await h.eval("document.getElementById('hint').textContent");
  await h.expect("document.getElementById('hint').textContent.includes('OPEN THE WATERTIGHT DOOR')");
  await h.shot('island-door-shut');
  await h.key('down', 'KeyW'); await h.wait(2500); await h.key('up', 'KeyW');
  await h.eval('__F.loc()');
  await h.expect('__F.loc().tx < -2.5', 'the shut door stops him');
  // 2. F: the dogs come off, the door swings in; walk through into Flight Deck Control
  await h.key('tap', 'KeyF'); await h.waitFor("__F.door('port').a > 0.99", 25000);
  await h.shot('island-door-open');
  await h.key('down', 'KeyW'); await h.waitFor('__F.loc().tx > -1.6', 8000); await h.key('up', 'KeyW');
  await h.eval('__F.loc()');
  await h.expect('Math.abs(__F.loc().y - 8) < 0.1 && __G.foot.W.plat === __G.war.carrier', 'inside on the O-3 deck');
  await h.eval('__F.look(0, -0.25)'); await h.wait(700); await h.shot('flight-deck-control');
  // 3. the trunk: its watertight door, the ladder down to the hangar deck
  await h.eval('__F.place(0.75, 8, 0.2, Math.PI)'); await h.wait(400);
  await h.key('down', 'KeyW'); await h.wait(1500); await h.key('up', 'KeyW');
  await h.expect('__F.loc().tz < 0.95', 'the trunk door shut');
  await h.key('tap', 'KeyF'); await h.waitFor("__F.door('trunk').a > 0.99", 25000);
  await h.key('down', 'KeyW'); await h.waitFor('__F.loc().y < 4.4', 20000); await h.wait(1500); await h.key('up', 'KeyW');
  await h.eval('__F.loc()');
  await h.expect('Math.abs(__F.loc().y - 4.25) < 0.1 && __G.foot.W.plat === __G.war.carrier', 'on the hangar deck');
  await h.eval('__F.look(Math.PI + 0.3, -0.05)'); await h.wait(800); await h.shot('hangar-deck');
  await h.eval("(__G.marine.view = 'third', __F.look(-Math.PI / 2 - 0.4, -0.15))"); await h.wait(900); await h.shot('hangar-deck-third-person');
  await h.eval("(__G.marine.view = 'first', 1)");
  // 4. up the inclined ladders: O-5 ready room, O-7 flag plot, the bridge
  await h.eval('__F.place(-0.55, 8, 0.6, Math.PI)'); await h.key('down', 'KeyW'); await h.waitFor('__F.loc().y > 11.15', 20000); await h.wait(500); await h.key('up', 'KeyW');
  await h.expect('Math.abs(__F.loc().y - 11.2) < 0.1', 'O-5');
  await h.eval('__F.place(0.5, 11.2, -1.0, 0)'); await h.wait(300); await h.eval('__F.look(0, -0.1)'); await h.wait(700); await h.shot('ready-room');
  await h.eval('__F.place(1.75, 11.2, 6.4, 0)'); await h.key('down', 'KeyW'); await h.waitFor('__F.loc().y > 14.35', 20000); await h.wait(500); await h.key('up', 'KeyW');
  await h.expect('Math.abs(__F.loc().y - 14.4) < 0.1', 'O-7');
  await h.eval('__F.look(0.6, -0.2)'); await h.wait(700); await h.shot('flag-plot');
  await h.eval('__F.place(-1.85, 14.4, -3.3, Math.PI)'); await h.key('down', 'KeyW'); await h.waitFor('__F.loc().y > 17.05', 20000); await h.wait(500); await h.key('up', 'KeyW');
  await h.expect('Math.abs(__F.loc().y - 17.1) < 0.1', 'the bridge');
  await h.eval('__F.place(0.2, 17.1, 1.0, 0)'); await h.wait(300); await h.eval('__F.look(0.15, -0.08)'); await h.wait(800); await h.shot('bridge');
  // 5. the hatch: the ladder is no use while it is shut; F opens it, climb to the island top deck
  await h.eval('__F.place(2.0, 17.1, 2.7, Math.PI)'); await h.wait(400);
  await h.eval("document.getElementById('hint').textContent");
  await h.key('down', 'KeyW'); await h.wait(1500); await h.key('up', 'KeyW');
  await h.expect('!__G.foot.W.ladder', 'no climbing through a shut hatch');
  await h.key('tap', 'KeyF'); await h.waitFor("__F.door('hatch').a > 0.99", 25000);
  await h.key('down', 'KeyW'); await h.waitFor('__G.foot.W.ladder', 8000);
  await h.waitFor('!__G.foot.W.ladder && __G.foot.W.onGround && __F.loc().y > 21', 30000); await h.key('up', 'KeyW');
  await h.eval('__F.loc()');
  await h.expect('Math.abs(__F.loc().y - 21.3) < 0.1', 'out of the hatch onto the roof');
  await h.eval("(__G.marine.view = 'third', __F.look(Math.PI * 0.8, -0.3))"); await h.wait(900); await h.shot('top-deck-hatch');
  await h.eval("(__G.marine.view = 'first', 1)");
  // 6. from outside: the island with its door open, the hangar through a lift opening
  await h.eval('__F.place(-8.5, 8, -2.5, -Math.PI / 2)'); await h.wait(500); await h.eval('__F.look(-Math.PI / 2 + 0.15, 0.12)'); await h.wait(700); await h.shot('island-door-from-the-deck');
  // 7. a seat in the Huey's cabin: Y at its cargo door, the RIDE craft, seen in the seat; Y out
  await h.eval(`(() => { const d = __G.crafts.toWorld(__G.heliC, [2.6, -1.84, 1.2]); return __G.foot.spawnAt({ x: d.x, y: d.y + 0.3, z: d.z, yaw: d.yaw + Math.PI / 2 }); })()`); await h.wait(600);
  await h.eval("document.getElementById('hint').textContent");
  await h.expect("document.getElementById('hint').textContent.includes('TROOP SEAT')");
  await h.key('tap', 'KeyY'); await h.wait(600);
  await h.expect("__G.G.craft === 'ride'", 'in the cabin');
  await h.shot('huey-cabin-from-the-seat');
  await h.key('tap', 'KeyV'); await h.wait(900); await h.shot('huey-cabin-seated-marine');
  await h.key('tap', 'KeyY'); await h.wait(600);
  await h.expect("__G.G.craft === 'foot' && __G.foot.exists", 'out again');
  // 8. a house in a village: its front door blocks shut, opens with F, the rooms behind it
  const ok = await h.eval(`(() => { const p = __G.PAD, R = __SOLID.roomsNear(p.x, p.z, 700).filter(r => r.it.t === 'house' && r.it.floors === 2).sort((a, b) => Math.hypot(a.it.x - p.x, a.it.z - p.z) - Math.hypot(b.it.x - p.x, b.it.z - p.z))[0]; if (!R) return null;
    const it = R.it, d = R.P.doors.find(d => d.out), c = Math.cos(it.yaw), s = Math.sin(it.yaw), v = d.v + 1.6;
    window.__H = { it, d, key: R.P.key + '#' + d.id, out: () => { const W = __G.foot.W, dx = W.x - it.x, dz = W.z - it.z; return +(s * dx + c * dz).toFixed(2); } };
    __G.foot.spawnAt({ x: it.x + c * d.u + s * v, y: it.y + 0.3, z: it.z - s * d.u + c * v, yaw: it.yaw }); __G.marine.aim(it.yaw, 0); return { t: it.t, x: it.x, z: it.z, door: d.u }; })()`);
  if (ok) {
    await h.wait(1500); await h.shot('house-front-door');
    await h.key('down', 'KeyW'); await h.wait(2500); await h.key('up', 'KeyW');
    await h.eval('__H.out()');
    await h.expect('__H.out() > __H.d.v', 'the front door stops him');
    await h.key('tap', 'KeyF'); await h.waitFor("__DOORS.get(__H.key).a > 0.99", 25000);
    await h.shot('house-door-open-from-outside');
    await h.key('down', 'KeyW'); await h.waitFor('__H.out() < __H.d.v - 1.2', 20000); await h.key('up', 'KeyW');
    await h.expect('__H.out() < __H.d.v - 1', 'in the hall');
    await h.eval('(__G.marine.aim(__H.it.yaw + 0.9, -0.15), 1)'); await h.wait(900); await h.shot('house-living-room');
    await h.eval('(__G.marine.aim(__H.it.yaw - 2.4, -0.1), 1)'); await h.wait(900); await h.shot('house-inside-looking-back');
  }
  // 9. a CH-46 off the deck with its Marines: seen through the ramp and windows, sitting in the red troop seats
  await h.eval("(__G.G.mat = 999, __G.selIsl = __G.ISLANDS.find(i => !i.cave && i.owner !== 1), __G.command(1), __G.G.msg || 1)");
  await h.waitFor("__G.war.units.some(u => u.kind === 'ch46')", 20000);
  await h.eval(`(() => { const u = __G.war.units.find(u => u.kind === 'ch46'), U = u.rot; const aboard = U.squad.figs.filter(F => F.st === 'aboard' && F.f.group.visible).length;
    const c = Math.cos(u.yaw), s = Math.sin(u.yaw), x = u.p.x + c * 7 + s * 9, z = u.p.z - s * 7 + c * 9; __G.foot.spawnAt({ x, y: u.p.y, z, yaw: Math.atan2(x - u.p.x, z - u.p.z) }); window.__ch = u; return { aboard, y: u.p.y }; })()`);
  await h.wait(800);
  await h.eval(`(() => { const u = __ch, W = __G.foot.W; __G.marine.aim(Math.atan2(W.x - u.p.x, W.z - u.p.z), -0.12); return 1; })()`); await h.wait(900);
  await h.expect("__ch.rot.squad.figs.filter(F => F.st === 'aboard' && F.f.group.visible).length >= 10", 'the squad seated aboard');
  await h.shot('ch46-squad-aboard');
  // 10. a field gate: shut it blocks the gap in the wall, F swings it open
  const g = await h.eval(`(() => { let best = null; for (const p of [__G.PAD, { x: -4691, z: 2434 }]) { const a = __SOLID.gatesNear(p.x, p.z, 500); if (a.length) { best = a.sort((x, y) => Math.hypot(x.cx - p.x, x.cz - p.z) - Math.hypot(y.cx - p.x, y.cz - p.z))[0]; break; } } if (!best) return null;
    const D = best, d = D.d, hy = D.host.yaw(), c = Math.cos(hy), s = Math.sin(hy), n = d.ax === 'u' ? [0, 1] : [1, 0], o = [0, 0];
    D.host.toWorld(d.u + n[0] * 2.2, d.v + n[1] * 2.2, o); const nx = o[0] - D.cx, nz = o[1] - D.cz, L = Math.hypot(nx, nz);
    window.__GT = { D, side: () => { const W = __G.foot.W; return ((W.x - D.cx) * nx + (W.z - D.cz) * nz) / L; } };
    __G.foot.spawnAt({ x: o[0], y: __G.terrainH(o[0], o[1]) + 0.3, z: o[1], yaw: Math.atan2(nx, nz) }); __G.marine.aim(Math.atan2(nx, nz), -0.1); return { x: D.cx, z: D.cz }; })()`);
  if (g) {
    await h.wait(6000); await h.eval("document.getElementById('hint').textContent"); await h.shot('field-gate-shut');
    await h.key('down', 'KeyW'); await h.wait(4000); await h.key('up', 'KeyW');
    await h.expect('__GT.side() > 0.2', 'the shut gate stops him');
    await h.key('tap', 'KeyF'); await h.waitFor('__GT.D.a > 0.99', 25000); await h.shot('field-gate-open');
    await h.key('down', 'KeyW'); await h.waitFor('__GT.side() < -1', 20000); await h.key('up', 'KeyW');
    await h.expect('__GT.side() < -1', 'through the open gate');
  }
}
