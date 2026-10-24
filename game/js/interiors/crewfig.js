// INTERIORS (ngc/interiors): the people at their stations and in the seats - cheap static figures in the house style
// (flat-shaded boxes, vertex colours, one geometry per figure, mergeable into one draw call per room or craft).
//   crewGeometry(kind, pose, opts) -> BufferGeometry (origin: the feet standing, the seat under the hips seated; the
//                                     figure faces +z)
//   kinds: 'sailor' (chambray shirt, dungarees, white hat or ball cap), 'officer' (khakis), 'pilot' (sage flight suit,
//          the ready room), 'jetPilot' (HGU-33 helmet, dark visor, oxygen mask, torso harness, g-suit), 'heloPilot'
//          (SPH-4 helmet, olive flight suit), 'deck' (jersey in its colour, cranial with goggles, float coat), 'marine'
//          (1980: M1 helmet in its cover, OG-107 utilities, M1955 flak vest, ALICE webbing), 'tanker' (CVC helmet)
//   poses: 'stand' | 'seated' | 'kneel';  arms: 'side' | 'table' | 'wheel' | 'binocs' | 'point' | 'controls' |
//          'knees' (seated, hands on the knees) | 'rifle' (seated, the M16 upright between the knees)
import * as THREE from 'three';

const SKIN = [0xc39a78, 0x8d6448, 0x5e4030, 0xd2a888, 0xb08060];
const JERSEY = { yellow: 0xd8b21e, blue: 0x2a4aa0, brown: 0x6a4a2a, green: 0x3a7a3a, red: 0xa8231b, purple: 0x6a3a8a, white: 0xe2e2dc };
const LOOK = {
  sailor:    { shirt: 0x7f9cc0, legs: 0x2b3550, boot: 0x1a1a1a, hat: 'white' },
  officer:   { shirt: 0xb5a27a, legs: 0xa8956c, boot: 0x3a2a1a, hat: 'garrison', hatC: 0xa8956c },
  pilot:     { shirt: 0x6b7356, legs: 0x6b7356, boot: 0x1a1a1a, hat: 'ball', hatC: 0x2a3450, patch: 0xa82a1a },
  jetPilot:  { shirt: 0x6b7356, legs: 0x6b7356, boot: 0x1a1a1a, hat: 'jet', hatC: 0xe4e4dc, harness: 0x4a4a3a, gsuit: 0x5a6048 },
  heloPilot: { shirt: 0x56603f, legs: 0x56603f, boot: 0x1a1a1a, hat: 'sph4', hatC: 0x46502e, harness: 0x394030 },
  deck:      { shirt: 0xd8b21e, legs: 0x2b3550, boot: 0x2a2a2a, hat: 'cranial', vest: true },
  marine:    { shirt: 0x4d5838, legs: 0x4d5838, boot: 0x1a1a1a, hat: 'm1', hatC: 0x56603d, flak: 0x48503a, webbing: 0x5a5a40 },
  tanker:    { shirt: 0x4d5838, legs: 0x4d5838, boot: 0x1a1a1a, hat: 'cvc', hatC: 0x3a3e30 },
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
class Acc {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.stack = [new THREE.Matrix4()]; }
  get M() { return this.stack[this.stack.length - 1]; }
  push(x, y, z, rx = 0, ry = 0, rz = 0) { const m = new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(1, 1, 1)); this.stack.push(this.M.clone().multiply(m)); return this; }
  pop() { this.stack.pop(); return this; }
  // a box centred at (x, y, z) in the current frame
  box(w, h, d, hex, x = 0, y = 0, z = 0, rx = 0) { this.add(new THREE.BoxGeometry(w, h, d), hex, x, y, z, rx); }
  sph(r, hex, x, y, z, sx = 1, sy = 1, sz = 1, th = Math.PI) { this.add(new THREE.SphereGeometry(r, 8, 5, 0, Math.PI * 2, 0, th).scale(sx, sy, sz), hex, x, y, z); }
  cyl(r, h, hex, x, y, z, rx = 0) { this.add(new THREE.CylinderGeometry(r, r, h, 6), hex, x, y, z, rx); }
  add(g0, hex, x, y, z, rx = 0) {
    const g = g0.index ? g0.toNonIndexed() : g0; if (rx) g.rotateX(rx); g.translate(x, y, z); g.applyMatrix4(this.M); g.computeVertexNormals();
    _c.setHex(hex); const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { this.pos.push(p[i]); this.nor.push(n[i]); }
    for (let i = 0; i < p.length / 3; i++) this.col.push(_c.r, _c.g, _c.b);
  }
  geometry() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); g.computeBoundingSphere(); return g; }
}

