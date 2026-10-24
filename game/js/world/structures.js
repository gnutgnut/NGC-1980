// Faction structures for the island war (ships.js buildStructure delegates here for hq / factory / fuel / radar).
//
// Every site carries two styles and their wreckage, and switches between them as the island changes hands:
//   1980 (player side 1, neutral side 0): HQ bunker in an earth berm with sandbags, antennas and a flag; fuel farm with
//     bunded tanks, a pump house and a nodding pumpjack; depot with quonset huts, a workshop and stacked crates; radar
//     site with an AN/TPS-43-style planar array on its trailer and a radome. Military clutter (jeep, M35, camo net,
//     sandbags) only while the task force holds it; the islanders' flag and a Land Rover while it is neutral.
//   RUNAWAY (side 2): command node, siphon spire, fabricator, sensor spire - matte ceramic and dark composite with
//     pale cyan seams. When the machines take a site their structure grows out of the ground over the 1980 ruin; when
//     we take it back the machine goes dark and is left as shards round the rebuilt 1980 site.
//   Condition: intact, damaged (smoke, scorch, broken antennas, flickering seams), destroyed (ruin, fire, scorch).
//
// userData kept for war.js: team (recoloured material), kind, h, r, stackTops (factory chimneys), beam / flag / dish /
// hull are left out on purpose (this module animates its own parts). New hooks war.js calls when present:
//   attach({ fx, s })  setSide(side)  onHp(fraction)  setState('intact' | 'destroyed')  tick(dt, time)
import * as THREE from 'three';
import { Geo, col, shade } from './kit.js';
import { worldMaterial, geoFrom } from './gfx.js';
import { rng } from './rng.js';

const TEAMC = { 0: 0x4f9a5a, 1: 0x2f6fd0, 2: 0xff3322 };
const MAT = { solid: null, glow: null, glowDead: null };
const mats = () => {
  if (!MAT.solid) {
    MAT.solid = worldMaterial();
    MAT.glow = new THREE.MeshBasicMaterial({ color: 0x8ff4ff });
    MAT.glowDead = new THREE.MeshBasicMaterial({ color: 0x1c2224 });
    MAT.flagW = new THREE.MeshLambertMaterial({ color: 0xf2f2ea, side: THREE.DoubleSide });
  }
  return MAT;
};
const mesh = (g, m) => { const o = new THREE.Mesh(geoFrom(g.build()), m || mats().solid); return o; };
// palette
const OD = col(0x4b5320), OD2 = col(0x5d6532), SAND = col(0xb8a678), SAND2 = col(0xa89668), CONC = col(0x9a978e), CONC2 = col(0x86847c);
const EARTH = col(0x6a6644), GRASS = col(0x55753a), STEEL = col(0x6c7276), DARK = col(0x2a2c2e), BLACK = col(0x18191a), WHITE = col(0xe8e8e2);
const RUST = col(0x7a4a32), WOODC = col(0x8a6a3a), CHAR = col(0x2e2b28), CHAR2 = col(0x45403a), ASH = col(0x5a5650);
const CER = col(0xd9dcd6), CER2 = col(0xc4c8c4), COMP = col(0x2a2e33), COMP2 = col(0x3a3f45), DEADC = col(0x5c5e5c);

// ------------------------------------------------------------------------------------------- shared 1980 bits
function sandbags(g, x0, z0, x1, z1, rows = 3, r) {   // a wall of bags between two points
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 0.62)), yaw = Math.atan2(-(z1 - z0), x1 - x0);
  g.push(x0, 0, z0, yaw);
  for (let k = 0; k < rows; k++) for (let i = 0; i < n - (k % 2); i++) g.box(0.31 + i * L / n + (k % 2) * 0.31, k * 0.3, 0, 0.58, 0.3, 0.4, (i + k) % 3 ? SAND : SAND2, 1);
  g.pop();
}
function jeep(g, x, z, yaw) {   // M151 MUTT, parked
  g.push(x, 0, z, yaw);
  g.box(0, 0.45, 0, 1.6, 0.55, 3.35, OD, 1); g.box(0, 1.0, 0.55, 1.5, 0.08, 1.2, OD2, 0);
  g.box(0, 1.0, 0.1, 1.45, 0.45, 0.06, col(0x3a4a50), 0);   // windscreen
  for (const [wx, wz] of [[0.72, 1.1], [-0.72, 1.1], [0.72, -1.05], [-0.72, -1.05]]) g.push(wx, 0.38, wz, 0, 0, Math.PI / 2).cyl(0, -0.12, 0, 0.38, 0.24, 7, BLACK, 0).pop();
  g.push(0, 0.85, -1.75, 0, Math.PI / 2).cyl(0, -0.1, 0, 0.36, 0.2, 7, BLACK, 2).pop();   // spare on the back
  g.cyl(-0.6, 1.0, -1.4, 0.03, 2.2, 4, DARK, 0);   // whip antenna
  g.pop();
}
function deuce(g, x, z, yaw, canvas = true) {   // M35A2 2.5 t truck: cab, bed with canvas cover, six wheels
  g.push(x, 0, z, yaw);
  g.box(0, 0.6, 2.4, 2.2, 1.2, 1.6, OD, 1); g.box(0, 1.8, 2.0, 2.1, 0.9, 1.1, OD, 1); g.box(0, 1.85, 2.56, 1.9, 0.5, 0.04, col(0x3a4a50), 0);
  g.box(0, 1.0, -1.0, 2.4, 0.5, 4.6, OD2, 1);
  if (canvas) { g.box(0, 1.5, -1.0, 2.35, 1.4, 4.5, col(0x5a5a38), 1); g.push(0, 2.9, -1.0, Math.PI / 2).gable(0, 0, 0, 4.5, 2.35, 0.3, col(0x55553a), col(0x5a5a38), 0.02).pop(); }
  for (const wz of [2.4, -0.4, -1.8]) for (const s of [-1, 1]) g.push(s * 1.0, 0.5, wz, 0, 0, Math.PI / 2).cyl(0, -0.2, 0, 0.5, 0.4, 8, BLACK, 0).pop();
  g.pop();
}
function landRover(g, x, z, yaw) {   // the islanders' white Land Rover
  g.push(x, 0, z, yaw);
  g.box(0, 0.45, 0, 1.7, 1.0, 3.9, col(0xe6e4dc), 1); g.box(0, 1.45, -0.3, 1.66, 0.55, 2.6, col(0xe6e4dc), 1); g.box(0, 1.45, 1.02, 1.6, 0.45, 0.05, col(0x3a4a50), 0);
  for (const [wx, wz] of [[0.78, 1.2], [-0.78, 1.2], [0.78, -1.2], [-0.78, -1.2]]) g.push(wx, 0.4, wz, 0, 0, Math.PI / 2).cyl(0, -0.12, 0, 0.4, 0.24, 7, BLACK, 0).pop();
  g.box(0, 2.0, -0.3, 0.9, 0.12, 0.25, col(0x2a5ad0), 0);   // blue lamp bar (coastguard / police)
  g.pop();
}
function drums(g, x, z, n, r, c = OD) { for (let i = 0; i < n; i++) g.cyl(x + (i % 3) * 0.62, 0, z + Math.floor(i / 3) * 0.62, 0.29, 0.88, 8, i % 4 === 3 ? col(0x8a2a1a) : c, 2, 0.29, shade(c, 0.8)); }
function crates(g, x, z, r, n = 6) { for (let i = 0; i < n; i++) { const big = r() < 0.5; g.box(x + (i % 3) * 1.25, Math.floor(i / 6) * 0.9, z + (Math.floor(i / 3) % 2) * 1.1, big ? 1.2 : 1.0, big ? 0.9 : 0.6, 1.0, r() < 0.5 ? WOODC : OD, 1); } }
function camoNet(g, x, z, w, d, h, r) {   // a sagging net over poles, mottled
  const nx = 4, nz = 4, P = (i, j) => [x - w / 2 + i * w / nx, h - (Math.sin(i / nx * Math.PI) * Math.sin(j / nz * Math.PI)) * -0.2 - (i % 2 + j % 2) * 0.15 - (i === 0 || i === nx || j === 0 || j === nz ? 0.5 : 0), z - d / 2 + j * d / nz];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const c = r() < 0.5 ? col(0x3e4a2a) : col(0x5a5034); g.quad(P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), c); g.quad(P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), P(i, j), shade(c, 0.7)); }
  for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.cyl(x + px * w / 2, 0, z + pz * d / 2, 0.06, h - 0.4, 4, WOODC, 0);
}
function floodlight(g, x, z) { g.strut([x, 0, z], [x, 6, z], 0.12, STEEL); g.box(x, 6, z, 1.2, 0.5, 0.4, DARK, 0); for (const u of [-0.35, 0.35]) g.box(x + u, 6.1, z + 0.21, 0.3, 0.3, 0.02, col(0xf0eccc), 0); }
function generator(g, x, z, yaw) { g.push(x, 0, z, yaw); g.box(0, 0.4, 0, 1.4, 1.1, 2.2, OD, 1); g.box(0, 1.5, 0.5, 0.15, 0.4, 0.15, BLACK, 0); for (const s of [-1, 1]) g.push(s * 0.75, 0.32, -0.5, 0, 0, Math.PI / 2).cyl(0, -0.1, 0, 0.32, 0.2, 6, BLACK, 0).pop(); g.cyl(0, 0, 1.4, 0.05, 0.6, 4, DARK, 0); g.pop(); }
function stripe(g, x, y, z, w, h, d, c) { g.box(x, y, z, w, h, d, c, 1); }
// earth berm: a frustum from (w0, d0) at y0 to (w1, d1) at y1
function berm(g, x, z, w0, d0, w1, d1, y0, y1, side = EARTH, top = GRASS) {
  const A = [[-w0 / 2, -d0 / 2], [w0 / 2, -d0 / 2], [w0 / 2, d0 / 2], [-w0 / 2, d0 / 2]], B = [[-w1 / 2, -d1 / 2], [w1 / 2, -d1 / 2], [w1 / 2, d1 / 2], [-w1 / 2, d1 / 2]];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; g.quad([x + A[j][0], y0, z + A[j][1]], [x + A[i][0], y0, z + A[i][1]], [x + B[i][0], y1, z + B[i][1]], [x + B[j][0], y1, z + B[j][1]], side); }
  g.quad([x + B[3][0], y1, z + B[3][1]], [x + B[2][0], y1, z + B[2][1]], [x + B[1][0], y1, z + B[1][1]], [x + B[0][0], y1, z + B[0][1]], top);
}
// ------------------------------------------------------------------------------------------- RUNAWAY bits
// a slanted ceramic slab: base w x d at y0, top shifted by (sx, sz) and scaled by k, height h
function slab(g, x, z, w, d, h, sx, sz, k, c, top) {
  const b = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]], t = b.map(([u, v]) => [u * k + sx, v * k + sz]);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; g.quad([x + b[j][0], 0, z + b[j][1]], [x + b[i][0], 0, z + b[i][1]], [x + t[i][0], h, z + t[i][1]], [x + t[j][0], h, z + t[j][1]], i % 2 ? c : shade(c, 0.9)); }
  g.quad([x + t[3][0], h, z + t[3][1]], [x + t[2][0], h, z + t[2][1]], [x + t[1][0], h, z + t[1][1]], [x + t[0][0], h, z + t[0][1]], top || shade(c, 1.05));
}
function hexPlinth(g, x, z, r, h, c) { g.cyl(x, -1.5, z, r, h + 1.5, 6, c, 2, r * 0.94, shade(c, 1.1)); }
// a seam: a thin glowing strip between two points (goes in the glow geometry)
function seam(gl, a, b, w = 0.07) { gl.strut(a, b, w, WHITE); }
function shard(g, x, z, h, w, lean, yaw, c) { g.push(x, 0, z, yaw, lean, 0); g.pyramid(0, -0.3, 0, w, w * 0.5, h, c); g.pop(); }

