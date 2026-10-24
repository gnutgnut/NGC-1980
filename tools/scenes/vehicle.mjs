// GROUND-VEHICLE HOST (FOUNDATION; since ngc/wheeledgame the real M151A2 replaces the placeholder TEST CAR): the jeep waits
// at the home island's motor pool. Walk to it, get in (driver), drive across the island (W, steer with D), stop, look
// from the chase camera, change seat, get out. Then the M151 on the ALBATROSS's deck park: drive it along the deck while
// she sails and turns, park, get out. Finally drive it into the sea: the engine drowns / hydrolocks past its fording depth.
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 30000);
  await h.eval(`(window.__V = {
    C: () => window.__CAR || __G.carC,
    S: () => __V.C().sim,
    st: () => { const C = __V.C(), S = C.sim; return { craft: __G.G.craft, seat: __G.crafts.seat, x: +S.pos[0].toFixed(1), y: +S.pos[1].toFixed(2), z: +S.pos[2].toFixed(1), heading: +S.heading.toFixed(2), v: +S.speed.toFixed(2), kmh: +Math.abs(S.kmh).toFixed(1), engine: S.eng.running, gear: S.gear, rpm: Math.round(S.eng.rpm), depth: +S.depth.toFixed(2), hydrolock: S.eng.hydrolock, wet: +S.eng.wet.toFixed(2), plat: C.P.plat ? C.P.plat.type : null, onGround: S.onGround, pitch: +S.pitch.toFixed(3), roll: +S.roll.toFixed(3) }; },
    toDoor: () => { const C = __V.C(), d = __G.crafts.toWorld(C, [-1.9, 0, 0.05]); return __G.foot.spawnAt({ x: d.x, y: C.sim.pos[1] + 0.5, z: d.z, yaw: d.yaw - Math.PI / 2 }); },
    loc: () => { const c = __G.war.carrier, S = __V.S(); const s = __G.GR.toShip(c, S.pos[0], S.pos[1], S.pos[2]); return { x: +s.x.toFixed(2), z: +s.z.toFixed(2) }; },
  }, 1)`);
  await h.expect('__G.carC && __G.carC.exists && __G.carC.type === "m151"', 'an M151A2 at the home motor pool');
  await h.eval('__V.st()');
  // out of the Huey, over to the jeep's driver side
  await h.key('tap', 'KeyY'); await h.wait(400);
  await h.expect("__G.G.craft === 'foot'");
  await h.eval('(window.__CAR = __G.carC, __V.toDoor())'); await h.wait(600);
  await h.eval("document.getElementById('hint').textContent");
  await h.expect("document.getElementById('hint').textContent.startsWith('Y: GET IN THE M151A2 MUTT  (DRIVER)')");
  await h.eval("(__G.foot.view = 'third', __G.foot.W.yaw += Math.PI / 2 + 0.6, 1)"); await h.wait(900); await h.shot('walk-up-to-the-jeep');
  await h.key('tap', 'KeyY'); await h.wait(500);
  await h.expect("__G.G.craft === __CAR.id && __G.crafts.seat === 0 && !__G.foot.exists");
  await h.key('tap', 'KeyI'); await h.waitFor('__V.S().eng.running', 8000);
  await h.wait(500); await h.shot('driver-seat');
  // drive: throttle, then a right turn, then off the gas
  await h.eval('(window.__p0 = [__V.S().pos[0], __V.S().pos[2], __V.S().heading], 1)');
  await h.key('down', 'KeyW'); await h.waitFor('Math.abs(__V.S().speed) > 7 || Math.hypot(__V.S().pos[0] - __p0[0], __V.S().pos[2] - __p0[1]) > 25', 30000);
  await h.eval('__V.st()');
  await h.key('down', 'KeyD'); await h.waitFor('Math.abs(__V.S().heading - __p0[2]) > 0.6', 20000); await h.key('up', 'KeyD'); await h.key('up', 'KeyW');
  await h.eval('__V.st()');
  await h.expect('__V.S().onGround && !__CAR.wrecked && Math.hypot(__V.S().pos[0] - __p0[0], __V.S().pos[2] - __p0[1]) > 12 && __V.S().yawRate !== 0');
  await h.shot('driving-driver-view');
  await h.key('tap', 'KeyV'); await h.key('down', 'KeyS'); await h.wait(300); await h.shot('driving-chase-view');
  // stop (S brakes), change seat, get out
  await h.key('down', 'KeyS'); await h.waitFor('Math.abs(__V.S().speed) < 0.3', 20000); await h.key('up', 'KeyS');
  await h.eval('__V.st()');
  await h.key('tap', 'BracketRight'); await h.wait(300);
  await h.expect('__G.crafts.seat === 1');
  await h.key('tap', 'KeyV'); await h.wait(700); await h.shot('passenger-seat');
  await h.key('tap', 'KeyY'); await h.wait(500); await h.eval("({ msg: document.getElementById('msg').textContent, st: __V.st() })");
  await h.expect("__G.G.craft === 'foot' && __G.foot.exists && Math.hypot(__G.foot.W.x - __V.S().pos[0], __G.foot.W.z - __V.S().pos[2]) < 3.5");
  await h.eval("(__G.foot.view = 'third', __G.foot.W.yaw += 2.4, 1)"); await h.wait(900); await h.shot('got-out');
  // the deck park's M151 on the ALBATROSS: drive it along the deck while she sails
  await h.eval(`(window.__CAR = __G.pool.list.find(V => V.type === 'm151' && V.home === 'deck'), __CAR.P.plat ? __CAR.P.plat.type : null)`);
  await h.expect('__V.C().P.plat === __G.war.carrier');
  await h.eval(`(() => { const c = __G.war.carrier; __G.war.orderCarrier(c.p.x - Math.sin(c.yaw + 0.5) * 600, c.p.z - Math.cos(c.yaw + 0.5) * 600); return 1; })()`);
  await h.eval('__V.toDoor()'); await h.wait(300); await h.key('tap', 'KeyY'); await h.wait(400);
  await h.expect("__G.G.craft === __CAR.id");
  await h.key('tap', 'KeyI'); await h.waitFor('__V.S().eng.running', 8000);
  await h.eval('(window.__d0 = __V.loc(), 1)');
  await h.key('down', 'KeyW'); await h.waitFor('__d0.z - __V.loc().z > 12', 20000); await h.key('up', 'KeyW');
  await h.key('down', 'KeyS'); await h.waitFor('Math.abs(__V.S().speed) < 0.2', 20000); await h.key('up', 'KeyS');
  await h.eval('({ from: __d0, to: __V.loc(), st: __V.st() })');
  await h.expect('__V.C().P.plat === __G.war.carrier && Math.abs(__V.loc().x - __d0.x) < 1.5');
  await h.wait(1500); await h.shot('on-deck-under-way-chase');
  await h.eval('(window.__d1 = __V.loc(), 1)'); await h.wait(4000);
  await h.eval('({ parked: __d1, now: __V.loc(), ship: [__G.war.carrier.p.x, __G.war.carrier.p.z, __G.war.carrier.yaw] })');
  await h.expect('Math.hypot(__V.loc().x - __d1.x, __V.loc().z - __d1.z) < 0.2');
  // into the sea off a beach: the engine drowns
  await h.key('tap', 'KeyY'); await h.wait(400); await h.expect("__G.G.craft === 'foot'");
  await h.eval(`(() => { const T = __G.terrainH; for (const I of __G.ISLANDS) for (let a = 0; a < 6.283; a += 0.04) { const cx = Math.cos(a), sz = Math.sin(a); for (let r = 30; r < 160; r += 2) { const x = I.x + cx * r, z = I.z + sz * r, t = T(x, z); if (t < 0.5 && t > 0.1 && Math.abs(T(x - sz * 2, z + cx * 2) - T(x + sz * 2, z - cx * 2)) < 0.2 && T(x - cx * 3, z - sz * 3) - T(x + cx * 3, z + sz * 3) < 0.6 && T(x - cx * 3, z - sz * 3) > T(x + cx * 3, z + sz * 3) && T(x + cx * 8, z + sz * 8) > -0.8 && T(x + cx * 30, z + sz * 30) < -1.5 && !__G.ISLANDS.some(J => J.structs && J.structs.some(s => Math.hypot(s.x - x, s.z - z) < 12))) { __CAR.spawnAt({ x, z, yaw: Math.atan2(-cx, -sz) }); return [+x.toFixed(1), +z.toFixed(1), +a.toFixed(2), +t.toFixed(2)]; } } } return null; })()`);
  await h.eval('__V.st()'); await h.eval('__V.toDoor()'); await h.wait(300); await h.eval("document.getElementById('hint').textContent"); await h.key('tap', 'KeyY'); await h.wait(400);
  await h.expect("__G.G.craft === __CAR.id");
  await h.key('tap', 'KeyI'); await h.waitFor('__V.S().eng.running', 8000);
  await h.key('tap', 'KeyU');   // front drive in: soft sand into the surf
  await h.key('down', 'KeyW'); await h.waitFor('!__V.S().eng.running || __V.S().depth > 1.5', 40000); await h.key('up', 'KeyW');
  await h.eval('__V.st()'); await h.wait(600); await h.shot('drowned-in-the-surf');
  await h.expect('!__V.S().eng.running && (__V.S().eng.hydrolock || __V.S().eng.wet > 0.9 || __V.S().depth > 0.5)', 'the engine drowned in the surf');
}
