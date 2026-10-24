// NGC-1980 air defence unit models, real-world metres, flat-shaded Lambert, weathered at bake time (kit.js).
// Local frame: +y up, front along -z, origin on the ground (or the deck) under the turret ring.
//
// Every builder returns a THREE.Group whose userData is the contract with brain.js / war.js:
//   type     DEF key ('vads' | 'vadst' | 'shilka' | 'zu23' | 'ciws' | 'sparrow' | 'talon' | 'lance' | 'talonm' | 'lancem')
//   yaw      Group turning about y (traverse);  pitch: Group turning about x (elevation, + = up), child of yaw
//   spin     [Group] barrel clusters, spun about their local z
//   radar    Group spun about y while searching (null if none); dish: Group tilted to the target while tracking
//   muzzles  [Vector3] in the pitch frame;  cells: [{ cover, pos }] missile cells in the pitch frame
//   lamp     the tell lamp (MeshBasic, its own material); flashes: [Mesh] muzzle flash stars (hidden)
//   team     the team-colour material (war.js recolours by identity);  glow: emissive material (LANCE seams, lens)
//   lens     LANCE emitter tip in the pitch frame;  vents: radiator points in the yaw frame
//   eject    where spent cases / links leave the gun (pitch frame);  sens: the LANCE's sweeping sensor head
//   slotZ    hull z of the turret ring: brain.js seat() puts that point on the AA slot
//   crewSpots [{ role: 'gunner' | 'hatch' | 'spotter' | 'loader' | 'tick', kit, parent, p | home / ammo / gun / deck }]
import * as THREE from 'three';
import { paint, lam, basic, box, cyl, prism, prismZ, sphere, group, star, bake, BAKED } from './kit.js';
import { makeCrew, makeTick, HIP } from './crew.js';

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
// (crews are animated figures from crew.js, placed per instance from ud.crewSpots - see buildDefence below)
// ready-use ammunition: a small stack of boxes on the ground (the loaders fetch from here), yellow-banded lids
function readyAmmo(p, x, z, ry, m) {
  const s = group(p, x, 0, z); s.rotation.y = ry;
  for (let k = 0; k < 5; k++) { const u = (k % 3 - 1) * 0.47, v = 0.125 + Math.floor(k / 3) * 0.25; box(s, m, 0.44, 0.25, 0.22, u, v, 0, 0, (k * 0.37 % 0.2) - 0.1); box(s, P.yellow, 0.45, 0.04, 0.23, u, v + 0.065, 0, 0, (k * 0.37 % 0.2) - 0.1); }
  box(s, P.canvas, 1.5, 0.05, 0.6, 0, 0.02, 0.05);                                                        // a tarp under them
  return s;
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
  // (the gunner is an animated crew figure: crewSpots below)
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
  readyAmmo(g, 1.45, 3.35, 0.3, P.od);                                                                    // ready-use boxes on the ground behind
  return finish(g, { type: 'vads', yaw, pitch, spin: [barrels], radar: null, dish: null, muzzles: [V(-0.08, 0.02, -1.85)], eject: V(0.22, -0.15, 0.35), lamp, flashes: [fl], team, h: 2.7, slotZ: 0.45,
    crewSpots: [
      { role: 'gunner', kit: 'us', parent: 'yaw', p: [0.15, 0.51, 0.34] },
      { role: 'hatch', kit: 'us', parent: 'hull', p: [-0.55, 1.83, -1.2], low: true },
      { role: 'loader', kit: 'us', parent: 'root', home: [2.05, 1.2], ammo: [1.45, 2.95], gun: [1.55, 0.6] },
    ] });
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
  // (the commander in his hatch is an animated crew figure: crewSpots below)
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
  for (const sd of [-1, 1]) readyAmmo(g, sd * 2.45, 1.7, sd * 0.2 + 1.57, P.sovDark);
  return finish(g, { type: 'shilka', yaw, pitch, spin: [], radar, dish, muzzles, eject: V(0, -0.32, 0.25), lamp, flashes, team, h: 3.1, slotZ: -0.5,
    crewSpots: [
      { role: 'hatch', kit: 'tank', parent: 'yaw', p: [-0.6, 0.92, 0.1] },
      { role: 'hatch', kit: 'tank', parent: 'hull', p: [-0.55, 1.42, -2.0], low: true },
      { role: 'loader', kit: 'tank', parent: 'root', home: [2.5, -1.6], ammo: [2.45, 1.3], gun: [1.9, -0.9] },
      { role: 'loader', kit: 'tank', parent: 'root', home: [-2.5, 0.2], ammo: [-2.45, 1.3], gun: [-1.9, -0.9] },
    ] });
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
  // RUNAWAY reload: a rack of spare missile canisters on the rear deck, worked by the TICK service machine (crew.js)
  if (!opts.mount) { const rk = group(body, -0.7, 1.7, 3.95); box(rk, P.rwDark, 0.7, 0.08, 0.5, 0, 0.04, 0); for (let k = 0; k < 3; k++) cyl(rk, P.rwGreen, 0.1, 0.1, 0.9, -0.22 + k * 0.22, 0.2, 0, 'z', 8); box(rk, P.ceramic, 0.12, 0.3, 0.5, 0.36, 0.2, 0); }
  return finish(g, { type: 'talon', yaw, pitch, spin: [], radar, dish, muzzles, cells, eject: V(1.25, -0.6, 0.4), lamp, flashes, team, h: 3.9, slotZ: opts.mount ? 0 : 2.3,
    crewSpots: opts.mount ? [] : [{ role: 'tick', kit: 'tick', parent: 'root', home: [2.0, 0, 3.7], deck: [0.85, 1.7, 4.0] }] });
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
  const sens = group(yaw, -0.95, 1.05, -0.75); sens.userData.part = true;   // sweeps while searching (brain.js)
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
  return finish(g, { type: 'lance', yaw, pitch, spin: [], radar: null, dish: null, sens, muzzles: [V(0, 0, -4.0)], lens: V(0, 0, -4.0), vents, lamp, flashes: [], team, glow, finM, h: 4.0 }, { mudH: 0.6 });
}

