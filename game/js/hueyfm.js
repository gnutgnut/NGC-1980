// Bell UH-1H "Huey" flight model. Pure: three.js maths only, no DOM, so it runs in node (tools/hueybench.mjs).
//
// Real air (ISA sea level, rho 1.225) and real speeds: unlike the jet, a helicopter fits the 1.3 km map as it is.
// Numbers carry a tag: CONFIRMED = from a published source (Heffley NASA CR-3144 "H", Talbot NASA TM-73,254 "T",
// the DCS UH-1H flight manual "DCS", TM 55-1520-210-10 charts "TM"), INFERRED = derived / estimated / tuned.
//
// Frames: the airframe lives in three.js axes (x right, y up, nose along -z). The dynamics run in body axes FRD (x fwd,
// y right, z down: p roll right, q pitch up, r yaw right), like Talbot's equations. H.w is kept in three body axes for
// the rest of the game (w.x pitch up, w.y yaw LEFT, w.z roll LEFT).
//
// Per 1/240 s substep:
// - Main rotor (2-blade teetering, 48 ft, 324 rpm, CCW seen from above): blade-element thrust with uniform inflow,
//   Glauert momentum inflow with a first-order lag (dynamic inflow), the empirical vortex-ring curve in descent,
//   ground effect (Cheeseman-Bennett), profile + induced + parasite power, retreating blade stall and tip Mach drag.
//   Tip-path plane = shaft + cyclic + stabilizer bar + flapback / lateral flapping / rate lag, first-order with the
//   rotor's own time constant 16/(gamma Omega). A teetering hub has no hub moment: control comes only from tilting the
//   thrust about the CG (so low-g means no control, and a hard cyclic at low thrust hits the mast stop).
// - Bell stabilizer bar: a gyro that stays in space and feeds 0.16 of its tilt into the cyclic, washing out over 3.3 s
//   (T Table 3): short-term attitude stability, then a slow drift.
// - Tail rotor: a fan (momentum thrust along the shaft) driven 5.123 x rotor speed, pitch from the pedals.
// - Drivetrain: rotor (+tail) inertia behind a freewheel; T53-L-13 engine with gas producer N1 (lags, acceleration
//   limited), free power turbine N2 (torque falls with speed), an N2 governor (AUTO) or direct fuel (EMER), starter,
//   light-off, hung start, flame-out. Autorotation is simply the freewheel opening.
// - Fuselage (Talbot eqs 42-46), synchronized elevator (T table vs. stick), vertical fin with camber, rotor downwash
//   on the fuselage and the stabilizer.
// - Skid gear: spring/damper contact points with skid friction relative to the surface (moving decks via surfVel).
import * as THREE from 'three';

