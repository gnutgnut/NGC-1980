// Air defence sandbox: view each NGC-1980 AA unit and watch it engage target drones, with the game's own effects
// (fx.js), sounds (audio.js) and the same engagement logic war.js uses (units/defence/brain.js).
// Query: ?unit=vads|vadst|shilka|zu23|ciws|sparrow|talon|lance  &mode=fight|lineup|view  &drones=N  &revet=1 (in its AA emplacement)  &player=1 (one drone counts
// as the player: lock tone, hurtPlayer)  &smoke=1  &hill=0  &ui=0  &cam=yaw,pitch,dist,tx,ty,tz  &auto=1 (turntable)
import * as THREE from 'three';
import { createFx } from '../js/fx.js';
import { Sfx } from '../js/audio.js';
import { createDefence } from '../js/units/defence/brain.js';
import { buildDefence } from '../js/units/defence/models.js';
import { DEF } from '../js/units/defence/tune.js';
import { buildGun } from '../js/ships.js';   // the old generic AA gun, for the 'legacy1' / 'legacy2' balance baseline
import { buildAASite } from '../js/world/structures.js';   // defence polish: the AA emplacement the units sit in (&revet=1)

const Q = new URLSearchParams(location.search);
const TYPES = Object.keys(DEF);
const ui = document.getElementById('ui'), hud = document.getElementById('hud');
let auto = Q.get('auto') === '1', paused = false;
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio)); document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9cbcd6); scene.fog = new THREE.Fog(0x9cbcd6, 250, 700);
scene.add(new THREE.HemisphereLight(0xd6e8ff, 0x4d5a3a, 0.95));
const sun = new THREE.DirectionalLight(0xfff0d8, 1.25); sun.position.set(0.6, 1, 0.35); scene.add(sun);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);

