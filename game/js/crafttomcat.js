// TOMCAT: the F-14A as a craft (craft.js), like craftjet.js does it for the HORNET. units/air/tomcatplay.js flies it;
// this adapter is the part the game host sees: taking one from the ALBATROSS deck (8, with the hangar count G.tomcats),
// two seats (PILOT and RIO, [ / ] to change), climbing out on deck and walking away (Y; it stays parked and rides the
// carrier), climbing back in by the boarding ladder on the left side, losing it, cameras, keys, HUD lines, the
// pause / silence hook and what war.js sees.
import * as THREE from 'three';
import { TOMCAT, TOMCAT_AF } from './units/air/tomcatfm.js';
import { createTomcatPlay } from './units/air/tomcatplay.js';
import { startSet } from './units/air/tomcatsys.js';   // COMMANDER + TOMCAT cockpit: a jet you switch into is handed over hot

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
export const COST_TOMCAT = 100;   // materiel for a new airframe when the hangar is empty (a HORNET is 80)
// ctx: the HORNET's craft ctx (craftjet.js) plus playCtx (what jetplay.js got) and onLostHook
export function createTomcatCraft(ctx) {
  const { war, G, Z, CTL, say, feed, sfx, crafts, head } = ctx;
  const TP = createTomcatPlay({ ...ctx.playCtx, onLost: (why, ej) => D.lost(why, ej), onEject: () => {}, toggleView: () => { ctx.view.cockpit = !ctx.view.cockpit; if (!ctx.view.cockpit) TP.snapChase(); } });
  const A = TP.A, _f = new THREE.Vector3(), _q = new THREE.Quaternion(), _yAx = new THREE.Vector3(0, 1, 0);
  const yawOf = () => { A.forward(_f); return Math.atan2(-_f.x, -_f.z); };
  const park = { x: 0, y: 0, z: 0, yaw: 0, plat: null, loc: null, carried: null, on: false };
  const H0 = TOMCAT_AF.REST_H;   // CG height over the deck on the wheels
  const D = {
    id: 'tomcat', label: 'TOMCAT', kind: 'air', TP, park, jetLike: true,
    // the boarding ladder and steps are on the left side under the cockpits
    seats: [
      { id: 'pilot', label: 'PILOT', role: 'driver', door: [-1.3, -1.3, -5.4], exit: [-2.2, -H0, -5.4], reach: 2.6 },
      { id: 'rio', label: 'RIO', role: 'crew', door: [-1.3, -1.3, -4.2], exit: [-2.2, -H0, -4.0], reach: 2.6 },
    ],
  };
  // ---------------------------------------------------------------- presence and frames
  D.present = () => TP.active && TP.alive && !TP.ejected;
  D.frame = out => { out.x = A.pos.x; out.y = A.pos.y; out.z = A.pos.z; out.yaw = yawOf(); return out; };
  D.bounds = () => D.present() && A.onGround ? (D._b ||= {}, Object.assign(D._b, (() => { const y = yawOf(), c = Math.cos(y), s = Math.sin(y), ox = 0.8; return { x: A.pos.x + ox * s, z: A.pos.z + ox * c, yaw: y, hl: 9.6, hw: 1.7, y0: A.pos.y - H0, y1: A.pos.y + 2.6, def: D }; })())) : null;
  // ---------------------------------------------------------------- taking a Tomcat (8 on the ALBATROSS deck, in the helicopter)
  // COMMANDER (o.command): taken out from any unit, as craftjet.js does it for the HORNET
  D.launch = (o = {}) => {
    if (G.mode !== 'zarch') { say('CLIMB OUT OF THE CAVE FIRST', 1.6); return false; }
    const c = war.carrier; if (!c || c.sinking !== undefined) { say('NO CARRIER  -  NO TOMCATS', 1.6); return false; }
    if (o.command) {
      if (D.present()) return false;
      if (ctx.catBusy && ctx.catBusy(D)) { say(ctx.catBusy(D), 2); return false; }
      const stowed = ctx.heliOnDeck() && !ctx.heliStowed(); if (stowed) ctx.stowHeli();
      if (!TP.launch()) { if (stowed) ctx.unstowHeli(); return false; }
      park.on = false; D.wing = null;
      if (!crafts.control('tomcat', 0, 'command')) return false;
      TP.snapChase(); head.yaw = head.pitch = 0; ctx.turnIntoClear(); return true;
    }
    if (G.craft === 'tomcat') { if (TP.stoppedOnDeck() || A.cat) { TP.respot(); ctx.turnIntoClear(); } else say('TRAP ON THE ALBATROSS FIRST: GEAR, FLAPS DN, HOOK DOWN', 2); return; }
    if (D.present() && !park.on) { crafts.control('tomcat', 0, 'command'); return; }   // COMMANDER: out with the wingman - take her where she is
    if (G.craft !== 'heli') { say(D.present() && park.on ? 'WALK TO THE PARKED TOMCAT AND CLIMB IN (Y AT THE LADDER, LEFT SIDE)' : 'LAND THE HELICOPTER ON THE ALBATROSS TO TAKE A TOMCAT', 1.8); return; }
    if (!ctx.heliOnDeck()) { say('LAND ON THE ALBATROSS TO TAKE A TOMCAT', 1.8); return; }
    if (ctx.catFouled && ctx.catFouled()) { say('CAT 1 IS FOULED  -  A PARKED JET IS ON IT', 1.8); return; }
    if (D.present() && park.on) {   // one already parked on deck: that one goes to the cat
      ctx.stowHeli(); park.on = false; if (!TP.launch()) { ctx.unstowHeli(); return; }
      crafts.setActive('tomcat'); TP.snapChase(); head.yaw = head.pitch = 0; ctx.turnIntoClear(); return;
    }
    if (G.tomcats <= 0) { if (G.mat < COST_TOMCAT) { say(`NO TOMCATS LEFT  -  A NEW ONE COSTS ${COST_TOMCAT} MATERIEL`, 2); return; } G.mat -= COST_TOMCAT; G.tomcats++; feed('NEW TOMCAT DELIVERED TO THE ALBATROSS', 'good'); }
    G.tomcats--; ctx.stowHeli();
    if (!TP.launch()) { ctx.unstowHeli(); G.tomcats++; return; }
    park.on = false; crafts.setActive('tomcat'); TP.snapChase(); head.yaw = head.pitch = 0; ctx.turnIntoClear();
  };
  // ---------------------------------------------------------------- in and out
  D.enter = (seat, from) => {
    if (!D.present()) return false;
    if (D.wing) {   // COMMANDER: back from another unit - the wingman hands over where he is
      TP.thr = clamp(D.wing.FD.thr, 0, 1); TP.thrSrc = 'kb'; TP.kb.pitch = TP.kb.roll = TP.kb.yaw = 0; TP.pbrake = false; D.wing = null;
      say(A.onGround ? 'YOU HAVE THE TOMCAT' : `YOU HAVE THE TOMCAT  -  ${Math.round(A.pos.y * 3.28)} FT  ${Math.round(A.eas * 1.944)} KT`, 2);
    }
    TP.seat = 0; if (seat === 1) TP.setSeat(1);
    if (from === 'foot') { say(`IN THE TOMCAT  -  ${seat ? 'RIO' : 'PILOT'}  ·  I: AUTO START (OR CRANK + THROTTLES BY HAND)  ·  8 TO THE CATAPULT  ·  [ ] SEAT  ·  Y CLIMB OUT`, 2.5); head.yaw = head.pitch = 0; A.canopyCmd = 0; }
    if (from === 'command') { head.yaw = head.pitch = 0; TP.snapChase(); if (park.on) { A.canopyCmd = 0; TP.pbrake = true; startSet(TP.ss, true); for (const e of A.eng) if (!e.run && e.n < 0.5) e.start = 0.01; } }
    park.on = false; return true;
  };
  D.setSeat = i => TP.setSeat(i);
  D.canExit = () => (TP.stoppedOnDeck() || (A.cat && A.cat.state === 'hold')) ? '' : 'STOP ON THE ALBATROSS DECK FIRST';
  D.exitSpots = () => { const s = D.seats[crafts.seat] || D.seats[0], w = crafts.toWorld(D, s.exit), w2 = crafts.toWorld(D, [2.2, -H0, -5.0]), w3 = crafts.toWorld(D, [0, -H0, -12]); return [w, w2, w3].filter(Boolean).map(p => ({ x: p.x, y: p.y, z: p.z, yaw: yawOf() })); };
  // COMMANDER: switched away in flight (or rolling, or on the cat stroke): the wingman flies her (craftjet.js has the same)
  D.flying = () => D.present() && (!A.onGround || (A.cat && A.cat.state !== 'hold') || (!A.cat && !TP.stoppedOnDeck()));
  D.wing = null;
  D.exit = next => {
    if (D.present() && D.flying() && next && next !== D) {
      D.wing = ctx.createWingman(A, 'TOMCAT', 'TOMCAT'); TP.firing = false; TP.silence(); TP.seat = 0; A.canopyCmd = 0;
      feed(A.onGround ? 'TOMCAT: THE DECK CREW HAS HER' : 'TOMCAT: WINGMAN HAS THE JET  -  CAP OVER THE ALBATROSS', 'info'); return;
    }
    parkHere();
  };
  D.recall = () => { if (D.wing) D.wing.recall(); };
  D.status = () => !D.present() ? '' : D.wing ? (D.wing.state === 'cap' || D.wing.state === 'climb' ? 'CAP' : D.wing.state === 'trapped' ? 'RECOVERING' : D.wing.state === 'cat' ? 'LAUNCHING' : 'RETURNING') : park.on ? 'PARKED ON DECK' : 'FLYING';
  function parkHere() {   // the crew climbs down: engines off, canopy up, parking brake set; it rides the deck where it stopped
    D.wing = null;
    if (A.cat) { A.cat = null; A.launchBar = false; park.cat = true; } else park.cat = false;
    TP.shutdown();   // throttles OFF, crank OFF: a cold jet for the next crew (the start on the switches, or I)
    A.canopyCmd = 1; TP.pbrake = true; TP.firing = false; TP.silence(); TP.seat = 0;
    park.x = A.pos.x; park.y = A.pos.y - H0; park.z = A.pos.z; park.yaw = yawOf(); park.plat = null; park.loc = null;
    ctx.GR.settle(park, true); park.on = true;
    if (ctx.heliStowed()) ctx.spotHeli();
  };
  D.idle = dt => {
    if (D.wing) {   // COMMANDER: the wingman flies her; trapped and stopped, she parks
      if (!D.present()) { D.wing = null; return; }
      TP.wingman(dt, D.wing, ctx.aiEnv);
      if (D.wing && D.wing.recovered && A.onGround && !A.wire) { feed('TOMCAT RECOVERED ABOARD THE ALBATROSS', 'good'); parkHere(); }
      return;
    }
    if (!park.on || !D.present()) return;
    for (const e of A.eng) { e.n = Math.max(0, e.n - 0.1 * dt); e.ab = 0; e.egt += (20 - e.egt) * Math.min(1, 0.1 * dt); }
    A.canopy = Math.min(1, A.canopy + dt * 0.25); park.dt = dt;
  };
  D.afterWar = () => {
    if (!park.on || !D.present()) return;
    ctx.GR.carry(park);
    const c = park.carried, dt = Math.max(park.dt || 0.016, 1e-3);
    if (c) { A.pos.set(park.x, park.y + H0, park.z); if (c.dyaw) A.q.premultiply(_q.setFromAxisAngle(_yAx, c.dyaw)); A.vel.set(c.dx / dt, c.dy / dt, c.dz / dt); }
    ctx.GR.settle(park, true);
  };
  // ---------------------------------------------------------------- flying
  D.update = (dt, inp) => {
    TP.update(dt, inp);
    const E = TP.ejectPos();
    Z.pos.copy(E || A.pos); Z.vel.copy(E ? TP.ejected.seats[TP.seat].vel : A.vel); Z.landed = A.onGround;
    A.forward(_f); const fl = Math.hypot(_f.x, _f.z); if (fl > 0.15) Z.facing.set(_f.x / fl, _f.z / fl);
    if (TP.alive && !E) ctx.advise(dt);
    if (G.tomcatDownT > 0) {
      G.tomcatDownT -= dt;
      if (G.tomcatDownT <= 0 && !G.over) { TP.stow(); park.on = false; ctx.toHeli(war.carrier && war.carrier.sinking === undefined ? 'HELICOPTER ON THE ALBATROSS' : 'HELICOPTER ON THE HOME PAD'); }
    }
  };
  D.lost = (why, ejected) => {
    const mine = crafts.active === D; park.on = false; D.wing = null;   // COMMANDER: the fleet's loss (craftjet.js has the same)
    feed(ejected ? 'TOMCAT LOST  -  CREW RECOVERED' : 'TOMCAT AND CREW LOST', 'bad');
    if (mine) { G.tomcatDownT = ejected ? 0.5 : 3; if (ejected) say(why, 2.5); }
    ctx.onUnitLost?.('tomcat', why, mine);
  };
  D.writeOff = () => { TP.stow(); park.on = false; G.tomcatDownT = 0; D.wing = null; };
  D.key = code => {
    if (code === 'KeyJ') { CTL.toggle(); return true; }
    if (TP.key(code)) return true;
    return ['KeyH', 'KeyI', 'KeyO', 'KeyU', 'KeyL', 'KeyN', 'KeyC', 'KeyB'].includes(code);
  };
  // ---------------------------------------------------------------- views, HUD, sound (main.js's jet hooks: cockpitObj, click, gfx, zoom)
  const ckOn = () => ctx.view.cockpit && TP.alive && !TP.ejected;
  D.firstPerson = () => ckOn();
  D.cockpitObj = () => TP.cockpit;
  D.click = id => TP.click(id);
  D.gfx = () => TP.gfx();
  D.glocNow = () => TP.gloc > 0;
  D.zoom = dz => { TP.zoom = clamp(TP.zoom + dz, 0, 1); };
  D.zoomK = () => ckOn() ? Math.max(TP.zoom, CTL.state.actions && CTL.state.actions.zoom ? 1 : 0) : 0;
  D.fov = ck => lerp(ck, ck * 0.4, D.zoomK());
  D.camera = (cam, dt) => {
    if (ckOn()) {
      const h = CTL.state.actions && CTL.state.actions.lookhat !== false;
      if (h && (CTL.state.hatX || CTL.state.hatY)) { head.yaw = clamp(head.yaw - CTL.state.hatX * 2.2 * dt, -2.6, 2.6); head.pitch = clamp(head.pitch + CTL.state.hatY * 1.6 * dt, -1.1, 0.9); }
      else if (!ctx.view.freeLook || (!ctx.view.locked() && !h)) { const k = Math.exp(-6 * dt); head.yaw *= k; head.pitch *= k; }
      TP.cockpitCam(cam, dt, head);
    } else TP.chaseCam(cam, dt);
  };
  D.render = (dt, time, fp) => {
    if (!TP.active) return;
    if (crafts.active === D) TP.render(dt, time, fp, ctx.hover());
    else { const cam = ctx.camZ(), d = cam ? cam.position.distanceTo(A.pos) : 0; TP.renderParked(dt, time, Math.max(0, 1 - d / (D.wing ? 320 : 160)) * (A.eng[0].n > 0.05 || A.eng[1].n > 0.05 ? 1 : 0), !!D.wing); }   // COMMANDER: the wingman's crew sits in it
  };
  D.silence = () => TP.silence();
  D.hud = () => {
    const hv = ctx.hover();
    return { line: TP.hudLine(), hint: hv ? `${TP.cockpit.labelOf(hv)}  -  CLICK` : TP.hint(), weap: TP.weapLine(), fuel: A.fuel / TOMCAT.FUEL_MAX * 100, fuelLabel: 'FUEL' };
  };
  D.menuNote = () => `TOMCAT FUEL ${Math.round(A.fuel * 2.20462)} LB`;
  // ---------------------------------------------------------------- what war.js sees
  const _rk = new THREE.Vector3();
  D.pl = {
    alive: () => TP.alive && !TP.ejected, inCave: false, landed: false, hitR: 5.5, sight: 260,
    sources: () => {   // the AWG-9: a big patch of sight ahead of the nose
      if (!TP.alive) return null; const f = A.forward(_rk), l = Math.hypot(f.x, f.z) || 1;
      return [{ x: Z.pos.x + f.x / l * 600, z: Z.pos.z + f.z / l * 600, r: 460 }];
    },
  };
  D.hurt = (amount, why) => TP.hurt(amount, why);
  return D;
}
