// Seized modern MBTs, exterior models at their published overall dimensions (mbt.js MBT params):
//   M1A2 SEPv3 - CARC tan; long flat hull, faceted turret with a deep bustle rack, CROWS remote weapon station, CITV on
//                its post, gunner's sight doghouse, side skirts, 7 road wheels, rear sprocket.
//   T-90M      - Russian green; low hull, chevron of reactive-armour wedges on the turret front and a V of tiles on the
//                glacis, big bustle box with a slat cage, 6 road wheels, rubber skirts with ERA panels.
// Both weathered (dust, scuffs) and REFITTED by the RUNAWAY (BIBLE): a ceramic sensor pod bolted on the roof, cyan
// IFF strips, crude machine glyph stencils painted over the old national markings.
// Local frame: origin on the ground under the hull centre, -z forward. API: buildMBT(type) -> { group, update(T, dt, time), parts }
import * as THREE from 'three';
import { Kit, RW, rwMats, stencilTex, decal, setBodyMat } from './rwkit.js';
import { MBT } from './mbt.js';

const LOOK = {
  m1a2: { base: 0xb4a07a, base2: 0xa38f6b, dirt: 0x8a7a5d, dark: 0x3e3a33, metal: 0x5c5850, rubber: 0x1f1f1d, track: 0x37352f },
  t90m: { base: 0x6a7550, base2: 0x5d6746, dirt: 0x7a7459, dark: 0x30342a, metal: 0x4d5048, rubber: 0x1c1d1a, track: 0x34332d },
};

// running gear on one side (s = -1 left, +1 right): road wheels, sprocket (aft), idler (front), return rollers, track
function runningGear(k, P, L, s) {
  const x = s * (P.gauge / 2), tw = P.trackW, hl = P.contactL / 2, r = P.wheelR;
  const wz = []; for (let i = 0; i < P.wheels; i++) wz.push(-hl + r * 0.9 + i * (P.contactL - r * 1.8) / (P.wheels - 1));
  // track: bottom run, top run, sloped ends
  const zf = -P.hullL / 2 + 0.25, zr = P.hullL / 2 - 0.3, yTop = r * 2 + 0.28;
  k.box(tw, 0.08, P.contactL + 0.2, x, 0.04, 0, L.track);
  k.box(tw, 0.07, zr - zf - 0.4, x, yTop, (zf + zr) / 2, L.track);
  const end = (z0, y0, z1, y1) => { const dz = z1 - z0, dy = y1 - y0, l = Math.hypot(dz, dy); k.box(tw, 0.08, l, x, (y0 + y1) / 2, (z0 + z1) / 2, L.track, [-Math.atan2(dy, dz), 0, 0]); };
  end(-hl - 0.05, 0.04, zf - 0.05, yTop - 0.15); end(zf - 0.05, yTop - 0.15, zf + 0.25, yTop); end(hl + 0.05, 0.04, zr + 0.05, yTop - 0.1); end(zr + 0.05, yTop - 0.1, zr - 0.25, yTop);
  for (let i = 0; i < 18; i++) k.box(tw + 0.02, 0.03, 0.06, x, 0.085, -hl + i * P.contactL / 17, L.dark);   // track pads (grousers)
  return { x, wz, zf, zr, yTop };
}
function wheelGeo(r, w, L) {
  const k = new Kit();
  k.cyl(r, r, w, 14, 0, 0, 0, L.rubber, [0, 0, Math.PI / 2]);
  k.cyl(r * 0.8, r * 0.8, w + 0.02, 14, 0, 0, 0, L.base2, [0, 0, Math.PI / 2]);
  k.cyl(r * 0.25, r * 0.25, w + 0.06, 8, 0, 0, 0, L.metal, [0, 0, Math.PI / 2]);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; k.box(w + 0.04, 0.04, r * 0.5, 0, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, L.dark); }
  return k;
}
function sprocketGeo(r, w, L) {
  const k = new Kit();
  k.cyl(r * 0.85, r * 0.85, w, 12, 0, 0, 0, L.metal, [0, 0, Math.PI / 2]);
  for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2; k.box(w * 0.8, 0.07, 0.09, 0, Math.cos(a) * r, Math.sin(a) * r, L.dark, [a, 0, 0]); }
  k.cyl(r * 0.3, r * 0.3, w + 0.08, 8, 0, 0, 0, L.base2, [0, 0, Math.PI / 2]);
  return k;
}
// RUNAWAY refit kit on a turret roof: a ceramic sensor pod on a bracket, cyan IFF strips
function refit(k, x, y, z) {
  k.box(0.08, 0.3, 0.08, x, y + 0.15, z, RW.composite);
  k.box(0.42, 0.24, 0.32, x, y + 0.42, z, RW.ceramic, [0, 0.4, 0]);
  k.box(0.3, 0.1, 0.02, x - 0.06, y + 0.42, z - 0.17, RW.lensDark, [0, 0.4, 0]);
  k.glowDisc(0.04, x - 0.12, y + 0.42, z - 0.19, [0, Math.PI + 0.4, 0], 10);
  k.box(0.02, 0.02, 0.6, x + 0.1, y + 0.6, z + 0.25, RW.composite, [-0.5, 0, 0]);   // whip antenna stub
}

