// wheeledworld.js - what of the WORLD (world/layout.js items) a vehicle can run into, and where real parked cars stand
// (ngc/wheeledgame). Pure apart from the WORLD imports (no THREE).
//
//   const WO = createWorldObstacles({ terrainH, zoneItems: () => [...items] });
//   WO.near(x, z, r) -> { boxes: [{ x, z, yaw, hl, hw, y0, y1, id }], circles: [{ x, z, r, y0, y1, id }] }   (ground host style)
//   WO.parkedCars(x, z, r) -> [{ key, x, z, yaw, kind (civ id), paint }]   real cars parked in the towns: on the verge of
//                             their streets (kerbside, by a position hash) and the drivable garden cars (world/parked.js)
//
// Footprints from the layout items (w x d where the item has them; the church, filling station, sheds and street furniture
// from chunkgen.js / models.js sizes), indexed in 32 m cells. Wild settlements and farms are indexed the first time a
// vehicle comes within reach of them (their items are cached by layout.js; the main thread generated them anyway, their
// building platforms are in the terrain).
import { settlementsNear, farmsIn, roadGraph, roadPoint, netState } from '../../world/net.js';
import { hash2 } from '../../world/rng.js';
import { townItems, farmItems } from '../../world/layout.js';
import { isDrivableCar, drivableCarKind, drivableCarPaint } from '../../world/parked.js';

const CELL = 32, CK = (i, j) => i * 1048576 + j;
const CIV = ['landrover', 'hilux', 'beetle', 'lada'];
// half sizes / radii for items without w / d (metres, from models.js)
const FIXED = {
  church: { hw: 14.5, hl: 5.6, h: 18 }, petrol: { hw: 3.6, hl: 2.6, dz: -3.5, h: 4 }, shed: { hw: 1.2, hl: 1.0, h: 2.4 }, garage: { hw: 1.6, hl: 2.9, h: 2.6 },
  woodpile: { hw: 1.2, hl: 0.5, h: 1.2 }, shelter: { hw: 1.6, hl: 0.8, h: 2.4 }, tractor: { hw: 0.95, hl: 1.8, h: 2.6 }, car: { hw: 0.85, hl: 2.15, h: 1.5 },
};
const ROUND = { silo: 2.25, lighthouse: 2.3, memorial: 0.8, phone: 0.55, post: 0.3, lamp: 0.13, sign: 0.1, mast: 1.0 };
const BOXED = new Set(['house', 'cottage', 'terrace', 'barn', 'openshed', 'boatshed']);

