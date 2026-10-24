// FOUNDATION: the GROUND-VEHICLE HOST adapter - turns a pure wheeled / tracked sim (units/<group>/<unit>sim.js) plus
// a THREE model into a craft (craft.js): seats with eyes and doors, driver controls from the keyboard / gamepad /
// HOTAS + pedals, cameras (each seat's eye with mouse head-look, a chase orbit), HUD, sound, damage routing
// (vehicle hit points, crew exposure, wreck), deck carrying, spawning and delivery.
//
//   const def = createVehicleCraft(ctx, {
//     id: 'm151', label: 'M151A2 MUTT', sim, model,                // sim: createBoxCar()-shaped; model: { group, animate(s, dt, opts) }
//     seats: [{ id: 'driver', label: 'DRIVER', role: 'driver', eye: [x, y, z], door: [x, y, z], exit: [x, y, z] }, ...],
//     hp: 100, exposed: 0.3, hitR: 2, sight: 140, capTime: 8, cyl: 4, controls: (ctl, input, def) => {...} (optional),
//   });  crafts.register(def);  def.spawnAt({ x, y, z, yaw });
//
// The seat roles the adapter understands: 'driver' (drives), anything else rides (gunner / commander seats get their
// controls from the unit's own `controls` hook, see FOUNDATION.md). Local frames: x right, y up, -z forward, metres.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// war.js damage units (a helicopter hit is ~0.13-0.2) to vehicle hit points
export const VEH_HP_PER_WAR_UNIT = 60;

