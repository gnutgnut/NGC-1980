// ngc/world-polish: the second batch of 1980 kit for the lived-in world (pure, worker-safe recipes on kit.js's Geo).
// The pub, the village school, the chapel and the village hall; street furniture (K6 phone box, pillar box, concrete
// lamp columns, litter bins, the 30 limit and village name signs, fingerposts, bus stop flags, picnic tables); parked
// 1980 cars by kind (saloon, hatchback, estate, Mini, van) with chrome bumpers and UK plates; the harbour (slipway,
// hand crane, fish boxes, nets, the harbour office, a fuel tank, boats hauled up on the hard, mooring buoys); the
// farmyard (milking parlour with its feed hopper, bale stack, muck heap, trough, tipping trailer, the milk churn stand
// at the road end, the farm Land Rover); and the damaged / ruined state of every building.
// Local frames as models.js: front (street side) along +z, floor at y = 0, `drop` metres of plinth below it.
import { col, shade, mixc } from './kit.js';
import { PAL } from './models.js';   // (an import cycle: models.js draws the pub front from here, so PAL is only read inside functions)

// models.js's C colours (repeated here: the cycle means C may not exist yet while this module evaluates)
const GLASS = col(0x2b3846), FRAME = col(0xeceae2), DARK = col(0x2a2a2a), METAL = col(0x7c8186), WOOD2 = col(0x8a6a48);
const STEP = col(0x9a958a), RED = col(0xa8281e), WHITE = col(0xeeeeea), BLACK = col(0x1c1c1e), YELLOW = col(0xd9b23a);
const GLASS2 = col(0x3d4e5c), CREAM = col(0xe8dfc0), CONC = col(0xa8a49a), CONC2 = col(0x8e8b84), TARMAC = col(0x3e3f42);
const CHAR = col(0x2a2622), CHAR2 = col(0x3c3630), SOOT = col(0x1e1c1a), ASH = col(0x6a645a);

