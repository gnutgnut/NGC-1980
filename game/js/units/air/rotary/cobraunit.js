// cobraunit.js - one AH-1T SeaCobra: flight model (cobrafm.js) + pilot.js hands + the crew's mind (cobraai.js) + the
// model (cobramodel.js) + the weapons at game level. PARITY: the Task Force counterpart of waspunit.js; the war
// (rotary.js) and the dev page (game/dev/rotary.html) use it as it is.
//   o: { parent, env, world (groundY, floorAlong, los), start: { x, y, z, yaw, vx, vz }, landed (start on the skids:
//        lifts off first), home: [x, z], id, modex, gun (rounds), rockets, gunSpeed (game round speed, m/s),
//        fire(kind 'gun' | 'rocket', from Vector3, dir Vector3 (unit), U) }
//   U.update(dt, time, tgt, ctx): tgt { x, y, z, vx, vy, vz, air, slow } | null; ctx { task, peace }
// Weapons (headline figures only): M197 20 mm, 750 rounds, 750 rounds/min in bursts (one game round per real round);
// 2.75 in FFAR rockets from two LAU-68 pods (7 each), fired in pairs on a running-fire pass.
import * as THREE from 'three';
import { createCobraSim, COBRA } from './cobrafm.js';
import { createPilot, stateOf } from './pilot.js';
import { createCobraAI, flyCobra, COBRA_AI } from './cobraai.js';
import { buildCobraMesh } from './cobramodel.js';
import { clamp, wrap } from './rb.js';

const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _l = new THREE.Vector3();
const D2R = Math.PI / 180;
export const COBRA_GUN = { rpm: 750, yawRate: 80 * D2R, pitchRate: 60 * D2R, burst: [0.7, 1.3], gap: [1.0, 2.2], pairs: 3, pairGap: 0.35 };   // turret slew rates INFERRED

