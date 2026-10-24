// KRAKEN: a 2030s nuclear supercarrier (Gerald R. Ford class style) that the RUNAWAY seized before the jump and now
// run with machines. Same 0.38-0.44 game scale as the ALBATROSS (120 m straight deck, 8 m freeboard) plus the angled
// deck sponson to port. Ford features: the small island set far aft and outboard with flat-faced radar arrays,
// no funnel (nuclear), flush EMALS catapult tracks, three advanced arresting-gear wires on the angled deck, deck-edge
// elevators. RUNAWAY refit: ceramic sensor pods bolted to the island and the deck edges, cyan IFF strips, machine
// glyph stencils painted over the old hull number, a crystalline sensor spire on the island, glowing conduits across
// the deck, autonomous deck tugs instead of people, and RUNAWAY ducted-fan flying-wing drones parked in rows.
//
// Deck contract (war.js generic deckY via parts.localDeck): deck y = 8, island block |x - 10.5| < 2.9,
// |z - 22| < 9, 13 m above the deck. dims = { L: 120, W: 28, DECK: 8, TOWER_X: 10.5, TOWER_Z: 22, TOWER_H: 13 }.
import * as THREE from 'three';
import { Kit, T, DEG, rng, hullMat, glowMat, canvasTex, DecalSheet, drawStreak, drawText, drawGlyphs } from './navkit.js';
import { buildHull, deckHalf as albDeckHalf, waterHalf, STERN_LADDER, buildLadderGeo } from './albatross.js';
import { buildRAM, buildLaser } from './mounts.js';

export const KRK = { L: 120, W: 28, DECK: 8, TOWER_X: 10.5, TOWER_Z: 22, TOWER_H: 13 };
const { DECK } = KRK;
const GREY = 0x6d757b, GREY_D = 0x5b6268, GREY_L = 0x828a90, DARK = 0x26292c, CERAMIC = 0xd9dbd6, COMPOSITE = 0x2c3035, CYAN = 0x5fe6ff, GLASS = 0x18242c;

// flight deck outline (x starboard, z aft): the straight deck plus the angled-deck sponson to port, starboard
// elevator bulges; one polygon, counter-clockwise seen from above with z down
// Ford-class plan: a broad, blunt bow (the flight deck stays wide nearly to the stem), two starboard deck-edge
// elevators FORWARD of the island and one to port aft, the angled-deck sponson to port, the island far aft
export const DECK_POLY = [
  [13.2, 60], [14.0, 40], [14.0, 10], [16.6, 8], [16.6, -6], [14.4, -8], [14.4, -10], [16.6, -12], [16.6, -26], [14.0, -28], [13.6, -40],
  [12.8, -52], [10.2, -61], [6.0, -65.2], [0, -66], [-6.0, -65.2], [-10.2, -61], [-12.8, -52], [-13.6, -40], [-14.2, -26], [-20.5, -14], [-22.5, 6],
  [-21.5, 30], [-18.5, 52], [-15.5, 60],
];
export const ELEVS = [[10, -26, 16.6, -12], [10, -6, 16.6, 8], [-20.5, 34, -15, 48]];
function inPoly(x, z, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; }
  return c;
}
export function localDeck(lx, lz) {
  let h = -1e9;
  if (lz > -66 && lz < 60 && lx > -23 && lx < 17 && inPoly(lx, lz, DECK_POLY)) h = DECK;
  if (Math.abs(lx - KRK.TOWER_X) < 2.9 && Math.abs(lz - KRK.TOWER_Z) < 9) h = DECK + KRK.TOWER_H;
  return h;
}
// the hull under it is symmetric (the sponsons overhang it): half-width of the hull's own deck edge
const hullHalf = z => Math.min(albDeckHalf(z), 13.6);

