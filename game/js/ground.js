// FOUNDATION: the GROUND HOST - everything a soldier on foot or a wheeled / tracked vehicle needs from the world, as
// plain functions (no THREE in the interface), so a pure unit sim (footsim.js, units/*/<unit>sim.js) can run against
// it in the game and against a stub in a node bench.
//
//   const GR = createGround({ war, terrainH, holeOf, PADS, ISLANDS, CARRIER, trees, crafts, inZone });
//   GR.sample(x, z, out)          -> { h, nx, ny, nz, surface, water, plat, mu, crr, sink, skid, bed }   (see SURF below;
//                                    under water surface is 'water' and bed what the sea bed is: sand, rock, shingle)
//   GR.surfaceAt(x, z)            -> the surface name at (x, z) without the normal (cheap): decks, pads, roads, the
//                                    islands' own ground (world/terrain.js zoneSurf), 'water' afloat, 'hole' over a shaft
//   GR.surfAt(x, z)               -> SURF[GR.surfaceAt(x, z)]: { mu, crr, sink, speed, skid } (skids and landing gear)
//   GR.floor(x, z, y, step)       -> the surface you would stand on at (x, z) from height y: decks / terrain / pads;
//                                    +Infinity for a wall (more than `step` above y, a shaft mouth), seabed under water
//   GR.collide(o, skip)           -> pushes the circle o = { x, z, r, y0, y1 } out of trees, buildings, ship
//                                    superstructures and every parked / driven craft except `skip`; returns contacts
//   GR.ladderAt(x, z, y, r)       -> a ladder you are touching (carrier stern + island), or null
//   GR.carry(o) / GR.settle(o)    -> platform-relative motion: carry() before a step moves o with the ship it stands
//                                    on (moving, turning, even flying carriers); settle() after the step re-attaches it
//   GR.platVel(x, z)              -> { vx, vz, w, cx, cz } velocity of the deck under (x, z), or null
//   GR.spawns(kind)               -> where vehicles and soldiers can appear: carrier deck spots, island motor pools
//   GR.motorPool(I)               -> a clear, flat spot beside island I's pad for a delivered vehicle (or null)
//   GR.beach(I, toward)           -> a landing beach on island I facing toward [x, z] (dry sand, gentle, nose inland)
//   GR.addSurface(fn)             -> fn(x, z) returns a surface name or null: roads, mud, airstrips (WORLD agent)
//   GR.addCollider(c)             -> extra static circles { x, z, r, y0, y1 } or boxes { x, z, yaw, hl, hw, y0, y1 }
//   GR.G                          -> 9.81 (the ground units use real gravity, like the Huey)
import { createPlatforms } from './platform.js';
import { shipPointY } from './units/naval/seamotion.js';
import { zoneSurf, inGrid, SURFACE, beachesOf } from './world/terrain.js';   // TERRAIN (wave 3): the islands' surface types

// surface table: tyre / boot friction coefficient mu and rolling-resistance coefficient crr for a pneumatic tyre.
// INFERRED typical values (Wong, Theory of Ground Vehicles 4th ed. tables 1.2 / 2.1; SAE J2452 ranges):
//   dry asphalt / concrete mu 0.8-0.9, crr 0.013-0.015; gravel / rock mu 0.6-0.7, crr 0.02; grass / farmland mu 0.4-0.55,
//   crr 0.05-0.08; loose sand mu 0.4-0.55, crr 0.15-0.3; mud mu 0.3-0.4, crr 0.1-0.15; non-skid steel deck mu ~0.8.
// `sink`: how far a wheel / track settles in (m), `speed`: soldier walking speed factor.
// skid: helicopter skid (steel shoe) friction relative to concrete (TERRAIN, INFERRED: it ploughs in sand, glides on mud).
// TERRAIN (wave 3): the islands' own surfaces (wetsand, shingle, marsh, and the canonical numbers for the rest) come from
// world/terrain.js SURFACE, the one table every sim reads; road / deck / water / hole are the host's.
export const SURF = {
  road:  { mu: 0.85, crr: 0.015, sink: 0,    speed: 1,   skid: 1 },
  deck:  { mu: 0.8,  crr: 0.015, sink: 0,    speed: 1,   skid: 1 },
  water: { mu: 0.45, crr: 0.15,  sink: 0.05, speed: 0.5, skid: 0.9 },   // the (sandy) bottom under shallow water: wading drag is the sim's
  hole:  { mu: 0,    crr: 1,     sink: 0,    speed: 0,   skid: 0 },
};
for (const [k, v] of Object.entries(SURFACE)) SURF[k] = { mu: v.mu, crr: v.crr, sink: v.sink, speed: v.speed, skid: v.skid };
// the natural ground's surface: the islands' surface map inside the zone grid, the old height / slope rule in the wild lands
const naturalSurf = (x, z, t, ny, inZone) => inGrid(x, z) ? zoneSurf(x, z) : t < 2.5 ? 'sand' : ny < 0.78 || (inZone(x, z) ? t > 30 : t > 200) ? 'rock' : 'grass';
export const GRAV = 9.81;


