// NGC-1980 air defence crews: the men on the guns (and the RUNAWAY's service machine), posed and animated by brain.js.
//
// A crewman is 8 small meshes on ONE shared vertex-coloured Lambert material (kit.js BAKED), with geometry built once
// per kit and shared by every figure: body (torso, belt, hips), head (+ helmet), two arms (forearm bent, hands), two
// thighs and two shins (knee pivots) - enough to sit at a gun, walk, carry an ammunition box, kneel and brace against the blast.
// Origin between the feet, facing -z, metres. The figures are only drawn near the camera (brain.js hides them with
// the hi-detail level), so the extra draw calls stay local.
//
// Kits (1980):
//   us     US Army / USMC air defence gunner: OG-107 utilities, M1 helmet with the woodland cover, black boots
//   sov    Soviet AA gunner (ZU-23-2 crews): khaki-olive field uniform, SSh-68 helmet, brown belt, kirza boots
//   tank   Soviet SPAAG crew (the Shilka): black tanker's overalls and the padded black shlemofon
// The RUNAWAY don't crew their guns: a TICK service machine (six legs, a manipulator arm, a cyan sensor eye) reloads
// the TALON's missile packs - the machine side's answer to the loader.
import * as THREE from 'three';
import { BAKED } from './kit.js';

const _c = new THREE.Color();
function paintGeo(parts) {   // [[geometry, hex], ...] -> one non-indexed geometry with vertex colours
  const pos = [], cols = [];
  for (const [g0, hex] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0; _c.setHex(hex);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); cols.push(_c.r, _c.g, _c.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
const bx = (w, h, d, x = 0, y = 0, z = 0, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); return g.translate(x, y, z); };
const sp = (r, x, y, z, sx = 1, sy = 1, sz = 1, th = Math.PI) => new THREE.SphereGeometry(r, 8, 5, 0, Math.PI * 2, 0, th).scale(sx, sy, sz).translate(x, y, z);
const cy = (r, h, x, y, z, seg = 6) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y, z);

export const HIP = 0.92, SHOULDER = 1.42;   // pivot heights
const KITS = {
  us: { cloth: 0x535a3a, cloth2: 0x474d33, belt: 0x5d5a3e, boot: 0x1a1a19, helm: 0x4b5233, cover: 0x56603d, skin: [0xc39a78, 0x8d6448, 0xd2a888] },
  sov: { cloth: 0x6b6845, cloth2: 0x5c5a3c, belt: 0x5a3e26, boot: 0x241c16, helm: 0x4f5a39, cover: 0x4f5a39, skin: [0xc8a080, 0xd2a888, 0xb08868] },
  tank: { cloth: 0x2a2b2a, cloth2: 0x222322, belt: 0x3a3022, boot: 0x1b1a19, helm: 0x1f2020, cover: 0x2b2b2a, skin: [0xc8a080, 0xd2a888, 0xb08868], padded: true },
};
const GEO = {};
function kitGeo(k) {
  if (GEO[k]) return GEO[k];
  const K = KITS[k];
  const body = paintGeo([
    [bx(0.34, 0.2, 0.21, 0, HIP + 0.02, 0), K.cloth2],                 // hips
    [bx(0.38, 0.46, 0.24, 0, HIP + 0.32, 0), K.cloth],                 // torso
    [bx(0.39, 0.07, 0.25, 0, HIP + 0.12, 0), K.belt],                  // belt
    [bx(0.12, 0.08, 0.04, -0.08, HIP + 0.38, -0.125), K.cloth2], [bx(0.12, 0.08, 0.04, 0.08, HIP + 0.38, -0.125), K.cloth2],   // breast pockets
    [bx(0.13, 0.07, 0.13, 0, SHOULDER + 0.06, 0), K.skin[0]],          // neck
    ...(k === 'us' ? [[cy(0.05, 0.15, 0.2, HIP + 0.08, 0.04), 0x3c4330]] : k === 'sov' ? [[bx(0.1, 0.12, 0.06, 0.16, HIP + 0.06, 0.1), 0x4a3a26]] : []),   // canteen / map case
  ]);
  const heads = K.skin.map(skin => paintGeo([
    [sp(0.1, 0, 0.12, -0.01, 1, 1.12, 1), skin],
    ...(K.padded
      ? [[sp(0.125, 0, 0.16, 0.0, 1, 0.95, 1.06, Math.PI / 1.7), K.helm], [bx(0.05, 0.12, 0.2, -0.11, 0.12, 0.01), K.helm], [bx(0.05, 0.12, 0.2, 0.11, 0.12, 0.01), K.helm], [bx(0.24, 0.035, 0.05, 0, 0.23, -0.09), K.helm]]   // shlemofon: padded ribs, ear pieces
      : k === 'sov'
        ? [[sp(0.14, 0, 0.16, 0.0, 1, 0.92, 1.05, Math.PI / 1.85), K.helm], [bx(0.27, 0.025, 0.28, 0, 0.115, 0.0), K.helm]]                                                   // SSh-68, short rim
        : [[sp(0.145, 0, 0.16, 0.01, 1, 0.86, 1.08, Math.PI / 1.8), K.cover], [bx(0.3, 0.03, 0.32, 0, 0.1, 0.01), K.helm], [bx(0.18, 0.012, 0.02, 0, 0.21, -0.14), 0x2e3322]]),   // M1 pot, cover, band
    [bx(0.07, 0.03, 0.03, -0.04, 0.12, -0.095), 0x2a2018], [bx(0.07, 0.03, 0.03, 0.04, 0.12, -0.095), 0x2a2018],     // brows
  ]));
  // arm: pivot at the shoulder, upper arm down, forearm bent forward, hand
  const arm = s => paintGeo([[bx(0.1, 0.32, 0.11, 0, -0.15, 0), K.cloth], [bx(0.09, 0.09, 0.3, 0, -0.29, -0.12), K.cloth], [bx(0.08, 0.08, 0.08, 0, -0.29, -0.3), K.skin[0]]]);
  const thigh = paintGeo([[bx(0.15, 0.46, 0.17, 0, -0.22, 0), K.cloth2]]);
  const shin = paintGeo([[bx(0.13, 0.4, 0.14, 0, -0.2, 0), K.cloth2], [bx(0.13, 0.12, 0.26, 0, -0.42, -0.05), K.boot]]);
  const box = paintGeo([[bx(0.42, 0.24, 0.2, 0, 0, 0), k === 'us' ? 0x4b5132 : 0x56603d], [bx(0.43, 0.04, 0.21, 0, 0.06, 0), 0xb89a2a], [bx(0.16, 0.03, 0.04, 0, 0.135, 0), 0x2a2a2a]]);   // ammo box, yellow band, handle
  return GEO[k] = { body, heads, armL: arm(-1), armR: arm(1), thigh, shin, box };
}
let SKIN_I = 0;
const M = (g, p, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(g, BAKED); m.position.set(x, y, z); p.add(m); return m; };

