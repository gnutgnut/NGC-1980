// 1980 buildings, harbour and farm kit for the lived-in world, as recipes on kit.js's Geo (pure, worker-safe).
// Every recipe builds in a local frame: front (street side) facing +z, floor level at y = 0, `drop` metres of stone
// plinth below it down to the lowest ground under the footprint. Sizes are real: a two-storey house is ~6 m to the
// eaves, a parish church tower ~16-22 m, a 1980 saloon 4.3 x 1.7 m.
import { col, shade, mixc } from './kit.js';
import { doorU, shopUnit } from '../interiors/rooms.js';   // ngc/interiors: the rooms behind the front door agree where it is
import { pubFront } from './townkit.js';   // ngc/world-polish: the pub's front (an import cycle: used inside terrace() only)

export const PAL = {
  walls: [0xe9e5da, 0xe8e0c8, 0xe6d6a8, 0xdcc0a8, 0xc9d3d6, 0xb4ada0, 0xd8d2c4, 0xefe9de, 0xd9c79a],
  stone: [0x8f897c, 0x7d786d, 0x9a9384, 0xa59d8a],
  brick: [0x9a523e, 0x86463a, 0xa0624a],
  roofs: [0x4b515b, 0x3d424a, 0x575d66, 0xa3553b, 0x8e4a33, 0x6b4330, 0x5c5048],
  doors: [0x2f5a3a, 0x8a2a22, 0x2a4a7a, 0x222222, 0x5a3a22, 0xc9a227, 0x3f6f7f, 0xe8e8e0],
  shops: [0x7a2a2a, 0x2a4a2a, 0x2a3a6a, 0xb08a2a, 0x4a2a5a, 0x2a6a6a, 0xa04020, 0x333333],
  cars: [0xb8b4a8, 0x8a2a20, 0x2e4a6e, 0x2f5a3a, 0xd6c27a, 0x6e6a62, 0xe6e2d6, 0x8a6a3a, 0x3a3a3e, 0xa04a1a, 0x5a7a8a, 0x7a2a4a],
};
const GLASS = col(0x2b3846), GLASS2 = col(0x3d4e5c), FRAME = col(0xeceae2), DARK = col(0x2a2a2a), METAL = col(0x7c8186), WOOD = col(0x6b5038), WOOD2 = col(0x8a6a48);
const STEP = col(0x9a958a), RED = col(0xa8281e), WHITE = col(0xeeeeea), BLACK = col(0x1c1c1e), RUST = col(0x7a4a32), YELLOW = col(0xd9b23a);
export const C = { GLASS, FRAME, DARK, METAL, WOOD, WOOD2, STEP, RED, WHITE, BLACK, RUST, YELLOW };

