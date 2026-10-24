// ARMOUR IN THE GAME (wave 2): the M60A3 TTS and the M113A2 on the real islands.
// 1 walk to the M60 at the home motor pool, climb in at the driver's hatch; drive the lane (paved), off the road (grass),
//   up a hillside; 2 the gunner's day and thermal sights: lay on a RUNAWAY building at CITADEL, lase, fire, hit (war.js);
// 3 RUNAWAY fire into the armour model (V.hit); 4 the M113 on the ALBATROSS's deck while she sails and turns;
// 5 the M113 down the home island's landing hard into the sea: swims (vane up, pumps on); 6 out at the hatch;
// 7 an LCM-8 lands the M60 on the hard and its crew drives it up.
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 30000);
  await h.eval(`(window.__A = {
    T: () => __G.m60C, A: () => __G.m113C,
    st: d => { const o = d.fm.origin(), f = d.fm; return { craft: __G.G.craft, seat: __G.crafts.seat, x: +o[0].toFixed(1), y: +o[1].toFixed(2), z: +o[2].toFixed(1), kmh: +(f.out.fwd * 3.6).toFixed(1), pitch: +f.out.pitch.toFixed(2), eng: f.eng.running, range: f.range, soil: f.soil.join('/'), afloat: f.water.afloat, depth: +f.water.depth.toFixed(2), drv: d.driver.state, dead: d.dead }; },
    toDoor: (d, i) => { const s = d.seats[i], w = __G.crafts.toWorld(d, [s.door[0] * 1.25, 0, s.door[2]]); return __G.foot.spawnAt([{ x: w.x, y: d.fm.origin()[1] + 0.3, z: w.z, yaw: w.yaw }]); },
    aimAt: (d, x, y, z) => { const p = d.V.turretPoint([0.55, 0.85, -0.9]), dx = x - p[0], dy = y - p[1], dz = z - p[2], l = Math.hypot(dx, dy, dz); d.aim.yaw = Math.atan2(-dx, -dz); d.aim.pitch = Math.asin(dy / l); d.aim.set = true; return Math.round(l); },
    sightErr: d => { const s = d.V.sightDir(); return +(Math.hypot(Math.atan2(-s[0], -s[2]) - d.aim.yaw, Math.asin(s[1]) - d.aim.pitch) * 1000).toFixed(1); },
  }, 1)`);
  // ---- 1. into the M60 at the home island motor pool, drive
  await h.expect('__A.T().exists && !__A.T().dead');
  await h.eval('(() => { const H = __G.HARDS.find(d => d.I === __G.HOME_B.isl), o = __A.T().fm.origin(); return { hardTop: H.at(H.u1 + 6).map(Math.round), m60: [o[0], o[2]].map(Math.round) }; })()');
  await h.eval('(() => { const s = __G.GR.motorPool(__G.HOME_B.isl, 4.6); __A.T().spawnAt(s); return s.name; })()'); await h.wait(500);
  await h.key('tap', 'KeyY'); await h.wait(400);
  await h.eval('__A.toDoor(__A.T(), 0)'); await h.wait(500);
  await h.eval("document.getElementById('hint').textContent");
  await h.expect("document.getElementById('hint').textContent.includes('M60A3')");
  await h.key('tap', 'KeyY'); await h.wait(600);
  await h.expect("__G.G.craft === 'm60' && __G.crafts.seat === 0");
  await h.key('tap', 'KeyI');   // cold: the driver's own start-up (MASTER on, START)
  await h.waitFor('__A.T().fm.eng.running', 15000);
  await h.wait(800); await h.shot('m60-driver-periscopes');
  await h.key('tap', 'KeyH'); await h.wait(1500); await h.shot('m60-driver-head-out');
  // keys: drive forward a little, turn
  await h.eval('(window.__p0 = __A.st(__A.T()), 1)');
  await h.key('down', 'KeyW'); await h.waitFor('Math.abs(__A.T().fm.out.fwd) > 3', 20000); await h.key('down', 'KeyD'); await h.wait(1500); await h.key('up', 'KeyD'); await h.key('up', 'KeyW');
  await h.key('down', 'KeyS'); await h.waitFor('Math.abs(__A.T().fm.out.fwd) < 0.4', 20000); await h.key('up', 'KeyS');
  await h.eval('({ from: __p0, now: __A.st(__A.T()) })');
  await h.expect('Math.hypot(__A.st(__A.T()).x - __p0.x, __A.st(__A.T()).z - __p0.z) > 5');
  // the road: the crew drives to the lane and along it (the AI driver; any key takes over)
  await h.eval(`(() => { const G = window.__WORLD.roadGraph(__G.HOME_B.isl.x, __G.HOME_B.isl.z, 200), R = G.roads.find(r => r.kind === 'zone') || G.roads[0]; const pts = []; for (let i = 4; i < R.xs.length; i += 2) pts.push([R.xs[i], R.zs[i]]); window.__road = pts; __A.T().spawnAt({ x: R.xs[1], z: R.zs[1], yaw: Math.atan2(R.xs[1] - R.xs[3], R.zs[1] - R.zs[3]) });   /* TERRAIN: from the lane's own start on the apron (the motor pool can sit behind the pad's AA guns) */ window.__paved = 0; setInterval(() => { if (__A.T().fm.soil.includes('paved') && __A.T().fm.out.fwd > 1) __paved++; }, 200); __A.T().order(pts, { speed: 5, arrive: 4 }); return pts.length; })()`);
  await h.key('tap', 'KeyV'); await h.wait(300);
  await h.waitFor(`Math.hypot(__A.T().fm.origin()[0] - __road[2][0], __A.T().fm.origin()[2] - __road[2][1]) < 12`, 60000);
  await h.eval('__A.st(__A.T())'); await h.shot('m60-on-the-road-chase');
  await h.expect('__paved > 5');   // driven on the tarmac lane (1 s of samples at > 3.6 km/h on paved)
  await h.waitFor(`__A.T().driver.state !== 'driving'`, 90000);
  await h.eval('({ st: __A.st(__A.T()), drv: __A.T().driver.state })');
  // a climb: up the home island's landing hard (1 in 5, concrete) and on up the hillside above it (grass, steeper)
  await h.eval(`(() => { const H = __G.HARDS.find(d => d.I === __G.HOME_B.isl), a = H.at(2), b = H.at(H.u1 + 18); __A.T().spawnAt({ x: a[0], z: a[1], yaw: H.yaw }); __A.T().order([b], { speed: 4, arrive: 4 }); return { from: a.map(Math.round), to: b.map(Math.round), rise: +(__G.terrainH(b[0], b[1]) - __G.terrainH(a[0], a[1])).toFixed(1) }; })()`);
  await h.eval('(window.__y0 = __A.T().fm.origin()[1], window.__pmax = 0, window.__pt = setInterval(() => { __pmax = Math.max(__pmax, __A.T().fm.out.pitch); }, 100), 1)');
  await h.wait(5000); await h.eval('__A.st(__A.T())'); await h.shot('m60-climbing-the-hard');
  await h.waitFor(`__A.T().driver.state !== 'driving'`, 90000);
  await h.eval('({ st: __A.st(__A.T()), climbed: +(__A.T().fm.origin()[1] - __y0).toFixed(1), maxPitchDeg: +(__pmax * 57.3).toFixed(1), drv: __A.T().driver.state })');
  await h.expect("__A.T().fm.origin()[1] - __y0 > 2 && __pmax > 0.1");
  // out at the hatch (TERRAIN: the beach exit track is easy going now, so let it roll to a stop first)
  await h.waitFor('Math.abs(__A.T().fm.out.fwd) < 0.3', 20000);
  await h.key('tap', 'KeyY'); await h.wait(600);
  await h.expect("__G.G.craft === 'foot' && Math.hypot(__G.foot.W.x - __A.T().fm.origin()[0], __G.foot.W.z - __A.T().fm.origin()[2]) < 5");
  await h.eval("(__G.foot.view = 'third', __G.foot.W.yaw += 2.5, 1)"); await h.wait(900); await h.shot('out-at-the-hatch');
  // ---- 2. gunnery: a RUNAWAY building with a clear line of sight from 220-420 m (past the laser's 200 m minimum)
  await h.eval(`(() => { const T = __G.terrainH; for (const I of __G.ISLANDS) for (const tg of (I.structs || [])) { if (tg.dead || tg.side !== 2 || tg.kind === 'aa' || tg.kind === 'shipyard') continue; const ty = tg.y + Math.max(2, tg.h * 0.8); for (const r of [240, 300, 360, 420]) for (let k = 0; k < 36; k++) { const a = k * Math.PI / 18, x = tg.x + Math.cos(a) * r, z = tg.z + Math.sin(a) * r, g = T(x, z); if (g < 2.5 || Math.hypot(T(x + 3, z) - T(x - 3, z), T(x, z + 3) - T(x, z - 3)) / 6 > 0.12 || __G.BASES.some(b => Math.hypot(b.x - x, b.z - z) < 25)) continue; let ok = true; for (let s = 6; s < r - tg.r && ok; s += 3) { const f = s / r, px = x + (tg.x - x) * f, pz = z + (tg.z - z) * f, py = g + 2.8 + (ty - g - 2.8) * f; if (py < Math.max(T(px, pz), 0) + 0.8) ok = false; } if (!ok) continue; window.__tgt = tg; __A.T().spawnAt({ x, z, yaw: Math.atan2(-(tg.x - x), -(tg.z - z)), state: 'hot' }); return { at: [Math.round(x), Math.round(z), Math.round(g)], target: tg.kind, island: I.name, hp: tg.hp, d: r }; } } return null; })()`);
  await h.expect('!!window.__tgt');
  await h.eval(`(__G.crafts.control('m60', 1, 'foot'), 1)`); await h.wait(500);
  await h.expect("__G.G.craft === 'm60' && __G.crafts.seat === 1 && __A.T().firstPerson()");
  await h.eval('__A.aimAt(__A.T(), __tgt.x, __tgt.y + Math.max(2, __tgt.h * 0.8), __tgt.z)');
  await h.waitFor('__A.sightErr(__A.T()) < 4', 30000); await h.wait(800);
  await h.eval('({ err_mrad: __A.sightErr(__A.T()), az: __A.T().V.az.toFixed(3) })');
  await h.key('tap', 'KeyT'); await h.wait(1500); await h.eval("document.getElementById('msg').textContent");
  if (!(await h.eval('__A.T().V.laser.range'))) { await h.wait(2500); await h.key('tap', 'KeyT'); await h.wait(1500); }
  await h.eval('({ range: __A.T().V.laser.range, fc: __A.T().V.fc.solved })');
  await h.expect('__A.T().V.laser.range > 200 && __A.T().V.fc.solved');
  await h.shot('gunner-day-sight');
  await h.eval('(window.__hp0 = __tgt.hp, 1)');
  await h.waitFor("__A.T().V.gun.state === 'ready'", 20000);
  await h.key('down', 'KeyF'); await h.wait(250); await h.key('up', 'KeyF'); await h.shot('gunner-day-fire');
  await h.waitFor('__tgt.hp < __hp0 || __tgt.dead', 8000);
  await h.eval('({ hp0: __hp0, hp: __tgt.hp, dead: __tgt.dead, shots: __A.T().gunnery.stats })');
  await h.key('tap', 'KeyO'); await h.waitFor("__A.T().V.sight === 'tts'", 3000); await h.wait(1200);
  await h.shot('gunner-thermal-sight');
  await h.waitFor("__A.T().V.gun.state === 'ready'", 20000);
  await h.eval('(window.__hp1 = __tgt.hp, 1)');
  await h.key('down', 'KeyF'); await h.wait(300); await h.key('up', 'KeyF'); await h.shot('gunner-thermal-fire');
  await h.waitFor('__tgt.hp < __hp1 || __tgt.dead', 8000);
  await h.eval('({ hp: __tgt.hp, dead: __tgt.dead, shots: __A.T().gunnery.stats })');
  await h.expect('__A.T().gunnery.stats.hits >= 2 && __tgt.hp < __hp0');
  await h.key('tap', 'KeyU'); await h.wait(800); await h.shot('gunner-thermal-black-hot');
  await h.key('tap', 'KeyO'); await h.key('tap', 'KeyE'); await h.wait(900); await h.shot('gunner-station');
  await h.key('tap', 'KeyE'); await h.key('tap', 'KeyV'); await h.wait(1200); await h.shot('gunner-chase-reticle');
  // ---- 3. RUNAWAY fire into the armour model: a cannon burst on the side, a missile
  await h.eval(`(() => { const T = __A.T(), o = T.fm.origin(), R = T.fm.R, THREE = __G.THREE; const at = new THREE.Vector3(o[0] + R[0] * 1.9, o[1] + 1.2, o[2] + R[6] * 1.9), dir = new THREE.Vector3(-R[0] * 900, -20, -R[6] * 900); for (let i = 0; i < 6; i++) __G.hurtPlayer(0.2, 'HIT', at, dir); return { comps: T.V.armor.COMPS.filter(c => c.hp < 1).map(c => c.id + ' ' + c.hp.toFixed(2)), msg: document.getElementById('msg').textContent }; })()`);
  await h.eval(`(() => { const T = __A.T(), o = T.fm.origin(), R = T.fm.R, THREE = __G.THREE; const at = new THREE.Vector3(o[0] - R[0] * 1.9, o[1] + 1.0, o[2] - R[6] * 1.9), dir = new THREE.Vector3(R[0] * 300, -10, R[6] * 300); __G.hurtPlayer(0.6, 'MISSILE', at, dir); return { comps: T.V.armor.COMPS.filter(c => c.hp < 1).map(c => c.id + ' ' + c.hp.toFixed(2)), kill: T.V.armor.cookoff, dead: T.dead, msg: document.getElementById('msg').textContent }; })()`);
  await h.expect('__A.T().V.armor.COMPS.some(c => c.hp < 1)');
  await h.wait(1500); await h.shot('m60-hit');
  // ---- 4. the M113 on the ALBATROSS's deck while she sails and turns
  await h.eval('(__G.toHeli("BACK TO THE DECK"), 1)'); await h.wait(500);
  await h.eval(`(() => { const s = __G.GR.deckSpot(1); __A.A().spawnAt(s); return s.name; })()`); await h.wait(500);
  await h.expect('__A.A().exists');
  await h.eval(`(__G.crafts.control('m113', 1, 'foot'), __A.A().view = 'chase', __A.A().orbit.yaw = 2.2, __A.A().orbit.pitch = 0.35, 1)`);
  await h.wait(2000);
  await h.eval(`(() => { const c = __G.war.carrier; __G.war.orderCarrier(c.p.x - Math.sin(c.yaw + 0.6) * 700, c.p.z - Math.cos(c.yaw + 0.6) * 700); const o = __A.A().fm.origin(), [x, z] = __G.GR.toLocal(c, o[0], o[2]); window.__dl = [x, z, c.p.x, c.p.z, c.yaw]; return __dl.map(v => +v.toFixed(2)); })()`);
  await h.wait(15000);
  await h.eval(`(() => { const c = __G.war.carrier, o = __A.A().fm.origin(), [x, z] = __G.GR.toLocal(c, o[0], o[2]); return { local: [x, z].map(v => +v.toFixed(2)), was: __dl.slice(0, 2).map(v => +v.toFixed(2)), shipMoved: +Math.hypot(c.p.x - __dl[2], c.p.z - __dl[3]).toFixed(1), turned: +((c.yaw - __dl[4]) * 57.3).toFixed(1), y: +o[1].toFixed(2) }; })()`);
  await h.expect(`(() => { const c = __G.war.carrier, o = __A.A().fm.origin(), [x, z] = __G.GR.toLocal(c, o[0], o[2]); return Math.hypot(x - __dl[0], z - __dl[1]) < 0.6 && Math.hypot(c.p.x - __dl[2], c.p.z - __dl[3]) > 10; })()`);   // (0.6 m: since the live sea the deck heaves and rolls under it)
  await h.shot('m113-on-the-moving-deck');
  // ---- 5. the M113 down the home landing hard into the sea: vane up, pumps on, swim
  await h.eval(`(() => { const H = __G.HARDS.find(d => d.I === __G.HOME_B.isl), p = H.at(12); __A.A().spawnAt({ x: p[0], z: p[1], yaw: H.yaw + Math.PI }); __G.crafts.control('m113', 0, 'swap'); __A.A().view = 'chase'; __A.A().orbit.yaw = 2.4; __A.A().orbit.pitch = 0.3; return [Math.round(p[0]), Math.round(p[1])]; })()`);
  await h.key('tap', 'KeyI'); await h.waitFor('__A.A().fm.eng.running', 15000);
  await h.key('tap', 'KeyN'); await h.key('tap', 'KeyB'); await h.waitFor('__A.A().V.vane > 0.95 && __A.A().fm.water.pumps', 25000);
  await h.expect('__A.A().V.vane > 0.95 && __A.A().fm.water.pumps');
  await h.key('down', 'KeyW'); await h.waitFor('__A.A().fm.water.afloat', 60000);
  await h.eval('__A.st(__A.A())'); await h.wait(12000);
  await h.eval('({ st: __A.st(__A.A()), waterIn: +__A.A().fm.water.inside.toFixed(2) })');
  await h.expect('__A.A().fm.water.afloat && __A.A().fm.out.fwd * 3.6 > 3.5 && __A.A().fm.eng.running');
  await h.shot('m113-swimming');
  await h.key('up', 'KeyW');
  await h.eval("(__A.A().view = 'eye', __G.crafts.cycleSeat(1), 1)"); await h.wait(1200); await h.shot('m113-commander-afloat');
  // ---- 7. the LCM-8 lands the M60 on the home hard; its crew drives it up
  await h.eval('(__G.toHeli(), __G.armDelivery.runIn = 60, __G.G.mat = 300, __G.selIsl = __G.HOME_B.isl, __G.deliverArmour("m60"), __G.armDelivery.runs.length)');
  await h.expect('__G.armDelivery.runs.length === 1 && !!__G.armDelivery.runs[0].pl.hard');
  await h.eval(`(__G.crafts.control('m60', 2, 'foot'), __A.T().view = 'chase', __A.T().orbit.yaw = 2.6, __A.T().orbit.pitch = 0.3, 1)`);
  await h.waitFor("__G.armDelivery.runs[0].state === 'beached'", 120000);
  await h.wait(5000); await h.shot('lcm8-ramp-down');
  await h.waitFor("__G.armDelivery.runs[0].state === 'rampUp' || __G.armDelivery.runs[0].state === 'backing'", 60000);
  await h.eval('(__A.T().orbit.yaw = 0.5, 1)'); await h.wait(2500); await h.shot('lcm8-tank-ashore');
  await h.waitFor(`__A.T().driver.state !== 'driving'`, 60000);
  await h.eval('({ st: __A.st(__A.T()), gun: __A.T().V.armor.COMPS.find(c => c.id === "gun").hp })');
  await h.expect(`__A.T().fm.origin()[1] > 3 && !__A.T().fm.water.afloat && __A.T().driver.state === 'arrived'`);
}
