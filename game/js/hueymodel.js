// UH-1H "Huey": exterior model with every moving part (teetering main rotor with stabilizer bar and swashplate, tail
// rotor, synchronized elevator, door gun + gunner, rocket pods, lights). Low-poly, flat-shaded, real-world metres,
// built like jetmodel.js (lofts, plates, merged statics).
// Local frame: +x right, +y up, nose along -z, origin at the CG; ground under the skids at y = -1.84.
// API: buildHueyMesh() -> { group, shell, animate(S, dt, time, inside) }, S = main.js heliLook().
import * as THREE from 'three';

const D2R = Math.PI / 180, MAST_TILT = 5 * D2R;
export const HUEY = {
  GROUND: -1.84, HUB: [0, 2.0, -0.12], MAST_TILT, R: 7.32, CHORD: 0.53, OMEGA: 33.93,   // 324 rpm
  TR_HUB: [-0.39, 2.03, 8.70], TR_R: 1.295, TR_GEAR: 5.123,
  PODS: [[-1.7, -0.4, -0.6], [1.7, -0.4, -0.6]], GUN: [-1.22, -0.15, 0.25],              // M60 pintle (above the pod line)
};

const M = (c, o = {}) => new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 14, ...o });
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
// triangle soup -> geometry, flipped if the closed mesh has negative signed volume (mirrored builds never inside-out)
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
// skin through rings (open polylines of equal length, top centre -> right side -> keel -> left side -> top centre,
// rings running nose to tail); matFn(r, k) -> material index, or -1 for a hole; optional fans over the end rings
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
// merge simple geometries (position + normal) into one
function merge(geos) {
  const pos = [], nor = [];
  for (let g of geos) { g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals(); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g;
}
const cylZ = (r0, r1, len, seg = 10, open = false) => new THREE.CylinderGeometry(r1, r0, len, seg, 1, open).rotateX(Math.PI / 2);   // r0 at -z, r1 at +z
const cylX = (r, len, seg = 10) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
const boxG = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const mesh = (geo, mat, parent, name) => { const m = new THREE.Mesh(geo, mat); if (name) m.name = name; parent && parent.add(m); return m; };
const group = (parent, name, x = 0, y = 0, z = 0) => { const o = new THREE.Group(); o.name = name; o.position.set(x, y, z); parent.add(o); return o; };
const _m4 = new THREE.Matrix4(), _q0 = new THREE.Quaternion(), ONE = V(1, 1, 1), ZAX = V(0, 0, 1);
// a box (seg 0) or cylinder of width w between two points (struts, tubes, bars)
function rodG(a, b, w, seg = 0) {
  a = AV(a); b = AV(b); const d = V().subVectors(b, a), L = d.length();
  const g = seg ? new THREE.CylinderGeometry(w / 2, w / 2, L, seg).rotateX(Math.PI / 2) : new THREE.BoxGeometry(w, w, L);
  return g.applyMatrix4(_m4.compose(V().addVectors(a, b).multiplyScalar(0.5), _q0.setFromUnitVectors(ZAX, d.normalize()), ONE));
}
const tubeG = (pts, r, seg = 16, rad = 6) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(AV)), seg, r, rad);
// static parts collect here per material and become one mesh each
function bucket() {
  const m = new Map();
  return { add(geo, mat) { (m.get(mat) || m.set(mat, []).get(mat)).push(geo); return geo; },
    flush(parent, name) { const out = []; for (const [mat, geos] of m) out.push(mesh(merge(geos), mat, parent, name)); m.clear(); return out; } };
}

// ------------------------------------------------------------------------------------------- cross sections
// rounded rectangle half profile, 14 points top centre -> keel: roof flat, upper corner arc (radius rt), three side
// points at fixed heights `lv` (window / door lines; clamped onto the straight side), lower corner arc (rb), belly flat.
// Quads (qh): 0 roof, 1-4 upper arc, 5-8 side (5 above lv0, 8 below lv2), 9-11 lower arc, 12 belly.
const LV = [-0.45, -0.7, -0.95];
function rr(z, top, bot, w, rt, rb, lv = LV) {
  rb = Math.min(rb, w, (top - bot) / 2); rt = Math.min(rt, w, top - bot - rb);
  const p = [[0, top], [w - rt, top]], yT = top - rt, yB = bot + rb;
  for (const a of [0.3927, 0.7854, 1.1781]) p.push([w - rt + rt * Math.sin(a), yT + rt * Math.cos(a)]);
  p.push([w, yT]);
  for (const y of lv) p.push([w, clamp(y, yB, yT)]);
  p.push([w, yB]);
  for (const a of [1.0472, 0.5236]) p.push([w - rb + rb * Math.sin(a), yB - rb * Math.cos(a)]);
  p.push([w - rb, bot], [0, bot]);
  return p.map(([x, y]) => [x, y, z]);
}
const full = h => [...h, ...h.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z])];   // 27 points
const QH = k => (k < 13 ? k : 25 - k);

