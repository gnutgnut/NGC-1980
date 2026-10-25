// The KRAKEN's SKY CARRIER refit, RUNAWAY style: the machines' answer to the ALBATROSS's bolted-on steel fans
// (ships.js addLiftFans). Four faceted ceramic ducts on forked dark-composite struts that grow out of ceramic root
// blisters on the hull, scimitar rotors with ceramic tips, three stators set at uneven angles (one thick, carrying
// the drive), sensor nodules and a single fin on each duct, pale cyan emissive lips and seams. No rivets, no
// bracing wires, nothing square.
//
// Contract: IDENTICAL to addLiftFans (war.js skyRefit / skyVisuals / skyFall drive it): parts.fans = [{ arm, rotor,
// glow, disc, sd, z }], arm hidden at scale 0.001 until the refit unfolds it (war.js scales it 0 -> 1), rotor spun about
// y, glow.material.opacity and disc.material.opacity animated. Same FAN_POS and the fan centres at
// x = sd * (W * 0.42 + 17), so the downwash spray lands under them. The struts fork round the KRAKEN's sponson
// supports (z 36) and the duct sits 0.6 m lower than the ALBATROSS's to clear the port aft elevator.
import * as THREE from 'three';
import { Kit, T, DEG, hullMat } from './navkit.js';

const FAN_POS = [[-1, -38], [1, -38], [-1, 36], [1, 36]];   // = ships.js FAN_POS (kept in step by navalbench)
const W = 28, DECK = 8;                                      // = ships.js CARRIER / kraken.js KRK
const CER = 0xd3d6d1, CER_D = 0xaeb2ad, COMP = 0x2a2e33, COMP_L = 0x3a3f45, DARKG = 0x15181b, CYAN = 0x6fe8ff;
const FAN_X = 17, FAN_Y = -0.6, R_IN = 7.1;

