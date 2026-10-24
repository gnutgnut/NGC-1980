// motorpool.js - the wheeled vehicles in the game (ngc/wheeledgame): who exists where, and everything they share.
//   - M151A2s and M35A2s at the friendly islands' motor pools and on the ALBATROSS's deck park; more by delivery (key 7 /
//     9, materiel), restocked when an island is taken;
//   - real 1980 civilian cars parked in the towns' gardens (world/parked.js), which you can commandeer;
//   - the WORLD's traffic drawn with the same cars (baked into its instanced meshes) and, near the player, run by the
//     real sim (low level of detail) through driver.js createFollower, then handed back to the WORLD further away;
//   - the shared pieces: the world env (wheeledenv.js), the MG rounds (vehicleguns.js), the engine sound (WheeledAudio on
//     the game's bus: your vehicle, and the nearest other one running), the crew's wounds (the Marine's medical, which
//     keeps running while he rides), refuelling / repairs / rearming at the motor pools, blasts from fx.explode.
//
//   const pool = createMotorPool({ scene, GR, crafts, war, fx, sfx, say, feed, keyDown, CTL, hwOn, camZ, foot, marine,
//     world, ISLANDS, G, terrainH, holes, serviceAt, selIsl, delivery });
//   pool.newGame(); each frame pool.update(dt, playing); pool.deliver('m151' | 'm35'); pool.list; pool.first(type)
import { createWheeledCraft, TYPES, buildModel } from './wheeledcraft.js';
import { createWorldEnv } from './wheeledenv.js';
import { createWorldObstacles } from './wheeledworld.js';
import { createGunRounds } from './vehicleguns.js';
import { createDelivery } from './delivery.js';
import { WheeledAudio } from './wheeledaudio.js';
import { InfantryAudio } from '../infantry/infantryaudio.js';
import { bakeModel } from './wheeledbake.js';
import { createFollower } from './driver.js';
import { lookFrom } from './modelkit.js';
import { createWheeledSim } from './index.js';
import { roadAt, roadById, roadPoint, roadGraph } from '../../world/net.js';
import * as THREE from 'three';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
// the WORLD's traffic kinds that are one of our drivable cars, and the WORLD's speeds (ambient.js VMAX, m/s)
const CIV_OF = { saloon: 'lada', hatch: 'beetle', estate: 'lada', van: 'landrover', pickup: 'hilux' };
const VMAX = { tarmac: 21, lane: 15, street: 9, dirt: 7 };
const TAKE_R = 150, GIVE_R = 240, MAX_SIM_TRAFFIC = 6, PARK_R = 320, UNPARK_R = 520, MAX_PARKED = 18;