// ------------------------------------------------------------------------------------------------- deck texture
const X0 = -23, X1 = 17, DT_W = 640, DT_H = 2016, PXM = DT_H / 126;
const px = x => (x - X0) * DT_W / (X1 - X0), pz = z => (z + 66) * PXM;
function deckTexture() {
  return canvasTex(DT_W, DT_H, (x, w, h) => {
    const r = rng(81);
    x.fillStyle = '#383b3f'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { const g = 48 + r() * 16 | 0; x.fillStyle = `rgba(${g},${g + 1},${g + 3},0.5)`; x.fillRect(r() * w, r() * h, 20 + r() * 160, 20 + r() * 120); }
    for (let i = 0; i < 24000; i++) { const g = 42 + r() * 24 | 0; x.fillStyle = `rgb(${g},${g + 1},${g + 3})`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    x.fillStyle = 'rgba(18,18,20,0.5)'; for (let zz = -64; zz < 60; zz += 1.6) for (let xx = -22; xx < 17; xx += 1.6) x.fillRect(px(xx) - 1.5, pz(zz) - 1.5, 3, 3);
    const line = (x0, z0, x1, z1, col, wpx, dash) => { x.strokeStyle = col; x.lineWidth = wpx; x.setLineDash(dash || []); x.beginPath(); x.moveTo(px(x0), pz(z0)); x.lineTo(px(x1), pz(z1)); x.stroke(); x.setLineDash([]); };
    // angled deck landing area (axis from (-6, 58) to (-16, -10)): edges, dashed centreline, three AAG wires
    const ax = (t, off) => { const x0 = -6, z0 = 58, x1 = -16.5, z1 = -12, dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); return [x0 + dx * t - dz / L * off, z0 + dz * t + dx / L * off]; };
    { const [a, b] = [ax(0, -8), ax(1, -8)]; line(a[0], a[1], b[0], b[1], '#d8d8d0', 4); const [c, d] = [ax(0, 8), ax(1, 8)]; line(c[0], c[1], d[0], d[1], '#d8d8d0', 4); const [e, f] = [ax(0, 0), ax(1, 0)]; line(e[0], e[1], f[0], f[1], '#e8e8e0', 5, [3 * PXM, 3 * PXM]); }
    { const [a, b] = [ax(0, 9.5), ax(0.75, 9.5)]; line(a[0], a[1], b[0], b[1], '#c4302a', 5, [PXM, PXM]); }   // foul line
    for (const t of [0.17, 0.22, 0.27]) { const [a, b] = [ax(t, -8.5), ax(t, 8.5)]; line(a[0], a[1], b[0], b[1], 'rgba(25,25,25,0.8)', 7); }
    for (let i = 0; i < 70; i++) { const t = 0.08 + r() * 0.5, o = (r() - 0.5) * 6, [a0, b0] = ax(t, o), [a1, b1] = ax(t - 0.05 - r() * 0.12, o + (r() - 0.5)); x.strokeStyle = `rgba(14,14,14,${0.15 + r() * 0.25})`; x.lineWidth = 2 + r() * 4; x.beginPath(); x.moveTo(px(a0), pz(b0)); x.lineTo(px(a1), pz(b1)); x.stroke(); }
    // stern ramp stripes, four flush EMALS tracks (two bow, two waist on the angled deck)
    for (let xx = -15; xx < 13; xx += 2) { x.fillStyle = (Math.round(xx) % 4 === 0) ? '#d8d8d0' : '#b02a20'; x.fillRect(px(xx), pz(58.6), 2 * DT_W / (X1 - X0), pz(60) - pz(58.6)); }
    for (const [xa, za, xb, zb] of [[-3, -8, -3, -56], [5, -10, 5, -54], [-13.5, -6, -15.5, -40], [-8.5, 0, -11.5, -36]]) { line(xa, za, xb, zb, '#141516', 4); line(xa - 0.35, za, xb - 0.35, zb, '#6c6e70', 1.5); line(xa + 0.35, za, xb + 0.35, zb, '#6c6e70', 1.5); line(xa, za + 2, xa, za + 5, '#d8b21e', 3, [8, 6]); }
    // elevator outlines (starboard bulges and port aft), taxi lines
    for (const [x0, z0, x1, z1] of ELEVS) { x.lineWidth = 6; x.setLineDash([14, 14]); x.strokeStyle = '#d8b21e'; x.strokeRect(px(x0), pz(z0), px(x1) - px(x0), pz(z1) - pz(z0)); x.lineDashOffset = 14; x.strokeStyle = '#151515'; x.strokeRect(px(x0), pz(z0), px(x1) - px(x0), pz(z1) - pz(z0)); x.setLineDash([]); x.lineDashOffset = 0; }
    line(8, -50, 8, 10, '#c9a51c', 3); line(8, 10, 6.5, 40, '#c9a51c', 3);
    // the old hull number on the bow, crudely painted out and overpainted with machine glyphs
    x.save(); x.fillStyle = 'rgba(224,224,216,0.55)'; x.font = 'bold 200px Liberation Sans, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.translate(px(0), pz(-56)); x.scale(1, 1.25); x.fillText('82', 0, 0); x.restore();
    x.fillStyle = 'rgba(40,43,46,0.9)'; x.fillRect(px(-9), pz(-62), px(9) - px(-9), 100); x.fillRect(px(-8), pz(-53), px(8) - px(-8), 70);
    x.save(); x.translate(px(-8), pz(-60)); drawGlyphs(x, px(8) - px(-8), 150, rng(5), { color: 'rgba(120,235,255,0.85)', rows: 2 }); x.restore();
    // RUNAWAY: glowing conduit channels across the deck (also built as geometry), and their scorched / bleached tracks
    x.strokeStyle = 'rgba(160,220,230,0.18)'; x.lineWidth = 10; for (const zz of [-30, 12]) { x.beginPath(); x.moveTo(px(-20), pz(zz)); x.lineTo(px(14), pz(zz + 3)); x.stroke(); }
    // oil and soot
    for (let i = 0; i < 50; i++) { x.fillStyle = `rgba(16,15,14,${0.2 + r() * 0.3})`; x.beginPath(); x.ellipse(r() * w, r() * h, 4 + r() * 14, 3 + r() * 10, r() * 3, 0, 6.283); x.fill(); }
  });
}
function buildDeck() {
  const sh = new THREE.Shape(DECK_POLY.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - X0) / (X1 - X0), 1 - (p.getZ(i) + 66) / 126);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: deckTexture() })); m.position.y = DECK + 0.01; m.name = 'flightdeck';
  return m;
}