// windows along a wall: the wall is the local plane z = zf (facing +z), from x0 to x1, at sill heights per floor
function windowsZ(g, x0, x1, zf, floors, fh, opt = {}) {
  const n = Math.max(1, Math.floor((x1 - x0) / (opt.spacing || 2.7))), ww = opt.w || 1.0, wh = opt.h || 1.25, skip = opt.skip;
  for (let f = 0; f < floors; f++) for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * (x1 - x0) / n; if (skip && f === 0 && Math.abs(cx - skip) < 1.3) continue;
    const y0 = f * fh + (opt.sill || 0.95);
    g.quad([cx - ww / 2 - 0.12, y0 - 0.12, zf + 0.04], [cx + ww / 2 + 0.12, y0 - 0.12, zf + 0.04], [cx + ww / 2 + 0.12, y0 + wh + 0.1, zf + 0.04], [cx - ww / 2 - 0.12, y0 + wh + 0.1, zf + 0.04], FRAME);
    g.quad([cx - ww / 2, y0, zf + 0.08], [cx + ww / 2, y0, zf + 0.08], [cx + ww / 2, y0 + wh, zf + 0.08], [cx - ww / 2, y0 + wh, zf + 0.08], (i + f) % 3 ? GLASS : GLASS2);
    if (opt.box && f === 0 && (i % 2 === 0)) g.box(cx, y0 - 0.32, zf + 0.22, ww + 0.1, 0.22, 0.3, opt.box, 1);   // flower box
  }
}
// the same on the other three walls, by turning the frame
function windowsAround(g, w, d, floors, fh, opt = {}) {
  windowsZ(g, -w / 2 + 0.6, w / 2 - 0.6, d / 2, floors, fh, opt);
  g.push(0, 0, 0, Math.PI); windowsZ(g, -w / 2 + 0.6, w / 2 - 0.6, d / 2, floors, fh, { ...opt, skip: null, box: null }); g.pop();
  if (opt.sides !== false) for (const s of [1, -1]) { g.push(0, 0, 0, s * Math.PI / 2); if (d > 5) windowsZ(g, -d / 2 + 1, d / 2 - 1, w / 2, floors, fh, { ...opt, skip: null, box: null, spacing: 3.4 }); g.pop(); }
}
function door(g, x, zf, color, w = 1.0, h = 2.1) {
  g.quad([x - w / 2 - 0.12, 0, zf + 0.04], [x + w / 2 + 0.12, 0, zf + 0.04], [x + w / 2 + 0.12, h + 0.12, zf + 0.04], [x - w / 2 - 0.12, h + 0.12, zf + 0.04], FRAME);
  g.quad([x - w / 2, 0, zf + 0.08], [x + w / 2, 0, zf + 0.08], [x + w / 2, h, zf + 0.08], [x - w / 2, h, zf + 0.08], color);
  g.box(x, -0.18, zf + 0.45, w + 0.6, 0.18, 0.8, STEP, 1);   // door step
}
function plinth(g, w, d, drop, c) { g.box(0, -drop, 0, w + 0.24, drop + 0.25, d + 0.24, c, 1); }
function chimney(g, x, y, z, c, pots = 2) {
  g.box(x, y, z, 0.8, 1.5, 0.6, c, 1);
  g.box(x, y + 1.5, z, 0.92, 0.12, 0.72, shade(c, 0.8), 1);
  for (let i = 0; i < pots; i++) g.cyl(x - 0.18 + i * 0.36, y + 1.62, z, 0.1, 0.35, 5, RUST, 0);
}
function aerial(g, x, y, z) {   // a 1980 TV aerial on its mast
  g.strut([x, y, z], [x, y + 2.2, z], 0.05, METAL);
  g.strut([x - 0.5, y + 2.0, z], [x + 0.5, y + 2.0, z], 0.035, METAL);
  g.strut([x, y + 2.0, z - 0.6], [x, y + 2.0, z + 0.6], 0.035, METAL);
}

