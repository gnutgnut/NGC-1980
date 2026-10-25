// Grumman E-2C HAWKEYE (1980 VAW fit) for the parametric airframe (units/air/airframe.js): the TASK FORCE's airborne
// early-warning aircraft, the counterpart of the RUNAWAY's MQ-9 REAPER spotter. Flown exactly like the REAPER
// (rwfm.js): createAirframe with its own numbers and a twin-turboprop engine function; the AI pilot (pilot.js) flies
// it in a racetrack-free circular orbit ('patrol' / 'cap' state, capAlt / capR). Pure; runs in node
// (tools/hawkeyebench.mjs).
//
// World scale (as everywhere, see c130fm.js / jetfm.js): the air is 4x sea-level density, so forces, g and EAS are the
// real aircraft's and true speeds are half (K_EQ = 2); a world vertical speed is half the real one at the same climb
// gradient. The propeller thrust uses EAS (= the real-equivalent TAS at the game's low altitudes), so thrust and power
// are what the real aircraft has at the same indicated airspeed.
//
// Number tags: CONFIRMED = published (WIKI = Wikipedia E-2 Hawkeye, E-2C spec box, from Jane's All the World's Aircraft
// and the US Navy fact sheet; NAVY = navy.mil E-2 fact sheet; ALLISON = T56 series data); INFERRED = derived from those
// or tuned to hit them (the bench says which); UNVERIFIED = a sensible engineering guess.
import { createAirframe, clamp, ATM } from './airframe.js';