let _geo = null;
function fanGeos() {
  if (_geo) return _geo;
  const body = new Kit({ wear: 0.02, seed: 31 }), gl = new Kit({ wear: 0 }), rot = new Kit({ wear: 0.015, seed: 33 });
  // root blister on the hull side, then the forked strut: two tapering composite blades with ceramic caps
  body.add(new THREE.SphereGeometry(1, 8, 6), CER, T(0.2, 0, 0, 0, 0, 0, 1.3, 1.6, 3.4));
  body.add(new THREE.OctahedronGeometry(0.45, 0), DARKG, T(1.35, 0.7, -1.6, 0, 0.3, 0, 1, 1.4, 1));   // a sensor nodule on the blister
  gl.add(new THREE.TorusGeometry(0.42, 0.04, 4, 6), CYAN, T(1.4, 0.7, -1.6, 0, Math.PI / 2, 0));
  for (const zo of [-1.7, 1.7]) {
    const blade = [[0.5, -1.6], [FAN_X - R_IN - 0.6, -0.7], [FAN_X - R_IN + 0.3, -0.4], [FAN_X - R_IN + 0.3, 0.42], [FAN_X - R_IN - 0.6, 0.58], [0.5, 1.12]];
    body.prism(blade, 0.6, COMP_L, T(0, FAN_Y * 0.5, zo - 0.3, 0, 0, -0.02));
    body.prism([[0.8, 1.08], [FAN_X - R_IN - 0.4, 0.55], [FAN_X - R_IN - 0.4, 0.66], [0.8, 1.2]], 0.66, CER, T(0, FAN_Y * 0.5, zo - 0.33, 0, 0, -0.02));
    for (const k of [-1, 1]) gl.rod([1.4, -0.15 + FAN_Y * 0.5, zo + k * 0.31], [FAN_X - R_IN - 0.7, -0.1 + FAN_Y * 0.5 - 0.2, zo + k * 0.31], 0.03, CYAN, 4);
  }
  body.add(new THREE.CylinderGeometry(0.9, 1.15, 4.4, 6), CER_D, T(FAN_X - R_IN - 1.1, FAN_Y * 0.75, 0, Math.PI / 2, 0, 0, 1, 1, 0.75));   // the faceted collar where the fork meets the duct
  gl.add(new THREE.TorusGeometry(0.98, 0.04, 4, 6), CYAN, T(FAN_X - R_IN - 1.1, FAN_Y * 0.75, 2.0, 0, 0, 0, 1, 0.75, 1)); gl.add(new THREE.TorusGeometry(0.98, 0.04, 4, 6), CYAN, T(FAN_X - R_IN - 1.1, FAN_Y * 0.75, -2.0, 0, 0, 0, 1, 0.75, 1));
  // the duct: a faceted aerofoil ring (ceramic outside, composite lining inside), 14 facets
  body.push(T(FAN_X, FAN_Y, 0));
  const lathe = (pts, c) => body.add(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 14), c, T(0, 0, 0, 0, Math.PI / 14));
  lathe([[7.55, -1.5], [8.25, -1.15], [8.55, 0.1], [8.35, 1.05], [7.65, 1.4]], CER);
  lathe([[7.65, 1.4], [7.25, 1.15], [R_IN, 0.3], [7.2, -1.0], [7.55, -1.5]], COMP);
  gl.push(T(FAN_X, FAN_Y, 0));
  gl.add(new THREE.TorusGeometry(7.66, 0.08, 4, 28), CYAN, T(0, 1.43, 0, Math.PI / 2));     // the lip
  gl.add(new THREE.TorusGeometry(7.5, 0.06, 4, 28), CYAN, T(0, -1.52, 0, Math.PI / 2));     // the exit ring
  for (let i = 0; i < 14; i += 2) { const a = (i + 0.5) / 14 * Math.PI * 2; gl.box(0.05, 1.6, 0.05, 0x9ff4ff, Math.cos(a) * 8.5, 0.1, Math.sin(a) * 8.5, 0, -a, 0); }   // facet seams
  // hub: a faceted ceramic nacelle with a dark sensor eye, three stators at uneven angles (one thick: the drive)
  body.add(new THREE.CylinderGeometry(1.05, 1.35, 2.4, 6), CER, T(0, -0.3, 0, 0, 0.2, 0));
  body.add(new THREE.CylinderGeometry(0.2, 1.05, 0.9, 6), CER_D, T(0, 1.35, 0, 0, 0.2, 0));
  body.add(new THREE.CylinderGeometry(1.35, 0.7, 0.8, 6), COMP, T(0, -1.9, 0, 0, 0.2, 0));
  gl.add(new THREE.OctahedronGeometry(0.22, 0), 0xbff8ff, T(0, -2.35, 0));
  gl.add(new THREE.TorusGeometry(1.2, 0.05, 4, 6), CYAN, T(0, -1.55, 0, Math.PI / 2, 0, 0.2));
  for (const [a, t, h] of [[20, 0.5, 0.9], [140, 0.22, 0.55], [262, 0.22, 0.55]]) {
    const ar = a * DEG, L = R_IN - 1.2;
    body.add(new THREE.BoxGeometry(L, h, t), COMP, T(Math.cos(ar) * (1.2 + L / 2), -1.0, -Math.sin(ar) * (1.2 + L / 2), 0, ar, 0));
  }
  // sensor nodules and the fin on the duct: placed unevenly on purpose
  for (const [a, y, s] of [[60, 0.5, 0.55], [205, -0.4, 0.42], [320, 0.8, 0.38]]) {
    const ar = a * DEG, x = Math.cos(ar) * 8.75, z = -Math.sin(ar) * 8.75;
    body.add(new THREE.OctahedronGeometry(s, 0), DARKG, T(x, y, z, 0, ar, 0, 1, 1.5, 1));
    gl.add(new THREE.TorusGeometry(s * 0.9, 0.035, 4, 6), CYAN, T(x + Math.cos(ar) * 0.1, y, z - Math.sin(ar) * 0.1, 0, ar + Math.PI / 2, 0));
  }
  body.prism([[0, 0], [2.6, 0], [1.6, 2.2], [0.7, 2.2]], 0.3, CER_D, T(Math.cos(-0.35) * 8.2, 1.1, -Math.sin(-0.35) * 8.2 - 0.15, 0, -0.35 + Math.PI, 0));
  body.pop(); gl.pop();
  // the rotor: nine swept scimitar blades, dark composite with ceramic tips, a little pitch
  const blade = [[1.1, -0.42], [3.6, -0.62], [5.9, -0.42], [7.0, 0.18], [6.75, 0.5], [4.3, 0.42], [1.1, 0.38]];
  for (let i = 0; i < 9; i++) {
    rot.push(T(0, 0, 0, 0, i / 9 * Math.PI * 2, 0));
    rot.add(new THREE.ExtrudeGeometry(new THREE.Shape(blade.map(([x, z]) => new THREE.Vector2(x, z))), { depth: 0.12, bevelEnabled: false }), COMP, T(0, 0.06, 0, Math.PI / 2 + 0.32, 0, 0));
    rot.box(0.35, 0.13, 0.62, CER, 6.95, 0, 0.33, 0, 0.5, 0);
    rot.pop();
  }
  rot.add(new THREE.CylinderGeometry(1.15, 1.15, 0.5, 9), COMP_L, T(0, 0, 0));
  _geo = { body: body.geometry(), glow: gl.geometry(), rotor: rot.geometry(), disc: new THREE.CircleGeometry(R_IN, 28).rotateX(-Math.PI / 2) };
  return _geo;
}

export function addLiftFansRW(parts) {
  const g = parts.group, G = fanGeos();
  parts.fans = [];
  for (const [sd, z] of FAN_POS) {
    const arm = new THREE.Group(); arm.position.set(sd * W * 0.42, DECK - 2.5, z); g.add(arm);
    const inner = new THREE.Group(); inner.scale.x = sd; arm.add(inner);   // built for the starboard side, mirrored for port
    inner.add(new THREE.Mesh(G.body, hullMat()));
    const glow = new THREE.Mesh(G.glow, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.0 })); inner.add(glow);
    const fan = new THREE.Group(); fan.position.set(FAN_X, FAN_Y, 0); inner.add(fan);
    const rotor = new THREE.Group(); rotor.position.y = 0.45; fan.add(rotor);
    rotor.add(new THREE.Mesh(G.rotor, hullMat()));
    const disc = new THREE.Mesh(G.disc, new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); disc.position.y = 0.5; fan.add(disc);
    arm.scale.set(0.001, 0.001, 0.001); arm.visible = false;
    parts.fans.push({ arm, rotor, glow, disc, sd, z });
  }
  return parts.fans;
}
export { FAN_POS as FAN_POS_RW };
