// Shared modelling kit for the RUNAWAY ground units: merged vertex-coloured geometry (one draw call per rigid part),
// unlit emissive seams, segment placement between two joints, and the RUNAWAY palette (BIBLE: matte ceramic and dark
// composite, pale cyan / white emissive seams, sensor clusters instead of cockpits).
import * as THREE from 'three';

export const RW = {
  ceramic: 0xd4d7d1, ceramic2: 0xb7bbb5, ceramicDirt: 0x9e9a8c, composite: 0x2a2e33, composite2: 0x3a3f45, joint: 0x50565c,
  metal: 0x6f757b, lensDark: 0x0d1114, glyph: 0x16191c, seam: 0xbff4ff, seamWarm: 0xfff4e0, iff: 0x56e8ff,
  // seized modern hardware
  coyote: 0x8b7b5c, fde: 0x7d6e52, black: 0x1d1e1f, olive: 0x4f5440, tan: 0xa89770,
};

const _c = new THREE.Color();
// A builder collecting primitives (each with a colour) into ONE BufferGeometry with a color attribute.
export class Kit {
  constructor() { this.parts = []; this.glow = []; }
  _add(list, geo, color, m) {
    if (m) geo.applyMatrix4(m);
    const g = geo.index ? geo.toNonIndexed() : geo;
    _c.set(color); const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); if (g.attributes.uv) g.deleteAttribute('uv');
    list.push(g); return g;
  }
  add(geo, color, m) { return this._add(this.parts, geo, color, m); }
  scaleAll(sx, sy = sx, sz = sx) { for (const g of [...this.parts, ...this.glow]) g.scale(sx, sy, sz); return this; }
  transformAll(m) { for (const g of [...this.parts, ...this.glow]) g.applyMatrix4(m); return this; }
  seam(geo, m) { return this._add(this.glow, geo, 0xffffff, m); }
  // primitives (position = centre unless noted); r = [rx, ry, rz] Euler radians
  box(w, h, d, x, y, z, color, r) { return this.add(new THREE.BoxGeometry(w, h, d), color, mat(x, y, z, r)); }
  // tapered box: bottom (y = 0) w0 x d0, top (y = h) w1 x d1, optional top shift (sx, sz); placed at x, y, z (bottom centre)
  taper(w0, d0, w1, d1, h, x, y, z, color, r, sx = 0, sz = 0) {
    const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = p.getY(i); p.setXYZ(i, p.getX(i) * (w0 + (w1 - w0) * t) + sx * t, t * h, p.getZ(i) * (d0 + (d1 - d0) * t) + sz * t); }
    return this.add(g, color, mat(x, y, z, r));
  }
  // a vertical prism from a plan polygon [[x, z], ...] (any winding), between heights y0 and y0 + h; an optional
  // inset makes the top face smaller (sloped sides): top = plan scaled toward its centroid by `topScale`
  prism(plan, y0, h, color, topScale = 1, m) {
    const cx = plan.reduce((s, p) => s + p[0], 0) / plan.length, cz = plan.reduce((s, p) => s + p[1], 0) / plan.length;
    const area = plan.reduce((s, p, i) => { const q = plan[(i + 1) % plan.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
    const P = area < 0 ? plan.slice().reverse() : plan, n = P.length, pos = [];
    const bot = P.map(([x, z]) => [x, y0, z]), top = P.map(([x, z]) => [cx + (x - cx) * topScale, y0 + h, cz + (z - cz) * topScale]);
    const tris = THREE.ShapeUtils.triangulateShape(P.map(([x, z]) => new THREE.Vector2(x, z)), []);
    const tri = (a, b, c) => pos.push(...a, ...b, ...c);
    for (const [a, b, c] of tris) { tri(top[a], top[c], top[b]); tri(bot[a], bot[b], bot[c]); }
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(bot[i], top[i], top[j]); tri(bot[i], top[j], bot[j]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    return this.add(g, color, m);
  }
  cyl(r0, r1, len, seg, x, y, z, color, r) { return this.add(new THREE.CylinderGeometry(r1, r0, len, seg), color, mat(x, y, z, r)); }   // along y, r0 at -y
  sphere(rad, x, y, z, color, sx = 1, sy = 1, sz = 1, ws = 8, hs = 6) { return this.add(new THREE.SphereGeometry(rad, ws, hs).scale(sx, sy, sz), color, mat(x, y, z)); }
  oct(rad, x, y, z, color, sx = 1, sy = 1, sz = 1, r) { return this.add(new THREE.OctahedronGeometry(rad).scale(sx, sy, sz), color, mat(x, y, z, r)); }
  // a glowing seam strip from a to b (thin box)
  strip(a, b, w = 0.012, t = 0.006) {
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = new THREE.Vector3().subVectors(Bv, A), L = d.length();
    const m = new THREE.Matrix4().compose(A.clone().add(Bv).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1));
    return this.seam(new THREE.BoxGeometry(w, L, t), m);
  }
  glowBox(w, h, d, x, y, z, r) { return this.seam(new THREE.BoxGeometry(w, h, d), mat(x, y, z, r)); }
  glowDisc(rad, x, y, z, r, seg = 10) { return this.seam(new THREE.CircleGeometry(rad, seg), mat(x, y, z, r)); }
  // build: returns a Group with up to two meshes (body, glow)
  build(bodyMat, glowMat, name) {
    const g = new THREE.Group(); if (name) g.name = name;
    if (this.parts.length) { const m = new THREE.Mesh(mergeGeos(this.parts), bodyMat); m.name = (name || '') + 'Body'; m.castShadow = false; g.add(m); }
    if (this.glow.length) { const m = new THREE.Mesh(mergeGeos(this.glow), glowMat); m.name = (name || '') + 'Glow'; g.add(m); }
    return g;
  }
  geometry() { return mergeGeos(this.parts); }
}
export function mat(x = 0, y = 0, z = 0, r) {
  const m = new THREE.Matrix4();
  if (r) m.makeRotationFromEuler(new THREE.Euler(r[0] || 0, r[1] || 0, r[2] || 0, r[3] || 'XYZ'));
  m.setPosition(x, y, z); return m;
}
export function mergeGeos(geos) {
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); if (g.attributes.color) col.set(g.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + g.attributes.position.count) * 3); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}

