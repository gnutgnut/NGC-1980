// INTERIORS (ngc/interiors): period furniture and fittings as recipes on the world kit's Geo (pure, worker-safe), and
// the builder that turns a building plan (rooms.js) into one vertex-coloured geometry: inner walls with their window
// holes (curtains, sills), floors (carpet, lino tiles, flagstones, boards), ceilings with a light fitting, stairs as
// real steps with a handrail, and every piece of furniture. One draw call per building.
// Recipes: origin on the floor at the piece's centre, its front (where you sit / stand to use it) toward local +z.
import { Geo, col, shade, mixc } from '../world/kit.js';
import * as MD from '../world/models.js';
import { rng } from '../world/rng.js';

const WOOD = col(0x6b4a2a), WOOD_L = col(0x9a7a50), WOOD_D = col(0x3e2a18), METAL = col(0x7c8186), DARK = col(0x1e1e20), WHITE = col(0xe8e6e0);
const OLIVE = col(0x4a5038), OLIVE_D = col(0x3a4030), BLANKET = col(0x5a5a40), STEEL = col(0x5a6066), CHROME = col(0xb8bcc0), BRASS = col(0xb08a3a);
const C = h => col(h);

// ------------------------------------------------------------------ the living room
const R = {
  fireplace(g, o) { const t = C(o.tile || 0x8a6a4a); g.box(0, 0, 0, 1.5, 1.05, 0.4, t); g.box(0, 1.05, 0.02, 1.7, 0.08, 0.5, WOOD_D); g.box(0, 0, 0.21, 0.7, 0.62, 0.02, DARK, 1); g.box(0, 0.04, 0.24, 0.55, 0.38, 0.06, C(0x8a8a8a)); for (let i = 0; i < 3; i++) g.box(-0.18 + i * 0.18, 0.12, 0.28, 0.1, 0.22, 0.01, C(0xff7a2a)); g.box(0, 0, 0.45, 1.6, 0.04, 0.5, shade(t, 0.8)); g.box(-0.5, 1.13, 0.0, 0.18, 0.3, 0.1, BRASS); g.box(0.45, 1.13, 0.0, 0.12, 0.2, 0.1, C(0x3a6a8a)); },
  sofa(g, o) { const c = C(o.c || 0x7a5a3a), w = o.w || 2; g.box(0, 0.08, 0.05, w, 0.36, 0.75, c); g.box(0, 0.44, 0.08, w - 0.4, 0.1, 0.62, shade(c, 1.1)); g.box(0, 0.44, -0.28, w, 0.45, 0.22, c); for (const s of [-1, 1]) g.box(s * (w / 2 - 0.1), 0.44, 0.05, 0.2, 0.2, 0.75, shade(c, 0.95)); for (const s of [-1, 1]) g.box(s * (w / 2 - 0.1), 0, 0.3, 0.05, 0.08, 0.05, WOOD_D); },
  armchair(g, o) { const c = C(o.c || 0x7a5a3a); g.box(0, 0.08, 0.05, 0.8, 0.36, 0.72, c); g.box(0, 0.44, 0.08, 0.5, 0.1, 0.6, shade(c, 1.1)); g.box(0, 0.44, -0.26, 0.8, 0.5, 0.2, c); for (const s of [-1, 1]) g.box(s * 0.32, 0.44, 0.05, 0.16, 0.2, 0.72, shade(c, 0.95)); },
  rug(g, o) { const c = C(o.c || 0x8a3a2a), w = o.w || 2, d = o.d || 2.4; g.box(0, 0, 0, w, 0.012, d, c, 1); g.box(0, 0.012, 0, w - 0.3, 0.004, d - 0.3, shade(c, 1.35), 1); g.box(0, 0.016, 0, w - 0.6, 0.003, d - 0.6, c, 1); },
  coffeeTable(g) { g.box(0, 0.38, 0, 1.0, 0.05, 0.5, WOOD); for (const [x, z] of [[-0.45, -0.2], [0.45, -0.2], [-0.45, 0.2], [0.45, 0.2]]) g.box(x, 0, z, 0.05, 0.38, 0.05, WOOD_D); g.box(0.2, 0.43, 0, 0.3, 0.03, 0.22, C(0xd8c8a0)); g.cyl(-0.25, 0.43, 0.05, 0.05, 0.1, 6, C(0xe8e8e0)); },
  tv(g) { // a 1980 colour telly in a wood-veneer cabinet on splayed legs, the rabbit-ear aerial on top
    for (const [x, z] of [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]]) g.strut([x, 0, z], [x * 0.8, 0.45, z * 0.8], 0.03, DARK);
    g.box(0, 0.45, 0, 0.74, 0.58, 0.52, C(0x6a4a2a)); g.box(-0.08, 0.53, 0.262, 0.48, 0.4, 0.01, C(0x2a3030), 1); g.box(0.27, 0.6, 0.262, 0.1, 0.3, 0.01, C(0x9a9a9a), 1);
    g.strut([0, 1.03, 0], [-0.25, 1.4, -0.05], 0.012, CHROME); g.strut([0, 1.03, 0], [0.25, 1.4, -0.05], 0.012, CHROME);
  },
  sideboard(g, o) { const c = C(o.c || 0x5a3a20); g.box(0, 0.1, 0, 1.6, 0.75, 0.45, c); g.box(0, 0, 0, 1.5, 0.1, 0.4, shade(c, 0.7)); for (const x of [-0.4, 0.4]) g.box(x, 0.2, 0.228, 0.7, 0.5, 0.01, shade(c, 1.2), 1); g.box(0.4, 0.85, 0, 0.3, 0.25, 0.1, C(0xd8d0c0)); g.cyl(-0.5, 0.85, 0, 0.08, 0.2, 6, C(0x2a5a8a)); g.box(-0.1, 0.85, -0.1, 0.25, 0.35, 0.03, C(0xb89a5a)); },
  lamp(g, o) { g.cyl(0, 0, 0, 0.15, 0.04, 8, DARK); g.cyl(0, 0.04, 0, 0.02, 1.4, 5, BRASS, 0); g.cyl(0, 1.38, 0, 0.24, 0.3, 8, C(o.shade || 0xe0c080), 0, 0.14); },
  // ---------------------------------------------------------------- the kitchen
  kitchenRun(g, o) {
    const w = o.w || 2.4, c = C(o.c || 0xe8e0c0), top = C(o.top || 0xd8c8a0), n = Math.max(2, Math.round(w / 0.6));
    g.box(0, 0, 0, w, 0.1, 0.55, DARK); g.box(0, 0.1, 0, w, 0.78, 0.58, c); g.box(0, 0.88, 0.02, w + 0.02, 0.04, 0.62, top);
    for (let i = 0; i < n; i++) { const x = -w / 2 + (i + 0.5) * w / n; g.box(x, 0.16, 0.292, w / n - 0.04, 0.66, 0.01, shade(c, 1.08), 1); g.box(x + w / n / 2 - 0.08, 0.7, 0.3, 0.02, 0.1, 0.02, CHROME); }
    // the cooker (four rings, eye-level grill) and the sink with its drainer and the taps
    if (o.cooker !== undefined) { const x = -w / 2 + o.cooker * w; g.box(x, 0, 0.0, 0.55, 0.9, 0.6, WHITE); g.box(x, 0.12, 0.302, 0.45, 0.42, 0.01, DARK, 1); for (const [a, b] of [[-0.13, -0.12], [0.13, -0.12], [-0.13, 0.12], [0.13, 0.12]]) g.cyl(x + a, 0.9, b, 0.08, 0.012, 8, DARK); g.box(x, 0.9, -0.27, 0.55, 0.55, 0.06, WHITE); g.box(x, 1.42, -0.12, 0.55, 0.06, 0.3, WHITE); }
    if (o.sink !== undefined) { const x = -w / 2 + o.sink * w; g.box(x, 0.86, 0.02, 0.9, 0.06, 0.55, CHROME); g.box(x - 0.15, 0.82, 0.04, 0.42, 0.06, 0.38, shade(CHROME, 0.6)); g.strut([x - 0.15, 0.92, -0.22], [x - 0.15, 1.12, -0.1], 0.02, CHROME); }
    // wall cupboards over the run, a calendar, the tea caddy
    g.box(-w * 0.18, 1.45, -0.12, w * 0.55, 0.65, 0.33, c); g.box(w * 0.3, 1.5, -0.27, 0.3, 0.4, 0.01, C(0xe8e0d0), 1);
    g.cyl(w * 0.15, 0.92, -0.15, 0.06, 0.15, 6, C(0xa82a1a)); g.cyl(w * 0.15 + 0.15, 0.92, -0.15, 0.06, 0.12, 6, C(0x2a5a2a));
  },
  fridge(g) { g.box(0, 0, 0, 0.58, 1.42, 0.58, WHITE); g.box(0, 0.95, 0.292, 0.54, 0.01, 0.01, shade(WHITE, 0.7), 1); g.box(0.22, 0.55, 0.3, 0.03, 0.3, 0.03, CHROME); },
  kitchenTable(g, o) { const c = C(o.c || 0xd0c0a0); g.box(0, 0.72, 0, 1.1, 0.04, 0.75, c); for (const [x, z] of [[-0.48, -0.3], [0.48, -0.3], [-0.48, 0.3], [0.48, 0.3]]) g.box(x, 0, z, 0.05, 0.72, 0.05, CHROME); for (const s of [-1, 1]) { g.push(s * 0.35, 0, s * 0.55, s > 0 ? Math.PI : 0); R.chair(g, { c: 0xc04a2a }); g.pop(); } g.box(0.15, 0.76, 0, 0.12, 0.02, 0.12, WHITE); g.cyl(-0.2, 0.76, 0.1, 0.05, 0.1, 6, C(0xe8e0d0)); },
  chair(g, o) { const c = C(o.c || 0x6b4a2a); g.box(0, 0.44, 0, 0.42, 0.05, 0.42, c); g.box(0, 0.49, -0.19, 0.42, 0.45, 0.04, c); for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) g.box(x, 0, z, 0.03, 0.44, 0.03, CHROME); },
  // ---------------------------------------------------------------- bedrooms and the bathroom
  bed(g, o) { const w = o.w || 1.4, c = C(o.c || 0x8a5a7a); g.box(0, 0.1, 0, w, 0.25, 2.0, WOOD); g.box(0, 0.35, 0.02, w - 0.06, 0.18, 1.94, WHITE); g.box(0, 0.5, 0.25, w + 0.04, 0.1, 1.5, c); g.box(0, 0.5, -0.78, w - 0.16, 0.12, 0.38, C(0xf0eee8)); g.box(0, 0, -1.0, w + 0.06, 1.05, 0.06, WOOD_D); g.box(0, 0, 1.0, w + 0.06, 0.55, 0.05, WOOD_D); },
  bedside(g) { g.box(0, 0, 0, 0.45, 0.55, 0.4, WOOD); g.box(0, 0.38, 0.202, 0.38, 0.12, 0.01, WOOD_L, 1); g.cyl(0.1, 0.55, -0.05, 0.06, 0.25, 6, BRASS, 0); g.cyl(0.1, 0.78, -0.05, 0.12, 0.15, 7, C(0xe8d0a0), 0, 0.07); g.box(-0.1, 0.55, 0.05, 0.14, 0.1, 0.08, DARK); },
  wardrobe(g, o) { const c = C(o.c || 0x6a4a2a); g.box(0, 0, 0, 1.1, 1.95, 0.58, c); g.box(0, 1.95, 0, 1.15, 0.06, 0.62, shade(c, 0.8)); g.box(0, 0.08, 0.292, 0.01, 1.8, 0.01, shade(c, 0.6), 1); for (const s of [-1, 1]) g.box(s * 0.06, 0.95, 0.3, 0.02, 0.15, 0.02, BRASS); g.box(0.3, 1.97, -0.05, 0.4, 0.25, 0.4, C(0x8a7a5a)); },
  dresser(g) { g.box(0, 0, 0, 1.0, 0.78, 0.45, WOOD_L); for (let i = 0; i < 3; i++) g.box(0, 0.08 + i * 0.24, 0.228, 0.9, 0.2, 0.01, shade(WOOD_L, 1.15), 1); g.box(0, 0.78, -0.18, 0.7, 0.75, 0.04, WOOD); g.box(0, 0.86, -0.155, 0.6, 0.6, 0.01, C(0x8aa0b0), 1); g.cyl(0.3, 0.78, 0.05, 0.03, 0.12, 5, C(0xc84a6a)); },
  bath(g, o) { const c = C(o.c || 0xe8e8e0); g.box(0, 0, 0, 1.7, 0.55, 0.75, c); g.box(0, 0.4, 0.0, 1.5, 0.16, 0.55, shade(c, 0.75), 2); g.box(-0.7, 0.55, -0.25, 0.12, 0.15, 0.06, CHROME); g.box(0.2, 0.9, -0.36, 0.8, 0.9, 0.02, C(0x9ab8c0)); },
  toilet(g, o) { const c = C(o.c || 0xe8e8e0); g.box(0, 0, 0.05, 0.36, 0.4, 0.5, c); g.box(0, 0.4, 0.08, 0.4, 0.04, 0.46, c); g.box(0, 0.4, -0.25, 0.42, 0.4, 0.18, c); g.box(0, 1.6, -0.27, 0.45, 0.35, 0.16, c); g.strut([0.15, 1.6, -0.27], [0.15, 0.85, -0.27], 0.02, CHROME); g.box(0.2, 1.85, -0.2, 0.04, 0.04, 0.1, CHROME); },
  basin(g, o) { const c = C(o.c || 0xe8e8e0); g.box(0, 0, -0.05, 0.18, 0.78, 0.18, c); g.box(0, 0.78, 0, 0.55, 0.12, 0.45, c); g.box(0, 0.86, 0.02, 0.4, 0.04, 0.3, shade(c, 0.7), 2); g.box(0, 1.1, -0.21, 0.45, 0.55, 0.02, C(0x9ab0c0)); },
  // ---------------------------------------------------------------- shops
  counter(g, o) { const w = o.w || 2.4, c = C(o.c || 0x6a4a2a); g.box(0, 0, 0, w, 0.92, 0.6, c); g.box(0, 0.92, 0, w + 0.05, 0.04, 0.65, WOOD_L); g.box(0, 0.1, 0.302, w - 0.1, 0.7, 0.01, shade(c, 1.15), 1);
    if (o.till) { g.box(-w / 2 + 0.5, 0.96, -0.05, 0.36, 0.22, 0.32, C(0x5a5a5a)); g.box(-w / 2 + 0.5, 1.18, -0.12, 0.3, 0.14, 0.1, C(0x8a8a8a)); g.box(-w / 2 + 0.5, 1.26, -0.12, 0.2, 0.05, 0.02, C(0xff6a2a)); }
    g.box(w / 2 - 0.4, 0.96, 0, 0.35, 0.06, 0.25, C(0xd8d0c0)); g.box(0.1, 0.96, 0.1, 0.25, 0.25, 0.2, C(0xc8a050)); },
  shelves(g, o, r) {
    const w = o.w || 2, h = o.low ? 1.4 : 2.0, n = o.low ? 3 : 5, goods = GOODS[o.goods] || GOODS.grocer;
    g.box(0, 0, 0, w, h, 0.05, WOOD, 1); for (const s of [-1, 1]) g.box(s * (w / 2 - 0.02), 0, 0.18, 0.04, h, 0.36, WOOD_D);
    for (let k = 0; k < n; k++) { const y = 0.12 + k * (h - 0.2) / n; g.box(0, y, 0.18, w - 0.06, 0.03, 0.36, WOOD_L);
      for (let x = -w / 2 + 0.12; x < w / 2 - 0.12; x += 0.13 + r() * 0.05) { const gc = C(goods[(r() * goods.length) | 0]), hh = 0.12 + r() * 0.16; if (r() < 0.5) g.cyl(x, y + 0.03, 0.2, 0.045, hh, 6, gc); else g.box(x, y + 0.03, 0.2, 0.1, hh, 0.14 + r() * 0.08, gc); } }
  },
  vegCrates(g, o, r) { for (let i = 0; i < 3; i++) { const x = -0.45 + i * 0.45; g.strut([x - 0.1, 0, 0.2], [x - 0.1, 0.55, 0.1], 0.03, WOOD_D); g.box(x, 0.45, 0, 0.42, 0.18, 0.5, WOOD_L); const vc = C([0xc85a1a, 0x6a8a2a, 0x8a3a5a, 0xd8b030, 0x4a7a2a][i + (r() * 2 | 0)]); for (let k = 0; k < 6; k++) g.blob(x - 0.12 + (k % 3) * 0.12, 0.66, -0.1 + (k > 2) * 0.18, 0.06, 0.05, 0.06, vc); } },
  freezer(g) { g.box(0, 0, 0, 1.2, 0.85, 0.7, WHITE); g.box(0, 0.85, 0, 1.2, 0.03, 0.7, C(0x9ab8c8)); g.box(0, 0.62, 0.352, 1.0, 0.12, 0.01, C(0x2a5aa8), 1); },
  newsRack(g, o, r) { g.box(0, 0, 0, 1.4, 1.4, 0.15, WOOD_D); for (let k = 0; k < 3; k++) for (let i = 0; i < 6; i++) { const y = 0.25 + k * 0.4; g.push(-0.55 + i * 0.22, y, 0.1, 0, -0.35); g.box(0, 0, 0, 0.2, 0.28, 0.01, C([0xd82a2a, 0xe8e8e0, 0x2a5aa8, 0xe8c030, 0x2a8a4a][(r() * 5) | 0]), 0); g.pop(); } },
  sweetJars(g, o, r) { for (let i = 0; i < 5; i++) { g.cyl(i * 0.16, 0, 0, 0.065, 0.24, 7, C(0xc8d8d8), 2); g.cyl(i * 0.16, 0.02, 0, 0.055, 0.15, 6, C([0xe84a8a, 0xe8c030, 0x8a3ad8, 0x4ad84a, 0xd84a2a][i])); g.cyl(i * 0.16, 0.24, 0, 0.04, 0.04, 6, C(0xd82a2a)); } },
  buckets(g) { for (let i = 0; i < 4; i++) g.cyl(-0.3 + (i % 2) * 0.45, (i > 1) * 0.3, (i % 2) * 0.1, 0.16, 0.3, 8, C([0x8a9aa0, 0xd84a2a, 0x2a6aa8, 0x8a9aa0][i]), 1, 0.2); g.strut([0.4, 0, 0.2], [0.45, 1.2, 0.1], 0.03, WOOD_L); g.box(0.45, 1.1, 0.1, 0.25, 0.08, 0.04, METAL); },
  cafeTable(g, o) { g.cyl(0, 0, 0, 0.25, 0.03, 8, DARK); g.cyl(0, 0, 0, 0.04, 0.72, 5, CHROME, 0); g.cyl(0, 0.72, 0, 0.36, 0.03, 10, C(o.c || 0xc04030)); g.cyl(0.1, 0.75, 0, 0.04, 0.08, 6, WHITE); g.box(-0.1, 0.75, 0.05, 0.08, 0.12, 0.08, C(0xc82a1a)); for (const s of [-1, 1]) { g.push(s * 0.55, 0, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2); R.chair(g, { c: 0xe8e8e0 }); g.pop(); } },
  // ---------------------------------------------------------------- the church
  pew(g, o) { const w = o.w || 3.2; g.box(0, 0.42, 0, w, 0.05, 0.42, WOOD); g.box(0, 0.47, -0.2, w, 0.45, 0.04, WOOD); for (const s of [-1, 1]) g.box(s * (w / 2 - 0.03), 0, 0, 0.06, 0.95, 0.5, WOOD_D); g.box(0, 0.12, -0.38, w - 0.1, 0.06, 0.18, C(0x7a2a2a)); g.box(0, 0.8, -0.28, w - 0.1, 0.03, 0.12, WOOD_D); },
  altar(g) { g.box(0, 0, 0, 2.0, 0.95, 0.9, C(0xd8d0c0)); g.box(0, 0.95, 0, 2.06, 0.04, 0.95, C(0xf0eee8)); g.box(0, 0.35, 0.47, 1.0, 0.55, 0.01, C(0x7a1a2a), 1); g.box(0, 0.99, -0.2, 0.06, 0.6, 0.06, BRASS); g.box(0, 1.35, -0.2, 0.3, 0.06, 0.06, BRASS); for (const s of [-1, 1]) { g.cyl(s * 0.6, 0.99, -0.15, 0.05, 0.25, 6, BRASS); g.cyl(s * 0.6, 1.24, -0.15, 0.025, 0.3, 5, WHITE); } },
  rail(g, o) { const w = o.w || 4.6; g.box(0, 0.75, 0, w, 0.06, 0.12, WOOD); for (let x = -w / 2; x <= w / 2 + 0.01; x += 0.3) g.box(x, 0, 0, 0.04, 0.75, 0.04, WOOD_D); g.box(0, 0, 0.3, w, 0.12, 0.35, C(0x7a2a2a)); },
  pulpit(g) { g.cyl(0, 0, 0, 0.55, 0.6, 8, C(0x9a9384), 0); g.cyl(0, 0.6, 0, 0.55, 0.6, 8, WOOD, 0); g.box(0, 1.15, 0.3, 0.5, 0.05, 0.35, WOOD_D); for (let i = 0; i < 4; i++) g.box(0.6, i * 0.15, -0.1 - i * 0.18, 0.5, 0.15, 0.3, C(0x9a9384)); },
  lectern(g) { g.cyl(0, 0, 0, 0.25, 0.08, 8, BRASS); g.cyl(0, 0.08, 0, 0.05, 1.0, 6, BRASS, 0); g.push(0, 1.1, 0, 0, -0.5); g.box(0, 0, 0, 0.55, 0.05, 0.4, BRASS); g.box(0, 0.05, 0.02, 0.45, 0.04, 0.3, C(0xe8e0c8)); g.pop(); },
  font(g) { g.box(0, 0, 0, 0.7, 0.2, 0.7, C(0x9a9384)); g.cyl(0, 0.2, 0, 0.18, 0.55, 8, C(0xa8a090), 0); g.cyl(0, 0.75, 0, 0.4, 0.28, 8, C(0xa8a090), 1, 0.42); g.cyl(0, 1.03, 0, 0.42, 0.06, 8, WOOD_D); },
  hymnBoard(g) { g.box(0, 0, 0, 0.6, 0.9, 0.04, WOOD_D); for (let i = 0; i < 4; i++) g.box(0, 0.1 + i * 0.19, 0.03, 0.45, 0.13, 0.01, WHITE, 1); },
  organ(g) { g.box(0, 0, 0, 1.6, 1.05, 0.8, WOOD_D); g.box(0, 0.75, 0.25, 1.4, 0.06, 0.3, WHITE); g.box(0, 0.82, 0.2, 1.4, 0.04, 0.25, DARK); for (let i = 0; i < 9; i++) g.cyl(-0.65 + i * 0.16, 1.05, -0.2, 0.05, 0.6 + Math.abs(4 - i) * 0.12, 6, BRASS, 2); g.box(0, 0.45, 0.65, 0.9, 0.05, 0.3, WOOD); },
  // ---------------------------------------------------------------- farm, shore, lock-up
  hayStack(g, o) { const n = o.n || 3; for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) for (let j = 0; j < 2 - (k > 1); j++) g.box(-n * 0.62 + 0.62 + i * 1.25, k * 0.75, -0.65 + j * 1.3, 1.2, 0.72, 1.25, col(0xc8b060, 0.92 + 0.12 * ((i + k + j) % 2))); },
  tractor(g, o, r) { MD.tractor(g, r); },
  sacks(g, o, r) { for (let i = 0; i < 5; i++) { const x = -0.4 + (i % 3) * 0.4, y = i > 2 ? 0.32 : 0; g.push(x + (i > 2) * 0.2, y, (r() - 0.5) * 0.2, r() * 0.4); g.box(0, 0, 0, 0.42, 0.32, 0.7, C(0xb8a880)); g.pop(); } },
  toolWall(g) { g.box(0, 0, 0, 2.2, 1.0, 0.03, WOOD_L); for (let i = 0; i < 6; i++) { const x = -0.9 + i * 0.36; g.strut([x, 0.1, 0.06], [x, 0.9, 0.06], 0.03, WOOD); g.box(x, 0.8 - (i % 2) * 0.6, 0.06, 0.2, 0.12, 0.03, METAL); } },
  dinghy(g) { for (const [x, z] of [[-0.6, -1.2], [0.6, -1.2], [-0.6, 1.2], [0.6, 1.2]]) g.box(x, 0, z, 0.08, 0.55, 0.08, WOOD_D); g.box(0, 0.5, -1.2, 1.4, 0.06, 0.1, WOOD_D); g.box(0, 0.5, 1.2, 1.4, 0.06, 0.1, WOOD_D);
    // a clinker-built pram dinghy, upturned for its winter coat of paint: planks stepping in, the keel on top
    for (let k = 0; k < 4; k++) { const w = 1.5 - k * 0.22, y = 0.56 + k * 0.13; g.box(0, y, 0, w, 0.12, 4.2 - k * 0.35, k % 2 ? C(0xe8e6e0) : C(0x2a5a7a)); } g.box(0, 1.08, 0, 0.1, 0.08, 3.2, WOOD); },
  bench(g) { g.box(0, 0.88, 0, 2.0, 0.07, 0.7, WOOD_L); for (const [x, z] of [[-0.9, -0.3], [0.9, -0.3], [-0.9, 0.3], [0.9, 0.3]]) g.box(x, 0, z, 0.08, 0.88, 0.08, WOOD_D); g.box(0, 0.3, 0, 1.8, 0.04, 0.6, WOOD); g.box(-0.6, 0.95, 0.1, 0.25, 0.18, 0.15, C(0x3a6a3a)); g.box(0.5, 0.95, -0.1, 0.4, 0.08, 0.2, METAL); g.box(0.8, 0.95, 0.2, 0.06, 0.25, 0.06, C(0xa82a1a)); },
  pots(g, o, r) { MD.lobsterPots(g, r, 6); },
  oars(g) { for (let i = 0; i < 2; i++) { g.strut([-0.2 + i * 0.25, 0.1, 0], [0.1 + i * 0.25, 2.4, 0], 0.04, WOOD_L); g.push(-0.2 + i * 0.25, 0.1, 0, 0, 0, 0.13); g.box(0, 0, 0, 0.14, 0.6, 0.03, WOOD_L); g.pop(); } },
  car(g, o, r) { MD.car(g, r, o.paint || 0x8a2a20); },
  tyres(g) { for (let i = 0; i < 4; i++) g.cyl(0, i * 0.22, 0, 0.3, 0.2, 10, C(0x1c1c1c), 2, 0.3, C(0x2a2a2a)); },
  // ---------------------------------------------------------------- the task force's barracks
  bunk(g) { for (const [x, z] of [[-0.42, -0.95], [0.42, -0.95], [-0.42, 0.95], [0.42, 0.95]]) g.box(x, 0, z, 0.05, 1.7, 0.05, OLIVE_D);
    for (const y of [0.35, 1.25]) { g.box(0, y, 0, 0.88, 0.05, 1.95, STEEL); g.box(0, y + 0.05, 0, 0.82, 0.12, 1.88, C(0x8a8a6a)); g.box(0, y + 0.17, 0.2, 0.84, 0.04, 1.4, BLANKET); g.box(0, y + 0.17, -0.75, 0.6, 0.1, 0.3, WHITE); }
    g.box(0.42, 1.25, 0.6, 0.02, 0.3, 0.02, OLIVE_D); },
  footlocker(g) { g.box(0, 0, 0, 0.8, 0.42, 0.42, OLIVE); g.box(0, 0.42, 0, 0.82, 0.03, 0.44, OLIVE_D); g.box(0, 0.3, 0.215, 0.1, 0.06, 0.01, BRASS, 1); g.box(-0.15, 0.08, 0.215, 0.4, 0.12, 0.005, WHITE, 1); },
  locker(g) { g.box(0, 0, 0, 0.6, 1.8, 0.5, OLIVE); for (let i = 0; i < 4; i++) g.box(-0.1, 1.4 + i * 0.05, 0.252, 0.3, 0.02, 0.005, OLIVE_D, 1); g.box(0.22, 0.9, 0.26, 0.03, 0.12, 0.03, METAL); g.box(-0.05, 1.82, 0, 0.45, 0.22, 0.4, C(0x5a603a)); },
  stove(g) { g.cyl(0, 0, 0, 0.3, 0.8, 10, C(0x262626), 2, 0.26); g.box(0, 0.25, 0.27, 0.22, 0.2, 0.04, C(0x3a1a0a)); g.cyl(0, 0.8, 0, 0.08, 3.4, 6, C(0x3a3a3a), 0); for (let i = 0; i < 3; i++) g.box(0, 0, 0, 0.7, 0.02, 0.7, C(0x6a5a4a), 1); },
  desk(g) { g.box(0, 0.73, 0, 1.2, 0.04, 0.7, OLIVE); for (const s of [-1, 1]) g.box(s * 0.45, 0, 0, 0.3, 0.73, 0.66, OLIVE_D); g.box(-0.2, 0.77, -0.1, 0.35, 0.02, 0.25, WHITE); g.box(0.3, 0.77, -0.15, 0.25, 0.12, 0.2, DARK); g.cyl(0.3, 0.89, -0.15, 0.03, 0.1, 5, DARK); g.push(0, 0, 0.6, Math.PI); R.chair(g, { c: 0x4a5038 }); g.pop(); },
  rifleRack(g) { g.box(0, 0, 0, 1.4, 0.2, 0.35, WOOD_D); g.box(0, 1.2, -0.1, 1.4, 0.15, 0.12, WOOD_D); for (let i = 0; i < 6; i++) { const x = -0.55 + i * 0.22; g.strut([x, 0.2, 0], [x, 1.28, -0.08], 0.035, DARK); g.box(x, 0.2, 0, 0.05, 0.25, 0.08, C(0x2a2a2a)); } },
};
const GOODS = {
  grocer: [0xd82a2a, 0xe8c030, 0x2a5aa8, 0xe8e0d0, 0x4a8a3a, 0xc85a1a, 0x8a3a1a],
  newsagent: [0xe84a8a, 0x2a8ad8, 0xe8e030, 0xd82a2a, 0xffffff, 0x8a3ad8],
  hardware: [0x8a9aa0, 0x5a5a5a, 0xd84a2a, 0x2a6aa8, 0xc8a050, 0x3a6a3a],
  cafe: [0xe8e0d0, 0xd8b080, 0x8a5a2a, 0xc82a1a],
  oil: [0xd8b020, 0x1a3a8a, 0xc82a1a, 0x2a6a2a, 0xe8e8e0],
  pub: [0x3a6a2a, 0x6a3a1a, 0xd8c890, 0x2a2a2a, 0xa83a2a, 0xe8e0c0],   // ngc/world-polish: bottles behind the bar
};
export const RECIPES = R;

