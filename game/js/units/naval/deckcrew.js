// Flight-deck crew: instanced people in coloured jerseys (USN 1980: yellow = aircraft directors, blue = plane
// handlers / tractor drivers, green = catapult & arresting gear / maintenance, red = ordnance / crash & salvage,
// purple = fuel ("grapes"), brown = plane captains, white = safety / LSO / medical). Cranial helmets in the jersey
// colour, goggles, float coats. Four InstancedMeshes for any number of people: jersey parts (tinted per person),
// head + belt (neutral), arms (2 per person, tinted) and legs (2 per person). Simple procedural animation:
// idle (breathing, weight shifts, a look round), walk (along a loop of points), signal (a yellow shirt marshalling),
// kneel (at a wheel: chocks and chains), lso (paddles / pickle held up), talk (gestures).
// Frame: the ship's (x starboard, y up, z aft). Each member: { x, z, y, yaw, jersey, mode, path, speed }.
import * as THREE from 'three';
import { Kit, rng } from './navkit.js';

export const JERSEY = { yellow: 0xe8c21c, blue: 0x2a52b8, green: 0x2f8a3a, red: 0xc0281e, purple: 0x6a2c8c, brown: 0x6b4423, white: 0xe8e8e2, cyan: 0x40d8ff };
const SKIN = [0xc89a74, 0x9b6a48, 0xe0b48e, 0x6e4a32];
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _l = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color(), _c2 = new THREE.Color();

function geos() {
  // jersey: torso (float coat), cranial helmet shell; pivot = feet at the origin, facing -z
  const j = new Kit({ wear: 0 });
  j.box(0.44, 0.58, 0.26, 0xffffff, 0, 1.2, 0);                 // float coat / jersey
  j.box(0.46, 0.06, 0.28, 0xb8b8b8, 0, 1.12, 0);                // reflective band
  j.box(0.46, 0.06, 0.28, 0xb8b8b8, 0, 1.36, 0);
  j.sphere(0.135, 0xffffff, 0, 1.69, 0.01, 1.05, 0.9, 1.1, 8, 5); // cranial shell
  const b = new Kit({ wear: 0 });
  b.box(0.17, 0.2, 0.17, 0xc89a74, 0, 1.6, 0);                 // face (tinted per person by skin via a second colour? kept neutral)
  b.box(0.2, 0.06, 0.06, 0x1a1c1e, 0, 1.64, -0.09);             // goggles
  b.box(0.06, 0.1, 0.1, 0x2a2a2a, -0.11, 1.62, 0.0); b.box(0.06, 0.1, 0.1, 0x2a2a2a, 0.11, 1.62, 0.0);   // ear defenders
  b.box(0.4, 0.08, 0.24, 0x2b2b26, 0, 0.92, 0);                 // belt
  b.box(0.38, 0.1, 0.22, 0x33384a, 0, 0.98, 0);                 // trousers seat
  const a = new Kit({ wear: 0 });                                // arm: pivot at the shoulder, hangs down -y
  a.box(0.12, 0.52, 0.13, 0xffffff, 0, -0.26, 0);
  a.box(0.11, 0.12, 0.12, 0x3a3a3a, 0, -0.58, 0);                // glove (darkened by the tint)
  const l = new Kit({ wear: 0 });                                // leg: pivot at the hip
  l.box(0.16, 0.78, 0.18, 0x33384a, 0, -0.39, 0);                // dungarees
  l.box(0.16, 0.12, 0.28, 0x151515, 0, -0.84, -0.04);            // boot
  return { j: j.geometry(), b: b.geometry(), a: a.geometry(), l: l.geometry() };
}
let G = null;

