// F-14A TOMCAT systems the player works (pure: no THREE, no DOM; runs in node, see tools/tomcatsysbench.mjs):
// - the WING SWEEP controls: AUTO (the CADC program), MAN (the thumb switch on the outboard throttle: aft of the
//   program only), the EMERGENCY handle (guard up: the wings go where the handle is, 20-68°) and OVERSWEEP (handle aft
//   past 68° on deck, weight on wheels, slow: 75°, to park). A dead CADC freezes the wings in AUTO / MAN; the
//   emergency handle still moves them (NATOPS: "wing sweep emergency"). The sim (tomcatfm.js config) does the motion.
// - the AFCS: stability augmentation (pitch / roll / yaw dampers: off = the stick straight to the surfaces), the
//   autopilot's ATTITUDE HOLD with control stick steering (fly it with the stick, let go and it holds the new attitude;
//   banks under 7° roll out and hold the heading) and ALTITUDE HOLD. It drops out past 70° of bank, with the gear
//   handle down, on the ground, or with the stab aug off / failed.
// - the TF30 start: air for the starter from the deck's start cart, cross-bleed from the other engine, or ram air
//   (windmill airstart above ~225 KEAS); the start sequence on the switches (ENG CRANK, throttles OFF / IDLE, wet
//   starts) and the generators / electrical buses (createStart, startStep: see below).
import { cadcSweep } from './tomcatfm.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const D2R = Math.PI / 180, KT = 1.94384;
export const SWEEP_RATE_HANDLE = 12;   // °/s the pilot moves the emergency handle / the MAN command (game)

// ------------------------------------------------------------------------------------------------ wing sweep
export function createSweepControl() { return { mode: 'AUTO', cmd: 20, handle: 20, thumb: 0, frozen: null, cmdNow: 20 }; }
export const overOk = A => A.onGround && A.eas < 30;   // the sim's OVERSWEEP gate (tomcatfm.js config)
// discrete presses: 'auto' | 'fwd' | 'aft' (one 5° click) | 'emer' (raise / stow the handle's guard). Returns a message.
export function sweepPress(SW, A, id) {
  if (id === 'auto') { if (SW.mode === 'EMER' || SW.mode === 'OVER') return 'STOW THE EMERGENCY HANDLE FIRST (9)'; SW.mode = 'AUTO'; return 'WING SWEEP AUTO  -  CADC'; }
  if (id === 'fwd' || id === 'aft') {
    const d = id === 'aft' ? 5 : -5;
    if (SW.mode === 'AUTO') { SW.mode = 'MAN'; SW.cmd = A.sweep; }
    if (SW.mode === 'MAN') SW.cmd = clamp(SW.cmd + d, 20, 68); else SW.handle = clamp(SW.handle + d, 20, A.onGround ? 75 : 68);
    return '';
  }
  if (id === 'emer') {
    if (SW.mode === 'EMER' || SW.mode === 'OVER') { SW.mode = 'AUTO'; return 'EMERGENCY HANDLE STOWED  -  WING SWEEP AUTO'; }
    SW.mode = 'EMER'; SW.handle = Math.round(A.sweep);
    return `EMERGENCY WING SWEEP  -  HANDLE AT ${SW.handle}°  (- / = MOVE IT${A.onGround ? ', AFT PAST 68 = OVERSWEEP' : ''})`;
  }
  return '';
}
// every frame: fwd / aft held (keys or the HOTAS switch), the CADC's health. Sets the sim's A.sweepMode / A.sweepCmd.
export function sweepStep(SW, A, fwd, aft, dt, cadcOk = true) {
  SW.thumb = fwd ? 1 : aft ? -1 : 0;
  const d = (aft ? 1 : 0) - (fwd ? 1 : 0);
  if (SW.mode === 'EMER' || SW.mode === 'OVER') {
    SW.handle = clamp(SW.handle + d * SWEEP_RATE_HANDLE * dt, 20, A.onGround ? 75 : 68);   // the quadrant's OVER gate opens on deck only
    SW.mode = SW.handle > 68.5 ? 'OVER' : 'EMER';
  } else if (d) { if (SW.mode === 'AUTO') { SW.mode = 'MAN'; SW.cmd = A.sweep; } SW.cmd = clamp(SW.cmd + d * 15 * dt, 20, 68); }
  if (!cadcOk && (SW.mode === 'AUTO' || SW.mode === 'MAN')) { if (SW.frozen === null) SW.frozen = A.sweep; A.sweepMode = 'emer'; A.sweepCmd = SW.frozen; }
  else { SW.frozen = null; A.sweepMode = { AUTO: 'auto', MAN: 'manual', EMER: 'emer', OVER: 'over' }[SW.mode]; A.sweepCmd = SW.mode === 'MAN' ? SW.cmd : SW.handle; }
  // where the wings are going (the indicator's command bug)
  const sched = cadcSweep(A.mach), flaps = A.flapSel > 0 || A.surf.flap > 0.05;
  SW.cmdNow = SW.frozen !== null ? SW.frozen : SW.mode === 'AUTO' ? (flaps ? 20 : sched) : SW.mode === 'MAN' ? (flaps ? 20 : Math.max(sched, SW.cmd))
    : SW.mode === 'OVER' ? (overOk(A) ? 75 : sched) : SW.handle;
  return SW.cmdNow;
}

