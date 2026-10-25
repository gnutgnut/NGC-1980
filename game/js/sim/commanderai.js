// SIM MODE: the TASK FORCE's CPU commander. It makes the decisions the player makes from the map and the command
// board - which island next, Sea Knights with Marines (command 1), AA guns (2), Tomcat CAP (4), the sky carrier
// refit (6), the ALBATROSS's course (the map click), research - through the SAME war.js calls main.js makes
// (W.sendDrone, W.orderAA, W.sendEscort, W.upgradeCarrier, W.orderCarrier), so every rule, cost and refusal is the
// game's own. The player's own strike jet is flown by sim/strike.js (the AI Hornet), when the doctrine has one.
// What it does not do: the cave raids (a fortress or IRONHOLD is only taken by a pilot stealing the pod in the Thrust
// cave - a player's job), and the armour by LCM-8 (an M60A3 / M113A2 only fights with the player in it).
//
//   const C = createCommanderAI({ W, nav, doctrine, tech, strike, log, terrainH })
//   C.think() every 2 s of game time (the runner / main.js calls C.update(dt) each frame), C.last: what it last did
import { unitAllowed, aiPickResearch } from '../techtree.js';
import { COST } from '../war.js';

const VALUE = { factory: 1.5, fuel: 1.15, radar: 0.8, hq: 2, fortress: 1.2 };

