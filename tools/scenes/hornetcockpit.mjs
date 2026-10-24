// HORNET (1980 F/A-18A FSD) cockpit and systems: the panel up close and a contact sheet of every display, the start
// procedure from cold (BATT, APU READY, ENG CRANK R then L, generators on line, the APU shutting itself down is not
// waited for), the crank refused without bleed air, the one-key start (I), the caution light panel, the left-DDI
// caution messages, the CHECKLIST page, and the period voice alerts (ALTITUDE, FUEL LOW; never "pull up").
//   CHROME_PATH=... node snap.mjs scenes/hornetcockpit.mjs
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.6');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 15000); await h.wait(800);
  await h.key('tap', 'Digit5'); await h.wait(500);
  await h.expect('__G.G.craft === "jet" && !!__G.JP.J.cat');
  await h.eval('(__G.cockpitCam = true, window.__hy = [0, 0], window.__hyI = setInterval(() => { __G.head.yaw = __hy[0]; __G.head.pitch = __hy[1]; }, 5), 1)');
  const look = async (yaw, pitch, fov = 70, ms = 700) => { await h.eval(`(__hy = [${yaw}, ${pitch}], __G.setCkFov(${fov}), 1)`); await h.wait(ms); };
  await look(0, -0.02, 70, 1500); await h.shot('hud-on-cat');
  await look(0, -0.55, 55); await h.shot('panel');
  await look(-0.32, -0.42, 30); await h.shot('left-ddi-adv');
  await look(0.0, -0.36, 30); await h.shot('ufc');
  await look(0.36, -0.42, 30); await h.shot('right-rwr-cautions');
  await look(0, -0.78, 32); await h.shot('hi-efd-stby');
  await look(1.15, -0.95, 45); await h.shot('left-console');
  await look(-1.15, -0.95, 45); await h.shot('right-console-start-panel');
  // contact sheet of every display canvas as drawn now
  const sheet = async name => { await h.eval(`(() => { const d = document.createElement('canvas'); d.id = '__sheet'; d.width = 1280; d.height = 720; Object.assign(d.style, { position: 'fixed', left: 0, top: 0, zIndex: 99, background: '#333' }); const c = d.getContext('2d'); c.fillStyle = '#333'; c.fillRect(0, 0, 1280, 720);
    const cs = __G.JP.cockpit.canvases(); let x = 0, y = 0; for (const cv of cs.slice(0, -1)) { const s = 236, w = s, hh = s * cv.height / cv.width; if (x + w > 1280) { x = 0; y += 240; } c.drawImage(cv, x, y, w, hh); x += w + 4; }
    const hud = cs[cs.length - 1]; c.fillStyle = '#000'; c.fillRect(960, 480, 320, 240); c.drawImage(hud, 960, 480, 320, 288 * 240 / 288); document.body.appendChild(d); return 1; })()`); await h.wait(100); await h.shot(name); await h.eval("(document.getElementById('__sheet').remove(), 1)"); };
  await sheet('sheet-hot');
  // cold and dark: shut both down, battery off -> no HUD, no displays
  await h.eval('(__G.JP.cmd("engines"), 1)');
  await h.waitFor('__G.JP.J.eng.every(e => !e.run && e.n < 0.3)', 60000);
  await h.eval('(__G.JP.cmd("batt"), 1)'); await h.wait(500);
  await h.expect('!__G.JP.batt && __G.JP.cautLights.length === 0 && __G.JP.cautions.length === 0', 'cold and dark: no power, no cautions');
  await look(0, -0.5, 60); await h.shot('cold-dark');
  // BATT on: L GEN / R GEN / BATT SW on the caution lights, the crank is refused without bleed air
  await h.eval('(__G.JP.click("batt"), 1)'); await h.wait(600);
  await h.eval('({ lights: __G.JP.cautLights, ddi: __G.JP.cautions })');
  await h.expect('["L GEN", "R GEN", "BATT SW"].every(c => __G.JP.cautLights.includes(c))', 'battery only: L GEN, R GEN, BATT SW');
  await h.eval('(__G.JP.click("engR"), 1)'); await h.wait(300);
  await h.expect('__G.JP.crank === -1 && !(__G.JP.J.eng[1].start > 0)', 'no crank without the APU');
  await look(0.36, -0.42, 30); await h.shot('battery-only-cautions');
  // APU ON -> READY -> ENG CRANK R -> light-off -> ENG CRANK L
  await h.eval('(__G.JP.click("apu"), 1)');
  await h.waitFor('__G.JP.apu === "READY"', 40000);
  await h.expect('__G.JP.cockpit.lamps().apuReady', 'APU READY light');
  await look(-1.15, -0.95, 40); await h.shot('apu-ready');
  await h.eval('(__G.JP.click("engR"), 1)'); await h.wait(300);
  await h.expect('__G.JP.crank === 1 && __G.JP.J.eng[1].start > 0', 'cranking the right engine');
  await h.shot('crank-right');
  await h.waitFor('__G.JP.J.eng[1].run && __G.JP.J.eng[1].n > 0.62', 60000);
  await h.expect('!__G.JP.cautLights.includes("R GEN") && __G.JP.cautLights.includes("L GEN")', 'right generator on line');
  await h.eval('(__G.JP.click("engL"), 1)');
  await h.waitFor('__G.JP.J.eng[0].run && __G.JP.J.eng[0].n > 0.62', 60000);
  await h.wait(500);
  await h.expect('__G.JP.cautLights.length === 0 && __G.JP.crank === -1', 'both generators on line, crank switch back to OFF');
  await look(0, -0.02, 70, 1200); await h.shot('hud-after-start');
  // the one-key start: I shuts down, I starts the whole sequence
  await h.key('tap', 'KeyI'); await h.waitFor('__G.JP.J.eng.every(e => !e.run)', 10000);
  await h.wait(1500); await h.key('tap', 'KeyI');
  await h.waitFor('__G.JP.J.eng.every(e => e.run && e.n > 0.62) && !__G.JP.autoStart', 120000);
  await h.eval('({ apu: __G.JP.apu, n: __G.JP.J.eng.map(e => +e.n.toFixed(2)) })');
  // checklist page on the left DDI; fuel low on the caution lights and the left DDI
  await h.eval('(__G.JP.click("ddiL:CHK"), __G.JP.J.fuel = 300 / 2.2046, 1)'); await h.wait(1500);
  await h.expect('__G.JP.cautLights.includes("FUEL LO") && __G.JP.cautions.includes("BINGO")', 'FUEL LO light, BINGO caution');
  await look(-0.32, -0.42, 30); await h.shot('chk-page-fuel-caution');
  await sheet('sheet-fuel-low');
  // airborne, low and sinking over the sea: ALTITUDE, FUEL LOW; never a GPWS-era call
  await h.eval(`(() => { const J = __G.JP.J; J.cat = null; J.reset(-900, 0, 300, 0, { running: true, airborne: true, alt: 120, speed: 90 }); for (const e of J.eng) e.n = 0.9; __G.JP.voices.clear();
    __G.JP.autopilot = (J) => ({ pitch: -0.25, roll: -J.attitude().roll * 2, yaw: 0, throttle: [0.6, 0.6], brakeL: 0, brakeR: 0 }); return 1; })()`);
  await h.waitFor('__G.JP.voices.has("Altitude, altitude")', 20000);
  await h.eval('(__G.JP.autopilot = (J) => ({ pitch: 0.6, roll: -J.attitude().roll * 2, yaw: 0, throttle: [1, 1], brakeL: 0, brakeR: 0 }), 1)');
  await h.wait(1500);
  await h.eval('[...__G.JP.voices]');
  await h.expect('__G.JP.voices.has("Fuel low, fuel low") && !__G.JP.voices.has("Pull up, pull up") && !__G.JP.voices.has("Terrain, terrain")', 'period voice alerts only');
  await look(0, -0.02, 70, 500); await h.shot('hud-low-pull');
  await h.eval('(clearInterval(__hyI), __G.setCkFov(70), __G.JP.autopilot = null, 1)');
}
