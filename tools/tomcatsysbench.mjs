#!/usr/bin/env node
// tomcatsysbench.mjs - the player's F-14A systems (game/js/units/air/tomcatsys.js, tomcatdamage.js) on the real
// Tomcat sim (tomcatfm.js) in plain node: the wing sweep controls (AUTO / MAN / EMER / OVERSWEEP, a dead CADC, flaps,
// a hydraulic hit), the AFCS (attitude hold with control stick steering, altitude hold in a turn, disengage rules),
// the TF30 start air (cart, cross-bleed, windmill) and an airstart, the compressor stall procedure, the damage model.
//   node tools/tomcatsysbench.mjs [--v]
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(pathToFileURL(new URL('../game/vendor/three.module.min.js', import.meta.url).pathname).href)}, shortCircuit: true }; return n(s, c); }`));
const { createTomcatSim, cadcSweep, loadout, mulberry32 } = await import('../game/js/units/air/tomcatfm.js');
const { KT } = await import('../game/js/units/air/airframe.js');
const { createFD } = await import('../game/js/units/air/fd.js');
const S = await import('../game/js/units/air/tomcatsys.js');
const { createTomcatDamage, TPARTS } = await import('../game/js/units/air/tomcatdamage.js');
const V = process.argv.includes('--v');
const G = 9.0, DT = 1 / 60;
let pass = 0, fail = 0;
const check = (name, ok, got, want = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} ${got}${want ? '   (want ' + want + ')' : ''}`); };
const deg = r => r * 180 / Math.PI, clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sea = { groundY: () => 0, water: () => true };
const land = { groundY: () => 0, water: () => false };
const ctl = (o = {}) => ({ pitch: 0, roll: 0, yaw: 0, brakeL: 0, brakeR: 0, ...o, throttle: o.throttle ?? [o.thr ?? 0.6, o.thr ?? 0.6] });
function air(eas, alt = 500, o = {}) {
  const A = createTomcatSim(G, { seed: o.seed ?? 5 }); A.reset(0, 0, 0, 0, { running: true, airborne: true, alt, speed: 0 });
  const rho = 4.9 * Math.exp(-A.pos.y / 6000), tas = eas * Math.sqrt(1.225 / rho);
  A.vel.set(0, 0, -tas); for (const e of A.eng) e.n = 0.9; A.fuel = 4500; A.stores = loadout('cap'); A.sweep = cadcSweep(tas / 170);
  return A;
}
// a pilot on the flight director: level at the altitude, a speed, a bank
function holder(A, alt, eas, bank = 0) { const fd = createFD(A, { gmax: 6 }); return () => { const att = A.attitude(); return ctl({ pitch: fd.pitchFor(Math.cos(att.pitch) / Math.max(0.3, Math.cos(att.roll)) + clamp((alt - A.pos.y) * 0.02 - A.vel.y * 0.1, -0.6, 0.8), DT), roll: fd.rollFor(bank), thr: fd.throttleFor(eas, DT) }); }; }
function fly(A, secs, c, env = sea, each) { for (let t = 0; t < secs; t += DT) { const ev = A.step(DT, typeof c === 'function' ? c(A, t) : c, env); if (each) each(A, t, ev); if (A.dead) return A.dead; } return null; }

