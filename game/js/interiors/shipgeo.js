// INTERIORS (ngc/interiors): the ALBATROSS interior plan (shipint.js) as one vertex-coloured geometry in the ship
// frame (pure: Geo from the world kit) - bulkheads (inset a little inside the model's skin, so there is no z-fight
// from outside), window bands where the island has glass, deck plates, the inclined ladders as steps with their
// handrails, the hangar's deckhead with its beams and lights, and the fittings: the Ouija board, consoles, ready-room
// chairs, the helm and the engine order telegraph, spare engines, tow tractors, tool boxes, the fire stations.
import { Geo, col, shade } from '../world/kit.js';
import { RECIPES } from './furniture.js';
import { HANGAR } from './shipint.js';

const C = h => col(h);
const GREY = C(0x8c9296), GREY_D = C(0x5a5f63), DARK = C(0x1e2022), BLACK = C(0x121314), WHITE = C(0xe6e6e0), YEL = C(0xd8b21e), RED = C(0xa8231b), GREEN = C(0x3a7a3a), BRASS = C(0xb08a3a), WOOD = C(0x6b4a2a), TAN = C(0x8a6a48), LEATHER = C(0x3a2a1e), BLUE = C(0x2a4a8a);

const S = {
  // the deck-handling table: the flight deck in plan on its top, aircraft templates on it, the coloured nuts and bolts
  ouija(g) {
    g.box(0, 0, 0, 1.9, 0.9, 3.8, GREY_D); g.box(0, 0.9, 0, 2.0, 0.05, 3.9, C(0x2a2e30));
    g.push(0, 0.95, 0); g.box(0, 0, 0, 1.4, 0.01, 3.4, C(0x5a5e60), 1); g.box(0.42, 0.01, -0.2, 0.32, 0.01, 0.55, GREY, 1);   // the deck, the island
    for (let i = 0; i < 9; i++) { const x = -0.5 + (i % 3) * 0.35, z = -1.4 + Math.floor(i / 3) * 0.9; g.push(x, 0.012, z, (i * 0.7) % 1.2); g.box(0, 0, 0, 0.2, 0.012, 0.3, i % 4 ? WHITE : C(0xe8d8a0), 1); g.box(0, 0.012, 0.0, 0.03, 0.02, 0.03, [RED, GREEN, YEL, BLUE][i % 4], 1); g.pop(); }
    g.pop();
  },
  shipChair(g) { g.cyl(0, 0, 0, 0.25, 0.05, 6, DARK); g.cyl(0, 0.05, 0, 0.04, 0.4, 5, GREY_D, 0); g.box(0, 0.45, 0, 0.45, 0.08, 0.45, LEATHER); g.box(0, 0.53, -0.2, 0.45, 0.45, 0.06, LEATHER); },
  plotBoard(g, o) { const w = o.w || 3; g.box(0, 0.6, 0, w, 1.6, 0.05, C(0x2a3a3a)); g.box(0, 0.65, 0.03, w - 0.1, 1.5, 0.01, C(0x5a7a7a), 1); for (let i = 0; i < 8; i++) g.box(-w / 2 + 0.3 + (i % 4) * (w - 0.6) / 3, 1.0 + Math.floor(i / 4) * 0.5, 0.045, 0.5, 0.04, 0.005, i % 3 ? YEL : C(0xff8a3a), 1); },
  console(g, o) { const w = o.w || 1.6; g.box(0, 0, 0, w, 0.95, 0.6, GREY_D); g.push(0, 0.95, 0.05, 0, -0.5); g.box(0, 0, 0, w, 0.04, 0.5, C(0x30353a)); for (let i = 0; i < Math.floor(w / 0.3); i++) g.cyl(-w / 2 + 0.2 + i * 0.3, 0.04, 0, 0.07, 0.01, 8, i % 3 ? WHITE : C(0x8af0a0)); g.pop(); },
  phones(g) { g.box(0, 0, 0, 0.3, 0.4, 0.15, GREY_D); g.box(0, 0.1, 0.09, 0.12, 0.22, 0.06, BLACK); },
  readyChair(g) { g.box(0, 0.42, 0, 0.62, 0.14, 0.6, C(0x4a2a1a)); g.box(0, 0.5, -0.28, 0.62, 0.62, 0.12, C(0x4a2a1a)); for (const s of [-1, 1]) g.box(s * 0.3, 0.42, 0, 0.06, 0.28, 0.6, C(0x3a2014)); g.box(0, 0, 0, 0.5, 0.42, 0.5, BLACK); g.box(0.28, 0.66, 0.15, 0.3, 0.03, 0.35, TAN); },
  statusBoard(g, o) { const w = o.w || 4; g.box(0, 0.8, 0, w, 1.4, 0.05, BLACK); for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) g.box(-w / 2 + 0.4 + c * (w - 0.8) / 3, 1.0 + r * 0.2, 0.03, 0.7, 0.04, 0.005, c ? WHITE : YEL, 1); g.box(0, 2.25, 0.02, 1.2, 0.25, 0.02, C(0x8a2a1a)); },
  tvSet(g) { g.box(0, 0, 0, 0.55, 0.45, 0.45, C(0x2a2a2a)); g.box(0, 0.06, 0.226, 0.42, 0.32, 0.01, C(0x3a5050), 1); g.box(0, -0.3, -0.1, 0.1, 0.3, 0.1, GREY_D); },
  plotTable(g) { g.box(0, 0, 0, 1.6, 0.9, 2.4, GREY_D); g.box(0, 0.9, 0, 1.6, 0.06, 2.4, C(0x7a9aa8)); g.box(0, 0.96, 0, 1.4, 0.005, 2.2, C(0xc8d8d8), 1); for (let i = 0; i < 6; i++) g.box(-0.5 + (i % 3) * 0.5, 0.97, -0.6 + Math.floor(i / 3) * 1.1, 0.06, 0.02, 0.06, i % 2 ? RED : BLUE, 1); },
  flagChair(g) { S.captainChair(g); },
  helm(g) {   // the wheel on its pedestal, the rudder angle indicator and the gyro repeater on the console behind it
    g.box(0, 0, -0.3, 0.9, 1.1, 0.35, GREY_D); g.box(-0.25, 1.1, -0.3, 0.25, 0.25, 0.05, C(0x30353a)); g.cyl(0.2, 1.1, -0.3, 0.12, 0.08, 10, WHITE);
    g.cyl(0, 0, 0.05, 0.08, 1.0, 6, GREY_D, 0); g.push(0, 1.05, 0.12, 0, Math.PI / 2); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.strut([0, 0, 0], [Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32], 0.025, BRASS); } for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, b = (i + 1) * Math.PI / 8; g.strut([Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32], [Math.cos(b) * 0.32, 0, Math.sin(b) * 0.32], 0.03, WOOD); } g.pop();
  },
  telegraph(g) { g.cyl(0, 0, 0, 0.13, 0.9, 8, GREY_D, 0); g.push(0, 1.05, 0, 0, Math.PI / 2); g.cyl(0, -0.08, 0, 0.2, 0.16, 12, BRASS, 3); g.cyl(0, 0.08, 0, 0.17, 0.005, 12, WHITE, 2); g.pop(); g.strut([0, 1.05, 0], [0, 1.25, 0.08], 0.03, BRASS); },
  captainChair(g) { g.box(0, 0, 0, 0.4, 0.75, 0.4, GREY_D); g.box(0, 0.75, 0, 0.65, 0.14, 0.6, LEATHER); g.box(0, 0.85, -0.28, 0.65, 0.7, 0.1, LEATHER); for (const s of [-1, 1]) g.box(s * 0.3, 0.89, 0, 0.08, 0.2, 0.55, LEATHER); g.box(0, 0.35, 0.3, 0.5, 0.05, 0.25, GREY_D); },
  radarRepeater(g) { g.box(0, 0, 0, 0.7, 1.0, 0.7, GREY_D); g.push(0, 1.0, 0, 0, -0.35); g.cyl(0, 0, 0, 0.3, 0.08, 14, BLACK, 2); g.cyl(0, 0.08, 0, 0.27, 0.005, 14, C(0x1a5a2a), 2); g.pop(); g.box(0, 1.0, 0.36, 0.7, 0.2, 0.06, GREY_D); },
  chartTable(g) { RECIPES.counter(g, { w: 1.6, c: 0x5a5f63 }); g.box(0, 0.97, 0, 1.4, 0.005, 0.5, C(0xe0d8b8), 1); g.box(0.3, 0.98, 0.05, 0.4, 0.01, 0.03, BRASS, 1); },
  binocs(g) { g.cyl(0, 0, 0, 0.1, 1.15, 6, GREY_D, 0); g.push(0, 1.25, 0, 0, 0.15); for (const s of [-1, 1]) g.push(s * 0.09, 0, 0, 0, Math.PI / 2).cyl(0, -0.25, 0, 0.07, 0.5, 8, BLACK).pop(); g.pop(); },
  // the hangar deck
  hdcBooth(g) { g.box(0, 0, 0, 3.0, 1.0, 2.2, GREY); g.box(0, 2.3, 0, 3.0, 0.3, 2.2, GREY); for (const [x, z] of [[-1.45, -1.05], [1.45, -1.05], [-1.45, 1.05], [1.45, 1.05]]) g.box(x, 1, z, 0.1, 1.3, 0.1, GREY_D); g.box(0, 1.0, 1.0, 2.8, 0.04, 0.3, GREY_D); g.box(-0.6, 1.04, 0.95, 0.5, 0.3, 0.2, C(0x30353a)); g.box(0, 1.0, 1.08, 2.9, 1.3, 0.02, C(0x3a5060)); g.box(0.9, 2.62, 0, 1.2, 0.3, 0.05, YEL); },
  engineStand(g) { g.box(0, 0, 0, 1.2, 0.5, 4.0, YEL); for (const z of [-1.4, 1.4]) { g.box(-0.4, 0.5, z, 0.1, 0.55, 0.1, YEL); g.box(0.4, 0.5, z, 0.1, 0.55, 0.1, YEL); } g.push(0, 1.15, 0, 0, Math.PI / 2); g.cyl(0, -1.9, 0, 0.45, 3.8, 12, C(0x6a6e70), 3, 0.42, DARK); g.cyl(0, 1.9, 0, 0.38, 0.3, 12, C(0x2a2a2a), 0, 0.3); g.pop(); for (const s of [-1, 1]) g.cyl(s * 0.5, 0, 1.8, 0.1, 0.12, 8, BLACK); },
  tilly(g) { g.box(0, 0.3, 0, 2.2, 1.2, 3.0, YEL); g.box(0, 1.5, -0.6, 1.2, 0.9, 1.0, C(0x30353a)); for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) g.cyl(x, 0, z, 0.35, 0.35, 10, BLACK, 2); g.strut([0, 1.5, 0.6], [0, 2.6, -2.0], 0.18, YEL); g.strut([0, 2.6, -2.0], [0, 1.6, -2.3], 0.03, DARK); },
  tractor(g) { g.box(0, 0.25, 0, 1.6, 0.6, 2.8, YEL); g.box(0, 0.85, 0.7, 0.9, 0.35, 0.6, YEL); g.box(0, 0.85, -0.6, 0.6, 0.12, 0.5, BLACK); for (const [x, z] of [[-0.75, -1.0], [0.75, -1.0], [-0.75, 1.0], [0.75, 1.0]]) g.push(x, 0.27, z, 0, 0, Math.PI / 2).cyl(0, -0.12, 0, 0.27, 0.24, 10, BLACK).pop(); g.box(0, 0.4, -1.55, 0.3, 0.15, 0.4, DARK); },
  toolbox(g) { g.box(0, 0.1, 0, 1.0, 0.9, 0.55, RED); for (let i = 0; i < 5; i++) g.box(0, 0.2 + i * 0.16, 0.28, 0.9, 0.12, 0.01, shade(RED, 1.2), 1); for (const s of [-1, 1]) g.cyl(s * 0.4, 0, 0.15, 0.06, 0.1, 6, BLACK); g.box(0, 1.0, 0, 1.0, 0.04, 0.55, C(0x9a9a9a)); },
  drums(g) { for (let i = 0; i < 4; i++) g.cyl((i % 2) * 0.62 - 0.31, 0, Math.floor(i / 2) * 0.62 - 0.31, 0.29, 0.88, 10, [C(0x2a5a8a), C(0x3a6a3a), C(0xa82a1a), C(0x2a5a8a)][i], 2); },
  crates(g) { g.box(-0.5, 0, 0, 1.2, 0.9, 1.3, C(0x6a6a48)); g.box(0.65, 0, 0.1, 0.9, 1.2, 1.1, C(0x5a5e3e)); g.box(-0.45, 0.9, 0.05, 0.9, 0.6, 1.0, C(0x7a7a58)); for (const x of [-0.5, 0.65]) g.box(x, 0.5, 0.66, 0.5, 0.12, 0.01, WHITE, 1); },
  fireStation(g) { g.box(0, 0.9, 0, 1.0, 1.1, 0.2, RED); g.cyl(0, 1.0, 0.12, 0.35, 0.18, 12, RED, 3); g.cyl(0.35, 0.2, 0.15, 0.12, 0.6, 8, RED); g.box(0, 2.1, 0.02, 0.8, 0.18, 0.02, WHITE, 1); },
};

