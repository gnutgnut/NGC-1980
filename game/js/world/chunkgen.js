// Chunk builder: everything people built in one 400 m square, as merged flat-shaded geometry (one buffer per level of
// detail), plus the spots the ambient life needs (front doors, chimneys, moorings, pastures). Pure: runs in the world
// worker for the wild lands and on the main thread for the control zone.
//   near: full detail (windows, doors, chimneys, garden clutter, road markings, walls) - drawn within ~500 m
//   far:  boxes and roofs, plain road ribbons, fields - drawn out to the jet's view distance
//   detail (ngc/world-polish): street furniture, parked cars, garden and yard clutter, harbour gear - drawn within
//         ~240 m only (small things cost triangles and say nothing further out)
// Every building's vertex ranges in near and far come back in dyn.bld, so a building can be knocked down later
// (world/damage.js): its ranges collapse and its ruin is drawn in their place.
import { Geo, col, shade, mixc } from './kit.js';
import * as MD from './models.js';
import * as TK from './townkit.js';   // ngc/world-polish: pub, school, chapel, street furniture, cars, harbour, farmyard, ruins
import { netState, BKT, settlementOf, cellReady, CELL, FARM_CELL, farmOf, roadById, ROAD } from './net.js';
import { townItems, farmItems, polesOf, mastOf } from './layout.js';
import { rng } from './rng.js';
import { isDrivableCar } from './parked.js';   // ngc/wheeledgame: some garden cars are real, drivable ones
import { rawH } from '../world.js';

export const CHUNK = 400;
const LIFT = { tarmac: 0.14, lane: 0.13, street: 0.12, dirt: 0.10 };
const ROADC = { tarmac: col(0x4c4d50), lane: col(0x56575a), street: col(0x5e5c5a), dirt: col(0x8a7356) };
const VERGE = col(0x6e6a52), LINE = col(0xe8e6dc), LINEY = col(0xd8b84a), GRASS = col(0x4a7a34);
const CROPC = {
  wheat: [col(0xc9ad5c), col(0xb89c4c)], barley: [col(0xc2b878), col(0xb0a868)], pasture: [col(0x5f9a44), col(0x548c3c)],
  plough: [col(0x6e5038), col(0x5e4330)], hay: [col(0xa9ab5c), col(0xc4b86c)], potato: [col(0x3f6e34), col(0x5a4632)],
};
const WALLC = col(0x8d887c), HEDGE = col(0x2e5626), HEDGE2 = col(0x3a6a2e), TRUNK = col(0x5a4632), LEAF = [col(0x4f8a36), col(0x5e9a40), col(0x467e30), col(0x6aa048)];

