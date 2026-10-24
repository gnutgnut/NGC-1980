// A tiny geometry builder for the lived-in world: flat-shaded triangles with per-vertex colours, built into plain
// arrays (no THREE), so whole towns can be put together in a worker and handed to the main thread as one buffer per
// chunk (one draw call). The house style: Lambert, no textures, colours from the palette, small details as geometry.
//
// Local frames: push(x, y, z, yaw) moves the origin and turns about +y (yaw 0: local +x = world +x, local +z = world +z).
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const cache = new Map();
export function col(hex, k = 1) {   // sRGB hex -> linear [r, g, b] (what a THREE colour from that hex would be), times k
  const key = hex * 7 + k; let c = cache.get(key);
  if (!c) { c = [lin((hex >> 16) & 255) * k, lin((hex >> 8) & 255) * k, lin(hex & 255) * k]; cache.set(key, c); }
  return c;
}
export const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const GRIME = col(0x3e3628);   // damp, mud splash and soot at the foot of walls

export class Geo {
  constructor() { this.p = []; this.c = []; this.m = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]; this.stack = []; this.tris = 0; this.wx = null; }
  // ---- transforms (3x3 rotation + translation, row-major)
  push(x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0, s = 1) {
    this.stack.push(this.m);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    // R = Ry(yaw) * Rx(pitch) * Rz(roll); yaw turns +x towards -z like THREE's rotation.y
    const r00 = cy * cr + sy * sp * sr, r01 = -cy * sr + sy * sp * cr, r02 = sy * cp;
    const r10 = cp * sr, r11 = cp * cr, r12 = -sp;
    const r20 = -sy * cr + cy * sp * sr, r21 = sy * sr + cy * sp * cr, r22 = cy * cp;
    const a = this.m, l = [r00 * s, r01 * s, r02 * s, r10 * s, r11 * s, r12 * s, r20 * s, r21 * s, r22 * s, x, y, z];
    this.m = [
      a[0] * l[0] + a[1] * l[3] + a[2] * l[6], a[0] * l[1] + a[1] * l[4] + a[2] * l[7], a[0] * l[2] + a[1] * l[5] + a[2] * l[8],
      a[3] * l[0] + a[4] * l[3] + a[5] * l[6], a[3] * l[1] + a[4] * l[4] + a[5] * l[7], a[3] * l[2] + a[4] * l[5] + a[5] * l[8],
      a[6] * l[0] + a[7] * l[3] + a[8] * l[6], a[6] * l[1] + a[7] * l[4] + a[8] * l[7], a[6] * l[2] + a[7] * l[5] + a[8] * l[8],
      a[0] * x + a[1] * y + a[2] * z + a[9], a[3] * x + a[4] * y + a[5] * z + a[10], a[6] * x + a[7] * y + a[8] * z + a[11],
    ];
    return this;
  }
  pop() { this.m = this.stack.pop(); return this; }
  // world position of a local point
  at(x, y, z) { const m = this.m; return [m[0] * x + m[1] * y + m[2] * z + m[9], m[3] * x + m[4] * y + m[5] * z + m[10], m[6] * x + m[7] * y + m[8] * z + m[11]]; }
  // ---- raw triangles (world-space points already) and quads
  triW(a, b, c, color) {
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); this.tris++;
    const W = this.wx;
    if (!W) { for (let k = 0; k < 3; k++) this.c.push(color[0], color[1], color[2]); return; }
    // weathering (ngc/world-polish): every face a shade off its neighbours (hand-painted look, keyed on its first
    // corner so both halves of a quad agree), and grime / damp splash darkening the bottom metre towards earth brown
    let r = color[0], g = color[1], bl = color[2];
    if (W.vary) { const h = Math.sin(a[0] * 12.9898 + a[2] * 78.233 + a[1] * 37.719) * 43758.5453, k = 1 + W.vary * ((h - Math.floor(h)) - 0.5); r *= k; g *= k; bl *= k; }
    for (const v of [a, b, c]) {
      const t = (v[1] - W.y0) / W.h;
      if (t >= 1 || t < -6) { this.c.push(r, g, bl); continue; }
      const m = W.k * (1 - Math.max(0, t));
      this.c.push(r + (GRIME[0] - r) * m, g + (GRIME[1] - g) * m, bl + (GRIME[2] - bl) * m);
    }
  }
  // weathering over everything already built (same rule as triW's), for recipes that were written without it
  weatherAll(y0, h = 1.0, k = 0.3, vary = 0.06) {
    const P = this.p, Cc = this.c;
    for (let t = 0; t < P.length; t += 9) {
      let kv = 1; if (vary) { const hh = Math.sin(P[t] * 12.9898 + P[t + 2] * 78.233 + P[t + 1] * 37.719) * 43758.5453; kv = 1 + vary * ((hh - Math.floor(hh)) - 0.5); }
      for (let v = 0; v < 3; v++) {
        const o = t + v * 3, tt = (P[o + 1] - y0) / h, m = tt >= 1 ? 0 : k * (1 - Math.max(0, tt));
        for (let q = 0; q < 3; q++) { const c0 = Cc[o + q] * kv; Cc[o + q] = c0 + (GRIME[q] - c0) * m; }
      }
    }
    return this;
  }
  // weathering on for what is built next: base level y0 (world), grime band height h, strength k, face variation vary
  weather(y0, h = 1.0, k = 0.32, vary = 0.07) { this.wx = { y0, h, k, vary }; return this; }
  unweather() { this.wx = null; return this; }
  tri(a, b, c, color) { this.triW(this.at(...a), this.at(...b), this.at(...c), color); }
  quad(a, b, c, d, color) { const A = this.at(...a), B = this.at(...b), C = this.at(...c), D = this.at(...d); this.triW(A, B, C, color); this.triW(A, C, D, color); }
  quadW(A, B, C, D, color) { this.triW(A, B, C, color); this.triW(A, C, D, color); }
  // a world-space quad wound to face direction (dx, dy, dz) whatever order its corners came in
  faceW(A, B, C, D, color, dx = 0, dy = 1, dz = 0) {
    const e1x = B[0] - A[0], e1y = B[1] - A[1], e1z = B[2] - A[2], e2x = C[0] - A[0], e2y = C[1] - A[1], e2z = C[2] - A[2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    if (nx * dx + ny * dy + nz * dz >= 0) this.quadW(A, B, C, D, color); else this.quadW(D, C, B, A, color);
  }
  upW(A, B, C, D, color) { this.faceW(A, B, C, D, color, 0, 1, 0); }
  // ---- primitives (local frame). Faces wind counter-clockwise seen from outside.
  // box centred at (x, y0 + h/2, z): sits on y0. faces: bit mask to skip (1 bottom, 2 top, 4 -z, 8 +z, 16 -x, 32 +x)
  box(x, y0, z, w, h, d, color, skip = 1, topColor) {
    const x0 = x - w / 2, x1 = x + w / 2, y1 = y0 + h, z0 = z - d / 2, z1 = z + d / 2;
    if (!(skip & 2)) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], topColor || color);
    if (!(skip & 1)) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color);
    if (!(skip & 8)) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color);
    if (!(skip & 4)) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color);
    if (!(skip & 32)) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color);
    if (!(skip & 16)) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color);
    return this;
  }
  // a gable roof over a w (along x) by d (along z) box top at y0, ridge along x, height h, overhang o; gables in wall colour
  gable(x, y0, z, w, d, h, roofC, gableC, o = 0.35) {
    const x0 = x - w / 2 - o, x1 = x + w / 2 + o, z0 = z - d / 2 - o, z1 = z + d / 2 + o, yr = y0 + h, ye = y0 - o * h / (d / 2);
    this.quad([x0, ye, z1], [x1, ye, z1], [x1, yr, z], [x0, yr, z], roofC);
    this.quad([x1, ye, z0], [x0, ye, z0], [x0, yr, z], [x1, yr, z], roofC);
    // soffit: under the overhang only (ngc/interiors: it used to span the whole footprint, a dark false ceiling inside)
    const ys = ye - 0.12, sc = shade(roofC, 0.55), gx0 = x - w / 2, gx1 = x + w / 2, sof = (xa, xb, za, zb) => { if (xb - xa > 1e-3 && zb - za > 1e-3) this.quad([xa, ys, zb], [xa, ys, za], [xb, ys, za], [xb, ys, zb], sc); };
    sof(x0, x1, z1 - o, z1); sof(x0, x1, z0, z0 + o); sof(x0, gx0, z0 + o, z1 - o); sof(gx1, x1, z0 + o, z1 - o);
    if (gableC) { const gx0 = x - w / 2, gx1 = x + w / 2; this.tri([gx1, y0, z + d / 2], [gx1, y0, z - d / 2], [gx1, yr - 0.02, z], gableC); this.tri([gx0, y0, z - d / 2], [gx0, y0, z + d / 2], [gx0, yr - 0.02, z], gableC); }
    return this;
  }
  // hipped roof (four slopes), ridge along x
  hip(x, y0, z, w, d, h, roofC, o = 0.35) {
    const x0 = x - w / 2 - o, x1 = x + w / 2 + o, z0 = z - d / 2 - o, z1 = z + d / 2 + o, yr = y0 + h, ye = y0 - o * 0.5, rh = Math.max(0, (w - d) / 2);
    const ra = [x - rh, yr, z], rb = [x + rh, yr, z];
    this.quad([x0, ye, z1], [x1, ye, z1], rb, ra, roofC); this.quad([x1, ye, z0], [x0, ye, z0], ra, rb, roofC);
    this.tri([x1, ye, z1], [x1, ye, z0], rb, shade(roofC, 0.92)); this.tri([x0, ye, z0], [x0, ye, z1], ra, shade(roofC, 0.92));
    return this;
  }
  // pyramid (spires, tower caps) on a w x d base at y0
  pyramid(x, y0, z, w, d, h, color) {
    const a = [x - w / 2, y0, z - d / 2], b = [x + w / 2, y0, z - d / 2], c = [x + w / 2, y0, z + d / 2], e = [x - w / 2, y0, z + d / 2], t = [x, y0 + h, z];
    this.tri(e, c, t, color); this.tri(c, b, t, color); this.tri(b, a, t, color); this.tri(a, e, t, color); return this;
  }
  // vertical cylinder (seg sides), optional top / bottom caps; r1 = top radius
  cyl(x, y0, z, r, h, seg, color, caps = 2, r1 = r, capC) {
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      this.quad([x + c0 * r, y0, z - s0 * r], [x + c1 * r, y0, z - s1 * r], [x + c1 * r1, y0 + h, z - s1 * r1], [x + c0 * r1, y0 + h, z - s0 * r1], color);
      if (caps & 2 && r1 > 0) this.tri([x, y0 + h, z], [x + c0 * r1, y0 + h, z - s0 * r1], [x + c1 * r1, y0 + h, z - s1 * r1], capC || color);
      if (caps & 1) this.tri([x, y0, z], [x + c1 * r, y0, z - s1 * r], [x + c0 * r, y0, z - s0 * r], capC || color);
    }
    return this;
  }
  // horizontal cylinder along local x (tanks, culverts, hay bales)
  cylX(x, y, z, r, len, seg, color, capC) {
    this.push(x, y, z, 0, 0, -Math.PI / 2); this.cyl(0, -len / 2, 0, r, len, seg, color, 3, r, capC); this.pop(); return this;
  }
  // low-poly blob (tree crowns, bushes): an octahedron-ish lump with a few faces
  blob(x, y, z, rx, ry, rz, color, color2) {   // two rings and two caps: reads as a round crown from every side
    const n = 7, t = [x, y + ry, z], b = [x, y - ry * 0.75, z], up = [], mid = [], c2 = color2 || color, top = shade(color, 1.12), under = shade(color, 0.62);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, a2 = a + Math.PI / n, wob = 1 + 0.12 * Math.sin(i * 2.7 + x);
      up.push([x + Math.cos(a) * rx * 0.72 * wob, y + ry * 0.5, z + Math.sin(a) * rz * 0.72 * wob]);
      mid.push([x + Math.cos(a2) * rx * wob, y - ry * 0.12, z + Math.sin(a2) * rz * wob]);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.tri(up[j], up[i], t, top);
      this.tri(up[i], up[j], mid[i], i % 2 ? color : c2); this.tri(mid[i], up[j], mid[j], i % 2 ? c2 : color);
      this.tri(mid[j], b, mid[i], under);
    }
    return this;
  }
  // a thin strut between two local points (lattice masts, poles, rails), square section
  strut(a, b, w, color) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz); if (L < 1e-4) return this;
    const yaw = Math.atan2(-dz, dx), pitch = 0, roll = Math.atan2(dy, Math.hypot(dx, dz)) - Math.PI / 2;
    this.push(a[0], a[1], a[2], yaw, pitch, roll); this.box(0, 0, 0, w, L, w, color, 3); this.pop(); return this;
  }
  get count() { return this.p.length / 3; }
  // out: { pos: Float32Array, nrm: Int8Array (normalised), col: Uint8Array (normalised, linear) }
  build() {
    const n = this.p.length / 3, pos = new Float32Array(this.p), nrm = new Int8Array(n * 3), colA = new Uint8Array(n * 3);
    for (let t = 0; t < n; t += 3) {
      const o = t * 3, ax = pos[o + 3] - pos[o], ay = pos[o + 4] - pos[o + 1], az = pos[o + 5] - pos[o + 2], bx = pos[o + 6] - pos[o], by = pos[o + 7] - pos[o + 1], bz = pos[o + 8] - pos[o + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 3; k++) { nrm[o + k * 3] = Math.round(nx * 127); nrm[o + k * 3 + 1] = Math.round(ny * 127); nrm[o + k * 3 + 2] = Math.round(nz * 127); }
    }
    for (let i = 0; i < n * 3; i++) colA[i] = Math.max(0, Math.min(255, Math.round(Math.sqrt(this.c[i]) * 255)));   // stored as sqrt (more precision in the darks), squared back in the shader
    return { pos, nrm, col: colA, tris: this.tris };
  }
}