// a window with glazing bars (a sash or a small-paned casement): frame, glass, nx x ny panes, on the plane z = zf
export function paneWin(g, cx, y0, zf, w, h, nx = 2, ny = 2, frame = FRAME) {
  g.quad([cx - w / 2 - 0.1, y0 - 0.1, zf + 0.03], [cx + w / 2 + 0.1, y0 - 0.1, zf + 0.03], [cx + w / 2 + 0.1, y0 + h + 0.1, zf + 0.03], [cx - w / 2 - 0.1, y0 + h + 0.1, zf + 0.03], frame);
  g.quad([cx - w / 2, y0, zf + 0.06], [cx + w / 2, y0, zf + 0.06], [cx + w / 2, y0 + h, zf + 0.06], [cx - w / 2, y0 + h, zf + 0.06], GLASS);
  for (let i = 1; i < nx; i++) { const x = cx - w / 2 + i * w / nx; g.quad([x - 0.025, y0, zf + 0.08], [x + 0.025, y0, zf + 0.08], [x + 0.025, y0 + h, zf + 0.08], [x - 0.025, y0 + h, zf + 0.08], frame); }
  for (let j = 1; j < ny; j++) { const y = y0 + j * h / ny; g.quad([cx - w / 2, y - 0.025, zf + 0.08], [cx + w / 2, y - 0.025, zf + 0.08], [cx + w / 2, y + 0.025, zf + 0.08], [cx - w / 2, y + 0.025, zf + 0.08], frame); }
  g.box(cx, y0 - 0.16, zf + 0.08, w + 0.3, 0.08, 0.16, STEP, 1);   // sill
}
// a cabin / glasshouse: bottom half width hw0 at y0 from zr (rear) to zf (front), top half width hw1 at y1, the rear
// pillar raked in by rr and the windscreen by rf; glass all round, the roof in paint
function cabin(g, zr, zf, y0, y1, rr, rf, hw0, hw1, glass, roof, bpil) {
  const BLr = [-hw0, y0, zr], BRr = [hw0, y0, zr], BLf = [-hw0, y0, zf], BRf = [hw0, y0, zf];
  const TLr = [-hw1, y1, zr + rr], TRr = [hw1, y1, zr + rr], TLf = [-hw1, y1, zf - rf], TRf = [hw1, y1, zf - rf];
  g.quad(BLf, BRf, TRf, TLf, glass); g.quad(BRr, BLr, TLr, TRr, glass);
  g.quad(BRf, BRr, TRr, TRf, glass); g.quad(BLr, BLf, TLf, TLr, glass);
  g.quad(TLf, TRf, TRr, TLr, roof);
  if (bpil != null) for (const s of [1, -1]) {   // the B pillar in paint, just proud of the glass
    const zb = bpil, zt = bpil + (rr - rf) * 0.5, x0 = s * (hw0 + 0.01), x1 = s * (hw1 + 0.01);
    const P = [[x0, y0, zb - 0.07], [x0, y0, zb + 0.07], [x1, y1, zt + 0.07], [x1, y1, zt - 0.07]];
    if (s > 0) g.quad(P[1], P[0], P[3], P[2], roof); else g.quad(P[0], P[1], P[2], P[3], roof);
  }
}
const wheel = (g, x, z, r, w = 0.18) => g.push(x, r, z, 0, 0, Math.PI / 2).cyl(0, -w / 2, 0, r, w, 7, BLACK, 3, r, METAL).pop();
// ------------------------------------------------------------------------------------------- 1980 cars, parked
// kinds: saloon (Cortina / Marina), hatch (Escort / Golf / Allegro), estate, mini, van (Transit / Bedford CF). Front +z.
export const CAR_DIMS = { saloon: [4.3, 1.7, 1.38], hatch: [3.9, 1.62, 1.38], estate: [4.4, 1.7, 1.42], mini: [3.05, 1.41, 1.35], van: [4.5, 1.9, 2.05] };
export function car2(g, r, paint, kind = 'saloon') {
  const p = col(paint), [L, W, H] = CAR_DIMS[kind] || CAR_DIMS.saloon, hw = W / 2, wr = kind === 'mini' ? 0.26 : kind === 'van' ? 0.35 : 0.31;
  const wb = kind === 'mini' ? L * 0.66 : L * 0.6, under = shade(p, 0.55);
  g.box(0, 0.16, 0, W - 0.1, 0.12, L - 0.3, DARK, 1);   // floor pan / sills in shadow
  if (kind === 'van') {
    const zc = L / 2 - 1.75;
    g.box(0, 0.28, (-L / 2 + zc) / 2, W, H - 0.3, zc + L / 2, p, 1);       // the box body behind the cab
    g.box(0, 0.28, zc + 0.475, W - 0.04, 0.62, 0.95, p, 1);                 // the cab's lower half
    g.box(0, 0.28, L / 2 - 0.4, W - 0.06, 0.55, 0.8, p, 1);                 // the short bonnet
    cabin(g, zc, L / 2 - 0.8, 0.9, H - 0.05, 0, 0.42, hw - 0.02, hw - 0.06, GLASS2, p, null);
    g.quad([-hw - 0.01, 0.3, -L / 2 + 0.6], [-hw - 0.01, 0.3, L / 2 - 1.9], [-hw - 0.01, 0.34, L / 2 - 1.9], [-hw - 0.01, 0.34, -L / 2 + 0.6], DARK);   // the sliding door's rail
    g.box(0, H - 0.02, -0.6, W - 0.3, 0.06, L - 1.8, shade(p, 0.9), 0);      // roof ribs
  } else {
    const waist = kind === 'mini' ? 0.82 : 0.86;
    g.box(0, 0.28, 0, W, waist - 0.28, L, p, 1);
    // the bonnet and boot lids, a shade off the flanks; wheel arches
    g.box(0, waist - 0.02, L * 0.33, W - 0.12, 0.04, L * 0.3, shade(p, 1.06), 0);
    const zr = kind === 'saloon' ? -L * 0.28 : kind === 'estate' ? -L / 2 + 0.12 : kind === 'mini' ? -L / 2 + 0.3 : -L / 2 + 0.22;
    const zf = kind === 'mini' ? L * 0.16 : L * 0.12, rr = kind === 'saloon' ? 0.45 : kind === 'estate' ? 0.06 : kind === 'mini' ? 0.12 : 0.55;
    cabin(g, zr, zf, waist, H, rr, kind === 'mini' ? 0.22 : 0.5, hw - 0.03, hw - 0.14, GLASS2, p, kind === 'mini' ? null : (zr + zf) / 2);
    if (kind === 'estate' && r() < 0.5) for (const s of [-1, 1]) g.box(s * (hw - 0.2), H, -0.2, 0.05, 0.05, L * 0.55, METAL, 0);   // roof rails
  }
  for (const [x, z] of [[hw - 0.06, wb / 2], [-hw + 0.06, wb / 2], [hw - 0.06, -wb / 2], [-hw + 0.06, -wb / 2]]) { wheel(g, x, z, wr); g.box(x, wr + 0.02, z, 0.08, 0.3, wr * 2.3, under, 3); }
  // chrome bumpers, the grille, lamps, UK plates (white front, yellow rear)
  for (const s of [1, -1]) g.box(0, 0.3, s * (L / 2 + 0.04), W + 0.02, 0.13, 0.1, kind === 'van' ? DARK : METAL, 0);
  g.quad([-0.45, 0.48, L / 2 + 0.005], [0.45, 0.48, L / 2 + 0.005], [0.45, 0.7, L / 2 + 0.005], [-0.45, 0.7, L / 2 + 0.005], DARK);
  for (const x of [-hw + 0.25, hw - 0.25]) {
    g.quad([x - 0.13, 0.52, L / 2 + 0.01], [x + 0.13, 0.52, L / 2 + 0.01], [x + 0.13, 0.7, L / 2 + 0.01], [x - 0.13, 0.7, L / 2 + 0.01], col(0xf2f0e2));
    g.quad([-x - 0.12, 0.5, -L / 2 - 0.01], [-x + 0.12, 0.5, -L / 2 - 0.01], [-x + 0.12, 0.7, -L / 2 - 0.01], [-x - 0.12, 0.7, -L / 2 - 0.01], RED);
  }
  g.quad([-0.26, 0.38, L / 2 + 0.1], [0.26, 0.38, L / 2 + 0.1], [0.26, 0.5, L / 2 + 0.1], [-0.26, 0.5, L / 2 + 0.1], WHITE);
  g.quad([0.26, 0.42, -L / 2 - 0.01], [-0.26, 0.42, -L / 2 - 0.01], [-0.26, 0.54, -L / 2 - 0.01], [0.26, 0.54, -L / 2 - 0.01], YELLOW);
}
// the farm / coastguard Land Rover (Series III 109): boxy, spare wheel on the bonnet
export function landRover(g, r, paint) {
  const p = col(paint ?? r.pick([0x5a6a4a, 0x2a4a6a, 0xd8d4c4, 0x8a8a7a, 0x3a5a3a]));
  g.box(0, 0.4, 0, 1.68, 0.92, 4.4, p, 1); g.box(0, 1.32, -0.55, 1.64, 0.82, 2.9, r() < 0.5 ? col(0xe8e6dc) : p, 1);
  g.quad([-0.78, 1.36, 0.92], [0.78, 1.36, 0.92], [0.76, 1.9, 0.9], [-0.76, 1.9, 0.9], GLASS2);
  g.push(0, 1.33, 1.5, 0, -1.4).cyl(0, -0.1, 0, 0.36, 0.2, 7, BLACK, 3, 0.36, METAL).pop();
  for (const [x, z] of [[0.82, 1.4], [-0.82, 1.4], [0.82, -1.35], [-0.82, -1.35]]) wheel(g, x, z, 0.4, 0.24);
  g.box(0, 0.36, 2.25, 1.7, 0.14, 0.12, BLACK, 0); g.box(0, 0.36, -2.25, 1.7, 0.14, 0.12, BLACK, 0);
  g.quad([-0.6, 0.72, 2.205], [0.6, 0.72, 2.205], [0.6, 1.2, 2.205], [-0.6, 1.2, 2.205], DARK);
}
// ------------------------------------------------------------------------------------------- the pub
// drawn by models.js terrace() for unit 0 of a pub (o.pub): painted ground floor, bay windows with small panes, the
// fascia with its name in cream letters, the hanging sign on its bracket, a lantern over the door, hanging baskets.
// The door stays where rooms.js puts a shop's (uw / 2 - 0.85), so the bar inside meets it.
export function pubFront(g, r, uw, d, fh) {
  const pc = col(r.pick([0x1e3a2a, 0x5a1a1a, 0x1a1a1a, 0x22304a, 0x4a2a1a])), zf = d / 2;
  g.box(0, 0, zf + 0.02, uw, 0.85, 0.12, pc, 1);   // painted dado
  const x0 = -uw / 2 + 0.4, x1 = uw / 2 - 1.6, n = (x1 - x0) > 4.4 ? 2 : 1, bw = Math.min(2.4, (x1 - x0) / n - 0.4);
  for (let i = 0; i < n; i++) {   // shallow bay windows: a timber box with small panes
    const cx = x0 + (i + 0.5) * (x1 - x0) / n;
    g.box(cx, 0.55, zf + 0.25, bw + 0.3, 0.3, 0.5, pc, 1); g.box(cx, 2.35, zf + 0.25, bw + 0.3, 0.12, 0.5, pc, 0);
    paneWin(g, cx, 0.85, zf + 0.42, bw, 1.45, 4, 3, CREAM);
  }
  g.box(0, 2.6, zf + 0.06, uw - 0.1, 0.6, 0.18, pc, 1);   // the fascia
  const nl = 7 + Math.floor(r() * 6), lx = -nl * 0.17;
  for (let k = 0; k < nl; k++) if (r() > 0.12) g.quad([lx + k * 0.34, 2.72, zf + 0.16], [lx + k * 0.34 + 0.22, 2.72, zf + 0.16], [lx + k * 0.34 + 0.22, 3.08, zf + 0.16], [lx + k * 0.34, 3.08, zf + 0.16], CREAM);
  const dx = uw / 2 - 0.85;
  g.quad([dx - 0.5, 0, zf + 0.07], [dx + 0.5, 0, zf + 0.07], [dx + 0.5, 2.25, zf + 0.07], [dx - 0.5, 2.25, zf + 0.07], CREAM);
  g.quad([dx - 0.45, 0, zf + 0.09], [dx + 0.45, 0, zf + 0.09], [dx + 0.45, 2.1, zf + 0.09], [dx - 0.45, 2.1, zf + 0.09], shade(pc, 1.3));
  g.box(dx, 2.35, zf + 0.35, 0.22, 0.3, 0.22, BLACK, 0); g.box(dx, 2.38, zf + 0.35, 0.16, 0.22, 0.24, col(0xf0e0a0), 0);   // lantern
  // the hanging sign on a wrought-iron bracket at the first floor, square to the street
  const sx = -uw / 2 + 0.3;
  g.strut([sx, fh + 0.9, zf], [sx, fh + 0.9, zf + 1.3], 0.05, BLACK); g.strut([sx, fh + 0.4, zf], [sx, fh + 0.9, zf + 0.9], 0.03, BLACK);
  g.box(sx, fh - 0.35, zf + 0.85, 0.08, 1.15, 0.9, pc, 0);
  const pic = [col(r.pick([0xb8302a, 0x2a5a9a, 0xd8b030, 0x3a7a3a, 0xe8e0d0])), col(r.pick([0xe8e0d0, 0x1a1a1a, 0xa86a2a, 0x5a8ac8]))];
  for (const s of [1, -1]) { g.push(sx + s * 0.045, fh - 0.25, zf + 0.85, s * Math.PI / 2); g.quad([-0.35, 0, 0], [0.35, 0, 0], [0.35, 0.85, 0], [-0.35, 0.85, 0], pic[0]); g.quad([-0.2, 0.15, 0.005], [0.2, 0.15, 0.005], [0.12, 0.6, 0.005], [-0.12, 0.6, 0.005], pic[1]); g.pop(); }
  for (const x of [x0 - 0.1, dx - 0.75]) { g.strut([x, 2.5, zf + 0.05], [x, 2.5, zf + 0.4], 0.03, BLACK); g.blob(x, 2.15, zf + 0.42, 0.28, 0.22, 0.28, col(r.pick([0xc83a5a, 0xd8a83a, 0xe85a3a])), col(0x3a7a2a)); }
}
export function picnic(g, r) {   // a pub's picnic table, benches either side
  const w = WOOD2;
  g.box(0, 0.72, 0, 1.8, 0.05, 0.75, w, 0); for (const s of [-1, 1]) g.box(0, 0.42, s * 0.62, 1.8, 0.04, 0.28, w, 0);
  for (const x of [-0.7, 0.7]) for (const s of [-1, 1]) g.strut([x, 0, s * 0.75], [x, 0.72, 0], 0.06, shade(w, 0.8));
}
// ------------------------------------------------------------------------------------------- the village school
// footprint w x d: the schoolroom (Victorian board school: stone, tall many-paned windows, BOYS / GIRLS porches, the
// bell-cote on the gable) across the back 8 m; the playground in front, tarmac with hopscotch and a netball ring,
// iron railings with a gate
export function school(g, r, o) {
  const w = o.w, d = o.d, bd = 8, bz = -d / 2 + bd / 2, H = 4.2, stone = col(r.pick([0x8f897c, 0x9a9384, 0xa0624a, 0x86463a])), roof = col(r.pick([0x3d424a, 0x4b515b]));
  g.box(0, -o.drop, 0, w + 0.24, o.drop + 0.12, d + 0.24, col(0x8a857a), 1);
  g.box(0, 0.12, bz + bd / 2 + (d - bd) / 2, w - 0.6, 0.04, d - bd - 0.6, TARMAC, 1);   // the playground
  const pz = bz + bd / 2 + (d - bd) / 2, ln = WHITE;
  for (let k = 0; k < 8; k++) { const x = -w / 2 + 2.2 + (k % 2) * 0.6 * (k > 2 && k < 6 ? 1 : 0), z = pz - 2 + Math.floor(k) * 0.6; g.quad([x, 0.17, z], [x + 0.5, 0.17, z], [x + 0.5, 0.17, z - 0.5], [x, 0.17, z - 0.5], ln); }   // hopscotch
  g.cyl(w / 2 - 3, 0.12, pz, 0.05, 3.05, 5, METAL, 0); g.cyl(w / 2 - 3, 3.05, pz + 0.25, 0.25, 0.04, 8, col(0xc04020), 0, 0.25);   // netball ring
  g.push(0, 0, bz);
  g.box(0, 0, 0, w, H, bd, stone, 1); g.gable(0, H, 0, w, bd, bd * 0.62, roof, stone, 0.4);
  const nw = Math.floor((w - 6) / 2.6);
  for (let i = 0; i < nw; i++) { const cx = -w / 2 + 3 + (i + 0.5) * (w - 6) / nw; paneWin(g, cx, 1.0, bd / 2, 1.4, 2.4, 3, 4); }
  for (const s of [-1, 1]) {   // the two porches, a plaque over each
    g.push(s * (w / 2 - 1.6), 0, bd / 2 + 1.1); g.box(0, 0, 0, 2.4, 2.9, 2.2, stone, 1); g.gable(0, 2.9, 0, 2.4, 2.2, 1.1, roof, stone, 0.12).pop();
    g.push(s * (w / 2 - 1.6), 0, bd / 2 + 2.2); g.quad([-0.5, 0, 0.02], [0.5, 0, 0.02], [0.5, 2.1, 0.02], [-0.5, 2.1, 0.02], col(r.pick([0x2a4a7a, 0x2f5a3a, 0x5a3a22]))); g.quad([-0.45, 2.35, 0.02], [0.45, 2.35, 0.02], [0.45, 2.65, 0.02], [-0.45, 2.65, 0.02], CREAM); g.pop();
  }
  g.push(w / 2 + 0.05, H + bd * 0.62 - 0.3, 0); g.box(0, 0, 0, 0.9, 1.1, 0.9, stone, 1); g.pyramid(0, 1.1, 0, 1.2, 1.2, 0.8, roof); g.cyl(0, 0.35, 0, 0.18, 0.4, 6, col(0x8a6a2a), 2, 0.08); g.pop();   // bell-cote
  for (const s of [-1, 1]) { g.box(s * (w / 2 - 4.5), H + bd * 0.3, 0, 0.8, 1.9, 0.6, stone, 1); }   // chimney stacks
  g.pop();
  // railings along the street with the gate in the middle
  const rz = d / 2 - 0.15;
  for (const s of [-1, 1]) { const xa = s * 1.4, xb = s * (w / 2 - 0.2); g.strut([xa, 1.05, rz], [xb, 1.05, rz], 0.04, BLACK); g.strut([xa, 0.25, rz], [xb, 0.25, rz], 0.04, BLACK); for (let x = Math.min(xa, xb); x <= Math.max(xa, xb) + 1e-3; x += 0.5) g.box(x, 0.1, rz, 0.035, 1.15, 0.035, BLACK, 3); }
  for (const s of [-1, 1]) g.box(s * (w / 2 - 0.15), 0.1, 0, 0.08, 1.0, d - 0.4, stone, 1);   // side walls
}
// the SCHOOL warning sign (the 1975 children-crossing triangle) and other post signs: kind 'school' | 'limit' (30 in a
// red ring) | 'name' (the village name board) | 'finger' (a white fingerpost) | 'bus' (a bus stop flag)
export function postSign(g, r, kind) {
  const post = kind === 'finger' ? WHITE : METAL;
  g.cyl(0, 0, 0, kind === 'finger' ? 0.07 : 0.045, kind === 'finger' ? 2.6 : 2.4, 5, post, 0);
  if (kind === 'school' || kind === 'limit') {
    g.push(0, 2.0, 0.05);
    if (kind === 'school') { g.tri([-0.4, -0.3, 0], [0.4, -0.3, 0], [0, 0.42, 0], RED); g.tri([-0.29, -0.24, 0.01], [0.29, -0.24, 0.01], [0, 0.27, 0.01], WHITE); g.quad([-0.1, -0.2, 0.02], [0.04, -0.2, 0.02], [0.04, 0.08, 0.02], [-0.1, 0.08, 0.02], BLACK); g.box(0, -0.55, 0, 0.6, 0.18, 0.02, WHITE, 0); }
    else { g.push(0, 0, 0, 0, Math.PI / 2); g.cyl(0, 0, 0, 0.32, 0.03, 12, RED, 2); g.cyl(0, 0.03, 0, 0.24, 0.01, 12, WHITE, 2); g.pop(); g.quad([-0.1, -0.08, 0.05], [-0.02, -0.08, 0.05], [-0.02, 0.1, 0.05], [-0.1, 0.1, 0.05], BLACK); g.quad([0.02, -0.08, 0.05], [0.1, -0.08, 0.05], [0.1, 0.1, 0.05], [0.02, 0.1, 0.05], BLACK); }
    g.pop();
  } else if (kind === 'name') { g.cyl(1.4, 0, 0, 0.045, 1.6, 5, METAL, 0); g.box(0.7, 1.0, 0, 1.6, 0.6, 0.05, WHITE, 0); g.box(0.7, 1.05, 0.03, 1.2, 0.2, 0.01, BLACK, 0); }
  else if (kind === 'finger') { for (const [y, a] of [[2.3, 0.4 + r() * 0.6], [2.05, -0.8 - r() * 0.8]]) g.push(0, y, 0, a).box(0.55, 0, 0, 1.0, 0.18, 0.04, WHITE, 0).box(0.5, 0.05, 0.025, 0.7, 0.07, 0.01, BLACK, 0).pop(); g.box(0, 2.6, 0, 0.18, 0.12, 0.18, RED, 0); }
  else if (kind === 'bus') { g.box(0.22, 2.0, 0, 0.42, 0.42, 0.04, col(0xd8b030), 0); g.box(0.22, 2.0, 0.025, 0.3, 0.1, 0.01, col(0x1e4a8a), 0); g.box(0, 1.4, 0.06, 0.3, 0.4, 0.04, WHITE, 0); }
}
// a K6 kiosk: red cast iron, domed roof, the TELEPHONE strip under the crown, glazing bars over every pane
export function phoneK6(g) {
  g.box(0, 0, 0, 0.92, 0.25, 0.92, RED, 1); g.box(0, 0.25, 0, 0.9, 2.2, 0.9, RED, 1);
  g.box(0, 2.45, 0, 0.98, 0.18, 0.98, RED, 1); g.box(0, 2.63, 0, 0.84, 0.12, 0.84, RED, 0); g.pyramid(0, 2.75, 0, 0.84, 0.84, 0.14, RED);
  for (let i = 0; i < 4; i++) {
    g.push(0, 0, 0, i * Math.PI / 2);
    g.quad([-0.33, 0.45, 0.455], [0.33, 0.45, 0.455], [0.33, 2.25, 0.455], [-0.33, 2.25, 0.455], GLASS2);
    for (let j = 1; j < 8; j++) { const y = 0.45 + j * 1.8 / 8; g.quad([-0.33, y - 0.02, 0.465], [0.33, y - 0.02, 0.465], [0.33, y + 0.02, 0.465], [-0.33, y + 0.02, 0.465], RED); }
    for (const x of [-0.11, 0.11]) g.quad([x - 0.02, 0.45, 0.465], [x + 0.02, 0.45, 0.465], [x + 0.02, 2.25, 0.465], [x - 0.02, 2.25, 0.465], RED);
    g.quad([-0.3, 2.47, 0.5], [0.3, 2.47, 0.5], [0.3, 2.6, 0.5], [-0.3, 2.6, 0.5], col(0xf0f0e8));
    g.pop();
  }
}
export function pillarBox(g) {   // the cylindrical pillar box: black base, cap, slot, collection plate
  g.cyl(0, 0, 0, 0.3, 0.12, 9, BLACK, 0); g.cyl(0, 0.12, 0, 0.27, 1.25, 9, RED, 0); g.cyl(0, 1.37, 0, 0.32, 0.08, 9, RED, 2); g.cyl(0, 1.45, 0, 0.3, 0.1, 9, RED, 2, 0.1);
  g.box(0, 1.12, 0.26, 0.3, 0.05, 0.04, BLACK, 0); g.box(0, 0.75, 0.27, 0.16, 0.2, 0.02, WHITE, 0);
}
export function lampColumn(g) {   // a 1970s concrete column with a swan-neck bracket and a sodium lantern
  g.cyl(0, 0, 0, 0.11, 6.2, 6, CONC, 0, 0.08); g.strut([0, 6.1, 0], [0, 6.6, 0.5], 0.08, CONC); g.strut([0, 6.6, 0.5], [0, 6.5, 1.3], 0.07, CONC);
  g.box(0, 6.25, 1.35, 0.32, 0.22, 0.75, CONC2, 0); g.box(0, 6.2, 1.35, 0.24, 0.06, 0.6, col(0xe8b860), 0);
}
export function litterBin(g) { g.cyl(0, 0, 0, 0.05, 0.6, 4, BLACK, 0); g.cyl(0, 0.45, 0, 0.24, 0.6, 7, col(0x2a4a2a), 2, 0.26, BLACK); }
// ------------------------------------------------------------------------------------------- the chapel and the hall
// a nonconformist chapel, its gable end to the street: rendered or stone, two tall arched windows, the door under a
// pediment, the date stone, a railed forecourt. Footprint w (front) x d (deep).
export function chapel(g, r, o) {
  const w = o.w, d = o.d, H = 6.2, wall = col(r.pick([0xd8d2c4, 0xc9c0a8, 0x9a9384, 0xe6dccc])), roof = col(r.pick([0x3d424a, 0x4b515b]));
  g.box(0, -o.drop, 0, w + 0.24, o.drop + 0.25, d + 0.24, col(0x8a857a), 1);
  g.box(0, 0, -1, w, H, d - 2, wall, 1);
  g.push(0, 0, -1, Math.PI / 2); g.gable(0, H, 0, d - 2, w, w * 0.42, roof, wall, 0.3); g.pop();
  const zf = d / 2 - 1;
  for (const s of [-1, 1]) { paneWin(g, s * w * 0.27, 1.6, zf, 1.1, 3.0, 2, 5); g.tri([s * w * 0.27 - 0.65, 4.7, zf + 0.04], [s * w * 0.27 + 0.65, 4.7, zf + 0.04], [s * w * 0.27, 5.3, zf + 0.04], FRAME); }
  g.quad([-0.7, 0, zf + 0.05], [0.7, 0, zf + 0.05], [0.7, 2.6, zf + 0.05], [-0.7, 2.6, zf + 0.05], col(0x3a2a1a));
  g.box(0, 2.65, zf + 0.12, 2.0, 0.15, 0.25, shade(wall, 0.85), 0); g.tri([-1.0, 2.8, zf + 0.15], [1.0, 2.8, zf + 0.15], [0, 3.5, zf + 0.15], shade(wall, 0.85));
  g.quad([-0.7, 5.6, zf + 0.04], [0.7, 5.6, zf + 0.04], [0.7, 6.2, zf + 0.04], [-0.7, 6.2, zf + 0.04], shade(wall, 0.82));   // the date stone
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { g.push(s * w / 2, 0, -1 - (d - 2) / 2 + 1.6 + i * (d - 5.2) / 2, s * Math.PI / 2); paneWin(g, 0, 1.6, 0, 1.0, 2.6, 2, 4); g.pop(); }
  for (const s of [-1, 1]) { const xa = s * 1.0, xb = s * w / 2; g.strut([xa, 0.9, d / 2], [xb, 0.9, d / 2], 0.04, BLACK); for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x += 0.4) g.box(x, -0.2, d / 2, 0.03, 1.15, 0.03, BLACK, 3); g.strut([xb, 0.9, d / 2], [xb, 0.9, zf], 0.04, BLACK); }
}
// ------------------------------------------------------------------------------------------- the harbour
export function slipway(g, r, len, depth) {   // a concrete slip down into the water along +z, 4 m wide, weed on the lower half
  const n = Math.max(2, Math.round(len / 3));
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, y0 = -depth * t0, y1 = -depth * t1, z0 = t0 * len, z1 = t1 * len, c = t0 > 0.45 ? col(0x4a5a3a) : CONC;
    g.quad([-2, y0, z0], [-2, y1, z1], [2, y1, z1], [2, y0, z0], c);
    for (const s of [-1, 1]) { const x = s * 2; const a = [x, y0, z0], b = [x, y1, z1], a2 = [x, y0 - 3, z0], b2 = [x, y1 - 3, z1]; if (s > 0) g.quad(a2, b2, b, a, CONC2); else g.quad(b2, a2, a, b, CONC2); }
  }
}
export function handCrane(g) {   // a quayside hand crane: post, jib, the winch, the hook on its chain
  g.cyl(0, 0, 0, 0.22, 3.6, 6, col(0x2a4a3a), 2); g.strut([0, 1.0, 0], [0, 4.6, 2.6], 0.14, col(0x2a4a3a)); g.strut([0, 3.6, 0], [0, 4.6, 2.6], 0.06, BLACK);
  g.box(0, 1.1, -0.35, 0.5, 0.5, 0.4, col(0x2a4a3a), 1); g.strut([0, 4.6, 2.6], [0, 3.0, 2.6], 0.03, BLACK); g.box(0, 2.9, 2.6, 0.12, 0.2, 0.12, BLACK, 0);
}
export function fishBoxes(g, r, n = 9) { for (let i = 0; i < n; i++) g.box((i % 3) * 0.85, Math.floor(i / 6) * 0.32, (Math.floor(i / 3) % 2) * 0.58, 0.8, 0.3, 0.55, col(r.pick([0x2a5a9a, 0xd86a2a, 0xe8e6dc, 0x3a7a5a])), 1); }
export function netHeap(g, r) {
  const c = col(r.pick([0x3a6a4a, 0xc8642a, 0x2a4a6a]));
  g.blob(0, 0.3, 0, 1.3, 0.45, 0.9, c, shade(c, 0.8));
  for (let i = 0; i < 5; i++) g.blob(-1 + i * 0.5, 0.7, (r() - 0.5) * 0.8, 0.12, 0.12, 0.12, col(0xe8641e));
}
export function harbourOffice(g, r, o) {   // the harbour master's hut: timber, a big window to the water, a board
  const c = col(r.pick([0x2a4a6a, 0xe8e4d8, 0x3a5a3a, 0x7a2a22]));
  g.box(0, -o.drop, 0, 3.6, o.drop + 2.6, 3.0, c, 1); g.gable(0, 2.6, 0, 3.6, 3.0, 0.9, col(0x3d424a), c, 0.2);
  paneWin(g, 0, 1.0, 1.5, 2.2, 1.0, 3, 2); g.box(0, 2.0, -1.53, 2.6, 0.4, 0.04, WHITE, 0); g.box(0, 2.06, -1.56, 1.9, 0.14, 0.01, BLACK, 0);
  g.push(0, 0, 0, Math.PI / 2); g.quad([-0.45, 0, 1.81], [0.45, 0, 1.81], [0.45, 2.0, 1.81], [-0.45, 2.0, 1.81], shade(c, 0.6)); g.pop();
  g.cyl(-1.4, 2.6, -1.0, 0.03, 2.4, 4, METAL, 0);   // radio aerial
}
export function fuelTank(g) { for (const x of [-0.8, 0.8]) g.box(x, 0, 0, 0.12, 1.0, 1.0, METAL, 1); g.cylX(0, 1.6, 0, 0.65, 2.6, 9, col(0x5a6a5a), col(0x4a5a4a)); g.cyl(1.0, 0, 0.8, 0.12, 1.2, 5, RED, 2); }
// an open clinker boat: hull of `n` stations, gunwale half-beams from a bow-to-stern curve, inside darker, thwarts
export function boat(g, r, L = 4.6, B = 1.6, D = 0.7, paint) {
  const c = col(paint ?? r.pick([0x2a5a8a, 0xe8e6dc, 0x3a6a3a, 0xb0402a, 0xd8b030])), inn = col(0x8a6a48), keel = shade(c, 0.6);
  const n = 7, st = [];
  for (let i = 0; i <= n; i++) { const t = i / n, z = -L / 2 + t * L, b = B / 2 * Math.min(1, 1.35 * Math.sin(Math.PI * (0.18 + 0.82 * t)) ** 0.7) * (t > 0.92 ? (1 - t) / 0.08 : 1), sheer = D + 0.2 * (t - 0.5) ** 2 * 4 * (t > 0.5 ? 1.3 : 0.6); st.push({ z, b: Math.max(0.02, b), y: sheer }); }
  st[0].b = B / 2 * 0.62;   // a transom stern
  for (let i = 0; i < n; i++) {
    const A = st[i], Bq = st[i + 1];
    for (const s of [1, -1]) {
      const k0 = [0, 0, A.z], k1 = [0, 0, Bq.z], c0 = [s * A.b * 0.85, A.y * 0.4, A.z], c1 = [s * Bq.b * 0.85, Bq.y * 0.4, Bq.z], g0 = [s * A.b, A.y, A.z], g1 = [s * Bq.b, Bq.y, Bq.z];
      if (s > 0) { g.quad(k1, k0, c0, c1, keel); g.quad(c1, c0, g0, g1, c); g.quad(k0, k1, c1, c0, inn); g.quad(c0, c1, g1, g0, inn); }
      else { g.quad(k0, k1, c1, c0, keel); g.quad(c0, c1, g1, g0, c); g.quad(k1, k0, c0, c1, inn); g.quad(c1, c0, g0, g1, inn); }
    }
  }
  const T = st[0]; g.quad([T.b, T.y, T.z], [-T.b, T.y, T.z], [-T.b * 0.85, T.y * 0.4, T.z], [T.b * 0.85, T.y * 0.4, T.z], c); g.quad([-T.b, T.y, T.z], [T.b, T.y, T.z], [T.b * 0.85, T.y * 0.4, T.z], [-T.b * 0.85, T.y * 0.4, T.z], inn);
  for (const t of [0.3, 0.6]) { const z = -L / 2 + t * L; g.box(0, D * 0.62, z, B * 0.82, 0.05, 0.22, WOOD2, 0); }
}
export function buoy(g, r) { g.cyl(0, -0.3, 0, 0.35, 0.7, 7, col(r.pick([0xe8641e, 0xd8d8d0, 0xc82a1e])), 2); g.cyl(0, 0.4, 0, 0.04, 0.4, 4, METAL, 0); }
// ------------------------------------------------------------------------------------------- the farmyard
export function parlour(g, r, o) {   // a 1960s milking parlour: long, low, block walls, asbestos roof, the feed hopper
  const w = o.w, d = o.d, wall = col(r.pick([0xb8b4a8, 0xc8c4b8, 0x9a958a])), roof = col(r.pick([0x9a9a92, 0x8a8a84]));
  g.box(0, -o.drop, 0, w + 0.2, o.drop + 0.2, d + 0.2, col(0x8a857a), 1);
  g.box(0, 0, 0, w, 3, d, wall, 1); g.gable(0, 3, 0, w, d, 1.1, roof, wall, 0.3);
  for (let i = 0; i < Math.floor(w / 3); i++) g.quad([-w / 2 + 1 + i * 3, 1.6, d / 2 + 0.03], [-w / 2 + 2.2 + i * 3, 1.6, d / 2 + 0.03], [-w / 2 + 2.2 + i * 3, 2.3, d / 2 + 0.03], [-w / 2 + 1 + i * 3, 2.3, d / 2 + 0.03], GLASS2);
  g.quad([w / 2 - 2.5, 0, d / 2 + 0.03], [w / 2 - 0.8, 0, d / 2 + 0.03], [w / 2 - 0.8, 2.2, d / 2 + 0.03], [w / 2 - 2.5, 2.2, d / 2 + 0.03], col(0x5a6a5a));
  g.push(-w / 2 - 1.6, 0, 0); for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) g.strut([x, 0, z], [x * 0.7, 2.2, z * 0.7], 0.1, METAL);
  g.cyl(0, 2.0, 0, 0.3, 1.4, 8, col(0x8a9aa0), 0, 1.1); g.cyl(0, 3.4, 0, 1.1, 3.0, 8, col(0x8a9aa0), 2); g.pop();   // feed hopper
}
export function baleStack(g, r) { const c = col(0xc8b060), c2 = col(0xb8a050); for (let k = 0; k < 4; k++) for (let i = 0; i < 4 - (k >> 1); i++) for (let j = 0; j < 2; j++) g.box(i * 1.0 + (k % 2) * 0.2, k * 0.42, j * 0.5, 0.95, 0.4, 0.47, (i + j + k) % 2 ? c : c2, 1); }
export function muckHeap(g) { g.blob(0, 0.2, 0, 2.6, 0.9, 1.8, col(0x4a3a26), col(0x5a4630)); }
export function trough(g) { g.box(0, 0, 0, 2.4, 0.65, 0.7, CONC2, 1); g.box(0, 0.6, 0, 2.2, 0.03, 0.5, col(0x5a6a74), 0); }
export function trailer(g, r) {   // a two-wheel tipping trailer, red, with a few bales on
  const c = col(r.pick([0xb02a1e, 0x2a4a8a, 0x5a6a4a]));
  g.box(0, 0.75, 0, 2.2, 0.15, 4.2, METAL, 1); for (const s of [-1, 1]) g.box(s * 1.1, 0.9, 0, 0.06, 0.6, 4.2, c, 0); for (const s of [-1, 1]) g.box(0, 0.9, s * 2.1, 2.2, 0.6, 0.06, c, 0);
  g.strut([0, 0.7, 2.1], [0, 0.5, 3.4], 0.1, METAL); for (const s of [-1, 1]) wheel(g, s * 1.2, -0.2, 0.45, 0.3);
  if (r() < 0.6) for (let i = 0; i < 6; i++) g.box(-0.5 + (i % 2), 1.05 + Math.floor(i / 4) * 0.4, -1.2 + (Math.floor(i / 2) % 2) * 1.0, 0.95, 0.4, 0.47 * 2, col(0xc8b060), 1);
}
export function churnStand(g, r) {   // the milk churn stand at the farm road end: a platform at lorry-bed height, churns on it
  g.box(0, 0, 0, 1.6, 1.0, 1.0, CONC, 1); g.box(0, 1.0, 0, 1.7, 0.06, 1.1, CONC2, 0);
  for (let i = 0; i < 3; i++) { const x = -0.5 + i * 0.5; g.cyl(x, 1.06, 0, 0.17, 0.55, 7, col(0xb8bcc0), 0); g.cyl(x, 1.61, 0, 0.17, 0.12, 7, col(0xa8acb0), 0, 0.1); g.cyl(x, 1.73, 0, 0.11, 0.08, 7, col(0xb8bcc0), 2); }
}

