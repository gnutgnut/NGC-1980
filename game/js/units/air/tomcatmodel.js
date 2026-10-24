// F-14A TOMCAT exterior model, 1980 fleet fighter, at real dimensions (19.1 m long, 19.54 / 11.65 m span at 20 / 68°,
// 4.88 m high: Jane's 1980-81) in the house style (flat-shaded, low-poly, colours from materials, small details as
// geometry). Everything that moves is driven by the sim (tomcatfm.js) through animate(A): swing wings (CADC sweep),
// glove vanes, slats, flaps, spoilers, differential stabilators, rudders, speedbrakes, gear (nose with launch bar),
// hook, canopy, TF30 nozzles and afterburner, lights, the missiles on their stations. Two crew (pilot and RIO).
// Paint: light gull grey over gloss white, 1980 VF squadron markings (fictional squadron VF-118 "ALBATROSS", tail code
// AB of the carrier ALBATROSS), full-colour national insignia, modex 2xx.
// Local frame: +x right, +y up, nose along -z, origin at the CG (wheel bottoms at y -2.5, as tomcatfm.js GEAR).
import * as THREE from 'three';
import { M, B, V, slab, loft, merge, cylZ, boxG, mesh, rod, hinged, arch, tube, wheel, addM, canvasTex, decal, drawStarBar } from './meshkit.js';
import { TOMCAT, STATIONS } from './tomcatfm.js';

const D2R = Math.PI / 180;
const HOOK_PIVOT = [0, -0.5, 5.45], HOOK_LEN = 3.15, HOOK_UP = 0.02, HOOK_DOWN = 0.627;   // down: tip at ~(0, -2.35, 8.0) = TOMCAT.HOOK_TIP
export const TCAT = {
  L: 19.1, EYE: [0, 1.12, -5.55], EYE_RIO: [0, 1.1, -4.25], PIVOT: [TOMCAT.PIVOT_X, 0.08, TOMCAT.PIVOT_Z],
  HOOK_PIVOT, HOOK_LEN, HOOK_UP, HOOK_DOWN, CANOPY_HINGE: [0, 1.06, -3.1], CANOPY_OPEN: 0.55,
};

// squadron art for the outer face of each fin: squadron band, tail code, modex
function tailArt(modex) {
  return canvasTex('tcatTail' + modex, 256, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    // the squadron's band: a sweeping blue stripe with a white albatross chevron, fin cap in squadron blue
    x.fillStyle = '#1f6fb8'; x.beginPath(); x.moveTo(0, h * 0.62); x.lineTo(w, h * 0.18); x.lineTo(w, h * 0.36); x.lineTo(0, h * 0.8); x.fill();
    x.fillStyle = '#f2f2ee'; x.beginPath(); x.moveTo(w * 0.32, h * 0.6); x.lineTo(w * 0.62, h * 0.4); x.lineTo(w * 0.86, h * 0.36); x.lineTo(w * 0.6, h * 0.47); x.lineTo(w * 0.42, h * 0.62); x.fill();
    x.fillStyle = '#16191c'; x.font = 'bold 74px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('AB', w * 0.5, h * 0.2);
    x.font = 'bold 28px sans-serif'; x.fillText(String(modex), w * 0.72, h * 0.92);
    x.font = 'bold 22px sans-serif'; x.fillStyle = '#1f6fb8'; x.fillText('NAVY', w * 0.3, h * 0.92);
  });
}
function noseNumber(modex) {
  return canvasTex('tcatModex' + modex, 128, 64, (x, w, h) => { x.clearRect(0, 0, w, h); x.font = 'bold 48px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#1b1e22'; x.fillText(String(modex), w / 2, h / 2 + 2); });
}
function intakeText() {
  return canvasTex('tcatNavy', 256, 64, (x, w, h) => { x.clearRect(0, 0, w, h); x.font = 'bold 40px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#1b1e22'; x.fillText('NAVY', w * 0.5, h * 0.5); });
}
const starTex = () => canvasTex('starbar', 256, 128, (x, w, h) => { x.clearRect(0, 0, w, h); drawStarBar(x, w, h); });

