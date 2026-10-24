// rotary.js - the war's AI rotorcraft and the troops they carry, behind a few hooks in war.js:
//   'drone'     -> CH-46E Sea Knight + 13 Marines (ours; command 1)        u.kind = 'ch46'
//   'transport' -> MV-22B Osprey + machine troopers (RUNAWAY)              u.kind = 'mv22'
//   'gunship'   -> RW-3 WASP ducted-fan attack drone (RUNAWAY)             u.kind = 'wasp'
//   'squad'     -> the troops on the ground: they hold the pad (capture), fire, die figure by figure
// The unit objects keep war.js's contract (p, v, yaw, hp, hpMax, r, side, target, landed, dying, dead, mesh), so the
// unit list, the targeting, the damage and the capture code in war.js work on them unchanged; everything that moves
// is flown physically by its flight model and AI (see ch46unit.js, mv22unit.js, waspunit.js).
import * as THREE from 'three';
import { createCH46Unit } from './ch46unit.js';
import { createMV22Unit } from './mv22unit.js';
import { createWaspUnit } from './waspunit.js';
import { createSquad, padSlots } from './squad.js';
import { attitude } from './rb.js';
import { stateOf } from './pilot.js';
import { createRotorSound } from './rotorsound.js';
import { smokeBlocks, rwrAdd } from '../../defence/cm.js';   // ngc/cmpolish: smoke hides targets; WASPs on the radar warning picture
// ngc/cmpolish WASP balance (game values; scenes/waspbalance.mjs): 6 hp and a 2.2 m hit sphere (were the saucer's 3 and 2.8 m: the ALBATROSS's guns
// killed them before they fired), aim error that grows with range (was a flat 0.025 rad: every pulse hit a hovering
// Huey at 100 m), about a third of the hunters lie in ambush (was half)
export const WASP_TUNE = { hp: 6, r: 2.2, aim: 0.03, aimPerM: 0.0006, ambush: 0.35 };   // live: war.rotary.waspTune (the balance scene sweeps it)

const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const _v = new THREE.Vector3(), _att = {};
// deck spots on a carrier (local x, z): the CH-46s take the middle and bow spots (the Huey lives on the aft one)
const SPOTS = { ch46: [[-2, -2], [-2, -35]], mv22: [[-1, -36], [-1, 34]] };

