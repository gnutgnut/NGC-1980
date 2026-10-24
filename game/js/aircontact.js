// COLLISION (wave 3): an aircraft moving on (or just over) the ground against the collision world (collision.js) - a
// jet taxiing into a parked jet, a Huey hover-taxiing into a truck, a Tomcat rolling into the island. Pure (no THREE:
// pos / vel are anything with x, z). The aircraft's own flight model never sees this: in free flight nothing here runs,
// so the HORNET's flight-model fingerprint is untouched.
//
//   const r = groundContact(CW, B, pos, vel, o)   B: the aircraft's body (craft.js syncs it; synced to where it is now)
//     -> null, or { speed, other, nx, nz, depth } of the hardest contact; pos / vel corrected: pushed out along the
//        normal, the closing velocity taken out (a little bounce). o: { skip(b), restitution }
//   contactDamage(speed) -> { band, amount }    GAME bands by closing speed (m/s): < 1 a nudge (nothing), 1-3 a bump
//     (a scratch), 3-7 (6-14 kt) damage, > 7 m/s a crash (the airframe breaks up / burns)
const _near = [], _c = { nx: 0, nz: 0, depth: 0, x: 0, z: 0 };
export function groundContact(CW, B, pos, vel, o = {}) {
  if (!CW || !B) return null;
  let best = null;
  for (const b of CW.near(B.x, B.z, B.R + 1, _near, null, false)) {
    if (b === B || (B.owner && b.owner === B.owner) || !b.solid || !b.enabled) continue;
    if (b.cls === 'inf' || (o.skip && o.skip(b))) continue;   // men are shoved aside by the contact response, not walls for a jet
    if (!CW.contact(B, b, _c)) continue;
    const closing = -((vel.x - (b.vx || 0)) * _c.nx + (vel.z - (b.vz || 0)) * _c.nz);
    const d = Math.min(_c.depth, 0.5);
    pos.x += _c.nx * d; pos.z += _c.nz * d;
    if (closing > 0) { const k = 1 + (o.restitution ?? 0.1); vel.x += _c.nx * closing * k; vel.z += _c.nz * closing * k; }
    if (!best || closing > best.speed) best = { speed: Math.max(0, closing), other: b, nx: _c.nx, nz: _c.nz, depth: _c.depth, x: _c.x, z: _c.z };
  }
  return best;
}
export function contactDamage(speed) {
  if (speed < 1) return { band: 'nudge', amount: 0 };
  if (speed < 3) return { band: 'bump', amount: 0.03 * speed };
  if (speed < 7) return { band: 'damage', amount: 0.12 * speed };
  return { band: 'crash', amount: 9 };
}
