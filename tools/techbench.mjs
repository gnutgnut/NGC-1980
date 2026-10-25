// node tools/techbench.mjs - TECH TREE (game/js/techtree.js): the tree's shape (acyclic, reachable, sane costs), the
// start sets ('all' is exactly the game before the tree), the gates and mods, research timing in game seconds,
// cancel / refund, snapshot / restore, determinism, the default AI research policy, and that every gated key is a real
// unit or ability the game code asks the gate for.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const { TECH, createTech, unitAllowed, gateMsg, aiPickResearch, DOCTRINES, GATES, MODS, techStartFromQuery, techNode } = await import('../game/js/techtree.js');
const { FLEET_TYPES } = await import('../game/js/units/commander/fleet.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let fails = 0, n = 0;
const check = (name, ok, got = '', want = '') => { n++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(62)} ${got}${want !== '' ? '   (want ' + want + ')' : ''}`); if (!ok) fails++; };
const RICH = { mat: 1e9, fuel: 1e9 };
const sideOf = s => TECH.filter(t => t.side === s || t.side === 0);

// ------------------------------------------------------------------ the tree's shape
{
  const ids = TECH.map(t => t.id);
  check('ids are unique', new Set(ids).size === ids.length, `${ids.length} nodes`);
  for (const s of [1, 2]) { const k = sideOf(s).length; check(`side ${s}: 12-20 nodes`, k >= 12 && k <= 20, k); }
  const bad = TECH.filter(t => t.requires.some(r => !techNode(r) || (techNode(r).side !== t.side && techNode(r).side !== 0)));
  check('every requirement exists, on the same side', !bad.length, bad.map(t => t.id).join(' ') || 'ok');
  const tierBad = TECH.filter(t => t.requires.some(r => techNode(r).tier > t.tier));
  check('requirements are never on a higher tier', !tierBad.length, tierBad.map(t => t.id).join(' ') || 'ok');
  // acyclic: depth-first with colours
  const col = new Map(); let cycle = null;
  const visit = id => { if (col.get(id) === 2) return; if (col.get(id) === 1) { cycle = id; return; } col.set(id, 1); for (const r of techNode(id).requires) visit(r); col.set(id, 2); };
  ids.forEach(visit);
  check('the tree is acyclic', !cycle, cycle || 'ok');
  check('costs and times positive', TECH.every(t => t.cost.mat > 0 && (t.cost.fuel ?? 0) >= 0 && t.time > 0), 'ok');
  check('tiers 0-3, every tier used on both sides', [1, 2].every(s => [0, 1, 2, 3].every(k => sideOf(s).some(t => t.tier === k))) && TECH.every(t => t.tier >= 0 && t.tier <= 3), 'ok');
  check('every node has a name, a description and something it unlocks', TECH.every(t => t.name && t.desc && ((t.unlocks.units || []).length || (t.unlocks.abilities || []).length || Object.keys(t.unlocks.mods || {}).length)), 'ok');
  // reachable: from the default start, research whatever can start until nothing is left
  for (const s of [1, 2]) {
    const T = createTech(s); let guard = 0;
    while (guard++ < 100) { const a = T.available(); if (!a.length) break; T.research(a[0], { ...RICH }); T.update(1e6); }
    check(`side ${s}: every node reachable from the default start`, T.done.size === T.nodes.length, `${T.done.size}/${T.nodes.length}`);
  }
  const keys = new Set(TECH.flatMap(t => [...(t.unlocks.units || []), ...(t.unlocks.abilities || [])]));
  check('every unlocked key is listed in GATES, and back', [...keys].every(k => GATES[k]) && Object.keys(GATES).every(k => keys.has(k)), `${keys.size} keys`);
  const mk = new Set(TECH.flatMap(t => Object.keys(t.unlocks.mods || {})));
  check('every mod key is documented in MODS', [...mk].every(k => MODS[k]), [...mk].join(' '));
  check('doctrines only name nodes of their side', [1, 2].every(s => Object.values(DOCTRINES[s]).every(L => L.every(id => techNode(id) && techNode(id).side === s))), 'ok');
  check('no Math.random in techtree.js (sims replay by seed)', !/Math\.random/.test(src('game/js/techtree.js').replace(/\/\/.*$/gm, '')), 'ok');
}

// ------------------------------------------------------------------ start sets
{
  for (const s of [1, 2]) {
    const A = createTech(s, { start: 'all' }), gated = Object.keys(GATES).filter(k => GATES[k].side === s || GATES[k].side === 0);
    check(`side ${s} 'all': every gated key allowed (today's game)`, gated.every(k => unitAllowed(A, k)), gated.length + ' keys');
    check(`side ${s} 'all': every mod is exactly 1 (no upgrades)`, Object.keys(MODS).every(k => A.mod(k) === 1), 'ok');
    const M = createTech(s, { start: 'max' });
    check(`side ${s} 'max': every node done, upgrades apply`, M.done.size === M.nodes.length && Object.keys(MODS).some(k => M.mod(k) !== 1), M.done.size);
    const Z = createTech(s, { start: 'none' });
    check(`side ${s} 'none': nothing done, every gated key locked`, Z.done.size === 0 && gated.every(k => !unitAllowed(Z, k)), 'ok');
  }
  const P = createTech(1);
  const open1 = ['heli', 'marine', 'drone', 'aa', 'm151', 'm35', 'jet'], shut1 = ['m113', 'escort', 'logistics', 'm60', 'tomcat', 'sky'];
  check('player default: the opening is playable (Huey, Marines, CH-46, AA, motor pool, Hornet)', open1.every(k => unitAllowed(P, k)), open1.join(' '));
  check('player default: the rest is researched', shut1.every(k => !unitAllowed(P, k)), shut1.join(' '));
  const E = createTech(2);
  const open2 = ['transport', 'gunship', 'aa', 'freighter'], shut2 = ['reaper', 'hovertank', 'lance', 'shrike', 'shahed', 'mbt', 'battleship'];
  check('enemy default: MV-22s, WASPs, TALONs and freighters from the start', open2.every(k => unitAllowed(E, k)), open2.join(' '));
  check('enemy default: the rest is researched', shut2.every(k => !unitAllowed(E, k)), shut2.join(' '));
  check('an ungated key is always allowed; no tree allows everything', unitAllowed(P, 'no-such-thing') && unitAllowed(null, 'm60'), 'ok');
  check('a side never sees the other side\'s nodes', !P.node('e.mbt') && !E.node('p.mbt') && P.canResearch('e.mbt') === 'NO SUCH RESEARCH', 'ok');
  const L = createTech(1, { start: ['p.huey', 'p.cap', 'bogus'] });
  check('a list start: just those nodes, unknown ids dropped', L.mode === 'list' && L.done.size === 2 && unitAllowed(L, 'escort') && !unitAllowed(L, 'jet'), [...L.done].join(' '));
}