// ------------------------------------------------------------------------------------------- houses
// house: detached, 1-2 storeys, gable or hip roof. Returns chimney top positions (local) for smoke.
export function house(g, r, o) {
  const w = o.w, d = o.d, fl = o.floors, fh = 2.8, H = fl * fh, wall = col(o.wall), roof = col(o.roof), base = col(o.plinth ?? r.pick(PAL.stone));
  plinth(g, w, d, o.drop, base);
  g.box(0, 0, 0, w, H, d, wall, 1);
  const rh = o.roofType === 'hip' ? d * 0.42 : d * (o.steep ? 0.62 : 0.48);
  if (o.roofType === 'hip') g.hip(0, H, 0, w, d, rh, roof); else g.gable(0, H, 0, w, d, rh, roof, wall);
  r(); const dx = doorU(o);   // ngc/interiors (was (r() - 0.5) * (w - 2.4): the same spread, from the item's seed)
  door(g, dx, d / 2, col(o.door));
  windowsAround(g, w, d, fl, fh, { skip: dx, box: r() < 0.4 ? col(r.pick([0xb03a2a, 0xd8a83a, 0xc85a8a, 0x3a7a3a])) : null });
  if (r() < 0.35) { g.box(dx, 2.25, d / 2 + 0.5, 1.8, 0.12, 1.0, roof, 0); g.strut([dx - 0.8, 0, d / 2 + 0.95], [dx - 0.8, 2.25, d / 2 + 0.95], 0.1, FRAME); g.strut([dx + 0.8, 0, d / 2 + 0.95], [dx + 0.8, 2.25, d / 2 + 0.95], 0.1, FRAME); }   // porch hood
  const tops = [];
  const nch = o.roofType === 'hip' ? 1 : r() < 0.5 ? 2 : 1;
  for (let i = 0; i < nch; i++) { const cx = nch === 2 ? (i ? 1 : -1) * (w / 2 - 0.5) : (r() - 0.5) * w * 0.5, cyb = H + rh * 0.55; chimney(g, cx, cyb, 0, o.brickChimney ? col(r.pick(PAL.brick)) : shade(wall, 0.9)); tops.push([cx, cyb + 1.9, 0]); }
  if (r() < 0.7) aerial(g, -w * 0.3 * (r() < 0.5 ? 1 : -1), H + rh * 0.8, 0);
  return tops;
}
// a row of 2-4 joined town houses, optionally with shopfronts on the ground floor
export function terrace(g, r, o) {
  const n = o.units, uw = o.w / n, d = o.d, fl = o.floors, fh = 3.0, H = fl * fh, roof = col(o.roof), base = col(r.pick(PAL.stone));
  plinth(g, o.w, d, o.drop, base);
  const tops = [];
  for (let i = 0; i < n; i++) {
    const x = -o.w / 2 + uw * (i + 0.5), wall = col(r.pick(PAL.walls)), hh = H + (r() < 0.3 ? 0.4 : 0);
    g.push(x, 0, 0);
    g.box(0, 0, 0, uw, hh, d, wall, 1);
    if ((r(), shopUnit(o, i)) && o.pub && i === 0) {   // ngc/world-polish: the pub (rooms.js fits it out as the bar)
      pubFront(g, r, uw, d, fh);
      windowsZ(g, -uw / 2 + 0.4, uw / 2 - 0.4, d / 2, fl - 1, fh, { sill: fh + 0.9, spacing: 2.4 });
    } else if (shopUnit(o, i)) {   // ngc/interiors: which units are shops, from the seed (the rooms fit them out)   // shopfront: big window, fascia board with the shop colour, door, maybe an awning
      const sc = col(r.pick(PAL.shops));
      g.quad([-uw / 2 + 0.3, 0.5, d / 2 + 0.06], [uw / 2 - 1.5, 0.5, d / 2 + 0.06], [uw / 2 - 1.5, 2.5, d / 2 + 0.06], [-uw / 2 + 0.3, 2.5, d / 2 + 0.06], GLASS2);
      g.box(0, 2.6, d / 2 + 0.1, uw - 0.2, 0.6, 0.2, sc, 1);
      g.quad([-uw / 4 - 0.8, 2.7, d / 2 + 0.22], [uw / 4 + 0.8, 2.7, d / 2 + 0.22], [uw / 4 + 0.8, 3.1, d / 2 + 0.22], [-uw / 4 - 0.8, 3.1, d / 2 + 0.22], FRAME);   // the shop's name
      g.quad([uw / 2 - 1.3, 0, d / 2 + 0.06], [uw / 2 - 0.4, 0, d / 2 + 0.06], [uw / 2 - 0.4, 2.2, d / 2 + 0.06], [uw / 2 - 1.3, 2.2, d / 2 + 0.06], sc);
      if (r() < 0.5) { const ac = r() < 0.5 ? sc : col(r.pick([0x2a5a2a, 0xa02a2a, 0x2a3a7a])), ac2 = WHITE; for (let k = 0; k < 4; k++) g.quad([-uw / 2 + 0.3 + k * (uw - 0.6) / 4, 2.45, d / 2 + 1.5], [-uw / 2 + 0.3 + (k + 1) * (uw - 0.6) / 4, 2.45, d / 2 + 1.5], [-uw / 2 + 0.3 + (k + 1) * (uw - 0.6) / 4, 3.0, d / 2 + 0.1], [-uw / 2 + 0.3 + k * (uw - 0.6) / 4, 3.0, d / 2 + 0.1], k % 2 ? ac : ac2); }
      windowsZ(g, -uw / 2 + 0.4, uw / 2 - 0.4, d / 2, fl - 1, fh, { sill: fh + 0.9, spacing: 2.4 });
    } else {
      door(g, uw / 2 - 1.1, d / 2, col(r.pick(PAL.doors)));
      windowsZ(g, -uw / 2 + 0.4, uw / 2 - 1.8, d / 2, 1, fh, {});
      windowsZ(g, -uw / 2 + 0.4, uw / 2 - 0.4, d / 2, fl - 1, fh, { sill: fh + 0.9, spacing: 2.4 });
    }
    g.push(0, 0, 0, Math.PI); windowsZ(g, -uw / 2 + 0.4, uw / 2 - 0.4, d / 2, fl, fh, { spacing: 2.6 }); g.pop();
    g.gable(0, hh, 0, uw, d, d * 0.42, roof, null, 0.05);
    chimney(g, uw / 2 - 0.2, hh + d * 0.25, 0, col(r.pick(PAL.brick))); tops.push([x + uw / 2 - 0.2, hh + d * 0.25 + 1.9, 0]);
    if (r() < 0.5) aerial(g, -uw * 0.2, hh + d * 0.4, 0);
    g.pop();
  }
  // gable ends
  for (const s of [-1, 1]) g.tri([s * o.w / 2, H, s * d / 2], [s * o.w / 2, H, -s * d / 2], [s * o.w / 2, H + d * 0.42, 0], col(PAL.walls[0]));
  return tops;
}
export function cottage(g, r, o) {   // single storey with a steep roof (loft), small windows, often stone
  const w = o.w, d = o.d, H = 2.6, stoneWall = r() < 0.45, wall = col(stoneWall ? r.pick(PAL.stone) : o.wall), roof = col(o.roof);
  plinth(g, w, d, o.drop, col(r.pick(PAL.stone)));
  g.box(0, 0, 0, w, H, d, wall, 1);
  g.gable(0, H, 0, w, d, d * 0.72, roof, wall, 0.3);
  r(); const dx = doorU(o); door(g, dx, d / 2, col(o.door), 0.9, 1.95);   // ngc/interiors
  windowsAround(g, w, d, 1, 2.6, { skip: dx, w: 0.8, h: 0.95, sill: 0.9, spacing: 2.3, sides: false });
  const cx = (r() < 0.5 ? -1 : 1) * (w / 2 - 0.45); chimney(g, cx, H + d * 0.2, 0, wall, 1);
  return [[cx, H + d * 0.2 + 1.9, 0]];
}
// ------------------------------------------------------------------------------------------- the village
export function church(g, r, o) {   // nave, chancel, west tower with a spire or battlements, churchyard wall and stones
  const stone = col(r.pick(PAL.stone)), roof = col(r.pick([0x4b515b, 0x3d424a])), w = 9, L = 20, H = 7;
  plinth(g, L + 8, w + 2, o.drop, stone);
  g.box(0, 0, 0, L, H, w, stone, 1);   // the nave lies along the street, the tower at its +x end
  g.gable(0, H, 0, L, w, w * 0.55, roof, stone, 0.3);
  g.box(-2, 0, w / 2 + 1.6, 3.4, 3.2, 3.2, stone, 1); g.gable(-2, 3.2, w / 2 + 1.6, 3.4, 3.2, 1.6, roof, stone, 0.15);   // south porch
  g.push(-2, 0, w / 2 + 3.2); door(g, 0, 0, col(0x4a2a1a), 1.4, 2.6); g.pop();
  g.box(-L / 2 - 3, 0, 0, 6, 5.5, 6.5, stone, 1); g.gable(-L / 2 - 3, 5.5, 0, 6, 6.5, 3, roof, stone, 0.2);   // chancel
  const tx = L / 2 + 2.5, th = 15 + r() * 5;
  g.box(tx, 0, 0, 5.5, th, 5.5, shade(stone, 0.95), 1);
  if (r() < 0.6) g.pyramid(tx, th, 0, 5.7, 5.7, 9 + r() * 4, roof);
  else for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { g.box(tx + s * 2.5, th, -2.4 + i * 1.6, 0.6, 0.8, 0.6, stone, 1); g.box(tx - 2.4 + i * 1.6, th, s * 2.5, 0.6, 0.8, 0.6, stone, 1); }
  // tall lancet windows and the west door
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) g.quad([-L / 2 + 2 + i * 3.6, 2, s * (w / 2 + 0.05)], [-L / 2 + 2.9 + i * 3.6, 2, s * (w / 2 + 0.05)], [-L / 2 + 2.9 + i * 3.6, 5.4, s * (w / 2 + 0.05)], [-L / 2 + 2 + i * 3.6, 5.4, s * (w / 2 + 0.05)], GLASS2);
  g.push(tx + 2.8, 0, 0, Math.PI / 2); door(g, 0, 0, col(0x4a2a1a), 1.6, 3.2); g.quad([-0.5, th - 4, 0.05], [0.5, th - 4, 0.05], [0.5, th - 2.6, 0.05], [-0.5, th - 2.6, 0.05], DARK); g.pop();   // belfry louvre
  g.push(tx, th - 6.5, 2.76, 0, Math.PI / 2); g.cyl(0, 0, 0, 0.8, 0.06, 10, WHITE, 2); g.pop();   // the clock, facing the street
  // the churchyard: low wall and grave stones
  const yw = L + 16, yd = w + 14;
  for (const [x, z, a, l] of [[0, yd / 2, 0, yw], [0, -yd / 2, 0, yw], [yw / 2, 0, Math.PI / 2, yd], [-yw / 2, 0, Math.PI / 2, yd]]) { g.push(x, 0, z, a); g.box(0, -0.5, 0, l, 1.4, 0.5, stone, 1); g.pop(); }
  for (let i = 0; i < 26; i++) { const x = -yw / 2 + 2 + r() * (yw - 4), z = (r() < 0.5 ? 1 : -1) * (w / 2 + 1.5 + r() * (yd / 2 - w / 2 - 2.2)); g.box(x, -0.2, z, 0.5, 0.7 + r() * 0.5, 0.15, col(r.pick([0x8a8a84, 0x9a968c, 0x6e6e6a])), 1); }
  return [];
}
export function petrol(g, r, o) {   // 1980 filling station: canopy on posts, two pumps, kiosk, price sign
  const brand = col(r.pick([0xc8281e, 0x1e5aa8, 0xe0b020, 0x2a7a3a])), wall = col(0xe8e6e0);
  plinth(g, 16, 12, o.drop, col(0x8a8a86));
  g.box(0, 0, -3.5, 7, 3, 5, wall, 1); g.box(0, 3, -3.5, 7.4, 0.5, 5.4, brand, 1);
  g.quad([-3, 0.4, -0.95], [2, 0.4, -0.95], [2, 2.4, -0.95], [-3, 2.4, -0.95], GLASS2);
  for (const [x, z] of [[-4, 2], [4, 2], [-4, 5], [4, 5]]) g.cyl(x, 0, z, 0.15, 4.4, 6, WHITE, 0);
  g.box(0, 4.4, 3.5, 10.5, 0.7, 5.5, brand, 0, WHITE);
  for (const x of [-2, 2]) { g.box(x, 0, 3.5, 0.9, 0.25, 1.6, STEP, 1); g.box(x, 0.25, 3.5, 0.6, 1.6, 0.5, WHITE, 1); g.box(x, 1.85, 3.5, 0.62, 0.3, 0.52, brand, 1); }
  g.cyl(7, 0, 5.5, 0.12, 5.5, 6, METAL, 0); g.box(7, 5.5, 5.5, 1.8, 1.6, 0.2, brand, 0, WHITE);
  return [];
}
export function hall(g, r, o) {   // village hall / chapel / school: long single storey
  const w = o.w, d = o.d, wall = col(o.wall), roof = col(o.roof);
  plinth(g, w, d, o.drop, col(r.pick(PAL.stone)));
  g.box(0, 0, 0, w, 3.6, d, wall, 1); g.gable(0, 3.6, 0, w, d, d * 0.4, roof, wall, 0.4);
  door(g, 0, d / 2, col(o.door), 1.6, 2.4); windowsAround(g, w, d, 1, 3.6, { skip: 0, w: 1.4, h: 1.7, spacing: 3.2, sides: false });
  return [];
}
// ------------------------------------------------------------------------------------------- the farm
export function barn(g, r, o) {
  const w = o.w, d = o.d, H = o.h || 5.5, tin = r() < 0.5, wall = col(tin ? r.pick([0x7a3a2a, 0x8a8a84, 0x4a5a4a]) : r.pick(PAL.stone)), roof = col(r.pick([0x7a3a2a, 0x7d8288, 0x5a5f66, 0x6a4a3a]));
  plinth(g, w, d, o.drop, col(0x8a857a));
  g.box(0, 0, 0, w, H, d, wall, 1); g.gable(0, H, 0, w, d, d * 0.32, roof, wall, 0.3);
  g.quad([-2.2, 0, d / 2 + 0.05], [2.2, 0, d / 2 + 0.05], [2.2, 4.2, d / 2 + 0.05], [-2.2, 4.2, d / 2 + 0.05], tin ? shade(wall, 0.7) : WOOD);   // big door
  if (tin) for (let i = 0; i < Math.floor(w / 2); i++) g.quad([-w / 2 + i * 2 + 0.95, 0, d / 2 + 0.02], [-w / 2 + i * 2 + 1.05, 0, d / 2 + 0.02], [-w / 2 + i * 2 + 1.05, H, d / 2 + 0.02], [-w / 2 + i * 2 + 0.95, H, d / 2 + 0.02], shade(wall, 0.8));   // corrugations
  return [];
}
export function openShed(g, r, o) {   // Dutch barn / implement shed: a roof on posts with hay or a tractor under it
  const w = o.w, d = o.d, H = 4.5, roof = col(r.pick([0x7a3a2a, 0x7d8288, 0x5a5f66]));
  for (let i = 0; i <= 3; i++) for (const s of [-1, 1]) g.box(-w / 2 + i * w / 3, -o.drop, s * d / 2, 0.3, H + o.drop, 0.3, METAL, 1);
  g.gable(0, H, 0, w, d, 1.2, roof, null, 0.3);
  if (r() < 0.6) for (let i = 0; i < 5; i++) for (let k = 0; k < 2; k++) g.box(-w / 2 + 1.2 + i * (w - 2.4) / 4, k * 1.0, 0, 1.6, 1.0, d - 1.4, col(0xc8b060), 1);   // hay
  return [];
}
export function silo(g, r, o) { const c = col(r.pick([0x9aa0a6, 0x5a6a5a, 0x7a4a3a])); g.cyl(0, -o.drop, 0, 2.2, 11 + o.drop, 10, c, 0); g.cyl(0, 11, 0, 2.2, 1.6, 10, shade(c, 0.85), 0, 0.3); g.strut([2.3, 0, 0], [2.3, 12, 0], 0.08, METAL); return []; }
export function bales(g, r, n, color) { for (let i = 0; i < n; i++) g.cylX(i * 1.6 - n * 0.8, 0.75, 0, 0.75, 1.2, 8, col(color || 0xc0a050), col(0xa08a40)); }
// a tractor (1980 Massey / Ford style): red or blue body, big rear wheels
export function tractor(g, r) {
  const b = col(r.pick([0xb0281e, 0x2a4a8a, 0x3a6a2a, 0xc8a020])), t = BLACK;
  g.box(0, 0.8, 0.6, 1.0, 0.9, 2.2, b, 1); g.box(0, 1.6, -0.6, 1.3, 1.2, 1.2, b, 1); g.box(0, 2.8, -0.6, 1.4, 0.1, 1.3, WHITE, 0);
  for (const [x, z, rr] of [[0.85, -0.7, 0.75], [-0.85, -0.7, 0.75], [0.7, 1.3, 0.42], [-0.7, 1.3, 0.42]]) g.push(x, rr, z, 0, 0, Math.PI / 2).cyl(0, -0.22, 0, rr, 0.44, 8, t, 3, rr, METAL).pop();
}
// ------------------------------------------------------------------------------------------- harbour and coast
// a timber pier on piles from the quay out over the water: len metres along local +z, deck at y = 0
export function pier(g, r, len, seaY0 = -4) {
  const deck = col(0x7a6248), pile = col(0x4a3a2a), w = 3;
  for (let z = 0; z < len; z += 4) { g.box(0, -0.25, z + 2, w, 0.25, 4, deck, 0); for (const s of [-1, 1]) g.cyl(s * (w / 2 - 0.15), seaY0, z + 4, 0.16, -seaY0 + 0.6, 6, pile, 0); }
  for (let z = 0; z < len; z += 8) for (const s of [-1, 1]) g.cyl(s * (w / 2 - 0.2), 0, z + 2, 0.12, 0.45, 5, BLACK, 2);   // bollards
  g.box(0, -0.25, len + 1.5, w + 4, 0.25, 3, deck, 0);   // the T head
  for (const s of [-1, 1]) g.cyl(s * (w / 2 + 1.8), seaY0, len + 2.8, 0.18, -seaY0 + 0.6, 6, pile, 0);
}
// the quay: a stone harbour wall round the quay disc, faced down to the sea floor, with clutter
export function quayWall(g, r, rad, h, faceA) {   // faceA: the local angle the open water lies in
  const stone = col(0x8a857a);
  for (let i = -4; i <= 4; i++) { const a = faceA + i * 0.18, x = Math.cos(a) * rad, z = Math.sin(a) * rad; g.push(x, 0, z, -a); g.box(0, -h, 0, 1.2, h + 0.35, rad * 0.19, stone, 1); g.pop(); }
}
export function boatShed(g, r, o) { const w = 6, d = 10, wall = col(r.pick([0x5a3a2a, 0x3a4a5a, 0x7a2a22, 0xd8d0c0])), roof = col(r.pick([0x3d424a, 0x7a3a2a])); plinth(g, w, d, o.drop, col(0x8a857a)); g.box(0, 0, 0, w, 3.6, d, wall, 1); g.gable(0, 3.6, 0, w, d, 1.6, roof, wall, 0.25); g.quad([-2, 0, d / 2 + 0.05], [2, 0, d / 2 + 0.05], [2, 3, d / 2 + 0.05], [-2, 3, d / 2 + 0.05], shade(wall, 0.6)); return []; }
export function lobsterPots(g, r, n) { for (let i = 0; i < n; i++) g.box((i % 4) * 0.7, Math.floor(i / 4) * 0.45, Math.floor(i / 8) * 0.7, 0.6, 0.42, 0.6, col(r.pick([0x6a5a3a, 0x3a5a6a, 0x8a3a2a])), 1); }
export function lighthouse(g, r, o) {   // white tower with a red band, gallery, lantern; keeper's cottage beside it
  const H = o.h || 18, wht = col(0xf0eee8), red = col(0xb02a22);
  g.cyl(0, -o.drop, 0, 2.6, o.drop + 0.5, 12, col(0x9a958a), 2);
  g.cyl(0, 0.5, 0, 2.2, H * 0.4, 12, wht, 0, 1.95); g.cyl(0, 0.5 + H * 0.4, 0, 1.95, H * 0.2, 12, red, 0, 1.8); g.cyl(0, 0.5 + H * 0.6, 0, 1.8, H * 0.4, 12, wht, 0, 1.6);
  const top = 0.5 + H;
  g.cyl(0, top, 0, 2.3, 0.3, 12, BLACK, 3); g.cyl(0, top + 0.3, 0, 1.1, 1.8, 8, col(0xd8f0f8), 0); g.cyl(0, top + 2.1, 0, 1.3, 1.0, 8, red, 2, 0.15);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.strut([Math.cos(a) * 2.2, top + 0.3, Math.sin(a) * 2.2], [Math.cos(a) * 2.2, top + 1.2, Math.sin(a) * 2.2], 0.05, BLACK); }
  g.push(5.5, 0, 0); cottage(g, r, { w: 6, d: 5, wall: 0xf0eee8, roof: 0x3d424a, door: 0x2a4a7a, drop: o.drop }); g.pop();
  return { lamp: [0, top + 1.2, 0] };
}
// ------------------------------------------------------------------------------------------- infrastructure
export function mast(g, r, o) {   // a guyed radio / TV mast with red and white bands and an equipment hut
  const H = o.h || 70, s = 1.0, bands = 7, red = col(0xc0281e), wht = col(0xeeeeea);
  for (let i = 0; i < bands; i++) {
    const y0 = H * i / bands, y1 = H * (i + 1) / bands, c = i % 2 ? wht : red;
    for (let k = 0; k < 3; k++) { const a0 = k * 2.094, a1 = a0 + 2.094; g.strut([Math.cos(a0) * s, y0, Math.sin(a0) * s], [Math.cos(a0) * s, y1, Math.sin(a0) * s], 0.12, c); g.strut([Math.cos(a0) * s, y0, Math.sin(a0) * s], [Math.cos(a1) * s, y1, Math.sin(a1) * s], 0.05, c); }
  }
  g.box(0, -o.drop, 0, 3, o.drop, 3, col(0x8a8a86), 1);
  g.push(7, 0, 4); g.box(0, -o.drop, 0, 4, o.drop + 2.6, 3, col(0xc8c4b8), 1); g.box(0, 2.6, 0, 4.3, 0.2, 3.3, DARK, 0); g.pop();
  return { top: [0, H, 0], guys: [0.3, 0.6, 0.9].map(f => f * H) };
}
export function phoneBox(g) { g.box(0, 0, 0, 0.95, 2.5, 0.95, RED, 1); g.box(0, 2.5, 0, 1.05, 0.2, 1.05, RED, 0); for (let i = 0; i < 4; i++) { g.push(0, 0, 0, i * Math.PI / 2); g.quad([-0.35, 0.9, 0.49], [0.35, 0.9, 0.49], [0.35, 2.2, 0.49], [-0.35, 2.2, 0.49], GLASS2); g.pop(); } }
export function busShelter(g) { const c = col(0x4a6a5a); g.box(0, 0, -0.7, 3, 2.3, 0.1, c, 1); for (const x of [-1.5, 1.5]) g.box(x, 0, 0, 0.1, 2.3, 1.4, c, 1); g.box(0, 2.3, 0, 3.2, 0.12, 1.6, c, 0); g.cyl(2.2, 0, 0.8, 0.05, 2.5, 5, METAL, 0); g.cyl(2.2, 2.5, 0.8, 0.3, 0.05, 8, col(0xd8b030), 2); }
export function memorial(g, r) { const s = col(0x9a958a); g.box(0, -0.3, 0, 2.6, 0.6, 2.6, s, 1); g.box(0, 0.3, 0, 1.6, 0.5, 1.6, s, 1); g.box(0, 0.8, 0, 0.7, 3.2, 0.7, shade(s, 1.08), 1); g.box(0, 3.4, 0, 1.6, 0.35, 0.35, s, 0); }
export function bench(g) { g.box(0, 0.42, 0, 1.6, 0.06, 0.45, WOOD2, 0); g.box(0, 0.5, -0.22, 1.6, 0.45, 0.05, WOOD2, 0); for (const x of [-0.7, 0.7]) g.box(x, 0, 0, 0.06, 0.42, 0.45, BLACK, 1); }
export function lamp(g) { g.cyl(0, 0, 0, 0.07, 5.5, 5, col(0x3a4a3a), 0); g.strut([0, 5.4, 0], [0, 5.6, 1.1], 0.06, col(0x3a4a3a)); g.box(0, 5.35, 1.15, 0.35, 0.18, 0.6, col(0xe8e4c8), 0); }
export function roadSign(g, r) { g.cyl(0, 0, 0, 0.05, 2.2, 5, METAL, 0); g.box(0, 2.2, 0, 1.4, 0.45, 0.05, r() < 0.5 ? WHITE : col(0x1e4a8a), 0); g.box(0, 2.0, 0.03, 0.05, 0.08, 0.06, DARK, 0); }
export function postBox(g) { g.cyl(0, 0, 0, 0.3, 1.5, 8, RED, 2); g.box(0, 1.1, 0.27, 0.35, 0.06, 0.05, BLACK, 0); }
// laundry line between two posts, with washing on it (colourful)
export function laundry(g, r, len = 6) {
  g.cyl(-len / 2, 0, 0, 0.05, 2.1, 4, WOOD, 0); g.cyl(len / 2, 0, 0, 0.05, 2.1, 4, WOOD, 0);
  g.strut([-len / 2, 2.0, 0], [len / 2, 2.0, 0], 0.02, WHITE);
  for (let x = -len / 2 + 0.6; x < len / 2 - 0.5; x += 0.55 + r() * 0.4) { const w = 0.35 + r() * 0.45, h = 0.4 + r() * 0.6, c = col(r.pick([0xf0f0ea, 0xd8e4f0, 0xc84a3a, 0x3a5a9a, 0xe8d06a, 0x6a9a5a, 0xe8b8c8, 0xf0f0ea])); g.quad([x, 2.0 - h, 0], [x + w, 2.0 - h, 0], [x + w, 2.0, 0], [x, 2.0, 0], c); g.quad([x + w, 2.0 - h, 0], [x, 2.0 - h, 0], [x, 2.0, 0], [x + w, 2.0, 0], c); x += w; }
}
export function shed(g, r, o) { const c = col(r.pick([0x5a4a32, 0x3a5a3a, 0x6a6a5a])); g.box(0, -o.drop, 0, 2.2, 2.0 + o.drop, 2.6, c, 1); g.gable(0, 2.0, 0, 2.2, 2.6, 0.5, col(0x3a3a3a), c, 0.1); }
export function woodpile(g, r) { for (let i = 0; i < 3; i++) g.cylX(0, 0.25 + i * 0.4, 0, 0.22, 2.2, 5, WOOD2, col(0xb89a6a)); }
export function garageBox(g, r, o) { const c = col(r.pick(PAL.walls)); g.box(0, -o.drop, 0, 3.2, 2.5 + o.drop, 5.5, c, 1); g.box(0, 2.5, 0, 3.4, 0.15, 5.7, DARK, 0); g.quad([-1.3, 0, 2.77], [1.3, 0, 2.77], [1.3, 2.1, 2.77], [-1.3, 2.1, 2.77], col(r.pick([0xd8d8d0, 0x5a7a5a, 0x7a5a3a]))); }

