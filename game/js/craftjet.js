// FOUNDATION: the HORNET as a craft (craft.js) - the proof that a full aircraft fits the interface. jetplay.js keeps
// everything about flying it; this adapter holds what used to be scattered through main.js: taking a jet from the
// deck (5), getting out on deck and walking away (Y; the jet stays parked and rides the carrier), climbing back in,
// losing it, cameras, keys, HUD lines, the pause/silence hook and what war.js sees.
import * as THREE from 'three';
import { COST } from './war.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
// ctx: { JP, war, G, Z, CTL, say, feed, sfx, crafts, GR, head, view: { get cockpit, set cockpit, freeLook, locked() },
//        ckFov(), hover(), heliOnDeck() -> bool, spotHeli(), toHeli(msg), advise(dt), serviceAt(x, z), gameOver() }
export function createJetCraft(ctx) {
  const { JP, war, G, Z, CTL, say, feed, sfx, crafts, head } = ctx;
  const J = JP.J, _f = new THREE.Vector3(), _q = new THREE.Quaternion(), _yAx = new THREE.Vector3(0, 1, 0);
  const yawOf = () => { J.forward(_f); return Math.atan2(-_f.x, -_f.z); };
  const park = { x: 0, y: 0, z: 0, yaw: 0, plat: null, loc: null, carried: null, on: false };
  const D = {
    id: 'jet', label: 'HORNET', kind: 'air', JP, park,
    seats: [{ id: 'pilot', label: 'PILOT', role: 'driver', door: [-1.7, -0.9, -3.2], exit: [-2.3, -1.92, -3.4], reach: 2.4 }],
  };
  // ---------------------------------------------------------------- presence and frames
  D.present = () => JP.active && JP.alive && !JP.ejected;
  D.frame = out => { out.x = J.pos.x; out.y = J.pos.y; out.z = J.pos.z; out.yaw = yawOf(); return out; };
  D.bounds = () => D.present() && J.onGround ? (D._b ||= {}, Object.assign(D._b, (() => { const y = yawOf(), c = Math.cos(y), s = Math.sin(y), ox = 1.2; return { x: J.pos.x + ox * s, z: J.pos.z + ox * c, yaw: y, hl: 8.2, hw: 1.5, y0: J.pos.y - 1.7, y1: J.pos.y + 3, def: D }; })())) : null;
  // ---------------------------------------------------------------- taking a jet (5 on the ALBATROSS deck, in the helicopter)
  // COMMANDER (o.command): the commander takes a Hornet out from any unit - the reserve was already counted by the
  // caller (units/commander/); the Huey, if it sits on the deck, goes down to the hangar; the unit you leave carries on
  D.launch = (o = {}) => {
    if (G.mode !== 'zarch') { say('CLIMB OUT OF THE CAVE FIRST', 1.6); return false; }
    const c = war.carrier; if (!c || c.sinking !== undefined) { say('NO CARRIER  -  NO JETS', 1.6); return false; }
    if (o.command) {
      if (D.present()) return false;
      if (ctx.catBusy && ctx.catBusy(D)) { say(ctx.catBusy(D), 2); return false; }
      const stowed = ctx.heliOnDeck() && !ctx.heliStowed(); if (stowed) ctx.stowHeli();
      if (!JP.launch()) { if (stowed) ctx.unstowHeli(); return false; }
      park.on = false; D.wing = null;
      if (!crafts.control('jet', 0, 'command')) return false;
      JP.snapChase(); head.yaw = head.pitch = 0; ctx.turnIntoClear(); return true;
    }
    if (G.craft === 'jet') { if (JP.stoppedOnDeck() || J.cat) { JP.respot(); ctx.turnIntoClear(); } else say('TRAP ON THE ALBATROSS FIRST: GEAR, FLAPS FULL, HOOK DOWN', 2); return; }
    if (D.present() && !park.on) { crafts.control('jet', 0, 'command'); return; }   // COMMANDER: she is out with the wingman - take her where she is
    if (G.craft !== 'heli') { say(D.present() && park.on ? 'WALK TO THE PARKED HORNET AND GET IN (Y)' : 'LAND THE HELICOPTER ON THE ALBATROSS TO TAKE A JET', 1.8); return; }
    if (!ctx.heliOnDeck()) { say('LAND ON THE ALBATROSS TO TAKE A JET', 1.8); return; }
    if (D.present() && park.on) {   // a Hornet is already parked on deck: that one goes to the cat
      ctx.stowHeli(); park.on = false; if (!JP.launch()) { ctx.unstowHeli(); return; }
      crafts.setActive('jet'); JP.snapChase(); head.yaw = head.pitch = 0; ctx.turnIntoClear(); return;
    }
    if (G.jets <= 0) { if (G.mat < COST.jet) { say(`NO HORNETS LEFT  -  A NEW ONE COSTS ${COST.jet} MATERIEL`, 2); return; } G.mat -= COST.jet; G.jets++; feed('NEW HORNET DELIVERED TO THE ALBATROSS', 'good'); }
    G.jets--; ctx.stowHeli();
    if (!JP.launch()) { ctx.unstowHeli(); G.jets++; return; }
    park.on = false; crafts.setActive('jet'); JP.snapChase(); head.yaw = head.pitch = 0; ctx.turnIntoClear();
  };
  // ---------------------------------------------------------------- in and out
  D.enter = (seat, from) => {
    if (!D.present()) return false;
    if (D.wing) {   // COMMANDER: back from another unit - the wingman hands over where he is (throttle where he had it)
      JP.thr = clamp(D.wing.FD.thr, 0, 1); JP.thrSrc = 'kb'; JP.kb.pitch = JP.kb.roll = JP.kb.yaw = 0; JP.pbrake = false; D.wing = null;
      say(J.onGround ? 'YOU HAVE THE HORNET' : `YOU HAVE THE HORNET  -  ${Math.round(J.pos.y * 3.28)} FT  ${Math.round(J.eas * 1.944)} KT`, 2);
    }
    if (from === 'foot') { say('IN THE HORNET  -  I ENGINES  ·  5 TO THE CATAPULT  ·  Y GET OUT', 2.5); head.yaw = head.pitch = 0; J.canopyCmd = 0; }
    if (from === 'command') { head.yaw = head.pitch = 0; JP.snapChase(); if (park.on) { J.canopyCmd = 0; JP.pbrake = true; for (const e of J.eng) if (!e.run && e.n < 0.5) e.start = 0.01; } }   // the deck crew has her turning again
    park.on = false; return true;
  };
  D.canExit = () => (JP.stoppedOnDeck() || (J.cat && J.cat.state === 'hold')) ? '' : 'STOP ON THE ALBATROSS DECK FIRST';
  D.exitSpots = () => { const w = crafts.toWorld(D, D.seats[0].exit), w2 = crafts.toWorld(D, [2.3, -1.92, -3.4]), w3 = crafts.toWorld(D, [0, -1.92, -11]); return [w, w2, w3].filter(Boolean).map(p => ({ x: p.x, y: p.y, z: p.z, yaw: yawOf() })); };
  // COMMANDER: the commander switches away while she flies (or rolls, or is being shot off the cat): the wingman flies
  // her (units/commander/wingman.js) - CAP over the ALBATROSS, home at bingo or on recall, a trap, then she parks
  D.flying = () => D.present() && (!J.onGround || (J.cat && J.cat.state !== 'hold') || (!J.cat && !JP.stoppedOnDeck()));
  D.wing = null;
  D.exit = next => {
    if (D.present() && D.flying() && next && next !== D) {
      D.wing = ctx.createWingman(J, 'HORNET', 'HORNET'); JP.firing = false; sfx.jetGun?.(false); sfx.seeker?.(0); J.canopyCmd = 0;
      feed(J.onGround ? 'HORNET: THE DECK CREW HAS HER' : 'HORNET: WINGMAN HAS THE JET  -  CAP OVER THE ALBATROSS', 'info'); return;
    }
    parkHere();
  };
  D.recall = () => { if (D.wing) D.wing.recall(); };
  D.status = () => !D.present() ? '' : D.wing ? (D.wing.state === 'cap' || D.wing.state === 'climb' ? 'CAP' : D.wing.state === 'trapped' ? 'RECOVERING' : D.wing.state === 'cat' ? 'LAUNCHING' : 'RETURNING') : park.on ? 'PARKED ON DECK' : 'FLYING';
  // the pilot climbs down: engines off, canopy open, parking brake on; the Hornet stays where it stopped and rides the deck
  function parkHere() {
    D.wing = null;
    if (J.cat) { J.cat = null; J.launchBar = false; park.cat = true; } else park.cat = false;
    for (const e of J.eng) { e.run = false; e.start = 0; }
    J.canopyCmd = 1; JP.pbrake = true; JP.firing = false; sfx.jetGun?.(false); sfx.seeker?.(0);
    park.x = J.pos.x; park.y = J.pos.y - 1.92; park.z = J.pos.z; park.yaw = yawOf(); park.plat = null; park.loc = null;
    ctx.GR.settle(park, true); park.on = true;
    if (ctx.heliStowed()) ctx.spotHeli();   // the deck crew brings the Huey up from the hangar
  };
  // parked on deck: carried with the ship, kept exactly on its spot (kinematic), engines spooling down
  D.idle = dt => {
    if (D.wing) {   // COMMANDER: the wingman flies her; once trapped and stopped she parks where the wire left her
      if (!D.present()) { D.wing = null; return; }
      JP.wingman(dt, D.wing, ctx.aiEnv);
      if (D.wing && D.wing.recovered && J.onGround && !J.wire) { feed('HORNET RECOVERED ABOARD THE ALBATROSS', 'good'); parkHere(); }
      return;
    }
    if (!park.on || !D.present()) return;
    for (const e of J.eng) { e.n = Math.max(0, e.n - 0.12 * dt); e.ab = 0; }
    J.canopy = Math.min(1, J.canopy + dt * 0.25); park.dt = dt;
  };
  D.afterWar = () => {   // after the ships moved: ride the deck, exactly on the spot it stopped
    if (!park.on || !D.present()) return;
    ctx.GR.carry(park);
    const c = park.carried, dt = Math.max(park.dt || 0.016, 1e-3);
    if (c) { J.pos.set(park.x, park.y + 1.92, park.z); if (c.dyaw) J.q.premultiply(_q.setFromAxisAngle(_yAx, c.dyaw)); J.vel.set(c.dx / dt, c.dy / dt, c.dz / dt); }
    ctx.GR.settle(park, true);
  };
  // ---------------------------------------------------------------- flying
  D.update = (dt, inp) => {
    JP.update(dt, inp);
    const E = JP.ejected;
    Z.pos.copy(E ? E.pos : J.pos); Z.vel.copy(E ? E.vel : J.vel); Z.landed = J.onGround;
    J.forward(_f); const fl = Math.hypot(_f.x, _f.z); if (fl > 0.15) Z.facing.set(_f.x / fl, _f.z / fl);
    if (JP.alive && !E) ctx.advise(dt);
    if (G.jetDownT > 0) {
      G.jetDownT -= dt;
      if (G.jetDownT <= 0 && !G.over) { JP.stow(); park.on = false; ctx.toHeli(war.carrier && war.carrier.sinking === undefined ? 'HELICOPTER ON THE ALBATROSS' : 'HELICOPTER ON THE HOME PAD'); }
    }
  };
  D.lost = (why, ejected) => {   // jetplay's onLost: ejected (pilot rescued) or crashed (pilot lost: that costs a life too)
    // COMMANDER: a lost airframe is the fleet's loss (units/commander/fleet.js); with the wingman flying it the commander
    // hears it in the feed, and only the unit you are in hands you on (jetDownT -> the next unit)
    const mine = crafts.active === D; park.on = false; D.wing = null;
    feed(ejected ? 'HORNET LOST  -  PILOT RECOVERED' : 'HORNET AND PILOT LOST', 'bad');
    if (mine) { G.jetDownT = ejected ? 0.5 : 3; if (ejected) say(why, 2.5); }
    ctx.onUnitLost?.('jet', why, mine);
  };
  D.writeOff = () => { JP.stow(); park.on = false; G.jetDownT = 0; D.wing = null; };
  D.key = code => {
    if (code === 'KeyJ') { CTL.toggle(); return true; }
    if (JP.key(code)) return true;
    return ['KeyH', 'KeyI', 'KeyO', 'KeyU', 'KeyL', 'KeyN'].includes(code);
  };
  // ---------------------------------------------------------------- views, HUD, sound
  const ckOn = () => ctx.view.cockpit && JP.alive && !JP.ejected;
  D.firstPerson = () => ckOn();
  D.zoomK = () => ckOn() ? Math.max(JP.zoom, CTL.state.actions && CTL.state.actions.zoom ? 1 : 0) : 0;
  D.fov = ck => lerp(ck, ck * 0.4, D.zoomK());
  D.camera = (cam, dt) => {
    if (ckOn()) {
      const h = CTL.state.actions && CTL.state.actions.lookhat !== false;   // POV hat looks around the cockpit
      if (h && (CTL.state.hatX || CTL.state.hatY)) { head.yaw = clamp(head.yaw - CTL.state.hatX * 2.2 * dt, -2.6, 2.6); head.pitch = clamp(head.pitch + CTL.state.hatY * 1.6 * dt, -1.1, 0.9); }
      else if (!ctx.view.freeLook || (!ctx.view.locked() && !h)) { const k = Math.exp(-6 * dt); head.yaw *= k; head.pitch *= k; }   // T (free look off) re-centres
      JP.cockpitCam(cam, dt, head);
    } else JP.chaseCam(cam, dt);
  };
  D.render = (dt, time, fp) => {
    if (!JP.active) return;
    JP.render(dt, time, crafts.active === D && fp, crafts.active === D ? ctx.hover() : null);
    if (crafts.active !== D) { const cam = ctx.camZ(), d = cam ? cam.position.distanceTo(J.pos) : 0; sfx.jet?.((J.eng[0].n + J.eng[1].n) / 2, 0, 0, false, Math.max(0, 1 - d / 150) * (J.eng[0].n > 0.05 ? 1 : 0)); }
  };
  D.silence = () => { sfx.jet?.(0, 0, 0, false, false); sfx.seeker?.(0); sfx.jetGun?.(false); };
  D.hud = () => {
    const hv = ctx.hover();
    return { line: JP.hudLine(), hint: hv ? `${JP.cockpit.labelOf(hv)}  -  CLICK` : JP.stoppedOnDeck() ? '5: BACK TO THE CATAPULT  ·  Y: GET OUT (WALK THE DECK)  ·  REFUELLING / REARMING' : JP.hint(), weap: JP.weapLine(), fuel: J.fuel / 27.2, fuelLabel: 'FUEL' };
  };
  D.menuNote = () => `JET FUEL ${Math.round(J.fuel * 2.20462)} LB`;
  // ---------------------------------------------------------------- what war.js sees
  const _rk = new THREE.Vector3();
  D.pl = {
    alive: () => JP.alive && !JP.ejected, inCave: false, landed: false, hitR: 4.5, sight: 220,
    sources: () => {   // the radar: a wide patch of sight ahead of the nose
      if (!JP.alive) return null; const f = J.forward(_rk), l = Math.hypot(f.x, f.z) || 1;
      return [{ x: Z.pos.x + f.x / l * 420, z: Z.pos.z + f.z / l * 420, r: 320 }];
    },
  };
  D.hurt = (amount, why) => JP.hurt(amount, why);
  return D;
}
