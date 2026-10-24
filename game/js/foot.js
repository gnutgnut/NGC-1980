// FOUNDATION: ON FOOT - the soldier as a craft (craft.js). Get out of a landed Huey, a Hornet stopped on deck or a
// vehicle (Y) and walk: first person with mouse look (click to capture the mouse), WASD / arrows, Shift sprint,
// C crouch, Z prone, Space jump; terrain, pads, ship decks (moving, turning, flying: platform-relative), ladders,
// wading and swimming. Y by a door gets you in; [ / ] change seat once inside.
//
// This is the FRAMEWORK with placeholders. The real soldier is built by other agents and plugged into the slots:
//   foot.setSlot('soldier',   sim)   movement sim with the footsim.js shape (createWalker): INFANTRY agent
//   foot.setSlot('viewmodel', vm)    { group: THREE.Object3D in eye space (-z ahead), update(dt, s) }: INFANTRY
//   foot.setSlot('weapon',    w)     { update(dt, a) -> bool fired, key(code) -> bool, hudLine(), reset() }: INFANTRY
//   foot.setSlot('body',      b)     { group: THREE.Object3D, animate(s, dt) } third-person body: INFANTRY
//   foot.setSlot('medical',   m)     { hit(h) -> { dead }, reset(), speedK(), hudLine(), key(code) }: MEDINV
//   foot.setSlot('inventory', inv)   { key(code) -> bool, toggle(), open, weightKg(), hudLine(), reset() }: MEDINV
// Damage arrives through hurt(amount, why, at, dir) from war.js (at = the round's position, dir = its velocity) and
// is routed to a body part (BODY_PARTS) before it reaches the medical slot. See docs/ngc1980/FOUNDATION.md.
import * as THREE from 'three';
import { createWalker, SOLDIER } from './footsim.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// body parts and hit points (the Tarkov-style split the MEDINV agent builds on; HP INFERRED, gameplay values)
export const BODY_PARTS = [
  { id: 'head', name: 'HEAD', hp: 35, vital: true }, { id: 'thorax', name: 'THORAX', hp: 85, vital: true },
  { id: 'stomach', name: 'STOMACH', hp: 70, vital: true }, { id: 'armL', name: 'LEFT ARM', hp: 60 }, { id: 'armR', name: 'RIGHT ARM', hp: 60 },
  { id: 'legL', name: 'LEFT LEG', hp: 65 }, { id: 'legR', name: 'RIGHT LEG', hp: 65 },
];
// war.js damage units (a helicopter airframe hit is ~0.13-0.2) to soldier hit points
export const HP_PER_WAR_UNIT = 300;
// which body part a round at world point `at` hits, for a soldier with feet at (x, y, z), facing yaw, in a stance
export function hitZone(at, x, y, z, yaw, stance, tall) {
  if (!at) return null;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const dx = at.x - x, dz = at.z - z, lat = dx * rx + dz * rz, fwd = dx * fx + dz * fz;
  if (stance === 'prone') {   // lying along the facing: head forward, legs behind
    return fwd > 0.75 ? 'head' : fwd > 0.25 ? (Math.abs(lat) > 0.22 ? (lat > 0 ? 'armR' : 'armL') : 'thorax') : fwd > -0.1 ? 'stomach' : lat > 0 ? 'legR' : 'legL';
  }
  const hy = (at.y - y) / tall;   // 0 feet .. 1 top of the helmet
  if (hy > 0.84) return 'head';
  if (hy < 0.5) return lat > 0 ? 'legR' : 'legL';
  if (Math.abs(lat) > 0.21) return lat > 0 ? 'armR' : 'armL';
  return hy > 0.66 ? 'thorax' : 'stomach';
}

