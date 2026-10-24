// CH-46E Sea Knight exterior: tandem rotors on their pylons (3-blade articulated heads, blades that flap with the
// tip-path plane, droop at rest, blur discs), the two T58 nacelles beside the aft pylon, sponsons with the main gear,
// twin nose wheels, the rear ramp that lowers to the ground, crew door, cockpit glazing with the crew inside, cabin
// windows, red troop seats, lights, 1980 USMC markings (overall dark green, black MARINES, full-colour insignia, the
// HMM-261 "EM" tail code - squadron choice INFERRED). Real metres; local frame x right, y up, nose -z, origin at the
// CG, wheels on the ground at y = -1.80.
// API: buildCH46Mesh() -> { group, animate(S, dt, time), RAMP_END (local point of the lowered ramp lip), parts }
import * as THREE from 'three';
import { M, B, V, clamp, smooth, slab, loft, merge, cylZ, cylX, cylY, boxG, sphG, mesh, group, rodG, tubeG, bucket, rr, full, QH, shift, ringGeo, decal, canDecal, sideDecal, drawInsignia, drawText } from './modelkit.js';

const D2R = Math.PI / 180, _qa = new THREE.Quaternion(), _va = new THREE.Vector3();
export const CH46M = {
  GROUND: -1.80, R: 7.62, OMEGA: 264 * Math.PI / 30, TILT: 4.5 * D2R,
  HUB_F: [0, 2.20, -5.08], HUB_A: [0, 3.05, 5.08],
  RAMP_HINGE: [0, -1.2, 3.9], RAMP_LEN: 3.65, RAMP_UP: 0.517, RAMP_DOWN: -0.165,   // ramp angle (rad, + = tail end up)
};
const LV = [0.55, 0.15, -0.25];
// fuselage stations [z, top, bottom, half width, top corner r, bottom corner r]
const CAB = [0.98, -1.28, 1.12, 0.36, 0.2];
const FUS = [
  [-6.62, -0.45, -0.95, 0.06, 0.05, 0.05], [-6.56, -0.12, -1.1, 0.58, 0.36, 0.3], [-6.42, 0.18, -1.2, 0.86, 0.42, 0.3],
  [-6.18, 0.48, -1.25, 1.0, 0.44, 0.25], [-5.82, 0.76, -1.27, 1.08, 0.42, 0.2], [-5.42, 0.92, -1.28, 1.11, 0.38, 0.2],
  ...[-5.0, -4.6, -3.8, -2.6, -1.2, 0, 1.2, 2.6, 3.4, 3.9].map(z => [z, ...CAB]),
  [4.6, 0.98, -0.80, 1.11, 0.36, 0.2], [5.4, 0.98, -0.34, 1.08, 0.36, 0.2], [6.3, 0.98, 0.16, 1.03, 0.34, 0.18], [7.07, 0.98, 0.6, 0.97, 0.3, 0.12],
];
const FZ = FUS.map(f => f[0]);
// skin material: 0 green, 1 glass, 2 anti-glare black, 3 lighter green (access panels), -1 hole (crew door, ramp)
function skinMat(z0, z1, qh, s) {
  if (z0 >= -6.56 && z1 <= -6.42 && qh <= 3) return 2;                    // anti-glare above the windscreens
  if (z0 >= -6.56 && z1 <= -5.42 && qh >= 2 && qh <= 6) return 1;         // windscreens wrapping round to the side windows
  if (z0 >= -5.82 && z1 <= -5.0 && qh <= 1) return 1;                      // overhead windows
  if (z0 >= -6.56 && z1 <= -6.18 && qh >= 8 && qh <= 10) return 1;         // chin windows
  if (s > 0 && z0 >= -4.6 && z1 <= -3.8 && qh >= 5 && qh <= 11) return -1; // crew door (right), open
  if (z0 >= 3.9 && qh >= 11) return -1;                                    // the ramp opening (the ramp panel closes it)
  if (z0 >= -1.2 && z1 <= 1.2 && (qh === 3 || qh === 4)) return 3;
  return 0;
}

