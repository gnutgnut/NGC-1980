#!/usr/bin/env node
// rotarymission.mjs - the AI rotorcraft fly their whole missions in plain node, physically (flight model + AI pilot +
// mission AI), in the dev world (game/js/units/air/rotary/devworld.js: a hilly island with a pad, the ALBATROSS
// steaming at 6 m/s, the KRAKEN 6.5 km out):
//   CH-46: lift off the moving deck, fly to the island's landing zone, approach, land, unload, lift off, fly back and
//          land on the (moved) deck.
//   MV-22: the same from the KRAKEN, converting to airplane mode for the long leg and back to the hover for the LZ.
// Checks touchdown sink rates, landing accuracy, terrain clearance, limits and timings.
//   CH-46 wave-off: the zone is fouled on the first approach; it waves off, comes round and lands.
//   node tools/rotarymission.mjs [--v] [ch46|waveoff|mv22]
import { ROT, DT, deg, KT, table } from './rotarykit.mjs';
const { createDevWorld } = await import(ROT + 'devworld.js');
const { createPilot, stateOf } = await import(ROT + 'pilot.js');
const { createTransportAI } = await import(ROT + 'transportai.js');
const V = process.argv.includes('--v'), only = process.argv.slice(2).find(a => !a.startsWith('--'));
const T = table(), TR = process.argv.includes('--trace') ? process.argv.slice(process.argv.indexOf('--trace') + 1, process.argv.indexOf('--trace') + 3).map(Number) : null;

// fly one transport: sim + hands + mission; returns the measurements
async function mission(name, build) {
  const W = createDevWorld(), m = build(W);
  const { S, AI, fly } = m;
  let parked = false, minClear = 1e9, sinks = [], maxBank = 0, maxTq = 0, lzOff = null, corridorOut = 0, maxNacSpeed = 0, minNac = 99;
  AI.hooks.parked = () => { parked = true; };
  const unloadT = { t: 0 };
  AI.hooks.unload = (ai, dt) => { if (!unloadT.t) lzOff = Math.hypot(S.body.pos[0] - m.lz.x, S.body.pos[2] - m.lz.z); return (unloadT.t += dt) > 8; };
  const st = {};
  for (let t = 0; t < 420 && !parked && !S.dead; t += DT) {
    stateOf(S.body, st);
    const cmd = AI.step(st, S, DT, W.world), c = fly(st, cmd);
    const e = S.step(DT, c, W.env); W.move(DT);
    if (e === 'land' || e === 'hardland') sinks.push({ e, vy: S.body.maxSink, phase: AI.phase, t: +t.toFixed(1) });
    S.body.maxSink = 0;
    if ((AI.phase === 'transit' || AI.phase === 'rtb') && AI.cmd.dist > 140 && AI.t > 6) { if (S.agl < minClear) { minClear = S.agl; AI.minAt = [AI.phase, +t.toFixed(1), Math.round(AI.cmd.dist)]; } maxBank = Math.max(maxBank, Math.abs(st.roll)); }
    const tq = m.torque(); if (tq > maxTq) { maxTq = tq; AI.tqAt = [AI.phase, +t.toFixed(1)]; }
    if (S.corridor) { const n = deg(S.nac), cor = S.corridor(n); if (!S.landed && (S.ias < cor.min - 10 || S.ias > cor.max + 10)) corridorOut += DT; minNac = Math.min(minNac, n); maxNacSpeed = Math.max(maxNacSpeed, S.ias); }
    if (V && (Math.round(t / DT) % (TR && t > TR[0] && t < TR[1] ? 15 : 120) === 0)) console.log(`${t.toFixed(0).padStart(4)} ${AI.phase.padEnd(9)} pos ${st.x.toFixed(0)},${st.y.toFixed(1)},${st.z.toFixed(0)} agl ${S.agl.toFixed(1)} gs ${(Math.hypot(st.vx, st.vz) * KT).toFixed(0)}kt vy ${st.vy.toFixed(1)} pitch ${deg(st.pitch).toFixed(1)} roll ${deg(st.roll).toFixed(1)} hdg ${deg(st.yaw).toFixed(0)} ${m.extra ? m.extra() : ''} d ${(AI.cmd.dist ?? 0).toFixed(0)}`);
  }
  console.log('   phases', JSON.stringify(AI.log), AI.waveoffs ? 'wave-offs: ' + AI.waveoffs + ' ' + JSON.stringify(AI.woLog) : '');
  const lzLand = sinks.find(s => s.phase === 'ground' || s.phase === 'descend'), deckLand = sinks.find(s => s.phase === 'parked' || s.phase === 'descend2');
  T.check(`${name}: flew the whole mission and parked on the deck`, parked && !S.dead, `${parked ? 'parked' : 'not parked'} ${S.dead || ''} after ${AI.tAll.toFixed(0)} s`);
  T.check(`${name}: soft touchdown at the LZ`, lzLand && lzLand.vy < 1.5, lzLand ? `${lzLand.vy.toFixed(2)} m/s sink` : 'none', '< 1.5 m/s');
  T.check(`${name}: landed on the LZ mark`, lzOff !== null && lzOff < 2.5, `${(lzOff ?? NaN).toFixed(2)} m off`, '< 2.5 m');
  T.check(`${name}: soft touchdown on the moving deck`, deckLand && deckLand.vy < 1.8, deckLand ? `${deckLand.vy.toFixed(2)} m/s sink` : 'none', '< 1.8 m/s');
  T.check(`${name}: terrain clearance en route, bank, torque`, minClear > 15 && maxBank < 0.75 && maxTq < 1.08, `min AGL ${minClear.toFixed(0)} m (${AI.minAt}), max bank ${deg(maxBank).toFixed(0)} deg, max torque ${(maxTq * 100).toFixed(0)}% (${AI.tqAt})`);
  return { minNac, maxNacSpeed, corridorOut, S, AI };
}

