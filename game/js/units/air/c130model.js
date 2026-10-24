// Lockheed KC-130R Hercules (USMC, 1980): exterior model with every moving part - four 54H60 props (spin, blade angle,
// feathering, blur discs), Fowler flaps, ailerons, elevators, rudder, tandem main gear that retracts straight up into the
// sponsons, nose gear, the cargo ramp and upper cargo door, the two paratroop doors, lights - plus markings and wear.
// Low-poly, flat-shaded, real-world metres, built like hueymodel.js / jetmodel.js (lofts, plates, merged statics).
//
// Real dimensions (Wikipedia C-130H spec box, CONFIRMED): span 40.41 m, length 29.79 m, height 11.66 m on its gear,
// props 4.11 m (13 ft 6 in), tailplane span 16.05 m, main gear track 4.35 m, wheelbase 9.77 m, ramp 3.12 x 3.02 m.
// Positions and section shapes are traced from three-view drawings by eye (INFERRED).
//
// Markings (decision, see MODLOG): a Marine KC-130R of VMGR-352 (tail code QB) - the Marines' tanker/transport, a
// C-130H airframe - fits the carrier task force: the Marines' own Hercules flies the stick out from the beach. 1980 paint:
// gloss light gull grey with a white top, black anti-glare panel, MARINES on the fuselage, star-and-bar, "QB" on the
// fin, BuNo 160021 (a KC-130R-range number used for flavour, not checked against a real airframe's history), the
// refuelling pods and pylon tanks of a KC-130. Wear: vertex-colour grime (exhaust soot over the wings, a dirty belly,
// oil streaks, faded and touched-up panels), so no textures.
//
// Local frame: +x right, +y up, nose along -z, origin at the CG (wing quarter chord on the fuselage centreline); the
// ground under the gear (struts at static compression) is at y = -2.64. Same frame as c130fm.js.
// API: buildC130Mesh() -> { group, shell, animate(S, dt, time, inside), parts }, S = { eng: [{N, beta}] x4, flap, gear,
//   ramp, door: [l, r], ele, ail, rud, steer, wow: [5], lights, beacon, jumpLight: 'off'|'red'|'green', hp (0..1) }
import * as THREE from 'three';

const D2R = Math.PI / 180;
export const C130M = {
  GROUND: -2.64, SPAN: 40.41, LENGTH: 29.79,
  ENG_X: [-9.70, -4.84, 4.84, 9.70], ENG_Y: 1.30, PROP_Z: -4.6, PROP_R: 2.057,
  EYE_L: [-0.62, 1.08, -10.55], EYE_R: [0.62, 1.08, -10.55],          // pilot / copilot eye on the flight deck
  DOOR: [[-2.02, -0.55, 6.9], [2.02, -0.55, 6.9]],                       // paratroop door centres (left, right)
  DOOR_Z: [6.45, 7.35], FLOOR_Y: -1.45, RAMP_HINGE: [0, -1.45, 8.35], CARGO_DOOR_HINGE: [0, 1.75, 14.3],
  MAIN_WHEEL_R: 0.71, NOSE_WHEEL_R: 0.5,
  GEAR: { nose: [0, -2.75, -9.27], main: [[-2.18, -2.72, -0.25], [2.18, -2.72, -0.25], [-2.18, -2.72, 1.25], [2.18, -2.72, 1.25]] },
};

const M = (c, o = {}) => new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 18, ...o });
const MV = (c, o = {}) => M(c, { vertexColors: true, ...o });   // painted skins carry the wear in vertex colours
const B = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AV = a => (a.isVector3 ? a : V(...a));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), smooth = THREE.MathUtils.smoothstep;

