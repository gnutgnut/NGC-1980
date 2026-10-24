// The F-14A TOMCAT as the player's aircraft (the HORNET's jetplay.js is the pattern): input (HOTAS / pedals /
// keyboard), the wing sweep (CADC AUTO, MAN on the throttle switch, the EMERGENCY handle, OVERSWEEP on deck), pitch trim
// and the AFCS (stability augmentation, attitude hold with control stick steering, altitude hold), the TF30s (start
// on the deck's air cart, cross-bleed or windmill airstarts, compressor stalls and the recovery: idle, nose down),
// catapult and arrested landing through the airframe's deck operations, the RIO's seat (the AWG-9 picture, hooking
// and locking tracks, launching; the pilot (AI) then flies the heading / altitude / speed you give him), weapons at
// game level (M61 gun, AIM-9 / AIM-7 / AIM-54 as war.js missiles), the damage model (tomcatdamage.js), cautions and
// the 1980 warnings (tones and lights: tomcatsound.js), the crew's g tolerance, ejection of both seats, effects, cameras.
// main.js owns the world and hands it in through ctx (the same ctx the HORNET's jetplay.js gets).
import * as THREE from 'three';
import { createTomcatSim, TOMCAT, STATIONS, loadout } from './tomcatfm.js';
import { KT, FT, LB, DECKOPS } from './airframe.js';
import { buildTomcatModel } from './tomcatmodel.js';
import { buildTomcatCockpit, TEYE, ADVS } from './tomcatcockpit.js';
import { createTomcatDamage, TPARTS } from './tomcatdamage.js';
import { createTomcatSound } from './tomcatsound.js';
import { createFD } from './fd.js';
import { createSweepControl, sweepPress, sweepStep, createAfcs, afcsEngage, afcsStep, createStart, startSet, startPress, startAuto, startStep, startPost, START } from './tomcatsys.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const deg = r => r * 180 / Math.PI, D2R = Math.PI / 180;
const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
export const TCFG = {
  FUEL_X: 2,              // GAME: fuel burns 2x real, so a sortie is ~25 min at MIL / ~5 min in burner (the HORNET's tank is halved instead)
  BINGO_LB: 3000,         // the fuel to get back aboard (game: the map is small)
  RADAR_R: 4000, RADAR_AZ: 65 * D2R, RADAR_EL: 50 * D2R,   // AWG-9 at game scale: 4 km, +-65° (the real one sees 100+ nm)
  // game-level missile envelopes (m): AIM-9 seeker 1100, AIM-7 needs the STT lock, AIM-54 off a TWS track
  RNG: { SW: [150, 1100], SP: [250, 1700], PH: [450, 3600], GUN: [0, 800] },
  ALT_LOW: 60,            // radar altimeter warning (m AGL, ~200 ft)
};
const KG_PER_UNIT = TOMCAT.FUEL_MAX / 100;   // fleet fuel stores: a full Tomcat tank = 100 units
const WNAME = { aim9: 'SW', aim7: 'SP', aim54: 'PH' }, WOF = { SW: 'aim9', SP: 'aim7', PH: 'aim54' };
// what each cockpit control sounds like when it moves (tomcatsound.js click): handles clunk, buttons tick, bats snap
const SWKIND = { gear: 'handle', hook: 'handle', flaps: 'handle', emer: 'guard', emerFwd: 'lever', emerAft: 'lever', eject: 'guard', thrL: 'lever', thrR: 'lever', engines: 'lever', canopy: 'handle', pbrake: 'handle',
  mc: 'button', wpn: 'button', hsdmode: 'button', fireL: 'button', fireR: 'button', jett: 'button', sweepFwd: 'thumb', sweepAft: 'thumb', sweepAuto: 'thumb', airbrake: 'thumb', crankL: 'crank', crankR: 'crank' };
const THREAT = { shrike: 'S', reaper: 'R', shahed: 'D', gunship: 'G', transport: 'T', drone: 'D', wasp: 'W', osprey: 'O', carrier: 'K', battleship: 'L' };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _f = new THREE.Vector3(), _u = new THREE.Vector3();
const _iq = new THREE.Quaternion(), _p = new THREE.Vector3();

