// NGC-1980 air defence unit models, real-world metres, flat-shaded Lambert, weathered at bake time (kit.js).
// Local frame: +y up, front along -z, origin on the ground (or the deck) under the turret ring.
//
// Every builder returns a THREE.Group whose userData is the contract with brain.js / war.js:
//   type     DEF key ('vads' | 'shilka' | 'ciws' | 'sparrow' | 'talon' | 'lance' | 'hawk')
//   yaw      Group turning about y (traverse);  pitch: Group turning about x (elevation, + = up), child of yaw
//   spin     [Group] barrel clusters, spun about their local z
//   radar    Group spun about y while searching (null if none); dish: Group tilted to the target while tracking
//   muzzles  [Vector3] in the pitch frame;  cells: [{ cover, pos }] missile cells in the pitch frame
//   lamp     the tell lamp (MeshBasic, its own material); flashes: [Mesh] muzzle flash stars (hidden)
//   team     the team-colour material (war.js recolours by identity);  glow: emissive material (LANCE seams, lens)
//   lens     LANCE emitter tip in the pitch frame;  vents: radiator points in the yaw frame
import * as THREE from 'three';
import { paint, lam, basic, box, cyl, prism, prismZ, sphere, group, star, bake } from './kit.js';

const TEAM = { 0: 0xc8c8bc, 1: 0x33bbff, 2: 0xff3322 };
const teamMat = side => lam(TEAM[side], { emissive: side === 1 ? 0x0a2a44 : side === 2 ? 0x440a06 : 0x222222 });
const V = (x, y, z) => new THREE.Vector3(x, y, z);
let SEED = 1;

// shared paints
const P = {
  od: paint(0x4b5132), odDark: paint(0x3a3f28), sovGreen: paint(0x4f5a38), sovDark: paint(0x3b4429),
  track: paint(0x2b2a27, 0.6, { chip: 0 }), rubber: paint(0x1c1c1b, 0.4, { chip: 0 }), steel: paint(0x55585a, 0.8), gun: paint(0x232425, 0.5, { mud: 0 }),
  black: paint(0x151617, 0.3, { mud: 0 }), haze: paint(0x8a9298, 0.7, { mud: 0.2 }), white: paint(0xf4f3ee, 0.5, { mud: 0.1 }), deckGrey: paint(0x5d646a, 0.6, { mud: 0 }),
  stencil: paint(0xd8d6c8, 0.2, { mud: 0.3, chip: 0 }), red: paint(0xa0281e, 0.4, { mud: 0 }), yellow: paint(0xb89a2a, 0.5),
  canvas: paint(0x5c5a3c, 0.8), skin: paint(0xb98e6c, 0.2, { mud: 0, chip: 0 }), helmet: paint(0x46492f, 0.5, { mud: 0 }),
  rwGreen: paint(0x4d553a), rwDark: paint(0x30352a), rwSand: paint(0x8a7d5c), glass: paint(0x1c2a33, 0.1, { mud: 0, chip: 0 }),
  ceramic: paint(0xd3d1c9, 0.35, { mud: 0.6, chip: 0.4 }), composite: paint(0x2a2d31, 0.4, { mud: 0.4 }), lensDark: paint(0x0d1418, 0.1, { mud: 0, chip: 0 }),
  rust: paint(0x6a4a30, 1),
};
const lampMat = c => basic(c);
const flashMat = () => basic(0xffd890, { transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

// a muzzle flash: two crossed quads with a star-ish shape, hidden until a round goes
function flash(p, x, y, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); p.add(g);
  const sh = new THREE.Shape(); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, r = (i % 2 ? 0.18 : 0.5) * s; sh[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
  const m = flashMat();
  const front = new THREE.Mesh(new THREE.ShapeGeometry(sh), m); g.add(front);
  for (const ry of [0, Math.PI / 2]) { const q = new THREE.Mesh(new THREE.PlaneGeometry(0.5 * s, 1.6 * s).rotateX(Math.PI / 2).translate(0, 0, -0.7 * s), m); q.rotation.z = ry; g.add(q); }
  g.visible = false; return g;
}
// a six-barrel rotary cluster along -z, centred on the group origin; returns the spinning group
function rotary(p, len, rb, rc, { clamps = 2, housing = 0.22 } = {}) {
  const sp = group(p); sp.userData.part = true;
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cyl(sp, P.gun, rb, rb * 1.15, len, Math.cos(a) * rc, Math.sin(a) * rc, -len / 2, 'z', 6); }
  for (let k = 0; k < clamps; k++) cyl(sp, P.steel, rc + rb * 1.6, rc + rb * 1.6, 0.06, 0, 0, -len * (k + 1) / (clamps + 1), 'z', 10);
  cyl(sp, P.gun, rc + rb * 1.2, rc + rb * 1.2, 0.05, 0, 0, -len + 0.06, 'z', 10);   // muzzle clamp
  cyl(p, P.gun, housing, housing, 0.5, 0, 0, 0.2, 'z', 10);                           // the rotor housing (does not spin)
  return sp;
}
// tracks for a tracked hull: both sides; road wheels, sprocket front, idler rear, links with grousers
function tracks(p, { xc, w, n, r, zA, zB, sprZ, sprY, sprR, idlZ, idlY, idlR, mat = P.track, wheel = P.od, rollers = 0 }) {
  for (const sd of [-1, 1]) {
    const x = sd * xc;
    for (let i = 0; i < n; i++) {
      const z = zA + (zB - zA) * i / (n - 1);
      cyl(p, P.rubber, r, r, w * 0.82, x, r + 0.05, z, 'x', 12);
      cyl(p, wheel, r * 0.72, r * 0.72, w * 0.86, x, r + 0.05, z, 'x', 10);
      cyl(p, P.steel, r * 0.22, r * 0.22, w * 0.92, x, r + 0.05, z, 'x', 6);
    }
    for (let i = 0; i < rollers; i++) { const z = zA + (zB - zA) * (i + 0.5) / rollers; cyl(p, P.steel, 0.1, 0.1, w * 0.5, x, sprY + sprR * 0.55, z, 'x', 8); }
    // sprocket and idler, with the track wrapped round them
    cyl(p, mat, sprR + 0.06, sprR + 0.06, w, x, sprY, sprZ, 'x', 12); cyl(p, P.steel, sprR * 0.85, sprR * 0.85, w * 1.04, x, sprY, sprZ, 'x', 9);
    for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; box(p, P.gun, w * 1.06, 0.09, 0.09, x, sprY + Math.sin(a) * sprR * 0.9, sprZ + Math.cos(a) * sprR * 0.9, a); }
    cyl(p, mat, idlR + 0.06, idlR + 0.06, w, x, idlY, idlZ, 'x', 12); cyl(p, P.steel, idlR * 0.8, idlR * 0.8, w * 1.04, x, idlY, idlZ, 'x', 9);
    const run = (z0, y0, z1, y1, out) => {   // a straight run of links between two points (+ grousers on the outside)
      const L = Math.hypot(z1 - z0, y1 - y0), a = Math.atan2(y1 - y0, z1 - z0);
      box(p, mat, w, 0.07, L, x, (y0 + y1) / 2, (z0 + z1) / 2, -a);
      const n = Math.floor(L / 0.17);
      for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; box(p, P.gun, w * 0.96, 0.045, 0.05, x, y0 + (y1 - y0) * t + Math.cos(a) * out * 0.05, z0 + (z1 - z0) * t - Math.sin(a) * out * 0.05, -a); }
    };
    // the end wheels, front (-z) and rear, whichever of sprocket / idler they are
    const [fz, fy, fr, rz, ry, rr] = sprZ < idlZ ? [sprZ, sprY, sprR, idlZ, idlY, idlR] : [idlZ, idlY, idlR, sprZ, sprY, sprR];
    run(zA, 0.035, zB, 0.035, -1);                                                       // ground run
    run(fz + 0.02, fy - fr - 0.05, zA, 0.035, -1); run(zB, 0.035, rz - 0.02, ry - rr - 0.05, -1);
    run(fz, fy + fr + 0.05, rz, ry + rr + 0.05, 1);                                      // top run
  }
}
// a seated crewman (open turret / hatch): torso, arms on the controls, head in a helmet
function crewman(p, x, y, z, kit, helm, { soviet = false } = {}) {
  const g = group(p, x, y, z);
  box(g, kit, 0.44, 0.55, 0.3, 0, 0.28, 0); box(g, kit, 0.12, 0.4, 0.12, -0.25, 0.3, -0.12, 0.6); box(g, kit, 0.12, 0.4, 0.12, 0.25, 0.3, -0.12, 0.6);
  box(g, P.skin, 0.2, 0.22, 0.2, 0, 0.68, 0);
  if (soviet) { sphere(g, helm, 0.15, 0, 0.78, 0.01, 8, 5, Math.PI * 2, Math.PI / 2); box(g, helm, 0.34, 0.06, 0.3, 0, 0.75, 0.02); }   // padded tanker's helmet
  else { sphere(g, helm, 0.17, 0, 0.76, 0, 9, 5, Math.PI * 2, Math.PI / 2); cyl(g, helm, 0.19, 0.19, 0.03, 0, 0.76, 0, 'y', 9); }   // M1 steel pot with its brim
  return g;
}
function finish(g, ud, opts) { g.userData = ud; bake(g, { seed: SEED++, ...opts }); return g; }

