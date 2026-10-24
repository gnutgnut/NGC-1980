// NGC-1980 TERRAIN (wave 3): the 17 control-zone islands as real islands, and the one surface-type API every sim reads.
// Pure JS (no THREE, no DOM): the main thread, the terrain / world workers and the node benches all build exactly the
// same ground.
//
// Each island gets a geology (granite, volcanic, limestone / coral, sandstone: rock and sand colours, how rugged it is)
// and a coast made of three kinds of shore, blended by angle round the island:
//   BEACH  - a sand beach in a cove (big islands: a bay with a stream valley behind it) or on a spit (small islands):
//            sandy shoreface 1 in 14-20 out to ~2.5 m depth then the shelf, a wet-sand swash zone, a berm at ~1.7 m,
//            dunes behind the big beaches, a marshy stream mouth in the valley behind the dunes.
//   CLIFF  - the exposed side of the high islands: a 6-20 m face straight out of deep water, rock platform at its foot.
//   ROCKY  - everywhere else: a low rocky / shingle bank rising 1 in 2-3 to the island's own ground, steep sea bed.
// Inland: a plateau at the pad / base height (so the pad, the shaft apron and the ground over the cave sit on natural
// ground), hills and granite tors / volcanic cones on the high islands, rolling grass, valleys from the coves.
//
// API (all pure, all world metres; y up, sea level 0):
//   zoneH(x, z)            -> natural ground / sea-bed height inside the zone grid (|x|,|z| <= ZONE_E), else SEA_FLOOR.
//                             Bilinear over a 1.25 m grid baked once per thread (~0.3-0.6 s, lazily on first use), so
//                             the render mesh (same vertices) and every sim agree to the centimetre.
//   zoneSurf(x, z)         -> the natural surface name at (x, z): one of SURF_NAMES (see below). Roads, pads, decks are
//                             laid over this by the host (main.js surfaceAt / ground.js); under water it is the sea bed.
//   zoneSurfId(x, z)       -> the same as an index into SURF_NAMES
//   SURF_NAMES             -> ['grass','sand','wetsand','rock','mud','dirt','shingle','marsh']
//   SURFACE[name]          -> { mu, crr, sink, speed, skid, tyre, soil, foot }: the canonical friction table and how each
//                             sim's own dictionary names it (tyre.js SURF, trackfm.js SOILS, infantry audio / marinesim)
//   beaches()              -> the LANDING BEACHES (one or more per island): { I, name, x, z (waterline on the centre
//                             line), fx, fz (unit, inland), yaw (craft convention: facing inland), w (half width, m),
//                             u0, u1 (m along the centre line from the waterline: sea end, top of the sand), y(u),
//                             at(u, lat) -> [x, z], grade (foreshore rise per metre), runIn (m of clear water) }.
//                             Same shape as the old landing hards, so the LCM-8 delivery (armordelivery.js) uses them.
//   islandInfo(I)          -> the generated island: geology, shore kinds by angle, coves, peaks (debug / other agents)
//   shoreAt(x, z)          -> { island, s (m inland of the natural coastline, negative offshore), kind: 'beach'|'cliff'|
//                             'rocky' (the dominant shore here), beach (0..1 beach weight) } - for the sea / shallows
//   zoneGrid()             -> { N, C, E, h: Float32Array (N*N, row-major z then x), s: Uint8Array (surface ids) }
//                             (main.js builds the terrain textures from it)
import { ISLANDS, SEA_FLOOR, noise } from '../world.js';

