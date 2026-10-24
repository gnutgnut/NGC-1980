// COMMANDER: the fleet ledger. The player is the task force's commander, not one helicopter crew: what used to be
// "lives" (spare helicopters) plus the hangar counts of the jets is now one ledger of everything the ALBATROSS group
// can still put into the war. Pure: no THREE, no DOM; tools/commanderbench.mjs checks it in node.
//
// Counting (one rule for every type):
//   n[id]      units IN RESERVE: in the hangar, the motor pool, the barracks. Taking one out (a spawn) costs one.
//   out        the unit of that type that is in the world now (parked, driven, flown by the AI or by you) - the host
//              answers that (main.js), the ledger doesn't track positions.
//   lost[id]   units written off this war (shot down, wrecked, killed): the "fleet's losses" line.
//   A unit that comes home and stands down goes back into reserve (give). Materiel buys more (buy).
// The war is lost when the fleet is spent: nothing in reserve and nothing alive out there.
export const FLEET_TYPES = [
  // id: craft / roster id; label: the board name; short: the HUD strip; cost: materiel for one more (game-level);
  // start: reserve at the start of a war (besides what starts out: the Huey on deck, the M60 / M113 / jeep parked);
  // at: where it can be taken out - 'ship' (the ALBATROSS) and / or 'island' (a friendly island's pad / motor pool)
  { id: 'heli', label: 'UH-1H HUEY', short: 'HUEY', cost: 60, start: 3, at: ['ship', 'island'], kind: 'air', note: 'UTILITY HELICOPTER' },
  { id: 'jet', label: 'F/A-18A HORNET', short: 'HORNET', cost: 80, start: 2, at: ['ship'], kind: 'air', note: 'STRIKE FIGHTER  -  CAT 1' },
  { id: 'tomcat', label: 'F-14A TOMCAT', short: 'TOMCAT', cost: 100, start: 2, at: ['ship'], kind: 'air', note: 'FLEET FIGHTER  -  CAT 1' },
  { id: 'm60', label: 'M60A3 TTS', short: 'M60', cost: 60, start: 1, at: ['ship', 'island'], kind: 'ground', note: 'MAIN BATTLE TANK' },
  { id: 'm113', label: 'M113A2', short: 'M113', cost: 30, start: 1, at: ['ship', 'island'], kind: 'ground', note: 'ARMOURED PERSONNEL CARRIER' },
  { id: 'm151', label: 'M151A2 MUTT', short: 'JEEP', cost: 10, start: 2, at: ['ship', 'island'], kind: 'ground', note: 'JEEP  -  M60 ON A PEDESTAL' },
  { id: 'm35', label: 'M35A2', short: 'TRUCK', cost: 20, start: 1, at: ['ship', 'island'], kind: 'ground', note: 'TWO AND A HALF TON TRUCK' },
  { id: 'marine', label: 'MARINE RIFLEMAN', short: 'MARINES', cost: 5, start: 6, at: ['ship', 'island'], kind: 'foot', note: 'ON FOOT  -  M16A1, ALICE GEAR' },
];

export function createFleet(types = FLEET_TYPES) {
  const F = { types, byId: {}, n: {}, lost: {}, bought: {}, log: [] };
  for (const t of types) F.byId[t.id] = t;
  const note = (e, id, extra) => { F.log.push({ e, id, ...extra }); if (F.log.length > 80) F.log.shift(); };
  F.reset = () => { for (const t of types) { F.n[t.id] = t.start; F.lost[t.id] = 0; F.bought[t.id] = 0; } F.log.length = 0; return F; };
  F.type = id => F.byId[id] || null;
  F.has = id => (F.n[id] || 0) > 0;
  // take one out of reserve (a spawn): false when there is none
  F.take = id => { if (!F.has(id)) return false; F.n[id]--; note('take', id); return true; };
  // a unit back into reserve (stood down at a base, a Marine back to the barracks)
  F.give = (id, k = 1) => { if (!F.byId[id]) return; F.n[id] += k; note('give', id); };
  // a unit out in the world is gone: count it
  F.lose = (id, why = '') => { if (!F.byId[id]) return; F.lost[id]++; note('lose', id, { why }); };
  // buy one with materiel from the store S ({ mat }): '' = done, else the reason
  F.buy = (id, S) => {
    const t = F.byId[id]; if (!t) return 'NO SUCH UNIT';
    if (S.mat < t.cost) return `${t.short} COSTS ${t.cost} MATERIEL  -  YOU HAVE ${Math.floor(S.mat)}`;
    S.mat -= t.cost; F.n[id]++; F.bought[id]++; note('buy', id); return '';
  };
  F.total = () => types.reduce((s, t) => s + Math.max(0, F.n[t.id]), 0);
  F.losses = () => types.reduce((s, t) => s + F.lost[t.id], 0);
  // spent: nothing in reserve and nothing alive out (outAlive(id) -> bool, from the host)
  F.spent = (outAlive = () => false) => types.every(t => F.n[t.id] <= 0 && !outAlive(t.id));
  // the HUD strip: reserve, + how many are out ("HUEY 3+1"; outAlive may return a count)
  F.strip = (outAlive = () => false) => types.map(t => ({ id: t.id, short: t.short, n: Math.max(0, F.n[t.id]), out: Number(outAlive(t.id)) || 0, lost: F.lost[t.id] }));
  return F.reset();
}
