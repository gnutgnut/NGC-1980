// node tools/hotas-selftest.mjs — pure-logic test of game/js/hotas.js with fake gamepads (no DOM)
import assert from 'node:assert/strict';
import { parseId, classify, hatDir, centred, throttleVal, brakeVal, wiggleBinding, createControls } from '../game/js/hotas.js';

assert.deepEqual(parseId('T.Flight Hotas 4 (Vendor: 044f Product: b67c)'), { vid: '044f', pid: 'b67c', name: 'T.Flight Hotas 4', key: '044f:b67c' });
assert.equal(parseId('44f-b679-T-Rudder').key, '044f:b679');
assert.equal(parseId('Xbox 360 Controller (XInput STANDARD GAMEPAD)').key, 'id:Xbox 360 Controller');
assert.deepEqual(hatDir(-1), [0, 1]); assert.deepEqual(hatDir(-1 + 2 / 7 * 2), [1, 0]); assert.deepEqual(hatDir(1), [-1, 1]); assert.deepEqual(hatDir(3.2857), [0, 0]);
assert.equal(centred(0.02, { dz: 0.04 }), 0); assert.equal(centred(1, {}), 1); assert.equal(centred(-1, { inv: true }), 1);
assert.equal(throttleVal(1, { min: 1, max: -1 }), 0); assert.equal(throttleVal(-1, { min: 1, max: -1 }), 1); assert.equal(throttleVal(0, { min: 1, max: -1 }), 0.5);
assert.equal(brakeVal(-1, -1, 2), 0); assert.equal(brakeVal(1, -1, 2), 1);
assert.deepEqual(wiggleBinding('thr', { start: 0, lo: -0.98, hi: 1, last: -0.98, first: 1 }), { min: 1, max: -0.98 });
assert.equal(wiggleBinding('ctr', { start: 0, lo: -1, hi: 1, last: 0, first: -1 }).inv, true);

