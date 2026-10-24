// The HORNET as the player's aircraft: input (HOTAS / pedals / keyboard), catapult and deck handling, weapons
// (M61 gun, AIM-9 heat seekers, Mk-82 bombs with CCIP), radar and seeker, the data the HUD and displays show,
// cautions and voice warnings, the pilot's g tolerance (grey-out, G-LOC), ejection, effects and the cameras.
// main.js owns the world; it hands everything in through ctx (see createJetPlay).
import * as THREE from 'three';
import { createJetSim, HORNET, DECKOPS, KT, FT, LB } from './jetfm.js';
import { buildJetMesh, JET } from './jetmodel.js';
import { buildJetCockpit, JEYE } from './jetcockpit.js';
import { createJetDamage, JPARTS } from './jetdamage.js';
import { createDispenser, RWR } from './units/defence/cm.js';   // ngc/cmpolish: ALE-39 flares / chaff, radar warning picture

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const deg = r => r * 180 / Math.PI;
const BINGO_LB = 1500;
// caution keys (P.cautions) that are lights of their own, not left-DDI messages, and the DDI wording of the others
const DDI_SKIP = new Set(['L FIRE', 'R FIRE', 'SPD BRK', 'LAUNCH BAR']);
const DDI_NAME = { 'L ENG': 'L EGT HIGH', 'R ENG': 'R EGT HIGH', HYD: 'HYD 1A 2A' };
const KG_PER_UNIT = HORNET.FUEL_MAX / 100;   // fleet fuel stores: a full jet tank = 100 units (like a helicopter tank)
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _f = new THREE.Vector3(), _u = new THREE.Vector3();
const _iq = new THREE.Quaternion(), _p = new THREE.Vector3(), _m = new THREE.Matrix4(), _cmv = new THREE.Vector3();

