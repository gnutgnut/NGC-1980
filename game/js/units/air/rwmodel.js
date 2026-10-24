// RUNAWAY aircraft models, house style, real (or, for the SHRIKE, setting-true) proportions:
//   RW-4 SHRIKE   futuristic fighter drone (BIBLE: sleek, asymmetric, matte ceramic and dark composite, pale cyan
//                 emissive seams, no pilot, no windows, a sensor cluster where a cockpit would be). 11.5 m, span 8.2 m.
//   MQ-9 REAPER   seized modern UAV: 11 m long, 20.1 m span, V-tail with ventral fin, three-blade pusher, sensor ball;
//                 weathered USAF grey with the RUNAWAY refit (cyan IFF strips, a bolted-on sensor pod, painted-out
//                 markings with machine stencils over them).
//   SHAHED-style  one-way delta drone: 3.5 m long, 2.5 m span, tip fins, two-blade pusher, drab paint, RUNAWAY stencil.
// animate(sim, dt, time) poses the moving parts from the sim (airframe A for the SHRIKE / REAPER, point-mass D for the
// SHAHED).
//
// (airai-polish) Each model is now a THREE.LOD: the detailed model close in, one merged vertex-coloured mesh (the
// RUNAWAY ground units' kit, units/runaway/rwkit.js: one draw call) further out, nothing past the far cull. On top:
//   - lights: the SHRIKE's belly strobe and pulsing cyan tip markers; the REAPER's navigation lights as she came from
//     the USAF (red port, green starboard, white tail), a red anti-collision beacon and the RUNAWAY's cyan IFF beacon;
//     the SHAHED a dim cyan tracker blink;
//   - engines: the SHRIKE's 2D nozzle with thrust-vectoring paddles and a turbine glow, the REAPER's three-blade pusher
//     (blades turning, a disc at speed, out of balance once hit), the SHAHED's piston engine with its two-blade prop and
//     the rail booster under the belly that burns for 2.5 s and drops off;
//   - the SHRIKE's missile bay doors open as it fires (A.bayT, set by airwar.js);
//   - damage states: setDamage(f) with f = hp / hpMax: scorch and holes, a lost aileron (REAPER), seams that stutter
//     (SHRIKE); damagePts (local) are where airwar.js puts smoke and fire; kill() for a dead machine (engine and lights
//     out, seams dark); breakable: the pieces airwar.js tears off on the way down (a wing, a tail);
//   - the wreck (char, sink) is airwar.js's, generic for every model.
import * as THREE from 'three';
import { M, B, V, slab, loft, merge, cylZ, boxG, mesh, rod, hinged, tube, addM, canvasTex, decal, drawRunawayMark } from './meshkit.js';
import { SHRIKE, REAPER } from './rwfm.js';
import { Kit, RW, rwMats } from '../runaway/rwkit.js';

const cyanM = () => B(0x8ff8ff);
const rwTex = (text) => canvasTex('rwmark' + text, 256, 64, (x, w, h) => { x.clearRect(0, 0, w, h); drawRunawayMark(x, w, h, text); });
const scorchM = () => M(0x16130f, { shininess: 2 });
const holeM = () => B(0x050505);

// detail + far + cull as one LOD object (the war positions this). Hysteresis keeps it from flickering at the edge.
function lodOf(detail, far, d1, d2, name) {
  const lod = new THREE.LOD(); lod.name = name;
  lod.addLevel(detail, 0, 0.1); lod.addLevel(far, d1, 0.1); lod.addLevel(new THREE.Object3D(), d2, 0.05);
  return lod;
}
// a lamp: a small unlit bulb and an additive halo, both under `parent`; on(k) sets brightness 0..1
function lamp(parent, color, r, p, halo = 2.6) {
  const bulb = mesh(new THREE.SphereGeometry(r, 6, 4), B(color), parent, 'lamp'); bulb.position.copy(p);
  const hm = addM(color), h = mesh(new THREE.SphereGeometry(r * halo, 8, 6), hm, parent, 'halo'); h.position.copy(p);
  return { bulb, h, on(k) { bulb.visible = k > 0.05; h.visible = k > 0.05; hm.opacity = 0.3 * k; } };
}
// scorch patches / holes on a skin: small dark slabs a hair off the surface, shown with damage
function scorch(parent, list) {
  const g = new THREE.Group(); g.name = 'scorch'; parent.add(g); const sm = scorchM(), hm = holeM();
  for (const [x, y, z, w, d, hole, rx = 0, rz = 0] of list) {
    const m = mesh(new THREE.CircleGeometry(1, 7).scale(w, d, 1).rotateX(-Math.PI / 2), hole ? hm : sm, g, 'scorchPatch');
    m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.material.side = THREE.DoubleSide;
  }
  g.visible = false; return g;
}

