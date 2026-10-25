// USNS SGT. MILO K. TRASK (T-AK 297): the task force's supply ship, the counterpart of the RUNAWAY's autonomous
// container ship. A Military Sealift Command break-bulk freighter of the C4 "Mariner" family (1950s, 171 m x 23 m,
// steam turbine, midships-aft house), called out of the Ready Reserve in 1980 and loaded in a hurry: haze-grey hull
// over a black boot-top, grey house, buff kingposts and cargo booms, the MSC funnel bands (black top, blue and gold
// on grey), five hatches with steel covers, deck cargo lashed down on them (CONEX boxes, crates, pallets of fuel
// drums, two M35A2 trucks, two M151 jeeps), lifeboats in gravity davits, rust weeping from every hawse and scupper.
// The 1980 improvisation: an Army M167 towed Vulcan chained down on the poop deck inside a ring of sandbags, the
// ship's only defence (war.js / defence brain: the 'ciws' mount).
//
// Built at the game's freighter size (the same 80 m x 14 m as the container ship: a Mariner at ~0.47 scale; people,
// vehicles and cargo real size, like on the carriers). x starboard, y up (0 = waterline), z aft, bow at -z.
// Deck contract (war.js deckY via parts.localDeck): main deck y = 4 (DECK) for -31 < z < 33, the forecastle 5.8 forward
// of z = -31, the poop 5.6 aft of z = 33; hatch tops 5.12; the house roofs (see STANDS). dims = { L: 80, W: 14, DECK: 4 }.
import * as THREE from 'three';
import { Kit, T, DEG, rng, hullMat, glowMat, DecalSheet, drawText, drawStreak } from './navkit.js';

export const MSC = { L: 80, W: 14, DECK: 4 };
const { DECK } = MSC;
const FCS = DECK + 1.8, POOP = DECK + 1.6, BW = 1.0;   // forecastle / poop deck heights, bulwark height
const HAZE = 0x7e878f, HAZE_D = 0x6c757d, HAZE_L = 0x8e979e, BUFF = 0xb5a47a, BUFF_D = 0x9a8a62, WHITE = 0xdcdcd4, DECKC = 0x5d625e;
const BLACK = 0x161718, DARK = 0x2b2e32, OD = 0x4b5320, OD_D = 0x3c4219, CANVAS = 0x6b6a48, RUST = 0x7a4426, WOOD = 0x8a6a42;
const GLASS = 0x1c2a33, MSC_BLUE = 0x1f3d7a, GOLD = 0xc99a2a, TYRE = 0x1a1a1a, SAND = 0xa8956a;

// half-width of the hull at the deck edge (a fine entrance forward, a rounded cruiser stern) and at the waterline
export function deckHalf(lz) {
  if (lz < -41.5 || lz > 41) return 0;
  if (lz < -14) { const t = (-14 - lz) / 27.5; return 7 * Math.max(0, 1 - Math.pow(t, 2.2)); }
  if (lz > 28) return 7 * Math.sqrt(Math.max(0, 1 - ((lz - 28) / 13) ** 2));
  return 7;
}
export function waterHalf(lz) {
  if (lz < -38.6 || lz > 38) return 0;
  if (lz < -14) { const t = (-14 - lz) / 24.6; return 6.9 * Math.max(0, 1 - Math.pow(t, 1.7)); }
  if (lz > 24) return 6.9 * Math.sqrt(Math.max(0, 1 - ((lz - 24) / 14) ** 2));
  return 6.9;
}
// the hull surface's half-width at height y (the flare between the waterline and the deck edge)
export function hullX(lz, y) {
  const dh = deckHalf(lz), wl = waterHalf(lz), top = deckY(lz), m = (wl + dh) / 2 + (dh - wl) * 0.3;
  if (y <= 0) return wl;
  if (y < top * 0.5) return wl + (m - wl) * y / (top * 0.5);
  return m + (dh - m) * Math.min(1, (y - top * 0.5) / (top * 0.5));
}
const deckY = lz => lz < -31 ? FCS : lz > 33 ? POOP : DECK;
// hatches: centre z, length (along z), width (across)
const HATCH = [{ z: -25.6, L: 6, W: 6.4 }, { z: -15.2, L: 8, W: 8 }, { z: -4.6, L: 7, W: 8 }, { z: 19.4, L: 7.4, W: 8 }, { z: 28.8, L: 5.6, W: 7 }];
const HTOP = DECK + 1.12;
// the house: [x half-width, z0, z1, y0, y1] tiers (the boat deck, the 02 level, the wheelhouse), roofs you stand on
const HOUSE = [[5.8, 1, 13, DECK, DECK + 2.4], [3.8, 1.6, 12.4, DECK + 2.4, DECK + 4.6], [4.6, 1.8, 6.6, DECK + 4.6, DECK + 6.8]];
export const STANDS = HOUSE.map(([hw, z0, z1, , y1]) => [-hw, hw, z0, z1, y1]);
export function localDeck(lx, lz) {
  let h = -1e9;
  if (Math.abs(lx) < deckHalf(lz) - 0.15) h = deckY(lz);
  for (const H of HATCH) if (Math.abs(lz - H.z) < H.L / 2 + 0.2 && Math.abs(lx) < H.W / 2 + 0.2) h = Math.max(h, HTOP);
  for (const [x0, x1, z0, z1, y] of STANDS) if (lx > x0 && lx < x1 && lz > z0 && lz < z1) h = Math.max(h, y);
  return h;
}

