// NGC-1980 ngc/marine-polish: the first-person hands when they are not on the rifle for a while - climbing a ladder,
// swimming, and self aid. Runs after viewmodel.js's update (and throwvm.js's) and takes the hands over:
//   'ladder'  the rifle slung (not drawn), both hands on the rails in front, hand over hand: a hand GRIPS while the body
//             climbs past it (so it stays put on the rail: it moves down in the view exactly as fast as you climb), then
//             lets go and reaches up for the next hold, the other hand half a cycle behind (FM 21-20 style ladder
//             climbing: three points of contact)
//   'swim'    the rifle slung across the back (a Marine swims in utilities and boots: FM 21-20 / the USMC water survival
//             syllabus): a breaststroke - hands together forward, sweep out and round, back under the chin; sculling
//             circles when he is only treading water
//   'aid'     self aid: the rifle lowered (throwvm.js lowers it), both hands on the wound (a leg, an arm, the chest) with
//             the OD field dressing in the right hand while a dressing is going on (FM 21-11)
// The positions are in a BODY frame (yaw only, the eye at the origin) and turned into camera space with the view pitch,
// so looking up a ladder the hands stay on the rails instead of floating up with the view.
//   const BV = createBodyVM(vm);   each frame after vm.update / TV.update: BV.update(dt, st)
//   st: null | { mode: 'ladder' | 'swim' | 'aid', pitch (rad), climbY (m: the walker's height on the ladder), speed (m/s),
//         region ('legL' | 'legR' | 'armL' | 'armR' | 'thorax' | 'stomach' | 'head'), item ('dress' | 'tq' | ...) }
import * as THREE from 'three';
import { solveArm } from './viewmodel.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), sstep = t => t * t * (3 - 2 * t), lerp = (a, b, t) => a + (b - a) * t;
const frac = x => x - Math.floor(x);
const RUNG = 0.6;          // m of climb per hand cycle (two rungs of a ~0.3 m pitch ladder)
const GRIP = 0.6;          // fraction of the cycle the hand holds the rail (0.36 m of climb past it), the rest is the reach up
export function createBodyVM(vm) {
  const BV = { k: 0, mode: null, t: 0, swimPh: 0 };
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _e = new THREE.Euler(), _wr = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
  const _from = { L: { p: new THREE.Vector3(), q: new THREE.Quaternion() }, R: { p: new THREE.Vector3(), q: new THREE.Quaternion() } };
  // an OD field dressing (the 1980 first field dressing: an olive-drab pad, tails) in the right hand for self aid
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 0.1), new THREE.MeshLambertMaterial({ color: 0x6b6a48, flatShading: true }));
  pad.position.set(-0.02, 0.0, -0.04); pad.visible = false; vm.arms.R.hand.add(pad);
  function setHand(sd, pos, q) { const a = vm.arms[sd]; a.hand.position.copy(pos); a.hand.quaternion.copy(q); a.hand.updateMatrix(); solveArm(a, _wr.copy(a.hand.userData.wrist).applyMatrix4(a.hand.matrix)); }
  // body frame -> camera space (the view pitch), with an Euler for the hand in the body frame
  function put(sd, x, y, z, ex, ey, ez, pitch, w) {
    _p.set(x, y, z).applyAxisAngle(X, -pitch);
    _q.setFromEuler(_e.set(ex, ey, ez, 'XYZ')); _q.premultiply(_qp.setFromAxisAngle(X, -pitch));
    if (w < 1) {   // blend from where viewmodel.js put the hand (on the rifle) to the target
      const f = _from[sd], h = vm.arms[sd].hand;
      f.p.copy(h.position).lerp(_p, w); f.q.copy(h.quaternion).slerp(_q, w); _p.copy(f.p); _q.copy(f.q);
    }
    setHand(sd, _p, _q);
  }
  BV.update = (dt, st) => {
    BV.t += dt;
    const want = st ? 1 : 0;
    BV.k = clamp(BV.k + (want ? dt / 0.25 : -dt / 0.3), 0, 1);
    if (st) BV.mode = st.mode;
    const g = vm.model && vm.model.group;
    // the rifle: slung on a ladder or swimming (not drawn); self aid keeps it lowered on its sling (throwvm.js)
    const hide = BV.k > 0.5 && (BV.mode === 'ladder' || BV.mode === 'swim');
    if (g) g.visible = !hide;
    if (BV.k <= 0) { BV.mode = null; pad.visible = false; return; }
    const w = sstep(BV.k), pitch = st ? st.pitch || 0 : 0;
    if (BV.mode === 'ladder') {
      const y = st ? st.climbY || 0 : 0;
      for (const [sd, s, off] of [['L', -1, 0], ['R', 1, 0.5]]) {
        const u = frac(y / RUNG + off);
        // gripping: the hand stays on the rail as the body rises past it; reaching: up to the next hold, off the rail
        const hy = u < GRIP ? 0.08 - u * RUNG : 0.08 - GRIP * RUNG + sstep((u - GRIP) / (1 - GRIP)) * GRIP * RUNG;
        const reach = u < GRIP ? 0 : Math.sin(Math.PI * (u - GRIP) / (1 - GRIP));
        put(sd, s * (0.17 - 0.03 * reach), hy, -0.42 + 0.06 * reach, 0.1, 0, s * 0.08, pitch, w);
      }
    } else if (BV.mode === 'swim') {
      const sp = st ? st.speed || 0 : 0, rate = 0.55 + 0.5 * clamp(sp / 0.9, 0, 1);
      BV.swimPh = (BV.swimPh + dt * rate) % 1;
      const ph = BV.swimPh, moving = sp > 0.15;
      for (const [sd, s] of [['L', -1], ['R', 1]]) {
        let x, y, z, rz = s * -1.3;
        if (moving) {   // breaststroke: glide forward (0-0.35), sweep out and round (0.35-0.7), back under the chin (0.7-1)
          if (ph < 0.35) { const t = sstep(ph / 0.35); x = s * lerp(0.08, 0.06, t); y = lerp(-0.26, -0.2, t); z = lerp(-0.28, -0.62, t); }
          else if (ph < 0.7) { const t = sstep((ph - 0.35) / 0.35); x = s * lerp(0.06, 0.42, t); y = lerp(-0.2, -0.3, t); z = lerp(-0.62, -0.38, t); rz = s * -lerp(1.3, 0.4, t); }
          else { const t = sstep((ph - 0.7) / 0.3); x = s * lerp(0.42, 0.08, t); y = lerp(-0.3, -0.26, t); z = lerp(-0.38, -0.28, t); rz = s * -lerp(0.4, 1.3, t); }
        } else {        // treading water: sculling circles in front of the chest
          const a = ph * Math.PI * 2 * 1.6; x = s * (0.26 + 0.07 * Math.cos(a)); y = -0.36 + 0.03 * Math.sin(a * 2); z = -0.36 + 0.06 * Math.sin(a);
        }
        put(sd, x, y, z, -0.2, 0, rz, pitch, w);
      }
    } else if (BV.mode === 'aid') {
      const r = st ? st.region || 'legL' : 'legL', work = Math.sin(BV.t * 5.5) * 0.012;
      // where the wound is, seen from the eye (body frame, m): looking down at it
      const at = r.startsWith('leg') ? [r === 'legL' ? -0.13 : 0.13, -0.5, -0.42] : r === 'armL' ? [-0.2, -0.42, -0.3] : r === 'armR' ? [0.22, -0.42, -0.26]
        : r === 'head' ? [0.02, -0.12, -0.22] : r === 'stomach' ? [0, -0.58, -0.22] : [0.02, -0.38, -0.2];
      const pk = r === 'armL' ? 'R' : r === 'armR' ? 'L' : null;   // (one hand works on the other arm)
      for (const [sd, s] of [['L', -1], ['R', 1]]) {
        if (pk && sd !== pk) { put(sd, at[0] + s * 0.02, at[1] + 0.02, at[2] + 0.06, 0.4, 0, s * 0.3, pitch, w); continue; }   // the hurt arm held out
        put(sd, at[0] + s * (pk ? 0.0 : 0.07) + work * s, at[1] + 0.05 + work, at[2] - 0.02, 1.0, 0, s * -0.4, pitch, w);
      }
      pad.visible = !!st && (st.item === 'dress' || st.item === 'seal' || st.item === 'pack');
    }
  };
  return BV;
}
