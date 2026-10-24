// Lockheed C-130H Hercules flight model (flown in the game as a USMC KC-130R, a C-130H airframe). Pure: three.js maths
// only, no DOM, no game imports beyond the shared atmosphere, so it runs in node (tools/c130bench.mjs).
//
// World scale (same contract as the Hornet, jetfm.js): the air here is 4x sea-level density. Every force, moment,
// g-load and the airspeed indicator (dynamic pressure = equivalent airspeed) are the real aircraft's; true speeds are
// half (K_EQ = 2) and turn circles a quarter. The propellers, the slipstream and the rotary damping are computed in the
// "real-equivalent" frame (real density = 1.225 sigma, real TAS = 2 x world TAS), so a prop's thrust, power and blade
// angles, the roll rate and the short-period damping are what the real aeroplane has at the same indicated airspeed.
// Heights are not scaled. A world vertical speed is half the real one at the same climb gradient: tools report both.
//
// Number tags (every one is checked by tools/c130bench.mjs where it is a performance number):
//   CONFIRMED = published: "WIKI" Wikipedia C-130H spec box (USAF fact sheet, Frawley, Donald, Eden), "OPS" C-130H
//   operating limits card (baseops.net c130h1_Ops_Limits, from T.O. 1C-130H-1), "FM" FM 3-21.38 Pathfinder ops
//   (airdrop airspeeds), "LMSN" Lockheed Service News v26n3 (54H60 prop).
//   INFERRED = derived from those (back-solved or by standard methods: Roskam radii of gyration, DATCOM-style
//   derivatives) or tuned to hit a CONFIRMED number. UNVERIFIED = a sensible engineering guess with no source.
//
// Frames: three.js body axes for the airframe (x right, y up, nose -z, origin = CG on the fuselage centreline at the
// wing's quarter chord). Dynamics in body FRD (x fwd, y right, z down; p roll right, q pitch up, r yaw right).
//
// Per 1/240 s substep:
// - Aero: lift curve with a soft stall and flat-plate post-stall blend; Fowler flaps raise CL0 and CLmax; slipstream
//   lift from the propellers' thrust coefficient (power-on stall below power-off, roll towards a dead engine); drag
//   polar + flaps, gear, ramp and para doors; side force; linear stability derivatives that degrade past the stall
//   (a wing drops), buffet.
// - Four T56-A-15 turboprops driving four Hamilton Standard 54H60 props, each a shaft with inertia: engine torque
//   against prop torque from a three-station blade-element model with momentum inflow. The real control logic: in the
//   ALPHA range (power lever 34-90 deg) fuel follows the lever and the prop governor holds 100% rpm by blade angle, down
//   to the 23 deg low pitch stop; in the BETA range (0-34 deg, ground only) the lever sets blade angle directly down to
//   reverse and the fuel governor holds the rpm. Condition levers RUN / AIR START / GND STOP / FEATHER, feathering at
//   92.5 deg, a NTS (negative torque system) that coarsens a windmilling prop, autofeather, starts, TIT, torque, fuel flow.
// - Rigid body with C-130 mass and inertia; tricycle gear (tandem mains) with struts, tyre friction, brakes, nose wheel
//   steering; hull points (belly, tail, prop tips, wing tips) for scrapes, crashes and ditching.
import * as THREE from 'three';
import { ATM, rhoAt } from '../../jetfm.js';

export const KT = 1.94384, FT = 3.28084, LB = 2.20462, FPM = 196.85, INLB = 0.112985;
export const K_EQ = Math.sqrt(ATM.RHO0 / ATM.RHO_SL);   // real TAS / world TAS (2.0)
export const C130 = {
  // geometry CONFIRMED (WIKI): span 132 ft 7 in, length 97 ft 9 in, height 38 ft 3 in, wing area 1745 ft2
  SPAN: 40.41, LENGTH: 29.79, HEIGHT: 11.66, S: 162.1, B: 40.41,
  C: 4.16,                     // MAC m: INFERRED (164 in, from the planform: 4.88 m root, 2.74 m tip chord)
  // weights: empty 75,800 lb (WIKI CONFIRMED) + crew of 5, oil, trapped fuel, para equipment = 35,600 kg INFERRED;
  // max take-off 155,000 lb, max war-emergency 175,000 lb, normal landing 130,000 lb (OPS CONFIRMED)
  EMPTY: 35600, MTOW: 70307, FUEL_MAX: 20500,   // internal fuel 6,960 US gal JP-4 at 6.5 lb/gal: UNVERIFIED
  // inertia at 60 t: Roskam class (4-engine high-wing turboprop) radii of gyration Rx .25 Ry .38 Rz .45: INFERRED
  I60: [1.55e6, 1.95e6, 3.45e6],
  // engines (three body): T56 nacelle stations 190 in / 382 in from the centreline (UNVERIFIED), prop plane, axis height
  ENG_X: [-9.70, -4.84, 4.84, 9.70], ENG_Y: 1.30, PROP_Z: -4.6, THRUST_ARM: 0.5,   // thrust line ~0.5 m above the CG (INFERRED)
  // T56-A-15: 4,591 shp (WIKI CONFIRMED), 13,820 rpm = 100 % (Allison), prop 1,021 rpm (reduction 13.54:1) CONFIRMED (LMSN)
  SHP_MAX: 4591, ENG_RPM: 13820, PROP_RPM: 1021, EXHAUST_N: 3100,   // residual jet thrust ~700 lbf at max: INFERRED (4910 eshp - 4591 shp)
  // 54H60 prop: 4 blades, 13 ft 6 in (WIKI/LMSN CONFIRMED); feather 92.5 deg, reverse -5..-8 deg, low pitch stop
  // 23 deg (OPS CONFIRMED); blade chord, twist, inertia INFERRED
  PROP_R: 2.057, BLADES: 4, CHORD: 0.58, TWIST: 0.44, J_SHAFT: 260,
  BETA_FEATHER: 92.5, BETA_LPS: 23, BETA_REV: -6.5, BETA_GI: 7,
  // limits (OPS CONFIRMED): torque 19,600 in-lb, TIT 1083 C takeoff (5 min), 1010 C continuous, rpm 98-102 %
  TORQUE_MAX: 19600, TIT_MAX: 1083, TIT_CONT: 1010,
  // power lever quadrant (OPS CONFIRMED): reverse 0-18, ground idle 18, flight idle 34, alpha 34-90, beta 0-34 degrees
  Q_GI: 18, Q_FI: 34, Q_MAX: 90,
  // gear: wheel bottoms with the struts fully extended; tandem mains, track 14 ft 3 in, wheelbase 32 ft 1 in (CONFIRMED)
  GEAR: [[0, -2.75, -9.27], [-2.18, -2.72, -0.25], [2.18, -2.72, -0.25], [-2.18, -2.72, 1.25], [2.18, -2.72, 1.25]],
  K: [5.2e5, 1.25e6, 1.25e6, 1.25e6, 1.25e6], DAMP: [6.5e4, 1.4e5, 1.4e5, 1.4e5, 1.4e5], STROKE: [0.42, 0.32, 0.32, 0.32, 0.32],
  // airframe points that must never touch the ground: nose, belly, ramp hinge, tail cone, prop tips, wing tips, fin
  HULL: [[0, -0.4, -13.55], [0, -1.85, -9], [0, -1.85, -3], [0, -1.85, 3], [0, -1.6, 7.0], [0, -0.9, 10.8], [0, 0.1, 15.6],
    [-9.70, 1.30 - 2.06, -4.6], [-4.84, 1.30 - 2.06, -4.6], [4.84, 1.30 - 2.06, -4.6], [9.70, 1.30 - 2.06, -4.6],
    [-20.2, 2.75, 0.9], [20.2, 2.75, 0.9], [0, 9.0, 15.0]],
  // airspeed limits, KIAS (OPS CONFIRMED): flaps 50 % 180 (flaps: 230 - %), flaps 100 % 145, gear 165, para doors 185,
  // ramp and door 150, max bank 60 / 45 with flaps
  V_FLAP: f => 230 - 100 * f, V_FLAP100: 145, V_GEAR: 165, V_DOORS: 185, V_RAMP: 150,
  // para doors (left / right, three body) for the jumpers, and the ramp hinge
  DOOR: [[-2.02, -0.55, 7.15], [2.02, -0.55, 7.15]], RAMP_HINGE: [0, -1.45, 8.35],
};
const P = C130;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const D2R = Math.PI / 180;

