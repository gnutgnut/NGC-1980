// The lived-in world's skeleton: settlements, the road network, farms and their fields. Pure maths (no THREE, no DOM),
// seeded by position, generated lazily cell by cell and cached, so the main thread (physics, traffic), the terrain
// worker (road beds in the heightmap, clearings in the forest) and the world worker (geometry) all build exactly the
// same world independently.
//
//   Wild lands (outside the control zone): one settlement candidate per 1.6 km cell (hamlet / village / town, harbour
//   towns on the coast), joined by roads (a relaxed relative-neighbourhood graph), farms every few hundred metres with
//   dirt tracks to the nearest road and walled fields round them.
//   Control zone: hand-placed rules on the big islands (a village, a road from the pad, a harbour) - see zoneNet().
//
// Roads are routed by dynamic programming down a corridor between their ends (slope, water and length costs), smoothed,
// given a grade-limited height profile, and flattened into the terrain (roadBed) except where they bridge water or a
// deep valley. world.js applies roadBed() inside islandH(), so the physics height, the terrain bake and the road
// ribbons agree to the centimetre.
import { rawH, BOUND, ISLANDS, forestAt } from '../world.js';
import { beachesOf } from './terrain.js';   // TERRAIN (wave 3): the landing beaches are kept clear of villages and cottages
import { hash2, rng } from './rng.js';
import { townItems, farmItems } from './layout.js';   // lots and farm buildings (their platforms are part of the ground)

export const CELL = 1600, FARM_CELL = 420, BKT = 64;
const SH_MAX = 18, FLAT = 1.6;                       // shoulder blend (max) and flat strip past the paved edge
export const ROAD = {                                 // half widths (m), max grade, surface
  tarmac: { hw: 3.3, g: 0.085, surface: 'tarmac' },
  lane: { hw: 2.6, g: 0.10, surface: 'tarmac' },
  street: { hw: 2.9, g: 0.12, surface: 'tarmac' },
  dirt: { hw: 1.8, g: 0.14, surface: 'dirt' },
};
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const cheb = (x, z) => Math.max(Math.abs(x), Math.abs(z));
const ckey = (i, j) => (i + 32768) * 65536 + (j + 32768);

// ------------------------------------------------------------------------------------------- state (per thread)
const S = {
  sett: new Map(),     // cell -> settlement | null
  owned: new Set(),    // cells whose settlement's edges are routed (L1)
  roadsOk: new Set(),  // cells all of whose through-roads are known (L2)
  towns: new Set(),    // settlement ids whose streets are laid out
  farms: new Map(),    // farm cell -> farm | null
  ready: new Set(),    // cells fully known (roads, streets, farm tracks) (L3)
  edges: new Map(),    // edge key -> road | null
  buckets: new Map(),  // 64 m bucket -> [segment]
  fbk: new Map(),      // 64 m bucket -> [field / yard / town disc] (clearings)
  pads: new Map(),     // 64 m bucket -> [building platform]
  roads: [], nodes: new Map(), zone: false, gen: 0,
};
export const netState = S;