export function createWorldObstacles({ terrainH, zoneItems = () => [] }) {
  const grid = new Map(), done = new Set(), cars = [], carKeys = new Set();
  const out = { boxes: [], circles: [] };
  const put = (x, z, rad, o) => {
    for (let i = Math.floor((x - rad) / CELL); i <= Math.floor((x + rad) / CELL); i++) for (let j = Math.floor((z - rad) / CELL); j <= Math.floor((z + rad) / CELL); j++) {
      const k = CK(i, j); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(o);
    }
  };
  function addItem(it) {
    const y = it.ground || !it.y ? terrainH(it.x, it.z) : it.y, y0 = y - (it.drop || 0) - 0.6;
    if (it.t === 'car' && isDrivableCar(it)) {
      const key = `${Math.round(it.x * 2)},${Math.round(it.z * 2)}`;
      if (!carKeys.has(key)) { carKeys.add(key); cars.push({ key, x: it.x, z: it.z, y, yaw: it.yaw, kind: CIV[drivableCarKind(it)], paint: drivableCarPaint(it) }); }
      return;
    }
    if (it.t === 'tree') { put(it.x, it.z, 1, { c: true, x: it.x, z: it.z, r: 0.3 * (it.s || 1), y0, y1: y + 6, id: 'tree' }); return; }
    const R = ROUND[it.t]; if (R) { put(it.x, it.z, R + 1, { c: true, x: it.x, z: it.z, r: R, y0, y1: y + 12, id: it.t }); return; }
    let hw, hl, h = 8, dz = 0;
    if (BOXED.has(it.t) && it.w && it.d) { hw = it.w / 2; hl = it.d / 2; h = it.t === 'barn' ? 9 : (it.floors || 1) * 3 + 3; }
    else if (FIXED[it.t]) ({ hw, hl, h, dz = 0 } = FIXED[it.t]);
    else return;   // quays, jetties, fields, laundry, benches, pots: walkable or nothing to hit
    const c = Math.cos(it.yaw), s = Math.sin(it.yaw), x = it.x + s * dz, z = it.z + c * dz;   // local (u, v) -> world: (x + c u + s v, z - s u + c v)
    put(x, z, Math.hypot(hw, hl) + 1, { x, z, yaw: it.yaw, hw, hl, y0, y1: y + h, id: it.t });
  }
  // the control zone's villages and cottages: once
  let zoneDone = false;
  function ensureZone() { if (zoneDone) return; zoneDone = true; for (const it of zoneItems()) addItem(it); for (const site of netState.zoneSites || []) if (site.village) kerbside(site.village); }
  // kerbside parking: every ~16 m along the streets inside a town, on the verge (clear of the traffic lane and of the
  // buildings), one spot in three taken, the car and its paint from the position hash; none on bridges or by the square
  function kerbside(S) {
    const g = roadGraph(S.x, S.z, S.R + 20), PR = S.size === 'hamlet' ? 7 : S.size === 'village' ? 12 : 16, q = {};
    for (const R of g.roads) {
      if (R.type === 'dirt') continue;
      for (let sd = 8; sd < R.len - 8; sd += 16) {
        roadPoint(R, sd, 0, q); const dc = Math.hypot(q.x - S.x, q.z - S.z);
        if (dc > S.R * 0.95 || dc < PR + 5 || q.bridge) continue;
        for (const side of [-1, 1]) {
          const hs = hash2(Math.round(q.x), Math.round(q.z), side > 0 ? 4431 : 4433); if (hs > 0.3) continue;
          roadPoint(R, sd, side * (R.hw + 1.0), q); const x = q.x, z = q.z;
          const key = 'k' + Math.round(x * 2) + ',' + Math.round(z * 2); if (carKeys.has(key)) continue;
          const yaw = Math.atan2(-q.dx, -q.dz) + (hs < 0.15 ? Math.PI : 0);
          if (blocked(x, z, 2.6) || Math.abs(terrainH(x + 1.5, z) - terrainH(x - 1.5, z)) > 0.25 || Math.abs(terrainH(x, z + 1.5) - terrainH(x, z - 1.5)) > 0.25) continue;
          carKeys.add(key); cars.push({ key, x, z, y: terrainH(x, z), yaw, kind: CIV[Math.floor(hash2(Math.round(x), Math.round(z), 4437) * 4)], paint: Math.floor(hash2(Math.round(x), Math.round(z), 4439) * 6) });
        }
      }
    }
  }
  function blocked(x, z, r) {   // a building / tree / post within r
    const a = grid.get(CK(Math.floor(x / CELL), Math.floor(z / CELL))) || [];
    for (const o of a) { if (o.c) { if (Math.hypot(o.x - x, o.z - z) < o.r + r) return true; continue; } const c = Math.cos(o.yaw), s_ = Math.sin(o.yaw), dx = x - o.x, dz = z - o.z, u = dx * c - dz * s_, v = dx * s_ + dz * c; if (Math.abs(u) < o.hw + r && Math.abs(v) < o.hl + r) return true; }
    return false;
  }
  function ensureWild(x, z, r) {
    for (const s of settlementsNear(x, z, r + 50)) { const k = 's' + s.id; if (done.has(k) || s.zone) continue; done.add(k); for (const it of townItems(s)) addItem(it); kerbside(s); }
    for (const f of farmsIn(x - r, z - r, x + r, z + r)) { const k = 'f' + f.id; if (done.has(k)) continue; done.add(k); for (const it of farmItems(f)) addItem(it); }
  }
  let lastWildX = 1e12, lastWildZ = 1e12;
  const WO = {
    near(x, z, r) {
      ensureZone();
      if (Math.hypot(x - lastWildX, z - lastWildZ) > 60) { lastWildX = x; lastWildZ = z; ensureWild(x, z, 300); }
      out.boxes.length = 0; out.circles.length = 0;
      const seen = WO._seen || (WO._seen = new Set()); seen.clear();
      for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
        const a = grid.get(CK(i, j)); if (!a) continue;
        for (const o of a) { if (seen.has(o)) continue; seen.add(o); if (Math.abs(o.x - x) > r + 16 || Math.abs(o.z - z) > r + 16) continue; (o.c ? out.circles : out.boxes).push(o); }
      }
      return out;
    },
    // the drivable garden cars within r of (x, z) (indexes the towns there first)
    parkedCars(x, z, r) { ensureZone(); ensureWild(x, z, r); return cars.filter(c => Math.abs(c.x - x) < r && Math.abs(c.z - z) < r); },
    get count() { return grid.size; },
  };
  return WO;
}