// ------------------------------------------------------------------------------------------- geometry helpers
function geom(pos, groups) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (groups) for (const [s, n, m] of groups) g.addGroup(s, n, m);
  g.computeVertexNormals(); return g;
}
function soup(pos) {
  let vol = 0;
  for (let i = 0; i < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = pos.slice(i, i + 9);
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  if (vol < 0) for (let i = 0; i < pos.length; i += 9) for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
  return geom(pos);
}
// thin plate from a 2D outline [[a, b, thick, below = 0.5]...]; map(a, b, w) -> [x, y, z]
function slab(poly, map) {
  const n = poly.length, area = poly.reduce((s, p, i) => { const q = poly[(i + 1) % n]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  const tris = THREE.ShapeUtils.triangulateShape(poly.map(p => new THREE.Vector2(p[0], p[1])), []);
  const top = poly.map(p => map(p[0], p[1], p[2] * (1 - (p[3] ?? 0.5)))), bot = poly.map(p => map(p[0], p[1], -p[2] * (p[3] ?? 0.5)));
  const pos = [], tri = (a, b, c) => pos.push(...a, ...b, ...c);
  for (let [i, j, k] of tris) {
    const [a, b, c] = [poly[i], poly[j], poly[k]];
    if (((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) * area < 0) [j, k] = [k, j];
    tri(top[i], top[j], top[k]); tri(bot[i], bot[k], bot[j]);
  }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(top[i], bot[i], bot[j]); tri(top[i], bot[j], top[j]); }
  return soup(pos);
}
// skin through rings (open polylines of equal length); matFn(r, k) -> material index, -1 = hole; optional end fans
function loft(rings, matFn = () => 0, capA = -1, capB = -1) {
  const buckets = [], put = (m, ...pts) => (buckets[m] ||= []).push(...pts.flat());
  for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < rings[r].length - 1; k++) {
    const m = matFn(r, k); if (m < 0) continue;
    const a = rings[r][k], b = rings[r][k + 1], c = rings[r + 1][k + 1], d = rings[r + 1][k];
    put(m, a, c, b); put(m, a, d, c);
  }
  const fan = (R, m, front) => {
    const c = R.reduce((s, p) => [s[0] + p[0] / R.length, s[1] + p[1] / R.length, s[2] + p[2] / R.length], [0, 0, 0]);
    for (let k = 0; k < R.length - 1; k++) front ? put(m, R[k], R[k + 1], c) : put(m, R[k], c, R[k + 1]);
  };
  if (capA >= 0) fan(rings[0], capA, true);
  if (capB >= 0) fan(rings[rings.length - 1], capB, false);
  const pos = [], groups = [];
  buckets.forEach((b, m) => { if (b) { groups.push([pos.length / 3, b.length / 3, m]); pos.push(...b); } });
  return geom(pos, groups);
}
function merge(geos) {
  const pos = [], nor = [];
  for (let g of geos) { g = g.index ? g.toNonIndexed() : g; if (!g.attributes.normal) g.computeVertexNormals(); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g;
}
const cylZ = (r0, r1, len, seg = 10, open = false) => new THREE.CylinderGeometry(r1, r0, len, seg, 1, open).rotateX(Math.PI / 2);   // r0 at -z
const cylX = (r, len, seg = 10) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
const boxG = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const mesh = (geo, mat, parent, name) => {
  if ((Array.isArray(mat) ? mat.some(m => m.vertexColors) : mat.vertexColors) && !geo.attributes.color) applyWear(geo, "gear");   // painted parts outside the buckets
  const m = new THREE.Mesh(geo, mat); if (name) m.name = name; parent && parent.add(m); return m;
};
const group = (parent, name, x = 0, y = 0, z = 0) => { const o = new THREE.Group(); o.name = name; o.position.set(x, y, z); parent.add(o); return o; };
const _m4 = new THREE.Matrix4(), _q0 = new THREE.Quaternion(), ONE = V(1, 1, 1), ZAX = V(0, 0, 1);
function rodG(a, b, w, seg = 0) {
  a = AV(a); b = AV(b); const d = V().subVectors(b, a), L = d.length();
  const g = seg ? new THREE.CylinderGeometry(w / 2, w / 2, L, seg).rotateX(Math.PI / 2) : new THREE.BoxGeometry(w, w, L);
  return g.applyMatrix4(_m4.compose(V().addVectors(a, b).multiplyScalar(0.5), _q0.setFromUnitVectors(ZAX, d.normalize()), ONE));
}
const tubeG = (pts, r, seg = 16, rad = 6) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(AV)), seg, r, rad);

// ------------------------------------------------------------------------------------------- wear
// Vertex colours from the position in the airframe frame (offset = where the part sits when it moves): faded and
// touched-up panels (value noise on a 1.6 m grid), exhaust soot over the wing behind each nacelle, a grimy belly with
// streaks running aft, oil streaks under the nacelles, dirt on the ramp and gear.
const hash = (i, j, k) => { let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function vnoise(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = x - i, fy = y - j, fz = z - k, s = t => t * t * (3 - 2 * t);
  const u = s(fx), v = s(fy), w = s(fz), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash(i, j, k), hash(i + 1, j, k), u), L(hash(i, j + 1, k), hash(i + 1, j + 1, k), u), v),
    L(L(hash(i, j, k + 1), hash(i + 1, j, k + 1), u), L(hash(i, j + 1, k + 1), hash(i + 1, j + 1, k + 1), u), v), w);
}
export function wearAt(x, y, z, kind = 'skin', out = [1, 1, 1]) {
  let r = 1, g = 1, b = 1;
  const n = vnoise(x / 1.6, y / 1.6, z / 1.6), n2 = vnoise(x / 0.45 + 7, y / 0.45, z / 3.5);
  const fade = 0.94 + 0.09 * n; r *= fade; g *= fade; b *= fade * 1.01;
  if (n > 0.82) { r *= 0.93; g *= 0.95; b *= 0.98; }   // a touched-up panel in a slightly different grey
  if (kind === 'wing' || kind === 'nacelle') {         // T56 exhaust over the wing top and the flaps
    for (const ex of C130M.ENG_X) {
      const dx = Math.abs(x - ex), behind = z - 1.0;
      if (dx < 1.3 && behind > 0 && y > 1.5) { const k = (1 - dx / 1.3) * Math.min(1, behind / 1.5) * Math.exp(-behind / 7) * 0.62; r *= 1 - k; g *= 1 - k * 1.02; b *= 1 - k * 1.05; }
    }
  }
  if (kind === 'nacelle' && y < 1.0) { const k = 0.22 * smooth(n2, 0.4, 0.9); r *= 1 - k * 0.8; g *= 1 - k; b *= 1 - k * 1.2; }   // oil streaks
  if (kind === 'skin' || kind === 'ramp') {
    const belly = smooth(-y, 0.6, 1.8), streak = 0.75 + 0.25 * Math.sin(x * 5.3 + n2 * 3);
    const k = belly * (0.18 + 0.12 * streak) + (kind === 'ramp' ? 0.12 : 0) + (z > 7 && y < 0 ? 0.06 : 0);
    r *= 1 - k * 0.9; g *= 1 - k * 0.95; b *= 1 - k * 1.1;
    if (y > 1.5 && Math.abs(x) < 1.6) { const s = smooth(z, -9, 2) * 0.08 * n2; r *= 1 - s; g *= 1 - s; b *= 1 - s; }   // walkway scuffs
  }
  if (kind === 'gear') { const k = 0.25 * n; r *= 1 - k; g *= 1 - k; b *= 1 - k * 1.1; }
  out[0] = r; out[1] = g; out[2] = b; return out;
}
function applyWear(geo, kind, off) {
  const p = geo.attributes.position, c = new Float32Array(p.count * 3), w = [1, 1, 1];
  for (let i = 0; i < p.count; i++) {
    wearAt(p.getX(i) + (off ? off[0] : 0), p.getY(i) + (off ? off[1] : 0), p.getZ(i) + (off ? off[2] : 0), kind, w);
    c[i * 3] = w[0]; c[i * 3 + 1] = w[1]; c[i * 3 + 2] = w[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo;
}
// static parts collect here per material and become one mesh each; vertex-coloured materials get the wear
function bucket() {
  const m = new Map();
  return { add(geo, mat, kind) { (m.get(mat) || m.set(mat, []).get(mat)).push([geo, kind]); return geo; },
    flush(parent, name, off) {
      const out = [];
      for (const [mat, list] of m) {
        let geo;
        if (mat.vertexColors) { geo = merge(list.map(([g0]) => g0)); const kinds = list.map(([, k]) => k || 'skin'); let o = 0; const cols = []; const w = [1, 1, 1];
          for (let i = 0; i < list.length; i++) { const g0 = list[i][0].index ? list[i][0].toNonIndexed() : list[i][0], P = g0.attributes.position; for (let v = 0; v < P.count; v++) { wearAt(P.getX(v) + (off ? off[0] : 0), P.getY(v) + (off ? off[1] : 0), P.getZ(v) + (off ? off[2] : 0), kinds[i], w); cols.push(...w); } o += P.count; }
          geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); }
        else geo = merge(list.map(([g0]) => g0));
        out.push(mesh(geo, mat, parent, name));
      }
      m.clear(); return out;
    } };
}

// ------------------------------------------------------------------------------------------- fuselage sections
// rounded rectangle half profile, 14 points top centre -> keel (see hueymodel.js): roof, upper corner arc (rt), three
// side points at the levels LV (para door top, mid, floor), lower corner arc (rb), belly. Quads per half (qh):
// 0 roof, 1-4 upper arc, 5-8 side (5 above LV0, 8 below LV2), 9-11 lower arc, 12 belly.
const LV = [0.35, -0.5, -1.4];
function rr(z, top, bot, w, rt, rb, yc = 0) {
  rb = Math.min(rb, w, (top - bot) / 2); rt = Math.min(rt, w, top - bot - rb);
  const p = [[0, top], [w - rt, top]], yT = top - rt, yB = bot + rb;
  for (const a of [0.3927, 0.7854, 1.1781]) p.push([w - rt + rt * Math.sin(a), yT + rt * Math.cos(a)]);
  p.push([w, yT]);
  for (const y of LV) p.push([w, clamp(y + yc, yB, yT)]);
  p.push([w, yB]);
  for (const a of [1.0472, 0.5236]) p.push([w - rb + rb * Math.sin(a), yB - rb * Math.cos(a)]);
  p.push([w - rb, bot], [0, bot]);
  return p.map(([x, y]) => [x, y, z]);
}
const full = h => [...h, ...h.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z])];   // 27 points
const QH = k => (k < 13 ? k : 25 - k);
// [z, top, bottom, half width, top corner r, bottom corner r]: radome, flight deck, cargo hold, upswept tail
const FUS = [
  [-13.55, -0.25, -0.45, 0.06, 0.05, 0.05], [-13.42, 0.05, -0.92, 0.62, 0.5, 0.48], [-13.15, 0.26, -1.27, 1.02, 0.8, 0.75],
  [-12.75, 0.44, -1.55, 1.42, 1.0, 0.85], [-12.3, 0.66, -1.72, 1.72, 1.2, 0.8], [-11.85, 1.3, -1.8, 1.92, 1.32, 0.7],
  [-11.35, 1.8, -1.84, 2.03, 1.38, 0.6], [-10.75, 2.0, -1.85, 2.08, 1.38, 0.5], [-10.1, 2.05, -1.85, 2.1, 1.38, 0.45],
  ...[-9.4, -8.6, -7.0, -5.0, -3.0, -1.0, 1.0, 3.0, 4.6, 5.6].map(z => [z, 2.05, -1.85, 2.1, 1.38, 0.45]),
  [6.45, 2.05, -1.84, 2.1, 1.38, 0.45], [7.35, 2.05, -1.74, 2.08, 1.38, 0.5], [8.35, 2.05, -1.55, 2.05, 1.36, 0.55],
  [9.5, 2.06, -1.05, 1.98, 1.32, 0.6], [10.5, 2.08, -0.6, 1.86, 1.25, 0.6], [11.47, 2.1, -0.15, 1.7, 1.15, 0.6],
  [12.5, 2.15, 0.35, 1.45, 0.95, 0.55], [13.4, 2.2, 0.8, 1.15, 0.75, 0.5], [14.3, 2.25, 1.2, 0.85, 0.55, 0.4],
  [15.2, 2.3, 1.55, 0.58, 0.38, 0.28], [15.85, 2.3, 1.82, 0.36, 0.22, 0.18], [16.2, 2.24, 1.98, 0.12, 0.08, 0.08],
];
const FZ = FUS.map(f => f[0]), FI = z => FZ.indexOf(z);
// skin material by panel: 0 grey, 1 glass, 2 anti-glare black, 3 white top, 4 radome, -1 hole (ramp, cargo door, para doors)
function skinMat(z0, z1, qh) {
  if (z1 <= -12.75) return 4;                                                   // radome
  if (z0 >= -12.75 && z1 <= -12.3 && qh <= 3) return 2;                          // anti-glare panel ahead of the windscreen
  if (z0 >= -12.3 && z1 <= -11.35 && qh <= 4) return 1;                         // windscreen (two centre panes either side of the post, corners)
  if (z0 >= -11.35 && z1 <= -10.1 && qh >= 4 && qh <= 5) return 1;              // side windows
  if (z0 >= -11.35 && z1 <= -10.75 && qh === 2) return 1;                       // eyebrow windows over the pilots
  if (z0 >= -12.3 && z1 <= -11.85 && qh === 7) return 1;                         // lower (chin) windows by the rudder pedals
  if (z0 >= 6.45 && z1 <= 7.35 && (qh === 6 || qh === 7)) return -1;            // paratroop doors
  if (z0 >= 8.35 && z1 <= 14.3 && qh >= 9) return -1;                           // ramp + upper cargo door
  if (qh <= 3 && z0 >= -12.3) return 3;                                          // white top
  return 0;
}

