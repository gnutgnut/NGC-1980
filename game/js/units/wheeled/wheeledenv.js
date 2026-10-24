// wheeledenv.js - the game world as vehiclefm.js sees it (ngc/wheeledgame). Built on index.js makeTerrainEnv, one env per
// vehicle (each knows its own height, for bridges and decks) over shared caches. Pure: no THREE.
//
//   const W = createWorldEnv({ GR, terrainH, holes, world: { roadAt, roadById, roadPoint, buildingsNear } });
//   const env = W.forVehicle(V)      // V: { sim, self (the craft def: its own footprint is skipped), near (broadphase) }
//   W.frame(V)                       // once per vehicle frame before stepping: broadphase, bridge under it
//
// What it gives the sim:
// - height: the game's terrain (islands, pads, aprons, the cave strips, WORLD road beds and building platforms) through
//   a 1 m lattice cache with bilinear interpolation (terrainH costs ~1-2 us and the sim asks ~300 times a substep), the
//   normal from the bilinear patch; bridge decks from WORLD roadAt().y when the vehicle is up on the deck (bridge decks
//   are not in the terrain); ship decks from the ground host (GR.deckH), carried kinematically by platform.js, so the
//   deck is still under the wheels (velocity 0) and the sim only models motion relative to it.
// - surface: WORLD roads (tarmac / dirt) first, then the ground host's surfaces (pads = tarmac, sand, rock, grass, mud,
//   the sea bottom = sand), as tyre.js indices, cached per 1 m cell.
// - water: the sea (y = 0) where the terrain is below it and no deck covers it (fording, flooding, buoyancy).
// - collide: GR.collide (island trees, island buildings and AA guns, ship superstructures, extra colliders, every
//   craft's footprint), the WORLD's buildings, garden trees, lamps and walls near the vehicle (boxes and circles),
//   bridge parapets, the fenced cave shafts, and terrain faces too steep to be ground (the WHEELED report: a heightfield
//   cliff probed by the tyres alone kicks; as an obstacle it stops the vehicle).
import { makeTerrainEnv } from './index.js';
import { SURF } from './tyre.js';
import { SURFACE } from '../../world/terrain.js';   // TERRAIN (wave 3): the islands' surfaces and their tyre names

const CK = (i, j) => i * 4194304 + j;   // cell key (|i|, |j| < 2e6 m)
const S_TARMAC = SURF.tarmac, S_DIRT = SURF.dirt, S_DECK = SURF.deck;
const LIFT = { tarmac: 0.14, lane: 0.13, street: 0.12, dirt: 0.10 };   // world/chunkgen.js LIFT
const FROM_GR = { road: SURF.tarmac, deck: SURF.deck, rock: SURF.rock, grass: SURF.grass, sand: SURF.sand, mud: SURF.mud, water: SURF.sand, hole: SURF.rock };   // (TERRAIN: the rest - wetsand, shingle, marsh, dirt - by terrain.js SURFACE .tyre; under water, the sea bed)