// ------------------------------------------------------------------------------------------- roads
function roadRibbons(G, R, i0, i1, hf) {
  const gN = G.gN, gF = G.gF, sN = G.sN, sF = G.sF;   // ground overlays (polygon offset) and solid parts
  const lift = LIFT[R.type] || 0.12, c = ROADC[R.type], hw = R.hw, n = R.xs.length;
  const nrm = i => { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); const dx = R.xs[b] - R.xs[a], dz = R.zs[b] - R.zs[a], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };
  const edge = (i, off, dy = 0) => { const [nx, nz] = nrm(i); return [R.xs[i] + nx * off, R.ys[i] + lift + dy, R.zs[i] + nz * off]; };
  for (let i = i0; i < Math.min(i1, n - 1); i++) {
    const br = R.br[i];
    const L0 = edge(i, hw), R0 = edge(i, -hw), L1 = edge(i + 1, hw), R1 = edge(i + 1, -hw);
    gN.upW(R0, R1, L1, L0, c);
    if (i % 3 === 0 || br) { const j = Math.min(n - 1, i + 3); const a = edge(i, hw), b = edge(i, -hw), cc = edge(br ? i + 1 : j, -hw), d = edge(br ? i + 1 : j, hw); gF.upW(b, cc, d, a, c); }
    if (R.type === 'tarmac' || R.type === 'street') {   // white edge lines, dashed centre line on the main roads
      if (R.type === 'tarmac') for (const s of [1, -1]) { const a = edge(i, s * (hw - 0.25), 0.015), b = edge(i + 1, s * (hw - 0.25), 0.015), a2 = edge(i, s * (hw - 0.37), 0.015), b2 = edge(i + 1, s * (hw - 0.37), 0.015); gN.upW(a2, b2, b, a, LINE); }
      const sMid = R.s[i]; if (R.type === 'tarmac' && (Math.floor(sMid / 4) % 3 === 0)) { const a = edge(i, 0.07, 0.015), b = edge(i + 1, 0.07, 0.015), a2 = edge(i, -0.07, 0.015), b2 = edge(i + 1, -0.07, 0.015); gN.upW(a2, b2, b, a, LINE); }
    }
    if (R.type === 'dirt' && !br) { const a = edge(i, 0.35, 0.02), b = edge(i + 1, 0.35, 0.02), a2 = edge(i, -0.35, 0.02), b2 = edge(i + 1, -0.35, 0.02); gN.upW(a2, b2, b, a, GRASS); }
    if (!br) {   // verges: a gravel shoulder sloping down to the flattened ground's edge, covers the seam
      for (const s of [1, -1]) { const a = edge(i, s * hw, 0), b = edge(i + 1, s * hw, 0), a2 = edge(i, s * (hw + 0.9), -0.1), b2 = edge(i + 1, s * (hw + 0.9), -0.1); gN.upW(a, b, b2, a2, VERGE); }
    } else {   // bridge: deck edges, parapets, piers down to the ground / sea floor
      const deck = col(0x8a8780), dark = col(0x5a5852);
      for (const s of [1, -1]) {
        const a = edge(i, s * (hw + 0.4), 0), b = edge(i + 1, s * (hw + 0.4), 0), a1 = [a[0], a[1] + 1.0, a[2]], b1 = [b[0], b[1] + 1.0, b[2]], a0 = [a[0], a[1] - 1.1, a[2]], b0 = [b[0], b[1] - 1.1, b[2]];
        const ai = edge(i, s * (hw + 0.05), 0), bi = edge(i + 1, s * (hw + 0.05), 0), ai1 = [ai[0], ai[1] + 1.0, ai[2]], bi1 = [bi[0], bi[1] + 1.0, bi[2]];
        const [nx, nz] = nrm(i), ox = nx * s, oz = nz * s;   // outward
        sN.faceW(a0, b0, b1, a1, deck, ox, 0, oz); sN.faceW(bi, ai, ai1, bi1, deck, -ox, 0, -oz); sN.upW(ai1, a1, b1, bi1, shade(deck, 1.1)); sF.faceW(a0, b0, b1, a1, deck, ox, 0, oz);
      }
      const u0 = edge(i, hw + 0.4, -1.1), u1 = edge(i + 1, hw + 0.4, -1.1), v0 = edge(i, -hw - 0.4, -1.1), v1 = edge(i + 1, -hw - 0.4, -1.1);
      sN.faceW(u0, u1, v1, v0, dark, 0, -1, 0);
      if (i % 3 === 1) {
        const [nx, nz] = nrm(i), gy = Math.min(hf(R.xs[i], R.zs[i]), rawH(R.xs[i], R.zs[i])), top = R.ys[i] + lift - 1.1;
        if (top - gy > 0.5) for (const g of [sN, sF]) { g.push(R.xs[i], gy - 1, R.zs[i], Math.atan2(nx, nz)); g.box(0, 0, 0, hw * 1.6, top - gy + 1, 1.6, dark, 3); g.pop(); }
      }
    }
  }
}
// a flat paved disc (town square, quay top, farmyard): a fan at its height
function disc(g, x, y, z, r, c, seg = 14) { for (let k = 0; k < seg; k++) { const a0 = k / seg * 6.2832, a1 = (k + 1) / seg * 6.2832; g.triW([x, y, z], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], c); } }

