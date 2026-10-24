// armorcraft.js - the M60A3 TTS and the M113A2 as playable crafts in the GAME (wave 2). A richer adapter than
// vehicle.js (FOUNDATION's createVehicleCraft): the tank sims (m60a3.js / m113.js on trackfm.js) are 6-DOF with a
// turret, crew stations, sights and component damage, so this module hosts them directly on the craft interface
// (craft.js): seats at the hatches, the interiors (tankinterior.js) with their eye points and head-out positions, the
// gunner's day and thermal sights as full-screen views (armorsight.js), driving / gunnery from the keyboard, mouse,
// gamepad and HOTAS (CTL), the island environment (armorworld.js: terrain, roads, bridges, decks, the sea, obstacles),
// rounds through war.js (armorgunnery.js), RUNAWAY fire into the sim's V.hit (component damage, crew wounds, fire,
// cook-off, wrecks), sound (armoraudio.js on the game's audio bus) and an AI driver hook (armordriver.js).
//
//   const m60C = crafts.register(createArmorCraft(ctx, 'm60'));   ctx: see below (main.js builds it once: armCtx)
//   m60C.spawnAt({ x, z, yaw, plat })    m60C.stow()    m60C.driver -> the AI driver (goTo / follow / stop)
//   m60C.renderView(renderer, scene, cam) -> true when it drew the frame itself (the TTS thermal picture)
//
// ctx = { scene, GR, crafts, war, fx, sfx, say, feed, keyDown, CTL, hwOn(), camZ(), crewHit(a, why, at), crewKilled(why),
//         bail(def) (force the player out: a bail-out), AW (createArmorWorld), SG (createSight), ground(x, z), isWater(x, z) }
//
// Seats (craft-local frame: x right, y up from the ground under the hull, -z forward; door = where you climb on):
//   M60A3: DRIVER (hatch in the glacis), GUNNER (right of the gun), COMMANDER (M19 cupola, right rear), LOADER (left)
//   M113A2: DRIVER (front left), COMMANDER / .50 (cupola), 11 TROOP seats (in by the rear ramp)
// From any seat W / S / A / D are orders to the driver (the crew drives; the player in the driver seat drives himself).
import * as THREE from 'three';
import { createM60A3 } from './m60a3.js';
import { createM113 } from './m113.js';
import { buildM60A3Mesh, TANK } from './tankmodel.js';
import { buildM113Mesh } from './m113model.js';
import { buildTankInterior, buildM113Interior, M113_EYES } from './tankinterior.js';
import { ArmorAudio } from './armoraudio.js';
import { ROUNDS } from './armorballistics.js';
import { createTrackDriver } from './armordriver.js';
import { createGunnery } from './armorgunnery.js';
import { buildStations } from './armorstations.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const D2R = Math.PI / 180;

// RUNAWAY fire as rounds for the armour model (GAME LEVEL: what war.js's hurtPlayer reports, mapped onto the game
// armour table - a cannon stream, a guided missile, a shell's blast, flak fragments)
const RW_ROUNDS = {
  gun: { id: 'RW23', name: 'RUNAWAY CANNON', short: 'CANNON', kind: 'KE', cal: 23, mv: 1000, drag: 3e-4, pen: 40 },
  missile: { id: 'RWATGM', name: 'RUNAWAY MISSILE', short: 'MISSILE', kind: 'HEAT', cal: 130, mv: 300, drag: 1e-4, pen: 420 },
  shell: { id: 'RWHE', name: 'HE SHELL', short: 'SHELL', kind: 'HEP', cal: 120, mv: 600, drag: 1e-4, pen: 55 },
  frag: { id: 'FRAG', name: 'FRAGMENTS', short: 'FRAG', kind: 'BALL', cal: 14, mv: 900, drag: 1e-3, pen: 14 },
};
function roundFor(amount, why) {
  const w = String(why || '').toUpperCase();
  if (w.includes('MISSILE') || amount >= 0.5) return RW_ROUNDS.missile;
  if (w.includes('FLAK')) return RW_ROUNDS.frag;
  if (w.includes('BLAST') || w.includes('SHELL')) return amount >= 0.25 ? RW_ROUNDS.shell : RW_ROUNDS.frag;
  return RW_ROUNDS.gun;
}

// ------------------------------------------------------------------------------------------------ per-type data
const TYPES = {
  m60: {
    label: 'M60A3 TTS', short: 'M60A3', hitR: 3.3, sight: 190, cyl: 12, L: 6.95, W: 3.63, H: 3.2, chase: 13, steerFloor: 0.35, steerKmh: 40,
    fwd: 'H', low: 'L', crew: ['driver', 'gunner', 'commander', 'loader'],
    seats: [
      { id: 'driver', label: 'DRIVER', role: 'driver', crew: 'driver', door: [-2.05, 1.2, -2.6], exit: [-2.75, 0, -2.6], hatch: 'driver' },
      { id: 'gunner', label: 'GUNNER', role: 'gunner', crew: 'gunner', door: [2.05, 1.25, -0.6], exit: [2.75, 0, -0.6], hatch: null },
      { id: 'commander', label: 'TANK COMMANDER', role: 'commander', crew: 'commander', door: [2.05, 1.25, 0.9], exit: [2.75, 0, 1.0], hatch: 'cupola' },
      { id: 'loader', label: 'LOADER', role: 'loader', crew: 'loader', door: [-2.05, 1.25, 0.3], exit: [-2.75, 0, 0.3], hatch: 'loader' },
    ],
  },
  m113: {
    label: 'M113A2', short: 'M113A2', hitR: 2.7, sight: 160, cyl: 6, L: 4.86, W: 2.69, H: 2.5, chase: 10, steerFloor: 0.22, steerKmh: 30,
    fwd: '1-3', low: '1-2', crew: ['driver', 'commander'],
    seats: [
      { id: 'driver', label: 'DRIVER', role: 'driver', crew: 'driver', door: [-1.55, 1.1, -1.6], exit: [-2.25, 0, -1.6], hatch: 'driver' },
      { id: 'commander', label: 'COMMANDER  -  .50 CAL', role: 'commander', crew: 'commander', door: [1.55, 1.1, -0.4], exit: [2.25, 0, -0.4], hatch: 'cupola' },
      ...Array.from({ length: 11 }, (_, i) => ({ id: 'troop' + i, label: `TROOP SEAT ${i + 1}`, role: 'troop', crew: i < 5 ? 'troopsL' : 'troopsR', troop: i, door: [0, 0.95, 2.95], exit: [(i % 3 - 1) * 0.7, 0, 3.75], hatch: 'cargo', reach: 2.2 })),
    ],
  },
};