// a crewman. Returns { g, head, armL, armR, thighL, thighR, shinL, shinR, box, pose(state, t, o) }
export function makeCrew(kit = 'us') {
  const G = kitGeo(kit), g = new THREE.Group(), root = new THREE.Group(); g.add(root);
  M(G.body, root);
  const head = M(G.heads[SKIN_I++ % G.heads.length], root, 0, SHOULDER + 0.1, 0);
  const armL = M(G.armL, root, -0.235, SHOULDER, 0), armR = M(G.armR, root, 0.235, SHOULDER, 0);
  const thighL = M(G.thigh, root, -0.1, HIP, 0), thighR = M(G.thigh, root, 0.1, HIP, 0);
  const shinL = M(G.shin, thighL, 0, -0.45, 0), shinR = M(G.shin, thighR, 0, -0.45, 0);
  const box = M(G.box, root, 0, HIP + 0.32, -0.32); box.visible = false;
  const c = { g, root, head, armL, armR, thighL, thighR, shinL, shinR, box, kit, state: 'stand' };
  c.pose = (st, t = 0, o = {}) => pose(c, st, t, o);
  pose(c, 'stand', 0);
  return c;
}
// bracing against the muzzle blast (o.ears): head down and turned away, forearms up in front of the face
function brace(c) { c.armL.rotation.set(1.05, 0, 0.3); c.armR.rotation.set(1.05, 0, -0.3); c.head.rotation.set(-0.35, c.head.rotation.y > 0 ? 0.7 : -0.7, 0, "YXZ"); }
// poses. t: time (s) for the cycles; o.look = [yaw, pitch] for the head (rad, figure frame); o.phase for the walk
function pose(c, st, t, o = {}) {
  c.state = st;
  const { root, head, armL, armR, thighL, thighR, shinL, shinR, box } = c;
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
  thighL.rotation.set(0, 0, 0); thighR.rotation.set(0, 0, 0); shinL.rotation.set(0, 0, 0); shinR.rotation.set(0, 0, 0);
  armL.rotation.set(0, 0, 0); armR.rotation.set(0, 0, 0); box.visible = false;
  const look = o.look || [Math.sin(t * 0.37 + c.g.id) * 0.5, 0];
  head.rotation.set(Math.max(-0.4, Math.min(0.75, look[1])), Math.max(-1.2, Math.min(1.2, look[0])), 0, 'YXZ');
  const breathe = Math.sin(t * 1.7 + c.g.id) * 0.02;
  if (st === 'sit') {          // on a gun seat: thighs forward, shins down, hands forward on the hand wheels / grips
    thighL.rotation.x = thighR.rotation.x = 1.45; shinL.rotation.x = shinR.rotation.x = -1.35;
    armL.rotation.x = armR.rotation.x = 0.75 + breathe + (o.grip || 0); armL.rotation.z = -0.1; armR.rotation.z = 0.1;
    root.rotation.x = -0.08 - (o.lean || 0);
  } else if (st === 'hatch') { // standing in a hatch: legs hidden below the roof line by the caller; arms on the rim
    armL.rotation.set(0.5, 0, -0.55); armR.rotation.set(0.5, 0, 0.55);
    root.position.y = -(o.duck || 0);
  } else if (st === 'walk' || st === 'carry') {
    const ph = o.phase ?? t * 7, s = Math.sin(ph), k = Math.max(0, -Math.cos(ph));
    thighL.rotation.x = 0.45 * s; thighR.rotation.x = -0.45 * s; shinL.rotation.x = -0.5 * Math.max(0, -s) - 0.1; shinR.rotation.x = -0.5 * Math.max(0, s) - 0.1;
    root.position.y = -0.03 * k;
    if (st === 'carry') { armL.rotation.x = armR.rotation.x = 0.75; armL.rotation.z = 0.12; armR.rotation.z = -0.12; box.visible = true; box.position.set(0, HIP + 0.18, -0.36); root.rotation.x = -0.06; }
    else { armL.rotation.x = -0.35 * s; armR.rotation.x = 0.35 * s; }
  } else if (st === 'load') {  // lifting a box up into the feed tray / magazine well
    const up = 0.5 + 0.5 * Math.sin(o.lift ?? t * 3);
    armL.rotation.x = armR.rotation.x = 1.0 + 1.2 * up; armL.rotation.z = 0.12; armR.rotation.z = -0.12;
    box.visible = o.box !== false; box.position.set(0, HIP + 0.45 + 0.65 * up, -0.38 - 0.1 * up);
    root.rotation.x = 0.05 - 0.12 * up; thighL.rotation.x = 0.15; shinL.rotation.x = -0.1;
  } else if (st === 'kneel') { // braced, one knee down
    root.position.y = -0.45; thighL.rotation.x = 1.5; shinL.rotation.x = -1.55; thighR.rotation.x = -0.1; shinR.rotation.x = -1.45;
    armL.rotation.x = armR.rotation.x = 0.4;
    if (o.ears) brace(c);   // turns his face from the muzzle blast, forearms up
  } else {                     // stand (idle): weight shifts, arms loose
    armL.rotation.x = 0.08 + breathe; armR.rotation.x = 0.05 - breathe; armL.rotation.z = -0.06; armR.rotation.z = 0.06;
    thighL.rotation.x = 0.04; shinL.rotation.x = -0.06; root.rotation.z = Math.sin(t * 0.3 + c.g.id) * 0.02;
    if (o.ears) brace(c);
    if (o.point) { armR.rotation.set(1.9 + (o.point[1] || 0), 0, -0.1); }   // pointing out a target
  }
}