// ------------------------------------------------------------------ gates, research, timing, refunds
{
  const T = createTech(1), S = { mat: 100, fuel: 50 };
  check('gate message names the research', gateMsg(T, 'm60') === 'NEEDS HEAVY ARMOUR RESEARCH' && gateMsg(T, 'heli') === '', gateMsg(T, 'm60'));
  check('needs its requirements first', /^NEEDS AMPHIBIOUS ARMOUR/.test(T.canResearch('p.mbt', S)), T.canResearch('p.mbt', S));
  check('too dear says so', T.canResearch('p.sky', S) !== true && T.canResearch('p.cap', { mat: 10, fuel: 0 }) === 'NEEDS 50 MATERIEL', T.canResearch('p.cap', { mat: 10, fuel: 0 }));
  check('already done says so', T.canResearch('p.huey', S) === 'ALREADY RESEARCHED', T.canResearch('p.huey', S));
  check('research starts and pays up front', T.research('p.amtrac', S) === true && S.mat === 60 && T.current.id === 'p.amtrac', `mat ${S.mat}`, 60);
  check('one at a time', /^BUSY/.test(T.canResearch('p.cap', S)), T.canResearch('p.cap', S));
  check('still locked while under way', !unitAllowed(T, 'm113'), 'locked');
  // 40 game s at 60 Hz: finishes on the step that crosses 40 s
  let t = 0, doneAt = null, cb = 0; const off = T.onDone(nd => { cb++; check('onDone hands the node', nd.id === 'p.amtrac', nd.id); });
  for (let i = 0; i < 60 * 50 && !doneAt; i++) { t += 1 / 60; if (T.update(1 / 60)) doneAt = t; }
  check('research takes its time in game seconds (40 s)', doneAt && Math.abs(doneAt - 40) < 1 / 30, doneAt && doneAt.toFixed(3), 40);
  check('onDone fired once', cb === 1, cb, 1); off();
  check('done: the gate opens', unitAllowed(T, 'm113') && !T.current && T.progress === 0, 'm113 allowed');
  check('progress runs 0..1 and remaining counts down', (() => { T.research('p.cap', S); T.update(22.5); const p = T.progress, r = T.remaining; return Math.abs(p - 0.5) < 1e-9 && Math.abs(r - 22.5) < 1e-9; })(), `${T.progress.toFixed(2)} / ${T.remaining.toFixed(1)} s`);
  const before = S.mat; T.cancel(S);
  check('cancel refunds in full', S.mat === before + 50 && !T.current && !T.has('p.cap'), `mat ${S.mat}`);
  check('cancel with nothing under way says so', T.cancel(S) === 'NOTHING UNDER WAY', 'ok');
  T.research('p.cap', S); T.update(1e6);
  check('a big dt finishes it at once (headless sims)', T.has('p.cap') && unitAllowed(T, 'escort'), 'ok');
  // fuel costs
  const K = createTech(1, { start: ['p.huey', 'p.aaa', 'p.motorpool', 'p.logistics', 'p.seabees', 'p.yield'] }), F = { mat: 500, fuel: 10 };
  check('fuel cost checked and paid', K.canResearch('p.sky', F) === 'NEEDS 40 FUEL' && (F.fuel = 60, K.research('p.sky', F) === true) && F.fuel === 20 && F.mat === 380, `fuel ${F.fuel} mat ${F.mat}`);
  // mods multiply
  const M = createTech(1, { start: 'all' }); M.research('p.logistics', RICH); M.update(1e6); M.research('p.yield', { ...RICH }); M.update(1e6);
  check('a mod applies when done', M.mod('econ.mat') === 1.25 && M.mod('sight') === 1, M.mod('econ.mat'), 1.25);
  const Mx = createTech(2, { start: 'max' });
  check('mods stack as a product (aa.build: NANOREPAIR)', Math.abs(Mx.mod('aa.build') - 0.7) < 1e-12 && Mx.mod('bship.rate') === 1.5, Mx.mod('aa.build'));
}