// =========================================================================== M163 VADS (player, command 2)
// M113 hull (4.86 x 2.69 m, roof 1.83 m), one-man open turret on the roof with the six-barrel 20 mm Vulcan on the
// left of the gunner and the range-only radar pod on the right. 1980 US Army: olive drab, white star, bumper codes.
export function buildVADS(side = 1) {
  const g = new THREE.Group(), team = teamMat(side), hull = group(g); hull.userData.part = true;
  const L = 4.86, Wb = 1.92, roof = 1.83, belly = 0.45;
  // hull: side profile extruded across the hull width
  prism(hull, P.od, [[-2.43, belly + 0.05], [-2.48, 0.92], [-1.55, roof], [2.38, roof], [2.43, roof - 0.05], [2.43, belly], [-2.1, belly - 0.02]], Wb);
  for (const sd of [-1, 1]) box(hull, P.od, 0.4, 0.05, L - 0.2, sd * 1.15, 1.0, 0.05);            // fenders over the tracks
  tracks(hull, { xc: 1.15, w: 0.38, n: 5, r: 0.3, zA: -1.55, zB: 1.65, sprZ: -2.12, sprY: 0.62, sprR: 0.28, idlZ: 2.18, idlY: 0.55, idlR: 0.27 });
  // trim vane folded on the glacis, headlight clusters, towing eyes
  box(hull, P.odDark, 1.8, 0.05, 0.92, 0, 1.38, -2.06, -0.95);
  for (const sd of [-1, 1]) { box(hull, P.steel, 0.24, 0.2, 0.12, sd * 0.78, 1.18, -2.08); cyl(hull, P.glass, 0.06, 0.06, 0.05, sd * 0.84, 1.22, -2.15, 'z', 8); for (const dx of [-0.13, 0.13]) box(hull, P.steel, 0.02, 0.28, 0.02, sd * 0.78 + dx, 1.22, -2.17); }
  for (const sd of [-1, 1]) cyl(hull, P.steel, 0.07, 0.07, 0.08, sd * 0.6, 0.55, -2.42, 'x', 8);
  // driver's hatch (front left) with periscopes; exhaust and louvre grille front right
  cyl(hull, P.od, 0.32, 0.32, 0.08, -0.55, roof + 0.04, -1.2, 'y', 10); for (let i = 0; i < 4; i++) box(hull, P.black, 0.1, 0.07, 0.06, -0.55 + Math.cos(i * 0.8 - 1.2) * 0.3, roof + 0.07, -1.2 + Math.sin(i * 0.8 - 1.2) * 0.3);
  for (let i = 0; i < 6; i++) box(hull, P.odDark, 0.6, 0.03, 0.05, 0.55, roof + 0.02, -1.3 + i * 0.1);
  box(hull, P.black, 0.22, 0.4, 0.1, 0.98, 1.6, -1.4, 0.2);                                           // exhaust outlet on the right
  // rear: ramp outline, door, tail lights, stowage, jerrycans, whip antennas
  box(hull, P.odDark, 1.6, 1.1, 0.05, 0, 1.02, 2.44); box(hull, P.odDark, 0.55, 0.8, 0.04, -0.4, 1.1, 2.47);
  for (const sd of [-1, 1]) { box(hull, P.red, 0.1, 0.08, 0.04, sd * 0.85, 1.6, 2.45); box(hull, P.steel, 0.1, 0.18, 0.12, sd * 0.85, 1.5, 2.48); }
  for (const sd of [-1, 1]) { const jc = box(hull, P.odDark, 0.17, 0.46, 0.33, sd * 0.78, 0.82, 2.62); jc.rotation.y = 0.04 * sd; }
  for (const sd of [-1, 1]) { cyl(hull, P.steel, 0.05, 0.07, 0.15, sd * 0.85, roof + 0.07, 2.2, 'y', 6); cyl(hull, P.black, 0.008, 0.012, 2.6, sd * 0.85, roof + 1.4, 2.2, 'y', 4); }
  box(hull, P.canvas, 1.3, 0.3, 0.5, 0.2, roof + 0.15, 1.75);                                         // rolled tarp and kit on the rear deck
  cyl(hull, P.canvas, 0.14, 0.14, 1.2, -0.55, roof + 0.14, 1.65, 'x', 7);
  // markings: white star on the sides, bumper code bar, team air-recognition panel on the deck
  for (const sd of [-1, 1]) star(hull, P.stencil, 0.28, sd * 0.962, 1.35, 0.8, sd * Math.PI / 2);
  box(hull, P.stencil, 0.5, 0.06, 0.02, 0.45, 1.05, -2.47); box(hull, P.stencil, 0.3, 0.06, 0.02, -0.5, 1.05, -2.47);
  { const pnl = box(hull, team, 0.9, 0.02, 0.6, -0.4, roof + 0.012, 1.2); pnl.userData.keep = true; }
  // turret: ring on the roof, open tub, gunner, the gun on the left, the radar pod on the right
  const yaw = group(g, 0, roof, 0.45); yaw.userData.part = true;
  cyl(yaw, P.od, 0.95, 1.0, 0.18, 0, 0.09, 0, 'y', 14);
  prismZ(yaw, P.od, [[-0.95, 0.18], [0.95, 0.18], [0.92, 0.62], [-0.92, 0.62]], 0.6, 0.55);         // rear armour of the tub
  for (const sd of [-1, 1]) box(yaw, P.od, 0.05, 0.42, 1.2, sd * 0.93, 0.4, 0.05);
  box(yaw, P.steel, 0.5, 0.06, 0.4, 0.15, 0.48, 0.3);                                                  // the gunner's seat pan
  crewman(yaw, 0.15, 0.48, 0.32, P.od, P.helmet);
  box(yaw, P.odDark, 0.5, 0.5, 0.4, 0.15, 0.95, -0.1);                                                 // sight head
  box(yaw, P.glass, 0.4, 0.3, 0.03, 0.15, 1.08, -0.3, -0.2);
  const pitch = group(yaw, -0.32, 0.75, -0.2); pitch.userData.part = true;
  cyl(pitch, P.od, 0.18, 0.18, 0.75, 0, 0, 0, 'x', 10);                                                 // trunnion
  box(pitch, P.odDark, 0.5, 0.45, 0.9, -0.08, -0.05, 0.25);                                              // feeder / receiver
  cyl(pitch, P.odDark, 0.36, 0.36, 0.55, -0.08, -0.2, 0.72, 'x', 12);                                    // ammo drum stub
  const sp = group(pitch, -0.08, 0.02, -0.25); const barrels = rotary(sp, 1.55, 0.034, 0.09, { clamps: 2, housing: 0.2 });
  const radar = group(pitch, 0.85, 0.12, -0.15); radar.userData.part = true;                              // AN/VPS-2 range-only radar on the right
  box(pitch, P.od, 0.4, 0.12, 0.12, 0.6, 0.0, -0.1);
  cyl(radar, P.od, 0.24, 0.27, 0.42, 0, 0, 0, 'z', 10); sphere(radar, P.odDark, 0.24, 0, 0, -0.21, 10, 6, Math.PI * 2, Math.PI / 2).rotation.x = -Math.PI / 2;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), lampMat(0xffaa22)); lamp.position.set(0.15, 1.28, 0.05); yaw.add(lamp);
  const fl = flash(pitch, -0.08, 0.02, -1.85, 0.7);
  return finish(g, { type: 'vads', yaw, pitch, spin: [barrels], radar: null, dish: null, muzzles: [V(-0.08, 0.02, -1.85)], lamp, flashes: [fl], team, h: 2.7 });
}

