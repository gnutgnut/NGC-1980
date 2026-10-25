// AH-1T Improved SeaCobra exterior (USMC, 1980). PARITY: the Task Force's attack helicopter.
// The slim Cobra: a 38 in wide fuselage, tandem cockpits under the curved 1970s canopy (gunner in front and low, pilot
// behind and raised; the flat-plate canopy came later, on the AH-1S / W), the twin-pac hump with the T400's two
// exhausts side by side, the big 2-blade teetering rotor (48 ft, 33 in chord) on its yoke with the pitch links, the
// rotor brake disc on the mast, the stretched AH-1T tailboom with the synchronised elevator, the swept fin with the
// tail rotor on the right, skids with the cross tubes, stub wings with two LAU-68 7-tube 2.75 in rocket pods (TOW
// launchers optional on the outboard stations), the M97 chin turret with the M197 20 mm three-barrel gun that
// traverses and elevates. 1980 USMC paint: overall gloss Marine green with black MARINES, the full-colour insignia,
// the HMA-269 "HF" tail code (squadron choice INFERRED) and the BuNo stencil; exhaust soot and grime.
// Real metres; local frame x right, y up, nose -z, origin at the CG, skids on the ground at y = -1.62.
// API: buildCobraMesh(o) -> { group, animate(S, dt, time), TURRET (local pivot), BARREL (m), PODS (local pod
//      muzzles), parts }.   S: { nr, tx, ty, cone, coll, turret: { yaw, pitch } (local, rad), firing, rocketT (s since
//      a rocket left), n1, run, light }
import * as THREE from 'three';
import { M, B, V, clamp, smooth, slab, loft, merge, cylZ, cylX, cylY, boxG, sphG, mesh, group, rodG, tubeG, bucket, rr, full, QH, shift, ringGeo, decal, canDecal, sideDecal, drawInsignia, drawText } from './modelkit.js';

const D2R = Math.PI / 180;
export const COBRAM = {
  GROUND: -1.62, R: 7.315, OMEGA: 294 * Math.PI / 30, TILT: 3 * D2R, HUB: [0, 2.30, -0.06],
  TR: [0.46, 1.75, 8.85], TR_R: 1.48, TR_RATIO: 4.71,
  TURRET: [0, -0.98, -4.02], BARREL: 1.55,
};
// fuselage stations [z, top, bottom, half width, top corner r, bottom corner r]
const FUS = [
  [-4.97, -0.42, -0.62, 0.04, 0.03, 0.03], [-4.82, -0.19, -0.80, 0.18, 0.11, 0.13], [-4.56, -0.03, -0.94, 0.32, 0.12, 0.21],
  [-4.15, 0.07, -1.03, 0.45, 0.1, 0.26], [-3.70, 0.10, -1.06, 0.48, 0.08, 0.27], [-3.0, 0.12, -1.07, 0.485, 0.08, 0.27],
  [-2.70, 0.14, -1.07, 0.485, 0.08, 0.27], [-2.45, 0.30, -1.07, 0.485, 0.08, 0.27], [-1.40, 0.36, -1.07, 0.485, 0.08, 0.27],
  [-0.95, 0.70, -1.06, 0.485, 0.2, 0.27], [-0.4, 0.86, -1.04, 0.485, 0.3, 0.27], [0.6, 0.88, -1.0, 0.48, 0.3, 0.27],
  [1.6, 0.84, -0.92, 0.47, 0.3, 0.26], [2.5, 0.72, -0.72, 0.43, 0.28, 0.24], [3.3, 0.56, -0.44, 0.36, 0.24, 0.2],
  [4.6, 0.46, -0.22, 0.29, 0.2, 0.16], [6.2, 0.40, -0.04, 0.23, 0.16, 0.13], [7.6, 0.38, 0.08, 0.18, 0.13, 0.1],
  [8.55, 0.40, 0.14, 0.15, 0.1, 0.08], [9.05, 0.40, 0.22, 0.06, 0.05, 0.05],
];
const FZ = FUS.map(f => f[0]);
// canopy stations [z, sill y, top y, half width at the sill]
const CAN = [[-4.12, 0.09, 0.10, 0.40], [-3.92, 0.09, 0.50, 0.45], [-3.62, 0.10, 0.78, 0.47], [-3.15, 0.11, 0.9, 0.48], [-2.78, 0.13, 0.92, 0.48],
  [-2.58, 0.22, 1.04, 0.48], [-2.30, 0.30, 1.22, 0.48], [-1.85, 0.33, 1.31, 0.48], [-1.35, 0.36, 1.29, 0.48], [-0.98, 0.62, 1.2, 0.47]];

