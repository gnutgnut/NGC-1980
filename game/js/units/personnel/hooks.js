// PERSONNEL: the hook table the war's modules call (all optional: null until personnel.js is created, so groundwar.js
// and the benches run without it). Keep them small and named for what happened.
//   PH.marineAdded(unit, { I, k, n, L, transport, recs })  a Marine off a ramp (or a test squad): who is he?
//   PH.gsEvent(e)                                          every ground-war event as it happens (hits, casualties, shots)
//   PH.delivered(unitIds, where) / PH.lostAboard(unitIds)  casevac: into the sick bay / lost with the Sea Knight
export const PH = { marineAdded: null, gsEvent: null, delivered: null, lostAboard: null };
