// wheeledcraft.js - a WHEELED vehicle (M151A2, M35A2, Land Rover 109, Hilux, Beetle, Lada 2101) as a FOUNDATION craft
// (craft.js) in the real game (ngc/wheeledgame). It replaces the placeholder TEST CAR: the pure vehiclefm.js sim (Pacejka
// tyres, quarter-car suspension, exact drivetrain, fording) driven through driver.js, the WHEELED models and interiors
// with live gauges, seats with doors (driver, passengers, the M151's M60 pedestal, the M35's ring-mount M2 and troop
// benches), the Marine getting in and out with his kit and wounds, deck riding (platform.js), the world through
// wheeledenv.js, damage both ways (vehicledamage.js), wrecks, HUD lines and the controls (keyboard with steering that
// narrows with speed, mouse, gamepad, HOTAS through CTL).
//
//   const V = createWheeledCraft(ctx, 'm151', { id, variant, colour });   crafts.register(V);   V.spawnAt({ x, y, z, yaw, plat })
// ctx (motorpool.js builds it): { scene, GR, crafts, war, fx, sfx, say, feed, keyDown, CTL, hwOn, camZ, WENV, guns, audio,
//   crewHit(amount, why, at, dir, kind), crewBurn(hp, why), rideTick(dt), models (cache), onEvent(V, e) }
// The physics runs in fixed 1/60 s steps (vehiclefm subdivides further); a slow frame takes several steps (max 15).
import * as THREE from 'three';
import { createWheeledSim } from './index.js';
import { buildM151Mesh } from './m151model.js';
import { buildM35Mesh } from './m35model.js';
import { buildCivMesh } from './civmodel.js';
import { buildInterior } from './interior.js';
import { lookFrom, charModel } from './modelkit.js';
import { bakeModel } from './wheeledbake.js';
import { createMountedGun, GUN } from './vehicleguns.js';
import { buildMarine } from '../air/rotary/figures.js';
import { createCabin } from './cabin.js';
import { createWheelInput, WHEEL_ID } from './wheelinput.js';
// one racing wheel for every vehicle (it learns its pedals' rest values once); the pads are read once per frame
const WHEEL = createWheelInput({ store: { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } } } });
let wheelT = -1, wheelR = null;
const readWheel = input => { if (input && input.keyboardOnly) return null; const t = performance.now(); if (t !== wheelT) { wheelT = t; try { wheelR = WHEEL.read(navigator.getGamepads ? Array.from(navigator.getGamepads() || []) : []); } catch (e) { wheelR = null; } } return wheelR; };

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const STEP = 1 / 60;
// per type: the HUD label, model variant, the gun seat, which of the spec's seats the craft offers (M35: six of the
// sixteen troop places, three a side), the materiel cost of a delivery
export const TYPES = {
  m151: { label: 'M151A2 MUTT', mil: true, variant: { top: 'off', mount: 'm60', screen: 'up' }, cost: 10,
    gun: { seat: 'gunner', spec: GUN.M60, pivot: [0, 1.40, 0.62], muzzle: [0, 0.04, -1.02], eye: [0.06, 0.34, 0.78], elev: [-0.28, 0.75], stand: [0, 0.45, 1.05] } },
  m35: { label: 'M35A2', mil: true, variant: { ring: true, cover: 'bows', seats: 'down' }, cost: 20, troops: ['troop0', 'troop3', 'troop6', 'troop8', 'troop11', 'troop14'],
    gun: { seat: 'ring', spec: GUN.M2, ring: [0.48, 2.62, -0.95], arm: [0, 0.12, -0.52], muzzle: [0, 0.07, -1.45], eye: [0, 0.55, 1.1], elev: [-0.22, 1.0], stand: [0.48, 1.42, -0.42] } },
  landrover: { label: 'LAND ROVER 109', civ: true }, hilux: { label: 'TOYOTA HILUX', civ: true },
  beetle: { label: 'VW BEETLE', civ: true }, lada: { label: 'LADA 2101', civ: true },
};
const SEAT_LABEL = { driver: 'DRIVER', front: 'FRONT SEAT', mid: 'MIDDLE SEAT', rearL: 'REAR SEAT', rearR: 'REAR SEAT', bed: 'IN THE BED', gunner: 'M60 GUNNER (PEDESTAL)', ring: 'M2 GUNNER (RING MOUNT)' };
let SERIAL = 0;

// the craft's seats (FOUNDATION form: id, label, role, eye, door, exit, local frame x right, y up, -z forward) from the
// spec's seats: doors beside the seat, the M151's gunner and the M35's troops at the back, the Hilux bed over the side
function craftSeats(type, spec) {
  const T = TYPES[type], hw = spec.dims.W / 2, zs = spec.hull.map(p => p[2]), back = Math.max(...zs);
  const list = spec.seats.filter(s => s.role !== 'troop' || (T.troops && T.troops.includes(s.id))).filter(s => s.role !== 'gunner' || (T.gun && T.gun.seat === s.id));
  return list.map(s => {
    const side = Math.sign(s.at[0]) || 0;
    let door, exit;
    if (s.role === 'troop') { const k = Math.sign(s.at[0]); door = [k * 0.45, 1.25, back + 0.35]; exit = [k * 0.55, 0, back + 1.25]; }
    else if (side === 0 && s.at[2] > 0.3) { door = [0, s.at[1] + 0.3, back + 0.4]; exit = [0, 0, back + 1.15]; }
    else { const k = side || 1; door = [k * (hw + 0.35), s.at[1] + 0.3, s.at[2]]; exit = [k * (hw + 0.95), 0, s.at[2]]; }
    const tn = s.role === 'troop' ? T.troops.indexOf(s.id) : -1;
    const label = s.role === 'troop' ? `BENCH ${s.at[0] < 0 ? 'LEFT' : 'RIGHT'} ${['FRONT', 'MIDDLE', 'REAR'][tn % 3]}` : SEAT_LABEL[s.id] || s.id.toUpperCase();
    return { id: s.id, sid: s.id, label, role: s.role === 'troop' ? 'passenger' : s.role, eye: s.eye, at: s.at, face: s.face || 0, door, exit, reach: 2.4 };
  });
}

// shared, lazily built far-LOD meshes (one per type + colour)
const FAR = new Map();
function farGeo(type, colour, variant) {
  const key = `${type}:${colour}:${JSON.stringify(variant)}`;
  if (!FAR.has(key)) { const m = buildModel(type, colour, variant); FAR.set(key, bakeModel(m.group, {})); m.group.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose?.(); }); }
  return FAR.get(key);
}
export function buildModel(type, colour = 0, variant = {}) {
  const T = TYPES[type];
  const v = { ...T.variant, ...variant };
  if (type === 'm151') return buildM151Mesh(v);
  if (type === 'm35') return buildM35Mesh(v);
  return buildCivMesh({ spec: specOf(type), colour, ...v });
}
const SPECS = {};
const specOf = type => SPECS[type] || (SPECS[type] = createWheeledSim(type).spec);
const farMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

