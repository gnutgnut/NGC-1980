// THE GROUND WAR: the 1980 Marine figure for squads and crowds. INFANTRY's soldier model (units/infantry/
// soldiermodel.js: the shared skeleton, the procedural poser, the Marine in ERDL with M1 helmet, flak vest and ALICE
// gear) behind the rotary module's FIGURES contract, so the CH-46's cabin, the ramp and the fight all show the same
// man. A cheap stand-in (the rotary module's 6-mesh figure) takes over in the distance.
//
//   FIGURES.marine(opts) -> { group, pose(state, phase, dt) }                    (the rotary contract: squad.js)
//     + poseFull(p, dt)   p = { stance, stanceFrom, stanceTo, stanceT, speed, gaitPhase, aimPitch, down, cls, ads }
//     + setDetail(level)  'full' (skeleton + weapon, ~18 draw calls) | 'lite' (6 meshes) | 'off'
//     + setWeapon(key)    'M16A1' | 'M16A1/M203' | 'M72A2' | null
import * as THREE from 'three';
import { buildMarine as buildSoldier, poseSkeleton, makePose } from '../infantry/soldiermodel.js';
import { buildMarine as buildLite } from '../air/rotary/figures.js';

export function buildMarineFigure(o = {}) {
  const seed = o.variant ?? o.seed ?? Math.floor(Math.random() * 999);
  const group = new THREE.Group(); group.name = 'marine';
  let sk = null;   // the full skeleton is built on first use (a CH-46 full of men that never get out costs nothing)
  const lite = buildLite({ variant: seed }); lite.group.scale.setScalar(1); group.add(lite.group);
  let level = 'lite', weapon = o.weapon === undefined ? 'M16A1' : o.weapon;
  const P = makePose({ cls: 'rifle' });
  const ensure = () => { if (!sk) { sk = buildSoldier({ camo: seed % 5 === 4 ? 'og107' : 'erdl', seed: seed + 1, weapon, detail: 'low' }); group.add(sk.root); sk.root.visible = level === 'full'; } return sk; };
  const F = {
    group,
    get skeleton() { return sk; },
    setDetail(l) {
      if (l === level) return; level = l;
      if (l === 'full') ensure();
      if (sk) sk.root.visible = l === 'full';
      lite.group.visible = l === 'lite';
    },
    setWeapon(key) { if (key === weapon) return; weapon = key; if (sk) sk.setWeapon(key); },
    // the rotary contract: 'run' | 'walk' | 'stand' | 'kneel' | 'aim' | 'fall' | 'dead' | 'seated'
    pose(state, ph = 0, dt = 0.016) {
      lite.pose(state, ph);
      if (level !== 'full') return;
      P.down = state === 'fall' || state === 'dead'; P.stanceT = 1; P.seat = state === 'seated';   // (ngc/marine-polish: seated on the troop seat, rifle between the knees)
      P.stance = P.stanceFrom = P.stanceTo = state === 'kneel' || state === 'aim' ? 'crouch' : 'stand';
      P.speed = state === 'run' ? 2.7 : state === 'walk' ? 1.4 : 0; P.gaitPhase = ph; P.gait = state === 'run' ? 'run' : 'walk';
      P.ads = state === 'aim' ? 1 : 0; P.aimPitch = 0;
      poseSkeleton(ensure(), P, dt);
    },
    poseFull(p, dt = 0.016) {
      if (level === 'lite') {   // map to the stand-in's few states
        const st = p.down ? 'dead' : p.stance === 'prone' ? 'dead' : p.stance === 'crouch' ? 'kneel' : p.speed > 2 ? 'run' : p.speed > 0.3 ? 'walk' : 'stand';
        lite.pose(st, p.down ? 1 : p.gaitPhase || 0);
        if (p.stance === 'prone' && !p.down) { lite.group.children[0].rotation.x = 1.5; lite.group.children[0].position.y = 0.1; }
        return;
      }
      if (level !== 'full') return;
      Object.assign(P, p); if (p.cls) P.cls = p.cls; P.seat = !!p.seat; P.climb = p.climb ?? null; P.swim = p.swim || null;
      poseSkeleton(ensure(), P, dt);
    },
  };
  F.setDetail(o.detail || 'lite');
  return F;
}