// ---- terrain: flat ground with a ridge to hide behind (line-of-sight tests)
const hillOn = Q.get('hill') !== '0';
const terrainH = (x, z) => 0.02 * Math.sin(x * 0.11) * Math.cos(z * 0.13) + (hillOn ? 26 * Math.exp(-(((x - 70) / 22) ** 2) - (((z + 10) / 60) ** 2)) : 0);
{
  const g = new THREE.PlaneGeometry(900, 900, 150, 150).rotateX(-Math.PI / 2), p = g.attributes.position, col = [];
  const c = new THREE.Color(), a = new THREE.Color(0x6d7a48), b = new THREE.Color(0x857a58);
  for (let i = 0; i < p.count; i++) { const y = terrainH(p.getX(i), p.getZ(i)); p.setY(i, y); c.copy(a).lerp(b, Math.min(1, y / 20 + Math.random() * 0.15)); col.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  // a concrete pad and a deck plate to park on
  const pad = new THREE.Mesh(new THREE.BoxGeometry(16, 0.1, 16), new THREE.MeshLambertMaterial({ color: 0x77786f })); pad.position.y = 0.0; scene.add(pad);
}
const normalAt = () => new THREE.Vector3(0, 1, 0);
const fx = createFx(scene, { groundY: (x, z) => Math.max(terrainH(x, z), 0), isWater: () => false, normalAt });
// defence polish: &revet=1 digs the game's AA emplacement (world/structures.js buildAASite) on the slot at the origin,
// its way in facing a pad 22 m off to -z, and the unit is parked in it the way war.js / brain.js seat() does
const REVET = Q.get('revet') === '1';
const revet = REVET ? buildAASite(terrainH, [[0, 0, Math.atan2(-22, 0)]]) : null; if (revet) scene.add(revet);
const sfx = new Sfx();
addEventListener('pointerdown', () => sfx.init()); addEventListener('keydown', () => sfx.init());

// ---- the player stand-in, drones, projectiles
const S = { time: 0, hits: 0, playerHurt: 0, kills: 0, log: [], why: {} };
const playerObj = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), alive: false, inCave: false, hitR: 2.6 };
const droneGeo = (() => {
  const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: 0xd8642a, flatShading: true }), d = new THREE.MeshLambertMaterial({ color: 0x2a2c30, flatShading: true });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 3.2, 8).rotateX(Math.PI / 2), m));
  const w = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 0.9), m); w.position.z = 0.3; g.add(w);
  const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.6), d); t.position.set(0, 0.4, 1.4); g.add(t);
  const n = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 8).rotateX(-Math.PI / 2), d); n.position.z = -1.9; g.add(n);
  return g;
})();
const drones = [];
function addDrone(i, isPlayer = false) {
  const mesh = droneGeo.clone(); if (isPlayer) mesh.traverse(o => { if (o.isMesh && o.material.color.getHex() === 0xd8642a) o.material = new THREE.MeshLambertMaterial({ color: 0x2a8cdd, flatShading: true }); });
  scene.add(mesh);
  const d = { p: new THREE.Vector3(), v: new THREE.Vector3(), hp: 5, hpMax: 5, r: 3, side: isPlayer ? 1 : 2, mesh, ph: i * 2.1, R: 75 + (i % 3) * 30, alt: 18 + (i % 4) * 9, spd: 26 + (i % 3) * 6, dir: i % 2 ? 1 : -1, isPlayer, dead: false, respawn: 0 };
  drones.push(d); return d;
}
function droneFly(d, dt) {
  if (d.dead) { d.respawn -= dt; if (d.respawn <= 0) { d.dead = d.dying = false; d.hp = d.hpMax; d.mesh.visible = true; } return; }
  if (d.dying) { d.v.y -= 15 * dt; d.p.addScaledVector(d.v, dt); d.mesh.rotation.z += dt * 4; fx.trail(d.p.x, d.p.y, d.p.z, 1.2); if (d.p.y < terrainH(d.p.x, d.p.z) + 0.5) { fx.explode(d.p.x, d.p.y, d.p.z, 1.6, { fire: 20, debris: 6 }); d.dead = true; d.respawn = 4; d.mesh.visible = false; } d.mesh.position.copy(d.p); return; }
  d.ph += dt * d.spd / d.R * d.dir;
  const x = Math.cos(d.ph) * d.R, z = Math.sin(d.ph) * d.R * 0.8 - 20, y = Math.max(d.alt + Math.sin(d.ph * 2) * 6, terrainH(x, z) + 6);
  d.v.set(x - d.p.x, y - d.p.y, z - d.p.z).divideScalar(Math.max(dt, 1e-3)); if (d.v.length() > 120) d.v.set(0, 0, 0);
  d.p.set(x, y, z); d.mesh.position.copy(d.p);
  if (d.v.lengthSq() > 1) d.mesh.lookAt(new THREE.Vector3().copy(d.p).sub(d.v));
}
const proj = [];
function shoot(kind, side, x, y, z, vx, vy, vz, life) { proj.push({ kind, side, p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz), life }); }
function damage(t, dmg) {
  if (!t || t.dying || t.dead) return; t.hp -= dmg; S.hits++;
  if (t.hp <= 0) { t.dying = true; t.v.y = 3; S.kills++; fx.explode(t.p.x, t.p.y, t.p.z, 0.9, { debris: 3 }); sfx.ctx && sfx.boom(0.4); }
}
function updateProj(dt) {
  for (let i = proj.length - 1; i >= 0; i--) {
    const b = proj[i]; b.life -= dt;
    if (b.kind !== 'flak') b.v.y -= 2.2 * dt;
    b.p.addScaledVector(b.v, dt);
    const { x, y, z } = b.p; let done = b.life <= 0;
    if (b.kind === 'ciws') fx.add.spawn(x, y, z, 0, 0, 0, 0.05, b.side === 1 ? 0.9 : 1.1, 0.6, b.side === 1 ? .5 : 1, b.side === 1 ? 1 : .55, b.side === 1 ? 1 : .2, 1);
    else fx.add.spawn(x, y, z, 0, 0, 0, 0.04, 0.5, 0.3, 1, .9, .5, 1);
    if (b.kind === 'flak' && done) {
      fx.flak(x, y, z); sfx.ctx && sfx.flak();
      for (const d of drones) if (!d.dead && !d.dying && d.side !== b.side && d.p.distanceTo(b.p) < (d.isPlayer ? 7 : 8)) { if (d.isPlayer) hurtPlayer(0.13, 'FLAK'); else damage(d, 1.2); }   // as war.js
    } else if (!done) {
      if (y < terrainH(x, z)) { done = true; fx.impact(x, Math.max(y, terrainH(x, z)), z, 'ground'); }
      else for (const d of drones) if (!d.dead && !d.dying && d.side !== b.side && d.p.distanceToSquared(b.p) < (d.isPlayer ? 2.6 : d.r) ** 2) { done = true; fx.impact(x, y, z, 'metal'); if (d.isPlayer) hurtPlayer(0.2, 'HIT'); else damage(d, 0.5); break; }
    }
    if (done) { proj[i] = proj[proj.length - 1]; proj.pop(); }
  }
}
function hurtPlayer(a, why) { S.playerHurt += a; S.why[why] = +((S.why[why] || 0) + a).toFixed(3); S.log.unshift(`${S.time.toFixed(1)}s  PLAYER ${why}  +${a.toFixed(2)}`); S.log.length = Math.min(S.log.length, 8); }
const ear = new THREE.Vector3();
const hear = (x, y, z, range = 650) => Math.max(0, 1 - Math.hypot(x - ear.x, y - ear.y, z - ear.z) / range);
const feed = (t) => { S.log.unshift(`${S.time.toFixed(1)}s  ${t}`); S.log.length = Math.min(S.log.length, 8); };
const def = createDefence({
  scene, fx, sfx, terrainH, time: () => S.time, hear, feed, shoot, damage: (t, d) => damage(t, d), hitTest: () => null,
  player: () => playerObj, hurtPlayer,
});

