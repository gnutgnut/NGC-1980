// RW-1 STRIDER exterior model: a 2.05 m machine soldier on digitigrade legs. Rigid segments (merged, vertex-coloured,
// one draw call each + an unlit seam mesh) posed every frame from the sim's S.pose() (joints come from strider.js IK).
// Look (BIBLE): matte ceramic plates over dark composite, pale cyan seams, no face - an asymmetric sensor cluster for
// a head, a sensor mast on the left shoulder, an armoured right shoulder for the weapon side. Wear: dirt on the shins
// and feet, scuffed plate edges. Weapons: a seized XM7 (6.8x51, coyote, XM157 optic, suppressor) with a RUNAWAY sensor
// puck and cyan IFF strip bolted on, or the RW coil carbine.
// API: buildStrider({ weapon: 'xm7' | 'coil', tag }) -> { group, update(S, dt, time), parts, setLit(on) }
import * as THREE from 'three';
import { Kit, RW, rwMats, placeSeg, placeBasis, stencilTex, decal, setBodyMat } from './rwkit.js';
import { STRIDER } from './strider.js';

const C = RW, META_L = Math.hypot(STRIDER.HOCK_UP, STRIDER.HOCK_BACK);
function pelvisKit() {
  const k = new Kit();
  k.box(0.30, 0.12, 0.17, 0, 0, 0, C.composite);                         // hip block
  k.box(0.18, 0.1, 0.05, 0, -0.02, -0.1, C.ceramic2, [0.25, 0, 0]);       // groin plate
  for (const s of [-1, 1]) {
    k.cyl(0.07, 0.07, 0.09, 10, s * 0.15, 0, 0, C.joint, [0, 0, Math.PI / 2]);   // hip actuators (axis x)
    k.cyl(0.072, 0.072, 0.02, 10, s * 0.2, 0, 0, C.ceramic, [0, 0, Math.PI / 2]);
    k.glowDisc(0.022, s * 0.211, 0, 0, [0, s * Math.PI / 2, 0], 8);
  }
  return k;
}
function torsoKit(tag) {
  const k = new Kit();
  // waist gyro (the 'stomach' part): a dark sphere in a collar, seam ring
  k.sphere(0.085, 0, 0.1, 0.01, C.composite2, 1, 0.9, 1, 10, 7);
  k.cyl(0.1, 0.1, 0.035, 12, 0, 0.1, 0.01, C.joint);
  // exposed spine: segmented composite column up the back
  for (let i = 0; i < 6; i++) k.box(0.07 - i * 0.002, 0.045, 0.06, 0, 0.08 + i * 0.065, 0.1, i % 2 ? C.composite : C.composite2);
  // chest carapace: tapered, leaning forward, shifted to the right (asymmetric: the weapon side is armoured)
  k.taper(0.27, 0.2, 0.46, 0.27, 0.32, 0.015, 0.17, -0.01, C.ceramic, [0.06, 0, 0], 0.02, -0.03);
  k.taper(0.2, 0.06, 0.34, 0.05, 0.26, 0.012, 0.19, -0.135, C.ceramic2, [-0.18, 0, 0]);           // sternum plate (angled)
  k.box(0.04, 0.2, 0.02, -0.07, 0.34, -0.17, C.composite, [-0.18, 0, 0]);                         // plate gap (dark)
  k.box(0.5, 0.07, 0.2, 0, 0.5, 0.0, C.composite2);                                                 // shoulder yoke
  k.box(0.14, 0.05, 0.16, 0, 0.555, 0.0, C.ceramic2);
  // right pauldron (weapon side): layered ceramic
  k.taper(0.17, 0.2, 0.13, 0.17, 0.1, 0.27, 0.47, 0, C.ceramic, [0, 0, -0.25]);
  k.taper(0.15, 0.18, 0.11, 0.15, 0.06, 0.3, 0.42, 0, C.ceramic2, [0, 0, -0.35]);
  // left: a bare joint and a thin sensor mast with a pod
  k.sphere(0.06, -0.25, 0.48, 0, C.joint, 1, 1, 1, 8, 6);
  k.box(0.018, 0.3, 0.018, -0.2, 0.68, 0.07, C.composite, [0, 0, 0.12]);
  k.box(0.05, 0.035, 0.07, -0.22, 0.83, 0.07, C.composite2);
  k.glowBox(0.012, 0.012, 0.04, -0.22, 0.85, 0.04);
  // power cell on the back, cooling slots glowing
  k.box(0.24, 0.28, 0.13, 0, 0.36, 0.17, C.composite);
  k.box(0.25, 0.04, 0.14, 0, 0.51, 0.17, C.ceramic2);
  for (const x of [-0.07, 0, 0.07]) k.glowBox(0.012, 0.16, 0.004, x, 0.35, 0.237);
  // neck
  k.cyl(0.035, 0.025, 0.16, 6, 0, 0.6, 0.0, C.joint);
  // seams: carapace edges, sternum line
  k.strip([-0.19, 0.42, -0.14], [-0.12, 0.2, -0.13], 0.01);
  k.strip([0.22, 0.42, -0.13], [0.15, 0.2, -0.12], 0.01);
  k.strip([0.012, 0.42, -0.19], [0.012, 0.22, -0.155], 0.008);
  k.glowBox(0.17, 0.008, 0.008, 0, 0.1, -0.095);   // gyro collar line
  // wear: scuffed patches on the carapace
  k.box(0.08, 0.05, 0.004, 0.11, 0.25, -0.155, C.ceramicDirt, [-0.15, 0, 0]);
  k.box(0.05, 0.03, 0.004, -0.13, 0.36, -0.15, C.ceramicDirt, [-0.2, 0, 0.1]);
  // glyph bar code on the right breast
  for (let i = 0; i < 7; i++) k.box(0.006 + (i % 3) * 0.004, 0.05, 0.003, 0.1 + i * 0.013, 0.4, -0.172, C.glyph, [-0.18, 0, 0]);
  return k;
}
function headKit() {
  // origin at the head centre, -z forward. No face: a long wedge-shaped sensor pod (narrowing to the front) on a short
  // neck, a dark sensor band across its blunt nose with an off-centre cluster of three lenses (the big one lit), a
  // brow plate offset to the right, a dark chin, two whip antennas swept back.
  const k = new Kit(), FWD = [-Math.PI / 2, 0, 0];   // (scaled 1.2 at the end)
  k.taper(0.16, 0.12, 0.1, 0.075, 0.32, 0, 0.0, 0.14, C.ceramic, FWD);          // the pod, z +0.14 .. -0.18
  k.taper(0.12, 0.05, 0.08, 0.035, 0.26, 0.0, -0.06, 0.12, C.composite2, FWD);  // chin
  k.box(0.1, 0.05, 0.02, 0, 0.0, -0.185, C.lensDark);                           // sensor band (nose)
  k.box(0.105, 0.012, 0.2, 0.0, 0.0, -0.08, C.lensDark);                        // band wraps back along the sides
  k.taper(0.07, 0.02, 0.05, 0.015, 0.24, 0.03, 0.05, 0.1, C.ceramic2, FWD);     // brow plate (right)
  k.cyl(0.026, 0.026, 0.02, 10, -0.022, 0.0, -0.19, C.composite, [Math.PI / 2, 0, 0]);
  k.glowDisc(0.018, -0.022, 0.0, -0.2005, [0, Math.PI, 0], 10);               // main lens (lit)
  k.cyl(0.011, 0.011, 0.015, 8, 0.018, 0.012, -0.19, C.composite, [Math.PI / 2, 0, 0]);
  k.cyl(0.008, 0.008, 0.015, 8, 0.036, -0.01, -0.19, C.composite, [Math.PI / 2, 0, 0]);
  k.glowBox(0.005, 0.005, 0.004, 0.018, 0.012, -0.198);
  k.glowBox(0.004, 0.004, 0.004, 0.036, -0.01, -0.198);
  k.box(0.006, 0.006, 0.3, -0.04, 0.12, 0.2, C.composite, [-0.6, 0, 0]);       // whip antennas
  k.box(0.005, 0.005, 0.22, -0.055, 0.1, 0.18, C.composite, [-0.75, 0, 0]);
  for (let i = 0; i < 4; i++) k.box(0.002, 0.03, 0.006, -0.081, -0.01, 0.0 + i * 0.012, C.glyph);   // side glyph
  k.strip([0.05, 0.035, -0.17], [0.075, 0.045, 0.1], 0.006);                    // seam along the brow
  return k.scaleAll(1.2);
}
// limb segments: origin at the proximal joint, +Y toward the distal joint, +Z forward
function thighKit(s) {
  const k = new Kit(), L = STRIDER.THIGH;
  k.box(0.055, L, 0.06, 0, L / 2, -0.015, C.composite);
  k.taper(0.14, 0.06, 0.1, 0.045, L * 0.84, 0, 0.04, 0.05, C.ceramic, null, 0, -0.01);
  k.taper(0.1, 0.03, 0.08, 0.02, L * 0.5, s * 0.03, 0.08, 0.085, C.ceramic2, null, 0, -0.005);   // layered plate
  k.cyl(0.018, 0.018, L * 0.6, 6, 0, L * 0.45, -0.07, C.metal);                // piston
  k.cyl(0.028, 0.028, L * 0.25, 6, 0, L * 0.25, -0.07, C.joint);
  k.sphere(0.06, 0, L, 0, C.joint, 1, 1, 1, 8, 6);                             // knee
  k.box(0.08, 0.06, 0.03, 0, L, 0.055, C.ceramic2);                            // knee cap
  k.strip([s * 0.055, 0.08, 0.072], [s * 0.045, L * 0.8, 0.065], 0.008);
  return k;
}
function shinKit() {
  const k = new Kit(), L = STRIDER.SHIN;
  k.box(0.045, L, 0.055, 0, L / 2, 0, C.composite2);
  k.taper(0.085, 0.04, 0.06, 0.03, L * 0.75, 0, 0.06, 0.04, C.ceramic2);       // shin guard
  k.box(0.05, L * 0.4, 0.05, 0, L * 0.35, -0.05, C.composite);                 // calf actuator
  k.box(0.07, 0.12, 0.03, 0, L * 0.55, 0.055, C.ceramicDirt);                  // mud on the guard
  k.cyl(0.04, 0.04, 0.09, 8, 0, L, 0, C.joint, [0, 0, Math.PI / 2]);           // hock
  return k;
}
function metaKit() {
  const k = new Kit(), L = META_L;
  k.box(0.035, L, 0.06, 0, L / 2, 0, C.composite);
  k.box(0.04, L * 0.7, 0.02, 0, L * 0.45, 0.035, C.ceramic2);
  return k;
}
function footKit() {
  // origin at the contact reference (pad bottom), -z forward
  const k = new Kit();
  k.box(0.12, 0.045, 0.11, 0, 0.022, -0.02, C.composite2);
  k.box(0.1, 0.02, 0.09, 0, 0.055, -0.02, C.ceramicDirt);
  for (const s of [-1, 1]) k.box(0.035, 0.035, 0.15, s * 0.035, 0.018, -0.13, C.composite, [0.12, s * 0.12, 0]);   // toes
  k.box(0.03, 0.03, 0.09, 0, 0.02, 0.07, C.composite, [-0.2, 0, 0]);          // heel spur
  return k;
}
function upperArmKit() {
  const k = new Kit(), L = 0.36;
  k.box(0.045, L, 0.045, 0, L / 2, 0, C.composite);
  k.taper(0.075, 0.07, 0.06, 0.06, L * 0.7, 0, 0.03, 0.005, C.ceramic);
  k.sphere(0.04, 0, L, 0, C.joint, 1, 1, 1, 8, 6);
  return k;
}
function foreArmKit() {
  const k = new Kit(), L = 0.38;
  k.box(0.04, L, 0.045, 0, L / 2, 0, C.composite2);
  k.box(0.055, L * 0.6, 0.02, 0, L * 0.45, 0.03, C.ceramic2);
  k.box(0.055, 0.08, 0.06, 0, L + 0.02, 0, C.composite);                       // hand
  k.box(0.012, 0.06, 0.012, 0.02, L + 0.08, -0.02, C.joint);
  k.box(0.012, 0.06, 0.012, -0.02, L + 0.08, -0.02, C.joint);
  return k;
}
function xm7Kit() {
  // origin at the pistol grip, -z forward, y up; muzzle at z = -0.78
  const k = new Kit();
  k.box(0.055, 0.075, 0.34, 0, 0.03, -0.1, C.coyote);                          // receiver
  k.box(0.05, 0.06, 0.3, 0, 0.035, -0.42, C.coyote);                            // handguard (M-LOK)
  for (let i = 0; i < 5; i++) k.box(0.052, 0.012, 0.02, 0, 0.035, -0.31 - i * 0.05, C.fde);
  k.cyl(0.012, 0.012, 0.06, 8, 0, 0.035, -0.6, C.black, [Math.PI / 2, 0, 0]);   // barrel
  k.cyl(0.021, 0.021, 0.16, 8, 0, 0.035, -0.7, C.black, [Math.PI / 2, 0, 0]);   // suppressor
  k.box(0.028, 0.14, 0.07, 0, -0.065, -0.08, C.black, [0.18, 0, 0]);            // magazine (6.8, 20 rd)
  k.box(0.03, 0.09, 0.035, 0, -0.04, 0.015, C.black, [-0.3, 0, 0]);              // grip
  k.box(0.045, 0.07, 0.22, 0, 0.02, 0.2, C.coyote);                              // stock
  k.box(0.046, 0.08, 0.02, 0, 0.01, 0.315, C.black);
  k.box(0.05, 0.055, 0.15, 0, 0.1, -0.12, C.black);                              // XM157 optic
  k.cyl(0.02, 0.02, 0.02, 8, 0, 0.1, -0.2, C.black, [Math.PI / 2, 0, 0]);
  // RUNAWAY refit: a sensor puck clamped to the rail, IFF strip on the stock, a crude glyph
  k.box(0.05, 0.03, 0.06, 0.04, 0.06, -0.36, C.ceramic, [0, 0, -0.5]);
  k.glowBox(0.012, 0.012, 0.004, 0.055, 0.075, -0.39);
  k.glowBox(0.004, 0.02, 0.14, 0.024, 0.03, 0.2);
  k.box(0.003, 0.03, 0.06, -0.029, 0.03, -0.1, C.ceramic);
  return k;
}
function coilKit() {
  const k = new Kit();
  k.box(0.065, 0.09, 0.4, 0, 0.035, -0.08, C.ceramic);
  k.box(0.04, 0.05, 0.38, 0, 0.04, -0.46, C.composite);
  for (let i = 0; i < 5; i++) { k.cyl(0.035, 0.035, 0.03, 10, 0, 0.04, -0.34 - i * 0.075, C.composite2, [Math.PI / 2, 0, 0]); k.glowBox(0.072, 0.006, 0.006, 0, 0.04, -0.34 - i * 0.075); }
  k.box(0.03, 0.03, 0.06, 0, 0.04, -0.72, C.ceramic2);
  k.glowBox(0.014, 0.014, 0.004, 0, 0.04, -0.752);
  k.box(0.03, 0.08, 0.04, 0, -0.04, 0.015, C.composite, [-0.25, 0, 0]);
  k.box(0.04, 0.12, 0.08, 0, -0.06, -0.12, C.composite2);                         // capacitor pack
  k.box(0.045, 0.06, 0.16, 0, 0.02, 0.2, C.composite);
  k.strip([0.034, 0.07, 0.05], [0.034, 0.07, -0.25], 0.006);
  return k;
}

