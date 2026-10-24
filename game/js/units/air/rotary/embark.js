// embark.js - deck / pad loading and the deck crew round a transport (CH-46 on the ALBATROSS, MV-22 on the KRAKEN).
//
// Flown as an amphibious ship's flight deck works a troop lift (LPH / LHA habits, NWP 3-04.1 style; INFERRED in the
// detail, scaled to the game): the aircraft turns up on its spot, chocked and chained, with the landing signalman
// enlisted (LSE, yellow) out in front where the pilot can see him; the stick of troops waits in two files clear of the
// rotor arc aft of the starboard side; ramp down, the troop handler calls them and they file up the ramp one by one;
// ramp up, the blue shirts pull the chocks and chains and run clear, the LSE checks the deck and gives the lift-off
// signal. Recovery: the LSE takes the aircraft over the spot, the chockers run in once it is down.
// The RUNAWAY's KRAKEN does the same with machines: the deck crew in cyan, the troopers standing in ranks.
//
// Game wiring: createEmbark() returns { board(ai, dt) -> true when ready to lift (transportai.js 'spool' hook),
// update(dt, time, phase), dispose() }. Positions in the aircraft's frame: x right, z aft (nose -z).
import * as THREE from 'three';
import { createCrew } from '../../naval/deckcrew.js';

const _v = new THREE.Vector3(), _e = new THREE.Euler();
// per type: where the stick waits, the way in, the cabin floor, where the crew stand (local, metres)
const LAYOUT = {
  ch46: { muster: [-12.5, 6], cabin: [[0, -0.95, 3.9], [0.3, -0.95, 1.0], [0.45, -0.95, -3.2]], lse: [9, -17], chocks: [[2.7, 1.6], [-2.7, 1.6]], clear: [[10, 2.5], [-10, 2.5]], gap: 0.45 },
  mv22: { muster: [-13, 5], cabin: [[0, -1.25, 4.6], [0.3, -1.25, 1.0], [0.4, -1.25, -3.0]], lse: [6, -19], chocks: [[2.6, 1.0], [-2.6, 1.0]], clear: [[4, 15], [-4, 15]], gap: 0.6 },
};

