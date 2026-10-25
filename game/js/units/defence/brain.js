// NGC-1980 air defence: how the units behave. Simple, readable game mechanics:
//   search -> track -> fire -> (pause / reload / cool) -> track ...
// - search: the radar spins (or the LANCE's sensor block sweeps) and every `scan` s the unit picks the nearest foe it
//   can SEE (terrain line of sight from the turret).
// - track: the turret turns towards the target at a capped rate; with line of sight a lock builds up over `lock` s.
//   The tell runs the whole time: the lamp blinks faster as the lock builds, rotary barrels spin up, and when the
//   target is the player the cockpit warning beeps (steady warble once locked).
// - fire: guns lead the target with a simple linear prediction (flight time = distance / round speed) and fire
//   bursts of tracer up close, airburst rounds further out; missiles are visible projectiles that steer at a capped
//   turn rate and only while the launcher still sees the target; the LANCE charges (aiming line + rising hum), then
//   holds its beam along the barrel - it only burns after it has dwelt on the target, and terrain or smoke stops it.
// Losing line of sight bleeds the lock away. Everything tunable is in tune.js.
//
// createDefence(env) - env is the host (war.js, or the dev sandbox):
//   scene, fx, terrainH(x, z), time(), hear(x, y, z, range) -> 0..1, player() -> { pos, vel, alive, inCave, hitR },
//   hurtPlayer(amount, why), shoot(kind, side, x, y, z, vx, vy, vz, life), damage(target, dmg, side),
//   hitTest(x, y, z, side, rad) -> target | null, feed(text, kind), sfx (the game's Sfx; may be absent)
import * as THREE from 'three';
import { DEF, DEF_WAR } from './tune.js';
import { buildDefence } from './models.js';
import { createDefenceSound } from './sound.js';
// countermeasures (ngc/cmpolish): flares decoy missiles, chaff breaks radar locks, smoke blocks sight; the RWR picture
import { CM, CM_RULES, stepCM, smokeBlocks, smokeStop, rwrBegin, rwrAdd, rwrPublish, resetCM } from './cm.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