// =========================================================================== M167 VADS, towed (player, command 2)
// The towed Vulcan of the US light divisions and the Marines in 1980: the M163's gun, range-only radar and open gunner's
// mount on a two-wheel M42 carriage. Emplaced it sits on three levelling jacks with the wheels raised clear and the
// drawbar folded up; the gunner rides the mount, the loader and the squad leader (spotter) work round it. About 4.9 m
// long with the drawbar, 2 m wide. Olive drab, white star on the beam.
export function buildM167(side = 1) {
  const g = new THREE.Group(), team = teamMat(side), base = group(g); base.userData.part = true;
  box(base, P.od, 0.5, 0.32, 3.3, 0, 0.45, 0.2);                                                         // the carriage's box beam
  box(base, P.odDark, 1.7, 0.22, 0.42, 0, 0.47, 0.9);                                                     // axle beam
  for (const sd of [-1, 1]) {
    cyl(base, P.rubber, 0.42, 0.42, 0.26, sd * 1.0, 0.74, 0.9, 'x', 14); cyl(base, P.od, 0.25, 0.25, 0.28, sd * 1.0, 0.74, 0.9, 'x', 10); cyl(base, P.steel, 0.08, 0.08, 0.3, sd * 1.0, 0.74, 0.9, 'x', 6);   // wheel, raised clear
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; box(base, P.rubber, 0.27, 0.04, 0.09, sd * 1.0, 0.74 + Math.sin(a) * 0.42, 0.9 + Math.cos(a) * 0.42, a); }   // tread
    box(base, P.od, 0.3, 0.05, 0.95, sd * 1.0, 1.2, 0.9); box(base, P.od, 0.3, 0.3, 0.05, sd * 1.0, 1.06, 0.43, 0.4);   // mudguard
    strut(base, P.od, [sd * 0.25, 0.42, -0.35], [sd * 1.5, 0.22, -0.7], 0.14, 0.14);                        // outrigger
    cyl(base, P.steel, 0.05, 0.05, 0.32, sd * 1.5, 0.18, -0.7, 'y', 6); cyl(base, P.odDark, 0.2, 0.2, 0.05, sd * 1.5, 0.025, -0.7, 'y', 8);   // jack and pad
    box(base, P.red, 0.08, 0.06, 0.03, sd * 0.18, 0.5, 1.87);                                               // tail lights
  }
  cyl(base, P.steel, 0.06, 0.06, 0.45, 0, 0.22, 1.72, 'y', 6); cyl(base, P.odDark, 0.22, 0.22, 0.05, 0, 0.025, 1.72, 'y', 8);   // rear jack
  cyl(base, P.steel, 0.06, 0.06, 0.45, 0, 0.22, -1.32, 'y', 6); cyl(base, P.odDark, 0.22, 0.22, 0.05, 0, 0.025, -1.32, 'y', 8); // front jack
  strut(base, P.od, [0, 0.52, -1.42], [0, 1.2, -2.05], 0.12, 0.12); cyl(base, P.steel, 0.11, 0.11, 0.05, 0, 1.25, -2.1, 'x', 10);   // drawbar folded up, lunette
  box(base, P.odDark, 0.4, 0.3, 0.3, 0, 0.75, 1.45); box(base, P.stencil, 0.3, 0.05, 0.01, 0, 0.8, 1.6);    // tool box with its stencil
  star(base, P.stencil, 0.15, 0.252, 0.45, -0.6, Math.PI / 2); star(base, P.stencil, 0.15, -0.252, 0.45, -0.6, -Math.PI / 2);
  // the mount: turntable, drive box under the seat, the seat, the sight head with its hand grips
  const yaw = group(g, 0, 0.62, 0); yaw.userData.part = true;
  cyl(yaw, P.od, 0.78, 0.84, 0.16, 0, 0.08, 0, 'y', 14);
  box(yaw, P.odDark, 0.95, 0.5, 0.75, 0.25, 0.41, 0.4);
  box(yaw, P.steel, 0.46, 0.06, 0.42, 0.25, 0.69, 0.42); box(yaw, P.od, 0.46, 0.5, 0.06, 0.25, 0.97, 0.66, -0.15);   // seat pan and back
  cyl(yaw, P.od, 0.05, 0.05, 0.6, 0.25, 0.85, -0.12, 'y', 6);
  box(yaw, P.odDark, 0.44, 0.42, 0.34, 0.25, 1.2, -0.15); box(yaw, P.glass, 0.34, 0.24, 0.03, 0.25, 1.28, -0.33, -0.2);   // sight head
  for (const sd of [-1, 1]) box(yaw, P.black, 0.07, 0.07, 0.26, 0.25 + sd * 0.22, 0.95, -0.28);           // hand grips
  { const pnl = box(yaw, team, 0.5, 0.02, 0.4, 0.25, 0.665, 0.0); pnl.userData.keep = true; }
  for (const sd of [-1, 1]) box(yaw, P.od, 0.05, 0.28, 0.6, -0.45 + sd * 0.28, 0.3, -0.05);               // gun cradle cheeks
  const pitch = group(yaw, -0.45, 0.72, -0.08); pitch.userData.part = true;
  cyl(pitch, P.od, 0.16, 0.16, 0.7, 0, 0, 0, 'x', 10);
  box(pitch, P.odDark, 0.42, 0.4, 0.9, 0, -0.04, 0.22);                                                   // feeder / receiver
  cyl(pitch, P.odDark, 0.3, 0.3, 0.52, -0.02, -0.18, 0.7, 'x', 12); cyl(pitch, P.steel, 0.31, 0.31, 0.04, -0.28, -0.18, 0.7, 'x', 12);   // the linkless drum
  const sp = group(pitch, 0, 0.02, -0.25); const barrels = rotary(sp, 1.55, 0.034, 0.09, { clamps: 2, housing: 0.2 });
  box(pitch, P.od, 0.85, 0.1, 0.1, 0.5, 0.05, -0.1);                                                      // radar arm across to the right
  const radar = group(pitch, 1.0, 0.12, -0.12); radar.userData.part = true;
  cyl(radar, P.od, 0.22, 0.25, 0.4, 0, 0, 0, 'z', 10); sphere(radar, P.odDark, 0.22, 0, 0, -0.2, 10, 6, Math.PI * 2, Math.PI / 2).rotation.x = -Math.PI / 2;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), lampMat(0xffaa22)); lamp.position.set(0.25, 1.45, -0.05); yaw.add(lamp);
  const fl = flash(pitch, 0, 0.02, -1.85, 0.7);
  readyAmmo(g, 2.05, 3.0, 0.15, P.od);
  return finish(g, { type: 'vadst', yaw, pitch, spin: [barrels], radar: null, dish: null, muzzles: [V(0, 0.02, -1.85)], eject: V(0.25, -0.2, 0.3), lamp, flashes: [fl], team, h: 2.0, slotZ: 0,
    crewSpots: [
      { role: 'gunner', kit: 'us', parent: 'yaw', p: [0.25, 0.72, 0.44] },
      { role: 'spotter', kit: 'us', parent: 'root', home: [-2.1, -0.4] },
      { role: 'loader', kit: 'us', parent: 'root', home: [1.85, 1.3], ammo: [2.0, 2.6], gun: [0.95, 0.75] },
    ] });
}

