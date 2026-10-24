// NGC-1980 wave 2 (ngc/foot2): THE 1980 MARINE in the game - what plugs into FOUNDATION's on-foot craft (foot.js,
// foot.setMarine). The pure core is marinesim.js (INFANTRY's rifleman + MEDINV's medical and inventory + FOUNDATION's
// walker); this file is the game side:
//   - input: keys, mouse (left fire, right aim down the sights, wheel weapons), gamepad -> the rifleman's input
//   - the world for his rounds: raycast against terrain, the sea, ship decks / hulls / islands, island buildings, trees,
//     war.js units (aircraft, RUNAWAY units, ship guns), parked crafts and soldier figures; hits become war.js damage
//   - incoming fire: war.js projectiles (WASP cannon, CIWS, flak, blasts, lasers, missiles) -> MEDINV hit-info
//   - the first-person viewmodel (its own render pass), the 17-bone third-person Marine (soldiermodel.js), tracers,
//     impacts, InfantryAudio on the game's AudioContext
//   - GEAR (Tab / I) and HEALTH (H) screens (invui.js / medui.js; the mouse is released while they are open), the
//     medical HUD strip and vision effects, loot crates on the ALBATROSS and the islands, dropped kit, bodies
//   - rearm / resupply on friendly pads and the carrier deck (F), bleeding out ends the life (the game's lives rules)
import * as THREE from 'three';
import { createMarineSim } from './marinesim.js';
import { hitZone } from './foot.js';
import { createViewmodel } from './units/infantry/viewmodel.js';
import { buildMarine, poseSkeleton, raycastHitboxes } from './units/infantry/soldiermodel.js';
import { InfantryAudio } from './units/infantry/infantryaudio.js';
import { buildItemModel } from './units/infantry/weaponmodels.js';
import * as I from './units/infantry/inventory.js';
import { ITEMS } from './units/infantry/items.js';
import { fragmentHits, REGION } from './units/infantry/medical.js';
import { createInvUI } from './units/infantry/invui.js';
import { createMedUI, createMedHud, createVisionFX, FEEDTXT } from './units/infantry/medui.js';
import { addSmoke } from './units/defence/cm.js';   // ngc/cmpolish: M18 smoke blocks sight lines and the LANCE beam
import { createMarineCare } from './marinecare.js';   // ngc/infdepth: buddy aid both ways, drag / carry, the ground war's dead
import { createThrowVM } from './units/infantry/throwvm.js';   // ngc/infdepth: the grenade drill in the viewmodel
import { careHands, throwHands } from './units/infantry/carepose.js';   // ngc/infdepth-fix: the same in third person

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const SENS = 0.0022;   // mouse: rad per pixel (as foot.js)
// what a rifle-calibre hit does to a war.js target (war.js damage units: a gunship has 3, a drone 5, an AA gun 7, a
// headquarters 30). GAME values: small arms chip at aircraft and guns, barely scratch buildings, not ships.
const WAR_DMG = { M193: 0.22, M196: 0.22, M80: 0.35, M62: 0.35, M1911: 0.1 };
// incoming war.js fire -> MEDINV hit-info (GAME tables; MEDINV's ROUNDS / FRAGS scale)
const INCOMING = {
  b:    { kind: 'bullet', dmg: 50, pen: 34, bleed: 1.2, source: 'RW-3 WASP CANNON' },        // the WASP's cyan bolts
  ciws: { kind: 'bullet', dmg: 95, pen: 55, bleed: 1.5, source: 'CANNON' },
  jb:   { kind: 'bullet', dmg: 95, pen: 55, bleed: 1.5, source: '20 MM CANNON' },
};
const MECH = { magOut: 'magOut', magIn: 'magIn', slap: 'slap', chargeBack: 'chargeBack', chargeFwd: 'chargeFwd', boltRelease: 'boltRelease', fa: 'fa', selector: 'selector', click: 'click', coverOpen: 'coverOpen', coverClose: 'coverClose', beltOn: 'beltOn', barrelLatch: 'barrelLatch', barrelOut: 'barrelOut', barrelIn: 'barrelIn', open: 'open', close: 'close', insert: 'insert', extend: 'extend', arm: 'arm', pin: 'pin', deadTrigger: 'deadTrigger', safeTrigger: 'click' };
const MALF = { feed: 'FAILURE TO FEED', stovepipe: 'STOVEPIPE', extract: 'FAILURE TO EXTRACT', double: 'DOUBLE FEED', dud: 'DUD ROUND', oob: 'BOLT NOT IN BATTERY', runaway: 'RUNAWAY GUN', misfire: 'MISFIRE' };

