// THE 1980 MARINE, the rest of his life (ngc/foot2): search the ammunition crate on the ALBATROSS deck (F), rearm on
// the carrier deck, ride the TEST CAR and get out again with the same kit and wounds, then bleed out from an untreated
// femoral wound: the life ends (COMMANDER: one Marine lost to the fleet), his body stays on the deck with his kit, a new crew starts in the Huey and
// the next Marine out is a fresh one.
//   CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/marinelife.mjs
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 30000);
  await h.key('tap', 'KeyY'); await h.wait(600);
  await h.expect("__G.G.craft === 'foot' && __G.marine.crates.length >= 3", 'out on the deck; crates stocked on the carrier and the islands');
  // 1. the ammunition crate forward of the island: F searches it
  await h.eval(`(() => { const c = __G.war.carrier, p = __G.GR.fromShip(c, 12.4, 8, -4.6, {}); __G.foot.spawnAt({ x: p.x, y: __G.GR.deckH(p.x, p.z), z: p.z, yaw: c.yaw + Math.PI }); return __G.marine.nearestLoot() && __G.marine.nearestLoot().name; })()`);
  await h.wait(400); await h.eval("document.getElementById('hint').textContent");
  await h.expect("document.getElementById('hint').textContent.startsWith('F: SEARCH')", 'the hint offers the crate');
  await h.eval("(() => { const t = __G.marine.nearestLoot(), W = __G.foot.W; __G.marine.aim(Math.atan2(-(t.x - W.x), -(t.z - W.z)), -0.45); __G.marine.view = 'third'; return 1; })()"); await h.wait(700); await h.shot('by-the-deck-crate');
  await h.key('tap', 'KeyF'); await h.wait(3500);
  await h.expect("__G.marine.ui === 'gear' && !!document.querySelector('.ngc-inv.on') && /CRATE|CHEST/.test(document.querySelector('.ngc-inv.on').textContent)", 'F opens the crate next to the rig (searching)');
  await h.shot('searching-the-crate');
  await h.key('tap', 'Escape'); await h.wait(300);
  // 2. rearm on the carrier deck: fire some, F away from the crates refills the magazines
  await h.eval(`(() => { const c = __G.war.carrier, p = __G.GR.fromShip(c, -4, 8, 20, {}); __G.foot.spawnAt({ x: p.x, y: __G.GR.deckH(p.x, p.z), z: p.z, yaw: c.yaw + 1.2 }); __G.marine.view = 'first'; return 1; })()`);
  for (let i = 0; i < 5; i++) { await h.eval('__G.marine.input({ fire: true })'); await h.wait(150); await h.eval('__G.marine.input({ fire: false })'); await h.wait(150); }
  await h.eval('({ rounds: __G.marine.R.cur.rounds, shots: __G.marine.stats.shots })');
  await h.key('tap', 'KeyF'); await h.wait(300);
  await h.eval("({ msg: document.getElementById('msg').textContent, inGun: __G.marine.R.cur.mag.rounds })");
  await h.expect("/ALBATROSS/.test(document.getElementById('msg').textContent) && __G.marine.R.cur.mag.rounds >= 18", 'F on the carrier deck: rearmed (the magazine in the rifle refilled)');
  // 3. a wound, then into the TEST CAR and out again: same man, same kit, same wound
  await h.eval(`(() => { const M = __G.marine.M; M.hit({ round: 'M193', velocity: 800, part: 'armL', zone: 'forearm', dir: [1, 0, 0] }); window.__hp = Math.round(M.regions.armL.hp); window.__mags = __G.marine.inv.slots.belt.slots.ammoL.grids.flat().length; return __hp; })()`);
  await h.eval(`(() => { const car = __G.carC; car.spawnAt({ x: __G.PAD.x + 14, y: __G.PAD.h, z: __G.PAD.z + 14, yaw: 0 }); const d = __G.crafts.toWorld(car, [-1.6, 0, -0.1]); return __G.foot.spawnAt({ x: d.x, y: d.y + 0.3, z: d.z, yaw: Math.PI / 2 }); })()`);
  await h.wait(500); await h.key('tap', 'KeyY'); await h.wait(500);
  await h.expect("__G.G.craft === 'boxcar'", 'into the TEST CAR');
  await h.key('tap', 'KeyY'); await h.wait(600);
  await h.expect("__G.G.craft === 'foot' && Math.round(__G.marine.M.regions.armL.hp) === __hp && __G.marine.inv.slots.belt.slots.ammoL.grids.flat().length === __mags", 'out of the car: the same Marine (wound and kit kept)');
  // 4. an untreated femoral bleed: he bleeds out -> the life ends
  await h.eval(`(() => { const c = __G.war.carrier, p = __G.GR.fromShip(c, -6, 8, 0, {}); __G.foot.spawnAt({ x: p.x, y: __G.GR.deckH(p.x, p.z), z: p.z, yaw: c.yaw }); const M = __G.marine.M; M.bleeds.push({ id: 901, region: 'legR', zone: 'thigh', type: 'arterial', rate: 500, ctl: 'tq', name: 'FEMORAL A.', clot: 0, ctrl: 1, t: 0, dressed: false, packed: false, stopped: false }); window.__lives = __G.fleet.lost.marine; return __lives; })()`);
  await h.eval('(() => { const M = __G.marine.M; let t = 0; while (M.lossFrac() < 0.4 && !M.unconscious && t < 600) { M.update(0.25, {}); t += 0.25; } return { t, cls: M.cls(), conscious: M.conscious, vision: __G.marine.MS.mods.med && __G.marine.MS.mods.med.vision }; })()');
  await h.wait(800); await h.shot('bleeding-out-tunnel-vision');
  await h.eval('(() => { const M = __G.marine.M; let t = 0; while (!M.dead && t < 900) { M.update(0.25, {}); t += 0.25; } return { t, cause: M.cause }; })()');
  await h.waitFor('!__G.foot.alive', 5000);
  await h.expect('!__G.foot.alive && __G.fleet.lost.marine === __lives + 1 && __G.marine.bodies.length >= 1', 'bled out: a Marine lost to the fleet (COMMANDER), his body stays');
  await h.wait(1200); await h.shot('killed-bled-out');
  await h.waitFor("__G.G.craft === 'heli'", 15000);
  await h.expect("__G.G.craft === 'heli' && __G.Z.alive", 'a new crew in the Huey');
  // 5. the next Marine out is fresh, his predecessor lies on the deck with the kit
  await h.waitFor('__G.H.landed', 10000); await h.wait(500);
  await h.key('tap', 'KeyY'); await h.wait(600);
  await h.expect("__G.G.craft === 'foot' && __G.marine.M.bleeds.length === 0 && Math.round(__G.marine.M.regions.armL.hp) === 60 && !__G.marine.MS.dead", 'a fresh Marine (no wounds, full kit)');
  await h.eval(`(() => { const b = __G.marine.bodies[__G.marine.bodies.length - 1]; __G.foot.spawnAt({ x: b.x + 1.2, y: b.y, z: b.z, yaw: 0 }); return { body: b.name, items: __G.marine.I.findAll(b.c, () => true).length }; })()`);
  await h.wait(500);
  await h.expect("/SEARCH YOUR BODY/.test(document.getElementById('hint').textContent)", 'the old body is lootable');
  await h.eval("(__G.marine.view = 'third', __G.marine.aim(__G.marine.S.yaw, -0.6), 1)"); await h.wait(900); await h.shot('the-body-on-deck');
  // 6. an M67 from the rig at a RUNAWAY trooper 11 m forward on the deck (G)
  await h.eval(`(() => { const c = __G.war.carrier, p = __G.GR.fromShip(c, -6, 8, 30, {}), q = __G.GR.fromShip(c, -6, 8, 19, {}); __G.foot.spawnAt({ x: p.x, y: __G.GR.deckH(p.x, p.z), z: p.z, yaw: c.yaw }); __G.marine.view = 'first'; __G.marine.aim(c.yaw, -0.05);
      window.__tg2 = __G.marine.addFigure(q.x, __G.GR.deckH(q.x, q.z), q.z, c.yaw + Math.PI, { ship: c }); window.__m67 = __G.marine.I.findAll(__G.marine.inv, o => o.id === 'm67').length; return __m67; })()`);
  await h.wait(400); await h.key('tap', 'KeyG'); await h.wait(700); await h.shot('frag-out');
  await h.waitFor('__G.marine.stats.booms >= 1', 15000); await h.wait(300); await h.shot('frag-burst');
  await h.eval('({ boom: __G.marine.lastBoom, tg: { alive: __tg2.alive, x: __tg2.x, z: __tg2.z }, left: __G.marine.I.findAll(__G.marine.inv, o => o.id === "m67").length, me: __G.marine.M.log.filter(e => e.type === "hit").length })');
  await h.expect('__G.marine.I.findAll(__G.marine.inv, o => o.id === "m67").length === __m67 - 1 && !__tg2.alive', 'a grenade from the rig, thrown, burst: the trooper is down');
}
