// THE GROUND WAR, infantry depth (ngc/infdepth): casualty evacuation, the sickbay pool, and the ground war's side of
// the player's own Marine (buddy aid both ways, carrying casualties, looting the dead). groundwar.js creates it; it
// only uses the ground sim, war.js's units (W) and the player (PL), so it has no THREE.
//   * CASEVAC by the player's Huey: put down within 45 m of wounded Marines (an island pad's casualty collection point,
//     or wherever they lie) and stay down: the walking wounded walk to the cabin, buddies carry the litter cases, one
//     every ~5 s, up to 6 (the UH-1H's litter fit). Land on the ALBATROSS (or a friendly HQ pad) and they go below.
//   * CASEVAC by CH-46: a Sea Knight that has put its stick down keeps its ramp down while the island's wounded are
//     carried aboard (up to 12), then flies them home; a Sea Knight lost on the way loses them with it.
//   * THE POOL: an evacuated man is not lost: after a spell in the sickbay (GAME: 4 min) he is back in the pool, and
//     every man in the pool fills a seat on the next Sea Knight (that much less materiel for a new stick: war.js hook).
//   * The player's Marine (marine.js) registers as a patient (fieldcare treats him), reads casualties near him (F: treat
//     on his HEALTH screen with your kit; Shift+F: drag, fireman's carry, put down), loads a carried man into the Huey,
//     and searches the dead (their kit).
//
//   const CV = createCasevac({ GS, W, PL: () => player, feed, ccpOf(I) })
//   CV.update(dt);  CV.landing(u, U, I) (a CH-46 on the ground);  CV.poolCredit(cost) / CV.poolUse();  CV.stats
import * as I from '../infantry/inventory.js';

export const EVAC = { HUEY_CAP: 6, CH46_CAP: 12, LOAD_S: 5, REACH: 45, RECOVER: 240, SEAT: 13 };

