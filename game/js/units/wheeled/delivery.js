// delivery.js - how the motor pool gets a vehicle to an island in 1980 (ngc/wheeledgame), instead of it appearing:
//   M151A2 (key 7): a CH-46E Sea Knight from the ALBATROSS with the jeep slung underneath (a CH-46 lifts an M151 easily:
//     ~1,100 kg against ~4,500 kg on the hook), flies out at ~80 kt with the load, hovers over the motor pool, sets it
//     down, releases the sling and goes home.
//   M35A2 (key 9): 5.9 t is too much for the Sea Knight's hook, so an LCM-8 landing craft runs it in to the island's
//     beach (12 kt, from ~350 m out), drops the ramp and the truck drives off up the beach under its own power (the
//     wheeled sim with a driver.js follower at the wheel), where it waits for you.
// The vehicle exists from the order on (a craft you can't get into yet: "IT IS STILL ON ITS WAY"); kinematic while it
// rides, the real sim from the moment its wheels are down.
//   const D = createDelivery({ scene, war, GR, fx, sfx, say, feed, terrainH, camZ });  D.pool = pool (motorpool.js)
//   D.order(type, island, spot) ; each frame D.update(dt)
import * as THREE from 'three';
import { buildCH46Mesh } from '../air/rotary/ch46model.js';
import { createRotorSound } from '../air/rotary/rotorsound.js';
import { buildLCM8Mesh } from './lcm8model.js';
import { createFollower } from './driver.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const SLING = 5.5;   // m of strop from the hook to the load's lifting eyes (INFERRED, a single-point sling + 4-leg bridle)

