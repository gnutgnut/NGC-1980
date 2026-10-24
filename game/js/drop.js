// Para-drop repair team. Called down damaged (or dry) on land, you radio for help and home base - off the map, over
// the horizon - sends a Marine KC-130R Hercules, RAIDER 21, with a repair team of three. You fly it in from the edge
// of the map: a real C-130H flight model (units/air/c130fm.js: four T56s, governed props, flaps, the blown wing) from
// the flight deck (units/air/c130cockpit.js) or from outside (V); the autopilot (H) flies it if you let it, with the
// crew working the flaps, the para doors and the jump lights. Line up the jump run, mind the wind (the green smoke at
// the helicopter shows it), keep it at about 130 KIAS with 50 % flaps and no lower than 400 ft, and call the jump on
// the green light (F, or the JUMP LIGHTS switch on the paratroop panel). The stick goes out of both para doors, static
// lines open the MC1-1 canopies, and then you steer them down. Whoever lands on dry ground runs to the helicopter:
// each one brings fuel, and together they fix it - the more that make it, the faster. Flak can knock out engines or
// bring the Hercules down (the stick bails out); fly it into the ground and the team is lost.
import * as THREE from 'three';
import { buildDropship, buildJumper } from './ships.js';
import { createC130Sim, C130, KT } from './units/air/c130fm.js';
import { C130M } from './units/air/c130model.js';
import { buildC130Deck, DECK_EYE, DECK_EYE_PITCH } from './units/air/c130cockpit.js';
import { createC130Audio } from './units/air/c130audio.js';
import { buildDoorBundle } from './units/air/jumper.js';

const CALL = 'RAIDER 21';
const N_JUMPERS = 3, WORK = 10, FUEL_EACH = 20, ENTRY = 1400, RUN = 4.5;
// the drop: 130 KIAS with 50 % flaps (FM 3-21.38: C-130 personnel 130-135 KIAS), ~550 ft over the drop zone (a low
// combat jump), never below 400 ft (bail-out minimum), never above 150 KIAS (para door / bail-out limit)
const DROP_KIAS = 130, CRUISE_KIAS = 150, DROP_AGL = 170, JUMP_MIN_AGL = 120, JUMP_MAX_KIAS = 150;
// MC1-1 (FM 3-21.220 / TM 10-1670-1): ~8 kt forward drive, ~18 ft/s descent, 360 deg in ~9 s; the static line pulls it
// at once, it is out of the bag at ~2 s and fully open at ~3.5 s (the "four-second count"). The canopy flies in real air
// (the 4x density of the aircraft world is a scale trick for the aeroplanes only). Rear-riser slip (S) kills the drive.
// Jump commands (FM 3-21.220 / FM 57-220 sequence, the C-130 has outboard seats along the sides): issued by time to the
// release point, compressed from minutes to seconds like the whole run. The stick hooks its static lines to the anchor
// line cables, the door bundle (A-21 bag on a G-14) goes first on the green light, the static lines and deployment bags
// trail from the doors until the jumpmaster pulls them in.
const JM_CMDS = [['GET READY', 34], ['OUTBOARD PERSONNEL, STAND UP', 30], ['HOOK UP', 26], ['CHECK STATIC LINES', 22], ['CHECK EQUIPMENT', 18],
  ['SOUND OFF FOR EQUIPMENT CHECK', 14], ['STAND BY', 6]];
