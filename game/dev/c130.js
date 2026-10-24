// KC-130R flight test page: fly it (keyboard / stick / mouse on the switches) or watch the autopilot, from the flight
// deck, a chase camera or an orbit, with live telemetry. Flat test range: a 2 km runway, a drop zone 2 km north,
// scattered trees for the sense of speed. Same world air as the game (4x density): IAS and forces are real, true speeds half.
// Query: ?start=air|runway|drop  ?view=deck|chase|orbit  ?ui=0  ?ap=1
import * as THREE from 'three';
import { createC130Sim, C130, KT, K_EQ } from '../js/units/air/c130fm.js';
import { buildC130Mesh, C130M } from '../js/units/air/c130model.js';
import { buildC130Deck, DECK_EYE, DECK_EYE_PITCH } from '../js/units/air/c130cockpit.js';
import { createC130Audio } from '../js/units/air/c130audio.js';
import { Sfx } from '../js/audio.js';

const Q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio) * (+Q.get('res') || 1)); document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9db9d4); scene.fog = new THREE.Fog(0x9db9d4, 800, 7000);
scene.add(new THREE.HemisphereLight(0xd8ecff, 0x56653c, 0.95));
const sun = new THREE.DirectionalLight(0xfff0d0, 1.15); sun.position.set(0.4, 1, 0.25); scene.add(sun);
const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 12000);
// ---- the range
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x66744c })); scene.add(ground);
const runway = new THREE.Mesh(new THREE.PlaneGeometry(45, 2000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3d4043 })); runway.position.set(0, 0.03, -900); scene.add(runway);
for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8e8e0 })); m.position.set(0, 0.05, 60 - i * 50); scene.add(m); }
{ const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(4, 14, 6).translate(0, 7, 0), new THREE.MeshLambertMaterial({ color: 0x2f4a26 }), 3000); const m4 = new THREE.Matrix4(); let n = 0;
  for (let i = 0; i < 3000; i++) { const x = (Math.random() - 0.5) * 9000, z = (Math.random() - 0.5) * 9000; if (Math.abs(x) < 120 && z < 200 && z > -2000) continue; const s = 0.6 + Math.random(); m4.makeScale(s, s, s).setPosition(x, 0, z); trees.setMatrixAt(n++, m4); }
  trees.count = n; scene.add(trees); }
const DZ = new THREE.Vector3(0, 0, -4200);
const dzRing = new THREE.Mesh(new THREE.RingGeometry(24, 30, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff8030 })); dzRing.position.set(DZ.x, 0.1, DZ.z); scene.add(dzRing);
const env = { groundY: () => 0, water: () => false, wind: { x: 2, z: 1 } };