let PROTO = null;
function protos() {
  if (PROTO) return PROTO;
  const M = rwMats();
  const b = (k, n) => { const g = k.build(M.body, M.glow, n); return g; };
  PROTO = { pelvis: b(pelvisKit(), 'pelvis'), torso: b(torsoKit(), 'torso'), head: b(headKit(), 'head'),
    thigh: [b(thighKit(1), 'thighL'), b(thighKit(-1), 'thighR')], shin: b(shinKit(), 'shin'), meta: b(metaKit(), 'meta'), foot: b(footKit(), 'foot'),
    upper: b(upperArmKit(), 'upperArm'), fore: b(foreArmKit(), 'foreArm'), xm7: b(xm7Kit(), 'xm7'), coil: b(coilKit(), 'coil') };
  return PROTO;
}
const clone = g => { const c = g.clone(); return c; };   // shares geometry + materials

export function buildStrider(opt = {}) {
  const P = protos(), M = rwMats();
  const group = new THREE.Group(); group.name = 'strider';
  const parts = {
    pelvis: clone(P.pelvis), torso: clone(P.torso), head: clone(P.head),
    thigh: [clone(P.thigh[0]), clone(P.thigh[1])], shin: [clone(P.shin), clone(P.shin)], meta: [clone(P.meta), clone(P.meta)], foot: [clone(P.foot), clone(P.foot)],
    upper: [clone(P.upper), clone(P.upper)], fore: [clone(P.fore), clone(P.fore)], gun: clone(opt.weapon === 'coil' ? P.coil : P.xm7),
  };
  for (const v of Object.values(parts)) for (const o of [].concat(v)) group.add(o);
  // unit marking: a crude stencil on the back plate (machine glyphs over a number)
  if (opt.tag && typeof document !== 'undefined') {
    const d = decal(stencilTex(opt.tag, { w: 128, h: 48, color: '#1a1d20', font: 'bold 30px monospace', bars: false }), 0.16, 0.06, 0, 0.55, 0.235, [0, 0, 0]);
    d.rotation.y = 0; parts.torso.add(d);
  }
  // blob shadow (the game has no shadow maps)
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16).rotateX(-Math.PI / 2), M.shadow); shadow.renderOrder = -1; group.add(shadow);
  const glows = []; group.traverse(o => { if (o.isMesh && o.material === M.glow) glows.push(o); });
  let lit = true;
  const api = {
    group, parts, shadow,
    setLit(on, mat) { if (lit === on && !mat) return; lit = on; for (const g of glows) if (!g.userData.off) g.material = mat || (on ? M.glow : M.glowDim); },
    update(S, dt, time) {
      const p = S.pose(), B = p.basis, T = p.torso;
      placeBasis(parts.pelvis, p.pelvis, B.f, B.u);
      placeBasis(parts.torso, p.pelvis, T.f, T.u);
      // head: stabilised, world yaw / pitch (while fallen it rides the body)
      if (S.up) { const cy = Math.cos(S.headPitch); placeBasis(parts.head, p.head, [-Math.sin(S.headYaw) * cy, Math.sin(S.headPitch), -Math.cos(S.headYaw) * cy], [0, 1, 0]); }
      else placeBasis(parts.head, p.head, T.f, T.u);
      for (let i = 0; i < 2; i++) {
        const L = p.legs[i];
        placeSeg(parts.thigh[i], L.hip, L.knee, B.f);
        placeSeg(parts.shin[i], L.knee, L.hock, B.f);
        placeSeg(parts.meta[i], L.hock, L.toe, L.footF, META_L);
        placeBasis(parts.foot[i], L.toe, L.footF, L.n);
        const A = p.arms[i];
        placeSeg(parts.upper[i], A.sh, A.elbow, T.f);
        placeSeg(parts.fore[i], A.elbow, A.hand, p.gun.f);
      }
      placeBasis(parts.gun, p.gun.pos, p.gun.f, p.gun.u);
      parts.gun.visible = S.armed || S.hp.weapon > 0;
      shadow.position.set(S.c[0], p.ground + 0.02, S.c[2]);
      // seams: steady when well, flicker when damaged / glitching, dim when destroyed
      if (!S.alive) api.setLit(false);
      else if (S.dmgTaken > 20 || S.glitch.gyro > 0 || S.glitch.arms > 0) api.setLit(Math.sin(time * 37 + S.id) > -0.6 || Math.sin(time * 5.3) > 0.2);
      else api.setLit(true);
      api.damage(S);
      if (S.hp.armL <= 0) parts.upper[0].scale.y = 0.55; if (S.hp.armR <= 0) parts.upper[1].scale.y = 0.55;   // (stumps)
    },
    // ngc/rwground-polish: damage you can read - a limb shot away is gone below its stump (the thigh / upper arm
    // stays), a blinded sensor head goes dark, a destroyed machine is scorched and its seams die
    damage(S) {
      const legL = S.hp.legL <= 0, legR = S.hp.legR <= 0, armL = S.hp.armL <= 0, armR = S.hp.armR <= 0;
      const key = (legL ? 1 : 0) + (legR ? 2 : 0) + (armL ? 4 : 0) + (armR ? 8 : 0) + (S.blind ? 16 : 0) + (S.alive ? 0 : 32);
      if (key === dmgKey) return; dmgKey = key;
      const legs = [legL, legR], arms = [armL, armR];
      for (let i = 0; i < 2; i++) {
        parts.shin[i].visible = parts.meta[i].visible = parts.foot[i].visible = !legs[i];
        parts.fore[i].visible = !arms[i];
      }
      api.stumps = [legL && 'legL', legR && 'legR', armL && 'armL', armR && 'armR'].filter(Boolean);
      if (S.blind) parts.head.traverse(o => { if (o.isMesh && glows.includes(o)) { o.userData.off = true; o.material = M.glowOff; } });
      if (!S.alive) setBodyMat(group, M.scorched, M.glowOff);
    },
    stumps: [],
  };
  let dmgKey = 0;
  return api;
}
