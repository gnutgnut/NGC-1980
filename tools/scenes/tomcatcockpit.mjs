// TOMCAT cockpit (units/air/tomcatcockpit.js, the start / electrics in tomcatsys.js): a cold F-14A on the ALBATROSS
// deck started on the switches through the real mouse path (hover frame + hint line, then a click): ENG CRANK R, the
// right throttle OFF -> IDLE at 20%, light-off, the crank switch dropping out at 50%, the generator on line, then the
// left engine; the caution panel going dark as the systems come up, MASTER CAUTION reset; STAB AUG channels, a
// generator off, FUEL DUMP, the emergency wing sweep handle; a wet start (throttle IDLE before the crank) and its hot
// start; the one-key auto start (I); the RIO over the pilot's shoulder; a sheet of the cockpit's canvases.
// (The close-ups on the preview page are tomcatpanels.mjs; flying it is tomcat.mjs.)
//   CHROME_PATH=... node snap.mjs scenes/tomcatcockpit.mjs
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.6');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 20000); await h.wait(1200);
  await h.key('tap', 'Digit8'); await h.wait(600);
  await h.expect('__G.G.craft === "tomcat" && __G.tomcatC.TP.A.cat && __G.tomcatC.TP.A.cat.state === "hold"');
  await h.eval('(window.T = __G.tomcatC.TP, window.A = T.A, window.C = T.cockpit, __G.cockpitCam = true, 1)');
  await h.expect('T.ss.bus && T.ss.gens.every(Boolean) && !T.ss.thrOff.some(Boolean)', 'on the cat: hot, both generators on line');
  // ---- climb out (Y) and back in (Y at the ladder): the crew leaves it cold
  await h.key('tap', 'KeyY'); await h.wait(900);
  await h.expect('__G.G.craft === "foot" && __G.tomcatC.park.on');
  await h.key('tap', 'KeyY'); await h.wait(600);
  await h.expect('__G.G.craft === "tomcat" && T.ss.thrOff.every(Boolean) && !A.eng.some(e => e.run)', 'back in: throttles OFF, engines stopped');
  await h.eval('(__G.cockpitCam = true, 1)');
  await h.waitFor('A.eng.every(e => e.n < 0.1)', 90000);
  await h.wait(800);
  await h.eval('({ n: A.eng.map(e => +e.n.toFixed(2)), ext: T.ss.ext, bus: T.ss.bus, gens: T.ss.gens, cautions: T.cautions, mc: T.masterCaution, hint: T.hint() })');
  await h.expect('T.ss.ext && T.ss.bus && !T.ss.gens[0] && !T.ss.gens[1]', 'deck power, no generators');
  await h.expect("['L GEN', 'R GEN', 'L OIL PRESS', 'R OIL PRESS', 'L FUEL PRESS', 'R FUEL PRESS', 'HYD PRESS'].every(c => T.cautions.includes(c))", 'cold jet: the start cautions lit');
  await h.expect("T.hint().includes('ENG CRANK R')", 'the hint line says what to do first');
  // hold the head where we want it (the game eases it back to centre while the mouse is not captured)
  await h.eval('(window.__hy = null, window.__hyI = setInterval(() => { if (__hy) { __G.head.yaw = __hy[0]; __G.head.pitch = __hy[1]; } }, 5), 1)');
  // aim the head at a control (yaw / pitch from the eye to its hit box, in the airframe), then the cursor onto it
  await h.eval(`(window.__box = id => C.hitBoxes.find(o => o.userData.sw === id), window.__aim = (id, dy = 0, dp = 0) => { const b = __box(id), p = new __G.THREE.Vector3(); b.getWorldPosition(p); const e = A.worldPoint([0, 1.04, -5.45]), d = p.sub(e).applyQuaternion(A.q.clone().invert()).normalize(); __hy = [Math.atan2(-d.x, -d.z) + dy, Math.max(-1.1, Math.min(0.8, Math.asin(d.y) + 0.14 + dp))]; __G.head.yaw = __hy[0]; __G.head.pitch = __hy[1]; return __hy.map(v => +v.toFixed(2)); },
    window.__at = id => { const b = __box(id), p = new __G.THREE.Vector3(); b.getWorldPosition(p); p.project(__G.zCam); dispatchEvent(new MouseEvent('mousemove', { clientX: (p.x + 1) / 2 * innerWidth, clientY: (1 - p.y) / 2 * innerHeight })); return Math.abs(p.x) < 1 && Math.abs(p.y) < 1; },
    window.__press = () => { dispatchEvent(new MouseEvent('mousedown', { button: 0 })); dispatchEvent(new MouseEvent('mouseup', { button: 0 })); return 1; }, 1)`);
  const hint = "document.getElementById('hint').textContent";
  const click = async (id, placard, shot) => {
    await h.eval(`__aim('${id}')`); await h.wait(350);
    await h.waitFor(`__at('${id}') && ${hint}.startsWith(${JSON.stringify(placard)})`, 6000);
    if (shot) await h.shot(shot);
    await h.eval(`(__at('${id}'), __press())`); await h.wait(700);   // (a frame or two at headless rates)
  };
  // ---- the caution panel and the cold cockpit
  await h.eval("__aim('crankR', 0.1, 0.12)"); await h.wait(700); await h.shot('cold-right-console-cautions');
  await h.eval('(__hy = [0, -0.35], 1)'); await h.wait(600); await h.shot('cold-panel');
  // ---- right engine: ENG CRANK R (hover frame and the hint line first)
  await click('crankR', 'ENG CRANK  R', 'hover-eng-crank-r');
  await h.expect("T.ss.crank === 'R' && T.ss.cranking[1] === 'CART'", 'ENG CRANK R on the cart');
  await h.eval(`({ hint: ${hint}, say: document.getElementById('msg')?.textContent })`);
  await h.waitFor('A.eng[1].n >= 0.2', 60000);
  await h.expect('!A.eng[1].run && T.cautions.includes("START VALVE")', 'motoring at 20%: no light-off without fuel; START VALVE advisory');
  await h.eval("__aim('thrR', 0, 0.05)"); await h.wait(500); await h.shot('cranking-r-20pct-throttle');
  await click('thrR', 'RIGHT THROTTLE  OFF / IDLE', 'hover-right-throttle');
  await h.expect('!T.ss.thrOff[1]', 'right throttle IDLE');
  await h.waitFor('A.eng[1].run', 20000);
  await h.eval('({ n: +A.eng[1].n.toFixed(2), egt: Math.round(A.eng[1].egt), wet: T.ss.wet[1], hint: T.hint() })');
  await h.eval('(__hy = [-0.55, -0.42], 1)'); await h.wait(500); await h.shot('right-engine-light-off-gauges');
  await h.waitFor("T.ss.crank === 'OFF' && A.eng[1].n > 0.5", 60000);
  await h.expect('A.eng[1].n >= 0.5', 'the crank switch dropped out at 50%');
  await h.waitFor('T.ss.gens[1]', 60000);
  await h.expect('!T.cautions.includes("R GEN") && T.cautions.includes("L GEN")', 'R GEN on line, L GEN still lit');
  // ---- left engine
  await click('crankL', 'ENG CRANK  L');
  await h.expect("T.ss.crank === 'L'");
  await h.waitFor('A.eng[0].n >= 0.21', 60000);
  await click('thrL', 'LEFT THROTTLE  OFF / IDLE');
  await h.waitFor('A.eng[0].run && T.ss.gens[0] && A.eng.every(e => e.n > 0.62)', 90000);
  await h.wait(500);
  await h.eval('({ n: A.eng.map(e => +e.n.toFixed(2)), crank: T.ss.crank, gens: T.ss.gens, cautions: T.cautions, mc: T.masterCaution, hp: [T.D.hp.engL, T.D.hp.engR] })');
  await h.expect("['L GEN', 'R GEN', 'L OIL PRESS', 'R OIL PRESS', 'L FUEL PRESS', 'R FUEL PRESS', 'HYD PRESS', 'START VALVE'].every(c => !T.cautions.includes(c))", 'both turning: the start cautions out');
  await h.expect('T.D.hp.engL === 1 && T.D.hp.engR === 1', 'a normal start: no hot start');
  await click('mc', 'MASTER CAUTION RESET', 'hover-master-caution');
  await h.expect('!T.masterCaution');
  // ---- AFCS: the three STAB AUG channels (one off = PITCH STAB caution, the sim on DIRECT)
  await click('sasP', 'STAB AUG  PITCH', 'hover-stab-aug-pitch');
  await h.wait(600);
  await h.expect('!T.sas && T.sasCh[0] === false && T.cautions.includes("PITCH STAB") && T.masterCaution', 'pitch channel off: caution + master caution');
  await click('sasP', 'STAB AUG  PITCH'); await h.wait(400);
  await h.expect('T.sas && !T.cautions.includes("PITCH STAB")');
  // ---- a generator off and back
  await click('genL', 'L GENERATOR', 'hover-l-gen');
  await h.wait(500); await h.expect('!T.ss.gens[0] && T.cautions.includes("L GEN")', 'L GEN off: caution');
  await click('genL', 'L GENERATOR'); await h.wait(500); await h.expect('T.ss.gens[0]');
  // ---- FUEL DUMP (inhibited on the deck: weight on wheels)
  const fuel0 = await h.eval('A.fuel');
  await click('dump', 'FUEL DUMP'); await h.wait(800);
  await h.expect(`T.dump && Math.abs(A.fuel - ${fuel0}) < 30`, 'dump switch ON, no flow on deck');
  await click('dump', 'FUEL DUMP'); await h.expect('!T.dump');
  // ---- emergency wing sweep handle: the guard up (EMER), the handle aft 10°, the sweep indicator follows; guard down
  await click('emer', 'EMERGENCY WING SWEEP', 'hover-emergency-sweep-guard');
  await h.expect("T.sweep.mode === 'EMER'");
  await click('emerAft', 'EMERGENCY WING SWEEP HANDLE  -  AFT'); await click('emerAft', 'EMERGENCY WING SWEEP HANDLE  -  AFT');
  await h.waitFor('A.sweep > 28', 20000);
  await h.eval('({ mode: T.sweep.mode, handle: T.sweep.handle, sweep: A.sweep })');
  await h.eval('(__hy = [0.62, -0.62], 1)'); await h.wait(600); await h.shot('emergency-sweep-handle-and-indicator');
  await click('emer', 'EMERGENCY WING SWEEP');
  await h.expect("T.sweep.mode === 'AUTO'");
  // ---- a wet start: right throttle OFF (shutdown), then IDLE before the crank: fuel too early, a hot start
  await click('thrR', 'RIGHT THROTTLE  OFF / IDLE');
  await h.waitFor('!A.eng[1].run', 5000);
  await h.expect('T.ss.thrOff[1] && !A.eng[1].run', 'right throttle OFF: shutdown');
  await h.waitFor('A.eng[1].n < 0.1', 60000);
  await click('thrR', 'RIGHT THROTTLE  OFF / IDLE');
  await click('crankR', 'ENG CRANK  R');
  await h.waitFor('T.ss.wet[1] || A.eng[1].n > 0.15', 5000);
  await h.expect('T.ss.wet[1]', 'wet start set up');
  await h.waitFor('A.eng[1].run', 40000); await h.wait(300);
  await h.eval('({ egt: Math.round(A.eng[1].egt), hp: +T.D.hp.engR.toFixed(2), msg: document.getElementById("msg")?.textContent })');
  await h.expect('T.D.hp.engR < 1 && A.eng[1].egt > 800', 'hot start: TIT over the red line, engine hurt');
  await h.eval('(__hy = [-0.55, -0.42], 1)'); await h.wait(300); await h.shot('hot-start-tit');
  await h.waitFor("T.ss.crank === 'OFF' && A.eng[1].n > 0.6", 60000);
  // ---- the one-key start: I shuts both down, I again starts both on the switches (right first)
  await h.eval('(__hy = null, 1)');
  await h.key('tap', 'KeyI'); await h.wait(300);
  await h.expect('T.ss.thrOff.every(Boolean)', 'I: both throttles OFF');
  await h.waitFor('A.eng.every(e => !e.run && e.n < 0.15)', 60000);
  await h.key('tap', 'KeyI'); await h.wait(300);
  await h.waitFor("!!T.ss.auto && T.ss.crank === 'R'", 5000);
  await h.expect("!!T.ss.auto && T.ss.crank === 'R' && !A.eng[0].run", 'auto start: crank R first');
  await h.eval('(__hy = [2.45, -0.15], 1)'); await h.wait(700); await h.shot('rio-over-the-left-shoulder');
  await h.eval('(__hy = [-2.45, -0.15], 1)'); await h.wait(700); await h.shot('rio-over-the-right-shoulder');
  await h.eval('(__hy = null, 1)');
  await h.waitFor('!T.ss.auto && A.eng.every(e => e.run) && T.ss.gens.every(Boolean)', 400000);
  await h.expect("T.ss.crank === 'OFF' && !T.ss.thrOff.some(Boolean)", 'auto start done: crank OFF, throttles IDLE');
  await h.eval('(__hy = [0.95, -0.7], 1)'); await h.wait(600); await h.shot('left-console');
  await h.eval('(__hy = [-0.95, -0.7], 1)'); await h.wait(600); await h.shot('right-console');
  await h.eval('(__hy = null, clearInterval(__hyI), 1)');
  // ---- back to the cat (8): MIL on both and the cat fires (what happens after the stroke is tomcat.mjs's business)
  await h.key('tap', 'Digit8'); await h.wait(600);
  await h.expect('A.cat && A.cat.state === "hold"');
  await h.waitFor('A.eng.every(e => e.run && e.n > 0.6)', 120000);
  await h.key('down', 'ShiftLeft'); await h.waitFor('T.thr > 0.81', 10000); await h.key('up', 'ShiftLeft');
  await h.waitFor('A.eng.every(e => e.n > 0.9) && (!A.cat || A.cat.state !== "hold")', 90000);
  await h.expect('A.eng.every(e => e.run && e.n > 0.9) && (!A.cat || A.cat.state !== "hold")', 'MIL on both after the cold start: the cat fires');
}
