// Rotary AI preview: watch each AI aircraft fly its mission over the test island (devworld.js) with a chase camera and
// telemetry, or turn the model on a turntable.
// Query: ?ac=ch46|mv22|wasp|cobra  &cam=chase|lz|orbit|side|deck  &skip=<s> (fly ahead before drawing)  &speed=<x>  &ui=0
//        &view=model (turntable) &s={json animation state for the turntable}  &paused
import * as THREE from 'three';
import { createDevWorld } from '../js/units/air/rotary/devworld.js';
import { UNITS } from './rotary-units.js';
import { Sfx } from '../js/audio.js';
import { createRotorSound } from '../js/units/air/rotary/rotorsound.js';
const sfx = new Sfx(), snd = createRotorSound(sfx);

const Q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio) * (+Q.get('res') || 1)); document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9cc2e0); scene.fog = new THREE.Fog(0x9cc2e0, 500, 1600);
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a5a34, 0.9));
const sun = new THREE.DirectionalLight(0xfff0d0, 1.1); sun.position.set(0.5, 1, 0.3); scene.add(sun);
const camera = new THREE.PerspectiveCamera(45, 1, 0.2, 3000);
const W = createDevWorld();
const AC = Q.get('ac') || 'ch46', VIEW = Q.get('view') || 'mission';
let camMode = Q.get('cam') || 'chase', speed = +(Q.get('speed') || 1), paused = Q.has('paused');

// ---- the world: island terrain (vertex colours by height / slope), sea, pad, two buildings, the carrier
{
  const N = 220, S = 1500, geo = new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2).translate(300, 0, -150);
  const p = geo.attributes.position, cols = [], c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = W.terrain(x, z); p.setY(i, h);
    if (h < -0.5) c.setHex(0x8a7a52); else if (h < 1.5) c.setHex(0xc8b27a); else if (Math.hypot(x - W.PAD.x, z - W.PAD.z) < 30) c.setHex(0x6f7a4a); else c.setHex(h > 28 ? 0x6d6a58 : 0x56703a);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x2b5f80, transparent: true, opacity: 0.88 })); sea.position.y = 0.02; scene.add(sea);
  const pad = new THREE.Group(); pad.position.set(W.PAD.x, W.PAD.h + 0.03, W.PAD.z); scene.add(pad);
  pad.add(new THREE.Mesh(new THREE.CircleGeometry(W.PAD.r, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5a5c58 })));
  pad.add(new THREE.Mesh(new THREE.RingGeometry(W.PAD.r - 0.6, W.PAD.r, 32).rotateX(-Math.PI / 2).translate(0, 0.01, 0), new THREE.MeshBasicMaterial({ color: 0xd8c040 })));
  for (const s of W.structs) { const b = new THREE.Mesh(new THREE.BoxGeometry(s.r * 1.4, s.h, s.r * 1.3), new THREE.MeshLambertMaterial({ color: 0x8a8a84 })); b.position.set(s.x, W.terrain(s.x, s.z) + s.h / 2, s.z); scene.add(b); }
}
// the two carriers (ALBATROSS grey, KRAKEN rust-grey): a hull, the deck, the island, three helicopter spots
const carriers = W.decks.map((d, i) => {
  const carrier = new THREE.Group(); scene.add(carrier); const hc = i ? 0x4f3c3a : 0x56616c;
  const hull = new THREE.Mesh(new THREE.BoxGeometry(d.W, d.H + 3, d.L), new THREE.MeshLambertMaterial({ color: hc })); hull.position.y = (d.H - 3) / 2; carrier.add(hull);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(d.W, d.L).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3c4045 })); top.position.y = d.H + 0.02; carrier.add(top);
  const tw = new THREE.Mesh(new THREE.BoxGeometry(5.5, 17, 18), new THREE.MeshLambertMaterial({ color: hc })); tw.position.set(10.5, d.H + 8.5, 6); carrier.add(tw);
  for (const z of [-35, -2, 31]) { const r = new THREE.Mesh(new THREE.RingGeometry(5.5, 6.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: i ? 0xff6a50 : 0xd8d8d0 })); r.position.set(-2, d.H + 0.05, z); carrier.add(r); }
  return { carrier, d };
});

// ---- the aircraft under test
const unit = VIEW === 'model' ? null : UNITS[AC].mission(scene, W);
const tm = VIEW === 'model' ? UNITS[AC].turntable(scene, Q.get('s') ? JSON.parse(Q.get('s')) : {}) : null;

// ---- UI
const tel = document.getElementById('tel'), bar = document.getElementById('bar');
if (Q.get('ui') === '0') { tel.classList.add('hide'); bar.classList.add('hide'); }
const btn = (label, fn, on) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { fn(); refresh(); }; b.on = on; bar.appendChild(b); return b; };
const go = (k, v) => { const q = new URLSearchParams(location.search); q.set(k, v); location.search = q.toString(); };
for (const a of Object.keys(UNITS)) btn(UNITS[a].label, () => go('ac', a), () => AC === a);
for (const c of ['chase', 'side', 'lz', 'squad', 'orbit', 'deck']) btn('cam: ' + c, () => { camMode = c; }, () => camMode === c);
btn('model turntable', () => go('view', VIEW === 'model' ? 'mission' : 'model'), () => VIEW === 'model');
for (const s of [1, 2, 4, 8]) btn('speed x' + s, () => { speed = s; }, () => speed === s);
btn('pause', () => { paused = !paused; }, () => paused);
btn('sound', () => { sfx.init(); sfx.on = !sfx.on; if (sfx.master) sfx.master.gain.value = sfx.on ? 0.5 : 0; }, () => !!sfx.on);
function refresh() { for (const b of bar.children) b.classList.toggle('on', !!(b.on && b.on())); }
refresh();

