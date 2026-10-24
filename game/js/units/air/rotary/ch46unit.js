// ch46unit.js - one CH-46 on a mission, the whole thing: flight model + AI pilot + mission AI + exterior model + the
// Marine squad in the back. Used as it is by the war (rotary.js) and by the dev page (game/dev/rotary.html), so what
// you watch on the dev page is what flies in the game.
//   o: { parent, env, world, lz() -> {x,y,z,hdg}, home() -> deck spot | null, pad: {x, z}, start: {x, y, z, yaw},
//        squad: n Marines (13), onParked(), modex }
import * as THREE from 'three';
import { createCH46Sim, CH46 } from './ch46fm.js';
import { createPilot, stateOf } from './pilot.js';
import { createTransportAI } from './transportai.js';
import { flyCH46, CH46_AI } from './ch46ai.js';
import { buildCH46Mesh } from './ch46model.js';
import { createSquad, padSlots } from './squad.js';
import { createEmbark } from './embark.js';

const _v = new THREE.Vector3();
export function createCH46Unit(o) {
  const S = createCH46Sim(), P = createPilot(CH46.PILOT), st = {};
  const n = o.squad ?? 13; S.payload = n * CH46.MARINE_KG;
  S.reset([o.start.x, o.start.y + CH46.CG_H + 0.05, o.start.z], o.start.yaw, true, o.env); P.reset(0);
  const model = buildCH46Mesh({ modex: o.modex }); o.parent.add(model.group);
  const squad = createSquad({ parent: o.parent, side: 1, n, kind: 'marine', groundY: (x, z) => o.env.groundY(x, z) });
  const U = { S, P, model, squad, ramp: 0, rampT: 0, unloadT: 0, deployed: false, time: 0, engines: true, dead: false, gunAim: null, gunFiring: false };   // gunAim: world direction the door gunners swing onto (set by the war)
  const AI = U.AI = createTransportAI(CH46_AI, {
    lz: o.lz, home: o.home,
    unload(ai, dt) {   // ramp down, Marines out (up the cabin, down the ramp, out to the pad), ramp up once they're clear
      U.unloadT += dt; U.rampT = 1;
      if (!U.deployed && U.ramp > 0.95) {
        model.group.updateMatrixWorld(true);
        const L = (x, y, z) => { _v.set(x, y, z); model.group.localToWorld(_v); return { x: _v.x, y: _v.y, z: _v.z }; };
        const end = model.RAMP_END, path = [L(0.3, -0.95, 1.0), L(0, -0.95, 3.9), L(end.x, end.y + 0.05, end.z), L(end.x, end.y, end.z + 1.2)];
        path[3].y = o.env.groundY(path[3].x, path[3].z); path[2].y = Math.max(path[2].y, o.env.groundY(path[2].x, path[2].z));
        const pad = o.pad, a0 = Math.atan2(S.body.pos[2] - pad.z, S.body.pos[0] - pad.x);
        squad.deploy(path, padSlots(pad.x, pad.z, n, 5, 8.5, a0));
        U.deployed = true; U.unloadT = 0;
      }
      if (U.deployed && U.unloadT > 3 && squad.clear(S.body.pos[0], S.body.pos[2], 12)) { U.rampT = 0; return true; }
      return false;
    },
    parked() { U.parked = true; if (o.onParked) o.onParked(U); },
  });
  // loading on the deck / pad before lift-off (o.board), with the deck crew on a ship's spot (o.deck() -> the spot)
  if (o.board) { U.embark = createEmbark({ kind: 'ch46', U, deck: o.deck, parent: o.parent, jersey: o.jersey || 'yellow' }); AI.hooks.board = U.embark.board; }
  const animS = { nr: 1, F: { tx: 0, ty: 0 }, A: { tx: 0, ty: 0 }, coll: 0, ramp: 0, run: true, n1: 0.9, cone: 0.06 };
  U.update = (dt, time) => {
    U.time = time;
    // the pilot works at >= 30 Hz however long the frame (a 0.1 s frame = 3 control steps)
    const nS = Math.max(1, Math.ceil(dt * 30 - 1e-6)), h = dt / nS;
    for (let i = 0; i < nS && !U.dead; i++) {
      stateOf(S.body, st);
      const cmd = AI.step(st, S, h, o.world), c = flyCH46(S, P, st, cmd, h);
      if (!U.engines) { c.eng0 = c.eng1 = false; }
      U.ev = S.step(h, c, o.env) || U.ev;
      if (S.dead) U.dead = S.dead;
    }
    U.ramp += Math.max(-dt / 2.5, Math.min(dt / 2.5, U.rampT - U.ramp));
    U.sync(dt, time);
    if (U.embark) { model.group.updateMatrixWorld(); U.embark.update(dt, time, AI.phase); }
    if (!U.squadExternal) squad.update(dt, time);
  };
  U.sync = (dt, time) => {
    const b = S.body, g = model.group;
    g.position.set(b.pos[0], b.pos[1], b.pos[2]); g.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
    animS.nr = S.rpm; animS.F.tx = S.rf.tx; animS.F.ty = S.rf.ty; animS.A.tx = S.ra.tx; animS.A.ty = S.ra.ty; animS.coll = S.c.coll;
    animS.gunAim = U.gunAim; animS.gunFiring = U.gunFiring;
    animS.ramp = U.ramp; animS.n1 = S.eng[0].n1; animS.light = AI.phase === 'descend' || AI.phase === 'descend2' || (AI.phase === 'transit' && AI.cmd.dist < 200);
    animS.cone = Math.min(0.12, 0.75 * Math.max(0, (S.rf.ct + S.ra.ct) / 2) / 0.058);   // coning ~ CT / sigma
    model.animate(animS, dt, time);
  };
  U.setPad = p => { o.pad = p; };
  U.dispose = () => { o.parent.remove(model.group); if (U.embark) U.embark.dispose(); squad.dispose(); };
  return U;
}
