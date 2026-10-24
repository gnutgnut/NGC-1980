// The RUNAWAY supply ship: a modern autonomous, battery-electric container feeder (Yara Birkeland class, 2020s:
// 79.5 m x 14.8 m, 120 TEU, no funnel, the small deckhouse right forward, azimuth pods aft) that the machines
// brought back and run unmanned. Real size in the game. RUNAWAY modifications: the deckhouse windows plated over
// with ceramic, a sensor mast with pods where the radar was, cyan IFF strips, the name painted out and stencilled
// with glyphs, some boxes swapped for RUNAWAY cargo pods, a point-defence laser on the forecastle.
// Containers are one InstancedMesh (colour per box). Deck contract: deck y = 4; the stacks and the deckhouse
// are standing surfaces via parts.localDeck. dims = { L: 80, W: 15, DECK: 4 }.
import * as THREE from 'three';
import { Kit, T, rng, hullMat, glowMat, DecalSheet, drawText, drawGlyphs, drawStreak } from './navkit.js';
import { buildLaser } from './mounts.js';

export const BOX = { L: 80, W: 15, DECK: 4 };
const { DECK } = BOX;
const HULL = 0x1f3a52, HULL_RED = 0x6e2420, WHITE = 0xdedfda, GREY = 0x8c9397, DARK = 0x24282c, CER = 0xd3d6d1, CYAN = 0x6fe8ff;
const CW = 2.44, CH = 2.59, CL = 6.06;               // a 20 ft ISO container (m)
const BAYS = 8, ROWS = 5, Z0 = -24;                  // bays from z = -24 aft, rows across
// stack heights (tiers) per bay and row, fixed: the stow plan
const PLAN = [[2, 3, 3, 3, 2], [3, 3, 3, 3, 3], [3, 3, 4, 3, 3], [2, 3, 3, 3, 3], [3, 3, 3, 3, 2], [3, 4, 3, 3, 3], [2, 3, 3, 2, 2], [1, 2, 2, 2, 1]];
export function deckHalf(lz) {
  if (lz < -40 || lz > 40) return 0;
  if (lz < -26) return 7.4 * Math.sqrt(Math.max(0, (lz + 40) / 14)) * 0.85 + 7.4 * 0.15 * ((lz + 40) / 14);
  if (lz > 34) return 7.4 - (lz - 34) / 6 * 1.6;
  return 7.4;
}
export function localDeck(lx, lz) {
  let h = -1e9;
  if (Math.abs(lx) < deckHalf(lz)) h = DECK;
  const b = Math.floor((lz - Z0) / (CL + 0.15)), r = Math.floor((lx + ROWS * CW / 2) / CW);
  if (b >= 0 && b < BAYS && r >= 0 && r < ROWS && lz < Z0 + BAYS * (CL + 0.15)) h = DECK + 0.3 + PLAN[b][r] * CH;
  if (Math.abs(lx) < 6.5 && lz > -34 && lz < -27) h = DECK + 9.4;   // deckhouse roof
  return h;
}
function hull(kit) {
  const zs = [40, 38, 34, 26, 10, -6, -20, -28, -33, -36, -38.5, -40];
  const rings = zs.map(z => {
    const dh = Math.max(0.05, deckHalf(z)), wl = z < -26 ? dh * 0.9 : z > 34 ? dh * 0.92 : 7.3;
    return [[0, -3.2], [wl * 0.85, -3.2], [wl, -1.8], [wl, 0], [Math.max(wl, dh * 0.99), 2.4], [dh, DECK + (z < -30 ? 1.6 : 0)]].map(([x, y]) => [x, y, z]);
  });
  for (const sd of [1, -1]) { let R = rings.map(r => r.map(([x, y, z]) => [x * sd, y, z])); if (sd < 0) R.reverse(); kit.loft(R, HULL); }
  const st = rings[0], ol = [...st.map(p => [p[0], p[1]]), ...st.slice().reverse().map(p => [-p[0], p[1]])];
  kit.add(new THREE.ShapeGeometry(new THREE.Shape(ol.map(([x, y]) => new THREE.Vector2(x, y)))), HULL, T(0, 0, 40));
  const pts = []; for (let z = 40; z >= -40; z -= 1) pts.push([deckHalf(z), z]); for (let z = -40; z <= 40; z += 1) pts.push([-deckHalf(z), z]);
  kit.floor(pts, DECK, 0x5d6266);
  // bulwarks, the forecastle breakwater, hatch coamings
  for (const sd of [-1, 1]) kit.box(0.25, 1.1, 66, 0x2a4a66, sd * 7.3, DECK + 0.5, 3);
  kit.box(12, 2.2, 0.4, WHITE, 0, DECK + 1.1, -26.4, -0.35); kit.floor(pts.filter(([, z]) => z < -27).concat([[-6, -27], [6, -27]]).map(p => p), DECK + 1.6, 0x5d6266);
  for (let b = 0; b < BAYS; b++) kit.box(ROWS * CW + 0.6, 0.3, CL - 0.2, 0x3a3f44, 0, DECK + 0.15, Z0 + b * (CL + 0.15) + CL / 2);
  return rings;
}
let _boxGeo = null;
function boxGeo() {   // a container: corrugated sides (ribs), the door end, corner castings; white = tinted per instance
  if (_boxGeo) return _boxGeo;
  const k = new Kit({ wear: 0 });
  k.box(CW - 0.04, CH - 0.04, CL - 0.04, 0xffffff, 0, CH / 2, 0);
  for (let i = -6; i <= 6; i += 2) for (const sd of [-1, 1]) k.box(0.05, CH - 0.25, 0.22, 0xd0d0d0, sd * (CW / 2 - 0.01), CH / 2, i * 0.44);
  k.box(CW - 0.1, CH - 0.2, 0.06, 0xc8c8c8, 0, CH / 2, CL / 2 - 0.01); k.box(0.06, CH - 0.3, 0.07, 0x707070, -0.3, CH / 2, CL / 2 + 0.01); k.box(0.06, CH - 0.3, 0.07, 0x707070, 0.3, CH / 2, CL / 2 + 0.01);
  for (const x of [-1, 1]) for (const y of [0.08, CH - 0.08]) for (const z of [-1, 1]) k.box(0.18, 0.16, 0.18, 0x3a3a3a, x * (CW / 2 - 0.09), y, z * (CL / 2 - 0.09));
  _boxGeo = k.geometry(); return _boxGeo;
}
export function buildContainerShip() {
  const g = new THREE.Group(); g.name = 'CONTAINER SHIP';
  const kit = new Kit({ wear: 0.04, seed: 12, grime: (x, y, z, c, r) => { if (y < -0.4) c.setHex(HULL_RED); else if (y < 0.4) c.setHex(0x151515); else if (y < 2 && Math.abs(x) > 5) c.multiplyScalar(0.8); if (r() < 0.2) c.multiplyScalar(0.92 + r() * 0.06); } });
  const glow = new Kit({ wear: 0 }), sheet = new DecalSheet(1024, 8, 8);
  hull(kit);
  // the deckhouse forward (Yara's small bridge block), windows plated over with ceramic panels by the machines
  kit.push(T(0, DECK + 1.6, -30.5));
  kit.box(10, 3.0, 5.5, WHITE, 0, 1.5, 0); kit.box(11.5, 2.6, 5.0, WHITE, 0, 4.4, 0.2); kit.box(12.2, 0.3, 5.8, GREY, 0, 5.85, 0.2);
  for (let i = 0; i < 7; i++) kit.box(1.4, 1.2, 0.12, CER, -4.6 + i * 1.53, 4.6, -2.36);   // the plates over the windows
  for (const sd of [-1, 1]) kit.box(1.4, 1.2, 0.12, CER, sd * 5.8, 4.6, 0.2, 0, Math.PI / 2, 0);
  glow.push(T(0, DECK + 1.6, -30.5)); glow.box(11.6, 0.1, 0.06, CYAN, 0, 3.6, -2.4); glow.box(0.06, 0.1, 5.0, CYAN, 5.8, 3.6, 0.2); glow.box(0.06, 0.1, 5.0, CYAN, -5.8, 3.6, 0.2);
  // the sensor mast that replaced the radar: lattice, pods, a ceramic dome
  kit.rod([0, 6, 0.5], [0, 12.5, 0.8], 0.18, GREY, 5); kit.rod([-1.4, 6, 1.8], [0, 10.5, 0.8], 0.08, GREY, 4); kit.rod([1.4, 6, 1.8], [0, 10.5, 0.8], 0.08, GREY, 4);
  kit.box(3.2, 0.15, 1.2, GREY, 0, 9.4, 0.7); kit.add(new THREE.SphereGeometry(0.75, 8, 6), CER, T(0, 13.2, 0.8));
  for (const sd of [-1, 1]) { kit.add(new THREE.SphereGeometry(0.42, 8, 6), CER, T(sd * 1.5, 9.9, 0.7, 0, 0, 0, 1, 0.8, 1.3)); glow.add(new THREE.TorusGeometry(0.4, 0.03, 4, 12), CYAN, T(sd * 1.5, 9.9, 0.7, Math.PI / 2)); }
  glow.add(new THREE.TorusGeometry(0.78, 0.04, 4, 14), CYAN, T(0, 13.1, 0.8, Math.PI / 2)); glow.box(0.16, 0.16, 0.16, 0xff3020, 0, 14.1, 0.8);
  kit.pop(); glow.pop();
  // aft: the battery-room vents, the azimuth pods' hatches, mooring winches, the stern IFF strip; no funnel
  kit.box(9, 1.6, 4, WHITE, 0, DECK + 0.8, 35); for (let i = 0; i < 5; i++) kit.box(1.2, 0.5, 2.6, 0x6a7176, -3.6 + i * 1.8, DECK + 1.85, 35);
  for (const sd of [-1, 1]) { kit.cyl(0.5, 0.5, 1.2, DARK, sd * 4.5, DECK + 0.6, 38, 0, 0, Math.PI / 2, 8); kit.cyl(0.5, 0.5, 1.2, DARK, sd * 3.5, DECK + 2.2, -36, 0, 0, Math.PI / 2, 8); }
  for (const sd of [-1, 1]) glow.box(0.08, 0.12, 64, CYAN, sd * 7.45, DECK + 1.05, 3);
  glow.box(9, 0.1, 0.08, CYAN, 0, DECK + 1.2, 37.03);
  // container stacks (instanced), a few RUNAWAY cargo pods in place of boxes
  const r = rng(31), COLS = [0x9c3a26, 0x2a5f9e, 0x2f7a46, 0xb98a28, 0x8a8f94, 0xc4c8c4, 0x5b2f6e, 0x1f4f63, 0xa0522d, 0x6c7a3a];
  const boxes = [], pods = [];
  for (let b = 0; b < BAYS; b++) for (let rw = 0; rw < ROWS; rw++) for (let t = 0; t < PLAN[b][rw]; t++) {
    const x = (rw - (ROWS - 1) / 2) * CW, y = DECK + 0.3 + t * CH, z = Z0 + b * (CL + 0.15) + CL / 2;
    if (t === PLAN[b][rw] - 1 && r() < 0.12) pods.push([x, y, z]); else boxes.push([x, y, z, COLS[(r() * COLS.length) | 0]]);
  }
  const bm = new THREE.InstancedMesh(boxGeo(), new THREE.MeshLambertMaterial({ vertexColors: true }), boxes.length), c = new THREE.Color();
  boxes.forEach(([x, y, z, col], i) => { bm.setMatrixAt(i, T(x, y, z, 0, r() < 0.5 ? 0 : Math.PI, 0)); bm.setColorAt(i, c.setHex(col).multiplyScalar(0.85 + r() * 0.25)); });
  bm.name = 'containers'; g.add(bm);
  for (const [x, y, z] of pods) {   // ceramic RUNAWAY cargo pod: rounded, seamed, glowing
    kit.box(CW - 0.1, CH - 0.3, CL - 0.3, CER, x, y + CH / 2 - 0.1, z); kit.add(new THREE.CylinderGeometry(CW / 2 - 0.05, CW / 2 - 0.05, CL - 0.6, 6), 0xbfc3be, T(x, y + CH - 0.25, z, Math.PI / 2, 0, 0, 1, 1, 0.35));
    glow.box(CW - 0.05, 0.06, 0.06, CYAN, x, y + CH / 2, z - CL / 2 + 0.12); glow.box(CW - 0.05, 0.06, 0.06, CYAN, x, y + CH / 2, z + CL / 2 - 0.12); glow.box(0.06, 0.06, CL - 0.4, CYAN, x + CW / 2 - 0.04, y + CH * 0.7, z);
  }
  // lashing bridges between the bays
  for (let b = 1; b < BAYS; b++) { const z = Z0 + b * (CL + 0.15) - 0.07; kit.box(ROWS * CW + 0.4, 0.15, 0.25, 0x8a6a2a, 0, DECK + 2.6, z); for (const sd of [-1, 1]) kit.box(0.15, 2.6, 0.2, 0x8a6a2a, sd * (ROWS * CW / 2 + 0.2), DECK + 1.3, z); }
  // the name, painted out; the old IMO number; glyph stencils; rust down the bow
  const nm = sheet.draw(0, 8, 1, (x, w, h) => { drawText(x, w, h, 'NORDKAPP AUTONOM', { size: 0.5, color: 'rgba(230,230,225,0.45)' }); x.fillStyle = 'rgba(31,58,82,0.85)'; x.fillRect(w * 0.1, h * 0.25, w * 0.8, h * 0.5); x.save(); x.translate(w * 0.14, h * 0.2); drawGlyphs(x, w * 0.72, h * 0.6, rng(4), { rows: 1 }); x.restore(); });
  for (const sd of [-1, 1]) sheet.place(nm, T(sd * 7.45, 2.6, -18, 0, sd * Math.PI / 2, 0), 14, 1.75, sd < 0);
  sheet.place(nm, T(0, 2.2, 40.05), 11, 1.4);
  const rs = sheet.draw(8, 1, 3, (x, w, h) => drawStreak(x, w, h, rng(41), { a: 0.7, n: 5 }));
  for (const sd of [-1, 1]) for (const z of [-22, -6, 10, 22, 31]) sheet.place(rs, T(sd * 7.46, 2.2, z, 0, sd * Math.PI / 2, 0), 1.2, 3.2, sd < 0);
  // the point-defence laser on the forecastle (war.js gun)
  const team = new THREE.MeshPhongMaterial({ color: 0xff3322 });
  kit.cyl(1.0, 1.2, 1.4, DARK, 0, DECK + 2.3, -35.5, 0, 0, 0, 6);
  const gun = buildLaser(team, 1.0); gun.position.set(0, DECK + 3.0, -35.5); g.add(gun);
  const h = kit.mesh(); h.name = 'container-hull'; g.add(h);
  g.add(new THREE.Mesh(glow.geometry(), glowMat()));
  g.add(sheet.mesh());
  return {
    group: g, guns: [gun], mounts: [{ kind: 'laser', pos: gun.position.clone(), dir: new THREE.Vector3(0, 0, -1), node: gun, gun: 0 }],
    hull: h, localDeck, deckHalf, waterHalf: z => z < -26 ? deckHalf(z) * 0.9 : 7.3, motion: 'container', dims: BOX, fx: { wake: 0.7, smoke: 0 },
    bow: new THREE.Vector3(0, 0, -40), stern: new THREE.Vector3(0, 0, 39),
    tick(dt) { gun.userData.tick?.(dt); },
  };
}
