#!/usr/bin/env node
// collisionbench.mjs - NGC-1980 wave 3 #3 COLLISION: the one collision world (game/js/collision.js) in node.
//   1. shapes and queries: circle / box / compound narrowphase, the broadphase (re-hashing, de-duplication), rotor
//      discs against tree crowns, segments against trunks, box queries (the deck foul checks)
//   2. contact response: a tank pushes a car aside, a jeep into a tank barely moves it, men shoved apart by mass, a
//      vehicle knocks a man (hit event), wrecks are walls
//   3. avoidance: two vehicles head-on keep right and pass, crossing traffic, a walker round a parked truck
//   4. aircraft on the ground: aircontact.js bands (nudge / bump / damage / crash), a jet taxiing into a parked jet
//   5. the ground war with the collision world: men and machines no longer stand inside each other; the fight still
//      goes the same way; and the COST: CPU per frame, a big fight with and without the collision world, plus a
//      synthetic whole-war load (600 moving bodies, 3200 trees)
//   node tools/collisionbench.mjs
import { createCollisionWorld, PUSH_RATIO, MASS } from '../game/js/collision.js';
import { groundContact, contactDamage } from '../game/js/aircontact.js';
import { createGroundSim } from '../game/js/units/groundwar/groundsim.js';
import { MARINE } from '../game/js/units/groundwar/marine.js';
import { sandboxIsland } from '../game/js/units/runaway/rwworld.js';

