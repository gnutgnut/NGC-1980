// Air-launched missiles for the AI aircraft: a point-mass flyout (boost, sustain, drag that grows with air density),
// proportional navigation with a g limit that falls with dynamic pressure, seekers (IR, semi-active radar that needs
// the launcher's radar on the target, active radar after a semi-active midcourse, semi-active laser), proximity fuses
// tested along each step (fast missiles, big frames), and decoys. Pure: three.js maths only; runs in node.
//
// World scale: true speeds are half the real ones (see jetfm.js), ranges are the game's (the map is ~1.3 km, the
// fighters' radars see 2-4 km), so every missile here is a scaled weapon: its speeds and ranges keep the real ordering
// (AIM-9L < AIM-7F < AIM-54A, Hellfire slow and short) and the real guidance differences, not the real kilometres.
//   AIM-9L Sidewinder: IR, all-aspect, 35 g; real M 2.5, 18 km max. Here: ~470 m/s peak, ~1.4 km useful.
//   AIM-7F Sparrow: semi-active radar (the launcher must keep the target inside its radar gimbals, ±65°), 25 g;
//     real M 4, 70 km. Here: ~520 m/s, ~2.6 km.
//   AIM-54A Phoenix: semi-active midcourse, active radar ("pitbull") inside 900 m, lofts, 18 g; real M 5, 150+ km.
//     Here: ~560 m/s, ~4.5 km.
//   AGM-114 Hellfire: semi-active laser from the Reaper's turret (line of sight), top attack; real M 1.3, 8 km.
//     Here: ~230 m/s, ~1.6 km.
//   RW-AAM (RUNAWAY, SHRIKE): imaging IR, 45 g, short and very agile. Fiction.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const MSL = {
  aim9:  { name: 'AIM-9L',  seeker: 'ir',   boost: 210, tb: 2.2, sustain: 0, ts: 0, kd: 0.0006, gmax: 35, N: 4, fov: 0.7, fuse: 7, dmg: 9, blast: 6, life: 9, rmin: 150, rmax: 1400, kg: 86 },
  aim7:  { name: 'AIM-7F',  seeker: 'sarh', boost: 170, tb: 3.0, sustain: 35, ts: 2.5, kd: 0.00034, gmax: 25, N: 3.5, fov: 1.1, fuse: 9, dmg: 10, blast: 8, life: 14, rmin: 400, rmax: 2600, kg: 231 },
  aim54: { name: 'AIM-54A', seeker: 'arh',  boost: 95, tb: 7, sustain: 0, ts: 0, kd: 0.00022, gmax: 18, N: 3, fov: 1.0, fuse: 11, dmg: 12, blast: 9, life: 26, rmin: 900, rmax: 4500, pitbull: 900, loft: 0.18, kg: 457 },
  hellfire: { name: 'AGM-114', seeker: 'sal', boost: 150, tb: 2.0, sustain: 0, ts: 0, kd: 0.0011, gmax: 20, N: 3, fov: 1.2, fuse: 3, dmg: 8, blast: 5, life: 16, rmin: 150, rmax: 1600, topAttack: true, kg: 48 },
  rwaam: { name: 'RW-AAM',  seeker: 'ir',   boost: 260, tb: 1.8, sustain: 0, ts: 0, kd: 0.0007, gmax: 45, N: 4.5, fov: 0.9, fuse: 6, dmg: 7, blast: 6, life: 8, rmin: 100, rmax: 1300, kg: 70 },
};
const RHO0 = 4.9;
const _los = new THREE.Vector3(), _rv = new THREE.Vector3(), _a = new THREE.Vector3(), _om = new THREE.Vector3(), _pp = new THREE.Vector3(), _t = new THREE.Vector3();