export function createDelivery(o) {
  const { scene, war, GR, fx, sfx, say, feed, terrainH } = o;
  const jobs = [];
  let rotor = null;
  const lineMat = new THREE.LineBasicMaterial({ color: 0x2a2a26 });
  const D = { pool: null, jobs };
  // a beach a truck can drive up: round the island every 2 degrees to the waterline, then 30 m inland that climbs less than
  // ~1 in 4 and leans less than ~1 in 6 across (the M35's tilt-table margin, with a load, on wet sand), nothing in the way;
  // the gentlest wins, the side facing the ALBATROSS preferred (as armordelivery.js picks the armour's beaches)
  function landing(I) {
    const c = war.carrier, a0 = c ? Math.atan2(c.p.z - I.z, c.p.x - I.x) : 0; let best = null;
    for (let k = 0; k < 180; k++) {
      const a = k * Math.PI / 90, cx = Math.cos(a), sz = Math.sin(a); let shore = -1;
      for (let r = 8; r < (I.r || 80) + 160; r += 1) if (terrainH(I.x + cx * r, I.z + sz * r) < 0) { shore = r; break; }
      if (shore < 0) continue;
      let ok = true, worst = 0;
      for (let q = 0; q <= 30 && ok; q += 2) {
        const r = shore - q, x = I.x + cx * r, z = I.z + sz * r;
        const along = Math.abs(terrainH(x + cx * 2, z + sz * 2) - terrainH(x - cx * 2, z - sz * 2)) / 4, across = Math.abs(terrainH(x - sz * 2.5, z + cx * 2.5) - terrainH(x + sz * 2.5, z - cx * 2.5)) / 5;
        worst = Math.max(worst, along, across * 1.5); if (along > 0.25 || across > 0.16) ok = false;
        if (q >= 8 && !GR.clearAt(x, z, 3)) ok = false;
      }
      if (!ok) continue;
      const score = worst + Math.abs(Math.atan2(Math.sin(a - a0), Math.cos(a - a0))) * 0.05;
      if (!best || score < best.score) { const bx = I.x + cx * (shore - 4), bz = I.z + sz * (shore - 4); best = { name: `${I.name} BEACH`, x: bx, z: bz, y: terrainH(bx, bz), yaw: Math.atan2(cx, sz), score, plat: null }; }
    }
    return best;
  }
  // ---------------------------------------------------------------- orders
  D.order = (type, I, spot) => {
    const pool = D.pool; if (!pool) return false;
    if (type === 'm35') {
      const beach = landing(I) || GR.beach(I);
      if (!beach) { const V = pool.spawn(type, spot, { home: I }); feed(`MOTOR POOL: M35A2 AT ${spot.name}`, 'good'); return V; }
      const V = pool.spawn(type, beach, { home: I }); V.slung = true;
      const M = buildLCM8Mesh(); scene.add(M.group);
      // the run in: from ~350 m out along the beach's seaward line to where the bow grounds (~0.7 m of water)
      const ux = Math.sin(beach.yaw), uz = Math.cos(beach.yaw);   // seaward (the beach spot faces inland: forward = -(sin, cos))
      let gx = beach.x, gz = beach.z;
      for (let d = 0; d < 150; d += 1) { const x = beach.x + ux * d, z = beach.z + uz * d; if (terrainH(x, z) < -0.7) { gx = x; gz = z; break; } }
      const job = { kind: 'lcm', type, V, I, beach, M, t: 0, phase: 'run', x: gx + ux * 350, z: gz + uz * 350, gx, gz, ux, uz, yaw: beach.yaw, ramp: 0, label: 'M35A2' };
      jobs.push(job);
      say(`M35A2 ON ITS WAY  -  AN LCM-8 IS RUNNING IT IN TO ${beach.name}`, 2.6); feed(`MOTOR POOL: LCM-8 WITH AN M35A2 FOR ${I.name}`, 'good');
      return V;
    }
    // the M151 under a CH-46
    const V = pool.spawn(type, spot, { home: I }); V.slung = true;
    const M = buildCH46Mesh(); scene.add(M.group);
    const c = war.carrier, from = c && c.sinking === undefined ? { x: c.p.x, z: c.p.z, y: c.p.y + 28 } : { x: spot.x + 900, z: spot.z, y: 60 };
    const line = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(15), 3)), lineMat); line.frustumCulled = false; scene.add(line);
    const job = { kind: 'ch46', type, V, I, spot, M, line, t: 0, phase: 'out', x: from.x, y: from.y, z: from.z, vx: 0, vz: 0, home: from, yaw: Math.atan2(-(spot.x - from.x), -(spot.z - from.z)), swing: [0, 0], label: 'M151A2' };
    jobs.push(job);
    say(`M151A2 ON ITS WAY  -  A CH-46 IS SLINGING IT TO ${spot.name}`, 2.6); feed(`MOTOR POOL: CH-46 WITH AN M151A2 FOR ${I.name}`, 'good');
    return V;
  };
  // ---------------------------------------------------------------- per frame
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();
  const hookOf = (j, out) => out.set(0, -1.65, 0.2).applyEuler(_e.set(j.pitch || 0, j.yaw, j.roll || 0, 'YXZ')).add(_v.set(j.x, j.y, j.z));
  // the load's pose (and its meshes now: the crafts were drawn earlier this frame, it must not trail its carrier)
  function place(V, x, y, z, yaw) {
    const S = V.sim; S.reset([x, y, z], yaw, { running: false });
    for (const m of [V.model && V.model.group, V.far]) if (m) { m.position.set(x, y, z); m.quaternion.set(S.q[0], S.q[1], S.q[2], S.q[3]); }
  }
  function updateCH46(j, dt) {
    const sp = j.spot, V = j.V, S = V.sim;
    j.t += dt;
    const loadY = () => j.y - 1.65 - SLING - 1.55;   // the jeep's wheels under the hook: strop + the jeep (~1.55 m to its lifting eyes)
    if (j.phase === 'out' || j.phase === 'home') {
      const tx = j.phase === 'out' ? sp.x : j.home.x, tz = j.phase === 'out' ? sp.z : j.home.z, dx = tx - j.x, dz = tz - j.z, d = Math.hypot(dx, dz);
      const vWant = j.phase === 'out' ? Math.min(41, 2 + d * 0.16) : 45;   // ~80 kt with an underslung load, slowing for the hover
      const v = Math.hypot(j.vx, j.vz), k = Math.min(1, dt * 0.8);
      j.vx += ((dx / (d || 1)) * vWant - j.vx) * k; j.vz += ((dz / (d || 1)) * vWant - j.vz) * k;
      j.ax = (j.vx - (j.pvx || 0)) / Math.max(dt, 1e-3); j.pvx = j.vx;
      j.x += j.vx * dt; j.z += j.vz * dt;
      // height: clear the ground under the track (look ahead) by 45 m, lower to the set-down hover near the spot
      let gmax = 0; for (let a = 0; a <= 120; a += 20) gmax = Math.max(gmax, terrainH(j.x + j.vx / (v || 1) * a, j.z + j.vz / (v || 1) * a), 0);
      const hoverY = sp.y + 1.65 + SLING + 1.55 + 2.0, cruise = gmax + 45 + SLING;
      const yWant = j.phase === 'out' ? (d < 140 ? hoverY + (cruise - hoverY) * clamp((d - 25) / 115, 0, 1) : cruise) : cruise + 20;
      j.y += clamp(yWant - j.y, -6 * dt, 7 * dt);
      j.yaw += clamp(Math.atan2(Math.sin(Math.atan2(-j.vx, -j.vz) - j.yaw), Math.cos(Math.atan2(-j.vx, -j.vz) - j.yaw)), -0.5 * dt, 0.5 * dt);
      j.pitch = -clamp(v * 0.0045, 0, 0.18) - clamp((vWant - v) * -0.01, -0.12, 0.12);
      if (j.phase === 'out' && d < 3 && v < 2.5) { j.phase = 'lower'; j.vx = j.vz = 0; }
      if (j.phase === 'home' && (d < 30 || j.t > 120)) j.phase = 'gone';
    } else if (j.phase === 'lower') {   // hover, let the load down onto its wheels, release the hook
      j.pitch += (0 - j.pitch) * Math.min(1, dt * 2);
      const g = Math.max(terrainH(sp.x, sp.z), sp.y);
      if (loadY() > g + 0.15) j.y -= Math.min(1.2 * dt, loadY() - g - 0.15);
      else {
        V.slung = false; V.spawnAt({ x: sp.x, z: sp.z, yaw: sp.yaw, plat: sp.plat || null });
        j.phase = 'release'; j.rt = 0; feed(`M151A2 DELIVERED  -  ${sp.name}`, 'good'); say(`M151A2 SET DOWN AT ${sp.name}  -  THE SEA KNIGHT IS GOING HOME`, 2.2);
      }
    } else if (j.phase === 'release') { j.rt += dt; j.y += 2.5 * dt; if (j.rt > 2.5) { j.phase = 'home'; j.t = 0; } }
    // the load swings behind / under the hook
    if (V.slung) {
      const ax = clamp(-(j.vx - (j.lvx ?? j.vx)) / Math.max(dt, 1e-3), -6, 6), az = clamp(-(j.vz - (j.lvz ?? j.vz)) / Math.max(dt, 1e-3), -6, 6); j.lvx = j.vx; j.lvz = j.vz;
      j.swing[0] += (ax * 0.12 - j.swing[0]) * Math.min(1, dt * 1.5); j.swing[1] += (az * 0.12 - j.swing[1]) * Math.min(1, dt * 1.5);
      const h = hookOf(j, new THREE.Vector3());
      place(V, h.x + j.swing[0] - j.vx * 0.02, h.y - SLING - 1.55, h.z + j.swing[1] - j.vz * 0.02, j.yaw);
    }
    // the strop (hook to the load's four lifting eyes)
    const pos = j.line.geometry.attributes.position, h = hookOf(j, new THREE.Vector3());
    if (V.slung) { const top = [S.pos[0], S.pos[1] + 1.55, S.pos[2]]; pos.setXYZ(0, h.x, h.y, h.z); pos.setXYZ(1, top[0], top[1], top[2]); j.line.visible = true; }
    else j.line.visible = false;
    pos.needsUpdate = true;
    // the model: rotors turning, gear down, ramp up
    j.M.group.position.set(j.x, j.y, j.z); j.M.group.rotation.set(j.pitch || 0, j.yaw, j.roll || 0, 'YXZ');
    j.M.animate({ nr: 1, run: true, n1: 0.95, coll: j.phase === 'lower' ? 0.55 : 0.45, cone: 0.07, F: { tx: -(j.pitch || 0) * 0.5, ty: 0 }, A: { tx: -(j.pitch || 0) * 0.5, ty: 0 } }, dt, performance.now() / 1000);
    if (j.phase !== 'out' && j.phase !== 'home' && j.y - terrainH(j.x, j.z) < 22 && Math.random() < dt * 8) fx.trail?.(j.x + (Math.random() - 0.5) * 14, terrainH(j.x, j.z) + 0.5, j.z + (Math.random() - 0.5) * 14, 1.2);   // rotor wash
  }
  function updateLCM(j, dt) {
    const V = j.V, M = j.M;
    j.t += dt;
    if (j.phase === 'run') {
      const dx = j.gx - j.x, dz = j.gz - j.z, d = Math.hypot(dx, dz), v = Math.min(6.2, 0.6 + d * 0.08);   // 12 kt, easing in to the beach
      j.x += dx / (d || 1) * v * dt; j.z += dz / (d || 1) * v * dt; j.v = v;
      if (Math.random() < dt * 2) fx.wake?.(j.x + j.ux * 11, j.z + j.uz * 11, 1.2);
      if (d < 0.6) { j.phase = 'ramp'; j.rt = 0; sfx.thump?.(0.6); }
    } else if (j.phase === 'ramp') { j.rt += dt; j.ramp = Math.min(1, j.rt / 3); if (j.rt > 3.4) { j.phase = 'drive'; j.rt = 0; release(j); } }
    else if (j.phase === 'drive') {
      j.rt += dt;
      if (!V.auto || V.auto.done || j.rt > 40) { V.auto = null; j.phase = 'wait'; j.rt = 0; feed(`M35A2 ASHORE  -  ${j.beach.name}`, 'good'); }
    } else if (j.phase === 'wait') { j.rt += dt; j.ramp = Math.max(0, 1 - j.rt / 3); if (j.rt > 4) { j.phase = 'back'; j.rt = 0; } }
    else if (j.phase === 'back') { j.x += j.ux * 5 * dt; j.z += j.uz * 5 * dt; j.rt += dt; if (Math.random() < dt * 2) fx.wake?.(j.x - j.ux * 11, j.z - j.uz * 11, 1.0); if (j.rt > 70) j.phase = 'gone'; }
    // the boat: on the water, bobbing; the truck rides in the well
    const tt = performance.now() / 1000, heave = Math.sin(tt * 1.1 + j.gx) * 0.12, roll = Math.sin(tt * 0.9) * 0.025, pitch = Math.sin(tt * 0.7) * 0.015;
    M.group.position.set(j.x, heave - 0.2, j.z); M.group.rotation.set(pitch, j.yaw, roll, 'YXZ');
    M.ramp.rotation.x = -1.32 * j.ramp;
    if (V.slung) { _v.set(0, M.WELL.y + 0.25, M.WELL.z - 0.2).applyEuler(_e.set(pitch, j.yaw, roll, 'YXZ')); place(V, j.x + _v.x, heave - 0.2 + _v.y, j.z + _v.z, j.yaw); }
    const cam = o.camZ ? o.camZ() : null, dist = cam ? Math.hypot(cam.position.x - j.x, cam.position.z - j.z) : 1e9;
    if (j.phase !== 'gone' && dist < 260) sfx.motor?.({ rpm: j.phase === 'run' || j.phase === 'back' ? 2100 : 900, load: j.phase === 'run' ? 0.7 : 0.2, cyl: 12, on: Math.max(0, 1 - dist / 260) * 0.7, inside: false });
  }
  function release(j) {   // the M35 rolls off the ramp onto the sand and drives up the beach
    const V = j.V, ix = -j.ux, iz = -j.uz;   // inland
    const x = j.gx + ix * 15.5, z = j.gz + iz * 15.5;   // off the end of the ramp (bow 11 m + ramp 2 m + half the truck)
    V.slung = false; V.spawnAt({ x, z, yaw: j.yaw, plat: null }, { running: true });
    const pts = []; for (let d = 4; d <= 24; d += 4) { const px = x + ix * d, pz = z + iz * d; pts.push({ x: px, z: pz }); }
    if (pts.length > 1) V.auto = createFollower(pts, { speed: 3, latG: 0.2, stopDist: 2, unstick: false });
    say(`M35A2 COMING ASHORE AT ${j.beach.name}`, 2);
  }
  D.update = dt => {
    let anyRotor = null;
    for (let i = jobs.length - 1; i >= 0; i--) {
      const j = jobs[i];
      if (!j.V.exists && j.phase !== 'gone' && j.phase !== 'home' && j.phase !== 'back') j.phase = 'gone';   // the vehicle was removed (new game)
      if (j.kind === 'ch46') { updateCH46(j, dt); if (j.phase !== 'gone') anyRotor = j; }
      else updateLCM(j, dt);
      if (j.phase === 'gone') { scene.remove(j.M.group); if (j.line) scene.remove(j.line); jobs.splice(i, 1); }
    }
    if (sfx.ctx) {
      rotor ||= createRotorSound(sfx);
      const cam = o.camZ ? o.camZ() : null;
      if (cam) rotor.update(anyRotor ? [{ kind: 'ch46', x: anyRotor.x, y: anyRotor.y, z: anyRotor.z, vx: anyRotor.vx || 0, vy: 0, vz: anyRotor.vz || 0, nr: 1, load: 0.75 }] : [], cam.position, dt);
    }
  };
  D.silence = () => { if (rotor && o.camZ) rotor.update([], o.camZ().position, 0.016); if (jobs.some(j => j.kind === 'lcm')) sfx.motor?.({ rpm: 0, on: 0 }); };
  D.clear = () => { for (const j of jobs) { scene.remove(j.M.group); if (j.line) scene.remove(j.line); } jobs.length = 0; };
  return D;
}