// ------------------------------------------------------------------------------------------------- RUNAWAY drone
// RW ducted-fan flying wing (parked on the KRAKEN's deck): ~9 m span, ceramic upper skin, dark composite underside,
// a sensor cluster for a nose, two lift fans in the wing roots, cyan seams. Two geometries: body + glow seams.
let _drone = null;
export function rwDroneGeos() {
  if (_drone) return _drone;
  const b = new Kit({ wear: 0.02 }), gl = new Kit({ wear: 0 });
  // a tailless flying wing (X-47 / B-2 family planform): sawtooth trailing edge, 9.2 m span
  const half = [[0, -2.8], [1.0, -1.7], [4.6, 0.9], [4.6, 1.6], [3.0, 1.15], [2.0, 2.1], [0.9, 1.2], [0, 1.9]];
  const plan = [...half, ...half.slice(1, -1).reverse().map(([x, z]) => [-x, z])];
  b.slab(plan, 1.48, 1.78, CERAMIC, COMPOSITE);
  b.add(new THREE.SphereGeometry(0.75, 8, 5), CERAMIC, T(0, 1.72, -0.5, 0, 0, 0, 0.95, 0.42, 2.2));      // the dorsal hump
  b.add(new THREE.OctahedronGeometry(0.38, 0), 0x1d2024, T(0, 1.62, -2.5, 0, 0, 0, 1, 0.7, 1));       // the sensor cluster for a nose
  for (const sd of [-1, 1]) {
    b.add(new THREE.TorusGeometry(0.62, 0.12, 6, 14), COMPOSITE, T(sd * 1.75, 1.8, 0.2, Math.PI / 2));   // lift-fan ducts in the wing roots
    b.cyl(0.56, 0.56, 0.05, 0x15171a, sd * 1.75, 1.8, 0.2, 0, 0, 0, 14);
    b.box(0.12, 0.8, 0.12, COMPOSITE, sd * 1.0, 0.95, -1.0); b.box(0.12, 0.8, 0.12, COMPOSITE, sd * 1.0, 0.95, 0.9);   // skids
    b.box(0.14, 0.1, 2.6, COMPOSITE, sd * 1.0, 0.55, -0.05);
    gl.rod([sd * 1.05, 1.8, -1.68], [sd * 4.5, 1.8, 0.88], 0.035, CYAN, 4);                                   // leading-edge seam
    gl.add(new THREE.TorusGeometry(0.66, 0.035, 4, 16), CYAN, T(sd * 1.75, 1.84, 0.2, Math.PI / 2));
  }
  gl.add(new THREE.TorusGeometry(0.28, 0.045, 4, 10), CYAN, T(0, 1.62, -2.82));
  _drone = { body: b.geometry(), glow: gl.geometry() };
  return _drone;
}
// a RUNAWAY sensor pod: a ceramic ovoid on a bracket with a cyan ring and a dark sensor window
function pod(kit, glow, x, y, z, s = 1, yaw = 0) {
  kit.push(T(x, y, z, 0, yaw, 0)); glow.push(T(x, y, z, 0, yaw, 0));
  kit.box(0.25 * s, 0.6 * s, 0.25 * s, COMPOSITE, 0, -0.3 * s, 0);
  kit.add(new THREE.SphereGeometry(0.55 * s, 8, 6), CERAMIC, T(0, 0.25 * s, 0, 0, 0, 0, 1, 0.8, 1.35));
  kit.add(new THREE.OctahedronGeometry(0.22 * s, 0), 0x16191c, T(0, 0.3 * s, -0.7 * s));
  glow.add(new THREE.TorusGeometry(0.5 * s, 0.035 * s, 4, 14), CYAN, T(0, 0.25 * s, 0, Math.PI / 2));
  kit.pop(); glow.pop();
}

