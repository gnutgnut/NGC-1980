// The lived-in world on the main thread: streams the built world (towns, roads, farms, harbours, power lines) in
// 400 m chunks round the camera from the world worker, swaps near / far detail by distance, builds the control
// zone's villages at start, and runs the ambient life (ambient.js). main.js calls createWorldLife() once and
// world.update() every frame (two hooks, marked WORLD in main.js).
//
// Performance: one merged mesh per chunk and level of detail (solid + ground overlay), frustum culled; near detail
// within ~520 m, far detail out to the jet's view distance (capped), nothing past it. Chunks are built in the worker,
// at most two in flight, nearest first; the main thread only wraps the buffers.
import * as THREE from 'three';
import { BOUND, ISLANDS } from '../world.js';
import { netState, ensure, cellReady, CELL, roadAt, roadGraph, roadPoint, roadById, clearedAt } from './net.js';
import { zoneItems } from './layout.js';
import { buildGeo, CHUNK } from './chunkgen.js';
import { worldMaterial, groundMaterial, geoFrom } from './gfx.js';
import { createAmbient } from './ambient.js';
import { buildPadDressing, buildShaftCollar, buildRWPylon } from './structures.js';
import { structAngle, settlementsNear, nearestRoad, settlementOf } from './net.js';
import { DAMAGE } from './damage.js';   // ngc/world-polish: buildings knocked about by the war
import { ruin, damageOverlay } from './townkit.js';
import { Geo } from './kit.js';
import { rng } from './rng.js';
import { buildAASite, setStructGround } from './structures.js';