export const ZONE_E = 760;                       // the grid covers -ZONE_E..ZONE_E (the zone, 640, plus the island shelves)
export const ZONE_C = 1.25;                      // grid spacing (m): the near-camera render mesh uses the same vertices
const N = Math.round(2 * ZONE_E / ZONE_C) + 1;   // 1217
const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------- surfaces
// The canonical surface table. mu: peak friction for a tyre / boot (Wong, Theory of Ground Vehicles 4th ed. tables 1.2,
// 1.4, 2.1 ranges: grass 0.4-0.55, dry sand 0.4-0.6, wet compact sand ~0.6-0.7, mud 0.2-0.4, gravel 0.55-0.7, rock 0.6-0.75),
// crr: rolling resistance of a pneumatic tyre (Wong 1.2: grass 0.05-0.08, sand 0.15-0.3, firm wet sand 0.04-0.08,
// mud 0.1-0.15), sink: how far a wheel / foot settles (m), speed: walking-pace factor, skid: helicopter skid (steel shoe)
// friction relative to concrete (it ploughs in sand and shingle, glides on mud) - all INFERRED within those ranges.
// tyre / soil / foot: the names this surface has in tyre.js SURF, trackfm.js SOILS and the infantry footstep audio.
export const SURF_NAMES = ['grass', 'sand', 'wetsand', 'rock', 'mud', 'dirt', 'shingle', 'marsh'];
export const SURFACE = {
  grass:   { mu: 0.50, crr: 0.06,  sink: 0.02, speed: 0.95, skid: 0.85, tyre: 'grass', soil: 'grass', foot: 'grass' },
  sand:    { mu: 0.50, crr: 0.18,  sink: 0.06, speed: 0.80, skid: 1.20, tyre: 'sand',  soil: 'sand',  foot: 'sand' },
  wetsand: { mu: 0.62, crr: 0.06,  sink: 0.02, speed: 0.95, skid: 1.00, tyre: 'dirt',  soil: 'dirt',  foot: 'sand' },   // the swash zone: firm, the landing craft's road
  rock:    { mu: 0.70, crr: 0.02,  sink: 0,    speed: 0.85, skid: 1.05, tyre: 'rock',  soil: 'rock',  foot: 'rock' },
  mud:     { mu: 0.35, crr: 0.13,  sink: 0.08, speed: 0.70, skid: 0.70, tyre: 'mud',   soil: 'mud',   foot: 'mud' },
  dirt:    { mu: 0.65, crr: 0.04,  sink: 0.02, speed: 1.00, skid: 1.00, tyre: 'dirt',  soil: 'dirt',  foot: 'dirt' },
  shingle: { mu: 0.55, crr: 0.09,  sink: 0.04, speed: 0.80, skid: 1.10, tyre: 'sand',  soil: 'sand',  foot: 'rock' },   // pebble strand on the rocky shores
  marsh:   { mu: 0.30, crr: 0.20,  sink: 0.15, speed: 0.55, skid: 0.80, tyre: 'mud',   soil: 'bog',   foot: 'mud' },    // salt marsh behind the low islands' dunes
};
const S_GRASS = 0, S_SAND = 1, S_WET = 2, S_ROCK = 3, S_MUD = 4, S_DIRT = 5, S_SHINGLE = 6, S_MARSH = 7;

// ------------------------------------------------------------------------------------------------- geology
// rock / sand colours (linear-ish RGB 0..1, the shader's palette), ruggedness (micro relief on rock), tors (outcrops)
export const GEOLOGY = {
  granite:   { rock: [0.56, 0.55, 0.52], sand: [0.86, 0.79, 0.60], rugged: 1.0, tors: 1.0, cliffs: 1.0 },
  volcanic:  { rock: [0.30, 0.28, 0.27], sand: [0.48, 0.45, 0.42], rugged: 1.2, tors: 0.6, cliffs: 1.2 },
  limestone: { rock: [0.74, 0.72, 0.64], sand: [0.94, 0.91, 0.80], rugged: 0.6, tors: 0.2, cliffs: 0.7 },
  sandstone: { rock: [0.62, 0.45, 0.33], sand: [0.88, 0.74, 0.52], rugged: 0.8, tors: 0.5, cliffs: 1.0 },
};
const GEO_OF = {
  'HOME ISLAND': 'granite', 'NORTH ROCK': 'granite', LOOKOUT: 'granite', SPIRE: 'granite',
  IRONHOLD: 'volcanic', CINDER: 'volcanic', ANVIL: 'volcanic', KILN: 'volcanic', FORGE: 'volcanic',
  'SOUTH REEF': 'limestone', SANDBAR: 'limestone', PELICAN: 'limestone', ECHO: 'limestone', BEACON: 'limestone',
  CITADEL: 'sandstone', WELLSPRING: 'sandstone', DRIFTWOOD: 'sandstone',
};
export const geologyOf = I => GEO_OF[I.name] || 'granite';

