// PARITY (ngc/parity): the Task Force's AI M60A3 in the ground war, drawn with the player's tank model (armor/tankmodel.js,
// the TANK agent's M60A3 TTS: MERDC camouflage, running gear riding the suspension, turret, gun recoil, cupola, hatches)
// behind the same view contract as runaway/mbtmodel.js: { group, update(T, dt, time), parts } where T is the mbt.js sim
// (drive on mbttrack.js's trackfm near the camera, the placeholder far off). groundwar.js picks it for side-1 MBTs.
//   buildM60View(o) -> V;  V.pose(x, y, z, yaw, pitch, roll, trackPos, az, el)  (the landing craft's scripted roll-off)
import * as THREE from 'three';
import { buildM60A3Mesh } from '../armor/tankmodel.js';
import { M60A3 } from '../armor/m60a3.js';

export function buildM60View(o = {}) {
  const group = new THREE.Group(); group.name = 'gw-m60a3';
  const body = new THREE.Group(); group.add(body);   // pitch / roll under the heading (as mbtmodel.js)
  const M = buildM60A3Mesh({ seed: o.seed ?? 3.7, dirt: o.dirt ?? 1.2 }); body.add(M.group);
  // a soft contact shadow (the ground war's views all carry one)
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(M60A3.DIM.WIDTH * 1.15, M60A3.DIM.HULL_L * 1.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
  sh.position.y = 0.05; sh.renderOrder = -1; group.add(sh);
  const nW = M60A3.TRACK.WHEELS.length, travel = [new Array(nW).fill(0), new Array(nW).fill(0)], trackPos = [0, 0];
  const st = { travel, trackPos, az: 0, el: 0, recoil: 0, cupAz: 0, mgEl: 0, hatches: { driver: 0, loader: 0, cupola: 0 }, tts: 1, light: 0 };
  let recoilT = 9, lastReload = 0, dead = false, hatch = 0;
  const V = {
    group, parts: { body, mesh: M }, kind: 'mbt',
    update(T, dt, time) {
      const D = T.drive;
      group.position.set(D.p[0], D.p[1], D.p[2]); group.rotation.set(0, D.yaw, 0);
      body.rotation.set(D.pitch, 0, -D.roll, 'XYZ');
      // roadwheel travel from trackfm near the camera (the far placeholder has no suspension: wheels at rest)
      const S = D.full && D.sim;
      for (let i = 0; i < 2; i++) for (let k = 0; k < nW; k++) { const w = S && S.wheels[i] && S.wheels[i][k]; travel[i][k] = w ? (w.on ? w.s : Math.min(w.s, 0)) : 0; }
      trackPos[0] = D.wheelSpin[0]; trackPos[1] = D.wheelSpin[1];
      st.az = T.turretYaw; st.el = T.gunPitch;
      // the gun recoils when the loader's clock restarts (a round fired), and runs out again over ~0.6 s
      if (T.reload > lastReload + 1) recoilT = 0; lastReload = T.reload; recoilT += dt;
      st.recoil = recoilT < 0.08 ? M60A3.TURRET.RECOIL_LEN * recoilT / 0.08 : Math.max(0, M60A3.TURRET.RECOIL_LEN * (1 - (recoilT - 0.08) / 0.6));
      // the commander rides head out on the move, buttons up in a fight (o.fighting: set by the host from the AI)
      hatch += ((V.fighting || !T.alive ? 0 : 1) - hatch) * Math.min(1, dt * 1.5);
      st.hatches.cupola = hatch; st.cupAz = T.turretYaw * 0.3;
      st.thrown = D.full && S.dmg ? S.dmg.thrown : null;
      M.animate(st);
      if (!T.alive && !dead) { dead = true; M.group.traverse(m => { if (m.isMesh && m.material && m.material.color) { m.material = m.material.clone(); m.material.color.multiplyScalar(0.28); } }); }   // burnt out
    },
    // the scripted roll-off a landing craft's ramp (no sim yet): pose the hull directly
    pose(x, y, z, yaw, pitch, roll, tp) {
      group.position.set(x, y, z); group.rotation.set(0, yaw, 0); body.rotation.set(pitch, 0, -roll, 'XYZ');
      for (let i = 0; i < 2; i++) { travel[i].fill(0); trackPos[i] = tp; }
      st.az = 0; st.el = 0.05; st.recoil = 0; st.hatches.cupola = 1; st.hatches.driver = 0; st.cupAz = 0; M.animate(st);
    },
  };
  return V;
}