// ------------------------------------------------------------------ a building's rooms -> one geometry
// P: rooms.js plan. it: the world item (only seed for the random goods). Local frame (the item frame, y from it.y).
export function buildRoomsGeo(P, g = new Geo()) {
  const r = rng((P.it.seed | 0) ^ 0xf00d);
  // walls: the box faces the room sees (the faces against the shell are skipped: no z-fight with it from outside),
  // a skirting board on the walls you see from the floor
  for (const w of P.walls) {
    if (w.hide) continue;
    const c = C(w.c);
    g.box((w.u0 + w.u1) / 2, w.y0, (w.v0 + w.v1) / 2, w.u1 - w.u0, w.y1 - w.y0, w.v1 - w.v0, w.rail ? C(0x6a4a2a) : c, (w.skip || 0) | 1);
    if (!w.rail && w.y0 < 0) { const sk = C(0x6a4a30); g.box((w.u0 + w.u1) / 2, 0.27, (w.v0 + w.v1) / 2, w.u1 - w.u0 + 0.01, 0.1, w.v1 - w.v0 + 0.01, sk, (w.skip || 0) | 3); }
  }
  // floors: carpet / lino tiles / flags / boards; the stairs as steps with treads and risers
  for (const f of P.floors) {
    const c = C(f.c ?? 0x7a5a3a);
    if (f.kind === 'stair' || f.kind === 'steps') { steps(g, f, c); continue; }
    if (f.kind === 'lino' && (f.u1 - f.u0) * (f.v1 - f.v0) < 30) { tiles(g, f, c); continue; }
    g.box((f.u0 + f.u1) / 2, f.y - (f.kind === 'slab' ? 0.2 : 0.06), (f.v0 + f.v1) / 2, f.u1 - f.u0, f.kind === 'slab' ? 0.2 : 0.06, f.v1 - f.v0, c, 1);   // (a slab's underside is its ceiling quad)
    if (f.kind === 'boards') for (let u = f.u0 + 0.2; u < f.u1; u += 0.2) g.box(u, f.y, (f.v0 + f.v1) / 2, 0.01, 0.002, f.v1 - f.v0, shade(c, 0.8), 1);
    if (f.kind === 'flags') for (let u = f.u0 + 0.6; u < f.u1; u += 0.6) g.box(u, f.y, (f.v0 + f.v1) / 2, 0.02, 0.002, f.v1 - f.v0, shade(c, 0.75), 1);
  }
  // ceilings (facing down), with a light fitting at each light
  for (const c of P.ceils) g.quad([c.u0, c.y, c.v1], [c.u0, c.y, c.v0], [c.u1, c.y, c.v0], [c.u1, c.y, c.v1], C(c.c));
  for (const [u, y, v] of P.lights) { const ce = ceilAbove(P, u, y, v); if (ce === null) continue; g.cyl(u, ce - 0.25, v, 0.012, 0.25, 4, DARK, 0); g.cyl(u, ce - 0.42, v, 0.2, 0.18, 8, C(0xe8d8b0), 0, 0.08); }
  // windows: a sill board and a pair of curtains at each opening the walls left for the shell's glass
  for (const w of P.walls) if (w.win) curtains(g, w, r);
  // furniture
  for (const p of P.furn) { const f = R[p.k]; if (!f) continue; g.push(p.u, p.y, p.v, p.yaw); f(g, p.o || {}, r); g.pop(); }
  return g;
}
function ceilAbove(P, u, y, v) { let best = null; for (const c of P.ceils) if (u >= c.u0 && u <= c.u1 && v >= c.v0 && v <= c.v1 && c.y > y - 0.5 && (best === null || c.y < best)) best = c.y; return best; }
function steps(g, f, c) {
  const along = f.ax === 'v', a0 = along ? f.v0 : f.u0, a1 = along ? f.v1 : f.u1, b0 = along ? f.u0 : f.v0, b1 = along ? f.u1 : f.v1;
  const yLo = f.ry[0], yHi = f.ry[1], rise = Math.abs(yHi - yLo), n = Math.max(2, Math.round(rise / 0.19)), L = a1 - a0, tread = shade(c, 1.15);
  for (let k = 0; k < n; k++) {
    // step k from the bottom: its top at bottom + (k + 1) rise / n; it spans the run from its nose to the high end
    const top = Math.min(yLo, yHi) + (k + 1) * rise / n, t0 = k / n, t1 = (k + 1) / n;
    const s0 = yHi > yLo ? a0 + L * t0 : a1 - L * t1, s1 = yHi > yLo ? a0 + L * t1 : a1 - L * t0;   // the tread's extent along the axis
    const ys = Math.min(yLo, yHi) - 0.15;
    if (along) g.box((b0 + b1) / 2, ys, (s0 + s1) / 2, b1 - b0, top - ys, s1 - s0, c, 1, tread);
    else g.box((s0 + s1) / 2, ys, (b0 + b1) / 2, s1 - s0, top - ys, b1 - b0, c, 1, tread);
  }
}
function tiles(g, f, c) {
  const c2 = shade(c, 0.55), s = 0.5;
  for (let u = f.u0; u < f.u1 - 1e-3; u += s) for (let v = f.v0; v < f.v1 - 1e-3; v += s) {
    const u1 = Math.min(f.u1, u + s), v1 = Math.min(f.v1, v + s), k = (Math.round((u - f.u0) / s) + Math.round((v - f.v0) / s)) % 2;
    g.quad([u, f.y, v1], [u1, f.y, v1], [u1, f.y, v], [u, f.y, v], k ? c : c2);
  }
}
function curtains(g, w, r) {
  const cc = C(r.pick([0xa04a2a, 0x6a7a3a, 0xc89a4a, 0x7a3a5a, 0x3a5a7a, 0xd8c8a0])), alongU = w.v1 - w.v0 < w.u1 - w.u0;
  // w: the window opening's piece below the sill { u0..u1 / v0..v1 the wall's thickness, y1 = the sill }; the curtains
  // hang beside the opening on the room's side
  const o = w.win, inn = w.inside;   // inside: +1 / -1 the room side along the wall normal
  if (alongU) {
    const v = inn > 0 ? w.v1 + 0.04 : w.v0 - 0.04;
    g.box((w.u0 + w.u1) / 2, o.lo - 0.04, v, w.u1 - w.u0 + 0.1, 0.04, 0.12, WHITE);
    for (const s of [-1, 1]) g.box(s < 0 ? w.u0 - 0.12 : w.u1 + 0.12, o.lo - 0.25, v + inn * 0.03, 0.28, o.hi - o.lo + 0.45, 0.04, cc);
    g.box((w.u0 + w.u1) / 2, o.hi + 0.2, v + inn * 0.04, w.u1 - w.u0 + 0.7, 0.04, 0.04, BRASS);
  } else {
    const u = inn > 0 ? w.u1 + 0.04 : w.u0 - 0.04;
    g.box(u, o.lo - 0.04, (w.v0 + w.v1) / 2, 0.12, 0.04, w.v1 - w.v0 + 0.1, WHITE);
    for (const s of [-1, 1]) g.box(u + inn * 0.03, o.lo - 0.25, s < 0 ? w.v0 - 0.12 : w.v1 + 0.12, 0.04, o.hi - o.lo + 0.45, 0.28, cc);
    g.box(u + inn * 0.04, o.hi + 0.2, (w.v0 + w.v1) / 2, 0.04, 0.04, w.v1 - w.v0 + 0.7, BRASS);
  }
}

