// RW-3 WASP exterior: a RUNAWAY ducted-fan attack drone. Per the bible: sleek, asymmetric, matte ceramic and dark
// composite, pale cyan / white seams, no windows - a sensor cluster for a head; uncanny.
// Design: the body IS the shroud - a low, lens-section ceramic disc with a hard knife rim round two counter-rotating
// fans (seen through a fine stator grille). Nothing is centred: a long tapered spine reaches out forward-left from the
// rim and carries the sensor cluster - eight dark lenses of different sizes, each with a pinpoint of cold light, like a
// spider's eyes - that jerks to its target in saccades; a thin antenna blade sweeps back off the right rim; the
// weapon hangs under the disc on a two-segment composite arm that unfolds forward like a wasp's sting; three thin
// two-jointed legs fold flush under the rim. ~3.3 m across the spine, 2.5 m disc.
// Local frame: x right, y up, nose -z, origin at the CG; feet at y = -0.95.
// API: buildWaspMesh() -> { group, animate(S, dt, time), MUZZLE (local), parts }
import * as THREE from 'three';
import { M, B, V, clamp, merge, cylZ, cylY, boxG, sphG, mesh, group, rodG, bucket } from './modelkit.js';

export const WASPM = { FEET: -0.95, R_IN: 0.76, R_OUT: 1.25 };
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _m = new THREE.Matrix4();

