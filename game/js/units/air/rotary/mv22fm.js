// MV-22B Osprey flight model (tiltrotor), as seized and crewed by the RUNAWAY. Pure JS: runs in node (tools/mv22bench.mjs).
//
// Two 3-blade gimballed proprotors on wingtip nacelles that tilt from 97.5 deg (helicopter, a little aft) to 0 deg
// (airplane), linked by a cross-shaft so either engine turns both. Rotors are rotor.js discs (blade-element strips:
// the same code is a helicopter rotor at 90 deg and a propeller in high axial inflow at 0 deg). Real air, real size.
// - Controls through the flight control system (the V-22 is fly-by-wire): stick and pedals are mixed by nacelle angle.
//   Helicopter mode: longitudinal cyclic (both rotors) = pitch, DIFFERENTIAL COLLECTIVE = roll, differential
//   longitudinal cyclic = yaw. Airplane mode: elevator, flaperons, twin rudders. The rotor terms wash out as the
//   nacelles come down (sin of the nacelle angle) while the surfaces gain authority with dynamic pressure.
// - Thrust control lever (TCL) -> collective, on a schedule with the axial inflow so the lever keeps meaning "thrust"
//   from the hover to 270 kt (the FCS's collective-airspeed schedule); engines govern rotor rpm: 412 rpm in
//   helicopter / conversion, 333 rpm in airplane mode (CONFIRMED two-speed rotor).
// - Nacelle actuator: 0..97.5 deg (CONFIRMED), 90 deg in ~12 s (CONFIRMED) -> 7.5 deg/s.
// - Wing in the rotor downwash in the hover (download ~10% of thrust, INFERRED from the tiltrotor literature), wing
//   lift + flaperons by halves (roll damping), H-tail with elevator, twin fins with rudders, fuselage drag.
// - Retractable tricycle gear.
// Tags: CONFIRMED = published (Wikipedia MV-22B specification block from NAVAIR / Bell-Boeing; rotor rpm from the
// Bell-Boeing guidebook figures quoted by AOPA / FlightGlobal), INFERRED = estimated / tuned (stated).
import { createRotor, clamp } from './rotor.js';
import { createBody, sstep, attitude, cross } from './rb.js';