// ---- the unit(s) under test
const mode = Q.get('mode') || 'fight';
let unitType = TYPES.includes(Q.get('unit')) ? Q.get('unit') : 'vads';
let unit = null; const lineup = [];
function setUnit(type) {
  unitType = type;
  if (unit) { scene.remove(unit.mesh); def.units.delete(unit); if (unit.def && unit.def.beam) { const B = unit.def.beam; scene.remove(B.g, B.spot, B.line); } }
  const legacy = type.startsWith('legacy'), side = legacy ? +type[6] : DEF[type].side, mesh = legacy ? buildGun(side, 1) : buildDefence(type, side);
  scene.add(mesh);
  unit = { kind: 'aa', side, mesh, x: 0, y: 0, z: 0, hp: 7, dead: false, legacy, cd: 1 };   // legacy1ship = the old carrier mount: the same gun, range 150
  if (REVET && !legacy) { unit.I = { pad: { x: 0, z: -22 } }; def.attach(unit, { terrain: true }); revet.userData.setSide(side); }   // parked in the revetment, nose to the pad (-z)
  else { if (!legacy) def.attach(unit, { terrain: false }); mesh.rotation.y = 0.5; }
  for (const d of drones) d.side = d.isPlayer ? (side === 2 ? 1 : 2) : (side === 1 ? 2 : 1);
  if (side === 1) for (const d of drones) d.isPlayer = false;
  playerObj.alive = drones.some(d => d.isPlayer);
  buildUI();
}
if (mode === 'lineup') {
  const LT = ['vadst', 'vads', 'zu23', 'shilka', 'ciws', 'sparrow', 'talon', 'lance'];   // the island / carrier units (the ship mounts are the same models)
  LT.forEach((t, i) => { const m = buildDefence(t, DEF[t].side); m.position.set((i - (LT.length - 1) / 2) * 10, 0, 0); m.userData.pitch.rotation.x = 0.35; m.userData.yaw.rotation.y = -0.5; if (m.userData.loYaw) { m.userData.loPitch.rotation.x = 0.35; m.userData.loYaw.rotation.y = -0.5; } scene.add(m); lineup.push(m); });
} else {
  setUnit(unitType);
  const n = +(Q.get('drones') ?? (mode === 'view' ? 0 : 3));
  for (let i = 0; i < n; i++) addDrone(i, Q.get('player') === '1' && i === 0 && DEF[unitType].side === 2);
  setUnit(unitType);
}
if (Q.get('smoke') === '1') smokeScreen();
function smokeScreen(x = 22, z = -18) {   // a wall of thick smoke between the unit and the drones' near side
  for (let i = 0; i < 260; i++) fx.mix.spawn(x + Math.random() * 10 - 5, Math.random() * 30 + 2, z + Math.random() * 60 - 30, Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5, 25 + Math.random() * 10, 8, 14, .16, .16, .16, 0.85, 0, 0.2, 0.1);
}

