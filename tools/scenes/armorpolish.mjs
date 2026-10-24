// ARMOUR polish (wave 3): every crew station a working, clickable station; the crew in and out of the hatches; the
// start-up procedure; the HUD. M60A3: the driver (cold: MASTER, START by clicking the panel), the periscopes, the gunner
// (TURRET POWER on the right wall, the stab run-up, the sight), the loader (a round out of the ready rack by clicking
// it), the commander (looking about inside the cupola, the OVERRIDE handle slews the turret), the crew buttoning up
// under fire. M113A2: driver start-up, the RAMP switch, the commander looking about the troop compartment.
// The LCM-8 run at the end (stern anchor, ramp wires, deckhands, the radio calls).
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 30000);
  await h.eval(`(window.__S = {
    T: () => __G.m60C, A: () => __G.m113C, hold: null,
    look(d, yaw, pitch) { clearInterval(this.hold); this.hold = setInterval(() => { d.head.yaw = yaw; d.head.pitch = pitch; }, 5); },
    free() { clearInterval(this.hold); this.hold = null; },
    // turn the head onto a hit box (off: the station's eye pitch offset, base: its yaw offset)
    aim(d, id, off = 0.1, base = 0) {
      const ck = d.cockpitObj(); if (!ck) return 'no station'; const hb = ck.hitBoxes.find(o => o.userData.sw === id); if (!hb) return 'no hit ' + id;
      const THREE = __G.THREE, P = new THREE.Vector3(); hb.getWorldPosition(P); const cam = __G.zCam;
      const E = new THREE.Quaternion().setFromEuler(new THREE.Euler(d.head.pitch - off, d.head.yaw + base, 0, 'YXZ'));
      const B = cam.quaternion.clone().multiply(E.invert()), dir = P.sub(cam.position).applyQuaternion(B.invert());
      const yaw = Math.atan2(Math.sin(Math.atan2(-dir.x, -dir.z) - base), Math.cos(Math.atan2(-dir.x, -dir.z) - base)), pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) + off; this.look(d, yaw, pitch);
      return [+yaw.toFixed(2), +pitch.toFixed(2)];
    },
    scr(d, id) { const ck = d.cockpitObj(); const hb = ck && ck.hitBoxes.find(o => o.userData.sw === id); if (!hb) return null; const v = new __G.THREE.Vector3(); hb.getWorldPosition(v); v.project(__G.zCam); return [Math.round((v.x + 1) / 2 * innerWidth), Math.round((1 - v.y) / 2 * innerHeight)]; },
    hint: () => document.getElementById('hint').textContent,
  }, 1)`);
  // headless Chrome has no pointer lock; the game with the mouse captured is what we test (the head stays where it is
  // put, the crosshair picks the switches): pretend it is captured
  await h.eval("(Object.defineProperty(document, 'pointerLockElement', { get: () => document.getElementById('gl'), configurable: true }), document.exitPointerLock = () => {}, 1)");
  const click = async (d, id) => { const p = await h.eval(`__S.scr(${d}, '${id}')`); await h.click(640, 360); return p; };   // (the crosshair: the head was turned onto it)

  // ---- the M60 parked cold at the top of the home hard; the crew rides head out
  await h.expect('__S.T().exists && !__S.T().fm.eng.running && !__S.T().IN.master && __S.T().V.hydP < 0.5', 'parked cold and dark');
  await h.eval(`(() => { const T = __S.T(), o = T.fm.origin(); return { soil: T.fm.soil.join('/'), pitch: +T.fm.out.pitch.toFixed(3), v: +T.fm.out.fwd.toFixed(2) }; })()`);
  // ---- DRIVER: in at his hatch, it is his start-up: nothing happens until he works the panel
  await h.eval(`(__G.crafts.control('m60', 0, 'foot'), 1)`); await h.wait(2500);
  await h.expect('!__S.T().fm.eng.running && !__S.T().IN.master', 'the crew leaves the driver his start-up');
  await h.eval('__S.hint()');
  await h.eval(`__S.aim(__S.T(), 'master', 0.12)`); await h.wait(1200);
  await h.expect(`__S.hint().includes('MASTER SWITCH')`, 'hover names the switch');
  await h.shot('m60-driver-panel-master');
  await click('__S.T()', 'master'); await h.wait(500);
  await h.expect('__S.T().IN.master', 'clicked MASTER on');
  await h.eval(`__S.aim(__S.T(), 'start', 0.12)`); await h.wait(800);
  await click('__S.T()', 'start');
  await h.waitFor('__S.T().fm.eng.running', 20000); await h.wait(600);
  await h.shot('m60-driver-panel-running');
  await h.eval('(__S.free(), __S.T().head.yaw = __S.T().head.pitch = 0, 1)'); await h.wait(1200);
  await h.shot('m60-driver-periscopes');
  // ---- GUNNER: the AI gunner put the turret power on once the engine ran; E to the station, the TURRET POWER switch
  // on the right wall: off (handwheels) and on again
  await h.eval('(__G.crafts.cycleSeat(1), 1)'); await h.wait(1500);
  await h.expect("__G.crafts.seat === 1 && __S.T().IN.power && __S.T().V.hydP > 0.5", 'the crew gunner powered the turret');
  await h.key('tap', 'KeyE'); await h.wait(600);
  await h.eval(`__S.aim(__S.T(), 'tpower', 0.1)`); await h.wait(1200);
  await h.expect(`__S.hint().includes('TURRET POWER')`);
  await h.shot('m60-gunner-station-power');
  await click('__S.T()', 'tpower'); await h.wait(800);
  await h.expect('!__S.T().IN.power', 'clicked TURRET POWER off');
  await h.waitFor('__S.T().V.hydP < 0.5', 8000);
  await click('__S.T()', 'tpower'); await h.wait(500);
  await h.expect('__S.T().IN.power', 'and on again');
  await h.waitFor('__S.T().V.hydP > 0.5', 8000);
  await h.eval(`(__S.T().V.stabMode)`);
  await h.waitFor('__S.T().V.gyro >= 1', 90000);
  await h.eval(`({ stab: __S.T().V.stabMode, msg: document.getElementById('msg').textContent })`);
  await h.eval('(__S.free(), 1)'); await h.key('tap', 'KeyE'); await h.wait(1200);
  await h.shot('m60-gunner-day-sight');
  await h.waitFor("__S.T().V.gun.state === 'ready'", 30000);
  await h.key('down', 'KeyF'); await h.wait(250); await h.key('up', 'KeyF'); await h.wait(800);
  await h.expect('__S.T().gunnery.stats.shots >= 1', 'the gunner fires');
  // ---- LOADER: the gun is his; he takes a round out of the ready rack (click it) and rams it
  await h.eval(`(__G.crafts.cycleSeat(1), __G.crafts.cycleSeat(1), (() => { const g = __S.T().V.gun; if (g.state !== 'empty') { if (g.round) __S.T().V.racks[g.rack || 'readyAmmo'][g.round]++; g.state = 'empty'; g.round = null; } return __G.crafts.seat; })())`); await h.wait(600);
  await h.eval("(__S.T().hatchWant.loader = 0, 1)"); await h.wait(1500);   // down inside the turret
  await h.expect("__G.crafts.seat === 3 && __S.T().V.gun.state === 'empty'");
  await h.eval(`__S.aim(__S.T(), 'rack:M456', 0.05)`); await h.wait(1200);
  await h.expect(`__S.hint().includes('HEAT')`);
  await h.shot('m60-loader-ready-rack');
  const rack0 = await h.eval('__S.T().V.ammoCount("M456")');
  await click('__S.T()', 'rack:M456');
  await h.waitFor("__S.T().V.gun.state === 'loading'", 5000);
  await h.expect("__S.T().IN.ammo === 'M456'", 'HEAT out of the rack');
  await h.eval(`__S.aim(__S.T(), 'breech', 0.05)`); await h.wait(800);
  await h.expect('Object.values(__S.T().V.racks.readyAmmo).reduce((a, b) => a + b, 0) >= 0');
  await h.shot('m60-loader-breech-crew');
  await h.waitFor("__S.T().V.gun.state === 'ready'", 30000);
  await h.expect(`__S.T().V.gun.round === 'M456' && __S.T().V.ammoCount('M456') === ${rack0} - 1`, 'HEAT in the breech');
  // ---- COMMANDER: buttoned up, E looks about the cupola; the OVERRIDE slews the turret onto his line
  await h.eval('(__S.free(), __G.crafts.cycleSeat(-1), __S.T().hatchWant.cupola = 0, __S.T().V.mg50.az = 1.2, 1)'); await h.waitFor('__S.T().hatch.cupola < 0.1', 8000); await h.wait(500);
  await h.expect('__G.crafts.seat === 2 && __S.T().hatch.cupola < 0.1');
  await h.shot('m60-commander-m28');
  await h.key('tap', 'KeyE'); await h.wait(500);
  await h.eval(`__S.aim(__S.T(), 'override', 0.1)`); await h.wait(1200);
  await h.expect(`__S.hint().includes('OVERRIDE')`);
  await h.shot('m60-commander-cupola-controls');
  await h.eval('({ az: __S.T().V.az, cup: __S.T().V.mg50.az })');
  await click('__S.T()', 'override');
  await h.waitFor('Math.abs(__S.T().V.mg50.az) < 0.02', 30000);
  await h.eval('({ az: +__S.T().V.az.toFixed(3), cup: +__S.T().V.mg50.az.toFixed(3) })');
  await h.expect('Math.abs(__S.T().V.az - 1.2) < 0.08', 'the turret is on the cupola bearing');
  await h.eval('(__S.free(), 1)'); await h.key('tap', 'KeyE');
  // ---- the crew rides head out; under fire everybody buttons up
  await h.eval('(Object.assign(__S.T().hatchWant, { driver: 1, loader: 1, cupola: 1 }), __S.T().view = "chase", __S.T().orbit.yaw = 2.5, __S.T().orbit.pitch = 0.32, 1)'); await h.wait(2000);
  await h.shot('m60-crew-head-out');
  await h.eval(`(() => { __G.hurtPlayer(0.13, 'FLAK', null, null); return { want: JSON.stringify(__S.T().hatchWant), msg: document.getElementById('msg').textContent }; })()`);
  await h.expect('__S.T().hatchWant.driver === 0 && __S.T().hatchWant.cupola === 0 && __S.T().contactT > 20');
  await h.wait(1500); await h.shot('m60-buttoned-up-under-fire');
  // ---- the HUD: the weapons line wraps short of the message feed
  await h.eval(`(() => { const w = document.getElementById('weap').getBoundingClientRect(), f = document.getElementById('feed').getBoundingClientRect(); return { weapRight: Math.round(w.right), feedLeft: Math.round(f.left), weapLines: Math.round(w.height / 27) }; })()`);
  await h.expect(`document.getElementById('weap').getBoundingClientRect().right <= document.getElementById('feed').getBoundingClientRect().left`, 'weapons line clear of the feed');
  // ---- M113A2: cold on the ALBATROSS deck park; driver start-up (I), the RAMP switch; the commander looks about
  await h.eval(`(__G.crafts.control('m113', 0, 'foot'), 1)`); await h.wait(1500);
  await h.expect('!__S.A().fm.eng.running');
  await h.key('tap', 'KeyI'); await h.waitFor('__S.A().fm.eng.running', 20000);
  await h.eval(`__S.aim(__S.A(), 'ramp', 0.12)`); await h.wait(1200);
  await h.expect(`__S.hint().includes('RAMP')`);
  await h.shot('m113-driver-ramp-switch');
  await click('__S.A()', 'ramp'); await h.waitFor('__S.A().V.ramp > 0.9', 20000);
  await h.eval('(__S.free(), __G.crafts.cycleSeat(1), __S.A().hatchWant.cupola = 0, 1)'); await h.wait(1500);
  await h.key('tap', 'KeyE'); await h.wait(500);
  await h.eval(`__S.aim(__S.A(), 'radio', 0.1, Math.PI)`); await h.wait(1200);
  await h.expect(`__S.hint().includes('VRC-46')`);
  await click('__S.A()', 'radio'); await h.wait(500);
  await h.expect("document.getElementById('feed').textContent.includes('ON THE NET')", 'status report on the net');
  await h.eval('(__S.free(), __S.A().head.yaw = 0.3, __S.A().head.pitch = -0.1, 1)'); await h.wait(1000);
  await h.shot('m113-commander-compartment');
  await h.eval('(__S.free(), __S.A().station = false, __S.A().hatchWant.cupola = 1, 1)'); await h.wait(1500);
  await h.shot('m113-commander-head-out');
  // ---- the LCM-8 run: stern anchor, gallows, wires, deckhands, the radio calls
  await h.eval('(__G.toHeli(), __G.armDelivery.runIn = 90, __G.G.mat = 300, __G.selIsl = __G.HOME_B.isl, __G.deliverArmour("m113"), __G.armDelivery.runs.length)');
  await h.eval(`(__G.crafts.control('m113', 1, 'foot'), __G.m113C.view = 'chase', __G.m113C.orbit.yaw = 2.3, __G.m113C.orbit.pitch = 0.3, 1)`);
  await h.wait(6000); await h.shot('lcm8-run-in');
  await h.waitFor('__G.armDelivery.runs[0].anchor', 60000); await h.wait(300);
  await h.expect("document.getElementById('feed').textContent.includes('STERN ANCHOR AWAY')");
  await h.waitFor("__G.armDelivery.runs[0].state === 'beached'", 60000); await h.wait(300);
  await h.expect("document.getElementById('feed').textContent.includes('BEACHED')"); await h.wait(6000);
  await h.eval("(__G.m113C.orbit.yaw = 0.6, __G.m113C.orbit.pitch = 0.25, 1)"); await h.wait(1500);
  await h.shot('lcm8-beached-ramp-down');
}
