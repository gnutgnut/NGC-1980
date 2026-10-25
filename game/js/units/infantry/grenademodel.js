// NGC-1980 ngc/marine-polish: the hand grenades as world objects (one merged, vertex-coloured geometry each, the house
// style), shared by the player's thrown grenades (marine.js), the AI's (groundwar.js, instanced), the grenade in a
// figure's hand (soldiermodel.js) and the frags on the ammo pouches.
//   M67 fragmentation: a 64 mm olive-drab steel sphere (FM 3-23.30: 2.5 in diameter, 14 oz, yellow marking band),
//   the M213 fuze on top (fuze body, the spoon down the side, the pull ring and safety pin, the safety clip).
//   M18 coloured smoke: a 2.5 x 4.5 in grey-green sheet-steel canister, the top painted the smoke colour, the same fuze
//   family (M201A1) on top.
// Origin at the grenade's centre (M67) / the canister's centre (M18); +y up along the fuze.
import * as THREE from 'three';
import { Kit } from './meshkit.js';

let _m67 = null, _mat = null; const _m18 = new Map();
const steel = 0x8a8a82, od = 0x4d5636, band = 0xc8b45a;
// the M213 fuze group: body, spoon down the +z side, ring and pin on the -x side (y0: the fuze body's base)
function fuze(k, y0, r = 0.032, o = [0, 0, 0], low = false) {
  const P = (x, y, z) => [o[0] + x, o[1] + y, o[2] + z];
  k.cyl(0.009, 0.011, 0.022, steel, P(0, y0 + 0.011, 0), 'y', low ? 6 : 8);                      // fuze body
  k.box(0.013, 0.004, 0.024, steel, P(0, y0 + 0.022, 0.008));                                    // spoon over the top
  k.box(0.013, 0.07, 0.004, steel, P(0, y0 - 0.012, r + 0.004), [0.12, 0, 0]);                   // spoon down the side
  if (low) return;
  k.add(new THREE.TorusGeometry(0.012, 0.0018, 4, 12), steel, P(-0.018, y0 + 0.014, 0), [0, Math.PI / 2, 0]);   // pull ring
  k.cyl(0.0012, 0.0012, 0.02, steel, P(-0.008, y0 + 0.014, 0), 'x', 4);                          // safety pin
}
// an M67 into another kit at o (upright): the frags on a Marine's ammo pouches (soldiermodel.js); low = fewer triangles
export function m67Into(k, o = [0, 0, 0], low = false) {
  k.sphere(0.032, od, o, low ? 7 : 10, [1, 1.08, 1]);
  k.cyl(0.0322, 0.0322, 0.005, band, [o[0], o[1] + 0.012, o[2]], 'y', low ? 8 : 12, null, true);   // yellow band (HE)
  fuze(k, 0.03, 0.032, o, low);
  return k;
}
export function m67Geometry() {
  if (_m67) return _m67;
  _m67 = m67Into(new Kit()).geometry();
  return _m67;
}
export function m18Geometry(top = 0x6aa056) {
  if (_m18.has(top)) return _m18.get(top);
  const k = new Kit();
  k.cyl(0.03, 0.03, 0.115, 0x5c6448, [0, 0, 0], 'y', 12);
  k.cyl(0.0303, 0.0303, 0.018, top, [0, 0.045, 0], 'y', 12);
  for (const y of [-0.058, 0.058]) k.cyl(0.0305, 0.0305, 0.004, 0x4a5038, [0, y, 0], 'y', 12);   // rolled seams
  fuze(k, 0.0575, 0.03);
  const g = k.geometry(); _m18.set(top, g);
  return g;
}
export function grenadeMaterial() { return _mat || (_mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); }
// a single mesh (the player's thrown grenades, a grenade in a figure's hand)
export function buildM67() { return new THREE.Mesh(m67Geometry(), grenadeMaterial()); }
export function buildM18(top) { return new THREE.Mesh(m18Geometry(top), grenadeMaterial()); }
