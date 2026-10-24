// Flight controls for the browser Gamepad API: HOTAS + rudder pedals + gamepad, with per-device bindings,
// wiggle-to-bind calibration and an in-game controls overlay (live monitor of every axis and button).
//   const C = createControls({ say });  C.poll(dt) once per frame, then read C.state.
// Bindings are keyed by USB vendor:product (or the id string), so they survive the pads swapping order.
const KEY = 'tz_controls_v1';
export const HAT_DIRS = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];   // up, then clockwise
const PID_NAME = { b67c: 'HOTAS 4', b679: 'T-Rudder' };   // short: the J panel's binding column is narrow

export const ACTIONS = [
  // ngc/hornethuey: one binding, two aircraft - the label says what the button does in the jets and (after the dot) in
  // the UH-1H, where heli.js reads the same actions: door gun, rockets, bombs, hoist, stab assist, force trim, light, starter
  { id: 'fire', label: 'GUN / TRIGGER · HUEY DOOR GUN' }, { id: 'pickle', label: 'WEAPON RELEASE · HUEY HOIST' }, { id: 'missile', label: 'FIRE MISSILE · HUEY ROCKETS' },
  { id: 'bomb', label: 'DROP BOMB · HUEY BOMBS' }, { id: 'airbrake', label: 'SPEED BRAKE (HOLD) · HUEY HOIST' }, { id: 'gear', label: 'LANDING GEAR · HUEY STAB ASSIST' },
  { id: 'flaps', label: 'FLAPS CYCLE · HUEY FORCE TRIM' }, { id: 'hook', label: 'TAIL HOOK · HUEY LANDING LIGHT' }, { id: 'view', label: 'COCKPIT / CHASE VIEW' },
  { id: 'zoom', label: 'ZOOM VIEW (HOLD)' }, { id: 'wheelbrake', label: 'WHEEL BRAKES (HOLD) · HUEY STARTER (HOLD)' }, { id: 'eject', label: 'EJECT (HOLD 1S)' },
  // TOMCAT: the wing sweep switch on the outboard throttle (no default buttons: bind them in the J panel)
  { id: 'sweepfwd', label: 'WING SWEEP FWD (HOLD, TOMCAT)' }, { id: 'sweepaft', label: 'WING SWEEP AFT (HOLD, TOMCAT)' }, { id: 'sweepauto', label: 'WING SWEEP AUTO (TOMCAT)' },
  { id: 'flare', label: 'FLARES (COUNTERMEASURES)' }, { id: 'chaff', label: 'CHAFF (COUNTERMEASURES)' },   // ngc/cmpolish: Huey M130, Hornet ALE-39
  { id: 'lookhat', label: 'HAT = LOOK AROUND', setting: true },
];
// axis functions: type ctr = centring (-1..1), thr = throttle (0..1), brk = toe brake (0..1 from its rest end)
export const AXIS_FNS = [
  { id: 'roll', label: 'STICK ROLL', type: 'ctr', prompt: 'MOVE STICK RIGHT, THEN FULL LEFT AND RIGHT' },
  { id: 'pitch', label: 'STICK PITCH', type: 'ctr', prompt: 'PULL STICK BACK, THEN FULL FORWARD AND BACK' },
  { id: 'throttle', label: 'THROTTLE', type: 'thr', prompt: 'THROTTLE TO IDLE, THEN FULL FORWARD AND HOLD IT THERE' },
  { id: 'twist', label: 'STICK TWIST', type: 'ctr', prompt: 'TWIST STICK RIGHT, THEN FULL LEFT AND RIGHT' },
  { id: 'rudder', label: 'RUDDER PEDALS', type: 'ctr', prompt: 'PUSH RIGHT PEDAL FORWARD, THEN FULL LEFT AND RIGHT' },
  { id: 'brakeL', label: 'LEFT TOE BRAKE', type: 'brk', prompt: 'PRESS LEFT TOE BRAKE FULLY, THEN RELEASE' },
  { id: 'brakeR', label: 'RIGHT TOE BRAKE', type: 'brk', prompt: 'PRESS RIGHT TOE BRAKE FULLY, THEN RELEASE' },
  { id: 'rocker', label: 'ROCKER: FLARE R / CHAFF L', type: 'ctr', prompt: 'ROCK THE ROCKER RIGHT FIRST, THEN BOTH WAYS' },
];
const FN = Object.fromEntries(AXIS_FNS.map(f => [f.id, f]));
const DZ = { roll: 0.04, pitch: 0.04, twist: 0.06, rudder: 0.06, rocker: 0.1 };
// default buttons (0-based): HOTAS 4 / generic stick, and a standard-mapped pad (6/7 are the triggers = throttle)
const DEF_BTN = {
  stick: { fire: 0, pickle: 1, missile: 2, airbrake: 3, bomb: 4, gear: 5, flaps: 6, hook: 7, view: 8, zoom: 9, wheelbrake: 10, eject: 11, flare: 12, chaff: 13 },
  gamepad: { fire: 0, missile: 1, bomb: 2, gear: 3, airbrake: 4, pickle: 5, view: 8, hook: 9, zoom: 10, flaps: 11 },
};