// ------------------------------------------------------------------------------------------------- hull
// the stem rakes forward from the forefoot (z -35 at the keel) to the stem head (z -41.5); the cruiser stern lifts
// out of the water aft of z 32 and closes at z 41
function bottomY(z) {
  if (z < -35) { const a = (-35 - z); return a < 3.6 ? -3.6 + a : Math.min(FCS + BW, (a - 3.6) / 2.9 * (FCS + BW)); }
  if (z > 32) return z < 38 ? -3.6 + (z - 32) / 6 * 3.6 : Math.min(POOP, (z - 38) / 3 * POOP);
  return -3.6;
}
function hull(kit) {
  const zs = [41, 40.4, 39.5, 38.5, 37, 35, 33.05, 32.95, 30, 26, 20, 10, 0, -10, -14, -18, -22, -26, -30.95, -31.05, -33, -35, -36.5, -38, -39.5, -40.6, -41.5];
  const rings = zs.map(z => {
    const dh = Math.max(0.02, deckHalf(z)), wl = waterHalf(z), top = deckY(z), yb = bottomY(z);
    let pts = [[0, -3.6], [Math.max(0, wl - 1.4), -3.6], [Math.max(0, wl - 0.25), -3.1], [wl, -2.0], [wl, 0], [(wl + dh) / 2 + (dh - wl) * 0.3, top * 0.5], [dh, top], [dh, top + BW], [Math.max(0.01, dh - 0.15), top + BW], [Math.max(0.01, dh - 0.15), top]];
    pts = pts.map(([x, y], i) => {
      if (i > 5 || yb <= -3.6) return [x, y];
      if (y < yb) return [0.01, yb];
      return [x * Math.min(1, 0.15 + (y - yb) / 3), y];   // V sections where the forefoot / counter rise
    });
    return pts.map(([x, y]) => [x, y, z]);
  });
  for (const sd of [1, -1]) { let R = rings.map(r => r.map(([x, y, z]) => [x * sd, y, z])); if (sd < 0) R.reverse(); kit.loft(R, HAZE); }
  // decks: forecastle, main deck, poop
  const edge = (z0, z1, st = 0.5) => { const p = []; for (let z = z1; z >= z0 - 1e-6; z -= st) p.push([Math.max(0.02, deckHalf(z) - 0.15), z]); for (let z = z0; z <= z1 + 1e-6; z += st) p.push([-Math.max(0.02, deckHalf(z) - 0.15), z]); return p; };
  kit.floor(edge(-31, 33), DECK + 0.01, DECKC);
  kit.floor(edge(-41.3, -31), FCS + 0.01, DECKC);
  kit.floor(edge(33, 40.8), POOP + 0.01, DECKC);
  // the forecastle and poop breaks (bulkheads with doors), and their rails
  const wf = deckHalf(-31) - 0.15, wp = deckHalf(33) - 0.15;
  kit.box(wf * 2, FCS - DECK, 0.2, HAZE, 0, (FCS + DECK) / 2, -30.9);
  kit.box(wp * 2, POOP - DECK, 0.2, HAZE, 0, (POOP + DECK) / 2, 32.9);
  for (const sd of [-1, 1]) { kit.box(0.9, 1.6, 0.06, DARK, sd * 2.2, DECK + 0.8, -30.78); kit.box(0.9, 1.5, 0.06, DARK, sd * 2.6, DECK + 0.75, 32.78); }
  kit.rail([[-wf, FCS, -30.85], [wf, FCS, -30.85]], 1.0, HAZE_D, 1.2, 0.03);
  kit.rail([[-wp, POOP, 32.85], [wp, POOP, 32.85]], 1.0, HAZE_D, 1.2, 0.03);
  // ladders down from the breaks
  for (const sd of [-1, 1]) { kit.rod([sd * 4.2, FCS, -30.85], [sd * 4.2, DECK, -29.4], 0.04, HAZE_D, 4); kit.rod([sd * 3.5, FCS, -30.85], [sd * 3.5, DECK, -29.4], 0.04, HAZE_D, 4); }
  for (const sd of [-1, 1]) { kit.rod([sd * 4.6, POOP, 32.85], [sd * 4.6, DECK, 31.5], 0.04, HAZE_D, 4); kit.rod([sd * 3.9, POOP, 32.85], [sd * 3.9, DECK, 31.5], 0.04, HAZE_D, 4); }
  // rudder, the bulwark's freeing ports along the main deck, the bulwark cap rail
  kit.box(0.5, 3.4, 2.6, HAZE_D, 0, -1.9, 37.2);
  for (const sd of [-1, 1]) for (let z = -28; z < 31; z += 4.5) kit.box(0.08, 0.28, 0.7, 0x24272a, sd * (deckHalf(z) + 0.01), DECK + 0.2, z);
  return rings;
}