console.log('--- wing sweep controls ---');
{
  // AUTO: the CADC program at M 0.9 (60°)
  const A = air(250, 300), SW = S.createSweepControl(), hold = holder(A, 300, 0);
  const c0 = hold; let t9 = 0;
  fly(A, 25, (A, t) => { S.sweepStep(SW, A, false, false, DT); const c = c0(); c.throttle = [1, 1]; return c; }, sea, (A, t) => { if (A.mach > 0.9 && !t9) t9 = t; });
  check('AUTO: the wings follow the CADC program', Math.abs(A.sweep - cadcSweep(A.mach)) < 3 && A.sweep > 55, `M ${A.mach.toFixed(2)}  sweep ${A.sweep.toFixed(1)}°  program ${cadcSweep(A.mach).toFixed(1)}°`, 'within 3° (lag 15°/s)');
  // MAN: aft of the program only
  const B = air(150, 300), SB = S.createSweepControl(), hb = holder(B, 300, 150);
  fly(B, 5, (B) => { S.sweepStep(SB, B, false, true, DT); return hb(); });
  fly(B, 4, (B) => { S.sweepStep(SB, B, false, false, DT); return hb(); });
  check('MAN aft (thumb switch held 5 s): wings sweep aft of the program', SB.mode === 'MAN' && B.sweep > 60 && B.mach < 0.6, `mode ${SB.mode}  sweep ${B.sweep.toFixed(0)}° at M ${B.mach.toFixed(2)} (program ${cadcSweep(B.mach).toFixed(0)}°)`);
  const C = air(250, 300), SC = S.createSweepControl(), hc = holder(C, 300, 250);
  S.sweepPress(SC, C, 'fwd'); for (let i = 0; i < 12; i++) S.sweepPress(SC, C, 'fwd');
  fly(C, 8, (C) => { S.sweepStep(SC, C, false, false, DT); return hc(); });
  check('MAN forward of the program: the CADC still wins', C.sweep >= cadcSweep(C.mach) - 2, `cmd ${SC.cmd}°  sweep ${C.sweep.toFixed(0)}° at M ${C.mach.toFixed(2)} (program ${cadcSweep(C.mach).toFixed(0)}°)`);
  S.sweepPress(SB, B, 'auto'); fly(B, 5, (B) => { S.sweepStep(SB, B, false, false, DT); return hb(); });
  check('AUTO again: back to the program', SB.mode === 'AUTO' && Math.abs(B.sweep - cadcSweep(B.mach)) < 2, `sweep ${B.sweep.toFixed(0)}° program ${cadcSweep(B.mach).toFixed(0)}°`);
  // EMER: anywhere, even forward of the program at speed
  const E = air(250, 300), SE = S.createSweepControl(), he = holder(E, 300, 250);
  fly(E, 4, (E) => { S.sweepStep(SE, E, false, false, DT); return he(); });
  S.sweepPress(SE, E, 'emer'); fly(E, 4, (E) => { S.sweepStep(SE, E, true, false, DT); return he(); }); fly(E, 3, (E) => { S.sweepStep(SE, E, false, false, DT); return he(); });
  check('EMER handle: wings forward of the program at speed', SE.mode === 'EMER' && E.sweep < cadcSweep(E.mach) - 15, `handle ${SE.handle.toFixed(0)}°  sweep ${E.sweep.toFixed(0)}° at M ${E.mach.toFixed(2)} (program ${cadcSweep(E.mach).toFixed(0)}°)`);
  // in the air the handle stops at 68
  fly(E, 7, (E) => { S.sweepStep(SE, E, false, true, DT); return he(); });
  check('EMER in the air: the handle stops at 68° (no OVER)', SE.handle <= 68 && SE.mode === 'EMER' && E.sweep <= 68.5, `handle ${SE.handle.toFixed(0)}°  sweep ${E.sweep.toFixed(1)}°`);
  // OVERSWEEP on deck
  const O = createTomcatSim(G); O.reset(0, 0, 0, 0, { running: true }); const SO = S.createSweepControl();
  S.sweepPress(SO, O, 'emer'); fly(O, 12, (O) => { S.sweepStep(SO, O, false, true, DT); return ctl({ thr: 0, brakeL: 1, brakeR: 1 }); }, land);
  check('OVERSWEEP on deck: 75°', SO.mode === 'OVER' && O.sweep > 74, `mode ${SO.mode}  handle ${SO.handle.toFixed(0)}  sweep ${O.sweep.toFixed(1)}°`, '75° (CONFIRMED NATOPS)');
  S.sweepPress(SO, O, 'emer'); fly(O, 8, (O) => { S.sweepStep(SO, O, false, false, DT); return ctl({ thr: 0, brakeL: 1, brakeR: 1 }); }, land);
  check('handle stowed on deck (flaps down): wings come forward to 20°', SO.mode === 'AUTO' && O.sweep < 21, `sweep ${O.sweep.toFixed(1)}°`);
  // a dead CADC freezes the wings; the emergency handle still moves them
  const F = air(170, 300), SF = S.createSweepControl(), hf = holder(F, 300, 0);
  fly(F, 3, (F) => { S.sweepStep(SF, F, false, false, DT); return hf(); });
  const s0 = F.sweep; fly(F, 20, (F) => { S.sweepStep(SF, F, false, false, DT, false); const c = hf(); c.throttle = [1, 1]; return c; });
  check('CADC failed: the wings stay put while Mach rises', Math.abs(F.sweep - s0) < 1 && F.mach > 0.85 && SF.frozen !== null, `sweep ${s0.toFixed(0)}° -> ${F.sweep.toFixed(0)}° at M ${F.mach.toFixed(2)}`);
  S.sweepPress(SF, F, 'emer'); fly(F, 5, (F) => { S.sweepStep(SF, F, false, true, DT, false); const c = hf(); c.throttle = [1, 1]; return c; });
  check('CADC failed: the EMER handle sweeps them', F.sweep > s0 + 20, `sweep ${F.sweep.toFixed(0)}° (handle ${SF.handle.toFixed(0)}°)`);
  // flaps down: wings forward in AUTO
  const L = air(120, 300), SL = S.createSweepControl(), hl = holder(L, 300, 120); L.sweep = 40; L.flapSel = 2;
  fly(L, 4, (L) => { S.sweepStep(SL, L, false, false, DT); return hl(); });
  check('flaps down: wings run forward to 20°', L.sweep < 20.5, `sweep ${L.sweep.toFixed(1)}°`);
  // sweep rate with both hydraulic systems / on one
  const rate = (hyd) => { const R = createTomcatSim(G); R.reset(0, 0, 0, 0, { running: true }); const SR = S.createSweepControl(); S.sweepPress(SR, R, 'emer'); SR.handle = 68; let t68 = 0; fly(R, 10, (R, t) => { S.sweepStep(SR, R, false, false, DT); return ctl({ thr: 0, brakeL: 1, brakeR: 1 }); }, { ...land, mods: { eng: [1, 1], hyd, fcsOk: true, gearOk: true, hookOk: true } }, (R, t) => { if (!t68 && R.sweep > 67.5) t68 = t; }); return t68; };
  const t2 = rate(1), t1 = rate(0.2);
  check('20->68° in ~3.2 s on both hydraulics, ~6.4 s on one', t2 > 2.8 && t2 < 3.8 && t1 > 5.8 && t1 < 7.2, `${t2.toFixed(1)} s / ${t1.toFixed(1)} s`, '15°/s / 7.5°/s (CONFIRMED Heatblur manual)');
}
console.log('--- AFCS ---');
{
  // ATT hold: trimmed-ish level flight, let go, 30 s
  const A = air(160, 600), FD = createFD(A), AP = S.createAfcs(), h = holder(A, 600, 160);
  fly(A, 8, h);
  const why = S.afcsEngage(AP, A, 'ATT', true), p0 = A.attitude().pitch, h0 = A.heading(); let pMax = 0, hMax = 0;
  const fdT = createFD(A);
  fly(A, 30, (A) => { const c = ctl({ thr: fdT.throttleFor(160, DT) }); S.afcsStep(AP, A, FD, c, DT, true); return c; }, sea, (A) => { pMax = Math.max(pMax, Math.abs(A.attitude().pitch - p0)); hMax = Math.max(hMax, Math.abs(A.heading() - h0)); });
  check('ATT hold, hands off for 30 s: pitch and heading held', !why && AP.mode === 'ATT' && deg(pMax) < 1.5 && deg(hMax) < 2, `pitch drift ${deg(pMax).toFixed(2)}°  heading ${deg(hMax).toFixed(2)}°`, '< 1.5° / 2°');
  // control stick steering: ease the nose up, let go: it holds the new attitude
  fly(A, 1.0, (A) => { const c = ctl({ pitch: 0.12, thr: fdT.throttleFor(160, DT) }); S.afcsStep(AP, A, FD, c, DT, true); return c; });
  fly(A, 0.4, (A) => { const c = ctl({ thr: 1 }); S.afcsStep(AP, A, FD, c, DT, true); return c; });
  const p1 = A.attitude().pitch; let d1 = 0;
  fly(A, 10, (A) => { const c = ctl({ thr: 1 }); S.afcsStep(AP, A, FD, c, DT, true); return c; }, sea, (A, t) => { d1 = Math.max(d1, Math.abs(A.attitude().pitch - AP.ref.pitch)); if (V && Math.round(t * 60) % 30 === 0) console.log(t.toFixed(1), deg(A.attitude().pitch).toFixed(2), deg(AP.ref.pitch).toFixed(2), (A.eas * KT).toFixed(0)); });
  check('stick steering: the new attitude is held after you let go', deg(AP.ref.pitch) > 4 && deg(d1) < 1.5, `new pitch ${deg(AP.ref.pitch).toFixed(1)}° (at release ${deg(p1).toFixed(1)}°), error max ${deg(d1).toFixed(2)}° in 10 s at ${(A.eas * KT).toFixed(0)} KEAS`, '< 1.5°');
  // ALT hold in a 30° banked turn (stick steering into the bank, then hands off)
  const B = air(170, 500), FB = createFD(B), APB = S.createAfcs(), hb = holder(B, 500, 170); fly(B, 6, hb);
  S.afcsEngage(APB, B, 'ALT', true); const fdB = createFD(B), fdR = createFD(B);
  fly(B, 3, (B) => { const c = ctl({ roll: fdR.rollFor(0.55), thr: fdB.throttleFor(170, DT) }); S.afcsStep(APB, B, FB, c, DT, true); return c; });
  let aMax = 0, rollAvg = 0, n = 0;
  fly(B, 30, (B) => { const c = ctl({ thr: fdB.throttleFor(170, DT) }); S.afcsStep(APB, B, FB, c, DT, true); return c; }, sea, (B) => { aMax = Math.max(aMax, Math.abs(B.pos.y - APB.ref.alt)); rollAvg += B.attitude().roll; n++; });
  check('ALT hold through a 30° banked turn, 30 s', aMax < 15 && deg(rollAvg / n) > 22, `altitude error max ${aMax.toFixed(1)} m, bank ${deg(rollAvg / n).toFixed(0)}°`, '< 15 m');
  // disengage rules
  const C = air(160, 600), FC = createFD(C), APC = S.createAfcs(); S.afcsEngage(APC, C, 'ATT', true); C.gearCmd = 1; const r = S.afcsStep(APC, C, FC, ctl(), DT, true);
  check('gear handle down: the autopilot drops out', r === 'drop' && APC.mode === 'OFF' && APC.drop > 0, `${r}  mode ${APC.mode}`);
  const D2 = air(160, 600), APD = S.createAfcs();
  check('stab aug off: the autopilot will not engage', S.afcsEngage(APD, D2, 'ATT', false) !== '' && APD.mode === 'OFF', `"${S.afcsEngage(APD, D2, 'ATT', false)}"`);
  const E = air(160, 600); E.q.setFromAxisAngle(new (E.pos.constructor)(0, 0, 1), -1.4);
  check('past 57° of bank: will not engage ("level the wings")', S.afcsEngage(S.createAfcs(), E, 'ATT', true) !== '', 'refused');
}
console.log('--- TF30 start air and airstarts ---');
{
  const A = createTomcatSim(G); A.reset(0, 0, 0, 0, { running: false });
  check('on deck: the air start cart', S.startAir(A, [0, 1]) === 'CART', S.startAir(A, [0, 1]));
  const B = air(150, 600); B.eng[0].run = false; B.eng[0].n = 0.1;
  check('one engine out in the air: cross-bleed from the other', S.startAir(B, [0]) === 'XBLEED', S.startAir(B, [0]));
  const C = air(100, 600); for (const e of C.eng) { e.run = false; e.n = 0.1; }
  check('both out, slow: no start air', S.startAir(C, [0, 1]) === null, String(S.startAir(C, [0, 1])));
  const D = air(140, 1500); for (const e of D.eng) { e.run = false; e.n = 0.1; } fly(D, 0.1, ctl({ thr: 0 }));   // (air data come from a step)
  check('both out, 270 KEAS: windmill airstart possible', S.startAir(D, [0, 1]) === 'WINDMILL', S.startAir(D, [0, 1]));
  for (const e of D.eng) e.start = 0.01; let lit = null; const hd = holder(D, 1500, 140);
  fly(D, 20, (D) => { const c = hd(); c.throttle = [0, 0]; return c; }, sea, (D, t, ev) => { for (const e of ev) if (e.e === 'lightoff' && lit === null) lit = t; });
  check('windmill airstart: light-off and back to idle', lit !== null && D.eng.every(e => e.run && e.n > 0.6), `light-off at ${lit?.toFixed(1)} s, rpm ${D.eng.map(e => (e.n * 100).toFixed(0)).join('/')}`);
}
console.log('--- the start on the switches, generators ---');
{
  // a cold jet on the deck: ENG CRANK R, the throttle IDLE at 20%, light-off, crank out at 50%, generator on line
  const deck = () => { const A = createTomcatSim(G, { seed: 2 }); A.reset(0, 0, 0, 0, { running: false }); A.fuel = 4000; for (const e of A.eng) { e.n = 0; e.run = false; } return A; };
  const A = deck(), SS = S.createStart(false), log = { lit: null, out: null, gen: null, motor20: null, maxOff: 0 };
  let thrMoved = false;
  const run = (A, SS, secs, each) => { for (let t = 0; t < secs; t += DT) { const ev = S.startStep(SS, A, DT, { ext: true }); const e2 = A.step(DT, ctl({ thr: 0 }), land); S.startPost(SS, A); if (each) each(t, ev, e2); } };
  S.startPress(SS, A, 'crankR');
  run(A, SS, 60, (t, ev, e2) => {
    if (SS.thrOff[1]) log.maxOff = Math.max(log.maxOff, A.eng[1].n);
    if (!thrMoved && A.eng[1].n >= 0.2) { thrMoved = true; log.motor20 = t; S.startPress(SS, A, 'thrR'); }
    for (const e of e2) if (e.e === 'lightoff' && log.lit === null) log.lit = t;
    for (const [e] of ev) if (e === 'crankout' && log.out === null) log.out = t;
    if (SS.gens[1] && log.gen === null) log.gen = t;
  });
  check('crank R: motored to 20% on the cart, no light-off on the starter alone', log.motor20 > 4 && log.motor20 < 10 && log.maxOff <= 0.251, `20% at ${log.motor20?.toFixed(1)} s, max ${(log.maxOff * 100).toFixed(0)}% with the throttle OFF`, '20% ~6 s (game), never lights OFF');
  check('throttle IDLE: light-off, crank switch out at 50%, R GEN on line', log.lit !== null && log.out > log.lit && log.gen > log.out && A.eng[1].run && SS.crank === 'OFF' && !A.eng[0].run, `light-off ${log.lit?.toFixed(1)} s, crank out ${log.out?.toFixed(1)} s, gen ${log.gen?.toFixed(1)} s, rpm ${(A.eng[1].n * 100).toFixed(0)}%`);
  check('one generator up: main bus on, the other GEN dark', SS.bus && SS.gens[1] && !SS.gens[0], `gens ${SS.gens}`);
  // the left engine (the cart still connected)
  S.startPress(SS, A, 'crankL'); let lit2 = null; let moved = false;
  run(A, SS, 40, (t, ev, e2) => { if (!moved && SS.cn[0] >= 0.2) { moved = true; S.startPress(SS, A, 'thrL'); } for (const e of e2) if (e.e === 'lightoff') lit2 = t; });
  check('left engine on the cart: both at idle, both generators', lit2 !== null && A.eng.every(e => e.run && e.n > 0.62) && SS.gens.every(Boolean), `rpm ${A.eng.map(e => (e.n * 100).toFixed(0)).join('/')}`);
  // throttle OFF: shutdown; GEN switch OFF drops it off line
  S.startPress(SS, A, 'genL'); S.startStep(SS, A, DT, { ext: false });
  check('L GEN OFF: off line (the right one carries the bus)', !SS.gens[0] && SS.bus, `gens ${SS.gens}`);
  S.startPress(SS, A, 'genL'); S.startPress(SS, A, 'thrL'); run(A, SS, 1);
  check('L throttle OFF: the engine shuts down', !A.eng[0].run && SS.thrOff[0], `run ${A.eng[0].run}`);
  // a wet start: the throttle at IDLE before the crank
  const B = deck(), SB = S.createStart(false); S.startPress(SB, B, 'thrR'); S.startPress(SB, B, 'crankR'); S.startStep(SB, B, DT, { ext: true });
  check('throttle IDLE before the crank: a wet start', SB.wet[1], `wet ${SB.wet}`);
  // no air: crank on deck without the cart (not on the carrier), in flight slow with both out
  const Cn = deck(), SC = S.createStart(false); Cn.onGround = false; Cn.eas = 50; S.startPress(SC, Cn, 'crankR'); S.startStep(SC, Cn, DT, {});
  check('both out, slow, airborne: crank finds no air', SC.cranking[1] === null && SC.crank === 'R', `air ${SC.cranking[1]}`);
  // the auto start (I): right then left, both running, crank off, throttles IDLE
  const Dd = deck(), SD = S.createStart(false); S.startAuto(SD, Dd); const order = [];
  run(Dd, SD, 90, (t, ev) => { for (const [e, k] of ev) if (e === 'autocrank') order.push(k ? 'R' : 'L'); });
  check('auto start: R then L, both at idle, generators on, crank OFF', order.join('') === 'RL' && Dd.eng.every(e => e.run && e.n > 0.62) && SD.gens.every(Boolean) && SD.crank === 'OFF' && !SD.auto, `order ${order.join(' ')}  rpm ${Dd.eng.map(e => (e.n * 100).toFixed(0)).join('/')}`);
  // no generators in flight: the emergency generator keeps the essential bus
  const E = air(250, 800), SE = S.createStart(true); SE.gen = [false, false]; fly(E, 0.1, ctl()); S.startStep(SE, E, DT, {});
  check('both GENs off in flight: EMERG GEN carries the essential bus', !SE.bus && SE.emerg && SE.ess, `bus ${SE.bus} emerg ${SE.emerg}`);
  // an airstart on the switches: the left engine flamed out at 270 KEAS, crank L (cross-bleed off the right), throttle at IDLE
  const W = air(140, 1500); W.eng[0].run = false; W.eng[0].n = 0.1; const SW2 = S.createStart(true); fly(W, 0.1, ctl());
  S.startPress(SW2, W, 'crankL'); let wl = null; const hw = holder(W, 1500, 140);
  for (let t = 0; t < 20; t += DT) { S.startStep(SW2, W, DT, {}); const ev = W.step(DT, hw(), sea); S.startPost(SW2, W); for (const e of ev) if (e.e === 'lightoff' && wl === null) wl = t; }
  check('airstart on the crank switch (cross-bleed): lit, crank out', SW2.cranking[0] === null && wl !== null && W.eng[0].run && SW2.crank === 'OFF', `light-off ${wl?.toFixed(1)} s, rpm ${(W.eng[0].n * 100).toFixed(0)}%, wet ${SW2.wet[0]}`);
}
console.log('--- compressor stall procedure ---');
{
  // holding the pull and the power keeps it stalled into a flame-out; idle and nose down recovers (tomcatbench has the clear time)
  const A = air(120, 900, { seed: 3 }); A.eng[0].stalled = true; A.eng[0].stallT = 0; A.eng[0].clearT = 0; let out = null;
  fly(A, 10, ctl({ thr: 1, pitch: 0.6 }), sea, (A, t, ev) => { for (const e of ev) if (e.e === 'flameout' && out === null) out = t; });
  check('stalled, power and the pull held: it flames out', out !== null && !A.eng[0].run, `flame-out at ${out?.toFixed(1)} s`, 'NATOPS: idle, unload');
  const B = air(120, 900, { seed: 3 }); B.eng[1].stalled = true; B.eng[1].stallT = 0; B.eng[1].clearT = 0; let clr = null, yawMax = 0;
  fly(B, 8, (B, t) => ctl({ thr: t < 1.5 ? 1 : 0, pitch: t < 1.5 ? 0.6 : -0.25 }), sea, (B, t, ev) => { yawMax = Math.max(yawMax, Math.abs(B.w.z)); for (const e of ev) if (e.e === 'stallclear' && clr === null) clr = t; });
  check('idle + nose down: recovered, the engine still running', clr !== null && B.eng[1].run, `cleared at ${clr?.toFixed(1)} s (1.5 s of mishandling first), yaw rate peak ${deg(yawMax).toFixed(0)}°/s`);
  // a damaged TF30 stalls more easily
  const Dm = createTomcatDamage(() => 0.5); Dm.hp.engL = 0.3;
  check('a damaged TF30 is easier to stall', Dm.stallRisk(0) > 2 && Dm.stallRisk(1) === 1, `risk x${Dm.stallRisk(0).toFixed(1)} / x${Dm.stallRisk(1).toFixed(1)}`);
}
console.log('--- damage ---');
{
  const D = createTomcatDamage(mulberry32(7)), hits = {};
  for (let i = 0; i < 400; i++) { D.reset(); const p = D.hit(0.2); hits[p] = (hits[p] || 0) + 1; }
  check('hits spread over every system', TPARTS.every(p => hits[p.id] > 0), TPARTS.map(p => `${p.id} ${hits[p.id] || 0}`).join(' '));
  D.reset(); D.hp.sas = 0.2; const m = D.mods();
  check('stab aug shot out: the airframe flies DIRECT, the autopilot is out', !m.fcsOk && !m.sasOk && D.cautions().includes('PITCH STAB'), `fcsOk ${m.fcsOk}  sasOk ${m.sasOk}`);
  const A = air(160, 600); const env = { ...sea, mods: m }; fly(A, 0.5, ctl({ pitch: 0.3 }), env);
  check('DIRECT: the sim drops the SAS', A.casActive === false, `casActive ${A.casActive}`);
  D.reset(); D.fire[0] = true; const r1 = D.extinguish(0), r2 = D.extinguish(0);
  check('FIRE light: one bottle per side', r1 === 'FIRE OUT' && !D.fire[0] && r2 === 'BOTTLE EMPTY' || r2 === 'NO FIRE', `${r1}, then ${r2}`);
  D.reset(); D.hp.fuel = 0.2; const leak = D.update(1);
  check('shot fuel tanks leak', leak > 5, `${leak.toFixed(1)} kg/s`);
}
console.log('--- the HORNET is unchanged ---');
{
  let out = '', ok = true;
  try { out = execFileSync(process.execPath, [new URL('./jetfingerprint.mjs', import.meta.url).pathname], { encoding: 'utf8' }); } catch (e) { ok = false; out = e.stdout || String(e); }
  check('jetfingerprint: Hornet bit-identical', ok, out.trim().split('\n').pop());
}
if (V) console.log('(verbose)');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