// ------------------------------------------------------------------------------------------- spatial index
function bucketAdd(map, x0, z0, x1, z1, item) {
  const i0 = Math.floor(x0 / BKT), i1 = Math.floor(x1 / BKT), j0 = Math.floor(z0 / BKT), j1 = Math.floor(z1 / BKT);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = ckey(i, j); let a = map.get(k); if (!a) map.set(k, a = []); a.push(item); }
}
function addRoad(r) {
  r.id = S.roads.length; S.roads.push(r); S.gen++;
  const { xs, zs, ys, br, hw } = r, n = xs.length;
  r.segs = [];
  for (let i = 0; i < n - 1; i++) {
    const s = { r, i, ax: xs[i], az: zs[i], ay: ys[i], bx: xs[i + 1], bz: zs[i + 1], by: ys[i + 1], hw, br: br[i] };
    const pad = hw + FLAT + SH_MAX;
    bucketAdd(S.buckets, Math.min(s.ax, s.bx) - pad, Math.min(s.az, s.bz) - pad, Math.max(s.ax, s.bx) + pad, Math.max(s.az, s.bz) + pad, s);
    r.segs.push(s);
  }
  // arc length
  r.s = new Float32Array(n); for (let i = 1; i < n; i++) r.s[i] = r.s[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  r.len = r.s[n - 1]; r.junctions = r.junctions || [];
  return r;
}
// a flat disc (town square, quay, farmyard) flattened into the terrain at height y
function addDisc(x, z, y, rad, kind) {
  const s = { r: null, disc: true, ax: x, az: z, ay: y, bx: x, bz: z, by: y, hw: rad, br: 0, kind };
  const pad = rad + FLAT + SH_MAX; bucketAdd(S.buckets, x - pad, z - pad, x + pad, z + pad, s); return s;
}
function addClear(item) { bucketAdd(S.fbk, item.x0, item.z0, item.x1, item.z1, item); }
function node(id, x, z, y) { let n = S.nodes.get(id); if (!n) S.nodes.set(id, n = { id, x, z, y, roads: [] }); return n; }

// ------------------------------------------------------------------------------------------- routing
// DP down a corridor from a to b: stations every ds metres, lateral offsets in `step` metre steps, cost = length with
// grade and water penalties. Returns a smoothed polyline resampled every `res` metres.
function route(ax, az, bx, bz, o = {}) {
  const L = Math.hypot(bx - ax, bz - az); if (L < 1) return null;
  const ds0 = o.ds || 40, step = o.step || 25, gmax = o.g || 0.085, waterCost = o.water ?? 10, res = o.res || 8;
  const n = Math.max(2, Math.ceil(L / ds0)), ds = L / n, dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx;
  const M = Math.max(1, Math.min(Math.floor((o.wmax || 500) / step), Math.floor(0.3 * L / step))), m = 2 * M + 1;
  const H = new Float32Array((n + 1) * m), C = new Float64Array((n + 1) * m).fill(Infinity), P = new Int16Array((n + 1) * m);
  const lim = k => Math.min(M, Math.ceil(Math.min(k, n - k) * ds * 0.9 / step));
  const hf = o.h || rawH;
  for (let k = 0; k <= n; k++) { const l = lim(k); for (let q = M - l; q <= M + l; q++) H[k * m + q] = hf(ax + dx * ds * k + nx * (q - M) * step, az + dz * ds * k + nz * (q - M) * step); }
  C[M] = 0;
  for (let k = 1; k <= n; k++) {
    const l = lim(k), lp = lim(k - 1);
    for (let q = M - l; q <= M + l; q++) {
      const h1 = H[k * m + q]; let best = Infinity, bp = 0;
      for (let d = -2; d <= 2; d++) {
        const p = q + d; if (p < M - lp || p > M + lp) continue;
        const c0 = C[(k - 1) * m + p]; if (c0 === Infinity) continue;
        const h0 = H[(k - 1) * m + p], sl = Math.hypot(ds, d * step), g = Math.abs(h1 - h0) / sl;
        let c = sl * (1 + 3 * g + 500 * Math.max(0, g - gmax) ** 2) + Math.abs(d) * 3 + Math.abs(q - M) * step * 0.004 * sl;
        if (h0 < 0.6 || h1 < 0.6) c += sl * waterCost * (1 + Math.max(0, -Math.min(h0, h1)) * 0.12);
        if (c0 + c < best) { best = c0 + c; bp = p; }
      }
      C[k * m + q] = best; P[k * m + q] = bp;
    }
  }
  if (C[n * m + M] === Infinity) return null;
  let pts = []; for (let k = n, q = M; k >= 0; k--) { pts.push([ax + dx * ds * k + nx * (q - M) * step, az + dz * ds * k + nz * (q - M) * step]); q = P[k * m + q]; }
  pts.reverse();
  for (let it = 0; it < (o.smooth ?? 3); it++) {   // Chaikin, ends kept
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[i + 1]; if (i > 0) out.push([x0 * 0.75 + x1 * 0.25, z0 * 0.75 + z1 * 0.25]); if (i < pts.length - 2) out.push([x0 * 0.25 + x1 * 0.75, z0 * 0.25 + z1 * 0.75]); }
    out.push(pts[pts.length - 1]); pts = out;
  }
  return resample(pts, res);
}
function resample(pts, res) {
  const out = [pts[0]]; let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let [x0, z0] = pts[i - 1]; const [x1, z1] = pts[i]; let d = Math.hypot(x1 - x0, z1 - z0);
    while (acc + d >= res) { const t = (res - acc) / d; x0 += (x1 - x0) * t; z0 += (z1 - z0) * t; out.push([x0, z0]); d = Math.hypot(x1 - x0, z1 - z0); acc = 0; }
    acc += d;
  }
  const last = pts[pts.length - 1], pl = out[out.length - 1];
  if (Math.hypot(last[0] - pl[0], last[1] - pl[1]) < res * 0.4 && out.length > 1) out[out.length - 1] = last; else out.push(last);
  return out;
}
// height profile: smoothed terrain, grade-limited, ends pinned; bridges over water and deep valleys, causeways over
// short shallow water. Returns null if the road would need a bridge longer than maxBridge.
function profile(pts, type, y0, y1, o = {}) {
  const n = pts.length, T = ROAD[type], hf = o.h || rawH, xs = new Float32Array(n), zs = new Float32Array(n), ys = new Float32Array(n), raw = new Float32Array(n), br = new Uint8Array(n);
  for (let i = 0; i < n; i++) { xs[i] = pts[i][0]; zs[i] = pts[i][1]; raw[i] = hf(xs[i], zs[i]); }
  const W = 3, tmp = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - W); k <= Math.min(n - 1, i + W); k++) { s += Math.max(raw[k], 1.4); c++; } tmp[i] = s / c; }
  // short shallow water (< 44 m, > -3.5 m) is crossed on a causeway; longer water needs a bridge with 4.5 m clearance
  for (let i = 0; i < n;) {
    if (raw[i] >= 0.4) { i++; continue; }
    let j = i, deep = 0; while (j < n - 1 && raw[j + 1] < 0.4) j++; for (let k = i; k <= j; k++) deep = Math.min(deep, raw[k]);
    const causeway = (j - i + 2) * 8 <= 44 && deep > -3.5;
    for (let k = i; k <= j; k++) tmp[k] = Math.max(tmp[k], causeway ? 1.6 : 4.5);
    i = j + 1;
  }
  for (let i = 0; i < n; i++) ys[i] = tmp[i];
  // pinned ends: town squares, quays and farmyards are flat, so the road is level with them inside their radius
  const seg = i => Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  const pin = () => {
    if (y0 !== undefined) for (let i = 0; i < n && Math.hypot(xs[i] - xs[0], zs[i] - zs[0]) <= (o.pin0 || 0) + 0.01; i++) ys[i] = y0;
    if (y1 !== undefined) for (let i = n - 1; i >= 0 && Math.hypot(xs[i] - xs[n - 1], zs[i] - zs[n - 1]) <= (o.pin1 || 0) + 0.01; i--) ys[i] = y1;
  };
  pin();
  const fixed = new Uint8Array(n); for (let i = 0; i < n; i++) fixed[i] = (y0 !== undefined && Math.hypot(xs[i] - xs[0], zs[i] - zs[0]) <= (o.pin0 || 0) + 0.01) || (y1 !== undefined && Math.hypot(xs[i] - xs[n - 1], zs[i] - zs[n - 1]) <= (o.pin1 || 0) + 0.01) ? 1 : 0;
  for (let pass = 0; pass < 4; pass++) {   // grade limit (pinned samples stay put, the rest give way)
    for (let i = 1; i < n; i++) if (!fixed[i]) { const d = T.g * seg(i); ys[i] = Math.min(ys[i - 1] + d, Math.max(ys[i - 1] - d, ys[i])); }
    for (let i = n - 2; i >= 0; i--) if (!fixed[i]) { const d = T.g * seg(i + 1); ys[i] = Math.min(ys[i + 1] + d, Math.max(ys[i + 1] - d, ys[i])); }
  }
  // spans: water deeper / longer than a causeway, or fill higher than 5 m for more than 60 m, become bridges
  for (let i = 0; i < n;) {
    const bad = k => (raw[k] < 0.4 && ys[k] > 3) || ys[k] - raw[k] > 5;
    if (!bad(i)) { i++; continue; }
    let j = i; while (j < n - 1 && bad(j + 1)) j++;
    const a = Math.max(0, i - 1), b = Math.min(n - 1, j + 1);
    let len = 0, water = false; for (let k = a + 1; k <= b; k++) len += seg(k); for (let k = i; k <= j; k++) if (raw[k] < 0.4) water = true;
    if (water || len > 60) { if (len > (o.maxBridge ?? 420)) return null; for (let k = a; k < b; k++) br[k] = 1; }
    i = j + 1;
  }
  return { xs, zs, ys, br, type, hw: o.hw ?? T.hw, surface: T.surface };
}

