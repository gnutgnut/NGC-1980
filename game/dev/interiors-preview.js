// INTERIORS (ngc/interiors) preview: the rooms of the lived-in world's buildings, cut away (no shell, no roof), the
// barracks hut, the ALBATROSS's hangar deck and island, the crew figures. Drag to orbit, wheel to zoom, shift-drag pans.
//   ?b=house|house1|cottage|terrace|church|petrol|barn|boatshed|garage|barracks|all|ship|crew   &shell=1 (the outside
//   too, from models.js)   &dist= &yaw= &pitch= (degrees)   &cut=  hide everything above this height (m)
import * as THREE from 'three';
import { Geo } from '../js/world/kit.js';
import { geoFrom, worldMaterial } from '../js/world/gfx.js';
import * as MD from '../js/world/models.js';
import { rng } from '../js/world/rng.js';
import { planOf } from '../js/interiors/rooms.js';
import { buildRoomsGeo, leafGeo } from '../js/interiors/furniture.js';
import { createAlbInterior } from '../js/interiors/shipint.js';
import { buildShipGeo } from '../js/interiors/shipgeo.js';
import { crewMesh, crewGeometry, crewMaterial } from '../js/interiors/crewfig.js';
import { DOORS } from '../js/interiors/doors.js';

const Q = new URLSearchParams(location.search), B = Q.get('b') || 'all', CUT = +(Q.get('cut') || 1e9);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(2, devicePixelRatio)); document.body.appendChild(renderer.domElement);
renderer.localClippingEnabled = CUT < 1e8;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfd9f2);
scene.add(new THREE.HemisphereLight(0xddeeff, 0x554433, 1.2)); const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(30, 60, 20); scene.add(sun);
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 2000);
const clip = CUT < 1e8 ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), CUT)] : [];
const MAT = worldMaterial(); MAT.clippingPlanes = clip;
const ITEMS = {
  house: { t: 'house', w: 9.5, d: 7.8, floors: 2, wall: 0xe8e0c8, roof: 0x4b515b, door: 0x2f5a3a, seed: 101 },
  house1: { t: 'house', w: 8.5, d: 7, floors: 1, wall: 0xdcc0a8, roof: 0xa3553b, door: 0x8a2a22, seed: 202 },
  cottage: { t: 'cottage', w: 7.2, d: 5.6, wall: 0xe9e5da, roof: 0x3d424a, door: 0x2a4a7a, seed: 303 },
  terrace: { t: 'terrace', w: 18, d: 8.4, units: 3, floors: 3, shops: true, roof: 0x575d66, seed: 404 },
  church: { t: 'church', seed: 505 }, petrol: { t: 'petrol', w: 16, d: 12, seed: 606 }, barn: { t: 'barn', w: 16, d: 9, seed: 707 },
  boatshed: { t: 'boatshed', seed: 808 }, garage: { t: 'garage', seed: 909 }, barracks: { t: 'barracks', seed: 9003 },
};
const center = new THREE.Vector3();
function addBuilding(it, x, z) {
  Object.assign(it, { x, z, y: 0, yaw: 0, drop: 0.3 });
  const P = planOf(it); if (!P) return;
  const m = new THREE.Mesh(geoFrom(buildRoomsGeo(P).build()), MAT); m.position.set(x, 0, z); scene.add(m);
  for (const d of P.doors) {   // the leaves (shut, or ajar with &open=1)
    const D = DOORS.register(P.key + '#' + d.id, d, { toWorld: (u, v, o) => { o[0] = x + u; o[1] = z + v; return o; }, yaw: () => 0, y0: () => 0 });
    if (Q.get('open')) DOORS.set(D, true);
    const L = DOORS.leaf(D), lm = new THREE.Mesh(geoFrom(leafGeo(d.kind === 'inner' || d.kind === 'mil' ? 'house' : d.kind).build()), MAT.clone()); lm.material.color = new THREE.Color(d.c ?? 0x2f5a3a);
    if (d.kind === 'garage') { lm.geometry.translate(0, -1, 0); lm.position.set(x + L.hu, d.y + d.h, z + L.hv); lm.rotation.set(-L.lift * 1.5, Math.atan2(-L.dv, L.du), 0, 'YXZ'); }
    else { lm.position.set(x + L.hu, d.y, z + L.hv); lm.rotation.y = Math.atan2(-L.dv, L.du); }
    lm.scale.set(d.w, d.h, 1); scene.add(lm);
  }
  if (Q.get('shell')) { const g = new Geo(), r = rng(it.seed | 0); g.push(x, 0, z, 0); const f = { house: MD.house, cottage: MD.cottage, terrace: MD.terrace, church: MD.church, petrol: MD.petrol, barn: MD.barn, boatshed: MD.boatShed, garage: MD.garageBox }[it.t]; if (f) f(g, r, it); g.pop(); const sm = new THREE.Mesh(geoFrom(g.build()), MAT); scene.add(sm); }
  return P;
}
let dist = +(Q.get('dist') || 22), yaw = (+(Q.get('yaw') || 35)) * Math.PI / 180, pitch = (+(Q.get('pitch') || 55)) * Math.PI / 180;
const info = document.getElementById('info');
if (B === 'ship') {
  const ship = { p: { x: 0, y: 0, z: 0 }, yaw: 0, att: null, parts: { lifts: [{ E: { x0: 14, x1: 23, z0: -24, z1: -10 }, sd: 1, y: 8 }, { E: { x0: 14, x1: 23, z0: 17, z1: 30 }, sd: 1, y: 4.25 }, { E: { x0: -23, x1: -14, z0: -38, z1: -25 }, sd: -1, y: 8 }] } };
  const INT = createAlbInterior(ship);
  scene.add(new THREE.Mesh(geoFrom(buildShipGeo(INT).build()), MAT));
  const cm = crewMesh(INT.crew); cm.material = crewMaterial().clone(); cm.material.clippingPlanes = clip; scene.add(cm);
  center.set(+(Q.get('cx') || 10.5), +(Q.get('cy') || 8), +(Q.get('cz') || 6)); dist = +(Q.get('dist') || 30);
  info.textContent = `ALBATROSS interior: ${INT.walls.length} walls, ${INT.floors.length} decks, ${INT.furn.length} fittings, ${INT.crew.length} crew`;
} else if (B === 'crew') {
  const kinds = ['sailor', 'officer', 'pilot', 'jetPilot', 'heloPilot', 'deck', 'marine', 'tanker'];
  kinds.forEach((k, i) => { for (const [j, pose] of ['stand', 'seated', 'kneel'].entries()) { const m = new THREE.Mesh(crewGeometry(k, pose, { arms: pose === 'seated' ? (k === 'marine' ? 'rifle' : 'controls') : i % 2 ? 'table' : 'side', jersey: 'green' }), crewMaterial()); m.position.set(i * 1.2 - 4, pose === 'seated' ? 0.45 : 0, j * 1.6); m.rotation.y = Math.PI * 0.85; scene.add(m); } });
  center.set(0, 0.8, 1.6); dist = +(Q.get('dist') || 9);
  info.textContent = kinds.join('  ');
} else {
  const list = B === 'all' ? Object.keys(ITEMS) : [B];
  let x = 0; const out = [];
  for (const k of list) { const it = { ...ITEMS[k] }, w = it.t === 'church' ? 34 : it.t === 'petrol' ? 10 : it.w || 8; x += w / 2 + 3; const P = addBuilding(it, x, 0); out.push(`${k}: ${P.walls.length} walls, ${P.furn.length} pieces`); x += w / 2 + 3; }
  center.set(list.length > 1 ? x / 2 : x / 2, 1, 0);
  info.textContent = out.join('\n');
}
const grid = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6a7a5a })); grid.position.y = B === 'ship' ? -0.01 : -0.32; scene.add(grid);
function place() { cam.position.set(center.x + Math.sin(yaw) * Math.cos(pitch) * dist, center.y + Math.sin(pitch) * dist, center.z + Math.cos(yaw) * Math.cos(pitch) * dist); cam.lookAt(center); }
let drag = null;
addEventListener('pointerdown', e => drag = { x: e.clientX, y: e.clientY, shift: e.shiftKey });
addEventListener('pointerup', () => drag = null);
addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; if (drag.shift) { center.x -= Math.cos(yaw) * dx * dist * 0.002; center.z += Math.sin(yaw) * dx * dist * 0.002; } else { yaw -= dx * 0.005; pitch = Math.max(0.02, Math.min(1.55, pitch + dy * 0.005)); } place(); });
addEventListener('wheel', e => { dist *= Math.exp(e.deltaY * 0.001); place(); });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
place();
renderer.setAnimationLoop(() => renderer.render(scene, cam));
window.__ready = true;