export function createArmorCraft(ctx, type = 'm60', id = type) {
  const { scene, crafts, war, fx, sfx, say, AW, SG, GR } = ctx, kd = ctx.keyDown, TY = TYPES[type], M60 = type === 'm60';
  // ---------------------------------------------------------------- the vehicle, its model and interior
  let V = null, fm = null;
  const model = M60 ? buildM60A3Mesh() : buildM113Mesh();
  const interior = M60 ? buildTankInterior() : buildM113Interior();
  if (M60) { model.hull.add(interior.group); model.turret.add(interior.gunner); model.cupola.add(interior.commander); }
  else { model.hull.add(interior.group); model.ramp.add(interior.rampIn); model.hatches.cargo.add(interior.cargoIn); }
  const ST = buildStations(interior, model, type);   // the clickable controls, the crew inside
  model.group.visible = false; scene.add(model.group);
  model.group.userData.heat = 0.42;
  model.group.traverse(o => { if (o.name && /runningGear/.test(o.name)) o.userData.heat = 0.66; });
  const origColors = []; model.group.traverse(o => { if (o.isMesh && o.material && o.material.color && !origColors.some(e => e[0] === o.material)) origColors.push([o.material, o.material.color.clone()]); });
  const turretRest = M60 ? { y: model.turret.position.y, rz: model.turret.rotation.z, rx: model.turret.rotation.x } : null;
  // ---- the crew, head and shoulders out of their hatches (1980 US armour crewmen: the DH-132 CVC helmet in olive drab
  // with its boom mike and goggles on the brow, OG-107 shirt; the M113's TC in an M1 steel helmet over the CVC is the
  // other common sight - he gets the M1, the troops in the cargo hatch too)
  const CREW_MAT = { cloth: new THREE.MeshLambertMaterial({ color: 0x4d5236, flatShading: true }), skin: new THREE.MeshLambertMaterial({ color: 0xc19a76, flatShading: true }), cvc: new THREE.MeshLambertMaterial({ color: 0x585a3e, flatShading: true }), steel: new THREE.MeshLambertMaterial({ color: 0x4a4e38, flatShading: true }), black: new THREE.MeshLambertMaterial({ color: 0x1a1a18, flatShading: true }), lens: new THREE.MeshLambertMaterial({ color: 0x6e7a7c, flatShading: true }) };
  function crewman(steelPot = false) {
    const g = new THREE.Group(), add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
    add(new THREE.BoxGeometry(0.46, 0.42, 0.28), CREW_MAT.cloth, 0, -0.12, 0);                  // shoulders and chest in the hatch ring
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.11, 0.3, 0.12), CREW_MAT.cloth, s * 0.27, -0.06, -0.06).rotation.x = -0.5;   // upper arms forward, hands on the hatch rim
    add(new THREE.CylinderGeometry(0.055, 0.06, 0.09, 8), CREW_MAT.skin, 0, 0.13, 0);           // neck
    add(new THREE.SphereGeometry(0.1, 10, 8), CREW_MAT.skin, 0, 0.26, -0.01);                   // head
    if (steelPot) { const h = add(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), CREW_MAT.steel, 0, 0.27, 0); h.scale.set(1, 0.78, 1.08); add(new THREE.CylinderGeometry(0.155, 0.16, 0.02, 12), CREW_MAT.steel, 0, 0.265, 0); }
    else {
      const h = add(new THREE.SphereGeometry(0.135, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), CREW_MAT.cvc, 0, 0.27, 0.005); h.scale.set(1, 1, 1.08);   // the CVC shell over the ears
      add(new THREE.BoxGeometry(0.02, 0.02, 0.13), CREW_MAT.black, 0.11, 0.2, -0.07).rotation.y = 0.35;   // boom mike
      add(new THREE.BoxGeometry(0.2, 0.05, 0.05), CREW_MAT.lens, 0, 0.36, -0.08);                         // goggles pushed up on the brow
    }
    g.userData.heat = 0.85;   // warm bodies in the TTS
    g.visible = false; return g;
  }
  const CREW_AT = M60 ? { driver: { parent: model.hull, p: [0, 1.9, -2.05] }, cupola: { parent: model.turret, p: [0.6, 1.47, 0.3] }, loader: { parent: model.turret, p: [-0.62, 1.32, 0.15] } }
    : { driver: { parent: model.hull, p: [-0.62, 1.88, -1.42] }, cupola: { parent: model.hull, p: [0.25, 1.98, 0.15], pot: true }, cargoL: { parent: model.hull, p: [-0.38, 1.9, 1.35], pot: true }, cargoR: { parent: model.hull, p: [0.38, 1.9, 1.3], pot: true } };
  const crewFigs = {};
  for (const [k, c] of Object.entries(CREW_AT)) { const f = crewman(!!c.pot); f.position.set(...c.p); c.parent.add(f); crewFigs[k] = f; }
  function poseCrew(active, s) {
    const fp = active && D.view === 'eye';
    for (const [k, f] of Object.entries(crewFigs)) {
      const hk = k.startsWith('cargo') ? 'cargo' : k, comp = k === 'cupola' ? 'commander' : k === 'driver' ? 'driver' : k === 'loader' ? 'loader' : null;
      const alive = !comp || crewOk(comp), mine = active && s.hatch === hk && (k !== 'cargoR');
      f.visible = !D.dead && alive && D.hatch[hk] > 0.85 && !(fp && mine) && (hk !== 'cargo' || active && s.role === 'troop');
      f.position.y = CREW_AT[k].p[1] - (1 - Math.min(1, (D.hatch[hk] - 0.85) / 0.15)) * 0.25;   // rising up through the ring
      if (!M60 && k === 'cupola') { const pv = fm.P.MG.PIVOT, a = V.mg.az; f.position.x = pv[0] + Math.sin(a) * 0.2; f.position.z = pv[2] + Math.cos(a) * 0.2; f.rotation.y = a; }   // behind the M2's spade grips
      if (M60 && k === 'cupola') f.rotation.y = V.mg50.az * 0.5;
    }
  }

  const D = {
    id, label: TY.label, kind: 'ground', type, seats: TY.seats.map(s => ({ ...s })),
    exists: false, dead: false, seat: 0, view: 'eye', station: false,
    head: { yaw: 0, pitch: 0 }, orbit: { yaw: 0, pitch: 0.22 }, aim: { yaw: 0, pitch: 0, set: false },
    hatch: { driver: 1, loader: 1, cupola: 1, cargo: 0 }, hatchWant: { driver: 1, loader: 1, cupola: 1, cargo: 0 },   // out of contact the crew rides head out
    contactT: 0, binos: false, wantRun: false, proc: { t: 0, calls: {} },
    asleep: false, still: 0, unattended: 0, lowRange: false, crank: 0, wreckT: 0, sunkT: 0, why: '',
  };
  const IN = { master: false, throttle: 0, brake: 0, steer: 0, range: 'N', park: true, starter: false, fuelOn: true,
    trav: 0, elev: 0, fire: false, coax: false, lase: false, dump: false, ammo: 'M735', stab: true, power: true, sight: 'day', ttsMag: 8, ttsPolarity: 'wh',
    cupTrav: 0, cupElev: 0, fire50: false, extinguish: false, mgTrav: 0, mgElev: 0, ramp: false, vane: false, pumps: false };
  const env = AW.env(D), st = {};
  const GN = createGunnery({
    war, fx, ground: (x, z) => Math.max(ctx.ground(x, z), 0), isWater: ctx.isWater, audio: () => audio, ear: () => ctx.camZ().position,
    solid: (x, y, z) => { const hb = AW.houses().get(Math.floor(x / 8) * 100003 + Math.floor(z / 8)); if (hb) for (const B of hb) { const c = Math.cos(B.yaw), s = Math.sin(B.yaw), dx = x - B.x, dz = z - B.z; if (y < B.top && Math.abs(dx * c - dz * s) < B.hx && Math.abs(dx * s + dz * c) < B.hz) return true; } return false; },
    // the crew's fire-command calls (FM 17-12 style): TARGET on a hit, MISSED with the sensing on a miss
    onHit: (t, R) => { if (crafts.active === D && R.cal >= 100) say(`COMMANDER: TARGET!${t.dead || t.dying || t.sinking !== undefined ? '  -  DESTROYED' : '  -  RE-ENGAGE IF IT STILL STANDS'}`, 1.6); },
    onMiss: (R, s) => { if (crafts.active === D && R.cal >= 100) say(`COMMANDER: MISSED  -  ${s.over ? 'OVER' : 'SHORT'}, RE-LASE`, 1.6); },
  });
  D.gunnery = GN;
  let audio = null;
  function snd() { if (!audio && sfx.ctx) { audio = new ArmorAudio(sfx.ctx, sfx.master); audio.init(); } return audio; }
  function newSim() {
    V = M60 ? createM60A3() : createM113(); fm = V.fm; fm.h = 1 / 120;
    D.V = V; D.fm = fm; D.IN = IN; D.driver = createTrackDriver(V, { env, halfW: TY.W / 2, push: M60 ? 2.2e5 : 0 }); D.driver.hold();   // the M60 pushes through small trees
    IN.ammo = 'M735'; IN.sight = 'day'; IN.stab = true; IN.ramp = false; IN.vane = false; IN.pumps = false;
  }
  newSim();
  // ---------------------------------------------------------------- frames and helpers
  const _o = [0, 0, 0], _w = [0, 0, 0], _d = [0, 0, 0];
  const heading = () => fm.attitude().heading;
  D.present = () => D.exists;
  D.frame = out => { fm.origin(_o); out.x = _o[0]; out.y = _o[1]; out.z = _o[2]; out.yaw = heading(); return out; };
  const toHull = (wx, wy, wz, out) => { const R = fm.R; out[0] = R[0] * wx + R[3] * wy + R[6] * wz; out[1] = R[1] * wx + R[4] * wy + R[7] * wz; out[2] = R[2] * wx + R[5] * wy + R[8] * wz; return out; };
  const fromHull = (bx, by, bz, out) => { const R = fm.R; out[0] = R[0] * bx + R[1] * by + R[2] * bz; out[1] = R[3] * bx + R[4] * by + R[5] * bz; out[2] = R[6] * bx + R[7] * by + R[8] * bz; return out; };
  const dirYP = (d, o = {}) => { o.yaw = Math.atan2(-d[0], -d[2]); o.pitch = Math.asin(clamp(d[1], -1, 1)); return o; };
  // world direction of a hull-relative azimuth (+ left) / elevation
  const azelDir = (az, el, out) => fromHull(-Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el), out);
  const seatOf = () => D.seats[D.seat];
  const crewOk = k => { const c = V.armor.COMPS.find(c => c.id === k); return !c || c.hp > 0; };

  // ---------------------------------------------------------------- spawning, entering, leaving
  // spawnAt({ x, z, yaw, plat, state }): state 'cold' (default: parked cold and dark - MASTER off, turret power off,
  // gyros stopped, the TTS uncooled; the crew runs the start-up when someone gets in or orders it) or 'hot' (engine running,
  // power up, gyros run up: ready to move off - a unit spawned into a fight). Returns the craft.
  D.spawnAt = sp => {
    newSim(); env.prep(sp.x, sp.z);
    const hot = sp.state === 'hot';
    V.reset(sp.x, sp.z, sp.yaw ?? 0, env, { range: 'N', park: true, running: hot, ramp: false, cold: !hot });
    IN.master = hot; IN.power = hot; IN.fuelOn = true; D.wantRun = hot; D.proc = { t: 0, pw: 0, calls: hot ? { stab: 1 } : {} };
    st.plat = null; st.loc = null; AW.settle(fm, st);
    if (M60) { V.muzzle(_w); const g = env.height(_w[0], _w[2]); if (_w[1] < g + 0.6) { V.losEl = V.el = Math.min(0.34, Math.atan2(g + 1 - _w[1], 6) + 0.05); } }   // parked facing a rise: the crew lays the gun up clear of the ground
    D.exists = true; D.dead = false; D.asleep = false; D.still = 0; D.wreckT = 0; D.sunkT = 0; D.why = ''; D.lowRange = false; D.crank = 0;
    for (const [m, c] of origColors) m.color.copy(c);
    if (turretRest) { model.turret.position.y = turretRest.y; model.turret.rotation.z = turretRest.rz; model.turret.rotation.x = turretRest.rx; }
    if (D.burn) { D.burn.t = 0; D.burn = null; }
    model.group.visible = true; GN.clear();
    return D;
  };
  D.stow = () => { D.exists = false; model.group.visible = false; D.driver.hold(); if (audio && audio.built) audio.out.gain.value = 0; };
  D.enter = (seat = 0, from) => {
    if (!D.exists) return false;
    if (D.dead) { say(`THE ${TY.label} IS A WRECK${D.why ? '  -  ' + D.why : ''}`, 1.6); return false; }
    D.seat = seat; D.view = 'eye'; D.station = false; D.head.yaw = D.head.pitch = 0; D.orbit.yaw = 0; D.aim.set = false; D.asleep = false; D.unattended = 0;
    const s = D.seats[seat];
    if (s.troop !== undefined && V.seats) V.seats[s.troop] = false;   // the player takes that seat on the bench
    // in through the open hatch; it swings shut behind you (buttoned up; H to ride head out) - the loader and the M113's
    // commander stay up (the loader's hatch is his lookout; the M2 is fired head out)
    if (s.hatch) { D.hatch[s.hatch] = 1; D.hatchWant[s.hatch] = s.role === 'loader' || (!M60 && s.role === 'commander') ? 1 : 0; }
    D.binos = false;
    if (from === 'foot' && D.driver.state === 'driving') { /* the crew carries on driving until you take the wheel */ }
    // the crew starts up (each crewman his own part of the TM order; the player's station is the player's to do)
    if (!fm.eng.running && !fm.eng.flooded) startUp();
    const cold = !fm.eng.running && s.role === 'driver';
    say(`${TY.label}  -  ${s.label}${cold ? `  ·  ${IN.master ? '' : 'MASTER ON, '}START: I (OR CLICK THE SWITCHES)` : !fm.eng.running ? '  ·  THE CREW IS STARTING UP' : ''}  ·  ${hintShort(s)}`, 2.6);
    sfx.ui?.('select');
    return true;
  };
  D.setSeat = i => {
    const s = D.seats[i]; if (!s) return false;
    const was = seatOf(); if (was.troop !== undefined && V.seats) V.seats[was.troop] = true;
    if (s.troop !== undefined && V.seats) V.seats[s.troop] = false;
    D.seat = i; D.station = false; D.head.yaw = D.head.pitch = 0; D.aim.set = false;
    if (s.hatch && s.role === 'loader') D.hatchWant.loader = 1;
    if (s.hatch && !M60 && s.role === 'commander') D.hatchWant.cupola = 1;
    D.binos = false;
    return true;
  };
  D.canExit = () => {
    if (D.dead) return '';
    const v = Math.abs(fm.out.fwd);
    if (v > 1.5 && !fm.water.afloat) return `STOP FIRST  -  ${Math.round(v * 3.6)} km/h`;
    return '';
  };
  D.exit = () => {
    const s = seatOf(); if (s.troop !== undefined && V.seats) V.seats[s.troop] = true;
    IN.fire = IN.coax = IN.fire50 = false; IN.trav = IN.elev = IN.cupTrav = IN.cupElev = IN.mgTrav = IN.mgElev = 0;
    if (D.driver.state !== 'driving') { IN.throttle = 0; IN.steer = 0; IN.brake = 1; }
    if (s.hatch) { D.hatchWant[s.hatch] = 1; D.hatch[s.hatch] = Math.max(D.hatch[s.hatch], 0.7); }   // out through the hatch, left open (the crew's head-out position)
    D.unattended = 0; D.binos = false; SG.draw(null);
  };
  D.exitSpots = () => {
    const out = [], order = [D.seat, ...D.seats.map((_, i) => i).filter(i => i !== D.seat)];
    fm.origin(_o);
    for (const i of order) { const s = D.seats[i]; if (!s.exit || (i !== D.seat && s.troop !== undefined && i > 2)) continue; const w = crafts.toWorld(D, s.exit); if (w) out.push({ x: w.x, y: _o[1], z: w.z, yaw: w.yaw }); }
    out.push({ x: _o[0], y: _o[1] + TY.H * 0.75, z: _o[2], yaw: heading() });   // afloat / boxed in: off the roof
    return out;
  };

  // ---------------------------------------------------------------- reading the player
  let thrLast = null, hwThr = false, padPrev = [];
  const btn = (pad, i) => pad && pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5);
  function padEdge(pad, i) { const b = btn(pad, i), e = b && !padPrev[i]; return e; }
  function readDriving(dt, input) {
    const s = seatOf(), driverSeat = s.role === 'driver';
    const pad = input.pad && !input.keyboardOnly ? input.pad : null, cs = ctx.CTL && ctx.CTL.state, hw = ctx.hwOn ? ctx.hwOn() : true;
    let fwd = kd('KeyW') || (driverSeat && kd('ArrowUp')), back = kd('KeyS') || (driverSeat && kd('ArrowDown'));
    let steer = ((kd('KeyD') || (driverSeat && kd('ArrowRight'))) ? 1 : 0) - ((kd('KeyA') || (driverSeat && kd('ArrowLeft'))) ? 1 : 0);
    let thr = fwd ? 1 : 0, brk = kd('Space') ? 1 : 0, rev = back, analog = false;
    if (pad) {   // left stick steers, RT gas, LT brake / reverse, A brake
      const ax = Math.abs(pad.axes[0] || 0) > 0.15 ? pad.axes[0] : 0; if (ax) { steer = ax; analog = true; }
      const rt = pad.buttons[7] ? pad.buttons[7].value : 0, lt = pad.buttons[6] ? pad.buttons[6].value : 0;
      if (rt > 0.05) thr = Math.max(thr, rt); if (lt > 0.05) rev = true;
      if (btn(pad, 0)) brk = 1;
    }
    if (hw && cs && cs.source && cs.source !== 'NONE') {   // HOTAS: pedals (or the stick in the driver seat) steer, the throttle lever is the accelerator, toe brakes brake
      if (driverSeat && cs.stick && Math.abs(cs.stick.x) > 0.05) { steer = cs.stick.x; analog = true; }
      if (cs.hasPedals && Math.abs(cs.rudder) > 0.05) { steer = cs.rudder; analog = true; }
      if (cs.throttle !== null && cs.throttle !== undefined) { if (thrLast === null) thrLast = cs.throttle; if (Math.abs(cs.throttle - thrLast) > 0.03 || hwThr) { hwThr = true; thrLast = cs.throttle; thr = Math.max(thr, cs.throttle); } }
      const br = Math.max(cs.brakeL || 0, cs.brakeR || 0); if (br > 0.05) brk = Math.max(brk, br);
    }
    const any = thr > 0.02 || rev || Math.abs(steer) > 0.02 || brk > 0;
    if (any && D.driver.state === 'driving') D.driver.hold();   // you take over from the AI driver
    if (!any && D.driver.state === 'driving') return false;      // the AI keeps driving
    if (!crewOk('driver')) { IN.throttle = 0; IN.brake = 0.3; IN.steer = 0; return true; }
    // keyboard steering narrows with speed (a hard steer at speed skids the tracks and can throw one); Right Shift: full
    const kmh = Math.abs(fm.out.fwd) * 3.6, steerMax = kd('ShiftRight') || analog ? 1 : Math.max(TY.steerFloor, 1 - kmh / TY.steerKmh);
    const sm = (v, t, r) => v + clamp(t - v, -r * dt, r * dt);
    const v = fm.out.fwd;
    let wantThr = 0, wantRange = IN.range;
    if (rev && !fwd && thr < 0.05) {
      if (v > 0.6) { brk = 1; }                       // still rolling forward: brake first
      else { wantRange = 'R'; wantThr = pad && pad.buttons[6] ? Math.max(0.5, pad.buttons[6].value) : 0.7; }
    } else if (thr > 0.02) {
      if (v < -0.6) brk = 1;                         // rolling back: brake first
      else { wantRange = D.lowRange ? TY.low : TY.fwd; wantThr = thr; }
    }
    if (Math.abs(steer) > 0.05 && wantThr === 0 && Math.abs(v) < 1.5 && !brk) {   // steering at a standstill: pivot (M60, neutral) / creep round (M113)
      if (M60) { wantRange = 'N'; wantThr = 0.5; } else { wantRange = D.lowRange ? TY.low : TY.fwd; wantThr = 0.35; }
    }
    IN.throttle = sm(IN.throttle, wantThr, wantThr > IN.throttle ? 1.6 : 4);
    IN.steer = sm(IN.steer, clamp(steer, -1, 1) * steerMax, 3);
    IN.brake = brk;
    if (wantThr > 0) { IN.range = wantRange; IN.park = false; D.still = 0; }
    else if (Math.abs(v) < 0.4) { D.still += dt; if (D.still > 0.8) { IN.park = true; IN.range = 'N'; } }
    else D.still = 0;
    return true;
  }
  // a power control handle / cupola command from the error to an aim direction (world yaw / pitch): rate = G x error,
  // passed through the inverse of the handle's shaping (|i|^1.6) so small errors still drive
  const handle = (err, G, max) => { const r = clamp(err * G / max, -1, 1); return Math.sign(r) * Math.pow(Math.abs(r), 1 / 1.6); };
  function readTurret(dt, input) {
    const s = seatOf(), pad = input.pad && !input.keyboardOnly ? input.pad : null, cs = ctx.CTL && ctx.CTL.state, hw = ctx.hwOn ? ctx.hwOn() : true;
    IN.trav = IN.elev = 0; IN.cupTrav = IN.cupElev = 0; IN.mgTrav = IN.mgElev = 0; IN.fire = false; IN.coax = false; IN.fire50 = false; IN.autoload = true;
    const ka = (kd('ArrowRight') ? 1 : 0) - (kd('ArrowLeft') ? 1 : 0), ke = (kd('ArrowUp') ? 1 : 0) - (kd('ArrowDown') ? 1 : 0), slow = kd('ShiftLeft') ? 0.25 : 1;
    let ra = ka * slow, re = ke * slow;
    if (pad) { const x = pad.axes[2] || 0, y = pad.axes[3] || 0; if (Math.abs(x) > 0.15) ra = x * Math.abs(x); if (Math.abs(y) > 0.15) re = -y * Math.abs(y); }
    if (hw && cs && cs.source === 'HOTAS' && cs.stick && s.role !== 'driver') { if (Math.abs(cs.stick.x) > 0.05) ra = cs.stick.x; if (Math.abs(cs.stick.y) > 0.05) re = -cs.stick.y; }   // the stick is the power control handle
    const manual = ra !== 0 || re !== 0;
    const trig = input.fire || D.fireTap || (pad && btn(pad, 5)) || (hw && cs && cs.actions && cs.actions.fire);
    if (D.fireTap && !input.fire) D.trigWas = false; D.fireTap = false;   // a tap shorter than a frame still fires (low frame rates)
    const second = kd('KeyG') || (pad && btn(pad, 4)) || (hw && cs && cs.actions && cs.actions.pickle);
    if (s.role === 'gunner' && M60) {
      const cur = dirYP(V.sightDir(_d));
      if (!D.aim.set || manual) { D.aim.yaw = cur.yaw; D.aim.pitch = cur.pitch; D.aim.set = true; }
      if (manual) { IN.trav = ra; IN.elev = re; }
      else { IN.trav = -handle(wrap(D.aim.yaw - cur.yaw), 6, V.hydP > 0.5 ? 22.5 * D2R : 2.2 * D2R); IN.elev = handle(D.aim.pitch - cur.pitch, 6, V.hydP > 0.5 ? 4 * D2R : 0.9 * D2R); }
      // the gun's limits: let the aim come back inside them (+20 / -10 deg on the hull)
      const lp = V.losEl; if ((lp >= 20 * D2R - V.fc.se - 1e-3 && D.aim.pitch > cur.pitch) || (lp <= -10 * D2R + 1e-3 && D.aim.pitch < cur.pitch)) D.aim.pitch = cur.pitch;
      // and he does not lay the gun into the ground (a bank ahead, the chase view's aim on the near ground): with the
      // muzzle within 0.4 m of the earth the gun goes no lower
      V.muzzle(_w); if (_w[1] < AW.terrain(_w[0], _w[2]) + 0.4) { if (D.aim.pitch < cur.pitch) D.aim.pitch = cur.pitch; if (IN.elev < 0) IN.elev = 0; }
      if (trig && !D.trigWas) { if (V.gun.state === 'ready') IN.fire = true; else say(V.gun.state === 'loading' ? `LOADER: ${ROUNDS[V.gun.round].short} - LOADING` : 'GUN EMPTY', 0.9); }
      D.trigWas = trig;
      IN.coax = !!second;
      if (pad && padEdge(pad, 2)) IN.lase = true;
      if (hw && cs && cs.pressed && cs.pressed.missile) IN.lase = true;
      if (pad && padEdge(pad, 3)) toggleSight();
    } else if (s.role === 'loader' && M60) {
      // the player is the loader: no automatic loading - he takes the round the gunner called for (Q) from the nearest rack
      // (the ready rack in the bustle first) and rams it: click / F. The gun is "UP" when the breech closes.
      IN.autoload = false;
      if ((trig && !D.trigWas) || D.loadReq) {
        D.loadReq = false;
        if (V.gun.state === 'empty') { if (V.ammoCount(IN.ammo) > 0) { IN.autoload = true; say(`LOADING ${ROUNDS[IN.ammo].name}`, 1.2); } else say(`NO ${ROUNDS[IN.ammo].short} LEFT  -  Q FOR ANOTHER ROUND`, 1.4); }
        else say(V.gun.state === 'loading' ? 'STILL RAMMING THE ROUND' : 'THE GUN IS ALREADY UP', 1);
      }
      D.trigWas = trig;
    } else if (lookingAbout(s)) {   // buttoned up, looking about the cupola at its controls (E): hands off the gun
      D.trigWas = trig; D.aim.set = false;
    } else if (s.role === 'commander' && M60 && D.hatch.cupola > 0.6) {
      // head out of the M19 cupola: he looks about (mouse = his head, C = 7x50 binoculars); the M85 is fired from inside
      // through the M28 periscope sight, so the trigger is a reminder to button up
      IN.cupTrav = clamp(ra, -1, 1); IN.cupElev = clamp(re, -1, 1);
      if (trig && !D.trigWas) say('THE M85 FIRES FROM INSIDE THE CUPOLA  -  H TO BUTTON UP', 1.4);
      D.trigWas = trig; D.aim.set = false;
    } else if (s.role === 'commander') {
      // the cupola (.50): M60 on the turret (buttoned up, through the M28 sight), M113 on the hull roof (head out)
      const az = M60 ? V.az + V.mg50.az : V.mg.az, el = M60 ? V.mg50.el : V.mg.el, cur = dirYP(azelDir(az, el, _d));
      if (!D.aim.set || manual) { D.aim.yaw = cur.yaw; D.aim.pitch = cur.pitch; D.aim.set = true; }
      const ta = manual ? ra : -handle(wrap(D.aim.yaw - cur.yaw), 5, M60 ? 0.6 : 0.8), te = manual ? re : handle(D.aim.pitch - cur.pitch, 5, M60 ? 0.4 : 0.5);
      if (M60) { IN.cupTrav = clamp(ta, -1, 1); IN.cupElev = clamp(te, -1, 1); } else { IN.mgTrav = clamp(ta, -1, 1); IN.mgElev = clamp(te, -1, 1); }
      const lim = M60 ? [-0.26, 1.05] : [-0.17, 0.9]; if ((el >= lim[1] - 1e-3 && D.aim.pitch > cur.pitch) || (el <= lim[0] + 1e-3 && D.aim.pitch < cur.pitch)) D.aim.pitch = cur.pitch;
      IN.fire50 = !!trig;
    }
    if (pad) padPrev = pad.buttons.map(b => b && (b.pressed || b.value > 0.5));
  }
  function toggleSight() { IN.sight = IN.sight === 'day' ? 'tts' : 'day'; say(IN.sight === 'tts' ? `TTS THERMAL ${IN.ttsMag}X${V.ttsCool < 0.95 ? '  -  COOLING' : ''}` : 'M35E1 DAY SIGHT 8X', 1.1); }

  // ---------------------------------------------------------------- the sim step (player or parked / AI)
  const SHUT_T = 40;
  // ---- the start-up (TM order, game times), each crewman his own part: the DRIVER - MASTER on, START held until the
  // engine catches; the GUNNER (M60) - TURRET POWER on once the engine carries the load, then the stabiliser's gyros run
  // up (~20 s) and the TTS cools. The player's own station is left to the player (I, or click the switches); the crew
  // does the rest. Unattended, the crew shuts down: fuel off, then MASTER and turret power off.
  function startUp() { D.wantRun = true; IN.fuelOn = true; D.proc.t = 0; D.proc.calls = {}; D.proc.pw = 0; }
  D.startUp = startUp;
  function crewProc(dt, active) {
    const P = D.proc, me = active ? seatOf().role : null, call = (k, t, d = 1.4) => { if (!P.calls[k]) { P.calls[k] = 1; if (active) say(t, d); } };
    P.t += dt;
    if (D.wantRun && !D.dead) {
      if (me !== 'driver' && crewOk('driver')) {
        if (!IN.master) { if (P.t > 0.8) { IN.master = true; P.t = 0; snd()?.click(true); call('master', 'DRIVER: MASTER ON'); } }
        else if (!fm.eng.running && !fm.eng.flooded && D.crank <= 0 && P.t > 1.2) { D.crank = 5; IN.fuelOn = true; P.t = 0; call('start', 'DRIVER: STARTING'); }
      }
      if (M60 && fm.eng.running && !IN.power) {
        if (me !== 'gunner' && crewOk('gunner')) { P.pw += dt; if (P.pw > 1.5) { IN.power = true; P.pw = 0; snd()?.click(true); call('power', 'GUNNER: TURRET POWER ON  -  STAB RUNNING UP'); } }
        else if (me === 'gunner') call('powerHint', 'TURRET POWER OFF  -  I (OR E: THE SWITCH ON THE RIGHT WALL)', 2.4);
      }
    }
    if (M60 && IN.power && V.hydP > 0.5 && V.gyro >= 1) call('stab', 'GUNNER: STAB UP');
    if (!D.wantRun && !fm.eng.running && !active) { P.off = (P.off || 0) + dt; if (P.off > 6 && (IN.master || IN.power)) { IN.master = false; IN.power = false; } } else P.off = 0;
  }
  function step(dt, active) {
    fm.h = active || D.driver.state === 'driving' ? 1 / 240 : 1 / 120;
    contact(dt, active);
    crewProc(dt, active);
    // the starter stays in until the engine runs up past its stall speed (it catches at ~160 rpm and dies under ~380)
    if (D.crank > 0) { const up = fm.eng.running && fm.eng.w * 9.549 > fm.P.ENGINE.STALL_RPM + 80; D.crank -= dt; IN.starter = !up && !fm.eng.flooded && IN.master; if (up || D.crank <= 0) { D.crank = 0; IN.starter = false; } } else IN.starter = false;
    if (!active) {   // nobody in it: the AI driver, or parked with the crew (who shut down after a while)
      if (D.driver.state === 'driving' || D.driver.state === 'arrived') { const a = D.driver.update(dt); Object.assign(IN, a); }
      else { IN.throttle = 0; IN.steer = 0; IN.brake = Math.abs(fm.out.fwd) > 0.3 ? 1 : 0; if (Math.abs(fm.out.fwd) < 0.4) { IN.park = true; IN.range = 'N'; } }
      IN.trav = IN.elev = IN.cupTrav = IN.cupElev = IN.mgTrav = IN.mgElev = 0; IN.fire = IN.coax = IN.fire50 = false; IN.autoload = true;   // the AI loader loads
      D.unattended += dt; if (D.unattended > SHUT_T && fm.eng.running && D.driver.state !== 'driving') { IN.fuelOn = false; D.wantRun = false; }
    } else D.unattended = 0;
    // the AI crew drives with the gun in the travel position (turret ahead, gun up, stabiliser off) so the barrel
    // clears the ground over banks and down ramps; the player taking the gunner's seat gets the stabiliser back
    const playerGunner = active && seatOf().role === 'gunner';
    if (M60 && D.driver.state === 'driving' && !playerGunner) { IN.stab = false; IN.trav = clamp(V.losAz * 3, -1, 1); IN.elev = clamp((0.16 - V.losEl) * 5, -1, 1); D.travelLock = true; }
    else if (D.travelLock && (playerGunner || D.driver.state !== 'driving')) { IN.stab = true; D.travelLock = false; }
    // the commander's override (D.click 'override'): the gunner slews onto the cupola's bearing; the cupola holds it
    if (M60 && D.slewAz != null) {
      if (V.hydP < 0.5 || playerGunner || D.dead) D.slewAz = null;
      else { const err = wrap(D.slewAz - V.az); IN.trav = clamp(-err * 4, -1, 1); V.mg50.az = err; if (Math.abs(err) < 0.004) { D.slewAz = null; if (active) say('GUNNER: IDENTIFIED', 1.2); } }
    }
    if (!IN.fuelOn && !fm.eng.running && D.crank > 0) IN.fuelOn = true;
    fm.origin(_o); env.prep(_o[0], _o[2]);
    AW.carry(fm, st);
    const evs = V.step(dt, env, IN);
    AW.settle(fm, st);
    IN.lase = false; IN.dump = false; IN.extinguish = false;
    // the gun pushed into a house wall or a tree, not dug into the ground: the barrel is not bent (game; the sim's
    // dig-in rule is for the muzzle ploughing into earth) - nor is it when the tank barely moves (settling where it was
    // parked, a deck heaving under it): the muzzle rests on the ground, it is not driven into it
    if (M60 && evs.some(e => e.type === 'gunDug')) {
      V.muzzle(_w); if (_w[1] > AW.terrain(_w[0], _w[2]) + 0.15 || Math.abs(fm.out.fwd) < 1.5) { const g = V.armor.COMPS.find(c => c.id === 'gun'); if (g) g.hp = Math.min(1, g.hp + 0.25); for (let i = evs.length - 1; i >= 0; i--) if (evs[i].type === 'component' && evs[i].id === 'gun') evs.splice(i, 1); }
    }
    for (const e of evs) onEvent(e, active);
    // drowned / lost: the hull top under the sea for a while
    fm.origin(_o);
    if (_o[1] + TY.H * 0.8 < -0.3 && !D.dead) { D.sunkT += dt; if (D.sunkT > 4) wreck('SANK', false); } else D.sunkT = 0;
  }
  function onEvent(e, active) {
    const tell = (t, s = 1.6, kind) => { if (active) say(t, s); else if (kind) ctx.feed?.(`${TY.short}: ${t}`, kind); };
    switch (e.type) {
      case 'shot': {
        if (e.weapon === "main") e.aimR = V.fc.range; GN.fire(e, 1); const a = snd();
        if (e.weapon === 'main') {
          a?.mainGun(); const p = e.p, d = e.dir;
          fx.flash(p[0], p[1], p[2], 0.9);
          for (let i = 0; i < 5; i++) fx.mix.spawn(p[0] + d[0] * i * 1.4, p[1] + d[1] * i * 1.4, p[2] + d[2] * i * 1.4, d[0] * 4 + (Math.random() - 0.5) * 2, 1 + Math.random(), d[2] * 4 + (Math.random() - 0.5) * 2, 2 + Math.random() * 1.5, 1.6 + i * 0.4, 5 + i, 0.72, 0.7, 0.66, 0.65, -0.1, 1.2, 0.6);
          fm.origin(_o); const g = ctx.ground(_o[0], _o[2]);
          for (let i = 0; i < 8; i++) { const r = 5 + Math.random() * 6, sp = (Math.random() - 0.5) * 1.6; fx.mix.spawn(_o[0] + (d[0] * Math.cos(sp) - d[2] * Math.sin(sp)) * r, g + 0.5, _o[2] + (d[2] * Math.cos(sp) + d[0] * Math.sin(sp)) * r, (Math.random() - 0.5) * 3, 0.5 + Math.random(), (Math.random() - 0.5) * 3, 2.5 + Math.random() * 2, 1.4, 4.5, 0.55, 0.48, 0.36, 0.55, 0.3, 1.5, 0.6); }
          fx.shake = Math.min(1.5, fx.shake + (active ? 0.5 : 0.1));
          if (active) say(seatOf().role === "gunner" ? `GUNNER: ON THE WAY!  -  ${ROUNDS[e.round].short}` : `ON THE WAY  -  ${ROUNDS[e.round].name}`, 1);
        } else { a?.mg(e.weapon); if (Math.random() < 0.5) fx.add.spawn(e.p[0] + e.dir[0] * 0.4, e.p[1] + e.dir[1] * 0.4, e.p[2] + e.dir[2] * 0.4, 0, 0, 0, 0.04, 0.6, 0.3, 1, 0.8, 0.45, 1); }
        break;
      }
      case 'loaded': snd()?.loaded(); if (active && seatOf().role !== 'loader') say(`LOADER: UP!  -  ${ROUNDS[e.round].short}`, 0.9); else if (active) say(`UP  -  ${ROUNDS[e.round].short} IN THE BREECH`, 0.9); break;   // FM 17-12: the loader calls UP when the gun is armed
      case 'lase': tell(e.range ? `RANGE ${e.range} m` : 'NO RETURN  -  MULTIPLE OR NONE', 1.2); break;
      case 'stall': tell(fm.eng.flooded ? 'ENGINE DROWNED' : fm.eng.fuel <= 0 ? 'OUT OF FUEL' : 'ENGINE STALLED', 1.6); break;
      case 'start': tell('ENGINE RUNNING', 1.0); break;
      case 'flooded': tell(e.where === 'crew' ? 'WATER IN THE CREW COMPARTMENT' : 'WATER OVER THE AIR INTAKE  -  ENGINE DROWNED', 2.2, 'bad'); break;
      case 'thrown': tell(`TRACK THROWN  -  ${e.side ? 'RIGHT' : 'LEFT'}  ·  MOBILITY KILL`, 2.4, 'bad'); break;
      case 'bellied': tell('BELLIED  -  HIGH-CENTRED, BACK OFF', 2); break;
      case 'rollover': tell('ROLLED OVER', 2.5, 'bad'); break;
      case 'swimming': if (e.on) tell(M60 ? 'AFLOAT?!' : `SWIMMING${V.vane > 0.95 ? '' : '  -  RAISE THE TRIM VANE (N)'}${fm.water.pumps ? '' : '  ·  BILGE PUMPS OFF (B)'}`, 2.2); else tell('TRACKS ON THE BOTTOM', 1.2); break;
      case 'sinking': tell('TAKING WATER  -  PUMPS / RAMP!', 2.2, 'bad'); break;
      case 'knockdown': { const hd = heading(), T = AW.fell(e.id, -Math.sin(hd), -Math.cos(hd)); if (T) { snd()?.impact(true, 5); fx.mix.spawn(T.x, T.top - 2, T.z, 0, 1, 0, 1.4, 1.5, 4, 0.3, 0.32, 0.22, 0.5, 0.2, 1, 0.6); } break; }
      case 'impact': if (e.speed > 3.5) { sfx.thump?.(Math.min(1, e.speed / 8)); if (active && e.speed > 6) ctx.crewHit?.((e.speed - 6) * 0.03, 'THROWN ABOUT', null); } break;
      case 'halon': tell(`HALON  -  ${String(e.where).toUpperCase()} FIRE${V.fire && V.fire.where ? ' STILL BURNING' : ' OUT'}`, 1.8); break;
      case 'bailout': wreck(e.why === 'cookoff' ? 'AMMUNITION COOK-OFF' : 'ON FIRE  -  CREW BAILED OUT', true); break;
    }
  }
  D.update = (dt, input) => {
    if (D.dead) { D.wreckT += dt; GN.update(dt); return; }
    D.asleep = false;
    const s = seatOf();
    readDriving(dt, input);
    if (D.driver.state === 'driving') Object.assign(IN, D.driver.update(dt));   // the AI drives on (the landing craft's ramp) until you touch the controls
    readTurret(dt, input);
    hatches(dt);
    step(dt, true);
    GN.update(dt);
    if (s.role === 'troop' && V.seats) V.seats[s.troop] = false;
  };
  D.idle = dt => {
    if (!D.exists) return;
    GN.update(dt);
    hatches(dt);
    if (D.dead) { D.wreckT += dt; if (D.wreckT > 300 && !(st.plat)) { /* the wreck stays */ } if (D.asleep) return; }
    // sleep: parked on land, engine off, at rest (wakes on entry, a hit, an order)
    const cam = ctx.camZ(); fm.origin(_o);
    const far = cam && Math.hypot(cam.position.x - _o[0], cam.position.z - _o[2]) > 900;
    const pk = st.plat ? 4 : 1, rest = Math.hypot(fm.vel[0], fm.vel[1], fm.vel[2]) < 0.04 * pk && Math.hypot(fm.w[0], fm.w[1], fm.w[2]) < 0.02 * pk;   // (a deck heaves: looser)
    if (D.driver.state !== 'driving' && ((!fm.eng.running && rest) || (far && rest) || D.dead)) { D.restT = (D.restT || 0) + dt; if (D.restT > (st.plat ? 4 : 2)) { D.asleep = true; fm.origin(_o); env.prep(_o[0], _o[2]); D.restOff = _o[1] - env.height(_o[0], _o[2]); return; } } else D.restT = 0;   // (on a deck it sleeps too: afterWar carries it kinematically)
    D.asleep = false;
    step(dt, false);
  };
  D.afterWar = () => { if (!D.exists || (D.asleep && !st.plat)) return; AW.carry(fm, st); if (D.asleep && st.plat) { fm.origin(_o); env.prep(_o[0], _o[2]); fm.pos[1] += env.height(_o[0], _o[2]) + (D.restOff || 0) - _o[1]; } AW.settle(fm, st); if (D.asleep && !st.plat) D.wake(); };   // asleep on a deck: carried as it lies; off the deck (it sank, the boat left): awake
  D.wake = () => { D.asleep = false; D.restT = 0; };
  // an order for the crew (the AI driver): the landing craft, scripts, the RUNAWAY war's own machines use the same
  D.order = (pts, o = {}) => { D.crankUp(); D.driver.follow(pts, o); return D.driver; };
  D.crankUp = () => { D.wake(); D.unattended = 0; if (!fm.eng.running && !fm.eng.flooded) { startUp(); IN.master = true; D.crank = 5; D.proc.calls.master = D.proc.calls.start = 1; } };   // an order: the crew starts at once

  // ---------------------------------------------------------------- damage: RUNAWAY fire into the armour model
  const _ro = [0, 0, 0], _rd = [0, 0, 0];
  D.hurt = (amount, why, at, dir) => {
    if (D.dead || !D.exists) return;
    D.wake(); buttonUp();
    const R0 = roundFor(amount, why), active = crafts.active === D, s = seatOf();
    fm.origin(_o);
    const rays = [];
    if (at && dir && Math.hypot(dir.x, dir.y, dir.z) > 1) {
      const l = Math.hypot(dir.x, dir.y, dir.z); rays.push([at.x - dir.x / l * 9, at.y - dir.y / l * 9, at.z - dir.z / l * 9, dir.x / l, dir.y / l, dir.z / l]);
    } else {   // a blast or flak: fragments / the shell from above and around at a random point on the hull
      const n = R0 === RW_ROUNDS.frag ? 3 : 1;
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, e = 0.35 + Math.random() * 0.9, dx = Math.cos(a) * Math.cos(e), dy = -Math.sin(e), dz = Math.sin(a) * Math.cos(e);
        fromHull((Math.random() - 0.5) * TY.W * 0.8, 1 + Math.random() * 1.6, (Math.random() - 0.5) * TY.L * 0.8, _w);
        const tx = _o[0] + _w[0], ty = _o[1] + _w[1], tz = _o[2] + _w[2]; rays.push([tx - dx * 9, ty - dy * 9, tz - dz * 9, dx, dy, dz]);
      }
    }
    let worst = null, perfor = false;
    for (const r of rays) {
      toHull(r[0] - _o[0], r[1] - _o[1], r[2] - _o[2], _ro); toHull(r[3], r[4], r[5], _rd);
      const h = V.hit({ round: R0, range: 300, o: _ro.slice(), d: _rd.slice() });
      if (h.result === 'miss') continue;
      worst = h; if (h.result === 'perforated' || h.result === 'scab') perfor = true;
      for (const e of h.events) crewEvent(e, active, s, amount, why, at);
      if (h.kill && h.kill.K && !D.dead) { wreck(V.armor.cookoff ? 'AMMUNITION COOK-OFF' : 'KNOCKED OUT', true); return; }
    }
    // head out of a hatch: small arms and splinters find the man in it
    if (active && s.hatch && D.hatch[s.hatch] > 0.5 && D.view === 'eye' && R0.cal < 30 && Math.random() < 0.3) ctx.crewHit?.(amount * 0.8, `${why}  -  HEAD OUT`, at);
    if (active && worst && !D.dead) {
      if (worst.result === 'ricochet') say(`${R0.short} - RICOCHET OFF THE ${String(worst.zone).toUpperCase()}`, 1.1);
      else if (!perfor) say(`${R0.short} HIT  -  ${String(worst.zone).toUpperCase()} HELD`, 1.1);
      sfx.hit?.() ?? sfx.thump?.(0.6);
      fx.shake = Math.min(1.5, fx.shake + 0.25);
    }
    if (worst) { fx.impact(rays[0][0] + rays[0][3] * 9, rays[0][1] + rays[0][4] * 9, rays[0][2] + rays[0][5] * 9, 'metal'); }
  };
  // under fire the crew buttons up (hatches shut, periscopes and vision blocks); the M113's commander stays on his M2.
  // 30 s after the last round the AI crew rides head out again (the player's own hatch is his to open: H)
  function buttonUp() {
    const active = crafts.active === D, mine = active ? seatOf().hatch : null;
    if (D.contactT <= 0) { if (active) say(`${M60 ? 'TANK COMMANDER' : 'TRACK COMMANDER'}: BUTTON UP!`, 1.6); }
    D.contactT = 30;
    for (const k of ['driver', 'loader', 'cupola']) if (!(k === 'cupola' && !M60)) D.hatchWant[k] = 0;
    if (mine === 'cupola' && !M60) D.hatchWant.cupola = 1;
    D.binos = false;
  }
  D.buttonUp = buttonUp;
  function contact(dt, active) {
    if (D.contactT <= 0) return;
    D.contactT -= dt;
    if (D.contactT <= 0) { const mine = active ? seatOf().hatch : null; for (const k of ['driver', 'loader', 'cupola']) if (k !== mine) D.hatchWant[k] = 1; if (active) say('ALL CLEAR  -  THE CREW IS BACK UP IN THE HATCHES', 1.6); }
  }
  const CREW_NAME = { driver: 'DRIVER', gunner: 'GUNNER', commander: 'COMMANDER', loader: 'LOADER', troopsL: 'TROOPS (LEFT BENCH)', troopsR: 'TROOPS (RIGHT BENCH)' };
  const COMP_NAME = { engine: 'ENGINE', transmission: 'TRANSMISSION', trackL: 'LEFT TRACK', trackR: 'RIGHT TRACK', gun: 'MAIN GUN', breech: 'BREECH', turretDrive: 'TURRET DRIVE', computer: 'BALLISTIC COMPUTER', laser: 'RANGEFINDER', sightDay: 'DAY SIGHT', sightThermal: 'THERMAL SIGHT', radio: 'RADIO', cupola: 'CUPOLA', mg: '.50 CAL', fuelL: 'LEFT FUEL TANK', fuelR: 'RIGHT FUEL TANK', fuel: 'FUEL TANK', readyAmmo: 'READY RACK', hullAmmo: 'HULL RACK', floorAmmo: 'FLOOR AMMUNITION' };
  function crewEvent(e, active, s, amount, why, at) {
    if (e.type === 'crew') {
      const mine = active && e.who === s.crew;
      if (mine) { if (e.wound === 'killed') ctx.crewKilled?.(`${TY.short} ${CREW_NAME[e.who] || e.who} KILLED`); else ctx.crewHit?.(e.wound === 'serious' ? 0.5 : 0.15, `${why}  -  WOUNDED`, null); }
      else if (active || crafts.active?.kind !== 'air') ctx.feed?.(`${TY.short}: ${CREW_NAME[e.who] || e.who} ${e.wound === 'killed' ? 'KILLED' : e.wound.toUpperCase() + ' WOUND'}`, 'bad');
    } else if (e.type === 'component' && e.destroyed) { if (active) say(`${COMP_NAME[e.id] || e.id} KNOCKED OUT`, 2); else ctx.feed?.(`${TY.short}: ${COMP_NAME[e.id] || e.id} KNOCKED OUT`, 'bad'); }
    else if (e.type === 'fire' && active) say(`FIRE  -  ${COMP_NAME[e.where] || e.where}${M60 && e.where !== 'engine' ? '  ·  HALON' : '  ·  X: EXTINGUISHER'}`, 2.2);
    else if (e.type === 'hit' && e.result === 'perforated' && active) say(`PENETRATION  -  ${String(e.zone).toUpperCase()}`, 1.6);
  }
  function wreck(why, burn) {
    if (D.dead) return;
    D.dead = true; D.why = why; D.wreckT = 0; IN.fuelOn = false; IN.throttle = 0; IN.fire = IN.coax = IN.fire50 = false; D.driver.hold();
    fm.origin(_o);
    if (burn) {
      const big = V.armor.cookoff;
      fx.explode(_o[0], _o[1] + 2, _o[2], big ? 2.2 : 1.3, { fire: 90, debris: big ? 14 : 6, color: 0x3a3a2c, shake: 1 }); sfx.boom?.(big ? 1 : 0.7);
      D.burnAt = { x: _o[0], y: _o[1] + 1.8, z: _o[2] }; D.burn = fx.burn(_o[0], _o[1] + 1.8, _o[2], 150, 1.3, D.burnAt);
      for (const [m] of origColors) m.color.multiplyScalar(0.32);   // scorched
      if (big && turretRest) { model.turret.position.y += 0.35; model.turret.rotation.z = 0.12 + Math.random() * 0.1; model.turret.rotation.x = -0.08; }   // the turret lifted off its ring
    }
    ctx.feed?.(`${TY.label} ${why}`, 'bad');
    ctx.unitLost?.(D, why, crafts.active === D);   // COMMANDER: the fleet's loss
    if (crafts.active === D) { say(`${TY.label}  -  ${why}  -  BAIL OUT!`, 3); setTimeout(() => { if (crafts.active === D) ctx.bail?.(D); }, 600); }
  }
  D.wreck = wreck;

  // ---------------------------------------------------------------- what war.js sees
  D.pl = {
    alive: () => !D.dead, inCave: false, landed: () => fm.load[0] + fm.load[1] > 0.3 * fm.mass * 9.81 && Math.abs(fm.out.fwd) < 1,
    hitR: TY.hitR, sight: TY.sight, capTime: 8, detect: () => fm.eng.running ? 0.85 : 0.6,
  };
  const deckV = { x: 0, z: 0 };
  D.avatar = Z => {
    fm.origin(_o);
    Z.pos.set(_o[0], _o[1] + TY.H * 0.45, _o[2]);
    const pv = st.plat && war.surfVel ? war.surfVel(_o[0], _o[2]) : null;
    Z.vel.set(fm.vel[0] + (pv ? pv.vx : 0), fm.vel[1], fm.vel[2] + (pv ? pv.vz : 0));
    const h = heading(); Z.facing.set(-Math.sin(h), -Math.cos(h));
  };
  const B = { x: 0, z: 0, yaw: 0, hl: TY.L / 2, hw: TY.W / 2, y0: 0, y1: 0, def: D };
  D.bounds = () => { if (!D.exists) return null; fm.origin(_o); B.x = _o[0]; B.z = _o[2]; B.yaw = heading(); B.y0 = _o[1]; B.y1 = _o[1] + TY.H; return B; };

  // ---------------------------------------------------------------- keys
  D.key = code => {
    const s = seatOf(), role = s.role;
    if (code === "KeyF" || code === "KeyX") D.fireTap = true;   // (the held key is read in update; the tap is latched here)
    switch (code) {
      case 'KeyV': D.view = D.view === 'eye' ? 'chase' : 'eye'; D.aim.set = false; say(D.view === 'eye' ? `${s.label}'S VIEW` : 'CHASE VIEW  -  MOUSE ORBITS', 1); return true;
      case 'KeyH': if (s.hatch) { D.hatchWant[s.hatch] = D.hatchWant[s.hatch] > 0.5 ? 0 : 1; say(D.hatchWant[s.hatch] ? (role === 'troop' ? 'CARGO HATCH OPEN  -  STANDING UP' : 'HATCH OPEN  -  HEAD OUT') : 'HATCH CLOSED  -  BUTTONED UP', 1.2); } return true;
      case 'KeyI': stationPower(role); return true;
      case 'KeyC': if (D.view === 'eye' && headOut(s)) { D.binos = !D.binos; say(D.binos ? 'BINOCULARS 7 X 50' : 'BINOCULARS DOWN', 0.9); } else if (D.view === 'eye') say('BINOCULARS: HEAD OUT FIRST (H)', 1.2); return true;
      case 'KeyZ': D.lowRange = !D.lowRange; say(D.lowRange ? `LOW RANGE (${TY.low})` : `HIGH RANGE (${TY.fwd})`, 1.2); return true;
      case 'KeyX': if (V.fire && V.fire.where) { IN.extinguish = true; say('EXTINGUISHER', 1); return true; } return false;
    }
    if (M60) {
      if (code === 'KeyQ' && (role === 'gunner' || role === 'loader' || role === 'commander')) { const L = ['M735', 'M456', 'M393'], n = L[(L.indexOf(IN.ammo) + 1) % 3]; IN.ammo = n; say(`LOADER: ${ROUNDS[n].name} NEXT  (${V.ammoCount(n)} LEFT)`, 1.4); return true; }
      if (role === 'gunner') {
        if (code === 'KeyT') { IN.lase = true; return true; }
        if (code === 'KeyR') { IN.dump = true; say('COMPUTER DUMPED  -  BATTLESIGHT 1200', 1.1); return true; }
        if (code === 'KeyO') { toggleSight(); return true; }
        if (code === 'KeyN') { IN.ttsMag = IN.ttsMag === 8 ? 3 : 8; say(`TTS ${IN.ttsMag}X`, 0.9); return true; }
        if (code === 'KeyU') { IN.ttsPolarity = IN.ttsPolarity === 'wh' ? 'bh' : 'wh'; say(IN.ttsPolarity === 'wh' ? 'WHITE HOT' : 'BLACK HOT', 0.9); return true; }
        if (code === 'KeyB') { IN.stab = !IN.stab; say(`STABILISER ${IN.stab ? 'ON' : 'OFF'}`, 1); return true; }
        if (code === 'KeyE') { D.station = !D.station; D.head.yaw = D.head.pitch = 0; say(D.station ? 'GUNNER\'S STATION' : 'SIGHT', 0.8); return true; }
        if (code === 'KeyG') return true;
      }
    }
    if (code === 'KeyE' && role === 'commander') { D.station = !D.station; D.head.yaw = D.head.pitch = 0; D.aim.set = false; say(D.station ? (headOut(s) ? 'LOOK ABOUT' : 'LOOKING ABOUT THE CUPOLA  -  THE CONTROLS') : M60 ? 'ON THE M28 SIGHT' : 'ON THE .50', 0.9); return true; }
    if (!M60) {
      if (code === 'KeyR') { IN.ramp = !(V.rampWant > 0.5); say(IN.ramp ? 'RAMP DOWN' : 'RAMP UP', 1.1); return true; }
      if (code === 'KeyN' && role !== 'troop') { IN.vane = !(V.vaneWant > 0.5); say(IN.vane ? 'TRIM VANE UP' : 'TRIM VANE STOWED', 1.1); return true; }
      if (code === 'KeyB' && role !== 'troop') { IN.pumps = !V.pumpSwitch; say(`BILGE PUMPS ${IN.pumps ? 'ON' : 'OFF'}`, 1.1); return true; }
    }
    return ['KeyF', 'KeyG', 'KeyO', 'KeyU', 'KeyL', 'KeyE', 'KeyQ', 'KeyR', 'KeyN', 'KeyB', 'KeyC', 'Home', 'PageUp', 'PageDown'].includes(code);
  };
  // I: your own station's power. DRIVER: MASTER on and the starter held until it catches (or the engine off); GUNNER:
  // turret power; anyone else: tells the driver to start up / shut down
  function stationPower(role) {
    if (role === 'driver') {
      if (fm.eng.running) { IN.fuelOn = false; D.wantRun = false; say('ENGINE OFF', 1.2); return; }
      if (fm.eng.flooded) { say('ENGINE DROWNED  -  IT WILL NOT START', 1.4); return; }
      if (!IN.master) snd()?.click(true);
      IN.master = true; IN.fuelOn = true; D.crank = 5; D.wantRun = true; say('MASTER ON  -  STARTER', 1.2); return;
    }
    if (role === 'gunner' && M60) { IN.power = !IN.power; snd()?.click(true); say(IN.power ? `TURRET POWER ON${V.gyro < 1 ? '  -  STAB RUNNING UP' : ''}` : 'TURRET POWER OFF  -  HANDWHEELS', 1.3); return; }
    if (fm.eng.running) { IN.fuelOn = false; D.wantRun = false; say('DRIVER, SHUT IT DOWN', 1.3); } else { startUp(); say('DRIVER, START UP', 1.3); }
  }
  // the clickable controls (armorstations.js): what the crosshair is over in the station you are in, click to work it
  const lookingAbout = s => s.role === 'commander' && D.station && !headOut(s);
  const _ck = { group: { visible: true }, hitBoxes: [] };
  D.cockpitObj = () => {
    if (crafts.active !== D || D.view !== 'eye' || D.dead) return null;
    const s = seatOf(), r = s.role;
    if (!insideCam || inSight() || (r === 'gunner' && !D.station) || (r === 'commander' && !lookingAbout(s))) return null;
    _ck.hitBoxes = ST.hitsFor(r); return _ck;
  };
  D.click = id => {
    const s = seatOf(), role = s.role, [k, arg] = id.split(':');
    snd()?.click(false);
    switch (k) {
      case 'master': IN.master = !IN.master; if (!IN.master) D.wantRun = false; say(`MASTER ${IN.master ? 'ON' : 'OFF'}${!IN.master && M60 ? '  -  TURRET AND SIGHTS DEAD' : ''}`, 1); return;
      case 'start':
        if (fm.eng.running) say('ENGINE RUNNING', 0.9); else if (!IN.master) say('NOTHING  -  THE MASTER SWITCH IS OFF', 1.3); else if (fm.eng.flooded) say('ENGINE DROWNED', 1.2);
        else { IN.fuelOn = true; D.crank = 4; D.wantRun = true; say('STARTER', 0.9); }
        return;
      case 'halon': if (V.fire && V.fire.where) { IN.extinguish = true; say('EXTINGUISHER PULLED', 1); } else say('NO FIRE  -  LEAVE IT', 0.9); return;
      case 'park': IN.park = !IN.park; if (IN.park) IN.range = 'N'; say(IN.park ? 'PARKING BRAKE ON' : 'PARKING BRAKE OFF  -  IT SETS ITSELF WHEN YOU STOP', 1.2); return;
      case 'range': D.key('KeyZ'); return;
      case 'dhatch': case 'lhatch': case 'chatch': case 'cargo': D.key('KeyH'); return;
      case 'tpower': stationPower('gunner'); return;
      case 'stab': D.key('KeyB'); return;
      case 'tts': toggleSight(); return;
      case 'ttsmag': D.key('KeyN'); return;
      case 'ttspol': D.key('KeyU'); return;
      case 'lase': IN.lase = true; return;
      case 'dump': D.key('KeyR'); return;
      case 'ammo': IN.ammo = arg; say(`${ROUNDS[arg].name}  -  LOADER: ${ROUNDS[arg].short} NEXT  (${V.ammoCount(arg)} LEFT)`, 1.3); return;
      case 'rack':   // the loader takes a round of that type out of the ready rack (and rams it if the breech is open)
        if (!(V.racks.readyAmmo[arg] > 0)) { say(`NO ${ROUNDS[arg].short} IN THE READY RACK${V.ammoCount(arg) ? '  -  THE HULL RACKS ARE SLOWER' : ''}`, 1.4); if (!V.ammoCount(arg)) return; }
        IN.ammo = arg; if (V.gun.state === 'empty') D.loadReq = true; else say(`${ROUNDS[arg].short} NEXT  -  THE GUN IS ${V.gun.state === 'ready' ? 'UP' : 'LOADING'}`, 1.1);
        return;
      case 'breech': if (V.gun.state === 'empty') D.loadReq = true; else say(V.gun.state === 'loading' ? 'STILL RAMMING THE ROUND' : 'THE GUN IS ALREADY UP', 1); return;
      case 'override':   // the commander's override: the turret slews to where the cupola looks; the cupola holds its bearing
        if (V.hydP < 0.5) { say('NO TURRET POWER', 1.2); return; }
        D.slewAz = V.az + V.mg50.az; say('COMMANDER: GUNNER, TARGET - ON MY LINE', 1.4); return;
      case 'can50': {
        const m = M60 ? V.mg50 : V.mg, belt = M60 ? 180 : 100;
        if (m.reload) say('ALREADY CHANGING THE CAN', 1); else if (m.ready >= Math.min(belt, m.ammo)) say('THE CAN IS FULL', 0.9); else if (m.ammo <= m.ready) say('NO MORE .50', 1.1); else { m.ready = 0; m.reload = 4; say('NEW CAN ON THE .50', 1.2); }
        return;
      }
      case 'ramp': IN.ramp = !(V.rampWant > 0.5); say(IN.ramp ? 'RAMP DOWN' : 'RAMP UP', 1.1); return;
      case 'vane': IN.vane = !(V.vaneWant > 0.5); say(IN.vane ? 'TRIM VANE UP' : 'TRIM VANE STOWED', 1.1); return;
      case 'pumps': IN.pumps = !V.pumpSwitch; say(`BILGE PUMPS ${IN.pumps ? 'ON' : 'OFF'}`, 1.1); return;
      case 'radio': {
        const e = fm.eng, kill = V.armor.COMPS.filter(c => c.hp <= 0 && c.kind !== 'crew').length;
        ctx.feed?.(`${TY.short} ON THE NET: FUEL ${Math.round(e.fuel / fm.P.FUEL_L * 100)}%${M60 ? `, ${V.ammoTotal()} MAIN GUN ROUNDS` : `, ${V.seats.filter(Boolean).length} DISMOUNTS`}, ${kill ? kill + ' SYSTEMS DOWN' : 'ALL SYSTEMS UP'}, ${e.running ? 'RUNNING' : 'SHUT DOWN'}`, 'good');
        say('RADIO  -  STATUS REPORT SENT', 1); return;
      }
    }
  };
  function hintShort(s) { return s.role === 'driver' ? 'W / S DRIVE  ·  A / D STEER' : s.role === 'gunner' ? 'MOUSE LAYS THE GUN  ·  CLICK FIRES' : s.role === 'commander' ? 'MOUSE AIMS THE .50  ·  CLICK FIRES' : s.role === 'loader' ? 'Q PICKS THE NEXT ROUND' : 'R RAMP  ·  H CARGO HATCH'; }

  // ---------------------------------------------------------------- mouse
  const SENS = 0.0025;
  D.look = (dx, dy) => {
    const s = seatOf();
    if (D.view === 'chase') { D.orbit.yaw -= dx * SENS; D.orbit.pitch = clamp(D.orbit.pitch + dy * SENS, -0.12, 1.2); return; }
    const tcOut = (s.role === 'commander' && M60 && D.hatch.cupola > 0.6) || lookingAbout(s);   // the M60's TC head out / any TC looking about inside (E): the mouse is his head
    if (((s.role === 'gunner' && !D.station) || s.role === 'commander') && !tcOut) {
      const k = s.role === 'gunner' ? sightFov() / 55 : 1;
      if (!D.aim.set) return;
      D.aim.yaw -= dx * SENS * k; D.aim.pitch = clamp(D.aim.pitch - dy * SENS * k, -0.6, 0.9);
      if (s.role === 'commander' && D.hatch[s.hatch] > 0.5) { /* head out: the eye goes with the gun */ }
      return;
    }
    const k = D.binos ? 0.15 : 1;   // through binoculars the hand moves less
    D.head.yaw = clamp(D.head.yaw - dx * SENS * k, tcOut ? -3.1 : -2.6, tcOut ? 3.1 : 2.6); D.head.pitch = clamp(D.head.pitch - dy * SENS * k, -1.0, 0.9);
  };
  function sightFov() { return V.sight === 'tts' ? (V.ttsMag === 3 ? 13.5 : 5.0) : 6.0; }
  const inSight = () => crafts.active === D && D.view === 'eye' && M60 && seatOf().role === 'gunner' && !D.station;
  D.firstPerson = () => D.view === 'eye';
  D.fov = ck => inSight() ? sightFov() : D.binos && D.view === 'eye' ? 7.5 : ck;   // 7x50 binoculars: a 7.5 deg field

  // ---------------------------------------------------------------- cameras
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _t = new THREE.Vector3(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(), _cp = new THREE.Vector3();
  const hullQ = q => q.set(fm.q.x, fm.q.y, fm.q.z, fm.q.w);
  const hullPt = (b, out) => { fm.toWorld(b, _w); return out.set(_w[0], _w[1], _w[2]); };
  const turPt = (p, out) => { V.turretPoint(p, _w); return out.set(_w[0], _w[1], _w[2]); };
  const headOut = s => !!(s.hatch && D.hatch[s.hatch] > 0.6);
  let insideCam = false;
  D.camera = (cam, dt, view) => {
    const s = seatOf(); insideCam = false;
    const released = !view || !view.locked;
    if (released && !D.binos && !(s.role === 'gunner' && !D.station) && (s.role !== 'commander' || (M60 && D.hatch.cupola > 0.6) || lookingAbout(s))) { const k = Math.exp(-4 * dt); D.head.yaw *= k; D.head.pitch *= k; }
    if (D.view === 'chase') { chase(cam, dt, view); return; }
    hullQ(_q);
    if (s.role === 'driver') {
      const eye = M60 ? TANK.DRIVER_EYE : M113_EYES.driver, out = headOut(s);
      hullPt(out ? [eye[0], eye[1] + (M60 ? 0.58 : 0.52), eye[2] + 0.05] : eye, cam.position); insideCam = !out;
      cam.quaternion.copy(_q).multiply(_q2.setFromEuler(_e.set(D.head.pitch - (out ? 0.06 : 0.12), D.head.yaw, 0, 'YXZ')));
    } else if (s.role === 'gunner') {
      if (D.station) {
        turPt(TANK.GUNNER_EYE_T, cam.position); insideCam = true;
        cam.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(_v.set(0, 1, 0), V.az)).multiply(_q2.setFromEuler(_e.set(D.head.pitch - 0.1, D.head.yaw, 0, 'YXZ')));
      } else {   // the sight picture: along the sight line from the sight head, the hull's up
        turPt([0.62, 1.07, -1.06], cam.position); insideCam = true;   // at the sight head (the TTS housing window, right of the searchlight): from inside the turret the shield, the searchlight and the dust cover crossed the picture as a band
        V.sightDir(_d); _t.set(cam.position.x + _d[0], cam.position.y + _d[1], cam.position.z + _d[2]);
        fromHull(0, 1, 0, _w); _up.set(_w[0], _w[1], _w[2]);
        _m.lookAt(cam.position, _t, _up); cam.quaternion.setFromRotationMatrix(_m);
      }
    } else if (s.role === 'commander') {
      const out = headOut(s);
      if (M60) {
        const cu = TANK.COMMANDER_EYE_T; turPt([cu[0], 1.09 + (out ? 0.62 : 0), cu[2]], cam.position); insideCam = !out;
        if (out) cam.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(_v.set(0, 1, 0), V.az)).multiply(_q2.setFromEuler(_e.set(D.head.pitch - 0.06, D.head.yaw, 0, 'YXZ')));   // standing in the cupola, looking about
        else if (D.station) cam.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(_v.set(0, 1, 0), V.az + V.mg50.az)).multiply(_q2.setFromEuler(_e.set(D.head.pitch - 0.1, D.head.yaw, 0, 'YXZ')));   // looking about inside the cupola (E)
        else cam.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(_v.set(0, 1, 0), V.az + V.mg50.az)).multiply(_q2.setFromEuler(_e.set(V.mg50.el * 0.6 - 0.04, 0, 0, 'YXZ')));   // the vision blocks / M28 sight turn with the cupola
      } else {   // M113: standing in the cupola behind the M2's spade grips; the eye turns with the cupola
        const pv = V.fm.P.MG.PIVOT, ca = Math.cos(V.mg.az), sa = Math.sin(V.mg.az);
        hullPt(out ? [pv[0] + sa * 0.2, 2.4, pv[2] + ca * 0.2] : [pv[0] + sa * 0.2, 1.95, pv[2] + ca * 0.2], cam.position); insideCam = !out;   // (forward of the hatch hinge: the open lid lies back behind him)
        if (!out && D.station) { hullPt([pv[0], 1.9, pv[2] + 0.1], cam.position); cam.quaternion.copy(_q).multiply(_q2.setFromEuler(_e.set(D.head.pitch - 0.1, D.head.yaw + Math.PI, 0, 'YXZ'))); }   // down inside, looking about the compartment (E): faces aft, the squad
        else cam.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(_v.set(0, 1, 0), V.mg.az)).multiply(_q2.setFromEuler(_e.set(V.mg.el * 0.8 - 0.06, 0, 0, 'YXZ')));
      }
    } else if (s.role === 'loader') {
      const out = headOut(s);
      turPt(out ? [-0.62, 1.55, 0.15] : [-0.6, 0.62, 0.05], cam.position); insideCam = !out;
      cam.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(_v.set(0, 1, 0), V.az)).multiply(_q2.setFromEuler(_e.set(D.head.pitch - 0.05, D.head.yaw, 0, 'YXZ')));
    } else {   // M113 troops: on the bench by the ramp, or standing in the cargo hatch
      const out = headOut(s), e = M113_EYES.troops;
      hullPt(out ? [((s.troop % 2) ? 0.35 : -0.35), 2.45, 1.35] : e, cam.position); insideCam = !out;
      cam.quaternion.copy(_q).multiply(_q2.setFromEuler(_e.set(D.head.pitch - 0.05, D.head.yaw + (out ? 0 : 0), 0, 'YXZ')));
    }
    if (insideCam || headOut(s)) { const sh = Math.min(0.012, Math.abs(fm.out.fwd) * 0.0009); cam.position.y += (Math.random() - 0.5) * sh; }
  };
  const _gp = [0, 0, 0];
  function chase(cam, dt, view) {
    const s = seatOf(), yaw = heading() + D.orbit.yaw, d = TY.chase, up = 2.2 + d * Math.sin(D.orbit.pitch);
    fm.origin(_o);
    _cp.set(_o[0] + Math.sin(yaw) * d * Math.cos(D.orbit.pitch), _o[1] + up, _o[2] + Math.cos(yaw) * d * Math.cos(D.orbit.pitch));
    { const g = ctx.ground(_cp.x, _cp.z); if (_cp.y < g + 1.6) _cp.y = g + 1.6; }
    if (!D._chase) D._chase = _cp.clone(); else D._chase.lerp(_cp, 1 - Math.exp(-7 * dt));
    if (D._chase.distanceTo(_cp) > 30) D._chase.copy(_cp);
    cam.position.copy(D._chase); GR?.clearView?.(_o[0], _o[1] + 2.2, _o[2], cam.position, D);
    const g = ctx.ground(cam.position.x, cam.position.z); if (cam.position.y < g + 0.8) cam.position.y = g + 0.8;
    cam.lookAt(_o[0], _o[1] + 2.0, _o[2]);
    cam.quaternion.multiply(_q2.setFromAxisAngle(_v.set(1, 0, 0), 0.12));   // look a little over the vehicle
    // the gunner (or the .50) in the chase view lays on what the camera centre is on
    if ((s.role === 'gunner' && M60) || s.role === 'commander') {
      cam.getWorldDirection(_v);
      const sp = s.role === 'gunner' ? V.turretPoint([0.55, 0.85, -0.9], _gp) : fm.toWorld(M60 ? [0.6, 3.3, 0.2] : V.fm.P.MG.PIVOT, _gp);
      const r0 = env.raycast([cam.position.x, cam.position.y, cam.position.z], [_v.x, _v.y, _v.z], 2500, true), r = r0 && r0 > TY.chase + 4 ? r0 : null;   // (the ground short of the vehicle is not a target)
      const tx = cam.position.x + _v.x * (r || 2500), ty = cam.position.y + _v.y * (r || 2500), tz = cam.position.z + _v.z * (r || 2500);
      const dx = tx - sp[0], dy = ty - sp[1], dz = tz - sp[2], l = Math.hypot(dx, dy, dz) || 1;
      D.aim.yaw = Math.atan2(-dx, -dz); D.aim.pitch = Math.asin(dy / l); D.aim.set = true; D.aimRange = r;
    }
    if (!view || !view.locked) D.orbit.yaw *= Math.exp(-1.2 * dt);
  }

  // ---------------------------------------------------------------- hatches, model, interiors, effects, sound
  function hatches(dt) {
    for (const k in D.hatch) {
      const was = D.hatch[k]; D.hatch[k] += clamp(D.hatchWant[k] - was, -dt / 0.8, dt / 0.8);
      // the hatch slams shut on its stop / the lock releases and the spring lifts it (the one you are in, or one near you)
      if (audio && audio.built && crafts.active === D && ((was > 0.02 && D.hatch[k] <= 0.02) || (was < 0.02 && D.hatch[k] >= 0.02))) audio.hatch(D.hatch[k] <= 0.02, k === seatOf().hatch);
    }
  }
  const travel = [new Array(fm.wheels[0].length).fill(0), new Array(fm.wheels[1].length).fill(0)];
  const fxT = { smoke: 0, dust: 0, wake: 0 };
  const _sp = new THREE.Vector3();
  let drew = false;
  D.render = (dt, time, fp) => {
    if (!D.exists) { model.group.visible = false; if (drew) { SG.draw(null); drew = false; } return; }
    const active = crafts.active === D, s = seatOf();
    fm.origin(_o);
    {   // far away and nobody in it: hidden past 900 m (fog), the running gear left still past 250 m (cheap)
      const cr = ctx.camZ(), dR = cr ? Math.hypot(cr.position.x - _o[0], cr.position.z - _o[2]) : 0;
      if (!active && dR > 900) { model.group.visible = false; if (audio && audio.built) audio.out.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.2); if (drew && !(crafts.active && crafts.active.type)) { SG.draw(null); drew = false; } return; }
      if (!active && dR > 250 && D.asleep && !st.plat && D._posed) { model.group.visible = true; return; }
    }
    model.group.visible = true; model.group.position.set(_o[0], _o[1], _o[2]); model.group.quaternion.set(fm.q.x, fm.q.y, fm.q.z, fm.q.w); D._posed = D.asleep;
    for (let i = 0; i < 2; i++) for (let k = 0; k < travel[i].length; k++) { const w = fm.wheels[i][k]; travel[i][k] = w.on ? w.s : Math.min(w.s, 0); }
    const inside = active && D.view === 'eye' && insideCam;
    if (M60) model.animate({ travel, trackPos: fm.trackPos, thrown: fm.dmg.thrown, az: V.az, el: V.el, recoil: V.gun.recoil, cupAz: V.mg50.az, mgEl: V.mg50.el, hatches: D.hatch, tts: V.power ? 1 : 0, light: 0, inside });
    else model.animate({ travel, trackPos: fm.trackPos, thrown: fm.dmg.thrown, mgAz: V.mg.az, mgEl: V.mg.el, ramp: V.ramp, vane: V.vane, hatches: D.hatch, inside });
    poseCrew(active, s);
    if (inSight()) model.group.visible = false;   // looking through the sight head: none of the own tank in the picture (the needle nose, the searchlight and the shield crossed it)
    // interiors: only the station the player looks out of
    if (M60) {
      interior.group.visible = active && D.view === 'eye' && s.role === 'driver' && inside;
      interior.gunner.visible = active && D.view === 'eye' && ((s.role === 'gunner' && D.station) || (s.role === 'loader' && inside));
      interior.commander.visible = active && D.view === 'eye' && s.role === 'commander' && inside;
      if (interior.group.visible || interior.gunner.visible || interior.commander.visible) interior.update(V, IN, dt);
    } else {
      interior.driver.visible = active && D.view === 'eye' && s.role === 'driver' && inside;
      interior.troops.visible = active && D.view === 'eye' && (s.role === 'troop' || (inside && (s.role === 'driver' || s.role === 'commander')));
      if (interior.driver.visible || interior.troops.visible) interior.update(V, IN, dt);
    }
    if (active) {   // the controls (hover frame, switch positions, the ready rack) and the crew in the fighting compartment
      const cw = k => k !== s.role && crewOk(k) ? (k === 'gunner' ? 'in' : D.hatch[k === 'commander' ? 'cupola' : k] > 0.85 ? 'up' : 'in') : null;
      ST.update({ hover: inside && ctx.hover ? ctx.hover() : null, V, IN, D, crewIn: M60 ? { gunner: cw('gunner'), commander: cw('commander'), loader: cw('loader') } : {} });
    } else ST.clear();
    model.group.userData.heat = D.dead ? (D.wreckT < 150 ? 0.95 : 0.5) : fm.eng.running ? 0.5 : 0.4;
    if (D.burnAt) { D.burnAt.x = _o[0]; D.burnAt.y = _o[1] + 1.8; D.burnAt.z = _o[2]; }
    // exhaust, dust, wake
    const e = fm.eng, load = e.running ? e.load * Math.min(1, e.w * 9.549 / 1500) : 0, v = Math.abs(fm.out.fwd);
    fxT.smoke -= dt; fxT.dust -= dt; fxT.wake -= dt;
    if (e.running && fxT.smoke <= 0) {
      fxT.smoke = load > 0.3 ? 0.1 / load : 0.5;
      fm.toWorld(M60 ? [(Math.random() < 0.5 ? -1 : 1) * 1.05, 2.0, 2.85] : [0.95, 1.7, -1.9], _w);
      const g = load > 0.8 ? 0.27 : 0.42; fx.mix.spawn(_w[0], _w[1], _w[2], (Math.random() - 0.5) * 0.6, 0.8 + load, (Math.random() - 0.5) * 0.6, 1.5 + load, 0.35 + 0.4 * load, 1.6 + 2.5 * load, g, g, g * 0.98, 0.18 + 0.3 * load, -0.2, 0.8, 1.2);
    }
    const dry = fm.soil.some(x => x === 'dirt' || x === 'sand') && fm.water.depth < 0.1;
    if (dry && v > 2.5 && fxT.dust <= 0) {
      fxT.dust = 0.6 / v; const sd = Math.random() < 0.5 ? -1 : 1;
      fm.toWorld([sd * fm.P.TRACK.GAUGE / 2, 0.35, fm.P.TRACK.REAR.z + 0.5], _w);
      const sand = fm.soil[0] === 'sand'; fx.mix.spawn(_w[0], _w[1], _w[2], (Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5, 2 + Math.random() * 1.5, 0.9 + v * 0.08, 3.5 + v * 0.2, sand ? 0.7 : 0.55, sand ? 0.64 : 0.48, sand ? 0.48 : 0.36, 0.42, 0.2, 1.4, 0.7);
    }
    if (fm.water.depth > 0.3 && v > 0.6 && fxT.wake <= 0) { fxT.wake = 0.25; fm.toWorld([0, 0, TY.L * 0.45], _w); fx.wake(_w[0], _w[2], fm.water.afloat ? 1.2 : 0.8); if (fm.water.afloat) fm.toWorld([0, 0.6, -TY.L * 0.5], _w), fx.mix.spawn(_w[0], 0.25, _w[2], (Math.random() - 0.5), 1.5, (Math.random() - 0.5), 0.8, 0.5, 1.6, 0.85, 0.92, 0.97, 0.5, 6, 0.8); }
    if (D.dead && D.wreckT > 150 && Math.random() < 0.06) fx.trail(_o[0], _o[1] + 2, _o[2], 1.2);
    // sound: the one you are in, or a running one you can hear
    const cam = ctx.camZ(), dist = cam ? Math.hypot(cam.position.x - _o[0], cam.position.z - _o[2]) : 0;
    const a = (active || (fm.eng.running && dist < 350) || D.crank > 0) ? snd() : audio;
    if (a && a.built) { if (active || dist < 350) a.update(V, type, { inside: active && (inside || inSight()), cam: cam ? cam.position : null }); else a.out.gain.setTargetAtTime(0, a.ctx.currentTime, 0.2); }
    // the sight / reticle overlay
    if (active) { drawOverlay(cam); drew = true; } else if (drew && !(crafts.active && crafts.active.type)) { SG.draw(null); drew = false; } else drew = false;
  };
  function drawOverlay(cam) {
    const s = seatOf();
    if (inSight()) { SG.draw({ mode: V.sight === 'tts' ? 'tts' : 'day', fov: sightFov(), V, note: V.hydP < 0.5 ? 'TURRET POWER OFF  -  HANDWHEELS' : '' }); return; }
    if (D.binos && D.view === 'eye' && headOut(s)) { SG.draw({ mode: 'binos', fov: 7.5 }); return; }
    if (D.binos && !headOut(s)) D.binos = false;
    if (D.view === 'chase' && ((s.role === 'gunner' && M60) || s.role === 'commander')) {
      // where the gun (or the .50) is laid: project its line's ground point onto the screen
      const gd = s.role === 'gunner' ? V.gunDir(_d) : azelDir(M60 ? V.az + V.mg50.az : V.mg.az, M60 ? V.mg50.el : V.mg.el, _d);
      const p0 = s.role === 'gunner' ? V.muzzle(_gp) : fm.toWorld(M60 ? [0.6, 3.3, 0.2] : V.fm.P.MG.PIVOT, _gp);
      const r = env.raycast(p0, gd, 2500, true) || 1500;
      _sp.set(p0[0] + gd[0] * r, p0[1] + gd[1] * r, p0[2] + gd[2] * r).project(cam);
      const on = _sp.z < 1 && Math.abs(_sp.x) < 1.2 && Math.abs(_sp.y) < 1.2;
      const lbl = s.role === 'gunner' ? `${ROUNDS[V.gun.round || V.next].short} ${V.gun.state === 'ready' ? 'READY' : V.gun.state === 'loading' ? 'LOADING' : 'EMPTY'}  ${Math.round(r)} m` : `.50  ${M60 ? V.mg50.ready : V.mg.ready}`;
      SG.draw({ mode: 'chase', fov: cam.fov, aim: true, gun: on ? [(_sp.x + 1) / 2 * innerWidth, (1 - _sp.y) / 2 * innerHeight] : null, ready: s.role !== 'gunner' || V.gun.state === 'ready', label: lbl });
      return;
    }
    SG.draw(null);
  }
  // the TTS thermal picture replaces the frame (main.js: renderView hook)
  D.renderView = (renderer, scene, cam) => {
    if (!inSight() || V.sight !== 'tts' || V.ttsCool < 0.95) return false;
    SG.thermal(renderer, scene, cam, { pol: V.ttsPolarity === 'bh', time: performance.now() / 1000, tag: tagHeat });
    return true;
  };
  function tagHeat() {   // war units and structures that carry no heat of their own: machines hot, ships warm
    for (const u of war.units) if (u.mesh && u.mesh.userData.heat == null) u.mesh.userData.heat = u.side === 2 ? (u.dims ? 0.55 : 0.82) : u.dims ? 0.48 : 0.7;
    for (const I of war.islands || []) for (const s of I.structs) if (s.mesh && s.mesh.userData.heat == null) s.mesh.userData.heat = s.kind === 'aa' ? 0.62 : s.side === 2 ? 0.66 : 0.46;
  }
  D.silence = () => { if (audio && audio.built) audio.out.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.05); };

  // ---------------------------------------------------------------- HUD
  const KM = v => Math.round(Math.abs(v) * 3.6);
  D.hud = () => {
    const s = seatOf(), e = fm.eng;
    const kill = V.armor ? (() => { const k = V.armor.COMPS.filter(c => c.hp <= 0 && c.kind !== 'crew').map(c => COMP_NAME[c.id] || c.id); return k.length ? k.slice(0, 2).join(', ') + ' OUT' : 'OK'; })() : 'OK';
    const water = fm.water.afloat ? `  ·  AFLOAT ${(Math.abs(fm.out.fwd) * 3.6).toFixed(1)} km/h${fm.water.inside > 0.05 ? `  ·  WATER IN ${fm.water.inside.toFixed(1)} m³` : ''}` : fm.water.depth > 0.1 ? `  ·  FORDING ${fm.water.depth.toFixed(1)} m` : '';
    const surf = st.plat ? (st.plat.type === 'carrier' ? 'ALBATROSS DECK' : st.plat.name || 'DECK') : (fm.soil[0] || '').toUpperCase();
    let line = `${TY.label}  ·  ${s.label}  ·  ${KM(fm.out.fwd)} km/h ${fm.range}${IN.park ? ' P' : ''}  ·  ${e.running ? `${Math.round(e.w * 9.549)} RPM` : e.flooded ? 'ENGINE DROWNED' : IN.master ? 'ENGINE OFF' : 'COLD - MASTER OFF'}  ·  ${surf}${water}  ·  ${D.dead ? D.why : kill}`;
    if (M60) line += `  ·  TURRET ${String((Math.round(-V.az / D2R) % 360 + 360) % 360).padStart(3, '0')}°  ·  ${V.stabMode || ''}`;
    const hint = D.dead ? 'KNOCKED OUT  -  Y TO GET OUT' : fm.eng.flooded ? 'ENGINE DROWNED  -  GET OUT' :
      s.role === 'driver' ? `W / S DRIVE  ·  A / D STEER (R-SHIFT: FULL)  ·  SPACE BRAKE  ·  Z ${D.lowRange ? 'HIGH' : 'LOW'} RANGE  ·  H HATCH  ·  I ${fm.eng.running ? 'ENGINE OFF' : 'MASTER + START'}${M60 ? '' : '  ·  R RAMP  ·  N VANE  ·  B PUMPS'}  ·  V VIEW  ·  [ ] SEAT  ·  Y OUT` :
      s.role === 'gunner' ? (D.view === 'chase' ? 'MOUSE: LAY THE GUN ON THE RING  ·  CLICK / F FIRE  ·  G COAX  ·  T LASE  ·  Q ROUND  ·  V SIGHT  ·  W A S D: DRIVER' : `MOUSE / ARROWS LAY  ·  CLICK / F FIRE  ·  G COAX  ·  T LASE  ·  R DUMP  ·  Q ROUND  ·  O DAY / TTS  ·  N 3X / 8X  ·  U WH / BH  ·  B STAB  ·  I TURRET POWER  ·  E LOOK UP  ·  W A S D: DRIVER`) :
      s.role === 'commander' ? (M60 && D.hatch.cupola > 0.6 ? 'HEAD OUT  -  MOUSE LOOKS  ·  C BINOCULARS  ·  E LOOK ABOUT  ·  H BUTTON UP (THE M85 FIRES FROM INSIDE)  ·  Q ROUND  ·  V VIEW  ·  W A S D: DRIVER  ·  [ ] SEAT  ·  Y OUT' : lookingAbout(s) ? 'LOOKING ABOUT  -  CLICK THE CONTROLS  ·  E BACK ON THE GUN  ·  H HATCH  ·  W A S D: DRIVER  ·  [ ] SEAT  ·  Y OUT' : `MOUSE: THE .50  ·  CLICK / F FIRE  ·  E LOOK ABOUT  ·  H ${M60 ? 'HEAD OUT' : 'HATCH'}${M60 ? '  ·  Q ROUND' : '  ·  C BINOCULARS  ·  R RAMP  ·  N VANE  ·  B PUMPS'}  ·  V VIEW  ·  W A S D: DRIVER  ·  [ ] SEAT  ·  Y OUT`) :
      s.role === 'loader' ? `${V.gun.state === 'empty' ? 'GUN EMPTY  -  CLICK THE RACK OR F: LOAD' : V.gun.state === 'loading' ? 'RAMMING THE ROUND' : 'UP'}  ·  Q NEXT ROUND (SABOT / HEAT / HEP)  ·  H HATCH  ·  C BINOCULARS  ·  V VIEW  ·  W A S D: DRIVER  ·  [ ] SEAT  ·  Y OUT` :
      'R RAMP  ·  H STAND UP IN THE CARGO HATCH  ·  V VIEW  ·  W A S D: DRIVER  ·  [ ] SEAT  ·  Y OUT BY THE RAMP';
    let weap;
    if (M60) { const g = V.gun, r = V.racks, sum = k => Object.values(r[k]).reduce((a, b) => a + b, 0); weap = `${g.round ? ROUNDS[g.round].short + ' ' : ''}${g.state === 'ready' ? 'READY' : g.state === 'loading' ? `LOADING ${Math.round(100 * g.loadT / Math.max(0.1, g.loadNeed))}%` : 'EMPTY'}  ·  NEXT ${ROUNDS[IN.ammo].short} ${V.ammoCount(IN.ammo)}  ·  RACKS ${sum('readyAmmo')} / ${sum('hullAmmo')} / ${sum('floorAmmo')}  ·  COAX ${V.coax.ammo}  ·  .50 ${V.mg50.ready}/${V.mg50.ammo}${V.laser.range ? `  ·  RANGE ${V.laser.range}` : ''}`; }
    else weap = `.50 CAL ${V.mg.ready}/${V.mg.ammo}  ·  TROOPS ${V.seats.filter(Boolean).length}  ·  RAMP ${V.ramp > 0.95 ? 'DOWN' : V.ramp < 0.05 ? 'UP' : '...'}  ·  VANE ${V.vane > 0.95 ? 'UP' : 'STOWED'}  ·  PUMPS ${fm.water.pumps ? 'ON' : 'OFF'}`;
    const hv = ctx.hover ? ctx.hover() : null;
    return { line, hint: hv && D.cockpitObj() ? `${ST.labelOf(hv)}  -  CLICK` : hint, weap, fuel: e.fuel / fm.P.FUEL_L * 100, fuelLabel: 'DIESEL' };
  };
  D.menuNote = () => `${TY.short}  ${Math.round(fm.eng.fuel)} L DIESEL${M60 ? `  ·  ${V.ammoTotal()} ROUNDS` : ''}${D.dead ? '  ·  ' + D.why : ''}`;
  return D;
}