export const KT = 1.94384, FT = 3.28084, LB = 2.20462, FPM = 196.85;
export const UH1H = {
  // mass: basic empty 2683 kg (DCS, CONFIRMED) + 3 crew, door gun, rocket pods (INFERRED) = 3090; full fuel 616 kg
  // (209 gal JP-4, DCS CONFIRMED) -> 3706 kg, close to Heffley's 8000 lb nominal case (3629 kg)
  MASS_OP: 3090, FUEL_KG: 616,
  I: [3966, 14684, 12541],                    // Ixx roll, Iyy pitch, Izz yaw kg m2 (H Fig V-3, 3629 kg) CONFIRMED
  // main rotor (H Table V-1 / T Table 2) CONFIRMED
  R: 7.32, CHORD: 0.533, SIGMA: 0.0464, A: 5.73, TWIST: -0.19, OMEGA: 33.93, PRECONE: 0.048, LOCK: 6.65,
  SHAFT_TILT: 0.0873, HUB: [0.12, 0, -2.0],    // 5 deg forward; hub 2.0 m above the CG (T: 2.07), 0.14 fwd (mast FS 133 + tilt; INFERRED to hover pitch)
  I_ROTOR: 3362, I_TAIL_REF: 210, I_ENG_REF: 250,   // polar inertia, kg m2 at the mast (H derived; INFERRED for the rest)
  MAST_STOP: 0.19, STALL_A: 0.37, CD0: 0.0072,                            // teeter stop ~11 deg (INFERRED)
  // controls: collective 8.6..24.3 deg root (DCS-fitted, INFERRED), cyclic +-12 deg lon, +-10 deg lat (H/T rigging)
  COLL_MIN: 0.1501, COLL_SPAN: 0.2735, CYC_LON: 0.21, CYC_LAT: 0.175,
  CYC_BIAS: [0.012, -0.006],                   // rigging: centred stick = slight fwd / left cyclic (INFERRED from H trims)
  // stabilizer bar: tau 3.3 s, mixing 0.16 (T Table 3, KB = 0.528 s) CONFIRMED
  BAR_TAU: 3.3, BAR_K: 0.16,
  // tail rotor: R 1.295 (8.5 ft), sigma 0.146 (H chord 0.297; T says 0.213 - CONFLICT), ratio 5.123 (H), hub (H)
  TR_R: 1.295, TR_SIGMA: 0.146, TR_RATIO: 5.123, TR_HUB: [-8.70, -0.39, -2.03], TR_PITCH0: 0.072, TR_PITCH_K: 0.245, TR_BLOCK: 0.92, TR_DAMP: 70,
  // fuselage (T Table 3, N/(m/s)^2 at rho0) CONFIRMED; stabilizer & fin (H/T) CONFIRMED, fin camber INFERRED
  FUS: { D1: 1.05, D2: 9.62, D3: 30.92, L1: 3.13, Y1: 0.29, M1: 13.95, N1: 5.5 },   // N1: Talbot prints M1 = N1 = 13.95; with it the bare airframe is directionally unstable and a tail rotor loss is never flyable, against the -10 manual. 5.5 INFERRED
  STAB: { pos: [-5.74, 0, -0.19], H1: 1.98 }, FIN: { pos: [-7.96, 0, -1.2], K1: 1.75, CAMBER: 0.08 },
  // skids: bottom 1.84 m below the CG (H Fig V-1), track +-1.3 m, front/rear ends of the ground run
  SKID_Z: 1.84, SKIDS: [[1.75, -1.3], [1.75, 1.3], [-0.3, -1.3], [-0.3, 1.3], [-2.35, -1.3], [-2.35, 1.3]],
  TAIL_SKID: [-8.4, 0, 0.45], NOSE: [3.75, 0, 0.55],
  // engine T53-L-13: 1400 shp thermodynamic (DCS, CONFIRMED), torque meter 50 psi = 1100 shp at the mast (DTIC)
  P_MAX: 1044e3, PSI_NM: 483.5, N1_IDLE: 0.70, N1_MAX: 1.015, SFC: 0.353 / 3.6e6,
};
const U = UH1H;
const AREA = Math.PI * U.R * U.R, TR_AREA = Math.PI * U.TR_R * U.TR_R;
const RHO = 1.225;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// synchronized elevator incidence vs. longitudinal stick (m, + forward) - DCS p.37 = Talbot's table, CONFIRMED
const SE_X = [-0.1638, -0.1525, -0.127, -0.1016, -0.0762, -0.0508, -0.0254, 0, 0.0254, 0.0508, 0.0762, 0.1016, 0.127, 0.1525, 0.1638];
const SE_Y = [0.0224, 0.0174, 0, -0.0192, -0.0384, -0.0541, -0.069, -0.082, -0.085, -0.0803, -0.0628, -0.03, 0.0035, 0.0593, 0.0942];
function lerpTable(xs, ys, x) { if (x <= xs[0]) return ys[0]; for (let i = 1; i < xs.length; i++) if (x <= xs[i]) { const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[i - 1] + (ys[i] - ys[i - 1]) * t; } return ys[ys.length - 1]; }
// induced inflow target for a rotor: momentum theory (Glauert) in climb, forward flight and windmill brake; the
// empirical vortex-ring curve (Johnson, "Helicopter Theory") in slow axial descent. lc = climb inflow (+ = air down
// through the disc), mu = advance ratio, ct = thrust coefficient. Returns lambda_i (+ = down).
export function inflowTarget(ct, lc, mu) {
  const s = ct < 0 ? -1 : 1, c = Math.abs(ct), lh = Math.sqrt(c / 2) + 1e-6;
  const x = s * lc / lh, m = mu / lh;   // normalised climb (+) / descent (-) rate and forward speed
  // Glauert: li = lh^2 / sqrt(mu^2 + (lc + li)^2), solved by Newton from the hover value
  let li = lh;
  for (let k = 0; k < 6; k++) { const l = x * lh + li, r = Math.sqrt(mu * mu + l * l), f = li * r - lh * lh, df = r + li * l / r; li = Math.max(1e-6, li - f / df); }
  if (x < 0) {   // descent: below 2 vh momentum theory has no solution; blend in the empirical curve at low forward speed
    const xc = Math.max(x, -2), emp = lh * (1.15 - 1.125 * xc - 1.372 * xc * xc - 1.718 * xc ** 3 - 0.655 * xc ** 4);
    const wbs = x < -2 ? lh * (-x / 2 - Math.sqrt(x * x / 4 - 1)) : emp;   // windmill brake state beyond 2 vh
    const w = (1 - sstep(0.6, 1.5, m)) * sstep(0, 0.25, -x);
    li = li + (wbs - li) * w;
  }
  return s * li;
}
// ring-state severity 0..1 (descent 0.3..1.6 vh at low forward speed): drives thrust roughness and the warning
export const vrsLevel = (ct, lc, mu) => { const lh = Math.sqrt(Math.abs(ct) / 2) + 1e-6, x = -lc / lh, m = mu / lh; return sstep(0.25, 0.6, x) * (1 - sstep(1.3, 2.0, x)) * (1 - sstep(0.5, 1.2, m)); };

const toF = (v3, out) => out.set(-v3.z, v3.x, -v3.y);          // three body -> FRD
const fromF = (vf, out) => out.set(vf.y, -vf.z, -vf.x);        // FRD -> three body
const cross = (a, b, out) => out.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const NOMODS = { engineOk: true, power: 1, xmsnOk: true, lift: 1, tail: 1, hyd: 1, hydOk: true, skidTol: 1, vib: 0 };
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3(), _r = new THREE.Vector3(), _p = new THREE.Vector3(), _w = new THREE.Vector3();
const _iq = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _e = new THREE.Euler(), _ax = new THREE.Vector3(), _sv = new THREE.Vector3(), _ow = new THREE.Vector3();
const _ip = new THREE.Vector3(), _hub = new THREE.Vector3(), _vb = new THREE.Vector3(), _wb = new THREE.Vector3(), _n = new THREE.Vector3(), _hv = new THREE.Vector3(), _Fb = new THREE.Vector3(), _Mb = new THREE.Vector3(), _Fw = new THREE.Vector3(), _Tw = new THREE.Vector3();
// shaft axes in FRD: xs forward (in the hub plane), ys right, zs down the mast (the mast leans 5 deg forward)
const CS = Math.cos(U.SHAFT_TILT), SN = Math.sin(U.SHAFT_TILT);
const XS = new THREE.Vector3(CS, 0, SN), YS = new THREE.Vector3(0, 1, 0), ZS = new THREE.Vector3(-SN, 0, CS);
const HUB = new THREE.Vector3(...U.HUB), TRH = new THREE.Vector3(...U.TR_HUB), STAB = new THREE.Vector3(...U.STAB.pos), FIN = new THREE.Vector3(...U.FIN.pos);