// ---- cameras
const cam = { yaw: 0.8, pitch: 0.3, dist: 34, t: new THREE.Vector3(), p: new THREE.Vector3(), init: false };
let drag = null;
renderer.domElement.addEventListener('pointerdown', e => drag = { x: e.clientX, y: e.clientY });
addEventListener('pointerup', () => drag = null);
addEventListener('pointermove', e => { if (!drag) return; cam.yaw -= (e.clientX - drag.x) * 0.006; cam.pitch = Math.max(-1.4, Math.min(1.4, cam.pitch + (e.clientY - drag.y) * 0.006)); drag.x = e.clientX; drag.y = e.clientY; if (camMode === 'chase') camMode = 'orbit'; refresh(); });
addEventListener('wheel', e => cam.dist *= Math.exp(e.deltaY * 0.001));
const _f = new THREE.Vector3(), _w = new THREE.Vector3();
function placeCamera(dt) {
  if (tm) { cam.t.copy(tm.center); camera.position.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(cam.dist * tm.scale).add(cam.t); camera.lookAt(cam.t); return; }
  const g = unit.focus(); g.getWorldPosition(_w);
  const k = cam.init ? 1 - Math.exp(-3 * dt) : 1; cam.init = true;
  if (camMode === 'chase') {   // behind and above, along the flight path when moving
    const v = unit.vel(); _f.set(v.x, 0, v.z); if (_f.lengthSq() < 4) _f.set(0, 0, -1).applyQuaternion(g.quaternion).setY(0); _f.normalize();
    cam.p.copy(_w).addScaledVector(_f, -unit.chase).add(_f.set(0, unit.chase * 0.32, 0));
  } else if (camMode === 'side') { _f.set(1, 0, 0).applyQuaternion(g.quaternion).setY(0).normalize(); cam.p.copy(_w).addScaledVector(_f, -unit.chase).add(_f.set(0, 4, 0)); }
  else if (camMode === 'lz') cam.p.set(W.PAD.x - 42, W.PAD.h + 11, W.PAD.z - 9);
  else if (camMode === 'squad') { const c = unit.squadCenter && unit.squadCenter(); if (c) { _w.set(c.x, c.y + 0.8, c.z); cam.p.set(c.x - 13, c.y + 5, c.z + 6); } }
  else if (camMode === 'deck') { const d = unit.homeDeck ? unit.homeDeck() : W.deck, c = Math.cos(d.yaw), s = Math.sin(d.yaw), lx = -14, lz = 60; cam.p.set(d.x + lx * c + lz * s, d.H + 14, d.z - lx * s + lz * c); }
  else cam.p.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(cam.dist).add(_w);
  cam.t.lerp(_w, k); camera.position.lerp(cam.p, camMode === 'orbit' || camMode === 'lz' || camMode === 'deck' || camMode === 'squad' ? 1 : k);
  camera.lookAt(cam.t);
}
function size() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', size); size();

// ---- loop: fixed 60 Hz sim steps, `speed` per frame
let simT = 0, last = performance.now(), acc = 0;
const DT = 1 / 60;
function step() { W.move(DT); simT += DT; unit.update(DT, simT); }
if (unit) { const skip = +(Q.get('skip') || 0); while (simT < skip && !unit.done()) step(); }
function syncCarrier() { for (const { carrier, d } of carriers) { carrier.position.set(d.x, 0, d.z); carrier.rotation.y = d.yaw; } }
function frame(now) {
  const real = Math.min(0.1, (now - last) / 1000); last = now;
  if (unit && !paused) { acc += real * speed; let n = 0; while (acc >= DT && n < 40) { step(); acc -= DT; n++; } }
  if (tm) { if (!paused) cam.yaw += real * 0.25; tm.update(real, now / 1000); }
  syncCarrier(); placeCamera(real);
  if (unit && unit.sound && sfx.on) snd.update(unit.sound(), camera.position, real);
  if (unit) tel.innerHTML = unit.telemetry(simT);
  else tel.innerHTML = `<b>${UNITS[AC].label}</b> turntable  (drag: orbit, wheel: zoom)`;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
syncCarrier(); if (unit) unit.update(0, simT);
requestAnimationFrame(frame);
window.__R = { W, unit, tm, camera, scene, renderer, THREE, cam, get simT() { return simT; }, step, set camMode(v) { camMode = v; }, set paused(v) { paused = v; },
  run(s) { const t1 = simT + s; while (simT < t1 && !unit.done()) step(); }, runUntil(fn, max = 400) { const t1 = simT + max; while (simT < t1 && !fn()) step(); return simT; },
  render() { syncCarrier(); placeCamera(1); if (unit) { tel.innerHTML = unit.telemetry(simT); } renderer.render(scene, camera); } };