export function buildTomcatModel(side = 1, { modex = 201 } = {}) {
  const g = new THREE.Group(); g.name = 'tomcat';
  const greyM = M(0xa9afb4), whiteM = M(0xe4e6e3), radomeM = M(0xc8c4b4), darkM = M(0x25282b), blackM = M(0x0c0d0e, { shininess: 5 });
  const metalM = M(0x4c5055, { shininess: 50 }), gearM = M(0xe2e4e2), tyreM = M(0x1b1b1b, { shininess: 4 }), walkM = M(0x6d7277);
  const sqM = M(0x1f6fb8), redM = M(0xb52a22), glassM = new THREE.MeshPhongMaterial({ color: 0x9fc6d8, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
  const frameM = M(0x3a3e42), crewM = M(0x4d5a3c), helmM = M(0xeceee8), visorM = M(0x1d2a33, { shininess: 90 }), seatM = M(0x2c2f31);

  // ---- forward fuselage + spine: half profiles [top, upper, shoulder, side-hi, side, side-lo, chine, keel]
  const P = [
    [-10.6, Array(8).fill([0, -0.22])],
    [-10.25, [[0, -.05], [.09, -.07], [.15, -.12], [.18, -.18], [.19, -.24], [.17, -.31], [.11, -.37], [0, -.39]]],
    [-9.7, [[0, .12], [.17, .09], [.29, .0], [.35, -.12], [.37, -.24], [.33, -.38], [.21, -.5], [0, -.53]]],
    [-9.0, [[0, .26], [.25, .22], [.42, .09], [.5, -.07], [.52, -.24], [.47, -.45], [.3, -.62], [0, -.66]]],
    [-8.3, [[0, .37], [.31, .33], [.52, .18], [.6, -.02], [.62, -.24], [.58, -.52], [.38, -.74], [0, -.79]]],
    [-7.5, [[0, .5], [.34, .46], [.58, .31], [.67, .08], [.7, -.2], [.68, -.55], [.45, -.84], [0, -.9]]],
    [-6.9, [[0, .66], [.36, .62], [.62, .46], [.72, .2], [.75, -.15], [.73, -.56], [.5, -.88], [0, -.95]]],
    [-6.8, [[.55, .73], [.64, .72], [.7, .55], [.76, .25], [.79, -.12], [.76, -.56], [.52, -.9], [0, -.96]]],
    [-5.2, [[.56, .74], [.66, .73], [.74, .58], [.81, .28], [.84, -.1], [.82, -.56], [.56, -.92], [0, -.98]]],
    [-3.7, [[.55, .75], [.66, .74], [.77, .6], [.85, .3], [.88, -.08], [.86, -.55], [.6, -.92], [0, -.98]]],
    [-3.55, [[0, 1.02], [.38, .98], [.7, .8], [.88, .4], [.92, -.06], [.9, -.52], [.62, -.85], [0, -.9]]],
    [-2.2, [[0, 1.05], [.4, 1.0], [.76, .82], [.95, .42], [.98, 0], [.96, -.4], [.7, -.62], [0, -.66]]],
    [-0.6, [[0, .98], [.42, .94], [.82, .76], [1.0, .42], [1.02, 0.02], [.98, -.32], [.72, -.5], [0, -.54]]],
    [1.8, [[0, .86], [.44, .83], [.86, .66], [1.02, .38], [1.02, 0.02], [.96, -.3], [.7, -.46], [0, -.5]]],
    [4.2, [[0, .7], [.42, .68], [.82, .54], [.96, .3], [.96, 0], [.9, -.28], [.66, -.42], [0, -.46]]],
    [6.0, [[0, .5], [.38, .49], [.72, .4], [.84, .22], [.85, 0], [.8, -.22], [.6, -.33], [0, -.36]]],
    [6.9, [[0, .3], [.32, .3], [.6, .25], [.7, .14], [.72, 0], [.68, -.14], [.5, -.2], [0, -.22]]],
  ];
  const rings = P.map(([z, h]) => [...h.map(([x, y]) => [x, y, z]), ...h.slice(0, 7).reverse().map(([x, y]) => [-x, y, z])]);
  mesh(loft(rings, (r, k) => {
    const h = k < 7 ? k : 13 - k, z = P[r][0];
    if (z < -8.3) return 2;                      // radome (tan)
    if (z < -6.9 && h <= 1) return 3;            // anti-glare ahead of the windscreen
    return h >= 5 ? 1 : 0;                       // gloss white belly
  }, 4), [greyM, whiteM, radomeM, darkM, darkM], g, 'fuselage');
  for (const s of [-1, 1]) mesh(boxG(0.1, 0.03, 3.1, s * 0.6, 0.745, -5.25), darkM, g, 'coaming');
  // chin pod (AN/ALR-23 IRST of the early F-14A), pitot, AoA probes, gun muzzle, refuelling probe door
  mesh(merge([cylZ(0.13, 0.17, 0.75, 8), new THREE.SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0, -0.375)]).translate(0, -0.95, -8.2), darkM, g, 'chinPod');
  mesh(cylZ(0.015, 0.025, 0.55, 5).translate(0, -0.22, -10.85), metalM, g, 'pitot');
  for (const s of [-1, 1]) mesh(boxG(0.02, 0.08, 0.2, s * 0.68, 0.1, -7.6), metalM, g, 'aoaProbe');
  mesh(new THREE.CircleGeometry(0.06, 8).rotateY(-Math.PI / 2).translate(-0.735, -0.15, -8.4), blackM, g, 'gunMuzzle');
  for (let i = 0; i < 4; i++) mesh(boxG(0.02, 0.04, 0.12, -0.74, -0.08 - i * 0.05, -8.25), blackM, g, 'gunVent');
  mesh(boxG(0.03, 0.18, 0.7, 0.8, 0.5, -6.4), M(0x9aa0a5), g, 'probeDoor');
  // nose modex
  for (const s of [-1, 1]) { const d = decal(noseNumber(modex), 0.62, 0.31, g, 'modex'); d.position.set(s * 0.715, 0.02, -7.25); d.rotation.y = s * (Math.PI / 2 - 0.07); }

  // ---- gloves: the fixed inboard wing, from beside the cockpit out to the pivots; vanes in the leading edge
  const vanes = [];
  for (const s of [-1, 1]) {
    mesh(slab([[0.78, -6.7, .12], [1.35, -5.0, .2], [2.25, -3.3, .3], [3.35, -1.45, .36], [3.6, -0.6, .36], [3.58, 0.5, .32], [3.1, 2.4, .26], [2.15, 3.5, .2], [1.0, 3.2, .3], [0.9, -3.2, .3]],
      (a, b, w) => [s * a, 0.18 + w, b]), greyM, g, 'glove');
    // glove vane: a thin triangle that swings out of the glove leading edge (programmed out above M 1.4)
    const vp = new THREE.Group(); vp.position.set(s * 1.25, 0.2, -5.1); g.add(vp);
    mesh(slab([[0, 0, .03], [0.55, 1.4, .03], [0.1, 1.5, .03]], (a, b, w) => [s * a, w, b]), greyM, vp, 'gloveVane');
    vanes.push({ g: vp, s });
    // pivot fairing on top of the glove
    mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.12, 12).translate(s * TOMCAT.PIVOT_X, 0.38, TOMCAT.PIVOT_Z), M(0x9ea4a9), g, 'pivotCap');
  }

  // ---- intakes (raked 2D boxes, splitter plates) and nacelles to the TF30 nozzles
  for (const s of [-1, 1]) {
    const sh = new THREE.Shape([[1.05, 0.12], [2.08, 0.12], [2.18, 0.0], [2.18, -1.12], [2.06, -1.26], [1.07, -1.26], [1.0, -1.15], [1.0, 0.02]].map(([x, y]) => new THREE.Vector2(s * x, y)));
    const ig = new THREE.ExtrudeGeometry(sh, { depth: 3.0, bevelEnabled: false }), p = ig.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (z < 0.1) p.setZ(i, -3.95 + (0.12 - y) * 0.55);                                                       // raked mouth: top lip forward
      else p.setXYZ(i, s * (1.55 + (Math.abs(x) - 1.55) * 0.62), -0.55 + (y + 0.57) * 0.62, -0.8);              // fair into the round nacelle
    }
    ig.computeVertexNormals(); mesh(ig, [darkM, greyM], g, 'intake');
    // inside the mouth: the variable ramp (upper wall) and the dark duct; a lighter lip all round
    mesh(slab([[1.08, -3.7, .04], [2.1, -3.7, .04], [2.1, -2.2, .04], [1.08, -2.2, .04]], (a, b, w) => [s * a, 0.02 + w - (b + 3.7) * 0.12, b]), M(0x5d6268), g, 'intakeRamp');
    mesh(boxG(1.0, 1.1, 0.05, s * 1.59, -0.6, -2.4), blackM, g, 'intakeDuct');
    tube([[s * 1.0, 0.12, -3.95], [s * 2.18, 0.12, -3.95], [s * 2.18, -1.26, -3.2], [s * 1.0, -1.26, -3.2], [s * 1.0, 0.12, -3.95]], 0.035, M(0xb4babf), g, 'intakeLip', 16);
    mesh(slab([[-3.9, 0.15, .05], [-3.2, -1.2, .05], [-1.0, -1.0, .05], [-1.0, 0.1, .05]], (a, b, w) => [s * (0.97 + w), b, a]), M(0x9aa0a5), g, 'splitter');
    // nacelle: round, from the intake back to the nozzle (white underneath via a second, lower half)
    mesh(cylZ(0.68, 0.64, 7.7, 14).translate(s * 1.55, -0.55, 2.95), greyM, g, 'nacelle');
    mesh(cylZ(0.685, 0.645, 7.4, 14, true).translate(s * 1.55, -0.6, 3.0).scale(1, 1, 1), whiteM, g, 'nacelleBelly').scale.set(1, 0.98, 1);
    // ventral fin under each nacelle, canted out
    const vf = mesh(slab([[5.2, 0, .08], [6.9, 0, .06], [6.9, 0.55, .05], [5.9, 0.62, .05]], (a, b, w) => [w, -b, a]), greyM, g, 'ventral');
    vf.position.set(s * 1.3, -1.05, 0); vf.rotation.z = s * 0.45;
    // national insignia and NAVY on the intake side
    const st = decal(starTex(), 1.2, 0.6, g, 'insignia'); st.position.set(s * 2.19, -0.55, -2.05); st.rotation.y = s * Math.PI / 2;
    const nv = decal(intakeText(), 1.0, 0.25, g, 'navy'); nv.position.set(s * 2.19, -0.95, -0.9); nv.rotation.y = s * Math.PI / 2;
    // walkway stencil and a little panel-line wear on the glove
    mesh(boxG(0.5, 0.005, 1.2, s * 1.4, 0.56, -1.6), walkM, g, 'walkway');
  }
  // flat deck between the nacelles ("pancake") and the tunnel underneath, beaver tail between the nozzles
  mesh(slab([[-1.0, -0.8, .22], [1.0, -0.8, .22], [1.6, 0.5, .26], [1.6, 6.4, .2], [0.85, 7.1, .2], [-0.85, 7.1, .2], [-1.6, 6.4, .2], [-1.6, 0.5, .26]], (a, b, w) => [a, 0.08 + w, b]), greyM, g, 'deck');
  mesh(slab([[-0.85, 5.6, .22], [0.85, 5.6, .22], [0.85, 7.9, .2], [0.55, 9.05, .14], [-0.55, 9.05, .14], [-0.85, 7.9, .2]], (a, b, w) => [a, -0.12 + w, b]), greyM, g, 'beaverTail');
  mesh(cylZ(0.05, 0.04, 0.5, 6).translate(0, -0.1, 9.2), metalM, g, 'fuelDump');   // the fuel dump mast at the end of the beaver tail
  // speedbrakes: upper and lower panels on the beaver tail, hinged at their front edges
  const sbU = hinged(g, slab([[-0.5, 7.0, .03], [0.5, 7.0, .03], [0.45, 8.3, .03], [-0.45, 8.3, .03]], (a, b, w) => [a, -0.02 + w, b]), greyM, V(-0.5, -0.02, 7.0), V(0.5, -0.02, 7.0), 'speedbrakeUp');
  const sbL = [-1, 1].map(s => hinged(g, slab([[0.08, 7.0, .03], [0.5, 7.0, .03], [0.45, 8.2, .03], [0.1, 8.2, .03]], (a, b, w) => [s * a, -0.24 + w, b]), whiteM, V(-0.6, -0.24, 7.0), V(0.6, -0.24, 7.0), 'speedbrakeLow'));

  // ---- TF30 nozzles: shroud, petals (exit radius from the sim), liner, burner face, afterburner flame
  const eng = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.name = 'engine' + (s < 0 ? 'L' : 'R'); e.position.set(s * 1.55, -0.55, 0); g.add(e);
    mesh(cylZ(0.64, 0.6, 0.5, 14, true), metalM, e, 'shroud').position.z = 7.05;
    const petGeo = cylZ(0.6, 0.6, 0.85, 14, true), pp = petGeo.attributes.position, base = [];
    for (let i = 0; i < pp.count; i++) if (pp.getZ(i) > 0) base.push(i, pp.getX(i) / 0.6, pp.getY(i) / 0.6);
    const petals = mesh(petGeo, M(0x3e4146, { shininess: 60, side: THREE.DoubleSide }), e, 'petals'); petals.position.z = 7.72;
    mesh(cylZ(0.52, 0.52, 1.0, 12, true), M(0x111213, { side: THREE.BackSide }), e, 'liner').position.z = 7.4;
    const faceM = B(0x000000), face = mesh(new THREE.CircleGeometry(0.53, 14), faceM, e, 'burnerFace'); face.position.z = 7.0;
    mesh(cylZ(0.18, 0.0, 0.35, 8), M(0x1a1a1a), e, 'tailCone').position.z = 7.15;
    const cone = new THREE.CylinderGeometry(0, 1, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    const fl = new THREE.Group(); fl.position.z = 8.1; e.add(fl);
    const outer = mesh(cone, addM(0xff8a3a), fl, 'abOuter'), core = mesh(cone, addM(0x9cc2ff), fl, 'abCore'), dm = addM(0xd8e8ff), diamonds = [];
    for (let k = 0; k < 4; k++) diamonds.push(mesh(new THREE.SphereGeometry(1, 8, 4), dm, fl, 'shockDiamond'));
    eng.push({ petals, pp, base, faceM, fl, outer, core, dm, diamonds, ph: s * 1.7 });
  }

  // ---- vertical tails (canted 5° out) with rudders; squadron art on the outer faces; ECM fairings at the tips
  const CANT = 5 * D2R, FH = 2.4, surf = {};
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R';
    const map = (z, v, w) => [s * (1.62 + w * Math.cos(CANT) + v * Math.sin(CANT)), 0.15 - w * Math.sin(CANT) + v * Math.cos(CANT), z];
    const LE = v => 3.9 + v * 1.25, TE = v => 8.0 + v * 0.08, RH = v => TE(v) - 0.95;
    mesh(slab([[LE(0), 0, .3], [LE(FH), FH, .1], [TE(FH), FH, .08], [TE(1.9), 1.9, .08], [RH(1.9), 1.9, .2], [RH(0.25), 0.25, .2], [TE(0.25), 0.25, .08], [TE(0), 0, .1]].map(([z, v, t]) => [z, v, t]), map), greyM, g, 'fin' + S);
    const a = V(...map(RH(0.25), 0.25, 0)), b = V(...map(RH(1.9), 1.9, 0));
    surf['rud' + S] = hinged(g, slab([[RH(0.25), 0.25, .2], [TE(0.25), 0.25, .06], [TE(1.9), 1.9, .06], [RH(1.9), 1.9, .2]], map), sqM, a, b, 'rudder' + S);
    mesh(slab([[LE(FH) - 0.2, FH - 0.16, .14], [TE(FH) + 0.25, FH - 0.16, .14], [TE(FH) + 0.25, FH + 0.05, .14], [LE(FH), FH + 0.05, .14]], map), sqM, g, 'finCap' + S);
    // tail art plane on the outer face
    const art = decal(tailArt(modex), 2.3, 2.3, g, 'tailArt' + S);
    art.position.copy(V(...map(6.35, 1.2, 0.11)));   // texture u runs nose-ward as seen from outside, v up the fin
    art.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 0, -s), V(s * Math.sin(CANT), Math.cos(CANT), 0), V(s * Math.cos(CANT), -Math.sin(CANT), 0)));
    surf['finTip' + S] = V(...map(TE(FH), FH, 0));
    mesh(cylZ(0.09, 0.07, 0.9, 6).translate(...map(TE(FH) + 0.1, FH - 0.08, 0)), M(0x9ea4a9), g, 'finTipFairing');   // ECM / position light fairing
  }

  // ---- all-moving stabilators (differential for roll), pivots on the nacelle sides
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R', map = (x, z, w) => [s * x, -0.35 - (x - 2.15) * 0.05 + w, z];
    const geo = slab([[2.1, 5.45, .2], [5.05, 7.55, .06], [5.05, 8.3, .05], [2.1, 8.45, .12]], map);
    const p0 = V(s * 2.1, -0.35, 6.75), p1 = V(s * 5.05, -0.5, 6.75);
    surf['stab' + S] = hinged(g, geo, greyM, ...(s > 0 ? [p0, p1] : [p1, p0]), 'stab' + S);
  }

  // ---- swing wings: outer panels on the pivots, built at 20° sweep, slats, flaps, spoilers; insignia on the panels
  const wings = [];
  for (const s of [-1, 1]) {
    const pv = new THREE.Group(); pv.name = 'wingPivot' + (s < 0 ? 'L' : 'R'); pv.position.set(s * TOMCAT.PIVOT_X, 0.08, TOMCAT.PIVOT_Z); g.add(pv);
    const LEz = x => -0.45 + x * Math.tan(20 * D2R), TEz = x => 3.05 + x * 0.02, C = x => TEz(x) - LEz(x), T = x => Math.max(0.08, 0.32 - x * 0.035);
    const SL = x => LEz(x) + 0.16 * C(x), FL = x => TEz(x) - 0.28 * C(x);
    const map = (a, b, w) => [s * a, w, b], wv = (x, z, f) => [x, z, T(x) * f, 0.45];
    mesh(slab([wv(-0.2, LEz(-0.2), .4), wv(0.9, LEz(0.9), .4), wv(0.9, SL(0.9), .9), wv(6.3, SL(6.3), .9), wv(6.3, LEz(6.3), .35), wv(6.62, LEz(6.62) + 0.25, .3), wv(6.62, TEz(6.62) - 0.15, .2),
      wv(6.3, TEz(6.3), .12), wv(5.2, TEz(5.2), .12), wv(5.2, FL(5.2), .55), wv(0.9, FL(0.9), .55), wv(0.9, TEz(0.9), .12), wv(-0.2, TEz(-0.2), .12)], map), greyM, pv, 'wing');
    const hp = (x, z) => V(s * x, 0, z), pair = (a, b) => s > 0 ? [a, b] : [b, a];
    const slat = hinged(pv, slab([wv(0.9, LEz(0.9), .35), wv(6.3, LEz(6.3), .35), wv(6.3, SL(6.3), .9), wv(0.9, SL(0.9), .9)], map), greyM, ...pair(hp(0.9, SL(0.9)), hp(6.3, SL(6.3))), 'slat');
    const flap = hinged(pv, slab([wv(0.9, FL(0.9), .55), wv(5.2, FL(5.2), .55), wv(5.2, TEz(5.2), .12), wv(0.9, TEz(0.9), .12)], map), whiteM, ...pair(hp(0.9, FL(0.9)), hp(5.2, FL(5.2))), 'flap');
    flap.children[0].material = greyM;
    const spoilers = [];
    for (let k = 0; k < 4; k++) {
      const x0 = 1.3 + k * 0.95, x1 = x0 + 0.85, z0 = FL(x0) - 0.55, z1 = FL(x1) - 0.55;
      spoilers.push(hinged(pv, slab([[x0, z0, .02], [x1, z1, .02], [x1, z1 + 0.5, .02], [x0, z0 + 0.5, .02]], (a, b, w) => [s * a, T(a) * 0.5 + 0.005 + w, b]), M(0x9ea4a9), ...pair(hp(x0, z0), hp(x1, z1)).map(v => v.setY(T(1) * 0.5)), 'spoiler'));
    }
    // insignia: top of the left wing, underside of the right (1980 practice); nav light at the tip
    const ins = decal(starTex(), 1.6, 0.8, pv, 'wingStar'); ins.position.set(s * 4.3, s < 0 ? T(4.3) * 0.55 + 0.02 : -T(4.3) * 0.45 - 0.02, 1.25); ins.rotation.x = s < 0 ? -Math.PI / 2 : Math.PI / 2;
    const nav = mesh(new THREE.SphereGeometry(0.06, 6, 4), B(s < 0 ? 0xff2a1a : 0x2aff5a), pv, 'navLight'); nav.position.set(s * 6.6, 0, LEz(6.6) + 0.5);
    wings.push({ pv, slat, flap, spoilers, s });
  }

  // ---- windscreen and the big one-piece canopy over both cockpits (hinged at the back, swings up)
  const ws = new THREE.Group(); ws.name = 'windscreen'; g.add(ws);
  const wsR = [arch(-6.85, 0.8, 0.56, 0.72), arch(-6.55, 1.12, 0.59, 0.73), arch(-6.2, 1.38, 0.6, 0.74)];
  mesh(loft(wsR), glassM, ws, 'windscreenGlass');
  tube(arch(-6.2, 1.39, 0.61, 0.74), 0.035, frameM, ws, 'windscreenBow'); tube(arch(-6.84, 0.81, 0.57, 0.72), 0.025, frameM, ws, 'windscreenBase');
  const cg = new THREE.Group(); cg.name = 'canopy'; cg.position.set(...TCAT.CANOPY_HINGE); g.add(cg);
  const cv = new THREE.Group(); cv.position.set(...TCAT.CANOPY_HINGE).negate(); cg.add(cv);
  const cr = [[-6.2, 1.38, .6, .74], [-5.6, 1.58, .64, .74], [-4.9, 1.64, .65, .74], [-4.2, 1.6, .64, .75], [-3.7, 1.44, .6, .76], [-3.35, 1.22, .5, .85], [-3.1, 1.05, .38, .95]];   // the big bubble over both cockpits
  mesh(loft(cr.map(c => arch(...c))), glassM, cv, 'canopyGlass');
  tube(arch(-6.18, 1.39, 0.615, 0.74), 0.03, frameM, cv, 'canopyBow'); tube(arch(-4.85, 1.65, 0.655, 0.74), 0.028, frameM, cv, 'canopyMidBow');
  for (const s of [-1, 1]) tube(cr.map(([z, , hw, b]) => [s * (hw + 0.01), b + 0.01, z]), 0.035, frameM, cv, 'canopySill');
  // ---- two crew: pilot and RIO on GRU-7A seats, olive flight suits, white helmets, dark visors
  // (airai-polish) the crew as figures, matching the cockpit's RIO: shoulders and arms in the harness (torso pads, LPU
  // collar), HGU-33 white helmet with the visor down and a squadron stripe, oxygen mask and hose; the heads turn to
  // where the crew look (A.crewLook, a world point: the bandit, the lead, the ship) or scan the sky. Names are the ones
  // tomcatplay.js hides from the cockpit view (helmet / visor / torso / seatBack / headbox).
  const harnM = M(0x2a2d24), maskM = M(0x6d7064), lpuM = M(0xb8a24a), stripeM = M(0xd0a020);
  const heads = [];
  for (const [z, h] of [[-5.5, 0.02], [-4.2, 0.0]]) {
    mesh(boxG(0.56, 1.0, 0.18, 0, 0.25 + h, z + 0.42), seatM, g, 'seatBack'); mesh(boxG(0.5, 0.28, 0.22, 0, 0.92 + h, z + 0.4), seatM, g, 'headbox');
    mesh(merge([boxG(0.42, 0.42, 0.28, 0, 0.5 + h, z + 0.14), boxG(0.5, 0.12, 0.26, 0, 0.73 + h, z + 0.15)]), crewM, g, 'torso');   // chest, shoulders
    mesh(merge([boxG(0.06, 0.46, 0.04, -0.13, 0.52 + h, z - 0.005), boxG(0.06, 0.46, 0.04, 0.13, 0.52 + h, z - 0.005), boxG(0.44, 0.06, 0.04, 0, 0.36 + h, z - 0.005)]), harnM, g, 'torso');   // harness straps
    mesh(boxG(0.3, 0.05, 0.1, 0, 0.8 + h, z + 0.06), lpuM, g, 'torso');   // LPU collar
    for (const sx of [-1, 1]) {   // upper arms down along the sides, forearms forward to the stick / throttles (or the RIO's consoles)
      mesh(boxG(0.1, 0.32, 0.12, sx * 0.27, 0.56 + h, z + 0.12).rotateX(0.15), crewM, g, 'torso');
      mesh(boxG(0.09, 0.09, 0.32, sx * 0.25, 0.4 + h, z - 0.08), crewM, g, 'torso');
    }
    const hd = new THREE.Group(); hd.position.set(0, 1.0 + h, z); g.add(hd); heads.push({ g: hd, yaw: 0, pitch: 0, rio: heads.length === 1 });
    mesh(new THREE.SphereGeometry(0.15, 12, 9).translate(0, 0.05, 0.01), helmM, hd, 'helmet');
    mesh(boxG(0.03, 0.012, 0.15, 0, 0.198, 0.02), stripeM, hd, 'helmet');
    mesh(new THREE.SphereGeometry(0.153, 12, 6, -Math.PI * 0.78, Math.PI * 0.56, Math.PI * 0.33, Math.PI * 0.25).translate(0, 0.05, 0.01), visorM, hd, 'visor');
    mesh(new THREE.ConeGeometry(0.065, 0.12, 8).rotateX(-Math.PI / 2).translate(0, -0.04, -0.15), maskM, hd, 'helmet');
    mesh(cylZ(0.022, 0.022, 0.3, 6).rotateX(0.9).translate(0.05, -0.17, -0.06), maskM, hd, 'helmet');   // the mask's hose
  }
  mesh(boxG(0.95, 0.08, 0.5, 0, 0.66, -6.45), darkM, g, 'glareshield');
  mesh(boxG(0.85, 0.32, 0.12, 0, 0.66, -4.6), darkM, g, 'rioPanel');

  // ---- landing gear: nose (twin wheels, launch bar, retracts forward), mains (single wheels, fold forward/up)
  const NP = V(0, -0.85, -6.0), nose = new THREE.Group(); nose.name = 'noseGear'; nose.position.copy(NP); g.add(nose);
  const steer = new THREE.Group(); nose.add(steer);
  const nwy = TOMCAT.GEAR[0][1] + 0.28 - NP.y;
  rod(V(0, 0.02, 0), V(0, -0.8, 0), 0.14, gearM, steer, 'noseStrut');
  const nSl = new THREE.Group(); steer.add(nSl);
  rod(V(0, -0.55, 0), V(0, nwy, 0), 0.1, M(0xf0f2f4, { shininess: 80 }), nSl, 'noseSlider');
  mesh(boxG(0.4, 0.08, 0.08, 0, nwy, 0), gearM, nSl, 'noseAxle');
  wheel(0.28, 0.17, nSl, -0.19, nwy, 0, tyreM, gearM); wheel(0.28, 0.17, nSl, 0.19, nwy, 0, tyreM, gearM);
  const launchBar = rod(V(0, nwy + 0.25, -0.12), V(0, -2.5 - NP.y + 0.05, -0.95), 0.08, M(0x9aa0a6), nSl, 'launchBar');
  mesh(boxG(0.13, 0.13, 0.05, 0, -0.5, -0.1), M(0xfff6d0, { emissive: 0x444030 }), steer, 'taxiLight');
  const mains = [];
  for (const s of [-1, 1]) {
    const P0 = V(s * 2.2, -0.45, 0.35), W = V(s * 2.5, TOMCAT.GEAR[1][1] + 0.48, TOMCAT.GEAR[1][2]);   // wheel centre over the contract point
    const mg = new THREE.Group(); mg.name = 'mainGear' + (s < 0 ? 'L' : 'R'); mg.position.copy(P0); g.add(mg);
    const A2 = V(s * 2.3, W.y, W.z), u = V().subVectors(A2, P0).normalize(), a = V().subVectors(A2, P0), w = V().subVectors(W, P0);
    rod(V(), u.clone().multiplyScalar(0.9), 0.17, gearM, mg, 'mainStrut');
    rod(V(-s * 0.3, -0.2, -0.5), u.clone().multiplyScalar(0.7), 0.07, gearM, mg, 'mainBrace');
    const sl = new THREE.Group(); mg.add(sl);
    rod(u.clone().multiplyScalar(0.7), a, 0.11, M(0xf0f2f4, { shininess: 80 }), sl, 'mainOleo');
    mesh(boxG(0.28, 0.08, 0.08, (a.x + w.x) / 2, a.y, a.z), gearM, sl, 'mainAxle');
    wheel(0.48, 0.3, sl, w.x, w.y, w.z, tyreM, gearM);
    // gear door on the glove underside
    const door = mesh(boxG(0.04, 0.9, 1.4), whiteM, mg, 'gearDoor'); door.position.set(s * 0.35, -0.55, 0.2);
    const frame = (d, ax) => { const aa = ax.clone().addScaledVector(d, -ax.dot(d)).normalize(); return new THREE.Matrix4().makeBasis(d, aa, V().crossVectors(d, aa)); };
    const t = V(-0.25 * s, 0.25, -1).normalize(), qUp = new THREE.Quaternion().setFromRotationMatrix(frame(t, V(s, 0, 0)).multiply(frame(u, V(s, 0, 0)).transpose()));
    mains.push({ mg, sl, u, k: 1 / -u.y, qUp });
  }
  const q0 = new THREE.Quaternion();

  // ---- tailhook (under the beaver tail)
  const hook = new THREE.Group(); hook.name = 'tailhook'; hook.position.set(...HOOK_PIVOT); g.add(hook);
  mesh(boxG(0.09, 0.09, HOOK_LEN - 0.15, 0, 0, (HOOK_LEN - 0.15) / 2), M(0x60666b), hook, 'hookArm');
  mesh(boxG(0.11, 0.13, 0.25, 0, -0.02, HOOK_LEN - 0.1), M(0xe8e8e8), hook, 'hookShoe');
  for (let k = 0; k < 4; k++) mesh(boxG(0.1, 0.1, 0.18, 0, 0, 0.4 + k * 0.6), k % 2 ? M(0xe8e8e8) : M(0x1c1c1c), hook, 'hookStripe');

  // ---- lights: tail white, strobes at the fin tips, red beacons top and bottom, formation strips
  const lightG = new THREE.Group(); lightG.name = 'lights'; g.add(lightG);
  const bulb = (c, r, p, name) => { const m = mesh(new THREE.SphereGeometry(r, 6, 4), B(c), lightG, name); m.position.copy(p); return m; };
  bulb(0xffffff, 0.05, V(0, -0.05, 9.1), 'tailLight');
  const strobes = [bulb(0xffffff, 0.07, surf.finTipL.clone().add(V(-0.03, 0.06, 0)), 'strobeL'), bulb(0xffffff, 0.07, surf.finTipR.clone().add(V(0.03, 0.06, 0)), 'strobeR')];
  const beacon = bulb(0xff3020, 0.08, V(0, 1.06, -2.4), 'beacon'), beacon2 = bulb(0xff3020, 0.08, V(0, -0.58, 0.5), 'beaconLow');
  const formM = B(0x8fd060);
  for (const s of [-1, 1]) { mesh(boxG(0.02, 0.05, 0.7, s * 0.8, 0.15, -7.0), formM, lightG, 'formation'); mesh(boxG(0.02, 0.05, 0.7, s * 2.23, -0.35, 1.2), formM, lightG, 'formation'); }

  // ---- stores: AIM-54A Phoenix, AIM-7F Sparrow, AIM-9L Sidewinder on their stations, glove pylons and rails
  const fins = (r, span, chord, z) => [0, 1].map(k => boxG(span, 0.008, chord, 0, 0, z).rotateZ(Math.PI / 4 + k * Math.PI / 2));
  const geoOf = {
    aim54: merge([cylZ(0.19, 0.19, 3.6, 10), new THREE.ConeGeometry(0.19, 0.6, 10).rotateX(-Math.PI / 2).translate(0, 0, -2.1), ...fins(0.19, 1.0, 0.6, 1.4), ...fins(0.19, 0.7, 0.9, -0.4)]),
    aim7: merge([cylZ(0.1, 0.1, 3.3, 8), new THREE.ConeGeometry(0.1, 0.4, 8).rotateX(-Math.PI / 2).translate(0, 0, -1.85), ...fins(0.1, 0.85, 0.45, -0.4), ...fins(0.1, 0.78, 0.3, 1.5)]),
    aim9: merge([cylZ(0.064, 0.064, 2.75, 8), new THREE.SphereGeometry(0.064, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0, -1.375), ...fins(0.064, 0.36, 0.16, -1.0), ...fins(0.064, 0.62, 0.3, 1.15)]),
  };
  const matOf = { aim54: M(0xe9e9e4), aim7: M(0xe9e9e4), aim9: M(0xd5d7d2) }, bandM = M(0xc8a040);
  const stores = {};
  for (const [w, st] of [['aim9', '1A'], ['aim9', '8A'], ['aim54', '1B'], ['aim54', '8B'], ['aim7', '3'], ['aim7', '6'], ['aim54', '4'], ['aim54', '5'], ['aim7', '4'], ['aim7', '5'], ['aim7', '1B'], ['aim7', '8B'], ['aim54', '3'], ['aim54', '6']]) {
    const p = STATIONS[st], m = mesh(geoOf[w], matOf[w], g, w + '@' + st); m.position.set(...p); if (w !== 'aim9') m.position.y -= w === 'aim54' ? 0.12 : 0.02;
    mesh(cylZ(w === 'aim54' ? 0.192 : w === 'aim7' ? 0.102 : 0.066, w === 'aim54' ? 0.192 : w === 'aim7' ? 0.102 : 0.066, 0.1, 8), bandM, m).position.z = -0.9;
    m.visible = false; stores[w + '@' + st] = m;
  }
  for (const s of [-1, 1]) {
    mesh(boxG(0.16, 0.55, 2.3, s * 2.3, -0.6, -1.2), greyM, g, 'glovePylon');
    mesh(boxG(0.08, 0.1, 2.0, s * 2.62, -0.02, -1.6), metalM, g, 'sidewinderRail');
  }
  for (const z of [-3.2, 1.6]) for (const s of [-1, 1]) mesh(boxG(0.3, 0.12, 1.8, s * 0.62, -0.52, z), metalM, g, 'phoenixPallet');

  // ---- animation from the sim (or a plain state object for the preview page)
  const ZERO2 = [0, 0], WOW0 = [0, 0, 0];
  let hookA = HOOK_UP, sweepNow = 20;
  const shell = [cg, ws];
  function animate(A, dt = 0, time = 0, inside = false) {
    const S = A.surf || A, stab = S.stab || 0, ail = S.ail || 0, rud = S.rud || 0, sweep = A.sweep ?? 20;
    sweepNow = sweep;
    for (const W of wings) W.pv.rotation.y = -W.s * (sweep - 20) * D2R;
    const sd = ail * 0.55;   // differential tail for roll
    surf.stabR.rotation.x = -(stab + sd); surf.stabL.rotation.x = -(stab - sd);
    surf.rudR.rotation.x = rud; surf.rudL.rotation.x = rud;
    const fp = (S.flap || 0) * 0.6, le = -(S.lef || 0) * 0.35, spoilOk = sweep < 57;
    for (const W of wings) {
      W.flap.rotation.x = fp; W.slat.rotation.x = le;
      const up = spoilOk ? Math.max(0, W.s * ail) * 1.3 + (A.onGround && A.wow && A.wow[1] > 0.05 && (A.eas || 0) < 70 ? 0.9 : 0) : 0;   // roll spoilers, ground roll-out dump
      for (const sp of W.spoilers) sp.rotation.x = -Math.min(1, up);
    }
    for (const v of vanes) { const k = A.vane || 0; v.g.rotation.y = -v.s * k * 0.9; v.g.visible = k > 0.02; }
    const br = S.brake || 0; sbU.rotation.x = -br * 0.95; sbL[0].rotation.x = br * 0.95; sbL[1].rotation.x = br * 0.95;
    cg.rotation.x = (A.canopy || 0) * TCAT.CANOPY_OPEN;
    const gd = THREE.MathUtils.clamp(A.gear ?? 1, 0, 1), wow = A.wow || WOW0, up = 1 - gd;
    nose.rotation.x = up * 1.75; steer.rotation.y = -(A.steer || 0) * gd;
    nSl.position.y = Math.min(0.3, wow[0] || 0); launchBar.visible = !!A.launchBar && gd > 0.98;
    for (let i = 0; i < 2; i++) {
      const m = mains[i], c = Math.min(0.3, wow[i + 1] || 0) * m.k;
      m.sl.position.set(-m.u.x * c, -m.u.y * c, -m.u.z * c);
      m.mg.quaternion.slerpQuaternions(q0, m.qUp, THREE.MathUtils.smoothstep(up, 0, 1));
    }
    hookA = HOOK_UP + (HOOK_DOWN - HOOK_UP) * THREE.MathUtils.clamp(A.hook || 0, 0, 1); hook.rotation.x = hookA;
    const E = A.eng;
    for (let i = 0; i < 2; i++) {
      const e = eng[i], n = E ? E[i].n : (A.n || ZERO2)[i], nzl = E ? E[i].nozzle : (A.nozzle || [0.6, 0.6])[i], ab = E ? E[i].ab : (A.ab || ZERO2)[i];
      const k = 0.45 + 0.15 * THREE.MathUtils.clamp(nzl, 0, 1), pa = e.pp.array;
      for (let j = 0; j < e.base.length; j += 3) { pa[e.base[j] * 3] = e.base[j + 1] * k; pa[e.base[j] * 3 + 1] = e.base[j + 2] * k; }
      e.pp.needsUpdate = true;
      const a = THREE.MathUtils.clamp(ab, 0, 1), heat = Math.max(0, (n - 0.7) / 0.35) ** 2 * 0.35 + a * 0.6;
      e.faceM.color.setRGB(heat, heat * 0.45, heat * 0.15 + a * 0.25);
      e.fl.visible = a > 0.01;
      if (a > 0.01) {
        const fk = 1 + 0.07 * Math.sin(time * 41 + e.ph) + 0.05 * Math.sin(time * 67 + e.ph * 3), L = (0.8 + 5.2 * a) * fk, brr = inside ? 0.5 : 1;
        e.outer.scale.set(k * 1.02, k * 1.02, L); e.core.scale.set(k * 0.6, k * 0.6, L * 0.62);
        e.outer.material.opacity = (0.16 + 0.22 * a) * brr; e.core.material.opacity = (0.35 + 0.35 * a) * brr; e.dm.opacity = 0.85 * a * brr;
        for (let d = 0; d < 4; d++) { const z = (0.5 + 0.85 * d) * (0.75 + 0.25 * a) * fk, m = e.diamonds[d]; m.visible = z < L * 0.7; m.position.z = z; const r = k * (0.62 - 0.08 * d); m.scale.set(r * 0.5, r * 0.5, 0.3 * (1 - 0.15 * d)); }
      }
    }
    const lit = A.lights ?? true; lightG.visible = lit;
    if (lit) { const st = time % 1.1 < 0.07; strobes[0].visible = strobes[1].visible = st; beacon.visible = beacon2.visible = (time + 0.55) % 1.1 < 0.12; }
    for (const k in stores) stores[k].visible = false;
    if (A.stores && A.stores.length !== undefined) for (const s of A.stores) { const m = stores[s.w + '@' + s.st]; if (m) m.visible = !!s.on; }
    for (const o of shell) o.visible = !inside;
    // the crew's heads: toward A.crewLook (world) through the jet's own pose (g.position / g.quaternion, set by the caller
    // before animate), else a slow scan of the sky (the RIO mostly heads down on his TID)
    let ly = null, lp = 0;
    if (A.crewLook) {
      _lk.copy(A.crewLook).sub(g.position).applyQuaternion(_qi.copy(g.quaternion).invert());
      ly = Math.atan2(-_lk.x, -_lk.z); lp = Math.atan2(_lk.y, Math.hypot(_lk.x, _lk.z));
    }
    for (const H of heads) {
      let yw, pt;
      if (ly !== null) { yw = ly; pt = lp; }
      else if (H.rio) { const ph = time * 0.21 + 1.3; yw = Math.sin(ph) > 0.75 ? Math.sign(Math.sin(ph * 3.1)) * 1.4 : 0.1 * Math.sin(time * 0.7); pt = Math.sin(ph) > 0.75 ? 0.15 : -0.45; }
      else { yw = 0.9 * Math.sin(time * 0.33) * Math.sin(time * 0.11 + 1); pt = 0.12 + 0.12 * Math.sin(time * 0.27); }
      yw = THREE.MathUtils.clamp(yw, -2.0, 2.0); pt = THREE.MathUtils.clamp(pt, -0.6, 0.85);
      const k = Math.min(1, dt * 3.5); H.yaw += (yw - H.yaw) * k; H.pitch += (pt - H.pitch) * k;
      H.g.rotation.set(H.pitch, H.yaw, 0, 'YXZ');
    }
  }
  const _lk = V(), _qi = new THREE.Quaternion();
  // world-space-free helpers for the game: where the nozzles and wingtips are (for exhaust and vapour)
  const _t = V();
  function wingTipLocal(side, out = V()) {
    const a = sweepNow * D2R, x = 6.6 * Math.cos(a - 20 * D2R) + 0.35 * Math.sin(a - 20 * D2R), z0 = -0.45 + 6.6 * Math.tan(20 * D2R);
    void _t; return out.set(side * (TOMCAT.PIVOT_X + x), 0.08, TOMCAT.PIVOT_Z + 6.6 * Math.sin(a - 20 * D2R) + z0 * Math.cos(a - 20 * D2R));
  }
  function hookTip(out = V()) { return out.set(HOOK_PIVOT[0], HOOK_PIVOT[1] - HOOK_LEN * Math.sin(hookA), HOOK_PIVOT[2] + HOOK_LEN * Math.cos(hookA)); }
  animate({ sweep: 20, gear: 1, stores: [] });
  return { group: g, shell, animate, hookTip, wingTipLocal, nozzles: [V(-1.55, -0.55, 8.4), V(1.55, -0.55, 8.4)], parts: { wings, surf, nose, mains, hook, eng, stores, canopy: cg, vanes, lights: lightG } };
}
