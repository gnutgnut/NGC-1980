// mv22unit.js - one RUNAWAY MV-22 on a mission: flight model + tilt pilot + mission AI + exterior model + the machine
// troopers in the back. Used by the war (rotary.js) and the dev page alike.
//   o: { parent, env, world, lz(), home(), pad: {x, z}, start: {x, y, z, yaw}, squad: n, onParked() }
import * as THREE from 'three';
import { createMV22Sim, MV22 } from './mv22fm.js';
import { createTiltPilot } from './tiltpilot.js';
import { stateOf } from './pilot.js';
import { createTransportAI } from './transportai.js';
import { flyMV22, MV22_AI } from './mv22ai.js';
import { buildMV22Mesh } from './mv22model.js';
import { createSquad, padSlots } from './squad.js';
import { createEmbark } from './embark.js';

const _v = new THREE.Vector3();
export function createMV22Unit(o) {
  const S = createMV22Sim(), st = {};
  const n = o.squad ?? 12; S.payload = n * MV22.TROOPER_KG;
  S.reset([o.start.x, o.start.y + MV22.CG_H + 0.05, o.start.z], o.start.yaw, true, o.env, 90);
  const P = createTiltPilot(MV22.PILOT, S); P.reset(0);
  const model = buildMV22Mesh(); o.parent.add(model.group);
  const squad = createSquad({ parent: o.parent, side: 2, n, kind: 'machine', groundY: (x, z) => o.env.groundY(x, z) });
  const U = { S, P, model, squad, ramp: 0, rampT: 0, unloadT: 0, deployed: false, fold: 0, time: 0, dead: false };
  const AI = U.AI = createTransportAI(MV22_AI, {
    lz: o.lz, home: o.home,
    unload(ai, dt) {   // ramp down, the troopers march out in step and take their posts round the pad; ramp up, away
      U.unloadT += dt; U.rampT = 1;
      if (!U.deployed && U.ramp > 0.95) {
        model.group.updateMatrixWorld(true);
        const L = (x, y, z) => { _v.set(x, y, z); model.group.localToWorld(_v); return { x: _v.x, y: _v.y, z: _v.z }; };
        const e = model.RAMP_END, path = [L(0.3, -1.25, 1.0), L(0, -1.25, 4.6), L(e.x, e.y + 0.05, e.z), L(e.x, e.y, e.z + 1.2)];
        path[3].y = o.env.groundY(path[3].x, path[3].z); path[2].y = Math.max(path[2].y, o.env.groundY(path[2].x, path[2].z));
        const pad = o.pad, a0 = Math.atan2(S.body.pos[2] - pad.z, S.body.pos[0] - pad.x);
        squad.deploy(path, padSlots(pad.x, pad.z, n, 5, 8.5, a0));
        U.deployed = true; U.unloadT = 0; if (o.onDeploy) o.onDeploy(U);
      }
      if (U.deployed && U.unloadT > 3 && squad.clear(S.body.pos[0], S.body.pos[2], 13)) { U.rampT = 0; return true; }
      return false;
    },
    parked() { U.parkT = (U.parkT || 0); U.folding = true; },
  });
  // loading on the deck / pad before lift-off (o.board), with the deck crew on a ship's spot (o.deck() -> the spot)
  if (o.board) { U.embark = createEmbark({ kind: 'mv22', U, deck: o.deck, parent: o.parent, jersey: o.jersey || 'cyan' }); AI.hooks.board = U.embark.board; }
  const animS = { nr: 1, nac: Math.PI / 2, tR: { tx: 0, ty: 0 }, tL: { tx: 0, ty: 0 }, coll: 0, gear: 1, ramp: 0, flap: 1, el: 0, rud: 0, ail: 0, fold: 0, run: true };
  U.update = (dt, time) => {
    U.time = time;
    const nS = Math.max(1, Math.ceil(dt * 30 - 1e-6)), h = dt / nS;   // the pilot works at >= 30 Hz however long the frame
    for (let i = 0; i < nS && !U.dead; i++) {
      stateOf(S.body, st);
      const cmd = AI.step(st, S, h, o.world);
      if (U.folding) { cmd.fold = U.fold > 0.45; }
      const c = flyMV22(S, P, st, cmd, h, S.agl);
      if (U.folding) { c.eng0 = c.eng1 = false; c.rotorBrake = true; }   // shut down and brake the rotors for the fold
      U.ev = S.step(h, c, o.env) || U.ev;
      if (S.dead) U.dead = S.dead;
    }
    // stowing on the carrier: rotors spin down, nacelles to 0, blades fold, wing swings round (a real ~90 s, here 16 s)
    if (U.folding) { U.fold = Math.min(1, U.fold + dt / 16); if (U.fold >= 1 && !U.parked) { U.parked = true; if (o.onParked) o.onParked(U); } }
    U.ramp += Math.max(-dt / 3, Math.min(dt / 3, U.rampT - U.ramp));
    U.sync(dt, time);
    if (U.embark) { model.group.updateMatrixWorld(); U.embark.update(dt, time, AI.phase); }
    if (!U.squadExternal) squad.update(dt, time);
  };
  U.sync = (dt, time) => {
    const b = S.body, g = model.group;
    g.position.set(b.pos[0], b.pos[1], b.pos[2]); g.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
    animS.nr = U.folding ? Math.max(0, S.rpm * (1 - U.fold * 2)) : S.rpm; animS.nac = S.nac; animS.coll = S.c.tcl;
    animS.tR.tx = S.rR.tx; animS.tR.ty = S.rR.ty; animS.tL.tx = S.rL.tx; animS.tL.ty = S.rL.ty;
    animS.gear = S.gear; animS.ramp = U.ramp; animS.flap = S.flap; animS.el = -S.c.lon; animS.rud = S.c.ped; animS.ail = S.c.lat; animS.fold = U.fold; animS.th75 = S.th75;
    model.animate(animS, dt, time);
  };
  U.setPad = p => { o.pad = p; };
  U.dispose = () => { o.parent.remove(model.group); if (U.embark) U.embark.dispose(); if (!U.squadExternal) squad.dispose(); };
  return U;
}
