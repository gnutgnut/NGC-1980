// NGC-1980 ngc/infdepth: the player's Marine and the other Marines - BUDDY AID both ways, CASUALTY MOVEMENT and the
// DEAD's kit. marine.js creates this (Mr.care) and calls it from its key handler, its frame, its F (use) and its HUD.
//   * F by a wounded Marine (the ground war's men: groundsim.js units, on MEDINV's medical sim near the camera): his
//     HEALTH screen with YOUR kit - drag a dressing, a tourniquet, morphine onto him: MEDINV's buddy-aid API
//     (patient.startTreatment({ item, region, by: { self: false, skill: 'rifleman' } })), at buddy-aid times; you stay
//     within 1.5 m (BUDDY.treatRangeM) or the treatment stops.
//   * Shift+F by a casualty: DRAG him by the drag strap (you back up at MEDINV's BUDDY.dragSpeed for your mods, his
//     mass + kit and your load, rifle slung); F while dragging: FIREMAN'S CARRY (BUDDY.carrySpeed: both arms and good
//     legs needed); Shift+F: put him down. Stamina drains x2.2 dragging, x3.5 carrying (BUDDY.staminaDrainMul).
//     Carry him to the Huey's door and F loads him into the cabin (casevac.js flies him out with you).
//   * Bleeding near a squad, their corpsman comes to you (fieldcare.js treats you as a patient): stay still.
//   * F by a dead Marine: search his kit (his own rig when he died on the rich model).
import * as THREE from 'three';
import { BUDDY } from './units/infantry/medical.js';
import * as I from './units/infantry/inventory.js';
import { createMedUI } from './units/infantry/medui.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function createMarineCare(Mr, ctx) {
  const { war, GR, say } = ctx, { MS, W, S } = Mr;
  const GW = () => war.ground || null, GS = () => war.ground?.sim || null, CV = () => war.ground?.CV || null;
  const C = { hold: null, patient: null, ui: null, lastActive: -1, t: 0, treatedBy: null };
  // ---- the player as a patient of the ground war's corpsmen
  const me = {
    get x() { return W.x; }, get y() { return W.y; }, get z() { return W.z; },
    get M() { return MS.M; }, get inv() { return MS.inv; },
    get moving() { return S.speed > 0.35 || !!C.hold; },
    active: () => C.t - C.lastActive < 0.5 && !MS.dead,
  };
  let registered = null;
  function register() { const cv = CV(); if (cv && registered !== cv) { cv.setPlayer(me); registered = cv; const gw = GW(); if (gw) gw.sayHook = (txt, kind) => say(txt, 2.6); } }
  // ---- the casualty's HEALTH screen, treated with the player's kit
  const uiOpt = { med: null, inv: MS.inv, parent: typeof document !== 'undefined' ? document.body : null, tabs: ['HEALTH'], title: '', by: () => ({ self: false, skill: 'rifleman' }), onClose: () => { if (Mr.ui === 'patient') { Mr.ui = null; C.patient = null; } } };
  function openPatient(u) {
    if (typeof document === 'undefined') return;
    const gs = GS(); if (!u.rich) gs.enrich(u);   // (a man the camera had on the cheap model: on MEDINV's sim from now on)
    uiOpt.med = u.rich.M; uiOpt.inv = MS.inv; uiOpt.title = `${u.name || 'MARINE'}${u.role === 'doc' ? ' (CORPSMAN)' : ''}  -  BUDDY AID WITH YOUR KIT`;
    if (!C.ui) C.ui = createMedUI(uiOpt);
    if (document.pointerLockElement) document.exitPointerLock();
    Mr.closeScreens?.(); C.ui.open(); Mr.ui = 'patient'; C.patient = u;
    say(`${u.name || 'MARINE'}: DRAG AN ITEM FROM YOUR KIT ONTO HIM  ·  ESC CLOSE`, 2.5);
  }
  C.openPatient = openPatient;
  // ---- drag / carry
  const kgOf = u => 80 + I.totalWeight(GS().kitOf(u));
  function grab(u) {
    if (!u.cas) u.cas = { t: 0, callT: 5, treated: false, treatT: 0, need: 0, conscious: true, bleed: 600, held: null };
    u.cas.held = 'player'; u.cas.walkCCP = false; u.cas.toHuey = null;
    C.hold = { u, mode: 'drag', kg: kgOf(u) };
    say(`DRAGGING ${u.name || 'THE CASUALTY'}  -  SHIFT+F: FIREMAN'S CARRY`, 2);
  }
  function release(why) {
    const h = C.hold; if (!h) return; C.hold = null; MS.burden = null;
    const u = h.u; u.viewAt = null;
    if (u.cas) { u.cas.held = null; const P = u.B && GS()?.FC?.ccp(u.B, u.squad); if (P && Math.hypot(u.x - P.x, u.z - P.z) < 4) u.cas.atCCP = true; }
    if (u.alive && W) { const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw); GS()?.place(u, W.x + fx * 1.1, W.z + fz * 1.1, S.yaw + Math.PI); }
    if (why) say(why, 1.6);
  }
  C.release = release;
  // Shift+F: take hold of a casualty (drag) / put him down
  C.cycleHold = () => {
    const cv = CV(); if (!cv) return false;
    if (!C.hold) { const u = cv.casualtyNear(W.x, W.z, 2.4); if (!u) { say('NOBODY DOWN WITHIN REACH TO DRAG', 1.2); return true; } grab(u); return true; }
    release('YOU PUT HIM DOWN'); return true;
  };
  // F while dragging: lift him into a fireman's carry (needs both arms and good legs: BUDDY.carrySpeed)
  function lift() {
    const v = BUDDY.carrySpeed(MS.mods.med || {}, C.hold.kg, S.load);
    if (v <= 0) { say('YOU CAN\'T LIFT HIM  -  YOUR ARMS OR LEGS WON\'T TAKE IT', 1.8); return; }
    C.hold.mode = 'carry'; say(`FIREMAN'S CARRY  -  ${C.hold.kg.toFixed(0)} KG ON YOUR SHOULDERS  ·  SHIFT+F: PUT HIM DOWN`, 2.2);
  }
  C.lift = () => { if (C.hold && C.hold.mode === 'drag') lift(); return !!C.hold; };
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();
  function holdTick(dt) {
    const h = C.hold; if (!h) return;
    const u = h.u;
    if (!u.alive || u.evac || MS.dead || W.swim || W.ladder) { release(u.alive ? null : `${u.name || 'HE'} IS DEAD`); return; }
    const md = MS.mods.med || {};
    const v = h.mode === 'carry' ? BUDDY.carrySpeed(md, h.kg, S.load) : BUDDY.dragSpeed(md, h.kg, S.load);
    if (v <= 0) { release('YOU CAN\'T HOLD HIM ANY MORE'); return; }
    MS.burden = { v, drain: BUDDY.staminaDrainMul[h.mode] };
    const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw);
    if (h.mode === 'drag') {   // in front of you, head toward you: you back up with him
      u.viewAt = null;
      GS().place(u, W.x + fx * 0.75, W.z + fz * 0.75, Math.atan2(-fx, -fz));
    } else {   // across the shoulders, face down, his middle on your right shoulder
      GS().place(u, W.x, W.z, S.yaw);
      _q.setFromEuler(_e.set(0, S.yaw + Math.PI / 2, 0, 'YXZ')); _q2.setFromEuler(_e.set(0, 0, Math.PI, 'XYZ')); _q.multiply(_q2);
      _v.set(0, 0.13, -0.6).applyQuaternion(_q);   // (the down pose's middle, from its root)
      const rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw);
      u.viewAt = { x: W.x + rx * 0.12 - _v.x - fx * 0.05, y: S.eye.y - 0.12 - _v.y, z: W.z + rz * 0.12 - _v.z - fz * 0.05, q: (u.viewAt?.q || new THREE.Quaternion()).copy(_q), hidden: Mr.firstPerson() };
    }
  }
  // ---- F: a wounded man -> his health screen; a man you carry next to the Huey -> into the cabin; a dead Marine -> search
  C.interact = () => {
    const cv = CV(); if (!cv) return false;
    if (C.hold) {
      const heli = ctx.crafts.bounds(null).find(b => b.def && b.def.id === 'heli');
      if (heli && Math.hypot(heli.x - W.x, heli.z - W.z) < 4.5) { const u = C.hold.u; release(); if (cv.loadIntoHuey(u)) say(`${u.name || 'THE CASUALTY'} IS IN THE HUEY  -  FLY HIM TO THE ALBATROSS`, 2.5); return true; }
      if (C.hold.mode === 'drag') { lift(); return true; }
      say('CARRYING  -  TAKE HIM TO THE HUEY (F AT THE DOOR) OR SHIFT+F TO PUT HIM DOWN', 1.6); return true;
    }
    const u = cv.woundedNear(W.x, W.z, 2.2);
    if (u) { openPatient(u); return true; }
    return false;
  };
  // the dead of the ground war near him, as loot sources (marine.js nearestLoot)
  const lootCache = new WeakMap();
  C.bodies = (x, z, r) => {
    const cv = CV(); if (!cv) return [];
    return cv.bodiesNear(x, z, r).map(u => { let t = lootCache.get(u); if (!t) { t = { c: cv.kitOfDead(u), kind: 'body', name: `${u.name || 'MARINE'} (KIA)`, x: u.x, y: u.y, z: u.z, gw: u }; lootCache.set(u, t); } t.x = u.x; t.y = u.y; t.z = u.z; return t; });
  };
  // ---- per frame (after the Marine's step)
  C.update = dt => {
    C.t += dt; C.lastActive = C.t; register();
    holdTick(dt);
    // a treatment of yours on a casualty stops when you walk away from him (BUDDY.treatRangeM)
    const p = C.patient;
    if (p && p.rich && p.rich.M.action && !p.rich.M.action.by?.self && Math.hypot(p.x - W.x, p.z - W.z) > BUDDY.treatRangeM + 0.4) { p.rich.M.cancelTreatment(); say('TOO FAR FROM HIM  -  THE TREATMENT STOPS', 1.4); }
    if (Mr.ui === 'patient' && p && (!p.alive || p.evac)) { C.ui?.close(); Mr.ui = null; C.patient = null; }
    if (Mr.ui === 'patient' && C.ui && !C.ui.isOpen()) { Mr.ui = null; C.patient = null; }
  };
  C.exit = () => { release(); C.lastActive = -99; if (C.ui?.isOpen()) C.ui.close(); if (Mr.ui === 'patient') Mr.ui = null; };
  // ---- HUD hint (null = marine.js's own)
  C.hint = () => {
    const cv = CV(); if (!cv) return null;
    if (C.hold) return C.hold.mode === 'carry' ? `FIREMAN'S CARRY  ${MS.burden?.v.toFixed(1) ?? '?'} M/S  ·  F AT THE HUEY DOOR: LOAD HIM  ·  SHIFT+F: PUT HIM DOWN` : `DRAGGING ${C.hold.u.name || ''}  ${MS.burden?.v.toFixed(2) ?? '?'} M/S  ·  F: LIFT HIM (FIREMAN'S CARRY)  ·  SHIFT+F: PUT HIM DOWN`;
    const M = MS.M; if (M.action && M.action.by && !M.action.by.self) return `CORPSMAN WORKING ON YOU: ${M.action.label}  ${Math.round(M.action.t)} / ${Math.round(M.action.T)} S  -  STAY STILL`;
    const u = cv.woundedNear(W.x, W.z, 2.2);
    if (u) return `${u.name || 'MARINE'} ${u.able ? 'IS HURT' : 'IS DOWN'}  ·  F: TREAT HIM (YOUR KIT)  ·  SHIFT+F: DRAG`;
    return null;
  };
  return C;
}