// =========================================================================== ZSU-23-4 SHILKA (player: Soviet contingent)
// 6.5 x 3.1 m, low hull, big flat welded turret with the quad 23 mm guns in the front and the dish radar on a mast at
// the back of the turret. Soviet green, red star, white turret number.
export function buildShilka(side = 1) {
  const g = new THREE.Group(), team = teamMat(side), hull = group(g); hull.userData.part = true;
  const roof = 1.42, belly = 0.42;
  prism(hull, P.sovGreen, [[-3.2, belly + 0.08], [-3.27, 0.9], [-2.5, roof], [3.15, roof], [3.25, roof - 0.12], [3.2, belly], [-2.9, belly - 0.02]], 2.1);
  for (const sd of [-1, 1]) prismZ(hull, P.sovGreen, [[sd * 1.05, 0.95], [sd * 1.55, 0.95], [sd * 1.55, 1.02], [sd * 1.05, roof]].map(([x, y]) => [x, y]), 6.2, 0);   // sponson shelves over the tracks
  tracks(hull, { xc: 1.3, w: 0.38, n: 6, r: 0.33, zA: -2.25, zB: 2.35, sprZ: 2.92, sprY: 0.6, sprR: 0.3, idlZ: -2.9, idlY: 0.6, idlR: 0.3, wheel: P.sovGreen });   // drive at the rear
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) box(hull, P.sovDark, 0.45, 0.25, 0.9, sd * 1.32, 1.12, -2.2 + i * 1.3);   // stowage bins on the shelves
  box(hull, P.sovDark, 0.8, 0.12, 0.6, -0.6, roof + 0.05, -2.1); cyl(hull, P.sovGreen, 0.3, 0.3, 0.07, -0.55, roof + 0.08, -2.0, 'y', 10);   // driver's hatch
  for (const sd of [-1, 1]) { box(hull, P.steel, 0.2, 0.16, 0.12, sd * 0.85, 1.05, -3.12); cyl(hull, P.glass, 0.05, 0.05, 0.04, sd * 0.85, 1.05, -3.19, 'z', 8); }
  for (let i = 0; i < 7; i++) box(hull, P.sovDark, 1.6, 0.03, 0.06, 0, roof + 0.02, 1.9 + i * 0.14);          // engine deck louvres
  for (const sd of [-1, 1]) cyl(hull, P.steel, 0.12, 0.12, 0.3, sd * 0.7, 0.75, 3.27, 'z', 8);
  for (const sd of [-1, 1]) box(hull, P.sovDark, 0.22, 0.42, 0.75, sd * 1.32, 1.22, 2.4);                        // fuel drums / boxes at the back
  // turret: big flat box with a sloped front plate
  const yaw = group(g, 0, roof, -0.5); yaw.userData.part = true;
  prism(yaw, P.sovGreen, [[-1.45, 0.05], [-1.7, 0.45], [-1.2, 0.85], [1.65, 0.85], [1.7, 0.05]], 2.9);
  for (const sd of [-1, 1]) box(yaw, P.sovDark, 0.12, 0.45, 2.2, sd * 1.5, 0.5, 0.3);                              // side panniers
  box(yaw, P.sovDark, 1.6, 0.15, 0.8, 0, 0.92, 0.6); cyl(yaw, P.sovGreen, 0.3, 0.3, 0.1, -0.6, 0.92, 0.1, 'y', 10); cyl(yaw, P.sovGreen, 0.3, 0.3, 0.1, 0.6, 0.92, 0.1, 'y', 10);   // commander's / gunner's hatches
  crewman(yaw, -0.6, 0.62, 0.1, P.sovDark, P.helmet, { soviet: true });
  for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) box(yaw, P.black, 0.12, 0.09, 0.08, sd * 0.6 + (i - 1) * 0.16, 1.02, -0.25);   // periscopes
  box(yaw, P.black, 0.7, 0.2, 0.12, 0.55, 0.95, -0.55);                                                              // optical sight box
  for (const sd of [-1, 1]) star(yaw, P.red, 0.24, sd * 1.565, 0.5, -0.6, sd * Math.PI / 2);
  for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) box(yaw, P.stencil, 0.02, 0.24, 0.13, sd * 1.565, 0.52, 0.25 + k * 0.2);   // turret number
  { const pnl = box(yaw, team, 0.8, 0.02, 0.5, 0.5, 0.86, 1.3); pnl.userData.keep = true; }
  // quad 23 mm in a recess at the front: the gun cradle pitches
  const pitch = group(yaw, 0, 0.55, -1.3); pitch.userData.part = true;
  box(pitch, P.sovDark, 1.6, 0.6, 0.6, 0, 0, 0.15); cyl(pitch, P.sovGreen, 0.2, 0.2, 2.2, 0, -0.05, 0.2, 'x', 10);
  const muzzles = [], flashes = [];
  for (const x of [-0.62, 0.62]) for (const y of [-0.12, 0.18]) {
    cyl(pitch, P.gun, 0.07, 0.08, 0.9, x, y, -0.4, 'z', 8);                                                         // cooling jacket
    cyl(pitch, P.gun, 0.032, 0.035, 1.55, x, y, -1.4, 'z', 6);                                                     // barrel
    cyl(pitch, P.black, 0.05, 0.045, 0.22, x, y, -2.15, 'z', 7);                                                   // flash hider
    muzzles.push(V(x, y, -2.28)); flashes.push(flash(pitch, x, y, -2.3, 0.55));
  }
  // RPK-2 dish on its mast at the back of the turret: spins searching, faces the target when tracking
  const radar = group(yaw, 0, 0.85, 1.25); radar.userData.part = true;
  cyl(radar, P.sovDark, 0.12, 0.16, 0.65, 0, 0.32, 0, 'y', 8);
  const dish = group(radar, 0, 0.82, 0); dish.userData.part = true;
  { const d = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 4, 0, Math.PI * 2, 0, 0.75), P.sovGreen); d.rotation.x = Math.PI / 2; d.position.z = -0.42; dish.add(d); }   // concave side forward
  cyl(dish, P.steel, 0.025, 0.025, 0.5, 0, 0, -0.05, 'z', 4); cyl(dish, P.sovDark, 0.08, 0.08, 0.12, 0, 0, -0.32, 'z', 6);   // feed horn
  for (const sd of [-1, 1]) box(dish, P.steel, 0.03, 0.03, 0.5, sd * 0.32, 0, -0.1, 0, sd * 0.5);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), lampMat(0xffaa22)); lamp.position.set(-0.9, 1.0, 0.9); yaw.add(lamp);
  return finish(g, { type: 'shilka', yaw, pitch, spin: [], radar, dish, muzzles, lamp, flashes, team, h: 3.1 });
}