const btns = n => Array.from({ length: n }, () => ({ pressed: false, value: 0 }));
const axes10 = () => [0, 0, 1, 0.1, 0.1, 0, 0, 0.1, 0, 3.2857];
const hotas = { id: 'T.Flight Hotas 4 (Vendor: 044f Product: b67c)', index: 1, connected: true, mapping: '', axes: axes10(), buttons: btns(12) };
const rudder = { id: 'T-Rudder (Vendor: 044f Product: b679)', index: 0, connected: true, mapping: '', axes: [-1, -1, 0.001], buttons: [] };
let pads = [rudder, hotas], t = 0;
const mem = {}, storage = { getItem: k => mem[k] ?? null, setItem: (k, v) => mem[k] = v };
const said = [], C = createControls({ say: s => said.push(s), getPads: () => pads, storage, now: () => t });
let S = C.poll(1 / 60);
assert.equal(S.source, 'HOTAS'); assert.equal(S.hasPedals, true); assert.equal(S.throttle, 0); assert.deepEqual(S.stick, { x: 0, y: 0 });
assert.equal(S.brakeL, 0); assert.equal(S.brakeR, 0); assert.deepEqual([S.hatX, S.hatY], [0, 0]);
assert.deepEqual(S.devices.map(d => d.role), ['pedals', 'stick']);
hotas.axes[0] = 1; hotas.axes[1] = -1; hotas.axes[2] = -1; hotas.axes[9] = -1 + 4 / 7; rudder.axes[2] = 1; rudder.axes[1] = 1; hotas.buttons[0].pressed = true;
S = C.poll(); assert.equal(S.stick.x, 1); assert.equal(S.stick.y, -1); assert.equal(S.throttle, 1); assert.deepEqual([S.hatX, S.hatY], [1, 0]);
assert.equal(S.rudder, 1); assert.equal(S.brakeL, 1); assert.equal(S.brakeR, 0); assert.equal(S.pressed.fire, true); assert.equal(S.actions.fire, true);
S = C.poll(); assert.equal(S.pressed.fire, false); assert.equal(S.actions.fire, true);
C.suspend = true; S = C.poll(); assert.equal(S.actions.fire, false); C.suspend = false; S = C.poll(); assert.equal(S.pressed.fire, false);
// no pedals → twist is rudder
pads = [hotas]; hotas.axes[5] = -1; S = C.poll(); assert.equal(S.hasPedals, false); assert.equal(S.rudder, -1); assert.equal(S.brakeL, 0);
assert.ok(said.some(s => /T-RUDDER DISCONNECTED/.test(s)));
// keyboard only
pads = []; S = C.poll(); assert.equal(S.source, 'NONE'); assert.equal(S.stick, null); assert.equal(S.throttle, null);
pads = [null, undefined]; S = C.poll();
// standard gamepad: triggers wind the throttle, d-pad = hat
const pad = { id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0.5, 0], buttons: btns(17) };
pads = [pad]; pad.buttons[7].value = 1; pad.buttons[12].pressed = true; for (let i = 0; i < 60; i++) S = C.poll(1 / 30);
assert.equal(S.source, 'GAMEPAD'); assert.ok(S.throttle > 0.99); assert.equal(S.hatY, 1); assert.ok(S.rudder > 0.4);
// two generic sticks: more axes wins
const g1 = { id: 'Stick A (Vendor: 1234 Product: 0001)', index: 0, connected: true, axes: [0, 0, 0], buttons: btns(4) }, g2 = { id: 'Stick B (Vendor: 1234 Product: 0002)', index: 1, connected: true, axes: [0, 0, 0, 0, 0, 0], buttons: btns(4) };
assert.deepEqual(classify([g1, g2]).map(d => d.role), ['other', 'stick']);
// wiggle-bind the rudder via the internals: simulate through a fresh controls object exposing the panel is DOM-bound, so check persistence via bindings
pads = [rudder, hotas]; S = C.poll(); assert.equal(C.bindings.axes.rudder.axis, 2); assert.equal(C.bindings.buttons.fire.btn, 0);
C.reset(); assert.ok(mem.tz_controls_v1);
console.log('hotas self-test OK');
// wiggle-to-bind: rudder actually on axis 1 with right pedal = negative; brakes bind from rest
{
  const r = { id: '044f-b679-T-Rudder', index: 0, connected: true, axes: [-1, 0, -1], buttons: [] }, h = { ...hotas, axes: axes10(), buttons: btns(12) };
  let tt = 0; const m2 = {}, st = { getItem: k => m2[k] ?? null, setItem: (k, v) => m2[k] = v };
  const D = createControls({ getPads: () => [h, r], storage: st, now: () => tt });
  D.poll(); D.bindAxis('rudder');
  const seq = [0, -0.5, -1, 0, 1, 0]; for (const v of seq) { r.axes[1] = v; tt += 100; D.poll(); }
  tt += 3100; D.poll(); const b = D.bindings.axes;
  assert.equal(b.rudder.axis, 1); assert.equal(b.rudder.inv, true); assert.equal(b.rudder.dev, '044f:b679');
  assert.equal(b.brakeL, null, 'default brakeL was axis 1, now taken by rudder');
  r.axes[1] = -1; assert.equal(D.poll().rudder, 1);
  D.bindAxis('throttle'); for (const v of [1, 0.5, -0.2, -1]) { h.axes[2] = v; tt += 100; D.poll(); } tt += 3100; D.poll();
  assert.equal(D.bindings.axes.throttle.max, -1); assert.equal(D.poll().throttle, 1);
  D.bindButton('gear'); h.buttons[3].pressed = true; D.poll(); assert.equal(D.bindings.buttons.gear.btn, 3); assert.equal(D.bindings.buttons.airbrake, null);
  // persisted and reloaded
  const E = createControls({ getPads: () => [h, r], storage: st, now: () => tt }); E.poll(); assert.equal(E.bindings.axes.rudder.axis, 1); assert.equal(E.bindings.buttons.gear.btn, 3);
  // timeout without movement
  D.bindAxis('roll'); tt += 11000; D.poll(); assert.equal(D.bindings.axes.roll.axis, 0);
}
console.log('wiggle self-test OK');
// HOTAS 4 + T-Rudder defaults: the throttle rocker (axis 6) is the countermeasures switch, right = FLARES, left = CHAFF
// (the stick has 12 buttons, so the FLARES / CHAFF button defaults 12 / 13 do not exist on it); the pedals stay the rudder
{
  const r = { id: 'T-Rudder (Vendor: 044f Product: b679)', index: 0, connected: true, axes: [-1, -1, 0], buttons: [] }, h = { ...hotas, axes: axes10(), buttons: btns(12) };
  const m3 = {}, st = { getItem: k => m3[k] ?? null, setItem: (k, v) => m3[k] = v };
  const F = createControls({ getPads: () => [r, h], storage: st, now: () => 0 });
  let s = F.poll(); assert.equal(s.pressed.flare, false); assert.equal(s.hasPedals, true);
  h.axes[6] = 1; s = F.poll(); assert.equal(s.pressed.flare, true); assert.equal(s.pressed.chaff, false); assert.equal(s.rudder, 0);
  s = F.poll(); assert.equal(s.pressed.flare, false, 'one press per rock');
  h.axes[6] = 0; F.poll(); h.axes[6] = -1; s = F.poll(); assert.equal(s.pressed.chaff, true); assert.equal(s.pressed.flare, false);
  h.axes[6] = 0; r.axes[2] = 1; s = F.poll(); assert.equal(s.rudder, 1); assert.equal(s.actions.flare || s.actions.chaff, false);
}
console.log('rocker countermeasures self-test OK');