export function buildCH46Mesh(o = {}) {
  const g = new THREE.Group(); g.name = 'ch46';
  const greenM = M(0x5c6a45), green2M = M(0x66744d), darkM = M(0x2c3226), blackM = M(0x141512, { shininess: 6 }), metalM = M(0x4a4d4f, { shininess: 50 });
  const bladeM = M(0x1d1f1d, { shininess: 25 }), tipM = M(0xe2bb1a), redM = M(0xa8231b), sootM = M(0x2a2622, { shininess: 4 }), tyreM = M(0x161616, { shininess: 4 }), hubM = M(0x5a5d58, { shininess: 40 });
  const glassM = new THREE.MeshPhongMaterial({ color: 0x86a5a0, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
  const winM = M(0x1b2622, { shininess: 90, specular: 0x9fb8aa }), innerM = M(0x30362a, { side: THREE.BackSide }), seatM = M(0x9a2a1c), floorM = M(0x2a2d27);
  const crew = { suit: M(0x56603f), vest: M(0x394030), helmet: M(0x3f4a2c), skin: M(0xc19a77), visor: M(0x151515) };
  const body = bucket();

  // ---- fuselage: outer skin (both sides at once: the door is on the right only, so two half lofts) + inner lining
  const rings = FUS.map(([z, t, b, w, rt, rb]) => full(rr(z, t, b, w, rt, rb, LV)));
  const mats = [greenM, glassM, blackM, green2M];
  mesh(loft(rings, (r, k) => skinMat(FZ[r], FZ[r + 1], QH(k), k < 13 ? 1 : -1), 0, 0), mats, g, 'fuselage');
  mesh(loft(rings.slice(1), (r, k) => { const m = skinMat(FZ[r + 1], FZ[r + 2], QH(k), k < 13 ? 1 : -1); return m === 1 ? -1 : 0; }), innerM, g, 'lining');
  body.add(boxG(2.1, 0.05, 9.0, 0, -0.95, -0.6), floorM);                          // cabin floor
  for (const s of [-1, 1]) {                                                       // red nylon troop seats along both walls
    body.add(boxG(0.42, 0.06, 7.6, s * 0.86, -0.52, -0.2), seatM); body.add(boxG(0.06, 0.5, 7.6, s * 1.05, -0.24, -0.2), seatM);
    for (let z = -3.6; z <= 3.6; z += 0.9) body.add(rodG([s * 0.68, -0.95, z], [s * 0.68, -0.52, z], 0.03, 4), metalM);
  }
  body.add(boxG(2.0, 1.9, 0.06, 0, 0.0, -5.0), darkM);                              // cockpit bulkhead (seen through the ramp)

  // ---- cabin windows (square, five a side), crew door frame, hoist, steps
  for (const s of [-1, 1]) for (const z of [-2.9, -1.7, -0.5, 0.7, 1.9]) {
    if (s > 0 && z < -2.5) continue;
    body.add(boxG(0.04, 0.42, 0.46, s * 1.125, 0.38, z), winM); body.add(boxG(0.03, 0.5, 0.54, s * 1.118, 0.38, z), darkM);
  }
  body.add(boxG(0.05, 0.06, 0.92, 1.12, 0.62, -4.2), darkM); body.add(boxG(0.05, 1.7, 0.06, 1.12, -0.2, -4.62), darkM); body.add(boxG(0.05, 1.7, 0.06, 1.12, -0.2, -3.78), darkM);
  { const up = group(g, 'doorUpper', 1.13, 0.62, -4.2); up.rotation.z = -1.2; mesh(boxG(0.04, 0.7, 0.82, 0, 0.35, 0), greenM, up); mesh(boxG(0.045, 0.32, 0.5, 0, 0.42, 0), winM, up); }
  body.add(boxG(0.3, 0.06, 0.6, 1.2, -1.0, -4.2), metalM);                          // door step
  body.add(boxG(0.36, 0.3, 0.5, 1.0, 1.08, -4.2), green2M); body.add(rodG([1.1, 1.05, -4.2], [1.45, 1.05, -4.2], 0.06), metalM);   // rescue hoist

  // ---- sponsons (main gear, fuel) with the main wheels, nose gear with twin wheels
  const SP = [[0.15, -0.5, -0.95, 0.2], [0.45, -0.4, -1.22, 0.5], [0.9, -0.38, -1.28, 0.56], [2.7, -0.38, -1.28, 0.56], [3.25, -0.42, -1.24, 0.5], [3.6, -0.55, -1.05, 0.2]];
  for (const s of [-1, 1]) {
    const sr = SP.map(([z, t, b, w]) => shift(full(rr(z, t, b, w, Math.min(0.2, w), Math.min(0.18, w), [t - 0.1, (t + b) / 2, b + 0.1])), s * 1.45));
    body.add(loft(sr, () => 0, 0, 0), greenM);
    body.add(boxG(0.03, 0.28, 2.2, s * 1.94, -0.72, 1.4), green2M);                  // fuel filler panel
    body.add(rodG([s * 1.6, -1.2, 1.6], [s * 1.95, -1.42, 1.6], 0.14, 6), metalM); body.add(rodG([s * 1.45, -0.9, 1.1], [s * 1.95, -1.42, 1.6], 0.08, 5), metalM);
    body.add(cylX(0.38, 0.26, 14).translate(s * 2.0, -1.42, 1.6), tyreM); body.add(cylX(0.18, 0.28, 10).translate(s * 2.0, -1.42, 1.6), metalM);
  }
  body.add(rodG([0, -1.25, -4.6], [0, -1.5, -4.6], 0.12, 6), metalM); body.add(boxG(0.8, 0.1, 0.14, 0, -1.5, -4.6), metalM);
  for (const s of [-1, 1]) { body.add(cylX(0.3, 0.2, 12).translate(s * 0.35, -1.5, -4.6), tyreM); body.add(cylX(0.13, 0.22, 8).translate(s * 0.35, -1.5, -4.6), metalM); }

  // ---- forward pylon over the cockpit, the hump along the roof, aft pylon, engine nacelles
  const FP = [[-6.15, 1.0, 0.82, 0.25], [-5.85, 1.55, 0.86, 0.48], [-5.45, 1.86, 0.9, 0.6], [-4.9, 1.92, 0.92, 0.62], [-4.2, 1.82, 0.94, 0.58], [-3.6, 1.42, 0.95, 0.46], [-3.2, 1.08, 0.96, 0.3]];
  body.add(loft(FP.map(([z, t, b, w]) => full(rr(z, t, b, w, Math.min(0.32, w), 0.05, [t - 0.3, t - 0.5, t - 0.7]))), () => 0, 0, 0), greenM);
  body.add(boxG(0.5, 0.22, 6.0, 0, 1.06, -0.2), green2M); body.add(boxG(0.56, 0.05, 6.0, 0, 0.97, -0.2), darkM);   // drive shaft tunnel
  const AP = [[2.5, 1.05, 0.9, 0.42], [3.1, 1.75, 0.9, 0.62], [3.8, 2.45, 0.92, 0.74], [4.6, 2.78, 0.94, 0.76], [5.5, 2.85, 0.95, 0.72], [6.3, 2.7, 0.96, 0.6], [6.9, 2.25, 0.97, 0.44], [7.2, 1.4, 0.98, 0.26]];
  body.add(loft(AP.map(([z, t, b, w]) => full(rr(z, t, b, w, Math.min(0.36, w), 0.05, [t - 0.4, t - 0.8, t - 1.1]))), () => 0, 0, 0), greenM);
  body.add(slab([[5.2, 2.8, 0.12], [6.9, 2.3, 0.1], [7.45, 1.2, 0.1], [7.3, 1.0, 0.12], [6.6, 1.0, 0.14]], (a, b, w) => [w, b, a]), greenM);   // trailing pylon fin
  const engines = [];
  for (const s of [-1, 1]) {   // T58-GE-16 in nacelles either side of the aft pylon, intakes forward (screens), exhaust out and back
    const eg = group(g, 'engine', s * 0.86, 1.32, 3.9);
    mesh(cylZ(0.34, 0.36, 2.2, 14), greenM, eg); mesh(sphG(0.34, 0, 0, -1.1, 1, 1, 0.5, 12, 6), green2M, eg);
    mesh(new THREE.CircleGeometry(0.24, 12).rotateY(Math.PI).translate(0, 0, -1.22), darkM, eg);   // intake screen
    mesh(boxG(0.04, 0.5, 1.8, -s * 0.3, -0.05, 0), green2M, eg);                                      // fairing into the pylon
    const ex = group(eg, 'exhaust', s * 0.2, 0.05, 1.15); ex.rotation.y = s * 0.35;
    mesh(cylZ(0.26, 0.28, 0.5, 12, true).translate(0, 0, 0.2), M(0x3c3834, { shininess: 40, side: THREE.DoubleSide }), ex);
    const heat = mesh(new THREE.CircleGeometry(0.24, 12), B(0x000000), ex, 'exhaustGlow'); heat.position.z = 0.24;
    body.add(boxG(0.03, 0.55, 1.2, s * 1.14, 0.75, 4.8), sootM);                                      // exhaust soot down the side
    engines.push({ g: eg, heat });
  }
  // nose: pitot tubes, antennas; belly antennas, the UHF blade on the hump
  for (const s of [-1, 1]) body.add(rodG([s * 0.4, 0.62, -6.1], [s * 0.4, 0.62, -6.75], 0.025, 4), metalM);
  body.add(boxG(0.03, 0.4, 0.3, 0, 1.35, 1.0), blackM); body.add(rodG([0, -1.28, -2.0], [0, -1.6, -1.7], 0.02, 4), blackM); body.add(boxG(0.03, 0.22, 0.3, 0, -1.4, 0.5), blackM);

  // ---- crew in the cockpit (two pilots), instrument panel, seats; crew chief who stands at the ramp when it opens
  const seated = (x, y, z, rotY = 0) => {
    const p = (geo) => geo.rotateY(rotY).translate(x, y, z);
    body.add(p(boxG(0.36, 0.14, 0.42, 0, 0.06, -0.17)), crew.suit); body.add(p(boxG(0.34, 0.36, 0.13, 0, -0.14, -0.42)), crew.suit);
    body.add(p(boxG(0.38, 0.5, 0.24, 0, 0.36, 0.02)), crew.suit); body.add(p(boxG(0.41, 0.36, 0.27, 0, 0.4, 0)), crew.vest);
    body.add(p(sphG(0.095, 0, 0.72, -0.04)), crew.skin); body.add(p(new THREE.SphereGeometry(0.135, 8, 5, 0, Math.PI * 2, 0, 1.9).translate(0, 0.75, 0)), crew.helmet);
    body.add(p(boxG(0.2, 0.06, 0.04, 0, 0.73, -0.13)), crew.visor);
    for (const k of [-1, 1]) body.add(p(rodG([k * 0.22, 0.55, 0], [k * 0.12, 0.42, -0.4], 0.09)), crew.suit);
  };
  for (const s of [-1, 1]) { seated(s * 0.5, -0.5, -5.55); body.add(boxG(0.5, 0.06, 0.5, s * 0.5, -0.54, -5.55), darkM); body.add(boxG(0.5, 0.8, 0.08, s * 0.5, -0.1, -5.28), darkM); }
  body.add(boxG(1.9, 0.5, 0.1, 0, -0.18, -6.2), blackM); body.add(boxG(2.0, 0.05, 0.36, 0, 0.09, -6.12), blackM); body.add(boxG(0.4, 0.5, 0.9, 0, -0.75, -5.7), darkM);
  const chief = group(g, 'crewChief', 0.55, -0.95, 3.4);
  { const cb = bucket(); cb.add(boxG(0.17, 0.8, 0.2, -0.1, 0.4, 0), crew.suit); cb.add(boxG(0.17, 0.8, 0.2, 0.1, 0.4, 0), crew.suit); cb.add(boxG(0.4, 0.55, 0.26, 0, 1.08, 0), crew.suit);
    cb.add(boxG(0.43, 0.4, 0.29, 0, 1.12, 0), crew.vest); cb.add(sphG(0.1, 0, 1.48, -0.02), crew.skin); cb.add(new THREE.SphereGeometry(0.14, 8, 5, 0, Math.PI * 2, 0, 1.9).translate(0, 1.52, 0.01), crew.helmet);
    cb.add(rodG([-0.22, 1.3, 0], [-0.32, 0.9, 0.1], 0.09), crew.suit); cb.add(rodG([0.22, 1.3, 0], [0.4, 1.6, 0.2], 0.09), crew.suit); cb.flush(chief, 'chiefBody'); }
  chief.rotation.y = Math.PI;
  const guns = [[1.1, -4.2, 1], [-1.1, -3.9, -1]].map(([x, z, s]) => {
    body.add(rodG([x - s * 0.05, -0.95, z], [x - s * 0.05, 0.15, z], 0.05, 6), metalM);                     // pintle post
    const yaw = group(g, 'doorGun', x, 0.2, z), pitch = group(yaw, 'gunPitch'), gb = bucket();
    gb.add(boxG(0.1, 0.13, 0.75, 0, 0, -0.1), blackM); gb.add(cylZ(0.03, 0.03, 1.1, 6).translate(0, 0.02, -1.0), blackM); gb.add(cylZ(0.06, 0.06, 0.65, 8).translate(0, 0.02, -0.75), M(0x22251f));   // receiver, barrel, jacket
    gb.add(boxG(0.16, 0.2, 0.3, s * 0.13, -0.12, 0.0), M(0x4f5636)); gb.add(boxG(0.06, 0.12, 0.08, 0, -0.04, 0.32), blackM); gb.add(boxG(0.22, 0.03, 0.03, 0, -0.02, 0.36), metalM);   // ammo can, spade grips
    gb.flush(pitch, 'm2');
    const fl = mesh(merge([new THREE.PlaneGeometry(0.3, 0.7).rotateX(Math.PI / 2), new THREE.PlaneGeometry(0.3, 0.7).rotateX(Math.PI / 2).rotateZ(Math.PI / 2)]).translate(0, 0.02, -1.85), B(0xffc860, { transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }), pitch, 'flash');
    const gn = group(g, 'gunner', x - s * 0.45, -0.95, z + 0.45), nb = bucket();
    nb.add(boxG(0.17, 0.8, 0.2, -0.1, 0.4, 0), crew.suit); nb.add(boxG(0.17, 0.8, 0.2, 0.1, 0.4, 0), crew.suit); nb.add(boxG(0.4, 0.55, 0.26, 0, 1.08, 0), crew.suit); nb.add(boxG(0.43, 0.4, 0.29, 0, 1.12, 0), crew.vest);
    nb.add(sphG(0.1, 0, 1.48, -0.02), crew.skin); nb.add(new THREE.SphereGeometry(0.14, 8, 5, 0, Math.PI * 2, 0, 1.9).translate(0, 1.52, 0.01), crew.helmet); nb.add(boxG(0.2, 0.06, 0.05, 0, 1.5, -0.13), crew.visor);
    nb.add(rodG([-0.22, 1.3, 0], [-0.1, 1.15, -0.4], 0.09), crew.suit); nb.add(rodG([0.22, 1.3, 0], [0.1, 1.15, -0.4], 0.09), crew.suit); nb.flush(gn, 'gunnerBody');
    gn.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    return { yaw, pitch, fl, gn, s, y0: s > 0 ? -Math.PI / 2 : Math.PI / 2, cy: s > 0 ? -Math.PI / 2 : Math.PI / 2, cp: -0.35 };
  });
  // the ramp's hydraulic struts (re-aimed every frame between the cabin wall and the ramp)
  const struts = [-1, 1].map(s => { const st = mesh(cylZ(0.05, 0.05, 1, 6), metalM, g, 'rampStrut'); st.userData.x = s * 0.9; return st; });

  // ---- the ramp: a panel hinged at the cabin floor; up it closes the sloping underside of the tail
  const [hx, hy, hz] = CH46M.RAMP_HINGE, L = CH46M.RAMP_LEN;
  const ramp = group(g, 'ramp', hx, hy, hz);
  { const rb = bucket(); rb.add(boxG(2.0, 0.08, L, 0, -0.04, L / 2), greenM); rb.add(boxG(1.9, 0.02, L - 0.1, 0, 0.01, L / 2), floorM);
    for (const s of [-1, 1]) rb.add(boxG(0.1, 0.25, L, s * 0.98, 0.1, L / 2), green2M);
    for (let z = 0.3; z < L; z += 0.45) rb.add(boxG(1.8, 0.02, 0.05, 0, 0.03, z), metalM);   // treads
    rb.flush(ramp, 'rampPanel'); }

  // ---- rotors: tilted masts, articulated 3-blade heads (blades flap / lag / feather), blur discs
  const blades = [], discs = [];
  const bladeBody = slab([[0.7, -0.12, 0.07], [7.25, -0.12, 0.055], [7.25, 0.34, 0.015], [0.7, 0.34, 0.015]], (a, b, w) => [a, w, b]);
  const bladeTip = slab([[7.25, -0.12, 0.055], [7.62, -0.12, 0.05], [7.62, 0.34, 0.012], [7.25, 0.34, 0.015]], (a, b, w) => [a, w, b]);
  const rotor = (name, hub, dir) => {
    const mast = group(g, name, ...hub); mast.rotation.x = -CH46M.TILT;
    { const mb = bucket(); mb.add(cylY(0.13, 0.11, 0.6, 10).translate(0, -0.28, 0), metalM); mb.add(cylY(0.32, 0.26, 0.12, 12).translate(0, -0.42, 0), metalM);   // shaft, swashplate
      mb.flush(mast, name + 'Mast'); }
    const spin = group(mast, name + 'Hub');
    { const hb = bucket(); hb.add(cylY(0.26, 0.2, 0.22, 12), hubM); hb.add(cylY(0.08, 0.08, 0.3, 8).translate(0, 0.25, 0), metalM);
      for (let k = 0; k < 3; k++) { const a = k * 2 * Math.PI / 3; hb.add(boxG(0.5, 0.12, 0.18, 0.4, 0, 0).rotateY(a), hubM); hb.add(cylX(0.06, 0.45, 6).translate(0.45, 0.02, 0.17).rotateY(a), blackM); }   // arms + lag dampers
      hb.flush(spin, name + 'HubParts'); }
    const bl = [];
    for (let k = 0; k < 3; k++) {
      const arm = group(spin, 'arm'); arm.rotation.y = k * 2 * Math.PI / 3;
      const flap = group(arm, 'flap', 0.62, 0, 0), pitch = group(flap, 'pitch');
      mesh(bladeBody.clone().translate(-0.62, 0, 0), bladeM, pitch, 'blade'); mesh(bladeTip.clone().translate(-0.62, 0, 0), tipM, pitch, 'bladeTip');
      mesh(boxG(0.4, 0.09, 0.3, -0.3, 0, 0.1), metalM, pitch, 'cuff');
      bl.push({ flap, pitch, a0: k * 2 * Math.PI / 3 });
    }
    const discG = group(mast, name + 'Disc');
    const dm = B(0x181a17, { transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }), tm = B(0xd8b020, { transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const d1 = mesh(ringGeo(0.8, 7.25), dm, discG, 'disc'), d2 = mesh(ringGeo(7.25, 7.62), tm, discG, 'discTips'); d1.renderOrder = d2.renderOrder = 2;
    blades.push({ spin, bl, dir, mast, discG, dm, tm, psi: Math.random() * 6 });
  };
  rotor('rotorF', CH46M.HUB_F, +1); rotor('rotorA', CH46M.HUB_A, -1);   // front counter-clockwise from above, aft clockwise

  // ---- lights
  const beaconM = B(0xff2414), beaconOff = M(0x5a120e), navR = B(0xff2a1a), navG = B(0x2aff5a), navOff = M(0x333333);
  const beacons = [[0, 2.95, 6.0], [0, -1.3, 0.8]].map(p => { const h = mesh(sphG(0.09), beaconOff, g, 'beacon'); h.position.set(...p); return h; });
  const navs = [[-2.05, -0.5, 0.0, navR], [2.05, -0.5, 0.0, navG], [0, 2.25, 7.05, B(0xffffff)]].map(([x, y, z, m]) => { const n = mesh(sphG(0.06), navOff, g, 'nav'); n.position.set(x, y, z); n.userData.on = m; return n; });
  const lensM = B(0x3a3a34); const lens = mesh(new THREE.CircleGeometry(0.14, 10), lensM, g, 'landingLight'); lens.position.set(0, -1.29, -5.6); lens.rotation.x = Math.PI / 2;

  // ---- markings (1980 USMC): MARINES, national insignia, EM tail code + modex, BuNo, rotor-tip warning
  if (canDecal) {
    const modex = String(o.modex ?? 5).padStart(2, '0'), buno = o.buno ?? '154038';
    for (const s of [-1, 1]) {
      sideDecal(g, decal('marines', 512, 64, drawText('MARINES', '#101010', 'bold 54px sans-serif'), 2.6, 0.33), s, s * 1.128, 0.42, s > 0 ? 0.6 : 0.2);
      sideDecal(g, decal('insig', 256, 96, drawInsignia, 1.5, 0.56), s, s * 1.13, -0.45, -1.2);
      sideDecal(g, decal('em' + modex, 256, 128, drawText('EM ' + modex, '#101010', 'bold 92px sans-serif'), 1.2, 0.6), s, s * 0.78, 2.05, 4.6, -s * 0.08);
      sideDecal(g, decal('buno' + buno, 256, 48, drawText('BuNo ' + buno, '#141414', 'bold 30px sans-serif'), 1.0, 0.19), s, s * 1.06, 0.62, 6.2);
      sideDecal(g, decal('nose' + modex, 128, 96, drawText(modex, '#101010', 'bold 80px sans-serif'), 0.5, 0.38), s, s * 1.12, -0.6, -5.2);
    }
  }
  body.flush(g, 'airframe');

  // ---- animation (no allocations). S: { nr, F: { tx, ty }, A: { tx, ty }, coll, ramp 0..1, run, light, n1, chief }
  const RF = blades;
  function animate(S = {}, dt = 0, time = 0) {
    const nr = S.nr ?? 0, kr = smooth(nr, 0.15, 0.75), cone = -0.05 + ((S.cone ?? 0.06) + 0.05) * kr, coll = S.coll ?? 0.3;
    for (let i = 0; i < 2; i++) {
      const R = RF[i], T = i ? S.A : S.F, tx = T ? T.tx : 0, ty = T ? T.ty : 0;
      R.psi = (R.psi + R.dir * nr * CH46M.OMEGA * dt) % (Math.PI * 2); R.spin.rotation.y = R.psi;
      for (const b of R.bl) {   // each blade flaps into the tip-path plane (azimuth a: blade along (cos a, 0, -sin a))
        const a = R.psi + b.a0, sn = Math.sin(a), cs = Math.cos(a);
        b.flap.rotation.z = cone - tx * sn - ty * cs; b.pitch.rotation.x = R.dir * (0.03 + coll * 0.22);
      }
      R.discG.rotation.set(-tx, 0, -ty); R.discG.scale.y = cone;
      const dk = smooth(nr, 0.35, 0.9); R.dm.opacity = 0.15 * dk; R.tm.opacity = 0.15 * dk; R.discG.visible = dk > 0.01;
    }
    ramp.rotation.x = -(CH46M.RAMP_UP + (CH46M.RAMP_DOWN - CH46M.RAMP_UP) * clamp(S.ramp ?? 0, 0, 1));
    chief.visible = (S.ramp ?? 0) > 0.5;
    { const a = -ramp.rotation.x, py = CH46M.RAMP_HINGE[1] + Math.sin(a) * 1.5, pz = CH46M.RAMP_HINGE[2] + Math.cos(a) * 1.5;
      for (const st of struts) { const ax = st.userData.x, ay = -0.15, az = 4.35, dy = py - ay, dz = pz - az, L = Math.hypot(dy, dz); st.position.set(ax, (ay + py) / 2, (az + pz) / 2); st.rotation.set(-Math.atan2(dy, dz), 0, 0); st.scale.z = L; } }
    // door guns: rest pointing out and down; on a target, the gunner swings onto it (world aim -> local)
    for (const G of guns) {
      let yT = G.y0, pT = -0.35;
      if (S.gunAim && S.gunAim.lengthSq() > 0.5) { g.getWorldQuaternion(_qa); _va.copy(S.gunAim).applyQuaternion(_qa.invert()); if (_va.x * G.s > 0.1) { yT = Math.atan2(-_va.x, -_va.z); pT = clamp(Math.asin(clamp(_va.y / _va.length(), -1, 1)), -1.0, 0.4); } }
      const k = 1 - Math.exp(-8 * dt); G.cy += (yT - G.cy) * k; G.cp += (pT - G.cp) * k;
      G.yaw.rotation.y = G.cy; G.pitch.rotation.x = G.cp; G.gn.rotation.y = G.y0 + (G.cy - G.y0) * 0.6;
      G.fl.visible = !!S.gunFiring && ((time * 17 + G.s) % 1) < 0.5;
    }
    const live = !!S.run || nr > 0.05, fl = live && (time % 1.1) < 0.1;
    for (const b of beacons) { b.material = fl ? beaconM : beaconOff; b.scale.setScalar(fl ? 1.6 : 1); }
    for (const n of navs) n.material = live ? n.userData.on : navOff;
    lensM.color.setHex(S.light ? 0xfff6d8 : 0x3a3a34);
    const h = clamp(((S.n1 ?? 0) - 0.45) / 0.55, 0, 1); for (const e of engines) e.heat.material.color.setRGB(0.05 + 0.07 * h, 0.045 + 0.02 * h, 0.04);   // a sooty pipe with a faint heat
  }
  animate({});
  // the lowered ramp's lip (where the squad steps off), local
  const a = -CH46M.RAMP_DOWN, RAMP_END = V(hx, hy - Math.sin(-CH46M.RAMP_DOWN) * L, hz + Math.cos(a) * L);
  return { group: g, animate, RAMP_END, GUNS: guns.map(G => G.yaw.position), parts: { ramp, chief, rotors: RF, guns } };
}
