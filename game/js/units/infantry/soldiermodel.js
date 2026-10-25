// NGC-1980 infantry: the third-person soldier. A SHARED SKELETON (rigid bone groups, no skinning: one mesh per bone, the
// house style), a procedural POSER (stand / crouch-kneel / prone / down, walk-run-sprint-crawl cycles, lean, aim,
// stance blending, two-bone arm IK onto the weapon), HITBOXES per bone for hit registration, and the 1980 MARINE built
// on it (M1 helmet with Mitchell cover, ERDL or OG-107 utilities, M1955 flak vest, ALICE belt / suspenders / pouches /
// canteens, boots).
//
// REUSE (RUNAWAY machine soldiers, AI squads, paratroopers):
//   const sk = createSkeleton();                  // bones: sk.bones.pelvis ... sk.bones.footR, sk.root (Group at the feet)
//   sk.bones.chest.add(myMesh) ...                // hang any geometry on the bones (or use buildMarine())
//   poseSkeleton(sk, pose, dt)                     // pose = soldier.pose() (soldier.js) + { cls, weapon (model), ... }
//   raycastHitboxes(sk, ox, oy, oz, dx, dy, dz, maxDist) -> { part, dist, x, y, z, armour } | null
// Bone frame: model space +y up, facing -z, +x = the soldier's right. Lengths are a 50th-percentile man (1.75 m).
import * as THREE from 'three';
import { Kit, KITMAT, CAMO, COL } from './meshkit.js';
import { buildWeaponModel } from './weaponmodels.js';
import { m67Geometry, m67Into, grenadeMaterial } from './grenademodel.js';   // ngc/marine-polish

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = t => t * t * (3 - 2 * t);
// ------------------------------------------------------------------------------------------------ skeleton
// [name, parent, rest position relative to the parent]
export const BONES = [
  ['pelvis', 'root', [0, 0.98, 0]], ['spine', 'pelvis', [0, 0.1, 0]], ['chest', 'spine', [0, 0.2, 0]], ['neck', 'chest', [0, 0.21, 0]], ['head', 'neck', [0, 0.08, 0]],
  ['upperArmL', 'chest', [-0.19, 0.15, 0]], ['forearmL', 'upperArmL', [0, -0.3, 0]], ['handL', 'forearmL', [0, -0.27, 0]],
  ['upperArmR', 'chest', [0.19, 0.15, 0]], ['forearmR', 'upperArmR', [0, -0.3, 0]], ['handR', 'forearmR', [0, -0.27, 0]],
  ['thighL', 'pelvis', [-0.095, -0.06, 0]], ['shinL', 'thighL', [0, -0.44, 0]], ['footL', 'shinL', [0, -0.42, 0]],
  ['thighR', 'pelvis', [0.095, -0.06, 0]], ['shinR', 'thighR', [0, -0.44, 0]], ['footR', 'shinR', [0, -0.42, 0]],
];
export const LEN = { upperArm: 0.3, forearm: 0.27, thigh: 0.44, shin: 0.42 };
export const EYE_LOCAL = [0, 0.09, -0.095];   // eye in the head bone frame
export function createSkeleton() {
  const root = new THREE.Group(); root.name = 'soldier';
  const bones = { root };
  for (const [n, p, pos] of BONES) { const b = new THREE.Group(); b.name = n; b.position.set(...pos); b.userData.rest = new THREE.Vector3(...pos); bones[p].add(b); bones[n] = b; }
  const sk = { root, bones, weapon: null, weaponModel: null, state: { quats: {}, t: 0 }, _tmp: {} };
  return sk;
}