export function buildShipGeo(INT, g = new Geo()) {
  // bulkheads (the ones the model's skin covers outside are inset; collision-only boxes are not drawn)
  for (const w of INT.walls) {
    if (w.noDraw) continue;
    const [x0, x1, z0, z1, y0, y1] = w.b, e = w.noDrawOut ? 0.03 : 0.004, c = C(w.c), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = x1 - x0 - 2 * e, sz = z1 - z0 - 2 * e;
    if (sx <= 0 || sz <= 0) continue;
    if (w.glass) {   // a window band: the bulkhead below and above it, mullions across it (the model's glass outside)
      const [lo, hi] = w.glass;
      g.box(cx, y0, cz, sx, lo, sz, c, 0); g.box(cx, y0 + hi, cz, sx, y1 - y0 - hi, sz, c, 0);
      const along = sx > sz, L = along ? sx : sz, n = Math.max(1, Math.round(L / 1.2));
      for (let i = 0; i <= n; i++) { const t = -L / 2 + i * L / n; g.box(along ? cx + t : cx, y0 + lo, along ? cz : cz + t, along ? 0.08 : sx, hi - lo, along ? sz : 0.08, DARK, 3); }
      g.box(cx, y0 + lo - 0.04, cz, along ? sx : sx + 0.3, 0.04, along ? sz + 0.3 : sz, GREY_D, 0);   // the sill
      continue;
    }
    g.box(cx, y0, cz, sx, y1 - y0, sz, c, w.under ? 0 : 1);
  }
  // decks: plates (their underside is the deckhead of the space below), the inclined ladders as steps
  for (const f of INT.floors) {
    if (f.when) continue;
    const c = C(f.c ?? 0x5a5f63);
    if (f.ry) { steps(g, f, c); continue; }
    if (f.deck) continue;   // the model draws the flight deck
    if (f.roof) { if (f.y < 8 + 13.5 && !f.noCeil) g.quad([f.x0, f.y - 0.22, f.z1], [f.x0, f.y - 0.22, f.z0], [f.x1, f.y - 0.22, f.z0], [f.x1, f.y - 0.22, f.z1], C(0x9a9e9c)); continue; }   // a roof the model draws: its underside only (the deckhead)
    const th = f.hangar ? 0.4 : 0.15, lift = 0.015;   // (lifted clear of the model's own level tops, coplanar with the decks)
    g.box((f.x0 + f.x1) / 2, f.y - th + lift, (f.z0 + f.z1) / 2, f.x1 - f.x0, th, f.z1 - f.z0, c, 0, shade(c, 1.05));
  }
  // the flight deck's underside over the hangar (the deckhead), its beams, the lights; the bulkheads' fire mains
  const H = HANGAR;
  g.quad([-H.x, H.top, H.z1], [-H.x, H.top, H.z0], [H.x, H.top, H.z0], [H.x, H.top, H.z1], C(0x9aa0a0));
  for (let z = H.z0 + 1.2; z < H.z1; z += 2.4) g.box(0, H.top - 0.35, z, 2 * H.x, 0.35, 0.18, C(0x8a9090), 1);
  for (let z = H.z0 + 2.4; z < H.z1; z += 4.8) for (const x of [-6, 0, 6]) { g.box(x, H.top - 0.42, z + 1.2, 1.2, 0.06, 0.12, WHITE, 0); }
  for (const sd of [-1, 1]) g.box(sd * (H.x - 0.12), H.top - 0.8, (H.z0 + H.z1) / 2, 0.1, 0.1, H.z1 - H.z0, RED, 0);
  // fittings
  for (const p of INT.furn) {
    if (p.k === 'handrail') { g.strut([p.x, p.y0, p.z0], [p.x, p.y1, p.z1], 0.04, C(0x3a3e42)); for (let t = 0; t <= 1.001; t += 0.5) { const z = p.z0 + (p.z1 - p.z0) * t, y = p.y0 + (p.y1 - p.y0) * t; g.strut([p.x, y - 0.9, z], [p.x, y, z], 0.03, C(0x3a3e42)); } continue; }
    if (p.k === 'ladderIn') { for (const s of [-0.25, 0.25]) g.strut([p.x + s, p.y0, p.z], [p.x + s, p.y1 + 0.9, p.z], 0.03, GREY_D); for (let y = p.y0 + 0.3; y < p.y1; y += 0.3) g.strut([p.x - 0.25, y, p.z - 0.04], [p.x + 0.25, y, p.z - 0.04], 0.022, C(0x7a7e80)); continue; }
    if (p.k === 'fireCurtain') { g.box(p.x, p.y - 0.6, p.z, p.w, 0.6, 0.25, C(0x6a6e70), 0); g.box(p.x, p.y - 0.35, p.z + 0.15, p.w, 0.3, 0.05, RED, 0); continue; }
    if (p.k === 'padeye') { g.box(p.x, p.y, p.z, 0.18, 0.012, 0.18, C(0x2a2c2e), 1); continue; }
    if (p.k === 'hangarLines') { for (const x of [-8.5, 8.5]) g.box(x, p.y, (H.z0 + H.z1) / 2, 0.12, 0.012, H.z1 - H.z0 - 1, YEL, 1); for (let z = H.z0 + 6; z < H.z1; z += 12) g.box(0, p.y, z, 6, 0.012, 0.12, YEL, 1); continue; }
    const f = S[p.k] || RECIPES[p.k]; if (!f) continue;
    g.push(p.x, p.y, p.z, p.yaw); f(g, p.o || {}, () => 0.5); g.pop();
  }
  return g;
}
function steps(g, f, c) {
  const L = f.z1 - f.z0, yLo = Math.min(f.ry[0], f.ry[1]), yHi = Math.max(f.ry[0], f.ry[1]), rise = yHi - yLo, n = Math.max(2, Math.round(rise / 0.2)), up = f.ry[1] > f.ry[0] ? 1 : -1, tread = shade(c, 1.2);
  for (let k = 0; k < n; k++) {
    const top = yLo + (k + 1) * rise / n, t0 = k / n, t1 = (k + 1) / n;
    const s0 = up > 0 ? f.z0 + L * t0 : f.z1 - L * t1, s1 = up > 0 ? f.z0 + L * t1 : f.z1 - L * t0;
    g.box((f.x0 + f.x1) / 2, top - 0.05, (s0 + s1) / 2, f.x1 - f.x0, 0.05, s1 - s0 + 0.02, tread, 0);   // open steel treads
    g.box(f.x0 - 0.02, top - 0.25, (s0 + s1) / 2, 0.04, 0.25, s1 - s0 + 0.04, c, 0); g.box(f.x1 + 0.02, top - 0.25, (s0 + s1) / 2, 0.04, 0.25, s1 - s0 + 0.04, c, 0);   // stringers
  }
}