// ------------------------------------------------------------------------------------------------ placeholder models
const M = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const COL = { shirt: 0x59603f, trouser: 0x515839, web: 0x48472f, boot: 0x2a221a, skin: 0xc09272, helmet: 0x4c5634, band: 0x2c2d22, rifle: 0x1c1d1f, pack: 0x4f5236 };
function bx(w, h, d, m, x, y, z, parent) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent.add(o); return o; }
function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
// an M16A1 at real size (39.6 in / 1.0 m overall), muzzle along -z, grip at the origin
function buildRifle(m) {
  const g = new THREE.Group();
  bx(0.05, 0.07, 0.38, m, 0, 0.04, -0.05, g);                    // receiver
  bx(0.04, 0.035, 0.12, m, 0, 0.1, -0.08, g);                    // carry handle
  bx(0.045, 0.06, 0.27, m, 0, 0.0, 0.28, g);                     // stock
  bx(0.035, 0.1, 0.035, m, 0, -0.05, 0.05, g);                   // pistol grip
  bx(0.03, 0.13, 0.05, m, 0, -0.05, -0.08, g);                   // 20-round magazine
  bx(0.06, 0.06, 0.3, m, 0, 0.04, -0.38, g);                     // handguard
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 5), m); b.rotation.x = Math.PI / 2; b.position.set(0, 0.04, -0.62); g.add(b);   // barrel
  bx(0.012, 0.06, 0.012, m, 0, 0.09, -0.5, g);                   // front sight post
  return g;
}
// third-person Marine, 1980: OG-107 utilities, M1 helmet, M1956 / ALICE webbing, a pack, M16A1 at the ready
export function buildSoldierMesh() {
  const g = new THREE.Group(), m = Object.fromEntries(Object.entries(COL).map(([k, c]) => [k, M(c)]));
  const hips = pivot(g, 0, 0.95, 0);
  const legs = [-1, 1].map(s => {
    const hip = pivot(hips, s * 0.1, 0, 0);
    bx(0.15, 0.47, 0.17, m.trouser, 0, -0.235, 0, hip);
    const knee = pivot(hip, 0, -0.47, 0);
    bx(0.13, 0.4, 0.14, m.trouser, 0, -0.2, 0, knee);
    bx(0.13, 0.1, 0.25, m.boot, 0, -0.43, -0.04, knee);
    return { hip, knee };
  });
  const torso = pivot(hips, 0, 0, 0);
  bx(0.4, 0.56, 0.24, m.shirt, 0, 0.3, 0, torso);
  bx(0.42, 0.08, 0.26, m.web, 0, 0.04, 0, torso);                  // pistol belt
  for (const s of [-1, 1]) { bx(0.1, 0.1, 0.07, m.web, s * 0.12, 0.08, -0.14, torso); bx(0.05, 0.5, 0.03, m.web, s * 0.11, 0.33, -0.125, torso); }   // ammo pouches, suspenders
  bx(0.32, 0.38, 0.17, m.pack, 0, 0.36, 0.2, torso);                // ALICE pack
  bx(0.1, 0.16, 0.09, m.web, 0.16, 0.05, 0.12, torso);              // canteen
  const neck = pivot(torso, 0, 0.6, 0);
  bx(0.19, 0.22, 0.21, m.skin, 0, 0.12, -0.01, neck);
  const hel = new THREE.Mesh(new THREE.SphereGeometry(0.155, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), m.helmet); hel.scale.set(1, 0.9, 1.08); hel.position.set(0, 0.19, 0); neck.add(hel);
  bx(0.32, 0.025, 0.34, m.helmet, 0, 0.19, 0, neck);                 // brim
  bx(0.315, 0.03, 0.335, m.band, 0, 0.23, 0, neck);                 // camouflage band
  const arms = [-1, 1].map(s => {
    const sh = pivot(torso, s * 0.255, 0.53, 0);
    bx(0.11, 0.3, 0.12, m.shirt, 0, -0.15, 0, sh);
    const el = pivot(sh, 0, -0.3, 0);
    bx(0.1, 0.27, 0.11, m.shirt, 0, -0.135, 0, el);
    bx(0.08, 0.08, 0.09, m.skin, 0, -0.3, 0, el);
    return { sh, el };
  });
  const rifle = buildRifle(m.rifle); rifle.position.set(0.05, 0.3, -0.3); rifle.rotation.set(0.15, 0.25, -0.5); torso.add(rifle);
  for (const o of g.children) o.traverse(c => { if (c.isMesh) c.castShadow = false; });
  const B = { group: g, hips, torso, neck, legs, arms, rifle };
  // s: { speed (m/s), stride (m walked), stance, eye, swim, ladder, dead, pitch, onGround }
  B.animate = (s, dt) => {
    const ph = s.stride / 1.5 * Math.PI * 2, k = clamp(s.speed / 2.7, 0, 1.2);
    const swing = Math.sin(ph) * 0.55 * k, lift = Math.max(0, Math.cos(ph)) * 0.6 * k;
    g.rotation.x = 0; hips.position.y = 0.95; torso.rotation.x = 0;
    if (s.dead) { g.rotation.x = -Math.PI / 2; hips.position.y = 0.2; for (const L of legs) L.hip.rotation.x = L.knee.rotation.x = 0; for (const A of arms) { A.sh.rotation.set(-2.6, 0, 0); A.el.rotation.x = 0; } return; }
    if (s.stance === 'prone' && !s.swim) {
      g.rotation.x = -Math.PI / 2 + 0.06; hips.position.y = 0.16;
      const c = Math.sin(ph * 0.8) * 0.3 * clamp(s.speed / 0.5, 0, 1);
      legs[0].hip.rotation.set(c, 0, 0.25); legs[1].hip.rotation.set(-c, 0, -0.25); legs[0].knee.rotation.x = legs[1].knee.rotation.x = 0.2;
      arms[0].sh.rotation.set(-2.7 + c, 0, 0.2); arms[1].sh.rotation.set(-2.7 - c, 0, -0.2); arms[0].el.rotation.x = arms[1].el.rotation.x = -0.6;
      neck.rotation.x = 1.2; rifle.rotation.set(1.4, 0, 0); rifle.position.set(0.1, 0.55, -0.5);
      return;
    }
    neck.rotation.x = clamp(s.pitch * 0.5, -0.5, 0.5); rifle.rotation.set(0.15, 0.25, -0.5); rifle.position.set(0.05, 0.3, -0.3);
    const crouch = s.stance === 'crouch' ? 1 : 0;
    hips.position.y = 0.95 - crouch * 0.38;
    for (let i = 0; i < 2; i++) {
      const sg = i ? -1 : 1, L = legs[i];
      L.hip.rotation.set(-swing * sg - crouch * 1.1, 0, 0); L.knee.rotation.x = (sg > 0 ? lift : Math.max(0, -Math.cos(ph)) * 0.6 * k) + crouch * 1.9;
      const A = arms[i]; A.sh.rotation.set(swing * sg * 0.6 - 0.2, 0, i ? -0.08 : 0.08); A.el.rotation.x = -0.9;
    }
    torso.rotation.x = -crouch * 0.35 - (s.speed > 4 ? 0.25 : 0);
    if (s.swim) { g.rotation.x = -1.1; hips.position.y = 0.5; for (const A of arms) A.sh.rotation.x = -2.6 + Math.sin(ph * 0.7) * 0.8; }
    if (s.ladder) { for (let i = 0; i < 2; i++) { arms[i].sh.rotation.x = -2.5 + Math.sin(ph + i * Math.PI) * 0.3; legs[i].hip.rotation.x = -0.6 + Math.sin(ph + i * Math.PI) * 0.4; legs[i].knee.rotation.x = 1; } }
  };
  return B;
}
// a box limb from point a to point b (thickness t), for arms that reach exactly from the shoulder to the grip
function limb(a, b, t, m, parent) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B);
  const o = new THREE.Mesh(new THREE.BoxGeometry(t, t, L), m); o.position.copy(A).add(B).multiplyScalar(0.5); o.lookAt(B); parent.add(o); return o;
}
export function buildViewArms() {
  const g = new THREE.Group(), m = Object.fromEntries(Object.entries(COL).map(([k, c]) => [k, M(c)]));
  // the rifle low on the right, muzzle toward the crosshair; right hand on the pistol grip, left under the handguard
  const R = [0.17, -0.235, -0.42], rifle = buildRifle(m.rifle); rifle.position.set(...R); rifle.rotation.set(0.03, 0.05, 0); g.add(rifle);
  const gripR = [R[0], R[1] - 0.06, R[2] + 0.05], gripL = [R[0] - 0.025, R[1] - 0.025, R[2] - 0.36];
  limb([0.3, -0.48, 0.02], gripR, 0.095, m.shirt, g); bx(0.075, 0.08, 0.1, m.skin, ...gripR, g);
  limb([-0.06, -0.46, -0.24], gripL, 0.1, m.shirt, g); bx(0.075, 0.07, 0.1, m.skin, ...gripL, g);
  for (const o of g.children) o.traverse(c => { if (c.isMesh) c.frustumCulled = false; });
  const V = { group: g, rifle };
  let kick = 0;
  V.update = (dt, s) => {
    const ph = s.stride / 1.5 * Math.PI * 2, k = clamp(s.speed / 2.7, 0, 1.2) * (s.onGround ? 1 : 0);
    kick = Math.max(0, kick - dt * 8); if (s.fired) kick = 1;
    g.position.set(Math.sin(ph) * 0.012 * k, -Math.abs(Math.cos(ph)) * 0.012 * k - (s.sprinting ? 0.05 : 0), kick * 0.035);
    g.rotation.set(s.sprinting ? -0.35 : kick * 0.04, s.sprinting ? 0.5 : 0, s.sprinting ? 0.3 : 0);
    g.visible = !s.swim && !s.ladder && !s.dead;
  };
  return V;
}
// ------------------------------------------------------------------------------------------------ default slots
// The placeholder rifle (until the INFANTRY agent's weapons): semi-automatic M16A1 rounds as war.js bullets
// (no ballistics), 20-round magazines, R to reload.
function defaultWeapon({ war, sfx, fx, say }) {
  const W = { name: 'M16A1 (PLACEHOLDER)', mag: 20, mags: 6, cd: 0, reload: 0, held: false };
  W.reset = () => { W.mag = 20; W.mags = 6; W.reload = 0; };
  W.key = code => { if (code === 'KeyR' && W.mag < 20 && W.mags > 0 && W.reload <= 0) { W.reload = 2.4; say('RELOADING', 1); return true; } return false; };
  // a: { fire, eye {x,y,z}, dir {x,y,z} unit, vel {x,y,z} } -> true when a round left the muzzle
  W.update = (dt, a) => {
    W.cd -= dt;
    if (W.reload > 0) { W.reload -= dt; if (W.reload <= 0) { W.mags--; W.mag = 20; } W.held = a.fire; return false; }
    const pull = a.fire && !W.held; W.held = a.fire;
    if (!pull || W.cd > 0) return false;
    if (W.mag <= 0) { sfx.blip?.(200, 180, 0.03, 'square', 0.04); if (W.mags > 0) { W.reload = 2.4; say('RELOADING', 1); } else say('OUT OF AMMUNITION', 1.2); return false; }
    W.mag--; W.cd = 0.12; sfx.shot();
    const p = { x: a.eye.x + a.dir.x * 0.9, y: a.eye.y - 0.08 + a.dir.y * 0.9, z: a.eye.z + a.dir.z * 0.9 };
    war.fireBullet(p, { x: a.dir.x * 120 + a.vel.x, y: a.dir.y * 120 + a.vel.y, z: a.dir.z * 120 + a.vel.z });
    fx.flash(p.x, p.y, p.z, 0.06);
    return true;
  };
  W.hudLine = () => W.reload > 0 ? `${W.name}  RELOADING` : `${W.name}  ${W.mag}/20  ·  ${W.mags} MAGS  ·  R RELOAD`;
  return W;
}
// default medical: hit points per body part; vital parts at zero kill, a lost limb's further damage spills into the
// thorax (x0.7), a leg at zero slows you to 60%. The MEDINV agent replaces this (bleeding, fractures, meds, surgery).
function defaultMedical() {
  const hp = {}, Md = {};
  Md.reset = () => { for (const p of BODY_PARTS) hp[p.id] = p.hp; };
  Md.hit = h => {   // h: { part, amount (HP), why, kind }
    let part = h.part;
    if (hp[part] <= 0 && !BODY_PARTS.find(p => p.id === part).vital) { part = 'thorax'; h.amount *= 0.7; }
    hp[part] = Math.max(0, hp[part] - h.amount);
    return { dead: BODY_PARTS.some(p => p.vital && hp[p.id] <= 0), part };
  };
  Md.speedK = () => (hp.legL <= 0 || hp.legR <= 0 ? 0.6 : 1);
  Md.total = () => BODY_PARTS.reduce((s, p) => s + hp[p.id], 0) / BODY_PARTS.reduce((s, p) => s + p.hp, 0);
  Md.hudLine = () => { const hurt = BODY_PARTS.filter(p => hp[p.id] < p.hp); return `HEALTH ${Math.round(Md.total() * 100)}%${hurt.length ? '  ·  ' + hurt.map(p => `${p.name} ${Math.round(hp[p.id])}`).join('  ') : ''}`; };
  Md.hp = hp; Md.key = () => false; Md.reset();
  return Md;
}

