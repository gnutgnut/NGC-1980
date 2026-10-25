// BGM-109G GRYPHON ground-launched cruise missile, visual only (house style: flat-shaded, colours from materials).
// 6.25 m long with the booster, 0.52 m body: the cruise body (5.56 m) with a rounded nose, the ventral turbofan inlet
// scoop (extends after the boost), two mid-body wings that swing out of their slots, four cruciform tail fins that
// spring out of their slots, and the short solid booster at the tail with its flame.
// Same contract as rwmodel.js buildShahedModel: { group, animate(D, dt) }; D.t = seconds since launch.
//   t < 2.5       booster on, flame flickers
//   t 0.5 - 1.0   tail fins unfold
//   t 2.5 - 3.5   booster gone, wings swing out, inlet extends
// Local frame: +x right, +y up, nose along -z, origin at the middle of the 6.25 m (booster attached).
import * as THREE from 'three';
import { M, V, slab, cylZ, boxG, mesh, addM, canvasTex, decal } from './meshkit.js';

const R = 0.26, Z_NOSE = -3.125, Z_BODY_END = 2.435, Z_END = 3.125;
const smooth = (a, b, t) => THREE.MathUtils.smoothstep(t, a, b);
const stTex = (txt, col = '#1b1e22') => canvasTex('glcm' + txt, 256, 32, (x, w, h) => { x.clearRect(0, 0, w, h); x.font = 'bold 22px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = col; x.fillText(txt, w / 2, h / 2); });

export function buildGLCMModel() {
  const g = new THREE.Group(); g.name = 'glcm';
  const bodyM = M(0xdfe0dc), noseM = M(0xeeeeea), darkM = M(0x2a2c2e), blackM = M(0x101112, { shininess: 5 }), greyM = M(0x9a9fa3);
  const yelM = M(0xd2a92a), brownM = M(0x6e4a2c), boostM = M(0xc9cac4), metalM = M(0x55595d, { shininess: 50 });
  // ---- body: nose ogive (lathe), the cylinder, the tapered tail cone to the engine exhaust
  const nose = [];
  for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2; nose.push(new THREE.Vector2(R * Math.sin(a), Z_NOSE + 0.62 - 0.62 * Math.cos(a))); }
  mesh(new THREE.LatheGeometry(nose, 16).rotateX(Math.PI / 2), noseM, g, 'nose');
  mesh(cylZ(R, R, 4.35, 16).translate(0, 0, Z_NOSE + 0.62 + 2.175), bodyM, g, 'body');
  mesh(cylZ(R, 0.19, 0.59, 16).translate(0, 0, Z_BODY_END - 0.295), bodyM, g, 'tailCone');
  // bands: the yellow warhead band, a seam ring at the wing box, panel lines
  mesh(cylZ(R + 0.004, R + 0.004, 0.08, 16, true).translate(0, 0, -1.9), yelM, g, 'warheadBand');
  for (const z of [-1.2, 0.55, 1.6]) mesh(cylZ(R + 0.003, R + 0.003, 0.015, 16, true).translate(0, 0, z), greyM, g, 'seam');
  mesh(boxG(0.012, 0.012, 3.6, 0, R + 0.002, -0.4), greyM, g, 'spine');
  // stencils on the sides
  for (const s of [-1, 1]) { const d = decal(stTex('BGM-109G'), 0.9, 0.11, g, 'stencil'); d.position.set(s * (R + 0.004), 0.05, -1.0); d.rotation.y = s * Math.PI / 2; }
  { const d = decal(stTex('U.S. AIR FORCE'), 1.1, 0.13, g, 'stencilTop'); d.position.set(0, R + 0.004, 0.2); d.rotation.set(-Math.PI / 2, 0, Math.PI / 2); }
  // ---- wings: stowed inside the body pointing aft, swing out about vertical pivots (one above the other, like the real one)
  const wings = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(0, s * 0.03, -0.25); g.add(p);
    mesh(slab([[0.0, -0.15, .035], [1.31, -0.1, .022], [1.31, 0.12, .02], [0.0, 0.16, .035]], (a, b, w) => [s * a, w, b]), bodyM, p, 'wing');
    mesh(boxG(0.03, 0.025, 0.24, s * 1.3, 0, 0.01), darkM, p, 'wingTip');
    wings.push({ p, s });
    mesh(boxG(0.012, 0.03, 0.34, s * (R - 0.004), s * 0.03, -0.25), blackM, g, 'wingSlot');
  }
  // ---- ventral inlet scoop: a flush door that drops into a scoop
  const inlet = new THREE.Group(); inlet.position.set(0, -R + 0.02, 0.85); g.add(inlet);
  mesh(slab([[-0.45, 0.02, 0.28], [-0.45, -0.15, 0.28], [-0.25, -0.155, 0.28], [0.5, 0.02, 0.28]], (z, y, w) => [w, y, z]), bodyM, inlet, 'scoop');
  mesh(new THREE.PlaneGeometry(0.22, 0.12).rotateY(Math.PI).translate(0, -0.075, -0.452), blackM, inlet, 'inletMouth');
  mesh(boxG(0.3, 0.012, 0.04, 0, -0.152, -0.43), greyM, inlet, 'scoopLip');
  // ---- tail: four fins in an X, stowed inside the tail section, sprung out through slots
  const fins = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, hinge = new THREE.Group(); hinge.rotation.z = a; g.add(hinge);
    const fold = new THREE.Group(); fold.position.set(0, R - 0.01, 0); hinge.add(fold);
    mesh(slab([[0, 1.25, .03], [0.36, 1.55, .02], [0.36, 1.78, .018], [0, 1.84, .03]], (h, z, w) => [w, h, z]), bodyM, fold, 'fin');
    fins.push(fold);
    mesh(boxG(0.014, 0.012, 0.6, 0, R - 0.003, 1.545), blackM, hinge, 'finSlot');
  }
  mesh(cylZ(0.15, 0.13, 0.08, 12).translate(0, 0, Z_BODY_END + 0.02), darkM, g, 'exhaust');
  // ---- booster: a short solid motor on an interstage, the nozzle, the flame
  const boost = new THREE.Group(); boost.name = 'booster'; g.add(boost);
  mesh(cylZ(0.2, R, 0.12, 16).translate(0, 0, Z_BODY_END + 0.06), metalM, boost, 'interstage');
  mesh(cylZ(R, R, 0.46, 16).translate(0, 0, Z_BODY_END + 0.35), boostM, boost, 'motor');
  mesh(cylZ(R + 0.004, R + 0.004, 0.06, 16, true).translate(0, 0, Z_BODY_END + 0.3), brownM, boost, 'motorBand');
  mesh(cylZ(R, 0.14, 0.1, 16).translate(0, 0, Z_BODY_END + 0.63), metalM, boost, 'aftDome');
  mesh(cylZ(0.12, 0.17, 0.14, 12, true).translate(0, 0, Z_END - 0.07), darkM, boost, 'nozzle');
  mesh(new THREE.CircleGeometry(0.12, 12).translate(0, 0, Z_END - 0.12), blackM, boost, 'throat');
  const flameM = addM(0xffc070), coreM = addM(0xfff4d0);
  const flame = mesh(new THREE.ConeGeometry(0.17, 1, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5), flameM, boost, 'flame'); flame.position.z = Z_END - 0.01;
  const core = mesh(new THREE.ConeGeometry(0.1, 1, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5), coreM, boost, 'flameCore'); core.position.z = Z_END - 0.01;
  let time = 0;
  function animate(D = {}, dt = 0) {
    const t = D.t ?? 0; time += dt;
    const boosting = t < 2.5; boost.visible = boosting; flame.visible = core.visible = t > 0;
    if (boosting) {
      const f = 1 + 0.12 * Math.sin(time * 53) + 0.08 * Math.sin(time * 91 + 1.3), L = 2.6 * f * (t < 0.15 ? t / 0.15 : 1);
      flame.scale.set(f, f, Math.max(0.01, L)); core.scale.set(1, 1, Math.max(0.01, L * 0.55));
      flameM.opacity = 0.32; coreM.opacity = 0.55;
    }
    const fu = smooth(0.5, 1.0, t), wu = smooth(2.5, 3.5, t);
    for (const f of fins) f.position.y = R - 0.01 - 0.37 * (1 - fu);    // stowed inside the tail section -> sprung out
    for (const w of wings) w.p.rotation.y = -w.s * (1 - wu) * Math.PI / 2;   // aft along the body -> straight out
    inlet.position.y = -R + 0.02 + 0.13 * (1 - wu); inlet.visible = true;
  }
  animate({ t: 0 });
  return { group: g, animate, nozzles: [V(0, 0, Z_END + 0.05)], parts: { wings, fins, inlet, booster: boost } };
}
