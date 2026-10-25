// SEAWORLD: the lived-in world as colliders and floors (game/js/world/solid.js), in node: a town's houses and church
// stop a walker-sized circle, field walls have their gate gap, bridge decks are floors over the water / valley.
//   node tools/worldsolidbench.mjs [cx] [cz]
import * as world from '../game/js/world.js';
import * as N from '../game/js/world/net.js';
import { createWorldSolid } from '../game/js/world/solid.js';
import { townItems, zoneItems } from '../game/js/world/layout.js';
import { DOORS } from '../game/js/interiors/doors.js';

let pass = 0, fail = 0;
const check = (ok, name, got = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(66)} ${got}`); };
const [cx, cz] = [+(process.argv[2] ?? 3600), +(process.argv[3] ?? 1800)];
N.ensure(cx, cz);
const S = createWorldSolid({ hf: world.islandH });

// a minimal GR.collide for the test: push a circle out of every part near it (ground.js pushBox / pushCircle maths)
function push(o, parts) {
  let n = 0;
  for (const b of parts) {
    if (o.y1 < b.y0 || o.y0 > b.y1) continue;
    if (b.r !== undefined && b.hl === undefined) { const dx = o.x - b.x, dz = o.z - b.z, d = Math.hypot(dx, dz), m = o.r + b.r; if (d < m) { o.x = b.x + dx / (d || 1) * m; o.z = b.z + dz / (d || 1) * m; n++; } continue; }
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = o.x - b.x, dz = o.z - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
    const qx = Math.max(-b.hw, Math.min(b.hw, lx)), qz = Math.max(-b.hl, Math.min(b.hl, lz)), ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
    if (d >= o.r) continue;
    let nlx, nlz, pen; if (d > 1e-6) { nlx = ex / d; nlz = ez / d; pen = o.r - d; } else { const fx = b.hw - Math.abs(lx), fz = b.hl - Math.abs(lz); if (fx < fz) { nlx = Math.sign(lx) || 1; nlz = 0; pen = fx + o.r; } else { nlx = 0; nlz = Math.sign(lz) || 1; pen = fz + o.r; } }
    o.x += (nlx * c + nlz * s) * pen; o.z += (-nlx * s + nlz * c) * pen; n++;
  }
  return n;
}

// 1. a town: every house blocks, and a walk straight at a house's front stops at its wall
const towns = []; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) { const s = N.settlementOf(Math.floor(cx / N.CELL) + i, Math.floor(cz / N.CELL) + j); if (s && !towns.includes(s)) towns.push(s); }
const town = towns.sort((a, b) => ({ town: 0, village: 1, hamlet: 2 }[a.size] - { town: 0, village: 1, hamlet: 2 }[b.size]))[0];
check(!!town, 'found a settlement near the probe', town ? `${town.size} at ${town.x.toFixed(0)}, ${town.z.toFixed(0)}` : '');
const items = townItems(town, world.islandH), houses = items.filter(it => it.t === 'house' || it.t === 'terrace' || it.t === 'cottage');
let t0 = performance.now(); S.near(town.x, town.z, 3); const ms = performance.now() - t0;
check(houses.length > 3, 'the town has houses', `${houses.length} houses / terraces / cottages`);
check(ms < 600, 'building the colliders of the town chunk', `${ms.toFixed(0)} ms (once per chunk)`);
let stopped = 0, tried = 0;
for (const h of houses.slice(0, 20)) {
  const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);   // the front (+z local) faces the street
  const o = { x: h.x + fx * (h.d / 2 + 3), z: h.z + fz * (h.d / 2 + 3), r: 0.4, y0: h.y + 0.25, y1: h.y + 1.8 };
  for (let k = 0; k < 80; k++) { o.x -= fx * 0.1; o.z -= fz * 0.1; push(o, S.near(o.x, o.z, 2)); }   // walk 8 m at the door
  const dist = (o.x - h.x) * fx + (o.z - h.z) * fz; tried++; if (dist > h.d / 2 + 0.3) stopped++;
}
check(stopped === tried, 'walking at a house front stops at the wall (never inside)', `${stopped} / ${tried}`);
const church = items.find(it => it.t === 'church');
if (church) { const o = { x: church.x, z: church.z + 30, r: 0.4, y0: church.y + 0.25, y1: church.y + 1.8 }; for (let k = 0; k < 300; k++) { o.z -= 0.1; push(o, S.near(o.x, o.z, 2)); } check(o.z > church.z + 4, 'the churchyard wall / church stops a walker', `stopped at ${(o.z - church.z).toFixed(1)} m`); }

// 2. fields: walls with a gate gap
let farm = null; for (let j = -4; j <= 4 && !farm; j++) for (let i = -4; i <= 4 && !farm; i++) { const f = N.farmOf(Math.floor(cx / N.FARM_CELL) + i, Math.floor(cz / N.FARM_CELL) + j); if (f && f.fields.length) farm = f; }
if (farm) {
  const F = farm.fields[0], parts = S.near(F.x, F.z, Math.max(F.w, F.d)).filter(p => p.t === 'wall' || p.t === 'hedge');
  check(parts.length >= 4, 'a field has walls / hedges round it', `${parts.length} segments (${farm.style})`);
} else check(false, 'found a farm');

// 3. bridges: the deck is a floor (over water or a valley), parapets along it
let br = null; for (const R of N.netState.roads) { for (let i = 0; i + 1 < R.xs.length && !br; i++) if (R.br[i] && R.br[i + 1] && (R.ys[i] + R.ys[i + 1]) / 2 - Math.max(0, world.islandH((R.xs[i] + R.xs[i + 1]) / 2, (R.zs[i] + R.zs[i + 1]) / 2)) > 3) br = { R, i }; if (br) break; }   // a span, not an abutment
if (br) {
  const { R, i } = br, x = (R.xs[i] + R.xs[i + 1]) / 2, z = (R.zs[i] + R.zs[i + 1]) / 2, deck = (R.ys[i] + R.ys[i + 1]) / 2, g = world.islandH(x, z);
  const fl = S.floor(x, z, deck + 0.5, 0.45), under = S.floor(x, z, Math.max(g, 0) + 0.1, 0.45);
  check(fl !== null && Math.abs(fl - deck) < 0.4 && deck - Math.max(g, 0) > 1, 'a bridge deck is a floor above the ground / sea under it', `at ${x.toFixed(0)}, ${z.toFixed(0)}: deck ${fl === null ? "none" : fl.toFixed(2)} vs road ${deck.toFixed(2)}, ground ${g.toFixed(1)}`);
  check(under === null || under < deck - 1, 'under the bridge you are under it (no floor from below)', String(under));
  const par = S.near(x, z, 8).filter(p => p.t === 'parapet');
  check(par.length >= 2, 'the bridge has parapets', `${par.length}`);
  check(S.surface(x, z) !== null, 'the deck is a road surface', S.surface(x, z));
} else check(false, 'found a bridge');

// 4. ngc/integ: every outside door of an enterable building in the control zone (villages and cottages on the islands'
// re-fitted ground, TERRAIN) can be walked in from the ground, the door open: a walker (r 0.3, 1.8 m tall) on the ground
// 2.5 m out (or at the foot of the steps) walks square at the doorway, climbing at most 0.45 m a step (footsim STEP),
// pushed by walls and furniture, and must get 1.3 m inside. (The wild lands are not held to it: a town house on its
// platform can stand 4 m over the street.)
function walkIn(S, R, d) {
  const it = R.it, c = Math.cos(it.yaw || 0), sn = Math.sin(it.yaw || 0), w = (u, v) => [it.x + c * u + sn * v, it.z - sn * u + c * v], nv = Math.sign(d.v) || 1;
  const D = DOORS.get(R.P.key + '#' + d.id); if (D) { D.a = 1; DOORS.place(D); }
  const ground = (x, z, y) => { const g = world.islandH(x, z), f = S.floor(x, z, y, 0.45); return f === null ? g : Math.max(g, f); };
  const foot = Math.max(2.5, ...R.P.floors.filter(f => f.kind === 'steps' && f.u0 < d.u && f.u1 > d.u).map(f => (nv > 0 ? f.v1 - d.v : d.v - f.v0) + 0.6));
  let [x, z] = w(d.u, d.v + nv * foot), y = ground(x, z, world.islandH(x, z) + 0.45), why = '';
  const o = { x, z, r: 0.3, y0: 0, y1: 0 }, [tx, tz] = w(d.u, d.v - nv * 1.6), into = () => ((o.x - it.x) * sn + (o.z - it.z) * c - d.v) * -nv;
  for (let k = 0; k < 400 && into() < 1.3; k++) {
    const dx = tx - o.x, dz = tz - o.z, L = Math.hypot(dx, dz) || 1, nx = o.x + dx / L * 0.05, nz = o.z + dz / L * 0.05, h = ground(nx, nz, y);
    if (h > y + 0.45) { why = `a ${(h - y).toFixed(2)} m step ${(-into()).toFixed(1)} m out`; break; }
    o.x = nx; o.z = nz; y = h; o.y0 = y + 0.25; o.y1 = y + 1.8;
    const nb = S.near(o.x, o.z, 2), q = { ...o }; push(o, nb);
    if (Math.hypot(o.x - q.x, o.z - q.z) > 0.04) why = 'stopped by ' + nb.filter(b => push({ ...q }, [b])).map(b => b.t + (b.furn ? ' furniture' : '')).join(', ');
  }
  if (D) { D.a = 0; DOORS.place(D); }
  return into() >= 1.3 ? null : `${why || 'stuck'} ${into().toFixed(2)} m in`;
}
{
  const ZS = createWorldSolid({ hf: world.islandH, zoneHf: world.islandH, zone: () => zoneItems(world.islandH) });   // (the zone as life.js builds it; islandH stands in for main.js terrainH off the pads)
  const seen = new Set(), bad = []; let n = 0; t0 = performance.now();
  for (const I of world.ISLANDS) for (const R of ZS.roomsNear(I.x, I.z, I.r + 80)) {
    if (seen.has(R.P.key)) continue; seen.add(R.P.key);
    for (const d of R.P.doors) if (d.out) { n++; const e = walkIn(ZS, R, d); if (e) bad.push(`${R.it.t} ${R.it.x.toFixed(0)},${R.it.z.toFixed(0)} door ${d.id}: ${e}`); }
  }
  check(n >= 40 && bad.length === 0, 'every outside door in the zone walks in from the ground', `${n - bad.length} / ${n} doors (${(performance.now() - t0).toFixed(0)} ms)${bad.length ? '\n      ' + bad.slice(0, 10).join('\n      ') : ''}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
