// Hercules flight test page (dev/c130.html): flight deck and exterior screenshots, the autopilot holding height, an
// engine shut down and feathered from the condition lever (clicked with the real mouse on the projected switch), the
// drop-run autopilot, take-off from the runway.   node snap.mjs scenes/c130.mjs
export default async function (h) {
  await h.goto('dev/c130.html?start=air&view=deck&res=0.6');
  await h.waitFor('window.__C && __C.S.tas > 10', 10000);
  await h.wait(2500);
  await h.shot('deck_forward');
  await h.eval(`(__C.head.yaw = 0.25, __C.head.pitch = -0.42, 1)`); await h.wait(600); await h.shot('deck_panel');
  await h.eval(`(__C.head.yaw = 0.0, __C.head.pitch = -0.75, 1)`); await h.wait(600); await h.shot('deck_pedestal');
  await h.eval(`(__C.head.yaw = 0.95, __C.head.pitch = -0.35, 1)`); await h.wait(600); await h.shot('deck_left_console');
  await h.eval(`(__C.head.yaw = 1.45, __C.head.pitch = -0.05, 1)`); await h.wait(600); await h.shot('deck_left_window_engines');
  await h.eval(`(__C.head.yaw = 0.0, __C.head.pitch = 0.8, 1)`); await h.wait(600); await h.shot('deck_overhead');
  await h.eval(`(__C.head.yaw = -1.3, __C.head.pitch = -0.1, 1)`); await h.wait(600); await h.shot('deck_copilot');
  await h.eval(`(__C.head.yaw = 2.3, __C.head.pitch = -0.3, 1)`); await h.wait(900); await h.shot('deck_navigator');
  // autopilot holds height and speed
  await h.eval(`(__C.head.yaw = 0, __C.head.pitch = 0, __C.ap = true, window.__y0 = __C.S.pos.y, window.__k0 = __C.S.kias, 1)`);
  await h.wait(15000);
  await h.eval(`({ y: __C.S.pos.y, y0: __y0, kias: __C.S.kias, k0: __k0, bank: __C.S.bank })`);
  await h.expect(`Math.abs(__C.S.pos.y - __y0) < 20 && Math.abs(__C.S.kias - __k0) < 12 && Math.abs(__C.S.bank) < 0.1`);   // engaged in a 2,000 fpm climb: the speed settles over ~20 s
  // click condition lever 1 with the mouse: look at it, project its hit box to the screen, real mousemove + mousedown
  await h.eval(`(__C.head.yaw = -0.35, __C.head.pitch = 0.8, 1)`); await h.wait(500);
  const p = await h.eval(`(() => { const C = __C, hb = C.deck.hitBoxes.find(o => o.userData.sw === 'cond0'); C.model.group.updateMatrixWorld(true); const v = new C.THREE.Vector3(); hb.getWorldPosition(v); v.project(C.camera); return { x: Math.round((v.x + 1) / 2 * innerWidth), y: Math.round((1 - v.y) / 2 * innerHeight) }; })()`);
  await h.page.mouse.move(p.x, p.y); await h.wait(400);
  await h.eval(`__C.hover`);
  await h.shot('deck_hover_condition_lever');
  await h.expect(`__C.hover === 'cond0'`);
  await h.click(p.x, p.y); await h.wait(300);
  await h.expect(`__C.S.eng[0].cond === 'feather'`);
  // the sound (no audio device headless, but the graph runs): the clicks started it; props 2-4 beat near 68 Hz
  await h.wait(800); await h.eval('__C.snd.state()');
  await h.expect('__C.snd.state() && __C.snd.state().freq.slice(1).every(f => f > 62 && f < 74)');
  await h.wait(6000);
  await h.eval(`({ beta: __C.S.eng[0].beta, N: __C.S.eng[0].N, rud: __C.S.surf.rud, hdg: __C.S.heading, y: __C.S.pos.y })`);
  await h.expect(`__C.S.eng[0].beta > 90 && __C.S.eng[0].N < 0.05 && Math.abs(__C.S.pos.y - __y0) < 30`);
  await h.eval(`(__C.view = 'orbit', 1)`); await h.wait(500);
  await h.eval(`(() => { const o = { yaw: 2.2, pitch: 0.15, dist: 34 }; return 1 })()`);
  await h.shot('feathered_number1');
  await h.eval(`(__C.view = 'chase', 1)`); await h.wait(2500); await h.shot('chase_three_engines');
  // the drop-run autopilot: flaps 50, 130 KIAS, doors open, red then green light over the DZ
  await h.goto('dev/c130.html?start=drop&view=chase&res=0.6');
  await h.waitFor('window.__C && __C.S.tas > 10', 10000);
  await h.waitFor('__C.jumpSwitch === "red"', 90000);
  await h.eval(`({ kias: __C.S.kias, flap: __C.S.flap, door: __C.S.door, alt: __C.S.pos.y })`);
  await h.shot('drop_run_red');
  await h.expect(`Math.abs(__C.S.kias - 130) < 10 && __C.S.flap > 0.45 && __C.S.door[0] > 0.9`);
  await h.eval(`(__C.view = 'deck', __C.head.yaw = -0.5, __C.head.pitch = -0.25, 1)`); await h.wait(1500); await h.shot('drop_run_deck');
  await h.waitFor('__C.jumpSwitch === "green"', 60000);
  await h.eval(`(__C.view = 'orbit', 1)`); await h.wait(300); await h.shot('drop_green');
  // take-off: power up on the runway, rotate at 115 KIAS
  await h.goto('dev/c130.html?start=runway&view=chase&res=0.6');
  await h.waitFor('window.__C', 10000);
  await h.wait(1500);
  await h.eval(`(() => { const C = __C; C.paused = true; C.S.fuel = 9000; C.S.payload = 2000; window.__to = setInterval(() => { const S = C.S; C.ctl.lever.fill(90); if (S.kias > 112) C.ctl.pitch = Math.max(-0.5, Math.min(1, (0.13 - S.pitch) * 6)); }, 16); C.paused = false; return 1; })()`);
  await h.eval(`(document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB' })), window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB' })), 1)`);
  await h.waitFor('!__C.S.onGround && __C.S.pos.y > 20', 60000);
  await h.eval(`({ kias: __C.S.kias, alt: __C.S.pos.y, dead: __C.S.dead })`);
  await h.shot('takeoff');
  // cold and dark: the flight engineer runs the start checklist - battery, GTC, bleed air, engines 3-4-2-1
  await h.goto('dev/c130.html?start=cold&view=deck&res=0.6');
  await h.waitFor('window.__C', 10000);
  await h.expect('__C.S.eng.every(e => !e.run) && !__C.S.battery');
  await h.eval('(__C.crewStart = true, __C.head.yaw = 0.95, __C.head.pitch = -0.15, 1)');
  await h.waitFor('__C.S.eng[2].start > 0', 60000);
  await h.wait(1500); await h.shot('cold_start_checklist_no3');
  await h.eval('(__C.head.yaw = -0.3, __C.head.pitch = 0.8, 1)'); await h.wait(1500); await h.shot('cold_start_overhead');
  await h.waitFor('__C.S.eng.every(e => e.run && e.N > 0.94)', 180000);
  await h.eval('({ N: __C.S.eng.map(e => +e.N.toFixed(2)), peak: __C.S.eng.map(e => Math.round(e.peakTit || 0)), gtc: __C.S.gtc.N })');
  await h.expect('__C.S.eng.every(e => (e.peakTit || 0) < 830)');
  await h.eval('(__C.head.yaw = 0.2, __C.head.pitch = -0.4, 1)'); await h.wait(1500); await h.shot('cold_start_engines_running');
}