export function createMotorPool(o) {
  const { scene, GR, crafts, war, fx, sfx, say, feed, foot, world, ISLANDS, G } = o;
  const list = [];
  const spec = t => createWheeledSim(t).spec;
  // ---------------------------------------------------------------- shared pieces
  const WO = createWorldObstacles({ terrainH: o.terrainH, zoneItems: () => (world && world.zone ? world.zone.flatMap(e => e.items || []) : []) });
  const vehiclesNear = (V, x, z, r) => { const out = V._others || (V._others = []); out.length = 0; for (const U of list) { if (U === V || !U.exists) continue; const s = U.sim; if (Math.abs(s.pos[0] - x) < r + 8 && Math.abs(s.pos[2] - z) < r + 8) { const b = U.bounds(); if (b) out.push(b); } } return out; };
  const WENV = createWorldEnv({ GR, terrainH: o.terrainH, holes: o.holes || [], world: { roadAt, roadById, roadPoint, buildingsNear: (x, z, r) => WO.near(x, z, r), vehiclesNear,
    shipNear: (x, z, r) => war.units.some(u => u.dims && Math.abs(u.p.x - x) < r && Math.abs(u.p.z - z) < r) } });
  let ia = null;
  const infAudio = () => { if (!ia && sfx.ctx && sfx.master) { ia = new InfantryAudio(sfx.ctx, sfx.master); ia.init(); } return ia; };
  const delivery = o.noDelivery ? null : createDelivery({ scene, war, GR, fx, sfx, say, feed, terrainH: o.terrainH, camZ: o.camZ });
  const guns = createGunRounds({ scene, war, fx, terrainH: o.terrainH, GR, audio: infAudio });
  // a cache of built models (they are heavy: ~30 meshes, canvases for the gauges) for cars that come and go
  const MODELS = new Map();
  const models = {
    take: (type, colour) => { const a = MODELS.get(type + ':' + colour); return a && a.length ? a.pop() : null; },
    give: (type, colour, m) => { m.group.visible = false; const k = type + ':' + colour; if (!MODELS.has(k)) MODELS.set(k, []); const a = MODELS.get(k); if (a.length < 4) a.push(m); else scene.remove(m.group); },
  };
  // ---------------------------------------------------------------- the crew: wounds, medical while riding
  const _at = new THREE.Vector3(), _dir = new THREE.Vector3(), _q = new THREE.Quaternion();
  const seatWorld = (V, out, up = 0.55) => { const s = V.seats[V.seat], S = V.sim; _q.set(S.q[0], S.q[1], S.q[2], S.q[3]); return out.set(s.at[0], s.at[1] + up, s.at[2]).applyQuaternion(_q).add(_at.set(S.pos[0], S.pos[1], S.pos[2])); };
  const _sw = new THREE.Vector3();
  function crewHit(V, e) {
    const m = o.marine, why = { rifle: 'RIFLE FIRE', hmg: 'HEAVY MG FIRE', cannon: 'CANNON FIRE', blast: 'BLAST', frag: 'FRAGMENTS', crash: 'CRASH', rollover: 'ROLLOVER', fire: 'BURNS' }[e.cause] || 'HIT';
    if (e.cause === 'rifle' || e.cause === 'hmg' || e.cause === 'cannon') {
      const at = seatWorld(V, _sw.clone()), d = V._hitDir ? _dir.copy(V._hitDir) : _dir.set(0, -0.3, 1).normalize();
      at.addScaledVector(d, -0.05);
      foot.hurt(0.2, why, at, d, e.cause === 'rifle' ? 'b' : 'jb');
    } else if (e.cause === 'fire' && m && m.M) {
      const part = ['legL', 'legR', 'armL', 'armR', 'thorax'][Math.floor(Math.random() * 5)];
      try { m.M.damage(part, e.dmg * 140); } catch { /* the medical's own API changed: fall back */ foot.hurt(0.05, why); }
      if (m.MS && m.MS.M && m.MS.M.dead && !m.MS.dead) { m.MS.dead = true; m.MS.cause = 'BURNED TO DEATH'; }
      if (m.isDead && m.isDead()) foot.hurt(0, 'BURNED TO DEATH');
      say('BURNS  -  GET OUT OF THE FIRE', 1.2);
    } else foot.hurt(clamp(e.dmg * 0.45, 0.04, 0.5), why, null, null, null);
  }
  let medAcc = 0;
  function rideTick(dt, V) {
    // the Marine rides with his wounds: keep him (the walker) at the seat, his medical running (bleeding goes on)
    const W = foot.W; if (W) { seatWorld(V, _sw, 0); W.x = _sw.x; W.y = _sw.y - 0.75; W.z = _sw.z; }
    const m = o.marine; if (!m || !m.MS || !m.MS.M) return;
    medAcc += dt;
    if (medAcc >= 0.1) {
      const M = m.MS.M; M.update(medAcc, { exertion: 0.12, moving: false }); medAcc = 0;
      if (M.dead && !m.MS.dead) { m.MS.dead = true; m.MS.cause = M.cause || 'DIED OF WOUNDS'; }
      if (m.MS.dead && foot.alive) foot.hurt(0, m.MS.cause);
    }
  }
  const medLine = () => {
    const m = o.marine, M = m && m.MS && m.MS.M; if (!M) return '';
    const br = M.bleedRate ? M.bleedRate() : 0, loss = M.lossFrac ? M.lossFrac() : 0;
    return br > 5 ? `  ·  BLEEDING ${Math.round(br)} ml/min` : loss > 0.1 ? `  ·  BLOOD LOSS ${Math.round(loss * 100)}%` : '';
  };
  // ---------------------------------------------------------------- the craft context
  const ctx = {
    scene, GR, crafts, war, fx, sfx, say, feed, keyDown: o.keyDown, CTL: o.CTL, hwOn: o.hwOn, camZ: o.camZ, WENV, guns, models,
    crewHit, rideTick, medLine: () => medLine(), hover: o.hover, getInOut: o.getInOut,
    silence: () => mute(),
    commandeer: V => commandeer(V),
    key: (V, code) => troopKey(V, code),
    hintExtra: V => V.type === 'm35' ? 'B TROOPS  ·  ' : '',
    onEnter: V => { V.owner = V.owner === 'civ' ? 'player' : V.owner; },
    onExit: () => {},
    unitLost: o.unitLost,   // COMMANDER: a wrecked military vehicle is the fleet's loss
  };
  const _hurt = (V) => { const h = V.hurt; V.hurt = (a, why, at, dir, kind) => { V._hitDir = dir ? new THREE.Vector3(dir.x, dir.y, dir.z).normalize() : null; return h(a, why, at, dir, kind); }; };
  // ---------------------------------------------------------------- spawning
  let serial = 0;
  function spawn(type, sp, opt = {}) {
    if (!sp) return null;
    const V = createWheeledCraft(ctx, type, { id: `${type}-${++serial}`, colour: opt.colour, variant: opt.variant, owner: opt.owner });
    _hurt(V);
    crafts.register(V); list.push(V);
    V.spawnAt(sp, opt);
    if (opt.home) V.home = opt.home;
    return V;
  }
  // ---- one spawn function per vehicle type, for a COMMANDER menu (or any other caller): no materiel, no delivery.
  //   where: an island (its motor pool spot), 'deck' (the ALBATROSS's deck park), or a spot { x, z, yaw?, y?, plat?,
  //          exact? } (the nearest clear, dry, gentle place within 40 m of it unless plat / exact)
  //   opt:   { running, owner ('player' | 'civ'), colour, home } -> the craft (pool.list, crafts) or null (no room)
  //   pool.spawnM151(I)  pool.spawnM35({ x, z, yaw })  pool.spawnLandRover / spawnHilux / spawnBeetle / spawnLada
  //   pool.spawners[type](where, opt) is the same table keyed by type (TYPES' keys)
  function spotFor(type, where) {
    const r = type === 'm35' ? 3.6 : 2.4;
    if (!where) return null;
    if (where === 'deck') return GR.deckSpot(0) || GR.deckSpot(1) || GR.deckSpot(2);
    if (where.pad || where.structs) return GR.motorPool(where, r);   // an island
    if (!Number.isFinite(where.x) || !Number.isFinite(where.z)) return null;
    const mk = (x, z) => ({ name: where.name || 'SPAWN', x, z, y: where.y, yaw: where.yaw || 0, plat: where.plat || null });
    if (where.plat || where.exact) return mk(where.x, where.z);   // a deck spot / the caller knows best
    // the nearest clear, dry, gentle spot within 40 m (no roof, wall, tree or vehicle; the ground within 2 r level to ~7 deg)
    const T = o.terrainH, ok = (x, z) => { const h = T(x, z); if (h < 0.3) return false; let lo = h, hi = h; for (let k = 0; k < 8; k++) { const c = Math.cos(k * 0.785), sn = Math.sin(k * 0.785); for (const R of [r, 2 * r]) { const y = T(x + c * R, z + sn * R); lo = Math.min(lo, y); hi = Math.max(hi, y); } } return (hi - lo) / (4 * r) < 0.12 && GR.clearAt(x, z, r) && !WO.near(x, z, r + 1).boxes.length && !list.some(V => V.exists && Math.hypot(V.sim.pos[0] - x, V.sim.pos[2] - z) < r + 3); };
    for (let d = 0; d <= 40; d += 3) for (let k = 0, n = d ? Math.ceil(d * 1.2) : 1; k < n; k++) { const a = k / n * Math.PI * 2, x = where.x + Math.sin(a) * d, z = where.z + Math.cos(a) * d; if (ok(x, z)) return mk(x, z); }
    return null;
  }
  function spawnType(type, where, opt = {}) {
    const sp = spotFor(type, where); if (!sp) return null;
    const home = opt.home ?? (where === 'deck' ? 'deck' : where && (where.pad || where.structs) ? where : null);
    return spawn(type, sp, { owner: TYPES[type].civ ? 'civ' : undefined, ...opt, home });
  }
  const spawners = Object.fromEntries(Object.keys(TYPES).map(t => [t, (where, opt) => spawnType(t, where, opt)]));
  function remove(V) {
    if (crafts.active === V) return false;
    const i = list.indexOf(V); if (i >= 0) list.splice(i, 1);
    V.dispose(); crafts.unregister(V); return true;
  }
  // two spots beside a pad: the motor pool and the next clear one
  function stockIsland(I, types = ['m151', 'm35']) {
    const out = [];
    for (const t of types) { const sp = GR.motorPool(I, t === 'm35' ? 3.6 : 2.4); if (sp) out.push(spawn(t, sp, { home: I })); }
    I._wheeled = true; return out;
  }
  function newGame() {
    for (const V of [...list]) { if (crafts.active === V) crafts.setActive('heli'); remove(V); }
    parked.clear(); taken.clear(); guns.clear(); if (delivery) delivery.clear();
    for (const I of ISLANDS) I._wheeled = false;
    for (const I of ISLANDS) if (I.owner === 1 && I.pad) stockIsland(I);
    // the deck park: an M151 on spot 1; the M35 forward of the island, inboard of the park (spots 2 and 3: room to drive, the armour's M113)
    const d0 = GR.deckSpot(0), c = war.carrier, d2 = c && c.sinking === undefined ? (() => { const w = GR.toWorld(c, 3.5, -13); return { name: 'ALBATROSS DECK', x: w.x, z: w.z, y: GR.deckH(w.x, w.z), yaw: c.yaw, plat: c }; })() : null;
    if (d0) spawn('m151', d0, { home: 'deck' }); if (d2) spawn('m35', d2, { home: 'deck' });
  }
  // ---------------------------------------------------------------- deliveries (key 7 / 9): the delivery module flies / ships it in
  function deliver(type) {
    const T = TYPES[type], cost = T.cost;
    if (!o.pay && G.mat < cost) { say(`AN ${T.label} NEEDS ${cost} MATERIEL`, 1.6); return null; }
    let I = o.selIsl && o.selIsl() && o.selIsl().owner === 1 ? o.selIsl() : null;
    if (!I) { const Z = o.Z; let bd = 1e9; for (const J of ISLANDS) if (J.owner === 1 && J.pad) { const d = Math.hypot(J.pad.x - Z.pos.x, J.pad.z - Z.pos.z); if (d < bd) { bd = d; I = J; } } }
    const sp = (I && GR.motorPool(I, type === 'm35' ? 3.6 : 2.4)) || null;
    if (!sp) { say('NOWHERE TO PUT A VEHICLE', 1.6); return null; }
    if (o.pay) { const w = o.pay(type); if (w) { say(w, 1.8); return null; } } else G.mat -= cost;   // COMMANDER: o.pay - the fleet's reserve (else materiel buys one)
    if (delivery && I) return delivery.order(type, I, sp);   // a CH-46 slings the jeep in, an LCM-8 lands the truck (delivery.js)
    const V = spawn(type, sp, { home: I || 'deck' });
    feed(`MOTOR POOL: ${T.label} AT ${sp.name}`, 'good'); say(`${T.label} WAITING AT ${sp.name}`, 2.2); sfx.dock?.();
    return V;
  }
  // ---------------------------------------------------------------- the M35's troops (B at a pad)
  function padNear(x, z) { for (const I of ISLANDS) { const p = I.pad; if (p && Math.hypot(x - p.x, z - p.z) < 45) return I; } return null; }
  function troopKey(V, code) {
    if (code !== 'KeyB' || V.type !== 'm35') return false;
    const S = V.sim, I = padNear(S.pos[0], S.pos[2]);
    if (Math.abs(S.speed) > 0.6) { say('STOP FIRST', 1.2); return true; }
    if (V.troops > 0) {
      const n = V.troops; V.troops = 0; S.setLoad([]);
      say(I && I.owner !== 1 ? `${n} MARINES DISMOUNT  -  TAKING THE ${I.name} PAD` : `${n} MARINES DISMOUNT`, 2);
      if (I && I.owner !== 1) V.capBoost = 12;   // they hold the pad with you: the capture runs at a squad's pace
      return true;
    }
    if (!I || I.owner !== 1) { say('MARINES BOARD AT ONE OF OUR PADS (OR THE ALBATROSS)', 1.8); return true; }
    V.troops = 6;
    S.setLoad(V.T.troops.map(id => ({ kg: 105, at: S.spec.seats.find(s => s.id === id).at })));   // a Marine with his kit, ~105 kg
    say(`6 MARINES ABOARD  -  ${I.name}`, 1.8);
    return true;
  }
  // ---------------------------------------------------------------- commandeering
  function commandeer(V) {
    const t = V.traffic; if (!t) return;
    V.traffic = null; V.owner = 'player';
    say(`${V.label} COMMANDEERED  -  THE DRIVER RUNS FOR IT`, 2.2); feed(`COMMANDEERED A ${V.label}`, 'good');
  }
  // ---------------------------------------------------------------- parked town cars
  const parked = new Map(), taken = new Set();   // key -> V; spots whose car you drove off (not refilled)
  let parkT = 0;
  function updateParked(cx, cz) {
    for (const c of WO.parkedCars(cx, cz, PARK_R)) {
      if (parked.has(c.key) || taken.has(c.key) || parked.size >= MAX_PARKED) continue;
      if (Math.hypot(c.x - cx, c.z - cz) > PARK_R) continue;
      const V = spawn(c.kind, { x: c.x, y: c.y, z: c.z, yaw: c.yaw, plat: null }, { colour: c.paint, owner: 'civ' });
      if (V) { V.parkKey = c.key; parked.set(c.key, V); }
    }
    for (const [k, V] of parked) {
      const d = Math.hypot(V.sim.pos[0] - cx, V.sim.pos[2] - cz);
      if (V.owner === 'player') { parked.delete(k); taken.add(k); continue; }   // yours now: the spot stays empty
      if (d > UNPARK_R && crafts.active !== V) { parked.delete(k); remove(V); }
    }
  }
  // ---------------------------------------------------------------- WORLD traffic: the instanced cars are ours, near ones run on the sim
  const amb = () => world && world.ambient;
  function installTrafficModels() {
    const A = amb(); if (!A || !world.traffic) return;
    const done = {};
    for (const [kind, type] of Object.entries(CIV_OF)) {
      const sp = spec(type);
      if (!done[type]) { const m = buildModel(type, 0, {}); done[type] = bakeModel(m.group, { paint: sp.colours[0], flip: true, srgb: true }); }
      world.traffic.setModel(kind, { geometry: done[type].clone(), length: sp.dims.L });
      A.paints[kind] = sp.colours.slice();
    }
  }
  try { installTrafficModels(); } catch (e) { console.warn('traffic models', e); }
  const simCars = () => list.filter(V => V.traffic);
  function pathFrom(R, s, dir, lat, len = 260) {
    const pts = [], q = {}, vmax = VMAX[R.type] || 12;
    for (let d = 0; d <= len; d += 8) {
      const ss = s + dir * d; if (ss < 0.5 || ss > R.len - 0.5) break;
      roadPoint(R, ss, lat * dir, q); pts.push({ x: q.x, z: q.z, v: q.bridge ? Math.min(vmax, 11) : vmax, s: ss });
    }
    return pts;
  }
  const laneOf = R => R.type === 'dirt' ? 0 : Math.min(1.7, R.hw * 0.48);   // ambient.js keeps right like this
  function gapAhead(V) {
    const S = V.sim, fx_ = S.fwdv[0], fz = S.fwdv[2], l = Math.hypot(fx_, fz) || 1, ux = fx_ / l, uz = fz / l, px = S.pos[0], pz = S.pos[2];
    let gap = Infinity;
    const test = (x, z, half = 2.2) => { const dx = x - px, dz = z - pz, al = dx * ux + dz * uz; if (al <= 0 || al > 70) return; const lat = Math.abs(-dx * uz + dz * ux); if (lat < 2.1) gap = Math.min(gap, al - half - S.spec.dims.L / 2); };
    const Z = o.Z; if (Z && crafts.active) test(Z.pos.x, Z.pos.z, crafts.active.kind === 'foot' ? 0.6 : 2.4);
    for (const U of list) if (U !== V && U.exists) test(U.sim.pos[0], U.sim.pos[2], U.spec.dims.L / 2);
    const A = amb(); if (A) for (const c of A.cars) if (!c.wreck) test(c.x, c.z, 2.3);
    V.traffic.blocked = gap < 9 ? (V.traffic.blocked || 0) + 1 : 0;
    return gap;
  }
  function takeover(c, gear) {
    const type = CIV_OF[c.kind]; if (!type) return null;
    const sp = spec(type), colour = Math.max(0, sp.colours.indexOf(c.col));
    const yaw = c.yaw + Math.PI, lat = laneOf(c.R);
    const path = pathFrom(c.R, c.s, c.dir, lat); if (path.length < 4) return null;
    const V = spawn(type, { x: c.x, y: c.y - (c.R.type === 'dirt' ? 0.1 : 0.14) + 0.05, z: c.z, yaw, plat: null }, { colour, owner: 'traffic', running: true, launch: { v: Math.max(0, c.v), gear } });
    if (!V) return null;
    V.lod = 'far'; V.sim.setLod('far');
    V.traffic = { R: c.R, dir: c.dir, lat, kind: c.kind, col: c.col, path, F: createFollower(path, { speed: VMAX[c.R.type] || 12, latG: 0.22, gap: () => gapAhead(V), stopDist: 3 }) };
    amb().release(c);
    return V;
  }
  function giveBack(V) {
    const t = V.traffic, S = V.sim, A = amb(); if (!A) return remove(V);
    // where along its road it is: the waypoint it was making for
    const F = t.F, p = t.path[Math.min(t.path.length - 1, F.i + 1)] || t.path[t.path.length - 1];
    A.adopt({ R: t.R, s: clamp(p.s, 0.1, t.R.len - 0.1), dir: t.dir, v: Math.abs(S.speed), kind: t.kind, col: t.col, x: S.pos[0], y: S.pos[1], z: S.pos[2] });
    remove(V);
  }
  function gearFor(type, v) {   // the gear a driver would be in at v m/s (~2200 rpm)
    const sp = spec(type), fin = sp.axles.find(a => a.driven)?.final || 4, r = 0.33;
    let best = 1; for (let g = 1; g <= sp.gearbox.ratios.length; g++) { const rpm = v / r * fin * sp.gearbox.ratios[g - 1] * 60 / (2 * Math.PI); if (rpm > 1400) best = g; }
    return v < 2 ? 1 : best;
  }
  let trafT = 0;
  function updateTraffic(dt, cx, cz) {
    const A = amb(); if (!A) return;
    trafT -= dt; if (trafT > 0) return; trafT = 0.5;
    const mine = simCars();
    for (const V of mine) {
      const d = Math.hypot(V.sim.pos[0] - cx, V.sim.pos[2] - cz), F = V.traffic.F;
      if (V.wrecked) { V.traffic = null; V.owner = 'wreck'; continue; }
      if (d > GIVE_R && crafts.active !== V) { giveBack(V); continue; }
      if (F.i >= V.traffic.path.length - 4) {   // near the end of the road: on into the next one, or back to the WORLD
        if (!extend(V)) { if (d > 60) giveBack(V); }
      }
      V.sim.setLod(d < 60 ? 'mid' : 'far'); V.lod = d < 60 ? 'near' : 'far';
    }
    if (mine.length >= MAX_SIM_TRAFFIC) return;
    let best = null, bd = TAKE_R;
    for (const c of A.cars) {
      if (c.wreck || c.flee || !CIV_OF[c.kind]) continue;
      const d = Math.hypot(c.x - cx, c.z - cz); if (d < bd) { bd = d; best = c; }
    }
    if (best) takeover(best, gearFor(CIV_OF[best.kind], best.v));
  }
  function extend(V) {   // carry on into a road that meets this one's end
    const t = V.traffic, R = t.R, end = t.dir > 0 ? R.len : 0, ex = t.dir > 0 ? R.xs[R.xs.length - 1] : R.xs[0], ez = t.dir > 0 ? R.zs[R.zs.length - 1] : R.zs[0];
    const g = roadGraph(ex, ez, 40), opts = [];
    for (const Q of g.roads) {
      if (Q === R || Q.len < 30) continue;
      if (Math.hypot(Q.xs[0] - ex, Q.zs[0] - ez) < 5) opts.push([Q, 0, 1]);
      else if (Math.hypot(Q.xs[Q.xs.length - 1] - ex, Q.zs[Q.zs.length - 1] - ez) < 5) opts.push([Q, Q.len, -1]);
    }
    void end;
    if (!opts.length) return false;
    const [Q, s0, dir] = opts[Math.floor(Math.random() * opts.length)], lat = laneOf(Q);
    const more = pathFrom(Q, s0 + dir * 2, dir, lat);
    if (more.length < 3) return false;
    t.R = Q; t.dir = dir; t.lat = lat;
    const keep = t.path.slice(Math.max(0, t.F.i));
    t.path = keep.concat(more); t.F = createFollower(t.path, { speed: VMAX[Q.type] || 12, latG: 0.22, gap: () => gapAhead(V), stopDist: 3 });
    return true;
  }
  // ---------------------------------------------------------------- blasts (every fx.explode near a vehicle)
  if (fx && !fx.__wheeledWrapped) {
    fx.__wheeledWrapped = true;
    const ex = fx.explode.bind(fx);
    fx.explode = (x, y, z, s = 1, op) => { blastAt(x, y, z, s); return ex(x, y, z, s, op); };
  }
  const _l = new THREE.Vector3();
  function blastAt(x, y, z, s) {
    const R = 3 + 3.5 * s;
    for (const V of list) {
      if (!V.exists) continue;
      const S = V.sim, d = Math.hypot(S.pos[0] - x, S.pos[1] + 1 - y, S.pos[2] - z); if (d > R + 3) continue;
      V.wake(); _q.set(S.q[0], S.q[1], S.q[2], S.q[3]).invert(); _l.set(x - S.pos[0], y - S.pos[1], z - S.pos[2]).applyQuaternion(_q);
      if (d < R) V.dmg.blast([_l.x, _l.y, _l.z], R, s * 0.9);
      const k = S.massNow * Math.max(0, 1 - d / (R + 3)) * s * 3.5, nx = (S.pos[0] - x) / (d || 1), nz = (S.pos[2] - z) / (d || 1);
      S.impulse([S.cgw[0], S.cgw[1] - 0.3, S.cgw[2]], [nx * k, k * 0.6, nz * k]);
    }
  }
  // ---------------------------------------------------------------- service at the motor pools / deck: fuel, tyres, belts
  let servT = 0;
  function updateService(dt) {
    servT -= dt; if (servT > 0) return; servT = 0.5;
    for (const V of list) {
      if (!V.exists || V.wrecked || V.traffic) continue;
      const S = V.sim, sv = o.serviceAt ? o.serviceAt(S.pos[0], S.pos[2]) : null, still = Math.abs(S.speed) < 0.4;
      V.serviced = sv && still ? (V.serviced || 0) + 0.5 : 0;
      if (!V.serviced) continue;
      let did = false;
      if (S.fuelL < S.spec.fuel.capacity - 0.5) { S.fuelL = Math.min(S.spec.fuel.capacity, S.fuelL + 12); did = true; }
      if (V.serviced > 3) {
        const ds = V.dmg.state;
        if (ds.tyres.some(t => t.pressure < 1) || ds.engine < 1 || ds.fuelLeak || ds.coolLeak || ds.oilLeak) { V.dmg.repair('all'); S.eng.temp = Math.min(S.eng.temp, 90); did = true; }
        if (V.gun && (V.gun.belt < V.gun.spec.belt || V.gun.boxes < V.gun.spec.boxes - 1)) { V.gun.resupply(); did = true; }
      }
      if (did && crafts.active === V && !V._servSaid) { V._servSaid = true; say(`${V.label}  -  REFUELLING${V.serviced > 3 ? ', REPAIRS AND AMMUNITION' : ''} AT ${sv.name || 'THE MOTOR POOL'}`, 1.8); }
      if (!did) V._servSaid = false;
    }
  }
  // ---------------------------------------------------------------- islands taken: their motor pool gets a jeep
  let isleT = 0, gcT = 3;
  function updateIslands(dt) {
    isleT -= dt; if (isleT > 0) return; isleT = 2;
    for (const I of ISLANDS) if (I.owner === 1 && I.pad && !I._wheeled) { stockIsland(I, ['m151']); feed(`MOTOR POOL: AN M151 AT ${I.name}`, 'good'); }
  }
  // ---------------------------------------------------------------- sound
  let own = null, nearA = null, ownOn = false, nearOn = false;
  function mute() { if (own && ownOn) { own.setEnabled(false); ownOn = false; } if (nearA && nearOn) { nearA.setEnabled(false); nearOn = false; } }
  function updateAudio(dt) {
    if (!sfx.ctx || !sfx.master) return;
    own ||= new WheeledAudio(sfx.ctx, sfx.master); nearA ||= new WheeledAudio(sfx.ctx, sfx.master);
    const a = crafts.active, mineA = a && list.includes(a) ? a : null;
    if (mineA) {
      if (!ownOn) { own.setEnabled(true); ownOn = true; }
      own.update(lookFrom(mineA.sim, mineA.sim.lastCtl || {}), mineA.sim, dt, mineA.firstPerson() && !mineA.T.mil ? true : mineA.firstPerson(), 0);
    } else if (ownOn) { own.setEnabled(false); ownOn = false; }
    const cam = o.camZ(); let best = null, bd = 110;
    for (const V of list) { if (V === mineA || !V.exists || V.asleep || !V.sim.eng.running) continue; const d = Math.hypot(cam.position.x - V.sim.pos[0], cam.position.y - V.sim.pos[1], cam.position.z - V.sim.pos[2]); if (d < bd) { bd = d; best = V; } }
    if (best) { if (!nearOn) { nearA.setEnabled(true); nearOn = true; } nearA.update(lookFrom(best.sim, best.sim.lastCtl || {}), best.sim, dt, false, bd); }
    else if (nearOn) { nearA.setEnabled(false); nearOn = false; }
  }
  // ---------------------------------------------------------------- per frame
  const pool = {
    list, ctx, WENV, WO, guns, delivery, spawn, remove, newGame, deliver, stockIsland, takeover, giveBack, parked,
    spawners, spawnM151: spawners.m151, spawnM35: spawners.m35, spawnLandRover: spawners.landrover, spawnHilux: spawners.hilux, spawnBeetle: spawners.beetle, spawnLada: spawners.lada,
    first: type => list.find(V => V.type === type && V.exists) || null,
    // tests / tools: a driver.js follower at the wheel of V (pts [{x, z, v?}]), and a path along a WORLD road
    autopilot: (V, pts, speed = 10) => { V.auto = pts ? createFollower(pts, { speed, latG: 0.3, stopDist: 3, unstick: false }) : null; return !!V.auto; },
    roadPath: (id, s0, s1, lat = 1.4, step = 6) => { const R = roadById(id), q = {}, out = [], dir = s1 >= s0 ? 1 : -1; for (let s_ = s0; dir * (s1 - s_) >= 0; s_ += dir * step) { roadPoint(R, s_, lat * dir, q); out.push({ x: q.x, z: q.z, y: q.y, bridge: q.bridge }); } return out; },
    update(dt, playing = true) {
      if (!playing) { mute(); delivery?.silence(); return; }   // the pause menu, the title: everything quiet and still
      guns.update(dt); if (delivery) delivery.update(dt);
      const cam = o.camZ(), Z = o.Z, cx = Z ? Z.pos.x : cam.position.x, cz = Z ? Z.pos.z : cam.position.z;
      parkT -= dt; if (parkT <= 0) { parkT = 1; try { updateParked(cx, cz); } catch (e) { console.warn('parked cars', e); } }
      try { updateTraffic(dt, cx, cz); } catch (e) { console.warn('traffic', e); }
      updateService(dt); updateIslands(dt); updateAudio(dt);
      for (const V of list) if (V.capBoost > 0) V.capBoost -= dt;
      // cars you left far behind, burnt-out traffic: gone (the military vehicles stay where you left them)
      gcT -= dt; if (gcT <= 0) { gcT = 3; for (const V of [...list]) { if (crafts.active === V || !V.T.civ || V.parkKey && parked.get(V.parkKey) === V || V.traffic) continue; const d = Math.hypot(V.sim.pos[0] - cx, V.sim.pos[2] - cz); if (d > (V.owner === 'player' ? 3000 : 700)) remove(V); } }
    },
  };
  if (delivery) delivery.pool = pool;
  return pool;
}