// ------------------------------------------------------------------ snapshot / restore, determinism
{
  const A = createTech(2), S = { mat: 200, fuel: 0 };
  A.research('e.reaper', S); A.update(20);
  const snap = JSON.parse(JSON.stringify(A.snapshot()));
  const B = createTech(2, { start: 'none' }).restore(snap);
  check('snapshot is plain JSON and restores', B.current.id === 'e.reaper' && B.current.t === 20 && B.done.size === A.done.size && B.clock === 20, JSON.stringify(snap.current));
  A.update(30); B.update(30);
  check('a restored tree finishes on the same clock', A.has('e.reaper') && B.has('e.reaper') && A.clock === B.clock, `${A.clock} / ${B.clock}`);
  check('reset goes back to the start set', A.reset().done.size === 4 && !A.current, A.done.size, 4);
  // a war's research with the default policy, twice: identical
  const run = (doctrine) => {
    const T = createTech(2), E = { mat: 50, fuel: 200 }, picks = [];
    for (let t = 0; t < 3600; t += 2) {   // the enemy commander's 2 s tick; ~1 materiel / s income
      E.mat += 2 * (0.9 + 0.3 * Math.sin(t / 97)); E.mat -= Math.min(E.mat * 0.02, 1.2);   // spending on units
      T.update(2);
      const id = aiPickResearch(T, E, { time: t, foeAir: t > 600 ? 1 : 0 }, doctrine);
      if (id && T.research(id, E) === true) picks.push([t, id]);
    }
    return { picks, done: T.done.size, of: T.nodes.length, log: T.log };
  };
  const r1 = run('balanced'), r2 = run('balanced');
  check('determinism: the same inputs give the same research', JSON.stringify(r1.log) === JSON.stringify(r2.log), `${r1.picks.length} picks`);
  check('the default policy finishes the enemy tree in an hour', r1.done === r1.of, `${r1.done}/${r1.of}`);
  const firstOf = (r, key) => { const e = r.log.find(x => x.e === 'done' && (techNode(x.id).unlocks.units || []).includes(key)); return e ? e.t : null; };
  for (const [k, by] of [['reaper', 400], ['hovertank', 700], ['shrike', 1200], ['mbt', 1500], ['battleship', 2400]]) {
    const at = firstOf(r1, k); check(`enemy 'balanced' fields ${k} by ${by} s`, at !== null && at <= by, at === null ? 'never' : `${at} s`);
  }
  for (const d of ['air', 'ground', 'naval']) { const r = run(d); check(`doctrine '${d}' completes and differs from balanced`, r.done === r.of && JSON.stringify(r.picks.slice(0, 3)) !== JSON.stringify(r1.picks.slice(0, 3)), r.picks.slice(0, 3).map(p => p[1]).join(' ')); }
  const T = createTech(2);
  check('the policy keeps a reserve (waits when broke)', aiPickResearch(T, { mat: 40, fuel: 0 }) === null && aiPickResearch(T, { mat: 60, fuel: 0 }) === 'e.reaper', 'ok');
  check('the policy reacts: foe air -> fighters line first', aiPickResearch(T, { mat: 999, fuel: 0 }, { foeAir: 2 }) === 'e.reaper' && aiPickResearch(createTech(2, { start: [...createTech(2).done, 'e.reaper'] }), { mat: 999 }, { foeAir: 2 }) === 'e.shrike', 'reaper, then shrike');
  check('the policy waits while research is under way', (() => { const U = createTech(2); U.research('e.reaper', { ...RICH }); return aiPickResearch(U, RICH) === null; })(), 'ok');
  const P = createTech(1);
  check('the policy works for the player side too (sim CPU)', aiPickResearch(P, { mat: 999, fuel: 0 }) === 'p.cap', aiPickResearch(P, { mat: 999, fuel: 0 }));
}