// ------------------------------------------------------------------------------------------------- small maths
const sm = (a, b, x) => { const t = (x - a) / (b - a); const u = t < 0 ? 0 : t > 1 ? 1 : t; return u * u * (3 - 2 * u); };
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const adiff = (a, b) => { let d = a - b; d -= TAU * Math.round(d / TAU); return d; };
const bump = (d, w) => { const t = Math.abs(d) / w; return t >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * t); };   // raised cosine, 1 at 0, 0 at w
const seedOf = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const mulberry = s => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ------------------------------------------------------------------------------------------------- island plans
// pad / base positions: the same rule as main.js PADS / net.js padOf (cave islands: base at the centre, pad 30 m south)
const padXZ = I => I.cave ? [I.x, I.z + 30] : [I.x, I.z];
let PLANS = null;
function plans() {
  if (PLANS) return PLANS;
  PLANS = ISLANDS.map(planIsland);
  return PLANS;
}
// how much open water there is from island I's coast in direction a (m, capped): beaches face the open sea and a
// landing craft needs a clear run in
function fetchOf(I, a, R) {
  const cx = Math.cos(a), sz = Math.sin(a);
  for (let d = R; d < R + 420; d += 8) {
    const x = I.x + cx * d, z = I.z + sz * d;
    for (const J of ISLANDS) if (J !== I && Math.hypot(x - J.x, z - J.z) < J.r * 1.05 + 40) return d - R;
  }
  return 420;
}
function planIsland(I) {
  const r = mulberry(seedOf(I.name + '/terrain')), geo = geologyOf(I), G = GEOLOGY[geo];
  const big = I.r >= 100, low = I.kind === 'fuel', small = !big;
  const P = { I, x: I.x, z: I.z, geo, G, big, low, kind: I.kind };
  // the coastline: a mean radius near I.r (the war places its buildings and guns inside I.r) with low harmonics
  P.R = I.r * (big ? 0.95 : 1.02);
  P.harm = [[2, 0.08], [3, 0.06], [4, 0.035], [5, 0.025], [7, 0.014]].map(([k, a]) => ({ k, a: a * (0.5 + r()), ph: r() * TAU }));
  // the plateau the pad stands on and the rise above it
  P.Hpl = low ? 3.4 + r() * 0.8 : big ? 9.5 + r() * 3 : I.kind === 'radar' ? 9 + r() * 3 : 6 + r() * 2.5;
  P.edge = low ? 0.35 : 0.3;                      // fraction of the plateau height left at the coast (rocky shores)
  P.warp = (low ? 5 : big ? 14 : 9) * G.rugged;              // coastline irregularity (m) on the rocky stretches
  const [px, pz] = padXZ(I);
  P.pad = { x: px, z: pz };
  // keep-outs: the pad and its apron, the cave base and the ground over it, the RUNAWAY shipyard on IRONHOLD's coast
  const shipyardA = I.name === 'IRONHOLD' ? Math.atan2(-I.z, -I.x) : null;
  // ---- coves / beaches: score every 6 degrees; the best ones (spaced) become beaches, the first is the landing beach
  const nCove = big ? 2 : low ? 3 : 1;
  const cand = [];
  for (let k = 0; k < 60; k++) {
    const a = k / 60 * TAU, f = fetchOf(I, a, P.R);
    let sc = Math.min(f, 320) / 320 + r() * 0.25;
    if (f < 140) sc -= 2;                                                  // no beach into a narrow channel
    if (shipyardA !== null && Math.abs(adiff(a, shipyardA)) < 0.7) sc -= 3;
    if (I.cave) {
      if (Math.abs(Math.sin(a)) < 0.45) sc -= 1.5;                         // the ground over the cave runs east-west
      if (Math.abs(adiff(a, Math.PI / 2)) < 0.5) sc -= 0.6;                // the pad is south of the shaft: beaches elsewhere
    }
    cand.push({ a, f, sc });
  }
  cand.sort((p, q) => q.sc - p.sc);
  P.coves = [];
  for (const c of cand) {
    if (P.coves.length >= nCove) break;
    if (P.coves.some(o => Math.abs(adiff(o.a, c.a)) < (low ? 1.9 : 1.7))) continue;
    if (c.sc < -0.5 && P.coves.length) continue;
    const main = P.coves.length === 0;
    P.coves.push({
      a: c.a, fetch: c.f, main,
      w: low ? 0.85 + r() * 0.25 : big ? 0.3 + r() * 0.1 : 0.5 + r() * 0.15,         // angular half width of the sand (the low islands: a sandy ring)
      d: big ? (main ? 26 : 18) + r() * 8 : low ? -(2 + r() * 4) : -(5 + r() * 6),     // indentation (m): a bay, or a spit (<0) on small islands
      g: main ? 0.07 : 0.045 + r() * 0.03,                                             // foreshore grade (landing beach 1 in 14)
      berm: 1.5 + r() * 0.4,
      dune: big ? 2.6 + r() * 2.2 : low ? 1.6 + r() * 1.4 : 0.8 + r() * 0.8,            // dune ridge height above the berm
      valley: big,
    });
  }
  // ---- cliffs: on the high islands, the most exposed side away from the beaches
  P.cliffs = [];
  if (!low) {
    const nCl = big ? 2 : I.kind === 'radar' ? 1 + (r() < 0.5 ? 1 : 0) : (r() < 0.6 ? 1 : 0);
    const cc = cand.filter(c => P.coves.every(o => Math.abs(adiff(o.a, c.a)) > o.w + 0.75)).sort((p, q) => (q.f + r() * 120) - (p.f + r() * 120));
    for (const c of cc) {
      if (P.cliffs.length >= nCl) break;
      if (P.cliffs.some(o => Math.abs(adiff(o.a, c.a)) < 1.3)) continue;
      if (shipyardA !== null && Math.abs(adiff(c.a, shipyardA)) < 0.6) continue;
      P.cliffs.push({ a: c.a, w: 0.45 + r() * 0.35, hc: (big ? 10 + r() * 9 : 7 + r() * 6) * G.cliffs });
    }
  }
  // sea stacks off the cliffs: the bits of the old headland the sea has not taken yet
  P.stacks = [];
  for (const c of P.cliffs) for (let k = 0, n = 1 + Math.floor(r() * 3); k < n; k++) {
    const a = c.a + (r() * 2 - 1) * c.w * 0.8, d = coastR(P, a) + 7 + r() * 16;
    P.stacks.push({ x: I.x + Math.cos(a) * d, z: I.z + Math.sin(a) * d, rad: 2.2 + r() * 3, h: (4 + r() * 10) * G.cliffs });
  }
  // ---- hills: peaks off the pad / base, ridged, granite tors / volcanic cones
  P.peaks = [];
  const relief = low ? 2 + r() * 1.5 : big ? 16 + r() * 12 : I.kind === 'radar' ? 6 + r() * 6 : 4 + r() * 5;
  const nPk = low ? 2 : big ? 3 : 1;
  for (let t = 0; t < 80 && P.peaks.length < nPk; t++) {
    const a = r() * TAU, d = P.R * (big ? 0.5 + r() * 0.25 : 0.62 + r() * 0.15), x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d;
    const rad = big ? 26 + r() * 22 : 14 + r() * 8;
    if (Math.hypot(x - P.pad.x, z - P.pad.z) < (I.cave ? 40 : 34) + rad * 0.4) continue;                       // the pad's apron
    if (I.cave && (Math.hypot(x - I.x, z - I.z) < 58 + rad * 0.3 || (Math.abs(z - I.z) < 22 + rad * 0.5 && Math.abs(x - I.x) < 100))) continue;   // the base and the cave strip
    if (P.coves.some(c => Math.abs(adiff(c.a, a)) < c.w + 0.35)) continue;                                   // not on a beach
    if (P.peaks.some(p => Math.hypot(p.x - x, p.z - z) < (p.rad + rad) * 0.8)) continue;
    P.peaks.push({ x, z, rad, h: relief * (0.7 + r() * 0.3), ridge: r() * TAU });
  }
  P.relief = relief;
  P.cone = geo === 'volcanic' && big;              // a volcanic island's main peak is a cone with a crater
  // the extent of this island's influence (coast + shelf)
  let Rmax = 0; for (let k = 0; k < 64; k++) Rmax = Math.max(Rmax, coastR(P, k / 64 * TAU));
  P.Rmax = Rmax + P.warp + 8; P.ext = P.Rmax + 125;
  // per-angle tables (the bake reads these, not the sums): coast radius with its rocky bites, shore weights, cove, cliff height
  P.tR = new Float32Array(TA + 1); P.tWb = new Float32Array(TA + 1); P.tWc = new Float32Array(TA + 1); P.tHc = new Float32Array(TA + 1); P.tCv = new Int8Array(TA + 1);
  P.tWbW = new Float32Array(TA + 1); P.tWcW = new Float32Array(TA + 1);   // the same weights blurred over +-0.55 rad: offshore the shelves spread out
  for (let k = 0; k <= TA; k++) {
    const a = k / TA * TAU - Math.PI; shoreW(P, a, _sw);
    P.tWb[k] = _sw.wb; P.tWc[k] = _sw.wc; P.tCv[k] = _sw.cove ? P.coves.indexOf(_sw.cove) : -1;
    P.tR[k] = coastR(P, a) + (1 - _sw.wb) * 2.5 * noise(a * P.R / 22, 5.5);
    let cl = null; for (const c of P.cliffs) if (!cl || Math.abs(adiff(a, c.a)) < Math.abs(adiff(a, cl.a))) cl = c;
    P.tHc[k] = cl ? cl.hc * (0.8 + 0.3 * noise(a * 7, 1.7)) : 8;
  }
  const B = Math.round(0.55 / TAU * TA);
  for (let k = 0; k <= TA; k++) { let b = 0, c = 0, n = 0; for (let q = -B; q <= B; q += 4) { const j = ((k + q) % TA + TA) % TA, wq = 1 - Math.abs(q) / (B + 1); b += P.tWb[j] * wq; c += P.tWc[j] * wq; n += wq; } P.tWbW[k] = b / n; P.tWcW[k] = c / n; }
  return P;
}

