// SEAWORLD: the lived-in world as something you bump into and stand on (pure: no THREE; node-testable).
//
// What a soldier or a vehicle meets (ground.js GR asks this module through three small hooks):
//   colliders: houses, cottages, terraces, the church (nave, porch, chancel, tower, churchyard wall), filling station
//     kiosk and canopy posts, barns, Dutch-barn posts, silos, boat sheds, garages, sheds, lighthouses with the
//     keeper's cottage, radio masts and their huts, phone and post boxes, bus shelters, memorials, parked cars,
//     tractors, wood piles, garden trees, power poles, stone field walls and hedges (with their gate gap), bridge
//     parapets. Boxes { x, z, yaw, hl, hw, y0, y1 } (ground.js pushBox convention) and circles { x, z, r, y0, y1 };
//     walls and hedges carry soft: true (a tank may push through them: GR.collide skips soft ones for o.crush).
//   floors: timber piers and jetties (the deck and the T head) and BRIDGE DECKS (net.js roadAt().y: bridges are not
//     in the terrain), for anyone at or above them; underneath, a swimmer or a boat still has the sea.
//   surfaces: tarmac roads (and town squares, quays) are 'road', dirt tracks 'dirt'.
// The same seeded generators the world worker builds the meshes from (chunkgen.chunkContent, layout.zoneItems) give
// the footprints, so what you see is what you hit. Per 400 m chunk, built the first time something comes near it
// (10-40 ms for a town chunk, once) and kept in a 16 m grid.
import { chunkContent, CHUNK } from './chunkgen.js';
import { roadAt, roadById } from './net.js';
import { polesOf } from './layout.js';
import { rng } from './rng.js';
import { BOUND } from '../world.js';
import { roomParts, floorHere, ENTERABLE, KEEP } from '../interiors/roomsolid.js';
import { DOORS } from '../interiors/doors.js';   // ngc/interiors: enterable buildings
import { DAMAGE } from './damage.js';   // ngc/world-polish: a destroyed building is its rubble
import { BUILDINGS, bldKey } from './chunkgen.js';
import { bldDims } from './townkit.js';

// ngc/interiors: an enterable building is its rooms (walls with door gaps, furniture, live door leaves, floors and
// stairs: interiors/rooms.js), plus whatever of its old solid stays outside them (the church tower, the canopy posts)
function roomItem(it, hf, parts, floors, rooms) {
  if (KEEP[it.t]) { const tmp = []; itemParts(it, hf, tmp); tmp.forEach((p, i) => { if (KEEP[it.t](i)) parts.push(p); }); }
  const P = roomParts(it, hf, parts, floors); if (P) rooms.push({ it, P });
  else if (!KEEP[it.t]) itemParts(it, hf, parts);   // ngc/world-polish: enterable in name only (no plan): its plain box
}
// ngc/world-polish: one item, whatever it is (a destroyed building: a low heap of rubble that tanks push through)
function anyItem(it, hf, parts, floors, rooms) {
  if (BUILDINGS.has(it.t) && DAMAGE.dead(bldKey(it))) {
    const D = bldDims(it), c = Math.cos(it.yaw || 0), s = Math.sin(it.yaw || 0), dz = D.dz || 0;
    parts.push({ x: it.x + s * dz, z: it.z + c * dz, yaw: it.yaw || 0, hw: D.w * 0.42, hl: D.d * 0.42, y0: it.y - (it.drop || 0) - 0.3, y1: it.y + 0.9, t: 'rubble', soft: true });
    return;
  }
  if (it.t === 'quay' || it.t === 'jetty') pierFloors(it, floors); else if (ENTERABLE.has(it.t)) roomItem(it, hf, parts, floors, rooms); else itemParts(it, hf, parts);
}

const GRID = 16, LIFT = { tarmac: 0.14, lane: 0.13, street: 0.12, dirt: 0.10 };
const kOf = (i, j) => i * 100003 + j;