// ------------------------------------------------------------------------------------------------- aero data
// Lift (body AoA): CL0 0.45 = wing incidence + camber of NACA 64A318 at fuselage AoA 0, CLA 5.0 /rad for AR 10.1
// (DATCOM, INFERRED). CLMAX power-off (flight-idle props) 2.0 / 2.45 / 2.8 at flaps 0 / 50 / 100 %: INFERRED from
// the OPS card (thunderstorm penetration 180 KIAS = power-off stall + 65 kt at 155,000 lb -> Vs ~115 KIAS clean) and
// the 105 KIAS landing speed at 122,000 lb with 100 % flaps (ASN 319167, ~1.2-1.25 Vs).
const CL0 = 0.45, CLA = 5.0, DCL_FLAP = 1.2, CLMIN = -1.0;
export const clmaxOf = f => f <= 0.5 ? 2.0 + 0.9 * f : 2.45 + 0.7 * (f - 0.5);
const KP_SLIP = 0.55;   // slipstream dCL per unit thrust coefficient: INFERRED (power-on stall ~10 % below power-off)
export const slipDcl = (Tc, flap) => KP_SLIP * (0.6 + 0.8 * flap) * Math.max(-0.1, Tc);
// Drag: CD0 0.031 back-solved from 320 KTAS at 20,000 ft (WIKI) with the prop model below (the C-130 is a draggy box:
// big nose, sponsons, upswept tail); induced K = 1/(pi A e), e 0.78, polar centred on CL 0.1; flaps, gear, ramp, doors INFERRED.
const CD0 = 0.031, KIND = 0.0404, CL_MIND = 0.1;
// Moments (per rad, rates non-dimensional on real-equivalent TAS): INFERRED from tail volumes (Vh 1.06 with the 49 m2 tailplane, Vv 0.09; elevator tau 0.55) and
// AR; static margin ~20 % MAC.
const CMA = -1.0, CMQ = -26, CMDE = 2.1, CM0 = 0.03, CM_FLAP = -0.10;
const CLB = -0.11, CLP = -0.50, CLR = 0.15, CLDA = 0.16, CLDR = 0.008;
const CNB = 0.10, CNP = -0.03, CNR = -0.20, CNDA = -0.008, CNDR = 0.085;
const CYB = -1.0, CYDR = -0.20;
// surfaces (rad): elevator +22/-15 deg, aileron +-20 deg, rudder +-35 deg; boosted rates (INFERRED); trim +-1 = +-8 deg
export const LIM = { eleUp: 0.38, eleDn: 0.26, ail: 0.35, rud: 0.61 }, RATE = { ele: 0.9, ail: 1.0, rud: 0.9 }, TRIM_E = 0.14;

function clAttached(a, f, dclp) {
  const lin = CL0 + CLA * a + DCL_FLAP * f + dclp, pk = clmaxOf(f) + 0.9 * dclp;
  if (lin > 0.8 * pk) { const k0 = 0.8 * pk, r = pk - k0; return k0 + r * Math.tanh((lin - k0) / r); }
  if (lin < 0.75 * CLMIN) { const k0 = 0.75 * CLMIN, r = CLMIN - k0; return k0 + r * Math.tanh((lin - k0) / r); }
  return lin;
}
// stalling AoA for a configuration (where the attached curve meets CLMAX), and separation 0..1 past it
export const aStallOf = (f, dclp = 0) => (clmaxOf(f) + 0.9 * dclp - CL0 - DCL_FLAP * f - dclp) / CLA;
const sepOf = (a, f, dclp) => { const as = aStallOf(f, dclp) + 0.03; return a >= 0 ? sstep(as, as + 0.16, a) : sstep(0.22, 0.45, -a); };
export function aeroCoeffs(a, b, cfg, out = {}) {
  const dclp = cfg.dclp || 0, s = sepOf(a, cfg.flap, dclp), att = clAttached(a, cfg.flap, dclp);
  out.sep = s; out.att = att;
  out.CL = (1 - s) * att + s * 1.15 * Math.sin(2 * a);
  const sa = Math.sin(a), sb = Math.sin(b), ci = att - CL_MIND;
  out.CD = CD0 + (1 - s) * KIND * ci * ci + s * (0.12 + 1.3 * sa * sa) + 0.6 * sb * sb
    + 0.010 * cfg.flap + 0.045 * cfg.flap * cfg.flap + 0.012 * cfg.gear + 0.014 * cfg.ramp + 0.0025 * (cfg.doorL + cfg.doorR);
  out.CY = CYB * b;
  return out;
}