// ------------------------------------------------------------------------------------------- ngc/world-polish
// the ground under a site (main.js terrainH, set by world/life.js): fences and AA revetments follow the slope
const GROUND = { fn: null };
export function setStructGround(fn) { GROUND.fn = fn; }
// war.js's AA slots round a pad (aaSlots: repeated here, keep in step)
const aaSlotsOf = I => { const p = I.pad, r = I.cave ? 15 : 22; return p ? [0, 1, 2, 3].map(k => { const a = k * Math.PI / 2 + Math.PI / 4; return [p.x + Math.cos(a) * r, p.z + Math.sin(a) * r]; }) : []; };
function sentryBox(g, x, z, r) {   // a sentry box with a sandbag skirt and a red-and-white barrier pole leaning on it
  g.push(x, 0, z, Math.PI / 2); g.box(0, 0, 0, 1.4, 2.3, 1.4, OD2, 1); g.box(0, 2.3, 0, 1.6, 0.12, 1.6, DARK, 0);
  g.quad([-0.45, 1.2, 0.71], [0.45, 1.2, 0.71], [0.45, 1.8, 0.71], [-0.45, 1.8, 0.71], col(0x2b3846));
  sandbags(g, -1.2, 1.0, 1.2, 1.0, 2, r);
  for (let i = 0; i < 6; i++) g.push(1.0, 0.95, -0.4 - i * 0.55).box(0, 0, 0, 0.12, 0.12, 0.55, i % 2 ? RED_ : WHITE, 0).pop();
  g.pop();
}
const RED_ = col(0xb02a22);
// the perimeter fence: concrete posts every 3 m, chain-link (its four line wires: the mesh itself would not read),
// three strands of barbed wire on cranked arms; round the back and sides (the front stays open to the pad), stepping
// round the pad, the AA slots and the other sites on the island
function buildFence(g, I, half) {
  const G = new Geo(), gx = g.position.x, gy = g.position.y, gz = g.position.z, yaw = g.rotation.y, c = Math.cos(yaw), s = Math.sin(yaw);
  const W = (u, v) => [gx + c * u + s * v, gz - s * u + c * v], slots = aaSlotsOf(I), pad = I.pad;
  const blocked = (u, v) => {
    const [x, z] = W(u, v);
    if (pad && Math.hypot(x - pad.x, z - pad.z) < (pad.r || 8.5) + 5) return true;
    if (slots.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 7)) return true;
    for (const o of I.structs || []) { if (o.kind === 'aa' || o.mesh === g) continue; if (Math.hypot(x - o.x, z - o.z) < (o.r || 8) + 2.5) return true; }
    return false;
  };
  const hAt = (u, v) => { const [x, z] = W(u, v); return GROUND.fn(x, z) - gy; };
  const runs = [[[-half, half * 0.45], [-half, -half]], [[-half, -half], [half, -half]], [[half, -half], [half, half * 0.45]]];
  const POST = CONC2, WIRE = col(0x8a9094);
  let n = 0;
  for (const [[u0, v0], [u1, v1]] of runs) {
    const L = Math.hypot(u1 - u0, v1 - v0), k = Math.max(1, Math.round(L / 3));
    let prev = null;
    for (let i = 0; i <= k; i++) {
      const u = u0 + (u1 - u0) * i / k, v = v0 + (v1 - v0) * i / k;
      if (blocked(u, v)) { prev = null; continue; }
      const y = hAt(u, v);
      G.box(u, y - 0.3, v, 0.14, 2.75, 0.14, POST, 1); n++;
      const ou = -(v1 - v0) / L, ov = (u1 - u0) / L;   // outward (left of the run, which goes round clockwise)
      G.strut([u, y + 2.4, v], [u - ou * 0.4, y + 2.75, v - ov * 0.4], 0.05, POST);
      if (prev) {
        for (const h of [0.1, 0.8, 1.5, 2.2]) G.strut([prev.u, prev.y + h, prev.v], [u, y + h, v], 0.025, WIRE);
        for (const q of [0.15, 0.27, 0.39]) G.strut([prev.u - ou * q, prev.y + 2.4 + q * 0.85, prev.v - ov * q], [u - ou * q, y + 2.4 + q * 0.85, v - ov * q], 0.018, DARK);
      }
      prev = { u, v, y };
    }
  }
  return n ? mesh(G) : null;
}
// the AA emplacements on an island's slots, [[x, z, gapA]...] (world/life.js places them; side 1: dug in, side 2:
// machine plates), merged: two meshes an island
export function buildAASite(hf, slots) {
  const g = new THREE.Group(), X0 = slots[0][0], Z0 = slots[0][1], Y0 = hf(X0, Z0); g.position.set(X0, Y0, Z0);
  const HU = new Geo(), RW = new Geo(), GL = new Geo(), r = rng(((X0 * 7) | 0) ^ ((Z0 * 13) | 0));
  for (const [x, z, gapA] of slots) {
  HU.push(x - X0, 0, z - Z0); RW.push(x - X0, 0, z - Z0); GL.push(x - X0, 0, z - Z0);
  const R0 = 4.4, R1 = 6.2, n = 16, h = (a, R) => hf(x + Math.cos(a) * R, z + Math.sin(a) * R) - Y0;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, am = (a0 + a1) / 2;
    if (Math.abs(Math.atan2(Math.sin(am - gapA), Math.cos(am - gapA))) < 0.5) continue;   // the way in, from the pad side
    const P = (a, R, dy) => [Math.cos(a) * R, h(a, R) + dy, Math.sin(a) * R];
    const i0 = P(a0, R0, 1.0), i1 = P(a1, R0, 1.0), b0 = P(a0, R0, -0.3), b1 = P(a1, R0, -0.3), t0 = P(a0, R0 + 0.7, 1.05), t1 = P(a1, R0 + 0.7, 1.05), o0 = P(a0, R1, -0.15), o1 = P(a1, R1, -0.15);
    HU.faceW(b0, b1, i1, i0, EARTH, -Math.cos(am), 0, -Math.sin(am));
    HU.faceW(i0, i1, t1, t0, GRASS, 0, 1, 0); HU.faceW(t0, t1, o1, o0, i % 2 ? GRASS : EARTH, Math.cos(am), 0.8, Math.sin(am));
    const m0 = P(am, R0 + 0.35, 1.0);   // a row of sandbags along the lip
    HU.push(m0[0], m0[1], m0[2], -am - Math.PI / 2); for (let k = 0; k < 3; k++) HU.box(-0.85 + k * 0.6, 0, 0, 0.56, 0.28, 0.4, k % 2 ? SAND : SAND2, 1); HU.pop();
    // RUNAWAY: a ring of leaning ceramic plates
    if (i % 2 === 0) { const p = P(am, R0 + 0.4, -0.2); RW.push(p[0], p[1], p[2], -am + Math.PI / 2, -0.25, 0); RW.box(0, 0, 0, 2.2, 1.6, 0.25, i % 4 ? CER : CER2, 1); RW.pop(); const q = P(am, R0 + 0.25, 1.35); GL.strut([q[0] - Math.sin(am) * 0.9, q[1], q[2] + Math.cos(am) * 0.9], [q[0] + Math.sin(am) * 0.9, q[1], q[2] - Math.cos(am) * 0.9], 0.06, WHITE); }
  }
  // ready-use ammunition and a camouflage-netted crew shelter outside the ring, away from the pad
  const ba = gapA + Math.PI, bx = Math.cos(ba) * (R1 + 2.2), bz = Math.sin(ba) * (R1 + 2.2), by = h(ba, R1 + 2.2);
  HU.push(bx, by, bz, -ba); for (let k = 0; k < 5; k++) HU.box(-1.2 + (k % 3) * 0.9, Math.floor(k / 3) * 0.32, 0, 0.8, 0.3, 0.45, k % 2 ? OD : OD2, 1); HU.pop();
  const ca = gapA + Math.PI * 0.6, cx = Math.cos(ca) * (R1 + 3.5), cz = Math.sin(ca) * (R1 + 3.5), cy = h(ca, R1 + 3.5);
  HU.push(cx, cy, cz, -ca); camoNet(HU, 0, 0, 3.2, 3.2, 2.0, r); HU.box(0, 0, 0, 2.2, 0.9, 1.8, OD2, 1); HU.pop();
  HU.pop(); RW.pop(); GL.pop();
  }
  HU.weatherAll(-1, 1.6, 0.22, 0.08);
  const hu = mesh(HU), glowMat = mats().glow.clone(), rw = new THREE.Group(); rw.add(mesh(RW), new THREE.Mesh(geoFrom(GL.build()), glowMat));
  g.add(hu, rw); hu.visible = false; rw.visible = false;
  g.userData = { setSide(side) { hu.visible = side === 1; rw.visible = side === 2; } };
  return g;
}
// ------------------------------------------------------------------------------------------- the four kinds
// each returns { human: { solid: Geo, mil: Geo, civ: Geo, parts }, rw: { solid, glow, parts }, ruinH: Geo, ruinR: Geo,
//                shards: Geo, damageH: Geo, h, r, stackTops }
function buildHQ(r) {
  const H = new Geo(), mil = new Geo(), civ = new Geo(), dmg = new Geo();
  berm(H, 0, -1, 17, 13, 11, 8, -0.5, 3.0);                       // the bunker under its earth berm
  H.box(0, -0.4, 5.4, 8.4, 3.0, 1.4, CONC, 1); H.box(0, 2.6, 5.4, 8.8, 0.35, 1.8, CONC2, 0);   // concrete face
  H.quad([-1.0, 0, 6.12], [1.0, 0, 6.12], [1.0, 2.2, 6.12], [-1.0, 2.2, 6.12], col(0x3a3e36));  // blast door
  for (const x of [-3, 3]) H.quad([x - 0.8, 1.5, 6.12], [x + 0.8, 1.5, 6.12], [x + 0.8, 1.75, 6.12], [x - 0.8, 1.75, 6.12], BLACK);   // embrasures
  H.box(0, 0, 6.3, 2.4, 0.15, 1.2, CONC2, 1);
  // the hut on top: a prefab cabin with windows and a door
  H.push(-1, 3, -1.5); H.box(0, 0, 0, 6.2, 2.6, 2.6, OD2, 1); H.box(0, 2.6, 0, 6.5, 0.15, 2.9, DARK, 0);
  for (const x of [-2, 0, 2]) H.quad([x - 0.5, 1.0, 1.32], [x + 0.5, 1.0, 1.32], [x + 0.5, 1.9, 1.32], [x - 0.5, 1.9, 1.32], col(0x2b3846));
  H.quad([2.5, 0, 1.32], [3.0, 0, 1.32], [3.0, 2.1, 1.32], [2.5, 2.1, 1.32], col(0x3a3e36)); H.pop();
  // antennas: a guyed lattice mast and two whips; HF wire to the mast
  const mast = new Geo(); for (let i = 0; i < 4; i++) mast.strut([3.5 + (i % 2) * 0.5, 3 + (i >> 1) * 0, -2.5 + (i >> 1) * 0.5], [3.75, 15, -2.25], 0.08, STEEL);
  for (let y = 4; y < 15; y += 2) mast.box(3.75, y, -2.25, 0.5, 0.06, 0.5, STEEL, 0);
  mast.strut([-3.6, 3, -2.2], [-3.6, 10, -2.2], 0.05, DARK); mast.strut([1.6, 5.6, -1.6], [1.6, 12, -1.6], 0.04, DARK);
  // flag pole at the front corner (the flag itself is a separate, team-coloured mesh)
  H.cyl(-5.4, 0, 6.6, 0.07, 9.5, 5, WHITE, 0); H.cyl(-5.4, 9.5, 6.6, 0.14, 0.14, 6, col(0xd8b030), 2);
  stripe(H, 0, 2.95, 6.16, 8.8, 0.25, 0.02, WHITE);   // the band above the door (team colour mesh sits on it)
  // the task force's clutter: sandbagged entrance, jeep, M35 under a camo net, generator, drums, floodlight
  sandbags(mil, -4.5, 7.2, -1.4, 7.6, 3, r); sandbags(mil, 1.4, 7.6, 4.5, 7.2, 3, r); sandbags(mil, -6.5, 3, -6.8, 7, 2, r);
  jeep(mil, 7.5, 6.5, 0.3); deuce(mil, -9.5, 1.5, 0.1); camoNet(mil, -9.5, 1.0, 5, 8.5, 3.6, r); generator(mil, 7, 1.5, 1.2); drums(mil, 8.5, -2, 5, r); floodlight(mil, 6.5, -5);
  // the islanders': a Land Rover, a notice board, flower tubs
  landRover(civ, 7, 6, 0.4); civ.cyl(4.5, 0, 7.5, 0.06, 1.6, 4, WOODC, 0); civ.box(4.5, 1.2, 7.5, 1.4, 0.9, 0.06, col(0x2a5a2a), 0);
  for (const x of [-3.5, 3.5]) { civ.cyl(x, 0, 7.6, 0.45, 0.5, 8, CONC2, 2); civ.blob(x, 0.75, 7.6, 0.45, 0.3, 0.45, col(0xc84a6a), col(0x4a8a3a)); }
  // damage: scorched face, the hut's roof blown, sandbags scattered
  dmg.box(-1.5, 0.6, 6.13, 3.2, 1.6, 0.03, CHAR, 1); dmg.box(-1, 5.65, -1.5, 3.5, 0.06, 2.7, CHAR, 0); dmg.box(2.3, 2.9, 5.0, 2.5, 0.2, 1.4, CHAR2, 1);
  dmg.strut([3.75, 3, -2.25], [11, 1.2, -7], 0.12, STEEL); dmg.strut([-3.6, 3, -2.2], [-3.2, 7, -2.0], 0.05, DARK);   // the mast blown over
  // ruin: the berm cratered, the face collapsed, the hut a burnt frame, vehicles burnt out
  const ruin = new Geo(); berm(ruin, 0, -1, 17, 13, 10, 7, -0.5, 1.8, col(0x4a4434), col(0x3e3a2e));
  for (let i = 0; i < 9; i++) ruin.push((r() - 0.5) * 9, 0, 4 + r() * 3, r() * 6, (r() - 0.5) * 0.6, (r() - 0.5) * 0.6).box(0, -0.2, 0, 0.8 + r() * 2.2, 0.4 + r() * 1.0, 0.6 + r() * 1.2, r() < 0.5 ? CONC2 : CHAR2, 1).pop();
  ruin.push(-1, 1.8, -1.5, 0.3, 0.25, 0.1).box(0, 0, 0, 6, 0.9, 2.6, CHAR, 1).pop(); ruin.strut([3.5, 1.5, -2.5], [12, 0.3, -4], 0.15, CHAR);   // the mast fell
  ruin.cyl(-5.4, 0, 6.6, 0.07, 4.5, 5, CHAR, 0);
  return { H, mil, civ, mast, dmg, ruin, flagAt: [-5.4, 9.2, 6.6], bandAt: [0, 2.95, 6.2, 8.8], h: 12, r: 8, rw: rwHQ(r) };
}
function rwHQ(r) {
  const S = new Geo(), G = new Geo();
  hexPlinth(S, 0, 0, 7.5, 0.8, COMP);
  slab(S, -1, 0, 7, 6, 14, 1.2, -0.6, 0.55, CER);                 // the main monolith, leaning
  slab(S, 3.6, 1.4, 3.2, 3.6, 6.5, -0.5, 0.4, 0.6, COMP2, CER2); // a dark annex
  slab(S, -4.2, -2, 2.4, 2.4, 4.5, 0.4, 0.3, 0.5, CER2);
  S.box(0.2, 14, -0.6, 2.4, 0.4, 2.0, COMP, 0);                   // sensor head
  for (let i = 0; i < 3; i++) S.push(-0.5 + i * 0.7, 14.4, -0.6 + (i - 1) * 0.4).blob(0, 0.3, 0, 0.32, 0.32, 0.32, COMP2, DARK).pop();
  for (const s of [-1, 1]) S.push(s * 2.6, 4, 0, 0, 0, s * 0.35).box(0, 0, 0, 0.12, 6, 2.6, COMP, 1).pop();   // fins
  // seams: up the monolith's edges and round the plinth
  for (const [x, z] of [[-4.5, -3], [2.5, -3], [2.5, 3], [-4.5, 3]]) seam(G, [x, 0.8, z], [x * 0.55 + 0.2, 14, z * 0.55 - 0.6], 0.08);
  for (let i = 0; i < 6; i++) { const a0 = i / 6 * Math.PI * 2, a1 = (i + 1) / 6 * Math.PI * 2; seam(G, [Math.cos(a0) * 7.6, 0.85, -Math.sin(a0) * 7.6], [Math.cos(a1) * 7.6, 0.85, -Math.sin(a1) * 7.6], 0.1); }
  for (let i = 0; i < 3; i++) G.push(-0.5 + i * 0.7, 14.45, -0.27 + (i - 1) * 0.4).box(0, 0, 0, 0.12, 0.12, 0.12, WHITE, 0).pop();
  const ruin = new Geo(); hexPlinth(ruin, 0, 0, 7.5, 0.6, DEADC);
  slab(ruin, -1, 0, 7, 6, 3.8, 0.4, -0.2, 0.75, DEADC); for (let i = 0; i < 7; i++) shard(ruin, -1 + (r() - 0.5) * 6, (r() - 0.5) * 5, 1.5 + r() * 3.5, 1 + r(), (r() - 0.5) * 0.8, r() * 6, i % 2 ? DEADC : COMP);
  const core = new Geo(); core.push(0, 0, 0).blob(0, 0, 0, 0.9, 1.5, 0.9, WHITE).pop();   // the node's core, floating over it
  return { S, G, ruin, core, coreAt: [0.2, 17.5, -0.6] };
}
function buildFuel(r) {
  const H = new Geo(), mil = new Geo(), civ = new Geo(), dmg = new Geo();
  // the bund: a low earth wall round three tanks
  for (const [x, z, w, d] of [[0, -6.5, 17, 1.6], [0, 6.5, 17, 1.6], [-8.3, 0, 1.6, 11.4], [8.3, 0, 1.6, 11.4]]) berm(H, x, z, w + 1.2, d + 1.2, w - 0.4, d * 0.4, -0.3, 1.2);
  const tanks = [[-4.5, -2.2], [1.2, -2.2], [-1.6, 3.0]];
  for (const [x, z] of tanks) {
    H.cyl(x, -0.2, z, 2.6, 0.45, 12, CONC, 2);
    H.cyl(x, 0.25, z, 2.3, 4.4, 12, col(0xd8d8cc), 0); H.cyl(x, 4.65, z, 2.3, 0.5, 12, col(0xc8c8bc), 2, 1.5);   // shell and cone roof
    H.strut([x + 2.32, 0.3, z], [x + 2.32, 4.7, z], 0.06, STEEL); for (let y = 0.6; y < 4.6; y += 0.45) H.box(x + 2.4, y, z, 0.04, 0.04, 0.5, STEEL, 0);   // ladder
  }
  // pipes on stands to the pump house; the pump house
  for (const [x, z] of tanks) { H.push(x, 0.9, z); H.strut([0, 0, 0], [5.8 - x, 0, 5.5 - z], 0.24, STEEL); H.pop(); }
  H.push(6, 0, 5.5); H.box(0, 0, 0, 4.2, 2.8, 3.2, col(0xc8c0a8), 1); H.gable(0, 2.8, 0, 4.2, 3.2, 0.7, col(0x7d8288), col(0xc8c0a8), 0.2); H.quad([-0.6, 0, 1.62], [0.6, 0, 1.62], [0.6, 2.0, 1.62], [-0.6, 2.0, 1.62], col(0x2f5a3a)); H.pop();
  H.box(0, 0.6, -7.8, 3, 0.15, 0.6, WHITE, 0);   // sign board base
  // the pumpjack (nodding donkey) beside the farm: frame, samson post, motor; the walking beam is a separate part
  H.push(-3, 0, -11); H.box(0, 0, 0, 1.6, 0.5, 6.5, STEEL, 1); for (const s of [-1, 1]) H.strut([s * 0.6, 0.5, 0.6], [0, 4.6, 0], 0.16, col(0x8a7a2a)); H.box(0, 0.5, -2.5, 1.3, 1.1, 1.4, col(0x3a5a3a), 1); H.cyl(0, 0, 3.0, 0.2, 1.0, 6, STEEL, 2); H.pop();
  const beam = new Geo(); beam.box(-0.2, -0.25, 0, 0.4, 0.5, 6.0, col(0xd0a020), 0); beam.push(0, 0, 3.0).box(0, -1.4, 0.2, 0.5, 1.8, 0.8, col(0xd0a020), 1).pop(); beam.box(0, -1.2, -2.8, 0.6, 1.0, 0.9, DARK, 0);
  // military: guard post with sandbags, a fuel bowser, drums
  sandbags(mil, 4, -12, 7, -12, 3, r); sandbags(mil, 7, -12, 7, -9, 3, r); deuce(mil, 6.5, -15, Math.PI / 2, false); mil.push(6.5, 0, -15, Math.PI / 2).push(0, 0, 0, Math.PI / 2).cylX(1.0, 1.7, 0, 1.0, 4.0, 10, OD2, OD).pop().pop(); drums(mil, -9, -10, 6, r); floodlight(mil, 10, 8);
  civ.push(6.5, 0, -15, Math.PI / 2).box(0, 0.5, 2.2, 2.2, 1.9, 1.7, col(0xe8e4d8), 1).push(0, 0, 0, Math.PI / 2).cylX(0.8, 1.6, 0, 1.1, 4.4, 10, col(0xd8d8cc), WHITE).pop().pop(); drums(civ, -9, -10, 4, r, col(0x2a5a8a));
  dmg.cyl(-4.5, 1.5, -2.2, 2.33, 1.6, 12, CHAR, 0); dmg.box(6, 2.85, 5.5, 4.4, 0.08, 3.4, CHAR, 0);
  const ruin = new Geo();
  for (const [x, z, w, d] of [[0, -6.5, 17, 1.6], [0, 6.5, 17, 1.6], [-8.3, 0, 1.6, 11.4], [8.3, 0, 1.6, 11.4]]) berm(ruin, x, z, w + 1.2, d + 1.2, w - 0.4, d * 0.4, -0.3, 1.0, col(0x4a4434), col(0x3e3a2e));
  ruin.cyl(-4.5, 0, -2.2, 2.3, 1.6, 12, CHAR, 0); ruin.push(1.2, 1.4, -2.2, 0.6, 0, Math.PI / 2 - 0.15).cyl(0, -2.2, 0, 2.2, 4.4, 10, CHAR2, 0).pop(); ruin.cyl(-1.6, 0, 3.0, 2.3, 2.6, 12, CHAR, 0, 1.9);
  ruin.push(6, 0, 5.5).box(0, 0, 0, 4.2, 1.2, 3.2, CHAR2, 1).pop(); ruin.push(-3, 0, -11, 0, 0, 0.5).box(0, 0, 0, 1.6, 0.5, 6.5, CHAR, 1).pop();
  return { H, mil, civ, beam, beamAt: [-3, 4.6, -11], dmg, ruin, flagAt: null, bandAt: [0, 0.75, -7.85, 3], h: 8, r: 9, rw: rwFuel(r) };
}
function rwFuel(r) {
  const S = new Geo(), G = new Geo();
  hexPlinth(S, 0, 0, 6.5, 0.5, COMP);
  S.cyl(0, 0.5, 0, 1.6, 14, 6, CER, 0, 0.7); S.cyl(0, 14.5, 0, 0.7, 2.5, 6, COMP, 2, 0.05);   // the spire
  for (const [x, z] of [[-4.6, 2], [4.4, 1.6]]) { for (let k = 0; k < 3; k++) S.strut([x + Math.cos(k * 2.1) * 1.8, 0.5, z + Math.sin(k * 2.1) * 1.8], [x, 2.4, z], 0.18, COMP2); S.push(x, 3.6, z).blob(0, 0, 0, 2.3, 2.1, 2.3, COMP2, COMP).pop(); }
  for (const [x, z] of [[-4.6, 2], [4.4, 1.6]]) S.strut([x * 0.3, 1.0, z * 0.3], [x, 2.6, z], 0.35, COMP);
  for (let y = 3; y < 14; y += 2.6) G.cyl(0, y, 0, 1.6 - y * 0.065 + 0.08, 0.18, 6, WHITE, 0, 1.6 - y * 0.065 + 0.06);
  for (const [x, z] of [[-4.6, 2], [4.4, 1.6]]) G.cyl(x, 3.5, z, 2.36, 0.2, 10, WHITE, 0);
  G.push(0, 16.6, 0).blob(0, 0, 0, 0.35, 0.6, 0.35, WHITE).pop();
  const ruin = new Geo(); hexPlinth(ruin, 0, 0, 6.5, 0.4, DEADC); ruin.cyl(0, 0.5, 0, 1.6, 4.5, 6, DEADC, 2, 1.2); ruin.push(3, 0.8, -2, 0, 0, 1.35).cyl(0, 0, 0, 1.2, 8, 6, DEADC, 3, 0.7).pop();
  ruin.push(-4.6, 1.2, 2).blob(0, 0, 0, 2.2, 1.4, 2.2, COMP, DEADC).pop(); for (let i = 0; i < 5; i++) shard(ruin, (r() - 0.5) * 10, (r() - 0.5) * 9, 1 + r() * 2.5, 0.8 + r(), (r() - 0.5), r() * 6, DEADC);
  return { S, G, ruin };
}
function buildDepot(r) {
  const H = new Geo(), mil = new Geo(), civ = new Geo(), dmg = new Geo();
  const quonset = (g, x, z, len, c) => {   // half-cylinder hut along local z, end walls with door and windows
    g.push(x, 0, z, 0, Math.PI / 2, 0); for (let i = 0; i < 9; i++) { const a0 = i / 9 * Math.PI, a1 = (i + 1) / 9 * Math.PI; g.quad([Math.cos(a0) * 3.1, -len / 2, -Math.sin(a0) * 3.1], [Math.cos(a1) * 3.1, -len / 2, -Math.sin(a1) * 3.1], [Math.cos(a1) * 3.1, len / 2, -Math.sin(a1) * 3.1], [Math.cos(a0) * 3.1, len / 2, -Math.sin(a0) * 3.1], i % 2 ? c : shade(c, 0.92)); } g.pop();
    for (const s of [-1, 1]) { for (let i = 0; i < 9; i++) { const a0 = i / 9 * Math.PI, a1 = (i + 1) / 9 * Math.PI; g.tri([x, 0, z + s * len / 2], [x + Math.cos(s > 0 ? a0 : a1) * 3.1, Math.sin(s > 0 ? a0 : a1) * 3.1, z + s * len / 2], [x + Math.cos(s > 0 ? a1 : a0) * 3.1, Math.sin(s > 0 ? a1 : a0) * 3.1, z + s * len / 2], col(0x8a8676)); } g.quad([x - 0.8, 0, z + s * (len / 2 + 0.03)], [x + 0.8, 0, z + s * (len / 2 + 0.03)], [x + 0.8, 2.1, z + s * (len / 2 + 0.03)], [x - 0.8, 2.1, z + s * (len / 2 + 0.03)], s > 0 ? col(0x3a3e36) : col(0x2b3846)); }
  };
  quonset(H, -5, -1, 12, col(0x6a6e5a)); quonset(H, 3, -2, 10, col(0x727664));
  H.push(4, 0, 6.5); H.box(0, 0, 0, 8, 4, 5.5, col(0xa8a290), 1); H.gable(0, 4, 0, 8, 5.5, 1.2, col(0x7d8288), col(0xa8a290), 0.3); H.quad([-3, 0, 2.77], [0, 0, 2.77], [0, 3.2, 2.77], [-3, 3.2, 2.77], col(0xc8c4b0)); for (const x of [1.5, 3]) H.quad([x - 0.5, 1.2, 2.77], [x + 0.5, 1.2, 2.77], [x + 0.5, 2.2, 2.77], [x - 0.5, 2.2, 2.77], col(0x2b3846)); H.cyl(3, 4.6, -1.5, 0.15, 2.4, 5, DARK, 2); H.pop();
  crates(H, -9, 7, r, 9); crates(H, -5.5, 8.5, r, 6); H.box(-11, 0, 3, 1.2, 0.15, 1.2, WOODC, 1);
  // military: an M35, a forklift, drums, sandbags at the gate, a floodlight
  deuce(mil, 0, -12, Math.PI / 2 - 0.1); mil.push(-1, 0, 8).box(0, 0.3, 0, 1.2, 1.1, 2.0, col(0xc8a020), 1).box(0, 1.4, 0.3, 1.0, 1.1, 0.06, DARK, 0).box(0, 0.2, 1.4, 1.0, 0.08, 1.0, STEEL, 0).pop();
  drums(mil, 9, 6, 6, r); sandbags(mil, -12, -8, -9, -8, 2, r); floodlight(mil, 11, 8);
  civ.push(0, 0, -12, Math.PI / 2 - 0.1).box(0, 0.5, 1.6, 2.2, 1.8, 1.6, col(0x2a5a8a), 1).box(0, 0.6, -1.2, 2.4, 2.2, 4.0, col(0xd8d4c8), 1).pop();   // a box van
  dmg.push(-5, 0, -1).box(0, 2.2, 0, 4.5, 0.9, 12.2, CHAR, 0).pop(); dmg.box(4, 4.05, 6.5, 8.3, 0.1, 5.8, CHAR, 0);
  const ruin = new Geo();
  ruin.push(-5, 0, -1).box(0, 0, 0, 6.2, 1.0, 12, CHAR, 1).pop(); ruin.push(3, 0, -2, 0.2).box(0, 0, 0, 6.2, 1.4, 10, CHAR2, 1).pop();
  ruin.push(4, 0, 6.5).box(-2, 0, 0, 4, 1.6, 5.5, CHAR2, 1).box(2.5, 0, 1, 3, 0.9, 3, CHAR, 1).pop();
  for (let i = 0; i < 12; i++) ruin.push(-9 + r() * 6, 0, 6 + r() * 4, r() * 6).box(0, 0, 0, 0.6 + r(), 0.3 + r() * 0.4, 0.6 + r(), r() < 0.5 ? CHAR : ASH, 1).pop();
  return { H, mil, civ, dmg, ruin, flagAt: null, bandAt: [-5, 4.0, 5.05, 4], h: 9, r: 9, stackTops: [[7, 7.2, 5]], rw: rwFab(r) };
}
function rwFab(r) {
  const S = new Geo(), G = new Geo();
  hexPlinth(S, 0, 0, 9, 0.5, COMP);
  S.box(0, 0.5, 0, 13, 4.5, 9, COMP, 1);
  S.push(0, 5, 0); slab(S, 0, 0, 13, 9, 3.5, -1, 0.5, 0.75, CER, CER2); S.pop();   // the sloped ceramic roof shell
  S.quad([-3, 0.6, 4.55], [3, 0.6, 4.55], [2.4, 4.2, 4.55], [-2.4, 4.2, 4.55], BLACK);   // the maw
  for (const x of [-5, 5]) S.strut([x, 5, -3], [x, 10, -3], 0.4, COMP2); S.box(0, 10, -3, 11, 0.6, 0.8, COMP2, 0);   // gantry
  for (const [x, z] of [[4.5, -2.5], [5.6, 1.5]]) S.cyl(x, 4, z, 0.55, 3.0, 6, COMP2, 2, 0.4);   // vents
  for (let i = 0; i < 7; i++) S.cyl(-8 + (i % 3) * 1.3, Math.floor(i / 3) * 0.9, 6 + (i % 2) * 0.6, 0.6, 0.85, 6, CER2, 2);   // printed stock
  seam(G, [-3, 0.6, 4.6], [-2.4, 4.2, 4.6]); seam(G, [3, 0.6, 4.6], [2.4, 4.2, 4.6]); seam(G, [-2.4, 4.2, 4.6], [2.4, 4.2, 4.6]);
  for (const s of [-1, 1]) seam(G, [s * 6.5, 0.6, 4.55], [s * 6.5, 5, 4.55], 0.06);
  const arm = new Geo(); arm.box(0, -3.4, 0, 0.5, 3.4, 0.5, COMP2, 0); arm.push(0, -3.6, 0).blob(0, 0, 0, 0.5, 0.35, 0.5, CER, COMP).pop();
  const ruin = new Geo(); hexPlinth(ruin, 0, 0, 9, 0.4, DEADC); ruin.box(0, 0.5, 0, 13, 2.2, 9, DEADC, 1); ruin.push(2, 2.7, 0, 0, 0.3, 0.2).box(0, 0, 0, 9, 0.6, 7, COMP, 1).pop(); ruin.strut([-5, 0.5, -3], [-1, 3, -6], 0.4, COMP);
  for (let i = 0; i < 6; i++) shard(ruin, (r() - 0.5) * 14, (r() - 0.5) * 10, 1 + r() * 2.5, 1 + r(), (r() - 0.5), r() * 6, DEADC);
  return { S, G, ruin, arm, armAt: [0, 10, -3], stackTops: [[4.5, 7.6, -2.5], [5.6, 7.6, 1.5]] };
}
function buildRadar(r) {
  const H = new Geo(), mil = new Geo(), civ = new Geo(), dmg = new Geo();
  // the antenna's trailer / shelter with its pedestal; the array itself rotates (separate)
  H.push(0, 0, 0); H.box(0, 0.9, 0, 2.5, 2.2, 6.2, OD2, 1); for (const s of [-1, 1]) for (const z of [-1.6, -0.5]) H.push(s * 1.1, 0.5, z, 0, 0, Math.PI / 2).cyl(0, -0.15, 0, 0.5, 0.3, 8, BLACK, 0).pop(); H.box(0, 0.2, 3.6, 0.3, 0.3, 1.6, STEEL, 0);
  for (const [x, z] of [[-1.4, -2.8], [1.4, -2.8], [-1.4, 2.8], [1.4, 2.8]]) H.strut([x, 0, z], [x * 0.85, 0.9, z * 0.95], 0.18, STEEL);   // jacks
  H.cyl(0, 3.1, 0, 0.7, 1.0, 8, STEEL, 2); H.pop();
  // radome on a short tower
  H.push(-9, 0, -3); H.cyl(0, 0, 0, 2.2, 3.2, 8, col(0xb8b8b0), 2); H.push(0, 5.4, 0).blob(0, 0, 0, 2.9, 2.6, 2.9, col(0xf0f0ea), col(0xe4e4dc)).pop(); H.pop();
  // operations shelters on trucks, cables
  deuce(H, 7.5, -4, Math.PI / 2, false); H.push(7.5, 0, -4, Math.PI / 2).box(0, 1.25, -1.0, 2.2, 2.0, 3.6, col(0xc8c4b4), 1).pop();
  H.push(7.5, 0, 4, Math.PI / 2).box(0, 0, 0, 2.2, 2.2, 3.6, col(0xc8c4b4), 1).pop();
  for (const [x, z] of [[1.3, 0], [5, -4], [5, 4]]) H.box(x + 1.2, 0.02, z, 2.4, 0.05, 0.1, BLACK, 1);
  // the array: a planar lattice ~6.7 x 4.3 m tilted back, with its feed row
  const ant = new Geo(); ant.push(0, 0.6, 0, 0, -0.22, 0); for (let i = 0; i <= 6; i++) ant.strut([-3.35 + i * 1.117, 0, 0], [-3.35 + i * 1.117, 4.3, 0], 0.09, col(0x5a6066)); for (let j = 0; j <= 5; j++) ant.strut([-3.35, j * 0.86, 0], [3.35, j * 0.86, 0], 0.07, col(0x5a6066));
  ant.box(0, 0, 0.05, 6.8, 4.3, 0.08, col(0x3a4046), 1, col(0x3a4046)); ant.pop(); ant.box(0, 0, -0.9, 1.2, 0.8, 1.6, STEEL, 0); ant.box(0, -0.3, 1.2, 6.2, 0.4, 0.4, col(0x5a6066), 0);
  sandbags(mil, -4, 5, -1, 6.5, 2, r); sandbags(mil, 1, 6.5, 4, 5, 2, r); generator(mil, -4, 4.5, 0.4); jeep(mil, -4, -8, 1.2); camoNet(mil, 7.5, -4, 4.5, 6, 4.2, r);
  landRover(civ, -4, -8, 1.2);
  dmg.push(-9, 0, -3).blob(1.4, 6.2, 1, 1.6, 1.3, 1.6, CHAR, CHAR2).pop(); dmg.box(7.5, 3.3, 4, 3.7, 0.05, 2.3, CHAR, 0);
  const ruin = new Geo(); ruin.box(0, 0, 0, 2.5, 1.2, 6.2, CHAR, 1); ruin.push(2.5, 0.4, 3, 0.8, 1.1, 0.2).box(0, 0, 0, 6.6, 0.2, 4.2, CHAR2, 1).pop();
  ruin.push(-9, 0, -3).cyl(0, 0, 0, 2.2, 3.2, 8, CHAR2, 2).blob(0, 3.6, 0, 2.6, 1.0, 2.6, CHAR, ASH).pop(); ruin.push(7.5, 0, 4, Math.PI / 2 + 0.3, 0, 0.35).box(0, 0, 0, 2.2, 1.6, 3.6, CHAR, 1).pop();
  return { H, mil, civ, dmg, ruin, ant, antAt: [0, 4.1, 0], flagAt: null, bandAt: [0, 2.1, 3.12, 2.4], h: 9, r: 8, rw: rwSpire(r) };
}
function rwSpire(r) {
  const S = new Geo(), G = new Geo();
  hexPlinth(S, 0, 0, 5, 0.5, COMP);
  for (let k = 0; k < 3; k++) { const a = k * 2.094; S.strut([Math.cos(a) * 4.2, 0.5, Math.sin(a) * 4.2], [Math.cos(a) * 0.6, 7, Math.sin(a) * 0.6], 0.45, COMP2); }
  S.cyl(0, 0.5, 0, 1.1, 18, 6, CER, 0, 0.45); S.cyl(0, 18.5, 0, 0.45, 1.6, 6, COMP, 2, 0.1);
  for (let k = 0; k < 3; k++) { const a = k * 2.094 + 1.05; seam(G, [Math.cos(a) * 1.05, 1, Math.sin(a) * 1.05], [Math.cos(a) * 0.48, 18.3, Math.sin(a) * 0.48], 0.07); }
  G.push(0, 20.6, 0).blob(0, 0, 0, 0.45, 0.9, 0.45, WHITE).pop();
  const ring = new Geo(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ring.push(Math.cos(a) * 2.6, 0, -Math.sin(a) * 2.6, a + Math.PI / 2).box(0, -0.6, 0, 1.3, 1.2, 0.12, COMP2, 0).pop(); ring.strut([0, 0, 0], [Math.cos(a) * 2.5, 0, -Math.sin(a) * 2.5], 0.08, COMP); }
  const ruin = new Geo(); hexPlinth(ruin, 0, 0, 5, 0.4, DEADC); ruin.cyl(0, 0.5, 0, 1.1, 5, 6, DEADC, 2, 0.95); ruin.push(2, 1.0, 1, 0.4, 0, 1.4).cyl(0, 0, 0, 0.95, 12, 6, DEADC, 3, 0.45).pop();
  for (let k = 0; k < 3; k++) { const a = k * 2.094; ruin.strut([Math.cos(a) * 4.2, 0.5, Math.sin(a) * 4.2], [Math.cos(a) * 1.8, 3, Math.sin(a) * 1.8], 0.45, COMP); }
  return { S, G, ruin, ring, ringAt: [0, 13, 0] };
}

