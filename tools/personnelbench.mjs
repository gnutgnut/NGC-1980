#!/usr/bin/env node
// personnelbench.mjs - PERSONNEL in node: the roster (records, names, ranks, MOS), skills and experience (growth with
// use, levels, what they gate), the reassignment rules (jobs, squads: form / split / merge), every person's kit
// (MEDINV inventory: summaries, hand-overs, rounds spent and rearmed), the sick bay and the KIA list, and friendly fire
// through the ground war's own hit path (the door gun, a bomb's blast, the commander's rifle) on real groundsim fights.
//   node tools/personnelbench.mjs
import { createRoster, JOBS, QUAL, perfOf, levelName, MOS } from '../game/js/units/personnel/roster.js';
import { establish, topUp, STRENGTH } from '../game/js/units/personnel/establish.js';
import { summary, give, spend556, resupply, makeKit } from '../game/js/units/personnel/kit.js';
import { createBinder, roleAt } from '../game/js/units/personnel/bind.js';
import { createGroundSim } from '../game/js/units/groundwar/groundsim.js';
import { MARINE } from '../game/js/units/groundwar/marine.js';
import { sandboxIsland } from '../game/js/units/runaway/rwworld.js';

let pass = 0, fail = 0;
const check = (ok, name, info = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -  ' + info : ''}`); };

// ------------------------------------------------------------------------------------------------- 1. the roster
const P = createRoster({ seed: 7 });
const deck = ['yellow', 'blue', 'blue', 'purple', 'red', 'green', 'brown', 'white'].map(j => ({ jersey: j }));
const est = establish(P, { deckCrew: deck, aaSites: [{ key: 'aa:FORGE:0', island: 'FORGE', soviet: true }, { key: 'aa:ECHO:0', island: 'ECHO' }] });
{
  const n = P.recs.length, names = new Set(P.recs.map(r => r.first + ' ' + r.last));
  check(n >= 140 && n < 260, `the task force: ${n} people, every one a record`, `${est.squads.length} rifle squads, ${deck.length} deck crew, 4 AA crewmen`);
  check(P.recs.every(r => r.first && r.last && r.rank && MOS[r.mos] && r.xp && r.job), 'every record has a name, a rank, an MOS, skills and a job');
  check(names.size > n * 0.95, 'names are (nearly all) unique', `${names.size} / ${n}`);
  check(new Set(P.recs.map(r => r.id)).size === n, 'ids are unique');
  const sq = est.squads[0], mem = P.members(sq);
  check(mem.length === 13 && mem[0].mos === '0369' && mem[12].mos === '8404', 'a 1980 rifle squad: a squad leader (0369), 11 riflemen / assaultman, its Navy corpsman (8404)', sq.name);
  check(P.leaderOf(sq) === mem[0], 'the squad leader is the man with the leadership', P.fullName(mem[0]));
  check(deck.every(m => P.get(m.pid) && P.get(m.pid).jersey === m.jersey), 'each deck crew figure is a record in his jersey colour', deck.map(m => P.title(P.get(m.pid)).split(' (')[0].slice(0, 22)).slice(0, 2).join(' / '));
  check(P.recs.filter(r => r.mos === 'SOV-AA').length === 2 && P.recs.filter(r => r.unit === 'aa:ECHO:0').length === 2, 'two men on each AA gun; the Shilka crews are the Soviet contingent', P.fullName(P.recs.find(r => r.mos === 'SOV-AA')));
  check(Object.entries(STRENGTH).every(([mos, k]) => P.recs.filter(r => r.mos === mos).length >= k), 'every trade at strength (pilots, crew chiefs, tankers, drivers, LAAD gunners, riflemen, corpsmen, sailors)');
}

// ------------------------------------------------------------------------------------------------- 2. skills, experience, gating
{
  const rifle = P.recs.find(r => r.mos === '0311'), pilot = P.recs.find(r => r.mos === '1310-F18'), doc = P.recs.find(r => r.mos === '8404'), huey = P.recs.find(r => r.mos === '7563');
  check(P.xp(rifle, 'rifle') >= 25 && P.xp(rifle, 'fly_fa18') === 0, 'a rifleman shoots (rifle TRAINED-ish) and has never flown', `${levelName(P.xp(rifle, 'rifle'))}, F/A-18: ${P.levelName(rifle, 'fly_fa18')}`);
  const w = P.qualified(rifle, 'pilot_fa18');
  check(/NOT QUALIFIED/.test(w), 'an untrained man is refused the Hornet', w);
  check(P.qualified(pilot, 'pilot_fa18') === '', 'a naval aviator (F/A-18A) is qualified on it', `${P.levelName(pilot, 'fly_fa18')}`);
  check(/NOT QUALIFIED/.test(P.qualified(huey, 'pilot_fa18')) && P.qualified(huey, 'pilot_uh1') === '', 'a Huey pilot flies the Huey, not the Hornet (type ratings)');
  check(/NOT QUALIFIED/.test(P.qualified(rifle, 'corpsman')) && P.qualified(doc, 'corpsman') === '', 'a rifleman is not a corpsman; the HM is');
  check(P.qualified(rifle, 'aa') === '' && P.qualified(rifle, 'driver') === '', 'anyone may take an AA gun or a jeep (soft: perf says how well)');
  check(perfOf(0) < 0.6 && perfOf(70) > 0.99 && perfOf(70) < 1.01 && perfOf(400) <= 1.2 + 1e-9, 'perf: 0.55 untrained, 1.0 experienced, 1.2 at most', `${perfOf(0).toFixed(2)} / ${perfOf(QUAL).toFixed(2)} / ${perfOf(70).toFixed(2)} / ${perfOf(400).toFixed(2)}`);
  // experience grows with use, with diminishing returns, and crosses into the next level
  const g = P.add({ mos: '0311', green: true, years: 0 }); const x0 = P.xp(g, 'aa'), d0 = P.gain(g, 'aa', 1); for (let i = 0; i < 400; i++) P.gain(g, 'aa', 1); const d1 = P.gain(g, 'aa', 1);
  const lv = P.events.filter(e => e.e === 'level' && e.id === g.id).map(e => e.level);
  check(P.xp(g, 'aa') > 100 && d1 < d0 * 0.5 && lv.includes('TRAINED') && lv.includes('EXPERIENCED'), 'experience grows with use (an AA gunner learning on the gun), slower as he gets better, levels announced', `${x0.toFixed(0)} -> ${P.xp(g, 'aa').toFixed(0)} xp, ${lv.join(' > ')}`);
  check(P.perf(g, 'aa') > perfOf(x0) + 0.4, 'and he shoots better for it', `${perfOf(x0).toFixed(2)} -> ${P.perf(g, 'aa').toFixed(2)}`);
  // a wounded man works worse
  const wnd = P.add({ mos: '7204' }); const p0 = P.perf(wnd, 'aa'); P.hurt(wnd, { amount: 0.3, what: 'TEST' }); check(P.perf(wnd, 'aa') < p0 && wnd.status === 'wounded', 'a wounded man works worse', `${p0.toFixed(2)} -> ${P.perf(wnd, 'aa').toFixed(2)}`);
}

// ------------------------------------------------------------------------------------------------- 3. reassignment
{
  const r = P.recs.find(r => r.mos === '0311' && r.job === 'reserve'), doc = P.recs.find(r => r.mos === '8404' && !r.squad);
  check(P.assign(r, 'aa', { loc: 'FORGE', unit: 'aa:FORGE:0', seat: 2 }) === '' && r.job === 'aa' && r.loc === 'FORGE', 'a rifleman reassigned to an AA gun on FORGE');
  check(/NOT QUALIFIED/.test(P.assign(r, 'pilot_f14')) && r.job === 'aa', 'refused the Tomcat: his job stays');
  check(P.assign(doc, 'corpsman') === '', 'the HM takes the corpsman job');
  const civ = P.add({ mos: 'CIV', loc: 'FORGE' });
  check(/CIVILIAN/.test(P.assign(civ, 'rifleman')), 'a civilian is not drafted', P.assign(civ, 'rifleman'));
  const dn = P.add({ mos: '0311' }); P.hurt(dn, { amount: 0.7 });
  check(dn.status === 'down' && /DOWN/.test(P.assign(dn, 'rifleman')), 'a man down cannot take a job', P.assign(dn, 'rifleman'));
  // squads: form, split, merge, leave
  const [a, b] = [P.squads[0], P.squads[1]], na = a.members.length, nb = b.members.length;
  const team = P.members(a).slice(1, 5), t = P.split(a, team, 'FIRE TEAM ALPHA');
  check(t.members.length === 4 && a.members.length === na - 4 && team.every(m => m.squad === t.id), 'a fire team split off as its own squad', `${t.name}: ${t.members.length}, ${a.name}: ${a.members.length}`);
  P.merge(a, t); check(a.members.length === na && !P.squad(t.id), 'and merged back');
  const m0 = P.members(b)[3]; P.joinSquad(m0, a);
  check(a.members.length === na + 1 && b.members.length === nb - 1 && m0.squad === a.id, 'a man moved from one squad to another');
  const fresh = P.formSquad(null, [r, doc]); check(fresh.members.length === 2 && /SQUAD/.test(fresh.name), 'a new squad formed from any men', fresh.name);
  P.leaveSquad(r); P.leaveSquad(doc); check(!P.squad(fresh.id), 'an empty squad is struck off');
}

// ------------------------------------------------------------------------------------------------- 4. kit
{
  const rf = P.add({ mos: '0311', job: 'rifleman' }), drv = P.add({ mos: '3531' }), pil = P.add({ mos: '1310-F18' }), cm = P.add({ mos: '8404' }), sn = P.add({ mos: 'SN' });
  const s = summary(P.kit(rf)), sd = summary(P.kit(drv)), sp = summary(P.kit(pil)), sc = summary(P.kit(cm)), ss = summary(P.kit(sn));
  check(s.r556 === 280 && s.mags556 === 7 && s.m67 === 2 && s.law === 1 && s.dressings >= 2, "the rifleman's basic load (MEDINV's): 7 magazines + a bandolier, 2 M67, an M72, dressings", JSON.stringify({ r556: s.r556, mags: s.mags556, m67: s.m67, law: s.law, drsg: s.dressings, kg: s.kg }));
  check(sp.r45 === 14 && sp.r556 === 0 && sp.dressings === 1, "a pilot: an M1911 and a spare magazine, a dressing", JSON.stringify({ r45: sp.r45, drsg: sp.dressings }));
  check(sc.dressings >= 6 && sc.morphine >= 2 && sc.iv >= 2, "the corpsman's Unit One bag", JSON.stringify({ drsg: sc.dressings, morphine: sc.morphine, iv: sc.iv }));
  check(ss.r556 === 0 && ss.dressings === 1 && sd.r556 === 60, "a seaman has a dressing; a driver his M16 and two spare magazines", `${ss.dressings} / ${sd.r556}`);
  const n = give(P.kit(rf), P.kit(drv), 'mag556', 2), s2 = summary(P.kit(rf)), sd2 = summary(P.kit(drv));
  check(n === 2 && s2.mags556 === 5 && sd2.mags556 === 5 && s2.r556 + sd2.r556 === 340, 'two magazines handed over (the one in his rifle stays)', `${s.mags556}->${s2.mags556} / ${sd.mags556}->${sd2.mags556}`);
  check(give(P.kit(sn), P.kit(rf), 'dressing', 3) === 1 && summary(P.kit(sn)).dressings === 0, 'a dressing handed over: he had only the one');
  check(give(P.kit(pil), P.kit(drv), 'mag556', 1) === 0, 'nothing to give: nothing moves');
  const sp1 = spend556(P.kit(drv), 50), sd3 = summary(P.kit(drv));
  check(sp1 === 50 && sd3.r556 === sd2.r556 - 50, 'rounds fired come out of his real magazines (emptiest first)', `${sd2.r556} -> ${sd3.r556}`);
  spend556(P.kit(drv), 1000); check(summary(P.kit(drv)).r556 === 0, 'until he is dry');
  const got = resupply(P.kit(drv), drv), sd4 = summary(P.kit(drv));
  check(got.length && sd4.r556 >= 100, 'rearmed at a pad / the carrier: every magazine he carries refilled', got.join(', ') + `  -  ${sd4.r556} rounds`);
}

// ------------------------------------------------------------------------------------------------- 5. sick bay, KIA list
{
  const w = P.add({ mos: '0311' }); P.hurt(w, { amount: 0.6, part: 'legL', what: 'STRIDER FIRE', by: { side: 2 } });
  check(w.status === 'down' && w.wounds.length === 1, 'a man hit: down, the wound on his record', `${w.wounds[0].part} ${w.wounds[0].what}`);
  P.toSickBay(w); check(w.status === 'sickbay' && w.loc === 'ALBATROSS' && w.sickT > 120, 'in the carrier sick bay', `${Math.round(w.sickT)} s to recover`);
  for (let i = 0; i < 700; i++) P.step(1);
  check(w.status === 'fit' && w.hp === 1 && P.events.some(e => e.e === 'rtd' && e.id === w.id), 'and back to duty', w.log.map(l => l.text).slice(-2).join(' / '));
  const k = P.add({ mos: '0311' }); P.kill(k, 'TEST'); const n0 = P.kiaList.length;
  check(k.status === 'kia' && P.kiaList.includes(k.id), 'killed: on the KIA list');
  check(/DEAD/.test(P.assign(k, 'rifleman')) && P.toSickBay(k) === 'NO', 'the dead stay dead (no job, no sick bay)');
  const t = topUp(P); check(P.kiaList.length === n0 && k.status === 'kia', 'a new war tops the trades up with replacements; the fallen stay fallen', `${t} replacements`);
}

// ------------------------------------------------------------------------------------------------- 6. the ground war: one person = one body; friendly fire
const isl = sandboxIsland(1980);
function battle(o = {}) {
  const I = { id: 0, name: 'TEST', x: 0, z: 0, r: 215, pad: { x: 0, z: 30, r: 8.5, h: isl.height(0, 30) }, structs: [], owner: o.owner ?? 1 };
  const R = createRoster({ seed: 11 }); establish(R, {});
  let BD = null;
  const GS = createGroundSim({ terrainH: isl.heightExact, islands: [I], seed: o.seed ?? 1, hooks: { onEvent: e => BD && BD.onEvent(e) }, ff: o.ff ?? true });
  BD = createBinder(R, GS, {});
  GS.maps.bakeAll(); GS.maps.setObstacles(I, isl.obstacles.map(q => ({ ...q })));
  const B = GS.battle(I), mar = [], { recs } = BD.stick(o.n ?? 13, 'ALBATROSS');
  for (let k = 0; k < recs.length; k++) { const u = GS.addMarine(B, roleAt(k, recs.length), (k % 5) * 3 - 6, 40 + Math.floor(k / 5) * 3, 0, { seed: k }); BD.bind(u, recs[k], I); mar.push(u); }
  GS.squadMarines(B, mar, { type: 'defend', x: 0, z: 30, r: 25 });
  const rw = [];
  for (let k = 0; k < (o.striders ?? 0); k++) rw.push(GS.addStrider(B, -40 + (k % 4) * 4, -130 + Math.floor(k / 4) * 4, Math.PI, { weapon: 'xm7' }));
  if (rw.length) GS.squadRW(B, rw, { type: 'take', x: 0, z: 30, r: 30 });
  return { I, R, GS, BD, B, mar, rw, recs };
}
{
  const T = battle();
  check(T.mar.every((u, k) => u.pid === T.recs[k].id && T.recs[k].body.id === u.id), 'a Sea Knight load: each Marine on the ground is a roster record, and the record knows his body', T.mar.slice(0, 3).map(u => u.name).join(', '));
  check(T.recs[0].mos === '0369' && T.recs[12].mos === '8404' && T.mar[0].role === 'sl' && T.mar[12].role === 'doc', 'the squad leader leads, the corpsman is the doc (the stick picks men by trade)');
  check(T.mar.every(u => u.kit === T.R.get(u.pid).kitRoot && u.ammo === summary(u.kit)[u.role === 'mg' ? 'r762' : 'r556']), 'his kit is his record\'s kit: rounds counted out of it', `${T.mar[1].ammo} rounds`);
  // the door gun: a burst along the squad's line (war 'b' rounds through GS.segHit, side 1)
  const v = T.mar[2], before = T.R.ff.incidents;
  let hitU = null; for (let k = 0; k < 12 && !hitU; k++) { const r = T.GS.segHit(1, 'm60', v.x - 40, v.y + 1.2, v.z + (k - 6) * 0.05, v.x + 40, v.y + 1.0, v.z + (k - 6) * 0.05, 60, 0, 'war:b'); if (r) hitU = r.unit; }
  const hr = hitU && T.R.get(hitU.pid);
  check(hitU && hitU.side === 1 && hr && hr.wounds.some(w => w.ff && /DOOR GUN/.test(w.what)) && T.R.ff.incidents > before, 'a Huey door-gun burst through our own squad hits a Marine: on his record, BLUE ON BLUE', hr ? `${T.R.fullName(hr)}: ${hr.status}, ${hr.wounds[0].part} - ${hr.wounds[0].what}` : 'no hit');
  check(T.R.events.some(e => e.e === 'ff' && /DOOR GUN/.test(e.what)), 'the friendly-fire event names the weapon (the feed\'s "BLUE ON BLUE")');
  // a bomb's blast on the squad's position (war.js blast -> GW.blast -> GS.blast, side 1)
  const n0 = T.R.ff.incidents; T.GS.blast(T.mar[6].x, T.mar[6].y, T.mar[6].z, 12 * 0.9, 20 / 4, 1, null, 'war:bomb');
  const bomb = T.R.recs.filter(r => r.wounds.some(w => w.ff && /BOMB/.test(w.what)));
  check(bomb.length >= 3 && T.R.ff.incidents >= n0 + 3, 'our own bomb on our own squad: several men hit, each one counted', `${bomb.length} hit, ${bomb.filter(r => r.status === 'kia').length} killed  -  ff incidents ${T.R.ff.incidents}, killed ${T.R.ff.killed}`);
  T.BD.flush();
  check(bomb.filter(r => r.status === 'kia').every(r => T.R.kiaList.includes(r.id) && /BOMB|KILLED/.test(r.why)), 'the dead go on the KIA list with what killed them');
  // the commander's rifle (marine.js -> GS.hitUnit, src 'player'): the shooter's record is charged with it
  const C = battle({ seed: 2 }), me = C.R.add({ mos: '0311', loc: 'TEST' }); C.BD.shooter = src => (src === 'player' ? me : null);
  const tgt = C.mar.find(u => u.alive && u.able); C.GS.hitUnit(1, 'm16', tgt, tgt.x, tgt.y + 1.2, tgt.z, [1, 0, 0], 60);
  check(me.stats.ffBy === 1 && C.R.get(tgt.pid).stats.ffOn >= 1, "the commander's own rifle: counted against him (ffBy) and on the man he hit (ffOn)");
  // without the friendly-fire option the old rule (our rounds pass through our men) holds - the balance benches
  const U = battle({ ff: false }); const w = U.mar[2]; let any = false;
  for (let k = 0; k < 12; k++) if (U.GS.segHit(1, 'm60', w.x - 40, w.y + 1.2, w.z + (k - 6) * 0.05, w.x + 40, w.y + 1.0, w.z + (k - 6) * 0.05, 60)) any = true;
  check(!any && U.R.ff.incidents === 0, 'GS ff off (the balance benches): our rounds pass our men as before');
  // the enemy's rounds: a wound, not friendly fire
  const E = battle(), e0 = E.mar[3]; let eh = null; for (let k = 0; k < 12 && !eh; k++) eh = E.GS.segHit(2, 'xm7', e0.x - 40, e0.y + 1.2, e0.z + (k - 6) * 0.05, e0.x + 40, e0.y + 1.0, e0.z + (k - 6) * 0.05, 60);
  const er = eh && E.R.get(eh.unit.pid);
  check(er && er.wounds.length && !er.wounds[0].ff && E.R.ff.incidents === 0, 'a STRIDER\'s round: a wound on his record, not blue on blue', er ? er.wounds[0].what : '');
}
// ------------------------------------------------------------------------------------------------- 7. a fight: ammunition, experience, skill
{
  const T = battle({ striders: 8, seed: 3, owner: 2 });   // (their island: no rearming on the pad)
  // two men nearly dry: one magazine each
  const low = T.mar.filter(u => u.role === 'tl').slice(0, 2);
  for (const u of low) { const k = u.kit; spend556(k, summary(k).r556 - 20); T.BD.books(u, T.R.get(u.pid)); }
  check(low.every(u => u.ammo === 20), 'two riflemen sent in with one magazine each', low.map(u => u.ammo).join(', '));
  const xp0 = T.recs.map(r => T.R.xp(r, 'rifle')), shots0 = T.recs.map(r => r.stats.shots);
  const t0 = performance.now(); let tickMs = 0, ticks = 0, dryEv = 0;
  for (let i = 0; i < 300 * 30; i++) {
    for (const e of T.GS.step(1 / 30, { cam: { x: 0, y: 60, z: 0 } })) if (e.e === 'dry') dryEv++;
    if (i % 30 === 0) { const a = performance.now(); T.BD.tick(1); tickMs += performance.now() - a; ticks++; }
    if (!T.rw.some(u => u.alive) || !T.mar.some(u => u.alive && u.able)) break;
  }
  const cost = (performance.now() - t0) / T.GS.time;
  check(T.BD.stats.dry + dryEv > 0 || low.some(u => T.R.get(u.pid).log.some(l => /OUT OF AMMUNITION|AMMO FROM/.test(l.text))), 'a man ran dry in the fight (his own kit, not an endless rifle)', `dry ${T.BD.stats.dry}, shared ${T.BD.stats.shared}`);
  check(T.BD.stats.shared > 0, 'and a squad mate tossed him magazines ("AMMO UP")', `${T.BD.stats.shared} hand-overs`);
  const fired = T.recs.reduce((s, r, k) => s + r.stats.shots - shots0[k], 0), learned = T.recs.filter((r, k) => T.R.xp(r, 'rifle') > xp0[k] + 0.5).length;
  check(fired > 100 && learned >= 5, 'every round he fires is his: shots on the record, experience grows', `${fired} rounds, ${learned} men learned`);
  const kits = T.recs.filter(r => r.status !== 'kia').map(r => summary(r.kitRoot).r556);
  check(kits.some(n => n < 280), 'the rounds came out of their kits', kits.slice(0, 6).join(', '));
  const kia = T.recs.filter(r => r.status === 'kia').length, wnd = T.recs.filter(r => r.status === 'down' || r.status === 'wounded').length;
  check(kia === T.mar.filter(u => !u.alive).length, 'the roster\'s KIA = the battle\'s dead (one person, one body)', `${kia} KIA, ${wnd} wounded`);
  check(tickMs / Math.max(1, ticks) < 2, `the 1 Hz books cost ${(tickMs / Math.max(1, ticks)).toFixed(2)} ms for ${T.mar.length} bound men; the fight ${cost.toFixed(1)} ms per simulated second`);
  // skill: a green man scatters (skK) and is slower to react (reactK)
  const g = T.R.add({ mos: '0311', green: true, years: 0, xp: { rifle: 0 } }), v = T.R.add({ mos: '0369', years: 8, xp: { rifle: 160 } });
  const ug = { role: 'aar', body: {} }, uv = { role: 'aar', body: {} }; T.BD.skill(ug, g); T.BD.skill(uv, v);
  check(ug.skK > 1.7 && uv.skK < 0.9 && ug.reactK > uv.reactK, 'skill: a green man spreads 1.8x and reacts slower; a veteran tighter and quicker', `spread x${ug.skK.toFixed(2)} vs x${uv.skK.toFixed(2)}, reaction x${ug.reactK.toFixed(2)} vs x${uv.reactK.toFixed(2)}`);
}
// ------------------------------------------------------------------------------------------------- 8. cost
{
  const R = createRoster({ seed: 3 }); establish(R, {}); for (let i = 0; i < 400; i++) R.add({ mos: i % 3 ? '0311' : 'SN' });
  const t0 = performance.now(); for (let i = 0; i < 1000; i++) R.step(1 / 60); const ms = (performance.now() - t0) / 1000;
  check(R.recs.length > 500 && ms < 0.05, `${R.recs.length} records: the roster's per-frame step costs ${(ms * 1000).toFixed(1)} us (plain data)`);
  const t1 = performance.now(); for (const r of R.recs) R.kit(r); const kms = performance.now() - t1;
  check(kms < 400, `every kit built (lazily, normally only near the camera): ${kms.toFixed(0)} ms for all ${R.recs.length}`);
}
console.log(`\npersonnelbench: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
