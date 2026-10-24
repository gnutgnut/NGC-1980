// UH-1H on the HOTAS 4 + T-Rudder defaults (no bindings saved): a fake T.Flight Hotas 4 (12 buttons, rocker axis 6, hat
// axis 9) and T-Rudder (X Y Z) replace navigator.getGamepads. Cold on the deck: button 11 held = the starter (the
// trigger under the real collective grip) cranks to light-off; 6 = stability assist, 7 = force trim, 8 = landing light,
// 9 = cockpit / outside view (numbered from 1; __press() takes the 0-based index); throttle lever = collective, rudder pedals = anti-torque; then the J panel with both
// aircraft's meanings of every button.
//   CHROME_PATH=... node snap.mjs scenes/hueyhotas.mjs
export default async function (h) {
  await h.goto('?debug&peace&cold&cockpit&res=0.45');
  await h.waitFor('window.__G', 10000);
  await h.eval(`(() => { try { localStorage.removeItem('tz_controls_v1'); } catch (e) {}
    const btn = n => Array.from({ length: n }, () => ({ pressed: false, value: 0 }));
    window.__hotas = { id: 'T.Flight Hotas 4 (Vendor: 044f Product: b67c)', index: 0, connected: true, mapping: '', axes: [0, 0, 1, 0, 0, 0, 0, 0, 0, 3.2857], buttons: btn(12) };
    window.__ped = { id: 'T-Rudder (Vendor: 044f Product: b679)', index: 1, connected: true, mapping: '', axes: [-1, -1, 0], buttons: [] };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [__hotas, __ped] });
    window.__press = (i, on) => { __hotas.buttons[i] = { pressed: on, value: on ? 1 : 0 }; return 1; };
    return 1; })()`);
  await h.key('tap', 'Enter'); await h.waitFor("__G.G.state==='play'", 10000); await h.wait(1200);
  await h.eval('({ src: __G.CTL.state.source, pedals: __G.CTL.state.hasPedals, devs: __G.CTL.state.devices.map(d => d.short + ":" + d.role) })');
  await h.expect('__G.CTL.state.source !== "NONE" && __G.CTL.state.hasPedals', 'HOTAS 4 + T-Rudder recognised');
  await h.expect('!__G.H.run && __G.H.rpm < 0.01', 'cold and dark');
  // the -10 start with the HOTAS: battery + main fuel (cockpit switches), throttle to idle (PgUp), starter = button 10 held
  await h.eval("(__G.SY.toggle('bat'), __G.D.engineSwitch = true, __G.SY.grip = 0.06, 1)");
  await h.eval('__press(10, true)');
  await h.waitFor('__G.H.starter', 5000);
  await h.waitFor('__G.H.run', 150000);   // sim time runs slow at headless frame rates (dt capped at 0.1 s)
  await h.eval('({ n1: +__G.H.n1.toFixed(2), egt: +__G.H.egt.toFixed(0), grip: __G.SY.grip, volts: __G.SY.volts })');
  await h.shot('starter-button-light-off');
  await h.waitFor('__G.H.n1 > 0.41', 150000);
  await h.eval('__press(10, false)'); await h.waitFor('!__G.H.starter', 30000);
  await h.expect('!__G.H.starter', 'starter released with the button');
  // a press is held until the game has seen it (waits on game frames, not wall time: 1 fps under load), then released
  const tap = async (i, act, cond, label) => { await h.eval(`__press(${i}, true)`); await h.waitFor(cond, 30000); await h.expect(cond, label);
    await h.eval(`__press(${i}, false)`); await h.waitFor(`!__G.CTL.state.actions.${act}`, 30000); await h.wait(300); };
  await h.eval("(window.__s0 = { sas: __G.HI.sas, trim: __G.SY.trim, light: __G.G.light, ck: __G.cockpitCam }, 1)");
  await tap(5, "gear", "__G.HI.sas !== __s0.sas", "button 6: stability assist");
  await tap(6, "flaps", "__G.SY.trim !== __s0.trim", "button 7: force trim");
  await tap(7, "hook", "__G.G.light !== __s0.light", "button 8: landing light");
  await tap(8, "view", "__G.cockpitCam !== __s0.ck", "button 9: view");
  await h.shot("outside-view");
  await tap(8, "view", "__G.cockpitCam === __s0.ck", "button 9: back");
  // collective on the throttle lever, pedals on the T-Rudder (read straight through heli.js)
  await h.eval('(__hotas.axes[2] = 0.2, __ped.axes[2] = 0.5, 1)'); await h.waitFor('Math.abs(__G.Z.ctl.coll - 0.4) < 0.05 && __G.Z.ctl.raw.pedal > 0.4', 30000);
  await h.eval('({ coll: +__G.Z.ctl.coll.toFixed(2), pedal: +(__G.Z.ctl.raw ? __G.Z.ctl.raw.pedal : __G.Z.ctl.pedal).toFixed(2), src: __G.Z.ctl.source })');
  await h.expect('Math.abs(__G.Z.ctl.coll - 0.4) < 0.05 && __G.Z.ctl.raw.pedal > 0.4', 'throttle lever = collective, pedals = anti-torque');
  await h.eval('(__hotas.axes[2] = 1, __ped.axes[2] = 0, 1)'); await h.wait(400);
  // the controls panel: every button's jet and Huey meaning
  await h.key('tap', 'KeyJ'); await h.wait(600);
  await h.expect('__G.CTL.isOpen');
  await h.eval('(() => { const b = __G.CTL.bindings.buttons; return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v && v.btn])); })()');
  await h.expect('__G.CTL.bindings.buttons.wheelbrake.btn === 10 && __G.CTL.bindings.buttons.gear.btn === 5 && __G.CTL.bindings.axes.rudder.axis === 2', 'HOTAS 4 + T-Rudder defaults');
  await h.shot('controls-panel');
  await h.key('tap', 'Escape'); await h.wait(300);
}