// =========================================================================== ALBATROSS close-in gun (white dome)
// 1980 fit: haze-grey pedestal, white radome on the elevating cradle, six bare barrels under it, the ammo drum behind.
export function buildCIWS(side = 1) {
  const g = new THREE.Group(), team = teamMat(side), base = group(g); base.userData.part = true;
  cyl(base, P.deckGrey, 0.85, 0.95, 0.35, 0, 0.17, 0, 'y', 14);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; cyl(base, P.steel, 0.04, 0.04, 0.06, Math.cos(a) * 0.88, 0.36, Math.sin(a) * 0.88, 'y', 5); }   // hold-down bolts
  box(base, P.deckGrey, 0.6, 0.5, 0.5, 0, 0.25, 0.85); box(base, P.black, 0.5, 0.06, 0.02, 0, 0.35, 1.11);           // power / control box
  const yaw = group(g, 0, 0.35, 0); yaw.userData.part = true;
  cyl(yaw, P.haze, 0.72, 0.78, 0.55, 0, 0.27, 0, 'y', 14);
  for (const sd of [-1, 1]) box(yaw, P.haze, 0.16, 1.15, 0.7, sd * 0.68, 1.05, 0);                                   // trunnion arms
  { const pnl = box(yaw, team, 0.5, 0.18, 0.02, 0, 0.35, -0.75); pnl.userData.keep = true; }
  const pitch = group(yaw, 0, 1.45, 0); pitch.userData.part = true;
  cyl(pitch, P.haze, 0.15, 0.15, 1.5, 0, 0, 0, 'x', 10);
  cyl(pitch, P.haze, 0.42, 0.42, 1.25, 0, -0.18, 0.55, 'z', 14); cyl(pitch, P.steel, 0.43, 0.43, 0.06, 0, -0.18, 1.18, 'z', 14);   // ammo drum
  cyl(pitch, P.white, 0.5, 0.52, 0.85, 0, 0.75, 0.15, 'y', 16);                                                          // the radome
  sphere(pitch, P.white, 0.5, 0, 1.17, 0.15, 16, 7, Math.PI * 2, Math.PI / 2);
  box(pitch, P.haze, 0.55, 0.22, 0.85, 0, 0.27, 0.05);                                                                   // electronics under the dome
  box(pitch, P.black, 0.3, 0.06, 0.02, 0, 0.6, -0.36); for (let k = 0; k < 3; k++) box(pitch, P.stencil, 0.02, 0.1, 0.04, 0.53, 0.6 + k * 0.14, 0.15);
  const sp = group(pitch, 0, -0.18, -0.25); const barrels = rotary(sp, 1.5, 0.033, 0.085, { clamps: 1, housing: 0.2 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), lampMat(0xffaa22)); lamp.position.set(0, 1.7, 0.15); pitch.add(lamp);
  const fl = flash(pitch, 0, -0.18, -1.8, 0.7);
  return finish(g, { type: 'ciws', yaw, pitch, spin: [barrels], radar: null, dish: null, muzzles: [V(0, -0.18, -1.8)], lamp, flashes: [fl], team, h: 2.4 }, { mudH: 0.01 });
}

// =========================================================================== ALBATROSS box missile launcher
// Eight cells in two rows of four on an elevating box, trainable pedestal, frangible white cell covers.
export function buildSparrow(side = 1) {
  const g = new THREE.Group(), team = teamMat(side), base = group(g); base.userData.part = true;
  cyl(base, P.deckGrey, 0.75, 0.9, 0.5, 0, 0.25, 0, 'y', 12); box(base, P.deckGrey, 0.6, 0.45, 0.4, 0.75, 0.22, 0.4);
  const yaw = group(g, 0, 0.5, 0); yaw.userData.part = true;
  cyl(yaw, P.haze, 0.62, 0.66, 0.45, 0, 0.22, 0, 'y', 12);
  for (const sd of [-1, 1]) box(yaw, P.haze, 0.18, 1.0, 0.8, sd * 0.75, 0.85, 0.1);
  { const pnl = box(yaw, team, 0.5, 0.16, 0.02, 0, 0.3, -0.66); pnl.userData.keep = true; }
  const pitch = group(yaw, 0, 1.25, 0.1); pitch.userData.part = true;
  cyl(pitch, P.haze, 0.13, 0.13, 1.7, 0, 0, 0, 'x', 10);
  const W = 1.28, H = 0.66, L = 3.6;
  box(pitch, P.haze, W, H, L, 0, 0.12, 0.3);
  for (const z of [-1.2, 0, 1.2]) box(pitch, P.steel, W + 0.06, H + 0.06, 0.08, 0, 0.12, 0.3 + z);                   // stiffening bands
  box(pitch, P.haze, W - 0.1, 0.1, L - 0.4, 0, 0.5, 0.3);
  for (const k of [0, 1]) box(pitch, P.stencil, 0.02, 0.14, 1.2, W / 2 + 0.01, 0.12 + (k - 0.5) * 0.2, 0.3);
  const cells = [], cw = W / 4, ch = H / 2;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    const x = -W / 2 + cw * (c + 0.5), y = 0.12 - H / 2 + ch * (r + 0.5);
    box(pitch, P.black, cw * 0.86, ch * 0.84, 0.04, x, y, 0.3 - L / 2 - 0.005);
    const cover = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.8, ch * 0.78, 0.03), lam(0xece8de)); cover.position.set(x, y, 0.3 - L / 2 - 0.03); pitch.add(cover);
    cells.push({ cover, pos: V(x, y, 0.3 - L / 2 - 0.2) });
    // the cell's back end: a blow-out plate in a rim
    box(pitch, P.steel, cw * 0.9, ch * 0.88, 0.03, x, y, 0.3 + L / 2 + 0.01); box(pitch, P.black, cw * 0.7, ch * 0.66, 0.03, x, y, 0.3 + L / 2 + 0.025);
  }
  box(pitch, P.yellow, W * 0.92, 0.05, 0.02, 0, 0.12 + H / 2 - 0.04, 0.3 + L / 2 + 0.03);                                // blast-area band
  for (const sd of [-1, 1]) box(pitch, P.haze, 0.08, 0.16, L * 0.8, sd * (W / 2 + 0.04), 0.12 - H / 2 + 0.1, 0.3);     // side rails
  cyl(yaw, P.black, 0.05, 0.05, 1.0, -0.62, 0.75, 0.55, 'y', 6);                                                       // umbilical cable up the arm
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), lampMat(0xffaa22)); lamp.position.set(0, 0.55, 2.0); pitch.add(lamp);
  return finish(g, { type: 'sparrow', yaw, pitch, spin: [], radar: null, dish: null, muzzles: [], cells, lamp, flashes: [], team, h: 2.4 }, { mudH: 0.01 });
}