export function createCommanderAI({ W, nav, doctrine, tech = null, strike = null, fleet = null, log = null, terrainH }) {
  const D = doctrine, A = D.aggression, X = D.expansion, F = D.defence, M = D.mix || { air: 1, ground: 1, naval: 1 };
  const C = { side: 1, doctrine: D, tech, t: 0, thinkT: 1, last: '', strikeT: 30, escortT: 20, moveT: 0, aaT: 0, plan: null, spent: { research: 0, drone: 0, aa: 0, escort: 0, sky: 0, strike: 0 } };
  const allow = k => W.allow ? W.allow(1, k) : unitAllowed(tech, k);   // the war's own gate (W.tech[1])
  const note = (what, extra) => { C.last = what; if (log) log(1, what, extra); };
  const P = () => W.P;
  const mat = () => P().mat;
  const alive = u => u && !u.dead && !u.dying && !u.gone;
  const myAir = type => W.units.filter(u => u.side === 1 && u.type === type && alive(u)).length;
  const eAA = I => W.aliveAA(I, 2);
  const carrierXZ = () => W.carrier && W.carrier.sinking === undefined ? [W.carrier.p.x, W.carrier.p.z] : [-420, 400];
  // our nearest foothold to an island: the carrier or one of our islands
  function reach(I) { const [cx, cz] = carrierXZ(); let d = Math.hypot(I.x - cx, I.z - cz); for (const J of W.islands) if (J.owner === 1) d = Math.min(d, Math.hypot(I.x - J.x, I.z - J.z) + 120); return d; }
  // enemy guns that cover an island's pad (its own and its neighbours' within 160 m) and the machines on it
  function danger(I) {
    let d = 0;
    for (const J of W.islands) for (const s of J.structs) if (s.kind === 'aa' && !s.dead && s.side === 2 && Math.hypot(s.x - I.pad.x, s.z - I.pad.z) < 160) d += s.building ? 0.5 : 1;
    if (W.ground) d += W.ground.presence(I, 2) * 0.35;
    const ec = W.enemyCarrier; if (ec && ec.sinking === undefined && Math.hypot(ec.p.x - I.pad.x, ec.p.z - I.pad.z) < 200) d += 3;
    return d;
  }
  const headingFor = I => W.units.some(u => u.side === 1 && u.type === 'drone' && alive(u) && u.target === I);
  // the island to take next (not caves: those are the pilot's), and how
  function pickTarget() {
    let best = null, bs = -1e9;
    for (const I of W.islands) {
      if (I.cave || I.owner === 1) continue;
      const dz = danger(I), r = reach(I);
      let s = (VALUE[I.kind] || 1) * 100 - r * (D.target === 'near' ? 0.18 : 0.1) - dz * (D.target === 'weak' ? 40 : 22) * (1.2 - D.risk);
      if (I.owner === 2) s += D.target === 'value' ? 25 : 10;   // taking theirs hurts them twice
      if (headingFor(I)) s -= 60;
      if (W.time - (I.lostSK ?? -1e9) < 90) s -= 80;   // lost a Sea Knight there lately
      if (s > bs) { bs = s; best = I; }
    }
    return best ? { I: best, danger: danger(best) } : null;
  }
  // ---------------------------------------------------------------- the 2 s decision
  C.think = () => {
    const t = W.time, keep = D.reserve;
    // (research: war.js asks W.researchPolicy[1] in its 2 s tick - sim/policy.js installs the doctrine's)
    // 0. the ALBATROSS's course (every 20 s; every 6 s with the LEVIATHAN at sea)
    const levOut = W.battleship && W.battleship.sinking === undefined;
    C.moveT -= 2;
    if (C.moveT <= 0) { C.moveT = levOut ? 6 : 20; moveCarrier(C.plan); }
    // 1. reinforce: a landing party of theirs on one of our islands - Marines there first (defence)
    for (const I of W.islands) {
      if (I.owner !== 1 || I.cave || !W.ground || W.ground.presence(I, 2) === 0 || headingFor(I)) continue;
      if (F < 0.3 || !allow('drone')) break;
      const r = W.sendDrone(I); if (/LAUNCHED/.test(r)) { C.spent.drone += COST.drone; note(`SEA KNIGHT REINFORCES ${I.name}`, { order: 'drone', I: I.name, reinforce: true }); return; }
      break;
    }
    // 2. expand: a Sea Knight to the best island when it is not too hot (else the strike wing goes first)
    const pk = pickTarget(); C.plan = pk;
    const maxSK = Math.max(1, Math.min(3, Math.round(1 + X)));
    let save = 0;   // materiel set aside for the landing we want next: the lesser buys wait for it
    if (pk && allow('drone') && myAir('drone') < maxSK) {
      const hot = pk.danger > (0.5 + 3 * D.risk) * Math.max(0.5, M.ground);
      const needStrike = eAA(pk.I) > 0 && strike && allow('jet');
      if (!hot && !(needStrike && D.mix.air > 1.4)) {
        save = (COST.drone + keep) * Math.min(1, X);
        if (mat() >= COST.drone + keep) { const r = W.sendDrone(pk.I); if (/LAUNCHED/.test(r)) { C.spent.drone += COST.drone; note(`SEA KNIGHT TO ${pk.I.name}`, { order: 'drone', I: pk.I.name, danger: +pk.danger.toFixed(1) }); return; } }
      }
    }
    const spare = () => mat() - save, rich = spare() > 150 + keep;   // rich: a deep store with nothing better to buy: more guns, both Hornets up, the KRAKEN
    // 3. strike: the guns on the next island, an enemy factory, the LEVIATHAN or the KRAKEN
    C.strikeT -= 2; if (levOut) C.strikeT = Math.min(C.strikeT, 0);   // the LEVIATHAN at sea: every Hornet at her
    if (strike && allow('jet') && C.strikeT <= 0 && strike.out() < (levOut || rich ? 2 : Math.min(2, Math.round(M.air))) && (fleet ? fleet.n.jet > 0 || spare() >= COST.jet + keep : true)) {
      const tg = strikeTarget(pk, rich);
      if (tg) { const r = strike.launch(tg.t, tg.why); if (!r) { C.strikeT = D.strikeEvery / Math.max(0.3, A); note(`HORNET STRIKE ${tg.why}`, { order: 'strike', why: tg.why }); return; } }
    }
    // 4. fortify: guns on our islands that have few (more where they raid)
    C.aaT -= 2;
    if (allow('aa') && C.aaT <= 0 && spare() >= COST.aa + keep * 0.6) {
      let best = null, bs = -1e9;
      for (const I of W.islands) {
        if (I.owner !== 1) continue;
        const have = W.aliveAA(I, 1) + I.structs.filter(s => s.kind === 'aa' && s.side === 1 && s.building > 0 && !s.dead).length;
        const want = Math.round(((I.kind === 'hq' ? 2 : I.kind === 'factory' ? 2 : I.kind === 'fuel' ? 1.5 : 1) + (t - (I.lastHit ?? -99) < 90 ? 1 : 0) + (rich ? 1 : 0)) * F);
        const s = want - have + (VALUE[I.kind] || 1) * 0.1;
        if (have < want && s > bs) { bs = s; best = I; }
      }
      if (best) { const r = W.orderAA(best); if (/GOING UP/.test(r)) { C.aaT = 8; C.spent.aa += COST.aa; note(`AA GUN ON ${best.name}`, { order: 'aa', I: best.name }); return; } }
    }
    // 5. CAP: Tomcats over the carrier (and over an island under air attack)
    C.escortT -= 2;
    const foeAir = W.units.filter(u => u.side === 2 && u.air && alive(u)).length + W.units.filter(u => u.side === 2 && u.type === 'gunship' && alive(u)).length * 0.3;
    const wantCAP = Math.min(3, Math.round(D.escorts * M.air * 0.6 + (foeAir > 2 ? 1 : 0) * Math.min(1, D.escorts)));
    if (allow('escort') && C.escortT <= 0 && myAir('escort') < wantCAP && spare() >= COST.escort + keep * 0.6) {
      const raided = W.islands.filter(I => I.owner === 1 && t - (I.lastHit ?? -99) < 40).sort((a, b) => (VALUE[b.kind] || 1) - (VALUE[a.kind] || 1))[0];
      const r = W.sendEscort(raided && myAir('escort') > 0 ? raided : null);
      if (/TO THE CAT/.test(r)) { C.escortT = 20; C.spent.escort += COST.escort; note(`TOMCAT CAP ${raided && myAir('escort') > 1 ? 'OVER ' + raided.name : 'OVER THE ALBATROSS'}`, { order: 'escort' }); return; }
    }
    // 5b. PARITY: the counterparts (units/parity/paritywar.js) through the same calls the map's SHIFT+1..5 make
    if (parity(t, pk, spare, keep)) return;
    // 6. the sky carrier refit, when the doctrine wants it and the store is deep
    if (D.sky > 0 && allow('sky') && W.carrier && !W.carrier.sky && spare() >= COST.sky + keep + 60 / D.sky) { const r = W.upgradeCarrier(); if (/STARTED|REFIT/.test(r)) { C.spent.sky += COST.sky; note('SKY CARRIER REFIT', { order: 'sky' }); return; } }
  };
  // PARITY: AH-1T sorties (strike the island we want next, or overwatch an island of ours with machines ashore), M60A3s
  // by LCM-8 where the ground fight is, the E-2C to find the KRAKEN, BGM-109 salvos at her or a factory, the IOWA's tasking
  const PT = { cobra: 20, armour: 40, hawkeye: 30, salvo: 120, iowa: 0 };
  function parity(t, pk, spare, keep) {
    const ok = (k, c) => allow(k) && spare() >= c + keep, sent = (r, what, order) => { if (/LAUNCHED|AWAY|UNDER WAY/.test(r)) { C.spent[order] = (C.spent[order] || 0) + (COST[order] || 0); note(what, { order }); return true; } return false; };
    for (const k in PT) PT[k] -= 2;
    // Cobras: a landing party of theirs on our island, else the next target when it is guarded
    if (PT.cobra <= 0 && W.sendCobra && ok('cobra', COST.cobra) && myAir('cobra') < Math.max(1, Math.round(2 * M.air * A))) {
      PT.cobra = 30 / Math.max(0.3, A);
      const ours = W.ground ? W.islands.find(I => I.owner === 1 && !I.cave && W.ground.presence(I, 2) > 0) : null;
      const I = ours || (pk && pk.danger > 0 ? pk.I : null);
      if (I && sent(W.sendCobra(I), `COBRAS ${ours ? 'OVER' : 'STRIKE'} ${I.name}`, 'cobra')) return true;
    }
    // armour: where the machines are ashore (ours to hold, or the next target with a fight on it)
    if (PT.armour <= 0 && W.sendArmour && ok('armour', COST.armour)) {
      PT.armour = 60 / Math.max(0.3, M.ground);
      const G = W.ground, I = G && (W.islands.find(I => I.owner === 1 && !I.cave && G.presence(I, 2) > 1) || (pk && !pk.I.cave && G.presence(pk.I, 1) > 0 ? pk.I : null));
      if (I && sent(W.sendArmour(I), `M60A3 BY LCM-8 TO ${I.name}`, 'armour')) return true;
    }
    // the Hawkeye up, now and then
    if (PT.hawkeye <= 0 && W.sendHawkeye && ok('hawkeye', COST.hawkeye) && myAir('hawkeye') === 0) { PT.hawkeye = 200; if (sent(W.sendHawkeye(), 'E-2C HAWKEYE UP', 'hawkeye')) return true; }
    // a salvo: at the KRAKEN when she has been spotted lately, else at a factory of theirs
    if (PT.salvo <= 0 && W.salvoTomahawk && ok('tomahawk', COST.tomahawk * 4)) {
      const spotted = W.spotP && t - W.spotP.t < 40;
      PT.salvo = spotted ? 60 : 160 / Math.max(0.3, M.air);
      if (sent(W.salvoTomahawk(spotted ? null : (pk && pk.I.owner === 2 ? pk.I : null)), `BGM-109 SALVO${spotted ? ' AT THE KRAKEN' : ''}`, 'tomahawk')) return true;
    }
    // the IOWA: the gun line on the next island of theirs when the LEVIATHAN is not out, else her hunt
    if (PT.iowa <= 0 && W.iowa && W.iowa.sinking === undefined && W.orderIowa) {
      PT.iowa = 60; const lev = W.battleship && W.battleship.sinking === undefined, want = !lev && pk && pk.I.owner === 2 ? pk.I : null, cur = W.parity.iowaOrder;
      if (want && !(cur && cur.I === want)) note(W.orderIowa(want), { order: 'iowa' });
      else if (!want && cur) { W.parity.iowaOrder = null; note('IOWA: HUNT', { order: 'iowa' }); }
    }
    return false;
  }
  function strikeTarget(pk, rich) {
    const near = (x, z) => { const [cx, cz] = carrierXZ(); return Math.hypot(x - cx, z - cz); };
    const b = W.battleship; if (b && b.sinking === undefined && near(b.p.x, b.p.z) < 1400) return { t: b, why: 'ON THE LEVIATHAN' };
    // the LEVIATHAN on the slip (its hull rising in the yard is plain to see): the shipyard, before it sails
    const IH = W.islands.find(I => I.name === 'IRONHOLD'), yard = IH && IH.yard;
    if (yard && !yard.dead && !W.battleship && W.E.bship > 100 * (0.55 - 0.25 * D.risk) && near(yard.x, yard.z) < 1400) return { t: yard, why: 'ON THE SHIPYARD' };
    if (pk && eAA(pk.I) > 0) { const s = pk.I.structs.find(s => s.kind === 'aa' && !s.dead && s.side === 2); if (s) return { t: s, why: `ON THE GUNS AT ${pk.I.name}` }; }
    const fr = W.units.find(u => u.type === 'freighter' && u.side === 2 && u.sinking === undefined && !u.gone && near(u.p.x, u.p.z) < 800); if (fr && M.naval >= 1) return { t: fr, why: 'ON A CONTAINER SHIP' };
    const ec = W.enemyCarrier;
    if (ec && ec.sinking === undefined && (A > 1.2 || rich || W.E.mat < 30 || ec.hp < ec.hpMax * 0.6) && near(ec.p.x, ec.p.z) < 1300) return { t: ec, why: 'ON THE KRAKEN' };   // (she patches herself with their materiel: hit her when they are broke)
    let best = null, bd = 1e9;   // a factory of theirs (their materiel), nearest first
    for (const I of W.islands) if (I.owner === 2 && !I.cave) for (const s of I.structs) if (!s.dead && s.side === 2 && (s.kind === 'factory' || s.kind === 'aa')) { const d = near(s.x, s.z) + (s.kind === 'aa' ? 150 : 0); if (d < bd) { bd = d; best = s; } }
    if (best && bd < 1000) return { t: best, why: `ON ${best.I.name}` };
    if (ec && ec.sinking === undefined && near(ec.p.x, ec.p.z) < 1100) return { t: ec, why: 'ON THE KRAKEN' };
    return null;
  }
  function moveCarrier(pk) {
    const c = W.carrier; if (!c || c.sinking !== undefined) return;
    const home = W.islands.find(I => I.name === 'HOME ISLAND');
    let gx, gz, why;
    const lev = W.battleship && W.battleship.sinking === undefined ? W.battleship : null;
    const ld = lev ? Math.hypot(lev.p.x - c.p.x, lev.p.z - c.p.z) : 1e9;
    if (lev && ld < 700) { const a = Math.atan2(c.p.z - lev.p.z, c.p.x - lev.p.x); gx = c.p.x + Math.cos(a) * 500; gz = c.p.z + Math.sin(a) * 500; why = 'RUNS FROM THE LEVIATHAN'; }   // (out of its guns' 320 m reach if she can)
    else if (c.hp < c.hpMax * (1 - D.risk)) { gx = home.x + 60; gz = home.z - 200; why = 'PULLS BACK'; }
    else if (pk && (D.carrierForward || X > 1.2)) { const I = pk.I, a = Math.atan2(c.p.z - I.z, c.p.x - I.x), r = I.r + 140 + 160 * (1 - D.risk); gx = I.x + Math.cos(a) * r; gz = I.z + Math.sin(a) * r; why = `CLOSES ${I.name}`; }
    else { gx = -300; gz = 280; why = 'HOLDS STATION'; }
    if (Math.hypot(gx - c.p.x, gz - c.p.z) < 90) return;
    const [wx, wz] = nav.wet(gx, gz) ? [gx, gz] : nav.nearestWater(gx, gz);
    if (Math.hypot(wx - (c.goal ? c.goal[0] : 1e9), wz - (c.goal ? c.goal[1] : 1e9)) < 60) return;
    if (W.orderCarrier(wx, wz)) note(`ALBATROSS ${why}`, { order: 'carrier' });
  }
  C.update = dt => {
    C.t += dt; C.thinkT -= dt;
    if (strike) strike.update(dt);
    if (C.thinkT <= 0 && !W.over) {
      C.thinkT = 2;
      for (const u of W.units) if (u.side === 1 && u.type === 'drone' && u.dying && !u._simLost) { u._simLost = true; if (u.target) u.target.lostSK = W.time; }   // (a Sea Knight shot down: that island waits)
      C.think();
    }
  };
  return C;
}
