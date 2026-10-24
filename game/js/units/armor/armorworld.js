// armorworld.js - the trackfm environment on the REAL island world (wave 2: the M60A3 / M113A2 in the game). PURE: no
// THREE, no DOM, no game imports beyond platform.js; the host passes everything it knows as functions, so the node
// bench (tools/armorgamebench.mjs) runs the same code against a stub world.
//
//   const AW = createArmorWorld({
//     terrainH(x, z),                      REQUIRED: the game's ground height (roads, building pads and aprons included)
//     ships() -> [war units],              ships with dims / p / yaw (the ALBATROSS, the KRAKEN ...), for decks
//     deckY(x, z) -> y | -1e9,             war.deckY: the deck (or superstructure) under (x, z)
//     shipAt(x, z) -> unit | null,         war.shipAt
//     shipAlive(u) -> bool,
//     roadAt(x, z) -> { surface, bridge, y } | null,   WORLD's road query (tarmac -> paved, dirt road -> dirt, bridge decks)
//     pads: [{ x, z, r }]                  concrete aprons (paved)
//     holes: [{ x, z, r }]                 the cave shafts (fenced: a wall)
//     trees: [{ x, z, y, r }]              island trees (trunk obstacles that a tank pushes over: event 'knockdown')
//     structs() -> [island structures]     war.js island structs { kind, x, y, z, r, h, dead } (buildings, AA sites)
//     items() -> [zone items]              WORLD's village items { t, x, z, yaw, w, d, y?, h? } (houses: boxes)
//     bounds(skip) -> [craft footprints]   crafts.bounds: other vehicles, the parked Huey / Hornet { x, z, yaw, hl, hw, y0, y1 }
//     cw                                   COLLISION (wave 3): the game's collision world (collision.js): light pushable
//                                          crafts are skipped (shoved by its contact response), its other moving bodies added
//     hitTest(x, y, z) -> truthy           anything solid for the laser (war targets of either side)
//     onFell(tree, dirX, dirZ)             lay a pushed-over tree down (the host's instanced mesh)
//     seaLevel: 0, rockAbove: 30
//   });
//   const env = AW.env(self)    -> a trackfm env for one vehicle: height / surface / water / obstacles / raycast
//   env.prep(x, z)              -> once a frame before V.step: finds the decks, bridges and platforms near the vehicle
//   AW.carry(fm, st) / AW.settle(fm, st)   -> platform-relative motion for a trackfm sim on a moving deck (platform.js)
//   AW.addPlatform(P) / removePlatform(P)  -> extra decks the war doesn't know: the LCM-8 (P = { p, yaw, deck(lx, lz), dry(lx, lz) })
//
// Height: the terrain is sampled on a 2 m lattice (cached, direct-mapped) and interpolated with a Catmull-Rom bicubic, so
// the slope is continuous (trackfm reads a kink in the ground - a second difference over 0.25 m above 5 cm - as an edge
// or a wall) and a tank costs ~16 table reads per height instead of a full terrainH (the road beds and the 17 pad blends).
// Decks (war ships and the host's platforms), bridge decks (roadAt().y) win over the terrain where they are higher.
import { createPlatforms } from '../../platform.js';

const hash = (x, z) => { const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return h - Math.floor(h); };
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// Catmull-Rom weights for t in [0, 1): the 4 nodes at -1, 0, 1, 2
function crw(t, w) {
  const t2 = t * t, t3 = t2 * t;
  w[0] = 0.5 * (-t3 + 2 * t2 - t); w[1] = 0.5 * (3 * t3 - 5 * t2 + 2); w[2] = 0.5 * (-3 * t3 + 4 * t2 + t); w[3] = 0.5 * (t3 - t2);
}

