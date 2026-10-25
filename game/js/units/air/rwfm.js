// RUNAWAY aircraft for the parametric airframe: the RW-4 SHRIKE (a futuristic air-superiority drone: no cockpit, high
// g, fly-by-wire) and the seized MQ-9A REAPER (turboprop UAV, refitted by the RUNAWAY with a crude tailhook so it can
// recover aboard the KRAKEN). Pure; runs in node.
// Tags: CONFIRMED = published figure, INFERRED = derived / tuned, FICTION = invented for the RUNAWAY.
import { createAirframe, clamp, ATM } from './airframe.js';
import { mulberry32 } from './tomcatfm.js';

// --------------------------------------------------------------------------------------------- RW-4 SHRIKE (FICTION)
// Sized like a small single-engine fighter (Gripen-ish mass), with a variable-cycle engine giving T/W ~1.6, an
// unmanned 12 g airframe and a 43° AoA limit: about twice the Hornet's agility, which is the point of it.
export const SHRIKE = {
  EMPTY: 5200, FUEL_MAX: 1800, GUN_MAX: 200, S: 26, B: 9.2, C: 3.4, I: [11000, 52000, 60000],
  TMIL: 72000, TAB: 118000, GEAR: [[0, -1.6, -3.4], [-1.4, -1.6, 0.7], [1.4, -1.6, 0.7]],
  K: [150000, 280000, 280000], DAMP: [35000, 60000, 60000], STROKE: 0.35, HOOK_TIP: [0, -1.55, 4.9],
  HULL: [[0, -0.1, -6.8], [0, -0.62, 0], [0, -0.35, 5.0], [-4.6, 0.05, 2.6], [4.6, 0.05, 2.6], [-1.9, 1.5, 4.9], [1.9, 1.5, 4.9], [0, 0.6, -2]],
  VNE_GEAR: 130, STORE_KG: 70,
};
export const SHRIKE_AF = {
  name: 'SHRIKE', ...SHRIKE, NENG: 1, ENG_Y: 0, REST_H: 1.5, CAT_STAB: 0.08, N_OVER: 14, N_BREAK: 18,
  aero: {
    CL0: 0.02, CLA: 3.3, CLMAX: 1.9, CLMIN: -1.2, DCL_FLAP: 0.35, DCL_LEF: 0.15, CLDE: -0.3,
    CD0: 0.016, KIND: 0.12, WAVE: 0.035, MW0: 0.85, MW1: 1.1, CD_GEAR: 0.02, CD_FLAP: 0.03, CD_LEF: 0.004, CD_BRAKE: 0.05, CD_STORE: 0,
    SEP0: 0.68, SEPF: 0, SEP1: 0.98, CMA: -0.12, CMQ: -5, CMDE: 1.1, CM0: 0,
    CLB: -0.06, CLP: -0.3, CLR: 0.08, CLDA: 0.2, CLDR: -0.01, CNB: 0.08, CNP: -0.03, CNR: -0.3, CNDA: -0.01, CNDR: 0.09,
    CYB: -0.6, CYDR: -0.15, LIM: { stab: 0.5, ail: 0.5, rud: 0.6 }, RATE: { stab: 1.4, ail: 2.5, rud: 2.0 },
  },
  eng: { idle: 0.68, span: 0.32, thrMil: 0.8, thrAB: 0.84, abSpan: 0.16, upLo: 0.15, upHi: 0.3, dn: 0.35, ffIdle: 0.05, ffMil: 0.9, ffAB: 3.0 },
  fcs: { law: 'ndi', nmax: 12, nmaxPA: 4, nmin: -4, nminPA: -1, alim: 0.75, alimPA: 0.4, pmax: 6 },
  initStores: () => ['L1', 'L2', 'R1', 'R2'].map(st => ({ w: 'rwaam', st, on: true })),
  mass: A => { let m = SHRIKE.EMPTY + A.fuel + A.gun * 0.6; for (const s of A.stores) if (s.on) m += SHRIKE.STORE_KG; return m; },
  storeDrag: () => 0,
};
export function createShrikeSim(GRAV = 9.0, opts = {}) { const A = createAirframe(opts.fuelX ? { ...SHRIKE_AF, FUEL_X: opts.fuelX } : SHRIKE_AF, GRAV); A.rng = mulberry32(opts.seed ?? 4); return A; }