// the window frame lines of the flight deck glazing ([points, radius] in airframe coordinates): bows across the
// windscreen and side windows, posts between the panes, the centre post
export function windowFrames() {
  const rings = FUS.map(f => full(rr(...f))), at = z => rings[FI(z)], along = (zs, k) => zs.map(z => at(z)[k]), out = [];
  out.push([at(-12.3).slice(1, 6), 0.035], [at(-12.3).slice(21, 26), 0.035], [at(-11.35).slice(1, 7), 0.035], [at(-11.35).slice(20, 26), 0.035],
    [at(-10.1).slice(3, 7), 0.035], [at(-10.1).slice(20, 24), 0.035], [at(-10.75).slice(2, 4), 0.03], [at(-10.75).slice(23, 25), 0.03]);
  for (const k of [2, 3, 4, 22, 23, 24, 1, 25]) out.push([along([-12.3, -11.85, -11.35], k), 0.03]);
  for (const k of [5, 21]) out.push([along([-11.35, -10.75, -10.1], k), 0.03]);
  out.push([along([-12.3, -11.85, -11.35], 0), 0.04], [at(-11.85).slice(7, 9), 0.025], [at(-11.85).slice(18, 20), 0.025]);
  return out;
}
// the inside of the nose skin from the radome bulkhead back to the hold (inset), glass panels left open; group 0 only
export function noseLiningGeo(inset = 0.05) {
  const sh = f => [f[0], f[1] - inset, f[2] + inset, f[3] - inset, Math.max(0.05, f[4] - inset), Math.max(0.05, f[5] - inset)];
  const i0 = FI(-12.75), i1 = FI(-9.4), rings = FUS.slice(i0, i1 + 1).map(f => full(rr(...sh(f))));
  return loft(rings, (r, k) => { const m = skinMat(FZ[i0 + r], FZ[i0 + r + 1], QH(k)); return m === 1 ? -1 : 0; });
}
// glass panes only (for the inside view: the exterior shell is hidden then)
export function noseGlassGeo() {
  const i1 = FI(-9.4), rings = FUS.slice(0, i1 + 1).map(f => full(rr(...f)));
  return loft(rings, (r, k) => skinMat(FZ[r], FZ[r + 1], QH(k)) === 1 ? 0 : -1);
}