export function createJetPlay(ctx) {
  const { scene, war, fx, sfx, say, feed, CTL, GRAV } = ctx;
  const J = createJetSim(GRAV), D = createJetDamage();
  const model = buildJetMesh(1, 0), cockpit = buildJetCockpit();   // FSD #3, BuNo 160777
  model.group.add(cockpit.group); model.group.visible = false; scene.add(model.group);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(11.4, 17).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  shadow.visible = false; scene.add(shadow);
  // the ejected pilot under his parachute
  const chute = (() => {
    const g = new THREE.Group(); g.visible = false;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.35), new THREE.MeshLambertMaterial({ color: 0x5d6542 })));
    const c = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xff7a1a, emissive: 0x552200, side: THREE.DoubleSide }));
    c.position.y = 6; g.add(c); g.userData.canopy = c;
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 5.6, 3), new THREE.MeshBasicMaterial({ color: 0xdddddd })); l.position.set(x * 1.3, 3.2, z * 1.3); l.rotation.set(z * 0.42, 0, -x * 0.42); g.add(l); }
    scene.add(g); return g;
  })();
  const P = {
    J, D, model, cockpit, active: false, alive: false, ejected: null, mode: 'NAV', arm: true, lights: true, pbrake: false,
    thr: 0, thrSrc: 'kb', kb: { pitch: 0, roll: 0, yaw: 0 }, ctl: { pitch: 0, roll: 0, yaw: 0, throttle: [0, 0], brakeL: 0, brakeR: 0 },
    tgt: null, lockT: 0, contacts: [], gunCd: 0, firing: false, aamSide: 0, bombIdx: 0, cautions: [], mcSeen: new Set(), masterCaution: false,
    blood: 0, red: 0, gloc: 0, shake: 0, kick: 0, headZ: 0, view: 'cockpit', zoom: 0, ejectHold: 0, deadT: 0,
    batt: true, apu: 'OFF', apuT: 0, apuOffT: 0, crank: -1, autoStart: null, cautLights: [],   // start panel (see startPanel)
  };
  // CM: the ALE-39 dispenser in the aft fuselage (headline: 60 cartridges, here 30 flares + 30 chaff); a press drops a
  // pair of flares or two chaff, out of the bottom of the fuselage behind the main gear
  P.cm = createDispenser({ name: 'ALE-39', flares: 30, chaff: 30, program: { flare: 2, chaff: 2 }, gap: 0.12, ports: [[-0.45, -0.95, 3.6], [0.45, -0.95, 3.6]], eject: { flare: [0, -1, 0.15], chaff: [0, -1, 0.1] }, sfx, say });
  const cmPose = { get vel() { return J.vel; }, toWorld: (l, o) => { _cmv.set(l[0], l[1], l[2]).applyQuaternion(J.q).add(J.pos); o.x = _cmv.x; o.y = _cmv.y; o.z = _cmv.z; return o; }, dirWorld: (l, o) => { _cmv.set(l[0], l[1], l[2]).normalize().applyQuaternion(J.q); o.x = _cmv.x; o.y = _cmv.y; o.z = _cmv.z; return o; } };
  const env = {
    groundY: ctx.groundY, water: ctx.waterAt, surfVel: war.surfVel, mods: null,
    carrier: () => { const c = war.carrier; return c && c.sinking === undefined ? { x: c.p.x, z: c.p.z, yaw: c.yaw, deck: ctx.CARRIER.DECK + c.p.y, deckAt: war.deckAt ? (x, z) => war.deckAt(c, x, z) : null } : null; },   // NAVAL: deckAt = the deck moving with the sea
  };

  // ---------------------------------------------------------------- life cycle
  P.launch = () => {   // a fresh jet spotted on the catapult, engines turning, tanks full from the fleet stores
    D.reset(); P.cm.reset(); J.stores.aam = [true, true]; J.stores.bomb = [true, true, true, true]; J.gun = HORNET.GUN_MAX; J.dead = false;
    J.fuel = Math.min(HORNET.FUEL_MAX, Math.max(HORNET.FUEL_MAX * 0.35, ctx.takeFuel(100) * KG_PER_UNIT));
    for (const e of J.eng) { e.run = true; e.n = 0.68; e.egt = 430; }
    if (!J.attachCat(env)) return false;
    for (const e of J.eng) { e.run = true; e.n = 0.68; e.egt = 430; }
    Object.assign(P, { active: true, alive: true, ejected: null, mode: 'NAV', arm: true, tgt: null, lockT: 0, thr: 0, thrSrc: 'kb', blood: 0, red: 0, gloc: 0, deadT: 0, ejectHold: 0, batt: true, apu: 'OFF', crank: -1, autoStart: null });
    J.nzMax = J.nzMin = 1; P.mcSeen.clear(); P.serviced = true; model.group.visible = true; chute.visible = false;
    say('HORNET ON CAT 1  -  THROTTLE TO MIL (OR AB) TO LAUNCH', 3); return true;
  };
  P.stow = () => { P.active = false; P.alive = false; model.group.visible = false; shadow.visible = false; chute.visible = false; cockpit.group.visible = false; sfx.jet?.(0, 0, 0, false, false); sfx.seeker?.(0); sfx.jetGun?.(false); };
  P.respot = () => { if (!J.attachCat(env)) return; if (J.eng.some(e => !e.run)) P.autoStart = 'batt'; say('SPOTTED ON CAT 1  -  MIL POWER TO LAUNCH', 2.5); };
  P.stoppedOnDeck = () => P.alive && !P.ejected && J.onGround && !J.wire && !J.cat && relSpeed() < 0.6 && !!ctx.onCarrier(J.pos.x, J.pos.z);
  function relSpeed() { const sv = war.surfVel(J.pos.x, J.pos.z); return Math.hypot(J.vel.x - (sv ? sv.vx : 0), J.vel.z - (sv ? sv.vz : 0)); }
  function lose(why) {
    if (!P.alive) return; P.alive = false; P.deadT = 3;
    P.lastLoss = { why, dead: J.dead, pos: J.pos.toArray().map(v => +v.toFixed(1)), ground: +ctx.groundY(J.pos.x, J.pos.z).toFixed(1), vel: J.vel.toArray().map(v => +v.toFixed(1)), att: J.attitude(), t: performance.now() };   // for tests and post-mortems
    fx.explode(J.pos.x, Math.max(J.pos.y, ctx.groundY(J.pos.x, J.pos.z)), J.pos.z, 3, { fire: ctx.waterAt(J.pos.x, J.pos.z) ? 0 : 80, debris: 22, color: 0x8f979e, oil: true, crater: 3 }); sfx.boom(1.4); sfx.jet(0, 0, 0, false, false); sfx.seeker(0); sfx.jetGun(false);
    model.group.visible = false; shadow.visible = false; cockpit.group.visible = false;
    if (!P.ejected) { say(why, 2.5); ctx.onLost(why, false); }
  }
  P.hurt = (amount, why) => {
    if (!P.alive || P.ejected) return;
    const part = D.hit(amount * 0.8), name = JPARTS.find(p => p.id === part).name; sfx.hit?.() ?? sfx.boom(0.3);
    say(D.fire[0] && part === 'engL' ? 'LEFT ENGINE FIRE  -  PUSH THE L FIRE LIGHT' : D.fire[1] && part === 'engR' ? 'RIGHT ENGINE FIRE  -  PUSH THE R FIRE LIGHT' : `${why}  -  ${name} HIT`, 2);
    if (D.hp.airframe <= 0) lose('BROKE UP IN THE AIR');
  };
  function eject() {
    if (P.ejected || !P.alive) return;
    const up = J.up(_u); P.ejected = { pos: J.worldPoint([0, 1.3, -4.3]), vel: J.vel.clone().addScaledVector(up, 26), t: 0, landed: -1 };
    J.canopy = 1; say('EJECT  EJECT  EJECT', 2.5); sfx.boom(0.6); sfx.seeker(0); sfx.jetGun(false);
    fx.flash(P.ejected.pos.x, P.ejected.pos.y, P.ejected.pos.z, 0.6); chute.visible = true; chute.userData.canopy.visible = false;
    P.view = 'chase'; ctx.onEject();
  }

  // ---------------------------------------------------------------- input
  // the voice alert system ("Bitching Betty"); P.voices keeps what was called, for tests
  P.voices = new Set();
  const voice = (msg, every) => { P.voices.add(msg); sfx.betty?.(msg, every); };
  const kd = ctx.keyDown;
  function readControls(dt) {
    const st = CTL.state, kbx = (kd('KeyD', 'ArrowRight') ? 1 : 0) - (kd('KeyA', 'ArrowLeft') ? 1 : 0), kby = (kd('KeyS', 'ArrowDown') ? 1 : 0) - (kd('KeyW', 'ArrowUp') ? 1 : 0), kbz = (kd('KeyE') ? 1 : 0) - (kd('KeyQ') ? 1 : 0);
    // keys move a virtual stick at a finite rate, so a tap is a small input and holding is full deflection
    const ramp = (cur, tgt, r) => cur + clamp(tgt - cur, -r * dt, r * dt);
    P.kb.roll = ramp(P.kb.roll, kbx, kbx ? 3 : 6); P.kb.pitch = ramp(P.kb.pitch, kby, kby ? 2.2 : 6); P.kb.yaw = ramp(P.kb.yaw, kbz, 4);
    const c = P.ctl, stick = st.stick;
    c.roll = stick && Math.abs(stick.x) > 0.001 ? stick.x : P.kb.roll; c.pitch = stick && Math.abs(stick.y) > 0.001 ? stick.y : P.kb.pitch;
    c.yaw = Math.abs(st.rudder || 0) > 0.001 ? st.rudder : P.kb.yaw;
    // throttle: whichever moved last, the HOTAS lever or the keys (Shift / Space up, Ctrl / Z down)
    const up = kd('ShiftLeft', 'ShiftRight', 'Space', 'PageUp', 'NumpadAdd'), dn = kd('ControlLeft', 'KeyZ', 'PageDown', 'NumpadSubtract');
    if (up || dn) { P.thrSrc = 'kb'; P.thr = clamp(P.thr + ((up ? 1 : 0) - (dn ? 1 : 0)) * 0.6 * dt, 0, 1); }
    if (st.throttle !== null && st.throttle !== undefined) { if (P.lastHw === undefined) P.lastHw = st.throttle; if (Math.abs(st.throttle - P.lastHw) > 0.02) { P.thrSrc = 'hotas'; P.lastHw = st.throttle; } if (P.thrSrc === 'hotas') { P.thr = st.throttle; P.lastHw = st.throttle; } }
    const eng = (k) => J.eng[k].run ? P.thr : 0;
    c.throttle[0] = eng(0); c.throttle[1] = eng(1);
    const wb = kd('Period') || st.actions.wheelbrake || P.pbrake ? 1 : 0;
    c.brakeL = Math.max(st.brakeL || 0, wb); c.brakeR = Math.max(st.brakeR || 0, wb);
    if (P.gloc > 0) { c.pitch = 0; c.roll = 0; c.yaw = 0; }   // blacked out: hands fall off the controls
    return c;
  }
  // HOTAS buttons that are edges (keys come through P.key from main's keydown)
  function buttons() {
    const pr = CTL.state.pressed;
    if (pr.gear) P.cmd('gear'); if (pr.flaps) P.cmd('flaps'); if (pr.hook) P.cmd('hook'); if (pr.missile) P.cmd('missile'); if (pr.bomb) P.cmd('bomb'); if (pr.pickle) P.cmd('pickle'); if (pr.flare) P.cmd('flare'); if (pr.chaff) P.cmd('chaff');
    if (pr.view) ctx.toggleView();
    J.brakeCmd = P.sbToggle || CTL.state.actions.airbrake ? 1 : 0;
  }
  P.key = code => {   // keyboard commands while flying the jet; returns true if the key was used
    const m = { KeyG: 'gear', KeyH: 'hook', KeyL: 'flaps', KeyO: 'airbrake', KeyU: 'canopy', KeyN: 'lights', KeyI: 'engines', KeyR: 'missile', KeyB: 'bomb', Comma: 'arm', Enter: 'pickle', Insert: 'flare', Semicolon: 'flare', Delete: 'chaff', Quote: 'chaff' }[code];
    if (!m) return false; P.cmd(m); return true;
  };
  P.cmd = (id) => {
    if (!P.alive || P.ejected) return;
    cockpit.press(id);
    if (id === 'gear') { if (J.onGround && J.gearCmd) { say('WEIGHT ON WHEELS  -  GEAR LOCKED DOWN', 1.4); return; } if (!D.mods().gearOk) { say('GEAR WILL NOT EXTEND  -  DAMAGED', 1.6); J.gearCmd = 0; return; } J.gearCmd = J.gearCmd ? 0 : 1; sfx.blip(300, 200, 0.15, 'square', 0.05); say(J.gearCmd ? 'GEAR DOWN' : 'GEAR UP', 1); }
    else if (id === 'hook') { J.hookCmd = J.hookCmd ? 0 : 1; if (J.hookCmd && !D.mods().hookOk) say('HOOK DAMAGED', 1.4); else say(J.hookCmd ? 'HOOK DOWN' : 'HOOK UP', 1); }
    else if (id === 'flaps') { J.flapSel = (J.flapSel + 1) % 3; say(`FLAPS ${['AUTO', 'HALF', 'FULL'][J.flapSel]}`, 1); }
    else if (id === 'airbrake') { P.sbToggle = !P.sbToggle; say(P.sbToggle ? 'SPEED BRAKE OUT' : 'SPEED BRAKE IN', 1); }
    else if (id === 'canopy') { if (!J.onGround && !J.canopyCmd) { say('CANOPY STAYS SHUT IN FLIGHT', 1.2); return; } J.canopyCmd = J.canopyCmd ? 0 : 1; }
    else if (id === 'lights') { P.lights = !P.lights; say(P.lights ? 'LIGHTS ON' : 'LIGHTS OFF', 1); }
    else if (id === 'pbrake') { P.pbrake = !P.pbrake; say(P.pbrake ? 'PARKING BRAKE SET' : 'PARKING BRAKE OFF', 1); }
    else if (id === 'engines') {   // I: shut both down (throttles OFF), or run the whole start: BATT, APU, crank R, crank L
      if (J.eng.some(e => e.run || e.start > 0)) { for (const e of J.eng) { e.run = false; e.start = 0; } P.crank = -1; P.autoStart = null; say('THROTTLES OFF  -  ENGINES SHUTTING DOWN', 1.6); }
      else { P.autoStart = 'batt'; say('START  -  BATT ON, APU ON, CRANK RIGHT THEN LEFT', 2); }
    }
    else if (id === 'engL' || id === 'engR') crank(id === 'engL' ? 0 : 1);
    else if (id === 'batt') { P.batt = !P.batt; say(P.batt ? 'BATTERY ON' : 'BATTERY OFF', 1); }
    else if (id === 'apu') { if (P.apu !== 'OFF') { P.apu = 'OFF'; say('APU OFF', 1); } else if (!P.batt) say('APU  -  BATTERY SWITCH IS OFF', 1.4); else { P.apu = 'START'; P.apuT = 0; say('APU START  -  WAIT FOR THE READY LIGHT', 1.6); } }
    else if (id === 'fireL' || id === 'fireR') { const r = D.extinguish(id === 'fireL' ? 0 : 1); say(r === 'FIRE OUT' ? 'FIRE EXTINGUISHED' : r, 1.5); if (r === 'FIRE OUT') sfx.refuel?.(); }
    else if (id === 'arm') { P.arm = !P.arm; say(P.arm ? 'MASTER ARM ON' : 'MASTER ARM SAFE', 1); }
    else if (id === 'cas') { J.cas = !J.cas; say(J.cas ? 'FCS  CAS ON' : 'FCS DIRECT  -  NO PROTECTION, NO TRIM', 2); }
    else if (id === 'mc') { P.masterCaution = false; for (const c of P.cautions) P.mcSeen.add(c); }
    else if (id === 'jett') { let n = 0; J.stores.bomb = J.stores.bomb.map(b => { if (b) n++; return false; }); say(n ? 'STORES JETTISONED' : 'NOTHING TO JETTISON', 1.5); }
    else if (id === 'eject') { if (P.ejectArm > 0) eject(); else { P.ejectArm = 1.2; say('EJECT  -  CLICK THE HANDLE AGAIN', 1.2); } }
    else if (id === 'missile') { if (P.mode !== 'AA') { P.mode = 'AA'; say('A/A  -  AIM-9 SELECTED', 1); } else fireMissile(); }
    else if (id === 'bomb') { if (P.mode !== 'AG') { P.mode = 'AG'; say('A/G  -  MK-82 CCIP', 1); } else dropBomb(); }
    else if (id === 'flare' || id === 'chaff') P.cm.press(id);   // CM
    else if (id === 'pickle') { if (P.mode === 'AA') fireMissile(); else if (P.mode === 'AG') dropBomb(); }
  };
  P.click = id => { if (id.startsWith('ddi') || id.startsWith('ampcd')) { cockpit.press(id); return; } P.cmd(id); };

  // ---------------------------------------------------------------- weapons
  const station = (a, out) => out.set(a[0], a[1], a[2]).applyQuaternion(J.q).add(J.pos);
  function canRelease() { if (!P.arm) { say('MASTER ARM SAFE', 1); return false; } if (J.onGround) { say('WEIGHT ON WHEELS  -  WEAPONS INHIBITED', 1); return false; } return true; }
  function fireMissile() {
    if (!canRelease()) return;
    const k = J.stores.aam[P.aamSide] ? P.aamSide : J.stores.aam[1 - P.aamSide] ? 1 - P.aamSide : -1;
    if (k < 0) { say('NO MISSILES LEFT', 1.2); return; }
    J.stores.aam[k] = false; P.aamSide = 1 - k;
    const p = station(JET.STATIONS.aam[k], new THREE.Vector3()), v = J.forward(_f).multiplyScalar(15).add(J.vel);
    war.fireMissile(p, v, P.tgt && P.tgt.lock ? P.tgt.u : null); fx.flash(p.x, p.y, p.z, 0.5);
    say(P.tgt && P.tgt.lock ? 'FOX TWO' : 'FOX TWO  -  NO LOCK, BORESIGHT', 1.2);
  }
  function dropBomb() {
    if (!canRelease()) return;
    const k = [0, 3, 1, 2].find(i => J.stores.bomb[i]);
    if (k === undefined) { say('BOMBS GONE  -  REARM ON THE ALBATROSS', 1.4); return; }
    const pred = ccipFrom(JET.STATIONS.bomb[k]);
    J.stores.bomb[k] = false; P.lastDrop = { pred, bomb: war.dropBomb(station(JET.STATIONS.bomb[k], new THREE.Vector3()), J.vel.clone()) }; sfx.thump(0.3);
  }
  function gun(dt, held) {
    P.gunCd -= dt; P.firing = false;
    if (!held || J.gun <= 0 || !P.arm || J.onGround) { P.gunCd = Math.max(P.gunCd, 0); sfx.jetGun(false); return; }   // no stored-up burst
    P.firing = true; sfx.jetGun(true);
    while (P.gunCd <= 0) {
      P.gunCd += 0.05; J.gun--;   // 20 bursts/s, each 5 rounds: 100 rounds/s like the M61's high rate
      const p = station(JET.STATIONS.gun, new THREE.Vector3()), f = J.forward(_f);
      const v = new THREE.Vector3(f.x + rnd(-0.004, 0.004), f.y + rnd(-0.004, 0.004), f.z + rnd(-0.004, 0.004)).multiplyScalar(520).add(J.vel);
      war.fireJetGun(p, v); if (Math.random() < 0.5) fx.flash(p.x, p.y, p.z, 0.25);
      if (J.gun <= 0) { say('WINCHESTER  -  GUN EMPTY', 1.2); break; }
    }
  }
  // radar: hostile aircraft and ships in a 120° cone ahead out to 2 km; the designated target is the air contact
  // nearest the nose; in A/A the AIM-9 seeker locks it inside 12° (after a moment of growl)
  function radar(dt) {
    P.contacts.length = 0; _iq.copy(J.q).invert(); let best = null, bestA = 0.55;
    for (const u of war.units) {
      if (u.side !== 2 || u.dead || u.dying || u.gone || u.sinking !== undefined) continue;
      _v.copy(u.p).sub(J.pos); const r = _v.length(); if (r > 2000) continue;
      _w.copy(_v).applyQuaternion(_iq); const az = Math.atan2(_w.x, -_w.z), el = Math.atan2(_w.y, Math.hypot(_w.x, _w.z));
      if (Math.abs(az) > 1.05 || Math.abs(el) > 0.8) continue;
      const k = { u, range: r, az, ship: !!u.dims, alt: u.dims ? '' : String(Math.round(u.p.y * FT / 100)).padStart(2, '0'), locked: false };
      P.contacts.push(k);
      const off = Math.acos(clamp(-_w.z / r, -1, 1));
      if (!u.dims && off < bestA && r < 1500) { bestA = off; best = { k, off }; }
    }
    if (!best) { P.tgt = null; P.lockT = 0; return; }
    const u = best.k.u, same = P.tgt && P.tgt.u === u;
    P.lockT = same && P.mode === 'AA' && best.off < (P.tgt.lock ? 0.35 : 0.21) && best.k.range < 1150 && J.stores.aam.some(Boolean) ? P.lockT + dt : 0;
    const lock = P.lockT > 0.6;
    P.tgt = { u, pos: u.p, range: best.k.range, lock, off: best.off, name: { gunship: 'RW-3 WASP', transport: 'MV-22 OSPREY', drone: 'SEA KNIGHT' }[u.type] || 'BANDIT', shoot: lock && best.k.range > 120 && best.k.range < 1100 };
    best.k.locked = lock;
  }
  // where gun rounds fired now will be when they reach the target's range (minus the target's own motion)
  function gunPipper() {
    const R = P.tgt && P.tgt.range < 1200 ? P.tgt.range : 450, f = J.forward(_f), p0 = station(JET.STATIONS.gun, _p);
    _v.copy(f).multiplyScalar(520).add(J.vel); const t = R / _v.length();
    const out = new THREE.Vector3().copy(p0).addScaledVector(_v, t); out.y -= 4.5 * t * t;
    if (P.tgt && P.tgt.range < 1200) out.addScaledVector(P.tgt.u.v, -t);
    return out;
  }
  // continuously computed impact point: the bomb falls exactly like war.js drops it (gravity 9, no drag)
  function ccip() { return J.stores.bomb.some(Boolean) ? ccipFrom(JET.STATIONS.bomb[1]) : null; }
  function ccipFrom(st) {
    station(st, _p); _v.copy(J.vel);
    for (let i = 0; i < 600; i++) { _v.y -= 9 * 0.04; _p.addScaledVector(_v, 0.04); _p.y += 0.5 * 9 * 0.04 * 0.04; if (_p.y <= ctx.groundY(_p.x, _p.z)) return _p.clone(); }
    return null;
  }

  // ---------------------------------------------------------------- the carrier for the HUD / HSI: TACAN and ICLS
  function carrierInfo() {
    const c = env.carrier(); if (!c) return null;
    const co = Math.cos(c.yaw), si = Math.sin(c.yaw), aimZ = 41 - HORNET.HOOK_TIP[2];
    const pos = new THREE.Vector3(c.x + DECKOPS.LAND_X * co + aimZ * si, c.deck, c.z - DECKOPS.LAND_X * si + aimZ * co);
    const dx = pos.x - J.pos.x, dz = pos.z - J.pos.z, dist = Math.hypot(dx, dz, pos.y - J.pos.y);
    const lx = (J.pos.x - c.x) * co - (J.pos.z - c.z) * si, lz = (J.pos.x - c.x) * si + (J.pos.z - c.z) * co, R = lz - aimZ;
    const icls = R > 20 && R < 3000 && Math.abs(lx - DECKOPS.LAND_X) < R * 0.4 ? { gs: deg(Math.atan2(J.pos.y - c.deck - 2.3, R)) - 3.5, loc: deg(Math.atan2(lx - DECKOPS.LAND_X, R)) } : null;
    return { pos, dist, brg: Math.atan2(dx, -dz), icls };
  }

  // ---------------------------------------------------------------- per frame
  let st = {}, wasGround = true;
  P.update = (dt, inp) => {
    if (P.ejectArm > 0) P.ejectArm -= dt;
    if (!P.active) return;
    if (!P.alive) { P.deadT -= dt; updateChute(dt); return; }
    const c = P.autopilot ? P.autopilot(J, dt, P.ctl) : readControls(dt); buttons();   // autopilot: test hook
    if (J.cat) J.catClear = ctx.catClear();
    war.carrier?.parts.setJBD?.(J.cat ? 1 : 0, dt);   // NAVAL: the jet blast deflector comes up behind a jet on the catapult
    // eject: hold the HOTAS eject button or Backspace for a second
    const held = ctx.keyDown('Backspace') || CTL.state.actions.eject, now = performance.now();   // real time: a hold is a human second
    if (!held) P.ejectHold = 0; else if (!P.ejectHold) P.ejectHold = now; else if (now - P.ejectHold > 900) eject();
    if (P.ejected) { c.pitch = c.roll = c.yaw = 0; updateChute(dt); }
    env.mods = D.mods(); startPanel(dt);
    J.fuel = Math.max(0, J.fuel - D.update(dt));
    const events = J.step(dt, c, env);
    for (const e of events) handle(e);
    if (J.dead) { lose(J.dead === 'water' ? 'DITCHED IN THE SEA' : 'CRASHED'); return; }
    if (!P.ejected) {
      gun(dt, inp.fire || CTL.state.actions.fire);
      radar(dt);
      pilotG(dt); warnings(dt); service(dt);
      P.cm.update(dt, cmPose);   // CM: the queued flare / chaff program
    }
    effects(dt);
    // seeker tone
    if (P.mode === 'AA' && P.arm && J.stores.aam.some(Boolean) && !P.ejected) sfx.seeker(P.tgt && P.tgt.lock ? 2 : P.tgt && P.tgt.off < 0.3 ? 1 : 0); else sfx.seeker(0);
  };
  // COMMANDER: nobody in the cockpit but the AI wingman (units/commander/wingman.js): the commander switched to another
  // unit. The pilot flies the airframe (pilot.update steps J through FD's stick and throttles); the jet's own damage
  // and leaks keep running, a crash is a loss like any other. aiEnv: the pilot's world (terrain, carrier, anchor...).
  const _wenv = {};
  P.wingman = (dt, pilot, aiEnv) => {
    if (!P.active || !P.alive || P.ejected) return;
    env.mods = D.mods(); J.fuel = Math.max(0, J.fuel - D.update(dt));
    pilot.update(dt, Object.assign(_wenv, env, aiEnv));
    if (J.dead) lose(J.dead === 'water' ? 'HORNET DITCHED IN THE SEA' : 'HORNET CRASHED');
  };
  function handle(e) {
    switch (e.e) {
      case 'catshot': sfx.catShot(); P.kick = 1; say('', 0); feed('ALBATROSS: HORNET LAUNCHED', 'good'); { const p = J.pos; for (let i = 0; i < 30; i++) fx.mix.spawn(p.x + rnd(-1, 1), p.y - 1.8, p.z + rnd(-1, 1), rnd(-3, 3), rnd(1, 4), rnd(-3, 3), rnd(1, 2.5), 1.4, 6, .92, .94, .96, 0.5, -0.2, 1.4, 0.4); } break;
      case 'catend': say('AIRBORNE  -  GEAR UP (G), FLAPS AUTO (L)', 2.5); break;
      case 'trap': sfx.thump(1); P.kick = -1.2; say(`TRAPPED  -  ${e.wire} WIRE${e.wire === 3 ? '  -  OK PASS' : ''}`, 3); feed(`ALBATROSS: HORNET RECOVERED, ${e.wire} WIRE`, 'good'); ctx.addScore(e.wire === 3 ? 500 : 300); break;
      case 'wirefree': say('CLEAR OF THE WIRE  -  TAXI, OR PRESS 5 FOR THE CAT, Y FOR THE HELICOPTER', 3.5); break;
      case 'touchdown': sfx.thump(0.6); if (J.hookCmd && !J.wire && ctx.onCarrier(J.pos.x, J.pos.z)) P.bolterT = 1.5; break;
      case 'hardland': D.hit(0.35, 'gear'); say('HARD LANDING  -  GEAR DAMAGED', 1.8); sfx.boom(0.4); break;
      case 'overstress': D.hit(0.25 + (e.g - 9.5) * 0.1, 'airframe'); say(`OVERSTRESS  ${e.g.toFixed(1)} G  -  AIRFRAME DAMAGED`, 2); break;   // no voice: the period set has no over-g call
      case 'breakup': lose('THE AIRFRAME FAILED'); break;
      case 'flameout': say(`${e.k ? 'RIGHT' : 'LEFT'} ENGINE FLAMED OUT${J.fuel <= 0 ? '  -  OUT OF FUEL' : ''}`, 2.2); break;
      case 'lightoff': say(`${e.k ? 'RIGHT' : 'LEFT'} ENGINE LIGHT-OFF`, 1.2); break;
    }
  }
  // ---------------------------------------------------------------- start panel (F/A-18A NATOPS order, game-timed)
  // BATT ON -> APU ON (green READY light after APU_SPOOL s; the real APU takes ~15-30 s) -> ENG CRANK R: the APU's bleed
  // air spins the right engine, light-off at ~24% N2 (the airframe's starter model; the throttle-to-IDLE step is folded
  // into it), the switch drops back to OFF at light-off, the generator comes on line above ~60% -> ENG CRANK L. A
  // running engine at 80%+ can cross-bleed start the other. The APU shuts itself down 60 s after both generators are on.
  const APU_SPOOL = 12;
  function crank(k) {
    const e = J.eng[k], name = k ? 'RIGHT' : 'LEFT';
    if (e.run) { say(`${name} ENGINE RUNNING`, 1); return true; }
    if (!P.batt) { say('ENG CRANK  -  BATTERY OFF', 1.4); return false; }
    if (!(P.apu === 'READY' || (J.eng[1 - k].run && J.eng[1 - k].n > 0.8))) { say(P.apu === 'START' ? 'ENG CRANK  -  WAIT FOR APU READY' : 'ENG CRANK  -  NO BLEED AIR: APU ON FIRST', 1.6); return P.apu === 'START'; }
    if (D.mods().eng[k] <= 0.05 || J.fuel <= 0) { say(`${name} ENGINE WILL NOT START`, 1.4); return false; }
    e.start = 0.01; P.crank = k; say(`ENG CRANK ${k ? 'R' : 'L'}  -  LIGHT-OFF AT 24%`, 1.6); return true;
  }
  function startPanel(dt) {
    if (P.apu === 'START' && (P.apuT += dt) > APU_SPOOL) { P.apu = 'READY'; say('APU READY', 1); }
    if (P.apu !== 'OFF' && !P.batt && !(P.gens && (P.gens[0] || P.gens[1]))) P.apu = 'OFF';
    if (P.crank >= 0) { const e = J.eng[P.crank]; if (e.run || !(e.start > 0)) P.crank = -1; }
    P.gens = J.eng.map(e => e.run && e.n > 0.6);
    if (P.apu !== 'OFF' && P.gens[0] && P.gens[1] && !P.autoStart) { if ((P.apuOffT += dt) > 60) { P.apu = 'OFF'; say('APU OFF  -  60 S AFTER THE SECOND GENERATOR', 1.4); } } else P.apuOffT = 0;
    // the one-key start (I), step by step as the pilot would do it
    const A = P.autoStart;
    if (A === 'batt') { P.batt = true; if (P.apu === 'OFF') { P.apu = 'START'; P.apuT = 0; } P.autoStart = 'apu'; }
    else if (A === 'apu' && P.apu === 'READY') P.autoStart = 'R';
    else if (A === 'R' || A === 'L') { const k = A === 'R' ? 1 : 0; if (J.eng[k].run) P.autoStart = k ? 'L' : null; else if (P.crank < 0 && !crank(k)) P.autoStart = null; }
  }
  function service(dt) {   // on the ALBATROSS deck, stopped: refuel from the fleet stores, rearm, repair
    if (P.bolterT > 0) { P.bolterT -= dt; if (P.bolterT <= 0 && !J.wire && !J.onGround) say('BOLTER  BOLTER  -  POWER UP, GO AROUND', 2); }
    if (!P.stoppedOnDeck()) { P.serviced = false; return; }
    const need = Math.min(HORNET.FUEL_MAX - J.fuel, 240 * dt);
    if (need > 0) J.fuel += ctx.takeFuel(need / KG_PER_UNIT) * KG_PER_UNIT;
    P.rearmT = (P.rearmT || 0) - dt;
    if (P.rearmT <= 0) { P.rearmT = 0.5; const s = J.stores; if (!s.aam[0] || !s.aam[1]) s.aam[s.aam[0] ? 1 : 0] = true; else { const i = s.bomb.indexOf(false); if (i >= 0) s.bomb[i] = true; else J.gun = Math.min(HORNET.GUN_MAX, J.gun + 30); } }
    if (D.damaged()) D.repair(0.2 * dt);
    P.cm.rearm(dt);   // CM
    const full = P.cm.full() && J.fuel > HORNET.FUEL_MAX - 1 && J.stores.aam.every(Boolean) && J.stores.bomb.every(Boolean) && J.gun >= HORNET.GUN_MAX && !D.damaged();
    if (full && !P.serviced) { P.serviced = true; say('ALBATROSS DECK CREW  -  FUELLED AND ARMED  -  5: CAT  ·  Y: HELICOPTER', 3); }
  }
  // pilot g tolerance: above ~5 g blood drains from the head (grey-out, tunnel vision, then G-LOC for a few
  // seconds with the hands off the stick); below -2.5 g, red-out
  function pilotG(dt) {
    const n = J.nz;
    P.blood = clamp(P.blood + (n > 5 ? (n - 5) * 0.13 : n < 4.5 ? -0.22 : 0) * dt, 0, 1.05);   // ~3.5 s at 7.5 g = G-LOC
    P.red = clamp(P.red + (n < -2.5 ? (-2.5 - n) * 0.25 : -0.4) * dt, 0, 1);
    if (P.blood >= 1 && P.gloc <= 0) { P.gloc = 4; say('', 0); }
    if (P.gloc > 0) { P.gloc -= dt; if (P.gloc <= 0) { P.blood = 0.6; say('YOU BLACKED OUT  -  EASE THE PULL', 2); } }
  }
  // Look-ahead terrain check: after `delay` s of reaction the pilot rolls wings level and pulls (4 g, or what the wing
  // can give at this speed; 3 g with the gear down) up to a 45° climb, trading speed for height. Fails if that path
  // comes within the clearance of the ground (terrain, sea or deck). The clearance shrinks when you're already low, so
  // level flight low over flat ground stays quiet; with the gear down only ground rising above you counts (not the
  // runway or deck you're landing on). `rising`: only ground higher than what's under you now (the early TERRAIN call is
  // about hills ahead; sinking towards flat ground is the sink-rate and ALTITUDE calls' job).
  function escapeFails(delay, agl0, rising = false) {
    const v = J.vel, vh = Math.hypot(v.x, v.z), V0 = Math.max(Math.hypot(vh, v.y), 1), hx = vh > 0.1 ? v.x / vh : 0, hz = vh > 0.1 ? v.z / vh : 0;
    const nAv = clamp(J.qbar * 37.16 * 1.3 / (J.mass * 9.81), 1.2, J.gear > 0.5 ? 3 : 4), clr = clamp(agl0 * 0.5, 0, 12), wallOnly = J.gear > 0.5;
    const yOff = 1.9, y0 = J.pos.y, g0 = ctx.groundY(J.pos.x, J.pos.z); let x = J.pos.x, y = y0, z = J.pos.z, gam = Math.atan2(v.y, vh), V = V0;
    const dt = 0.2, T = delay + 9;
    for (let t = dt; t <= T; t += dt) {
      if (t > delay) gam = Math.min(gam + (nAv - Math.cos(gam)) * 9.81 / V * dt, Math.PI / 4);
      const c = Math.cos(gam); x += hx * V * c * dt; z += hz * V * c * dt; y += V * Math.sin(gam) * dt;
      V = Math.sqrt(Math.max(V0 * V0 - 2 * 9.81 * (y - y0), 900));
      const gy = ctx.groundY(x, z);
      if (y - yOff - gy < clr && (!wallOnly || gy > y0 - yOff - 2) && (!rising || gy > g0 + 8)) return true;
      if (y - gy > 2500) return false;   // clear of anything this world has
    }
    return false;
  }
  function warnings(dt) {
    const agl = J.pos.y - ctx.groundY(J.pos.x, J.pos.z) - 1.9, lb = J.fuel * LB, m = D.mods();
    P.warn = null;
    // ground collision: time to impact at the current descent, gear up or fast
    const tti = J.vel.y < -1 ? agl / -J.vel.y : 99;
    const sink = (tti < 3.5 || (agl < 60 && J.vel.y < -6)) && !(J.gear > 0.9 && J.vel.y > -6);
    // terrain ahead (hills, mountain walls): fly the escape the pilot would fly and see if it clears
    P.gcasT = (P.gcasT || 0) - dt;
    if (P.gcasT <= 0 && !J.onGround) { P.gcasT = 0.1; P.gcas = escapeFails(1, agl) ? 2 : escapeFails(3, agl, true) ? 1 : 0; }
    if (J.onGround) P.gcas = 0;
    // voice alerts: the 1980 Hornet's set (NATOPS voice alert system): ENGINE FIRE LEFT / RIGHT, BINGO, FUEL LOW, FLIGHT
    // CONTROLS, ALTITUDE (the radar altimeter's low-altitude warning), ENGINE LEFT / RIGHT (INFERRED: flame-out). No
    // "pull up" or "terrain" voice: ground proximity warning came to the Hornet decades later.
    const pw = P.batt || (P.gens && (P.gens[0] || P.gens[1]));
    if (!J.onGround && (sink || P.gcas === 2)) { P.warn = 'PULL UP'; voice('Altitude, altitude', 2.5); }
    else if (!J.onGround && P.gcas === 1) { P.warn = 'TERRAIN'; voice('Altitude, altitude', 4); }
    else if (!J.onGround && agl < 60 && J.gear < 0.5 && J.vel.y < -1.5) voice('Altitude, altitude', 4);
    if (pw && lb < BINGO_LB && !J.onGround) voice('Bingo, bingo', 30);
    if (pw && lb < 800 && !J.onGround) voice('Fuel low, fuel low', 30);
    if (pw && D.fire[0]) voice('Engine fire left, engine fire left', 6); if (pw && D.fire[1]) voice('Engine fire right, engine fire right', 6);
    if (pw && !m.fcsOk) voice('Flight controls, flight controls', 12);
    if (pw && !J.onGround) for (const k of [0, 1]) if (!J.eng[k].run && J.eng[k].n > 0.3 && !(J.eng[k].start > 0)) voice(k ? 'Engine right, engine right' : 'Engine left, engine left', 8);
    const cz = [...D.cautions()];
    if (lb < 800) cz.push('FUEL LO'); if (lb < BINGO_LB) cz.push('BINGO'); if (J.canopy > 0.02 && !J.onGround) cz.push('CANOPY');
    if (J.surf.brake > 0.05) cz.push('SPD BRK'); if (J.launchBar && !J.cat) cz.push('LAUNCH BAR'); if (J.hookCmd !== Math.round(J.hook)) cz.push('HOOK');
    const gens = P.gens || [true, true]; if (!gens[0]) cz.push('L GEN'); if (!gens[1]) cz.push('R GEN');
    P.cautions = pw ? cz : []; if (P.cautions.some(c => !P.mcSeen.has(c))) { P.masterCaution = true; for (const c of P.cautions) P.mcSeen.add(c); }
    for (const c of [...P.mcSeen]) if (!P.cautions.includes(c)) P.mcSeen.delete(c);
    // the caution light panel (its own captions; the rest are left-DDI messages, see hudState)
    const L = P.cautLights; L.length = 0;
    if (pw) { if (lb < 800) L.push('FUEL LO'); if (!m.fcsOk) L.push('FCES'); if (!gens[0]) L.push('L GEN'); if (!gens[1]) L.push('R GEN'); if (P.batt && !gens[0] && !gens[1] && P.apu === 'OFF') L.push('BATT SW'); }
    P.agl = agl;
  }
  // shake, vapour, damage smoke
  function effects(dt) {
    const a = deg(J.alpha), p = J.pos;
    P.shake = clamp((a - 16) / 14, 0, 1) * 0.6 + J.sep * 0.8 + (J.onGround ? Math.min(1, J.tas / 40) * 0.35 : 0) + (J.cat && J.cat.state === 'stroke' ? 0.5 : 0);
    P.kick *= Math.exp(-3 * dt);
    if (!J.onGround && J.nz > 5 && J.eas * KT > 230 && Math.random() < 0.7) {   // vapour off the LEX and wingtips under hard g
      for (const s of [-1, 1]) { station([s * 1.5, 0.3, -2.5], _p); fx.add.spawn(_p.x, _p.y, _p.z, J.vel.x * 0.9, J.vel.y * 0.9, J.vel.z * 0.9, rnd(0.15, 0.35), 1.5, 4, .9, .93, 1, 0.25, 0, 0.5); station([s * 5.8, 0, 2.4], _p); fx.add.spawn(_p.x, _p.y, _p.z, J.vel.x * 0.9, J.vel.y * 0.9, J.vel.z * 0.9, rnd(0.3, 0.6), 0.5, 1.2, .9, .93, 1, 0.3, 0, 0.5); }
    }
    if (J.mach > 0.97 && J.mach < 1.06 && Math.random() < 0.8) { station([0, 0.2, 1], _p); fx.add.spawn(_p.x, _p.y, _p.z, J.vel.x * 0.95, J.vel.y * 0.95, J.vel.z * 0.95, 0.2, 6, 9, .9, .93, 1, 0.3, 0, 0.4); }
    if (J.mach > 1 && !P.boomed) { P.boomed = true; sfx.boom(0.9); } else if (J.mach < 0.95) P.boomed = false;
    for (const k of [0, 1]) if ((D.fire[k] || D.hp[k ? 'engR' : 'engL'] < 0.5) && Math.random() < (D.fire[k] ? 0.9 : 0.4)) {
      station([k ? 0.62 : -0.62, -0.25, 7.9], _p); if (D.fire[k]) fx.add.spawn(_p.x, _p.y, _p.z, rnd(-1, 1), rnd(-1, 1), rnd(-1, 1), rnd(0.2, 0.4), 1.5, 0.5, 1, rnd(.4, .6), .1, 0.9, 0, 1); fx.trail(_p.x, _p.y, _p.z, 1.4);
    }
    if (J.cat && J.cat.state === 'stroke' && Math.random() < 0.6) { const c = env.carrier(); if (c) fx.mix.spawn(p.x + rnd(-1, 1), c.deck + 0.3, p.z + rnd(-1, 1), rnd(-2, 2), rnd(1, 3), rnd(-2, 2), rnd(0.8, 1.6), 1.2, 4, .92, .94, .96, 0.45, -0.2, 1.2, 0.4); }
    if (J.onGround && wasGround === false) { const gy = ctx.groundY(p.x, p.z); for (let i = 0; i < 8; i++) fx.mix.spawn(p.x + rnd(-2, 2), gy + 0.2, p.z + 1 + rnd(-1, 1), rnd(-3, 3), rnd(0.5, 1.5), rnd(-3, 3), rnd(0.6, 1.2), 0.8, 2.4, .5, .5, .52, 0.5, 0, 1.4); }
    wasGround = J.onGround;
  }
  function updateChute(dt) {
    const E = P.ejected; if (!E) return;
    E.t += dt;
    if (E.landed < 0) {
      const open = E.t > 1.3; chute.userData.canopy.visible = open;
      if (open) { E.vel.multiplyScalar(Math.exp(-1.6 * dt)); E.vel.y = Math.max(E.vel.y - 9 * dt, -5.5); } else E.vel.y -= 9 * dt;
      E.pos.addScaledVector(E.vel, dt); const gy = ctx.groundY(E.pos.x, E.pos.z);
      if (E.pos.y < gy + 0.6) { E.pos.y = gy + 0.6; E.landed = E.t; say(ctx.waterAt(E.pos.x, E.pos.z) ? 'PILOT IN THE WATER  -  RESCUE HELICOPTER INBOUND' : 'PILOT DOWN SAFE  -  RESCUE INBOUND', 3); }
    } else if (E.t - E.landed > 4 && !E.done) { E.done = true; chute.visible = false; ctx.onLost('PILOT RESCUED  -  THE HORNET IS LOST', true); }
    chute.position.copy(E.pos); chute.rotation.y += dt * 0.3;
  }

  // ---------------------------------------------------------------- visuals: model, cockpit, cameras
  const ms = { stab: 0, stabDiff: 0, ail: 0, rud: 0, flap: 0, lef: 0, brake: 0, gear: 1, hook: 0, canopy: 0, steer: 0, wow: [0, 0, 0], launchBar: false, n: [0, 0], nozzle: [1, 1], ab: [0, 0], lights: true, stores: null };
  P.render = (dt, time, inCockpit, hover) => {
    if (!P.active) return;
    const vis = P.alive; model.group.visible = vis;
    if (!vis) { shadow.visible = false; return; }
    model.group.position.copy(J.pos); model.group.quaternion.copy(J.q);
    Object.assign(ms, { stab: J.surf.stab, stabDiff: J.surf.ail * 0.2, ail: J.surf.ail, rud: J.surf.rud, flap: J.surf.flap, lef: J.surf.lef, brake: J.surf.brake, gear: J.gear, hook: J.hook, canopy: P.ejected ? 1 : J.canopy, steer: J.steer * 0.6, launchBar: J.launchBar, lights: P.lights, stores: J.stores });
    ms.wow[0] = J.wow[0]; ms.wow[1] = J.wow[1]; ms.wow[2] = J.wow[2];
    for (const k of [0, 1]) { ms.n[k] = J.eng[k].n; ms.nozzle[k] = J.eng[k].nozzle; ms.ab[k] = J.eng[k].ab; }
    model.animate(ms, dt, time, inCockpit);
    for (const s of model.shell) s.visible = !inCockpit;
    if (model.shell.length && P.ejected) model.shell[0].visible = false;   // the canopy went with the seat
    const gy = ctx.groundY(J.pos.x, J.pos.z), alt = J.pos.y - gy;
    shadow.visible = alt < 120; shadow.position.set(J.pos.x, gy + 0.1, J.pos.z); shadow.rotation.y = Math.atan2(-J.forward(_f).x, -_f.z); shadow.material.opacity = clamp(0.4 - alt * 0.003, 0.05, 0.4);
    cockpit.group.visible = inCockpit;
    if (inCockpit) cockpit.update(J, P.ctl, dt, hudState(hover));
    const avgN = (J.eng[0].n + J.eng[1].n) / 2, ab = Math.max(J.eng[0].ab, J.eng[1].ab);
    sfx.jet(avgN, ab, J.tas, inCockpit, !P.ejected);
  };
  function hudState(hover) {
    const m = D.mods();
    // power: the generators (an engine above ~60%) run the HUD, DDIs, HI and UFC; the battery alone runs the EFD, the
    // warning and caution lights and the APU start
    const gens = P.gens || [true, true];
    st.power = gens[0] || gens[1]; st.battPower = st.power || P.batt; st.batt = P.batt; st.apu = P.apu; st.crank = P.crank; st.cautLights = P.cautLights;
    st.ddiCautions = P.cautions.filter(c => !DDI_SKIP.has(c)).map(c => DDI_NAME[c] || c);
    st.ufcOpt = [':T/R', ' RCV', ' A/A', ' X', ' Y'];
    st.flicker = m.avionics < 0.4; st.mode = P.mode; st.arm = P.arm; st.agl = Math.max(0, P.agl ?? 0); st.bingo = BINGO_LB; st.dmg = m;
    st.tgt = P.tgt; st.seeker = P.mode === 'AA' ? { dir: P.tgt && P.tgt.lock ? _w.copy(P.tgt.pos).sub(J.pos).normalize() : J.forward(new THREE.Vector3()), locked: !!(P.tgt && P.tgt.lock) } : null;
    st.pipper = P.mode !== 'AG' && (P.firing || (P.tgt && P.tgt.range < 1200) || P.mode === 'AA') ? gunPipper() : null;
    st.ccip = P.mode === 'AG' ? ccip() : null;
    st.carrier = carrierInfo(); st.radar = { range: 2000, contacts: P.contacts };
    const I = ctx.selectedIsland(); st.wpt = I ? { name: I.name, brg: Math.atan2(I.pad.x - J.pos.x, -(I.pad.z - J.pos.z)), dist: Math.hypot(I.pad.x - J.pos.x, I.pad.z - J.pos.z) } : null;
    st.cautions = P.cautions; st.masterCaution = P.masterCaution; st.fire = D.fire; st.lights = P.lights; st.pbrake = P.pbrake; st.warn = P.warn; st.hover = hover; st.drawMap = ctx.drawMap; st.rwr = RWR; st.cm = P.cm;
    st.ufc = J.cat ? (J.cat.state === 'hold' ? 'CAT 1  HOLD' : 'CAT 1  SHOT') : J.wire ? `WIRE ${J.trapWire}` : null;
    return st;
  }
  // cockpit camera: the pilot's eye, rigid in the airframe, plus head look, g sag, buffet and the cat / trap jolt
  P.cockpitCam = (cam, dt, head) => {
    const sag = clamp((J.nz - 1) * 0.012, -0.03, 0.08), sh = P.shake * 0.006;
    _v.set(JEYE.x + rnd(-sh, sh), JEYE.y - sag + rnd(-sh, sh), JEYE.z + P.kick * 0.06);
    cam.position.copy(_v).applyQuaternion(J.q).add(J.pos);
    cam.quaternion.copy(J.q).multiply(_q.setFromEuler(_e.set(-0.1 + head.pitch, head.yaw, 0, 'YXZ')));
  };
  // chase camera: behind and above, lagging the jet's attitude a little so rolls and pulls read clearly
  const chaseQ = new THREE.Quaternion(), chaseP = new THREE.Vector3();
  P.chaseCam = (cam, dt) => {
    const target = P.ejected && P.ejected.t > 0.8 ? P.ejected.pos : J.pos;
    chaseQ.slerp(J.q, 1 - Math.exp(-(P.ejected ? 1 : 4) * dt));
    _v.set(0, 5.5, 26).applyQuaternion(chaseQ).add(target);
    chaseP.lerp(_v, 1 - Math.exp(-9 * dt)); if (chaseP.distanceTo(_v) > 60) chaseP.copy(_v);
    cam.position.copy(chaseP); cam.position.y = Math.max(cam.position.y, ctx.groundY(cam.position.x, cam.position.z) + 2);
    cam.up.set(0, 1, 0).applyQuaternion(chaseQ).lerp(_u.set(0, 1, 0), 0.6).normalize();
    cam.lookAt(_p.set(0, 1.5, -8).applyQuaternion(chaseQ).add(target)); cam.up.set(0, 1, 0);
    if (P.shake > 0.05) cam.position.addScalar(rnd(-0.05, 0.05) * P.shake);
  };
  P.snapChase = () => { chaseQ.copy(J.q); chaseP.set(0, 5.5, 26).applyQuaternion(J.q).add(J.pos); };
  // one line of numbers for the external view
  P.hudLine = () => {
    const thrPct = Math.round(P.thr * 100), ab = Math.max(J.eng[0].ab, J.eng[1].ab);
    return `IAS ${Math.round(J.eas * KT)}kt  M${J.mach.toFixed(2)}  ALT ${Math.round(J.pos.y * FT)}ft  G ${J.nz.toFixed(1)}  AOA ${deg(J.alpha).toFixed(0)}°  THR ${thrPct}%${ab > 0.05 ? ' AB' : ''}  RPM ${Math.round(J.eng[0].n * 100)}/${Math.round(J.eng[1].n * 100)}  FUEL ${Math.round(J.fuel * LB)}lb  ` +
      `${J.gear > 0.99 ? 'GEAR DN' : J.gear > 0.01 ? 'GEAR ~' : 'GEAR UP'}  FLAPS ${['AUTO', 'HALF', 'FULL'][J.flapSel]}${J.hookCmd ? '  HOOK' : ''}${J.surf.brake > 0.1 ? '  SPDBRK' : ''}  ${J.cas ? 'CAS' : 'DIRECT'}  [${CTL.state.source === 'NONE' || !CTL.state.source ? 'KEYBOARD' : CTL.state.source}${CTL.state.hasPedals ? ' + PEDALS' : ''}]`;
  };
  P.weapLine = () => `${P.mode}  ${P.arm ? 'ARM' : 'SAFE'}  AIM-9 ${J.stores.aam.filter(Boolean).length}  MK-82 ${J.stores.bomb.filter(Boolean).length}  GUN ${J.gun * 5}  FLR ${P.cm.flare}  CHF ${P.cm.chaff}`;
  P.hint = () => {
    if (!P.alive) return P.ejected ? 'UNDER THE CANOPY  -  WAITING FOR RESCUE' : '';
    if (J.onGround && !J.eng[0].run && !J.eng[1].run) return P.crank >= 0 ? `CRANKING ${P.crank ? 'RIGHT' : 'LEFT'}  -  LIGHT-OFF AT 24%` : P.apu === 'START' ? 'APU STARTING  -  WAIT FOR THE GREEN READY LIGHT' : P.apu === 'READY' ? 'APU READY  -  ENG CRANK R, THEN L (RIGHT CONSOLE)' : 'ENGINES OFF  -  I: FULL START, OR BATT, APU, ENG CRANK ON THE RIGHT CONSOLE';
    if (J.cat && J.cat.state === 'hold' && J.catClear === false) return 'CAT 1 HOLD  -  THE ALBATROSS IS TURNING INTO CLEAR WATER FOR THE LAUNCH';
    if (J.cat && J.cat.state === 'hold') return J.eng[0].n > 0.95 ? 'MIL POWER  -  STAND BY FOR THE SHOT' : 'HOOKED UP ON CAT 1  -  THROTTLE TO MIL (80%+) OR AFTERBURNER';
    if (J.wire && J.wire.held > 0) return 'TRAPPED  -  THROTTLE TO IDLE, HOOK UP (H)';
    if (P.stoppedOnDeck()) return '5: BACK TO THE CATAPULT  ·  Y: SWAP TO THE HELICOPTER  ·  REFUELLING / REARMING';
    if (J.fuel * LB < BINGO_LB) return 'BINGO FUEL  -  RECOVER ON THE ALBATROSS: GEAR, FULL FLAPS, HOOK, 8° AOA, ICLS NEEDLES';
    return '';
  };
  // the vignette for g: grey tunnel (blood), red-out, black at G-LOC
  P.gfx = () => ({ grey: P.gloc > 0 ? 1 : clamp((P.blood - 0.35) / 0.65, 0, 1), red: P.red });
  P.chuteObj = chute;
  return P;
}