// ------------------------------------------------------------------------------------------- M1A2 SEPv3
function m1Hull(P, L) {
  const k = new Kit(), hl = P.hullL / 2, deck = 1.62, belly = P.clearance, hw = 1.72;
  // lower hull between the tracks + upper hull over them
  k.box(2.2, deck - belly - 0.3, P.hullL - 1.2, 0, belly + (deck - belly - 0.3) / 2, 0.2, L.base2);
  k.box(hw * 2, 0.32, P.hullL - 0.6, 0, deck - 0.16, 0.25, L.base);
  // glacis: shallow upper plate, steep lower plate
  k.box(hw * 2 - 0.1, 0.08, 1.9, 0, deck - 0.3, -hl + 0.95, L.base, [-0.14, 0, 0]);
  k.box(2.3, 0.08, 1.15, 0, belly + 0.38, -hl + 0.42, L.base2, [0.95, 0, 0]);
  k.box(1.0, 0.18, 0.4, 0, deck - 0.1, -hl + 0.5, L.dark);   // driver's hatch / periscopes
  for (const x of [-0.25, 0, 0.25]) k.box(0.18, 0.06, 0.08, x, deck + 0.0, -hl + 0.33, 0x1d2428);
  // engine deck: grilles, rear plate, exhaust
  for (let i = 0; i < 6; i++) k.box(2.6, 0.03, 0.08, 0, deck + 0.01, hl - 2.2 + i * 0.32, L.dark);
  k.box(2.7, 0.9, 0.12, 0, deck - 0.5, hl - 0.05, L.base2);
  k.box(1.8, 0.5, 0.05, 0, deck - 0.45, hl + 0.02, 0x2c2b28);   // exhaust grille
  // side skirts (cover the top of the wheels), with panel lines and dust
  for (const s of [-1, 1]) {
    k.box(0.07, 0.95, P.hullL - 0.25, s * (P.W / 2 - 0.035), deck - 0.58, -0.05, L.base);
    for (let i = 0; i < 7; i++) k.box(0.075, 0.93, 0.02, s * (P.W / 2 - 0.03), deck - 0.58, -hl + 0.6 + i * 1.05, L.base2);
    k.box(0.076, 0.28, P.hullL - 0.25, s * (P.W / 2 - 0.03), deck - 0.92, -0.05, L.dirt);
    k.box(0.4, 0.08, 1.0, s * 1.35, deck + 0.02, hl - 0.8, L.base2);   // stowage boxes
  }
  // headlights / tow hooks
  for (const s of [-1, 1]) { k.box(0.18, 0.14, 0.12, s * 1.45, deck - 0.12, -hl + 0.15, L.dark); k.box(0.12, 0.12, 0.15, s * 0.8, belly + 0.6, -hl + 0.05, L.metal); }
  // RUNAWAY: cyan IFF strip across the rear plate, glyph over the hull number
  k.glowBox(1.2, 0.05, 0.01, 0, deck - 0.22, hl + 0.02);
  for (let i = 0; i < 8; i++) k.box(0.025 + (i % 3) * 0.015, 0.16, 0.01, 0.4 + i * 0.06, deck - 0.4, -hl + 0.25, RW.glyph, [-0.14, 0, 0]);
  return k;
}
function m1Turret(P, L) {
  // origin at the turret ring centre on the deck; -z forward; height 0.82 to the roof (2.44 overall)
  const k = new Kit(), H = 0.82;
  // faceted body: front cheeks angled, flat sides, long bustle
  // plan: narrow at the mantlet, cheeks angling out to full width, straight sides back to the bustle (the M1's
  // flat-sided slab turret seen from above); the roof steps down slightly at the front
  const plan = [[-1.0, -2.05], [1.0, -2.05], [1.75, -0.85], [1.72, 1.95], [-1.72, 1.95], [-1.75, -0.85]];
  k.prism(plan, 0, H, L.base, 0.97);
  k.prism([[-0.95, -2.0], [0.95, -2.0], [1.65, -0.85], [1.62, 1.88], [-1.62, 1.88], [-1.65, -0.85]], H, 0.04, L.base2, 0.99);
  k.box(2.0, 0.62, 0.28, 0, H * 0.48, -1.95, L.base2);                  // mantlet
  // bustle rack (a basket of rails behind the bustle) with stowage
  k.box(3.3, 0.05, 0.9, 0, H * 0.4, 2.45, L.dark); k.box(3.3, 0.5, 0.05, 0, H * 0.6, 2.88, L.dark);
  for (const s of [-1, 1]) k.box(0.05, 0.5, 0.9, s * 1.62, H * 0.6, 2.45, L.dark);
  k.box(1.4, 0.38, 0.6, -0.6, H * 0.62, 2.45, 0x5d5a45); k.box(0.9, 0.3, 0.55, 0.8, H * 0.6, 2.45, 0x4f5a3b);
  // gunner's primary sight doghouse (right front), CITV on its post (left front), loader's hatch + M240 (left)
  k.box(0.55, 0.4, 0.8, 0.85, H + 0.2, -1.35, L.base2); k.box(0.45, 0.25, 0.04, 0.85, H + 0.22, -1.76, 0x1d2428);
  k.cyl(0.08, 0.08, 0.35, 8, -0.95, H + 0.17, -1.2, L.metal);
  k.box(0.42, 0.4, 0.42, -0.95, H + 0.52, -1.2, L.base2); k.box(0.3, 0.25, 0.03, -0.95, H + 0.52, -1.42, 0x1d2428);
  k.cyl(0.45, 0.45, 0.08, 12, -0.85, H + 0.04, 0.2, L.base2);
  k.box(0.08, 0.1, 1.0, -0.85, H + 0.35, -0.2, L.dark);
  // commander's station + CROWS remote weapon station (M2) on the right
  k.cyl(0.5, 0.5, 0.1, 12, 0.8, H + 0.05, 0.3, L.base2);
  k.box(0.5, 0.45, 0.55, 0.8, H + 0.4, 0.3, L.base2);
  k.box(0.12, 0.12, 1.4, 0.68, H + 0.55, -0.35, L.dark);                // M2 barrel
  k.box(0.3, 0.3, 0.3, 1.05, H + 0.45, 0.2, 0x1d2428);                  // CROWS sight box
  // smoke grenade launchers (front sides), turret side stowage, a crude glyph over the old marking
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) k.cyl(0.045, 0.045, 0.25, 6, s * (1.6 - (i % 3) * 0.08), H * 0.5 + Math.floor(i / 3) * 0.1, -1.45 + (i % 3) * 0.12, L.dark, [-0.6, 0, s * 0.4]);
  for (const s of [-1, 1]) k.box(0.04, 0.4, 0.8, s * 1.76, H * 0.55, 0.9, RW.glyph);   // painted-over marking block
  // RUNAWAY refit: sensor pod on the CROWS mount, IFF strips along both turret sides
  refit(k, 0.85, H + 0.62, 0.55);
  for (const s of [-1, 1]) k.glowBox(0.01, 0.05, 2.0, s * 1.77, H * 0.82, 0.6);
  return k;
}
function m1Gun(P, L) {
  const k = new Kit(), len = P.gunL;
  k.box(0.6, 0.5, 0.6, 0, 0, 0.0, L.base2);                               // gun shield root
  k.cyl(0.17, 0.15, len * 0.6, 12, 0, 0, -len * 0.3 - 0.2, L.base2, [Math.PI / 2, 0, 0]);   // thermal sleeve
  k.cyl(0.13, 0.12, len * 0.45, 12, 0, 0, -len * 0.78, L.base2, [Math.PI / 2, 0, 0]);
  k.box(0.1, 0.08, 0.15, 0, 0.13, -len + 0.25, L.dark);                  // muzzle reference sensor
  return k;
}

