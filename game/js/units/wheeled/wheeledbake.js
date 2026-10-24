// wheeledbake.js - one merged, vertex-coloured mesh from a wheeled-vehicle model (ngc/wheeledgame), for
//   - the far level of detail of parked / driven vehicles (one draw call instead of ~30), and
//   - the WORLD's instanced traffic (ambient.js setModel: { geometry, length } with an aPaint attribute marking the paint,
//     so each instance gets its own colour): the traffic is the same 1980 cars you can drive.
//   bakeModel(group, { paint, flip, srgb }) -> BufferGeometry (position, normal, color, aPaint)
// paint: the material colour (hex) that is the body paint; flip: turn 180 deg (the WORLD's traffic faces +z, our models
// -z); srgb: colours as sRGB (the WORLD's instanced shader squares them), else linear (a plain MeshLambertMaterial).
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _c = new THREE.Color(), _flip = new THREE.Matrix4().makeRotationY(Math.PI);
const visibleChain = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

export function bakeModel(group, { paint = null, flip = false, srgb = false, skip = null } = {}) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const P = [], N = [], C = [], A = [];
  group.traverse(o => {
    if (!o.isMesh || !o.geometry || !visibleChain(o) || (skip && skip(o))) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const m0 = mats[0]; if (!m0 || m0.map || (m0.opacity !== undefined && m0.opacity < 0.05)) return;
    let g = o.geometry; if (g.index) g = g.toNonIndexed();
    const pos = g.attributes.position, nrm = g.attributes.normal, vc = m0.vertexColors && g.attributes.color ? g.attributes.color : null;
    _m.multiplyMatrices(inv, o.matrixWorld); if (flip) _m.premultiply(_flip);
    _n.getNormalMatrix(_m);
    const glass = m0.transparent;
    _c.copy(m0.color || _c.set(0x888888)); if (glass) _c.multiplyScalar(0.45);
    const isPaint = paint !== null && !glass && (m0.color && m0.color.getHex() === new THREE.Color(paint).getHex());
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(_m); P.push(v.x, v.y, v.z);
      if (nrm) { n.fromBufferAttribute(nrm, i).applyMatrix3(_n).normalize(); N.push(n.x, n.y, n.z); } else N.push(0, 1, 0);
      let r = _c.r, gg = _c.g, b = _c.b;
      if (vc) { r *= vc.getX(i); gg *= vc.getY(i); b *= vc.getZ(i); }
      if (srgb) { r = Math.sqrt(Math.max(0, r)); gg = Math.sqrt(Math.max(0, gg)); b = Math.sqrt(Math.max(0, b)); }
      C.push(r, gg, b); A.push(isPaint ? 1 : 0);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('aPaint', new THREE.Float32BufferAttribute(A, 1));
  geo.computeBoundingSphere();
  return geo;
}
