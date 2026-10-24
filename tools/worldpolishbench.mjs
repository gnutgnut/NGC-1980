// ngc/world-polish: the second batch of the lived-in world, in node (no browser): what the towns, harbours and farms
// now hold (pub, school, chapel, hall, street furniture, parked cars, harbour gear, farmyards), what it costs to build
// and draw (triangles per level of detail: near / far / detail), and the damage model (a blast knocks a house about,
// a destroyed one is rubble to the colliders, its vertex ranges are recorded).
//   node tools/worldpolishbench.mjs [cx] [cz]
import * as world from '../game/js/world.js';
import * as N from '../game/js/world/net.js';
import { chunkContent, buildGeo, CHUNK, BUILDINGS } from '../game/js/world/chunkgen.js';
import { createWorldSolid } from '../game/js/world/solid.js';
import { DAMAGE } from '../game/js/world/damage.js';
import { townItems } from '../game/js/world/layout.js';

let pass = 0, fail = 0;
const check = (ok, name, got = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(70)} ${got}`); };
const [cx, cz] = [+(process.argv[2] ?? 3600), +(process.argv[3] ?? 1800)];
for (let k = 0; k < 9; k++) N.ensure(cx + (k % 3 - 1) * 1600, cz + (Math.floor(k / 3) - 1) * 1600);

// every chunk with a settlement or farm in a 4.8 km square
const setts = N.settlementsNear(cx, cz, 2400), counts = {}, tris = { near: 0, far: 0, detail: 0, gnear: 0 }, times = [];
const keys = new Set();
for (const s of setts) keys.add(Math.floor(s.x / CHUNK) + ',' + Math.floor(s.z / CHUNK));
let bld = 0, ranged = 0, built = [];
for (const k of keys) {
  const [i, j] = k.split(',').map(Number), t0 = performance.now();
  const c = chunkContent(i, j, world.islandH), g = buildGeo(c, world.islandH);
  times.push(performance.now() - t0);
  for (const it of c.items) counts[it.t] = (counts[it.t] || 0) + 1;
  for (const l of ['near', 'far', 'detail', 'gnear']) tris[l] += g[l].tris;
  bld += c.items.filter(it => BUILDINGS.has(it.t)).length; ranged += g.dyn.bld.length;
  built.push({ c, g });
}
console.log('settlements', setts.map(s => s.size).join(' '), '| chunks', keys.size);
console.log('items', JSON.stringify(counts));
console.log('tris', JSON.stringify(tris), 'per chunk', JSON.stringify(Object.fromEntries(Object.entries(tris).map(([k, v]) => [k, Math.round(v / keys.size)]))));
check(setts.some(s => s.size !== 'hamlet'), 'there are villages / towns in the square', setts.length + ' settlements');
const nv = setts.filter(s => s.size !== 'hamlet').length;
check((counts.terrace ? 1 : 0) && built.some(({ c }) => c.items.some(it => it.pub)), 'pubs stand on the squares', built.reduce((n, { c }) => n + c.items.filter(it => it.pub).length, 0) + ' pubs');
const nsch = setts.filter(s => s.size !== 'hamlet').reduce((n, s) => n + townItems(s, null).filter(i => i.t === 'school').length, 0);
check(nsch >= 1, 'village schools', nsch + ' for ' + nv + ' villages / towns');
check((counts.psign || 0) >= nv, 'signs at the way in (30 limit, name, finger, bus, school)', String(counts.psign || 0));
check((counts.pcar || 0) >= 2, 'cars parked round the squares / at the pub', String(counts.pcar || 0));
check(ranged === bld, 'every building has its vertex ranges recorded', `${ranged} / ${bld}`);
const bad = built.flatMap(({ g }) => g.dyn.bld.filter(b => !(b.n[1] > b.n[0] && b.f[1] >= b.f[0])));
check(bad.length === 0, 'the ranges are not empty', bad.length ? bad[0].t : '');
check(Math.max(...times) < 400, 'a town chunk builds in < 400 ms (worker)', `max ${Math.max(...times).toFixed(0)} ms, mean ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(0)}`);
check(tris.detail > 0 && tris.detail < tris.near, 'the detail layer carries the small stuff', `${tris.detail} detail vs ${tris.near} near`);

// harbours and farms further out
let harb = 0, farm = 0;
for (let k = 0; k < 25; k++) N.ensure(cx + (k % 5 - 2) * 1600, cz + (Math.floor(k / 5) - 2) * 1600);
for (const s of N.settlementsNear(cx, cz, 4000).filter(s => s.layout && s.layout.quay).slice(0, 3)) {
  const c = chunkContent(Math.floor(s.layout.quay.x / CHUNK), Math.floor(s.layout.quay.z / CHUNK), world.islandH);
  harb += c.items.filter(it => ['crane', 'slip', 'office', 'hboat', 'buoy', 'fishbox', 'nets'].includes(it.t)).length;
}
check(harb >= 4, 'harbour gear on the quays (crane, slip, office, boats, buoys, boxes, nets)', String(harb));
for (const f of N.farmsIn(cx - 3000, cz - 3000, cx + 3000, cz + 3000).slice(0, 6)) {
  const c = chunkContent(Math.floor(f.x / CHUNK), Math.floor(f.z / CHUNK), world.islandH);
  farm += c.items.filter(it => ['parlour', 'balestack', 'muck', 'trough', 'trailer', 'landrover', 'churns'].includes(it.t)).length;
}
check(farm >= 4, 'farmyards (parlour, bales, muck heap, trough, trailer, Land Rover, churn stand)', String(farm));

// damage: bombs on the nearest house
const S = createWorldSolid({ hf: world.islandH });
const { c, g } = built.find(({ g }) => g.dyn.bld.some(b => b.t === 'house'));
const b = g.dyn.bld.find(b => b.t === 'house'), it = c.items.find(it => it.t === 'house' && Math.abs(it.x - b.x) < 1e-6 && Math.abs(it.z - b.z) < 1e-6);
const near = () => S.near(b.x, b.z, 2).filter(p => Math.hypot(p.x - b.x, p.z - b.z) < Math.hypot(b.w, b.d) / 2 + 1);
const before = near().filter(p => p.t === 'house' || p.room).length;
const r1 = DAMAGE.hit(b, b.x + 3, b.y + 1, b.z, 0.9);
check(r1 === null && DAMAGE.cond(b.k) === 'intact', 'a grenade-sized blast by a house leaves it standing', DAMAGE.cond(b.k));
const fv = b.d / 2 + 1.5, r2 = DAMAGE.hit(b, b.x + Math.sin(b.yaw) * fv, b.y + 1, b.z + Math.cos(b.yaw) * fv, 2.8);   // in the front garden
check(DAMAGE.cond(b.k) === 'damaged', 'a bomb at the front door: damaged', DAMAGE.cond(b.k));
DAMAGE.hit(b, b.x, b.y + 1, b.z, 2.8);
check(DAMAGE.cond(b.k) === 'destroyed', 'a second on the roof: destroyed', DAMAGE.cond(b.k));
const after = near(), rub = after.filter(p => p.t === 'rubble');
check(before > 0 && rub.length === 1 && after.filter(p => p.room && p.t === 'house').length === 0, 'the colliders become a heap of rubble (rooms gone)', `${before} parts before, ${rub.length} rubble after`);
check(rub.length && rub[0].soft && rub[0].y1 - b.y < 1, 'the rubble is low and soft (tanks push through)', rub.length ? (rub[0].y1 - b.y).toFixed(2) + ' m' : '');
check(DAMAGE.hit(b, b.x, b.y, b.z, 6) === null, 'a ruin takes no more damage', '');
const far = { ...b, k: 'x', y: b.y };
check(DAMAGE.hit(far, b.x, b.y + b.H + 40, b.z, 3) === null, 'an air burst 40 m over the roof does nothing', '');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