// ---- the aircraft
const S = createC130Sim(), model = buildC130Mesh(), deck = buildC130Deck(); scene.add(model.group); model.group.add(deck.group);
const sfx = new Sfx(), snd = createC130Audio(sfx);
const START = Q.get('start') || 'air';
let crewStart = false;
// Engine start checklist (T.O. 1C-130H-1 flow, simplified): BEFORE STARTING ENGINES, then STARTING ENGINES in the
// order 3, 4, 2, 1 (the GTC feeds #3 first; the rest start on its bleed or cross-bleed), then BEFORE TAXI.
const START_ORDER = [2, 3, 1, 0];
function startChecklist() {
  const E = S.eng, allRun = E.every(e => e.run && e.N > 0.94);
  if (!allRun) return { title: 'STARTING ENGINES', items: [['BATTERY', S.battery, 'ON'], ['GTC', S.gtc.N > 0.95, 'ON SPEED'], ['BLEED AIR VALVE', S.bleedValve, 'OPEN'],
    ['POWER LEVERS', E.every(e => e.lever <= 19), 'GROUND IDLE'], ['BRAKES', brakes > 0, 'SET'], ...START_ORDER.map(k => [`ENGINE ${k + 1}`, E[k].run && E[k].N > 0.94, `${Math.round(E[k].N * 100)} %  ${Math.round(E[k].peakTit || E[k].tit)} C`])] };
  return { title: 'BEFORE TAXI', items: [['GTC', !S.gtc.cmd, 'OFF'], ['GTC BLEED AIR VALVE', !S.bleedValve, 'CLOSED'], ['FLAPS', S.flapSel === 0.5, '50 %'], ['FLIGHT CONTROLS', true, 'FREE'], ['NOSE STEERING', true, 'CHECKED'], ['BRAKES', brakes === 0, 'OFF']] };
}
function crewStep(dt) {   // the engineer working through it: one action at a time, waiting for each engine to come on speed
  if (!crewStart) return; crewStep.t = (crewStep.t || 0) + dt; if (crewStep.t < 1.2) return; crewStep.t = 0;
  if (!S.battery) { S.battery = true; return; }
  if (!S.gtc.cmd) { S.gtc.cmd = true; return; }
  if (S.gtc.N < 0.95 && !S.eng.some(e => e.run)) return;
  for (const k of START_ORDER) { const e = S.eng[k]; if (e.run && e.N > 0.94) continue; if (e.start > 0) return; if (e.cond !== 'run') { S.setCond(k, 'run'); return; } S.startEngine(k); return; }
  if (S.gtc.cmd) { S.gtc.cmd = false; S.bleedValve = false; return; }
  if (S.flapSel !== 0.5) { S.flapSel = 0.5; return; }
  crewStart = false;
}
function reset(mode = START) {
  if (mode === 'cold') { S.resetGround(0, 0, 40, 0, { running: false }); S.fuel = 10000; S.payload = 2000; ctl.lever.fill(18); brakes = 1; crewStart = false; }
  else if (mode === 'runway') { S.resetGround(0, 0, 40, 0); S.fuel = 10000; S.payload = 2000; S.flapSel = S.flap = 0.5; ctl.lever.fill(18); brakes = 1; }
  else {
    const drop = mode === 'drop', rho = 4.9 * Math.exp(-(drop ? 220 : 400) / 6000), kias = drop ? 180 : 200;
    S.reset(new THREE.Vector3(0, drop ? 220 : 400, drop ? DZ.z + 2000 : 0), 0, kias / KT * Math.sqrt(1.225 / rho), { flap: 0, gear: 0, lever: 62 }); S.fuel = 9000; S.payload = 1500; ctl.lever.fill(62);
  }
  ap = Q.get('ap') === '1' || mode === 'drop'; apHold = { track: S.heading, alt: S.pos.y, kias: S.kias || 160 };
}
const ctl = { pitch: 0, roll: 0, yaw: 0, lever: [62, 62, 62, 62], brakeL: 0, brakeR: 0, tiller: 0, trimRate: 0 };
let brakes = 0, ap = false, apHold = null, view = Q.get('view') || 'deck', jumpSwitch = 'off';
reset();

