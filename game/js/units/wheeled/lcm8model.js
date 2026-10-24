// LCM-8 ("Mike 8") landing craft, the 1980 US Navy / Army workhorse that put trucks and tanks on beaches (ngc/wheeledgame:
// it brings an M35A2 ashore when the motor pool is asked for one). Low poly in the house style: flat-shaded Lambert,
// colours from materials, details as geometry. Real dimensions (Jane's Fighting Ships 1980-81, NAVSEA LCM-8 Mod 1):
// 22.4 m long, 6.4 m beam, well deck ~12.8 x 4.3 m, bow ramp, aft pilot house, haze grey with black boot topping.
// Local frame: x right, y up (0 = waterline), -z forward (the ramp), metres.
// API: buildLCM8Mesh() -> { group, ramp (pivot: rotation.x 0 = up, -1.35 = down), WELL: { y, z } (well deck), BOW_Z }
import * as THREE from 'three';
import { mat, box, cylY, cylZ, builder } from './modelkit.js';

export function buildLCM8Mesh() {
  const g = new THREE.Group(); g.name = 'lcm8';
  const grey = mat(0x7c8288), greyD = mat(0x5e6369), boot = mat(0x1d1f21), deck = mat(0x55595d), steel = mat(0x3c4044), glass = mat(0x22303a, { vc: false });
  const L = 22.4, W = 6.4, HB = 1.55, BOW = -L / 2 + 0.6, WELL0 = BOW + 0.6, WELL1 = 3.4, WELLY = 0.35;
  const B = builder({ dust: 0.15, mud: 0, yDust: 99 });
  // hull: bottom and sides (boot topping at the waterline), the transom, the well deck between the wing walls
  B.add(box(W, 0.5, L - 1.2, 0, -0.55, 0.6), boot);                                        // below the waterline (black)
  for (const s of [-1, 1]) {
    B.add(box(0.9, HB + 0.3, L - 1.2, s * (W / 2 - 0.45), (HB + 0.3) / 2 - 0.3, 0.6), grey);   // wing walls (the well's sides)
    B.add(box(0.95, 0.08, L - 1.2, s * (W / 2 - 0.45), HB + 0.04, 0.6), greyD);              // gunwale cap
    for (let z = WELL0 + 1; z < WELL1; z += 2.2) B.add(box(0.08, 0.5, 0.08, s * (W / 2 - 0.92), HB + 0.33, z), steel);   // bitts / stanchions
    B.add(box(0.12, 0.05, WELL1 - WELL0, s * (W / 2 - 0.92), HB + 0.6, (WELL0 + WELL1) / 2), steel);                   // the handrail
  }
  B.add(box(W - 1.8, 0.25, WELL1 - WELL0, 0, WELLY - 0.12, (WELL0 + WELL1) / 2), deck);       // the well deck
  for (let z = WELL0 + 0.6; z < WELL1; z += 0.9) B.add(box(W - 1.85, 0.03, 0.1, 0, WELLY + 0.02, z), greyD);   // non-skid strakes
  // aft: the engine room casing, the pilot house (windows all round), mast with the nav light, twin exhaust stacks
  B.add(box(W, HB + 0.3, L / 2 - WELL1 + 0.0, 0, (HB + 0.3) / 2 - 0.3, (WELL1 + L / 2) / 2), grey);
  B.add(box(W - 0.2, 0.08, L / 2 - WELL1, 0, HB + 0.04, (WELL1 + L / 2) / 2), deck);
  const PH = [0, HB, WELL1 + 2.6];
  B.add(box(2.6, 2.0, 2.4, PH[0] + 1.1, PH[1] + 1.0, PH[2]), grey);                         // the pilot house, offset to starboard
  B.add(box(2.7, 0.1, 2.5, PH[0] + 1.1, PH[1] + 2.05, PH[2]), greyD);
  B.add(box(0.9, 0.08, 0.5, PH[0] + 1.1, PH[1] + 2.15, PH[2] + 0.3), boot);                 // radar / horn box on the roof
  for (const s of [-1, 1]) B.add(cylY(0.13, 1.6, s * 1.6, HB + 0.8, L / 2 - 2.0, 8), boot);   // exhaust stacks
  B.add(cylY(0.05, 3.2, PH[0] - 0.2, PH[1] + 3.6, PH[2] + 0.6, 6), steel);                    // the mast
  B.add(box(0.5, 0.06, 0.06, PH[0] - 0.2, PH[1] + 4.6, PH[2] + 0.6), steel);
  B.add(box(W - 0.4, 0.5, 0.3, 0, HB + 0.25, L / 2 - 0.15), greyD);                          // the transom rail
  B.add(cylZ(0.25, 0.6, -1.0, 0.0, L / 2 - 0.2, 10), steel); B.add(cylZ(0.25, 0.6, 1.0, 0.0, L / 2 - 0.2, 10), steel);   // rudder posts / fenders
  B.build(g, 'lcmHull');
  // windows: dark glass on the pilot house faces
  for (const [w, h, x, y, z, ry] of [[2.2, 0.55, PH[0] + 1.1, PH[1] + 1.55, PH[2] - 1.21, 0], [2.0, 0.55, PH[0] + 2.41, PH[1] + 1.55, PH[2], Math.PI / 2], [2.0, 0.55, PH[0] - 0.21, PH[1] + 1.55, PH[2], Math.PI / 2]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass); m.position.set(x, y, z); m.rotation.y = ry; g.add(m);
  }
  // the bow ramp: hinged at the well's forward edge, a plate with stiffeners and a lip; up it is the boat's bow
  const ramp = new THREE.Group(); ramp.position.set(0, WELLY, WELL0); g.add(ramp);
  const RB = builder({ dust: 0.2, mud: 0.2, yDust: 99 });
  RB.add(box(W - 1.9, 0.18, 0, 0, 0, 0), grey);
  RB.add(box(W - 1.9, 2.0, 0.16, 0, 1.0, -0.08), grey);                                       // the plate (up: the bow face)
  for (let x = -2; x <= 2; x += 1) RB.add(box(0.08, 2.0, 0.14, x, 1.0, 0.06), greyD);        // stiffeners (inboard face)
  RB.add(box(W - 1.9, 0.12, 0.3, 0, 2.02, -0.1), steel);                                      // the lip
  RB.add(box(W - 1.9, 0.6, 0.05, 0, 0.6, -0.18), boot);                                       // wet / scraped band
  RB.build(ramp, 'lcmRamp');
  // a white hull number on both bows
  return { group: g, ramp, WELL: { y: WELLY, z: (WELL0 + WELL1) / 2 }, BOW_Z: BOW - 0.6, L, W };
}
