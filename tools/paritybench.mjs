#!/usr/bin/env node
// paritybench.mjs - PARITY (ngc/parity): each side's counterparts working in the whole war, in node (tools/sim/headless.mjs
// runs war.js and every module it drives; both commanders are the CPU). docs/ngc1980/PARITY.md has the matrix.
//   MSC convoys: our outposts stock their output, an MSC ship sails it to the ALBATROSS (or the anchorage) and delivers
//   USS IOWA: launched at 100% reactivation, hunts the KRAKEN; the IOWA / LEVIATHAN gun duel is even over seeds
//   KRAKEN sky refit: a rich RUNAWAY with the research refits and flies; our guns take her as an air target
//   the enemy hunts our convoys (WASP pairs); tech gates for the new orders
//   node tools/paritybench.mjs [--v]
import { runWar, loadGrid } from './sim/headless.mjs';
const V = process.argv.includes('--v');
let pass = 0, fail = 0;
const check = (name, ok, got, want = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(64)} ${got}${want ? '   (want ' + want + ')' : ''}`); };
const grid = await loadGrid();
const war = (cfg) => { const feed = []; return runWar({ grid, dt: 1 / 20, patch: ['catlane'], blue: 'BALANCED', red: 'DEFAULT', ...cfg, feed: t => { feed.push(t); if (V) console.log('   feed', t); } }).then(r => ({ r, feed })); };

console.log('--- MSC convoys (the container ships\' counterpart) ---');
{
  let maxStock = 0, delivered = 0, before = 0;
  const { feed } = await war({ seed: 4, tmax: 900, tech: 'all', onStep: W => { for (const I of W.islands) if (I.owner === 1) maxStock = Math.max(maxStock, I.stock || 0); } });
  const sails = feed.filter(t => /MSC SHIP SAILS/.test(t)).length, del = feed.filter(t => /MSC SHIP ALONGSIDE/.test(t));
  for (const t of del) delivered += +(/(\d+) MATERIEL/.exec(t) || [0, 0])[1];
  void before;
  check('our outposts stockpile their output', maxStock >= 18, `max stock ${maxStock.toFixed(0)}`, '>= 18 (the sailing threshold)');
  check('MSC ships sail and deliver', sails >= 2 && del.length >= 1, `${sails} sailed, ${del.length} delivered, ${delivered} materiel`);
}
console.log('--- USS IOWA (the LEVIATHAN\'s counterpart) ---');
{
  let launchedT = null, closest = 1e9, shells = 0, d0 = null;
  await war({ seed: 5, tmax: 420, tech: 'all', hook: ({ W }) => { W.P.bship = 99.9; },
    onStep: W => { const b = W.iowa; if (b && launchedT === null) launchedT = W.time; if (b && W.enemyCarrier) { const d = Math.hypot(b.p.x - W.enemyCarrier.p.x, b.p.z - W.enemyCarrier.p.z); if (d0 === null) d0 = d; closest = Math.min(closest, d); }
      for (const p of W.proj) if (p.kind === 'shell' && p.side === 1 && !p._n) { p._n = 1; shells++; } } });
  check('the IOWA sails at 100% reactivation', launchedT !== null && launchedT < 10, launchedT === null ? 'never' : `at ${launchedT.toFixed(1)} s`);
  check('she closes the KRAKEN (her hunt) and fires', d0 !== null && closest < d0 - 200 && shells > 0, `from ${Math.round(d0)} m to ${Math.round(closest)} m, ${shells} 16-inch shells`);
}
{   // the gun duel: the two capital ships alone in open water, 260 m apart, both sides' guns firing
  let iw = 0, lw = 0; const res = [];
  for (const seed of [11, 12, 13, 14, 15, 16]) {
    let out = null;
    await war({ seed, tmax: 260, tech: 'all', blue: { ...(await import('../game/js/sim/doctrine.js')).doctrine(1, 'TURTLE'), mix: { air: 0, ground: 0, naval: 0 }, sky: 0, escorts: 0 }, pilot: 'none',
      hook: ({ W }) => {
        const x = 0, z = 60;   // the open water mid-map
        W.iowa = W.makeShip('battleship', 1, x - 130, z, Math.PI / 2); W.battleship = W.makeShip('battleship', 2, x + 130, z, -Math.PI / 2);
        for (const s of [W.iowa, W.battleship]) { s.max = 0; s.plan = 1e9; }
        W.P.bship = 0; W.E.bship = 0;
      },
      onStep: W => { if (out) return; const a = W.iowa, b = W.battleship; if (!a || a.sinking !== undefined) out = 'L'; else if (!b || b.sinking !== undefined) out = 'I'; else if (W.time > 250) out = a.hp / a.hpMax > b.hp / b.hpMax ? 'i' : 'l'; if (out) res.push(`${out}${Math.round(100 * (a ? a.hp / a.hpMax : 0))}/${Math.round(100 * (b ? b.hp / b.hpMax : 0))}`); } });
    if (out === 'I' || out === 'i') iw++; else lw++;
  }
  check('IOWA vs LEVIATHAN duel: even over 6 seeds', iw >= 2 && lw >= 2, `IOWA ${iw} : LEVIATHAN ${lw}  (${res.join(' ')}; capital = sunk, lower = ahead on hp at 250 s)`, 'each side wins 2+');
}
console.log('--- the KRAKEN\'s sky refit (the SKY CARRIER\'s counterpart) ---');
{
  let refitT = null, upT = null, maxY = 0, targeted = false;
  await war({ seed: 6, tmax: 220, tech: 'all', red: 'DREADNOUGHT', hook: ({ W }) => { W.E.mat = 2000; },
    onStep: W => { const c = W.enemyCarrier; if (!c) return; if (c.sky && refitT === null) refitT = W.time; if (c.sky && c.sky.up && upT === null) upT = W.time; maxY = Math.max(maxY, c.p.y); } });
  check('a rich RUNAWAY refits the KRAKEN', refitT !== null && refitT < 10, refitT === null ? 'never' : `at ${refitT.toFixed(1)} s`);
  check('she flies', upT !== null && maxY > 15, `up at ${upT === null ? 'never' : upT.toFixed(0) + ' s'}, max height ${maxY.toFixed(0)} m`);
  void targeted;
}
{   // under the default tree the KRAKEN's refit waits for its research
  let refit = false;
  await war({ seed: 6, tmax: 30, tech: 'default', hook: ({ W }) => { W.E.mat = 2000; }, onStep: W => { if (W.enemyCarrier && W.enemyCarrier.sky) refit = true; } });
  check('tech=default: no KRAKEN refit before KRAKEN LIFT FANS', !refit, refit ? 'refitted' : 'gated');
}
console.log('--- the RUNAWAY hunt our convoys ---');
{
  let hunts = 0;
  const { feed } = await war({ seed: 7, tmax: 600, tech: 'all', onStep: W => { for (const u of W.units) if (u.type === 'gunship' && u.raid && u.raid.type === 'freighter' && u.raid.side === 1 && !u._h) { u._h = 1; hunts++; } } });
  check('WASPs are sent at MSC ships', hunts >= 2 && feed.some(t => /WASPS HEADING FOR AN MSC SHIP/.test(t)), `${hunts} WASPs raided a convoy`);
}
console.log('--- E-2C Hawkeye, BGM-109 salvo, MIM-23 HAWK (the REAPER\'s, SHAHED\'s, LANCE\'s counterparts) ---');
{
  let sent = '', spotT = null, salvo = '', glcm = 0, hit = 0, krakenHp0 = null, hawk = '', hawkType = null, sight = 0;
  await war({ seed: 9, tmax: 400, tech: 'all', pilot: 'none', hook: ({ W }) => {
      W.P.mat = 999; sent = W.sendHawkeye();
      const H = W.islands.find(I => I.name === 'HOME ISLAND'); hawk = W.orderAA(H); const s = H.structs.filter(s => s.kind === 'aa').pop(); hawkType = s && s.def && s.def.type;
    },
    onStep: W => {
      const ec = W.enemyCarrier; if (krakenHp0 === null && ec) krakenHp0 = ec.hp;
      const hk = W.units.find(u => u.type === 'hawkeye'); if (hk) sight = Math.max(sight, hk.sight || 0);
      if (W.spotP && spotT === null) { spotT = W.time; W.P.mat = Math.max(W.P.mat, 100); salvo = W.salvoTomahawk(null); }
      for (const u of W.units) if (u.type === 'glcm' && !u._n) { u._n = 1; glcm++; }
      if (ec && krakenHp0 !== null && ec.hp < krakenHp0 - 1) hit = krakenHp0 - ec.hp;
    } });
  check('the Hawkeye launches and has the long sight', /LAUNCHED/.test(sent) && sight >= 500, `${sent}; sight ${sight} m`);
  check('she spots the KRAKEN', spotT !== null, spotT === null ? 'never' : `at ${spotT.toFixed(0)} s`);
  check('a salvo flies at the spotted KRAKEN', /AWAY/.test(salvo) && glcm >= 4, `${salvo}; ${glcm} BGM-109s flew; KRAKEN -${hit.toFixed(0)} hp`);
  check('a new AA order on HOME ISLAND is a HAWK battery', /GOING UP/.test(hawk) && hawkType === 'hawk', `${hawk} -> ${hawkType}`);
}
console.log('--- the new orders\' gates (tech=default) ---');
{
  let r = null;
  await war({ seed: 8, tmax: 2, tech: 'default', hook: ({ W }) => { W.P.mat = 999; r = { hawkeye: W.sendHawkeye(), tomahawk: W.salvoTomahawk(null), armour: W.sendArmour(W.islands[3]), iowa: W.orderIowa(null), sky: W.upgradeCarrier({ side: 2 }) }; } });
  check('E-2C, BGM-109, M60A3 platoon, IOWA, KRAKEN refit need their research', Object.values(r).every(s => /NEEDS/.test(s)), JSON.stringify(r));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
