// Shared kit for the naval models: geometry is gathered per ship into ONE vertex-coloured mesh (one draw call for a
// hull, its superstructure, deck gear and vehicles), decals (numbers, names, rust streaks, stencils) into one
// textured mesh off a canvas atlas, and "baking" of existing multi-material models (the Hornet, the Tomcat) into a
// single vertex-coloured geometry that can be instanced. Flat-shaded, colours from the palette, no image files.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
export const DEG = Math.PI / 180;
// matrix from position, Euler rotation (XYZ, radians) and scale
export function T(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order = 'XYZ') {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, order)), _s.set(sx, sy, sz));
}
// deterministic random
export function rng(seed = 1) { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }

// A bucket of coloured geometry. Every add() takes a geometry, a colour (hex or THREE.Color) and an optional matrix.
// `wear` (0..1) jitters each part's colour a little so big flat areas don't look like plastic; `grime(x, y, z, c)` can
// darken / tint per vertex in the kit's frame (waterline stains, soot).
export class Kit {
  constructor({ wear = 0.04, seed = 7, grime = null } = {}) { this.pos = []; this.col = []; this.wear = wear; this.r = rng(seed); this.grime = grime; this.stack = [new THREE.Matrix4()]; }
  get M() { return this.stack[this.stack.length - 1]; }
  push(m) { this.stack.push(new THREE.Matrix4().multiplyMatrices(this.M, m)); return this; }
  pop() { this.stack.pop(); return this; }
  add(geo, color, m) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const M = m ? new THREE.Matrix4().multiplyMatrices(this.M, m) : this.M;
    const p = g.attributes.position, j = this.wear ? 1 + (this.r() - 0.5) * 2 * this.wear : 1;
    _c.set(color); const r0 = _c.r * j, g0 = _c.g * j, b0 = _c.b * j;
    const flip = M.determinant() < 0;
    const v = new THREE.Vector3(), tri = [];
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(M); tri.push(v.x, v.y, v.z);
      if (tri.length === 9) {
        if (flip) { for (let k = 0; k < 3; k++) { const t = tri[3 + k]; tri[3 + k] = tri[6 + k]; tri[6 + k] = t; } }
        // grime is decided per triangle (at its centroid): crisp bands (boot-top, soot) in the flat-shaded style
        let cr = r0, cg = g0, cb = b0;
        if (this.grime) { _c.setRGB(r0, g0, b0); this.grime((tri[0] + tri[3] + tri[6]) / 3, (tri[1] + tri[4] + tri[7]) / 3, (tri[2] + tri[5] + tri[8]) / 3, _c, this.r); cr = _c.r; cg = _c.g; cb = _c.b; }
        for (let k = 0; k < 9; k += 3) { this.pos.push(tri[k], tri[k + 1], tri[k + 2]); this.col.push(cr, cg, cb); }
        tri.length = 0;
      }
    }
    if (g !== geo) g.dispose();
    return this;
  }
  box(w, h, d, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), c, T(x, y, z, rx, ry, rz)); }
  cyl(rt, rb, h, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 10, open = false) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), c, T(x, y, z, rx, ry, rz)); }
  // a cylinder from point a to point b (pipes, struts, rails)
  rod(a, b, r, c, seg = 5) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(); if (L < 1e-4) return this;
    const m = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), _s.set(1, 1, 1));
    return this.add(new THREE.CylinderGeometry(r, r, L, seg, 1, true), c, m);
  }
  sphere(r, c, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ws = 10, hs = 6) { return this.add(new THREE.SphereGeometry(r, ws, hs), c, T(x, y, z, 0, 0, 0, sx, sy, sz)); }
  // extrude a 2D outline (x, y pairs) along +z by depth, then place it
  prism(pts, depth, c, m) { const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))); return this.add(new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }), c, m); }
  // a rail: posts and a top rail along a polyline (handrails, safety-net frames)
  rail(pts, h, c, step = 1.6, r = 0.03) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i], pts[i + 1]], L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.round(L / step));
      this.rod([a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], r, c, 4);
      for (let k = 0; k <= n; k++) { const t = k / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t; this.rod([x, y, z], [x, y + h, z], r, c, 4); }
    }
    return this;
  }
  // a lofted skin through rings of points (each ring an array of [x, y, z], same length); closes nothing
  loft(rings, c) {
    const pos = [];
    for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < rings[r].length - 1; k++) {
      const a = rings[r][k], b = rings[r][k + 1], cc = rings[r + 1][k + 1], d = rings[r + 1][k];
      pos.push(...a, ...cc, ...b, ...a, ...d, ...cc);   // outward = (ring k -> k+1) x (ring r -> r+1)
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return this.add(g, c);
  }
  // a flat polygon (x, z outline, CCW seen from above) at height y, facing up (or down)
  floor(pts, y, c, down = false) {
    const tris = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p[0], p[1])), []), pos = [];
    for (const [i, j, k] of tris) {
      const A = pts[i], B = pts[j], C = pts[k], cross = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      // facing up (+y) needs the triangle clockwise in (x, z) seen from above with z down... check with the normal
      let tri = [A, B, C]; const up = cross < 0; if (up === down) tri = [A, C, B];
      for (const p of tri) pos.push(p[0], y, p[1]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return this.add(g, c);
  }
  // a flat plate from a plan outline (x, z), between heights y0 and y1: top, bottom and edges (wings, hulls in plan)
  slab(pts, y0, y1, c, cBottom = c) {
    this.floor(pts, y1, c); this.floor(pts, y0, cBottom, true);
    const area = pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0), pos = [];
    for (let i = 0; i < pts.length; i++) {
      let a = pts[i], b = pts[(i + 1) % pts.length]; if (area > 0) [a, b] = [b, a];
      pos.push(a[0], y0, a[1], a[0], y1, a[1], b[0], y1, b[1], a[0], y0, a[1], b[0], y1, b[1], b[0], y0, b[1]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return this.add(g, c);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  mesh(mat) { return new THREE.Mesh(this.geometry(), mat || hullMat()); }
  get triangles() { return this.pos.length / 9; }
}
let _hull = null, _glow = null;
export const hullMat = () => _hull || (_hull = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 14, specular: 0x202020 }));
export const glowMat = () => _glow || (_glow = new THREE.MeshBasicMaterial({ vertexColors: true }));

