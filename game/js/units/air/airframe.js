// Parametric fixed-wing airframe: the HORNET's flight model (jetfm.js) generalised so other aircraft can fly on it with
// their own numbers: the F-14A TOMCAT (variable sweep, TF30s, a mechanical stick with SAS), the RW-4 SHRIKE (a high-g
// fly-by-wire drone) and the MQ-9 REAPER (turboprop). Pure: three.js maths only, no DOM, no game imports; runs in node.
//
// The HORNET must stay bit-identical (tools/jetfingerprint.mjs hashes every state float over 12 scenarios): every
// expression below keeps the original evaluation order, and every new feature is either behind a parameter the Hornet
// does not set (if (P.x) ...) or multiplies by an exact 1 / adds an exact 0 for it.
//
// World scale (see jetfm.js): the air is 4x sea-level density (sound speed 170 m/s), so forces, g and EAS are real and
// true speeds are half. Frames: three.js axes for the airframe (x right, y up, nose -z), FRD body axes for the dynamics.
//
// A parameter set P (see jetfm.js HORNET_AF for the reference, units/air/tomcatfm.js, rwfm.js):
//   EMPTY, FUEL_MAX, GUN_MAX, S, B, C, I[3], TMIL, TAB, GEAR[3], K[3], DAMP[3], STROKE, HOOK_TIP, HULL, VNE_GEAR,
//   REST_H (CG height on the wheels), ENG_Y (thrust lever arm, m), NENG,
//   aero {...coefficients}, eng {...turbofan schedule}, fcs { law: 'ndi' | 'sas', ... },
//   mass(A), storeDrag(A), initStores(), and optional hooks:
//   config(A, h, M, mods) (wing sweep, vanes...), aeroAt(A) -> coefficients for this substep, hull(A) -> hull points,
//   flapLock(A) -> true when the flaps / slats are locked in, engineFn(A, h, ctl, M, mods) (replaces the turbofans),
//   engineHook(A, e, k, h, thr, M, mods) (after each turbofan update: compressor stalls).
import * as THREE from 'three';

export const ATM = { RHO0: 4.9, A0: 170, H: 6000, RHO_SL: 1.225 };
export const KT = 1.94384, FT = 3.28084, LB = 2.20462;
// carrier deck (local to the ship: x starboard, z aft, bow at -z): catapult track and arresting wires
export const DECKOPS = { CAT_X: -2.5, CAT_Z0: -6, CAT_Z1: -50, CAT_V: 38, LAND_X: -2.5, WIRES: [44, 39.5, 35, 30.5], RUNOUT: 26 };

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// the SAS stick-to-stabilator gearing: full authority below q0, falling off above it (the feel system)
export const sasGearing = (FC, qb) => clamp((FC.q0 / Math.max(qb, 1)) ** (FC.gexp ?? 1), FC.gmin, 1);
export function rhoAt(h) { return ATM.RHO0 * Math.exp(-Math.max(0, h) / ATM.H); }

// ------------------------------------------------------------------------------------------------- aero (coefficients K)
function clAttached(K, a, dcl) {
  const lin = K.CL0 + K.CLA * a + dcl, pk = K.CLMAX + 0.7 * dcl, nk = K.CLMIN;
  if (lin > 0.72 * pk) { const k0 = 0.72 * pk, r = pk - k0; return k0 + r * Math.tanh((lin - k0) / r); }
  if (lin < 0.72 * nk) { const k0 = 0.72 * nk, r = nk - k0; return k0 + r * Math.tanh((lin - k0) / r); }
  return lin;
}
// how far past the stall (0 attached .. 1 fully separated)
export const sepOf = (K, a, flap) => a >= 0 ? sstep(K.SEP0 - K.SEPF * flap, K.SEP1, a) : sstep(0.3, 0.6, -a);
export function aeroCoeffs(K, a, b, M, cfg, out = {}) {
  const s = sepOf(K, a, cfg.flap), dcl = K.DCL_FLAP * cfg.flap + K.DCL_LEF * cfg.lef, att = clAttached(K, a, dcl);
  out.sep = s;
  out.CL = (1 - s) * att + s * Math.sin(2 * a) + K.CLDE * cfg.stab * (1 - 0.5 * s);
  const wave = K.WAVE * sstep(K.MW0, K.MW1, M), sa = Math.sin(a), sb = Math.sin(b);
  out.CD = K.CD0 + wave + (1 - s) * K.KIND * att * att + s * (0.1 + 1.6 * sa * sa) + 0.5 * sb * sb
    + K.CD_GEAR * cfg.gear + K.CD_FLAP * cfg.flap ** 1.5 + K.CD_LEF * cfg.lef + K.CD_BRAKE * cfg.brake + K.CD_STORE * cfg.stores;
  out.CY = K.CYB * b + K.CYDR * cfg.rud;
  return out;
}
// moment coefficients without the controls (the FCS inverts these), then the control derivatives
function momentsBare(K, a, b, ph, qh, rh, s, cfg, o) {
  o.Cl = K.CLB * (1 + 1.5 * s) * b + K.CLP * (1 - 0.6 * s) * ph + K.CLR * rh;
  o.Cm = K.CM0 + K.CMA * Math.sin(a) * (1 + 0.6 * s) + K.CMQ * (1 - 0.3 * s) * qh - 0.05 * cfg.flap + 0.004 * cfg.gear + 0.01 * cfg.brake;
  o.Cn = K.CNB * (1 - 1.5 * s) * Math.sin(b) * Math.cos(a) + K.CNP * ph + K.CNR * (1 - 0.4 * s) * rh;
  return o;
}
const effDe = (K, s) => K.CMDE * (1 - 0.4 * s), effDa = (K, s) => K.CLDA * (1 - 0.5 * s), effDr = (K, s, a) => K.CNDR * (1 - 0.3 * s) * Math.max(0.2, Math.cos(a));

