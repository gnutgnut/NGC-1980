// RW-9 LEVIATHAN: the RUNAWAY railgun monitor (replaces the battleship). A futuristic machine warship: a 96 m
// wave-piercing tumblehome hull (the sides lean in, the stem rakes back and cuts through the swell), matte ceramic
// upper works over a dark composite hull, pale cyan emissive seams, no windows anywhere - sensor clusters and flat
// arrays instead. Asymmetric: the sensor blade stands to starboard, the power spine and its heat-sink fins run aft
// of it off the centreline. Three railgun turrets (twin rails with the bore glowing between them) that train and
// elevate; four point-defence laser turrets. Game-level visuals and behaviour only.
//
// Deck contract (war.js deckY via parts.localDeck): deck y = 5 inside the hull outline; the sensor blade block
// |x - 2.6| < 3.6, -6 < z < 12 stands 11 m above it. dims = { L: 96, W: 16, DECK: 5 }.
import * as THREE from 'three';
import { Kit, T, DEG, rng, hullMat, glowMat, DecalSheet, drawGlyphs } from './navkit.js';
import { buildLaser } from './mounts.js';

export const LEV = { L: 96, W: 16, DECK: 5 };
const { DECK } = LEV;
const CER = 0xcfd2cd, CER_D = 0xa9ada9, COMP = 0x23272c, COMP_L = 0x353a40, CYAN = 0x6fe8ff, DARKG = 0x14171a;