// fuselage stations [z, top, bot, half width, top corner r, bottom corner r]: round nose, cabin box, boom
const CAB = [0.45, -1.15, 1.2, 0.32, 0.12];
const FUS = [
  [-3.80, -0.42, -0.50, 0.03, 0.03, 0.03], [-3.76, -0.27, -0.68, 0.44, 0.26, 0.2], [-3.66, -0.16, -0.86, 0.70, 0.40, 0.34],
  [-3.50, -0.03, -0.98, 0.89, 0.44, 0.32], [-3.25, 0.15, -1.07, 1.04, 0.44, 0.26], [-2.95, 0.31, -1.12, 1.12, 0.40, 0.2],
  [-2.65, 0.41, -1.15, 1.17, 0.36, 0.14], [-2.35, 0.45, -1.15, 1.19, 0.34, 0.12],
  ...[-2.0, -1.6, -1.05, -0.95, 0, 0.95, 1.9, 2.3, 2.9].map(z => [z, ...CAB]),
  [3.5, 0.47, -0.70, 0.92, 0.30, 0.30], [4.2, 0.53, -0.27, 0.50, 0.22, 0.22], [5.0, 0.55, -0.17, 0.43, 0.2, 0.2],
  [6.5, 0.58, 0.02, 0.32, 0.15, 0.15], [8.0, 0.60, 0.18, 0.22, 0.11, 0.11], [9.0, 0.62, 0.28, 0.16, 0.08, 0.08],
];
const FZ = FUS.map(f => f[0]), FI = z => FZ.indexOf(z);
// skin material by panel: 0 olive, 1 clear glass, 2 green roof glass, 3 anti-glare black, -1 open doorway
function skinMat(z0, z1, qh) {
  if (z0 >= -3.76 && z1 <= -3.66 && qh <= 4) return 3;                  // anti-glare panel on the nose
  if (z0 >= -3.66 && z1 <= -2.35 && qh <= 5) return 1;                   // windscreen (two panes, centre post), wrapping down the sides
  if (z0 >= -3.66 && z1 <= -2.95 && qh >= 9) return 1;                   // chin bubbles in front of the pedals
  if (z0 >= -2.35 && z1 <= -1.6 && qh <= 2) return 2;                    // green "greenhouse" over the pilots
  if (z0 >= -2.35 && z1 <= -1.05 && (qh === 4 || qh === 5)) return 1;    // pilot / copilot door windows
  if (z0 >= -2.35 && z1 <= -1.6 && qh === 7) return 1;                   // lower door windows
  if (z0 >= -0.95 && z1 <= 0.95 && qh >= 4 && qh <= 8) return -1;        // cargo doorways, doors slid back
  return 0;
}

// ------------------------------------------------------------------------------------------- "U.S. ARMY" decal
let armyTex = null;
function armyDecal() {
  if (armyTex) return armyTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 40; const x = c.getContext('2d');
  x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#121310'; x.fillText('U.S. ARMY', 128, 22);   // 1980: subdued black on olive drab
  armyTex = new THREE.CanvasTexture(c); armyTex.colorSpace = THREE.SRGBColorSpace; return armyTex;
}
// the tail number on the fin: the Army serial (fiscal year - number), black; 72-21509 is a UH-1H serial block of the
// period (the airframe itself is fictional)
let serialTex = null;
function serialDecal() {
  if (serialTex) return serialTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.font = 'bold 50px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#121310'; x.fillText('72-21509', 128, 34);
  serialTex = new THREE.CanvasTexture(c); serialTex.colorSpace = THREE.SRGBColorSpace; return serialTex;
}

// a seated crewman facing -z, origin on the seat cushion; put(geo, mat) gets geometry in that frame
function crewman(put, mats, arms = true) {
  const { suit, vest, helmet, skin, visor } = mats;
  put(boxG(0.36, 0.14, 0.42, 0, 0.06, -0.17), suit);                                         // thighs
  put(boxG(0.34, 0.36, 0.13, 0, -0.14, -0.42), suit);                                       // shins
  put(boxG(0.36, 0.09, 0.24, 0, -0.33, -0.5), visor);                                       // boots
  put(boxG(0.38, 0.5, 0.24, 0, 0.36, 0.02).rotateX(-0.12), suit);                           // torso
  put(boxG(0.41, 0.36, 0.27, 0, 0.4, 0.0).rotateX(-0.12), vest);                            // chest armour
  put(new THREE.SphereGeometry(0.095, 6, 4).translate(0, 0.72, -0.04), skin);              // face
  put(new THREE.SphereGeometry(0.135, 8, 5, 0, Math.PI * 2, 0, 1.9).translate(0, 0.75, 0.0), helmet);
  put(boxG(0.2, 0.06, 0.04, 0, 0.73, -0.13), visor);
  if (arms) for (const s of [-1, 1]) {
    put(rodG([s * 0.22, 0.55, 0.0], [s * 0.2, 0.36, -0.2], 0.1), suit);
    put(rodG([s * 0.2, 0.36, -0.2], [s * 0.1, 0.43, -0.42], 0.085), suit);
  }
}

// QA (ngc/qa-units): the same crewman for the cockpit's copilot (the exterior shows two pilots, the cockpit had an empty
// seat). A Group, origin on the seat cushion, facing -z; hands resting on the thighs (he is not flying).
export function buildSeatedCrewman(mats, name = 'copilot') {
  const g = new THREE.Group(); g.name = name;
  crewman((geo, m) => { const o = new THREE.Mesh(geo, m); o.name = name; g.add(o); }, mats, false);
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(rodG([s * 0.22, 0.55, 0.0], [s * 0.21, 0.3, -0.06], 0.1), mats.suit); a.name = name; g.add(a);       // upper arm
    const f = new THREE.Mesh(rodG([s * 0.21, 0.3, -0.06], [s * 0.15, 0.2, -0.32], 0.085), mats.suit); f.name = name; g.add(f);   // forearm on the thigh
    const h = new THREE.Mesh(boxG(0.08, 0.05, 0.1, s * 0.14, 0.19, -0.36), mats.visor); h.name = name; g.add(h);                  // glove
  }
  return g;
}