// ------------------------------------------------------------------------------------------------- vehicles + cargo
// M35A2 2.5-ton cargo truck (6.7 x 2.4 m, canvas over the bed), real size, facing -z
function m35(kit, sheet, star, x, y, z, yaw) {
  kit.push(T(x, y, z, 0, yaw, 0));
  kit.box(0.9, 0.35, 6.4, DARK, -0.55, 0.95, 0.2); kit.box(0.9, 0.35, 6.4, DARK, 0.55, 0.95, 0.2);   // frame rails
  kit.box(2.2, 0.9, 1.5, OD, 0, 1.55, -2.55); kit.box(2.0, 0.25, 1.6, OD_D, 0, 2.0, -2.5);   // hood, grille top
  kit.box(1.6, 0.8, 0.12, BLACK, 0, 1.45, -3.33);                                                   // grille
  kit.box(2.3, 0.5, 0.5, OD, 0, 1.0, -3.4);                                                         // bumper
  for (const sd of [-1, 1]) kit.box(0.5, 0.15, 1.6, OD, sd * 1.1, 1.65, -2.5);                      // fenders
  kit.box(2.3, 1.1, 1.3, OD, 0, 1.95, -1.25); kit.box(2.3, 0.8, 1.3, CANVAS, 0, 2.9, -1.25);        // cab, canvas top
  kit.box(2.1, 0.55, 0.06, GLASS, 0, 2.65, -1.92);                                                  // windscreen
  kit.box(2.45, 0.15, 4.1, OD_D, 0, 1.25, 1.35);                                                    // bed floor
  for (const sd of [-1, 1]) kit.box(0.08, 0.6, 4.1, OD, sd * 1.2, 1.6, 1.35);
  kit.box(2.45, 1.35, 4.15, CANVAS, 0, 2.55, 1.35); kit.add(new THREE.CylinderGeometry(1.22, 1.22, 4.15, 8, 1, false, -Math.PI / 2, Math.PI), CANVAS, T(0, 3.2, 1.35, Math.PI / 2, 0, 0, 1, 1, 0.22));
  kit.box(1.8, 1.0, 0.06, 0x585734, 0, 2.6, 3.43);                                                  // rear flap
  for (const [wz, n] of [[-2.5, 1], [0.6, 2], [2.0, 2]]) for (const sd of [-1, 1]) kit.cyl(0.55, 0.55, n === 2 ? 0.6 : 0.4, TYRE, sd * (n === 2 ? 0.92 : 0.98), 0.55, wz, 0, 0, Math.PI / 2, 10);
  kit.box(0.5, 0.5, 0.6, OD_D, 1.05, 1.15, -0.4);                                                   // fuel tank
  sheet.place(star, new THREE.Matrix4().multiplyMatrices(kit.M, T(0, 2.04, -2.5, -Math.PI / 2, 0, 0)), 1.0, 1.0);
  for (const sd of [-1, 1]) sheet.place(star, new THREE.Matrix4().multiplyMatrices(kit.M, T(sd * 1.16, 1.95, -1.25, 0, sd * Math.PI / 2, 0)), 0.7, 0.7);
  // lashing chains to the deck pad eyes
  for (const [cx, cz] of [[-1, -3.2], [1, -3.2], [-1, 3.2], [1, 3.2]]) kit.rod([cx * 1.0, 1.0, cz], [cx * 1.7, 0.02, cz + Math.sign(cz) * 0.8], 0.03, 0x3a3a38, 4);
  kit.pop();
}
// M151A2 jeep (3.4 x 1.6 m), canvas top up, spare wheel on the back
function m151(kit, sheet, star, x, y, z, yaw) {
  kit.push(T(x, y, z, 0, yaw, 0));
  kit.box(1.6, 0.6, 3.3, OD, 0, 0.75, 0); kit.box(1.5, 0.12, 1.2, OD_D, 0, 1.1, -1.05);          // tub, hood
  kit.box(1.4, 0.45, 0.06, GLASS, 0, 1.35, -0.42); kit.box(1.5, 0.06, 0.06, OD, 0, 1.6, -0.42);  // windscreen
  kit.box(1.5, 0.8, 1.6, CANVAS, 0, 1.55, 0.55);                                                   // canvas top
  for (const [wz] of [[-1.05], [1.05]]) for (const sd of [-1, 1]) kit.cyl(0.38, 0.38, 0.28, TYRE, sd * 0.72, 0.38, wz, 0, 0, Math.PI / 2, 10);
  kit.cyl(0.36, 0.36, 0.22, TYRE, 0.35, 0.95, 1.75, Math.PI / 2, 0, 0, 10);
  kit.box(1.5, 0.12, 0.2, BLACK, 0, 0.55, -1.72);
  sheet.place(star, new THREE.Matrix4().multiplyMatrices(kit.M, T(0, 1.17, -1.05, -Math.PI / 2, 0, 0)), 0.6, 0.6);
  for (const [cx, cz] of [[-1, -1.5], [1, -1.5], [-1, 1.5], [1, 1.5]]) kit.rod([cx * 0.7, 0.4, cz], [cx * 1.2, 0.02, cz + Math.sign(cz) * 0.5], 0.025, 0x3a3a38, 4);
  kit.pop();
}
// CONEX container (2.6 x 1.9 x 2.1 m, ribbed steel, Army olive or grey)
function conex(kit, x, y, z, c, yaw = 0) {
  kit.push(T(x, y, z, 0, yaw, 0));
  kit.box(1.9, 2.1, 2.6, c, 0, 1.05, 0);
  for (let i = -1; i <= 1; i++) for (const sd of [-1, 1]) kit.box(0.05, 1.9, 0.12, c, sd * 0.97, 1.05, i * 0.8);
  kit.box(1.7, 1.8, 0.05, c, 0, 1.0, 1.31); kit.rod([-0.3, 0.2, 1.36], [-0.3, 1.9, 1.36], 0.025, DARK, 4); kit.rod([0.3, 0.2, 1.36], [0.3, 1.9, 1.36], 0.025, DARK, 4);
  kit.pop();
}
function crate(kit, x, y, z, w, h, d, yaw = 0) {
  kit.push(T(x, y, z, 0, yaw, 0));
  kit.box(w, h, d, WOOD, 0, h / 2, 0);
  for (const sd of [-1, 1]) { kit.box(w + 0.04, 0.1, 0.1, 0x6e5232, 0, h * 0.5, sd * (d / 2 - 0.02)); kit.box(0.1, h, 0.1, 0x6e5232, sd * (w / 2 - 0.02), h / 2, d / 2 + 0.01); kit.box(0.1, h, 0.1, 0x6e5232, sd * (w / 2 - 0.02), h / 2, -d / 2 - 0.01); }
  kit.pop();
}
// a pallet of 55-gal drums (2 x 2 or 2 x 3), colours mixed: olive (fuel), blue-grey (oil), rust-red (old)
function drums(kit, r, x, y, z, nx = 2, nz = 3) {
  kit.box(nx * 0.62 + 0.1, 0.14, nz * 0.62 + 0.1, WOOD, x, y + 0.07, z);
  const C = [OD, OD, 0x3f5266, 0x7a3b22, OD_D];
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const dx = x + (i - (nx - 1) / 2) * 0.62, dz = z + (k - (nz - 1) / 2) * 0.62;
    kit.cyl(0.29, 0.29, 0.88, C[(r() * C.length) | 0], dx, y + 0.14 + 0.44, dz, 0, 0, 0, 9);
    kit.cyl(0.3, 0.3, 0.04, 0x2e3022, dx, y + 0.14 + 0.3, dz, 0, 0, 0, 9);
  }
}
// a crewman (dungarees, hard hat or helmet), real size, facing -z
function figure(kit, x, y, z, yaw, { shirt = 0x4a6a8e, hat = 0xd8d8d0, helmet = false } = {}) {
  kit.push(T(x, y, z, 0, yaw, 0));
  kit.box(0.14, 0.82, 0.16, 0x2e3a52, -0.1, 0.41, 0); kit.box(0.14, 0.82, 0.16, 0x2e3a52, 0.1, 0.41, 0);
  kit.box(0.44, 0.6, 0.24, shirt, 0, 1.12, 0); kit.box(0.11, 0.55, 0.12, shirt, -0.28, 1.1, 0); kit.box(0.11, 0.55, 0.12, shirt, 0.28, 1.1, 0);
  kit.box(0.2, 0.22, 0.2, 0xc89a78, 0, 1.55, 0);
  if (helmet) kit.add(new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0x4a5030, T(0, 1.62, 0, 0, 0, 0, 1, 0.8, 1.1));
  else kit.add(new THREE.SphereGeometry(0.14, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), hat, T(0, 1.64, 0));
  kit.pop();
}
// a 7 m open lifeboat (white, a grey canvas cover), lofted hull, centred, keel at y 0
function lifeboat(kit, x, y, z) {
  const L = 7, Wd = 1.15, rings = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8 * 2 - 1, zz = t * L / 2, w = Wd * Math.sqrt(Math.max(0.02, 1 - Math.pow(Math.abs(t), 3)));
    rings.push([[0.01, 0, zz], [w * 0.55, 0.2, zz], [w * 0.92, 0.6, zz], [w, 1.0, zz]].map(([a, b, c]) => [a, b, c]));
  }
  kit.push(T(x, y, z));
  for (const sd of [1, -1]) { let R = rings.map(r => r.map(([a, b, c]) => [a * sd, b, c])); if (sd < 0) R.reverse(); kit.loft(R, WHITE); }
  const top = []; for (const r of rings) top.push([r[3][0], r[3][2]]); for (const r of rings.slice().reverse()) top.push([-r[3][0], r[3][2]]);
  kit.floor(top, 1.0, 0x8c9088); kit.box(0.08, 0.35, L * 0.84, 0x8c9088, 0, 1.15, 0);   // the cover and its ridge
  for (const sd of [-1, 1]) kit.box(0.05, 0.12, L * 0.8, 0xd06a20, sd * Wd * 0.99, 0.75, 0);   // orange gunwale band
  kit.pop();
}

// ------------------------------------------------------------------------------------------------- cargo gear
// a kingpost (buff, with a crosstree and the boom heel bracket) and its booms; topped: one boom raised, else stowed
function kingpost(kit, x, z, h) { kit.rod([x, DECK, z], [x, DECK + h, z], 0.24, BUFF, 8); kit.cyl(0.3, 0.3, 0.12, BUFF_D, x, DECK + h + 0.06, z, 0, 0, 0, 8); kit.box(0.6, 0.5, 0.6, BUFF_D, x, DECK + 1.6, z); }
function boom(kit, heel, dirZ, len, elev, yawOff = 0, head = null) {
  const c = Math.cos(elev), s = Math.sin(elev), dx = Math.sin(yawOff) * c * len, dz = dirZ * Math.cos(yawOff) * c * len;
  const tip = [heel[0] + dx, heel[1] + s * len, heel[2] + dz];
  kit.rod(heel, tip, 0.13, BUFF, 6); kit.cyl(0.17, 0.17, 0.3, BUFF_D, tip[0], tip[1], tip[2], 0, 0, 0, 6);
  if (head) kit.rod(tip, head, 0.025, 0x2a2a28, 3);   // topping lift
  kit.rod(tip, [tip[0], Math.max(DECK + 1.6, tip[1] - 3.2), tip[2]], 0.02, 0x2a2a28, 3);   // cargo runner + hook
  kit.box(0.2, 0.3, 0.2, 0x2a2a28, tip[0], Math.max(DECK + 1.45, tip[1] - 3.35), tip[2]);
  return tip;
}

