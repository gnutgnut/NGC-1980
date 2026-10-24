// The player's helicopter: a Bell UH-1H "Huey". This file is the glue between the game and
//   hueyfm.js     - the flight model (pure, validated by tools/hueybench.mjs)
//   hueymodel.js  - the exterior model with its moving parts
//   hueycockpit.js- the 3D cockpit (instruments, caution panel, switches, controls, the pilot)
// and holds the aircraft systems (electrics, engine start, governor, cautions with the real UH-1H captions) and the
// pilot's controls: HOTAS / pedals through hotas.js (CTL), keyboard, and an optional stability assist (H) that turns
// the cyclic into an attitude command and the pedals into a yaw-rate command, for flying on a keyboard.
import * as THREE from 'three';
import { createHueySim, UH1H, KT, FT, LB, FPM } from './hueyfm.js';
import { buildHueyMesh } from './hueymodel.js';
import { buildHueyCockpit, HUEY_EYE, HUEY_EYE_PITCH } from './hueycockpit.js';

export const HELI = {
  ROTOR_R: UH1H.R, SKID_Y: -UH1H.SKID_Z,
  CAVE_SCALE: 0.36, CAVE_SKID: -0.75 * 1.6,   // in the 2D cave the Huey is drawn at 0.36 so it fits the cave outline (main.js shipPts)
  RATE: { roll: 1.7 }, RESP: 3.2,             // the cave's arcade disc tilt
  FUEL_ACCEL: 50,                              // game fuel burns 50x the real T53 flow: a tank = ~3 min hover, ~5 min cruise
  HIT_R: 4.0, EYE_PITCH: HUEY_EYE_PITCH,
};
export const EYE = HUEY_EYE;
export const buildHeliMesh = buildHueyMesh;
export const buildCockpit = buildHueyCockpit;
// The Huey flies in real gravity (its numbers are validated at 9.81); the rest of the game world uses 9.0.
export const createHeliSim = () => createHueySim(9.81);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const KG_PER_PCT = UH1H.FUEL_KG / 100;
export const fuelBurnPct = (H) => H.fuelFlow * HELI.FUEL_ACCEL / KG_PER_PCT;   // %/s of the game tank

// ------------------------------------------------------------------------------------------------- systems
// UH-1H caution panel captions (TM 55-1520-210-10), in panel order; the master caution, RPM and FIRE lights are separate.
export const CAPTIONS = ['ENGINE OIL PRESS', 'ENGINE ICING', 'ENGINE ICE DET', 'ENGINE CHIP DET', 'LEFT FUEL BOOST', 'RIGHT FUEL BOOST', 'ENG FUEL PUMP', '20 MINUTE FUEL',
  'FUEL FILTER', 'GOV EMER', 'AUX FUEL LOW', 'XMSN OIL PRESS', 'XMSN OIL HOT', 'HYD PRESSURE', 'ENGINE INLET AIR', 'INST INVERTER', 'DC GENERATOR', 'EXTERNAL POWER', 'CHIP DETECTOR', 'IFF'];   // 5 rows x 4, as the panel reads
