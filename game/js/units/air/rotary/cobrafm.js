// AH-1T Improved SeaCobra flight model (Bell 209 lineage, USMC, in service from 1977). Pure JS: runs in node
// (tools/cobrabench.mjs). PARITY: the Task Force's AI attack helicopter, the counterpart of the RUNAWAY's RW-3 WASP.
//
// A single main rotor helicopter on the shared parts (rotor.js blade-element rotor, rb.js rigid body + gear), with the
// Huey's layout (hueyfm.js), because the Cobra IS a Huey underneath (Bell 209 = UH-1 dynamics in a slim gunship body):
// - Main rotor: 2-blade TEETERING (underslung see-saw hub, no hinge offset, no hub spring): no hub moment at all, so
//   all pitch / roll control comes from tilting the thrust about the CG (hub height x thrust x TPP tilt), and a low-g
//   push-over leaves no control (and bangs the mast stop: mast bumping is flagged). Counter-clockwise from above (US).
//   No Bell stabiliser bar on the Cobra: the SCAS (3-axis rate damping) does that work.
// - Tail rotor: a 2-blade fan on the RIGHT of the fin (tractor; INFERRED for the T: the AH-1J had it on the left),
//   pitch from the pedals, momentum thrust, its power taken from the main gearbox.
// - Engine: the T400 TWIN-PAC (P&WC PT6T): two power sections through one combining gearbox. eng[0], eng[1] are
//   the two sections; an N2 governor (PI + collective anticipator), gas-generator lag, single-section flight possible.
// - Drive train: a transmission torque limit; rotor + drive polar inertia behind a freewheel (autorotation).
// - Fuselage: the slim Cobra (38 in wide): little side area, a small flat-plate drag; stub wings (lift a little in
//   cruise); a synchronised elevator on the boom; the big swept fin, cambered to unload the tail rotor in cruise.
// - Skid gear (6 contact points), events like the CH-46 (land / hardland / crash / water / rollover).
//
// Tags: CONFIRMED = a published source; INFERRED = estimated / scaled / tuned (stated); UNVERIFIED = a figure seen
// quoted but not confirmed from a primary source.
// Sources: VFS VertiFlite "Vertical Flight Development" aircraft database, AH-1T entry (VFS): MTOW 14,000 lb, max
// level speed 149 kt, Vne 190 kt, ROC 1,785 fpm, service ceiling 7,400 ft, overall length 58.1 ft, width (rotor)
// 47.9 ft, height 13.7 ft, fuselage 45.6 ft, airframe width (stub wings) 10.8 ft; Jane's All the World's Aircraft
// 1980-81 (via secondary quotes, UNVERIFIED): T400-WV-402 1,970 shp, empty 8,014 lb; Wikipedia AH-1 SuperCobra
// (AH-1J / AH-1W specs, for the shared dynamic system); NASA / Army AH-1G data (TM-X-62,xxx series, for inertias).
import { createRotor, inflowTarget, clamp } from './rotor.js';
import { createBody, sstep, attitude, cross } from './rb.js';