// ------------------------------------------------------------------------------------------------- M167 Vulcan
// Army M167 towed Vulcan (20 mm, 6 barrels, range-only radar dish), chained to the poop deck: the placeholder node
// for war.js / the defence brain (rig like mounts.js: userData.yaw turns, userData.pitch elevates)
function buildM167(team) {
  const g = new THREE.Group(), yaw = new THREE.Group(), pitch = new THREE.Group(); g.add(yaw); yaw.add(pitch);
  g.userData = { yaw, pitch, team };
  const y = new Kit({ wear: 0.04 });
  y.cyl(0.65, 0.7, 0.3, OD, 0, 0.15, 0, 0, 0, 0, 12);                 // turntable
  y.box(0.5, 0.7, 0.6, OD, -0.55, 0.6, 0.25); y.box(0.45, 0.08, 0.5, BLACK, -0.55, 0.98, 0.3);   // gunner's seat
  y.box(0.6, 0.8, 0.9, OD, 0.5, 0.65, 0.1);                           // ammunition drum / feed
  y.rod([0.65, 0.4, -0.2], [0.75, 1.5, -0.2], 0.04, OD_D, 4);
  y.add(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 12), OD_D, T(0.75, 1.6, -0.25, Math.PI / 2, 0, 0));   // ranging radar dish
  y.box(0.25, 0.9, 0.6, OD, -0.15, 0.75, -0.15); y.box(0.25, 0.9, 0.6, OD, 0.2, 0.75, -0.15);           // cradle cheeks
  const ym = y.mesh(); yaw.add(ym);
  pitch.position.set(0.02, 1.0, -0.15);
  const p = new Kit({ wear: 0.03 });
  p.box(0.32, 0.36, 0.9, DARK, 0, 0, 0.1);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; p.rod([Math.cos(a) * 0.08, Math.sin(a) * 0.08, -0.3], [Math.cos(a) * 0.08, Math.sin(a) * 0.08, -1.85], 0.025, 0x222326, 4); }
  p.cyl(0.13, 0.13, 0.08, DARK, 0, 0, -1.2, Math.PI / 2, 0, 0, 8); p.cyl(0.13, 0.13, 0.08, DARK, 0, 0, -1.8, Math.PI / 2, 0, 0, 8);
  p.box(0.12, 0.18, 0.3, BLACK, -0.32, 0.22, 0.05);   // the gyro lead-computing sight
  pitch.add(p.mesh());
  pitch.rotation.x = 12 * DEG;
  return g;
}

