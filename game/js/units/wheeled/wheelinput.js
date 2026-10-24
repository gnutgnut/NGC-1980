// wheelinput.js - a racing wheel and pedals (Logitech G27 / G29 / G920 / G923 / Driving Force, Thrustmaster T150 /
// T300 / TMX / T248 / T-GT, Fanatec, Moza, generic "wheel") for the wheeled vehicles (ngc/wheeledgame). Pure: no DOM,
// no THREE; give it the pads (navigator.getGamepads()) each frame. Node-tested by tools/wheelinputbench.mjs.
//   const W = createWheelInput({ store });  const r = W.read(pads, dt)
//   r = null (no wheel) | { id, steer -1..1 (right +), gas 0..1, brake 0..1, clutch 0..1, up, down (paddle edges),
//        horn, handbrake, engine, view, seatNext, seatPrev (button edges / holds) }
// The Gamepad API gives a wheel no standard mapping, so:
//   - the steering is axis 0 on every wheel we know of (the driver reports the rim as X);
//   - the pedals are found, not assumed: an axis that sits at one end (|v| > 0.9) when first seen is a pedal at rest
//     (pedals report +1 released, -1 floored on most drivers; some the other way round: both are handled from the rest
//     value), taken in axis order as gas, brake, clutch (the order the Logitech and Thrustmaster drivers report them);
//     until an axis has moved it counts as released, so a pedal the driver reports as 0 until touched (Chrome on some
//     Logitech drivers) is not read as half pressed; a hat reported as an axis (Chrome: ~1.29 at rest) is not a pedal;
//   - `store.get('tz_wheel_axes')` = "steer,gas,brake[,clutch]" (axis numbers, -1 = none) overrides the guess, and a
//     leading '!' on an axis inverts it ("0,!2,3").
//   - buttons: the paddles (4 right = up, 5 left = down on the Logitech and Thrustmaster wheels), 0 / 1 / 2 / 3 the face
//     buttons (horn, engine, view, handbrake), 6 / 7 next / previous seat.
export const WHEEL_ID = /wheel|racing|driving force|g2[79]\b|g9[02][03]\b|g923|\bt150\b|\bt300|\btmx\b|\bt248|\bt-?gt\b|t500|fanatec|csl\b|moza|simucube|ferrari.*(458|599)/i;

export function parseAxes(s) {
  if (!s || typeof s !== 'string') return null;
  const out = s.split(',').map(t => { t = t.trim(); const inv = t.startsWith('!'); const n = parseInt(inv ? t.slice(1) : t, 10); return Number.isFinite(n) && n >= 0 ? { i: n, inv } : null; });
  return out.length >= 3 ? { steer: out[0], gas: out[1], brake: out[2], clutch: out[3] || null } : null;
}

export function createWheelInput(o = {}) {
  const store = o.store || null;
  const W = { pad: null, rest: [], moved: [], prevB: [], map: null, id: '' };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function pick(pads) {
    for (const p of pads || []) if (p && p.connected !== false && WHEEL_ID.test(p.id || '') && p.axes && p.axes.length >= 2) return p;
    return null;
  }
  function learn(p) {
    W.id = p.id; W.rest = p.axes.map(v => v); W.moved = p.axes.map(() => false); W.prevB = [];
    let user = null; try { user = parseAxes(store && store.get ? store.get('tz_wheel_axes') : null); } catch (e) { user = null; }
    if (user) { W.map = user; return; }
    const pedals = [];
    for (let i = 1; i < p.axes.length; i++) if (Math.abs(p.axes[i]) > 0.9 && Math.abs(p.axes[i]) < 1.05) pedals.push({ i, inv: false });
    W.map = { steer: { i: 0, inv: false }, gas: pedals[0] || null, brake: pedals[1] || null, clutch: pedals[2] || null };
  }
  // a pedal: travel from its rest value toward the other end, 0..1
  function pedal(p, a) {
    if (!a || a.i >= p.axes.length) return 0;
    const v = p.axes[a.i], r = W.rest[a.i];
    if (!W.moved[a.i]) { if (Math.abs(v - r) > 0.05) W.moved[a.i] = true; else return 0; }
    const rest = Math.abs(r) > 0.5 ? Math.sign(r) : (a.inv ? -1 : 1);   // a pedal first seen at 0 (untouched): +1 released
    return clamp(Math.abs(v - rest) / 2, 0, 1);
  }
  W.read = (pads) => {
    const p = pick(pads);
    if (!p) { W.pad = null; return null; }
    if (W.pad !== p || W.id !== p.id || !W.map) { W.pad = p; learn(p); }
    const M = W.map, b = i => !!(p.buttons && p.buttons[i] && p.buttons[i].pressed), edge = i => b(i) && !W.prevB[i];
    let steer = M.steer && M.steer.i < p.axes.length ? p.axes[M.steer.i] : 0; if (M.steer && M.steer.inv) steer = -steer;
    const r = {
      id: p.id, steer: Math.abs(steer) < 0.01 ? 0 : clamp(steer, -1, 1), gas: pedal(p, M.gas), brake: pedal(p, M.brake), clutch: pedal(p, M.clutch),
      up: edge(4), down: edge(5), horn: b(0), engine: edge(1), view: edge(2), handbrake: b(3), seatNext: edge(6), seatPrev: edge(7),
    };
    for (let i = 0; i < (p.buttons ? p.buttons.length : 0) && i < 24; i++) W.prevB[i] = b(i);
    return r;
  };
  return W;
}
