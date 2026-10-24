// PERSONNEL: TASK FORCE ALBATROSS's people at the start of a war (GAME numbers, sized to the fleet's reserves in
// units/commander/fleet.js: crews for every aircraft and vehicle in reserve, a rifle company's worth of Marines for the
// Sea Knights, the deck crew, a few of the ship's company, the Soviet contingent's Shilka crews). PURE.
//
//   establish(P, o) -> { squads }    o: { aaSites: [{ key, island, soviet }], deckCrew: [{ jersey }], islandName }
//   topUp(P) -> n                     a new war in the same session: the fallen stay on the KIA list, the battalion
//                                     sends replacements (green) to bring every trade back up to strength
export const STRENGTH = {
  '7563': 8, '6172': 4, '7562': 4, '7557': 2, '1310-F18': 4, '1310-F14': 3, '1320-F14': 3,   // air wing: Hueys (2 pilots + crew chief each), Sea Knights, Hercules, Hornets, Tomcats (pilot + RIO)
  '1812': 8, '1833': 4, '3531': 6, '7204': 6,                                                  // armour crews (2 M60s x 4, 2 M113s x 2), drivers, the LAAD section
  '0369': 5, '0311': 54, '0331': 4, '0351': 5, '8404': 6,                                      // a rifle company (three squads, a fourth's worth in reserve), MGs, assaultmen, corpsmen
  'BM': 3, 'SN': 8,                                                                            // the ship's company the commander sees (hangar, the island, the boats)
};
// a squad in the 1980 USMC style: a squad leader, three fire teams (team leader, automatic rifleman, rifleman /
// assistant, grenadier) and its corpsman (FMFM 6-5, INFERRED: 13 + the HM)
export const SQUAD = ['0369', '0311', '0311', '0311', '0351', '0311', '0311', '0311', '0311', '0311', '0311', '0311', '8404'];
export function establish(P, o = {}) {
  const squads = [];
  // three rifle squads, each its own record set, formed and named
  for (let s = 0; s < 3; s++) {
    const recs = SQUAD.map((mos, k) => P.add({ mos, loc: 'ALBATROSS', rankUp: k === 0 ? 1 : k % 4 === 1 ? 1 : 0 }));
    for (const r of recs) if (r.mos === '0311' && r !== recs[1] && (recs.indexOf(r) - 1) % 4 === 0) P.note(r, 'FIRE TEAM LEADER');
    squads.push(P.formSquad(null, recs, 'ALBATROSS'));
  }
  const have = {}; for (const r of P.recs) have[r.mos] = (have[r.mos] || 0) + 1;
  for (const [mos, n] of Object.entries(STRENGTH)) for (let k = have[mos] || 0; k < n; k++) P.add({ mos, loc: 'ALBATROSS', job: mos === '0311' ? 'reserve' : undefined });
  // the deck crew, one record per figure on the flight deck (the jersey says the rating)
  const JM = { yellow: 'ABH-Y', blue: 'ABH-B', purple: 'ABF', red: 'AO', green: 'ABE', brown: 'PC', white: 'HM-W' };
  for (const m of o.deckCrew || []) { const r = P.add({ mos: JM[m.jersey] || 'ABH-B', loc: 'ALBATROSS', jersey: m.jersey }); m.pid = r.id; r.body = { kind: 'deck', m }; }
  // the AA guns on our islands: two men each (the Soviet contingent's Shilkas: its own crews)
  for (const s of o.aaSites || []) {
    for (let k = 0; k < 2; k++) { const r = P.add({ mos: s.soviet ? 'SOV-AA' : '7204', loc: s.island }); r.job = 'aa'; r.unit = s.key; r.seat = k; }
  }
  return { squads };
}
export function topUp(P) {
  const have = {}; for (const r of P.recs) if (r.status !== 'kia' && !r.civ) have[r.mos] = (have[r.mos] || 0) + 1;
  let n = 0;
  for (const [mos, want] of Object.entries(STRENGTH)) for (let k = have[mos] || 0; k < want; k++) { const r = P.add({ mos, loc: 'ALBATROSS', green: true, job: mos === '0311' ? 'reserve' : undefined }); P.note(r, 'JOINED AS A REPLACEMENT'); n++; }
  return n;
}