// ------------------------------------------------------------------------------------------- the site
const BUILD = { hq: buildHQ, fuel: buildFuel, factory: buildDepot, radar: buildRadar };
let siteSeed = 1;
export function buildFactionStructure(kind, side) {
  const M = mats(), r = rng((siteSeed++) * 7919), B = BUILD[kind](r);
  // ngc/world-polish: a sentry box by the way in, weathering (grime up the walls, every face a shade off), and the
  // perimeter fence once the site knows where it stands (tick)
  sentryBox(B.mil, -(B.r + 4.5), B.r * 0.7 + 1, r);
  for (const k of ['H', 'mil', 'civ', 'ruin', 'dmg']) if (B[k]) B[k].weatherAll(0, 1.2, 0.3, 0.06);
  if (B.rw && B.rw.S) B.rw.S.weatherAll(0, 0.9, 0.12, 0.03);
  const g = new THREE.Group();
  const team = new THREE.MeshLambertMaterial({ color: TEAMC[side] ?? 0x888888 });
  // ---- 1980
  const human = new THREE.Group(), hIntact = new THREE.Group(), hRuin = mesh(B.ruin), hDmg = mesh(B.dmg); g.add(human); human.add(hIntact, hRuin, hDmg);
  hIntact.add(mesh(B.H)); const mil = mesh(B.mil), civ = mesh(B.civ); hIntact.add(mil, civ);
  let mast = null, flag = null, beam = null, ant = null;
  if (B.mast) { mast = mesh(B.mast); hIntact.add(mast); }
  if (B.flagAt) {   // the flag: team colour with a white canton stripe, on a pivot at the pole
    flag = new THREE.Group(); flag.position.set(...B.flagAt); hIntact.add(flag);
    const f = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 0.05), team); f.position.set(1.22, -0.7, 0); flag.add(f);
    const s = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.3, 0.06), M.flagW); s.position.set(1.22, -0.7, 0); flag.add(s);
  }
  if (B.bandAt) { const [x, y, z, w] = B.bandAt, b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.32, 0.08), team); b.position.set(x, y, z); hIntact.add(b); }
  if (B.beam) { beam = new THREE.Group(); beam.position.set(...B.beamAt); beam.add(mesh(B.beam)); hIntact.add(beam); }
  if (B.ant) { ant = new THREE.Group(); ant.position.set(...B.antAt); ant.add(mesh(B.ant)); hIntact.add(ant); }
  // ---- RUNAWAY
  const R = B.rw, rw = new THREE.Group(), rIntact = new THREE.Group(), rRuin = mesh(R.ruin), glowMat = M.glow.clone(); g.add(rw); rw.add(rIntact, rRuin);
  rIntact.add(mesh(R.S)); const glow = new THREE.Mesh(geoFrom(R.G.build()), glowMat); rIntact.add(glow);
  let ring = null, arm = null;
  if (R.ring) { ring = new THREE.Group(); ring.position.set(...R.ringAt); ring.add(mesh(R.ring)); rIntact.add(ring); }
  let core = null; if (R.core) { core = new THREE.Mesh(geoFrom(R.core.build()), glowMat); core.position.set(...R.coreAt); rIntact.add(core); }
  if (R.arm) { arm = new THREE.Group(); arm.position.set(...R.armAt); arm.add(mesh(R.arm)); rIntact.add(arm); }
  const rTeam = new THREE.Mesh(new THREE.CylinderGeometry(B.r * 0.95, B.r * 0.95, 0.2, 6, 1, true), team); rTeam.position.y = 0.95; rIntact.add(rTeam);   // a red band round the plinth: readable ownership
  // shards left round a site the machines lost
  const shards = new Geo(); for (let i = 0; i < 7; i++) { const a = r() * 6.28, d = B.r + 2 + r() * 4; shard(shards, Math.cos(a) * d, Math.sin(a) * d, 1 + r() * 2.2, 0.8 + r() * 0.8, (r() - 0.5) * 0.9, r() * 6, i % 2 ? DEADC : COMP); }
  const rShards = mesh(shards); g.add(rShards);

  const st = { side, style: side === 2 ? 'rw' : 'human', cond: 'intact', grow: 1, hadRW: false, hp: 1, flicker: 0, smoke: null, fx: null, s: null, t: 0 };
  const ud = { team, kind, h: B.h, r: B.r + 1, stackTops: B.stackTops || R.stackTops || null, faction: true };
  function apply() {
    const H = st.style === 'human', dead = st.cond === 'destroyed', dmg = st.cond === 'damaged';
    human.visible = H || st.side === 2;   // under a machine site the 1980 ruin stays
    hIntact.visible = H && !dead; hRuin.visible = (H && dead) || (!H); hDmg.visible = H && dmg;
    rw.visible = !H; rIntact.visible = !H && !dead; rRuin.visible = !H && dead;
    rShards.visible = H && st.hadRW;
    mil.visible = st.side === 1; civ.visible = st.side === 0;
    if (flag) flag.visible = !dmg;
    if (mast) mast.visible = !dmg;   // shot away (a fallen one is in the damage geometry)
    glow.material = dead ? M.glowDead : glowMat;
  }
  ud.setSide = side => {
    const was = st.side; st.side = side;
    team.color.setHex(TEAMC[side] ?? 0x888888);
    if (side === 2 && st.style !== 'rw') { st.style = 'rw'; st.grow = 0; if (st.cond === 'destroyed') st.cond = 'intact'; }   // the machines build over the ruin
    else if (side !== 2 && st.style === 'rw') { st.style = 'human'; st.hadRW = true; st.cond = st.cond === 'destroyed' ? 'destroyed' : 'intact'; }
    apply();
  };
  ud.attach = ({ fx, s }) => { st.fx = fx; st.s = s; };
  ud.onHp = k => {
    st.hp = k;
    if (k < 0.5 && k > 0 && st.cond === 'intact') {
      st.cond = 'damaged'; apply();
      if (st.fx && st.s) { const e = st.fx.burn(st.s.x + (r() - 0.5) * 4, st.s.y + B.h * 0.5, st.s.z + (r() - 0.5) * 4, 6, 0.9); e.smoulder = 1e9; st.smoke = e; st.fx.scorch.add({ x: st.s.x + 3, y: st.s.y + 0.1, z: st.s.z + 2, size: 5, a: 0.8, tile: 0, n: new THREE.Vector3(0, 1, 0) }); }
    }
  };
  ud.setState = state => {
    if (state === 'destroyed') { st.cond = 'destroyed'; if (st.smoke) { st.smoke.smoulder = 90; st.smoke = null; } if (st.fx && st.s) for (let i = 0; i < 3; i++) st.fx.scorch.add({ x: st.s.x + (r() - 0.5) * B.r * 1.6, y: st.s.y + 0.1, z: st.s.z + (r() - 0.5) * B.r * 1.6, size: 4 + r() * 4, a: 0.9, tile: 0, n: new THREE.Vector3(0, 1, 0) }); }
    else { st.cond = 'intact'; st.hp = 1; if (st.smoke) { st.smoke.smoulder = 20; st.smoke = null; } if (st.style === 'rw') st.grow = 0; }
    apply();
  };
  let fenced = false;
  ud.tick = (dt, t) => {
    st.t = t;
    if (!fenced && GROUND.fn && st.s && st.s.I) { fenced = true; const f = buildFence(g, st.s.I, B.r + 4); if (f) hIntact.add(f); }   // ngc/world-polish
    if (flag && flag.visible) { flag.rotation.y = Math.sin(t * 2.1 + g.position.x) * 0.35 - 0.3; flag.children[0].rotation.y = Math.sin(t * 5 + g.position.z) * 0.08; }
    if (beam && hIntact.visible && st.cond !== 'destroyed') beam.rotation.x = Math.sin(t * 1.4 + g.position.x) * 0.28;
    if (ant && hIntact.visible && st.cond !== 'damaged') ant.rotation.y += dt * 1.25;   // ~12 rpm
    if (ring && rIntact.visible) ring.rotation.y -= dt * 2.2;
    if (core && rIntact.visible) { core.rotation.y += dt * 0.8; core.position.y = R.coreAt[1] + Math.sin(t * 1.3) * 0.4; }
    if (arm && rIntact.visible) arm.position.x = Math.sin(t * 0.7) * 4;
    if (rIntact.visible) {
      if (st.grow < 1) {   // growing out of the ground, seams blazing, sparks
        st.grow = Math.min(1, st.grow + dt / 9); rIntact.scale.set(1, Math.max(0.02, st.grow), 1);
        glowMat.color.setRGB(0.6 + 0.4 * Math.sin(t * 12), 1, 1);
        if (st.fx && st.s && Math.random() < dt * 14) st.fx.add.spawn(st.s.x + (Math.random() - 0.5) * B.r * 1.6, st.s.y + B.h * st.grow * Math.random() * 1.6, st.s.z + (Math.random() - 0.5) * B.r * 1.6, 0, 1.5, 0, 0.5, 0.6, 0.1, 0.5, 0.95, 1, 1);
      } else {
        const p = 0.75 + 0.25 * Math.sin(t * 1.7 + g.position.x * 0.1), f = st.cond === 'damaged' ? (Math.sin(t * 23) * Math.sin(t * 7.3) > 0.2 ? 0.25 : 1) : 1;
        glowMat.color.setRGB(0.56 * p * f, 0.96 * p * f, 1.0 * p * f);
      }
    }
  };
  ud.state = st;
  apply();
  if (side === 2) { st.style = 'rw'; apply(); }
  g.userData = ud;
  return g;
}