// =========================================================================== RW TALON: seized modern 8x8 gun / missile truck
// A 2020s self-propelled gun-missile system on an 8x8 truck, brought back and refitted by the RUNAWAY: a white sensor
// pod bolted on the cab, cyan IFF strips, a crude machine stencil sprayed over the old markings. 9.6 m long.
// SEAWORLD: opts.mount = the same combat module on a ship's deck pedestal (no truck): the KRAKEN, the container ship
export function buildTalon(side = 2, opts = {}) {
  const g = new THREE.Group(), team = teamMat(side), body = group(g); body.userData.part = true;
  const iff = basic(0x7ff6ff), Wt = 2.55;
  if (!opts.mount) {
  // chassis rails, wheels on four axles, mudguards
  for (const sd of [-1, 1]) box(body, P.rwDark, 0.18, 0.32, 9.0, sd * 0.5, 1.0, 0.2);
  for (const z of [-3.35, -1.85, 1.55, 2.95]) for (const sd of [-1, 1]) {
    const x = sd * (Wt / 2 - 0.25);
    cyl(body, P.rubber, 0.6, 0.6, 0.44, x, 0.6, z, 'x', 14); cyl(body, P.rwGreen, 0.34, 0.34, 0.46, x, 0.6, z, 'x', 10);
    cyl(body, P.steel, 0.1, 0.1, 0.48, x, 0.6, z, 'x', 6); for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; box(body, P.rubber, 0.4, 0.05, 0.1, x, 0.6 + Math.sin(a) * 0.6, z + Math.cos(a) * 0.6, a); }   // tread blocks
    cyl(body, P.rwDark, 0.1, 0.1, Wt - 0.7, 0, 0.6, z, 'x', 6);
  }
  for (const sd of [-1, 1]) { box(body, P.rwGreen, 0.5, 0.05, 2.4, sd * (Wt / 2 - 0.25), 1.27, -2.6); box(body, P.rwGreen, 0.5, 0.05, 2.3, sd * (Wt / 2 - 0.25), 1.27, 2.25); }
  // cab: flat front, big windscreen, roof visor, grille and bumper, mirrors, steps
  const cz0 = -4.75, cz1 = -2.6;
  prism(body, P.rwGreen, [[cz0, 1.2], [cz0, 2.35], [cz0 + 0.15, 3.0], [cz1, 3.0], [cz1, 1.2]], Wt);
  box(body, P.glass, Wt - 0.3, 0.6, 0.04, 0, 2.62, cz0 + 0.07, -0.2);
  for (const sd of [-1, 1]) box(body, P.glass, 0.03, 0.55, 0.9, sd * (Wt / 2 + 0.005), 2.55, cz0 + 0.65);
  box(body, P.rwDark, Wt - 0.2, 0.08, 0.35, 0, 3.0, cz0 + 0.1);                                                          // sun visor
  box(body, P.rwDark, Wt - 0.4, 0.55, 0.05, 0, 1.75, cz0 - 0.02); for (let i = 0; i < 6; i++) box(body, P.black, Wt - 0.6, 0.04, 0.03, 0, 1.55 + i * 0.08, cz0 - 0.05);
  box(body, P.steel, Wt + 0.05, 0.25, 0.25, 0, 1.15, cz0 - 0.1);                                                        // bumper
  for (const sd of [-1, 1]) { box(body, P.stencil, 0.3, 0.14, 0.03, sd * 0.95, 1.38, cz0 - 0.02); box(body, P.black, 0.04, 0.35, 0.22, sd * (Wt / 2 + 0.25), 2.6, cz0 + 0.2); box(body, P.steel, 0.3, 0.03, 0.03, sd * (Wt / 2 + 0.12), 2.75, cz0 + 0.25); }
  for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) box(body, P.steel, 0.3, 0.04, 0.25, sd * (Wt / 2 - 0.1), 1.0 + k * 0.32, cz0 + 1.6);
  // camouflage patches left from its old owners
  for (const [x, y, z, w, h, d] of [[1.28, 2.2, -4.1, 0.02, 0.45, 0.6], [-1.28, 2.5, -3.4, 0.02, 0.35, 0.8], [1.28, 1.8, -3.2, 0.02, 0.3, 0.5], [0.3, 3.01, -3.8, 0.9, 0.02, 0.5]]) box(body, P.rwSand, w, h, d, x, y, z);
  // RUNAWAY refit: sensor pod on the cab roof, IFF strips, the stencil over a scraped old number
  const pod = group(body, 0, 3.0, -3.7);
  box(pod, P.steel, 0.9, 0.08, 0.3, 0, 0.04, 0); cyl(pod, P.ceramic, 0.22, 0.22, 0.25, 0, 0.25, 0, 'y', 8);
  sphere(pod, P.ceramic, 0.25, 0, 0.42, 0, 10, 6); sphere(pod, P.lensDark, 0.11, 0, 0.45, -0.18, 8, 5);
  for (const sd of [-1, 1]) { const s = box(body, iff, 0.02, 0.06, 1.7, sd * (Wt / 2 + 0.01), 2.08, -3.7); s.userData.keep = true; }
  { const s = box(body, iff, Wt - 0.4, 0.05, 0.02, 0, 2.05, cz0 - 0.03); s.userData.keep = true; }
  for (const sd of [-1, 1]) { box(body, P.rwSand, 0.02, 0.35, 0.7, sd * (Wt / 2 + 0.008), 1.6, -3.7); for (const [dy, dz, h, d] of [[0.06, -0.2, 0.18, 0.04], [0.0, -0.05, 0.05, 0.22], [-0.06, 0.12, 0.18, 0.04], [0.08, 0.22, 0.04, 0.12]]) box(body, P.stencil, 0.02, h, d, sd * (Wt / 2 + 0.014), 1.6 + dy, -3.7 + dz); }
  // equipment body behind the cab, fuel tanks, generator, ladders, jacks
  box(body, P.rwGreen, Wt - 0.1, 1.5, 2.6, 0, 2.0, -1.0);
  for (const sd of [-1, 1]) { for (let i = 0; i < 2; i++) box(body, P.rwDark, 0.03, 1.1, 0.9, sd * (Wt / 2 - 0.03), 2.05, -1.65 + i * 1.1); box(body, P.steel, 0.12, 0.4, 0.06, sd * (Wt / 2 + 0.02), 2.0, -1.2); }
  for (let i = 0; i < 6; i++) box(body, P.black, 0.04, 0.6, 0.08, -Wt / 2 + 0.02, 2.0, -0.4 + i * 0.12 - 0.3);           // generator louvres
  for (const sd of [-1, 1]) { cyl(body, P.rwDark, 0.3, 0.3, 1.1, sd * 0.95, 1.05, -0.1, 'z', 10); box(body, P.rwDark, 0.5, 0.4, 0.9, sd * 0.95, 1.0, 0.9); }
  box(body, P.rwGreen, Wt - 0.1, 0.5, 4.0, 0, 1.45, 2.2);                                                                // rear platform for the combat module
  for (const sd of [-1, 1]) for (const z of [0.4, 3.8]) { cyl(body, P.steel, 0.07, 0.07, 0.6, sd * 1.1, 1.0, z, 'y', 6); cyl(body, P.steel, 0.2, 0.2, 0.06, sd * 1.1, 0.68, z, 'y', 8); }   // levelling jacks, stowed
  box(body, P.rwDark, 0.5, 0.05, 0.05, 0.9, 1.25, 4.3); for (let k = 0; k < 4; k++) box(body, P.steel, 0.45, 0.04, 0.04, 0.9, 0.45 + k * 0.22, 4.3);   // ladder
  for (const sd of [-1, 1]) box(body, P.red, 0.2, 0.08, 0.03, sd * 1.05, 1.4, 4.22);
  { const pnl = box(body, team, 1.0, 0.02, 0.8, 0, 2.76, -1.0); pnl.userData.keep = true; }
  } else {   // a deck pedestal: armoured drum, cable trunk, a RUNAWAY sensor box, IFF band, deck plate with bolts
    cyl(body, P.rwDark, 1.25, 1.4, 0.25, 0, 0.12, 0, 'y', 12); cyl(body, P.rwGreen, 0.95, 1.1, 0.9, 0, 0.7, 0, 'y', 12);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; cyl(body, P.steel, 0.05, 0.05, 0.08, Math.cos(a) * 1.3, 0.27, Math.sin(a) * 1.3, 'y', 5); }
    box(body, P.rwDark, 0.35, 0.7, 0.4, 0, 0.55, 1.15); box(body, P.ceramic, 0.4, 0.3, 0.35, 0.85, 0.85, 0.5);
    { const s2 = cyl(body, iff, 1.11, 1.11, 0.05, 0, 1.0, 0, 'y', 12); s2.userData.keep = true; }
  }
  // combat module: rotating base, central body with the tracking radar face, a gun pair and a missile pack each side
  const yaw = group(g, 0, opts.mount ? 1.15 : 1.7, opts.mount ? 0 : 2.3); yaw.userData.part = true;
  cyl(yaw, P.rwDark, 1.0, 1.05, 0.3, 0, 0.15, 0, 'y', 14);
  box(yaw, P.rwGreen, 1.5, 1.4, 2.2, 0, 1.0, 0.2); box(yaw, P.rwDark, 1.3, 0.1, 1.9, 0, 1.75, 0.25);
  for (const sd of [-1, 1]) box(yaw, P.rwDark, 0.04, 0.8, 1.4, sd * 0.77, 1.0, 0.35);
  for (const sd of [-1, 1]) { const s = box(yaw, iff, 0.02, 0.05, 1.9, sd * 0.765, 1.55, 0.2); s.userData.keep = true; }
  // search radar: a flat panel on a short mast, spinning
  const radar = group(yaw, 0, 1.8, 0.7); radar.userData.part = true;
  cyl(radar, P.rwDark, 0.12, 0.15, 0.35, 0, 0.17, 0, 'y', 8);
  box(radar, P.rwGreen, 1.6, 0.85, 0.16, 0, 0.75, 0, -0.25); box(radar, P.black, 1.45, 0.7, 0.02, 0, 0.77, -0.09, -0.25);
  box(radar, P.ceramic, 0.25, 0.25, 0.25, 0.9, 0.45, 0.05);                                                             // RUNAWAY add-on: a ceramic sensor box on the mast
  const pitch = group(yaw, 0, 1.05, -0.4); pitch.userData.part = true;
  box(pitch, P.rwGreen, 1.2, 0.95, 0.5, 0, 0.0, -0.6); box(pitch, P.black, 1.0, 0.75, 0.04, 0, 0.0, -0.87);               // tracking radar face
  const dish = group(pitch, 0, 0, -0.9); dish.userData.part = true;                                                      // its antenna wobbles in track
  cyl(dish, P.ceramic, 0.3, 0.3, 0.08, 0, 0, 0, 'z', 10);
  cyl(pitch, P.rwDark, 0.16, 0.16, 3.0, 0, 0, 0, 'x', 10);
  const muzzles = [], flashes = [], cells = [];
  for (const sd of [-1, 1]) {
    // gun pair (twin 30 mm-style) low and outboard
    box(pitch, P.rwDark, 0.35, 0.4, 1.2, sd * 1.25, -0.35, 0.05);
    for (const dx of [-0.08, 0.08]) {
      const x = sd * 1.25 + dx; cyl(pitch, P.gun, 0.045, 0.05, 2.1, x, -0.33, -1.6, 'z', 6); cyl(pitch, P.black, 0.065, 0.06, 0.25, x, -0.33, -2.68, 'z', 7);
      muzzles.push(V(x, -0.33, -2.85)); flashes.push(flash(pitch, x, -0.33, -2.85, 0.6));
    }
    // missile pack: six tubes in a 2x3 block above the guns
    const px = sd * 1.25, py = 0.4;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const x = px + (c - 1) * 0.2, y = py + (r - 0.5) * 0.22;
      cyl(pitch, P.rwGreen, 0.095, 0.095, 2.6, x, y, -0.6, 'z', 8);
      const cover = new THREE.Mesh(new THREE.CircleGeometry(0.085, 8), lam(0x2c3324)); cover.rotation.y = Math.PI; cover.position.set(x, y, -1.91); pitch.add(cover);
      cells.push({ cover, pos: V(x, y, -2.0) });
    }
    box(pitch, P.rwDark, 0.7, 0.06, 2.4, px, py + 0.26, -0.6); box(pitch, P.rwDark, 0.7, 0.06, 2.4, px, py - 0.26, -0.6);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), lampMat(0xff2a1a)); lamp.position.set(0, 1.86, -0.6); yaw.add(lamp);
  return finish(g, { type: 'talon', yaw, pitch, spin: [], radar, dish, muzzles, cells, lamp, flashes, team, h: 3.9 });
}

