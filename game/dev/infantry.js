// NGC-1980 infantry sandbox: a firing range for the rifleman (game/js/units/infantry). Walk, change stance, shoot
// pop-up targets at 25-400 m and see the drop in the spotting scope, run reload / malfunction drills, test stamina on the
// hill, wade the pond. ?view=model shows the weapons and the Marine postures instead.
// Query: ?debug (window.__I bridge), ?weapon=1..4 (slot), ?stance=crouch|prone, ?at=<m> (aim at that target), ?wind=<m/s>,
//        ?ui=0 (no HUD), ?fixed (no real-time sim; drive it with __I.advance), ?nosway, ?third, ?res=<pixel ratio>
import * as THREE from 'three';
import { buildWeaponModel, buildItemModel } from '../js/units/infantry/weaponmodels.js';
import { buildMarine, poseSkeleton, makePose, HITBOXES, raycastHitboxes } from '../js/units/infantry/soldiermodel.js';
import { createRifleman } from '../js/units/infantry/rifleman.js';
import { createViewmodel } from '../js/units/infantry/viewmodel.js';
import { InfantryAudio } from '../js/units/infantry/infantryaudio.js';
import { atmosphere } from '../js/units/infantry/ballistics.js';
import { buildRange, groundY, surface, waterDepth } from './infantry-range.js';
import { climbHands, swimHands, selfAidHands } from '../js/units/infantry/carepose.js';   // ngc/marine-polish

const Q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, +(Q.get('res') || 1.25))); document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const SKY = 0xa9c0cf; scene.background = new THREE.Color(SKY); scene.fog = new THREE.Fog(SKY, 250, 1100);
scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x50503a, 1.0));
const sun = new THREE.DirectionalLight(0xfff2dc, 1.3); sun.position.set(0.4, 1, 0.6); scene.add(sun);
const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 1500);
const $ = id => document.getElementById(id);
const hudOn = Q.get('ui') !== '0';
if (!hudOn) for (const id of ['hud', 'log', 'bars']) $(id).classList.add('hide');
function size() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', size); size();

if (Q.get('view') === 'model') modelView(); else rangeView();

// ================================================================================================ model view
function modelView() {
  scene.fog = null; camera.fov = 30; camera.near = 0.01; camera.updateProjectionMatrix();
  for (const id of ['hud', 'log', 'bars']) $(id).classList.add('hide');
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5d6b3a })); scene.add(ground);
  const models = [];
  ['M16A1', 'M16A1/M203', 'M60', 'M72A2', 'M1911A1'].forEach((k, i) => { const m = buildWeaponModel(k); m.group.position.set(-3, 1.8 - i * 0.3, 0); m.group.rotation.y = Math.PI / 2; scene.add(m.group); models.push(m); });
  const POSES = [
    ['stand', makePose({})], ['aim', makePose({ ads: 1 })], ['walk', makePose({ speed: 1.5, gait: 'walk', gaitPhase: 1.2, moveF: 1.5 })], ['sprint', makePose({ speed: 5.6, gait: 'sprint', gaitPhase: 0.6, moveF: 5.6, lower: 1 })],
    ['kneel', makePose({ stance: 'crouch', stanceFrom: 'crouch', stanceTo: 'crouch', ads: 1 })], ['prone', makePose({ stance: 'prone', stanceFrom: 'prone', stanceTo: 'prone', ads: 1, cls: 'mg' })],
    ['lean', makePose({ ads: 1, lean: 1 })], ['down', makePose({ down: true })],
    // ngc/marine-polish: seated (rifle between the knees), on a ladder, swimming, self aid on a leg wound
    ['seated', makePose({ seat: true })], ['climb', makePose({ climb: 0.2, hands: climbHands(0.2), sling: 1 })],
    ['swim', makePose({ swim: { ph: 0.45, speed: 0.8 }, hands: swimHands(0.45, 1), sling: 1 })],
    ['selfaid', makePose({ stance: 'crouch', stanceFrom: 'crouch', stanceTo: 'crouch', hands: selfAidHands('legL', 0.3), sling: 1 })],
  ];
  // (poses with hands off the rifle blend in over ~0.25 s: posed a few times)
  const marines = POSES.map(([n, p], i) => { const m = buildMarine({ seed: i, weapon: n === 'down' ? null : i === 5 ? 'M60' : i === 4 ? 'M16A1/M203' : 'M16A1', pack: i === 2 || i === 9 || i === 11 }); m.root.position.set(i * 2.4, 0, 0); scene.add(m.root); for (let k = 0; k < (p.hands ? 4 : 1); k++) poseSkeleton(m, p, p.hands ? 0.3 : 0); return m; });
  const hbMat = new THREE.MeshBasicMaterial({ color: 0xff2020, wireframe: true });
  if (Q.has('hitboxes')) for (const m of marines) addHitboxDebug(m, hbMat);
  const cam = { yaw: 0.6, pitch: 0.15, dist: 6, t: new THREE.Vector3(3, 0.9, 0) };
  function render() { camera.position.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(cam.dist).add(cam.t); camera.lookAt(cam.t); renderer.render(scene, camera); }
  (function loop() { render(); requestAnimationFrame(loop); })();
  window.__I = { THREE, scene, camera, cam, models, marines, render, POSES, poseSkeleton };
}
function addHitboxDebug(m, mat) {
  for (const h of HITBOXES) { const b = m.bones[h.bone]; let g; if (h.type === 'sphere') { g = new THREE.SphereGeometry(h.r, 8, 6); g.translate(...h.c); } else if (h.type === 'box') { g = new THREE.BoxGeometry(h.h[0] * 2, h.h[1] * 2, h.h[2] * 2); g.translate(...h.c); } else { const L = Math.hypot(h.b[0] - h.a[0], h.b[1] - h.a[1], h.b[2] - h.a[2]); g = new THREE.CapsuleGeometry(h.r, L, 2, 6); g.translate(0, (h.a[1] + h.b[1]) / 2, 0); } b.add(new THREE.Mesh(g, mat)); }
}

