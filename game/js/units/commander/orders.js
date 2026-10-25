// PARITY: the TASK FORCE's support orders - the counterparts of RUNAWAY units that the commander tasks rather than
// flies (units/parity/paritywar.js). SHIFT+1..5 on the map (main.js) and on the command board (board.js) run them at
// the island selected on the map (M, click an island). Pure: no THREE, no DOM.
//   const O = createOrders({ war, target: () => island | null, cost: COST })
//   O.run(n) -> the line to show;  O.rows() -> [{ n, label, cost, locked, why }] for the board;  O.legend() -> map line
export const ORDERS = [
  { n: 1, key: 'cobra', label: 'AH-1T COBRA SORTIE', cost: C => C.cobra, run: (w, I) => w.sendCobra(I), note: 'STRIKE THE ISLAND, OR OVERWATCH ONE OF OURS' },
  { n: 2, key: 'armour', label: 'M60A3 BY LCM-8', cost: C => C.armour, run: (w, I) => w.sendArmour(I), note: 'AN AI TANK ASHORE ON THE ISLAND' },
  { n: 3, key: 'hawkeye', label: 'E-2C HAWKEYE', cost: C => C.hawkeye, run: w => w.sendHawkeye(), note: 'FINDS THE KRAKEN, WIDE SIGHT' },
  { n: 4, key: 'tomahawk', label: 'BGM-109 SALVO', cost: C => C.tomahawk * 4, run: (w, I) => w.salvoTomahawk(I), note: 'AT THE SPOTTED KRAKEN, OR THE ISLAND\'S BUILDINGS' },
  { n: 5, key: 'battleship', label: 'TASK THE IOWA', cost: () => 0, run: (w, I) => w.orderIowa(I), note: 'BOMBARD THE ISLAND / ESCORT / HUNT' },
];

export function createOrders({ war, target, cost }) {
  const O = {};
  const tgt = () => target() || null;
  O.run = n => {
    const o = ORDERS.find(o => o.n === n); if (!o) return '';
    if (!war.allow(1, o.key)) return war.gateMsg(1, o.key);
    const fn = { cobra: war.sendCobra, armour: war.sendArmour, hawkeye: war.sendHawkeye, tomahawk: war.salvoTomahawk, battleship: war.orderIowa }[o.key];
    return fn ? o.run(war, tgt()) : 'NOT IN THIS BUILD';
  };
  O.rows = () => ORDERS.map(o => {
    const locked = !war.allow(1, o.key), c = o.cost(cost);
    let status = o.note;
    if (o.key === 'battleship') status = war.iowa && war.iowa.sinking === undefined ? `IOWA ${Math.round(100 * war.iowa.hp / war.iowa.hpMax)}%  ·  ${war.parity.iowaTask()}` : `REACTIVATION ${Math.floor(war.P.bship || 0)}%`;
    return { n: o.n, key: o.key, label: o.label, cost: c, locked, why: locked ? war.gateMsg(1, o.key) : '', status };
  });
  O.legend = () => ORDERS.map(o => `SHIFT+${o.n}: ${war.allow(1, o.key) ? `${o.label}${o.cost(cost) ? ` (${o.cost(cost)})` : ''}` : `${o.label} [RESEARCH]`}`).join('  ·  ');
  return O;
}