// ------------------------------------------------------------------------------------------------ hitboxes
// part names are the hit-info contract with MEDINV. Shapes in the bone frame. armour: which kit layer covers it.
export const HITBOXES = [
  { part: 'head', bone: 'head', type: 'sphere', c: [0, 0.1, -0.01], r: 0.115, armour: 'helmet' },
  { part: 'neck', bone: 'neck', type: 'capsule', a: [0, -0.02, 0], b: [0, 0.08, 0], r: 0.06 },
  { part: 'thorax', bone: 'chest', type: 'box', c: [0, 0.07, 0], h: [0.18, 0.16, 0.12], armour: 'vest' },
  { part: 'stomach', bone: 'spine', type: 'box', c: [0, 0.09, 0], h: [0.16, 0.12, 0.11], armour: 'vest' },
  { part: 'stomach', bone: 'pelvis', type: 'box', c: [0, -0.02, 0], h: [0.17, 0.1, 0.11] },
  { part: 'armL', bone: 'upperArmL', type: 'capsule', a: [0, 0, 0], b: [0, -0.3, 0], r: 0.055 }, { part: 'armL', bone: 'forearmL', type: 'capsule', a: [0, 0, 0], b: [0, -0.27, 0], r: 0.045 }, { part: 'armL', bone: 'handL', type: 'sphere', c: [0, -0.07, 0], r: 0.05 },
  { part: 'armR', bone: 'upperArmR', type: 'capsule', a: [0, 0, 0], b: [0, -0.3, 0], r: 0.055 }, { part: 'armR', bone: 'forearmR', type: 'capsule', a: [0, 0, 0], b: [0, -0.27, 0], r: 0.045 }, { part: 'armR', bone: 'handR', type: 'sphere', c: [0, -0.07, 0], r: 0.05 },
  { part: 'legL', bone: 'thighL', type: 'capsule', a: [0, 0, 0], b: [0, -0.44, 0], r: 0.08 }, { part: 'legL', bone: 'shinL', type: 'capsule', a: [0, 0, 0], b: [0, -0.42, 0], r: 0.06 }, { part: 'legL', bone: 'footL', type: 'box', c: [0, -0.03, -0.06], h: [0.05, 0.05, 0.14] },
  { part: 'legR', bone: 'thighR', type: 'capsule', a: [0, 0, 0], b: [0, -0.44, 0], r: 0.08 }, { part: 'legR', bone: 'shinR', type: 'capsule', a: [0, 0, 0], b: [0, -0.42, 0], r: 0.06 }, { part: 'legR', bone: 'footR', type: 'box', c: [0, -0.03, -0.06], h: [0.05, 0.05, 0.14] },
];
// armour layers for MEDINV (game values: the material names are ballistics.js MATERIALS)
export const KIT_ARMOUR = { helmet: [{ material: 'helmet', thickness: 1.2, item: 'M1 helmet' }], vest: [{ material: 'vest', thickness: 6, item: 'M1955 flak vest' }] };
const _inv = new THREE.Matrix4(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _hit = new THREE.Vector3(), _ctr = new THREE.Vector3();
// ray against one shape in its local frame (o, d unit-ish, scaled the same); returns t or Infinity
function rayShape(h, o, d) {
  if (h.type === 'sphere') return raySphere(o, d, h.c, h.r);
  if (h.type === 'box') {
    let t0 = -Infinity, t1 = Infinity;
    for (let i = 0; i < 3; i++) {
      const oi = [o.x, o.y, o.z][i] - h.c[i], di = [d.x, d.y, d.z][i];
      if (Math.abs(di) < 1e-9) { if (Math.abs(oi) > h.h[i]) return Infinity; continue; }
      let a = (-h.h[i] - oi) / di, b = (h.h[i] - oi) / di; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return Infinity;
    }
    return t0 >= 0 ? t0 : t1 >= 0 ? 0 : Infinity;
  }
  // capsule: closest approach of the ray to segment a-b, then the sphere at that point
  const ax = h.a[0], ay = h.a[1], az = h.a[2], bx = h.b[0] - ax, by = h.b[1] - ay, bz = h.b[2] - az;
  let best = Infinity;
  for (let k = 0; k <= 8; k++) { const s = k / 8; const t = raySphere(o, d, [ax + bx * s, ay + by * s, az + bz * s], h.r); if (t < best) best = t; }
  return best;
}
function raySphere(o, d, c, r) {
  const ox = o.x - c[0], oy = o.y - c[1], oz = o.z - c[2], b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, dd = d.x * d.x + d.y * d.y + d.z * d.z;
  const disc = b * b - dd * cc; if (disc < 0) return Infinity; const t = (-b - Math.sqrt(disc)) / dd; return t >= 0 ? t : (cc < 0 ? 0 : Infinity);
}
// world-space ray (unit direction) against the skeleton's hitboxes. Needs updated world matrices (render / updateMatrixWorld).
export function raycastHitboxes(sk, ox, oy, oz, dx, dy, dz, maxDist = Infinity, kit = sk.kit || {}) {
  // coarse: the pelvis sphere (1.3 m covers stand and prone)
  sk.bones.pelvis.getWorldPosition(_ctr);
  const cx = ox - _ctr.x, cy = oy - _ctr.y, cz = oz - _ctr.z, b = cx * dx + cy * dy + cz * dz, c2 = cx * cx + cy * cy + cz * cz - 1.69;
  if (b * b - c2 < 0 || (b > 0 && c2 > 0)) return null;
  let best = null;
  for (const h of HITBOXES) {
    const bone = sk.bones[h.bone]; if (!bone) continue;
    _inv.copy(bone.matrixWorld).invert();
    _o.set(ox, oy, oz).applyMatrix4(_inv); _d.set(dx, dy, dz).transformDirection(_inv);
    const t = rayShape(h, _o, _d);
    if (t < maxDist && (!best || t < best.dist)) {
      _p.copy(_o).addScaledVector(_d, t);
      best = { part: h.part, dist: t, bone: h.bone, local: [_p.x, _p.y, _p.z], armourKey: h.armour };
    }
  }
  if (!best) return null;
  _hit.set(ox + dx * best.dist, oy + dy * best.dist, oz + dz * best.dist);
  best.x = _hit.x; best.y = _hit.y; best.z = _hit.z;
  // the helmet covers the dome (above the brow), the vest the trunk (not the pelvis)
  best.armour = best.armourKey === 'helmet' && kit.helmet !== false && best.local[1] > 0.08 ? KIT_ARMOUR.helmet : best.armourKey === 'vest' && kit.vest !== false ? KIT_ARMOUR.vest : [];
  return best;
}

// ------------------------------------------------------------------------------------------------ the 1980 Marine
// o: { camo: 'erdl' | 'og107', skin, seed, helmet, vest, pack, weapon: 'M16A1' | 'M16A1/M203' | 'M60' | 'M72A2' | 'M1911A1' | null, detail }
export function buildMarine(o = {}) {
  const sk = createSkeleton(), B = sk.bones, seed = o.seed ?? 1;
  const cloth = o.camo === 'og107' ? CAMO.og107() : CAMO.erdl(0.1, seed * 7.3), skin = o.skin ?? [COL.skin, 0xb5835e, 0x8a5d40, 0x6b4630][seed % 4];
  const od = CAMO.od(0x5a5d3c), web = CAMO.od(COL.webbing), vestC = CAMO.od(0x55583a);
  sk.kit = { helmet: o.helmet !== false, vest: o.vest !== false };
  const put = (bone, build) => { const k = new Kit(); build(k); const m = k.mesh(KITMAT.lambert(), bone + 'Mesh'); m.castShadow = false; B[bone].add(m); return m; };
  // pelvis: trousers seat, pistol belt, ammo pouches, canteens, first aid pouch
  put('pelvis', k => {
    k.box(0.33, 0.2, 0.22, cloth, [0, -0.04, 0.0], [0, 0, 0], 3, 'local');
    k.box(0.35, 0.05, 0.24, web, [0, 0.05, 0]);                                          // ALICE pistol belt
    k.box(0.05, 0.03, 0.03, 0x6a6a5a, [0, 0.05, -0.122]);                               // buckle
    for (const s of [-1, 1]) {
      k.box(0.09, 0.1, 0.06, od, [s * 0.1, 0.01, -0.14]);                               // 20-rd magazine pouches (3 mags each)
      k.box(0.092, 0.03, 0.065, od, [s * 0.1, 0.06, -0.142], [-0.1, 0, 0]);              // pouch flap
      k.cyl(0.045, 0.045, 0.16, od, [s * 0.16, -0.03, 0.11], 'y', 8);                   // canteen in its cover
      k.cyl(0.02, 0.02, 0.02, COL.black, [s * 0.16, 0.06, 0.11], 'y', 6);                // cap
    }
    // ngc/marine-polish: the rest of a 1980 Marine's LC-2 belt - an M67 on the side of each ammo pouch (held by the
    // pouch's side strap, the spoon against the pouch: TM 9-1330-200 / FM 21-75), the M7 bayonet in its M8A1 scabbard on
    // the left hip, the folding entrenching tool in its LC-1 carrier at the back right, the butt pack / poncho behind
    if (o.frags !== 0) for (const s of [-1, 1]) { m67Into(k, [s * 0.162, -0.005, -0.14], true); k.box(0.012, 0.02, 0.07, web, [s * 0.15, 0.035, -0.14]); }
    k.box(0.04, 0.27, 0.022, 0x3f4430, [-0.185, -0.12, -0.05], [0, 0, 0.06]);              // M8A1 scabbard (OD fibreglass)
    k.box(0.022, 0.03, 0.024, 0x6a6a62, [-0.19, -0.265, -0.05], [0, 0, 0.06]);            // its steel tip
    k.box(0.028, 0.11, 0.026, 0x1c1c1a, [-0.177, 0.06, -0.05], [0, 0, 0.06]);              // M7 handle (black grips) + guard
    k.box(0.05, 0.012, 0.03, 0x55554e, [-0.178, 0.0, -0.05]);
    k.box(0.14, 0.21, 0.055, od, [0.085, -0.07, 0.15]);                                    // LC-1 entrenching tool carrier
    k.box(0.03, 0.06, 0.02, 0x2a2a20, [0.085, 0.07, 0.15]);                                // the e-tool's handle end
    k.box(0.1, 0.08, 0.06, od, [-0.075, 0.0, 0.145]);                                      // butt pack / poncho roll
  });
  // spine (stomach): flak vest lower half
  put('spine', k => {
    k.box(0.31, 0.22, 0.2, cloth, [0, 0.09, 0], [0, 0, 0], 2, 'local');
    if (sk.kit.vest) { k.box(0.36, 0.2, 0.25, vestC, [0, 0.11, 0]); for (let i = 0; i < 3; i++) k.box(0.362, 0.008, 0.252, 0x45472f, [0, 0.04 + i * 0.06, 0]);
      for (const s of [-1, 1]) k.box(0.1, 0.08, 0.03, vestC, [s * 0.09, 0.06, -0.135]); }   // vest pockets
  });
  // chest: flak vest (M1955: ribbed upper, high collar), suspenders, first aid pouch
  put('chest', k => {
    k.box(0.36, 0.3, 0.22, cloth, [0, 0.07, 0], [0, 0, 0], 3, 'local');
    if (sk.kit.vest) {
      k.box(0.41, 0.28, 0.27, vestC, [0, 0.06, 0]);
      for (let i = 0; i < 5; i++) k.box(0.412, 0.006, 0.272, 0x44462e, [0, -0.04 + i * 0.05, 0]);           // stitched ribs
      k.box(0.3, 0.06, 0.25, vestC, [0, 0.215, 0.01], [0.15, 0, 0]);                                         // collar
      k.box(0.012, 0.25, 0.012, 0x3a3b2a, [0.02, 0.06, -0.137]);                                             // front closure
    }
    for (const s of [-1, 1]) { k.box(0.045, 0.32, 0.012, web, [s * 0.1, 0.07, -0.142]); k.box(0.045, 0.32, 0.012, web, [s * 0.1, 0.07, 0.142]); k.box(0.045, 0.012, 0.27, web, [s * 0.1, 0.23, 0]); }   // suspenders
    k.box(0.07, 0.08, 0.04, od, [-0.1, 0.11, -0.165]);                                                         // first aid pouch on the left suspender
    for (const s of [-1, 1]) k.sphere(0.065, cloth, [s * 0.19, 0.14, 0], 7, null, [0, 0, 0], 'local');         // shoulders
    if (o.pack) {   // ALICE medium pack (LC-1): main bag, top flap, three outer pockets, cargo straps, a poncho roll under it
      k.box(0.32, 0.36, 0.16, od, [0, 0.05, 0.22]); k.box(0.3, 0.08, 0.17, od, [0, 0.25, 0.22], [0.2, 0, 0]);
      for (const s of [-1, 1]) k.box(0.09, 0.14, 0.06, od, [s * 0.11, -0.03, 0.33]);
      k.box(0.09, 0.12, 0.055, od, [0, 0.0, 0.325]);
      for (const s of [-1, 1]) k.box(0.025, 0.4, 0.012, web, [s * 0.07, 0.07, 0.305]);    // flap straps
      k.cyl(0.055, 0.055, 0.34, 0x4f5236, [0, -0.17, 0.22], 'x', 8);                       // poncho / liner roll
    }
  });
  put('neck', k => { k.cyl(0.05, 0.055, 0.1, skin, [0, 0.03, 0], 'y', 8); });
  // head + M1 helmet with the Mitchell cover, band, chin straps hanging, and the bug-juice bottle in the band
  put('head', k => {
    k.sphere(0.1, CAMO.vary(skin, 0.06, 0.04), [0, 0.11, -0.01], 9, [0.78, 1.0, 0.98]);                  // skull / face
    k.box(0.12, 0.07, 0.11, skin, [0, 0.045, -0.04]);                                        // jaw
    k.box(0.03, 0.045, 0.03, skin, [0, 0.085, -0.11]);                                      // nose
    k.box(0.12, 0.012, 0.02, 0x2a2018, [0, 0.125, -0.1]);                                   // brows
    for (const s of [-1, 1]) { k.box(0.025, 0.012, 0.01, 0xeeeeea, [s * 0.035, 0.11, -0.103]); k.box(0.012, 0.012, 0.008, 0x1a1410, [s * 0.035, 0.11, -0.107]); k.box(0.02, 0.05, 0.035, skin, [s * 0.078, 0.1, 0.0]); }   // eyes, ears
    if (sk.kit.helmet) {
      k.sphere(0.152, CAMO.mitchell(0.045), [0, 0.15, 0.005], 10, [1, 0.78, 1.08], [0, 0, 0], 'local', [0, Math.PI * 2], [0, Math.PI * 0.55]);   // dome
      k.cyl(0.162, 0.168, 0.025, CAMO.mitchell(0.045), [0, 0.13, 0.005], 'y', 14, null, false, 'local');        // flared rim
      k.cyl(0.155, 0.155, 0.025, 0x3c3f28, [0, 0.165, 0.005], 'y', 14);                                          // band
      k.box(0.025, 0.06, 0.018, 0xd8d6c8, [0.12, 0.175, -0.07], [0, 0.6, 0.1]);                                  // insect repellent bottle
      for (const s of [-1, 1]) k.box(0.012, 0.12, 0.005, 0x4a4a32, [s * 0.09, 0.07, 0.02], [0, 0, s * 0.15]);    // chin straps, unbuckled
    }
  });
  const arm = (side) => {
    const s = side === 'L' ? -1 : 1;
    put('upperArm' + side, k => { k.cyl(0.055, 0.048, 0.3, cloth, [0, -0.15, 0], 'y', 7, null, false, 'local'); });
    put('forearm' + side, k => { k.cyl(0.046, 0.04, 0.26, cloth, [0, -0.13, 0], 'y', 7, null, false, 'local'); k.cyl(0.044, 0.044, 0.025, CAMO.erdl(0.1, 3), [0, -0.255, 0], 'y', 7);
      if (side === 'L') { k.box(0.06, 0.02, 0.07, 0x2a2b22, [0, -0.25, 0], [0, 0, 0]); } });   // watch band (left wrist)
    put('hand' + side, k => { k.box(0.085, 0.1, 0.035, skin, [0, -0.05, 0]); k.box(0.08, 0.06, 0.04, skin, [0, -0.115, -0.012], [0.6, 0, 0]); k.box(0.03, 0.06, 0.03, skin, [s * -0.045, -0.04, -0.02], [0.3, 0, s * 0.4]); });
  };
  arm('L'); arm('R');
  const leg = (side) => {
    const s = side === 'L' ? -1 : 1;
    put('thigh' + side, k => { k.cyl(0.085, 0.065, 0.44, cloth, [0, -0.22, 0], 'y', 8, null, false, 'local'); k.box(0.04, 0.16, 0.13, cloth, [s * 0.075, -0.24, -0.01], [0, 0, 0], 2, 'local'); k.box(0.045, 0.03, 0.135, cloth, [s * 0.078, -0.155, -0.01]); });   // cargo pocket + flap
    put('shin' + side, k => { k.cyl(0.062, 0.055, 0.3, cloth, [0, -0.13, 0], 'y', 8, null, false, 'local'); k.cyl(0.066, 0.062, 0.05, cloth, [0, -0.29, 0], 'y', 8, null, false, 'local');   // bloused trousers
      k.cyl(0.058, 0.055, 0.12, COL.leather, [0, -0.36, 0], 'y', 8); });   // boot upper
    put('foot' + side, k => { k.box(0.1, 0.075, 0.25, COL.leather, [0, -0.025, -0.06]); k.box(0.105, 0.022, 0.26, 0x0c0c0c, [0, -0.06, -0.06]); k.box(0.09, 0.03, 0.06, COL.leather, [0, -0.01, -0.17], [0.3, 0, 0]); });
  };
  leg('L'); leg('R');
  sk.setWeapon = key => {
    if (sk.weaponModel) { sk.root.remove(sk.weaponModel.group); sk.weaponModel = null; }
    sk.weaponKey = key || null;
    if (key) { sk.weaponModel = buildWeaponModel(key, { detail: o.detail || 'low' }); sk.root.add(sk.weaponModel.group); }
  };
  sk.setWeapon(o.weapon === undefined ? 'M16A1' : o.weapon);
  return sk;
}

// ------------------------------------------------------------------------------------------------ the poser
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4();
const _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _down = new THREE.Vector3(0, -1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _eye = new THREE.Vector3();
const POSE_BONES = ['pelvis', 'spine', 'chest', 'neck', 'head', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'upperArmL', 'forearmL', 'upperArmR', 'forearmR'];
// one stance's pose: Euler angles per bone + pelvis position, as plain numbers
function stancePose(st, p, out) {
  const ph = p.gaitPhase || 0, sp = p.speed || 0, dirF = (p.moveF ?? sp) >= -0.05 ? 1 : -1, side = clamp((p.moveR || 0) / Math.max(0.3, sp), -1, 1);
  const E = out.e; for (const n of POSE_BONES) { E[n] = E[n] || [0, 0, 0]; E[n][0] = E[n][1] = E[n][2] = 0; }
  out.pos[0] = 0; out.pos[1] = 0.98; out.pos[2] = 0;
  const s = Math.sin(ph) * dirF, c = Math.cos(ph) * dirF;
  if (st === 'stand') {
    const run = clamp((sp - 1.3) / 2, 0, 1), spr = p.gait === 'sprint' ? 1 : 0, mv = clamp(sp / 1.2, 0, 1);
    const At = mv * (0.32 + 0.3 * run + 0.15 * spr) * (1 - 0.6 * Math.abs(side)), Ak = mv * (0.5 + 0.7 * run);
    E.thighL[0] = s * At - 0.05 * run; E.thighR[0] = -s * At - 0.05 * run;
    E.thighL[2] = -s * 0.3 * side * mv; E.thighR[2] = s * 0.3 * side * mv;
    E.shinL[0] = -Ak * (0.15 + 0.85 * Math.max(0, Math.sin(ph + 1.3) * dirF)) - 0.05; E.shinR[0] = -Ak * (0.15 + 0.85 * Math.max(0, -Math.sin(ph + 1.3) * dirF)) - 0.05;
    E.footL[0] = 0.15 * mv * c; E.footR[0] = -0.15 * mv * c;
    out.pos[1] = 0.98 - mv * (0.02 + 0.04 * run) * Math.abs(Math.cos(ph)) - 0.02 * run;
    E.spine[0] = -0.04 * mv - 0.18 * spr - 0.06 * run; E.spine[1] = 0.08 * s * mv;
    E.pelvis[1] = -0.08 * s * mv;
    if (p.limp > 0.3) { E.thighL[0] *= 0.4; E.shinL[0] *= 0.3; out.pos[1] -= 0.03 * Math.max(0, s); }
  } else if (st === 'crouch') {
    const mv = clamp(sp / 0.5, 0, 1);
    // kneeling (still): right knee down, left foot forward. crouch-walk (moving): both knees bent, cycling
    const kneel = 1 - mv;
    E.thighR[0] = -0.1 * kneel + mv * (0.75 - s * 0.35); E.shinR[0] = -1.5 * kneel + mv * (-1.25 - 0.4 * Math.max(0, -s)); E.footR[0] = 0.75 * kneel + mv * 0.45;
    E.thighL[0] = 1.45 * kneel + mv * (0.75 + s * 0.35); E.shinL[0] = -1.45 * kneel + mv * (-1.25 - 0.4 * Math.max(0, s)); E.footL[0] = 0.0 * kneel + mv * 0.45;
    E.thighL[2] = -0.12 * kneel; E.thighR[2] = 0.05 * kneel;
    out.pos[1] = 0.55 * kneel + 0.68 * mv - 0.02 * mv * Math.abs(c); out.pos[2] = 0.02 * kneel;
    E.spine[0] = -0.12 - 0.12 * mv; E.chest[0] = 0.04;
  } else if (st === 'prone') {
    // lying on the belly, head toward -z; up on the elbows, legs apart, toes down; crawl: alternate knee pulls
    const mv = clamp(sp / 0.2, 0, 1);
    E.pelvis[0] = -Math.PI / 2 + 0.04; out.pos[1] = 0.14; out.pos[2] = 0.68;
    E.spine[0] = 0.14; E.chest[0] = 0.3; E.neck[0] = 0.45;
    E.thighL[2] = -0.16; E.thighR[2] = 0.16; E.footL[0] = 1.2; E.footR[0] = 1.2;
    E.thighL[0] = mv * (0.35 + 0.35 * s); E.thighR[0] = mv * (0.35 - 0.35 * s);
    E.shinL[0] = -mv * (0.6 + 0.6 * Math.max(0, s)) - 0.05; E.shinR[0] = -mv * (0.6 + 0.6 * Math.max(0, -s)) - 0.05;
    E.thighL[1] = -0.2 * mv * s; E.thighR[1] = -0.2 * mv * s;
    E.spine[1] = 0.1 * mv * s; out.pos[0] = 0.03 * mv * s;
  } else if (st === 'down') {   // wounded / unconscious, on the back
    E.pelvis[0] = Math.PI / 2 - 0.05; out.pos[1] = 0.13; out.pos[2] = -0.6;
    E.chest[0] = 0.1; E.head[0] = -0.3; E.head[1] = 0.6; E.thighL[2] = -0.15; E.thighR[0] = 0.4; E.shinR[0] = -0.8; E.thighR[2] = 0.1; E.footL[0] = -0.6;
  } else if (st === 'sit') {   // ngc/marine-polish: on a troop seat / bench (the seat 0.45 m over the feet), knees apart
    E.thighL[0] = E.thighR[0] = 1.5; E.shinL[0] = E.shinR[0] = -1.45; E.footL[0] = E.footR[0] = -0.05;
    E.thighL[2] = -0.14; E.thighR[2] = 0.14; E.thighL[1] = 0.12; E.thighR[1] = -0.12;
    out.pos[1] = 0.52; out.pos[2] = 0.06; E.spine[0] = -0.12; E.chest[0] = -0.04; E.neck[0] = 0.08;
  } else if (st === 'climb') {   // ngc/marine-polish: on a ladder - hand over hand, a knee up to the next rung (p.climb: m climbed)
    const c = (p.climb || 0) / 0.6 * Math.PI * 2, a = Math.sin(c);
    E.thighL[0] = 0.45 + 0.4 * a; E.thighR[0] = 0.45 - 0.4 * a; E.shinL[0] = -0.7 - 0.5 * a; E.shinR[0] = -0.7 + 0.5 * a;
    E.footL[0] = 0.25; E.footR[0] = 0.25; out.pos[1] = 0.9; out.pos[2] = 0.08; E.spine[0] = -0.06; E.neck[0] = 0.15;
  } else if (st === 'swim') {   // ngc/marine-polish: breaststroke, head up (p.swim = { ph 0..1, speed })
    const sw = p.swim || {}, mv = clamp((sw.speed || 0) / 0.6, 0, 1), ph = (sw.ph || 0) * Math.PI * 2, kick = Math.max(0, Math.sin(ph + 2.2));
    E.pelvis[0] = -(0.35 + 0.75 * mv); out.pos[1] = 1.0 + 0.2 * mv; out.pos[2] = 0.35 * mv;
    E.neck[0] = 0.35 + 0.5 * mv; E.head[0] = 0.15 * mv;
    E.thighL[0] = E.thighR[0] = 0.15 + (0.25 + 0.5 * mv) * kick; E.shinL[0] = E.shinR[0] = -0.3 - 1.3 * kick;
    E.thighL[2] = -0.12 - 0.35 * kick * mv; E.thighR[2] = 0.12 + 0.35 * kick * mv; E.footL[0] = E.footR[0] = 0.6;
  }
  // lean: roll the spine and chest (prone: roll the whole body a little)
  const lean = p.lean || 0;
  if (st === 'prone') { E.pelvis[2] -= lean * 0.18; } else { E.spine[2] -= lean * 0.16; E.chest[2] -= lean * 0.14; out.pos[0] += lean * 0.06; }
  // breathing
  E.chest[0] += (p.breath || 0) * 0.015;
  return out;
}
const _poseA = { e: {}, pos: [0, 0, 0] }, _poseB = { e: {}, pos: [0, 0, 0] };
const HANDS_RATE = 4;   // 1 / s: ~0.25 s to let go of the rifle (or take it up again)
const GREN_GEO = m67Geometry(), GREN_MAT = grenadeMaterial();   // M67 (ngc/marine-polish: grenademodel.js, fuze, spoon and ring)
const _hR = new THREE.Vector3(), _hL = new THREE.Vector3(), _pR = new THREE.Vector3(), _pL = new THREE.Vector3(), _mw = new THREE.Vector3(), _pch = new THREE.Vector3();
// arms: solve shoulder -> elbow -> hand to a target (all in WORLD space), elbow toward `pole`
function ikArm(sk, side, target, pole) {
  const up = sk.bones['upperArm' + side], fo = sk.bones['forearm' + side];
  up.updateWorldMatrix(true, false);
  const S = up.getWorldPosition(_a), a = LEN.upperArm, b = LEN.forearm;
  const d = _v.subVectors(target, S); let L = d.length(); L = clamp(L, 0.08, a + b - 0.002); d.normalize();
  const x = (a * a - b * b + L * L) / (2 * L), h = Math.sqrt(Math.max(0, a * a - x * x));
  const pp = _w.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
  const E = _b.copy(S).addScaledVector(d, x).addScaledVector(pp, h);
  // upper arm: rest direction -y in the parent (chest) frame
  up.parent.getWorldQuaternion(_pq);
  const dl = _v.subVectors(E, S).normalize().applyQuaternion(_pq.invert());
  up.quaternion.setFromUnitVectors(_down, dl);
  up.updateWorldMatrix(false, false);
  up.getWorldQuaternion(_pq);
  const T = _w.copy(target).sub(E).normalize().applyQuaternion(_pq.invert());
  fo.quaternion.setFromUnitVectors(_down, T);
  fo.updateWorldMatrix(false, false);
}
// pose: soldier.pose() plus { cls: weapon class, weaponState (for the weapon model), action: { name, p } }
export function poseSkeleton(sk, pose, dt = 0.016) {
  const B = sk.bones, st = sk.state;
  st.t += dt;
  const from = pose.stanceT < 1 ? pose.stanceFrom : pose.stance, to = pose.stanceT < 1 ? pose.stanceTo : pose.stance, k = pose.stanceT < 1 ? sstep(pose.stanceT) : 1;
  const st2 = pose.down ? 'down' : pose.seat ? 'sit' : pose.climb != null ? 'climb' : pose.swim ? 'swim' : null;   // (ngc/marine-polish: seated, ladder, swimming)
  stancePose(st2 || from, pose, _poseA); stancePose(st2 || to, pose, _poseB);
  for (const n of POSE_BONES) {
    const ea = _poseA.e[n], eb = _poseB.e[n];
    _q.setFromEuler(_e.set(ea[0], ea[1], ea[2], 'YXZ')); _q2.setFromEuler(_e.set(eb[0], eb[1], eb[2], 'YXZ'));
    B[n].quaternion.copy(_q).slerp(_q2, k);
  }
  const P = _poseA.pos, Q = _poseB.pos;
  B.pelvis.position.set(P[0] + (Q[0] - P[0]) * k, P[1] + (Q[1] - P[1]) * k, P[2] + (Q[2] - P[2]) * k);
  // ngc/infdepth: the hands off the rifle (pose.hands: carepose.js - a drag, a fireman's carry, buddy aid, the grenade
  // drill). Blended in and out over ~0.25 s (the last targets are kept for the way out), with the rifle going onto the
  // back (pose.sling) and the back bent / turned by the same weight
  const C = st.care || (st.care = { w: 0, h: null, sl: 0 });
  if (pose.hands) { C.h = pose.hands; C.sl = pose.sling ?? 1; }
  C.w = clamp(C.w + clamp((pose.hands ? 1 : 0) - C.w, -dt * HANDS_RATE, dt * HANDS_RATE), 0, 1);
  if (!pose.hands && C.w <= 0) C.h = null;
  const hw = C.h ? sstep(C.w) : 0, H = hw > 0 ? C.h : null;
  if (H) {
    if (H.spine) { _q.setFromEuler(_e.set(H.spine[0] * hw, H.spine[1] * hw, H.spine[2] * hw, 'YXZ')); B.spine.quaternion.multiply(_q); }
    if (H.chest) { _q.setFromEuler(_e.set(H.chest[0] * hw, H.chest[1] * hw, H.chest[2] * hw, 'YXZ')); B.chest.quaternion.multiply(_q); }
    if (H.dy) B.pelvis.position.y += H.dy * hw;
  }
  const sling = H ? C.sl * hw : 0;
  // the grenade in his right hand (pose.grenade: through the drill until it leaves the hand)
  if (pose.grenade && !sk.gren) { sk.gren = new THREE.Mesh(GREN_GEO, GREN_MAT); sk.gren.position.set(0, -0.08, -0.02); B.handR.add(sk.gren); }
  if (sk.gren) sk.gren.visible = !!pose.grenade;
  // aim: chest takes part of the pitch and yaw, neck and head the rest (+ free look)
  const prone = (to === 'prone' ? k : 0) + (from === 'prone' ? 1 - k : 0);
  const aimP = clamp(pose.aimPitch || 0, -1.2, 1.2), aimY = clamp(pose.aimYaw || 0, -0.6, 0.6);
  _q.setFromEuler(_e.set(aimP * 0.45 * (1 - prone), aimY * 0.5, 0, 'YXZ')); B.chest.quaternion.multiply(_q);
  _q.setFromEuler(_e.set(aimP * 0.3 + (pose.headPitch || 0) * 0.5 - 0.0, (pose.headYaw || 0) * 0.4 + aimY * 0.2, 0, 'YXZ')); B.neck.quaternion.multiply(_q);
  _q.setFromEuler(_e.set(aimP * (0.25 + 0.4 * prone) + (pose.headPitch || 0) * 0.5 + 0.5 * prone, (pose.headYaw || 0) * 0.6 + aimY * 0.3, 0, 'YXZ')); B.head.quaternion.multiply(_q);
  sk.root.updateMatrixWorld(true);
  // weapon placement + arm IK
  const W = sk.weaponModel;
  if (W) {
    const g = W.group, cls = pose.cls || 'rifle';
    B.head.localToWorld(_eye.set(...EYE_LOCAL));
    sk.root.worldToLocal(_eye);
    // the weapon frame. On the sights: the rear sight eyeRelief in front of the eye. Low ready / port arms: the butt
    // stays in the shoulder pocket and the muzzle drops (or swings across the chest); the two blend with the ADS amount.
    const ads = pose.ads || 0, spr = pose.lower || 0, er = (W.sight && W.sight.eyeRelief) || 0.075;
    _q.setFromEuler(_e.set(aimP, aimY, 0, 'YXZ'));
    _a.set(0, 0, -er).applyQuaternion(_q).add(_eye);                                  // ADS origin
    const lowPitch = cls === 'pistol' ? -0.75 : cls === 'law' ? -0.1 : -0.6 * (1 - 0.7 * prone);
    _q2.setFromEuler(_e.set(aimP * 0.3 + lowPitch - spr * 0.1, aimY * 0.5 + spr * 0.9, -spr * 0.5, 'YXZ'));
    if (cls === 'pistol') {   // pistol at the low ready: arms half out, muzzle down, in front of the chest
      _b.set(0.04, 0.02, -0.38); B.chest.localToWorld(_b); sk.root.worldToLocal(_b);
    } else {                  // butt in the right shoulder pocket
      const bt = W.anchors.butt || [0, -0.1, 0.3]; _b.set(0.15, 0.13, -0.12); B.chest.localToWorld(_b); sk.root.worldToLocal(_b);
      _b.sub(_v.set(bt[0], bt[1], bt[2]).applyQuaternion(_q2));
    }
    const k2 = ads * ads * (3 - 2 * ads);
    g.position.copy(_b).lerp(_a, k2); g.quaternion.copy(_q2).slerp(_q, k2);
    // ngc/infdepth: slung across the back, muzzle up over the left shoulder (both hands busy: a casualty, a grenade)
    if (sling > 0) {
      _b.set(0.02, 0.02, 0.2); B.chest.localToWorld(_b); sk.root.worldToLocal(_b);
      B.chest.getWorldQuaternion(_wq); sk.root.getWorldQuaternion(_pq); _q.copy(_pq.invert().multiply(_wq)).multiply(_q2.setFromEuler(_e.set(1.35, 0, 0.55, 'XYZ')));
      g.position.lerp(_b, sling); g.quaternion.slerp(_q, sling);
    }
    // ngc/marine-polish: seated (a troop seat, a bench) the rifle stands upright between the knees, the butt on the floor,
    // muzzle up, both hands on it (the way a squad rides in a CH-46 or a Huey)
    if (pose.seat && sling <= 0) {
      const bt = W.anchors.butt || [0, -0.1, 0.3];
      _q.setFromEuler(_e.set(Math.PI / 2 - 0.12, 0, 0, 'XYZ'));
      g.quaternion.copy(_q); g.position.set(0, 0.03, -0.42).sub(_v.set(bt[0], bt[1], bt[2]).applyQuaternion(_q));
    }
    if (pose.weaponState) W.setState(pose.weaponState);
    g.updateMatrixWorld(true);
    // hands to the anchors (reload: the left hand goes to the magazine / pouch)
    const act = pose.action, R = _hR, L = _hL;
    g.localToWorld(W.anchor(cls === 'law' ? 'grip' : 'grip', R));
    let fore = cls === 'mg' && prone > 0.5 ? 'stockTop' : 'fore';
    if (cls === 'gl') fore = 'magGrip';
    g.localToWorld(W.anchor(fore, L));
    if (cls === 'pistol') g.localToWorld(W.anchor('fore', L));
    if (act && act.p < 1 && /reload|speed|tactical|checkMag|ia|charge|barrel/.test(act.name)) {
      const pouch = B.pelvis.localToWorld(_pch.set(-0.1, 0.0, -0.17)), mw = g.localToWorld(W.anchor(act.name === 'charge' || act.name === 'ia' ? 'charging' : 'magwell', _mw));
      const w = Math.sin(Math.PI * act.p);
      L.lerp(act.p < 0.5 ? mw : pouch, w);
    }
    const poleR = _pR.set(0.6, -1, 0.3).applyQuaternion(sk.root.getWorldQuaternion(_wq)), poleL = _pL.set(-0.5, -1, 0.1).applyQuaternion(_wq);
    ikArm(sk, 'R', R, poleR); ikArm(sk, 'L', L, poleL);
    // hands follow the weapon's orientation (palm in), wrists straight-ish
    for (const sd of ['L', 'R']) { const hnd = B['hand' + sd]; hnd.parent.getWorldQuaternion(_pq); g.getWorldQuaternion(_wq); _q.setFromEuler(_e.set(-Math.PI / 2 + 0.3, 0, sd === 'L' ? 0.5 : -0.4, 'XYZ')); hnd.quaternion.copy(_pq.invert().multiply(_wq).multiply(_q)); }
  } else {
    // empty hands: arms hang, swing with the gait
    const s = Math.sin(pose.gaitPhase || 0) * clamp((pose.speed || 0) / 2, 0, 1);
    B.upperArmL.quaternion.setFromEuler(_e.set(-s * 0.5, 0, -0.08)); B.upperArmR.quaternion.setFromEuler(_e.set(s * 0.5, 0, 0.08));
    B.forearmL.quaternion.setFromEuler(_e.set(0.3, 0, 0)); B.forearmR.quaternion.setFromEuler(_e.set(0.3, 0, 0));
  }
  // ngc/infdepth: the hands somewhere else (drag strap, a casualty on the shoulders, a grenade drill, a wound being
  // dressed): pose.hands = { L?: [x, y, z], R?: [x, y, z] } in the figure's own frame (feet origin, facing -z)
  // (blended from where the hands are now - on the rifle, or hanging - to the targets)
  if (H) {
    sk.root.updateMatrixWorld(true);
    const lift = H.stand ? B.pelvis.position.y - 0.98 : 0;   // (targets for a standing man follow him down onto a knee)
    const poleR = _pR.set(0.6, -1, 0.3).applyQuaternion(sk.root.getWorldQuaternion(_wq)), poleL = _pL.set(-0.6, -1, 0.3).applyQuaternion(_wq);
    for (const sd of ['L', 'R']) {
      const t = H[sd]; if (!t) continue;
      const hnd = B['hand' + sd], T = sd === 'L' ? _hL : _hR;
      hnd.getWorldPosition(T); sk.root.localToWorld(_mw.set(t[0], t[1] + lift, t[2])); T.lerp(_mw, hw);
      _q2.copy(hnd.quaternion);
      ikArm(sk, sd, T, sd === 'L' ? poleL : poleR);
      hnd.quaternion.copy(_q2).slerp(_q.setFromEuler(_e.set(-0.3, 0, 0)), hw);
    }
  }
  sk.root.updateMatrixWorld(true);
}
// a stand-alone pose for previews / AI (no soldier sim): stance, gait, speed, phase, aim...
export function makePose(o = {}) {
  return { stance: 'stand', stanceFrom: 'stand', stanceTo: 'stand', stanceT: 1, speed: 0, gait: 'idle', gaitPhase: 0, lean: 0, ads: 0, lower: 0, aimPitch: 0, aimYaw: 0, headYaw: 0, headPitch: 0, moveF: 0, moveR: 0, breath: 0, cls: 'rifle', ...o };
}