// ------------------------------------------------------------------------------------------------- propeller
// Blade element at three stations (0.45, 0.70, 0.91 R over 0.325-1.0 R) with annulus momentum inflow, solved per
// station by bisection around last substep's value. beta is the blade angle at the 0.75 R reference station; twist is
// linear. The tip station carries a Prandtl tip-loss factor; the sections see helical-Mach drag rise (thin tips diverge
// past ~M 0.75). Real-equivalent density and axial speed. Returns thrust (N, + forward) and the torque the air puts on
// the shaft (N m, + resists rotation).
const ST = [0.45, 0.70, 0.9125], DRS = [0.25, 0.25, 0.175], TIPF = [1, 1, 0.8];
function clBlade(ab) {   // section lift: linear to 0.24 rad, then blends to a flat plate
  const s = sstep(0.24, 0.5, Math.abs(ab));
  return (1 - s) * 5.7 * clamp(ab, -0.32, 0.32) + s * 1.05 * Math.sin(2 * ab);
}
function cdBlade(ab, M) { const s = sstep(0.24, 0.5, Math.abs(ab)); return 0.015 + 0.25 * Math.min(ab * ab, 0.04) + s * 1.2 * Math.sin(ab) ** 2 + 0.09 * sstep(0.72, 0.98, M); }
const _el = { dT: 0, dQ: 0 };
function element(i, br, Va, v, Ut, rho, r, dr) {
  const Ua = Va + v, phi = Math.atan2(Ua, Ut), ab = br - phi, W2 = Ua * Ua + Ut * Ut;
  const cl = clBlade(ab) * TIPF[i], cd = cdBlade(ab, Math.sqrt(W2) / 340), qc = 0.5 * rho * W2 * P.CHORD * P.BLADES * dr;
  _el.dT = qc * (cl * Math.cos(phi) - cd * Math.sin(phi)); _el.dQ = qc * (cl * Math.sin(phi) + cd * Math.cos(phi)) * r;
  return _el;
}
export function propForces(betaDeg, Va, omega, rho, vi, out = {}) {
  const R = P.PROP_R; let T = 0, Q = 0;
  for (let i = 0; i < 3; i++) {
    const r = ST[i] * R, dr = DRS[i] * R, Ut = Math.max(0.5, omega * r), br = betaDeg * D2R + P.TWIST * (0.75 - ST[i]);
    const m = 4 * Math.PI * r * rho * dr;
    // momentum residual: blade-element thrust minus annulus momentum thrust; decreasing in v
    const res = v => element(i, br, Va, v, Ut, rho, r, dr).dT - m * Math.abs(Va + v) * v;
    const vmin = -0.45 * Math.max(Va, 15), vmax = 90;
    let lo = Math.max(vmin, vi[i] - 6), hi = Math.min(vmax, vi[i] + 6);
    if (res(lo) < 0) lo = vmin; if (res(hi) > 0) hi = vmax;
    for (let k = 0; k < 14; k++) { const mid = 0.5 * (lo + hi); if (res(mid) > 0) lo = mid; else hi = mid; }
    const v = 0.5 * (lo + hi); vi[i] = v;
    element(i, br, Va, v, Ut, rho, r, dr); T += _el.dT; Q += _el.dQ;
  }
  out.T = T; out.Q = Q; return out;
}

// ------------------------------------------------------------------------------------------------- sim
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3(), _l = new THREE.Vector3();
const _iq = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _e = new THREE.Euler(), _vb = new THREE.Vector3(), _ax = new THREE.Vector3();
const _wp = new THREE.Vector3(), _ow = new THREE.Vector3(), _pv = new THREE.Vector3(), _sv = new THREE.Vector3();
const toF = (v3, out) => out.set(-v3.z, v3.x, -v3.y);          // three body -> FRD
const fromF = (vf, out) => out.set(vf.y, -vf.z, -vf.x);        // FRD -> three body
const COND = ['feather', 'airstart', 'stop', 'run'];          // condition lever positions, forward = run (OPS order)

function newEngine(running) {
  return { cond: running ? 'run' : 'stop', run: running, N: running ? 1 : 0, beta: running ? P.BETA_LPS + 10 : P.BETA_FEATHER, shp: running ? 1500 : 0,
    tit: running ? 760 : 20, ff: 0, torque: 0, thrust: 0, Qa: 0, vi: [10, 10, 10], start: 0, fire: false, hp: 1, nts: false, autoFeathered: false,
    lever: 50, light: false, starter: false };
}