// ------------------------------------------------------------------ the URL
{
  const Q = s => new URLSearchParams(s);
  check('?debug alone: all (every old scene runs as before)', techStartFromQuery(Q('?debug&kb'), 1) === 'all' && techStartFromQuery(Q('?debug'), 2) === 'all', 'all');
  check('no params: default', techStartFromQuery(Q(''), 1) === 'default', 'default');
  check('?tech=all / default / max / none', ['all', 'default', 'max', 'none'].every(v => techStartFromQuery(Q('?debug&tech=' + v), 1) === v), 'ok');
  check('?etech= sets the enemy only', techStartFromQuery(Q('?tech=all&etech=default'), 2) === 'default' && techStartFromQuery(Q('?tech=all&etech=default'), 1) === 'all', 'ok');
  const L = techStartFromQuery(Q('?tech=p.cap,p.mbt,xx'), 1);
  check('?tech=id,id: tier 0 plus those', Array.isArray(L) && L.includes('p.cap') && L.includes('p.huey') && !L.includes('xx'), L.length + ' ids');
}

// ------------------------------------------------------------------ every gate is real game code
{
  const all = ['game/js/war.js', 'game/js/main.js', 'game/js/units/air/airwar.js', 'game/js/units/groundwar/groundwar.js', 'game/js/units/defence/brain.js', 'game/js/units/commander/board.js'].map(src).join('\n');
  const fleetIds = new Set(FLEET_TYPES.map(t => t.id));
  for (const [k, g] of Object.entries(GATES)) {
    const inFile = g.where.every(f => src(f).includes(`'${k}'`));
    const asked = new RegExp(`(allow\\((1|2|side|u\\.side|s\\.side), '${k}'\\)|ok\\('${k}'\\))`).test(all) || (fleetIds.has(k) && /gate: id => war\.allow\(1, id\)/.test(all));
    check(`gate '${k}': the unit is in ${g.where.map(f => path.basename(f)).join(', ')} and the game asks the gate`, inFile && asked, inFile ? (asked ? 'ok' : 'NOT ASKED') : 'NOT IN CODE');
  }
  const modUse = { 'econ.mat': /techMod\(I\.owner, 'econ\.mat'\)/, 'econ.fuel': /techMod\(I\.owner, 'econ\.fuel'\)/, 'cap.time': /techMod\((1|u\.side), 'cap\.time'\)/, sight: /techMod\(1, 'sight'\)/,
    'aa.build': /techMod\((1|2), 'aa\.build'\)/, 'aa.hp': /techMod\(side, 'aa\.hp'\)/, rebuild: /techMod\(s\.side, 'rebuild'\)/, 'ship.repair': /techMod\(c\.side, 'ship\.repair'\)/,
    'bship.rate': /techMod\(2, 'bship\.rate'\)/, 'hp.drone': /techMod\(side, 'hp\.' \+ type\)/, 'hp.gunship': /techMod\(side, 'hp\.' \+ type\)/, 'hp.transport': /techMod\(side, 'hp\.' \+ type\)/, medic: /techMod\(1, 'medic'\)/ };
  const allMod = all + src('game/js/units/groundwar/casevac.js');
  check('every mod key is applied in the game code', Object.keys(MODS).every(k => modUse[k] && modUse[k].test(allMod)), Object.keys(MODS).filter(k => !(modUse[k] && modUse[k].test(allMod))).join(' ') || `${Object.keys(MODS).length} mods`);
  check('fleet ids gated by the board exist in FLEET_TYPES', Object.keys(GATES).filter(k => GATES[k].where[0].endsWith('fleet.js')).every(k => fleetIds.has(k)), 'ok');
}

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
