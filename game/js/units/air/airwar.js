// The air war's sim-flown aircraft, hooked into war.js: our F-14A escorts (command 4: catapult, CAP over the ALBATROSS or
// an ordered island, intercept, dogfight, bingo, pattern, trap) and the RUNAWAY's air arm (RW-4 SHRIKE fighters off the
// KRAKEN, an MQ-9 REAPER spotting for SHAHED salvos launched from their islands). Every aircraft here is a real flight
// model (units/air/airframe.js) flown by the AI pilot (pilot.js) through stick, pedals and throttle; the SHAHED is a
// point-mass drone. Weapons are war.js projectiles (game level): 'aam' (capped turn rate, proximity fuse), 'jb' (jet
// cannon), and the drone's warhead is a war.js blast. Damage semantics are war.js's (hp, dying, dead).
//
// war.js calls: W.air = createAirWar(W, ctx, hooks); then W.air.update(u, dt, pl) for units with u.sim / u.drone,
// W.air.frame(dt, pl) once a frame, W.air.think(pl) in the enemy commander's 2 s tick, W.air.sendEscort(island).
import * as THREE from 'three';
import { createTomcatSim, cadcSweep, STATIONS as TSTATIONS } from './tomcatfm.js';
import { createShrikeSim, createReaperSim, createShahedSim, shahedGuide, SHRIKE } from './rwfm.js';
import { createPilot } from './pilot.js';
import { buildTomcatModel } from './tomcatmodel.js';
import { buildShrikeModel, buildReaperModel, buildShahedModel } from './rwmodel.js';
import { createAirSound } from './airsound.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const AIR = {
  ESCORT_MAX: 3, FUEL_X: 8, SHRIKE_MAX: 4, CAT_GAP: 6,
  COST: { shrike: 30, reaper: 20, shahed: 6 },
  HP: { escort: 4, shrike: 2, reaper: 3, shahed: 1 }, R: { escort: 4.5, shrike: 3.5, reaper: 5, shahed: 2 },
};