// ------------------------------------------------------------------------------------------- the model
export function buildHueyMesh() {
  const g = new THREE.Group(); g.name = 'huey';
  const oliveM = M(0x4b5320), olive2M = M(0x434a1d), frameM = M(0x30351c), blackM = M(0x141512, { shininess: 6 }), darkM = M(0x23261e);
  const metalM = M(0x45484a, { shininess: 50 }), bladeM = M(0x272927, { shininess: 25 }), tipM = M(0xe2bb1a), redM = M(0xb81c16), whiteM = M(0xe8e8e2);
  const screenM = M(0x1b1d19, { shininess: 4 }), innerM = M(0x353b2c, { side: THREE.BackSide }), floorM = M(0x2a2d25);
  const glassM = new THREE.MeshPhongMaterial({ color: 0x8fb5a2, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  const roofGlassM = new THREE.MeshPhongMaterial({ color: 0x2f7a46, specular: 0xd0ffe0, shininess: 90, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  const doorGlassM = M(0x1c2a22, { shininess: 90, specular: 0x9fb8aa });
  const crewM = { suit: M(0x5a6247), vest: M(0x3a3f2e), helmet: M(0x4a5532), skin: M(0xc19a77), visor: M(0x151515) };
  const body = bucket(), front = bucket();
  const shellG = group(g, 'shell'), shell = [shellG];

  // ---- fuselage skin: front (nose + cockpit, hidden from inside) and rear (cabin, tail cone, boom) lofts
  const rings = FUS.map(f => full(rr(...f)));
  const skin = (a, b) => (r, k) => skinMat(FZ[a + r], FZ[a + r + 1], QH(k));
  const fMats = [oliveM, glassM, roofGlassM, blackM];
  const iD = FI(-0.95);
  mesh(loft(rings.slice(0, iD + 1), skin(0, iD), 0), fMats, shellG, 'noseSkin');
  mesh(loft(rings.slice(iD), skin(iD, rings.length), -1, 0), fMats, g, 'fuselage');
  // cabin lining (the same skin seen from inside, holes at the glass and the doorways); cockpit part goes with the shell
  const lining = (a, b) => (r, k) => { const m = skinMat(FZ[a + r], FZ[a + r + 1], QH(k)); return m === 0 || m === 3 ? 0 : -1; };
  const i0 = FI(-3.5), iR = FI(2.3);
  mesh(loft(rings.slice(i0, iD + 1), lining(i0)), innerM, shellG, 'cockpitLining');
  mesh(loft(rings.slice(iD, iR + 1), lining(iD)), innerM, g, 'cabinLining');
  { // rear cabin wall (faces forward), floors
    const h = rr(2.3, ...CAB), sh = new THREE.Shape([...h.map(p => new THREE.Vector2(p[0], p[1])), ...h.slice(0, -1).reverse().map(p => new THREE.Vector2(-p[0], p[1]))]);
    body.add(new THREE.ShapeGeometry(sh).rotateY(Math.PI).translate(0, 0, 2.3), floorM);
    body.add(boxG(2.36, 0.05, 3.25, 0, -1.075, 0.675), floorM); front.add(boxG(2.3, 0.05, 1.95, 0, -1.075, -1.925), floorM);
    body.add(boxG(2.2, 0.08, 0.42, 0, -0.62, 2.05), crewM.suit); body.add(boxG(2.2, 0.55, 0.06, 0, -0.32, 2.25), crewM.suit);   // troop bench
    for (const x of [-1, 1]) body.add(rodG([x, -1.05, 1.95], [x, -0.62, 1.95], 0.04, 5), metalM);
  }
  // frames: windscreen bows + centre post, roof window bows, door posts and sills, chin window posts
  const at = z => rings[FI(z)], along = (zs, k) => zs.map(z => at(z)[k]);
  const WS = [-3.66, -3.5, -3.25, -2.95, -2.65, -2.35], GH = [-2.35, -2.0, -1.6], PD = [-2.35, -2.0, -1.6, -1.05], CD = [-0.95, 0, 0.95];
  const fT = (pts, r = 0.028, b = front) => b.add(tubeG(pts, r, Math.max(2, (pts.length - 1) * 3), 4), frameM);
  fT(along([...WS, -2.0, -1.6, -1.05], 0), 0.035);
  fT([...at(-3.66).slice(20), ...at(-3.66).slice(1, 7)]); fT([...at(-2.35).slice(20), ...at(-2.35).slice(1, 7)], 0.035);
  fT([...at(-1.6).slice(23), ...at(-1.6).slice(1, 4)]);
  for (const k of [6, 20]) fT(along(WS, k));
  for (const k of [3, 23]) fT(along(GH, k));
  for (const s of [0, 1]) {
    const K = k => (s ? 26 - k : k);
    fT(along(PD, K(4))); fT(along(PD, K(6))); fT(along([-2.35, -2.0, -1.6], K(7))); fT(along([-2.35, -2.0, -1.6], K(8)));
    fT([at(-1.6)[K(7)], at(-1.6)[K(8)]], 0.02);
    fT([4, 5, 6, 7, 8, 9].map(k => at(-1.05)[K(k)]));
    fT([4, 5, 6, 7, 8, 9].map(k => at(-0.95)[K(k)]), 0.035, body); fT([4, 5, 6, 7, 8, 9].map(k => at(0.95)[K(k)]), 0.035, body);
    fT(along(CD, K(4)), 0.03, body); fT(along(CD, K(9)), 0.035, body);
  }
  fT(along([-3.66, -3.5, -3.25, -2.95], 13), 0.03); fT(at(-2.95).slice(9, 18));
  // nose: avionics door lines, landing light, wire cutter + pitot on the roof
  const lensM = B(0x3a3a34), lens = mesh(new THREE.CircleGeometry(0.11, 10), lensM, g, 'landingLight');
  lens.position.set(0, -1.15, -2.75); lens.lookAt(0, -2.0, -3.4);
  body.add(cylZ(0.13, 0.13, 0.08, 10).applyMatrix4(lens.matrix.compose(lens.position, lens.quaternion, ONE)).translate(0, 0.02, 0.02), darkM);
  const beamM = B(0xfff2c0, { transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = mesh(new THREE.CylinderGeometry(1.3, 0.1, 7, 12, 1, true).translate(0, 3.55, 0).rotateX(-Math.PI / 2), beamM, lens, 'landingBeam');
  beam.rotation.y = Math.PI;   // circle faces +z: point the cone the same way
  // wire strike protection (fielded on Army Hueys from 1979-80): roof cutter, the deflector down the windscreen
  // centre post, the belly cutter under the chin
  front.add(rodG([0, 0.44, -2.15], [0, 0.66, -2.42], 0.03), metalM);   // upper wire cutter
  front.add(tubeG([-3.5, -3.25, -2.95, -2.65, -2.35].map(z => [0, at(z)[0][1] + 0.03, z]), 0.016, 10, 4), metalM);   // windscreen deflector
  body.add(rodG([0.3, 0.44, -1.95], [0.3, 0.56, -2.05], 0.025), metalM); body.add(rodG([0.3, 0.56, -2.0], [0.3, 0.56, -2.45], 0.016, 4), metalM);   // pitot
  front.add(rodG([0, -1.12, -3.0], [0, -1.32, -3.25], 0.05), metalM);                                                                   // lower wire cutter

  // ---- crew in the cockpit (exterior view only: the cockpit module draws its own), panel, seats
  for (const s of [-1, 1]) {
    crewman((geo, m) => front.add(geo.translate(s * 0.5, -0.62, -1.6), m), crewM);
    front.add(boxG(0.5, 0.06, 0.5, s * 0.5, -0.66, -1.62), darkM); front.add(boxG(0.5, 0.75, 0.08, s * 0.5, -0.25, -1.33), darkM);
    front.add(rodG([s * 0.5, -1.05, -2.0], [s * 0.5, -0.45, -1.95], 0.035, 5), blackM);   // cyclics
  }
  front.add(boxG(1.9, 0.5, 0.1, 0, -0.32, -2.5), blackM); front.add(boxG(2.0, 0.05, 0.36, 0, -0.06, -2.42), blackM);   // panel + glare shield
  front.add(boxG(0.36, 0.45, 0.8, 0, -0.85, -2.05), darkM);                                                             // pedestal

  // ---- sliding cargo doors (slid back over the rear cabin), rails, steps
  for (const s of [-1, 1]) {
    body.add(boxG(0.035, 1.16, 1.9, s * 1.235, -0.44, 1.9), oliveM);
    for (const z of [1.45, 2.3]) body.add(boxG(0.02, 0.42, 0.62, s * 1.255, 0.0, z), doorGlassM);
    body.add(boxG(0.05, 0.05, 3.9, s * 1.23, 0.2, 0.98), frameM); body.add(boxG(0.05, 0.05, 3.9, s * 1.23, -1.05, 0.98), frameM);
    body.add(boxG(0.025, 0.14, 0.05, s * 1.258, -0.45, 1.0), darkM);   // handle
  }
  // ---- doghouse: transmission fairing + engine cowling, intake screens, exhaust
  const DH = [[-1.2, 0.42, 0.30, 0.1], [-1.1, 0.62, 0.50, 0.3], [-0.95, 0.86, 0.62, 0.38], [-0.7, 1.06, 0.70, 0.40], [-0.35, 1.18, 0.74, 0.38],
    [0.3, 1.24, 0.75, 0.36], [0.95, 1.24, 0.75, 0.36], [1.6, 1.23, 0.72, 0.34], [2.2, 1.18, 0.64, 0.32], [2.6, 1.08, 0.50, 0.28], [2.8, 0.95, 0.36, 0.24]];
  mesh(loft(DH.map(([z, t, w, r]) => full(rr(z, t, 0.40, w, r, 0, [0.85, 0.7, 0.55]))), (r, k) => DH[r][0] >= 0.3 && DH[r + 1][0] <= 0.95 && QH(k) >= 5 && QH(k) <= 7 ? 1 : 0, -1, 0),
    [olive2M, screenM], g, 'doghouse');
  for (const s of [-1, 1]) { body.add(boxG(0.02, 0.32, 0.66, s * 0.752, 0.7, 0.62), frameM); }                         // intake screen frames
  const exG = group(g, 'exhaust', 0, 0.88, 2.6); exG.rotation.x = -0.22;
  mesh(cylZ(0.25, 0.22, 0.5, 12, true).translate(0, 0, 0.2), M(0x3a3632, { shininess: 40, side: THREE.DoubleSide }), exG, 'tailpipe');
  const heatM = B(0x000000), heat = mesh(new THREE.CircleGeometry(0.2, 12), heatM, exG, 'exhaustGlow'); heat.position.z = 0.25;
  // roof: drive shaft cover along the boom, antennas, step
  body.add(rodG([0, 0.55, 2.8], [0, 0.66, 7.6], 0.2), olive2M);
  body.add(rodG([0, 1.15, 1.6], [0.0, 1.75, 2.3], 0.02, 4), blackM);                                       // VHF whip on the doghouse
  body.add(rodG([0, -1.15, 0.6], [0, -1.45, 0.9], 0.02, 4), blackM); body.add(boxG(0.03, 0.25, 0.3, 0, -1.25, -0.6), darkM);   // belly antennas
  for (const s of [-1, 1]) body.add(rodG([s * 0.25, 0.6, 5.4], [s * 0.25, 0.6, 6.4], 0.02, 4), blackM), body.add(rodG([s * 0.25, 0.53, 5.4], [s * 0.25, 0.6, 5.4], 0.02, 4), blackM),
    body.add(rodG([s * 0.25, 0.55, 6.4], [s * 0.25, 0.6, 6.4], 0.02, 4), blackM);   // towel-bar antennas on the boom
  // AN/APR-39 radar warning receiver: four spiral antennas, two on the nose looking forward-out, two at the end of the
  // boom looking aft-out (the scope in the cockpit is theirs)
  for (const s of [-1, 1]) for (const [p, n] of [[[s * 0.88, -0.56, -3.44], [s * 0.7, 0, -0.7]], [[s * 0.15, 0.42, 8.96], [s * 0.6, 0, 0.8]]]) {
    const a = V(...p), b = V(...p).addScaledVector(V(...n), 0.045); body.add(rodG(a, b, 0.11, 10), darkM); body.add(rodG(b, V(...p).addScaledVector(V(...n), 0.05), 0.08, 10), blackM);
  }

  // ---- tail: fin, gearbox fairings, tail skid, synchronized elevator, markings
  const FIN = [[7.55, 0.55, 0.24], [8.85, 2.68, 0.13], [9.05, 2.76, 0.1], [9.5, 2.74, 0.08], [9.45, 2.3, 0.09], [9.35, 1.0, 0.11], [9.25, 0.3, 0.13], [9.05, 0.06, 0.15], [8.45, 0.18, 0.2]];
  body.add(slab(FIN, (a, b, w) => [w, b, a]), oliveM);
  body.add(boxG(0.3, 0.2, 0.5, 0, 0.7, 7.7), olive2M); body.add(new THREE.SphereGeometry(0.17, 8, 5).scale(1, 0.75, 1.6).translate(0, 0.72, 7.5), olive2M);   // 42 deg gearbox
  body.add(cylX(0.13, 0.3, 10).translate(-0.17, 2.03, 8.7), olive2M); body.add(new THREE.SphereGeometry(0.15, 8, 5).scale(0.8, 1, 1.3).translate(0.05, 2.03, 8.75), olive2M);   // 90 deg gearbox
  body.add(rodG([0, 0.2, 7.85], [0, -0.45, 8.45], 0.05, 5), metalM); body.add(rodG([0, 0.12, 8.75], [0, -0.45, 8.45], 0.05, 5), metalM);   // tail skid
  body.add(new THREE.SphereGeometry(0.04, 5, 3).translate(0, -0.46, 8.46), metalM);
  const elevG = group(g, 'elevator', 0, 0.19, 5.74);
  mesh(slab([[-1.34, -0.18, 0.05], [-1.22, -0.29, 0.07], [0, -0.32, 0.1], [1.22, -0.29, 0.07], [1.34, -0.18, 0.05], [1.34, 0.22, 0.03], [1.22, 0.3, 0.025], [-1.22, 0.3, 0.025], [-1.34, 0.22, 0.03]],
    (a, b, w) => [a, w, b]), olive2M, elevG, 'elevatorSkin');
  for (const s of [-1, 1]) {
    const d = mesh(new THREE.PlaneGeometry(1.08, 0.18),new THREE.MeshBasicMaterial({ map: armyDecal(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), g, 'usArmy');
    d.position.set(s * 0.462, 0.13, 4.86); d.rotation.y = s * (Math.PI / 2 - 0.085);
    const n = mesh(new THREE.PlaneGeometry(0.86, 0.21), new THREE.MeshBasicMaterial({ map: serialDecal(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), g, 'tailNumber');
    n.position.set(s * 0.08, 1.3, 8.8); n.rotation.y = s * Math.PI / 2;
  }

  // ---- skids: tubes with upturned toes, arched cross tubes, steps
  for (const s of [-1, 1]) {
    body.add(tubeG([[s * 1.3, -1.36, -2.62], [s * 1.3, -1.52, -2.52], [s * 1.3, -1.7, -2.28], [s * 1.3, -1.79, -1.95], [s * 1.3, -1.79, 0], [s * 1.3, -1.79, 2.45], [s * 1.3, -1.76, 2.62]], 0.05, 26, 6), oliveM);
    body.add(new THREE.SphereGeometry(0.05, 6, 3).translate(s * 1.3, -1.76, 2.62), oliveM);
    body.add(boxG(0.1, 0.02, 4.3, s * 1.3, -1.835, 0.2), darkM);   // skid shoe
    body.add(boxG(0.32, 0.03, 0.18, s * 1.28, -1.42, -1.0), darkM);  // step on the front cross tube
  }
  for (const z of [-1.0, 1.2]) body.add(tubeG([[-1.3, -1.79, z], [-1.29, -1.6, z], [-1.22, -1.33, z], [-1.02, -1.19, z], [-0.6, -1.13, z], [0.6, -1.13, z], [1.02, -1.19, z], [1.22, -1.33, z], [1.29, -1.6, z], [1.3, -1.79, z]], 0.055, 24, 6), oliveM);

  // ---- weapons: XM-156 mounts with M158 7-tube pods (the game fires from HUEY.PODS)
  const HEX = [[0, 0], ...Array.from({ length: 6 }, (_, i) => [0.135 * Math.cos(i * Math.PI / 3 + Math.PI / 6), 0.135 * Math.sin(i * Math.PI / 3 + Math.PI / 6)])];
  const noseG = new THREE.ConeGeometry(0.05, 0.12, 6).rotateX(-Math.PI / 2), noseM = M(0x8c8a62), pods = [];
  for (const [px, py, pz] of HUEY.PODS) {
    const s = Math.sign(px), z0 = pz - 0.76;
    body.add(cylZ(0.2, 0.2, 1.42, 12).translate(px, py, pz - 0.05), olive2M); body.add(cylZ(0.2, 0.1, 0.16, 12).translate(px, py, pz + 0.74), olive2M);   // faired body, tapered tail
    for (const [hx, hy] of HEX) body.add(new THREE.CircleGeometry(0.052, 8).rotateY(Math.PI).translate(px + hx, py + hy, z0 - 0.002), blackM);   // tube mouths
    for (const z of [z0 + 0.05, pz + 0.62]) body.add(cylZ(0.21, 0.21, 0.07, 12).translate(px, py, z), darkM);                                     // bands
    body.add(boxG(0.1, 0.12, 0.6, px, py + 0.25, pz), darkM);                                                          // hanger
    body.add(boxG(Math.abs(px) - 1.1, 0.09, 0.16, s * (1.1 + Math.abs(px)) / 2, py + 0.33, pz), oliveM);              // mount beam
    body.add(rodG([s * 1.2, -0.9, pz], [s * 1.47, py + 0.3, pz], 0.06, 6), oliveM); body.add(rodG([s * 1.2, -0.85, pz + 0.5], [s * 1.47, py + 0.3, pz], 0.05, 6), oliveM);
    const noses = HEX.map(([hx, hy]) => { const m = mesh(noseG, noseM, g, 'rocket'); m.position.set(px + hx, py + hy, z0 + 0.03); return m; });
    pods.push(noses);
  }
  // door gun: post from floor to roof, pintle arm, M60 on a yaw/pitch mount, ammo can, the gunner on a seat inboard
  const [gx, gy, gz] = HUEY.GUN;
  body.add(rodG([gx + 0.08, -1.05, gz], [gx + 0.08, 0.42, gz], 0.05, 6), metalM); body.add(rodG([gx + 0.08, gy - 0.06, gz], [gx, gy - 0.06, gz], 0.04, 5), metalM);
  const gunYaw = group(g, 'doorGun', gx, gy, gz), gunPitch = group(gunYaw, 'gunPitch'), gunBody = group(gunPitch, 'm60');
  const m60 = gb => {   // M60D on its pintle: receiver, butt with spade grips, barrel, flash hider, feed tray, ammo can (olive), mount
    gb.add(boxG(0.07, 0.11, 0.42, 0, 0.02, 0), blackM); gb.add(boxG(0.05, 0.1, 0.25, 0, 0.0, 0.33), blackM); gb.add(cylZ(0.017, 0.017, 0.56, 6).translate(0, 0.03, -0.48), blackM);
    gb.add(boxG(0.03, 0.03, 0.3, 0, -0.01, -0.36), blackM); gb.add(cylZ(0.026, 0.026, 0.08, 6).translate(0, 0.03, -0.8), blackM); gb.add(boxG(0.06, 0.05, 0.18, 0, -0.02, -0.28), blackM);
    gb.add(boxG(0.03, 0.1, 0.04, 0, -0.08, 0.1), blackM); gb.add(boxG(0.1, 0.17, 0.24, 0.1, -0.1, -0.02), olive2M); gb.add(boxG(0.06, 0.02, 0.1, 0.05, 0.0, -0.02), metalM);
    gb.add(boxG(0.05, 0.06, 0.06, 0, -0.06, 0), metalM); };
  { const gb = bucket(); m60(gb); gb.flush(gunBody, 'm60Parts'); }
  const flashM = B(0xffc860, { transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const flash = mesh(merge([new THREE.PlaneGeometry(0.22, 0.5).rotateX(Math.PI / 2), new THREE.PlaneGeometry(0.22, 0.5).rotateX(Math.PI / 2).rotateZ(Math.PI / 2)]).translate(0, 0.03, -1.05), flashM, gunBody, 'muzzleFlash');
  const gunnerG = group(g, 'gunner', gx + 0.5, -0.74, gz + 0.04);
  body.add(boxG(0.42, 0.06, 0.42, gx + 0.52, -0.77, gz + 0.06), darkM); body.add(rodG([gx + 0.52, -1.05, gz + 0.06], [gx + 0.52, -0.77, gz + 0.06], 0.05, 5), metalM);
  { const gb = bucket(); crewman((geo, m) => gb.add(geo, m), crewM); gb.flush(gunnerG, 'gunnerBody'); }
  // the crew chief on the right with the second M60D (static: the game aims the left gun only), as an Army slick flew
  { body.add(rodG([-gx - 0.08, -1.05, gz], [-gx - 0.08, 0.42, gz], 0.05, 6), metalM); body.add(rodG([-gx - 0.08, gy - 0.06, gz], [-gx, gy - 0.06, gz], 0.04, 5), metalM);
    const yawR = group(g, 'doorGunR', -gx, gy, gz); yawR.rotation.y = -Math.PI / 2; const pR = group(yawR, 'gunPitchR'); pR.rotation.x = -0.35;
    const gb = bucket(); m60(gb); gb.flush(pR, 'm60RParts');
    const chief = group(g, 'crewChief', -gx - 0.5, -0.74, gz + 0.04); chief.rotation.y = -Math.PI / 2;
    body.add(boxG(0.42, 0.06, 0.42, -gx - 0.52, -0.77, gz + 0.06), darkM); body.add(rodG([-gx - 0.52, -1.05, gz + 0.06], [-gx - 0.52, -0.77, gz + 0.06], 0.05, 5), metalM);
    const cb = bucket(); crewman((geo, m) => cb.add(geo, m), crewM); cb.flush(chief, 'crewChiefBody'); }

  // ---- main rotor: tilted mast -> swashplate -> spinning hub -> teetering blade beam (+ precone) + stabilizer bar
  const mast = group(g, 'mast', ...HUEY.HUB); mast.rotation.x = -MAST_TILT;   // axis (0, cos 5, -sin 5)
  { const mb = bucket();
    mb.add(new THREE.CylinderGeometry(0.085, 0.095, 0.95, 10).translate(0, -0.4, 0), metalM); mb.add(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 10).translate(0, -0.78, 0), olive2M);
    mb.add(new THREE.CylinderGeometry(0.07, 0.08, 0.2, 8).translate(0, 0.14, 0), metalM); mb.flush(mast, 'mastTube'); }
  const swash = group(mast, 'swashplate', 0, -0.55, 0), swSpin = group(swash, 'swashSpin');
  mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 12), metalM, swash, 'swashLower');
  { const sb = bucket(); sb.add(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 12).translate(0, 0.055, 0), darkM);
    for (const s of [-1, 1]) sb.add(rodG([s * 0.22, 0.06, s * 0.1], [s * 0.42, 0.52, s * 0.12], 0.035, 5), metalM);   // pitch links to the horns
    sb.flush(swSpin, 'swashUpper'); }
  const spin = group(mast, 'rotorHub'), teeter = group(spin, 'teeter');
  { const hb = bucket();
    hb.add(boxG(0.75, 0.14, 0.26), metalM); hb.add(cylX(0.11, 0.18, 10), darkM);
    for (const s of [-1, 1]) { hb.add(cylX(0.085, 0.5, 8).translate(s * 0.62, 0, 0.02), metalM); hb.add(boxG(0.06, 0.05, 0.18, s * 0.45, -0.02, s * 0.14), metalM); }
    hb.flush(teeter, 'yoke'); }
  const blades = [], DROOP = -0.045;
  const bladeBody = slab([[0.8, -0.13, 0.07], [6.98, -0.13, 0.06], [6.98, 0.4, 0.015], [0.8, 0.4, 0.015]], (a, b, w) => [a, w, b]);
  const bladeTip = slab([[6.98, -0.13, 0.06], [7.32, -0.13, 0.05], [7.32, 0.4, 0.012], [6.98, 0.4, 0.015]], (a, b, w) => [a, w, b]);
  const bladeRoot = merge([boxG(0.5, 0.09, 0.42, 0.95, 0, 0.1)]);
  for (const k of [0, 1]) {
    const arm = group(teeter, 'bladeArm' + k); arm.rotation.y = k * Math.PI;
    const flap = group(arm, 'flap' + k), pitch = group(flap, 'pitch' + k);
    const bodyM = mesh(bladeBody, bladeM, pitch, 'blade'), tip = mesh(bladeTip, tipM, pitch, 'bladeTip'); mesh(bladeRoot, darkM, pitch, 'bladeRoot');
    blades.push({ flap, pitch, body: bodyM, tip });
  }
  const stab = group(spin, 'stabBar', 0, 0.3, 0);
  { const sb = bucket(); sb.add(rodG([0, 0, -1.3], [0, 0, 1.3], 0.04, 6), metalM);
    for (const s of [-1, 1]) sb.add(cylZ(0.035, 0.06, 0.42, 8).translate(0, 0, s * 1.1).scale(1, 1, 1), blackM), sb.add(new THREE.SphereGeometry(0.06, 8, 4).translate(0, 0, s * 1.31), blackM);
    sb.add(boxG(0.1, 0.12, 0.2), metalM); sb.flush(stab, 'stabBarParts'); }
  { const pb = bucket(); pb.add(boxG(0.06, 0.3, 0.06, 0, 0.15, 0), metalM); for (const s of [-1, 1]) pb.add(rodG([0, 0.02, s * 0.12], [0, 0.26, s * 0.5], 0.03, 4), metalM); pb.flush(spin, 'stabMount'); }
  // motion-blur disc: a shallow cone (vertex height = radius, scaled by the coning angle) in the tip-path plane
  const discG = group(mast, 'rotorDisc');
  const ringGeo = (r0, r1, n = 48) => {
    const pos = [];
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, P = (r, a) => [r * Math.cos(a), r, r * Math.sin(a)];
      pos.push(...P(r0, a0), ...P(r1, a1), ...P(r1, a0), ...P(r0, a0), ...P(r0, a1), ...P(r1, a1));
    }
    return geom(pos);
  };
  const discM = B(0x1a1c1a, { transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }), tipRingM = B(0xd8b020, { transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const disc = mesh(ringGeo(0.9, 6.98), discM, discG, 'disc'), tipRing = mesh(ringGeo(6.98, 7.32), tipRingM, discG, 'discTips');
  disc.renderOrder = tipRing.renderOrder = 2;

  // ---- tail rotor (left side of the fin), spins about x; two blades with red / white tips; broken stub if shot away
  const trG = group(g, 'tailRotor', ...HUEY.TR_HUB), trSpin = group(trG, 'trSpin');
  { const tb = bucket(); tb.add(cylX(0.06, 0.2, 8), metalM); tb.add(boxG(0.08, 0.36, 0.12), metalM); tb.flush(trSpin, 'trHub'); }
  const trBlades = [0, 1].map(k => {
    const arm = group(trSpin, 'trArm' + k); arm.rotation.x = k * Math.PI;
    const p = group(arm, 'trPitch' + k), R = HUEY.TR_R, seg = (r0, r1, m, n) => mesh(boxG(0.03, r1 - r0, 0.21, 0, (r0 + r1) / 2, 0.03), m, p, n);
    seg(0.1, R - 0.36, bladeM, 'trBlade'); seg(R - 0.36, R - 0.2, whiteM, 'trWhite'); seg(R - 0.2, R, redM, 'trRed');
    return p;
  });
  const trDiscM = B(0x2a2a2a, { transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const trDisc = mesh(new THREE.RingGeometry(0.15, HUEY.TR_R, 24).rotateY(Math.PI / 2), trDiscM, trG, 'trDisc'); trDisc.position.x = -0.02;
  const trStub = mesh(merge([cylX(0.05, 0.16, 6).translate(-0.05, 0, 0), boxG(0.05, 0.3, 0.1, -0.1, 0.08, 0).rotateX(0.5)]), darkM, g, 'trStub');
  trStub.position.copy(trG.position); trStub.visible = false;

  // ---- lights: landing light (above), red anti-collision beacons, position lights
  const beaconM = B(0xff2414), beaconOffM = M(0x5a120e), navR = B(0xff2a1a), navG = B(0x2aff5a), navOff = M(0x333333);
  const beacons = [[0, 1.27, 1.9], [0, -1.2, 1.6]].map(p => {
    const h = mesh(new THREE.SphereGeometry(0.075, 8, 4), beaconOffM, g, 'beacon'); h.position.set(...p); return h;
  });
  const navs = [[-1.14, 0.45, -0.75, navR], [1.14, 0.45, -0.75, navG], [-1.21, -1.0, -1.5, navR], [1.21, -1.0, -1.5, navG], [0, 0.72, 9.42, B(0xffffff)]].map(([x, y, z, m]) => {
    const o = mesh(new THREE.SphereGeometry(0.045, 6, 3), navOff, g, 'navLight'); o.position.set(x, y, z); o.userData.on = m; return o;
  });

  body.flush(g, 'airframe'); front.flush(shellG, 'cockpitExterior');

  // ---- animation (no allocations)
  let psi = 0, tpsi = 0, gYaw = Math.PI / 2, gPitch = -0.2;
  const qW = new THREE.Quaternion(), vA = new THREE.Vector3();
  function animate(S = {}, dt = 0, time = 0, inside = false) {
    const nr = S.nr || 0, tx = S.tx || 0, ty = S.ty || 0, coll = S.coll || 0;
    // main rotor: counter-clockwise from above; the beam teeters into the tip-path plane, blades cone up (droop at rest)
    psi = (psi + nr * HUEY.OMEGA * dt) % (Math.PI * 2);
    spin.rotation.y = psi; swSpin.rotation.y = psi;
    const s = Math.sin(psi), c = Math.cos(psi), kr = smooth(nr, 0.15, 0.75), cone = DROOP + ((S.cone ?? 0.05) - DROOP) * kr;
    teeter.rotation.z = -tx * s - ty * c;                       // slope of the tilted plane along blade 0 (dir cos psi, 0, -sin psi)
    stab.rotation.x = -(tx * c - ty * s) * 0.85;                // the bar follows the plane, a little behind
    const broken = (S.rotorHp ?? 1) <= 0, pitch = 0.03 + coll * 0.2;
    for (const b of blades) { b.flap.rotation.z = cone; b.pitch.rotation.x = pitch; b.body.scale.x = broken ? 0.32 : 1; b.tip.visible = !broken; }
    swash.rotation.set(-tx * 0.9, 0, -ty * 0.9); swash.position.y = -0.58 + coll * 0.07;
    discG.rotation.set(-tx, 0, -ty); discG.scale.y = cone;
    const dk = broken ? 0 : smooth(nr, 0.35, 0.9);
    discM.opacity = (inside ? 0.06 : 0.16) * dk; tipRingM.opacity = (inside ? 0.07 : 0.16) * dk; discG.visible = dk > 0.01;
    // tail rotor: 5.123 x rotor speed, pitch with the pedals; gone if shot away
    const lost = !!S.tailLost;
    trG.visible = !lost; trStub.visible = lost;
    tpsi = (tpsi + nr * HUEY.OMEGA * HUEY.TR_GEAR * dt) % (Math.PI * 2); trSpin.rotation.x = -tpsi;
    for (const p of trBlades) p.rotation.y = 0.08 - (S.ped || 0) * 0.22;
    trDiscM.opacity = 0.07 * smooth(nr, 0.3, 0.8);
    elevG.rotation.x = -clamp(tx * 1.5, -0.15, 0.15);            // synchronized elevator follows fore-aft cyclic
    // door gun: aim (world) -> local; it covers the left side, otherwise it rests pointing out and down
    let yT = Math.PI / 2, pT = -0.3;
    if (S.aim && S.aim.lengthSq() > 0.5) {
      g.getWorldQuaternion(qW); vA.copy(S.aim).applyQuaternion(qW.invert());
      if (vA.x < 0.1) { yT = clamp(Math.atan2(-vA.x, -vA.z), 0.35, Math.PI - 0.25); pT = clamp(Math.asin(clamp(vA.y, -1, 1)), -1.0, 0.55); }
    }
    const kg = 1 - Math.exp(-12 * dt); gYaw += (yT - gYaw) * kg; gPitch += (pT - gPitch) * kg;
    gunYaw.rotation.y = gYaw; gunPitch.rotation.x = gPitch;
    gunnerG.rotation.y = Math.PI / 2 + (gYaw - Math.PI / 2) * 0.55;
    const fire = !!S.firing;
    flash.visible = fire && ((time * 37) % 1) < 0.6; if (flash.visible) { flash.rotation.z = time * 97 % 6.28; flash.scale.setScalar(0.7 + ((time * 53) % 1) * 0.6); }
    gunBody.position.z = fire ? 0.025 * Math.abs(Math.sin(time * 70)) : 0;
    // rockets: the left pod fires first, sides alternate
    const rk = Math.round(S.rockets ?? 16), left = Math.min(7, Math.ceil(rk / 2)), right = Math.min(7, Math.floor(rk / 2));
    for (let i = 0; i < 7; i++) { pods[0][i].visible = i < left; pods[1][i].visible = i < right; }
    // lights
    lensM.color.setHex(S.light ? 0xfff6d8 : 0x3a3a34); beam.visible = !!S.light; beamM.opacity = inside ? 0.04 : 0.1;
    const live = !!S.run || nr > 0.05, fl = live && (time % 1.0) < 0.1;
    for (const b of beacons) { b.material = fl ? beaconM : beaconOffM; b.scale.setScalar(fl ? 1.6 : 1); }
    for (const n of navs) n.material = live ? n.userData.on : navOff;
    const h = clamp(((S.n1 || 0) - 0.45) / 0.55, 0, 1); heatM.color.setRGB(0.08 + 0.55 * h, 0.03 + 0.16 * h, 0.02 + 0.03 * h);
    for (const o of shell) o.visible = !inside;
  }
  animate({});
  return { group: g, shell, animate, parts: { mast, spin, teeter, stab, blades, disc: discG, swash, tailRotor: trG, elevator: elevG, gun: gunYaw, gunner: gunnerG, pods, beam } };
}