// ------------------------------------------------------------------------------------------------- the ship
export function buildMSCFreighter() {
  const g = new THREE.Group(); g.name = 'USNS SGT. MILO K. TRASK';
  const kit = new Kit({ wear: 0.05, seed: 23, grime: (x, y, z, c, r) => {
    if (y < -0.55) c.setHex(0x5a2a22); else if (y < 0.55) c.setHex(0x161616);
    else if (y < 1.6 && Math.abs(x) > 5.5) c.multiplyScalar(0.82 + r() * 0.08);   // waterline scum
    if (y > 0.6 && r() < 0.25) c.multiplyScalar(0.9 + r() * 0.08);
  } });
  const glow = new Kit({ wear: 0 }), sheet = new DecalSheet(1024, 8, 8), r = rng(97);
  hull(kit);
  // ---- hatches: coamings, steel covers (MacGregor panels with ribs and cleats)
  for (const H of HATCH) {
    kit.box(H.W + 0.3, 1.0, H.L + 0.3, HAZE_D, 0, DECK + 0.5, H.z);
    const n = Math.round(H.L / 1.9), pl = H.L / n;
    for (let i = 0; i < n; i++) {
      const zz = H.z - H.L / 2 + pl * (i + 0.5);
      kit.box(H.W, 0.12, pl - 0.06, 0x575d5f, 0, DECK + 1.06, zz);
      kit.box(H.W - 0.4, 0.1, 0.12, 0x4f5456, 0, DECK + 1.15, zz - pl / 2 + 0.2);
    }
    for (const sd of [-1, 1]) for (let zz = H.z - H.L / 2 + 0.8; zz < H.z + H.L / 2; zz += 1.6) kit.box(0.12, 0.2, 0.2, DARK, sd * (H.W / 2 + 0.2), DECK + 0.95, zz);   // cleats
  }
  // ---- deck cargo, lashed down. Hatch 1: CONEX + crates; 2: two M35s; 3: CONEX stack + pallets; 4: jeeps + crates; 5: drums
  const star = sheet.draw(21, 1, 1, (x, w, h) => {
    x.fillStyle = 'rgba(230,230,220,0.92)'; x.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? w * 0.19 : w * 0.46; x.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr); }
    x.closePath(); x.fill(); x.strokeStyle = 'rgba(230,230,220,0.92)'; x.lineWidth = w * 0.04; x.beginPath(); x.arc(w / 2, h / 2, w * 0.47, 0, 6.283); x.stroke();
  });
  {
    const h1 = HATCH[0]; conex(kit, -1.4, HTOP, h1.z - 1.2, OD); conex(kit, 1.4, HTOP, h1.z - 1.2, 0x6c7072); crate(kit, -1.3, HTOP, h1.z + 1.8, 2.2, 1.4, 1.6); crate(kit, 1.5, HTOP, h1.z + 1.6, 1.6, 1.1, 1.8, 0.1); crate(kit, 1.4, HTOP + 1.1, h1.z + 1.6, 1.2, 0.8, 1.2, -0.2);
    const h2 = HATCH[1]; m35(kit, sheet, star, -1.85, HTOP, h2.z + 0.1, 0); m35(kit, sheet, star, 1.85, HTOP, h2.z - 0.2, 0);
    const h3 = HATCH[2];
    for (const [x, zz, c] of [[-2.9, -2.0, OD], [-0.95, -2.0, OD_D], [1.0, -2.0, 0x6c7072], [-2.9, 1.4, 0x6c7072], [-0.95, 1.4, OD]]) conex(kit, x, HTOP, h3.z + zz, c);
    conex(kit, -1.9, HTOP + 2.1, h3.z - 2.0, OD, 0.04); drums(kit, r, 2.6, HTOP, h3.z + 1.6, 2, 3); crate(kit, 1.2, HTOP, h3.z + 2.0, 1.2, 1.0, 1.4);
    const h4 = HATCH[3]; m151(kit, sheet, star, -2.0, HTOP, h4.z - 1.6, 0.05); m151(kit, sheet, star, 0.0, HTOP, h4.z - 1.4, -0.03); crate(kit, 2.5, HTOP, h4.z - 1.5, 2.2, 1.3, 2.4);
    crate(kit, -2.3, HTOP, h4.z + 2.3, 2.6, 1.2, 1.8, 0.05); crate(kit, 0.6, HTOP, h4.z + 2.2, 1.8, 1.6, 2.0); drums(kit, r, 2.8, HTOP, h4.z + 2.0, 2, 2);
    const h5 = HATCH[4]; for (const [x, zz] of [[-2.3, -1.4], [-0.6, -1.4], [1.1, -1.4], [-2.3, 1.0], [-0.6, 1.0]]) drums(kit, r, x, HTOP, h5.z + zz, 2, 2);
    crate(kit, 2.2, HTOP, h5.z + 0.9, 1.6, 1.2, 1.8);
    // cargo nets / tarps thrown over a stack: a tarp over hatch 3's top CONEX
    kit.box(2.1, 0.08, 2.9, 0x55573c, -1.9, HTOP + 4.25, h3.z - 2.0, 0.02, 0.04, 0.03);
  }
  // ---- cargo gear: kingposts, a mast with a crosstree at the house, booms (some stowed, one topped up working)
  {
    const KP = [[-20.4, 10.5], [-9.9, 11.0], [15.8, 10.0], [24.3, 9.4]];
    for (const [z, h] of KP) {
      for (const sd of [-1, 1]) kingpost(kit, sd * 2.9, z, h);
      kit.box(6.4, 0.5, 0.5, BUFF, 0, DECK + h - 0.6, z);   // the crosstree (goal-post)
      kit.box(1.0, 0.8, 1.0, HAZE_D, 0, DECK + 0.4, z);     // winch house between the posts
      for (const sd of [-1, 1]) { kit.box(1.2, 0.8, 0.9, DARK, sd * 1.4, DECK + 0.45, z + 0.9); kit.cyl(0.32, 0.32, 0.9, 0x3a3a3a, sd * 1.4, DECK + 0.95, z + 0.9, 0, 0, Math.PI / 2, 8); }   // cargo winches
      for (const sd of [-1, 1]) kit.rod([sd * 2.9, DECK + h, z], [sd * deckHalf(z) * 0.95, DECK + BW, z + 1.2], 0.025, 0x2a2a28, 3);   // stays
    }
    // stowed booms: lying fore and aft in crutches over the hatches
    const stow = (x, z, dir, len) => { const heel = [x, DECK + 1.6, z], tip = boom(kit, heel, dir, len, 6 * DEG, 0); kit.rod([tip[0], DECK + 1.15, tip[2] - dir * 0.6], [tip[0], tip[1] - 0.1, tip[2] - dir * 0.6], 0.06, BUFF_D, 4); };
    stow(-2.9, -20.4, -1, 7.5); stow(2.9, -20.4, -1, 7.5);
    stow(-2.9, -9.9, 1, 7.6); stow(2.9, -9.9, 1, 7.6);
    stow(-2.9, -9.9, -1, 7.6);
    stow(-2.9, 24.3, -1, 7.2); stow(2.9, 24.3, 1, 6.2); stow(-2.9, 24.3, 1, 6.2);
    // working booms: topped up over the side (the ship was loading when the call came) - a union-purchase pair
    boom(kit, [2.9, DECK + 1.6, -20.4], 1, 9, 38 * DEG, 0.55, [2.9, DECK + 10.5, -20.4]);
    boom(kit, [2.9, DECK + 1.6, -9.9], -1, 9, 42 * DEG, 0.75, [2.9, DECK + 11, -9.9]);
    boom(kit, [-2.9, DECK + 1.6, 15.8], 1, 8.5, 34 * DEG, -0.5, [-2.9, DECK + 10, 15.8]);
    boom(kit, [2.9, DECK + 1.6, 15.8], 1, 8.5, 30 * DEG, 0.2, [2.9, DECK + 10, 15.8]);
    // the foremast at the forecastle break: a pole with a crow's nest and a yard (masthead light, the forward boom pair)
    kit.rod([0, FCS, -32.2], [0, FCS + 12, -32.2], 0.26, BUFF, 8); kit.cyl(0.7, 0.7, 1.0, BUFF_D, 0, FCS + 8.4, -32.2, 0, 0, 0, 10); kit.rail([[-0.7, FCS + 8.9, -32.9], [0.7, FCS + 8.9, -32.9]], 0.5, BUFF_D, 0.7, 0.02);
    kit.rod([-2.2, FCS + 10.6, -32.2], [2.2, FCS + 10.6, -32.2], 0.07, BUFF_D, 4);
    for (const sd of [-1, 1]) kit.rod([0, FCS + 11.5, -32.2], [sd * (deckHalf(-33) - 0.4), FCS + BW, -33.5], 0.025, 0x2a2a28, 3);
    kit.rod([0, FCS + 11.8, -32.2], [0, FCS + BW, -40.6], 0.025, 0x2a2a28, 3);   // forestay to the stem
    stow(-1.3, -32.2 + 0.4, 1, 6.6); stow(1.3, -32.2 + 0.4, 1, 6.6);
    glow.box(0.22, 0.22, 0.22, 0xfff4d8, 0, FCS + 12.2, -32.2);
  }
  // ---- the house: three tiers, wheelhouse with wings, portholes, doors, the funnel, lifeboats in gravity davits
  {
    const [A, B, C] = HOUSE;
    kit.box(A[0] * 2, A[4] - A[3], A[2] - A[1], HAZE_L, 0, (A[3] + A[4]) / 2, (A[1] + A[2]) / 2);
    kit.box(A[0] * 2 + 0.3, 0.15, A[2] - A[1] + 0.3, HAZE_D, 0, A[4], (A[1] + A[2]) / 2);
    kit.box(B[0] * 2, B[4] - B[3], B[2] - B[1], HAZE_L, 0, (B[3] + B[4]) / 2, (B[1] + B[2]) / 2);
    kit.box(B[0] * 2 + 0.3, 0.15, B[2] - B[1] + 0.3, HAZE_D, 0, B[4], (B[1] + B[2]) / 2);
    kit.box(C[0] * 2, C[4] - C[3], C[2] - C[1], HAZE_L, 0, (C[3] + C[4]) / 2, (C[1] + C[2]) / 2);
    kit.box(C[0] * 2 + 0.4, 0.2, C[2] - C[1] + 0.4, HAZE_D, 0, C[4] + 0.05, (C[1] + C[2]) / 2);
    // bridge windows: a band across the front and down the sides, sloped visors over them
    kit.box(C[0] * 2 - 0.4, 0.95, 0.06, GLASS, 0, DECK + 6.0, C[1] - 0.02);
    for (let i = -4; i <= 4; i++) kit.box(0.08, 0.95, 0.08, HAZE_L, i * 0.98, DECK + 6.0, C[1] - 0.04);
    for (const sd of [-1, 1]) kit.box(0.06, 0.95, 3.6, GLASS, sd * (C[0] + 0.01), DECK + 6.0, 4.0);
    kit.box(C[0] * 2 + 0.2, 0.08, 0.7, HAZE_D, 0, DECK + 6.65, C[1] - 0.3, -0.25);
    // bridge wings (open, with dodgers), out to the ship's side
    for (const sd of [-1, 1]) {
      kit.box(2.1, 0.18, 2.6, HAZE_D, sd * (C[0] + 1.05), DECK + 4.6, 2.9);
      kit.box(0.08, 1.05, 2.6, HAZE_L, sd * (C[0] + 2.1), DECK + 5.2, 2.9); kit.box(2.1, 1.05, 0.08, HAZE_L, sd * (C[0] + 1.05), DECK + 5.2, 1.62);
      kit.box(0.3, 0.6, 0.3, HAZE_D, sd * (C[0] + 1.7), DECK + 5.0, 3.6);   // the gyro repeater pelorus
      glow.box(0.25, 0.25, 0.35, sd > 0 ? 0x30ff60 : 0xff3020, sd * (C[0] + 2.18), DECK + 5.45, 3.6);   // sidelights
    }
    // portholes and doors on the two lower tiers, the accommodation ladders up the house front
    for (const sd of [-1, 1]) {
      for (let z = 2.2; z < 12.5; z += 1.5) kit.cyl(0.18, 0.18, 0.06, GLASS, sd * (A[0] + 0.02), DECK + 1.5, z, 0, 0, Math.PI / 2, 8);
      for (let z = 3.0; z < 12; z += 1.6) kit.cyl(0.18, 0.18, 0.06, GLASS, sd * (B[0] + 0.02), DECK + 3.6, z, 0, 0, Math.PI / 2, 8);
      kit.box(0.06, 1.8, 0.85, DARK, sd * (A[0] + 0.02), DECK + 0.95, 11.6);
    }
    for (let x = -4.5; x <= 4.5; x += 1.5) if (Math.abs(x) > 1) kit.cyl(0.2, 0.2, 0.06, GLASS, x, DECK + 1.5, A[1] - 0.02, Math.PI / 2, 0, 0, 8);
    for (let x = -3; x <= 3; x += 1.5) kit.cyl(0.2, 0.2, 0.06, GLASS, x, DECK + 3.6, B[1] - 0.02, Math.PI / 2, 0, 0, 8);
    kit.box(0.9, 1.8, 0.06, DARK, 0, DECK + 0.95, A[1] - 0.02);
    for (const sd of [-1, 1]) { kit.rod([sd * 4.4, DECK, -0.2], [sd * 4.4, DECK + 2.4, 1.0], 0.04, HAZE_D, 4); kit.rod([sd * 3.8, DECK, -0.2], [sd * 3.8, DECK + 2.4, 1.0], 0.04, HAZE_D, 4); }
    kit.rail([[-A[0], A[4], A[1]], [A[0], A[4], A[1]], [A[0], A[4], A[2]], [-A[0], A[4], A[2]], [-A[0], A[4], A[1]]], 1.0, HAZE_D, 1.5, 0.03);
    kit.rail([[-C[0] - 0.1, C[4] + 0.15, C[1] - 0.1], [C[0] + 0.1, C[4] + 0.15, C[1] - 0.1], [C[0] + 0.1, C[4] + 0.15, C[2] + 0.1], [-C[0] - 0.1, C[4] + 0.15, C[2] + 0.1], [-C[0] - 0.1, C[4] + 0.15, C[1] - 0.1]], 0.9, HAZE_D, 1.4, 0.03);
    // flying bridge: magnetic compass binnacle, the radar mast with its yard, the whistle
    kit.cyl(0.25, 0.3, 1.0, HAZE_D, 0, C[4] + 0.6, 3.0, 0, 0, 0, 8); kit.sphere(0.28, 0xb8b8b0, 0, C[4] + 1.2, 3.0, 1, 0.8, 1, 8, 5);
    kit.rod([0, C[4], 5.2], [0, C[4] + 7.0, 5.2], 0.16, HAZE_D, 6); kit.rod([-2.4, C[4] + 5.0, 5.2], [2.4, C[4] + 5.0, 5.2], 0.06, HAZE_D, 4);
    kit.rod([-1.2, C[4], 6.4], [0, C[4] + 4.0, 5.2], 0.07, HAZE_D, 4); kit.rod([1.2, C[4], 6.4], [0, C[4] + 4.0, 5.2], 0.07, HAZE_D, 4);
    kit.box(1.2, 0.15, 1.2, HAZE_D, 0, C[4] + 3.9, 5.2);
    for (const sd of [-1, 1]) kit.box(0.04, 0.04, 0.6, 0x2a2a28, sd * 2.2, C[4] + 4.4, 5.2);   // signal halyards, flag hoist
    glow.box(0.2, 0.2, 0.2, 0xfff4d8, 0, C[4] + 7.15, 5.2);
    // funnel: elliptical, a slight rake, the MSC bands (black top, then blue / gold / blue on the grey), a soot cap
    kit.push(T(0, B[4], 9.4, 4 * DEG));
    const fb = (y0, y1, c, rr = 1) => kit.add(new THREE.CylinderGeometry(1.0 * rr, 1.0 * rr, y1 - y0, 14), c, T(0, (y0 + y1) / 2, 0, 0, 0, 0, 1.25, 1, 1.8));
    fb(0, 2.6, HAZE_L, 1.02); fb(2.6, 3.0, MSC_BLUE, 1.01); fb(3.0, 3.35, GOLD, 1.01); fb(3.35, 3.75, MSC_BLUE, 1.01); fb(3.75, 4.3, HAZE_L, 1.0); fb(4.3, 5.4, BLACK, 0.99);
    kit.cyl(0.35, 0.35, 0.8, 0x1a1a1a, -0.3, 5.6, 0.4, 0, 0, 0, 8); kit.cyl(0.3, 0.3, 0.7, 0x1a1a1a, 0.35, 5.55, -0.2, 0, 0, 0, 8);   // uptakes
    kit.cyl(0.12, 0.12, 1.4, HAZE_D, 0, 5.9, -1.4, 0, 0, 0, 6); kit.cyl(0.2, 0.15, 0.4, 0xb8b8b0, 0, 6.6, -1.4, 0, 0, 0, 6);   // steam whistle
    kit.pop();
    // cowl ventilators round the house (the merchant ship's silhouette)
    const cowl = (x, y, z, yaw, h = 1.6, s = 1) => {
      kit.cyl(0.22 * s, 0.22 * s, h, HAZE_L, x, y + h / 2, z, 0, 0, 0, 8);
      kit.push(T(x, y + h, z, 0, yaw, 0)); kit.add(new THREE.CylinderGeometry(0.42 * s, 0.24 * s, 0.7 * s, 10, 1, true), HAZE_L, T(0, 0.15 * s, -0.25 * s, -Math.PI / 2 + 0.5));
      kit.add(new THREE.CircleGeometry(0.4 * s, 10), BLACK, T(0, 0.3 * s, -0.55 * s, -0.5 + Math.PI, 0, 0)); kit.pop();
    };
    cowl(-2.0, B[4], 12.0, Math.PI, 1.4); cowl(2.0, B[4], 12.0, Math.PI, 1.4); cowl(-4.8, DECK, 13.6, 0, 1.8, 1.2); cowl(4.8, DECK, 13.6, 0, 1.8, 1.2);
    cowl(-1.4, FCS, -34.5, 0, 1.2, 0.8); cowl(1.4, FCS, -34.5, 0, 1.2, 0.8); cowl(-4.0, DECK, -0.6, Math.PI, 1.6); cowl(4.0, DECK, -0.6, Math.PI, 1.6);
    // lifeboats in gravity davits on the boat deck, one each side
    for (const sd of [-1, 1]) {
      lifeboat(kit, sd * 5.55, A[4] + 0.9, 7.6);
      for (const zz of [5.1, 10.1]) {
        kit.box(0.3, 0.3, 1.6, HAZE_D, sd * 4.3, A[4] + 0.15, zz);
        kit.rod([sd * 4.2, A[4] + 0.3, zz], [sd * 4.9, A[4] + 3.0, zz], 0.13, HAZE_D, 5); kit.rod([sd * 4.9, A[4] + 3.0, zz], [sd * 5.7, A[4] + 3.2, zz], 0.11, HAZE_D, 5);
        kit.rod([sd * 5.7, A[4] + 3.2, zz], [sd * 5.6, A[4] + 2.0, zz], 0.025, 0x2a2a28, 3);   // falls
      }
      // inflatable raft canisters on the rail
      for (const zz of [1.8, 2.8]) kit.cyl(0.32, 0.32, 1.0, WHITE, sd * 5.2, A[4] + 0.5, zz, Math.PI / 2, 0, 0, 8);
    }
  }
  // ---- forecastle: windlass, anchors in the hawse pipes, bitts; the poop: mooring winch, bitts, the ensign staff
  {
    kit.box(3.2, 0.7, 1.2, DARK, 0, FCS + 0.35, -36.0);
    for (const sd of [-1, 1]) {
      kit.cyl(0.5, 0.5, 0.5, 0x3a3a3a, sd * 1.1, FCS + 0.75, -36.0, 0, 0, Math.PI / 2, 10);   // wildcats
      kit.rod([sd * 1.1, FCS + 0.3, -36.6], [sd * 2.0, FCS + 0.05, -37.4], 0.1, 0x2a2622, 4);   // chain to the hawse pipe
      kit.cyl(0.32, 0.36, 0.12, BLACK, sd * 2.1, FCS + 0.06, -37.5, 0, 0, 0, 8);
      const zh = -36.6, ya = FCS - 1.5, ang = Math.atan2(hullX(zh - 0.6, ya) - hullX(zh + 0.6, ya), 1.2);   // the anchor, stowed in its hawse
      kit.push(T(sd * hullX(zh, ya), ya, zh, 0, sd * ang, 0));
      kit.cyl(0.36, 0.42, 0.25, BLACK, sd * 0.02, 0.85, 0, 0, 0, Math.PI / 2, 8);
      kit.box(0.22, 1.3, 0.28, 0x232425, sd * 0.14, 0.05, 0); kit.box(0.24, 0.3, 1.5, 0x232425, sd * 0.15, -0.55, 0, 0.0, 0, 0); kit.box(0.2, 0.25, 0.25, 0x232425, sd * 0.16, -0.3, 0.7, 0.6, 0, 0); kit.box(0.2, 0.25, 0.25, 0x232425, sd * 0.16, -0.3, -0.7, -0.6, 0, 0);
      kit.pop();
      for (const zz of [-34, -29.5]) { kit.cyl(0.18, 0.18, 0.6, DARK, sd * 3.0, (zz < -31 ? FCS : DECK) + 0.3, zz, 0, 0, 0, 8); kit.cyl(0.18, 0.18, 0.6, DARK, sd * 3.0, (zz < -31 ? FCS : DECK) + 0.3, zz + 0.6, 0, 0, 0, 8); }
      for (const zz of [35.2, 38.4]) { kit.cyl(0.18, 0.18, 0.6, DARK, sd * 2.6, POOP + 0.3, zz, 0, 0, 0, 8); kit.cyl(0.18, 0.18, 0.6, DARK, sd * 2.6, POOP + 0.3, zz + 0.6, 0, 0, 0, 8); }
    }
    kit.rod([0, FCS + BW, -41.2], [0, FCS + 4.5, -41.1], 0.05, BUFF, 4);   // jackstaff
    kit.box(2.6, 0.8, 1.2, DARK, 0, POOP + 0.4, 34.4); kit.cyl(0.4, 0.4, 2.6, 0x3a3a3a, 0, POOP + 0.9, 34.4, 0, 0, Math.PI / 2, 10);   // mooring winch
    kit.rod([0, POOP + BW, 40.6], [0, POOP + 5, 40.4], 0.05, BUFF, 4);   // ensign staff
    glow.box(0.2, 0.2, 0.2, 0xfff8e8, 0, POOP + 5.1, 40.4);   // stern light
  }
  // ---- the 1980 improvisation: the M167 Vulcan on the poop, a sandbag ring, ammunition boxes, its gun crew
  const VUL = new THREE.Vector3(0, POOP, 37.6);
  {
    kit.box(1.8, 0.35, 3.6, OD, 0, POOP + 0.5, 37.9); kit.box(0.2, 0.2, 2.0, OD_D, 0, POOP + 0.45, 40.3);   // the trailer, its tongue
    for (const sd of [-1, 1]) { kit.cyl(0.45, 0.45, 0.3, TYRE, sd * 1.05, POOP + 0.45, 38.4, 0, 0, Math.PI / 2, 10); kit.rod([sd * 0.8, POOP + 0.4, 37.0], [sd * 2.2, POOP + 0.1, 36.0], 0.07, OD_D, 4); kit.box(0.35, 0.1, 0.35, OD_D, sd * 2.2, POOP + 0.05, 36.0); }   // outriggers down
    for (const [cx, cz] of [[-1, 36.2], [1, 36.2], [-1, 39.6], [1, 39.6]]) kit.rod([cx * 0.85, POOP + 0.5, cz], [cx * 1.9, POOP + 0.02, cz + (cz > 38 ? 0.6 : -0.6)], 0.03, 0x3a3a38, 4);
    for (let i = 0; i < 26; i++) {   // the sandbag ring, two courses, open aft
      const a = -1.25 * Math.PI + i / 25 * 2.5 * Math.PI, rr = 3.0;
      for (let k = 0; k < 2; k++) kit.box(0.75, 0.3, 0.42, SAND, Math.cos(a) * rr, POOP + 0.15 + k * 0.3, 37.6 - Math.sin(a) * rr * 0.9, 0, -a + (k ? 0.12 : 0), 0);
    }
    for (let i = 0; i < 4; i++) kit.box(0.5, 0.35, 0.3, OD, -2.0 + (i % 2) * 0.55, POOP + 0.18 + Math.floor(i / 2) * 0.35, 40.2);
    figure(kit, 1.9, POOP, 39.6, 0.6, { shirt: 0x4b5320, helmet: true }); figure(kit, -1.7, POOP, 39.9, -0.4, { shirt: 0x4b5320, helmet: true });
  }
  // a few of the crew: a mate on the bridge wing, a bosun at the hatch, an AB at the foremast
  figure(kit, 5.8, DECK + 4.69, 3.4, -Math.PI / 2, { shirt: 0x7a8aa0, hat: 0xe0e0d8 });
  figure(kit, 4.6, DECK, -9.0, 2.6, { shirt: 0x4a6a8e, hat: 0xe6c020 });
  figure(kit, -1.6, FCS, -33.4, 0.4, { shirt: 0x5a6a50, hat: 0xe6c020 });
  // ---- markings: hull number (white, shadowed) and name on the bow, name and USNS on the stern, draft marks,
  // rust streaks from hawse pipes, scuppers and the house
  {
    const num = sheet.draw(0, 4, 1, (x, w, h) => drawText(x, w, h, 'T-AK 297', { size: 0.8, shadow: '#151515', stretch: 0.85, family: 'Liberation Sans Narrow, Arial Narrow, Arial, sans-serif' }));
    const nm = sheet.draw(8, 8, 1, (x, w, h) => drawText(x, w, h, 'SGT. MILO K. TRASK', { size: 0.62, color: '#e2e2da', shadow: '#1a1a1a', stretch: 0.9 }));
    const usns = sheet.draw(4, 4, 1, (x, w, h) => drawText(x, w, h, 'USNS', { size: 0.7, color: '#e2e2da', shadow: '#1a1a1a' }));
    const draft = sheet.draw(16, 1, 3, (x, w, h) => { for (let i = 0; i < 4; i++) drawText(x, w, h / 4, ['24', '22', '20', '18'][i], { size: 0.62, color: '#e4e4dc' }) || x.translate(0, h / 4); });
    const sideYaw = (z, sd, y = DECK) => sd * (Math.PI / 2 - Math.atan2(hullX(z - 0.5, y) - hullX(z + 0.5, y), 1));
    for (const sd of [-1, 1]) {
      sheet.place(num, T(sd * (hullX(-33.3, 3.6) + 0.06), 3.6, -33.3, 0, sideYaw(-33.3, sd, 3.6), 0), 4.0, 1.0);
      sheet.place(nm, T(sd * (hullX(-24.5, DECK - 0.9) + 0.04), DECK - 0.9, -24.5, 0, sideYaw(-24.5, sd, DECK - 0.9), 0), 7.6, 0.85);
      sheet.place(draft, T(sd * (hullX(-37.2, 0.9) + 0.06), 0.9, -37.2, 0, sideYaw(-37.2, sd, 0.9), 0), 0.5, 1.8);
      sheet.place(draft, T(sd * (hullX(34.6, 1.2) + 0.06), 1.2, 34.6, 0, sd * Math.PI / 2 + sd * 0.55, 0), 0.5, 1.8);
    }
    sheet.place(nm, T(0, POOP - 1.3, 41.0 - 0.75, -0.2, 0, 0), 5.2, 0.6);
    sheet.place(usns, T(0, POOP - 2.1, 40.3 - 0.75, -0.3, 0, 0), 2.4, 0.6);
    const rs = sheet.draw(17, 1, 3, (x, w, h) => drawStreak(x, w, h, rng(5), { a: 0.75, n: 6 }));
    const rs2 = sheet.draw(18, 1, 3, (x, w, h) => drawStreak(x, w, h, rng(17), { a: 0.6, n: 4, col: [110, 58, 30] }));
    for (const sd of [-1, 1]) {
      sheet.place(rs, T(sd * (hullX(-36.6, FCS - 3.0) + 0.04), FCS - 3.0, -36.6, 0, sideYaw(-36.6, sd, FCS - 3.0), 0), 1.4, 3.2);   // hawse-pipe weep
      for (let z = -27; z < 32; z += 3.2 + r() * 3) { const y = DECK - 0.6 - r() * 0.4; sheet.place(r() < 0.5 ? rs : rs2, T(sd * (hullX(z, y) + 0.04), y, z, 0, sideYaw(z, sd, y), 0), 0.6 + r() * 0.7, 1.8 + r() * 1.6); }
      for (const zz of [3.4, 7.9, 12.0]) sheet.place(rs2, T(sd * (HOUSE[0][0] + 0.03), DECK + 1.2, zz, 0, sd * Math.PI / 2, 0), 0.6, 2.2);
      sheet.place(rs2, T(sd * (HOUSE[1][0] + 0.03), DECK + 3.4, 6.5, 0, sd * Math.PI / 2, 0), 0.6, 2.0);
    }
    // deck: rust patches, the hatch numbers
    const blot = sheet.draw(19, 2, 2, (x, w, h) => { const q = rng(61); for (let i = 0; i < 14; i++) { x.fillStyle = `rgba(${110 + q() * 30 | 0},${55 + q() * 20 | 0},${28},${0.25 + q() * 0.35})`; x.beginPath(); x.ellipse(w * (0.2 + 0.6 * q()), h * (0.2 + 0.6 * q()), w * (0.05 + 0.15 * q()), h * (0.04 + 0.12 * q()), q() * 3, 0, 6.283); x.fill(); } });
    for (const [x, z, s] of [[-4.6, -12, 2.4], [4.8, -1.2, 2.0], [-4.9, 23.5, 2.6], [5.0, 26.6, 1.8], [-3.6, -29.6, 1.6], [3.4, 31.6, 2.2], [0.8, -37.6, 2.0]]) sheet.place(blot, T(x, (z < -31 ? FCS : z > 33 ? POOP : DECK) + 0.03, z, -Math.PI / 2, 0, 0), s, s);
    for (let i = 0; i < HATCH.length; i++) { const hn = sheet.draw([29, 30, 31, 35, 36][i], 1, 1, (x, w, h) => drawText(x, w, h, String(i + 1), { size: 0.8, color: '#e8e8e0' })); sheet.place(hn, T(0, DECK + 0.6, HATCH[i].z - HATCH[i].L / 2 - 0.17, 0, Math.PI, 0), 0.7, 0.7); }
    // the ensign on its staff (stars and stripes, a simple flag)
    const flag = sheet.draw(22, 2, 1, (x, w, h) => { for (let i = 0; i < 13; i++) { x.fillStyle = i % 2 ? '#e8e8e8' : '#b22234'; x.fillRect(0, i * h / 13, w, h / 13 + 1); } x.fillStyle = '#3c3b6e'; x.fillRect(0, 0, w * 0.4, h * 7 / 13); x.fillStyle = '#eee'; for (let i = 0; i < 5; i++) for (let k = 0; k < 6; k++) x.fillRect(w * 0.03 + k * w * 0.06, h * 0.05 + i * h * 0.1, 3, 3); });
    for (const sd of [-1, 1]) sheet.place(flag, T(sd * 0.02, POOP + 4.35, 41.15, 0, sd * Math.PI / 2, 0), 1.8, 0.95, sd < 0);
  }
  // ---- placeholder defence node (the M167), the rotating radar
  const team = new THREE.MeshPhongMaterial({ color: 0x33bbff });
  const gun = buildM167(team); gun.position.set(VUL.x, POOP + 0.7, VUL.z); gun.userData.yaw.rotation.y = Math.PI; g.add(gun);
  const dish = new THREE.Group(); dish.position.set(0, HOUSE[2][4] + 4.0, 5.2); g.add(dish);
  { const k = new Kit({ wear: 0 }); k.box(2.6, 0.22, 0.32, 0x30343a, 0, 0.35, 0); k.box(2.5, 0.06, 0.06, 0x8a9096, 0, 0.35, -0.17); k.cyl(0.14, 0.18, 0.3, HAZE_D, 0, 0.12, 0, 0, 0, 0, 6); dish.add(k.mesh()); }
  const h = kit.mesh(); h.name = 'msc-hull'; g.add(h);
  g.add(new THREE.Mesh(glow.geometry(), glowMat()));
  g.add(sheet.mesh());
  return {
    group: g, guns: [gun], mounts: [{ kind: 'ciws', pos: gun.position.clone(), dir: new THREE.Vector3(0, 0, 1), node: gun, gun: 0 }],
    hull: h, localDeck, deckHalf, waterHalf, motion: 'msc', dims: MSC, fx: { wake: 0.75, smoke: 0.6 },
    funnel: new THREE.Vector3(0, HOUSE[1][4] + 5.9, 9.8), dish,
    bow: new THREE.Vector3(0, 0, -38.6), stern: new THREE.Vector3(0, 0, 38),
    tick(dt) { dish.rotation.y += dt * 2.2; gun.userData.tick?.(dt); },
  };
}