export function buildWaspMesh() {
  const g = new THREE.Group(); g.name = 'wasp';
  const ceramicM = M(0xe9e7e0, { shininess: 4 }), ceramic2M = M(0xcfcdc5, { shininess: 4 }), compM = M(0x1d2023, { shininess: 26 }), comp2M = M(0x2c3034, { shininess: 26 });
  const lensM = M(0x07080a, { shininess: 120, specular: 0x6a8a90 }), seamM = B(0xd8fbff), cyanM = B(0x7ff6ff), pinM = B(0xbff9ff);
  const body = bucket();

  // ---- the disc: a lathed lens section (thin at the knife rim, thicker at the duct lip), duct bore, grille, fans
  const prof = [[0.76, -0.3], [0.78, -0.1], [0.77, 0.12], [0.82, 0.22], [0.95, 0.26], [1.1, 0.2], [1.22, 0.07], [1.27, 0.0], [1.22, -0.07], [1.08, -0.16], [0.92, -0.26], [0.8, -0.32], [0.76, -0.3]];
  mesh(new THREE.LatheGeometry(prof.slice().reverse().map(([r, y]) => new THREE.Vector2(r, y)), 48), ceramicM, g, 'shroud');   // (profile run so the normals face out)
  mesh(new THREE.CylinderGeometry(0.765, 0.765, 0.44, 48, 1, true).translate(0, -0.06, 0), M(0x121416, { side: THREE.BackSide }), g, 'bore');
  // seams: a hair-thin white line on the knife rim, a cyan one on the lip; dark panel breaks (irregular: machine-cut)
  mesh(new THREE.TorusGeometry(1.27, 0.008, 3, 64).rotateX(Math.PI / 2), seamM, g, 'rimSeam');
  mesh(new THREE.TorusGeometry(0.97, 0.01, 3, 48).rotateX(Math.PI / 2).translate(0, 0.255, 0), cyanM, g, 'lipSeam');
  for (const a of [0.3, 1.1, 1.45, 2.6, 3.9, 4.25, 5.5]) body.add(boxG(0.012, 0.06, 0.42, 0, 0, 0).rotateY(-a).translate(Math.cos(a) * 1.0, 0.205, Math.sin(a) * 1.0), compM);
  // composite underside plate (asymmetric) and the grille over the fans
  body.add(new THREE.CylinderGeometry(1.05, 0.9, 0.06, 40, 1, false, 0.4, 4.2).translate(0, -0.3, 0), comp2M);
  for (let k = 0; k < 18; k++) body.add(boxG(1.52, 0.012, 0.022, 0, 0.13, 0).rotateY(k / 18 * Math.PI), compM);
  const fans = [0.06, -0.1].map((y, i) => { const f = group(g, 'fan', 0, y, 0), fb = bucket(); for (let k = 0; k < 9; k++) fb.add(boxG(0.62, 0.02, 0.12, 0.42, 0, 0).rotateX(i ? -0.42 : 0.42).rotateY(k / 9 * Math.PI * 2), M(0x2f3337, { shininess: 40 })); fb.flush(f, 'blades'); return f; });
  body.add(cylY(0.17, 0.2, 0.42, 14).translate(0, -0.04, 0), compM); body.add(sphG(0.17, 0, 0.17, 0, 1, 0.5, 1, 12, 6), ceramic2M);
  // exit vanes: two stages, crossed, fine blades (animated)
  const vanes = { pitch: [], roll: [] };
  for (const [axis, list, y] of [['x', vanes.pitch, -0.36], ['z', vanes.roll, -0.44]]) for (const o of [-0.4, -0.13, 0.13, 0.4]) {
    const v = group(g, 'vane', axis === 'x' ? 0 : o, y, axis === 'x' ? o : 0), Lv = 2 * Math.sqrt(0.74 * 0.74 - o * o); mesh(boxG(axis === 'x' ? Lv : 0.02, 0.1, axis === 'x' ? 0.02 : Lv), compM, v); list.push(v);
  }

  // ---- the spine and the sensor cluster (forward-left, off-centre)
  const spineA = -2.2;   // leaves the rim forward-left
  const rimX = Math.cos(spineA) * 1.2, rimZ = Math.sin(spineA) * 1.2;
  { const sp = [[rimX, 0.02, rimZ], [-0.95, 0.06, -1.55], [-0.78, 0.1, -2.05]];
    body.add(rodG(sp[0], sp[1], 0.16, 6), comp2M); body.add(rodG(sp[1], sp[2], 0.12, 6), compM);
    body.add(boxG(0.03, 0.02, 0.9, 0, 0, 0).translate(-0.98, 0.15, -1.6).rotateY(0), seamM); }
  const head = group(g, 'sensors', -0.78, 0.1, -2.12);
  { const hb = bucket(); hb.add(new THREE.OctahedronGeometry(0.2, 0).scale(1.0, 0.75, 1.3), compM); hb.add(boxG(0.22, 0.05, 0.22, 0, 0.12, 0.05).rotateY(0.6), ceramicM); hb.flush(head, 'sensorHousing'); }
  const EYES = [[0, 0.02, -0.24, 0.07], [0.1, 0.07, -0.2, 0.045], [-0.1, 0.06, -0.21, 0.04], [0.06, -0.06, -0.21, 0.035], [-0.07, -0.05, -0.2, 0.03], [0.14, -0.01, -0.15, 0.025], [-0.14, 0.0, -0.15, 0.022], [0.0, 0.11, -0.16, 0.02]];
  const pins = [];
  for (const [x, y, z, r] of EYES) { mesh(sphG(r, x, y, z, 1, 1, 0.7, 10, 6), lensM, head, 'eye'); const p = mesh(sphG(r * 0.22, x, y + r * 0.25, z - r * 0.62, 1, 1, 1, 5, 3), pinM, head, 'pin'); pins.push(p); }
  // antenna blade off the right-rear rim
  body.add(new THREE.ConeGeometry(0.02, 1.3, 4).rotateX(Math.PI / 2 - 0.2).translate(1.12, 0.15, 1.05), compM);
  body.add(boxG(0.02, 0.12, 0.5, 1.06, 0.03, 0.75).rotateY(-0.4), comp2M);

  // ---- the sting: a two-segment arm under the disc, folding forward, the emitter at its tip
  const sting = group(g, 'sting', 0.18, -0.36, 0.55), seg1 = group(sting, 'seg1'), elbow = group(seg1, 'elbow', 0, 0, 0.75), seg2 = group(elbow, 'seg2');
  { const s1 = bucket(); s1.add(new THREE.OctahedronGeometry(0.09, 0).scale(1, 1, 5).translate(0, 0, 0.36), compM); s1.add(sphG(0.07), comp2M); s1.flush(seg1, 'seg1Parts'); }
  { const s2 = bucket(); s2.add(new THREE.OctahedronGeometry(0.08, 0).scale(1, 1, 6.5).translate(0, 0, -0.45), compM); s2.add(boxG(0.1, 0.02, 0.4, 0, 0.06, -0.4), ceramic2M); s2.add(sphG(0.06), comp2M); s2.flush(seg2, 'seg2Parts'); }
  const emitter = mesh(sphG(0.05, 0, 0, -0.98, 1, 1, 1, 8, 5), cyanM, seg2, 'emitter');
  const flashM = B(0xdffcff, { transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const flash = mesh(merge([new THREE.PlaneGeometry(0.3, 0.8).rotateX(Math.PI / 2), new THREE.PlaneGeometry(0.3, 0.8).rotateX(Math.PI / 2).rotateZ(Math.PI / 2)]).translate(0, 0, -1.35), flashM, seg2, 'pulseFlash');

  // ---- legs: three thin two-jointed legs; they fold up flush under the rim in flight
  const legs = [-1.6, 0.35, 2.4].map(a => {
    const L = group(g, 'leg', Math.cos(a) * 0.95, -0.24, Math.sin(a) * 0.95); L.rotation.y = -a - Math.PI / 2;
    const knee = group(L, 'knee', 0, 0, 0); const lb = bucket(); lb.add(rodG([0, 0, 0], [0, -0.05, 0.45], 0.035, 4), compM); lb.flush(knee, 'thigh');
    const shin = group(knee, 'shin', 0, -0.05, 0.45); const sb = bucket(); sb.add(rodG([0, 0, 0], [0, -0.66, 0.05], 0.025, 4), compM); sb.add(sphG(0.035, 0, -0.67, 0.05), ceramic2M); sb.flush(shin, 'shinParts');
    return { L, knee, shin };
  });
  body.flush(g, 'airframe');

  // ---- animation. S: { fan 0..1, pitch, roll (vane cmds), aim: world Vector3 | null, firing, gear 0..1, alert 0..1 }
  let psi = 0, hy = 0, hp = 0, sy = 0, sx = 0, sacc = 0, tY = 0, tP = 0, idleT = 0;
  const MUZZLE = V(0.18, -0.92, 0.0);
  function animate(S = {}, dt = 0, time = 0) {
    const fan = S.fan ?? 0.6; psi += fan * 95 * dt; fans[0].rotation.y = psi; fans[1].rotation.y = -psi * 1.07;
    for (const v of vanes.pitch) v.rotation.x = clamp(S.pitch ?? 0, -1, 1) * 0.5 + Math.sin(time * 13 + v.position.z * 9) * 0.02;   // a constant faint flutter
    for (const v of vanes.roll) v.rotation.z = -clamp(S.roll ?? 0, -1, 1) * 0.5 + Math.sin(time * 11 + v.position.x * 7) * 0.02;
    // aim in the body frame
    let aY = 0, aP = -0.15, has = false;
    if (S.aim && S.aim.lengthSq() > 0.01) {
      g.updateMatrixWorld(); _q.setFromRotationMatrix(_m.extractRotation(g.matrixWorld)).invert(); _v.copy(S.aim).normalize().applyQuaternion(_q);
      aY = clamp(Math.atan2(-_v.x, -_v.z), -1.4, 1.4); aP = clamp(Math.asin(clamp(_v.y, -1, 1)), -1.0, 0.6); has = true;
    }
    // the sensor cluster moves in saccades: still, then a snap to a new fix (on the target, or a random look-round)
    sacc -= dt;
    if (sacc <= 0) { sacc = has ? 0.25 + Math.random() * 0.35 : 0.6 + Math.random() * 1.6; tY = has ? aY : (Math.random() - 0.5) * 1.6; tP = has ? aP : -0.1 + (Math.random() - 0.5) * 0.4; }
    const ks = 1 - Math.exp(-40 * dt); hy += (tY - hy) * ks; hp += (tP - hp) * ks; head.rotation.set(hp, hy, 0, 'YXZ');
    // the sting unfolds toward its target, folds back when there is none
    const unf = has ? 1 : 0, k = 1 - Math.exp(-6 * dt); sy += (aY - sy) * k; sx += ((has ? aP : -0.2) - sx) * k;
    // seg1 hangs back-and-down (more when it strikes), seg2 points forward: tucked level under the disc, or on the aim
    sting.rotation.set(0, sy * 0.8 * unf, 0); seg1.rotation.x = 0.3 + 0.5 * unf; elbow.rotation.x = (unf ? clamp(sx, -1.0, 0.35) : -0.04) - seg1.rotation.x; seg2.rotation.x = 0;
    const fire = !!S.firing; flash.visible = fire && ((time * 23) % 1) < 0.45; if (flash.visible) flash.scale.setScalar(0.7 + ((time * 41) % 1) * 0.6);
    emitter.scale.setScalar(fire ? 1.8 : 1);
    // eyes: the pinpoints breathe slowly, and burn when it fires or locks
    const glow = 0.5 + 0.22 * Math.sin(time * 1.3) + 0.35 * (S.alert ?? 0);
    pinM.color.setRGB(Math.min(1, 0.55 * glow + (fire ? 0.45 : 0)), Math.min(1, 0.9 * glow + (fire ? 0.1 : 0)), Math.min(1, 1.0 * glow + 0.05));
    seamM.color.setHSL(0.52, 0.9, 0.82 + 0.1 * Math.sin(time * 0.9)); cyanM.color.setHSL(0.51, 1, 0.55 + 0.12 * Math.sin(time * 2.3 + 1));
    // legs: fold flush in flight, reach down for the ground
    const gr = clamp(S.gear ?? 0, 0, 1); for (const l of legs) { l.knee.rotation.x = (1 - gr) * 0.4; l.shin.rotation.x = (1 - gr) * -1.45; }
  }
  animate({});
  return { group: g, animate, MUZZLE, parts: { fans, vanes, head, sting, legs } };
}
