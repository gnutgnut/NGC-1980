// THE GROUND WAR: the battles on the islands as a pure simulation (no THREE, no DOM; runs in node for the bench and
// the balance runs, and inside war.js through groundwar.js). It is runaway/sandbox.js's host loop lifted into the
// archipelago: the same unit adapters, AI hand-offs, fire cadences, projectiles and hit-info contract, with
//   * one BATTLE per island (its own baked map, a RUNAWAY squad AI and a Marine squad AI over the same world query),
//   * real 1980 Marines (marine.js bodies + marineai.js) instead of the sandbox's dummies,
//   * seized MBTs on trackfm (mbttrack.js), RW-7s crossing the sea (a hovercraft's transit), units joining battles,
//   * level of detail: a battle far from the camera thinks at 5 Hz and its STRIDERs / MBTs move kinematically along
//     what the AI wants (the balance sims and the MBT tracks come back where they left off when the camera returns),
//   * the outside world (the player, AA sites, aircraft) through host hooks, so this file never imports war.js.
//
//   const GS = createGroundSim({ terrainH, islands, seed, hooks })
//   hooks: { targetsFor(B, side) -> [targets in the squad-AI format, ids unique],
//            extSeg(p, ax, ay, az, bx, by, bz) -> { t, apply() } | null   (side-2 rounds vs the player / AA / aircraft)
//            extBlast(x, y, z, r, power, side)                            (side-2 blasts on the outside world) }
//   GS.battle(I) -> B;  GS.addStrider / addHover / addMBT / addMarine(B | null, ...) -> unit
//   GS.squadRW(B, units, order), GS.squadMarines(B, units, order) -> squad;  GS.order(squad, order)
//   GS.join(B, unit) (a unit arriving joins the island's machines);  GS.transit(unit, route, B)
//   GS.step(dt, { cam: {x, y, z}, peace }) -> events;  GS.segHit(...) / GS.blast(...) for the war's own rounds
import { createIslandMaps } from './gwmap.js';
import { createMarineAI, MAR_T } from './marineai.js';
import { createMarine, MARINE, segCyl } from './marine.js';
import { createTrackDrive } from './mbttrack.js';
import { createSquadAI } from '../runaway/squadai.js';
import { createStrider, STRIDER } from '../runaway/strider.js';
import { createHoverTank, RW7 } from '../runaway/hovertank.js';
import { createMBT, MBT } from '../runaway/mbt.js';
import { AMMO, normalizeHit } from '../runaway/hit.js';
import { WPN } from '../runaway/sandbox.js';
import { rng } from '../runaway/rwworld.js';
// ngc/infdepth: the near Marines on the real rifleman + medical sims, and casualty care (corpsman, buddy aid, CCP)
import { createRichMarine, ROLE_KIT } from './richmarine.js';
import { drillAt, AI_RELEASE_T, AI_DRILL } from '../infantry/carepose.js';   // ngc/infdepth-fix: the M67 drill's timing (the views pose it)
const AI_COOK_S = AI_DRILL.find(d => d[0] === 'cook')[1];   // ngc/marine-polish: s the AI cooks an M67 (a dropped one's fuse)
import { createFieldCare } from './fieldcare.js';
import { partAt } from './marine.js';
import { fragmentHits } from '../infantry/medical.js';
import * as INV from '../infantry/inventory.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// GAME-LEVEL rounds the war's own weapons and the Marines fire into the ground war (hit.js format, game values)
export const GW_AMMO = {
  ...AMMO,
  m16: AMMO.rifle,                                                            // M16A1 (Marines; the player's rifle)
  m60: AMMO.mg,                                                               // the Huey's door gun / M60
  m203: { calibre: 40, mass: 0.23, velocity: 76, type: 'heat', pen: 60 },    // 40 mm M433 HEDP: lobbed; a small shaped charge (game pen) + fragments
  cannon20: { calibre: 20, mass: 0.1, velocity: 1030, type: 'ap', pen: 40 },  // the Hornet's M61
  ffar: { calibre: 70, mass: 6.2, velocity: 700, type: 'heat', pen: 220 },    // 2.75 in rockets
  m67: { calibre: 64, mass: 0.4, velocity: 15, type: 'frag', pen: 0 },       // M67 hand grenade, thrown (4-5 s fuse; ngc/infdepth-fix)
  mbt105: { calibre: 105, mass: 4.5, velocity: 1500, type: 'ap', pen: 560 },  // PARITY: the Task Force's AI M60A3, 105 mm M68 (game value)
};
// PARITY (ngc/parity): the Task Force's AI tank's coax (M240 7.62 mm: the Marines' M60 round)
const TF_COAX = { ...WPN.mbtmg, ammo: 'm60' };
const BIG = { coil120: 1, mbt120: 1, mbt125: 1, mbt105: 1 };   // the big rounds (tank guns, the coilgun)
// Marine weapons (game): rate (rounds / min of aimed or burst fire), spread (rad, 1 sigma), ammo, sound radius
export const MAR_WPN = {
  rifle: { rpm: 50, spread: 0.0045, ammo: 'm16', loud: 330, v: 900 },
  auto: { rpm: 700, burst: [3, 6], pause: [0.9, 2.2], spread: 0.009, ammo: 'm16', loud: 360, v: 900 },
  mg: { rpm: 550, burst: [5, 9], pause: [0.7, 1.8], spread: 0.007, ammo: 'm60', loud: 450, v: 853 },   // the attached M60
  gl: { rpm: 10, spread: 0.02, ammo: 'm203', loud: 120, v: 76 },
  law: { rpm: 6, spread: 0.009, ammo: 'law', loud: 500, v: 145, aim: [1.2, 2.2] },
};
// damage a RUNAWAY round does to a Marine (HP on foot.js's body-part scale) and to the outside world (war.js units)
// (hp: on a Marine; war: on an AA site or a vehicle; air: on an aircraft (a CH-46 on its LZ, a helicopter low over the fight); heli: the player's helicopter)
export const RW_HURT = { xm7: { hp: 60, war: 0.15, air: 0.008, heli: 0.08 }, needle: { hp: 48, war: 0.12, air: 0.006, heli: 0.07 }, mg: { hp: 62, war: 0.15, air: 0.012, heli: 0.09 }, coil120: { hp: 600, war: 3.2, air: 2.5, heli: 0.7 }, mbt120: { hp: 600, war: 3.5, air: 3, heli: 0.8 }, mbt125: { hp: 600, war: 3.5, air: 3, heli: 0.8 }, mbt105: { hp: 600, war: 3.5, air: 3, heli: 0.8 }, pd: { hp: 30, war: 0.05, air: 0.03, heli: 0.05 } };
const HEIGHT = { strider: 2.1, hovertank: 2.6, mbt: 2.4, marine: 1.8 };
// ngc/infdepth: what a round does to a Marine on the medical sim (MEDINV hit-info, GAME: the same damage scale as
// RW_HURT.hp; pen against the 1980 M1955 / M69 vests, armour class 2 in MEDINV's table)
// (ngc/infdepth-fix: tuned so a near Marine on MEDINV is killed about as often per hit as the cheap model - a third of
// trunk wounds, the M1 helmet turning some rounds - not one-shot by every rifle round)
const RICH_HIT = { xm7: { dmg: 45, pen: 28, bleed: 1.1 }, needle: { dmg: 38, pen: 26, bleed: 1.2 }, mg: { dmg: 48, pen: 30, bleed: 1.1 }, pd: { dmg: 30, pen: 22, bleed: 1 },
  m16: { dmg: 55, pen: 30, bleed: 1.1 }, m60: { dmg: 70, pen: 38, bleed: 1.2 }, hmg: { dmg: 120, pen: 60, bleed: 1.5 }, cannon20: { dmg: 160, pen: 70, bleed: 1.6 } };
const NEAR = 560;     // m from the island's shore to the camera: inside = full simulation
const AIR_RANGE = 170;   // m: machines open up on an aircraft only inside this