export function createDefence(env) {
  const { scene, fx } = env;
  const snd = createDefenceSound(env.sfx);
  const units = new Set(), missiles = [];
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Vector3(), _n = new THREE.Vector3();
  let warnMode = 0, warnP = 0, laserSt = 0, laserP = 0, laserK = 0, launchFeedT = -99;

  // ------------------------------------------------------------------ which unit goes where
  // side 1: our starting guns are the Soviet contingent's ZSU-23-4s; everything command 2 builds is an M163.
  // side 2: a LANCE on hq and fortress islands (two on IRONHOLD), seized TALON trucks everywhere else.
  // defence polish: each kind alternates with its towed counterpart (ZU-23-2 / M167), keyed on the island and how many
  // guns it already has, so a two-gun island usually shows one of each
  function pick(side, I, initial) {
    if (side === 1) {
      const n = I && I.structs ? I.structs.filter(s => s.kind === 'aa' && !s.dead).length : 0;
      let h = 0; for (const ch of (I && I.name) || '') h = (h * 31 + ch.charCodeAt(0)) | 0;
      const odd = ((h >>> 3) + n) % 2 === 1;
      return initial ? (odd ? 'zu23' : 'shilka') : (odd ? 'vadst' : 'vads');
    }
    if (!I) return 'talon';
    const lances = I.structs ? I.structs.filter(s => !s.dead && s.def && s.def.type === 'lance').length : 0;
    const want = I.name === 'IRONHOLD' ? 2 : (I.kind === 'hq' || I.kind === 'fortress') ? 1 : 0;
    const guns = I.structs ? I.structs.filter(s => s.kind === 'aa' && !s.dead).length : 0;
    return lances < want && guns % 2 === 0 ? 'lance' : 'talon';
  }
  function model(side, I, initial) { return buildDefence(pick(side, I, initial), side); }

  // ------------------------------------------------------------------ attach state to a war object
  // o: an island 'aa' struct { mesh, x, y, z, hp, r, h, side } or a ship gun { mesh, hp, ship }
  function attach(o, { terrain = true } = {}) {
    const type = o.mesh.userData.defType; if (!type) return null;
    const T = DEF[type];
    o.def = {
      type, T, mode: 'search', tgt: null, key: null, lockT: 0, scanT: rnd(T.scan), losT: 0, los: false, lostT: 0, d: 1e9,
      yaw: 0, pitch: 0.15, burstT: 0, pauseT: 0, roundT: 0, flakT: rnd(0.5), mslCd: rnd(1, 3), salvo: 0, salvoT: 0, cell: 0,
      spin: 0, spinWas: 0, radarA: rnd(6.28), blink: 0, flashT: 0, heat: 0, beam: null, sndT: 0, side: o.side ?? o.ship?.side,
      ammo: T.mag ? T.mag.rounds : Infinity, inbound: 0, dryT: 0, crewShown: true, smokeT: 0, wreckT: -1,
    };
    if (o.ship) { o.hp = o.max = T.hp; }
    else {
      o.hp = o.max = T.hp; o.r = T.r; o.h = T.h;
      if (terrain && env.terrainH) seat(o);
      // a gun built on a slot where a wreck still stands: the wreck is hauled away
      for (const u of units) if (u !== o && u.dead && !u.ship && Math.hypot(u.x - o.x, u.z - o.z) < 3) { u.mesh.parent && u.mesh.parent.remove(u.mesh); units.delete(u); }
    }
    if (T.beam) o.def.beam = makeBeam();
    units.add(o);
    return o.def;
  }
  // park a unit in its AA emplacement. world/life.js digs a revetment on each of war.js's pad slots with its way in
  // facing the pad, so the vehicle drove in nose first: it faces the pad, its turret (userData.slotZ along the hull)
  // over the slot (a long truck's cab sticks out through the gap), tilted to the slope it sits on
  function seat(o) {
    const m = o.mesh, I = o.I, h = env.terrainH, sz = m.userData.slotZ || 0;
    const yaw = I && I.pad ? Math.atan2(o.x - I.pad.x, o.z - I.pad.z) + rnd(-0.06, 0.06) : rnd(6.28);
    const dx = (h(o.x + 2, o.z) - h(o.x - 2, o.z)) / 4, dz = (h(o.x, o.z + 2) - h(o.x, o.z - 2)) / 4;
    const tx = clamp(Math.atan(dz), -0.25, 0.25), tz = clamp(-Math.atan(dx), -0.25, 0.25);
    m.rotation.set(0, 0, 0); m.quaternion.setFromEuler(new THREE.Euler(tx, 0, tz, 'XYZ')).multiply(_q.setFromAxisAngle(_a.set(0, 1, 0), yaw));
    m.position.x = o.x - sz * Math.sin(yaw); m.position.z = o.z - sz * Math.cos(yaw);
    m.position.y = Math.max(h(m.position.x, m.position.z), 0) - 0.05;
  }
  // replace the ALBATROSS's generic gun mounts with its 1980 fit. Uses the NAVAL model's userData.mounts
  // ({ kind, pos, dir }) when the carrier has them, else the four deck-edge spots the old guns stood on.
  function refitCarrier(parts, side = 1) {
    const g = parts.group, mounts = Array.isArray(parts.mounts) ? parts.mounts : g.userData && Array.isArray(g.userData.mounts) ? g.userData.mounts : null;   // NAVAL keeps them on parts.mounts
    let list = null;
    if (mounts && mounts.length) {
      list = mounts.filter(m => /ciws|phalanx|gun|close|sam|missile|sparrow|launch|bpdms/i.test(m.kind || '')).map(m => ({
        type: /sam|missile|sparrow|launch|bpdms/i.test(m.kind) ? 'sparrow' : 'ciws',
        pos: m.pos.isVector3 ? m.pos.clone() : new THREE.Vector3(...m.pos),
        yaw: typeof m.dir === 'number' ? m.dir : m.dir ? Math.atan2(-(m.dir.x ?? m.dir[0]), -(m.dir.z ?? m.dir[2])) : 0,
      }));
      if (!list.length) list = null;
    }
    if (!list) {
      const types = ['ciws', 'sparrow', 'sparrow', 'ciws'];
      list = parts.guns.map((m, i) => ({ type: types[i % 4], pos: m.position.clone(), yaw: m.position.x < 0 ? Math.PI / 2 : -Math.PI / 2 }));
    }
    for (const m of parts.guns) m.parent && m.parent.remove(m);
    parts.guns = list.map(l => { const m = buildDefence(l.type, side); m.position.copy(l.pos); m.rotation.y = l.yaw; g.add(m); return m; });
    return parts.guns;
  }

  // SEAWORLD: the RUNAWAY ships' fit, through NAVAL's parts.mounts ({ kind, pos, dir }): the seized RAM launchers
  // become TALON gun / missile modules on deck pedestals, the RUNAWAY lasers become LANCE turrets (naval tune: DEF.talonm,
  // DEF.lancem). The LEVIATHAN carries TALONs forward and LANCEs aft; the container ship a TALON on its forecastle.
  // Game level only (bible section 3): the same search / lock / tell / fire behaviour as the island units.
  function refitShip(parts, side = 2) {
    const mounts = Array.isArray(parts.mounts) ? parts.mounts.filter(m => m.gun !== undefined && /ram|laser|ciws|sam/.test(m.kind)) : [];
    if (!mounts.length) return parts.guns;
    const lev = parts.motion === 'leviathan', box = parts.motion === 'container';
    const g = parts.group, old = parts.guns.slice(), guns = [];
    mounts.forEach((m, k) => {
      const type = box ? 'talonm' : lev ? (m.pos.z < 0 ? 'talonm' : 'lancem') : m.kind === 'laser' ? 'lancem' : 'talonm';
      const mesh = buildDefence(type, side); mesh.position.copy(m.pos); mesh.rotation.y = Math.atan2(-m.dir.x, -m.dir.z); g.add(mesh);
      const was = old[m.gun]; if (was && was.parent) was.parent.remove(was);
      m.node = mesh; m.gun = guns.length; m.def = type; guns.push(mesh);
    });
    for (const o of old) if (o.parent && !guns.includes(o)) o.parent.remove(o);
    parts.guns = guns; return guns;
  }

  // ------------------------------------------------------------------ sight
  const H = (x, z) => Math.max(env.terrainH(x, z), 0);
  function los(ax, ay, az, bx, by, bz) {
    const L = Math.hypot(bx - ax, by - ay, bz - az), n = clamp(Math.ceil(L / DEF_WAR.losStep), 3, 50);
    for (let k = 1; k < n; k++) { const t = k / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t; if (H(x, z) > y - DEF_WAR.losClear) return false; }
    return !smokeBlocks(ax, ay, az, bx, by, bz);   // CM: thick smoke (M18 plumes) hides the target too
  }
  // where a ray from a toward dir first meets the ground (distance), up to maxL
  function rayGround(a, dir, maxL) {
    let prev = 0;
    for (let s = 2; s <= maxL; s += 2.5) {
      const y = a.y + dir.y * s, x = a.x + dir.x * s, z = a.z + dir.z * s;
      if (H(x, z) > y) { let lo = prev, hi = s; for (let i = 0; i < 6; i++) { const m = (lo + hi) / 2; if (H(a.x + dir.x * m, a.z + dir.z * m) > a.y + dir.y * m) hi = m; else lo = m; } return hi; }
      prev = s;
    }
    return maxL;
  }
  // smoke along a ray: the summed opacity of the smoke puffs (fx.mix) the ray passes through, and where it gets thick
  function smokeAlong(a, dir, L) {
    const P = fx && fx.mix; if (!P) { smokeAlong.stop = L; return 0; }
    let acc = 0, stop = L; const p = P.p, col = P.col, size = P.size;
    for (let i = 0; i < P.n; i++) {
      const al = col[i * 4 + 3], s = size[i]; if (al < 0.12 || s < 1.2) continue;
      const i3 = i * 3, dx = p[i3] - a.x, dy = p[i3 + 1] - a.y, dz = p[i3 + 2] - a.z, t = dx * dir.x + dy * dir.y + dz * dir.z;
      if (t < 0 || t > L) continue;
      const ex = dx - dir.x * t, ey = dy - dir.y * t, ez = dz - dir.z * t, r = s * 0.35;
      if (ex * ex + ey * ey + ez * ez > r * r) continue;
      const lum = (col[i * 4] + col[i * 4 + 1] + col[i * 4 + 2]) / 3;
      acc += al * (lum < 0.5 ? 0.6 : 0.3);   // dark smoke stops it faster than spray or steam
      if (acc >= DEF_WAR.smokeBlock && t < stop) stop = t;
    }
    smokeAlong.stop = stop; return acc;   // the stop distance rides on the function (no array per call)
  }
  env.smokeAlong = smokeAlong; env.los = los;

  // ------------------------------------------------------------------ target helpers
  const keyOf = f => f.player ? 'P' : f.hp === undefined ? 'S' : f;
  function valid(f) { if (!f) return false; if (f.player) { const p = env.player(); return p.alive && !p.inCave; } return !(f.dead || f.dying || f.gone); }
  function findKey(foes, k) { for (let i = 0; i < foes.length; i++) if (keyOf(foes[i]) === k) return foes[i]; return null; }
  function eyeOf(o, out) { return o.mesh.userData.pitch.getWorldPosition(out); }
  function maxRange(T) { return Math.max(T.gun ? T.gun.range : 0, T.msl ? T.msl.range : 0, T.beam ? T.beam.range : 0); }
  // world aim direction -> local yaw / pitch of the turret
  function toTurret(o, dir, D) {   // -> D.wy, D.wp
    const yawG = o.mesh.userData.yaw; yawG.parent.getWorldQuaternion(_q).invert();
    _e.copy(dir).applyQuaternion(_q);
    D.wy = Math.atan2(-_e.x, -_e.z); D.wp = Math.asin(clamp(_e.y, -1, 1));
  }
  // the barrel's actual pointing direction in the world
  function barrelDir(o, out) { o.mesh.userData.pitch.getWorldQuaternion(_q); return out.set(0, 0, -1).applyQuaternion(_q); }

  // ------------------------------------------------------------------ per-unit update
  function update(o, dt, foes) {
    if (!(dt > 0)) return;
    const D = o.def, T = D.T, ud = o.mesh.userData, t = env.time();
    o.mesh.updateMatrixWorld();
    const eye = eyeOf(o, _a);
    D.camD = env.hear ? (1 - env.hear(eye.x, eye.y, eye.z, 1000)) * 1000 : 0;   // how far the camera is (detail, crews, effects)
    if (!o.ship && o.max && o.hp < o.max * 0.5 && ud.state === 'intact' && ud.setState) ud.setState('damaged');
    // ---- search: pick the nearest foe we can see (keep the current one unless another is much closer)
    D.scanT -= dt;
    if (D.scanT <= 0) {
      D.scanT = T.scan;
      const R = maxRange(T); let best = null, bd = R;
      for (const f of foes) {
        const d = Math.hypot(f.p.x - eye.x, f.p.y - eye.y, f.p.z - eye.z);
        if (d > R || f.p.y < eye.y - 4) continue;
        const cur = D.tgt && keyOf(f) === D.key, score = cur ? d * 0.6 : d;
        if (score < bd && los(eye.x, eye.y, eye.z, f.p.x, f.p.y, f.p.z)) { bd = score; best = f; }
      }
      if (best) { if (keyOf(best) !== D.key) { D.key = keyOf(best); D.lockT = 0; D.dwell = 0; } D.tgt = best; D.lostT = 0; if (D.mode === 'search') D.mode = 'track'; }
    }
    // refresh the target object (the player / sky proxies are rebuilt every frame by the host)
    if (D.tgt) { const k = D.key; D.tgt = findKey(foes, k); if (!D.tgt || !valid(D.tgt)) { D.tgt = null; D.key = null; D.mode = 'search'; D.lockT = 0; } }
    const f = D.tgt;
    let wantYaw = D.yaw, wantPitch = 0.15, err = 9;
    if (f) {
      D.d = Math.hypot(f.p.x - eye.x, f.p.y - eye.y, f.p.z - eye.z);
      D.losT -= dt; if (D.losT <= 0) { D.losT = 0.15; D.los = D.d < maxRange(T) * 1.15 && los(eye.x, eye.y, eye.z, f.p.x, f.p.y, f.p.z); }
      const wasLos = D.losWas; D.losWas = D.los;
      if (D.jamT > 0) D.jamT -= dt;
      if (D.los && D.jamT > 0 && f.player) { D.lockT = Math.min(D.lockT, T.lock * CM_RULES.chaff.keep); D.lostT = 0; }   // CM: chaff in the radar
      else if (D.los) { D.lockT = Math.min(D.lockT + dt, T.lock + (T.msl ? T.msl.lockExtra : 0) + 0.5); D.lostT = 0; }
      else { if (wasLos) D.lockT = Math.min(D.lockT, T.lock * (T.lockKeep ?? 1)); D.lockT = Math.max(0, D.lockT - dt * 2); D.lostT += dt; if (D.lostT > 2.5) { D.tgt = null; D.key = null; D.mode = 'search'; } }
      // lead: gun rounds -> linear prediction, iterated once; missiles and the beam point straight at it
      const sp = T.gun ? T.gun.speed : 0;
      let ax = f.p.x, ay = f.p.y, az = f.p.z;
      if (sp) { let tf = D.d / sp; for (let i = 0; i < 2; i++) { ax = f.p.x + f.v.x * tf; ay = f.p.y + f.v.y * tf; az = f.p.z + f.v.z * tf; tf = Math.hypot(ax - eye.x, ay - eye.y, az - eye.z) / sp; } }
      D.aim = D.aim || new THREE.Vector3(); D.aim.set(ax, ay, az);
      _d.set(ax - eye.x, ay - eye.y, az - eye.z).normalize();
      toTurret(o, _d, D); wantYaw = D.wy; wantPitch = D.wp;
    } else if (D.mode !== 'cool') {
      // searching: the turret drifts slowly through a sector, barrels at a ready elevation
      wantYaw = D.yaw + Math.sin(t * 0.25 + D.radarA) * 0.4 * dt * 4; wantPitch = 0.25;
      D.lockT = Math.max(0, D.lockT - dt);
    }
    // ---- slew at the capped rates
    wantPitch = clamp(wantPitch, T.pitchMin, T.pitchMax);
    const dy = angDiff(D.yaw, wantYaw), dp = wantPitch - D.pitch;
    D.yaw += clamp(dy, -T.yawRate * dt, T.yawRate * dt); D.pitch += clamp(dp, -T.pitchRate * dt, T.pitchRate * dt);
    ud.yaw.rotation.y = D.yaw; ud.pitch.rotation.x = D.pitch;
    if (f) err = Math.abs(angDiff(D.yaw, wantYaw)) * Math.cos(D.pitch) + Math.abs(wantPitch - D.pitch);
    D.err = err;
    // ---- weapons
    const locked = f && D.los && D.lockT >= T.lock;
    let firing = false;
    if (T.gun) firing = gun(o, D, T, f, locked, err, dt, t) || firing;
    if (T.msl) missileLauncher(o, D, T, f, dt);
    if (T.beam) firing = lance(o, D, T, f, locked, err, dt) || firing;
    // ---- tells and animation
    animate(o, D, T, f, firing, dt, t);
    // CM: the radar warning picture - every unit that sees and tracks the player (its bearing, how far the lock is)
    if (f && f.player && D.los && D.d < maxRange(T) * 1.15) {
      const pp = env.player().pos, L = T.lock + (T.msl ? T.msl.lockExtra : 0);
      rwrAdd(D.type === 'talon' ? 'T' : D.type === 'lance' ? 'L' : 'A', Math.atan2(eye.x - pp.x, -(eye.z - pp.z)), D.d, clamp(D.lockT / L, 0, 1), D.lockT >= T.lock, firing || (!!D.beam && D.beam.st === 'charge'));
    }
    // cockpit warning: the strongest lock on the player this frame
    if (f && f.player && D.los && D.d < DEF_WAR.lockToneRange) {
      const L = T.lock + (T.msl ? T.msl.lockExtra : 0), p = clamp(D.lockT / L, 0, 1);
      const m = D.lockT >= L ? 2 : 1; if (m > warnMode || (m === warnMode && p > warnP)) { warnMode = m; warnP = p; }
    }
  }

  // guns: tracer bursts up close, airburst rounds further out (the old flak), only once locked and on target
  function gun(o, D, T, f, locked, err, dt, t) {
    const G = T.gun, ud = o.mesh.userData;
    D.pauseT -= dt; D.flakT -= dt;
    if (!locked || D.d > G.range || err > T.tol || D.mode === 'cool') { if (D.burstT > 0) burstEnd(o, D); D.burstT = 0; return false; }
    if (D.ammo <= 0) { if (D.burstT > 0) burstEnd(o, D); D.burstT = 0; D.dryT += dt; return false; }   // dry: waits for the loaders
    const fl = G.flakRate && D.d > G.near;
    if (!fl) {   // tracer stream in bursts
      if (D.pauseT > 0) return false;
      if (T.spin && D.spin < 0.7) return false;   // rotary guns fire once the barrels are up to speed
      if (D.burstT <= 0) { D.burstT = G.burst; D.roundT = 0; burstSound(o, D, G); blastDust(o, D); }
      D.burstT -= dt; D.roundT -= dt;
      let shots = 0;
      while (D.roundT <= 0 && shots < 6 && D.ammo > 0) {
        D.roundT += G.rate; shots++; D.ammo--;
        const mz = ud.muzzles[(D.cell++) % ud.muzzles.length]; ud.pitch.localToWorld(_m.copy(mz));
        barrelDir(o, _n); const e = G.spread;
        _n.x += rnd(-e, e); _n.y += rnd(-e, e); _n.z += rnd(-e, e); _n.normalize();
        const life = Math.min(G.range + 15, D.d + 25) / G.speed;
        env.shoot('ciws', o.def.side, _m.x, _m.y, _m.z, _n.x * G.speed, _n.y * G.speed, _n.z * G.speed, life);
        if (D.cell % 2 === 0) tracer(_m, _n, G.speed, life + 0.25, o.def.side);   // every other round shows a streak
        muzzleFx(_m, _n, 0.6);
        if (D.cell % 3 === 0) ejectFx(o, D);
      }
      if (D.burstT <= 0) { D.pauseT = G.pause; burstEnd(o, D); }
      D.flashT = 0.05;
      return true;
    }
    // airburst rounds at range
    if (D.flakT > 0) return false;
    D.flakT = G.flakRate + rnd(G.flakJit || 0) - Math.min(G.ramp || 0, t / 900);
    if (T.mag) D.ammo = Math.max(0, D.ammo - T.mag.flak);
    ejectFx(o, D);
    const err2 = (f.player ? (G.flakErrPlayer ?? G.flakErr) : G.flakErr) * (D.d / 100);
    const mz = ud.muzzles[(D.cell++) % ud.muzzles.length]; ud.pitch.localToWorld(_m.copy(mz));
    const bx = D.aim.x + rnd(-err2, err2), by = D.aim.y + rnd(-err2, err2), bz = D.aim.z + rnd(-err2, err2), d2 = Math.hypot(bx - _m.x, by - _m.y, bz - _m.z) || 1;
    const sp = 90;   // airburst rounds keep the old flak's flight
    env.shoot('flak', o.def.side, _m.x, _m.y, _m.z, (bx - _m.x) / d2 * sp, (by - _m.y) / d2 * sp, (bz - _m.z) / d2 * sp, d2 / sp);
    _d.set(bx - _m.x, by - _m.y, bz - _m.z).divideScalar(d2); tracer(_m, _d, sp, d2 / sp, o.def.side, 0);   // the airburst round is a tracer too
    barrelDir(o, _n); muzzleFx(_m, _n, 1);
    snd.thud(env.hear ? env.hear(_m.x, _m.y, _m.z, 380) : 0.5);
    D.flashT = 0.07;
    return true;
  }
  function burstSound(o, D, G) {
    const k = env.hear ? env.hear(o.mesh.position.x, o.mesh.position.y, o.mesh.position.z, 420) : 0.5;
    const ty = D.type;
    if (ty === 'vads' || ty === 'vadst') snd.burst(75, G.burst, k, { band: 1800, tone: 75 });
    else if (ty === 'ciws') snd.burst(75, G.burst, k, { band: 2400, tone: 75, q: 0.7 });
    else if (ty === 'shilka') snd.burst(56, G.burst, k, { band: 1100, tone: 56 });
    else if (ty === 'zu23') snd.burst(33, G.burst, k, { band: 1000, tone: 48, q: 1.0 });
    else snd.burst(10, G.burst, k, { band: 700, tone: 40, q: 1.2 });
  }
  function muzzleFx(p, dir, s) {
    if (!fx) return;
    fx.add.spawn(p.x + dir.x * 0.3, p.y + dir.y * 0.3, p.z + dir.z * 0.3, dir.x * 4, dir.y * 4, dir.z * 4, 0.05, 0.9 * s, 1.6 * s, 1, 0.8, 0.45, 1);
    fx.add.spawn(p.x + dir.x * 0.9, p.y + dir.y * 0.9, p.z + dir.z * 0.9, dir.x * 9, dir.y * 9, dir.z * 9, 0.035, 0.5 * s, 0.9 * s, 1, 0.65, 0.3, 0.8);   // the flame tongue ahead of it
    if (Math.random() < 0.5) fx.mix.spawn(p.x + dir.x * 0.6, p.y + dir.y * 0.6, p.z + dir.z * 0.6, dir.x * 3 + rnd(-.4, .4), dir.y * 3 + rnd(0.2, 0.8), dir.z * 3 + rnd(-.4, .4), rnd(0.8, 1.6), 0.4 * s, 2.2 * s, .62, .6, .56, 0.35, -0.2, 1.5, 0.6);
  }
  // spent cases / links thrown out of the gun (bright brass flecks under gravity), only where someone can see them
  function ejectFx(o, D) {
    const ud = o.mesh.userData; if (!fx || !ud.eject || D.camD > 140) return;
    ud.pitch.localToWorld(_e.copy(ud.eject)); ud.pitch.getWorldQuaternion(_q); _d.set(1, 0.6, 0.2).applyQuaternion(_q);
    if (ud.eject.x < 0) _d.x = -_d.x;
    for (let i = 0; i < 2; i++) fx.add.spawn(_e.x, _e.y, _e.z, _d.x * rnd(2, 4) + rnd(-.5, .5), _d.y * rnd(2, 4), _d.z * rnd(2, 4) + rnd(-.5, .5), rnd(0.4, 0.7), 0.09, 0.07, 0.95, 0.72, 0.32, 0.9, 9.8, 0.3);
  }
  // muzzle blast kicking dust off the ground when the barrels are low; gun smoke hanging round the mount after a burst
  function blastDust(o, D) {
    if (!fx || D.pitch > 0.35 || D.camD > 300) return;
    const ud = o.mesh.userData; ud.pitch.localToWorld(_e.copy(ud.muzzles[0])); barrelDir(o, _n);
    const gx = _e.x + _n.x * 2, gz = _e.z + _n.z * 2, gy = H(gx, gz);
    if (_e.y - gy > 3.5) return;
    for (let i = 0; i < 6; i++) fx.mix.spawn(gx + rnd(-1, 1), gy + 0.3, gz + rnd(-1, 1), _n.x * rnd(2, 5) + rnd(-1.5, 1.5), rnd(0.4, 1.6), _n.z * rnd(2, 5) + rnd(-1.5, 1.5), rnd(1.2, 2.4), 0.8, 3.2, .52, .46, .36, 0.45, 0.4, 1.4, 0.7);
  }
  function burstEnd(o, D) {
    if (!fx || D.camD > 400) return;
    const ud = o.mesh.userData; ud.pitch.localToWorld(_e.copy(ud.muzzles[0])); barrelDir(o, _n);
    for (let i = 0; i < 3; i++) { const s = rnd(0.3, 1.6); fx.mix.spawn(_e.x - _n.x * s, _e.y - _n.y * s + 0.2, _e.z - _n.z * s, rnd(-.3, .3), rnd(0.3, 0.8), rnd(-.3, .3), rnd(2.5, 4.5), 0.7, 3.4, .66, .65, .62, 0.3, -0.15, 0.8, 1.0); }
  }

  // ------------------------------------------------------------------ tracer streaks (visual only; war.js owns the rounds)
  // one InstancedMesh for every unit: a thin additive streak per tracer round, flying the same ballistic path as the
  // war.js projectile it was fired with (gravity 2.2 m/s2 for 'ciws' rounds). Colours follow war.js's round colours.
  const TR_N = 320, trGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
  const trMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const trMesh = new THREE.InstancedMesh(trGeo, trMat, TR_N); trMesh.frustumCulled = false; trMesh.count = 0; trMesh.renderOrder = 4; scene.add(trMesh);
  trMesh.setColorAt(0, new THREE.Color(1, 1, 1));
  const TR = { n: 0, p: new Float32Array(TR_N * 3), v: new Float32Array(TR_N * 3), life: new Float32Array(TR_N), side: new Uint8Array(TR_N), g: new Float32Array(TR_N) };
  const _tm = new THREE.Matrix4(), _tq = new THREE.Quaternion(), _ts = new THREE.Vector3(), _tp = new THREE.Vector3(), _tz = new THREE.Vector3(0, 0, -1), _tc = [new THREE.Color(), new THREE.Color(0.5, 1, 1), new THREE.Color(1, 0.55, 0.2)];
  function tracer(p, dir, speed, life, side, grav = 2.2) {
    const i = TR.n < TR_N ? TR.n++ : (Math.random() * TR_N) | 0, i3 = i * 3;
    TR.p[i3] = p.x + dir.x * 1.5; TR.p[i3 + 1] = p.y + dir.y * 1.5; TR.p[i3 + 2] = p.z + dir.z * 1.5;
    TR.v[i3] = dir.x * speed; TR.v[i3 + 1] = dir.y * speed; TR.v[i3 + 2] = dir.z * speed; TR.life[i] = life; TR.side[i] = side; TR.g[i] = grav;
  }
  function updateTracers(dt) {
    for (let i = TR.n - 1; i >= 0; i--) {
      const i3 = i * 3;
      TR.life[i] -= dt; TR.v[i3 + 1] -= TR.g[i] * dt;
      TR.p[i3] += TR.v[i3] * dt; TR.p[i3 + 1] += TR.v[i3 + 1] * dt; TR.p[i3 + 2] += TR.v[i3 + 2] * dt;
      if (TR.life[i] <= 0 || TR.p[i3 + 1] < H(TR.p[i3], TR.p[i3 + 2])) {   // spent: move the last one into its place
        const j = --TR.n, j3 = j * 3;
        for (let k = 0; k < 3; k++) { TR.p[i3 + k] = TR.p[j3 + k]; TR.v[i3 + k] = TR.v[j3 + k]; }
        TR.life[i] = TR.life[j]; TR.side[i] = TR.side[j]; TR.g[i] = TR.g[j];
      }
    }
    for (let i = 0; i < TR.n; i++) {
      const i3 = i * 3, vx = TR.v[i3], vy = TR.v[i3 + 1], vz = TR.v[i3 + 2], sp = Math.hypot(vx, vy, vz) || 1;
      _tp.set(TR.p[i3], TR.p[i3 + 1], TR.p[i3 + 2]); _ts.set(vx / sp, vy / sp, vz / sp); _tq.setFromUnitVectors(_tz, _ts);
      const len = Math.min(7, sp * 0.04);
      _ts.set(0.07, 0.07, len); _tm.compose(_tp, _tq, _ts); trMesh.setMatrixAt(i, _tm); trMesh.setColorAt(i, _tc[TR.side[i]] || _tc[0]);
    }
    trMesh.count = TR.n; trMesh.instanceMatrix.needsUpdate = true; if (trMesh.instanceColor) trMesh.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------------ missiles
  const mslGeo = (() => {
    const g = new THREE.Group(), body = new THREE.MeshLambertMaterial({ color: 0xe6e4dc, flatShading: true }), dark = new THREE.MeshLambertMaterial({ color: 0x33373a, flatShading: true });
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.9, 8).rotateX(Math.PI / 2), body); g.add(c);
    const n = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 8).rotateX(-Math.PI / 2), dark); n.position.z = -1.17; g.add(n);
    for (let i = 0; i < 4; i++) { for (const z of [-0.4, 0.75]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.42, 0.28), body); f.position.set(0, 0, z); f.rotation.z = i * Math.PI / 2; f.geometry.translate(0, 0.18, 0); g.add(f); } }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.9, 7).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.position.z = 1.4; flame.name = 'flame'; g.add(flame);
    return g;
  })();
  function missileLauncher(o, D, T, f, dt) {
    const M = T.msl, ud = o.mesh.userData;
    D.mslCd -= dt;
    if (D.mslCd <= 0 && ud.cells && D.cellsSpent) { for (const c of ud.cells) c.cover.visible = true; D.cellsSpent = 0; }   // reloaded
    if (D.salvo > 0) {
      D.salvoT -= dt;
      if (D.salvoT <= 0 && f && D.los) { D.salvo--; D.salvoT = M.gap; launch(o, D, T, f); }
      else if (!f || !D.los) D.salvo = 0;
      return;
    }
    if (!f || !D.los || D.mslCd > 0 || D.mode === 'cool') return;
    if (D.d < M.min || D.d > M.range || D.lockT < T.lock + M.lockExtra || D.err > T.tol * 2.5) return;
    D.salvo = M.salvo; D.salvoT = 0; D.mslCd = M.reload;
  }
  function launch(o, D, T, f) {
    const M = T.msl, ud = o.mesh.userData, cells = ud.cells;
    const cell = cells[(D.cellsSpent || 0) % cells.length]; D.cellsSpent = (D.cellsSpent || 0) + 1;
    cell.cover.visible = false;
    ud.pitch.localToWorld(_m.copy(cell.pos)); barrelDir(o, _n);
    const mesh = mslGeo.clone(); mesh.position.copy(_m); scene.add(mesh);
    const ms = { p: _m.clone(), dir: _n.clone(), spd: M.speed0, age: 0, M, side: D.side, launcher: o, key: D.key, tgt: f.player || f.hp === undefined ? null : f, player: !!f.player, tp: f.p, tv: f.v, guided: true, losT: 0, mesh, smokeT: 0 };   // tgt null for the flying ALBATROSS: a proxy point, hit-tested at the burst
    missiles.push(ms);
    // launch tell: a cloud of smoke round the launcher, the whoosh, the cockpit warning
    if (fx) for (let i = 0; i < 14; i++) fx.mix.spawn(_m.x + rnd(-1, 1), _m.y + rnd(-0.5, 0.5), _m.z + rnd(-1, 1), -_n.x * rnd(2, 6) + rnd(-2, 2), rnd(0.5, 2), -_n.z * rnd(2, 6) + rnd(-2, 2), rnd(2, 4), 1.2, 5, .78, .77, .74, 0.6, -0.2, 1.4, 0.6);
    if (fx) fx.flash(_m.x, _m.y, _m.z, 0.5);
    snd.launch(env.hear ? env.hear(_m.x, _m.y, _m.z, 600) : 0.6);
    if (f.player) { const t = env.time(); if (t - launchFeedT > DEF_WAR.launchFeedEvery && env.feed) { launchFeedT = t; env.feed('MISSILE LAUNCH  -  BREAK LINE OF SIGHT', 'bad'); } }
  }
  function updateMissiles(dt) {
    const pl = env.player ? env.player() : null;
    let warnLaunch = false;
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i], M = m.M; m.age += dt;
      m.spd = Math.min(M.speed, m.spd + M.accel * dt);
      // target still there? guided only while the launcher is alive and still sees it (hide behind a hill and it goes dumb)
      const alive = m.player ? pl && pl.alive && !pl.inCave : m.tgt ? !m.tgt.dead && !m.tgt.dying && !m.tgt.gone : true;
      m.losT -= dt;
      if (m.guided && m.losT <= 0) {
        m.losT = 0.2; const L = m.launcher, le = L.mesh.userData.pitch.getWorldPosition(_e);
        m.guided = alive && !L.dead && !(L.ship && L.ship.sinking !== undefined) && los(le.x, le.y, le.z, m.tp.x, m.tp.y, m.tp.z) && m.age < M.life;
      }
      if (m.player && m.guided) decoy(m, pl);   // CM: flares and chaff in front of its nose
      if (m.player && m.guided && pl) rwrAdd('M', Math.atan2(m.p.x - pl.pos.x, -(m.p.z - pl.pos.z)), m.p.distanceTo(pl.pos), 1, true, true);   // CM: on the warning scope
      const _p0x = m.p.x, _p0y = m.p.y, _p0z = m.p.z;
      if (m.guided && m.age > 0.25) {
        const d = Math.hypot(m.tp.x - m.p.x, m.tp.y - m.p.y, m.tp.z - m.p.z), tgo = Math.min(2.5, d / Math.max(30, m.spd));
        _d.set(m.tp.x + m.tv.x * tgo - m.p.x, m.tp.y + m.tv.y * tgo - m.p.y, m.tp.z + m.tv.z * tgo - m.p.z).normalize();
        const ang = Math.acos(clamp(m.dir.dot(_d), -1, 1)), max = M.turn * dt;
        if (ang > 1e-4) m.dir.lerp(_d, Math.min(1, max / ang)).normalize();
        if (m.player) warnLaunch = true;
      } else if (!m.guided) m.dir.y -= 2 * dt / Math.max(20, m.spd);   // unguided: it sags
      m.p.addScaledVector(m.dir, m.spd * dt);
      m.mesh.position.copy(m.p); m.mesh.lookAt(_e.copy(m.p).sub(m.dir));
      const fl = m.mesh.getObjectByName('flame'); if (fl) { fl.scale.set(1, 1, 0.7 + Math.random() * 0.6); fl.visible = m.age < M.life * 0.85; }
      // trail
      if (fx) {
        fx.add.spawn(m.p.x + m.dir.x * 1.2, m.p.y + m.dir.y * 1.2, m.p.z + m.dir.z * 1.2, 0, 0, 0, 0.05, 1.2, 0.5, 1, .85, .55, 1);
        const n = Math.min(4, Math.ceil(m.spd * dt / 1.2));   // puffs laid along the step, so the trail stays a line at any frame rate
        for (let k = 0; k < n; k++) { const t = k / n, x = _p0x + (m.p.x - _p0x) * t + m.dir.x * 1.5, y = _p0y + (m.p.y - _p0y) * t + m.dir.y * 1.5, z = _p0z + (m.p.z - _p0z) * t + m.dir.z * 1.5; fx.mix.spawn(x, y, z, rnd(-.3, .3), rnd(0, .4), rnd(-.3, .3), rnd(2.5, 4), 0.6, 2.8, .86, .86, .84, 0.5, -0.1, 1, 0.5); }
      }
      // fuse: closest approach this step to the target point, then the ground, then the motor running out
      let boom = false, hitTgt = false;
      {
        const sx = m.p.x - _p0x, sy = m.p.y - _p0y, sz = m.p.z - _p0z, L2 = sx * sx + sy * sy + sz * sz || 1;
        const k = clamp(((m.tp.x - _p0x) * sx + (m.tp.y - _p0y) * sy + (m.tp.z - _p0z) * sz) / L2, 0, 1);
        const cx = _p0x + sx * k, cy = _p0y + sy * k, cz = _p0z + sz * k, dd = Math.hypot(cx - m.tp.x, cy - m.tp.y, cz - m.tp.z);
        const prox = M.prox + (m.player && pl ? (pl.hitR || 2.6) - 2.6 : 0);
        if (alive && dd < prox) { boom = true; hitTgt = true; m.p.set(cx, cy, cz); }
      }
      if (!boom && m.p.y < H(m.p.x, m.p.z) + 0.3) boom = true;
      if (!boom && m.age > M.life + 1.5) boom = true;
      if (boom) {
        const { x, y, z } = m.p;
        if (y > H(x, z) + 3) { fx && fx.flak(x, y, z); fx && fx.explode(x, y, z, 0.7, { debris: 2 }); } else fx && fx.explode(x, Math.max(y, H(x, z)), z, 0.9, { debris: 3 });
        const k = env.hear ? env.hear(x, y, z, 500) : 0.5; if (env.sfx && env.sfx.ctx && k > 0.02) env.sfx.boom(0.15 + 0.6 * k * k);
        if (hitTgt) {
          if (m.player) env.hurtPlayer && env.hurtPlayer(M.playerDmg, 'MISSILE');
          else if (m.tgt) env.damage(m.tgt, M.dmg, m.side);
          else if (env.hitTest) { const h = env.hitTest(x, y, z, m.side, 5); if (h) env.damage(h, M.dmg * 0.5, m.side); }
        }
        // CM: a decoyed missile bursting on its flare close to the player still throws fragments at him
        if (m.decoy && pl && pl.alive && M.playerDmg && m.p.distanceTo(pl.pos) < 14) env.hurtPlayer && env.hurtPlayer(M.playerDmg * 0.35, 'MISSILE FRAGMENTS');
        scene.remove(m.mesh); missiles[i] = missiles[missiles.length - 1]; missiles.pop();
      }
    }
    if (warnLaunch) { warnMode = 3; warnP = 1; }
  }

  // ------------------------------------------------------------------ countermeasures (cm.js rules)
  // flares: one roll per burning flare per missile guiding on the player, if the flare is in front of the missile's
  // nose; chaff: one weaker roll per cloud. A decoyed missile steers at the decoy instead (and bursts there).
  let decoyFeedT = -99;
  function decoy(m, pl) {
    const FR = CM_RULES.flare, CR = CM_RULES.chaff, was = m.cmSeen || 0;
    let best = null, seen = was;
    const tryIt = (o, p) => {
      if (o.id <= was) return false;
      if (o.id > seen) seen = o.id;
      const dx = o.x - m.p.x, dy = o.y - m.p.y, dz = o.z - m.p.z, d = Math.hypot(dx, dy, dz) || 1;
      if (d > FR.near || (dx * m.dir.x + dy * m.dir.y + dz * m.dir.z) / d < FR.cone) return false;
      const close = pl && m.p.distanceTo(pl.pos) < FR.close;
      return Math.random() < p * (close ? FR.pClose / FR.p : 1);
    };
    for (const f of CM.flares) if (f.age >= 0.15 && tryIt(f, FR.p)) { best = f; break; }
    if (!best) for (const c of CM.chaff) if (c.age >= CR.bloom && tryIt(c, CR.p)) { best = c; break; }
    m.cmSeen = seen;
    if (!best) return;
    m.player = false; m.tgt = null; m.decoy = best; m.tp = best; m.tv = { x: best.vx, y: best.vy, z: best.vz };   // the decoys carry x / y / z
    CM.stats.decoyed++;
    const t = env.time(); if (env.feed && t - decoyFeedT > 3) { decoyFeedT = t; env.feed(CM.flares.includes(best) ? 'MISSILE DECOYED  -  FLARE' : 'MISSILE DECOYED  -  CHAFF', 'good'); }
  }
  // chaff blooming near the player: every RUNAWAY radar tracking him keeps only a little of its lock and is jammed
  function chaffBloom() {
    const CR = CM_RULES.chaff, pl = env.player ? env.player() : null; if (!pl) return;
    for (const c of CM.chaff) {
      if (c.bloomed || c.age < CR.bloom) continue; c.bloomed = true;
      if (Math.hypot(c.x - pl.pos.x, c.y - pl.pos.y, c.z - pl.pos.z) > 80) continue;
      for (const o of units) {
        const D = o.def; if (!D || D.side !== 2 || D.key !== 'P' || D.type === 'lance' || D.d > CR.range) continue;
        D.lockT = Math.min(D.lockT, D.T.lock * CR.keep); D.jamT = CR.jam; D.salvo = 0; CM.stats.jammed++;
      }
    }
  }

  // ------------------------------------------------------------------ the LANCE
  function makeBeam() {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    const outer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x55dfff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xeaffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    const g = new THREE.Group(); g.add(outer); g.add(core); g.visible = false; scene.add(g);
    const spot = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); spot.visible = false; scene.add(spot);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1], 3));
    const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x8fefff, transparent: true, opacity: 0.0, depthWrite: false })); line.frustumCulled = false; line.visible = false; scene.add(line);
    return { g, outer, core, spot, line, st: 'idle', t: 0, dwell: 0, dmgAcc: 0, end: new THREE.Vector3(), len: 0, blocked: '' };
  }
  function lance(o, D, T, f, locked, err, dt) {
    const B = D.beam, BT = T.beam, ud = o.mesh.userData;
    B.t -= dt;
    const lens = ud.pitch.localToWorld(_m.copy(ud.lens)); barrelDir(o, _n);
    let firing = false;
    if (B.st === 'idle') {
      if (locked && D.d <= BT.range && err < T.tol * 4) { B.st = 'charge'; B.t = BT.charge; }
    } else if (B.st === 'charge') {
      if (!f || !D.los) { B.st = 'idle'; }
      else if (B.t <= 0) { B.st = 'on'; B.t = BT.on; B.dwell = 0; }
    } else if (B.st === 'on') {
      firing = true;
      if (B.t <= 0 || !f) { B.st = 'cool'; B.t = BT.cool; D.mode = 'cool'; D.heat = 1; snd.vent(env.hear ? env.hear(lens.x, lens.y, lens.z, 300) : 0.4); }
    } else if (B.st === 'cool') {
      if (B.t <= 0) { B.st = 'idle'; D.mode = f ? 'track' : 'search'; }
    }
    // the beam: along the barrel, stopped by the ground, by smoke, or by the target
    const range = BT.range;
    const showLine = B.st === 'charge', showBeam = B.st === 'on';
    if (showLine || showBeam) {
      let L = rayGround(lens, _n, range); B.blocked = L < range ? 'ground' : '';
      const sm = smokeAlong(lens, _n, L), stop = smokeAlong.stop; if (stop < L) { L = stop; B.blocked = 'smoke'; } B.smoke = sm;
      { const s2 = smokeStop(lens.x, lens.y, lens.z, _n.x, _n.y, _n.z, L); if (s2 < L) { L = s2; B.blocked = 'smoke'; } }   // CM: M18 plumes
      let onT = false;
      if (f) {   // does the beam pass through the target?
        const dx = f.p.x - lens.x, dy = f.p.y - lens.y, dz = f.p.z - lens.z, tt = dx * _n.x + dy * _n.y + dz * _n.z;
        if (tt > 0 && tt < L) {
          const ex = dx - _n.x * tt, ey = dy - _n.y * tt, ez = dz - _n.z * tt, miss = Math.sqrt(ex * ex + ey * ey + ez * ez);
          const pl = f.player ? env.player() : null, r = f.player ? (pl.hitR || 2.6) * 0.9 : (f.r || 4) * 0.9;
          if (miss < r) { onT = true; L = tt; B.blocked = 'target'; }
        }
      }
      B.len = L; B.end.copy(lens).addScaledVector(_n, L);
      if (showBeam) {
        if (onT) {
          B.dwell += dt;
          if (B.dwell >= BT.dwell) {
            const k = BT.full ? clamp(1 - (1 - BT.falloff) * (L - BT.full) / (BT.range - BT.full), BT.falloff, 1) : 1;   // the beam spreads with range
            if (f.player) { B.dmgAcc += BT.playerDps * k * dt; if (B.dmgAcc >= 0.08) { env.hurtPlayer && env.hurtPlayer(B.dmgAcc, 'LASER'); B.dmgAcc = 0; } }
            else if (f.hp !== undefined) { B.dmgAcc += BT.dps * k * dt; if (B.dmgAcc >= 0.5) { env.damage(f, B.dmgAcc, D.side); B.dmgAcc = 0; } }
            else if (env.hitTest) { B.dmgAcc += BT.dps * k * dt; if (B.dmgAcc >= 1) { const h = env.hitTest(B.end.x, B.end.y, B.end.z, D.side, 4); if (h) env.damage(h, B.dmgAcc, D.side); B.dmgAcc = 0; } }
          }
        } else B.dwell = Math.max(0, B.dwell - dt * 2);
      }
    }
    // visuals
    B.line.visible = showLine;
    if (showLine) {
      const pa = B.line.geometry.attributes.position; pa.setXYZ(0, lens.x, lens.y, lens.z); pa.setXYZ(1, B.end.x, B.end.y, B.end.z); pa.needsUpdate = true;
      const p = 1 - Math.max(0, B.t) / BT.charge; B.line.material.opacity = 0.25 + 0.55 * p * (0.6 + 0.4 * Math.sin(env.time() * 40));
    }
    B.g.visible = showBeam; B.spot.visible = showBeam;
    if (showBeam) {
      const w = BT.width * 0.18 * (0.85 + Math.random() * 0.3);
      B.g.position.copy(lens); B.g.lookAt(B.end); B.outer.scale.set(w, w, B.len); B.core.scale.set(w * 0.3, w * 0.3, B.len);
      B.outer.material.opacity = 0.3 + Math.random() * 0.15;
      B.spot.position.copy(B.end); B.spot.scale.setScalar(0.5 + Math.random() * 0.5 + (B.blocked === 'target' ? 0.4 : 0));
      if (fx) {
        // heat shimmer and sparks along the beam, a burn where it lands
        for (let i = 0; i < 2; i++) { const s = Math.random() * B.len; fx.add.spawn(lens.x + _n.x * s, lens.y + _n.y * s, lens.z + _n.z * s, rnd(-.5, .5), rnd(0, 1), rnd(-.5, .5), 0.25, 0.3, 0.05, .55, .9, 1, 0.7); }
        fx.add.spawn(B.end.x, B.end.y, B.end.z, rnd(-6, 6), rnd(2, 8), rnd(-6, 6), rnd(0.2, 0.5), 0.3, 0.1, 1, .9, .6, 1, 12, 0.5);
        if (B.blocked === 'ground' && Math.random() < 0.3) { fx.mix.spawn(B.end.x, B.end.y + 0.3, B.end.z, rnd(-.5, .5), rnd(1, 2.5), rnd(-.5, .5), rnd(1.5, 3), 0.6, 3, .3, .3, .3, 0.5, -0.3, 1, 0.5); if (Math.random() < 0.2) fx.scorch.add({ x: B.end.x, y: B.end.y + 0.06, z: B.end.z, size: 1.2, a: 0.7, tile: 0, n: new THREE.Vector3(0, 1, 0) }); }
      }
    } else B.dmgAcc = 0;
    // sound: the loudest LANCE this frame drives the shared voice
    const k = env.hear ? env.hear(lens.x, lens.y, lens.z, 420) : 0.5;
    const st = showBeam ? 2 : showLine ? 1 : 0;
    if (st && k > laserK) { laserK = k; laserSt = st; laserP = st === 1 ? 1 - Math.max(0, B.t) / BT.charge : 1; }
    if (f && f.player && showLine && D.d < DEF_WAR.lockToneRange) { warnMode = Math.max(warnMode, 2); }
    return firing;
  }

  // ------------------------------------------------------------------ the crews (crew.js figures; models.js crewSpots)
  // gunners ride the mount and look where the gun looks (scanning the sky while it searches); commanders stand in their
  // hatches and duck while the guns fire; the spotter turns to the target and points it out, then covers his ears; the
  // loaders keep the gun fed - walk to the ready-use boxes, pick one up, carry it to the gun, heave it up, go again
  // while there is room (tune.js mag.trip rounds a box). The TALON's TICK climbs onto the deck and feeds the packs.
  const WALK = 1.5, CARRY = 1.1;
  function crewStep(o, D, T, f, firing, dt, t, show) {
    const ud = o.mesh.userData, M = T.mag, hi = ud.hi;
    let tb = null, tel = 0.3;   // the target's bearing / elevation in the unit's frame
    if (f && hi) { _e.copy(f.p); hi.worldToLocal(_e); tb = Math.atan2(-_e.x, -_e.z); tel = Math.atan2(_e.y - 1.6, Math.hypot(_e.x, _e.z)); }
    const loud = firing || D.burstT > 0 || D.flashT > -0.15;
    const need = () => M && D.ammo + D.inbound * M.trip <= M.rounds - M.trip;
    for (const c of ud.crew) {
      const sp = c.spot, fig = c.fig, g = fig.g;
      if (c.tick) { tickStep(o, D, T, c, f, tb, dt, t, show); continue; }
      if (sp.role === 'gunner') {
        if (show) fig.pose('sit', t, { look: f ? [sp.second ? -0.2 : 0, clamp(D.pitch * 0.7, -0.3, 0.7)] : [Math.sin(t * 0.4 + g.id) * (sp.second ? 0.9 : 0.4), 0.15 + Math.sin(t * 0.3) * 0.1], lean: firing ? 0.07 : 0, grip: firing ? Math.sin(t * 50) * 0.03 : 0 });
        continue;
      }
      if (sp.role === 'hatch') {
        const onYaw = g.parent === ud.yaw, rel = tb === null ? 0 : onYaw ? angDiff(D.yaw, tb) : tb;
        if (show) fig.pose('hatch', t, { look: f ? [clamp(rel, -1.2, 1.2), clamp(tel, -0.2, 0.7)] : [Math.sin(t * 0.35 + g.id) * 1.1, 0.3 + Math.sin(t * 0.23) * 0.15], duck: loud && !sp.low ? 0.35 : 0 });
        continue;
      }
      // on the ground: the spotter and the loaders
      const face = want => { g.rotation.y += angDiff(g.rotation.y, want) * Math.min(1, 4 * dt); };
      if (sp.role === 'spotter') {
        if (tb !== null) face(tb);
        if (show) fig.pose(loud ? 'kneel' : 'stand', t, { look: [tb === null ? Math.sin(t * 0.3) * 0.8 : angDiff(g.rotation.y, tb), tb === null ? 0.25 : clamp(tel, -0.2, 0.75)], ears: loud, point: f && !loud && D.lockT < T.lock ? [0, clamp(tel, 0, 0.6)] : null });
        continue;
      }
      // loader
      const walkTo = (x, z, v) => { const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz); if (d < 0.05) return true; const s = Math.min(d, v * dt); c.x += dx / d * s; c.z += dz / d * s; face(Math.atan2(-dx, -dz)); c.ph = (c.ph || 0) + s * 4.2; g.position.x = c.x; g.position.z = c.z; return d - s < 0.05; };
      c.t -= dt;
      switch (c.job) {
        case 'idle':
          if (need()) { c.job = 'fetch'; D.inbound++; break; }
          if (tb !== null) face(tb);
          if (show) fig.pose(loud && Math.hypot(c.x, c.z) < 6 ? 'kneel' : 'stand', t, { look: [tb === null ? Math.sin(t * 0.25 + g.id) * 0.9 : angDiff(g.rotation.y, tb), tb === null ? 0.2 : clamp(tel, -0.2, 0.7)], ears: loud });
          break;
        case 'fetch': if (walkTo(sp.ammo[0], sp.ammo[1], WALK)) { c.job = 'pick'; c.t = 0.7; } if (show) fig.pose(c.job === 'pick' ? 'kneel' : 'walk', t, { phase: c.ph, look: [0, -0.3] }); break;
        case 'pick': if (show) fig.pose('kneel', t, { look: [0, -0.5] }); if (c.t <= 0) c.job = 'bring'; break;
        case 'bring': if (walkTo(sp.gun[0], sp.gun[1], CARRY)) { c.job = 'load'; c.t = 1.3; face(Math.atan2(sp.gun[0], sp.gun[1])); } if (show) fig.pose('carry', t, { phase: c.ph, look: [0, 0] }); break;
        case 'load':
          if (show) fig.pose('load', t, { lift: (1.3 - c.t) / 1.3 * Math.PI - Math.PI / 2, look: [0, 0.4] });
          if (c.t <= 0) { D.inbound = Math.max(0, D.inbound - 1); D.ammo = Math.min(M.rounds, D.ammo + M.trip); D.fed = (D.fed || 0) + 1; if (need()) { c.job = 'fetch'; D.inbound++; } else c.job = 'back'; }
          break;
        case 'back': if (walkTo(sp.home[0], sp.home[1], WALK)) c.job = 'idle'; if (show) fig.pose('walk', t, { phase: c.ph, look: [0, 0] }); break;
        default: c.job = 'idle';
      }
    }
  }
  // the TICK: idles on the ground beside the truck, climbs onto the deck to feed the gun belts / missile packs, comes down
  function tickStep(o, D, T, c, f, tb, dt, t, show) {
    const sp = c.spot, fig = c.fig, g = fig.g, M = T.mag;
    const work = (D.cellsSpent > 0 && D.mslCd > 0) || (M && D.ammo < M.rounds * 0.7);
    const target = work ? 1 : 0, was = c.s;
    c.s += clamp(target - c.s, -dt * 0.6, dt * 0.6);
    const [hx, hy, hz] = sp.home, [kx, ky, kz] = sp.deck, s = c.s;
    g.position.set(hx + (kx - hx) * s, hy + (ky - hy) * s + Math.sin(Math.PI * s) * 0.5, hz + (kz - hz) * s);
    const moving = Math.abs(c.s - was) > 1e-5;
    if (moving) { const dir = target ? Math.atan2(-(kx - hx), -(kz - hz)) : Math.atan2(kx - hx, kz - hz); g.rotation.y += angDiff(g.rotation.y, dir) * Math.min(1, 5 * dt); }
    else if (s > 0.99) g.rotation.y += angDiff(g.rotation.y, Math.atan2(kx, kz - 2.3)) * Math.min(1, 3 * dt);   // on deck: faces the gun module
    else if (tb !== null) g.rotation.y += angDiff(g.rotation.y, tb) * Math.min(1, 2 * dt);
    if (s > 0.99 && work && M && D.ammo < M.rounds) D.ammo = Math.min(M.rounds, D.ammo + M.trip * dt / 2.5);
    if (!show) return;
    if (moving) fig.pose('walk', t);
    else if (s > 0.99 && work) fig.pose('work', t, { look: [0, 0.6] });
    else fig.pose('idle', t, { look: tb === null ? null : [angDiff(g.rotation.y, tb), 0.3] });
  }

  // ------------------------------------------------------------------ tells and moving parts
  function animate(o, D, T, f, firing, dt, t) {
    const ud = o.mesh.userData;
    // the stand-in (LOD far level) mirrors the turret; the crews are drawn near the camera only
    if (ud.loYaw) { ud.loYaw.rotation.y = D.yaw; ud.loPitch.rotation.x = D.pitch; }
    const show = D.camD < 170;
    if (ud.crew && ud.crew.length && show !== D.crewShown) { D.crewShown = show; for (const c of ud.crew) c.fig.g.visible = show; }
    if (ud.crew && ud.crew.length) crewStep(o, D, T, f, firing, dt, t, show);
    // LANCE: the sensor head sweeps the sky searching, settles on the target tracking
    if (ud.sens) { const want = f ? Math.sin(t * 7) * 0.03 : Math.sin(t * 0.7 + D.radarA) * 0.5; ud.sens.rotation.y += (want - ud.sens.rotation.y) * Math.min(1, 3 * dt); ud.sens.rotation.x = f ? 0 : Math.sin(t * 0.45) * 0.12; }
    // damaged: smoke from the engine deck / mount, the odd spark
    if (ud.state === 'damaged' && fx && D.camD < 600) {
      D.smokeT -= dt;
      if (D.smokeT <= 0) { D.smokeT = 0.12; o.mesh.localToWorld(_e.set(rnd(-0.6, 0.6), (ud.h || 2) * 0.55, rnd(-0.5, 1.5))); const g = rnd(.12, .22); fx.mix.spawn(_e.x, _e.y, _e.z, rnd(-.3, .3), rnd(1.2, 2.2), rnd(-.3, .3), rnd(3, 5), 0.8, 4.5, g, g, g, 0.5, -0.2, 0.6, 1.2); if (Math.random() < 0.08) fx.add.spawn(_e.x, _e.y, _e.z, rnd(-3, 3), rnd(2, 5), rnd(-3, 3), rnd(0.3, 0.6), 0.2, 0.1, 1, .7, .3, 1, 12, 0.4); }
    }
    // radar: spins while searching; the dish (Shilka) / tracking antenna (Talon) points and nods while tracking
    if (ud.radar) {
      if (D.type === 'shilka') {
        if (f) { D.radarA += angDiff(D.radarA, 0) * Math.min(1, 4 * dt); ud.dish.rotation.x = D.pitch * 0.9 + Math.sin(t * 9) * 0.02; }
        else { D.radarA += dt * 2.4; ud.dish.rotation.x += (0.15 - ud.dish.rotation.x) * Math.min(1, 2 * dt); }
        ud.radar.rotation.y = D.radarA;
      } else { D.radarA += dt * (f ? 3.2 : 2.0); ud.radar.rotation.y = D.radarA; }
    }
    if (ud.dish && (D.type === 'talon' || D.type === 'talonm')) { ud.dish.rotation.z = t * (f ? 12 : 2); ud.dish.rotation.x = f ? Math.sin(t * 12) * 0.05 : 0; }
    // rotary barrels: spin up while locking (a tell you can hear), full speed while firing
    if (T.spin) {
      const want = firing || (f && D.lockT > T.lock * 0.4 && D.los) ? 1 : 0;
      D.spin += clamp(want - D.spin, -dt * 0.8, dt * 2.2);
      if (want && D.spinWas === 0) { snd.whine(env.hear ? env.hear(o.mesh.position.x, o.mesh.position.y, o.mesh.position.z, 260) : 0.4); }
      D.spinWas = want;
      for (const s of ud.spin) s.rotation.z += dt * D.spin * 60;
    }
    // muzzle flashes
    D.flashT -= dt;
    for (const fl of ud.flashes) { const on = D.flashT > 0 && Math.random() < 0.7; fl.visible = on; if (on) { fl.rotation.z = Math.random() * 6.28; fl.scale.setScalar(0.7 + Math.random() * 0.6); } }
    // the lamp: slow blink searching, faster as the lock builds, steady when locked
    if (ud.lamp) {
      const L = T.lock + (T.msl ? T.msl.lockExtra : 0);
      let on;
      if (!f) on = (t % 2) < 0.12;
      else if (D.lockT >= L || firing) on = true;
      else { D.blink += dt * (1.5 + 9 * clamp(D.lockT / L, 0, 1)); on = (D.blink % 1) < 0.45; }
      ud.lamp.visible = on;
    }
    // LANCE: seams brighten through the charge; the radiators glow red-hot after a shot and vent steam; shimmer
    if (D.T.beam) {
      const B = D.beam, BT = T.beam;
      const p = B.st === 'charge' ? 1 - Math.max(0, B.t) / BT.charge : B.st === 'on' ? 1 : 0;
      ud.glow.color.setRGB(0.22 + 0.7 * p, 0.55 + 0.45 * p, 0.66 + 0.34 * p);   // dim teal at rest, near white at full charge
      if (B.st === 'cool') D.heat = Math.max(0, B.t / BT.cool); else if (B.st !== 'on') D.heat = Math.max(0, D.heat - dt * 0.2);
      const h = D.heat; ud.finM.color.setRGB(0.022 + 0.9 * h, 0.024 + 0.12 * h * h, 0.028 + 0.01 * h);   // linear rgb: dark composite -> red hot
      if (fx && (h > 0.15 || p > 0.3)) {
        const yawG = ud.yaw;
        if (h > 0.15 && Math.random() < h * 0.7) { const v = ud.vents[(Math.random() * ud.vents.length) | 0]; yawG.localToWorld(_m.copy(v)); fx.mix.spawn(_m.x, _m.y, _m.z, rnd(-.4, .4), rnd(1.5, 3), rnd(-.4, .4), rnd(1, 2), 0.5, 2.6, .92, .93, .95, 0.4 * h, -0.4, 1, 0.6); }
        if (Math.random() < 0.6) { ud.pitch.localToWorld(_m.set(rnd(-0.3, 0.3), rnd(0.2, 0.5), rnd(-3.2, -0.4))); fx.mix.spawn(_m.x, _m.y, _m.z, 0, rnd(0.6, 1.4), 0, rnd(0.5, 0.9), 0.4, 1.4, .95, .96, .98, 0.09 + 0.06 * p, -0.2, 2, 0.3); }   // heat haze off the barrel
      }
    }
  }

  // a knocked-out unit: the ready rounds cook off for a while (pops, sparks, the odd tracer whizzing out), then it
  // smoulders (war.js's explosion lit the fire). The wreck stays on its slot until a new gun is built there.
  function wreck(o, dt) {
    const D = o.def; if (D.wreckT < 0) { D.wreckT = 0; D.cook = T_COOK(o); }
    D.wreckT += dt; if (!fx || D.wreckT > D.cook) return;
    if (Math.random() > dt * 5 * (1 - D.wreckT / D.cook)) return;
    o.mesh.localToWorld(_e.set(rnd(-0.8, 0.8), rnd(0.8, 1.8), rnd(-1, 1)));
    fx.add.spawn(_e.x, _e.y, _e.z, 0, 0, 0, 0.08, rnd(1, 2), rnd(2, 3), 1, .75, .4, 1);
    for (let i = 0; i < 5; i++) fx.add.spawn(_e.x, _e.y, _e.z, rnd(-9, 9), rnd(3, 14), rnd(-9, 9), rnd(0.4, 0.9), 0.25, 0.15, 1, rnd(.6, .9), .3, 1, 12, 0.4);
    fx.mix.spawn(_e.x, _e.y, _e.z, rnd(-.5, .5), rnd(1, 2), rnd(-.5, .5), rnd(2, 4), 0.8, 3, .15, .14, .13, 0.5, -0.3, 1, 0.8);
    if (Math.random() < 0.3) { _n.set(rnd(-1, 1), rnd(0.2, 1), rnd(-1, 1)).normalize(); tracer(_e, _n, rnd(60, 110), rnd(0.6, 1.4), D.side); }
    const k = env.hear ? env.hear(_e.x, _e.y, _e.z, 350) : 0.3; if (k > 0.03) snd.thud(k * 0.6);
  }
  const T_COOK = o => o.def.T.gun ? rnd(7, 12) : o.def.T.msl ? rnd(4, 7) : 0;

  // ------------------------------------------------------------------ the frame
  function tick(dt) {
    if (!(dt > 0)) dt = 0;
    stepCM(dt, fx, H); chaffBloom();   // CM: flares, chaff and smoke move; chaff blooms jam the radars tracking the player
    updateMissiles(dt);
    // beams of units that died mid-shot
    for (const o of units) {
      const gone = o.dead || !o.mesh.parent;
      if (gone && o.def.beam) { const B = o.def.beam; B.g.visible = B.spot.visible = B.line.visible = false; B.st = 'idle'; }
      if (!o.mesh.parent) units.delete(o);
      else if (o.dead && !o.ship) wreck(o, dt);
    }
    updateTracers(dt);
    snd.warn(warnMode, warnP); snd.laser(laserSt, laserP, laserK);
    rwrPublish(warnMode, warnP, env.time()); rwrBegin();   // CM: the cockpits' radar warning picture for this frame
    warnMode = 0; warnP = 0; laserSt = 0; laserP = 0; laserK = 0;
  }
  function reset() {
    for (const m of missiles) scene.remove(m.mesh); missiles.length = 0;
    for (const o of units) if (o.def.beam) { const B = o.def.beam; scene.remove(B.g, B.spot, B.line); }
    units.clear(); snd.silence(); resetCM(); TR.n = 0; trMesh.count = 0;
  }
  return { pick, model, attach, refitCarrier, refitShip, update, tick, reset, units, missiles, los, smokeAlong, DEF, CM, tracers: () => TR };
}