export function createCasevac(o) {
  const { GS, W } = o, feed = o.feed || (() => {});
  const CV = { huey: { aboard: [], loadT: 0, wasLanded: false }, flights: [], sickbay: [], ready: 0, stats: { byHuey: 0, byCH46: 0, delivered: 0, lostAboard: 0, returned: 0, playerLoaded: 0 }, player: null };
  const PL = () => o.PL();
  // ---- the player's Huey on the ground near wounded: load them
  function hueyTick(dt) {
    const P = PL(), H = CV.huey;
    if (!P || P.craft !== 'heli' || !P.alive) { H.loadT = 0; return; }
    if (!P.landed) { H.loadT = 0; H.wasLanded = false; for (const u of GS.units) if (u.cas && u.cas.toHuey) { u.cas.toHuey = false; u.cas.walkCCP = false; } return; }
    // delivered: down on the ALBATROSS deck (or a friendly HQ pad) with wounded aboard
    if (H.aboard.length) {
      const c = W.carrier, onShip = c && !c.sinking && Math.hypot(P.pos.x - c.p.x, P.pos.z - c.p.z) < 160 && P.pos.y > 3;
      const hq = W.islands.find(I => I.kind === 'hq' && I.owner === 1 && Math.hypot(P.pos.x - I.pad.x, P.pos.z - I.pad.z) < 40);
      if (onShip || hq) { deliver(H.aboard.length, onShip ? 'ALBATROSS SICKBAY' : `${hq.name} AID STATION`, H.aboard.slice()); CV.stats.byHuey += H.aboard.length; H.aboard.length = 0; }
    }
    const list = GS.casualties(P.pos.x, P.pos.z, EVAC.REACH).filter(u => !(u.cas && u.cas.held));
    if (!list.length || H.aboard.length >= EVAC.HUEY_CAP) { H.loadT = 0; return; }
    if (!H.wasLanded) { H.wasLanded = true; feed(`CASEVAC: ${list.length} WOUNDED NEAR THE HUEY  -  STAY DOWN, THEY ARE COMING ABOARD`, 'good'); }
    // the walking wounded walk to the cabin (fieldcare moves them), the rest are carried (the time below)
    for (const u of list) if (u.cas) { u.cas.toHuey = [P.pos.x, P.pos.z]; }
    H.loadT += dt;
    const near = list.sort((a, b) => Math.hypot(a.x - P.pos.x, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.z - P.pos.z))[0];
    const d = Math.hypot(near.x - P.pos.x, near.z - P.pos.z);
    if (H.loadT > EVAC.LOAD_S + d / 3 || d < 4) { H.loadT = 0; GS.evacuate(near); H.aboard.push(near.id); feed(`CASEVAC: ${H.aboard.length} WOUNDED ABOARD THE HUEY${H.aboard.length >= EVAC.HUEY_CAP ? '  -  FULL' : ''}  -  FLY THEM TO THE ALBATROSS`, 'good'); }
  }
  // the player on foot puts a man he has carried to the Huey into the cabin
  CV.loadIntoHuey = u => { if (CV.huey.aboard.length >= EVAC.HUEY_CAP) return false; GS.evacuate(u); CV.huey.aboard.push(u.id); CV.stats.playerLoaded++; feed(`CASEVAC: ${CV.huey.aboard.length} WOUNDED ABOARD THE HUEY  -  FLY THEM TO THE ALBATROSS`, 'good'); return true; };
  // ---- a CH-46 on the ground at an island: carry the wounded aboard before it lifts
  CV.landing = (u, U, I) => {
    const F = { u, U, I, aboard: 0, loadT: 0, done: false, home: false };
    CV.flights.push(F);
    const prev = U.AI.hooks.unload;
    U.AI.hooks.unload = (ai, dt) => {
      const done = prev(ai, dt);
      if (!done || F.done) return done;
      const p = u.p, list = GS.casualties(p.x, p.z, 70);
      if (!list.length || F.aboard >= EVAC.CH46_CAP || F.loadT > 90) { F.done = true; if (F.aboard) feed(`${I.name}: SEA KNIGHT LIFTING WITH ${F.aboard} WOUNDED`, 'good'); return true; }
      U.rampT = 1;   // (ramp stays down)
      for (const c of list) if (c.cas) c.cas.toHuey = [p.x, p.z];
      F.loadT += dt; F.tick = (F.tick || 0) + dt;
      const near = list.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (F.tick > 4 + Math.hypot(near.x - p.x, near.z - p.z) / 4 || Math.hypot(near.x - p.x, near.z - p.z) < 6) { F.tick = 0; GS.evacuate(near); F.aboard++; (F.ids ||= []).push(near.id); }
      return false;
    };
    return F;
  };
  function flightsTick() {
    for (let i = CV.flights.length - 1; i >= 0; i--) {
      const F = CV.flights[i];
      if (F.u.stowed) { if (F.aboard) { deliver(F.aboard, 'ALBATROSS SICKBAY (SEA KNIGHT)', F.ids); CV.stats.byCH46 += F.aboard; } CV.flights.splice(i, 1); }
      else if (F.u.dying || (F.u.dead && !F.u.stowed)) { if (F.aboard) { CV.stats.lostAboard += F.aboard; feed(`SEA KNIGHT DOWN WITH ${F.aboard} WOUNDED ABOARD`, 'bad'); o.lost?.(F.ids || []); } CV.flights.splice(i, 1); }   // (PERSONNEL: o.lost - who was aboard)
    }
  }
  function deliver(n, where, ids = []) {   // (PERSONNEL: ids = the ground-war unit ids delivered, o.delivered -> the roster's sick bay)
    CV.stats.delivered += n; o.delivered?.(ids, where);
    for (let k = 0; k < n; k++) CV.sickbay.push({ t: 0 });
    feed(`${n} WOUNDED DELIVERED TO THE ${where}  -  THEY WILL BE BACK IN THE POOL`, 'good');
  }
  // ---- the sickbay and the pool
  function sickbayTick(dt) {
    for (let i = CV.sickbay.length - 1; i >= 0; i--) { const s = CV.sickbay[i]; s.t += dt; if (s.t > EVAC.RECOVER) { CV.sickbay.splice(i, 1); CV.ready++; CV.stats.returned++; } }
  }
  // war.js: a Sea Knight's materiel, less a 13th of it for every man back from the sickbay who fills a seat
  CV.poolCredit = cost => Math.min(EVAC.SEAT, CV.ready) / EVAC.SEAT * cost;
  CV.poolUse = () => { const n = Math.min(EVAC.SEAT, CV.ready); CV.ready -= n; return n; };
  // ---- the player's Marine (marine.js registers itself: { x, y, z, M, inv, moving, active() })
  CV.setPlayer = p => { CV.player = p; if (p) { p.id = 'player'; p.ext = true; } };
  CV.patients = B => { const p = CV.player; if (!p || !p.active()) return []; const I0 = B.I; return Math.hypot(p.x - I0.x, p.z - I0.z) < I0.r + 120 ? [p] : []; };
  // casualties (alive, out of the fight) and the dead (their kit) near a point
  CV.casualtyNear = (x, z, r = 2.2) => { let best = null, bd = r; for (const u of GS.units) if (u.kind === 'marine' && u.alive && !u.able && !u.evac) { const d = Math.hypot(u.x - x, u.z - z); if (d < bd) { bd = d; best = u; } } return best; };
  CV.woundedNear = (x, z, r = 2.2) => { let best = null, bd = r; for (const u of GS.units) if (u.kind === 'marine' && u.alive && !u.evac && (!u.able || (u.rich && (u.rich.M.bleedRate() > 1 || u.rich.M.pain() > 30)))) { const d = Math.hypot(u.x - x, u.z - z); if (d < bd) { bd = d; best = u; } } return best; };
  CV.bodiesNear = (x, z, r = 2.2) => GS.units.filter(u => u.kind === 'marine' && !u.alive && Math.hypot(u.x - x, u.z - z) < r);
  // a dead man's kit (lootable): his own rig if he was on the rich model; else his role's loadout with the magazines
  // he had left (searched item by item, as MEDINV's crates)
  CV.kitOfDead = u => {
    if (u.lootKit) return u.lootKit;
    const k = GS.kitOf(u);
    if (!u.rich) { const mags = I.findAll(k, o => o.id === 'mag_m16_20'); for (let i = 0; i < mags.length - Math.max(0, u.body.mags || 0); i++) I.detach(mags[i]); }
    k.name = `${u.name || 'MARINE'} (KIA)`; I.hideContents(k);
    return (u.lootKit = k);
  };
  CV.update = dt => { hueyTick(dt); flightsTick(); sickbayTick(dt); };
  CV.reset = () => { CV.huey.aboard.length = 0; CV.flights.length = 0; CV.sickbay.length = 0; CV.ready = 0; for (const k in CV.stats) CV.stats[k] = 0; };
  return CV;
}