export function createGroundSim(o) {
  const { terrainH, islands } = o, hooks = o.hooks || {};
  const R = rng(o.seed ?? 1980), gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += R(); return (u - 3) / Math.sqrt(0.5); };
  const maps = createIslandMaps({ terrainH, islands });
  const GS = { maps, battles: [], units: [], proj: [], events: [], time: 0, nextId: 1, stats: { shots: { 1: 0, 2: 0 }, hits: { 1: 0, 2: 0 }, richShots: 0, warHits: { 1: 0, 2: 0 }, kills: { 1: 0, 2: 0 }, kia: 0, wia: 0, rtd: 0, dow: 0, evac: 0 }, cam: { x: 0, y: 0, z: 0 }, peace: false };
  const ev = (e, x) => { GS.events.push(Object.assign({ e, t: GS.time }, x)); };
  // ngc/infdepth options: o.rich = { r (m from the camera), max (men) } puts the nearest Marines on the real rifleman and
  // medical sims; o.care = true runs casualty care (fieldcare.js). Both off by default (the balance benches).
  GS.richOpt = o.rich || null; GS.richCost = { ms: 0, steps: 0 };
  const kitOf = u => u.kit || (u.kit = u.rich ? u.rich.inv : INV.loadout(ROLE_KIT[u.role] || 'rifleman'));
  GS.kitOf = kitOf;
  // the ground the sims stand on: the island's baked grid where there is one, the live terrain elsewhere; walkers stay
  // out of the sea, the hovercraft rides over it
  const hAt = (x, z) => { const I = maps.at(x, z); return I && maps.has(I) ? maps.get(I).height(x, z) : terrainH(x, z); };
  const envLand = { height: hAt };
  const envHover = { height: (x, z) => Math.max(hAt(x, z), 0) };
  const armorEnv = { height: hAt, surface: (x, z) => { const h = hAt(x, z); if (h < 1.2) return 'sand'; const e = 1, s = Math.hypot(hAt(x + e, z) - hAt(x - e, z), hAt(x, z + e) - hAt(x, z - e)) / 2; return s > 0.7 ? 'rock' : (Math.sin(x * 0.05) * Math.cos(z * 0.047) > 0.3 ? 'dirt' : 'grass'); }, water: (x, z) => (hAt(x, z) < 0 ? 0 : -Infinity) };

  // ngc/infdepth: casualty care (wounded call out and crawl to cover, the corpsman, buddy aid, drags to the CCP)
  function worldAt(x, z) { const I = maps.at(x, z); return I && maps.has(I) && maps.get(I).ready ? maps.get(I).world : null; }
  function losAt(ax, ay, az, bx, by, bz) { const Wq = worldAt((ax + bx) / 2, (az + bz) / 2); return Wq ? Wq.los(ax, ay, az, bx, by, bz) : true; }
  const careWorld = { height: hAt, isWater: (x, z) => hAt(x, z) < 0.15, los: losAt,
    coverPoints: (x, z, r, out) => worldAt(x, z)?.coverPoints(x, z, r, out) || out,
    coverScore: (cp, tx, ty, tz, c, s) => worldAt(cp.x, cp.z)?.coverScore(cp, tx, ty, tz, c, s) || { hidden: false, canFire: true, facing: 0 } };
  const FC = o.care ? createFieldCare({ world: careWorld, R, ev, kitOf, patients: B => hooks.patients ? hooks.patients(B) : [],
    kill: (u, why) => { u.body.alive = false; u.body.able = false; u.body.why = why; if (u.rich) u.rich.M.dead = true; GS.stats.kia++; GS.stats.dow++; u.richPrev = 'dead'; ev('kia', { id: u.id, x: u.x, y: u.y, z: u.z, part: 'wounds', dow: true, I: u.B?.I }); sync(u); },
    rtd: (u, k) => { const M = u.body, tot = Object.values(M.hp).reduce((a, b) => a + b, 0) / 440; if (tot < k || M.hp.legL <= 0 || M.hp.legR <= 0 || M.hp.armR <= 0 || M.hp.thorax <= 0 || M.hp.stomach <= 0) return false; M.able = true; M.wounded = 1 - tot; GS.stats.rtd++; ev('rtd', { id: u.id, x: u.x, y: u.y, z: u.z }); sync(u); return true; },
    drag: (u, x, z, yaw) => GS.place(u, x, z, yaw),
    // a fireman's carry (m: the carrier; null: put down in front of `from`). The body goes with the carrier (hit volumes,
    // the AI); the views put him across the carrier's shoulders (groundwar.js, from u.cas.carry)
    carry: (u, m, from) => {
      if (m) { if (u.cas) u.cas.carry = m.id; GS.place(u, m.x, m.z, m.yaw); }
      else { if (u.cas) u.cas.carry = null; if (from) GS.place(u, from.x - Math.sin(from.yaw) * 1.0, from.z - Math.cos(from.yaw) * 1.0, from.yaw + Math.PI); }
    } }) : null;
  GS.FC = FC;
  // move a man (a dragged casualty, one the player carries): both models
  GS.place = (u, x, z, yaw, y) => { const M = u.body; M.x = x; M.z = z; M.y = y ?? hAt(x, z); if (yaw !== undefined) M.yaw = yaw; M.vx = M.vz = 0; if (u.rich) { const S = u.rich.S; S.pos.x = x; S.pos.z = z; S.pos.y = M.y; S.vel.x = S.vel.z = 0; if (yaw !== undefined) S.yaw = S.aimYaw = S.wYaw = S.camYaw = yaw; } sync(u); };
  // ------------------------------------------------------------------------------------------------- battles
  GS.battle = I => {
    let B = GS.battles.find(b => b.I === I); if (B) return B;
    const M = maps.get(I);
    B = { I, M, rw: createSquadAI(M.world, { seed: 7 + I.id }), mar: createMarineAI(M.world, { seed: 1980 + I.id }), units: [], near: true, acc: 0, tmap: new Map(), sq: 0 };
    // PARITY (ngc/parity): the Task Force's armour on the island gets its own instance of the squad AI (side 1: its
    // perception, threat and hearing are side-keyed), fed side 1's targets; each armour squad supports a Marine squad
    B.tf = createSquadAI(M.world, { seed: 31 + I.id });
    GS.battles.push(B); return B;
  };
  const inBattle = (B, u) => { u.B = B; if (B && !B.units.includes(u)) B.units.push(u); };

  // ------------------------------------------------------------------------------------------------- units
  function unit(o) { const u = { id: GS.nextId++, alive: true, up: true, cd: R() * 1.5, rl: 0, firedT: 99, deadT: 0, vx: 0, vz: 0, lite: false, ...o }; GS.units.push(u); return u; }
  GS.addStrider = (B, x, z, yaw, o = {}) => {
    const S = createStrider({ id: GS.nextId }); S.place(x, z, yaw, envLand);
    const wn = o.weapon === 'coil' ? 'coil' : 'xm7', w = WPN[wn];
    const u = unit({ side: 2, kind: 'strider', sim: S, eye: 1.95, vehicle: false, weaponName: wn, weapon: { range: w.range, antiArmor: false, rpm: w.rpm }, mag: w.mag, h: 2.1, tag: o.tag });
    sync(u); inBattle(B, u); return u;
  };
  GS.addHover = (B, x, z, yaw, o = {}) => {
    const T = createHoverTank({ id: GS.nextId }); T.place(x, z, yaw, envHover);
    const u = unit({ side: 2, kind: 'hovertank', sim: T, eye: 2.6, gun: 1.6, vehicle: true, weapon: { range: 900, antiArmor: true, rpm: 11 }, mag: 1, coax: { mag: 60, cd: 0, rl: 0 }, h: 2.6, tag: o.tag });
    sync(u); inBattle(B, u); return u;
  };
  // (PARITY: o.side = 1 puts a Task Force tank in the fight - an M60A3 - on B.tf's squad AI; default the seized ones, side 2)
  GS.addMBT = (type, B, x, z, yaw, o = {}) => {
    const side = o.side ?? 2;
    const T = createMBT(MBT[type], { id: GS.nextId, side, drive: o.placeholder ? undefined : createTrackDrive }); T.place(x, z, yaw, armorEnv);
    const u = unit({ side, kind: 'mbt', mbtType: type, sim: T, eye: MBT[type].eye ?? 2.6, spotK: MBT[type].spotK, maxGrade: MBT[type].maxGrade, gun: MBT[type].gunH ?? 2.0, vehicle: true, weapon: { range: 1200, antiArmor: true, rpm: 9 }, mag: 1, coax: { mag: 100, cd: 0, rl: 0 }, h: MBT[type].H, tag: o.tag });
    sync(u); inBattle(B, u); return u;
  };
  GS.addMarine = (B, role, x, z, yaw, o = {}) => {
    const body = createMarine({ id: GS.nextId, role, x, z, yaw, env: envLand, seed: o.seed });
    const u = unit({ side: 1, kind: 'marine', role, body, laws: body.laws, gl: body.gl, frags: body.frags, able: true, h: 1.8, burst: 0, lawT: 0, seed: o.seed ?? GS.nextId, name: o.name });
    sync(u); inBattle(B, u); return u;
  };
  function sync(u) {
    const s = u.sim;
    if (u.kind === 'marine') {
      const M = u.body; u.x = M.x; u.y = M.y; u.z = M.z; u.yaw = M.yaw; u.alive = M.alive; u.able = M.able; u.up = M.able; u.vx = M.vx; u.vz = M.vz; u.h = M.height(); u.laws = M.laws; u.gl = M.gl; u.frags = M.frags;
      u.hp = Object.values(M.hp).reduce((a, b) => a + b, 0) / 440;
    } else if (u.kind === 'strider') {
      if (u.lite) { u.alive = s.alive; return; }   // (the kinematic stand-in keeps x / y / z itself)
      u.x = s.c[0]; u.z = s.c[2]; u.y = s.pos()[1]; u.yaw = s.yaw; u.headYaw = s.headYaw; u.alive = s.alive; u.up = s.up; u.blind = s.blind; u.prone = s.alive && s.mode === 'disabled'; u.gun = s.muzzle()[1] - u.y;
      u.hp = Math.max(0, s.hp.thorax / STRIDER.HP.thorax); u.vx = s.v[0]; u.vz = s.v[2];
    } else if (u.kind === 'hovertank') {
      u.x = s.p[0]; u.z = s.p[2]; u.y = envHover.height(s.p[0], s.p[2]); u.yaw = s.yaw; u.alive = s.alive; u.up = s.alive; u.hp = Math.max(0, s.hp.hull / RW7.HP.hull); u.vx = s.v[0]; u.vz = s.v[2];
    } else {
      u.x = s.p[0]; u.z = s.p[2]; u.y = s.p[1]; u.yaw = s.yaw; u.alive = s.alive; u.up = s.alive; u.hp = Math.max(0, s.hp.hull / s.P.hp.hull);
      u.vx = -Math.sin(s.yaw) * s.speed; u.vz = -Math.cos(s.yaw) * s.speed;
    }
  }
  GS.sync = sync;

  // ------------------------------------------------------------------------------------------------- squads
  GS.squadRW = (B, members, order) => { const S = B.rw.addSquad({ id: `R${B.I.id}-${++B.sq}`, side: 2, members, order }); S.B = B; for (const m of members) m.squad = S; return S; };
  GS.squadMarines = (B, members, order) => { const S = B.mar.addSquad({ id: `M${B.I.id}-${++B.sq}`, side: 1, members, order }); S.B = B; S.marines = true; for (const m of members) m.squad = S; return S; };
  // PARITY (ngc/parity): a Task Force armour squad (side 1) on the battle's B.tf squad AI. S.cmd = the commander's order;
  // S.order is what the squad AI works to (supportStep keeps it on a Marine squad while there is one to support)
  GS.squadArmour = (B, members, order) => { const S = B.tf.addSquad({ id: `A${B.I.id}-${++B.sq}`, side: 1, members, order }); S.B = B; S.tf = true; S.cmd = order; for (const m of members) m.squad = S; return S; };
  GS.order = (S, order) => { if (S.marines) S.B.mar.order(S.id, order); else if (S.tf) { S.cmd = order; S.B.tf.order(S.id, order); } else S.B.rw.order(S.id, order); S.order = order; };
  // a machine arriving (a hover tank off the sea, an MBT off a landing craft) joins the island's machines, or leads its own
  GS.join = (B, u, order) => {
    inBattle(B, u); u.transit = null;
    if (u.side === 1) {   // PARITY: our armour joins the island's Task Force armour squad, or forms one
      const S = B.tf.squads.find(s => s.state !== 'dead' && s.members.some(m => m.alive));
      if (S) { B.tf.addMember(S.id, u); u.squad = S; return S; }
      return GS.squadArmour(B, [u], order || { type: 'defend', x: B.I.pad.x, z: B.I.pad.z, r: 30 });
    }
    const S = B.rw.squads.find(s => s.members.some(m => m.alive && !m.vehicle) && s.state !== 'dead');
    if (S) { B.rw.addMember(S.id, u); u.squad = S; return S; }
    return GS.squadRW(B, [u], order || { type: 'defend', x: B.I.pad.x, z: B.I.pad.z, r: 30 });
  };
  // a unit on its way over the sea (hover tank): follows the route at speed, then joins B
  GS.transit = (u, route, B, order) => { u.transit = { route, i: 0, B, order }; u.B = null; };

  // ------------------------------------------------------------------------------------------------- firing
  function shoot(side, src, ammo, from, aim, spread, speed, o = {}) {
    const A = GW_AMMO[ammo], v = speed ?? A.velocity, dx = aim[0] - from[0], dy = aim[1] - from[1], dz = aim[2] - from[2], d = Math.hypot(dx, dy, dz) || 1;
    let ux, uy, uz;
    if (o.lob) {   // a grenade launcher: the low-angle solution for the range (or 45 deg if out of reach)
      const hd = Math.hypot(dx, dz) || 1, g = 9.81, v2 = v * v, disc = v2 * v2 - g * (g * hd * hd + 2 * dy * v2);
      const th = disc > 0 ? Math.atan((v2 - Math.sqrt(disc)) / (g * hd)) : Math.PI / 4;
      ux = dx / hd * Math.cos(th); uz = dz / hd * Math.cos(th); uy = Math.sin(th);
    } else {
      const tf = d / v, drop = 0.5 * 9.81 * tf * tf;
      ux = dx / d; uy = (dy + drop) / d; uz = dz / d; const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    }
    const ex = gauss() * spread, ey = gauss() * spread, px = -uz, pz = ux, pl = Math.hypot(px, pz) || 1;
    ux += px / pl * ex; uz += pz / pl * ex; uy += ey;
    const l = Math.hypot(ux, uy, uz);
    const p = { side, src: src.id, ammo, x: from[0], y: from[1], z: from[2], vx: ux / l * v, vy: uy / l * v, vz: uz / l * v, life: o.life ?? Math.min(6, 1400 / v + 0.5), heat: A.type === 'heat', gl: ammo === 'm203', big: !!BIG[ammo], B: src.B, near: null, fuse: o.fuse ?? 0, frag: ammo === 'm67' };
    GS.proj.push(p); GS.stats.shots[side]++; src.firedT = 0;
    const loud = o.loud ?? 330, kind = A.type === 'heat' || p.big ? 'blast' : 'shot';
    const snd = { x: from[0], y: from[1], z: from[2], loud, side, kind, src: src.id };
    if (src.B) hearAll(src.B, snd);
    ev('shot', { side, src: src.id, ammo, x: from[0], y: from[1], z: from[2], dx: ux / l, dy: uy / l, dz: uz / l, kind: src.kind });
    return p;
  }
  GS.shoot = shoot;
  function cadence(st, w, dt, want) {
    st.cd = Math.max(0, st.cd - dt);
    if (st.rl > 0) { st.rl -= dt; if (st.rl <= 0) st.mag = w.mag; return false; }
    if (!want || st.cd > 0) return false;
    st.cd = 60 / w.rpm; st.mag--; if (st.mag <= 0 && w.reload > 0) st.rl = w.reload; else if (st.mag <= 0) st.mag = w.mag;
    return true;
  }

  // ------------------------------------------------------------------------------------------------- RUNAWAY units
  // PARITY (ngc/parity): which AI runs a unit (Marines; the Task Force's armour; the machines) and every AI hears a sound
  const aiOf = (B, u) => u.kind === 'marine' ? B.mar : u.side === 1 ? B.tf : B.rw;
  const hearAll = (B, snd) => { B.rw.hear(snd); B.mar.hear(snd); B.tf.hear(snd); };
  // the machines, and (PARITY) the Task Force's tanks: the same vehicle host loop, side-keyed
  function driveRW(B, u, dt, peace, tmap) {
    const a = u.ai, s = u.sim; if (!a) return;
    if (u.side === 1 ? GS.peaceMar : peace) { a.fire = false; }   // (our tanks hold fire when the Marines do)
    if (u.kind === 'strider') {
      const sp = a.run ? 4.2 : 1.6, [vx, vz] = dry(u, aiOf(B, u).steerVel(u, sp), 2.5);
      if (u.lite) {   // far: kinematic, the AI's velocity over the ground (the body sim waits where it is)
        if (s.alive) { const v = Math.hypot(vx, vz), k = Math.min(1, dt * 3); u.vx += (vx - u.vx) * k; u.vz += (vz - u.vz) * k; u.x += u.vx * dt; u.z += u.vz * dt; u.y = hAt(u.x, u.z); if (v > 0.2) u.yaw = Math.atan2(-u.vx, -u.vz); }
      } else {
        const cmd = { vx, vz, run: a.run, crouch: a.crouch, aim: a.aim || undefined, look: a.aim ? undefined : a.look };
        if (!a.aim && a.move) { cmd.aimYaw = Math.atan2(-vx, -vz); if (Math.hypot(vx, vz) < 0.2) delete cmd.aimYaw; }
        for (const e of s.step(dt, cmd, envLand)) {
          if (e.e === 'step') ev('step', { id: u.id, x: e.x, y: e.y, z: e.z, v: e.v, stumble: e.stumble });
          else if (e.e === 'fall') ev('fall', { id: u.id, x: u.x, y: u.y, z: u.z, why: e.why });
          else if (e.e === 'impact') ev('thud', { id: u.id, x: e.x, y: e.y, z: e.z });
          else if (e.e === 'getup') ev('getup', { id: u.id, x: u.x, y: u.y, z: u.z });
          else if (e.e === 'destroyed') killed(u);
        }
        if (s.stumble > 0.6 && !u._stum) { u._stum = true; ev('stumble', { id: u.id, x: u.x, y: u.y, z: u.z }); } else if (s.stumble < 0.2) u._stum = false;
      }
      // GAME RULE (the war's, not the sim's): a machine broken in two places - blind, its weapon arm or a leg gone, its
      // gut torn open - shuts down after a few seconds (its seams go dark); only a hit through the thorax kills outright
      if (s.alive) {
        const broken = (s.hp.head <= 0) + (s.hp.armR <= 0 || s.hp.weapon <= 0) + (s.hp.legL <= 0) + (s.hp.legR <= 0) + (s.hp.stomach <= 0);
        if (broken >= 2) { u.shutT = (u.shutT || 0) + dt; if (u.shutT > 3) { s.kill(); u.shutdown = true; } }
      }
      if (!s.alive && u.alive) killed(u);
      const w = WPN[u.weaponName];
      // (an aircraft is engaged only close in: rifle fire at a distant helicopter wastes the volley)
      const tgA = a.aimId != null ? tmap.get(a.aimId) : null, airFar = tgA && tgA.kind === 'air' && Math.hypot(tgA.x - u.x, tgA.z - u.z) > AIR_RANGE;
      if (cadence(u, w, dt, a.fire && !airFar && s.armed && (u.lite || s.up || u.prone) && a.aim)) {
        if (u.lite) { shoot(2, u, w.ammo, [u.x, u.y + 1.6, u.z], a.aim, w.spread + 0.004 + a.supp * 0.01, undefined, { loud: w.loud }); }
        else {
          const mz = s.muzzle(), err = s.aimError() + a.supp * 0.01, ad = s.aimDir(), tx = a.aim[0] - mz[0], ty = a.aim[1] - mz[1], tz = a.aim[2] - mz[2], tl = Math.hypot(tx, ty, tz) || 1;
          if ((ad[0] * tx + ad[1] * ty + ad[2] * tz) / tl > 0.9993) shoot(2, u, w.ammo, mz, a.aim, w.spread + err, undefined, { loud: w.loud });
          else u.cd = 0.05;
        }
      }
    } else {
      if (a.move && u.kind !== 'hovertank' && hAt(a.move[0], a.move[1]) < 0.6) a.move = landward(B, a.move);   // never a firing position in the sea
      const vehSp = a.run ? 12 : 7, [vx, vz] = u.kind === 'mbt' ? dry(u, aiOf(B, u).steerVel(u, vehSp), 7) : B.rw.steerVel(u, vehSp);
      const cmd = { vx, vz };
      if (a.face !== undefined && Math.hypot(vx, vz) < 1) cmd.face = a.face;
      if (a.aim) { const mz = s.muzzle(), dx = a.aim[0] - mz[0], dz = a.aim[2] - mz[2]; cmd.turret = Math.atan2(-dx, -dz); cmd.gun = Math.atan2(a.aim[1] - mz[1], Math.hypot(dx, dz)); if (u.kind === 'hovertank') cmd.aimAt = a.aim; }
      // (PARITY fix, ngc/parity: a tank that wants to move and has not for 6 s - circling between field walls, or a turn
      // it can't make on a slope - backs off 4-5 s on a new line and tries again; the slower M60A3 found these spots)
      if (u.kind === 'mbt') {
        if (Math.hypot(vx, vz) > 1 && Math.abs(s.speed) < 0.7 && !u.unstick) u.stuckT = (u.stuckT || 0) + dt; else u.stuckT = Math.max(0, (u.stuckT || 0) - dt);
        if (u.stuckT > 6) { const a0 = Math.atan2(vz, vx) + Math.PI + (R() - 0.5) * 2.2; u.unstick = { t: 4 + R(), vx: Math.cos(a0) * 3.5, vz: Math.sin(a0) * 3.5 }; u.stuckT = 0; }
        if (u.unstick) { cmd.vx = u.unstick.vx; cmd.vz = u.unstick.vz; delete cmd.face; if ((u.unstick.t -= dt) <= 0) u.unstick = null; }
      }
      if (u.kind === 'mbt' && hAt(u.x, u.z) < 0.3) { const dx = B.I.x - u.x, dz = B.I.z - u.z, d = Math.hypot(dx, dz) || 1; cmd.vx = dx / d * 4; cmd.vz = dz / d * 4; delete cmd.face; }   // wet tracks: drive up out of the water first
      vehicleStep(u, dt, cmd);
      if (!s.alive) return;
      const tg = a.aimId != null ? tmap.get(a.aimId) : null, gd = s.gunDir(), mz = s.muzzle();
      const onTgt = a.aim && (() => { const tx = a.aim[0] - mz[0], ty = a.aim[1] - mz[1], tz = a.aim[2] - mz[2], tl = Math.hypot(tx, ty, tz) || 1; return (gd[0] * tx + gd[1] * ty + gd[2] * tz) / tl > 0.9985; })();
      const main = u.kind === 'hovertank' ? WPN.coilgun : WPN.mbtgun, coax = u.kind === 'hovertank' ? WPN.coax : u.side === 1 ? TF_COAX : WPN.mbtmg;
      const bigTarget = tg && (tg.kind === 'vehicle' || tg.kind === 'at' || tg.kind === 'mg');
      if (a.fire && onTgt && bigTarget && s.fire()) { const am = u.kind === 'hovertank' ? 'coil120' : (s.P.ammo || 'mbt120'); shoot(u.side, u, am, mz, a.aim, 0.0005 + 0.003 * Math.min(1, Math.abs(s.speed || 0) / 10), undefined, { loud: main.loud }); ev('mainGun', { id: u.id, kind: u.kind, side: u.side, x: mz[0], y: mz[1], z: mz[2], dx: gd[0], dy: gd[1], dz: gd[2] }); }
      if (cadence(u.coax, coax, dt, a.fire && onTgt && tg && tg.kind !== 'vehicle' && !(tg.kind === 'air' && Math.hypot(tg.x - u.x, tg.z - u.z) > AIR_RANGE * 1.5))) shoot(u.side, u, coax.ammo, mz, a.aim, 0.002 + (tg.kind === 'air' ? 0.004 : 0), undefined, { loud: coax.loud });
    }
  }
  // walkers and tracks keep out of the sea: a commanded velocity that would take them into water within `look` m stops
  function dry(u, v, look) {
    const l = Math.hypot(v[0], v[1]); if (l < 0.05) return v;
    const x = u.x + v[0] / l * look, z = u.z + v[1] / l * look;
    if (hAt(x, z) < (u.kind === 'mbt' ? 0.4 : 0.15)) { v[0] = 0; v[1] = 0; }
    return v;
  }
  // a point in the sea pulled in toward the island's middle until it is on dry ground
  function landward(B, p) {
    const I = B.I; let x = p[0], z = p[1];
    for (let i = 0; i < 20 && hAt(x, z) < 0.6; i++) { x += (I.x - x) * 0.12; z += (I.z - z) * 0.12; }
    return [x, z];
  }
  function vehicleStep(u, dt, cmd) {
    const s = u.sim;
    if (u.kind === 'mbt' && s.drive.setDetail) s.drive.setDetail(!u.lite, armorEnv);
    const evs = s.step(dt, cmd, u.kind === 'hovertank' ? envHover : armorEnv);
    for (const e of evs) if (e.e === 'destroyed') killed(u);
    if (!s.alive && u.alive) killed(u);
  }
  function killed(u) {
    if (u.dead) return; u.dead = true; u.alive = false; u.deadT = 0;
    GS.stats.kills[u.side === 2 ? 1 : 2]++;
    ev('destroyed', { id: u.id, kind: u.kind, side: u.side, x: u.x, y: u.y + (u.kind === 'strider' ? 1.2 : 1.5), z: u.z, I: u.B?.I, mbtType: u.mbtType });
  }

  // ------------------------------------------------------------------------------------------------- Marines
  function driveMarine(B, u, dt, tmap) {
    const a = u.ai, M = u.body; if (!a) return;
    const sp = a.paceV ?? MAR_T.SPEED[a.pace] ?? 1.5;   // (paceV: a casualty drag at MEDINV's drag speed)
    let [vx, vz] = dry(u, B.mar.steerVel(u, sp), 2);
    if (u.cas && u.cas.held) vx = vz = 0;   // being dragged / carried: moved by whoever has him
    // ngc/infdepth: a man near the camera runs on the real rifleman + medical sims (richmarine.js)
    if (u.richOn) { driveRich(B, u, dt, vx, vz, tmap); if (!M.alive || !M.able || GS.peaceMar) { dropDrill(u); return; } if (a.fire !== 'gl' && a.fire !== 'law' && a.fire !== 'frag' && u.thrT == null) { u.burst = 0; return; } }
    else {
      const crawl = !M.able && u.crawl && !(u.cas && u.cas.held);   // a casualty crawling to cover (fieldcare.js)
      for (const e of M.step(dt, crawl ? { vx: u.crawl.vx, vz: u.crawl.vz, stance: u.crawl.walk ? 'stand' : 'prone', crawl: u.crawl.walk ? 'walk' : 'crawl' } : { vx, vz, stance: a.stance, face: a.face }, envLand)) {
        if (e.e === 'kia' || e.e === 'wia') { /* reported where the hit was applied */ }
      }
      if (u.rich) { u.rich.medAcc = (u.rich.medAcc || 0) + dt; if (u.rich.medAcc >= 0.5) { u.rich.medStep(u.rich.medAcc); u.rich.medAcc = 0; richState(u); } }   // (far: his wounds go on)
    }
    u.firedT += dt;
    if (!M.alive || !M.able || GS.peaceMar) { dropDrill(u); return; }
    if (u.thrT != null || (a.fire === 'frag' && a.frag && u.frags > 0 && a.aim)) { throwStep(u, a, M, dt); return; }
    // fire: aimed rifle, the AR's bursts, an M203 lob, a LAW (aim first)
    const w = a.fire && MAR_WPN[a.fire];
    u.cd = Math.max(0, u.cd - dt);
    if (a.law && u.laws > 0) { u.lawT += dt; u.wantLaw = true; } else { u.lawT = 0; u.wantLaw = false; }   // (the launcher comes out when he decides on it, not when the shot is clear)
    if (!w || !a.aim) { u.burst = 0; return; }
    if (u.cd > 0) return;
    const tg = tmap.get(a.aimId), moving = M.speed > 0.4, ey = M.stanceTo === 'prone' ? 0.32 : M.stanceTo === 'crouch' ? 1.0 : 1.5;
    const from = [M.x - Math.sin(M.yaw) * 0.6, M.y + ey, M.z - Math.cos(M.yaw) * 0.6];
    const spread = w.spread * (1 + 2.5 * Math.min(1, a.supp) + (moving ? 1.5 : 0) + M.wounded * 2) * (M.stanceTo === 'prone' ? 0.7 : 1);
    // lead a mover a little (people under-lead)
    const tof = Math.hypot(a.aim[0] - from[0], a.aim[2] - from[2]) / w.v, lead = tof * (a.fire === 'law' ? 0.9 : 0.7);   // (a LAW gunner leads properly; riflemen under-lead)
    const aim = tg ? [a.aim[0] + (tg.vx || 0) * lead, a.aim[1], a.aim[2] + (tg.vz || 0) * lead] : a.aim;
    if (a.fire === 'law') {
      if (u.laws <= 0) return;
      if (u.lawT < (u.lawAim || (u.lawAim = 1.2 + R()))) return;   // extend, arm, aim
      shoot(1, u, 'law', from, aim, spread, w.v, { loud: w.loud }); M.laws--; u.laws = M.laws; u.lawT = 0; u.lawAim = 0; u.cd = 2; ev('backblast', { x: M.x + Math.sin(M.yaw) * 1.5, y: M.y + ey, z: M.z + Math.cos(M.yaw) * 1.5, yaw: M.yaw });
      return;
    }
    if (a.fire === 'gl') { if (M.gl <= 0) return; shoot(1, u, 'm203', from, aim, spread, w.v, { lob: true, loud: w.loud }); M.gl--; u.gl = M.gl; u.cd = 60 / w.rpm * (0.8 + R() * 0.6); return; }
    if (a.fire === 'auto' || a.fire === 'mg') {
      if (u.burst <= 0) u.burst = w.burst[0] + Math.floor(R() * (w.burst[1] - w.burst[0] + 1));
      shoot(1, u, w.ammo, from, aim, spread * (1 + 0.15 * (6 - u.burst)), w.v, { loud: w.loud }); u.burst--;
      u.cd = u.burst > 0 ? 60 / w.rpm : w.pause[0] + R() * (w.pause[1] - w.pause[0]);
      return;
    }
    shoot(1, u, w.ammo, from, aim, spread, w.v, { loud: w.loud }); u.cd = 60 / w.rpm * (0.6 + R() * 0.9);
  }

  // ngc/infdepth-fix: an M67 thrown (game level): the drill takes its time (clip, pin, a ~1 s cook, the throw:
  // carepose.js AI_DRILL; u.thr = { phase, p, gone } for the views), it leaves the hand at AI_RELEASE_T, lands, rolls to a
  // stop and goes off when the fuse (4.5 s from the spoon) runs out. A man who goes down before he lets go: dropDrill
  function throwStep(u, a, M, dt) {
    if (u.thrT == null) { u.thrT = 0; u.thr = { phase: 'draw', p: 0, gone: false }; u.thrAim = a.aim.slice(); }
    if (a.fire === 'frag' && a.aim) { u.thrAim[0] = a.aim[0]; u.thrAim[1] = a.aim[1]; u.thrAim[2] = a.aim[2]; }
    u.thrT += dt;
    if (!u.thr.gone && u.thrT >= AI_RELEASE_T) {
      const ey = M.stanceTo === 'crouch' ? 1.45 : 1.85, rx = Math.cos(M.yaw), rz = -Math.sin(M.yaw);
      const from = [M.x + rx * 0.15, M.y + ey, M.z + rz * 0.15], tg = u.thrAim, d = Math.hypot(tg[0] - from[0], tg[2] - from[2]);
      const v = clamp(Math.sqrt(9.81 * d / 0.94) * 1.03, 8, 18);   // (~35 deg: a man throws it as far as he needs to, up to ~32 m)
      shoot(1, u, 'm67', from, [tg[0], tg[1] - 1, tg[2]], 0.03 + 0.02 * Math.min(1, a.supp), v, { lob: true, loud: 25, fuse: 4.5 - 1.0, life: 12 });
      M.frags--; u.frags = M.frags; u.thr.gone = true; a.frag = null; GS.stats.frags = (GS.stats.frags || 0) + 1;
    }
    if (!drillAt(u.thrT, u.thr)) { u.thrT = null; u.thr = null; u.cd = Math.max(u.cd, 0.4); }
  }
  // ngc/marine-polish: a man who goes down (or is killed) with the pin out drops the grenade LIVE: his hand opens, the
  // spoon flies, it rolls off him and goes off with the fuse left (4.5 s, less what he had cooked). Before the pin is
  // out it just falls (safe, still on him). Peace (the island taken): he puts the pin back.
  function dropDrill(u) {
    if (u.thrT == null) return;
    const t = u.thr, M = u.body;
    const live = t && !t.gone && (t.phase === 'ready' || t.phase === 'cook' || t.phase === 'throw' || (t.phase === 'pin' && t.p > 0.6)) && (!M.alive || !M.able);
    if (live) {
      const cooked = t.phase === 'cook' ? t.p : t.phase === 'throw' ? AI_COOK_S : 0, ry = M.yaw + (R() - 0.5) * 2.4;
      const from = [M.x, M.y + (M.stanceTo === 'prone' ? 0.4 : 1.1), M.z], to = [M.x - Math.sin(ry) * 1.2, M.y, M.z - Math.cos(ry) * 1.2];
      shoot(1, u, 'm67', from, to, 0, 2.2, { lob: true, loud: 10, fuse: Math.max(0.3, 4.5 - cooked), life: 12 });
      M.frags = Math.max(0, (M.frags || 1) - 1); u.frags = M.frags; t.gone = true;
      GS.stats.fragsDropped = (GS.stats.fragsDropped || 0) + 1;
      ev('fragDropped', { id: u.id, x: M.x, y: M.y + 0.4, z: M.z, cooked });
    }
    u.thrT = null; u.thr = null;
  }
  // ------------------------------------------------------------------------------------------------- rich Marines
  // ngc/infdepth: the near men on INFANTRY's rifleman and MEDINV's medical sims. The squad AI's intent drives the
  // rifleman (richmarine.js); his shots become game-level projectiles here; his body is copied into marine.js's body so
  // the AI, the hit volumes and the views see one man.
  const _want = { fire: null, aim: null, supp: 0, gap: 1, burstS: 0.35, pause: 1.2, crawl: null };
  function driveRich(B, u, dt, vx, vz, tmap) {
    const a = u.ai, RM = u.rich, M = u.body, t0 = perfNow();
    const w = a.fire && (a.fire === 'rifle' || a.fire === 'auto' || a.fire === 'mg') ? a.fire : null;
    let aim = null;
    if (a.aim) {   // lead a mover a little (people under-lead), as the cheap model
      const tg = tmap.get(a.aimId), tof = Math.hypot(a.aim[0] - M.x, a.aim[2] - M.z) / 900, lead = tof * 0.7;
      aim = tg ? [a.aim[0] + (tg.vx || 0) * lead, a.aim[1], a.aim[2] + (tg.vz || 0) * lead] : a.aim;
    }
    _want.fire = w && !GS.peaceMar && u.thrT == null ? w : null; _want.aim = aim; _want.supp = a.supp; _want.crawl = !M.able && u.crawl && !(u.cas && u.cas.held) ? u.crawl : null;   // (no rifle fire with a grenade in his hand)
    _want.gap = 60 / MAR_WPN.rifle.rpm * (0.6 + R() * 0.9); _want.burstS = w === 'mg' ? 0.6 + R() * 0.5 : 0.25 + R() * 0.25; _want.pause = 0.9 + R() * 1.3;
    const shots = RM.step(dt, a, envLand, [vx, vz], _want); u.firedT += dt;
    for (const s of shots) {
      const ammo = s.weapon === 'M60' ? 'm60' : 'm16', A = MAR_WPN[ammo === 'm60' ? 'mg' : 'rifle'];
      shoot(1, u, ammo, [s.x, s.y, s.z], [s.x + s.dir[0] * 300, s.y + s.dir[1] * 300 + 0.5 * 9.81 * (300 / s.v) ** 2, s.z + s.dir[2] * 300], 0, s.v, { loud: A.loud });
    }
    if (shots.length) { u.firedT = 0; GS.stats.richShots += shots.length; }   // (each one is in GS.stats.shots[1] too: shoot())
    // the body follows the soldier
    const S = RM.S;
    M.x = S.pos.x; M.z = S.pos.z; M.y = hAt(M.x, M.z); M.yaw = S.yaw; M.vx = S.vel.x; M.vz = S.vel.z; M.speed = S.speed;
    M.stance = S.stance; M.stanceFrom = S.stanceFrom; M.stanceTo = S.stanceTo; M.stanceT = S.stanceT; M.gait = S.gaitPhase;
    M.mags = Math.round(RM.roundsLeft() / 18);
    richState(u);
    GS.richCost.ms += perfNow() - t0; GS.richCost.steps++;
  }
  const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  // MEDINV state -> the body's alive / able, with the war's events (kia, wia; rtd when treatment gets him back up)
  function richState(u) {
    const s = u.rich.state(), prev = u.richPrev || 'ok', M = u.body;
    if (s === prev) return;
    u.richPrev = s;
    if (s === 'dead') { M.alive = false; M.able = false; M.why = u.rich.M.cause || ''; GS.stats.kia++; if (prev === 'ok') u.B?.mar.casualty(u.id, 'kia'); else GS.stats.dow++; ev('kia', { id: u.id, x: u.x, y: u.y, z: u.z, part: u.lastPart || 'wounds', dow: prev !== 'ok', I: u.B?.I }); }
    else if (s === 'down') { M.able = false; GS.stats.wia++; u.B?.mar.casualty(u.id, 'wia'); ev('wia', { id: u.id, x: u.x, y: u.y, z: u.z, part: u.lastPart || '', I: u.B?.I }); }
    else if (s === 'ok' && prev === 'down') { M.able = true; GS.stats.rtd++; ev('rtd', { id: u.id, x: u.x, y: u.y, z: u.z }); }
    sync(u);
  }
  GS.richState = richState;
  // promote the Marines nearest the camera (in a near battle) to the rich model, up to the cap; demote the ones that
  // drift out of range (their medical state stays with them: a man keeps bleeding wherever the camera is)
  function enrich(u) {
    if (!u.rich) { u.rich = createRichMarine(u, { inventory: kitOf(u) }); u.kit = u.rich.inv; u.richPrev = u.body.able ? 'ok' : 'down'; carryWounds(u); }
    u.rich.place(u.body.x, u.body.z, u.body.yaw, envLand); u.richOn = true;
  }
  GS.enrich = enrich;
  // a man promoted while already hurt (cheap model): his part damage becomes MEDINV wounds of the same size
  function carryWounds(u) {
    const M = u.body, Md = u.rich.M;
    for (const p in M.hp) { const lost = { head: 35, thorax: 85, stomach: 70, armL: 60, armR: 60, legL: 65, legR: 65 }[p] - M.hp[p]; if (lost > 2) Md.hit({ part: p, dmg: lost, pen: 99, kind: 'bullet', bleed: 1, source: 'EARLIER WOUND' }, []); }
    if (!M.able && u.rich.state() === 'ok') Md.ko = Math.max(Md.ko, 40);   // (the cheap model had him down: keep him down a while)
  }
  function richLod() {
    const O = GS.richOpt; if (!O) return;
    const c = GS.cam, cand = [];
    for (const u of GS.units) {
      if (u.kind !== 'marine' || !u.alive) { if (u.richOn) u.richOn = false; continue; }
      const d = Math.hypot(u.x - c.x, u.y - c.y, u.z - c.z);
      if (u.B && u.B.near && d < (u.richOn ? O.r * 1.2 : O.r)) cand.push([d, u]); else if (u.richOn) u.richOn = false;
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < cand.length; i++) { const u = cand[i][1]; if (i < (O.max ?? 16)) { if (!u.richOn) enrich(u); } else u.richOn = false; }
  }

  // ------------------------------------------------------------------------------------------------- targets
  const tgtCache = new Map();
  function targetsFor(B, side) {
    const out = [];
    for (const u of B.units) {
      if (u.side === side) continue;
      if (u.kind === 'marine') {
        if (!u.alive || !u.able) { out.push({ id: u.id, side: 1, kind: 'inf', x: u.x, y: u.y, z: u.z, h: 0.4, alive: false }); continue; }
        const lawUp = u.wantLaw || u.firedT < 3 && u.lastFire === 'law';
        out.push({ id: u.id, side: 1, kind: lawUp ? 'at' : u.role === 'ar' && u.firedT < 2 ? 'mg' : 'inf', x: u.x, y: u.y, z: u.z, vx: u.vx, vz: u.vz, h: u.h, alive: true, firing: u.firedT, cover: u.body.stanceTo === 'prone' ? 0.5 : u.body.stanceTo === 'crouch' ? 0.3 : 0 });
      } else if (u.side === 1) out.push({ id: u.id, side: 1, kind: 'vehicle', x: u.x, y: u.y, z: u.z, vx: u.vx, vz: u.vz, h: u.h, alive: u.alive, firing: u.firedT, cover: 0, armour: true });   // PARITY: our tank, as the machines' squad AI sees armour
      else out.push({ id: u.id, side: 2, kind: u.kind, x: u.x, y: u.y, z: u.z, vx: u.vx, vz: u.vz, h: u.h ?? HEIGHT[u.kind], alive: u.alive, firing: u.firedT, cover: 0, coil: u.weaponName === 'coil' });
    }
    if (hooks.targetsFor) for (const t of hooks.targetsFor(B, side)) out.push(t);
    return out;
  }
  // PARITY (ngc/parity): combined arms for the Task Force. An armour squad with a 'take' order keeps station ~30 m
  // behind the Marine squad nearest it, on the line from the Marines to the objective: the riflemen lead onto the pad
  // and clear the ground, the tank overwatches and kills the machines (in contact the squad AI's armour logic takes
  // over: stand-off, hull-down, front to the AT threat). No Marines left on the island: the tank works to the order.
  function supportStep(B, dt) {
    if ((B.supT = (B.supT || 0) - dt) > 0) return; B.supT = 1;
    // the Marines count our tanks within 250 m in their force ratio (a tank ~ four riflemen, by its hit points)
    for (const M of B.mar.squads) {
      const up = M.members.filter(m => m.alive && m.able); M.allyPower = 0; if (!up.length) continue;
      const x = up.reduce((s, m) => s + m.x, 0) / up.length, z = up.reduce((s, m) => s + m.z, 0) / up.length;
      for (const u of B.units) if (u.side === 1 && u.kind === 'mbt' && u.alive && Math.hypot(u.x - x, u.z - z) < 250) M.allyPower += 4 * (0.3 + 0.7 * u.hp);
    }
    for (const S of B.tf.squads) {
      const C = S.cmd || S.order, tanks = S.members.filter(m => m.alive); if (!tanks.length) continue;
      const tx = tanks.reduce((s, m) => s + m.x, 0) / tanks.length, tz = tanks.reduce((s, m) => s + m.z, 0) / tanks.length;
      // the Marines within 200 m count in the tank squad's force ratio (as a machine's data link counts its neighbours)
      let ally = 0; for (const u of B.units) if (u.kind === 'marine' && u.alive && u.able && Math.hypot(u.x - tx, u.z - tz) < 200) ally += 0.7 * (u.role === 'ar' || u.laws > 0 ? 1.5 : 1);
      S.allyPower = ally;
      if (C.type !== 'take') { if (S.order !== C) S.order = C; continue; }
      let best = null, bd = 1e9;
      for (const M of B.mar.squads) { const up = M.members.filter(m => m.alive && m.able); if (!up.length) continue; const x = up.reduce((s, m) => s + m.x, 0) / up.length, z = up.reduce((s, m) => s + m.z, 0) / up.length, d = Math.hypot(x - tx, z - tz); if (d < bd) { bd = d; best = { x, z, S: M }; } }
      S.supports = best ? best.S.id : null;
      if (!best) { if (S.order !== C) S.order = C; continue; }
      let fx = C.x - best.x, fz = C.z - best.z, fl = Math.hypot(fx, fz);
      if (fl < 10) { fx = C.x - tx; fz = C.z - tz; fl = Math.hypot(fx, fz); }
      fl = fl || 1;
      let sx = best.x - fx / fl * 30, sz = best.z - fz / fl * 30;
      if (hAt(sx, sz) < 0.6) [sx, sz] = landward(B, [sx, sz]);
      if (S.order === C || S.order.type !== 'take' || !S.order.support) S.order = { type: 'take', x: sx, z: sz, r: 20, support: true };
      else { S.order.x = sx; S.order.z = sz; }
    }
  }
  // PARITY (ngc/parity): side 1's targets in the squad AI's words, for the Task Force's tanks (B.tf): enemy armour is a
  // 'vehicle'; a STRIDER with the coil rifle (an anti-armour weapon) is 'at', the rest 'mg' (an armoured walker: the
  // tank answers it with the main gun and the coax, not the coax alone); an AA site 'mg'
  const TF_KIND = { hovertank: 'vehicle', mbt: 'vehicle', aa: 'mg', vehicle: 'vehicle', air: 'air', inf: 'inf', mg: 'mg', at: 'at' };
  function tfTargets(tM) {
    const out = [];
    for (const t of tM) out.push(t.kind === 'strider' ? { ...t, kind: t.coil ? 'at' : 'mg' } : TF_KIND[t.kind] === t.kind ? t : { ...t, kind: TF_KIND[t.kind] || 'inf' });
    return out;
  }

  // ------------------------------------------------------------------------------------------------- the battle loop
  function stepBattle(B, dt, peace) {
    // (peace: the machines see nothing to fight)
    const tR = peace ? [] : targetsFor(B, 2), tM = targetsFor(B, 1), tmapR = new Map(), tmapM = new Map();
    for (const t of tR) tmapR.set(t.id, t); for (const t of tM) tmapM.set(t.id, t);
    B.rw.update(dt, tR); B.mar.update(dt, tM);
    // PARITY: the Task Force's tanks (their own squad AI, side 1), kept on the Marines they support
    let tmapA = tmapM;
    if (B.tf.squads.length) { supportStep(B, dt); const tA = tfTargets(tM); tmapA = new Map(); for (const t of tA) tmapA.set(t.id, t); B.tf.update(dt, tA); }
    else B.tf.sounds.length = 0;
    if (FC) FC.step(B, dt);   // ngc/infdepth: casualty care takes medics and draggers off the squad's plan
    for (const u of B.units) {
      if (u.kind === 'marine') { driveMarine(B, u, dt, tmapM); if (u.ai) u.lastFire = u.ai.fire || u.lastFire; }
      else if (!u.dead || u.kind === 'strider') driveRW(B, u, dt, peace, u.side === 1 ? tmapA : tmapR);
      u.firedT += u.kind === 'marine' ? 0 : dt;
      sync(u);
    }
  }
  function lod(B) {
    const c = GS.cam, I = B.I, d = Math.hypot(c.x - I.x, c.z - I.z) - I.r;
    const near = d < NEAR || o.full;
    if (near === B.near && B.units.length === B.lodN) return;   // (SIM MODE fix: units that join a far fight later go to the distant level too - they ran the full walker sim before)
    B.near = near; B.lodN = B.units.length;
    for (const u of B.units) {
      if (u.kind === 'strider') {
        if (!near && u.sim.up && u.alive) { u.lite = true; }
        else if (near && u.lite) { u.lite = false; if (u.sim.alive) u.sim.place(u.x, u.z, u.yaw, envLand); }
      } else if (u.kind === 'mbt') u.lite = !near;
    }
  }
  GS.step = (dt, ctx = {}) => {
    GS.time += dt; GS.events.length = 0; if (ctx.cam) GS.cam = ctx.cam;
    const peace = !!ctx.peace; GS.peace = peace;
    maps.tick(ctx.bakeMs ?? 2);
    for (const B of GS.battles) lod(B);
    richLod();   // ngc/infdepth
    for (const B of GS.battles) {
      if (!B.units.length) continue;
      for (const u of B.units) sync(u);
      if (B.near) stepBattle(B, dt, peace);
      else { B.acc += dt; if (B.acc >= 0.2) { const d = B.acc; B.acc = 0; stepBattle(B, d, peace); } }
    }
    // units in transit (hover tanks over the sea)
    for (const u of GS.units) if (u.transit && u.alive) stepTransit(u, dt);
    projStep(dt);
    // the dead lie a while, then go
    for (let i = GS.units.length - 1; i >= 0; i--) {
      const u = GS.units[i]; if (u.alive) continue;
      u.deadT += dt;
      // (ngc/infdepth: with care on, a Marine's body stays 7 min: lootable)
      if (u.deadT > (u.kind === 'marine' ? (o.care ? 420 : 120) : 150)) { GS.units.splice(i, 1); if (u.B) { const k = u.B.units.indexOf(u); if (k >= 0) u.B.units.splice(k, 1); } ev('remove', { id: u.id, u }); }
    }
    return GS.events;
  };
  function stepTransit(u, dt) {
    const T = u.transit, s = u.sim, rt = T.route;
    while (T.i < rt.length - 1 && Math.hypot(rt[T.i][0] - u.x, rt[T.i][1] - u.z) < 25) T.i++;
    const [tx, tz] = rt[T.i], dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz) || 1, last = T.i === rt.length - 1, sp = last ? Math.min(14, 2 + d * 0.4) : 15;
    vehicleStep(u, dt, { vx: dx / d * sp, vz: dz / d * sp });
    sync(u);
    if (last && d < 12) { const B = T.B; GS.join(B, u, T.order); ev('arrived', { id: u.id, kind: u.kind, I: B.I, x: u.x, z: u.z }); }
  }

  // ------------------------------------------------------------------------------------------------- projectiles
  const segBox = (ax, ay, az, bx, by, bz, cx, cy, cz, yaw, hx, hy, hz) => {
    const c = Math.cos(yaw), s = Math.sin(yaw), L = (x, z) => [(x - cx) * c - (z - cz) * s, (x - cx) * s + (z - cz) * c];
    const [lax, laz] = L(ax, az), [lbx, lbz] = L(bx, bz); let t0 = 0, t1 = 1;
    for (const [p, q, h] of [[lax, lbx, hx], [ay - cy, by - cy, hy], [laz, lbz, hz]]) {
      const d = q - p; if (Math.abs(d) < 1e-9) { if (Math.abs(p) > h) return -1; continue; }
      let u0 = (-h - p) / d, u1 = (h - p) / d; if (u0 > u1) { const t = u0; u0 = u1; u1 = t; } t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); if (t0 > t1) return -1;
    }
    return t0;
  };
  // a segment against one ground unit: entry t or -1
  function unitT(u, ax, ay, az, bx, by, bz, pad = 0) {
    if (u.kind === 'marine') return u.body.segHit(ax, ay, az, bx, by, bz, pad);
    if (u.kind === 'strider') {
      const s = u.sim, x = u.lite ? u.x : s.c[0], z = u.lite ? u.z : s.c[2];
      if (u.lite || s.up) { const t1 = segCyl(ax, ay, az, bx, by, bz, x, z, 0.3 + pad, u.y + 1.15, u.y + STRIDER.H + pad), t2 = segCyl(ax, ay, az, bx, by, bz, x, z, 0.17 + pad, u.y, u.y + 1.15); return t1 < 0 ? t2 : t2 < 0 ? t1 : Math.min(t1, t2); }
      return segCyl(ax, ay, az, bx, by, bz, x, z, 0.9 + pad, u.y - 0.2, u.y + 0.8);
    }
    if (u.kind === 'hovertank') return segBox(ax, ay, az, bx, by, bz, u.sim.p[0], u.sim.p[1] + 0.35, u.sim.p[2], u.yaw, RW7.W / 2 + pad, 1.1 + pad, RW7.L / 2 + pad);
    const P = u.sim.P; return segBox(ax, ay, az, bx, by, bz, u.sim.p[0], u.sim.p[1] + P.H / 2 + 0.1, u.sim.p[2], u.yaw, P.W / 2 + pad, P.H / 2 + pad, P.hullL / 2 + pad);
  }
  const RAD = { marine: 1.2, strider: 1.4, hovertank: 5, mbt: 5.5 };
  // every unit of the other side within reach of a segment (cheap bounding test first)
  function* candidates(side, ax, az, bx, bz, extra = 0) {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, half = Math.hypot(bx - ax, bz - az) / 2 + 6 + extra;
    for (const u of GS.units) {
      if (u.side === side) continue;
      if (!u.alive && !(u.kind === 'strider' && !u.lite)) continue;
      if (Math.abs(u.x - mx) > half || Math.abs(u.z - mz) > half) continue;
      yield u;
    }
  }
  function nearMissAt(p, u, ax, az, bx, bz) {
    if (!u.alive || !u.B) return;
    const cx = u.x - ax, cz = u.z - az, L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1, k = clamp((cx * (bx - ax) + cz * (bz - az)) / L2, 0, 1), dd = Math.hypot(ax + (bx - ax) * k - u.x, az + (bz - az) * k - u.z);
    if (dd > (u.kind === 'marine' ? 3 : 2.5)) return;
    if (!p.near) p.near = new Set(); if (p.near.has(u.id)) return; p.near.add(u.id);
    if (u.kind === 'marine') u.B.mar.nearMiss(u.id, p.big ? 0.6 : p.ammo === 'mg' || p.ammo === 'needle' ? 0.14 : 0.1);
    else aiOf(u.B, u).nearMiss(u.id, p.big ? 0.4 : 0.12);
  }
  // the terrain (and on a battle map its obstacles) along a segment: t or -1
  function groundT(ax, ay, az, bx, by, bz) {
    const I = maps.at((ax + bx) / 2, (az + bz) / 2);
    if (I && maps.has(I) && maps.get(I).ready) { const r = maps.get(I).world.raycast(ax, ay, az, bx, by, bz); return r ? r.t : -1; }
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 3));
    for (let i = 1; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t; if (y < Math.max(terrainH(x, z), 0)) return t; }
    return -1;
  }
  // apply a hit-info to a unit; returns { part, pen, kia }
  function applyHit(u, h, hp) {
    if (u.kind === 'marine' && u.rich) {   // ngc/infdepth: MEDINV decides (hit-info in, alive / down / back up out)
      if (!u.body.alive) return { part: null };
      const S = u.rich.S, hd = h.direction || { x: 0, y: 0, z: -1 };
      if (h.type === 'blast' || h.type === 'frag' || !h.point) {
        const dist = clamp((1 - Math.min(1, hp / 260)) * 9, 1, 12);
        for (const f of fragmentHits(hp > 200 ? 'M72' : 'M406', dist, R, { prone: S.stance === 'prone' })) u.rich.hit({ ...f, source: h.weapon || 'BLAST' });
        u.lastPart = 'blast';
      } else {
        const part = partAt(u.body, h.point), spec = RICH_HIT[h.weapon] || { dmg: hp, pen: 40, bleed: 1.2 };
        // GAME rule as the cheap model: the M1 steel helmet turns 40 % of rifle hits on the head into a glance (a ringing
        // head, blunt) - MEDINV alone let every head hit through and the near Marines died twice as often
        const glance = part === 'head' && hp <= 300 && R() < 0.4;
        u.rich.hit(glance ? { kind: 'blunt', part, dmg: spec.dmg * 0.3, source: h.weapon } : { kind: 'bullet', part, dmg: hp > 300 ? hp : spec.dmg, pen: spec.pen, bleed: spec.bleed, dir: [hd.x, hd.y, hd.z], victimYaw: S.yaw, source: h.weapon });
        u.lastPart = part;
      }
      richState(u);
      return { part: u.lastPart, pen: true, kia: !u.body.alive };
    }
    if (u.kind === 'marine') {
      if (!u.body.alive) return { part: null };
      const wasAble = u.body.able, r = u.body.hit({ point: h.point, hp, kind: h.type === 'blast' || h.type === 'frag' ? 'blast' : 'bullet', why: h.weapon });
      if (r.kia) { GS.stats.kia++; u.B?.mar.casualty(u.id, 'kia'); ev('kia', { id: u.id, x: u.x, y: u.y, z: u.z, part: r.part, I: u.B?.I }); }
      else if (r.wia || (wasAble && !u.body.able)) { GS.stats.wia++; u.B?.mar.casualty(u.id, 'wia'); ev('wia', { id: u.id, x: u.x, y: u.y, z: u.z, part: r.part, I: u.B?.I }); }
      sync(u); return { part: r.part, pen: true, kia: r.kia };
    }
    if (u.lite && u.kind === 'strider' && !h.part) h.part = ['thorax', 'stomach', 'legL', 'legR', 'armL', 'armR', 'head'][Math.floor(R() * 7)];
    const r = u.sim.hit(h);
    if (!u.sim.alive && u.alive) killed(u);
    return r;
  }
  GS.applyHit = applyHit;
  function projStep(dt) {
    for (let i = GS.proj.length - 1; i >= 0; i--) {
      const p = GS.proj[i]; p.life -= dt;
      const ax = p.x, ay = p.y, az = p.z;
      // an M67 on the ground: lies there until the fuse runs out
      if (p.rest) { p.fuse -= dt; if (p.fuse <= 0) { explode(p, p.x, p.y, p.z, null); GS.proj.splice(i, 1); } continue; }
      p.vy -= 9.81 * dt; const bx = ax + p.vx * dt, by = ay + p.vy * dt, bz = az + p.vz * dt;
      // point defence (RW-7): an incoming rocket within 45 m gets a flechette burst
      if ((p.heat || p.gl) && p.side === 1 && pdIntercept(bx, by, bz)) { GS.proj.splice(i, 1); continue; }
      let hitT = 2, what = null;
      const gt = groundT(ax, ay, az, bx, by, bz); if (gt >= 0) { hitT = gt; what = { ground: true }; }
      for (const u of candidates(p.side, ax, az, bx, bz)) {
        const t = unitT(u, ax, ay, az, bx, by, bz);
        if (t >= 0 && t < hitT && (u.alive || u.kind === 'strider')) { hitT = t; what = { unit: u }; }
        else if (t < 0) nearMissAt(p, u, ax, az, bx, bz);
      }
      if (p.side === 2 && hooks.extSeg) { const r = hooks.extSeg(p, ax, ay, az, bx, by, bz); if (r && r.t < hitT) { hitT = r.t; what = { ext: r }; } }
      if (hitT <= 1) {
        const hx = ax + (bx - ax) * hitT, hy = ay + (by - ay) * hitT, hz = az + (bz - az) * hitT, sp = Math.hypot(p.vx, p.vy, p.vz);
        if (p.frag) {   // a grenade: bounces and rolls a metre or two (GAME), then lies there; or off already if the fuse ran out
          const k = Math.min(2, sp * 0.12), hl = Math.hypot(p.vx, p.vz) || 1, rxp = hx + p.vx / hl * k, rzp = hz + p.vz / hl * k;
          p.x = rxp; p.z = rzp; p.y = hAt(rxp, rzp) + 0.05; p.vx = p.vy = p.vz = 0; p.rest = true;
          if (p.fuse <= 0) { explode(p, p.x, p.y, p.z, null); GS.proj.splice(i, 1); }
          continue;
        }
        if (what.unit) {
          const u = what.unit, A = GW_AMMO[p.ammo], h = normalizeHit({ ...A, velocity: A.velocity, vel: [p.vx, p.vy, p.vz], point: [hx, hy, hz], side: p.side, weapon: p.ammo, src: p.src });
          const r = applyHit(u, h, (RW_HURT[p.ammo] || { hp: 60 }).hp);
          GS.stats.hits[p.side]++;
          ev('hit', { x: hx, y: hy, z: hz, id: u.id, kind: u.kind, part: r.part, pen: r.pen, ammo: p.ammo, side: p.side });
          if (u.B && u.kind !== 'marine') aiOf(u.B, u).nearMiss(u.id, 0.3);
        } else if (what.ext) what.ext.apply(hx, hy, hz);
        if (p.heat || p.big || p.gl) explode(p, hx, hy, hz, what.unit);
        else ev('impact', { x: hx, y: hy, z: hz, ammo: p.ammo, unit: !!what.unit, ground: !!what.ground, side: p.side });
        GS.proj.splice(i, 1); continue;
      }
      p.x = bx; p.y = by; p.z = bz;
      if (p.frag && (p.fuse -= dt) <= 0) { explode(p, bx, by, bz, null); GS.proj.splice(i, 1); continue; }   // (an air burst: cooked too long)
      if (p.gl && p.life <= 0) { explode(p, bx, by, bz, null); GS.proj.splice(i, 1); continue; }
      if (p.life <= 0 || p.y < -20) GS.proj.splice(i, 1);
    }
  }
  function pdIntercept(x, y, z) {
    for (const u of GS.units) if (u.kind === 'hovertank' && u.alive && u.sim.pdCool <= 0 && u.sim.hp.pd > 0) {
      const d = Math.hypot(x - u.x, y - u.y - 1.5, z - u.z);
      if (d < 45 && d > 6) { u.sim.pdCool = 1.4; const ok = R() < 0.55; ev('pd', { id: u.id, x, y, z, ok, from: [u.x, u.y + 2.4, u.z] }); return ok; }
    }
    return false;
  }
  GS.pdIntercept = pdIntercept;
  function explode(p, x, y, z, direct) {
    const big = p.frag ? 0.5 : p.gl ? 0.45 : p.heat ? 1 : 0.75;
    ev('blast', { x, y, z, big, ammo: p.ammo, side: p.side });
    GS.blast(x, y, z, p.frag ? 6 : p.gl ? 5 : 7, big, p.side, direct);
    if (p.side === 2 && hooks.extBlast) hooks.extBlast(x, y, z, p.big ? 7 : 5, big, p.side);
  }
  // a blast at (x, y, z): striders get the blast hit-info (pushes, jolts, damage), vehicles a blast on top, Marines
  // fragments by distance; everyone near is suppressed. power ~ 1 for a LAW / rocket, 0.45 a 40 mm, 3+ a bomb.
  GS.blast = (x, y, z, r, power, side, direct = null) => {
    for (const u of candidates(side, x - r, z - r, x + r, z + r, 4)) {
      if (!u.alive || u === direct) continue;
      const dd = Math.hypot(u.x - x, u.y + 1 - y, u.z - z), reach = u.kind === 'marine' ? r * 1.3 : r;
      if (dd > reach + (RAD[u.kind] || 1) * 0.5) continue;
      const k = clamp(1 - dd / (reach + 0.5), 0.05, 1), dx = (u.x - x) / (dd || 1), dz = (u.z - z) / (dd || 1);
      if (u.kind === 'marine') applyHit(u, { point: null, type: 'blast' }, 260 * power * k);
      else if (u.kind === 'strider') applyHit(u, normalizeHit({ type: 'blast', energy: 9000 * k * power, impulse: 260 * k * power, dir: [dx, 0.3, dz], part: 'stomach', side }), 0);
      else applyHit(u, normalizeHit({ type: 'blast', energy: 30000 * k * power, impulse: 400 * k * power, dir: [dx, -0.5, dz], part: 'top', side }), 0);
      if (u.B) { if (u.kind === 'marine') u.B.mar.nearMiss(u.id, 0.6 * k + 0.2); else aiOf(u.B, u).nearMiss(u.id, 0.5 * k); }
    }
    // suppression a bit further out
    for (const B of GS.battles) if (Math.hypot(B.I.x - x, B.I.z - z) < B.I.r + 80) {
      hearAll(B, { x, y, z, loud: 600, side, kind: 'blast' });
      for (const u of B.units) if (u.alive && u.side !== side) { const dd = Math.hypot(u.x - x, u.z - z); if (dd < r * 2.5 && dd > r) { if (u.kind === 'marine') B.mar.nearMiss(u.id, 0.25); else aiOf(B, u).nearMiss(u.id, 0.15); } }
    }
  };
  // ------------------------------------------------------------------------------------------------- the war's rounds
  // a war.js projectile's path this frame (side 1: the player's guns, rockets, bombs; side 2: WASPs, flak) against the
  // ground units. Returns { t, unit, x, y, z } after applying the hit, or null. ammo: a GW_AMMO id.
  GS.segHit = (side, ammo, ax, ay, az, bx, by, bz, hp, pad = 0) => {
    let best = null, bt = 2;
    for (const u of candidates(side, ax, az, bx, bz, pad + 2)) {
      const t = unitT(u, ax, ay, az, bx, by, bz, pad);
      if (t >= 0 && t < bt && u.alive) { bt = t; best = u; }
      else if (t < 0 && u.B) nearMissAt({ ammo, big: false, near: null }, u, ax, az, bx, bz);
    }
    if (!best) return null;
    const x = ax + (bx - ax) * bt, y = ay + (by - ay) * bt, z = az + (bz - az) * bt;
    const A = GW_AMMO[ammo] || GW_AMMO.m60, h = normalizeHit({ ...A, velocity: A.velocity, vel: [bx - ax, by - ay, bz - az], point: [x, y, z], side, weapon: ammo, src: 'war' });
    const r = applyHit(best, h, hp ?? 60); GS.stats.warHits[side]++;   // (war.js rounds: not in GS.stats.shots, so not in GS.stats.hits)
    ev('hit', { x, y, z, id: best.id, kind: best.kind, part: r.part, pen: r.pen, ammo, side, war: true });
    return { t: bt, unit: best, x, y, z };
  };
  // the war's projectiles are heard by the battles they pass near (the door gun draws the machines' attention)
  GS.hearWar = (x, y, z, side, loud = 350, src = 'player') => { for (const B of GS.battles) if (B.units.length && Math.hypot(B.I.x - x, B.I.z - z) < B.I.r + loud) { const s = { x, y, z, loud, side, kind: 'shot', src }; hearAll(B, s); } };
  // ngc/infdepth: the player's own rounds (marine.js's rifleman, game level like the rest): a segment against one unit,
  // and a hit on it (the M16's M193 = 'm16', the M60's M80 = 'm60', the .45 = 'm16' at 0.6)
  GS.unitT = unitT;
  GS.hitUnit = (side, ammo, u, x, y, z, dir, hp) => {
    const A = GW_AMMO[ammo] || GW_AMMO.m16, h = normalizeHit({ ...A, velocity: A.velocity, vel: [dir[0] * A.velocity, dir[1] * A.velocity, dir[2] * A.velocity], point: [x, y, z], side, weapon: ammo, src: 'player' });
    const r = applyHit(u, h, hp ?? 60); GS.stats.warHits[side]++;
    ev('hit', { x, y, z, id: u.id, kind: u.kind, part: r.part, pen: r.pen, ammo, side, war: true });
    if (u.B && u.kind !== 'marine') aiOf(u.B, u).nearMiss(u.id, 0.3);
    return r;
  };
  // ngc/infdepth: casualty evacuation. The wounded (alive, out of the fight) of side 1 within r of (x, z); evacuate(u)
  // takes one out of the battle (aboard a CH-46 or the player's Huey): he leaves the squad, alive.
  GS.casualties = (x, z, r) => GS.units.filter(u => u.kind === 'marine' && u.alive && !u.able && !u.evac && Math.hypot(u.x - x, u.z - z) < r);
  GS.evacuate = u => {
    u.evac = true; GS.stats.evac++;
    const k = GS.units.indexOf(u); if (k >= 0) GS.units.splice(k, 1);
    if (u.B) { const j = u.B.units.indexOf(u); if (j >= 0) u.B.units.splice(j, 1); }
    if (u.squad && u.squad.members) { const j = u.squad.members.indexOf(u); if (j >= 0) u.squad.members.splice(j, 1); }
    ev('evac', { id: u.id, x: u.x, y: u.y, z: u.z, u }); ev('remove', { id: u.id, u });
  };
  GS.reset = () => { GS.battles.length = 0; GS.units.length = 0; GS.proj.length = 0; GS.events.length = 0; GS.time = 0; };
  GS.hAt = hAt; GS.envLand = envLand; GS.armorEnv = armorEnv;
  return GS;
}
