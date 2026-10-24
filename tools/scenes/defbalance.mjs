// Balance check for the air defence units against the old war.js gun (the 'legacy' baseline), in dev/defence.html:
//   enemy units: hurtPlayer per minute on a circling player stand-in (three orbits: close/slow, mid, far/fast)
//   our units:   kills per minute of hp-3 gunship stand-ins
// No line-of-sight terrain (hill=0): this is the open-sky worst case for the player; hills only help.
//   node snap.mjs scenes/defbalance.mjs
const ORBITS = [{ R: 70, alt: 20, spd: 25 }, { R: 110, alt: 35, spd: 35 }, { R: 140, alt: 50, spd: 45 }];
const RUNS = +(process.env.BAL_RUNS || 3), SECS = +(process.env.BAL_SECS || 120);
export default async function (h) {
  await h.goto('dev/defence.html?mode=fight&unit=talon&drones=0&hill=0&panel=0');
  await h.waitFor('window.__D', 15000);
  await h.eval(`(__D.pause(), 1)`);
  const table = {};
  for (const type of ['legacy2', 'talon', 'lance']) for (let o = 0; o < ORBITS.length; o++) {
    const r = await h.eval(`(() => { let s = 0; for (let i = 0; i < ${RUNS}; i++) s += __D.balance('${type}', ${SECS}, Object.assign({ t0: 300 }, ${JSON.stringify(ORBITS[o])})).hurtPerMin; return +(s / ${RUNS}).toFixed(3); })()`);
    (table[type] ||= []).push(r);
  }
  for (const type of ['legacy1', 'legacy1ship', 'vads', 'vadst', 'shilka', 'zu23', 'ciws', 'sparrow']) {
    const r = await h.eval(`(() => { let s = 0; for (let i = 0; i < ${RUNS}; i++) s += __D.balance('${type}', ${SECS}, { t0: 300, hp: 12 }).killsPerMin; return +(s / ${RUNS}).toFixed(2); })()`);
    table[type] = r;
  }
  await h.eval(`(window.__bal = ${JSON.stringify(table)}, __bal)`);
  // the new enemy units may not be harsher than the old gun in the open by more than 25 % close in and at mid range;
  // far out the old gun was nearly harmless (its flak scatter grows with range) - the TALON's missile and the LANCE
  // make range dangerous on purpose (that is what the hills are for), but by no more than 2x
  await h.expect(`['talon', 'lance'].every(t => __bal[t].every((v, i) => v <= __bal.legacy2[i] * (i < 2 ? 1.25 : 2) + 0.05))`);
  // our guns: an island gun at least 80 % of the old one; the ALBATROSS's four mounts together at most 2x its old four
  await h.expect(`['vads', 'vadst', 'shilka', 'zu23'].every(t => __bal[t] >= __bal.legacy1 * 0.8)`);
  await h.expect(`2 * (__bal.ciws + __bal.sparrow) <= 4 * __bal.legacy1ship * 2`);
  // and must still be a threat (at least a third of the old gun, averaged over the orbits)
  await h.expect(`['talon', 'lance'].every(t => __bal[t].reduce((a, b) => a + b) >= __bal.legacy2.reduce((a, b) => a + b) / 3)`);
}