// ------------------------------------------------------------------------------------------- T-90M
function t90Hull(P, L) {
  const k = new Kit(), hl = P.hullL / 2, deck = 1.42, belly = P.clearance, hw = 1.7;
  k.box(2.1, deck - belly - 0.25, P.hullL - 1.0, 0, belly + (deck - belly - 0.25) / 2, 0.1, L.base2);
  k.box(hw * 2, 0.28, P.hullL - 0.5, 0, deck - 0.14, 0.2, L.base);
  k.box(hw * 2 - 0.1, 0.08, 1.7, 0, deck - 0.32, -hl + 0.85, L.base, [-0.25, 0, 0]);       // glacis
  // V of reactive-armour tiles on the glacis
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) k.box(0.48, 0.1, 0.28, s * (0.3 + i * 0.22), deck - 0.24 - i * 0.02, -hl + 0.55 + i * 0.12, L.base2, [-0.25, s * 0.5, 0]);
  k.box(3.2, 0.06, 0.3, 0, deck - 0.05, -hl + 1.75, L.dark);                               // splash board
  k.box(2.3, 0.08, 0.9, 0, belly + 0.32, -hl + 0.35, L.base2, [0.9, 0, 0]);
  for (let i = 0; i < 5; i++) k.box(2.8, 0.03, 0.08, 0, deck + 0.01, hl - 1.9 + i * 0.32, L.dark);
  k.box(2.6, 0.7, 0.1, 0, deck - 0.4, hl - 0.05, L.base2);
  for (const s of [-1, 1]) {
    k.box(0.05, 0.55, P.hullL - 0.3, s * (P.W / 2 - 0.025), deck - 0.4, 0.0, 0x262721);   // rubber skirts
    for (let i = 0; i < 5; i++) k.box(0.1, 0.45, 0.42, s * (P.W / 2 - 0.02), deck - 0.33, -hl + 0.5 + i * 0.45, L.base2);   // ERA panels on the front of the skirt
    k.box(0.055, 0.2, P.hullL - 0.4, s * (P.W / 2 - 0.02), deck - 0.6, 0.0, L.dirt);
    // external fuel drums on the rear
    k.cyl(0.25, 0.25, 0.8, 10, s * 0.9, deck + 0.05, hl - 0.25, L.base2, [0, 0, Math.PI / 2]);
  }
  for (const s of [-1, 1]) k.box(0.16, 0.12, 0.12, s * 1.4, deck - 0.1, -hl + 0.2, L.dark);
  k.glowBox(1.1, 0.05, 0.01, 0, deck - 0.2, hl + 0.01);
  for (let i = 0; i < 8; i++) k.box(0.025 + (i % 3) * 0.015, 0.16, 0.01, -1.0 + i * 0.06, deck - 0.4, hl + 0.01, RW.glyph);
  return k;
}
function t90Turret(P, L) {
  const k = new Kit(), H = 0.8;
  // welded faceted turret, big bustle box behind
  k.prism([[-0.75, -1.5], [0.75, -1.5], [1.5, -0.55], [1.45, 1.3], [-1.45, 1.3], [-1.5, -0.55]], 0, H, L.base, 0.9);
  k.box(2.6, H * 0.85, 1.4, 0, H * 0.43, 2.0, L.base2);                                   // bustle box
  // slat cage round the bustle
  for (let i = 0; i < 9; i++) k.box(0.04, H * 0.9, 0.04, -1.4 + i * 0.35, H * 0.45, 2.85, L.dark);
  k.box(2.9, 0.04, 0.04, 0, H * 0.85, 2.85, L.dark); k.box(2.9, 0.04, 0.04, 0, H * 0.1, 2.85, L.dark);
  // chevron of reactive-armour wedges across the turret front (the T-90M's 'Relikt' cheeks)
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) k.box(0.62, H * 0.75, 0.18, s * (0.55 + i * 0.36), H * 0.4, -1.55 + i * 0.22, L.base2, [0, s * 0.62, 0]);
  k.box(1.0, 0.55, 0.3, 0, H * 0.4, -1.45, L.base2);                                     // mantlet
  // gunner's sight box (left), commander's panoramic sight (right), remote MG (Kord)
  k.box(0.45, 0.4, 0.55, -0.8, H + 0.18, -0.9, L.base2); k.box(0.36, 0.24, 0.03, -0.8, H + 0.2, -1.18, 0x1d2428);
  k.cyl(0.18, 0.2, 0.45, 10, 0.75, H + 0.22, -0.45, L.base2); k.box(0.3, 0.2, 0.2, 0.75, H + 0.52, -0.5, 0x1d2428);
  k.cyl(0.45, 0.45, 0.08, 12, 0.55, H + 0.04, 0.3, L.base2);
  k.box(0.35, 0.3, 0.45, 0.55, H + 0.3, 0.45, L.dark); k.box(0.09, 0.09, 1.3, 0.55, H + 0.38, -0.25, L.dark);
  // smoke launchers (front sides)
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) k.cyl(0.05, 0.05, 0.28, 6, s * (1.3 + (i % 3) * 0.1), H * 0.75 + Math.floor(i / 3) * 0.1, -0.5 + (i % 3) * 0.08, L.dark, [-0.5, 0, s * 0.3]);
  k.box(0.04, 0.35, 0.7, -1.47, H * 0.5, 0.6, RW.glyph);   // painted-over side number
  refit(k, -0.3, H + 0.04, 0.6);
  for (const s of [-1, 1]) k.glowBox(0.01, 0.05, 1.5, s * 1.32, H * 0.75, 1.0);
  return k;
}
function t90Gun(P, L) {
  const k = new Kit(), len = P.gunL;
  k.box(0.55, 0.45, 0.5, 0, 0, 0.0, L.base2);
  k.cyl(0.16, 0.14, len * 0.55, 12, 0, 0, -len * 0.28 - 0.2, L.base2, [Math.PI / 2, 0, 0]);
  k.cyl(0.19, 0.19, 0.6, 12, 0, 0, -len * 0.6, L.base2, [Math.PI / 2, 0, 0]);           // fume extractor
  k.cyl(0.12, 0.11, len * 0.35, 12, 0, 0, -len * 0.84, L.base2, [Math.PI / 2, 0, 0]);
  return k;
}