export const KT = 1.94384, HP = 745.7, D2R = Math.PI / 180;
export const MV22 = {
  EMPTY: 14432, GROSS: 17917, MTOW_V: 23859,          // kg: 31,818 lb empty, 39,500 lb gross, 52,600 lb max VTOL (CONFIRMED)
  CREW: 3 * 90, FUEL_KG: 3000, TROOPER_KG: 150,       // a RUNAWAY machine trooper ~150 kg (INFERRED)
  I: [150000, 175000, 290000],                       // kg m2 (INFERRED: fuselage + two ~2 t nacelles at 7 m)
  // proprotors: 38 ft 1 in diameter (CONFIRMED), 3 blades (CONFIRMED), solidity 0.105 (literature, INFERRED),
  // twist ~ -40 deg over the blade (the real one is -47 deg, nonlinear; INFERRED linear fit), gimbal spring (INFERRED)
  R: 5.805, NB: 3, CHORD: 0.638, TWIST: -0.70, LOCK: 3.8, K_SPRING: 30000,
  OMEGA_H: 412 * Math.PI / 30, OMEGA_A: 333 * Math.PI / 30,   // 412 / 333 rpm (CONFIRMED)
  PIVOT: [0.05, 7.0, -1.9], MAST: 1.9,               // nacelle pivot on the wing tip, hub 1.9 m out along the shaft (INFERRED); span 25.8 m with rotors (CONFIRMED 84 ft 7 in)
  CG_H: 2.35,                                         // CG over the ground on the gear (INFERRED)
  NAC_MAX: 97.5 * D2R, NAC_RATE: 7.5 * D2R,           // 0..97.5 deg (CONFIRMED), 90 deg in ~12 s (CONFIRMED)
  // engines: 2 x Rolls-Royce AE 1107C (T406), 6,150 shp max each (CONFIRMED); cross-shafted
  P_ENG: 6150 * HP, I_ROT: 2 * 4200 + 2500,
  // controls (INFERRED rigging): collective span 28 deg; differential collective +-3.5 deg; cyclic +-8 deg; diff cyclic +-6 deg
  TH_SPAN: 28 * D2R, DIFF: 3.5 * D2R, CYC: 8 * D2R, DCYC: 6 * D2R,
  // wing: 28.0 m2 (CONFIRMED), span 14 m (CONFIRMED 45 ft 10 in), incidence 3 deg; thick (23%) section with flaperons:
  // CLmax 1.6 clean / ~2.0 flaperons drooped (INFERRED)
  WING: { S: 28.0, b: 14.0, inc: 3 * D2R, a: 4.6, cl0: 0.15, clmax: 1.6, cd0: 0.009, e: 0.78, x: 0.0, z: -1.8, flapCl: 0.45, ail: 0.35 },
  HT: { S: 8.9, x: -8.3, z: -1.2, a: 3.6, inc: -3 * Math.PI / 180, tau: 0.5, maxEl: 20 * D2R },   // horizontal tail (INFERRED)
  VT: { S: 11.4, x: -8.6, z: -2.2, a: 3.0, tau: 0.45, maxRud: 20 * D2R },        // twin fins (INFERRED)
  FUS: { f: 3.55, fy: 30, fz: 40, Mw: 45, Nv: 60 },   // flat plate (INFERRED, tuned to 275 kt SL), side, plan; unstable pitch / yaw moments
  WASH: 1.45,                                         // downwash on the wing, x the rotors' induced velocity (INFERRED: gives the ~10% hover download)
  GEAR: [[5.3, 0, 2.35], [-0.9, -2.2, 2.35], [-0.9, 2.2, 2.35]],
  // published performance (CONFIRMED): max speed 275 kt SL (305 kt at 15,000 ft), stall 110 kt, climb 2,320-4,000 fpm,
  // ceiling 25,000 ft, disc loading 20.9 lb/ft2 at 47,500 lb, conversion ~12 s
  PUB: { VMAX: 275, VSTALL: 110, ROC: [2320, 4000], DL: 20.9 },
  // the AI pilot's helicopter-mode gains
  PILOT: { kv: 0.5, aMax: 2.2, tilt: 0.2, th: [3.2, 1.4, 1.4], ph: [3, 1.4, 1.0], vz: [0.08, 0.06], coll0: 0.5, psi: [0.8, 0.3], r: [1.4, 0.8], trimI: 0.004, rate: 0.14 },
};
const C = MV22;
const ROTOR = dir => ({ R: C.R, nb: C.NB, chord: C.CHORD, root: 0.15, twist: C.TWIST, a: 5.9, cd0: 0.0085, d2: 0.3, aStall: 0.26, omega0: C.OMEGA_H, dir, lock: C.LOCK, kSpring: C.K_SPRING, N: 10 });

