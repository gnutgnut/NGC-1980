// armorgunnery.js - the armour's rounds in the GAME (wave 2): the shot events of createM60A3 / createM113 (main gun,
// coax, .50) fly on armorballistics' game flight model and hit the island war through war.js's exported interface
// (war.hitTest / war.damage / war.blast) - RUNAWAY units, ships and structures - with the game's own effects (fx.js).
// WEAPONS STAY AT GAME LEVEL (BIBLE): headline muzzle velocities, game damage per round, a game blast for HEAT / HEP.
//
//   const GN = createGunnery({ war, fx, solid(x, y, z) -> bool, ground(x, z) -> y, isWater(x, z), audio: () => ArmorAudio,
//                              ear: () => camera position, onHit(t, round), say });
//   GN.fire(e, side = 1)   a 'shot' event from V.step   GN.update(dt)   GN.clear()   GN.stats { shots, hits, kills }
import { newShot, stepShot, ROUNDS } from './armorballistics.js';

// game damage in war.js units (a heli rocket is 4 + a 6 m / 4 blast, a bomb a 12 m / 20 blast, an AA site has 7 hp, an HQ 30)
export const GAME_DMG = {
  M735: { hit: 10, blast: 1.5, r: 3, fx: 0.7 },    // APFSDS: a dart - all in the hole it punches
  M456: { hit: 8, blast: 5, r: 5, fx: 1.0 },       // HEAT
  M393: { hit: 6, blast: 9, r: 7, fx: 1.25 },      // HEP: the bunker buster
  M80: { hit: 0.45 },                               // 7.62 coax
  M2AP: { hit: 1.0 },                               // .50
};
const SPREAD = { main: 0.00025, coax: 0.0012, mg50: 0.0015 };   // game dispersion (rad, half-width)

export function createGunnery(o) {
  const { war, fx } = o, shots = [];
  const GN = { shots, stats: { shots: 0, hits: 0, kills: 0 } };
  const _q = { x: 0, y: 0, z: 0 };
  GN.fire = (e, side = 1) => {
    const s = newShot(e.round, e.p, e.dir, e.vel || [0, 0, 0], (Math.random() - 0.5) * 0.002);
    const sp = SPREAD[e.weapon] || 0.001, mv = s.round.mv;
    s.v[0] += (Math.random() - 0.5) * 2 * sp * mv; s.v[1] += (Math.random() - 0.5) * 2 * sp * mv; s.v[2] += (Math.random() - 0.5) * 2 * sp * mv;
    s.weapon = e.weapon; s.side = side; s.origin = e.p.slice(); s.aimR = e.aimR || 1200; s.tracer = e.weapon === 'main' || !!e.tracer; s.big = s.round.cal >= 100;
    shots.push(s); if (e.weapon === 'main') GN.stats.shots++;
    return s;
  };
  // one round: substeps of <= 3 m so nothing is tunnelled through (a 1500 m/s dart moves 25 m a frame)
  function fly(s, dt) {
    const speed = Math.hypot(s.v[0], s.v[1], s.v[2]), n = Math.max(1, Math.ceil(speed * dt / 3)), h = dt / n;
    for (let k = 0; k < n; k++) {
      stepShot(s, h);
      const x = s.p[0], y = s.p[1], z = s.p[2];
      if (s.tracer && (k % 2 === 0 || s.big)) fx.add.spawn(x, y, z, 0, 0, 0, s.big ? 0.05 : 0.035, s.big ? 1.3 : 0.7, s.big ? 0.9 : 0.5, 1, s.big ? 0.75 : 0.45, s.big ? 0.4 : 0.25, 1);
      // a war target (the other side's units, ships, structures)
      const t = war.hitTest(x, y, z, s.side, s.big ? 0.6 : 0.25);
      if (t) { impact(s, x, y, z, t); return true; }
      // the ground, the sea, a deck, a house
      const g = o.ground(x, z);
      if (y < g) { impact(s, x, Math.max(g, y), z, null); return true; }
      if (o.solid && o.solid(x, y, z)) { impact(s, x, y, z, null, true); return true; }
      if (s.t > (s.big ? 9 : 3.2)) { if (s.big) o.onMiss?.(s.round, { over: true }); return true; }   // spent / out of the fight
    }
    return false;
  }
  function impact(s, x, y, z, t, hard) {
    const R = s.round, D = GAME_DMG[R.id] || { hit: 0.5 }, wet = !t && !hard && o.isWater(x, z) && y < 0.6;
    if (t) {
      const was = !!(t.dead || t.dying);
      war.damage(t, D.hit, s.side);
      if (s.big) { GN.stats.hits++; GN.stats.last = t.kind || t.type || (t.ship ? "ship gun" : "?"); }
      if (!was && (t.dead || t.dying || t.sinking !== undefined)) GN.stats.kills++;
      o.onHit?.(t, R, s);
    }
    if (!t && s.big) o.onMiss?.(R, { over: Math.hypot(x - s.origin[0], z - s.origin[2]) > s.aimR * 1.05 });   // the sensing: beyond the range the computer was set for = over
    if (D.blast) war.blast(x, y, z, D.r, D.blast, s.side);
    if (s.big) {
      if (R.kind === 'KE') {   // a dart: a spray of sparks and dust, no fireball
        fx.impact(x, y, z, wet ? 'water' : t || hard ? 'metal' : 'ground');
        if (wet) fx.splash(x, z, 0.6); else for (let i = 0; i < 6; i++) fx.mix.spawn(x, y + 0.3, z, (Math.random() - 0.5) * 6, Math.random() * 4 + 1, (Math.random() - 0.5) * 6, 1.5 + Math.random(), 0.8, 3.2, 0.5, 0.44, 0.34, 0.6, 0.5, 1.6, 0.5);
      } else fx.explode(x, y, z, D.fx, { debris: 3, crater: 1.6, shake: 0.5 });
    } else fx.impact(x, y, z, wet ? 'water' : t || hard ? 'metal' : 'ground');
    const ear = o.ear ? o.ear() : null, a = o.audio ? o.audio() : null;
    if (a && ear) a.impact(s.big, Math.hypot(x - ear.x, y - ear.y, z - ear.z));
    _q.x = x; _q.y = y; _q.z = z; s.hitAt = _q;
  }
  GN.update = dt => {
    for (let i = shots.length - 1; i >= 0; i--) if (fly(shots[i], dt)) { shots[i] = shots[shots.length - 1]; shots.pop(); }
  };
  GN.clear = () => { shots.length = 0; };
  return GN;
}
export { ROUNDS };
