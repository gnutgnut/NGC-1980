// Lived-in world preview: a patch of terrain with its towns, roads, farms and harbours built exactly as in the game
// (world/chunkgen.js), and the faction structures. Orbit with the mouse. URL:
//   ?focus=town|village|hamlet|farm|harbour|bridge|zone&n=0   what to look at (the n-th of its kind near x,z)
//   &x=&z=           search centre (default: east of the control zone)   &size=1200  terrain patch (m)
//   &dist=&yaw=&pitch=  camera (m, degrees)   &lod=far   show the far level of detail   &structs=1  faction structures
import * as THREE from 'three';
import { islandH, ISLANDS } from '../js/world.js';
import { ensure, settlementsNear, netState, farmsIn } from '../js/world/net.js';
import { buildChunk, CHUNK, buildGeo } from '../js/world/chunkgen.js';
import { zoneItems, townItems } from '../js/world/layout.js';
import { worldMaterial, groundMaterial, geoFrom } from '../js/world/gfx.js';
import { buildFactionStructure, buildPadDressing, buildShaftCollar, buildRWPylon, buildAASite, setStructGround } from '../js/world/structures.js';
import { Geo } from '../js/world/kit.js';
import { rng } from '../js/world/rng.js';
import { ruin, damageOverlay } from '../js/world/townkit.js';

const P = new URLSearchParams(location.search), num = (k, d) => P.has(k) ? +P.get(k) : d;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(), HORIZON = new THREE.Color(0xbfd9f2);
scene.background = HORIZON; scene.fog = new THREE.Fog(HORIZON, num('fogn', 600), num('fogf', 1400));
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a5a34, 0.9));
const sun = new THREE.DirectionalLight(0xfff0d0, 1.1); sun.position.set(0.5, 1, 0.3); scene.add(sun);
const cam = new THREE.PerspectiveCamera(num('fov', 55), innerWidth / innerHeight, 0.5, 5000);
const info = document.getElementById('info');

// ---- what to look at
let cx = num('x', 3600), cz = num('z', 1800);
ensure(cx, cz);
const focus = P.get('focus') || 'village', n = num('n', 0);
let target = null;
if (['town', 'village', 'hamlet'].includes(focus)) {
  const ss = settlementsNear(cx, cz, 5000).filter(s => s.size === focus).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
  const s = ss[n % ss.length]; if (s) target = [s.x, s.z];
} else if (focus === 'harbour') {
  const ss = settlementsNear(cx, cz, 6000).filter(s => s.coast).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
  for (const s of ss) ensure(s.x, s.z);
  const s = ss.filter(s => s.layout && s.layout.quay)[n] || ss[0]; if (s) target = s.layout && s.layout.quay ? [s.layout.quay.x, s.layout.quay.z] : [s.x, s.z];
} else if (focus === 'farm') {
  for (let k = 0; k < 9; k++) ensure(cx + (k % 3 - 1) * 1600, cz + (Math.floor(k / 3) - 1) * 1600);
  const fs = farmsIn(cx - 3000, cz - 3000, cx + 3000, cz + 3000).filter(f => f.fields.length >= 3).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
  const f = fs[n % Math.max(1, fs.length)]; if (f) target = [f.x, f.z];
} else if (focus === 'bridge') {
  for (let k = 0; k < 25; k++) ensure(cx + (k % 5 - 2) * 1600, cz + (Math.floor(k / 5) - 2) * 1600);
  const bs = []; for (const R of netState.roads) for (let i = 1; i < R.br.length; i++) if (R.br[i] && !R.br[i - 1]) bs.push([R.xs[i + 1] || R.xs[i], R.zs[i + 1] || R.zs[i]]);
  bs.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz)); if (bs[n]) target = bs[n];
} else if (['pub', 'school', 'chapel', 'vhall', 'pcar', 'psign'].includes(focus)) {   // ngc/world-polish: the n-th such item near x, z
  for (let k = 0; k < 9; k++) ensure(cx + (k % 3 - 1) * 1600, cz + (Math.floor(k / 3) - 1) * 1600);
  const its = []; for (const s of settlementsNear(cx, cz, 3000)) for (const it of townItems(s, null)) if (focus === 'pub' ? it.pub : it.t === focus) its.push(it);
  its.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
  const it = its[n % Math.max(1, its.length)]; if (it) { target = [it.x, it.z]; if (!P.has('yaw')) P.set('yaw', String(it.yaw * 180 / Math.PI)); }
} else if (focus === 'zone') {
  const I = ISLANDS.find(I => I.name === (P.get('island') || 'HOME ISLAND')) || ISLANDS[0]; target = [I.x, I.z];
}
if (P.has('structs')) target = [0, 0];
if (!target) target = [cx, cz];
const [tx, tz] = target, ty = Math.max(0, islandH(tx, tz));