export function createGround(ctx) {
  const { war, terrainH, holeOf, PADS, CARRIER } = ctx;
  const ISLANDS = ctx.ISLANDS;
  const providers = [], extra = [], floors = [], sources = [];   // SEAWORLD: floors (piers, bridge decks) and collider sources (the world's buildings)
  const GR = { G: GRAV, SURF };

  // ------------------------------------------------------------------ static circles: island trees in a hash grid
  const CELL = 8, grid = new Map();
  const key = (i, j) => i * 100003 + j;
  for (const t of ctx.trees || []) { const k = key(Math.floor(t.x / CELL), Math.floor(t.z / CELL)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(t); }

  // ------------------------------------------------------------------ surface sampling
  const padAt = (x, z) => { for (const p of PADS) { const d = Math.hypot(x - p.x, z - p.z); if (d < (p.isl.cave ? 20 : 26)) return p; } return null; };
  GR.sample = (x, z, out = {}) => {
    const t = terrainH(x, z), deck = deckH(x, z);
    out.plat = null; out.water = 0; out.nx = 0; out.ny = 1; out.nz = 0;
    out.bed = null;
    if (holeOf(x, z)) { out.h = -1e4; out.surface = 'hole'; }
    else if (deck > -1e8 && deck >= Math.max(t, 0) - 0.05) { out.h = deck; out.surface = 'deck'; out.plat = war.shipAt(x, z) || null; }
    else {
      out.h = t; if (t < 0) out.water = -t;
      const e = 1;
      const hx = terrainH(x + e, z) - terrainH(x - e, z), hz = terrainH(x, z + e) - terrainH(x, z - e), l = Math.hypot(hx, 2 * e, hz);
      out.nx = -hx / l; out.ny = 2 * e / l; out.nz = -hz / l;
      let s = null; for (const f of providers) { s = f(x, z, t); if (s) break; }
      out.surface = s || (t <= 0 ? 'water' : padAt(x, z) ? 'road' : naturalSurf(x, z, t, out.ny, ctx.inZone));
      if (t <= 0) out.bed = naturalSurf(x, z, t, out.ny, ctx.inZone);
    }
    const S = SURF[out.surface] || SURF.grass; out.mu = S.mu; out.crr = S.crr; out.sink = S.sink; out.skid = S.skid;
    return out;
  };
  // TERRAIN: the surface alone (no normal: cheap enough for every skid / wheel contact each step)
  GR.surfaceAt = (x, z) => {
    if (holeOf(x, z)) return 'hole';
    const t = terrainH(x, z), deck = deckH(x, z);
    if (deck > -1e8 && deck >= Math.max(t, 0) - 0.05) return 'deck';
    for (const f of providers) { const s = f(x, z, t); if (s) return s; }
    return t <= 0 ? 'water' : padAt(x, z) ? 'road' : naturalSurf(x, z, t, 1, ctx.inZone);
  };
  GR.surfAt = (x, z) => SURF[GR.surfaceAt(x, z)] || SURF.grass;
  GR.addSurface = fn => { providers.push(fn); };
  // the surface under (x, z) you can stand on from height y (feet): the deck if it is within `step` above you or
  // below you, else the terrain / seabed. Walls (a superstructure, a shaft mouth) come back as +Infinity.
  GR.floor = (x, z, y, step = 0.45, tall = 1.8) => {
    if (holeOf(x, z)) return Infinity;   // the shafts are fenced: walk round them
    const t = terrainH(x, z), deck = deckH(x, z);
    if (deck > -1e8) {
      if (deck <= y + step) return Math.max(deck, t);          // on it, or dropping onto it
      const u = war.shipAt(x, z), bottom = u ? u.p.y - 4 : deck - 12;   // hulls reach 4 m under the waterline
      if (y + tall < bottom) return t;                          // under a flying carrier: the ground below
      return Infinity;                                          // a hull side or a superstructure: a wall
    }
    // SEAWORLD: piers and bridge decks you are on or above (world/solid.js); under them, the ground below
    let f = t; for (const fl of floors) { const v = fl(x, z, y, step); if (v !== null && v > f) f = v; }
    return f;
  };
  GR.addFloor = fn => { floors.push(fn); };   // fn(x, z, y, step) -> a surface height at or below y + step, or null

  // ------------------------------------------------------------------ ships: frames, decks, carrying
  // wave 2 (ngc/foot2): the ALBATROSS island as NAVAL built it (units/naval/albatross.js buildIsland, tower frame:
  // origin TOWER_X, DECK, TOWER_Z). war.deckY knows it only as one 17 m block; on foot it is a stack of levels you
  // bump into from the deck and a walkable top deck (13.3 m up, reached by the ladder on its port face) with the
  // pri-fly box, the funnel and the mast standing on it. Boxes in the ship frame: [x0, x1, z0, z1, y0, y1] (tower
  // relative; y above the flight deck). KRAKEN (units/naval/kraken.js): one block 5.2 x 15.6 m, radar top 13.6 m.
  const ALB_BOXES = [
    [-2.3, 2.6, -8.5, 8.8, 0, 6.4],          // O-3 to O-6 levels
    [-2.4, 2.5, -7.2, 6.0, 6.4, 9.0],        // O-7 flag bridge
    [-2.65, 2.65, -6.15, 4.15, 9.0, 13.05],  // navigation bridge (helm.js inside) and its roof lip
    [-3.4, 1.0, 0.3, 4.9, 13.15, 15.8],      // pri-fly, overhanging to port
    [-2.0, 2.2, 4.1, 8.7, 6.4, 17.8],        // funnel
    [-0.2, 0.4, -1.3, -0.7, 13.3, 28],       // mast
    [-2.5, 2.6, -6.25, -6.05, 13.3, 14.3],   // top-deck rails: forward, starboard, port
    [2.45, 2.65, -6.1, 0.4, 13.3, 14.3],
    [-2.65, -2.45, -6.1, 0.3, 13.3, 14.3],
  ];
  const KRK_BOXES = [[-2.6, 2.6, -7.4, 8.2, 0, 13.65]];
  const ALB_TOP = 13.33;   // the island top deck, above the flight deck
  const isAlb = u => u.type === 'carrier' && u.side === 1;
  // height above the waterline of what you stand on at ship-local (lx, lz) on the ALBATROSS island, or null when
  // (lx, lz) is not over the island
  function albIsland(D, lx, lz, parts) {
    const tx = lx - D.TOWER_X, tz = lz - D.TOWER_Z;
    if (parts && parts.islandFloor) { const h = parts.islandFloor(tx, tz); return h === null ? null : D.DECK + h; }   // NAVAL: the model's own island
    if (tx < -3.4 || tx > 2.9 || tz < -9 || tz > 9.2) return null;
    let h = null;
    if (tx >= -2.3 && tx <= 2.6 && tz >= -8.5 && tz <= 8.8) h = 9.0;                       // lower levels' roofs
    if (tx >= -2.0 && tx <= 2.2 && tz >= 4.1 && tz <= 8.7) h = 17.8;                        // funnel
    if (tx >= -2.65 && tx <= 2.65 && tz >= -6.15 && tz <= 4.15) h = ALB_TOP - 0.03;         // bridge roof
    if (tx >= -2.5 && tx <= 2.65 && tz >= -6.15 && tz <= 0.4) h = ALB_TOP;                  // the top deck
    if (tx >= -3.4 && tx <= 1.0 && tz >= 0.3 && tz <= 4.9) h = 15.8;                        // pri-fly roof
    return h === null ? null : D.DECK + h;
  }
  // the deck under (x, z): war.deckY, with the ALBATROSS island replaced by its real levels
  function deckH(x, z) {
    const c = war.carrier;
    if (c && c.dims && c.side === 1 && Math.abs(x - c.p.x) < 70 && Math.abs(z - c.p.z) < 70 && !(c.sinking > 4)) {
      const [lx, lz] = toLocal(c, x, z), h = albIsland(c.dims, lx, lz, c.parts);
      if (h !== null) { const a = c.att; return a ? shipPointY(c.p.y, a.heave, a.pitch, a.roll, lx, h, lz) : c.p.y + h; }
    }
    return war.deckY(x, z);
  }
  GR.deckH = deckH;
  const PF = createPlatforms({ deckY: deckH, shipAt: (x, z) => war.shipAt(x, z), alive: u => u.sinking === undefined || u.sinking < 4 ? war.units.includes(u) : false,
    subY: (u, lx, lz) => u.parts && u.parts.liftY ? u.parts.liftY(lx, lz) : null });   // SEAWORLD: the ALBATROSS's lifts carry
  const { toLocal, toWorld } = PF;
  const _w = { x: 0, z: 0 };
  GR.toLocal = toLocal; GR.toWorld = toWorld; GR.toShip = PF.toShip; GR.fromShip = PF.fromShip;
  GR.platVel = (x, z) => war.surfVel(x, z);
  GR.carry = PF.carry; GR.settle = PF.settle;   // platform-relative motion (platform.js): the full deck motion

  // ------------------------------------------------------------------ ladders (ship-relative): stern and island
  // { ship: 'carrier', side?, lx, lz, yaw, y0, y1 } : the climber faces direction yaw (forward = (-sin, -cos)); y in the
  // ship frame (above the waterline). The stern ladder comes up from the water (both carriers); the island ladder (the
  // ALBATROSS only) up the island's port face, forward of the bridge wing, to its top deck (wave 2: NAVAL's model).
  const LADDERS = [
    { ship: 'carrier', name: 'STERN LADDER', lx: -7, lz: CARRIER.L / 2 + 0.3, yaw: 0, y0: -1.6, y1: CARRIER.DECK, w: 0.9, top: [0, -0.9] },
    { ship: 'carrier', side: 1, name: 'ISLAND LADDER', lx: CARRIER.TOWER_X - 2.75, lz: CARRIER.TOWER_Z - 6.6, yaw: -Math.PI / 2, y0: CARRIER.DECK, y1: CARRIER.DECK + ALB_TOP, w: 0.9, top: [1.0, 0.9] },
  ];
  GR.LADDERS = LADDERS;
  // NAVAL: a ship model that exports its ladders (parts.ladders, ship frame, drawn by the model) is the authority
  GR.laddersOf = u => u.parts && u.parts.ladders ? u.parts.ladders : LADDERS.filter(L => L.ship === u.type && (L.side === undefined || L.side === u.side));
  const _lw = { x: 0, y: 0, z: 0 };
  // the world-space description of a ladder on ship u: base point, facing, top / bottom heights (deck motion included)
  GR.ladderWorld = (L, u, out = {}) => {
    PF.fromShip(u, L.lx, L.y0, L.lz, _lw); const yaw = u.yaw + L.yaw;
    out.x = _lw.x; out.z = _lw.z; out.y0 = _lw.y; out.yaw = yaw; out.fx = -Math.sin(yaw); out.fz = -Math.cos(yaw);
    out.y1 = PF.fromShip(u, L.lx, L.y1, L.lz, _lw).y; out.w = L.w; out.name = L.name; out.ship = u; out.L = L;
    PF.fromShip(u, L.lx + L.top[0], L.y1, L.lz + L.top[1], _lw); out.tx = _lw.x; out.tz = _lw.z;
    return out;
  };
  const _lad = {};
  GR.ladderAt = (x, z, y, r = 0.5) => {
    for (const u of war.units) {
      if (!u.dims || u.sinking !== undefined || Math.abs(x - u.p.x) > 80 || Math.abs(z - u.p.z) > 80) continue;
      for (const L of GR.laddersOf(u)) {
        const w = GR.ladderWorld(L, u, _lad);
        const dx = x - w.x, dz = z - w.z, along = dx * w.fz - dz * w.fx, off = -(dx * w.fx + dz * w.fz);   // off: how far in front of the rungs
        if (Math.abs(along) < w.w / 2 + 0.15 && off > -0.2 && off < r + 0.45 && y > w.y0 - 0.6 && y < w.y1 + 0.2) return w;
      }
    }
    return null;
  };

  // ------------------------------------------------------------------ colliders
  // circle (o.x, o.z, o.r) against: island trees, island buildings and AA guns, ship superstructures (as boxes in the
  // ship frame), extra static colliders, and every craft's footprint (crafts.bounds(skip)). Vertical overlap uses
  // o.y0..o.y1. Moves o out of whatever it overlaps; returns the number of contacts (o.nx / o.nz = last push normal).
  function pushCircle(o, cx, cz, r) {
    const dx = o.x - cx, dz = o.z - cz, d = Math.hypot(dx, dz), m = o.r + r;
    if (d >= m) return false;
    const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
    o.x = cx + nx * m; o.z = cz + nz * m; o.nx = nx; o.nz = nz; return true;
  }
  function pushBox(o, b) {   // b: { x, z, yaw, hl (half length along forward), hw (half width), y0, y1 }
    if (o.y1 < b.y0 || o.y0 > b.y1) return false;
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = o.x - b.x, dz = o.z - b.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;   // ship-style local frame (x right, z aft)
    const qx = Math.max(-b.hw, Math.min(b.hw, lx)), qz = Math.max(-b.hl, Math.min(b.hl, lz));
    let ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
    if (d >= o.r) return false;
    let nlx, nlz, pen;
    if (d > 1e-6) { nlx = ex / d; nlz = ez / d; pen = o.r - d; }
    else {   // centre inside the box: out through the nearest face
      const fx = b.hw - Math.abs(lx), fz = b.hl - Math.abs(lz);
      if (fx < fz) { nlx = Math.sign(lx) || 1; nlz = 0; pen = fx + o.r; } else { nlx = 0; nlz = Math.sign(lz) || 1; pen = fz + o.r; }
    }
    const nx = nlx * c + nlz * s, nz = -nlx * s + nlz * c;   // back to world
    o.x += nx * pen; o.z += nz * pen; o.nx = nx; o.nz = nz; return true;
  }
  GR.pushBox = pushBox; GR.pushCircle = pushCircle;
  // circle o against axis-aligned boxes in a ship's own frame (offset ox, oz, oy): o is taken into the ship frame,
  // pushed out there, and the push is turned back into the world (so a rolling ship's island leans with her)
  const BS_BOXES = [[-4.5, 4.5, -10, 10, 0, 14]], FR_BOXES = [[-4.3, 4.3, -3.2, 3.2, 0, 6]];
  const _sl = { x: 0, y: 0, z: 0 }, _sl2 = { x: 0, y: 0, z: 0 };
  const _rails = [];
  function shipBoxes(o, u, boxes, ox, oz, oy) {
    const top = Math.min(o.y1, o.y0 + 4), ym = (o.y0 + top) / 2, hh = (top - o.y0) / 2;
    PF.toShip(u, o.x, ym, o.z, _sl);
    const lx0 = _sl.x, lz0 = _sl.z, ly = _sl.y; let lx = lx0, lz = lz0, n = 0, nlx = 0, nlz = 0;
    for (const b of boxes) {
      if (ly + hh < oy + b[4] || ly - hh > oy + b[5]) continue;
      const x0 = ox + b[0], x1 = ox + b[1], z0 = oz + b[2], z1 = oz + b[3];
      const qx = Math.max(x0, Math.min(x1, lx)), qz = Math.max(z0, Math.min(z1, lz));
      const ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
      if (d >= o.r) continue;
      if (d > 1e-6) { lx = qx + ex / d * o.r; lz = qz + ez / d * o.r; nlx = ex / d; nlz = ez / d; }
      else {   // centre inside: out through the nearest face
        const f = [lx - x0, x1 - lx, lz - z0, z1 - lz], k = f.indexOf(Math.min(...f));
        if (k === 0) { lx = x0 - o.r; nlx = -1; nlz = 0; } else if (k === 1) { lx = x1 + o.r; nlx = 1; nlz = 0; } else if (k === 2) { lz = z0 - o.r; nlx = 0; nlz = -1; } else { lz = z1 + o.r; nlx = 0; nlz = 1; }
      }
      n++;
    }
    if (!n) return 0;
    // back to the world: the push (lx - lx0, lz - lz0) made in the ship frame
    PF.fromShip(u, lx, ly, lz, _sl2); const wx = _sl2.x, wz = _sl2.z;
    PF.fromShip(u, lx0, ly, lz0, _sl2);
    o.x += wx - _sl2.x; o.z += wz - _sl2.z;
    const c = Math.cos(u.yaw), s = Math.sin(u.yaw); o.nx = nlx * c + nlz * s; o.nz = -nlx * s + nlz * c;
    return n;
  }
  GR.collide = (o, skip = null) => {
    let n = 0; o.y0 ??= -1e9; o.y1 ??= 1e9;
    // trees (trunks)
    const i0 = Math.floor((o.x - 2) / CELL), i1 = Math.floor((o.x + 2) / CELL), j0 = Math.floor((o.z - 2) / CELL), j1 = Math.floor((o.z + 2) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = grid.get(key(i, j)); if (a) for (const t of a) if (o.y0 < t.y + 4 && pushCircle(o, t.x, t.z, t.r)) n++; }
    // island buildings, AA guns (alive only: rubble is walkable)
    for (const I of ISLANDS) {
      if (!I.structs || Math.abs(o.x - I.x) > (I.r || 60) + 70 || Math.abs(o.z - I.z) > (I.r || 60) + 70) continue;
      for (const s of I.structs) if (!s.dead && o.y0 < s.y + Math.max(2, s.h * 2) && pushCircle(o, s.x, s.z, (s.kind === 'aa' ? 2.2 : s.r * 0.8))) n++;
    }
    // ship superstructures, in the full ship frame (heave, pitch and roll): the carriers' islands as their models
    // have them (wave 2), the battleship's citadel, the freighter's bridge
    for (const u of war.units) {
      if (!u.dims || Math.abs(o.x - u.p.x) > 70 || Math.abs(o.z - u.p.z) > 70) continue;
      const D = u.dims;
      if (u.type === 'carrier') n += shipBoxes(o, u, u.parts.islandBoxes || (isAlb(u) ? ALB_BOXES : KRK_BOXES), D.TOWER_X, D.TOWER_Z, D.DECK);
      else if (u.type === 'battleship') n += shipBoxes(o, u, BS_BOXES, 0, 4, D.DECK);
      else if (u.type === 'freighter') n += shipBoxes(o, u, FR_BOXES, 0, D.L / 2 - 6, D.DECK);
      if (u.parts && u.parts.boxes) {   // SEAWORLD: the lift railings (ship-frame boxes that move with each lift)
        const bs = u.parts.boxes(); _rails.length = bs.length;
        bs.forEach((b, i) => { const a = _rails[i] ||= []; a[0] = b.lx - b.hw; a[1] = b.lx + b.hw; a[2] = b.lz - b.hl; a[3] = b.lz + b.hl; a[4] = b.y0; a[5] = b.y1; });
        n += shipBoxes(o, u, _rails, 0, 0, 0);
      }
    }
    for (const c of extra) if (c.hl ? pushBox(o, c) : (o.y1 > (c.y0 ?? -1e9) && o.y0 < (c.y1 ?? 1e9) && pushCircle(o, c.x, c.z, c.r))) n++;
    // SEAWORLD: the lived-in world's buildings, walls, hedges, parapets, poles (world/solid.js); o.crush (a tank) goes
    // through the soft ones (field walls, hedges)
    for (const src of sources) for (const c of src(o.x, o.z, o.r + 1)) { if (c.soft && o.crush) continue; if (c.hl !== undefined ? pushBox(o, c) : (o.y1 > c.y0 && o.y0 < c.y1 && pushCircle(o, c.x, c.z, c.r))) n++; }
    if (ctx.crafts) for (const b of ctx.crafts.bounds(skip)) if (pushBox(o, b)) n++;
    return n;
  };
  // wave 2 (ngc/foot2): a round's path (x0..x1, short: one sim step) against the tree trunks -> the nearest fraction t
  // along it and the trunk, or null (the Marine's rounds: a trunk is cover)
  GR.treeHit = (x0, y0, z0, x1, y1, z1) => {
    const i0 = Math.floor((Math.min(x0, x1) - 1) / CELL), i1 = Math.floor((Math.max(x0, x1) + 1) / CELL), j0 = Math.floor((Math.min(z0, z1) - 1) / CELL), j1 = Math.floor((Math.max(z0, z1) + 1) / CELL);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 64) return null;
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1e-9;
    let best = null;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = grid.get(key(i, j)); if (a) for (const t of a) {
      const k = Math.max(0, Math.min(1, ((t.x - x0) * dx + (t.z - z0) * dz) / L2)), px = x0 + dx * k - t.x, pz = z0 + dz * k - t.z;
      if (px * px + pz * pz > t.r * t.r) continue;
      const y = y0 + (y1 - y0) * k; if (y < t.y - 0.5 || y > t.y + 5) continue;
      if (!best || k < best.t) best = { t: k, tree: t };
    } }
    return best;
  };
  GR.addCollider = c => { extra.push(c); return c; };
  GR.addColliderSource = fn => { sources.push(fn); };   // SEAWORLD: fn(x, z, r) -> boxes / circles near (x, z)
  GR.removeCollider = c => { const i = extra.indexOf(c); if (i >= 0) extra.splice(i, 1); };
  // third-person / chase cameras: pull the camera p {x, y, z} in along the line from the eye (ex, ey, ez) to in front of
  // the first thing in the way - the ground, a deck, a hull side, a craft's footprint (except `skip`'s)
  GR.clearView = (ex, ey, ez, p, skip = null) => {
    const dx = p.x - ex, dy = p.y - ey, dz = p.z - ez, boxes = ctx.crafts ? ctx.crafts.bounds(skip) : [];
    let tHit = 1;
    for (let t = 0.1; t <= 1.0001 && tHit === 1; t += 0.05) {
      const x = ex + dx * t, y = ey + dy * t, z = ez + dz * t;
      if (GR.floor(x, z, y, 0.2) > y - 0.15) { tHit = t; break; }
      for (const b of boxes) {
        if (y < b.y0 || y > b.y1) continue;
        const c = Math.cos(b.yaw), s = Math.sin(b.yaw), qx = x - b.x, qz = z - b.z, lx = qx * c - qz * s, lz = qx * s + qz * c;
        if (Math.abs(lx) < b.hw + 0.2 && Math.abs(lz) < b.hl + 0.2) { tHit = t; break; }
      }
    }
    if (tHit < 1) { const k = Math.max(0.12, tHit - 0.08); p.x = ex + dx * k; p.y = ey + dy * k; p.z = ez + dz * k; }
    return tHit < 1;
  };

  // ------------------------------------------------------------------ spawn points
  // carrier deck parking spots (local; clear of the catapult and the landing area). SEAWORLD: moved to the port bow
  // (were x 9 on the starboard side, nose to nose with the parked Hornets, which are solid now), clear 12 m ahead
  const DECK_SPOTS = [{ name: 'ALBATROSS DECK PARK 1', lx: -10.5, lz: -16, yaw: 0 }, { name: 'ALBATROSS DECK PARK 2', lx: -10.5, lz: -29, yaw: 0 }, { name: 'ALBATROSS DECK PARK 3', lx: -10.5, lz: -42, yaw: 0 }];
  GR.DECK_SPOTS = DECK_SPOTS;
  // SEAWORLD: parked aircraft are solid now, so a spot is used only when the deck round it is clear (flat at deck
  // height over a car-sized 2.2 x 4.8 m footprint); else the next of these candidates (port side forward, aft of the island)
  const DECK_SPARE = [{ lx: 9, lz: -20 }, { lx: 4.5, lz: 16 }, { lx: 11, lz: 12 }, { lx: -9.5, lz: 6 }];
  const deckClear = (u, lx, lz) => {
    if (!u.parts || !u.parts.localDeck) return true;
    for (const [ox, oz] of [[0, 0], [1.1, 0], [-1.1, 0], [0, 2.4], [0, -2.4], [1.1, 2.4], [-1.1, 2.4], [1.1, -2.4], [-1.1, -2.4]]) if (Math.abs(u.parts.localDeck(lx + ox, lz + oz) - CARRIER.DECK) > 0.05) return false;
    return true;
  };
  GR.deckSpot = (k = 0) => {
    const u = war.carrier; if (!u || u.sinking !== undefined) return null;
    const cands = [...DECK_SPOTS, ...DECK_SPARE.map((s, i) => ({ name: `ALBATROSS DECK PARK ${DECK_SPOTS.length + i + 1}`, yaw: 0, ...s }))].filter(s => deckClear(u, s.lx, s.lz));
    if (!cands.length) return null;
    const s = cands[k % cands.length]; toWorld(u, s.lx, s.lz, _w);
    return { name: s.name, x: _w.x, z: _w.z, y: deckH(_w.x, _w.z), yaw: u.yaw + s.yaw, plat: u };
  };
  const _o = { x: 0, z: 0, r: 2.4 };
  GR.clearAt = (x, z, r = 2.4, skip = null) => { _o.x = x; _o.z = z; _o.r = r; _o.y0 = -1e9; _o.y1 = 1e9; return GR.collide(_o, skip) === 0 && Math.hypot(_o.x - x, _o.z - z) < 0.01; };
  // beside the pad of island I, on flat dry ground, nose to the pad
  GR.motorPool = (I, r = 2.4) => {
    const p = I.pad; if (!p) return null;
    for (const d of [p.r + 7, p.r + 11, p.r + 15]) for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6 + 0.3, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (holeOf(x, z) || terrainH(x, z) < 1) continue;
      const s = GR.sample(x, z); if (s.ny < 0.96) continue;
      if (!GR.clearAt(x, z, r + 1)) continue;
      return { name: `${I.name} MOTOR POOL`, x, z, y: s.h, yaw: Math.atan2(x - p.x, z - p.z), plat: null };   // parked facing the pad
    }
    return null;
  };
  // a landing beach on island I on the side facing `toward` [x, z] (default: the ALBATROSS): dry sand just above the
  // waterline, gentle, clear, nose inland - where a landing craft would put a vehicle or a squad ashore
  GR.beach = (I, toward) => {
    const t0 = toward || (war.carrier ? [war.carrier.p.x, war.carrier.p.z] : [0, 0]), a0 = Math.atan2(t0[1] - I.z, t0[0] - I.x);
    // TERRAIN (wave 3): the island's real landing beaches first (world/terrain.js), the one facing `toward` best
    const bs = beachesOf(I).map(B => ({ B, d: Math.abs(Math.atan2(Math.sin(Math.atan2(-B.fz, -B.fx) - a0), Math.cos(Math.atan2(-B.fz, -B.fx) - a0))) })).sort((p, q) => p.d - q.d);
    for (const { B } of bs) for (let u = 8; u <= Math.max(10, B.u1 - 4); u += 2) {
      const [x, z] = B.at(u), h = terrainH(x, z);
      if (h < 0.4 || h > 2.4 || holeOf(x, z) || !GR.clearAt(x, z, 2.5)) continue;
      return { name: B.name, x, z, y: h, yaw: B.yaw, plat: null };   // nose inland
    }
    for (let k = 0; k < 24; k++) {
      const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.13, cx = Math.cos(a), sz = Math.sin(a);
      for (let r = 10; r < (I.r || 80) + 120; r += 1.5) {
        const x = I.x + cx * r, z = I.z + sz * r, h = terrainH(x, z);
        if (h > 2.2) continue;
        if (h < 0.4) break;   // past the dry sand
        if (Math.abs(terrainH(x - sz * 2, z + cx * 2) - terrainH(x + sz * 2, z - cx * 2)) > 0.4 || terrainH(x - cx * 3, z - sz * 3) - h > 1.2) break;
        if (!GR.clearAt(x, z, 2.5) || holeOf(x, z)) break;
        return { name: `${I.name} BEACH`, x, z, y: h, yaw: Math.atan2(cx, sz), plat: null };   // nose inland
      }
    }
    return null;
  };
  GR.spawns = () => {
    const out = [];
    for (let k = 0; k < DECK_SPOTS.length; k++) { const s = GR.deckSpot(k); if (s) out.push(s); }
    for (const I of ISLANDS) if (I.owner === 1) { const s = GR.motorPool(I); if (s) out.push(s); const b = GR.beach(I); if (b) out.push(b); }
    return out;
  };
  return GR;
}