// ------------------------------------------------------------------------------------------------ the craft
// ctx: { scene, GR (ground.js), crafts (craft.js host), war, fx, sfx, say, keyDown, readPad, getFov, onDeath(why) }
export function createFootCraft(ctx) {
  const { scene, GR, crafts, war, fx, sfx, say } = ctx;
  const kd = ctx.keyDown;
  const body = buildSoldierMesh(); body.group.visible = false; scene.add(body.group);
  const arms = buildViewArms(); arms.group.visible = false; scene.add(arms.group);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  shadow.visible = false; scene.add(shadow);
  const slots = { soldier: createWalker(), viewmodel: arms, body, weapon: defaultWeapon({ war, sfx, fx, say }), medical: defaultMedical(), inventory: null };
  const F = {
    id: 'foot', label: 'ON FOOT', kind: 'foot', seats: [{ id: 'self', label: 'ON FOOT' }],
    slots, exists: false, alive: true, view: 'first', stance: 'stand', deadT: 0, firedT: 9, platVel: { x: 0, z: 0 }, lastWhy: '',
    get W() { return slots.soldier; },
  };
  F.setSlot = (name, impl) => {
    if (!(name in slots)) throw new Error('foot: no slot ' + name);
    const old = slots[name];
    if ((name === 'viewmodel' || name === 'body') && old && old.group) scene.remove(old.group);
    if (name === 'soldier' && old && impl) impl.place?.(old.x, old.y, old.z, old.yaw);
    slots[name] = impl;
    if ((name === 'viewmodel' || name === 'body') && impl && impl.group) { impl.group.visible = false; scene.add(impl.group); }
    return impl;
  };
  // wave 2 (ngc/foot2): THE MARINE (marine.js: INFANTRY's rifleman, MEDINV's medical + inventory, on this craft's
  // walker). When set, it owns input, weapons, wounds, cameras, the first-person pass and the HUD lines; this file
  // keeps the craft plumbing (spawning, doors, deck carrying, what war.js sees, death -> lives).
  let marine = null;
  F.setMarine = m => {
    marine = m; F.marine = m;
    for (const k of ['viewmodel', 'body']) { const o = slots[k]; if (o && o.group) { o.group.visible = false; scene.remove(o.group); } slots[k] = null; }
    slots.weapon = null; slots.medical = null; slots.inventory = null;
    slots.soldier = m.W;
    return m;
  };
  // ---------------------------------------------------------------- life cycle
  F.present = () => F.exists;
  F.frame = out => { const W = slots.soldier; out.x = W.x; out.y = W.y; out.z = W.z; out.yaw = W.yaw; return out; };
  // put the soldier into the world at the first standable, clear spot of `spots` ([{x, y, z, yaw}] world)
  F.spawnAt = (spots, opts = {}) => {
    const W = slots.soldier, list = Array.isArray(spots) ? spots : [spots];
    let ok = null;
    for (const s of list) {
      const f = GR.floor(s.x, s.z, s.y + 0.4, 0.9);
      if (f === Infinity || f < s.y - 3) continue;
      const o = { x: s.x, z: s.z, r: SOLDIER.R, y0: f + 0.25, y1: f + 1.8 };
      if (GR.collide(o, null) && Math.hypot(o.x - s.x, o.z - s.z) > 0.6) continue;
      ok = { x: o.x, y: Math.max(f, s.y - 3), z: o.z, yaw: s.yaw }; break;
    }
    if (!ok && opts.force) ok = list[0];
    if (!ok) return false;
    W.place(ok.x, ok.y, ok.z, ok.yaw ?? 0); W.pitch = 0; W.stance = 'stand'; W.eye = SOLDIER.EYE.stand; W.stamina = Math.max(W.stamina ?? 1, 0.5);
    GR.settle(W, true);
    F.exists = true; F.alive = true; F.deadT = 0; F.stance = 'stand';
    if (opts.fresh) { slots.medical?.reset?.(); slots.weapon?.reset?.(); slots.inventory?.reset?.(); }
    marine?.spawned(!!opts.fresh);   // a new life gets a fresh Marine (kit, wounds); getting out of a craft keeps his state
    return true;
  };
  F.enter = () => F.exists;
  F.exit = () => { F.exists = false; marine?.exit(); body.group.visible = false; arms.group.visible = false; shadow.visible = false; if (slots.body !== body && slots.body) slots.body.group.visible = false; if (slots.viewmodel !== arms && slots.viewmodel) slots.viewmodel.group.visible = false; };
  F.canExit = () => 'ON FOOT  -  STAND BY A DOOR AND PRESS Y TO GET IN';
  F.silence = () => {};
  // ---------------------------------------------------------------- input
  const AIR_KEYS = ['KeyH', 'KeyI', 'KeyO', 'KeyU', 'KeyL', 'KeyN', 'KeyG', 'KeyB', 'KeyX', 'KeyF', 'KeyR', 'KeyQ', 'KeyE', 'Home', 'PageUp', 'PageDown'];
  F.key = (code, e) => {
    if (marine) return F.alive ? marine.key(code, e) || AIR_KEYS.includes(code) : false;
    if (!F.alive) return false;
    if (code === 'KeyC') { F.stance = F.stance === 'crouch' ? 'stand' : 'crouch'; return true; }
    if (code === 'KeyZ') { F.stance = F.stance === 'prone' ? 'stand' : 'prone'; return true; }
    if (code === 'KeyV') { F.view = F.view === 'first' ? 'third' : 'first'; say(F.view === 'first' ? 'FIRST PERSON' : 'THIRD PERSON', 1); return true; }
    if (slots.weapon && slots.weapon.key && slots.weapon.key(code)) return true;
    if (slots.inventory && slots.inventory.key && slots.inventory.key(code)) return true;
    if (slots.medical && slots.medical.key && slots.medical.key(code)) return true;
    if (code === 'KeyI') { if (slots.inventory) slots.inventory.toggle?.(); else say('NO KIT YET  -  THE INVENTORY COMES WITH THE MEDINV MODULE', 1.6); return true; }
    // keys that mean something in an aircraft but nothing on foot: swallow them so they don't reach the heli
    return AIR_KEYS.includes(code);
  };
  const SENS = 0.0022;
  F.look = (dx, dy) => { const W = slots.soldier; if (!F.alive) return; if (marine) { marine.look(dx, dy); return; } W.yaw -= dx * SENS; W.pitch = clamp(W.pitch - dy * SENS, -1.45, 1.45); };
  const intent = { mx: 0, mz: 0, sprint: false, stance: 'stand', jump: false, walk: false, speedK: 1 };
  let jumpWas = false, fireWas = false;
  F.update = (dt, input) => {
    const W = slots.soldier;
    if (marine) {   // the Marine runs his own frame (marine.js); death by wounds / bleeding ends the life here
      F._dt = dt;
      if (!F.alive) F.deadT -= dt;
      marine.update(dt, input);
      if (!W.plat) F.platVel.x = F.platVel.z = 0;
      if (F.alive && marine.isDead()) die(marine.cause());
      return;
    }
    if (!F.alive) { F.deadT -= dt; W.vx *= 0.9; W.vz *= 0.9; return; }
    const pad = input.pad && !input.keyboardOnly ? input.pad : null;
    let mx = (kd('KeyD') ? 1 : 0) - (kd('KeyA') ? 1 : 0), mz = (kd('KeyW', 'ArrowUp') ? 1 : 0) - (kd('KeyS', 'ArrowDown') ? 1 : 0);
    const turn = (kd('ArrowRight') ? 1 : 0) - (kd('ArrowLeft') ? 1 : 0), tilt = (kd('PageUp') ? 1 : 0) - (kd('PageDown') ? 1 : 0);
    W.yaw -= turn * 2.2 * dt; W.pitch = clamp(W.pitch + tilt * 1.4 * dt, -1.45, 1.45);
    let walk = false, jump = kd('Space'), fire = !!input.fire, sprint = kd('ShiftLeft', 'ShiftRight');
    if (pad) {   // gamepad: left stick moves (half way = walk), right stick looks, A jumps, B crouches, RT fires, L3 sprints
      const ax = i => { const v = pad.axes[i] || 0; return Math.abs(v) < 0.15 ? 0 : v; };
      if (ax(0) || ax(1)) { mx = ax(0); mz = -ax(1); walk = Math.hypot(mx, mz) < 0.6; }
      W.yaw -= ax(2) * 2.6 * dt; W.pitch = clamp(W.pitch - ax(3) * 1.8 * dt, -1.45, 1.45);
      const b = i => pad.buttons[i] && pad.buttons[i].pressed;
      if (b(0)) jump = true; if (b(7)) fire = true; if (b(10)) sprint = true;
      if (b(1) && !F._padB) F.stance = F.stance === 'crouch' ? 'stand' : 'crouch'; F._padB = b(1);
    }
    Object.assign(intent, { mx, mz, sprint, walk, stance: F.stance, jump: jump && !jumpWas, yaw: W.yaw, pitch: W.pitch, speedK: slots.medical?.speedK?.() ?? 1 });
    jumpWas = jump;
    if (intent.jump && F.stance !== 'stand') { F.stance = 'stand'; intent.stance = 'stand'; intent.jump = false; }   // Space gets you up first
    F._dt = dt;
    const evs = W.step(dt, intent, ctx.groundEnv);
    F.stance = W.stance === 'stand' && F.stance !== 'stand' && (W.swim || W.ladder) ? 'stand' : F.stance;
    if (!W.plat) F.platVel.x = F.platVel.z = 0;
    for (const e of evs) {
      if (e.e === 'fall') hurtParts(e.water ? ['thorax', 'stomach'] : ['legL', 'legR'], (e.v - SOLDIER.FALL_HURT) * (e.v > SOLDIER.FALL_KILL ? 30 : 9), e.water ? 'HIT THE WATER' : 'FELL', 'fall');
      else if (e.e === 'splash') { fx.water?.add?.({ x: W.x, y: 0.1, z: W.z, size: 1.2, grow: 5, a: 0.6, life: 1.2, tile: 1, pow: 1.5 }); sfx.thump?.(0.25); }
      else if (e.e === 'land' && e.v > 3) sfx.thump?.(Math.min(0.5, e.v * 0.04));
      else if (e.e === 'ladder') say(`${e.name}  -  W / S TO CLIMB`, 1.4);
    }
    // footsteps: a soft scuff each stride, steel underfoot rings
    if (W.onGround && W.stride - (F._lastStep || 0) > 0.75) { F._lastStep = W.stride; if (W.surface === 'deck') sfx.blip?.(160, 120, 0.04, 'square', 0.012); else sfx.noiseBurst?.(500, 160, 0.06, W.sprinting ? 0.05 : 0.03); }
    // weapon (slot)
    const eye = eyePos(_eye), dir = lookDir(_dir), vel = _vel.set(W.vx + F.platVel.x, W.vy, W.vz + F.platVel.z);
    const fired = !W.swim && !W.ladder && !W.sprinting && slots.weapon ? slots.weapon.update(dt, { fire: fire, eye, dir, vel, stance: W.stance }) : false;
    if (fired) F.firedT = 0; F.firedT += dt; F._fired = fired; fireWas = fire;
    slots.inventory?.update?.(dt, F);
  };
  // after war.update moved the ships: ride along now (no one-frame lag), and remember the deck's velocity (lead for the
  // enemy gunners; the speed you keep when you step off a moving deck)
  F.afterWar = () => {
    const W = slots.soldier; if (!W.plat) return;
    if (marine) { const c = marine.afterWar(), dt = F._dt || 0.016; if (c) { F.platVel.x = c.dx / dt; F.platVel.z = c.dz / dt; W.deckV = F.platVel; } return; }
    GR.carry(W); const c = W.carried, dt = F._dt || 0.016;
    if (c) { F.platVel.x = c.dx / dt; F.platVel.z = c.dz / dt; W.deckV = F.platVel; }
    GR.settle(W, W.onGround || !!W.ladder);
  };
  const _eye = new THREE.Vector3(), _dir = new THREE.Vector3(), _vel = new THREE.Vector3(), _e = new THREE.Euler();
  const eyePos = out => { const W = slots.soldier; return out.set(W.x, W.y + W.eye, W.z); };
  const lookDir = out => { const W = slots.soldier; const cp = Math.cos(W.pitch); return out.set(-Math.sin(W.yaw) * cp, Math.sin(W.pitch), -Math.cos(W.yaw) * cp); };
  // ---------------------------------------------------------------- damage
  function hurtParts(parts, hpTotal, why, kind) {
    if (!F.alive || hpTotal <= 0) return;
    for (const p of parts) { const r = slots.medical.hit({ part: p, amount: hpTotal / parts.length, why, kind }); if (r && r.dead) { die(why); return; } }
    sfx.hit?.() ?? sfx.boom(0.15);
  }
  F.hurt = (amount, why, at, dir, kind) => {
    if (!F.alive || ctx.invulnerable?.()) return;
    if (marine) { marine.hurt(amount, why, at, dir, kind); if (marine.isDead()) die(marine.cause()); return; }   // kind: the war.js projectile
    const W = slots.soldier, hp = amount * HP_PER_WAR_UNIT;
    const part = hitZone(at, W.x, W.y, W.z, W.yaw, W.stance, W.tall);
    if (part) { hurtParts([part], hp, why, 'bullet'); if (F.alive) say(`${why}  -  ${BODY_PARTS.find(p => p.id === part).name}`, 1.4); }
    else hurtParts(BODY_PARTS.map(p => p.id), hp * 1.2, why, 'blast');   // blast / flak: everywhere
  };
  function die(why) {
    if (!F.alive) return; F.alive = false; F.deadT = 3; F.lastWhy = why; F.view = 'third';
    say(`KILLED  -  ${why}`, 2.5); sfx.boom?.(0.2);
    if (marine) { if (!marine.isDead()) { marine.MS.dead = true; marine.MS.cause = why; } if (F.exists) marine.onDeath(); }
    ctx.onDeath?.(why);
  }
  F.kill = why => die(why);
  // ---------------------------------------------------------------- COLLISION (wave 3): the soldier in the collision world
  // a 0.3 m circle (his height by stance; lying: a body length along his facing as a box), 100 kg with kit. Vehicles
  // heavier than him are walls for him (GR.collide); he is not a wall for them (lighter than PUSH_RATIO): the contact
  // response shoves him aside, and one that comes at him faster than 3 m/s knocks him down and hurts him (GAME).
  F.mass = 100; F.cwClass = 'inf';
  const _cwc = [{ x: 0, z: 0, r: 0.3, y0: 0, y1: 1.8 }], _cwp = [{ x: 0, z: 0, yaw: 0, hl: 0.9, hw: 0.3, y0: 0, y1: 0.45 }];
  F.cwBounds = () => {
    if (!F.exists) return null; const W = slots.soldier;
    if (W.stance === 'prone' || !F.alive) { const p = _cwp[0]; p.x = W.x; p.z = W.z; p.yaw = W.yaw; p.y0 = W.y; p.y1 = W.y + 0.45; return _cwp; }
    const c = _cwc[0]; c.x = W.x; c.z = W.z; c.y0 = W.y; c.y1 = W.y + (W.tall || 1.8); return _cwc;
  };
  F.shove = (dx, dz) => { const W = slots.soldier, l = Math.hypot(dx, dz), k = l > 0.25 ? 0.25 / l : 1; W.x += dx * k; W.z += dz * k; };
  let bumpT = -9;
  F.contact = (o, sp, c) => {
    const at = (o.vx || 0) * c.nx + (o.vz || 0) * c.nz, om = o.mass === Infinity ? 1e6 : o.mass || 0, t = performance.now() / 1000;   // (at: it came at him)
    if (!F.alive || om < 600 || at < 3 || t - bumpT < 1) return;
    bumpT = t; const W = slots.soldier; W.vx = (W.vx || 0) + c.nx * at * 0.6; W.vz = (W.vz || 0) + c.nz * at * 0.6;
    F.hurt(Math.min(1.2, (at - 3) * 0.06 + 0.04), `HIT BY ${o.owner && o.owner.label ? o.owner.label : 'A VEHICLE'}`, null, null, 'blast');
  };
  // ---------------------------------------------------------------- what war.js sees
  F.pl = {
    alive: () => F.alive && F.exists, inCave: false,
    landed: () => slots.soldier.onGround && !slots.soldier.swim,
    hitR: () => ({ stand: 0.45, crouch: 0.4, prone: 0.35 })[slots.soldier.stance] || 0.45,
    sight: 110, capTime: 12,
    detect: () => { const W = slots.soldier; if (marine) return clamp(marine.pl.detect(), 0.1, 1); return clamp(({ stand: 0.45, crouch: 0.32, prone: 0.18 })[W.stance] + (W.sprinting ? 0.12 : 0) + (F.firedT < 3 ? 0.25 : 0), 0.1, 1); },
  };
  F.avatar = Z => {
    const W = slots.soldier, ch = W.stance === 'prone' ? 0.25 : W.tall * 0.58;
    Z.pos.set(W.x, W.y + ch, W.z); Z.vel.set(W.vx + F.platVel.x, W.vy, W.vz + F.platVel.z); Z.facing.set(-Math.sin(W.yaw), -Math.cos(W.yaw));
  };
  // ---------------------------------------------------------------- views
  F.firstPerson = () => marine ? F.alive && marine.firstPerson() : F.view === 'first' && F.alive;
  F.fov = ckFov => marine ? marine.fov(ckFov) : ckFov;
  let bob = 0;
  // pull the over-the-shoulder camera in front of whatever is between it and the head (a parked helicopter, a wall)
  const clearView = (ex, ey, ez, p) => GR.clearView(ex, ey, ez, p, null);
  F.camera = (cam, dt) => {
    if (marine) { marine.camera(cam, dt); return; }
    const W = slots.soldier, sp = Math.hypot(W.vx, W.vz);
    bob += (W.onGround && sp > 0.3 ? 1 : -1) * dt * 3; bob = clamp(bob, 0, 1);
    const ph = W.stride / 1.5 * Math.PI * 2, amp = bob * clamp(sp / 3, 0, 1.6) * (W.stance === 'stand' ? 1 : 0.5);
    if (F.firstPerson()) {
      cam.position.set(W.x, W.y + W.eye + Math.abs(Math.sin(ph)) * 0.035 * amp, W.z);
      cam.position.x += Math.cos(W.yaw) * Math.sin(ph) * 0.015 * amp; cam.position.z -= Math.sin(W.yaw) * Math.sin(ph) * 0.015 * amp;
      cam.quaternion.setFromEuler(_e.set(W.pitch, W.yaw, Math.sin(ph) * 0.004 * amp, 'YXZ'));
    } else {   // over the shoulder (and the dead soldier from above)
      const back = F.alive ? 3.2 : 5, fx = -Math.sin(W.yaw), fz = -Math.cos(W.yaw), cp = Math.cos(W.pitch), sp2 = Math.sin(W.pitch);
      const ex = W.x, ey = W.y + (F.alive ? W.eye : 0.4), ez = W.z;
      cam.position.set(ex - fx * cp * back + Math.cos(W.yaw) * 0.55, ey - sp2 * back + 0.35 + (F.alive ? 0 : 3), ez - fz * cp * back - Math.sin(W.yaw) * 0.55);
      clearView(ex, ey, ez, cam.position);
      const gy = GR.floor(cam.position.x, cam.position.z, cam.position.y, 50); if (gy !== Infinity && cam.position.y < gy + 0.4) cam.position.y = gy + 0.4;
      if (F.alive) cam.quaternion.setFromEuler(_e.set(W.pitch, W.yaw, 0, 'YXZ')); else cam.lookAt(ex, ey, ez);
    }
  };
  // the ladders the ground host knows about (GR.LADDERS: the carriers' stern and island), drawn onto each ship once
  const ladM = M(0x3b4046);
  function ensureLadders() {
    for (const u of war.units) {
      if (!u.dims || !u.mesh || u.mesh.userData.ladders) continue;
      u.mesh.userData.ladders = true;
      for (const L of GR.laddersOf(u)) if (!L.drawn) u.mesh.add(buildLadder(L));   // NAVAL models draw their own
    }
  }
  function buildLadder(L) {
    const g = new THREE.Group(), h = L.y1 - L.y0, fx = -Math.sin(L.yaw), fz = -Math.cos(L.yaw);
    g.position.set(L.lx + fx * 0.06, L.y0, L.lz + fz * 0.06); g.rotation.y = L.yaw;   // local -z: into the wall
    for (const s of [-1, 1]) bx(0.05, h + 0.9, 0.05, ladM, s * L.w / 2, (h + 0.9) / 2, 0, g);   // rails, with grab handles above the top
    const n = Math.floor(h / 0.3), rung = new THREE.InstancedMesh(new THREE.BoxGeometry(L.w, 0.035, 0.035), ladM, n), m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) rung.setMatrixAt(i, m4.makeTranslation(0, 0.15 + i * 0.3, 0));
    g.add(rung); return g;
  }
  F.render = (dt, time, fp) => {
    ensureLadders();
    const W = slots.soldier, vis = F.exists;
    const B = slots.body, V = slots.viewmodel;
    const s = F._anim ||= {};
    Object.assign(s, { speed: Math.hypot(W.vx, W.vz), stride: W.stride, stance: W.stance, eye: W.eye, swim: W.swim, ladder: !!W.ladder, dead: !F.alive, pitch: W.pitch, onGround: W.onGround, sprinting: W.sprinting, fired: F._fired });
    if (B) { B.group.visible = vis && !fp; if (B.group.visible) { B.group.position.set(W.x, W.y, W.z); B.group.rotation.y = W.yaw; B.animate(s, dt); } }
    if (V) { V.group.visible = vis && fp; if (V.group.visible) { V.update(dt, s); const cam = ctx.camera(); V.group.position.applyQuaternion(cam.quaternion).add(cam.position); V.group.quaternion.premultiply(cam.quaternion); } }
    shadow.visible = vis && !W.swim; if (shadow.visible) { const g = GR.floor(W.x, W.z, W.y + 0.1, 0.5); shadow.position.set(W.x, (g === Infinity ? W.y : g) + 0.04, W.z); }
    marine?.render(dt, time, fp && F.alive, vis);
  };
  F.overlay = (renderer, cam) => { if (F.exists) marine?.overlay(renderer, cam); };   // the first-person arms and weapon: their own pass (main.js, after the world)
  F.hud = () => {
    const W = slots.soldier;
    if (marine) {   // the Marine's lines; a door in reach comes first
      const h = marine.hud(), near = F.alive && !marine.ui ? crafts.nearestDoor(W.x, W.y + 1, W.z, 2.6) : null;
      if (near) { h.hint = `Y: GET IN THE ${near.def.label}  (${crafts.seatName(near.def, near.seat)})`; h.tip = false; }
      return h;
    }
    const near = F.alive ? crafts.nearestDoor(W.x, W.y + 1, W.z, 2.6) : null;
    const st = W.swim ? 'SWIMMING' : W.ladder ? 'ON A LADDER' : W.stance === 'prone' ? 'PRONE' : W.stance === 'crouch' ? 'CROUCHED' : W.sprinting ? 'SPRINTING' : 'STANDING';
    const deck = W.plat ? (W.plat.type === 'carrier' ? (W.plat.side === 1 ? 'ALBATROSS' : 'KRAKEN') : W.plat.type.toUpperCase()) + ' ' : '';
    const line = `ON FOOT  ·  ${st}  ·  ${(Math.hypot(W.vx, W.vz) * 3.6).toFixed(1)} km/h  ·  ${deck}${W.surface.toUpperCase()}  ·  ${slots.medical?.hudLine?.() || ''}`;
    let hint = '', tip = false;
    if (!F.alive) hint = `${F.lastWhy}`;
    else if (near) hint = `Y: GET IN THE ${near.def.label}  (${crafts.seatName(near.def, near.seat)})`;
    else if (W.ladder) hint = `${W.ladder.name}  -  W / S TO CLIMB, SPACE TO LET GO`;
    else if (W.swim) hint = 'SWIMMING  -  MAKE FOR A BEACH OR THE ALBATROSS STERN LADDER';
    else { tip = true; hint = W.winded ? 'OUT OF BREATH' : 'WASD WALK  ·  CLICK: MOUSE LOOK  ·  SHIFT SPRINT  ·  C / Z CROUCH / PRONE  ·  V VIEW'; }
    return { line, hint, tip, weap: slots.weapon?.hudLine?.() || 'UNARMED', fuel: W.stamina * 100, fuelLabel: 'STAMINA' };
  };
  return F;
}