export const KT = 1.94384, FT = 3.28084, LB = 2.20462, HP = 745.7;
const D2R = Math.PI / 180;
export const COBRA = {
  // weights: empty 8,014 lb (Jane's, UNVERIFIED; the VFS database lists 8,553 lb - the empty weight with the turret and
  // pylons fitted: INFERRED that the two figures differ by mission equipment), max gross 14,000 lb (VFS, CONFIRMED)
  EMPTY: 3880, MTOW: 6350,
  CREW: 2 * 95,                                     // pilot (aft) and gunner / co-pilot (front)
  FUEL_KG: 920,                                     // 304 US gal JP-5 (INFERRED: AH-1T internal tanks ~ 300 gal)
  // a combat load (INFERRED): 750 rounds of 20 mm in the turret (~ 190 kg with links), two LAU-68 7-tube pods with
  // rockets (2 x 103 kg), two empty TOW launchers off (not carried in this war: game level)
  STORES_KG: 400,
  // inertias FRD kg m2 (INFERRED: AH-1G values ~ [3500, 17500, 14500] at 9,500 lb scaled by mass and the longer AH-1T
  // fuselage/boom)
  I: [4400, 24000, 21000],
  // main rotor: 48 ft diameter (VFS width 47.9 ft = the rotor: CONFIRMED), 2 blades (CONFIRMED), chord 33 in
  // (Model 214/309-derived blade: UNVERIFIED), 294 rpm = the AH-1W's 100% NR (same dynamic system: INFERRED; tip speed
  // 739 ft/s), twist -10 deg (INFERRED), Lock number 5.5 (heavy wide blades: INFERRED)
  R: 7.315, NB: 2, CHORD: 0.838, OMEGA: 294 * Math.PI / 30, TWIST: -10 * D2R, LOCK: 5.5,
  // hub FRD from the CG: the mast just behind the CG, hub 2.30 m above it (height to the top of the hub 13.7 ft =
  // 4.17 m: CONFIRMED; CG 1.62 m over the ground: INFERRED); shaft tilted 4 deg forward (INFERRED, the Huey has 5)
  HUB: [0.06, 0, -2.30], CG_H: 1.62, SHAFT: 3 * D2R,
  MAST_STOP: 0.21,                                  // teeter stop ~ 12 deg (INFERRED)
  // controls (INFERRED rigging): collective 0.5..17.5 deg at 0.75 R; cyclic +-11 deg longitudinal, +-8 deg lateral
  TH_MIN: 0.5 * D2R, TH_SPAN: 17 * D2R, CYC_LON: 11 * D2R, CYC_LAT: 8 * D2R,
  // tail rotor: 9 ft 8.5 in diameter (UNVERIFIED, AH-1T/W), 2 blades, chord 11.5 in (UNVERIFIED), driven at 4.71 x NR
  // (tip speed ~ 215 m/s: INFERRED), on the right side of the fin near its top (INFERRED position)
  TR_R: 1.48, TR_SIGMA: 2 * 0.292 / (Math.PI * 1.48), TR_RATIO: 4.71, TR_HUB: [-8.85, 0.42, -1.75], TR_PITCH0: 0.095, TR_PITCH_K: 0.25, TR_BLOCK: 0.95, TR_DAMP: 90,
  // engine: T400-WV-402 twin-pac, 1,970 shp take-off (UNVERIFIED: Jane's via secondary sources; the VFS entry names
  // the T400-CP-400 of the AH-1J, 1,800 shp) = 985 shp per power section; transmission 2,050 shp take-off,
  // 1,770 shp max continuous (both UNVERIFIED: quoted for the AH-1T drive train); power lapse (rho/rho0)^1.15 (INFERRED)
  P_SEC: 985 * HP, XMSN: 2050 * HP, MCP: 1770 * HP,
  I_ROTOR: 5200 + 600,                              // main rotor polar + drive train at the mast (INFERRED: the UH-1H's 3,362 x the wider blade)
  // fuselage: flat-plate drag area (INFERRED: 2.8 m2 = 30 ft2, tuned to the 149 kt max level speed at max gross
  // and max continuous power with a combat load: the slim fuselage ~ 1.1 m2 + stub wings, rocket pods, turret, the
  // 2-blade hub and mast, the exhausts ~ 1.7 m2; the clean AH-1G is quoted near 20 ft2), side and
  // plan areas, the cabin's unstable pitch moment, yaw of the slim body; the stub wings (3.3 m span, 2.6 m2, lift ~
  // 2.5 per rad: INFERRED)
  FUS: { fx: 2.8, fy: 13, fz: 11, Mw: 22, Nv: 18 },
  WING: { S: 2.6, a: 2.5, i: 4 * D2R, x: 0.2 },
  // synchronised elevator on the boom (INFERRED: ~ 7 ft span, 1.6 m2, low aspect ratio), the swept fin (2.0 m2, camber)
  STAB: { pos: [-5.3, 0, -0.35], S: 1.6, a: 3.2, i0: 0.5 * D2R, k: 5 * D2R },
  FIN: { pos: [-8.2, 0, -1.25], S: 2.0, a: 2.6, CAMBER: 0.07 },
  // skids: bottom 1.62 m below the CG, track +-1.07 m (INFERRED: 7 ft), front / middle / rear contact points
  SKID_Z: 1.62, SKIDS: [[1.75, -1.07], [1.75, 1.07], [0.0, -1.07], [0.0, 1.07], [-1.9, -1.07], [-1.9, 1.07]],
  // published performance (VFS, CONFIRMED unless tagged)
  PUB: { VMAX: 149, VNE: 190, ROC: 1785, CEIL: 7400 },
  // the AI pilot's gains for this airframe (pilot.js): crisp attitude loops (the teetering rotor is quick in roll),
  // aggressive velocity loop - it is a gunship
  PILOT: { kv: 0.55, aMax: 6.5, aFwd: 3.4, aDec: 3.0, tilt: 0.62, th: [4, 1.0, 2.5], ph: [3, 1.2, 1.2], vz: [0.09, 0.07], coll0: 0.55, psi: [1.1, 0.6], r: [1.6, 1.2], trimI: 0.005, rate: 0.35, ped0: -0.35 },
};
const C = COBRA;
const ROTOR = { R: C.R, nb: C.NB, chord: C.CHORD, root: 0.15, twist: C.TWIST, a: 5.9, cd0: 0.0085, d2: 0.32, aStall: 0.25, omega0: C.OMEGA, dir: +1, lock: C.LOCK, e: 0, Sb: 0, kSpring: 0, N: 8 };
const TR_A = Math.PI * C.TR_R * C.TR_R;