const PROTO = {};
function protos(type) {
  if (PROTO[type]) return PROTO[type];
  const P = MBT[type], L = LOOK[type], M = rwMats();
  const hullK = type === 'm1a2' ? m1Hull(P, L) : t90Hull(P, L);
  const gear = [runningGear(hullK, P, L, -1), runningGear(hullK, P, L, 1)];
  // idlers + return rollers are static (merged into the hull)
  for (const g of gear) { hullK.cyl(P.wheelR * 0.9, P.wheelR * 0.9, P.trackW * 0.7, 12, g.x, g.yTop - 0.3, g.zf + 0.15, L.metal, [0, 0, Math.PI / 2]); for (let i = 0; i < 3; i++) hullK.cyl(0.12, 0.12, P.trackW * 0.5, 8, g.x, g.yTop - 0.12, -1.6 + i * 1.6, L.metal, [0, 0, Math.PI / 2]); }
  PROTO[type] = {
    hull: hullK.build(M.body, M.glow, type + 'Hull'), gear,
    turret: (type === 'm1a2' ? m1Turret(P, L) : t90Turret(P, L)).build(M.body, M.glow, type + 'Turret'),
    gun: (type === 'm1a2' ? m1Gun(P, L) : t90Gun(P, L)).build(M.body, M.glow, type + 'Gun'),
    wheel: wheelGeo(P.wheelR, P.trackW * 0.85, L).build(M.body, M.glow, 'wheel'),
    sprocket: sprocketGeo(P.wheelR * 1.15, P.trackW * 0.8, L).build(M.body, M.glow, 'sprocket'),
  };
  return PROTO[type];
}
export function buildMBT(type, opt = {}) {
  const P = MBT[type], pr = protos(type), M = rwMats();
  const group = new THREE.Group(); group.name = type;
  const body = new THREE.Group(); group.add(body);   // pitch / roll here
  const hull = pr.hull.clone(); body.add(hull);
  const deck = type === 'm1a2' ? 1.62 : 1.42;
  const turret = pr.turret.clone(); turret.position.set(P.turretRing[0], deck, P.turretRing[1]); body.add(turret);
  const gun = pr.gun.clone(); gun.position.set(0, P.gunY - deck, P.gunZ); turret.add(gun);
  const wheels = [[], []], sprockets = [];
  pr.gear.forEach((g, side) => {
    for (const z of g.wz) { const w = pr.wheel.clone(); w.position.set(g.x, P.wheelR + 0.02, z); body.add(w); wheels[side].push(w); }
    const sp = pr.sprocket.clone(); sp.position.set(g.x, g.yTop - 0.3, g.zr - 0.15); body.add(sp); sprockets.push(sp);
  });
  if (opt.tag && typeof document !== 'undefined') for (const s of [-1, 1]) { const d = decal(stencilTex(opt.tag, { w: 256, h: 64, color: '#d8f6ff', font: 'bold 42px monospace' }), 0.9, 0.22, s * (type === 'm1a2' ? 1.775 : 1.48), 0.42, type === 'm1a2' ? 0.9 : 0.6, [0, s * Math.PI / 2, 0]); turret.add(d); }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(P.W * 1.15, P.hullL * 1.1).rotateX(-Math.PI / 2), M.shadow); shadow.renderOrder = -1; shadow.position.y = 0.04; group.add(shadow);
  const glows = []; group.traverse(o => { if (o.isMesh && o.material === M.glow) glows.push(o); });
  let recoil = 0, rock = 0, wreck = null;
  const gunZ = gun.position.z, ring = turret.position.clone();
  return {
    group, parts: { hull, turret, gun, wheels, sprockets, body },
    // ngc/rwground-polish: the main gun fires - the tube runs back in its cradle (~0.35 m) and out again, the hull
    // rocks back on its suspension and settles
    recoil() { recoil = 1; rock = 1; },
    update(T, dt, time) {
      const D = T.drive;
      group.position.set(D.p[0], D.p[1], D.p[2]); group.rotation.set(0, D.yaw, 0);
      recoil = Math.max(0, recoil - dt / 0.5); rock = Math.max(0, rock - dt / 1.1);
      const rk = Math.sin((1 - rock) * Math.PI * 2.5) * rock * 0.018 * Math.cos(T.turretYaw);   // (the kick along the gun's line)
      body.rotation.set(D.pitch - rk, 0, -D.roll + Math.sin((1 - rock) * Math.PI * 2.5) * rock * 0.018 * Math.sin(T.turretYaw), "XYZ");
      turret.rotation.y = T.turretYaw; gun.rotation.x = T.gunPitch - (T.hp && T.hp.gun <= 0 ? 0.08 : 0);   // (a damaged gun droops: its elevation gear shot through)
      gun.position.z = gunZ + 0.35 * Math.min(1, recoil * 4) * recoil;
      for (let s = 0; s < 2; s++) { const a = -D.wheelSpin[s] / P.wheelR; for (const w of wheels[s]) w.rotation.x = a; sprockets[s].rotation.x = -D.wheelSpin[s] / (P.wheelR * 1.15); }
      if (T.alive) { for (const g of glows) g.material = M.glow; return; }
      // ---- the wreck: burnt out, seams dead, the gun down on its stops; a catastrophic kill (the ammunition went: about
      // two in five, by the hull number) throws the turret off its ring onto the deck beside it
      if (!wreck) {
        const k = (T.id ?? 0) * 2.399, cat = ((T.id ?? 0) * 7 + 3) % 5 < 2;
        wreck = { t: 0, cat, side: Math.sin(k) > 0 ? 1 : -1, yaw: T.turretYaw + 0.6 * Math.cos(k) };
        setBodyMat(group, M.burnt, M.glowOff);
      }
      wreck.t = Math.min(1, wreck.t + dt / 0.9);
      const e = 1 - (1 - wreck.t) * (1 - wreck.t);
      gun.rotation.x = T.gunPitch + (-0.12 - T.gunPitch) * e;
      if (wreck.cat) {
        const s = wreck.side, hop = Math.sin(wreck.t * Math.PI) * 3.2;
        turret.position.set(ring.x + s * 2.4 * e, ring.y + hop - 0.55 * e, ring.z + 0.8 * e);
        turret.rotation.set(0.18 * e, wreck.yaw + 1.4 * e * s, s * 0.95 * e, 'YXZ');
      } else turret.rotation.y = wreck.yaw;
    },
  };
}