export function createC130Sim(GRAV = 9.80665) {
  const A = {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(),   // w = (p, q, r) FRD
    eng: [0, 1, 2, 3].map(() => newEngine(true)), fuel: 9000, payload: 1200,
    surf: { ele: 0, ail: 0, rud: 0 }, trim: 0, flap: 0, flapSel: 0, gear: 1, gearCmd: 1, ramp: 0, rampCmd: 0, door: [0, 0], doorCmd: [0, 0],
    autoFeatherArm: true, steer: 0, wow: [0, 0, 0, 0, 0], slip: [0, 0, 0, 0, 0], onGround: false, events: [], dead: false,
    alpha: 0, beta: 0, tas: 0, eas: 0, kias: 0, mach: 0, qbar: 0, nz: 1, ny: 0, sep: 0, buffet: 0, rho: ATM.RHO0, sigma: 1, Tc: 0,
    wind: null, tSim: 0, apState: { I: 0, It: 0, Ir: 0, thr: 0.5, lastT: 0 },
    // electrics and air for starting: battery, the GTC (gas turbine compressor, the C-130H's APU) and the bleed air
    // manifold (fed by the GTC or by any running engine); engines start on bleed air, fuel and ignition at 16 %
    battery: true, gtc: { cmd: false, N: 0 }, bleedValve: true,
    get bleed() { return A.bleedValve && (A.gtc.N > 0.95 || A.eng.some(e => e.run && e.N > 0.9)) ? 1 : 0; },
    // ---------------------------------------------------------------- helpers
    get mass() { return P.EMPTY + A.fuel + A.payload; },
    forward(out = new THREE.Vector3()) { return out.set(0, 0, -1).applyQuaternion(A.q); },
    up(out = new THREE.Vector3()) { return out.set(0, 1, 0).applyQuaternion(A.q); },
    right(out = new THREE.Vector3()) { return out.set(1, 0, 0).applyQuaternion(A.q); },
    attitude() { _e.setFromQuaternion(A.q, 'YXZ'); return { pitch: _e.x, roll: -_e.z, yaw: _e.y }; },   // roll + = right wing down
    worldPoint(local, out = new THREE.Vector3()) { return out.set(local[0], local[1], local[2]).applyQuaternion(A.q).add(A.pos); },
    totalThrust() { let t = 0; for (const e of A.eng) t += e.thrust; return t; },
    // ---- compatibility with the old MULE sim (drop.js, scenes): p, v, V, heading (0 = -z, right turn decreases), bank, pitch
    get p() { return A.pos; }, get v() { return A.vel; }, get V() { return A.tas; },
    get heading() { A.forward(_f); return Math.atan2(-_f.x, -_f.z); },
    get bank() { return A.attitude().roll; }, get pitch() { return A.attitude().pitch; },
    get stall() { return A.sep > 0.25; },
    get thr() { let s = 0; for (const e of A.eng) s += clamp((e.lever - P.Q_FI) / (P.Q_MAX - P.Q_FI), 0, 1); return s / 4; },
    get engines() { return A.eng.filter(e => e.run).length / 4; },
    // put it in the air at p (Vector3) heading yaw (drop.js convention) at a true airspeed; or on the ground
    reset(p, yaw, speed, o = {}) {
      A.q.setFromEuler(_e.set(o.pitch || 0, yaw, 0, 'YXZ')); A.pos.copy(p); A.w.set(0, 0, 0);
      A.vel.set(-Math.sin(yaw) * speed, 0, -Math.cos(yaw) * speed);
      const running = o.running !== false;
      A.eng.forEach(e => Object.assign(e, newEngine(running)));
      for (const e of A.eng) e.lever = o.lever ?? 60;
      A.flap = A.flapSel = o.flap ?? 0; A.gear = A.gearCmd = o.gear ?? 0; A.ramp = A.rampCmd = 0; A.door = [0, 0]; A.doorCmd = [0, 0];
      A.trim = o.trim ?? 0; A.surf.ele = A.surf.ail = A.surf.rud = 0;
      if (o.fuel !== undefined) A.fuel = o.fuel;
      A.onGround = false; A.wow.fill(0); A.slip.fill(0); A.dead = false; A.events.length = 0; A.nzMax = A.nzMin = 1;
      Object.assign(A.apState, { I: 0, It: 0, Ir: 0, thr: 0.5 });
      return A;
    },
    resetGround(x, gy, z, yaw, o = {}) {
      A.reset(new THREE.Vector3(x, gy + 2.62, z), yaw, 0, { ...o, gear: 1, lever: o.running === false ? P.Q_GI : P.Q_GI });
      A.onGround = true; for (const e of A.eng) e.lever = P.Q_GI;
      if (o.running === false) { for (const e of A.eng) Object.assign(e, newEngine(false)); A.battery = false; A.gtc.cmd = false; A.gtc.N = 0; }
      return A;
    },
    // ctl: { pitch (+aft), roll (+right), yaw (+right pedal) -1..1, lever: [4] power lever degrees 0..90 or
    //        throttle: [4] 0..1 (= flight idle .. max), brakeL, brakeR 0..1, tiller -1..1 (optional), trimRate -1..1 }
    // env: { groundY(x,z), water(x,z), wind? {x,z} }
    step(dt, ctl, env) {
      A.events.length = 0;
      const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
      for (let i = 0; i < n && !A.dead; i++) sub(h, ctl, env);
      return A.events;
    },
    setCond(k, c) { if (COND.includes(c)) A.eng[k].cond = c; },
    // engine start (T.O. 1C-130H-1 normal start, OPS card limits): condition lever RUN, the start button engages the
    // air turbine starter on bleed air; fuel and ignition at 16 %; light-off; TIT peaks under 830 C (normal start
    // 750-830); the starter drops out at 60 %; the fuel control accelerates it to ground idle (94-102 %)
    startEngine(k) {
      const e = A.eng[k];
      if (e.run || e.cond !== 'run' || e.start > 0) return false;
      if (!A.battery) { ev('nopower', { k }); return false; }
      if (!A.bleed) { ev('nobleed', { k }); return false; }
      e.start = 0.001; e.starter = true; e.peakTit = 0; ev('starter', { k }); return true;
    },
  };
  const ev = (e, extra) => { A.events.push(extra ? { e, ...extra } : { e }); };

  // ---------------------------------------------------------------- engines and propellers
  const _pf = {};
  function engines(h, ctl, Va, vRealTas) {
    const sig = A.sigma, rhoR = ATM.RHO_SL * sig, Mr = vRealTas / 340;
    // TIT-limited shaft power at this density and ram: lapses ~sigma^0.9 (INFERRED to match the 20,000 ft max speed)
    const shpTop = P.SHP_MAX * Math.pow(sig, 0.9) * (1 + 0.2 * Mr * Mr);
    const omega0 = P.PROP_RPM * 2 * Math.PI / 60;
    for (let k = 0; k < 4; k++) {
      const e = A.eng[k];
      let lever = ctl.lever ? ctl.lever[k] : P.Q_FI + clamp(ctl.throttle ? ctl.throttle[k] : 0.5, 0, 1) * (P.Q_MAX - P.Q_FI);
      if (!A.onGround) lever = Math.max(lever, P.Q_FI);   // the flight idle gate: no beta in the air
      e.lever = clamp(lever, 0, P.Q_MAX);
      const fuelOK = A.fuel > 0 && e.hp > 0.05;
      // condition lever: FEATHER = fuel off + feather pump; GND STOP = fuel off; AIR START = unfeather + ignition
      const wantFuel = (e.cond === 'run' || e.cond === 'airstart') && fuelOK;
      if (e.run && (!wantFuel || e.fire === 'out')) { e.run = false; e.starter = false; ev(e.cond === 'feather' ? 'shutdown' : 'flameout', { k }); }
      // starting: the starter turns it, fuel and ignition at 16 % (light-off), starter out at 60 %; a start that has not
      // reached 60 % in 60 s is a hung start and is aborted
      if (!e.run && wantFuel && e.cond === 'airstart' && e.N > 0.16) { e.run = true; e.start = 0; ev('lightoff', { k, N: e.N }); }
      if (e.start > 0) {
        e.start += h;
        if (!e.run && wantFuel && A.battery && e.N >= 0.16) { e.run = true; ev('lightoff', { k, N: e.N }); }
        if (e.starter && e.N >= 0.6) { e.starter = false; ev('starterout', { k, N: e.N }); }
        if (e.run) e.peakTit = Math.max(e.peakTit || 0, e.tit);
        if (e.run && e.N > 0.94 && !e.starter) { ev('onspeed', { k, t: e.start, peakTit: e.peakTit }); e.start = 0; }
        if (e.start > 60 || !wantFuel) { if (e.start > 60) ev('hungstart', { k }); e.start = 0; e.starter = false; if (e.N < 0.6) e.run = false; }
      }
      const accel = e.run && e.start > 0 && e.N < 0.94;   // accelerating after light-off: the fuel control's acceleration schedule
      const omega = Math.max(0, e.N * omega0);
      // ---- engine power (shaft hp at the prop)
      const feathering = e.cond === 'feather' || e.autoFeathered;
      let shpCmd;
      if (e.run) {
        if (e.lever >= P.Q_FI) {   // ALPHA: fuel scheduled by the lever (flight idle ~350 shp .. TIT limit), underspeed governor
          const x = (e.lever - P.Q_FI) / (P.Q_MAX - P.Q_FI);
          shpCmd = 350 + (shpTop - 350) * Math.pow(x, 1.15);
          if (e.N < 0.97) shpCmd = Math.max(shpCmd, Math.min(shpTop, shpCmd + (0.985 - e.N) * 60000));
          if (e.N > 1.04) shpCmd *= 0.5;
        } else {                   // BETA: the fuel governor holds 100 % whatever the blades absorb
          e.shpGov = clamp((e.shpGov ?? 800) + ((1.0 - e.N) * 60000 - (e.Ndot || 0) * 20000) * h, 0, shpTop);
          shpCmd = clamp(e.shpGov + (1.0 - e.N) * 20000, 0, shpTop);
        }
        if (accel) { const lim = 40 + 700 * ((e.N - 0.16) / 0.78) ** 2; shpCmd = Math.min(shpCmd, lim); e.shpGov = Math.min(e.shpGov ?? lim, lim); }
        shpCmd *= Math.max(0.3, e.hp);
        // the T56 is a constant-speed engine: power follows the fuel in ~0.4 s, slew limited (idle -> max ~1.5 s)
        e.shpCmd = shpCmd;
        e.shp += clamp((shpCmd - e.shp) * Math.min(1, h / 0.4), -4000 * h, 3000 * h);
      } else {
        e.shp = 0;
      }
      // starter (air turbine) and the dead engine's drag (compressor windmilling, ~2,200 hp at 100 %: INFERRED)
      let Qeng = e.run ? e.shp * 745.7 / Math.max(omega, omega0 * 0.3) : -15400 * e.N * e.N - 300 * Math.sign(e.N);
      if (!e.run && e.start > 0) Qeng = -1500 * e.N * e.N;   // cranking: the compressor's drag is small at low rpm
      e.torque = (Qeng * omega) / 745.7 * 63025 / Math.max(1, e.N * P.ENG_RPM);   // engine-side in-lb (torquemeter)
      if (e.start > 0 && e.N < 0.6) e.torque = Math.max(0, e.torque);
      if (e.starter) Qeng += 1700 * A.bleed * Math.max(0, 1 - e.N / 0.8);   // the air turbine starter (~95 N m at the engine, x13.54 through the reduction gear: INFERRED)
      // ---- blade angle
      // pitch change: feather pump ~18 deg/s, governor / beta ~14-25 deg/s (INFERRED: 23 -> 92.5 deg in ~4 s)
      let bRate = 0;
      if (feathering) bRate = 18;
      else if (e.lever < P.Q_FI && A.onGround) {   // BETA: blade angle straight from the lever
        const bCmd = e.lever <= P.Q_GI ? P.BETA_REV + (P.BETA_GI - P.BETA_REV) * e.lever / P.Q_GI : P.BETA_GI + (P.BETA_LPS - P.BETA_GI) * (e.lever - P.Q_GI) / (P.Q_FI - P.Q_GI);
        bRate = clamp((bCmd - e.beta) * 8, -25, 25);
      } else if (e.N > 0.05 || e.run || e.cond === 'airstart') {   // ALPHA: governor on rpm, not finer than the low pitch stop
        // governor + throttle anticipation (the coordinator feeds power lever motion to the prop: blade angle leads the
        // engine's power change instead of waiting for an rpm error)
        const ant = e.run ? clamp(((e.shpCmd ?? e.shp) - e.shp) * 0.006, -12, 12) : 0;
        bRate = clamp((e.N - 1.0) * 300 + (e.Ndot || 0) * 60 + ant, -20, 20);
        // NTS: a windmilling prop driving the engine (negative torque past -1,260 in-lb) is coarsened
        e.nts = !e.run && e.torque < -1260 && e.N > 0.2;
        if (e.nts) bRate = Math.max(bRate, 10);
        if (e.cond === 'airstart' && !e.run && e.beta > P.BETA_LPS + 1) { bRate = -14; e.nts = false; }   // unfeather
        if (e.beta + bRate * h < P.BETA_LPS && !e.nts) bRate = (P.BETA_LPS - e.beta) / h * 0.5;
      }
      e.beta = clamp(e.beta + bRate * h, P.BETA_REV - 1, P.BETA_FEATHER);
      // autofeather (armed, lever above 60 deg = takeoff power): feathers a prop whose torque collapses
      if (A.autoFeatherArm && !e.autoFeathered && e.lever > 60 && !e.run && e.N > 0.3 && e.cond !== 'feather' && e.wasRun) { e.autoFeathered = true; ev('autofeather', { k }); }
      if (e.cond === 'airstart' || (e.run && e.cond === 'run')) e.autoFeathered = false;
      e.wasRun = e.run;
      // ---- prop aerodynamics and the shaft
      propForces(e.beta, Va, omega, rhoR, e.vi, _pf);
      const Qa = _pf.Q, J = P.J_SHAFT;
      const Ndot = (Qeng - Qa - 400 * e.N) / J / omega0;
      e.Ndot = Ndot; e.N = Math.max(0, e.N + Ndot * h);
      if (feathering && e.beta > 85 && e.N < 0.02) e.N = 0;
      e.Qa = Qa; e.thrust = _pf.T + (e.run ? P.EXHAUST_N * e.shp / P.SHP_MAX : 0);
      // ---- gauges: TIT, fuel flow
      const titT = e.run ? (accel ? 690 + 120 * clamp(1 - (e.N - 0.16) / 0.7, 0, 1) : 560 + 523 * Math.pow(clamp(e.shp / shpTop, 0, 1.2), 0.9)) + (e.fire ? 300 : 0) + (1 - e.hp) * 150
        : 20 + 120 * e.N;
      e.tit += (titT - e.tit) * Math.min(1, h * 1.5);
      e.ff = e.run ? 600 * e.N + 0.36 * e.shp : 0;   // lb/h: ~2,150 at take-off torque (INFERRED from T56 sfc ~0.5)
      A.fuel = Math.max(0, A.fuel - e.ff / LB / 3600 * h);
    }
  }

  // ---------------------------------------------------------------- one substep
  const st = { V: 0 }, Fb = new THREE.Vector3(), Mb = new THREE.Vector3(), Fw = new THREE.Vector3(), Tw = new THREE.Vector3(), _c = {}, cfg = { flap: 0, gear: 0, ramp: 0, doorL: 0, doorR: 0, dclp: 0 };
  function sub(h, ctl, env) {
    const m = A.mass, km = m / 60000, I = [P.I60[0] * (0.6 + 0.4 * km), P.I60[1] * (0.6 + 0.4 * km), P.I60[2] * (0.6 + 0.4 * km)];
    A.rho = rhoAt(A.pos.y); A.sigma = A.rho / ATM.RHO0;
    const G = A.gtc; G.N = clamp(G.N + (G.cmd && A.battery && A.fuel > 0 ? h / 22 : -h / 12), 0, 1);   // GTC: ~20 s to on-speed
    // air velocity in FRD body axes (wind: env.wind = {x, z} world m/s)
    _v.copy(A.vel); const wnd = env.wind || A.wind; if (wnd) { _v.x -= wnd.x; _v.z -= wnd.z; }
    _iq.copy(A.q).invert(); _v.applyQuaternion(_iq); toF(_v, _vb);
    const V = _vb.length(), a = V > 1 ? Math.atan2(_vb.z, _vb.x) : 0, b = V > 1 ? Math.asin(clamp(_vb.y / V, -1, 1)) : 0;
    const qb = 0.5 * A.rho * V * V, Vr = V * K_EQ;
    A.alpha = a; A.beta = b; A.tas = V; A.qbar = qb; A.eas = Math.sqrt(2 * qb / ATM.RHO_SL); A.kias = A.eas * KT; A.mach = Vr / 340;
    // configuration: flaps (~8 %/s; blown back above the limit), gear (~16 s cycle), ramp (~12 s), para doors (~3 s)
    const fT = A.flapSel; A.flap += clamp(fT - A.flap, -0.08 * h, 0.08 * h);
    A.gear += clamp(A.gearCmd - A.gear, -h / 16, h / 16);
    A.ramp += clamp(A.rampCmd - A.ramp, -h / 12, h / 12);
    for (let i = 0; i < 2; i++) A.door[i] += clamp(A.doorCmd[i] - A.door[i], -h / 3, h / 3);
    A.trim = clamp(A.trim + clamp(ctl.trimRate || 0, -1, 1) * 0.12 * h, -1, 1);
    // controls: boosted surfaces, deflection and rate limited
    const act = (cur, cmd, lo, hi, rate) => cur + clamp(clamp(cmd, -lo, hi) - cur, -rate * h, rate * h);
    const pc = clamp(ctl.pitch || 0, -1, 1);
    A.surf.ele = act(A.surf.ele, pc >= 0 ? pc * LIM.eleUp : pc * LIM.eleDn, LIM.eleDn, LIM.eleUp, RATE.ele);
    A.surf.ail = act(A.surf.ail, clamp(ctl.roll || 0, -1, 1) * LIM.ail, LIM.ail, LIM.ail, RATE.ail);
    A.surf.rud = act(A.surf.rud, clamp(ctl.yaw || 0, -1, 1) * LIM.rud, LIM.rud, LIM.rud, RATE.rud);
    // propellers see the axial airspeed (real-equivalent)
    const Va = Math.max(0, _vb.x) * K_EQ;
    engines(h, ctl, Va, Vr);
    // slipstream: thrust coefficient (real thrust over real q S), lift from the blown wing, per engine for the roll
    let Tsum = 0, Lmom = 0; for (let k = 0; k < 4; k++) Tsum += A.eng[k].thrust;
    const qbS = Math.max(qb, 200) * P.S, Tc = clamp(Tsum / qbS, -0.3, 1.6); A.Tc = Tc;
    const slipK = KP_SLIP * (0.6 + 0.8 * A.flap);   // = slipDcl per unit Tc
    cfg.flap = A.flap; cfg.gear = A.gear; cfg.ramp = A.ramp; cfg.doorL = A.door[0]; cfg.doorR = A.door[1]; cfg.dclp = slipK * Math.max(-0.1, Tc);
    aeroCoeffs(a, b, cfg, _c); const s = _c.sep; A.sep = s;
    A.buffet = clamp(sstep(0.86, 1.0, _c.att / (clmaxOf(A.flap) + 0.9 * cfg.dclp)) * 0.6 + s, 0, 1) * sstep(20, 40, A.eas);
    Fb.set(0, 0, 0); Mb.set(0, 0, 0);
    if (V > 0.5) {
      const uw = Math.hypot(_vb.x, _vb.z) || 1, L = qb * P.S * _c.CL, Dg = qb * P.S * _c.CD;
      const Y = qb * P.S * (_c.CY + CYDR * A.surf.rud);
      Fb.x += L * _vb.z / uw - Dg * _vb.x / V; Fb.y += Y - Dg * _vb.y / V; Fb.z += -L * _vb.x / uw - Dg * _vb.z / V;
      const VrM = Math.max(Vr, 20), ph = A.w.x * P.B / (2 * VrM), qh = A.w.y * P.C / (2 * VrM), rh = A.w.z * P.B / (2 * VrM);
      const tail = 1 + 0.25 * clamp(Tc, 0, 1.2);   // prop wash over the tail at high power, low speed
      // stall: the wing that is further past the stall drops (sideslip and roll rate pick the side), and the
      // directional stability fades
      const drop = s * (0.025 * Math.tanh(b * 25 + ph * 40) + 0.01 * Math.sin(A.tSim * 1.7));
      const Cl = CLB * (1 + s) * b + CLP * (1 - 0.6 * s) * ph + CLR * rh + CLDA * (1 - 0.5 * s) * A.surf.ail + CLDR * A.surf.rud + drop;
      // past the stall the wing's centre of pressure moves aft and the tail runs out of authority: the nose drops
      const Cm = CM0 + CMA * Math.sin(a) * (1 + 0.4 * s) + CMQ * qh + CMDE * tail * (1 - 0.5 * s) * (A.surf.ele + TRIM_E * A.trim) + CM_FLAP * A.flap + 0.006 * A.gear - 0.22 * s;
      const Cn = CNB * (1 - 0.7 * s) * Math.sin(b) + CNP * ph + CNR * rh + CNDA * A.surf.ail + CNDR * tail * A.surf.rud;
      Mb.set(qb * P.S * P.B * Cl, qb * P.S * P.C * Cm, qb * P.S * P.B * Cn);
    }
    // thrust: along the body axis, its line above the CG; asymmetric thrust yaws, asymmetric slipstream rolls
    for (let k = 0; k < 4; k++) {
      const T = A.eng[k].thrust, y = P.ENG_X[k];
      Fb.x += T; Mb.z += -T * y; Mb.y += -T * P.THRUST_ARM;
      const dL = slipK * T / 4 * 0.6;   // the blown span behind each prop carries its share of the slipstream lift
      Lmom += -dL * y;
    }
    Mb.x += Lmom;
    // specific force (accelerometer) before gear and gravity
    A.nz = -Fb.z / (m * GRAV); A.ny = Fb.y / (m * GRAV);
    // gear (world forces -> body torque)
    Fw.set(0, 0, 0); Tw.set(0, 0, 0);
    const ground = gearForces(h, ctl, env, m);
    if (ground) A.nz += -toF(_t.copy(Fw).applyQuaternion(_iq), _r).z / (m * GRAV);
    // integrate: translation in world, rotation in body
    fromF(Fb, _f).applyQuaternion(A.q).add(Fw); _f.y -= m * GRAV;
    A.vel.addScaledVector(_f, h / m); A.pos.addScaledVector(A.vel, h);
    _t.copy(Tw).applyQuaternion(_iq); toF(_t, _r); Mb.add(_r);
    const p = A.w.x, q = A.w.y, r = A.w.z;
    A.w.x += (Mb.x + (I[1] - I[2]) * q * r) / I[0] * h;
    A.w.y += (Mb.y + (I[2] - I[0]) * p * r) / I[1] * h;
    A.w.z += (Mb.z + (I[0] - I[1]) * p * q) / I[2] * h;
    fromF(A.w, _ax); const ang = _ax.length() * h;
    if (ang > 1e-9) { _dq.setFromAxisAngle(_ax.normalize(), ang); A.q.multiply(_dq).normalize(); }
    A.tSim = (A.tSim || 0) + h;
    if (!A.onGround) { A.nzMax = Math.max(A.nzMax ?? 1, A.nz); A.nzMin = Math.min(A.nzMin ?? 1, A.nz); }
    if (A.nz > 3.0 && !A.overT) { A.overT = true; ev('overstress', { g: A.nz }); } else if (A.nz < 2.5) A.overT = false;   // C-130H limit load +3.0 g (INFERRED)
    hull(env);
  }

  // ---------------------------------------------------------------- undercarriage
  function gearForces(h, ctl, env, m) {
    fromF(A.w, _ow).applyQuaternion(A.q);   // world angular velocity
    let any = false; const gearDown = A.gear > 0.98;
    const vg = Math.hypot(A.vel.x, A.vel.z);
    // nose wheel steering: the tiller (+-60 deg) or the pedals (+-5 deg) (C-130: tiller on the pilot's side)
    const til = ctl.tiller !== undefined ? clamp(ctl.tiller, -1, 1) : 0;
    A.steer = clamp(til * 1.05 + clamp(ctl.yaw || 0, -1, 1) * 0.09 * (til === 0 ? 1 + 3 * (1 - sstep(4, 12, vg)) : 1), -1.05, 1.05);
    for (let i = 0; i < 5; i++) {
      const G = P.GEAR[i];
      _r.set(G[0], G[1], G[2]).applyQuaternion(A.q); _wp.copy(_r).add(A.pos);
      const gy = env.groundY(_wp.x, _wp.z), pen = gy - _wp.y;
      if (!gearDown || pen <= 0) { A.wow[i] = Math.max(0, A.wow[i] - 2 * h); continue; }
      if (env.water && env.water(_wp.x, _wp.z) && gy <= 0.5) { die('ditch'); return true; }
      any = true;
      _pv.copy(_ow).cross(_r).add(A.vel);
      if (pen > P.STROKE[i] && _pv.y < -3.5) { ev('gearcollapse'); die('crash'); return true; }
      if (!A.onGround && _pv.y < -5) { ev('gearcollapse'); die('crash'); return true; }   // ~1,000 fpm real-equivalent design sink
      if (!A.onGround && _pv.y < -3.0 && !A.hardT) { A.hardT = 0.5; ev('hardland', { vy: _pv.y }); }
      const c = Math.min(pen, P.STROKE[i]); A.wow[i] = c;
      let N = P.K[i] * c - P.DAMP[i] * _pv.y * (_pv.y < 0 ? 1 : 0.4);
      if (pen > P.STROKE[i]) N += 2e7 * (pen - P.STROKE[i]);
      N = Math.max(0, N);
      const st = i === 0 ? A.steer : 0;
      _d.set(Math.sin(st), 0, -Math.cos(st)).applyQuaternion(A.q); _d.y = 0; _d.normalize();
      _l.set(-_d.z, 0, _d.x);
      const vlat = _pv.dot(_l), vlong = _pv.dot(_d), mu = 0.8;
      const brk = i === 1 || i === 3 ? ctl.brakeL || 0 : i === 2 || i === 4 ? ctl.brakeR || 0 : 0;
      // deadbeat friction (see jetfm.js): each tyre pushes just hard enough to stop its slip, capped by mu N
      const mw = N / GRAV / h, flat = clamp(-vlat * mw * 0.5, -mu * N, mu * N);
      const bmax = 0.42 * clamp(brk, 0, 1) * N;   // anti-skid, effective mu ~0.42 (INFERRED) A.slip[i] = bmax > 0 ? A.slip[i] + vlong * h : 0;
      const fb = -(vlong + A.slip[i] * 6) * mw * 0.5; if (Math.abs(fb) > bmax) A.slip[i] = 0;
      const flong = -0.015 * N * Math.tanh(vlong / 0.4) + clamp(fb, -bmax, bmax);
      _f.set(0, N, 0).addScaledVector(_l, flat).addScaledVector(_d, flong);
      Fw.add(_f); Tw.add(_t.copy(_r).cross(_f));
    }
    if (A.hardT) A.hardT = Math.max(0, A.hardT - h);
    if (any && !A.onGround) ev('touchdown', { vg, vy: A.vel.y });
    if (!any && A.onGround) ev('airborne');
    A.onGround = any;
    return any;
  }
  function hull(env) {
    for (let i = 0; i < P.HULL.length; i++) {
      const H = P.HULL[i];
      A.worldPoint(H, _wp); const gy = env.groundY(_wp.x, _wp.z);
      if (_wp.y >= gy) continue;
      if (env.water && env.water(_wp.x, _wp.z) && gy <= 0.5) { die(A.tas < 40 && Math.abs(A.vel.y) < 3 ? 'ditch' : 'crash'); return; }
      const rel = A.vel.length();
      if (i >= 7 && i <= 10 && A.eng[i - 7].N > 0.1) { ev('propstrike', { k: i - 7 }); A.eng[i - 7].hp = 0; }
      if (rel > 12 || gy - _wp.y > 0.8) { die('crash'); return; }
      A.pos.y += (gy - _wp.y); if (A.vel.y < 0) A.vel.y *= 0.3; ev('scrape', { i });
    }
  }
  function die(why) { if (A.dead) return; A.dead = why; ev(why); }

  // ---------------------------------------------------------------- autopilot
  // Flies the same controls a pilot does. cmd: { track (rad, heading convention), alt (m), kias, bankMax (rad) }
  // returns { pitch, roll, yaw, throttle: [4], trimRate }. Heading by bank, altitude by pitch attitude on a vertical
  // speed loop (the elevator integral is bled into the trim wheel), airspeed by the four power levers (torque limited),
  // sideslip and engine-out by the rudder.
  const angDiff = (x, y) => { let d = (y - x) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
  A.track = () => Math.atan2(-A.vel.x, -A.vel.z);
  A.autopilot = (dt, cmd) => {
    const S = A.apState, att = A.attitude(), V = Math.max(A.tas, 10);
    // lateral: bank towards the track (ground track: crabs into a crosswind by itself)
    const e = angDiff(Math.hypot(A.vel.x, A.vel.z) > 5 ? A.track() : A.heading, cmd.track);
    const bmax = cmd.bankMax ?? (A.flap > 0.2 ? 0.44 : 0.52);
    const bankWant = clamp(-e * 2.2, -bmax, bmax);
    const roll = clamp((bankWant - att.roll) * 2.4 - A.w.x * 1.6, -1, 1);
    // vertical: vertical speed from the height error, pitch attitude from the vertical speed error
    const vsMax = cmd.vsMax ?? 5;
    // FLC (flight level change, cmd.flc): the climb or descent is flown on the yoke for the airspeed, the power stays put
    let vsW = clamp((cmd.alt - A.pos.y) * 0.22, -vsMax, vsMax);
    const kdot = (A.kias - (S.kPrev ?? A.kias)) / Math.max(dt, 1e-3); S.kPrev = A.kias; S.kDot = (S.kDot ?? 0) + (kdot - (S.kDot ?? 0)) * Math.min(1, dt * 2);
    if (cmd.flc && Math.abs(cmd.alt - A.pos.y) > 40) {
      S.vsF = clamp((S.vsF ?? A.vel.y) + (A.kias - cmd.kias) * 0.04 * dt, -vsMax, vsMax);
      const vsS = clamp(S.vsF + (A.kias - cmd.kias) * 0.18 + S.kDot * 0.8, -vsMax, vsMax);
      vsW = Math.sign(cmd.alt - A.pos.y) > 0 ? Math.min(vsW, Math.max(0.3, vsS)) : Math.max(vsW, Math.min(-0.3, vsS));
    } else S.vsF = A.vel.y;
    const vsWant = vsW, vsErr = vsWant - A.vel.y;
    const gamWant = Math.asin(clamp(vsWant / V, -0.3, 0.3));
    S.I = clamp(S.I + vsErr * 0.004 * dt, -0.15, 0.15);
    const thWant = gamWant + clamp(A.alpha, -0.1, 0.25) * 0.9 + S.I + vsErr * 0.012;
    const qWant = clamp((thWant - att.pitch) * 1.2, -0.12, 0.12) + (1 / Math.max(0.5, Math.cos(att.roll)) - 1) * 9.8 / V * Math.sin(Math.abs(att.roll));
    S.Iq = clamp((S.Iq || 0) + (qWant - A.w.y) * 1.5 * dt, -0.7, 0.7);
    let pitch = clamp((qWant - A.w.y) * 9 + S.Iq, -1, 1);
    // auto-trim: run the trim wheel to unload the elevator integral (slowly, like the real trim servo)
    const trimRate = clamp(S.Iq * 2.5, -1, 1) * (Math.abs(S.Iq) > 0.03 ? 1 : 0);
    if (trimRate) S.Iq -= trimRate * 0.12 * dt * TRIM_E / (LIM.eleUp) * 1.0;
    // speed: power levers, holding torque inside 19,000 in-lb
    const spErr = cmd.kias - A.kias;
    S.It = clamp(S.It + spErr * 0.0025 * dt, -0.4, 0.6);
    let thr = clamp(0.35 + S.It + spErr * 0.03 - A.vel.y * 0.01, 0, 1);
    let tq = 0; for (const en of A.eng) if (en.run) tq = Math.max(tq, en.torque);
    if (tq > 18800) { S.It -= (tq - 18800) * 2e-6; thr = Math.min(thr, S.thr - 0.02); }
    S.thr += clamp(thr - S.thr, -0.5 * dt, 0.5 * dt);
    // rudder: zero the sideslip (turn coordination, engine out) with an integral
    S.Ir = clamp(S.Ir + A.beta * 3 * dt, -0.8, 0.8);
    const yaw = clamp(A.beta * 6 + S.Ir - A.w.z * 0.5, -1, 1);
    return { pitch, roll, yaw, throttle: [S.thr, S.thr, S.thr, S.thr], trimRate };
  };
  return A;
}