export function createCrew(members, { seed = 5 } = {}) {
  G ||= geos();
  const n = members.length, r = rng(seed);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mk = (g, k) => { const m = new THREE.InstancedMesh(g, mat, n * k); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; return m; };
  const J = mk(G.j, 1), B = mk(G.b, 1), A = mk(G.a, 2), L = mk(G.l, 2);
  const group = new THREE.Group(); group.name = 'deckcrew'; group.add(J, B, A, L);
  for (let i = 0; i < n; i++) {
    const p = members[i];
    p.ph = r() * 100; p.look = 0; p.lookT = r() * 6; p.seg = 0; p.s = 0; p.speed ??= 1.2 + r() * 0.3; p.y ??= 0; p.yaw ??= 0;
    p.x0 = p.x; p.z0 = p.z; p.yaw0 = p.yaw;
    _c.setHex(JERSEY[p.jersey] ?? p.jersey ?? 0xffffff); J.setColorAt(i, _c); A.setColorAt(2 * i, _c); A.setColorAt(2 * i + 1, _c);
    B.setColorAt(i, _c.setRGB(1, 1, 1).lerp(_c2.setHex(SKIN[(r() * SKIN.length) | 0]), 0.3));
    L.setColorAt(2 * i, _c.setRGB(1, 1, 1)); L.setColorAt(2 * i + 1, _c);
  }
  const crew = { group, members, J, B, A, L, scatter: null };
  // write one person's matrices: root (x, y, z, yaw), body lean / drop, arm and leg swings (rad, + = forward)
  function pose(i, x, y, z, yaw, lean, drop, aL, aR, aLz, aRz, lL, lR) {
    _q.setFromEuler(_e.set(lean, yaw, 0, 'YXZ'));
    _m.compose(_v.set(x, y - drop, z), _q, _s);
    J.setMatrixAt(i, _m); B.setMatrixAt(i, _m);
    for (let k = 0; k < 2; k++) {
      const sd = k ? 1 : -1;
      _l.compose(_v.set(sd * 0.29, 1.45, 0), _q.setFromEuler(_e.set(k ? aR : aL, 0, (k ? aRz : aLz) * sd, 'XYZ')), _s); _r.multiplyMatrices(_m, _l); A.setMatrixAt(2 * i + k, _r);
      _l.compose(_v.set(sd * 0.1, 0.9, 0), _q.setFromEuler(_e.set(k ? lR : lL, 0, 0)), _s); _r.multiplyMatrices(_m, _l); L.setMatrixAt(2 * i + k, _r);
    }
  }
  // avoid(x, z) -> [dx, dz] | null: a push away from danger (rotor wash, a landing aircraft) in the ship's frame
  // COMMANDER: clear a circle (ship frame) at once - the commander switches into a unit standing there: whoever is in
  // it steps out to the edge (and waits there while the unit stays: avoid)
  crew.clearArea = (cx, cz, r) => {
    for (const p of members) {
      if (p.mode === 'seated') continue;
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz); if (d >= r) continue;
      const k = d > 0.05 ? 1 / d : 1, ex = d > 0.05 ? dx * k : 1, ez = d > 0.05 ? dz * k : 0;
      p.x = cx + ex * (r + 0.4); p.z = cz + ez * (r + 0.4); p.yaw = Math.atan2(ex, ez); p.fled = 4;
    }
  };
  crew.update = (dt, t, avoid = null) => {
    for (let i = 0; i < n; i++) {
      const p = members[i]; p.ph += dt;
      let { x, z, yaw } = p, lean = 0, drop = 0, aL = 0, aR = 0, aLz = 0.06, aRz = 0.06, lL = 0, lR = 0;
      const push = p.mode !== 'seated' && avoid && avoid(x, z);
      if (push) {   // clear the area: walk briskly away, crouched against the downwash
        const len = Math.hypot(push[0], push[1]) || 1, sp = 2.4 * dt;
        p.x += push[0] / len * sp; p.z += push[1] / len * sp; x = p.x; z = p.z;
        yaw = p.yaw = Math.atan2(-push[0], -push[1]); p.fled = 4;
        const w = p.ph * 9; lL = Math.sin(w) * 0.6; lR = -lL; aL = -lL * 0.5; aR = lL * 0.5; lean = 0.25;
        pose(i, x, p.y, z, yaw, lean, 0.04, aL, aR, aLz, aRz, lL, lR); continue;
      }
      if (p.fled > 0) {   // drift back to the post once it is clear
        p.fled -= dt;
        if (p.fled <= 0 && avoid && avoid(p.x0, p.z0)) p.fled = 0.5;   // (the post itself is still under the rotor / the unit: wait at the edge)
        if (p.fled <= 0 && p.mode !== 'walk') { const dx = p.x0 - p.x, dz = p.z0 - p.z, d = Math.hypot(dx, dz); if (d > 0.3) { p.fled = 0.01; const sp = Math.min(d, 1.3 * dt); p.x += dx / d * sp; p.z += dz / d * sp; p.yaw = Math.atan2(-dx, -dz); const w = p.ph * 6.5; lL = Math.sin(w) * 0.5; pose(i, p.x, p.y, p.z, p.yaw, 0, 0, -lL * 0.6, lL * 0.6, aLz, aRz, lL, -lL); continue; } else p.yaw = p.yaw0; }
      }
      switch (p.mode) {
        case 'walk': {
          const P = p.path, a = P[p.seg], b = P[(p.seg + 1) % P.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
          p.s += p.speed * dt; if (p.s >= L) { p.s -= L; p.seg = (p.seg + 1) % P.length; }
          const k = p.s / L, nx = a[0] + dx * k, nz = a[1] + dz * k;
          if (avoid && avoid(nx, nz)) { p.s = Math.max(0, p.s - p.speed * dt); x = p.x; z = p.z; yaw = p.yaw; break; }   // (the way is under a rotor / the unit: wait at the edge)
          x = p.x = nx; z = p.z = nz; yaw = p.yaw = Math.atan2(-dx, -dz);
          const w = p.ph * p.speed * 5.2; lL = Math.sin(w) * 0.5; lR = -lL; aL = -lL * 0.7; aR = lL * 0.7; drop = -Math.abs(Math.cos(w)) * 0.03 + 0.03;
          break;
        }
        case 'signal': {   // marshalling: both arms up, alternating "come ahead"
          const w = p.ph * 2.6; aL = 2.6 + Math.sin(w) * 0.5; aR = 2.6 - Math.sin(w) * 0.5; aLz = 0.3; aRz = 0.3; lean = 0.03;
          yaw += Math.sin(p.ph * 0.3) * 0.2; break;
        }
        case 'kneel': {    // at a wheel: one knee down, working with the hands
          drop = 0.45; lL = 1.45; lR = -0.35; lean = 0.3; aL = 0.9 + Math.sin(p.ph * 3) * 0.2; aR = 1.0 - Math.sin(p.ph * 3.3) * 0.2; break;
        }
        case 'lso': {      // the pickle held up, eyes aft on the groove
          aR = 1.9 + Math.sin(p.ph * 0.7) * 0.08; aRz = 0.1; aL = -0.2; yaw += Math.sin(p.ph * 0.4) * 0.15; break;
        }
        case 'seated': {   // driving a tractor: p.at() gives the seat (x, y, z, yaw) in the ship frame
          const a = p.at(); x = p.x = a[0]; z = p.z = a[2]; yaw = a[3]; p.ySeat = a[1];
          drop = 0.42; lL = 1.45; lR = 1.45; aL = 0.9 + Math.sin(p.ph * 1.3) * 0.05; aR = 0.9; aLz = aRz = 0.12; break;
        }
        case 'talk': {
          aR = 0.6 + Math.max(0, Math.sin(p.ph * 1.7)) * 0.7; aRz = 0.25; aL = Math.sin(p.ph * 0.9) * 0.1; yaw += Math.sin(p.ph * 0.5) * 0.25; break;
        }
        default: {         // idle: breathing, a weight shift now and then, look around
          p.lookT -= dt; if (p.lookT <= 0) { p.lookT = 3 + (p.ph * 7.3 % 6); p.look = ((p.ph * 13.7) % 1.6) - 0.8; }
          const sh = Math.sin(p.ph * 0.37); lL = sh * 0.05; lR = -sh * 0.05;
          aL = Math.sin(p.ph * 1.1) * 0.03; aR = -aL; lean = Math.sin(p.ph * 1.6) * 0.012;
          p.yawS = (p.yawS ?? 0) + (p.look - (p.yawS ?? 0)) * Math.min(1, dt * 1.5); yaw += p.yawS;
          if (p.hands) { aL = -0.2; aR = -0.2; aLz = 0.5; aRz = 0.5; }   // hands on hips
        }
      }
      pose(i, x, p.mode === 'seated' ? p.ySeat : p.y, z, yaw, lean, drop, aL, aR, aLz, aRz, lL, lR);
    }
    J.instanceMatrix.needsUpdate = B.instanceMatrix.needsUpdate = A.instanceMatrix.needsUpdate = L.instanceMatrix.needsUpdate = true;
  };
  crew.update(0, 0);
  return crew;
}