// ------------------------------------------------------------------------------------------------- the height model
// the coastline radius at angle a (before the domain warp), with the coves cut in / the spits pushed out
function coastR(P, a) {
  let R = P.R;
  for (const h of P.harm) R += P.R * h.a * Math.sin(h.k * a + h.ph);
  for (const c of P.coves) {
    const d = adiff(a, c.a);
    R -= c.d * bump(d, c.w * (c.d > 0 ? 1.15 : 1.25));
    if (c.d > 0) R += c.d * 0.35 * (bump(d - c.w * 1.3, 0.35) + bump(d + c.w * 1.3, 0.35));   // headlands either side of a bay
  }
  return R;
}
// shore kind weights at angle a: beach / cliff (rocky = the rest), and the cove it belongs to
function shoreW(P, a, out) {
  let wb = 0, wc = 0, cv = null;
  for (const c of P.coves) { const e = c.d > 0 ? c.w * 0.72 : c.w, v = sm(e + 0.1, e - 0.06, Math.abs(adiff(a, c.a))); if (v > wb) { wb = v; cv = c; } }   // a bay's sand is at its head, its flanks are rock
  for (const c of P.cliffs) { const v = sm(c.w + 0.2, c.w - 0.1, Math.abs(adiff(a, c.a))); if (v > wc) wc = v; }
  wc = Math.min(wc, 1 - wb);
  out.wb = wb; out.wc = wc; out.cove = cv;
  return out;
}
const _sw = { wb: 0, wc: 0, cove: null };
const TA = 2048;
// the tables at angle a (-PI..PI): linear between entries
const _ta = { R: 0, wb: 0, wc: 0, hc: 0, cove: null, wbW: 0, wcW: 0 };
function angAt(P, a) {
  const g = (a + Math.PI) / TAU * TA, k = g | 0, f = g - k, k1 = k < TA ? k + 1 : TA;
  _ta.R = P.tR[k] + (P.tR[k1] - P.tR[k]) * f; _ta.wb = P.tWb[k] + (P.tWb[k1] - P.tWb[k]) * f; _ta.wc = P.tWc[k] + (P.tWc[k1] - P.tWc[k]) * f;
  _ta.hc = P.tHc[k] + (P.tHc[k1] - P.tHc[k]) * f; _ta.wbW = P.tWbW[k] + (P.tWbW[k1] - P.tWbW[k]) * f; _ta.wcW = P.tWcW[k] + (P.tWcW[k1] - P.tWcW[k]) * f; let c = P.tCv[f < 0.5 ? k : k1]; if (c < 0) c = P.tCv[f < 0.5 ? k1 : k]; _ta.cove = c >= 0 ? P.coves[c] : null;
  return _ta;
}
// the island's own height at (x, z), and what the surface pass needs (aux)
function islandHeight(P, x, z, aux) {
  const dx0 = x - P.x, dz0 = z - P.z, rho0 = Math.hypot(dx0, dz0);
  if (rho0 > P.ext) return -1e9;
  const a0 = Math.atan2(dz0, dx0);
  // domain warp on the rocky shores: irregular headlands and inlets; beaches stay smooth arcs
  const wk = P.warp * (1 - 0.85 * angAt(P, a0).wb);
  const wx = wk * noise(x / 38 + 3.1, z / 38 - 7.7), wz = wk * noise(x / 38 - 5.3, z / 38 + 1.9);
  const dx = dx0 + wx, dz = dz0 + wz, rho = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
  const A = angAt(P, a);
  const wb = A.wb, wc = A.wc, wr = 1 - wb - wc, cove = A.cove, Rc = A.R, hcA = A.hc;   // (Rc: with the rocky coast's small bites)
  const s = Rc - rho;                                                    // m inland of the coastline
  const t = rho / Rc;                                                    // 0 centre .. 1 coast
  if (s < -1) {   // under the sea: the shore profiles alone (cheap: most of the cells); further out they spread and blend
    const kb = sm(2, 70, -s), wbE = mix(wb, A.wbW, kb), wcE = mix(wc, A.wcW, kb), wrE = 1 - wbE - wcE, g = cove ? cove.g : 0.06;
    let h = wbE * (-s > 36 ? -g * 36 - 0.12 * (-s - 36) : g * s) + wcE * (-2.6 + 0.45 * s) + wrE * (-0.6 + 0.3 * s);
    h += 1.4 * noise(x / 47 + 2.2, z / 47 - 9.1) * sm(8, 40, -s);            // an uneven bottom
    for (const st of P.stacks) {                                             // sea stacks
      const d = Math.hypot(x - st.x, z - st.z); if (d > st.rad * 1.8) continue;
      const top = st.h * (0.85 + 0.25 * noise(x / 2.1, z / 2.1)), k = sm(st.rad * 1.15, st.rad * 0.7, d);
      h = Math.max(h, mix(h, top, k));
    }
    if (h < SEA_FLOOR) h = SEA_FLOOR;
    if (aux) { aux.wb = wb; aux.wc = wc; aux.s = s; aux.dune = 0; aux.vall = 0; aux.tor = 0; aux.peak = 0; aux.P = P; aux.sand = wb > 0.4; }
    return h;
  }
  // ---- inland ground E: the plateau, falling toward the coast, hills, peaks, valleys
  let E = P.Hpl * mix(1, P.edge, sm(0.5, 1.0, t));
  const hn = noise(x / 52 + 11.3, z / 52 - 4.1), hn2 = noise(x / 23 - 2.7, z / 23 + 8.4);
  E += P.Hpl * (0.22 * hn + 0.08 * hn2) * sm(0.25, 0.6, t);              // rolling ground, flat round the pad
  let peakW = 0;
  for (const p of P.peaks) {
    const d = Math.hypot(x - p.x, z - p.z); if (d > p.rad * 1.6) continue;
    const q = d / p.rad;
    let ph = p.h * Math.exp(-q * q * 1.6);
    const ang = Math.atan2(z - p.z, x - p.x);
    ph *= 0.8 + 0.25 * Math.cos(2 * ang + p.ridge) + 0.2 * noise(x / 17, z / 17);   // a ridge through the summit, spurs
    if (P.cone && p === P.peaks[0]) ph -= p.h * 0.28 * Math.exp(-q * q * 18);        // the crater
    E += ph; peakW = Math.max(peakW, Math.exp(-q * q * 1.6));
  }
  // granite tors / volcanic knolls on the high ground
  const torN = noise(x / 15 + 4.4, z / 15 + 2.2);
  const tor = P.G.tors * Math.max(0, torN - 0.28) * 7 * sm(0.3, 0.8, peakW);
  E += tor;
  // valleys from the bays: a stream valley up the cove's axis, meandering, floor rising 1 in 18 inland
  let vall = 0;
  if (cove && cove.valley) {
    const mean = cove.a + 0.12 * Math.sin(rho * 0.045 + cove.a * 3);
    const lat = Math.abs(adiff(a, mean)) * rho;                          // m off the valley line
    const sIn = Rc - rho;
    const wv = mix(34, 18, sm(10, 80, sIn));                             // wide at the mouth, narrowing inland
    const reach = sm(-10, 0, -(rho - 62));                               // ends before the base apron
    vall = (1 - sm(wv * 0.35, wv, lat)) * reach;
    const floor = 1.9 + Math.max(0, sIn - 30) / 12;
    if (vall > 0) E = mix(E, Math.min(E, floor + lat * 0.12), vall);
  }
  // ---- the shore: each kind's profile across the coast, blended by angle
  let hB = 0, hC = 0, hR = 0, dune = 0;
  if (wb > 0 && cove) {
    const g = cove.g, berm = cove.berm;
    if (s < 0) hB = -s > 36 ? -g * 36 - 0.14 * (-s - 36) : g * s;      // shoreface, then the shelf
    else {
      hB = Math.min(berm, g * s) + 0.15 * sm(berm / g, berm / g + 8, s);     // foreshore to the berm, the backshore
      const ds = s - (berm / g + 10);                                        // dunes start ~10 m behind the berm
      if (ds > 0) {
        const along = a * Rc;
        const blow = 0.55 + 0.45 * noise(along / 26 + 9.1, 3.3);              // blowouts and saddles along the ridge
        dune = cove.dune * blow * (bump(ds - 6, 7) + 0.6 * bump(ds - 17, 7)) + 0.5 * noise(x / 9.5, z / 9.5) * sm(0, 6, ds) * (1 - sm(26, 34, ds));
        hB += Math.max(0, dune);
      }
      const back = berm / g + 30;                                           // behind the dunes the land takes over
      hB = mix(hB, Math.max(E, hB * 0.6), sm(back, back + 26, s));
    }
  }
  if (wc > 0) {
    const hc = hcA;
    if (s < 0) hC = -2.6 + 0.5 * s;                                         // deep water at the foot
    else {
      const top = Math.max(E, hc * (1 - sm(30, 70, s)) + E * sm(30, 70, s));
      hC = mix(-2.6, top, sm(0, 1.6 + hc * 0.12, s));
      hC += 0.6 * P.G.rugged * Math.abs(noise(x / 4.5, z / 4.5)) * (1 - sm(0, 8, s));   // a broken face
    }
  }
  if (wr > 0) {
    if (s < 0) hR = -0.6 + 0.42 * s;
    else hR = Math.min(E, -0.6 + 0.55 * s + 0.4 * noise(x / 6, z / 6)) ;
  }
  let h = wb * hB + wc * hC + wr * hR;
  h = mix(h, E, sm(0.62, 0.3, t));                                         // the interior is the island's own ground (no polar seams)
  // ---- near-camera relief (the 1.25 m grid shows it): grass hummocks, rock and boulders on the rough ground
  if (s > 0) {
    const fine = noise(x / 6.3 + 1.1, z / 6.3 - 2.3), fine2 = noise(x / 2.9 - 4.2, z / 2.9 + 3.8);
    const beachy = wb * (1 - sm(40, 70, s));                                 // the sand is smooth
    const rocky = Math.max(wc * (1 - sm(0, 25, s)), wr * (1 - sm(0, 10, s)), sm(0.45, 0.9, peakW) * 0.6, tor > 0.4 ? 1 : 0);
    h += (1 - beachy) * (0.22 * fine + 0.1 * fine2) * sm(0, 6, s);
    h += rocky * P.G.rugged * 0.7 * Math.max(0, fine2 + 0.15);
  }
  if (h < SEA_FLOOR) h = SEA_FLOOR;
  if (aux) {
    aux.wb = wb; aux.wc = wc; aux.s = s; aux.dune = dune; aux.vall = vall; aux.tor = tor; aux.peak = peakW; aux.P = P;
    // the sand: the beach and its dunes, with a ragged edge where the grass takes over
    const sn = noise(x / 11 + 6.6, z / 11 - 3.3);
    aux.sand = !!cove && wb > 0.3 + 0.35 * sn && s < cove.berm / cove.g + 22 + 10 * sn;
  }
  return h;
}