// ---- faction structures: rows hq / fuel / depot / radar; columns: neutral, ours, ours damaged, ours destroyed,
//      RUNAWAY, RUNAWAY damaged, RUNAWAY destroyed, retaken by us (shards round it)
const STRUCTS = P.has('structs');
setStructGround(() => 0);
const structs = [];
if (STRUCTS) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3f8a32 })); scene.add(ground);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(8.5, 24).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8a8c90 })); pad.position.set(-150, 0.05, 90); scene.add(pad);
  const dress = buildPadDressing(); dress.position.set(-150, 0, 90); scene.add(dress); structs.push({ dress });
  const collar = buildShaftCollar(); collar.position.set(-110, 0, 90); collar.userData.setSide(2); scene.add(collar);
  const collar2 = buildShaftCollar(); collar2.position.set(-70, 0, 90); collar2.userData.setSide(1); scene.add(collar2);
  for (let k = 0; k < 4; k++) { const p = buildRWPylon(); p.position.set(-30 + k * 18, 0, 90); scene.add(p); }
  for (const [x, side] of [[60, 1], [90, 2]]) { const a = buildAASite(() => 0, [[x, 90, Math.PI / 2]]); a.userData.setSide(side); scene.add(a); }   // ngc/world-polish: AA emplacements
  ['hq', 'fuel', 'factory', 'radar'].forEach((kind, row) => {
    const cols = [[0, 'intact'], [1, 'intact'], [1, 'damaged'], [1, 'destroyed'], [2, 'intact'], [2, 'damaged'], [2, 'destroyed'], ['retaken', 'intact']];
    cols.forEach(([side, cond], c) => {
      const g = buildFactionStructure(kind, side === 'retaken' ? 2 : side); g.position.set(-150 + c * 40, 0, -75 + row * 42); scene.add(g); structs.push(g);
      const ud = g.userData; ud.state.grow = 1; ud.attach({ fx: null, s: { I: { pad: null, structs: [] } } });   // (the fence goes up on the first tick)
      if (side === 'retaken') ud.setSide(1);
      if (cond === 'damaged') ud.onHp(0.4); if (cond === 'destroyed') ud.setState('destroyed');
    });
  });
}
// ---- terrain patch (colours like the game's terrain shader)
const SIZE = num('size', 1200), RES = 4, N = Math.round(SIZE / RES);
if (!STRUCTS) {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, N, N).rotateX(-Math.PI / 2).translate(-(tx % RES), 0, -(tz % RES)).toNonIndexed(), p = geo.attributes.position, colA = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + tx, z = p.getZ(i) + tz; p.setY(i, Math.max(-14, islandH(x, z))); p.setX(i, x); p.setZ(i, z); }
  for (let t = 0; t < p.count; t += 3) {
    const y = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3, x = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3, z = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
    const chk = (Math.floor(x / 6) + Math.floor(z / 6)) & 1;
    if (y <= 0) c.setRGB(0.05, 0.25, 0.35); else if (y < 3) c.setRGB(0.6, 0.52, 0.25); else c.setRGB(chk ? 0.25 : 0.17, chk ? 0.6 : 0.5, chk ? 0.19 : 0.15);
    for (let k = 0; k < 3; k++) { colA[(t + k) * 3] = c.r; colA[(t + k) * 3 + 1] = c.g; colA[(t + k) * 3 + 2] = c.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colA, 3)); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); scene.add(m);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1c5a78, transparent: true, opacity: 0.85 })); sea.position.set(tx, 0, tz); scene.add(sea);
}
// ---- the built world
const mat = worldMaterial(), lod = P.get('lod') === 'far' ? 'far' : 'near', gmat = groundMaterial({ far: lod === 'far' }), glod = lod === 'far' ? 'gfar' : 'gnear';
let tris = 0, chunks = 0, t0 = performance.now();
const wireMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a });
if (focus === 'zone') {
  for (const { items } of zoneItems(islandH)) {
    const g = buildGeo({ items, roads: new Map(), discs: [], x0: -1e9, z0: -1e9, x1: 1e9, z1: 1e9 }, islandH);
    // zone roads
    const road = new Map(); for (const R of netState.roads) if (R.kind === 'zone') road.set(R, new Set(R.xs.map((_, i) => i).slice(0, -1)));
    const gr = buildGeo({ items: [], roads: road, discs: [], x0: -1e9, z0: -1e9, x1: 1e9, z1: 1e9 }, islandH);
    for (const d of [g[lod], gr[lod], ...(lod === 'near' ? [g.detail] : [])]) { if (!d.tris) continue; const mesh = new THREE.Mesh(geoFrom(d), mat); scene.add(mesh); tris += d.tris; }
    for (const d of [g[glod], gr[glod]]) { const mesh = new THREE.Mesh(geoFrom(d), gmat); scene.add(mesh); tris += d.tris; }
  }
} else if (!STRUCTS) {
  const c0 = Math.floor((tx - SIZE / 2) / CHUNK), c1 = Math.floor((tx + SIZE / 2) / CHUNK), d0 = Math.floor((tz - SIZE / 2) / CHUNK), d1 = Math.floor((tz + SIZE / 2) / CHUNK);
  for (let j = d0; j <= d1; j++) for (let i = c0; i <= c1; i++) {
    const c = buildChunk(i, j, islandH), d = c[lod];
    // ngc/world-polish: &damage=1 knocks every third building about (damaged / destroyed, as world/life.js does)
    if (P.has('damage')) {
      const g = new Geo();
      c.dyn.bld.forEach((b, k) => {
        if (k % 3) return; const dead = k % 2 === 0, r = rng((b.it.seed | 0) ^ 0x5eed);
        if (dead) { const [a, e] = lod === 'far' ? b.f : b.n, A = d.pos; for (let v = a; v < e; v++) { A[v * 3] = A[a * 3]; A[v * 3 + 1] = A[a * 3 + 1]; A[v * 3 + 2] = A[a * 3 + 2]; } }
        g.weather(b.y, 1.0, 0.3, 0.08); g.push(b.x, b.y, b.z, b.yaw); (dead ? ruin : damageOverlay)(g, r, b.it); g.pop(); g.unweather();
      });
      const rd = g.build(); if (rd.tris) { scene.add(new THREE.Mesh(geoFrom(rd), mat)); tris += rd.tris; }
    }
    scene.add(new THREE.Mesh(geoFrom(d), mat)); scene.add(new THREE.Mesh(geoFrom(c[glod]), gmat)); tris += d.tris + c[glod].tris; chunks++;
    if (lod === 'near' && c.detail.tris) { scene.add(new THREE.Mesh(geoFrom(c.detail), mat)); tris += c.detail.tris; }   // ngc/world-polish: the detail layer
    if (c.wires.length && lod === 'near') { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(c.wires, 3)); scene.add(new THREE.LineSegments(g, wireMat)); }
  }
}
const buildMs = performance.now() - t0;
// ---- camera
let yaw = num('yaw', 35) * Math.PI / 180, pitch = num('pitch', 28) * Math.PI / 180, dist = num('dist', 260);
const look = new THREE.Vector3(tx, ty + num('lookup', 4), tz);
function place() { cam.position.set(look.x + Math.sin(yaw) * Math.cos(pitch) * dist, look.y + Math.sin(pitch) * dist, look.z + Math.cos(yaw) * Math.cos(pitch) * dist); cam.position.y = Math.max(cam.position.y, islandH(cam.position.x, cam.position.z) + 1.7); cam.lookAt(look); }
place();
let drag = null;
addEventListener('pointerdown', e => drag = { x: e.clientX, y: e.clientY, shift: e.shiftKey });
addEventListener('pointerup', () => drag = null);
addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; if (drag.shift) { look.x -= Math.cos(yaw) * dx * dist * 0.002; look.z += Math.sin(yaw) * dx * dist * 0.002; } else { yaw -= dx * 0.005; pitch = Math.max(0.02, Math.min(1.5, pitch + dy * 0.005)); } place(); });
addEventListener('wheel', e => { dist *= Math.exp(e.deltaY * 0.001); place(); });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
info.textContent = `${focus} ${n} at (${tx.toFixed(0)}, ${tz.toFixed(0)})  ${lod}: ${tris} tris in ${chunks} chunks, built in ${buildMs.toFixed(0)} ms`;
window.__stats = { tris, chunks, buildMs, target };
function frame() { requestAnimationFrame(frame); const t = performance.now() / 1000; for (const s of structs) if (s.userData && s.userData.tick) s.userData.tick(1 / 60, t); renderer.render(scene, cam); }
frame(); window.__ready = true;
window.__view = (y, p, d, lx, lz) => { yaw = y * Math.PI / 180; pitch = p * Math.PI / 180; dist = d; if (lx !== undefined) { look.x = lx; look.z = lz; look.y = Math.max(0, islandH(lx, lz)) + 3; } place(); };