if (!only || only === 'ch46') {
  console.log('--- CH-46E: ALBATROSS deck -> island LZ (Marines out) -> deck ---');
  const { createCH46Sim, CH46 } = await import(ROT + 'ch46fm.js');
  const { flyCH46, CH46_AI } = await import(ROT + 'ch46ai.js');
  await mission('CH-46', W => {
    const S = createCH46Sim(), sp = W.spot(-2, -2); S.reset([sp.x, sp.y + CH46.CG_H + 0.05, sp.z], sp.hdg, true, W.env);
    const P = createPilot(CH46.PILOT); P.reset(0); const lz = W.lz(18);
    const AI = createTransportAI(CH46_AI, { lz: () => lz, home: () => W.spot(-2, -2), unload: () => true });
    return { S, AI, lz, fly: (st, cmd) => flyCH46(S, P, st, cmd, DT), torque: () => S.torque, extra: () => `coll ${S.c.coll.toFixed(2)} tq ${(S.torque * 100).toFixed(0)}%` };
  });
}
if (!only || only === 'waveoff') {
  console.log('--- CH-46E wave-off: the LZ is fouled on the first approach -> power on, climb away, come round again ---');
  const { createCH46Sim, CH46 } = await import(ROT + 'ch46fm.js');
  const { flyCH46, CH46_AI } = await import(ROT + 'ch46ai.js');
  const r = await mission('CH-46 wave-off', W => {
    const S = createCH46Sim(), sp = W.spot(-2, -2); S.reset([sp.x, sp.y + CH46.CG_H + 0.05, sp.z], sp.hdg, true, W.env);
    const P = createPilot(CH46.PILOT); P.reset(0); const lz = W.lz(18);
    const AI = createTransportAI(CH46_AI, { lz: () => lz, home: () => W.spot(-2, -2), unload: () => true, fouled: () => !AI.waveoffs });
    return { S, AI, lz, fly: (st, cmd) => flyCH46(S, P, st, cmd, DT), torque: () => S.torque };
  });
  T.check('CH-46 wave-off: waved off once (fouled), then landed', r.AI.waveoffs === 1 && r.AI.why === 'fouled', `${r.AI.waveoffs} wave-off(s), ${r.AI.why}`);
}
if (!only || only === 'mv22') {
  console.log('--- MV-22B: KRAKEN deck -> conversion -> airplane -> conversion -> island LZ (troopers out) -> KRAKEN ---');
  const { createMV22Sim, MV22 } = await import(ROT + 'mv22fm.js');
  const { createTiltPilot } = await import(ROT + 'tiltpilot.js');
  const { flyMV22, MV22_AI } = await import(ROT + 'mv22ai.js');
  const r = await mission('MV-22', W => {
    const S = createMV22Sim(), sp = W.krakenSpot(-1, -36); S.reset([sp.x, sp.y + MV22.CG_H + 0.05, sp.z], sp.hdg, true, W.env, 90);
    const P = createTiltPilot(MV22.PILOT, S); P.reset(0); const lz = { ...W.lz(18), x: W.PAD.x - 18, hdg: Math.PI / 2 };
    const AI = createTransportAI(MV22_AI, { lz: () => lz, home: () => W.krakenSpot(-1, -36), unload: () => true });
    return { S, AI, lz, fly: (st, cmd) => flyMV22(S, P, st, cmd, DT, S.agl), torque: () => S.power / (S.live * 6150 * 745.7 || 1), extra: () => `k ${P.k.toFixed(2)} cMax ${(P.cMax ?? 1).toFixed(2)} pw ${((S.rR.power + S.rL.power) / (S.live * 6150 * 745.7)).toFixed(2)} nac ${deg(S.nac).toFixed(0)} ias ${S.ias.toFixed(0)} tcl ${S.c.tcl.toFixed(2)} rpm ${(S.rpm * 412).toFixed(0)} gear ${S.gear.toFixed(1)}` };
  });
  T.check('MV-22: converted to airplane mode on the long leg', r.minNac < 5 && r.maxNacSpeed > 200, `min nacelle ${r.minNac.toFixed(0)} deg, max ${r.maxNacSpeed.toFixed(0)} KIAS`);
  T.check('MV-22: stayed inside the conversion corridor', r.corridorOut < 1, `${r.corridorOut.toFixed(1)} s outside (10 kt margin)`);
}
T.done();