// ------------------------------------------------------------------ door leaves (unit leaves, scaled per door)
// one geometry per door kind: the leaf from the hinge along +x (0..1), up +y (0..1), thickness along z centred; the
// instanced mesh scales x by the opening's width and y by its height (the panels and the handle stretch with it)
export function leafGeo(kind) {
  const g = new Geo(), t = { garage: 0.04, barn: 0.07, church: 0.07, wt: 0.06, hatch: 0.06 }[kind] || 0.045, c = WHITE;
  if (kind === 'garage') { g.box(0.5, 0, 0, 1, 1, t, c, 0); for (let i = 1; i < 6; i++) g.box(0.5, i / 6, t / 2, 1, 0.01, 0.01, shade(c, 0.75), 0); g.box(0.5, 0.45, t / 2 + 0.01, 0.12, 0.04, 0.02, shade(c, 0.4), 0); return g; }
  if (kind === 'barn') { g.box(0.5, 0, 0, 1, 1, t, c, 0); for (let i = 0; i < 6; i++) g.box(i / 6 + 0.08, 0, t / 2, 0.01, 1, 0.01, shade(c, 0.7), 0); g.strut([0.05, 0.1, t / 2 + 0.01], [0.95, 0.9, t / 2 + 0.01], 0.05, shade(c, 0.85)); g.box(0.5, 0.1, t / 2 + 0.01, 1, 0.06, 0.02, shade(c, 0.85), 0); g.box(0.5, 0.87, t / 2 + 0.01, 1, 0.06, 0.02, shade(c, 0.85), 0); return g; }
  if (kind === 'wt') {   // a ship's watertight door: rounded-corner plate, six dogs round the edge, the handle
    g.box(0.5, 0, 0, 0.98, 1, t, c, 0); g.box(0.5, 0.06, t / 2 + 0.005, 0.86, 0.88, 0.01, shade(c, 0.9), 0);
    for (const [x, y] of [[0.1, 0.2], [0.1, 0.8], [0.9, 0.2], [0.9, 0.8], [0.5, 0.95], [0.5, 0.05]]) for (const s of [-1, 1]) g.box(x, y - 0.02, s * (t / 2 + 0.03), 0.08, 0.04, 0.05, shade(c, 0.5), 0);
    g.box(0.82, 0.48, -(t / 2 + 0.05), 0.04, 0.08, 0.1, shade(c, 0.4), 0); g.box(0.82, 0.48, t / 2 + 0.05, 0.04, 0.08, 0.1, shade(c, 0.4), 0); return g;
  }
  if (kind === 'hatch') { g.box(0.5, 0, 0, 1, 1, t, c, 0); for (const s of [-1, 1]) g.box(0.85, 0.5, s * (t / 2 + 0.03), 0.06, 0.4, 0.05, shade(c, 0.5), 0); return g; }
  if (kind === 'gate') { for (let i = 0; i < 5; i++) g.box(0.5, 0.15 + i * 0.18, 0, 1, 0.07, 0.05, c, 0); for (const x of [0.03, 0.97]) g.box(x, 0, 0, 0.07, 1, 0.07, c, 0); g.strut([0.05, 0.15, 0], [0.95, 0.87, 0], 0.05, c); return g; }
  // a panelled house / shop / church door: four panels, the knob and the letterbox
  g.box(0.5, 0, 0, 1, 1, t, c, 0);
  for (const s of [-1, 1]) for (const [x, y, h] of [[0.27, 0.08, 0.36], [0.73, 0.08, 0.36], [0.27, 0.55, 0.37], [0.73, 0.55, 0.37]]) g.box(x, y, s * t / 2, 0.36, h, 0.012, shade(c, 0.85), 0);
  if (kind === 'shop') g.box(0.5, 0.5, 0, 0.75, 0.42, t + 0.01, col(0x2b3846), 0);   // the shop door's glass
  for (const s of [-1, 1]) g.box(0.88, 0.47, s * (t / 2 + 0.03), 0.05, 0.05, 0.06, BRASS, 0);
  if (kind === 'house') g.box(0.5, 0.62, t / 2 + 0.006, 0.26, 0.04, 0.01, BRASS, 0);
  return g;
}
