// RW-1 STRIDER far level of detail (ngc/rwground-polish): every STRIDER past the close-up range drawn by FOUR instanced
// meshes for the whole war (body, seams, left leg, right leg) instead of ~26 draw calls per machine - and the far
// machines that only move kinematically (groundsim's 'lite' battles) are seen at all.
// The silhouette is the close model's, simplified: forward-leaning carapace over a hip block, the wedge sensor head, the
// rifle held across the body, digitigrade legs (thigh forward, shin back to a raised hock, long metatarsal). The legs
// swing at the hips with the gait (step rate from the sim's walk / run figures); the body glides level (the machines
// don't bob). A machine that is down lies on its side; a destroyed one is dark (no seams).
// API: const L = createStriderLOD(parent, max)
//      L.begin(); L.add(id, x, y, z, yaw, speed, state, dt) ... ; L.end()      state: 'up' | 'down' | 'dead'
//      L.dispose()
import * as THREE from 'three';
import { Kit, RW, rwMats } from './rwkit.js';
import { STRIDER } from './strider.js';

const C = RW, HIP_Y = STRIDER.PELVIS_H;
// a box from a to b (local +y along the segment), w x d
function seg(k, a, b, w, d, color) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), L = dir.length();
  const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()), new THREE.Vector3(1, 1, 1));
  return k.add(new THREE.BoxGeometry(w, L, d), color, m);
}
function bodyKit() {
  // origin on the ground under the pelvis, -z forward
  const k = new Kit(), y = HIP_Y;
  k.box(0.32, 0.14, 0.18, 0, y, 0, C.composite);                                         // hip block
  k.taper(0.3, 0.22, 0.48, 0.3, 0.5, 0.0, y + 0.08, -0.02, C.ceramic, [-0.08, 0, 0], 0.02, -0.05);   // carapace, leaning in
  k.box(0.26, 0.3, 0.14, 0, y + 0.38, 0.17, C.composite);                                // power cell
  k.taper(0.18, 0.2, 0.13, 0.16, 0.12, 0.26, y + 0.5, 0, C.ceramic2, [0, 0, -0.3]);      // right pauldron
  k.box(0.02, 0.3, 0.02, -0.2, y + 0.75, 0.07, C.composite);                             // sensor mast
  k.taper(0.19, 0.14, 0.12, 0.09, 0.38, 0, y + 0.82, 0.16, C.ceramic, [-Math.PI / 2, 0, 0]);   // sensor head wedge
  k.box(0.12, 0.06, 0.03, 0, y + 0.82, -0.23, C.lensDark);
  // arms down to the rifle held across the body, the rifle itself
  seg(k, [0.26, y + 0.5, 0], [0.18, y + 0.22, -0.2], 0.07, 0.07, C.composite2);
  seg(k, [-0.26, y + 0.5, 0], [-0.08, y + 0.3, -0.35], 0.06, 0.06, C.composite2);
  k.box(0.06, 0.09, 0.85, 0.06, y + 0.3, -0.38, C.coyote, [0.05, 0.12, 0]);
  return k;
}
function bodyGlowKit() {
  const k = new Kit(), y = HIP_Y;
  k.glowBox(0.04, 0.04, 0.01, -0.03, y + 0.82, -0.25);       // the lit main lens
  k.glowBox(0.012, 0.22, 0.012, 0.012, y + 0.36, -0.2);      // sternum seam
  k.glowBox(0.16, 0.012, 0.012, 0, y + 0.1, -0.12);          // gyro collar line
  return k;
}
// one leg, hip at the origin, standing straight under it (the pose's swing is the instance's hip rotation)
function legKit() {
  const k = new Kit(), toe = [0, -HIP_Y + 0.02, -0.06], hock = [0, toe[1] + STRIDER.HOCK_UP, toe[2] + STRIDER.HOCK_BACK];
  // the knee: THIGH from the hip and SHIN from the hock, on the forward side
  const dx = hock[2], dy = hock[1], D = Math.hypot(dx, dy), a = (STRIDER.THIGH ** 2 - STRIDER.SHIN ** 2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, STRIDER.THIGH ** 2 - a * a));
  const ux = dx / D, uy = dy / D, knee = [0, uy * a + ux * h, ux * a - uy * h];
  if (knee[2] > 0) { knee[1] = uy * a - ux * h; knee[2] = ux * a + uy * h; }
  seg(k, [0, 0, 0], knee, 0.11, 0.1, C.ceramic);
  seg(k, knee, hock, 0.07, 0.07, C.composite2);
  seg(k, hock, toe, 0.05, 0.06, C.composite);
  k.box(0.12, 0.05, 0.26, 0, toe[1], toe[2] - 0.06, C.composite2);
  k.sphere(0.06, 0, knee[1], knee[2], C.joint, 1, 1, 1, 6, 4);
  return k;
}