// ------------------------------------------------------------------------------------------------- the bake
let H = null, SID = null;
const AUX = { wb: 0, wc: 0, s: 0, dune: 0, vall: 0, tor: 0, peak: 0, P: null, sand: false };
function bake() {
  if (H) return;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const PL = plans();
  H = new Float32Array(N * N).fill(SEA_FLOOR); SID = new Uint8Array(N * N);
  const owner = new Int8Array(N * N).fill(-1), wbA = new Uint8Array(N * N), info = new Uint8Array(N * N);   // per cell: which island, beach weight, flags
  for (let pi = 0; pi < PL.length; pi++) {
    const P = PL[pi];
    const i0 = Math.max(0, Math.floor((P.x - P.ext + ZONE_E) / ZONE_C)), i1 = Math.min(N - 1, Math.ceil((P.x + P.ext + ZONE_E) / ZONE_C));
    const j0 = Math.max(0, Math.floor((P.z - P.ext + ZONE_E) / ZONE_C)), j1 = Math.min(N - 1, Math.ceil((P.z + P.ext + ZONE_E) / ZONE_C));
    for (let j = j0; j <= j1; j++) {
      const z = -ZONE_E + j * ZONE_C;
      for (let i = i0; i <= i1; i++) {
        const x = -ZONE_E + i * ZONE_C, k = j * N + i;
        const h = islandHeight(P, x, z, AUX);
        if (h <= H[k]) continue;
        H[k] = h; owner[k] = pi; wbA[k] = AUX.wb * 255;
        info[k] = (AUX.dune > 0.6 ? 1 : 0) | (AUX.vall > 0.5 ? 2 : 0) | (AUX.tor > 0.5 ? 4 : 0) | (AUX.wc > 0.5 && AUX.s < 25 ? 8 : 0) | (AUX.s < 45 && AUX.s > -60 ? 16 : 0) | (AUX.sand ? 32 : 0);
      }
    }
  }
  // ---- surfaces, from the baked ground (its slope) and what the height pass knew
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const k = j * N + i, h = H[k], o = owner[k];
    if (o < 0) { SID[k] = S_SAND; continue; }
    const P = PL[o], wb = wbA[k] / 255, f = info[k];
    const gx = (H[k + 1] - H[k - 1]) / (2 * ZONE_C), gz = (H[k + N] - H[k - N]) / (2 * ZONE_C), sl = Math.hypot(gx, gz);   // rise per metre
    const x = -ZONE_E + i * ZONE_C, z = -ZONE_E + j * ZONE_C;
    const n1 = noise(x / 13 + 7.7, z / 13 - 1.3), n2 = noise(x / 31 - 3.3, z / 31 + 6.1);
    let s;
    if (h <= 0) s = (wb > 0.4 || h < -4) && sl < 0.45 ? S_SAND : sl > 0.25 || f & 8 ? S_ROCK : S_SHINGLE;   // the sea bed
    else if (sl > 0.85 || f & 8 && sl > 0.45) s = S_ROCK;                                                       // cliffs, crags
    else if (wb > 0.35 && h < 0.55 && sl < 0.2) s = S_WET;                                                      // the swash zone
    else if (f & 32) s = (f & 1) && n1 > 0.4 ? S_GRASS : S_SAND;                                                // beach, dunes (marram tufts)
    else if (wb < 0.35 && h < 1.4 && f & 16) s = sl > 0.5 ? S_ROCK : S_SHINGLE;                                // the strand under a rocky bank
    else if (f & 4 || (sl > 0.6 && n1 > -0.1) || (sl > 0.42 && P.G.rugged >= 1 && n1 > 0.25)) s = S_ROCK;        // tors, scree, outcrops
    else if (f & 2 && h < 4.2 && sl < 0.12) s = P.low ? S_MARSH : S_MUD;                                         // the stream mouth
    else if (P.low && h < 3.2 && sl < 0.08 && n2 > 0.22) s = S_MARSH;                                           // salt marsh on the low islands
    else if (n2 < -0.46 && sl < 0.3 || (sl > 0.4 && n1 < -0.35)) s = S_DIRT;                                   // bare earth, sheep scrapes
    else s = S_GRASS;
    SID[k] = s;
  }
  if (t0 && typeof globalThis.__TERRAIN_LOG === 'function') globalThis.__TERRAIN_LOG(`terrain bake ${(performance.now() - t0).toFixed(0)} ms`);
  BAKE_MS = t0 ? performance.now() - t0 : 0;
}
let BAKE_MS = 0;
export const bakeMs = () => BAKE_MS;   // how long this thread's bake took (ms)