// ------------------------------------------------------------------------------------------- damage and ruins
// The building's box: its footprint, eaves height and roof (rise), from the item
export function bldDims(it) {
  switch (it.t) {
    case 'house': return { w: it.w, d: it.d, H: it.floors * 2.8, rh: it.d * 0.48 };
    case 'cottage': return { w: it.w, d: it.d, H: 2.6, rh: it.d * 0.72 };
    case 'terrace': return { w: it.w, d: it.d, H: it.floors * 3, rh: it.d * 0.42 };
    case 'church': return { w: 28, d: 9, H: 7, rh: 5 };
    case 'school': return { w: it.w, d: 8, H: 4.2, rh: 5, dz: -it.d / 2 + 4 };
    case 'chapel': return { w: it.w, d: it.d - 2, H: 6.2, rh: 3.5, dz: -1 };
    case 'vhall': return { w: it.w, d: it.d, H: 3.6, rh: it.d * 0.4 };
    case 'barn': return { w: it.w, d: it.d, H: it.h || 5.5, rh: it.d * 0.32 };
    case 'parlour': return { w: it.w, d: it.d, H: 3, rh: 1.1 };
    case 'boatshed': return { w: 6, d: 10, H: 3.6, rh: 1.6 };
    case 'petrol': return { w: 7, d: 5, H: 3, rh: 0.5, dz: -3.5 };
    case 'office': return { w: 3.6, d: 3, H: 2.6, rh: 0.9 };
    case 'garage': return { w: 3.2, d: 5.5, H: 2.5, rh: 0.2 };
    default: return { w: it.w || 6, d: it.d || 6, H: 3, rh: 1.5 };
  }
}
// damaged: soot up the walls from the broken windows, a hole burnt in the roof with the rafters showing, glass and
// slates in the street. Drawn over the intact building (a few cm proud).
export function damageOverlay(g, r, it) {
  const D = bldDims(it), { w, d, H } = D, dz = D.dz || 0;
  g.push(0, 0, dz);
  for (let k = 0; k < 3; k++) {   // soot plumes on the front and back
    const s = k % 2 ? -1 : 1, x = (r() - 0.5) * (w - 2), y0 = 0.6 + r() * Math.max(0, H - 2.5), z = s * (d / 2 + 0.05);
    const P = [[x - 0.7, y0, z], [x + 0.7, y0, z], [x + 1.1, Math.min(H + 0.2, y0 + 2.6), z], [x - 0.5, Math.min(H + 0.2, y0 + 2.9), z]];
    if (s > 0) g.quad(P[0], P[1], P[2], P[3], SOOT); else g.quad(P[1], P[0], P[3], P[2], SOOT);
  }
  // the roof hole: a charred patch on the front slope and three rafters across it
  const hx = (r() - 0.5) * (w * 0.5), hw = Math.min(2.2, w * 0.25), rh = D.rh, t0 = 0.2, t1 = 0.75;
  const Y = t => H + rh * t, Z = t => (d / 2 + 0.35) * (1 - t);
  g.quad([hx - hw, Y(t0) + 0.06, Z(t0)], [hx + hw, Y(t0) + 0.06, Z(t0)], [hx + hw * 0.8, Y(t1) + 0.06, Z(t1)], [hx - hw * 0.8, Y(t1) + 0.06, Z(t1)], CHAR);
  for (let k = -1; k <= 1; k++) g.strut([hx + k * hw * 0.6, Y(t0) + 0.1, Z(t0)], [hx + k * hw * 0.55, Y(t1) + 0.1, Z(t1)], 0.1, CHAR2);
  g.pop();
  for (let k = 0; k < 7; k++) g.box((r() - 0.5) * w, -0.05, dz + d / 2 + 0.6 + r() * 2.5, 0.3 + r() * 0.6, 0.12, 0.3 + r() * 0.5, r() < 0.5 ? ASH : col(PAL.roofs[k % PAL.roofs.length]), 1);
}
// destroyed: wall stumps of broken heights round the plinth (a gable end often still stands), a heap of rubble and
// slates inside, charred beams leaning out of it, the floor black
export function ruin(g, r, it) {
  const D = bldDims(it), { w, d, H } = D, dz = D.dz || 0, wall = it.wall != null ? col(it.wall) : col(r.pick(PAL.stone)), sw = mixc(wall, SOOT, 0.35);
  g.push(0, 0, dz);
  g.box(0, -(it.drop || 0.3), 0, w + 0.24, (it.drop || 0.3) + 0.27, d + 0.24, col(0x6a665e), 1);
  g.quad([-w / 2, 0.29, d / 2], [w / 2, 0.29, d / 2], [w / 2, 0.29, -d / 2], [-w / 2, 0.29, -d / 2], CHAR);
  const sides = [[-w / 2, d / 2, w / 2, d / 2], [w / 2, -d / 2, -w / 2, -d / 2], [w / 2, d / 2, w / 2, -d / 2], [-w / 2, -d / 2, -w / 2, d / 2]], gableK = r() < 0.6 ? 2 + Math.floor(r() * 2) : -1;
  sides.forEach(([x0, z0, x1, z1], k) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(L / 1.6));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, gab = k === gableK, h = gab ? H * (0.7 + 0.3 * Math.sin(t * Math.PI)) + D.rh * 0.6 * Math.sin(t * Math.PI) * (r() < 0.8 ? 1 : 0.4) : 0.4 + r() * H * (0.25 + 0.5 * Math.sin(t * Math.PI));
      const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      g.box(x, 0.25, z, along ? L / n + 0.02 : 0.3, h, along ? 0.3 : L / n + 0.02, i % 3 ? wall : sw, 1);
    }
  });
  for (let k = 0; k < 4; k++) g.blob((r() - 0.5) * w * 0.6, 0.4, (r() - 0.5) * d * 0.5, 1.2 + r() * Math.min(2, w * 0.2), 0.6 + r() * 0.7, 1 + r() * 1.2, k % 2 ? ASH : shade(wall, 0.6), CHAR2);
  for (let k = 0; k < 4; k++) { const x = (r() - 0.5) * w * 0.7, z = (r() - 0.5) * d * 0.6; g.strut([x, 0.4, z], [x + (r() - 0.5) * 3, 1.5 + r() * H * 0.6, z + (r() - 0.5) * 3], 0.18, CHAR); }
  for (let k = 0; k < 10; k++) { const a = r() * 6.283, rr = Math.max(w, d) / 2 + r() * 3; g.box(Math.cos(a) * rr, -0.1, Math.sin(a) * rr * 0.8, 0.3 + r() * 0.7, 0.2 + r() * 0.3, 0.3 + r() * 0.5, k % 3 ? sw : ASH, 1); }
  g.pop();
}