let pass = 0, fail = 0;
const check = (ok, name, info = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -  ' + info : ''}`); };
const near = (a, b, e) => Math.abs(a - b) <= e;
const f2 = v => (+v).toFixed(2);

// ------------------------------------------------------------------------------------------------- 1. shapes, queries
{
  const CW = createCollisionWorld();
  const box = CW.add({ cls: 'veh', shape: 'box', x: 0, z: 0, yaw: 0, hl: 2, hw: 1, y0: 0, y1: 2, mass: 1000 });
  const o = { x: 1.5, z: 0, r: 0.6, y0: 0, y1: 1.8 };
  const n = CW.pushCircle(o);
  check(n === 1 && near(o.x, 1.6, 1e-9) && near(o.nx, 1, 1e-9), 'a man against a box side is pushed out to its face + his radius', `x ${f2(o.x)} n ${f2(o.nx)}`);
  const o2 = { x: 0.2, z: 1.5, r: 0.3, y0: 0, y1: 1.8 }; CW.pushCircle(o2);
  check(near(o2.z, 2.3, 1e-9) && near(o2.x, 0.2, 1e-9), 'centre inside the box: out through the nearest face', `(${f2(o2.x)}, ${f2(o2.z)})`);
  const hi = { x: 0, z: 0, r: 0.3, y0: 3, y1: 4 };
  check(CW.pushCircle(hi) === 0, 'vertical ranges: something above the box does not collide');
  CW.place(box, 0, 0, Math.PI / 2);   // turned 90 deg: the long axis along world x
  const o3 = { x: 0, z: 1.5, r: 0.6, y0: 0, y1: 1.8 }; CW.pushCircle(o3);
  check(near(o3.z, 1.6, 1e-9), 'a turned box: its half-width across', `z ${f2(o3.z)}`);
  // box-box SAT
  const b2 = CW.add({ cls: 'veh', shape: 'box', x: 2.9, z: 0, yaw: Math.PI / 2, hl: 1, hw: 1, y0: 0, y1: 2, mass: 1000 });
  const c = CW.contact(b2, box);
  check(c && near(c.depth, 0.1, 1e-6) && near(c.nx, 1, 1e-6), 'box-box: depth and normal (from b to a) from the separating axes', c ? `depth ${c.depth.toFixed(3)} n (${f2(c.nx)}, ${f2(c.nz)})` : 'none');
  CW.place(b2, 3.2, 0); check(!CW.contact(b2, box), 'box-box apart: no contact');
  // compound (a jet: fuselage + wings)
  const jet = CW.add({ cls: 'air', shape: 'box', x: 20, z: 0, hl: 1, hw: 1 });
  CW.setBoxes(jet, [{ x: 20, z: 0, yaw: 0, hl: 8, hw: 1.5, y0: 0, y1: 3 }, { x: 20, z: 1, yaw: 0, hl: 2, hw: 5.7, y0: 1.4, y1: 2.2 }]);
  const under = { x: 24.5, z: 1, r: 0.3, y0: 0, y1: 1.8 }, gap = { x: 24.5, z: 1, r: 0.3, y0: 0, y1: 1.3 };
  check(CW.pushCircle(under) === 1 && CW.pushCircle(gap) === 0, 'compound: a man walks into the wing (1.4 m up), a crouching one goes under it');
  check(jet.R > 8 && jet.R < 9.5, 'compound bound radius covers the parts', f2(jet.R));
  // broadphase: a body crossing cells is found once, from anywhere it overlaps
  const out = []; CW.near(20, 0, 9, out); check(out.filter(b => b === jet).length === 1, 'near(): each body once (de-duplicated across cells)');
  const r0 = CW.stats.rehash; CW.place(b2, 3.25, 0); check(CW.stats.rehash === r0, 'a small move inside the same cells does not re-hash');
  CW.place(b2, 60, 60); CW.near(60, 60, 2, out); check(out.includes(b2), 'a big move re-hashes (found at its new place)');
  CW.near(3.2, 0, 2, out); check(!out.includes(b2), '... and not at the old one');
  // trees: trunk circle + crown cone; rotor disc
  const T = CW.addStatic({ cls: 'tree', shape: 'circle', r: 0.6, x: 100, z: 0, y0: 0, y1: 8, cone: 2.2, owner: { i: 0 } });
  const dLow = CW.disc(100 - 7.32 - 1.5, 2.0, 0, 7.32), dTip = CW.disc(100 - 7.32 - 1.5, 7.6, 0, 7.32), dMiss = CW.disc(100 - 7.32 - 2.5, 4, 0, 7.32);
  check(dLow && dLow.body === T, 'rotor disc 1.5 m into a crown low down: a strike', dLow ? `depth ${f2(dLow.depth)}` : 'none');
  check(!dTip, 'the same reach at the tree top (the cone narrows): no strike');
  check(!dMiss, 'clear of the crown: no strike');
  const seg = CW.segment(95, 1, 0, 105, 1, 0, b => b.cls === 'tree');
  check(seg && near(seg.t, (5 - 0.6) / 10, 1e-6), 'a round through the trunk: the first hit along the segment', seg ? f2(seg.t) : 'none');
  const bq = CW.boxQuery(20, 0, 0, 3, 3, 0, 2, []);
  check(bq.length === 1 && bq[0] === jet, 'boxQuery: the jet on the catapult track (deck foul)');
  CW.enable(T, false); check(!CW.disc(100 - 7.32 - 1.5, 2.0, 0, 7.32), 'a felled tree (disabled) is out of the world');
}

// ------------------------------------------------------------------------------------------------- 2. contact response
// rigid boxes integrating their own velocity (a stand-in for the sims: push() adds momentum)
function rig(CW, o) {
  const b = CW.add({ shape: 'box', y0: 0, y1: 2.5, ...o });
  b.push = (jx, jz) => { b.vx += jx / b.mass; b.vz += jz / b.mass; };
  b.move = (dt, brake = 0) => { const v = Math.hypot(b.vx, b.vz); if (v > 0 && brake) { const k = Math.max(0, v - brake * dt) / v; b.vx *= k; b.vz *= k; } CW.place(b, b.x + b.vx * dt, b.z + b.vz * dt); };
  return b;
}
{
  const CW = createCollisionWorld(), dt = 1 / 60;
  const tank = rig(CW, { cls: 'trk', x: 0, z: 0, hl: 4.6, hw: 1.8, mass: MASS.m60, vx: 3 }), car = rig(CW, { cls: 'veh', x: 7.5, z: 0, hl: 2, hw: 0.85, mass: MASS.m151 });
  tank.yaw = car.yaw = Math.PI / 2; CW.place(tank, 0, 0, Math.PI / 2); CW.place(car, 7.5, 0, Math.PI / 2);
  let maxPen = 0;
  for (let i = 0; i < 300; i++) { tank.vx = Math.max(tank.vx, 3); tank.move(dt); car.move(dt, 4); CW.step(dt); const c = CW.contact(car, tank); if (c) maxPen = Math.max(maxPen, c.depth); }   // (the tank's tracks hold 3 m/s; the car brakes ~0.4 g)
  check(car.x > 7.5 + 3 * 4 && maxPen < 0.25, 'a tank (52.6 t) at 3 m/s pushes a braked jeep (1.1 t) ahead of it', `car moved ${f2(car.x - 7.5)} m in 5 s, worst overlap ${f2(maxPen)} m`);
  check(!CW.hard(MASS.m60, car) && CW.hard(MASS.m151, tank), `the mass rule: a car is not a wall for a tank (< ${PUSH_RATIO} of it), a tank is for a car`);
}
{
  const CW = createCollisionWorld(), dt = 1 / 60;
  const tank = rig(CW, { cls: 'trk', x: 0, z: 0, hl: 4.6, hw: 1.8, mass: MASS.m60 }), jeep = rig(CW, { cls: 'veh', x: -8, z: 0, hl: 2, hw: 0.85, mass: MASS.m151, vx: 10 });
  CW.place(tank, 0, 0, Math.PI / 2); CW.place(jeep, -8, 0, Math.PI / 2);
  let hit = 0; jeep.hit = (o, sp) => { hit = Math.max(hit, sp); };
  for (let i = 0; i < 120; i++) { jeep.move(dt); tank.move(dt, 2); CW.step(dt); }
  check(hit > 9 && jeep.vx < 1 && tank.vx < 0.25, 'a jeep into a tank at 10 m/s: it stops, the tank barely moves', `hit ${f2(hit)} m/s, jeep ${f2(jeep.vx)} m/s, tank ${f2(tank.vx)} m/s`);
}
{
  const CW = createCollisionWorld();
  const mk = (x, m) => { const b = CW.add({ cls: 'inf', shape: 'circle', r: 0.3, x, z: 0, y0: 0, y1: 1.8, mass: m }); b.shove = (dx, dz) => CW.place(b, b.x + dx, b.z + dz); return b; };
  const a = mk(0, 100), b = mk(0.3, 420);
  for (let i = 0; i < 30; i++) CW.step(1 / 30);
  const d = b.x - a.x, sa = -a.x, sb = b.x - 0.3;
  check(d > 0.55 && sa > sb * 3, 'a man and a STRIDER overlapping: shoved apart, the man moves most (mass)', `gap ${f2(d)} m, man ${f2(sa)} m, walker ${f2(sb)} m`);
  const veh = CW.add({ cls: 'veh', shape: 'box', x: -2, z: 0, hl: 2, hw: 0.9, yaw: Math.PI / 2, y0: 0, y1: 2, mass: 1100, vx: 6 });
  let knocked = 0; a.hit = (o, sp, c) => { const at = o.vx * c.nx + o.vz * c.nz; if (o.mass > 600 && at > 2.5) knocked++; };
  CW.place(veh, a.x - 2.1, 0); CW.step(1 / 30);
  check(knocked === 1, 'a vehicle that comes at a man at 6 m/s: a hit event (the game knocks him down)');
  const wreck = CW.add({ cls: 'trk', shape: 'box', x: 40, z: 0, hl: 4, hw: 1.8, y0: 0, y1: 2.4 });   // no push / shove, mass Infinity
  const m2 = mk(41.2, 100); CW.place(m2, 41.2, 1.0); for (let i = 0; i < 10; i++) CW.step(1 / 30);
  check(near(wreck.x, 40, 1e-9) && m2.x > 40 + 1.8 + 0.25, 'a wreck is a wall (immovable): the man is moved out, not it', `man x ${f2(m2.x)}`);
}

// ------------------------------------------------------------------------------------------------- 3. avoidance
function drive(CW, A, B, secs = 14, o = {}) {   // two kinematic vehicles steering with CW.avoid toward their goals
  const dt = 1 / 30, av = {}; let minD = 1e9, hits = 0;
  for (let i = 0; i < secs / dt; i++) {
    for (const U of [A, B]) {
      if (!U.goal) continue;
      const dx = U.goal[0] - U.x, dz = U.goal[1] - U.z, L = Math.hypot(dx, dz); if (L < 2) { U.vx = U.vz = 0; continue; }
      CW.avoid(U, dx / L, dz / L, U.sp, av, o);
      // a vehicle turns at a finite rate (~0.9 rad/s) and accelerates ~2 m/s2
      const want = Math.atan2(av.x, av.z), cur = Math.atan2(U.vx, U.vz) || want, sp = Math.hypot(U.vx, U.vz);
      let da = want - cur; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const tr = (U.turn ?? 0.9) * dt, h = cur + Math.max(-tr, Math.min(tr, da)), s = sp + Math.max(-4 * dt, Math.min(2 * dt, U.sp * av.k - sp));
      U.vx = Math.sin(h) * s; U.vz = Math.cos(h) * s;
      CW.place(U, U.x + U.vx * dt, U.z + U.vz * dt, -h + Math.PI);
    }
    if (CW.contact(A, B)) hits++;
    minD = Math.min(minD, Math.hypot(A.x - B.x, A.z - B.z));
  }
  return { minD, hits };
}
{
  const CW = createCollisionWorld();
  const A = CW.add({ cls: 'veh', shape: 'box', x: 0, z: -60, hl: 2, hw: 0.85, y0: 0, y1: 2, mass: 1100, vz: 8 }), B = CW.add({ cls: 'veh', shape: 'box', x: 0.3, z: 60, hl: 2, hw: 0.85, y0: 0, y1: 2, mass: 1100, vz: -8 });
  A.goal = [0, 60]; A.sp = 8; B.goal = [0.3, -60]; B.sp = 8;
  const r = drive(CW, A, B, 18, { T: 3, margin: 1.0 });
  check(r.hits === 0 && r.minD > 3, 'two AI jeeps head-on at 8 m/s on the same line: both keep right and pass', `closest ${f2(r.minD)} m, ${r.hits} contact frames, ends (${f2(A.x)}, ${f2(A.z)}) (${f2(B.x)}, ${f2(B.z)})`);
  check(A.z > 50 && B.z < -50, '... and both still get where they were going');
}
{
  const CW = createCollisionWorld();
  const A = CW.add({ cls: 'veh', shape: 'box', x: -50, z: 0, hl: 2, hw: 0.85, y0: 0, y1: 2, mass: 1100, vx: 7 }), B = CW.add({ cls: 'veh', shape: 'box', x: 0, z: -50, hl: 3.4, hw: 1.2, y0: 0, y1: 3, mass: 5900, vz: 7 });
  A.goal = [60, 0]; A.sp = 7; B.goal = [0, 60]; B.sp = 7;
  const r = drive(CW, A, B, 18, { T: 3, margin: 1.0 });
  check(r.hits === 0, 'crossing paths at a junction (a jeep and a truck arriving together): no collision', `closest ${f2(r.minD)} m`);
  const C0 = createCollisionWorld();
  const P = C0.add({ cls: 'veh', shape: 'box', x: 0, z: 0, yaw: Math.PI / 2, hl: 3.4, hw: 1.2, y0: 0, y1: 3, mass: 5900 });   // a parked truck, across
  const W = C0.add({ cls: 'walk', shape: 'circle', r: 0.55, x: 0.2, z: -30, y0: 0, y1: 2.1, mass: 420, vz: 1.6 }); W.goal = [0.2, 30]; W.sp = 1.6; W.turn = 2.5;   // (a walker turns on the spot: 2.5 rad/s)
  const r2 = drive(C0, W, P, 45, { T: 2.5, margin: 0.4 });
  check(r2.hits === 0 && W.z > 25, 'a STRIDER walks round a truck parked across its path', `closest ${f2(r2.minD)} m, end z ${f2(W.z)}`);
  void P;
}

// ------------------------------------------------------------------------------------------------- 4. aircraft on the ground
{
  check(contactDamage(0.5).band === 'nudge' && contactDamage(2).band === 'bump' && contactDamage(5).band === 'damage' && contactDamage(9).band === 'crash', 'contact bands: 1 kt nudge, 4 kt bump, 10 kt damage, 17 kt crash');
  const CW = createCollisionWorld();
  const parked = CW.add({ cls: 'air', shape: 'box', x: 0, z: 0, hl: 1, hw: 1 });
  CW.setBoxes(parked, [{ x: 0, z: 0, yaw: 0, hl: 9.6, hw: 1.7, y0: 0, y1: 4 }, { x: 0, z: 1, yaw: 0, hl: 2.5, hw: 5.0, y0: 1, y1: 2 }]);
  const jet = CW.add({ cls: 'air', shape: 'box', x: 0, z: 22, hl: 1, hw: 1 });
  const pos = { x: 0, z: 22 }, vel = { x: 0, z: -4 };   // taxiing nose first (-z) at 4 m/s (8 kt)
  let res = null;
  for (let i = 0; i < 120 && !res; i++) {
    pos.x += vel.x / 30; pos.z += vel.z / 30;
    CW.setBoxes(jet, [{ x: pos.x, z: pos.z, yaw: 0, hl: 8.2, hw: 1.5, y0: 0, y1: 3 }, { x: pos.x, z: pos.z + 0.4, yaw: 0, hl: 2.1, hw: 5.7, y0: 1.35, y1: 2.15 }]);
    res = groundContact(CW, jet, pos, vel);
  }
  check(res && res.band === undefined && contactDamage(res.speed).band === 'damage' && vel.z > -0.5, 'a Hornet taxiing at 8 kt into a parked Tomcat: stopped at the contact, damage band', res ? `closing ${f2(res.speed)} m/s, vel after ${f2(vel.z)}` : 'no contact');
  const man = CW.add({ cls: 'inf', shape: 'circle', r: 0.3, x: 0, z: 40, y0: 0, y1: 1.8, mass: 100 });
  const p2 = { x: 0, z: 40 }, v2 = { x: 0, z: -3 }; CW.setBoxes(jet, [{ x: 0, z: 40, yaw: 0, hl: 8.2, hw: 1.5, y0: 0, y1: 3 }]);
  check(!groundContact(CW, jet, p2, v2), 'men are not walls for a taxiing jet (the contact response shoves them; the jet hurts them)');
  void man;
}

// ------------------------------------------------------------------------------------------------- 5. the ground war
const isl = sandboxIsland(1980);
function fight(o = {}) {
  const I = { id: 0, name: 'TEST', x: 0, z: 0, r: 215, pad: { x: 0, z: 30, r: 8.5, h: isl.height(0, 30) }, structs: [], owner: 1 };
  const CW = o.cw ? createCollisionWorld() : null;
  const GS = createGroundSim({ terrainH: isl.heightExact, islands: [I], seed: o.seed ?? 1, hooks: {}, cw: CW });
  GS.maps.bakeAll(); GS.maps.setObstacles(I, isl.obstacles.map(q => ({ ...q })));
  const B = GS.battle(I), mar = [], rw = [];
  const nM = o.marines ?? 13, nR = o.striders ?? 8;
  for (let k = 0; k < nM; k++) mar.push(GS.addMarine(B, MARINE.ROLES[k % 13], (k % 5) * 3 - 6, 40 + Math.floor(k / 5) * 3, 0, { seed: k + 13 * (o.seed ?? 1) }));
  // (several squads of 13 when nM > 13)
  for (let k = 0; k < nM; k += 13) GS.squadMarines(B, mar.slice(k, k + 13), { type: 'defend', x: 0, z: 30, r: 25 });
  for (let k = 0; k < nR; k++) rw.push(GS.addStrider(B, -40 + (k % 4) * 4, -130 + Math.floor(k / 4) * 4, Math.PI, { weapon: k % 4 === 0 ? 'coil' : 'xm7' }));
  for (let k = 0; k < nR; k += 4) GS.squadRW(B, rw.slice(k, k + 4), { type: 'take', x: 0, z: 30, r: 30 });
  for (const v of o.vehicles || []) { const u = v.kind === 'hovertank' ? GS.addHover(B, v.x, v.z, Math.PI) : GS.addMBT(v.kind, B, v.x, v.z, Math.PI); GS.join(B, u, { type: 'take', x: 0, z: 30, r: 30 }); rw.push(u); }
  const dt = 1 / 30, secs = o.secs ?? 120; let overlapT = 0, frames = 0, ms = 0, worst = 0, cwMs = 0;
  for (let i = 0; i < secs / dt; i++) {
    const t0 = performance.now();
    GS.step(dt, { cam: { x: 0, y: 60, z: 0 } });
    if (CW) { CW.step(dt); cwMs += CW.stats.ms + CW.stats.stepMs; CW.stats.ms = 0; }
    ms += performance.now() - t0; frames++;
    // men / machines standing inside each other (alive, upright, closer than the sum of their radii less 5 cm)
    if (i % 15 === 0) {
      const al = GS.units.filter(u => u.alive && u.kind !== 'mbt' && u.kind !== 'hovertank');
      for (let a = 0; a < al.length; a++) for (let b = a + 1; b < al.length; b++) {
        const ra = al[a].kind === 'marine' ? 0.3 : 0.55, rb = al[b].kind === 'marine' ? 0.3 : 0.55, d = Math.hypot(al[a].x - al[b].x, al[a].z - al[b].z);
        if (d < ra + rb - 0.05) { overlapT++; worst = Math.max(worst, ra + rb - d); }
      }
    }
  }
  const alive = s => GS.units.filter(u => u.alive && u.side === s).length;
  return { shots: GS.stats.shots, ms: ms / frames, cwMs: cwMs / frames, overlapT, worst, mar: alive(1), rw: alive(2), owner: I.owner, kills: GS.stats.kills, CW, units: GS.units.length };
}
{
  const a = fight({ cw: false, secs: 240 }), b = fight({ cw: true, secs: 240 });
  console.log(`      ground war 13 Marines vs 8 STRIDERs, 240 s:  without CW ${f2(a.ms)} ms/step, ${a.overlapT} overlapping pair samples (worst ${f2(a.worst)} m), left M${a.mar} R${a.rw}`);
  console.log(`                                                   with CW    ${f2(b.ms)} ms/step (of it the collision world ${b.cwMs.toFixed(3)} ms), ${b.overlapT} overlapping pair samples (worst ${f2(b.worst)} m), left M${b.mar} R${b.rw}`);
  console.log('      (the totals differ mostly because the fights go differently: men who are not inside each other live longer and keep fighting)');
  check(b.overlapT < Math.max(2, a.overlapT * 0.25), 'with the collision world the men and machines stop standing inside each other', `${a.overlapT} -> ${b.overlapT} samples`);
  check(b.shots[1] > 50 && b.shots[2] > 50 && b.mar + b.rw < 21, 'the fight still happens (both sides fire, casualties)', `shots ${b.shots[1]} / ${b.shots[2]} (without: ${a.shots[1]} / ${a.shots[2]}), left M${b.mar} R${b.rw}`);
  check(b.cwMs < 0.25, 'cost: the collision world (avoidance, pushes, contact step) under 0.25 ms a step in a squad fight', `${b.cwMs.toFixed(3)} ms of ${f2(b.ms)}`);
  const c = fight({ cw: false, secs: 90, marines: 39, striders: 24, vehicles: [{ kind: 'hovertank', x: 30, z: -150 }, { kind: 'm1a2', x: -30, z: -160 }] });
  const d = fight({ cw: true, secs: 90, marines: 39, striders: 24, vehicles: [{ kind: 'hovertank', x: 30, z: -150 }, { kind: 'm1a2', x: -30, z: -160 }] });
  console.log(`      BIG FIGHT 39 Marines + 24 STRIDERs + RW-7 + M1A2, 90 s:  without CW ${f2(c.ms)} ms/step   with CW ${f2(d.ms)} ms/step, of it the collision world ${d.cwMs.toFixed(3)} ms (${d.CW.bodies.length} bodies)`);
  check(d.cwMs < 0.6 && d.cwMs < d.ms * 0.12, 'cost in a big fight: the collision world under 0.6 ms and 12% of the ground war step', `${d.cwMs.toFixed(3)} ms of ${f2(d.ms)} (${(d.cwMs / d.ms * 100).toFixed(1)}%)`);
  check(d.overlapT < Math.max(3, c.overlapT * 0.3), 'big fight: overlaps cut', `${c.overlapT} -> ${d.overlapT}`);
}
{   // synthetic whole-war load: 3200 trees, 600 moving bodies, every body placed, stepped and steered each frame, 1000 circle pushes
  const CW = createCollisionWorld({ cell: 10 }); let s = 7; const R = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 3200; i++) CW.addStatic({ cls: 'tree', shape: 'circle', r: 0.6 + R(), x: (R() - 0.5) * 3000, z: (R() - 0.5) * 3000, y0: 0, y1: 6, cone: 2 });
  const B = [];
  for (let i = 0; i < 600; i++) {
    const k = i % 10, isl = i % 17, cx = Math.cos(isl) * 900, cz = Math.sin(isl * 1.7) * 900;
    const b = CW.add(k < 6 ? { cls: 'inf', shape: 'circle', r: 0.3, mass: 100 } : k < 8 ? { cls: 'walk', shape: 'circle', r: 0.55, mass: 420 } : { cls: 'veh', shape: 'box', hl: 2.2, hw: 1, mass: 2000 });
    b.x = cx + (R() - 0.5) * 120; b.z = cz + (R() - 0.5) * 120; b.vx = (R() - 0.5) * 3; b.vz = (R() - 0.5) * 3; b.y0 = 0; b.y1 = 2; CW.place(b, b.x, b.z);
    b.shove = (dx, dz) => { b.x += dx; b.z += dz; };
    B.push(b);
  }
  const av = {}, o = { x: 0, z: 0, r: 0.4, y0: 0, y1: 1.8 }, frames = 160; let t = 0, best = 1e9;   // (best 40-frame batch: the machine is shared)
  for (let f = 0; f < frames; f++) {
    if (f % 40 === 0 && f) { best = Math.min(best, t / 40); t = 0; }
    const t0 = performance.now();
    for (const b of B) { CW.place(b, b.x + b.vx / 30, b.z + b.vz / 30); CW.avoid(b, b.vx || 1, b.vz || 0, Math.hypot(b.vx, b.vz), av); }
    CW.step(1 / 30);
    for (let i = 0; i < 1000; i++) { const b = B[i % 600]; o.x = b.x + 0.5; o.z = b.z; CW.pushCircle(o); }
    t += performance.now() - t0;
  }
  const per = Math.min(best, t / 40);
  console.log(`      whole war: 600 moving bodies + 3200 trees: ${f2(per)} ms/frame (place + avoid for all, step, 1000 circle pushes); ${CW.stats.pairs} pairs, ${CW.stats.contacts} contacts last step`);
  check(per < 4, 'cost: the whole-war synthetic load under 4 ms/frame in node', `${f2(per)} ms`);
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