// ---------------------------------------------------------------------------------------- baking a model
// Every visible mesh under `root` (in root's frame) into one vertex-coloured geometry. Transparent glass is baked as
// an opaque dark tint; additive / basic glow bits are skipped unless keepBasic. filter(mesh) -> false skips a mesh.
export function bake(root, { keepBasic = false, filter = null, tint = null } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const kit = new Kit({ wear: 0 });
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh) return;
    for (let p = o; p; p = p.parent) { if (!p.visible) return; if (p === root) break; }
    if (filter && !filter(o)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const geo = o.geometry;
    const pick = mat => {
      if (!mat || mat.visible === false) return null;
      if (mat.isMeshBasicMaterial && !keepBasic) return null;
      const c = (mat.color ? mat.color.clone() : new THREE.Color(0x888888));
      if (mat.transparent && mat.opacity < 0.6) { if (mat.opacity < 0.08) return null; c.lerp(new THREE.Color(0x1d2a33), 0.75); }
      if (tint) tint(c, mat, o);
      return c;
    };
    if (geo.groups && geo.groups.length && Array.isArray(o.material)) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      for (const gr of g.groups) {
        const c = pick(mats[gr.materialIndex]); if (!c) continue;
        const sub = new THREE.BufferGeometry(); const a = g.attributes.position;
        sub.setAttribute('position', new THREE.Float32BufferAttribute(a.array.slice(gr.start * 3, (gr.start + gr.count) * 3), 3));
        kit.add(sub, c, m);
      }
    } else { const c = pick(mats[0]); if (c) kit.add(geo, c, m); }
  });
  return kit.geometry();
}

// concatenate non-indexed geometries that carry position + color
export function mergeGeos(list) {
  const n = list.reduce((s, g) => s + g.attributes.position.count * 3, 0), pos = new Float32Array(n), col = new Float32Array(n).fill(0.6);
  let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o); if (g.attributes.color) col.set(g.attributes.color.array, o); o += g.attributes.position.count * 3; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox(); return g;
}