const NEAR_R = 520, FAR_MAX = 2300, DETAIL_R = 240;
export function createWorldLife(ctx) {
  const { scene, terrainH, fog, uTime } = ctx;
  if (/[?&]noworld/.test(location.search)) return (window.__WORLD = { update() {}, stats: { ms: 0, off: true }, zone: [], chunks: new Map(), ambient: { stats: {}, people: [], cars: [] } });   // A/B for perf
  const root = new THREE.Group(); root.name = 'world'; scene.add(root);
  const M = {
    solid: worldMaterial(), gNear: groundMaterial(), gFar: groundMaterial({ far: true }),
    zSolid: worldMaterial({ fog, uTime }), zgNear: groundMaterial({ fog, uTime }), zgFar: groundMaterial({ fog, uTime, far: true }),
    wire: new THREE.LineBasicMaterial({ color: 0x202020, transparent: true, opacity: 0.75 }),
  };
  const stats = { chunks: 0, pending: 0, built: 0, buildMs: 0, tris: 0, zoneTris: 0, ms: 0 };
  const mk = (d, mat) => { if (!d || !d.tris) return null; const m = new THREE.Mesh(geoFrom(d), mat); m.matrixAutoUpdate = false; root.add(m); return m; };
  const wiresOf = w => { if (!w || !w.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(w, 3)); g.computeBoundingSphere(); const l = new THREE.LineSegments(g, M.wire); l.matrixAutoUpdate = false; root.add(l); return l; };
  const dispose = o => { if (!o) return; root.remove(o); o.geometry.dispose(); };

  // ---------------------------------------------------------------------------------- the control zone (at start)
  const zone = [];
  {
    const t0 = performance.now();
    for (const { I, items, roads } of zoneItems(terrainH)) {
      const rd = new Map(); for (const id of roads) { const R = roadById(id); rd.set(R, new Set(Array.from({ length: R.xs.length - 1 }, (_, i) => i))); }
      const discs = []; for (const [, a] of netState.buckets) for (const s of a) if (s.disc && Math.hypot(s.ax - I.x, s.az - I.z) < I.r + 30 && !discs.includes(s)) discs.push(s);
      const c = buildGeo({ items, roads: rd, discs, x0: -1e9, z0: -1e9, x1: 1e9, z1: 1e9 }, terrainH, { lat: 2.5 });
      const e = { I, x: I.x, z: I.z, sN: mk(c.near, M.zSolid), sF: mk(c.far, M.zSolid), gN: mk(c.gnear, M.zgNear), gF: mk(c.gfar, M.zgFar), sD: mk(c.detail, M.zSolid), wires: wiresOf(c.wires), dyn: c.dyn, items, roads, zone: true };   // SEAWORLD: roads kept for world/solid.js (bridge parapets)
      stats.zoneTris += c.near.tris + c.gnear.tris + c.detail.tris; zone.push(e);
    }
    stats.zoneMs = performance.now() - t0;
  }

  // ---------------------------------------------------------------------------------- the wild lands (streamed)
  const chunks = new Map(), key = (i, j) => i * 100000 + j;
  let worker = null;
  try { worker = new Worker(new URL('./worldworker.js', import.meta.url), { type: 'module' }); } catch (e) { console.warn('world worker failed', e); }
  let reqId = 0;
  if (worker) worker.onmessage = ({ data: d }) => {
    const c = chunks.get(key(d.ci, d.cj)); stats.pending--;
    if (!c || c.state !== 'pending') return;   // dropped while building
    Object.assign(c, { state: 'ready', sN: mk(d.near, M.solid), sF: mk(d.far, M.solid), gN: mk(d.gnear, M.gNear), gF: mk(d.gfar, M.gFar), sD: mk(d.detail, M.solid), wires: wiresOf(d.wires), dyn: d.dyn, tris: d.near.tris + d.gnear.tris, dtris: d.detail.tris });
    stats.built++; stats.buildMs = d.ms; ambient.addChunk(c);
    if (c.dyn.bld && c.dyn.bld.some(b => DAMAGE.cond(b.k) !== 'intact')) applyRuins(c);   // knocked down before it was last streamed out
  };
  const wantR = () => Math.min(FAR_MAX, Math.max(NEAR_R + 200, (ctx.view ? ctx.view.draw : 600) * 0.92));
  let scanT = 0;
  function stream(cx, cz) {
    const R = wantR(), want = [];
    const i0 = Math.floor((cx - R) / CHUNK), i1 = Math.floor((cx + R) / CHUNK), j0 = Math.floor((cz - R) / CHUNK), j1 = Math.floor((cz + R) / CHUNK);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) * CHUNK, z = (j + 0.5) * CHUNK, d = Math.hypot(x - cx, z - cz);
      if (d > R + CHUNK * 0.71 || Math.max(Math.abs(x), Math.abs(z)) < BOUND + 300 - CHUNK * 0.5) continue;   // the zone is built at start
      const k = key(i, j); if (!chunks.has(k)) want.push([d, i, j, k]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, i, j, k] of want) { if (stats.pending >= 2 || !worker) break; chunks.set(k, { i, j, x: (i + 0.5) * CHUNK, z: (j + 0.5) * CHUNK, state: 'pending' }); stats.pending++; worker.postMessage({ id: reqId++, ci: i, cj: j }); }
    for (const [k, c] of chunks) if (Math.hypot(c.x - cx, c.z - cz) > R + CHUNK * 1.6) {
      if (c.state === 'ready') { for (const p of ['sN', 'sF', 'gN', 'gF', 'sD', 'ruins', 'wires']) dispose(c[p]); ambient.dropChunk(c); }
      chunks.delete(k);
    }
  }
  function lod(cx, cz) {
    const R = wantR(); let tris = 0, n = 0;
    // ngc/world-polish: the detail layer (street furniture, cars, clutter) only close in; ruins whenever the chunk shows
    const show = (c, near, far, det) => { if (c.sN) c.sN.visible = near; if (c.gN) c.gN.visible = near; if (c.wires) c.wires.visible = near; if (c.sF) c.sF.visible = far; if (c.gF) c.gF.visible = far; if (c.sD) c.sD.visible = det; if (c.ruins) c.ruins.visible = near || far; };
    let dn = 0;
    for (const c of chunks.values()) { if (c.state !== 'ready') continue; const d = Math.hypot(c.x - cx, c.z - cz), near = d < NEAR_R + CHUNK * 0.35, det = d < DETAIL_R + CHUNK * 0.6; show(c, near, !near && d < R + CHUNK * 0.71, det); if (near) tris += c.tris; if (det) { tris += c.dtris || 0; dn++; } n++; }
    for (const e of zone) { const d = Math.hypot(e.x - cx, e.z - cz) - e.I.r, near = d < NEAR_R; show(e, near, !near && d < R, d < DETAIL_R); }
    stats.chunks = n; stats.tris = tris; stats.detailChunks = dn;
  }
  // keep the main thread's road network a step ahead of the camera, so physics never waits on a whole cell. The
  // settlement candidates round the zone (the bulk of a cold first cell) are worked through a few per frame at start.
  let prewarmT = 0, sIdx = 0;
  const SR = 11, sCells = (2 * SR + 1) ** 2;
  function prewarmSettlements() { for (let k = 0; k < 12 && sIdx < sCells; k++, sIdx++) settlementOf((sIdx % (2 * SR + 1)) - SR, Math.floor(sIdx / (2 * SR + 1)) - SR); }
  function prewarm(cx, cz) {
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const x = cx + dx * CELL, z = cz + dz * CELL; if (Math.max(Math.abs(x), Math.abs(z)) < BOUND + 300) continue;
      const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), k = (ci + 32768) * 65536 + (cj + 32768);
      if (!netState.ready.has(k)) { cellReady(ci, cj); return; }   // one cell a call
    }
  }

  // ---------------------------------------------------------------------------------- site dressing in the zone
  // helipads (windsock, edge lights, ops shack), the collar over each cave shaft, RUNAWAY power pylons on machine-held
  // islands; follows island ownership by polling (no hooks needed)
  const sites = [];
  for (const I of ISLANDS) {
    const p = I.pad; if (!p) continue;
    const site = { I, owner: -1, pylons: [], cables: null, fallT: 0 };
    const pd = buildPadDressing(p.r || 8.5); pd.position.set(p.x, p.h, p.z); pd.rotation.y = structAngle(I) + Math.PI / 2; root.add(pd); site.pad = pd;
    if (I.cave && I.base) {
      const c = buildShaftCollar(9); c.position.set(I.x, I.base.h, I.z); root.add(c); site.collar = c;
      // main.js's placeholder blocks round the shaft give way to the collar
      const holder = I.base.surface || (I.base.beam && I.base.beam.parent);
      if (holder) for (const o of holder.children) if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry') o.visible = false;
    }
    // pylon line: an arc round the pad from the HQ's side to the production building's, away from the shaft
    const a0 = I.cave ? Math.atan2(9, -17) : structAngle(I), a1 = I.cave ? Math.atan2(6, 19) : a0 + Math.PI, R = I.cave ? 27 : 35;
    let da = a1 - a0; da = Math.atan2(Math.sin(da), Math.cos(da)); if (I.cave && da < 0) da += Math.PI * 2;
    for (let k = 0; k < 5; k++) {
      const a = a0 + da * (k + 0.5) / 5, x = p.x + Math.cos(a) * R, z = p.z + Math.sin(a) * R, y = terrainH(x, z);
      if (y < 0.5) continue;
      const py = buildRWPylon(); py.position.set(x, y, z); py.rotation.y = -a; py.visible = false; root.add(py); site.pylons.push(py);
    }
    const pts = []; for (let k = 0; k + 1 < site.pylons.length; k++) for (const [u, v, w] of site.pylons[k].userData.tops) { const A = site.pylons[k], B = site.pylons[k + 1]; const a = new THREE.Vector3(u, v, w).applyEuler(A.rotation).add(A.position), b = new THREE.Vector3(u, v, w).applyEuler(B.rotation).add(B.position), m = a.clone().lerp(b, 0.5); m.y -= 1.2; pts.push(a.x, a.y, a.z, m.x, m.y, m.z, m.x, m.y, m.z, b.x, b.y, b.z); }
    if (pts.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); site.cables = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x8ff4ff, transparent: true, opacity: 0.8 })); site.cables.visible = false; root.add(site.cables); }
    sites.push(site);
  }
  function updateSites(dt, t) {
    const wind = ctx.fx && ctx.fx.wind, wl = wind ? Math.hypot(wind.x, wind.y) : 0;
    for (const s of sites) {
      const own = s.I.owner;
      if (own !== s.owner) {   // ownership changed (or first frame)
        const first = s.owner < 0, was = s.owner; s.owner = own;
        if (s.collar) s.collar.userData.setSide(own);
        if (s.aa) for (const m of s.aa) m.userData.setSide(own);   // ngc/world-polish
        if (own === 2) { s.grow = first ? 99 : 0; for (const p of s.pylons) { p.visible = true; p.rotation.z = 0; p.userData.glowMat.color.setHex(0x8ff4ff); } s.fallT = 0; }
        else if (was === 2) { s.fallT = 0.001; for (const p of s.pylons) p.userData.glowMat.color.setHex(0x1c2224); if (s.cables) s.cables.visible = false; }
      }
      if (own === 2 && s.grow < 99) {   // the machines string their power line across the island, pylon by pylon
        s.grow += dt;
        s.pylons.forEach((p, k) => { const f = Math.min(1, Math.max(0.01, (s.grow - k * 1.4) / 2.2)); p.scale.set(1, f, 1); });
        if (s.grow > s.pylons.length * 1.4 + 2.5) s.grow = 99;
      }
      if (own === 2 && s.grow >= 99) { for (const p of s.pylons) p.scale.set(1, 1, 1); if (s.cables) { s.cables.visible = true; s.cables.material.opacity = 0.55 + 0.3 * Math.sin(t * 2.3 + s.I.id); } }
      if (s.fallT > 0 && s.fallT < 4) { s.fallT += dt; s.pylons.forEach((p, k) => { if (k % 2 === 0) p.rotation.z = Math.min(1.35, s.fallT * s.fallT * 0.4) * (k % 4 ? 1 : -1); }); }   // wreckage: half of them topple
      if (s.pad && wind) { const sock = s.pad.userData.sock; sock.rotation.y = Math.atan2(-wind.y, wind.x) - s.pad.rotation.y + Math.sin(t * 1.7 + s.I.id) * 0.15; sock.rotation.z = -(1 - Math.min(1, wl / 2.2)) * 1.1; }
    }
  }

  const ambient = createAmbient({ ...ctx, root, zone, chunks });

  // ---------------------------------------------------------------------------------- damage (ngc/world-polish)
  // Every explosion near a building (fx.explode, wrapped like ambient.js does) counts against it (damage.js). A
  // damaged one gets its soot, roof hole and smoke drawn over it; a destroyed one's vertices in the chunk's merged
  // near / far meshes collapse to a point and its ruin is drawn instead (one small 'ruins' mesh per chunk).
  const fx = ctx.fx;
  function collapse(mesh, a, b) {
    if (!mesh || b <= a) return;
    const p = mesh.geometry.attributes.position, A = p.array, x = A[a * 3], y = A[a * 3 + 1], z = A[a * 3 + 2];
    for (let i = a; i < b; i++) { A[i * 3] = x; A[i * 3 + 1] = y; A[i * 3 + 2] = z; }
    p.needsUpdate = true;
  }
  function applyRuins(e) {
    const g = new Geo(); let any = false;
    for (const b of e.dyn.bld) {
      const cond = DAMAGE.cond(b.k); if (cond === 'intact') continue; any = true;
      const r = rng((b.it.seed | 0) ^ 0x5eed);
      g.weather(b.y, 1.0, 0.3, 0.08); g.push(b.x, b.y, b.z, b.yaw);
      if (cond === 'destroyed') { if (!b.gone) { collapse(e.sN, b.n[0], b.n[1]); collapse(e.sF, b.f[0], b.f[1]); b.gone = true; } ruin(g, r, b.it); }
      else damageOverlay(g, r, b.it);
      g.pop(); g.unweather();
    }
    dispose(e.ruins); e.ruins = null;
    if (any) e.ruins = mk(g.build(), e.zone ? M.zSolid : M.solid);
  }
  function onCond(b, cond) {
    if (!fx || !fx.burn) return;
    const cx = b.x + Math.sin(b.yaw) * b.dz, cz = b.z + Math.cos(b.yaw) * b.dz;
    if (cond === 'destroyed') {
      const e = fx.burn(cx, b.y + 2, cz, 25, 1.5); e.smoulder = 150;
      if (fx.scorch) fx.scorch.add({ x: cx, y: b.y + 0.35, z: cz, size: Math.max(b.w, b.d) * 0.8, a: 0.85, tile: 0, n: new THREE.Vector3(0, 1, 0) });
    } else { const e = fx.burn(cx, b.y + b.H * 0.55, cz, 6, 0.7); e.smoulder = 70; }
  }
  const nearE = (x, z, fn) => {
    for (const c of chunks.values()) if (c.state === 'ready' && c.dyn && Math.abs(c.x - x) < CHUNK && Math.abs(c.z - z) < CHUNK) fn(c);
    for (const e of zone) if (Math.hypot(e.x - x, e.z - z) < e.I.r + 60) fn(e);
  };
  function blast(x, y, z, s) {
    if (s < 0.75) return;
    const R = 4 + 2.4 * s + 30;
    nearE(x, z, e => {
      let changed = false;
      for (const b of e.dyn.bld || []) { if (Math.abs(b.x - x) > R || Math.abs(b.z - z) > R) continue; const c = DAMAGE.hit(b, x, y, z, s); if (c) { changed = true; onCond(b, c); } }
      if (changed) applyRuins(e);
    });
  }
  if (fx && fx.explode) { const ex0 = fx.explode.bind(fx); fx.explode = (x, y, z, s = 1, o) => { try { blast(x, y, z, s); } catch (err) { console.warn('world damage', err); } return ex0(x, y, z, s, o); }; }
  // tests / scripted events: the building nearest (x, z) to a condition
  function knock(x, z, cond = 'destroyed') {
    let best = null;
    nearE(x, z, e => { for (const b of e.dyn.bld || []) { const d = DAMAGE.dist(b, x, z); if (!best || d < best.d) best = { d, b, e }; } });
    if (!best) return null;
    DAMAGE.set(best.b, cond); onCond(best.b, cond); applyRuins(best.e);
    return { k: best.b.k, t: best.b.t, x: best.b.x, z: best.b.z, d: best.d };
  }

  // ---------------------------------------------------------------------------------- AA emplacements (ngc/world-polish)
  // war.js puts the AA guns on four slots round each pad (aaSlots: 45 degrees off the axes, 22 m out, 15 m on cave
  // islands - repeated here). Ours dig in: an earth revetment with sandbags on top, ready-use ammunition boxes, a gap to
  // drive in by; the machines bolt down a ring of ceramic plates. Not war targets, not solid (the gun parks inside).
  setStructGround(terrainH);
  for (const s of sites) {
    const p = s.I.pad, rr = s.I.cave ? 15 : 22, slots = [];
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, x = p.x + Math.cos(a) * rr, z = p.z + Math.sin(a) * rr; slots.push([x, z, Math.atan2(p.z - z, p.x - x)]); }   // the gap faces the pad
    const m = buildAASite(terrainH, slots); root.add(m); s.aa = [m];
  }
  const W = {
    root, stats, zone, chunks, ambient, sites,
    damage: { DAMAGE, knock, blast },   // ngc/world-polish
    net: { settlementsNear, netState, nearestRoad },   // for tests and tools
    traffic: { setModel: (k, def) => ambient.setModel(k, def), get models() { return ambient.models; }, get cars() { return ambient.cars; } },
    update(dt, cam, playing = true) {
      const t0 = performance.now(), cx = cam.position.x, cz = cam.position.z;
      scanT -= dt; if (scanT <= 0) { scanT = 0.4; stream(cx, cz); lod(cx, cz); }
      // only near the wild lands (physics in the zone never needs them); one cell at a time
      prewarmT -= dt; if (prewarmT <= 0) { prewarmT = 1.5; if (Math.max(Math.abs(cx), Math.abs(cz)) > BOUND - 150) prewarm(cx, cz); }
      if (sIdx < sCells) prewarmSettlements();
      W.t = (W.t || 0) + dt; updateSites(dt, W.t);
      ambient.update(dt, cam, playing);
      stats.ms += (performance.now() - t0 - stats.ms) * 0.05;   // smoothed main-thread cost per frame
    },
    // ---- road queries for vehicles and AI traffic (net.js; see MODLOG "lived-in world")
    roadAt, roadGraph, roadPoint, roadById,
    clearedAt,
  };
  if (/[?&]debug/.test(location.search)) window.__WORLD = W;
  return W;
}