const HOOKED = 2, DOORS_OPEN = 5;   // stage index after which the stick is hooked up / the jumpmaster has the doors open
const DRIVE = 4.1, SINK = 5.5, TURN = 0.7, SLIP_DRIVE = 1.2, SLIP_SINK = 6.2, DEPLOY = 3.5, HARD_LANDING = 7.0;
const rnd = (a, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fwdX = y => -Math.sin(y), fwdZ = y => -Math.cos(y);   // yaw 0 = nose along -z
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

export function createDrop(ctx) {
  const { scene, fx, sfx, war, groundY, terrainH, isWater, say, feed } = ctx;
  let M = null;
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _r = new THREE.Vector3();
  const snd = createC130Audio(sfx);

  // ground markers: the helicopter (green) and where a jumper leaving now would land with no steering (yellow)
  const ring = (r, col) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }));
    m.renderOrder = 10; m.visible = false; scene.add(m); return m;
  };
  const tRing = ring(7, 0x44ff66), pRing = ring(4.5, 0xffdd33);
  const deck = buildC130Deck(); deck.group.visible = false;

  // ---- flight deck switches: hover with the cursor (or the crosshair when the mouse is captured), click to work them
  const ray = new THREE.Raycaster(), mouseNdc = new THREE.Vector2(), c0 = new THREE.Vector2();
  let camRef = null, hover = null;
  addEventListener('mousemove', e => mouseNdc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
  addEventListener('mousedown', e => {
    if (!M || !deckView() || !hover || (e.button !== 0 && e.button !== 2)) return;
    e.stopImmediatePropagation(); e.preventDefault(); clickSwitch(hover, e.button === 2);
  }, { capture: true });
  addEventListener('contextmenu', e => { if (M && deckView() && hover) e.preventDefault(); });
  // keys the helicopter does not need while the Hercules flies: R flaps, G gear, [ ] trim (H, V, F are main.js's)
  const held = new Set();
  addEventListener('keydown', e => {
    held.add(e.code);
    if (!planeHasStick() || e.repeat || e.ctrlKey || e.altKey) return;
    const S = M.plane.sim;
    if (e.code === "KeyR") { S.flapSel = S.flapSel >= 1 ? 0 : S.flapSel + 0.5; M.flapManual = true; say(`FLAPS ${Math.round(S.flapSel * 100)} %`, 1); }
    if (e.code === 'KeyG') { S.gearCmd = S.gearCmd ? 0 : 1; say(S.gearCmd ? 'GEAR DOWN' : 'GEAR UP', 1); }
  });
  addEventListener('keyup', e => held.delete(e.code));

  function clickSwitch(id, alt) {
    const S = M.plane.sim, k = +id.slice(-1);
    sfx.blip?.(1400, 900, 0.04, 'square', 0.05);
    if (id.startsWith('cond')) { const e = S.eng[k]; S.setCond(k, alt ? 'stop' : e.cond === 'run' ? 'feather' : e.cond === 'feather' ? 'airstart' : 'run'); say(`CONDITION LEVER ${k + 1}: ${S.eng[k].cond.toUpperCase()}`, 1.2); }
    else if (id.startsWith('fire')) { const e = S.eng[k]; e.firePulled = true; S.setCond(k, 'feather'); if (e.fire) e.fire = 'out'; say(`NUMBER ${k + 1} FIRE HANDLE PULLED  -  FEATHERED, AGENT DISCHARGED`, 1.6); }
    else if (id.startsWith('start')) { S.startEngine(k); }
    else if (id === 'gear') S.gearCmd = S.gearCmd ? 0 : 1;
    else if (id === 'flap') { S.flapSel = S.flapSel >= 1 ? 0 : S.flapSel + 0.5; M.flapManual = true; }
    else if (id === 'ap' || id === 'apAlt') api.toggleAP();
    else if (id === 'af') S.autoFeatherArm = !S.autoFeatherArm;
    else if (id === 'bat') S.battery = !S.battery;
    else if (id === 'gtc') S.gtc.cmd = !S.gtc.cmd;
    else if (id === 'bleed') S.bleedValve = !S.bleedValve;
    else if (id === 'jump') { M.jumpSwitch = { off: 'red', red: 'green', green: 'off' }[M.jumpSwitch]; M.lightManual = true; if (M.jumpSwitch === 'green') callGreen(); }
    else if (id === 'bell') { if (M.left > 0) { say('ALARM BELL  -  ABANDON AIRCRAFT', 2); while (M.left > 0) jump(true); } }
    else if (id === 'doorL' || id === 'doorR') { const i = id === 'doorL' ? 0 : 1; S.doorCmd[i] = S.doorCmd[i] ? 0 : 1; M.doorManual = true; }
    else if (id === 'ramp') S.rampCmd = S.rampCmd ? 0 : 1;
    else if (id === 'mc') M.mcReset = true;
  }

  function cleanup() {
    if (!M) return;
    if (M.hadStick) ctx.releaseStick();
    M.plane.mesh.remove(deck.group); scene.remove(M.plane.mesh); M.plane.u.gone = true;
    for (const j of M.jumpers) scene.remove(j.m.group);
    if (M.bundle) scene.remove(M.bundle.m.group);
    for (const L of M.statics) scene.remove(L.line);
    tRing.visible = pRing.visible = false; snd.stop(); M = null;
  }

  // home base is off the map: the Hercules comes in over the edge, from the side the carrier is on, a long way out
  function entryPoint(target, from) {
    let a = Math.atan2(from.z - target.z, from.x - target.x);
    if (Math.hypot(from.x - target.x, from.z - target.z) < 1) a = Math.atan2(1, -1);
    a += rnd(-0.35, 0.35);
    return new THREE.Vector3(target.x + Math.cos(a) * ENTRY, 0, target.z + Math.sin(a) * ENTRY);
  }

  function start(target, from) {
    cleanup();
    const wa = rnd(6.283), ws = rnd(1.5, 4.5);   // up to ~9 kt: inside the 13 kt training jump limit, and an MC1-1 (8 kt) can still hold against it
    const e = entryPoint(target, from), yaw = Math.atan2(-(target.x - e.x), -(target.z - e.z));
    const m = buildDropship(); scene.add(m.group); m.group.add(deck.group);
    const sim = createC130Sim(), alt = Math.max(Math.max(target.y, 0) + 230, groundY(e.x, e.z) + 150, 200);
    const rho = 4.9 * Math.exp(-alt / 6000), tas = CRUISE_KIAS / KT * Math.sqrt(1.225 / rho);
    sim.reset(new THREE.Vector3(e.x, alt, e.z), yaw, tas, { flap: 0, gear: 0, lever: 55 });
    sim.fuel = 9000; sim.payload = 1200 + N_JUMPERS * 140;
    const u = { type: 'dropship', side: 1, ext: true, p: sim.pos, v: sim.vel, r: 11, hp: 14, hpMax: 14, mesh: m.group };
    war.addExternal(u);
    M = {
      phase: 'run', target: new THREE.Vector3(target.x, target.y, target.z), wind: new THREE.Vector2(Math.cos(wa) * ws, Math.sin(wa) * ws),
      plane: { u, sim, mesh: m.group, parts: m, p: sim.pos, entry: e, lastHp: u.hp }, ap: true, view: 'cockpit', ctl: { roll: 0, pitch: 0, yaw: 0, throttle: [0.5, 0.5, 0.5, 0.5] }, kb: { roll: 0, pitch: 0 },
      jumpers: [], left: N_JUMPERS, jumpCd: 0, work: 0, arrived: 0, fixed: false, t: 0, smokeT: 0, hadStick: false, apJump: true,
      cam: new THREE.Vector3().copy(sim.pos).add(_v.set(0, 25, 70)), look: new THREE.Vector3().copy(target), lost: 0, light: 'off', jumpSwitch: 'off', exits: 0,
      doorMen: [null, null], jmFig: null, safetyFig: null, doorT: [0, 0], hold: null, jm: { stage: 0, lastT: -9 }, bundle: null, bundleOut: false, bundleOK: false, statics: [], trail: [], retrieved: false, lastExitT: 0, noInput: 9, env: { groundY: (x, z) => Math.max(groundY(x, z), 0), water: (x, z) => isWater(x, z), wind: { x: 0, z: 0 } },
    };
    M.env.wind.x = M.wind.x; M.env.wind.z = M.wind.y;
    const dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((Math.atan2(M.wind.x, -M.wind.y) + 6.283) % 6.283) / 0.785) % 8];
    const from8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((Math.atan2(e.x - target.x, -(e.z - target.z)) + 6.283) % 6.283) / 0.785) % 8];
    feed(`HOME BASE: REPAIR TEAM OF ${N_JUMPERS} ON THE WAY  -  KC-130 ${CALL} FROM THE ${from8}, ${(ENTRY / 1000).toFixed(1)} km`, 'good');
    feed(`WIND ${ws.toFixed(0)} m/s TOWARD ${dir}`, 'info');
    say(`YOU HAVE ${CALL}  -  AUTOPILOT ON (H)  ·  STICK TO FLY IT  ·  V VIEW  ·  F GREEN LIGHT  ·  R FLAPS`, 4);
    sfx.dock();
  }

  // ---------------------------------------------------------------- jumpers
  // where a jumper leaving the aircraft now lands if he does not steer: the static-line deployment (he slows to the
  // wind and falls), then the canopy drives along the run heading and drifts with the wind
  // While the door bundle is still aboard the release point is set inside the pattern: the bundle (no drive, ~28 ft/s)
  // lands short and the jumpers' unsteered point long; the aim sits 80 % of the way toward the bundle (it cannot steer,
  // the men can: from 800 ft an MC1-1 has ~120 m of drive), so the bundle lands near the helicopter and the stick
  // steers back onto it (a release point set for the men alone dropped the bundle ~120 m short, often in the sea).
  function predict(out) { const S = M.plane.sim; return predictPattern(S.pos.x, S.pos.y, S.pos.z, S.vel.x, S.vel.z, S.vel.y, S.heading, out); }
  const _pb = new THREE.Vector3();
  function predictPattern(x, y, z, vx, vz, vy, h, out) {
    predictFrom(x, y, z, vx, vz, vy, h, out);
    if (M.bundleOut || M.left === 0) return out;
    predictFrom(x, y, z, vx, vz, vy, h, _pb, true);
    return out.set(out.x * 0.2 + _pb.x * 0.8, 0, out.z * 0.2 + _pb.z * 0.8).setY(groundY(out.x, out.z));
  }
  function predictFrom(x, y, z, vx, vz, vy, h, out, bundle = false) {
    const dt = 0.25;
    for (let t = 0; t < 90; t += dt) {
      if (bundle) { const k = Math.exp(-0.9 * dt); vx = M.wind.x + (vx - M.wind.x) * k; vz = M.wind.y + (vz - M.wind.y) * k; vy = t < 1.8 ? Math.max(vy - 9.8 * dt, -25) : vy + (-8.5 - vy) * (1 - Math.exp(-3 * dt)); }
      else if (t < DEPLOY) { const k = Math.exp(-0.9 * dt); vx = M.wind.x + (vx - M.wind.x) * k; vz = M.wind.y + (vz - M.wind.y) * k; vy = t < 2 ? Math.max(vy - 9.8 * dt, -25) : vy + (-SINK - vy) * (1 - Math.exp(-3 * dt)); }
      else { vx = fwdX(h) * DRIVE + M.wind.x; vz = fwdZ(h) * DRIVE + M.wind.y; vy = -SINK; }
      x += vx * dt; y += vy * dt; z += vz * dt;
      if (y < groundY(x, z) + 0.5) break;
    }
    return out.set(x, groundY(x, z), z);
  }
  const aglOf = p => p.y - Math.max(groundY(p.x, p.z), 0);
  const doorWorld = (i, out) => out.set(...C130M.DOOR[i]).applyQuaternion(M.plane.sim.q).add(M.plane.sim.pos);

  // the next man in each open door, standing in it (part of the aircraft until he goes)
  function doorMan(i, show) {
    let d = M.doorMen[i];
    if (show && !d) {
      d = buildJumper(); d.canopy.visible = false; d.rig.pose('door');
      d.group.position.set(i ? 1.72 : -1.72, C130M.FLOOR_Y, C130M.DOOR[i][2]); d.group.rotation.y = i ? -Math.PI / 2 : Math.PI / 2;
      M.plane.mesh.add(d.group); M.doorMen[i] = d;
    }
    if (d) d.group.visible = !!show;
  }

  // the jumpmaster and the safety (the loadmaster) in the hold, part of the aircraft: the jumpmaster does his door check
  // in the left door (leaning out, looking toward the nose for the DZ) from doors open until he pushes the door bundle,
  // then stands at the aft edge of the door facing the stick, controlling the static lines; the safety stands at the
  // aft edge of the right door the whole time the doors are open. Both stay aboard (they retrieve the bags).
  function holdCrew(S) {
    const fig = (key, pose, t, x, z, ry, show) => {
      let f = M[key];
      if (show && !f) { f = buildJumper(); f.canopy.visible = false; f.rig.setKit?.(false); M.plane.mesh.add(f.group); M[key] = f; f.cur = ''; }
      if (!f) return;
      f.group.visible = !!show; if (!show) return;
      if (f.cur !== pose) { f.rig.pose(pose, t); f.cur = pose; }
      f.group.position.set(x, C130M.FLOOR_Y, z); f.group.rotation.y = ry;
    };
    const live = !M.plane.down && !M.plane.gone, dz = C130M.DOOR[0][2];
    const check = live && !M.egress && M.jm.stage > DOORS_OPEN && !M.bundleOut && S.door[0] > 0.9;
    if (check) fig('jmFig', 'doorcheck', 1, -1.84, dz, Math.PI / 2, true);
    else fig('jmFig', 'safety', 1, -1.5, dz + 0.78, 0.35, live && S.door[0] > 0.3 && M.jm.stage > DOORS_OPEN);
    fig('safetyFig', 'safety', -1, 1.5, dz + 0.78, -0.35, live && S.door[1] > 0.3 && M.jm.stage > DOORS_OPEN);
  }

  function jump(force) {
    const S = M.plane.sim;
    if (!force) {
      if (aglOf(S.pos) < JUMP_MIN_AGL) { say(`NO JUMP  -  TOO LOW: CLIMB ABOVE ${Math.round(JUMP_MIN_AGL * 3.28 / 50) * 50} FT`, 1.4); M.jumpCd = 0.8; M.jumpSwitch = 'red'; return; }
      if (S.kias > JUMP_MAX_KIAS) { say(`NO JUMP  -  TOO FAST: SLOW BELOW ${JUMP_MAX_KIAS} KIAS`, 1.4); M.jumpCd = 0.8; M.jumpSwitch = 'red'; return; }
    }
    if (!force && M.jm.stage <= HOOKED) { say('JUMPMASTER: NOT HOOKED UP  -  HOLD', 1.4); M.jumpCd = 1; return; }
    if (!force && !M.bundleOut) { pushBundle(); M.jumpCd = 0.5; return; }   // the door bundle goes first
    M.left--; M.jumpCd = force ? 0.15 : 0.6;   // two doors, one man a second from each
    M.lastExitT = M.t;
    const i = M.exits % 2; M.exits++;   // alternate doors, left first
    if (M.doorMen[i]) { M.plane.mesh.remove(M.doorMen[i].group); M.doorMen[i] = null; M.doorT[i] = 0.9; }
    const m = buildJumper(); m.canopy.visible = false; m.rig.pose('exit'); scene.add(m.group);
    const door = doorWorld(i, new THREE.Vector3()), side = S.right(_r).multiplyScalar(i ? 1 : -1);
    const v = S.vel.clone().addScaledVector(side, 1.6); v.y -= 0.5;
    const j = { m, p: door, v, h: S.heading + (i ? -0.3 : 0.3), state: 'ff', t: 0, off: (M.jumpers.length - 1) * 4, door: i };
    M.jumpers.push(j); sfx.ui?.('select');
    if (!force) { staticLine(j, i); if (M.jumpers.length === 1) feed('JUMPMASTER: GO!', 'good'); }
    say(M.left ? `JUMPER AWAY  -  ${M.left} LEFT` : 'STICK AWAY  -  STEER THE CANOPIES: A/D TURN, S RISER SLIP', 1.6);
  }
  // the green light: the jumpmaster starts the stick (the rest follow at a second's spacing while it stays green)
  function callGreen() {
    if (!M || M.left === 0) return;
    M.jumpSwitch = 'green';
    if (M.jumpCd <= 0) jump();
  }

  // ---- the jumpmaster: commands by time to the release point
  function timeToGo() {
    const S = M.plane.sim; if (!M.run || M.run.setup) return 99;
    return -runGeom().s / Math.max(15, Math.hypot(S.vel.x, S.vel.z));
  }
  function jumpmaster() {
    const J = M.jm; if (M.egress || M.plane.down || J.stage >= JM_CMDS.length) return;
    const T = timeToGo(), [cmd, at] = JM_CMDS[J.stage];
    if ((T < at || (J.stage === JM_CMDS.length - 1 && M.light === 'red')) && M.t - J.lastT > 1.6 && (J.stage < JM_CMDS.length - 1 || M.light !== 'off')) {
      feed(`JUMPMASTER: ${cmd}${J.stage === 5 ? '  -  "OKAY!"' : ''}`, 'info'); J.stage++; J.lastT = M.t;
      if (J.stage === DOORS_OPEN + 1) feed('JUMPMASTER: DOORS OPEN, AIR DEFLECTORS OUT, JUMP PLATFORMS DOWN', 'info');
    }
  }
  // static line: anchor cable over the door -> the jumper's pack while it pays out (4.6 m, ~0.6 s), then the
  // deployment bag stays on it and trails from the door
  const ANCHOR = [[-1.55, 0.95, 6.45], [1.55, 0.95, 6.45]];
  const lineM = new THREE.LineBasicMaterial({ color: 0xd8d0b0 });
  function staticLine(j, i) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const line = new THREE.Line(g, lineM); line.frustumCulled = false; scene.add(line); M.statics.push({ line, j, i });
  }
  function updateStatics() {
    const S = M.plane.sim;
    for (let n = M.statics.length - 1; n >= 0; n--) {
      const L = M.statics[n], p = L.line.geometry.attributes.position;
      _v.set(...ANCHOR[L.i]).applyQuaternion(S.q).add(S.pos);
      if (L.j.t < 0.7 && !M.plane.gone) { p.setXYZ(0, _v.x, _v.y, _v.z); p.setXYZ(1, L.j.p.x, L.j.p.y + 1.3, L.j.p.z); p.needsUpdate = true; continue; }
      scene.remove(L.line); M.statics.splice(n, 1); trailBag(L.i);
    }
  }
  function trailBag(i) {   // a spent static line and its deployment bag streaming aft from the door, flapping
    const s = i ? 1 : -1, n = M.trail.filter(t => t.i === i).length, g = new THREE.Group();
    const pts = [ANCHOR[i], [s * 2.15, -0.3, 6.95], [s * (2.4 + n * 0.12), -1.0 - n * 0.25, 11.2 + n * 0.5]];
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    g.add(new THREE.Line(lg, lineM));
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.42), new THREE.MeshLambertMaterial({ color: 0x5a6038 })); bag.position.set(...pts[2]); g.add(bag);
    M.plane.mesh.add(g); M.trail.push({ g, bag, i, n, base: pts[2] });
  }
  function updateTrail() {
    for (const t of M.trail) t.bag.position.set(t.base[0] + Math.sin(M.t * 13 + t.n) * 0.08, t.base[1] + Math.sin(M.t * 17 + t.n * 2) * 0.1, t.base[2]);
    if (M.left === 0 && M.trail.length && !M.retrieved && M.t - M.lastExitT > 7) {
      for (const t of M.trail) M.plane.mesh.remove(t.g); M.trail.length = 0; M.retrieved = true;
      feed('JUMPMASTER: STATIC LINES AND BAGS RETRIEVED  -  DOORS CLOSING', 'info');
    }
  }
  // the door bundle: out of the left door, its G-14 opens on a static line; it carries the tools
  function pushBundle() {
    const S = M.plane.sim, b = buildDoorBundle(); b.canopy.visible = false; scene.add(b.group);
    const p = doorWorld(0, new THREE.Vector3()), v = S.vel.clone().addScaledVector(S.right(_r), -1.4);
    M.bundle = { m: b, p, v, state: 'ff', t: 0, h: S.heading }; M.bundleOut = true;
    feed('JUMPMASTER: DOOR BUNDLE AWAY', 'info'); sfx.thump?.(0.4);
  }
  function updateBundle(dt) {
    const B = M.bundle; if (!B || B.state === 'down') return;
    B.t += dt;
    const k = Math.exp(-0.9 * dt); B.v.x = M.wind.x + (B.v.x - M.wind.x) * k; B.v.z = M.wind.y + (B.v.z - M.wind.y) * k;
    const sink = 8.5;   // G-14 with a full A-21: ~28 ft/s
    B.v.y = B.t < 1.8 ? Math.max(B.v.y - 9.8 * dt, -25) : B.v.y + (-sink - B.v.y) * (1 - Math.exp(-3 * dt));
    if (B.t > 1.2) { B.m.canopy.visible = true; B.m.animate(M.t, (B.t - 1.2) / 1.8); }
    B.p.addScaledVector(B.v, dt);
    const gy = groundY(B.p.x, B.p.z);
    if (B.p.y < gy + 0.3) {
      B.state = 'down'; B.p.y = gy; B.m.canopy.visible = false; B.m.bag.rotation.z = 0.3;
      const d = Math.hypot(B.p.x - M.target.x, B.p.z - M.target.z);
      if (isWater(B.p.x, B.p.z) && gy < 0.6) { B.p.y = -0.4; feed('DOOR BUNDLE IN THE WATER  -  THE TOOLS ARE LOST', 'bad'); }
      else if (d < 200) { M.bundleOK = true; feed(`DOOR BUNDLE ON THE DZ, ${Math.round(d)} m FROM THE HELICOPTER  -  TOOLS: REPAIRS GO FASTER`, 'good'); }
      else feed('DOOR BUNDLE DOWN TOO FAR OFF  -  THEY WORK WITH WHAT THEY CARRY', 'bad');
    }
    B.m.group.position.copy(B.p); B.m.group.rotation.y = B.h;
  }
  // the checklist card on the flight deck: what the crew is working through now
  function checklist(S) {
    const flaps = `${Math.round(S.flap * 100)} %`, agl = Math.round(aglOf(S.pos) * 3.28 / 10) * 10;
    if (M.egress) return { title: 'COMPLETION OF DROP', items: [['JUMP LIGHTS', M.jumpSwitch === 'off', 'OFF'], ['STATIC LINES / BAGS', M.retrieved, 'RETRIEVED'],
      ['PARA DOORS', S.door[0] < 0.05 && S.door[1] < 0.05, 'CLOSED'], ['AIR DEFLECTORS', S.door[0] < 0.05, 'RETRACTED'], ['FLAPS', S.flap < 0.05, 'UP'], ['DROP REPORT', true, 'SENT']] };
    const J = M.jm.stage;
    return { title: J >= 1 ? 'SLOWDOWN / AIRDROP' : 'DESCENT - TWENTY MINUTE', items: [['TWENTY MINUTE WARNING', true, 'GIVEN'], ['DROP ALTITUDE', Math.abs(aglOf(S.pos) - DROP_AGL) < 25, `${agl} FT AGL`],
      ['FLAPS', S.flap > 0.45, flaps], ['AIRSPEED', Math.abs(S.kias - DROP_KIAS) < 8, `${Math.round(S.kias)} KIAS`], ['STICK', J > HOOKED, 'HOOKED UP'],
      ['PARA DOORS / DEFLECTORS', S.door[0] > 0.9 && S.door[1] > 0.9, 'OPEN'], ['DOOR BUNDLE', J > HOOKED, 'IN THE DOOR'], ['JUMP LIGHTS', M.jumpSwitch !== 'off', M.jumpSwitch.toUpperCase()]] };
  }

  function landJumper(j) {
    const gy = groundY(j.p.x, j.p.z); j.p.y = gy;
    const fast = Math.hypot(j.v.x, j.v.z) > HARD_LANDING;
    j.m.canopy.visible = false; j.m.rig.pose('plf');
    if (isWater(j.p.x, j.p.z) && gy < 0.6) {
      j.state = 'swim'; j.t = 0; M.lost++;
      fx.splash?.(j.p.x, j.p.z, 0.6); feed('JUMPER IN THE WATER  -  THE ALBATROSS WILL FISH HIM OUT', 'bad');
      return;
    }
    if (war.shipAt(j.p.x, j.p.z)) { j.state = 'aboard'; M.lost++; j.m.group.visible = false; feed('JUMPER CAME DOWN ON A SHIP  -  OUT OF THIS ONE', 'bad'); return; }
    if (Math.hypot(j.p.x - M.target.x, j.p.z - M.target.z) > 300) { j.state = 'stranded'; M.lost++; feed('JUMPER DOWN TOO FAR AWAY TO WALK  -  WAITING FOR PICK-UP', 'bad'); return; }
    j.state = 'run'; j.t = 0; j.slow = fast;
    if (fast) say('HARD LANDING  -  TURN INTO THE WIND BEFORE TOUCHDOWN', 1.6);
    for (let i = 0; i < 6; i++) fx.mix.spawn(j.p.x, gy + 0.3, j.p.z, rnd(-1.5, 1.5), rnd(0.3, 1), rnd(-1.5, 1.5), rnd(0.8, 1.5), 0.4, 1.6, .5, .45, .35, 0.4, 0.5, 1.5, 0.3);
  }

  function updateJumper(j, dt, steer, brake, lead) {
    j.t += dt;
    const m = j.m, rig = m.rig;
    if (j.state === 'ff') {   // out of the door: the static line pays out, the slipstream takes him, the canopy blossoms
      const k = Math.exp(-0.9 * dt); j.v.x = M.wind.x + (j.v.x - M.wind.x) * k; j.v.z = M.wind.y + (j.v.z - M.wind.y) * k;
      j.v.y = j.t < 2 ? Math.max(j.v.y - 9.8 * dt, -25) : j.v.y + (-SINK - j.v.y) * (1 - Math.exp(-3 * dt));
      j.p.addScaledVector(j.v, dt);
      if (j.t > 1.6) { m.canopy.visible = true; m.canopyAnim(M.t, (j.t - 1.6) / (DEPLOY - 1.6), 0); }
      m.body.rotation.x = 0.35 + Math.sin(j.t * 3) * 0.15 * (j.t < 2 ? 1 : 0);
      if (j.t >= DEPLOY) { j.state = 'canopy'; j.t = 0; rig.pose('canopy'); sfx.noiseBurst?.(700, 200, 0.25, 0.12); }
      if (j.p.y < groundY(j.p.x, j.p.z) + 0.5) { j.state = 'canopy'; landJumper(j); }
    } else if (j.state === 'canopy') {
      const gy = groundY(j.p.x, j.p.z), agl = j.p.y - gy;
      let s = 0, b = 0;
      if (lead && (Math.abs(steer) > 0.05 || brake > 0.05)) M.jumpHandsT = 0;
      if (lead && M.jumpHandsT < 1.5) { s = steer; b = brake; }
      else {   // the jumper flies himself: toward the helicopter, and into the wind for the landing
        const tx = M.target.x + j.off, tz = M.target.z;
        let want = Math.atan2(-(tx - j.p.x), -(tz - j.p.z));
        if (agl < 30 && Math.hypot(M.wind.x, M.wind.y) > 1.5) want = Math.atan2(M.wind.x, M.wind.y);
        s = clamp(-angDiff(j.h, want) * 1.2, -1, 1);
      }
      j.h -= s * TURN * dt;
      const drive = DRIVE + (SLIP_DRIVE - DRIVE) * b, sink = SINK + (SLIP_SINK - SINK) * b, k = 1 - Math.exp(-2.5 * dt);
      j.v.x += (fwdX(j.h) * drive + M.wind.x - j.v.x) * k; j.v.z += (fwdZ(j.h) * drive + M.wind.y - j.v.z) * k; j.v.y += (-sink - j.v.y) * (1 - Math.exp(-1.6 * dt));
      j.p.addScaledVector(j.v, dt);
      m.canopyAnim(M.t, 1, s); m.group.rotation.z = -s * 0.15;
      m.legs[0].rotation.x = m.legs[1].rotation.x = -0.12 - b * 0.3;
      if (agl < 0.6) landJumper(j);
    } else if (j.state === 'run') {
      if (j.t < 0.6) { m.group.position.copy(j.p); m.group.rotation.y = j.h; return; }   // the PLF, then up and running
      if (j.t < 0.7) rig.pose('stand');
      const dx = M.target.x + Math.cos(j.off) * 2.6 - j.p.x, dz = M.target.z + Math.sin(j.off) * 2.6 - j.p.z, d = Math.hypot(dx, dz);
      if (d < 1) { j.state = 'work'; j.t = 0; M.arrived++; ctx.onFuel(FUEL_EACH); feed(`REPAIR CREW AT THE HELICOPTER  -  +${FUEL_EACH}% FUEL`, 'good'); }
      else {
        const sp = (j.slow ? 1.6 : RUN) * Math.min(1, (j.t - 0.6) / 0.8);
        const nx = j.p.x + dx / d * sp * dt, nz = j.p.z + dz / d * sp * dt;
        if (isWater(nx, nz) && groundY(nx, nz) < 0.5) { j.state = 'stuck'; M.lost++; feed('JUMPER CUT OFF BY WATER', 'bad'); }
        else { j.p.set(nx, groundY(nx, nz), nz); j.h = Math.atan2(-dx, -dz); }
        const ph = j.t * (j.slow ? 6 : 11); m.legs[0].rotation.x = Math.sin(ph) * 0.7; m.legs[1].rotation.x = -Math.sin(ph) * 0.7; m.arms[0].rotation.x = -Math.sin(ph) * 0.6; m.arms[1].rotation.x = Math.sin(ph) * 0.6;
      }
      m.group.rotation.z = 0;
    } else if (j.state === 'work') {
      j.h = Math.atan2(-(M.target.x - j.p.x), -(M.target.z - j.p.z));
      const ph = j.t * 7; m.legs[0].rotation.x = m.legs[1].rotation.x = 0; m.body.rotation.x = M.fixed ? 0 : 0.35;
      m.arms[0].rotation.x = M.fixed ? -2.6 - Math.sin(ph) * 0.4 : -1.2 + Math.sin(ph) * 0.5; m.arms[1].rotation.x = M.fixed ? 0 : -1.2 - Math.sin(ph) * 0.5;   // spanners, then a wave
      if (!M.fixed && Math.random() < dt * 5) fx.add.spawn(M.target.x + (j.p.x - M.target.x) * 0.5, j.p.y + 1, M.target.z + (j.p.z - M.target.z) * 0.5, rnd(-2, 2), rnd(1, 3), rnd(-2, 2), 0.25, 0.25, 0.1, 1, .85, .4, 1, 9);
    } else if (j.state === 'swim') {
      j.p.y = -0.9 + Math.sin(j.t * 3) * 0.1; if (Math.random() < dt * 2) fx.water.add({ x: j.p.x, y: 0.1, z: j.p.z, size: 0.5, grow: 2.5, a: 0.5, life: 1.2, tile: 1 });
    }
    m.group.position.copy(j.p); m.group.rotation.y = j.h;
  }

  // ---------------------------------------------------------------- the aeroplane
  // the jump run: where the autopilot aims, so that the unsteered landing point sweeps over the helicopter
  // The jump run: a straight line on heading h through the release point (CARP), where a man leaving at 130 KIAS lands
  // on the helicopter if he does not steer (his throw plus the drift under canopy, computed like predict()). The run is
  // flown along the line from the entry; overshoot it without the stick out and the crew turns round and runs it back.
  function planRun(h) {
    const T = M.target, alt = Math.max(T.y, 0) + DROP_AGL, rho = 4.9 * Math.exp(-alt / 6000), tas = DROP_KIAS / KT * Math.sqrt(1.225 / rho);
    const ux = fwdX(h), uz = fwdZ(h), along = tas + M.wind.x * ux + M.wind.y * uz;   // the autopilot crabs: ground track along the run
    predictPattern(T.x, alt, T.z, ux * along, uz * along, 0, h, _w);
    M.run = { h, x: T.x - (_w.x - T.x), z: T.z - (_w.z - T.z), passes: 0, setup: false };
  }
  function runGeom() {   // along-track distance s (negative before the release point) and cross-track c (+ = right of it)
    const S = M.plane.sim, R = M.run, rx = S.pos.x - R.x, rz = S.pos.z - R.z;
    return { s: rx * fwdX(R.h) + rz * fwdZ(R.h), c: rx * Math.cos(R.h) - rz * Math.sin(R.h) };
  }
  function apTarget() {
    const T = M.target, S = M.plane.sim;
    const d = Math.hypot(T.x - S.pos.x, T.z - S.pos.z);
    const lookY = Math.max(groundY(S.pos.x + fwdX(S.heading) * 350, S.pos.z + fwdZ(S.heading) * 350), groundY(S.pos.x, S.pos.z), 0);
    if (M.left === 0 || M.egress) return { x: M.plane.entry.x, z: M.plane.entry.z, alt: Math.max(lookY + 160, 260), kias: 200 };
    if (!M.run) planRun(Math.atan2(-(T.x - S.pos.x), -(T.z - S.pos.z)));
    let { s, c } = runGeom();
    // overshot without the stick out: go round - out past the start of the run, 480 m to its right, so the 180 deg turn
    // back (radius ~240 m at 130 KIAS and 25 deg of bank) rolls out on the line
    if (s > 250 && M.jumpSwitch !== 'green' && !M.run.setup) { M.run.setup = true; M.run.passes++; feed(`${CALL}: GO AROUND  -  RUNNING IT AGAIN`, 'info'); }
    if (M.run.setup) {
      const px = M.run.x - fwdX(M.run.h) * 1700 + Math.cos(M.run.h) * 480, pz = M.run.z - fwdZ(M.run.h) * 1700 - Math.sin(M.run.h) * 480;
      if (Math.hypot(px - S.pos.x, pz - S.pos.z) < 250) M.run.setup = false;
      else return { track: Math.atan2(-(px - S.pos.x), -(pz - S.pos.z)), alt: Math.max(Math.max(T.y, 0) + 230, lookY + 120), kias: CRUISE_KIAS, s, c };
    }
    const dzAlt = Math.max(T.y, 0) + DROP_AGL;
    // line following: intercept at up to 35 deg, steeper the further off; a long way off (turning round) head for the start of the run
    const track = M.run.h + clamp(c * 0.0028, -0.5, 0.5);   // converges with a ~10 s time constant: slower than the heading loop, no weave
    return { track, alt: Math.max(s < -1000 ? Math.max(dzAlt, 220) : dzAlt, lookY + 110), kias: s < -1100 ? CRUISE_KIAS : DROP_KIAS, s, c };
  }
  const apCmd = t => ({ track: t.track ?? Math.atan2(-(t.x - M.plane.sim.pos.x), -(t.z - M.plane.sim.pos.z)), alt: t.alt, kias: Math.min(t.kias, flapLimit(M.plane.sim)) });
  // the crew: flaps 50 % for the run below 180 KIAS (limit), up again on the way out; para doors open on the red light
  // (the loadmaster), closed when the stick is out; a dead engine gets feathered
  // the autopilot keeps inside the flap limit (230 - flap %, OPS card) and the para door limit with them open
  const flapLimit = S => Math.min(S.flap > 0.03 || S.flapSel > 0 ? C130.V_FLAP(Math.max(S.flap, S.flapSel)) - 12 : 400, S.door[0] + S.door[1] > 0.05 ? C130.V_DOORS - 15 : 400);
  function crew(dt) {
    const S = M.plane.sim, T = M.target, d = Math.hypot(T.x - S.pos.x, T.z - S.pos.z);
    if (!M.flapManual) {
      if (M.run && M.run.setup && S.kias > 140) S.flapSel = 0;
      else if (!M.egress && M.run && runGeom().s > -1500 && runGeom().s < 300 && S.kias < 175) S.flapSel = 0.5;
      if (M.egress && S.kias > 140 && S.vel.y > -1) S.flapSel = 0;
    }
    if (!M.doorManual) { const open = (!M.egress || !M.retrieved) && (M.jm.stage > DOORS_OPEN || M.light !== 'off' || M.jumpSwitch !== 'off') && S.kias < 180 && !(M.egress && M.retrieved); S.doorCmd[0] = S.doorCmd[1] = open ? 1 : 0; }
    for (let k = 0; k < 4; k++) {
      const e = S.eng[k];
      if (!e.run && e.cond !== 'feather' && !e.autoFeathered && e.hp < 0.5 && (M.ap || !M.hadStick)) { e.crewT = (e.crewT || 0) + dt; if (e.crewT > 2.5) { S.setCond(k, 'feather'); if (e.fire) { e.fire = 'out'; e.firePulled = true; } feed(`${CALL}: NUMBER ${k + 1} FEATHERED`, 'info'); } }
    }
  }
  // flak damage reaches the engines: a hit may knock one out or set it on fire
  function engineDamage(S, hits) {
    if (hits <= 0 || Math.random() > 0.45) return;
    const k = Math.floor(Math.random() * 4), e = S.eng[k];
    e.hp = Math.max(0, e.hp - rnd(0.25, 0.7));
    if (e.hp < 0.4 && !e.fire && e.run) { e.fire = true; feed(`${CALL}: NUMBER ${k + 1} ENGINE FIRE`, 'bad'); say(`NUMBER ${k + 1} ENGINE FIRE  -  PULL THE FIRE HANDLE (OVERHEAD)`, 2); }
    else feed(`${CALL}: HIT  -  NUMBER ${k + 1} ENGINE DAMAGED`, 'bad');
  }

  function updatePlane(dt, ctl, fireNow, hasStick) {
    const P = M.plane, S = P.sim, u = P.u;
    const agl = aglOf(S.pos);
    if (u.hp < P.lastHp) { engineDamage(S, P.lastHp - u.hp); P.lastHp = u.hp; }
    if (u.dying && !P.down) {
      P.down = true; for (let k = 0; k < 4; k++) { S.eng[k].hp = 0; S.eng[k].fire = true; }
      feed(`${CALL} HIT  -  GOING DOWN`, 'bad'); say(`${CALL} GOING DOWN  -  BAIL OUT!`, 2); while (M.left > 0) jump(true);
    }
    for (const e of S.eng) if (e.fire === true && e.firePulled) e.fire = 'out';
    // controls: autopilot, or you; any real stick input takes it off autopilot
    let c;
    if (hasStick && !P.down) {
      const kbd = ctl.source === 'KEYBOARD';
      const thrMoved = M.lastColl !== undefined && ctl.coll !== undefined && Math.abs(ctl.coll - M.lastColl) > 0.03;   // throttle keys pressed / throttle lever moved
      const rIn = ctl.cx || 0, pIn = ctl.cy || 0, yIn = ctl.pedal || 0;
      // a stick left deflected from the helicopter (force trim) is not input: only a change from it counts
      if (!M.stick0) M.stick0 = { x: rIn, y: pIn, p: yIn };
      for (const [k, v] of [['x', rIn], ['y', pIn], ['p', yIn]]) if (Math.abs(v) < 0.05) M.stick0[k] = 0;
      const stickIn = Math.abs(rIn - M.stick0.x) > 0.15 || Math.abs(pIn - M.stick0.y) > 0.15 || Math.abs(yIn - M.stick0.p) > 0.15 || thrMoved;
      if (M.ap && stickIn && M.t > 0.5) { M.ap = false; M.apJump = false; M.apOffWhy = { cx: rIn, cy: pIn, pedal: yIn, coll: ctl.coll, last: M.lastColl, t: M.t }; say('AUTOPILOT OFF  -  YOU HAVE CONTROL', 1.4); }
      const thr = clamp(ctl.coll ?? S.thr, 0, 1), throttle = [thr, thr, thr, thr];
      if (M.ap) {
        const t = apTarget(); c = S.autopilot(dt, apCmd(t));
        if (kbd) ctx.setThrottle(c.throttle[0]);   // the throttle keys pick up from where the autopilot left it
        M.hold = null;
      } else if (kbd) {
        // keyboard: smoothed partial deflection; hands off, it holds the heading and height you left it at
        const k = 1 - Math.exp(-5 * dt); M.kb.roll += (rIn * 0.75 - M.kb.roll) * k; M.kb.pitch += (pIn * 0.55 - M.kb.pitch) * k;
        const active = Math.abs(rIn) > 0.05 || Math.abs(pIn) > 0.05;
        M.noInput = active ? 0 : M.noInput + dt;
        if (active || M.noInput < 0.25) { c = { roll: M.kb.roll, pitch: M.kb.pitch + 0.0, yaw: yIn + S.beta * 3, throttle }; M.hold = null; S.apState.Iq = S.surf.ele / 0.38; S.apState.I = 0; }
        else {
          if (!M.hold) M.hold = { track: S.track(), alt: S.pos.y };
          const a = S.autopilot(dt, { track: M.hold.track, alt: M.hold.alt, kias: S.kias }); c = { ...a, yaw: a.yaw + yIn, throttle };
        }
      } else c = { roll: rIn, pitch: pIn, yaw: yIn, throttle, trimRate: (held.has('BracketRight') ? 1 : 0) - (held.has('BracketLeft') ? 1 : 0) };
      M.lastColl = M.ap && kbd ? c.throttle[0] : ctl.coll;
    } else if (!P.down) {   // nobody on the stick (everyone out): autopilot home
      const t = apTarget(); c = S.autopilot(dt, apCmd(t));
    } else c = { roll: 0.35 + Math.sin(M.t * 1.3) * 0.2, pitch: -0.25, yaw: 0.3, throttle: [0, 0, 0, 0] };
    M.ctl = c;
    crew(dt);
    jumpmaster();
        S.step(dt, c, M.env);
    // jumps: the green light (you: F or the switch; the crew on autopilot); the jumpmaster sends one a second
    M.jumpCd -= dt;
    if (!P.down && hasStick && M.left > 0) {
      if (fireNow && M.jumpSwitch !== 'green') { M.jumpSwitch = 'green'; M.lightManual = true; }
      if (M.ap && M.apJump && M.light === 'green' && M.jumpSwitch !== 'green') M.jumpSwitch = 'green';
      if (M.ap && M.apJump && M.light === 'red' && M.jumpSwitch === 'off') M.jumpSwitch = 'red';
      if (M.ap && M.apJump && M.light === 'off' && M.jumpSwitch === 'red' && !M.lightManual) M.jumpSwitch = 'off';
      if (M.jumpSwitch === 'green' && M.jumpCd <= 0) jump();
    }
    if (M.left === 0 && !M.egress) { M.egress = true; M.egressT = M.t; M.jumpSwitch = 'off'; }
    updateStatics(); updateTrail();
    // the next men stand in the open doors
    for (let i = 0; i < 2; i++) { M.doorT[i] -= dt; const need = M.left > (i === M.exits % 2 ? 0 : 1); doorMan(i, need && S.door[i] > 0.9 && M.doorT[i] <= 0 && !P.down && (i === 1 || M.bundleOut || M.jm.stage <= DOORS_OPEN)); }
    holdCrew(S);
    // warnings
    if (!P.down && hasStick) {
      if (S.buffet > 0.3) sfx.alarm?.();
      M.pullUp = agl < 50 && S.vel.y < -3;
      if (M.pullUp) sfx.alarm?.();
    }
    // smoke and fire when hit; a burning engine trails smoke; ground
    if (P.down || u.hp < u.hpMax * 0.5) { fx.trail(S.pos.x, S.pos.y, S.pos.z, P.down ? 2 : 1); if (P.down) fx.add.spawn(S.pos.x, S.pos.y, S.pos.z, rnd(-1, 1), rnd(0, 2), rnd(-1, 1), rnd(0.3, 0.6), 2.2, 0.6, 1, rnd(.4, .6), .1, 0.9, -1, 1); }
    for (let k = 0; k < 4; k++) if (S.eng[k].fire === true && Math.random() < dt * 20) { _v.set(C130M.ENG_X[k], C130M.ENG_Y + 0.6, 2.5).applyQuaternion(S.q).add(S.pos); fx.trail(_v.x, _v.y, _v.z, 1); }
    const floor = Math.max(groundY(S.pos.x, S.pos.z), 0);
    if (S.dead || S.pos.y < floor + 1.5) {
      const wet = isWater(S.pos.x, S.pos.z);
      fx.explode(S.pos.x, floor, S.pos.z, 5, { fire: wet ? 0 : 80, oil: wet, debris: 24, color: 0xa9adb0, crater: wet ? 0 : 5 }); sfx.boom(1.4);
      if (M.left > 0) { feed(`${CALL} CRASHED  -  ${M.left} OF THE TEAM LOST`, 'bad'); say(`${CALL} CRASHED`, 2.5); M.lost += M.left; M.left = 0; }
      P.gone = true; scene.remove(P.mesh); u.gone = true; snd.stop();
    }
    if (M.egress && !P.gone && (M.t > M.egressT + 80 || (Math.hypot(S.pos.x, S.pos.z) > 1100 && M.t > M.egressT + 20))) { P.gone = true; scene.remove(P.mesh); u.gone = true; snd.stop(); }
    // the mesh and its moving parts
    P.mesh.position.copy(S.pos); P.mesh.quaternion.copy(S.q);
    P.parts.animate({ eng: S.eng, flap: S.flap, gear: S.gear, ramp: S.ramp, door: S.door, ele: S.surf.ele, ail: S.surf.ail, rud: S.surf.rud, steer: S.steer, wow: S.wow, jumpLight: M.jumpSwitch }, dt, M.t, deckView());
  }

  // what the navigator's computer says: red inside a minute of the drop zone, green at the release point within limits
  function jumpLight() {
    if (!M || M.left === 0 || M.plane.gone) return 'off';
    const S = M.plane.sim; predict(_w); let miss = Math.hypot(_w.x - M.target.x, _w.z - M.target.z);
    // on the run: the stick goes when the predicted landing point comes abeam the helicopter (a little early for a stick
    // of three at a second's spacing) and no more than 90 m to the side (they can steer that out under canopy)
    if (M.run && !M.run.setup) { const ax = _w.x - M.target.x, az = _w.z - M.target.z, al = ax * fwdX(M.run.h) + az * fwdZ(M.run.h), lat = ax * Math.cos(M.run.h) - az * Math.sin(M.run.h); if (al > (M.bundleOut ? -30 : 0) && al < 20 && Math.abs(lat) < 90) miss = 0; else if (!M.bundleOut) miss = 99; }   // the bundle goes first: no early green for it
    const onRun = !M.run || (!M.run.setup && Math.abs(angDiff(S.track(), M.run.h)) < 0.5);
    if (miss < 35 && onRun && aglOf(S.pos) > JUMP_MIN_AGL && S.kias < JUMP_MAX_KIAS) return 'green';
    if (!M.run) return 'off';
    const { s, c } = runGeom();
    // red once established on the run (on the line, wings level): the one-minute warning
    if (M.light === 'red') return !M.run.setup && s > -1100 && s < 200 && Math.abs(c) < 200 ? 'red' : 'off';
    return !M.run.setup && s > -1000 && s < 200 && Math.abs(c) < 60 && Math.abs(angDiff(S.track(), M.run.h)) < 0.2 && Math.abs(S.bank) < 0.12 ? 'red' : 'off';
  }

  function cautions(S) {
    return { gear: S.gear > 0.01 && S.gear < 0.99, flapOs: S.kias > C130.V_FLAP(S.flap) + 2 && S.flap > 0.05, ramp: S.ramp > 0.02, door: S.door[0] > 0.02 || S.door[1] > 0.02,
      otq: S.eng.some(e => e.torque > 19600), tit: S.eng.some(e => e.tit > 1083), nts: S.eng.some(e => e.nts), eng: S.eng.some(e => !e.run), fuel: S.fuel < 1800, stall: S.buffet > 0.3, af: S.autoFeatherArm,
      doorOs: (S.ramp > 0.02 && S.kias > C130.V_RAMP) || ((S.door[0] > 0.02 || S.door[1] > 0.02) && S.kias > C130.V_DOORS) };
  }

  function update(dt, ctl, heli) {
    if (!M) return;
    M.t += dt; M.jumpHandsT = (M.jumpHandsT ?? 9) + dt;
    if (heli.landed) M.target.set(heli.pos.x, groundY(heli.pos.x, heli.pos.z), heli.pos.z);
    const fireNow = !!ctl.fire, flying = planeHasStick();   // the stick goes to the aeroplane until everyone is out
    if (flying && !M.hadStick) { M.hadStick = true; ctx.takeStick(); }
    if (!flying && M.hadStick) { M.hadStick = false; ctx.releaseStick(); }
    if (!flying) deck.group.visible = false;
    M.light = jumpLight();
    const lead = leadJumper();
    if (!M.plane.gone) updatePlane(dt, ctl, flying && fireNow, flying);
    for (const j of M.jumpers) updateJumper(j, dt, ctl.cx || 0, Math.max(0, ctl.cy || 0), !flying && j === lead);
    // green smoke at the helicopter: shows the drop zone and which way the wind blows
    if (!M.fixed && (M.smokeT -= dt) <= 0) { M.smokeT = 0.12; fx.mix.spawn(M.target.x + 2, M.target.y + 0.6, M.target.z, M.wind.x * 0.5, rnd(1.5, 3), M.wind.y * 0.5, rnd(4, 7), 0.8, 7, .3, .85, .35, 0.55, -0.15, 0.25, 0); }
    // repairs: man-seconds of work from whoever made it
    const working = M.jumpers.filter(j => j.state === 'work').length;
    updateBundle(dt);
    if (working && !M.fixed) { M.work += working * dt * (M.bundleOK ? 1.5 : 1); if (M.work >= WORK) { M.fixed = true; ctx.onRepaired(); } }
    // markers, instruments, sound
    tRing.visible = !M.fixed; pRing.visible = M.left > 0 && !M.plane.gone && !M.plane.down;
    if (tRing.visible) { tRing.position.set(M.target.x, M.target.y + 0.4, M.target.z); tRing.scale.setScalar(1 + 0.08 * Math.sin(M.t * 5)); }
    if (pRing.visible) { predict(_w); pRing.position.set(_w.x, _w.y + 0.4, _w.z); }
    const S = M.plane.sim;
    if (!M.plane.gone) {
      if (deck.group.visible) {
        const C = cautions(S); if (!Object.values(C).some(Boolean)) M.mcReset = false;
        deck.update(S, { ap: M.ap, jumpLight: M.jumpSwitch, jumpSwitch: M.jumpSwitch, dz: { brg: Math.atan2(-(M.target.x - S.pos.x), -(M.target.z - S.pos.z)), dist: Math.hypot(M.target.x - S.pos.x, M.target.z - S.pos.z) },
          agl: aglOf(S.pos) - 2.6, cautions: C, mcReset: M.mcReset, time: M.t, ctl: M.ctl, checklist: checklist(S) }, dt, hover);
      }
      if (camRef) {
        const d = camRef.position.distanceTo(S.pos), vr = d > 1 ? _v.subVectors(camRef.position, S.pos).dot(S.vel) / d : 0;
        // outside: each engine panned by where it is across the camera's view
        const pans = deckView() ? null : C130M.ENG_X.map(x => { _w.set(x, C130M.ENG_Y, C130M.PROP_Z).applyQuaternion(S.q).add(S.pos).sub(camRef.position); _r.set(1, 0, 0).applyQuaternion(camRef.quaternion); return clamp(_w.dot(_r) / Math.max(5, _w.length()), -1, 1); });
        snd.update({ eng: S.eng, tas: S.tas, inside: deckView(), dist: d, vr, pans });
      }
    }
    // finished? everyone is down (or lost) and nobody is still running
    const settled = M.left === 0 && M.jumpers.every(j => j.state !== 'ff' && j.state !== 'canopy' && j.state !== 'run');
    if (!M.done && settled && (M.fixed || working === 0)) {
      M.done = true; M.doneT = M.t;
      if (!M.fixed) { if (M.arrived === 0) { say('DROP FAILED  -  NOBODY REACHED THE HELICOPTER  -  CALL LOGISTICS AGAIN (L)', 3.5); ctx.onFail(); } else { M.fixed = true; ctx.onRepaired(); } }
    }
    if (M.done && !M.ended) { M.ended = true; ctx.onEnd(); }
    // the crew hangs about until the helicopter leaves (they get picked up later)
    if (M.ended && M.plane.gone && (heli.pos.distanceTo(M.target) > 80 || M.t - M.doneT > 120)) cleanup();
  }
  function planeHasStick() { return !!M && M.left > 0 && !M.plane.gone && !M.plane.u.dying; }
  function leadJumper() { return M && M.jumpers.find(j => j.state === 'ff' || j.state === 'canopy') || null; }
  function deckView() { return planeHasStick() && M.view === 'cockpit'; }

  // camera: on the flight deck (or behind the aeroplane), then riding with the lead canopy
  function camera(cam, dt) {
    camRef = cam;
    const k = 1 - Math.exp(-4 * dt), L = leadJumper(), S = M.plane.sim;
    const dv = deckView();
    deck.group.visible = dv;
    if (dv) {
      M.plane.mesh.updateMatrixWorld();
      cam.position.copy(DECK_EYE).applyMatrix4(M.plane.mesh.matrixWorld);
      cam.quaternion.copy(S.q).multiply(_q.setFromEuler(_e.set(DECK_EYE_PITCH + (ctx.head?.pitch || 0), ctx.head?.yaw || 0, 0, 'YXZ')));
      if (S.buffet > 0.05) { cam.position.y += (Math.random() - 0.5) * 0.03 * S.buffet; cam.rotateZ((Math.random() - 0.5) * 0.01 * S.buffet); }
      M.cam.copy(cam.position); M.look.copy(cam.position).add(S.forward(_v).multiplyScalar(50));
      // switch under the cursor / crosshair
      hover = null; cam.updateMatrixWorld();
      ray.setFromCamera(document.pointerLockElement ? c0 : mouseNdc, cam);
      const h = ray.intersectObjects(deck.hitBoxes, false)[0]; if (h && h.distance < 2.2) hover = h.object.userData.sw;
      return;
    }
    hover = null;
    if (api.camLocal) {   // test hook (scenes): camera at a point in the aeroplane's frame, looking at another
      M.plane.mesh.updateMatrixWorld(); const [p, l] = api.camLocal;
      cam.position.set(...p).applyMatrix4(M.plane.mesh.matrixWorld); cam.up.set(0, 1, 0); cam.lookAt(_w.set(...l).applyMatrix4(M.plane.mesh.matrixWorld)); return;
    }
    if (L && !planeHasStick()) {
      const h = L.state === 'ff' ? S.heading : L.h;
      _v.set(L.p.x - fwdX(h) * 20, L.p.y + 9, L.p.z - fwdZ(h) * 20);   // far enough back to see the canopy over him
      _w.set(L.p.x + fwdX(h) * 12, L.p.y + 1, L.p.z + fwdZ(h) * 12).lerp(M.target, 0.15);
    } else {
      const f = S.forward(_w).clone(); f.y = 0; f.normalize();
      _v.set(S.pos.x - f.x * 58, S.pos.y + 16, S.pos.z - f.z * 58);
      _w.set(S.pos.x + f.x * 50, S.pos.y - 22, S.pos.z + f.z * 50);
    }
    M.cam.lerp(_v, k); M.look.lerp(_w, k);
    M.cam.y = Math.max(M.cam.y, groundY(M.cam.x, M.cam.z) + 2);
    cam.position.copy(M.cam); cam.lookAt(M.look);
  }

  const api = {
    start, update, camera, cancel: cleanup, camLocal: null,
    get active() { return !!M; },
    get camActive() { return !!M && (planeHasStick() || !!leadJumper()); },
    get controlling() { return this.camActive; },
    get flying() { return planeHasStick(); },
    get cockpitView() { return deckView(); },
    get state() { return M; },
    get hover() { return hover; },
    deck, clickSwitch: (id, alt) => M && clickSwitch(id, alt),
    engineLevel() { return 0; },   // the Hercules has its own sound (c130audio.js); this keeps main.js's generic engine quiet
    toggleAP() { if (!planeHasStick()) return; M.ap = !M.ap; if (M.ap) { M.apJump = true; const a = M.plane.sim.apState; a.I = 0; a.It = 0; a.Ir = 0; } say(M.ap ? 'AUTOPILOT ON  -  THE CREW FLIES THE RUN AND CALLS THE GREEN LIGHT' : 'AUTOPILOT OFF  -  YOU HAVE CONTROL', 1.6); },
    toggleView() { if (!M) return; M.view = M.view === 'cockpit' ? 'chase' : 'cockpit'; say(M.view === 'cockpit' ? 'FLIGHT DECK' : 'CHASE VIEW', 1); },
    status() {
      if (!M) return '';
      if (hover && deckView()) return `${deck.labelOf(hover, M.plane.sim, { ap: M.ap, jumpLight: M.jumpSwitch })}  -  CLICK`;
      if (M.fixed) return 'REPAIRED  -  THE CREW WAITS FOR PICK-UP';
      const run = M.jumpers.filter(j => j.state === 'run').length, work = M.jumpers.filter(j => j.state === 'work').length;
      if (work) return `FIELD REPAIR  ${Math.round(100 * M.work / WORK)}%  -  ${work} AT WORK${run ? `, ${run} ON THE WAY` : ''}`;
      if (run) return `REPAIR CREW ON THE WAY  -  ${run} RUNNING`;
      const L = leadJumper();
      if (L && !planeHasStick()) { const d = Math.hypot(L.p.x - M.target.x, L.p.z - M.target.z); return `MC1-1  ·  ${Math.round((L.p.y - groundY(L.p.x, L.p.z)) * 3.28)} FT  ·  ${Math.round(d)} m TO THE HELICOPTER  ·  A/D TURN  ·  S RISER SLIP  ·  HANDS OFF: HE STEERS`; }
      if (!planeHasStick()) return `${CALL} OUTBOUND`;
      const S = M.plane.sim; predict(_w);
      const light = M.jumpSwitch === 'green' ? 'GREEN LIGHT' : M.light === 'green' ? 'AT THE RELEASE POINT - F GREEN LIGHT' : M.light === 'red' || M.jumpSwitch === 'red' ? 'RED LIGHT - STAND BY' : `${M.left} TO JUMP`;
      return `${CALL}  ·  DZ ${Math.round(Math.hypot(M.target.x - S.pos.x, M.target.z - S.pos.z))} m  ·  ${Math.round(S.kias)} KIAS  ·  ${Math.round(aglOf(S.pos) * 3.28)} FT AGL  ·  FLAPS ${Math.round(S.flap * 100)}  ·  MISS ${Math.round(Math.hypot(_w.x - M.target.x, _w.z - M.target.z))} m  ·  ${M.ap ? 'AP ON' : 'AP OFF'} (H)  ·  ${light}`;
    },
  };
  return api;
}
