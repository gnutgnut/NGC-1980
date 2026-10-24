// Carrier fighter flight model: the F/A-18A "HORNET" of 1980 (full-scale development jets, F404-GE-400 engines). Pure: three.js maths only, no DOM, so it runs in node tests.
//
// World scale: the archipelago is ~1.3 km across, so a real-speed jet would cross it in seconds. Instead the air here is
// 4x sea-level density (and sound travels at 170 m/s). Every force, moment and g-load is the real aircraft's at the
// same dynamic pressure, and the airspeed indicator (which measures dynamic pressure, i.e. equivalent airspeed) reads
// the real numbers: ~135 kt on approach, ~350 kt corner speed, about Mach 1 flat out. True speeds are half of that and
// turn circles a quarter of the size, so the jet fits the map.
//
// Frames: the airframe lives in three.js axes (x right, y up, nose along -z). The dynamics are done in aircraft body
// axes FRD (x forward, y right, z down): p roll right, q pitch up, r yaw right. Conversion: F = (-z3, x3, -y3).
//
// Model (per 1/240 s substep):
// - Aero: lift curve with a soft stall and a flat-plate post-stall blend; drag polar + transonic drag rise + gear,
//   flaps, speedbrake, stores; side force; roll/pitch/yaw moments from linear derivatives (NASA HARV F/A-18 order of
//   magnitude) that degrade past the stall (directional stability goes, so DIRECT-mode departures and spins happen).
// - Rigid body with Hornet mass and inertia (Ixx 31k, Iyy 205k, Izz 230k kg m2), Euler's equations.
// - Two engines: spool lag, afterburner light-off, thrust lapse, fuel flow, EGT, nozzle, start / shut-down / flame-out.
// - Flight control system (CAS, like the Hornet's): stick commands g in pitch (neutral = hold the flight path,
//   AoA limiter, 7.5 g limit, 3.5 g with the gear down), roll rate in roll, sideslip with automatic turn coordination
//   in yaw. Implemented as dynamic inversion of the aero model. DIRECT mode = stick straight to the surfaces.
//   wheel steering, all relative to a moving deck. Catapult and arresting wires on the carrier.
//
// The model itself is the parametric airframe (units/air/airframe.js, shared with the TOMCAT, SHRIKE and REAPER);
// this file holds the Hornet's numbers. tools/jetfingerprint.mjs proves it bit-identical to the original Hornet code.
import { createAirframe, aeroCoeffs as afCoeffs, ATM, KT, FT, LB, DECKOPS, rhoAt } from './units/air/airframe.js';
export { ATM, KT, FT, LB, DECKOPS, rhoAt };

export const HORNET = {
  EMPTY: 10400, FUEL_MAX: 2720, GUN_MAX: 120,   // kg; gun "rounds" are tracer bursts of 5 real rounds
  S: 37.16, B: 11.43, C: 3.51, I: [31000, 205000, 230000],
  // N per engine. 1980 = F404-GE-400: 16,000 lbf with afterburner (GE, Jane's Aero-Engines: CONFIRMED), ~10,600 lbf
  // dry (sources give 10,500-10,700: INFERRED). Was 48,900 / 79,200 N, the 1990s F404-GE-402 EPE of the F/A-18C.
  TMIL: 47150, TAB: 71170,
  GEAR: [[0, -2.05, -4.6], [-1.6, -2.05, 0.6], [1.6, -2.05, 0.6]],   // nose, left main, right main: wheel bottoms
  K: [260000, 480000, 480000], DAMP: [55000, 95000, 95000], STROKE: 0.42,
  HOOK_TIP: [0, -1.95, 6.9],
  // airframe points that must never touch the ground (nose, belly, nozzles, fin tips, wingtips, stab tips, canopy)
  HULL: [[0, -0.1, -8.6], [0, -0.95, -1], [0, -0.85, 3], [-0.62, -0.72, 7.6], [0.62, -0.72, 7.6], [-2.2, 3.3, 8.0], [2.2, 3.3, 8.0],
    [-5.9, 0, 2.4], [5.9, 0, 2.4], [-3.3, -0.15, 7.9], [3.3, -0.15, 7.9], [0, 1.45, -4]],
  STORES: { aam: 86, bomb: 241 },
  VNE_GEAR: 130,   // m/s EAS (250 kt): gear / flaps limit
};
// aero data (NASA HARV F/A-18 order of magnitude)
const HORNET_AERO = {
  CL0: 0.03, CLA: 3.6, CLMAX: 1.65, CLMIN: -1.05, DCL_FLAP: 0.52, DCL_LEF: 0.08, CLDE: -0.35,
  CD0: 0.0205, KIND: 0.13, WAVE: 0.045, MW0: 0.8, MW1: 1.08, CD_GEAR: 0.024, CD_FLAP: 0.04, CD_LEF: 0.004, CD_BRAKE: 0.055, CD_STORE: 0.0018,
  SEP0: 0.5, SEPF: 0.04, SEP1: 0.8,
  CMA: -0.32, CMQ: -6, CMDE: 0.92, CM0: 0.012,
  CLB: -0.09, CLP: -0.32, CLR: 0.12, CLDA: 0.15, CLDR: -0.012,
  CNB: 0.11, CNP: -0.04, CNR: -0.32, CNDA: -0.010, CNDR: 0.085,
  CYB: -0.85, CYDR: -0.16,
  LIM: { stab: 0.42, ail: 0.44, rud: 0.52 }, RATE: { stab: 0.7, ail: 1.75, rud: 1.4 },
};
// the full parameter set the airframe flies
export const HORNET_AF = {
  name: 'HORNET', ...HORNET, NENG: 2, ENG_Y: 0.62, REST_H: 1.92, CAT_STAB: 0.12, N_OVER: 9.5, N_BREAK: 12.5,
  aero: HORNET_AERO,
  // F404: idle 68% (+32% to MIL at 80% throttle), AB from 84%; spool rates per second; fuel flow kg/s
  eng: { idle: 0.68, span: 0.32, thrMil: 0.8, thrAB: 0.84, abSpan: 0.16, upLo: 0.09, upHi: 0.17, dn: 0.22, ffIdle: 0.07, ffMil: 1.55, ffAB: 4.2 },
  // CAS by dynamic inversion: 7.5 g (3.5 g gear / flaps down), AoA limit 27° (24° PA), ~240°/s roll command
  fcs: { law: 'ndi', nmax: 7.5, nmaxPA: 3.5, nmin: -3, nminPA: -1, alim: 0.47, alimPA: 0.42, pmax: 4.2 },
  initStores: () => ({ aam: [true, true], bomb: [true, true, true, true] }),
  mass: A => { const s = A.stores; return HORNET.EMPTY + A.fuel + s.aam.filter(Boolean).length * HORNET.STORES.aam + s.bomb.filter(Boolean).length * HORNET.STORES.bomb + A.gun * 1.1; },
  storeDrag: A => A.stores.aam.filter(Boolean).length + A.stores.bomb.filter(Boolean).length,
};
export function aeroCoeffs(a, b, M, cfg, out = {}) { return afCoeffs(HORNET_AERO, a, b, M, cfg, out); }
export function createJetSim(GRAV = 9.0) { return createAirframe(HORNET_AF, GRAV); }