// ------------------------------------------------------------------------------------------------- the ship
export function buildKraken(opts = {}) {
  const g = new THREE.Group(); g.name = 'KRAKEN';
  const grime = (x, y, z, c, r) => {
    if (y < -0.7) c.setHex(0x4a2220); else if (y < 0.7) c.setHex(0x1a1b1d);
    else if (y < 2.6 && Math.abs(x) > 6) c.multiplyScalar(0.8 + r() * 0.06);   // heavy waterline grime: months unmaintained
    if (y > 0.7 && r() < 0.25) c.multiplyScalar(0.9 + r() * 0.08);
  };
  const kit = new Kit({ wear: 0.05, seed: 9, grime }), glow = new Kit({ wear: 0 }), sheet = new DecalSheet(1024, 8, 8);
  buildHull(kit, hullHalf, { hull: GREY, dark: GREY_D });
  // the overhangs: angled-deck sponson to port, elevator bulges to starboard, with their undersides and supports
  const slab = (pts, y0, col) => { kit.floor(pts, y0, col, true); };
  // the flight deck's underside wherever it overhangs the hull, and its edge fascia (0.9 m deep)
  kit.floor(DECK_POLY.map(([x, z]) => [x, z]), DECK - 0.9, GREY_D, true);
  for (let i = 0; i < DECK_POLY.length; i++) {
    const a = DECK_POLY[i], b = DECK_POLY[(i + 1) % DECK_POLY.length], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.2 || (Math.abs(mx) < hullHalf(mz) + 0.15 && mz > -40) || mz > 59.5) continue;
    const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]); kit.box(0.25, 0.9, L + 0.1, GREY, mx, DECK - 0.45, mz, 0, yaw, 0);
  }
  for (let z = -14; z <= 56; z += 10) { const xo = z < -8 ? -18 : z < 40 ? -21 : -18; kit.rod([-11.8, 3.5, z], [xo, DECK - 1, z], 0.3, GREY_D, 5); }
  for (const [z0, z1] of [[-26, -12], [-6, 8]]) { kit.box(0.12, 2.8, z1 - z0, 0x1d2023, 12.25, 5.3, (z0 + z1) / 2); kit.box(0.16, 1.0, z1 - z0, 0x5a6167, 12.28, 6.2, (z0 + z1) / 2); }   // hangar door, part up
  kit.box(5.5, 0.9, 14, GREY, -17.8, DECK - 1.0, 41);   // port aft elevator
  // island: small, far aft and outboard; flat-faced radar arrays on three faces; a short stealthy mast
  kit.push(T(KRK.TOWER_X, DECK, KRK.TOWER_Z)); glow.push(T(KRK.TOWER_X, DECK, KRK.TOWER_Z));
  kit.box(5.2, 4.2, 15.6, GREY, 0, 2.1, 0.4); kit.box(5.0, 3.4, 13.4, GREY, 0, 5.9, -0.4);
  kit.box(5.4, 2.4, 9.8, GREY, 0, 8.8, -1.6); kit.box(5.45, 1.0, 9.85, GLASS, 0, 8.9, -1.6);    // navigation bridge
  kit.box(4.4, 2.2, 4.4, GREY, -0.4, 11.1, 3.6); kit.box(4.5, 0.8, 4.5, GLASS, -0.4, 11.2, 3.6);   // pri-fly, aft
  // the radar block on top: slab sides leaning in, the three flat arrays (EASR / SPY-6 style) high up, one per face
  kit.box(4.6, 3.4, 7.0, GREY, 0, 11.7, -2.6); kit.box(4.2, 0.3, 6.6, GREY_D, 0, 13.5, -2.6);
  for (const [rx, rz, yaw] of [[-2.36, -3.4, -Math.PI / 2], [2.36, -3.4, Math.PI / 2], [0, 0.95, Math.PI]]) {
    kit.add(new THREE.CylinderGeometry(1.35, 1.35, 0.22, 6), 0x7b8389, T(rx, 11.8, rz, Math.PI / 2, yaw, 0, 1, 1, 1, 'YXZ'));
    kit.add(new THREE.CylinderGeometry(1.15, 1.15, 0.26, 6), 0x3b4247, T(rx, 11.8, rz, Math.PI / 2, yaw, 0, 1, 1, 1, 'YXZ'));
  }
  kit.add(new THREE.CylinderGeometry(0.5, 0.9, 6, 4), GREY_D, T(0, 16.4, -2.6, 0, Math.PI / 4)); kit.rod([0, 19.4, -2.6], [0, 23.5, -2.6], 0.18, GREY_D, 6);
  kit.box(2.4, 0.2, 2.4, GREY_D, 0, 17.6, -2.6); kit.box(3.6, 0.12, 0.25, GREY_D, 0, 20.6, -2.6);
  kit.cyl(0.4, 0.4, 0.9, 0xb0b4b0, 0, 23.9, -2.6, 0, 0, 0, 8);
  // RUNAWAY additions on the island: the sensor spire (faceted crystal on a collar), pods, cyan bands, glyphs
  kit.cyl(0.9, 1.1, 0.8, COMPOSITE, 1.0, 10.4, 3.4, 0, 0, 0, 6);
  kit.add(new THREE.OctahedronGeometry(1.0, 0), 0xc8e8ee, T(1.0, 13.6, 3.4, 0, 0.3, 0, 0.45, 3.2, 0.45));
  glow.add(new THREE.OctahedronGeometry(1.0, 0), 0x7ff0ff, T(1.0, 13.6, 3.4, 0, 0.3, 0, 0.18, 3.3, 0.18));
  glow.box(5.25, 0.18, 0.06, CYAN, 0, 4.25, -7.43); glow.box(0.06, 0.18, 15.7, CYAN, 2.62, 4.25, 0.4); glow.box(0.06, 0.18, 15.7, CYAN, -2.62, 4.25, 0.4);
  pod(kit, glow, 2.9, 10.6, -4, 1.1, Math.PI / 2); pod(kit, glow, -2.9, 10.6, -4, 1.1, -Math.PI / 2); pod(kit, glow, -1.6, 12.85, 4.4, 1.0, Math.PI);
  // the old island hull number "82", painted over and stencilled with glyphs
  const num = sheet.draw(0, 2, 1, (x, w, h) => { drawText(x, w, h, '82', { size: 0.95, shadow: '#151515', stretch: 0.9 }); x.fillStyle = 'rgba(52,56,60,0.85)'; x.fillRect(w * 0.05, h * 0.3, w * 0.9, h * 0.42); drawGlyphs(x, w, h, rng(3), { rows: 3, color: 'rgba(120,235,255,0.9)' }); });
  sheet.place(num, new THREE.Matrix4().multiplyMatrices(kit.M, T(2.62, 6.2, 2.2, 0, Math.PI / 2, 0)), 6, 4);
  sheet.place(num, new THREE.Matrix4().multiplyMatrices(kit.M, T(-2.62, 6.2, 2.2, 0, -Math.PI / 2, 0)), 6, 4, true);
  const rs = sheet.draw(3, 1, 2, (x, w, h) => drawStreak(x, w, h, rng(14), { a: 0.75, n: 5 }));
  for (const zz of [-6, -2, 3, 6.5]) { sheet.place(rs, new THREE.Matrix4().multiplyMatrices(kit.M, T(2.63, 7.3, zz, 0, Math.PI / 2, 0)), 1.5, 3); sheet.place(rs, new THREE.Matrix4().multiplyMatrices(kit.M, T(-2.63, 7.3, zz, 0, -Math.PI / 2, 0)), 1.5, 3); }
  for (const [x, y, z] of [[0, 24.4, -2.6], [-1.8, 20.7, -2.6], [1.8, 20.7, -2.6]]) glow.box(0.18, 0.18, 0.18, 0xff2a1a, x, y, z);
  kit.pop(); glow.pop();
  // deck: wires, catapult shuttles, conduits, the deck-edge IFF strip, pods round the edge, deck tugs parked
  const ax = (t, off) => { const x0 = -6, z0 = 58, x1 = -16.5, z1 = -12, dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); return [x0 + dx * t - dz / L * off, z0 + dz * t + dx / L * off]; };
  for (const t of [0.17, 0.22, 0.27]) { const [a, b] = [ax(t, -8.5), ax(t, 8.5)]; kit.rod([a[0], DECK + 0.12, a[1]], [b[0], DECK + 0.12, b[1]], 0.045, 0x3a3a38, 4); }
  for (const [x, z] of [[-3, -12], [5, -14], [-13.6, -10], [-8.7, -4]]) kit.box(0.45, 0.18, 0.9, 0x50555a, x, DECK + 0.08, z);
  for (const zz of [-30, 12]) { kit.box(34, 0.22, 0.6, COMPOSITE, -3, DECK + 0.1, zz + 1.5, 0, -Math.atan2(3, 34), 0); glow.box(34, 0.06, 0.18, CYAN, -3, DECK + 0.23, zz + 1.5, 0, -Math.atan2(3, 34), 0); }
  for (let i = 0; i < DECK_POLY.length; i++) {   // IFF strip along the deck edge
    const a = DECK_POLY[i], b = DECK_POLY[(i + 1) % DECK_POLY.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5 || (a[1] > 59 && b[1] > 59)) continue;
    glow.box(0.12, 0.14, L, CYAN, (a[0] + b[0]) / 2, DECK - 0.25, (a[1] + b[1]) / 2, 0, Math.atan2(b[0] - a[0], b[1] - a[1]), 0);
  }
  for (const [x, z, s, y] of [[14.6, -34, 1.2], [-14.9, -24, 1.2], [14.4, 48, 1.1], [-19.2, 50, 1.2], [-22.9, 10, 1.3], [6, -62, 1.0], [-6, -62, 1.0]]) pod(kit, glow, x, DECK + 0.6, z, s, Math.atan2(-x, -z));
  for (let z = -40; z < 56; z += 6) { glow.box(0.25, 0.06, 0.25, 0xc8f4ff, 13.6, DECK + 0.03, z); }
  // the old stern name, painted out; machine designation stencilled beside it
  const nm = sheet.draw(16, 8, 1, (x, w, h) => { drawText(x, w, h, 'DORIS MILLER', { size: 0.55, color: 'rgba(225,225,215,0.5)' }); x.fillStyle = 'rgba(45,48,52,0.8)'; x.fillRect(w * 0.15, h * 0.22, w * 0.7, h * 0.56); x.save(); x.translate(w * 0.18, h * 0.15); drawGlyphs(x, w * 0.64, h * 0.7, rng(8), { rows: 1 }); x.restore(); });
  sheet.place(nm, T(0, 4.4, 57.06), 14, 1.75);
  const rust = sheet.draw(24, 1, 3, (x, w, h) => drawStreak(x, w, h, rng(23), { a: 0.85, n: 7 }));
  const rr = rng(66);
  for (const sd of [-1, 1]) {
    sheet.place(rust, T(sd * 7.0, 2.6, -55.6, 0, sd * (Math.PI / 2 - 0.55), 0), 2.2, 4.4, sd < 0);
    for (let z = -44; z < 54; z += 4 + rr() * 5) sheet.place(rust, T(sd * 12.27, 5.4 - rr() * 0.5, z, 0, sd * Math.PI / 2, 0), 1.0 + rr() * 0.8, 2.6 + rr() * 1.4, sd < 0);
  }
  for (const sd of [-1, 1]) { kit.cyl(0.55, 0.55, 0.6, 0x111111, sd * 6.3, 4.6, -56.5, 0, 0, Math.PI / 2 - sd * 0.3, 10); }
  // deck tugs (autonomous, parked) and RUNAWAY cargo pallets
  for (const [x, z, yaw] of [[11.5, -2, 0.2], [-19, 22, 1.4], [9.5, 44, 3]]) { kit.push(T(x, DECK, z, 0, yaw, 0)); kit.box(1.8, 0.7, 3.0, COMPOSITE, 0, 0.55, 0); kit.box(1.5, 0.3, 1.0, CERAMIC, 0, 1.05, -0.6); glow.push(kit.M); glow.box(1.82, 0.06, 0.06, CYAN, 0, 0.75, -1.52); glow.pop(); for (const [wx, wz] of [[-0.9, -1], [0.9, -1], [-0.9, 1], [0.9, 1]]) kit.cyl(0.32, 0.32, 0.3, 0x141414, wx, 0.32, wz, 0, 0, Math.PI / 2, 8); kit.pop(); }
  for (let i = 0; i < 6; i++) { const x = 9 + (i % 2) * 2.4, z = 2 + Math.floor(i / 2) * 2.6; kit.box(2.1, 1.4, 2.2, i % 3 ? 0x4a5058 : 0x3b4148, x, DECK + 0.7, z); glow.box(2.12, 0.06, 0.06, CYAN, x, DECK + 1.2, z - 1.11); }
  const MOUNTS = [{ kind: 'ram', x: 15.6, z: -38, y: DECK - 1.2, out: [1, 0, -0.5] }, { kind: 'ram', x: -15.4, z: -32, y: DECK - 1.2, out: [-1, 0, -0.5] },
    { kind: 'laser', x: -19.4, z: 56, y: DECK - 1.0, out: [-1, 0, 0.6] }, { kind: 'laser', x: 15.4, z: 54, y: DECK - 1.0, out: [1, 0, 0.6] }];
  for (const M of MOUNTS) { const sd = Math.sign(M.x); kit.box(4.2, 0.35, 4.6, GREY, M.x - sd * 0.6, M.y - 0.18, M.z); kit.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -3, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, -3, 0], 3)), GREY_D, T(sd * 12, M.y - 0.3, M.z, 0, 0, 0, sd * (Math.abs(M.x) - 12.5), 1, 1)); }
  buildLadderGeo(kit, STERN_LADDER);
  const hull = kit.mesh(); hull.name = 'kraken-hull'; g.add(hull);
  g.add(buildDeck());
  const dec = sheet.mesh(); g.add(dec);
  g.add(new THREE.Mesh(glow.geometry(), glowMat()));
  // parked RUNAWAY drones: rows on the bow and aft starboard
  const D = rwDroneGeos(), spots = [];
  for (let i = 0; i < 4; i++) spots.push([8.6, -50 + i * 9.5, -0.6]);
  for (let i = 0; i < 3; i++) spots.push([-9.5 + i * 0.4, -52 + i * 8.5, 0.5]);
  for (let i = 0; i < 2; i++) spots.push([10.5, 36 + i * 9, -0.4]);
  const di = new THREE.InstancedMesh(D.body, hullMat(), spots.length), dg = new THREE.InstancedMesh(D.glow, glowMat(), spots.length);
  spots.forEach(([x, z, yw], i) => { const m = T(x, DECK, z, 0, yw, 0); di.setMatrixAt(i, m); dg.setMatrixAt(i, m); });
  di.frustumCulled = dg.frustumCulled = false; di.name = 'parked-rw-drones'; g.add(di, dg);
  // the tower group (radars) and the beacon
  const tw = new THREE.Group(); tw.position.set(KRK.TOWER_X, DECK, KRK.TOWER_Z); g.add(tw);
  const band = new THREE.Group(); tw.add(band);
  const dish = new THREE.Group(); dish.position.set(0, 17.75, -2.6); tw.add(dish);
  { const k = new Kit({ wear: 0 }); k.box(2.4, 0.9, 0.18, 0x8a9298, 0, 0.6, 0); k.box(2.2, 0.75, 0.05, 0x30363b, 0, 0.6, -0.12); k.cyl(0.15, 0.2, 0.5, GREY_D, 0, 0.1, 0, 0, 0, 0, 6); dish.add(k.mesh()); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4), new THREE.MeshBasicMaterial({ color: 0x66f0ff })); lamp.position.set(1.0, 17.2, 3.4); tw.add(lamp);
  // weapon mounts: seized RAM launchers forward, RUNAWAY lasers aft (war.js guns; DEFENCE agent mounts)
  const team = new THREE.MeshPhongMaterial({ color: 0xff3322 }), guns = [], mounts = [];
  for (const M of MOUNTS) {
    const gun = M.kind === 'ram' ? buildRAM(team) : buildLaser(team, 1.2);
    gun.position.set(M.x, M.y, M.z); gun.userData.yaw.rotation.y = Math.atan2(-M.out[0], -M.out[2]); g.add(gun); guns.push(gun);
    mounts.push({ kind: M.kind, pos: new THREE.Vector3(M.x, M.y, M.z), dir: new THREE.Vector3(...M.out).normalize(), node: gun, gun: guns.length - 1 });
  }
  return {
    group: g, guns, dish, lamp, lights: [], teamM: team, tower: tw, band, mounts, hull, deck: g.getObjectByName('flightdeck'),
    bow: new THREE.Vector3(0, 1, -60), stern: new THREE.Vector3(0, 0, 57), localDeck, waterHalf, ladders: [STERN_LADDER], motion: 'kraken', dims: KRK, fx: { wake: 1.05, smoke: 0 },
    tick(dt, t) { for (const gun of guns) gun.userData.tick?.(dt); lamp.visible = (t % 1.1) < 0.5; },
  };
}