// ------------------------------------------------------------------------------------------- settlements (wild)
const SIZES = { hamlet: { R: 70, w: 0.34 }, village: { R: 135, w: 0.44 }, town: { R: 210, w: 0.22 } };
export function settlementOf(ci, cj) {
  const k = ckey(ci, cj); if (S.sett.has(k)) return S.sett.get(k);
  let out = null;
  const cx = (ci + 0.5) * CELL, cz = (cj + 0.5) * CELL;
  if (cheb(cx, cz) > BOUND + 900 && hash2(ci, cj, 5) < 0.78) {
    const r = rng(ci * 7919 + cj * 104729 + 11); let best = null;
    for (let t = 0; t < 7; t++) {
      const x = (ci + 0.12 + 0.76 * r()) * CELL, z = (cj + 0.12 + 0.76 * r()) * CELL;
      if (cheb(x, z) < BOUND + 520) continue;
      const h = rawH(x, z); if (h < 3.5 || h > 170) continue;
      let rough = 0, land = 0, sea = null;
      for (let a = 0; a < 8; a++) {
        const ca = Math.cos(a * Math.PI / 4), sa = Math.sin(a * Math.PI / 4);
        const h1 = rawH(x + ca * 60, z + sa * 60), h2 = rawH(x + ca * 140, z + sa * 140);
        rough = Math.max(rough, Math.abs(h1 - h), Math.abs(h2 - h) * 0.5); if (h2 > 1) land++;
        if (!sea) for (const d of [180, 260, 340]) if (rawH(x + ca * d, z + sa * d) < -1.5) { sea = { a: a * Math.PI / 4, d }; break; }
      }
      if (rough > 13 || land < 5) continue;
      const score = rough + (sea ? -6 : 0) + h * 0.02 + r() * 3;
      if (!best || score < best.score) best = { x, z, y: h, sea, score };
    }
    if (best) {
      const u = r(); const size = u < SIZES.hamlet.w ? 'hamlet' : u < SIZES.hamlet.w + SIZES.village.w ? 'village' : 'town';
      out = { id: `s${ci}_${cj}`, ci, cj, x: best.x, z: best.z, y: best.y, size, R: SIZES[size].R, coast: best.sea, seed: (ci * 92821 + cj * 68917) | 0 };
    }
  }
  S.sett.set(k, out); return out;
}
function settNear(ci, cj, rad) { const a = []; for (let j = cj - rad; j <= cj + rad; j++) for (let i = ci - rad; i <= ci + rad; i++) { const s = settlementOf(i, j); if (s) a.push(s); } return a; }
export const plazaR = s => s.size === 'hamlet' ? 7 : s.size === 'village' ? 12 : 16;
const roadType = (a, b) => a.size === 'hamlet' && b.size === 'hamlet' ? 'dirt' : a.size === 'hamlet' || b.size === 'hamlet' ? 'lane' : 'tarmac';
// L1: route the edges whose lower-id end is this cell's settlement
function ownEdges(ci, cj) {
  const k = ckey(ci, cj); if (S.owned.has(k)) return; S.owned.add(k);
  const A = settlementOf(ci, cj); if (!A) return;
  const near = settNear(ci, cj, 3);
  for (const B of near) {
    if (B === A) continue; const dAB = Math.hypot(B.x - A.x, B.z - A.z); if (dAB > 4300) continue;
    const ek = A.id < B.id ? A.id + '|' + B.id : B.id + '|' + A.id; if (S.edges.has(ek)) continue;
    // relaxed relative-neighbourhood test (the same answer from both ends: the witnesses come from both neighbourhoods)
    let blocked = false;
    for (const C of near.concat(settNear(B.ci, B.cj, 3))) {
      if (C === A || C === B) continue; const dAC = Math.hypot(C.x - A.x, C.z - A.z), dBC = Math.hypot(C.x - B.x, C.z - B.z);
      if (dAC < dAB && dBC < dAB && dAC + dBC < dAB * 1.22) { blocked = true; break; }
    }
    if (blocked) { S.edges.set(ek, null); continue; }
    const [P, Q] = A.id < B.id ? [A, B] : [B, A], type = roadType(P, Q);
    const pts = route(P.x, P.z, Q.x, Q.z, { g: ROAD[type].g });
    const prof = pts && profile(pts, type, P.y, Q.y, { pin0: plazaR(P), pin1: plazaR(Q) });
    if (!prof) { S.edges.set(ek, null); continue; }
    prof.kind = 'link'; prof.a = P.id; prof.b = Q.id; prof.key = ek;
    const r = addRoad(prof); S.edges.set(ek, r);
    node(P.id, P.x, P.z, P.y).roads.push({ road: r.id, end: 0 }); node(Q.id, Q.x, Q.z, Q.y).roads.push({ road: r.id, end: 1 });
  }
}
function roadsOk(ci, cj) {
  const k = ckey(ci, cj); if (S.roadsOk.has(k)) return; S.roadsOk.add(k);
  for (let j = cj - 3; j <= cj + 3; j++) for (let i = ci - 3; i <= ci + 3; i++) ownEdges(i, j);
}
// streets of a town: the through-roads near the centre are its main streets; add side streets and a harbour lane
export function townOf(s) {
  if (S.towns.has(s.id)) return s.layout; S.towns.add(s.id);
  roadsOk(s.ci, s.cj);
  const r = rng(s.seed ^ 0x5bd1e995), N = node(s.id, s.x, s.z, s.y), PR = plazaR(s);
  const lay = s.layout = { streets: [], plaza: null, quay: null };
  addDisc(s.x, s.z, s.y, PR, 'plaza'); lay.plaza = { x: s.x, z: s.z, y: s.y, r: PR };
  N.roads.sort((p, q) => S.roads[p.road].key < S.roads[q.road].key ? -1 : 1);   // generation order differs per thread
  const dirs = N.roads.map(({ road, end }) => { const R = S.roads[road], i = end ? R.xs.length - 4 : 3; return Math.atan2(R.zs[Math.max(0, Math.min(R.xs.length - 1, i))] - s.z, R.xs[Math.max(0, Math.min(R.xs.length - 1, i))] - s.x); });
  // end = [x, z, y, pinRadius] for a street that must arrive somewhere at a set height (the quay)
  const street = (x0, z0, y0, ang, len, type = 'street', end = null, pin0 = 0) => {
    let x1 = x0 + Math.cos(ang) * len, z1 = z0 + Math.sin(ang) * len; if (end) [x1, z1] = end;
    const pts = route(x0, z0, x1, z1, { ds: 16, step: 8, wmax: 40, g: ROAD[type].g, water: 40, res: 6, smooth: 2 });
    const prof = pts && profile(pts, type, y0, end ? end[2] : undefined, { maxBridge: 0, pin0, pin1: end ? end[3] : 0 });
    if (!prof) return null; prof.kind = 'street'; prof.town = s.id; const rd = addRoad(prof); lay.streets.push(rd.id); return rd;
  };
  const used = dirs.slice();
  const freeDir = () => { let best = 0, bs = -1; for (let t = 0; t < 16; t++) { const a = t / 16 * Math.PI * 2; let m = 9; for (const d of used) m = Math.min(m, Math.abs(Math.atan2(Math.sin(a - d), Math.cos(a - d)))); if (m > bs) { bs = m; best = a; } } used.push(best); return best; };
  // a harbour lane down to the shore, with a quay
  if (s.coast) {
    const a = s.coast.a; let sx = s.x, sz = s.z;
    for (let d = 20; d < 420; d += 6) { const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d; if (rawH(x, z) < 0.8) { sx = x - Math.cos(a) * 6; sz = z - Math.sin(a) * 6; break; } }
    if (Math.hypot(sx - s.x, sz - s.z) > 30) {
      const rd = street(s.x, s.z, s.y, a, 0, 'street', [sx, sz, 1.6, 9], PR);
      if (rd) { addDisc(sx, sz, 1.6, 9, 'quay'); lay.quay = { x: sx, z: sz, y: 1.6, a, road: rd.id }; used.push(a); }
    }
  }
  // a dead-end village gets a street out the other side
  if (s.size !== 'hamlet' && N.roads.length < 2) street(s.x, s.z, s.y, freeDir(), s.R * 0.9, 'street', null, PR);
  // side streets off the main streets
  const nSide = s.size === 'town' ? r.int(3, 5) : s.size === 'village' ? r.int(1, 2) : 0;
  const mains = N.roads.map(o => ({ R: S.roads[o.road], end: o.end })).concat(lay.streets.map(id => ({ R: S.roads[id], end: 0 })));
  for (let t = 0; t < nSide && mains.length; t++) {
    const { R, end } = mains[t % mains.length], d = s.R * r.range(0.25, 0.7);
    let i = 0; while (i < R.xs.length - 1 && R.s[i] < d) i++; if (end) i = R.xs.length - 1 - i;
    if (i <= 0 || i >= R.xs.length - 1) continue;
    const tx = R.xs[i + 1] - R.xs[i - 1], tz = R.zs[i + 1] - R.zs[i - 1], side = r() < 0.5 ? 1 : -1, ang = Math.atan2(tz, tx) + side * Math.PI / 2 + r.range(-0.3, 0.3);
    const x0 = R.xs[i] + Math.cos(ang) * (R.hw - 0.5), z0 = R.zs[i] + Math.sin(ang) * (R.hw - 0.5);
    const rd = street(x0, z0, R.ys[i], ang, r.range(70, 140) * (s.size === 'town' ? 1.2 : 1));
    if (rd) R.junctions.push({ s: R.s[i], road: rd.id, end: 0 });
  }
  addClear({ x0: s.x - s.R, z0: s.z - s.R, x1: s.x + s.R, z1: s.z + s.R, town: s, cx: s.x, cz: s.z, r: s.R * 0.85 });
  return lay;
}
// ------------------------------------------------------------------------------------------- farms (wild)
const CROPS = ['wheat', 'barley', 'pasture', 'pasture', 'plough', 'hay', 'potato', 'pasture'];
function nearestRoadPoint(x, z, maxD, filter) {
  let best = null, bd = maxD * maxD;
  const i0 = Math.floor((x - maxD) / BKT), i1 = Math.floor((x + maxD) / BKT), j0 = Math.floor((z - maxD) / BKT), j1 = Math.floor((z + maxD) / BKT);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const a = S.buckets.get(ckey(i, j)); if (!a) continue;
    for (const s of a) {
      if (s.disc || s.br || (filter && !filter(s))) continue;
      const ex = s.bx - s.ax, ez = s.bz - s.az, l2 = ex * ex + ez * ez || 1; let t = ((x - s.ax) * ex + (z - s.az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = s.ax + ex * t, pz = s.az + ez * t, d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bd) { bd = d; best = { x: px, z: pz, y: s.ay + (s.by - s.ay) * t, seg: s, t }; }
    }
  }
  return best;
}
function inTown(x, z, pad = 0) {   // pure (settlement centres only), so every thread agrees
  const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) { const s = settlementOf(i, j); if (s && Math.hypot(x - s.x, z - s.z) < s.R + pad) return true; }
  return false;
}
// farms join link roads and town streets only (not each other's tracks): what exists then doesn't depend on the order
// in which a thread happened to generate things
const joinable = s => s.r && (s.r.kind === 'link' || s.r.kind === 'street');
export function farmOf(fi, fj) {
  const k = ckey(fi, fj); if (S.farms.has(k)) return S.farms.get(k);
  S.farms.set(k, null);
  const cx = (fi + 0.5) * FARM_CELL, cz = (fj + 0.5) * FARM_CELL;
  if (cheb(cx, cz) < BOUND + 700 || hash2(fi, fj, 9) > 0.55) return null;
  const ci = Math.floor(cx / CELL), cj = Math.floor(cz / CELL);
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) { roadsOk(i, j); const s = settlementOf(i, j); if (s) townOf(s); }
  const r = rng(fi * 48271 + fj * 69621 + 3);
  const x = (fi + 0.2 + 0.6 * r()) * FARM_CELL, z = (fj + 0.2 + 0.6 * r()) * FARM_CELL, y = rawH(x, z);
  if (y < 3 || y > 190) return null;
  let rough = 0; for (let a = 0; a < 6; a++) rough = Math.max(rough, Math.abs(rawH(x + Math.cos(a) * 35, z + Math.sin(a) * 35) - y));
  if (rough > 10) return null;
  if (forestAt(x, z, y, 0.95) && r() < 0.6) return null;
  if (inTown(x, z, 90)) return null;
  const rp = nearestRoadPoint(x, z, 900, joinable); if (!rp) return null;
  const dRoad = Math.hypot(rp.x - x, rp.z - z); if (dRoad < 45) return null;
  const yaw = Math.atan2(rp.z - z, rp.x - x) + (r() < 0.5 ? 0 : Math.PI / 2);
  const farm = { id: `f${fi}_${fj}`, x, z, y, yaw, seed: r() * 1e9 | 0, fields: [], style: r() < 0.55 ? 'wall' : 'hedge', track: null };
  // the track: from the yard to the nearest road
  const pts = route(x, z, rp.x, rp.z, { ds: 24, step: 10, wmax: 120, g: ROAD.dirt.g, water: 60, res: 7, smooth: 2 });
  const prof = pts && profile(pts, 'dirt', y, rp.y, { maxBridge: 0, pin0: 14 });
  if (!prof) return null;
  prof.kind = 'track'; prof.farm = farm.id;
  const rd = addRoad(prof); farm.track = rd.id; rp.seg.r.junctions.push({ s: rp.seg.r.s[rp.seg.i] + rp.t * Math.hypot(rp.seg.bx - rp.seg.ax, rp.seg.bz - rp.seg.az), road: rd.id, end: 1 });
  addDisc(x, z, farm.y, 14, 'yard');
  // fields round the yard on a grid aligned with the farm
  const ca = Math.cos(yaw), sa = Math.sin(yaw), grid = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [0, 2], [-2, 0], [0, -2]];
  const W = r.range(70, 110), D = r.range(55, 90);
  for (const [gu, gv] of grid) {
    if (farm.fields.length >= 7) break; if (r() < 0.22) continue;
    const u = gu * (W + 6), v = gv * (D + 6), fx = x + ca * u - sa * v, fz = z + sa * u + ca * v;
    const w = W * r.range(0.8, 1), d = D * r.range(0.8, 1);
    let lo = 1e9, hi = -1e9, ok = true;
    for (const [pu, pv] of [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5], [0, 0], [0, .5], [.5, 0], [-.5, 0], [0, -.5]]) {
      const px = fx + ca * pu * w - sa * pv * d, pz = fz + sa * pu * w + ca * pv * d, h = rawH(px, pz); lo = Math.min(lo, h); hi = Math.max(hi, h);
      if (h < 1.8 || inTown(px, pz, 10)) { ok = false; break; }
      if (px < fi * FARM_CELL || px > (fi + 1) * FARM_CELL || pz < fj * FARM_CELL || pz > (fj + 1) * FARM_CELL) { ok = false; break; }   // inside our own farm cell: never over a neighbour's
      if (nearestRoadPoint(px, pz, 9, joinable)) { ok = false; break; }
    }
    if (!ok || hi - lo > 16) continue;
    const f = { x: fx, z: fz, w, d, yaw, crop: r.pick(CROPS), seed: r() * 1e9 | 0 };
    farm.fields.push(f);
    const R = Math.hypot(w, d) / 2; addClear({ x0: fx - R, z0: fz - R, x1: fx + R, z1: fz + R, field: f, cx: fx, cz: fz });
  }
  addClear({ x0: x - 40, z0: z - 40, x1: x + 40, z1: z + 40, yard: farm, cx: x, cz: z, r: 34 });
  S.farms.set(k, farm); return farm;
}
// L3: everything that can touch this cell is generated
export function cellReady(ci, cj) {
  const k = ckey(ci, cj); if (S.ready.has(k)) return; S.ready.add(k);
  roadsOk(ci, cj);
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) { roadsOk(i, j); const s = settlementOf(i, j); if (s) townOf(s); }
  const f = CELL / FARM_CELL, fi0 = Math.floor((ci - 1) * f), fi1 = Math.ceil((ci + 2) * f), fj0 = Math.floor((cj - 1) * f), fj1 = Math.ceil((cj + 2) * f);
  for (let j = fj0; j <= fj1; j++) for (let i = fi0; i <= fi1; i++) { const fm = farmOf(i, j); if (fm) farmItems(fm); }
  // building platforms: the lots of every town that can reach this cell (their pads go into the terrain)
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) { const s = settlementOf(i, j); if (s) townItems(s); }
}
let lastCell = NaN;
export function ensure(x, z) {
  if (!S.zone) zoneNet();
  if (cheb(x, z) < BOUND + 300) return;
  const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), k = ckey(ci, cj);
  if (k === lastCell) return; if (!S.ready.has(k)) cellReady(ci, cj); lastCell = k;
}