export function createMV22Sim(G = 9.81) {
  const rR = createRotor(ROTOR(+1)), rL = createRotor(ROTOR(-1));   // right rotor counter-clockwise from above in the hover, left clockwise (INFERRED)
  const S = {
    payload: 12 * C.TROOPER_KG, fuelKg: C.FUEL_KG,
    get mass() { return C.EMPTY + C.CREW + S.fuelKg + S.payload; },
    omega: C.OMEGA_H, rR, rL, eng: [{ ok: true, n1: 0.9, p: 0 }, { ok: true, n1: 0.9, p: 0 }],
    nac: 90 * D2R, nacCmd: 90 * D2R, gear: 1, gearCmd: 1, flap: 1,
    // controls: tcl 0..1, lon (+aft), lat (+right), ped (+right), nac (deg command), gear (1 down), flap 0..1
    c: { tcl: 0, lon: 0, lat: 0, ped: 0 }, ias: 0, alpha: 0, beta: 0, agl: 0, landed: true, power: 0, torque: 0, events: [], dead: false, rho: 1.225, mods: null,
    wingL: 0, download: 0, rpmCmd: 1, kH: 1, thGov: 0.2,
    get rpm() { return S.omega / C.OMEGA_H; },
    reset(pos, yaw = 0, landed = true, env = null, nacDeg = 90) {
      S.body.reset(pos, yaw, landed, env); S.omega = C.OMEGA_H; S.dead = false; S.nac = S.nacCmd = nacDeg * D2R;
      S.gear = S.gearCmd = 1; rR.reset(landed ? 0.01 : 0.08); rL.reset(landed ? 0.01 : 0.08);
      for (const e of S.eng) { e.ok = true; e.n1 = landed ? 0.8 : 0.92; }
      S.c.tcl = landed ? 0 : 0.5; S.c.lon = S.c.lat = S.c.ped = 0; S.events.length = 0;
    },
    step(dt, ctl, env) {
      S.events.length = 0; if (!(dt > 0)) return null;   // a zero step (first frame) would divide by zero in the gear friction
      const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
      for (let i = 0; i < n && !S.dead; i++) sub(h, ctl, env);
      return S.events[0] || null;
    },
    attitude(out) { return attitude(S.body.q, out); },
    // the conversion corridor (INFERRED from the published XV-15 / V-22 corridor shape): KCAS limits per nacelle angle
    // the floor scales with the wing's flapped stall speed at this weight (the published 110 kt is a light, power-on figure)
    get vStall() { return Math.sqrt(S.mass * G / (0.5 * S.rho * C.WING.S * (C.WING.clmax + C.WING.flapCl))) * KT * Math.sqrt(S.rho / 1.225); },
    corridor(nacDeg) { const n = clamp(nacDeg, 0, 97.5), vs = S.vStall; return { min: n >= 75 ? (n > 90 ? -35 : 0) : vs * 1.15 * (1 - n / 75) ** 0.55, max: Math.min(300, 120 + (90 - n) * 2.3) }; },
  };
  const body = S.body = createBody({ mass: () => S.mass, I: C.I, gear: C.GEAR.map(at => ({ at, k: 500000, c: 60000, mu: 0.7 })) });
  // shaft axes for a nacelle angle (FRD): thrust (-Zs) from straight up (90) to straight ahead (0)
  const ax = { X: [0, 0, 0], Y: [0, 1, 0], Z: [0, 0, 0] };
  const hubR = [0, 0, 0], hubL = [0, 0, 0];
  function axes(n) {
    const cs = Math.cos(n), sn = Math.sin(n);
    ax.Z[0] = -cs; ax.Z[1] = 0; ax.Z[2] = sn; ax.X[0] = sn; ax.X[1] = 0; ax.X[2] = cs;
    for (const [hub, s] of [[hubR, 1], [hubL, -1]]) { hub[0] = C.PIVOT[0] + C.MAST * cs; hub[1] = s * C.PIVOT[1]; hub[2] = C.PIVOT[2] - C.MAST * sn; }
  }
  const _vb = [0, 0, 0], _hv = [0, 0, 0], _f = [0, 0, 0], _m = [0, 0, 0], _p = [0, 0, 0], _r = [0, 0, 0], _att = {};
  const inR = { u: 0, v: 0, w: 0, p: 0, q: 0, th75: 0, lon: 0, lat: 0, om: 0, zg: Infinity, lx: 0, rho: 1.225, lift: 1 }, inL = { ...inR };
  function rotorIn(inp, hub, vb, wb, zg) {
    cross(wb, hub, _hv); _hv[0] += vb[0]; _hv[1] += vb[1]; _hv[2] += vb[2];
    inp.u = _hv[0] * ax.X[0] + _hv[2] * ax.X[2]; inp.v = _hv[1]; inp.w = _hv[0] * ax.Z[0] + _hv[2] * ax.Z[2];
    inp.p = wb[0] * ax.X[0] + wb[2] * ax.X[2]; inp.q = wb[1]; inp.zg = zg; inp.om = S.omega; inp.rho = S.rho;
  }
  function addRotor(R, hub) {
    const F = R.F, M = R.M;
    _f[0] = F[0] * ax.X[0] + F[2] * ax.Z[0]; _f[1] = F[1]; _f[2] = F[0] * ax.X[2] + F[2] * ax.Z[2];
    body.F[0] += _f[0]; body.F[1] += _f[1]; body.F[2] += _f[2];
    cross(hub, _f, _m); body.M[0] += _m[0] + M[0] * ax.X[0] + M[2] * ax.Z[0]; body.M[1] += _m[1] + M[1]; body.M[2] += _m[2] + M[0] * ax.X[2] + M[2] * ax.Z[2];
  }
  const hubH = (hub, env) => { body.worldPoint(hub, _p); return _p[1] - Math.max(env.groundY(_p[0], _p[2]), -50); };
  // a lifting surface: local velocity at point r (FRD), force along normal / drag; returns lift for read-outs
  function surface(r, vb, wb, S_, a, cl0, clmax, cd0, inc, nrm, k = 1, qScale = 1, downw = 0) {
    cross(wb, r, _r); const u = vb[0] + _r[0], v = vb[1] + _r[1], w = vb[2] + _r[2] - downw;
    if (nrm === 'z') {   // horizontal: lift along -z in the x-z plane
      const V2 = u * u + w * w; if (V2 < 1) return 0;
      const al = Math.atan2(w, Math.max(0.1, u)) + inc, sa = Math.abs(al), st = sstep(clmax / a, clmax / a + 0.12, sa);
      const cl = ((cl0 + a * al) * (1 - st) + Math.sign(al) * 1.1 * Math.sin(2 * sa) * st) * k, cd = cd0 + cl * cl * 0.04 + st * 1.2 * Math.sin(al) ** 2;
      const q = 0.5 * S.rho * V2 * S_ * qScale, V = Math.sqrt(V2), L = cl * q, D = cd * q;
      _f[0] = (L * w - D * u) / V; _f[1] = 0; _f[2] = (-L * u - D * w) / V;   // lift perpendicular to the flow
      body.F[0] += _f[0]; body.F[2] += _f[2]; cross(r, _f, _m); body.M[0] += _m[0]; body.M[1] += _m[1]; body.M[2] += _m[2];
      return L;
    }
    const V2 = u * u + v * v; if (V2 < 1) return 0;   // vertical: side force along y
    const b = Math.atan2(v, Math.max(0.1, u)), sb = Math.abs(b), st = sstep(0.35, 0.5, sb), cy = (-(a * b) * (1 - st) - Math.sign(b) * 1.0 * Math.sin(2 * sb) * st) + (k - 1);
    const q = 0.5 * S.rho * V2 * S_; _f[0] = -cd0 * q; _f[1] = cy * q; _f[2] = 0;
    body.F[0] += _f[0]; body.F[1] += _f[1]; cross(r, _f, _m); body.M[0] += _m[0]; body.M[1] += _m[1]; body.M[2] += _m[2];
    return 0;
  }
  const WR = [0, 0, 0], WL = [0, 0, 0], HTP = [C.HT.x, 0, C.HT.z], VTP = [C.VT.x, 0, C.VT.z];

  function sub(h, ctl, env) {
    const M = env.mods || S.mods || {}; S.rho = env.rho ?? 1.225;
    const c = S.c, mv = (cur, t, r) => cur + clamp(t - cur, -r * h, r * h);
    c.tcl = mv(c.tcl, clamp(ctl.tcl ?? 0, 0, 1), 1.2); c.lon = mv(c.lon, clamp(ctl.lon ?? 0, -1, 1), 4); c.lat = mv(c.lat, clamp(ctl.lat ?? 0, -1, 1), 4); c.ped = mv(c.ped, clamp(ctl.ped ?? 0, -1, 1), 4);
    // nacelles, gear, flaps (actuators)
    if (ctl.nac !== undefined) S.nacCmd = clamp(ctl.nac * D2R, 0, C.NAC_MAX);
    S.nac = mv(S.nac, S.nacCmd, C.NAC_RATE * (0.45 + 0.55 * sstep(0, 0.2, Math.abs(S.nacCmd - S.nac))));   // the actuator eases into its stops (last ~10 deg slower) if (ctl.gear !== undefined) S.gearCmd = ctl.gear ? 1 : 0; S.gear = mv(S.gear, S.gearCmd, 0.12); body.gearDown = S.gear > 0.9;
    if (ctl.flap !== undefined) S.flap = mv(S.flap, clamp(ctl.flap, 0, 1), 0.2);
    axes(S.nac);
    body.bodyVel(_vb); const wb = body.w, u = _vb[0], V = Math.hypot(_vb[0], _vb[1], _vb[2]);
    S.ias = Math.max(0, u) * KT * Math.sqrt(S.rho / 1.225); S.alpha = Math.atan2(_vb[2], Math.max(1, u)); S.beta = Math.atan2(_vb[1], Math.max(1, u));
    // FCS: SAS rate damping on the stick (rotor and surfaces alike), mixing by nacelle angle
    const sas = M.sasOk === false ? 0 : 1, sn = Math.sin(S.nac), cs = Math.cos(S.nac);
    const lon = c.lon - clamp(0.6 * wb[1], -0.2, 0.2) * sas, lat = c.lat - clamp(0.45 * wb[0], -0.2, 0.2) * sas, ped = c.ped - clamp(1.0 * wb[2], -0.25, 0.25) * sas;
    // collective: scheduled with the axial inflow at 0.75 R so the TCL keeps meaning thrust (INFERRED FCS schedule)
    const ax_ = Math.max(0, u * cs - _vb[2] * sn), base = Math.atan2(ax_, 0.75 * S.omega * C.R) - 5.5 * D2R;   // TCL 0 = no thrust even in edgewise flow
    // helicopter share (kH): TCL -> collective, engines govern rpm. Airplane share: the collective governs rpm like a
    // constant-speed propeller and the TCL commands engine power (XV-15 / V-22 practice, INFERRED gains)
    // overspeed protection on the helicopter share: past +2% rotor speed the FCS adds collective (no windmilling runaway)
    const kH = S.kH = sstep(25 * D2R, 60 * D2R, S.nac), nr = S.omega / C.OMEGA_H, gerr = nr - S.rpmCmd;
    S.osI = clamp((S.osI || 0) + (gerr > 0.02 ? (gerr - 0.02) * 1.5 : -0.3 * (S.osI || 0)) * h, 0, 0.3); const os = S.osI + Math.max(0, gerr - 0.02) * 1.2;
    if (kH > 0.995) S.thGov = base + C.TH_SPAN * c.tcl + os; else S.thGov = clamp(S.thGov + gerr * 1.6 * h, base - 0.15, base + 0.5);
    const thAir = S.thGov + gerr * 0.9;
    const th = kH * (base + C.TH_SPAN * c.tcl + os) + (1 - kH) * thAir, rk = sn * sn, dif = C.DIFF * lat * (0.4 + 0.6 * rk);
    inR.th75 = th - dif; inL.th75 = th + dif; S.th75 = th;
    inR.lon = inL.lon = -C.CYC * lon * rk;                          // stick aft: both discs aft (helicopter pitch)
    inR.lon += -C.DCYC * ped * rk; inL.lon += C.DCYC * ped * rk;    // pedal right: right disc aft, left forward (yaw)
    inR.lat = inL.lat = 0; inR.lift = M.liftR ?? 1; inL.lift = M.liftL ?? 1;
    rotorIn(inR, hubR, _vb, wb, hubH(hubR, env)); rotorIn(inL, hubL, _vb, wb, hubH(hubL, env));
    rR.step(h, inR); rL.step(h, inL);
    addRotor(rR, hubR); addRotor(rL, hubL);
    drivetrain(h, ctl, M);
    // wing halves (in the downwash at low speed and high nacelle: download), flaperons for roll + flaps
    const wake = (1 - sstep(8, 30, Math.abs(u))) * sn * sn, vi = 0.5 * (rR.vi + rL.vi);
    WR[0] = C.WING.x; WR[1] = C.WING.b / 4; WR[2] = C.WING.z; WL[0] = C.WING.x; WL[1] = -C.WING.b / 4; WL[2] = C.WING.z;
    const fl = C.WING.flapCl * S.flap, ail = C.WING.ail * clamp(lat, -1, 1) * (1 - 0.5 * rk);
    let dl = 0; const LR = surface(WR, _vb, wb, C.WING.S / 2, C.WING.a, C.WING.cl0 + fl - ail, C.WING.clmax + fl * 0.8, C.WING.cd0 + 0.02 * S.flap, C.WING.inc, 'z', 1, 1, C.WASH * vi * wake);
    dl += _f[2]; const LL = surface(WL, _vb, wb, C.WING.S / 2, C.WING.a, C.WING.cl0 + fl + ail, C.WING.clmax + fl * 0.8, C.WING.cd0 + 0.02 * S.flap, C.WING.inc, 'z', 1, 1, C.WASH * vi * wake);
    S.wingL = LR + LL;
    dl += _f[2]; S.download = dl;   // read-out: the wings' force along +z (down): the hover download
    // tail: elevator on the H-tail, rudders on the twin fins; downwash from the wing on the tail
    const el = clamp(-lon, -1, 1) * C.HT.maxEl * (1 - 0.3 * rk), rd = clamp(ped, -1, 1) * C.VT.maxRud;
    surface(HTP, _vb, wb, C.HT.S, C.HT.a, C.HT.a * C.HT.tau * el, 1.2, 0.008, C.HT.inc - 0.35 * Math.max(0, S.alpha), 'z');
    surface(VTP, _vb, wb, C.VT.S, C.VT.a, 0.008, 1, 0.008, 0, 'y', 1 - C.VT.a * C.VT.tau * rd);
    // fuselage
    const F = C.FUS, q0 = 0.5 * S.rho, w = _vb[2] - 1.2 * vi * wake * 0.3;
    body.F[0] += -q0 * (F.f + (S.gear > 0.1 ? 0.6 * S.gear : 0)) * u * Math.abs(u); body.F[1] += -q0 * F.fy * _vb[1] * Math.abs(_vb[1]); body.F[2] += -q0 * F.fz * w * Math.abs(w) * 0.5;
    body.M[1] += q0 * F.Mw * _vb[2] * Math.abs(u); body.M[2] += -q0 * F.Nv * _vb[1] * Math.abs(u) * 0.3;
    body.M[0] += -20000 * wb[0]; body.M[1] += -40000 * wb[1]; body.M[2] += -60000 * wb[2];   // airframe damping (INFERRED)
    body.integrate(h, env, G);
    S.agl = body.gearDown ? body.agl : Math.max(0, body.pos[1] - C.CG_H - env.groundY(body.pos[0], body.pos[2]));   // gear up: from the belly
    S.landed = body.landed;
    if (!body.gearDown && body.pos[1] - env.groundY(body.pos[0], body.pos[2]) < 1.6) { S.events.push(env.water && env.water(body.pos[0], body.pos[2]) ? 'water' : 'crash'); S.dead = 'belly'; }
    if (body.touch) { const t = body.touch; body.touch = null; S.events.push(t.vy < -4 || t.hs > 10 ? 'hardland' : 'land'); if (t.vy < -9 || (!body.gearDown && t.hs > 2)) { S.events.push('crash'); S.dead = 'crash'; } }
    if (body.wet && !env.floats) { S.events.push('water'); S.dead = 'water'; }
    S.attitude(_att); if (body.contacts && Math.abs(_att.roll) > 0.5) { S.events.push('crash'); S.dead = 'rollover'; }
    // a proprotor striking the ground (nacelles low near the ground)
    if (S.nac < 60 * D2R && S.agl < 1.5 && S.omega > 0.3 * C.OMEGA_H && body.contacts) { S.events.push('crash'); S.dead = 'proprotor strike'; }
  }
  // engines on one cross-shaft: N2 governor to 412 rpm (helicopter, conversion) or 333 rpm (airplane mode below 30 deg)
  function drivetrain(h, ctl, M) {
    S.rpmCmd = S.nac < 30 * D2R && S.ias > 140 ? C.OMEGA_A / C.OMEGA_H : 1;
    const lapse = (S.rho / 1.225) ** 1.0, nr = S.omega / C.OMEGA_H, err = S.rpmCmd - nr;
    S.govI = clamp((S.govI ?? 0.6) + err * 3 * h, 0.3, 1.05);
    let qe = 0, live = 0;
    for (let i = 0; i < 2; i++) {
      const e = S.eng[i], ok = e.ok && (M['eng' + i] ?? true) && ctl['eng' + i] !== false;
      const demH = clamp(S.govI + err * 8 + 0.2 * S.c.tcl - 0.1, 0.62, 1.0), demA = 0.62 + 0.38 * clamp(S.c.tcl, 0, 1) ** 0.67;   // N1 1.0 = 6,150 shp, the maximum rating
      const dem = ok ? S.kH * demH + (1 - S.kH) * demA : 0;
      e.n1 += clamp((dem - e.n1) * 1.8, -0.3, 0.12) * h;
      e.p = ok ? C.P_ENG * lapse * Math.max(0, (e.n1 - 0.6) / 0.4) ** 1.5 : 0;
      if (ok) live++; qe += e.p / C.OMEGA_H * Math.max(0, 2 - nr);
    }
    S.live = live;
    const qLoad = rR.Q + rL.Q + 0.03 * C.P_ENG / C.OMEGA_H * nr + (ctl.rotorBrake ? 40000 * Math.min(1, S.omega) : 0);   // + the rotor brake for the fold
    S.omega = Math.max(0, S.omega + (qe - qLoad) / C.I_ROT * h);
    S.power = qe * S.omega; S.torque = S.power / (2 * C.P_ENG);
  }
  return S;
}