// =========================================================================== ZU-23-2 (player: the Soviet contingent)
// The Soviet towed twin 23 mm: two guns side by side in a light cradle on a rotating mount, emplaced on its three-point
// base with the wheels swung up off the ground. Two men ride it (the gunner on the left behind the optical sight, the
// second on the right at the traverse wheel); two more swap the 50-round box magazines. Trunnions about 1.1 m up,
// barrels ~2 m. Soviet green.
export function buildZU23(side = 1) {
  const g = new THREE.Group(), team = teamMat(side), base = group(g); base.userData.part = true;
  box(base, P.sovGreen, 0.95, 0.22, 0.95, 0, 0.32, 0);                                                   // the base's centre box
  for (const [px, pz] of [[0, -1.55], [-1.2, 1.0], [1.2, 1.0]]) {                                         // three arms down to jack pads
    strut(base, P.sovGreen, [px * 0.25, 0.32, pz * 0.25], [px, 0.16, pz], 0.16, 0.12);
    cyl(base, P.steel, 0.05, 0.05, 0.25, px, 0.13, pz, 'y', 6); cyl(base, P.sovDark, 0.2, 0.2, 0.05, px, 0.025, pz, 'y', 8);
  }
  for (const sd of [-1, 1]) {   // the wheels, swung up on their arms at the sides
    const w = group(base, sd * 0.95, 0.62, 0.3); w.rotation.z = sd * 0.95;
    cyl(w, P.rubber, 0.37, 0.37, 0.2, 0, 0, 0, 'x', 14); cyl(w, P.sovGreen, 0.22, 0.22, 0.22, 0, 0, 0, 'x', 10); cyl(w, P.steel, 0.07, 0.07, 0.24, 0, 0, 0, 'x', 6);
    strut(base, P.sovDark, [sd * 0.45, 0.35, 0.3], [sd * 0.95, 0.62, 0.3], 0.1, 0.1);
  }
  box(base, P.sovDark, 0.5, 0.25, 0.3, 0, 0.3, 0.75);                                                     // tool / spare-barrel box at the back
  // the rotating mount: turntable, cradle cheeks, two seats with footrests, hand wheels, the sight on the left
  const yaw = group(g, 0, 0.43, 0); yaw.userData.part = true;
  cyl(yaw, P.sovGreen, 0.62, 0.66, 0.12, 0, 0.06, 0, 'y', 14);
  for (const sd of [-1, 1]) box(yaw, P.sovGreen, 0.08, 0.66, 0.62, sd * 0.4, 0.45, -0.05);
  for (const sd of [-1, 1]) {
    box(yaw, P.sovDark, 0.4, 0.06, 0.36, sd * 0.55, 0.6, 0.55); box(yaw, P.sovGreen, 0.4, 0.3, 0.05, sd * 0.55, 0.78, 0.74, -0.15);   // seat and back
    strut(yaw, P.sovGreen, [sd * 0.3, 0.15, 0.3], [sd * 0.55, 0.57, 0.55], 0.06, 0.06);                  // seat post
    box(yaw, P.steel, 0.3, 0.04, 0.16, sd * 0.55, 0.14, 0.05);                                            // footrest / pedal
    cyl(yaw, P.steel, 0.14, 0.14, 0.03, sd * 0.47, 0.78, 0.22, 'x', 12); cyl(yaw, P.black, 0.02, 0.02, 0.12, sd * 0.55, 0.78 + 0.1, 0.22, 'x', 4);   // hand wheel + crank
  }
  box(yaw, P.sovDark, 0.2, 0.36, 0.3, -0.55, 1.08, 0.12); box(yaw, P.black, 0.08, 0.08, 0.14, -0.55, 1.1, 0.3); box(yaw, P.glass, 0.16, 0.12, 0.02, -0.55, 1.18, -0.04);   // the sight: body, eyepiece, objective
  { const pnl = box(yaw, team, 0.5, 0.02, 0.3, 0, 0.13, 0.45); pnl.userData.keep = true; }
  // the cradle: trunnion, the two guns with their cooling-ribbed barrels and flash hiders, box magazines outboard
  const pitch = group(yaw, 0, 0.62, -0.08); pitch.userData.part = true;
  cyl(pitch, P.sovGreen, 0.09, 0.09, 0.84, 0, 0, 0, 'x', 10);
  box(pitch, P.sovGreen, 0.62, 0.22, 1.0, 0, -0.04, 0.12);
  const muzzles = [], flashes = [];
  for (const sd of [-1, 1]) {
    const x = sd * 0.19;
    box(pitch, P.sovDark, 0.15, 0.24, 1.05, x, 0.1, 0.18);                                                // receiver
    cyl(pitch, P.gun, 0.042, 0.042, 0.42, x, 0.1, -0.52, 'z', 8);                                         // barrel jacket
    cyl(pitch, P.gun, 0.03, 0.034, 1.62, x, 0.1, -1.5, 'z', 6);                                           // barrel
    for (let k = 0; k < 3; k++) cyl(pitch, P.steel, 0.045, 0.045, 0.04, x, 0.1, -0.85 - k * 0.42, 'z', 6);   // clamps
    cyl(pitch, P.black, 0.05, 0.045, 0.22, x, 0.1, -2.38, 'z', 7);                                        // flash hider
    cyl(pitch, P.steel, 0.035, 0.035, 0.55, x, -0.06, -0.45, 'z', 6);                                    // recoil spring tube
    box(pitch, P.sovGreen, 0.16, 0.3, 0.44, sd * 0.4, 0.2, 0.18); box(pitch, P.sovDark, 0.17, 0.04, 0.45, sd * 0.4, 0.36, 0.18);   // 50-round box magazine
    muzzles.push(V(x, 0.1, -2.5)); flashes.push(flash(pitch, x, 0.1, -2.52, 0.55));
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), lampMat(0xffaa22)); lamp.position.set(-0.55, 1.32, 0.15); yaw.add(lamp);
  for (const sd of [-1, 1]) readyAmmo(g, sd * 1.9, 2.55, sd * 0.25, P.sovGreen);
  return finish(g, { type: 'zu23', yaw, pitch, spin: [], radar: null, dish: null, muzzles, eject: V(0, -0.2, 0.35), lamp, flashes, team, h: 1.8, slotZ: 0,
    crewSpots: [
      { role: 'gunner', kit: 'sov', parent: 'yaw', p: [-0.55, 0.63, 0.6] },
      { role: 'gunner', kit: 'sov', parent: 'yaw', p: [0.55, 0.63, 0.6], second: true },
      { role: 'loader', kit: 'sov', parent: 'root', home: [-2.35, 0.7], ammo: [-1.9, 2.15], gun: [-0.95, 0.45] },
      { role: 'loader', kit: 'sov', parent: 'root', home: [2.35, 0.7], ammo: [1.9, 2.15], gun: [0.95, 0.45] },
    ] });
}

