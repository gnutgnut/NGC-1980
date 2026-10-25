// Naval preview: orbit and inspect each ship on a sea, with the sea state, speed and heading driving the same motion
// model the game uses (seamotion.js). Query: ?ship=albatross|kraken|leviathan|container|msc|iowa|krakensky|albsky &sea=N &speed=m/s &ui=0
// &cam=yaw,pitch,dist,tx,ty,tz &auto=1 (turntable) &freeze=1 (no motion)
import * as THREE from 'three';
import { buildCarrier, buildBattleship, buildFreighter, addLiftFans } from '../js/ships.js';
import { buildMSCFreighter } from '../js/units/naval/mscfreighter.js';   // PARITY: the task force's supply ship
import { buildIowa } from '../js/units/naval/iowa.js';                    // PARITY: the task force's battleship
import { addLiftFansRW } from '../js/units/naval/skyfans.js';            // PARITY: the KRAKEN's sky-carrier fans
import { SEA_STATES, SHIPS, makeSea, createShipMotion } from '../js/units/naval/seamotion.js';

const Q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio)); document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9cc0de); scene.fog = new THREE.Fog(0x9cc0de, 600, 2200);
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a5a34, 0.9));
const sun = new THREE.DirectionalLight(0xfff0d0, 1.1); sun.position.set(0.5, 1, 0.3); scene.add(sun);
const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 4000);
// the sea: a flat plane (the game's sea is flat too), with a faint swell pattern so motion reads
const seaMat = new THREE.ShaderMaterial({
  uniforms: { t: { value: 0 }, hs: { value: 1 } }, fog: false,
  vertexShader: 'varying vec3 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `uniform float t, hs; varying vec3 vP;
    void main(){ float s = sin(vP.z*0.045 + t*0.75)*0.5 + sin(vP.x*0.03 + vP.z*0.02 + t*0.5)*0.3 + sin(vP.x*0.11 - vP.z*0.07 + t*1.3)*0.2;
      vec3 c = mix(vec3(0.07,0.2,0.33), vec3(0.16,0.34,0.48), 0.5 + 0.5*s*min(1., hs*0.4));
      float d = length(vP.xz - cameraPosition.xz); c = mix(c, vec3(0.61,0.75,0.87), smoothstep(500., 2200., d)); gl_FragColor = vec4(c, 1.); }`,
});
const sea = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), seaMat); scene.add(sea);

const BUILD = {
  albatross: () => ({ parts: buildCarrier(1), motion: 'albatross' }),
  kraken: () => ({ parts: buildCarrier(2), motion: 'kraken' }),
  leviathan: () => ({ parts: buildBattleship(), motion: 'leviathan' }),
  container: () => ({ parts: buildFreighter(), motion: 'container' }),
  msc: () => ({ parts: buildMSCFreighter(), motion: 'msc' }),
  iowa: () => ({ parts: buildIowa(), motion: 'iowa' }),
  krakensky: () => ({ parts: unfold(buildCarrier(2), addLiftFansRW), motion: 'kraken', sky: true }),
  albsky: () => ({ parts: unfold(buildCarrier(1), addLiftFans), motion: 'albatross', sky: true }),
};
// the sky-carrier refit shown unfolded and running (war.js skyRefit / skyVisuals set the same fields)
function unfold(parts, add) { add(parts); for (const f of parts.fans) { f.arm.visible = true; f.arm.scale.set(1, 1, 1); f.glow.material.opacity = 0.8; f.disc.material.opacity = 0.1; } return parts; }
const S = { ship: Q.get('ship') || 'albatross', sea: +(Q.get('sea') ?? 4), speed: +(Q.get('speed') ?? 4), waveDir: Math.PI, freeze: Q.get('freeze') === '1', yawRate: 0 };
let cur = null, mo = null, yaw = 0, t = 0;
function load(name) {
  if (cur) scene.remove(cur.parts.group);
  cur = BUILD[name](); scene.add(cur.parts.group);
  mo = createShipMotion(SHIPS[cur.motion], makeSea(S.sea, S.waveDir, 3), 3);
  window.__S.cur = cur; window.__S.mo = mo;
}
const cam = { yaw: 0.9, pitch: 0.32, dist: 170, t: new THREE.Vector3(0, 8, 0) };
if (Q.get('cam')) { const [y, p, d, x, yy, z] = Q.get('cam').split(',').map(Number); Object.assign(cam, { yaw: y, pitch: p, dist: d }); cam.t.set(x || 0, yy || 0, z || 0); }
let auto = Q.get('auto') === '1';
window.__S = { S, cam, camera, scene, renderer, THREE, load, render: () => renderer.render(scene, camera), step: (dt) => step(dt) };

// ---- UI
const ui = document.getElementById('ui'); if (Q.get('ui') === '0') ui.classList.add('hide'), document.getElementById('info').remove();
const row = (label, el) => { const l = document.createElement('label'); l.textContent = label; l.appendChild(el); ui.appendChild(l); return el; };
const sel = document.createElement('select'); for (const k of Object.keys(BUILD)) { const o = document.createElement('option'); o.value = o.textContent = k; sel.appendChild(o); } sel.value = S.ship; sel.onchange = () => { S.ship = sel.value; load(S.ship); }; row('ship', sel);
function slider(label, get, set, min, max, step = 0.01) { const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = get(); const lab = row(label, r); r.oninput = () => set(+r.value); return r; }
slider('sea state', () => S.sea, v => { S.sea = v; mo.setSea(makeSea(v, S.waveDir, 3)); }, 0, 7, 1);
slider('wave dir (rel)', () => S.waveDir, v => { S.waveDir = v; mo.setSea(makeSea(S.sea, v, 3)); }, 0, 6.28, 0.01);
slider('speed m/s', () => S.speed, v => S.speed = v, 0, 8, 0.1);
slider('turn rate', () => S.yawRate, v => S.yawRate = v, -0.09, 0.09, 0.005);
const tg = (label, get, set) => { const c = document.createElement('input'); c.type = 'checkbox'; c.checked = get(); c.onchange = () => set(c.checked); row(label, c); };
tg('freeze motion', () => S.freeze, v => S.freeze = v); tg('turntable', () => auto, v => auto = v);
const stat = document.createElement('div'); ui.appendChild(stat);

// ---- orbit
let drag = null;
renderer.domElement.addEventListener('pointerdown', e => drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey });
addEventListener('pointerup', () => drag = null);
addEventListener('pointermove', e => {
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (drag.pan) { const r = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0), u = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1); cam.t.addScaledVector(r, -dx * cam.dist * 0.0015).addScaledVector(u, dy * cam.dist * 0.0015); }
  else { cam.yaw -= dx * 0.006; cam.pitch = Math.max(-0.2, Math.min(1.5, cam.pitch + dy * 0.006)); }
});
addEventListener('wheel', e => cam.dist *= Math.exp(e.deltaY * 0.001));
function size() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', size); size();

function step(dt) {
  t += dt; seaMat.uniforms.t.value = t; seaMat.uniforms.hs.value = SEA_STATES[S.sea].hs;
  yaw += S.yawRate * dt;
  const g = cur.parts.group;
  if (!S.freeze) { mo.step(dt, S.speed, yaw, S.yawRate); g.position.set(0, mo.heave, 0); g.rotation.set(mo.pitch, yaw, mo.roll, 'YXZ'); }
  else { g.position.set(0, 0, 0); g.rotation.set(0, yaw, 0); }
  if (cur.parts.dish) cur.parts.dish.rotation.y += dt * 1.6;
  if (cur.parts.lamp) cur.parts.lamp.visible = (t % 1.4) < 0.15;
  cur.parts.tick?.(dt, t, camera.position.distanceTo(g.position));
  if (cur.sky) for (const f of cur.parts.fans) f.rotor.rotation.y += dt * 9 * f.sd;
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (auto) cam.yaw += dt * 0.15;
  step(dt);
  camera.position.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(cam.dist).add(cam.t);
  camera.lookAt(cam.t);
  renderer.render(scene, camera);
  if ((now | 0) % 10 < 1 || !stat.textContent) stat.textContent = `draw calls ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}\nheave ${mo.heave.toFixed(2)} m  pitch ${(mo.pitch * 57.3).toFixed(2)}°  roll ${(mo.roll * 57.3).toFixed(2)}°\n${SEA_STATES[S.sea].name}`;
  requestAnimationFrame(frame);
}
load(S.ship);
requestAnimationFrame(frame);
