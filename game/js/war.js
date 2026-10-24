// The island war (Carrier Command meets Raid on Bungeling Bay).
//
// Two sides each run a carrier and race to take the archipelago. Islands produce for whoever holds them: fuel
// (derricks), materiel (factories), sight (radar). Materiel buys capture drones, AA guns and new helicopters.
// Taking an island: knock out the holder's AA guns, then land on its pad and hold it (your helicopter or a capture
// drone; the enemy uses transports). Cave islands are only taken by stealing the pod (the command core) from the cave.
// The enemy also builds a battleship at its shipyard from its factories' output - bomb the factories and the
// shipyard to hold it back; once it launches it hunts your carrier. Lose the carrier and the war is lost; sink the
// enemy carrier or take its HQ island (IRONHOLD) to win.
import * as THREE from 'three';
import { addLiftFans, FAN_POS } from './ships.js';
import { structAngle } from './world/net.js';   // WORLD: the HQ / production slots are seeded per island (the villages keep clear of them)
import { createDefence } from './units/defence/brain.js';   // NGC-1980 DEFENCE: AA unit models + engagement logic
import { createRotary } from './units/air/rotary/rotary.js';   // NGC-1980: CH-46 + Marines, MV-22, RW-3 WASP (physical AI rotorcraft)
import { createGroundWar } from './units/groundwar/groundwar.js';   // NGC-1980 GROUND WAR: STRIDERs, RW-7s, seized MBTs and Marines fighting on the islands
import { buildCarrier, buildBattleship, buildFreighter, buildDrone, buildTransport, buildGunship, buildTomcat, buildGun, buildStructure, buildRubble, CARRIER, BSHIP, FREIGHTER, TEAM } from './ships.js';
// NAVAL: ship motion in a seaway (heave / pitch / roll by sea state and speed) and the naval effects
import { SHIPS as SHIP_MOTION, makeSea, createShipMotion, shipPointY, shipPointVY, retuneSea, advanceSea, seaElevation } from './units/naval/seamotion.js';
import { createSeaWeather } from './units/naval/seaweather.js';   // SEAWORLD: the optional drifting sea state
import { createNavalFx } from './units/naval/navalfx.js';
import { createAirWar } from './units/air/airwar.js';             // AIR: sim-flown Tomcats, SHRIKE / REAPER / SHAHED (ngc/airfw)
import { homeAAM, decoyCheck } from './units/air/gameproj.js';     // AIR: the shared game-level missile homing and decoy rule

const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
export const COST = { drone: 40, aa: 30, heli: 60, escort: 30, jet: 80, sky: 300 };
export const SIDE_NAME = ['NEUTRAL', 'FRIENDLY', 'ENEMY'];
const CAP_TIME = { heli: 6, drone: 9, transport: 10 };
const PROD = { fuel: { fuel: 0.55 }, factory: { mat: 0.4 }, radar: {}, hq: { fuel: 0.3, mat: 0.3 }, fortress: { fuel: 0.6 } };
const SIGHT = { heli: 180, carrier: 230, drone: 100, island: 130, radar: 380 };
const PROD_KIND = { fuel: 'fuel', factory: 'factory', radar: 'radar', fortress: 'fuel' };