// the old war.js gunFire, verbatim rules (no line of sight, no lock, instant aim), as the balance baseline
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
function legacyFire(g, dt, foes) {
  const gx = 0, gy = 2.4, gz = 0, side = g.side, range = 150, rnd = (a = 1) => Math.random() * a;
  const ud = g.mesh.userData; if (g.aimYaw !== undefined) { ud.yaw.rotation.y += angDiff(ud.yaw.rotation.y, g.aimYaw - g.mesh.rotation.y) * Math.min(1, 5 * dt); ud.pitch.rotation.x += (g.aimPitch - ud.pitch.rotation.x) * Math.min(1, 5 * dt); }
  g.cd -= dt; if (g.cd > 0) return;
  let best = null, bd = range;
  for (const f of foes) { const d = Math.hypot(f.p.x - gx, f.p.y - gy, f.p.z - gz); if (d < bd && f.p.y > gy - 4) { bd = d; best = f; } }
  if (!best) { g.cd = 0.5; return; }
  const t = bd / 90, ax = best.p.x + best.v.x * t - gx, ay = best.p.y + best.v.y * t - gy, az = best.p.z + best.v.z * t - gz, al = Math.hypot(ax, ay, az) || 1;
  g.aimYaw = Math.atan2(-ax, -az); g.aimPitch = Math.asin(Math.max(-1, Math.min(1, ay / al)));
  if (bd < 45) { g.cd = side === 1 ? 0.12 : 0.2; const sp = 140, e = side === 1 ? 0.02 : 0.05, r = () => (Math.random() * 2 - 1) * e; shoot('ciws', side, gx, gy, gz, (ax / al + r()) * sp, (ay / al + r()) * sp, (az / al + r()) * sp, 0.6); }
  else {
    g.cd = side === 1 ? 0.7 : 1.1 + rnd(0.6) - Math.min(0.5, S.time / 900);
    const err = (best.player ? 7 : 5) * (bd / 100), e = () => (Math.random() * 2 - 1) * err;
    const bx = gx + ax + e(), by = gy + ay + e(), bz = gz + az + e(), d2 = Math.hypot(bx - gx, by - gy, bz - gz);
    shoot('flak', side, gx, gy, gz, (bx - gx) / d2 * 90, (by - gy) / d2 * 90, (bz - gz) / d2 * 90, d2 / 90);
  }
}
// balance: one unit against a circling player drone (enemy units) or three hp-3 gunship stand-ins (our units)
function balance(type, secs = 120, o = {}) {
  for (const d of drones) scene.remove(d.mesh); drones.length = 0; proj.length = 0;
  for (const m of def.missiles) scene.remove(m.mesh); def.missiles.length = 0;
  S.playerHurt = 0; S.hits = 0; S.kills = 0; S.log.length = 0; S.why = {}; if (o.t0 !== undefined) S.time = o.t0;
  const legacy = type.startsWith('legacy'), side = legacy ? +type[6] : DEF[type].side;
  if (side === 2) { const d = addDrone(0, true); Object.assign(d, { R: o.R ?? 100, alt: o.alt ?? 30, spd: o.spd ?? 30, hp: 1e9, hpMax: 1e9 }); }
  else for (let i = 0; i < (o.n ?? 3); i++) { const d = addDrone(i); Object.assign(d, { hp: o.hp ?? 3, hpMax: o.hp ?? 3 }, o.R ? { R: o.R } : {}, o.alt ? { alt: o.alt } : {}, o.spd ? { spd: o.spd } : {}); }
  setUnit(type);
  step0(secs);
  return { type, why: S.why, hurtPerMin: +(S.playerHurt / secs * 60).toFixed(3), hits: S.hits, kills: S.kills, killsPerMin: +(S.kills / secs * 60).toFixed(2) };
}
const step0 = (sec, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) step(dt); };

