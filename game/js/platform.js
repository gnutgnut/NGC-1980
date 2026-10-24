// FOUNDATION: platform-relative motion - how anything standing or parked on a ship deck (a soldier, a jeep, a parked
// Hornet) is carried along while the ship sails, turns, heaves, pitches and rolls in a seaway, and (the SKY CARRIER)
// climbs or descends.
// Pure: no THREE. A ship is any object with p {x, y, z} and yaw (the war.js units; forward = (-sin yaw, -cos yaw)) and,
// for NAVAL's moving ships, att { heave, pitch, roll } (war.js placeShip: mesh at p + heave, Euler(pitch, yaw, roll,
// 'YXZ'); seamotion.js shipPointY uses the same frame).
//
//   const PF = createPlatforms({ deckY(x, z), shipAt(x, z), alive(u) });
//   PF.carry(o)            before a step: move o = { x, y, z, yaw, plat, loc } with its ship since the last frame;
//                          o.carried = { dx, dy, dz, dyaw } says how far it went (null when not on a ship)
//   PF.settle(o, onGround) after a step: attach o to the ship whose deck it stands on (or keep the one it jumped from)
//   PF.toLocal(u, x, z) -> [lx, lz]     PF.toWorld(u, lx, lz, out) -> out {x, z}         (plan view, yaw only)
//   PF.toShip(u, x, y, z, out) -> out {x, y, z}   PF.fromShip(u, lx, ly, lz, out) -> out  (the full ship frame:
//                          x starboard, y up from the waterline, z aft; heave, pitch and roll included)
//
// Kinematic carrying (rather than friction against a moving deck) makes a parked or standing thing stay exactly on its
// deck spot at any frame rate and any ship motion; a sim then only has to model motion relative to the deck.
// wave 2 (ngc/foot2): the carried point is held in the FULL ship frame, so a soldier standing 20 m up the island while
// she rolls 2 degrees is swung sideways with it, and the heave / pitch lift is exact (it used to be position + yaw only).
// subY(u, lx, lz) (optional, SEAWORLD): the height of a moving part of ship u's deck at a ship-frame point (a deck-edge
// lift), or null - whoever stands on it is carried up and down with it too
export function createPlatforms({ deckY, shipAt, alive = () => true, subY = null }) {
  const toLocal = (u, x, z) => { const dx = x - u.p.x, dz = z - u.p.z, c = Math.cos(u.yaw), s = Math.sin(u.yaw); return [dx * c - dz * s, dx * s + dz * c]; };
  const toWorld = (u, lx, lz, out = { x: 0, z: 0 }) => { const c = Math.cos(u.yaw), s = Math.sin(u.yaw); out.x = u.p.x + lx * c + lz * s; out.z = u.p.z - lx * s + lz * c; return out; };
  // ship frame <-> world: R = Ry(yaw) Rx(pitch) Rz(roll) about the waterline centre lifted by the heave
  const fromShip = (u, lx, ly, lz, out = { x: 0, y: 0, z: 0 }) => {
    const a = u.att, hv = a ? a.heave : 0, p = a ? a.pitch : 0, r = a ? a.roll : 0;
    const cr = Math.cos(r), sr = Math.sin(r), cp = Math.cos(p), sp = Math.sin(p), cy = Math.cos(u.yaw), sy = Math.sin(u.yaw);
    const x1 = lx * cr - ly * sr, y1 = lx * sr + ly * cr;   // roll about z
    const y2 = y1 * cp - lz * sp, z2 = y1 * sp + lz * cp;    // pitch about x
    out.x = u.p.x + x1 * cy + z2 * sy; out.y = u.p.y + hv + y2; out.z = u.p.z - x1 * sy + z2 * cy;   // yaw about y
    return out;
  };
  const toShip = (u, x, y, z, out = { x: 0, y: 0, z: 0 }) => {
    const a = u.att, hv = a ? a.heave : 0, p = a ? a.pitch : 0, r = a ? a.roll : 0;
    const cr = Math.cos(r), sr = Math.sin(r), cp = Math.cos(p), sp = Math.sin(p), cy = Math.cos(u.yaw), sy = Math.sin(u.yaw);
    const dx = x - u.p.x, dy = y - u.p.y - hv, dz = z - u.p.z;
    const x2 = dx * cy - dz * sy, z2 = dx * sy + dz * cy;      // un-yaw
    const y1 = dy * cp + z2 * sp, z1 = -dy * sp + z2 * cp;      // un-pitch
    out.x = x2 * cr + y1 * sr; out.y = -x2 * sr + y1 * cr; out.z = z1;   // un-roll
    return out;
  };
  const _w = { x: 0, y: 0, z: 0 };
  const PF = { toLocal, toWorld, toShip, fromShip };
  // The ship's motion since the last settle() is added to o (position, height and heading), so anything else that
  // moved o in between - its own sim, a mouse turning a soldier's head, a teleport - is kept, not snapped back.
  PF.carry = o => {
    const u = o.plat, L = o.loc; o.carried = null;
    if (!u || !L || !alive(u)) { o.plat = null; o.loc = null; return; }
    let lift = 0; if (L.ly != null && subY) { const y = subY(u, L.x, L.z); if (y != null) lift = y - L.ly; }   // SEAWORLD: on a lift
    fromShip(u, L.x, L.y + lift, L.z, _w);
    const dx = _w.x - L.wx, dz = _w.z - L.wz, dy = _w.y - L.wy, dyaw = u.yaw - L.syaw;
    o.x += dx; o.z += dz; o.y += dy; o.yaw += dyaw;
    o.carried = { dx, dy, dz, dyaw };
  };
  PF.settle = (o, onGround = true) => {
    const deck = deckY(o.x, o.z, o.y + 0.45);   // ngc/interiors: the deck under him (a hangar deck under the flight deck)
    let ship = deck > -1e8 && onGround && Math.abs(o.y - deck) < 0.6 ? shipAt(o.x, o.z) : null;
    // in the air over the deck it left (a jump, a step off a ledge onto the deck below): stay with that ship, so the
    // jump is relative to the deck
    if (!ship && !onGround && o.plat && alive(o.plat) && deck > -1e8 && o.y > deck - 0.5 && o.y < deck + 8) ship = o.plat;
    if (!ship && o.ladder && o.ladder.ship && alive(o.ladder.ship)) ship = o.ladder.ship;   // on a ship's ladder
    // SEAWORLD: standing hard against something taller on the deck (a parked aircraft's footprint, a lift's edge), the
    // point under him can read its top: he is still on his ship
    if (!ship && onGround && o.plat && alive(o.plat) && deck > o.y + 0.6 && shipAt(o.x, o.z) === o.plat) ship = o.plat;
    o.plat = ship || null;
    if (!ship) { o.loc = null; return; }
    toShip(ship, o.x, o.y, o.z, _w);
    o.loc ||= {}; o.loc.x = _w.x; o.loc.y = _w.y; o.loc.z = _w.z; o.loc.wx = o.x; o.loc.wy = o.y; o.loc.wz = o.z; o.loc.syaw = ship.yaw;
    o.loc.ly = subY ? subY(ship, _w.x, _w.z) : null;
  };
  return PF;
}