// ============================================================================================ RW-4 SHRIKE
export function buildShrikeModel() {
  const g = new THREE.Group(); g.name = 'shrike';
  const ceramM = M(0xd6d3cb, { shininess: 6 }), ceram2M = M(0xbdbab2, { shininess: 6 }), compM = M(0x2a2d32, { shininess: 10 }), darkM = M(0x111316), seamM = cyanM(), lensM = M(0x0a1418, { emissive: 0x0b4048, shininess: 90 });
  // body: a flat chined blended delta, lofted from diamond sections (half profile: top, chine, keel)
  const P = [
    [-6.2, [[0, -0.05], [0, -0.05], [0, -0.05]]],
    [-5.4, [[0, 0.16], [0.42, -0.02], [0, -0.2]]],
    [-4.2, [[0, 0.36], [0.78, 0.0], [0, -0.36]]],
    [-2.6, [[0, 0.52], [1.25, 0.02], [0, -0.48]]],
    [-0.8, [[0, 0.62], [1.6, 0.03], [0, -0.55]]],
    [1.2, [[0, 0.58], [1.55, 0.03], [0, -0.52]]],
    [3.4, [[0, 0.44], [1.15, 0.02], [0, -0.4]]],
    [5.0, [[0, 0.26], [0.75, 0.0], [0, -0.26]]],
    [5.5, [[0, 0.18], [0.6, 0.0], [0, -0.2]]],
  ];
  const rings = P.map(([z, h]) => { const r = [...h.map(([x, y]) => [x, y, z]), ...h.slice(0, 2).reverse().map(([x, y]) => [-x, y, z])]; r.push(r[0]); return r; });
  mesh(loft(rings, (r, k) => (k === 0 || k === 3 ? 0 : 1)), [ceramM, compM], g, 'body');
  // the wings: cranked delta, ceramic top panels with a dark composite leading edge; each side its own group (the
  // right one can be torn off). Panel lines (darker ceramic) and the emissive seams along the chine and leading edge.
  const wingG = {};
  for (const s of [-1, 1]) {
    const W = new THREE.Group(); W.name = 'wing' + (s < 0 ? 'L' : 'R'); g.add(W); wingG[s] = W;
    mesh(slab([[0.9, -3.0, .16], [2.2, -0.9, .14], [4.1, 2.0, .08], [4.1, 3.0, .06], [3.2, 3.6, .07], [1.0, 3.8, .12]], (a, b, w) => [s * a, 0.02 + w, b]), ceramM, W, 'wing');
    mesh(slab([[0.9, -3.0, .17], [2.2, -0.9, .15], [4.1, 2.0, .09], [3.9, 2.15, .09], [2.0, -0.75, .15], [0.85, -2.7, .17]], (a, b, w) => [s * a, 0.02 + w, b]), compM, W, 'wingLE');
    mesh(slab([[2.6, 1.1, .02], [3.4, 1.5, .02], [3.3, 3.1, .02], [2.5, 3.2, .02]], (a, b, w) => [s * a, 0.1 + w, b]), ceram2M, W, 'panel');   // an access panel, a shade darker
    tube([[s * 0.3, 0.0, -5.7], [s * 0.78, 0.04, -4.2], [s * 1.25, 0.06, -2.6], [s * 1.6, 0.07, -0.8], [s * 1.55, 0.07, 1.2], [s * 1.15, 0.06, 3.4]], 0.022, seamM, g, 'seam', 16);
    tube([[s * 1.0, 0.15, -2.75], [s * 2.15, 0.13, -0.7], [s * 3.95, 0.09, 2.05]], 0.02, seamM, W, 'seam', 10);
    tube([[s * 3.3, 0.1, 3.5], [s * 4.05, 0.08, 2.9]], 0.02, seamM, W, 'seam', 4);
  }
  // asymmetric dorsal intake: a flattened scoop on the right shoulder, fairing back into the spine
  mesh(loft([[-1.9, 0.18, 0.55], [-1.2, 0.36, 0.5], [0.6, 0.4, 0.42], [2.4, 0.28, 0.3], [3.4, 0.12, 0.18]].map(([z, hgt, hw]) => [[0.55 - hw, 0.5, z], [0.55 - hw * 0.8, 0.5 + hgt, z], [0.55 + hw * 0.8, 0.5 + hgt * 0.9, z], [0.55 + hw, 0.48, z]])), compM, g, 'dorsalIntake');
  mesh(new THREE.PlaneGeometry(0.85, 0.17).rotateY(Math.PI).translate(0.55, 0.6, -1.92), M(0x05080a, { emissive: 0x06363c }), g, 'intakeMouth');
  // the asymmetry the BIBLE asks for, again on the left: a long sensor spike off the wing root, a lens at its tip
  rod(V(-1.15, 0.06, -2.4), V(-1.15, 0.06, -5.3), 0.07, compM, g, 'sensorSpike');
  mesh(new THREE.SphereGeometry(0.06, 8, 6).translate(-1.15, 0.06, -5.34), lensM, g, 'spikeLens');
  // sensor cluster instead of a cockpit: an asymmetric group of lenses, cyan ring that scans
  const sc = new THREE.Group(); sc.position.set(-0.12, 0.3, -4.1); g.add(sc);
  mesh(new THREE.SphereGeometry(0.34, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1.4), compM, sc, 'sensorHump');
  for (const [x, y, z, r] of [[0, 0.12, -0.35, 0.11], [0.17, 0.08, -0.18, 0.07], [-0.15, 0.1, -0.12, 0.06], [0.05, 0.18, 0.02, 0.05]]) mesh(new THREE.SphereGeometry(r, 8, 6).translate(x, y, z), lensM, sc, 'lens');
  const ringM = cyanM(), ring = mesh(new THREE.TorusGeometry(0.16, 0.018, 4, 16).rotateX(Math.PI / 2 - 0.3).translate(0, 0.13, -0.33), ringM, sc, 'lensRing');
  // dorsal antenna blades, ventral sensor fairings
  for (const [x, z] of [[-0.3, 0.2], [0.25, 2.6]]) mesh(slab([[0, 0, .03], [0.3, 0.05, .02], [0.32, 0.22, .015], [0.12, 0.22, .015]], (a, b, w) => [x + w, 0.6 + b - (z > 1 ? 0.15 : 0), z + a]), compM, g, 'antenna');
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.16, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 2.6).rotateX(Math.PI).translate(s * 0.9, -0.38, -2.2), compM, g, 'ventralFairing');
  // canted ruddervators and elevons
  const surf = {}, finG = {};
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R', cant = 0.62, FG = new THREE.Group(); FG.name = 'fin' + S; g.add(FG); finG[s] = FG;
    const map = (z, v, w) => [s * (0.55 + v * Math.sin(cant) + w * Math.cos(cant)), 0.3 + v * Math.cos(cant) - w * Math.sin(cant), z];
    mesh(slab([[2.8, 0, .1], [4.2, 1.5, .06], [5.0, 1.5, .05], [4.9, 0, .08]], map), compM, FG, 'fin' + S);
    surf['rud' + S] = hinged(FG, slab([[4.9, 0.05, .06], [5.0, 1.45, .04], [5.45, 1.45, .03], [5.5, 0.05, .04]], map), ceramM, V(...map(4.9, 0.05, 0)), V(...map(5.0, 1.45, 0)), 'ruddervator' + S);
    mesh(new THREE.BoxGeometry(0.03, 0.03, 1.4).translate(...map(4.4, 1.47, 0.05)), seamM, FG, 'seam');
    const p0 = V(s * 1.05, 0.02, 3.75), p1 = V(s * 3.3, 0.02, 3.55);
    surf['elev' + S] = hinged(wingG[s], slab([[1.05, 3.75, .06], [3.3, 3.55, .05], [3.25, 4.25, .03], [1.05, 4.35, .04]], (a, b, w) => [s * a, 0.02 + w, b]), compM, ...(s > 0 ? [p0, p1] : [p1, p0]), 'elevon' + S);
  }
  // flat 2D nozzle: dark box, a turbine face that glows with power, cyan-white exhaust, two vectoring paddles
  mesh(boxG(1.1, 0.34, 0.6, 0, 0.02, 5.6), darkM, g, 'nozzle');
  const faceM = M(0x0c1214, { emissive: 0x2a8a96 }); mesh(new THREE.PlaneGeometry(0.95, 0.2).translate(0, 0.02, 5.91), faceM, g, 'nozzleFace');
  const glowM = addM(0x7fe8ff), glow = mesh(new THREE.BoxGeometry(0.9, 0.16, 1).translate(0, 0, 0.5), glowM, g, 'exhaust'); glow.position.set(0, 0.02, 5.92);
  const glow2M = addM(0xe8fdff), glow2 = mesh(new THREE.BoxGeometry(0.5, 0.08, 1).translate(0, 0, 0.5), glow2M, g, 'exhaustCore'); glow2.position.set(0, 0.02, 5.92);
  const pad = [];
  for (const s of [-1, 1]) { const pv = new THREE.Group(); pv.position.set(0, 0.02 + s * 0.17, 5.9); g.add(pv); mesh(boxG(1.12, 0.03, 0.5, 0, 0, 0.25), compM, pv, 'vectorPaddle'); pad.push(pv); }
  // missile bay: two doors hinged at their outer edges (open while it fires), a dark bay behind them, the seam
  mesh(boxG(1.3, 0.05, 2.1, 0, -0.52, -0.4), darkM, g, 'bay');
  const doors = [];
  for (const s of [-1, 1]) { const pv = new THREE.Group(); pv.position.set(s * 0.7, -0.56, -0.4); g.add(pv); mesh(boxG(0.7, 0.02, 2.2, -s * 0.35, 0, 0), compM, pv, 'bayDoor'); doors.push({ pv, s }); }
  mesh(boxG(0.02, 0.025, 2.2, 0, -0.575, -0.4), seamM, g, 'bayseam');
  const tx = decal(rwTex('RW-4'), 1.4, 0.35, wingG[-1], 'stencil'); tx.position.set(-2.4, 0.075, 0.9); tx.rotation.set(-Math.PI / 2, 0, -0.35);
  // lights: a white strobe under the belly, cyan markers at the wingtips and the fin tips (they pulse with the seams)
  const L = new THREE.Group(); L.name = 'lights'; g.add(L);
  const strobe = lamp(L, 0xffffff, 0.06, V(0, -0.6, 1.6), 3.5), tipL = lamp(wingG[-1], 0x9ffcff, 0.05, V(-4.12, 0.07, 2.55)), tipR = lamp(wingG[1], 0x9ffcff, 0.05, V(4.12, 0.07, 2.55));
  // gear (only when lowered)
  const gearG = new THREE.Group(); g.add(gearG); gearG.name = 'gear';
  for (const p of SHRIKE.GEAR) { rod(V(p[0], -0.4, p[2]), V(p[0], p[1] + 0.3, p[2]), 0.09, M(0x8a8f95), gearG); mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 10).rotateZ(Math.PI / 2).translate(p[0], p[1] + 0.3, p[2]), M(0x1b1b1b), gearG, 'tyre'); }
  // damage: scorched ceramic and two holes on the right wing and the spine
  const sco = scorch(g, [[1.2, 0.64, 0.6, 0.5, 0.35, 0], [0.6, 0.62, -1.4, 0.3, 0.25, 0]]), scoW = scorch(wingG[1], [[2.9, 0.12, 1.9, 0.45, 0.3, 0], [3.1, 0.13, 2.0, 0.16, 0.12, 1], [1.8, 0.16, 0.4, 0.3, 0.2, 0]]);

  // ---- far level: one merged mesh (the same silhouette, flat colours), the seams as a glow
  const k = new Kit(), C = RW;
  k.oct(1, 0, 0, -0.3, C.ceramic, 1.55, 0.55, 5.9);
  k.prism([[0.9, -3], [4.1, 2], [4.1, 3.0], [3.2, 3.6], [1.0, 3.8], [-1.0, 3.8], [-3.2, 3.6], [-4.1, 3.0], [-4.1, 2], [-0.9, -3]], -0.03, 0.12, C.ceramic2);
  for (const s of [-1, 1]) k.box(0.08, 1.5, 1.9, s * 1.05, 0.85, 4.4, C.composite, [0, 0, -s * 0.62]);
  k.box(1.1, 0.34, 0.8, 0, 0.02, 5.6, C.composite); k.box(0.9, 0.3, 2.4, 0.55, 0.55, 0.6, C.composite2);
  k.strip([1.6, 0.08, -0.8], [0.3, 0.02, -5.6], 0.06, 0.04); k.strip([-1.6, 0.08, -0.8], [-0.3, 0.02, -5.6], 0.06, 0.04); k.glowBox(0.8, 0.12, 0.1, 0, 0.02, 6.0);
  const far = k.build(rwMats().body, rwMats().glow, 'shrikeFar');
  const lod = lodOf(g, far, 260, 3200, 'shrike');

  let dmg = 1, dead = false;
  function animate(A, dt = 0, time = 0) {
    if (lod.getCurrentLevel && lod.getCurrentLevel() !== 0) return;   // far: nothing to pose
    const S = A.surf || {}, el = S.stab || 0, ail = S.ail || 0, rud = S.rud || 0;
    surf.elevR.rotation.x = -(el + ail); surf.elevL.rotation.x = -(el - ail);
    surf.rudR.rotation.x = rud - el * 0.4; surf.rudL.rotation.x = rud + el * 0.4;
    pad[0].rotation.x = pad[1].rotation.x = -el * 0.8;   // the paddles vector the jet with the pitch command
    const n = dead ? 0 : A.eng ? A.eng[0].n : 0.8, kk = Math.max(0, (n - 0.6) / 0.4);
    glow.scale.set(1, 1, 0.5 + 3 * kk * (1 + 0.08 * Math.sin(time * 37))); glowM.opacity = 0.08 + 0.25 * kk; glow.visible = !dead;
    glow2.scale.set(1, 1, 0.3 + 1.6 * kk); glow2M.opacity = 0.1 + 0.3 * kk; glow2.visible = !dead;
    faceM.emissive.setRGB(0.04 + 0.2 * kk, 0.2 + 0.4 * kk, 0.24 + 0.4 * kk);
    // the seams breathe; hurt, they stutter; dead, they are dark
    const stutter = dmg < 0.75 && (Math.sin(time * 23) + Math.sin(time * 7.3)) > 1.2;
    seamM.color.setHSL(0.5, dead ? 0 : 1, dead ? 0.08 : stutter ? 0.2 : 0.72 + 0.12 * Math.sin(time * 2.2));
    ringM.color.setHSL(0.5, 1, dead ? 0.05 : 0.5 + 0.35 * Math.max(0, Math.sin(time * 3.1)));
    ring.rotation.y = Math.sin(time * 0.8) * 0.4;
    const bay = Math.max(0, Math.min(1, (A.bayT || 0) * 2));   // airwar.js sets bayT when it fires
    for (const d of doors) d.pv.rotation.z = d.s * bay * 1.3;
    strobe.on(!dead && time % 1.3 < 0.06 ? 1 : 0);
    const tp = dead ? 0 : 0.35 + 0.35 * Math.sin(time * 2.2); tipL.on(tp); tipR.on(tp);
    gearG.visible = (A.gear ?? 0) > 0.5;
  }
  function setDamage(f) { dmg = f; sco.visible = scoW.visible = f < 0.99; }
  function kill() { dead = true; setDamage(0); }
  animate({});
  return { group: lod, detail: g, far, animate, setDamage, kill, nozzles: [V(0, 0.02, 6.0)], tips: [V(-4.1, 0.05, 2.6), V(4.1, 0.05, 2.6)],
    damagePts: [V(0, 0.1, 5.4), V(2.9, 0.15, 1.9)], breakable: [wingG[1], finG[-1]], parts: { surf } };
}