// ------------------------------------------------------------------------------------------- decals
const texCache = {};
function decalTex(key, w, h, draw) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return texCache[key] = t;
}
// US national insignia (1947 star-and-bar with the red stripe), true proportions: star in a circle of radius R, bars 2R x R
function starBar(x, w, h) {
  const R = h * 0.42, cx = w / 2, cy = h / 2;
  x.fillStyle = '#1d2a55'; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();
  x.fillRect(cx - R * 2.05, cy - R * 0.55, R * 4.1, R * 1.1);
  x.fillStyle = '#f4f4ef'; x.fillRect(cx - R * 1.95, cy - R * 0.45, R * 3.9, R * 0.9);
  x.fillStyle = '#b3242a'; x.fillRect(cx - R * 1.95, cy - R * 0.16, R * 3.9, R * 0.32);
  x.fillStyle = '#f4f4ef'; x.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.382 : R * 0.97; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  x.fill();
  x.fillStyle = 'rgba(40,40,30,0.18)'; for (let i = 0; i < 30; i++) x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 1 + Math.random() * 2);   // scuffs
}
function text(x, w, h, str, size, col = '#141414', font = 'bold') {
  x.font = `${font} ${size}px "Arial Narrow", Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = col; x.fillText(str, w / 2, h / 2 + size * 0.04);
  x.fillStyle = 'rgba(200,200,190,0.25)'; for (let i = 0; i < 40; i++) x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 4, 1);   // chipped paint
}
function decal(parent, tex, w, h, pos, rotY, name, rotX = 0) {
  const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), parent, name);
  m.position.set(...pos); m.rotation.set(rotX, rotY, 0, 'YXZ'); m.renderOrder = 1; return m;
}

// ------------------------------------------------------------------------------------------- the model
export function buildC130Mesh() {
  const g = new THREE.Group(); g.name = 'c130';
  const greyM = MV(0xa9adb0), whiteM = MV(0xe6e6e1), radomeM = MV(0x555a5e), blackM = M(0x16181a, { shininess: 6 }), darkM = M(0x2a2d30);
  const metalM = M(0x6d7175, { shininess: 50 }), tyreM = M(0x1b1b1b, { shininess: 4 }), hubM = M(0x8a8e90), gearM = MV(0x9a9fa3);
  const propM = M(0x1e1f20, { shininess: 22 }), tipM = M(0xe2c21a), spinnerM = MV(0xa3a7aa), nacM = MV(0xa5a9ac), wingM = MV(0xa7abae), tailM = MV(0xa9adb0);
  const innerM = M(0x5d645a, { side: THREE.BackSide }), floorM = M(0x2e3236), seatM = M(0x8a2b22), rampM = MV(0x9fa3a6, { side: THREE.DoubleSide });
  const glassM = new THREE.MeshPhongMaterial({ color: 0x8aa4b0, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  const portM = M(0x1d2a33, { shininess: 90, specular: 0x9fb8cc });
  const body = bucket(), front = bucket(), shellG = group(g, 'shell'), shell = [shellG];

  // ---- fuselage: the nose (radome, flight deck skin, glazing; hidden from inside) and the rest
  const rings = FUS.map(f => full(rr(...f)));
  const skin = a => (r, k) => skinMat(FZ[a + r], FZ[a + r + 1], QH(k));
  const fMats = [greyM, glassM, blackM, whiteM, radomeM];
  const iN = FI(-10.1);
  { const geo = loft(rings.slice(0, iN + 1), skin(0), 4); applyWear(geo, 'skin'); mesh(geo, fMats, shellG, 'noseSkin'); }
  { const geo = loft(rings.slice(iN), skin(iN), -1, 0); applyWear(geo, 'skin'); mesh(geo, fMats, g, 'fuselage'); }
  // cargo hold lining (inside of the skin, holes where the doors and the ramp are) and the floor
  const lining = a => (r, k) => { const m = skinMat(FZ[a + r], FZ[a + r + 1], QH(k)); return m === -1 || m === 1 ? -1 : 0; };
  const iH0 = FI(-9.4), iH1 = FI(15.2);
  mesh(loft(rings.slice(iH0, iH1 + 1), lining(iH0)), innerM, g, 'holdLining');
  body.add(boxG(3.02, 0.08, 16.8, 0, -1.49, -0.05), floorM);
  { // flight deck floor bulkhead (seen through the open ramp: the front of the hold) and the ladder
    const h = rr(-9.4, 2.05, -1.85, 2.1, 1.38, 0.45), sh = new THREE.Shape([...h.map(p => new THREE.Vector2(p[0], p[1])), ...h.slice(0, -1).reverse().map(p => new THREE.Vector2(-p[0], p[1]))]);
    body.add(new THREE.ShapeGeometry(sh).translate(0, 0, -9.35), darkM);
  }
  // troop seats: red nylon webbing benches along both sides and down the middle, as in the 1980 hold
  for (const x of [-1.72, -0.25, 0.25, 1.72]) {
    body.add(boxG(0.42, 0.05, 11.5, x + (x < 0 ? 0.0 : 0.0), -1.0, 0.6), seatM);
    body.add(boxG(0.05, 0.5, 11.5, x + (Math.abs(x) > 1 ? Math.sign(x) * 0.2 : -Math.sign(x) * 0.2), -0.7, 0.6), seatM);
  }
  // portholes (small round windows along the hold), crew entrance door outline, escape hatches
  const portG = new THREE.CircleGeometry(0.17, 10);
  for (const s of [-1, 1]) for (const z of [-7.2, -3.4, 0.9, 3.9]) { const p = portG.clone().rotateY(s * Math.PI / 2).translate(s * 2.112, 0.35, z); body.add(p, portM); }
  body.add(boxG(0.03, 1.7, 0.95, -2.115, -0.65, -8.9), M(0x7d8184)); body.add(boxG(0.035, 0.06, 0.3, -2.12, -0.55, -8.55), darkM);   // crew door + handle
  for (const z of [-6.5, 1.8]) body.add(boxG(0.95, 0.03, 0.75, 0, 2.06, z), M(0x8e9295));                                      // overhead hatches
  // sponsons: main gear fairings bulging from the lower fuselage, with the gear wells
  // section: from the fuselage side out and down round the wheel bays to the bottom corner; [z, scale] tapers the ends
  const SP = [[-3.4, 0.05], [-2.9, 0.55], [-2.2, 0.92], [-1.4, 1.0], [2.4, 1.0], [3.3, 0.9], [4.1, 0.55], [4.7, 0.08]];
  const SPX = [[2.06, -0.1], [2.45, -0.3], [2.7, -0.65], [2.76, -1.1], [2.68, -1.5], [2.45, -1.72], [2.0, -1.8], [1.7, -1.84]];
  for (const s of [-1, 1]) {
    const rs = SP.map(([z, k]) => SPX.map(([x, y]) => [s * (2.0 + (x - 2.0) * k), y, z]));
    if (s < 0) rs.forEach(r => r.reverse());
    const geo = loft(rs, () => 0, 0, 0); body.add(geo, greyM, "skin");
  }
  // fuselage-top: wing centre fairing, antennas, beacon base
  body.add(boxG(4.0, 0.55, 5.0, 0, 2.18, 1.45), greyM, "skin");   // wing-to-fuselage fairing
  body.add(rodG([0, 2.4, -5.5], [0, 2.95, -4.8], 0.05), blackM); body.add(boxG(0.06, 0.45, 0.6, 0, 2.3, -3.1), blackM);       // antennas
  body.add(boxG(0.04, 0.35, 0.5, 0, -1.95, -4.0), blackM); body.add(boxG(0.04, 0.35, 0.5, 0, -1.95, 4.4), blackM);
  front.add(rodG([0.0, 2.05, -10.2], [0.0, 2.35, -9.7], 0.04), blackM);                                                   // flight deck mast
  front.add(rodG([-1.55, 0.6, -12.25], [-1.85, 0.6, -12.7], 0.03, 5), metalM); front.add(rodG([1.55, 0.6, -12.25], [1.85, 0.6, -12.7], 0.03, 5), metalM);   // pitots

  // ---- windscreen frames (the same lines frame the glass from inside, see windowFrames / c130cockpit.js)
  for (const [pts, r] of windowFrames()) front.add(tubeG(pts, r, Math.max(2, (pts.length - 1) * 3), 4), M(0x55595c));

  // ---- wing: centre section constant chord, outer panels taper with a little dihedral; NACA 64A318 -> 64A412
  // chord stations: x, LE z, chord, mean line y, thickness
  const WS = [[0, -1.0, 4.88, 2.52, 0.86], [2.1, -1.0, 4.88, 2.52, 0.86], [9.0, -1.0, 4.88, 2.55, 0.78], [14.0, -0.75, 3.75, 2.75, 0.55], [20.2, -0.25, 2.1, 2.98, 0.26]];
  const wingAt = x => { let i = 0; while (i < WS.length - 2 && x > WS[i + 1][0]) i++; const a = WS[i], b = WS[i + 1], t = (x - a[0]) / (b[0] - a[0]); return a.map((v, k) => v + (b[k] - v) * t); };
  // aerofoil section: points (u along chord 0..1, thickness factor) top then bottom
  const AF = [[0, 0], [0.02, 0.32], [0.08, 0.62], [0.2, 0.9], [0.35, 1.0], [0.55, 0.88], [0.72, 0.62]];   // ends at the flap / aileron hinge (72 %)
  const section = (x, uEnd = 0.72) => {
    const [, le, c, ym, t] = wingAt(Math.abs(x)), top = [], bot = [];
    for (const [u, f] of AF) { if (u > uEnd + 1e-6) break; top.push([x, ym + t * 0.42 * f, le + u * c]); bot.push([x, ym - t * 0.28 * f - 0.05 * t * u, le + u * c]); }
    return [...top.reverse(), ...bot.slice(1)];
  };
  for (const s of [-1, 1]) {
    const xs = [0, 2.1, 4.84 - 0.85, 4.84 + 0.85, 9.0, 9.7 - 0.85, 9.7 + 0.85, 12, 14.0, 17, 20.2].map(x => s * x);
    const rs = xs.map(x => section(x));
    if (s < 0) rs.reverse();
    const geo = loft(rs, () => 0, s > 0 ? -1 : 0, s > 0 ? 0 : -1);
    body.add(geo, wingM, 'wing');
    // wing tip fairing
    const [, le, c, ym, t] = wingAt(20.2);
    body.add(new THREE.SphereGeometry(1, 10, 6).scale(0.18, t * 0.4, c * 0.5).translate(s * 20.25, ym, le + c * 0.5), wingM, 'wing');
  }
  // fixed trailing-edge shrouds over the flaps (the flap slides out from under them)
  // ---- moving surfaces: Fowler flaps (fuselage to x 14, two pieces per side), ailerons (14 - 20)
  const flaps = [], ails = [];
  const surfSlab = (x0, x1, u0, u1, name, mat) => {
    const pts = [], seg = (x, u) => { const [, le, c, ym, t] = wingAt(Math.abs(x)); return [le + u * c, ym - 0.06 * t, t]; };
    const a0 = seg(x0, u0), a1 = seg(x1, u0), b1 = seg(x1, u1), b0 = seg(x0, u1);
    // hinge line at u0: local frame origin = hinge at x0; plate in (x, z) with thickness
    const hinge = V(x0, a0[1], a0[0]);
    const poly = [[x0, a0[0], a0[2] * 0.5], [x1, a1[0], a1[2] * 0.5], [x1, b1[0], 0.03], [x0, b0[0], 0.03]];
    const geo = slab(poly, (x, z, w) => { const [, le, c, ym, t] = wingAt(Math.abs(x)); const yy = ym - 0.06 * t + w; return [x - hinge.x, yy - hinge.y + (z - le - u0 * c) * -0.04, z - hinge.z]; });
    const G = group(g, name, hinge.x, hinge.y, hinge.z), dir = V(x1 - x0, a1[1] - a0[1], a1[0] - a0[0]).normalize();
    const mm = mesh(applyWear(geo, 'wing', [hinge.x, hinge.y, hinge.z]), mat, G, name + 'Skin');
    return { G, axis: dir, mesh: mm };
  };
  for (const s of [-1, 1]) {
    for (const [x0, x1] of [[2.15, 9.0], [9.0, 14.0]]) flaps.push({ ...surfSlab(s * x0, s * x1, 0.72, 1.0, 'flap', wingM), s });
    ails.push({ ...surfSlab(s * 14.05, s * 19.9, 0.72, 1.0, s < 0 ? 'aileronL' : 'aileronR', wingM), s });
  }
  // ---- nacelles: deep T56 nacelles with the chin intake, under-wing, running past the trailing edge
  const NAC = [[-3.7, 0.5, 0.5, 0.0], [-3.3, 0.6, 0.66, -0.05], [-2.4, 0.64, 0.86, -0.14], [-0.8, 0.62, 1.0, -0.22], [1.6, 0.6, 0.95, -0.15], [3.6, 0.5, 0.7, 0.08], [4.8, 0.3, 0.42, 0.28], [5.4, 0.1, 0.14, 0.38]];
  const nacRing = (x0, [z, w, h, dy]) => { const pts = []; for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI * 2; pts.push([x0 + Math.sin(a) * w, C130M.ENG_Y + dy + Math.cos(a) * h * (Math.cos(a) < 0 ? 1.05 : 0.95), z]); } return pts; };
  for (const ex of C130M.ENG_X) {
    body.add(loft(NAC.map(n => nacRing(ex, n)), () => 0, 0, 0), nacM, 'nacelle');
    body.add(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.42, 0.3, 0.5).rotateX(Math.PI / 2).translate(ex, C130M.ENG_Y - 0.55, -4.2), darkM);   // chin intake
    body.add(boxG(0.5, 0.25, 0.6, ex, C130M.ENG_Y - 0.62, -4.1), blackM);
    // exhaust: the tailpipe exits up the nacelle's back above the wing (soot streams over the flaps)
    body.add(cylZ(0.24, 0.27, 0.7, 10, true).rotateX(-0.25).translate(ex + 0.25, C130M.ENG_Y + 0.88, 3.7), M(0x2f2c29, { side: THREE.DoubleSide }));
    body.add(new THREE.CircleGeometry(0.22, 10).rotateX(-0.25).translate(ex + 0.25, C130M.ENG_Y + 0.97, 4.05), blackM);
    body.add(boxG(0.03, 0.6, 1.6, ex - 0.62, C130M.ENG_Y, -1.6), M(0x8b8f92));                                     // cowl seam
  }
  // KC-130 refuelling pods outboard of the outboard engines, 1,360 gal pylon tanks between the engines
  for (const s of [-1, 1]) {
    body.add(cylZ(0.38, 0.32, 4.2, 12).translate(s * 13.4, 1.55, 0.6), greyM, 'nacelle'); body.add(new THREE.ConeGeometry(0.38, 0.9, 12).rotateX(-Math.PI / 2).translate(s * 13.4, 1.55, -1.95), greyM, 'nacelle');
    body.add(cylZ(0.18, 0.05, 0.6, 8, true).translate(s * 13.4, 1.55, 2.95), darkM); body.add(boxG(0.12, 0.55, 2.0, s * 13.4, 2.15, 0.4), greyM, 'nacelle');   // drogue opening, pylon
    body.add(new THREE.CircleGeometry(0.3, 10).translate(s * 13.4, 1.55, 3.25), M(0xd8d8d0));
    body.add(cylZ(0.62, 0.62, 5.6, 12).translate(s * 7.27, 1.2, -0.2), greyM, 'nacelle'); body.add(new THREE.SphereGeometry(0.62, 12, 6).scale(1, 1, 2.0).translate(s * 7.27, 1.2, -3.0), greyM, 'nacelle');
    body.add(new THREE.SphereGeometry(0.62, 12, 6).scale(1, 1, 2.4).translate(s * 7.27, 1.2, 2.6), greyM, 'nacelle'); body.add(boxG(0.14, 0.7, 2.6, s * 7.27, 1.8, -0.2), greyM, 'nacelle');
  }

  // ---- empennage: dorsal fillet, fin, rudder, tailplane, elevators
  const FIN = [[7.2, 2.2, 0.32], [10.4, 3.0, 0.5], [11.4, 5.0, 0.42], [12.6, 8.8, 0.28], [13.0, 8.97, 0.22], [14.65, 8.97, 0.18], [14.55, 7.0, 0.22], [14.4, 3.2, 0.3], [14.3, 2.25, 0.36]];
  body.add(slab(FIN, (z, y, w) => [w, y, z]), tailM, 'skin');
  const rudG = group(g, "rudder", 0, 2.3, 14.3); rudG.rotation.x = -Math.atan2(14.65 - 14.3, 8.97 - 2.3);   // hinge line leans back
  const rudLen = Math.hypot(14.65 - 14.3, 8.97 - 2.3);
  mesh(applyWear(slab([[0, 0, 0.3], [rudLen, 0, 0.18], [rudLen, 1.0, 0.05], [0.0, 1.25, 0.06]], (a, b, w) => [w, a, b]), "skin", [0, 2.3, 14.3]), tailM, rudG, 'rudderSkin');
  const TP = [[0, 12.1, 4.2], [1.2, 12.1, 4.1], [8.02, 14.05, 1.95]];   // half-span x, LE z, chord (span 16.05 m)
  const elevs = [];
  for (const s of [-1, 1]) {
    const pl = [[s * 0.6, 12.0, 0.42], [s * 8.02, 14.05, 0.2], [s * 8.02, 15.0, 0.12], [s * 0.6, 14.75, 0.3]];
    body.add(slab(pl, (x, z, w) => [x, 2.45 + w, z]), tailM, 'skin');
    body.add(new THREE.SphereGeometry(1, 8, 4).scale(0.12, 0.1, 0.6).translate(s * 8.05, 2.45, 14.6), tailM, 'skin');
    const eG = group(g, "elevator", s * 0.6, 2.45, 14.75), eLen = 7.42;
    mesh(applyWear(slab([[0, 0, 0.26], [s * eLen, 0.25, 0.1], [s * eLen, 1.15, 0.03], [0, 1.4, 0.04]], (x, z, w) => [x, w, z]), 'skin', [s * 0.6, 2.45, 14.75]), tailM, eG, s < 0 ? 'elevatorLSkin' : 'elevatorRSkin');
    eG.rotation.y = -s * Math.atan2(0.25, eLen); elevs.push(eG);
  }

  // ---- props: four 54H60s turning clockwise seen from behind; spinner, four paddle blades with the yellow tips,
  // pitch about each blade's axis (blade angle beta: 0 = flat in the disc, 92.5 = feathered edge-on), blur discs
  const blurTex = decalTex('blur', 128, 128, (x, w, h) => {
    const gr = x.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(20,20,20,0.0)'); gr.addColorStop(0.18, 'rgba(25,25,25,0.6)'); gr.addColorStop(0.86, 'rgba(30,30,30,0.42)'); gr.addColorStop(0.9, 'rgba(210,180,30,0.5)'); gr.addColorStop(0.985, 'rgba(210,180,30,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
  });
  const props = [];
  const bladeShape = [[0.32, -0.12, 0.1], [0.55, -0.2, 0.08], [1.1, -0.27, 0.06], [1.6, -0.27, 0.045], [1.85, -0.22, 0.035], [2.0, -0.1, 0.025], [2.05, 0.05, 0.02], [2.0, 0.18, 0.025], [1.6, 0.27, 0.04], [1.1, 0.29, 0.05], [0.55, 0.22, 0.07], [0.32, 0.12, 0.09]];
  const bladeG = slab(bladeShape.filter(p => p[0] <= 1.86), (r, c, w) => [c, r, w]);   // span along +y, chord along x, thickness z
  const tipShape = [[1.85, -0.22, 0.035], [2.0, -0.1, 0.025], [2.05, 0.05, 0.02], [2.0, 0.18, 0.025], [1.85, 0.25, 0.03]];
  const tipG = slab(tipShape, (r, c, w) => [c, r, w]);
  for (let k = 0; k < 4; k++) {
    const P = group(g, 'prop' + k, C130M.ENG_X[k], C130M.ENG_Y, C130M.PROP_Z), spin = group(P, 'spin');
    mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.45, 0.45, 0.85).rotateX(-Math.PI / 2), spinnerM, spin, 'spinner').position.z = -0.1;
    mesh(cylZ(0.47, 0.5, 0.5, 12), spinnerM, spin, 'spinnerAft').position.z = 0.2;
    const blades = [];
    for (let b = 0; b < 4; b++) {
      const arm = group(spin, 'arm', 0, 0, 0); arm.rotation.z = b * Math.PI / 2;
      const pitch = group(arm, 'pitch'); mesh(bladeG, propM, pitch, 'blade'); mesh(tipG, tipM, pitch, 'bladeTip');
      mesh(cylZ(0.13, 0.13, 0.36, 8).rotateX(Math.PI / 2).translate(0, 0.35, 0), propM, pitch, 'cuff');
      blades.push(pitch);
    }
    const discM = new THREE.MeshBasicMaterial({ map: blurTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const disc = mesh(new THREE.CircleGeometry(C130M.PROP_R, 40), discM, P, 'propDisc'); disc.renderOrder = 3; disc.position.z = -0.02;
    props.push({ P, spin, blades, disc, discM, psi: k * 0.7 });
  }

  // ---- main gear: two tandem pairs per side on vertical struts (they retract straight up into the sponsons)
  const mainG = [], wheelGeo = cylX(C130M.MAIN_WHEEL_R, 0.5, 14), hubGeo = cylX(0.32, 0.52, 10);
  for (let i = 0; i < 4; i++) {
    const [x, y, z] = C130M.GEAR.main[i], G = group(g, 'mainGear' + i, x, y + C130M.MAIN_WHEEL_R, z), strut = group(G, 'strut');
    mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.3, 8).translate(0, 0.65, 0), gearM, strut, 'oleo');
    mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 8).translate(0, 1.15, 0), gearM, G, "cylinder");
    const wl = group(strut, 'wheel'); mesh(wheelGeo, tyreM, wl, 'tyre'); mesh(hubGeo, hubM, wl, 'hub');
    mainG.push({ G, strut, wl, y0: G.position.y });
  }
  // nose gear: twin wheels, steerable, folds forward into the nose bay; bay doors
  const noseG = group(g, 'noseGear', 0, -1.55, C130M.GEAR.nose[2]), noseStrut = group(noseG, 'noseStrut'), noseSteer = group(noseStrut, 'noseSteer');
  mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.75, 8).translate(0, -0.37, 0), gearM, noseStrut, "noseOleo");
  const nw = group(noseSteer, "noseWheels", 0, -0.7, 0);
  for (const s of [-1, 1]) { mesh(cylX(C130M.NOSE_WHEEL_R, 0.32, 12).translate(s * 0.25, 0, 0), tyreM, nw, 'tyre'); mesh(cylX(0.22, 0.34, 8).translate(s * 0.25, 0, 0), hubM, nw, 'hub'); }
  const noseDoors = [-1, 1].map(s => { const d = group(g, 'noseDoor', s * 0.55, -1.84, -9.3); mesh(boxG(0.03, 0.75, 1.9, 0, -0.37, 0), greyM, d, 'noseDoorSkin'); return d; });
  // ---- ramp and upper cargo door: lofted from the hole they fill, pivoting about their hinges
  const holeRings = (z0, z1) => rings.slice(FI(z0), FI(z1) + 1).map(R => R.slice(9, 18));
  const RH = C130M.RAMP_HINGE, CH = C130M.CARGO_DOOR_HINGE;
  const rampG = group(g, 'ramp', ...RH), rampGeo = loft(holeRings(8.35, 11.47)).translate(-RH[0], -RH[1], -RH[2]);
  mesh(applyWear(rampGeo, 'ramp', RH), rampM, rampG, 'rampSkin');
  mesh(boxG(3.0, 0.06, 3.1, 0, 0.0, 1.55).rotateX(-Math.atan2(1.4, 3.12)), floorM, rampG, 'rampFloor');   // the ramp's floor
  const doorUG = group(g, 'cargoDoor', ...CH), doorUGeo = loft(holeRings(11.47, 14.3)).translate(-CH[0], -CH[1], -CH[2]);
  mesh(applyWear(doorUGeo, 'ramp', CH), rampM, doorUG, 'cargoDoorSkin');
  // paratroop doors: plug doors that slide up inside the hold; the jump platform folds out below each
  const paraDoors = [-1, 1].map(s => {
    const D = group(g, 'paraDoor', s * 2.07, -0.53, 6.9);
    mesh(boxG(0.05, 1.75, 0.9), M(0x9a9ea1, { side: THREE.DoubleSide }), D, 'paraDoorSkin');
    mesh(new THREE.CircleGeometry(0.13, 8).rotateY(s * Math.PI / 2).translate(s * 0.03, 0.35, 0), portM, D, 'paraDoorWindow');
    const plat = group(g, 'jumpPlatform', s * 2.1, -1.42, 6.9); mesh(boxG(0.35, 0.04, 0.9, s * 0.17, 0, 0), darkM, plat, 'platform'); plat.visible = false;
    // air deflector (spoiler) that swings out ahead of the open door
    const defl = group(g, 'airDeflector', s * 2.1, -0.53, 6.38); mesh(boxG(0.04, 1.6, 0.5, 0, 0, 0.25), greyM, defl, 'deflector'); defl.rotation.y = 0;
    return { D, s, plat, defl };
  });

  // ---- lights: red rotating beacons (top and belly), nav lights at the wing tips, white tail light, landing lights,
  // the jump lights (red / green) by each para door
  const beaconM = B(0xff2414), beaconOffM = M(0x5a120e), navOff = M(0x333333);
  const beacons = [[0, 2.42, 2.6], [0, -1.93, 1.8], [0, 9.05, 14.2]].map(p => { const h = mesh(new THREE.SphereGeometry(0.11, 8, 4), beaconOffM, g, 'beacon'); h.position.set(...p); return h; });
  const navs = [[-20.38, 2.98, 0.75, B(0xff2a1a)], [20.38, 2.98, 0.75, B(0x2aff5a)], [0, 1.9, 16.25, B(0xffffff)]].map(([x, y, z, m]) => { const o = mesh(new THREE.SphereGeometry(0.08, 6, 3), navOff, g, 'navLight'); o.position.set(x, y, z); o.userData.on = m; return o; });
  const jumpLights = [-1, 1].map(s => {
    const r = mesh(new THREE.SphereGeometry(0.05, 6, 3), M(0x330000), g, 'jumpRed'), gr = mesh(new THREE.SphereGeometry(0.05, 6, 3), M(0x003300), g, 'jumpGreen');
    r.position.set(s * 1.98, 0.55, 6.25); gr.position.set(s * 1.98, 0.42, 6.25); return { r, g: gr };
  });

  // ---- markings
  const marinesT = decalTex('marines', 512, 96, (x, w, h) => text(x, w, h, 'MARINES', 82));
  const qbT = decalTex('qb', 256, 192, (x, w, h) => text(x, w, h, 'QB', 170));
  const bunoT = decalTex('buno', 256, 96, (x, w, h) => { text(x, w, h * 0.55, '160021', 40); x.translate(0, h * 0.45); text(x, w, h * 0.55, 'VMGR-352', 30); });
  const navyT = decalTex('navy', 512, 64, (x, w, h) => text(x, w, h, 'U.S. MARINE CORPS', 44));
  const starT = decalTex('star', 256, 128, (x, w, h) => starBar(x, w, h));
  const noStepT = decalTex('nostep', 256, 48, (x, w, h) => text(x, w, h, 'NO STEP', 34, '#2a2a2a'));
  const rescueT = decalTex('rescue', 256, 96, (x, w, h) => { x.strokeStyle = '#d84a18'; x.lineWidth = 6; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(10 + i * 4, 10 + i * 4); x.lineTo(w - 10 - i * 4, 10 + i * 4); x.stroke(); } text(x, w, h + 30, 'RESCUE', 26, '#d84a18'); });
  for (const s of [-1, 1]) {
    decal(g, marinesT, 4.6, 0.86, [s * 2.118, 1.05, -4.6], s * Math.PI / 2, 'marines');
    decal(g, navyT, 3.2, 0.4, [s * 2.118, -0.95, -2.2], s * Math.PI / 2, 'usmc');
    decal(g, starT, 2.3, 1.15, [s * 2.105, 0.1, 9.6 - 0.0], s * (Math.PI / 2 - 0.06), 'insignia');
    decal(g, qbT, 2.0, 1.5, [s * 0.2, 6.0, 13.4], s * Math.PI / 2, 'tailCode');
    decal(g, bunoT, 1.6, 0.6, [s * 0.25, 3.7, 14.0], s * Math.PI / 2, 'buno');
    decal(g, rescueT, 1.0, 0.38, [s * 2.118, 1.65, -8.9], s * Math.PI / 2, 'rescue');
  }
  decal(g, starT, 3.6, 1.8, [-15.0, 3.1, 1.0], 0, 'insigniaWing', -Math.PI / 2);   // upper left wing
  { const d = decal(g, starT, 3.6, 1.8, [15.0, 2.36, 1.0], 0, 'insigniaWingLow', Math.PI / 2); d.rotation.z = Math.PI; }   // lower right wing
  for (const s of [-1, 1]) decal(g, noStepT, 1.4, 0.26, [s * 11.8, 3.12, 2.4], 0, 'noStep', -Math.PI / 2);
  // the red propeller warning band on the fuselage sides in the plane of the props, white border and lettering
  const propT = decalTex('propwarn', 64, 512, (x, w, h) => { x.fillStyle = '#f2f2ea'; x.fillRect(0, 0, w, h); x.fillStyle = '#c0281c'; x.fillRect(8, 0, w - 16, h);
    x.save(); x.translate(w / 2, h / 2); x.rotate(-Math.PI / 2); x.font = 'bold 26px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#f2f2ea'; x.fillText('DANGER  PROPELLER', 0, 1); x.restore(); });
  for (const s of [-1, 1]) decal(g, propT, 0.32, 2.6, [s * 2.117, -0.2, C130M.PROP_Z], s * Math.PI / 2, 'propWarning');
  // wing walkways: black edge lines from the fuselage out past the inboard nacelles
  const walkT = decalTex('walk', 256, 32, (x, w, h) => { x.fillStyle = '#1a1a1a'; x.fillRect(0, 2, w, 3); x.fillRect(0, h - 5, w, 3); });
  for (const s of [-1, 1]) decal(g, walkT, 3.4, 0.9, [s * 3.9, 3.06, 1.2], 0, 'walkway', -Math.PI / 2);
  // the HF long-wire antenna from the flight deck roof to the fin, a C-130 signature
  { const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute([0, 2.35, -9.7, 0, 2.75, 2.5, 0, 2.75, 2.5, 0, 8.7, 12.7], 3));
    const wire = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x202020 })); wire.name = 'hfWire'; g.add(wire);
    body.add(rodG([0, 2.4, 2.5], [0, 2.78, 2.5], 0.04), blackM); }

  // ---- the crew seen through the windscreen from outside (the flight deck module draws its own inside)
  { const crewM = M(0x55603f), helmM = M(0x2b2f2a), skinM = M(0xc19a77);
    for (const s of [-1, 1]) {
      front.add(boxG(0.42, 0.55, 0.3, s * 0.62, 0.6, -10.4), crewM); front.add(new THREE.SphereGeometry(0.12, 8, 5).translate(s * 0.62, 1.05, -10.45), skinM);
      front.add(new THREE.SphereGeometry(0.15, 8, 5, 0, Math.PI * 2, 0, 1.7).translate(s * 0.62, 1.1, -10.42), helmM);
      front.add(boxG(0.55, 0.2, 0.55, s * 0.62, 0.3, -10.3), darkM);
    }
    front.add(boxG(3.4, 0.45, 0.4, 0, 0.55, -11.55), blackM);   // glareshield + panel
  }

  body.flush(g, 'airframe'); front.flush(shellG, 'flightDeckExterior');

  // ---- animation (no allocations)
  const _q = new THREE.Quaternion();
  function animate(S = {}, dt = 0, time = 0, inside = false) {
    // props: rpm 1021 at 100 %; blades fade into a blur disc above ~30 % rpm
    for (let k = 0; k < 4; k++) {
      const e = S.eng ? S.eng[k] : { N: 0, beta: 92.5 }, pr = props[k], N = e.N || 0;
      pr.psi = (pr.psi - N * 106.9 * dt) % (Math.PI * 2);   // clockwise seen from behind = negative about +z... (nose -z)
      // show the blades at the rate the eye reads them: a slow sweep when the rpm is high (stroboscopic look), real when slow
      pr.spin.rotation.z = N > 0.35 ? pr.psi * 0.02 + time * -2.3 : pr.psi;
      const beta = (e.beta ?? 92.5) * D2R;
      for (const b of pr.blades) b.rotation.y = -(beta - 0.0);
      const blur = smooth(N, 0.2, 0.6);
      pr.discM.opacity = (inside ? 0.45 : 0.85) * blur;
      for (const b of pr.blades) b.visible = blur < 0.97;
      pr.disc.visible = blur > 0.01;
    }
    // flaps: Fowler - aft along the chord and down (100 % = 1.0 m aft, 35 deg down; INFERRED from drawings)
    const f = clamp(S.flap || 0, 0, 1);
    for (const F of flaps) { F.G.position.copy(F.G.userData.p0 || (F.G.userData.p0 = F.G.position.clone())); F.G.position.z += f * 0.95; F.G.position.y -= f * 0.18; _q.setFromAxisAngle(F.axis, F.s * -f * 0.61); F.G.quaternion.copy(_q); }
    const ail = clamp(S.ail || 0, -0.4, 0.4);
    for (const A of ails) { _q.setFromAxisAngle(A.axis, -A.s * ail * A.s * (A.s < 0 ? 1 : -1)); A.G.quaternion.copy(_q); }
    for (const E of elevs) E.rotation.x = -clamp(S.ele || 0, -0.4, 0.5);
    rudG.rotation.y = -clamp(S.rud || 0, -0.62, 0.62);
    // gear: mains straight up 0.95 m into the sponsons, struts compress with weight; nose folds forward
    const gd = clamp(S.gear ?? 1, 0, 1);
    for (let i = 0; i < 4; i++) { const m = mainG[i]; m.G.position.y = m.y0 + (1 - gd) * 0.95; m.strut.position.y = (S.wow ? S.wow[i + 1] || 0 : 0); }
    noseStrut.rotation.x = (1 - gd) * 1.55; noseSteer.rotation.y = -(S.steer || 0) * gd; noseStrut.position.y = S.wow ? S.wow[0] || 0 : 0;
    for (let i = 0; i < 2; i++) noseDoors[i].rotation.z = (i ? -1 : 1) * smooth(gd, 0, 0.3) * 1.2 * (gd < 0.999 || gd > 0.001 ? 1 : 1);
    // ramp (down to level = 24 deg, further to the ground) and the upper door (up into the tail)
    const rp = clamp(S.ramp || 0, 0, 1.25);
    rampG.rotation.x = rp * 0.42; doorUG.rotation.x = clamp(rp, 0, 1) * 0.55;
    // para doors slide up inside; platforms and air deflectors come out when open
    for (let i = 0; i < 2; i++) {
      const d = paraDoors[i], o = clamp(S.door ? S.door[i] : 0, 0, 1);
      d.D.position.y = -0.53 + o * 1.5; d.D.position.x = d.s * (2.07 - o * 0.6);   // slides up and in, along the curved side
      d.plat.visible = o > 0.9; d.defl.rotation.y = -d.s * o * 0.9;
    }
    // lights
    const live = (S.eng || []).some(e => e.N > 0.05), fl = live && (time % 1.1) < 0.12;
    for (const b of beacons) { b.material = fl ? beaconM : beaconOffM; b.scale.setScalar(fl ? 1.5 : 1); }
    for (const n of navs) n.material = live ? n.userData.on : navOff;
    const jl = S.jumpLight || 'off', blink = (time % 0.5) < 0.3;
    for (const j of jumpLights) { j.r.material.color.setHex(jl === 'red' ? 0xff2010 : 0x330000); j.g.material.color.setHex(jl === 'green' && blink ? 0x30ff40 : 0x003300); }
    for (const o of shell) o.visible = !inside;
  }
  animate({});
  return { group: g, shell, animate, parts: { props, flaps, ails, elevs, rudder: rudG, mainG, noseGear: noseG, ramp: rampG, cargoDoor: doorUG, paraDoors, beacons, jumpLights } };
}