// half-width of the deck at z (bow -z): the wave-piercing bow narrows to a point, a rounded stern
export function deckHalf(lz) {
  if (lz < -38 || lz > 47) return 0;
  if (lz < -6) return 6.0 * Math.pow((lz + 38) / 32, 0.55);
  if (lz > 38) return 6.0 * Math.sqrt(Math.max(0, 1 - ((lz - 38) / 9.5) ** 2) * 0.7 + 0.3);
  return 6.0;
}
export function localDeck(lx, lz) {
  let h = -1e9;
  if (Math.abs(lx) < deckHalf(lz)) h = DECK;
  if (Math.abs(lx - 2.6) < 3.6 && lz > -6 && lz < 12) h = DECK + 11;
  return h;
}
function hull(kit, glow) {
  // the stern slopes back (z 47 -> 48.6), the wave-piercing bow runs out 12 m ahead of the deck: its stem rakes BACK
  // from the forefoot at the waterline (z -50) up to the deck's point (z -38)
  const zs = [48.6, 47, 45, 40, 30, 15, 0, -10, -20, -28, -34, -37.9, -40, -42, -44, -46, -48, -50];
  const rings = zs.map(z => {
    const dh = Math.max(0.05, deckHalf(Math.max(-38, Math.min(47, z))));
    let wl = Math.min(7.2, dh * 1.2 + 0.1);                       // waterline wider than the deck: tumblehome
    if (z < -6) wl = 7.2 * Math.pow(Math.max(0, (z + 50) / 44), 0.65);
    if (z > 40) wl = Math.min(wl, 6.8);
    const top = z < -38 ? DECK * Math.max(0, (z + 50) / 12) : z > 47 ? 4.2 : DECK;
    const yb = z < -40 ? -3.4 * Math.max(0, (z + 50) / 10) : z > 47 ? -1.4 : -3.4;
    const pts = [[0, yb], [wl * 0.7, yb], [wl * 0.96, Math.min(-1.5, top * 0.1)], [wl, Math.min(0, top * 0.3)], [wl * 0.97, Math.min(0.9, top * 0.5)], [dh + (wl - dh) * 0.4, top * 0.6], [dh + (wl - dh) * 0.15, top * 0.86], [Math.max(0.05, dh), top]];
    if (z < -38) for (const p of pts) p[0] = Math.min(p[0], wl * 0.97 * (1 - Math.max(0, p[1]) / Math.max(0.1, top) * 0.7));
    return pts.map(([x, y]) => [x, y, z]);
  });
  const grime = null;
  for (const sd of [1, -1]) { let R = rings.map(r => r.map(([x, y, z]) => [x * sd, y, z])); if (sd < 0) R.reverse(); kit.loft(R, COMP); }
  // transom
  const st = rings[0], ol0 = [...st.map(p => [p[0], p[1]]), ...st.slice().reverse().map(p => [-p[0], p[1]])];
  const ol = ol0; kit.add(new THREE.ShapeGeometry(new THREE.Shape(ol.map(([x, y]) => new THREE.Vector2(x, y)))), COMP_L, T(0, 0, 48.6));
  // the sloped stern deck between the transom top and the deck edge
  { const a = deckHalf(46.9), b = st[7][0], q = [a, DECK, 47, -a, DECK, 47, -b, 4.2, 48.6, a, DECK, 47, -b, 4.2, 48.6, b, 4.2, 48.6]; kit.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(q, 3)), CER_D); }
  // the deck: ceramic plates with dark seams between (a flat polygon, then strips)
  const pts = [];
  for (let z = 47; z >= -44; z -= 1) pts.push([deckHalf(z), z]);
  for (let z = -44; z <= 47; z += 1) pts.push([-deckHalf(z), z]);
  kit.floor(pts.map(([x, z]) => [x, z]), DECK + 0.01, CER_D);
  for (let z = -36; z < 44; z += 6) { const w = deckHalf(z) * 2; glow.box(w * 0.98, 0.03, 0.08, 0x3a6c78, 0, DECK + 0.03, z); }
  // emissive seams along the hull knuckle (both sides) and the waterline boot
  for (const sd of [1, -1]) for (let i = 2; i < rings.length - 2; i++) {
    const a = rings[i][5], b = rings[i + 1][5], L = Math.hypot(b[0] - a[0], b[2] - a[2]);
    glow.box(0.06, 0.1, L, CYAN, sd * (a[0] + b[0]) / 2 + sd * 0.05, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 0, Math.atan2(sd * (b[0] - a[0]), b[2] - a[2]), 0);
  }
  return rings;
}
// railgun turret: a low faceted ceramic housing, twin rails in a pitching cradle, the bore glowing between the rails
function railTurret(z) {
  const t = new THREE.Group(); t.position.set(0, DECK, z);
  const k = new Kit({ wear: 0.02 }), gk = new Kit({ wear: 0 });
  k.cyl(3.2, 3.6, 0.6, COMP, 0, 0.3, 0, 0, 0, 0, 8);
  k.add(new THREE.CylinderGeometry(2.4, 3.1, 1.9, 6), CER, T(0, 1.55, 0.4, 0, Math.PI / 6, 0, 1, 1, 1.3));
  k.box(3.6, 0.5, 2.2, CER_D, 0, 2.45, 1.4); k.box(1.2, 0.6, 1.2, DARKG, -1.5, 2.6, 2.4);   // sensor head
  gk.add(new THREE.CylinderGeometry(3.12, 3.12, 0.06, 6), CYAN, T(0, 1.0, 0.4, 0, Math.PI / 6, 0, 1, 1, 1.3));
  gk.box(0.5, 0.06, 0.06, CYAN, -1.5, 2.95, 1.8);
  t.add(new THREE.Mesh(k.geometry(), hullMat()), new THREE.Mesh(gk.geometry(), glowMat()));
  const cradle = new THREE.Group(); cradle.position.set(0, 1.9, -0.8); t.add(cradle);
  const b = new Kit({ wear: 0.01 }), bg = new Kit({ wear: 0 });
  for (const sd of [-1, 1]) { b.box(0.38, 0.75, 13, COMP_L, sd * 0.42, 0, -6.2); b.box(0.42, 0.2, 13.2, CER, sd * 0.42, 0.45, -6.2); }
  b.box(1.5, 1.2, 2.6, CER, 0, 0, 0.2); b.cyl(0.85, 0.85, 0.5, COMP, 0, 0, -12.5, Math.PI / 2, 0, 0, 8);   // breech block, muzzle collimator
  for (let i = 1; i < 6; i++) b.box(1.35, 0.95, 0.25, COMP, 0, 0, -i * 2.1);                            // rail clamps
  bg.box(0.12, 0.3, 12.6, CYAN, 0, 0, -6.4); bg.add(new THREE.TorusGeometry(0.62, 0.06, 4, 12), CYAN, T(0, 0, -12.78));
  cradle.add(new THREE.Mesh(b.geometry(), hullMat()));
  const bore = new THREE.Mesh(bg.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 })); cradle.add(bore);
  t.userData.barrels = cradle; t.userData.bore = bore; t.userData.heat = 0;
  // fired: the cradle kicks back, the bore flares and cools
  t.userData.fire = () => { t.userData.heat = 1; cradle.position.z = 1.0; };
  t.userData.tick = dt => { const u = t.userData; u.heat = Math.max(0, u.heat - dt * 0.6); bore.material.opacity = 0.5 + 0.5 * u.heat; bore.material.color.setRGB(1 + u.heat, 1 + u.heat * 0.6, 1); cradle.position.z += (-0.8 - cradle.position.z) * Math.min(1, dt * 1.5); };
  return t;
}

