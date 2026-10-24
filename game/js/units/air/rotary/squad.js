// squad.js - the troops a transport carries: they file out of the cabin (CH-46 ramp / MV-22 ramp), run to positions
// round the pad and hold it. Marines run, spread and kneel facing out; RUNAWAY machine troopers march in lock-step
// (one shared gait phase - uncanny), stand at their posts and sweep their heads in unison.
// The figures come from figures.js FIGURES (swappable). Game effect (capture) is decided by rotary.js / war.js from
// Q.holding; hits kill figures one by one (Q.hit).
import * as THREE from 'three';
import { FIGURES } from './figures.js';

const _w = { x: 0, y: 0, z: 0 };
// COLLISION (wave 3): the game's collision world (main.js sets it): the troops on the ground - waiting in their file,
// running to and holding their posts, standing guard - are people in it (collision.js CW.person): they block the
// player and the vehicles, step out of their way, and are drawn where the world's offset puts them
let CW = null;
export function setSquadWorld(cw) { CW = cw; }
const PERSON_ST = { stick: 1, run: 1, hold: 1, guard: 1 };
const ang = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
// slots round a point: leader in the middle, the rest on two rings facing out (Marines: a 360 perimeter)
export function padSlots(cx, cz, n, r0 = 5, r1 = 8.5, a0 = 0) {
  const out = [{ x: cx + Math.cos(a0) * 1.2, z: cz + Math.sin(a0) * 1.2, yaw: 0 }];
  const k1 = Math.min(n - 1, 6), k2 = n - 1 - k1;
  for (let i = 0; i < k1; i++) { const a = a0 + (i + 0.5) / k1 * Math.PI * 2; out.push({ x: cx + Math.cos(a) * r0, z: cz + Math.sin(a) * r0, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) + Math.PI }); }
  for (let i = 0; i < k2; i++) { const a = a0 + i / k2 * Math.PI * 2; out.push({ x: cx + Math.cos(a) * r1, z: cz + Math.sin(a) * r1, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) + Math.PI }); }
  for (const s of out.slice(1)) s.yaw = Math.atan2(-(s.x - cx), -(s.z - cz)) + Math.PI;   // face away from the centre
  out[0].yaw = Math.atan2(-(out[1].x - cx), -(out[1].z - cz));
  return out;
}