// ------------------------------------------------------------------------------------------- vehicles (static)
// a parked 1980 car (hatchback / saloon / estate): body, glasshouse, wheels. Front along local +z.
export function car(g, r, paint, kind) {
  const p = col(paint), k = kind || r.pick(['saloon', 'hatch', 'estate', 'saloon']), L = k === 'hatch' ? 3.7 : 4.3, wb = L * 0.6;
  g.box(0, 0.3, 0, 1.66, 0.62, L, p, 1);
  const rl = k === 'saloon' ? L * 0.48 : k === 'hatch' ? L * 0.52 : L * 0.62, rz = k === 'saloon' ? -0.1 : k === 'hatch' ? -0.35 : -0.45;
  g.box(0, 0.92, rz, 1.5, 0.5, rl, GLASS2, 1); g.box(0, 1.42, rz, 1.46, 0.05, rl - 0.2, p, 0);
  for (const [x, z] of [[0.75, wb / 2], [-0.75, wb / 2], [0.75, -wb / 2], [-0.75, -wb / 2]]) g.push(x, 0.31, z, 0, 0, Math.PI / 2).cyl(0, -0.1, 0, 0.31, 0.2, 7, BLACK, 0).pop();
  g.box(0, 0.38, L / 2 + 0.03, 1.6, 0.12, 0.06, METAL, 0); g.box(0, 0.38, -L / 2 - 0.03, 1.6, 0.12, 0.06, METAL, 0);
  for (const x of [-0.55, 0.55]) { g.box(x, 0.6, L / 2 + 0.01, 0.3, 0.16, 0.04, col(0xf0f0e0), 0); g.box(x, 0.6, -L / 2 - 0.01, 0.3, 0.14, 0.04, RED, 0); }
}