// m = { type, side, p, v, tgt: { p, v, ... } | null, shooter (an object with p, v, alive, radarCone(tgt)) }
export function createMissile(type, side, p, v, tgt, shooter, o = {}) {
  const T = MSL[type];
  return { type, T, side, p: p.clone(), v: v.clone(), tgt, shooter, age: 0, dead: false, guided: !!tgt, active: false, boom: false, why: '', smoke: 0, id: o.id ?? 0 };
}
// one step. world: { groundY(x,z), rho(y) (optional), decoys(m) -> [{p, k}] }
// returns 'hit' (with m.hitPoint), 'ground', 'expired' or null
export function stepMissile(m, dt, world) {
  const T = m.T; m.age += dt;
  _pp.copy(m.p);
  const V = Math.max(1, m.v.length()), rho = world.rho ? world.rho(m.p.y) : RHO0;
  // motor and drag along the velocity
  const thrust = m.age < T.tb ? T.boost : m.age < T.tb + T.ts ? T.sustain : 0;
  let along = thrust - T.kd * (rho / RHO0) * V * V;
  // guidance
  const t = m.tgt;
  _a.set(0, 0, 0);
  if (t && m.guided && !(t.dead || t.dying || t.gone)) {
    _los.copy(t.p).sub(m.p); const R = _los.length();
    // seeker logic: can it still see / be told where the target is?
    const off = Math.acos(clamp(_los.dot(m.v) / (R * V), -1, 1));
    let see = off < T.fov;
    if (T.seeker === 'sarh' || T.seeker === 'sal' || (T.seeker === 'arh' && !m.active)) see = see && !!m.shooter && m.shooter.illuminates(t);
    if (T.seeker === 'arh' && !m.active && R < T.pitbull) { m.active = true; m.why = 'pitbull'; }
    if (T.seeker === 'arh' && m.active) see = off < T.fov;
    // decoys: flares (IR) / chaff (radar) in the seeker's view can pull it off
    if (see && world.decoys) for (const d of world.decoys(m)) { if (Math.random() < d.k * dt) { m.tgt = { p: d.p.clone(), v: new THREE.Vector3(), decoy: true }; m.why = 'decoyed'; break; } }
    if (!see) { m.lost = (m.lost || 0) + dt; if (m.lost > 0.6) { m.guided = false; m.why = m.why || 'lost'; } }
    else m.lost = 0;
    if (m.guided) {
      // proportional navigation: a = N Vc (LOS rate x LOS), plus gravity compensation; loft for long shots
      _rv.copy(t.v).sub(m.v); const Vc = Math.max(50, -_rv.dot(_los) / R);
      _om.copy(_los).cross(_rv).divideScalar(R * R);
      _a.copy(_om).cross(_los).divideScalar(R).multiplyScalar(-T.N * Vc);
      if (T.loft && R > 1500 && m.age < 6) _a.y += T.loft * 9 * Math.min(1, (R - 1500) / 1500) * 6;
      if (T.topAttack && R > 250) { const h = m.p.y - t.p.y, want = Math.min(140, R * 0.25); _a.y += clamp((want - h) * 0.8, -20, 40); }
      _a.y += 9;   // hold up against gravity
      _a.addScaledVector(m.v, -_a.dot(m.v) / (V * V));   // only the part across the flight path
      const gav = T.gmax * 9 * clamp(0.5 * rho * V * V / 60000, 0.15, 1);
      if (_a.length() > gav) _a.setLength(gav);
    }
  }
  m.v.addScaledVector(_t.copy(m.v).divideScalar(V), along * dt).addScaledVector(_a, dt);
  m.v.y -= 9 * dt;
  m.p.addScaledVector(m.v, dt);
  // proximity fuse: closest approach to the target along this step
  if (t && !t.decoy && !(t.dead || t.dying || t.gone)) {
    const sx = m.p.x - _pp.x, sy = m.p.y - _pp.y, sz = m.p.z - _pp.z, L2 = sx * sx + sy * sy + sz * sz || 1;
    const k = clamp(((t.p.x - _pp.x) * sx + (t.p.y - _pp.y) * sy + (t.p.z - _pp.z) * sz) / L2, 0, 1);
    const d = Math.hypot(_pp.x + sx * k - t.p.x, _pp.y + sy * k - t.p.y, _pp.z + sz * k - t.p.z);
    if (d < T.fuse + (t.r || 0) * 0.5 && m.age > 0.4) { m.p.set(_pp.x + sx * k, _pp.y + sy * k, _pp.z + sz * k); m.dead = true; m.hitPoint = m.p; m.missDist = d; return 'hit'; }
  }
  if (m.p.y < world.groundY(m.p.x, m.p.z)) { m.dead = true; return 'ground'; }
  if (m.age > T.life) { m.dead = true; return 'expired'; }
  return null;
}
// launch envelope check for the shooter's AI: range, closure, off-boresight, aspect
export function inEnvelope(type, shooterP, shooterV, tgtP, tgtV, fwd) {
  const T = MSL[type]; _los.copy(tgtP).sub(shooterP); const R = _los.length(); if (R < T.rmin) return false;
  _rv.copy(tgtV).sub(shooterV); const closing = -_rv.dot(_los) / R;
  const reach = T.rmax * clamp(1 + closing / 400, 0.45, 1.25);   // head-on shots reach further, tail chases less
  const off = Math.acos(clamp(_los.dot(fwd) / R, -1, 1));
  return R < reach && off < (T.seeker === 'ir' ? 0.45 : 0.55);
}