// D = damage.js model, G = game state ({fuel %, light}) - the switches the damage model owns stay there (engine fuel,
// hydraulic boost); the rest live here
export function createHeliSystems({ D, G, say }) {
  const S = {
    bat: true, gen: true, inv: true, gov: 'AUTO', trim: true, lowRpmAudio: true, starterKey: false, starterLatch: false,
    grip: 1, beep: 0, auto: null, quick: false, volts: 28, amps: 0, ac: true, cautions: [], mcSeen: new Set(), masterCaution: false, rpmWarn: false, horn: false,
    engOilP: 0, engOilT: 20, xmsnOilP: 0, xmsnOilT: 20, n2Prev: 0,
    get fuelSw() { return D.engineSwitch; }, get hyd() { return D.hydBoost; },
    // hot (running at flight idle, throttle rolls on), or cold and dark
    reset(cold = false) {
      Object.assign(S, { bat: !cold, gen: !cold, inv: !cold, gov: 'AUTO', trim: true, starterKey: false, starterLatch: false, grip: cold ? 0 : 0.18, beep: 0, quick: false, auto: cold ? null : 'rollon', volts: cold ? 0 : 28, engOilP: 0, xmsnOilP: 0 });
      if (cold) D.engineSwitch = false;
      S.mcSeen.clear(); S.masterCaution = false;
    },
    // the one-key start (I with the engine stopped): battery, fuel, starter to 40% N1, idle, throttle open
    quickStart() { S.bat = S.gen = S.inv = true; D.engineSwitch = true; S.grip = 0.16; S.quick = true; S.auto = 'crank'; },
    cut() { S.auto = null; S.starterLatch = false; },
    toggle(id) {
      if (id === 'bat') S.bat = !S.bat; else if (id === 'gen') S.gen = !S.gen; else if (id === 'inv') S.inv = !S.inv;
      else if (id === 'gov') S.gov = S.gov === 'AUTO' ? 'EMER' : 'AUTO'; else if (id === 'trim') S.trim = !S.trim; else if (id === 'lowrpm') S.lowRpmAudio = !S.lowRpmAudio;
      else if (id === 'starter') S.starterLatch = !S.starterLatch;
      else if (id === 'mc') { S.masterCaution = false; for (const c of S.cautions) S.mcSeen.add(c); }
      return S[{ bat: 'bat', gen: 'gen', inv: 'inv', gov: 'gov', trim: 'trim', lowrpm: 'lowRpmAudio', starter: 'starterLatch' }[id]];
    },
    // per frame, before the flight model: what the engine controls are doing -> fields merged into ctl
    controls(dt, H, keyGrip) {
      if (keyGrip) { S.grip = clamp(S.grip + keyGrip * 0.45 * dt, 0, 1); if (S.auto === 'rollon') S.auto = null; }
      if (S.auto === 'crank' && H.n1 > 0.42) { S.auto = 'rollon'; }
      if (S.auto === 'rollon') { S.grip = Math.min(1, S.grip + 0.4 * dt); if (S.grip >= 1) { S.auto = null; S.quick = false; } }
      if (S.starterLatch && (H.n1 > 0.42 || !S.bat)) S.starterLatch = false;   // the latch is a held starter: let go at 40%
      const crank = (S.starterKey || S.starterLatch || S.auto === 'crank') && S.volts > 16;
      return { throttle: S.grip, starter: crank, starterV: clamp((S.volts - 14) / 10, 0, 1), fuel: D.engineSwitch && S.volts > 12 || H.run, gov: S.gov, beep: S.beep, quick: S.quick };
    },
    // per frame, after: electrics, oil, cautions
    update(dt, H, landed) {
      const genOn = S.gen && H.n1 > 0.55 && D.hp.engine > 0.05;
      const target = genOn ? 28 : S.bat ? (H.starter ? 19 : 24) : 0;
      S.volts += (target - S.volts) * Math.min(1, 4 * dt); S.amps = genOn ? 10 + 25 * (S.inv ? 1 : 0) + (G.light ? 15 : 0) : 0;
      S.ac = S.inv && S.volts > 18 && D.hp.avionics > 0.1;
      const xh = D.hp.xmsn, eh = D.hp.engine;
      S.engOilP = H.n1 > 0.05 ? clamp(25 + 70 * (H.n1 - 0.2) / 0.8, 0, 95) * (eh < 0.3 ? 0.4 : 1) : 0;
      S.xmsnOilP = H.rpm > 0.02 ? clamp(55 * Math.min(1, H.rpm * 1.4), 0, 70) * (xh < 0.5 ? xh * 1.6 : 1) : 0;
      S.engOilT += ((H.run ? 60 + 25 * H.gasP / 8e5 + (1 - eh) * 50 : 20) - S.engOilT) * Math.min(1, 0.05 * dt);
      S.xmsnOilT += ((H.rpm > 0.1 ? 55 + 30 * H.torque / 50 + (1 - xh) * 70 + (D.fire ? 40 : 0) : 20) - S.xmsnOilT) * Math.min(1, 0.05 * dt);
      const c = [], pw = S.volts > 18;
      if (pw) {
        if (S.engOilP < 25) c.push('ENGINE OIL PRESS');
        if (eh < 0.6) c.push('ENGINE CHIP DET');
        if (D.hp.fuel < 0.75) c.push('LEFT FUEL BOOST', 'FUEL FILTER'); if (!D.engineSwitch) c.push('LEFT FUEL BOOST', 'RIGHT FUEL BOOST');
        if (eh < 0.35) c.push('ENG FUEL PUMP');
        if (G.fuel < 20) c.push('20 MINUTE FUEL');
        if (S.gov === 'EMER') c.push('GOV EMER');
        if (S.xmsnOilP < 30) c.push('XMSN OIL PRESS'); if (S.xmsnOilT > 110 || xh < 0.35) c.push('XMSN OIL HOT');
        if (!D.mods().hydOk) c.push('HYD PRESSURE');
        if (!S.inv) c.push('INST INVERTER');
        if (!genOn) c.push('DC GENERATOR');
        if (xh < 0.5 || D.hp.tail < 0.6) c.push('CHIP DETECTOR');
      }
      S.cautions = [...new Set(c)];
      if (S.cautions.some(x => !S.mcSeen.has(x))) { S.masterCaution = true; for (const x of S.cautions) S.mcSeen.add(x); }
      for (const x of [...S.mcSeen]) if (!S.cautions.includes(x)) S.mcSeen.delete(x);
      // RPM warning light: rotor < 300 or > 339 rpm, or N2 < 6100 with the engine running (TM); the horn for low rotor
      const nr = H.rpm * 324, n2 = H.n2 * 6600;
      S.rpmWarn = pw && (nr < 300 && nr > 30 || nr > 339 || (H.run && n2 < 6100 && H.n1 > 0.6));
      S.horn = pw && S.lowRpmAudio && nr < 300 && nr > 30 && !(landed && H.c.coll < 0.05);
    },
  };
  return S;
}