// ---- camera
const cam = { yaw: 0.8, pitch: 0.28, dist: 18, t: new THREE.Vector3(0, 2, 0) };
if (mode === 'lineup') Object.assign(cam, { yaw: 0.35, pitch: 0.22, dist: 52 }), cam.t.set(0, 1.5, 0);
else if (mode === 'fight') Object.assign(cam, { yaw: 0.6, pitch: 0.22, dist: 60 }), cam.t.set(15, 8, -15);
if (Q.get('cam')) { const [y, p, d, x, yy, z] = Q.get('cam').split(',').map(Number); Object.assign(cam, { yaw: y, pitch: p, dist: d }); cam.t.set(x || 0, yy || 0, z || 0); }
let drag = null;
renderer.domElement.addEventListener('pointerdown', e => drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey });
addEventListener('pointerup', () => drag = null);
addEventListener('pointermove', e => {
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (drag.pan) { const r = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0), u = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1); cam.t.addScaledVector(r, -dx * cam.dist * 0.0015).addScaledVector(u, dy * cam.dist * 0.0015); }
  else { cam.yaw -= dx * 0.006; cam.pitch = Math.max(-0.2, Math.min(1.5, cam.pitch + dy * 0.006)); }
});
addEventListener('wheel', e => cam.dist *= Math.exp(e.deltaY * 0.001));

// ---- UI
if (Q.get('ui') === '0') { ui.classList.add('hide'); hud.classList.add('hide'); }
if (Q.get('panel') === '0') ui.classList.add('hide');
function buildUI() {
  ui.innerHTML = '';
  const h = t => { const e = document.createElement('h3'); e.textContent = t; ui.appendChild(e); };
  const btn = (t, f, on) => { const b = document.createElement('button'); b.textContent = t; b.onclick = f; if (on) b.classList.add('on'); ui.appendChild(b); return b; };
  h('UNIT'); for (const t of TYPES) btn(DEF[t].name.split(' (')[0], () => setUnit(t), t === unitType);
  h('TARGETS'); btn('+ drone', () => addDrone(drones.length)); btn('+ player drone', () => { addDrone(drones.length, true); setUnit(unitType); });
  btn('clear', () => { for (const d of drones) scene.remove(d.mesh); drones.length = 0; playerObj.alive = false; });
  h('WORLD'); btn('smoke screen', () => smokeScreen()); btn(paused ? 'resume' : 'pause', () => { paused = !paused; buildUI(); }); btn('turntable', () => auto = !auto);
  h('NOTES');
  const p = document.createElement('div'); p.style.whiteSpace = 'pre-wrap'; p.textContent = 'drag: orbit, shift-drag: pan, wheel: zoom.\nThe ridge to the east blocks line of sight; drones behind it are safe.\nClick once for sound.'; ui.appendChild(p);
}
function hudText() {
  if (!unit) return 'lineup: ' + TYPES.map(t => DEF[t].name).join('  |  ');
  if (unit.legacy) return `LEGACY war.js GUN (side ${unit.side})   t ${S.time.toFixed(1)} s\nhits ${S.hits}  kills ${S.kills}  player hurt ${S.playerHurt.toFixed(2)}`;
  const D = unit.def, B = D.beam;
  return [`${DEF[unitType].name}   t ${S.time.toFixed(1)} s`,
    `mode ${D.mode}  target ${D.tgt ? (D.tgt.player ? 'PLAYER' : 'drone') : '-'}  d ${D.tgt ? D.d.toFixed(0) : '-'} m  los ${D.los ? 'yes' : 'NO'}`,
    `lock ${D.lockT.toFixed(2)} / ${D.T.lock}${D.T.msl ? ' (+' + D.T.msl.lockExtra + ' msl)' : ''}  aim err ${(D.err ?? 0).toFixed(3)}  spin ${D.spin.toFixed(2)}`,
    B ? `beam ${B.st}  dwell ${B.dwell.toFixed(2)}  len ${B.len.toFixed(0)}  blocked ${B.blocked || '-'}  smoke ${(B.smoke || 0).toFixed(2)}` : `missiles in flight ${def.missiles.length}`,
    `hits ${S.hits}  kills ${S.kills}  player hurt ${S.playerHurt.toFixed(2)}`, ...S.log].join('\n');
}

