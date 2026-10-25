// BB-64: the task force's capital ship, the counterpart of the RUNAWAY's RW-9 LEVIATHAN. An Iowa-class fast battleship
// called back early from the reserve fleet (a fictional 1980 reactivation, ahead of the real 1982-88 ones) and given
// the refit she got in the eighties: the long clipper bow and sheer, three triple 16-inch/50 turrets (two forward,
// one aft) that train and elevate, the conning tower under the tower bridge, two funnels, the foremast with an
// SPS-49 air-search antenna, the mainmast with TACAN, six twin 5-inch/38 mounts (the four after ones landed for the
// missiles), armored box launchers (Tomahawk) and Harpoon canisters, Phalanx CIWS, SLQ-32 boxes on the tower, a
// teak deck, haze grey, the hull number in white with a black shadow, rust weeping from the hawse pipes and scuppers.
//
// Built at the game's capital-ship size (104 x 13 m: an Iowa at ~0.385 scale like the carriers are scaled; people
// real size), the Iowa's own proportions. x starboard, y up (0 = waterline), z aft, bow at -z. Game-level visuals
// and behaviour only (bible section 3).
// Deck contract (war.js deckY via parts.localDeck): main deck 3.4 amidships (DECK), rising with the sheer to 5.6 at
// the stem, 3.0 at the stern; the 01 / 02 levels 4.5 / 5.5, turret roofs, the tower top. dims = { L: 104, W: 13, DECK: 3.4 }.
import * as THREE from 'three';
import { Kit, T, DEG, rng, hullMat, glowMat, canvasTex, DecalSheet, drawText, drawStreak } from './navkit.js';
import { buildPhalanx, buildSeaSparrow } from './mounts.js';

export const IOWA = { L: 104, W: 13, DECK: 3.4 };
const { DECK } = IOWA;
const HAZE = 0x7e878f, HAZE_D = 0x6c757d, HAZE_L = 0x8a939a, DECKG = 0x575c60, DARK = 0x2b2e32, BLACK = 0x161718;
const WHITE = 0xe2e2dc, GLASS = 0x1c2a33, CANVAS = 0xc4c0ae, STEEL = 0x3a3d40;
const L1 = DECK + 1.1, L2 = DECK + 2.1;   // the 01 and 02 levels' roofs

// main deck height at z: the sheer rises to the stem, falls a little to the stern
export function deckY(lz) {
  if (lz < -14) return DECK + 2.2 * Math.pow(Math.min(1, (-14 - lz) / 38.5), 1.6);
  if (lz > 28) return DECK - 0.4 * Math.min(1, (lz - 28) / 24.5);
  return DECK;
}
// half-width of the main deck (a long fine bow, a round stern) and of the hull at the waterline
export function deckHalf(lz) {
  if (lz < -52.5 || lz > 52.6) return 0;
  if (lz < -8) return 6.5 * Math.max(0, 1 - Math.pow((-8 - lz) / 44.5, 1.8));
  if (lz > 30) return 6.5 * Math.sqrt(Math.max(0, 1 - ((lz - 30) / 22.6) ** 2));
  return 6.5;
}
export function waterHalf(lz) {
  if (lz < -49.2 || lz > 50) return 0;
  if (lz < -8) return 6.2 * Math.max(0, 1 - Math.pow((-8 - lz) / 41.2, 1.6));
  if (lz > 28) return 6.2 * Math.sqrt(Math.max(0, 1 - ((lz - 28) / 22) ** 2));
  return 6.2;
}
// the turrets: deck position (z), the height of the turret base (barbette top) and whether it faces aft
export const TURRETS = [{ z: -28.0, y: deckY(-28) + 0.25, aft: false }, { z: -21.9, y: 5.75, aft: false }, { z: 20.5, y: DECK + 0.25, aft: true }];
const TH = 1.6;   // turret roof above its base
// standing surfaces: [x0, x1, z0, z1, top]
const STANDS = [
  [-4.4, 4.4, -16.3, 14, L1], [-2.4, 2.4, -15.8, 12.5, L2], [-2.2, 2.2, -13, -6, DECK + 3.3], [-2.1, 2.1, -14.3, -8, DECK + 5.7],
  [-1.8, 1.8, 7.8, 11.5, DECK + 3.1],
];
export function localDeck(lx, lz) {
  let h = -1e9;
  if (Math.abs(lx) < deckHalf(lz) - 0.05) h = deckY(lz);
  for (const [x0, x1, z0, z1, y] of STANDS) if (lx > x0 && lx < x1 && lz > z0 && lz < z1) h = Math.max(h, y);
  for (const t of TURRETS) if (Math.hypot(lx, lz - t.z) < 2.4) h = Math.max(h, t.y + TH);
  return h;
}