// ------------------------------------------------------------------------------------------------ AFCS
export function createAfcs() { return { mode: 'OFF', ref: { pitch: 0, roll: 0, hdg: 0, alt: 0 }, css: false, drop: 0 }; }
// engage 'ATT' / 'ALT' (or 'OFF'): returns '' when engaged / off, else why not
export function afcsEngage(AP, A, mode, sasOk) {
  if (mode === 'OFF') { AP.mode = 'OFF'; AP.drop = 0; return ''; }
  if (!sasOk) return 'AUTOPILOT WILL NOT ENGAGE  -  STAB AUG OFF';
  if (A.onGround || A.cat) return 'AUTOPILOT  -  AIRBORNE ONLY';
  const att = A.attitude(); if (Math.abs(att.roll) > 1.0 || Math.abs(att.pitch) > 0.6) return 'AUTOPILOT  -  LEVEL THE WINGS FIRST';
  if (AP.mode === 'OFF' || mode === 'ALT') AP.ref.alt = A.pos.y;
  AP.ref.pitch = att.pitch; AP.ref.roll = Math.abs(att.roll) < 7 * D2R ? 0 : att.roll; AP.ref.hdg = A.heading();
  AP.mode = mode; AP.drop = 0; AP.css = false; AP.pi = 0; return '';
}
// c: the pilot's stick (modified in place when the autopilot holds). FD: units/air/fd.js on this airframe.
// Returns 'drop' when it disengaged itself this frame.
export function afcsStep(AP, A, FD, c, dt, sasOk) {
  if (AP.mode === 'OFF') return '';
  const att = A.attitude();
  if (!sasOk || Math.abs(att.roll) > 70 * D2R || A.onGround || A.gearCmd) { AP.mode = 'OFF'; AP.drop = 5; return 'drop'; }
  if (Math.abs(c.pitch) > 0.06 || Math.abs(c.roll) > 0.06) { AP.css = true; return ''; }   // control stick steering: the pilot flies
  if (AP.css) { AP.css = false; AP.pi = 0; AP.ref.pitch = att.pitch; AP.ref.roll = Math.abs(att.roll) < 7 * D2R ? 0 : att.roll; AP.ref.hdg = A.heading(); if (AP.mode === 'ALT' && Math.abs(A.vel.y) > 3) AP.ref.alt = A.pos.y; FD.gi = 0; }
  let phi = AP.ref.roll; if (phi === 0) phi = clamp(wrap(AP.ref.hdg - A.heading()) * 2, -0.35, 0.35);
  const base = Math.cos(att.pitch) / Math.max(0.3, Math.cos(att.roll)), ep = AP.ref.pitch - att.pitch;
  AP.pi = clamp((AP.pi || 0) + (AP.mode === 'ATT' ? ep * 1.5 * dt : 0), -0.5, 0.5);   // slow integral: holds through speed changes
  const n = AP.mode === 'ALT' ? base + 0.08 * (clamp((AP.ref.alt - A.pos.y) * 0.25, -12, 12) - A.vel.y) : base + 3 * ep + AP.pi - 0.6 * A.w.y;
  c.pitch = FD.pitchFor(clamp(n, -1, 4), dt); c.roll = FD.rollFor(phi);
  return '';
}