// shared materials (one set for every RUNAWAY ground unit)
let MATS = null;
export function rwMats() {
  if (MATS) return MATS;
  MATS = {
    body: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    glow: new THREE.MeshBasicMaterial({ color: RW.seam }),
    glowDim: new THREE.MeshBasicMaterial({ color: 0x6fb8c8 }),
    glowHot: new THREE.MeshBasicMaterial({ color: 0xe8fdff }),
    glowRed: new THREE.MeshBasicMaterial({ color: 0xff5040 }),
    fan: new THREE.MeshBasicMaterial({ color: 0x2a3036, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    // ngc/rwground-polish: damage states - the same vertex colours multiplied down: a burnt-out wreck (soot over
    // everything, the ceramic gone grey-brown) and a scorched machine (darkened, still recognisable)
    burnt: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: 0x3b3632 }),
    scorched: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: 0x8c8780 }),
    glowOff: new THREE.MeshBasicMaterial({ color: 0x1b2226 }),
  };
  return MATS;
}
// ngc/rwground-polish: swap every body mesh under `root` to a damage material (rwMats().burnt / scorched, or back to
// .body) and every seam to `glow` when given. Meshes with other materials (decals, fans, shadows) are left alone.
export function setBodyMat(root, mat, glow) {
  const M = rwMats();
  root.traverse(o => {
    if (!o.isMesh) return;
    if (o.material === M.body || o.material === M.burnt || o.material === M.scorched) o.material = mat;
    else if (glow && (o.material === M.glow || o.material === M.glowDim || o.material === M.glowOff || o.material === M.glowRed || o.material === M.glowHot)) o.material = glow;
  });
}

// Place an object so that its local +Y runs from a to b (local origin at a) with local +Z toward `fwd` (projected
// perpendicular). Scales Y by |b - a| / len when len is given (stretchy segments), else unit scale.
const _y = new THREE.Vector3(), _z = new THREE.Vector3(), _x = new THREE.Vector3(), _m = new THREE.Matrix4();
export function placeSeg(obj, a, b, fwd, len) {
  _y.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _y.length() || 1e-6; _y.multiplyScalar(1 / L);
  _z.set(fwd[0], fwd[1], fwd[2]); _z.addScaledVector(_y, -_z.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize(); _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z); obj.quaternion.setFromRotationMatrix(_m);
  obj.position.set(a[0], a[1], a[2]);
  const s = len ? L / len : 1; obj.scale.set(1, s, 1);
}
// Place an object at p with basis (f = local -Z, u = local +Y): three.js "nose along -z" convention
export function placeBasis(obj, p, f, u) {
  _z.set(-f[0], -f[1], -f[2]).normalize(); _y.set(u[0], u[1], u[2]); _y.addScaledVector(_z, -_y.dot(_z)).normalize(); _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z); obj.quaternion.setFromRotationMatrix(_m); obj.position.set(p[0], p[1], p[2]);
}

// Canvas stencil texture for crude machine markings over old ones (RUNAWAY glyph strings + barcode bars)
const stencils = new Map();
export function stencilTex(text, { w = 256, h = 64, color = '#e8eef0', bg = null, font = 'bold 40px monospace', bars = true } = {}) {
  const key = text + w + h + color + bg + bars; if (stencils.has(key)) return stencils.get(key);
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  x.fillStyle = color; x.font = font; x.textBaseline = 'middle'; x.fillText(text, 8, h / 2 + 2);
  if (bars) { let px = w * 0.62; for (let i = 0; i < 14 && px < w - 6; i++) { const bw = 2 + ((i * 7) % 5); x.fillRect(px, h * 0.18, bw, h * 0.64); px += bw + 2 + ((i * 3) % 4); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; stencils.set(key, t); return t;
}
export function decal(tex, w, h, x, y, z, r, opacity = 0.9) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.position.set(x, y, z); if (r) m.rotation.set(r[0] || 0, r[1] || 0, r[2] || 0); return m;
}