// ------------------------------------------------------------------ the RUNAWAY TICK service machine
// a low ceramic-and-composite body on six jointed legs, a sensor eye with a cyan ring, a folding manipulator arm.
// About 1.4 m long. Returns { g, body, eye, arm, fore, legs: [{ hip, knee }], pose(state, t, o) }
const TICK = {};
function tickGeo() {
  if (TICK.g) return TICK.g;
  const cer = 0xc9c8c0, cer2 = 0x9fa09a, comp = 0x2a2d31, dark = 0x17191b;
  const body = paintGeo([
    [bx(0.7, 0.26, 1.15, 0, 0, 0), comp], [bx(0.62, 0.1, 0.95, 0, 0.17, -0.02), cer], [bx(0.5, 0.08, 0.5, 0, 0.26, 0.15), cer2],
    [bx(0.3, 0.2, 0.25, 0, 0.08, 0.62), comp], [bx(0.04, 0.04, 0.9, 0.33, 0.14, 0), 0x6fe8ff], [bx(0.04, 0.04, 0.9, -0.33, 0.14, 0), 0x6fe8ff],   // tail pack, seams
  ]);
  const eye = paintGeo([[bx(0.32, 0.22, 0.26, 0, 0, 0), comp], [bx(0.26, 0.04, 0.2, 0, 0.13, 0), cer], [cy(0.07, 0.04, 0, 0, -0.14).rotateX(Math.PI / 2), dark], [cy(0.085, 0.02, 0, 0, -0.13).rotateX(Math.PI / 2), 0x6fe8ff]]);
  const upper = paintGeo([[bx(0.07, 0.07, 0.45, 0, 0, -0.22), comp], [bx(0.08, 0.03, 0.4, 0, 0.05, -0.22), cer]]);
  const fore = paintGeo([[bx(0.06, 0.06, 0.45, 0, 0, -0.22), comp], [bx(0.14, 0.05, 0.08, 0, 0, -0.47), cer2], [bx(0.03, 0.08, 0.06, -0.05, -0.05, -0.5), dark], [bx(0.03, 0.08, 0.06, 0.05, -0.05, -0.5), dark]]);   // gripper
  const thigh = paintGeo([[bx(0.06, 0.06, 0.42, 0, 0, 0.21), comp], [bx(0.07, 0.025, 0.36, 0, 0.04, 0.2), cer]]);
  const shin = paintGeo([[bx(0.05, 0.5, 0.05, 0, -0.25, 0), comp], [bx(0.09, 0.04, 0.09, 0, -0.5, 0), dark]]);
  const can = paintGeo([[cy(0.1, 0.9, 0, 0, 0, 8).rotateX(Math.PI / 2), 0x4d553a], [cy(0.105, 0.05, 0, 0, -0.4, 8).rotateX(Math.PI / 2), 0x2c3324]]);   // a missile round in its tube
  return TICK.g = { body, eye, upper, fore, thigh, shin, can };
}
export function makeTick() {
  const G = tickGeo(), g = new THREE.Group(), body = M(G.body, g, 0, 0.55, 0);
  const eye = M(G.eye, body, 0, 0.12, -0.66);
  const arm = new THREE.Group(); arm.position.set(0.18, 0.2, -0.4); body.add(arm); M(G.upper, arm);
  const fore = new THREE.Group(); fore.position.set(0, 0, -0.45); arm.add(fore); M(G.fore, fore);
  const can = M(G.can, fore, 0, -0.08, -0.6); can.visible = false;
  const legs = [];
  for (const sd of [-1, 1]) for (const z of [-0.38, 0, 0.38]) {
    const hip = new THREE.Group(); hip.position.set(sd * 0.36, -0.02, z); hip.rotation.y = -sd * Math.PI / 2 + (z ? Math.sign(z) * sd * 0.35 : 0); body.add(hip);
    hip.rotation.order = 'YXZ';
    const th = M(G.thigh, hip); th.position.z = 0; th.rotation.y = Math.PI;   // the thigh reaches outwards (-z of the hip frame after the flip)
    const knee = new THREE.Group(); knee.position.set(0, 0, -0.42); hip.add(knee); M(G.shin, knee);
    legs.push({ hip, knee, sd, z, ph: (legs.length % 2) * Math.PI });
  }
  const T = { g, body, eye, arm, fore, can, legs };
  T.pose = (st, t = 0, o = {}) => tickPose(T, st, t, o);
  tickPose(T, 'idle', 0);
  return T;
}
function tickPose(T, st, t, o = {}) {
  const walk = st === 'walk', work = st === 'work';
  T.body.position.y = (st === 'fold' ? 0.28 : 0.55) + (walk ? Math.abs(Math.sin(t * 9)) * 0.03 : 0);
  for (const L of T.legs) {
    const ph = t * 9 + L.ph, lift = walk ? Math.max(0, Math.sin(ph)) * 0.5 : 0;
    const up = st === 'fold' ? -0.15 : 0.5 + lift;   // thigh up and out, the shin near vertical
    L.hip.rotation.x = up; L.hip.rotation.z = 0;
    L.knee.rotation.x = st === 'fold' ? -1.1 : -up + 0.2;
    L.hip.rotation.y = -L.sd * Math.PI / 2 + (L.z ? Math.sign(L.z) * L.sd * 0.35 : 0) + (walk ? Math.cos(ph) * 0.3 : 0);
  }
  const look = o.look || [Math.sin(t * 0.6) * 0.7, Math.sin(t * 0.43) * 0.15];
  T.eye.rotation.set(look[1], look[0], 0, 'YXZ');
  if (work) {   // the arm reaches up and forward, the gripper turns: feeding a round into a tube
    const k = 0.5 + 0.5 * Math.sin(o.lift ?? t * 1.6);
    T.arm.rotation.set(0.5 + 0.9 * k, 0, 0); T.fore.rotation.set(-0.4 - 0.5 * k, 0, 0); T.fore.rotation.z = Math.sin(t * 6) * 0.2;
    T.can.visible = o.can !== false && k < 0.85;
  } else { T.arm.rotation.set(-0.15, 0, 0); T.fore.rotation.set(2.6, 0, 0); T.can.visible = false; }   // folded along the back
}