// =========================================================================== RW-5 LANCE laser turret (RUNAWAY)
// Matte ceramic over dark composite, faceted and asymmetric: a tall plinth on three jointed claw legs, a wedge-shaped
// torso turning on a glowing bearing, the sensor head on its left, a stack of radiator fins on its back, and the long
// emitter carried on the right. Pale cyan seams brighten as it charges. About 3.5 m to the top of the fins.
function strut(p, m, a, b, w, h) {   // a box from point a to point b (in p's frame)
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, L), m);
  o.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()); p.add(o); return o;
}
export function buildLance(side = 2) {
  const g = new THREE.Group(), team = teamMat(side), base = group(g); base.userData.part = true;
  const glow = basic(0x6fe8ff), seam = (p, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => { const s = box(p, glow, w, h, d, x, y, z, rx, ry, rz); s.userData.keep = true; return s; };
  // three jointed claw legs, not quite evenly spaced
  for (const [a, reach] of [[0.5, 2.6], [2.55, 2.4], [4.35, 2.7]]) {
    const leg = group(base); leg.rotation.y = a;
    strut(leg, P.composite, [0.55, 1.15, 0], [1.7, 1.45, 0], 0.32, 0.36);            // upper arm
    strut(leg, P.composite, [1.7, 1.45, 0], [reach, 0.18, 0], 0.26, 0.3);            // fore arm down to the foot
    strut(leg, P.ceramic, [0.6, 1.36, 0], [1.72, 1.66, 0], 0.4, 0.08);               // armour plate on top
    cyl(leg, P.ceramic, 0.2, 0.2, 0.44, 1.7, 1.45, 0, 'z', 6);                         // knee
    box(leg, P.composite, 0.75, 0.16, 0.6, reach + 0.1, 0.08, 0);                       // foot pad
    box(leg, P.ceramic, 0.4, 0.1, 0.5, reach + 0.05, 0.2, 0);
    seam(leg, 1.0, 0.03, 0.03, 1.15, 1.42, 0.2, 0, 0, 0.26);
  }
  cyl(base, P.composite, 0.7, 0.95, 1.55, 0, 0.78, 0, 'y', 6);
  cyl(base, P.ceramic, 0.82, 0.78, 0.22, 0, 1.45, 0, 'y', 6);
  cyl(base, P.ceramic, 0.86, 1.04, 0.5, 0, 0.32, 0, 'y', 6);                                                                                       // armoured skirt
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 1.2; seam(base, 0.04, 0.7, 0.04, Math.cos(a) * 0.86, 0.95, Math.sin(a) * 0.86); }
  { const s = cyl(base, glow, 0.74, 0.74, 0.05, 0, 1.6, 0, 'y', 6); s.userData.keep = true; }                                                       // the glowing bearing
  for (const [x, z] of [[0.45, 0.62], [-0.6, 0.3]]) box(base, P.composite, 0.25, 0.35, 0.2, x, 0.3, z);                                              // conduit boxes
  const yaw = group(g, 0, 1.62, 0); yaw.userData.part = true;
  // torso: a wedge, sharp chin forward (-z), with a darker lower band
  prism(yaw, P.ceramic, [[-1.55, 0.45], [-1.15, 1.1], [-0.3, 1.5], [1.0, 1.45], [1.4, 0.95], [1.35, 0.15], [-0.9, 0.05]], 1.5);
  prism(yaw, P.composite, [[-1.5, 0.4], [-1.32, 0.62], [1.37, 0.62], [1.34, 0.12], [-0.9, 0.02]], 1.6);
  prism(yaw, P.composite, [[-0.4, 1.5], [0.9, 1.45], [0.85, 1.62], [-0.2, 1.64]], 0.5, -0.15);                                                        // spine
  for (const z of [-0.7, 0.1, 0.8]) box(yaw, P.composite, 1.52, 0.03, 0.03, 0, 1.0, z);                                                              // panel lines
  for (const sd of [-1, 1]) seam(yaw, 0.03, 0.03, 2.4, sd * 0.81, 0.64, 0.05);
  seam(yaw, 1.2, 0.03, 0.03, 0, 1.18, -1.2, -0.65);
  { const pnl = box(yaw, team, 0.5, 0.02, 0.6, -0.4, 1.53, 0.4, 0, 0, 0.04); pnl.userData.keep = true; }
  // RW-5 stencil glyph on the left flank (machine marks, not letters)
  for (const [dy, dz, h, d] of [[0.1, -0.25, 0.25, 0.05], [0.1, -0.12, 0.05, 0.22], [0.0, 0.05, 0.25, 0.05], [0.18, 0.18, 0.05, 0.18], [0.0, 0.3, 0.12, 0.05]]) box(yaw, P.stencil, 0.02, h, d, -0.76, 0.95 + dy, dz);
  // sensor head on the left: angular, three lenses and a status point
  const sens = group(yaw, -0.95, 1.05, -0.75);
  prismZ(sens, P.composite, [[-0.28, -0.3], [0.2, -0.32], [0.3, 0.1], [0.05, 0.35], [-0.3, 0.25]], 0.75, 0);
  box(sens, P.ceramic, 0.6, 0.08, 0.8, 0, 0.36, 0.02);
  for (const [x, y, r] of [[-0.05, 0.08, 0.13], [0.12, -0.15, 0.08], [-0.17, -0.17, 0.06]]) cyl(sens, P.lensDark, r, r, 0.06, x, y, -0.39, 'z', 10);
  strut(yaw, P.composite, [-0.75, 1.0, -0.6], [-0.95, 1.05, -0.75], 0.18, 0.18);
  // radiator stack on the back: fins glow red after a shot
  const finM = basic(0x2a2d31), vents = [];
  box(yaw, P.composite, 1.2, 0.18, 0.9, 0, 1.52, 0.95);
  for (let i = 0; i < 7; i++) { const x = -0.54 + i * 0.18, f = box(yaw, finM, 0.05, 0.7, 0.85, x, 1.95, 0.95); f.userData.keep = true; vents.push(V(x, 2.35, 0.95)); }
  // emitter on the right: trunnion out of the torso, long faceted barrel, focusing head, lens
  const pitch = group(yaw, 1.05, 1.0, -0.45); pitch.userData.part = true;
  cyl(pitch, P.composite, 0.3, 0.3, 0.6, -0.25, 0, 0, 'x', 8);
  cyl(pitch, P.ceramic, 0.38, 0.38, 0.75, 0, 0, 0.35, 'z', 8);                                                                                       // breech / capacitor housing
  cyl(pitch, P.composite, 0.4, 0.34, 0.45, 0, 0, 0.95, 'z', 8);
  cyl(pitch, P.composite, 0.2, 0.25, 3.3, 0, 0, -1.65, 'z', 8);                                                                                      // tube
  for (const z of [-0.6, -1.25, -1.9, -2.55]) { cyl(pitch, P.ceramic, 0.29, 0.29, 0.32, 0, 0, z, 'z', 8); const s = cyl(pitch, glow, 0.27, 0.27, 0.05, 0, 0, z - 0.2, 'z', 8); s.userData.keep = true; }
  cyl(pitch, P.ceramic, 0.36, 0.26, 0.7, 0, 0, -3.5, 'z', 8);                                                                                       // focusing head
  cyl(pitch, P.composite, 0.37, 0.37, 0.12, 0, 0, -3.88, 'z', 8);
  box(pitch, P.composite, 0.1, 0.18, 2.6, 0.24, 0.17, -1.6);                                                                                          // conduit along the tube
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.27, 16), glow); lens.rotation.y = Math.PI; lens.position.set(0, 0, -3.95); pitch.add(lens);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), lampMat(0x6fe8ff)); lamp.position.set(-0.85, 1.48, -0.7); yaw.add(lamp);
  return finish(g, { type: 'lance', yaw, pitch, spin: [], radar: null, dish: null, muzzles: [V(0, 0, -4.0)], lens: V(0, 0, -4.0), vents, lamp, flashes: [], team, glow, finM, h: 4.0 }, { mudH: 0.6 });
}