export function createHueySim(GRAV = 9.81) {
  const H = {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(),
    // rotor & engine
    omega: U.OMEGA, n1: 0, n2: 0, run: false, egt: 20, clutch: true, gasP: 0, qEng: 0, torque: 0, fuelFlow: 0, n1i: 0.9, starter: false, lit: 0, hung: false,
    li: 0.04, liT: 0.05, tx: 0, ty: 0, bx: 0, by: 0, ct: 0, thrust: 0, qRotor: 0, qTail: 0, tailT: 0, mu: 0, stall: 0, vrs: 0, ge: 0, etl: 0, mastBump: 0,
    // applied controls (after the hydraulic servos) and what the game reads
    c: { coll: 0, lon: 0, lat: 0, ped: 0 }, coll: 0, landed: true, agl: 0, contacts: 0, driven: false, engine: true, vib: 0, ias: 0, slip: 0, nz: 1, alt: 0,
    fuelKg: U.FUEL_KG, events: [], _t: 0, lowRpm: false, settle: false, dead: false,
    get mass() { return U.MASS_OP + H.fuelKg + (H.extraMass || 0); },
    get rpm() { return H.omega / U.OMEGA; }, set rpm(v) { H.omega = v * U.OMEGA; if (H.clutch || v > H.n2) H.n2 = v; },
    up(out = new THREE.Vector3()) { return out.set(0, 1, 0).applyQuaternion(H.q); },
    forward(out = new THREE.Vector3()) { return out.set(0, 0, -1).applyQuaternion(H.q); },
    heading() { H.forward(_f); return Math.atan2(_f.x, -_f.z); },
    attitude() { _e.setFromQuaternion(H.q, 'YXZ'); return { pitch: _e.x, roll: _e.z, yaw: _e.y }; },   // roll + = LEFT wing down (three z)
    worldPoint(fr, out = new THREE.Vector3()) { return fromF(_t.set(fr[0], fr[1], fr[2]), out).applyQuaternion(H.q).add(H.pos); },
    // landed: put it on the ground (the first step settles the skids); rpm >= 0.9: running and governed, else at flight
    // idle (the systems layer rolls the throttle on); rpm < 0: cold and dark
    reset(pos, yaw = 0, landed = true, rpm = landed ? 0 : 1) {
      H.pos.copy(pos); H.vel.set(0, 0, 0); H.w.set(0, 0, 0); H.q.setFromEuler(_e.set(0, yaw, 0, 'YXZ'));
      H.landed = landed; H.settle = landed; H.dead = false; H.events.length = 0; H.engine = true;
      H.tx = H.ty = H.bx = H.by = 0; H.mastBump = 0; H.stall = 0; H.vrs = 0;
      const hot = rpm >= 0.9, cold = rpm < 0;
      H.run = !cold; H.n1 = cold ? 0 : hot ? 0.9 : U.N1_IDLE; H.n1i = H.n1; H.starter = false; H.lit = 0; H.hung = false;
      H.omega = cold ? 0 : hot ? U.OMEGA * Math.min(1, rpm) : U.OMEGA * 0.62; H.n2 = H.omega / U.OMEGA; H.clutch = true;
      H.egt = cold ? 20 : hot ? 560 : 420;
      const ct0 = H.mass * GRAV / (RHO * AREA * (U.OMEGA * U.R) ** 2); H.li = landed ? 0.01 : Math.sqrt(ct0 / 2); H.liT = 0.05;
      H.c.coll = landed ? 0 : 0.42; H.c.lon = H.c.lat = 0; H.c.ped = landed ? 0 : -0.25;
    },
    // ctl: { coll 0..1, cx +right, cy +aft, pedal +right (-1..1), throttle grip 0 cutoff..1 open, starter, gov 'AUTO'|'EMER', beep }
    // env: { groundY(x,z), water(x,z) | water bool, surfVel(x,z) -> {vx,vy,vz,w,cx,cz}|null, mods, fuel (0..100) }
    // groundY is sampled once per frame (a ship moves after this step); a moving deck carries on at surfVel within it
    // returns the first event of the frame: 'crash' | 'rotor' | 'water' | 'land' | 'hardland' | 'tailstrike' | null
    step(dt, ctl, env) {
      H.events.length = 0;
      const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
      tStep = 0;
      for (let i = 0; i < n && !H.dead; i++) { sub(h, ctl, env); tStep += h; }
      const prio = ['water', 'rotor', 'crash', 'tailstrike', 'hardland', 'land'];
      for (const p of prio) if (H.events.some(e => e.e === p)) return p;
      return null;
    },
    // the 2D cave: no attitude or position here, just the rotor in axial flight. vc = climb speed (m/s), z = rotor height
    // over the rock below (m, Infinity = none). Runs the engine and rotor speed and returns thrust / weight.
    axial(dt, ctl, env, vc, z) {
      const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n, M = env.mods || NOMODS; let tw = 0;
      H.landed = false; H.settle = false;
      for (let i = 0; i < n; i++) {
        servos(h, ctl, M); fuelBurn(h, env);
        _vb.set(0, 0, -vc); _wb.set(0, 0, 0);
        mainRotor(h, M, _vb, _wb, z);
        tailRotor(h, ctl, M, _vb, _wb);
        drivetrain(h, ctl, M, env);
        tw = H.thrust / (H.mass * GRAV);
      }
      H.agl = isFinite(z) ? Math.max(0, z - 3.8) : 99;
      return tw;
    },
  };
  const ev = (e, x) => H.events.push(x ? { e, ...x } : { e });

  // ------------------------------------------------------------------------------------- controls (hydraulic servos)
  function servos(h, ctl, M) {
    // boost on: the servos follow the pilot almost at once; off: heavy controls - slow and short of full travel
    const r = M.hyd >= 1 ? 6 : 0.9, k = M.hyd >= 1 ? 1 : 0.75, c = H.c, mv = (cur, t) => cur + clamp(t - cur, -r * h, r * h);
    c.coll = mv(c.coll, clamp(ctl.coll ?? 0, 0, 1) * (M.hyd >= 1 ? 1 : 0.9));
    c.lon = mv(c.lon, clamp(ctl.cy ?? 0, -1, 1) * k); c.lat = mv(c.lat, clamp(ctl.cx ?? 0, -1, 1) * k);
    c.ped = c.ped + clamp(clamp(ctl.pedal ?? 0, -1, 1) - c.ped, -4 * h, 4 * h);   // pedals are mechanical (no boost)
    H.coll = c.coll;
  }
  function fuelBurn(h, env) {
    H.fuelFlow = H.run ? 0.012 + H.gasP * U.SFC : 0;   // kg/s (real); the game scales its tank % itself
    if (env.fuel !== undefined) H.fuelKg = U.FUEL_KG * clamp(env.fuel, 0, 100) / 100;
  }

  // ------------------------------------------------------------------------------------- main rotor
  const vh = new THREE.Vector3(), wh = new THREE.Vector3();
  function mainRotor(h, M, vb, wb, zGround) {
    const Om = Math.max(H.omega, 0.5), VT = Om * U.R;
    cross(wb, HUB, wh); vh.copy(vb).add(wh);                       // hub velocity (FRD)
    const us = vh.dot(XS), vs = vh.dot(YS), ws = vh.dot(ZS);        // in shaft axes
    const mx = us / VT, my = vs / VT, mu = Math.hypot(mx, my); H.mu = mu;
    const lc = -ws / VT + mx * H.tx + my * H.ty;                    // climb + disc tilt inflow (+ = air down through the disc)
    const th0 = U.COLL_MIN + U.COLL_SPAN * H.c.coll, th75 = th0 + 0.75 * U.TWIST;
    const lam = H.li + lc; H.lc = lc;
    let ct = (U.SIGMA * U.A / 2) * (th0 * (1 / 3 + mu * mu / 2) + U.TWIST * (1 / 4 + mu * mu / 4) - lam / 2);
    // cyclic feathering (pilot + bar) and the flapback the rotor needs: with forward lean the retreating blade (left,
    // CCW rotor) takes more pitch
    const lon = -U.CYC_LON * H.c.lon + U.CYC_BIAS[0] + U.BAR_K * H.bx, lat = U.CYC_LAT * H.c.lat + U.CYC_BIAS[1] + U.BAR_K * H.by;
    const a1 = mu * (8 / 3 * th0 + 2 * U.TWIST - 2 * lam) / (1 - mu * mu / 2);
    // blade stall: retreating blade angle of attack at 0.75 R ~ theta75 + longitudinal feathering + inflow angle (INFERRED)
    const aRet = th75 + Math.max(0, lon + a1) * (mx > 0 ? 1 : 0) + Math.atan2(lam, Math.max(0.12, 0.75 - mu));
    const ctMax = U.SIGMA * (0.135 - 0.25 * mu * mu);
    H.aRet = aRet; H.stall = Math.max(sstep(U.STALL_A, U.STALL_A + 0.07, aRet), sstep(ctMax * 0.9, ctMax * 1.2, ct));
    ct *= 1 - 0.18 * H.stall;
    // ground effect (Cheeseman-Bennett) on the induced velocity, fading with speed; zGround = hub height over ground
    const lh = Math.sqrt(Math.abs(ct) / 2) + 1e-4, zr = Math.max(zGround, 0.55 * U.R);
    const ge = isFinite(zGround) ? (U.R / (4 * zr)) ** 2 / (1 + (mu / lh) ** 2 * 1.5) : 0; H.ge = ge;
    // dynamic inflow: the wake follows the thrust with a time lag (Pitt-Peters ~0.85 R / (4 lambda Omega R))
    H.liT = inflowTarget(ct, lc, mu) * (1 - ge) * 1.0;
    const tau = clamp(0.849 / (4 * Math.max(0.02, Math.abs(lam)) * Om), 0.04, 0.35);
    H.li += (H.liT - H.li) * Math.min(1, h / tau);
    H.vrs = vrsLevel(ct, lc, mu); H.etl = sstep(0.5, 1.6, mu / lh);
    // VRS: the wake re-ingests itself - thrust fluctuates and sags
    if (H.vrs > 0.05) ct *= 1 - H.vrs * (0.1 + 0.12 * Math.sin(H._t * 7.3) * Math.sin(H._t * 2.9 + 1));
    const ctEff = ct * M.lift;
    H.ct = ctEff; H.thrust = ctEff * RHO * AREA * VT * VT;
    // torque: induced (+tip loss), climb/descent and parasite through the inflow, profile drag (+ advancing tip Mach,
    // stall, damage). In autorotation lc < 0 and the sum goes to zero.
    const cdm = 6 * Math.abs(ct) / (U.SIGMA * U.A), mtip = (VT + Math.abs(us)) / 340;
    const cd = U.CD0 - 0.0216 * cdm + 0.4 * cdm * cdm + 0.25 * Math.max(0, mtip - 0.89) ** 2 + 0.02 * H.stall + 0.012 * (1 - M.lift);
    const cq = ct * (1.12 * H.li + lc) + U.SIGMA * cd / 8 * (1 + 4.65 * mu * mu);
    H.qRotor = cq * RHO * AREA * VT * VT * U.R;
    // tip-path plane: target lean (forward tx, right ty, rad, relative to the shaft) and first-order response
    const tf = 16 / (U.LOCK * Om), rt = Om / U.OMEGA;
    let ttx = lon, tty = lat;
    if (mu > 1e-4) {   // flapback away from the wind and lateral flapping (coning + transverse flow) 90 deg round (CCW rotor)
      const dx = mx / mu, dy = my / mu;
      const kx = Math.tan(Math.atan2(mu, Math.max(1e-4, Math.abs(lam))) / 2), b1 = (4 / 3 * mu * U.PRECONE + kx * H.li * 1.1) / (1 + mu * mu / 2);
      ttx += -a1 * dx - b1 * dy; tty += -a1 * dy + b1 * dx;
    }
    // body rates: the disc lags the shaft (damping) with a gyroscopic cross term (signs per H L_q < 0, M_p > 0)
    const p = wb.x, q = wb.y;
    ttx += tf * q * 0.62 - 0.55 * p / Om; tty += -tf * p * 0.62 - 0.55 * q / Om;
    // retreating blade stall: the disc pitches up and rolls left
    ttx -= 0.05 * H.stall; tty -= 0.035 * H.stall;
    const kf = Math.min(1, h / Math.max(0.02, tf));
    H.tx += (ttx - H.tx) * kf; H.ty += (tty - H.ty) * kf;
    const lean = Math.hypot(H.tx, H.ty);
    if (lean > U.MAST_STOP) { H.tx *= U.MAST_STOP / lean; H.ty *= U.MAST_STOP / lean; if (Math.abs(ct) < 0.0009 && rt > 0.5) H.mastBump += h; }
    // stabilizer bar: a gyro that holds its plane in space, damped back to the mast over BAR_TAU
    if (rt > 0.3) { H.bx += (q - H.bx / U.BAR_TAU) * h; H.by += (-p - H.by / U.BAR_TAU) * h; } else { H.bx *= 0.98; H.by *= 0.98; }
    H.bx = clamp(H.bx, -0.35, 0.35); H.by = clamp(H.by, -0.35, 0.35);
  }

  // ------------------------------------------------------------------------------------- tail rotor (a fan)
  const vt = new THREE.Vector3();
  function tailRotor(h, ctl, M, vb, wb) {
    const Om = Math.max(H.omega * U.TR_RATIO, 1), VT = Om * U.TR_R;
    cross(wb, TRH, vt); vt.add(vb);
    const th = U.TR_PITCH0 - U.TR_PITCH_K * H.c.ped;
    const lc = vt.y / VT, mu = Math.hypot(vt.x, vt.z) / VT;           // moving right = "climbing" for the fan (thrust is +y)
    if (H.trLi === undefined) H.trLi = 0.05;
    const lam = H.trLi + lc;
    let ct = (U.TR_SIGMA * U.A / 2) * (th * (1 / 3 + mu * mu / 2) - lam / 2);
    ct = clamp(ct, -0.018, 0.018);
    const tgt = inflowTarget(ct, lc, mu); H.trLi += (tgt - H.trLi) * Math.min(1, h / 0.03);
    const live = M.tail > 0 ? 1 : 0;
    // + Talbot's extra tail rotor damping (his T4 term, reduced: INFERRED) - isolated-fan theory under-predicts it
    H.tailT = (ct * RHO * TR_AREA * VT * VT * U.TR_BLOCK - U.TR_DAMP * vt.y * Math.min(1, Om / (U.OMEGA * U.TR_RATIO))) * M.tail;
    const cdm = 6 * Math.abs(ct) / (U.TR_SIGMA * U.A);
    const cq = ct * (1.15 * H.trLi + lc) + U.TR_SIGMA * (0.009 + 0.4 * cdm * cdm) / 8 * (1 + 4.65 * mu * mu);
    H.qTail = Math.max(0, cq * RHO * TR_AREA * VT * VT * U.TR_R) * live * U.TR_RATIO;   // reflected to the mast
  }

  // ------------------------------------------------------------------------------------- engine and drivetrain
  function drivetrain(h, ctl, M, env) {
    const fuelOk = (env.fuel === undefined || env.fuel > 0) && M.engineOk && ctl.fuel !== false;
    const grip = clamp(ctl.throttle ?? 1, 0, 1), cutoff = grip < 0.02;
    // combustion: light-off needs fuel, the grip out of cut-off and N1 > 12%; cut-off, no fuel or a dead engine flame out
    if (H.run && (!fuelOk || cutoff)) { H.run = false; ev('flameout'); }
    H.starter = !!ctl.starter && H.n1 < 0.6;
    if (!H.run && fuelOk && !cutoff && H.n1 > 0.12 && (H.starter || H.n1 > 0.5)) { H.run = true; H.lit = 4; H.hotGrip = grip; ev('lightoff'); }
    // N1 command: AUTO = governor PI on N2 (+ the droop compensator's collective feed-forward), EMER = grip -> fuel
    const gIdle = 0.18, n1Grip = grip <= gIdle ? U.N1_IDLE * (0.9 + 0.1 * grip / gIdle) : U.N1_IDLE + (U.N1_MAX - U.N1_IDLE) * (grip - gIdle) / (1 - gIdle);
    let n1c;
    if (!H.run) n1c = H.starter ? 0.26 * Math.min(1, ctl.starterV ?? 1) : 0;
    else if (H.n1 < 0.4 && !H.starter) { n1c = 0.33; H.hung = true; }   // released the starter too early: hung start
    else {
      H.hung = false;
      if (ctl.gov === 'EMER') n1c = n1Grip;
      else {
        const e = (1 + (ctl.beep || 0)) - H.n2;
        H.dn2 = (H.dn2 || 0) + (((H.n2 - (H.n2p ?? H.n2)) / h) - (H.dn2 || 0)) * Math.min(1, h * 8); H.n2p = H.n2;   // N2 rate (smoothed)
        const hi = Math.min(n1Grip, U.N1_MAX), raw = H.n1i + e * 5 - H.dn2 * 1.2 + 0.04 * H.c.coll;
        n1c = clamp(raw, U.N1_IDLE, hi);
        if (!((raw > hi && e > 0) || (raw < U.N1_IDLE && e < 0))) H.n1i = clamp(H.n1i + e * 2.2 * h, U.N1_IDLE, hi);   // conditional integration: no wind-up on a roll-on
      }
    }
    // gas producer: lag + acceleration limit (idle -> max ~3.5 s, INFERRED); the starter cranks it, a dead one spools down
    const qk = ctl.quick ? 2.2 : 1;
    if (H.run && H.n1 >= 0.4) H.n1 += clamp((n1c - H.n1) * 2.2, -0.28, 0.1) * h;
    else if (H.run) H.n1 += clamp((Math.max(n1c, H.starter ? 0.45 : 0.33) - H.n1) * 0.35 * qk, -0.05, 0.05) * h;   // light-off -> 40%
    else H.n1 += (n1c > 0 ? (n1c - H.n1) * 0.22 * qk : -H.n1 * 0.12) * h;
    H.n1 = Math.max(0, H.n1);
    // power to the free turbine: steep in N1, damage and EMER take some away
    const gas = H.run ? U.P_MAX * (Math.max(0, (H.n1 - 0.68) / 0.32) ** 1.6 + 0.006 * sstep(0.12, 0.6, H.n1)) * M.power * (ctl.gov === 'EMER' ? 0.88 : 1) : 0;   // idle ~16 kW: the rotor turns slowly at flight idle, the needles split in a practice autorotation (INFERRED)
    H.gasP = gas;
    const qe = gas / U.OMEGA * Math.max(0, 2 - H.n2);                // free-turbine torque at the mast falls with N2
    // freewheel: S = torque through the clutch; it can only drive the rotor
    const qLoad = H.qRotor + H.qTail + 300 * (H.omega / U.OMEGA) + (M.xmsnOk ? 0 : 9000) * Math.sign(H.omega);
    const IR = U.I_ROTOR + U.I_TAIL_REF, IE = U.I_ENG_REF, qef = 60 * H.n2 + 450 * H.n2 * H.n2 + 400 * Math.max(0, H.n2 - 1.08);
    const nr = H.omega / U.OMEGA, engaged = H.n2 >= nr - 1e-4;
    let S = 0;
    if (engaged) { S = (IR * (qe - qef) + IE * qLoad) / (IR + IE); if (S < 0) S = 0; }   // locked: share the acceleration
    H.clutch = engaged && S > 0;
    const om0 = H.omega;
    H.omega = Math.max(0, H.omega + (S - qLoad) / IR * h);
    if (H.clutch) H.n2 = H.omega / U.OMEGA;
    else H.n2 = Math.max(0, H.n2 + (qe - qef) / IE / U.OMEGA * h);   // overrun: the engine runs on its own
    H.qEng = S; H.torque = S / U.PSI_NM; H.driven = H.clutch && H.run;
    H.qShaft = H.qRotor + U.I_ROTOR * (H.omega - om0) / h;          // what the mast puts into the fuselage (nose right)
    // EGT: idle ~420, ~600 at 50 psi, hung or hot starts run away (INFERRED to DCS limits)
    let egtT = H.run ? 380 + 0.27 * gas / 1000 + (1 - M.power) * 180 + (H.hung ? 380 : 0) : 20 + 150 * H.n1;
    if (H.lit > 0) { H.lit -= h; egtT = Math.max(egtT, 560 + 500 * Math.max(0, (H.hotGrip ?? 0) - 0.3)); }
    H.egt += (egtT - H.egt) * Math.min(1, h * (H.lit > 0 ? 1.6 : 0.7));
    if (H.egt > 760) { H.hotT = (H.hotT || 0) + h; if (H.hotT > 2) { H.hotT = 0; ev('overtemp'); } } else H.hotT = 0;
    H.lowRpm = H.omega / U.OMEGA < 0.926 && (H.run || H.omega > 3);
  }

  // ------------------------------------------------------------------------------------- one substep
  const sf = new THREE.Vector3();
  function sub(h, ctl, env) {
    H._t = (H._t || 0) + h;
    const M = env.mods || NOMODS, m = H.mass, [Ixx, Iyy, Izz] = U.I;
    servos(h, ctl, M); fuelBurn(h, env);
    _iq.copy(H.q).invert();
    toF(_v.copy(H.vel).applyQuaternion(_iq), _vb); toF(H.w, _wb);
    // skids on the ground: settle onto them after a reset; ground under the hub for ground effect
    if (H.settle) settleSkids(env);
    const hubW = H.worldPoint(U.HUB, _p), gHub = env.groundY(hubW.x, hubW.z), zg = hubW.y - Math.max(gHub, -50);
    mainRotor(h, M, _vb, _wb, zg);
    tailRotor(h, ctl, M, _vb, _wb);
    drivetrain(h, ctl, M, env);

    _Fb.set(0, 0, 0); _Mb.set(0, 0, 0);
    // main rotor thrust along the tip-path-plane normal (+ in-plane H-force), applied at the hub
    _n.copy(XS).multiplyScalar(H.tx).addScaledVector(YS, H.ty).addScaledVector(ZS, -1).normalize();
    _f.copy(_n).multiplyScalar(H.thrust);
    cross(_wb, HUB, _t); _hv.copy(_vb).add(_t); _ip.copy(_hv).addScaledVector(ZS, -_hv.dot(ZS)); const ipl = _ip.length(), VTm = Math.max(H.omega, 1) * U.R;
    if (ipl > 0.1) _f.addScaledVector(_ip, -(U.SIGMA * 0.0087 / 4) * H.mu * RHO * AREA * VTm * VTm / ipl);   // in-plane H-force (profile drag)
    _Fb.add(_f); _Mb.add(cross(HUB, _f, _t));
    _Mb.addScaledVector(ZS, H.qShaft || 0);                           // torque reaction (CCW rotor: nose right)
    // tail rotor thrust (+y pushes the tail right = nose left)
    _f.set(0, H.tailT, 0); _Fb.add(_f); _Mb.add(cross(TRH, _f, _t));
    // fuselage (Talbot eqs 42-46), with rotor downwash on it at low speed
    const V = _vb.length(), u = _vb.x, vv = _vb.y, vi = Math.max(0, H.li) * Math.max(H.omega, 1) * U.R;
    const wake = 1 - sstep(4, 18, Math.hypot(u, vv));
    const w = _vb.z - 0.9 * vi * wake, au = Math.abs(u), F = U.FUS;
    const L1t = au > 3 ? F.L1 * w * w / au : 0;
    _Fb.x += u * (-F.D1 * au + L1t); _Fb.y += vv * (-F.D2 * Math.abs(vv) - F.Y1 * au); _Fb.z += w * (-F.D3 * Math.abs(w) - F.L1 * au);
    _Mb.y += F.M1 * w * au * sstep(5, 15, au); _Mb.z += -F.N1 * vv * u * sstep(3, 10, au);
    // yaw / roll damping of the boom swinging through the downwash and the cabin turning in the air (INFERRED)
    _Mb.z += -2600 * _wb.z * (0.4 + wake) - 850 * _wb.z * Math.abs(_wb.z); _Mb.x += -600 * _wb.x;   // + the boom's cross-flow drag when it spins (0.5 rho Cd D L^4 / 4)
    // synchronized elevator: incidence from the stick, in the rotor wash at low speed (nose-up pitch through transition)
    {
      cross(_wb, STAB, _t); _hv.copy(_vb).add(_t);
      const Vh = Math.hypot(u, vv), dw = vi * (0.9 * wake + 1.6 * Math.exp(-(((Vh - 11) / 6) ** 2)) + 1.4 * sstep(12, 30, Vh));   // wake over the tail in cruise too
      const wl = _hv.z - dw, ul = Math.max(1, Math.abs(_hv.x)), inc = lerpTable(SE_X, SE_Y, -H.c.lon * 0.1638);
      const a = Math.atan2(wl, ul) + inc, V2 = ul * ul + wl * wl, cl = Math.abs(a) < 0.3 ? a : Math.sign(a) * Math.max(0.3 * (1.3 - Math.abs(a)), 0.69 * Math.abs(Math.sin(a)));   // stalls to a flat plate
      _f.set(0, 0, -U.STAB.H1 * V2 * cl); _Fb.add(_f); _Mb.add(cross(STAB, _f, _t));
    }
    // vertical fin: cambered to push the tail right in forward flight (unloads the tail rotor)
    {
      cross(_wb, FIN, _t); _hv.copy(_vb).add(_t);
      const ul = Math.max(1, Math.abs(_hv.x)), b = Math.atan2(_hv.y, ul), V2 = ul * ul + _hv.y * _hv.y;
      const cl = (Math.abs(b) < 0.35 ? b : Math.sign(b) * 0.35) - U.FIN.CAMBER;
      _f.set(0, -U.FIN.K1 * V2 * cl * sstep(2, 12, ul), 0); _Fb.add(_f); _Mb.add(cross(FIN, _f, _t));
    }
    H.nz = -_Fb.z / (m * GRAV);
    // ground: skids (springs, friction against a moving surface), contact events
    _Fw.set(0, 0, 0); _Tw.set(0, 0, 0);
    contact(h, env, M, m);
    // integrate: translation in world, rotation in body (Euler's equations)
    fromF(_Fb, _f).applyQuaternion(H.q).add(_Fw); _f.y -= m * GRAV;
    H.vel.addScaledVector(_f, h / m); H.pos.addScaledVector(H.vel, h);
    _t.copy(_Tw).applyQuaternion(_iq); toF(_t, _r); _Mb.add(_r);
    const p = _wb.x, q = _wb.y, r = _wb.z;
    _wb.x += (_Mb.x + (Iyy - Izz) * q * r) / Ixx * h;
    _wb.y += (_Mb.y + (Izz - Ixx) * p * r) / Iyy * h;
    _wb.z += (_Mb.z + (Ixx - Iyy) * p * q) / Izz * h;
    fromF(_wb, H.w);
    const ang = H.w.length() * h;
    if (ang > 1e-9) { _dq.setFromAxisAngle(_ax.copy(H.w).normalize(), ang); H.q.multiply(_dq).normalize(); }
    // read-outs
    H.ias = Math.hypot(_vb.x, _vb.y) * KT; H.slip = clamp(_vb.y / Math.max(5, V) * 2.5 + (-_Fb.y / (m * GRAV)) * 0, -1, 1); H.alt = H.pos.y;
    H.vib = Math.min(1, 0.15 * H.stall + 0.5 * H.vrs + M.vib + (H.etl > 0.2 && H.etl < 0.8 ? 0.08 : 0) + Math.max(0, H.mu - 0.22) * 2);
    rotorStrike(env);
  }

  // ------------------------------------------------------------------------------------- skids
  const slip = U.SKIDS.map(() => [0, 0]); H.skidSlip = slip; H.wasDown = false;   // (on H, not in the closure: COMMANDER swaps whole Huey states, units/commander/swapstate.js)
  let tStep = 0;   // tStep: time into this frame step
  // the ground under (x, z) now: a deck that climbs or sinks (the SKY CARRIER) has moved on since groundY was sampled
  function groundAt(env, x, z) {
    const g = env.groundY(x, z); if (!tStep || !env.surfVel) return g;
    const sv = env.surfVel(x, z); return sv && sv.vy ? g + sv.vy * tStep : g;
  }
  function surfaceVel(env, x, z, out) { const sv = env.surfVel ? env.surfVel(x, z) : null; return sv ? out.set(sv.vx + sv.w * (z - sv.cz), sv.vy || 0, sv.vz - sv.w * (x - sv.cx)) : out.set(0, 0, 0); }
  function settleSkids(env) {   // after a reset on the ground: stand level on the skids at the highest ground below them
    H.settle = false;
    let g = -1e9; for (const [x, y] of U.SKIDS) { H.worldPoint([x, y, U.SKID_Z], _p); g = Math.max(g, env.groundY(_p.x, _p.z)); }
    H.pos.y = g + U.SKID_Z - 0.035; surfaceVel(env, H.pos.x, H.pos.z, H.vel); H.landed = true; H.wasDown = true;
    for (const s of slip) s[0] = s[1] = 0;
  }
  const _fwd = new THREE.Vector3(), _lat = new THREE.Vector3(), _em = new THREE.Vector3(), _emb = new THREE.Vector3();
  function effMass(r, d, m) {   // mass a push along d at lever r (world) feels: 1 / (1/m + (r x d) . I^-1 (r x d))
    toF(_em.copy(r).cross(d).applyQuaternion(_iq), _emb); const [Ixx, Iyy, Izz] = U.I;
    return 1 / (1 / m + _emb.x * _emb.x / Ixx + _emb.y * _emb.y / Iyy + _emb.z * _emb.z / Izz);
  }
  function contact(h, env, M, m) {
    fromF(_wb, _ow).applyQuaternion(H.q);                       // world angular velocity
    const k = 160000, c = 14000, tol = M.skidTol ?? 1;
    let n = 0, nsum = 0, first = null, gmin = 1e9;
    H.forward(_fwd); _fwd.y = 0; if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1); _fwd.normalize(); _lat.set(-_fwd.z, 0, _fwd.x);
    for (let i = 0; i < U.SKIDS.length; i++) {
      const [sx, sy] = U.SKIDS[i];
      fromF(_t.set(sx, sy, U.SKID_Z), _r).applyQuaternion(H.q); _p.copy(_r).add(H.pos);
      const gy = groundAt(env, _p.x, _p.z), pen = gy - _p.y; gmin = Math.min(gmin, -pen);
      if (pen <= 0) { slip[i][0] = slip[i][1] = 0; continue; }
      const wet = typeof env.water === 'function' ? env.water(_p.x, _p.z) : !!env.water;
      if (wet) { ev('water'); H.dead = 'water'; return; }
      _w.copy(_ow).cross(_r).add(H.vel).sub(surfaceVel(env, _p.x, _p.z, _sv));
      if (!first) first = { vy: _w.y, hs: Math.hypot(_w.x, _w.z) };
      let N = k * Math.min(pen, 0.25) - c * _w.y * (_w.y < 0 ? 1 : 0.3) + (pen > 0.25 ? 2e6 * (pen - 0.25) : 0);
      N = Math.max(0, N); n++; nsum += N;
      // skid friction: sliding along the skid is easier than sideways; deadbeat (on the effective mass the point sees,
      // rotation included, shared by load) with a slip anchor so it holds still
      const vl = _w.dot(_fwd), vs = _w.dot(_lat), share = N / Math.max(N, H._nsum || 0, 1) * 0.5 / h;
      slip[i][0] += vl * h; slip[i][1] += vs * h;
      const fl = -(vl + slip[i][0] * 6) * effMass(_r, _fwd, m) * share, fs = -(vs + slip[i][1] * 6) * effMass(_r, _lat, m) * share, ml = 0.45 * N, ms = 0.7 * N;
      if (Math.abs(fl) > ml) slip[i][0] = 0; if (Math.abs(fs) > ms) slip[i][1] = 0;
      _f.set(0, N, 0).addScaledVector(_fwd, clamp(fl, -ml, ml)).addScaledVector(_lat, clamp(fs, -ms, ms));
      _Fw.add(_f); _Tw.add(_t.copy(_r).cross(_f));
    }
    H.agl = Math.max(0, gmin); H.contacts = n; H._nsum = nsum;
    const up = H.up(_t).y, tilt = Math.acos(clamp(up, -1, 1));
    if (n && !H.wasDown && first) {   // touchdown
      if (first.vy < -8 * tol || first.hs > 14 * tol || tilt > 0.7) { ev('crash'); H.dead = 'crash'; return; }
      ev(first.vy < -4.5 * tol || first.hs > 9 * tol || tilt > 0.42 ? 'hardland' : 'land', { vy: first.vy, hs: first.hs });   // skids: a ~15 kt run-on is fine (INFERRED)
    }
    if (n && tilt > 0.75) { ev('crash'); H.dead = 'crash'; return; }   // rolled over
    H.wasDown = n > 0;
    const W = m * GRAV;
    H.landed = n >= 2 && nsum > 0.08 * W && H.vel.distanceTo(surfaceVel(env, H.pos.x, H.pos.z, _sv)) < 2.5;
    // the tail stinger and the nose: a scrape on lift-off, a strike if it is mishandled
    H.worldPoint(U.TAIL_SKID, _p); const gT = groundAt(env, _p.x, _p.z);
    if (_p.y < gT - 0.25) { const mis = H.vel.length() > 2 || H.attitude().pitch > 0.15; if (mis && !H.tailHit) { H.tailHit = true; ev('tailstrike'); } H.pos.y += Math.min(0.05, gT - 0.25 - _p.y); if (H.vel.y < 0) H.vel.y *= 0.5; }
    else if (_p.y > gT) H.tailHit = false;
    H.worldPoint(U.NOSE, _p); if (_p.y < groundAt(env, _p.x, _p.z) - 0.3) { ev('crash'); H.dead = 'crash'; }
  }
  function rotorStrike(env) {   // the blade tips (on the tip-path plane) touching the ground
    if (H.omega < 3) return;
    const hub = H.worldPoint(U.HUB, _hub);
    _n.copy(XS).multiplyScalar(H.tx).addScaledVector(YS, H.ty).addScaledVector(ZS, -1).normalize();
    for (let a = 0; a < 6.28; a += 0.785) {
      const e = _r.set(Math.cos(a), Math.sin(a), 0); e.addScaledVector(_n, -e.dot(_n)).normalize();   // in the disc
      fromF(e.multiplyScalar(U.R), _w).applyQuaternion(H.q).add(hub);
      if (_w.y < env.groundY(_w.x, _w.z)) { ev('rotor'); H.dead = 'rotor'; return; }
    }
  }
  return H;
}