// ------------------------------------------------------------------------------------- pure helpers (node-testable)
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const dz = (v, d = 0.04) => Math.abs(v) < d ? 0 : Math.sign(v) * Math.min(1, (Math.abs(v) - d) / (1 - d));
// Chrome: "T.Flight Hotas 4 (Vendor: 044f Product: b67c)", Firefox: "044f-b67c-T.Flight Hotas 4", pads: "Xbox ... (XInput STANDARD GAMEPAD)"
export function parseId(id = '') {
  const m = /Vendor:\s*([0-9a-f]{1,4})\s*Product:\s*([0-9a-f]{1,4})/i.exec(id) || /^([0-9a-f]{1,4})-([0-9a-f]{1,4})-/i.exec(id);
  const p4 = s => s.toLowerCase().padStart(4, '0'), vid = m ? p4(m[1]) : '', pid = m ? p4(m[2]) : '';
  const name = String(id).replace(/^[0-9a-f]{1,4}-[0-9a-f]{1,4}-/i, '').replace(/\s*\([^)]*\)\s*$/, '').trim() || 'GAMEPAD';
  return { vid, pid, name, key: pid ? vid + ':' + pid : 'id:' + name };
}
// gamepads → [{index, id, key, short, kind: hotas4|stick|pedals|gamepad, role: stick|pedals|gamepad|other, pad}]
export function classify(pads) {
  const devs = [], seen = {};
  for (const p of pads || []) {
    if (!p || p.connected === false) continue;
    const P = parseId(p.id), na = p.axes ? p.axes.length : 0, nb = p.buttons ? p.buttons.length : 0;
    let key = P.key; seen[key] = (seen[key] || 0) + 1; if (seen[key] > 1) key += '#' + seen[key];
    const kind = P.pid === 'b67c' ? 'hotas4' : P.pid === 'b679' || /rudder|pedal/i.test(P.name) ? 'pedals'
      : p.mapping === 'standard' ? 'gamepad' : nb === 0 && na >= 2 && na <= 4 ? 'pedals' : 'stick';
    devs.push({ index: p.index, id: p.id, key, short: PID_NAME[P.pid] || P.name.slice(0, 28), kind, role: kind === 'hotas4' ? 'stick' : kind, pad: p });
  }
  // several sticks: a known HOTAS wins, then the one with the most axes; one pedal set; one gamepad
  const sticks = devs.filter(d => d.role === 'stick').sort((a, b) => (b.kind === 'hotas4') - (a.kind === 'hotas4') || b.pad.axes.length - a.pad.axes.length);
  for (const d of sticks.slice(1)) d.role = 'other';
  for (const r of ['pedals', 'gamepad']) devs.filter(d => d.role === r).slice(1).forEach(d => d.role = 'other');
  return devs;
}
export const hatDir = v => v === undefined || v === null || !(v >= -1.05 && v <= 1.05) ? [0, 0] : HAT_DIRS[Math.round((v + 1) / (2 / 7)) % 8];
export function centred(raw, b) {
  const c = b.ctr ?? 0, v = raw >= c ? (raw - c) / (((b.max ?? 1) - c) || 1) : (raw - c) / ((c - (b.min ?? -1)) || 1);
  return dz(clamp(b.inv ? -v : v, -1, 1), b.dz ?? 0.04);
}
export function throttleVal(raw, b) { const t = clamp((raw - b.min) / ((b.max - b.min) || 1), 0, 1); return t < 0.01 ? 0 : t > 0.99 ? 1 : t; }
export function brakeVal(raw, rest, span) { const v = clamp(Math.abs(raw - rest) / (span || 2), 0, 1); return v < 0.03 ? 0 : v; }
const restSpan = r => Math.max(1 - r, r + 1);
const btnDown = b => !!b && (b.pressed || b.value > 0.5);
// a finished wiggle sample → axis binding (or null). s = {start, lo, hi, last, first} for one axis
export function wiggleBinding(type, s) {
  const range = s.hi - s.lo; if (!(range >= 0.3)) return null;
  if (type === 'thr') { const max = s.last, min = Math.abs(s.lo - max) > Math.abs(s.hi - max) ? s.lo : s.hi; return Math.abs(max - min) < 0.3 ? null : { min, max }; }
  if (type === 'brk') { const rest = Math.abs(s.start) > 0.9 ? Math.sign(s.start) : s.start, ext = Math.abs(s.lo - rest) > Math.abs(s.hi - rest) ? s.lo : s.hi; return { rest, span: Math.abs(ext - rest) }; }
  const mid = (s.lo + s.hi) / 2, ctr = Math.abs(s.start - mid) < 0.25 * range ? s.start : mid;
  return { ctr, min: ctr - s.lo >= 0.2 ? s.lo : -1, max: s.hi - ctr >= 0.2 ? s.hi : 1, inv: s.first < 0 };
}