// =========================================================================== lo-detail stand-ins (LOD far level)
// a few boxes per unit in the same weathered vertex colours: body / turret / gun, plus the team panel. 3-4 draw calls.
const LO_SPEC = {
  vads: { b: [[2.7, 0.75, 4.8, 0, 1.45, 0, 'od'], [2.75, 0.75, 4.6, 0, 0.62, 0, 'track']], y: [0, 1.83, 0.45], yb: [[1.9, 0.62, 1.3, 0, 0.31, 0.05, 'od'], [0.5, 0.5, 0.4, 0.15, 0.95, -0.1, 'odDark']], p: [-0.32, 0.75, -0.2], pb: [[0.5, 0.45, 0.9, -0.08, -0.05, 0.25, 'odDark'], [0.24, 0.24, 1.6, -0.08, 0.02, -1.05, 'gun'], [0.5, 0.5, 0.42, 0.85, 0.12, -0.15, 'od']] },
  vadst: { b: [[0.5, 0.32, 3.3, 0, 0.45, 0.2, 'od'], [2.25, 0.84, 0.3, 0, 0.74, 0.9, 'rubber'], [3.0, 0.14, 0.18, 0, 0.3, -0.55, 'od']], y: [0, 0.62, 0], yb: [[1.6, 0.16, 1.6, 0, 0.08, 0, 'od'], [0.95, 0.5, 0.75, 0.25, 0.41, 0.4, 'odDark'], [0.44, 0.42, 0.34, 0.25, 1.2, -0.15, 'odDark']], p: [-0.45, 0.72, -0.08], pb: [[0.42, 0.4, 0.9, 0, -0.04, 0.22, 'odDark'], [0.22, 0.22, 1.6, 0, 0.02, -1.05, 'gun'], [0.5, 0.5, 0.4, 1.0, 0.12, -0.12, 'od']] },
  shilka: { b: [[3.0, 0.62, 6.4, 0, 1.1, 0, 'sovGreen'], [3.0, 0.75, 5.6, 0, 0.5, 0, 'track']], y: [0, 1.42, -0.5], yb: [[3.3, 0.8, 2.9, 0, 0.45, 0, 'sovGreen'], [0.22, 0.7, 0.22, 0, 1.2, 1.25, 'sovDark'], [1.4, 1.3, 0.25, 0, 1.7, 1.0, 'sovGreen']], p: [0, 0.55, -1.3], pb: [[1.6, 0.6, 0.6, 0, 0, 0.15, 'sovDark'], [1.35, 0.4, 2.4, 0, 0.03, -1.2, 'gun']] },
  zu23: { b: [[2.4, 0.2, 2.6, 0, 0.22, -0.25, 'sovGreen'], [2.1, 0.7, 0.3, 0, 0.62, 0.3, 'rubber']], y: [0, 0.43, 0], yb: [[1.3, 0.12, 1.3, 0, 0.06, 0, 'sovGreen'], [1.5, 0.35, 0.4, 0, 0.7, 0.6, 'sovDark'], [0.9, 0.66, 0.62, 0, 0.45, -0.05, 'sovGreen']], p: [0, 0.62, -0.08], pb: [[0.95, 0.4, 1.05, 0, 0.1, 0.15, 'sovGreen'], [0.5, 0.1, 2.1, 0, 0.1, -1.45, 'gun']] },
  ciws: { b: [[1.8, 0.35, 1.8, 0, 0.17, 0, 'deckGrey']], y: [0, 0.35, 0], yb: [[1.5, 1.6, 1.5, 0, 0.8, 0, 'haze']], p: [0, 1.45, 0], pb: [[1.0, 1.4, 1.0, 0, 0.75, 0.15, 'white'], [0.85, 0.85, 1.25, 0, -0.18, 0.55, 'haze'], [0.3, 0.3, 1.6, 0, -0.18, -1.0, 'gun']] },
  sparrow: { b: [[1.6, 0.5, 1.6, 0, 0.25, 0, 'deckGrey']], y: [0, 0.5, 0], yb: [[1.7, 1.0, 1.0, 0, 0.6, 0.1, 'haze']], p: [0, 1.25, 0.1], pb: [[1.3, 0.7, 3.6, 0, 0.12, 0.3, 'haze']] },
  talon: { b: [[2.55, 1.8, 2.15, 0, 2.1, -3.65, 'rwGreen'], [2.45, 1.5, 2.6, 0, 2.0, -1.0, 'rwGreen'], [2.45, 0.5, 4.0, 0, 1.45, 2.2, 'rwGreen'], [2.6, 1.2, 7.0, 0, 0.6, -0.2, 'rubber']], y: [0, 1.7, 2.3], yb: [[1.5, 1.4, 2.2, 0, 1.0, 0.2, 'rwGreen'], [1.6, 0.85, 0.16, 0, 2.55, 0.7, 'rwGreen']], p: [0, 1.05, -0.4], pb: [[1.2, 0.95, 0.5, 0, 0, -0.6, 'rwGreen'], [0.7, 0.75, 2.6, 1.25, 0.1, -0.7, 'rwDark'], [0.7, 0.75, 2.6, -1.25, 0.1, -0.7, 'rwDark']] },
  talonm: { b: [[2.6, 1.0, 2.6, 0, 0.5, 0, 'rwGreen']], y: [0, 1.15, 0], yb: [[1.5, 1.4, 2.2, 0, 1.0, 0.2, 'rwGreen'], [1.6, 0.85, 0.16, 0, 2.55, 0.7, 'rwGreen']], p: [0, 1.05, -0.4], pb: [[1.2, 0.95, 0.5, 0, 0, -0.6, 'rwGreen'], [0.7, 0.75, 2.6, 1.25, 0.1, -0.7, 'rwDark'], [0.7, 0.75, 2.6, -1.25, 0.1, -0.7, 'rwDark']] },
  lance: { b: [[1.9, 1.6, 1.9, 0, 0.8, 0, 'composite'], [5.0, 0.3, 0.45, 0, 0.6, 0, 'composite'], [0.45, 0.3, 5.0, 0, 0.6, 0, 'composite']], y: [0, 1.62, 0], yb: [[1.5, 1.4, 2.9, 0, 0.8, -0.1, 'ceramic'], [1.2, 0.75, 0.9, 0, 1.95, 0.95, 'composite'], [0.6, 0.65, 0.75, -0.95, 1.05, -0.75, 'composite']], p: [1.05, 1.0, -0.45], pb: [[0.6, 0.6, 4.3, 0, 0, -1.5, 'ceramic']] },
};
LO_SPEC.lancem = LO_SPEC.lance;
const LO_FAR = { ciws: 170, sparrow: 170, talonm: 190, lancem: 190 };   // m from the camera to the lo level (default 220)
function buildLo(type, side) {
  const S = LO_SPEC[type], g = new THREE.Group(), team = teamMat(side), body = group(g); body.userData.part = true;
  const bx = (p, b) => { for (const [w, h, d, x, y, z, k] of b) box(p, P[k], w, h, d, x, y, z); };
  bx(body, S.b);
  const yaw = group(g, ...S.y); yaw.userData.part = true; bx(yaw, S.yb);
  const pitch = group(yaw, ...S.p); pitch.userData.part = true; bx(pitch, S.pb);
  { const top = S.yb[0], pnl = box(yaw, team, top[0] * 0.5, 0.03, top[2] * 0.35, top[3], top[4] + top[1] / 2 + 0.02, top[5]); pnl.userData.keep = true; }
  bake(g, { seed: 7 });
  g.userData = { yaw, pitch, team };
  return g;
}