// ------------------------------------------------------------------------------------------------- pilot input
// CTL (hotas.js): stick = cyclic, throttle lever = collective, rudder (pedals, or the stick twist) = pedals, buttons for
// the door gun / rockets / bombs / winch, hat = door gun aim. Keyboard: W A S D cyclic, Q E pedals, Space/Shift - Ctrl/Z
// collective. hwOn() = false in keyboard-only mode.
export function createHeliInput({ keyDown, CTL, hwOn = () => true, say }) {
  let sas = true, sasByUser = false, collKb = 0, collSrc = 'kb', lastHw;
  const kb = { x: 0, y: 0, p: 0 }, I = { lon: 0, lat: 0, ped: -0.2, th: 0.07, ph: -0.02 };
  const api = {
    get sas() { return sas; },
    toggleSas() { sas = !sas; sasByUser = true; say(sas ? 'STABILITY ASSIST ON  -  CYCLIC HOLDS ATTITUDE, PEDALS HOLD HEADING' : 'STABILITY ASSIST OFF  -  FULL MANUAL', 1.8); },
    setCollective(v) { collKb = v; collSrc = 'kb'; },
    startCalibration() { CTL.toggle(); },
    // returns { cx, cy, pedal, coll, sas, fire, winch, rocket, bomb, hatX, hatY, source, raw: {cx, cy, pedal} }
    read(dt, H, { trim: trimOn = true, mods } = {}) {
      const st = CTL.state || {}, hw = hwOn(), out = { cx: 0, cy: 0, pedal: 0, coll: 0, sas, fire: false, winch: false, rocket: false, bomb: false, hatX: 0, hatY: 0, source: 'KEYBOARD' };
      // keyboard: keys move a virtual stick at a finite rate; with force trim on (and no assist) it stays where you leave it
      const kx = (keyDown('KeyD', 'ArrowRight') ? 1 : 0) - (keyDown('KeyA', 'ArrowLeft') ? 1 : 0), ky = (keyDown('KeyS', 'ArrowDown') ? 1 : 0) - (keyDown('KeyW', 'ArrowUp') ? 1 : 0), kp = (keyDown('KeyE') ? 1 : 0) - (keyDown('KeyQ') ? 1 : 0);
      const hold = !sas && trimOn, mv = (v, t, held) => held ? clamp(v + t * 1.2 * dt, -1, 1) : hold ? v : v - clamp(v, -3 * dt, 3 * dt);
      kb.x = sas ? (kx ? clamp(kb.x + kx * 2.5 * dt, -1, 1) : kb.x - clamp(kb.x, -4 * dt, 4 * dt)) : mv(kb.x, kx, !!kx);
      kb.y = sas ? (ky ? clamp(kb.y + ky * 2.5 * dt, -1, 1) : kb.y - clamp(kb.y, -4 * dt, 4 * dt)) : mv(kb.y, ky, !!ky);
      kb.p = kp ? clamp(kb.p + kp * 3 * dt, -1, 1) : kb.p - clamp(kb.p, -4 * dt, 4 * dt);
      out.cx = kb.x; out.cy = kb.y; out.pedal = kb.p; out.winch = keyDown('KeyR') || (!H && keyDown('KeyS', 'ArrowDown'));   // R (or S in the cave): winch
      // collective: keys (Shift / Space up, Ctrl / Z down) or the throttle lever, whichever moved last
      const up = keyDown('Space', 'ShiftLeft', 'ShiftRight'), dn = keyDown('ControlLeft', 'KeyZ');
      if (up || dn) { collSrc = 'kb'; collKb = clamp(collKb + ((up ? 1 : 0) - (dn ? 1 : 0)) * 0.4 * dt, 0, 1); }
      if (hw && st.throttle !== null && st.throttle !== undefined) {
        if (lastHw === undefined) lastHw = st.throttle;
        if (Math.abs(st.throttle - lastHw) > 0.03) { collSrc = 'hotas'; }
        if (collSrc === 'hotas') { collKb = st.throttle; lastHw = st.throttle; }
      }
      out.coll = collKb;
      if (hw && st.stick) {
        const sx = st.stick.x || 0, sy = st.stick.y || 0;
        if (Math.abs(sx) > 0.001 || Math.abs(sy) > 0.001 || api.stickUsed) { if (!api.stickUsed) { api.stickUsed = true; if (!sasByUser && sas) { sas = false; out.sas = false; say('FLIGHT STICK  -  FULL MANUAL (H FOR THE STABILITY ASSIST)', 2.5); } } out.cx = Math.abs(sx) > 0.001 || !kx ? sx : out.cx; out.cy = Math.abs(sy) > 0.001 || !ky ? sy : out.cy; out.source = st.source || 'HOTAS'; }
      }
      if (hw && Math.abs(st.rudder || 0) > 0.001) out.pedal = st.rudder;
      if (hw && st.hasPedals) out.source += ' + PEDALS';
      if (hw) { const a = st.actions || {}; out.fire = !!a.fire; out.winch = out.winch || !!(a.pickle || a.airbrake); out.rocket = !!a.missile; out.bomb = !!a.bomb; out.hatX = st.hatX || 0; out.hatY = st.hatY || 0;
        // ngc/hornethuey: the jets' buttons are the Huey's switches here (HOTAS 4 defaults, numbered from 1: 6 STAB ASSIST, 7 FORCE TRIM,
        // 8 LANDING LIGHT, 9 VIEW, 11 STARTER held - on the real collective the starter is the trigger under the grip)
        const pr = st.pressed || {}; out.starter = !!a.wheelbrake; out.press = { sas: !!pr.gear, trim: !!pr.flaps, light: !!pr.hook, view: !!pr.view }; }
      out.raw = { cx: out.cx, cy: out.cy, pedal: out.pedal };
      if (sas && H) assist(out, H, dt, mods);
      out.sas = sas;
      return out;
    },
  };
  // Stability assist (not part of the real aircraft, the flight model is untouched): cyclic = attitude command (+ hover
  // drift hold hands-off), pedals = yaw-rate command with automatic pedal trim fading into a yaw damper at speed.
  const _f = new THREE.Vector3();
  function assist(c, H, dt, mods) {
    if (mods && !mods.hydOk) return;   // the assist rides on the hydraulics
    const a = H.attitude(), pitch = a.pitch, roll = -a.roll, q = H.w.x, p = -H.w.z, r = -H.w.y;
    H.forward(_f); _f.y = 0; _f.normalize(); const u = H.vel.dot(_f), v = H.vel.x * -_f.z + H.vel.z * _f.x, spd = Math.hypot(H.vel.x, H.vel.z);
    const hands = 1 - clamp(Math.hypot(c.cx, c.cy) * 3, 0, 1), slow = 1 - clamp((spd - 4) / 6, 0, 1), air = !H.landed;
    // targets: stick deflection -> pitch / bank; hands-off and slow -> lean against the drift (hover hold)
    I.th = clamp(I.th + (air ? (u * 0.004 * hands * slow) * dt : 0), -0.1, 0.2);
    const thT = clamp(I.th + c.cy * 0.33 + hands * slow * u * 0.05, -0.45, 0.4), phT = clamp(c.cx * 0.55 - hands * slow * v * 0.055 + I.ph, -0.6, 0.6);
    if (air) { I.lon = clamp(I.lon + (thT - pitch) * 0.6 * dt, -0.7, 0.7); I.lat = clamp(I.lat + (phT - roll) * 0.8 * dt, -0.7, 0.7); I.ph = clamp(I.ph - v * 0.002 * hands * slow * dt, -0.05, 0.05); }
    c.cy = clamp(I.lon + (thT - pitch) * 2.2 - q * 0.9, -1, 1);   // + aft
    c.cx = clamp(I.lat + (phT - roll) * 2.4 - p * 0.7, -1, 1);
    // yaw: rate command when slow, fading to a damper + slip-ball centring at speed
    const fast = clamp((spd - 15) / 20, 0, 1), rc = c.pedal * 0.8, beta = spd > 3 ? Math.atan2(v, Math.max(1, u)) : 0;
    if (air) I.ped = clamp(I.ped + ((rc - r) * 0.6 * (1 - fast) - beta * 0.2 * fast) * dt, -1, 1);
    c.pedal = clamp(I.ped + (rc - r) * 1.6 * (1 - fast * 0.6) + c.pedal * fast * 0.5 - beta * fast * 0.8, -1, 1);
    if (!air) { I.lon = 0.1; I.lat = -0.15; I.th = 0.07; I.ph = -0.02; }   // on the skids: the Huey's hover trim (aft and LEFT cyclic, see the bench) ready for the lift-off
  }
  return api;
}