// ------------------------------------------------------------------------------------------- fields
// the terrain as the game draws it: hf sampled on its heightmap lattice (4 m in the wild, 2.5 m in the zone) and
// interpolated bilinearly, so ground overlays (fields) lie on the drawn surface, not the true one
function visHeight(hf, L) {
  const cache = new Map(), at = (i, j) => { const k = i * 100003 + j; let h = cache.get(k); if (h === undefined) { h = hf(i * L, j * L); cache.set(k, h); } return h; };
  return (x, z) => { const gx = x / L, gz = z / L, i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j; const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1); return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz; };
}
function field(G, it, hf, vh, dyn) {
  let gN = G.gN; const gF = G.gF, sN = G.sN;
  const [ca, cb] = CROPC[it.crop] || CROPC.pasture, r = rng(it.seed), cy = Math.cos(it.yaw), sy = Math.sin(it.yaw);
  const W = (u, v) => [it.x + cy * u + sy * v, it.z - sy * u + cy * v];
  const P = (u, v, lift = 0.12) => { const [x, z] = W(u, v); return [x, vh(x, z) + lift, z]; };
  const nu = Math.max(2, Math.round(it.w / 4)), nv = Math.max(2, Math.round(it.d / 4)), du = it.w / nu, dv = it.d / nv;
  const tint = mixc(ca, cb, r() * 0.5), row = it.crop === 'plough' || it.crop === 'potato' ? 2 : it.crop === 'hay' ? 3 : 0;
  const pts = []; for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pts.push(P(-it.w / 2 + i * du, -it.d / 2 + j * dv));
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    let c = tint;
    if (row === 2) c = (j >> 0) % 2 ? ca : cb;                                            // furrows / rows across the field
    else if (row === 3) c = (i >> 1) % 2 ? ca : cb;                                       // windrows
    else if (it.crop === 'pasture') c = mixc(ca, cb, ((i * 7 + j * 13) % 5) / 5 * 0.6);   // grazed patches
    else if (it.crop === 'wheat' || it.crop === 'barley') c = (i % 6 === 3) ? shade(ca, 0.86) : tint;   // tramlines
    const k = j * (nu + 1) + i; gN.upW(pts[k], pts[k + nu + 1], pts[k + nu + 2], pts[k + 1], c);
  }
  // far: a coarse grid
  const fu = Math.max(1, Math.round(it.w / 24)), fv = Math.max(1, Math.round(it.d / 24));
  for (let j = 0; j < fv; j++) for (let i = 0; i < fu; i++) { const u0 = -it.w / 2 + i * it.w / fu, v0 = -it.d / 2 + j * it.d / fv; gF.upW(P(u0, v0, 0.3), P(u0, v0 + it.d / fv, 0.3), P(u0 + it.w / fu, v0 + it.d / fv, 0.3), P(u0 + it.w / fu, v0, 0.3), tint); }
  gN = sN;   // walls and hedges are solid
  // walls or hedges round it, a gate gap on one side, the odd hedgerow tree
  const gap = r.int(0, 3), hedge = it.wall === 'hedge';
  const sides = [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]];
  sides.forEach(([[ua, va], [ub, vb]], k) => {
    const len = Math.hypot((ub - ua) * it.w / 2, (vb - va) * it.d / 2), n = Math.max(1, Math.round(len / 6));
    for (let s = 0; s < n; s++) {
      if (k === gap && s === Math.floor(n / 2)) continue;
      const t0 = s / n, t1 = (s + 1) / n, ua0 = (ua + (ub - ua) * t0) * (it.w / 2 + 1), va0 = (va + (vb - va) * t0) * (it.d / 2 + 1), ub1 = (ua + (ub - ua) * t1) * (it.w / 2 + 1), vb1 = (va + (vb - va) * t1) * (it.d / 2 + 1);
      const [x0, z0] = W(ua0, va0), [x1, z1] = W(ub1, vb1), h0 = hf(x0, z0), h1 = hf(x1, z1), dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l, hw = hedge ? 0.6 : 0.3, ht = hedge ? 1.7 : 0.95;
      const c = hedge ? (s % 2 ? HEDGE : HEDGE2) : WALLC;
      const a = [x0 + nx * hw, h0 - 0.3, z0 + nz * hw], b = [x1 + nx * hw, h1 - 0.3, z1 + nz * hw], a2 = [x0 - nx * hw, h0 - 0.3, z0 - nz * hw], b2 = [x1 - nx * hw, h1 - 0.3, z1 - nz * hw];
      const at = [a[0], h0 + ht, a[2]], bt = [b[0], h1 + ht, b[2]], a2t = [a2[0], h0 + ht, a2[2]], b2t = [b2[0], h1 + ht, b2[2]];
      gN.faceW(a, b, bt, at, c, nx, 0, nz); gN.faceW(b2, a2, a2t, b2t, c, -nx, 0, -nz); gN.upW(at, bt, b2t, a2t, shade(c, 1.08));
      if (hedge && r() < 0.12) tree(gN, x0, h0, z0, 0.9 + r() * 0.6, r);
    }
  });
  if (it.crop === 'pasture') dyn.pastures.push([it.x, it.z, it.yaw, it.w, it.d, it.seed]);
}
function tree(g, x, y, z, s, r) {   // a round broadleaf: trunk and a lumpy crown
  g.push(x, y, z, r() * 6); g.cyl(0, -0.3, 0, 0.22 * s, 2.6 * s, 5, TRUNK, 0); g.blob(0, 4.2 * s, 0, 2.4 * s, 2.3 * s, 2.4 * s, r.pick(LEAF), r.pick(LEAF)); g.pop();
}