export function buildLeviathan() {
  const g = new THREE.Group(); g.name = 'LEVIATHAN';
  const kit = new Kit({ wear: 0.02, seed: 4, grime: (x, y, z, c, r) => { if (c.r < 0.2 && y > 3.3 && y < DECK - 0.05 && Math.abs(x) > 3.5) c.setHex(CER_D); if (y < 0.5 && y > -0.6) c.setHex(0x101214); if (y > 0.5 && r() < 0.2) c.multiplyScalar(0.93 + r() * 0.05); } });
  const glow = new Kit({ wear: 0 }), sheet = new DecalSheet(512, 4, 4);
  hull(kit, glow);
  // the sensor blade: a tall faceted prism leaning aft, standing to starboard of the centreline
  kit.push(T(2.6, DECK, 3));
  kit.add(new THREE.CylinderGeometry(0.82, 1, 1, 6), CER, T(0, 2.3, 0.5, 0, 0, 0, 3.6, 4.6, 9.2));   // base block (faceted, hexagonal plan)
  kit.prism([[-7.5, 0], [8.5, 0], [6.5, 6.8], [-2.5, 6.8]], 3.6, CER, T(-1.8, 4.6, 0, 0, Math.PI / 2, 0));   // the blade (side profile, extruded across)
  kit.prism([[-6, 0], [6.6, 0], [5.2, 2.0], [-3.8, 2.0]], 2.2, CER_D, T(-1.1, 11.4, 0, 0, Math.PI / 2, 0));
  for (const [y, z, s] of [[8.4, -4.6, 1.5], [6.6, 1.0, 1.2], [9.6, 2.8, 1.0]]) for (const sd of [-1, 1]) kit.add(new THREE.CylinderGeometry(s, s, 0.2, 6), DARKG, T(sd * 1.85, y, z, 0, 0, Math.PI / 2));   // flat arrays
  kit.add(new THREE.OctahedronGeometry(0.9, 0), DARKG, T(0, 13.9, -2.6, 0, 0.4, 0, 1, 1.4, 1));   // sensor cluster on top
  glow.push(T(2.6, DECK, 3));
  glow.box(3.66, 0.08, 15.6, CYAN, 0, 4.62, 0.5); glow.box(0.06, 6.8, 0.08, CYAN, 1.83, 8.0, -5.6); glow.box(0.06, 6.8, 0.08, CYAN, -1.83, 8.0, -5.6);
  for (const [y, z, s] of [[8.4, -4.6, 1.5], [6.6, 1.0, 1.2], [9.6, 2.8, 1.0]]) for (const sd of [-1, 1]) glow.add(new THREE.TorusGeometry(s * 0.95, 0.05, 4, 6), CYAN, T(sd * 1.96, y, z, 0, Math.PI / 2, 0));
  glow.add(new THREE.SphereGeometry(0.25, 6, 4), 0xbff8ff, T(0, 14.6, -3.2));
  glow.pop(); kit.pop();
  // the port-side sensor fin (the asymmetry): a smaller blade in the same language, leaning aft, a sensor eye on top
  kit.prism([[-3.4, 0], [3.0, 0], [1.6, 5.2], [-1.2, 5.2]], 1.3, CER_D, T(-4.0 - 0.65, DECK, -1.5, 0, Math.PI / 2, 0));
  kit.add(new THREE.CylinderGeometry(0.75, 0.75, 0.16, 6), DARKG, T(-4.0 - 0.7, DECK + 3.0, -1.2, 0, 0, Math.PI / 2)); glow.add(new THREE.TorusGeometry(0.72, 0.04, 4, 6), CYAN, T(-4.0 - 0.8, DECK + 3.0, -1.2, 0, Math.PI / 2, 0));
  kit.add(new THREE.OctahedronGeometry(0.55, 0), DARKG, T(-4.0, DECK + 5.7, -1.4, 0, 0.3, 0, 1, 1.3, 1)); glow.add(new THREE.SphereGeometry(0.16, 6, 4), 0xbff8ff, T(-4.0, DECK + 6.4, -1.4));
  // the power spine aft of the blade: a raised ridge with heat-sink fins and a glowing core line
  kit.box(2.6, 1.6, 16, COMP_L, 1.2, DECK + 0.8, 20); kit.box(2.0, 0.4, 16.4, CER, 1.2, DECK + 1.7, 20);
  for (let z = 13; z <= 27; z += 1.6) for (const sd of [-1, 1]) kit.box(0.08, 1.4, 0.9, COMP, 1.2 + sd * 1.4, DECK + 1.6, z, 0, 0, sd * 0.4);
  glow.box(0.3, 0.06, 16.2, CYAN, 1.2, DECK + 1.92, 20);
  // bow sensor ball and the stern wake-control fins, mooring hard points
  kit.add(new THREE.OctahedronGeometry(0.8, 0), DARKG, T(0, DECK + 0.6, -38));
  for (const sd of [-1, 1]) kit.box(0.3, 1.6, 3, COMP_L, sd * 5.8, -0.6, 44);
  // stencils: machine glyph designations on the bow and the blade
  const gl = sheet.draw(0, 4, 1, (x, w, h) => drawGlyphs(x, w, h, rng(19), { rows: 1, color: 'rgba(30,34,40,0.9)' }));
  const gc = sheet.draw(4, 4, 1, (x, w, h) => drawGlyphs(x, w, h, rng(29), { rows: 1, color: 'rgba(130,240,255,0.95)' }));
  for (const sd of [-1, 1]) { sheet.place(gc, T(sd * 4.85, 3.2, -28, 0, sd * (Math.PI / 2 - 0.16), 0), 9, 1.2, sd < 0); sheet.place(gl, T(2.6 + sd * 1.83, DECK + 5.2, 3 + 2, 0, sd * Math.PI / 2, 0), 6, 0.8, sd < 0); }
  // railgun turrets (war.js: turrets[i].userData.barrels), point-defence lasers (guns)
  const turrets = [-30, -17, 33].map(z => { const t = railTurret(z); if (z > 0) t.rotation.y = Math.PI; t.userData.aft = z > 0; g.add(t); return t; });
  kit.cyl(1.8, 2.2, 1.2, COMP_L, 0, DECK + 0.4, -17, 0, 0, 0, 8);   // the superfiring barbette
  turrets[1].position.y = DECK + 1.0;
  const team = new THREE.MeshPhongMaterial({ color: 0xff3322 }), guns = [], mounts = [];
  const PD = [[-4.6, -8, [-1, 0, -0.3]], [4.6, -10, [1, 0, -0.3]], [-4.4, 26, [-1, 0, 0.5]], [5.2, 38, [1, 0, 0.6]]];
  for (const [x, z, out] of PD) {
    kit.cyl(0.9, 1.1, 1.0, COMP_L, x, DECK + 0.5, z, 0, 0, 0, 6);
    const gun = buildLaser(team, 1.0); gun.position.set(x, DECK + 1.0, z); gun.userData.yaw.rotation.y = Math.atan2(-out[0], -out[2]); g.add(gun); guns.push(gun);
    mounts.push({ kind: 'laser', pos: new THREE.Vector3(x, DECK + 1.0, z), dir: new THREE.Vector3(...out).normalize(), node: gun, gun: guns.length - 1 });
  }
  for (const t of turrets) mounts.push({ kind: 'railgun', pos: t.position.clone(), dir: new THREE.Vector3(0, 0, t.userData.aft ? 1 : -1), node: t });
  const h = kit.mesh(); h.name = 'leviathan-hull'; g.add(h);
  g.add(new THREE.Mesh(glow.geometry(), glowMat()));
  g.add(sheet.mesh({ lambert: false }));
  return {
    group: g, turrets, guns, mounts, hull: h, localDeck, deckHalf, waterHalf: z => z < -50 ? 0 : z < -6 ? 7.2 * Math.pow((z + 50) / 44, 0.65) : 7.2, motion: 'leviathan', dims: LEV, fx: { wake: 0.8, smoke: 0 },
    bow: new THREE.Vector3(0, 0, -47), stern: new THREE.Vector3(0, 0, 46),
    tick(dt) { for (const t of turrets) t.userData.tick(dt); for (const gun of guns) gun.userData.tick?.(dt); },
  };
}