export function createMarine(ctx) {
  const { scene, GR, war, fx, sfx, say, feed } = ctx;
  const kd = ctx.keyDown;
  const MS = createMarineSim({ seed: (Math.random() * 1e9) | 0, raycast: (...a) => raycast(...a) });
  const { W, R, S, M } = MS;
  const Mr = { MS, W, R, S, M, inv: MS.inv, ui: null, view: 'first', needsFresh: false, figures: [], crates: [], piles: [], bodies: [], hitFlash: 0, firedT: 9 };

  // ================================================================ the world for his rounds
  const _c = new THREE.Vector3();
  const surfH = (x, z) => Math.max(ctx.terrainH(x, z), 0, GR.deckH(x, z));
  const _smp = {};
  function matAt(x, y, z) {
    const deck = GR.deckH(x, z);
    if (deck > -1e8 && y <= deck + 0.3 && deck >= ctx.terrainH(x, z)) return { material: 'steel', thickness: 25, target: war.shipAt(x, z) || null, kind: 'metal' };
    if (ctx.terrainH(x, z) < 0 && y < 0.3) return { material: 'water', thickness: 1e9, kind: 'water' };
    GR.sample(x, z, _smp);
    return { material: _smp.surface === 'road' || _smp.surface === 'rock' ? 'concrete' : 'soil', thickness: 1e9, kind: 'ground', n: [_smp.nx, _smp.ny, _smp.nz] };
  }
  function raycast(x0, y0, z0, x1, y1, z1, P) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz); if (L < 1e-6) return null;
    let best = null;
    const set = (t, o) => { if (t >= 0 && t <= 1 && (!best || t < best.t)) { o.t = t; best = o; } };
    // ground, the sea, decks, hulls, the islands of the ships (march + bisect)
    const n = Math.max(1, Math.ceil(L / 1.5));
    let prev = 0;
    if (y0 < surfH(x0, z0) - 0.05) { /* starts under the surface (in the water after a skip): leave it to the sea */ }
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      if (y0 + dy * t < surfH(x0 + dx * t, z0 + dz * t)) {
        let a = prev, b = t; for (let i = 0; i < 8; i++) { const m = (a + b) / 2; if (y0 + dy * m < surfH(x0 + dx * m, z0 + dz * m)) b = m; else a = m; }
        const hx = x0 + dx * b, hy = y0 + dy * b, hz = z0 + dz * b, m = matAt(hx, hy, hz), nn = m.n || [0, 1, 0];
        set(b, { x: hx, y: hy, z: hz, nx: nn[0], ny: nn[1], nz: nn[2], material: m.material, thickness: m.thickness, target: m.target || null, fxKind: m.kind });
        break;
      }
      prev = t;
    }
    // tree trunks
    const th = GR.treeHit && GR.treeHit(x0, y0, z0, x1, y1, z1);
    if (th) set(th.t, { x: x0 + dx * th.t, y: y0 + dy * th.t, z: z0 + dz * th.t, nx: -dx / L, ny: 0, nz: -dz / L, material: 'wood', thickness: 350, target: null, fxKind: 'ground' });
    // island buildings and AA guns (vertical cylinders)
    for (const Is of ctx.ISLANDS) {
      if (!Is.structs || Math.abs(x0 - Is.x) > (Is.r || 60) + 80 || Math.abs(z0 - Is.z) > (Is.r || 60) + 80) continue;
      for (const s of Is.structs) {
        if (s.dead) continue;
        const r = s.kind === 'aa' ? 2.2 : s.r * 0.8, t = segCircle(x0, z0, dx, dz, s.x, s.z, r); if (t === null) continue;
        const y = y0 + dy * t; if (y < s.y - 0.5 || y > s.y + Math.max(2, s.h * 2)) continue;
        set(t, { x: x0 + dx * t, y, z: z0 + dz * t, nx: -dx / L, ny: 0, nz: -dz / L, material: s.kind === 'aa' ? 'steel' : 'concrete', thickness: s.kind === 'aa' ? 12 : 400, target: s, fxKind: s.kind === 'aa' ? 'metal' : 'ground' });
      }
    }
    // ngc/infdepth: the ground war's own units (STRIDERs, hover tanks, MBTs, the Marines - friendly fire is real) by
    // groundsim's hit volumes; the hit goes to the ground sim (warHit -> GS.hitUnit)
    const GSm = war.ground?.sim;
    if (GSm) for (const u of GSm.units) {
      if (!u.alive && u.kind !== 'strider' || u.evac || Math.abs(u.x - x0) > L + 8 || Math.abs(u.z - z0) > L + 8 || u === Mr.care?.hold?.u) continue;
      const t = GSm.unitT(u, x0, y0, z0, x1, y1, z1); if (t < 0) continue;
      const mar = u.kind === 'marine';
      set(t, { x: x0 + dx * t, y: y0 + dy * t, z: z0 + dz * t, nx: -dx / L, ny: -dy / L, nz: -dz / L, material: mar ? 'flesh' : 'armour', thickness: mar ? 300 : 20, target: { gw: u }, fxKind: mar ? 'ground' : 'metal' });
    }
    // war.js units: aircraft, RUNAWAY ground units (spheres of radius u.r, or the unit's own u.hitRay), ship gun mounts
    for (const u of war.units) {
      if (u.dead || u.dying || u.gone || u.noHit) continue;   // (noHit: the ground war's squad proxies, ngc/infdepth)
      if (u.dims) {
        if (Math.abs(x0 - u.p.x) > 90 || Math.abs(z0 - u.p.z) > 90) continue;
        for (const g of u.guns) { if (g.dead) continue; g.mesh.getWorldPosition(_c); const t = segSphere(x0, y0, z0, dx, dy, dz, _c.x, _c.y, _c.z, 1.6); if (t !== null) set(t, { x: x0 + dx * t, y: y0 + dy * t, z: z0 + dz * t, nx: -dx / L, ny: -dy / L, nz: -dz / L, material: 'steel', thickness: 15, target: g, fxKind: 'metal' }); }
        continue;
      }
      if (!u.p || !u.r) continue;
      if (u.hitRay) { const h = u.hitRay(x0, y0, z0, dx / L, dy / L, dz / L, L); if (h) set(h.dist / L, { x: h.x, y: h.y, z: h.z, nx: -dx / L, ny: -dy / L, nz: -dz / L, material: h.material || 'armour', thickness: h.thickness ?? 20, target: u, fxKind: 'metal' }); continue; }
      const t = segSphere(x0, y0, z0, dx, dy, dz, u.p.x, u.p.y, u.p.z, Math.min(u.r, 4.5) * 0.8); if (t !== null) set(t, { x: x0 + dx * t, y: y0 + dy * t, z: z0 + dz * t, nx: -dx / L, ny: -dy / L, nz: -dz / L, material: 'steel', thickness: 8, target: u, fxKind: 'metal' });
    }
    // parked and driven crafts (the Huey, the Hornet, vehicles): thin skins, rounds go through
    for (const b of ctx.crafts.bounds(null)) {
      const t = segBox(x0, y0, z0, dx, dy, dz, b); if (t !== null) set(t, { x: x0 + dx * t, y: y0 + dy * t, z: z0 + dz * t, nx: -dx / L, ny: -dy / L, nz: -dz / L, material: 'sheet', thickness: 3, target: b.def || null, fxKind: 'metal' });
    }
    // soldier figures (bodies, AI): the shared skeleton's hitboxes
    for (const f of Mr.figures) {
      if (f.owner === P?.owner || Math.abs(f.sk.root.position.x - x0) > 60 || Math.abs(f.sk.root.position.z - z0) > 60 || P?.ignore === f) continue;
      const b = raycastHitboxes(f.sk, x0, y0, z0, dx / L, dy / L, dz / L, L);
      if (b) set(b.dist / L, { x: b.x, y: b.y, z: b.z, nx: -dx / L, ny: -dy / L, nz: -dz / L, body: { target: f, part: b.part, armour: b.armour } });
    }
    return best;
  }
  function segSphere(x0, y0, z0, dx, dy, dz, cx, cy, cz, r) {
    const ox = x0 - cx, oy = y0 - cy, oz = z0 - cz, a = dx * dx + dy * dy + dz * dz, b = 2 * (ox * dx + oy * dy + oz * dz), c = ox * ox + oy * oy + oz * oz - r * r, D = b * b - 4 * a * c;
    if (D < 0) return null; const t = (-b - Math.sqrt(D)) / (2 * a); return t >= 0 && t <= 1 ? t : (c < 0 ? 0 : null);
  }
  function segCircle(x0, z0, dx, dz, cx, cz, r) {
    const ox = x0 - cx, oz = z0 - cz, a = dx * dx + dz * dz, b = 2 * (ox * dx + oz * dz), c = ox * ox + oz * oz - r * r, D = b * b - 4 * a * c;
    if (a < 1e-9 || D < 0) return null; const t = (-b - Math.sqrt(D)) / (2 * a); return t >= 0 && t <= 1 ? t : null;
  }
  function segBox(x0, y0, z0, dx, dy, dz, b) {   // b: { x, z, yaw, hl, hw, y0, y1 } (ground.js footprint)
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), qx = x0 - b.x, qz = z0 - b.z;
    const o = [qx * c - qz * s, y0, qx * s + qz * c], d = [dx * c - dz * s, dy, dx * s + dz * c], lo = [-b.hw, b.y0, -b.hl], hi = [b.hw, b.y1, b.hl];
    let t0 = 0, t1 = 1;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return null; continue; }
      let a = (lo[i] - o[i]) / d[i], e = (hi[i] - o[i]) / d[i]; if (a > e) [a, e] = [e, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, e); if (t0 > t1) return null;
    }
    return t0 > 0 ? t0 : null;
  }

  // ================================================================ visuals
  const vm = createViewmodel(); Mr.vm = vm;
  const lawW = () => R.slots.find(w => w.key === 'M72A2');
  vm.lawLines = lawW()?.lawLines?.();
  const me = buildMarine({ seed: 1, weapon: 'M16A1', pack: true }); me.root.visible = false; scene.add(me.root);
  me.owner = 'player';
  const tracerGeo = new THREE.BufferGeometry(), tracerPos = new Float32Array(200 * 6); tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  const tracers = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({ color: 0xff6a3a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  tracers.frustumCulled = false; scene.add(tracers);
  const flashL = new THREE.PointLight(0xffc070, 0, 9, 2); scene.add(flashL);
  let audio = null;
  const A = () => { if (!audio && sfx.ctx && sfx.master) { audio = new InfantryAudio(sfx.ctx, sfx.master); audio.init(); } return audio; };
  // crates, piles of dropped kit and bodies, carried by the ship they sit on
  const crateMat = { wood: new THREE.MeshLambertMaterial({ color: 0x6b5a38, flatShading: true }), band: new THREE.MeshLambertMaterial({ color: 0x3b3a2a }), stencil: new THREE.MeshBasicMaterial({ color: 0xe8e2c8 }), med: new THREE.MeshLambertMaterial({ color: 0x5b6142 }), rw: new THREE.MeshLambertMaterial({ color: 0xd9dbd6, flatShading: true }), cyan: new THREE.MeshBasicMaterial({ color: 0x5fe6ff }) };
  function crateMesh(kind) {
    const g = new THREE.Group(), bx = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
    if (kind === 'rw_cache') { bx(1.3, 0.55, 0.8, crateMat.rw, 0, 0.3, 0); bx(1.32, 0.05, 0.1, crateMat.cyan, 0, 0.45, 0.36); bx(1.1, 0.12, 0.6, crateMat.rw, 0, 0.62, 0); }
    else if (kind === 'crate_med') { bx(1.0, 0.5, 0.6, crateMat.med, 0, 0.25, 0); bx(0.3, 0.08, 0.02, crateMat.stencil, 0, 0.3, 0.31); bx(0.08, 0.3, 0.02, crateMat.stencil, 0, 0.3, 0.31); bx(1.02, 0.05, 0.62, crateMat.band, 0, 0.5, 0); }
    else { bx(1.2, 0.45, 0.55, crateMat.wood, 0, 0.23, 0); for (const x of [-0.45, 0.45]) bx(0.08, 0.47, 0.57, crateMat.band, x, 0.23, 0); bx(0.6, 0.06, 0.01, crateMat.stencil, 0, 0.3, 0.28); bx(0.4, 0.04, 0.01, crateMat.stencil, 0, 0.2, 0.28); }
    return g;
  }
  // a thing on the map: { c (inventory container), mesh, x, y, z | ship + local [lx, ly, lz], name, kind }
  const _w3 = { x: 0, y: 0, z: 0 };
  function placeThing(t) {
    if (t.ship) { if (t.ship.gone || t.ship.sinking > 4) { t.mesh.visible = false; return; } GR.fromShip(t.ship, t.local[0], t.local[1], t.local[2], _w3); t.x = _w3.x; t.y = _w3.y; t.z = _w3.z; t.mesh.position.set(t.x, t.y, t.z); t.mesh.rotation.set(t.ship.att?.pitch || 0, t.ship.yaw + (t.yaw || 0), t.ship.att?.roll || 0, 'YXZ'); }
    else t.mesh.position.set(t.x, t.y, t.z);
  }
  function addThing(list, t) { scene.add(t.mesh); placeThing(t); list.push(t); return t; }
  const rng = Math.random;
  let worldOf = null;
  // a new war: crates on the ALBATROSS deck (starboard, forward of the island) and by every island's pad
  function stockWorld() {
    for (const t of [...Mr.crates, ...Mr.piles]) scene.remove(t.mesh);
    for (const b of Mr.bodies) { scene.remove(b.sk.root); Mr.figures.splice(Mr.figures.indexOf(b), 1); }
    Mr.crates.length = Mr.piles.length = Mr.bodies.length = 0;
    const c = war.carrier; worldOf = c;
    if (c) {
      for (const [id, lx, lz, yaw] of [['crate_ammo', 12.4, -6.2, 0.1], ['crate_med', 12.6, -8.0, -0.05], ['crate_ammo', -12.6, 44, 1.5]]) {
        const it = I.fillCrate(id, rng); addThing(Mr.crates, { c: it, kind: id, name: ITEMS[id].name, mesh: crateMesh(id), ship: c, local: [lx, c.dims.DECK, lz], yaw });
      }
    }
    for (const Is of ctx.ISLANDS) {
      const p = Is.pad; if (!p || Is.cave) continue;
      for (let k = 0; k < 8; k++) {
        const a = k * 0.8 + Is.x * 0.01, d = p.r + 3, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, h = ctx.terrainH(x, z);
        if (h < 1 || !GR.clearAt(x, z, 1.2)) continue;
        const id = Is.owner === 2 ? 'rw_cache' : k % 2 ? 'crate_med' : 'crate_ammo';
        addThing(Mr.crates, { c: I.fillCrate(id, rng), kind: id, name: `${Is.name}: ${ITEMS[id].name}`, mesh: crateMesh(id), x, y: h, z }); break;
      }
    }
  }
  // dropped kit: a pile on the ground (or a deck) at his feet
  function dropPile(items, label = 'DROPPED KIT') {
    if (!items.length) return null;
    let pile = Mr.piles.find(p => Math.hypot(p.x - W.x, p.z - W.z) < 1.2 && Math.abs(p.y - W.y) < 1);
    if (!pile) {
      const c = I.newItem('ground'), item0 = items[0], fit = { mag_m16_20: 'M16-20', mag_m16_30: 'M16-20', mag_45: 'M1911-7', belt_m60_100: 'M60-belt' }[item0.id];
      const mesh = new THREE.Group(); const m = fit ? buildItemModel(fit) : new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.3), crateMat.band); if (fit) { m.rotation.z = Math.PI / 2; m.position.y = 0.03; } else m.position.y = 0.06; mesh.add(m);
      const fx0 = -Math.sin(S.yaw) * 0.5, fz0 = -Math.cos(S.yaw) * 0.5;
      pile = { c, kind: 'pile', name: label, mesh, x: W.x + fx0, y: W.y, z: W.z + fz0 };
      if (W.plat) { const l = GR.toShip(W.plat, pile.x, W.y, pile.z, {}); pile.ship = W.plat; pile.local = [l.x, l.y, l.z]; pile.yaw = S.yaw - W.plat.yaw; }
      addThing(Mr.piles, pile);
      if (Mr.piles.length > 12) { const o = Mr.piles.shift(); scene.remove(o.mesh); }
    }
    for (const it of items) { I.detach(it); const f = I.findFree(pile.c, it); if (f) I.placeIn(pile.c, f.g, it, f.x, f.y, f.r); }
    return pile;
  }
  // his body where he fell: the 17-bone Marine on his back, his kit on him (lootable)
  function leaveBody() {
    const sk = buildMarine({ seed: 2 + Mr.bodies.length, weapon: null, pack: true });
    const kit = I.deserialize(I.serialize(MS.inv)); kit.name = 'MARINE (KIA)';
    const b = { sk, c: kit, kind: 'body', name: 'YOUR BODY', x: W.x, y: W.y, z: W.z, yaw: S.yaw, dead: true, mesh: sk.root };
    if (W.plat) { const l = GR.toShip(W.plat, W.x, W.y, W.z, {}); b.ship = W.plat; b.local = [l.x, l.y, l.z]; b.yaw = S.yaw - W.plat.yaw; }
    scene.add(sk.root); placeThing(b); if (!b.ship) sk.root.rotation.y = S.yaw;
    poseSkeleton(sk, { stance: 'stand', stanceFrom: 'stand', stanceTo: 'stand', stanceT: 1, down: true, speed: 0, gait: 'idle', gaitPhase: 0, lean: 0, ads: 0, lower: 1, aimPitch: 0, aimYaw: 0, headYaw: 0, headPitch: 0, moveF: 0, moveR: 0, breath: 0, cls: 'rifle' }, 1);
    Mr.bodies.push(b); Mr.figures.push(b);
    if (Mr.bodies.length > 4) { const o = Mr.bodies.shift(); scene.remove(o.sk.root); Mr.figures.splice(Mr.figures.indexOf(o), 1); }
  }

  // ================================================================ screens: GEAR and HEALTH
  let invUI = null, medUI = null, medHud = null, vision = null;
  const TABS = ['GEAR', 'HEALTH'];
  function ensureUI() {
    if (invUI || typeof document === 'undefined') return;
    invUI = createInvUI({ inv: MS.inv, med: M, parent: document.body, tabs: TABS, cell: 40, bodyKg: 80,
      onTab: t => openScreen(t === 'HEALTH' ? 'health' : 'gear'), onClose: () => { if (Mr.ui === 'gear') closed(); },
      onDrop: () => {} });
    medUI = createMedUI({ med: M, inv: MS.inv, parent: document.body, tabs: TABS, title: 'LCPL J. RIVERA, 3/3 MARINES', onTab: t => openScreen(t === 'GEAR' ? 'gear' : 'health'), onClose: () => { if (Mr.ui === 'health') closed(); } });
  }
  function hudParts() {
    if (medHud || typeof document === 'undefined') return;
    const hud = ctx.hudEl || document.body;
    medHud = createMedHud(hud, M); medHud.el.style.bottom = '112px'; medHud.el.style.display = 'none';
    vision = createVisionFX(hud, ctx.canvas);
    Mr.flashEl = document.createElement('div'); Mr.flashEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;opacity:0;background:radial-gradient(ellipse at 50% 50%,transparent 35%,rgba(150,0,0,.55) 100%)'; hud.appendChild(Mr.flashEl);
  }
  let loot = null;
  function openScreen(which, lootC = null) {
    ensureUI(); if (!invUI) return;
    if (document.pointerLockElement) document.exitPointerLock();
    if (which === 'gear') { if (medUI.isOpen()) { medUI.S.open = false; medUI.el.classList.remove('on'); } loot = lootC; invUI.open(lootC); }
    else { if (invUI.isOpen()) { invUI.S.open = false; invUI.el.classList.remove('on'); } medUI.open(); }
    Mr.ui = which; held.fire = held.ads = false;
  }
  function closeScreens() { if (invUI?.isOpen()) invUI.close(); if (medUI?.isOpen()) medUI.close(); closed(); }
  function closed() {
    if (!invUI) return;
    if (invUI.isOpen() || medUI.isOpen()) return;
    Mr.ui = null;
    // what was dragged onto the ground grid goes onto the ground for real
    const g = invUI.ground(), items = [...g.grids[0]];
    if (items.length) dropPile(items);
    MS.B.sync(); loot = null;
    say('CLICK TO LOOK', 1.2);
  }
  Mr.openScreen = openScreen; Mr.closeScreens = closeScreens;

  // ================================================================ input
  const held = { fire: false, ads: false };
  const dbg = {};   // debug bridge: held inputs and one-shot presses (headless scenes)
  let presses = [], lookX = 0, lookY = 0, lastR = -1, rPending = null, walkMode = false;
  const active = () => ctx.active() && !Mr.ui;
  if (typeof addEventListener !== 'undefined') {
    addEventListener('mousedown', e => { if (!active() || document.pointerLockElement !== ctx.canvas) return; if (e.button === 0) held.fire = true; if (e.button === 2) held.ads = true; });
    addEventListener('mouseup', e => { if (e.button === 0) held.fire = false; if (e.button === 2) held.ads = false; });
    addEventListener('contextmenu', e => { if (ctx.active()) e.preventDefault(); });
    addEventListener('wheel', e => { if (!active() || document.pointerLockElement !== ctx.canvas) return; const n = R.slots.length; if (n > 1) presses.push('slot' + ((R.slot + (e.deltaY > 0 ? 1 : n - 1)) % n + 1)); }, { passive: true });
  }
  Mr.look = (dx, dy) => { if (Mr.ui) return; const k = SENS / (1 + 0.6 * S.ads); lookX += dx * k; lookY += -dy * k; };
  Mr.key = (code, e) => {
    if (code === 'Tab' || code === 'KeyI') { e?.preventDefault?.(); if (Mr.ui === 'gear') closeScreens(); else if (!MS.dead) openScreen('gear', loot); return true; }
    if (code === 'KeyH') { if (Mr.ui === 'health') closeScreens(); else if (!MS.dead) openScreen('health'); return true; }
    if (Mr.ui) return true;   // the screens have the keyboard
    if (MS.dead) return false;
    const A = { KeyB: 'mode', KeyO: 'charge', KeyU: 'fa', PageUp: 'sightUp', PageDown: 'sightDown', BracketRight: null };
    if ((code === 'KeyG' && e?.shiftKey) || code === 'Semicolon' || code === 'Quote') { throwGrenade('smoke'); return true; }   // CM: M18 smoke (Shift+G, or the aircraft's countermeasure keys)
    if (code === 'KeyG') { if (R.carrier && R.carrier.gl) presses.push('gl'); else throwGrenade(); return true; }   // M203 on / off, or throw an M67
    if (code in A && A[code]) { presses.push(A[code]); return true; }
    if (code === 'KeyT') { presses.push(e?.shiftKey ? 'remedial' : 'ia'); return true; }
    if (code === 'KeyL') { presses.push(e?.shiftKey ? 'checkChamber' : 'checkMag'); return true; }
    if (/^Digit[1-4]$/.test(code) && !e?.shiftKey) { const i = +code.slice(5); if (i <= R.slots.length) { presses.push('slot' + i); return true; } return false; }
    if (code === 'KeyR') {   // R tactical reload (the old magazine back in a pouch), R R speed reload (dropped), LAW: extend / arm
      const now = performance.now();
      if (R.cur && R.cur.key === 'M72A2') presses.push('law');
      else if (now - lastR < 300) { if (rPending) { clearTimeout(rPending); rPending = null; } presses.push('reloadSpeed'); }
      else rPending = setTimeout(() => { presses.push('reload'); rPending = null; }, 300);
      lastR = now; return true;
    }
    if (code === 'KeyC') { presses.push('stance:crouch'); return true; }
    if (code === 'KeyZ') { presses.push('stance:prone'); return true; }
    if (code === 'KeyX') { presses.push('stance:stand'); return true; }
    if (code === 'Space') { presses.push(S.stance === 'stand' ? 'jump' : 'stance:stand'); return true; }
    if (code === 'KeyN') { presses.push('bipod'); return true; }
    if (code === 'ControlLeft' || code === 'CapsLock') { walkMode = !walkMode; say(walkMode ? 'WALK' : 'RUN', 0.8); return true; }
    if (code === 'KeyF' && e?.shiftKey) return Mr.care.cycleHold();   // ngc/infdepth: drag / fireman's carry / put down
    if (code === 'KeyF') { interact(); return true; }
    if (code === 'KeyV') { Mr.view = Mr.view === 'first' ? 'third' : 'first'; say(Mr.view === 'first' ? 'FIRST PERSON' : 'THIRD PERSON', 1); return true; }
    return ['KeyQ', 'KeyE'].includes(code);
  };
  function buildInput(input) {
    const pad = input.pad && !input.keyboardOnly ? input.pad : null;
    let mx = (kd('KeyD') ? 1 : 0) - (kd('KeyA') ? 1 : 0), my = (kd('KeyW', 'ArrowUp') ? 1 : 0) - (kd('KeyS', 'ArrowDown') ? 1 : 0);
    const turn = (kd('ArrowRight') ? 1 : 0) - (kd('ArrowLeft') ? 1 : 0);
    const shift = kd('ShiftLeft', 'ShiftRight');
    const inp = { move: [mx, my], look: [lookX + turn * 2.2 * (input.dt || 0.016), lookY], sprint: shift && S.ads < 0.5, holdBreath: shift && S.ads > 0.5, walk: walkMode,
      lean: (kd('KeyE') ? 1 : 0) - (kd('KeyQ') ? 1 : 0), ads: held.ads, fire: held.fire, actions: [], dive: kd('KeyC') };   // (ngc/waterfish: C held in the water dives)
    lookX = lookY = 0;
    if (pad) {   // left stick moves, right stick looks, RT fires, LT aims, A jump, B crouch, X reload, Y weapon, L3 sprint
      const ax = i => { const v = pad.axes[i] || 0; return Math.abs(v) < 0.15 ? 0 : v; }, b = i => !!pad.buttons[i]?.pressed;
      if (ax(0) || ax(1)) { inp.move = [ax(0), -ax(1)]; inp.walk = Math.hypot(ax(0), ax(1)) < 0.6; }
      inp.look[0] += ax(2) * 2.4 * (input.dt || 0.016); inp.look[1] -= ax(3) * 1.6 * (input.dt || 0.016);
      if ((pad.buttons[7]?.value || 0) > 0.4) inp.fire = true; if ((pad.buttons[6]?.value || 0) > 0.4) inp.ads = true;
      if (b(10)) inp.sprint = true;
      if (b(1)) inp.dive = true;   // ngc/waterfish: B held in the water dives
      const pr = Mr._padPrev ||= {};
      const edge = i => b(i) && !pr[i];
      if (edge(0)) presses.push(S.stance === 'stand' ? 'jump' : 'stance:stand'); if (edge(1)) presses.push('stance:crouch'); if (edge(2)) presses.push('reload'); if (edge(3)) presses.push('slot' + ((R.slot + 1) % R.slots.length + 1));
      for (const i of [0, 1, 2, 3]) pr[i] = b(i);
    }
    for (const p of presses) { if (p.startsWith('stance:')) inp.stance = p.slice(7); else if (p === 'bipod') inp.bipod = true; else if (p === 'jump') inp.jump = true; else inp.actions.push(p); }
    presses = [];
    for (const [k, v] of Object.entries(dbg)) { if (k === 'actions') inp.actions.push(...v); else inp[k] = v; }
    dbg.actions = []; for (const once of ['stance', 'bipod', 'jump', 'look']) delete dbg[once];
    if (Mr.ui) { inp.move = [0, 0]; inp.fire = false; inp.ads = false; inp.sprint = false; inp.look = [0, 0]; inp.actions = inp.actions.filter(a => !/^slot|^reload|^law/.test(a)); }
    return inp;
  }
  Mr.input = o => { Object.assign(dbg, o); return true; };
  Mr.press = (...a) => { dbg.actions = (dbg.actions || []).concat(a); return true; };
  // face (yaw, pitch) at once: body, view and weapon (scenes; spawning)
  Mr.aim = (yaw, pitch = 0) => { S.yaw = S.wYaw = S.aimYaw = S.camYaw = yaw; S.pitch = S.wPitch = S.aimPitch = S.camPitch = pitch; S.wYawV = S.wPitchV = 0; S.pendingYaw = 0; S.dzYaw = S.dzPitch = 0; W.yaw = yaw; W.pitch = pitch; return true; };
  Mr.clearInput = () => { for (const k of Object.keys(dbg)) delete dbg[k]; return true; };

  // F: the nearest crate, pile or body within reach -> the gear screen with it; on a friendly pad / the carrier deck:
  // rearm and resupply
  function nearestLoot(reach = 2.2) {
    let best = null, bd = reach;
    for (const t of [...Mr.crates, ...Mr.piles, ...Mr.bodies, ...Mr.care.bodies(W.x, W.z, reach)]) { const d = Math.hypot(t.x - W.x, t.z - W.z); if (d < bd && Math.abs(t.y - W.y) < 1.6) { bd = d; best = t; } }
    return best;
  }
  Mr.nearestLoot = nearestLoot;
  function interact() {
    if (Mr.care.interact()) return;   // ngc/infdepth: a wounded Marine (treat him), a man you carry next to the Huey
    const t = nearestLoot();
    if (t) { openScreen('gear', t.c); say(`SEARCHING ${t.name}`, 1.5); return; }
    const svc = ctx.serviceAt(W.x, W.z);
    if (svc) { const got = MS.resupply(); say(got.length ? `${svc.name}: ${got.join(', ')}` : `${svc.name}: YOU ARE FULLY STOCKED`, 2.2); A()?.mech('magIn'); return; }
    say('NOTHING HERE  -  F BY A CRATE, A BODY OR ON A FRIENDLY PAD', 1.6);
  }
  Mr.interact = interact;

  // ================================================================ the frame
  // (called from foot.js update): input -> marinesim -> events -> sound, effects, war damage
  Mr.update = (dt, input) => {
    if (worldOf !== war.carrier) stockWorld();
    input.dt = dt;
    const inp = buildInput(input);
    if (MS.dead) { inp.move = [0, 0]; inp.fire = false; inp.actions = []; }
    if (Mr.care.hold) { inp.fire = false; inp.ads = false; inp.sprint = false; inp.actions = inp.actions.filter(a => !/^slot|^reload|^law|^gl/.test(a)); }   // (both hands on the casualty)
    throwInput(inp, dt);   // ngc/infdepth: a grenade in the hand - the rifle is down
    const evs = MS.step(dt, inp, GR);
    Mr.firedT += dt;
    Mr.care.update(dt);
    for (const e of evs) handle(e);
    for (const e of MS.medEvents) medEvent(e);
    incomingCracks(); stepGrenades(dt);
    // shock and bleeding: the vision effects, the strip
    Mr.hitFlash = Math.max(0, Mr.hitFlash - dt * 1.5);
  };
  Mr.afterWar = () => MS.afterWar(GR);
  const dist = (x, y, z) => Math.hypot(x - S.eye.x, y - S.eye.y, z - S.eye.z);
  function handle(e) {
    const a = A();
    if (e.e === 'shot') {
      Mr.firedT = 0; ctx.onFired?.(); Mr.stats.shots++;
      a?.shot({ weapon: e.weapon, dist: 0 });
      flashL.position.set(e.x + e.dir[0] * 0.9, e.y + e.dir[1] * 0.9, e.z + e.dir[2] * 0.9); flashL.intensity = e.weapon === 'M72A2' ? 6 : 2.5;
      if (e.weapon !== 'M72A2' && e.weapon !== 'M203' && Mr.view !== 'first') fx.flash(e.x + e.dir[0] * 0.9, e.y + e.dir[1] * 0.9, e.z + e.dir[2] * 0.9, 0.05);
      if (e.cookoff) say('COOK-OFF  -  THE CHAMBER IS TOO HOT', 2);
    } else if (e.e === 'impact') {
      const kind = e.material === 'water' ? 'water' : ['steel', 'sheet', 'armour'].includes(e.material) ? 'metal' : 'ground';
      fx.impact(e.x, e.y, e.z, kind); Mr.stats.impacts++;
      a?.impact(e.material === 'soil' ? 'soil' : e.material, dist(e.x, e.y, e.z), 0, e.result);
      warHit(e.target, e.round, e.result, e);
    } else if (e.e === 'hit') {   // a soldier figure (an RUNAWAY trooper, a body): hitboxes on the shared skeleton
      fx.impact(e.hit.point[0], e.hit.point[1], e.hit.point[2], 'ground'); Mr.stats.hits++;
      const f = e.target; a?.impact('flesh', dist(...e.hit.point), 0, 'stop');
      if (f && f.alive) { f.hits = (f.hits || 0) + (e.hit.part === 'head' || e.hit.part === 'thorax' ? 2 : 1); if (f.hits >= 2) figureDown(f, e.hit.part); }
    } else if (e.e === 'explode') {
      const i = e.info, big = i.round === 'M72';
      if (!i.dud) { fx.explode(e.x, e.y, e.z, big ? 1.1 : 0.8, { debris: 3 }); war.blast(e.x, e.y, e.z, big ? 5 : 6, big ? 5 : 3, 1); }
      a?.explosion(dist(e.x, e.y, e.z), 0, i.dud ? 0.2 : 1);
      // our own blast near us: fragments
      const d = dist(e.x, e.y, e.z); if (!i.dud && d < 25) for (const h of fragmentHits(big ? 'M72' : 'M433', d, Math.random, { prone: S.stance === 'prone' })) hitMe({ ...h, source: i.name || 'OWN BLAST' });
    } else if (e.e === 'crack') a?.crack(e.miss);
    else if (e.e === 'drop') {
      if (e.item && e.item.inst) dropPile([e.item.inst], 'DROPPED MAGAZINE');
      a?.mech('drop');
    } else if (e.e === 'swap') a?.mech('chargeFwd', 'M1911A1');
    else if (e.e === 'body') {
      const b = e.ev;
      if (b.e === 'footstep') a?.footstep(b.surface === 'metal' ? 'metal' : b.surface, b.gait, b.load, b.stance);
      else if (b.e === 'stance') a?.mech('stance');
      else if (b.e === 'breath' && !b.hold && b.gasp) a?.gasp();
      else if (b.e === 'blown') say('BLOWN  -  YOU NEED A BREATHER', 1.6);
      else if (b.e === 'bipod') a?.mech('bipod');
    } else if (e.e === 'walker') {
      const w = e.ev;
      if (w.e === 'splash') { fx.water?.add?.({ x: W.x, y: 0.1, z: W.z, size: 1.2, grow: 5, a: 0.6, life: 1.2, tile: 1, pow: 1.5 }); sfx.thump?.(0.25); }
      else if (w.e === 'land' && w.v > 3) sfx.thump?.(Math.min(0.5, w.v * 0.04));
      else if (w.e === 'ladder') say(`${w.name}  -  W / S TO CLIMB`, 1.4);
      else if (w.e === 'rung') a?.footstep('metal', 'walk', 10, 'stand');
    } else if (e.e === 'wpn') {
      const v = e.ev, wk = e.weapon, m = MECH[v.e];
      if (m) a?.mech(m, wk);
      if (v.e === 'selector') say(`${wk}: ${String(v.mode).toUpperCase()}`, 1.2);
      else if (v.e === 'sight') say(`${wk} SIGHT: ${String(v.label).toUpperCase()}`, 1.4);
      else if (v.e === 'info') say(`CHAMBER: ${String(v.chamber).toUpperCase()}${v.malf ? '  -  STOPPAGE: ' + (MALF[v.malf] || v.malf) : ''}  ·  MAGAZINE: ${String(v.mag).toUpperCase()}`, 3.5);
      else if (v.e === 'noAmmo') say(`NO ${wk === 'M60' ? 'BELTS' : 'MAGAZINES'} LEFT  -  F AT A CRATE OR A FRIENDLY PAD`, 2);
      else if (v.e === 'stuck') say('CASE STUCK  -  SHIFT+T: REMEDIAL ACTION', 2.5);
      else if (v.e === 'cleared') say('CLEARED', 1);
      else if (v.e === 'backblast') { say('BACKBLAST AREA CLEAR!', 1.2); const bx = Math.sin(S.yaw), bz = Math.cos(S.yaw); for (let i = 1; i <= 3; i++) fx.trail(S.eye.x + bx * i * 1.5, S.eye.y - 0.3, S.eye.z + bz * i * 1.5, 1.6); }
      else if (v.e === 'malf' && v.kind === 'runaway') say('RUNAWAY GUN  -  T: BREAK THE BELT', 2.5);
      else if (v.e === 'empty' || v.e === 'boltLock') say('EMPTY  -  R TO RELOAD', 1);
    }
  }
  // a round of ours arriving at a war.js target: GAME damage by round
  function warHit(t, round, result, e) {
    if (!t || result === 'ricochet') return;
    if (t.gw) {   // ngc/infdepth: a ground-war unit (game level: the ground sim's own tables)
      const GSm = war.ground?.sim; if (!GSm) return;
      const ammo = round === 'M80' || round === 'M62' ? 'm60' : 'm16', hp = round === 'M1911' ? 36 : ammo === 'm60' ? 70 : 60;
      GSm.hitUnit(1, ammo, t.gw, e.x, e.y, e.z, [-e.nx, -e.ny, -e.nz], hp); Mr.stats.gwHits = (Mr.stats.gwHits || 0) + 1;
      if (t.gw.kind === 'marine') say(`CEASE FIRE!  -  YOU HIT ${t.gw.name || 'A MARINE'}`, 2);
      return;
    }
    const k = WAR_DMG[round]; if (!k) return;
    if (t.dims) return;                                   // a hull: small arms do nothing
    if (t.ship) { if (t.ship.side !== 1) war.damage(t, k * 0.4, 1); return; }   // a ship's gun mount
    if (t.side === 1 || t.side === 0) return;             // our own (no friendly fire on war units)
    if (t.I) { war.damage(t, t.kind === 'aa' ? k * 0.7 : k * 0.08, 1); return; }   // AA gun / building
    if (t.p) war.damage(t, k, 1);                         // aircraft, RUNAWAY units
  }
  // supersonic enemy rounds passing close: the crack
  const _pp = new THREE.Vector3();
  function incomingCracks() {
    const a = A(); if (!a) return;
    for (const b of war.proj) {
      if (b.side !== 2 || (b.kind !== 'b' && b.kind !== 'ciws') || b._cr) continue;
      const vx = b.v.x, vy = b.v.y, vz = b.v.z, v2 = vx * vx + vy * vy + vz * vz; if (v2 < 1) continue;
      const k = ((S.eye.x - b.p.x) * vx + (S.eye.y - b.p.y) * vy + (S.eye.z - b.p.z) * vz) / v2;
      if (k > 0.05 || k < -0.05) continue;
      const md = Math.hypot(b.p.x + vx * k - S.eye.x, b.p.y + vy * k - S.eye.y, b.p.z + vz * k - S.eye.z);
      if (md < 6) { b._cr = true; a.crack(md); }
    }
  }
  function medEvent(e) {
    if (e.type === 'unconscious') say('YOU PASS OUT', 2);
    else if (e.type === 'conscious') say('YOU COME TO', 1.5);
    else if (e.type === 'bleed' && e.bleed !== 'light') say(`${e.bleed.toUpperCase()} BLEEDING  -  ${REGION[e.region].name}  -  H: HEALTH`, 2.4);
    else if (e.type === 'treated' || e.type === 'tqApplied') say(FEEDTXT[e.type](e), 1.8);
    else if (e.type === 'fracture') say(`FRACTURE: ${e.name}`, 2);
  }

  // ================================================================ incoming fire
  function hitMe(h) {
    const r = MS.hit(h);
    if (!r) return null;
    Mr.hitFlash = Math.min(1, Mr.hitFlash + (r.penetrated ? 0.8 : 0.4));
    sfx.hit?.() ?? sfx.boom?.(0.15);
    return r;
  }
  // war.js: hurtPlayer(amount, why, at, dir, kind) -> foot.hurt -> here. at: where the round passed him, dir: its
  // velocity, kind: the war.js projectile kind ('b' WASP bolt, 'ciws', 'jb', 'flak', 'blast', 'shell', ...)
  Mr.hurt = (amount, why, at, dir, kind) => {
    if (MS.dead) return;
    const spec = INCOMING[kind];
    if (at && spec) {
      const part = hitZone(at, W.x, W.y, W.z, S.yaw, S.stance, W.tall);
      const d = dir ? [dir.x, dir.y, dir.z] : [0, 0, -1], n = Math.hypot(...d) || 1;
      const r = hitMe({ ...spec, part, dir: [d[0] / n, d[1] / n, d[2] / n], source: spec.source || why });
      if (r) say(`HIT  -  ${REGION[r.region].name}${r.penetrated ? '' : '  (STOPPED BY ARMOUR)'}${r.bleed && r.bleed !== 'light' ? '  -  ' + r.bleed.toUpperCase() + ' BLEEDING' : ''}`, 2);
      return;
    }
    if (why === 'LASER') {   // the RW-5 lance: a burn where it touches (no bleed: cauterised)
      const part = ['thorax', 'stomach', 'armL', 'armR'][Math.floor(Math.random() * 4)];
      M.damage(part, amount * 300); Mr.hitFlash = 1; say(`LASER BURN  -  ${REGION[part].name}`, 1.6); return;
    }
    // flak, blasts, shells, missiles, crew hits in a vehicle: fragments, more the closer (amount)
    const preset = kind === 'flak' ? 'RWB' : why === 'MISSILE' ? 'M72' : amount > 0.3 ? 'ART' : 'M406';
    const distM = clamp(14 * (1 - (amount - 0.1) / 0.35), 1.5, 14);
    const hs = fragmentHits(preset, distM, Math.random, { prone: S.stance === 'prone' });
    let worst = null; for (const h of hs) { const r = hitMe({ ...h, source: why }); if (r && (!worst || r.hp > worst.hp)) worst = r; }
    if (worst) say(`${why}  -  ${hs.length} FRAGMENT${hs.length > 1 ? 'S' : ''}  -  ${REGION[worst.region].name}`, 2); else say(`${why}  -  CLOSE`, 1.2);
    fx.shake = Math.min(1.5, (fx.shake || 0) + 0.4);
  };
  // the life cycle: foot.js asks
  Mr.isDead = () => MS.dead;
  Mr.cause = () => MS.cause || 'KILLED';
  Mr.onDeath = () => { closeScreens(); Mr.care.exit(); leaveBody(); Mr.needsFresh = true; Mr.view = 'third'; };
  Mr.spawned = fresh => {
    if (fresh || Mr.needsFresh) { MS.reset(); Mr.needsFresh = false; vm.lawLines = lawW()?.lawLines?.(); }
    S.place(W.x, W.y, W.z, W.yaw, 'stand'); Mr.view = 'first'; held.fire = held.ads = false;
  };
  Mr.exit = () => { closeScreens(); Mr.care.exit(); throwCancel(); me.root.visible = false; tracers.visible = false; if (medHud) medHud.el.style.display = 'none'; if (vision) vision.update({ vision: { tunnel: 0, grey: 0, blur: 0, blackout: 0 } }); if (Mr.flashEl) Mr.flashEl.style.opacity = 0; held.fire = held.ads = false; };

  // ================================================================ views
  Mr.firstPerson = () => Mr.view === 'first' && !MS.dead;
  Mr.fov = ckFov => Mr.firstPerson() ? vm.fov(ckFov, S.ads) : ckFov;
  const _e = new THREE.Euler();
  Mr.camera = (cam, dt) => {
    if (Mr.firstPerson()) {
      // ngc/infdepth: breath and effort in the head, not just the rifle: the chest rises with each breath (deeper and
      // faster as soldier.js's breathing follows the oxygen debt), blown he sways and his head drops on the exhale, a
      // pounding heart (MEDINV / soldier.js HR) knocks the view on each beat. Less on the sights (the cheek weld).
      const k = 1 - 0.75 * S.ads, br = Math.sin(S.breathPhase), dp = S.breathDepth, blown = clamp(1 - S.staminaFrac / 0.35, 0, 1), ex = S.exertion;
      const hb = S.hr > 120 ? Math.pow(Math.max(0, Math.sin((Mr.hbPh = ((Mr.hbPh || 0) + dt * S.hr / 60 * Math.PI * 2) % (Math.PI * 2)))), 12) * clamp((S.hr - 120) / 60, 0, 1) : 0;
      const dy = br * dp * (0.006 + 0.012 * ex) * k - blown * 0.02 * (0.5 - 0.5 * br) * k, dpitch = br * dp * (0.0025 + 0.006 * ex) * k - blown * 0.012 * (0.5 - 0.5 * br) * k - hb * 0.0025, droll = Math.sin(S.breathPhase * 0.5) * blown * 0.006 * k;
      cam.position.set(S.eye.x, S.eye.y + dy, S.eye.z);
      cam.quaternion.setFromEuler(_e.set(S.camPitch + dpitch, S.camYaw, S.camRoll + droll, 'YXZ'));
      Mr.breathCam = { dy, dpitch, droll, hb };
      return;
    }
    const dead = MS.dead, back = dead ? 4.5 : 2.6, side = dead ? 0 : 0.6, yaw = S.camYaw, pitch = dead ? -0.9 : S.camPitch;
    const ex = S.pos.x, ey = dead ? W.y + 0.5 : S.eye.y + 0.35, ez = S.pos.z;
    cam.position.set(ex + Math.sin(yaw) * Math.cos(pitch) * back + Math.cos(yaw) * side, ey - Math.sin(pitch) * back + (dead ? 0 : 0.15), ez + Math.cos(yaw) * Math.cos(pitch) * back - Math.sin(yaw) * side);
    GR.clearView(ex, ey, ez, cam.position, null);
    const gy = GR.floor(cam.position.x, cam.position.z, cam.position.y, 50); if (gy !== Infinity && cam.position.y < gy + 0.3) cam.position.y = gy + 0.3;
    if (dead) cam.lookAt(ex, W.y + 0.2, ez); else cam.quaternion.setFromEuler(_e.set(pitch - 0.1, yaw, 0, 'YXZ'));
  };
  let vmOn = false;
  Mr.render = (dt, time, fp, exists) => {
    hudParts();
    for (const t of Mr.crates) placeThing(t); for (const t of Mr.piles) placeThing(t); for (const f of Mr.figures) if (f.ship) placeThing(f);
    flashL.intensity *= Math.exp(-dt * 40);
    if (!exists) { vmOn = false; me.root.visible = false; tracers.visible = false; return; }
    // third-person body (and the figure his own rounds must not hit)
    const tp = !fp;
    me.root.visible = tp && !MS.dead;
    if (me.root.visible) {
      me.root.position.set(S.pos.x, S.pos.y, S.pos.z); me.root.rotation.y = S.yaw;
      const key = R.carrier ? (R.carrier.key === 'M16A1' && R.carrier.gl ? 'M16A1/M203' : R.carrier.key) : null; if (me.weaponKey !== key) me.setWeapon(key);
      const p = S.pose(); p.cls = R.cls === 'gl' ? 'rifle' : R.cls; p.action = R.cur && R.cur.act ? { name: R.cur.act.name, p: R.cur.act.t / R.cur.act.dur } : null;
      // ngc/infdepth: hands off the rifle (slung on the back): bent over a casualty on the drag strap, under one in a
      // fireman's carry, or the grenade drill (carepose.js); the grenade in the right hand until it leaves it
      p.hands = null; p.sling = 0;
      if (Mr.care.hold) { p.ads = 0; p.sling = 1; p.hands = careHands(Mr.care.hold.mode, 0, p.gaitPhase || 0); if (Mr.care.hold.mode === 'drag') { p.stance = p.stanceFrom = p.stanceTo = 'crouch'; p.stanceT = 1; } }
      else if (TH && TH.phase !== 'recover') { p.ads = 0; p.sling = 1; p.hands = throwHands(TH.phase, TH.p, TH.under); }
      p.grenade = !!TH && TH.phase !== 'recover' && !(TH.phase === 'throw' && TH.gone);   // (in his right hand in third person, through the drill)
      if (W.swim) { p.stance = p.stanceFrom = p.stanceTo = 'prone'; p.stanceT = 1; }
      poseSkeleton(me, p, dt);
    }
    // first person: arms and weapon (own pass, see overlay)
    vmOn = fp && !MS.dead && !W.ladder && !W.swim;
    // (the viewmodel's springs are explicit: at low frame rates they would blow up, so they are stepped at <= 1/60 s)
    if (vmOn) { let t = dt; while (t > 1e-6) { const h = Math.min(t, 1 / 60); vm.update(h, R); TV.update(h, TH ? { kind: TH.kind, phase: TH.phase, p: Math.min(1, TH.p), under: TH.under, cooked: TH.cooked, smokeCol: TH.T && M18_COL[TH.T.smoke] } : null, !!Mr.care.hold); t -= h; } if (!Number.isFinite(vm.lag.x + vm.lag.y + vm.kick.z + vm.kick.p)) { Object.assign(vm.lag, { x: 0, y: 0, vx: 0, vy: 0 }); Object.assign(vm.kick, { z: 0, zv: 0, p: 0, pv: 0 }); } }
    // tracers
    let nT = 0;
    for (const P of R.projectiles) {
      if (!P.tracer || P.dist < 12 || P.dist > (P.round.tracer || 900) || nT >= 200) continue;
      const k = Math.max(0.3, Math.min(1, 14 / Math.max(1, Math.hypot(P.x - P.px, P.y - P.py, P.z - P.pz))));
      tracerPos.set([P.x - (P.x - P.px) * k, P.y - (P.y - P.py) * k, P.z - (P.z - P.pz) * k, P.x, P.y, P.z], nT * 6); nT++;
    }
    tracerGeo.setDrawRange(0, nT * 2); tracerGeo.attributes.position.needsUpdate = true; tracers.visible = nT > 0;
    // breathing, heartbeat
    A()?.body({ phase: S.breathPhase, depth: S.breathDepth, rate: S.breathRate, held: S.holdBreath, hr: S.hr });
    // the medical strip, vision (shock, blood loss, concussion), the red flash of a hit
    if (medHud) { medHud.el.style.display = ''; medHud.update(); }
    if (vision && MS.mods.med) vision.update(MS.mods.med);
    if (Mr.flashEl) Mr.flashEl.style.opacity = Mr.hitFlash.toFixed(2);
  };
  Mr.overlay = (renderer, cam) => { if (vmOn) vm.render(renderer, cam); };

  // ================================================================ hand grenades (G): the M67 from the rig
  // Game level: thrown at ~14 m/s along the view (a little lofted), 4.5 s fuse (FM 3-23.30: 4-5.5 s), bounces and
  // rolls, then MEDINV's fragment table for anyone near (him too) and war.blast for the war's units.
  const grenades = [], grenGeo = new THREE.SphereGeometry(0.045, 8, 6).scale(1, 1.25, 1), grenMat = new THREE.MeshLambertMaterial({ color: 0x4d5636 });
  // CM (ngc/cmpolish): kind 'smoke' throws an M18 from the rig instead: it pops after ~1.5 s and pours coloured smoke for
  // its burn time (items.js: 60 s; FM 3-23.30: 50-90 s); cm.js turns the plume into sight-blocking spheres
  const M18_COL = { green: [0.42, 0.62, 0.36], red: [0.78, 0.3, 0.26], yellow: [0.85, 0.78, 0.3], violet: [0.55, 0.38, 0.68] };
  const smokeGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.145, 10), smokeMat = new THREE.MeshLambertMaterial({ color: 0x5c6448 });
  // ngc/infdepth: THE THROW AS A DRILL (FM 3-23.30) instead of a grenade out of the rig at once. G (Shift+G: an M18):
  // draw from the pouch, pull the pin (the left forefinger in the ring), cock the arm back - and throw when G is let go.
  // HOLD G past the pin and you COOK it: the spoon flies, the 4.5 s fuse burns in your hand (count it: the HUD does),
  // let go to throw; too long and it goes off in your hand. RMB held: an underhand lob (shorter, lower). The M18 burns
  // from the moment it leaves the hand (no cooking). The viewmodel shows all of it (throwvm.js); the grenade leaves the
  // hand where the hand is at the release, with his own velocity added.
  const TH_T = { frag: { draw: 0.55, pin: 0.45, throw: 0.34, recover: 0.5 }, smoke: { draw: 0.45, pin: 0.35, throw: 0.34, recover: 0.45 } };
  const TV = createThrowVM(vm); Mr.TV = TV;
  let TH = null;
  function throwGrenade(kind = 'frag') {
    if (MS.dead || W.swim || W.ladder || TH || Mr.care?.hold) return null;
    const smoke = kind === 'smoke', it = I.find(MS.inv, o => smoke ? !!ITEMS[o.id]?.throwable?.smoke : o.id === 'm67');
    if (!it) { say(smoke ? 'NO SMOKE GRENADES' : 'NO GRENADES', 1.2); return null; }
    I.detach(it);
    TH = { kind, item: it, T: smoke ? ITEMS[it.id].throwable : null, phase: 'draw', t: 0, p: 0, cook: 0, cooked: false, held: true, under: false };
    if (smoke) Mr.stats.smokes = (Mr.stats.smokes || 0) + 1;
    return TH;
  }
  Mr.throwGrenade = throwGrenade; Mr.grenades = grenades;
  Mr.throwState = () => TH;
  function throwCancel() { if (TH && TH.phase !== 'recover' && TH.phase !== 'throw' && !TH.cooked) I.autoStore(MS.inv, TH.item); TH = null; }   // (pin back in: into the rig)
  const _rel = new THREE.Vector3(), _qe = new THREE.Euler(), _qq = new THREE.Quaternion();
  function throwInput(inp, dt) {
    if (!TH) return;
    if (MS.dead || W.swim || W.ladder) { throwCancel(); return; }
    const D = TH_T[TH.kind];
    TH.held = !!(kd('KeyG') || dbg.throwHeld);
    TH.under = TH.under || (TH.phase === 'ready' || TH.phase === 'cook') && (held.ads || !!dbg.ads);
    inp.fire = false; inp.ads = false; inp.sprint = false; inp.actions = inp.actions.filter(a => !/^slot|^reload|^law|^gl/.test(a));
    if (Mr.freezeThrow) return;   // (scenes: hold a phase for the camera)
    TH.t += dt;
    const next = (ph, a) => { TH.phase = ph; TH.t = 0; if (a) a(); };
    if (TH.phase === 'draw') { TH.p = TH.t / D.draw; if (TH.t >= D.draw) next('pin'); }
    else if (TH.phase === 'pin') { TH.p = TH.t / D.pin; if (TH.t >= D.pin) next('ready', () => A()?.mech('pin')); }
    else if (TH.phase === 'ready') {
      TH.p = TH.t;
      if (!TH.held) next('throw');
      else if (TH.kind === 'frag' && TH.t > 0.4) next('cook', () => { TH.cooked = true; TV.spoon(); A()?.mech('click'); say('SPOON OFF  -  COOKING', 0.8); });
    } else if (TH.phase === 'cook') {
      TH.p = TH.t; TH.cook += dt;
      if (TH.cook >= 4.5) { const h = handWorld(); TH = null; detonate({ x: h.x, y: h.y, z: h.z }, 'COOKED OFF IN HIS HAND'); return; }
      if (!TH.held) next('throw');
    } else if (TH.phase === 'throw') {
      TH.p = TH.t / D.throw;
      if (!TH.gone && TH.p >= (TH.under ? 0.62 : 0.55)) { TH.gone = true; release(); }
      if (TH.t >= D.throw) next('recover');
    } else if (TH.phase === 'recover') { TH.p = TH.t / D.recover; if (TH.t >= D.recover) TH = null; }
  }
  // the hand in the world (camera space -> world through the view)
  function handWorld() {
    _rel.copy(TV.rel); if (!Number.isFinite(_rel.x) || _rel.lengthSq() < 1e-6) _rel.set(0.15, 0.1, -0.4);
    _qq.setFromEuler(_qe.set(S.camPitch, S.camYaw, S.camRoll, 'YXZ'));
    return _rel.applyQuaternion(_qq).add(new THREE.Vector3(S.eye.x, S.eye.y, S.eye.z));
  }
  function release() {
    const smoke = TH.kind === 'smoke', under = TH.under, lift = under ? 0.38 : 0.25, v = under ? 8 : smoke ? 13 : 14;
    const cp = Math.cos(S.camPitch + lift), d = [-Math.sin(S.camYaw) * cp, Math.sin(S.camPitch + lift), -Math.cos(S.camYaw) * cp];
    const h = Mr.firstPerson() ? handWorld() : { x: S.eye.x + d[0] * 0.4, y: S.eye.y + 0.1, z: S.eye.z + d[2] * 0.4 };
    if (smoke) {
      const T = TH.T, g = { smoke: T, x: h.x, y: h.y, z: h.z, vx: d[0] * v + (W.vx || 0), vy: d[1] * v, vz: d[2] * v + (W.vz || 0), fuse: T.fuseS ?? 1.5, burn: T.burnS ?? 60, mesh: new THREE.Mesh(smokeGeo, smokeMat) };
      scene.add(g.mesh); grenades.push(g); A()?.mech('pin'); say(`SMOKE OUT  -  M18 ${String(T.smoke).toUpperCase()}`, 1.2); Mr.lastThrow = g; return g;
    }
    const g = { x: h.x, y: h.y, z: h.z, vx: d[0] * v + (W.vx || 0), vy: d[1] * v, vz: d[2] * v + (W.vz || 0), fuse: 4.5 - TH.cook, cooked: TH.cook, mesh: new THREE.Mesh(grenGeo, grenMat) };
    scene.add(g.mesh); grenades.push(g); say(TH.cook > 0 ? `FRAG OUT  -  COOKED ${TH.cook.toFixed(1)} S` : 'FRAG OUT', 1); Mr.lastThrow = g; Mr.stats.throws = (Mr.stats.throws || 0) + 1;
    return g;
  }
  const throwHint = () => !TH ? null : TH.phase === 'cook' ? `COOKING  ${TH.cook.toFixed(1)} S OF 4.5  -  LET GO OF G TO THROW` : TH.phase === 'ready' ? `PIN PULLED  -  LET GO OF G TO THROW, HOLD TO COOK${TH.kind === 'frag' ? '' : ''}  ·  RMB: UNDERHAND` : TH.phase === 'draw' || TH.phase === 'pin' ? (TH.kind === 'smoke' ? 'M18: PULLING THE PIN' : 'M67: SAFETY CLIP OFF, PULLING THE PIN') : null;
  function stepGrenades(dt) {
    for (let i = grenades.length - 1; i >= 0; i--) {
      const g = grenades[i]; g.fuse -= dt;
      g.vy -= 9.81 * dt; g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
      const fl = surfH(g.x, g.z);
      if (g.y < fl + 0.05) { g.y = fl + 0.05; if (g.vy < 0) g.vy = -g.vy * 0.3; g.vx *= 0.6; g.vz *= 0.6; if (Math.abs(g.vy) < 0.5) g.vy = 0; }
      g.mesh.position.set(g.x, g.y, g.z); g.mesh.rotation.x += dt * (Math.hypot(g.vx, g.vz) > 0.3 ? 8 : 0);
      if (g.smoke) {   // CM: an M18 - pops, then pours smoke until it burns out (the canister stays where it lies)
        if (g.fuse <= 0 && !g.src) { g.src = addSmoke(g.x, g.y, g.z, { burn: g.burn, col: M18_COL[g.smoke.smoke] || M18_COL.green }); Mr.lastSmoke = g.src; sfx.noiseBurst?.(3000, 900, 0.5, 0.12 * Math.max(0.1, 1 - dist(g.x, g.y, g.z) / 60)); }
        if (g.src) { g.src.x = g.x; g.src.y = g.y; g.src.z = g.z; }
        if (g.fuse < -g.burn - 2) { scene.remove(g.mesh); grenades.splice(i, 1); }
        continue;
      }
      if (g.fuse > 0) continue;
      scene.remove(g.mesh); grenades.splice(i, 1);
      detonate(g);
    }
  }
  // an M67 bursting at g (thrown, or cooked off in the hand)
  function detonate(g, why) {
    {
      Mr.stats.booms = (Mr.stats.booms || 0) + 1; Mr.lastBoom = { x: g.x, y: g.y, z: g.z, why };
      if (why) say(why, 2);
      const wet = ctx.terrainH(g.x, g.z) < 0 && g.y < 0.3 && GR.deckH(g.x, g.z) < -1e8;
      if (wet) fx.splash?.(g.x, g.z, 0.8); else fx.explode(g.x, g.y, g.z, 0.9, { debris: 3 });
      war.blast(g.x, g.y, g.z, 8, 4, 1);
      const d = dist(g.x, g.y, g.z);
      A()?.explosion(d, 0, wet ? 0.4 : 1);
      if (!wet && d < 30) for (const h of fragmentHits('M67', d, Math.random, { prone: S.stance === 'prone' })) hitMe({ ...h, source: 'M67 FRAG' });
      if (!wet) for (const f of Mr.figures) { const fd = Math.hypot(f.x - g.x, f.z - g.z); if (f.alive && fd < 9 && fragmentHits('M67', fd, Math.random).length) figureDown(f, 'fragments'); }
      fx.shake = Math.min(1.5, (fx.shake || 0) + Math.max(0, 0.8 - d / 30));
    }
  }

  // ================================================================ HUD
  Mr.hud = () => {
    const st = R.status(), w = R.cur, mods = MS.mods.med || {};
    const fit = w && w.def.fit, mags = fit ? I.findAll(MS.inv, (o, d) => !!d.mag && I.magCount(o) > 0 && MS.B.view(o)?.fit === fit && !I.isWithin(o, MS.inv.slots.primary || {}) && !I.isWithin(o, MS.inv.slots.holster || {})).length : 0;
    const known = st.known ? `MAG ${String(st.known.mag).toUpperCase()}` : 'MAG UNCHECKED (L)';
    const weap = w ? `${st.weapon}${st.glMode ? ' (M203)' : ''}  ${String(st.mode || '').toUpperCase()}  ·  ${String(st.sight || '').toUpperCase()}  ·  ${st.busy ? String(st.busy).toUpperCase() + '...' : known}${st.malfKnown ? '  ·  STOPPAGE: ' + (MALF[st.malfKnown] || st.malfKnown) : ''}${fit ? `  ·  ${mags} ${fit === 'M60-belt' ? 'BELTS' : 'MAGS'}` : ''}` : 'UNARMED';
    const posture = W.swim ? 'SWIMMING' : W.ladder ? 'ON A LADDER' : S.stance === 'prone' ? 'PRONE' : S.stance === 'crouch' ? 'KNEELING' : S.sprinting ? 'SPRINTING' : walkMode ? 'WALKING' : 'STANDING';
    const deck = W.plat ? (W.plat.type === 'carrier' ? (W.plat.side === 1 ? 'ALBATROSS' : 'KRAKEN') : W.plat.type.toUpperCase()) + '  ·  ' : '';
    const line = `${posture}${S.bipod ? ' (BIPOD)' : S.rested ? ` (RESTED${MS.restKind ? ' ON ' + ({ ledge: 'A LEDGE', wall: 'A WALL', left: 'A WALL, LEFT', right: 'A WALL, RIGHT' })[MS.restKind] : ''})` : ''}  ·  ${deck}${S.load.toFixed(0)} kg  ·  HR ${Math.round(S.hr)}${mods.unconscious ? '  ·  UNCONSCIOUS' : ''}`;
    let hint = '', tip = false;
    const lt = !MS.dead && nearestLoot(), thr = throwHint();
    if (MS.dead) hint = MS.cause || 'KILLED';
    else if (Mr.ui === 'patient') hint = 'BUDDY AID: DRAG AN ITEM FROM YOUR KIT ONTO HIM  ·  ESC CLOSE';
    else if (Mr.ui) hint = 'TAB GEAR  ·  H HEALTH  ·  ESC CLOSE';
    else if (Mr.care.hint()) hint = Mr.care.hint();   // ngc/infdepth: casualties, carrying, a corpsman on you
    else if (thr) hint = thr;
    else if (lt) hint = `F: SEARCH ${lt.name}`;
    else if (ctx.serviceAt(W.x, W.z) && (I.countRounds(MS.inv, '556') < 200 || !MS.inv.slots.secondary)) hint = 'F: REARM AND RESUPPLY HERE';
    else if (W.ladder) hint = `${W.ladder.name}  -  W / S TO CLIMB, SPACE TO LET GO`;
    else if (W.swim) hint = W.y < -2 ? `UNDER WATER  -  BREATH ${Math.ceil(W.breath)} S  ·  LET GO OF C TO SURFACE` : 'SWIMMING  -  HOLD C TO DIVE  ·  MAKE FOR A BEACH OR THE ALBATROSS STERN LADDER';   // (ngc/waterfish)
    else { tip = true; hint = 'CLICK: LOOK  ·  LMB FIRE  ·  RMB AIM  ·  R RELOAD  ·  TAB GEAR  ·  H HEALTH  ·  F USE  ·  C / Z STANCE  ·  Q / E LEAN'; }
    return { line, hint, tip, weap, fuel: S.staminaFrac * 100, fuelLabel: 'STAMINA' };
  };
  Mr.pl = { detect: () => ({ stand: 0.45, crouch: 0.32, prone: 0.18 })[S.stanceT < 1 ? S.stanceTo : S.stance] + (S.sprinting ? 0.12 : 0) + (Mr.firedT < 3 ? 0.25 : 0) };
  Mr.stockWorld = stockWorld; Mr.I = I;
  Mr.stats = { shots: 0, impacts: 0, hits: 0, downs: 0 };
  // a standing soldier figure on the 17-bone skeleton: a RUNAWAY machine-crewed trooper in seized modern kit (or a
  // Marine). Hit twice (once in the head or chest) he goes down and his kit is lootable. Scenes, and the start of a
  // home for the ground-war agent's squads: { sk, alive, side, x, y, z, yaw, c (inventory root) }
  Mr.addFigure = (x, y, z, yaw = 0, o = {}) => {
    const sk = buildMarine({ seed: 7 + Mr.figures.length, weapon: o.weapon === undefined ? 'M16A1' : o.weapon, camo: o.camo || 'og107', pack: false });
    const f = { sk, alive: true, side: o.side ?? 2, kind: 'body', name: o.name || 'RW TROOPER', x, y, z, yaw, mesh: sk.root, c: o.kit || Object.assign(I.loadoutRW(Math.random), { name: o.name || 'RW TROOPER (MACHINE-CREWED)' }) };
    I.hideContents(f.c);
    if (o.ship) { const l = GR.toShip(o.ship, x, y, z, {}); f.ship = o.ship; f.local = [l.x, l.y, l.z]; f.yaw = yaw - o.ship.yaw; }
    scene.add(sk.root); placeThing(f); if (!f.ship) sk.root.rotation.y = yaw;
    poseSkeleton(sk, { stance: 'stand', stanceFrom: 'stand', stanceTo: 'stand', stanceT: 1, speed: 0, gait: 'idle', gaitPhase: 0, lean: 0, ads: o.ads ?? 0.6, lower: 0, aimPitch: 0, aimYaw: 0, headYaw: 0, headPitch: 0, moveF: 0, moveR: 0, breath: 0, cls: 'rifle' }, 1);
    sk.root.updateMatrixWorld(true);
    Mr.figures.push(f); return f;
  };
  function figureDown(f, part) {
    f.alive = false; Mr.stats.downs++;
    poseSkeleton(f.sk, { stance: 'stand', stanceFrom: 'stand', stanceTo: 'stand', stanceT: 1, down: true, speed: 0, gait: 'idle', gaitPhase: 0, lean: 0, ads: 0, lower: 1, aimPitch: 0, aimYaw: 0, headYaw: 0, headPitch: 0, moveF: 0, moveR: 0, breath: 0, cls: 'rifle' }, 1);
    f.sk.root.updateMatrixWorld(true); f.sk.setWeapon?.(null);
    Mr.bodies.push(f); feed?.(`${f.name} DOWN (${String(part).toUpperCase()})`, 'good');
  }
  Mr.care = createMarineCare(Mr, ctx);   // ngc/infdepth
  return Mr;
}
