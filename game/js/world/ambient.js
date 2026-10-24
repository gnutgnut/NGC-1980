// Ambient life in the lived-in world, all of it near the camera only and pooled:
//   civilians   walk the verges between front doors and in and out of houses (instanced, walk cycle in the vertex
//               shader); they run for their doors when there is fighting nearby and stay in until it is over
//   traffic     1980 cars, vans, trucks and tractors drive the road network on the right, slow for bends and for each
//               other, turn at junctions; flee or burn when the war comes close. Models are swappable:
//                 traffic.setModel(kind, { geometry, length } | { object, length })   (see MODLOG)
//   boats       dinghies and crabbers bobbing at the piers; trawlers working offshore with gulls behind them
//   smoke       a few chimneys and stoves lit near the camera (fx.chimney)
//   livestock   cows and sheep in the pastures
// Deserted where the machines hold an island (no people, no smoke, no traffic).
import * as THREE from 'three';
import { Geo, col, shade } from './kit.js';
import { worldMaterial } from './gfx.js';
import { roadGraph, roadPoint, roadById, nearestRoad, netState } from './net.js';
import { rng, hash2 } from './rng.js';
import { islandH, rawH, BOUND, ISLANDS } from '../world.js';
import * as MD from './models.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();

// ------------------------------------------------------------------------------------------- models
// a person, 1.75 m; vertex attribute part: 0 body, 1/2 legs, 3/4 arms (pivots at the hips / shoulders); shirt
// vertices carry paint = 1 and take the instance colour
function personGeo() {
  const g = new Geo(), parts = [], paint = [], skin = col(0xd8b090), hair = col(0x3a2a1e), jeans = col(0x3a4660), shoe = col(0x222222);
  const add = (n, part, pt) => { for (let i = 0; i < n; i++) { parts.push(part); paint.push(pt); } };
  let n0 = g.count;
  const B = (x, y, z, w, h, d, c, part, pt = 0) => { const k = g.count; g.box(x, y, z, w, h, d, c, 1); add(g.count - k, part, pt); };
  B(0, 0.92, 0, 0.42, 0.6, 0.24, WHITEISH, 0, 1);     // shirt / jacket
  B(0, 1.52, 0, 0.2, 0.22, 0.22, skin, 0); B(0, 1.7, -0.02, 0.22, 0.08, 0.24, hair, 0);
  for (const [s, part] of [[-1, 1], [1, 2]]) { B(s * 0.11, 0.08, 0, 0.17, 0.86, 0.19, jeans, part); B(s * 0.11, 0, 0.04, 0.17, 0.09, 0.27, shoe, part); }
  for (const [s, part] of [[-1, 3], [1, 4]]) { B(s * 0.27, 0.92, 0, 0.11, 0.56, 0.13, WHITEISH, part, 1); B(s * 0.27, 0.86, 0, 0.1, 0.08, 0.11, skin, part); }
  const d = g.build(), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(d.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(d.nrm, 3, true)); geo.setAttribute('color', new THREE.BufferAttribute(d.col, 3, true));
  geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(parts), 1)); geo.setAttribute('aPaint', new THREE.BufferAttribute(new Float32Array(paint), 1));
  return geo;
}
const WHITEISH = col(0xf0f0f0);
// a vehicle model from the kit, paint vertices flagged; returns { geometry, length }
function vehicleGeo(kind) {
  const g = new Geo(), paint = [], P = col(0xffffff), r = rng(kind.length * 31);
  let n = 0; const mark = (pt) => { while (n < g.count) { paint.push(pt); n++; } };
  let L = 4.2;
  if (kind === 'saloon' || kind === 'hatch' || kind === 'estate') {
    // body in paint, glass / wheels / bumpers not
    const len = kind === 'hatch' ? 3.7 : 4.3, wb = len * 0.6, rl = kind === 'saloon' ? len * 0.48 : kind === 'hatch' ? len * 0.52 : len * 0.62, rz = kind === 'saloon' ? -0.1 : kind === 'hatch' ? -0.35 : -0.45;
    g.box(0, 0.3, 0, 1.66, 0.62, len, P, 1); g.box(0, 1.42, rz, 1.46, 0.05, rl - 0.2, P, 0); mark(1);
    g.box(0, 0.92, rz, 1.5, 0.5, rl, MD.C.GLASS, 1);
    for (const [x, z] of [[0.75, wb / 2], [-0.75, wb / 2], [0.75, -wb / 2], [-0.75, -wb / 2]]) g.push(x, 0.31, z, 0, 0, Math.PI / 2).cyl(0, -0.1, 0, 0.31, 0.2, 7, MD.C.BLACK, 0).pop();
    g.box(0, 0.38, len / 2 + 0.03, 1.6, 0.12, 0.06, MD.C.METAL, 0); g.box(0, 0.38, -len / 2 - 0.03, 1.6, 0.12, 0.06, MD.C.METAL, 0);
    for (const x of [-0.55, 0.55]) { g.box(x, 0.6, len / 2 + 0.01, 0.3, 0.16, 0.04, col(0xf0f0e0), 0); g.box(x, 0.6, -len / 2 - 0.01, 0.3, 0.14, 0.04, MD.C.RED, 0); }
    mark(0); L = len;
  } else if (kind === 'van') {   // a VW-T2-style bus: two-tone
    g.box(0, 0.35, 0, 1.75, 1.0, 4.4, P, 1); mark(1);
    g.box(0, 1.35, 0, 1.75, 0.65, 4.4, col(0xeeeae0), 1); g.box(0, 1.37, 2.21, 1.6, 0.5, 0.04, MD.C.GLASS, 0); for (const s of [-1, 1]) g.box(s * 0.88, 1.4, -0.3, 0.02, 0.42, 3.2, MD.C.GLASS, 0);
    for (const [x, z] of [[0.78, 1.5], [-0.78, 1.5], [0.78, -1.4], [-0.78, -1.4]]) g.push(x, 0.35, z, 0, 0, Math.PI / 2).cyl(0, -0.1, 0, 0.35, 0.2, 7, MD.C.BLACK, 0).pop();
    mark(0); L = 4.4;
  } else if (kind === 'pickup') {
    g.box(0, 0.4, 0.9, 1.8, 0.9, 2.2, P, 1); g.box(0, 1.3, 0.5, 1.7, 0.75, 1.3, P, 1); g.box(0, 0.4, -1.5, 1.8, 0.6, 2.4, P, 1); mark(1);
    g.box(0, 1.35, 1.17, 1.55, 0.55, 0.04, MD.C.GLASS, 0); for (const [x, z] of [[0.82, 1.4], [-0.82, 1.4], [0.82, -1.6], [-0.82, -1.6]]) g.push(x, 0.4, z, 0, 0, Math.PI / 2).cyl(0, -0.12, 0, 0.4, 0.24, 7, MD.C.BLACK, 0).pop();
    mark(0); L = 4.8;
  } else if (kind === 'truck') {   // a 1980 Bedford-style lorry: cab in paint, grey box body
    g.box(0, 0.6, 2.5, 2.3, 1.9, 1.8, P, 1); mark(1);
    g.box(0, 1.6, 3.42, 2.1, 0.7, 0.04, MD.C.GLASS, 0); g.box(0, 0.7, -1.4, 2.4, 2.6, 5.6, col(0xb8b4aa), 1); g.box(0, 0.45, 0, 2.0, 0.3, 7.6, MD.C.DARK, 0);
    for (const z of [2.5, -2.4, -3.4]) for (const s of [-1, 1]) g.push(s * 1.05, 0.5, z, 0, 0, Math.PI / 2).cyl(0, -0.15, 0, 0.5, 0.3, 8, MD.C.BLACK, 0).pop();
    mark(0); L = 7.6;
  } else if (kind === 'tractor') { MD.tractor(g, r); mark(0); L = 3.4; }
  else if (kind === 'bus') {   // the country bus
    g.box(0, 0.45, 0, 2.45, 1.4, 10.5, P, 1); mark(1); g.box(0, 1.85, 0, 2.45, 1.1, 10.5, col(0xe8e4d4), 1); for (const s of [-1, 1]) g.box(s * 1.23, 2.0, 0.3, 0.02, 0.75, 8.8, MD.C.GLASS, 0); g.box(0, 1.9, 5.26, 2.2, 0.9, 0.04, MD.C.GLASS, 0);
    for (const z of [3.8, -3.2]) for (const s of [-1, 1]) g.push(s * 1.1, 0.5, z, 0, 0, Math.PI / 2).cyl(0, -0.15, 0, 0.5, 0.3, 8, MD.C.BLACK, 0).pop();
    mark(0); L = 10.5;
  }
  const d = g.build(), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(d.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(d.nrm, 3, true)); geo.setAttribute('color', new THREE.BufferAttribute(d.col, 3, true));
  geo.setAttribute('aPaint', new THREE.BufferAttribute(new Float32Array(paint), 1));
  return { geometry: geo, length: L };
}
function boatGeo(kind) {
  const g = new Geo(), paint = []; let n = 0; const mark = pt => { while (n < g.count) { paint.push(pt); n++; } };
  if (kind === 'dinghy') {   // a 4 m open boat, hull in paint
    g.push(0, 0, 0); for (const s of [-1, 1]) g.quad([s * 0.75, 0.5, -2], [s * 0.75, 0.5, 1.4], [s * 0.3, -0.1, 1.4], [s * 0.3, -0.1, -2], P0); g.quad([-0.3, -0.1, -2], [0.3, -0.1, -2], [0.3, -0.1, 1.4], [-0.3, -0.1, 1.4], P0); g.tri([0.75, 0.5, 1.4], [0, 0.55, 2.1], [0.3, -0.1, 1.4], P0); g.tri([-0.3, -0.1, 1.4], [0, 0.55, 2.1], [-0.75, 0.5, 1.4], P0); g.pop(); mark(1);
    g.box(0, 0.05, 0, 1.3, 0.05, 3.2, col(0x8a6a48), 0); g.box(0, 0.3, 0.2, 1.4, 0.06, 0.25, col(0x8a6a48), 0); g.box(0, 0.1, -2.05, 0.9, 0.5, 0.08, col(0x8a6a48), 0); g.box(0, 0.1, -2.25, 0.2, 0.6, 0.3, MD.C.DARK, 0); mark(0);
  } else {   // a 12-15 m wooden trawler / crabber: hull in paint, wheelhouse, mast and gantry
    for (const s of [-1, 1]) { g.quad([s * 2.2, 1.6, -6], [s * 2.2, 1.6, 4], [s * 1.2, -0.8, 4], [s * 1.2, -0.8, -6], P0); }
    g.tri([2.2, 1.6, 4], [0, 2.1, 7.4], [1.2, -0.8, 4], P0); g.tri([-1.2, -0.8, 4], [0, 2.1, 7.4], [-2.2, 1.6, 4], P0); g.tri([1.2, -0.8, 4], [0, 2.1, 7.4], [0, -0.6, 6.2], P0); g.tri([0, -0.6, 6.2], [0, 2.1, 7.4], [-1.2, -0.8, 4], P0);
    g.quad([-2.2, 1.6, -6], [2.2, 1.6, -6], [1.2, -0.8, -6], [-1.2, -0.8, -6], P0); mark(1);
    g.quad([-2.1, 1.5, -6], [-2.1, 1.5, 4.5], [2.1, 1.5, 4.5], [2.1, 1.5, -6], col(0x8a7a5a)); g.box(0, 1.6, 0.8, 4.4, 0.25, 9.6, MD.C.WHITE, 1, MD.C.WHITE);
    g.box(0, 1.5, 1.5, 2.6, 2.2, 2.8, col(0xeeeee6), 1); g.box(0, 3.7, 1.5, 2.8, 0.15, 3.0, col(0x3a3f46), 0); g.box(0, 2.9, 2.93, 2.3, 0.6, 0.04, MD.C.GLASS, 0);
    g.cyl(0, 3.8, 1.5, 0.08, 4.5, 5, MD.C.DARK, 0); g.strut([0, 7, 1.5], [0, 2, -5.5], 0.05, MD.C.DARK); g.strut([-1.8, 1.6, -5.6], [0, 5, -5.6], 0.12, col(0xc8a020)); g.strut([1.8, 1.6, -5.6], [0, 5, -5.6], 0.12, col(0xc8a020));
    for (let i = 0; i < 6; i++) g.box(-1.2 + (i % 3) * 0.7, 1.75, -3.5 - Math.floor(i / 3) * 0.7, 0.6, 0.45, 0.6, col(0x6a5a3a), 1);
    mark(0);
  }
  const d = g.build(), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(d.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(d.nrm, 3, true)); geo.setAttribute('color', new THREE.BufferAttribute(d.col, 3, true));
  geo.setAttribute('aPaint', new THREE.BufferAttribute(new Float32Array(paint), 1));
  return geo;
}
const P0 = col(0xffffff);
function cowGeo(sheep) {
  const g = new Geo(), paint = []; let n = 0; const mark = pt => { while (n < g.count) { paint.push(pt); n++; } };
  if (sheep) { g.box(0, 0.4, 0, 0.7, 0.55, 1.1, P0, 1); mark(1); g.box(0, 0.62, 0.62, 0.26, 0.28, 0.34, col(0x2a2622), 1); for (const [x, z] of [[-0.22, 0.35], [0.22, 0.35], [-0.22, -0.35], [0.22, -0.35]]) g.box(x, 0, z, 0.1, 0.42, 0.1, col(0x2a2622), 1); mark(0); }
  else {
    g.box(0, 0.75, 0, 0.75, 0.75, 1.9, P0, 1); mark(1);
    g.box(0, 0.9, 1.1, 0.4, 0.45, 0.55, col(0xe8e4dc), 1); g.box(0, 1.2, 1.05, 0.62, 0.06, 0.08, col(0xd8d0c0), 0);
    for (const [x, z] of [[-0.27, 0.65], [0.27, 0.65], [-0.27, -0.7], [0.27, -0.7]]) g.box(x, 0, z, 0.16, 0.78, 0.16, col(0x2a2622), 1);
    g.box(0.38, 0.85, -0.2, 0.02, 0.5, 0.7, col(0x1e1c1a), 0); g.box(-0.38, 0.95, 0.4, 0.02, 0.4, 0.5, col(0x1e1c1a), 0);   // patches
    mark(0);
  }
  const d = g.build(), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(d.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(d.nrm, 3, true)); geo.setAttribute('color', new THREE.BufferAttribute(d.col, 3, true));
  geo.setAttribute('aPaint', new THREE.BufferAttribute(new Float32Array(paint), 1));
  return geo;
}
function gullGeo() {   // a gull: body and two wing panels that flap in the shader (part 1 / 2)
  const g = new Geo(), parts = []; let n = 0; const mark = p => { while (n < g.count) { parts.push(p); n++; } };
  g.box(0, -0.06, 0, 0.12, 0.12, 0.45, col(0xf2f2ee), 1); mark(0);
  g.quad([0.05, 0, 0.1], [0.7, 0, 0.0], [0.7, 0, -0.12], [0.05, 0, -0.12], col(0xdcdcd8)); g.quad([0.05, 0, -0.12], [0.7, 0, -0.12], [0.7, 0, 0.0], [0.05, 0, 0.1], col(0x9a9a98)); mark(2);
  g.quad([-0.05, 0, -0.12], [-0.7, 0, -0.12], [-0.7, 0, 0.0], [-0.05, 0, 0.1], col(0xdcdcd8)); g.quad([-0.05, 0, 0.1], [-0.7, 0, 0.0], [-0.7, 0, -0.12], [-0.05, 0, -0.12], col(0x9a9a98)); mark(1);
  const d = g.build(), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(d.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(d.nrm, 3, true)); geo.setAttribute('color', new THREE.BufferAttribute(d.col, 3, true));
  geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(parts), 1));
  return geo;
}
// instanced material: paint vertices take the instance colour; walkers / flappers animate their limbs from aWalk
function instMat(fog, uTime, kind) {
  const extra = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPaint; attribute float aPart; attribute vec2 aWalk;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n#ifdef USE_INSTANCING_COLOR\n vColor.rgb = mix(color.rgb * color.rgb, instanceColor.rgb, aPaint);\n#endif');   // after the colour chunks
    if (kind === 'walk') sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { float a = 0.; float py = 0.88;
        if (aPart > 0.5 && aPart < 2.5) { a = sin(aWalk.x + (aPart > 1.5 ? 3.1416 : 0.)) * aWalk.y; py = 0.92; }
        else if (aPart > 2.5) { a = -sin(aWalk.x + (aPart > 3.5 ? 3.1416 : 0.)) * aWalk.y * 0.8; py = 1.46; }
        if (a != 0.) { float c = cos(a), s = sin(a); vec2 q = vec2(transformed.y - py, transformed.z); transformed.y = py + q.x * c - q.y * s; transformed.z = q.x * s + q.y * c; } }`);
    if (kind === 'flap') sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { if (aPart > 0.5) { float a = sin(aWalk.x) * aWalk.y * (aPart > 1.5 ? 1. : -1.); float c = cos(a), s = sin(a); vec2 q = transformed.xy; transformed.x = q.x * c - q.y * s; transformed.y = q.x * s + q.y * c; } }`);
  };
  extra.key = 'inst' + kind;
  return worldMaterial({ fog, uTime, extra });
}
const walkAttr = (geo, n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aWalk', a); return a; };

// ------------------------------------------------------------------------------------------- the ambient world
export function createAmbient(ctx) {
  const { scene, fx, root, zone, chunks, war, nav } = ctx;
  const fogM = ctx.fog || null, uTime = ctx.uTime || null;
  const groundAt = (x, z) => ctx.terrainH ? ctx.terrainH(x, z) : islandH(x, z);
  const A = { danger: [], people: [], cars: [], boats: [], stats: { people: 0, cars: 0, boats: 0, animals: 0, lit: 0, gulls: 0 } };
  const ownerAt = (x, z) => { if (Math.max(Math.abs(x), Math.abs(z)) > BOUND + 200) return 0; let best = null, bd = 1e9; for (const I of ISLANDS) { const d = Math.hypot(x - I.x, z - I.z) - I.r; if (d < bd) { bd = d; best = I; } } return bd < 60 ? best.owner : 0; };

  // ---- danger: every explosion and bullet impact the fx system shows (wrapped, no changes in fx.js)
  if (fx && !fx.__worldWrapped) {
    fx.__worldWrapped = true;
    const ex = fx.explode.bind(fx); fx.explode = (x, y, z, s = 1, o) => { A.danger.push({ x, z, t: 0, r: 160 + 40 * s, s }); hitVehicles(x, y, z, 2.5 + 2 * s); return ex(x, y, z, s, o); };
    const im = fx.impact.bind(fx); fx.impact = (x, y, z, k) => { if (Math.random() < 0.08) A.danger.push({ x, z, t: 0, r: 90, s: 0.2 }); return im(x, y, z, k); };
  }
  const dangerNear = (x, z) => { for (const d of A.danger) if (d.t < 25 && Math.hypot(x - d.x, z - d.z) < d.r) return d; return null; };

  // ===================================================================================== civilians
  const MAXP = 180, pGeo = personGeo(), pMesh = new THREE.InstancedMesh(pGeo, instMat(fogM, uTime, 'walk'), MAXP), pWalk = walkAttr(pGeo, MAXP);
  pMesh.count = 0; pMesh.frustumCulled = false; root.add(pMesh);
  const SHIRTS = [0xc84a3a, 0x3a5a9a, 0xe8d06a, 0x6a9a5a, 0xf0f0ea, 0xd88a3a, 0x8a4a8a, 0x4a8a9a, 0xb03030, 0x7a6a5a, 0x2a2a3a, 0xe8b8c8];
  const towns = new Map();   // source (chunk or zone entry) -> { doors, people: [] }
  function spawnPeople(src) {
    const doors = src.dyn && src.dyn.doors; if (!doors || !doors.length) return;
    const r = rng((Math.round(src.x) * 31 + Math.round(src.z) * 17) | 0), n = Math.min(14, Math.ceil(doors.length * 0.45)), list = [];
    for (let k = 0; k < n && A.people.length < MAXP; k++) {
      const d = doors[Math.floor(r() * doors.length)], rd = nearestRoad(d[0], d[2], 25);
      if (!rd) continue;
      const p = { src, door: d, R: rd.R, s: rd.s, dir: r() < 0.5 ? 1 : -1, lat: (r() < 0.5 ? 1 : -1) * (rd.R.hw + 0.7), speed: rnd(1.1, 1.5), state: r() < 0.3 ? 'inside' : 'walk', t: rnd(0, 20), x: d[0], z: d[2], y: d[1], yaw: 0, phase: r() * 6, col: SHIRTS[Math.floor(r() * SHIRTS.length)], tgt: null, walked: 0 };
      if (p.state === 'walk') { const q = roadPoint(p.R, p.s, p.lat); p.x = q.x; p.z = q.z; }
      list.push(p); A.people.push(p);
    }
    towns.set(src, list);
  }
  function dropPeople(src) { const l = towns.get(src); if (!l) return; A.people = A.people.filter(p => p.src !== src); towns.delete(src); }
  const _pt = {};
  function updatePeople(dt, cam) {
    let n = 0;
    for (const p of A.people) {
      const dist = Math.hypot(p.x - cam.position.x, p.z - cam.position.z);
      const danger = dangerNear(p.x, p.z);
      if (danger && p.state !== 'inside' && p.state !== 'flee') { p.state = 'flee'; p.tgt = [p.door[0], p.door[2]]; p.speed = rnd(3.8, 5.2); }
      p.t -= dt;
      if (p.state === 'inside') {
        if (p.t <= 0 && !danger) { p.state = 'out'; p.x = p.door[0]; p.z = p.door[2]; const rd = nearestRoad(p.x, p.z, 25); if (rd) { p.R = rd.R; p.s = rd.s; const q = roadPoint(p.R, p.s, p.lat); p.tgt = [q.x, q.z]; } else p.state = 'inside'; p.speed = rnd(1.1, 1.5); p.t = 10; }
        continue;
      }
      if (p.state === 'walk') {
        p.s += p.dir * p.speed * dt; p.walked += p.speed * dt;
        if (p.s < 2 || p.s > p.R.len - 2 || p.walked > 60 + (p.phase * 13) % 80) {   // turn round, or go in at the nearest door
          if (p.walked > 40 && Math.random() < 0.6) { const q = roadPoint(p.R, p.s, p.lat); let best = null, bd = 1e9; for (const d of (p.src.dyn.doors || [])) { const dd = Math.hypot(d[0] - q.x, d[2] - q.z); if (dd < bd) { bd = dd; best = d; } } if (best && bd < 30) { p.door = best; p.state = 'in'; p.tgt = [best[0], best[2]]; } else p.dir = -p.dir; }
          else p.dir = -p.dir;
          p.walked = 0; p.s = Math.max(2, Math.min(p.R.len - 2, p.s));
        }
        roadPoint(p.R, p.s, p.lat * p.dir, _pt); p.x = _pt.x; p.z = _pt.z; p.yaw = Math.atan2(_pt.dx * p.dir, _pt.dz * p.dir);
      } else {   // walking to a point (out to the road, in to the door, fleeing to the door)
        const dx = p.tgt[0] - p.x, dz = p.tgt[1] - p.z, d = Math.hypot(dx, dz);
        if (d < 0.4) { if (p.state === 'out') { p.state = 'walk'; p.walked = 0; } else { p.state = 'inside'; p.t = p.state === 'flee' ? 60 : rnd(8, 40); if (danger) p.t = 60; } continue; }
        const st = Math.min(d, p.speed * dt); p.x += dx / d * st; p.z += dz / d * st; p.yaw = Math.atan2(dx, dz);
      }
      if (dist > 420 || n >= MAXP) continue;
      p.phase += dt * p.speed * 3.6;
      p.y = groundAt(p.x, p.z);
      _p.set(p.x, p.y, p.z); _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.yaw); _m.compose(_p, _q, _s);
      pMesh.setMatrixAt(n, _m); pMesh.setColorAt(n, _c.setHex(p.col)); pWalk.setXY(n, p.phase, p.state === 'flee' ? 0.85 : 0.45); n++;
    }
    pMesh.count = n; pMesh.instanceMatrix.needsUpdate = true; if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true; pWalk.needsUpdate = true;
    A.stats.people = n;
  }

  // ===================================================================================== traffic
  const MODELS = {}, kinds = ['saloon', 'hatch', 'estate', 'van', 'pickup', 'truck', 'tractor', 'bus'];
  const PAINTS = [0xb8b4a8, 0x8a2a20, 0x2e4a6e, 0x2f5a3a, 0xd6c27a, 0x6e6a62, 0xe6e2d6, 0x8a6a3a, 0x3a3a3e, 0xa04a1a, 0x5a7a8a, 0x7a2a4a, 0xc8a020, 0x4a6a3a];
  const MAXC = 40, carMat = instMat(fogM, uTime, 'car');
  function setModel(kind, def) {   // swap a traffic model: { geometry (BufferGeometry, optional aPaint), length } or { object, length }
    const old = MODELS[kind]; if (old) { if (old.mesh) { root.remove(old.mesh); } if (old.pool) for (const o of old.pool) root.remove(o); }
    const m = { kind, length: def.length || 4.4, mesh: null, pool: null, n: 0 };
    if (def.object) { m.pool = []; m.object = def.object; }
    else { const g = def.geometry; if (!g.attributes.aPaint) g.setAttribute('aPaint', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1)); m.mesh = new THREE.InstancedMesh(g, carMat, MAXC); m.mesh.count = 0; m.mesh.frustumCulled = false; root.add(m.mesh); }
    MODELS[kind] = m; for (const c of A.cars) if (c.kind === kind) c.m = m;   // ngc/wheeledgame: cars already out switch too
    return m;
  }
  for (const k of kinds) setModel(k, vehicleGeo(k));
  // road connectivity, built lazily round the camera: endpoints and junctions
  const conn = new Map(), seen = new Set(), ck = (x, z) => Math.round(x / 3) * 100003 + Math.round(z / 3);
  const addConn = (x, z, e) => { const k = ck(x, z); let a = conn.get(k); if (!a) conn.set(k, a = []); a.push(e); };
  function learn(R) {
    if (seen.has(R.id)) return; seen.add(R.id);
    const n = R.xs.length - 1;
    addConn(R.xs[0], R.zs[0], { R, s: 0, dir: 1 }); addConn(R.xs[n], R.zs[n], { R, s: R.len, dir: -1 });
    for (const J of R.junctions || []) { const S = roadById(J.road); if (!S) continue; const e = J.end ? S.xs.length - 1 : 0; addConn(S.xs[e], S.zs[e], { R, s: J.s, dir: 0 }); learn(S); }
  }
  const linksAt = (x, z) => { const out = []; for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) { const a = conn.get(ck(x + dx * 3, z + dz * 3)); if (a) for (const e of a) if (Math.hypot(e.R.xs[e.dir === -1 ? e.R.xs.length - 1 : 0] - x, 0) < 1e9) out.push(e); } return out; };
  const VMAX = { tarmac: 21, lane: 15, street: 9, dirt: 7 };
  let graph = null, graphAt = [1e9, 1e9], spawnT = 0;
  function pickKind(R, r) { if (R.type === 'dirt') return r < 0.55 ? 'tractor' : r < 0.85 ? 'pickup' : 'estate'; const u = r; return u < 0.24 ? 'saloon' : u < 0.42 ? 'hatch' : u < 0.56 ? 'estate' : u < 0.68 ? 'van' : u < 0.78 ? 'pickup' : u < 0.9 ? 'truck' : u < 0.95 ? 'tractor' : 'bus'; }
  function spawnCar(cam, far = true) {
    if (!graph || !graph.roads.length || A.cars.length >= MAXC) return;
    let R = null; for (let t = 0; t < 8 && !R; t++) { const c = graph.roads[Math.floor(Math.random() * graph.roads.length)]; if (c.len > 40 && (c.kind !== 'track' || Math.random() < 0.3) && ownerAt(c.xs[0], c.zs[0]) !== 2) R = c; }
    if (!R) return;
    const s = rnd(5, R.len - 5), q = roadPoint(R, s), d = Math.hypot(q.x - cam.position.x, q.z - cam.position.z);
    if ((far && d < 280) || d > 1100 || q.bridge) return;
    learn(R);
    const kind = pickKind(R, Math.random()), m = MODELS[kind];
    A.cars.push({ R, s, dir: Math.random() < 0.5 ? 1 : -1, v: VMAX[R.type] * 0.6, kind, m, col: A.paints[kind] && A.paints[kind].length ? A.paints[kind][Math.floor(Math.random() * A.paints[kind].length)] : PAINTS[Math.floor(Math.random() * PAINTS.length)], x: q.x, y: q.y, z: q.z, yaw: 0, pitch: 0, wreck: 0, stopT: 0, flee: 0 });
  }
  function hitVehicles(x, y, z, r) {
    for (const c of A.cars) if (!c.wreck && Math.hypot(c.x - x, c.z - z) < r && Math.abs(c.y - y) < r + 2) { c.wreck = 120; c.v = 0; c.col = 0x26221e; fx.burn(c.x, c.y + 0.6, c.z, 40, 0.8); }
    for (const p of A.people) if (p.state !== 'inside' && Math.hypot(p.x - x, p.z - z) < r * 0.8) { p.state = 'inside'; p.t = 1e9; }   // (taken off the street)
  }
  const _a = {}, _b = {};
  function updateCars(dt, cam) {
    const cx = cam.position.x, cz = cam.position.z;
    if (Math.hypot(cx - graphAt[0], cz - graphAt[1]) > 250) { graph = roadGraph(cx, cz, Math.max(Math.abs(cx), Math.abs(cz)) < BOUND ? 450 : 1000); /* in the zone: its own roads, no wild generation */ graphAt = [cx, cz]; for (const R of graph.roads) learn(R); }
    const want = graph ? Math.min(MAXC, Math.round(graph.roads.reduce((a, R) => a + (R.type === 'dirt' ? 0.2 : R.type === 'street' ? 0.6 : 1) * R.len, 0) / 260)) : 0;
    spawnT -= dt; if (spawnT <= 0 && A.cars.length < want) { spawnT = 0.15; spawnCar(cam, A.cars.length > want * 0.3); }
    for (const m of Object.values(MODELS)) m.n = 0;
    for (let i = A.cars.length - 1; i >= 0; i--) {
      const c = A.cars[i], R = c.R;
      if (c.wreck) { c.wreck -= dt; if (c.wreck <= 0) { A.cars.splice(i, 1); continue; } }
      else {
        // speed: road type, the bend ahead, the car in front, danger
        let vt = VMAX[R.type] || 12;
        roadPoint(R, c.s, 0, _a); roadPoint(R, c.s + c.dir * 18, 0, _b);
        const turn = Math.abs(Math.atan2(_a.dx * _b.dz - _a.dz * _b.dx, _a.dx * _b.dx + _a.dz * _b.dz));
        if (turn > 0.05) vt = Math.min(vt, Math.sqrt(2.6 * 18 / turn));
        for (const o of A.cars) if (o !== c && o.R === R && o.dir === c.dir && !o.wreck) { const ahead = (o.s - c.s) * c.dir; if (ahead > 0 && ahead < 9 + c.v * 1.4) vt = Math.min(vt, Math.max(0, (ahead - 7) * 0.8)); }
        const d = dangerNear(c.x, c.z); if (d && !c.flee) { c.flee = 30; c.dir = -c.dir; }   // turn round and get away from it
        if (c.flee) { c.flee = Math.max(0, c.flee - dt); vt = VMAX[R.type] * 1.2; }
        c.v += Math.max(-6 * dt, Math.min(2.2 * dt, vt - c.v));
        c.s += c.dir * c.v * dt;
        if (c.s <= 0 || c.s >= R.len) {   // the end of this road: carry on into another one here
          const end = c.s <= 0 ? 0 : R.len, ex = c.s <= 0 ? R.xs[0] : R.xs[R.xs.length - 1], ez = c.s <= 0 ? R.zs[0] : R.zs[R.zs.length - 1];
          const opts = linksAt(ex, ez).filter(e => e.R !== R || e.s !== end);
          const e = opts.length ? opts[Math.floor(Math.random() * opts.length)] : null;
          if (e) { c.R = e.R; c.s = e.s; c.dir = e.dir || (Math.random() < 0.5 ? 1 : -1); learn(e.R); if (c.s <= 0) c.s = 0.1; if (c.s >= c.R.len) c.s = c.R.len - 0.1; }
          else { c.dir = -c.dir; c.s = Math.max(0.1, Math.min(R.len - 0.1, c.s)); }
        } else if (R.junctions && R.junctions.length && Math.random() < dt * 0.6) {   // turn off at a side road now and then
          for (const J of R.junctions) if (Math.abs(J.s - c.s) < 3) { const S = roadById(J.road); if (S && S.len > 30 && Math.random() < 0.35) { learn(S); c.R = S; c.s = J.end ? S.len - 0.1 : 0.1; c.dir = J.end ? -1 : 1; } break; }
        }
        roadPoint(c.R, c.s, (c.R.type === 'dirt' ? 0 : Math.min(1.7, c.R.hw * 0.48)) * c.dir, _a);
        c.x = _a.x; c.y = _a.y + (LIFT_ROAD[c.R.type] || 0.12); c.z = _a.z; c.yaw = Math.atan2(_a.dx * c.dir, _a.dz * c.dir); c.pitch = -Math.atan(_a.grade * c.dir);
      }
      const dist = Math.hypot(c.x - cx, c.z - cz); if (dist > 1300) { A.cars.splice(i, 1); continue; }
      const m = c.m; if (dist > 900) continue;
      _e.set(c.pitch, c.yaw, 0); _q.setFromEuler(_e); _p.set(c.x, c.y, c.z); _m.compose(_p, _q, _s);
      if (m.mesh) { m.mesh.setMatrixAt(m.n, _m); m.mesh.setColorAt(m.n, _c.setHex(c.col)); }
      else { let o = m.pool[m.n]; if (!o) { o = m.object.clone(); root.add(o); m.pool.push(o); } o.visible = true; o.position.copy(_p); o.quaternion.copy(_q); }
      m.n++;
    }
    let n = 0;
    for (const m of Object.values(MODELS)) { if (m.mesh) { m.mesh.count = m.n; m.mesh.instanceMatrix.needsUpdate = true; if (m.mesh.instanceColor) m.mesh.instanceColor.needsUpdate = true; } else for (let k = m.n; k < m.pool.length; k++) m.pool[k].visible = false; n += m.n; }
    A.stats.cars = n;
  }
  const LIFT_ROAD = { tarmac: 0.14, lane: 0.13, street: 0.12, dirt: 0.1 };

  // ===================================================================================== boats
  const MAXB = 60, dGeo = boatGeo('dinghy'), tGeo = boatGeo('trawler');
  const dMesh = new THREE.InstancedMesh(dGeo, carMat, MAXB), tMesh = new THREE.InstancedMesh(tGeo, carMat, 24);
  dMesh.count = tMesh.count = 0; dMesh.frustumCulled = tMesh.frustumCulled = false; root.add(dMesh, tMesh);
  const HULLS = [0x2a4a7a, 0xc8281e, 0x2f5a3a, 0xe8e4d8, 0x1e1e22, 0x3f6f7f, 0xd8b030];
  const moored = new Map(), workers = [];
  function addMoorings(src) {
    const ms = src.dyn && src.dyn.moorings; if (!ms || !ms.length) return;
    const r = rng((Math.round(src.x) * 13 + Math.round(src.z) * 7) | 0), list = [];
    for (const [x, z, yaw] of ms) if (r() < 0.75) list.push({ x, z, yaw: yaw + rnd(-0.1, 0.1), big: r() < 0.3, col: HULLS[Math.floor(r() * HULLS.length)], ph: r() * 6 });
    moored.set(src, list);
    // a trawler working off this harbour
    if (r() < 0.8 && workers.length < 12) { const [x, z, yaw] = ms[ms.length - 1]; workers.push({ src, hx: x, hz: z, x: x + Math.sin(yaw) * 60, z: z + Math.cos(yaw) * 60, yaw, tgt: null, v: 0, col: HULLS[Math.floor(r() * HULLS.length)], wakeT: 0, gulls: r() < 0.7 }); }
  }
  function dropMoorings(src) { moored.delete(src); for (let i = workers.length - 1; i >= 0; i--) if (workers[i].src === src) workers.splice(i, 1); }
  const deep = (x, z) => rawH(x, z) < -3.5 && (Math.max(Math.abs(x), Math.abs(z)) > BOUND + 200 || !nav || nav.wet(x, z));
  // the control zone's own fishing fleet, working the open water between the islands
  for (let k = 0; k < 6; k++) { const a = k * 1.05 + 0.4, r = 300 + (k % 3) * 120; let x = Math.cos(a) * r, z = Math.sin(a) * r; if (!deep(x, z) && nav) [x, z] = nav.nearestWater(x, z); workers.push({ src: null, hx: x, hz: z, x, z, yaw: a, tgt: null, v: 0, col: HULLS[k % HULLS.length], wakeT: 0, gulls: k % 2 === 0, zone: true }); }
  function updateBoats(dt, cam, t) {
    const cx = cam.position.x, cz = cam.position.z; let nd = 0, nt = 0;
    for (const [, list] of moored) for (const b of list) {
      if (Math.hypot(b.x - cx, b.z - cz) > 700 || nd >= MAXB) continue;
      _e.set(Math.sin(t * 0.9 + b.ph) * 0.03, b.yaw + Math.sin(t * 0.3 + b.ph) * 0.05, Math.sin(t * 1.3 + b.ph) * 0.06); _q.setFromEuler(_e);
      if (b.big) { _p.set(b.x, Math.sin(t * 1.1 + b.ph) * 0.12 - 0.15, b.z); _m.compose(_p, _q, _s.set(0.55, 0.55, 0.55)); if (nt < 24) { tMesh.setMatrixAt(nt, _m); tMesh.setColorAt(nt, _c.setHex(b.col)); nt++; } }
      else { _p.set(b.x, Math.sin(t * 1.1 + b.ph) * 0.12 + 0.05, b.z); _m.compose(_p, _q, _s.set(1, 1, 1)); dMesh.setMatrixAt(nd, _m); dMesh.setColorAt(nd, _c.setHex(b.col)); nd++; }
    }
    _s.set(1, 1, 1);
    for (const w of workers) {
      // pick a fishing ground offshore, steam to it slowly, trawl round it, then another
      if (!w.tgt || Math.hypot(w.tgt[0] - w.x, w.tgt[1] - w.z) < 25) {
        for (let k = 0; k < 12; k++) { const a = Math.random() * 6.28, d = rnd(150, 650), x = w.hx + Math.cos(a) * d, z = w.hz + Math.sin(a) * d; if (deep(x, z) && deep((x + w.x) / 2, (z + w.z) / 2)) { w.tgt = [x, z]; break; } }
        if (!w.tgt) w.tgt = [w.hx, w.hz];
      }
      const dx = w.tgt[0] - w.x, dz = w.tgt[1] - w.z, want = Math.atan2(dx, dz); let da = want - w.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
      w.yaw += Math.max(-0.12 * dt, Math.min(0.12 * dt, da)); w.v += (Math.abs(da) > 0.6 ? 1.5 : 3.2 - w.v) * dt * 0.3;
      const nx = w.x + Math.sin(w.yaw) * w.v * dt, nz = w.z + Math.cos(w.yaw) * w.v * dt;
      if (deep(nx, nz) || rawH(nx, nz) < rawH(w.x, w.z)) { w.x = nx; w.z = nz; } else { w.tgt = null; w.yaw += Math.PI * 0.5 * dt; }
      const dist = Math.hypot(w.x - cx, w.z - cz);
      if (dist < 450 && fx) { w.wakeT -= dt; if (w.wakeT <= 0) { w.wakeT = 0.9; fx.wake(w.x - Math.sin(w.yaw) * 6, w.z - Math.cos(w.yaw) * 6, 1.0); } }
      if (dist > 1600 || nt >= 24) continue;
      _e.set(Math.sin(t * 0.7 + w.hx) * 0.04, w.yaw, Math.sin(t * 0.9 + w.hz) * 0.06); _q.setFromEuler(_e); _p.set(w.x, Math.sin(t * 0.8) * 0.15 - 0.1, w.z); _m.compose(_p, _q, _s);
      tMesh.setMatrixAt(nt, _m); tMesh.setColorAt(nt, _c.setHex(w.col)); nt++;
    }
    dMesh.count = nd; tMesh.count = nt; for (const m of [dMesh, tMesh]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    A.stats.boats = nd + nt;
  }

  // ===================================================================================== gulls
  const MAXG = 60, gGeo = gullGeo(), gMesh = new THREE.InstancedMesh(gGeo, instMat(fogM, uTime, 'flap'), MAXG), gWalk = walkAttr(gGeo, MAXG);
  gMesh.count = 0; gMesh.frustumCulled = false; root.add(gMesh);
  function updateGulls(dt, cam, t) {
    let n = 0; const cx = cam.position.x, cz = cam.position.z;
    const flock = (x, y, z, k, seed) => { for (let i = 0; i < k && n < MAXG; i++) { const a = t * (0.35 + (i % 3) * 0.08) + i * 2.4 + seed, r = 12 + (i * 7 % 15), hx = x + Math.cos(a) * r, hz = z + Math.sin(a) * r, hy = y + 8 + (i % 4) * 2.5 + Math.sin(t * 0.7 + i) * 1.5; _p.set(hx, hy, hz); _e.set(0, a + Math.PI, Math.sin(t + i) * 0.3); _q.setFromEuler(_e); _m.compose(_p, _q, _s); gMesh.setMatrixAt(n, _m); gWalk.setXY(n, t * (5 + (i % 3)) + i, 0.5 + 0.2 * Math.sin(t * 0.5 + i)); n++; } };
    for (const w of workers) if (w.gulls && Math.hypot(w.x - cx, w.z - cz) < 500) flock(w.x - Math.sin(w.yaw) * 10, 2, w.z - Math.cos(w.yaw) * 10, 7, w.hx);
    for (const [src, list] of moored) if (list.length && Math.hypot(list[0].x - cx, list[0].z - cz) < 500) flock(list[0].x, 4, list[0].z, 5, list[0].ph);
    gMesh.count = n; gMesh.instanceMatrix.needsUpdate = true; gWalk.needsUpdate = true; A.stats.gulls = n;
  }

  // ===================================================================================== livestock
  const MAXA = 400, cowMesh = new THREE.InstancedMesh(cowGeo(false), carMat, MAXA), sheepMesh = new THREE.InstancedMesh(cowGeo(true), carMat, MAXA);
  cowMesh.count = sheepMesh.count = 0; root.add(cowMesh, sheepMesh); cowMesh.frustumCulled = sheepMesh.frustumCulled = false;
  const herds = new Map(); let herdsDirty = true;
  function addHerds(src) {
    const ps = src.dyn && src.dyn.pastures; if (!ps || !ps.length) return;
    const list = [];
    for (const [x, z, yaw, w, d, seed] of ps) {
      const r = rng(seed ^ 0x77), sheep = r() < 0.45, n = sheep ? r.int(8, 18) : r.int(4, 10), c = Math.cos(yaw), s = Math.sin(yaw);
      const hx = (r() - 0.5) * w * 0.4, hz = (r() - 0.5) * d * 0.4;   // they graze together
      for (let i = 0; i < n; i++) { const u = hx + (r() - 0.5) * w * 0.45, v = hz + (r() - 0.5) * d * 0.45, px = x + c * u + s * v, pz = z - s * u + c * v; list.push({ x: px, z: pz, y: groundAt(px, pz), yaw: r() * 6.28, sheep, col: sheep ? (r() < 0.1 ? 0x2a2622 : 0xe8e4d8) : r.pick([0x1e1c1a, 0x1e1c1a, 0x6a3a22, 0x8a5a32, 0xe8e4dc]), ph: r() * 6 }); }
    }
    herds.set(src, list); herdsDirty = true;
  }
  function updateHerds(dt, cam, t) {
    let nc = 0, ns = 0; const cx = cam.position.x, cz = cam.position.z;
    for (const [, list] of herds) for (const a of list) {
      if (Math.hypot(a.x - cx, a.z - cz) > 600) continue;
      if (Math.random() < dt * 0.05) a.yaw += rnd(-0.8, 0.8);   // now and then one turns to another tuft
      const m = a.sheep ? sheepMesh : cowMesh, k = a.sheep ? ns++ : nc++; if (k >= MAXA) continue;
      _p.set(a.x, a.y, a.z); _e.set(Math.sin(t * 0.3 + a.ph) > 0.6 ? 0.25 : 0, a.yaw, 0); _q.setFromEuler(_e); _m.compose(_p, _q, _s);
      m.setMatrixAt(k, _m); m.setColorAt(k, _c.setHex(a.col));
    }
    cowMesh.count = Math.min(nc, MAXA); sheepMesh.count = Math.min(ns, MAXA);
    for (const m of [cowMesh, sheepMesh]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    A.stats.animals = cowMesh.count + sheepMesh.count;
  }

  // ===================================================================================== smoke
  const LIT = 8, smoke = [];
  function updateSmoke(cam) {
    if (!fx) return;
    const cx = cam.position.x, cz = cam.position.z, cand = [];
    const consider = (src) => { const cs = src.dyn && src.dyn.chimneys; if (!cs) return; for (const c of cs) if (hash2(Math.round(c[0] * 3), Math.round(c[2] * 3), 5) < 0.3) { const d = Math.hypot(c[0] - cx, c[2] - cz); if (d < 380 && ownerAt(c[0], c[2]) !== 2) cand.push([d, c]); } };
    for (const c of chunks.values()) if (c.state === 'ready') consider(c);
    for (const e of zone) consider(e);
    cand.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < LIT; i++) {
      let e = smoke[i]; if (!e) { e = fx.chimney(0, -100, 0, 0.32); e.off = true; smoke.push(e); }
      if (!fx.emitters.includes(e)) fx.emitters.push(e);   // (fx.clear keeps chimneys; this is belt and braces)
      const c = cand[i]; if (c) { e.x = c[1][0]; e.y = c[1][1]; e.z = c[1][2]; e.off = false; } else e.off = true;
    }
    A.stats.lit = Math.min(LIT, cand.length);
  }

  // ===================================================================================== bookkeeping
  const active = new Set();
  function sources() { const s = []; for (const c of chunks.values()) if (c.state === 'ready') s.push(c); for (const e of zone) s.push(e); return s; }
  let scanT = 0, smokeT = 0;
  A.addChunk = c => { addMoorings(c); addHerds(c); };
  A.dropChunk = c => { dropPeople(c); dropMoorings(c); herds.delete(c); active.delete(c); };
  for (const e of zone) { addMoorings(e); }
  A.setModel = setModel; A.models = MODELS;
  // ngc/wheeledgame: the vehicle sim takes a car over near the player (units/wheeled/motorpool.js) and hands it back
  A.paints = {};   // kind -> [hex]: paint that kind from these (the drivable cars' own colours)
  A.release = c => { const i = A.cars.indexOf(c); if (i >= 0) A.cars.splice(i, 1); };
  A.adopt = d => { const m = MODELS[d.kind]; if (!m || A.cars.length >= MAXC) return null; learn(d.R); const c = { R: d.R, s: d.s, dir: d.dir, v: d.v, kind: d.kind, m, col: d.col, x: d.x, y: d.y, z: d.z, yaw: 0, pitch: 0, wreck: 0, stopT: 0, flee: 0 }; A.cars.push(c); return c; };
  A.update = (dt, cam, playing) => {
    const t = (A.t = (A.t || 0) + dt);
    for (const d of A.danger) d.t += dt; while (A.danger.length && A.danger[0].t > 60) A.danger.shift();
    scanT -= dt;
    if (scanT <= 0) {   // which towns are close enough to have people in their streets
      scanT = 1;
      for (const src of sources()) {
        const d = Math.hypot(src.x - cam.position.x, src.z - cam.position.z), on = d < 520 && (!src.I || src.I.owner !== 2);
        if (on && !active.has(src)) { active.add(src); spawnPeople(src); }
        else if (!on && active.has(src) && d > 620) { active.delete(src); dropPeople(src); }
        else if (src.I && src.I.owner === 2 && active.has(src)) { active.delete(src); dropPeople(src); }   // the machines came: the village empties
      }
    }
    updatePeople(dt, cam);
    updateCars(dt, cam);
    updateBoats(dt, cam, t);
    updateGulls(dt, cam, t);
    updateHerds(dt, cam, t);
    smokeT -= dt; if (smokeT <= 0) { smokeT = 2; updateSmoke(cam); }
  };
  return A;
}