export function createCobraUnit(o) {
  const S = createCobraSim(), P = createPilot(COBRA.PILOT), st = {}, me = {};
  const landed = !!o.landed, s0 = o.start;
  S.reset([s0.x, s0.y + (landed ? COBRA.CG_H + 0.05 : 0), s0.z], s0.yaw ?? 0, landed, o.env); P.reset(landed ? 0 : 0.55);
  if (!landed) { S.body.vel[0] = s0.vx || 0; S.body.vel[2] = s0.vz || 0; }
  const model = buildCobraMesh({ modex: o.modex, tow: o.tow }); o.parent.add(model.group);
  const AI = createCobraAI({ id: o.id ?? Math.random(), home: o.home });
  const U = { S, P, AI, model, dead: false, ammo: { gun: o.gun ?? 750, rockets: o.rockets ?? 14 }, firing: false, rocketT: 9, target: null,
    phase: landed ? 'lift' : 'fly', liftHdg: s0.yaw ?? 0, tY: 0, tP: -0.08, aimErr: 1, burstOn: false, burstT: 0, gunCd: 0, rkCd: 0, salvo: 0, fired: { gun: 0, rockets: 0 },
    squadExternal: true };   // (no troops aboard: rotary.js's crash code skips the squad)
  const lift = { vx: 0, vz: 0, vy: 2.5, hdg: 0 }, actx = {};
  const rnd = (a, b) => a + Math.random() * (b - a);
  U.update = (dt, time, tgt, ctx = {}) => {
    U.target = tgt; Object.assign(actx, ctx); actx.time = time;
    const nS = Math.max(1, Math.ceil(dt * 30 - 1e-6)), h = dt / nS;   // the pilot works at >= 30 Hz however long the frame
    for (let i = 0; i < nS && !U.dead; i++) {
      stateOf(S.body, st); me.x = st.x; me.y = st.y; me.z = st.z; me.vx = st.vx; me.vy = st.vy; me.vz = st.vz; me.yaw = st.yaw;
      let cmd;
      if (U.phase === 'lift') {   // straight up off the deck or pad (carried along with a moving deck), then away
        const sv = o.env.surfVel ? o.env.surfVel(st.x, st.z) : null; U.liftV = U.liftV || (sv ? { vx: sv.vx, vz: sv.vz } : { vx: 0, vz: 0 });
        lift.vx = U.liftV.vx; lift.vz = U.liftV.vz; lift.hdg = U.liftHdg; lift.vy = S.agl < 1 ? 1.5 : 3;
        cmd = lift; if (S.agl > 9) U.phase = 'fly';
      } else {
        actx.los = tgt ? o.world.los(st.x, st.y + 0.5, st.z, tgt.x, tgt.y + 1, tgt.z) : false; actx.rockets = U.ammo.rockets; actx.gun = U.ammo.gun;
        cmd = AI.step(me, tgt, h, o.world, actx);
      }
      const c = flyCobra(S, P, st, cmd, h);
      U.ev = S.step(h, c, o.env) || U.ev;
      if (S.dead) U.dead = S.dead;
      weapons(h, tgt, ctx);
    }
    U.sync(dt, time);
  };
  // ---- the turret follows the target's lead point inside its limits; bursts; rocket pairs
  function weapons(h, tgt, ctx) {
    const g = model.group; g.position.set(S.body.pos[0], S.body.pos[1], S.body.pos[2]); g.quaternion.set(S.body.q[0], S.body.q[1], S.body.q[2], S.body.q[3]); g.updateMatrixWorld();
    let wY = 0, wP = -0.08;
    if (tgt && U.phase === 'fly') {
      _p.copy(model.TURRET); g.localToWorld(_p);
      const sp = o.gunSpeed ?? 160, d0 = Math.hypot(tgt.x - _p.x, tgt.y - _p.y, tgt.z - _p.z), t = d0 / sp;
      _l.set(tgt.x + (tgt.vx || 0) * t - _p.x, tgt.y + 0.6 + (tgt.vy || 0) * t + 1.1 * t * t - _p.y, tgt.z + (tgt.vz || 0) * t - _p.z);
      _l.applyQuaternion(_q.copy(g.quaternion).invert()).normalize();
      wY = clamp(Math.atan2(-_l.x, -_l.z), -COBRA_AI.turretYaw, COBRA_AI.turretYaw); wP = clamp(Math.asin(clamp(_l.y, -1, 1)), -COBRA_AI.turretDown, COBRA_AI.turretUp);
    }
    U.tY += clamp(wrap(wY - U.tY), -COBRA_GUN.yawRate * h, COBRA_GUN.yawRate * h); U.tP += clamp(wP - U.tP, -COBRA_GUN.pitchRate * h, COBRA_GUN.pitchRate * h);
    U.aimErr = Math.hypot(wrap(wY - U.tY), wP - U.tP);
    // gun: bursts while the crew wants to fire and the turret is on
    U.gunCd -= h; U.burstT -= h; U.rkCd -= h; U.rocketT += h;
    const want = AI.fireGun && U.aimErr < 0.06 && U.ammo.gun > 0 && !ctx.peace;
    if (want) { if (U.burstT <= 0) { U.burstOn = !U.burstOn; U.burstT = U.burstOn ? rnd(...COBRA_GUN.burst) : rnd(...COBRA_GUN.gap); } }
    else if (U.burstOn) { U.burstOn = false; U.burstT = Math.max(U.burstT, 0.4); }
    U.firing = want && U.burstOn;
    if (U.firing && U.gunCd <= 0) {
      U.gunCd += 60 / COBRA_GUN.rpm; if (U.gunCd < 0) U.gunCd = 0;
      const cp = Math.cos(U.tP); _d.set(-Math.sin(U.tY) * cp, Math.sin(U.tP), -Math.cos(U.tY) * cp).applyQuaternion(g.quaternion);
      _p.copy(model.TURRET); g.localToWorld(_p); _p.addScaledVector(_d, 1.85);
      U.ammo.gun--; U.fired.gun++; if (o.fire) o.fire('gun', _p, _d, U);
    }
    // rockets: pairs in the release band, a few pairs a pass
    if (AI.mode !== 'run') U.salvo = 0;
    if (AI.fireRockets && tgt && U.rkCd <= 0 && U.ammo.rockets > 0 && U.salvo < COBRA_GUN.pairs && !ctx.peace) {
      U.rkCd = COBRA_GUN.pairGap; U.salvo++; U.rocketT = 0;
      for (const pod of model.PODS) {
        if (U.ammo.rockets <= 0) break;
        _p.copy(pod); g.localToWorld(_p);
        const d0 = Math.hypot(tgt.x - _p.x, tgt.y - _p.y, tgt.z - _p.z), t = d0 / 105;
        _d.set(tgt.x + (tgt.vx || 0) * t - _p.x, tgt.y + 0.5 + 0.6 * t * t - _p.y, tgt.z + (tgt.vz || 0) * t - _p.z).normalize();
        U.ammo.rockets--; U.fired.rockets++; if (o.fire) o.fire('rocket', _p, _d, U);
      }
    }
  }
  const animS = { nr: 1, tx: 0, ty: 0, coll: 0.5, turret: { yaw: 0, pitch: -0.08 }, firing: false, rocketT: 9, n1: 0.9, run: true, light: false, lon: 0 };
  U.sync = (dt, time) => {
    const b = S.body, g = model.group;
    g.position.set(b.pos[0], b.pos[1], b.pos[2]); g.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
    animS.nr = S.rpm; animS.tx = S.rotor.tx; animS.ty = S.rotor.ty; animS.coll = S.c.coll; animS.lon = S.c.lon;
    animS.turret.yaw = U.tY; animS.turret.pitch = U.tP; animS.firing = U.firing && !U.dead; animS.rocketT = U.rocketT; animS.n1 = Math.max(S.eng[0].n1, S.eng[1].n1);
    animS.light = S.agl < 25 && AI.mode === 'home';
    model.animate(animS, dt, time);
  };
  U.dispose = () => o.parent.remove(model.group);
  return U;
}