// ------------------------------------------------------------------------------------------- items -> geometry
const FARL = col(0x8c8a84);
// what a building is in the damage model (world/damage.js): types whose vertex ranges are recorded
export const BUILDINGS = new Set(['house', 'cottage', 'terrace', 'church', 'petrol', 'barn', 'boatshed', 'school', 'chapel', 'vhall', 'parlour', 'office', 'garage']);
export const bldKey = it => it.t + ':' + (it.seed | 0) + ':' + Math.round(it.x * 10) + ':' + Math.round(it.z * 10);   // (rooms.js planOf's key)
const DETAIL = new Set(['pots', 'memorial', 'bench', 'phone', 'post', 'shelter', 'lamp', 'sign', 'laundry', 'shed', 'woodpile', 'car', 'tractor', 'pcar', 'picnic', 'bin', 'psign', 'crane', 'fishbox', 'nets', 'fueltank', 'hboat', 'buoy', 'balestack', 'muck', 'trough', 'trailer', 'landrover', 'churns']);
function itemGeo(G, it, hf, vh, dyn) {
  const gD = DETAIL.has(it.t) ? G.sD : G.sN, gN = G.sN, gF = G.sF;
  const r = rng(it.seed | 0);
  if (it.ground) it.y = hf(it.x, it.z);   // small things stand on the finished ground (platforms included)
  const bld = BUILDINGS.has(it.t), n0 = gN.count, f0 = gF.count;
  if (it.t !== 'field') { gN.weather(it.y, 1.0, bld ? 0.34 : 0.22, 0.07); gD.weather(it.y, 0.6, 0.18, 0.05); }   // grime at the foot of the walls
  const P = (g, f) => { g.push(it.x, it.y, it.z, it.yaw); const res = f(g); g.pop(); return res; };
  const chim = tops => { if (tops) for (const [u, v, w] of tops) { const c = Math.cos(it.yaw), s = Math.sin(it.yaw); dyn.chimneys.push([it.x + c * u + s * w, it.y + v, it.z - s * u + c * w]); } };
  const far = (w, d, h, roofH, wall, roof) => P(gF, g => { g.box(0, -it.drop, 0, w, h + it.drop, d, col(wall), 1); g.gable(0, h, 0, w, d, roofH, col(roof), col(wall), 0.2); });
  const door = () => { const c = Math.cos(it.yaw), s = Math.sin(it.yaw), v = it.d / 2 + 1.6; dyn.doors.push([it.x + s * v, it.y, it.z + c * v, it.yaw]); };
  switch (it.t) {
    case 'house': chim(P(gN, g => MD.house(g, r, it))); far(it.w, it.d, it.floors * 2.8, it.d * 0.45, it.wall, it.roof); door(); break;
    case 'cottage': chim(P(gN, g => MD.cottage(g, r, it))); far(it.w, it.d, 2.6, it.d * 0.7, it.wall, it.roof); door(); break;
    case 'terrace': chim(P(gN, g => MD.terrace(g, r, it))); far(it.w, it.d, it.floors * 3, it.d * 0.42, MD.PAL.walls[it.seed % 9], it.roof); door(); door(); break;
    case 'church': P(gN, g => MD.church(g, r, it)); P(gF, g => { g.box(0, -it.drop, 0, 20, 7 + it.drop, 9, FARL, 1); g.gable(0, 7, 0, 20, 9, 5, col(0x4b515b), FARL); g.box(12.5, 0, 0, 5.5, 17, 5.5, FARL, 1); g.pyramid(12.5, 17, 0, 5.7, 5.7, 9, col(0x4b515b)); }); door(); break;
    case 'petrol': P(gN, g => MD.petrol(g, r, it)); P(gF, g => { g.box(0, 0, -3.5, 7, 3, 5, col(0xe8e6e0), 1); g.box(0, 4.4, 3.5, 10.5, 0.7, 5.5, col(0xc8281e), 0); }); break;
    case 'barn': P(gN, g => MD.barn(g, r, it)); P(gF, g => { g.box(0, -it.drop, 0, it.w, 5.5 + it.drop, it.d, col(0x7a4a3a), 1); g.gable(0, 5.5, 0, it.w, it.d, it.d * 0.32, col(0x6a6a6a), col(0x7a4a3a), 0.2); }); break;
    case 'openshed': P(gN, g => MD.openShed(g, r, it)); P(gF, g => g.gable(0, 4.5, 0, it.w, it.d, 1.2, col(0x7a3a2a), null, 0.2)); break;
    case 'silo': P(gN, g => MD.silo(g, r, it)); P(gF, g => g.cyl(0, -it.drop, 0, 2.2, 12.6 + it.drop, 6, col(0x9aa0a6), 2)); break;
    case 'tractor': P(gD, g => MD.tractor(g, r)); break;
    case 'boatshed': P(gN, g => MD.boatShed(g, r, it)); far(6, 10, 3.6, 1.6, 0x5a3a2a, 0x3d424a); break;
    case 'lighthouse': { const o = P(gN, g => MD.lighthouse(g, r, it)); P(gF, g => { g.cyl(0, 0, 0, 2.2, (it.h || 18) + 2, 6, col(0xf0eee8), 2, 1.6); }); const c = Math.cos(it.yaw), s = Math.sin(it.yaw); dyn.lights.push([it.x, it.y + o.lamp[1], it.z]); break; }
    case 'mast': { const o = P(gN, g => MD.mast(g, r, it)); P(gF, g => { g.strut([0, 0, 0], [0, it.h, 0], 1.2, col(0xc0281e)); }); dyn.masts.push([it.x, it.y, it.z, it.h]); break; }
    case 'quay': case 'jetty': {
      const sea = -Math.max(1, it.drop - it.y);
      P(gN, g => { if (it.t === "quay") MD.quayWall(g, r, 8.4, it.drop, Math.PI / 2); g.push(0, 0.15, it.t === 'quay' ? 7.5 : 0); MD.pier(g, r, it.len, sea - 0.5); g.pop(); });
      P(gF, g => { g.box(0, -0.4, (it.t === 'quay' ? 7.5 : 0) + it.len / 2, 3, 0.4, it.len, col(0x7a6248), 1); });
      const c = Math.cos(it.yaw), s = Math.sin(it.yaw), z0 = it.t === 'quay' ? 7.5 : 0;
      for (let k = 0; k < Math.floor(it.len / 9) + 1; k++) for (const side of [-1, 1]) { const u = side * 3.4, v = z0 + 5 + k * 9; if (v > z0 + it.len) continue; dyn.moorings.push([it.x + c * u + s * v, it.z - s * u + c * v, it.yaw + (side > 0 ? 0 : Math.PI)]); }
      break;
    }
    case 'pots': P(gD, g => MD.lobsterPots(g, r, 10)); break;
    case 'memorial': P(gD, g => MD.memorial(g, r)); break;
    case 'bench': P(gD, g => MD.bench(g)); break;
    case 'phone': P(gD, g => TK.phoneK6(g)); break;
    case 'post': P(gD, g => TK.pillarBox(g)); break;
    case 'shelter': P(gD, g => MD.busShelter(g)); break;
    case 'lamp': P(gD, g => TK.lampColumn(g)); break;
    case 'sign': P(gD, g => MD.roadSign(g, r)); break;
    case 'laundry': P(gD, g => MD.laundry(g, r)); break;
    case 'shed': P(gD, g => MD.shed(g, r, it)); break;
    case 'woodpile': P(gD, g => MD.woodpile(g, r)); break;
    case 'garage': P(gN, g => MD.garageBox(g, r, it)); break;
    case 'car': if (!isDrivableCar(it)) P(gD, g => TK.car2(g, r, it.paint, ['saloon', 'hatch', 'estate', 'saloon', 'mini'][(it.seed >>> 3) % 5])); break;   // ngc/wheeledgame: the drivable ones are crafts
    // ---- ngc/world-polish
    case 'pcar': P(gD, g => TK.car2(g, r, it.paint, it.kind)); break;
    case 'picnic': P(gD, g => TK.picnic(g, r)); break;
    case 'bin': P(gD, g => TK.litterBin(g)); break;
    case 'psign': P(gD, g => TK.postSign(g, r, it.kind)); break;
    case 'school': P(gN, g => TK.school(g, r, it)); P(gF, g => { g.box(0, -it.drop, -it.d / 2 + 4, it.w, 4.2 + it.drop, 8, col(0x8f897c), 1); g.gable(0, 4.2, -it.d / 2 + 4, it.w, 8, 5, col(0x3d424a), col(0x8f897c), 0.3); }); door(); break;
    case 'chapel': P(gN, g => TK.chapel(g, r, it)); P(gF, g => { g.box(0, -it.drop, -1, it.w, 6.2 + it.drop, it.d - 2, col(0xc9c0a8), 1); g.push(0, 0, -1, Math.PI / 2).gable(0, 6.2, 0, it.d - 2, it.w, it.w * 0.42, col(0x3d424a), col(0xc9c0a8), 0.2).pop(); }); door(); break;
    case 'vhall': P(gN, g => MD.hall(g, r, it)); far(it.w, it.d, 3.6, it.d * 0.4, it.wall, it.roof); door(); break;
    case 'parlour': P(gN, g => TK.parlour(g, r, it)); far(it.w, it.d, 3, 1.1, 0xb8b4a8, 0x9a9a92); break;
    case 'office': P(gN, g => TK.harbourOffice(g, r, it)); far(3.6, 3, 2.6, 0.9, 0x2a4a6a, 0x3d424a); break;
    case 'slip': P(gN, g => TK.slipway(g, r, it.len, it.depth)); break;
    case 'crane': P(gD, g => TK.handCrane(g)); break;
    case 'fishbox': P(gD, g => TK.fishBoxes(g, r)); break;
    case 'nets': P(gD, g => TK.netHeap(g, r)); break;
    case 'fueltank': P(gD, g => TK.fuelTank(g)); break;
    case 'hboat': P(gD, g => { g.push(0, 0.15, 0, 0, 0, (r() - 0.5) * 0.3); TK.boat(g, r, it.L || 4.2, (it.L || 4.2) * 0.36, 0.66); g.pop(); }); break;
    case 'buoy': P(gD, g => TK.buoy(g, r)); break;
    case 'balestack': P(gD, g => TK.baleStack(g, r)); break;
    case 'muck': P(gD, g => TK.muckHeap(g)); break;
    case 'trough': P(gD, g => TK.trough(g)); break;
    case 'trailer': P(gD, g => TK.trailer(g, r)); break;
    case 'landrover': P(gD, g => TK.landRover(g, r)); break;
    case 'churns': P(gD, g => TK.churnStand(g, r)); break;
    case 'tree': tree(gN, it.x, it.y, it.z, it.s || 1, r); gF.push(it.x, it.y, it.z).blob(0, 4.2 * (it.s || 1), 0, 2.4 * (it.s || 1), 2.3 * (it.s || 1), 2.4 * (it.s || 1), LEAF[0]).pop(); break;
    case 'field': field(G, it, hf, vh, dyn); break;
  }
  gN.unweather(); gD.unweather();
  if (bld) { const D = TK.bldDims(it); dyn.bld.push({ k: bldKey(it), t: it.t, x: it.x, y: it.y, z: it.z, yaw: it.yaw || 0, w: D.w, d: D.d, H: D.H + D.rh, dz: D.dz || 0, n: [n0, gN.count], f: [f0, gF.count], it: { t: it.t, w: it.w, d: it.d, floors: it.floors, wall: it.wall, drop: it.drop, h: it.h, seed: it.seed } }); }
}
// a utility pole: 9 m, cross-arm with three insulators; wires come back as line pairs
function pole(g, x, y, z, yaw) { g.push(x, y, z, yaw); g.cyl(0, -0.4, 0, 0.13, 9.4, 5, col(0x5a4632), 0, 0.1); g.box(0, 8.3, 0, 2.2, 0.14, 0.14, col(0x5a4632), 0); for (const u of [-0.9, 0, 0.9]) g.box(u, 8.44, 0, 0.1, 0.2, 0.1, col(0xd8d4c8), 0); g.pop(); }