// o: { parent, side, n, kind: 'marine' | 'machine', groundY(x, z) }
export function createSquad(o) {
  const root = new THREE.Group(); root.name = 'squad'; o.parent.add(root);
  const machine = o.kind === 'machine', speed = machine ? 3.1 : 4.3;
  const figs = [];
  for (let i = 0; i < o.n; i++) {
    const f = FIGURES[o.kind]({ variant: i }); f.group.visible = false; root.add(f.group);
    figs.push({ f, x: 0, y: 0, z: 0, yaw: 0, st: 'aboard', wp: 0, path: null, slot: null, t: 0, ph: Math.random() * 6, delay: 0, fall: 0 });
  }
  const Q = {
    root, figs, side: o.side, kind: o.kind, state: 'aboard', deadT: 0,
    get alive() { let n = 0; for (const f of figs) if (f.st !== 'fall' && f.st !== 'dead') n++; return n; },
    get holding() { let n = 0; for (const f of figs) if (f.st === 'hold') n++; return n; },
    // path: world points from inside the cabin to the ramp lip [{ x, y, z }]; slots: [{ x, z, yaw }]
    deploy(path, slots, gap = machine ? 0.55 : 0.4) {
      Q.state = 'deploying';
      figs.forEach((F, i) => { if (F.st !== 'aboard') return; F.st = 'queue'; F.delay = i * gap; F.path = path; F.wp = 0; F.slot = slots[i % slots.length]; F.x = path[0].x; F.y = path[0].y; F.z = path[0].z; });
    },
    // EMBARK (deck / pad loading): the stick waits in two files clear of the rotors (Marines kneeling, machines
    // standing in ranks), then on the troop handler's call files up the ramp one after the other and into the cabin.
    // Positions are in the aircraft's frame (it sits on a moving deck): toWorld(lx, ly, lz, out) -> world point, yaw()
    // -> the aircraft's heading. stick: [{ x, y, z, yaw }] local; path: local points from the approach to the seats.
    stick(stick, path, toWorld, yaw) {
      Q.state = 'boarding'; Q.toWorld = toWorld; Q.yaw0 = yaw;
      figs.forEach((F, i) => { const s = stick[i % stick.length]; F.st = 'stick'; F.l = { x: s.x, y: s.y, z: s.z }; F.lyaw = s.yaw; F.lpath = [s, ...path]; F.wp = 0; F.f.group.visible = true; F.t = Math.random() * 3; });
    },
    embark(gap = machine ? 0.6 : 0.45) { let k = 0; for (const F of figs) if (F.st === 'stick') { F.st = 'embark'; F.delay = k++ * gap; } },
    get boarded() { for (const F of figs) if (F.st === 'stick' || F.st === 'embark') return false; return true; },
    boardNow() { for (const F of figs) if (F.st === 'stick' || F.st === 'embark') { F.st = 'aboard'; F.f.group.visible = false; } if (Q.state === 'boarding') Q.state = 'aboard'; },
    // every deployed figure is at least r from (x, z): the transport can lift off
    clear(x, z, r) { for (const F of figs) if (F.st === 'queue' || F.st === 'path' || (F.st === 'run' && Math.hypot(F.x - x, F.z - z) < r)) return false; return true; },
    center(out) { let n = 0, sx = 0, sz = 0, sy = 0; for (const F of figs) if (F.st !== 'aboard' && F.st !== 'dead' && F.st !== 'fall') { sx += F.x; sy += F.y; sz += F.z; n++; } if (n) { out.x = sx / n; out.y = sy / n; out.z = sz / n; } return n; },
    hit(n = 1) {   // kill n of the living, nearest the front first
      for (const F of figs) { if (n <= 0) break; if (F.st === 'aboard' || F.st === 'fall' || F.st === 'dead') continue; F.st = 'fall'; F.fall = 0; n--; }
    },
    killAll(aboardToo = true) { for (const F of figs) { if (F.st === 'aboard') { if (aboardToo) { F.st = 'dead'; F.f.group.visible = false; } continue; } if (F.st !== 'dead') { F.st = 'fall'; F.fall = 0; } } },
    // the squad that took the island: stand guard, relaxed
    garrison() { Q.state = 'garrison'; for (const F of figs) if (F.st === 'hold' || F.st === 'run') { F.st = 'guard'; F.t = Math.random() * 10; } },
    update(dt, time) {
      const gph = time * (machine ? 7.2 : 9.5);   // machines share one gait phase
      for (const F of figs) {
        const G = F.f.group; if (F.cwb && !PERSON_ST[F.st]) F.cwb.enabled = false;   // (aboard, filing in, fallen: out of the collision world)
        switch (F.st) {
          case 'aboard': G.visible = false; continue;
          case 'stick': case 'embark': {   // in the aircraft's frame: wait in the file, then up the ramp
            let moving = false;
            if (F.st === 'embark' && (F.delay -= dt) <= 0) {
              const P = F.lpath, b = P[F.wp + 1], dx = b.x - F.l.x, dz = b.z - F.l.z, d = Math.hypot(dx, dz), inside = F.wp >= P.length - 4;
              const v = speed * (inside ? 0.6 : 0.85) * dt; moving = true;   // a brisk jog bent under the disc, a walk inside
              if (d <= v) { F.l.x = b.x; F.l.z = b.z; F.l.y = b.y; if (++F.wp >= P.length - 1) { F.st = 'aboard'; G.visible = false; continue; } }
              else { const a = P[F.wp], L = Math.hypot(b.x - a.x, b.z - a.z) || 1; F.l.x += dx / d * v; F.l.z += dz / d * v; F.l.y = a.y + (b.y - a.y) * Math.max(0, Math.min(1, 1 - (d - v) / L)); F.lyaw += ang(F.lyaw, Math.atan2(-dx, -dz)) * Math.min(1, 10 * dt); }
            }
            const w = Q.toWorld(F.l.x, F.l.y, F.l.z, _w); F.x = w.x; F.y = w.y; F.z = w.z; F.yaw = F.lyaw + Q.yaw0();
            if (F.lpath[F.wp].g && (F.st === 'stick' || F.lpath[F.wp + 1].g)) F.y = o.groundY(F.x, F.z);   // on the deck, not on the aircraft's (pitched) frame
            if (moving) { F.ph += dt * (machine ? 7.2 : 9.5); F.f.pose(machine ? 'walk' : 'run', machine ? gph : F.ph); }
            else { F.t += dt; F.f.pose(machine ? 'stand' : 'kneel', 0); }
            break;
          }
          case 'queue': F.delay -= dt; G.visible = false; if (F.delay <= 0) { F.st = 'path'; G.visible = true; } continue;
          case 'path': case 'run': {
            const tgt = F.st === 'path' ? F.path[F.wp + 1] : F.slot, dx = tgt.x - F.x, dz = tgt.z - F.z, d = Math.hypot(dx, dz);
            const v = (F.st === 'path' ? speed * 0.7 : speed) * dt;
            if (d <= v) { F.x = tgt.x; F.z = tgt.z; if (F.st === 'path') { F.wp++; if (F.wp >= F.path.length - 1) F.st = 'run'; } else { F.st = 'hold'; F.t = 0; } }
            else { F.x += dx / d * v; F.z += dz / d * v; F.yaw += ang(F.yaw, Math.atan2(-dx, -dz)) * Math.min(1, 10 * dt); }
            if (F.st === 'path' && F.path[F.wp + 1]) { const a = F.path[F.wp], b = F.path[F.wp + 1], L = Math.hypot(b.x - a.x, b.z - a.z) || 1, k = 1 - Math.hypot(b.x - F.x, b.z - F.z) / L; F.y = a.y + (b.y - a.y) * Math.max(0, Math.min(1, k)); }
            else F.y = o.groundY(F.x, F.z);
            F.ph += dt * (machine ? 7.2 : 9.5);
            F.f.pose(machine ? 'walk' : 'run', machine ? gph : F.ph);
            break;
          }
          case 'hold': {   // at the post: Marines kneel facing out; machines stand and sweep their heads together
            F.t += dt; F.y = o.groundY(F.x, F.z);
            const want = F.slot.yaw + (machine ? Math.sin(time * 0.7) * 0.9 : 0);
            F.yaw += ang(F.yaw, want) * Math.min(1, (machine ? 6 : 4) * dt);
            F.f.pose(machine ? 'stand' : 'kneel', 0);
            break;
          }
          case 'guard': {   // garrison: on their feet, looking round now and then
            F.t += dt; F.y = o.groundY(F.x, F.z);
            if (!machine && F.t % 9 < dt) F.slot = { ...F.slot, yaw: F.slot.yaw + (Math.random() - 0.5) * 1.6 };
            F.yaw += ang(F.yaw, F.slot.yaw + (machine ? Math.sin(time * 0.7) * 0.9 : 0)) * Math.min(1, 2 * dt);
            F.f.pose('stand', 0);
            break;
          }
          case 'fall': F.fall += dt * 1.6; F.f.pose('fall', F.fall); if (F.fall >= 1) F.st = 'dead'; break;
          case 'dead': F.f.pose('dead', 1); break;
        }
        if (CW && PERSON_ST[F.st] && G.visible !== false) {
          const b = F.cwb || (F.cwb = CW.person({ owner: F, r: machine ? 0.4 : 0.3, mass: machine ? 300 : 90 }));
          CW.placePerson(b, F.x, F.z, F.y, F.y + (machine ? 2.1 : 1.8), dt);
          G.position.set(b.x, F.y, b.z);
        } else { if (F.cwb) F.cwb.enabled = false; G.position.set(F.x, F.y, F.z); }
        G.rotation.y = F.yaw;
      }
      if (Q.state === 'boarding' && Q.boarded) Q.state = 'aboard';
      if (Q.state !== 'aboard' && Q.alive === 0) Q.deadT += dt;
    },
    dispose() { o.parent.remove(root); if (CW) for (const F of figs) if (F.cwb) { CW.remove(F.cwb); F.cwb = null; } },
  };
  return Q;
}