// one item -> its solid parts (local frame of the item: u along its x, v along its z, front +v)
function itemParts(it, hf, out) {
  const y = it.ground || it.y === 0 && it.t !== 'field' ? hf(it.x, it.z) : it.y, y0 = y - (it.drop || 0) - 0.3;
  const c = Math.cos(it.yaw || 0), s = Math.sin(it.yaw || 0);
  const box = (u, v, w, d, h, extra) => out.push({ x: it.x + c * u + s * v, z: it.z - s * u + c * v, yaw: it.yaw || 0, hw: w / 2, hl: d / 2, y0, y1: y + h, t: it.t, ...extra });
  const circ = (u, v, r, h) => out.push({ x: it.x + c * u + s * v, z: it.z - s * u + c * v, r, y0, y1: y + h, t: it.t });
  switch (it.t) {
    case 'house': box(0, 0, it.w, it.d, it.floors * 2.8 + it.d * 0.6); break;
    case 'cottage': box(0, 0, it.w, it.d, 2.6 + it.d * 0.72); break;
    case 'terrace': box(0, 0, it.w, it.d, it.floors * 3 + it.d * 0.45); break;
    case 'hall': box(0, 0, it.w, it.d, 3.6 + it.d * 0.4); break;
    case 'church': {
      box(0, 0, 20, 9, 12); box(-2, 4.5 + 1.6, 3.4, 3.2, 4.8); box(-13, 0, 6, 6.5, 8.5); box(12.5, 0, 5.5, 5.5, 30);
      const yw = 36, yd = 23;   // the churchyard's low wall (all round, as drawn)
      box(0, yd / 2, yw, 0.5, 0.9, { soft: true }); box(0, -yd / 2, yw, 0.5, 0.9, { soft: true });
      out.push({ x: it.x + c * yw / 2, z: it.z - s * yw / 2, yaw: it.yaw + Math.PI / 2, hw: yd / 2, hl: 0.25, y0, y1: y + 0.9, t: 'wall', soft: true });
      out.push({ x: it.x - c * yw / 2, z: it.z + s * yw / 2, yaw: it.yaw + Math.PI / 2, hw: yd / 2, hl: 0.25, y0, y1: y + 0.9, t: 'wall', soft: true });
      break;
    }
    case 'petrol': box(0, -3.5, 7.4, 5.4, 3.5); for (const [u, v] of [[-4, 2], [4, 2], [-4, 5], [4, 5]]) circ(u, v, 0.18, 4.4); circ(7, 5.5, 0.15, 7); break;
    case 'barn': box(0, 0, it.w, it.d, (it.h || 5.5) + it.d * 0.32); break;
    case 'openshed': for (let i = 0; i <= 3; i++) for (const sd of [-1, 1]) box(-it.w / 2 + i * it.w / 3, sd * it.d / 2, 0.3, 0.3, 4.5); break;
    case 'silo': circ(0, 0, 2.3, 12.6); break;
    case 'boatshed': box(0, 0, 6, 10, 5.2); break;
    case 'garage': box(0, 0, 3.4, 5.7, 2.7); break;
    case 'shed': box(0, 0, 2.2, 2.6, 2.5); break;
    case 'lighthouse': circ(0, 0, 2.6, (it.h || 18) + 4); box(5.5, 0, 6, 5, 6.2); break;
    case 'mast': box(0, 0, 3, 3, it.h || 70); box(7, 4, 4.3, 3.3, 2.8); break;
    case 'phone': box(0, 0, 1.05, 1.05, 2.7); break;
    case 'post': circ(0, 0, 0.3, 1.5); break;
    case 'shelter': box(0, -0.7, 3, 0.15, 2.4); box(-1.5, 0, 0.12, 1.4, 2.4); box(1.5, 0, 0.12, 1.4, 2.4); break;
    case 'memorial': box(0, 0, 1.6, 1.6, 4); break;
    case 'car': box(0, 0, 1.7, 4.3, 1.45); break;
    case 'tractor': box(0, 0, 1.6, 3.6, 2.9); break;
    case 'woodpile': box(0, 0, 2.2, 0.9, 1.2); break;
    case 'lamp': circ(0, 0, 0.14, 6.5); break;
    // ---- ngc/world-polish
    case 'school': box(0, -it.d / 2 + 4, it.w, 8, 4.2 + 3); for (const sd of [-1, 1]) { box(sd * (it.w / 2 - 1.6), -it.d / 2 + 9.1, 2.4, 2.2, 3.5); box(sd * (it.w / 2 - 0.15), 0, 0.1, it.d - 0.4, 1.1, { soft: true }); box(sd * (it.w / 4 + 0.7), it.d / 2 - 0.15, it.w / 2 - 1.6, 0.06, 1.15, { soft: true }); } break;
    case 'chapel': box(0, -1, it.w, it.d - 2, 6.2 + it.w * 0.42); break;
    case 'vhall': box(0, 0, it.w, it.d, 3.6 + it.d * 0.4); break;
    case 'parlour': box(0, 0, it.w, it.d, 4.1); circ(-it.w / 2 - 1.6, 0, 1.1, 6.4); break;
    case 'office': box(0, 0, 3.6, 3.0, 3.5); break;
    case 'pcar': box(0, 0, 1.7, it.kind === 'mini' ? 3.05 : it.kind === 'van' ? 4.5 : 4.3, it.kind === 'van' ? 2.05 : 1.42); break;
    case 'landrover': box(0, 0, 1.7, 4.4, 2.1); break;
    case 'trailer': box(0, 0.4, 2.2, 4.4, 1.5); break;
    case 'picnic': box(0, 0, 1.8, 1.6, 0.75); break;
    case 'psign': case 'bin': circ(0, 0, 0.12, 2.4); break;
    case 'crane': circ(0, 0, 0.25, 3.6); break;
    case 'fueltank': box(0, 0, 1.4, 2.8, 2.3); break;
    case 'fishbox': box(0.85, 0.3, 2.5, 1.2, 0.65); break;
    case 'trough': box(0, 0, 2.4, 0.7, 0.65); break;
    case 'churns': box(0, 0, 1.6, 1.0, 1.8); break;
    case 'balestack': box(1.6, 0.25, 4.2, 1.0, 1.7); break;
    case 'hboat': box(0, 0, (it.L || 4.2) * 0.38, it.L || 4.2, 0.9); break;
    case 'tree': circ(0, 0, 0.35 * (it.s || 1), 6); break;
    case 'field': fieldWalls(it, hf, out); break;
  }
}
// a field's walls / hedges, segment by segment, with the gate gap where chunkgen.js field() leaves it
function fieldWalls(it, hf, out) {
  const r = rng(it.seed); r();   // field(): tint = r() first, then the gate side
  const gap = r.int(0, 3), hedge = it.wall === 'hedge', cy = Math.cos(it.yaw), sy = Math.sin(it.yaw);
  const W = (u, v) => [it.x + cy * u + sy * v, it.z - sy * u + cy * v];
  const sides = [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]];
  sides.forEach(([[ua, va], [ub, vb]], k) => {
    const len = Math.hypot((ub - ua) * it.w / 2, (vb - va) * it.d / 2), n = Math.max(1, Math.round(len / 6));
    for (let q = 0; q < n; q++) {
      if (k === gap && q === Math.floor(n / 2)) { fieldGate(it, hf, out, ua, va, ub, vb, q / n, (q + 1) / n); continue; }
      const t0 = q / n, t1 = (q + 1) / n;
      const [x0, z0] = W((ua + (ub - ua) * t0) * (it.w / 2 + 1), (va + (vb - va) * t0) * (it.d / 2 + 1)), [x1, z1] = W((ua + (ub - ua) * t1) * (it.w / 2 + 1), (va + (vb - va) * t1) * (it.d / 2 + 1));
      const h0 = hf(x0, z0), h1 = hf(x1, z1), l = Math.hypot(x1 - x0, z1 - z0) || 1;
      // a box along the segment: its local z runs along it (pushBox frame: lz = dx sin + dz cos)
      out.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, yaw: Math.atan2(x1 - x0, z1 - z0), hw: hedge ? 0.6 : 0.3, hl: l / 2, y0: Math.min(h0, h1) - 0.3, y1: Math.max(h0, h1) + (hedge ? 1.7 : 0.95), t: hedge ? 'hedge' : 'wall', soft: true });
    }
  });
}
// ngc/interiors: a five-bar gate hung in the field's gap (doors.js 'gate': F opens it; a tank goes through it)
function fieldGate(it, hf, out, ua, va, ub, vb, t0, t1) {
  const U = t => (ua + (ub - ua) * t) * (it.w / 2 + 1), V = t => (va + (vb - va) * t) * (it.d / 2 + 1);
  const u0 = U(t0), v0 = V(t0), u1 = U(t1), v1 = V(t1), L = Math.hypot(u1 - u0, v1 - v0), ax = Math.abs(u1 - u0) > Math.abs(v1 - v0) ? 'u' : 'v';
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2, c = Math.cos(it.yaw || 0), s = Math.sin(it.yaw || 0), gy = hf(it.x + c * um + s * vm, it.z - s * um + c * vm);
  const d = { u: um, v: vm, y: 0, w: Math.min(L - 0.2, 3.6), h: 1.15, ax, hinge: -1, swing: 1, kind: 'gate', c: 0xc8c0a8, gate: true };
  const host = { toWorld: (u, v, o) => { o[0] = it.x + c * u + s * v; o[1] = it.z - s * u + c * v; return o; }, yaw: () => it.yaw || 0, y0: () => gy };
  const D = DOORS.register('gate:' + (it.seed | 0) + ':' + Math.round(it.x) + ':' + Math.round(it.z), d, host);
  D.part.soft = true; out.push(D.part);
}
// the piers of a quay or a jetty: floors (rectangles in the item frame at a height)
function pierFloors(it, out) {
  const z0 = it.t === 'quay' ? 7.5 : 0, top = it.y + 0.15;
  out.push({ x: it.x, z: it.z, c: Math.cos(it.yaw), s: Math.sin(it.yaw), u0: -1.5, u1: 1.5, v0: z0 - 0.5, v1: z0 + it.len, y: top });
  out.push({ x: it.x, z: it.z, c: Math.cos(it.yaw), s: Math.sin(it.yaw), u0: -3.5, u1: 3.5, v0: z0 + it.len, v1: z0 + it.len + 3, y: top });
}
// bridge parapets along a road's bridge segments i0..i1 (chunkgen roadRibbons: from hw + 0.05 to hw + 0.4, 1 m high)
function parapets(R, idx, out) {
  const lift = LIFT[R.type] || 0.12;
  for (const i of idx) {
    if (!R.br[i] || i + 1 >= R.xs.length) continue;
    const ax = R.xs[i], az = R.zs[i], bx = R.xs[i + 1], bz = R.zs[i + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
    const y = Math.min(R.ys[i], R.ys[i + 1]) + lift, yt = Math.max(R.ys[i], R.ys[i + 1]) + lift + 1.0;
    for (const sd of [1, -1]) {
      const o = sd * (R.hw + 0.22);
      out.push({ x: (ax + bx) / 2 + nx * o, z: (az + bz) / 2 + nz * o, yaw: Math.atan2(dx, dz), hw: 0.2, hl: l / 2 + 0.1, y0: y - 1.1, y1: yt, t: 'parapet' });
    }
  }
}

// ctx: { hf (islandH: what the worker builds the wild lands on), zone: () => [{ items, roads }] (life.js world.zone),
//        zoneHf (main.js terrainH) }
export function createWorldSolid(ctx) {
  const chunks = new Map();
  const inZoneChunk = (i, j) => Math.max(Math.abs((i + 0.5) * CHUNK), Math.abs((j + 0.5) * CHUNK)) < BOUND + 300 - CHUNK * 0.5;   // life.js: the zone is built at start
  let zoneSolid = null;
  function zone() {
    if (zoneSolid) return zoneSolid;
    const parts = [], floors = [], rooms = [];
    for (const e of (ctx.zone ? ctx.zone() : [])) {
      for (const it of e.items) anyItem(it, ctx.zoneHf || ctx.hf, parts, floors, rooms);
      for (const id of e.roads || []) { const R = roadById(id); if (R) parapets(R, R.xs.map((_, i) => i), parts); }
    }
    return (zoneSolid = index(parts, floors, rooms));
  }
  function index(parts, floors, rooms = []) {
    const grid = new Map();
    for (const p of parts) {
      const rr = p.r || Math.hypot(p.hw, p.hl);
      for (let j = Math.floor((p.z - rr) / GRID); j <= Math.floor((p.z + rr) / GRID); j++) for (let i = Math.floor((p.x - rr) / GRID); i <= Math.floor((p.x + rr) / GRID); i++) {
        const k = kOf(i, j); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(p);
      }
    }
    return { grid, floors, rooms, gates: parts.filter(p => p.D && p.D.d.gate).map(p => p.D), n: parts.length };
  }
  function chunk(i, j) {
    const k = kOf(i, j); let c = chunks.get(k); if (c) return c;
    if (inZoneChunk(i, j)) { c = zone(); chunks.set(k, c); return c; }
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const content = chunkContent(i, j, ctx.hf), parts = [], floors = [], rooms = [];
    for (const it of content.items) anyItem(it, ctx.hf, parts, floors, rooms);
    for (const [R, idx] of content.roads) {
      parapets(R, idx, parts);
      for (const p of polesOf(R)) if (p.x >= content.x0 && p.x < content.x1 && p.z >= content.z0 && p.z < content.z1) { const y = ctx.hf(p.x, p.z); parts.push({ x: p.x, z: p.z, r: 0.2, y0: y - 0.5, y1: y + 9, t: 'pole' }); }
    }
    c = index(parts, floors, rooms); c.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    chunks.set(k, c); S.stats.chunks++; S.stats.ms += c.ms;
    if (chunks.size > 64) for (const [kk] of chunks) { chunks.delete(kk); if (chunks.size <= 48) break; }   // forget the oldest
    return c;
  }
  // ngc/world-polish: a building knocked down - its chunk's colliders (and rooms) are built again from the rubble
  DAMAGE.onChange((b, cond) => {
    if (cond !== 'destroyed') return;
    const i = Math.floor(b.x / CHUNK), j = Math.floor(b.z / CHUNK);
    if (inZoneChunk(i, j)) { for (const [k, c] of chunks) if (c === zoneSolid) chunks.delete(k); zoneSolid = null; }
    else chunks.delete(kOf(i, j));
  });
  const _seen = new Set(), _list = [], _rooms = [], _rseen = new Set(), _gates = [];
  const S = {
    stats: { chunks: 0, ms: 0 },
    // every solid part whose grid cell is within r of (x, z) (a reused array: don't keep it)
    near(x, z, r = 3) {
      _list.length = 0; _seen.clear();
      for (let j = Math.floor((z - r) / GRID); j <= Math.floor((z + r) / GRID); j++) for (let i = Math.floor((x - r) / GRID); i <= Math.floor((x + r) / GRID); i++) {
        const c = chunk(Math.floor(i * GRID / CHUNK), Math.floor(j * GRID / CHUNK)), a = c.grid.get(kOf(i, j)); if (!a) continue;
        for (const p of a) if (!_seen.has(p)) { _seen.add(p); _list.push(p); }
      }
      return _list;
    },
    // the floor at (x, z) for something at height y: a pier or bridge deck it is on or above (within `step` up), else null
    floor(x, z, y, step = 0.45) {
      let best = null;
      const c = chunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
      for (const f of c.floors) {   // ngc/interiors: floorHere also reads the stairs (ramps)
        const fy = floorHere(f, x, z);
        if (fy !== null && fy <= y + step && (best === null || fy > best)) best = fy;
      }
      const R = roadAt(x, z);
      if (R && R.bridge) { const top = R.y + (LIFT[R.type] || 0.12); if (top <= y + step && (best === null || top > best)) best = top; }
      return best;
    },
    // ngc/interiors: on a building's stairs (a ramp floor) at height y?
    stairAt(x, z, y) {
      const c = chunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
      for (const f of c.floors) { if (!f.ry) continue; const fy = floorHere(f, x, z); if (fy !== null && Math.abs(fy - y) < 0.35) return true; }
      return false;
    },
    // surface name of a road under (x, z), or null
    surface(x, z) { const R = roadAt(x, z); return R ? (R.surface === 'dirt' ? 'dirt' : 'road') : null; },
    chunkAt: (x, z) => chunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK)),
    // ngc/interiors: field gates within r of (x, z) (doors.js doors; a reused array)
    gatesNear(x, z, r = 60) {
      _gates.length = 0;
      for (let j = Math.floor((z - r) / CHUNK); j <= Math.floor((z + r) / CHUNK); j++) for (let i = Math.floor((x - r) / CHUNK); i <= Math.floor((x + r) / CHUNK); i++) for (const D of chunk(i, j).gates) if (Math.abs(D.cx - x) < r && Math.abs(D.cz - z) < r && !_gates.includes(D)) _gates.push(D);
      return _gates;
    },
    // ngc/interiors: the enterable buildings within r of (x, z): [{ it, P }] (a reused array)
    roomsNear(x, z, r = 60) {
      _rooms.length = 0; _rseen.clear();
      for (let j = Math.floor((z - r) / CHUNK); j <= Math.floor((z + r) / CHUNK); j++) for (let i = Math.floor((x - r) / CHUNK); i <= Math.floor((x + r) / CHUNK); i++) {
        for (const R of chunk(i, j).rooms) { if (_rseen.has(R) || Math.abs(R.it.x - x) > r || Math.abs(R.it.z - z) > r) continue; _rseen.add(R); _rooms.push(R); }
      }
      return _rooms;
    },
  };
  return S;
}