export const BUILD = { vads: buildVADS, vadst: buildM167, shilka: buildShilka, zu23: buildZU23, ciws: buildCIWS, sparrow: buildSparrow, talon: buildTalon, lance: buildLance,
  talonm: side => buildTalon(side, { mount: true }), lancem: side => buildLance(side) };   // SEAWORLD: ship mounts (game level, bible section 3)

// =========================================================================== instances
// Each type / side is modelled and baked ONCE (a prototype); every unit is a clone that shares its geometry and
// materials (the LANCE's glow and radiator materials are per unit: they light up per unit). A unit is a THREE.LOD:
// the full model near the camera, the box stand-in beyond LO_FAR. The crews are added per unit (crew.js).
// userData (the brain.js / war.js contract, see the top of this file) also carries:
//   hi, lo        the two LOD levels;  loYaw / loPitch: the stand-in's turret (brain.js mirrors the real one)
//   crew          [{ spot, fig, tick }]: the animated crewmen (spot = the model's crewSpots entry)
//   setState(st)  'intact' | 'damaged' | 'destroyed' (war.js killStruct calls it): the wreck stays on the slot,
//                 burnt (charred material), turret knocked askew, barrels drooping, crew gone, lamps out
const PROTO = new Map(), LOPROTO = new Map();
// the burnt-out look: every paint goes to scorched rust-brown and soot (its old shade still shows a little), per face
const BURNT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
BURNT.onBeforeCompile = sh => {
  sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
    { float l = dot(vColor.rgb, vec3(0.3, 0.59, 0.11)); vec3 b = vec3(0.075, 0.052, 0.04) + l * vec3(0.55, 0.42, 0.33);
      float n = fract(sin(dot(floor(position * 2.3), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      vColor.rgb = mix(vColor.rgb, b * (0.55 + 0.9 * n), 0.88); }`);
};
function cloneTree(src) {   // clone with object references in userData remapped to the copies (Object3D.copy would JSON them)
  const ud = src.userData; src.userData = {};
  const c = src.clone(true); src.userData = ud;
  const a = [], b = []; src.traverse(o => a.push(o)); c.traverse(o => b.push(o));
  const map = new Map(); a.forEach((o, i) => map.set(o, b[i]));
  const M = v => v && v.isObject3D ? map.get(v) || v : v && v.cover ? { ...v, cover: map.get(v.cover) || v.cover } : v;
  const out = {};
  for (const [k, v] of Object.entries(ud)) out[k] = Array.isArray(v) ? v.map(M) : M(v);
  for (const key of ['glow', 'finM']) if (ud[key]) { const m = ud[key].clone(); c.traverse(o => { if (o.material === ud[key]) o.material = m; }); out[key] = m; }
  c.userData = out; return c;
}
export function buildDefence(type, side) {
  const k = type + ':' + side;
  if (!PROTO.has(k)) PROTO.set(k, BUILD[type](side));
  if (!LOPROTO.has(k)) LOPROTO.set(k, buildLo(type, side));
  const hi = cloneTree(PROTO.get(k)), lo = cloneTree(LOPROTO.get(k)), ud = hi.userData;
  const root = new THREE.LOD(); root.addLevel(hi, 0); root.addLevel(lo, LO_FAR[type] ?? 220);
  Object.assign(ud, { defType: type, hi, lo, loYaw: lo.userData.yaw, loPitch: lo.userData.pitch, crew: [] });
  hi.userData = {}; lo.userData = {}; root.userData = ud;
  // crews: figures on the mount (seated / in the hatches) and on the ground round it
  for (const spot of ud.crewSpots || []) {
    if (spot.kit === 'tick') { const T = makeTick(); T.g.scale.setScalar(0.75); T.g.position.set(...spot.home); hi.add(T.g); ud.crew.push({ spot, fig: T, tick: true, at: 'home', s: 0 }); continue; }
    const C = makeCrew(spot.kit), par = spot.parent === 'yaw' ? ud.yaw : hi;
    if (spot.role === 'gunner') { C.g.position.set(spot.p[0], spot.p[1] - HIP, spot.p[2]); C.pose('sit'); }
    else if (spot.role === 'hatch') { C.g.position.set(spot.p[0], spot.p[1] - (spot.low ? 1.5 : 1.08), spot.p[2]); for (const l of [C.thighL, C.thighR]) l.visible = false; C.pose('hatch'); }
    else { C.g.position.set(spot.home[0], 0, spot.home[1]); C.pose('stand'); }
    par.add(C.g); ud.crew.push({ spot, fig: C, job: 'idle', x: C.g.position.x, z: C.g.position.z, t: 0 });
  }
  const yaw0 = ud.yaw.position.clone(), rot0 = ud.yaw.rotation.clone(), hidden = [];
  ud.state = 'intact';
  ud.setState = st => {
    const was = ud.state; ud.state = st; if (st === was) return;
    const burnt = st === 'destroyed';
    for (const lvl of [hi, lo]) lvl.traverse(o => { if (o.isMesh && (o.material === BAKED || o.material === BURNT)) o.material = burnt ? BURNT : BAKED; });
    for (const c of ud.crew) c.fig.g.visible = !burnt;
    if (burnt) {
      // everything that glows or carries a colour goes dark: lamps, IFF strips, flashes, the team panel, the LANCE's seams
      for (const lvl of [hi, lo]) lvl.traverse(o => { if (o.isMesh && o.visible && o.material !== BURNT && !(ud.cells || []).some(c => c.cover === o)) { o.visible = false; hidden.push(o); } });
      const r = (a, b) => a + Math.random() * (b - a), sd = Math.random() < 0.5 ? -1 : 1, towed = type === 'vadst' || type === 'zu23';
      ud.yaw.position.y += towed ? 0 : r(0.08, 0.2); ud.yaw.rotation.y += r(-0.6, 0.6);
      ud.yaw.rotation.x = r(-0.12, 0.12); ud.yaw.rotation.z = sd * (towed ? r(0.25, 0.4) : r(0.08, 0.22));   // blown off its ring / knocked over on its mount
      ud.pitch.rotation.x = r(-0.12, -0.04);                                                                // barrels droop
      if (ud.radar) ud.radar.rotation.z = sd * r(0.4, 0.8);                                                  // the mast bent over
      if (ud.loYaw) ud.loYaw.rotation.set(ud.yaw.rotation.x, ud.yaw.rotation.y, ud.yaw.rotation.z);
    } else {
      for (const o of hidden) o.visible = !(o === ud.lamp || ud.flashes.includes(o)); hidden.length = 0;
      ud.yaw.position.copy(yaw0); ud.yaw.rotation.copy(rot0); if (ud.radar) ud.radar.rotation.z = 0;
    }
  };
  return root;
}