export function createAirWar(W, ctx, H) {
  const { scene, fx, sfx, terrainH, isWater } = ctx, { shoot, damage, blast, hear, boomAt, feed, CARRIER } = H;
  const AW = { pending: [], queue: 0, lastCat: -99, modex: 200, spot: null, shrikeT: 330, reaperT: 200, shahedT: 280, sound: createAirSound(sfx), playerFoe: null };
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3();
  const ground = (x, z) => Math.max(terrainH(x, z), 0);
  const carrierOf = side => { const c = side === 1 ? W.carrier : W.enemyCarrier; return c && c.sinking === undefined ? c : null; };
  // the world as an airframe sim and the AI pilot see it
  function makeEnv(side) {
    const env = {
      terrain: ground,
      groundY: (x, z) => Math.max(terrainH(x, z), 0, W.deckY(x, z)),
      water: (x, z) => isWater(x, z) && W.deckY(x, z) < -1e8,
      surfVel: W.surfVel,
      carrier: () => {
        const c = carrierOf(side); if (!c) return null;
        return { x: c.p.x, z: c.p.z, yaw: c.yaw, deck: CARRIER.DECK + c.p.y, vx: c.v.x, vz: c.v.z, speed: c.speed, w: c.w || 0, att: c.att, deckAt: W.deckAt ? (x, z) => W.deckAt(c, x, z) : null };   // (ngc/bugsweep: + the live deck - the cat held the AI's jets on the flat deck height while the gear met the heaving, rolling one)
      },
      foes: function* (s) {
        for (const u of W.units) if (u.side !== s && u.p && !u.dims && !u.dead && !u.dying && !u.gone) yield u;
        const pl = AW.pl;
        if (s === 2 && pl && pl.alive && !pl.inCave) { const P = AW.playerFoe || (AW.playerFoe = { player: true, air: true, type: 'PLAYER', r: 3 }); P.p = pl.pos; P.v = pl.vel; yield P; }
      },
      missiles: function* (s) { for (const b of W.proj) if (b.kind === 'aam' && b.side !== s) yield b; },
      inFlight: t => { let n = 0; for (const b of W.proj) if (b.kind === 'aam' && b.tgt === t) n++; return n; },
      // (airai-polish) the recovery: the other jets in the pattern (break interval, extended downwind) and a foul deck
      // (a jet still in the wires in the landing area)
      traffic: () => { const out = AW._traffic || (AW._traffic = []); out.length = 0; for (const u of W.units) if (u.side === side && u.type === 'escort' && !u.dead && !u.dying) out.push(u.ai); return out; },
      deckFoul: me => W.units.some(u => u.side === side && u.type === 'escort' && u.ai !== me && !u.dead && !u.dying && u.ai.state === 'trapped' && !u.taxiClear),
      fire: (kind, A, st, tgt, Wp) => {
        const u = A.unit; A.forward(_f);
        if (kind === 'gun') {
          const gp = A.worldPoint((A.P.STATIONS || TSTATIONS).gun || [0, 0, -8]), e = 0.006;
          shoot('jb', u.side, gp.x, gp.y, gp.z, (_f.x + rnd(-e, e)) * Wp.speed + A.vel.x, (_f.y + rnd(-e, e)) * Wp.speed + A.vel.y, (_f.z + rnd(-e, e)) * Wp.speed + A.vel.z, 1.2);
          if (hear(gp.x, gp.y, gp.z, 400) > 0 && Math.random() < 0.25) sfx.noiseBurst?.(1800, 500, 0.08, 0.08 * hear(gp.x, gp.y, gp.z, 400));
          if (Math.random() < 0.4) fx.flash?.(gp.x, gp.y, gp.z, 0.2);
          return;
        }
        const sp = (A.P.STATIONS || TSTATIONS)[st.st] || [0, -1, 0], p = A.worldPoint(sp);
        if (u.side === 2) A.bayT = 0.9;   // (airai-polish) the SHRIKE's bay doors open for the shot
        shoot('aam', u.side, p.x, p.y, p.z, _f.x * Wp.v0 + A.vel.x, _f.y * Wp.v0 + A.vel.y, _f.z * Wp.v0 + A.vel.z, Wp.life, { tgt, age: 0, spd: A.vel.length() + Wp.v0 });
        fx.flash?.(p.x, p.y, p.z, 0.5); if (hear(p.x, p.y, p.z, 500) > 0) sfx.missile?.();
        if (u.side === 1) feed(`${u.name}: FOX ${kind === 'aim54' ? 'THREE' : kind === 'aim7' ? 'ONE' : 'TWO'}`);
      },
    };
    return env;
  }
  const ENV = [null, makeEnv(1), makeEnv(2)];

  // units waiting (a Tomcat below deck for the catapult, a SHAHED on its rail) live in AW.pending, outside the war
  function addSimUnit(type, side, A, pilot, model, extra = {}, pending = false) {
    const u = { type, side, sim: A, ai: pilot, p: A.pos, v: A.vel, yaw: 0, hp: AIR.HP[type], hpMax: AIR.HP[type], mesh: model.group, parts: model, r: AIR.R[type], cd: 0, ph: rnd(6.28), air: true, ...extra };
    A.unit = u; if (pilot) pilot.unit = u;
    if (pending) AW.pending.push(u); else { scene.add(model.group); W.units.push(u); }
    return u;
  }
  function activate(u) { const i = AW.pending.indexOf(u); if (i >= 0) AW.pending.splice(i, 1); scene.add(u.mesh); W.units.push(u); }

  // ---------------------------------------------------------------- our escorts
  AW.sendEscort = (I) => {
    const c = carrierOf(1);
    if (!c) return 'NO DECK TO LAUNCH FROM  -  THE ALBATROSS IS GONE';
    const n = W.units.filter(u => u.type === 'escort' && !u.dead && !u.dying).length + AW.pending.filter(u => u.type === 'escort').length;
    if (n >= AIR.ESCORT_MAX) return 'THREE TOMCATS ALREADY UP';
    if (W.P.mat < H.COST_ESCORT) return 'NOT ENOUGH MATERIEL';
    W.P.mat -= H.COST_ESCORT;
    const modex = ++AW.modex > 212 ? (AW.modex = 201) : AW.modex;
    const A = createTomcatSim(9, { fuelX: AIR.FUEL_X, seed: modex }), model = buildTomcatModel(1, { modex });
    const name = `VICTORY ${modex}`, P = createPilot(A, { side: 1, name, onSay: (m) => {   // the radio calls worth a line in the feed
      const call = /^RTB  BINGO/.test(m) ? 'BINGO  -  RTB' : /^RTB  WINCHESTER/.test(m) ? 'WINCHESTER  -  RTB' : /^WAVEOFF  BOLTER/.test(m) ? 'BOLTER  -  GOING AROUND' : /^WAVEOFF  FOUL DECK/.test(m) ? 'FOUL DECK  -  WAVE OFF' : /^WAVEOFF/.test(m) ? 'WAVE OFF  -  GOING AROUND'
        : /^BALL/.test(m) ? 'TOMCAT BALL, ' + m.slice(6) : /^CAP  JOINED/.test(m) ? 'JOINED  -  ON YOUR WING' : null;
      if (call) feed(`${name}: ${call}`);
    } });
    A.reset(c.p.x, CARRIER.DECK + c.p.y, c.p.z, c.yaw, { running: true }); A.lights = true;
    const cap = I && I.pad ? I : null;
    addSimUnit('escort', 1, A, P, model, { name, cap, queued: true, decoys: 6 }, true);
    P.state = 'queued';
    // (airai-polish) a section: the next Tomcat for the same CAP flies on the wing of one that has no wingman yet
    const lead = [...W.units, ...AW.pending].find(o => o.type === 'escort' && o.ai !== P && o.cap === cap && !o.dead && !o.dying && !o.ai.lead && !o.ai.wing && !['rtb', 'final', 'waveoff', 'bolter', 'trapped'].includes(o.ai.state));
    if (lead) { P.lead = lead.ai; lead.ai.wing = P; P.orbitDir = lead.ai.orbitDir; }
    return I && I.pad ? `TOMCAT ${modex} TO THE CAT  -  CAP OVER ${I.name}` : `TOMCAT ${modex} TO THE CAT  -  CAP OVER THE ALBATROSS`;
  };
  function laneClear(c, yaw = c.yaw, max = 400) {   // open water ahead of the bow along heading yaw
    const fx_ = -Math.sin(yaw), fz = -Math.cos(yaw);
    for (let d = 60; d <= max; d += 20) if (terrainH(c.p.x + fx_ * d, c.p.z + fz * d) > -1) return false;
    return true;
  }
  // like main.js does for the HORNET: steam onto the nearest heading with a clear run (as carriers turn into the wind).
  // (ngc/airai-polish) 480 m, not 700: on the TERRAIN islands the ALBATROSS starts bow-on to a shore 60 m off and the
  // nearest 700 m lane was 120° round - she kept re-planning the turn and the Tomcat sat on the cat for good (jets.json)
  function turnIntoClear(c) {
    if (c.sky && c.sky.up) return;
    for (let k = 1; k <= 24; k++) for (const s of [1, -1]) {
      const y = c.yaw + s * k * Math.PI / 12;
      if (laneClear(c, y, 480)) { W.orderCarrier(c.p.x - Math.sin(y) * 500, c.p.z - Math.cos(y) * 500); feed('ALBATROSS: TURNING INTO CLEAR WATER TO LAUNCH THE TOMCATS'); return; }
    }
  }
  function launchQueued(u, dt) {
    const c = carrierOf(1); if (!c) { AW.pending.splice(AW.pending.indexOf(u), 1); return; }
    const busy = W.units.some(o => o.type === 'escort' && o.ai && o.ai.state === 'cat') || AW.pending.find(o => o.queued) !== u;   // one at a time, in order
    if (busy || W.time - AW.lastCat < AIR.CAT_GAP) return;
    u.waitT = (u.waitT || 0) + dt;
    const env = ENV[1];
    if (u.ai.launch(env)) { u.queued = false; activate(u); AW.lastCat = W.time; feed(`${u.name} ON CAT 2  -  ${u.cap ? 'CAP ' + u.cap.name : 'CAP OVER THE SHIP'}`); }
  }

  // ---------------------------------------------------------------- the RUNAWAY air arm
  function enemyBase() {   // the KRAKEN's deck, or IRONHOLD
    const c = carrierOf(2); if (c) return { x: c.p.x, y: CARRIER.DECK + c.p.y + 40, z: c.p.z, yaw: c.yaw, ship: c };
    const I = W.islands.find(I => I.name === 'IRONHOLD'); return { x: I.pad.x, y: I.pad.h + 60, z: I.pad.z, yaw: Math.atan2(I.pad.x, I.pad.z) };
  }
  AW.spawnShrike = (at, anchor) => {
    const b = at || enemyBase(), A = createShrikeSim(9, { fuelX: 6 }), model = buildShrikeModel(), P = createPilot(A, { side: 2 });
    A.reset(b.x + rnd(-20, 20), 0, b.z + rnd(-20, 20), b.yaw, { running: true, airborne: true, alt: Math.max(b.y, ground(b.x, b.z) + 60), speed: 80 }); for (const e of A.eng) e.n = 0.95;
    P.anchor = anchor || (W.carrier ? W.carrier.p : { x: b.x, y: 0, z: b.z }); P.spawnAir('cap');
    fx.mix?.spawn(b.x, b.y, b.z, 0, 2, 0, 3, 2, 6, .8, .9, 1, 0.5, -0.3, 1.2);   // rail launch puff
    return addSimUnit('shrike', 2, A, P, model, { name: 'RW-4 SHRIKE', decoys: 2, home: b });
  };
  AW.spawnReaper = (orbit) => {
    const b = enemyBase(), A = createReaperSim(9, { fuelX: 3 }), model = buildReaperModel(), P = createPilot(A, { side: 2, capAlt: 230, capR: 260 });
    A.reset(b.x, 0, b.z, b.yaw, { running: true, airborne: true, alt: Math.max(b.y, ground(b.x, b.z) + 80), speed: 28 }); A.eng[0].n = 0.7;
    P.anchor = orbit || (W.carrier ? W.carrier.p : { x: 0, y: 0, z: 0 }); P.spawnAir('patrol');
    return addSimUnit('reaper', 2, A, P, model, { name: 'MQ-9 REAPER', home: b });
  };
  // a salvo of SHAHEDs from the enemy island nearest the target, launched off a rail a second or so apart
  AW.salvo = (tgt, n = 4, from) => {
    const isl = from || W.islands.filter(I => I.owner === 2).sort((a, b) => Math.hypot(a.x - tgt.x, a.z - tgt.z) - Math.hypot(b.x - tgt.x, b.z - tgt.z))[0];
    if (!isl) return [];
    const out = [];
    for (let k = 0; k < n; k++) {
      const D = createShahedSim(9), model = buildShahedModel(), x = isl.pad.x + 14, z = isl.pad.z + 10 + k * 3;
      D.launch(x, isl.pad.h + 2, z, Math.atan2(tgt.x - x, -(tgt.z - z)) + (k - (n - 1) / 2) * 0.12);
      const u = { type: 'shahed', side: 2, drone: D, p: D.pos, v: D.vel, yaw: 0, hp: 1, hpMax: 1, mesh: model.group, parts: model, r: AIR.R.shahed, air: true, name: 'SHAHED', tgt, delay: 0.2 + k * 1.3 };
      AW.pending.push(u); out.push(u);
    }
    return out;
  };

  // ---------------------------------------------------------------- per unit
  const _m = new THREE.Matrix4();
  AW.update = (u, dt, pl) => {
    AW.pl = pl;
    if (u.drone) return updateShahed(u, dt);
    const A = u.sim, P = u.ai;
    if (u.type === 'escort' && P.recovered) { taxi(u, dt); pose(u, dt, NO_EV); return; }   // (airai-polish) out of the wires: taxi clear, struck below
    if (u.type === 'escort') {   // CAP point: the ordered island, else the ship
      const c = carrierOf(1);
      if (P.state === 'cat') {   // the shooter only fires with open water ahead of the bow; the ship turns into clear water for the launch
        u.catT = (u.catT || 0) + dt; A.catClear = !!c && laneClear(c);
        if (!A.catClear && c && (u.turnT = (u.turnT || 0) - dt) <= 0) { u.turnT = 12; turnIntoClear(c); }
      }
      if (u.cap && u.cap.pad) P.anchor = _anchor(u, u.cap.pad.x, u.cap.pad.h, u.cap.pad.z);
      else if (c) P.anchor = _anchor(u, c.p.x, c.p.y, c.p.z);
      if ((u.axisT = (u.axisT || 0) - dt) <= 0 && P.anchor) { u.axisT = 5; const b = enemyBase(); P.capAxis = Math.atan2(b.x - P.anchor.x, -(b.z - P.anchor.z)); }   // the racetrack's legs on the threat axis
      if (A.fuel <= 0 && !u.ejected && !A.onGround && A.eng.every(e => !e.run)) { u.ejected = true; feed(`${u.name}: FLAMED OUT  -  CREW EJECTED`, 'bad'); u.hp = 0; u.dying = true; u.v.y = 2; }
    } else if (u.type === 'shrike' || u.type === 'reaper') {
      if (A.fuel < (u.type === 'shrike' ? 220 : 120) && !u.goingHome) { u.goingHome = true; P.T.radar = 0; P.tgt = null; P.anchor = u.home; P.set('cap', 'HOME'); }
      if (u.goingHome && Math.hypot(A.pos.x - u.home.x, A.pos.z - u.home.z) < 260) { u.dead = true; W.E.mat += AIR.COST[u.type] * 0.5; return; }   // recovered aboard
      if (u.type === 'reaper') spotting(u);
    }
    // (airai-polish) the pilot flies in steps of at most 1/30 s: its loops are tuned at 60 Hz, and at the 3-8 fps of a
    // loaded machine (or a headless test) one 0.2 s step per frame set the approach porpoising and the wave-off into the sea
    const nSub = Math.min(8, Math.ceil(dt * 30 - 1e-6)) || 1, h = dt / nSub, evs = AW._evs || (AW._evs = []); evs.length = 0;
    for (let i = 0; i < nSub; i++) { const ev = P.update(h, ENV[u.side]); if (ev) for (const e of ev) evs.push(e); if (A.dead) break; }
    if (A.dead) {   // flew into something
      u.dying = true; u.hp = 0; u.v.multiplyScalar(0.3);
      if (u.side === 1) feed(`${u.name} ${A.dead === 'water' ? 'WENT IN THE WATER' : 'CRASHED'}`, 'bad');
    }
    if (P.recovered && !u.recT) { u.recT = 1e-3; feed(`${u.name} RECOVERED  -  ${P.trapped ? P.trapped.wire + ' WIRE' : 'ON DECK'}`, 'good'); W.P.mat += 15; }
    pose(u, dt, evs);
  };
  AW.gone = u => { if (u.ai) u.ai.gone = true; };   // (airai-polish) a section's pilots let go of a lost or recovered jet
  // (airai-polish) after the trap: hook up, wings to oversweep, a slow taxi out of the landing area forward to the waist
  // (the deck is clear for the next one as soon as she is out of the wires), then struck below. Kinematic, on the deck.
  const NO_EV = [];
  function taxi(u, dt) {
    const A = u.sim, c = carrierOf(1); u.recT += dt;
    if (!c || u.recT > 22) { u.dead = true; AW.gone(u); return; }
    const co = Math.cos(c.yaw), si = Math.sin(c.yaw), dx = A.pos.x - c.p.x, dz = A.pos.z - c.p.z;
    let lx = dx * co - dz * si, lz = dx * si + dz * co;
    const tx = 3, tz = 6, ex = tx - lx, ez = tz - lz, d = Math.hypot(ex, ez), sp = Math.min(2.6, d * 0.5, u.recT * 0.6);
    if (d > 0.3 && u.recT > 1.5) { lx += ex / d * sp * dt; lz += ez / d * sp * dt; u.taxiYaw = Math.atan2(ex, ez); }
    if (lz < 26) u.taxiClear = true;
    A.pos.x = c.p.x + lx * co + lz * si; A.pos.z = c.p.z - lx * si + lz * co; A.pos.y = W.deckY(A.pos.x, A.pos.z) + A.P.REST_H;
    if (u.taxiYaw !== undefined) A.q.setFromEuler(_eu.set(0, c.yaw + u.taxiYaw + Math.PI, 0, 'YXZ'));   // nose along the taxi direction (deck axes: +z aft)
    A.vel.set(0, 0, 0); A.hook = Math.max(0, A.hook - dt * 0.5); A.hookCmd = 0; A.sweep = Math.min(75, A.sweep + dt * 8);
    A.surf.flap = Math.max(0, A.surf.flap - dt * 0.4); A.surf.lef = Math.max(0, A.surf.lef - dt * 0.4); A.surf.brake = 0;
    for (const e of A.eng) { e.n += (0.68 - e.n) * Math.min(1, dt); e.ab = 0; }
    if (d < 0.5 && u.recT > 16) { u.dead = true; AW.gone(u); }
  }
  function _anchor(u, x, y, z) { const a = u._anc || (u._anc = { x: 0, y: 0, z: 0 }); a.x = x; a.y = Math.max(0, y); a.z = z; return a; }
  function pose(u, dt, evs = u.sim.events) {
    const A = u.sim, m = u.mesh;
    m.position.copy(A.pos); m.quaternion.copy(A.q); A.crewLook = u.ai ? u.ai.look : null; u.parts.animate(A, dt, W.time);
    // exhaust, vapour, damage smoke
    m.updateMatrixWorld();
    for (const n of u.parts.nozzles || []) {
      _w.copy(n).applyMatrix4(m.matrixWorld); const ab = A.eng[0].ab || 0, hot = Math.max(0, (A.eng[0].n - 0.8) / 0.25);
      if (u.type === 'escort') fx.add.spawn(_w.x, _w.y, _w.z, -A.vel.x * 0.1, 0, -A.vel.z * 0.1, ab > 0.1 ? 0.16 : 0.07, ab > 0.1 ? 1.3 : 0.5 + hot * 0.3, 0.2, 1, ab > 0.1 ? .55 : .7, ab > 0.1 ? .2 : .4, ab > 0.1 ? 0.95 : 0.35);
      else if (u.type === 'shrike') fx.add.spawn(_w.x, _w.y, _w.z, -A.vel.x * 0.1, 0, -A.vel.z * 0.1, 0.06, 0.4 + hot * 0.4, 0.15, 0.6, 0.95, 1, 0.5);
    }
    if (A.nz > 4.2 && A.tas > 50 && u.parts.wingTipLocal) for (const s of [-1, 1]) { u.parts.wingTipLocal(s, _w).applyMatrix4(m.matrixWorld); fx.mix?.spawn(_w.x, _w.y, _w.z, 0, 0, 0, 0.7, 0.25, 0.9, .95, .97, 1, 0.45, 0, 1); }
    else if (A.nz > 5 && u.parts.tips) for (const t of u.parts.tips) { _w.copy(t).applyMatrix4(m.matrixWorld); fx.mix?.spawn(_w.x, _w.y, _w.z, 0, 0, 0, 0.6, 0.25, 0.8, .95, .97, 1, 0.4, 0, 1); }
    // (airai-polish) damage states: the model shows them (scorch, holes, a lost aileron, stuttering seams); smoke from
    // where it was hit, thicker the worse it is, and fire once it is down to its last third
    const f = u.hp / u.hpMax; if (f !== u.dmgF) { u.dmgF = f; u.parts.setDamage?.(f); }
    if (f < 0.99) for (const lp of u.parts.damagePts || ZERO_PT) {
      _w.copy(lp).applyMatrix4(m.matrixWorld);
      if (Math.random() < 0.25 + (1 - f) * 0.6) fx.trail(_w.x, _w.y, _w.z, 0.5 + (1 - f));
      if (f < 0.4 && Math.random() < 0.6) fx.add.spawn(_w.x, _w.y, _w.z, rnd(-1, 1), rnd(0, 1.5), rnd(-1, 1), rnd(0.15, 0.35), 0.9, 0.3, 1, rnd(.45, .65), .12, 0.9, -1, 1);
    }
    if (A.bayT > 0) A.bayT = Math.max(0, A.bayT - dt);
    // events worth a sound: the cat stroke, a trap
    for (const e of evs) {
      if (e.e === 'catshot' && hear(A.pos.x, A.pos.y, A.pos.z, 500) > 0) { sfx.catShot?.(); for (let i = 0; i < 14; i++) fx.mix?.spawn(A.pos.x + rnd(-2, 2), A.pos.y - 1.5, A.pos.z + rnd(-2, 2), rnd(-2, 2), rnd(1, 4), rnd(-2, 2), rnd(1, 2), 1, 4, .95, .95, .95, 0.5, -0.5, 1.5, 0.5); }
      if (e.e === 'trap' && hear(A.pos.x, A.pos.y, A.pos.z, 400) > 0) sfx.thump?.(0.6);
    }
  }
  // ---------------------------------------------------------------- (airai-polish) shot down: the fall, the wreck
  // A hit machine keeps its momentum and falls tumbling (the roll it had, a nose-down pitch), burning and smoking from
  // its damage points, with a piece or two torn off (a wing, a tail: debris that falls on its own). A SHAHED's warhead
  // often goes in the air. On the ground it leaves a charred wreck that burns and smokes for a while; in the sea it sinks.
  const ZERO_PT = [new THREE.Vector3()], _dq = new THREE.Quaternion(), _eu = new THREE.Euler(), _fw = new THREE.Vector3();
  AW.debris = []; AW.wrecks = [];
  function detach(obj, u) {
    if (!obj.parent) return;
    obj.updateMatrixWorld(); scene.attach(obj);
    AW.debris.push({ obj, v: u.v.clone().add(_v.set(rnd(-6, 6), rnd(0, 5), rnd(-6, 6))), w: [rnd(-4, 4), rnd(-4, 4), rnd(-6, 6)], t: 0 });
    if (AW.debris.length > 24) { const d = AW.debris.shift(); scene.remove(d.obj); }
  }
  const charred = new WeakMap();
  function char(root) {   // burnt out: lamps, glows and seams off, every surface sooted
    root.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some(mt => mt.isMeshBasicMaterial && !mt.vertexColors)) { o.visible = false; return; }
      const out = mats.map(mt => {
        if (charred.has(mt)) return charred.get(mt);
        const c = mt.clone(); if (c.color) c.color.multiplyScalar(c.vertexColors ? 0.3 : 0.24).lerp(_cB, 0.25); if (c.emissive) c.emissive.setRGB(0, 0, 0); if (c.map) c.opacity = 0.35;
        charred.set(mt, c); return c;
      });
      o.material = Array.isArray(o.material) ? out : out[0];
    });
  }
  const _cB = new THREE.Color(0x231c15);
  AW.dying = (u, dt) => {
    const m = u.mesh, P = u.p, Vv = u.v;
    if (!u.fall) {
      u.fall = { t: 0, roll: (Math.random() < 0.5 ? -1 : 1) * rnd(1.2, 3.5), pitch: rnd(-0.7, 0.1), yaw: rnd(-0.5, 0.5) };
      u.parts.kill?.(); u.parts.setDamage?.(0);
      if (u.drone && Math.random() < 0.6) {   // the warhead goes: a fireball in the air, nothing left to fall
        fx.explode(P.x, P.y, P.z, 1.7, { debris: 8, color: 0x6a6a5a }); boomAt(P.x, P.y, P.z, 0.8); u.dead = true; return true;
      }
      for (const b of u.parts.breakable || []) if (Math.random() < 0.65) detach(b, u);
      fx.explode(P.x, P.y, P.z, 0.9, { debris: 4, color: u.side === 1 ? 0x8a9097 : 0xd0ccc0 });
    }
    const F = u.fall; F.t += dt;
    Vv.y -= 9 * dt; Vv.multiplyScalar(Math.max(0, 1 - 0.1 * dt)); P.addScaledVector(Vv, dt);
    _dq.setFromEuler(_eu.set(F.pitch * dt, F.yaw * dt, F.roll * dt)); m.quaternion.multiply(_dq); m.position.copy(P);
    m.updateMatrixWorld();
    for (const lp of u.parts.damagePts || ZERO_PT) {
      _w.copy(lp).applyMatrix4(m.matrixWorld);
      fx.add.spawn(_w.x, _w.y, _w.z, rnd(-1, 1), rnd(0, 2), rnd(-1, 1), rnd(0.25, 0.5), 1.3, 0.4, 1, rnd(.4, .6), .1, 0.9, -1, 1); fx.trail(_w.x, _w.y, _w.z, 1.2);
    }
    if (u.parts.animate) u.parts.animate(u.sim || u.drone, dt, W.time);
    const gy = Math.max(terrainH(P.x, P.z), 0, W.deckY(P.x, P.z));
    if (P.y < gy + 0.6 || F.t > 40) crash(u, gy);
    return true;
  };
  function crash(u, gy) {
    const x = u.p.x, z = u.p.z, deck = W.deckY(x, z) > 0.5, wet = !deck && isWater(x, z);
    fx.explode(x, gy, z, u.type === 'shahed' ? 1.6 : 2.2, { fire: wet ? 0 : 45, oil: wet, debris: 9, color: u.side === 1 ? 0x2a3f55 : 0x992222 }); boomAt(x, gy, z, 0.9);
    if (wet) fx.splash?.(x, z, 1.4);
    blast(x, gy + 1, z, u.type === 'shahed' ? 9 : 6, u.type === 'shahed' ? 8 : 3, 0); u.dead = true;
    if (deck) return;   // on a ship: the deck crews push it over the side (no wreck riding the deck)
    const m = u.mesh; char(m);
    _fw.set(0, 0, -1).applyQuaternion(m.quaternion); const yaw = Math.atan2(-_fw.x, -_fw.z);
    m.quaternion.setFromEuler(_eu.set(rnd(-0.12, 0.12), yaw, rnd(-0.3, 0.3), 'YXZ')); m.position.set(x, wet ? 0.2 : gy + 0.25, z);
    AW.wrecks.push({ obj: m, t: 0, wet }); if (!wet) fx.burn?.(x, gy + 0.5, z, 25, 0.8);
    if (AW.wrecks.length > 12) scene.remove(AW.wrecks.shift().obj);
    u.mesh = new THREE.Object3D();   // war.js sweeps the unit (and this stand-in) away; the wreck stays ours
  }
  function debrisAndWrecks(dt) {
    for (let i = AW.debris.length - 1; i >= 0; i--) {
      const d = AW.debris[i], o = d.obj; d.t += dt;
      d.v.y -= 9 * dt; d.v.multiplyScalar(Math.max(0, 1 - 0.4 * dt)); o.position.addScaledVector(d.v, dt);
      o.rotation.x += d.w[0] * dt; o.rotation.y += d.w[1] * dt; o.rotation.z += d.w[2] * dt;
      if (d.t < 4 && Math.random() < 0.5) fx.trail(o.position.x, o.position.y, o.position.z, 0.6);
      const gy = Math.max(terrainH(o.position.x, o.position.z), 0);
      if (o.position.y < gy + 0.1 || d.t > 25) { if (isWater(o.position.x, o.position.z)) fx.splash?.(o.position.x, o.position.z, 0.4); scene.remove(o); AW.debris.splice(i, 1); }
    }
    for (let i = AW.wrecks.length - 1; i >= 0; i--) {
      const w = AW.wrecks[i]; w.t += dt;
      if (w.wet) { w.obj.position.y -= dt * (0.25 + w.t * 0.08); w.obj.rotation.x += dt * 0.05; }
      else if (w.t < 40 && Math.random() < dt * 3) fx.trail(w.obj.position.x, w.obj.position.y + 1, w.obj.position.z, 1);
      if ((w.wet && w.obj.position.y < -8) || w.t > 150) { scene.remove(w.obj); AW.wrecks.splice(i, 1); }
    }
  }

  // the REAPER spots: once the ALBATROSS is under it, the enemy knows where she is (and the SHAHEDs follow)
  function spotting(u) {
    const c = carrierOf(1); if (!c) return;
    const d = Math.hypot(u.p.x - c.p.x, u.p.z - c.p.z);
    if (d < 600) { if (!AW.spot || W.time - AW.spot.t > 60) feed('RADAR: ENEMY REAPER OVER THE ALBATROSS  -  SHE IS BEING SPOTTED', 'bad'); AW.spot = { t: W.time, ship: c }; }
  }
  function updateShahed(u, dt) {
    const D = u.drone;
    const t = u.tgt, tp = t.ship ? _v.set(t.ship.p.x, CARRIER.DECK + t.ship.p.y + 1, t.ship.p.z) : _v.set(t.x, t.y, t.z);
    shahedGuide(D, tp, ground); D.step(dt);
    if (D.t < 2.5) fx.add.spawn(D.pos.x, D.pos.y, D.pos.z, 0, 0, 0, 0.12, 0.8, 0.4, 1, .7, .3, 1);   // booster
    const m = u.mesh; m.position.copy(D.pos); m.rotation.set(D.gam, -D.hdg, -D.bank, 'YXZ'); u.parts.animate(D, dt, W.time);
    const floor = Math.max(ground(D.pos.x, D.pos.z), W.deckY(D.pos.x, D.pos.z, 2));
    const there = Math.hypot(D.pos.x - tp.x, D.pos.z - tp.z) < 5 && D.pos.y < tp.y + 4;
    if (D.pos.y <= floor + 0.3 || there || D.t > 150) {
      const x = D.pos.x, y = Math.max(D.pos.y, floor), z = D.pos.z;
      fx.explode(x, y, z, 2.2, { debris: 6, crater: 2.4, fire: isWater(x, z) ? 0 : 25 }); boomAt(x, y, z, 1.1);
      const ship = W.deckY(x, z) > 0.5 && y < W.deckY(x, z) + 2 ? W.shipAt(x, z) : null;
      if (ship && ship.side === 1 && ship.sinking === undefined) damage(ship, 20, 2);
      blast(x, y + 1, z, 10, 16, 2); u.dead = true;
    }
  }

  // ---------------------------------------------------------------- once a frame: sounds
  AW.frame = (dt, pl) => {
    AW.pl = pl;
    for (const u of W.units) if (u.ai && (u.dead || u.dying) && !u.ai.gone) AW.gone(u);
    for (const u of W.units) if (u.air && u.dying && !u.toldDown) {   // news from the air war
      u.toldDown = true;
      if (u.type === 'escort' && !u.ejected) feed(`${u.name} IS DOWN  -  ${u.sim && u.sim.dead ? 'CRASHED' : 'SHOT DOWN, CREW EJECTED'}`, 'bad');
      else if (u.type === 'shrike') feed('SPLASH ONE SHRIKE', 'good');
      else if (u.type === 'reaper') { feed('ENEMY REAPER SHOT DOWN', 'good'); ctx.addScore?.(300); }
    }
    for (const u of AW.pending.slice()) {
      if (u.queued) { launchQueued(u, dt); continue; }
      if (u.drone && (u.delay -= dt) <= 0) {   // off the rail with a booster
        const D = u.drone; activate(u); if (hear(D.pos.x, D.pos.y, D.pos.z, 400) > 0) sfx.rocket?.();
        for (let i = 0; i < 8; i++) fx.mix?.spawn(D.pos.x, D.pos.y, D.pos.z, rnd(-2, 2), rnd(0, 2), rnd(-2, 2), rnd(0.8, 1.6), 1.2, 3, .85, .85, .85, 0.5, -0.2, 1, 0.4);
      }
    }
    debrisAndWrecks(dt);
    AW.sound.update(W.units, ctx.ear || { x: 0, y: 0, z: 0 });
  };
  // ---------------------------------------------------------------- the enemy commander's air plans (every 2 s)
  AW.think = (pl) => {
    const E = W.E, t = W.time, alive = type => W.units.filter(u => u.type === type && !u.dead && !u.dying).length;
    const escorts = alive('escort'), shrikes = alive('shrike');
    // fighters: answer our Tomcats, and sweep now and then
    AW.shrikeT -= 2;
    if (((escorts > shrikes && t > 90) || AW.shrikeT <= 0) && shrikes < AIR.SHRIKE_MAX && E.mat >= AIR.COST.shrike * 2) {
      AW.shrikeT = Math.max(150, 260 - t / 10); E.mat -= AIR.COST.shrike * 2;
      const b = enemyBase(); for (let i = 0; i < 2; i++) AW.spawnShrike({ ...b, x: b.x + i * 30, z: b.z + i * 30 }, W.carrier ? W.carrier.p : null);
      feed('RADAR: TWO RUNAWAY FIGHTERS (RW-4 SHRIKE) AIRBORNE', 'bad');
    }
    // a REAPER to find the ALBATROSS
    AW.reaperT -= 2;
    if (AW.reaperT <= 0 && alive('reaper') < 1 && E.mat >= AIR.COST.reaper && carrierOf(1)) { AW.reaperT = 200; E.mat -= AIR.COST.reaper; AW.spawnReaper(carrierOf(1).p); }
    // SHAHED salvos: at the spotted ALBATROSS, else at one of our islands' buildings
    AW.shahedT -= 2;
    if (AW.shahedT <= 0 && E.mat >= AIR.COST.shahed * 4) {
      AW.shahedT = Math.max(110, 190 - t / 15);
      let tgt = null;
      if (AW.spot && t - AW.spot.t < 40 && AW.spot.ship.sinking === undefined) tgt = { ship: AW.spot.ship, x: AW.spot.ship.p.x, y: CARRIER.DECK, z: AW.spot.ship.p.z };
      else { const ours = W.islands.filter(I => I.owner === 1 && I.kind !== 'hq'); const I = ours[Math.floor(Math.random() * ours.length)]; const s = I && I.structs.find(s => !s.dead && s.kind !== 'aa'); if (s) tgt = { x: s.x, y: s.y + 2, z: s.z, I }; }
      if (tgt) { const n = 3 + Math.min(3, Math.floor(t / 400)); if (AW.salvo(tgt, n).length) { E.mat -= AIR.COST.shahed * n; feed(tgt.ship ? `RADAR: ${n} SHAHED DRONES INBOUND ON THE ALBATROSS` : `RADAR: ${n} SHAHED DRONES HEADING FOR ${tgt.I.name}`, 'bad'); } }
    }
    void pl; void SHRIKE; void cadcSweep;
  };
  AW.reset = () => { AW.pending.length = 0; AW.queue = 0; AW.lastCat = -99; AW.spot = null; AW.shrikeT = 330; AW.reaperT = 200; AW.shahedT = 280; AW.sound.silence();
    for (const d of AW.debris) scene.remove(d.obj); for (const w of AW.wrecks) scene.remove(w.obj); AW.debris.length = AW.wrecks.length = 0; };
  return AW;
}
