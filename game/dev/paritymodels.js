// Model viewer for the parity units (models only): the E-2C HAWKEYE, the BGM-109G GLCM and the MIM-23 HAWK section.
//   ?model=hawkeye|glcm|hawk  &s={json state}  &cam=yaw,pitch,dist,tx,ty,tz  &ui=0  &auto=1 (turntable)
// window.__V = { model, S, cam, set(stateObj), step(dt), render(), stats } for tools/scenes/paritymodels.mjs
import * as THREE from 'three';
import { buildHawkeyeModel } from '../js/units/air/hawkeyemodel.js';
import { buildGLCMModel } from '../js/units/air/glcmmodel.js';
import { BUILD } from '../js/units/defence/models.js';

const Q = new URLSearchParams(location.search), MODEL = Q.get('model') || 'hawkeye';
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio) * (+Q.get('res') || 1)); document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8fb6d8);
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a5a34, 0.9));
const sun = new THREE.DirectionalLight(0xfff0d0, 1.1); sun.position.set(0.5, 1, 0.3); scene.add(sun);
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 3000);
const cam = { yaw: 0.7, pitch: 0.3, dist: { hawkeye: 32, glcm: 9, hawk: 16 }[MODEL] || 20, t: new THREE.Vector3(0, MODEL === 'hawk' ? 1.2 : 0, 0) };
if (Q.get('cam')) { const [y, p, d, x, yy, z] = Q.get('cam').split(',').map(Number); Object.assign(cam, { yaw: y, pitch: p, dist: d }); cam.t.set(x || 0, yy || 0, z || 0); }
if (Q.get('ui') === '0') document.getElementById('info').classList.add('hide');
let drag = null;
renderer.domElement.addEventListener('pointerdown', e => drag = { x: e.clientX, y: e.clientY });
addEventListener('pointerup', () => drag = null);
addEventListener('pointermove', e => { if (!drag) return; cam.yaw -= (e.clientX - drag.x) * 0.006; cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch + (e.clientY - drag.y) * 0.006)); drag.x = e.clientX; drag.y = e.clientY; });
addEventListener('wheel', e => cam.dist *= Math.exp(e.deltaY * 0.001));
function size() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', size); size();
const orbitCam = () => { camera.position.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(cam.dist).add(cam.t); camera.lookAt(cam.t); };

const S = { t: 0, gear: 1, lights: true, eng: [{ prop: 1 }, { prop: 1 }], surf: { stab: 0, ail: 0, rud: 0, flap: 0 }, yaw: 0.4, pitch: 0.35, fired: 0, radar: true, ground: true };
if (Q.get('s')) Object.assign(S, JSON.parse(Q.get('s')));
let model, groundY = 0;
if (MODEL === 'hawkeye') { model = buildHawkeyeModel({ modex: 600 }); groundY = -2.3; }
else if (MODEL === 'glcm') { model = buildGLCMModel(); groundY = -1.2; }
else { const g = BUILD.hawk(1); model = { group: g, ud: g.userData }; }
scene.add(model.group);
const deck = new THREE.Mesh(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: MODEL === 'hawk' ? 0x6d7a48 : 0x3c4045 })); deck.position.y = groundY; scene.add(deck);
const grid = new THREE.GridHelper(120, 120, 0x667080, 0x50565e); grid.position.y = groundY + 0.003; scene.add(grid);
const stats = (() => { let tris = 0, meshes = 0; model.group.traverse(o => { if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return { tris, meshes }; })();

let time = 0, last = performance.now(), auto = Q.get('auto') === '1';
function pose(dt) {
  deck.visible = grid.visible = S.ground !== false;
  if (MODEL === 'hawk') {
    const ud = model.ud; ud.yaw.rotation.y = S.yaw; ud.pitch.rotation.x = S.pitch;
    ud.cells.forEach((c, i) => c.cover.visible = i >= S.fired);
    if (S.radar) ud.radar.rotation.y += dt * 2.0;
    ud.lamp.visible = (time % 1) < 0.5;
  } else model.animate(S, dt, time);
}
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt; if (auto) cam.yaw += dt * 0.3;
  pose(dt); orbitCam(); renderer.render(scene, camera); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__V = { THREE, model, S, cam, camera, scene, stats, set(o) { Object.assign(S, o); }, step(dt) { time += dt; pose(dt); }, render() { orbitCam(); renderer.render(scene, camera); } };
