// SIM MODE: the RUNAWAY commander under a doctrine (sim/doctrine.js RED). war.js calls W.redAI.think(pl, think) every
// 2 s in place of its own enemy plans when a sim installs one (the hook in W.update); nothing changes otherwise.
//
// DEFAULT runs war.js's own think() and the ground and air arms' plans exactly as the game does (the tech tree gates
// them inside war.js; research is war.js's own tick under the policy sim/policy.js installs). Every other doctrine
// runs think() below: a line-for-line copy of war.js think() with the doctrine's knobs where the game has fixed
// numbers (at 1 the knob is the game's number; tools/simbench.mjs checks the copy replays the original), and the
// ground (GW.think) and air (AW.think) arms throttled by the doctrine's mix.
import { GW_T } from '../units/groundwar/groundwar.js';
import { AIR } from '../units/air/airwar.js';

const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const BASE_GW = { ...GW_T }, BASE_AIR = { SHRIKE_MAX: AIR.SHRIKE_MAX };

export function createRedAI({ W, nav, feed = () => {}, sfx = {}, doctrine, log = null }) {
  const D = doctrine, A = D.aggression, X = D.expansion, F = D.defence, M = D.mix || { air: 1, ground: 1, naval: 1 };
  const R = { side: 2, doctrine: D, decisions: [], last: '', spent: { research: 0 }, builtin: !!D.builtin };
  const allow = k => W.allow(2, k);
  const note = (what, extra) => { R.last = what; if (log) log(2, what, extra); };
  const { makeAir, buildAA, makeShip, launchPoint, nearestLaunch } = W.sim;

  // ---------------------------------------------------------------- war.js think(), with the knobs
  function think(pl) {
    W.researchTick(2, pl); W.researchTick(1, pl);   // (as war.js think opens)
    const E = W.E, ec = W.enemyCarrier && W.enemyCarrier.sinking === undefined ? W.enemyCarrier : null;
    const air = W.units.filter(u => u.side === 2 && u.p && !u.dims && !u.dead && !u.dying);
    const guns = air.filter(u => u.type === 'gunship'), trans = air.filter(u => u.type === 'transport');
    const cap = Math.min(Math.round(12 * Math.max(M.air, 0.5)), 3 + Math.floor(W.time / 110)), mine = W.islands.filter(I => I.owner === 2);
    const keep = D.reserve;   // materiel held back before military spending (0 = the game)
    // 1. defend: the player is poking at one of our islands or the carrier
    if (pl.alive && !pl.inCave && allow('gunship')) {
      const near = [...mine.map(I => [I.x, I.z]), ...(ec ? [[ec.p.x, ec.p.z]] : [])].some(([x, z]) => Math.hypot(pl.pos.x - x, pl.pos.z - z) < 260 * (pl.detect ?? 1));
      const hunting = guns.filter(g => g.target === 'player').length;
      if (near && hunting < Math.round((2 + Math.floor(W.time / 300)) * F) && guns.length < cap && E.mat >= 12) { E.mat -= 12; W.spawnGunship(2, nearestLaunch(pl.pos.x, pl.pos.z)).target = 'player'; note('WASPS HUNT THE PLAYER'); }
    }
    // 2. expand: send transports at neutral (or undefended player) islands
    W.transT -= 2;
    if (allow('transport') && trans.length < Math.max(1, Math.round(2 * X)) && E.mat >= 25 + keep && W.transT <= 0) { const I = W.pickExpansion(); if (I) { W.transT = Math.max(18, 40 - W.time / 30) / Math.max(0.25, X); E.mat -= 25; const [x, y, z] = launchPoint(2); makeAir('transport', 2, x, y, z, { target: I }); note(`MV-22 TO ${I.name}`, { order: 'transport', I: I.name }); } }
    // 3. fortify: guns on islands that have few
    if (allow('aa')) for (const I of mine) if (E.mat >= 30 + keep * 0.5 && W.aliveAA(I) + I.structs.filter(s => s.kind === 'aa' && s.building > 0).length < Math.round((I.kind === 'factory' || I.kind === 'hq' ? 3 : 2) * F)) { const s = buildAA(I, 2); if (s) { E.mat -= 30; s.building = 14 * W.techMod(2, 'aa.build'); note(`TALON ON ${I.name}`, { order: 'aa', I: I.name }); } break; }
    // 4. raid: every so often, a strike group at the player's weakest guarded island or the carrier
    W.raidT -= 2;
    if (allow('gunship') && W.raidT <= 0 && E.mat >= 36 + keep && guns.length < cap) {
      W.raidT = Math.max(50, 110 - W.time / 20) / Math.max(0.25, A);
      const ours = W.islands.filter(I => I.owner === 1 && I.kind !== 'hq');
      let tgt = null;
      if (ours.length && Math.random() < 0.65) { const I = ours.sort((a, b) => W.aliveAA(a) - W.aliveAA(b))[0]; tgt = I.structs.find(s => s.kind === 'aa' && !s.dead) || I.structs.find(s => !s.dead); }
      else if (W.carrier && W.carrier.sinking === undefined) tgt = W.carrier;
      if (tgt) { const n = Math.max(1, Math.round((2 + Math.min(3, Math.floor(W.time / 240))) * Math.min(2, A * Math.max(0.5, M.air)))); E.mat -= 12 * n; for (let i = 0; i < n; i++) W.spawnGunship(2, null, tgt); feed(tgt === W.carrier ? 'RADAR: ENEMY STRIKE INBOUND ON THE ALBATROSS' : `RADAR: ENEMY STRIKE HEADING FOR ${tgt.I.name}`, 'bad'); note(`${n} WASPS RAID ${tgt === W.carrier ? 'THE ALBATROSS' : tgt.I.name}`, { order: 'raid', n }); }
    }
    // 5. a couple of guards over the carrier
    if (allow('gunship') && ec && guns.filter(g => !g.target && Math.hypot(g.home[0] - ec.p.x, g.home[1] - ec.p.z) < 200).length < Math.round(2 * F) && E.mat >= 12 && guns.length < cap) { E.mat -= 12; W.spawnGunship(2); }
    // 6. supply: a freighter takes an island's stockpile to the KRAKEN (or IRONHOLD)
    W.freightT -= 2;
    if (W.freightT <= 0 && allow('freighter')) {
      W.freightT = 16;
      const I = mine.filter(I => (I.stock || 0) >= 18 && !W.units.some(u => u.type === 'freighter' && u.from === I)).sort((a, b) => b.stock - a.stock)[0];
      if (I) {
        const [x, z] = nav.nearestWater(I.x, I.z), f = makeShip('freighter', 2, x, z, rnd(6.283));
        f.cargo = I.stock; f.from = I; I.stock = 0; f.repath = 0; note(`FREIGHTER FROM ${I.name}`);
      }
    }
    // 7. the battleship
    if (E.bship >= 100 && !W.battleship && allow('battleship')) {
      E.bship = 0; const I = W.islands.find(I => I.name === 'IRONHOLD'), y = I.yard || I;
      const [wx, wz] = nav.nearestWater(y.x + (0 - y.x) * 0.2, y.z + (0 - y.z) * 0.2);
      W.battleship = makeShip('battleship', 2, wx, wz, Math.atan2(-(0 - wx), -(0 - wz)));
      feed('THE LEVIATHAN IS AT SEA  -  IT IS HUNTING THE ALBATROSS', 'bad'); sfx.alarm?.(); note('LEVIATHAN LAUNCHED', { order: 'battleship' });
    }
    // the enemy carrier's course
    if (ec) {
      ec.plan = (ec.plan || 0) - 2;
      if (ec.plan <= 0 || !ec.path.length) {
        ec.plan = 25;
        let gx, gz;
        if (ec.hp < ec.hpMax * (1 - D.risk)) { gx = 330; gz = -300; }
        else if (W.battleship || (E.mat > 160 / Math.max(0.25, A) && guns.length > 6 / Math.max(0.25, A))) { const c = W.carrier || { p: { x: 0, z: 0 } }; const a = Math.atan2(ec.p.z - c.p.z, ec.p.x - c.p.x); gx = c.p.x + Math.cos(a) * 330; gz = c.p.z + Math.sin(a) * 330; }
        else { const I = W.pickExpansion(ec.p.x, ec.p.z) || W.islands.find(I => I.name === 'CITADEL'); const a = Math.atan2(ec.p.z - I.z, ec.p.x - I.x); gx = I.x + Math.cos(a) * (I.r + 90); gz = I.z + Math.sin(a) * (I.r + 90); }
        const [wx, wz] = nav.wet(gx, gz) ? [gx, gz] : nav.nearestWater(gx, gz); ec.path = nav.path(ec.p.x, ec.p.z, wx, wz);
      }
    }
    if (W.battleship && W.battleship.sinking === undefined) {
      const b = W.battleship; b.plan = (b.plan || 0) - 2;
      if (W.carrier && (b.plan <= 0 || !b.path.length)) { b.plan = 15; const c = W.carrier.p, a = Math.atan2(b.p.z - c.z, b.p.x - c.x), gx = c.x + Math.cos(a) * 170, gz = c.z + Math.sin(a) * 170; const [wx, wz] = nav.wet(gx, gz) ? [gx, gz] : nav.nearestWater(gx, gz); b.path = nav.path(b.p.x, b.p.z, wx, wz); }
    }
    // PARITY: the KRAKEN's sky refit and the convoy hunts (units/parity/paritywar.js), as war.js think ends; the
    // doctrine's knobs: aggression (hunt tempo), reserve, sky (the naval mix: a DREADNOUGHT wants her flying)
    if (W.parity) W.parity.think(2, pl, { aggression: A * Math.max(0.5, M.naval), reserve: keep, sky: M.naval, note });
  }

  // ---------------------------------------------------------------- the ground and air arms, throttled by the mix
  // (the tech tree gates them inside groundwar.js / airwar.js; at mix 1 they are the game's own plans untouched)
  function groundArm(pl) {
    const g = Math.max(0.05, M.ground);
    GW_T.HOVER_AT = BASE_GW.HOVER_AT / g; GW_T.HOVER_GAP = BASE_GW.HOVER_GAP / g; GW_T.MBT_AT = BASE_GW.MBT_AT / g; GW_T.MBT_GAP = BASE_GW.MBT_GAP / g;
    const GW = W.ground, h0 = GW.hoverT, m0 = GW.mbtT;
    try { GW.think(pl); } finally { Object.assign(GW_T, BASE_GW); }
    if (GW.hoverT === h0 - 2) GW.hoverT -= 2 * (g - 1);   // a heavier ground mix readies armour sooner (timer runs g x as fast)
    if (GW.mbtT === m0 - 2) GW.mbtT -= 2 * (g - 1);
  }
  function airArm(pl) {
    const AW = W.air, a = Math.max(0.05, M.air);
    AIR.SHRIKE_MAX = Math.round(BASE_AIR.SHRIKE_MAX * Math.min(2, a));
    try { AW.think(pl); } finally { AIR.SHRIKE_MAX = BASE_AIR.SHRIKE_MAX; }
    AW.shrikeT -= 2 * (a - 1); AW.shahedT -= 2 * (a - 1);   // the air mix: the arm's timers run a x as fast
  }
  function naval() {   // the naval mix: the yards' rate (war.js ~0.14 / s with ANVIL and the yard) scaled
    if (M.naval !== 1 && !W.battleship && allow('battleship')) W.E.bship = Math.max(0, W.E.bship + 2 * 0.14 * (M.naval - 1) * W.techMod(2, 'bship.rate'));
  }

  R.think = (pl, builtinThink) => {
    if (R.builtin) { W.ground.think(pl); builtinThink(pl); W.air.think(pl); return; }
    groundArm(pl); think(pl); airArm(pl); naval();
  };
  return R;
}
