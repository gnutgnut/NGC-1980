// INTERIORS (ngc/interiors): a building's plan (rooms.js) as things to bump into and stand on (pure: no THREE).
// world/solid.js calls roomParts for every enterable item instead of its one solid box: the walls (door gaps, the
// window sills), the furniture, the door leaves (doors.js, live), and floors - the ground floor, the upper floor round
// its stairwell, the stairs as ramps, the front step and the steps down to the street - in solid.js's floor format
// { x, z, c, s, u0, u1, v0, v1, y } plus { ry: [y at the axis' low end, high end], ax } for a ramp.
import { planOf, ENTERABLE } from './rooms.js';
import { DOORS } from './doors.js';

export { ENTERABLE };
// the part of a world item that stays solid outside its rooms (solid.js itemParts keeps these): the church tower and
// churchyard wall, the filling station's canopy posts and sign
export const KEEP = { church: i => i >= 3, petrol: i => i >= 1 };

export function doorHost(it) {
  const c = Math.cos(it.yaw || 0), s = Math.sin(it.yaw || 0);
  return { toWorld: (u, v, out) => { out[0] = it.x + c * u + s * v; out[1] = it.z - s * u + c * v; return out; }, yaw: () => it.yaw || 0, y0: () => it.y };
}
export function roomParts(it, hf, parts, floors, P = planOf(it, hf)) {
  if (!P) return null;
  const c = Math.cos(it.yaw || 0), s = Math.sin(it.yaw || 0), y = it.y, drop = (it.drop || 0) + 0.3;
  const box = (b, extra) => {
    const cu = (b.u0 + b.u1) / 2, cv = (b.v0 + b.v1) / 2;
    parts.push({ x: it.x + c * cu + s * cv, z: it.z - s * cu + c * cv, yaw: it.yaw || 0, hw: (b.u1 - b.u0) / 2, hl: (b.v1 - b.v0) / 2, y0: y + (b.y0 <= -0.29 ? -drop : b.y0), y1: y + b.y1, t: it.t, room: true, ...extra });
  };
  for (const w of P.walls) if (w.u1 - w.u0 > 0.02 && w.v1 - w.v0 > 0.02) box(w);
  for (const b of P.solid) box(b, { furn: true });
  const host = doorHost(it);
  for (const d of P.doors) { const D = DOORS.register(P.key + '#' + d.id, d, host); parts.push(D.part); }
  for (const f of P.floors) floors.push({ x: it.x, z: it.z, c, s, u0: f.u0, u1: f.u1, v0: f.v0, v1: f.v1, y: y + f.y, ry: f.ry ? [y + f.ry[0], y + f.ry[1]] : null, ax: f.ax, room: P });
  return P;
}
// a solid.js floor's height at (x, z) (in its rectangle), or null
export function floorHere(f, x, z) {
  const dx = x - f.x, dz = z - f.z, u = dx * f.c - dz * f.s, v = dx * f.s + dz * f.c;
  if (u < f.u0 || u > f.u1 || v < f.v0 || v > f.v1) return null;
  if (!f.ry) return f.y;
  const t = f.ax === 'v' ? (v - f.v0) / (f.v1 - f.v0) : (u - f.u0) / (f.u1 - f.u0);
  return f.ry[0] + (f.ry[1] - f.ry[0]) * t;
}