// ctx: { scene, GR, crafts, war, fx, sfx, say, feed, keyDown, CTL, hwOn(), camZ() (the render camera, for sound
//        distance), crewHit(amount, why) (the soldier inside), crewKilled(why), onExitForced(def) }
export function createVehicleCraft(ctx, spec) {
  const { scene, GR, crafts, fx, sfx, say } = ctx, kd = ctx.keyDown, S = spec.sim, MDL = spec.model;
  MDL.group.visible = false; scene.add(MDL.group);
  const V = {
    id: spec.id, label: spec.label, kind: 'ground', seats: spec.seats, sim: S, model: MDL, exists: false, seat: 0, view: 'first',
    look: null, head: { yaw: 0, pitch: 0 }, orbit: { yaw: 0, pitch: 0.18 }, wreckT: 0,
  };
  S.self = V;   // its own footprint doesn't block it
  const P = S.P || {};
  const HL = (P.L || 4) / 2, HW = (P.W || 2) / 2, HT = P.H || 2;
  // ---------------------------------------------------------------- presence, frames, seats
  V.present = () => V.exists;
  V.frame = out => { out.x = S.x; out.y = S.y; out.z = S.z; out.yaw = S.yaw; return out; };
  V.spawnAt = sp => {
    S.reset?.(); S.place(sp.x, sp.y ?? GR.floor(sp.x, sp.z, 1e4, 1e5), sp.z, sp.yaw ?? 0); GR.settle(S, true);
    V.exists = true; V.wreckT = 0; MDL.group.visible = true; return V;
  };
  V.stow = () => { V.exists = false; MDL.group.visible = false; };
  V.enter = (seat = 0) => {
    if (!V.exists) return false;
    if (S.sunk) { say(`THE ${spec.label} IS UNDER WATER`, 1.5); return false; }
    if (S.dead) { say(`THE ${spec.label} IS A WRECK`, 1.5); return false; }
    V.seat = seat; V.head.yaw = V.head.pitch = 0; V.orbit.yaw = 0;
    const role = V.seats[seat].role;
    if (role === 'driver' && !S.engineOn && !S.flooded && S.fuel > 0) { S.engineOn = true; say(`${spec.label}  -  ENGINE RUNNING  ·  W / S DRIVE  ·  A / D STEER  ·  Y GET OUT`, 2.5); }
    return true;
  };
  V.setSeat = i => { if (!V.seats[i]) return false; V.seat = i; V.head.yaw = V.head.pitch = 0; return true; };
  V.canExit = () => Math.abs(S.v) > 1.5 && !S.sunk ? `STOP FIRST  -  ${Math.round(Math.abs(S.v) * 3.6)} km/h` : '';
  V.exit = () => { ctl.drive = 0; ctl.steer = 0; ctl.handbrake = true; };
  // world spots to step out to: this seat's exit, then the others, then the bonnet (in deep water: swim off the roof)
  V.exitSpots = () => {
    const out = [], order = [V.seat, ...V.seats.map((_, i) => i).filter(i => i !== V.seat)];
    for (const i of order) { const s = V.seats[i]; if (s.exit) { const w = crafts.toWorld(V, s.exit); if (w) out.push({ x: w.x, y: S.y, z: w.z, yaw: S.yaw }); } }
    out.push({ x: S.x, y: S.y + HT, z: S.z, yaw: S.yaw });
    return out;
  };
  // ---------------------------------------------------------------- driving
  const ctl = { drive: 0, steer: 0, handbrake: true, engine: undefined };
  let thrLast = null;
  function readDriver(input) {
    const pad = input.pad && !input.keyboardOnly ? input.pad : null, st = ctx.CTL && ctx.CTL.state, hw = ctx.hwOn ? ctx.hwOn() : true;
    let drive = (kd('KeyW', 'ArrowUp') ? 1 : 0) - (kd('KeyS', 'ArrowDown') ? 1 : 0), steer = (kd('KeyD', 'ArrowRight') ? 1 : 0) - (kd('KeyA', 'ArrowLeft') ? 1 : 0);
    let hand = kd('Space');
    if (pad) {   // gamepad: left stick steers, right trigger gas, left trigger brake / reverse, A handbrake
      const ax = Math.abs(pad.axes[0] || 0) > 0.12 ? pad.axes[0] : 0; if (ax) steer = ax;
      const rt = pad.buttons[7] ? pad.buttons[7].value : 0, lt = pad.buttons[6] ? pad.buttons[6].value : 0;
      if (rt > 0.05 || lt > 0.05) drive = rt - lt;
      if (pad.buttons[0] && pad.buttons[0].pressed) hand = true;
    }
    if (hw && st && st.source && st.source !== 'NONE') {   // HOTAS: stick or pedals steer, throttle lever = gas, toe brakes / stick aft = brake
      if (st.stick && Math.abs(st.stick.x) > 0.05) steer = st.stick.x;
      if (st.hasPedals && Math.abs(st.rudder) > 0.05) steer = st.rudder;
      if (st.throttle !== null && st.throttle !== undefined) { if (thrLast === null) thrLast = st.throttle; if (Math.abs(st.throttle - thrLast) > 0.03 || V._hwThr) { V._hwThr = true; thrLast = st.throttle; drive = Math.max(drive, st.throttle); } }
      const br = Math.max(st.brakeL || 0, st.brakeR || 0, st.stick && st.stick.y > 0.5 ? st.stick.y : 0); if (br > 0.05) drive = -br;
    }
    ctl.drive = clamp(drive, -1, 1); ctl.steer = clamp(steer, -1, 1); ctl.handbrake = hand;
  }
  V.update = (dt, input) => {
    const role = V.seats[V.seat].role;
    if (role === 'driver' && !S.dead) readDriver(input); else { ctl.drive = 0; ctl.steer = 0; ctl.handbrake = !S.dead ? ctl.handbrake : true; }
    spec.controls?.(ctl, input, V);
    step(dt);
    if (S.sunk && !V._sunkSaid) { V._sunkSaid = true; say(`THE ${spec.label} IS SINKING  -  GET OUT (Y)`, 3); }
  };
  V.idle = dt => { if (!V.exists) return; ctl.drive = 0; ctl.steer = 0; ctl.handbrake = true; step(dt); };
  function step(dt) {
    V._dt = dt;
    const evs = S.step(dt, ctl, GR); ctl.engine = undefined;
    for (const e of evs) {
      if (e.e === 'crash') { sfx.thump?.(Math.min(1, e.v / 12)); if (e.v > 6) V.damage((e.v - 6) * 0.06, 'CRASH'); if (e.v > 9 && crafts.active === V) ctx.crewHit?.((e.v - 9) * 0.05, 'CRASH'); }
      else if (e.e === 'land' && e.v > 7) { sfx.thump?.(0.4); V.damage((e.v - 7) * 0.05, 'HARD LANDING'); }
      else if (e.e === 'flood' && crafts.active === V) say('ENGINE DROWNED  -  TOO DEEP TO FORD', 2.2);
      else if (e.e === 'stall' && crafts.active === V) say(S.flooded ? 'ENGINE DROWNED  -  IT WILL NOT START' : S.fuel <= 0 ? 'OUT OF FUEL' : 'ENGINE STALLED', 1.6);
    }
  }
  // ---------------------------------------------------------------- damage
  V.damage = (amount, why) => {
    if (S.dead) return;
    S.hp -= amount * VEH_HP_PER_WAR_UNIT;
    if (S.hp <= 0) {
      S.hp = 0; S.dead = true; S.engineOn = false; V.wreckT = 0;
      fx.explode(S.x, S.y + 1, S.z, 1.6, { fire: 70, debris: 10, color: 0x3d4430 }); sfx.boom(0.9);
      ctx.unitLost?.(V, `${spec.label} DESTROYED`, crafts.active === V);   // COMMANDER: the fleet's loss
      if (crafts.active === V) ctx.crewKilled?.(`${spec.label} DESTROYED`);
      else ctx.feed?.(`${spec.label} DESTROYED`, 'bad');
    }
  };
  V.hurt = (amount, why, at) => {
    V.damage(amount, why);
    if (crafts.active === V && !S.dead && Math.random() < (spec.exposed ?? 0.3)) ctx.crewHit?.(amount, why, at);   // open vehicles: the round finds the crew
    else if (crafts.active === V && !S.dead) say(`${why}  -  ${spec.label} HIT (${Math.round(S.hp)}%)`, 1.2);
  };
  // ---------------------------------------------------------------- what war.js sees
  V.pl = {
    alive: () => !S.dead, inCave: false, landed: () => S.onGround && Math.abs(S.v) < 1,
    hitR: spec.hitR ?? 2.0, sight: spec.sight ?? 140, capTime: spec.capTime ?? 8,
    detect: () => S.engineOn ? 0.8 : 0.55,
  };
  // after war.update moved the ships: a vehicle on a deck rides along now (no one-frame lag) and knows the deck's speed
  const deckV = { x: 0, z: 0 };
  V.afterWar = () => {
    if (!S.plat) { deckV.x = deckV.z = 0; return; }
    GR.carry(S); const c = S.carried, dt = V._dt || 0.016; if (c) { deckV.x = c.dx / dt; deckV.z = c.dz / dt; S.shift?.(c); }
    GR.settle(S, S.onGround);
  };
  V.avatar = Z => {
    Z.pos.set(S.x, S.y + HT * 0.5, S.z); Z.vel.set(-Math.sin(S.yaw) * S.v + deckV.x, S.vy, -Math.cos(S.yaw) * S.v + deckV.z);
    Z.facing.set(-Math.sin(S.yaw), -Math.cos(S.yaw));
  };
  V.bounds = () => V.exists ? (V._b ||= {}, Object.assign(V._b, { x: S.x, z: S.z, yaw: S.yaw, hl: HL, hw: HW, y0: S.y, y1: S.y + HT, def: V })) : null;
  // ---------------------------------------------------------------- input, views
  V.key = code => {
    if (code === 'KeyV') { V.view = V.view === 'first' ? 'chase' : 'first'; say(V.view === 'first' ? `${V.seats[V.seat].label}'S VIEW` : 'CHASE VIEW', 1); return true; }
    if (code === 'KeyI' && V.seats[V.seat].role === 'driver') { if (S.engineOn) { S.engineOn = false; say('ENGINE OFF', 1.2); } else { ctl.engine = true; say(S.flooded ? 'ENGINE DROWNED  -  IT WILL NOT START' : 'ENGINE START', 1.2); } return true; }
    if (code === 'KeyH') { sfx.blip?.(420, 400, 0.35, 'square', 0.08); return true; }
    if (spec.key && spec.key(code, V)) return true;
    return ['KeyO', 'KeyU', 'KeyL', 'KeyN', 'KeyG', 'KeyB', 'KeyR', 'KeyQ', 'KeyE', 'Home', 'PageUp', 'PageDown', 'KeyF', 'KeyX', 'KeyC', 'KeyZ'].includes(code);
  };
  const SENS = 0.0025;
  V.look = (dx, dy) => {
    if (V.view === 'first') { V.head.yaw = clamp(V.head.yaw - dx * SENS, -2.4, 2.4); V.head.pitch = clamp(V.head.pitch - dy * SENS, -1.0, 0.9); }
    else { V.orbit.yaw -= dx * SENS; V.orbit.pitch = clamp(V.orbit.pitch + dy * SENS, -0.1, 1.2); }
  };
  V.firstPerson = () => V.view === 'first';
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _cp = new THREE.Vector3();
  const bodyQ = q => q.setFromEuler(_e.set(S.pitch, S.yaw, -S.roll, 'YXZ'));
  V.camera = (cam, dt, view) => {
    V._dt = dt;
    if (V.view === 'first') {
      const s = V.seats[V.seat], e = s.eye || [0, 1.5, 0];
      bodyQ(_q); cam.position.set(e[0], e[1], e[2]).applyQuaternion(_q).add(_v.set(S.x, S.y, S.z));
      if (!view || !view.locked) { const k = Math.exp(-5 * dt); V.head.yaw *= k; V.head.pitch *= k; }
      cam.quaternion.copy(_q).multiply(new THREE.Quaternion().setFromEuler(_e.set(V.head.pitch - 0.05, V.head.yaw, 0, 'YXZ')));
      const sh = Math.min(0.02, Math.abs(S.v) * 0.0012) * (S.surface === 'road' || S.surface === 'deck' ? 0.4 : 1); cam.position.y += (Math.random() - 0.5) * sh;
    } else {   // chase: behind and above, swinging round with the vehicle; the mouse orbits
      const yaw = S.yaw + V.orbit.yaw, d = 7.5 + HL * 1.2, up = 1.6 + d * Math.sin(V.orbit.pitch);
      _cp.set(S.x + Math.sin(yaw) * d * Math.cos(V.orbit.pitch), S.y + up, S.z + Math.cos(yaw) * d * Math.cos(V.orbit.pitch));
      { const g = GR.floor(_cp.x, _cp.z, _cp.y + 20, 50); if (g !== Infinity && _cp.y < g + 1.5) _cp.y = g + 1.5; }   // over a crest: look over it
      if (!V._chase) V._chase = _cp.clone(); else V._chase.lerp(_cp, 1 - Math.exp(-6 * dt));
      if (V._chase.distanceTo(_cp) > 30) V._chase.copy(_cp);
      cam.position.copy(V._chase); GR.clearView(S.x, S.y + 1.4, S.z, cam.position, V);
      const g = GR.floor(cam.position.x, cam.position.z, cam.position.y, 50); if (g !== Infinity && cam.position.y < g + 0.8) cam.position.y = g + 0.8;
      cam.lookAt(S.x, S.y + 1.2, S.z);
      if (!view || !view.locked) V.orbit.yaw *= Math.exp(-1.5 * dt);
    }
  };
  V.render = (dt, time, fp) => {
    if (!V.exists) { MDL.group.visible = false; return; }
    MDL.group.visible = true; MDL.group.position.set(S.x, S.y + (S.sunk ? -Math.min(HT * 1.5, (V.wreckT += dt) * 0.4) : 0), S.z); bodyQ(MDL.group.quaternion);
    MDL.animate(S, dt, { driverIn: crafts.active === V || false, firstPerson: crafts.active === V && fp, seat: V.seat });
    if (S.dead && Math.random() < 0.3) fx.trail?.(S.x, S.y + 1.2, S.z, 1);
    // engine sound: the one you drive (inside), or a parked one running near you
    const cam = ctx.camZ ? ctx.camZ() : null, inside = crafts.active === V;
    const dist = cam ? Math.hypot(cam.position.x - S.x, cam.position.y - S.y, cam.position.z - S.z) : 0;
    if (inside || (S.engineOn && dist < 60 && !(crafts.active && crafts.active.kind === 'ground'))) sfx.motor?.({ rpm: S.rpm, load: Math.abs(ctl.drive), cyl: spec.cyl || 4, inside: inside && fp, on: inside ? 1 : Math.max(0, 1 - dist / 60) });
  };
  V.silence = () => sfx.motor?.({ rpm: 0, on: 0 });
  V.hud = () => {
    const role = V.seats[V.seat].role, kmh = Math.abs(S.v) * 3.6;
    const line = `${spec.label}  ·  ${V.seats[V.seat].label}  ·  ${kmh.toFixed(0)} km/h  ·  ${S.engineOn ? `${S.gear}  ${Math.round(S.rpm)} RPM` : 'ENGINE OFF'}  ·  ${S.surface.toUpperCase()}${S.water > 0.05 ? `  ·  FORDING ${S.water.toFixed(2)} m / ${(P.FORD || 0).toFixed(2)}` : ''}  ·  HULL ${Math.round(S.hp)}%`;
    const hint = S.dead ? 'DESTROYED  -  Y TO GET OUT' : S.sunk ? 'UNDER WATER  -  Y TO GET OUT AND SWIM' : S.flooded ? 'ENGINE DROWNED  -  GET OUT AND WALK' : role !== 'driver' ? `RIDING  -  [ ] CHANGE SEAT  ·  Y GET OUT  ·  V VIEW` :
      !S.engineOn ? 'I: START THE ENGINE' : 'W / S DRIVE  ·  A / D STEER  ·  SPACE HANDBRAKE  ·  I ENGINE  ·  H HORN  ·  V VIEW  ·  [ ] SEAT  ·  Y GET OUT';
    return { line, hint, weap: spec.weapLine ? spec.weapLine(V) : '', fuel: S.fuel / (P.FUEL || 1) * 100, fuelLabel: 'FUEL' };
  };
  return V;
}