export function createWar(ctx) {
  const { scene, fx, sfx, terrainH, isWater, nav } = ctx;
  const W = {
    cw: ctx.cw || null,   // COLLISION (wave 3): the game's collision world (the ground war's units, the deck's foul checks)
    islands: ctx.ISLANDS, units: [], proj: [], E: { fuel: 0, mat: 0, bship: 0 }, P: ctx.G, time: 0, over: null,
    carrier: null, enemyCarrier: null, battleship: null, thinkT: 0, raidT: 120, econT: 0, deckCache: null,
  };
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _skyAim = new THREE.Vector3();
  // NAVAL: the sea state (?sea=0..7, default 4 MODERATE; waves from the west-south-west) and the ships' wake / spray
  const _sq = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  W.sea = makeSea(_sq && _sq.has('sea') ? +_sq.get('sea') : 4, -1.2, 11);
  // SEAWORLD: ONE live sea. main.js draws its surface from W.sea and every ship rides it (sailShip passes its
  // position to the motion model); setSea retunes it in place (the waves keep their phases: nothing jumps).
  // W.weather drifts the state over the war when the player turns WEATHER DRIFT on (pause menu; seaweather.js).
  W.weather = createSeaWeather(W.sea.ss, W.sea.dir, 23);
  W.setSea = (ss, dir = W.sea.dir) => { W.weather.set(ss); retuneSea(W.sea, ss, dir); return W.sea.name; };
  W.setSeaDrift = on => { W.weather.set(W.weather.base, !!on); retuneSea(W.sea, W.weather.base, W.sea.dir); };
  W.seaY = (x, z) => seaElevation(W.sea, x, z);   // the drawn surface height (game m) at a world point
  // the sea's clock and the weather: main.js calls this every frame the game isn't paused (the title screen too)
  W.tickSea = dt => { advanceSea(W.sea, dt); const w = W.weather.step(dt); if (w) { retuneSea(W.sea, w.ss, w.dir); if (w.msg) feed(w.msg); } };
  const nfx = createNavalFx(scene, fx, W.seaY);
  const store = side => side === 1 ? W.P : W.E;
  // war sounds fall off with distance from the camera, so a battle across the map is a distant rumble
  const ear = ctx.ear;
  const hear = (x, y, z, range = 650) => Math.max(0, 1 - Math.hypot(x - ear.x, y - ear.y, z - ear.z) / range);
  function boomAt(x, y, z, big) { const k = hear(x, y, z); if (k > 0.02) sfx.boom(big * (0.12 + 0.88 * k * k)); }
  const feed = (t, kind = 'info') => ctx.feed(t, kind);
  // NGC-1980 DEFENCE hook: the 'aa' structures and the ALBATROSS gun mounts are drawn and fought by units/defence/
  // (turrets with slew limits, line-of-sight locks with tells, tracers / airbursts / missiles / the LANCE beam).
  // war.js still owns their hp, building, capture rules, rebuilds and the projectile hits.
  const defence = createDefence({ scene, fx, sfx, terrainH, hear, feed, time: () => W.time, player: ctx.player, hurtPlayer: (a, why) => ctx.hurtPlayer(a, why),
    shoot: (...a) => shoot(...a), damage: (...a) => damage(...a), hitTest: (...a) => hitTest(...a) });
  W.defence = defence;

  // ------------------------------------------------------------------------------------- islands and buildings
  const islandGroup = new THREE.Group(); scene.add(islandGroup);
  function placeAt(x, z) { return Math.max(terrainH(x, z), 0); }
  function addStruct(I, kind, x, z, side = I.owner, yaw = rnd(6.283)) {
    const mesh = kind === 'aa' ? defence.model(side, I, seeding) : buildStructure(kind, side);   // DEFENCE hook: the unit for this side / island
    const y = placeAt(x, z); mesh.position.set(x, y, z); mesh.rotation.y = kind === 'aa' ? 0 : yaw; islandGroup.add(mesh);
    const ud = mesh.userData, hp = { hq: 30, factory: 26, fuel: 22, radar: 16, shipyard: 40, aa: 7 }[kind];
    const s = { kind, I, side, x, y, z, hp, max: hp, mesh, dead: false, r: kind === 'aa' ? 2.8 : ud.r, h: kind === 'aa' ? 2 : ud.h * 0.5, cd: rnd(1, 3), rebuild: 0 };
    ud.attach?.({ fx, s });   // WORLD: faction structures (world/structures.js) smoke and scorch through fx
    if (kind === 'aa') defence.attach(s);   // DEFENCE hook: unit state, hit size, parked on the slope
    if (kind === 'factory') s.chimneys = ud.stackTops.map(([sx, sy, sz]) => { _v.set(sx, sy, sz).applyEuler(mesh.rotation).add(mesh.position); return fx.chimney(_v.x, _v.y, _v.z, 1); });
    I.structs.push(s); return s;
  }
  function aaSlots(I) {   // where AA guns go: round the pad
    const p = I.pad, n = I.cave ? 4 : 4, r = I.cave ? 15 : 22;
    return Array.from({ length: n }, (_, k) => { const a = k * Math.PI / 2 + Math.PI / 4; return [p.x + Math.cos(a) * r, p.z + Math.sin(a) * r]; });
  }
  function freeSlot(I) { return aaSlots(I).find(([x, z]) => !I.structs.some(s => s.kind === 'aa' && !s.dead && Math.hypot(s.x - x, s.z - z) < 3)); }
  function buildAA(I, side) { const sl = freeSlot(I); if (!sl) return null; const s = addStruct(I, 'aa', sl[0], sl[1], side); s.building = 4; s.mesh.scale.setScalar(0.01); return s; }
  W.aliveAA = (I, side = I.owner) => I.structs.filter(s => s.kind === 'aa' && !s.dead && s.side === side && !s.building).length;
  function coastPoint(I, toward) {   // a spot on the island's shore facing `toward`
    const a = Math.atan2(toward[1] - I.z, toward[0] - I.x);
    for (let r = 20; r < I.r + 60; r += 2) { const x = I.x + Math.cos(a) * r, z = I.z + Math.sin(a) * r; if (terrainH(x, z) < 2.5) return [x - Math.cos(a) * 10, z - Math.sin(a) * 10, a]; }
    return [I.x + Math.cos(a) * I.r * 0.7, I.z + Math.sin(a) * I.r * 0.7, a];
  }
  let seeding = false;   // DEFENCE: true while the starting garrisons go in
  function buildIslands() {
    seeding = true;
    for (const I of W.islands) {
      I.structs = []; I.cap = null; I.owner = I.owner0 ?? I.owner; I.owner0 = I.owner; I.seen = I.owner === 1 ? I.owner : -1; I.lastHit = -99;
      const p = I.pad;
      if (I.cave) {   // cave islands: HQ (+ a derrick on fortresses) beside the pad
        addStruct(I, 'hq', p.x - 17, p.z + 9, I.owner, Math.atan2(17, -9));   // WORLD: fronts face the pad
        if (I.kind === 'fortress') addStruct(I, 'fuel', p.x + 19, p.z + 6, I.owner, Math.atan2(-19, -6));
        if (I.name === 'IRONHOLD') { const [x, z, a] = coastPoint(I, [0, 0]); I.yard = addStruct(I, 'shipyard', x, z, 2, -a + Math.PI / 2); }
      } else {
        const a0 = structAngle(I);   // WORLD: was random; seeded so the island's village can be laid out round it
        addStruct(I, 'hq', p.x + Math.cos(a0) * 17, p.z + Math.sin(a0) * 17, I.owner, Math.atan2(-Math.cos(a0), -Math.sin(a0)));   // WORLD: fronts face the pad
        addStruct(I, I.kind, p.x + Math.cos(a0 + Math.PI) * 18, p.z + Math.sin(a0 + Math.PI) * 18, I.owner, Math.atan2(Math.cos(a0), Math.sin(a0)));
      }
      const guns = I.owner === 0 ? 0 : I.name === 'IRONHOLD' ? 4 : I.kind === 'hq' ? 2 : I.owner === 2 ? 2 : 1;
      for (let k = 0; k < guns; k++) { const s = buildAA(I, I.owner); if (s) { s.building = 0; s.mesh.scale.setScalar(1); } }
    }
    seeding = false;
  }
  function recolor(s) {
    const c = TEAM[s.side]; s.mesh.traverse(o => { if (o.material && o.material === s.mesh.userData.team) o.material.color.setHex(c); });
    s.mesh.userData.setSide?.(s.side);   // WORLD: 1980 / RUNAWAY style, flags, growth
  }
  W.setOwner = (I, side, how) => {
    const was = I.owner; if (was === side) return;
    I.owner = side; I.cap = null;
    {   // a burst of the new owner's colour over the pad
      const c = side === 1 ? [0.3, 0.85, 1] : [1, 0.3, 0.15], p = I.pad;
      for (let i = 0; i < 70; i++) { const a = rnd(6.283), sp = rnd(4, 16); fx.add.spawn(p.x, p.h + 1, p.z, Math.cos(a) * sp, rnd(8, 26), Math.sin(a) * sp, rnd(1, 2.2), rnd(0.5, 1.1), 0.2, c[0], c[1], c[2], 1, 9, 0.6); }
      fx.water.add({ x: p.x, y: p.h + 0.3, z: p.z, size: 4, grow: 60, a: 0.8, life: 1, tile: 1, pow: 2 });
    }
    for (const s of I.structs) {
      if (s.kind === 'aa') { if (!s.dead && s.side !== side) killStruct(s, true); continue; }
      s.side = side; recolor(s);
    }
    const who = side === 1 ? 'WE HAVE TAKEN' : 'ENEMY HAS TAKEN';
    feed(`${who} ${I.name}${how ? '  (' + how + ')' : ''}`, side === 1 ? 'good' : 'bad');
    if (side === 1) { ctx.addScore(I.cave ? 3000 : 1000); sfx.dock(); }
    else sfx.alarm?.();
    if (side === 2 && I.kind !== 'radar') { const s = buildAA(I, 2); if (s) { s.building = 0; s.mesh.scale.setScalar(1); } }   // transports bring a gun
    ctx.onOwner(I, was);
    if (I.name === 'IRONHOLD' && side === 1) end('win', 'IRONHOLD CAPTURED');
  };
  function killStruct(s, quiet) {
    if (s.dead) return; s.dead = true; s.hp = 0;
    const big = { hq: 2.6, factory: 3, fuel: 3.4, radar: 2.2, shipyard: 3.6, aa: 1.4 }[s.kind];
    fx.explode(s.x, s.y + s.h, s.z, big, { fire: s.kind === 'aa' ? 25 : 90, debris: Math.round(big * 5), color: 0x5a5650, crater: 2.4 });
    if (s.kind === 'fuel') { fx.explode(s.x + 5, s.y + 3, s.z + 4, 2.4, { fire: 120 }); setTimeout(() => fx.explode(s.x - 5, s.y + 3, s.z + 4, 2.8, { fire: 140 }), 350); }
    boomAt(s.x, s.y, s.z, Math.min(1.4, big * 0.4));
    if (s.mesh.userData.setState) s.mesh.userData.setState('destroyed');   // WORLD: the structure shows its own ruin
    else { s.mesh.visible = false; s.rubble = buildRubble(s.r * 0.9); s.rubble.position.set(s.x, s.y, s.z); islandGroup.add(s.rubble); }
    if (s.chimneys) for (const c of s.chimneys) c.off = true;
    if (s.kind !== 'aa') s.rebuild = 60;
    if (s.kind === 'shipyard') { W.E.bship = Math.max(0, W.E.bship - 30); feed('SHIPYARD DESTROYED  -  LEVIATHAN SET BACK', 'good'); }
    if (!quiet && s.side === 2) { ctx.addScore(s.kind === 'aa' ? 250 : 600); feed(`${s.I.name}: ${s.kind === 'aa' ? 'AA GUN' : s.kind.toUpperCase()} DESTROYED`, 'good'); }
    if (!quiet && s.side === 1) feed(`${s.I.name}: OUR ${s.kind === 'aa' ? 'AA GUN' : s.kind.toUpperCase()} DESTROYED`, 'bad');
  }
  function restoreStruct(s) {
    s.dead = false; s.hp = s.max; s.mesh.visible = true; if (s.rubble) { islandGroup.remove(s.rubble); s.rubble = null; }
    s.mesh.userData.setState?.('intact');   // WORLD
    if (s.chimneys) for (const c of s.chimneys) c.off = false;
    recolor(s);
  }

  // ------------------------------------------------------------------------------------- ships
  function makeShip(type, side, x, z, yaw) {
    const m = type === 'carrier' ? buildCarrier(side) : type === 'freighter' ? buildFreighter() : buildBattleship();
    if (type === 'carrier' && side === 1) defence.refitCarrier(m, 1);   // DEFENCE hook: the ALBATROSS's close-in guns and missile boxes
    else if (side === 2) defence.refitShip(m, 2);   // SEAWORLD: KRAKEN / LEVIATHAN / container ship get TALON and LANCE mounts
    const dims = type === 'carrier' ? CARRIER : type === 'freighter' ? FREIGHTER : BSHIP;
    const u = { type, side, p: new THREE.Vector3(x, 0, z), v: new THREE.Vector3(), yaw, w: 0, speed: 0, max: { carrier: 6, freighter: 5, battleship: 7.5 }[type], hp: { carrier: 600, freighter: 70, battleship: 420 }[type], mesh: m.group, parts: m, dims, path: [], guns: [], wakeT: 0, launchT: 0 };
    u.hpMax = u.hp;
    u.guns = m.guns.map(g => ({ mesh: g, hp: 9, max: 9, dead: false, cd: rnd(1, 3), range: type === 'carrier' ? 150 : 130, ship: u }));
    for (const g of u.guns) defence.attach(g);   // DEFENCE hook (no-op for the generic buildGun mounts)
    if (m.turrets) u.turrets = m.turrets.map(t => ({ mesh: t, cd: rnd(2, 5) }));
    if (m.dims) u.dims = m.dims;   // NAVAL: the builder's own dimensions (same contract numbers for the carriers)
    u.mo = createShipMotion(SHIP_MOTION[m.motion || (type === 'carrier' ? (side === 1 ? 'albatross' : 'kraken') : type === 'freighter' ? 'container' : 'leviathan')], W.sea, (W.units.length + 1) * 31 + side);
    u.att = { heave: 0, pitch: 0, roll: 0, vHeave: 0, vPitch: 0, vRoll: 0 };
    m.group.position.copy(u.p); m.group.rotation.y = yaw; scene.add(m.group); W.units.push(u); return u;
  }
  const fwdX = yaw => -Math.sin(yaw), fwdZ = yaw => -Math.cos(yaw);
  function toLocal(u, x, z) { const dx = x - u.p.x, dz = z - u.p.z, c = Math.cos(u.yaw), s = Math.sin(u.yaw); return [dx * c - dz * s, dx * s + dz * c]; }
  function toWorld(u, lx, ly, lz, out = _v) { const c = Math.cos(u.yaw), s = Math.sin(u.yaw); return out.set(u.p.x + lx * c + lz * s, u.p.y + ly, u.p.z - lx * s + lz * c); }
  // deck height under (x, z) if it is over a ship (and the superstructure, so you can fly into it), else -1e9
  W.deckY = (x, z, skipSide = 0) => {
    let best = -1e9;
    for (const u of W.units) {
      if (!u.dims || u.sinking > 4 || u.side === skipSide) continue;
      if (Math.abs(x - u.p.x) > 70 || Math.abs(z - u.p.z) > 70) continue;
      const [lx, lz] = toLocal(u, x, z), D = u.dims, sink = u.p.y;
      if (u.parts.localDeck) {   // NAVAL: the builder knows its deck and superstructure; heave, pitch and roll included
        const h = u.parts.localDeck(lx, lz); if (h < -1e8) continue;
        const a = u.att; best = Math.max(best, shipPointY(sink, a.heave, a.pitch, a.roll, lx, h, lz)); continue;
      }
      if (u.type === 'carrier') {
        let hw = D.W / 2 * 0.97; if (lz < -D.L / 2 + 16) hw *= Math.max(0, (lz + D.L / 2 + 6) / 22);
        if (Math.abs(lx) < hw && lz > -D.L / 2 - 6 && lz < D.L / 2) best = Math.max(best, D.DECK + sink);
        if (Math.abs(lx - D.TOWER_X) < 2.9 && Math.abs(lz - D.TOWER_Z) < 9) best = Math.max(best, D.DECK + D.TOWER_H + sink);
      } else if (u.type === 'freighter') {
        if (Math.abs(lx) < D.W / 2 && Math.abs(lz) < D.L / 2 - 3) best = Math.max(best, D.DECK + 4.6 + sink);   // on the containers
        if (Math.abs(lx) < 4.3 && Math.abs(lz - (D.L / 2 - 6)) < 3.2) best = Math.max(best, D.DECK + 6 + sink);
      } else {
        if (Math.abs(lx) < D.W / 2 && Math.abs(lz) < D.L / 2 - 6) best = Math.max(best, D.DECK + sink);
        if (Math.abs(lx) < 4.5 && Math.abs(lz - 4) < 10) best = Math.max(best, D.DECK + 14 + sink);
      }
    }
    return best;
  };
  W.shipAt = (x, z) => W.units.find(u => u.dims && Math.abs(x - u.p.x) < 70 && Math.abs(z - u.p.z) < 70 && (() => { const [lx, lz] = toLocal(u, x, z); return Math.abs(lx) < (u.parts.halfW || u.dims.W / 2) && Math.abs(lz) < u.dims.L / 2 + 4; })());   // SEAWORLD: halfW reaches the outboard lifts
  // vy: the deck's vertical velocity there (heave + pitch + roll; the sky carrier's climb), for gear that wants it
  W.surfVel = (x, z) => { const u = W.shipAt(x, z); if (!u || u.sinking) return null; const a = u.att, [lx, lz] = toLocal(u, x, z), h = u.parts.localDeck ? Math.max(0, u.parts.localDeck(lx, lz)) : u.dims.DECK; return { vx: u.v.x, vz: u.v.z, w: u.w, cx: u.p.x, cz: u.p.z, vy: u.v.y + (a ? shipPointVY(a.vHeave, a.pitch, a.roll, a.vPitch, a.vRoll, lx, h, lz) : 0) }; };
  // the deck height of ship u under (x, z), moving with the sea (the jet's catapult and wires use it)
  W.deckAt = (u, x, z) => { const [lx, lz] = toLocal(u, x, z), a = u.att, h = u.dims.DECK; return a ? shipPointY(u.p.y, a.heave, a.pitch, a.roll, lx, h, lz) : h + u.p.y; };
  W.orderCarrier = (x, z) => {
    const u = W.carrier; if (!u || u.sinking) return false;
    if (u.sky && u.sky.up) { u.path = [[x, z]]; u.goal = [x, z]; u.sky.manual = false; return true; }   // it flies: straight there
    const [wx, wz] = nav.wet(x, z) ? [x, z] : nav.nearestWater(x, z);
    u.path = nav.path(u.p.x, u.p.z, wx, wz); u.goal = [wx, wz]; return true;
  };
  // ---------------------------------------------------------------- SKY CARRIER
  // The ALBATROSS refitted with four ducted lift fans. It flies like a building would: the helm, the speed telegraph
  // and the lift lever all move slowly, and the ship answers them slowly - minutes of inertia, not seconds.
  // sky.manual: someone is at the helm (main.js sets sky.tel / sky.helmIn / sky.lift each frame).
  const SKY = { VMAX: 16, ACC: 0.3, DEC: 0.45, YAW: 0.06, YAW_ACC: 0.01, CLIMB: 3.2, V_ACC: 0.32, CEIL: 230, CRUISE: 70 };
  W.upgradeCarrier = () => {
    const u = W.carrier;
    if (!u || u.sinking !== undefined) return 'NO CARRIER TO REFIT';
    if (u.sky) return u.sky.up ? 'THE ALBATROSS ALREADY FLIES' : `REFIT UNDER WAY  -  ${Math.ceil(u.sky.refit)}s`;
    if (W.P.mat < COST.sky) return `SKY CARRIER REFIT NEEDS ${COST.sky} MATERIEL`;
    W.P.mat -= COST.sky; u.path = []; u.goal = null;
    addLiftFans(u.parts);
    u.sky = { refit: 24, up: false, deploy: 0, spin: 0, tel: 0, helmIn: 0, lift: 0, telV: 0, helmV: 0, liftV: 0, yawRate: 0, vy: 0, pitch: 0, roll: 0, manual: false, hold: 0, scrapeT: 0 };
    feed('SKY CARRIER REFIT STARTED  -  LIFT FANS GOING ON THE ALBATROSS (24s)', 'good'); sfx.dock();
    return 'SKY CARRIER REFIT  -  STAND CLEAR OF THE OUTRIGGERS';
  };
  function skyRefit(u, dt) {
    const S = u.sky; u.speed *= Math.exp(-0.5 * dt); u.path = [];
    S.refit -= dt;
    const k = clamp(1 - S.refit / 8, 0, 1);   // the last 8 s: the outriggers fold out and the fans spin up
    for (const f of u.parts.fans) { f.arm.visible = k > 0; const e = k * k * (3 - 2 * k); f.arm.scale.set(Math.max(0.001, e), Math.max(0.001, e), Math.max(0.001, e)); }
    if (Math.random() < 0.3) { toWorld(u, rnd(-12, 12), CARRIER.DECK + 1, rnd(-50, 50)); fx.add.spawn(_v.x, _v.y, _v.z, rnd(-3, 3), rnd(2, 5), rnd(-3, 3), 0.3, 0.3, 0.1, 1, .9, .5, 1, 9); }   // welding sparks
    if (S.refit <= 0) { S.up = true; S.hold = 40; feed('SKY CARRIER ALBATROSS  -  LIFT FANS ONLINE  -  TAKE THE HELM FROM THE DECK (TAB)', 'good'); sfx.alarm?.(); }
  }
  const lever = (cur, want, rate, dt) => cur + clamp(want - cur, -rate * dt, rate * dt);
  function hullFloor(u) {   // the highest ground under the hull (sea = 0), sampled along and across it
    let f = 0;
    for (const lz of [-55, -25, 0, 25, 55]) for (const lx of [-12, 0, 12]) { toWorld(u, lx, 0, lz); f = Math.max(f, terrainH(_v.x, _v.z)); }
    return f;
  }
  function flySky(u, dt) {
    const S = u.sky;
    S.spin = Math.min(1, S.spin + dt * 0.25);
    // what the levers are asked to do: by the helmsman, or by the autopilot
    let tel = 0, helm = 0, lift = 0;
    if (S.manual) { tel = S.tel; helm = S.helmIn; lift = S.lift; }
    else {
      const ahead = Math.max(hullFloor(u), terrainH(u.p.x + fwdX(u.yaw) * 120, u.p.z + fwdZ(u.yaw) * 120), terrainH(u.p.x + fwdX(u.yaw) * 220, u.p.z + fwdZ(u.yaw) * 220));
      const alt = u.path.length ? Math.max(SKY.CRUISE, ahead + 40) : Math.max(S.hold, ahead > 0.5 ? ahead + 30 : 0);
      if (u.path.length) {
        const [tx, tz] = u.path[0], d = Math.hypot(tx - u.p.x, tz - u.p.z);
        if (d < 25 && u.speed < 2) { u.path.shift(); S.hold = u.p.y; }
        else { const turn = angDiff(u.yaw, Math.atan2(-(tx - u.p.x), -(tz - u.p.z))); helm = clamp(turn * 3, -1, 1); tel = clamp(d / 260, 0, 1) * (Math.abs(turn) > 0.8 ? 0.3 : 1); }
      }
      lift = clamp((alt - u.p.y) * 0.06 - S.vy * 0.25, -1, 1);
    }
    // heavy levers: they travel slowly to where they are pushed
    S.telV = lever(S.telV, tel, 0.25, dt); S.helmV = lever(S.helmV, helm, 0.4, dt); S.liftV = lever(S.liftV, lift, 0.5, dt);
    // and the ship follows them slower still
    const vWant = S.telV * SKY.VMAX;
    u.speed += clamp(vWant - u.speed, -SKY.DEC * dt, SKY.ACC * dt);
    const accel = u.speed - (S.lastV ?? u.speed); S.lastV = u.speed;
    S.yawRate += clamp(S.helmV * SKY.YAW * clamp(0.35 + u.speed / 8, 0.35, 1) - S.yawRate, -SKY.YAW_ACC * dt, SKY.YAW_ACC * dt);
    u.yaw += S.yawRate * dt; u.w = S.yawRate;
    S.vy += clamp(S.liftV * SKY.CLIMB - S.vy, -SKY.V_ACC * dt, SKY.V_ACC * dt);
    u.v.set(fwdX(u.yaw) * u.speed, S.vy, fwdZ(u.yaw) * u.speed);
    u.p.x += u.v.x * dt; u.p.z += u.v.z * dt; u.p.y += S.vy * dt;
    // ground and sea: the hull bottom is 4 m under the waterline mark; over land it scrapes
    const floor = hullFloor(u), minY = floor > 0.5 ? floor + 4.5 : 0;
    if (u.p.y < minY) {
      const hit = Math.max(-S.vy, u.speed * 0.3);
      u.p.y = minY; if (S.vy < 0) S.vy = 0;
      if (floor > 0.5 && hit > 0.6) {
        S.scrapeT -= dt; u.speed *= Math.exp(-0.6 * dt);
        if (S.scrapeT <= 0) { S.scrapeT = 0.25; u.hp -= hit * 1.5; u.lastHit = W.time; toWorld(u, rnd(-12, 12), -3, rnd(-50, 50)); fx.impact(_v.x, _v.y, _v.z, 'ground'); fx.explode(_v.x, _v.y, _v.z, 0.8, { debris: 3, color: 0x4a4440 }); boomAt(_v.x, _v.y, _v.z, 0.4); if (u.side === 1 && Math.random() < 0.2) feed('THE ALBATROSS IS SCRAPING THE GROUND  -  MORE LIFT', 'bad'); checkShip(u); }
      }
    }
    if (u.p.y > SKY.CEIL) { u.p.y = SKY.CEIL; S.vy = Math.min(0, S.vy); }
    // a little tilt: nose down when it speeds up, bank into turns, a slow heave
    S.pitch += (clamp(-accel / dt * 0.05, -0.05, 0.05) + Math.sin(W.time * 0.31) * 0.004 - S.pitch) * (1 - Math.exp(-1.2 * dt));
    S.roll += (clamp(S.yawRate * u.speed * 0.05, -0.06, 0.06) + Math.sin(W.time * 0.23 + 1) * 0.005 - S.roll) * (1 - Math.exp(-1 * dt));
    Object.assign(u.att, { heave: 0, pitch: S.pitch, roll: S.roll, vHeave: 0, vPitch: 0, vRoll: 0 }); placeShip(u);
    skyVisuals(u, dt);
    if (u.parts.dish) u.parts.dish.rotation.y += dt * 1.6;
    if (u.parts.lamp) u.parts.lamp.visible = (W.time % 1.4) < 0.15;
    const hurt = 1 - u.hp / u.hpMax;
    if (hurt > 0.25 && Math.random() < hurt * 0.5) { toWorld(u, rnd(-8, 8), u.dims.DECK + 1, rnd(-40, 40)); fx.trail(_v.x, _v.y, _v.z, 2 + hurt * 3); }
  }
  function skyVisuals(u, dt) {
    const S = u.sky, lifting = 0.5 + 0.5 * clamp(S.liftV + 0.6, 0, 1);
    for (const f of u.parts.fans) {
      f.rotor.rotation.y += dt * (2 + 16 * S.spin * lifting) * f.sd;
      f.disc.material.opacity = 0.12 * S.spin; f.glow.material.opacity = 0.35 + 0.5 * S.spin * lifting;
    }
    // downwash: spray off the sea (or dust off the land) under each fan when low, and the odd persistent ring of foam
    S.washT = (S.washT || 0) - dt;
    if (S.washT <= 0 && u.p.y < 60) {
      S.washT = 0.08; const k = 1 - u.p.y / 60;
      for (const [sd, z] of FAN_POS) {
        toWorld(u, sd * (CARRIER.W * 0.42 + 17), 0, z);
        const gx = _v.x, gz = _v.z, gy = Math.max(terrainH(gx, gz), 0), wet = gy <= 0.05;
        for (let i = 0; i < 3; i++) if (Math.random() < k) {
          const a = rnd(6.283), sp = rnd(10, 20) * k + 4;
          if (wet) fx.mix.spawn(gx + Math.cos(a) * 6, 0.4, gz + Math.sin(a) * 6, Math.cos(a) * sp, rnd(0.5, 3), Math.sin(a) * sp, rnd(0.8, 1.5), 1.2, 5, .86, .92, .97, 0.45, 2, 1.2, 0.4);
          else fx.mix.spawn(gx + Math.cos(a) * 6, gy + 0.5, gz + Math.sin(a) * 6, Math.cos(a) * sp, rnd(0.5, 2.5), Math.sin(a) * sp, rnd(1, 1.8), 1.2, 5, .55, .48, .36, 0.45, 1.5, 1.3, 0.4);
        }
        if (wet && Math.random() < 0.15 * k) fx.water.add({ x: gx, y: 0.1, z: gz, size: 5, grow: 14, a: 0.4 * k, life: 2.5, tile: 2, pow: 1.5 });
      }
    }
    if (u.p.y < 1 && u.speed > 0.8 && (u.wakeT -= dt) <= 0) { u.wakeT = 0.3; toWorld(u, 0, 0, u.dims.L / 2 + 2); fx.wake(_v.x, _v.z, 1.6 + u.speed * 0.25); }
  }
  // shot down in the air: the fans die and it falls
  function skyFall(u, dt) {
    const S = u.sky; S.vy -= 9.8 * dt * 0.6; u.v.y = S.vy; u.p.y += S.vy * dt; u.p.x += u.v.x * dt; u.p.z += u.v.z * dt; u.v.multiplyScalar(Math.exp(-0.3 * dt));
    S.roll += dt * 0.08; S.pitch += dt * 0.03; Object.assign(u.att, { heave: 0, pitch: S.pitch, roll: S.roll }); placeShip(u);
    for (const f of u.parts.fans) { f.rotor.rotation.y += dt * 2; f.glow.material.opacity = 0; }
    if (Math.random() < 0.5) { toWorld(u, rnd(-12, 12), CARRIER.DECK, rnd(-50, 50)); fx.trail(_v.x, _v.y, _v.z, 4); fx.add.spawn(_v.x, _v.y, _v.z, 0, 2, 0, 0.6, 3, 1, 1, .5, .1, 0.9, -1.5, 1); }
    const floor = hullFloor(u);
    if (u.p.y <= Math.max(0, floor + 4)) {
      S.falling = false;
      if (floor > 0.5) { fx.explode(u.p.x, floor, u.p.z, 6, { debris: 30, fire: 90, crater: 10, color: 0x56616c }); boomAt(u.p.x, floor, u.p.z, 1.6); scene.remove(u.mesh); u.gone = true; }
      else { u.p.y = 0; fx.splash?.(u.p.x, u.p.z, 6); fx.explode(u.p.x, 2, u.p.z, 5, { debris: 20, oil: true }); boomAt(u.p.x, 0, u.p.z, 1.6); }
    }
  }
  // the mesh follows the ship's attitude; the ship's own animation (radars, crew, mounts) runs when it is near
  function placeShip(u) {
    const a = u.att; u.mesh.position.set(u.p.x, u.p.y + a.heave, u.p.z); u.mesh.rotation.set(a.pitch, u.yaw, a.roll, 'YXZ');
  }
  const _pl = new THREE.Vector3();
  function tickParts(u, dt) {
    if (!u.parts.tick) return;
    const d = Math.hypot(u.p.x - ear.x, u.p.y - ear.y, u.p.z - ear.z), pl = W._pl;
    // deck crew clear out from under a helicopter or jet coming down close to them
    let avoid = null;
    if (pl && pl.alive && pl.pos && Math.abs(pl.pos.x - u.p.x) < 90 && Math.abs(pl.pos.z - u.p.z) < 90) {
      const [hx, hz] = toLocal(u, pl.pos.x, pl.pos.z), hy = pl.pos.y - u.p.y - u.dims.DECK;
      if (hy < 14 && hy > -2) avoid = (x, z) => { const dx = x - hx, dz = z - hz, r = Math.hypot(dx, dz); return r < 9 ? [dx || 0.1, dz] : null; };
    }
    u.parts.tick(dt, W.time, d, avoid);
  }
  function sailShip(u, dt) {
    tickParts(u, dt);
    if (u.sky) {
      const S = u.sky;
      if (u.sinking !== undefined && S.up && !S.fallen) { S.falling = true; S.fallen = true; S.up = false; }   // killed in the air: it falls
      if (S.falling) { skyFall(u, dt); return; }
      if (S.up && u.sinking === undefined) { flySky(u, dt); return; }
      if (!S.up && !S.fallen && u.sinking === undefined) skyRefit(u, dt);
    }
    if (u.sinking !== undefined) {   // going down: list, settle, burn
      u.sinking += dt; u.speed *= Math.exp(-0.4 * dt); u.p.y = -u.sinking * 0.9;
      if (Math.random() < 0.08) { toWorld(u, rnd(-10, 10), u.dims.DECK, rnd(-40, 40)); fx.explode(_v.x, _v.y, _v.z, rnd(1.2, 2.4), { debris: 4, color: 0x4a4440 }); boomAt(_v.x, _v.y, _v.z, 0.5); }
      if (u.sinking > 18) { scene.remove(u.mesh); u.gone = true; }
    }
    let tgtYaw = u.yaw, want = 0;
    if (u.path.length && u.sinking === undefined) {
      const [tx, tz] = u.path[0], d = Math.hypot(tx - u.p.x, tz - u.p.z);
      if (d < (u.path.length > 1 ? 30 : 12)) u.path.shift();
      else { tgtYaw = Math.atan2(-(tx - u.p.x), -(tz - u.p.z)); const last = u.path.length === 1; want = u.max * (last ? clamp(d / 80, 0.15, 1) : 1); }
    }
    const turn = angDiff(u.yaw, tgtYaw), rate = 0.09 * clamp(u.speed / 3, 0.3, 1);
    u.w = clamp(turn, -rate, rate) * (Math.abs(turn) > 0.02 ? 1 : 0); u.yaw += u.w * dt;
    if (Math.abs(turn) > 1.2) want *= 0.35;
    u.speed += clamp(want - u.speed, -0.6 * dt, 0.35 * dt);
    // never run aground: if the bow would be in the shallows, brake hard
    const ahead = u.dims.L / 2 + 6 + u.speed * 5, bx = u.p.x + fwdX(u.yaw) * ahead, bz = u.p.z + fwdZ(u.yaw) * ahead;
    if (terrainH(bx, bz) > -3 && Math.abs(turn) < 0.6) u.speed = Math.max(0, u.speed - 2 * dt);
    u.v.set(fwdX(u.yaw) * u.speed, 0, fwdZ(u.yaw) * u.speed);
    u.p.addScaledVector(u.v, dt);
    // NAVAL: heave, pitch and roll in the seaway (and the list of a sinking ship); deckY() uses the same attitude
    const a = u.att, mo = u.mo.step(dt, u.speed, u.yaw, u.w, u.p.x, u.p.z);   // SEAWORLD: on the live sea at its position
    a.heave = mo.heave; a.pitch = mo.pitch; a.roll = mo.roll; a.vHeave = mo.vHeave; a.vPitch = mo.vPitch; a.vRoll = mo.vRoll;
    if (u.sinking !== undefined) { a.roll += Math.min(0.35, u.sinking * 0.03) * (u.side === 1 ? 1 : -1); a.pitch -= Math.min(0.12, u.sinking * 0.01); }
    placeShip(u);
    if (u.sinking === undefined) nfx.ship(u, dt, ear);   // bow wave, wake, spray, funnel smoke
    else if (u.sinking > 6) nfx.remove(u);
    if (u.parts.dish) u.parts.dish.rotation.y += dt * 1.6;
    if (u.parts.lamp) u.parts.lamp.visible = (W.time % 1.4) < 0.15;
    // damage smoke: the more hurt, the more it burns
    const hurt = 1 - u.hp / u.hpMax;
    if (hurt > 0.25 && Math.random() < hurt * 0.5 && u.sinking === undefined) { toWorld(u, rnd(-8, 8), u.dims.DECK + 1, rnd(-40, 40)); fx.trail(_v.x, _v.y, _v.z, 2 + hurt * 3); if (hurt > 0.55) fx.add.spawn(_v.x, _v.y, _v.z, 0, 2, 0, 0.5, 2.4, 0.6, 1, .5, .1, 0.8, -1.5, 1); }
  }

  // ------------------------------------------------------------------------------------- aircraft
  // NGC-1980 hook: the rotary module flies 'drone' (CH-46), 'transport' (MV-22) and 'gunship' (RW-3 WASP) physically
  const ROT = createRotary({ W, scene, fx, sfx, terrainH, isWater, feed, addScore: ctx.addScore, shoot, blast, boomAt, hear, ear });
  W.rotary = ROT;
  // NGC-1980 GROUND WAR hook (units/groundwar/): the troops the transports land fight on the islands - STRIDERs off the
  // MV-22s, the CH-46's Marines, RW-7 hover tanks over the sea and seized MBTs by landing craft. Squads stand in W.units
  // as 'squad' proxies (capture, gunship targets, expansion); the war's rounds and blasts reach them through GW below.
  const GW = createGroundWar({ W, scene, fx, sfx, terrainH, nav, feed, hear, boomAt, ear, addScore: ctx.addScore, player: ctx.player, hurtPlayer: (a, why, at, dir) => ctx.hurtPlayer(a, why, at, dir), cw: ctx.cw });   // (COLLISION: the one collision world)
  W.ground = GW; ROT.ground = GW;
  function makeAir(type, side, x, y, z, extra = {}) {
    { const ru = ROT.make(type, side, x, y, z, extra); if (ru) { W.units.push(ru); return ru; } }   // NGC-1980 hook
    const m = type === 'drone' ? buildDrone() : type === 'transport' ? buildTransport() : type === 'escort' ? buildTomcat(side) : buildGunship(side);
    const hp = { drone: 5, transport: 7, gunship: 3, escort: 4 }[type];
    const u = { type, side, p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(), yaw: 0, hp, hpMax: hp, mesh: m.group, parts: m, r: type === 'transport' ? 4.5 : type === 'escort' ? 4 : 3.2, cd: rnd(1, 2.5), ph: rnd(6.28), state: 'go', ...extra };
    m.group.position.copy(u.p); scene.add(m.group); W.units.push(u); return u;
  }
  function launchPoint(side) {   // from the carrier deck if it is afloat, else the HQ pad
    const c = side === 1 ? W.carrier : W.enemyCarrier;
    if (c && !c.sinking && c.sinking === undefined) return [c.p.x, CARRIER.DECK + 4 + Math.max(0, c.p.y), c.p.z];
    const hq = W.islands.find(I => I.kind === 'hq' && I.owner0 === side); return [hq.pad.x, hq.pad.h + 4, hq.pad.z];
  }
  W.sendDrone = I => {
    // NGC-1980 ngc/infdepth hook: Marines back from the sickbay (casualty evacuation) fill seats: less materiel
    const cost = COST.drone - (GW.CV ? GW.CV.poolCredit(COST.drone) : 0);
    if (W.P.mat < cost) return 'NOT ENOUGH MATERIEL';
    const reinforce = I.owner === 1 && !I.cave && GW.presence(I, 2) > 0;   // NGC-1980 GROUND WAR hook: Marines to one of our islands the machines have landed on
    if (I.owner === 1 && !reinforce) return `${I.name} IS ALREADY OURS`;
    if (I.cave) return 'CAVE ISLANDS: STEAL THE POD FROM THE CAVE';
    if (W.units.filter(u => u.type === 'drone' && !u.dead).length >= 3) return 'THREE SEA KNIGHTS ALREADY OUT';
    W.P.mat -= cost; const [x, y, z] = launchPoint(1); makeAir('drone', 1, x, y, z, { target: I, reinforce });
    const back = GW.CV ? GW.CV.poolUse() : 0;   // (ngc/infdepth)
    sfx.dock(); return `SEA KNIGHT LAUNCHED  -  13 MARINES${back ? ` (${back} BACK FROM THE SICKBAY)` : ''} ${reinforce ? 'TO REINFORCE' : 'FOR'} ${I.name}`;
  };
  W.orderAA = I => {
    if (I.owner !== 1) return 'GUNS CAN ONLY GO ON OUR ISLANDS';
    if (W.P.mat < COST.aa) return 'NOT ENOUGH MATERIEL';
    const s = buildAA(I, 1); if (!s) return `${I.name}: NO ROOM FOR MORE GUNS`;
    W.P.mat -= COST.aa; s.building = 12; return `AA GUN GOING UP ON ${I.name}`;
  };
  function flyTo(u, tx, ty, tz, sp, dt, k = 1.4) {
    const dx = tx - u.p.x, dz = tz - u.p.z, d = Math.hypot(dx, dz) || 1, s = Math.min(sp, d * 0.8);
    _w.set(dx / d * s, (ty - u.p.y) * 1.2, dz / d * s);
    u.v.lerp(_w, 1 - Math.exp(-k * dt)); u.p.addScaledVector(u.v, dt);
    const floor = Math.max(terrainH(u.p.x, u.p.z), 0, W.deckY(u.p.x, u.p.z)) + 2.5; if (u.p.y < floor) { u.p.y = floor; u.v.y = Math.max(0, u.v.y); }
    if (Math.hypot(u.v.x, u.v.z) > 2) u.yaw += angDiff(u.yaw, Math.atan2(-u.v.x, -u.v.z)) * Math.min(1, 3 * dt);
    return d;
  }
  const cruise = (x, z, alt) => Math.max(terrainH(x, z), 0, W.deckY(x, z)) + alt;
  function updateAir(u, dt, pl) {
    if (u.rot) { ROT.update(u, dt, pl, W.peace); return; }   // NGC-1980 hook: rotary units fly themselves (dying too)
    u.ph += dt;
    if (u.dying) {
      u.v.y -= 15 * dt; u.p.addScaledVector(u.v, dt); u.mesh.rotation.y += dt * 8; u.mesh.rotation.z += dt * 2;
      fx.add.spawn(u.p.x, u.p.y, u.p.z, rnd(-1, 1), rnd(0, 2), rnd(-1, 1), rnd(0.25, 0.5), 1.4, 0.4, 1, rnd(.4, .6), .1, 0.9, -1, 1); fx.trail(u.p.x, u.p.y, u.p.z, 1.3);
      const gy = Math.max(terrainH(u.p.x, u.p.z), 0, W.deckY(u.p.x, u.p.z));
      if (u.p.y < gy + 0.5) {
        const wet = isWater(u.p.x, u.p.z) && W.deckY(u.p.x, u.p.z) < 0; fx.explode(u.p.x, gy, u.p.z, u.type === 'transport' ? 2.6 : 2, { fire: wet ? 0 : 45, oil: wet, debris: 9, color: u.side === 1 ? 0x2a3f55 : 0x992222 }); boomAt(u.p.x, gy, u.p.z, 0.9);
        blast(u.p.x, gy + 1, u.p.z, 6, 3, 0); u.dead = true;
      }
      return;
    }
    if (u.sim || u.drone) { W.air.update(u, dt, pl); return; }   // AIR: real flight models flown by the AI pilot (units/air/airwar.js)
    if (u.type === 'gunship') updateGunship(u, dt, pl);
    else updateLander(u, dt);
    if (u.parts.rotors) for (const r of u.parts.rotors) r.rotation.y += dt * 30;
    if (u.parts.lamp) u.parts.lamp.visible = (W.time % 1) < 0.15;
    if (u.hp < u.hpMax * 0.5 && Math.random() < 0.4) fx.trail(u.p.x, u.p.y, u.p.z, 0.9);
    u.mesh.position.copy(u.p); u.mesh.rotation.y = u.type === 'gunship' || u.type === 'escort' ? u.mesh.rotation.y + dt * 2 : u.yaw;
    if (u.type !== 'gunship' && u.type !== 'escort') { u.mesh.rotation.x = clamp(-u.v.dot(_w.set(fwdX(u.yaw), 0, fwdZ(u.yaw))) * 0.015, -0.3, 0.3); }
  }
  // drones (ours) and transports (theirs): fly to the island, land on the pad, hold it until it flips
  function updateLander(u, dt) {
    const I = u.target;
    if (!I || I.owner === u.side) {   // job done or someone beat us to it: pick another or go home
      const next = u.side === 2 ? pickExpansion() : null;
      if (next && u.side === 2) { u.target = next; u.landed = false; return; }
      u.target = null; const [x, y, z] = launchPoint(u.side);
      const d = flyTo(u, x, cruise(u.p.x, u.p.z, 30), z, 20, dt); if (d < 12) u.dead = true;   // stowed back aboard
      return;
    }
    const p = I.pad, d = Math.hypot(p.x - u.p.x, p.z - u.p.z);
    if (d > 6) { flyTo(u, p.x, d > 60 ? cruise(u.p.x, u.p.z, 30) : p.h + 8, p.z, u.type === 'drone' ? 24 : 19, dt); u.landed = false; return; }
    // over the pad: settle and hold
    u.p.x += (p.x - u.p.x) * Math.min(1, 2 * dt); u.p.z += (p.z - u.p.z) * Math.min(1, 2 * dt);
    const gy = p.h + (u.type === 'transport' ? 1.9 : 1.2); u.p.y += (gy - u.p.y) * Math.min(1, 2 * dt); u.v.multiplyScalar(Math.exp(-3 * dt));
    u.landed = Math.abs(u.p.y - gy) < 0.5;
  }
  // enemy gunship: hunt the player when close, otherwise strike the assigned target or guard its patch
  function updateGunship(u, dt, pl) {
    u.retarget = (u.retarget || 0) - dt;
    if (u.retarget <= 0) {
      u.retarget = 1;
      const pd = pl.alive && !pl.inCave ? pl.pos.distanceTo(u.p) : 1e9;
      if (pd < (u.target === 'player' ? 260 : 170) * (pl.detect ?? 1)) u.target = 'player';   // FOUNDATION: pl.detect - a soldier is hard to spot
      else if (u.target === 'player') u.target = null;
      if (u.target && u.target !== 'player' && (u.target.dead || u.target.gone || (u.target.side !== undefined && u.target.side !== 1))) u.target = null;
      if (!u.target) {
        let best = null, bd = 160;
        for (const o of W.units) if (o.side === 1 && !o.dead && !o.dying && (o.type === 'drone' || o.type === 'escort' || o.type === 'squad') && o.p.distanceTo(u.p) < bd) { best = o; bd = o.p.distanceTo(u.p); }
        if (best) u.target = best; else if (u.raid) u.target = u.raid.dead || u.raid.gone || u.raid.side !== 1 ? (u.raid = null) : u.raid;
      }
    }
    let tp = null;
    if (u.target === 'player') tp = pl.pos;
    else if (u.target) tp = u.target.p || _v.set(u.target.x, u.target.y + u.target.h, u.target.z);
    if (tp) {
      const tx = tp.x, ty = tp.y, tz = tp.z;
      // circle-strafe at 40-60 m
      const a = u.ph * 0.5 + u.id, R = 48;
      flyTo(u, tx + Math.cos(a) * R, Math.max(cruise(u.p.x, u.p.z, 14), ty + 6 + Math.sin(u.ph) * 4), tz + Math.sin(a) * R, 17 + W.time / 120, dt, 1.6);
      u.cd -= dt;
      const d = Math.hypot(tx - u.p.x, ty - u.p.y, tz - u.p.z);
      if (u.cd <= 0 && d < 110) {
        u.cd = Math.max(0.8, 2.2 - W.time / 400) + rnd(0.8);
        const tv = u.target === 'player' ? pl.vel : u.target.v || _w.set(0, 0, 0), t = d / 55;
        _v.set(tx + tv.x * t * 0.6 + rnd(-3, 3), ty + tv.y * t * 0.6 + rnd(-2, 2), tz + tv.z * t * 0.6 + rnd(-3, 3)).sub(u.p).normalize().multiplyScalar(55);
        shoot('b', 2, u.p.x, u.p.y - 0.8, u.p.z, _v.x, _v.y, _v.z, 3); if (hear(u.p.x, u.p.y, u.p.z, 260) > 0) sfx.enemyShot();
      }
    } else {   // guard: orbit the home point
      const hx = u.home[0] + Math.cos(u.ph * 0.15 + u.id) * 70, hz = u.home[1] + Math.sin(u.ph * 0.15 + u.id) * 70;
      flyTo(u, hx, cruise(u.p.x, u.p.z, 26 + Math.sin(u.ph) * 4), hz, 12, dt);
    }
  }
  // our escort fighters: F-14A Tomcats on a real flight model, catapulted and trapped by the AI (units/air/airwar.js)
  W.sendEscort = I => W.air.sendEscort(I);
  W.spawnGunship = (side, near, raid) => {
    const [x, y, z] = near || launchPoint(2), u = makeAir('gunship', 2, x + rnd(-6, 6), y + 6, z + rnd(-6, 6));
    u.id = rnd(6.28); u.home = [x, z]; u.raid = raid || null; u.target = raid || null; return u;
  };

  // ------------------------------------------------------------------------------------- projectiles
  // kinds: b (bullet), ciws (fast tracer), flak (bursts at its fuse), rocket, bomb, shell (artillery),
  //        jb (jet cannon: fast, swept hit test), aam (heat-seeking missile, guided onto b.tgt)
  function shoot(kind, side, x, y, z, vx, vy, vz, life, extra) {
    const p = { kind, side, p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz), life, ...extra };
    if (kind === 'bomb') { p.mesh = new THREE.Mesh(bombGeo, bombMat); scene.add(p.mesh); }
    W.proj.push(p); return p;
  }
  const bombGeo = new THREE.CapsuleGeometry(0.22, 0.7, 3, 6).rotateX(Math.PI / 2), bombMat = new THREE.MeshPhongMaterial({ color: 0x2d3326 });
  W.shoot = shoot;
  W.addExternal = u => { W.units.push(u); return u; };   // a unit flown by another module (the dropship): it can be seen, shot at and gives sight
  W.fireBullet = (p, v) => shoot('b', 1, p.x, p.y, p.z, v.x, v.y, v.z, 1.8);
  W.fireRocket = (p, v) => { sfx.rocket?.(); return shoot('rocket', 1, p.x, p.y, p.z, v.x, v.y, v.z, 3); };
  W.dropBomb = (p, v) => { sfx.bombDrop?.(); return shoot('bomb', 1, p.x, p.y, p.z, v.x, v.y, v.z, 12); };
  W.fireJetGun = (p, v) => shoot('jb', 1, p.x, p.y, p.z, v.x, v.y, v.z, 1.3);
  W.fireMissile = (p, v, tgt) => { sfx.missile?.(); return shoot('aam', 1, p.x, p.y, p.z, v.x, v.y, v.z, 7, { tgt, age: 0, spd: v.length() }); };
  const _pp = new THREE.Vector3(), _gd = new THREE.Vector3(), _js = new THREE.Vector3();
  // FOUNDATION: squared distance from p to the segment a-b (a round's path this frame), so a fast round can't skip a
  // small target (a soldier) between frames; the closest point is left in _cpt (where it hit, for body-part damage)
  const _cpt = new THREE.Vector3();
  function segD2(a, b, p) { const sx = b.x - a.x, sy = b.y - a.y, sz = b.z - a.z, L2 = sx * sx + sy * sy + sz * sz || 1e-9; const k = clamp(((p.x - a.x) * sx + (p.y - a.y) * sy + (p.z - a.z) * sz) / L2, 0, 1); _cpt.set(a.x + sx * k, a.y + sy * k, a.z + sz * k); return _cpt.distanceToSquared(p); }
  // missile homing: lead onto the target with a turn-rate limit (~30 g), a 2.2 s motor, proximity fuse (gameproj.js)
  function guide(b, dt) { homeAAM(b, dt); }
  // everything that can be hit, of the side opposite to `side`
  function* targets(side) {
    for (const u of W.units) if (u.side !== side && !u.dead && !u.dying && !u.gone && !u.noHit) yield u;   // (GROUND WAR: squad proxies are hit man by man, through GW)
    for (const I of W.islands) for (const s of I.structs) if (!s.dead && s.side !== side && s.side !== 0) yield s;
  }
  function hitTest(x, y, z, side, rad = 0) {
    for (const t of targets(side)) {
      if (t.dims) {   // ships: oriented box, guns first
        if (Math.abs(x - t.p.x) > 70 || Math.abs(z - t.p.z) > 70 || t.sinking !== undefined) continue;
        for (const g of t.guns) if (!g.dead) { g.mesh.getWorldPosition(_w); if (_w.distanceToSquared(_v.set(x, y, z)) < (2.4 + rad) ** 2) return g; }
        const [lx, lz] = toLocal(t, x, z), D = t.dims;
        if (Math.abs(lx) < D.W / 2 + rad && Math.abs(lz) < D.L / 2 + rad && y < D.DECK + 3 + t.p.y + rad && y > -3) return t;
        if (t.type === 'carrier' && Math.abs(lx - D.TOWER_X) < 3 + rad && Math.abs(lz - D.TOWER_Z) < 9 + rad && y < D.DECK + D.TOWER_H + rad) return t;
        continue;
      }
      if (t.p) { if (t.p.distanceToSquared(_v.set(x, y, z)) < (t.r + rad) ** 2) return t; continue; }
      const dx = x - t.x, dz = z - t.z; if (dx * dx + dz * dz > (t.r + rad) ** 2) continue;
      if (y > t.y - 1 && y < t.y + t.h * 2 + rad) return t;
    }
    return null;
  }
  function damage(t, dmg, side) {
    if (t.player) { if (side === 2) ctx.hurtPlayer(Math.min(0.6, 0.06 * dmg), dmg >= 9 ? 'MISSILE' : 'HIT'); return; }   // AIR: the player as an air target
    if (t.ship) {   // a ship's gun mount
      t.hp -= dmg; if (t.hp <= 0 && !t.dead) { t.dead = true; t.mesh.getWorldPosition(_w); fx.explode(_w.x, _w.y + 1, _w.z, 1.4, { debris: 5 }); t.mesh.visible = false; t.rebuild = 45; boomAt(_w.x, _w.y, _w.z, 0.5); if (t.ship.side === 2) { ctx.addScore(300); feed(`${t.ship.type === 'carrier' ? 'KRAKEN' : t.ship.type === 'freighter' ? 'CONTAINER SHIP' : 'LEVIATHAN'} GUN DESTROYED`, 'good'); } }
      t.ship.hp -= dmg * 0.25; checkShip(t.ship); return;
    }
    if (t.dims) { t.hp -= dmg; t.lastHit = W.time; checkShip(t); return; }
    if (t.p) {   // aircraft
      t.hp -= dmg; if (t.hp <= 0 && !t.dying) { t.dying = true; t.v.y = 3; fx.explode(t.p.x, t.p.y, t.p.z, 0.9, { debris: 3, color: t.side === 1 ? 0x2a3f55 : 0x992222 }); boomAt(t.p.x, t.p.y, t.p.z, 0.5); if (t.side === 2) ctx.addScore(t.type === 'transport' ? 400 : 150); if (t.type === 'transport') { feed('ENEMY TRANSPORT SHOT DOWN', 'good'); if (t.target) t.target.lostT = W.time; } if (t.type === 'drone') feed('SEA KNIGHT DOWN', 'bad'); }
      return;
    }
    t.hp -= dmg; t.I.lastHit = W.time; t.mesh.userData.onHp?.(Math.max(0, t.hp / t.max));   // WORLD: damaged state
    if (t.hp <= 0) killStruct(t);
  }
  function checkShip(u) {
    if (u.hp > 0 || u.sinking !== undefined) return;
    u.sinking = 0; u.path = [];
    for (let i = 0; i < 6; i++) setTimeout(() => { toWorld(u, rnd(-10, 10), u.dims.DECK, rnd(-u.dims.L / 2, u.dims.L / 2)); fx.explode(_v.x, _v.y, _v.z, rnd(2.5, 4), { debris: 10, color: 0x4a4440, oil: true }); boomAt(_v.x, _v.y, _v.z, 1.2); }, i * 450);
    for (let i = 0; i < 4; i++) { const e = fx.burn(0, 0, 0, 60, 2.5, u.p); e.ox = rnd(-8, 8); e.oy = u.dims.DECK; e.oz = rnd(-40, 40); }
    for (let i = 0; i < 6; i++) fx.water.add({ x: u.p.x + rnd(-30, 30), y: 0.12, z: u.p.z + rnd(-30, 30), size: rnd(14, 26), grow: 0.25, a: 0.85, life: 300, tile: 3, fadeIn: 3 });
    if (u.type === 'battleship') { W.battleship = null; ctx.addScore(5000); feed('LEVIATHAN SUNK', 'good'); }
    else if (u.type === 'freighter') { const salvage = Math.round(u.cargo * 0.5); W.P.mat += salvage; ctx.addScore(800); feed(`ENEMY CONTAINER SHIP SUNK  -  ${salvage} MATERIEL SALVAGED`, 'good'); }
    else if (u.side === 2) { ctx.addScore(10000); feed('THE KRAKEN IS SINKING', 'good'); end('win', 'ENEMY CARRIER SUNK'); }
    else { feed('ALBATROSS IS SINKING', 'bad'); end('lose', 'OUR CARRIER WAS SUNK'); }
  }
  // explosion damage to everything of the other side in radius r (and to the player helicopter for enemy blasts)
  function blast(x, y, z, r, dmg, side, noGround) {   // (noGround: the ground war's own blast, already applied to its units)
    for (const t of targets(side)) {
      let d;
      if (t.ship || t.dims) { const tp = t.ship ? t.mesh.getWorldPosition(_w) : t.p; d = Math.hypot(x - tp.x, z - tp.z); if (t.dims) { const [lx, lz] = toLocal(t, x, z); d = Math.hypot(Math.max(0, Math.abs(lx) - t.dims.W / 2), Math.max(0, Math.abs(lz) - t.dims.L / 2), Math.max(0, y - t.dims.DECK - 3)); } }
      else if (t.p) d = t.p.distanceTo(_v.set(x, y, z)) - t.r;
      else d = Math.max(0, Math.hypot(x - t.x, z - t.z) - t.r * 0.7);
      if (d < r) damage(t, dmg * (1 - 0.6 * d / r), side);
    }
    const pl = ctx.player();
    if (side !== 1 && pl.alive && !pl.inCave) { const d = pl.pos.distanceTo(_v.set(x, y, z)); if (d < r) ctx.hurtPlayer(0.12 + 0.3 * dmg / 20 * (1 - d / r), 'BLAST', null, null, 'blast'); }   // ngc/foot2: kind for the Marine's wounds
    if (!noGround) GW.blast(x, y, z, r, dmg, side);   // NGC-1980 GROUND WAR hook: the troops and vehicles on the ground in reach
  }
  W.blast = blast;
  function updateProj(dt, pl) {
    for (let i = W.proj.length - 1; i >= 0; i--) {
      const b = W.proj[i]; b.life -= dt;
      const grav = b.kind === 'bomb' || b.kind === 'shell' || b.kind === 'jb' ? 9 : b.kind === 'rocket' ? 1.2 : b.kind === 'flak' || b.kind === 'aam' ? 0 : 2.2;
      if (b.kind === 'aam') { const tg = b.tgt; if (decoyCheck(b, tg)) fx.add.spawn(tg.p.x, tg.p.y - 1, tg.p.z, rnd(-4, 4), -3, rnd(-4, 4), 0.25, 1.6, 0.6, 1, .85, .5, 1); guide(b, dt); }   // AIR: decoys (flares)
      _pp.copy(b.p); b.v.y -= grav * dt; b.p.addScaledVector(b.v, dt); b.p.y += 0.5 * grav * dt * dt;   // exact under gravity at any frame rate (bombs land where the CCIP says)
      if (b.kind === 'aam' && b.tgt && !b.tgt.dead && !b.tgt.dying) {   // proximity fuse on the closest approach along this step (fast missile, big frames)
        const t = b.tgt, sx = b.p.x - _pp.x, sy = b.p.y - _pp.y, sz = b.p.z - _pp.z, L2 = sx * sx + sy * sy + sz * sz || 1;
        const k = clamp(((t.p.x - _pp.x) * sx + (t.p.y - _pp.y) * sy + (t.p.z - _pp.z) * sz) / L2, 0, 1);
        if (Math.hypot(_pp.x + sx * k - t.p.x, _pp.y + sy * k - t.p.y, _pp.z + sz * k - t.p.z) < 7) { b.boom = true; b.p.set(_pp.x + sx * k, _pp.y + sy * k, _pp.z + sz * k); damage(t, 9, b.side); }
      }
      const { x, y, z } = b.p;
      // visuals: tracers are a few short-lived sparks along the path
      if (b.kind === 'jb') fx.add.spawn(x, y, z, 0, 0, 0, 0.04, 0.8, 0.4, 1, .9, .5, 1);
      else if (b.kind === 'aam') { fx.add.spawn(x, y, z, 0, 0, 0, 0.06, 1.4, 0.6, 1, .85, .6, 1); fx.mix.spawn(x, y, z, rnd(-.3, .3), rnd(-.2, .3), rnd(-.3, .3), rnd(2, 3.5), 0.6, 2.8, .85, .85, .85, 0.6, -0.1, 1, 0.4); }
      if (b.kind === 'b' || b.kind === 'ciws') { const own = b.side === 1, k = b.col; if (k) fx.add.spawn(x, y, z, 0, 0, 0, 0.06, 1.3, 0.8, k[0], k[1], k[2], 1); else fx.add.spawn(x, y, z, 0, 0, 0, 0.05, own ? 0.9 : 1.1, 0.6, own ? .5 : 1, own ? 1 : .55, own ? 1 : .2, 1); }   // NGC-1980 hook: b.col = round colour (WASP pulses)
      else if (b.kind === 'rocket') { fx.add.spawn(x, y, z, 0, 0, 0, 0.08, 1.2, 0.5, 1, .7, .3, 1); fx.mix.spawn(x, y, z, rnd(-.4, .4), rnd(-.2, .4), rnd(-.4, .4), rnd(1.4, 2.4), 0.5, 2.4, .75, .75, .75, 0.55, -0.2, 1.2, 0.5); }
      else if (b.kind === 'shell') fx.add.spawn(x, y, z, 0, 0, 0, 0.06, 1.4, 0.8, 1, .8, .5, 1);
      else if (b.kind === 'flak') fx.add.spawn(x, y, z, 0, 0, 0, 0.04, 0.5, 0.3, 1, .9, .5, 1);
      if (b.mesh) { b.mesh.position.copy(b.p); b.mesh.lookAt(_w.copy(b.p).add(b.v)); }
      const gy = Math.max(terrainH(x, z), 0), dy = W.deckY(x, z, b.side), floor = Math.max(gy, dy);   // our own decks don't stop our rounds
      let done = b.life <= 0, hit = null;
      if (b.kind === 'flak') {
        if (b.life <= 0) {   // burst
          fx.flak(x, y, z); if (hear(x, y, z, 300) > 0) sfx.flak?.();
          for (const t of targets(b.side)) if (t.p && !t.dims && t.p.distanceTo(b.p) < 8) damage(t, 1.2, b.side);
          if (b.side === 2 && pl.alive && !pl.inCave && pl.pos.distanceTo(b.p) < 7 + (pl.hitR || 2.6) - 2.6) ctx.hurtPlayer(0.13, 'FLAK', null, null, 'flak');
          const sc = W.carrier; if (b.side === 2 && sc && sc.sky && sc.sky.up && sc.p.y > 8) { const [lx, lz] = toLocal(sc, x, z); if (Math.abs(lx) < 34 && Math.abs(lz) < 66 && Math.abs(y - (sc.p.y + 4)) < 10) damage(sc, 2, 2); }
        }
      } else if (!done) {
        if (GW.segHit(b, _pp)) done = true;   // NGC-1980 GROUND WAR hook: this frame's path against STRIDERs, RW-7s, MBTs (our rounds) or Marines (theirs)
        else if (b.kind === 'jb') {   // ~500 m/s: walk the segment travelled this frame so nothing is tunnelled through
          const n = Math.max(1, Math.ceil(_pp.distanceTo(b.p) / 2.5));
          for (let k = 1; k <= n && !hit && !done; k++) { _js.lerpVectors(_pp, b.p, k / n); if (_js.y < Math.max(terrainH(_js.x, _js.z), 0, W.deckY(_js.x, _js.z, b.side))) { done = true; b.p.copy(_js); } else hit = hitTest(_js.x, _js.y, _js.z, b.side, 0.4);
            if (!hit && b.side === 2 && pl.alive && !pl.inCave && _js.distanceToSquared(pl.pos) < (pl.hitR || 2.6) ** 2) { ctx.hurtPlayer(0.15, 'CANNON', _js, b.v, 'jb'); done = true; } }   // AIR: SHRIKE cannon vs the player
          if (hit) { done = true; b.p.copy(_js); }
        } else if (b.boom) { done = true; }
        else if (y < floor) done = true;
        else {
          hit = hitTest(x, y, z, b.side, b.kind === 'rocket' ? 0.5 : b.kind === 'aam' ? 1.5 : 0);
          if (hit) done = true;
          else if (b.side === 2 && b.kind !== 'shell' && pl.alive && !pl.inCave && segD2(_pp, b.p, pl.pos) < (pl.hitR || 2.6) ** 2) { ctx.hurtPlayer(0.2, 'HIT', _cpt, b.v, b.kind); done = true; }   // FOUNDATION: swept (small targets), hit point for body parts
        }
        if (done) {
          const wet = y < floor + 0.5 && isWater(x, z) && dy < 0;
          const ship = dy > gy + 0.5 && y < dy + 1 ? W.shipAt(x, z) : null;   // landed on a deck: a direct hit
          if (ship && ship.side !== b.side && ship.sinking === undefined) damage(ship, { rocket: 5, bomb: 24, shell: 18 }[b.kind] || 0, b.side);
          if (b.kind === 'b' || b.kind === 'ciws' || b.kind === 'jb') { const q = b.p; if (hit) { damage(hit, b.kind === 'ciws' ? 0.5 : b.kind === 'jb' ? 1.4 : 1, b.side); fx.impact(q.x, q.y, q.z, 'metal'); } else if (!b.gwHit) fx.impact(q.x, Math.max(q.y, floor), q.z, wet ? 'water' : 'ground'); }
          else if (b.kind === 'aam') { fx.explode(x, Math.max(y, floor), z, 1.3, { debris: 3 }); boomAt(x, y, z, 0.6); if (hit && !b.boom) damage(hit, 6, b.side); blast(x, y, z, 7, 3, b.side); }
          else if (b.kind === 'rocket') { fx.explode(x, Math.max(y, floor), z, 1.1, { debris: 2 }); boomAt(x, y, z, 0.45); if (hit) damage(hit, 4, b.side); blast(x, y, z, 6, 4, b.side); }
          else if (b.kind === 'bomb') { fx.explode(x, Math.max(y, floor), z, 2.8, { debris: 8, crater: 3.6, fire: wet ? 0 : 20 }); boomAt(x, y, z, 1.3); blast(x, Math.max(y, floor), z, 12, 20, b.side); }
          else if (b.kind === 'shell') { fx.explode(x, Math.max(y, floor), z, 2.4, { debris: 5, crater: 3 }); boomAt(x, y, z, 1); blast(x, Math.max(y, floor), z, 10, 16, b.side); }
        }
      }
      if (done) { if (b.mesh) scene.remove(b.mesh); W.proj[i] = W.proj[W.proj.length - 1]; W.proj.pop(); }
    }
  }
  // AA guns (on islands and ships): lead the target, fire flak bursts; close in, a stream of tracer
  function enemiesOf(side, pl) {
    const list = [];
    for (const u of W.units) if (u.side !== side && !u.dead && !u.dying && u.p && !u.dims && !u.ground) list.push(u);   // (GROUND WAR: AA guns don't engage squads on the ground)
    if (side === 2 && pl.alive && !pl.inCave) list.push({ p: pl.pos, v: pl.vel, player: true, vis: pl.detect ?? 1 });
    const sc = W.carrier; if (side === 2 && sc && sc.sky && sc.sky.up && sc.p.y > 8 && sc.sinking === undefined) list.push({ p: _skyAim.set(sc.p.x, sc.p.y + 4, sc.p.z), v: sc.v });
    return list;
  }
  function gunFire(g, gx, gy, gz, side, dt, foes, range) {
    g.cd -= dt; if (g.cd > 0) return;
    let best = null, bd = range;
    for (const f of foes) { const d = Math.hypot(f.p.x - gx, f.p.y - gy, f.p.z - gz); if (d < bd && d < range * (f.vis ?? 1) && f.p.y > gy - 4) { bd = d; best = f; } }
    if (!best) { g.cd = 0.5; return; }
    const t = bd / 90;
    const ax = best.p.x + best.v.x * t - gx, ay = best.p.y + best.v.y * t - gy, az = best.p.z + best.v.z * t - gz, al = Math.hypot(ax, ay, az) || 1;
    g.aimYaw = Math.atan2(-ax, -az); g.aimPitch = Math.asin(clamp(ay / al, -1, 1));
    if (bd < 45) {   // tracer stream
      g.cd = side === 1 ? 0.12 : 0.2;
      const sp = 140, e = side === 1 ? 0.02 : 0.05;
      shoot('ciws', side, gx, gy, gz, (ax / al + rnd(-e, e)) * sp, (ay / al + rnd(-e, e)) * sp, (az / al + rnd(-e, e)) * sp, 0.6);
      g.mesh?.userData?.fireBeam?.(bd);   // NAVAL: a laser mount shows its beam
    } else {
      g.cd = side === 1 ? 0.7 : 1.1 + rnd(0.6) - Math.min(0.5, W.time / 900);
      const err = (best.player ? 7 : 5) * (bd / 100);
      const bx = gx + ax + rnd(-err, err), by = gy + ay + rnd(-err, err), bz = gz + az + rnd(-err, err), d2 = Math.hypot(bx - gx, by - gy, bz - gz);
      shoot('flak', side, gx, gy, gz, (bx - gx) / d2 * 90, (by - gy) / d2 * 90, (bz - gz) / d2 * 90, d2 / 90);
      fx.add.spawn(gx, gy, gz, 0, 0, 0, 0.08, 2.2, 1, 1, .8, .4, 1);
    }
  }
  function updateGuns(dt, pl, peace) {
    const foes = [null, enemiesOf(1, pl), enemiesOf(2, pl)];
    for (const I of W.islands) for (const s of I.structs) {
      if (s.kind !== 'aa' || s.dead || (peace && s.side === 2)) continue;
      if (s.building > 0) { s.building -= dt; s.mesh.scale.setScalar(clamp(1 - s.building / 12, 0.05, 1)); if (s.building <= 0) { s.mesh.scale.setScalar(1); if (s.side === 1) feed(`${I.name}: AA GUN READY`, 'good'); } continue; }
      if (s.def) { defence.update(s, dt, foes[s.side]); continue; }   // DEFENCE hook
      gunFire(s, s.x, s.y + 2.4, s.z, s.side, dt, foes[s.side], 150);
      const ud = s.mesh.userData; if (s.aimYaw !== undefined) { ud.yaw.rotation.y += angDiff(ud.yaw.rotation.y, s.aimYaw) * Math.min(1, 5 * dt); ud.pitch.rotation.x += (s.aimPitch - ud.pitch.rotation.x) * Math.min(1, 5 * dt); }
    }
    for (const u of W.units) if (u.dims && u.sinking === undefined && !(peace && u.side === 2)) for (const g of u.guns) {
      if (g.dead) { g.rebuild -= dt; if (g.rebuild <= 0 && store(u.side).mat >= 10) { store(u.side).mat -= 10; g.dead = false; g.hp = g.max; g.mesh.visible = true; } continue; }
      if (g.def) { defence.update(g, dt, foes[u.side]); continue; }   // DEFENCE hook
      g.mesh.getWorldPosition(_w); gunFire(g, _w.x, _w.y + 2, _w.z, u.side, dt, foes[u.side], g.range);
      const ud = g.mesh.userData; if (g.aimYaw !== undefined) { ud.yaw.rotation.y += angDiff(ud.yaw.rotation.y, g.aimYaw - u.yaw) * Math.min(1, 5 * dt); ud.pitch.rotation.x += (g.aimPitch - ud.pitch.rotation.x) * Math.min(1, 5 * dt); }
    }
  }

  // ------------------------------------------------------------------------------------- capture, economy
  function updateCapture(dt, pl) {
    for (const I of W.islands) {
      const p = I.pad; let side = 0, rate = 0, who = '';
      if (pl.alive && !pl.inCave && pl.landed && Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < p.r + 1 && I.owner !== 1 && !I.cave) { side = 1; rate = 1 / (pl.capTime || CAP_TIME.heli); who = pl.kind === 'foot' ? 'infantry' : 'heli'; }   // FOUNDATION: any craft on the pad (pl.capTime)
      for (const u of W.units) if (u.landed && u.target === I && !u.dead && !u.dying && u.side !== I.owner) {
        if (I.cave && u.side === 1) continue;
        if (I.kind === 'hq' && u.side === 2) continue;   // our HQ can't be taken by transports
        if (!side || side === u.side) { side = u.side; rate += 1 / (u.capTime || CAP_TIME[u.type]); who = who || u.type; }   // squads carry their own capture time
      }
      const guarded = W.aliveAA(I) > 0;
      if (!side || guarded) { if (I.cap && (!side || guarded)) { I.cap.t = Math.max(0, I.cap.t - dt * 0.2); if (I.cap.t <= 0) I.cap = null; } if (side && guarded) I.capBlocked = W.time; continue; }
      if (!I.cap || I.cap.side !== side) { I.cap = { side, t: 0 }; if (side === 2) feed(`ENEMY LANDING ON ${I.name}`, 'bad'); }
      I.cap.t += rate * dt;
      if (I.cap.t >= 1) {
        W.setOwner(I, side, who === 'heli' ? 'BY HELICOPTER' : '');
        for (const u of W.units) if (u.target === I && u.landed) u.dead = true;   // the lander stays as the garrison
      }
    }
  }
  function updateEconomy(dt) {
    W.econT += dt; if (W.econT < 1) return; const k = W.econT; W.econT = 0;
    for (const I of W.islands) {
      if (!I.owner) continue;
      const S = store(I.owner), pk = PROD_KIND[I.kind], prodOk = !pk || I.structs.some(s => s.kind === pk && !s.dead), hqOk = I.structs.some(s => s.kind === 'hq' && !s.dead);
      const P = PROD[I.kind];
      if (prodOk && hqOk) {
        if (I.owner === 2 && I.kind !== 'hq') I.stock = (I.stock || 0) + ((P.mat || 0) + (P.fuel || 0) * 0.5) * k;   // enemy outposts ship their output by freighter
        else { if (P.fuel) S.fuel = Math.min(S.fuelMax ?? 1e9, S.fuel + P.fuel * k); if (P.mat) S.mat += P.mat * k; }
      }
      if (I.owner === 2 && I.kind === 'factory' && prodOk) W.E.bship += 0.08 * k;
      // rebuild flattened buildings when the owner can pay for it and nobody has hit the island for a while
      for (const s of I.structs) if (s.dead && s.kind !== 'aa' && s.side === I.owner) {
        s.rebuild -= k;
        if (s.rebuild <= 0 && W.time - I.lastHit > 30 && S.mat >= 20) { S.mat -= 20; restoreStruct(s); if (I.owner === 1) feed(`${I.name}: ${s.kind.toUpperCase()} REBUILT`, 'good'); }
      }
    }
    if (W.islands.find(I => I.name === 'IRONHOLD').yard && !W.islands.find(I => I.name === 'IRONHOLD').yard.dead && W.islands.find(I => I.name === 'IRONHOLD').owner === 2) W.E.bship += 0.06 * k;
    if (W.battleship) W.E.bship = Math.min(W.E.bship, 99);
    // carriers patch themselves up with materiel when nobody is shooting at them
    for (const c of [W.carrier, W.enemyCarrier]) if (c && c.sinking === undefined && c.hp < c.hpMax && W.time - (c.lastHit ?? -99) > 15) { const S = store(c.side), fix = Math.min(c.hpMax - c.hp, 3 * k, S.mat * 4); c.hp += fix; S.mat -= fix / 4; }
  }

  // ------------------------------------------------------------------------------------- the enemy commander
  function pickExpansion(fromX, fromZ) {
    const c = W.enemyCarrier && W.enemyCarrier.sinking === undefined ? W.enemyCarrier.p : null;
    const ox = fromX ?? (c ? c.x : 420), oz = fromZ ?? (c ? c.z : -400);
    let best = null, bs = 1e9;
    for (const I of W.islands) {
      if (I.owner === 2 || I.kind === 'hq') continue;
      if (I.owner === 1 && W.aliveAA(I) > 0) continue;   // guarded: needs a raid first
      if (W.units.some(u => (u.type === 'transport' || (u.type === 'squad' && u.side === 2)) && u.target === I && !u.dead)) continue;   // a landing party there counts too
      if (W.time - (I.lostT ?? -1e9) < 100) continue;   // lost a transport there recently: wait for a raid to clear the way
      let danger = 0;   // our guns covering the pad
      for (const J of W.islands) for (const g of J.structs) if (g.kind === 'aa' && !g.dead && g.side === 1 && Math.hypot(g.x - I.pad.x, g.z - I.pad.z) < 160) danger++;
      if (W.carrier && W.carrier.sinking === undefined && Math.hypot(W.carrier.p.x - I.pad.x, W.carrier.p.z - I.pad.z) < 170) danger += 3;
      const sc = Math.hypot(I.x - ox, I.z - oz) * (I.owner === 1 ? 0.8 : 1) * (I.kind === 'factory' ? 0.85 : 1) * (1 + danger);
      if (sc < bs) { bs = sc; best = I; }
    }
    return best;
  }
  function think(pl) {
    const E = W.E, ec = W.enemyCarrier && W.enemyCarrier.sinking === undefined ? W.enemyCarrier : null;
    const air = W.units.filter(u => u.side === 2 && u.p && !u.dims && !u.dead && !u.dying);
    const guns = air.filter(u => u.type === 'gunship'), trans = air.filter(u => u.type === 'transport');
    const cap = Math.min(12, 3 + Math.floor(W.time / 110)), mine = W.islands.filter(I => I.owner === 2);
    // 1. defend: the player is poking at one of our islands or the carrier
    if (pl.alive && !pl.inCave) {
      const near = [...mine.map(I => [I.x, I.z]), ...(ec ? [[ec.p.x, ec.p.z]] : [])].some(([x, z]) => Math.hypot(pl.pos.x - x, pl.pos.z - z) < 260 * (pl.detect ?? 1));
      const hunting = guns.filter(g => g.target === 'player').length;
      if (near && hunting < 2 + Math.floor(W.time / 300) && guns.length < cap && E.mat >= 12) { E.mat -= 12; W.spawnGunship(2, nearestLaunch(pl.pos.x, pl.pos.z)).target = 'player'; }
    }
    // 2. expand: send transports at neutral (or undefended player) islands
    W.transT -= 2;
    if (trans.length < 2 && E.mat >= 25 && W.transT <= 0) { const I = pickExpansion(); if (I) { W.transT = Math.max(18, 40 - W.time / 30); E.mat -= 25; const [x, y, z] = launchPoint(2); makeAir('transport', 2, x, y, z, { target: I }); } }
    // 3. fortify: guns on islands that have few
    for (const I of mine) if (E.mat >= 30 && W.aliveAA(I) + I.structs.filter(s => s.kind === 'aa' && s.building > 0).length < (I.kind === 'factory' || I.kind === 'hq' ? 3 : 2)) { const s = buildAA(I, 2); if (s) { E.mat -= 30; s.building = 14; } break; }
    // 4. raid: every so often, a strike group at the player's weakest guarded island or the carrier
    W.raidT -= 2;
    if (W.raidT <= 0 && E.mat >= 36 && guns.length < cap) {
      W.raidT = Math.max(50, 110 - W.time / 20);
      const ours = W.islands.filter(I => I.owner === 1 && I.kind !== 'hq');
      let tgt = null;
      if (ours.length && Math.random() < 0.65) { const I = ours.sort((a, b) => W.aliveAA(a) - W.aliveAA(b))[0]; tgt = I.structs.find(s => s.kind === 'aa' && !s.dead) || I.structs.find(s => !s.dead); }
      else if (W.carrier && W.carrier.sinking === undefined) tgt = W.carrier;
      if (tgt) { const n = 2 + Math.min(3, Math.floor(W.time / 240)); E.mat -= 12 * n; for (let i = 0; i < n; i++) W.spawnGunship(2, null, tgt); feed(tgt === W.carrier ? 'RADAR: ENEMY STRIKE INBOUND ON THE ALBATROSS' : `RADAR: ENEMY STRIKE HEADING FOR ${tgt.I.name}`, 'bad'); }
    }
    // 5. a couple of guards over the carrier
    if (ec && guns.filter(g => !g.target && Math.hypot(g.home[0] - ec.p.x, g.home[1] - ec.p.z) < 200).length < 2 && E.mat >= 12 && guns.length < cap) { E.mat -= 12; W.spawnGunship(2); }
    // 6. supply: a freighter takes an island's stockpile to the KRAKEN (or IRONHOLD)
    W.freightT -= 2;
    if (W.freightT <= 0) {
      W.freightT = 16;
      const I = mine.filter(I => (I.stock || 0) >= 18 && !W.units.some(u => u.type === 'freighter' && u.from === I)).sort((a, b) => b.stock - a.stock)[0];
      if (I) {
        const [x, z] = nav.nearestWater(I.x, I.z), f = makeShip('freighter', 2, x, z, rnd(6.283));
        f.cargo = I.stock; f.from = I; I.stock = 0; f.repath = 0;
      }
    }
    // 7. the battleship
    if (E.bship >= 100 && !W.battleship) {
      E.bship = 0; const I = W.islands.find(I => I.name === 'IRONHOLD'), y = I.yard || I;
      const [wx, wz] = nav.nearestWater(y.x + (0 - y.x) * 0.2, y.z + (0 - y.z) * 0.2);
      W.battleship = makeShip('battleship', 2, wx, wz, Math.atan2(-(0 - wx), -(0 - wz)));
      feed('THE LEVIATHAN IS AT SEA  -  IT IS HUNTING THE ALBATROSS', 'bad'); sfx.alarm?.();
    }
    // the enemy carrier's course
    if (ec) {
      ec.plan = (ec.plan || 0) - 2;
      if (ec.plan <= 0 || !ec.path.length) {
        ec.plan = 25;
        let gx, gz;
        if (ec.hp < ec.hpMax * 0.35) { gx = 330; gz = -300; }
        else if (W.battleship || (E.mat > 160 && guns.length > 6)) { const c = W.carrier || { p: { x: 0, z: 0 } }; const a = Math.atan2(ec.p.z - c.p.z, ec.p.x - c.p.x); gx = c.p.x + Math.cos(a) * 330; gz = c.p.z + Math.sin(a) * 330; }
        else { const I = pickExpansion(ec.p.x, ec.p.z) || W.islands.find(I => I.name === 'CITADEL'); const a = Math.atan2(ec.p.z - I.z, ec.p.x - I.x); gx = I.x + Math.cos(a) * (I.r + 90); gz = I.z + Math.sin(a) * (I.r + 90); }
        const [wx, wz] = nav.wet(gx, gz) ? [gx, gz] : nav.nearestWater(gx, gz); ec.path = nav.path(ec.p.x, ec.p.z, wx, wz);
      }
    }
    if (W.battleship && W.battleship.sinking === undefined) {
      const b = W.battleship; b.plan = (b.plan || 0) - 2;
      if (W.carrier && (b.plan <= 0 || !b.path.length)) { b.plan = 15; const c = W.carrier.p, a = Math.atan2(b.p.z - c.z, b.p.x - c.x), gx = c.x + Math.cos(a) * 170, gz = c.z + Math.sin(a) * 170; const [wx, wz] = nav.wet(gx, gz) ? [gx, gz] : nav.nearestWater(gx, gz); b.path = nav.path(b.p.x, b.p.z, wx, wz); }
    }
  }
  function nearestLaunch(x, z) {
    let best = launchPoint(2), bd = Math.hypot(best[0] - x, best[2] - z);
    for (const I of W.islands) if (I.owner === 2 && I.structs.some(s => s.kind === 'hq' && !s.dead)) { const d = Math.hypot(I.pad.x - x, I.pad.z - z); if (d < bd) { bd = d; best = [I.pad.x, I.pad.h + 4, I.pad.z]; } }
    return best;
  }
  function freightDest() {
    const ec = W.enemyCarrier; if (ec && ec.sinking === undefined) return [ec.p.x, ec.p.z];
    const I = W.islands.find(I => I.name === 'IRONHOLD'); return nav.nearestWater(I.x - 150, I.z + 150);
  }
  function updateFreighters(dt) {
    for (const u of W.units) {
      if (u.type !== 'freighter' || u.sinking !== undefined || u.gone) continue;
      const [dx, dz] = freightDest(), d = Math.hypot(dx - u.p.x, dz - u.p.z);
      if (d < 75) { W.E.mat += u.cargo; scene.remove(u.mesh); u.gone = true; continue; }   // delivered
      u.repath -= dt; if (u.repath <= 0 || !u.path.length) { u.repath = 12; u.path = nav.path(u.p.x, u.p.z, dx, dz); }
    }
  }
  function updateBattleship(dt) {
    const b = W.battleship; if (!b || b.sinking !== undefined || !b.turrets) return;
    for (const t of b.turrets) {
      t.cd -= dt;
      let tgt = W.carrier && W.carrier.sinking === undefined && W.carrier.p.distanceTo(b.p) < 320 ? W.carrier.p : null;
      if (!tgt) { for (const I of W.islands) if (I.owner === 1) for (const s of I.structs) if (!s.dead && Math.hypot(s.x - b.p.x, s.z - b.p.z) < 260) { tgt = _w.set(s.x, s.y, s.z); break; } }
      if (!tgt) continue;
      toWorld(b, 0, BSHIP.DECK + 2, t.mesh.position.z);
      const yaw = Math.atan2(-(tgt.x - _v.x), -(tgt.z - _v.z)) - b.yaw; t.mesh.rotation.y += angDiff(t.mesh.rotation.y, yaw) * Math.min(1, 2 * dt);
      if (t.cd <= 0) {
        t.cd = 6 + rnd(3);
        const dx = tgt.x - _v.x + rnd(-14, 14), dz = tgt.z - _v.z + rnd(-14, 14), d = Math.hypot(dx, dz), T = 2 + d / 70;   // flight time: a high arc that clears the hills between
        const vy0 = (tgt.y + 6 - _v.y) / T + 0.5 * 9 * T;
        shoot('shell', 2, _v.x, _v.y, _v.z, dx / T, vy0, dz / T, T + 2);
        // NAVAL: the rails elevate to the shot and kick back; a cyan flare at the muzzle
        const ud = t.mesh.userData; if (ud.barrels) ud.barrels.rotation.x = Math.atan2(vy0, d / T); ud.fire?.();
        for (let i = 0; i < 8; i++) fx.add.spawn(_v.x + fwdX(b.yaw + t.mesh.rotation.y) * 13, _v.y + 1, _v.z + fwdZ(b.yaw + t.mesh.rotation.y) * 13, rnd(-4, 4), rnd(-1, 4), rnd(-4, 4), rnd(0.15, 0.35), 2, 0.5, .55, .95, 1, 1);
        fx.flash(_v.x + fwdX(b.yaw + t.mesh.rotation.y) * 8, _v.y + 1, _v.z + fwdZ(b.yaw + t.mesh.rotation.y) * 8, 2.5); fx.mix.spawn(_v.x, _v.y + 2, _v.z, 0, 3, 0, 3, 3, 9, .5, .5, .5, 0.5, -0.3, 1); boomAt(_v.x, _v.y, _v.z, 0.6);
      }
    }
  }

  // ------------------------------------------------------------------------------------- public
  function end(result, why) { if (!W.over) { W.over = { result, why }; ctx.onEnd(result, why); } }
  W.visionSources = pl => {
    const s = [];
    if (pl.alive) s.push({ x: pl.pos.x, z: pl.pos.z, r: pl.inCave ? 60 : pl.sight || SIGHT.heli });
    if (pl.alive && pl.sources) s.push(...pl.sources);
    for (const u of W.units) if (u.side === 1 && !u.dead && !u.gone) s.push({ x: u.p.x, z: u.p.z, r: u.dims ? SIGHT.carrier * (1 + clamp(u.p.y / 120, 0, 0.8)) : SIGHT.drone });
    for (const I of W.islands) if (I.owner === 1) s.push({ x: I.x, z: I.z, r: I.kind === 'radar' && I.structs.some(q => q.kind === 'radar' && !q.dead) ? SIGHT.radar : SIGHT.island + I.r * 0.4 });
    return s;
  };
  W.reset = () => {
    for (const u of W.units) scene.remove(u.mesh); W.units.length = 0; nfx.sweep(W.units); ROT.reset();
    for (const p of W.proj) if (p.mesh) scene.remove(p.mesh); W.proj.length = 0;
    defence.reset();   // DEFENCE hook
    GW.reset();   // NGC-1980 GROUND WAR hook
    islandGroup.clear(); fx.emitters.length = 0;
    for (const I of W.islands) { I.owner = I.owner0 ?? I.owner; I.lostT = -1e9; I.stock = 0; }
    buildIslands();
    W.E.fuel = 200; W.E.mat = 50; W.E.bship = 0; W.time = 0; W.over = null; W.raidT = 150; W.thinkT = 3; W.transT = 20; W.freightT = 30; W.battleship = null;
    W.carrier = makeShip('carrier', 1, ctx.carrierStart[0], ctx.carrierStart[1], ctx.carrierStart[2]);
    W.enemyCarrier = makeShip('carrier', 2, ctx.enemyStart[0], ctx.enemyStart[1], ctx.enemyStart[2]);
    for (const I of W.islands) ctx.onOwner(I, I.owner);
    W.air.reset();   // AIR
  };
  W.update = (dt, pl, peace) => {
    W.time += dt; W._pl = pl; W.peace = peace;
    for (const u of W.units) { if (u.ext) continue; if (u.dims) sailShip(u, dt); else updateAir(u, dt, pl); }
    {   // ships keep clear of each other (a gentle shove when two hulls would overlap)
      const sh = W.units.filter(u => u.dims && u.sinking === undefined && !(u.sky && u.p.y > 12));
      for (let i = 0; i < sh.length; i++) for (let j = i + 1; j < sh.length; j++) {
        const a = sh[i], b = sh[j], dx = b.p.x - a.p.x, dz = b.p.z - a.p.z, d = Math.hypot(dx, dz) || 1, min = (a.dims.L + b.dims.L) * 0.42;
        if (d < min) { const k = Math.min(8, (min - d)) * dt / d; a.p.x -= dx * k; a.p.z -= dz * k; b.p.x += dx * k; b.p.z += dz * k; }
      }
    }
    for (let i = W.units.length - 1; i >= 0; i--) if (W.units[i].dead || W.units[i].gone) { const u = W.units[i]; if (!u.gone) scene.remove(u.mesh); W.units.splice(i, 1); if (u.dims) nfx.remove(u); }
    ROT.tick(dt);   // NGC-1980 hook: garrisons and fallen troops after their units are gone
    updateProj(dt, pl);
    updateGuns(dt, pl, peace);
    defence.tick(dt);   // DEFENCE hook: missiles in flight, beams, the cockpit warning
    GW.update(dt, pl, peace);   // NGC-1980 GROUND WAR hook: landings, the island battles, squad proxies, landing craft, views, sound
    updateCapture(dt, pl);
    updateEconomy(dt);
    updateBattleship(dt); updateFreighters(dt);
    if (!peace) { W.thinkT -= dt; if (W.thinkT <= 0) { W.thinkT = 2; GW.think(pl); think(pl); W.air.think(pl); } }   // GROUND WAR: its ground plans first (armour is saved up for); AIR: + the enemy air arm's plans
    W.air.frame(dt, pl);   // AIR: launch queue, drone rails, engine sounds
    // buildings animate
    for (const I of W.islands) for (const s of I.structs) {
      s.mesh.userData.tick?.(dt, W.time);   // WORLD: faction structures animate themselves
      if (s.dead) continue; const ud = s.mesh.userData;
      if (ud.dish) ud.dish.rotation.y += dt * 1.2;
      if (ud.beam) ud.beam.rotation.z = Math.sin(W.time * 1.5 + s.x) * 0.25;
      if (ud.flag) ud.flag.rotation.y = Math.sin(W.time * 2 + s.z) * 0.3;
      if (ud.hull) ud.hull.scale.y = Math.max(0.01, W.E.bship / 100);
    }
  };
  W.setVisibility = fog => {   // enemy aircraft and ships only where we can see; buildings once explored
    GW.setVisibility(fog);   // NGC-1980 GROUND WAR hook: STRIDERs, RW-7s, MBTs and landing craft only where we can see
    for (const u of W.units) if (u.side === 2) { u.mesh.visible = fog.visibleAt(u.p.x, u.p.z); if (u.mesh.visible && u.type === 'freighter' && !u.spotted) { u.spotted = true; feed('RADAR: ENEMY CONTAINER SHIP SPOTTED  -  SINK IT TO CUT THEIR SUPPLY'); } }
    for (const I of W.islands) { const ex = fog.exploredAt(I.x, I.z) || fog.exploredAt(I.pad.x, I.pad.z); for (const s of I.structs) { s.mesh.visible = (!s.dead || !!s.mesh.userData.setState) && ex; if (s.rubble) s.rubble.visible = ex; } if (fog.visibleAt(I.pad.x, I.pad.z)) I.seen = I.owner; }
  };
  W.damage = damage; W.hitTest = hitTest; W.pickExpansion = pickExpansion;
  W.makeShip = makeShip;   // NAVAL: tests and the dev tools place ships with it
  W.air = createAirWar(W, ctx, { shoot, damage, blast, hear, boomAt, feed, CARRIER, COST_ESCORT: COST.escort });   // AIR (units/air/airwar.js)
  return W;
}