// ------------------------------------------------------------------------------------------- the control zone
// Rules that match main.js / war.js: the landing pad (island centre, or 30 m south of a cave island's centre), its flat
// apron, the cave apron and the ground over the cave, the HQ / production building slots (structAngle).
export const padOf = I => I.cave ? { x: I.x, z: I.z + 30, r0: 12, r1: 34 } : { x: I.x, z: I.z, r0: 30, r1: 44 };   // (TERRAIN: r1 52 -> 44, as main.js PADS)
// on a cardinal direction (+-0.15 rad) from the pad, so the buildings sit between the AA slots on the diagonals
export const structAngle = I => Math.floor(hash2(I.id, 77, 1) * 4) * Math.PI / 2 + (hash2(I.id, 78, 1) - 0.5) * 0.3;
// TERRAIN: an island's main landing beach and the way up from it (the LCM-8 puts armour ashore there)
function onLanding(I, x, z, pad) {
  for (const B of beachesOf(I)) {
    if (!B.main) continue;
    const dx = x - B.x, dz = z - B.z, u = dx * B.fx + dz * B.fz, lat = -dx * B.fz + dz * B.fx;
    if (u > -10 - pad && u < B.u1 + 25 + pad && Math.abs(lat) < B.w + 6 + pad) return true;
  }
  return false;
}
export function zoneReserved(I, x, z, pad = 0) {
  const p = padOf(I); if (Math.hypot(x - p.x, z - p.z) < p.r0 + 6 + pad) return true;
  if (onLanding(I, x, z, pad * 0.5)) return true;
  if (I.cave) { if (Math.hypot(x - I.x, z - I.z) < 62 + pad) return true; if (Math.abs(x - I.x) < 90 + pad && Math.abs(z - I.z) < 24 + pad) return true; }
  if (I.name === 'IRONHOLD') { const a = Math.atan2(-I.z, -I.x); for (let d = 20; d < I.r + 40; d += 4) { const x1 = I.x + Math.cos(a) * d, z1 = I.z + Math.sin(a) * d; if (rawH(x1, z1) < 2.5) { if (Math.hypot(x - x1, z - z1) < 34 + pad) return true; break; } } }
  return false;
}
export function zoneNet() {
  if (S.zone) return; S.zone = true;
  S.zoneSites = [];
  for (const I of ISLANDS) {
    const p = padOf(I), r = rng(I.id * 7717 + 5), site = { I, village: null, quay: null, roads: [] };
    S.zoneSites.push(site);
    if (I.r < 100) continue;
    // the village: the flattest stretch of low land well away from the base
    let best = null;
    for (let a = 0; a < 32; a++) for (let d = 40; d < I.r - 22; d += 8) {
      const x = I.x + Math.cos(a / 32 * Math.PI * 2) * d, z = I.z + Math.sin(a / 32 * Math.PI * 2) * d, h = rawH(x, z);
      if (h < 3 || h > 22 || zoneReserved(I, x, z, 22)) continue;
      let n = 0, rough = 0; for (let k = 0; k < 12; k++) { const hh = rawH(x + Math.cos(k * 0.52) * 30, z + Math.sin(k * 0.52) * 30); if (hh > 2 && !zoneReserved(I, x + Math.cos(k * 0.52) * 30, z + Math.sin(k * 0.52) * 30, 6)) n++; rough = Math.max(rough, Math.abs(hh - h)); }
      const sc = n * 2 - rough * 0.5 - h * 0.08 + r() * 0.5;
      if (!best || sc > best.sc) best = { x, z, y: h, sc };
    }
    if (!best) continue;
    // TERRAIN (wave 3): the ground main.js will make of this island - the shaft apron, the pad, the ground over the cave
    // (terrainH0, same constants) - so the zone roads are graded on it, and routed round the shaft
    const padY = Math.min(I.cave ? 16 : 14, Math.max(I.cave ? 4 : 3, Math.round(rawH(I.x, I.z))));
    const finalH = (x, z) => {
      let h = rawH(x, z);
      if (I.cave) h = padY + (h - padY) * sm(18, 60, Math.hypot(x - I.x, z - I.z));
      const dp = Math.hypot(x - p.x, z - p.z); if (dp < p.r1) h = padY + (h - padY) * sm(p.r0, p.r1, dp);
      if (I.cave) { const k = sm(0, 14, Math.hypot(Math.max(Math.abs(x - I.x) - 76, 0), Math.max(Math.abs(z - I.z) - 9, 0))); h = Math.max(h, padY) + (h - Math.max(h, padY)) * k; }
      return h;
    };
    // the war's sites round the pad (war.js aaSlots: the AA guns on the diagonals; the HQ / production slots) are kept
    // clear: the lane leaves the apron between them and is routed round them
    const sites = [0, 1, 2, 3].map(k => { const aa = k * Math.PI / 2 + Math.PI / 4, r = I.cave ? 15 : 22; return [p.x + Math.cos(aa) * r, p.z + Math.sin(aa) * r]; });
    { const a0 = structAngle(I); if (I.cave) sites.push([p.x - 17, p.z + 9], [p.x + 19, p.z + 6]); else sites.push([p.x + Math.cos(a0) * 17, p.z + Math.sin(a0) * 17], [p.x - Math.cos(a0) * 18, p.z - Math.sin(a0) * 18]); }
    const routeH = (x, z) => (I.cave && Math.hypot(x - I.x, z - I.z) < 28) || sites.some(([qx, qz]) => Math.hypot(x - qx, z - qz) < 8) ? -5 : finalH(x, z);
    const V = site.village = { id: `z${I.id}`, x: best.x, z: best.z, y: best.y, size: 'village', R: 55, zone: true, I, seed: I.id * 131 + 7 };
    // road from the pad apron to the village
    const aV = Math.atan2(V.z - p.z, V.x - p.x); let a = aV, bestD = 1e9;
    for (let k = 0; k < 48; k++) {   // the start on the apron's edge nearest the village's direction that is clear of the sites (and not over the shaft)
      const c = k / 48 * Math.PI * 2, x = p.x + Math.cos(c) * (p.r0 - 2), z = p.z + Math.sin(c) * (p.r0 - 2);
      if (sites.some(([qx, qz]) => Math.hypot(x - qx, z - qz) < 11) || (I.cave && Math.hypot(x - I.x, z - I.z) < 30)) continue;
      const d = Math.abs(Math.atan2(Math.sin(c - aV), Math.cos(c - aV))); if (d < bestD) { bestD = d; a = c; }
    }
    const sx = p.x + Math.cos(a) * (p.r0 - 2), sz = p.z + Math.sin(a) * (p.r0 - 2);
    const pts = route(sx, sz, V.x, V.z, { ds: 12, step: 6, wmax: 40, g: ROAD.lane.g, water: 80, res: 5, smooth: 2, h: routeH });
    // TERRAIN (wave 3): the lane leaves the pad apron at the pad's own height (main.js PADS / BASES: the island centre's
    // ground, rounded and clamped), so its first metres lie on the concrete instead of floating over it
    const prof = pts && profile(pts, 'lane', padY, V.y, { maxBridge: 0, pin0: 6, pin1: 9, h: finalH });
    if (prof) { prof.kind = 'zone'; prof.a = `zp${I.id}`; prof.b = V.id; const rd = addRoad(prof); site.roads.push(rd.id); node(prof.a, sx, sz, prof.ys[0]).roads.push({ road: rd.id, end: 0 }); node(V.id, V.x, V.z, V.y).roads.push({ road: rd.id, end: 1 }); }
    addDisc(V.x, V.z, V.y, 9, 'plaza'); addClear({ x0: V.x - 60, z0: V.z - 60, x1: V.x + 60, z1: V.z + 60, cx: V.x, cz: V.z, r: 52 });
    // a harbour lane on to the shore facing away from the island
    const ha = Math.atan2(V.z - I.z, V.x - I.x);
    // the quay is a stone harbour wall 1.6-4.5 m above the sea: as low as the lane can get down to at a street's grade
    for (const off of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6]) {
      const aa = ha + off; let q = null;
      for (let d = 10; d < 170; d += 3) {
        const x = V.x + Math.cos(aa) * d, z = V.z + Math.sin(aa) * d;
        if (rawH(x, z) < 0.8) { const qy = Math.max(1.6, V.y - ROAD.street.g * 0.9 * (d - 5 - 17)); if (qy <= 4.5) q = [x - Math.cos(aa) * 5, z - Math.sin(aa) * 5, qy]; break; }
        if (Math.hypot(x - p.x, z - p.z) < p.r0 + 8 || (I.cave && Math.hypot(x - I.x, z - I.z) < 45)) break;   // not across the pad or the shaft
      }
      if (!q) continue;
      const pts2 = route(V.x, V.z, q[0], q[1], { ds: 10, step: 5, wmax: 25, g: ROAD.street.g, water: 80, res: 5, smooth: 2, h: routeH });
      const pr2 = pts2 && profile(pts2, 'street', V.y, q[2], { maxBridge: 0, pin0: 9, pin1: 8, h: finalH });
      if (!pr2) continue;
      pr2.kind = 'zone'; pr2.a = V.id; pr2.b = `zq${I.id}`; const rd = addRoad(pr2); site.roads.push(rd.id);
      node(V.id, V.x, V.z, V.y).roads.push({ road: rd.id, end: 0 }); node(pr2.b, q[0], q[1], q[2]).roads.push({ road: rd.id, end: 1 });
      addDisc(q[0], q[1], q[2], 8, 'quay'); site.quay = { x: q[0], z: q[1], y: q[2], a: aa, road: rd.id };
      break;
    }
    // a back street, the way that's freest of roads and the base
    V.layout = { streets: [], quay: site.quay };
    const used = S.nodes.get(V.id).roads.map(({ road, end }) => { const R = S.roads[road], i = end ? R.xs.length - 3 : 2; return Math.atan2(R.zs[i] - V.z, R.xs[i] - V.x); });
    let bestA = null, bs = -1;
    for (let t = 0; t < 16; t++) {
      const a = t / 16 * Math.PI * 2; let m = 9; for (const d of used) m = Math.min(m, Math.abs(Math.atan2(Math.sin(a - d), Math.cos(a - d))));
      let ok = 0; for (let d = 15; d <= 60; d += 15) { const x = V.x + Math.cos(a) * d, z = V.z + Math.sin(a) * d; if (rawH(x, z) > 2.5 && !zoneReserved(I, x, z, 10)) ok++; }
      if (ok === 4 && m > bs) { bs = m; bestA = a; }
    }
    if (bestA !== null && bs > 0.7) {
      const ex = V.x + Math.cos(bestA) * 60, ez = V.z + Math.sin(bestA) * 60, pts = route(V.x, V.z, ex, ez, { ds: 10, step: 5, wmax: 20, g: ROAD.street.g, water: 80, res: 5, smooth: 2, h: routeH });
      const pr = pts && profile(pts, 'street', V.y, undefined, { maxBridge: 0, pin0: 9, h: finalH });
      if (pr) { pr.kind = 'zone'; pr.town = V.id; const rd = addRoad(pr); site.roads.push(rd.id); V.layout.streets.push(rd.id); }
    }
    // the lots, levelled into the ground like the wild villages (main.js bakes islandH after this)
    const p0 = padOf(I), a0 = structAngle(I), slots = I.cave ? [[p0.x - 17, p0.z + 9], [p0.x + 19, p0.z + 6]] : [[p0.x + Math.cos(a0) * 17, p0.z + Math.sin(a0) * 17], [p0.x - Math.cos(a0) * 18, p0.z - Math.sin(a0) * 18]];
    site.blocked = (x, z, rad = 0) => zoneReserved(I, x, z, rad) || slots.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 16 + rad);
    townItems(V, null, { blocked: site.blocked });
  }
}