// ---- input
const keys = new Set(); addEventListener('keydown', e => { keys.add(e.code); sfx.init(); onKey(e); }); addEventListener('keyup', e => keys.delete(e.code));
function onKey(e) {
  if (e.code === 'KeyH') { ap = !ap; apHold = { track: S.heading, alt: S.pos.y, kias: S.kias }; S.apState.I = S.apState.Iq = 0; }
  if (e.code === 'KeyG') S.gearCmd = S.gearCmd ? 0 : 1;
  if (e.code === 'KeyZ') S.flapSel = Math.max(0, S.flapSel - 0.5);
  if (e.code === 'KeyX') S.flapSel = Math.min(1, S.flapSel + 0.5);
  if (e.code === 'KeyV') view = { deck: 'chase', chase: 'orbit', orbit: 'deck' }[view];
  if (e.code === 'KeyP') S.rampCmd = S.rampCmd ? 0 : 1;
  if (e.code === 'KeyO') S.doorCmd = S.doorCmd[0] ? [0, 0] : [1, 1];
  if (e.code === 'KeyJ') jumpSwitch = { off: 'red', red: 'green', green: 'off' }[jumpSwitch];
  if (e.code === 'KeyF') S.setCond(0, 'feather');
  if (e.code === 'KeyN') S.setCond(0, S.eng[0].cond === 'airstart' ? 'run' : 'airstart');
  if (e.code === 'KeyB') brakes = brakes ? 0 : 1;
  if (e.code === 'Backspace') reset();
  if (e.code === 'KeyK') { crewStart = !crewStart; }   // the flight engineer runs the start checklist
}
// free look + switch clicks
const head = { yaw: 0, pitch: 0 }, ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), c0 = new THREE.Vector2();
let hover = null;
renderer.domElement.addEventListener('mousedown', e => {
  sfx.init();
  if (view === 'deck' && hover) { click(hover, e.button === 2); e.preventDefault(); return; }
  if (view === 'deck' && !document.pointerLockElement && e.button === 0) renderer.domElement.requestPointerLock?.();
});
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1);
  if (document.pointerLockElement === renderer.domElement) { head.yaw = Math.max(-2.6, Math.min(2.6, head.yaw - e.movementX * 0.0025)); head.pitch = Math.max(-1.2, Math.min(1.0, head.pitch - e.movementY * 0.0025)); }
  else if (orbitDrag) { orbit.yaw -= e.movementX * 0.006; orbit.pitch = Math.max(-1.4, Math.min(1.4, orbit.pitch + e.movementY * 0.006)); }
});
let orbitDrag = false; addEventListener('mousedown', () => { if (view === 'orbit') orbitDrag = true; }); addEventListener('mouseup', () => orbitDrag = false);
addEventListener('wheel', e => { if (view === 'orbit') orbit.dist *= Math.exp(e.deltaY * 0.001); });
const orbit = { yaw: 2.4, pitch: 0.2, dist: 55 };
export function click(id, alt = false) {
  const k = +id.slice(-1);
  if (id.startsWith('cond')) { const e = S.eng[k]; S.setCond(k, alt ? 'stop' : e.cond === 'run' ? 'feather' : e.cond === 'feather' ? 'airstart' : 'run'); }
  else if (id.startsWith('fire')) { S.eng[k].firePulled = true; S.setCond(k, 'feather'); }
  else if (id.startsWith('start')) S.startEngine(k);
  else if (id === 'gear') S.gearCmd = S.gearCmd ? 0 : 1;
  else if (id === 'flap') S.flapSel = S.flapSel >= 1 ? 0 : S.flapSel + 0.5;
  else if (id === 'ap' || id === 'apAlt') { ap = !ap; apHold = { track: S.heading, alt: S.pos.y, kias: S.kias }; }
  else if (id === 'af') S.autoFeatherArm = !S.autoFeatherArm;
  else if (id === 'bat') S.battery = !S.battery;
  else if (id === 'gtc') S.gtc.cmd = !S.gtc.cmd;
  else if (id === 'bleed') S.bleedValve = !S.bleedValve;
  else if (id === 'jump') jumpSwitch = { off: 'red', red: 'green', green: 'off' }[jumpSwitch];
  else if (id === 'doorL') S.doorCmd[0] = S.doorCmd[0] ? 0 : 1;
  else if (id === 'doorR') S.doorCmd[1] = S.doorCmd[1] ? 0 : 1;
  else if (id === 'ramp') S.rampCmd = S.rampCmd ? 0 : 1;
  else if (id === 'mc') mcReset = true;
}
let mcReset = false;