// ------------------------------------------------------------------------------------------- site dressing
// Not war targets: the helipad's windsock, edge lights and ops shack; the fortress collar over a cave shaft; the
// RUNAWAY power pylons that march across a machine-held island. world/life.js owns these and polls island owners.
export function buildPadDressing(r0 = 8.5) {
  const g = new THREE.Group(), G = new Geo(), lights = G;   // one mesh for the static parts (draw calls)
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; lights.box(Math.cos(a) * (r0 + 1.2), 0, Math.sin(a) * (r0 + 1.2), 0.35, 0.25, 0.35, i % 3 ? col(0xffe860) : col(0x50c060), 1); }
  G.cyl(r0 + 6, 0, 0, 0.07, 5.5, 5, col(0xd8d8d0), 0); G.box(r0 + 6, 0, 0, 0.8, 0.12, 0.8, CONC, 1);
  G.push(r0 + 9, 0, 4).box(0, 0, 0, 3.2, 2.5, 2.4, col(0xc8c4b0), 1).box(0, 2.5, 0, 3.4, 0.12, 2.6, DARK, 0).pop();
  const solid = mesh(G); g.add(solid);
  // windsock: a cone of orange and white bands that swings to the wind and fills with it
  const sock = new THREE.Group(); sock.position.set(r0 + 6, 5.3, 0); g.add(sock);
  const S = new Geo(); for (let k = 0; k < 4; k++) S.push(0, 0, 0, 0, 0, -Math.PI / 2).cyl(0, k * 0.55, 0, 0.42 - k * 0.07, 0.55, 8, k % 2 ? col(0xf0f0ea) : col(0xe8641e), 0, 0.35 - k * 0.07).pop();
  const sm = new THREE.Mesh(geoFrom(S.build()), worldMaterial({ side: THREE.DoubleSide })); sock.add(sm);
  g.userData = { sock, sm };
  return g;
}
// the collar over a cave shaft: machine fortress (side 2) or our sandbagged, floodlit shaft head (side 1)
export function buildShaftCollar(holeR = 9) {
  const g = new THREE.Group(), RW = new Geo(), GL = new Geo(), HU = new Geo(), r = rng(4242);
  // RUNAWAY: an armoured ring with four leaning pylons, seams round the lip
  for (let i = 0; i < 12; i++) { const a0 = i / 12 * Math.PI * 2, a1 = (i + 1) / 12 * Math.PI * 2, R0 = holeR + 2.2, R1 = holeR + 5; RW.quad([Math.cos(a1) * R0, 1.4, -Math.sin(a1) * R0], [Math.cos(a0) * R0, 1.4, -Math.sin(a0) * R0], [Math.cos(a0) * R1, 0, -Math.sin(a0) * R1], [Math.cos(a1) * R1, 0, -Math.sin(a1) * R1], i % 2 ? COMP : COMP2); RW.quad([Math.cos(a0) * R0, 1.4, -Math.sin(a0) * R0], [Math.cos(a1) * R0, 1.4, -Math.sin(a1) * R0], [Math.cos(a1) * R0, -1, -Math.sin(a1) * R0], [Math.cos(a0) * R0, -1, -Math.sin(a0) * R0], COMP); }
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, x = Math.cos(a) * (holeR + 4), z = Math.sin(a) * (holeR + 4); RW.push(x, 0, z, -a + Math.PI / 2, 0, 0); RW.push(0, 0, 0, 0, -0.32, 0).pyramid(0, 0, 0, 1.6, 1.1, 12, CER).pop(); RW.pop(); GL.push(x, 0, z, -a + Math.PI / 2).push(0, 0, 0, 0, -0.32, 0).box(0, 10.6, 0.1, 0.25, 1.2, 0.25, WHITE, 0).pop().pop(); }
  for (let i = 0; i < 24; i++) { const a0 = i / 24 * Math.PI * 2, a1 = (i + 1) / 24 * Math.PI * 2, R0 = holeR + 2.25; seam(GL, [Math.cos(a0) * R0, 1.45, -Math.sin(a0) * R0], [Math.cos(a1) * R0, 1.45, -Math.sin(a1) * R0], 0.12); }
  // 1980: sandbag ring with gaps, floodlights, a hoist frame
  for (let k = 0; k < 6; k++) { const a0 = k / 6 * Math.PI * 2 + 0.15, a1 = a0 + 0.75, R = holeR + 3; sandbags(HU, Math.cos(a0) * R, Math.sin(a0) * R, Math.cos(a1) * R, Math.sin(a1) * R, 2, r); }
  for (const a of [0.6, 2.2, 3.8, 5.4]) floodlight(HU, Math.cos(a) * (holeR + 6), Math.sin(a) * (holeR + 6));
  const rw = new THREE.Group(), glowMat = mats().glow.clone(); rw.add(mesh(RW), new THREE.Mesh(geoFrom(GL.build()), glowMat));
  const hu = mesh(HU); g.add(rw, hu);
  g.userData = { rw, hu, glowMat, setSide(side) { rw.visible = side === 2; hu.visible = side === 1; } };
  return g;
}
// a RUNAWAY power pylon: a tapered composite mast with insulator rings; cables are drawn between them
export function buildRWPylon() {
  const S = new Geo(), G = new Geo();
  S.cyl(0, -0.5, 0, 0.9, 1.0, 6, COMP, 2, 0.9); S.cyl(0, 0.5, 0, 0.55, 11, 6, CER2, 0, 0.25); S.box(0, 10.6, 0, 3.2, 0.3, 0.4, COMP, 0);
  for (const x of [-1.4, 1.4]) G.cyl(x, 9.9, 0, 0.16, 0.7, 6, WHITE, 2);
  G.cyl(0, 4, 0, 0.5, 0.12, 6, WHITE, 0, 0.48);
  const g = new THREE.Group(), glowMat = mats().glow.clone(); g.add(mesh(S), new THREE.Mesh(geoFrom(G.build()), glowMat));
  g.userData = { glowMat, tops: [[-1.4, 10.4, 0], [1.4, 10.4, 0]] };
  return g;
}