export function createArmorWorld(o) {
  const H0 = o.terrainH, SEA = o.seaLevel ?? 0, ROCK = o.rockAbove ?? 30;
  const AW = { stats: { nodes: 0, roadQ: 0 } };

  // ---------------------------------------------------------------- terrain: a 2 m lattice, direct-mapped cache, bicubic
  const C = 2, N = 256, MASK = N - 1, KI = new Int32Array(N * N).fill(-2147483648), KJ = new Int32Array(N * N), HV = new Float32Array(N * N);
  function node(i, j) {
    const k = ((i & MASK) << 8) | (j & MASK);
    if (KI[k] !== i || KJ[k] !== j) { KI[k] = i; KJ[k] = j; HV[k] = H0(i * C, j * C); AW.stats.nodes++; }
    return HV[k];
  }
  const wu = [0, 0, 0, 0], wv = [0, 0, 0, 0];
  AW.terrain = (x, z) => {
    const fx = x / C, fz = z / C, i = Math.floor(fx), j = Math.floor(fz);
    crw(fx - i, wu); crw(fz - j, wv);
    let h = 0;
    for (let b = 0; b < 4; b++) { const jj = j + b - 1; h += wv[b] * (wu[0] * node(i - 1, jj) + wu[1] * node(i, jj) + wu[2] * node(i + 1, jj) + wu[3] * node(i + 2, jj)); }
    return h;
  };
  AW.flush = () => { KI.fill(-2147483648); rcache.clear(); };   // the ground changed (a new war)

  // ---------------------------------------------------------------- roads: one roadAt per 2 m cell, cached (deterministic)
  const rcache = new Map();
  AW.roadCell = (x, z) => {
    if (!o.roadAt) return null;
    const i = Math.floor(x / 2), j = Math.floor(z / 2), k = i * 1000003 + j;
    let r = rcache.get(k);
    if (r === undefined) {
      const q = o.roadAt(i * 2 + 1, j * 2 + 1); AW.stats.roadQ++;
      r = q ? { surface: q.surface, bridge: !!q.bridge, y: q.y } : null;
      if (rcache.size > 60000) rcache.clear();
      rcache.set(k, r);
    }
    return r;
  };

  // ---------------------------------------------------------------- platforms: war ships + the host's own (LCM-8)
  const plats = [];
  AW.addPlatform = P => { if (!plats.includes(P)) plats.push(P); return P; };
  AW.removePlatform = P => { const i = plats.indexOf(P); if (i >= 0) plats.splice(i, 1); };
  AW.platforms = plats;
  const toLocal = (u, x, z, out) => { const dx = x - u.p.x, dz = z - u.p.z, c = Math.cos(u.yaw), s = Math.sin(u.yaw); out[0] = dx * c - dz * s; out[1] = dx * s + dz * c; return out; };
  const _l = [0, 0];
  function platDeck(x, z) {   // highest host platform deck under (x, z), or -1e9 (sets lastPlat)
    let best = -1e9; lastPlat = null;
    for (const P of plats) {
      if (Math.abs(x - P.p.x) > 40 || Math.abs(z - P.p.z) > 40) continue;
      toLocal(P, x, z, _l); const h = P.deck(_l[0], _l[1]);
      if (h > -1e8 && P.p.y + h > best) { best = P.p.y + h; lastPlat = P; }
    }
    return best;
  }
  let lastPlat = null;
  function platDry(x, z) { for (const P of plats) { if (Math.abs(x - P.p.x) > 40 || Math.abs(z - P.p.z) > 40) continue; toLocal(P, x, z, _l); if (P.dry && P.dry(_l[0], _l[1])) return true; } return false; }
  const PF = createPlatforms({
    deckY: (x, z) => Math.max(o.deckY ? o.deckY(x, z) : -1e9, platDeck(x, z)),
    shipAt: (x, z) => { const d = platDeck(x, z); return lastPlat && d >= (o.deckY ? o.deckY(x, z) : -1e9) ? lastPlat : o.shipAt ? o.shipAt(x, z) : null; },
    alive: u => plats.includes(u) ? !u.gone : o.shipAlive ? o.shipAlive(u) : true,
  });
  AW.PF = PF;

  // ---------------------------------------------------------------- obstacles (prebuilt, grid-indexed where static)
  const CELL = 8, tgrid = new Map(), gk = (i, j) => i * 100003 + j;
  const trees = (o.trees || []).map((t, i) => {
    const k = Math.max(0.5, t.r / 0.9);   // the host's tree scale (TREES r = 0.9 x scale)
    return { kind: 'cyl', x: t.x, z: t.z, r: 0.45 * k, top: t.y + 4.5 * k, id: 'tree' + i, breakN: 1.1e5 * k * k, tree: t, idx: i, felled: false };
  });
  for (const T of trees) { const k = gk(Math.floor(T.x / CELL), Math.floor(T.z / CELL)); if (!tgrid.has(k)) tgrid.set(k, []); tgrid.get(k).push(T); }
  AW.trees = trees;
  const treeById = new Map(trees.map(T => [T.id, T]));
  AW.fell = (id, dirX, dirZ) => { const T = treeById.get(id); if (!T || T.felled) return null; T.felled = true; o.onFell?.(T.tree, dirX, dirZ, T.idx); return T; };
  // village buildings: boxes, grid-indexed once (the zone villages are built at start)
  let hgrid = null;
  function houseGrid() {
    if (hgrid) return hgrid; hgrid = new Map();
    const SKIP = new Set(['field', 'jetty', 'quay', 'laundry', 'pots', 'lamp', 'sign', 'bench', 'memorial', 'shelter']);
    for (const it of (o.items ? o.items() : [])) {
      if (!it || SKIP.has(it.t) || it.ground || !(it.w >= 2) || !(it.d >= 2)) continue;
      const y = it.y ?? H0(it.x, it.z), B = { kind: 'box', x: it.x, z: it.z, hx: it.w / 2, hz: it.d / 2, yaw: it.yaw || 0, top: y + (it.h || 6), id: 'house' + hgrid.size, house: it };
      const r = Math.hypot(B.hx, B.hz);
      for (let i = Math.floor((B.x - r) / CELL); i <= Math.floor((B.x + r) / CELL); i++) for (let j = Math.floor((B.z - r) / CELL); j <= Math.floor((B.z + r) / CELL); j++) { const k = gk(i, j); if (!hgrid.has(k)) hgrid.set(k, []); hgrid.get(k).push(B); }
    }
    return hgrid;
  }
  AW.houses = () => houseGrid();
  const sObs = new Map();   // island structures -> obstacle objects (reused)
  const bPool = [], cwn = [];   // craft footprints -> obstacle objects (pooled per call); COLLISION: the collision world's near list
  const holes = (o.holes || []).map((h, i) => ({ kind: 'cyl', x: h.x, z: h.z, r: h.r + 0.5, top: 1e4, id: 'shaft' + i }));

  // ---------------------------------------------------------------- a vehicle's environment
  AW.env = (self = null) => {
    let nearShip = false, nearPlat = false, nearBridge = false, src = 'ground';
    const obs = [], seen = new Set();
    const E = {
      self,
      // once a frame before V.step: which decks, platforms and bridges are close enough to matter
      prep(x, z) {
        nearShip = false; nearPlat = false; nearBridge = false;
        for (const u of (o.ships ? o.ships() : [])) if (u.dims && Math.abs(x - u.p.x) < u.dims.L / 2 + 30 && Math.abs(z - u.p.z) < u.dims.L / 2 + 30) { nearShip = true; break; }
        for (const P of plats) if (Math.abs(x - P.p.x) < 45 && Math.abs(z - P.p.z) < 45) { nearPlat = true; break; }
        if (o.roadAt) for (let a = -1; a <= 1 && !nearBridge; a++) for (let b = -1; b <= 1; b++) { const r = AW.roadCell(x + a * 8, z + b * 8); if (r && r.bridge) { nearBridge = true; break; } }
        return E;
      },
      get nearShip() { return nearShip; }, get nearPlat() { return nearPlat; }, get nearBridge() { return nearBridge; },
      height(x, z) {
        let h = AW.terrain(x, z); src = 'ground';
        if (nearBridge) { const r = o.roadAt(x, z); if (r && r.bridge && r.y > h) { h = r.y; src = 'bridge'; } }
        if (nearShip) { const d = o.deckY(x, z); if (d > -1e8 && d >= Math.max(h, SEA) - 0.05) { h = d; src = 'deck'; } }
        if (nearPlat) { const d = platDeck(x, z); if (d > -1e8 && d >= Math.max(h, SEA - 3)) { h = d; src = 'plat'; } }
        return h;
      },
      surface(x, z) {
        const h = E.height(x, z);
        if (src !== 'ground') return 'paved';   // non-skid steel decks, the bridge deck
        if (o.paved && o.paved(x, z)) return 'paved';   // the landing hards' concrete
        if (o.pads) for (const p of o.pads) if (Math.abs(x - p.x) < p.r && Math.abs(z - p.z) < p.r && Math.hypot(x - p.x, z - p.z) < p.r) return 'paved';
        const r = AW.roadCell(x, z); if (r) return r.surface === 'tarmac' ? 'paved' : 'dirt';
        if (o.surface) { const sf = o.surface(x, z); if (sf) return sf; }   // TERRAIN (wave 3): the islands' own soils (world/terrain.js)
        if (h < 2.2) return 'sand';                                    // the beaches and the sea bed
        const e = 1, sl = Math.hypot(AW.terrain(x + e, z) - AW.terrain(x - e, z), AW.terrain(x, z + e) - AW.terrain(x, z - e)) / (2 * e);
        if (sl > 0.75 || h > ROCK) return 'rock';                      // steep (> ~37 deg) or the bare tops the shader paints rock
        const n = vnoise(x * 0.045, z * 0.045);
        if (h < 6 && n > 0.74) return 'mud';                           // wet hollows behind the beach
        return n > 0.42 ? 'grass' : 'dirt';
      },
      water(x, z) {
        const h = E.height(x, z);
        if (src === 'deck' || src === 'bridge' || src === 'plat') return -Infinity;
        if (nearPlat && platDry(x, z)) return -Infinity;   // inside a landing craft's hull
        return h < SEA ? SEA : -Infinity;
      },
      // things a hull pushes against (trackfm format): trees (that give way), buildings, AA sites, the shafts, other crafts
      obstacles(x, z, r) {
        obs.length = 0; seen.clear(); let nb = 0;
        const i0 = Math.floor((x - r - 2) / CELL), i1 = Math.floor((x + r + 2) / CELL), j0 = Math.floor((z - r - 2) / CELL), j1 = Math.floor((z + r + 2) / CELL);
        const hg = houseGrid();
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
          const k = gk(i, j), a = tgrid.get(k);
          if (a) for (const T of a) if (!T.felled && Math.abs(T.x - x) < r + 1 && Math.abs(T.z - z) < r + 1) obs.push(T);
          const hb = hg.get(k);
          if (hb) for (const B of hb) if (!seen.has(B)) { seen.add(B); obs.push(B); }
        }
        if (o.structs) for (const s of o.structs()) {
          if (s.dead || Math.abs(s.x - x) > r + 12 || Math.abs(s.z - z) > r + 12) continue;
          let b = sObs.get(s); if (!b) { b = { kind: 'cyl', x: 0, z: 0, r: 1, top: 0, id: 'struct' + sObs.size }; sObs.set(s, b); }
          b.x = s.x; b.z = s.z; b.r = s.kind === 'aa' ? 2.2 : (s.r || 4) * 0.8; b.top = s.y + Math.max(2.5, (s.h || 2) * 2);
          obs.push(b);
        }
        for (const h of holes) if (Math.abs(h.x - x) < r + h.r && Math.abs(h.z - z) < r + h.r) obs.push(h);
        // COLLISION (wave 3, o.cw = the game's collision world): a craft lighter than PUSH_RATIO of this hull that can be
        // pushed is not an obstacle (the contact response shoves it: a tank through a car); the ground war's machines and
        // men come from the collision world too (the heavy ones, and the wrecks, are obstacles; the light ones are shoved)
        const cw = o.cw, myM = cw ? (typeof self.mass === 'function' ? self.mass() : self.mass || 1e9) : 0;
        if (o.bounds) for (const B of o.bounds(self)) {
          if (Math.abs(B.x - x) > r + B.hl + B.hw || Math.abs(B.z - z) > r + B.hl + B.hw) continue;
          if (cw && B.def && B.def._cwb && !cw.hard(myM, B.def._cwb)) continue;
          const b = bPool[nb] ||= { kind: 'box', x: 0, z: 0, hx: 0, hz: 0, yaw: 0, top: 0, id: 'craft' + nb }; nb++;
          b.kind = 'box'; b.x = B.x; b.z = B.z; b.hx = B.hw; b.hz = B.hl; b.yaw = B.yaw; b.top = B.y1; b.id = 'craft:' + (B.def ? B.def.id : nb);
          obs.push(b);
        }
        if (cw) for (const q of cw.near(x, z, r + 2, cwn, null, false)) {
          if ((q.owner && q.owner.seats) || !(q.cls === 'trk' || q.cls === 'walk' || q.cls === 'inf' || q.cls === 'veh') || !cw.hard(myM, q)) continue;   // (crafts: their bounds above)
          for (const p of q.parts) {
            const b = bPool[nb] ||= { kind: 'box', x: 0, z: 0, hx: 0, hz: 0, yaw: 0, top: 0, id: 'craft' + nb }; nb++;
            if (p.k === 'b') { b.kind = 'box'; b.hx = p.hw; b.hz = p.hl; b.yaw = Math.atan2(p.s, p.c); } else { b.kind = 'cyl'; b.r = p.r; }
            b.x = p.x; b.z = p.z; b.top = p.y1; b.id = 'body:' + q.id; obs.push(b);
          }
        }
        return obs;
      },
      // the laser rangefinder: distance to the first thing along the ray (terrain, a deck, a building, a war target)
      raycast(p, d, max = 5000, terrainOnly = false) {   // terrainOnly: the ground and decks (camera aim, reticles)
        let s = 0, step = 0.75, prevAbove = true;
        const hg = houseGrid();
        while (s < max) {
          s += step; step = Math.min(6, step * 1.04);
          const x = p[0] + d[0] * s, y = p[1] + d[1] * s, z = p[2] + d[2] * s;
          const g = s < 120 ? E.height(x, z) : Math.max(H0(x, z), o.deckY ? o.deckY(x, z) : -1e9);
          if (y < Math.max(g, SEA)) { if (prevAbove) return s; }
          if (terrainOnly) continue;
          if (o.hitTest && o.hitTest(x, y, z)) return s;
          const hb = hg.get(gk(Math.floor(x / CELL), Math.floor(z / CELL)));
          if (hb) for (const B of hb) if (y < B.top && inBox(B, x, z)) return s;
          if (o.bounds) for (const B of o.bounds(self)) if (y > B.y0 && y < B.y1 && Math.abs(x - B.x) < B.hl + B.hw && inBox({ x: B.x, z: B.z, yaw: B.yaw, hx: B.hw, hz: B.hl }, x, z)) return s;
          prevAbove = true;
        }
        return null;
      },
    };
    return E;
  };
  function inBox(B, x, z) { const c = Math.cos(B.yaw), s = Math.sin(B.yaw), dx = x - B.x, dz = z - B.z; return Math.abs(dx * c - dz * s) < B.hx && Math.abs(dx * s + dz * c) < B.hz; }

  // ---------------------------------------------------------------- platform-relative motion for a trackfm sim
  // st = { x, y, z, yaw, plat, loc, carried } (keep one per vehicle). carry() before V.step (and again after the war moved
  // the ships): the deck's motion since the last settle() moves the hull exactly - position, heading, velocity turn with
  // it - so the sim only models motion relative to the deck. settle() after the step re-attaches to the deck below.
  const _o = [0, 0, 0];
  AW.carry = (fm, st) => {
    fm.origin(_o); st.x = _o[0]; st.y = _o[1]; st.z = _o[2];
    PF.carry(st); const c = st.carried; if (!c) return null;
    if (c.dyaw) yawAbout(fm, c.dyaw, _o);
    fm.pos[0] += c.dx; fm.pos[1] += c.dy; fm.pos[2] += c.dz;
    refreshR(fm);
    return c;
  };
  AW.settle = (fm, st) => {
    fm.origin(_o); st.x = _o[0]; st.y = _o[1]; st.z = _o[2];
    const onGround = fm.load[0] + fm.load[1] > 0.15 * fm.mass * 9.81;
    PF.settle(st, onGround);
    return st.plat;
  };
  return AW;
}