// ------------------------------------------------------------------------------------------------- sim
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3(), _r = new THREE.Vector3();
const _iq = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _l = new THREE.Vector3();
const _vb = new THREE.Vector3(), _ax = new THREE.Vector3();
const toF = (v3, out) => out.set(-v3.z, v3.x, -v3.y);          // three body -> FRD
const fromF = (vf, out) => out.set(vf.y, -vf.z, -vf.x);        // FRD -> three body
const NOMODS2 = { eng: [1, 1], hyd: 1, fcsOk: true, gearOk: true, hookOk: true };
const NOMODS1 = { eng: [1], hyd: 1, fcsOk: true, gearOk: true, hookOk: true };

export function createAirframe(P, GRAV = 9.0) {
  const NENG = P.NENG || 2, ENGS = Array.from({ length: NENG }, (_, k) => k), DK = P.DECK || DECKOPS, E = P.eng, FC = P.fcs;
  const A = {
    P, type: P.name,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(),   // w = (p, q, r) FRD
    eng: ENGS.map(() => ({ n: 0, ab: 0, egt: 20, run: false, start: 0, thrust: 0, ff: 0, nozzle: 0.8, oil: 0 })),
    fuel: P.FUEL_MAX, stores: P.initStores(), gun: P.GUN_MAX,
    surf: { stab: 0, ail: 0, rud: 0, flap: 0, lef: 0, brake: 0 },
    gear: 1, gearCmd: 1, hook: 0, hookCmd: 0, flapSel: 1, brakeCmd: 0, canopy: 0, canopyCmd: 0, cas: true, steer: 0,
    wow: [0, 0, 0], slip: [0, 0, 0], onGround: true, deck: null, cat: null, wire: null, launchBar: false, events: [],
    alpha: 0, beta: 0, tas: 0, eas: 0, mach: 0, qbar: 0, nz: 1, ny: 0, nzMax: 1, nzMin: 1, sep: 0, rho: ATM.RHO0, pa: true, limiter: false,
    I: P.I.slice(), catX: DK.CAT_X, landX: DK.LAND_X,
    // ------------------------------------------------------------------ helpers
    get mass() { return P.mass(A); },
    forward(out = new THREE.Vector3()) { return out.set(0, 0, -1).applyQuaternion(A.q); },
    up(out = new THREE.Vector3()) { return out.set(0, 1, 0).applyQuaternion(A.q); },
    heading() { A.forward(_f); return Math.atan2(_f.x, -_f.z); },
    attitude() { _e.setFromQuaternion(A.q, 'YXZ'); return { pitch: _e.x, roll: -_e.z, yaw: _e.y }; },   // roll + = right wing down
    worldPoint(local, out = new THREE.Vector3()) { return out.set(local[0], local[1], local[2]).applyQuaternion(A.q).add(A.pos); },
    totalThrust() { let T = 0; for (const e of A.eng) T += e.thrust; return T; },
    // put the jet on the ground (or a deck) at x,z with heading yaw; engines running or cold
    reset(x, groundY, z, yaw, { running = true, airborne = false, speed = 0, alt = 0 } = {}) {
      A.q.setFromEuler(_e.set(0, yaw, 0, 'YXZ'));
      A.pos.set(x, groundY + P.REST_H + alt, z); A.vel.set(-Math.sin(yaw) * speed, 0, -Math.cos(yaw) * speed); A.w.set(0, 0, 0);
      for (const e of A.eng) Object.assign(e, { n: running ? E.idle : 0, ab: 0, egt: running ? 420 : 20, run: running, start: 0 });
      Object.assign(A.surf, { stab: 0, ail: 0, rud: 0, flap: 0, lef: 0, brake: 0 });
      A.gear = A.gearCmd = airborne ? 0 : 1; A.hook = A.hookCmd = 0; A.flapSel = airborne ? 0 : 1; A.brakeCmd = 0; A.canopy = A.canopyCmd = 0;
      A.onGround = !airborne; A.cat = null; A.wire = null; A.launchBar = false; A.wow = [0, 0, 0]; A.nzMax = A.nzMin = 1; A.events.length = 0;
      A.trapWire = 0; A.dead = false; A.nInt = 0;
      if (P.onReset) P.onReset(A, airborne);
    },
    // ctl: { pitch (+aft), roll (+right), yaw (+right), throttle [per engine] 0..1, brakeL, brakeR 0..1 }
    // env: { groundY(x,z), water(x,z), surfVel(x,z) -> {vx,vz,w,cx,cz}|null, carrier() -> {x,z,yaw,vx,vz,w,deck}|null, mods }
    step(dt, ctl, env) {
      A.events.length = 0;
      const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
      tStep = 0;
      for (let i = 0; i < n && !A.dead; i++) { sub(h, ctl, env); tStep += h; }
      return A.events;
    },
  };
  const ev = (e, extra) => { A.events.push(extra ? { e, ...extra } : { e }); };
  A.ev = ev;

  // ------------------------------------------------------------------ engines (turbofans; P.engineFn replaces them)
  function engines(h, ctl, M, mods) {
    for (let k = 0; k < NENG; k++) {
      const e = A.eng[k], hp = mods.eng[k], thr = clamp(ctl.throttle[k], 0, 1);
      if (e.run && (A.fuel <= 0 || hp <= 0.02)) { e.run = false; ev('flameout', { k }); }
      let ncmd = 0, abCmd = 0;
      if (e.run) { ncmd = thr < E.thrMil ? E.idle + E.span * thr / E.thrMil : 1; abCmd = thr > E.thrAB ? (thr - E.thrAB) / E.abSpan : 0; ncmd = Math.min(ncmd, E.idle + E.span * Math.min(1, hp * 1.3)); }
      else if (e.start > 0) {   // starter cranks to 25%, fuel on, light-off, spool to idle
        e.start += h; ncmd = 0.3;
        if (e.n > 0.24 && A.fuel > 0 && hp > 0.05) { e.run = true; e.start = 0; ev('lightoff', { k }); }
        if (e.start > 20) e.start = 0;
      } else ncmd = Math.min(0.12, A.eas / 900);   // windmilling
      const up = e.run ? (e.n < E.idle ? E.upLo : E.upHi) : 0.07, dn = e.run ? E.dn : 0.06;
      e.n += clamp((ncmd - e.n) * 2.5, -dn, up) * h;
      if (E.abDelay) {   // afterburner zones light one after another (TF30: a second or more before full AB)
        if (e.run && abCmd > 0 && e.n > 0.97) { e.abT = (e.abT || 0) + h; if (e.abT < E.abDelay) abCmd = 0; } else { e.abT = 0; abCmd = 0; }
        if (abCmd > 0) e.ab += (abCmd - e.ab) * Math.min(1, E.abRate * h); else e.ab = Math.max(0, e.ab - 4 * h);
      } else if (e.run && abCmd > 0 && e.n > 0.97) e.ab += (abCmd - e.ab) * Math.min(1, 3 * h); else e.ab = Math.max(0, e.ab - 4 * h);
      const dry = Math.max(0, (e.n - 0.55) / 0.45) ** 2, sig = (A.rho / ATM.RHO0) ** 0.8, ram = 1 + 0.15 * M;
      if (E.ramAB) e.thrust = e.run || e.n > 0.5 ? (P.TMIL * dry * ram + (P.TAB - P.TMIL) * e.ab * (1 + E.ramAB * M)) * sig * Math.max(0.25, hp) : 0;   // afterburner thrust rising faster with ram
      else e.thrust = e.run || e.n > 0.5 ? (P.TMIL * dry + (P.TAB - P.TMIL) * e.ab) * sig * ram * Math.max(0.25, hp) : 0;
      e.ff = e.run ? E.ffIdle + E.ffMil * Math.max(0, (e.n - 0.6) / 0.4) ** 2 + E.ffAB * e.ab : 0;   // kg/s
      if (P.FUEL_X) e.ff *= P.FUEL_X;   // game fuel factor (AI sorties): 1 / unset = real
      A.fuel = Math.max(0, A.fuel - e.ff * h);
      const egtT = e.run ? 420 + 360 * clamp((e.n - 0.68) / 0.32, 0, 1) + 60 * e.ab + (1 - hp) * 180 + (mods.fire && mods.fire[k] ? 350 : 0) : 20 + 200 * e.n;
      e.egt += (egtT - e.egt) * Math.min(1, 1.2 * h);
      const nzT = e.ab > 0.01 ? 0.3 + 0.7 * e.ab : e.n < 0.68 ? 0.8 : 0.75 - 0.65 * clamp((e.n - 0.68) / 0.32, 0, 1);
      e.nozzle += (nzT - e.nozzle) * Math.min(1, 2 * h);
      e.oil = 25 * Math.min(1, e.n / 0.3) + 70 * clamp((e.n - 0.2) / 0.8, 0, 1);
      if (P.engineHook) P.engineHook(A, e, k, h, thr, M, mods);
    }
  }

  // ------------------------------------------------------------------ flight control system
  const _m = {}, _c = {}, _cfg = { stab: 0, rud: 0 };
  function fcs(h, ctl, mods, st, cfg, K) {
    const S = A.surf, { a, b, s, m } = st, V = Math.max(st.V, 12), qb = Math.max(st.qb, 0.5 * A.rho * 144), [Ixx, Iyy, Izz] = A.I, { S: Sw, B, C } = P;
    const att = A.attitude(), cth = Math.cos(att.pitch), p = A.w.x, q = A.w.y, r = A.w.z;
    let de, da, dr;
    const cas = A.cas && mods.fcsOk && !A.onGround; A.casActive = cas;   // stays engaged at any airspeed once airborne
    A.limiter = false;
    if (!cas) {   // DIRECT: stick and pedals straight to the surfaces (on the ground the CAS hands rotation to the pilot)
      de = ctl.pitch * K.LIM.stab; da = ctl.roll * K.LIM.ail; dr = ctl.yaw * K.LIM.rud;
      A.nInt = 0; A.aRef = a;
    } else if (FC.law === 'sas') {
      ({ de, da, dr } = sasLaw(h, ctl, st, K, att));
    } else {
      const pa = A.pa, nmax = pa ? FC.nmaxPA : FC.nmax, nmin = pa ? FC.nminPA : FC.nmin, alim = pa ? FC.alimPA : FC.alim;
      let ncmd = ctl.pitch >= 0 ? cth + ctl.pitch * (nmax - cth) : cth + -ctl.pitch * (nmin - cth);
      if (A.launchT > 0) { A.launchT -= h; if (Math.abs(ctl.pitch) < 0.3 && att.pitch < 0.21) ncmd += 0.35; }   // hands-off rotation off the cat (to ~12° nose up)
      A.nInt = clamp((A.nInt || 0) + (ncmd - A.nz) * 0.05 * h, -0.04, 0.04);
      const T = A.totalThrust(), clReq = (ncmd * m * GRAV - T * Math.sin(a)) / (qb * Sw);
      const dcl = K.DCL_FLAP * S.flap + K.DCL_LEF * S.lef;
      let acmd = (clReq - K.CL0 - dcl) / K.CLA + A.nInt;
      if (acmd > alim) { acmd = alim; A.limiter = ctl.pitch > 0.2; A.nInt = Math.min(A.nInt, 0); }
      if (acmd < -0.2) { acmd = -0.2; A.nInt = Math.max(A.nInt, 0); }
      // command model: the reference AoA moves smoothly (the stabilator is rate limited, a step demand overshoots)
      A.aRef = A.aRef === undefined ? a : A.aRef; A.aRef += clamp((acmd - A.aRef) * 5 * h, -0.9 * h, (A.aRef > alim - 0.12 ? 0.35 : 0.9) * h);   // slower into the limit
      // alpha-dot = q - flight-path rate, so q_ref = measured path rate + a first-order pull of alpha onto its reference
      const qss = clamp((A.nz - cth * Math.cos(att.roll)) * GRAV / V, -1.5, 1.5), qref = qss + 3 * (A.aRef - a);
      const qdot = clamp(4.5 * (qref - q), -4, 4), ph = p * B / (2 * V), qh = q * C / (2 * V), rh = r * B / (2 * V);
      momentsBare(K, a, b, ph, qh, rh, s, cfg, _m);
      de = (Iyy * qdot / (qb * Sw * C) - _m.Cm) / effDe(K, s);
      const sh = x => x * (0.35 + 0.65 * x * x), pmax = FC.pmax * (1 - 0.75 * s) * (pa ? 0.55 : 1);
      const pdot = 9 * (sh(ctl.roll) * pmax - p);
      da = (Ixx * pdot / (qb * Sw * B) - _m.Cl) / effDa(K, s);
      const rco = (p * Math.sin(a) + GRAV / V * cth * Math.sin(att.roll)) / Math.max(0.3, Math.cos(a));
      const rcmd = rco + 3 * (b - (-ctl.yaw * 0.12)), rdot = 6 * (rcmd - r);
      dr = (Izz * rdot / (qb * Sw * B) - _m.Cn - K.CNDA * clamp(da, -K.LIM.ail, K.LIM.ail)) / effDr(K, s, a);
    }
    // actuators: deflection and rate limits (slow on a damaged hydraulic system)
    const hk = mods.hyd > 0.3 ? 1 : 0.3, act = (cur, cmd, lim, rate) => cur + clamp(clamp(cmd, -lim, lim) - cur, -rate * hk * h, rate * hk * h);
    S.stab = act(S.stab, de, K.LIM.stab, K.RATE.stab); S.ail = act(S.ail, da, K.LIM.ail, K.RATE.ail); S.rud = act(S.rud, dr, K.LIM.rud, K.RATE.rud);
  }
  // Mechanical controls with stability augmentation (the F-14A's way): the stick moves the stabilator through a
  // gearing that falls off with dynamic pressure (the feel system), plus pitch / roll / yaw dampers, an aileron-rudder
  // interconnect that grows with AoA, and a trim the pilot sets (A.trim). No g or AoA limiter: the pilot (or the AI)
  // keeps the aircraft inside the envelope.
  function sasLaw(h, ctl, st, K, att) {
    const { a, b, V, qb } = st, p = A.w.x, q = A.w.y, r = A.w.z, cth = Math.cos(att.pitch);
    const g = sasGearing(FC, qb);   // stick-to-stab gearing (feel / bobweight)
    const de = (A.trim || 0) + ctl.pitch * K.LIM.stab * g + FC.kq * q * g;
    const da = ctl.roll * K.LIM.ail * clamp(FC.q0r / Math.max(qb, 1), FC.gminr, 1) - FC.kp * p;
    const rss = GRAV / Math.max(V, 12) * cth * Math.sin(att.roll) + p * Math.sin(a);   // turn-coordinated yaw rate
    const dr = ctl.yaw * K.LIM.rud - FC.kr * (r - rss) - FC.kb * b + FC.kari * clamp(a / 0.35, -0.3, 1) * da;
    return { de, da, dr };
  }

  // ------------------------------------------------------------------ one substep
  const _hp0 = new THREE.Vector3();
  const st = { a: 0, b: 0, V: 0, qb: 0, s: 0, m: 0 }, Fb = new THREE.Vector3(), Mb = new THREE.Vector3(), Fw = new THREE.Vector3(), Tw = new THREE.Vector3();
  function sub(h, ctl, env) {
    const mods = env.mods || (NENG === 1 ? NOMODS1 : NOMODS2), m = A.mass;
    A.rho = rhoAt(A.pos.y);
    // body-axis air velocity (no wind)
    _iq.copy(A.q).invert(); _v.copy(A.vel).applyQuaternion(_iq); toF(_v, _vb);
    const V = _vb.length(), a = V > 1 ? Math.atan2(_vb.z, _vb.x) : 0, b = V > 1 ? Math.asin(clamp(_vb.y / V, -1, 1)) : 0;
    const qb = 0.5 * A.rho * V * V, M = V / ATM.A0;
    Object.assign(st, { a, b, V, qb, m });
    A.alpha = a; A.beta = b; A.tas = V; A.qbar = qb; A.mach = M; A.eas = Math.sqrt(2 * qb / ATM.RHO_SL);

    // configuration: gear, hook, flaps (auto-retract above the gear speed), leading-edge flaps on AoA, speedbrake, canopy
    if (P.config) P.config(A, h, M, mods);
    if (!mods.gearOk && A.gearCmd === 1 && A.gear < 0.05) A.gearCmd = 0;
    A.gear = Math.abs(A.gearCmd - A.gear) < 0.2 * h ? A.gearCmd : A.gear + Math.sign(A.gearCmd - A.gear) * 0.2 * h;   // ~5 s cycle
    A.hook = clamp(A.hook + Math.sign((mods.hookOk ? A.hookCmd : 0) - A.hook) * h, 0, 1);
    let flapT = A.eas > P.VNE_GEAR ? 0 : [0, 0.5, 1][A.flapSel];
    A.pa = A.gear > 0.5 || A.flapSel > 0;
    let lefT = A.pa ? 0.85 : clamp((a - 0.04) / 0.4, 0, 1) * clamp(1.6 - M, 0, 1);
    if (P.flapLock && P.flapLock(A)) { flapT = 0; lefT = 0; }
    A.surf.flap += clamp(flapT - A.surf.flap, -0.3 * h, 0.3 * h);
    A.surf.lef += clamp(lefT - A.surf.lef, -0.8 * h, 0.8 * h);
    A.surf.brake += clamp((A.brakeCmd && !(A.onGround && A.eas < 30) ? 1 : 0) - A.surf.brake, -1.2 * h, 1.2 * h);
    A.canopy = clamp(A.canopy + Math.sign(A.canopyCmd - A.canopy) * 0.25 * h, 0, 1);

    if (P.engineFn) P.engineFn(A, h, ctl, M, mods); else engines(h, ctl, M, mods);
    // catapult: held on the shuttle, then a 2 g shot down the track (kinematic along the deck, the rest is simulated)
    if (A.cat) { catapult(h, ctl, env); return; }

    const K = P.aeroAt ? P.aeroAt(A) : P.aero;
    const S = A.surf, s = sepOf(K, a, S.flap); st.s = s; A.sep = s;
    const cfg = _cfg; Object.assign(cfg, { flap: S.flap, lef: S.lef, gear: A.gear, brake: S.brake, stores: P.storeDrag(A) });
    fcs(h, ctl, mods, st, cfg, K);
    cfg.stab = S.stab; cfg.rud = S.rud;
    aeroCoeffs(K, a, b, M, cfg, _c);
    // forces in FRD body axes: lift normal to the airflow in the symmetry plane, drag along it, side force
    Fb.set(0, 0, 0); Mb.set(0, 0, 0);
    if (V > 0.5) {
      const uw = Math.hypot(_vb.x, _vb.z) || 1, L = qb * P.S * _c.CL, Dg = qb * P.S * _c.CD, Y = qb * P.S * _c.CY;
      Fb.x += L * _vb.z / uw - Dg * _vb.x / V; Fb.y += Y - Dg * _vb.y / V; Fb.z += -L * _vb.x / uw - Dg * _vb.z / V;
      const { B, C } = P, ph = A.w.x * B / (2 * V), qh = A.w.y * C / (2 * V), rh = A.w.z * B / (2 * V);
      momentsBare(K, a, b, ph, qh, rh, s, cfg, _m);
      let Cn = _m.Cn + K.CNDA * S.ail + effDr(K, s, a) * S.rud;
      if (K.CNDA_A) Cn += K.CNDA_A * Math.max(0, a) * S.ail;   // spoiler / differential-tail adverse yaw that grows with AoA
      const Cl = _m.Cl + effDa(K, s) * S.ail + K.CLDR * S.rud, Cm = _m.Cm + effDe(K, s) * S.stab;
      Mb.set(qb * P.S * B * Cl, qb * P.S * C * Cm, qb * P.S * B * Cn);
    }
    if (NENG === 2) { const TL = A.eng[0].thrust, TR = A.eng[1].thrust; Fb.x += TL + TR; Mb.z += P.ENG_Y * (TL - TR); }
    else Fb.x += A.eng[0].thrust;
    // specific force (what an accelerometer feels) before gear and gravity: the g meter
    A.nz = -Fb.z / (m * GRAV); A.ny = Fb.y / (m * GRAV);
    // gear, hook and wire forces (world), converted into body torque
    Fw.set(0, 0, 0); Tw.set(0, 0, 0);
    A.hookTip(_hp0);
    const ground = gearForces(h, ctl, env, m);
    if (A.wire) wireForce(env, m);
    if (ground) A.nz += -toF(_t.copy(Fw).applyQuaternion(_iq), _r).z / (m * GRAV);
    // integrate: translation in world, rotation in body
    fromF(Fb, _f).applyQuaternion(A.q).add(Fw); _f.y -= m * GRAV;
    A.vel.addScaledVector(_f, h / m); A.pos.addScaledVector(A.vel, h);
    _t.copy(Tw).applyQuaternion(_iq); toF(_t, _r); Mb.add(_r);
    const [Ixx, Iyy, Izz] = A.I, p = A.w.x, q = A.w.y, r = A.w.z;
    A.w.x += (Mb.x + (Iyy - Izz) * q * r) / Ixx * h;
    A.w.y += (Mb.y + (Izz - Ixx) * p * r) / Iyy * h;
    A.w.z += (Mb.z + (Ixx - Iyy) * p * q) / Izz * h;
    fromF(A.w, _ax); const ang = _ax.length() * h;
    if (ang > 1e-9) { _dq.setFromAxisAngle(_ax.normalize(), ang); A.q.multiply(_dq).normalize(); }
    if (A.hook > 0.95 && !A.wire) A.checkWire(env, _hp0);
    if (!A.onGround) { A.nzMax = Math.max(A.nzMax, A.nz); A.nzMin = Math.min(A.nzMin, A.nz); }
    if (A.nz > P.N_OVER && !A.overT) { A.overT = true; ev('overstress', { g: A.nz }); } else if (A.nz < P.N_OVER - 1.5) A.overT = false;
    if (A.nz > P.N_BREAK) ev('breakup');
    hull(env);
  }

  // ------------------------------------------------------------------ undercarriage
  const _sv = new THREE.Vector3(), _wp = new THREE.Vector3(), _ow = new THREE.Vector3(), _pv = new THREE.Vector3();
  let tStep = 0;   // time into this frame step: a climbing deck (the SKY CARRIER) has moved on since groundY was sampled
  function groundAt(env, x, z) {
    const g = env.groundY(x, z); if (!tStep || !env.surfVel) return g;
    const sv = env.surfVel(x, z); return sv && sv.vy ? g + sv.vy * tStep : g;
  }
  function surfaceVel(env, x, z, out) {
    const sv = env.surfVel ? env.surfVel(x, z) : null;
    return sv ? out.set(sv.vx + sv.w * (z - sv.cz), sv.vy || 0, sv.vz - sv.w * (x - sv.cx)) : out.set(0, 0, 0);
  }
  function gearForces(h, ctl, env, m) {
    fromF(A.w, _ow).applyQuaternion(A.q);   // world angular velocity
    let any = false; const gearDown = A.gear > 0.98;
    const vg = Math.hypot(A.vel.x, A.vel.z);
    A.steer = clamp(ctl.yaw, -1, 1) * (0.1 + 0.95 * (1 - sstep(8, 22, A.tas))) * (A.cat ? 0 : 1);
    for (let i = 0; i < 3; i++) {
      const G = P.GEAR[i];
      _r.set(G[0], G[1], G[2]).applyQuaternion(A.q); _wp.copy(_r).add(A.pos);
      const gy = groundAt(env, _wp.x, _wp.z), pen = gy - _wp.y;
      if (!gearDown || pen <= 0) { A.wow[i] = Math.max(0, A.wow[i] - 2 * h); continue; }
      if (env.water && env.water(_wp.x, _wp.z)) { die('water'); return true; }
      any = true;
      _pv.copy(_ow).cross(_r).add(A.vel).sub(surfaceVel(env, _wp.x, _wp.z, _sv));
      if (pen > P.STROKE) { if (_pv.y < -3) { ev('gearcollapse'); die('crash'); return true; } }
      if (!A.onGround && _pv.y < -7.5) { ev('gearcollapse'); die('crash'); return true; }
      if (!A.onGround && _pv.y < -4.6 && !A.hardT) { A.hardT = 0.5; ev('hardland', { vy: _pv.y }); }
      const c = Math.min(pen, P.STROKE); A.wow[i] = c;
      let N = P.K[i] * c - P.DAMP[i] * _pv.y * (_pv.y < 0 ? 1 : 0.4);
      if (pen > P.STROKE) N += 4e6 * (pen - P.STROKE);
      N = Math.max(0, N);
      // tyre: rolling direction (nose wheel steered), lateral and longitudinal friction against the surface
      const st = i === 0 ? A.steer * 0.6 : 0;
      _d.set(Math.sin(st), 0, -Math.cos(st)).applyQuaternion(A.q); _d.y = 0; _d.normalize();
      _l.set(-_d.z, 0, _d.x);
      // TERRAIN (wave 3): env.surf(x, z) -> { mu, crr } (ground.js surfAt): a tyre on grass, sand or mud grips less and
      // rolls harder; decks and concrete (and the benches, with no env.surf) keep mu 0.85, rolling 0.02
      const sf = env.surf ? env.surf(_wp.x, _wp.z) : null, hard = !sf || sf.mu >= 0.8;
      const vlat = _pv.dot(_l), vlong = _pv.dot(_d), mu = hard ? 0.85 : sf.mu, crr = hard ? 0.02 : Math.max(0.02, sf.crr);
      const brk = i === 1 ? ctl.brakeL : i === 2 ? ctl.brakeR : 0;
      // friction is "deadbeat": each tyre pushes just hard enough to stop its slip this substep (its share of the mass
      // is N/g), capped by mu N. That gives real static friction (a braked jet holds still on a rolling deck).
      const mw = N / GRAV / h, flat = clamp(-vlat * mw * 0.5, -mu * N, mu * N);
      const bmax = 0.6 * clamp(brk, 0, 1) * N; A.slip[i] = bmax > 0 ? A.slip[i] + vlong * h : 0;   // braked: anchor the tyre
      const fb = -(vlong + A.slip[i] * 6) * mw * 0.5; if (Math.abs(fb) > bmax) A.slip[i] = 0;
      const flong = -crr * N * Math.tanh(vlong / 0.4) + clamp(fb, -bmax, bmax);
      _f.set(0, N, 0).addScaledVector(_l, flat).addScaledVector(_d, flong);
      Fw.add(_f); Tw.add(_t.copy(_r).cross(_f));
    }
    if (A.hardT) A.hardT -= h;
    if (any && !A.onGround) ev('touchdown', { vg });
    if (!any && A.onGround) ev('airborne');
    A.onGround = any;
    return any;
  }
  // airframe touching the ground: water = ditched, anything faster than a gentle scrape = crash
  function hull(env) {
    const HULL = P.hull ? P.hull(A) : P.HULL;
    for (const H of HULL) {
      A.worldPoint(H, _wp); const gy = groundAt(env, _wp.x, _wp.z);
      if (_wp.y >= gy) continue;
      if (env.water && env.water(_wp.x, _wp.z)) { die('water'); return; }
      const rel = surfaceVel(env, _wp.x, _wp.z, _sv).sub(A.vel).length();
      if (rel > 9 || gy - _wp.y > 0.6) { die('crash'); return; }
      A.pos.y += (gy - _wp.y); if (A.vel.y < 0) A.vel.y *= 0.3; ev('scrape');
    }
  }
  function die(why) { if (A.dead) return; A.dead = why; ev(why); }
  A.die = die;

  // ------------------------------------------------------------------ carrier: catapult and arresting gear
  const deckH = (c, x, z) => c.deckAt ? c.deckAt(x, z) : c.deck;   // the deck under (x, z): it heaves, pitches and rolls (NAVAL)
  function deckLocal(c, x, z) { const dx = x - c.x, dz = z - c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw); return [dx * co - dz * si, dx * si + dz * co]; }
  function deckWorld(c, lx, lz, out) { const co = Math.cos(c.yaw), si = Math.sin(c.yaw); return out.set(c.x + lx * co + lz * si, 0, c.z - lx * si + lz * co); }
  A.attachCat = env => {   // spot the jet on the catapult shuttle
    const c = env.carrier && env.carrier(); if (!c) return false;
    A.reset(0, 0, 0, c.yaw, { running: A.eng.some(e => e.run) });
    deckWorld(c, A.catX, DK.CAT_Z0, A.pos); A.pos.y = deckH(c, A.pos.x, A.pos.z) + P.REST_H;
    A.cat = { state: 'hold', t: 0, s: 0, v: 0 }; A.launchBar = true; A.flapSel = 1; A.onGround = true; return true;
  };
  function catapult(h, ctl, env) {
    const c = env.carrier && env.carrier(), C = A.cat;
    if (!c) { A.cat = null; return; }
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    if (C.state === 'hold') {
      const mil = A.eng.every(e => e.n > 0.965);
      C.t = mil && A.catClear !== false ? C.t + h : 0;   // the shooter only fires with open water ahead of the bow
      if (C.t > 1.6) { C.state = 'stroke'; ev('catshot'); }
    } else {
      const T = A.totalThrust(), stroke = DK.CAT_Z0 - DK.CAT_Z1;
      C.v += (DK.CAT_V ** 2 / (2 * stroke) + T / A.mass * 0.6) * h; C.s += C.v * h;
      A.nz = 1; A.nx = (DK.CAT_V ** 2 / (2 * stroke)) / GRAV;
    }
    deckWorld(c, A.catX, DK.CAT_Z0 - C.s, A.pos); A.pos.y = deckH(c, A.pos.x, A.pos.z) + P.REST_H - (C.state === 'hold' ? 0.12 : 0);
    // (ngc/bugsweep) on the shuttle the jet lies on the deck as it pitches and rolls (NAVAL / SEAWORLD's live sea, the heel
    // in a turn): held level on a deck rolled 2.5 deg, the low main gear was 0.3 m into the deck when the shot ended and the
    // first free step threw it off at 46 g (overstress, breakup) - every Tomcat launched while the carrier was heeling died
    const ca = c.att;
    A.q.setFromEuler(_e.set((C.state === 'hold' ? -0.012 : 0.0) + (ca ? ca.pitch : 0), c.yaw, ca ? ca.roll : 0, 'YXZ'));
    surfaceVel(env, A.pos.x, A.pos.z, A.vel); A.vel.x += fx * C.v; A.vel.z += fz * C.v;   // vy: the deck's (a flying carrier climbs)
    A.w.set(0, 0, 0); A.wow = [0.12, 0.13, 0.13]; A.onGround = true;
    A.surf.stab += clamp(P.CAT_STAB - A.surf.stab, -0.7 * h, 0.7 * h);   // trimmed nose-up for the rotation off the bow
    if (C.s >= DK.CAT_Z0 - DK.CAT_Z1) { A.cat = null; A.launchBar = false; A.onGround = false; A.w.y = 0.12; A.launchT = 2.5; ev('catend', { v: C.v }); }
  }
  // the hook tip crossing a wire near the deck catches it; the wire then pays out to stop the jet in ~26 m
  const _hk = new THREE.Vector3();
  A.hookTip = (out = _hk) => A.worldPoint(P.HOOK_TIP, out);
  A.checkWire = (env, prev) => {
    if (A.wire || A.hook < 0.95 || !env.carrier) return;
    const c = env.carrier(); if (!c) return;
    A.hookTip(_hk);
    const [lx, lz] = deckLocal(c, _hk.x, _hk.z), [, plz] = deckLocal(c, prev.x, prev.z), above = _hk.y - deckH(c, _hk.x, _hk.z);
    if (above > 0.45 || above < -1.5 || Math.abs(lx - A.landX) > 11) return;
    for (let k = 0; k < DK.WIRES.length; k++) {
      const wz = DK.WIRES[k];
      if (plz >= wz && lz < wz) {
        const rel = surfaceVel(env, A.pos.x, A.pos.z, _sv).sub(A.vel); rel.y = 0; const v = rel.length();
        if (v < 6) return;
        A.wire = { k: k + 1, a: v * v / (2 * DK.RUNOUT), held: 0 }; A.trapWire = k + 1; ev('trap', { wire: k + 1, v }); return;
      }
    }
  };
  function wireForce(env, m) {
    const W = A.wire;
    surfaceVel(env, A.pos.x, A.pos.z, _sv); _p.copy(A.vel).sub(_sv); _p.y = 0;
    const v = _p.length();
    // rolling out: constant deceleration that also soaks up the engines (pilots go to MIL on touchdown)
    if (v > 0.4) { const T = A.totalThrust() * Math.max(0, A.forward(_d).dot(_p) / v); Fw.addScaledVector(_p, -m * (W.a + T / m) / v); }
    else {   // stopped: the wire holds the jet against the engines until the throttles come back, then lets go
      W.held += 1 / 240; Fw.addScaledVector(_p, -m * 8);
      const T = A.totalThrust(); _f.copy(A.forward(_d)).multiplyScalar(-T); _f.y = 0; Fw.add(_f);
      if (W.held > 0.6 && A.eng.every(e => e.n < 0.8)) { A.wire = null; ev('wirefree'); }
    }
  }
  return A;
}