// ---------------------------------------------------------------------------------------- canvas textures + decals
export function canvasTex(w, h, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// A decal sheet: one canvas atlas cut into a grid of cells, and quads placed on the ship that show a cell (or a
// sub-rect). All the quads become one mesh. place(cell, matrix, w, h) puts a w x h quad (in its XY plane, facing +z).
export class DecalSheet {
  constructor(size = 1024, cols = 8, rows = 8) { this.size = size; this.cols = cols; this.rows = rows; this.cv = document.createElement('canvas'); this.cv.width = this.cv.height = size; this.x = this.cv.getContext('2d'); this.pos = []; this.uv = []; }
  cell(i) { const cw = this.size / this.cols, ch = this.size / this.rows; return { x: (i % this.cols) * cw, y: Math.floor(i / this.cols) * ch, w: cw, h: ch, i }; }
  // draw into cells [i0 .. i0 + span) laid out in one row (a wide decal: a name, a number)
  draw(i0, spanX, spanY, fn) { const c = this.cell(i0), w = c.w * spanX, h = c.h * spanY; this.x.save(); this.x.beginPath(); this.x.rect(c.x, c.y, w, h); this.x.clip(); this.x.translate(c.x, c.y); fn(this.x, w, h); this.x.restore(); return { u0: c.x / this.size, v0: c.y / this.size, u1: (c.x + w) / this.size, v1: (c.y + h) / this.size }; }
  place(r, m, w, h, flipU = false) {
    const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], uvs = [[r.u0, r.v1], [r.u1, r.v1], [r.u1, r.v0], [r.u0, r.v0]];
    if (flipU) for (const u of uvs) u[0] = r.u0 + r.u1 - u[0];
    const v = new THREE.Vector3();
    for (const k of [0, 1, 2, 0, 2, 3]) { v.set(pts[k][0], pts[k][1], 0).applyMatrix4(m); this.pos.push(v.x, v.y, v.z); this.uv.push(uvs[k][0], 1 - uvs[k][1]); }
  }
  mesh({ lambert = true } = {}) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.computeVertexNormals();
    const t = new THREE.CanvasTexture(this.cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const mat = new (lambert ? THREE.MeshLambertMaterial : THREE.MeshBasicMaterial)({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = new THREE.Mesh(g, mat); m.renderOrder = 1; return m;
  }
}
// rust / grime streak drawn into a cell: a source blob and a fading run downwards
export function drawStreak(x, w, h, r, { col = [120, 62, 30], a = 0.75, n = 5 } = {}) {
  for (let k = 0; k < n; k++) {
    const cx = w * (0.25 + 0.5 * r()), sw = w * (0.05 + 0.12 * r()), len = h * (0.45 + 0.55 * r());
    const g = x.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${a})`); g.addColorStop(0.25, `rgba(${col[0] - 10},${col[1] - 8},${col[2] - 5},${a * 0.7})`); g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
    x.fillStyle = g; x.beginPath(); x.moveTo(cx - sw / 2, 0); x.lineTo(cx + sw / 2, 0); x.lineTo(cx + sw * 0.2, len); x.lineTo(cx - sw * 0.2, len); x.closePath(); x.fill();
  }
  x.fillStyle = `rgba(${col[0] - 30},${col[1] - 20},${col[2] - 10},${a})`; x.beginPath(); x.ellipse(w / 2, h * 0.03, w * 0.18, h * 0.03, 0, 0, 6.283); x.fill();
}
// stencil text (white-on-black stencils, hull numbers with shadow, machine glyphs)
export function drawText(x, w, h, txt, { font = 'bold', color = '#e8e8e0', shadow = null, size = 0.8, align = 'center', family = 'Liberation Sans, Arial, sans-serif', stretch = 1 } = {}) {
  x.save(); x.font = `${font} ${Math.round(h * size)}px ${family}`; x.textAlign = align; x.textBaseline = 'middle';
  const tx = align === 'center' ? w / 2 : align === 'left' ? h * 0.1 : w - h * 0.1;
  x.translate(tx, h / 2); x.scale(stretch, 1);
  if (shadow) { x.fillStyle = shadow; x.fillText(txt, h * 0.05, h * 0.05); }
  x.fillStyle = color; x.fillText(txt, 0, 0); x.restore();
}
// RUNAWAY machine glyphs: rows of angular marks (their "stencils" over old markings)
export function drawGlyphs(x, w, h, r, { color = 'rgba(150,240,255,0.9)', rows = 2 } = {}) {
  x.save(); x.strokeStyle = color; x.fillStyle = color; x.lineWidth = Math.max(2, h * 0.05);
  const rh = h / rows;
  for (let j = 0; j < rows; j++) {
    let cx = w * 0.04; const y0 = j * rh + rh * 0.2, gh = rh * 0.6;
    while (cx < w * 0.94) {
      const gw = gh * (0.35 + 0.5 * r());
      x.beginPath();
      const k = Math.floor(r() * 5);
      if (k === 0) { x.moveTo(cx, y0); x.lineTo(cx + gw, y0); x.lineTo(cx + gw, y0 + gh); }
      else if (k === 1) { x.moveTo(cx, y0 + gh); x.lineTo(cx + gw / 2, y0); x.lineTo(cx + gw, y0 + gh); }
      else if (k === 2) { x.rect(cx, y0 + gh * 0.3, gw, gh * 0.4); }
      else if (k === 3) { x.moveTo(cx, y0); x.lineTo(cx, y0 + gh); x.moveTo(cx, y0 + gh / 2); x.lineTo(cx + gw, y0 + gh / 2); }
      else { x.moveTo(cx + gw / 2, y0); x.lineTo(cx + gw / 2, y0 + gh); x.moveTo(cx, y0 + gh * 0.2); x.lineTo(cx + gw, y0 + gh * 0.8); }
      x.stroke(); cx += gw + gh * 0.25;
    }
  }
  x.restore();
}
