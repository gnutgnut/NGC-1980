#!/usr/bin/env node
// buddyaidbench.mjs - ngc/infdepth: infantry depth in node. The near AI Marine on the real rifleman + medical sims
// (richmarine.js), casualty care (fieldcare.js: the corpsman, buddy aid, the wounded calling out and crawling to cover,
// drags to the CCP), the treatment chooser, the cheap model's timers, the player as a patient, evacuation, and the cost.
// Medical numbers come from MEDINV (medical.js, benched in medinvbench.mjs); the care rules here are GAME.
//   node tools/buddyaidbench.mjs              all checks
//   node tools/buddyaidbench.mjs fight 3      one verbose fight with rich men and care, seed 3
import { createGroundSim } from '../game/js/units/groundwar/groundsim.js';
import { createRichMarine } from '../game/js/units/groundwar/richmarine.js';
import { createMarine, MARINE } from '../game/js/units/groundwar/marine.js';
import { pickAid, CARE } from '../game/js/units/groundwar/fieldcare.js';
import { createMedical, mulberry32, BUDDY } from '../game/js/units/infantry/medical.js';
import * as I from '../game/js/units/infantry/inventory.js';
import { sandboxIsland } from '../game/js/units/runaway/rwworld.js';

let pass = 0, fail = 0;
const check = (ok, name, info = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -  ' + info : ''}`); };
const isl = sandboxIsland(1980);
const ROLES = [...MARINE.ROLES.slice(0, 12), 'doc'];   // a CH-46 stick: SL, three fire teams (an M60 attached), the corpsman

// a femoral (arterial) bleed on a medical sim, as medinvbench stages it
const femoral = (M, region = 'legL') => { M.bleeds.push({ id: 900, region, zone: 'thigh', type: 'arterial', rate: 500, ctl: 'tq', name: 'FEMORAL A.', clot: 0, ctrl: 1, t: 0, dressed: false, packed: false, stopped: false }); M.regions[region].hp = Math.max(1, M.regions[region].hp - 40); };

export function battle(o = {}) {
  const I0 = { id: 0, name: 'TEST', x: 0, z: 0, r: 215, pad: { x: 0, z: 30, r: 8.5, h: isl.height(0, 30) }, structs: [], owner: o.owner ?? 1 };
  const GS = createGroundSim({ terrainH: isl.heightExact, islands: [I0], seed: o.seed ?? 1, hooks: o.hooks || {}, rich: o.rich === false ? null : { r: 140, max: o.max ?? 16 }, care: o.care !== false });
  GS.maps.bakeAll(); GS.maps.setObstacles(I0, isl.obstacles.map(q => ({ ...q })));
  const B = GS.battle(I0), mar = [];
  const nM = o.marines ?? 13;
  for (let k = 0; k < nM; k++) mar.push(GS.addMarine(B, (o.roles || ROLES)[k % 13], (k % 5) * 3 - 6, 40 + Math.floor(k / 5) * 3, 0, { seed: k + 13 * (o.seed ?? 1) }));
  if (nM) GS.squadMarines(B, mar, o.marOrder || { type: 'defend', x: 0, z: 30, r: 25 });
  const rw = [];
  for (let k = 0; k < (o.striders ?? 0); k++) rw.push(GS.addStrider(B, -40 + (k % 4) * 4, -130 + Math.floor(k / 4) * 4, Math.PI, { weapon: k % 4 === 0 ? 'coil' : 'xm7' }));
  for (let k = 0; k < rw.length; k += 4) GS.squadRW(B, rw.slice(k, k + 4), { type: 'take', x: 0, z: 30, r: 30 });
  return { GS, B, I: I0, mar, rw };
}
function run(F, secs, o = {}) {
  const ev = {}, dt = 1 / 30, cam = o.cam || { x: 0, y: 40, z: 30 }, t0 = performance.now();
  for (let i = 0; i < secs / dt; i++) {
    for (const e of F.GS.step(dt, { cam, peace: o.peace })) ev[e.e] = (ev[e.e] || 0) + 1;
    if (o.each) o.each(F, i * dt);
    if (o.until && o.until(F)) break;
  }
  return { ev, ms: performance.now() - t0 };
}

if (process.argv[2] === 'fight') {
  const seed = +(process.argv[3] || 1), F = battle({ seed, striders: 8 });
  const r = run(F, 300, { each: (F, t) => { if (Math.abs(t % 30) < 1 / 60) console.log(`t=${t.toFixed(0)} able ${F.mar.filter(m => m.able).length} wia-now ${F.mar.filter(m => m.alive && !m.able).length} kia ${F.GS.stats.kia} rtd ${F.GS.stats.rtd} | rich ${F.mar.filter(m => m.richOn).length} | care ${JSON.stringify(F.GS.FC.stats)} | machines ${F.rw.filter(u => u.alive).length}`); } });
  console.log(JSON.stringify(r.ev), JSON.stringify(F.GS.stats));
  for (const m of F.mar) console.log(m.role.padEnd(4), m.alive ? (m.able ? 'ok ' : 'WIA') : 'KIA', m.rich ? `rich shots ${m.rich.stats.shots} rel ${m.rich.stats.reloads} ia ${m.rich.stats.ia} blood ${m.rich.M.vitals().bloodMl} cls ${m.rich.M.cls()}` : 'cheap', m.cas ? JSON.stringify({ t: Math.round(m.cas.t), tr: m.cas.treated, ccp: m.cas.atCCP }) : '', m.ai.state);
  process.exit(0);
}

if (process.argv[2] === 'take') {   // Marines attacking an island the machines hold (the groundwar scene's shape)
  for (const rich of [false, true]) {
    const F = battle({ seed: +(process.argv[3] || 1), striders: 0, rich, owner: 2, marOrder: { type: 'take', x: 0, z: 30, r: 30 } });
    for (const m of F.mar) F.GS.place(m, m.x + 60, m.z + 60);
    const rw = []; for (let k = 0; k < 4; k++) rw.push(F.GS.addStrider(F.B, -6 + k * 4, 26, 0, { weapon: k ? 'xm7' : 'coil' }));
    F.GS.squadRW(F.B, rw, { type: 'defend', x: 0, z: 30, r: 25 });
    const cam = { x: 60, y: 30, z: 100 };
    let s1 = [];
    run(F, 60, { cam, each: (F, t) => { if (Math.abs(t % 10) < 1 / 60) s1.push(F.GS.stats.shots[1]); } });
    console.log(rich ? 'RICH ' : 'CHEAP', 'shots', JSON.stringify(F.GS.stats.shots), 'by 10 s', s1.join(','), 'kia', F.GS.stats.kia, 'wia', F.GS.stats.wia, 'richOn', F.mar.filter(m => m.richOn).length, F.mar.filter(m => !m.alive).map(m => m.rich ? m.rich.M.cause : 'cheap:' + m.body.why).join(';'), F.mar.slice(0, 2).map(m => m.ai.state + '/' + m.ai.fire + '/' + (m.rich ? m.rich.stats.shots + ' ' + JSON.stringify(m.rich.stats.wait) : '')).join(' | '));
  }
  process.exit(0);
}
if (process.argv[2] === 'cmp') {   // the same fights, cheap vs rich near men (balance)
  for (const rich of [false, true]) {
    const tot = { kia: 0, wia: 0, rtd: 0, shots: 0, hits: 0, machines: 0, able: 0, treat: 0 };
    for (let seed = 1; seed <= +(process.argv[3] || 4); seed++) {
      const F = battle({ seed, striders: 8, rich, care: true }); run(F, 300, { until: F => !F.rw.some(u => u.alive) || !F.mar.some(m => m.able) });
      tot.kia += F.GS.stats.kia; tot.wia += F.GS.stats.wia; tot.rtd += F.GS.stats.rtd; tot.shots += F.GS.stats.shots[1]; tot.hits += F.GS.stats.hits[1]; tot.machines += F.rw.filter(u => u.alive).length; tot.able += F.mar.filter(m => m.able).length; tot.treat += F.GS.FC.stats.treatments + F.GS.FC.stats.treated;
    }
    console.log(rich ? 'RICH ' : 'CHEAP', JSON.stringify(tot));
  }
  process.exit(0);
}
if (process.argv[2] === 'care') {   // the corpsman scenario, verbose
  const F = battle({ seed: +(process.argv[3] || 2) }); let pt = null; const doc = F.mar.find(m => m.role === 'doc');
  run(F, +(process.argv[4] || 240), { peace: true, each: (F, t) => {
    if (!pt && t > 20) { pt = F.mar[3]; F.GS.enrich(pt); femoral(pt.rich.M); pt.rich.M.ko = +(process.argv[5] || 30); F.GS.richState(pt); }
    if (pt && Math.abs(t % 2) < 1 / 60) { const S = F.B.mar.squads[0], j = S.care; console.log(t.toFixed(1), 'doc', doc.x.toFixed(1), doc.z.toFixed(1), doc.ai.state, doc.richOn, '| pt', pt.x.toFixed(1), pt.z.toFixed(1), 'd', Math.hypot(doc.x - pt.x, doc.z - pt.z).toFixed(2), pt.able, pt.rich.M.action && pt.rich.M.action.label, Math.round(pt.rich.M.bleedRate()), 'job', j && j.phase, j && j.medic.role, '| treat', F.GS.FC.stats.treatments, JSON.stringify(pt.cas && { tr: pt.cas.treated, ccp: pt.cas.atCCP, held: pt.cas.held })); }
  } });
  process.exit(0);
}

// ------------------------------------------------------------------------------------------------- 1. the treatment chooser
{
  const rng = mulberry32(5);
  const M = createMedical({ rng }); femoral(M);
  const doc = I.loadout('corpsman'), pt = I.loadout('rifleman');
  const a1 = pickAid(M, [pt, doc], { self: false, skill: 'corpsman' });
  check(a1 && a1.region === 'legL' && /tq|cravat/.test(a1.item.id), 'a femoral bleed: the medic reaches for a tourniquet on that leg first', a1 && `${a1.item.id} -> ${a1.region} (${a1.label}, ${a1.time} s)`);
  check(a1 && pt.slots && I.isWithin(a1.item, pt), "the casualty's own kit is used first (doctrine): his cravat", a1 && a1.item.id);
  // the corpsman has the IV: a man in class III shock gets one; a rifleman can't start it
  const M2 = createMedical({ rng }); M2.vol *= 0.6; M2.rbc *= 0.6;
  const a2 = pickAid(M2, [doc], { self: false, skill: 'corpsman' }), a3 = pickAid(M2, [doc], { self: false, skill: 'rifleman' });
  check(a2 && a2.item.id === 'iv_lr' && !(a3 && a3.item.id === 'iv_lr'), 'class III shock: the corpsman starts a Ringer\'s IV; a rifleman with the same bag cannot (corpsman only)', `${a2 && a2.item.id} / ${a3 ? a3.item.id : 'nothing'}`);
  // a run of buddy aid on the femoral bleed until there is nothing left to do: he lives
  const M3 = createMedical({ rng: mulberry32(9) }); femoral(M3, 'legR'); const kit = I.loadout('corpsman'), own = I.loadout('rifleman');
  let t = 0, n = 0; const by = { self: false, skill: 'corpsman' };
  M3.update(15, {}); t += 15;   // 15 s before he gets there
  while (t < 1800 && !M3.dead) {
    if (!M3.action) { const a = pickAid(M3, [own, kit], by); if (a && M3.startTreatment({ item: a.item, region: a.region, by }).ok) n++; }
    M3.update(0.5, {}); t += 0.5; I.prune(own); I.prune(kit);
  }
  check(!M3.dead && M3.bleedRate() < 30, 'a femoral bleed treated by a corpsman 15 s after the hit: alive at 30 min', `${n} treatments, ${M3.vitals().bloodMl} ml blood, bleeding ${Math.round(M3.bleedRate())} ml/min, tq ${M3.regions.legR.tq.length}`);
}

// ------------------------------------------------------------------------------------------------- 2. the rich AI Marine
{
  const env = { height: () => 0 };
  const u = { id: 7, role: 'ar', seed: 3, body: createMarine({ role: 'ar', env }) };
  const RM = createRichMarine(u, {}); RM.place(0, 0, 0, env);
  let shots = 0;
  // run 10 s (inertia: he does not reach his pace at once), then go prone and fire bursts at a target 60 m off
  const v = [];
  for (let i = 0; i < 300; i++) { RM.step(1 / 30, { move: [0, -60], pace: 'run', stance: 'stand' }, env, [0, -2.74], null); v.push(RM.S.speed); }
  check(v[3] < 1.0 && Math.abs(v[299] - 2.74) < 0.3, 'rich Marine: soldier.js inertia, then double time', `${v[3].toFixed(2)} m/s after 0.1 s, ${v[299].toFixed(2)} at 10 s`);
  for (let i = 0; i < 30 * 60; i++) shots += RM.step(1 / 30, { move: null, pace: 'walk', stance: 'prone' }, env, [0, 0], { fire: 'auto', aim: [30, 0.6, -90], supp: 0, burstS: 0.35, pause: 1.2, gap: 1 }).length;
  check(RM.S.stance === 'prone' && shots > 40, 'goes prone (a real stance transition) and fires the AR\'s bursts', `${shots} rounds in 60 s`);
  check(RM.stats.reloads >= 2 && RM.roundsLeft() < 7 * 18, 'reloads from his own MEDINV rig (rounds counted out of his pouches)', `${RM.stats.reloads} reloads, ${RM.roundsLeft()} rounds left`);
  // stoppages and immediate action
  const w = RM.R.slots[0]; w.malf = 'stovepipe'; w.malfKnown = false; let cleared = false;
  for (let i = 0; i < 150 && !cleared; i++) { RM.step(1 / 30, { move: null, stance: 'prone' }, env, [0, 0], { fire: 'auto', aim: [30, 0.6, -90] }); cleared = !w.malf && !w.act; }
  check(cleared && RM.stats.ia >= 1, 'a stoppage: SPORTS immediate action clears it', `ia ${RM.stats.ia}`);
  // wounds: MEDINV decides
  const u2 = { id: 8, role: 'tl', seed: 4, body: createMarine({ role: 'tl', env }) }, R2 = createRichMarine(u2, {}); R2.place(0, 0, 0, env); R2.noSelfAid = true;
  R2.hit({ kind: 'bullet', part: 'armL', dmg: 30, pen: 40, bleed: 1 }); R2.medStep(0.2);
  const s1 = R2.state(); femoral(R2.M); let tDown = null, tDead = null;
  for (let t = 0; t < 900 && tDead === null; t += 0.5) { R2.medStep(0.5); if (tDown === null && R2.state() === 'down') tDown = t; if (R2.state() === 'dead') tDead = t; }
  check(s1 === 'ok' && tDown !== null && tDead !== null && tDown < tDead, 'MEDINV decides: a graze, he fights on; an untreated femoral bleed puts him down, then kills him', `down at ${tDown} s, dead at ${tDead} s`);
  // self aid: the same wound, conscious, his own cravat
  const u4 = { id: 10, role: 'tl', seed: 6, body: createMarine({ role: 'tl', env }) }, R4 = createRichMarine(u4, {}); R4.place(0, 0, 0, env);
  femoral(R4.M); let st4 = []; for (let t = 0; t < 600; t += 0.5) { R4.medStep(0.5); st4.push(R4.state()); }
  check(R4.stats.selfAid >= 1 && R4.M.regions.legL.tq.length >= 1 && !R4.M.dead, 'self aid (FM 21-11): conscious with a femoral bleed, he twists his own cravat on as a tourniquet', `${R4.stats.selfAid} self-aid, tq ${R4.M.regions.legL.tq.length}, alive after 10 min, ${Math.round(R4.M.bleedRate())} ml/min, ${st4.includes('down') ? 'was down while it bled' : ''}`);
  // cost of one rich man
  const u3 = { id: 9, role: 'tl', seed: 5, body: createMarine({ role: 'tl', env }) }, R3 = createRichMarine(u3, {}); R3.place(0, 0, 0, env);
  const t0 = performance.now();
  for (let i = 0; i < 30 * 120; i++) R3.step(1 / 30, { move: i % 600 < 300 ? [0, -50] : null, pace: 'run', stance: i % 600 < 300 ? 'stand' : 'prone' }, env, i % 600 < 300 ? [0, -2.7] : [0, 0], i % 600 < 300 ? null : { fire: 'rifle', aim: [20, 0.5, -80], gap: 1.1 });
  const ms = (performance.now() - t0) / 120;
  check(ms < 4, 'cost: one rich Marine (rifleman at 1/30 s + medical at 10 Hz)', `${ms.toFixed(2)} ms of CPU per simulated second`);
}

// ------------------------------------------------------------------------------------------------- 3. the corpsman and buddy aid
{
  // a quiet perimeter; one man takes a femoral bleed; the corpsman goes to him and works on him
  const F = battle({ seed: 2 }); let hitT = 0, doc = F.mar.find(m => m.role === 'doc'), pt = null;
  const r = run(F, 420, { peace: true, each: (F, t) => {
    if (!pt && t > 20) { pt = F.mar[3]; F.GS.enrich(pt); femoral(pt.rich.M); pt.rich.M.ko = 400; F.GS.richState(pt); hitT = t; }
  } });
  const M = pt.rich.M;
  check(F.GS.FC.stats.treatments >= 1 && M.regions.legL.tq.length >= 1, 'the corpsman comes to a man down with a femoral bleed and puts a tourniquet on (buddy-aid API, by: corpsman)', `${F.GS.FC.stats.treatments} treatments, tq ${M.regions.legL.tq.length}, blood ${M.vitals().bloodMl} ml`);
  check(!M.dead, 'the casualty is alive 3.5 min later', `bleeding ${Math.round(M.bleedRate())} ml/min, cls ${M.cls()}`);
  check(r.ev.medic >= 1 && r.ev.kneel >= 1, 'events: medic assigned, kneels by the casualty', JSON.stringify({ medic: r.ev.medic, kneel: r.ev.kneel, treat: r.ev.treat }));
  check((r.ev.drag >= 1 || r.ev.walking >= 1) && pt.cas && (pt.cas.atCCP || Math.hypot(pt.x - F.GS.FC.ccp(F.B).x, pt.z - F.GS.FC.ccp(F.B).z) < 4), 'quiet again: he goes to the casualty collection point by the pad (walking wounded, or dragged by a buddy at BUDDY.dragSpeed)', `walking ${r.ev.walking} drag ${r.ev.drag}, ${pt.cas && pt.cas.atCCP ? 'at the CCP' : 'not at the CCP'}, drag speed ${F.GS.FC.dragV} m/s`);
  // the same with no corpsman: the cheap model's timer, an untreated casualty dies of wounds
  const G = battle({ seed: 3, roles: MARINE.ROLES, rich: false }); let p2 = null, tDead = null;
  for (const m of G.mar) if (m !== G.mar[0]) m.alive && (m.ai = m.ai);   // (everyone present)
  run(G, 900, { peace: true, cam: { x: 3000, y: 0, z: 3000 }, each: (G, t) => {
    if (!p2 && t > 5) { p2 = G.mar[4]; p2.body.hit({ part: 'legL', hp: 70 }); p2.body.able = false; G.GS.sync(p2); for (const m of G.mar) if (m !== p2) { m.body.alive = false; m.alive = false; } }
    if (p2 && !p2.alive && tDead === null) tDead = t;
  } });
  check(tDead !== null && tDead > CARE.BLEED_OUT[0] - 10 && tDead < CARE.BLEED_OUT[1] + 10, 'cheap model, nobody to help: he dies of his wounds in 4-12 min (GAME)', `${tDead === null ? 'alive' : (tDead / 60).toFixed(1) + ' min'}`);
  // buddy aid on the cheap model: no corpsman in the squad, a rifleman treats him, and he lives
  const H = battle({ seed: 4, roles: MARINE.ROLES, rich: false }); let p3 = null;
  const rH = run(H, 600, { peace: true, cam: { x: 3000, y: 0, z: 3000 }, each: (H, t) => { if (!p3 && t > 5) { p3 = H.mar[6]; p3.body.hit({ part: 'legR', hp: 70 }); p3.body.able = false; H.GS.sync(p3); } } });
  check(p3.alive && p3.cas && p3.cas.treated, 'cheap model with buddies: a rifleman does buddy aid (40-80 s) and he lives', `${H.GS.FC.stats.treated} treated, alive ${p3.alive}`);
  check(rH.ev.drag >= 1 && p3.cas.atCCP, "his leg is gone (he can't walk): a buddy drags him to the CCP by the vest's drag strap (MEDINV BUDDY.dragSpeed)", `drag ${rH.ev.drag}, at the CCP ${p3.cas.atCCP}, ${H.GS.FC.dragV} m/s`);
}

// ------------------------------------------------------------------------------------------------- 4. the player as a patient
{
  const rng = mulberry32(11), PM = createMedical({ rng }); femoral(PM, 'armR');
  const P = { id: 'player', ext: true, x: 4, y: 0, z: 48, M: PM, inv: I.loadout('rifleman'), moving: false };
  P.y = isl.height(P.x, P.z);
  const F = battle({ seed: 5, hooks: { patients: () => [P] } });
  run(F, 120, { peace: true, each: () => PM.update(1 / 30, {}) });
  check(F.GS.FC.stats.playerTreated >= 1 && PM.regions.armR.tq.length >= 1 && !PM.dead, 'the player bleeding near the squad: the corpsman comes to him and puts a tourniquet on his arm', `${F.GS.FC.stats.playerTreated} treatments, bleeding ${Math.round(PM.bleedRate())} ml/min`);
}

// ------------------------------------------------------------------------------------------------- 5. a fight with rich men and care
{
  // (the first of seeds 6.. with a wounded man in it: a fight where everyone hit dies outright tests nothing here)
  let F, maxRich = 0;
  for (let seed = 6; seed < 10; seed++) { F = battle({ seed, striders: 8 }); maxRich = 0; run(F, 240, { each: F => { maxRich = Math.max(maxRich, F.mar.filter(m => m.richOn).length); } }); if (F.GS.stats.wia > 0) break; }
  const st = F.GS.stats, cs = F.GS.FC.stats, rc = F.GS.richCost;
  check(maxRich >= 10 && F.mar.some(m => m.rich && m.rich.stats.shots > 0), 'the Marines near the camera fight on the rifleman sim (shots from their real muzzles)', `${maxRich} rich, ${F.mar.reduce((s, m) => s + (m.rich ? m.rich.stats.shots : 0), 0)} rifleman shots`);
  const self = F.mar.reduce((s, m) => s + (m.rich?.stats.selfAid || 0), 0);
  check(st.kia + st.wia > 0 && (cs.treatments + cs.treated + self) > 0 && cs.callouts > 0, 'under fire: casualties call out, treat themselves, the corpsman goes to them', JSON.stringify({ kia: st.kia, wia: st.wia, rtd: st.rtd, dow: st.dow, selfAid: self, ...cs }));
  check(rc.steps > 0 && rc.ms / rc.steps < 0.5, 'cost per rich Marine per frame (in a fight, 1/30 s frames)', `${(rc.ms / rc.steps).toFixed(3)} ms per man per frame (${(rc.ms / rc.steps * 30).toFixed(2)} ms per man per simulated s)`);
  const ccp = F.GS.FC.ccp(F.B), list = F.GS.casualties(ccp.x, ccp.z, 400), n0 = list.length;
  for (const u of list) F.GS.evacuate(u);
  check(F.GS.casualties(ccp.x, ccp.z, 400).length === 0 && F.GS.stats.evac === n0, 'evacuation: the wounded leave the island alive', `${n0} evacuated`);
}

// ------------------------------------------------------------------------------------------------- 6. attacking: the rich men shoot
{
  // (ngc/infdepth-fix: the groundwar scene's shape - Marines going in against machines holding the pad; the rich model
  // once fired almost nothing here: an aim tolerance of 0.7 deg and no fire on the move)
  const F = battle({ seed: 2, striders: 0, owner: 2, marOrder: { type: 'take', x: 0, z: 30, r: 30 } });
  for (const m of F.mar) F.GS.place(m, m.x + 60, m.z + 60);
  const rw = []; for (let k = 0; k < 4; k++) rw.push(F.GS.addStrider(F.B, -6 + k * 4, 26, 0, { weapon: k ? 'xm7' : 'coil' }));
  F.GS.squadRW(F.B, rw, { type: 'defend', x: 0, z: 30, r: 25 });
  let at20 = 0; run(F, 40, { cam: { x: 60, y: 30, z: 100 }, each: (F, t) => { if (t < 20) at20 = F.GS.stats.shots[1]; } });
  check(at20 > 20 && F.mar.filter(m => m.richOn).length > 0, 'attacking a held pad, the rich Marines fire (> 20 rounds in the first 20 s: the groundwar scene\'s check)', `${at20} by 20 s, ${F.GS.stats.shots[1]} by 40 s (machines ${F.GS.stats.shots[2]})`);
}

console.log(`\n${pass}/${pass + fail} checks pass`);
process.exit(fail ? 1 : 0);