export function createStriderLOD(parent, max = 128) {
  const M = rwMats();
  const bodyG = bodyKit().geometry(), legG = legKit().geometry();
  const glowK = bodyGlowKit(); const glowG = (() => { const g = new Kit(); g.parts = glowK.glow; return g.geometry(); })();
  const meshes = {
    body: new THREE.InstancedMesh(bodyG, M.body, max), glow: new THREE.InstancedMesh(glowG, M.glow, max),
    legL: new THREE.InstancedMesh(legG, M.body, max), legR: new THREE.InstancedMesh(legG, M.body, max),
    dead: new THREE.InstancedMesh(bodyG, M.burnt ?? M.body, max), deadLeg: new THREE.InstancedMesh(legG, M.burnt ?? M.body, max * 2),
  };
  const group = new THREE.Group(); group.name = 'striderLOD';
  for (const [n, m] of Object.entries(meshes)) { m.name = 'striderLOD.' + n; m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(m); }
  parent.add(group);
  const phase = new Map(), seen = new Set();
  const _b = new THREE.Matrix4(), _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t = new THREE.Matrix4();
  let n = 0, nd = 0, ndl = 0;
  const L = {
    group, meshes,
    get count() { return n + nd; },
    begin() { n = nd = ndl = 0; seen.clear(); },
    add(id, x, y, z, yaw, speed, state, dt) {
      _b.makeRotationY(yaw).setPosition(x, y, z);
      seen.add(id);
      if (state !== 'up') {
        // down: on its side across the ground (the fallen machine's pose is the sim's; this is the far stand-in)
        if (nd >= max) return;
        const roll = (id % 2 ? 1 : -1) * 1.45;
        _m.copy(_b).multiply(_t.makeTranslation(0, 0.22, 0)).multiply(_r.makeRotationZ(roll)).multiply(_t.makeTranslation(0, -HIP_Y * 0.5, 0));
        (state === 'dead' ? meshes.dead : meshes.body).setMatrixAt(state === 'dead' ? nd : n, _m);
        if (state === 'dead') {
          nd++;
          for (const s of [-1, 1]) { _r.makeTranslation(s * STRIDER.HIP_HALF, HIP_Y, 0).multiply(_t.makeRotationX(s * 0.5)); meshes.deadLeg.setMatrixAt(ndl++, _t.multiplyMatrices(_m, _r)); }
        } else {
          if (n >= max) return;
          _r.makeTranslation(-STRIDER.HIP_HALF, HIP_Y, 0).multiply(_t.makeRotationX(0.6)); meshes.legL.setMatrixAt(n, _t.multiplyMatrices(_m, _r));
          _r.makeTranslation(STRIDER.HIP_HALF, HIP_Y, 0).multiply(_t.makeRotationX(-0.3)); meshes.legR.setMatrixAt(n, _t.multiplyMatrices(_m, _r));
          meshes.glow.setMatrixAt(n, _m); n++;
        }
        return;
      }
      if (n >= max) return;
      // the gait: step rate from the sim's figures (walk 1.6 m/s at 100 steps / min, run 4.6 at 210): a full stride is
      // two steps; swing amplitude grows with speed
      const sp = Math.min(5, Math.max(0, speed)), stepHz = sp < 0.15 ? 0 : 100 / 60 + (sp - STRIDER.WALK) / (STRIDER.RUN - STRIDER.WALK) * (210 - 100) / 60;
      const ph = (phase.get(id) || 0) + Math.PI * Math.max(0, stepHz) * dt; phase.set(id, ph % (Math.PI * 2));
      const amp = Math.min(0.55, sp * 0.14), sw = Math.sin(ph) * amp;
      meshes.body.setMatrixAt(n, _b); meshes.glow.setMatrixAt(n, _b);
      _r.makeTranslation(-STRIDER.HIP_HALF, HIP_Y, 0).multiply(_t.makeRotationX(sw)); meshes.legL.setMatrixAt(n, _m.multiplyMatrices(_b, _r));
      _r.makeTranslation(STRIDER.HIP_HALF, HIP_Y, 0).multiply(_t.makeRotationX(-sw)); meshes.legR.setMatrixAt(n, _m.multiplyMatrices(_b, _r));
      n++;
    },
    end() {
      meshes.body.count = meshes.glow.count = meshes.legL.count = meshes.legR.count = n; meshes.dead.count = nd; meshes.deadLeg.count = ndl;
      for (const m of Object.values(meshes)) { m.visible = m.count > 0; if (m.visible) m.instanceMatrix.needsUpdate = true; }
      if (phase.size > seen.size + 64) for (const id of [...phase.keys()]) if (!seen.has(id)) phase.delete(id);
    },
    dispose() { parent.remove(group); for (const m of Object.values(meshes)) m.dispose(); },
  };
  return L;
}