// --------------------------------------------------------------------------------------------- MQ-9A REAPER
export const REAPER = {
  EMPTY: 2223,           // kg (CONFIRMED GA-ASI: 4,900 lb)
  FUEL_MAX: 1800,        // kg (CONFIRMED ~3,900 lb internal)
  GUN_MAX: 0,
  S: 23.8,               // m2: span 20.1 m (CONFIRMED 66 ft), aspect ratio ~17 (INFERRED)
  B: 20.1, C: 1.2,
  I: [16000, 9500, 24500],   // INFERRED: long wings with fuel in them
  POWER: 671000,         // W, Honeywell TPE331-10 900 shp (CONFIRMED)
  PROP_D: 2.6,           // m, 3-blade pusher (INFERRED)
  GEAR: [[0, -1.15, -2.6], [-1.35, -1.15, 0.45], [1.35, -1.15, 0.45]],
  K: [50000, 90000, 90000], DAMP: [12000, 20000, 20000], STROKE: 0.28, HOOK_TIP: [0, -1.05, 4.4],
  HULL: [[0, -0.25, -5.0], [0, -0.75, 0], [0, -1.05, 5.0], [-10.0, 0.35, 0.6], [10.0, 0.35, 0.6], [-2.0, 0.9, 4.8], [2.0, 0.9, 4.8]],
  VNE_GEAR: 75, HELLFIRE_KG: 48,
};
// turboprop: power lever -> gas generator (spool ~1.5 s), shaft power lapses with density; propeller thrust from
// momentum theory, capped by the static thrust. The prop sees the equivalent airspeed (forces are real at the same
// dynamic pressure in this 4x-density world, so thrust = eta P / EAS keeps the real performance).
function turboprop(A, h, ctl, M, mods) {
  const e = A.eng[0], hp = mods.eng[0], thr = clamp(ctl.throttle[0], 0, 1);
  if (e.run && (A.fuel <= 0 || hp <= 0.02)) { e.run = false; A.ev('flameout', { k: 0 }); }
  const ncmd = e.run ? 0.68 + 0.32 * thr * Math.min(1, hp * 1.3) : Math.min(0.12, A.eas / 600);
  e.n += clamp((ncmd - e.n) * 2, -0.25, 0.22) * h;
  const pw = e.run ? clamp((e.n - 0.66) / 0.34, 0, 1) : 0, sig = A.rho / ATM.RHO0;
  const P = REAPER.POWER * pw * sig ** 0.7 * Math.max(0.25, hp), V = Math.max(A.eas, 8), disk = Math.PI * REAPER.PROP_D ** 2 / 4;
  const tStatic = 0.75 * Math.cbrt(2 * ATM.RHO_SL * disk) * Math.pow(P, 2 / 3);
  e.thrust = Math.min(tStatic, 0.8 * P / V); e.power = P;
  e.ff = e.run ? 0.012 + 0.058 * pw : 0;   // kg/s: TPE331 ~0.6 lb/shp/h at full power (CONFIRMED order)
  if (A.P.FUEL_X) e.ff *= A.P.FUEL_X;
  A.fuel = Math.max(0, A.fuel - e.ff * h);
  e.egt += ((e.run ? 450 + 400 * pw : 20) - e.egt) * Math.min(1, h); e.ab = 0; e.nozzle = 0; e.oil = e.run ? 80 : 0;
  e.rpm = e.run ? 0.96 + 0.04 * pw : e.n;   // the prop governor holds rpm
}
export const REAPER_AF = {
  name: 'REAPER', ...REAPER, TMIL: 0, TAB: 0, NENG: 1, ENG_Y: 0, REST_H: 1.12, CAT_STAB: 0.05, N_OVER: 4.5, N_BREAK: 6.5,
  aero: {
    CL0: 0.35, CLA: 5.2, CLMAX: 1.55, CLMIN: -0.6, DCL_FLAP: 0.45, DCL_LEF: 0, CLDE: -0.4,
    CD0: 0.024, KIND: 0.022, WAVE: 0.03, MW0: 0.55, MW1: 0.8, CD_GEAR: 0.012, CD_FLAP: 0.03, CD_LEF: 0, CD_BRAKE: 0.03, CD_STORE: 0.0025,
    SEP0: 0.22, SEPF: 0.02, SEP1: 0.45, CMA: -0.9, CMQ: -18, CMDE: 1.5, CM0: 0,
    CLB: -0.08, CLP: -0.55, CLR: 0.15, CLDA: 0.18, CLDR: 0.005, CNB: 0.06, CNP: -0.05, CNR: -0.12, CNDA: -0.01, CNDR: 0.05,
    CYB: -0.4, CYDR: -0.1, LIM: { stab: 0.35, ail: 0.35, rud: 0.45 }, RATE: { stab: 1, ail: 1, rud: 1 },
  },
  eng: { idle: 0.68 },
  fcs: { law: 'sas', q0: 1800, gexp: 1, gmin: 0.3, kq: -0.15, q0r: 4000, gminr: 0.5, kp: 0.06, kr: 0.6, kb: 0, kari: 0.1 },
  initStores: () => ['L1', 'L2', 'R1', 'R2'].map(st => ({ w: 'hellfire', st, on: true })),
  mass: A => { let m = REAPER.EMPTY + A.fuel; for (const s of A.stores) if (s.on) m += REAPER.HELLFIRE_KG; return m; },
  storeDrag: A => A.stores.filter(s => s.on).length,
  engineFn: turboprop,
};
export function createReaperSim(GRAV = 9.0, opts = {}) { const A = createAirframe(opts.fuelX ? { ...REAPER_AF, FUEL_X: opts.fuelX } : REAPER_AF, GRAV); A.rng = mulberry32(opts.seed ?? 9); A.flapSel = 0; return A; }