// =========================================================================== MIM-23 HAWK battery section (player)
// One firing section of a 1980 US Army Improved HAWK battery, dug in on an island AA slot: the M192 towed launcher
// (trailer on outriggers, a turret that trains and elevates three missiles riding on top of their launcher beams), the
// AN/MPQ-50 pulse acquisition radar (a rotating lattice reflector on its own trailer), a generator set, the cable run
// between them and a sandbag wall round the launcher. Olive drab, white stencils, star, bumper codes. Missiles: 5.03 m
// x 0.37 m, span 1.19 m. Footprint inside ~5 m of the origin; the launcher's turret ring sits at (-0.8, 0, 0.4).
// cells = the three missiles (each its own baked part, hidden when fired, shown again on reload).
function hawkMissile(p, x, y, z0) {
  const m = group(p, x, y, 0); m.userData.part = true;
  const r = 0.185, L = 5.03, zn = z0, zt = z0 + L;
  cyl(m, P.white, r, 0.0, 0.95, 0, 0, zn + 0.475, 'z', 12);                 // radome (cone, point forward)
  cyl(m, P.white, r, r, L - 1.05, 0, 0, zn + 0.95 + (L - 1.05) / 2, 'z', 12);
  cyl(m, P.yellow, r + 0.005, r + 0.005, 0.07, 0, 0, zn + 1.5, 'z', 12);    // warhead band
  cyl(m, P.canvas, r + 0.005, r + 0.005, 0.06, 0, 0, zn + 2.3, 'z', 12);    // motor band
  cyl(m, P.black, r * 0.8, r * 0.9, 0.1, 0, 0, zt - 0.05, 'z', 10);         // nozzle
  for (let k = 0; k < 4; k++) {                                            // cropped-delta wings with elevons, in an X
    const a = Math.PI / 4 + k * Math.PI / 2, f = group(m); f.rotation.z = a;
    prism(f, P.white, [[zt - 2.0, r - 0.02], [zt - 0.75, r + 0.4], [zt - 0.3, r + 0.41], [zt - 0.25, r - 0.02]], 0.03);
    prism(f, P.steel, [[zt - 0.25, r], [zt - 0.3, r + 0.41], [zt - 0.08, r + 0.41], [zt - 0.06, r]], 0.025);
  }
  box(m, P.stencil, 0.02, 0.05, 0.6, r + 0.002, 0.05, zn + 2.8);          // stencil lines along the side
  return m;
}
export function buildHawk(side = 1) {
  const g = new THREE.Group(), team = teamMat(side), base = group(g); base.userData.part = true;
  const sand = paint(0x7a7052, 1, { chip: 0 }), sand2 = paint(0x6c6447, 1, { chip: 0 });
  const LX = -0.8, LZ = 0.4;
  // ---- M192 launcher trailer: frame, axle and wheels, four outriggers on jack pads, tow bar with lunette
  const tr = group(base, LX, 0, LZ);
  box(tr, P.od, 1.3, 0.35, 3.9, 0, 0.62, -0.2); box(tr, P.odDark, 1.1, 0.12, 3.6, 0, 0.4, -0.2);
  for (const sd of [-1, 1]) {
    cyl(tr, P.rubber, 0.42, 0.42, 0.3, sd * 0.95, 0.42, 1.0, 'x', 14); cyl(tr, P.od, 0.25, 0.25, 0.32, sd * 0.95, 0.42, 1.0, 'x', 10);
    box(tr, P.od, 0.4, 0.06, 1.1, sd * 0.95, 0.9, 1.0);                                           // mudguard
    for (const dz of [-1, 1]) {                                                                 // outrigger arm, jack, pad
      const px = sd * 1.95, pz = dz < 0 ? -1.9 : 1.6, ax = sd * 0.6, az = dz < 0 ? -1.6 : 1.4;
      strut(tr, P.od, [ax, 0.55, az], [px, 0.35, pz], 0.14, 0.18);
      cyl(tr, P.steel, 0.06, 0.06, 0.35, px, 0.2, pz, 'y', 6); cyl(tr, P.steel, 0.2, 0.22, 0.05, px, 0.03, pz, 'y', 10);
    }
  }
  strut(tr, P.od, [-0.4, 0.5, -2.1], [0, 0.45, -3.15], 0.1, 0.12); strut(tr, P.od, [0.4, 0.5, -2.1], [0, 0.45, -3.15], 0.1, 0.12);
  cyl(tr, P.steel, 0.12, 0.12, 0.05, 0, 0.45, -3.25, 'y', 10); cyl(tr, P.steel, 0.04, 0.04, 0.45, 0, 0.22, -2.9, 'y', 6);   // lunette, parking leg
  for (const sd of [-1, 1]) { box(tr, P.stencil, 0.01, 0.1, 0.9, sd * 0.655, 0.66, -1.2); box(tr, P.red, 0.01, 0.08, 0.12, sd * 0.655, 0.64, 1.65); box(tr, P.stencil, 0.01, 0.07, 0.35, sd * 0.655, 0.52, 1.4); }
  box(tr, P.odDark, 0.6, 0.3, 0.5, 0.0, 0.94, -1.5); box(tr, P.black, 0.3, 0.12, 0.02, 0.0, 0.98, -1.76);   // junction box
  cyl(tr, P.odDark, 0.75, 0.8, 0.1, 0, 0.84, 0, 'y', 16);                                          // turret ring
  // ---- the turret: turntable, pedestal, trunnions; the pitch frame carries the torque tube, three beams, three missiles
  const yaw = group(g, LX, 0.9, LZ); yaw.userData.part = true;
  cyl(yaw, P.od, 0.7, 0.72, 0.18, 0, 0.09, 0, 'y', 16);
  box(yaw, P.od, 0.8, 0.62, 1.0, 0, 0.45, 0.25); box(yaw, P.odDark, 0.9, 0.08, 1.1, 0, 0.78, 0.25);
  for (const sd of [-1, 1]) { box(yaw, P.od, 0.12, 0.55, 0.42, sd * 0.42, 0.78, 0); cyl(yaw, P.steel, 0.1, 0.1, 0.06, sd * 0.5, 0.85, 0, 'x', 8); }
  strut(yaw, P.steel, [0, 0.2, -0.65], [0, 0.6, -0.2], 0.12, 0.12); cyl(yaw, P.black, 0.04, 0.04, 0.9, 0.35, 0.4, 0.75, 'y', 6);   // elevation jack, cable riser
  { const pnl = box(yaw, team, 0.42, 0.14, 0.02, 0, 0.5, -0.26); pnl.userData.keep = true; }
  for (const sd of [-1, 1]) box(yaw, P.stencil, 0.01, 0.06, 0.5, sd * 0.405, 0.45, 0.35);
  const pitch = group(yaw, 0, 0.85, 0); pitch.userData.part = true;
  cyl(pitch, P.od, 0.13, 0.13, 2.4, 0, 0, 0, 'x', 10);                                             // torque tube
  box(pitch, P.odDark, 2.3, 0.12, 0.35, 0, 0.08, -0.9); box(pitch, P.odDark, 2.3, 0.12, 0.3, 0, 0.08, 0.6);   // cross members
  const cells = [], xs = [-0.95, 0, 0.95];
  for (const x of xs) {
    box(pitch, P.od, 0.2, 0.24, 3.6, x, 0.2, -0.6);                                                // launcher beam
    box(pitch, P.steel, 0.08, 0.04, 3.4, x, 0.34, -0.6);                                           // rail
    box(pitch, P.odDark, 0.24, 0.1, 0.25, x, 0.2, -2.45);                                           // beam nose
    const ms = hawkMissile(pitch, x, 0.55, -3.4);
    cells.push({ cover: ms, pos: V(x, 0.55, -3.5) });
  }
  cyl(pitch, P.black, 0.03, 0.03, 1.9, 0.12, 0.33, -0.6, 'z', 5);                                  // umbilical
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), lampMat(0xffaa22)); lamp.position.set(0.3, 0.84, 0.6); yaw.add(lamp);
  // ---- AN/MPQ-50 acquisition radar trailer: two-wheel trailer, equipment box, pedestal, rotating lattice reflector
  const RX = 3.1, RZ = -1.5, rt = group(base, RX, 0, RZ); rt.rotation.y = 0.6;
  box(rt, P.od, 1.5, 0.3, 2.9, 0, 0.7, 0); box(rt, P.od, 1.35, 0.55, 1.2, 0, 1.12, 0.6);
  for (const sd of [-1, 1]) {
    cyl(rt, P.rubber, 0.4, 0.4, 0.28, sd * 0.92, 0.4, 0.2, 'x', 14); cyl(rt, P.od, 0.23, 0.23, 0.3, sd * 0.92, 0.4, 0.2, 'x', 10);
    for (const z of [-1.15, 1.15]) { strut(rt, P.od, [sd * 0.55, 0.6, z], [sd * 1.15, 0.25, z * 1.12], 0.1, 0.12); cyl(rt, P.steel, 0.16, 0.18, 0.05, sd * 1.15, 0.03, z * 1.12, 'y', 8); cyl(rt, P.steel, 0.05, 0.05, 0.25, sd * 1.15, 0.15, z * 1.12, 'y', 6); }
    box(rt, P.stencil, 0.01, 0.1, 0.8, sd * 0.755, 0.72, -0.6);
  }
  star(rt, P.stencil, 0.2, 0.68, 1.12, 0.55, Math.PI / 2); star(rt, P.stencil, 0.2, -0.68, 1.12, 0.55, -Math.PI / 2);
  strut(rt, P.od, [-0.4, 0.6, -1.4], [0, 0.55, -2.2], 0.08, 0.1); strut(rt, P.od, [0.4, 0.6, -1.4], [0, 0.55, -2.2], 0.08, 0.1);
  cyl(rt, P.odDark, 0.35, 0.45, 0.6, 0, 1.15, -0.55, 'y', 12);                                     // pedestal
  const radar = group(g); radar.userData.part = true;
  { const rw = new THREE.Vector3(0, 1.45, -0.55).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.6); radar.position.set(RX + rw.x, rw.y, RZ + rw.z); }
  cyl(radar, P.od, 0.22, 0.25, 0.3, 0, 0.15, 0, 'y', 10); box(radar, P.odDark, 0.5, 0.35, 0.6, 0, 0.4, 0.2);   // rotary joint, drive housing
  // the reflector: a cylindrical-parabolic lattice, 2.6 m wide, 1.3 m tall, tilted back; bars only (you see through it)
  const W = 2.6, H = 1.3, F = 0.55, nx = 9, ny = 5, ac = new THREE.Group(); ac.position.set(0, 1.15, 0.15); ac.rotation.x = -0.18; radar.add(ac);
  const pt = (u, v) => [u * W / 2, v * H / 2, (u * W / 2) ** 2 / (4 * F) * -1 + 0.0];   // dish curving forward at the edges (front = -z)
  for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) { const u0 = -1 + 2 * i / nx, u1 = -1 + 2 * (i + 1) / nx, v = -1 + 2 * j / ny; const a = pt(u0, v), b = pt(u1, v); strut(ac, j % ny === 0 ? P.od : P.steel, [a[0], a[1], -a[2]], [b[0], b[1], -b[2]], 0.035, 0.035); }
  for (let i = 0; i <= nx; i++) { const u = -1 + 2 * i / nx, a = pt(u, -1), b = pt(u, 1); strut(ac, i % nx === 0 ? P.od : P.steel, [a[0], a[1], -a[2]], [b[0], b[1], -b[2]], 0.035, 0.035); }
  for (const sd of [-1, 1]) strut(ac, P.odDark, [0, -0.35, 0.2], [sd * 1.0, 0, 0.12], 0.07, 0.07);   // backing truss
  strut(ac, P.odDark, [0, -0.7, 0.0], [0, 0.6, 0.15], 0.1, 0.12);
  strut(ac, P.od, [0, -0.62, -0.05], [0, -0.35, -0.95], 0.06, 0.06); box(ac, P.odDark, 0.32, 0.22, 0.2, 0, -0.3, -1.0);   // feed horn on its boom
  // ---- generator set on skids, its exhaust, the cable run, a tarp-covered crate
  const gen = group(base, -2.1, 0, -3.7); gen.rotation.y = 0.3;
  for (const sd of [-1, 1]) box(gen, P.steel, 0.08, 0.1, 1.7, sd * 0.45, 0.05, 0);
  box(gen, P.od, 1.0, 0.85, 1.5, 0, 0.53, 0); box(gen, P.odDark, 1.04, 0.05, 1.54, 0, 0.97, 0);
  for (let i = 0; i < 5; i++) box(gen, P.black, 0.02, 0.5, 0.06, 0.51, 0.55, -0.5 + i * 0.15);   // louvres
  cyl(gen, P.black, 0.05, 0.05, 0.5, -0.3, 1.2, 0.5, 'y', 6); box(gen, P.stencil, 0.01, 0.1, 0.6, -0.511, 0.7, 0); box(gen, P.yellow, 0.01, 0.12, 0.12, 0.511, 0.8, 0.55);
  const cab = paint(0x1a1b1a, 0.4, { mud: 0.5, chip: 0 });
  const cable = (pts) => { for (let i = 0; i < pts.length - 1; i++) strut(base, cab, pts[i], pts[i + 1], 0.05, 0.05); };
  cable([[-1.6, 0.1, -3.2], [-0.4, 0.03, -2.8], [1.2, 0.03, -2.6], [1.9, 0.03, -2.1], [2.0, 0.3, -1.75], [2.05, 0.62, -1.62]]);
  cable([[-0.4, 0.03, -2.8], [-0.7, 0.03, -2.0], [-0.7, 0.5, -1.8]]);
  box(base, P.canvas, 0.8, 0.45, 0.6, -3.3, 0.23, -1.2, 0, 0.4); box(base, P.odDark, 0.82, 0.05, 0.62, -3.3, 0.47, -1.2, 0, 0.4);
  // ---- sandbag wall: two courses round the back of the launcher, the tow bar side left open (clear of the missiles at any train / elevation)
  for (let c = 0; c < 2; c++) for (let i = 0; i < 15; i++) {
    const a = -1.5 + (i + (c ? 0.5 : 0)) / 15 * 3.0, rr = 2.85;
    box(base, (i + c) % 3 ? sand : sand2, 0.62, 0.24, 0.32, LX + Math.sin(a) * rr, 0.12 + c * 0.23, LZ + Math.cos(a) * rr, 0, a + Math.PI / 2, 0);
  }
  return finish(g, { type: 'hawk', yaw, pitch, spin: [], radar, dish: null, muzzles: [], cells, lamp, flashes: [], team, h: 2.4 }, { mudH: 0.5 });
}

export const BUILD = { vads: buildVADS, shilka: buildShilka, ciws: buildCIWS, sparrow: buildSparrow, talon: buildTalon, lance: buildLance, hawk: buildHawk,
  talonm: side => buildTalon(side, { mount: true }), lancem: side => buildLance(side) };   // SEAWORLD: ship mounts (game level, bible section 3)
export function buildDefence(type, side) { const m = BUILD[type](side); m.userData.defType = type; return m; }
