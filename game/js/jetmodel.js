// HORNET: the F/A-18A of 1980 (a full-scale development jet, see "1980 markings"), exterior model with every moving part
// (surfaces, gear, hook, canopy, nozzles, afterburner, lights, stores). Low-poly, flat-shaded, real-world metres.
// Local frame: +x right wing, +y up, nose along -z, origin at the CG (over the wing root, main gear just behind it).
import * as THREE from 'three';

const HOOK_PIVOT = [0, -0.75, 5.6], HOOK_LEN = 1.75, HOOK_UP = -0.1, HOOK_DOWN = 0.75;   // arm angles below aft-horizontal
export const JET = {
  L: 17.1, SPAN: 11.43, EYE: [0, 0.98, -4.35],
  GEAR: { nose: [0, -2.05, -4.6], mainL: [-1.6, -2.05, 0.6], mainR: [1.6, -2.05, 0.6] },   // wheel bottoms, gear down, struts extended
  WHEEL_R: { nose: 0.28, main: 0.40 },
  HOOK_PIVOT, HOOK_LEN, HOOK_UP, HOOK_DOWN,   // tip = pivot + LEN * (0, -sin a, cos a), a = UP..DOWN; down tip ~ (0, -1.94, 6.88)
  STATIONS: {
    aam: [[-5.86, -0.04, 1.2], [5.86, -0.04, 1.2]],                                     // missile centres (nose at z - 1.5)
    bomb: [[-3.9, -0.35, 0.3], [-2.6, -0.35, 0.3], [2.6, -0.35, 0.3], [3.9, -0.35, 0.3]], // left outer, left inner, right inner, right outer
    gun: [0, 0.33, -7.05],                                                              // M61 muzzle port on the nose top
  },
  COCKPIT: { z0: -5.7, z1: -3.0, sill: 0.72, halfW: 0.62 },
  CANOPY_HINGE: [0, 0.95, -2.4], CANOPY_OPEN: 0.75,
};

const M = (c, o = {}) => new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 22, ...o });
const B = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0);

// ------------------------------------------------------------------------------------------- geometry helpers
// triangle soup -> geometry; flips every triangle if the (closed-ish) mesh has negative signed volume, so mirrored
// builds never come out inside-out
function soup(pos, groups) {
  let vol = 0;
  for (let i = 0; i < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = pos.slice(i, i + 9);
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  if (vol < 0) for (let i = 0; i < pos.length; i += 9) for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (groups) for (const [s, n, m] of groups) g.addGroup(s, n, m);
  g.computeVertexNormals(); return g;
}
// thin plate from a 2D outline [[a, b, thick, below = 0.5]...]; map(a, b, w) -> [x, y, z] (w = offset across the plate)
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
// skin through rings of points (each an open polyline, same length); matFn(ring, seg) -> material index; optional end caps
function loft(rings, matFn = () => 0, capEnd = -1) {
  const buckets = [];
  const put = (m, ...pts) => (buckets[m] ||= []).push(...pts.flat());
  for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < rings[r].length - 1; k++) {
    const a = rings[r][k], b = rings[r][k + 1], c = rings[r + 1][k + 1], d = rings[r + 1][k], m = matFn(r, k);
    put(m, a, b, c); put(m, a, c, d);
  }
  if (capEnd >= 0) {   // fan over the last ring
    const R = rings[rings.length - 1], c = R.reduce((s, p) => [s[0] + p[0] / R.length, s[1] + p[1] / R.length, s[2] + p[2] / R.length], [0, 0, 0]);
    for (let k = 0; k < R.length - 1; k++) put(capEnd, R[k], c, R[k + 1]);
  }
  const pos = [], groups = [];
  buckets.forEach((b, m) => { if (b) { groups.push([pos.length / 3, b.length / 3, m]); pos.push(...b); } });
  return soup(pos, groups);
}
// merge simple geometries (position + normal) into one
function merge(geos) {
  const pos = [], nor = [];
  for (let g of geos) { g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals(); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g;
}
const cylZ = (r0, r1, len, seg = 10, open = false) => new THREE.CylinderGeometry(r1, r0, len, seg, 1, open).rotateX(Math.PI / 2);   // r0 at -z, r1 at +z
const boxG = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const mesh = (geo, mat, parent, name) => { const m = new THREE.Mesh(geo, mat); if (name) m.name = name; parent && parent.add(m); return m; };
// a box spanning two points (struts, braces, bars)
function rod(a, b, w, mat, parent, name) {
  const d = V().subVectors(b, a), m = mesh(new THREE.BoxGeometry(w, w, d.length()), mat, parent, name);
  m.position.addVectors(a, b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(V(0, 0, 1), d.normalize()); return m;
}
// a control surface on a hinge line p0 -> p1: geometry is given in aircraft coordinates, the returned pivot rotates
// about the hinge (rotation.x). With p1 - p0 along +x, positive rotation moves the aft edge DOWN; along +y, aft edge to +x.
function hinged(parent, geo, mat, p0, p1, name) {
  const o = new THREE.Group(); o.position.copy(p0); o.quaternion.setFromUnitVectors(X, V().subVectors(p1, p0).normalize()); o.updateMatrix();
  geo.applyMatrix4(o.matrix.clone().invert());
  const pv = new THREE.Group(); pv.name = name; o.add(pv); mesh(geo, mat, pv, name + 'Skin'); parent.add(o); return pv;
}

// two-tone paint on a plate: faces looking down get material 1 (the white undersides), the rest material 0
function twoTone(geo, below = -0.35) {
  const p = geo.attributes.position.array, up = [], dn = [], a = V(), b = V(), c = V(), n = V();
  for (let i = 0; i < p.length; i += 9) {
    a.fromArray(p, i); b.fromArray(p, i + 3); c.fromArray(p, i + 6); n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    (n.y < below ? dn : up).push(...p.slice(i, i + 9));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...up, ...dn], 3));
  g.addGroup(0, up.length / 3, 0); g.addGroup(up.length / 3, dn.length / 3, 1); g.computeVertexNormals(); return g;
}