// ------------------------------------------------------------------------------------------------- hull
function bottomY(z) {
  if (z < -46) { const a = -46 - z; return a < 3.2 ? -4.2 + a / 3.2 * 4.2 : Math.min(deckY(-52.5), (a - 3.2) / 3.3 * deckY(-52.5)); }
  if (z > 40) return z < 50 ? -4.2 + (z - 40) / 10 * 3.6 : Math.min(deckY(52) - 0.5, -0.6 + (z - 50) / 2.6 * (deckY(52) - 0.1));
  return -4.2;
}
function hull(kit) {
  const zs = [52.6, 52.2, 51.4, 50.2, 48.5, 46, 43, 40, 34, 28, 20, 10, 0, -8, -14, -20, -26, -32, -37, -41, -44, -46, -47.6, -49.2, -50.6, -51.7, -52.5];
  const rings = zs.map(z => {
    const dh = Math.max(0.02, deckHalf(z)), wl = waterHalf(z), top = deckY(z), yb = bottomY(z);
    let pts = [[0, -4.2], [Math.max(0, wl - 1.7), -4.2], [Math.max(0, wl - 0.3), -3.7], [wl, -2.2], [wl, 0], [wl + (dh - wl) * 0.4, top * 0.5], [dh, top]];
    pts = pts.map(([x, y], i) => {
      if (i > 5 || yb <= -4.2) return [x, y];
      if (y < yb) return [0.01, yb];
      return [x * Math.min(1, 0.12 + (y - yb) / 3.4), y];
    });
    return pts.map(([x, y]) => [x, y, z]);
  });
  for (const sd of [1, -1]) { let R = rings.map(r => r.map(([x, y, z]) => [x * sd, y, z])); if (sd < 0) R.reverse(); kit.loft(R, HAZE); }
  // the bulbous forefoot (mostly under water), the twin skegs and rudders, the stern anchor's pocket
  kit.add(new THREE.SphereGeometry(1, 10, 6), HAZE, T(0, -3.0, -46.3, 0, 0, 0, 0.9, 1.1, 2.6));
  for (const sd of [-1, 1]) { kit.box(0.3, 2.6, 6, HAZE_D, sd * 2.4, -2.9, 42); kit.box(0.35, 2.4, 2.0, HAZE_D, sd * 1.6, -2.6, 47.6); }
  return rings;
}
// the teak deck: one textured strip mesh that follows the sheer; planks run fore and aft, a helicopter spot aft
const DX = 6.6, DZ0 = -52.6, DZ1 = 52.8;
function deckTexture() {
  return canvasTex(256, 2048, (x, w, h) => {
    const r = rng(17), pz = z => (z - DZ0) / (DZ1 - DZ0) * h, px = xx => (xx + DX) / (2 * DX) * w;
    x.fillStyle = '#9c8463'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { const g = r(); x.fillStyle = `rgba(${120 + g * 50 | 0},${100 + g * 40 | 0},${72 + g * 30 | 0},0.35)`; x.fillRect(r() * w, r() * h, 8 + r() * 50, 20 + r() * 140); }
    // planks: a seam every 0.3 m, butt joints staggered
    x.fillStyle = 'rgba(40,32,24,0.55)'; for (let xx = -DX; xx < DX; xx += 0.3) x.fillRect(px(xx), 0, 1, h);
    for (let xx = -DX; xx < DX; xx += 0.3) for (let z = DZ0 + r() * 3; z < DZ1; z += 2.4 + r() * 1.5) x.fillRect(px(xx), pz(z), px(xx + 0.3) - px(xx), 1);
    // steel around the chain run on the forecastle, the breakwater's foot, the barbettes
    x.fillStyle = '#4e5357'; x.fillRect(px(-1.9), pz(-47.5), px(1.9) - px(-1.9), pz(-37.6) - pz(-47.5));
    for (const t of TURRETS) { x.beginPath(); x.ellipse(px(0), pz(t.z), (px(2.55) - px(0)), (pz(t.z + 2.55) - pz(t.z)), 0, 0, 6.283); x.fill(); }
    // the helicopter spot on the fantail: a white circle, a dashed line-up line, the deck-edge stripes
    x.strokeStyle = 'rgba(232,232,224,0.9)'; x.lineWidth = 3; x.beginPath(); x.ellipse(px(0), pz(41), px(3.4) - px(0), pz(44.4) - pz(41), 0, 0, 6.283); x.stroke();
    x.setLineDash([10, 10]); x.beginPath(); x.moveTo(px(0), pz(30)); x.lineTo(px(0), pz(50)); x.stroke(); x.setLineDash([]);
    x.fillStyle = 'rgba(232,232,224,0.85)'; x.fillRect(px(-1.5), pz(40.85), px(1.5) - px(-1.5), 3);
    // grime, oil, scorch near the turrets (blast), salt stains
    for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(30,26,20,${0.08 + r() * 0.18})`; x.beginPath(); x.ellipse(r() * w, r() * h, 3 + r() * 16, 5 + r() * 30, r() * 3, 0, 6.283); x.fill(); }
    for (const t of TURRETS) for (let i = 0; i < 8; i++) { x.fillStyle = `rgba(40,36,32,${0.1 + r() * 0.15})`; x.beginPath(); x.ellipse(px((r() - 0.5) * 8), pz(t.z + (t.aft ? 6 : -6) + (r() - 0.5) * 4), 6 + r() * 20, 10 + r() * 30, 0, 0, 6.283); x.fill(); }
  });
}
function buildDeck() {
  const pos = [], uv = [], idx = [];
  const zs = []; for (let z = -52.4; z < 52.5; z += z < -40 || z > 44 ? 0.4 : 1) zs.push(z); zs.push(52.5);
  for (const z of zs) {
    const hw = Math.max(0.01, deckHalf(z) - 0.03), y = deckY(z) + 0.02;
    pos.push(-hw, y, z, hw, y, z); uv.push((-hw + DX) / (2 * DX), 1 - (z - DZ0) / (DZ1 - DZ0), (hw + DX) / (2 * DX), 1 - (z - DZ0) / (DZ1 - DZ0));
  }
  for (let i = 0; i < zs.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: deckTexture() })); m.name = 'teak-deck';
  return m;
}

// ------------------------------------------------------------------------------------------------- 16-inch turret
// Mk 7 16"/50 triple turret: the sloped face plate, rangefinder "ears" at the rear, periscope hoods, three guns in
// one elevating cradle (userData.barrels), canvas blast bags at the gun ports, a muzzle flash and recoil on fire()
function turret16(spec) {
  const t = new THREE.Group(); t.position.set(0, spec.y, spec.z); if (spec.aft) t.rotation.y = Math.PI;
  const k = new Kit({ wear: 0.035, seed: Math.round(spec.z * 7) & 255 });
  k.prism([[3.2, 0], [2.3, 1.45], [-3.6, TH], [-4.2, 1.25], [-4.2, 0]], 5.2, HAZE, T(-2.6, 0, 0, 0, Math.PI / 2, 0));   // the gunhouse, side profile extruded across
  k.box(5.0, 0.04, 5.6, DECKG, 0, TH + 0.01, -0.85, -0.022);                                                              // roof plating
  k.cyl(2.45, 2.45, 0.25, HAZE_D, 0, -0.08, 0, 0, 0, 0, 16);                                                             // the barbette ring
  for (const sd of [-1, 1]) {
    k.box(0.55, 0.55, 1.5, HAZE, sd * 2.85, 1.05, 2.4); k.cyl(0.3, 0.3, 0.3, DARK, sd * 3.2, 1.05, 2.4, 0, 0, Math.PI / 2, 8);   // rangefinder ears
    k.box(0.38, 0.22, 0.45, HAZE_D, sd * 1.5, TH + 0.06, -1.9);                                                           // periscope hoods
    k.box(0.6, 0.06, 0.8, DARK, sd * 1.2, TH + 0.04, 2.2);                                                                 // roof hatches
  }
  for (const x of [-1.15, 0, 1.15]) k.box(0.62, 1.0, 0.06, DARK, x, 0.74, -2.74, 31.8 * DEG);                              // the gun ports
  k.box(0.08, 1.2, 0.5, HAZE_D, 0, 0.6, 4.22); for (let y = 0.2; y < 1.6; y += 0.3) k.box(0.5, 0.04, 0.06, DARK, 0, y, 4.25);   // rear door, ladder
  k.cyl(0.18, 0.2, 0.3, HAZE_D, 0.8, TH + 0.15, 1.2, 0, 0, 0, 8); k.sphere(0.2, HAZE_D, 0.8, TH + 0.3, 1.2, 1, 0.5, 1, 8, 4);   // vent mushroom
  t.add(k.mesh());
  const cradle = new THREE.Group(); cradle.position.set(0, 0.74, -2.3); t.add(cradle);
  const b = new Kit({ wear: 0.02, seed: 3 });
  for (const x of [-1.15, 0, 1.15]) {
    b.add(new THREE.CylinderGeometry(0.13, 0.21, 7.3, 10), HAZE_D, T(x, 0, -4.0, -Math.PI / 2));
    b.cyl(0.165, 0.165, 0.35, HAZE_D, x, 0, -7.55, Math.PI / 2, 0, 0, 10);
    b.cyl(0.1, 0.1, 0.02, BLACK, x, 0, -7.74, Math.PI / 2, 0, 0, 8);
    b.cyl(0.31, 0.27, 0.62, CANVAS, x, 0, -0.72, Math.PI / 2, 0, 0, 10);   // blast bag
  }
  const gm = b.mesh(); cradle.add(gm);
  // the flash: three orange cones and a fireball, additive, shown for a moment on fire()
  const fk = new Kit({ wear: 0 });
  for (const x of [-1.15, 0, 1.15]) { fk.add(new THREE.ConeGeometry(0.9, 3.4, 8, 1, true), 0xff9a30, T(x, 0, -9.4, -Math.PI / 2)); fk.sphere(0.9, 0xffc860, x, 0, -8.2, 1, 1, 1.3, 8, 5); }
  fk.sphere(1.8, 0xd86020, 0, 0, -10.4, 1.5, 0.9, 1.3, 10, 6);
  const flash = new THREE.Mesh(fk.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
  flash.visible = false; cradle.add(flash);
  t.userData.barrels = cradle; t.userData.aft = spec.aft; t.userData.flashT = 0;
  t.userData.fire = () => { t.userData.flashT = 0.16; flash.visible = true; gm.position.z = 0.75; };
  t.userData.tick = dt => {
    const u = t.userData;
    if (u.flashT > 0) { u.flashT -= dt; const s = 0.4 + (0.16 - u.flashT) / 0.16 * 1.3; flash.scale.set(s, s, s); flash.material.opacity = Math.max(0, u.flashT / 0.16) * 0.95; if (u.flashT <= 0) flash.visible = false; }
    if (gm.position.z > 0) gm.position.z = Math.max(0, gm.position.z - dt * 0.6);   // the guns run out again
  };
  return t;
}
// Mk 28 twin 5"/38 enclosed mount (one mesh: gunhouse + barrels at a fixed elevation; the group trains)
function mount5(team) {
  const g = new THREE.Group(), k = new Kit({ wear: 0.04, seed: 5 });
  k.cyl(0.95, 0.95, 0.12, HAZE_D, 0, 0.06, 0, 0, 0, 0, 12);
  k.prism([[1.25, 0], [0.95, 0.85], [-1.05, 0.95], [-1.35, 0.6], [-1.35, 0]], 1.8, HAZE, T(-0.9, 0.12, 0, 0, Math.PI / 2, 0));
  k.box(0.4, 0.18, 0.5, HAZE_D, 0.45, 1.12, -0.3); k.box(0.4, 0.18, 0.5, HAZE_D, -0.45, 1.12, -0.3);   // sight hoods
  for (const sd of [-1, 1]) {
    k.box(0.22, 0.42, 0.06, DARK, sd * 0.38, 0.62, -1.15, 19 * DEG);
    k.add(new THREE.CylinderGeometry(0.05, 0.075, 2.25, 8), HAZE_D, T(sd * 0.38, 0.62 + 0.18, -2.2, -Math.PI / 2 + 8 * DEG));
  }
  k.box(0.06, 0.6, 0.5, DARK, 0.92, 0.5, 0.6);   // the side door
  g.add(k.mesh()); g.userData = { yaw: g, pitch: null, team };
  return g;
}
// a Mk 143 armored box launcher (Tomahawk), stowed flat
function abl(kit, x, y, z, yaw = 0) {
  kit.push(T(x, y, z, 0, yaw, 0));
  kit.box(0.85, 0.12, 2.6, DECKG, 0, 0.06, 0); kit.box(0.78, 0.58, 2.5, HAZE, 0, 0.42, 0); kit.box(0.8, 0.06, 2.52, HAZE_D, 0, 0.73, 0);
  for (const sd of [-1, 1]) kit.box(0.06, 0.4, 0.3, DARK, sd * 0.41, 0.42, 0.9);
  kit.box(0.7, 0.5, 0.04, HAZE_D, 0, 0.42, -1.27);
  kit.pop();
}
// a Mk 141 Harpoon quad canister rack, the tubes angled up 15 degrees, pointing outboard-forward
function harpoon(kit, x, y, z, yaw) {
  kit.push(T(x, y, z, 0, yaw, 0));
  kit.box(0.7, 0.4, 0.2, HAZE_D, 0, 0.2, 0.55); kit.box(0.7, 0.15, 0.2, HAZE_D, 0, 0.08, -0.5);
  for (let i = 0; i < 4; i++) kit.add(new THREE.CylinderGeometry(0.11, 0.11, 1.8, 8), HAZE_L, T((i - 1.5) * 0.18, 0.42, 0, -Math.PI / 2 + 15 * DEG));
  kit.pop();
}
// a sailor (dungarees, white hat), real size, facing -z
function sailor(kit, x, y, z, yaw, shirt = 0x5a7aa0) {
  kit.push(T(x, y, z, 0, yaw, 0));
  kit.box(0.14, 0.82, 0.16, 0x2e3a52, -0.1, 0.41, 0); kit.box(0.14, 0.82, 0.16, 0x2e3a52, 0.1, 0.41, 0);
  kit.box(0.44, 0.6, 0.24, shirt, 0, 1.12, 0); kit.box(0.11, 0.55, 0.12, shirt, -0.28, 1.1, 0); kit.box(0.11, 0.55, 0.12, shirt, 0.28, 1.1, 0);
  kit.box(0.2, 0.22, 0.2, 0xc89a78, 0, 1.55, 0); kit.cyl(0.15, 0.12, 0.1, 0xeeeee8, 0, 1.7, 0, 0, 0, 0, 8);
  kit.pop();
}

// ------------------------------------------------------------------------------------------------- the ship
export function buildIowa() {
  const g = new THREE.Group(); g.name = 'BB-64';
  const kit = new Kit({ wear: 0.045, seed: 64, grime: (x, y, z, c, r) => {
    if (y < -0.5) c.setHex(0x5a2a22); else if (y < 0.5 && Math.abs(x) > 0.3) c.setHex(0x161616);
    else if (y < 1.4 && Math.abs(x) > 5) c.multiplyScalar(0.84 + r() * 0.06);
    if (y > 0.5 && r() < 0.25) c.multiplyScalar(0.91 + r() * 0.07);
  } });
  const glow = new Kit({ wear: 0 }), sheet = new DecalSheet(1024, 8, 8), r = rng(64);
  hull(kit);
  // ---- forecastle: breakwater, anchor chains, windlass gear, bitts, the jackstaff; lifelines all round
  {
    const zb = -33.2, yb = deckY(zb), hw = deckHalf(zb) - 0.4;
    for (const sd of [-1, 1]) kit.add(new THREE.BoxGeometry(hw * 1.15, 0.55, 0.12), HAZE, T(sd * hw * 0.5, yb + 0.27, zb + 1.2, 0, sd * -0.42, 0));
    for (const sd of [-1, 1]) {
      const ya = deckY(-46.2), yw = deckY(-39);
      kit.rod([sd * 0.9, ya + 0.08, -46.4], [sd * 0.9, yw + 0.08, -39.4], 0.08, 0x2a2622, 4);   // chain
      kit.cyl(0.42, 0.42, 0.18, STEEL, sd * 0.9, yw + 0.1, -38.8, 0, 0, 0, 10); kit.cyl(0.25, 0.3, 0.1, BLACK, sd * 0.9, ya + 0.05, -46.6, 0, 0, 0, 8);   // capstan / hawse
      kit.box(0.35, 0.9, 0.7, 0x232425, sd * (deckHalf(-47.4) + 0.05), deckY(-47.4) - 0.9, -47.4, 0, 0, sd * 0.15);   // anchor in its pocket
      for (const z of [-42, -35.6, -18, 26, 36, 46]) { const x = sd * (deckHalf(z) - 0.7); kit.cyl(0.13, 0.13, 0.35, STEEL, x, deckY(z) + 0.17, z, 0, 0, 0, 8); kit.cyl(0.13, 0.13, 0.35, STEEL, x, deckY(z) + 0.17, z + 0.45, 0, 0, 0, 8); }
    }
    kit.rod([0, deckY(-52.3), -52.3], [0, deckY(-52.3) + 3.0, -52.1], 0.05, HAZE_D, 4);
    // lifelines: posts and two wires, both sides, stem to stern
    for (const sd of [-1, 1]) {
      const pts = []; for (let z = -51.6; z <= 52; z += 2.2) pts.push([sd * (deckHalf(z) - 0.12), deckY(z), z]);
      kit.rail(pts, 0.9, HAZE_D, 2.2, 0.025);
      for (let i = 0; i < pts.length - 1; i++) kit.rod([pts[i][0], pts[i][1] + 0.45, pts[i][2]], [pts[i + 1][0], pts[i + 1][1] + 0.45, pts[i + 1][2]], 0.015, HAZE_D, 3);
    }
  }
  // raised barbette for the superfiring turret
  { const t = TURRETS[1]; kit.cyl(2.3, 2.35, t.y - deckY(t.z) + 0.05, HAZE, 0, (t.y + deckY(t.z)) / 2, t.z, 0, 0, 0, 18); }
  // ---- the superstructure: 01 and 02 levels from the tower to the after director, then the tower bridge
  {
    kit.box(8.8, L1 - DECK + 0.02, 30.3, HAZE_L, 0, (L1 + DECK) / 2 - 0.01, -1.15);   // 01 level  z -16.3 .. 14
    kit.box(9.1, 0.12, 30.6, HAZE_D, 0, L1, -1.15);
    kit.floor([[4.4, -16.3], [4.4, 14], [-4.4, 14], [-4.4, -16.3]], L1 + 0.07, DECKG);
    kit.box(4.8, L2 - L1, 28.3, HAZE_L, 0, (L1 + L2) / 2, -1.65);   // 02 level  z -15.8 .. 12.5
    kit.box(5.0, 0.1, 28.5, HAZE_D, 0, L2, -1.65); kit.floor([[2.4, -15.8], [2.4, 12.5], [-2.4, 12.5], [-2.4, -15.8]], L2 + 0.06, DECKG);
    for (const sd of [-1, 1]) {
      kit.rail([[sd * 4.35, L1, -16.2], [sd * 4.35, L1, 13.9]], 0.9, HAZE_D, 1.6, 0.025);
      for (let z = -15; z < 13; z += 2.6) kit.cyl(0.12, 0.12, 0.05, GLASS, sd * 4.41, DECK + 0.6, z, 0, 0, Math.PI / 2, 8);   // portholes / scuttles
      for (const z of [-11, -2.6, 6.2]) kit.box(0.05, 0.85, 0.5, DARK, sd * 4.42, DECK + 0.48, z);   // doors
      for (const z of [-14.6, 10.4]) { kit.rod([sd * 3.0, DECK, z + 1.2], [sd * 3.0, L1, z], 0.03, HAZE_D, 4); kit.rod([sd * 3.5, DECK, z + 1.2], [sd * 3.5, L1, z], 0.03, HAZE_D, 4); }   // ladders
    }
    // the conning tower: an armoured oval with vision slits, then the tower bridge levels stepping up behind it
    kit.add(new THREE.CylinderGeometry(1, 1, 1.8, 16), HAZE, T(0, L2 + 0.9, -14.2, 0, 0, 0, 1.5, 1, 1.8));
    kit.add(new THREE.CylinderGeometry(1.02, 1.02, 0.12, 16), BLACK, T(0, L2 + 1.45, -14.2, 0, 0, 0, 1.5, 1, 1.8));
    kit.add(new THREE.CylinderGeometry(1, 0.92, 0.18, 16), HAZE_D, T(0, L2 + 1.89, -14.2, 0, 0, 0, 1.5, 1, 1.8));
    // the tower bridge: 03 .. 08 levels stepping up behind the conning tower, 1.2 m each (the Iowa's tall, narrow tower)
    kit.box(4.4, 1.2, 7.0, HAZE_L, 0, DECK + 2.7, -9.5);                         // 03  z -13 .. -6
    kit.box(4.0, 1.2, 6.0, HAZE_L, 0, DECK + 3.9, -10.5);                        // 04
    kit.box(4.2, 1.2, 6.3, HAZE_L, 0, DECK + 5.1, -11.15);                       // 05: the navigation bridge
    kit.box(4.25, 0.36, 6.35, GLASS, 0, DECK + 5.25, -11.15);
    for (let x = -1.9; x <= 1.9; x += 0.48) kit.box(0.05, 0.36, 0.05, HAZE_L, x, DECK + 5.25, -14.32);
    kit.box(4.5, 0.1, 6.6, HAZE_D, 0, DECK + 5.73, -11.15);
    kit.box(2.0, 1.2, 4.0, HAZE_L, 0, DECK + 6.3, -11.0);                        // 06: flag plot
    kit.box(2.1, 0.08, 4.1, HAZE_D, 0, DECK + 6.92, -11.0);
    kit.box(1.6, 1.2, 2.8, HAZE_L, 0, DECK + 7.5, -11.2);                        // 07: the fire-control tower
    kit.box(1.3, 1.0, 2.2, HAZE_L, 0, DECK + 8.6, -11.3);                        // 08: the main-battery plot
    kit.box(1.65, 0.08, 2.85, HAZE_D, 0, DECK + 8.12, -11.2);
    for (const sd of [-1, 1]) {
      kit.box(1.0, 0.1, 2.2, HAZE_D, sd * 2.55, DECK + 4.5, -13.0); kit.rail([[sd * 2.1, DECK + 4.5, -14.1], [sd * 3.05, DECK + 4.5, -14.1], [sd * 3.05, DECK + 4.5, -11.9]], 0.6, HAZE_D, 0.8, 0.02);   // bridge wings
      glow.box(0.12, 0.15, 0.2, sd > 0 ? 0x30ff60 : 0xff3020, sd * 3.1, DECK + 4.75, -12.2);
      kit.box(0.5, 0.95, 1.1, HAZE_D, sd * 2.45, DECK + 2.75, -8.6);             // SLQ-32 ECM boxes
      kit.box(0.08, 0.8, 0.95, DARK, sd * 2.71, DECK + 2.75, -8.6);
      for (let z = -12.6; z < -8.5; z += 1.3) kit.cyl(0.1, 0.1, 0.05, GLASS, sd * 2.01, DECK + 3.95, z, 0, 0, Math.PI / 2, 8);   // 04 scuttles
      // Mk 37 secondary-battery directors on the 05 roof, with their Mk 25 dish
      kit.box(1.0, 0.75, 1.3, HAZE, sd * 1.6, DECK + 6.13, -10.0); kit.cyl(0.36, 0.36, 0.1, DARK, sd * 1.6, DECK + 6.93, -10.2, Math.PI / 2 - 0.2, 0, 0, 10);
      kit.rod([sd * 1.6, DECK + 6.5, -10.0], [sd * 1.6, DECK + 6.9, -10.1], 0.06, HAZE_D, 4);
    }
    // Mk 38 main-battery director on top: the rangefinder arms and the Mk 13 radar
    kit.box(1.3, 0.85, 1.4, HAZE, 0, DECK + 9.52, -11.3); kit.rod([-1.7, DECK + 9.6, -11.0], [1.7, DECK + 9.6, -11.0], 0.16, HAZE, 8);
    for (const sd of [-1, 1]) kit.cyl(0.2, 0.2, 0.1, DARK, sd * 1.75, DECK + 9.6, -11.0, 0, 0, Math.PI / 2, 8);
    kit.box(1.1, 0.4, 0.18, DARK, 0, DECK + 10.2, -11.6); kit.cyl(0.08, 0.08, 0.3, HAZE_D, 0, DECK + 9.95, -11.4, 0, 0, 0, 6);
    // the foremast: a tripod off the tower's after face, the SPS-49 platform, a topmast with yards
    const top = [0, DECK + 15.0, -8.4];
    kit.rod([0, DECK + 6.9, -9.4], top, 0.17, HAZE_D, 6); kit.rod([-1.3, DECK + 5.7, -8.2], [0, DECK + 13.2, -8.5], 0.11, HAZE_D, 5); kit.rod([1.3, DECK + 5.7, -8.2], [0, DECK + 13.2, -8.5], 0.11, HAZE_D, 5);
    kit.box(2.2, 0.12, 1.9, HAZE_D, 0, DECK + 13.3, -8.5); kit.rail([[-1.05, DECK + 13.35, -9.4], [1.05, DECK + 13.35, -9.4], [1.05, DECK + 13.35, -7.6], [-1.05, DECK + 13.35, -7.6], [-1.05, DECK + 13.35, -9.4]], 0.4, HAZE_D, 0.7, 0.015);
    kit.box(1.6, 0.1, 1.3, HAZE_D, 0, DECK + 11.4, -9.4); kit.box(1.0, 0.25, 0.25, DARK, 0, DECK + 11.7, -9.4);   // SPS-67 surface-search platform
    kit.rod(top, [0, DECK + 18.6, -8.4], 0.07, HAZE_D, 5);
    kit.rod([-2.4, DECK + 16.2, -8.4], [2.4, DECK + 16.2, -8.4], 0.05, HAZE_D, 4); kit.rod([-1.4, DECK + 17.6, -8.4], [1.4, DECK + 17.6, -8.4], 0.04, HAZE_D, 4);
    for (const sd of [-1, 1]) kit.sphere(0.2, 0xd0d0c8, sd * 0.7, DECK + 14.8, -8.4, 1, 1, 1, 8, 5);   // ESM domes
    glow.box(0.16, 0.16, 0.16, 0xff2a1a, 0, DECK + 18.75, -8.4); glow.box(0.14, 0.14, 0.14, 0xfff4d8, 0, DECK + 16.35, -8.4);
    // funnel 1 (blends into the tower) and funnel 2: oval, the black caps with the uptake mouths, steam pipes
    const funnel = (z, hgt, rx, rz) => {
      kit.add(new THREE.CylinderGeometry(0.94, 1, hgt, 16), HAZE_L, T(0, L2 + hgt / 2, z, 0, 0, 0, rx, 1, rz));
      kit.add(new THREE.CylinderGeometry(0.96, 0.95, 0.7, 16), BLACK, T(0, L2 + hgt + 0.3, z, 0, 0, 0, rx, 1, rz));
      kit.add(new THREE.CylinderGeometry(0.8, 0.8, 0.1, 14), 0x0c0c0c, T(0, L2 + hgt + 0.66, z, 0, 0, 0, rx, 1, rz));
      kit.add(new THREE.CylinderGeometry(1.05, 1.05, 0.12, 16), HAZE_D, T(0, L2 + hgt - 1.3, z, 0, 0, 0, rx, 1, rz));   // platform band
      for (const sd of [-1, 1]) kit.cyl(0.07, 0.07, hgt + 0.5, HAZE_D, sd * 0.35, L2 + hgt / 2 + 0.4, z + rz * 0.95, 0, 0, 0, 6);   // steam pipes up the back
      return [0, L2 + hgt + 0.7, z];
    };
    const f1 = funnel(-4.1, 5.7, 1.45, 1.95), f2 = funnel(5.2, 5.1, 1.35, 1.8);
    kit.box(3.3, 0.08, 4.3, HAZE_D, 0, L2 + 3.84, 5.2); kit.rail([[-1.65, L2 + 3.88, 3.05], [1.65, L2 + 3.88, 3.05], [1.65, L2 + 3.88, 7.35], [-1.65, L2 + 3.88, 7.35], [-1.65, L2 + 3.88, 3.05]], 0.5, HAZE_D, 0.8, 0.015);
    for (const [x, z] of [[1.2, 3.6], [-1.2, 3.6], [1.25, 6.8], [-1.25, 6.8]]) { kit.cyl(0.24, 0.24, 0.4, HAZE_D, x * 1.12, L2 + 4.05, z, Math.PI / 2, 0, 0, 8); kit.cyl(0.2, 0.2, 0.05, 0xd8d8c8, x * 1.12, L2 + 4.05, z + (z < 5 ? -0.21 : 0.21), Math.PI / 2, 0, 0, 8); }   // searchlights on funnel 2
    g.userData.funnels = [f1, f2];
    // the mainmast aft of funnel 2: a pole with a TACAN on top, yards, a small surface radar platform
    kit.rod([0, L2, 7.4], [0, DECK + 15.4, 7.6], 0.14, HAZE_D, 6); kit.rod([-0.9, L2, 8.6], [0, DECK + 9.6, 7.5], 0.08, HAZE_D, 5); kit.rod([0.9, L2, 8.6], [0, DECK + 9.6, 7.5], 0.08, HAZE_D, 5);
    kit.rod([-1.9, DECK + 11.4, 7.55], [1.9, DECK + 11.4, 7.55], 0.05, HAZE_D, 4); kit.box(1.4, 0.1, 1.2, HAZE_D, 0, DECK + 9.7, 7.5);
    kit.cyl(0.32, 0.32, 0.7, 0xc8c8c0, 0, DECK + 15.75, 7.6, 0, 0, 0, 10); kit.cyl(0.04, 0.02, 1.2, HAZE_D, 0, DECK + 16.7, 7.6, 0, 0, 0, 4);
    glow.box(0.16, 0.16, 0.16, 0xff2a1a, 0, DECK + 17.35, 7.6);
    // the after superstructure: 03 / 04 levels, a Mk 37 and the after Mk 38 director
    kit.box(3.6, 1.0, 3.7, HAZE_L, 0, DECK + 2.6, 9.65); kit.box(3.8, 0.1, 3.9, HAZE_D, 0, DECK + 3.12, 9.65);
    kit.box(2.0, 1.0, 1.8, HAZE_L, 0, DECK + 3.6, 10.6);
    kit.box(1.0, 0.75, 1.3, HAZE, 0, DECK + 3.55, 8.6); kit.cyl(0.36, 0.36, 0.1, DARK, 0, DECK + 4.3, 8.4, Math.PI / 2 - 0.2, 0, 0, 10);
    kit.box(1.3, 0.85, 1.4, HAZE, 0, DECK + 4.52, 10.6); kit.rod([-1.6, DECK + 4.6, 10.4], [1.6, DECK + 4.6, 10.4], 0.15, HAZE, 8);
    // boat cranes and two motor whaleboats on the 02 level aft
    for (const sd of [-1, 1]) {
      kit.push(T(sd * 1.6, L2 + 0.25, 11.5)); kit.add(new THREE.SphereGeometry(1, 8, 5), 0x5d6670, T(0, 0.15, 0, 0, 0, 0, 0.6, 0.35, 1.9)); kit.box(0.9, 0.1, 3.4, CANVAS, 0, 0.42, 0); kit.pop();
    }
    kit.rod([0, L2, 13.6], [0, L2 + 3.2, 13.6], 0.16, HAZE_D, 6); kit.rod([0, L2 + 3.0, 13.6], [2.4, L2 + 2.4, 11.2], 0.1, HAZE_D, 5);
    // the missiles: four ABLs between the funnels, four outboard aft on the 01 level, Harpoon racks by funnel 2
    for (const x of [-1.45, -0.5, 0.5, 1.45]) abl(kit, x, L2 + 0.06, 0.6);
    for (const sd of [-1, 1]) for (const z of [8.2, 11.0]) abl(kit, sd * 3.4, L1 + 0.07, z, sd * 0.05);
    for (const sd of [-1, 1]) { harpoon(kit, sd * 3.35, L1 + 0.07, 3.6, sd * -0.5); harpoon(kit, sd * 3.35, L1 + 0.07, 5.4, sd * -0.5); }
    // whip antennas (tilted out), whaleboat davits, the life-raft canisters
    for (const [x, z, tl] of [[4.3, -15.8, 0.22], [-4.3, -15.8, -0.22], [4.3, 13.6, 0.25], [-4.3, 13.6, -0.25], [3.4, 50, 0.2], [-3.4, 50, -0.2]]) { const y0 = z > 40 ? deckY(z) : L1; kit.rod([x, y0, z], [x + Math.sin(tl) * 7, y0 + Math.cos(tl) * 7, z], 0.03, 0xb8b8b0, 3); }
    for (const sd of [-1, 1]) for (let z = -12; z < 12; z += 4) if (Math.abs(z + 6.5) > 1.8 && Math.abs(z) > 1.8) kit.cyl(0.18, 0.18, 0.6, WHITE, sd * 4.1, L1 + 0.25, z, Math.PI / 2, 0, 0, 8);
  }
  // ---- the fantail: the old aircraft crane, bitts, the flagstaff
  {
    const zc = 48.6, yc = deckY(zc);
    kit.cyl(0.45, 0.55, 1.4, HAZE, 0, yc + 0.7, zc, 0, 0, 0, 10); kit.box(0.9, 0.6, 1.0, HAZE_D, 0, yc + 1.6, zc);
    kit.rod([0, yc + 1.7, zc], [3.6, yc + 4.6, zc - 3.8], 0.14, HAZE, 6); kit.rod([3.6, yc + 4.6, zc - 3.8], [3.6, yc + 2.2, zc - 3.8], 0.02, 0x2a2a28, 3);
    kit.rod([0, yc + 2.1, zc - 0.3], [3.4, yc + 4.65, zc - 3.6], 0.025, 0x2a2a28, 3);
    kit.rod([0, deckY(52.4), 52.4], [0, deckY(52.4) + 3.4, 52.5], 0.05, HAZE_D, 4);
    glow.box(0.18, 0.18, 0.18, 0xfff8e8, 0, deckY(52.4) + 3.5, 52.5);
  }
  // a few sailors: at the bow, by turret 3, on the bridge wing, a line-handler aft
  sailor(kit, 1.2, deckY(-40), -40, 0.3); sailor(kit, -3.2, DECK, 16.4, 2.0); sailor(kit, 2.6, DECK + 4.55, -12.6, -1.2, 0x7a8aa0); sailor(kit, -2.8, deckY(45), 45, 1.0);
  // ---- markings: the hull number (white, black shadow) on the bow, draft marks, rust from hawse pipes and scuppers
  {
    const num = sheet.draw(0, 2, 1, (x, w, h) => drawText(x, w, h, '64', { size: 0.95, shadow: '#141414', stretch: 0.85 }));
    const draft = sheet.draw(2, 1, 3, (x, w, h) => { for (let i = 0; i < 5; i++) { drawText(x, w, h / 5, ['36', '34', '32', '30', '28'][i], { size: 0.6, color: '#e4e4dc' }); x.translate(0, h / 5); } });
    const rs = sheet.draw(3, 1, 3, (x, w, h) => drawStreak(x, w, h, rng(7), { a: 0.75, n: 6 }));
    const rs2 = sheet.draw(4, 1, 3, (x, w, h) => drawStreak(x, w, h, rng(19), { a: 0.55, n: 4, col: [112, 60, 32] }));
    const ang = (z, sd) => sd * (Math.PI / 2 - Math.atan2(deckHalf(z - 0.5) - deckHalf(z + 0.5), 1) * 0.95);
    for (const sd of [-1, 1]) {
      const zn = -42.5, yn = deckY(zn) - 1.25; sheet.place(num, T(sd * (deckHalf(zn) * 0.97 + 0.08), yn, zn, 0, ang(zn, sd), 0), 3.4, 1.7);
      sheet.place(rs, T(sd * (deckHalf(-47.4) + 0.12), deckY(-47.4) - 2.6, -47.4, 0, ang(-47.4, sd), 0), 1.4, 3.6);
      sheet.place(draft, T(sd * (waterHalf(-46.6) + 0.14), 1.0, -46.6, 0, ang(-46.6, sd) * 1.05, 0), 0.45, 2.0);
      for (let z = -36; z < 44; z += 4 + r() * 4) { const y = deckY(z) - 0.25; sheet.place(r() < 0.5 ? rs : rs2, T(sd * (deckHalf(z) * 0.985 + 0.07), y - 0.9, z, 0, ang(z, sd), 0), 0.5 + r() * 0.6, 1.6 + r() * 1.2); }
      for (const z of [-12, -2, 8]) sheet.place(rs2, T(sd * 4.43, DECK + 0.6, z, 0, sd * Math.PI / 2, 0), 0.5, 1.2);
    }
  }
  // ---- turrets, 5"/38 mounts, defence mounts (CIWS forward, box launchers aft: refit placeholders)
  const turrets = TURRETS.map(spec => { const t = turret16(spec); g.add(t); return t; });
  const team = new THREE.MeshPhongMaterial({ color: 0x33bbff }), guns = [], mounts = [], secondaries = [];
  for (const sd of [-1, 1]) for (const z of [-13.2, -6.6, 0]) {
    const m = mount5(team); m.position.set(sd * 3.45, L1 + 0.07, z); m.rotation.y = sd * -0.25; g.add(m); secondaries.push(m);
    mounts.push({ kind: 'gun', pos: m.position.clone(), dir: new THREE.Vector3(sd, 0, -1).normalize(), node: m });
  }
  const DEF = [{ kind: 'ciws', x: 3.1, y: L2, z: -9.9, out: [1, 0, -0.35] }, { kind: 'ciws', x: -3.1, y: L2, z: -9.9, out: [-1, 0, -0.35] },
    { kind: 'sam', x: 3.15, y: L1 + 0.07, z: 13.2, out: [1, 0, 0.45] }, { kind: 'sam', x: -3.15, y: L1 + 0.07, z: 13.2, out: [-1, 0, 0.45] }];
  for (const D of DEF) {
    if (D.kind === 'ciws') { const sd = Math.sign(D.x); kit.cyl(0.85, 0.95, 0.12, DECKG, D.x, D.y + 0.06, D.z, 0, 0, 0, 12); kit.box(1.3, 0.1, 2.0, HAZE_D, sd * 2.75, D.y - 0.05, D.z); kit.rail([[D.x + sd * 0.75, D.y + 0.1, D.z - 0.9], [D.x + sd * 0.75, D.y + 0.1, D.z + 0.9]], 0.6, HAZE_D, 0.6, 0.02); }
    const gun = D.kind === 'ciws' ? buildPhalanx(team) : buildSeaSparrow(team);
    gun.position.set(D.x, D.y + (D.kind === 'ciws' ? 0.12 : 0), D.z); gun.userData.yaw.rotation.y = Math.atan2(-D.out[0], -D.out[2]); g.add(gun); guns.push(gun);
    mounts.push({ kind: D.kind, pos: gun.position.clone(), dir: new THREE.Vector3(...D.out).normalize(), node: gun, gun: guns.length - 1 });
  }
  for (const t of turrets) mounts.push({ kind: 'main', pos: t.position.clone(), dir: new THREE.Vector3(0, 0, t.userData.aft ? 1 : -1), node: t });
  // the SPS-49 (rotating) on the foremast platform
  const radar = new THREE.Group(); radar.position.set(0, DECK + 13.4, -8.5); g.add(radar);
  {
    const k = new Kit({ wear: 0 });
    k.cyl(0.18, 0.22, 0.5, HAZE_D, 0, 0.25, 0, 0, 0, 0, 6);
    k.box(2.8, 1.5, 0.06, 0x6a7279, 0, 1.3, -0.2); for (let i = -3; i <= 3; i++) k.box(0.04, 1.5, 0.08, 0x4a5056, i * 0.4, 1.3, -0.21); for (let j = -2; j <= 2; j++) k.box(2.8, 0.04, 0.08, 0x4a5056, 0, 1.3 + j * 0.35, -0.21);
    k.rod([0, 0.5, 0], [0, 1.0, -0.6], 0.06, HAZE_D, 4); k.box(0.3, 0.3, 0.3, DARK, 0, 0.55, -0.7);
    radar.add(k.mesh());
  }
  const h = kit.mesh(); h.name = 'iowa-hull'; g.add(h);
  g.add(buildDeck());
  g.add(new THREE.Mesh(glow.geometry(), glowMat()));
  g.add(sheet.mesh());
  const f = g.userData.funnels;
  return {
    group: g, turrets, guns, mounts, secondaries, hull: h, localDeck, deckHalf, waterHalf, motion: 'iowa', dims: IOWA, fx: { wake: 0.85, smoke: 0.5 },
    funnel: new THREE.Vector3(...f[0]), funnels: f.map(p => new THREE.Vector3(...p)), dish: radar,
    bow: new THREE.Vector3(0, 0, -49.2), stern: new THREE.Vector3(0, 0, 50),
    tick(dt) { radar.rotation.y += dt * 1.25; for (const t of turrets) t.userData.tick(dt); for (const gun of guns) gun.userData.tick?.(dt); },
  };
}