// ------------------------------------------------------------------------------------------- a chunk
export function chunkContent(ci, cj, hf) {
  const x0 = ci * CHUNK, z0 = cj * CHUNK, x1 = x0 + CHUNK, z1 = z0 + CHUNK, inC = (x, z) => x >= x0 && x < x1 && z >= z0 && z < z1;
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) cellReady(Math.floor(x / CELL), Math.floor(z / CELL));
  const items = [];
  const c0 = Math.floor(x0 / CELL) - 1, c1 = Math.floor(x1 / CELL) + 1, d0 = Math.floor(z0 / CELL) - 1, d1 = Math.floor(z1 / CELL) + 1;
  for (let j = d0; j <= d1; j++) for (let i = c0; i <= c1; i++) {
    const s = settlementOf(i, j); if (s && s.x > x0 - 500 && s.x < x1 + 500 && s.z > z0 - 500 && s.z < z1 + 500) for (const it of townItems(s, hf)) if (inC(it.x, it.z)) items.push(it);
    const m = mastOf(i, j); if (m && inC(m.x, m.z)) { m.y = hf(m.x, m.z); m.drop = 0.5; items.push(m); }
  }
  for (let j = Math.floor(z0 / FARM_CELL) - 1; j <= Math.floor(z1 / FARM_CELL) + 1; j++) for (let i = Math.floor(x0 / FARM_CELL) - 1; i <= Math.floor(x1 / FARM_CELL) + 1; i++) {
    const f = farmOf(i, j); if (f) for (const it of farmItems(f, hf)) if (inC(it.x, it.z)) items.push(it);
  }
  // roads with a sample in the chunk (by bucket), and the discs
  const roads = new Map(), discs = [];
  for (let bj = Math.floor(z0 / BKT); bj < Math.ceil(z1 / BKT); bj++) for (let bi = Math.floor(x0 / BKT); bi < Math.ceil(x1 / BKT); bi++) {
    const a = netState.buckets.get((bi + 32768) * 65536 + (bj + 32768)); if (!a) continue;
    for (const s of a) { if (s.disc) { if (inC(s.ax, s.az) && !discs.includes(s)) discs.push(s); continue; } if (inC(s.ax, s.az)) { let l = roads.get(s.r); if (!l) roads.set(s.r, l = new Set()); l.add(s.i); } }
  }
  return { items, roads, discs, x0, z0, x1, z1 };
}
export function buildGeo(content, hf, opts = {}) {
  const G = { sN: new Geo(), sF: new Geo(), gN: new Geo(), gF: new Geo(), sD: new Geo() }, vh = visHeight(hf, opts.lat || 4), dyn = { doors: [], chimneys: [], moorings: [], pastures: [], lights: [], masts: [], bld: [] }, wires = [];
  for (const [R, idx] of content.roads) {
    const sorted = [...idx].sort((a, b) => a - b);
    let a = sorted[0], prev = a;
    for (let k = 1; k <= sorted.length; k++) { const i = sorted[k]; if (i !== prev + 1) { roadRibbons(G, R, a, prev + 1, hf); a = i; } prev = i; }
    // power line poles along the main roads
    const ps = polesOf(R);
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k]; if (!(p.x >= content.x0 && p.x < content.x1 && p.z >= content.z0 && p.z < content.z1)) continue;
      const y = hf(p.x, p.z); pole(G.sN, p.x, y, p.z, p.yaw); G.sF.push(p.x, y, p.z).box(0, 0, 0, 0.3, 9, 0.3, col(0x5a4632), 3).pop();
      const q = ps[k + 1]; if (q && Math.hypot(q.x - p.x, q.z - p.z) < 70) { const yq = hf(q.x, q.z); for (const u of [-0.9, 0, 0.9]) { const c = Math.cos(p.yaw), s = Math.sin(p.yaw), cq = Math.cos(q.yaw), sq = Math.sin(q.yaw); const ax = p.x + c * u, ay = y + 8.6, az = p.z - s * u, bx = q.x + cq * u, by = yq + 8.6, bz = q.z - sq * u, mx = (ax + bx) / 2, my = (ay + by) / 2 - 0.9, mz = (az + bz) / 2; wires.push(ax, ay, az, mx, my, mz, mx, my, mz, bx, by, bz); } }
    }
  }
  for (const d of content.discs) { const c = d.kind === 'yard' ? col(0x7a6a52) : d.kind === 'quay' ? col(0x8a857a) : col(0x76736c); disc(G.gN, d.ax, d.ay + 0.135, d.az, d.hw + 0.4, c); disc(G.gF, d.ax, d.ay + 0.135, d.az, d.hw + 0.4, c, 8); }
  for (const it of content.items) itemGeo(G, it, hf, vh, dyn);
  return { near: G.sN.build(), far: G.sF.build(), gnear: G.gN.build(), gfar: G.gF.build(), detail: G.sD.build(), wires: new Float32Array(wires), dyn };
}
export function buildChunk(ci, cj, hf) { return buildGeo(chunkContent(ci, cj, hf), hf); }