export function buildCobraMesh(o = {}) {
  const g = new THREE.Group(); g.name = 'cobra';
  // 1980 USMC gloss Marine green (FS 14097-ish), a lighter weathered green for panels, grime, black, metal
  const greenM = M(0x43513a, { shininess: 34, specular: 0x30352a }), green2M = M(0x47553a, { shininess: 26 }), grimeM = M(0x2e3526, { shininess: 10 });
  const darkM = M(0x22261e), blackM = M(0x121311, { shininess: 6 }), metalM = M(0x4c4f50, { shininess: 50 }), steelM = M(0x6d7072, { shininess: 70 });
  const bladeM = M(0x252826, { shininess: 22 }), tipM = M(0xe2bb1a), sootM = M(0x221f1c, { shininess: 4 }), hubM = M(0x55585a, { shininess: 45 });
  const podM = M(0x4a5236, { shininess: 18 }), podFaceM = M(0x1a1c18), rocketM = M(0x8b8f7a), olivM = M(0x535a3c, { shininess: 15 });
  const glassM = new THREE.MeshPhongMaterial({ color: 0x7f9a98, specular: 0xffffff, shininess: 110, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  const frameM = M(0x2f3829, { shininess: 20 });
  const crew = { suit: M(0x5c6440), vest: M(0x3b4231), helmet: M(0x3f4a2c), skin: M(0xc19a77), visor: M(0x151515) };
  const body = bucket();

  // ---- fuselage skin: grime on the belly and round the hump; the lining inside the cockpits (dark)
  const rings = FUS.map(([z, t, b, w, rt, rb]) => full(rr(z, t, b, w, rt, rb, [t - rt - 0.05, (t + b) / 2, b + rb + 0.05].map(y => y))));
  const mats = [greenM, grimeM, green2M, sootM];
  mesh(loft(rings, (r, k) => { const q = QH(k), z0 = FZ[r]; if (q >= 11) return 1; if (z0 >= 2.5 && z0 < 4.6 && q <= 3) return 3; if (z0 >= 4.6 && z0 < 6.2 && q <= 1) return 3; if (z0 >= -0.4 && z0 < 2.5 && q >= 5 && q <= 6) return 2; return 0; }, 0, 0), mats, g, 'fuselage');
  // cockpit tubs (seen through the canopy): dark interior, instrument coamings, seats
  body.add(boxG(0.86, 0.04, 1.3, 0, -0.35, -3.35), darkM); body.add(boxG(0.86, 0.04, 1.4, 0, -0.18, -1.9), darkM);
  body.add(boxG(0.8, 0.22, 0.22, 0, 0.18, -3.95), blackM); body.add(boxG(0.8, 0.26, 0.24, 0, 0.42, -2.55), blackM);   // glare shields over the panels
  body.add(boxG(0.12, 0.2, 0.1, 0, 0.3, -3.88), darkM);   // the gunner's sight hood (the TSU, period: the M73 reflex sight)
  // crew: gunner in front (low), pilot behind (raised)
  const seated = (x, y, z) => {
    const p = geo => geo.translate(x, y, z);
    body.add(p(boxG(0.34, 0.14, 0.42, 0, 0.06, -0.17)), crew.suit); body.add(p(boxG(0.32, 0.36, 0.13, 0, -0.14, -0.42)), crew.suit);
    body.add(p(boxG(0.36, 0.5, 0.24, 0, 0.36, 0.02)), crew.suit); body.add(p(boxG(0.39, 0.34, 0.26, 0, 0.4, 0)), crew.vest);
    body.add(p(sphG(0.095, 0, 0.72, -0.04)), crew.skin); body.add(p(new THREE.SphereGeometry(0.135, 8, 5, 0, Math.PI * 2, 0, 1.9).translate(0, 0.75, 0)), crew.helmet);
    body.add(p(boxG(0.2, 0.06, 0.04, 0, 0.73, -0.13)), crew.visor);
    for (const k of [-1, 1]) body.add(p(rodG([k * 0.21, 0.55, 0], [k * 0.12, 0.38, -0.38], 0.09)), crew.suit);
    body.add(p(boxG(0.44, 0.08, 0.46, 0, -0.04, -0.05)), darkM); body.add(p(boxG(0.44, 0.75, 0.08, 0, 0.3, 0.2)), darkM);   // armoured seat
  };
  seated(0, -0.33, -3.15); seated(0, -0.14, -1.65);

  // ---- canopy: curved panels (glazing loft) with the frames: windscreen bow, the bow between the cockpits, the rails
  {
    const N = 8, cr = CAN.map(([z, s, t, w]) => { const pts = []; for (let i = 0; i <= N; i++) { const a = i / N * Math.PI, wt = w * (0.62 + 0.38 * Math.sin(a) ** 0.3); pts.push([Math.cos(a) * w * (1 - 0.35 * Math.sin(a) ** 2), s + (t - s) * Math.sin(a), z]); } return pts; });
    mesh(loft(cr, () => 0, -1, 0), glassM, g, 'canopy').renderOrder = 3;
    const fr = (k, w = 0.035) => { const ring = cr[k]; for (let i = 0; i < ring.length - 1; i++) body.add(rodG(ring[i], ring[i + 1], w), frameM); };
    fr(1, 0.05); fr(4); fr(5, 0.05); fr(9, 0.06);   // windscreen bow, the gunner's canopy aft frame, the pilot's front frame, the aft frame
    for (const s of [-1, 1]) {   // sill rails and the canopy-door hinge lines (the T's doors hinge on the right... both drawn)
      for (let k = 0; k < cr.length - 1; k++) { const a = cr[k][s > 0 ? 0 : N], b = cr[k + 1][s > 0 ? 0 : N]; body.add(rodG(a, b, 0.045), frameM); }
      for (let k = 1; k < cr.length - 1; k++) { const a = cr[k][s > 0 ? 2 : N - 2], b = cr[k + 1][s > 0 ? 2 : N - 2]; body.add(rodG(a, b, 0.025), frameM); }
    }
    for (let k = 1; k < cr.length - 1; k++) body.add(rodG(cr[k][N / 2], cr[k + 1][N / 2], 0.03), frameM);   // the top spine
  }

  // ---- the hump: engine (T400 twin-pac) and transmission fairing, intakes either side, the two exhausts side by side
  const HP = [[-1.1, 0.66, 0.3], [-0.85, 1.16, 0.42], [-0.35, 1.38, 0.45], [0.6, 1.45, 0.46], [1.5, 1.41, 0.45], [2.15, 1.24, 0.41], [2.55, 1.0, 0.34], [2.82, 0.76, 0.26]];
  body.add(loft(HP.map(([z, t, w]) => full(rr(z, t, 0.55, w, Math.min(0.3, w * 0.75), 0.04, [t - 0.3, t - 0.35, t - 0.4]))), (r, k) => (QH(k) <= 2 && r >= 4 ? 1 : 0), 0, 0), greenM);
  body.add(boxG(0.94, 0.04, 2.5, 0, 0.9, 0.7), grimeM);   // the oil-stained deck line along the hump's foot
  for (const s of [-1, 1]) {   // engine intakes (a raised lip round a dark screen with its bars), cowling panels, louvres
    body.add(boxG(0.1, 0.36, 0.6, s * 0.46, 1.1, -0.42), green2M); body.add(boxG(0.03, 0.26, 0.48, s * 0.51, 1.1, -0.42), blackM);
    for (let z = -0.6; z <= -0.24; z += 0.09) body.add(boxG(0.02, 0.27, 0.02, s * 0.525, 1.1, z), metalM);
    body.add(boxG(0.02, 0.34, 0.9, s * 0.462, 1.12, 1.0), green2M);
    for (let z = 0.65; z < 1.4; z += 0.12) body.add(boxG(0.025, 0.18, 0.04, s * 0.475, 1.18, z), darkM);
  }
  const exhausts = [];
  for (const s of [-1, 1]) {   // T400 exhausts: short stubs out of the hump's back, angled up and slightly out
    const eg = group(g, 'exhaust', s * 0.17, 1.12, 2.55); eg.rotation.x = 0.35; eg.rotation.y = s * 0.12;
    mesh(cylZ(0.16, 0.15, 0.5, 12, true).translate(0, 0, 0.18), M(0x3a3632, { shininess: 40, side: THREE.DoubleSide }), eg);
    const heat = mesh(new THREE.CircleGeometry(0.14, 12), B(0x000000), eg, 'exhaustGlow'); heat.position.z = 0.2; exhausts.push(heat);
  }
  // mast fairing, mast, rotor brake disc, swashplate (the rotating head is below)
  body.add(cylY(0.32, 0.2, 0.36, 10).translate(0, 1.6, -0.06), green2M);   // the pylon fairing round the mast base
  body.add(cylY(0.09, 0.08, 0.5, 10).translate(0, 2.0, -0.06), steelM);
  body.add(cylY(0.25, 0.25, 0.035, 16).translate(0, 1.8, -0.06), steelM); body.add(boxG(0.12, 0.09, 0.1, 0.21, 1.82, -0.06), darkM);   // rotor brake disc + caliper
  body.add(cylY(0.3, 0.25, 0.09, 12).translate(0, 1.92, -0.06), metalM);   // swashplate
  for (const s of [-1, 1]) body.add(rodG([s * 0.22, 1.78, -0.06], [s * 0.26, 1.92, -0.06], 0.04, 4), steelM);   // scissors / servo rods

  // ---- stub wings with pylons, rocket pods (LAU-68 inboard), TOW launchers or bare outboard pylons
  const PODS = [];
  for (const s of [-1, 1]) {
    body.add(slab([[0.44, -0.56, 0.24], [1.64, -0.36, 0.14], [1.64, 0.40, 0.12], [0.44, 0.56, 0.22]], (a, b, w) => [s * a, -0.28 + w - (a - 0.44) * 0.06, b - 0.15]), greenM);
    body.add(boxG(0.03, 0.14, 0.72, s * 1.65, -0.35, -0.12), darkM);   // wing tip cap
    for (const [x, pod] of [[0.98, 'lau68'], [1.42, o.tow ? 'tow' : 'none']]) {
      body.add(boxG(0.1, 0.22, 0.6, s * x, -0.48, -0.12), olivM);   // pylon
      if (pod === 'lau68') {   // LAU-68: 7 tubes, ~10 in diameter, ~ 1.6 m long (headline dims)
        body.add(cylZ(0.135, 0.135, 1.6, 10).translate(s * x, -0.74, -0.2), podM); body.add(sphG(0.135, s * x, -0.74, 0.6, 1, 1, 0.45, 10, 5), podM);
        body.add(new THREE.CircleGeometry(0.128, 10).rotateY(Math.PI).translate(s * x, -0.74, -1.005), podFaceM);
        for (let k = 0; k < 7; k++) { const a = k * Math.PI * 2 / 6, r = k ? 0.075 : 0; body.add(new THREE.CircleGeometry(0.03, 6).rotateY(Math.PI).translate(s * x + Math.cos(a) * r, -0.74 + Math.sin(a) * r, -1.01), rocketM); }
        body.add(boxG(0.28, 0.025, 0.04, s * x, -0.74, -0.7), blackM);   // band
        PODS.push(V(s * x, -0.74, -1.05));
      } else if (pod === 'tow') {   // XM65 TOW: 2 x 2 tubes
        for (const [dx, dy] of [[-0.09, 0], [0.09, 0], [-0.09, -0.18], [0.09, -0.18]]) body.add(cylZ(0.085, 0.085, 1.5, 8).translate(s * x + dx, -0.7 + dy, -0.25), olivM);
      } else body.add(boxG(0.16, 0.06, 0.4, s * x, -0.6, -0.12), metalM);   // bare bomb rack
    }
  }

  // ---- chin turret (M97 with the M197 three-barrel 20 mm): yaw ring under the nose, the gun elevates in it
  const [tx0, ty0, tz0] = COBRAM.TURRET;
  body.add(cylY(0.32, 0.3, 0.08, 14).translate(tx0, ty0 + 0.08, tz0), darkM);   // the ring
  const turYaw = group(g, 'turret', tx0, ty0, tz0), turPitch = group(turYaw, 'turretPitch');
  { const tb = bucket(); tb.add(sphG(0.27, 0, -0.03, 0, 1, 0.85, 1, 12, 7), greenM); tb.add(boxG(0.36, 0.3, 0.3, 0, -0.02, 0.06), green2M); tb.flush(turYaw, 'turretBody'); }
  const barrels = group(turPitch, 'barrels');
  { const gb = bucket(); gb.add(boxG(0.2, 0.2, 0.62, 0, 0, -0.1), blackM); gb.add(cylZ(0.11, 0.11, 0.12, 10).translate(0, 0, -0.5), darkM);   // receiver, the barrel clamp
    for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3; gb.add(cylZ(0.024, 0.024, 1.25, 6).translate(Math.cos(a) * 0.05, Math.sin(a) * 0.05, -1.0), blackM); }
    gb.add(cylZ(0.09, 0.09, 0.05, 10).translate(0, 0, -1.2), darkM); gb.flush(barrels, 'm197'); }
  const flash = mesh(merge([new THREE.PlaneGeometry(0.4, 0.9).rotateX(Math.PI / 2), new THREE.PlaneGeometry(0.4, 0.9).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), sphG(0.12, 0, 0, 0.1, 1, 1, 1, 6, 4)]).translate(0, 0, -1.85),
    B(0xffc860, { transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }), turPitch, 'flash');
  flash.visible = false;
  const pflash = PODS.map(p => { const f = mesh(sphG(0.35, 0, 0, 0, 1, 1, 2.2, 8, 5), B(0xffb050, { transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), g, 'podFlash'); f.position.copy(p).z -= 0.3; f.visible = false; return f; });
  // nose details: the pitot, the sight window, antennas; belly antennas; the tail skid
  body.add(rodG([0.15, -0.2, -4.6], [0.15, -0.2, -5.15], 0.025, 4), metalM);
  body.add(boxG(0.22, 0.14, 0.04, 0, -0.45, -4.66).rotateX(-0.6), blackM);
  body.add(slab([[0, 0, 0.03], [0.3, 0, 0.03], [0.36, 0.3, 0.02], [0.22, 0.3, 0.02]], (a, b, w) => [w, 1.4 + b, 1.45 + a]), blackM); body.add(rodG([0, -1.06, -0.8], [0, -1.35, -0.55], 0.02, 4), blackM); body.add(boxG(0.03, 0.18, 0.3, 0, -1.12, 1.2), blackM);
  for (const s of [-1, 1]) body.add(boxG(0.02, 0.5, 0.75, s * 0.49, -0.52, -1.95), green2M);   // ammunition bay doors
  body.add(boxG(0.02, 0.06, 1.5, 0.488, -0.08, -1.2), darkM); body.add(boxG(0.02, 0.06, 1.5, -0.488, -0.08, -1.2), darkM);   // panel lines
  for (const z of [3.6, 5.2, 6.8]) body.add(boxG(0.48 - (z - 3.6) * 0.07, 0.015, 0.02, 0, 0.47 - (z - 3.6) * 0.035, z), darkM);   // boom joints

  // ---- skids: two cross tubes arching down from the belly, the skid tubes with upturned toes, the step
  const skidM = M(0x3b3f40, { shininess: 40 });
  for (const z of [-1.55, 0.55]) for (const s of [-1, 1]) body.add(tubeG([[s * 0.3, -1.0, z], [s * 0.72, -1.12, z], [s * 1.0, -1.38, z], [s * 1.07, -1.55, z]], 0.055, 8, 6), skidM);
  for (const s of [-1, 1]) {
    body.add(tubeG([[s * 1.07, -1.56, 1.75], [s * 1.07, -1.56, 0], [s * 1.07, -1.56, -1.9], [s * 1.07, -1.49, -2.35], [s * 1.07, -1.3, -2.55]], 0.06, 14, 6), skidM);
    for (const z of [-1.55, 0.55]) body.add(boxG(0.14, 0.05, 0.16, s * 1.07, -1.52, z), skidM);   // saddles
    body.add(boxG(0.14, 0.03, 0.3, s * 0.92, -1.3, -2.2), metalM);   // boarding step
  }
  // ---- tail: elevator (synchronised, rotates with the stick), fin, tail rotor gearbox, stinger
  const elev = group(g, 'elevator', 0, 0.36, 5.3);
  { const eb = bucket(); eb.add(slab([[0.12, -0.32, 0.06], [1.05, -0.12, 0.04], [1.05, 0.26, 0.03], [0.12, 0.3, 0.05]], (a, b, w) => [a, w, b]), greenM); eb.add(slab([[-0.12, -0.32, 0.06], [-1.05, -0.12, 0.04], [-1.05, 0.26, 0.03], [-0.12, 0.3, 0.05]], (a, b, w) => [a, w, b]), greenM);
    for (const s of [-1, 1]) eb.add(boxG(0.03, 0.22, 0.5, s * 1.06, 0.02, 0.05), greenM);   // end plates
    eb.flush(elev, 'elevatorParts'); }
  body.add(slab([[7.55, 0.36, 0.14], [8.2, 0.36, 0.14], [9.25, 2.15, 0.08], [8.95, 2.2, 0.08], [8.35, 1.7, 0.1]], (a, b, w) => [w, b, a]), greenM);   // the swept fin
  body.add(slab([[8.4, 0.2, 0.08], [9.0, 0.18, 0.06], [9.3, -0.32, 0.05], [9.12, -0.36, 0.05]], (a, b, w) => [w, b, a]), greenM);   // ventral fin
  body.add(rodG([0, -0.32, 9.2], [0, -0.55, 9.45], 0.05, 6), metalM);   // tail skid (stinger)
  body.add(cylX(0.17, 0.4, 10).translate(0.18, 1.75, 8.85), metalM); body.add(boxG(0.12, 0.2, 0.3, 0.1, 1.75, 8.6), green2M);   // 90-deg gearbox
  body.add(boxG(0.12, 0.1, 1.3, 0, 0.47, 6.3), green2M);   // tail rotor drive shaft cover on the boom top
  const trSpin = group(g, 'tailRotor', ...COBRAM.TR);
  { const tb = bucket(); tb.add(cylX(0.09, 0.16, 8), hubM);
    for (const s of [-1, 1]) { tb.add(slab([[0.1, -0.13, 0.04], [1.48, -0.12, 0.025], [1.48, 0.15, 0.02], [0.1, 0.16, 0.04]], (a, b, w) => [w + 0.04, s * a, b]), bladeM); tb.add(boxG(0.03, 0.18, 0.28, 0.05, s * 1.38, 0.01), M(0xc22a1e)); }
    tb.flush(trSpin, 'trBlades'); }
  const trDiscM = B(0x1c1e1c, { transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const trDisc = mesh(new THREE.RingGeometry(0.2, COBRAM.TR_R, 24).rotateY(Math.PI / 2), trDiscM, trSpin.parent, 'trDisc'); trDisc.position.set(COBRAM.TR[0] + 0.05, COBRAM.TR[1], COBRAM.TR[2]); trDisc.renderOrder = 2;

  // ---- main rotor: the mast top, the teetering yoke (the whole rotor tilts as one with the tip-path plane), 2 blades
  const mast = group(g, 'mastTop', ...COBRAM.HUB); mast.rotation.x = -COBRAM.TILT;
  const teeter = group(mast, 'teeter'), spin = group(teeter, 'rotorSpin');
  const blades = [];
  { const hb = bucket();
    hb.add(cylY(0.11, 0.11, 0.34, 10).translate(0, 0.14, 0), steelM); hb.add(boxG(1.1, 0.2, 0.34, 0, 0, 0), hubM); hb.add(boxG(0.3, 0.26, 0.4, 0, 0, 0), metalM);   // mast nut, yoke, trunnion
    for (const s of [-1, 1]) { hb.add(cylX(0.13, 0.6, 8).translate(s * 0.78, 0, 0), hubM); hb.add(boxG(0.12, 0.08, 0.42, s * 0.5, -0.02, 0.26), metalM);   // grips, pitch horns
      hb.add(rodG([s * 0.5, -0.04, 0.44], [s * 0.3, -0.38, 0.3], 0.035, 5), steelM); }   // pitch links to the swashplate
    hb.add(boxG(0.06, 0.06, 0.9, 0, 0.2, 0), darkM);   // the drag brace / stabilising mass
    hb.flush(spin, 'hub'); }
  const bladeBody = slab([[0.85, -0.42, 0.11], [6.85, -0.42, 0.08], [6.85, 0.42, 0.02], [0.85, 0.42, 0.03]], (a, b, w) => [a, w, b]);
  const bladeTip = slab([[6.85, -0.42, 0.08], [7.315, -0.36, 0.06], [7.315, 0.42, 0.015], [6.85, 0.42, 0.02]], (a, b, w) => [a, w, b]);
  for (const s of [-1, 1]) {
    const arm = group(spin, 'blade'); arm.rotation.y = s > 0 ? 0 : Math.PI;
    const pitch = group(arm, 'pitch');
    mesh(bladeBody, bladeM, pitch, 'bladeBody'); mesh(bladeTip, tipM, pitch, 'bladeTip');
    mesh(boxG(0.55, 0.15, 0.7, 1.0, 0, 0), hubM, pitch, 'cuff');
    blades.push({ arm, pitch, s });
  }
  const discG = group(teeter, 'disc');
  const dm = B(0x181a17, { transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }), tm = B(0xd8b020, { transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const d1 = mesh(ringGeo(0.9, 6.85), dm, discG, 'disc'), d2 = mesh(ringGeo(6.85, 7.315), tm, discG, 'discTips'); d1.renderOrder = d2.renderOrder = 2;

  // ---- lights: anti-collision beacons (hump top, belly), nav lights (red left / green right wing tips, white tail)
  const beaconM = B(0xff2414), beaconOff = M(0x5a120e), navOff = M(0x333333);
  const beacons = [[0, 1.33, 2.05], [0, -1.08, 0.2]].map(p => { const h = mesh(sphG(0.07), beaconOff, g, 'beacon'); h.position.set(...p); return h; });
  const navs = [[-1.68, -0.36, -0.15, B(0xff2a1a)], [1.68, -0.36, -0.15, B(0x2aff5a)], [0, 0.42, 9.08, B(0xffffff)]].map(([x, y, z, m]) => { const n = mesh(sphG(0.05), navOff, g, 'nav'); n.position.set(x, y, z); n.userData.on = m; return n; });
  const lensM = B(0x3a3a34); { const l = mesh(new THREE.CircleGeometry(0.11, 10), lensM, g, 'landingLight'); l.position.set(0, -1.075, -2.6); l.rotation.x = Math.PI / 2; }

  // ---- markings (1980 USMC): MARINES on the boom, insignia on the boom root, HF code + modex on the fin, BuNo
  if (canDecal) {
    const modex = String(o.modex ?? 12).padStart(2, '0'), buno = o.buno ?? '160106';
    for (const s of [-1, 1]) {
      sideDecal(g, decal('cobraMarines', 512, 64, drawText('MARINES', '#0e0e0e', 'bold 54px sans-serif'), 1.6, 0.2), s, s * 0.285, 0.1, 5.1, s * 0.045);
      sideDecal(g, decal('insig', 256, 96, drawInsignia, 0.95, 0.36), s, s * 0.46, 0.06, 2.6, s * 0.08);
      sideDecal(g, decal('hf' + modex, 256, 128, drawText('HF ' + modex, '#0e0e0e', 'bold 92px sans-serif'), 0.7, 0.35), s, s * 0.075, 1.1, 8.55, 0);
      sideDecal(g, decal('cbuno' + buno, 256, 48, drawText(buno, '#141414', 'bold 30px sans-serif'), 0.62, 0.12), s, s * 0.24, 0.24, 6.6, s * 0.03);
      sideDecal(g, decal('cnose' + modex, 128, 96, drawText(modex, '#0e0e0e', 'bold 80px sans-serif'), 0.32, 0.24), s, s * 0.486, -0.55, -3.5);
      sideDecal(g, decal('cnostep', 256, 40, drawText('NO STEP', '#151515', 'bold 28px sans-serif'), 0.36, 0.06), s, s * 0.48, 0.65, 0.4);
    }
  }
  body.flush(g, 'airframe');
  const RF = { mast, teeter, spin, blades, discG, dm, tm, psi: Math.random() * 6, trPsi: 0 };
  let tY = 0, tP = -0.1;
  function animate(S = {}, dt = 0, time = 0) {
    const nr = S.nr ?? 0, kr = smooth(nr, 0.15, 0.75);
    // the 2-blade see-saw: the yoke tilts with the tip-path plane; coning is the built-in precone (~2.75 deg)
    RF.psi = (RF.psi + nr * COBRAM.OMEGA * dt) % (Math.PI * 2); RF.spin.rotation.y = RF.psi;   // counter-clockwise from above
    const tx = S.tx ?? 0, ty = S.ty ?? 0; RF.teeter.rotation.set(-tx, 0, -ty);
    const cone = -0.03 + 0.078 * kr;
    for (const b of RF.blades) { b.arm.rotation.z = cone; b.pitch.rotation.x = 0.02 + (S.coll ?? 0.4) * 0.22; }   // leading edge (-z) up with collective
    RF.discG.scale.y = Math.max(0.01, cone);
    const dk = smooth(nr, 0.35, 0.9); RF.dm.opacity = 0.13 * dk; RF.tm.opacity = 0.1 * dk; RF.discG.visible = dk > 0.01;
    RF.trPsi = (RF.trPsi + nr * COBRAM.OMEGA * COBRAM.TR_RATIO * dt) % (Math.PI * 2); trSpin.rotation.x = RF.trPsi; trDiscM.opacity = 0.22 * dk;
    // the turret slews toward the commanded angles (the unit already rate-limits; this smooths what's drawn)
    const T = S.turret; if (T) { tY = T.yaw; tP = T.pitch; }
    turYaw.rotation.y = tY; turPitch.rotation.x = tP;
    flash.visible = !!S.firing && ((time * 23) % 1) < 0.55; if (flash.visible) flash.rotation.z = time * 40;
    barrels.rotation.z = S.firing ? (barrels.rotation.z + dt * 60) % 6.28 : barrels.rotation.z;
    const rk = S.rocketT ?? 9; for (const f of pflash) { f.visible = rk < 0.12; f.scale.setScalar(1 + rk * 6); }
    elev.rotation.x = clamp(-(S.lon ?? 0) * 0.09, -0.12, 0.12);
    const live = !!S.run || nr > 0.05, fl = live && (time % 1.0) < 0.09;
    for (const b of beacons) { b.material = fl ? beaconM : beaconOff; b.scale.setScalar(fl ? 1.6 : 1); }
    for (const n of navs) n.material = live ? n.userData.on : navOff;
    lensM.color.setHex(S.light ? 0xfff6d8 : 0x3a3a34);
    const h = clamp(((S.n1 ?? 0) - 0.45) / 0.55, 0, 1); for (const e of exhausts) e.material.color.setRGB(0.06 + 0.12 * h, 0.04 + 0.03 * h, 0.03);
  }
  animate({});
  return { group: g, animate, TURRET: V(...COBRAM.TURRET), BARREL: COBRAM.BARREL, PODS, parts: { turYaw, turPitch, rotor: RF, elev, trSpin, flash } };
}
