// PARITY (ngc/parity): each side's counterparts of the other side's units, in the war (docs/ngc1980/PARITY.md).
// war.js creates this once (createParityWar) and calls P.update every frame, P.think(2, pl, knobs) at the end of the
// enemy commander's 2 s plans (war.js think and the sim's RUNAWAY doctrine copy, sim/redai.js, call the same code, so
// the doctrine copy still replays war.js), and the orders below from the command board / map (main.js through
// units/commander/orders.js) and the sim's TASK FORCE commander (sim/commanderai.js).
//
//   TASK FORCE                                   mirrors the RUNAWAY's
//   MSC freighters ship our outposts' output     the autonomous container ships (war.js think step 6)
//     to the ALBATROSS (dispatched here)
//   USS IOWA, built from factory output, hunts   the LEVIATHAN, built at IRONHOLD, hunts the ALBATROSS
//     the KRAKEN unless ordered to bombard / escort
//   AH-1T SeaCobra sorties (W.sendCobra)         RW-3 WASP guards / hunters / raids
//   E-2C Hawkeye (W.sendHawkeye) spots the KRAKEN the MQ-9 REAPER spots the ALBATROSS
//   BGM-109 salvos (W.salvoTomahawk)             SHAHED salvos
//   M60A3 by LCM-8 (W.sendArmour)                seized MBTs by LCAC
//   MIM-23 HAWK on our HQ islands (defence/)     the RW-5 LANCE on theirs
//   RUNAWAY                                      mirrors the TASK FORCE's
//   the KRAKEN's lift-fan refit (P.think)        the ALBATROSS's SKY CARRIER refit
//   WASP raids on the MSC convoys (P.think)      Hornet strikes on the container ships (sim/commanderai.js)
//
// Game level only (BIBLE §3): costs, hp and damage are game numbers; the sims and models live in their unit files.
export const SHIP_NAME = (type, side) => ({ carrier: ['', 'ALBATROSS', 'KRAKEN'], battleship: ['', 'IOWA', 'LEVIATHAN'], freighter: ['', 'MSC SHIP', 'CONTAINER SHIP'] }[type] || ['', '', ''])[side] || type.toUpperCase();
// tunables (a sweep can turn them: tools/warsim.mjs --sweep PAR_T.x=...)
export const PAR_T = {
  FREIGHT_EVERY: 16, FREIGHT_MIN: 18,      // s between convoy checks; stock an outpost needs before a ship sails (= the enemy's)
  COBRA_MAX: 4, COBRA_REFUND: 0.5,         // AH-1Ts out at once; share of the cost back when one is recovered aboard
  HAWKEYE_MAX: 1, SALVO: 4,                // one E-2C at a time (one REAPER); missiles per BGM-109 salvo
  ARMOUR_MAX: 3,                           // M60A3s ashore at once (the enemy: 3 MBTs)
  HUNT_EVERY: 70, HUNT_N: 2,               // s between the enemy's convoy hunts; WASPs per hunt
  SKY_RESERVE: 60,                         // materiel the enemy keeps after paying for the KRAKEN's refit
  IOWA_RATE: 0.08, IOWA_HOME: 0.06,        // reactivation % / s per factory island of ours, + while HOME ISLAND's HQ stands (= the LEVIATHAN's)
};
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createParityWar(W, ctx, H) {
  // H: { makeShip, makeAir, feed, store, launchPoint, nav, sfx, COST }
  const { makeShip, makeAir, feed, store, launchPoint, nav, COST } = H;
  const P = { freightT: 30, huntT: 120, planT: 0, iowaOrder: null, spot: null, log: [] };
  const alive = u => u && !u.dead && !u.dying && !u.gone && u.sinking === undefined;
  const carrierOf = side => { const c = side === 1 ? W.carrier : W.enemyCarrier; return c && c.sinking === undefined ? c : null; };
  const isle = name => W.islands.find(I => I.name === name);
  const allow = (side, k) => !W.allow || W.allow(side, k);
  const count = (side, type) => W.units.filter(u => u.side === side && u.type === type && alive(u)).length;

  // ---------------------------------------------------------------- MSC convoys (ours: the logistics staff sails them)
  // An outpost with stock (war.js updateEconomy) gets a ship when nobody is serving it yet: as the enemy commander does.
  function convoys(dt) {
    if ((P.freightT -= dt) > 0) return; P.freightT = PAR_T.FREIGHT_EVERY;
    if (!allow(1, 'convoy')) return;
    const I = W.islands.filter(I => I.owner === 1 && (I.stock || 0) >= PAR_T.FREIGHT_MIN && !W.units.some(u => u.type === 'freighter' && u.from === I && !u.gone)).sort((a, b) => b.stock - a.stock)[0];
    if (!I) return;
    const [x, z] = nav.nearestWater(I.x, I.z), f = makeShip('freighter', 1, x, z, rnd(6.283));
    f.cargo = I.stock; f.fuelCargo = I.stockFuel || 0; f.from = I; I.stock = 0; I.stockFuel = 0; f.repath = 0;
    feed(`MSC SHIP SAILS FROM ${I.name}  -  ${Math.round(f.cargo)} MATERIEL FOR THE ALBATROSS`);
  }
  // where a side's freighters unload: the nearer of the carrier (while she floats on the sea) and the HQ island's
  // anchorage - a 5 m/s freighter never catches a carrier steaming away at 6, so the anchorage takes it then
  const _anch = [null, null, null];
  P.freightDest = (side, u) => {
    const I = isle(side === 1 ? 'HOME ISLAND' : 'IRONHOLD'), k = side === 1 ? 1 : -1;
    const a = _anch[side] || (_anch[side] = nav.nearestWater(I.x + 150 * k, I.z - 150 * k));
    const c = carrierOf(side); if (!c || (c.sky && c.sky.up)) return a;
    if (!u) return [c.p.x, c.p.z];
    return Math.hypot(c.p.x - u.p.x, c.p.z - u.p.z) < Math.hypot(a[0] - u.p.x, a[1] - u.p.z) ? [c.p.x, c.p.z] : a;
  };

  // ---------------------------------------------------------------- USS IOWA (the LEVIATHAN's counterpart)
  function iowa(dt) {
    const S = W.P;
    if (!W.iowa && (S.bship || 0) >= 100 && allow(1, 'battleship')) {
      S.bship = 0; const I = isle('HOME ISLAND');
      const [wx, wz] = nav.nearestWater(I.x + (0 - I.x) * 0.2, I.z + (0 - I.z) * 0.2);
      W.iowa = makeShip('battleship', 1, wx, wz, Math.atan2(-(0 - wx), -(0 - wz)));
      feed('USS IOWA HAS JOINED THE TASK FORCE  -  SHE IS HUNTING THE KRAKEN (MAP: SHIFT+5 TO TASK HER)', 'good'); H.sfx.dock?.();
    }
    const b = W.iowa; if (!b || b.sinking !== undefined) return;
    if ((b.plan = (b.plan || 0) - dt) > 0 && b.path.length) return;
    b.plan = 15;
    let gx, gz, o = P.iowaOrder;
    if (o && o.kind === 'bombard' && o.I.owner === 1) o = P.iowaOrder = null;   // taken: back to the hunt
    const lev = W.battleship && W.battleship.sinking === undefined ? W.battleship : null, ec = carrierOf(2);
    if (b.hp < b.hpMax * 0.3) { const I = isle('HOME ISLAND'); gx = I.x + 160; gz = I.z - 220; }   // badly hurt: home
    else if (o && o.kind === 'bombard') { const I = o.I, a = Math.atan2(b.p.z - I.z, b.p.x - I.x); gx = I.x + Math.cos(a) * (I.r + 120); gz = I.z + Math.sin(a) * (I.r + 120); }
    else if (o && o.kind === 'escort' && W.carrier) { const c = W.carrier.p; gx = c.x + 150; gz = c.z + 90; }
    else if (lev && Math.hypot(lev.p.x - b.p.x, lev.p.z - b.p.z) < 1500) { const a = Math.atan2(b.p.z - lev.p.z, b.p.x - lev.p.x); gx = lev.p.x + Math.cos(a) * 220; gz = lev.p.z + Math.sin(a) * 220; }   // the gun duel
    else if (ec) { const a = Math.atan2(b.p.z - ec.p.z, b.p.x - ec.p.x); gx = ec.p.x + Math.cos(a) * 170; gz = ec.p.z + Math.sin(a) * 170; }   // as the LEVIATHAN hunts the ALBATROSS
    else return;
    const [wx, wz] = nav.wet(gx, gz) ? [gx, gz] : nav.nearestWater(gx, gz); b.path = nav.path(b.p.x, b.p.z, wx, wz);
  }
  // the player's / commander's tasking: bombard an enemy (or neutral) island, escort the ALBATROSS, or hunt (null)
  W.orderIowa = I => {
    if (!W.iowa || W.iowa.sinking !== undefined) return allow(1, 'battleship') ? `THE IOWA IS ${Math.floor(W.P.bship || 0)}% REACTIVATED  -  OUR FACTORIES BUILD HER` : W.gateMsg(1, 'battleship');
    const b = W.iowa; b.plan = 0;
    if (I && I.owner !== 1) { P.iowaOrder = { kind: 'bombard', I }; return `IOWA: BOMBARD ${I.name}`; }
    if (!P.iowaOrder || P.iowaOrder.kind === 'bombard') { P.iowaOrder = { kind: 'escort' }; return 'IOWA: ESCORT THE ALBATROSS'; }
    P.iowaOrder = null; return 'IOWA: HUNT THE KRAKEN';
  };
  P.iowaTask = () => !W.iowa ? '' : !P.iowaOrder ? 'HUNTING THE KRAKEN' : P.iowaOrder.kind === 'escort' ? 'ESCORTING THE ALBATROSS' : `BOMBARDING ${P.iowaOrder.I.name}`;
  // where a capital ship's turrets look first (war.js updateBattleship): an island she was sent to shell
  P.bombardIsland = b => b.side === 1 && P.iowaOrder && P.iowaOrder.kind === 'bombard' ? P.iowaOrder.I : null;

  // ---------------------------------------------------------------- AH-1T SeaCobra (the WASP's counterpart)
  W.sendCobra = I => {
    if (!allow(1, 'cobra')) return W.gateMsg(1, 'cobra');
    if (count(1, 'cobra') >= PAR_T.COBRA_MAX) return `${PAR_T.COBRA_MAX} COBRAS ALREADY OUT`;
    if (W.P.mat < COST.cobra) return `A COBRA SORTIE NEEDS ${COST.cobra} MATERIEL`;
    const [x, y, z] = launchPoint(1);
    const task = I && I.owner !== 1 ? { kind: 'strike', I } : I ? { kind: 'guard', x: I.pad.x, z: I.pad.z, I } : { kind: 'guard', ship: true };
    const u = makeAir('cobra', 1, x + rnd(-4, 4), y, z + rnd(-4, 4), { task });
    if (!u) return 'NO COBRA';
    W.P.mat -= COST.cobra; H.sfx.dock?.();
    return I ? `AH-1T COBRA LAUNCHED  -  ${I.owner !== 1 ? 'STRIKE ON' : 'OVERWATCH OVER'} ${I.name}` : 'AH-1T COBRA LAUNCHED  -  GUARDING THE ALBATROSS';
  };
  // ---------------------------------------------------------------- E-2C Hawkeye and BGM-109 (REAPER / SHAHED)
  W.sendHawkeye = () => {
    if (!allow(1, 'hawkeye')) return W.gateMsg(1, 'hawkeye');
    if (count(1, 'hawkeye') + (W.air.pending || []).filter(u => u.type === 'hawkeye').length >= PAR_T.HAWKEYE_MAX) return 'THE HAWKEYE IS ALREADY UP';
    if (!carrierOf(1)) return 'NO DECK TO LAUNCH FROM';
    if (W.P.mat < COST.hawkeye) return `THE HAWKEYE NEEDS ${COST.hawkeye} MATERIEL`;
    if (!W.air.spawnHawkeye) return 'NO HAWKEYE IN THIS BUILD';
    const ec = carrierOf(2); W.P.mat -= COST.hawkeye; W.air.spawnHawkeye(ec ? ec.p : null);
    return 'E-2C HAWKEYE LAUNCHED  -  SHE WILL FIND THE KRAKEN';
  };
  // a salvo at the KRAKEN when the Hawkeye has spotted her lately, else at the buildings of island I (or the nearest of theirs)
  W.salvoTomahawk = I => {
    if (!allow(1, 'tomahawk')) return W.gateMsg(1, 'tomahawk');
    if (!W.air.salvoTomahawk) return 'NO TOMAHAWKS IN THIS BUILD';
    const n = PAR_T.SALVO; if (W.P.mat < COST.tomahawk * n) return `A SALVO NEEDS ${COST.tomahawk * n} MATERIEL`;
    if (!W.islands.some(J => J.owner === 1)) return 'NO ISLAND TO LAUNCH FROM';
    const sp = W.spotP, ec = carrierOf(2);
    let tgt = null;
    if (sp && W.time - sp.t < 40 && ec && (!I || I.owner === 1)) tgt = { ship: ec, x: ec.p.x, y: 8, z: ec.p.z };
    else {
      const J = I && I.owner === 2 ? I : W.islands.filter(J => J.owner === 2 && !J.cave).sort((a, b) => Math.hypot(a.x - W.carrier?.p.x, a.z - W.carrier?.p.z) - Math.hypot(b.x - W.carrier?.p.x, b.z - W.carrier?.p.z))[0];
      const s = J && (J.structs.find(s => !s.dead && s.side === 2 && s.kind === 'factory') || J.structs.find(s => !s.dead && s.side === 2 && s.kind !== 'aa') || J.structs.find(s => !s.dead && s.side === 2));
      if (s) tgt = { x: s.x, y: s.y + 2, z: s.z, I: J };
    }
    if (!tgt) return I ? `NOTHING TO HIT ON ${I.name}` : 'NO TARGET  -  SPOT THE KRAKEN WITH THE HAWKEYE OR PICK AN ENEMY ISLAND';
    const out = W.air.salvoTomahawk(tgt, n); if (!out.length) return 'NO LAUNCHER IN REACH';
    W.P.mat -= COST.tomahawk * n;
    return tgt.ship ? `${n} TOMAHAWKS AWAY  -  AT THE KRAKEN` : `${n} TOMAHAWKS AWAY  -  AT ${tgt.I.name}`;
  };
  // ---------------------------------------------------------------- M60A3 by LCM-8 (the seized MBTs' counterpart)
  W.sendArmour = I => {
    if (!allow(1, 'armour')) return W.gateMsg(1, 'armour');
    if (!I) return 'SELECT AN ISLAND FOR THE ARMOUR (M)';
    if (I.cave) return 'NO BEACH FOR A LANDING CRAFT ON A CAVE ISLAND';
    const G = W.ground; if (!G || !G.launchArmour) return 'NO ARMOUR IN THIS BUILD';
    const n = G.sim.units.filter(u => u.side === 1 && u.vehicle && u.alive).length + (G.lcacs || []).filter(L => L.side === 1 && !L.mbt).length;
    if (n >= PAR_T.ARMOUR_MAX) return `${PAR_T.ARMOUR_MAX} TANKS ALREADY ASHORE`;
    if (W.P.mat < COST.armour) return `AN M60A3 NEEDS ${COST.armour} MATERIEL`;
    if (!G.launchArmour(I, 'm60a3', 1)) return `NO BEACH FOR THE LCM-8 ON ${I.name}`;
    W.P.mat -= COST.armour; H.sfx.dock?.();
    return `LCM-8 WITH AN M60A3 UNDER WAY  -  ${I.owner === 1 ? 'TO HOLD' : 'TO TAKE'} ${I.name}`;
  };

  // ---------------------------------------------------------------- the RUNAWAY's new plans (both commanders call this)
  // k: the doctrine's knobs (sim/redai.js) or the game's own (all 1)
  P.think = (side, pl, k = {}) => {
    if (side !== 2) return;
    const E = W.E, A = k.aggression ?? 1, keep = k.reserve ?? 0, ec = carrierOf(2);
    // the KRAKEN's lift-fan refit, when the programme is done and the store is deep (as a rich TASK FORCE commander does)
    if (ec && !ec.sky && allow(2, 'sky') && E.mat >= COST.sky + PAR_T.SKY_RESERVE + keep && (k.sky ?? 1) > 0) {
      const r = W.upgradeCarrier({ side: 2 }); if (/REFIT/.test(r) && k.note) k.note('KRAKEN SKY REFIT', { order: 'sky' });
    }
    // hunt the MSC convoys: a WASP pair on the ship nearest the KRAKEN (the TASK FORCE's Hornets do the same to theirs)
    P.huntT -= 2;
    if (P.huntT <= 0 && allow(2, 'gunship') && E.mat >= 12 * PAR_T.HUNT_N + keep) {
      const ships = W.units.filter(u => u.type === 'freighter' && u.side === 1 && alive(u) && !W.units.some(g => g.type === 'gunship' && g.raid === u && alive(g)));
      const o = ec ? ec.p : { x: 420, z: -400 }, f = ships.sort((a, b) => Math.hypot(a.p.x - o.x, a.p.z - o.z) - Math.hypot(b.p.x - o.x, b.p.z - o.z))[0];
      if (f) {
        P.huntT = PAR_T.HUNT_EVERY / Math.max(0.25, A);
        for (let i = 0; i < PAR_T.HUNT_N; i++) W.spawnGunship(2, null, f);
        E.mat -= 12 * PAR_T.HUNT_N; feed('RADAR: WASPS HEADING FOR AN MSC SHIP', 'bad');
        if (k.note) k.note(`${PAR_T.HUNT_N} WASPS HUNT A CONVOY`, { order: 'hunt' });
      } else P.huntT = 10;
    }
  };

  // ---------------------------------------------------------------- per frame
  let accT = 0;
  P.update = (dt, pl, peace) => {
    convoys(dt);
    accT += dt; if (accT < 0.5) return; const k = accT; accT = 0;
    iowa(k);
    // the E-2C's spot fades (airwar.js sets W.spotP while she is over the KRAKEN)
    void pl; void peace;
  };
  P.reset = () => { for (const I of W.islands) I.stockFuel = 0; P.freightT = 30; P.huntT = 120; P.iowaOrder = null; W.iowa = null; W.spotP = null; if (W.P) W.P.bship = 0; accT = 0; };
  return P;
}