export function createRotary(ctx) {
  const { W, scene, fx, terrainH, isWater } = ctx;
  const root = new THREE.Group(); root.name = 'rotary'; scene.add(root);
  const R = { squads: [], time: 0 }, crews = [];   // crews: transports with a deck crew / stick out (embark.js), cleared when they go
  // the environment the flight models fly in: terrain, sea, ship decks (moving)
  const groundY = (x, z) => Math.max(terrainH(x, z), 0, W.deckY(x, z));
  const env = { groundY, water: (x, z) => isWater(x, z) && W.deckY(x, z) < -1e8, surfVel: (x, z) => W.surfVel(x, z) };
  const world = { groundY, floorAlong(x, z, ux, uz, L) { let m = groundY(x, z); for (let s = 12; s <= L; s += 12) m = Math.max(m, groundY(x + ux * s, z + uz * s)); return m; } };

  // ---- where to sit down: a deck spot on our carrier (moving) or the home island pad
  function carrierOf(side) { const c = side === 1 ? W.carrier : W.enemyCarrier; return c && c.sinking === undefined && !(c.sky && c.sky.up) ? c : null; }
  function deckSpot(c, lx, lz) {
    const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), x = c.p.x + lx * cs + lz * sn, z = c.p.z - lx * sn + lz * cs;
    return { x, y: 8 + Math.max(0, c.p.y), z, hdg: c.yaw, vx: c.v.x + c.w * (z - c.p.z), vz: c.v.z - c.w * (x - c.p.x) };
  }
  function homePad(side) { const I = W.islands.find(I => I.kind === 'hq' && I.owner0 === side); return { x: I.pad.x + 14, y: I.pad.h, z: I.pad.z, hdg: 0, vx: 0, vz: 0 }; }
  function freeSpot(kind, side) {   // a deck spot nobody of ours is sitting on
    const c = carrierOf(side); if (!c) return null;
    for (const [lx, lz] of SPOTS[kind]) { const s = deckSpot(c, lx, lz); if (!W.units.some(u => u.rot && Math.hypot(u.p.x - s.x, u.p.z - s.z) < 14 && u.p.y < s.y + 6)) return { lx, lz, ...s }; }
    return null;
  }
  // a landing zone beside the island's pad: room for the rotors and the fuselage clear of every building, flat ground,
  // tail toward the pad (the ramp opens onto it). foot = local circles [x, z, r] (nose -z) that must stay clear.
  function chooseLZ(I, foot, offs = [18, 16, 21, 13, 0]) {
    const p = I.pad; let best = null;
    for (const off of offs) for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, x = p.x + Math.cos(a) * off, z = p.z + Math.sin(a) * off;
      const hdgs = off ? [Math.atan2(-Math.cos(a), -Math.sin(a)) + Math.PI] : [0, Math.PI / 2, Math.PI, -Math.PI / 2];   // nose away from the pad
      for (const hdg of hdgs) {
        const cs = Math.cos(hdg), sn = Math.sin(hdg); let ok = true, flat = 0;
        for (const [lx, lz, r] of foot) {
          const wx = x + lx * cs + lz * sn, wz = z - lx * sn + lz * cs;
          for (const s of I.structs) if (Math.hypot(s.x - wx, s.z - wz) < s.r * 0.9 + r + 1) { ok = false; break; }
          if (!ok) break;
          const gy = groundY(wx, wz); if (r < 3) { flat = Math.max(flat, Math.abs(gy - p.h)); if (isWater(wx, wz)) ok = false; }
        }
        if (!ok || flat > 1.2) continue;
        const score = Math.abs(off - 18) + flat * 4;
        if (!best || score < best.score) best = { x, y: p.h, z, hdg, vx: 0, vz: 0, score };
      }
      if (best && off === offs[0]) break;
    }
    return best || { x: p.x, y: p.h, z: p.z, hdg: 0, vx: 0, vz: 0 };
  }
  const CH46_FOOT = [[0, 0, 1.8], [0, -4.5, 1.6], [0, 4.5, 1.6], [0, -5.08, 7.62], [0, 5.08, 7.62]];
  const MV22_FOOT = [[0, 0, 1.8], [0, -5.5, 1.6], [0, 5.5, 1.6], [-7.0, 0, 5.9], [7.0, 0, 5.9]];

  // ---- make: called from war.js makeAir(); returns a unit or null (= not ours, war builds it)
  R.make = (type, side, x, y, z, extra = {}) => {
    if (type === 'drone') return makeCH46(side, extra);
    if (type === 'transport') return makeMV22(side, extra);
    if (type === 'gunship') return makeWasp(side, x, y, z, extra);
    return null;
  };
  function makeCH46(side, extra) {
    const sp = freeSpot('ch46', side), start = sp ? { x: sp.x, y: sp.y, z: sp.z, yaw: sp.hdg } : { ...homePad(side), yaw: 0 };
    const I = extra.target, lz = (R.ground && R.ground.hotLZ(I, side, CH46_FOOT, chooseLZ)) || chooseLZ(I, CH46_FOOT);   // GROUND WAR hook: a hot island: land away from the fighting
    const u = { type: 'drone', kind: 'ch46', side, p: new THREE.Vector3(start.x, start.y + 2, start.z), v: new THREE.Vector3(), yaw: start.yaw, hp: 10, hpMax: 10, r: 7, cd: 0, ph: 0, state: 'go', landed: false, ...extra };
    const spot = sp ? [sp.lx, sp.lz] : null;
    const home = () => { const c = carrierOf(side); return c && spot ? deckSpot(c, spot[0], spot[1]) : homePad(side); };
    const U = createCH46Unit({ parent: scene, env, world, lz: () => u.lz, home, pad: I.pad, start, modex: 1 + Math.floor(rnd(30)), squad: 13, board: true, deck: spot ? home : null,   // the stick boards on deck (embark.js)
      onParked: () => { u.dead = true; u.stowed = true; if (!U.squadExternal) U.squad.dispose(); } });
    u.lz = lz; u.rot = U; u.mesh = U.model.group; U.AI.hooks.fouled = () => fouled(u); crews.push(u);
    // the Marines become a ground unit of their own when they come off the ramp
    const unload = U.AI.hooks.unload;
    U.AI.hooks.unload = (ai, dt) => { const done = unload(ai, dt); if (U.deployed && !u.squadUnit) { u.squadUnit = R.ground ? R.ground.landing(u, U, side, u.target) : addSquad(U.squad, side, u.target, 9);   /* GROUND WAR hook: the Marines fight as a squad */ U.squadExternal = true; } return done; };
    return u;
  }
  function fouled(u) { const z = u.lz; return !!z && W.units.some(o => o !== u && o.rot && o.rot.S && o.kind !== 'wasp' && !o.dead && Math.hypot(o.p.x - z.x, o.p.z - z.z) < 16 && o.p.y < z.y + 15); }
  // RUNAWAY MV-22 with 12 machine troopers: off the KRAKEN (or IRONHOLD's pad), takes islands for the enemy commander
  function makeMV22(side, extra) {
    const sp = freeSpot('mv22', side), start = sp ? { x: sp.x, y: sp.y, z: sp.z, yaw: sp.hdg } : { ...homePad(side), yaw: 0 };
    const u = { type: 'transport', kind: 'mv22', side, p: new THREE.Vector3(start.x, start.y + 2, start.z), v: new THREE.Vector3(), yaw: start.yaw, hp: 12, hpMax: 12, r: 7.5, cd: 0, ph: 0, state: 'go', landed: false, ...extra };
    const spot = sp ? [sp.lx, sp.lz] : null;
    const home = () => { const c = carrierOf(side); return c && spot ? deckSpot(c, spot[0], spot[1]) : homePad(side); };
    u.lz = (R.ground && R.ground.hotLZ(u.target, side, MV22_FOOT, chooseLZ)) || chooseLZ(u.target, MV22_FOOT);   // GROUND WAR hook
    const U = createMV22Unit({ parent: scene, env, world, lz: () => u.lz, home, pad: u.target.pad, start, squad: 12, board: true, deck: spot ? home : null,
      onParked: () => { u.dead = true; u.stowed = true; if (!U.squadExternal) U.squad.dispose(); } });
    u.rot = U; u.mesh = U.model.group; U.AI.hooks.fouled = () => fouled(u); crews.push(u);
    const unload = U.AI.hooks.unload;
    U.AI.hooks.unload = (ai, dt) => { const done = unload(ai, dt); if (U.deployed && !u.squadUnit) { u.squadUnit = R.ground ? R.ground.landing(u, U, side, u.target) : addSquad(U.squad, side, u.target, 10);   /* GROUND WAR hook: the troopers come off the ramp as STRIDERs */ U.squadExternal = true; } return done; };
    return u;
  }
  // RW-3 WASP (replaces the saucer gunship): war.js's spawnGunship sets id / home / raid / target after this returns
  const world2 = { ...world, los(ax, ay, az, bx, by, bz) { const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 8); for (let i = 1; i < n; i++) { const k = i / n; if (groundY(ax + (bx - ax) * k, az + (bz - az) * k) > ay + (by - ay) * k) return false; } return !smokeBlocks(ax, ay, az, bx, by, bz); } };   // CM: smoke too
  function makeWasp(side, x, y, z, extra) {
    const u = { type: 'gunship', kind: 'wasp', side, p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(), yaw: rnd(6.283), hp: WASP_TUNE.hp, hpMax: WASP_TUNE.hp, r: WASP_TUNE.r, cd: 0, ph: rnd(6.28), state: 'go', ...extra };
    const U = createWaspUnit({ parent: scene, env, world: world2, start: { x, y, z, yaw: u.yaw }, home: [x, z], id: Math.random(), speed: 90,
      fire: (p, d, U) => {   // game level: the war's rounds, cyan, a little spread
        const T = U.target, e = WASP_TUNE.aim + WASP_TUNE.aimPerM * (T ? Math.hypot(T.x - p.x, T.y - p.y, T.z - p.z) : 60); const b = ctx.shoot('b', side, p.x, p.y, p.z, (d.x + rnd(-e, e)) * 90, (d.y + rnd(-e, e)) * 90, (d.z + rnd(-e, e)) * 90, 2.2); b.col = [0.55, 0.95, 1];
        fx.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.08, 1.6, 1.2, 0.6, 0.95, 1, 1);
        if (ctx.hear(p.x, p.y, p.z, 260) > 0) ctx.sfx.blip?.(1800, 2600, 0.07, 'sawtooth', 0.04 * ctx.hear(p.x, p.y, p.z, 260));
      } });
    u.rot = U; u.mesh = U.model.group;
    return u;
  }
  function addSquad(Q, side, I, capTime) {
    const s = { type: 'squad', side, p: new THREE.Vector3(I.pad.x, I.pad.h + 1, I.pad.z), v: new THREE.Vector3(), yaw: 0, hp: Q.alive, hpMax: Q.alive, r: 7, cd: rnd(1, 3),
      target: I, landed: false, capTime, mesh: new THREE.Object3D(), squad: Q, rot: { squad: true } };
    scene.add(s.mesh); W.units.push(s); R.squads.push({ Q, u: s, I, side, t: 0 });
    return s;
  }

  // ---- per-frame update of one unit (war.js updateAir hook): returns true when handled
  R.update = (u, dt, pl, peace) => {
    if (u.type === 'squad') return updateSquad(u, dt, pl, peace);
    const U = u.rot; R.time = W.time;
    // placed from outside (a script, a test) since our last write: the flight model follows
    if (u._lp && U.S && u.p.distanceToSquared(u._lp) > 0.25) { const b = U.S.body; b.pos[0] = u.p.x; b.pos[1] = u.p.y; b.pos[2] = u.p.z; b.vel[0] = u.v.x; b.vel[1] = u.v.y; b.vel[2] = u.v.z; }
    if (u.kind === 'ch46' || u.kind === 'mv22') updateTransport(u, U, dt);
    else if (u.kind === 'wasp') updateWasp(u, dt, pl, peace);
    (u._lp || (u._lp = new THREE.Vector3())).copy(u.p);
    return true;
  };
  function updateTransport(u, U, dt) {
    const S = U.S, I = u.target;
    // mission changes: target taken by us already before the Marines got there -> home with them aboard
    if (!u.dying && I && I.owner === u.side && !u.reinforce && !U.deployed && !U.AI.homing()) {
      // the enemy commander re-tasks its Osprey to the next island; ours bring the Marines home
      const next = u.side === 2 && W.pickExpansion ? W.pickExpansion() : null;
      if (next && !next.cave) { u.target = next; u.lz = chooseLZ(next, MV22_FOOT); U.setPad && U.setPad(next.pad); if (['ground', 'descend'].includes(U.AI.phase)) U.AI.set('lift2'); else U.AI.set('transit'); }
      else { U.AI.goHome(); u.target = null; }
    }
    // damage: below half an engine quits (single-engine: abort, go home); dying = both out, autorotate down
    if (!u.engHit && u.hp < u.hpMax * 0.5 && !u.dying) {
      u.engHit = true; S.eng[Math.random() < 0.5 ? 0 : 1].ok = false;
      if (u.kind === 'ch46') { if (!U.deployed) U.AI.goHome(); ctx.feed(`SEA KNIGHT HIT  -  ONE ENGINE OUT${U.deployed ? '' : ', RETURNING'}`, 'bad'); }   // the Osprey's cross-shaft keeps both rotors turning: it presses on
    }
    if (u.dying && !u.crashing) startCrash(u, U);
    if (u.crashing) crashStep(u, U, dt); else U.update(dt, W.time);
    const b = S.body; u.p.set(b.pos[0], b.pos[1], b.pos[2]); u.v.set(b.vel[0], b.vel[1], b.vel[2]); attitude(b.q, _att); u.yaw = _att.yaw;
    if (U.dead && !u.crashed) crash(u, U);
    if (u.hp < u.hpMax * 0.6 && Math.random() < 0.5) fx.trail(u.p.x + rnd(-1, 1), u.p.y + 2.5, u.p.z + rnd(-1, 1), 1.2);
    if (u.kind === 'ch46' && !u.crashing) doorGuns(u, U, dt);
    if (u.kind === 'ch46') downwash(u, S.agl, (S.rf.T + S.ra.T) / 2, 7.62); else if (S.nac > 1.2) downwash(u, S.agl, (S.rR.T + S.rL.T) / 2, 9);
  }
  // the CH-46's door gunners (M2 .50 cal, right crew door and left window): near the zone they engage enemies below
  // within ~150 m on their own side of the aircraft, in short bursts (game level: the war's rounds)
  const GUN_PHASES = ['transit', 'waveoff', 'hoverchk', 'descend', 'ground', 'lift2', 'lift'];
  function doorGuns(u, U, dt) {
    u.gT = (u.gT || 0) - dt; u.gB = (u.gB || 0) - dt;
    if (u.gT <= 0) {   // look for a target a few times a second
      u.gT = 0.4; u.gTgt = null;
      if (GUN_PHASES.includes(U.AI.phase) && !(U.AI.phase === 'transit' && U.AI.cmd.dist > 450)) {
        let bd = 150;
        for (const o of W.units) if (o.side !== u.side && o.side !== 0 && o.p && !o.dead && !o.dying && !o.dims && o.p.y < u.p.y + 8) { const d = o.p.distanceTo(u.p); if (d < bd) { bd = d; u.gTgt = o; } }
      }
      if (!u.gTgt) { U.gunAim = null; U.gunFiring = false; }
    }
    const T = u.gTgt; if (!T || T.dead) { U.gunFiring = false; return; }
    const g = U.model.group, side = (() => { _v.copy(T.p).sub(u.p); const c = Math.cos(u.yaw), s = Math.sin(u.yaw); return _v.x * c - _v.z * s; })();   // + = right of the nose
    const gp = U.model.GUNS[side > 0 ? 0 : 1]; _v.copy(gp); g.localToWorld(_v);
    const sx = _v.x, sy = _v.y, sz = _v.z, d = Math.hypot(T.p.x - sx, T.p.y - sy, T.p.z - sz), t = d / 100;
    _v.set(T.p.x + (T.v ? T.v.x * t : 0) - sx, T.p.y + 0.8 - sy, T.p.z + (T.v ? T.v.z * t : 0) - sz).normalize();
    (U.gunAim || (U.gunAim = new THREE.Vector3())).copy(_v);
    if (u.gB <= 0) { u.gB = U.gunFiring ? rnd(1.2, 2.5) : rnd(0.6, 1.2); U.gunFiring = !U.gunFiring; }   // bursts
    u.gC = (u.gC || 0) - dt;
    if (U.gunFiring && u.gC <= 0) {
      u.gC = 0.14; const e = 0.03 + d / 5000;
      ctx.shoot('b', u.side, sx + _v.x * 1.9, sy + _v.y * 1.9, sz + _v.z * 1.9, (_v.x + rnd(-e, e)) * 100 + u.v.x, (_v.y + rnd(-e, e)) * 100 + u.v.y, (_v.z + rnd(-e, e)) * 100 + u.v.z, 1.6);
      if (ctx.hear(sx, sy, sz, 260) > 0.05 && Math.random() < 0.6) ctx.sfx.blip?.(420, 120, 0.05, 'square', 0.06 * ctx.hear(sx, sy, sz, 260));
    }
  }
  // shot down: both engines out (or a rotor gone), the AI pilot autorotates for the ground, the wreck burns
  function startCrash(u, U) {
    u.crashing = true; u.crashT = 0; const S = U.S; S.eng[0].ok = S.eng[1].ok = false;
    u.catastrophic = Math.random() < 0.4; if (u.catastrophic) S.mods = { liftA: 0.2 };
    if (!U.squadExternal) { U.squad.killAll(); ctx.feed(u.side === 1 ? 'SEA KNIGHT GOING DOWN  -  MARINES ABOARD' : 'ENEMY OSPREY GOING DOWN  -  TROOPERS ABOARD', u.side === 1 ? 'bad' : 'good'); }
  }
  const _st = {};
  function crashStep(u, U, dt) {
    const S = U.S, P = U.P; u.crashT += dt;
    // autorotation: collective holds rotor rpm, nose for ~70 kt, flare low, cushion at the bottom
    stateOf(S.body, _st);
    const flare = S.agl < 25, cushion = S.agl < 5, fx_ = -Math.sin(_st.yaw), fz = -Math.cos(_st.yaw);
    let c;
    if (u.kind === 'ch46') {
      P.i.coll = Math.max(0, Math.min(1, P.i.coll + (S.rpm - 1.0) * 1.2 * dt));
      const coll = cushion ? Math.min(1, P.i.coll + 0.4) : P.i.coll, vf = flare ? 0 : 36;
      c = P.step(_st, dt, { vx: fx_ * vf, vz: fz * vf, hdg: _st.yaw, collFix: coll, pitch: flare ? 0.25 : undefined });
    } else {
      const v = Math.hypot(_st.vx, _st.vz);
      c = P.step(_st, dt, { vx: fx_ * v, vz: fz * v, vy: -8, hdg: _st.yaw, collFix: cushion ? 0.6 : 0.15 });
    }
    c.eng0 = c.eng1 = false;
    const e = S.step(dt, c, env); U.sync(dt, W.time); if (!U.squadExternal) U.squad.update(dt, W.time);
    if (S.dead || e === 'land' || e === 'hardland' || e === 'crash' || u.crashT > 40 || (S.body.contacts && u.crashT > 2)) U.dead = U.dead || 'crash';
    if (Math.random() < 0.8) { fx.trail(u.p.x, u.p.y + 2, u.p.z, 1.6); fx.add.spawn(u.p.x, u.p.y + 2, u.p.z, rnd(-1, 1), rnd(0, 2), rnd(-1, 1), rnd(0.3, 0.6), 1.6, 0.5, 1, rnd(.4, .6), .1, 0.9, -1, 1); }
  }
  function crash(u, U) {
    u.crashed = true; const gy = groundY(u.p.x, u.p.z), wet = env.water(u.p.x, u.p.z);
    fx.explode(u.p.x, gy + 1, u.p.z, 3, { fire: wet ? 0 : 80, oil: wet, debris: 14, color: u.side === 1 ? 0x46553b : 0x5a5650 });
    ctx.boomAt(u.p.x, gy, u.p.z, 1.1); ctx.blast(u.p.x, gy + 1, u.p.z, 9, 4, u.side);
    u.dead = true; u.dying = true;
    if (!U.squadExternal) U.squad.dispose();   // the Marines aboard died with her
  }
  // dust or spray thrown out under a rotor in ground effect (the Huey's wash, scaled by disc loading)
  function downwash(u, agl, T, Rr) {
    if (agl > Rr * 2.5 || T < 5000) return;
    const k = (1 - agl / (Rr * 2.5)) * Math.min(1, T / 60000), wet = env.water(u.p.x, u.p.z), gy = groundY(u.p.x, u.p.z);
    for (let i = 0; i < 4; i++) if (Math.random() < k) {
      const a = rnd(6.283), sp = rnd(10, 22), rr = rnd(2, Rr);
      if (wet) fx.mix.spawn(u.p.x + Math.cos(a) * rr, gy + 0.3, u.p.z + Math.sin(a) * rr, Math.cos(a) * sp, rnd(0.5, 2.5), Math.sin(a) * sp, rnd(0.6, 1.1), 0.7, 3, .85, .92, .97, 0.4, 2, 1.4, 0.3);
      else fx.mix.spawn(u.p.x + Math.cos(a) * rr, gy + 0.3, u.p.z + Math.sin(a) * rr, Math.cos(a) * sp, rnd(0.5, 2.5), Math.sin(a) * sp, rnd(0.6, 1.2), 0.8, 3.4, .55, .48, .36, 0.45, 1.5, 1.5, 0.3);
    }
  }

  // ---- WASPs: the old gunship's targeting (hunt the player when close, else our drones / escorts / squads near, else
  // the raid target, else guard home), flown by the WASP mind: strafing passes, standoff sniping, ambush, swarm rings
  const _tg = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  function updateWasp(u, dt, pl, peace) {
    const U = u.rot;
    if (u.dying) {   // fans dead: it tumbles out of the sky trailing fire
      U.S.mods = { power: 0 }; U.S.body.w[0] += rnd(-3, 3) * dt; U.S.body.w[1] += rnd(-3, 3) * dt;
      U.update(dt, W.time, null, { peace: true });
      fx.add.spawn(u.p.x, u.p.y, u.p.z, rnd(-1, 1), rnd(0, 2), rnd(-1, 1), rnd(0.25, 0.5), 1.4, 0.4, 0.6, 0.9, 1, 0.9, -1, 1); fx.trail(u.p.x, u.p.y, u.p.z, 1.1);
      const gy = groundY(u.p.x, u.p.z);
      if (U.dead || u.p.y < gy + 1 || (u.dieT = (u.dieT || 0) + dt) > 12) {
        const wet = env.water(u.p.x, u.p.z); fx.explode(u.p.x, Math.max(gy, u.p.y - 1), u.p.z, 1.8, { fire: wet ? 0 : 30, oil: wet, debris: 8, color: 0xc8c6be }); ctx.boomAt(u.p.x, gy, u.p.z, 0.8); ctx.blast(u.p.x, gy + 1, u.p.z, 5, 2, u.side); u.dead = true;
      }
    } else {
      u.retarget = (u.retarget || 0) - dt;
      if (u.retarget <= 0) {
        u.retarget = 1;
        const pd = pl.alive && !pl.inCave ? pl.pos.distanceTo(u.p) : 1e9;
        // ngc/cmpolish: an ambusher (WASP_TUNE.ambush of them) picks the player up further out when he is flying its way
        const ambusher = (u.id || 0) > 6.283 * (1 - WASP_TUNE.ambush), closing0 = pd < 1e8 ? -((pl.pos.x - u.p.x) * pl.vel.x + (pl.pos.z - u.p.z) * pl.vel.z) / Math.max(1, pd) : 0;
        if (pd < (u.target === 'player' ? 260 : 170) || (ambusher && pd < 320 && (closing0 > 4 || u.ambush))) u.target = 'player'; else if (u.target === 'player') u.target = null;
        if (u.target && u.target !== 'player' && (u.target.dead || u.target.gone || (u.target.side !== undefined && u.target.side === u.side))) u.target = null;
        if (!u.target) {
          let best = null, bd = 160;
          for (const o of W.units) if (o.side !== u.side && o.side !== 0 && !o.dead && !o.dying && (o.type === 'drone' || o.type === 'escort' || o.type === 'squad' || o.type === 'transport') && o.p.distanceTo(u.p) < bd) { best = o; bd = o.p.distanceTo(u.p); }
          if (u.side === 2 && W.ext) for (const o of W.ext) if (!o.dead && o.p.distanceTo(u.p) < bd) { best = o; bd = o.p.distanceTo(u.p); }   // COMMANDER: the fleet's units out (parked, AI-flown)
          if (best) u.target = best; else if (u.raid) u.target = u.raid.dead || u.raid.gone || u.raid.side === u.side ? (u.raid = null) : u.raid;
        }
        // swarm slots: the WASPs on the same target share a ring
        const mates = W.units.filter(o => o.kind === 'wasp' && !o.dead && !o.dying && o.target === u.target && u.target);
        U.AI.o.slot = Math.max(0, mates.indexOf(u)); U.AI.o.slots = Math.max(1, mates.length); U.AI.o.home = u.home || U.AI.o.home;
        // some lie in wait instead of charging - when the player is coming their way
        u.ambush = u.target === 'player' && ambusher && pd > 120 && (closing0 > 4 || (u.ambush && closing0 > -2));   // lie in wait while he keeps coming
      }
      let tgt = null;
      if (u.target === 'player') { _tg.x = pl.pos.x; _tg.y = pl.pos.y; _tg.z = pl.pos.z; _tg.vx = pl.vel.x; _tg.vy = pl.vel.y; _tg.vz = pl.vel.z; tgt = _tg; }
      else if (u.target && u.target.p) { const t = u.target.p, v = u.target.v || t; _tg.x = t.x; _tg.y = t.y; _tg.z = t.z; _tg.vx = v === t ? 0 : v.x; _tg.vy = v === t ? 0 : v.y; _tg.vz = v === t ? 0 : v.z; tgt = _tg; }
      else if (u.target) { const s = u.target; _tg.x = s.x; _tg.y = s.y + (s.h || 2); _tg.z = s.z; _tg.vx = _tg.vy = _tg.vz = 0; tgt = _tg; }
      const others = W.units.filter(o => o.kind === 'wasp' && o !== u && !o.dead && o.p.distanceToSquared(u.p) < 900).map(o => ({ x: o.p.x, y: o.p.y, z: o.p.z, vx: o.v.x, vy: o.v.y, vz: o.v.z }));
      if (u.target === 'player' && pl.alive && !pl.inCave) {   // CM: its sensor on the player shows on the radar warning picture (with line of sight)
        const d = pl.pos.distanceTo(u.p); if (d < 260 && world2.los(u.p.x, u.p.y, u.p.z, pl.pos.x, pl.pos.y + 1, pl.pos.z)) rwrAdd('W', Math.atan2(u.p.x - pl.pos.x, -(u.p.z - pl.pos.z)), d, Math.max(0, 1 - d / 260), d < 130, U.firing > 0);
      }
      U.update(dt, W.time, tgt, { reach: 110, ambush: u.ambush, peace: peace || (u.target === 'player' && !pl.alive), others, burstGap: Math.max(1.0, 2.4 - W.time / 400) });
    }
    const b = U.S.body; u.p.set(b.pos[0], b.pos[1], b.pos[2]); u.v.set(b.vel[0], b.vel[1], b.vel[2]); attitude(b.q, _att); u.yaw = _att.yaw;
    if (u.hp < u.hpMax && Math.random() < 0.3) fx.trail(u.p.x, u.p.y, u.p.z, 0.7);
    if (!u.dying && U.dead) { u.dying = true; u.crashWhy = U.dead; }   // flew into something (kept for the tests)
  }

  // ---- squads on the ground: hold the pad, shoot at enemies near, lose figures to hits
  function updateSquad(u, dt, pl, peace) {
    const Q = u.squad;
    if (u.dying || u.hp <= 0) { Q.killAll(); u.dead = true; ctx.feed(u.side === 1 ? `${u.target.name}: MARINE SQUAD WIPED OUT` : `${u.target.name}: ENEMY LANDING PARTY DESTROYED`, u.side === 1 ? 'bad' : 'good'); if (u.side === 2) ctx.addScore(300); return true; }
    const lost = Q.alive - Math.ceil(u.hp); if (lost > 0) Q.hit(lost);
    if (Q.center(_v)) u.p.set(_v.x, _v.y + 1, _v.z);
    u.landed = Q.holding > 0 && Math.hypot(u.p.x - u.target.pad.x, u.p.z - u.target.pad.z) < 14;
    // small arms: holding figures fire at the nearest enemy aircraft or troops in reach (game level)
    u.cd -= dt;
    if (u.cd <= 0 && Q.holding && !(peace && u.side === 2)) {
      u.cd = rnd(0.5, 1.4) * 6 / Math.max(1, Q.holding);
      let best = null, bd = u.side === 1 ? 130 : 110;
      for (const o of W.units) if (o.side !== u.side && o.side !== 0 && o.p && !o.dims && !o.dead && !o.dying) { const d = o.p.distanceTo(u.p); if (d < bd) { bd = d; best = o; } }
      if (!best && u.side === 2 && pl.alive && !pl.inCave && pl.pos.distanceTo(u.p) < 110) best = { p: pl.pos, v: pl.vel };
      if (best) {
        const f = Q.figs.find(F => F.st === 'hold' && Math.random() < 0.5) || Q.figs.find(F => F.st === 'hold');
        const sx = f.x, sy = f.y + 1.3, sz = f.z, t = bd / 90, e = 0.035 + bd / 4000;
        _v.set(best.p.x + best.v.x * t - sx, best.p.y + best.v.y * t - sy, best.p.z + best.v.z * t - sz).normalize();
        ctx.shoot('b', u.side, sx, sy, sz, (_v.x + rnd(-e, e)) * 90, (_v.y + rnd(-e, e)) * 90, (_v.z + rnd(-e, e)) * 90, 1.6);
        fx.add.spawn(sx + _v.x * 0.9, sy + _v.y * 0.9, sz + _v.z * 0.9, 0, 0, 0, 0.05, 0.6, 0.3, 1, .85, .5, 1);
        if (ctx.hear(sx, sy, sz, 220) > 0.05 && Math.random() < 0.5) ctx.sfx.blip?.(u.side === 1 ? 700 : 1300, 200, 0.06, 'square', 0.05 * ctx.hear(sx, sy, sz, 220));
      }
    }
    return true;
  }
  // ---- after the war is done with a unit: garrisons stay on their island, the dead lie a while
  // sound: the nearest of each type get a voice (list objects reused: no per-frame garbage)
  const snd = ctx.sfx ? createRotorSound(ctx.sfx) : null, sndList = [];
  function sound(dt) {
    if (!snd || !ctx.ear) return;
    let n = 0;
    for (const u of W.units) {
      if (!u.rot || !u.rot.S || u.dead) continue;
      const S = u.rot.S, p = sndList[n] || (sndList[n] = {}); n++;
      p.kind = u.kind; p.x = u.p.x; p.y = u.p.y; p.z = u.p.z; p.vx = u.v.x; p.vy = u.v.y; p.vz = u.v.z;
      if (u.kind === 'ch46') { p.nr = S.rpm; p.load = (S.rf.T + S.ra.T) / (S.mass * 9.81); }
      else if (u.kind === 'mv22') { p.nr = u.rot.folding ? 0 : S.rpm; p.load = (S.rR.T + S.rL.T) / (S.mass * 9.81); p.nac = S.nac; }
      else { p.nr = u.dying ? 0.1 : S.power / 260e3; const tg = !!u.rot.target; p.chirp = tg && !u._hadTgt; u._hadTgt = tg; }
    }
    sndList.length = n; snd.update(sndList, ctx.ear, dt);
  }
  R.tick = (dt) => {
    R.time = W.time; sound(dt);
    for (let i = crews.length - 1; i >= 0; i--) { const u = crews[i]; if (u.dead || u.gone || !W.units.includes(u)) { if (u.rot.embark) u.rot.embark.dispose(); if (u.rot.squad.state === 'boarding') u.rot.squad.killAll(); crews.splice(i, 1); } }
    for (let i = R.squads.length - 1; i >= 0; i--) {
      const s = R.squads[i], Q = s.Q;
      if (s.u.dead && !s.gone) { s.gone = true; if (Q.alive && s.I.owner === s.side) Q.garrison(); }
      if (s.gone) {
        s.t += dt;
        if (Q.state === 'garrison' && s.I.owner !== s.side) { Q.killAll(); Q.state = 'dead'; }   // the island fell: the garrison is gone
        if ((Q.state !== 'garrison' && s.t > 45) || (Q.state === 'garrison' && R.squads.filter(o => o.I === s.I && o.Q.state === 'garrison').length > 1 && s.t > 60)) { Q.dispose(); R.squads.splice(i, 1); continue; }
      }
      Q.update(dt, W.time);
      if (s.side === 2) Q.root.visible = s.u.dead ? true : s.u.mesh.visible;
    }
  };
  R.reset = () => { for (const s of R.squads) s.Q.dispose(); R.squads.length = 0; for (const u of crews) { if (u.rot.embark) u.rot.embark.dispose(); u.rot.squad.dispose(); } crews.length = 0; };
  R.snd = snd;
  R.chooseLZ = chooseLZ; R.env = env; R.root = root; R.FOOT = { ch46: CH46_FOOT, mv22: MV22_FOOT }; R.waspTune = WASP_TUNE;   // (FOOT: the GROUND WAR's hot-LZ choice)
  return R;
}