// arm angles [shoulder pitch (+ forward), shoulder roll (out), elbow bend] per arm pose (left, right)
const ARMS = {
  side: [[0.05, 0.08, 0.15], [0.05, 0.08, 0.15]], table: [[0.3, 0.1, 1.0], [0.3, 0.1, 1.0]], wheel: [[0.5, 0.15, 1.15], [0.5, 0.15, 1.15]],
  binocs: [[1.25, 0.25, 2.1], [1.25, 0.25, 2.1]], point: [[0.1, 0.08, 0.2], [1.5, 0.05, 0.1]], controls: [[0.55, 0.15, 0.85], [0.45, 0.05, 1.0]],
  knees: [[0.45, 0.05, 0.75], [0.45, 0.05, 0.75]], rifle: [[0.75, 0.0, 1.1], [0.6, 0.0, 1.2]],
};
// build one figure
export function crewGeometry(kind = 'sailor', pose = 'stand', o = {}) {
  const L = { ...LOOK[kind] || LOOK.sailor }, A = new Acc(), seed = o.seed ?? Math.floor(Math.random() * 1000), skin = SKIN[seed % SKIN.length];
  if (kind === 'deck') L.shirt = JERSEY[o.jersey] || JERSEY.yellow;
  if (o.hat) L.hat = o.hat;
  const seated = pose === 'seated', kneel = pose === 'kneel';
  // hips: standing 0.92 above the feet; seated on the seat (origin), thighs forward; kneeling on the right knee
  const hipY = seated ? 0.06 : kneel ? 0.5 : 0.92;
  // legs
  for (const s of [-1, 1]) {
    A.push(s * 0.1, hipY, 0, seated ? -1.5 : kneel ? (s < 0 ? -1.5 : -0.05) : 0, 0, 0);
    A.box(0.15, 0.46, 0.17, kind === 'jetPilot' ? L.gsuit : L.legs, 0, -0.23, 0);
    A.push(0, -0.45, 0, seated ? 1.5 : kneel ? (s < 0 ? 1.5 : 1.5) : 0, 0, 0);
    A.box(0.13, 0.42, 0.15, L.legs, 0, -0.21, 0); A.box(0.14, 0.1, 0.27, L.boot, 0, -0.43, 0.05);
    A.pop(); A.pop();
  }
  // torso, kit, head
  A.push(0, hipY, 0, seated ? -0.08 : kneel ? 0.05 : 0, 0, 0);
  A.box(0.36, 0.2, 0.22, L.legs, 0, 0.08, 0);                          // hips
  A.box(0.38, 0.48, 0.23, L.shirt, 0, 0.42, 0);                         // chest
  if (L.vest) A.box(0.41, 0.36, 0.26, kind === 'deck' ? L.shirt : 0x3a3a3a, 0, 0.4, 0);
  if (L.flak) { A.box(0.42, 0.42, 0.27, L.flak, 0, 0.42, 0); A.box(0.4, 0.06, 0.26, L.webbing, 0, 0.16, 0); A.box(0.1, 0.1, 0.08, L.webbing, -0.14, 0.18, 0.15); A.box(0.1, 0.1, 0.08, L.webbing, 0.14, 0.18, 0.15); }
  if (L.harness) { A.box(0.4, 0.05, 0.25, L.harness, 0, 0.22, 0); for (const s of [-1, 1]) A.box(0.06, 0.46, 0.25, L.harness, s * 0.1, 0.42, 0); }
  if (L.patch) A.box(0.08, 0.06, 0.01, L.patch, 0.1, 0.55, 0.12);
  // neck and head (faces +z), the hat
  A.box(0.1, 0.08, 0.1, skin, 0, 0.7, 0);
  A.push(0, 0.83, 0.0, o.look === 'down' ? 0.35 : 0, o.headYaw || 0, 0);
  A.box(0.19, 0.23, 0.21, skin, 0, 0, 0.01);
  hat(A, L, kind);
  A.pop();
  // arms
  const arms = ARMS[o.arms || (seated ? 'knees' : 'side')] || ARMS.side;
  for (const [i, s] of [[0, -1], [1, 1]]) {
    const [pitch, roll, bend] = arms[i];
    A.push(s * 0.23, 0.62, 0, -pitch, 0, s * roll);
    A.box(0.11, 0.32, 0.12, L.shirt, 0, -0.15, 0);
    A.push(0, -0.3, 0, -bend, 0, 0); A.box(0.1, 0.28, 0.1, L.shirt, 0, -0.13, 0); A.box(0.08, 0.09, 0.09, kind === 'jetPilot' || kind === 'heloPilot' ? 0x3a3020 : skin, 0, -0.31, 0);
    if (o.arms === 'binocs' && s > 0) A.box(0.16, 0.08, 0.16, 0x1a1a1a, -0.1, -0.33, 0.02);
    A.pop(); A.pop();
  }
  if (o.arms === 'rifle') { A.box(0.05, 0.9, 0.07, 0x1a1a1a, 0, 0.25, 0.32); A.box(0.06, 0.18, 0.05, 0x1a1a1a, 0, 0.0, 0.38); }   // the M16A1 upright
  A.pop();
  return A.geometry();
}
function hat(A, L, kind) {
  const h = L.hat;
  if (h === 'white') { A.cyl(0.12, 0.08, 0xf0f0ea, 0, 0.15, 0); A.cyl(0.15, 0.03, 0xf0f0ea, 0, 0.11, 0); }
  else if (h === 'ball') { A.sph(0.115, L.hatC || 0x2a3450, 0, 0.08, 0, 1, 0.7, 1.05, Math.PI / 2); A.box(0.18, 0.02, 0.12, L.hatC || 0x2a3450, 0, 0.09, 0.14); }
  else if (h === 'garrison') { A.box(0.2, 0.07, 0.26, L.hatC, 0, 0.14, 0); }
  else if (h === 'cranial') { A.sph(0.13, L.shirt, 0, 0.06, 0, 1, 0.9, 1.1, Math.PI / 2); A.box(0.2, 0.05, 0.04, 0x1a1a1a, 0, 0.1, 0.12); for (const s of [-1, 1]) A.box(0.05, 0.09, 0.08, L.shirt, s * 0.11, 0, 0); }
  else if (h === 'jet') { A.sph(0.155, L.hatC, 0, 0.03, -0.01, 1, 1.05, 1.08, Math.PI * 0.62); A.box(0.22, 0.08, 0.06, 0x1a1a1e, 0, 0.04, 0.12); A.box(0.1, 0.1, 0.09, 0x3a3a3a, 0, -0.08, 0.13); A.cyl(0.02, 0.3, 0x2a2a2a, 0.06, -0.22, 0.12, 0.4); }
  else if (h === 'sph4') { A.sph(0.15, L.hatC, 0, 0.03, 0, 1, 1.02, 1.06, Math.PI * 0.6); A.box(0.2, 0.06, 0.05, 0x1a1a1a, 0, 0.07, 0.12); for (const s of [-1, 1]) A.cyl(0.05, 0.04, L.hatC, s * 0.12, 0, 0, 0); }
  else if (h === 'm1') { A.sph(0.15, L.hatC, 0, 0.02, 0, 1.05, 0.95, 1.1, Math.PI / 2); A.cyl(0.165, 0.02, L.hatC, 0, 0.02, 0); }
  else if (h === 'cvc') { A.sph(0.14, L.hatC, 0, 0.03, 0, 1, 1, 1.05, Math.PI * 0.6); for (const s of [-1, 1]) A.box(0.04, 0.1, 0.1, 0x1a1a1a, s * 0.12, -0.02, 0); }
}
// many figures merged (static, e.g. a room's crew in the ship frame): [{ kind, pose, x, y, z, yaw, ...opts }]
export function crewMesh(list, material) {
  const pos = [], nor = [], col = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), n3 = new THREE.Matrix3();
  list.forEach((c, i) => {
    const g = crewGeometry(c.kind, c.pose, { seed: i * 7 + 3, ...c });
    m.compose(p.set(c.x, c.y + (c.pose === 'seated' ? (c.seatH ?? 0.45) : 0), c.z), q.setFromAxisAngle(up, c.yaw || 0), one); g.applyMatrix4(m);
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); col.push(...g.attributes.color.array);
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeBoundingSphere();
  return new THREE.Mesh(g, material || crewMaterial());
}
let MAT = null;
export const crewMaterial = () => MAT ||= new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
