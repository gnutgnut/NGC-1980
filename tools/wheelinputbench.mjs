#!/usr/bin/env node
// wheelinputbench.mjs - the racing-wheel reader (game/js/units/wheeled/wheelinput.js) on fake Gamepad API pads:
// detection by id, the pedals found from their rest values (+1 released / -1 released / 0 until touched), a hat axis
// ignored, the user's axis override, paddles as edges.                                  node tools/wheelinputbench.mjs
import { createWheelInput, parseAxes, WHEEL_ID } from '../game/js/units/wheeled/wheelinput.js';
let pass = 0, fail = 0;
const ok = (c, name, info = '') => { if (c) pass++; else fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${name.padEnd(56)} ${info}`); };
const near = (a, b, e = 0.02) => Math.abs(a - b) < e;
const pad = (id, axes, nb = 16) => ({ id, connected: true, mapping: '', axes: [...axes], buttons: Array.from({ length: nb }, () => ({ pressed: false, value: 0 })) });

// ids
ok(WHEEL_ID.test('G29 Driving Force Racing Wheel (Vendor: 046d Product: c24f)'), 'Logitech G29 is a wheel');
ok(WHEEL_ID.test('Logitech G920 Driving Force Racing Wheel for Xbox One (Vendor: 046d Product: c262)'), 'Logitech G920 is a wheel');
ok(WHEEL_ID.test('Thrustmaster T150 Racing Wheel (Vendor: 044f Product: b677)'), 'Thrustmaster T150 is a wheel');
ok(!WHEEL_ID.test('T.Flight Hotas 4 (Vendor: 044f Product: b67c)') && !WHEEL_ID.test('T-Rudder (Vendor: 044f Product: b679)'), 'the HOTAS and the T-Rudder are not');
ok(!WHEEL_ID.test('Xbox 360 Controller (XInput STANDARD GAMEPAD)'), 'an Xbox pad is not');

// a G29-like wheel: axis 0 rim, 1 / 2 / 3 pedals at +1 released, axis 9 a hat at 1.2857
{
  const W = createWheelInput(), P = pad('G29 Driving Force Racing Wheel', [0, 1, 1, 1, 0, 0, 0, 0, 0, 1.2857]);
  let r = W.read([null, P]);
  ok(r && r.gas === 0 && r.brake === 0 && r.clutch === 0 && r.steer === 0, 'at rest: no pedals, centred', JSON.stringify(r && [r.gas, r.brake, r.clutch]));
  ok(W.map.gas.i === 1 && W.map.brake.i === 2 && W.map.clutch.i === 3, 'pedals found on axes 1, 2, 3 (hat on 9 ignored)', JSON.stringify(W.map));
  P.axes[0] = -0.5; P.axes[1] = -1; P.axes[2] = 0; r = W.read([P]);
  ok(near(r.steer, -0.5) && near(r.gas, 1) && near(r.brake, 0.5), 'half left, gas floored, brake half', `${r.steer} ${r.gas} ${r.brake}`);
  P.buttons[4].pressed = true; r = W.read([P]); const up1 = r.up; r = W.read([P]);
  ok(up1 && !r.up, 'right paddle: one shift-up edge');
}
// pedals that read 0 until first touched, then +1 released (Chrome on some Logitech drivers): no ghost half-press
{
  const W = createWheelInput(), P = pad('Logitech G923 Racing Wheel', [0.02, -1, -1, -1]);
  // reversed pedals: -1 released, +1 floored
  let r = W.read([P]);
  P.axes[1] = 1; r = W.read([P]);
  ok(near(r.gas, 1) && r.brake === 0, 'pedals released at -1 (reversed driver): floored gas reads 1', `${r.gas}`);
  const W2 = createWheelInput(), Q = pad('Thrustmaster T300RS Racing wheel', [0, 0, 0, 0]);
  r = W2.read([Q]);
  ok(r.gas === 0 && r.brake === 0, 'pedals first seen at 0: released (until touched)');
}
// the user's override ("steer,gas,brake,clutch", ! inverts)
{
  ok(JSON.stringify(parseAxes('0,!5,2')) === JSON.stringify({ steer: { i: 0, inv: false }, gas: { i: 5, inv: true }, brake: { i: 2, inv: false }, clutch: null }), 'parseAxes("0,!5,2")');
  const W = createWheelInput({ store: { get: () => '0,5,2' } }), P = pad('Fanatec CSL Elite Wheel', [0.3, 0, 1, 0, 0, 1]);
  W.read([P]); P.axes[5] = -1; const r = W.read([P]);
  ok(W.map.gas.i === 5 && near(r.gas, 1) && near(r.steer, 0.3), 'override: gas on axis 5', `${r.gas}`);
}
ok(createWheelInput().read([pad('Xbox 360 Controller (XInput STANDARD GAMEPAD)', [0, 0, 0, 0])]) === null, 'no wheel: null (the gamepad path drives)');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