// ------------------------------------------------------------------------------------------- queries
// before lots are laid out round (x, z), everything that can run past them must exist on this thread too (roads,
// streets, farm tracks), or two threads would lay out different towns
export function prepArea(x, z, rad) {
  for (let j = Math.floor((z - rad) / CELL) - 1; j <= Math.floor((z + rad) / CELL) + 1; j++) for (let i = Math.floor((x - rad) / CELL) - 1; i <= Math.floor((x + rad) / CELL) + 1; i++) { roadsOk(i, j); const s = settlementOf(i, j); if (s) townOf(s); }
  const fr = rad + 950;
  for (let j = Math.floor((z - fr) / FARM_CELL); j <= Math.floor((z + fr) / FARM_CELL); j++) for (let i = Math.floor((x - fr) / FARM_CELL); i <= Math.floor((x + fr) / FARM_CELL); i++) farmOf(i, j);
}
const forLots = null;
function nearestSeg(x, z, skipBridges, filter) {
  const a = S.buckets.get(ckey(Math.floor(x / BKT), Math.floor(z / BKT))); if (!a) return null;
  let best = null, bd = Infinity, bt = 0;
  for (const s of a) {
    if ((skipBridges && s.br) || (filter && !filter(s))) continue;
    const ex = s.bx - s.ax, ez = s.bz - s.az, l2 = ex * ex + ez * ez; let t = l2 ? ((x - s.ax) * ex + (z - s.az) * ez) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = s.ax + ex * t - x, dz = s.az + ez * t - z;
    const e = Math.sqrt(dx * dx + dz * dz) - s.hw;   // distance past the paved edge (negative = on it)
    if (e < bd) { bd = e; best = s; bt = t; }
  }
  return best && { s: best, t: bt, e: bd };
}
// how far past the nearest paved edge (negative = on a road / square), or Infinity when nothing is within ~20 m
export function edgeDist(x, z) { ensure(x, z); return edgeDist0(x, z); }
export function edgeDist0(x, z) { const q = nearestSeg(x, z, false, forLots); return q ? q.e : Infinity; }   // no generation, lots' view (layout uses it mid-generation)
function bedRoads(x, z, h) {
  const q = nearestSeg(x, z, true); if (!q) return h;
  const { s, t, e } = q; if (e > FLAT + SH_MAX) return h;
  const ry = s.ay + (s.by - s.ay) * t; if (e <= FLAT) return ry;
  const sh = Math.min(SH_MAX, 3 + 1.1 * Math.abs(h - ry)); if (e >= FLAT + sh) return h;
  const k = sm(FLAT, FLAT + sh, e); return ry + (h - ry) * k;
}
// building platforms (cut and fill, like a hillside village): an oriented rectangle flattened to y, blended out over
// its shoulder. Several pads blend by weights that go to infinity inside a pad, so the result doesn't depend on the
// order they were made in (each thread generates in its own order).
export function addPad(x, z, y, yaw, hu, hv, sh) {
  const p = { x, z, y, c: Math.cos(yaw), s: Math.sin(yaw), hu, hv, sh }, R = Math.hypot(hu, hv) + sh;
  bucketAdd(S.pads, x - R, z - R, x + R, z + R, p); return p;
}
function bedPads(x, z, h) {
  const a = S.pads.get(ckey(Math.floor(x / BKT), Math.floor(z / BKT))); if (!a) return h;
  let sw = 0, sy = 0;
  for (const p of a) {
    const dx = x - p.x, dz = z - p.z, u = Math.abs(dx * p.c - dz * p.s) - p.hu, v = Math.abs(dx * p.s + dz * p.c) - p.hv;
    const e = Math.hypot(Math.max(u, 0), Math.max(v, 0)); if (e >= p.sh) continue;
    const k = e <= 0 ? 0 : sm(0, p.sh, e), w = (1 - k) / (k + 1e-4); sw += w; sy += w * p.y;
  }
  return sw ? (h + sy) / (1 + sw) : h;
}
// the ground under construction (roads and squares only): what lots are levelled from
export const ground0 = (x, z) => bedRoads(x, z, rawH(x, z));
// the terrain with road beds, squares, quays, farmyards and building platforms (world.js calls this inside islandH)
export function roadBed(x, z, h) { ensure(x, z); return bedPads(x, z, bedRoads(x, z, h)); }
// is this spot kept clear of trees (roads, towns, fields, yards)?
export function clearedAt(x, z) {
  ensure(x, z);
  const q = nearestSeg(x, z, false); if (q && q.e < 7) return true;
  const a = S.fbk.get(ckey(Math.floor(x / BKT), Math.floor(z / BKT))); if (!a) return false;
  for (const c of a) {
    if (c.field) { const f = c.field, dx = x - f.x, dz = z - f.z, ca = Math.cos(f.yaw), sa = Math.sin(f.yaw), u = dx * ca + dz * sa, v = -dx * sa + dz * ca; if (Math.abs(u) < f.w / 2 + 3 && Math.abs(v) < f.d / 2 + 3) return true; }
    else if (Math.hypot(x - c.cx, z - c.cz) < c.r) return true;
  }
  return false;
}
// What road is here? { surface: 'tarmac'|'dirt', type, bridge, y (road surface), road (id), s (arc length),
// heading (rad, along the road's point order, 0 = +x), dist (from the centreline), hw (half width) } or null.
export function roadAt(x, z) {
  ensure(x, z);
  const q = nearestSeg(x, z, false); if (!q || q.e > 0 || q.s.disc) {
    if (q && q.s.disc && q.e <= 0) return { surface: 'tarmac', type: q.s.kind, bridge: false, y: q.s.ay, road: -1, s: 0, heading: 0, dist: q.e + q.s.hw, hw: q.s.hw };
    return null;
  }
  const { s, t } = q, R = s.r;
  return { surface: R.surface, type: R.type, kind: R.kind, bridge: !!s.br, y: s.ay + (s.by - s.ay) * t, road: R.id, s: R.s[s.i] + t * Math.hypot(s.bx - s.ax, s.bz - s.az), heading: Math.atan2(s.bz - s.az, s.bx - s.ax), dist: q.e + s.hw, hw: s.hw };
}
// the nearest point on any road within maxD: { x, z, y, road (id), s (arc length), seg } or null
export function nearestRoad(x, z, maxD = 60, filter = null) {
  ensure(x, z); const p = nearestRoadPoint(x, z, maxD, filter); if (!p) return null;
  const R = p.seg.r; return { x: p.x, z: p.z, y: p.y, road: R.id, s: R.s[p.seg.i] + p.t * Math.hypot(p.seg.bx - p.seg.ax, p.seg.bz - p.seg.az), R };
}
// the road graph round a point (ensures it is generated first): roads with their polylines and junctions, and nodes
export function roadGraph(x, z, rad = 1500) {
  const c0 = Math.floor((x - rad) / CELL), c1 = Math.floor((x + rad) / CELL), d0 = Math.floor((z - rad) / CELL), d1 = Math.floor((z + rad) / CELL);
  ensure(x, z);
  for (let j = d0; j <= d1; j++) for (let i = c0; i <= c1; i++) {   // only cells the circle reaches that hold some wild land
    const nx = Math.max(i * CELL, Math.min(x, (i + 1) * CELL)), nz = Math.max(j * CELL, Math.min(z, (j + 1) * CELL));
    const far = Math.max(Math.abs(i * CELL), Math.abs((i + 1) * CELL), Math.abs(j * CELL), Math.abs((j + 1) * CELL));
    if (Math.hypot(nx - x, nz - z) < rad && far > BOUND + 300 && cheb(x, z) + rad > BOUND + 300) cellReady(i, j);
  }
  const roads = [], nodes = new Map();
  for (const R of S.roads) {
    let near = false; for (let i = 0; i < R.xs.length; i += 4) if (Math.abs(R.xs[i] - x) < rad && Math.abs(R.zs[i] - z) < rad) { near = true; break; }
    if (!near) continue;
    roads.push(R);
    for (const id of [R.a, R.b]) if (id && S.nodes.has(id)) nodes.set(id, S.nodes.get(id));
  }
  return { roads, nodes: [...nodes.values()] };
}
export const roadById = id => S.roads[id];
// position on a road at arc length s, offset sideways by `lat` (+ = right of travel along the point order)
export function roadPoint(R, s, lat = 0, out = {}) {
  s = Math.max(0, Math.min(R.len, s));
  let lo = 0, hi = R.s.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R.s[m] <= s) lo = m; else hi = m; }
  const l = R.s[hi] - R.s[lo] || 1, t = (s - R.s[lo]) / l, dx = (R.xs[hi] - R.xs[lo]) / l, dz = (R.zs[hi] - R.zs[lo]) / l;
  out.x = R.xs[lo] + (R.xs[hi] - R.xs[lo]) * t - dz * lat; out.z = R.zs[lo] + (R.zs[hi] - R.zs[lo]) * t + dx * lat;
  out.y = R.ys[lo] + (R.ys[hi] - R.ys[lo]) * t; out.dx = dx; out.dz = dz; out.grade = (R.ys[hi] - R.ys[lo]) / l; out.bridge = !!R.br[lo];
  return out;
}
export function settlementsNear(x, z, rad) {
  const c0 = Math.floor((x - rad) / CELL), c1 = Math.floor((x + rad) / CELL), d0 = Math.floor((z - rad) / CELL), d1 = Math.floor((z + rad) / CELL), out = [];
  for (let j = d0; j <= d1; j++) for (let i = c0; i <= c1; i++) { const s = settlementOf(i, j); if (s && Math.hypot(s.x - x, s.z - z) < rad + s.R) out.push(s); }
  return out;
}
export function farmsIn(x0, z0, x1, z1) {
  const out = [];
  for (let j = Math.floor(z0 / FARM_CELL) - 1; j <= Math.floor(z1 / FARM_CELL) + 1; j++) for (let i = Math.floor(x0 / FARM_CELL) - 1; i <= Math.floor(x1 / FARM_CELL) + 1; i++) { const f = S.farms.get(ckey(i, j)); if (f) out.push(f); }
  return out;
}