export const KT = 1.94384, FT = 3.28084, LB = 2.20462, FPM = 196.85;
export const HAWKEYE = {
  // geometry CONFIRMED (WIKI): span 80 ft 7 in (24.56 m), length 57 ft 6.75 in (17.54 m), height 18 ft 3.75 in
  // (5.58 m), wing area 700 sq ft (65.03 m2). Rotodome 24 ft (7.32 m) diameter (NAVY). MAC INFERRED (S / b, taper ~0.5).
  SPAN: 24.56, LENGTH: 17.54, HEIGHT: 5.58, S: 65.03, B: 24.56, C: 2.75, ROTODOME_D: 7.32,
  // weights: empty 38,063 lb (17,265 kg, Jane's E-2C; UNVERIFIED) + crew of 5 and their gear, oil, trapped fuel
  // = 17,950 kg INFERRED; internal fuel 12,400 lb (5,624 kg: 1,824 US gal JP-5, INFERRED from WIKI); max take-off
  // 53,000 lb (24,040 kg; E-2C Group 0, Jane's 51,933 lb - 53,000 lb in the brief: CONFIRMED range)
  EMPTY: 17950, FUEL_MAX: 5624, MTOW: 24040, GUN_MAX: 0,
  // inertia at ~23.5 t: Roskam radii of gyration for a twin turboprop (Rx .28, Ry .36, Rz .46) plus the 1.5 t rotodome
  // 3 m above the CG (adds to Ixx and Iyy): INFERRED
  I: [300000, 260000, 520000],
  // engines: 2 x Allison T56-A-425, 4,910 shp (3,661 kW) each (CONFIRMED: WIKI / ALLISON), Hamilton Standard 54460-1
  // four-blade props, 13 ft 6 in (4.11 m) (CONFIRMED: WIKI). Propeller efficiency and static thrust INFERRED (static
  // ~2.0 lbf / shp for a 13.5 ft prop at full power: ~44 kN each). The efficiency of the constant-speed prop rises with
  // airspeed, ~0.58 at the 175 KEAS climb speed to 0.8 above ~310 KEAS: tuned to the published climb and speed below.
  TMIL: 0, TAB: 0, P_MAX: 3661000, PROP_ETA: 0.8, ETA_V0: 90, ETA_0: 0.58, ETA_K: 0.0032, T_STATIC: 40000, PROP_R: 2.055,
  ENG_X: 3.66, ENG_Y: 3.66,   // nacelles 3.66 m either side of the centreline (thrust yaw arm): INFERRED from drawings
  PROP_Z: -4.55, PROP_YC: 0.25,   // prop plane and axis height (body frame): INFERRED
  // gear: nose gear and twin mains retracting forward into the nacelles; wheel bottoms 2.3 m below the CG (the real
  // aircraft sits nose-high on a long nose leg): INFERRED from drawings
  GEAR: [[0, -2.3, -5.35], [-3.66, -2.3, 0.9], [3.66, -2.3, 0.9]], K: [180000, 420000, 420000], DAMP: [30000, 70000, 70000], STROKE: 0.35,
  HOOK_TIP: [0, -1.55, 7.6], VNE_GEAR: 82, REST_H: 2.25,   // gear / flap limit ~160 KIAS: UNVERIFIED
  // points that must not touch the ground: nose, belly, tail, prop tips (low), wing tips, outboard fin tips, rotodome rim
  HULL: [[0, -0.6, -8.9], [0, -1.15, -4], [0, -1.15, 2], [0, -0.55, 7.9], [-3.66, 0.25 - 2.06, -4.55], [3.66, 0.25 - 2.06, -4.55],
    [-12.28, 1.05, 0.3], [12.28, 1.05, 0.3], [-3.95, 3.0, 8.0], [3.95, 3.0, 8.0], [0, 2.75, -2.2], [0, 2.75, 5.0]],
  STATIONS: {},
  // published performance the bench checks (tools/hawkeyebench.mjs)
  PERF: {
    VMAX_KT: 350,       // max speed (TAS, at altitude): CONFIRMED (WIKI)
    VCRUISE_KT: 256,    // cruise (TAS, at altitude): CONFIRMED (WIKI)
    ROC_FPM: 2515,      // initial rate of climb: CONFIRMED (WIKI) - at an unstated weight; the bench allows +-25 %
    CEIL_FT: 34700,     // service ceiling: CONFIRMED (WIKI) - not reachable in the world (heights are not scaled)
    VAPP_KT: 103,       // carrier approach speed at landing weight (~45,000 lb): UNVERIFIED (pilot accounts, NATOPS-class)
    VS_CLEAN_KT: 115,   // clean 1 g stall at ~50,000 lb: INFERRED (CLmax 1.65)
  },
};
const H = HAWKEYE;
// aero: a 63-series high-lift wing (NACA 63A216 root / 63A414 tip, WIKI) on a draggy airframe (rotodome and pylon,
// four fins, nacelles). CD0 back-solved from ~335 KEAS max level speed low down with the props above (the 350 kt is
// true airspeed at altitude); induced K = 1 / (pi A e), A 9.3, e 0.8. Moments from tail volumes (big tailplane, four
// fins): INFERRED. Big Fowler flaps (+1.2 CL, CLmax ~2.4 in the landing configuration: INFERRED from VAPP ~1.2 Vs).
const HAWKEYE_AERO = {
  CL0: 0.3, CLA: 5.0, CLMAX: 1.65, CLMIN: -0.9, DCL_FLAP: 1.2, DCL_LEF: 0, CLDE: -0.35,
  CD0: 0.027, KIND: 0.043, WAVE: 0.02, MW0: 0.62, MW1: 0.85, CD_GEAR: 0.018, CD_FLAP: 0.05, CD_LEF: 0, CD_BRAKE: 0, CD_STORE: 0,
  SEP0: 0.27, SEPF: 0.04, SEP1: 0.5,
  CMA: -0.9, CMQ: -16, CMDE: 1.5, CM0: 0.02,
  CLB: -0.09, CLP: -0.5, CLR: 0.15, CLDA: 0.15, CLDR: 0.008,
  CNB: 0.09, CNP: -0.04, CNR: -0.16, CNDA: -0.01, CNDR: 0.07,
  CYB: -0.75, CYDR: -0.15,
  LIM: { stab: 0.35, ail: 0.4, rud: 0.45 }, RATE: { stab: 0.9, ail: 1.2, rud: 1.0 },
};
// two turboprops: the power lever sets gas-generator power with a ~1.5 s lag; thrust = eta(EAS) P / EAS (EAS = the speed
// the real aircraft flies at this dynamic pressure), capped by static thrust; power lapses with density. The prop
// spins at a constant 100 % in flight (the governor), e.prop is the shaft speed the model spins the blades with.
function twinTurboprop(A, h, ctl, M, mods) {
  for (let k = 0; k < 2; k++) {
    const e = A.eng[k], thr = clamp(ctl.throttle[k] ?? ctl.throttle[0], 0, 1), hp = mods.eng[k] ?? 1;
    if (e.run && (A.fuel <= 0 || hp <= 0.02)) { e.run = false; A.ev('flameout', { k }); }
    const want = e.run ? 0.15 + 0.85 * thr : 0;
    e.n += clamp((want - e.n) * 0.7, -0.5, 0.5) * h;
    const P = H.P_MAX * e.n * (A.rho / ATM.RHO0) ** 0.7 * Math.max(0.25, hp), eta = clamp(H.ETA_0 + (A.eas - H.ETA_V0) * H.ETA_K, 0.4, H.PROP_ETA);
    e.thrust = e.run ? Math.min(H.T_STATIC, eta * P / Math.max(A.eas, 12)) : 0;
    e.power = P; e.ff = e.run ? 0.02 + 0.2 * e.n : 0;   // kg/s per engine (~0.5 lb/shp/h at full power, INFERRED)
    if (A.P.FUEL_X) e.ff *= A.P.FUEL_X;
    A.fuel = Math.max(0, A.fuel - e.ff * h); e.egt = e.run ? 600 + 400 * e.n : 20; e.oil = e.run ? 60 : 0; e.ab = 0; e.nozzle = 0;
    e.prop = e.run ? 1 : Math.max(0, (e.prop || 0) - 0.3 * h);   // shaft speed 0..1 (feathered when stopped)
  }
}
export const HAWKEYE_AF = {
  name: 'HAWKEYE', ...HAWKEYE, NENG: 2, CAT_STAB: 0.08, N_OVER: 3.0, N_BREAK: 4.5,   // +3.0 g limit: UNVERIFIED (transport-class AEW)
  aero: HAWKEYE_AERO,
  eng: { idle: 0.15, span: 0.85, thrMil: 1, thrAB: 2, abSpan: 1, upLo: 0.5, upHi: 0.5, dn: 0.5, ffIdle: 0.02, ffMil: 0.2, ffAB: 0 },
  // a stability-augmented aeroplane flown by the AI through the same NDI inner loop the REAPER uses: g and roll-rate
  // commands, AoA limit ~3° below the clean stall
  fcs: { law: 'ndi', nmax: 2.5, nmaxPA: 2, nmin: -0.5, nminPA: -0.5, alim: 0.21, alimPA: 0.24, pmax: 0.75 },
  initStores: () => [],
  mass: A => HAWKEYE.EMPTY + A.fuel,
  storeDrag: () => 0,
  engineFn: twinTurboprop,
};
export function createHawkeyeSim(GRAV = 9.0, opts = {}) {
  return createAirframe(opts.fuelX ? { ...HAWKEYE_AF, FUEL_X: opts.fuelX } : HAWKEYE_AF, GRAV);
}
// the AI pilot's numbers for it (pilot.js PILOTS.HAWKEYE is the same table): orbit at ~165 KEAS, 300 m up, 450 m
// radius; no radar intercepts, no weapons, no bingo (the host recovers it)
export const HAWKEYE_PILOT = { climbEAS: 85, capEAS: 85, corner: 100, fightTop: 120, vmin: 62, gmax: 2.0, gfight: 2.2, capAlt: 300, capR: 450, radar: 0, leash: 0, bingo: 0, weapons: [], gun: null, landX: -4.5, catX: 4.5 };