// ---- loop
function size() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', size); size();
const tel = document.getElementById('tel'), hoverEl = document.getElementById('hover'), xh = document.getElementById('xh');
if (Q.get('ui') === '0') { tel.classList.add('hide'); document.getElementById('help').classList.add('hide'); }
let last = performance.now(), time = 0, telT = 0, paused = false;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
function pad() { const p = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.axes.length >= 2) : null; return p; }
function step(dt) {
  crewStep(dt);
  // controls: keyboard (smoothed), a gamepad / stick, the autopilot
  const k = c => keys.has(c) ? 1 : 0, sm = 1 - Math.exp(-4 * dt);
  const gp = pad();
  let roll = k('KeyD') - k('KeyA'), pitch = k('KeyS') - k('KeyW'), yaw = k('KeyE') - k('KeyQ');
  if (gp) { roll += gp.axes[0]; pitch += gp.axes[1]; if (gp.axes.length > 3) yaw += gp.axes[3] * 0.6; }
  ctl.roll += (roll * 0.8 - ctl.roll) * sm; ctl.pitch += (pitch * 0.6 - ctl.pitch) * sm; ctl.yaw += (yaw - ctl.yaw) * sm;
  const dl = (k('ShiftLeft') + k('ShiftRight') - k('ControlLeft') - k('ControlRight')) * 30 * dt;
  for (let i = 0; i < 4; i++) ctl.lever[i] = Math.max(S.onGround ? (keys.has('KeyR') ? 0 : 18) : 34, Math.min(90, ctl.lever[i] + dl));   // on the ground the levers live in the beta range (ground idle 18 deg)
  if (keys.has('KeyR') && S.onGround) for (let i = 0; i < 4; i++) ctl.lever[i] = Math.max(0, ctl.lever[i] - 40 * dt);
  ctl.trimRate = k('BracketRight') - k('BracketLeft');
  ctl.tiller += ((k('Period') - k('Comma')) - ctl.tiller) * sm;
  ctl.brakeL = ctl.brakeR = brakes || keys.has('Space') ? 1 : 0;
  let c = ctl;
  if (ap) {
    let cmd = apHold;
    if (START === 'drop') { const dx = DZ.x - S.pos.x, dz = DZ.z - S.pos.z, d = Math.hypot(dx, dz); cmd = { track: Math.atan2(-dx, -dz), alt: 180, kias: d < 2500 ? 130 : 180 }; if (d < 2600 && S.kias < 175) S.flapSel = 0.5; if (d < 1500) S.doorCmd = [1, 1]; jumpSwitch = d < 900 ? (d < 120 ? 'green' : 'red') : 'off'; }
    const a = S.autopilot(dt, cmd); c = { ...a, brakeL: 0, brakeR: 0, lever: a.throttle.map(v => 34 + v * 56) };
    for (let i = 0; i < 4; i++) ctl.lever[i] = c.lever[i];
    ctl.dispPitch = a.pitch; ctl.dispRoll = a.roll;
  }
  S.step(dt, c, env);
  if (S.dead) { tel.textContent = `${S.dead.toUpperCase()}  -  BACKSPACE TO RESET`; }
  return c;
}
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!paused) { time += dt; window.__C.lastCtl = step(dt); }
  const c = window.__C.lastCtl || ctl;
  // model
  model.group.position.copy(S.pos); model.group.quaternion.copy(S.q);
  const inside = view === 'deck';
  model.animate({ eng: S.eng, flap: S.flap, gear: S.gear, ramp: S.ramp, door: S.door, ele: S.surf.ele, ail: S.surf.ail, rud: S.surf.rud, steer: S.steer, wow: S.wow, jumpLight: jumpSwitch }, dt, time, inside);
  deck.group.visible = inside;
  // camera
  model.group.updateMatrixWorld();
  if (view === 'deck') {
    camera.position.copy(DECK_EYE).applyMatrix4(model.group.matrixWorld);
    camera.quaternion.copy(S.q).multiply(_q.setFromEuler(_e.set(DECK_EYE_PITCH + head.pitch, head.yaw, 0, 'YXZ')));
    // buffet shakes the deck
    if (S.buffet > 0.05) { camera.position.y += (Math.random() - 0.5) * 0.03 * S.buffet; camera.rotateZ((Math.random() - 0.5) * 0.01 * S.buffet); }
  } else if (view === 'chase') {
    const f = S.forward(_v); f.y = 0; f.normalize(); const kk = 1 - Math.exp(-3 * dt);
    camPos.lerp(new THREE.Vector3(S.pos.x - f.x * 62, S.pos.y + 16, S.pos.z - f.z * 62), kk); camLook.lerp(new THREE.Vector3(S.pos.x + f.x * 30, S.pos.y, S.pos.z + f.z * 30), kk);
    if (camPos.lengthSq() < 1) camPos.set(S.pos.x, S.pos.y + 16, S.pos.z + 62);
    camera.position.copy(camPos); camera.position.y = Math.max(camera.position.y, 2); camera.lookAt(camLook);
  } else {
    camera.position.set(Math.sin(orbit.yaw) * Math.cos(orbit.pitch), Math.sin(orbit.pitch), Math.cos(orbit.yaw) * Math.cos(orbit.pitch)).multiplyScalar(orbit.dist).add(S.pos); camera.position.y = Math.max(camera.position.y, 1);
    camera.lookAt(S.pos);
  }
  // switch hover (cursor, or the crosshair when the mouse is captured)
  hover = null;
  if (inside) { camera.updateMatrixWorld(); ray.setFromCamera(document.pointerLockElement ? c0 : mouse, camera); const h = ray.intersectObjects(deck.hitBoxes, false)[0]; if (h && h.distance < 2.2) hover = h.object.userData.sw; }
  hoverEl.style.display = hover ? 'block' : 'none'; if (hover) hoverEl.textContent = deck.labelOf(hover, S, { ap, jumpLight: jumpSwitch }) + '  -  CLICK';
  xh.style.display = inside && document.pointerLockElement ? 'block' : 'none';
  const dzv = { brg: Math.atan2(-(DZ.x - S.pos.x), -(DZ.z - S.pos.z)), dist: Math.hypot(DZ.x - S.pos.x, DZ.z - S.pos.z) };
  const caut = { gear: S.gear > 0.01 && S.gear < 0.99, flapOs: S.kias > C130.V_FLAP(S.flap) && S.flap > 0.05, ramp: S.ramp > 0.02, door: S.door[0] > 0.02 || S.door[1] > 0.02,
    otq: S.eng.some(e => e.torque > 19600), tit: S.eng.some(e => e.tit > 1083), nts: S.eng.some(e => e.nts), eng: S.eng.some(e => !e.run), fuel: S.fuel < 1800, stall: S.buffet > 0.3, af: S.autoFeatherArm,
    doorOs: (S.ramp > 0.02 && S.kias > C130.V_RAMP) || ((S.door[0] > 0.02 || S.door[1] > 0.02) && S.kias > C130.V_DOORS) };
  deck.update(S, { ap, jumpLight: jumpSwitch, jumpSwitch, dz: dzv, agl: S.pos.y - 2.62, cautions: caut, mcReset, time, checklist: S.onGround ? startChecklist() : null, ctl: ap ? { pitch: c.pitch, roll: c.roll, yaw: c.yaw } : ctl }, dt, hover);
  if (!Object.values(caut).some(Boolean)) mcReset = false;
  // sound
  snd.update({ eng: S.eng, tas: S.tas, inside, dist: camera.position.distanceTo(S.pos), vr: 0, gtc: S.gtc.N, bleed: S.bleed });
  // telemetry
  if ((telT -= dt) <= 0 && !S.dead) {
    telT = 0.1; const deg = r => (r * 180 / Math.PI).toFixed(1), E = S.eng;
    tel.innerHTML = `<b>KC-130R</b>  ${view.toUpperCase()}  ${ap ? '<b>AP</b>' : 'MANUAL'}  ${S.onGround ? 'ON GROUND' : 'AIRBORNE'}
IAS ${S.kias.toFixed(0).padStart(4)} kt   TAS ${(S.tas * KT).toFixed(0)} kt world / ${(S.tas * K_EQ * KT).toFixed(0)} real-eq   M ${S.mach.toFixed(2)}
ALT ${(S.pos.y * 3.28).toFixed(0).padStart(5)} ft  VS ${(S.vel.y * 196.85).toFixed(0).padStart(5)} fpm (real-eq ${(S.vel.y * 393.7).toFixed(0)})
AoA ${deg(S.alpha).padStart(5)}°  beta ${deg(S.beta).padStart(5)}°  nz ${S.nz.toFixed(2)}  pitch ${deg(S.pitch)}°  bank ${deg(S.bank)}°  hdg ${(((-S.heading * 180 / Math.PI) % 360 + 360) % 360).toFixed(0)}
flaps ${(S.flap * 100).toFixed(0)}%  gear ${(S.gear * 100).toFixed(0)}%  ramp ${(S.ramp * 100).toFixed(0)}%  doors ${S.door.map(d => (d * 100).toFixed(0)).join('/')}  trim ${S.trim.toFixed(2)}  buffet ${S.buffet.toFixed(2)}
mass ${S.mass.toFixed(0)} kg  fuel ${(S.fuel * 2.2046).toFixed(0)} lb  Tc ${S.Tc.toFixed(2)}  DZ ${(dzv.dist).toFixed(0)} m
ENG  LEVER  COND      TORQUE   TIT   RPM  BETA   THRUST  FF
${E.map((e, i) => `${i + 1}    ${e.lever.toFixed(0).padStart(3)}°  ${e.cond.padEnd(8)} ${e.torque.toFixed(0).padStart(6)}  ${e.tit.toFixed(0).padStart(4)}  ${(e.N * 100).toFixed(1).padStart(5)}  ${e.beta.toFixed(1).padStart(5)}  ${(e.thrust / 1000).toFixed(1).padStart(5)}kN ${e.ff.toFixed(0).padStart(5)}${e.nts ? ' NTS' : ''}`).join('\n')}`;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
window.__C = { S, model, deck, scene, camera, renderer, THREE, ctl, head, click, reset, get view() { return view; }, set view(v) { view = v; }, get ap() { return ap; }, set ap(v) { ap = v; apHold = { track: S.heading, alt: S.pos.y, kias: S.kias }; },
  get hover() { return hover; }, mouse, set crewStart(v) { crewStart = v; }, get crewStart() { return crewStart; }, set paused(v) { paused = v; }, DZ, get jumpSwitch() { return jumpSwitch; }, setHold(h) { apHold = { ...apHold, ...h }; }, sfx, snd };
requestAnimationFrame(frame);