// rotate a trackfm hull by a about the world vertical through point c (three.js sense: + = left / CCW from above)
export function yawAbout(fm, a, c) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const rx = fm.pos[0] - c[0], rz = fm.pos[2] - c[2];
  fm.pos[0] = c[0] + rx * ca + rz * sa; fm.pos[2] = c[2] - rx * sa + rz * ca;
  const vx = fm.vel[0], vz = fm.vel[2]; fm.vel[0] = vx * ca + vz * sa; fm.vel[2] = -vx * sa + vz * ca;
  const q = fm.q, cw = Math.cos(a / 2), sy = Math.sin(a / 2), bx = q.x, by = q.y, bz = q.z, bw = q.w;
  q.w = cw * bw - sy * by; q.x = cw * bx + sy * bz; q.y = cw * by + sy * bw; q.z = cw * bz - sy * bx;
  const l = Math.hypot(q.x, q.y, q.z, q.w); q.x /= l; q.y /= l; q.z /= l; q.w /= l;
}
// recompute fm.R from fm.q (trackfm does it at each substep; the host needs it right after it moved the hull)
export function refreshR(fm) {
  const { x, y, z, w } = fm.q, m = fm.R, x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  m[0] = 1 - (yy + zz); m[1] = xy - wz; m[2] = xz + wy; m[3] = xy + wz; m[4] = 1 - (xx + zz); m[5] = yz - wx; m[6] = xz - wy; m[7] = yz + wx; m[8] = 1 - (xx + yy);
}