export function createCobraSim(G = 9.81) {
  const R = createRotor(ROTOR);
  const S = {
    fuelKg: C.FUEL_KG, stores: C.STORES_KG,
    get mass() { return C.EMPTY + C.CREW + S.fuelKg + S.stores; },
    omega: C.OMEGA, rotor: R, eng: [mkEng(), mkEng()],
    // pilot / AI controls: coll 0..1, lon (+aft) -1..1, lat (+right), ped (+right), sas
    c: { coll: 0, lon: 0, lat: 0, ped: 0 }, sas: true,
    ias: 0, vz: 0, agl: 0, landed: true, torque: 0, power: 0, pAvail: 0, events: [], dead: false, rho: 1.225, vib: 0, mods: null,
    trT: 0, trQ: 0, trLi: 0.05, trPower: 0, mastBump: 0, nz: 1,
    get rpm() { return S.omega / C.OMEGA; }, xmsn: C.XMSN,
    reset(pos, yaw = 0, landed = true, env = null) {
      S.body.reset(pos, yaw, landed, env); S.omega = C.OMEGA; S.dead = false; S.mastBump = 0;
      R.reset(landed ? 0.01 : 0.06); S.trLi = 0.05; for (const e of S.eng) { e.on = true; e.n1 = landed ? 0.8 : 0.9; e.ok = true; }
      S.c.coll = landed ? 0 : 0.55; S.c.lon = S.c.lat = 0; S.c.ped = landed ? 0 : -0.35; S.landed = landed; S.events.length = 0;
    },
    step(dt, ctl, env) {
      S.events.length = 0; if (!(dt > 0)) return null;
      const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
      for (let i = 0; i < n && !S.dead; i++) sub(h, ctl, env);
      return S.events[0] || null;
    },
    attitude(out) { return attitude(S.body.q, out); },
  };
  function mkEng() { return { on: true, ok: true, n1: 0.9, p: 0, q: 0 }; }
  const body = S.body = createBody({ mass: () => S.mass, I: C.I, gear: C.SKIDS.map(([x, y]) => ({ at: [x, y, C.SKID_Z], k: 150000, c: 16000, mu: 0.45, muS: 0.7 })) });

  // shaft axes (FRD): x forward in the hub plane, y right, z down the mast (leaning forward by SHAFT)
  const SX = [Math.cos(C.SHAFT), 0, Math.sin(C.SHAFT)], SZ = [-Math.sin(C.SHAFT), 0, Math.cos(C.SHAFT)];
  const _vb = [0, 0, 0], _hv = [0, 0, 0], _p = [0, 0, 0], _f = [0, 0, 0], _m = [0, 0, 0], _att = {}, _r = [0, 0, 0];
  const inp = { u: 0, v: 0, w: 0, p: 0, q: 0, th75: 0, lon: 0, lat: 0, om: 0, zg: Infinity, lx: 0, rho: 1.225, lift: 1 };
  // a force (FRD, N) at a point (FRD, m from the CG)
  function addF(fx, fy, fz, at) { body.F[0] += fx; body.F[1] += fy; body.F[2] += fz; _f[0] = fx; _f[1] = fy; _f[2] = fz; cross(at, _f, _m); body.M[0] += _m[0]; body.M[1] += _m[1]; body.M[2] += _m[2]; }
  function pointVel(at, vb, wb, out) { cross(wb, at, out); out[0] += vb[0]; out[1] += vb[1]; out[2] += vb[2]; return out; }

  function sub(h, ctl, env) {
    const M = env.mods || S.mods || {};
    S.rho = env.rho ?? 1.225; const rr = S.rho / 1.225;
    // controls: hydraulic servos (boosted), SCAS rate damping (+-20% authority)
    const c = S.c, mv = (cur, t, r) => cur + clamp(t - cur, -r * h, r * h);
    c.coll = mv(c.coll, clamp(ctl.coll ?? 0, 0, 1), 1.6); c.lon = mv(c.lon, clamp(ctl.lon ?? 0, -1, 1), 5); c.lat = mv(c.lat, clamp(ctl.lat ?? 0, -1, 1), 5); c.ped = mv(c.ped, clamp(ctl.ped ?? 0, -1, 1), 4);
    body.bodyVel(_vb); const wb = body.w, V = Math.hypot(_vb[0], _vb[1]);
    S.ias = V * KT;
    const sas = (ctl.sas ?? S.sas) && M.sasOk !== false ? 1 : 0;
    const sq = clamp(-0.35 * wb[1], -0.2, 0.2) * sas, sp = clamp(-0.18 * wb[0], -0.2, 0.2) * sas, sr = clamp(-0.9 * wb[2], -0.25, 0.25) * sas;
    const lon = c.lon + sq, lat = c.lat - sp, ped = c.ped + sr;
    // ---- main rotor (shaft-axis inputs)
    pointVel(C.HUB, _vb, wb, _hv);
    inp.u = _hv[0] * SX[0] + _hv[2] * SX[2]; inp.v = _hv[1]; inp.w = _hv[0] * SZ[0] + _hv[2] * SZ[2];
    inp.p = wb[0] * SX[0] + wb[2] * SX[2]; inp.q = wb[1]; inp.om = S.omega; inp.rho = S.rho; inp.lift = M.lift ?? 1;
    body.worldPoint(C.HUB, _p); inp.zg = _p[1] - Math.max(env.groundY(_p[0], _p[2]), -50);
    inp.th75 = C.TH_MIN + C.TH_SPAN * c.coll; inp.lon = -C.CYC_LON * lon; inp.lat = C.CYC_LAT * lat;
    R.step(h, inp);
    // teeter stop: the disc can't lean further than the stop against the mast; at low thrust that's a mast bump
    const lean = Math.hypot(R.tx, R.ty);
    if (lean > C.MAST_STOP) { R.tx *= C.MAST_STOP / lean; R.ty *= C.MAST_STOP / lean; if (R.ct < 0.0012 && S.rpm > 0.5) { S.mastBump += h; if (S.mastBump > 0.6) { S.events.push('mastbump'); S.dead = 'mastbump'; } } }
    else S.mastBump = Math.max(0, S.mastBump - h * 0.2);
    // rotor loads to the body: thrust along the TPP normal + H-force at the hub; teetering hub: no hub moment; torque
    const F = R.F;
    addF(F[0] * SX[0] + F[2] * SZ[0], F[1], F[0] * SX[2] + F[2] * SZ[2], C.HUB);
    body.M[0] += R.M[2] * SZ[0]; body.M[2] += R.M[2] * SZ[2];   // torque reaction (CCW rotor: nose right)
    // ---- tail rotor (a fan pushing the tail right; moving right = climbing for it)
    tailRotor(h, ped, M, _vb, wb);
    addF(0, S.trT, 0, C.TR_HUB);
    // ---- drive train
    drivetrain(h, ctl, M);
    // ---- fuselage, rotor wash on it at low speed
    const Fu = C.FUS, u = _vb[0], v = _vb[1], vi = Math.max(0, R.vi), wake = 1 - sstep(4, 16, V), q0 = 0.5 * S.rho;
    const w = _vb[2] - 1.4 * vi * wake;
    body.F[0] += -q0 * Fu.fx * u * Math.abs(u); body.F[1] += -q0 * Fu.fy * v * Math.abs(v); body.F[2] += -q0 * Fu.fz * w * Math.abs(w);
    body.M[1] += q0 * Fu.Mw * w * Math.abs(u) * sstep(3, 12, Math.abs(u));       // + nose up with angle of attack (the cabin is unstable)
    body.M[2] += -q0 * Fu.Nv * v * Math.abs(u) * 0.3 * sstep(3, 12, Math.abs(u)); // the long slim nose: a little unstable in yaw
    // stub wings: a little lift in cruise (they carry the pylons)
    if (u > 5) { const a = Math.atan2(_vb[2], u) + C.WING.i, cl = clamp(C.WING.a * a, -0.9, 0.9); addF(0, 0, -q0 * C.WING.S * cl * u * u, [C.WING.x, 0, 0]); }
    // synchronised elevator (incidence with the stick: nose-down stick -> leading edge down) in the wash at low speed
    {
      const St = C.STAB; pointVel(St.pos, _vb, wb, _r);
      const Vh = Math.hypot(u, v), dw = vi * (0.9 * wake + 1.4 * Math.exp(-(((Vh - 11) / 6) ** 2)) + 0.8 * sstep(12, 30, Vh));
      const wl = _r[2] - dw, ul = Math.max(1, Math.abs(_r[0])), al = Math.atan2(wl, ul) + St.i0 - St.k * c.lon, V2 = ul * ul + wl * wl;
      const cl = Math.abs(al) < 0.3 ? St.a * al : Math.sign(al) * Math.max(St.a * 0.3 * (1.3 - Math.abs(al)), 0.7 * Math.abs(Math.sin(al)));
      addF(0, 0, -q0 * St.S * V2 * cl, St.pos);
    }
    // the fin: weathercock, cambered to push the tail right in cruise (unloads the tail rotor)
    {
      const Fn = C.FIN; pointVel(Fn.pos, _vb, wb, _r);
      const ul = Math.max(1, Math.abs(_r[0])), b = Math.atan2(_r[1], ul), V2 = ul * ul + _r[1] * _r[1];
      const cl = Fn.a * clamp(b, -0.35, 0.35) - Fn.CAMBER * Fn.a;
      addF(0, -q0 * Fn.S * V2 * cl * sstep(2, 12, ul), 0, Fn.pos);
    }
    // airframe damping (the boom swinging through the wash; INFERRED)
    body.M[0] += -1500 * wb[0]; body.M[1] += -6000 * wb[1]; body.M[2] += -5200 * wb[2] * (0.4 + wake) - 1400 * wb[2] * Math.abs(wb[2]);
    S.nz = -body.F[2] / (S.mass * G);
    body.integrate(h, env, G);
    // read-outs, events
    S.vz = body.vel[1]; S.agl = body.agl; S.landed = body.landed;
    S.vib = Math.min(1, 0.6 * R.vrs + 0.5 * R.stall + Math.max(0, R.mu - 0.3) * 2 + (M.vib || 0));
    if (body.touch) { const t = body.touch; body.touch = null; S.events.push(t.vy < -4.5 || t.hs > 9 ? 'hardland' : 'land'); if (t.vy < -8.5) { S.events.push('crash'); S.dead = 'crash'; } }
    if (body.wet && !env.floats) { S.events.push('water'); S.dead = 'water'; }
    S.attitude(_att); if (body.contacts && Math.abs(_att.roll) > 0.6) { S.events.push('crash'); S.dead = 'rollover'; }
  }

  // tail rotor: momentum thrust along +y (body right), Huey style; power reflected to the main rotor shaft
  const _vt = [0, 0, 0];
  function tailRotor(h, ped, M, vb, wb) {
    const Om = Math.max(S.omega * C.TR_RATIO, 1), VT = Om * C.TR_R, live = (M.tail ?? 1) > 0 ? M.tail ?? 1 : 0;
    pointVel(C.TR_HUB, vb, wb, _vt);
    const th = C.TR_PITCH0 - C.TR_PITCH_K * ped, lc = _vt[1] / VT, mu = Math.hypot(_vt[0], _vt[2]) / VT;
    const lam = S.trLi + lc;
    let ct = (C.TR_SIGMA * 5.73 / 2) * (th * (1 / 3 + mu * mu / 2) - lam / 2); ct = clamp(ct, -0.022, 0.022);
    const tgt = inflowTarget(ct, lc, mu); S.trLi += (tgt - S.trLi) * Math.min(1, h / 0.03);
    S.trT = (ct * S.rho * TR_A * VT * VT * C.TR_BLOCK - C.TR_DAMP * _vt[1] * Math.min(1, S.rpm)) * live;
    const cdm = 6 * Math.abs(ct) / (C.TR_SIGMA * 5.73), cq = ct * (1.15 * S.trLi + lc) + C.TR_SIGMA * (0.009 + 0.4 * cdm * cdm) / 8 * (1 + 4.65 * mu * mu);
    S.trQ = Math.max(0, cq * S.rho * TR_A * VT * VT * C.TR_R) * (live > 0 ? 1 : 0) * C.TR_RATIO;   // at the mast
    S.trPower = S.trQ * S.omega;
  }

  // twin-pac T400: two power sections into one combining gearbox, N2 governor, gas generator lag (as the CH-46's pair)
  function drivetrain(h, ctl, M) {
    const lapse = (S.rho / 1.225) ** 1.15, nr = S.omega / C.OMEGA, err = (ctl.beep ? 1 + ctl.beep : 1) - nr;
    S.govI = clamp((S.govI ?? 0.75) + err * 3 * h, 0.3, 1.05);
    let qe = 0, live = 0;
    for (let i = 0; i < 2; i++) {
      const e = S.eng[i], ok = e.ok && e.on && (M['eng' + i] ?? true) && ctl['eng' + i] !== false && (M.fuel ?? 1) > 0 && S.fuelKg > 0;
      const share = 1.05 * C.XMSN / Math.max(1, S.live ?? 2) / Math.max(0.5, 2 - nr), top = 0.6 + 0.4 * Math.min(1.1, share / (C.P_SEC * lapse)) ** (2 / 3);
      // demand: governor PI + collective anticipator, topped near the drive train limit; in the air the gas generators
      // stay at flight idle (~68% N1) so a dumped collective doesn't leave them minutes from power (INFERRED, PT6T)
      const dem = ok ? clamp(Math.min(S.govI + err * 8 + 0.25 * S.c.coll - 0.1, top), S.body.contacts ? 0.62 : 0.68, 1.02) : 0;
      e.n1 += clamp((dem - e.n1) * 2.0, -0.3, 0.14) * h;   // ~3.5 s idle -> max (INFERRED, PT6T)
      e.p = ok ? C.P_SEC * lapse * Math.max(0, (e.n1 - 0.6) / 0.4) ** 1.5 : 0;
      e.q = e.p / C.OMEGA * Math.max(0, 2 - nr);
      if (ok) live++; qe += e.q;
    }
    S.live = live;
    // freewheel: the engines can only drive the rotor
    const qLoad = R.Q + S.trQ + 0.03 * C.P_SEC * 2 / C.OMEGA * nr;   // + accessories / gearbox loss (~3%, INFERRED)
    const drive = Math.max(0, qe);
    S.omega = Math.max(0, S.omega + (drive - qLoad) / C.I_ROTOR * h);
    S.power = drive * S.omega; S.torque = drive * C.OMEGA / C.XMSN;
    S.pAvail = S.eng.reduce((a, e) => a + (e.ok && e.on ? C.P_SEC * lapse : 0), 0);
  }
  return S;
}