// o: { kind, U (the unit: S, model, squad, ramp/rampT, AI), deck: () => { x, y, z, hdg } | null (a ship's spot: deck crew),
//      parent (scene), jersey: 'yellow' | 'cyan' }
export function createEmbark(o) {
  const { U } = o, L = LAYOUT[o.kind], model = U.model, E = model.RAMP_END, gy = E.y;
  const face = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
  // the stick: two files, kneeling side-on to the aircraft, facing the ramp
  const n = U.squad.figs.length, rows = Math.ceil(n / 2), stick = [];
  const mx = E.x + L.muster[0], mz = E.z + L.muster[1];
  for (let i = 0; i < n; i++) { const x = mx + Math.sign(L.muster[0]) * (i % 2) * 1.5, z = mz + Math.floor(i / 2) * 1.3; stick.push({ x, y: gy, z, yaw: face(x, z, E.x, E.z), g: true }); }
  const path = [{ x: E.x + Math.sign(L.muster[0]) * 2.5, y: gy, z: E.z + 3, g: true }, { x: E.x, y: gy, z: E.z + 1.0, g: true },   // g: on the deck / ground (the figure follows it, not the aircraft's attitude)
    { x: E.x, y: E.y + 0.05, z: E.z }, ...L.cabin.map(([x, y, z]) => ({ x, y, z }))];
  const g = model.group;
  const toWorld = (x, y, z, out) => { _v.set(x, y, z); g.localToWorld(_v); out.x = _v.x; out.y = _v.y; out.z = _v.z; return out; };
  const yaw = () => _e.setFromQuaternion(g.quaternion, 'YXZ').y;
  U.squad.stick(stick.slice(0, rows * 2), path, toWorld, yaw);

  // the deck crew (a ship's spot only): LSE + two chock-and-chain men, in the deck spot's frame
  let crew = null, members = null;
  if (o.deck && o.deck()) {
    const j = o.jersey || 'yellow', blue = j === 'cyan' ? 'cyan' : 'blue';
    members = [
      { x: L.lse[0], z: L.lse[1], yaw: face(L.lse[0], L.lse[1], 0, 0), jersey: j, mode: 'idle', hands: true },
      ...L.chocks.map(([x, z]) => ({ x, z, yaw: face(x, z, 0, z), jersey: blue, mode: 'kneel' })),
    ];
    crew = createCrew(members, { seed: 7 + Math.floor(Math.random() * 50) }); o.parent.add(crew.group);
  }
  const go = (p, tx, tz, final) => { if (Math.hypot(tx - p.x, tz - p.z) < 0.2) { p.mode = final; return; } p.path = [[p.x, p.z], [tx, tz]]; p.seg = 0; p.s = 0; p.mode = 'walk'; p.final = final; p.speed = 2.2; };
  const B = { step: 0, t: 0, chocked: true };
  B.clear = () => !members || members.slice(1).every(p => p.mode !== 'walk' && p.mode !== 'kneel');
  // transportai 'spool' hook: true when the aircraft may lift
  B.board = (ai, dt) => {
    B.t += dt;
    switch (B.step) {
      case 0: U.rampT = 1; if (U.ramp > 0.95 && ai.t > 1.5) { U.squad.embark(L.gap); B.step = 1; } break;   // ramp down: the handler calls the stick
      case 1: if (U.squad.boarded) { U.rampT = 0; B.step = 2; if (members) members.slice(1).forEach((p, k) => go(p, L.clear[k][0], L.clear[k][1], 'idle')); } break;   // all aboard: ramp up, chocks and chains off
      case 2: if (U.ramp < 0.05 && B.clear()) { B.step = 3; B.t = 0; } break;
      case 3: if (members) members[0].mode = 'signal'; if (B.t > (members ? 2 : 0.5)) { B.step = 4; return true; } break;   // the LSE: clear to lift
      default: return true;
    }
    return false;
  };
  B.update = (dt, time, phase) => {
    if (phase !== 'spool' && B.step < 4) { U.squad.boardNow(); U.rampT = 0; B.step = 4; }   // re-tasked mid-load: the rest jump in, ramp up
    if (!crew) return;
    const d = o.deck(); if (!d) { crew.group.visible = false; return; }
    crew.group.position.set(d.x, d.y, d.z); crew.group.rotation.y = d.hdg;
    const b = U.S.body.pos, near = Math.hypot(b[0] - d.x, b[2] - d.z) < 140;
    crew.group.visible = near;
    if (!near) return;
    const lse = members[0];
    if (['lift', 'sidestep', 'hoverchk2', 'descend2'].includes(phase) || (phase === 'rtb' && Math.hypot(b[0] - d.x, b[2] - d.z) < 80)) lse.mode = 'signal';
    else if (phase !== 'spool') lse.mode = 'idle';
    if ((phase === 'parked' || phase === 'ground') && B.chocked === false) { B.chocked = true; members.slice(1).forEach((p, k) => go(p, L.chocks[k][0], L.chocks[k][1], 'kneel')); }   // down: chocks and chains in
    if (phase === 'transit') B.chocked = false;
    for (const p of members) if (p.mode === 'walk' && p.seg >= 1) { p.x = p.path[1][0]; p.z = p.path[1][1]; p.mode = p.final; p.yaw = p.final === 'kneel' ? face(p.x, p.z, 0, p.z) : face(p.x, p.z, 0, 0); p.x0 = p.x; p.z0 = p.z; p.yaw0 = p.yaw; }
    crew.update(dt, time);
  };
  B.crewMode = i => members ? members[i].mode : null;
  B.dispose = () => { if (crew) o.parent.remove(crew.group); };
  return B;
}
