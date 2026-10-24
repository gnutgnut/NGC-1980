// WHEELED in the game (ngc/wheeledgame): the Marine walks to an M151A2 at the home island's motor pool and gets in,
// drives on the island, then (teleported with the jeep to the wild lands 4 km east) along a village street, over a
// bridge, off the road and through a ford; lays the M60 from the pedestal seat on an enemy building and fires; the
// enemy shoots back (tyres, engine, the Marine's wounds); commandeers a civilian car parked in the village; drives an
// M151 along the ALBATROSS's deck while she sails and turns, and parks it there; boards six Marines into an M35A2 at
// the motor pool and drives them. Screenshots at each step. Driving is the real sim: keyboard (W / A / D) on the
// island and on the deck, a driver.js follower (the AI's own path follower) at the wheel on the long legs.
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 40000);
  await h.eval(`(window.__WG = {
    P: () => __G.pool,
    st: V => { const S = V.sim; return { id: V.id, seat: V.seats[V.seat].label, x: +S.pos[0].toFixed(1), y: +S.pos[1].toFixed(2), z: +S.pos[2].toFixed(1), kmh: +S.kmh.toFixed(1), gear: S.gear, rpm: Math.round(S.eng.rpm), run: S.eng.running, surf: ['tarmac','wet','dirt','grass','sand','mud','deck','rock','snow'][S.wheels[0].surf], depth: +S.depth.toFixed(2), bridge: V.onBridge !== null, plat: V.P.plat ? V.P.plat.type : null, pitch: +S.pitch.toFixed(3), roll: +S.roll.toFixed(3), up: +S.up[1].toFixed(3), fuel: +S.fuelL.toFixed(1), wreck: V.wrecked }; },
    hud: () => ({ line: document.getElementById('alt').textContent, hint: document.getElementById('hint').textContent, weap: document.getElementById('weap').textContent }),
    near: (V, local) => { const d = __G.crafts.toWorld(V, local); return __G.foot.spawnAt({ x: d.x, y: V.sim.pos[1] + 0.4, z: d.z, yaw: d.yaw - Math.PI / 2 }); },
    face: (x, z) => { const W = __G.foot.W; return __G.marine.aim(Math.atan2(-(x - W.x), -(z - W.z)), -0.1); },
    put: (V, x, z, yaw) => V.spawnAt({ x, z, yaw }, { running: true }),
    road: (x, z) => __WORLD.roadAt(x, z),
    trk: [], track: V => { __WG.trk = []; clearInterval(__WG.tI); __WG.tI = setInterval(() => __WG.trk.push(__WG.st(V)), 400); },
    loc: V => { const c = __G.war.carrier, S = V.sim, s = __G.GR.toShip(c, S.pos[0], S.pos[1], S.pos[2]); return { x: +s.x.toFixed(3), y: +s.y.toFixed(3), z: +s.z.toFixed(3) }; },
  }, 1)`);
  const P = '__WG.P()';
  await h.eval(`${P}.list.map(V => __WG.st(V))`, 'vehicles at the start');
  await h.expect(`${P}.list.filter(V => V.type === 'm151').length >= 2 && ${P}.list.filter(V => V.type === 'm35').length >= 2 && ${P}.list.some(V => V.P.plat === __G.war.carrier)`, 'M151s and M35s at the motor pools and on the deck');

  // ---------------------------------------------------------------- 1. walk to the M151 at the home motor pool, get in
  await h.key('tap', 'KeyY'); await h.wait(400);
  await h.expect("__G.G.craft === 'foot'");
  await h.eval(`(() => { const V = ${P}.list.find(V => V.type === 'm151' && V.home && V.home.name === 'HOME ISLAND'); window.__M = V; const door = __G.crafts.toWorld(V, V.seats[0].door), pad = V.home.pad, L = Math.hypot(pad.x - door.x, pad.z - door.z), x = door.x + (pad.x - door.x) / L * 9, z = door.z + (pad.z - door.z) / L * 9; window.__door = door; __G.foot.spawnAt({ x, y: __G.terrainH(x, z) + 0.5, z, yaw: 0 }); return __WG.face(door.x, door.z); })()`);
  await h.wait(300);
  await h.eval("(__G.foot.view = 'third', 1)");
  await h.key('down', 'KeyW');
  await h.waitFor("Math.hypot(__G.foot.W.x - __door.x, __G.foot.W.z - __door.z) < 1.6 || document.getElementById('hint').textContent.startsWith('Y: GET IN THE M151A2')", 30000);
  await h.key('up', 'KeyW'); await h.wait(300);
  await h.eval('__WG.hud().hint'); await h.shot('walk-up-to-the-m151');
  await h.expect("document.getElementById('hint').textContent.startsWith('Y: GET IN THE M151A2 MUTT  (DRIVER)')", 'at the driver door');
  await h.key('tap', 'KeyY'); await h.wait(300);
  await h.expect("__G.G.craft === __M.id && __G.crafts.seat === 0 && !__G.foot.exists", 'in the driver seat');
  await h.expect('!__M.sim.eng.running && __M.cabin.hitBoxes.length >= 6', 'a cold jeep; the cab has its switches');
  await h.eval("(__M.click('ign'), [__M.cabin.labelOf('ign'), __M.inp.ignition])", 'ignition switch ON'); await h.wait(400);
  await h.eval("(__M.click('ign'), __M.cabin.labelOf('ign'))", 'ignition switch to START');
  await h.waitFor('__M.sim.eng.running', 8000);
  await h.eval("(__M.click('lights'), __M.click('lights'), __M.click('wiper'), [__M.cabin.labelOf('lights'), __M.cabin.labelOf('wiper')])", 'blackout drive lights, wipers');
  await h.eval('__WG.hud()'); await h.shot('driver-seat-gauges');
  // keyboard: W, then a gentle right (D) at speed: the steering narrows with speed
  await h.eval('(window.__p0 = [...__M.sim.pos], 1)');
  await h.key('down', 'KeyW'); await h.waitFor('__M.sim.kmh > 20 || Math.hypot(__M.sim.pos[0] - __p0[0], __M.sim.pos[2] - __p0[2]) > 35', 20000);
  await h.key('down', 'KeyD'); await h.wait(1200);
  await h.eval('({ st: __WG.st(__M), steer: __M.inp.steer, kmh: __M.sim.kmh })', 'steer at speed (keyboard)');
  await h.expect('__M.inp.steer < 0.75 && __M.inp.steer > 0.1', 'the keyboard steering is narrowed at speed');
  await h.key('up', 'KeyD'); await h.key('up', 'KeyW');
  await h.key('down', 'KeyS'); await h.waitFor('Math.abs(__M.sim.speed) < 0.4', 15000); await h.key('up', 'KeyS');
  await h.eval('__WG.st(__M)');
  await h.expect('Math.hypot(__M.sim.pos[0] - __p0[0], __M.sim.pos[2] - __p0[2]) > 7 && !__M.wrecked && __M.sim.up[1] > 0.9', 'drove on the island and stopped upright');

  // ---------------------------------------------------------------- 2. the wild lands: a village street, a bridge, off road, a ford
  // the village (s2_0, ~3.7 km east): its main street
  await h.eval(`(() => { const q = __WORLD.net.nearestRoad(3697, 1233, 80); const R = q.R; window.__VR = { id: R.id, s: q.s }; const p = __WORLD.roadPoint(R, Math.max(5, q.s - 90), 1.4), yaw = Math.atan2(-p.dx, -p.dz); __WG.put(__M, p.x, p.z, yaw); return { road: R.id, type: R.type, kind: R.kind, s: q.s, len: R.len }; })()`);
  await h.wait(2500);
  await h.eval(`(() => { const pts = ${P}.roadPath(__VR.id, Math.max(5, __VR.s - 85), Math.min(__WORLD.roadById(__VR.id).len - 5, __VR.s + 110), 1.4); ${P}.autopilot(__M, pts, 9); __WG.track(__M); return pts.length; })()`);
  await h.waitFor('__WG.trk.length > 12', 30000);
  await h.key('tap', 'KeyV'); await h.wait(900); await h.shot('village-street-chase');
  await h.eval('({ traffic: __WG.P().list.filter(V => V.traffic).map(V => [V.type, Math.round(V.sim.kmh)]), parked: __WG.P().parked.size, near: __WG.P().list.filter(V => V.owner === "civ").length })', 'town cars and traffic on the sim');
  await h.waitFor('__M.auto.done || __WG.trk.length > 70', 60000);
  await h.eval('__WG.trk.filter((t, i) => i % 4 === 0).map(t => [t.x, t.z, t.kmh, t.surf])');
  await h.expect("__WG.trk.filter(t => t.surf === 'tarmac').length > __WG.trk.length * 0.7 && __WG.trk.some(t => t.kmh > 20)", 'on the village street (tarmac)');
  // the bridge: a 96 m tarmac viaduct ~4.2 km east
  await h.eval(`(() => { const q = __WORLD.roadAt(4180, -556), R = __WORLD.roadById(q.road); window.__BR = { id: R.id, s: q.s }; const p = __WORLD.roadPoint(R, q.s - 120, 1.4), yaw = Math.atan2(-p.dx, -p.dz); __WG.put(__M, p.x, p.z, yaw); return q; })()`);
  await h.wait(2000);
  await h.eval(`(() => { const pts = ${P}.roadPath(__BR.id, __BR.s - 115, __BR.s + 150, 1.4); ${P}.autopilot(__M, pts, 13); __WG.track(__M); return pts.length; })()`);
  await h.waitFor('__WG.trk.some(t => t.bridge)', 60000); await h.wait(2500);
  await h.shot('over-the-bridge-chase');
  await h.key('tap', 'KeyV'); await h.wait(700); await h.shot('over-the-bridge-driver');
  await h.waitFor('__M.auto.done || __WG.trk.length > 120', 60000);
  await h.eval(`(() => { const b = __WG.trk.filter(t => t.bridge); return { n: b.length, minY: Math.min(...b.map(t => t.y)), maxY: Math.max(...b.map(t => t.y)), ground: b.map(t => +__G.terrainH(t.x, t.z).toFixed(1)).slice(0, 6), kmh: b.map(t => t.kmh).slice(0, 6) }; })()`, 'on the bridge deck');
  await h.expect(`__WG.trk.filter(t => t.bridge).length >= 4 && __WG.trk.filter(t => t.bridge).every(t => { const r = __WORLD.roadAt(t.x, t.z); return r && Math.abs(t.y - r.y - 0.14) < 0.35 && t.kmh > 25; }) && __WG.trk.some(t => t.bridge && t.y > __G.terrainH(t.x, t.z) + 4) && __WG.trk.every(t => t.up > 0.9)`, 'over the bridge on its deck (high over the ground), upright');
  // off road: across a farm's fields (the WORLD's farms near the village; the 70 m line through a field with the gentlest
  // worst slope, along or across), 4x4 engaged
  await h.eval(`(() => { const T = __G.terrainH, WO = ${P}.WO; let best = null; for (const f of __WORLD.net.netState.farms.values()) { if (!f || Math.hypot(f.x - 3697, f.z - 1233) > 2500) continue; for (const F of f.fields || []) for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283, ux = Math.sin(a), uz = Math.cos(a), sx = F.x - ux * 35, sz = F.z - uz * 35; let worst = 0, ok = true, h0 = T(sx, sz); for (let d = 3; d <= 70 && ok; d += 3) { const x = sx + ux * d, z = sz + uz * d, hh = T(x, z); if (hh < 1 || WO.near(x, z, 3).boxes.length || __WORLD.roadAt(x, z)) ok = false; worst = Math.max(worst, Math.abs(hh - h0) / 3, Math.hypot(T(x + 2, z) - T(x - 2, z), T(x, z + 2) - T(x, z - 2)) / 4); h0 = hh; } if (ok && (!best || worst < best.worst)) best = { sx, sz, ux, uz, worst, crop: F.crop }; } } if (!best) return null; const pts = []; for (let d = 8; d <= 70; d += 6) pts.push({ x: best.sx + best.ux * d, z: best.sz + best.uz * d }); window.__OP = pts; __WG.put(__M, best.sx, best.sz, Math.atan2(-best.ux, -best.uz)); return { at: [Math.round(best.sx), Math.round(best.sz)], worstSlope: +best.worst.toFixed(3), crop: best.crop }; })()`, 'a way across a farm field');
  await h.wait(1500); await h.key('tap', 'KeyU'); await h.wait(200);
  await h.eval(`(${P}.autopilot(__M, __OP, 7), __WG.track(__M), __M.inp.fwd)`, '4x4 engaged');
  await h.waitFor('__M.auto.done || __WG.trk.length > 60', 60000);
  await h.eval('__WG.trk.filter((t, i) => i % 3 === 0).map(t => [t.surf, t.kmh, t.pitch, t.roll])', 'off road');
  await h.key('tap', 'KeyV'); await h.wait(900); await h.shot('off-road-chase');
  await h.expect("__WG.trk.filter(t => t.surf !== 'tarmac').length > 5 && __WG.trk.some(t => t.kmh > 15) && __WG.trk.every(t => t.up > 0.85)", 'off the road (grass / dirt / rock), upright');
  // a ford: the shallows by a coastal road ~4.9 km out: in from the beach to ~0.3 m, along the shallows, out again (a U
  // through the water, searched along the shore so it never goes past 0.45 m)
  await h.eval(`(() => { const T = __G.terrainH; for (const C of [[4155, 2584], [4215, 2630], [4235, 2644], [4271, 2676], [4287, 2693], [4183, 2561]]) for (let k = 0; k < 48; k++) { const a = k / 48 * 6.283, ux = Math.sin(a), uz = Math.cos(a); let P = null, dP = 0; for (let d = 0; d < 70; d += 1.5) { const hh = T(C[0] + ux * d, C[1] + uz * d); if (hh < -0.44) break; if (hh <= -0.27) { P = [C[0] + ux * d, C[1] + uz * d]; dP = d; break; } } if (!P || T(C[0], C[1]) < 0.3) continue; for (const s of [1, -1]) { const tx = -uz * s, tz = ux * s; let ok = true; for (let q = 0; q <= 16 && ok; q += 2) { const hh = T(P[0] + tx * q, P[1] + tz * q); if (hh < -0.45 || hh > 0.1) ok = false; } if (!ok) continue; const Q = [P[0] + tx * 16, P[1] + tz * 16]; let R = null; for (let d = 0; d < 60; d += 2) { const x = Q[0] - ux * d, z = Q[1] - uz * d, hh = T(x, z); if (hh < -0.45) { R = null; break; } if (hh > 0.4) { R = [x - ux * 8, z - uz * 8]; break; } } if (!R) continue; const pts = [], seg = (A, B, n) => { for (let i = 1; i <= n; i++) pts.push({ x: A[0] + (B[0] - A[0]) * i / n, z: A[1] + (B[1] - A[1]) * i / n }); }; const S0 = [C[0] - ux * 14, C[1] - uz * 14]; seg(S0, P, Math.ceil((dP + 14) / 4)); seg(P, Q, 4); seg(Q, R, 8); window.__FP = pts; __WG.put(__M, S0[0] - ux * 4, S0[1] - uz * 4, Math.atan2(-ux, -uz)); return { from: C, P: P.map(Math.round), Q: Q.map(Math.round), R: R.map(Math.round), depthP: +T(P[0], P[1]).toFixed(2), depthQ: +T(Q[0], Q[1]).toFixed(2) }; } } return null; })()`, 'a ford (into the shallows and out)');
  await h.wait(1500);
  await h.eval(`(${P}.autopilot(__M, __FP, 5), __WG.track(__M), 1)`);
  await h.waitFor('__WG.trk.some(t => t.depth > 0.15)', 120000); await h.wait(1800);
  await h.shot('fording-chase');
  await h.waitFor('__M.auto.done || __WG.trk.length > 260', 120000);
  await h.eval('({ maxDepth: Math.max(...__WG.trk.map(t => t.depth)), run: __M.sim.eng.running, st: __WG.st(__M), hud: __WG.hud().line })', 'through the ford');
  await h.expect('Math.max(...__WG.trk.map(t => t.depth)) > 0.15 && __M.sim.eng.running && !__M.sim.eng.hydrolock && __M.sim.depth < 0.05', 'forded (in and out again) and the engine ran on');

  // ---------------------------------------------------------------- 3. the M60 from the pedestal on an enemy building
  await h.eval(`(() => { const T = __G.terrainH; for (const I of __G.ISLANDS) { if (I.owner !== 2 || !I.structs) continue; for (const s of I.structs) { if (s.dead || s.kind === 'aa') continue; for (let a = 0; a < 6.283; a += 0.2) for (const d of [55, 70, 85]) { const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d, y = T(x, z); if (y < 1.5) continue; let ok = Math.abs(T(x + 2, z) - T(x - 2, z)) < 0.6 && Math.abs(T(x, z + 2) - T(x, z - 2)) < 0.6 && !__G.BASES.some(b => Math.hypot(b.x - x, b.z - z) < 14); for (let k = 0.1; k < 0.95 && ok; k += 0.05) { const px = x + (s.x - x) * k, pz = z + (s.z - z) * k, ly = y + 2 + (s.y + s.h * 0.6 - y - 2) * k; if (T(px, pz) > ly - 0.3) ok = false; } if (ok && __G.GR.clearAt(x, z, 3)) { window.__TGT = s; __WG.put(__M, x, z, Math.atan2(-(s.x - x), -(s.z - z)) + 0.6); return { island: I.name, kind: s.kind, hp: s.hp, d, y: +y.toFixed(1) }; } } } } return null; })()`, 'an enemy building to shoot at');
  await h.wait(1500);
  await h.eval("(__M.view = 'first', 1)");
  await h.key('tap', 'BracketRight'); await h.wait(200); await h.key('tap', 'BracketRight'); await h.wait(300);
  await h.eval('({ seat: __M.seats[__M.seat].label, idx: __G.crafts.seat })');
  await h.expect("__M.seats[__M.seat].sid === 'gunner'", 'in the M60 pedestal seat');
  await h.eval('(__M.aimAt(__TGT.x, __TGT.y + __TGT.h * 0.6, __TGT.z), window.__hp0 = __TGT.hp, window.__f0 = __WG.P().guns.fired, [__M.aim.yaw, __M.aim.pitch])');
  await h.wait(600); await h.shot('m60-gunner-sight');
  await h.key('down', 'KeyF'); await h.wait(1200); await h.shot('m60-firing-tracers'); await h.wait(1600); await h.key('up', 'KeyF');
  await h.wait(1500);
  await h.eval('({ fired: __WG.P().guns.fired - __f0, hits: __WG.P().guns.hits, hp0: __hp0, hp: __TGT.hp, belt: __M.gun.belt, weap: __WG.hud().weap })', 'M60 burst');
  await h.expect('__WG.P().guns.fired - __f0 >= 15 && __TGT.hp < __hp0', 'the M60 fired through war.js and hit the building');
  await h.key('tap', 'KeyV'); await h.wait(900); await h.shot('m60-gunner-chase'); await h.key('tap', 'KeyV');
  // the enemy shoots back: rounds through the jeep (tyres, engine, fuel, the crew), then a blast
  await h.eval(`(() => { window.__fh0 = __G.foot.hurt; __G.foot.hurt = (...a) => { __G.marine.hurt(...a); __G.marine.MS.M.restore(); __G.marine.MS.dead = false; }; setTimeout(() => { __G.foot.hurt = __fh0; }, 1200); return 1; })()`, 'the volley: the Marine is patched up after each wound (the next check is about him)');
  await h.eval(`(() => { const S = __M.sim, out = []; const T = __G.THREE; for (let k = 0; k < 10; k++) { const at = new T.Vector3(S.pos[0] + (Math.random() - 0.5) * 1.5, S.pos[1] + 0.5 + Math.random() * 0.8, S.pos[2] + (Math.random() - 0.5) * 2.5); __G.hurtPlayer(0.2, 'HIT', at, new T.Vector3(1, -0.2, 0.3).multiplyScalar(300), 'b'); } const d = __M.dmg.state; return { tyres: d.tyres.map(t => +t.pressure.toFixed(2)), engine: +d.engine.toFixed(2), fuelLeak: d.fuelLeak, fire: d.fire, health: __G.marine.MS.M.summary ? Object.keys(__G.marine.MS.M.summary()).length : null, bleeds: __G.marine.MS.M.bleeds.length, dead: __G.marine.MS.dead }; })()`, 'hit by ten rounds');
  await h.wait(1500);
  await h.eval('({ hud: __WG.hud(), bleeds: __G.marine.MS.M.bleeds.length, vol: Math.round(__G.marine.MS.M.vol) })');
  await h.expect('__M.dmg.state.tyres.some(t => t.leak > 0 || t.pressure < 1) || __M.dmg.state.engine < 1 || __M.dmg.state.fuelLeak > 0', 'enemy rounds damaged the jeep (vehicledamage.js)');
  await h.shot('hit-gunner-view');
  // a round straight through the gunner's place: the vehicle's crew hit becomes the Marine's wound (marine.js / MEDINV).
  // (the jeep patched up first - a burning wreck takes no more rounds; the crew event lands on the next sim step. A .50
  // through the chest kills a man, so the wound is read off his medical and he is patched up before foot.js sees it)
  await h.eval(`(() => { __M.dmg.repair('all'); const MS = __G.marine.MS, M = MS.M; M.restore(); window.__hp = () => Object.values(M.regions).reduce((s, r) => s + r.hp, 0); window.__wound = { before: Math.round(__hp()), shots: 0, calls: 0 };
    window.__fh = __G.foot.hurt; __G.foot.hurt = (...a) => { __wound.calls++; __G.marine.hurt(...a); __wound.after = Math.round(__hp()); __wound.dead = MS.dead || M.dead; __wound.region = a[1]; M.restore(); MS.dead = false; };
    const T = __G.THREE, S = __M.sim, q = new T.Quaternion(S.q[0], S.q[1], S.q[2], S.q[3]), s = __M.seats[__M.seat]; const at = new T.Vector3(s.at[0], s.at[1] + 0.45, s.at[2]).applyQuaternion(q).add(new T.Vector3(S.pos[0], S.pos[1], S.pos[2])), dir = new T.Vector3(1, -0.1, 0).applyQuaternion(q); __G.hurtPlayer(0.2, 'HIT', at, dir.multiplyScalar(300), 'b'); __wound.shots++; return __wound; })()`, 'a round through the gunner');
  await h.wait(800);
  await h.eval('(__G.foot.hurt = __fh, __wound)');
  await h.expect('__wound.calls > 0 && (__wound.after < __wound.before || __wound.dead) && __G.foot.alive', 'the crew hit wounded the Marine riding in the jeep');
  await h.eval('(__G.marine.MS.dead ? 0 : (__G.marine.MS.M.restore(), 1))');   // (patched up for the rest of the scene)

  // ---------------------------------------------------------------- 4. commandeer a civilian car parked in the village
  await h.eval(`(() => { const q = __WORLD.net.nearestRoad(3697, 1233, 80); __WG.put(__M, q.x + 3, q.z + 3, 0); return 1; })()`);
  await h.wait(2500);
  await h.key('tap', 'BracketLeft'); await h.wait(200); await h.key('tap', 'BracketLeft'); await h.wait(200);
  await h.eval(`${P}.list.filter(V => V.owner === 'civ').map(V => [V.id, Math.round(V.sim.pos[0]), Math.round(V.sim.pos[2])])`, 'parked town cars');
  await h.waitFor(`${P}.list.some(V => V.owner === 'civ')`, 20000);
  await h.key('tap', 'KeyY'); await h.wait(400);
  await h.expect("__G.G.craft === 'foot'", 'out of the jeep');
  await h.eval(`(() => { const S = __M.sim; let best = null, bd = 1e9; for (const V of ${P}.list) if (V.owner === 'civ') { const d = Math.hypot(V.sim.pos[0] - S.pos[0], V.sim.pos[2] - S.pos[2]); if (d < bd) { bd = d; best = V; } } window.__C = best; __WG.near(best, best.seats[0].door.map((v, i) => i === 0 ? v * 1.6 : v)); return { car: best.id, label: best.label, d: Math.round(bd), drv: best.seats[0].label }; })()`);
  await h.wait(800);
  await h.eval("(__G.foot.view = 'third', __WG.face(__C.sim.pos[0], __C.sim.pos[2]), 1)"); await h.wait(700);
  await h.eval('__WG.hud().hint'); await h.shot('by-a-parked-car');
  await h.key('tap', 'KeyY'); await h.wait(400);
  await h.expect("__G.G.craft === __C.id && __C.owner === 'player'", 'commandeered the civilian car');
  await h.key('tap', 'KeyI'); await h.waitFor('__C.sim.eng.running', 8000);
  await h.wait(500); await h.shot('civilian-car-driver');
  await h.key('down', 'KeyW'); await h.wait(5500); await h.key('up', 'KeyW');
  await h.key('tap', 'KeyV'); await h.wait(900); await h.shot('civilian-car-chase');
  await h.eval('__WG.st(__C)');
  await h.expect('__C.sim.kmh > 8 || Math.abs(__C.sim.speed) > 2', 'the commandeered car drives');
  await h.key('down', 'KeyS'); await h.waitFor('Math.abs(__C.sim.speed) < 0.4', 15000); await h.key('up', 'KeyS');

  // ---------------------------------------------------------------- 5. an M151 on the ALBATROSS's deck while she sails and turns
  await h.key('tap', 'KeyY'); await h.wait(400);
  await h.eval(`(() => { const V = ${P}.list.find(V => V.type === 'm151' && V.home === 'deck'); window.__D = V; return __WG.near(V, [-1.6, 0, 0.05]); })()`);
  await h.wait(600); await h.key('tap', 'KeyY'); await h.wait(400);
  await h.expect("__G.G.craft === __D.id", 'in the deck M151');
  await h.key('tap', 'KeyI'); await h.waitFor('__D.sim.eng.running', 8000);
  await h.eval(`(() => { const c = __G.war.carrier; __G.war.orderCarrier(c.p.x - Math.sin(c.yaw + 0.6) * 700, c.p.z - Math.cos(c.yaw + 0.6) * 700); window.__d0 = __WG.loc(__D); return __d0; })()`);
  await h.key('down', 'KeyW'); await h.waitFor('__d0.z - __WG.loc(__D).z > 12', 25000); await h.key('up', 'KeyW');
  await h.key('down', 'KeyS'); await h.waitFor('Math.abs(__D.sim.speed) < 0.2', 15000); await h.key('up', 'KeyS');
  await h.eval('({ from: __d0, to: __WG.loc(__D), st: __WG.st(__D), ship: { spd: +Math.hypot(__G.war.carrier.v?.x || 0, __G.war.carrier.v?.z || 0).toFixed(2), yaw: +__G.war.carrier.yaw.toFixed(3) } })', 'drove along the deck');
  await h.expect('__D.P.plat === __G.war.carrier && Math.abs(__WG.loc(__D).x - __d0.x) < 1.5', 'on the deck, straight along it');
  await h.key('tap', 'KeyV'); await h.wait(1500); await h.shot('deck-under-way-chase');
  await h.eval('(window.__d1 = __WG.loc(__D), window.__y1 = __G.war.carrier.yaw, 1)'); await h.wait(5000);
  await h.eval('({ parked: __d1, now: __WG.loc(__D), turned: +(__G.war.carrier.yaw - __y1).toFixed(3), carrierMoved: true })', 'parked on the deck for 5 s');
  await h.expect('Math.hypot(__WG.loc(__D).x - __d1.x, __WG.loc(__D).z - __d1.z) < 0.25', 'it rides the deck (stays on its spot)');
  // out on deck: it stays and sleeps, still carried
  await h.key('tap', 'KeyY'); await h.wait(500);
  await h.expect("__G.G.craft === 'foot' && __G.foot.W.plat === __G.war.carrier", 'out on the deck');
  await h.eval('(window.__d2 = __WG.loc(__D), 1)'); await h.wait(4000);
  await h.eval('({ asleep: __D.asleep, from: __d2, now: __WG.loc(__D) })', 'parked and asleep on the deck');
  await h.expect('Math.hypot(__WG.loc(__D).x - __d2.x, __WG.loc(__D).z - __d2.z) < 0.25', 'a parked vehicle rides the deck');

  // ---------------------------------------------------------------- 6. the M35: six Marines aboard at the motor pool
  await h.eval(`(() => { const V = ${P}.list.find(V => V.type === 'm35' && V.home && V.home.name === 'HOME ISLAND'); window.__T = V; return __WG.near(V, V.seats[0].door.map((v, i) => i === 0 ? v * 1.4 : v)); })()`);
  await h.wait(800); await h.eval('__WG.hud().hint');
  await h.key('tap', 'KeyY'); await h.wait(400);
  await h.expect("__G.G.craft === __T.id && __G.crafts.seat === 0", 'in the M35 cab');
  await h.eval("(__T.click('ign'), __T.click('start'), [__T.cabin.labelOf('ign'), Math.round(__T.sim.airPsi)])", 'M35: ENGINE switch, START button');
  await h.waitFor('__T.sim.eng.running', 10000);
  await h.eval('(window.__m0 = __T.sim.massNow, 1)');
  await h.key('tap', 'KeyB'); await h.wait(400);
  await h.eval('({ troops: __T.troops, mass0: Math.round(__m0), mass: Math.round(__T.sim.massNow), msg: document.getElementById("msg").textContent, cap: __G.PL.capTime })', 'troops aboard');
  await h.expect('__T.troops === 6 && __T.sim.massNow > __m0 + 500 && __G.PL.capTime === 4', 'six Marines aboard (load, capture time)');
  await h.key('down', 'KeyW'); await h.wait(5000); await h.key('up', 'KeyW');
  await h.key('down', 'KeyS'); await h.waitFor('Math.abs(__T.sim.speed) < 0.4', 15000); await h.key('up', 'KeyS');
  await h.eval('__WG.st(__T)');
  await h.key('tap', 'KeyV'); await h.wait(1200); await h.shot('m35-troops-chase'); await h.key('tap', 'KeyV');
  await h.key('tap', 'BracketRight'); await h.key('tap', 'BracketRight'); await h.key('tap', 'BracketRight'); await h.wait(500);
  await h.eval('({ seat: __T.seats[__T.seat].label })');
  await h.shot('m35-bench-seat');
  await h.key('tap', 'BracketLeft'); await h.wait(200);
  await h.eval('({ seat: __T.seats[__T.seat].label })');
  await h.expect("__T.seats[__T.seat].sid === 'ring'", 'the ring mount seat');
  await h.wait(500); await h.shot('m35-ring-mount-m2');

  // ---------------------------------------------------------------- 7. the COMMANDER hook: one spawn function per type
  await h.eval(`(() => { const P = ${P}, I = __G.ISLANDS.find(I => I.owner === 1 && I.pad), n0 = P.list.length, mat0 = __G.G.mat; const S = __T.sim;
    const a = P.spawnM151(I), b = P.spawnM35({ x: S.pos[0] + 12, z: S.pos[2] + 6, yaw: 1 }, { running: true }), c = P.spawnBeetle({ x: S.pos[0] - 12, z: S.pos[2] + 6 }), d = P.spawners.hilux({ x: S.pos[0] - 12, z: S.pos[2] - 10 });
    window.__SP = [a, b, c, d]; return { added: P.list.length - n0, types: [a, b, c, d].map(V => V && V.type), owners: [a, b, c, d].map(V => V && V.owner), runningM35: b && b.sim.eng.running, mat: __G.G.mat - mat0, fns: Object.keys(P.spawners) }; })()`, 'commander spawners');
  await h.wait(1500);
  await h.expect("__SP.every(V => V && V.exists && V.sim.up[1] > 0.9) && __SP[1].sim.eng.running && __SP[2].owner === 'civ' && __SP[0].owner === 'mil'", 'pool.spawnM151 / spawnM35 / spawnBeetle / spawners.hilux: upright, the M35 running');
  await h.key('tap', 'KeyV'); await h.wait(1200); await h.shot('commander-spawned');
}