export function createWorldEnv(o) {
  const { GR, terrainH, holes = [], world = {} } = o;
  const H = new Map(), SU = new Map(), BR = new Map();
  let hits = 0, misses = 0;
  // the road ribbons are drawn LIFT above the road bed (world/chunkgen.js): the wheels roll on the ribbon (lattice nodes on a
  // road are raised, so the 1 m bilinear patch ramps up over the verge like the drawn shoulder)
  const roadLift = (x, z) => { if (!world.roadAt) return 0; const r = world.roadAt(x, z); return r && !r.bridge ? LIFT[r.type] ?? 0.12 : 0; };
  const lat = (i, j) => { const k = CK(i, j); let h = H.get(k); if (h === undefined) { h = terrainH(i, j) + roadLift(i, j); H.set(k, h); misses++; } else hits++; return h; };
  // bilinear terrain height and gradient on the 1 m lattice
  const _g = { h: 0, gx: 0, gz: 0 };
  function terr(x, z, out = _g) {
    const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j;
    const h00 = lat(i, j), h10 = lat(i + 1, j), h01 = lat(i, j + 1), h11 = lat(i + 1, j + 1);
    out.h = h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v;
    out.gx = (h10 - h00) * (1 - v) + (h11 - h01) * v; out.gz = (h01 - h00) * (1 - u) + (h11 - h10) * u;
    return out;
  }
  const _s = {};
  // surface code per 1 m cell (and the bridge deck height there, if any)
  function surfAt(x, z) {
    const i = Math.floor(x), j = Math.floor(z), k = CK(i, j);
    let s = SU.get(k);
    if (s === undefined) {
      const cx = i + 0.5, cz = j + 0.5, r = world.roadAt ? world.roadAt(cx, cz) : null;
      if (r && r.surface && r.road >= 0 || r && r.road === -1) { s = r.surface === 'dirt' ? S_DIRT : S_TARMAC; if (r.bridge) BR.set(k, r.y + (LIFT[r.type] ?? 0.12)); }
      else { GR.sample(cx, cz, _s); s = FROM_GR[_s.surface === 'water' && _s.bed ? _s.bed : _s.surface] ?? SURF[SURFACE[_s.surface === 'water' && _s.bed ? _s.bed : _s.surface]?.tyre] ?? SURF.grass; if (s === SURF.sand && _s.h < 0.8) s = S_DIRT; }   // wet sand at the tide line and under the shallows is firm (the soft dry sand is above it): a beach a jeep can drive into the surf on
      SU.set(k, s);
    }
    return s;
  }
  const bridgeAt = (x, z) => { surfAt(x, z); const b = BR.get(CK(Math.floor(x), Math.floor(z))); return b === undefined ? null : b; };
  // ---- the WORLD's buildings near a point: { boxes: [{x, z, yaw, hl, hw, y0, y1}], circles: [{x, z, r, y0, y1}] }
  const _near = { boxes: [], circles: [] };
  const buildingsNear = world.buildingsNear || (() => _near);

  // ---- per vehicle

  const api = {
    terr, surfAt, bridgeAt, caches: { H, SU, BR }, stats: () => ({ cells: H.size, hitRate: hits / Math.max(1, hits + misses) }),
    frame(V) {
      if (H.size > 400000) H.clear(); if (SU.size > 200000) { SU.clear(); BR.clear(); }
      const S = V.sim, x = S.pos[0], z = S.pos[2], y = S.pos[1], L = S.spec.dims.L;
      // broadphase: anything of the ground host's within reach this frame?
      const reach = L * 0.6 + 2 + Math.hypot(S.vel[0], S.vel[2]) * 0.1;
      _bp.x = x; _bp.z = z; _bp.r = reach; _bp.y0 = y - 1; _bp.y1 = y + 4;
      V.near = GR.collide(_bp, V.self) > 0;
      const B = buildingsNear(x, z, reach + 8);
      V.boxes = B.boxes; V.circles = B.circles;
      V.others = world.vehiclesNear ? world.vehiclesNear(V, x, z, reach + 8) : null;   // other wheeled vehicles (to push them)
      // on a bridge? (the deck height decides which surface the wheels see: deck or the gorge under it)
      const by = bridgeAt(x, z); V.onBridge = by !== null && y > by - 1.2 ? by : null;
      V.bridgeRoad = null;
      if (V.onBridge !== null && world.roadAt) { const r = world.roadAt(x, z); if (r && r.bridge && r.road >= 0) { V.bridgeRoad = r; r.y += LIFT[r.type] ?? 0.12; } }
      // the carrier island levels are not ground for a vehicle on the flight deck: remember the deck level here
      // a ship's deck within reach? (the deck queries cost a walk over the war's ships: only then)
      V.shipNear = world.shipNear ? world.shipNear(x, z, 140) : true;
      const d = V.shipNear ? GR.deckH(x, z) : -1e9; if (d > -1e8 && Math.abs(d - y) < 3) V.deckLevel = d;
    },
    forVehicle(V) {
      const yNow = () => V.sim.pos[1];
      const height = (x, z) => {
        const t = terr(x, z).h, y = yNow();
        const d = V.shipNear ? GR.deckH(x, z) : -1e9;
        if (d > -1e8 && d >= t - 0.05) {
          if (d < y + 2.5 && d > y - 3) { V._deck = true; return d; }
          if (d >= y + 2.5 && V.deckLevel !== undefined && Math.abs(V.deckLevel - y) < 3) { V._deck = true; return V.deckLevel; }   // the island block: a wall (collide), not a step
        }
        V._deck = false;
        const b = bridgeAt(x, z); if (b !== null && b > t && y > b - 1.5) return b;
        return t;
      };
      const normal = (x, z, out) => {
        if (V._deck) { out.nx = 0; out.ny = 1; out.nz = 0; return; }
        const g = terr(x, z), b = bridgeAt(x, z);
        if (b !== null && b > g.h && yNow() > b - 1.5) { out.nx = 0; out.ny = 1; out.nz = 0; return; }
        const l = Math.hypot(g.gx, 1, g.gz); out.nx = -g.gx / l; out.ny = 1 / l; out.nz = -g.gz / l;
      };
      const surface = (x, z) => V._deck ? S_DECK : surfAt(x, z);
      const water = (x, z) => {
        const t = terr(x, z).h; if (t >= 0) return -Infinity;
        if (V.shipNear && GR.deckH(x, z) > -1e8) return -Infinity;
        return 0;
      };
      const co = { x: 0, z: 0, r: 0, y0: 0, y1: 0, nx: 0, nz: 0 }, tg = { h: 0, gx: 0, gz: 0 };
      const collide = (x, y, z, r, out) => {
        let best = 0, nx = 0, ny = 0, nz = 0, id = null;
        const take = (d, ax, ay, az, who) => { if (d > best) { best = d; nx = ax; ny = ay; nz = az; id = who; } };
        if (V.near) {   // the ground host: trees, island buildings, ship islands, other crafts' footprints
          co.x = x; co.z = z; co.r = r; co.y0 = y - r; co.y1 = y + r;
          if (GR.collide(co, V.self)) { const dx = co.x - x, dz = co.z - z, d = Math.hypot(dx, dz); if (d > 1e-6) take(d, dx / d, 0, dz / d, 'ground'); }
        }
        for (const b of V.boxes || []) {
          if (y + r < b.y0 || y - r > b.y1) continue;
          co.x = x; co.z = z; co.r = r; co.y0 = y - r; co.y1 = y + r;
          if (GR.pushBox(co, b)) { const dx = co.x - x, dz = co.z - z, d = Math.hypot(dx, dz); if (d > 1e-6) take(d, dx / d, 0, dz / d, b.id || 'building'); }
        }
        for (const b of V.others || []) {   // another wheeled vehicle: the impact event carries it (wheeledcraft.js pushes it)
          if (y + r < b.y0 || y - r > b.y1) continue;
          co.x = x; co.z = z; co.r = r; co.y0 = y - r; co.y1 = y + r;
          if (GR.pushBox(co, b)) { const dx = co.x - x, dz = co.z - z, d = Math.hypot(dx, dz); if (d > 1e-6) take(d + 0.001, dx / d, 0, dz / d, b.def); }
        }
        for (const c of V.circles || []) {
          if (y + r < c.y0 || y - r > c.y1) continue;
          const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = r + c.r;
          if (d < m && d > 1e-6) take(m - d, dx / d, 0, dz / d, c.id || 'post');
        }
        for (const hl of holes) {   // the cave shafts are fenced
          const dx = x - hl.x, dz = z - hl.z, d = Math.hypot(dx, dz), m = r + hl.r;
          if (d < m && d > 1e-6) take(m - d, dx / d, 0, dz / d, 'shaft');
        }
        // bridge parapets: keep a vehicle on the deck between its kerbs
        const br = V.bridgeRoad;
        if (br && world.roadPoint && Math.abs(y - br.y) < 2.5) {
          const R = world.roadById(br.road), p = world.roadPoint(R, br.s, 0, _rp), lat = (x - p.x) * -p.dz + (z - p.z) * p.dx;   // + = right of the point order (net.js roadPoint)
          const lim = br.hw + 0.05;   // the parapets stand 5 cm past the paved edge (chunkgen.js)
          if (Math.abs(lat) + r > lim) { const s = Math.sign(lat) || 1; take(Math.abs(lat) + r - lim, p.dz * s, 0, -p.dx * s, 'parapet'); }
        }
        // terrain too steep to drive: a face, not a slope
        const t = terr(x, z, tg), bot = y - r;
        if (t.h > bot + 0.02) {
          const l = Math.hypot(t.gx, 1, t.gz), tny = 1 / l;
          if (tny < 0.55 && !V._deck) take((t.h - bot) * tny, -t.gx / l, tny, -t.gz / l, 'cliff');
        }
        if (best <= 0) return null;
        out.depth = best; out.nx = nx; out.ny = ny; out.nz = nz; out.vx = out.vy = out.vz = 0; out.mu = 0.45; out.id = id;
        return out;
      };
      return makeTerrainEnv({ height, surface, water, collide, normal, g: GR.G || 9.81 });
    },
  };
  return api;
}

const _bp = { x: 0, z: 0, r: 0, y0: 0, y1: 0 }, _rp = {};