// ------------------------------------------------------------------------------------------------- queries
export function zoneH(x, z) {
  if (!H) bake();
  const gx = (x + ZONE_E) / ZONE_C, gz = (z + ZONE_E) / ZONE_C;
  if (gx < 0 || gz < 0 || gx >= N - 1 || gz >= N - 1) return SEA_FLOOR;
  const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j, k = j * N + i;
  const a = H[k], b = H[k + 1], c = H[k + N], d = H[k + N + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
export function zoneSurfId(x, z) {
  if (!H) bake();
  const i = Math.round((x + ZONE_E) / ZONE_C), j = Math.round((z + ZONE_E) / ZONE_C);
  if (i < 0 || j < 0 || i >= N || j >= N) return S_SAND;
  return SID[j * N + i];
}
export const zoneSurf = (x, z) => SURF_NAMES[zoneSurfId(x, z)];
export const inGrid = (x, z) => Math.abs(x) < ZONE_E - 2 && Math.abs(z) < ZONE_E - 2;
export function zoneGrid() { if (!H) bake(); return { N, C: ZONE_C, E: ZONE_E, h: H, s: SID }; }
export function islandInfo(I) {
  const P = plans()[ISLANDS.indexOf(I)]; if (!P) return null;
  return { name: I.name, geology: P.geo, R: P.R, plateau: P.Hpl, relief: P.relief, coves: P.coves.map(c => ({ a: c.a, w: c.w, main: c.main, grade: c.g, bay: c.d > 0, dunes: c.dune, valley: c.valley, fetch: c.fetch })),
    cliffs: P.cliffs.map(c => ({ a: c.a, w: c.w, h: c.hc })), peaks: P.peaks.map(p => ({ x: p.x, z: p.z, h: p.h, rad: p.rad })) };
}
export function shoreAt(x, z) {
  const PL = plans(); let best = null, bd = Infinity;
  for (const P of PL) { const d = Math.hypot(x - P.x, z - P.z) - P.R; if (d < bd) { bd = d; best = P; } }
  if (!best || bd > 200) return null;
  const A = angAt(best, Math.atan2(z - best.z, x - best.x));
  const s = A.R - Math.hypot(x - best.x, z - best.z);
  return { island: best.I, s, beach: A.wb, kind: A.wb > 0.5 ? 'beach' : A.wc > 0.5 ? 'cliff' : 'rocky' };
}

// ------------------------------------------------------------------------------------------------- landing beaches
// One per cove: the waterline point on the cove's axis (from the baked ground), inland direction, how far the sand runs
// up, and the clear water off it. Same shape as the old landing hards (landinghard.js) so the LCM-8 run-in code works.
let BEACHES = null;
export function beaches() {
  if (BEACHES) return BEACHES;
  BEACHES = [];
  for (const P of plans()) {
    P.coves.forEach((c, n) => {
      const cx = Math.cos(c.a), sz = Math.sin(c.a);
      // from far out, in to the first dry ground
      let w0 = -1;
      for (let d = P.Rmax + 40; d > 10; d -= 0.5) if (zoneH(P.x + cx * d, P.z + sz * d) >= 0) { w0 = d; break; }
      if (w0 < 0) return;
      const x = P.x + cx * w0, z = P.z + sz * w0, fx = -cx, fz = -sz;
      const B = { I: P.I, name: `${P.I.name} ${n === 0 ? 'BEACH' : 'BEACH ' + (n + 1)}`, main: c.main, x, z, fx, fz, grade: c.g, u0: -36, w: Math.max(6, Math.min(40, c.w * w0 * 0.55)) };
      B.at = (u, lat = 0) => [B.x + B.fx * u - B.fz * lat, B.z + B.fz * u + B.fx * lat];
      B.y = u => { const [px, pz] = B.at(u); return zoneH(px, pz); };
      // the top of the sand (the berm / first dune foot): where the climb steepens or the sand ends
      let u1 = 6;
      for (let u = 2; u < 70; u += 1) { const [px, pz] = B.at(u); if (zoneSurfId(px, pz) !== S_SAND && zoneSurfId(px, pz) !== S_WET) break; if (B.y(u + 2) - B.y(u) > 1.2) break; u1 = u; }
      B.u1 = u1;
      let run = 0; for (let d = 6; d < 300; d += 6) { const [px, pz] = B.at(-d); if (zoneH(px, pz) > -1.8 && d > 40) break; run = d; }
      B.runIn = run;
      B.yaw = Math.atan2(-fx, -fz);
      B.bx0 = Math.min(x, B.at(u1)[0]) - B.w; B.bx1 = Math.max(x, B.at(u1)[0]) + B.w; B.bz0 = Math.min(z, B.at(u1)[1]) - B.w; B.bz1 = Math.max(z, B.at(u1)[1]) + B.w;
      BEACHES.push(B);
    });
  }
  return BEACHES;
}
export const beachesOf = I => beaches().filter(b => b.I === I);