// ============================================================================================ MQ-9 REAPER
export function buildReaperModel() {
  const g = new THREE.Group(); g.name = 'reaper';
  const greyM = M(0x8d9398), lightM = M(0xa3a9ad), darkM = M(0x2a2d30), blackM = M(0x0f1011), patchM = M(0x6e7479), cyanS = cyanM(), podM = M(0x1d2023), grimeM = M(0x5f6366);
  // fuselage: bulbous satcom nose, slender body, tapering to the pusher; half profile [top, side, keel]
  const P = [
    [-5.45, [[0, 0.05], [0, 0.05], [0, 0.05]]],
    [-5.2, [[0, 0.32], [0.28, 0.08], [0, -0.22]]],
    [-4.6, [[0, 0.55], [0.42, 0.12], [0, -0.32]]],
    [-3.8, [[0, 0.6], [0.45, 0.1], [0, -0.36]]],
    [-2.6, [[0, 0.46], [0.42, 0.04], [0, -0.38]]],
    [0.0, [[0, 0.42], [0.4, 0.02], [0, -0.38]]],
    [2.6, [[0, 0.34], [0.3, 0.02], [0, -0.3]]],
    [4.6, [[0, 0.2], [0.17, 0.02], [0, -0.17]]],
    [5.1, [[0, 0.14], [0.12, 0.02], [0, -0.12]]],
  ];
  const rings = P.map(([z, h]) => { const r = [...h.map(([x, y]) => [x, y, z]), ...h.slice(0, 2).reverse().map(([x, y]) => [-x, y, z])]; r.push(r[0]); return r; });
  mesh(loft(rings), greyM, g, 'fuselage');
  // engine bay detail: the NACA intake on the spine, exhaust stubs either side of the tail cone, oil-streak grime
  mesh(boxG(0.34, 0.08, 0.7, 0, 0.42, 1.6), darkM, g, 'nacaIntake'); mesh(boxG(0.26, 0.02, 0.5, 0, 0.465, 1.62), blackM, g, 'nacaMouth');
  for (const s of [-1, 1]) { mesh(cylZ(0.07, 0.06, 0.35, 6).rotateY(s * 0.6).translate(s * 0.3, 0.05, 3.7), M(0x3b342e), g, 'exhaustStub'); mesh(boxG(0.012, 0.18, 1.3, s * 0.27, 0.0, 4.3), grimeM, g, 'exhaustStain'); }
  // straight high-aspect wing (20.1 m), slightly tapered; ailerons and flaps; the outer left panel can come off
  const surf = {}, outer = {};
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R', map = (a, b, w) => [s * a, 0.18 + a * 0.012 + w, b], LE = x => -0.85 + x * 0.025, TE = x => 0.55 - x * 0.03;
    const O = new THREE.Group(); O.name = 'outerWing' + S; g.add(O); outer[s] = O;
    mesh(slab([[0.35, LE(0.35), .2], [5.6, LE(5.6), .12], [5.6, TE(5.6) - 0.31, .1], [3.0, TE(3.0) - 0.32, .12], [0.35, TE(0.35) - 0.32, .16]], map), lightM, g, 'wing' + S);
    mesh(slab([[5.6, LE(5.6), .12], [10.05, LE(10.05), .07], [10.05, TE(10.05), .05], [7.2, TE(7.2) - 0.3, .07], [5.6, TE(5.6) - 0.31, .1]], map), lightM, O, 'wingOuter' + S);
    const hp = (x, z) => V(...map(x, z, 0)), pair = (a, b) => s > 0 ? [a, b] : [b, a];
    surf['ail' + S] = hinged(O, slab([[7.2, TE(7.2) - 0.3, .06], [10.0, TE(10.0) - 0.3, .04], [10.0, TE(10.0), .03], [7.2, TE(7.2), .04]], map), lightM, ...pair(hp(7.2, TE(7.2) - 0.3), hp(10.0, TE(10.0) - 0.3)), 'ail' + S);
    surf['flap' + S] = hinged(g, slab([[0.5, TE(0.5) - 0.32, .1], [7.1, TE(7.1) - 0.3, .07], [7.1, TE(7.1), .05], [0.5, TE(0.5), .06]], map), lightM, ...pair(hp(0.5, TE(0.5) - 0.32), hp(7.1, TE(7.1) - 0.3)), 'flap' + S);
    // pylons (empty: the machines fly her as a spotter), the wingtip skid fairing
    for (const x of [3.2, 5.0]) mesh(boxG(0.1, 0.28, 0.9, s * x, 0.0, -0.2), darkM, g, 'pylon');
    mesh(boxG(0.08, 0.1, 0.9, s * 10.05, 0.3, -0.3), darkM, O, 'tipFairing');
    // RUNAWAY refit: cyan IFF strip near the tip, old marking painted out with a darker patch, a USAF serial stub
    mesh(boxG(0.7, 0.02, 1.25, s * 8.8, 0.32, -0.25), cyanS, O, 'iff');
    mesh(boxG(1.1, 0.012, 0.8, s * 5.2, 0.29, -0.3), patchM, g, 'paintedOut');
  }
  // V-tail (two upper surfaces at ~45°) with ruddervators, ventral fin; the left tail can come off
  const tailG = {};
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R', cant = 0.78, map = (z, v, w) => [s * (v * Math.sin(cant) + w * Math.cos(cant)), 0.2 + v * Math.cos(cant) - w * Math.sin(cant), z];
    const TG = new THREE.Group(); TG.name = 'vtail' + S; g.add(TG); tailG[s] = TG;
    mesh(slab([[3.5, 0.1, .1], [4.4, 2.2, .06], [4.95, 2.2, .05], [4.85, 0.1, .08]], map), greyM, TG, 'vtail' + S);
    surf['rv' + S] = hinged(TG, slab([[4.85, 0.15, .05], [4.95, 2.1, .04], [5.25, 2.1, .03], [5.2, 0.15, .04]], map), greyM, V(...map(4.85, 0.15, 0)), V(...map(4.95, 2.1, 0)), 'ruddervator' + S);
    mesh(new THREE.BoxGeometry(0.02, 0.025, 0.5).translate(...map(4.6, 1.9, 0.05)), cyanS, TG, 'iffTail');
  }
  mesh(slab([[3.6, 0, .08], [4.9, 0, .06], [5.0, 1.15, .05], [4.6, 1.15, .05]], (z, v, w) => [w, -0.15 - v, z]), greyM, g, 'ventralFin');
  // pusher prop: three blades, spinner; a spinning disc at speed
  const prop = new THREE.Group(); prop.position.set(0, 0.02, 5.3); g.add(prop);
  mesh(new THREE.ConeGeometry(0.16, 0.45, 10).rotateX(Math.PI / 2).translate(0, 0, 0.22), darkM, prop, 'spinner');
  const blades = [];
  for (let k = 0; k < 3; k++) { const b = mesh(merge([boxG(0.13, 1.25, 0.04, 0, 0.66, 0), boxG(0.1, 0.06, 0.045, 0, 1.26, 0)]), blackM, prop, 'blade'); b.rotation.z = k * Math.PI * 2 / 3; b.rotation.y = 0.25; blades.push(b); }
  const discM = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  mesh(new THREE.RingGeometry(0.2, 1.3, 24), discM, prop, 'propDisc');
  // sensor ball under the nose (MTS-B), RUNAWAY sensor pod bolted under the left wing, satcom dome bump, antennas
  const ball = new THREE.Group(); ball.position.set(0, -0.48, -4.05); g.add(ball);
  mesh(cylZ(0.16, 0.16, 0.25, 8).rotateX(Math.PI / 2).translate(0, 0.15, 0), darkM, ball, 'ballMount');
  const turret = new THREE.Group(); ball.add(turret);
  mesh(new THREE.SphereGeometry(0.27, 10, 8), M(0x3a3f44, { shininess: 50 }), turret, 'ball');
  mesh(new THREE.CircleGeometry(0.11, 10).translate(0, 0, -0.272).rotateY(Math.PI), M(0x0a1a22, { emissive: 0x0a3040, shininess: 99 }), turret, 'aperture');
  mesh(new THREE.CircleGeometry(0.05, 8).translate(0.13, 0.05, -0.262).rotateY(Math.PI), M(0x0a1a22, { emissive: 0x0a3040, shininess: 99 }), turret, 'aperture2');
  const pod = mesh(merge([cylZ(0.18, 0.18, 2.1, 8), new THREE.SphereGeometry(0.18, 8, 6).translate(0, 0, -1.05)]), podM, g, 'rwPod'); pod.position.set(-3.6, -0.15, -0.3);
  const podRingM = cyanM(); mesh(new THREE.TorusGeometry(0.185, 0.02, 4, 12).translate(0, 0, -0.5), podRingM, pod, 'podRing'); rod(V(-3.6, 0.12, -0.3), V(-3.6, -0.02, -0.3), 0.08, darkM, g, 'podPylon');
  mesh(new THREE.SphereGeometry(0.09, 8, 6).translate(0, 0, -1.2), M(0x0a1418, { emissive: 0x0b4048, shininess: 90 }), pod, 'podLens');
  for (const [x, z] of [[0, -1.0], [0.18, 1.5]]) mesh(boxG(0.03, 0.32, 0.18, x, 0.55, z), darkM, g, 'antenna');
  mesh(boxG(0.02, 0.02, 1.6, -0.12, 0.5, -0.4), darkM, g, 'satcomCable');   // a crude RUNAWAY run over the spine
  const st = decal(rwTex('RW-Q9'), 1.2, 0.3, g, 'stencil'); st.position.set(0.42, 0.05, -1.8); st.rotation.y = Math.PI / 2;
  const st2 = decal(rwTex('RW-Q9'), 1.2, 0.3, g, 'stencil'); st2.position.set(-0.42, 0.05, -1.8); st2.rotation.y = -Math.PI / 2;
  // lights as she came from the USAF: nav red port / green starboard / white tail, red anti-collision on the spine;
  // the RUNAWAY added a cyan IFF beacon on the belly
  const LG = new THREE.Group(); LG.name = 'lights'; g.add(LG);
  const navL = lamp(outer[-1], 0xff2a20, 0.05, V(-10.1, 0.33, -0.7)), navR = lamp(outer[1], 0x30ff60, 0.05, V(10.1, 0.33, -0.7)), tail = lamp(LG, 0xffffff, 0.04, V(0, 0.05, 5.55));
  const beacon = lamp(LG, 0xff2010, 0.06, V(0, 0.45, 0.4), 3.5), iffB = lamp(LG, 0x80f8ff, 0.06, V(0, -0.42, 1.0), 3.5);
  const gearG = new THREE.Group(); g.add(gearG);
  for (const p of REAPER.GEAR) { rod(V(p[0], -0.3, p[2]), V(p[0], p[1] + 0.22, p[2]), 0.06, M(0x8a8f95), gearG); mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10).rotateZ(Math.PI / 2).translate(p[0], p[1] + 0.22, p[2]), M(0x1b1b1b), gearG, 'tyre'); }
  const sco = scorch(g, [[0.2, 0.43, 2.4, 0.4, 0.5, 0], [-6.2, 0.29, 0.0, 0.5, 0.35, 0], [-6.3, 0.3, -0.05, 0.14, 0.12, 1], [0.0, 0.45, -1.4, 0.28, 0.4, 0]]);

  // ---- far level
  const k = new Kit(), C = RW;
  k.oct(1, 0, 0.05, -0.2, 0x8d9398, 0.45, 0.45, 5.3); k.sphere(0.5, 0, 0.1, -4.1, 0x8d9398, 0.9, 1.0, 1.6, 6, 4);
  k.box(20.1, 0.12, 1.1, 0, 0.22, -0.2, 0xa3a9ad);
  for (const s of [-1, 1]) k.box(0.08, 2.2, 1.2, s * 0.75, 0.95, 4.4, 0x8d9398, [0, 0, -s * 0.78]);
  k.box(0.07, 1.1, 1.0, 0, -0.65, 4.4, 0x8d9398); k.glowBox(0.7, 0.04, 1.2, -8.8, 0.33, -0.25); k.glowBox(0.7, 0.04, 1.2, 8.8, 0.33, -0.25);
  k.cyl(1.25, 1.25, 0.05, 10, 0, 0.02, 5.32, C.composite, [Math.PI / 2, 0, 0]);
  const far = k.build(rwMats().body, rwMats().glow, 'reaperFar');
  const lod = lodOf(g, far, 320, 3600, 'reaper');

  let spin = 0, dmg = 1, dead = false, nNow = 0.7;
  function animate(A, dt = 0, time = 0) {
    const n = dead ? (nNow = Math.max(0, nNow - dt * 0.25)) : (nNow = A.eng ? A.eng[0].n : (A.prop ?? 0.6));
    spin += dt * (10 + 160 * n);
    if (lod.getCurrentLevel && lod.getCurrentLevel() !== 0) return;
    const S = A.surf || {}, ail = S.ail || 0, el = S.stab || 0, rud = S.rud || 0;
    surf.ailR.rotation.x = -ail; surf.ailL.rotation.x = ail; surf.flapR.rotation.x = surf.flapL.rotation.x = (S.flap || 0) * 0.5;
    surf.rvR.rotation.x = rud - el * 0.7; surf.rvL.rotation.x = rud + el * 0.7;
    prop.rotation.z = spin;
    const wob = dmg < 0.7 && !dead ? 0.05 : 0; prop.rotation.x = wob * Math.sin(spin); prop.rotation.y = wob * Math.cos(spin);   // a hit blade: out of balance
    discM.opacity = Math.min(0.35, n * 0.5); for (const b of blades) b.visible = n < 0.25;
    turret.rotation.y = Math.sin(time * 0.2) * 1.2; turret.rotation.x = 0.35 + 0.2 * Math.sin(time * 0.13);
    const lit = !dead;
    navL.on(lit ? 1 : 0); navR.on(lit ? 1 : 0); tail.on(lit ? 0.8 : 0);
    beacon.on(lit && (time % 1.2) < 0.1 ? 1 : 0); iffB.on(lit ? 0.4 + 0.4 * Math.max(0, Math.sin(time * 4)) : 0);
    podRingM.color.setHSL(0.5, 1, lit ? 0.6 + 0.2 * Math.sin(time * 2) : 0.06);
    gearG.visible = (A.gear ?? 0) > 0.5;
  }
  function setDamage(f) { dmg = f; sco.visible = f < 0.99; surf.ailR.visible = f > 0.5; }
  function kill() { dead = true; setDamage(0); }
  animate({});
  return { group: lod, detail: g, far, animate, setDamage, kill, nozzles: [V(0, 0.02, 5.4)], tips: [V(-10, 0.3, -0.4), V(10, 0.3, -0.4)],
    damagePts: [V(0, 0.2, 4.0), V(-6.2, 0.3, 0)], breakable: [outer[-1], tailG[-1]], parts: { surf, prop, ball } };
}