function size() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', size); size();
let last = performance.now();
function step(dt) {
  S.time += dt;
  for (const d of drones) droneFly(d, dt);
  const pd = drones.find(d => d.isPlayer && !d.dead && !d.dying);
  playerObj.alive = !!pd; if (pd) { playerObj.pos.copy(pd.p); playerObj.vel.copy(pd.v); }
  if (unit && !unit.dead) {
    const foes = [];
    for (const d of drones) if (!d.dead && !d.dying && d.side !== unit.side) foes.push(d.isPlayer ? { p: playerObj.pos, v: playerObj.vel, player: true } : d);
    if (unit.legacy) legacyFire(unit, dt, foes); else def.update(unit, dt, foes);
  }
  def.tick(dt);
  updateProj(dt);
  fx.update(dt);
}
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;   // the first rAF stamp can be older than 'last'
  if (!paused) step(dt);
  if (auto) cam.yaw += dt * 0.3;
  camera.position.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(cam.dist).add(cam.t);
  camera.lookAt(cam.t); ear.copy(camera.position); fx.ear.copy(camera.position);
  fx.setView(camera, renderer.domElement.height, { near: 250, far: 700, color: scene.fog.color });
  hud.textContent = hudText();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// test hook: advance the simulation deterministically from a scene script (headless frames are slow)
window.__D = { THREE, sfx, scene, camera, renderer, cam, def, DEF, TYPES, drones, S, fx, lineup, playerObj, terrainH,
  get unit() { return unit; }, setUnit, addDrone, smokeScreen, balance,
  build: (t, s) => buildDefence(t, s),
  // knock the unit about: hurt(n) takes n hp (damaged below half), kill() leaves the burning wreck (as war.js killStruct)
  hurt(n) { unit.hp -= n; return unit.hp; },
  kill() { unit.dead = true; unit.hp = 0; const p = unit.mesh.position; fx.explode(p.x, p.y + 2, p.z, 1.4, { fire: 25, debris: 7, color: 0x5a5650, crater: 2.4 }); unit.mesh.userData.setState?.('destroyed'); return true; },
  // frame the unit from behind and to one side, looking out toward its target (or a point p)
  frame(p, side = 0.55, k = 0.3) { const u = unit.mesh.position, t = p || (unit.def.tgt ? unit.def.tgt.p : new THREE.Vector3(60, 25, -40)), dx = t.x - u.x, dz = t.z - u.z, l = Math.hypot(dx, dz) || 1;
    cam.t.set(u.x + dx * k, u.y + 2.5 + (t.y - u.y) * k * 0.5, u.z + dz * k); cam.yaw = Math.atan2(-dx, -dz) + side; cam.pitch = 0.06; cam.dist = 12 + l * k * 1.25; return true; },
  run(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) step(dt); return true; },
  pause(v = true) { paused = v; return paused; } };