export function createWheeledCraft(ctx, type, o = {}) {
  const { scene, GR, crafts, fx, say } = ctx, kd = ctx.keyDown;
  const T = TYPES[type]; if (!T) throw new Error('wheeled type ' + type);
  const W = createWheeledSim(type, { mode: 'auto' }), S = W.sim, spec = S.spec, D = W.driver, dmg = W.dmg;
  const id = o.id || `${type}${++SERIAL}`;
  const variant = { ...T.variant, ...(o.variant || {}) }, colour = o.colour ?? 0;
  const zs = spec.hull.map(p => p[2]), zc = (Math.min(...zs) + Math.max(...zs)) / 2, HL = (Math.max(...zs) - Math.min(...zs)) / 2 + 0.05, HW = spec.dims.W / 2, HT = spec.dims.H;
  const V = {
    id, type, label: T.label, kind: 'ground', sim: S, spec, driver: D, dmg, T,
    seats: craftSeats(type, spec), seat: 0, exists: false, view: 'first', head: { yaw: 0, pitch: 0 }, orbit: { yaw: 0, pitch: 0.2 },
    acc: 0, asleep: false, sleepT: 0, traffic: null, owner: o.owner || (T.civ ? 'civ' : 'mil'), colour, variant,
    model: null, interior: null, far: null, gun: T.gun ? createMountedGun(T.gun.spec) : null, aim: { yaw: 0, pitch: 0 },
    crank: 0, deckV: [0, 0, 0], P: { x: 0, y: 0, z: 0, yaw: 0, plat: null, loc: null, carried: null },
    near: false, boxes: null, circles: null, onBridge: null, bridgeRoad: null, deckLevel: undefined, troops: 0, wrecked: false, lod: 'near',
    events: [], steer: 0, thr: 0, brk: 0, mode: 'auto', fwd: false, range: 'H', kit: false, lights: false, horn: false,
  };
  V.self = V;
  V.cabin = createCabin(V, ctx);
  // the cab's switches for main.js's switch ray (look at one and click, as in the jets): first person in this vehicle
  V.switches = () => crafts.active === V && V.view === 'first' && V.model && V.model.group.visible ? { group: V.model.group, hitBoxes: V.cabin.hitBoxes } : null;
  V.click = id => V.cabin.click(id);
  const env = ctx.WENV.forVehicle(V);
  V.env = env;
  // ---------------------------------------------------------------- model, interior, figures (built when first needed)
  function ensureModel() {
    if (V.model) return;
    const M = ctx.models && ctx.models.take(type, colour) || buildModel(type, colour, variant);
    V.model = M; M.setVariant?.(variant); scene.add(M.group);
    try { V.interior = M._interior || (M._interior = buildInterior(spec, M)); } catch (e) { console.warn('interior', e.message); }
    try { V.cabin.attach(M, V.interior); } catch (e) { console.warn('cabin', e.message); }
    M.group.visible = false;
    if (V.wrecked) charModel(M.group, true);
  }
  function ensureFar() { if (!V.far) { V.far = new THREE.Mesh(farGeo(type, colour, variant), farMat); V.far.matrixAutoUpdate = true; scene.add(V.far); V.far.visible = false; } }
  const figs = { me: null, crew: [], civ: null };
  function figure(kind) {
    if (kind === 'civ') {   // a civilian at the wheel: shirt and head (the WORLD's people are as simple)
      const g = new THREE.Group(), shirt = [0xc84a3a, 0x3a5a9a, 0xe8d06a, 0x6a9a5a, 0xf0f0ea, 0x8a4a8a][Math.floor(Math.random() * 6)];
      const m = new THREE.MeshLambertMaterial({ color: shirt, flatShading: true }), sk = new THREE.MeshLambertMaterial({ color: 0xc89a78, flatShading: true });
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.24), m); t.position.y = 0.33; g.add(t);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), sk); h.position.y = 0.72; g.add(h);
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 4, 0, Math.PI * 2, 0, 1.4), new THREE.MeshLambertMaterial({ color: 0x3a2a1e })); hair.position.y = 0.74; g.add(hair);
      return { group: g, pose() {} };
    }
    const f = buildMarine({ variant: 0, scale: 1 }); return f;
  }
  // ---------------------------------------------------------------- presence, frames
  V.present = () => V.exists;
  V.frame = out => { out.x = S.pos[0]; out.y = S.pos[1]; out.z = S.pos[2]; out.yaw = -S.heading; return out; };
  V.spawnAt = (sp, opt = {}) => {
    const y = sp.y ?? GR.floor(sp.x, sp.z, 1e4, 1e5);
    S.reset([sp.x, y, sp.z], sp.yaw ?? 0, { running: !!opt.running, fuel: opt.fuel });
    V.P.plat = sp.plat || null; V.P.loc = null; V.deckLevel = sp.plat ? y : undefined;
    ctx.WENV.frame(V); S.placeOnGround(env); D.reset(S);
    if (spec.brakes.air) S.airPsi = spec.brakes.air.max;   // parked with its air tanks up (an M35 that has to wait for air won't hold on a slope)
    V.auto = null;   // a test autopilot ends with a teleport
    dmg.repair('all'); V.wrecked = false; V.exists = true; V.acc = 0; V.asleep = false; V.sleepT = 0; V.crank = 0; V.burnFx = null;
    if (V.model) charModel(V.model.group, false);
    // settle onto the springs for a moment, then onto the deck
    const c0 = { ...PARK, ignition: !!opt.running, clutch: opt.running ? 1 : PARK.clutch };
    for (let i = 0; i < 30; i++) { S.step(STEP, c0, env); }
    inp.ignition = !!opt.running; inp.handbrake = opt.launch ? 0 : 1;
    syncP(); GR.settle(V.P, true);
    if (opt.launch) { S.launch(opt.launch.v, opt.launch.gear); D.reset(S); }
    return V;
  };
  V.stow = () => { V.exists = false; if (V.model) V.model.group.visible = false; if (V.far) V.far.visible = false; hideFigs(); };
  V.dispose = () => { V.stow(); if (V.model) { scene.remove(V.model.group); ctx.models?.give(type, colour, V.model); V.model = null; V.interior = null; } if (V.far) { scene.remove(V.far); V.far = null; } for (const f of [figs.me, figs.civ, ...figs.crew]) if (f) scene.remove(f.group); };
  // ---------------------------------------------------------------- seats, getting in and out
  const seatOf = i => V.seats[i] || V.seats[0];
  const isDriver = () => seatOf(V.seat).role === 'driver';
  const isGunner = () => !!(V.gun && seatOf(V.seat).sid === T.gun.seat);
  let occ = null;
  const occupy = sid => { if (occ) dmg.setOccupant(occ, false); occ = sid; if (sid) dmg.setOccupant(sid, true); };
  V.enter = (seat = 0, from) => {
    if (!V.exists) return false;
    if (V.wrecked) { say(`THE ${T.label} IS A BURNT-OUT WRECK`, 1.6); return false; }
    if (V.slung) { say(`THE ${T.label} IS STILL ON ITS WAY`, 1.6); return false; }
    if (S.depth > spec.dims.H * 0.8) { say(`THE ${T.label} IS UNDER WATER`, 1.5); return false; }
    V.wake(); V.seat = seat; V.head.yaw = V.head.pitch = 0; V.orbit.yaw = 0; V.view = 'first';
    occupy(seatOf(seat).sid);
    if (V.traffic) ctx.commandeer?.(V);
    if (isDriver() && !S.eng.running) say(`${T.label}  -  ${T.mil ? (type === 'm35' ? 'ENGINE SWITCH ON, START BUTTON (CLICK THEM)' : 'IGNITION ON, THEN START (CLICK THE SWITCH)') : 'TURN THE KEY (CLICK IT)'}  ·  OR I: START  ·  Y GET OUT`, 3);   // a cold vehicle: the start-up is yours (I does it in one go)
    else if (isGunner()) say(`${T.label}  -  ${seatOf(seat).label}  ·  MOUSE AIMS  ·  CLICK / F FIRES  ·  R RELOAD`, 2.4);
    ctx.onEnter?.(V, from);
    return true;
  };
  V.setSeat = i => { if (!V.seats[i]) return false; V.seat = i; V.head.yaw = V.head.pitch = 0; occupy(seatOf(i).sid); return true; };
  V.canExit = () => Math.abs(S.speed) > 2.2 && !V.wrecked && S.depth < 1 ? `STOP FIRST  -  ${Math.round(Math.abs(S.kmh))} km/h` : '';
  V.exit = () => {
    occupy(null); inp.throttle = 0; inp.brake = 0; inp.steer = 0; inp.handbrake = 1; inp.starter = false; V.crank = 0;
    if (Math.abs(S.speed) < 2.5) inp.ignition = false;   // parked: engine off (a running engine never sleeps)
    V.view = 'first'; ctx.onExit?.(V);
  };
  V.exitSpots = () => {
    const out = [], order = [V.seat, ...V.seats.map((_, i) => i).filter(i => i !== V.seat)];
    for (const i of order) { const s = V.seats[i]; const w = crafts.toWorld(V, s.exit); if (w) out.push({ x: w.x, y: S.pos[1] + 0.2, z: w.z, yaw: -S.heading }); }
    out.push({ x: S.pos[0], y: S.pos[1] + HT, z: S.pos[2], yaw: -S.heading });   // deep water: off the roof
    return out;
  };
  // ---------------------------------------------------------------- controls
  const inp = { throttle: 0, brake: 0, steer: 0, steerAbs: true, handbrake: 1, clutch: 0, ignition: true, starter: false, horn: false, fwd: false, range: 'H', lock: false, kit: false, shiftUp: false, shiftDown: false };
  const PARK = { throttle: 0, brake: 0, clutch: 1, steer: 0, handbrake: 1, gear: 0, ignition: false, starter: false };
  V.inp = inp;
  let thrLast = null, padSteer = 0;
  // keyboard steering narrows with speed: full lock below ~15 km/h, at speed only as much as a ~0.4 g turn needs
  // (a keyboard is all or nothing: full lock at 60 km/h rolls an M151, which is right, but not what a tap means)
  const steerLimit = v => { const vv = Math.max(4, Math.abs(v)); return clamp(Math.atan(spec.dims.wheelbase * 0.42 * 9.81 / (vv * vv)) / spec.steer.max, 0.12, 1); };
  function readDriver(dt, input) {
    const pad = input && input.pad && !input.keyboardOnly && !WHEEL_ID.test(input.pad.id || '') ? input.pad : null, st = ctx.CTL && ctx.CTL.state, hw = ctx.hwOn ? ctx.hwOn() : true;
    const up = kd('KeyW', 'ArrowUp'), dn = kd('KeyS', 'ArrowDown');
    const kSteer = (kd('KeyD', 'ArrowRight') ? 1 : 0) - (kd('KeyA', 'ArrowLeft') ? 1 : 0);
    V.thr = up ? Math.min(1, V.thr + dt * 2.5) : Math.max(0, V.thr - dt * 5);
    V.brk = dn ? Math.min(1, V.brk + dt * 3.5) : Math.max(0, V.brk - dt * 6);
    let thr = V.thr, brk = V.brk, steerT = kSteer * steerLimit(S.speed), analog = false, hand = kd('Space') ? 1 : 0;
    if (pad) {   // left stick steers (a softer narrowing than the keys), RT gas, LT brake / reverse, A handbrake
      const ax = Math.abs(pad.axes[0] || 0) > 0.1 ? pad.axes[0] : 0;
      if (ax) { steerT = ax * (0.35 + 0.65 * steerLimit(S.speed)); analog = true; }
      const rt = pad.buttons[7] ? pad.buttons[7].value : 0, lt = pad.buttons[6] ? pad.buttons[6].value : 0;
      if (rt > 0.04) thr = Math.max(thr, rt); if (lt > 0.04) brk = Math.max(brk, lt);
      if (pad.buttons[0] && pad.buttons[0].pressed) hand = 1;
    }
    const wh = readWheel(input);
    if (wh) {   // a racing wheel and pedals (wheelinput.js): the rim sets the wheel directly, gas / brake / clutch pedals
      steerT = wh.steer; analog = true; V.wheelDev = wh.id;
      if (wh.gas > 0.02) thr = Math.max(thr, wh.gas); if (wh.brake > 0.02) brk = Math.max(brk, wh.brake); V.wheelClutch = wh.clutch;
      if (wh.handbrake) hand = 1;
    } else V.wheelClutch = 0;
    if (!wh && hw && st && st.source && st.source !== 'NONE') {   // HOTAS: stick X or the pedals steer, throttle lever = gas, toe brakes / stick aft = brake
      if (st.stick && Math.abs(st.stick.x) > 0.05) { steerT = st.stick.x; analog = true; }
      if (st.hasPedals && Math.abs(st.rudder) > 0.05) { steerT = st.rudder; analog = true; }
      if (st.throttle !== null && st.throttle !== undefined) { if (thrLast === null) thrLast = st.throttle; if (Math.abs(st.throttle - thrLast) > 0.03 || V._hwThr) { V._hwThr = true; thrLast = st.throttle; thr = Math.max(thr, st.throttle); } }
      const br = Math.max(st.brakeL || 0, st.brakeR || 0, st.stick && st.stick.y > 0.5 ? (st.stick.y - 0.5) * 2 : 0); if (br > 0.05) brk = Math.max(brk, br);
    }
    // the wheel: an analogue input sets it; the keys turn it at a hand's rate, quicker back to the centre
    if (analog) V.steer = clamp(steerT, -1, 1);
    else { const rate = (Math.abs(steerT) > 0.01 ? 2.2 : 3.2) * (Math.sign(steerT) !== Math.sign(V.steer) && V.steer !== 0 ? 1.6 : 1); V.steer += clamp(steerT - V.steer, -rate * dt, rate * dt); }
    if (V.cabin.park) hand = 1;   // the parking brake lever / T-handle (clicked in the cab)
    if (thr < 0.05 && brk < 0.05 && Math.abs(S.speed) < 0.3) hand = 1;   // stopped with no pedal: the parking brake holds it (released as you pull away)
    inp.throttle = thr; inp.brake = brk; inp.steer = V.steer; inp.handbrake = hand; padSteer = steerT;
    inp.horn = kd('KeyH') || inp.horn;
    // the clutch pedal (manual gearbox): C held, or the wheel's clutch pedal; the clutch ramps in at a foot's rate
    { const want = Math.max(kd('KeyC') ? 1 : 0, V.wheelClutch || 0); V.clu = (V.clu || 0) + clamp(want - (V.clu || 0), -dt * 2.5, dt * 6); inp.clutch = V.wheelClutch ? want : V.clu; }
    if (V.crank > 0) { inp.ignition = true; inp.starter = !S.eng.running; V.crank -= dt; if (S.eng.running || V.crank <= 0) { V.crank = 0; inp.starter = false; } }
    else inp.starter = false;
  }
  // the gunner: the mouse (look), the arrow keys or the right stick lay the gun; LMB / F / X / RT fire
  function readGunner(dt, input) {
    const pad = input && input.pad && !input.keyboardOnly && !WHEEL_ID.test(input.pad.id || '') ? input.pad : null, g = T.gun;
    const ky = (kd('ArrowUp') ? 1 : 0) - (kd('ArrowDown') ? 1 : 0), kx = (kd('ArrowLeft') ? 1 : 0) - (kd('ArrowRight') ? 1 : 0);
    V.aim.yaw += kx * dt * 1.2; V.aim.pitch = clamp(V.aim.pitch + ky * dt * 0.8, g.elev[0], g.elev[1]);
    if (pad) { const rx = Math.abs(pad.axes[2] || 0) > 0.12 ? pad.axes[2] : 0, ry = Math.abs(pad.axes[3] || 0) > 0.12 ? pad.axes[3] : 0; V.aim.yaw -= rx * dt * 1.6; V.aim.pitch = clamp(V.aim.pitch - ry * dt * 1.1, g.elev[0], g.elev[1]); }
    V.trigger = !!(input && input.fire) || !!(pad && pad.buttons[7] && pad.buttons[7].value > 0.3) || !!V._hotasFire;
  }
  // buttons: a standard gamepad (A handbrake, B horn, X engine / reload, Y view, LB / RB seat, Back get out) and the
  // HOTAS through CTL's bindings (trigger: horn or the gun, pickle: engine, VIEW, GEAR: next seat, EJECT: get out,
  // FLAPS: lights, WHEEL BRAKE: parking brake)
  const padPrev = [];
  function buttons(input) {
    inp.horn = V.cabin.hornT > 0;   // (the horn button clicked in the cab: half a second)
    const pad = input && input.pad && !input.keyboardOnly && !WHEEL_ID.test(input.pad.id || '') ? input.pad : null;
    if (pad) {
      const b = i => !!(pad.buttons[i] && pad.buttons[i].pressed), edge = i => b(i) && !padPrev[i];
      if (edge(2)) V.key(isGunner() ? 'KeyR' : 'KeyI'); if (edge(3)) V.key('KeyV');
      if (edge(4)) crafts.cycleSeat(-1); if (edge(5)) crafts.cycleSeat(1); if (edge(8)) ctx.getInOut?.();
      if (b(1) && isDriver()) inp.horn = true;
      for (let i = 0; i < 12; i++) padPrev[i] = b(i);
    }
    const wh = isDriver() ? readWheel(input) : null;
    if (wh) {   // the wheel's paddles shift (semi / manual), face buttons: horn, engine, view; 6 / 7 seats
      if (wh.up) V.key('KeyE'); if (wh.down) V.key('KeyQ'); if (wh.engine) V.key('KeyI'); if (wh.view) V.key('KeyV');
      if (wh.seatNext) crafts.cycleSeat(1); if (wh.seatPrev) crafts.cycleSeat(-1); if (wh.horn) inp.horn = true;
    }
    const st = ctx.CTL && ctx.CTL.state, hw = ctx.hwOn ? ctx.hwOn() : true;
    if (!wh && hw && st && st.pressed && st.source && st.source !== 'NONE') {
      const P = st.pressed, A = st.actions || {};
      if (P.pickle) V.key('KeyI'); if (P.view) V.key('KeyV'); if (P.gear) crafts.cycleSeat(1); if (P.eject) ctx.getInOut?.(); if (P.flaps) V.cabin.click('lights');
      if (P.wheelbrake) V.cabin.click('park');
      if (A.fire && isDriver()) inp.horn = true;
      V._hotasFire = !!A.fire && isGunner();
    }
  }
  V.update = (dt, input) => {
    V.wake();
    buttons(input);
    if (V.wrecked) { inp.throttle = 0; inp.brake = 1; inp.handbrake = 1; }
    else if (isDriver() && V.auto) { const a = V.auto.update(S); inp.throttle = a.throttle; inp.brake = a.brake; inp.steer = a.steer; inp.handbrake = a.handbrake; inp.starter = V.crank > 0 && !S.eng.running; if (V.crank > 0) V.crank -= dt; }   // tests: a driver.js follower at the wheel
    else if (isDriver()) readDriver(dt, input);
    else { inp.throttle = 0; inp.brake = 0; inp.steer *= 0.9; inp.handbrake = Math.abs(S.speed) < 0.5 ? 1 : inp.handbrake; inp.starter = false; }
    if (isGunner() && !V.wrecked) readGunner(dt, input); else V.trigger = false;
    physics(dt);
    gunStep(dt);
    ctx.rideTick?.(dt, V);
  };
  V.idle = dt => {
    if (!V.exists || V.slung) return;   // slung under a helicopter / in a landing craft: delivery.js places it
    if (occ && crafts.active !== V) occupy(null);   // the player left without exit() (a new crew in the helicopter)
    V.trigger = false;
    if (V.traffic) {   // WORLD traffic run by the real sim (motorpool.js): the follower drives
      const a = V.traffic.F.update(S);
      inp.throttle = a.throttle; inp.brake = a.brake; inp.steer = a.steer; inp.handbrake = a.handbrake; inp.ignition = true; inp.starter = !S.eng.running && !V.wrecked;   // stalled: crank it again
      inp.horn = (V.traffic.blocked || 0) > 6 && (V.traffic.blocked % 7) < 2;   // held up: a toot
    } else if (V.auto) {   // a driver.js follower at the wheel (a delivery driving off the beach)
      const a = V.auto.update(S); inp.throttle = a.throttle; inp.brake = a.brake; inp.steer = a.steer; inp.handbrake = a.handbrake; inp.ignition = true; inp.starter = !S.eng.running;
      if (V.auto.done) { V.auto = null; inp.ignition = false; }
    } else { inp.throttle = 0; inp.brake = Math.abs(S.speed) > 0.3 ? 0.6 : 0; inp.handbrake = 1; inp.starter = false; }
    if (V.asleep) { carryOnly(); return; }
    physics(dt);
    // asleep when parked and still: no physics until something wakes it (the player, a hit, a blast, a bump)
    const still = !V.traffic && !V.auto && !S.eng.running && Math.abs(S.speed) < 0.05 && Math.hypot(S.w[0], S.w[1], S.w[2]) < 0.03 && S.onGround && !(dmg.state.fire > 0);
    V.sleepT = still ? V.sleepT + dt : 0;
    if (V.sleepT > 1.2) { V.asleep = true; for (const W of S.wheels) W.omega = 0; }
  };
  V.wake = () => { if (V.asleep) { V.asleep = false; V.acc = 0; } V.sleepT = 0; };
  // ---------------------------------------------------------------- physics: deck carry, fixed steps, events
  function syncP() { const P = V.P; P.x = S.pos[0]; P.y = S.pos[1]; P.z = S.pos[2]; P.yaw = -S.heading; }
  function carry(dt) {
    const P = V.P; if (!P.plat) { V.deckV[0] = V.deckV[1] = V.deckV[2] = 0; return; }
    syncP(); GR.carry(P); const c = P.carried;
    if (c) { S.transport(c.dx, c.dy, c.dz, c.dyaw); const k = 1 / Math.max(1e-3, dt); V.deckV[0] = c.dx * k; V.deckV[1] = c.dy * k; V.deckV[2] = c.dz * k; }
  }
  function settle() { syncP(); GR.settle(V.P, S.onGround); }
  function carryOnly() { if (V.P.plat) { carry(V._dt || 0.016); settle(); } }
  function physics(dt) {
    V._dt = dt;
    carry(dt);
    ctx.WENV.frame(V);
    V.acc += dt; let n = 0;
    const step = V.lod === 'far' ? STEP * 2 : STEP;
    while (V.acc >= step && n < 15) {
      V.acc -= step; n++;
      const c = D.update(S, inp, step);
      for (const k of ['fwd', 'range', 'lock', 'ignition', 'starter', 'horn', 'kit']) c[k] = inp[k];
      if (V.mode !== 'auto') { inp.shiftUp = inp.shiftDown = false; }
      const evs = S.step(step, c, env);
      for (const e of evs) onEvent(e);
    }
    if (n >= 15) V.acc = 0;
    settle();
  }
  function onEvent(e) {
    const me = crafts.active === V;
    ctx.onEvent?.(V, e);
    switch (e.e) {
      case 'crewHit': if (me && e.seat === occ) { const s = dmg.state.seats.find(q => q.id === e.seat); if (s) { s.hp = 1; s.dead = false; } ctx.crewHit?.(V, e); } break;
      case 'crewKilled': { const s = dmg.state.seats.find(q => q.id === e.seat); if (s && e.seat === occ) { s.hp = 1; s.dead = false; } break; }
      case 'wrecked': wreck(e.cause); break;
      case 'fire': if (me) say(`FIRE  -  ${T.label} IS BURNING  -  GET OUT (Y)`, 3); break;
      case 'puncture': if (me) say(`PUNCTURE  -  ${spec.wheels[e.wheel].id} TYRE`, 1.6); break;
      case 'blowout': if (me) say(`BLOWOUT  -  ${spec.wheels[e.wheel].id} TYRE`, 1.8); break;
      case 'flat': if (me) say(`${spec.wheels[e.wheel].id} TYRE FLAT`, 1.6); break;
      case 'drowned': if (me) say('ENGINE DROWNED  -  THE IGNITION IS UNDER WATER', 2.2); break;
      case 'hydrolock': if (me) say('HYDROLOCKED  -  WATER IN THE INTAKE  -  THE ENGINE IS GONE', 2.6); break;
      case 'deepWater': if (me) say(`TOO DEEP  -  ${e.depth.toFixed(2)} m (FORDING ${(S.kit ? spec.water.kitFord : spec.water.ford).toFixed(2)} m)`, 1.6); break;
      case 'stall': if (me && isDriver()) say('STALLED  -  I TO RESTART', 1.4); break;
      case 'outOfFuel': if (me) say('OUT OF FUEL', 2); break;
      case 'seized': if (me) say('ENGINE SEIZED', 2); break;
      case 'rollover': if (me) say('ROLLED OVER', 2); ctx.sfx.thump?.(1); break;
      case 'impact': if (me) V.shake = Math.min(2, (V.shake || 0) + e.speed / 8); if (e.speed > 3) ctx.sfx.thump?.(Math.min(1, e.speed / 12)); if (e.id && e.id.sim && e.id !== V) bump(e); break;
      case 'overheat': if (me) say('OVERHEATING  -  WATER TEMPERATURE HIGH', 1.8); break;
      case 'lowAir': if (me) say('LOW AIR  -  BRAKES', 1.2); break;
      default: break;
    }
  }
  function bump(e) {   // we ran into another wheeled vehicle: push it (half our momentum along the contact normal)
    const O = e.id, m = Math.min(S.massNow, O.sim.massNow), J = m * e.speed * 0.5;
    O.wake(); O.sim.impulse(e.at, [-e.n[0] * J, -e.n[1] * J * 0, -e.n[2] * J]);
  }
  function wreck(cause) {
    if (V.wrecked) return; V.wrecked = true;
    if (T.mil) ctx.unitLost?.(V, cause, crafts.active === V);   // COMMANDER: the fleet's loss
    fx.explode(S.pos[0], S.pos[1] + 1, S.pos[2], cause === 'blast' ? 1.4 : 0.9, { fire: 0, debris: 8, color: T.mil ? 0x3d4430 : 0x3a3530 });
    ctx.sfx.boom?.(0.8);
    V.burnFx = fx.burn(S.pos[0], S.pos[1] + 1, S.pos[2], 45, 0.8);
    if (V.model) charModel(V.model.group, true);
    if (crafts.active === V) say(`${T.label} DESTROYED  -  ${cause === 'fire' ? 'BURNT OUT' : cause.toUpperCase()}  -  GET OUT (Y)`, 3);
    else ctx.feed?.(`${T.label} DESTROYED`, 'bad');
  }
  // ---------------------------------------------------------------- the gun (pedestal / ring mount)
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _p = new THREE.Vector3();
  const bodyQ = q => q.set(S.q[0], S.q[1], S.q[2], S.q[3]);
  // the gun's pivot (model frame) and the gun's own orientation (model frame)
  function gunPivot(out) {
    const g = T.gun;
    if (g.ring) { _v.set(g.arm[0], g.arm[1], g.arm[2]).applyAxisAngle(_w.set(0, 1, 0), V.aim.yaw); return out.set(g.ring[0] + _v.x, g.ring[1] + _v.y, g.ring[2] + _v.z); }
    return out.set(g.pivot[0], g.pivot[1], g.pivot[2]);
  }
  const gunQ = q => q.setFromEuler(_e.set(V.aim.pitch, V.aim.yaw, 0, 'YXZ'));
  // lay the gun on a world point (tests, and the start of an AI gunner): yaw / pitch in the vehicle's frame from the pivot
  V.aimAt = (x, y, z) => {
    if (!V.gun) return false; const g = T.gun;
    bodyQ(_q); _q2.copy(_q).invert(); gunPivot(_p);
    _v.set(x - S.pos[0], y - S.pos[1], z - S.pos[2]).applyQuaternion(_q2).sub(_p);
    V.aim.yaw = Math.atan2(-_v.x, -_v.z); gunPivot(_p); _v.set(x - S.pos[0], y - S.pos[1], z - S.pos[2]).applyQuaternion(_q2).sub(_p);
    V.aim.pitch = clamp(Math.atan2(_v.y, Math.hypot(_v.x, _v.z)), g.elev[0], g.elev[1]); return true;
  };
  const muz = [0, 0, 0], dir = [0, 0, 0], carrierV = [0, 0, 0];
  function gunStep(dt) {
    if (!V.gun) return;
    if (!V.trigger && !(V.gun.reloadT > 0)) { V.gun.update(dt, false, muz, dir, carrierV, ctx.guns); return; }
    bodyQ(_q); gunQ(_q2); gunPivot(_p);
    const m = T.gun.muzzle; _v.set(m[0], m[1], m[2]).applyQuaternion(_q2).add(_p).applyQuaternion(_q); muz[0] = _v.x + S.pos[0]; muz[1] = _v.y + S.pos[1]; muz[2] = _v.z + S.pos[2];
    _w.set(0, 0, -1).applyQuaternion(_q2).applyQuaternion(_q); dir[0] = _w.x; dir[1] = _w.y; dir[2] = _w.z;
    carrierV[0] = S.vel[0] + V.deckV[0]; carrierV[1] = S.vel[1]; carrierV[2] = S.vel[2] + V.deckV[2];
    const n = V.gun.update(dt, V.trigger, muz, dir, carrierV, ctx.guns);
    if (n) { fx.add?.spawn(muz[0] + dir[0] * 0.3, muz[1] + dir[1] * 0.3, muz[2] + dir[2] * 0.3, 0, 0, 0, 0.05, 0.5, 0.9, 1, 0.75, 0.35, 1); ctx.onFire?.(V, n); }
  }
  // ---------------------------------------------------------------- damage from the war
  const _inv = new THREE.Quaternion();
  const toLocalP = (p, out) => { bodyQ(_inv).invert(); return out.set(p.x - S.pos[0], p.y - S.pos[1], p.z - S.pos[2]).applyQuaternion(_inv); };
  const toLocalD = (d, out) => { bodyQ(_inv).invert(); return out.set(d.x, d.y, d.z).applyQuaternion(_inv).normalize(); };
  V.damage = (power, why) => { V.wake(); dmg.blast([0, 0.8, 0], 5, power); };
  V.hurt = (amount, why, at, dirW, kind) => {
    if (crafts.active === V) V.shake = Math.min(1.5, (V.shake || 0) + (kind === 'b' || kind === 'ciws' || kind === 'jb' ? 0.4 : 1.0));
    V.wake(); V.lastHitT = performance.now();
    const bullet = kind === 'b' || kind === 'ciws' || kind === 'jb';
    if (bullet && at) {
      const d = dirW ? toLocalD(dirW, _w) : _w.set(0, -0.2, 1).normalize(), p = toLocalP(at, _v);
      const entry = [p.x - d.x * 4, p.y - d.y * 4, p.z - d.z * 4];
      const hits = dmg.hit(entry, [d.x, d.y, d.z], kind === 'b' ? 'hmg' : 'cannon');
      if (crafts.active === V && hits.length) say(`HIT  -  ${hits.map(h => h.startsWith('tyre') ? 'TYRE' : h.startsWith('seat') ? 'CREW' : h.toUpperCase()).filter((x, i, a) => a.indexOf(x) === i).join(', ')}`, 1.2);
    } else {
      const p = at ? toLocalP(at, _v) : _v.set((Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 3);
      dmg.blast([p.x, p.y, p.z], 5, clamp(amount * 3.5, 0.15, 2.5));
      if (crafts.active === V) say(`${why}  -  ${T.label} HIT`, 1.2);
    }
  };
  // ---------------------------------------------------------------- what war.js sees, avatar, footprint
  V.pl = {
    alive: () => !V.wrecked || crafts.active !== V, inCave: false, landed: () => S.onGround && Math.abs(S.speed) < 1,
    hitR: Math.max(1.6, Math.min(3, HL * 0.7)), sight: 140, capTime: () => V.troops > 0 ? 4 : 8,
    detect: () => (S.eng.running ? 0.8 : 0.55) + (V.gun && V.gun.flash > 0 ? 0.2 : 0),
  };
  V.afterWar = () => { if (V.P.plat) { carry(V._dt || 0.016); settle(); } };
  V.avatar = Z => {
    Z.pos.set(S.pos[0] + S.up[0] * HT * 0.45, S.pos[1] + S.up[1] * HT * 0.45, S.pos[2] + S.up[2] * HT * 0.45);
    Z.vel.set(S.vel[0] + V.deckV[0], S.vel[1] + V.deckV[1], S.vel[2] + V.deckV[2]);
    Z.facing.set(S.fwdv[0], S.fwdv[2]); if (Z.facing.lengthSq() < 1e-6) Z.facing.set(0, -1); else Z.facing.normalize();
  };
  const _b = { def: V };
  V.bounds = () => {
    if (!V.exists || V.slung) return null;
    const c = -S.heading, cx = S.pos[0] + S.fwdv[0] * -zc, cz = S.pos[2] + S.fwdv[2] * -zc;
    return Object.assign(_b, { x: cx, z: cz, yaw: c, hl: HL, hw: HW, y0: S.pos[1] - 0.2, y1: S.pos[1] + HT, def: V });
  };
  // ---------------------------------------------------------------- keys, mouse
  V.key = code => {
    if (code === 'KeyV') { V.view = V.view === 'first' ? 'chase' : 'first'; say(V.view === 'first' ? `${seatOf(V.seat).label}'S VIEW` : 'CHASE VIEW', 1); return true; }
    if (isDriver()) {
      if (code === 'KeyI') { if (S.eng.running) { inp.ignition = false; V.crank = 0; say('IGNITION OFF', 1.2); } else { inp.ignition = true; V.crank = 2.5; say(S.depth > 0.6 ? 'CRANKING  -  (DROWNED?)' : S.battery < 0.15 ? 'CRANKING  -  THE BATTERY IS FLAT' : spec.engine.diesel && S.eng.temp < 30 ? 'STARTER  -  COLD MULTIFUEL, GIVE IT A MOMENT' : 'STARTER', 1.2); } return true; }
      if (code === 'KeyU' && spec.transfer.front === 'parttime') { inp.fwd = !inp.fwd; say(inp.fwd ? 'FRONT DRIVE ENGAGED (4x4)' : 'FRONT DRIVE OFF (4x2)', 1.4); return true; }
      if (code === 'KeyL' && spec.transfer.low) { inp.range = inp.range === 'H' ? 'L' : 'H'; say(`TRANSFER ${inp.range === 'L' ? 'LOW' : 'HIGH'} RANGE${Math.abs(S.speed) > 1.5 ? '  (STOP TO SHIFT)' : ''}`, 1.4); return true; }
      if (code === 'KeyG' && spec.water.kit) { if (Math.abs(S.speed) > 0.5) { say('STOP TO FIT THE FORDING KIT', 1.3); return true; } inp.kit = !inp.kit; say(inp.kit ? `DEEP-WATER FORDING KIT FITTED  -  ${spec.water.kitFord.toFixed(2)} m` : `FORDING KIT OFF  -  ${spec.water.ford.toFixed(2)} m`, 1.8); return true; }
      if (code === 'KeyO') { V.cabin.click('lights'); return true; }
      if (code === 'KeyT') { V.cabin.changeWheel(); return true; }
      if (code === 'KeyN') { const m = ['auto', 'semi', 'manual'], i = (m.indexOf(D.mode) + 1) % 3; D.mode = V.mode = m[i]; say(`GEARBOX: ${m[i].toUpperCase()}${m[i] !== 'auto' ? '  -  E / Q CHANGE GEAR' + (m[i] === 'manual' ? '  ·  C CLUTCH' : '') : ''}`, 2); return true; }
      if (code === 'KeyE' && D.mode !== 'auto') { inp.shiftUp = true; return true; }
      if (code === 'KeyQ' && D.mode !== 'auto') { inp.shiftDown = true; return true; }
    }
    if (code === 'KeyX' && !isGunner()) { V.cabin.extinguish(); return true; }
    if (isGunner() && code === 'KeyR') { if (V.gun.reload()) say(`${V.gun.spec.name}  -  RELOADING`, 1.2); else say(V.gun.boxes <= 0 ? `${V.gun.spec.name}  -  NO MORE AMMUNITION` : `${V.gun.spec.name}  -  BELT FULL`, 1); return true; }
    if (ctx.key && ctx.key(V, code)) return true;
    // keys that mean something on foot / in aircraft do nothing here (and must not fall through to the helicopter)
    return ['KeyO', 'KeyU', 'KeyL', 'KeyN', 'KeyG', 'KeyB', 'KeyR', 'KeyQ', 'KeyE', 'KeyH', 'KeyI', 'Home', 'PageUp', 'PageDown', 'KeyF', 'KeyX', 'KeyC', 'KeyZ', 'Tab'].includes(code);
  };
  const SENS = 0.0025;
  V.look = (dx, dy) => {
    if (isGunner() && V.view === 'first') { const g = T.gun; V.aim.yaw -= dx * SENS * 0.7; V.aim.pitch = clamp(V.aim.pitch - dy * SENS * 0.7, g.elev[0], g.elev[1]); return; }
    if (V.view === 'first') { V.head.yaw = clamp(V.head.yaw - dx * SENS, -2.4, 2.4); V.head.pitch = clamp(V.head.pitch - dy * SENS, -1.0, 0.9); }
    else { V.orbit.yaw -= dx * SENS; V.orbit.pitch = clamp(V.orbit.pitch + dy * SENS, -0.1, 1.2); }
  };
  V.firstPerson = () => V.view === 'first';
  V.fov = ck => isGunner() && V.view === 'first' ? Math.min(ck, 62) : ck;
  // ---------------------------------------------------------------- cameras
  const _cp = new THREE.Vector3();
  V.camera = (cam, dt, view) => {
    V._dt = dt; bodyQ(_q);
    if (V.view === 'first' && isGunner()) {   // behind the gun, looking down the barrel
      gunQ(_q2); gunPivot(_p); const e = T.gun.eye;
      _v.set(e[0], e[1], e[2]).applyQuaternion(_q2).add(_p).applyQuaternion(_q);
      cam.position.set(S.pos[0] + _v.x, S.pos[1] + _v.y, S.pos[2] + _v.z);
      cam.quaternion.copy(_q).multiply(_q2).multiply(new THREE.Quaternion().setFromEuler(_e.set(-0.06, 0, 0)));
      return;
    }
    if (V.view === 'first') {
      const s = seatOf(V.seat), e = s.eye || [0, 1.5, 0], base = s.face ? -s.face * Math.PI / 2 : 0;
      _v.set(e[0], e[1], e[2]).applyQuaternion(_q); cam.position.set(S.pos[0] + _v.x, S.pos[1] + _v.y, S.pos[2] + _v.z);
      if ((!view || !view.locked) && !V.headHold) { const k = Math.exp(-4 * dt); V.head.yaw *= k; V.head.pitch *= k; }   // (headHold: tests)
      cam.quaternion.copy(_q).multiply(_q2.setFromEuler(_e.set(V.head.pitch - (s.role === 'driver' ? (T.civ ? 0.16 : type === 'm35' ? 0.24 : 0.3) : 0.08), base + V.head.yaw, 0, 'YXZ')));   // the driver looks down a little: road and gauges
      // feel: road / track roughness, a rough engine (damage) at idle, hits and crashes (V.shake decays)
      const rough = S.eng.running ? (1 - dmg.state.engine) * 0.004 + (S.eng.misfire || 0) * 0.004 : 0;
      const sh = Math.min(0.015, Math.abs(S.speed) * 0.001) * (S.wheels[0].surf <= 1 || S.wheels[0].surf === 6 ? 0.3 : 1) + rough + (V.shake || 0) * 0.05;
      cam.position.x += (Math.random() - 0.5) * sh; cam.position.y += (Math.random() - 0.5) * sh; V.shake = Math.max(0, (V.shake || 0) - dt * 2.5);
      return;
    }
    // chase: behind and above, swinging round with the vehicle; the mouse orbits
    const yaw = -S.heading + V.orbit.yaw, d = 6.5 + HL * 1.4, up = 1.5 + d * Math.sin(V.orbit.pitch);
    _cp.set(S.pos[0] + Math.sin(yaw) * d * Math.cos(V.orbit.pitch), S.pos[1] + up, S.pos[2] + Math.cos(yaw) * d * Math.cos(V.orbit.pitch));
    { const g = GR.floor(_cp.x, _cp.z, _cp.y + 20, 50); if (g !== Infinity && _cp.y < g + 1.5) _cp.y = g + 1.5; }
    if (!V._chase) V._chase = _cp.clone(); else V._chase.lerp(_cp, 1 - Math.exp(-6 * dt));
    if (V._chase.distanceTo(_cp) > 30) V._chase.copy(_cp);
    cam.position.copy(V._chase); GR.clearView(S.pos[0], S.pos[1] + 1.4, S.pos[2], cam.position, V);
    const g = GR.floor(cam.position.x, cam.position.z, cam.position.y, 50); if (g !== Infinity && cam.position.y < g + 0.8) cam.position.y = g + 0.8;
    cam.lookAt(S.pos[0], S.pos[1] + 1.2, S.pos[2]);
    if (!view || !view.locked) V.orbit.yaw *= Math.exp(-1.5 * dt);
  };
  // ---------------------------------------------------------------- drawing
  function hideFigs() { for (const f of [figs.me, figs.civ, ...figs.crew]) if (f) f.group.visible = false; }
  function placeFig(f, local, yaw, pose) {
    if (!f.group.parent) scene.add(f.group);
    bodyQ(_q); _v.set(local[0], local[1], local[2]).applyQuaternion(_q);
    f.group.position.set(S.pos[0] + _v.x, S.pos[1] + _v.y, S.pos[2] + _v.z);
    f.group.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(_w.set(0, 1, 0), yaw));
    f.group.visible = true; f.pose(pose);
  }
  let lastLook = null, dustT = 0;
  V.render = (dt, time, fp) => {
    if (!V.exists) return;
    const cam = ctx.camZ ? ctx.camZ() : null, me = crafts.active === V;
    const dist = cam ? Math.hypot(cam.position.x - S.pos[0], cam.position.y - S.pos[1], cam.position.z - S.pos[2]) : 0;
    V.camDist = dist;
    const near = me || dist < 260, far = !near && dist < 1600;
    if (near) {
      ensureModel(); const M = V.model; M.group.visible = true; if (V.far) V.far.visible = false;
      M.group.position.set(S.pos[0], S.pos[1], S.pos[2]); M.group.quaternion.set(S.q[0], S.q[1], S.q[2], S.q[3]);
      if (!V.asleep || !lastLook) { lastLook = lookFrom(S, S.lastCtl || inp); M.animate(lastLook, dt); }
      // the guns follow the gunner's aim
      if (V.gun) {
        const g = T.gun, part = type === 'm151' ? M.parts.gun : M.parts.m2;
        if (part) { if (g.ring) { gunPivot(_p); part.position.copy(_p); } part.rotation.set(V.aim.pitch, V.aim.yaw, 0, 'YXZ'); }
      }
      const inside = me && fp && V.view === 'first';
      if (V.interior) {
        V.interior.update(lastLook, dt, inside && (isDriver() || dist < 3));
        // hands on the wheel only with a driver: you in the driver's seat (first person), the civilian driving traffic, an AI
        const drv = (me && isDriver() && inside) || !!V.traffic || !!V.auto;
        if (V._drv !== drv) { V._drv = drv; V.interior.setDriver?.(drv, V.traffic ? { glove: 0xc89a78, sleeve: 0x7a4a3a } : T.mil ? { glove: 0x3a3626, sleeve: 0x4a5232 } : { glove: 0xc89a78, sleeve: 0x3a4a6a }); }
      }
      V.cabin.setBody(me && isDriver() && inside); V.cabin.update(dt, lastLook, { body: me && isDriver() && inside, interior: V.interior });
      for (const s of M.shell || []) s.visible = !inside;
    } else { if (V.model) V.model.group.visible = false; }
    if (far) { ensureFar(); V.far.visible = true; V.far.position.set(S.pos[0], S.pos[1], S.pos[2]); V.far.quaternion.set(S.q[0], S.q[1], S.q[2], S.q[3]); }
    else if (V.far) V.far.visible = false;
    // people: me in my seat (not in my own eye), a civilian at the wheel of traffic, troops on the M35's benches
    if (near) {
      const s = seatOf(V.seat);
      if (me && !(fp && V.view === 'first')) {
        figs.me ||= figure('marine');
        if (isGunner()) placeFig(figs.me, T.gun.stand, V.aim.yaw, 'stand'); else placeFig(figs.me, [s.at[0], s.at[1] - 0.47, s.at[2]], s.face ? -s.face * Math.PI / 2 : 0, 'seated');
      } else if (figs.me) figs.me.group.visible = false;
      if (V.traffic) { figs.civ ||= figure('civ'); const d0 = V.seats[0]; placeFig(figs.civ, [d0.at[0], d0.at[1] - 0.05, d0.at[2]], 0, 'seated'); }
      else if (figs.civ) figs.civ.group.visible = false;
      const TP = spec.seats.filter(x => x.role === 'troop');
      for (let i = 0; i < Math.max(figs.crew.length, V.troops); i++) {
        const f = figs.crew[i] || (figs.crew[i] = figure('marine')), q = i < V.troops ? TP[(i % 2) * 8 + Math.floor(i / 2)] : null;
        if (q && !(me && occ === q.id)) placeFig(f, [q.at[0], q.at[1] - 0.47, q.at[2]], -q.face * Math.PI / 2, 'seated'); else f.group.visible = false;
      }
    } else hideFigs();
    // dust, spray, exhaust, fire
    dustT -= dt;
    if (near && !V.asleep && dustT <= 0 && fx.mix) {
      dustT = 0.06;
      const v = Math.abs(S.speed);
      for (const Wh of S.wheels) {
        if (!Wh.contact) continue;
        if (Wh.depthW > 0.08 && v > 1) { if (Math.random() < 0.7) fx.mix.spawn(Wh.cx, Wh.cy + Wh.depthW + 0.1, Wh.cz, (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2.5 * Math.min(1, v / 6), (Math.random() - 0.5) * 2, 0.8, 0.4, 1.4, 0.85, 0.9, 0.95, 0.7, 9, 0.8); continue; }
        const su = Wh.surf, dust = su === 2 ? 1 : su === 4 ? 1.1 : su === 3 ? 0.35 : su === 5 ? 0.25 : su === 7 ? 0.4 : 0;
        if (dust && (v > 4 || Wh.ts.slipV > 1.5) && Math.random() < dust * Math.min(1, (v + Wh.ts.slipV * 2) / 14)) {
          const c = su === 4 ? [0.78, 0.7, 0.52] : su === 5 ? [0.33, 0.27, 0.2] : su === 3 ? [0.52, 0.5, 0.36] : [0.62, 0.54, 0.42];
          fx.mix.spawn(Wh.cx, Wh.cy + 0.25, Wh.cz, (Math.random() - 0.5) * 1.5 - S.vel[0] * 0.15, 0.4 + Math.random(), (Math.random() - 0.5) * 1.5 - S.vel[2] * 0.15, 1.6 + Math.random(), 0.8, 3.2, c[0], c[1], c[2], 0.45, -0.1, 1.2, 0.6);
        }
      }
      if (S.inWater > 0.1 && v > 1.5 && Math.random() < 0.3) fx.wake?.(S.pos[0], S.pos[2], 0.6);
      if (S.eng.running && (S.eng.smoke > 0.15 || (spec.engine.diesel && Math.random() < 0.25))) {
        const ex = S.worldPoint(type === 'm35' ? [0.95, 2.45, -0.62] : [0.35, 0.3, spec.dims.L / 2]);
        fx.mix.spawn(ex[0], ex[1], ex[2], (Math.random() - 0.5) * 0.3, 0.8, (Math.random() - 0.5) * 0.3, 1.6, 0.3, 1.4, S.eng.smoke > 0.15 ? 0.13 : 0.4, S.eng.smoke > 0.15 ? 0.13 : 0.4, S.eng.smoke > 0.15 ? 0.13 : 0.4, 0.45, -0.3, 1, 0.5);
      }
      const ds = dmg.state;
      if (ds.fire > 0 && !V.wrecked) {
        const c = spec.components[ds.fuelLeak > 0 && Math.random() < 0.5 ? 'fuelTank' : 'engine'] || spec.components.engine;
        const p = S.worldPoint([c[0] + Math.random() * (c[3] - c[0]), c[4], c[2] + Math.random() * (c[5] - c[2])]);
        fx.add?.spawn(p[0], p[1], p[2], (Math.random() - 0.5) * 0.6, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 0.6, 0.5, 0.6, 1.2, 1, 0.55, 0.15, 0.9, -1, 1);
        fx.mix.spawn(p[0], p[1] + 0.4, p[2], (Math.random() - 0.5) * 0.5, 2 + Math.random(), (Math.random() - 0.5) * 0.5, 3, 0.8, 3.5, 0.1, 0.1, 0.1, 0.55, -0.4, 1, 0.8);
      }
      if (ds.coolLeak > 0 && ds.coolant > 0.02 && S.eng.temp > 70 && Math.random() < 0.4) { const c = spec.components.radiator || spec.components.engine, p = S.worldPoint([(c[0] + c[3]) / 2, c[4], (c[2] + c[5]) / 2]); fx.mix.spawn(p[0], p[1], p[2], 0, 1.2, 0, 1.4, 0.4, 1.6, 0.9, 0.9, 0.9, 0.5, -0.3, 1, 0.6); }
    }
    if (V.burnFx) { V.burnFx.x = S.pos[0]; V.burnFx.y = S.pos[1] + 1; V.burnFx.z = S.pos[2]; }
  };
  V.silence = () => { ctx.silence?.(V); };
  // ---------------------------------------------------------------- HUD
  const GEAR = g => g < 0 ? 'R' : g === 0 ? 'N' : String(g);
  V.hud = () => {
    const s = seatOf(V.seat), ds = dmg.state, kmh = Math.abs(S.kmh);
    const warn = [];
    if (ds.fire > 0) warn.push('FIRE'); if (ds.fuelLeak > 0) warn.push('FUEL LEAK'); if (ds.coolLeak > 0) warn.push('COOLANT LEAK'); if (ds.oilLeak > 0) warn.push('OIL LEAK');
    ds.tyres.forEach((t, i) => { if (t.pressure < 0.5) warn.push(`${spec.wheels[i].id} FLAT`); else if (t.leak > 0) warn.push(`${spec.wheels[i].id} LEAKING`); });
    if (S.eng.hydrolock) warn.push('HYDROLOCKED'); else if (S.eng.seized) warn.push('ENGINE SEIZED'); else if (ds.engine < 0.6) warn.push(`ENGINE ${Math.round(ds.engine * 100)}%`);
    const surf = ['TARMAC', 'WET', 'DIRT', 'GRASS', 'SAND', 'MUD', 'DECK', 'ROCK', 'SNOW'][S.wheels[0].surf] || '';
    const drive = spec.transfer.front === 'parttime' ? (inp.fwd ? '4x4' : '4x2') : spec.transfer.front === 'none' || !spec.axles.some(a => a.driven === 'F') ? '' : '6x6';
    const ford = S.depth > 0.05 ? `  ·  WADING ${S.depth.toFixed(2)} / ${(S.kit ? spec.water.kitFord : spec.water.ford).toFixed(2)} m` : '';
    const line = `${T.label}  ·  ${s.label}  ·  ${kmh.toFixed(0)} km/h  ·  ${S.eng.running ? `${GEAR(S.gear)}${spec.transfer.low ? (S.range === 'L' ? ' LOW' : '') : ''}  ${Math.round(S.eng.rpm)} RPM` : V.crank > 0 ? 'CRANKING' : 'ENGINE OFF'}${drive ? '  ·  ' + drive : ''}  ·  ${surf}${V.onBridge !== null ? ' (BRIDGE)' : ''}${ford}  ·  ${Math.round(S.eng.temp)}°C  ${Math.round(S.eng.oilP)} PSI${warn.length ? '  ·  ' + warn.join('  ') : ''}${ctx.medLine ? ctx.medLine() : ''}`;
    let hint;
    const hv = ctx.hover ? ctx.hover() : null;
    if (hv && V.cabin.labelOf) return { line, hint: `${V.cabin.labelOf(hv)}  -  CLICK`, weap: '', fuel: S.fuelL / spec.fuel.capacity * 100, fuelLabel: `FUEL ${Math.round(S.fuelL)} L` };
    if (V.wrecked) hint = 'WRECKED  -  Y TO GET OUT';
    else if (S.depth > spec.dims.H * 0.7) hint = 'UNDER WATER  -  Y TO GET OUT AND SWIM';
    else if (isGunner()) hint = `MOUSE / ARROWS AIM  ·  CLICK / F FIRE  ·  R RELOAD  ·  V VIEW  ·  [ ] SEAT  ·  Y GET OUT`;
    else if (!isDriver()) hint = `RIDING  -  [ ] CHANGE SEAT  ·  V VIEW  ·  Y GET OUT`;
    else if (!S.eng.running) hint = V.crank > 0 ? 'STARTING...' : S.eng.hydrolock || S.eng.seized ? 'THE ENGINE IS GONE  -  Y GET OUT' : 'I: START THE ENGINE  ·  Y GET OUT';
    else hint = `W / S DRIVE (HOLD S STOPPED: REVERSE)  ·  A / D STEER  ·  SPACE HANDBRAKE  ·  ${spec.transfer.front === 'parttime' ? 'U 4x4  ·  ' : ''}${spec.transfer.low ? 'L LOW  ·  ' : ''}${spec.water.kit ? 'G FORDING KIT  ·  ' : ''}${ctx.hintExtra ? ctx.hintExtra(V) : ''}I ENGINE  ·  H HORN  ·  N GEARBOX  ·  V VIEW  ·  [ ] SEAT  ·  Y GET OUT`;
    const weap = V.gun ? `${V.gun.spec.name}  ${V.gun.reloadT > 0 ? 'RELOADING' : `${V.gun.belt} / ${V.gun.spec.belt}`}  ·  ${V.gun.boxes} ${type === 'm35' ? 'CANS' : 'BOXES'}${V.troops ? `  ·  ${V.troops} MARINES ABOARD` : ''}` : V.troops ? `${V.troops} MARINES ABOARD` : '';
    return { line, hint, weap, fuel: S.fuelL / spec.fuel.capacity * 100, fuelLabel: `FUEL ${Math.round(S.fuelL)} L` };
  };
  V.menuNote = () => `${T.label}  ·  FUEL ${Math.round(S.fuelL)} L`;
  return V;
}