// ------------------------------------------------------------------------------------------- 1980 markings
// In summer 1980 the only Hornets in the world are the eleven full-scale development jets of the Naval Air Test Center,
// Patuxent River (VFA-125, the first squadron, only forms in November 1980). So the ALBATROSS flies FSD single-seaters:
// the player's jet is FSD #3, BuNo 160777, the carrier-suitability jet (USS America trials, Oct-Nov 1979); every
// further model (the parked jets on deck) takes the next single-seater. Paint: the pre-low-visibility Navy scheme still
// in force in 1980, gloss light gull grey FS 16440 over gloss white FS 17875, full-colour national insignia (upper left /
// lower right wing, intake sides), black NAVY titles, the FSD number on the nose and fins, the BuNo on the fins, and a
// day-glo red-orange test band at the fin tips (NATC practice; the exact trim of this jet is INFERRED, not checked
// against photographs).
const FSD = [[3, 160777], [1, 160775], [2, 160776], [4, 160778], [5, 160779], [6, 160780], [8, 160782], [9, 160783], [11, 160785]];
let fsdNext = 0;
const _tex = new Map();
function texOf(key, w, h, draw) {
  if (_tex.has(key)) return _tex.get(key);
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.clearRect(0, 0, w, h); draw(x, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; _tex.set(key, t); return t;
}
const INK = '#16191c';
const stencil = (x, t, cx, cy, px, col = INK) => { x.font = `bold ${px}px "Arial Narrow", Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = col; x.fillText(t, cx, cy); };
function starBar(x, w, h) {   // US national insignia: white star on a blue disc, white bars (R x R/2) with a red stripe, blue border
  const cx = w / 2, cy = h / 2, R = h * 0.44, blue = '#1c2f6e';
  x.fillStyle = blue; x.fillRect(cx - R * 2.12, cy - R * 0.31 - R * 0.12, R * 4.24, R * 0.74);
  x.fillStyle = '#f4f4f0'; x.fillRect(cx - R * 2.0, cy - R * 0.31, R * 4.0, R * 0.5);
  x.fillStyle = '#b0202a'; x.fillRect(cx - R * 2.0, cy - R * 0.31 + R * 0.25 - R / 12, R * 4.0, R / 6);
  x.fillStyle = blue; x.beginPath(); x.arc(cx, cy, R * 1.08, 0, 7); x.fill();
  x.fillStyle = '#f4f4f0'; x.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.38 : R; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  x.fill();
}
function decalMesh(tex, w, h, parent, name) {
  const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhongMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, shininess: 22 }), parent, name);
  if (!tex) m.visible = false; return m;
}

// ------------------------------------------------------------------------------------------- the model
export function buildJetMesh(side = 1, fsd) {   // fsd: index into FSD (0 = the player's #3); default: the next of the others
  const g = new THREE.Group(); g.name = 'hornet';
  const team = side === 2 ? 0xff3322 : 0xff5a22;   // fin tip band: day-glo red-orange test band (side 2: red)
  const [fsdNo, buno] = FSD[fsd ?? 1 + (fsdNext++ % (FSD.length - 1))];
  const greyM = M(0xa7aaab, { shininess: 40 }), underM = M(0xe8e9e6, { shininess: 40 }), radomeM = M(0x9a9d9e, { shininess: 30 }), glareM = M(0x2a2d30), darkM = M(0x24272a), blackM = M(0x0c0d0e, { shininess: 5 });
  const pair2 = [greyM, underM];
  const metalM = M(0x4a4d52, { shininess: 50 }), gearM = M(0xd9dcde), tyreM = M(0x1b1b1b, { shininess: 4 }), teamM = M(team, { emissive: team, emissiveIntensity: 0.15 });
  const glassM = new THREE.MeshPhongMaterial({ color: 0x9fc6d8, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  const frameM = M(0x34383c);

  // ---- fuselage: half profiles [top, upper, shoulder, side-hi, side, side-lo, chine, keel] mirrored into rings;
  // over the cockpit the 'top' point moves out to the coaming (x 0.52) so the skin is open between z -5.7 and -3.0
  const P = [
    [-8.6, [[0, -0.05], [0, -0.05], [0, -0.05], [0, -0.05], [0, -0.05], [0, -0.05], [0, -0.05], [0, -0.05]]],
    [-8.25, [[0, .07], [.07, .06], [.12, .03], [.15, -.02], [.155, -.06], [.14, -.11], [.09, -.16], [0, -.18]]],
    [-7.8, [[0, .19], [.12, .175], [.21, .12], [.27, .03], [.28, -.05], [.26, -.15], [.16, -.27], [0, -.31]]],
    [-7.0, [[0, .34], [.2, .32], [.36, .22], [.44, .08], [.46, -.05], [.43, -.25], [.27, -.45], [0, -.5]]],
    [-6.5, [[0, .48], [.25, .45], [.44, .33], [.53, .16], [.55, 0], [.52, -.3], [.33, -.56], [0, -.62]]],
    [-6.0, [[0, .66], [.3, .63], [.5, .5], [.6, .3], [.62, .05], [.59, -.35], [.37, -.67], [0, -.72]]],
    [-5.75, [[0, .79], [.32, .76], [.55, .64], [.62, .4], [.64, .08], [.6, -.4], [.38, -.71], [0, -.76]]],
    [-5.7, [[.52, .72], [.62, .72], [.64, .62], [.65, .4], [.66, .08], [.61, -.42], [.39, -.73], [0, -.77]]],
    [-4.4, [[.52, .72], [.62, .72], [.66, .62], [.69, .4], [.70, .08], [.66, -.45], [.42, -.78], [0, -.82]]],
    [-3.0, [[.52, .72], [.62, .72], [.67, .62], [.72, .4], [.75, .08], [.7, -.45], [.45, -.8], [0, -.85]]],
    [-2.85, [[0, .93], [.3, .9], [.62, .74], [.72, .42], [.76, .08], [.71, -.45], [.46, -.81], [0, -.85]]],
    [-1.5, [[0, .92], [.3, .89], [.65, .72], [.8, .42], [.86, .08], [.8, -.45], [.5, -.84], [0, -.86]]],
    [0.5, [[0, .9], [.3, .87], [.7, .7], [.9, .42], [.98, .1], [.92, -.45], [.58, -.86], [0, -.86]]],
    [2.5, [[0, .86], [.32, .84], [.85, .68], [1.05, .45], [1.12, .12], [1.05, -.45], [.65, -.82], [0, -.82]]],
    [4.5, [[0, .82], [.34, .8], [1.0, .66], [1.12, .45], [1.16, .12], [1.08, -.45], [.65, -.78], [0, -.76]]],
    [6.6, [[0, .72], [.36, .7], [1.06, .64], [1.13, .42], [1.15, .1], [1.06, -.45], [.62, -.72], [0, -.62]]],
    [7.45, [[0, .42], [.36, .44], [1.0, .56], [1.08, .35], [1.1, 0], [1.0, -.48], [.6, -.68], [0, -.52]]],
  ];
  const rings = P.map(([z, h]) => [...h.map(([x, y]) => [x, y, z]), ...h.slice(0, 7).reverse().map(([x, y]) => [-x, y, z])]);
  const fuseMats = [greyM, underM, radomeM, glareM, darkM];
  const fuse = mesh(loft(rings, (r, k) => {
    const h = k < 7 ? k : 13 - k, z = P[r][0];
    if (z < -7.0) return 2;                    // radome
    if (z < -5.75 && h <= 1) return 3;         // anti-glare panel ahead of the windscreen
    return h >= 5 ? 1 : 0;
  }, 4), fuseMats, g, 'fuselage');
  // cockpit coaming lip (top of the side walls, x 0.52..0.62 at the sill) is part of the loft; a dark rim edge on it:
  for (const s of [-1, 1]) mesh(boxG(0.1, 0.03, 2.7, s * 0.57, 0.735, -4.35), darkM, g, 'coaming');
  // FSD number on the nose, NAVY on the aft fuselage, the ejection seat warning triangle under the canopy rail
  const noseNo = texOf('fsdNose' + fsdNo, 128, 128, (x, w, h) => stencil(x, String(fsdNo), w / 2, h / 2 + 4, 110));
  const navyT = texOf('fsdNavy', 256, 64, (x, w, h) => stencil(x, 'NAVY', w / 2, h / 2 + 2, 54));
  const ejT = texOf('ejectTri', 64, 64, (x, w, h) => { x.fillStyle = '#d42a1c'; x.beginPath(); x.moveTo(w / 2, 3); x.lineTo(w - 3, h - 6); x.lineTo(3, h - 6); x.closePath(); x.fill(); x.fillStyle = '#f2f0e8'; x.beginPath(); x.moveTo(w / 2, 18); x.lineTo(w - 15, h - 13); x.lineTo(15, h - 13); x.closePath(); x.fill(); stencil(x, 'EJECT', w / 2, h - 19, 10, '#111'); });
  for (const s of [-1, 1]) {
    const d = decalMesh(noseNo, 0.42, 0.42, g, 'sideNumber'); d.position.set(s * 0.6, -0.05, -6.35); d.rotation.y = s * (Math.PI / 2 - 0.16);
    const n = decalMesh(navyT, 0.95, 0.24, g, 'navyTitle'); n.position.set(s * 1.17, 0.0, 4.4); n.rotation.y = s * Math.PI / 2;
    const e = decalMesh(ejT, 0.16, 0.16, g, 'ejectWarning'); e.position.set(s * 0.73, 0.5, -3.3); e.rotation.y = s * (Math.PI / 2 - 0.05);
  }
  // gun port
  mesh(new THREE.BoxGeometry(0.07, 0.03, 0.22).rotateX(0.27).translate(0, 0.335, -7.0), blackM, g, 'gunPort');

  // ---- intakes (D boxes under the LEX; dark face), LEX strakes
  for (const s of [-1, 1]) {
    const sh = new THREE.Shape([[.68, -.05], [1.2, -.05], [1.32, -.2], [1.34, -.5], [1.28, -.8], [1.1, -.95], [.68, -.95]].map(([x, y]) => new THREE.Vector2(s * x, y)));
    const ig = new THREE.ExtrudeGeometry(sh, { depth: 5.2, bevelEnabled: false }), p = ig.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (z < 0.1) p.setZ(i, -2.0 + (-0.05 - y) * 0.22);                                 // raked mouth, lower lip aft
      else p.setXYZ(i, s * (0.68 + (Math.abs(x) - 0.68) * 0.45), -0.45 + (y + 0.45) * 0.75, 3.2);   // fair into the body
    }
    ig.computeVertexNormals(); mesh(ig, [blackM, greyM], g, 'intake' + (s < 0 ? 'L' : 'R'));
    mesh(twoTone(slab([[.55, -4.95, .04], [.78, -4.1, .05], [1.02, -3.25, .06], [1.3, -2.4, .07], [1.55, -1.72, .08], [1.78, -1.24, .08], [1.4, -0.7, .1], [.6, -0.7, .12]],
      (a, b, w) => [s * a, 0.1 + w, b])), pair2, g, 'lex');
    // full-colour national insignia on the intake side (1980: the low-visibility grey insignia is still to come)
    const rd = decalMesh(texOf('starBar', 256, 128, starBar), 1.1, 0.55, g, 'insignia'); rd.position.set(s * 1.343, -0.48, -0.95); rd.rotation.y = s * Math.PI / 2;
  }

  // ---- wings: fixed box + leading-edge flap (x 1.6..tip), trailing-edge flap (1.2..3.6), aileron (3.6..5.5)
  const LE = x => -1.6 + (x - 1.1) * 0.52, TE = x => 2.4 + (x - 1.1) * 0.01, C = x => TE(x) - LE(x);
  const TM = x => Math.max(0.1, 0.25 - (x - 1.1) / 4.6 * 0.15), HL = x => LE(x) + 0.18 * C(x), HT = x => TE(x) - 0.22 * C(x);
  const surf = {};
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R', map = (a, b, w) => [s * a, 0.05 + w, b], wv = (x, z, f) => [x, z, TM(x) * f, 0.42];
    mesh(twoTone(slab([wv(0.8, LE(0.8), .3), wv(1.6, LE(1.6), .3), wv(1.6, HL(1.6), .85), wv(5.71, HL(5.71), .85), wv(5.71, TE(5.71), .12), wv(5.5, TE(5.5), .12),
      wv(5.5, HT(5.5), .55), wv(3.6, HT(3.6), .55), wv(1.2, HT(1.2), .55), wv(1.2, TE(1.2), .12), wv(0.8, TE(0.8), .12)], map)), pair2, g, 'wing' + S);
    const hp = (x, z) => V(s * x, 0.05, z), pair = (a, b) => s > 0 ? [a, b] : [b, a];   // hinge axis always points +x
    surf['lef' + S] = hinged(g, twoTone(slab([wv(1.6, LE(1.6), .3), wv(5.71, LE(5.71), .3), wv(5.71, HL(5.71), .85), wv(1.6, HL(1.6), .85)], map)), pair2, ...pair(hp(1.6, HL(1.6)), hp(5.71, HL(5.71))), 'lef' + S);
    surf['flap' + S] = hinged(g, twoTone(slab([wv(1.2, HT(1.2), .55), wv(3.6, HT(3.6), .55), wv(3.6, TE(3.6), .12), wv(1.2, TE(1.2), .12)], map)), pair2, ...pair(hp(1.2, HT(1.2)), hp(3.6, HT(3.6))), 'flap' + S);
    surf['ail' + S] = hinged(g, twoTone(slab([wv(3.6, HT(3.6), .55), wv(5.5, HT(5.5), .55), wv(5.5, TE(5.5), .12), wv(3.6, TE(3.6), .12)], map)), pair2, ...pair(hp(3.6, HT(3.6)), hp(5.5, HT(5.5))), 'ail' + S);
    // wingtip launcher rail
    mesh(boxG(0.07, 0.1, 2.5, s * 5.79, 0.03, 1.25), metalM, g, 'rail' + S);
    // pylons for the bombs
    for (const x of [2.6, 3.9]) mesh(boxG(0.07, 0.24, 1.5, s * x, -0.1, 0.3), greyM, g, 'pylon');
  }

  // ---- vertical tails (canted 20 deg out), rudders on the lower aft part; team band at the tip
  // fin span 2.5 m along the cant: Jane's gives 9.68 m2 for both fins, i.e. 4.84 m2 each over a ~2.85 m root and ~1.1 m
  // tip chord = ~2.45 m; the first model had 2.93 m (overall height 5.45 m against the real 4.66 m)
  const CANT = 20 * Math.PI / 180, FS = 2.5, FTE = v => 7.2 + v * 0.188, FT = v => 0.16 - v * 0.03;
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R';
    const map = (z, v, w) => [s * (1.05 + w * Math.cos(CANT) + v * Math.sin(CANT)), 0.65 - w * Math.sin(CANT) + v * Math.cos(CANT), z];
    const fv = (z, v, f) => [z, v, FT(v) * f], rz = v => FTE(v) - 0.55;
    mesh(slab([fv(4.4, -0.15, .3), fv(4.6 + 2.05 * (FS - 0.3) / FS, FS - 0.3, .3), fv(FTE(FS - 0.3) + 0.04, FS - 0.3, .15), fv(FTE(1.6), 1.6, .15), fv(rz(1.6), 1.6, .6), fv(rz(0.15), 0.15, .6), fv(FTE(0.15), 0.15, .15), fv(7.25, -0.15, .15)], map), greyM, g, 'fin' + S);
    mesh(slab([fv(4.6 + 2.05 * (FS - 0.3) / FS, FS - 0.3, .32), fv(6.65, FS, .32), fv(7.75, FS, .18), fv(FTE(FS - 0.3) + 0.04, FS - 0.3, .18)], map), teamM, g, 'finTip' + S);
    const a = V(...map(rz(0.15), 0.15, 0)), b = V(...map(rz(1.6), 1.6, 0));
    surf['rud' + S] = hinged(g, slab([fv(rz(0.15), 0.15, .6), fv(FTE(0.15), 0.15, .15), fv(FTE(1.6), 1.6, .15), fv(rz(1.6), 1.6, .6)], map), greyM, a, b, 'rudder' + S);
    surf['finTip' + S] = V(...map(7.6, FS, 0));
    // outer face of the fin: the FSD number large, the BuNo low on the fixed part (ahead of the rudder hinge)
    const onFin = (tex, w, h, z, v, name) => { const piv = new THREE.Group(); piv.position.set(...map(z, v, FT(v) * 0.5 + 0.004)); piv.rotation.z = -s * CANT; g.add(piv); const d = decalMesh(tex, w, h, piv, name); d.rotation.y = s * Math.PI / 2; return d; };
    onFin(texOf('fsdFin' + fsdNo, 128, 128, (x, w, h) => stencil(x, String(fsdNo), w / 2, h / 2 + 4, 116)), 0.7, 0.7, 6.52, 1.6, 'finNumber');
    onFin(texOf('buno' + buno, 256, 48, (x, w, h) => stencil(x, String(buno), w / 2, h / 2 + 2, 40)), 0.8, 0.15, 5.95, 0.5, 'bunoFin');
    onFin(texOf('fsdNavyFin', 256, 48, (x, w, h) => stencil(x, 'NAVY', w / 2, h / 2 + 2, 40)), 0.6, 0.11, 5.95, 0.72, 'navyFin');
  }
  // national insignia: top of the left wing, underside of the right wing (1980 Navy practice)
  { const t = texOf('starBar', 256, 128, starBar);
    const up = decalMesh(t, 1.5, 0.75, g, 'wingStarTop'); up.position.set(-3.3, 0.135, 0.95); up.rotation.x = -Math.PI / 2;
    const dn = decalMesh(t, 1.16, 0.58, g, 'wingStarLow'); dn.position.set(3.25, -0.012, 0.95); dn.rotation.set(Math.PI / 2, 0, Math.PI); }

  // ---- all-moving stabilators: pivot at z 7.0, 2 deg anhedral
  const AN = Math.tan(2 * Math.PI / 180);
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R', map = (x, z, w) => [s * x, -0.05 - (x - 1.2) * AN + w, z];
    const geo = slab([[1.2, 6.0, .12], [3.3, 7.7, .05], [3.3, 8.45, .03], [1.2, 8.5, .05]], map);
    const p0 = V(s * 1.2, -0.05, 7.0), p1 = V(s * 3.3, -0.05 - 2.1 * AN, 7.0);
    surf['stab' + S] = hinged(g, twoTone(geo), pair2, ...(s > 0 ? [p0, p1] : [p1, p0]), 'stab' + S);
  }

  // ---- spine speedbrake (hinged at its front)
  mesh(boxG(0.62, 0.02, 1.66, 0, 0.835, 4.35), blackM, g, 'brakeWell');
  const brake = hinged(g, slab([[-0.32, 3.5, .04], [0.32, 3.5, .04], [0.3, 5.2, .03], [-0.3, 5.2, .03]], (a, b, w) => [a, 0.865 + w, b]), greyM, V(-0.3, 0.865, 3.5), V(0.3, 0.865, 3.5), 'speedbrake');

  // ---- windscreen (fixed) and canopy (hinged at the rear, opens nose-up)
  const arch = (z, top, hw, base, n = 9) => Array.from({ length: n }, (_, i) => {
    const f = -Math.PI / 2 + Math.PI * i / (n - 1), sn = Math.sin(f), cs = Math.cos(f);
    return [hw * Math.sign(sn) * Math.abs(sn) ** 0.7, base + (top - base) * Math.abs(cs) ** 0.6, z];
  });
  const ws = new THREE.Group(); ws.name = 'windscreen'; g.add(ws);
  const wsR = [arch(-5.75, 0.80, 0.5, 0.66), arch(-5.45, 1.08, 0.53, 0.71), arch(-5.1, 1.32, 0.55, 0.72)];
  mesh(loft(wsR), glassM, ws, 'windscreenGlass');
  const tube = (pts, r, mat, parent, name) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V(...p))), 12, r, 4), mat, parent, name);
  tube(arch(-5.1, 1.33, 0.56, 0.72), 0.035, frameM, ws, 'windscreenBow'); tube(arch(-5.74, 0.81, 0.51, 0.66), 0.025, frameM, ws, 'windscreenBase');
  for (const s of [-1, 1]) tube([[s * 0.5, 0.67, -5.74], [s * 0.53, 0.71, -5.45], [s * 0.56, 0.72, -5.1]], 0.025, frameM, ws, 'windscreenSide');

  const cg = new THREE.Group(); cg.name = 'canopy'; cg.position.set(...JET.CANOPY_HINGE); g.add(cg);
  const cv = new THREE.Group(); cv.position.set(...JET.CANOPY_HINGE).negate(); cg.add(cv);   // children in aircraft coords
  const cr = [[-5.1, 1.32, .55, .72], [-4.6, 1.42, .56, .72], [-4.0, 1.45, .56, .72], [-3.4, 1.41, .55, .72], [-3.0, 1.31, .53, .73], [-2.7, 1.16, .45, .8], [-2.4, 0.98, .3, .88]];
  mesh(loft(cr.map(c => arch(...c))), glassM, cv, 'canopyGlass');
  tube(arch(-5.08, 1.33, 0.565, 0.72), 0.03, frameM, cv, 'canopyBow'); tube(arch(-2.42, 0.99, 0.31, 0.88), 0.04, frameM, cv, 'canopyAft');
  for (const s of [-1, 1]) tube(cr.map(([z, , hw, b]) => [s * (hw + 0.01), b + 0.01, z]), 0.035, frameM, cv, 'canopySill');
  mesh(boxG(0.05, 0.12, 0.05, 0, 0.9, -2.45), frameM, cv, 'canopyHinge');

  // ---- engines: shroud, variable petals (exit radius animated), dark liner, burner face (heat glow), afterburner flame
  const eng = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.name = 'engine' + (s < 0 ? 'L' : 'R'); e.position.set(s * 0.62, -0.25, 0); g.add(e);
    mesh(cylZ(0.53, 0.48, 0.55, 12, true), metalM, e, 'shroud').position.z = 7.13;
    const petGeo = cylZ(0.48, 0.48, 0.5, 12, true), pp = petGeo.attributes.position, base = [];
    for (let i = 0; i < pp.count; i++) if (pp.getZ(i) > 0) base.push(i, pp.getX(i) / 0.48, pp.getY(i) / 0.48);
    const petals = mesh(petGeo, M(0x3c3f43, { shininess: 60, side: THREE.DoubleSide }), e, 'petals'); petals.position.z = 7.65;
    mesh(cylZ(0.43, 0.43, 0.9, 10, true), M(0x111213, { side: THREE.BackSide }), e, 'liner').position.z = 7.4;
    const faceM = B(0x000000), face = mesh(new THREE.CircleGeometry(0.44, 12), faceM, e, 'burnerFace'); face.position.z = 7.0;
    mesh(cylZ(0.15, 0.0, 0.3, 8), M(0x1a1a1a), e, 'tailCone').position.z = 7.15;
    // afterburner: additive, unlit; outer orange cone, blue-white core, shock diamonds
    const add = c => B(c, { transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const cone = new THREE.CylinderGeometry(0, 1, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    const fl = new THREE.Group(); fl.name = 'afterburner'; fl.position.z = 7.85; e.add(fl);
    const outer = mesh(cone, add(0xff8a3a), fl, 'abOuter'), core = mesh(cone, add(0x9cc2ff), fl, 'abCore');
    const dm = add(0xd8e8ff), diamonds = [];
    for (let k = 0; k < 4; k++) diamonds.push(mesh(new THREE.SphereGeometry(1, 8, 4), dm, fl, 'shockDiamond'));
    eng.push({ petals, pp, base, faceM, fl, outer, core, dm, diamonds, ph: s * 1.7 });
  }

  // ---- landing gear
  const wheel = (r, w, parent, x, y, z) => {
    const wg = new THREE.Group(); wg.position.set(x, y, z); parent.add(wg);
    mesh(new THREE.CylinderGeometry(r, r, w, 12).rotateZ(Math.PI / 2), tyreM, wg, 'tyre');
    mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 8).rotateZ(Math.PI / 2), gearM, wg, 'hub'); return wg;
  };
  // nose: pivot -> steer -> oleo slider -> twin wheels + launch bar
  const NP = V(0, -0.6, -4.6), nose = new THREE.Group(); nose.name = 'noseGear'; nose.position.copy(NP); g.add(nose);
  const steer = new THREE.Group(); nose.add(steer);
  rod(V(0, 0.02, 0), V(0, -0.75, 0), 0.13, gearM, steer, 'noseStrut');
  const nSl = new THREE.Group(); nSl.name = 'noseOleo'; steer.add(nSl);
  const nwy = JET.GEAR.nose[1] + JET.WHEEL_R.nose - NP.y;   // wheel centre in the gear frame
  rod(V(0, -0.5, 0), V(0, nwy, 0), 0.09, M(0xeef0f2, { shininess: 80 }), nSl, 'noseSlider');
  mesh(boxG(0.36, 0.08, 0.08, 0, nwy, 0), gearM, nSl, 'noseAxle');
  wheel(0.28, 0.16, nSl, -0.17, nwy, 0); wheel(0.28, 0.16, nSl, 0.17, nwy, 0);
  const launchBar = rod(V(0, nwy + 0.25, -0.12), V(0, -2.05 - NP.y + 0.04, -0.85), 0.07, M(0x9aa0a6), nSl, 'launchBar');
  mesh(boxG(0.12, 0.12, 0.05, 0, -0.45, -0.1), M(0xfff6d0, { emissive: 0x444030 }), steer, 'taxiLight');
  // mains: strut from the intake side, wheel bottom at the contract point; retract by slerping toward a forward/inward pose
  const mains = [];
  for (const s of [-1, 1]) {
    const P0 = V(s * 1.3, -0.5, 0.45), W = V(s * 1.6, JET.GEAR.mainR[1] + JET.WHEEL_R.main, 0.6), A = V(s * 1.42, W.y, 0.6);
    const mg = new THREE.Group(); mg.name = 'mainGear' + (s < 0 ? 'L' : 'R'); mg.position.copy(P0); g.add(mg);
    const u = V().subVectors(A, P0).normalize();
    rod(V(), u.clone().multiplyScalar(0.75), 0.15, gearM, mg, 'mainStrut');
    rod(V(s * -0.35, -0.25, 0.4), u.clone().multiplyScalar(0.55), 0.06, gearM, mg, 'mainBrace');
    const sl = new THREE.Group(); mg.add(sl);
    const a = V().subVectors(A, P0), w = V().subVectors(W, P0);
    rod(u.clone().multiplyScalar(0.55), a, 0.1, M(0xeef0f2, { shininess: 80 }), sl, 'mainOleo');
    mesh(boxG(0.22, 0.07, 0.07, (a.x + w.x) / 2, a.y, a.z), gearM, sl, 'mainAxle');
    wheel(0.40, 0.26, sl, w.x, w.y, w.z);
    // stowed: strut lies forward/inward along the intake, axle kept athwartships so the wheel stands upright inside the duct fairing
    const frame = (d, ax) => { const a = ax.clone().addScaledVector(d, -ax.dot(d)).normalize(); return new THREE.Matrix4().makeBasis(d, a, V().crossVectors(d, a)); };
    const t = V(-0.5 * s, 0.12, -1).normalize(), qUp = new THREE.Quaternion().setFromRotationMatrix(frame(t, V(s, 0, 0)).multiply(frame(u, V(s, 0, 0)).transpose()));
    mains.push({ mg, sl, u, k: 1 / -u.y, qUp });
  }
  const q0 = new THREE.Quaternion();

  // ---- tailhook
  const hook = new THREE.Group(); hook.name = 'tailhook'; hook.position.set(...HOOK_PIVOT); g.add(hook);
  mesh(boxG(0.08, 0.08, HOOK_LEN - 0.15, 0, 0, (HOOK_LEN - 0.15) / 2), M(0x60666b), hook, 'hookArm');
  mesh(boxG(0.1, 0.12, 0.22, 0, -0.02, HOOK_LEN - 0.1), M(0xe8e8e8), hook, 'hookShoe');
  mesh(boxG(0.09, 0.09, 0.09, 0, 0, 0), darkM, hook);

  // ---- lights: position (red L / green R on the LEX tips), white tail lights + strobes at the fin tips, red beacon on the spine, formation strips
  const lightG = new THREE.Group(); lightG.name = 'lights'; g.add(lightG);
  const bulb = (c, r, p, name) => { const m = mesh(new THREE.SphereGeometry(r, 6, 4), B(c), lightG, name); m.position.copy(p); return m; };
  bulb(0xff2a1a, 0.05, V(-1.72, 0.16, -1.32), 'navRed'); bulb(0x2aff5a, 0.05, V(1.72, 0.16, -1.32), 'navGreen');
  bulb(0xffffff, 0.045, V(0, -0.1, 7.5), 'tailLight');
  const strobes = [bulb(0xffffff, 0.07, surf.finTipL.clone().add(V(-0.03, 0.05, 0)), 'strobeL'), bulb(0xffffff, 0.07, surf.finTipR.clone().add(V(0.03, 0.05, 0)), 'strobeR')];
  const beacon = bulb(0xff3020, 0.07, V(0, 0.93, 1.2), 'beacon'), beacon2 = bulb(0xff3020, 0.07, V(0, -0.9, -1.0), 'beaconLow');
  const formM = B(0x8fd060);
  for (const s of [-1, 1]) {
    mesh(new THREE.BoxGeometry(0.02, 0.05, 0.6).rotateY(-s * 0.12).translate(s * 0.605, 0.2, -6.1), formM, lightG, 'formation');
    mesh(boxG(0.02, 0.05, 0.6, s * 1.17, 0.25, 3.0), formM, lightG, 'formation');
    const t = mesh(boxG(0.02, 0.05, 0.6, 0, 0, 0), formM, lightG, 'formation'); t.position.set(...[s * (1.05 + (FS - 0.15) * Math.sin(CANT) + 0.03), 0.65 + (FS - 0.15) * Math.cos(CANT), 6.85]); t.rotation.z = -s * CANT;
  }

  // ---- stores: wingtip AIM-9s and four Mk-82s
  const aimG = merge([cylZ(0.065, 0.065, 2.85, 8), new THREE.SphereGeometry(0.065, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0, -1.425),
    ...[0, 1].flatMap(k => [boxG(0.36, 0.006, 0.16, 0, 0, -1.0), boxG(0.62, 0.006, 0.32, 0, 0, 1.2)].map(b => b.rotateZ(Math.PI / 4 + k * Math.PI / 2)))]);
  const aimM = M(0xd2d4d0), seekM = M(0x2b3a44, { shininess: 90 });
  const aam = JET.STATIONS.aam.map((p, i) => {
    const m = mesh(aimG, aimM, g, 'aim9' + (i ? 'R' : 'L')); m.position.set(...p);
    mesh(new THREE.SphereGeometry(0.067, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0, -1.42), seekM, m);
    mesh(cylZ(0.067, 0.067, 0.12, 8), M(0xc8a040), m).position.z = -0.6; return m;
  });
  const bombGeo = merge([new THREE.CapsuleGeometry(0.14, 1.5, 3, 8).rotateX(Math.PI / 2).translate(0, 0, -0.2), cylZ(0.14, 0.05, 0.45, 8).translate(0, 0, 0.84),
    boxG(0.5, 0.01, 0.3, 0, 0, 0.92).rotateZ(Math.PI / 4).translate(0, 0, 0), boxG(0.5, 0.01, 0.3, 0, 0, 0.92).rotateZ(-Math.PI / 4)]);
  const bombM = M(0x2d3326), bandM = M(0xc8b040);
  const bombs = JET.STATIONS.bomb.map((p, i) => {
    const m = mesh(bombGeo, bombM, g, 'mk82_' + i); m.position.set(...p);
    mesh(cylZ(0.142, 0.142, 0.06, 8), bandM, m).position.z = -0.9; return m;
  });

  // ---- animation
  const def = (v, d) => (v === undefined || v === null ? d : v);
  const ZERO2 = [0, 0], ONE2 = [1, 1], WOW0 = [0, 0, 0];
  let hookA = HOOK_UP;
  const shell = [cg, ws];
  function animate(s = {}, dt = 0, time = 0, inside = false) {
    const stab = def(s.stab, 0), sd = def(s.stabDiff, 0), ail = def(s.ail, 0), rud = def(s.rud, 0);
    surf.stabR.rotation.x = -(stab + sd); surf.stabL.rotation.x = -(stab - sd);   // + = trailing edge up
    surf.ailR.rotation.x = -ail; surf.ailL.rotation.x = ail;
    surf.rudR.rotation.x = rud; surf.rudL.rotation.x = rud;                       // + = trailing edge to +x
    const fp = def(s.flap, 0) * 0.78, le = -def(s.lef, 0) * 0.6;
    surf.flapR.rotation.x = surf.flapL.rotation.x = fp; surf.lefR.rotation.x = surf.lefL.rotation.x = le;
    brake.rotation.x = -def(s.brake, 0) * 1.05;
    cg.rotation.x = def(s.canopy, 0) * JET.CANOPY_OPEN;
    // gear
    const gd = THREE.MathUtils.clamp(def(s.gear, 1), 0, 1), wow = s.wow || WOW0, up = 1 - gd;
    nose.rotation.x = up * 1.7; steer.rotation.y = -def(s.steer, 0) * gd;
    nSl.position.y = Math.min(0.3, wow[0] || 0);
    launchBar.visible = !!s.launchBar && gd > 0.98;
    for (let i = 0; i < 2; i++) {
      const m = mains[i], c = Math.min(0.3, wow[i + 1] || 0) * m.k;
      m.sl.position.set(-m.u.x * c, -m.u.y * c, -m.u.z * c);
      m.mg.quaternion.slerpQuaternions(q0, m.qUp, THREE.MathUtils.smoothstep(up, 0, 1));
    }
    hookA = HOOK_UP + (HOOK_DOWN - HOOK_UP) * THREE.MathUtils.clamp(def(s.hook, 0), 0, 1); hook.rotation.x = hookA;
    // engines
    const n = s.n || ZERO2, nz = s.nozzle || ONE2, ab = s.ab || ZERO2;
    for (let i = 0; i < 2; i++) {
      const e = eng[i], k = 0.36 + 0.12 * THREE.MathUtils.clamp(nz[i], 0, 1), pa = e.pp.array;
      for (let j = 0; j < e.base.length; j += 3) { pa[e.base[j] * 3] = e.base[j + 1] * k; pa[e.base[j] * 3 + 1] = e.base[j + 2] * k; }
      e.pp.needsUpdate = true;
      const a = THREE.MathUtils.clamp(ab[i], 0, 1), heat = Math.max(0, (n[i] - 0.7) / 0.35) ** 2 * 0.35 + a * 0.6;
      e.faceM.color.setRGB(heat * 1.0, heat * 0.45, heat * 0.15 + a * 0.25);
      e.fl.visible = a > 0.01;
      if (a > 0.01) {
        const fk = 1 + 0.07 * Math.sin(time * 41 + e.ph) + 0.05 * Math.sin(time * 67 + e.ph * 3), L = (0.6 + 4.4 * a) * fk, br = inside ? 0.5 : 1;
        e.outer.scale.set(k * 1.02, k * 1.02, L); e.core.scale.set(k * 0.6, k * 0.6, L * 0.62);
        e.outer.material.opacity = (0.16 + 0.22 * a) * br; e.core.material.opacity = (0.35 + 0.35 * a) * br; e.dm.opacity = 0.85 * a * br;
        for (let d = 0; d < 4; d++) {
          const z = (0.45 + 0.75 * d) * (0.75 + 0.25 * a) * fk, m = e.diamonds[d];
          m.visible = z < L * 0.7; m.position.z = z; const r = k * (0.62 - 0.08 * d); m.scale.set(r * 0.5, r * 0.5, 0.28 * (1 - 0.15 * d));
        }
      }
    }
    // lights
    const lit = !!s.lights; lightG.visible = lit;
    if (lit) { const st = time % 1.1 < 0.07; strobes[0].visible = strobes[1].visible = st; beacon.visible = beacon2.visible = (time + 0.55) % 1.1 < 0.12; }
    // stores
    const st = s.stores; aam[0].visible = st ? !!st.aam?.[0] : true; aam[1].visible = st ? !!st.aam?.[1] : true;
    for (let i = 0; i < 4; i++) bombs[i].visible = st ? !!st.bomb?.[i] : true;
    for (const o of shell) o.visible = !inside;
  }
  function hookTip(out = new THREE.Vector3()) { return out.set(HOOK_PIVOT[0], HOOK_PIVOT[1] - HOOK_LEN * Math.sin(hookA), HOOK_PIVOT[2] + HOOK_LEN * Math.cos(hookA)); }
  animate({});
  return { group: g, shell, hookTip, animate, parts: { surf, brake, canopy: cg, windscreen: ws, nose, mains, hook, eng, aam, bombs, lights: lightG, fuselage: fuse } };
}