// ------------------------------------------------------------------------------------- the controls
export function createControls({ say = () => {}, getPads, storage, now } = {}) {
  getPads ||= () => { try { return typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads() || []) : []; } catch (e) { return []; } };
  const store = storage !== undefined ? storage : (() => { try { return globalThis.localStorage || null; } catch (e) { return null; } })();
  now ||= () => typeof performance !== 'undefined' ? performance.now() : Date.now();
  let cfg = load(), devs = [], byKey = {}, prim = null, ped = null, thrInt = 0, lastPoll = -1e9;
  let wig = null, bindBtn = null, wizard = null, promptText = '', open = false, ui = null, timer = 0, suspendWas = false;
  const rest = {}, hatAx = {}, prevHeld = {}, known = {}, val = {}, held = {};
  const S = { stick: null, twist: 0, rudder: 0, hasPedals: false, throttle: null, rocker: 0, brakeL: 0, brakeR: 0, hatX: 0, hatY: 0,
    buttons: [], actions: {}, pressed: {}, source: 'NONE', devices: [] };

  function load() {
    let c = null; try { c = JSON.parse(store && store.getItem(KEY)); } catch (e) {}
    if (!c || typeof c !== 'object') c = {};
    return { axes: c.axes && typeof c.axes === 'object' ? c.axes : {}, btns: c.btns && typeof c.btns === 'object' ? c.btns : {}, lookhat: c.lookhat !== false };
  }
  function save() { try { store && store.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }
  const tell = (t, s = 2.5) => { promptText = t; try { say(t, s); } catch (e) {} };

  function defAxis(fn) {
    if (fn === 'rudder' || fn === 'brakeL' || fn === 'brakeR') {
      const ax = { rudder: 2, brakeL: 1, brakeR: 0 }[fn];
      return !ped || ax >= ped.pad.axes.length ? null : { dev: ped.key, axis: ax, ...(fn === 'rudder' ? { dz: DZ.rudder } : {}) };
    }
    if (!prim) return null;
    if (prim.kind === 'gamepad') {
      const ax = { roll: 0, pitch: 1, twist: 2 }[fn];
      if (fn === 'throttle') return { dev: prim.key, trig: [6, 7] };
      return ax === undefined || ax >= prim.pad.axes.length ? null : { dev: prim.key, axis: ax, dz: DZ[fn] };
    }
    const ax = { roll: 0, pitch: 1, throttle: 2, twist: 5, rocker: prim.kind === 'hotas4' ? 6 : undefined }[fn];
    if (ax === undefined || ax >= prim.pad.axes.length) return null;
    return fn === 'throttle' ? { dev: prim.key, axis: ax, min: 1, max: -1 } : { dev: prim.key, axis: ax, dz: DZ[fn] };
  }
  const axisOf = fn => { const o = cfg.axes[fn]; return o === null ? null : o && byKey[o.dev] ? o : defAxis(fn); };
  function btnOf(id) {
    const o = cfg.btns[id]; if (o === null) return null; if (o && byKey[o.dev]) return o;
    const m = prim && DEF_BTN[prim.kind === 'gamepad' ? 'gamepad' : 'stick'][id];
    return m === undefined || m === null || !prim ? null : { dev: prim.key, btn: m };
  }
  function readFn(fn) {
    const b = axisOf(fn), d = b && byKey[b.dev]; if (!d) return null;
    if (b.trig) return thrInt;
    const raw = d.pad.axes[b.axis]; if (typeof raw !== 'number' || !isFinite(raw) || Math.abs(raw) > 1.05) return null;
    const t = FN[fn].type;
    if (t === 'thr') return throttleVal(raw, b);
    if (t === 'brk') {
      if (b.rest !== undefined) return brakeVal(raw, b.rest, b.span);
      const k = b.dev + ':' + b.axis;
      if (rest[k] === undefined) { if (d.pad.axes.every(v => v === 0)) return 0; rest[k] = Math.abs(raw) > 0.5 ? Math.sign(raw) : raw; }   // released at first sight
      if (Math.sign(raw) === Math.sign(rest[k]) && Math.abs(raw) > Math.abs(rest[k])) rest[k] = raw;
      return brakeVal(raw, rest[k], restSpan(rest[k]));
    }
    return centred(raw, b);
  }

  const C = {
    suspend: false,
    get state() { return S; },
    get isOpen() { return open; },
    get lookhat() { return cfg.lookhat; },
    get bindings() {
      const ax = {}, bt = {};
      for (const f of AXIS_FNS) { const b = axisOf(f.id); ax[f.id] = b && { ...b, short: byKey[b.dev]?.short || b.dev, user: !!cfg.axes[f.id] }; }
      for (const a of ACTIONS) if (!a.setting) { const b = btnOf(a.id); bt[a.id] = b && { ...b, short: byKey[b.dev]?.short || b.dev, user: !!cfg.btns[a.id] }; }
      return JSON.parse(JSON.stringify({ axes: ax, buttons: bt, lookhat: cfg.lookhat }));
    },
    reset() { cfg = { axes: {}, btns: {}, lookhat: true }; for (const k in rest) delete rest[k]; wig = bindBtn = wizard = null; save(); tell('CONTROLS RESET TO DEFAULTS'); },
    bindAxis(fn) { if (FN[fn]) { wizard = null; startWiggle(fn); } },   // what the panel's BIND buttons call
    bindButton(id) { if (ACTIONS.some(a => a.id === id && !a.setting)) startBindBtn(id); },
    toggle() { open ? C.close() : C.open(); },
    open() { if (open) return; open = true; suspendWas = C.suspend; C.suspend = true; try { document.exitPointerLock?.(); } catch (e) {} buildUi(); },
    close() {
      if (!open) return; open = false; wig = bindBtn = wizard = null; C.suspend = suspendWas;
      if (ui) ui.root.style.display = 'none'; clearInterval(timer); removeEventListener('keydown', onKey, true);
    },
    poll(dt = 1 / 60) {
      lastPoll = now();
      let pads; try { pads = getPads(); } catch (e) { pads = []; }
      try { devs = classify(pads); } catch (e) { devs = []; }
      byKey = {}; for (const d of devs) byKey[d.key] = d;
      prim = devs.find(d => d.role === 'stick') || devs.find(d => d.role === 'gamepad') || null;
      ped = devs.find(d => d.role === 'pedals') || null;
      for (const d of devs) if (!known[d.key]) { known[d.key] = d.short; tell(`${d.short.toUpperCase()} CONNECTED`, 2); }
      for (const k in known) if (!byKey[k]) { tell(`${known[k].toUpperCase()} DISCONNECTED`, 2.5); delete known[k]; }
      for (const d of devs) { const a = d.pad.axes; if (hatAx[d.key] === undefined && a.length > 9) hatAx[d.key] = 9; for (let i = 0; i < a.length; i++) if (Math.abs(a[i]) > 1.05 && Math.abs(a[i]) < 4) hatAx[d.key] = i; }
      // gamepad throttle: triggers wind it down/up
      const tb = axisOf('throttle');
      if (tb && tb.trig) { const bs = byKey[tb.dev].pad.buttons, v = i => bs[i] ? +bs[i].value || (bs[i].pressed ? 1 : 0) : 0; thrInt = clamp(thrInt + (v(tb.trig[1]) - v(tb.trig[0])) * dt * 0.7, 0, 1); }
      for (const f of AXIS_FNS) val[f.id] = readFn(f.id);
      S.stick = prim ? { x: val.roll ?? 0, y: val.pitch ?? 0 } : null;
      S.twist = val.twist ?? 0; S.hasPedals = val.rudder !== null; S.rudder = S.hasPedals ? val.rudder : S.twist;
      S.throttle = val.throttle; S.rocker = val.rocker ?? 0; S.brakeL = val.brakeL ?? 0; S.brakeR = val.brakeR ?? 0;
      S.hatX = S.hatY = 0; S.buttons = prim ? Array.from(prim.pad.buttons, btnDown) : [];
      if (prim) {
        [S.hatX, S.hatY] = hatDir(prim.pad.axes[hatAx[prim.key] ?? 9]);
        if (prim.pad.mapping === 'standard') { const b = S.buttons; if (b[12]) S.hatY = 1; if (b[13]) S.hatY = -1; if (b[14]) S.hatX = -1; if (b[15]) S.hatX = 1; }
      }
      S.source = !prim ? 'NONE' : prim.kind === 'gamepad' ? 'GAMEPAD' : 'HOTAS';
      S.devices = devs.map(d => ({ index: d.index, id: d.id, short: d.short, role: d.role, axes: Array.from(d.pad.axes), buttons: Array.from(d.pad.buttons, btnDown) }));
      const sus = C.suspend || open || !!wig || !!bindBtn;
      for (const a of ACTIONS) {
        if (a.setting) { S.actions[a.id] = cfg[a.id]; S.pressed[a.id] = false; continue; }
        // the HOTAS 4 throttle rocker doubles as the countermeasures switch (yaw comes from the pedals or the stick twist,
        // so it is otherwise unused; the stick has no buttons 13 / 14): rock right = FLARES, rock left = CHAFF
        const b = btnOf(a.id), d = b && byKey[b.dev], h = (!!d && btnDown(d.pad.buttons[b.btn])) || (a.id === 'flare' && S.rocker > 0.6) || (a.id === 'chaff' && S.rocker < -0.6);
        held[a.id] = h; S.actions[a.id] = !sus && h; S.pressed[a.id] = !sus && h && !prevHeld[a.id]; prevHeld[a.id] = h;
      }
      if (wig) stepWiggle(); if (bindBtn) stepBindBtn();
      return S;
    },
  };

  // ---------------------------------------------------------------- wiggle-to-bind (axes) and press-to-bind (buttons)
  function startWiggle(fn) {
    bindBtn = null; const f = FN[fn], smp = {};
    for (const d of devs) smp[d.key] = Array.from(d.pad.axes, v => ({ start: v, lo: v, hi: v, last: v, first: 0, bad: Math.abs(v) > 1.05 }));
    wig = { fn, t0: now(), tMove: 0, smp }; tell(`MOVE THE ${f.label}: ${f.prompt}`, 4);
  }
  function stepWiggle() {
    const t = now(), w = wig;
    for (const d of devs) {
      const ss = w.smp[d.key] ||= []; const a = d.pad.axes;
      for (let i = 0; i < a.length; i++) {
        const v = a[i], s = ss[i] ||= { start: v, lo: v, hi: v, last: v, first: 0, bad: false };
        if (!(Math.abs(v) <= 1.05)) { s.bad = true; continue; }
        s.lo = Math.min(s.lo, v); s.hi = Math.max(s.hi, v); s.last = v;
        if (!s.first && Math.abs(v - s.start) > 0.25) s.first = Math.sign(v - s.start);
        if (!w.tMove && !s.bad && s.hi - s.lo >= 0.3) w.tMove = t;
      }
    }
    if (!w.tMove && t - w.t0 > 10000) { wig = null; tell(`NO MOVEMENT DETECTED - ${FN[w.fn].label} UNCHANGED`, 3); return nextWizard(); }
    if (!w.tMove || t - w.tMove < 3000) return;
    let best = null;
    for (const k in w.smp) w.smp[k].forEach((s, i) => { if (s && !s.bad && byKey[k] && s.hi - s.lo >= 0.3 && (!best || s.hi - s.lo > best.r)) best = { k, i, s, r: s.hi - s.lo }; });
    wig = null;
    const nb = best && wiggleBinding(FN[w.fn].type, best.s);
    if (!nb) { tell(`${FN[w.fn].label}: NOT ENOUGH TRAVEL - TRY AGAIN`, 3); return nextWizard(); }
    const b = { dev: best.k, axis: best.i, ...nb }; if (DZ[w.fn]) b.dz = DZ[w.fn];
    for (const f of AXIS_FNS) { const o = axisOf(f.id); if (f.id !== w.fn && o && o.dev === b.dev && o.axis === b.axis) cfg.axes[f.id] = null; }   // one axis, one job
    cfg.axes[w.fn] = b; save();
    tell(`${FN[w.fn].label} = ${byKey[b.dev].short.toUpperCase()} AXIS ${b.axis}${b.inv ? ' (INVERTED)' : ''}`, 3);
    nextWizard();
  }
  function nextWizard() {
    if (!wizard) return; const fn = wizard.shift();
    if (!fn) { wizard = null; return tell('CALIBRATION COMPLETE', 3); }
    setTimeout(() => { if (wizard !== null && open) startWiggle(fn); }, 900);
  }
  function startBindBtn(id) {
    wig = null; wizard = null; const snap = {};
    for (const d of devs) snap[d.key] = Array.from(d.pad.buttons, btnDown);
    bindBtn = { id, snap }; tell(`PRESS A BUTTON FOR ${ACTIONS.find(a => a.id === id).label}  (ESC CANCELS, DEL CLEARS)`, 4);
  }
  function stepBindBtn() {
    for (const d of devs) {
      const sn = bindBtn.snap[d.key] ||= [];
      for (let i = 0; i < d.pad.buttons.length; i++) {
        const h = btnDown(d.pad.buttons[i]);
        if (h && !sn[i]) return setBtn(bindBtn.id, { dev: d.key, btn: i });
        sn[i] = h;
      }
    }
  }
  function setBtn(id, b) {
    let was = '';
    if (b) for (const a of ACTIONS) { const o = !a.setting && a.id !== id && btnOf(a.id); if (o && o.dev === b.dev && o.btn === b.btn) { cfg.btns[a.id] = null; was = a.label; } }
    cfg.btns[id] = b; bindBtn = null; save();
    const L = ACTIONS.find(a => a.id === id).label;
    tell(b ? `${L} = ${byKey[b.dev]?.short.toUpperCase() || b.dev} BUTTON ${b.btn + 1}${was ? `  (TAKEN FROM ${was})` : ''}` : `${L} CLEARED`, 3);
  }
  function onKey(e) {
    if (!open) return;
    const k = e.code || e.key, busy = wig || bindBtn || wizard;
    if (k === 'Escape') { if (busy) { wig = bindBtn = wizard = null; tell('CANCELLED', 1.5); } else C.close(); }
    else if ((k === 'Delete' || k === 'Backspace') && bindBtn) setBtn(bindBtn.id, null);
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }

  // ---------------------------------------------------------------- overlay panel (built on first open, refreshed at 20 Hz while open)
  const CSS = `#tzc{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:10000;width:min(1240px,97vw);max-height:96vh;overflow:auto;box-sizing:border-box;
background:rgba(0,10,25,.92);border:1px solid #4aa;color:#9ff;font:12px/1.35 Consolas,"Courier New",monospace;text-transform:uppercase;padding:10px 14px;pointer-events:auto;user-select:none;text-shadow:0 0 4px #0cf6}
#tzc *{box-sizing:border-box}#tzc h2{margin:0;font-size:18px;letter-spacing:4px;color:#fff;display:inline-block}#tzc h3{margin:8px 0 3px;font-size:12px;color:#ff8;letter-spacing:2px;border-bottom:1px solid #4aa5}
#tzc button{font:inherit;color:#9ff;background:rgba(0,40,60,.7);border:1px solid #4aa;padding:1px 6px;margin-left:3px;cursor:pointer;text-transform:uppercase}#tzc button:hover{background:#0a5a6a;color:#fff}
#tzc .hd{display:flex;align-items:center;gap:14px}#tzc .hd .src{flex:1;color:#bde}#tzc .pr{min-height:20px;margin:6px 0 2px;color:#ff8;font-size:14px;letter-spacing:1px}
#tzc .cols{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:16px}#tzc table{width:100%;border-collapse:collapse}#tzc td{padding:1px 3px;white-space:nowrap}
#tzc td.b{color:#bde;overflow:hidden;text-overflow:ellipsis;max-width:160px}#tzc td.r{text-align:right}#tzc .def{color:#6aa}#tzc .no{color:#866}
#tzc .br{display:inline-block;position:relative;width:90px;height:9px;border:1px solid #4aa;vertical-align:middle;background:rgba(0,30,40,.6)}#tzc .br i{position:absolute;top:0;bottom:0;background:#4df}
#tzc .br.c:after{content:'';position:absolute;left:50%;top:-2px;bottom:-2px;border-left:1px solid #4aa}#tzc .lmp{display:inline-block;width:10px;height:10px;border:1px solid #4aa;border-radius:50%}#tzc .lmp.on{background:#ff8;box-shadow:0 0 6px #ff8}
#tzc .dev{border:1px solid #4aa6;padding:4px 6px;margin-bottom:6px}#tzc .dev .t{color:#fff}#tzc .axs{display:grid;grid-template-columns:1fr 1fr;gap:1px 12px;margin:3px 0}
#tzc .ax{display:flex;align-items:center;gap:5px}#tzc .ax .br{width:70px}#tzc .ax.on{color:#fff}#tzc .ax.on .br{border-color:#ff8}#tzc .ax.on i{background:#ff8}#tzc .ax em{font-style:normal;color:#ff8;font-size:11px}
#tzc .dots b{display:inline-block;min-width:20px;text-align:center;margin:1px;border:1px solid #4aa;border-radius:9px;font-weight:normal;font-size:11px;color:#6aa}#tzc .dots b.on{background:#ff8;color:#000;border-color:#ff8}
#tzc .ft{display:flex;gap:8px;align-items:center;margin-top:8px;color:#6aa}#tzc .ft span{flex:1}#tzc .busy{background:#5a4a00!important;color:#fff!important}`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const bar = (v, c) => { const p = clamp(c ? (v + 1) / 2 : v, 0, 1) * 100; return c ? [Math.min(50, p), Math.abs(p - 50)] : [0, p]; };
  const setBar = (el, v, c) => { const [l, w] = bar(v || 0, c); el.style.left = l + '%'; el.style.width = w + '%'; };
  function buildUi() {
    if (!ui) {
      if (!document.getElementById('tzc-css')) { const st = document.createElement('style'); st.id = 'tzc-css'; st.textContent = CSS; document.head.appendChild(st); }
      const root = document.createElement('div'); root.id = 'tzc';
      const axRows = AXIS_FNS.map(f => `<tr data-f="${f.id}"><td>${f.label}</td><td class="b"></td><td><span class="br${f.type === 'ctr' ? ' c' : ''}"><i></i></span></td>
<td class="r"><button data-a="wig">BIND</button>${f.type === 'brk' ? '' : '<button data-a="inv">INV</button>'}<button data-a="adef">DEF</button><button data-a="aclr">CLR</button></td></tr>`).join('');
      const btRows = ACTIONS.map(a => a.setting ? `<tr data-id="${a.id}"><td></td><td>${a.label}</td><td class="b"></td><td class="r"><button data-a="set">TOGGLE</button></td></tr>`
        : `<tr data-id="${a.id}"><td><span class="lmp"></span></td><td>${a.label}</td><td class="b"></td><td class="r"><button data-a="bbind">BIND</button><button data-a="bdef">DEF</button><button data-a="bclr">CLR</button></td></tr>`).join('');
      root.innerHTML = `<div class="hd"><h2>FLIGHT CONTROLS</h2><span class="src"></span><button data-a="close">CLOSE (ESC)</button></div><div class="pr"></div>
<div class="cols"><div><h3>AXES</h3><table class="axt">${axRows}</table><h3>BUTTONS (NUMBERED FROM 1, AS PRINTED ON THE STICK)</h3><table class="btt">${btRows}</table></div>
<div><h3>DEVICES (RAW)</h3><div class="devs"></div><h3>OUTPUT</h3><table class="out"></table></div></div>
<div class="ft"><button data-a="wizard">CALIBRATE ALL</button><button data-a="reset">RESET TO DEFAULTS</button><span>DEVICE MISSING? PRESS ONE OF ITS BUTTONS OR MOVE IT - THE BROWSER HIDES PADS UNTIL THEY ARE USED</span></div>`;
      document.body.appendChild(root);
      const q = s => root.querySelector(s);
      ui = { root, src: q('.src'), pr: q('.pr'), devs: q('.devs'), out: q('.out'), sig: '', axRow: {}, btRow: {}, devEls: [] };
      root.querySelectorAll('.axt tr').forEach(tr => ui.axRow[tr.dataset.f] = { b: tr.querySelector('.b'), i: tr.querySelector('i'), bind: tr.querySelector('button') });
      root.querySelectorAll('.btt tr').forEach(tr => ui.btRow[tr.dataset.id] = { b: tr.querySelector('.b'), l: tr.querySelector('.lmp'), bind: tr.querySelector('button') });
      const outs = [['STICK X', 'c'], ['STICK Y (AFT +)', 'c'], ['THROTTLE', ''], ['RUDDER', 'c'], ['TWIST', 'c'], ['ROCKER', 'c'], ['BRAKE L', ''], ['BRAKE R', ''], ['HAT', 'h']];
      ui.out.innerHTML = outs.map(([l, c]) => `<tr><td>${l}</td><td>${c === 'h' ? '' : `<span class="br${c ? ' c' : ''}"><i></i></span>`}</td><td class="v"></td></tr>`).join('');
      ui.outEls = Array.from(ui.out.querySelectorAll('tr'), tr => ({ i: tr.querySelector('i'), v: tr.querySelector('.v') }));
      root.addEventListener('click', e => {
        const bt = e.target.closest('button'); if (!bt) return; const a = bt.dataset.a, tr = bt.closest('tr'), f = tr?.dataset.f, id = tr?.dataset.id;
        if (a === 'close') C.close(); else if (a === 'reset') C.reset();
        else if (a === 'wizard') { wizard = ['roll', 'pitch', 'throttle', 'twist', ...(ped ? ['rudder', 'brakeL', 'brakeR'] : [])]; nextWizard(); }
        else if (a === 'wig') { wizard = null; startWiggle(f); }
        else if (a === 'inv') { const b = axisOf(f); if (!b || b.trig) return; const n = { ...b }; if (FN[f].type === 'thr') [n.min, n.max] = [b.max, b.min]; else n.inv = !b.inv; cfg.axes[f] = n; save(); }
        else if (a === 'adef') { delete cfg.axes[f]; save(); } else if (a === 'aclr') { cfg.axes[f] = null; save(); }
        else if (a === 'bbind') startBindBtn(id); else if (a === 'bdef') { delete cfg.btns[id]; save(); } else if (a === 'bclr') setBtn(id, null);
        else if (a === 'set') { cfg[id] = !cfg[id]; save(); }
        refresh();
      });
    }
    ui.root.style.display = ''; ui.sig = ''; promptText = '';
    addEventListener('keydown', onKey, true);
    clearInterval(timer); timer = setInterval(() => { if (now() - lastPoll > 120) C.poll(0.05); refresh(); }, 50);
    if (now() - lastPoll > 120) C.poll(0); refresh();
  }
  const fmt = v => (v >= 0 ? '+' : '') + v.toFixed(2);
  function axisText(fn) {
    const b = axisOf(fn), u = cfg.axes[fn] ? '' : ' <span class="def">(DEFAULT)</span>';
    if (cfg.axes[fn] === null) return '<span class="no">- UNBOUND -</span>';
    if (!b) return `<span class="no">${fn === 'rudder' || fn.startsWith('brake') ? 'NO PEDALS' : 'NO DEVICE'}</span>`;
    const s = esc(byKey[b.dev]?.short || b.dev);
    if (b.trig) return `${s} TRIGGERS ${u}`;
    const t = FN[fn].type, ex = t === 'thr' ? ` IDLE ${fmt(b.min)} FULL ${fmt(b.max)}` : t === 'brk' ? (b.rest !== undefined ? ` REST ${fmt(b.rest)}` : '') : b.inv ? ' INV' : '';
    return `${s} AX ${b.axis}${ex}${u}`;
  }
  function refresh() {
    if (!ui || !open) return;
    ui.src.textContent = `SOURCE ${S.source}  ·  STICK ${prim ? prim.short : '-'}  ·  PEDALS ${ped ? ped.short : '-'}`;
    let p = promptText;
    if (wig) { const t = now(), f = FN[wig.fn]; p = `MOVE THE ${f.label}: ${f.prompt}  ` + (wig.tMove ? `(${Math.max(0, 3 - (t - wig.tMove) / 1000).toFixed(1)} S)` : '(WAITING FOR MOVEMENT...)'); }
    ui.pr.textContent = p;
    for (const f of AXIS_FNS) { const r = ui.axRow[f.id], h = axisText(f.id); if (r.h !== h) r.b.innerHTML = r.h = h; setBar(r.i, val[f.id] ?? 0, f.type === 'ctr'); r.bind.classList.toggle('busy', wig?.fn === f.id); }
    for (const a of ACTIONS) {
      const r = ui.btRow[a.id]; let h;
      if (a.setting) h = cfg[a.id] ? 'ON' : '<span class="no">OFF</span>';
      else { const b = btnOf(a.id), d = b && byKey[b.dev], rk = (a.id === 'flare' || a.id === 'chaff') && !cfg.btns[a.id] && d && b.btn >= d.pad.buttons.length && axisOf('rocker');
        // (the HOTAS 4 has 12 buttons: its default FLARES / CHAFF are the throttle rocker, see poll())
        h = cfg.btns[a.id] === null ? '<span class="no">- UNBOUND -</span>' : !b ? '<span class="no">NO DEVICE</span>' : rk ? `${esc(d.short)} ROCKER ${a.id === 'flare' ? 'RIGHT' : 'LEFT'} <span class="def">(DEFAULT)</span>`
          : `${esc(byKey[b.dev]?.short || b.dev)} BTN ${b.btn + 1}${cfg.btns[a.id] ? '' : ' <span class="def">(DEFAULT)</span>'}`;
        r.l.classList.toggle('on', !!held[a.id]); r.bind.classList.toggle('busy', bindBtn?.id === a.id); }
      if (r.h !== h) r.b.innerHTML = r.h = h;
    }
    // device monitor: rebuild when the set of devices changes, otherwise just move the bars
    const sig = devs.map(d => `${d.key}/${d.role}/${d.pad.axes.length}/${d.pad.buttons.length}`).join('|');
    const boundTo = {}; for (const f of AXIS_FNS) { const b = axisOf(f.id); if (b && !b.trig) (boundTo[b.dev + ':' + b.axis] ||= []).push(f.label); }
    if (sig !== ui.sig) {
      ui.sig = sig;
      ui.devs.innerHTML = devs.length ? devs.map(d => `<div class="dev"><span class="t">#${d.index} ${esc(d.short)}</span> · ${d.role}${d.kind === 'hotas4' || d.role === 'pedals' ? '' : ' · ' + d.kind}<div class="axs">${Array.from(d.pad.axes, (v, i) => `<div class="ax"><span>A${i}</span><span class="br c"><i></i></span><span class="v"></span><em></em></div>`).join('')}</div>
<div class="dots">${Array.from(d.pad.buttons, (b, i) => `<b>${i + 1}</b>`).join('')}</div><div class="hat"></div><div class="def" style="font-size:10px;text-transform:none">${esc(d.id)}</div></div>`).join('')
        : '<div class="no">NO GAME CONTROLLERS SEEN. PLUG ONE IN AND PRESS A BUTTON ON IT.</div>';
      ui.devEls = Array.from(ui.devs.querySelectorAll('.dev'), el => ({ ax: Array.from(el.querySelectorAll('.ax'), a => ({ el: a, i: a.querySelector('i'), br: a.querySelector('.br'), v: a.querySelector('.v'), em: a.querySelector('em'), tag: null })), dots: Array.from(el.querySelectorAll('.dots b')), hat: el.querySelector('.hat') }));
    }
    devs.forEach((d, k) => {
      const E = ui.devEls[k]; if (!E) return; const ha = hatAx[d.key];
      E.ax.forEach((A, i) => {
        const v = d.pad.axes[i] ?? 0, isHat = i === ha, tag = isHat ? 'HAT' : (boundTo[d.key + ':' + i] || []).join(', ');
        if (A.tag !== tag) { A.tag = tag; A.em.textContent = tag; A.el.classList.toggle('on', !!tag && !isHat); }
        A.br.style.visibility = isHat ? 'hidden' : ''; if (!isHat) setBar(A.i, v, true); A.v.textContent = fmt(v);
      });
      E.dots.forEach((b, i) => b.classList.toggle('on', btnDown(d.pad.buttons[i])));
      const [hx, hy] = hatDir(d.pad.axes[ha ?? 9]), arrow = { '0,1': 'UP', '1,1': 'UP-RIGHT', '1,0': 'RIGHT', '1,-1': 'DOWN-RIGHT', '0,-1': 'DOWN', '-1,-1': 'DOWN-LEFT', '-1,0': 'LEFT', '-1,1': 'UP-LEFT' }[hx + ',' + hy];
      E.hat.textContent = ha !== undefined ? `HAT (AXIS ${ha}): ${arrow || 'CENTRE'}` : d.pad.mapping === 'standard' ? 'HAT = D-PAD (BUTTONS 13-16)' : '';
    });
    const o = [S.stick?.x ?? 0, S.stick?.y ?? 0, S.throttle ?? 0, S.rudder, S.twist, S.rocker, S.brakeL, S.brakeR];
    const cs = [1, 1, 0, 1, 1, 1, 0, 0];
    o.forEach((v, i) => { setBar(ui.outEls[i].i, v, cs[i]); ui.outEls[i].v.textContent = i === 2 && S.throttle === null ? 'NONE' : i === 3 ? fmt(v) + (S.hasPedals ? ' PEDALS' : ' TWIST') : fmt(v); });
    ui.outEls[8].v.textContent = `${S.hatX},${S.hatY}  ${cfg.lookhat ? '(LOOK)' : ''}`;
  }
  return C;
}