export function createTomcatPlay(ctx) {
  const { scene, war, fx, sfx, say, feed, CTL, GRAV } = ctx;
  const A = createTomcatSim(GRAV, { fuelX: TCFG.FUEL_X, seed: 1981 }), D = createTomcatDamage(), FD = createFD(A, { gmax: 5 });
  const model = buildTomcatModel(1, { modex: 200 }), cockpit = buildTomcatCockpit(), snd = createTomcatSound(sfx);
  model.group.add(cockpit.group); model.group.visible = false; scene.add(model.group);
  const crewMeshes = []; model.group.traverse(o => { if (['helmet', 'visor', 'torso', 'seatBack', 'headbox', 'glareshield', 'rioPanel'].includes(o.name)) crewMeshes.push(o); });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(19.5, 19.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  shadow.visible = false; scene.add(shadow);
  // two crew under their parachutes after an ejection
  const mkChute = () => {
    const g = new THREE.Group(); g.visible = false;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.35), new THREE.MeshLambertMaterial({ color: 0x5d6542 })));
    const c = new THREE.Mesh(new THREE.SphereGeometry(3.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x553322, side: THREE.DoubleSide }));
    c.position.y = 6; g.add(c); g.userData.canopy = c;
    const gore = new THREE.Mesh(new THREE.SphereGeometry(3.42, 12, 6, 0, Math.PI / 3, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xff7a1a, emissive: 0x552200, side: THREE.DoubleSide })); c.add(gore);
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 5.6, 3), new THREE.MeshBasicMaterial({ color: 0xdddddd })); l.position.set(x * 1.3, 3.2, z * 1.3); l.rotation.set(z * 0.42, 0, -x * 0.42); g.add(l); }
    scene.add(g); return g;
  };
  const chutes = [mkChute(), mkChute()];
  const P = {
    A, J: A, D, model, cockpit, snd, active: false, alive: false, ejected: null, seat: 0,
    thr: 0, thrSrc: 'kb', kb: { pitch: 0, roll: 0, yaw: 0 }, ctl: { pitch: 0, roll: 0, yaw: 0, throttle: [0, 0], brakeL: 0, brakeR: 0 },
    sweep: createSweepControl(), ap: createAfcs(), ss: createStart(true), sasCh: [true, true, true], dump: false,
    sas: true, hudMode: 'T.O.', hudAuto: true, hsdMode: 'NAV', arm: true, wpn: 'SW', lights: true, pbrake: false,
    tracks: [], hook: null, lock: false, lockT: 0, tgt: null, seek: null, seekT: 0, gunCd: 0, firing: false,
    rwr: [], rwrLaunch: false, cautions: [], mcSeen: new Set(), masterCaution: false,
    blood: 0, red: 0, gloc: 0, shake: 0, kick: 0, zoom: 0, ejectHold: 0, deadT: 0, view: 'cockpit',
    rio: { hdg: 0, alt: 300, spd: 150 }, altLow: false, wheels: false, shaker: 0, stallCue: null,
  };
  Object.defineProperty(P, 'afcs', { get: () => P.ap.mode });   // 'OFF' | 'ATT' | 'ALT'
  const env = {
    groundY: ctx.groundY, water: ctx.waterAt, surfVel: war.surfVel, mods: null,
    carrier: () => { const c = war.carrier; return c && c.sinking === undefined ? { x: c.p.x, z: c.p.z, yaw: c.yaw, deck: ctx.CARRIER.DECK + c.p.y, deckAt: war.deckAt ? (x, z) => war.deckAt(c, x, z) : null } : null; },
  };
  const stores = () => A.stores, count = w => A.stores.filter(s => s.on && s.w === WOF[w]).length;

  // ---------------------------------------------------------------- life cycle
  P.launch = () => {   // a fresh Tomcat on cat 1, engines turning, tanks from the fleet stores, the 1980 CAP fit
    D.reset(); A.stores = loadout('cap'); A.gun = TOMCAT.GUN_MAX; A.dead = false;
    A.fuel = Math.min(TOMCAT.FUEL_MAX, Math.max(TOMCAT.FUEL_MAX * 0.35, ctx.takeFuel(100) * KG_PER_UNIT));
    for (const e of A.eng) { e.run = true; e.n = 0.68; e.egt = 430; e.stalled = false; }
    A.sweep = 20; A.sweepMode = 'auto'; A.sweepCmd = 20; A.trim = 0.02; A.cas = true;
    if (!A.attachCat(env)) return false;
    A.flapSel = 2; for (const e of A.eng) { e.run = true; e.n = 0.68; e.egt = 430; }
    Object.assign(P, { active: true, alive: true, ejected: null, seat: 0, thr: 0, thrSrc: 'kb', blood: 0, red: 0, gloc: 0, deadT: 0, ejectHold: 0, hook: null, lock: false, tgt: null, sas: true, hudMode: 'T.O.', hudAuto: true, arm: true, wpn: 'SW' });
    P.sweep = createSweepControl(); P.ap = createAfcs(); startSet(P.ss, true); P.sasCh = [true, true, true]; P.dump = false;
    A.nzMax = A.nzMin = 1; P.mcSeen.clear(); P.serviced = true; model.group.visible = true; for (const c of chutes) c.visible = false;
    model.parts.canopy.visible = true; for (const m of crewMeshes) m.visible = true;
    say('TOMCAT ON CAT 1  -  THROTTLES TO MIL (OR ZONE 5) FOR THE SHOT', 3); return true;
  };
  P.stow = () => { P.active = false; P.alive = false; model.group.visible = false; shadow.visible = false; for (const c of chutes) c.visible = false; cockpit.group.visible = false; P.silence(); };
  P.silence = () => { snd.silence(); sfx.seeker?.(0); sfx.jetGun?.(false); };
  P.respot = () => { if (!A.attachCat(env)) return; A.flapSel = 2; P.ss.thrOff = [false, false]; P.ss.crank = 'OFF'; P.ss.auto = null; for (const e of A.eng) if (!e.run) e.start = 0.01; say('SPOTTED ON CAT 1  -  MIL POWER FOR THE SHOT', 2.5); };
  P.shutdown = () => { startSet(P.ss, false); P.dump = false; for (const e of A.eng) { e.run = false; e.start = 0; e.stalled = false; } };   // the crew climbs out: cold
  P.stoppedOnDeck = () => P.alive && !P.ejected && A.onGround && !A.wire && !A.cat && relSpeed() < 0.6 && !!ctx.onCarrier(A.pos.x, A.pos.z);
  function relSpeed() { const sv = war.surfVel(A.pos.x, A.pos.z); return Math.hypot(A.vel.x - (sv ? sv.vx : 0), A.vel.z - (sv ? sv.vz : 0)); }
  function lose(why) {
    if (!P.alive) return; P.alive = false; P.deadT = 3;
    P.lastLoss = { why, dead: A.dead, pos: A.pos.toArray().map(v => +v.toFixed(1)), vel: A.vel.toArray().map(v => +v.toFixed(1)), att: A.attitude(), t: performance.now() };
    fx.explode(A.pos.x, Math.max(A.pos.y, ctx.groundY(A.pos.x, A.pos.z)), A.pos.z, 3.4, { fire: ctx.waterAt(A.pos.x, A.pos.z) ? 0 : 90, debris: 26, color: 0xa9afb4, oil: true, crater: 3.5 }); sfx.boom(1.5);
    P.silence(); model.group.visible = false; shadow.visible = false; cockpit.group.visible = false;
    if (!P.ejected) { say(why, 2.5); ctx.onLost(why, false); }
  }
  P.hurt = (amount, why) => {
    if (!P.alive || P.ejected) return;
    const part = D.hit(amount * 0.8), name = TPARTS.find(p => p.id === part).name; sfx.hit?.() ?? sfx.boom(0.3); P.kick = 0.6;
    say(D.fire[0] && part === 'engL' ? 'LEFT ENGINE FIRE  -  PUSH THE L FIRE LIGHT' : D.fire[1] && part === 'engR' ? 'RIGHT ENGINE FIRE  -  PUSH THE R FIRE LIGHT' : `${why}  -  ${name} HIT`, 2);
    if (D.hp.airframe <= 0) lose('THE TOMCAT BROKE UP');
  };
  // ejection: the canopy goes, then the RIO, then the pilot 0.4 s later (the F-14's command sequence); both chutes
  function eject() {
    if (P.ejected || !P.alive) return;
    const up = A.up(_u);
    P.ejected = { t: 0, seats: [[0, 1.25, -5.45], [0, 1.25, -4.2]].map((s, i) => ({ pos: A.worldPoint(s), vel: A.vel.clone().addScaledVector(up, 26), t: -(i ? 0 : 0.4), landed: -1, out: false })) };
    // index 0 = pilot (goes 0.4 s after the RIO), 1 = RIO (first)
    A.canopy = 1; model.parts.canopy.visible = false; say('EJECT  EJECT  EJECT', 2.5); sfx.boom(0.6); sfx.seeker(0); sfx.jetGun(false);
    for (const m of crewMeshes) if (m.name !== 'glareshield' && m.name !== 'rioPanel' && m.name !== 'seatBack') m.visible = false;
    P.view = 'chase'; ctx.onEject();
  }

  // ---------------------------------------------------------------- input
  const kd = ctx.keyDown;
  function readControls(dt) {
    const st = CTL.state, kbx = (kd('KeyD', 'ArrowRight') ? 1 : 0) - (kd('KeyA', 'ArrowLeft') ? 1 : 0), kby = (kd('KeyS', 'ArrowDown') ? 1 : 0) - (kd('KeyW', 'ArrowUp') ? 1 : 0), kbz = (kd('KeyE') ? 1 : 0) - (kd('KeyQ') ? 1 : 0);
    const ramp = (cur, tgt, r) => cur + clamp(tgt - cur, -r * dt, r * dt);
    // keys move a virtual stick at a finite rate; the hand on it feels the g and stops pulling past ~6.5 g (a mechanical
    // stick with no g limiter: the keyboard pilot gets the feel a real one has through the bobweight)
    P.kb.roll = ramp(P.kb.roll, kbx, kbx ? 3 : 6);
    const feel = kby > 0 && A.nz > 6.5 && P.kb.pitch > 0 ? P.kb.pitch : kby; P.kb.pitch = ramp(P.kb.pitch, feel, kby ? 1.6 : 6); P.kb.yaw = ramp(P.kb.yaw, kbz, 4);
    const c = P.ctl, stick = st.stick;
    c.roll = stick && Math.abs(stick.x) > 0.001 ? stick.x : P.kb.roll; c.pitch = stick && Math.abs(stick.y) > 0.001 ? stick.y : P.kb.pitch;
    c.yaw = Math.abs(st.rudder || 0) > 0.001 ? st.rudder : P.kb.yaw;
    throttleIn(dt, st);
    const wb = kd('Period') || st.actions.wheelbrake || P.pbrake ? 1 : 0;
    c.brakeL = Math.max(st.brakeL || 0, wb); c.brakeR = Math.max(st.brakeR || 0, wb);
    if (P.gloc > 0) { c.pitch = 0; c.roll = 0; c.yaw = 0; }
    return c;
  }
  function throttleIn(dt, st = CTL.state) {   // whichever moved last, the HOTAS lever or the keys (Shift / Space up, Ctrl / Z down)
    const c = P.ctl, up = kd('ShiftLeft', 'ShiftRight', 'Space', 'PageUp', 'NumpadAdd'), dn = kd('ControlLeft', 'KeyZ', 'PageDown', 'NumpadSubtract');
    if (up || dn) { P.thrSrc = 'kb'; P.thr = clamp(P.thr + ((up ? 1 : 0) - (dn ? 1 : 0)) * 0.5 * dt, 0, 1); }
    if (st.throttle !== null && st.throttle !== undefined) { if (P.lastHw === undefined) P.lastHw = st.throttle; if (Math.abs(st.throttle - P.lastHw) > 0.02) { P.thrSrc = 'hotas'; P.lastHw = st.throttle; } if (P.thrSrc === 'hotas') { P.thr = st.throttle; P.lastHw = st.throttle; } }
    c.throttle[0] = A.eng[0].run && !P.ss.thrOff[0] ? P.thr : 0; c.throttle[1] = A.eng[1].run && !P.ss.thrOff[1] ? P.thr : 0;
  }
  function buttons() {   // HOTAS edges (keys come through P.key)
    const pr = CTL.state.pressed;
    if (pr.gear) P.cmd('gear'); if (pr.flaps) P.cmd('flaps'); if (pr.hook) P.cmd('hook'); if (pr.missile || pr.pickle) P.cmd('missile'); if (pr.bomb) P.cmd('nexttrk');
    if (pr.view) ctx.toggleView(); if (pr.sweepauto) P.cmd('sweepAuto');
    A.brakeCmd = P.sbToggle || CTL.state.actions.airbrake ? 1 : 0;
  }
  // keyboard while flying it; true = used. The RIO's seat has its own keys.
  P.key = code => {
    if (P.seat === 1) {
      const r = { KeyB: 'nexttrk', KeyE: 'nexttrk', KeyQ: 'prevtrk', KeyL: 'stt', KeyR: 'rio:launch', Enter: 'rio:launch', KeyC: 'wpn', Equal: 'rio:rng+', Minus: 'rio:rng-', Comma: 'arm' }[code];
      if (r) { P.cmd(r); return true; }
      return ['KeyG', 'KeyH', 'KeyO', 'KeyU', 'KeyN', 'KeyI', 'Backquote', 'Semicolon', 'Quote', 'Digit9', 'Digit0'].includes(code);
    }
    const m = { KeyG: 'gear', KeyH: 'hook', KeyL: 'flaps', KeyO: 'airbrake', KeyU: 'canopy', KeyN: 'lights', KeyI: 'engines', KeyR: 'missile', KeyC: 'wpn', KeyB: 'nexttrk', Comma: 'arm', Enter: 'missile', Backquote: 'afcsCycle', Digit0: 'sweepAuto', Digit9: 'emer' }[code];
    if (m) { P.cmd(m); return true; }
    return ['Minus', 'Equal', 'Semicolon', 'Quote'].includes(code);   // held: sweep, trim (read every frame)
  };
  P.cmd = id => {
    if (!P.alive || P.ejected) return;
    cockpit.press(id);
    if (id !== 'missile' && id !== 'nexttrk' && id !== 'prevtrk') snd.click(SWKIND[id] || (id.startsWith('hud:') || id.startsWith('rio:') ? 'button' : 'toggle'));
    if (id === 'gear') { if (A.onGround && A.gearCmd) { say('WEIGHT ON WHEELS  -  GEAR LOCKED DOWN', 1.4); return; } if (!D.mods().gearOk) { say('GEAR WILL NOT EXTEND  -  DAMAGED', 1.6); A.gearCmd = 0; return; } A.gearCmd = A.gearCmd ? 0 : 1; sfx.blip(300, 200, 0.15, 'square', 0.05); say(A.gearCmd ? 'GEAR DOWN' : 'GEAR UP', 1); }
    else if (id === 'hook') { A.hookCmd = A.hookCmd ? 0 : 1; if (A.hookCmd && !D.mods().hookOk) say('HOOK DAMAGED', 1.4); else say(A.hookCmd ? 'HOOK DOWN' : 'HOOK UP', 1); }
    else if (id === 'flaps') { A.flapSel = A.flapSel ? 0 : 2; say(A.flapSel ? (A.sweep > 21 ? 'FLAPS DN  -  WINGS COMING FORWARD' : 'FLAPS DN') : 'FLAPS UP', 1); }
    else if (id === 'airbrake') { P.sbToggle = !P.sbToggle; say(P.sbToggle ? 'SPEED BRAKES OUT' : 'SPEED BRAKES IN', 1); }
    else if (id === 'canopy') { if (!A.onGround && !A.canopyCmd) { say('CANOPY STAYS SHUT IN FLIGHT', 1.2); return; } A.canopyCmd = A.canopyCmd ? 0 : 1; }
    else if (id === 'lights') { P.lights = !P.lights; say(P.lights ? 'LIGHTS ON' : 'LIGHTS OFF', 1); }
    else if (id === 'pbrake') { P.pbrake = !P.pbrake; say(P.pbrake ? 'PARKING BRAKE SET' : 'PARKING BRAKE OFF', 1); }
    else if (id === 'engines') {   // I: both throttles OFF, or the whole start on the switches (startAuto)
      if (A.eng.some(e => e.run) || P.ss.auto) { P.ss.auto = null; P.ss.crank = 'OFF'; P.ss.thrOff = [true, true]; say('BOTH THROTTLES OFF  -  ENGINES WINDING DOWN', 1.6); return; }
      if (!D.mods().eng.some(h => h > 0.05) || A.fuel <= 0) { say('NO START  -  ENGINES DAMAGED OR NO FUEL', 2); return; }
      startAuto(P.ss, A); say('ENGINE START  -  RIGHT ENGINE FIRST: CRANK R, THROTTLE IDLE AT 20%, THEN THE LEFT', 2.5);
    }
    else if (id === 'crankL' || id === 'crankR' || id === 'thrL' || id === 'thrR' || id === 'genL' || id === 'genR') { const m = startPress(P.ss, A, id); if (m) say(m, 2); }
    else if (id === 'dump') { P.dump = !P.dump; say(P.dump ? 'FUEL DUMP ON  -  1,500 LB / MIN FROM THE TAIL (STOPS AT 4,000 LB)' : 'FUEL DUMP OFF', 1.8); }
    else if (id === 'fireL' || id === 'fireR') { const r = D.extinguish(id === 'fireL' ? 0 : 1); say(r === 'FIRE OUT' ? 'FIRE EXTINGUISHED' : r, 1.5); if (r === 'FIRE OUT') sfx.refuel?.(); }
    else if (id === 'arm') { P.arm = !P.arm; say(P.arm ? 'MASTER ARM ON' : 'MASTER ARM OFF', 1); }
    else if (id === 'sas') { const on = !P.sasCh.every(Boolean); P.sasCh = [on, on, on]; setSas(); say(on ? 'STAB AUG ON  -  PITCH ROLL YAW' : 'STAB AUG OFF  -  NO DAMPERS', 1.6); }
    else if (id === 'sasP' || id === 'sasR' || id === 'sasY') { const i = 'PRY'.indexOf(id[3]); P.sasCh[i] = !P.sasCh[i]; setSas(); say(`${['PITCH', 'ROLL', 'YAW'][i]} STAB AUG ${P.sasCh[i] ? 'ON' : 'OFF'}${P.sas ? '' : '  -  ALL THREE FOR THE DAMPERS AND THE AUTOPILOT'}`, 1.6); }
    else if (id === 'afcs' || id === 'afcsCycle') {
      const next = id === 'afcs' ? (P.afcs === 'OFF' ? 'ATT' : 'OFF') : { OFF: 'ATT', ATT: 'ALT', ALT: 'OFF' }[P.afcs];
      setAfcs(next);
    }
    else if (id === 'alt') setAfcs(P.afcs === 'ALT' ? 'ATT' : 'ALT');
    else if (id === 'mc') { P.masterCaution = false; for (const c of P.cautions) P.mcSeen.add(c); }
    else if (id === 'jett') { let n = 0; for (const s of A.stores) if (s.on && s.w !== 'aim9') { s.on = false; n++; } say(n ? 'ACM JETTISON  -  PHOENIX AND SPARROW STATIONS CLEAN' : 'NOTHING TO JETTISON', 1.6); }
    else if (id === 'eject') { if (P.ejectArm > 0) eject(); else { P.ejectArm = 1.2; say('EJECT  -  PULL AGAIN', 1.2); } }
    else if (id === 'wpn' || id === 'rio:wpn') { const L = id === 'rio:wpn' ? ['PH', 'SP', 'SW'] : ['SW', 'SP', 'PH', 'GUN']; P.wpn = L[(L.indexOf(P.wpn) + 1) % L.length]; if (P.hudAuto && P.seat === 0 && !A.onGround) P.hudMode = 'A/A'; say({ SW: 'SIDEWINDER', SP: 'SPARROW', PH: 'PHOENIX', GUN: 'GUN' }[P.wpn] + (P.wpn === 'GUN' ? `  ${A.gun * 5} RDS` : `  ${count(P.wpn)} LEFT`), 1.1); }
    else if (id === 'missile') { if (P.hudMode !== 'A/A') { P.hudMode = 'A/A'; P.hudAuto = true; if (P.wpn === 'GUN') P.wpn = 'SW'; say(`A/A  -  ${{ SW: 'SIDEWINDER', SP: 'SPARROW', PH: 'PHOENIX' }[P.wpn]}`, 1); } else fireMissile(); }
    else if (id === 'rio:launch') { if (P.wpn === 'GUN' || P.wpn === 'SW') P.wpn = 'PH'; fireMissile(); }
    else if (id === 'nexttrk' || id === 'prevtrk' || id === 'rio:next') cycleTrack(id === 'prevtrk' ? -1 : 1);
    else if (id === 'stt' || id === 'rio:stt') { if (P.lock) { P.lock = false; say('BREAK LOCK  -  TWS', 1); } else if (P.hook && P.hook.range < 3200) { P.lock = true; say(`STT  -  TRACK ${String(P.hook.n).padStart(2, '0')} LOCKED`, 1.2); } else say('NO TRACK HOOKED IN STT RANGE', 1.2); }
    else if (id === 'emerFwd' || id === 'emerAft') { if (P.sweep.mode !== 'EMER' && P.sweep.mode !== 'OVER') { say('EMERGENCY SWEEP HANDLE  -  RAISE THE GUARD FIRST (CLICK THE HANDLE OR 9)', 1.8); return; } sweepPress(P.sweep, A, id === 'emerFwd' ? 'fwd' : 'aft'); say(`EMERGENCY SWEEP HANDLE  ${Math.round(P.sweep.handle)}°${P.sweep.handle > 68.5 ? '  -  OVERSWEEP' : ''}`, 1.2); }
    else if (id === 'sweepAuto' || id === 'sweepFwd' || id === 'sweepAft' || id === 'emer') { const m = sweepPress(P.sweep, A, { sweepAuto: 'auto', sweepFwd: 'fwd', sweepAft: 'aft', emer: 'emer' }[id]); if (m) say(m, 2); }
    else if (id.startsWith('hud:')) { P.hudMode = id.slice(4); P.hudAuto = false; }
    else if (id === 'hsdmode') P.hsdMode = P.hsdMode === 'NAV' ? 'TID' : 'NAV';
    else if (id === 'rio:rng+' || id === 'rio:rng-') say(`TID ${(cockpit.tidRange / 1852).toFixed(1)} NM`, 0.8);
  };
  P.click = id => P.cmd(id);
  // the stability augmentation: three channel switches; the sim has one SAS (all three on) or DIRECT
  function setSas() { P.sas = P.sasCh.every(Boolean); if (!P.sas) afcsEngage(P.ap, A, 'OFF'); }
  function setAfcs(m) {
    const why = afcsEngage(P.ap, A, m, P.sas && D.mods().sasOk); if (why) { say(why, 1.6); return; }
    FD.gi = 0; say({ OFF: 'AUTOPILOT OFF', ATT: 'AUTOPILOT  -  ATTITUDE HOLD (STICK STEERING)', ALT: `AUTOPILOT  -  ALTITUDE HOLD ${Math.round(A.pos.y * FT / 100) * 100} FT` }[m], 1.6);
  }

  // ---------------------------------------------------------------- the wing sweep, trim, the autopilot (tomcatsys.js)
  function sweepCtl(dt) {
    const st = CTL.state.actions || {}, fwd = (P.seat === 0 && kd('Equal')) || st.sweepfwd, aft = (P.seat === 0 && kd('Minus')) || st.sweepaft;
    sweepStep(P.sweep, A, fwd, aft, dt, D.mods().cadcOk);
  }
  function trimCtl(dt) {
    const hat = CTL.state.actions && CTL.state.actions.lookhat === false ? CTL.state.hatY || 0 : 0;   // the stick hat trims when it is not the look hat
    const t = (kd('Quote') ? 1 : 0) - (kd('Semicolon') ? 1 : 0) - hat;
    if (t) A.trim = clamp((A.trim || 0) + t * 0.025 * dt, -0.12, 0.14);
  }
  function afcs(c, dt) { if (afcsStep(P.ap, A, FD, c, dt, P.sas && D.mods().sasOk) === 'drop') say('AUTOPILOT DISENGAGED', 1.4); return c; }
  // the RIO's seat: the pilot (AI) flies the heading, altitude and speed the RIO asks for (A / D, W / S, Shift / Ctrl)
  function rioPilot(dt) {
    const c = P.ctl, r = P.rio;
    if (A.onGround || A.cat) { c.pitch = c.roll = c.yaw = 0; throttleIn(dt); return c; }
    const kx = (kd('KeyD', 'ArrowRight') ? 1 : 0) - (kd('KeyA', 'ArrowLeft') ? 1 : 0), ky = (kd('KeyW', 'ArrowUp') ? 1 : 0) - (kd('KeyS', 'ArrowDown') ? 1 : 0);
    const su = kd('ShiftLeft', 'ShiftRight', 'Space'), sd = kd('ControlLeft', 'KeyZ');
    r.hdg = wrap(r.hdg + kx * 0.35 * dt); r.alt = clamp(r.alt + ky * 40 * dt, 80, 3000); r.spd = clamp(r.spd + ((su ? 1 : 0) - (sd ? 1 : 0)) * 25 * dt, 160, 600);   // knots
    const agl = A.pos.y - ctx.groundY(A.pos.x, A.pos.z), gam = clamp((r.alt - A.pos.y) * 0.004, agl < 120 ? 0.12 : -0.2, 0.3);
    FD.steer(FD.dirHdg(r.hdg, gam), dt, { gmax: 4, k: 1.2, eas: r.spd / KT * 1.0, ab: r.spd > 330 });
    c.pitch = FD.ctl.pitch; c.roll = FD.ctl.roll; c.yaw = FD.ctl.yaw; P.thr = FD.ctl.throttle[0]; c.throttle[0] = A.eng[0].run ? FD.ctl.throttle[0] : 0; c.throttle[1] = A.eng[1].run ? FD.ctl.throttle[1] : 0;
    c.brakeL = c.brakeR = 0; return c;
  }
  P.setSeat = i => {
    if (!P.alive || P.ejected) return false;
    P.seat = i;
    if (i === 1) { P.rio.hdg = A.heading(); P.rio.alt = Math.max(A.pos.y, ctx.groundY(A.pos.x, A.pos.z) + 150); P.rio.spd = clamp(A.eas * KT, 250, 450); FD.reset(); FD.thr = FD.ti = P.thr; say('RIO  -  AWG-9: B / Q / E HOOK, L LOCK, R LAUNCH, C WEAPON, - / = RANGE  ·  A D W S STEER THE PILOT', 3.5); }
    else { P.kb.pitch = P.kb.roll = P.kb.yaw = 0; say('PILOT', 1); }
    return true;
  };

  // ---------------------------------------------------------------- weapons (game level: war.js missiles and rounds)
  const station = (a, out) => out.set(a[0], a[1], a[2]).applyQuaternion(A.q).add(A.pos);
  function canRelease() { if (!P.arm) { say('MASTER ARM OFF', 1); return false; } if (A.onGround) { say('WEIGHT ON WHEELS  -  WEAPONS INHIBITED', 1); return false; } return true; }
  function fireMissile() {
    if (!canRelease()) return;
    const w = P.wpn === 'GUN' ? 'SW' : P.wpn, type = WOF[w], s = A.stores.find(s => s.on && s.w === type);
    if (!s) { say(`NO ${{ SW: 'SIDEWINDERS', SP: 'SPARROWS', PH: 'PHOENIX' }[w]} LEFT`, 1.2); return; }
    let tgt = null, call = '';
    if (w === 'SW') { tgt = P.seek && P.seek.locked ? P.seek.u : null; call = tgt ? 'FOX TWO' : 'FOX TWO  -  NO TONE, BORESIGHT'; }
    else if (w === 'SP') { tgt = P.lock && P.hook ? P.hook.u : null; call = tgt ? 'FOX ONE' : 'FOX ONE  -  NO LOCK, IT WILL NOT GUIDE'; }
    else { tgt = P.hook ? P.hook.u : null; call = tgt ? `FOX THREE  -  TRACK ${String(P.hook.n).padStart(2, '0')}` : 'FOX THREE  -  NO TRACK, BORESIGHT'; }
    s.on = false;
    const p = station(STATIONS[s.st], new THREE.Vector3()), v = A.forward(_f).multiplyScalar(w === 'PH' ? 22 : 15).add(A.vel);
    if (w !== 'SW') v.addScaledVector(A.up(_u), -4);   // dropped off the pylon / ejected from the tunnel, then the motor
    war.fireMissile(p, v, tgt); fx.flash(p.x, p.y, p.z, 0.5); say(call, 1.4);
  }
  function gun(dt, held) {
    P.gunCd -= dt; P.firing = false;
    if (!held || A.gun <= 0 || !P.arm || A.onGround || P.seat !== 0) { P.gunCd = Math.max(P.gunCd, 0); sfx.jetGun(false); return; }
    P.firing = true; sfx.jetGun(true);
    while (P.gunCd <= 0) {
      P.gunCd += 0.05; A.gun--;   // the M61A1: ~100 rounds/s high rate, 675 rounds (tracer bursts of 5)
      const p = station(STATIONS.gun, new THREE.Vector3()), f = A.forward(_f);
      const v = new THREE.Vector3(f.x + rnd(-0.004, 0.004), f.y + rnd(-0.004, 0.004), f.z + rnd(-0.004, 0.004)).multiplyScalar(520).add(A.vel);
      war.fireJetGun(p, v); if (Math.random() < 0.5) fx.flash(p.x, p.y, p.z, 0.25);
      if (A.gun <= 0) { say('GUN EMPTY', 1.2); break; }
    }
  }
  // AWG-9 at game level: hostile aircraft and ships in the scan volume become numbered tracks (track while scan); the
  // hooked track is the one the HUD and the missiles use; STT locks it (the Sparrow needs that). The Sidewinder's own
  // seeker growls on a heat source near the nose and locks it inside 12°.
  const trk = new Map(); let trkN = 0;
  function radar(dt) {
    P.tracks.length = 0; _iq.copy(A.q).invert(); const m = D.mods(); const on = m.avionics > 0.15;
    let seekBest = null, seekA = 0.21;
    for (const u of war.units) {
      if (u.side !== 2 || u.dead || u.dying || u.gone || u.sinking !== undefined) continue;
      _v.copy(u.p).sub(A.pos); const r = _v.length(); if (r > TCFG.RADAR_R || !on) continue;
      _w.copy(_v).applyQuaternion(_iq); const az = Math.atan2(_w.x, -_w.z), el = Math.atan2(_w.y, Math.hypot(_w.x, _w.z));
      if (Math.abs(az) > TCFG.RADAR_AZ || Math.abs(el) > TCFG.RADAR_EL) continue;
      let t = trk.get(u); if (!t) { t = { u, n: (trkN = trkN % 99 + 1), vrel: { hdg: 0, spd: 0 } }; trk.set(u, t); }
      Object.assign(t, { range: r, az, el, brg: Math.atan2(_v.x, -_v.z), ship: !!u.dims, alt: u.dims ? '--' : String(Math.round(u.p.y * FT / 100)).padStart(3, '0'), name: (u.name || u.type || 'BANDIT').toUpperCase().slice(0, 12), hooked: false, locked: false, seen: performance.now() });
      if (u.v) { t.vrel.hdg = Math.atan2(u.v.x, -u.v.z); t.vrel.spd = Math.hypot(u.v.x, u.v.z); }
      P.tracks.push(t);
      const off = Math.acos(clamp(-_w.z / r, -1, 1));
      if (!u.dims && off < seekA && r < TCFG.RNG.SW[1] + 100) { seekA = off; seekBest = { u, off, r }; }
    }
    for (const [u, t] of trk) if (!P.tracks.includes(t) && performance.now() - t.seen > 8000) trk.delete(u);
    // the hook: keep it while it is tracked; in A/A with nothing hooked, the RIO hooks the air track nearest the nose
    if (P.hook && !P.tracks.includes(P.hook)) { if (P.lock) say('LOCK BROKEN', 1); P.hook = null; P.lock = false; }
    if (!P.hook && P.hudMode === 'A/A') { let best = null, bo = 9; for (const t of P.tracks) { if (t.ship) continue; const o = Math.hypot(t.az, t.el); if (o < bo) { bo = o; best = t; } } P.hook = best; }
    if (P.hook) { P.hook.hooked = true; P.hook.locked = P.lock; if (P.lock && P.hook.range > 3400) { P.lock = false; say('LOCK BROKEN  -  OUT OF RANGE', 1); } }
    // the Sidewinder seeker (pilot's A/A, SW selected)
    const swOn = P.hudMode === 'A/A' && P.wpn === 'SW' && count('SW') > 0 && P.arm;
    if (swOn && seekBest) { P.seekT = P.seek && P.seek.u === seekBest.u ? P.seekT + dt : 0; P.seek = { u: seekBest.u, off: seekBest.off, locked: P.seekT > 0.6 && seekBest.off < 0.21 }; } else { P.seek = null; P.seekT = 0; }
    // what the HUD shows: the hooked track (or the seeker's), and the in-range cue for the selected weapon
    const h = P.hook || (P.seek ? { u: P.seek.u, range: P.seek.u.p.distanceTo(A.pos), name: '' } : null);
    if (h) {
      const [r0, r1] = TCFG.RNG[P.wpn], R = h.range, ok = P.wpn === 'SW' ? P.seek && P.seek.locked : P.wpn === 'SP' ? P.lock : P.wpn === 'PH' ? !!P.hook : true;
      P.tgt = { u: h.u, pos: h.u.p, range: R, lock: P.lock && !!P.hook || !!(P.seek && P.seek.locked), shoot: P.arm && ok && R > r0 && R < r1 && (P.wpn === 'GUN' || count(P.wpn) > 0), name: h.name };
    } else P.tgt = null;
  }
  function cycleTrack(dir) {
    const air = P.tracks.filter(t => !t.ship).sort((a, b) => a.range - b.range); if (!air.length) { say('NO TRACKS', 1); return; }
    const i = air.indexOf(P.hook), n = air[(i + dir + air.length) % air.length]; P.hook = n; P.lock = false;
    say(`TRACK ${String(n.n).padStart(2, '0')}  ${n.name}  ${(n.range / 1852).toFixed(1)} NM`, 1.2);
  }
  // ALR-45 / -50: who is looking at us: hostile aircraft and ships near us, missiles in the air at us
  function rwrScan() {
    P.rwr.length = 0; P.rwrLaunch = false; const hd = A.heading();
    for (const u of war.units) {
      if (u.side !== 2 || u.dead || u.dying || u.sinking !== undefined) continue;
      const d = u.p.distanceTo(A.pos); if (d > 2600) continue;
      const lockOn = !!(u.ai && u.ai.tgt && u.ai.tgt.player);
      P.rwr.push({ brg: wrap(Math.atan2(u.p.x - A.pos.x, -(u.p.z - A.pos.z)) - hd), r: d / 2600, sym: THREAT[u.type] || 'U', lock: lockOn, launch: false });
    }
    for (const b of war.proj) {
      if (b.kind !== 'aam' || b.side !== 2) continue; const d = b.p.distanceTo(A.pos); if (d > 1800) continue;
      _v.copy(A.pos).sub(b.p); if (_v.dot(b.v) <= 0) continue;   // only those closing on us
      P.rwr.push({ brg: wrap(Math.atan2(b.p.x - A.pos.x, -(b.p.z - A.pos.z)) - hd), r: d / 2600, sym: 'M', lock: true, launch: true }); P.rwrLaunch = true;
    }
  }
  // gun pipper: where rounds fired now will be at the target's range (minus the target's own motion)
  function gunPipper() {
    const R = P.tgt && P.tgt.range < 1200 ? P.tgt.range : 450, f = A.forward(_f), p0 = station(STATIONS.gun, _p);
    _v.copy(f).multiplyScalar(520).add(A.vel); const t = R / _v.length();
    const out = P._pip || (P._pip = new THREE.Vector3()); out.copy(p0).addScaledVector(_v, t); out.y -= 4.5 * t * t;
    if (P.tgt && P.tgt.range < 1200 && P.tgt.u.v) out.addScaledVector(P.tgt.u.v, -t);
    return out;
  }
  // the carrier for the HUD / HSD / VDI: TACAN and ICLS
  function carrierInfo() {
    const c = env.carrier(); if (!c) return null;
    const co = Math.cos(c.yaw), si = Math.sin(c.yaw), aimZ = 41 - TOMCAT.HOOK_TIP[2];
    const pos = new THREE.Vector3(c.x + DECKOPS.LAND_X * co + aimZ * si, c.deck, c.z - DECKOPS.LAND_X * si + aimZ * co);
    const dx = pos.x - A.pos.x, dz = pos.z - A.pos.z, dist = Math.hypot(dx, dz, pos.y - A.pos.y);
    const lx = (A.pos.x - c.x) * co - (A.pos.z - c.z) * si, lz = (A.pos.x - c.x) * si + (A.pos.z - c.z) * co, R = lz - aimZ;
    const icls = R > 20 && R < 3000 && Math.abs(lx - DECKOPS.LAND_X) < R * 0.4 ? { gs: deg(Math.atan2(A.pos.y - c.deck - 2.4, R)) - 3.5, loc: deg(Math.atan2(lx - DECKOPS.LAND_X, R)) } : null;
    return { pos, dist, brg: Math.atan2(dx, -dz), icls };
  }

  // ---------------------------------------------------------------- per frame
  let wasGround = true;
  P.update = (dt, inp) => {
    if (P.ejectArm > 0) P.ejectArm -= dt;
    if (!P.active) return;
    if (!P.alive) { P.deadT -= dt; updateChutes(dt); return; }
    let c;
    if (P.autopilot) c = P.autopilot(A, dt, P.ctl);   // test hook
    else if (P.seat === 1 && !P.ejected) c = rioPilot(dt);
    else { c = readControls(dt); c = afcs(c, dt); }
    if (!P.autopilot) { buttons(); sweepCtl(dt); if (P.seat === 0) trimCtl(dt); }
    else sweepCtl(dt);
    A.cas = P.sas;
    if (A.cat) A.catClear = ctx.catClear();
    war.carrier?.parts.setJBD?.(A.cat ? 1 : 0, dt);
    const held = ctx.keyDown('Backspace') || CTL.state.actions.eject, now = performance.now();   // real time: a hold is a human second
    if (!held) P.ejectHold = 0; else if (!P.ejectHold) P.ejectHold = now; else if (now - P.ejectHold > 900) eject();
    if (P.ejected) { c.pitch = c.roll = c.yaw = 0; updateChutes(dt); }
    env.mods = D.mods(); A.stallRisk = Math.max(D.stallRisk(0), D.stallRisk(1));
    A.fuel = Math.max(0, A.fuel - D.update(dt));
    for (const [e, k] of startStep(P.ss, A, dt, { ext: deckPower(), eng: env.mods.eng })) startEvent(e, k);
    if (P.dump) dumpFuel(dt);
    const events = A.step(dt, c, env);
    startPost(P.ss, A);
    for (const e of events) handle(e);
    if (A.dead) { lose(A.dead === 'water' ? 'DITCHED IN THE SEA' : 'CRASHED'); return; }
    if (!P.ejected) { gun(dt, inp.fire || CTL.state.actions.fire); radar(dt); rwrScan(); pilotG(dt); warnings(dt); service(dt); autoHud(); }
    effects(dt);
    if (P.hudMode === 'A/A' && P.wpn === 'SW' && P.arm && count('SW') && !P.ejected && P.seat === 0) sfx.seeker(P.seek && P.seek.locked ? 2 : P.seek ? 1 : 0); else sfx.seeker(0);
  };
  // COMMANDER: the AI wingman flies it (units/commander/wingman.js) while the commander is in another unit - as
  // jetplay.js does for the HORNET; the CADC keeps sweeping the wings
  const _wenv = {};
  P.wingman = (dt, pilot, aiEnv) => {
    if (!P.active || !P.alive || P.ejected) return;
    sweepStep(P.sweep, A, false, false, dt, D.mods().cadcOk);
    env.mods = D.mods(); A.stallRisk = Math.max(D.stallRisk(0), D.stallRisk(1)); A.fuel = Math.max(0, A.fuel - D.update(dt));
    pilot.update(dt, Object.assign(_wenv, env, aiEnv));
    if (A.dead) lose(A.dead === 'water' ? 'TOMCAT DITCHED IN THE SEA' : 'TOMCAT CRASHED');
  };
  // the deck crew's external power and air start cart: plugged in whenever the jet stands on the ALBATROSS
  function deckPower() { return A.onGround && relSpeed() < 1.5 && !!ctx.onCarrier(A.pos.x, A.pos.z); }
  function startEvent(e, k) {
    const side = k ? 'RIGHT' : 'LEFT';
    if (e === 'crankout') { snd.click('crank'); say(`${side} ENGINE  -  CRANK SWITCH OUT AT 50%${A.eng[1 - k].run ? '' : k ? '  -  NOW THE LEFT: CRANK L' : '  -  NOW THE RIGHT: CRANK R'}`, 2); }
    else if (e === 'autocrank') { snd.click('crank'); say(`ENG CRANK ${k ? 'R' : 'L'}  -  ${{ CART: 'AIR START CART', XBLEED: 'CROSS-BLEED', WINDMILL: 'WINDMILL' }[P.ss.cranking[k] || 'CART'] || ''}`, 1.6); }
    else if (e === 'autoidle') { snd.click('lever'); say(`${k ? 'R' : 'L'} THROTTLE IDLE AT 20%  -  FUEL AND IGNITION`, 1.6); }
    else if (e === 'autodone') say('BOTH ENGINES AT IDLE  -  GENERATORS ON LINE', 2);
    else if (e === 'noair') say('NO START AIR  -  DECK CART, THE OTHER ENGINE (CROSS-BLEED) OR 225 KNOTS (WINDMILL)', 2.5);
  }
  // FUEL DUMP: 1,500 lb/min from the mast at the end of the beaver tail, stops at 4,000 lb; lights in the burner plume
  // ("dump and burn") when an afterburner is lit. Not on the deck (weight on wheels).
  function dumpFuel(dt) {
    if (A.onGround || A.fuel * LB <= 4000) return;
    A.fuel = Math.max(4000 / LB, A.fuel - 1500 / 60 / LB * dt);
    const ab = Math.max(A.eng[0].ab, A.eng[1].ab);
    for (let i = 0; i < 2; i++) {
      station([0, -0.1, 9.5 + i * 0.6], _p);
      if (ab > 0.3) fx.add.spawn(_p.x, _p.y, _p.z, A.vel.x * 0.85 + rnd(-1, 1), A.vel.y * 0.85 + rnd(-1, 1), A.vel.z * 0.85 + rnd(-1, 1), rnd(0.6, 1.2), 0.5, 3, 1, rnd(.45, .7), .15, 0.9, 0, 1);
      else fx.mix.spawn(_p.x, _p.y, _p.z, A.vel.x * 0.85, A.vel.y * 0.85, A.vel.z * 0.85, rnd(1.2, 2), 0.4, 3.5, .86, .88, .92, 0.35, 0, 0.5);
    }
  }
  function autoHud() {   // the HUD mode follows the phase of flight until the pilot picks one
    if (!P.hudAuto) return;
    if (A.onGround || A.cat) { if (P.hudMode !== 'A/A') P.hudMode = 'T.O.'; }
    else if (A.gearCmd && A.flapSel) P.hudMode = 'LDG';
    else if (P.hudMode === 'T.O.' || P.hudMode === 'LDG') P.hudMode = 'CRUISE';
  }
  function handle(e) {
    switch (e.e) {
      case 'catshot': sfx.catShot(); P.kick = 1; say('', 0); feed('ALBATROSS: TOMCAT LAUNCHED', 'good'); { const p = A.pos; for (let i = 0; i < 34; i++) fx.mix.spawn(p.x + rnd(-1.5, 1.5), p.y - 2.3, p.z + rnd(-1.5, 1.5), rnd(-3, 3), rnd(1, 4), rnd(-3, 3), rnd(1, 2.5), 1.4, 6, .92, .94, .96, 0.5, -0.2, 1.4, 0.4); } break;
      case 'catend': say('AIRBORNE  -  GEAR UP (G), FLAPS UP (L), THE CADC FLIES THE WINGS', 3); break;
      case 'trap': sfx.thump(1); P.kick = -1.3; say(`TRAPPED  -  ${e.wire} WIRE${e.wire === 3 ? '  -  OK PASS' : ''}`, 3); feed(`ALBATROSS: TOMCAT RECOVERED, ${e.wire} WIRE`, 'good'); ctx.addScore(e.wire === 3 ? 600 : 350); break;
      case 'wirefree': say('CLEAR OF THE WIRE  -  HOOK UP, TAXI  ·  8: BACK TO THE CAT  ·  Y: CLIMB OUT', 3.5); break;
      case 'touchdown': sfx.thump(0.6); if (A.hookCmd && !A.wire && ctx.onCarrier(A.pos.x, A.pos.z)) P.bolterT = 1.5; break;
      case 'hardland': D.hit(0.35, 'gear'); say('HARD LANDING  -  GEAR DAMAGED', 1.8); sfx.boom(0.4); break;
      case 'overstress': D.hit(0.25 + (e.g - 9.6) * 0.1, 'airframe'); say(`OVERSTRESS  ${e.g.toFixed(1)} G  -  AIRFRAME DAMAGED`, 2); break;
      case 'breakup': lose('THE AIRFRAME FAILED'); break;
      case 'flameout': say(`${e.k ? 'RIGHT' : 'LEFT'} ENGINE FLAMED OUT${e.why === 'stall' ? ' (STALL)' : A.fuel <= 0 ? '  -  OUT OF FUEL' : ''}  -  AIRSTART: ENG CRANK + THROTTLE IDLE (OR I)`, 2.8); P.mcSeen.delete('L GEN'); P.mcSeen.delete('R GEN'); break;
      case 'lightoff': snd.lightoff();
        if (P.ss.wet[e.k]) {   // a wet start: the pooled fuel goes up at once, TIT through the red line
          P.ss.wet[e.k] = false; A.eng[e.k].egt = 1010; D.hit(0.12, e.k ? 'engR' : 'engL'); snd.bang(0.5);
          say(`${e.k ? 'RIGHT' : 'LEFT'} ENGINE HOT START  -  TIT OVER LIMIT (FUEL BEFORE 15%)`, 2.5);
        } else say(`${e.k ? 'RIGHT' : 'LEFT'} ENGINE LIGHT-OFF  -  TIT RISING`, 1.4);
        break;
      case 'compstall': snd.bang(); P.kick = 0.5; P.shake = 1; P.stallCue = `${e.k ? 'R' : 'L'} STALL`; say(`${e.k ? 'RIGHT' : 'LEFT'} ENGINE COMPRESSOR STALL  -  THROTTLES IDLE, NOSE DOWN`, 3);
        { const n = model.nozzles[e.k]; _p.copy(n).applyQuaternion(A.q).add(A.pos); fx.flash(_p.x, _p.y, _p.z, 0.8); for (let i = 0; i < 10; i++) fx.add.spawn(_p.x, _p.y, _p.z, rnd(-2, 2), rnd(-2, 2), rnd(-2, 2), rnd(0.3, 0.6), 1.2, 0.4, 1, rnd(.5, .7), .2, 0.9, 0, 1); } break;
      case 'stallclear': P.stallCue = null; say(`${e.k ? 'RIGHT' : 'LEFT'} ENGINE RECOVERED  -  POWER UP SLOWLY`, 2); break;
    }
  }
  function service(dt) {   // stopped on the ALBATROSS: fuel from the fleet stores, missiles back on, the gun, repairs
    if (P.bolterT > 0) { P.bolterT -= dt; if (P.bolterT <= 0 && !A.wire && !A.onGround) say('BOLTER  BOLTER  -  POWER UP, GO AROUND', 2); }
    if (!P.stoppedOnDeck()) { P.serviced = false; return; }
    const need = Math.min(TOMCAT.FUEL_MAX - A.fuel, 400 * dt);
    if (need > 0) A.fuel += ctx.takeFuel(need / KG_PER_UNIT) * KG_PER_UNIT;
    P.rearmT = (P.rearmT || 0) - dt;
    if (P.rearmT <= 0) { P.rearmT = 0.6; const s = A.stores.find(s => !s.on); if (s) s.on = true; else A.gun = Math.min(TOMCAT.GUN_MAX, A.gun + 30); }
    if (D.damaged()) D.repair(0.2 * dt);
    const full = A.fuel > TOMCAT.FUEL_MAX - 1 && A.stores.every(s => s.on) && A.gun >= TOMCAT.GUN_MAX && !D.damaged();
    if (full && !P.serviced) { P.serviced = true; say('ALBATROSS DECK CREW  -  FUELLED AND ARMED  -  8: CAT  ·  Y: CLIMB OUT', 3); }
  }
  // crew g tolerance (as the HORNET's): grey-out past ~5 g, G-LOC with the hands off the stick; red-out below -2.5 g
  function pilotG(dt) {
    const n = A.nz;
    P.blood = clamp(P.blood + (n > 5 ? (n - 5) * 0.13 : n < 4.5 ? -0.22 : 0) * dt, 0, 1.05);
    P.red = clamp(P.red + (n < -2.5 ? (-2.5 - n) * 0.25 : -0.4) * dt, 0, 1);
    if (P.blood >= 1 && P.gloc <= 0) { P.gloc = 4; say('', 0); }
    if (P.gloc > 0) { P.gloc -= dt; if (P.gloc <= 0) { P.blood = 0.6; say('YOU BLACKED OUT  -  EASE THE PULL', 2); } }
  }
  function warnings(dt) {
    const agl = A.pos.y - ctx.groundY(A.pos.x, A.pos.z) - 2.4, lb = A.fuel * LB, m = D.mods(), u = deg(A.alpha) * 1.43;
    P.agl = agl;
    // APN-194 radar altimeter: ALT LOW light below the set height, a tone while sinking through it (not on deck / gear down slow)
    P.altLow = !A.onGround && agl < TCFG.ALT_LOW && !(A.gear > 0.9 && A.eas * KT < 180);
    P.altTone = P.altLow && A.vel.y < -1;
    // WHEELS: gear up, slow, low and descending (the F-14's flashing WHEELS light)
    P.wheels = !A.onGround && A.gear < 0.99 && A.eas * KT < 165 && agl < 450 && A.vel.y < -1.3;
    // stall warning: the rudder pedal shaker from ~20 units
    P.shaker = A.onGround ? 0 : clamp((u - 20) / 8, 0, 1);
    if (!A.eng.some(e => e.stalled)) P.stallCue = null;
    const cz = [...D.cautions()];
    const ss = P.ss;
    for (const k of [0, 1]) {
      const e = A.eng[k], s = k ? 'R' : 'L';
      if (!ss.gens[k]) cz.push(s + ' GEN'); if (e.stalled) cz.push(s + ' INLET'); if (e.start > 0 || ss.cranking[k]) cz.push('START VALVE');
      if (e.oil < 15) cz.push(s + ' OIL PRESS'); if (!e.run) cz.push(s + ' FUEL PRESS');
    }
    if (A.eng.every(e => e.n < 0.4) && A.eas * KT < 150) cz.push('HYD PRESS');   // no pump turning: no combined / flight hydraulics
    if (ss.emerg) cz.push('EMERG GEN'); if (!ss.bus) cz.push('TRANS/RECT');
    if (lb < 2000) cz.push('FUEL LOW'); if (lb < TCFG.BINGO_LB) cz.push('BINGO'); if (A.canopy > 0.02) cz.push('CANOPY');
    if (A.canopy > 0.5 && A.onGround) cz.push('LADDER');
    if (A.surf.brake > 0.05) cz.push('SPD BRK'); if (A.launchBar && !A.cat) cz.push('LAUNCH BAR'); if (A.hookCmd !== Math.round(A.hook)) cz.push('HOOK');
    if (Math.abs(A.sweep - (P.sweep.cmdNow ?? A.sweep)) > 6) { P.sweepLag = (P.sweepLag || 0) + dt; if (P.sweepLag > 5) cz.push('WING SWEEP'); } else P.sweepLag = 0;
    if (P.ap.drop > 0) { P.ap.drop -= dt; cz.push('AUTO PILOT'); }
    ['PITCH STAB', 'ROLL STAB', 'YAW STAB'].forEach((c, i) => { if (!P.sasCh[i]) cz.push(c); });
    const uniq = ss.ess ? [...new Set(cz)] : [];   // no essential bus: the caption lights are dark
    // a new CAUTION (amber) lights the MASTER CAUTION with the chime; ADVISORIES (green) do not
    if (uniq.some(c => !P.mcSeen.has(c) && !ADVS.includes(c))) { if (!P.masterCaution) snd.chime(); P.masterCaution = true; }
    for (const c of uniq) P.mcSeen.add(c);
    for (const c of [...P.mcSeen]) if (!uniq.includes(c)) P.mcSeen.delete(c);
    P.cautions = uniq; void m;
  }
  // shake, vapour, the TF30s' smoke, a stalled engine's belches, damage smoke
  const _t = new THREE.Vector3();
  function effects(dt) {
    const a = deg(A.alpha), p = A.pos;
    P.shake = Math.max(P.shake * Math.exp(-4 * dt), clamp((a - 17) / 14, 0, 1) * 0.6 + A.sep * 0.8 + (A.onGround ? Math.min(1, A.tas / 40) * 0.35 : 0) + (A.cat && A.cat.state === 'stroke' ? 0.5 : 0) + P.shaker * 0.25);
    P.kick *= Math.exp(-3 * dt);
    if (!A.onGround && A.nz > 4.5 && A.eas * KT > 220 && Math.random() < 0.7) {   // vapour off the gloves and tips
      model.group.updateMatrixWorld();
      for (const s of [-1, 1]) { model.wingTipLocal(s, _t).applyMatrix4(model.group.matrixWorld); fx.add.spawn(_t.x, _t.y, _t.z, A.vel.x * 0.9, A.vel.y * 0.9, A.vel.z * 0.9, rnd(0.3, 0.6), 0.5, 1.2, .9, .93, 1, 0.3, 0, 0.5); station([s * 1.6, 0.4, -3.5], _p); fx.add.spawn(_p.x, _p.y, _p.z, A.vel.x * 0.9, A.vel.y * 0.9, A.vel.z * 0.9, rnd(0.15, 0.35), 1.6, 4, .9, .93, 1, 0.25, 0, 0.5); }
    }
    if (A.mach > 0.97 && A.mach < 1.06 && Math.random() < 0.8) { station([0, 0.3, 0], _p); fx.add.spawn(_p.x, _p.y, _p.z, A.vel.x * 0.95, A.vel.y * 0.95, A.vel.z * 0.95, 0.2, 7, 10, .9, .93, 1, 0.3, 0, 0.4); }
    if (A.mach > 1 && !P.boomed) { P.boomed = true; sfx.boom(0.9); } else if (A.mach < 0.95) P.boomed = false;
    for (const k of [0, 1]) {
      const e = A.eng[k];
      if ((D.fire[k] || D.hp[k ? 'engR' : 'engL'] < 0.5 || e.stalled) && Math.random() < (D.fire[k] || e.stalled ? 0.9 : 0.4)) {
        station([k ? 1.55 : -1.55, -0.55, 8.6], _p); if (D.fire[k] || (e.stalled && Math.random() < 0.3)) fx.add.spawn(_p.x, _p.y, _p.z, rnd(-1, 1), rnd(-1, 1), rnd(-1, 1), rnd(0.2, 0.5), 1.5, 0.5, 1, rnd(.4, .6), .1, 0.9, 0, 1); fx.trail(_p.x, _p.y, _p.z, e.stalled ? 1.0 : 1.4);
      }
      if (e.run && e.n > 0.9 && e.ab < 0.05 && Math.random() < 0.25) { station([k ? 1.55 : -1.55, -0.55, 9], _p); fx.trail(_p.x, _p.y, _p.z, 0.5); }   // the TF30's smoky dry exhaust
    }
    if (A.cat && A.cat.state === 'stroke' && Math.random() < 0.6) { const c = env.carrier(); if (c) fx.mix.spawn(p.x + rnd(-1, 1), c.deck + 0.3, p.z + rnd(-1, 1), rnd(-2, 2), rnd(1, 3), rnd(-2, 2), rnd(0.8, 1.6), 1.2, 4, .92, .94, .96, 0.45, -0.2, 1.2, 0.4); }
    if (A.onGround && wasGround === false) { const gy = ctx.groundY(p.x, p.z); for (let i = 0; i < 8; i++) fx.mix.spawn(p.x + rnd(-2.5, 2.5), gy + 0.2, p.z + 1 + rnd(-1, 1), rnd(-3, 3), rnd(0.5, 1.5), rnd(-3, 3), rnd(0.6, 1.2), 0.8, 2.4, .5, .5, .52, 0.5, 0, 1.4); }
    wasGround = A.onGround;
  }
  function updateChutes(dt) {
    const E = P.ejected; if (!E) return;
    E.t += dt;
    E.seats.forEach((s, i) => {
      s.t += dt; const ch = chutes[i];
      if (s.t < 0) { s.pos.copy(A.worldPoint(i ? [0, 1.25, -4.2] : [0, 1.25, -5.45])); s.vel.copy(A.vel).addScaledVector(A.up(_u), 26); return; }   // still in the seat
      if (!s.out) { s.out = true; ch.visible = true; ch.userData.canopy.visible = false; sfx.boom(0.4); fx.flash(s.pos.x, s.pos.y, s.pos.z, 0.6); }
      if (s.landed < 0) {
        const open = s.t > 1.3; ch.userData.canopy.visible = open;
        if (open) { s.vel.multiplyScalar(Math.exp(-1.6 * dt)); s.vel.y = Math.max(s.vel.y - 9 * dt, -5.5); } else s.vel.y -= 9 * dt;
        s.pos.addScaledVector(s.vel, dt); const gy = ctx.groundY(s.pos.x, s.pos.z);
        if (s.pos.y < gy + 0.6) { s.pos.y = gy + 0.6; s.landed = s.t; if (i === P.seat) say(ctx.waterAt(s.pos.x, s.pos.z) ? 'IN THE WATER  -  RESCUE HELICOPTER INBOUND FOR BOTH OF YOU' : 'DOWN SAFE  -  RESCUE INBOUND', 3); }
      }
      ch.position.copy(s.pos); ch.rotation.y += dt * 0.3 * (i ? 1 : -1);
    });
    const me = E.seats[P.seat];
    if (E.seats.every(s => s.landed >= 0) && me.t - me.landed > 4 && !E.done) { E.done = true; for (const c of chutes) c.visible = false; ctx.onLost('CREW RESCUED  -  THE TOMCAT IS LOST', true); }
  }
  P.ejectPos = () => P.ejected ? P.ejected.seats[P.seat].pos : null;

  // ---------------------------------------------------------------- visuals: model, cockpit, cameras, sound
  const st = {};
  P.render = (dt, time, inCockpit, hover) => {
    if (!P.active) return;
    const vis = P.alive; model.group.visible = vis;
    if (!vis) { shadow.visible = false; snd.silence(); return; }
    model.group.position.copy(A.pos); model.group.quaternion.copy(A.q);
    A.lights = P.lights;
    model.animate(A, dt, time, inCockpit);
    if (P.ejected) model.parts.canopy.visible = false;
    for (const m of crewMeshes) m.visible = !inCockpit && !(P.ejected && m.name !== 'glareshield' && m.name !== 'rioPanel' && m.name !== 'seatBack');
    const gy = ctx.groundY(A.pos.x, A.pos.z), alt = A.pos.y - gy;
    shadow.visible = alt < 140; shadow.position.set(A.pos.x, gy + 0.1, A.pos.z); shadow.rotation.y = Math.atan2(-A.forward(_f).x, -_f.z); shadow.material.opacity = clamp(0.4 - alt * 0.003, 0.05, 0.4);
    shadow.scale.x = 0.55 + 0.45 * Math.cos((A.sweep - 20) * D2R * 1.4);
    cockpit.group.visible = inCockpit;
    if (inCockpit) cockpit.update(A, P.ctl, dt, hudState(hover));
    snd.update({ n: [A.eng[0].n, A.eng[1].n], ab: [A.eng[0].ab, A.eng[1].ab], tas: A.tas, inside: inCockpit, canopy: A.canopy, on: P.ejected ? 0 : 1, start: [A.eng[0].start > 0 || !!P.ss.cranking[0], A.eng[1].start > 0 || !!P.ss.cranking[1]], cart: P.ss.ext && !A.eng.every(e => e.run), stalled: [!!A.eng[0].stalled, !!A.eng[1].stalled], shaker: P.shaker, lowAlt: P.altTone, fire: D.fire[0] || D.fire[1], rwr: P.rwrLaunch ? 2 : P.rwr.some(t => t.lock) ? 1 : 0 });
  };
  P.renderParked = (dt, time, vol, crewed = false) => {   // nobody in it (or COMMANDER: the AI wingman's crew): the model, and its engines heard by distance
    if (!P.active || !P.alive) return;
    model.group.visible = true; model.group.position.copy(A.pos); model.group.quaternion.copy(A.q); model.animate(A, dt, time, false); cockpit.group.visible = false;
    for (const m of crewMeshes) m.visible = crewed || m.name === 'glareshield' || m.name === 'rioPanel' || m.name === 'seatBack' || m.name === 'headbox';
    const gy = ctx.groundY(A.pos.x, A.pos.z); shadow.visible = A.pos.y - gy < 120; shadow.position.set(A.pos.x, gy + 0.1, A.pos.z); shadow.rotation.y = Math.atan2(-A.forward(_f).x, -_f.z);
    snd.update({ n: [A.eng[0].n, A.eng[1].n], ab: [Math.max(0, A.eng[0].ab || 0), Math.max(0, A.eng[1].ab || 0)], tas: crewed ? A.tas : 0, inside: false, canopy: crewed ? 0 : 1, on: vol, start: [false, false], stalled: [false, false], shaker: 0, lowAlt: false, fire: false, rwr: 0 });
  };
  function hudState(hover) {
    const m = D.mods();
    st.seat = P.seat; st.power = P.ss.bus; st.ess = P.ss.ess; st.ss = P.ss; st.sasCh = P.sasCh; st.dump = P.dump; st.eng = A.eng; st.flicker = m.avionics < 0.4; st.avionics = m.avionics;
    st.mode = P.hudMode; st.arm = P.arm; st.wpn = P.wpn; st.count = P.wpn === 'GUN' ? A.gun * 5 : count(P.wpn); st.agl = Math.max(0, P.agl ?? 0); st.bingo = TCFG.BINGO_LB;
    st.tgt = P.tgt; st.seeker = P.hudMode === 'A/A' && P.wpn === 'SW' ? { dir: P.seek ? _w.copy(P.seek.u.p).sub(A.pos).normalize() : A.forward(new THREE.Vector3()), locked: !!(P.seek && P.seek.locked) } : null;
    st.pipper = (P.hudMode === 'A/A' && P.wpn === 'GUN') || P.hudMode === 'A/G' || P.firing ? gunPipper() : null;
    st.carrier = carrierInfo(); st.tracks = P.tracks; st.lock = P.lock; st.tidRange = cockpit.tidRange;
    const I = ctx.selectedIsland(); st.wpt = I ? { name: I.name, brg: Math.atan2(I.pad.x - A.pos.x, -(I.pad.z - A.pos.z)), dist: Math.hypot(I.pad.x - A.pos.x, I.pad.z - A.pos.z) } : null;
    st.cautions = P.cautions; st.masterCaution = P.masterCaution; st.fire = D.fire; st.lights = P.lights; st.pbrake = P.pbrake; st.hover = hover;
    st.sweep = { mode: P.sweep.frozen !== null ? 'STUCK' : P.sweep.mode, cmd: P.sweep.cmdNow ?? A.sweep, handle: P.sweep.mode === 'EMER' || P.sweep.mode === 'OVER' ? P.sweep.handle : 20, thumb: P.sweep.thumb };
    st.afcs = P.afcs === 'OFF' ? 'OFF' : P.afcs === 'ALT' ? 'ALT' : 'ATT'; st.sas = P.sas; st.hsdMode = P.hsdMode;
    st.gmax = A.nzMax; st.gmin = A.nzMin; st.rwr = P.rwr; st.rwrLaunch = P.rwrLaunch; st.wheels = P.wheels; st.altLow = P.altLow; st.shaker = P.shaker;
    st.stalled = [!!A.eng[0].stalled, !!A.eng[1].stalled]; st.stallCue = P.stallCue; st.stbyOff = false;
    return st;
  }
  // the crew's eyes: rigid in the airframe, plus head look, g sag, buffet, the stall bang, the cat / trap jolt
  P.cockpitCam = (cam, dt, head) => {
    const E = TEYE[P.seat], sag = clamp((A.nz - 1) * 0.012, -0.03, 0.08), sh = P.shake * 0.006;
    const lean = clamp((Math.abs(head.yaw) - 0.9) / 1.4, 0, 1);   // checking six: the head turns about the neck and the body leans out past the headbox
    _v.set(E.x + rnd(-sh, sh) - Math.sign(head.yaw) * 0.27 * lean, E.y - sag + rnd(-sh, sh) + 0.07 * lean, E.z + P.kick * 0.06 + 0.38 * clamp((Math.abs(head.yaw) - 1.6) / 0.9, 0, 1));   // (looking aft the eyes swing round behind the neck, beside the headbox)
    cam.position.copy(_v).applyQuaternion(A.q).add(A.pos);
    cam.quaternion.copy(A.q).multiply(_q.setFromEuler(_e.set((P.seat ? -0.3 : -0.14) + head.pitch, head.yaw + Math.sign(head.yaw) * 0.6 * Math.max(0, Math.abs(head.yaw) - 1.9), 0, 'YXZ')));
  };
  const chaseQ = new THREE.Quaternion(), chaseP = new THREE.Vector3();
  P.chaseCam = (cam, dt) => {
    const ep = P.ejectPos(), target = ep && P.ejected.t > 0.8 ? ep : A.pos;
    chaseQ.slerp(A.q, 1 - Math.exp(-(P.ejected ? 1 : 4) * dt));
    _v.set(0, 6.5, 32).applyQuaternion(chaseQ).add(target);
    chaseP.lerp(_v, 1 - Math.exp(-9 * dt)); if (chaseP.distanceTo(_v) > 70) chaseP.copy(_v);
    cam.position.copy(chaseP); cam.position.y = Math.max(cam.position.y, ctx.groundY(cam.position.x, cam.position.z) + 2);
    cam.up.set(0, 1, 0).applyQuaternion(chaseQ).lerp(_u.set(0, 1, 0), 0.6).normalize();
    cam.lookAt(_p.set(0, 1.5, -9).applyQuaternion(chaseQ).add(target)); cam.up.set(0, 1, 0);
    if (P.shake > 0.05) cam.position.addScalar(rnd(-0.05, 0.05) * P.shake);
  };
  P.snapChase = () => { chaseQ.copy(A.q); chaseP.set(0, 6.5, 32).applyQuaternion(A.q).add(A.pos); };
  P.hudLine = () => {
    const ab = Math.max(A.eng[0].ab, A.eng[1].ab), sw = P.sweep;
    return `IAS ${Math.round(A.eas * KT)}kt  M${A.mach.toFixed(2)}  ALT ${Math.round(A.pos.y * FT)}ft  G ${A.nz.toFixed(1)}  AOA ${(deg(A.alpha) * 1.43).toFixed(0)}u  SWEEP ${Math.round(A.sweep)}° ${sw.frozen !== null ? 'STUCK' : sw.mode}  THR ${Math.round(P.thr * 100)}%${ab > 0.05 ? ' AB' : ''}  RPM ${Math.round(A.eng[0].n * 100)}/${Math.round(A.eng[1].n * 100)}${A.eng.some(e => e.stalled) ? ' STALL' : ''}  FUEL ${Math.round(A.fuel * LB)}lb  ` +
      `${A.gear > 0.99 ? 'GEAR DN' : A.gear > 0.01 ? 'GEAR ~' : 'GEAR UP'}  FLAPS ${A.flapSel ? 'DN' : 'UP'}${A.hookCmd ? '  HOOK' : ''}${A.surf.brake > 0.1 ? '  SPDBRK' : ''}  ${P.sas ? 'SAS' : 'NO SAS'}${P.afcs !== 'OFF' ? ' AP ' + P.afcs : ''}  TRIM ${((A.trim || 0) / D2R).toFixed(1)}°  ${P.seat ? 'RIO' : 'PILOT'}  [${CTL.state.source === 'NONE' || !CTL.state.source ? 'KEYBOARD' : CTL.state.source}${CTL.state.hasPedals ? ' + PEDALS' : ''}]`;
  };
  P.weapLine = () => `${P.hudMode}  ${P.arm ? 'ARM' : 'SAFE'}  [${P.wpn}]  SW ${count('SW')}  SP ${count('SP')}  PH ${count('PH')}  GUN ${A.gun * 5}${P.hook ? `  TRK ${String(P.hook.n).padStart(2, '0')}${P.lock ? ' STT' : ''}` : ''}`;
  P.hint = () => {
    if (!P.alive) return P.ejected ? 'UNDER THE CANOPY  -  WAITING FOR RESCUE' : '';
    if (P.stallCue) return `${P.stallCue}  -  THROTTLES TO IDLE, NOSE DOWN BELOW 15 UNITS, THEN POWER UP SLOWLY`;
    if (P.seat === 0 && (!A.eng.every(e => e.run) || P.ss.auto || P.ss.crank !== 'OFF')) { const h = startHint(); if (h) return h; }
    if (A.cat && A.cat.state === 'hold' && A.catClear === false) return 'CAT 1 HOLD  -  THE ALBATROSS IS TURNING INTO CLEAR WATER FOR THE LAUNCH';
    if (A.cat && A.cat.state === 'hold') return A.eng[0].n > 0.95 ? 'MIL POWER  -  SALUTE, STAND BY FOR THE SHOT' : 'HOOKED UP ON CAT 1  -  THROTTLES TO MIL (80%+) OR ZONE 5 AFTERBURNER';
    if (A.wire && A.wire.held > 0) return 'TRAPPED  -  THROTTLES TO IDLE, HOOK UP (H)';
    if (P.stoppedOnDeck()) return '8: BACK TO THE CATAPULT  ·  Y: CLIMB OUT (WALK THE DECK)  ·  REFUELLING / REARMING';
    if (A.fuel * LB < TCFG.BINGO_LB) return 'BINGO FUEL  -  RECOVER ON THE ALBATROSS: GEAR, FLAPS DN, HOOK, 15 UNITS, ICLS NEEDLES';
    if (P.seat === 1) return 'RIO  -  B/Q/E HOOK TRACK  ·  L STT LOCK  ·  R LAUNCH  ·  C WEAPON  ·  - / = TID RANGE  ·  A D W S SHIFT CTRL: STEER THE PILOT  ·  [ ] SEAT';
    return '';
  };
  // what to do next in the start (or the airstart), from the switches' state: like the HUEY's checklist line
  function startHint() {
    const ss = P.ss, rpm = k => Math.round(A.eng[k].n * 100);
    const k = ss.auto ? ss.auto.k : ss.crank === 'R' ? 1 : ss.crank === 'L' ? 0 : !A.eng[1].run ? 1 : 0, e = A.eng[k], s = k ? 'R' : 'L';
    const pre = ss.auto ? 'AUTO START  -  ' : '', tit = Math.round(e.egt * 1.25);
    if (e.run && e.n < START.GEN) return `${pre}${s} ENGINE LIGHT-OFF  -  RPM ${rpm(k)}%  TIT ${tit}°C  -  THE CRANK SWITCH DROPS OUT AT 50%`;
    if (e.run && ss.crank !== 'OFF') return `${pre}${s} ENGINE ${rpm(k)}%  -  CRANK OUT AT 50%`;
    if (e.run) return '';
    if (ss.cranking[k]) {
      if (ss.thrOff[k]) return e.n < START.IGN ? `${pre}CRANKING ${s}  -  RPM ${rpm(k)}%  -  ${s} THROTTLE TO IDLE AT 20% (CLICK ITS FINGER LIFT)` : `${pre}${s} RPM ${rpm(k)}%  -  ${s} THROTTLE TO IDLE NOW: FUEL AND IGNITION`;
      return `${pre}${s} RPM ${rpm(k)}%  -  FUEL AND IGNITION ON  -  LIGHT-OFF AT ~24%${ss.wet[k] ? '  -  WET START!' : ''}`;
    }
    if (ss.crank === s) return `ENG CRANK ${s}  -  NO START AIR: ${A.onGround ? 'STOP ON THE DECK FOR THE CART' : 'CROSS-BLEED OFF THE OTHER ENGINE, OR DIVE FOR 225 KNOTS'}`;
    if (!A.onGround) return `${s} ENGINE OUT  -  AIRSTART: ENG CRANK ${s} (CROSS-BLEED OR WINDMILL ABOVE 225 KT), ${s} THROTTLE IDLE  ·  I: AUTO`;
    const cold = !A.eng[0].run && !A.eng[1].run;
    return `${cold ? 'COLD JET  -  ' : ''}START THE ${k ? 'RIGHT' : 'LEFT'} ENGINE: ENG CRANK ${s} (RIGHT CONSOLE), ${s} THROTTLE OFF -> IDLE AT 20%  ·  I: AUTO START`;
  }
  P.gfx = () => ({ grey: P.gloc > 0 ? 1 : clamp((P.blood - 0.35) / 0.65, 0, 1), red: P.red });
  P.chutes = chutes; P.FD = FD;   // (tests fly with the AI's flight director)
  return P;
}
