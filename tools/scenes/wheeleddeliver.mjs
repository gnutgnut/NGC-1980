// The motor pool's 1980 deliveries (ngc/wheeledgame, units/wheeled/delivery.js): 7 = an M151A2 slung under a CH-46E
// from the ALBATROSS to the selected friendly island's motor pool; 9 = an M35A2 run in to the island's beach by an LCM-8,
// ramp down, the truck drives off up the sand. Materiel is charged; the vehicles are crafts you can get into once down.
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 40000);
  await h.key('tap', 'KeyY'); await h.wait(400);
  await h.eval(`(window.__DL = {
    D: () => __G.pool.delivery,
    face: (x, y, z) => { const W = __G.foot.W, S = __G.marine.S; return __G.marine.aim(Math.atan2(-(x - W.x), -(z - W.z)), Math.atan2(y - (W.y + 1.6), Math.hypot(x - W.x, z - W.z))); },
    job: () => { const j = __G.pool.delivery.jobs[0]; return j ? { kind: j.kind, phase: j.phase, x: Math.round(j.x), y: +(j.y ?? 0).toFixed(1), z: Math.round(j.z), slung: j.V.slung } : null; },
  }, 1)`);
  // the home island selected; stand by its pad, looking at the motor pool
  await h.eval(`(() => { const I = __G.HOME_B.isl; __G.selIsl = I; __G.G.mat = 100; const p = I.pad, a = 2.2, x = p.x + Math.cos(a) * 12, z = p.z + Math.sin(a) * 12; __G.foot.spawnAt({ x, y: __G.terrainH(x, z) + 0.5, z, yaw: 0 }); __G.foot.view = 'third'; return { pad: [p.x, p.z], mat: __G.G.mat }; })()`);
  await h.wait(500);
  await h.eval('(window.__n0 = __G.pool.list.length, window.__m0 = __G.G.mat, 1)');
  await h.key('tap', 'Digit7'); await h.wait(200); await h.key('tap', 'Digit1'); await h.wait(400);
  await h.eval("({ msg: document.getElementById('msg').textContent, job: __DL.job(), mat: __G.G.mat })", 'ordered an M151');
  await h.expect("__DL.D().jobs.length === 1 && __DL.D().jobs[0].kind === 'ch46' && Math.abs(__G.G.mat - (__m0 - 10)) < 2", 'a CH-46 is on its way (10 materiel)');
  await h.eval('(window.__J = __DL.D().jobs[0], window.__JV = __J.V, 1)');
  await h.expect("__JV.slung && !__JV.enter(0, 'foot')", 'the slung jeep cannot be boarded yet');
  await h.waitFor('Math.hypot(__J.x - __J.spot.x, __J.z - __J.spot.z) < 160', 90000);
  await h.eval('(__DL.face(__J.x, __J.y, __J.z), __DL.job())'); await h.wait(800); await h.shot('ch46-inbound-with-the-m151');
  await h.waitFor("__J.phase === 'lower' || __J.phase === 'release'", 90000);
  await h.eval('(__DL.face(__J.x, __J.y - 6, __J.z), __DL.job())'); await h.wait(600); await h.shot('ch46-hover-lowering');
  await h.waitFor("!__JV.slung", 60000); await h.wait(2500);
  await h.eval(`({ job: __DL.job(), st: { x: +__JV.sim.pos[0].toFixed(1), z: +__JV.sim.pos[2].toFixed(1), onGround: __JV.sim.onGround, up: +__JV.sim.up[1].toFixed(3) }, spot: [__J.spot.x, __J.spot.z] })`, 'set down');
  await h.expect('!__JV.slung && __JV.sim.onGround && __JV.sim.up[1] > 0.95 && Math.hypot(__JV.sim.pos[0] - __J.spot.x, __JV.sim.pos[2] - __J.spot.z) < 2.5', 'the M151 is down on its wheels at the motor pool');
  await h.eval('(__DL.face(__J.x, __J.y, __J.z), 1)'); await h.wait(600); await h.shot('ch46-going-home');
  // into the delivered jeep
  await h.eval(`(() => { const d = __G.crafts.toWorld(__JV, __JV.seats[0].door.map((v, i) => i === 0 ? v * 1.4 : v)); return __G.foot.spawnAt({ x: d.x, y: __JV.sim.pos[1] + 0.4, z: d.z, yaw: 0 }); })()`);
  await h.wait(500); await h.key('tap', 'KeyY'); await h.wait(400);
  await h.expect('__G.G.craft === __JV.id', 'in the delivered M151');
  await h.key('tap', 'KeyY'); await h.wait(400);
  // the M35 by landing craft
  await h.eval('(window.__m1 = __G.G.mat, 1)');
  await h.key('tap', 'Digit7'); await h.wait(200); await h.key('tap', 'Digit2'); await h.wait(400);
  await h.eval("({ msg: document.getElementById('msg').textContent, job: __DL.D().jobs.map(j => j.kind), mat: __G.G.mat })", 'ordered an M35');
  await h.eval('(window.__L = __DL.D().jobs.find(j => j.kind === "lcm"), window.__LV = __L && __L.V, __L ? { beach: __L.beach.name, gx: Math.round(__L.gx), gz: Math.round(__L.gz), from: [Math.round(__L.x), Math.round(__L.z)] } : null)');
  await h.expect("__L && Math.abs(__G.G.mat - (__m1 - 20)) < 2 && __LV.slung", 'an LCM-8 is running an M35 in (20 materiel)');
  // watch from the beach
  await h.eval(`(() => { const b = __L.beach, x = b.x - Math.sin(b.yaw) * 14 + Math.cos(b.yaw) * 12, z = b.z - Math.cos(b.yaw) * 14 - Math.sin(b.yaw) * 12; __G.foot.spawnAt({ x, y: __G.terrainH(x, z) + 0.5, z, yaw: 0 }); return [x, z]; })()`);
  await h.eval('(__L.x = __L.gx + __L.ux * 90, __L.z = __L.gz + __L.uz * 90, 1)');   // (the scene skips most of the 350 m run in)
  await h.wait(3000); await h.eval('(__DL.face(__L.x, 1, __L.z), 1)'); await h.wait(600); await h.shot('lcm8-running-in');
  await h.waitFor("__L.phase === 'ramp' || __L.phase === 'drive'", 90000);
  await h.wait(2500); await h.eval('(__DL.face(__L.x, 1, __L.z), 1)'); await h.wait(500); await h.shot('lcm8-ramp-down');
  await h.waitFor("__L.phase === 'wait' || __L.phase === 'back' || __L.phase === 'gone' || (!__LV.slung && __G.terrainH(__LV.sim.pos[0], __LV.sim.pos[2]) > 1.5)", 150000);   // (ashore: the follower's last metres take game time a loaded machine is short of)
  await h.eval(`({ phase: __L.phase, st: { x: +__LV.sim.pos[0].toFixed(1), z: +__LV.sim.pos[2].toFixed(1), y: +__LV.sim.pos[1].toFixed(2), depth: +__LV.sim.depth.toFixed(2), run: __LV.sim.eng.running, up: +__LV.sim.up[1].toFixed(3) }, ground: +__G.terrainH(__LV.sim.pos[0], __LV.sim.pos[2]).toFixed(2) })`, 'the M35 ashore');
  await h.expect('!__LV.slung && __LV.sim.up[1] > 0.95 && __G.terrainH(__LV.sim.pos[0], __LV.sim.pos[2]) > 0.2 && __LV.sim.depth < 0.1', 'the M35 drove off the ramp up the beach onto dry sand');
  await h.eval('(__DL.face(__LV.sim.pos[0], 1.5, __LV.sim.pos[2]), 1)'); await h.wait(700); await h.shot('m35-ashore');
}