// ================================================================================================ the range
function rangeView() {
  const range = buildRange(scene);
  const R = createRifleman({ loadout: 'range', x: 0, y: 0, z: 1.2, yaw: 0, seed: +(Q.get('seed') || 1980), id: 'player', swayScale: Q.has('nosway') ? 0 : 1 });
  const S = R.soldier;
  if (Q.get('weapon')) R.slot = Math.min(R.slots.length - 1, +Q.get('weapon') - 1);
  if (Q.get('stance')) S.place(S.pos.x, 0, S.pos.z, 0, Q.get('stance'));
  const vm = createViewmodel();
  vm.lawLines = R.slots.find(w => w.key === 'M72A2')?.lawLines();
  const audio = new InfantryAudio();
  const wind = +(Q.get('wind') || 0);
  // a hitbox mannequin: a Marine figure on a stand at 25 m, lane x = -10 (shoot it to see which part you hit)
  const dummy = buildMarine({ seed: 3, weapon: null }); dummy.root.position.set(-10, groundY(-10, -25), -25); scene.add(dummy.root);
  poseSkeleton(dummy, makePose({}), 0);
  // the player's own body (third-person view)
  const me = buildMarine({ seed: 1, weapon: 'M16A1/M203' }); scene.add(me.root); me.root.visible = false;
  // range buddies on the firing line (prone and kneeling, for looks)
  [[6, 'prone', 'M60', 'mg'], [-6, 'crouch', 'M16A1', 'rifle'], [12, 'stand', 'M16A1/M203', 'rifle']].forEach(([x, st, w, cls], i) => { const b = buildMarine({ seed: 5 + i, weapon: w, camo: i === 1 ? 'og107' : 'erdl' }); b.root.position.set(x, 0, 0.6); scene.add(b.root); poseSkeleton(b, makePose({ stance: st, stanceFrom: st, stanceTo: st, ads: 1, cls }), 0); });
  const env = {
    groundY, surface, waterDepth, restAt: range.restAt, move: range.move, g: 9.81,
    atmos: atmosphere({ T: 24, rh: 0.7, wind: [wind, 0, 0] }),
    raycast(x0, y0, z0, x1, y1, z1, P) {
      let h = range.raycast(x0, y0, z0, x1, y1, z1, P);
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz);
      if (L > 0) { const b = raycastHitboxes(dummy, x0, y0, z0, dx / L, dy / L, dz / L, L); if (b && (!h || b.dist / L < h.t)) h = { t: b.dist / L, x: b.x, y: b.y, z: b.z, nx: -dx / L, ny: -dy / L, nz: -dz / L, body: { target: 'mannequin', part: b.part, armour: b.armour } }; }
      return h;
    },
    listener: { x: 0, y: 0, z: 0, id: 'player' }, dirt: 0,
  };
  // ---------------------------------------------------------------- input
  const keys = new Set(), held = { ads: false, fire: false };
  let presses = [], mouseDX = 0, mouseDY = 0, third = Q.has('third'), scopeOn = true, trails = Q.has('trails'), dotOn = false, lastR = -1, rPending = null;
  const toggleAds = Q.has('toggleads'), debugInput = {}, SENS = 0.0022, DEADZONE = (+Q.get('deadzone') || 0) * Math.PI / 180;   // ?deadzone=<deg>: Arma-style aim deadzone
  addEventListener('keydown', e => {
    if (e.repeat) return; keys.add(e.code); audio.init();
    const map = { KeyB: 'mode', KeyY: 'charge', KeyU: 'fa', KeyK: 'checkMag', KeyJ: 'checkChamber', KeyL: 'inspect', KeyH: 'barrel', KeyG: 'gl', PageUp: 'sightUp', BracketRight: 'sightUp', PageDown: 'sightDown', BracketLeft: 'sightDown',
      ArrowUp: 'zeroUp', ArrowDown: 'zeroDown', ArrowLeft: 'zeroLeft', ArrowRight: 'zeroRight', Digit1: 'slot1', Digit2: 'slot2', Digit3: 'slot3', Digit4: 'slot4' };
    if (map[e.code]) presses.push(map[e.code]);
    if (e.code === 'KeyT') presses.push(e.shiftKey ? 'remedial' : 'ia');
    if (e.code === 'KeyR') {   // R = tactical reload (keep the magazine); R R = speed reload (drop it). LAW: extend / arm
      const now = performance.now();
      if (R.cur && R.cur.key === 'M72A2') presses.push('law');
      else if (now - lastR < 300) { if (rPending) { clearTimeout(rPending); rPending = null; } presses.push('reloadSpeed'); }
      else rPending = setTimeout(() => { presses.push('reload'); rPending = null; }, 300);
      lastR = now;
    }
    if (e.code === 'KeyC') presses.push('stance:crouch');
    if (e.code === 'KeyZ') presses.push('stance:prone');
    if (e.code === 'KeyX') presses.push('stance:stand');
    if (e.code === 'KeyN') presses.push('bipod');
    if (e.code === 'Space') presses.push('jump');
    if (e.code === 'ControlLeft') S.walkMode = !S.walkMode;
    if (e.code === 'KeyV') third = !third;
    if (e.code === 'KeyM') scopeOn = !scopeOn;
    if (e.code === 'KeyP') trails = !trails;
    if (e.code === 'KeyO') { dotOn = !dotOn; $('dot').classList.toggle('on', dotOn); }
    if (e.code === 'Backspace') { range.reset(); clearTrails(); }
    if (e.code === 'KeyF') pickUp();
    if (e.code === 'KeyI' || e.code === 'F1') { $('help').classList.toggle('hide'); e.preventDefault(); }
    if (e.code === 'Tab') e.preventDefault();
  });
  addEventListener('keyup', e => keys.delete(e.code));
  renderer.domElement.addEventListener('mousedown', e => { audio.init(); if (document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.(); if (e.button === 0) held.fire = true; if (e.button === 2) held.ads = toggleAds ? !held.ads : true; });
  addEventListener('mouseup', e => { if (e.button === 0) held.fire = false; if (e.button === 2 && !toggleAds) held.ads = false; });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => { if (document.pointerLockElement === renderer.domElement) { mouseDX += e.movementX; mouseDY += e.movementY; } });
  function buildInput() {
    const k = c => keys.has(c);
    const inp = {
      move: [(k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0), (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0)],
      look: [mouseDX * SENS / (1 + 0.3 * S.ads), -mouseDY * SENS / (1 + 0.3 * S.ads)],
      sprint: k('ShiftLeft') && !(S.ads > 0.5), holdBreath: k('ShiftLeft') && S.ads > 0.5, freeLook: k('AltLeft'),
      lean: (k('KeyE') ? 1 : 0) - (k('KeyQ') ? 1 : 0), ads: held.ads, fire: held.fire, actions: [], deadzone: DEADZONE,
    };
    mouseDX = mouseDY = 0;
    for (const p of presses) { if (p.startsWith('stance:')) inp.stance = p.slice(7); else if (p === 'bipod') inp.bipod = true; else if (p === 'jump') inp.jump = true; else inp.actions.push(p); }
    presses = [];
    // the debug bridge's held inputs and one-shot presses
    for (const [kk, v] of Object.entries(debugInput)) { if (kk === 'actions') inp.actions.push(...v); else inp[kk] = v; }
    debugInput.actions = []; for (const once of ['stance', 'bipod', 'jump', 'look']) delete debugInput[once];
    return inp;
  }
  // ---------------------------------------------------------------- fx: puffs, tracers, trails, brass, dropped items, explosions
  const fxGroup = new THREE.Group(); scene.add(fxGroup);
  const puffs = [], items = [], brassW = [], flashes = [];
  const puffGeo = new THREE.IcosahedronGeometry(0.12, 0);
  const PUFF_COL = { soil: 0x8a7350, sandbag: 0x9a8a62, wood: 0xb08a5a, brick: 0xa0583e, concrete: 0xb8b4a8, water: 0xdfe8ee, steel: 0xffd890, armour: 0xffd890, sheet: 0xffd890, flesh: 0x7a2018 };
  function puff(x, y, z, mat, big = 1) {
    for (let i = 0; i < (big > 1 ? 14 : 4); i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: PUFF_COL[mat] ?? 0x8a7350, transparent: true, opacity: 0.85, depthWrite: false }));
      m.position.set(x, y, z); fxGroup.add(m);
      puffs.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 1.2 * big, (0.6 + Math.random() * 1.6) * big, (Math.random() - 0.5) * 1.2 * big), t: 0, life: (0.5 + Math.random() * 0.5) * big, s: (0.4 + Math.random() * 0.6) * big });
    }
  }
  const trailGeo = new THREE.BufferGeometry(), TRAIL_N = 20000, trailPos = new Float32Array(TRAIL_N * 6); let trailCount = 0;
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3)); trailGeo.setDrawRange(0, 0);
  const trailLines = new THREE.LineSegments(trailGeo, new THREE.LineBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.55 })); trailLines.frustumCulled = false; scene.add(trailLines);
  function clearTrails() { trailCount = 0; trailGeo.setDrawRange(0, 0); }
  const tracerGeo = new THREE.BufferGeometry(), tracerPos = new Float32Array(600 * 6); tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  const tracerLines = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({ color: 0xff5530, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending })); tracerLines.frustumCulled = false; scene.add(tracerLines);
  function explosionFx(x, y, z, size) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.9, depthWrite: false })); m.position.set(x, y + 0.3, z); fxGroup.add(m); flashes.push({ m, t: 0, size });
    puff(x, y + 0.2, z, 'soil', 3.5 * size);
  }
  function dropItem(item, from) {
    const m = buildItemModel(item.fit || 'tube'); m.position.copy(from); scene.add(m);
    items.push({ item, m, v: new THREE.Vector3((Math.random() - 0.5) * 0.6, -0.5, -0.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), S.yaw), w: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), rest: false });
    audio.mech('drop');
  }
  function pickUp() {
    let best = null, bd = 1.8;
    for (const it of items) { const d = Math.hypot(it.m.position.x - S.pos.x, it.m.position.z - S.pos.z); if (d < bd && it.item.fit && it.item.kind !== 'tube') { bd = d; best = it; } }
    if (best && R.inv.add(best.item)) { scene.remove(best.m); items.splice(items.indexOf(best), 1); msg(`picked up ${best.item.name} (${best.item.rounds} rds)`); audio.mech('magIn'); }
  }
  function brassWorld(fit) {
    if (brassW.length > 60) { const o = brassW.shift(); scene.remove(o.m); }
    const m = buildItemModel(fit), rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw);
    m.position.set(S.eye.x + rx * 0.12, S.eye.y - 0.08, S.eye.z + rz * 0.12); scene.add(m);
    brassW.push({ m, v: new THREE.Vector3(rx * (2 + Math.random()), 1.5 + Math.random(), rz * (2 + Math.random())), rest: false });
  }
  // ---------------------------------------------------------------- shot bookkeeping (hit log: drop vs the sight line)
  const shots = new Map(), log = [], LOGN = 7; let lastHit = null, lastImpact = null;
  function logLine(s) { log.unshift(s); log.length = Math.min(log.length, LOGN); $('log').textContent = log.join('\n'); }
  let msgT = 0; function msg(s, t = 2.5) { $('msg').textContent = s; msgT = t; }
  const _f = new THREE.Vector3();
  function onImpact(e, kind) {
    const sh = shots.get(e.id); const x = kind === 'hit' ? e.hit.point[0] : e.x, y = kind === 'hit' ? e.hit.point[1] : e.y, z = kind === 'hit' ? e.hit.point[2] : e.z;
    lastImpact = new THREE.Vector3(x, y, z);
    if (!sh) return null;
    const s = _f.set(x - sh.eye.x, y - sh.eye.y, z - sh.eye.z).dot(sh.los);
    const lx = sh.eye.x + sh.los.x * s, ly = sh.eye.y + sh.los.y * s, lz = sh.eye.z + sh.los.z * s;
    const dxr = (x - lx) * Math.cos(sh.yaw) + (z - lz) * -Math.sin(sh.yaw);
    const r = { range: s, dy: y - ly, dx: dxr, t: e.t, weapon: sh.weapon, sight: sh.sight, v: kind === 'hit' ? e.hit.velocity : e.v };
    shots.delete(e.id);
    return r;
  }
  const fmtCm = v => `${Math.abs(v * 100).toFixed(0)} cm ${v < 0 ? 'low' : 'high'}`, fmtCmX = v => `${Math.abs(v * 100).toFixed(0)} cm ${v < 0 ? 'left' : 'right'}`;
  const MALF = { feed: 'failure to feed', stovepipe: 'stovepipe (case caught in the port)', extract: 'failure to extract (stuck case)', double: 'double feed', dud: 'dud round', oob: 'bolt not in battery', runaway: 'runaway gun', misfire: 'misfire' };
  // ---------------------------------------------------------------- simulation step
  const STEP = 1 / 120;
  const mods = {};
  function simStep(dt, inp) {
    env.listener.x = S.eye.x; env.listener.y = S.eye.y; env.listener.z = S.eye.z;
    const evs = R.step(dt, inp, env, mods);
    range.update(dt);
    for (const e of evs) handle(e);
    // tracers / trails
    let nT = 0;
    for (const P of R.projectiles) {
      if (trails && trailCount < TRAIL_N) { trailPos.set([P.px, P.py, P.pz, P.x, P.y, P.z], trailCount * 6); trailCount++; }
      if (P.tracer && P.dist > 15 && P.dist < (P.round.tracer || 900) && nT < 600) { const k = Math.max(0.3, Math.min(1, 12 / Math.max(1, Math.hypot(P.x - P.px, P.y - P.py, P.z - P.pz)))); tracerPos.set([P.x - (P.x - P.px) * k, P.y - (P.y - P.py) * k, P.z - (P.z - P.pz) * k, P.x, P.y, P.z], nT * 6); nT++; }
    }
    tracerGeo.setDrawRange(0, nT * 2); tracerGeo.attributes.position.needsUpdate = true;
    if (trails) { trailGeo.setDrawRange(0, trailCount * 2); trailGeo.attributes.position.needsUpdate = true; }
  }
  function handle(e) {
    const W = R.cur;
    if (e.e === 'shot') {
      const los = new THREE.Vector3(-Math.sin(S.camYaw) * Math.cos(S.camPitch), Math.sin(S.camPitch), -Math.cos(S.camYaw) * Math.cos(S.camPitch));
      shots.set(e.id, { eye: { ...S.eye }, los, yaw: S.camYaw, weapon: e.weapon, sight: W ? W.sightLabel() : '' });
      if (shots.size > 200) shots.delete(shots.keys().next().value);
      audio.shot({ weapon: e.weapon, dist: 0 });
      if (e.weapon !== 'M72A2' && e.weapon !== 'M203') { brassWorld(e.weapon === 'M60' ? 'case762' : e.weapon === 'M1911A1' ? 'case45' : 'case556'); audio.mech('brass'); }
      if (e.cookoff) msg('COOK-OFF! the chamber is too hot', 3);
    } else if (e.e === 'impact') {
      const tgt = e.target;
      if (tgt && typeof tgt === 'object' && tgt.kind) { const loc = range.raycast(e.x, e.y, e.z + 0.05, e.x, e.y, e.z - 0.05); if (loc && loc.target === tgt && loc.local) range.hit(tgt, loc.local); }
      puff(e.x, e.y, e.z, e.material, e.round === 'M433' || e.round === 'M72' ? 1.5 : 1);
      audio.impact(e.material, Math.hypot(e.x - S.eye.x, e.z - S.eye.z), 0, e.result);
      const r = e.owner === 'player' && e.result !== 'ricochet' ? onImpact(e, 'impact') : null;
      if (r) {
        lastHit = { ...r, what: tgt && tgt.kind ? (tgt.kind === 'E' ? `E-type ${tgt.d} m` : `gong ${tgt.d} m`) : tgt || e.material, result: e.result };
        logLine(`${r.weapon} ${String(r.sight).padEnd(6)} ${r.range.toFixed(0).padStart(3)} m  ${fmtCm(r.dy)}, ${fmtCmX(r.dx)}  ${r.t.toFixed(2)} s ${r.v.toFixed(0)} m/s  ${lastHit.what}${e.result === 'pen' ? ' (through)' : ''}`);
      }
    } else if (e.e === 'hit') {
      puff(e.hit.point[0], e.hit.point[1], e.hit.point[2], 'flesh');
      const r = onImpact(e, 'hit');
      logLine(`HIT ${e.target}: ${e.hit.part}  ${e.hit.velocity.toFixed(0)} m/s  dmg ${e.hit.dmg.toFixed(2)}${e.hit.armour.length ? '  [' + e.hit.armour.map(a => a.item + (a.stopped ? ' STOPPED' : '')).join(', ') + ']' : ''}${r ? '  ' + r.range.toFixed(0) + ' m' : ''}`);
      lastHit = { ...(r || {}), what: 'mannequin ' + e.hit.part };
    } else if (e.e === 'explode') {
      const i = e.info, d = Math.hypot(e.x - S.eye.x, e.z - S.eye.z); explosionFx(e.x, e.y, e.z, i.dud ? 0.2 : i.round === 'M72' ? 1 : 0.8);
      audio.explosion(d, 0, i.dud ? 0.2 : 1);
      logLine(i.dud ? `${i.name}: DUD (inside the arming distance)` : `${i.name}: detonated at ${d.toFixed(0)} m`);
    } else if (e.e === 'crack') audio.crack(e.miss);
    else if (e.e === 'drop') dropItem(e.item, new THREE.Vector3(S.eye.x, S.eye.y - 0.4, S.eye.z));
    else if (e.e === 'swap') audio.mech('chargeFwd', 'M1911A1');
    else if (e.e === 'body') {
      const b = e.ev;
      if (b.e === 'footstep') audio.footstep(b.surface, b.gait, b.load, b.stance);
      else if (b.e === 'stance') audio.mech('stance');
      else if (b.e === 'breath' && !b.hold && b.gasp) audio.gasp();
      else if (b.e === 'bipod') audio.mech('bipod');
      else if (b.e === 'blown') msg('blown - you need a breather', 2);
      else if (b.e === 'blocked') msg('no room to stand up', 1.5);
    } else if (e.e === 'wpn') {
      const v = e.ev, w = e.weapon;
      const mech = { magOut: 'magOut', magIn: 'magIn', slap: 'slap', chargeBack: 'chargeBack', chargeFwd: 'chargeFwd', boltRelease: 'boltRelease', fa: 'fa', selector: 'selector', click: 'click', coverOpen: 'coverOpen', coverClose: 'coverClose', beltOn: 'beltOn', barrelLatch: 'barrelLatch', barrelOut: 'barrelOut', barrelIn: 'barrelIn', open: 'open', close: 'close', insert: 'insert', extend: 'extend', arm: 'arm', pin: 'pin', deadTrigger: 'deadTrigger', safeTrigger: 'click' }[v.e];
      if (mech) audio.mech(mech, w);
      if (v.e === 'selector') msg(`${w}: ${v.mode.toUpperCase()}`, 1.2);
      if (v.e === 'sight') msg(`${w} sight: ${v.label}`, 1.5);
      if (v.e === 'info') msg(`chamber: ${v.chamber}${v.malf ? '  STOPPAGE: ' + MALF[v.malf] : ''}  |  magazine: ${v.mag}${v.temp > 120 ? '  |  barrel ' + v.temp + ' C' : ''}`, 4);
      if (v.e === 'noAmmo') msg('no magazines / ammunition left for this weapon', 2);
      if (v.e === 'noBarrel') msg('no spare barrel', 2);
      if (v.e === 'stuck') msg('the case is stuck: the extractor slipped (Shift+T: remedial action)', 3);
      if (v.e === 'cleared') msg('cleared', 1.2);
      if (v.e === 'beltBroken') msg('belt broken: runaway gun stopped', 2);
      if (v.e === 'backblast') { msg('BACKBLAST AREA CLEAR!', 1.5); const bx = Math.sin(S.yaw), bz = Math.cos(S.yaw); for (let i = 1; i <= 4; i++) puff(S.eye.x + bx * i * 1.5, S.eye.y - 0.3 - i * 0.15, S.eye.z + bz * i * 1.5, 'soil', 1.6); }   // the dust cloud behind
      if (v.e === 'malf' && v.kind === 'runaway') msg('RUNAWAY GUN - T: break the belt', 3);
    }
  }
  // ---------------------------------------------------------------- visuals (per rendered frame)
  const scopeCam = new THREE.PerspectiveCamera(2.2, 1.5, 1, 1500);
  let lastFrame = performance.now(), acc = 0;
  function updateVisuals(dt) {
    for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.t += dt; p.v.y -= 2.5 * dt; p.m.position.addScaledVector(p.v, dt); const k = p.t / p.life; p.m.scale.setScalar(p.s * (0.4 + 1.5 * k)); p.m.material.opacity = 0.85 * (1 - k); if (k >= 1) { fxGroup.remove(p.m); p.m.material.dispose(); puffs.splice(i, 1); } }
    for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.t += dt; f.m.scale.setScalar((1 + f.t * 14) * f.size); f.m.material.opacity = Math.max(0, 0.9 - f.t * 6); if (f.t > 0.2) { fxGroup.remove(f.m); flashes.splice(i, 1); } }
    for (const it of [...items, ...brassW]) {
      if (it.rest) continue; it.v.y -= 9.81 * dt; it.m.position.addScaledVector(it.v, dt);
      if (it.w) { it.m.rotation.x += it.w.x * dt; it.m.rotation.y += it.w.y * dt; } else { it.m.rotation.x += 12 * dt; it.m.rotation.z += 9 * dt; }
      const gy = Math.max(groundY(it.m.position.x, it.m.position.z), -10) + 0.02;
      if (it.m.position.y < gy) { it.m.position.y = gy; if (Math.abs(it.v.y) < 1) { it.rest = true; it.m.rotation.x = Math.PI / 2; } else { it.v.y *= -0.3; it.v.x *= 0.5; it.v.z *= 0.5; } }
    }
    // camera: first person (the soldier's eye) or behind the shoulder
    if (third) {
      me.root.visible = true; me.root.position.set(S.pos.x, S.pos.y, S.pos.z); me.root.rotation.y = S.yaw;
      const key = R.carrier.key === 'M16A1' && R.carrier.gl ? 'M16A1/M203' : R.carrier.key; if (me.weaponKey !== key) me.setWeapon(key);
      const p = S.pose(); p.cls = R.cls === 'gl' ? 'rifle' : R.cls; p.action = R.cur.act ? { name: R.cur.act.name, p: R.cur.act.t / R.cur.act.dur } : null;
      poseSkeleton(me, p, dt);
      const back = 2.6, up = 0.5, side = 0.6;
      camera.position.set(S.pos.x + Math.sin(S.camYaw) * back + Math.cos(S.camYaw) * side, S.eye.y + up, S.pos.z + Math.cos(S.camYaw) * back - Math.sin(S.camYaw) * side);
      camera.rotation.set(S.camPitch - 0.12, S.camYaw, 0, 'YXZ');
    } else {
      me.root.visible = false;
      camera.position.set(S.eye.x, S.eye.y, S.eye.z); camera.rotation.set(S.camPitch, S.camYaw, S.camRoll, 'YXZ');
    }
    camera.fov = third ? 62 : vm.fov(62, S.ads); camera.updateProjectionMatrix();
    vm.update(dt, R);
    audio.body({ phase: S.breathPhase, depth: S.breathDepth, rate: S.breathRate, held: S.holdBreath, hr: S.hr });
    if (hudOn) {
      $('bStam').style.width = (S.staminaFrac * 100).toFixed(0) + '%'; $('bStam').style.background = S.staminaFrac < 0.15 ? '#d86a4a' : '#cfd8b0';
      $('bBreath').style.width = (S.holdBreath ? Math.max(0, 1 - S.holdT / S.holdMax) * 100 : 100).toFixed(0) + '%';
      const st = R.status(), W = R.cur;
      $('hud').textContent = `${st.weapon}${st.glMode ? ' (M203)' : ''}  ${st.mode.toUpperCase()}  sight ${st.sight}${W.zeroClicks[0] || W.zeroClicks[1] ? `  zero ${W.zeroClicks[0] > 0 ? '+' : ''}${W.zeroClicks[0]}/${W.zeroClicks[1]}` : ''}${st.busy ? '  [' + st.busy + ']' : ''}\n`
        + `${W.law ? 'LAW: ' + W.law + '  ' : ''}${W.key === 'M60' ? 'barrel ' + (W.barrel ? Math.round(W.barrel.temp) : '--') + ' C  ' : ''}${st.known ? 'last check: mag ' + st.known.mag + ', chamber ' + st.known.chamber : 'magazine: unchecked (K)'}${st.malfKnown ? '  STOPPAGE: ' + MALF[st.malfKnown] : ''}\n`
        + `${S.stance}${S.bipod ? ' (bipod)' : S.rested ? ' (rested)' : ''}${S.walkMode ? ' walk' : ''}  ${S.gait}  ${S.speed.toFixed(1)} m/s  grade ${(S.grade * 100).toFixed(0)}%  ${S.surface}  load ${S.load.toFixed(1)} kg  HR ${Math.round(S.hr)}  ${S.breathRate.toFixed(0)}/min${S.holdBreath ? ' HOLD' : ''}\n`
        + `pouches: ${R.inv.items.filter(i => i.fit === W.def.fit).map(i => i.rounds).join(' ') || '-'}   I: help   wind ${wind} m/s`;
    }
    if (msgT > 0) { msgT -= dt; if (msgT <= 0) $('msg').textContent = ''; }
  }
  function render() {
    renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
    renderer.render(scene, camera);
    if (!third) vm.render(renderer, camera);
    // the spotting scope: on the last impact (or the 100 m line)
    if (scopeOn && hudOn) {
      const w = 320, h = 210, x = innerWidth - w - 10, y = innerHeight - h - 10;
      const tgt = lastImpact || new THREE.Vector3(0, 0.8, -100);
      const d = Math.hypot(tgt.x - S.eye.x, tgt.z - S.eye.z); scopeCam.fov = Math.max(0.5, Math.atan2(3.2, d) * 180 / Math.PI); scopeCam.aspect = w / h;
      scopeCam.position.set(S.eye.x + 0.6, S.eye.y + 0.1, S.eye.z + 0.2); scopeCam.lookAt(tgt); scopeCam.updateProjectionMatrix();
      renderer.setScissorTest(true); renderer.setScissor(x, y, w, h); renderer.setViewport(x, y, w, h); renderer.render(scene, scopeCam); renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
      $('scopeLbl').classList.add('on'); $('scopeLbl').style.top = (h + 14) + 'px'; $('scopeLbl').textContent = `SPOTTING SCOPE  ${d.toFixed(0)} m` + (lastHit && lastHit.range ? `  last: ${fmtCm(lastHit.dy)}, ${fmtCmX(lastHit.dx)}` : '');
    } else $('scopeLbl').classList.remove('on');
  }
  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
    if (!Q.has('fixed')) { acc += dt; let n = 0; while (acc >= STEP && n < 12) { simStep(STEP, buildInput()); acc -= STEP; n++; } if (n >= 12) acc = 0; updateVisuals(dt); }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  $('help').textContent = `NGC-1980 INFANTRY RANGE                                              (I closes)
move      W A S D   sprint Shift   walk toggle Ctrl   jump Space
stance    C crouch / kneel   Z prone   X stand     lean Q / E    free look  hold Alt
aim       right mouse (hold)   fire left mouse   hold breath  Shift while aiming
weapon    1 M16A1/M203  2 M60  3 M72 LAW  4 M1911    G  M203 on / off     B fire mode
reload    R tactical (keeps the magazine)   R R speed (drops it)   LAW: R extends, R arms
drills    T immediate action (SPORTS)  Shift+T remedial  Y charging handle  U forward assist
          K check magazine   J check chamber   L inspect   H M60 barrel change   N bipod
sights    PageUp / PageDown or [ ]: aperture / leaf / quadrant    arrows: zero (1 MOA clicks)
range     F pick up a dropped magazine   Backspace reset targets   M spotting scope   P bullet trails
          V third person   O aiming dot (debug)
targets   E-type pop-ups 25-400 m in three lanes, steel gongs 100/200/300 m (right), a brick wall at 60 m,
          a tank hulk at 150 m (M203 / LAW), a hitbox mannequin at 25 m (left), the hill (east) and a pond (west)`;
  if (Q.has('help')) $('help').classList.remove('hide');
  // ---------------------------------------------------------------- debug bridge
  function aimAt(x, y, z) { const dx = x - S.pos.x, dy = y - (S.pos.y + S.eyeH), dz = z - S.pos.z; const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz)); S.yaw = S.wYaw = S.aimYaw = S.camYaw = yaw; S.pitch = S.wPitch = S.aimPitch = S.camPitch = pitch; S.wYawV = S.wPitchV = 0; S.pendingYaw = 0; S.recPitch = S.recYaw = S.recPitchV = S.recYawV = 0; S.dzYaw = S.dzPitch = 0; }
  function aimTarget(d, lane = 0, h = 0.55) { const T = range.targets.find(t => t.d === d && t.lane === lane); aimAt(T.x, groundY(T.x, T.z) + 0.25 + h, T.z); return [T.x, T.z]; }
  if (Q.get('at')) aimTarget(+Q.get('at'));
  if (Q.has('debug')) {
    window.__I = {
      THREE, scene, camera, R, S, vm, range, audio, env, renderer, shots, log, items, dummy, me,
      get W() { return R.cur; }, get lastHit() { return lastHit; }, get third() { return third; }, set third(v) { third = v; }, get trails() { return trails; }, set trails(v) { trails = v; },
      set scope(v) { scopeOn = v; },
      input(o) { Object.assign(debugInput, o); return true; }, clear() { for (const k of Object.keys(debugInput)) delete debugInput[k]; return true; },
      press(...a) { debugInput.actions = (debugInput.actions || []).concat(a); return true; },
      // run the sim `sec` seconds in fixed steps (synchronous), then draw one frame
      advance(sec, o) { if (o) Object.assign(debugInput, o); const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) { simStep(STEP, buildInput()); if (i % 4 === 3) updateVisuals(STEP * 4); } updateVisuals(STEP); render(); return { pos: [+S.pos.x.toFixed(2), +S.pos.y.toFixed(2), +S.pos.z.toFixed(2)], stance: S.stance, speed: +S.speed.toFixed(2), ads: +S.ads.toFixed(2), rounds: R.cur.rounds, act: R.cur.act && R.cur.act.name, malf: R.cur.malf, bolt: R.cur.bolt }; },
      aimAt, aimTarget,
      teleport(x, z, yaw = 0, stance = 'stand') { S.place(x, groundY(x, z), z, yaw, stance); return true; },
      slot(i) { R.slot = i; R.glMode = false; return R.cur.key; }, render() { updateVisuals(0); render(); return true; },
      clearTrails, msg,
    };
  }
}