// ============================================================================================ SHAHED-style
// A cropped delta with tip fins (~3.5 m, 2.5 m span), the pointed warhead nose, a body tube, an air-cooled piston engine
// at the back with a two-blade pusher and its exhaust; the rail booster (a rocket bottle under the belly) burns for
// 2.5 s off the rail and falls away. Drab, chipped paint, the RUNAWAY's cyan strips and stencil.
export function buildShahedModel() {
  const g = new THREE.Group(); g.name = 'shahed';
  const drabM = M(0x8b8a7a), drab2M = M(0x77766a), darkM = M(0x3a3b36), blackM = M(0x121212), metalM = M(0x55585a, { shininess: 40 }), cyanS = cyanM(), noseM = M(0x6f6e60);
  mesh(slab([[0, -1.3, .1], [1.25, 1.05, .05], [1.25, 1.3, .045], [0.32, 1.2, .1], [-0.32, 1.2, .1], [-1.25, 1.3, .045], [-1.25, 1.05, .05]], (a, b, w) => [a, 0.02 + w, b]), drabM, g, 'delta');
  for (const s of [-1, 1]) {
    mesh(slab([[0.35, -0.45, .02], [0.95, 0.55, .02], [0.75, 0.6, .02], [0.25, -0.3, .02]], (a, b, w) => [s * a, 0.075 + w, b]), drab2M, g, 'panel');   // a repainted panel
    mesh(boxG(0.32, 0.01, 0.02, s * 0.5, 0.075, 0.95), darkM, g, 'elevonLine');
  }
  mesh(merge([cylZ(0.2, 0.17, 2.0, 10).translate(0, 0.08, 0.1), cylZ(0.12, 0.2, 0.5, 10).translate(0, 0.08, -1.15)]), drabM, g, 'body');
  mesh(new THREE.ConeGeometry(0.12, 0.35, 10).rotateX(-Math.PI / 2).translate(0, 0.08, -1.57), noseM, g, 'nose');   // the warhead's nose
  mesh(new THREE.TorusGeometry(0.2, 0.015, 4, 12).translate(0, 0.08, -0.85), darkM, g, 'joint');
  const fins = [];
  for (const s of [-1, 1]) {
    const F = new THREE.Group(); F.name = 'tipFin'; g.add(F); fins.push(F);
    mesh(slab([[0.75, 0, .04], [1.3, 0, .03], [1.32, 0.42, .03], [1.0, 0.42, .03]], (z, v, w) => [s * 1.24 + w, v - 0.05, z]), darkM, F, 'tipFin');
    mesh(slab([[0.75, 0, .04], [1.25, 0, .03], [1.2, -0.16, .03], [0.95, -0.16, .03]], (z, v, w) => [s * 1.24 + w, v - 0.05, z]), darkM, F, 'tipFinLow');
  }
  // the engine: an air-cooled flat twin under a cowl, cooling fins, the exhaust pipe, the two-blade pusher
  mesh(boxG(0.34, 0.26, 0.42, 0, 0.12, 1.0), darkM, g, 'engine');
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) mesh(boxG(0.1, 0.18, 0.02, s * 0.22, 0.12, 0.85 + i * 0.07), metalM, g, 'coolingFin');
  mesh(cylZ(0.03, 0.03, 0.4, 6).rotateX(0.3).translate(0.12, -0.04, 1.05), M(0x4a3a2c), g, 'exhaustPipe');
  const prop = new THREE.Group(); prop.position.set(0, 0.12, 1.28); g.add(prop);
  const blades = [];
  for (let k = 0; k < 2; k++) { const b = mesh(boxG(0.07, 0.75, 0.02, 0, 0.36, 0), blackM, prop, 'blade'); b.rotation.z = k * Math.PI; b.rotation.y = 0.3; blades.push(b); }
  const discM = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }); mesh(new THREE.RingGeometry(0.08, 0.75, 16), discM, prop, 'propDisc');
  mesh(boxG(0.012, 0.25, 0.012, 0.12, 0.33, -0.2), blackM, g, 'antenna');
  for (const s of [-1, 1]) mesh(boxG(0.5, 0.012, 0.12, s * 0.75, 0.075, 0.75), cyanS, g, 'rwStrip');
  const st = decal(rwTex('RW-S'), 0.7, 0.18, g, 'stencil'); st.position.set(0, 0.29, 0.1); st.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  // the rail booster under the belly: bottle, nozzle, its flame
  const boost = new THREE.Group(); boost.name = 'booster'; g.add(boost);
  mesh(cylZ(0.11, 0.11, 0.9, 8).translate(0, -0.2, 0.4), M(0x6a6c62), boost, 'boosterBottle');
  mesh(cylZ(0.06, 0.1, 0.15, 8).translate(0, -0.2, 0.92), darkM, boost, 'boosterNozzle');
  const flameM = addM(0xffb050), flame = mesh(new THREE.ConeGeometry(0.11, 1.4, 8).rotateX(Math.PI / 2).translate(0, -0.2, 1.7), flameM, boost, 'boosterFlame');
  const blink = lamp(g, 0x80f8ff, 0.025, V(0, 0.29, 0.5), 3);
  // far level
  const k = new Kit();
  k.prism([[0, -1.3], [1.25, 1.05], [1.25, 1.3], [-1.25, 1.3], [-1.25, 1.05]], -0.02, 0.1, 0x8b8a7a);
  k.cyl(0.18, 0.18, 2.6, 6, 0, 0.08, -0.2, 0x8b8a7a, [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) k.box(0.03, 0.5, 0.55, s * 1.24, 0.12, 1.05, 0x3a3b36);
  const far = k.build(rwMats().body, rwMats().glow, 'shahedFar');
  const lod = lodOf(g, far, 140, 1600, 'shahed');
  let spin = 0, dead = false, dropped = null;
  function animate(D, dt = 0, time = 0) {
    const thr = dead ? 0.1 : (D.ctl ? D.ctl.thr : 1);
    spin += dt * 140 * thr; prop.rotation.z = spin;
    const on = !dead && D.t !== undefined && D.t < 2.5;
    if (!on && boost.visible && D.t !== undefined && D.t > 0) { boost.visible = false; dropped = true; }
    else if (on && !dropped) { boost.visible = true; flame.scale.set(1, 1, 0.8 + 0.3 * Math.sin(time * 53)); flameM.opacity = 0.75; }
    for (const b of blades) b.visible = thr < 0.3; discM.opacity = 0.3 * Math.min(1, thr * 2);
    blink.on(!dead && time % 2 < 0.08 ? 0.8 : 0);
  }
  function setDamage() {}
  function kill() { dead = true; }
  animate({ t: 9 }); boost.visible = true; dropped = false;
  return { group: lod, detail: g, far, animate, setDamage, kill, nozzles: [V(0, 0.12, 1.3)], damagePts: [V(0, 0.12, 1.0)], breakable: [fins[0]], booster: V(0, -0.2, 1.0), parts: { prop } };
}