// ------------------------------------------------------------------------------------------------ TF30 start air
// which air turns the starter for engines ks (array of 0 / 1): 'CART' on deck, 'XBLEED' off a running engine,
// 'WINDMILL' above 225 KEAS, or null (no start possible)
export function startAir(A, ks) {
  if (A.onGround) return 'CART';
  if (A.eng.some((e, k) => !ks.includes(k) && e.run && e.n > 0.6)) return 'XBLEED';
  if (A.eas * KT > 225) return 'WINDMILL';
  return null;
}

// ------------------------------------------------------------------------------------------------ electrics and the TF30 start
// The pilot's start (NATOPS F-14A order, game-paced): external power and the deck's air cart (huffer) connected; ENG
// CRANK switch R (the right engine first), the starter motors the TF30; at 20% rpm the right THROTTLE from OFF to IDLE
// (fuel and ignition): light-off at ~24% and TIT rises; the crank switch drops back to OFF by itself at 50% rpm (a
// solenoid-held switch); the generator comes on line past ~55% and idles at ~68%. Then the left engine the same way
// (or on cross-bleed air from the right one). The throttle to IDLE before 15% rpm is a WET start: fuel pools in the
// burner and the light-off is a hot start (TIT over the red line, a little engine damage). Throttle OFF shuts an
// engine down. In flight the same switches do an airstart: cross-bleed off the other engine or windmill air above
// ~225 KEAS (startAir). Generators: L / R GEN (NORM / OFF); with neither on line in flight the emergency generator
// (driven off the combined hydraulics / ram air) keeps the essential bus (caution lights, standby instruments, VDI).
// A pure state machine: it moves the sim's e.start / e.run / e.n only (the flight model is untouched).
export const START = { MOTOR: 0.25, IGN: 0.2, WET: 0.15, CUTOUT: 0.5, GEN: 0.55, RATE: { CART: 0.032, XBLEED: 0.045, WINDMILL: 0.05 } };
export function createStart(hot = true) {
  return {
    crank: 'OFF', thrOff: [!hot, !hot], gen: [true, true], wet: [false, false], cn: [0, 0], cranking: [null, null],
    gens: [hot, hot], ext: false, bus: hot, emerg: false, ess: hot, auto: null,
  };
}
// set the whole thing hot (engines turning: the jet on the cat) or cold (shut down on deck)
export function startSet(SS, hot) { Object.assign(SS, createStart(hot)); return SS; }
// a click on a start / electrics control: 'crankL' | 'crankR' | 'thrL' | 'thrR' | 'genL' | 'genR'. Returns a message.
export function startPress(SS, A, id) {
  const k = id.endsWith('R') ? 1 : 0, side = k ? 'R' : 'L', e = A.eng[k];
  if (id === 'crankL' || id === 'crankR') {
    if (SS.crank === side) { SS.crank = 'OFF'; SS.auto = null; return 'ENG CRANK  OFF'; }
    SS.auto = null;
    if (e.run) { SS.crank = 'OFF'; return `${side} ENGINE IS RUNNING`; }
    SS.crank = side; const air = startAir(A, [k]);
    return air ? `ENG CRANK ${side}  -  ${{ CART: 'AIR START CART', XBLEED: 'CROSS-BLEED', WINDMILL: 'WINDMILL' }[air]}  -  ${side} THROTTLE TO IDLE AT 20% RPM` : `ENG CRANK ${side}  -  NO START AIR (DECK CART, THE OTHER ENGINE, OR 225 KNOTS)`;
  }
  if (id === 'thrL' || id === 'thrR') {
    SS.auto = null; SS.thrOff[k] = !SS.thrOff[k];
    if (SS.thrOff[k]) { SS.wet[k] = false; return `${side} THROTTLE OFF${e.run ? '  -  ENGINE SHUTDOWN' : ''}`; }
    if (!e.run && e.n < START.WET && SS.cranking[k] === 'CART') SS.wet[k] = true;
    return `${side} THROTTLE IDLE${e.run ? '' : SS.wet[k] ? '  -  TOO EARLY: FUEL BEFORE 15% (WET START)' : e.n >= START.IGN ? '  -  FUEL AND IGNITION' : ''}`;
  }
  if (id === 'genL' || id === 'genR') { SS.gen[k] = !SS.gen[k]; return `${side} GEN ${SS.gen[k] ? 'NORM' : 'OFF'}`; }
  return '';
}
// the one-key start (I): right engine, then left, moving the same switches a pilot would
export function startAuto(SS, A) { if (A.eng.every(e => e.run)) return false; SS.auto = { k: A.eng[1].run ? 0 : 1 }; return true; }
// every frame before the sim step. o: { ext (deck power and air connected), eng: [hp 0..1] }. Returns events [[name, k], ...]
export function startStep(SS, A, dt, o = {}) {
  const ev = [];
  if (SS.auto) {   // the auto-start: crank, throttle IDLE at 21%, wait for the crank cut-out, then the other side
    const k = SS.auto.k, e = A.eng[k], side = k ? 'R' : 'L';
    if (e.run && e.n > START.CUTOUT) { const o2 = 1 - k; if (A.eng[o2].run) { SS.auto = null; ev.push(['autodone', k]); } else SS.auto = { k: o2 }; }
    else if (!e.run) {
      if (SS.crank !== side) { SS.crank = side; ev.push(['autocrank', k]); }
      if (SS.thrOff[k] && SS.cn[k] >= START.IGN + 0.01) { SS.thrOff[k] = false; ev.push(['autoidle', k]); }
      if (!startAir(A, [k])) { SS.auto = null; SS.crank = 'OFF'; ev.push(['noair', k]); }
    }
  }
  for (let k = 0; k < 2; k++) {
    const e = A.eng[k], side = k ? 'R' : 'L', hp = o.eng ? o.eng[k] : 1;
    if (SS.thrOff[k] && (e.run || e.start > 0)) { e.run = false; e.start = 0; e.stalled = false; ev.push(['shutdown', k]); }
    const air = SS.crank === side && !e.run ? startAir(A, [k]) : null;
    SS.cranking[k] = air;
    if (air) {
      if (!SS.thrOff[k] && e.n < START.WET && air === 'CART') SS.wet[k] = true;   // throttle already at IDLE as it turns: fuel too early
      SS.cn[k] =Math.min(START.MOTOR, Math.max(SS.cn[k], e.n) + START.RATE[air] * dt);
      e.start = !SS.thrOff[k] && A.fuel > 0 && hp > 0.05 && SS.cn[k] >= START.IGN ? 0.01 : 0;   // fuel + ignition: the sim lights it at ~24%
    } else SS.cn[k] = e.n;
    if (SS.crank === side && e.run && e.n >= START.CUTOUT) { SS.crank = 'OFF'; ev.push(['crankout', k]); }
    SS.gens[k] = SS.gen[k] && e.n > START.GEN && hp > 0.05;
  }
  SS.ext = !!o.ext;
  SS.bus = SS.gens[0] || SS.gens[1] || SS.ext;
  SS.emerg = !SS.bus && !A.onGround && (A.eng.some(e => e.n > 0.3) || A.eas * KT > 120);
  SS.ess = SS.bus || SS.emerg;
  return ev;
}
// every frame after the sim step: a cranking engine turns at the starter's speed (the sim would let it run down)
export function startPost(SS, A) { for (let k = 0; k < 2; k++) { const e = A.eng[k]; if (SS.cranking[k] && !e.run) e.n = SS.cn[k]; } }
