import * as THREE from 'three';
import { buildLevel } from './level.js';
import { buildCaveMesh, makeTurret, makeTank, makePod, makeRope } from './cave3d.js';
import { Sfx } from './audio.js';
import { createDamage, PARTS } from './damage.js';
import { HELI, EYE, buildHeliMesh, buildCockpit, createHeliSim, createHeliInput, createHeliSystems, fuelBurnPct } from './heli.js';
import { BOUND, ISLANDS, islandH, createNav, SEA_FLOOR, inZone } from './world.js';
import { createWar, COST } from './war.js';
import { CARRIER } from './ships.js';
import { createFog, FOG_GLSL, fogPatch } from './fog.js';
import { createFx } from './fx.js';
import { createControls } from './hotas.js';
import { createJetPlay } from './jetplay.js';
import { createDrop } from './drop.js';
import { createHelm } from './helm.js';
// FOUNDATION: crafts (the registry), the ground host, the soldier on foot, ground vehicles, the HORNET's adapter
import { createCraftHost } from './craft.js';
import { createGround } from './ground.js';
import { createFootCraft } from './foot.js';
import { createMarine } from './marine.js';   // wave 2 (ngc/foot2): the 1980 Marine on foot
import { createDispenser, createRwrCue, RWR } from './units/defence/cm.js';   // ngc/cmpolish: flares / chaff, radar warning
import { createVehicleCraft } from './vehicle.js';
import { createJetCraft } from './craftjet.js';
import { createTomcatCraft } from './crafttomcat.js';   // TOMCAT: the flyable F-14A (crafttomcat.js, units/air/tomcatplay.js)
const isJet = () => G.craft === 'jet' || G.craft === 'tomcat';   // TOMCAT: the fixed-wing crafts share the HORNET's hooks below
// COMMANDER: the player commands the task force - the fleet ledger (lives -> unit counts), the command board (\),
// the Huey's AI crew and the jets' wingman who fly a unit the commander leaves
import { createFleet } from './units/commander/fleet.js';
import { createCommander } from './units/commander/board.js';
import { createHeliAI } from './units/commander/heliai.js';
import { createWingman, wingmanEnv } from './units/commander/wingman.js';
import { createMotorPool } from './units/wheeled/motorpool.js';   // ngc/wheeledgame: the M151A2, M35A2 and 1980 civilian cars (replace the TEST CAR)
import { createSeaUniforms, updateSeaUniforms, SEA_VS_DECL, SEA_VS, SEA_FS_DECL, SEA_FS_NORMAL, SEA_FS_FOAM, SEA_FS_WATER, SEA_FS_UNDER } from './units/naval/seasurface.js';   // SEAWORLD: the sea surface
import { createSeaLife } from './units/naval/sealife.js';   // SEALIFE (ngc/waterfish): fish, the sea bed, the view under water
import { createWorldSolid } from './world/solid.js';   // SEAWORLD: buildings as colliders, piers and bridges as floors
import { createInteriors } from './interiors/interiors.js';   // ngc/interiors: enterable buildings, doors / hatches, the ALBATROSS inside
import { createSeats } from './interiors/seats.js';           // ngc/interiors: passenger seats in the Huey / CH-46, the people in the seats
import { DOORS } from './interiors/doors.js';
import { createWorldLife } from './world/life.js'; import { clearedAt, roadBed } from './world/net.js';   // WORLD: the lived-in world (towns, roads, traffic, people, faction structures)
// ARMOUR (wave 2): the M60A3 TTS and M113A2 as crafts on the island world, their sights, the LCM-8 delivery
import { createArmorWorld } from './units/armor/armorworld.js';
import { createArmorCraft } from './units/armor/armorcraft.js';
import { createSight } from './units/armor/armorsight.js';
import { createArmorDelivery } from './units/armor/armordelivery.js';
import { createCollisionWorld } from './collision.js';   // COLLISION (wave 3)
import { groundContact, contactDamage } from './aircontact.js';
import { UH1H } from './hueyfm.js';
import { setSquadWorld } from './units/air/rotary/squad.js';   // COLLISION: the transports' troops are people in the world
import { setPeopleWorld } from './world/ambient.js';   // COLLISION: so are the villagers
// TERRAIN (wave 3): the islands' real ground - geology, beaches, cliffs, dunes, valleys - and the one surface API every sim reads
import { zoneSurf, zoneGrid, beaches as terrainBeaches, inGrid, SURFACE, SURF_NAMES, GEOLOGY, geologyOf, ZONE_C, bakeMs as TERRAIN_BAKE_MS } from './world/terrain.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const params = new URLSearchParams(location.search);
const sfx = new Sfx();

// ---------------------------------------------------------------- input
const keys = new Set();
// flight controls: HOTAS, rudder pedals and gamepads with per-device bindings (hotas.js); J in the jet opens the panel
const CTL = createControls({ say: (t, s) => say(t, s) });
let chaseCam = params.has('chase'), cockpitCam = params.has('cockpit'), bigMap = false;
const _cf = { x: 0, z: -1 };
let keyboardOnly = params.has('kb');
const FIRE_KEYS = ['KeyF', 'KeyX'];
addEventListener('keydown', e => {
  if ((e.ctrlKey && !e.code.startsWith('Control')) || e.altKey || e.metaKey) return;   // Ctrl alone is collective-down
  // COMMANDER: the command board has the keyboard while it is open (the unit you are in gets nothing; the war goes on)
  if (commander.isOpen && G.state === 'play' && !CTL.isOpen) { if (e.repeat || commander.key(e)) { e.preventDefault(); sfx.init(); return; } }
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  sfx.init();
  if (e.repeat) return;
  if (CTL.isOpen) return;   // the controls panel has the keyboard
  if (G.state === 'paused') { menuKey(e); return; }
  if (e.code === 'Escape' && G.state === 'play') { openMenu(); return; }
  // FOUNDATION key routing: Y gets in / out, [ ] change seat, then the craft you are in has first pick of every key
  // (jetplay.js, foot.js, vehicle.js ...); what it leaves falls through to the helicopter and the global keys below.
  if (G.state === 'play' && commandKey(e.code)) return;   // COMMANDER: \ the command board, / the next unit out
  if (G.state === 'play' && G.mode === 'zarch') {
    if (motorKey(e.code)) return;   // ngc/wheeledgame: 7 then 1 / 2 picks the motor pool's delivery
    if (e.code === 'KeyY') { getInOut(); return; }
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') { crafts.cycleSeat(e.code === 'BracketRight' ? 1 : -1); return; }
    if (e.code === 'KeyU' && G.craft !== 'heli' && G.craft !== 'jet' && liftConsole()) return;   // SEAWORLD: run a deck-edge lift (before the craft: foot / vehicles swallow U)
    if (G.craft !== 'heli' && crafts.active && crafts.active.key(e.code, e)) return;
  }
  if (G.craft === 'heli') {   // the Huey's switches (heli.js / damage.js)
    if (e.code === 'KeyH') { if (drop.flying) drop.toggleAP(); else doSwitch('sas'); }
    const sw = { KeyI: 'engine', KeyO: 'fire', KeyU: 'hyd', KeyL: 'radio', KeyN: 'light' }[e.code];
    if (sw) doSwitch(sw);
    const cmk = HUEY_CM_KEYS[e.code]; if (cmk && G.mode === 'zarch' && Z.alive && !drop.controlling && !helm.active) cmH.press(cmk);   // CM: M130 flares / chaff
  }
  if (e.code === 'KeyJ') HI.startCalibration();   // the controls panel: bind and calibrate HOTAS / pedals (hotas.js)
  if (e.code === 'KeyT' && (G.craft === 'heli' || isJet())) toggleFreeLook();
  if (e.code === 'KeyM') { bigMap = !bigMap; setMapSize(); if (bigMap && document.pointerLockElement) document.exitPointerLock(); }
  if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'].includes(e.code)) command(+e.code.slice(5));   // TOMCAT: 8; ARMOUR: 9 M60A3, 0 M113A2
  if (e.code === 'Tab') { e.preventDefault(); toggleHelm(); }
  if (G.craft !== 'heli' && !isJet()) { /* foot / vehicles: V and C belong to the craft (above) */ }
  else if (e.code === 'KeyV' && drop.flying) drop.toggleView();
  else if (e.code === 'KeyV' && helm.active) helm.toggleView();
  else if (e.code === 'KeyV') { cockpitCam = !cockpitCam; if (!cockpitCam && document.pointerLockElement) document.exitPointerLock(); say(cockpitCam ? 'COCKPIT VIEW' : (chaseCam ? 'CHASE CAMERA' : 'FIXED CAMERA'), 1.2); }
  if (e.code === 'KeyC' && G.craft === 'heli') { cockpitCam = false;  chaseCam = !chaseCam; Z.hd = Math.atan2(Z.facing.x, -Z.facing.y); say(chaseCam ? 'CHASE CAMERA' : 'FIXED CAMERA', 1.2); }
  if (e.code === 'KeyK') { keyboardOnly = !keyboardOnly; say(keyboardOnly ? 'KEYBOARD ONLY' : 'CONTROLLER ENABLED', 1.5); }
  if (e.code === 'KeyP' && G.state === 'play') openMenu();
  if (['Enter', 'Space'].includes(e.code)) pressStart();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
let mouseFire = false;
addEventListener('mousedown', e => { if (e.button === 0) { mouseFire = true; sfx.init(); } });
addEventListener('mouseup', () => mouseFire = false);
const kd = (...c) => c.some(k => keys.has(k));
const THR_AXIS = params.has('throttle') ? +params.get('throttle') : -1;
const dz = v => Math.abs(v) < 0.12 ? 0 : Math.sign(v) * (Math.abs(v) - 0.12) / 0.88;
let padWasStart = false;

// On foot only a standard game controller drives the soldier: the HOTAS stick, throttle and rudder pedals are flight
// controls and never move, aim or fire the infantryman (they stay bound for the aircraft and vehicles).
function readGamepad() {
  if (keyboardOnly) return null;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [], devs = (CTL.state && CTL.state.devices) || [];
  for (const p of pads) {
    if (!p || !p.connected || p.mapping !== 'standard') continue;
    if (/044f|thrustmaster|t\.?flight|hotas|throttle|rudder|pedal|joystick/i.test(p.id)) continue;
    if (devs.some(d => d.index === p.index && d.role && d.role !== 'gamepad')) continue;
    return p;
  }
  return null;
}
function readPad() {
  if (keyboardOnly) return null;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const d = CTL.state && CTL.state.devices && CTL.state.devices.find(d => d.role === 'stick' || d.role === 'gamepad');
  if (d && pads[d.index] && pads[d.index].connected) return pads[d.index];
  let best = null;   // never the rudder pedals: with pedals plugged in they may come first
  for (const p of pads) if (p && p.connected && !/b679|rudder|pedal/i.test(p.id)) { best = p; if (p.axes.length >= 2) break; }
  return best;
}
function readInput() {
  const kx = (kd('ArrowRight', 'KeyD') ? 1 : 0) - (kd('ArrowLeft', 'KeyA') ? 1 : 0);
  const ky = (kd('ArrowDown', 'KeyS') ? 1 : 0) - (kd('ArrowUp', 'KeyW') ? 1 : 0);
  const inp = {
    x: kx, y: ky,
    thrK: kd('Space', 'ShiftLeft', 'ShiftRight') ? 1 : 0,
    thrUp: kd('ArrowUp', 'KeyW') ? 1 : 0,       // extra thrust keys in Thrust mode
    beam: kd('ArrowDown', 'KeyS') ? 1 : 0,
    fire: kd(...FIRE_KEYS) || mouseFire,
    start: false,
  };
  const p = G.craft === 'heli' ? readPad() : null;   // the jet reads its HOTAS through CTL; foot / vehicles read input.pad
  if (p) {
    const gx = dz(p.axes[0] || 0), gy = dz(p.axes[1] || 0);
    if (gx !== 0) inp.x = gx;
    if (gy !== 0) inp.y = gy;
    const b = i => p.buttons[i] && p.buttons[i].pressed;
    if (b(0) || b(5)) inp.fire = true;
    if (b(1) || b(2) || b(7)) inp.thrK = 1;
    if (b(3) || b(4) || b(6)) inp.beam = 1;
    if (THR_AXIS >= 0 && p.axes[THR_AXIS] !== undefined) inp.thrK = Math.max(inp.thrK, clamp((1 - p.axes[THR_AXIS]) / 2, 0, 1));
    inp.start = p.buttons.some(x => x && x.pressed);
  }
  return inp;
}

// ---------------------------------------------------------------- renderer
const canvas = $('gl');
// cockpit switches: what the crosshair / cursor is over, and click to operate it
const switchRay = new THREE.Raycaster(), mouseNdc = new THREE.Vector2();
let switchHover = null;
let mouseAimT = -1e9;
addEventListener('mousemove', e => { mouseNdc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); mouseAimT = performance.now(); });
function pickSwitch() {
  const ck = G.craft === 'jet' ? JP.cockpit : G.craft === 'tomcat' ? tomcatC.cockpitObj() : G.craft === 'heli' ? cockpit : armCk() || (crafts.active && crafts.active.switches ? crafts.active.switches() : null);   // ARMOUR crew stations; ngc/wheeledgame: a craft's own switches
  if (!ck || !ck.group.visible) return null;
  switchRay.setFromCamera(document.pointerLockElement === canvas ? _ndc0 : mouseNdc, zCam);
  const hit = switchRay.intersectObjects(ck.hitBoxes, false)[0];
  return hit && hit.distance < 2.5 ? hit.object.userData.sw : null;
}
const _ndc0 = new THREE.Vector2(0, 0);
addEventListener('mousedown', e => {
  if (e.button !== 0 || G.state !== 'play') return;
  const id = pickSwitch(); if (!id) return;
  e.stopImmediatePropagation(); e.preventDefault(); if (G.craft === 'jet') JP.click(id); else if (G.craft === 'tomcat') tomcatC.click(id); else if (armCk()) crafts.active.click(id); else if (G.craft !== 'heli' && crafts.active && crafts.active.click) crafts.active.click(id); else doSwitch(id);
}, { capture: true });
function armCk() { const a = crafts.active; return a && (a === m60C || a === m113C) && G.state === 'play' ? a.cockpitObj() : null; }   // ARMOUR: clickable crew stations (armorstations.js)
// cockpit free look: click the view to capture the mouse (Esc releases it and the head re-centres; middle click centres)
const head = { yaw: 0, pitch: 0 };
let freeLook = true;   // T toggles: off releases the mouse and locks the view to the centre (the cursor then works the switches)
function toggleFreeLook() {
  freeLook = !freeLook;
  if (freeLook) { if (cockpitCam && G.state === 'play') canvas.requestPointerLock?.(); say('FREE LOOK ON  -  MOUSE TO LOOK', 1.4); }
  else { if (document.pointerLockElement) document.exitPointerLock(); say('FREE LOOK OFF  -  VIEW LOCKED TO CENTRE', 1.4); }
}
// on foot and in ground vehicles the mouse always looks (the craft's look()); in the aircraft it moves the head
const craftLooks = () => G.craft !== 'heli' && !isJet() && crafts.active && G.mode === 'zarch';
canvas.addEventListener('click', () => { if ((((cockpitCam || helm.bridgeView || drop.cockpitView) && freeLook) || craftLooks()) && G.state === 'play' && !document.pointerLockElement) canvas.requestPointerLock?.(); });
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== canvas) return;
  if (craftLooks()) { if (G.state === 'play') crafts.active.look(e.movementX, e.movementY); return; }
  if (!freeLook) return;
  head.yaw = clamp(head.yaw - e.movementX * 0.0025, -2.5, 2.5); head.pitch = clamp(head.pitch - e.movementY * 0.0025, -1.1, 0.8);
});
addEventListener('mousedown', e => { if (e.button === 1 && document.pointerLockElement === canvas) { head.yaw = head.pitch = 0; e.preventDefault(); } });
addEventListener('wheel', e => { if (G.craft === 'jet' && cockpitCam) JP.zoom = clamp(JP.zoom + (e.deltaY < 0 ? 0.25 : -0.25), 0, 1); else if (G.craft === 'tomcat' && cockpitCam) tomcatC.zoom(e.deltaY < 0 ? 0.25 : -0.25); }, { passive: true });
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const PR_MAX = params.has('res') ? +params.get('res') : Math.min(devicePixelRatio, 1.5);
let pixRatio = PR_MAX; renderer.setPixelRatio(pixRatio);
{
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  $('gpuinfo').textContent = 'GPU: ' + (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown');
}
const dotTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

class Cloud {
  constructor(scene, max, size, atten) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.obj = new THREE.Points(g, new THREE.PointsMaterial({
      size, sizeAttenuation: atten, map: dotTex, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.obj.frustumCulled = false; scene.add(this.obj);
  }
  begin() { this.n = 0; }
  add(x, y, z, r, g, b) {
    if (this.n >= this.max) return; const i = this.n++ * 3;
    this.pos[i] = x; this.pos[i + 1] = y; this.pos[i + 2] = z; this.col[i] = r; this.col[i + 1] = g; this.col[i + 2] = b;
  }
  end() { this.geo.setDrawRange(0, this.n); this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; }
}
function emit(arr, x, y, z, vx, vy, vz, life, r, g, b, grav = 0) {
  const p = { x, y, z, vx, vy, vz, life, max: life, r, g, b, grav };
  if (arr.length >= 1500) arr[(Math.random() * arr.length) | 0] = p; else arr.push(p);
}
function stepParts(arr, dt) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i]; p.life -= dt;
    if (p.life <= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); continue; }
    p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  }
}
function drawParts(arr, cloud) {
  for (const p of arr) { const f = p.life / p.max; cloud.add(p.x, p.y, p.z, p.r * f, p.g * f, p.b * f); }
}
function explode(arr, x, y, z, n, sp, is2d) {
  for (let i = 0; i < n; i++) {
    const a = rnd(Math.PI * 2), e = is2d ? 0 : rnd(-1, 1), s = rnd(0.2, 1) * sp;
    const c = Math.cos(a), sn = Math.sin(a), h = Math.sqrt(1 - e * e);
    const hot = Math.random();
    emit(arr, x, y, z, c * h * s, is2d ? sn * s : e * s, is2d ? 0 : sn * h * s, rnd(0.5, 1.4), 1, 0.4 + hot * 0.6, hot * 0.4, is2d ? 3 : 9);
  }
}

// ---------------------------------------------------------------- game state
const ROCKETS_MAX = 16, BOMBS_MAX = 6;
const G = { craft: 'heli', heliStowed: false, crewDownT: 0, jetDownT: 0, tomcatDownT: 0, light: false, n2: 0, res: 250, mat: 90, rockets: ROCKETS_MAX, bombs: BOMBS_MAX, cargo: 0, state: 'title', mode: 'zarch', score: 0, hi: 0, fuel: 100, visit: 0, tr: null, msgT: 0, over: false };
// COMMANDER: the fleet (units/commander/fleet.js) - reserves of every unit type. The old counters stay as views of it:
// G.lives = Hueys in reserve (it was the spare helicopters), G.jets / G.tomcats = jets in the hangar.
const fleet = createFleet();
for (const [k, id] of [['lives', 'heli'], ['jets', 'jet'], ['tomcats', 'tomcat']]) Object.defineProperty(G, k, { get: () => fleet.n[id], set: v => { fleet.n[id] = v; }, enumerable: true });
try { G.hi = +(localStorage.getItem('tz_hi') || 0); } catch (e) {}
// first-person (cockpit) field of view, vertical degrees: the Huey, the Hornet (its zoom scales from it) and the
// dropship flight deck; set in the pause menu, remembered per browser
const CK_FOV = { min: 40, max: 100, def: 70 };
let ckFov = CK_FOV.def; try { ckFov = clamp(+(localStorage.getItem('tz_ckfov') || CK_FOV.def), CK_FOV.min, CK_FOV.max) || CK_FOV.def; } catch (e) {}
function setCkFov(v) { ckFov = clamp(Math.round(v), CK_FOV.min, CK_FOV.max); try { localStorage.setItem('tz_ckfov', ckFov); } catch (e) {} }
// SEAWORLD: the sea state (pause menu SEA STATE slider, 0-7) and WEATHER DRIFT (the sea wanders round it over a war),
// remembered per browser. A ?sea= in the URL wins (and leaves the drift off unless ?seadrift), so tests are repeatable.
const SEA_PREF = { def: 4, ss: 4, drift: false };
try { const v = localStorage.getItem('tz_sea'); if (v !== null && Number.isFinite(+v)) SEA_PREF.ss = clamp(Math.round(+v), 0, 7); SEA_PREF.drift = localStorage.getItem('tz_seadrift') === '1'; } catch (e) {}
function setSeaPref(v) { SEA_PREF.ss = clamp(Math.round(v), 0, 7); try { localStorage.setItem('tz_sea', SEA_PREF.ss); } catch (e) {} if (war) war.setSea(SEA_PREF.ss); }
function setSeaDrift(on) { SEA_PREF.drift = !!on; try { localStorage.setItem('tz_seadrift', on ? '1' : '0'); } catch (e) {} if (war) war.setSeaDrift(SEA_PREF.drift); }
// the pause menu's sliders: value, range, label, the small print, the step for LEFT / RIGHT
const SLIDERS = {
  fov: { min: CK_FOV.min, max: CK_FOV.max, nudge: 5, get: () => ckFov, set: v => setCkFov(v), show: v => `${v}°`, small: `FIRST-PERSON VIEWS: HUEY, HORNET, DROPSHIP, ON FOOT, VEHICLES  ·  LEFT / RIGHT  ·  DEFAULT ${CK_FOV.def}°` },
  sea: { min: 0, max: 7, nudge: 1, get: () => SEA_PREF.ss, set: v => setSeaPref(v), show: v => `${v}  ${war ? war.sea.name : ''}${SEA_PREF.drift && war ? `  (NOW ${war.sea.ss.toFixed(1)})` : ''}`, small: `SWELL, WHITECAPS AND HOW THE SHIPS PITCH AND ROLL  ·  0 GLASSY ... 7 HIGH  ·  DEFAULT ${4}` },
};
function addScore(n) { G.score += n; if (G.score > G.hi) { G.hi = G.score; try { localStorage.setItem('tz_hi', G.hi); } catch (e) {} } }
let war = null;   // the island war (created once the world exists)
const sayMsg = (t, s) => say(t, s);
function say(t, secs = 2) { const m = $('msg'); m.textContent = t; m.style.opacity = t ? 1 : 0; G.msgT = secs; }

// ================================================================ ZARCH
const PAD_R = 8.5, BASE_R = 18, GRAV = 9.0, THRUST = 21, MAXLEAN = 0.8;
// The world is an archipelago (world.js). Cave islands (home HQ, enemy fortresses, enemy HQ) each have a shaft down
// into their own Thrust cave, which lives underground in the plane z = base.z under the shaft. CS = world units per
// cave cell. Every island has a landing pad: beside the shaft on cave islands, in the middle of the others.
const CS = 1.6, CAVE_SINK = 0.15, CAVE_OX = 32.5, CAVE_DEPTH = 6, HOLE_R = 9, STRIP_X = 76, STRIP_Z = 9;
// tier = how well defended the cave is: 1 light (2 turrets) .. 4 heavy (5 turrets, faster fire); 0 = home
const TIER_NAMES = ['', 'LIGHT', 'MEDIUM', 'STRONG', 'HEAVY'];
const BASES = ISLANDS.filter(I => I.cave).sort((a, b) => a.tier - b.tier).map(I => I.base = { kind: I.owner === 1 ? 'home' : 'enemy', name: I.name, tier: I.tier, x: I.x, z: I.z, h: clamp(Math.round(islandH(I.x, I.z)), 4, 16), isl: I });
const HOME_B = BASES[0], PAD_H = HOME_B.h;
const PADS = ISLANDS.map(I => I.pad = I.cave ? { x: I.x, z: I.z + 30, h: I.base.h, r0: 12, r1: 34, r: PAD_R, isl: I } : { x: I.x, z: I.z, h: clamp(Math.round(islandH(I.x, I.z)), 3, 14), r0: 30, r1: 44, r: PAD_R, isl: I });   // TERRAIN: r1 52 -> 44 (beaches past the apron)
const PAD = HOME_B.isl.pad;   // the home refuel pad
const RES_MAX = 600;          // the fleet's fuel stores
const stripW = (x, z, b) => smooth(0, 14, Math.hypot(Math.max(Math.abs(x - b.x) - STRIP_X, 0), Math.max(Math.abs(z - b.z) - STRIP_Z, 0)));
const terrainH0 = (x, z) => {
  const h0 = islandH(x, z); let h = h0;
  for (const b of BASES) h = lerp(b.h, h, smooth(BASE_R, 60, Math.hypot(x - b.x, z - b.z)));   // flat apron round the shaft
  for (const p of PADS) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r1) h = lerp(p.h, h, smooth(p.r0, p.r1, d)); }   // flat pads
  if (h !== h0) h = roadBed(x, z, h);   // TERRAIN: a road across an apron's blend keeps its bed (the ribbon lies on the ground)
  for (const b of BASES) h = lerp(Math.max(h, b.h), h, stripW(x, z, b));                      // ground over the cave
  return h;
};
// TERRAIN (wave 3): the concrete LANDING HARDS are gone - the islands have real beaches (world/terrain.js). HARDS keeps its
// name (the armour scenes, the LCM-8 delivery and the M60's parking spot read it) and now holds the islands' LANDING
// BEACHES, in the same shape: { I, name, x, z (waterline), fx, fz (inland), yaw, w, u0, u1 (top of the sand), y(u), at(u, lat) }.
const HARDS = terrainBeaches();
const terrainH = terrainH0;
const holeOf = (x, z) => BASES.find(b => Math.hypot(x - b.x, z - b.z) < HOLE_R);
const inHole = (x, z) => !!holeOf(x, z);
const groundY = (x, z) => inHole(x, z) ? -1e4 : Math.max(terrainH(x, z), 0, war ? war.deckY(x, z) : -1e9);   // ship decks count as ground
const isWater = (x, z) => terrainH(x, z) <= 0;
const waterAt = (x, z) => isWater(x, z) && !(war && war.deckY(x, z) > -1e8);
const baseUniform = BASES.map(b => new THREE.Vector4(b.x, b.z, b.h, b.kind === 'enemy' ? 1 : 0));
const SIDE_COL = [new THREE.Color(0.8, 0.8, 0.74), new THREE.Color(0.2, 0.75, 1.0), new THREE.Color(0.95, 0.18, 0.1)];   // neutral, player, enemy
const padUniform = PADS.map(p => SIDE_COL[p.isl.owner].clone());

const zScene = new THREE.Scene();
const HORIZON = new THREE.Color(0xbfd9f2);
// One draw distance for everything (the retro look and the fps lever): terrain grid, fog, far clip and sky dome all
// end together, so nothing - trees, enemies, beacons - hangs in the sky past the edge of the ground.
const DRAW = 250;
// The jet sees further: view.draw grows with altitude while you fly it (fog, far clip, sky and terrain all follow it),
// and a coarse far-terrain ring fills in past the fine grid.
const view = { draw: DRAW };
zScene.fog = new THREE.Fog(HORIZON, DRAW * 0.5, DRAW);
const zCam = new THREE.PerspectiveCamera(62, 1, 0.5, DRAW + 15);
zScene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a5a34, 0.9));
const sun = new THREE.DirectionalLight(0xfff0d0, 1.1); sun.position.set(0.5, 1, 0.3); zScene.add(sun);

const sky = new THREE.Mesh(new THREE.SphereGeometry(DRAW * 0.97, 24, 12), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vP; void main(){vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'varying vec3 vP; void main(){float h=normalize(vP).y; vec3 hz=vec3(.75,.85,.95), zn=vec3(.22,.42,.85); gl_FragColor=vec4(mix(hz,zn,smoothstep(0.,.55,h)),1.);}',
}));
sky.renderOrder = -10; zScene.add(sky);

// The terrain is a grid that follows the camera. Its heights come from a heightmap baked once at load with one texel
// per grid vertex (so the mesh matches terrainH exactly at every vertex), and a second small texture tells each pixel
// which pad / shaft apron (if any) it is near, so the shader only ever shades one of them.
// TERRAIN (wave 3): the heightmap is baked at the islands' own 1.25 m (HMC). The main grid (TG 2.5 m) reads every other
// texel; a FINE grid at 1.25 m follows the camera out to 50 m (FINE_H; only while the camera is under ~70 m above the ground) so near the ground you see (and stand on) the same
// relief the physics has: rocks, dune hummocks, the berm. A third texture holds the surface types (sand, rock, mud, dirt
// weights; grass the rest), linearly filtered so the materials blend.
const TG = 2.5, HMC = ZONE_C, TN = Math.ceil(DRAW * 2.1 / TG), HM_N = Math.round(2 * BOUND / HMC) + 1, DEC_C = 4, DEC_N = Math.ceil(2 * BOUND / DEC_C);
const FINE_H = 50, FINE_N = Math.round(2 * FINE_H / HMC);
const PROF_LOAD = {};
const hmTex = (() => {
  zoneGrid(); PROF_LOAD.terrainBake = Math.round(TERRAIN_BAKE_MS());   // (the islands were baked on the first height query above)
  const t1 = performance.now(), a = new Float32Array(HM_N * HM_N);
  for (let j = 0; j < HM_N; j++) for (let i = 0; i < HM_N; i++) a[j * HM_N + i] = terrainH(-BOUND + i * HMC, -BOUND + j * HMC);
  PROF_LOAD.hmBake = Math.round(performance.now() - t1);
  const t = new THREE.DataTexture(a, HM_N, HM_N, THREE.RedFormat, THREE.FloatType); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
const SURF_W = { grass: [0, 0, 0, 0], sand: [255, 0, 0, 0], wetsand: [255, 0, 0, 0], rock: [0, 255, 0, 0], mud: [0, 0, 255, 0], dirt: [0, 0, 0, 255], shingle: [0, 150, 0, 105], marsh: [0, 0, 150, 0] };
const surfTex = (() => {   // r sand, g rock, b mud, a dirt (grass = the rest), per heightmap texel
  const Z = zoneGrid(), off = Math.round((Z.E - BOUND) / Z.C), a = new Uint8Array(HM_N * HM_N * 4), W = SURF_NAMES.map(n => SURF_W[n]);
  for (let j = 0; j < HM_N; j++) for (let i = 0; i < HM_N; i++) { const w = W[Z.s[(j + off) * Z.N + i + off]], k = (j * HM_N + i) * 4; a[k] = w[0]; a[k + 1] = w[1]; a[k + 2] = w[2]; a[k + 3] = w[3]; }
  const t = new THREE.DataTexture(a, HM_N, HM_N, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
})();
const GEO_IDX = ISLANDS.map(I => geologyOf(I));
const decorTex = (() => {   // r = nearest pad index + 1, g = nearest shaft index + 1 (0 = none near)
  const a = new Uint8Array(DEC_N * DEC_N * 4);
  for (let j = 0; j < DEC_N; j++) for (let i = 0; i < DEC_N; i++) {
    const x = -BOUND + (i + 0.5) * DEC_C, z = -BOUND + (j + 0.5) * DEC_C, k = (j * DEC_N + i) * 4;
    PADS.forEach((p, n) => { if (Math.hypot(x - p.x, z - p.z) < 33) a[k] = n + 1; });
    BASES.forEach((b, n) => { if (Math.hypot(x - b.x, z - b.z) < 25) a[k + 1] = n + 1; });
    let bi = -1, bd = 1e9; ISLANDS.forEach((I, n) => { const d = Math.hypot(x - I.x, z - I.z) - I.r; if (d < bd) { bd = d; bi = n; } }); a[k + 2] = bd < 200 ? bi + 1 : 0;   // TERRAIN: b = the island (its geology's colours)
  }
  const t = new THREE.DataTexture(a, DEC_N, DEC_N, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
// Past the control zone the world goes on for ever (world.js: continents, mountain ranges, forests). Inside the zone
// the terrain reads the baked core heightmap above; outside it reads two heightmaps baked around the camera by a
// worker (terrainworker.js) from the same height function the physics uses: 2 km at 4 m and 8 km at 16 m. They are
// re-baked as you travel and swapped in when ready; the near bake also scatters the forest trees.
const HW_N = 512;
const HW = [{ c: 4, recentre: 280, trees: 9000, uni: 'uHMNo' }, { c: 16, recentre: 1000, trees: 0, uni: 'uHMFo' }].map(L => {
  const tex = new THREE.DataTexture(new Float32Array(HW_N * HW_N).fill(SEA_FLOOR), HW_N, HW_N, THREE.RedFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true; return { ...L, tex, cx: 1e9, cz: 1e9, busy: false };
});
const terrainWorker = new Worker(new URL('./terrainworker.js', import.meta.url), { type: 'module' });
terrainWorker.onmessage = ({ data: d }) => {
  const L = HW[d.id]; L.busy = false; L.tex.image.data = d.h; L.tex.needsUpdate = true; terrainUni[L.uni].value.set(d.ox, d.oz, d.c);
  if (d.trees) fillForest(d.trees);
  if (d.id === 1) buildFarMap(d);
};
function terrainStream(x, z) {
  HW.forEach((L, id) => {
    if (L.busy) return;
    const step = L.c * 32, cx = Math.round(x / step) * step, cz = Math.round(z / step) * step;
    if (Math.abs(cx - L.cx) < L.recentre && Math.abs(cz - L.cz) < L.recentre) return;
    L.busy = true; L.cx = cx; L.cz = cz;
    terrainWorker.postMessage({ id, n: HW_N, c: L.c, ox: cx - HW_N / 2 * L.c, oz: cz - HW_N / 2 * L.c, trees: L.trees });
  });
}
// a small colour map of the far window for the minimap and the jet's moving map
const farMap = { cv: document.createElement('canvas'), ox: 0, oz: 0, size: 0, ready: false };
function buildFarMap(d) {
  const N = 256, k = d.n / N, cv = farMap.cv; cv.width = cv.height = N; const x = cv.getContext('2d'), im = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const h = d.h[(j * k | 0) * d.n + (i * k | 0)], o = (j * N + i) * 4;
    const col = h <= 0 ? [lerp(28, 8, clamp(-h / 30, 0, 1)), lerp(92, 34, clamp(-h / 30, 0, 1)), lerp(118, 78, clamp(-h / 30, 0, 1))] : h < 3 ? [176, 164, 112] : h < 160 ? [lerp(48, 70, h / 160), lerp(118, 100, h / 160), lerp(50, 52, h / 160)] : h < 440 ? [lerp(110, 140, (h - 160) / 280), lerp(100, 128, (h - 160) / 280), lerp(80, 110, (h - 160) / 280)] : [230, 234, 240];
    im.data[o] = col[0]; im.data[o + 1] = col[1]; im.data[o + 2] = col[2]; im.data[o + 3] = 255;
  }
  x.putImageData(im, 0, 0); Object.assign(farMap, { ox: d.ox, oz: d.oz, size: d.n * d.c, ready: true });
}
const fog = createFog(BOUND); fog.enabled = false; fog.update([]);
const terrainGeo = new THREE.PlaneGeometry(TG * TN, TG * TN, TN, TN); terrainGeo.rotateX(-Math.PI / 2);
const terrainUni = {
  uFog: { value: HORIZON }, uSun: { value: new THREE.Vector3(.5, 1, .3) }, uBases: { value: baseUniform }, uPadCol: { value: padUniform }, uTime: { value: 0 },
  uPadP: { value: PADS.map(p => new THREE.Vector4(p.x, p.z, p.isl.cave ? 1 : 0, 0)) }, uHM: { value: hmTex }, uDecor: { value: decorTex }, ...fog.uniforms,
  uSurf: { value: surfTex }, uFine: { value: new THREE.Vector3(0, 0, 0) },   // TERRAIN: surface weights; the fine grid's square (x, z, half size)
  uSandC: { value: GEO_IDX.map(g => new THREE.Color(...GEOLOGY[g].sand)) }, uRockC: { value: GEO_IDX.map(g => new THREE.Color(...GEOLOGY[g].rock)) },
  uHMN: { value: HW[0].tex }, uHMF: { value: HW[1].tex }, uHMNo: { value: new THREE.Vector3(-1e6, -1e6, 4) }, uHMFo: { value: new THREE.Vector3(-1e6, -1e6, 16) },
  uFogN: { value: DRAW * 0.5 }, uFogF: { value: DRAW * 0.97 }, uNear: { value: new THREE.Vector3(0, 0, 0) },
  ...createSeaUniforms(),   // SEAWORLD: the live sea's waves, whitecaps, ships for the hull foam
};
const terrainVS = `
    varying vec3 vW; varying float vRaw; uniform sampler2D uHM, uHMN, uHMF; uniform vec3 uHMNo, uHMFo;
    ${SEA_VS_DECL}
    #ifdef FAR
    const float CELL=24.0;   // FAR_C (declared further down)
    #else
    const float CELL=${TG.toFixed(1)};
    #endif
    float bil(sampler2D t, vec2 g){   // bilinear by hand (float textures may not filter); g in texel units
      vec2 i=floor(g), f=g-i; float n=${HW_N.toFixed(1)};
      float a=texture2D(t,(i+.5)/n).r, b=texture2D(t,(i+vec2(1.5,.5))/n).r, c=texture2D(t,(i+vec2(.5,1.5))/n).r, d=texture2D(t,(i+1.5)/n).r;
      return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
    }
    float hOut(vec2 p){   // the 4 m near window where it reaches, else the 16 m far window
      vec2 g=(p-uHMNo.xy)/uHMNo.z;
      if(g.x>1.&&g.y>1.&&g.x<${(HW_N - 2).toFixed(1)}&&g.y<${(HW_N - 2).toFixed(1)}) return bil(uHMN,g);
      return bil(uHMF,(p-uHMFo.xy)/uHMFo.z);
    }
    float hAt(vec2 p){ return max(abs(p.x),abs(p.y))<${BOUND.toFixed(1)} ? texture2D(uHM,((p+${BOUND.toFixed(1)})/${HMC.toFixed(2)}+.5)/${HM_N.toFixed(1)}).r : hOut(p); }
    void main(){
      vec4 w=modelMatrix*vec4(position,1.);
      float h=hAt(w.xz);
      #ifdef FINE
      {   // TERRAIN: the fine grid's edge vertices between two coarse ones take the coarse edge's height (no cracks)
        vec2 lp=position.xz; const float HF=${FINE_H.toFixed(1)};
        bool ex=abs(lp.x)>HF-.01, ez=abs(lp.y)>HF-.01;
        if(ex||ez){ vec2 dir=ex?vec2(0.,1.):vec2(1.,0.); float q=floor((dot(lp,dir)+HF)/${HMC.toFixed(2)}+.5);
          if(mod(q,2.)>.5) h=.5*(hAt(w.xz+dir*${HMC.toFixed(2)})+hAt(w.xz-dir*${HMC.toFixed(2)})); }
      }
      #endif
      vRaw=h; w.y=max(h,0.);
      ${SEA_VS}
      vW=w.xyz;
      gl_Position=projectionMatrix*viewMatrix*w;
    }`;
const terrainFS = `
    varying vec3 vW; varying float vRaw; uniform vec3 uFog; uniform vec3 uSun; uniform vec4 uBases[${BASES.length}]; uniform vec3 uPadCol[${PADS.length}]; uniform vec4 uPadP[${PADS.length}];
    uniform float uTime; uniform sampler2D uDecor, uFogT; uniform float uFogB, uFogN, uFogF; uniform vec3 uNear;
    uniform sampler2D uSurf; uniform vec3 uFine; uniform vec3 uSandC[${ISLANDS.length}], uRockC[${ISLANDS.length}];
    ${FOG_GLSL}
    ${SEA_FS_DECL}
    void main(){
      #ifdef FAR
      if(max(abs(vW.x-uNear.x),abs(vW.z-uNear.y))<uNear.z) discard;   // the fine grid covers this
      #endif
      vec3 dc=texture2D(uDecor,(vW.xz+${BOUND.toFixed(1)})/${(2 * BOUND).toFixed(1)}).rgb*255.;
      int pi=int(dc.r+.5)-1, bi=int(dc.g+.5)-1, gi=int(dc.b+.5)-1;
      if(bi>=0 && length(vW.xz-uBases[bi].xy)<${HOLE_R.toFixed(1)}) discard;   // the shaft
      vec3 n=normalize(cross(dFdx(vW),dFdy(vW))); if(n.y<0.) n=-n;
      float l=max(dot(n,normalize(uSun)),0.)*.75+.4;
      vec2 g=floor(vW.xz/6.); float chk=mod(g.x+g.y,2.);
      float wild=step(${BOUND.toFixed(1)},max(abs(vW.x),abs(vW.z)));
      vec3 c=vec3(0.);
      if(vRaw>0.){   // (land colour only where there is land: the sea below paints its own)
      if(wild<.5){   // TERRAIN: the islands - what the ground is made of (the same table the sims read), in the island's own colours
        vec4 sw=texture2D(uSurf,((vW.xz+${BOUND.toFixed(1)})/${HMC.toFixed(2)}+.5)/${HM_N.toFixed(1)});
        float n1=fract(sin(dot(floor(vW.xz/${HMC.toFixed(2)}),vec2(12.9898,78.233)))*43758.5453), n2=sin(vW.x*.071)*sin(vW.z*.063);
        vec3 sandC=gi>=0?uSandC[gi]:vec3(.86,.79,.6), rockC=gi>=0?uRockC[gi]:vec3(.55,.53,.5);
        vec3 grass=mix(vec3(.2,.43,.14),vec3(.29,.5,.17),chk*.35+n1*.3+n2*.25);
        grass=mix(grass,vec3(.44,.5,.24),smoothstep(5.,1.5,vW.y)*.4);                 // salt-burnt turf along the shore
        grass=mix(grass,vec3(.36,.44,.2),smoothstep(.93,.8,n.y)*.5);                  // thin, dry grass on the slopes
        vec3 rk2=rockC*(.8+.28*n1)*(.82+.18*smoothstep(.45,.9,n.y));
        vec3 sd=sandC*(.94+.07*n1); sd=mix(sd*vec3(.7,.7,.74),sd,smoothstep(.12,.75,vRaw));   // wet sand at the waterline
        vec3 md=vec3(.31,.27,.18)*(.88+.16*n1), dt=vec3(.47,.38,.26)*(.88+.16*n1);
        float wg=max(0.,1.-sw.r-sw.g-sw.b-sw.a);
        c=(grass*wg+sd*sw.r+rk2*sw.g+md*sw.b+dt*sw.a)/max(1.,sw.r+sw.g+sw.b+sw.a+wg);
      } else {
      vec3 land=mix(vec3(.17,.5,.15),vec3(.25,.6,.19),chk);
      vec3 rock=mix(vec3(.45,.37,.27),vec3(.52,.43,.32),chk);
      float rk=mix(smoothstep(24.,38.,vW.y),max(smoothstep(170.,300.,vW.y+18.*sin(vW.x*.013+vW.z*.009)),smoothstep(.8,.62,n.y)),wild);
      c=mix(land*mix(1.,.8+.2*sin(vW.x*.0021)*sin(vW.z*.0017),wild),rock,rk);
      c=mix(c,vec3(.93,.95,.98),wild*smoothstep(430.,500.,vW.y+30.*sin(vW.x*.011)*cos(vW.z*.009))*smoothstep(.45,.7,n.y));
      c=mix(vec3(.78,.72,.45),c,smoothstep(0.,3.,vW.y));
      }
      }
      c*=l;
      if(vRaw<=0.){   // sea: shallows to deep water, the swell (SEAWORLD: the live sea), whitecaps, surf, hull foam
        float d=-vRaw, t=uTime; vec2 p=vW.xz;
        float a1=p.x*.19+t*1.3+sin(p.y*.05), a2=p.y*.23-t*1.1+sin(p.x*.07), a3=(p.x+p.y)*.11+t*.7;
        ${SEA_FS_NORMAL}
        ${SEA_FS_WATER}   // SEALIFE: clarity - the bed through the water (was a flat shallows-to-deep ramp)
        wc=mix(wc,vec3(.1,.2,.27),sk*.4);   // a rough sea is darker and greyer
        vec3 V=normalize(cameraPosition-vW), L=normalize(uSun);
        float fr=1.-max(dot(V,wn),0.); fr*=fr; fr*=fr;
        wc=mix(wc,vec3(.62,.76,.9),fr*.55);
        wc*=.86+.2*max(dot(wn,L),0.);   // SEAWORLD: the swell's faces turned to the sun are lighter
        float sp=max(dot(reflect(-L,wg),V),0.); sp*=sp; sp*=sp; sp*=sp; sp*=sp; sp*=sp; sp*=sp;   // ~^64, on the glitter normal
        wc+=vec3(1.,.95,.8)*sp*1.3*(sp>.002?glitAt(p,t,sk):1.);
        ${SEA_FS_FOAM}
        c=mix(wc*(.92+.05*(sin(a1)+sin(a2))),vec3(.88,.94,1.),foam*.8);
        ${SEA_FS_UNDER}   // SEALIFE: the surface from below
      }
      if(bi>=0){ vec4 b=uBases[bi]; float d=length(vW.xz-b.xy);
        if(d<${BASE_R.toFixed(1)}){ vec3 pc=mix(vec3(.5,.52,.58),vec3(.36,.3,.3),b.w)*l;
          if(d<${(HOLE_R + 2.2).toFixed(1)}){ float a=atan(vW.z-b.y,vW.x-b.x); pc=mix(vec3(.12,.12,.14),mix(vec3(.2,.75,1.),vec3(.85,.15,.1),b.w),step(.5,fract(a*3.82)))*l; }   // hazard ring round the shaft mouth
          c=pc; } }
      if(pi>=0){ vec4 q=uPadP[pi]; float d=length(vW.xz-q.xy);
        if(q.z<.5 && d<26.){ vec2 tl=abs(fract(vW.xz/4.)-.5); c=mix(vec3(.4,.41,.43),vec3(.33,.34,.36),step(.46,max(tl.x,tl.y)))*l; }   // concrete apron
        if(d<${(PAD_R + 2.5).toFixed(1)}){ vec3 pc=vec3(.5,.52,.58)*l; if(d<${PAD_R.toFixed(1)}){float r=d/${PAD_R.toFixed(1)}; pc=mix(vec3(.15,.16,.2),uPadCol[pi],step(.5,fract(r*4.)))*l;} c=pc; } }
      c=fogOfWar(c,vW.xz,uTime);
      float fd=length((viewMatrix*vec4(vW,1.)).xyz);
      gl_FragColor=vec4(mix(c,uFog,smoothstep(uFogN,uFogF,fd)),1.);
    }`;
const terrain = new THREE.Mesh(terrainGeo, new THREE.ShaderMaterial({ uniforms: terrainUni, vertexShader: terrainVS, fragmentShader: terrainFS }));
terrain.frustumCulled = false; zScene.add(terrain);
// TERRAIN: the main grid has a hole where the fine grid lies (the same snapped centre, so the hole is fixed in the
// grid's own frame): those cells are a separate mesh drawn only while the fine grid is off. (A discard would still pay
// for every covered pixel twice in a software rasteriser.)
const terrainHole = (() => {
  const idx = terrainGeo.index.array, ring = [], inner = [], half = TG * TN / 2;
  for (let iy = 0; iy < TN; iy++) for (let ix = 0; ix < TN; ix++) {
    const cx = -half + (ix + 0.5) * TG, cz = -half + (iy + 0.5) * TG, k = (iy * TN + ix) * 6;
    (Math.abs(cx) < FINE_H && Math.abs(cz) < FINE_H ? inner : ring).push(...idx.subarray(k, k + 6));
  }
  const g = terrainGeo.clone(); g.setIndex(inner); terrainGeo.setIndex(ring);
  const m = new THREE.Mesh(g, terrain.material); m.frustumCulled = false; terrain.add(m); return m;
})();
// TERRAIN: the fine grid (1.25 m, the heightmap's own texels) round the camera, stitched into the main grid at its edge
const fineTerrain = new THREE.Mesh(new THREE.PlaneGeometry(2 * FINE_H, 2 * FINE_H, FINE_N, FINE_N).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: terrainUni, vertexShader: terrainVS, fragmentShader: terrainFS, defines: { FINE: 1 } }));
fineTerrain.frustumCulled = false; zScene.add(fineTerrain);
const FAR_C = 24, FAR_N = 220;   // far ring: 12 m cells out to ~1.5 km, only drawn while the view reaches past the fine grid
const farTerrain = new THREE.Mesh(new THREE.PlaneGeometry(FAR_C * FAR_N, FAR_C * FAR_N, FAR_N, FAR_N).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: terrainUni, vertexShader: terrainVS, fragmentShader: terrainFS, defines: { FAR: 1 } }));
farTerrain.frustumCulled = false; farTerrain.visible = false; zScene.add(farTerrain);
// SEAWORLD (the black dome on the horizon): the sky dome and both terrain windows are centred on the camera that
// actually renders, at render time. They used to be placed on zCam in updateCamsAndMeshes; any camera moved after that
// (the tests' scripted cameras: renderer.render patched to move the camera) sat off-centre in a dome 0.97 x the draw
// distance across while the far plane stayed at the draw distance, so the far side of the dome was clipped away and
// the black clear colour showed as a dome above the horizon (and the terrain grid ended short of the view).
sky.frustumCulled = false;
sky.onBeforeRender = (r, s, cam) => { sky.position.copy(cam.position); sky.updateMatrixWorld(); };
const _snapTerrain = cam => { const x = Math.round(cam.position.x / TG) * TG, z = Math.round(cam.position.z / TG) * TG; terrainUni.uNear.value.set(x, z, TG * TN / 2 - 3);
  const fine = fineTerrain.visible = cam.position.y - Math.max(0, terrainH(cam.position.x, cam.position.z)) < 70;   /* (higher up the 2.5 m grid shows as much) */ terrainUni.uFine.value.set(x, z, fine ? FINE_H : 0); terrainHole.visible = !fine; fineTerrain.position.set(x, 0, z); fineTerrain.updateMatrixWorld(); return [x, z]; };
fineTerrain.onBeforeRender = (r, s, cam) => _snapTerrain(cam);
terrain.onBeforeRender = (r, s, cam) => { const [x, z] = _snapTerrain(cam); terrain.position.set(x, 0, z); terrain.updateMatrixWorld(); };
farTerrain.onBeforeRender = (r, s, cam) => { _snapTerrain(cam); farTerrain.position.set(Math.round(cam.position.x / FAR_C) * FAR_C, 0, Math.round(cam.position.z / FAR_C) * FAR_C); farTerrain.updateMatrixWorld(); };
const _nrm = new THREE.Vector3();
const normalAt = (x, z) => { const e = 1.5; return isWater(x, z) ? new THREE.Vector3(0, 1, 0) : _nrm.set(terrainH(x - e, z) - terrainH(x + e, z), 2 * e, terrainH(x, z - e) - terrainH(x, z + e)).normalize().clone(); };
const fx = createFx(zScene, { groundY: (x, z) => Math.max(terrainH(x, z), 0), isWater, normalAt });

// trees
const TREES = [];
{
  let s = 12345; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const geo = new THREE.ConeGeometry(1.3, 5, 6); geo.translate(0, 2.5, 0);
  const mesh = new THREE.InstancedMesh(geo, fogPatch(new THREE.MeshLambertMaterial({ color: 0x1f7a2a, flatShading: true }), fog, terrainUni.uTime), 3200);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); let n = 0;
  for (let i = 0; i < 60000 && n < 3200; i++) {
    const x = (r() * 2 - 1) * BOUND, z = (r() * 2 - 1) * BOUND, h = terrainH(x, z);
    if (h < 2.5 || h > 24 || clearedAt(x, z) || !(s => s === 'grass' || s === 'dirt')(zoneSurf(x, z)) || PADS.some(p => Math.hypot(x - p.x, z - p.z) < (p.isl.cave ? 16 : 34)) || BASES.some(b => Math.hypot(x - b.x, z - b.z) < 30 || stripW(x, z, b) < 1)) continue;   // WORLD: clearedAt keeps trees off the villages and roads
    const k = 0.7 + r() * 1.1; sc.set(k, k * (0.8 + r() * 0.6), k);
    m.compose(new THREE.Vector3(x, h, z), q, sc); mesh.setMatrixAt(n++, m); TREES.push({ x, z, y: h, r: 0.9 * k, h: 5 * sc.y, cr: 1.3 * k, i: n - 1 });   // (TREES: colliders for the ground host; COLLISION: h / cr the drawn cone, for rotor discs)
  }
  mesh.count = n; zScene.add(mesh); TREES.mesh = mesh;   // ARMOUR: the instances a tank pushes over (felled in place)
}
// forest trees out in the wild lands (scattered by the terrain worker on a fixed jittered grid: the same every time)
const forest = (() => { const geo = new THREE.ConeGeometry(1.3, 5, 6); geo.translate(0, 2.5, 0); const t = new THREE.InstancedMesh(geo, fogPatch(new THREE.MeshLambertMaterial({ color: 0x1b6a26, flatShading: true }), fog, terrainUni.uTime), 9000); t.count = 0; t.frustumCulled = false; zScene.add(t); return t; })();
function fillForest(a) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(); let n = 0;
  for (let k = 0; k + 3 < a.length && n < 9000; k += 4) { const s = a[k + 3]; sc.set(s, s * (0.9 + (k % 7) * 0.06), s); m4.compose(p.set(a[k], a[k + 1] - 0.3, a[k + 2]), q, sc); forest.setMatrixAt(n++, m4); }
  forest.count = n; forest.instanceMatrix.needsUpdate = true;
}
// base
const baseGroup = new THREE.Group(); baseGroup.position.set(HOME_B.x, PAD_H, HOME_B.z); zScene.add(baseGroup);
{
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 90, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.y = 45; baseGroup.add(beam); BASES[0].beam = beam;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(8.7, 0.18, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffee66 }));
  ring.rotation.x = Math.PI / 2; ring.position.set(PAD.x - HOME_B.x, 0.25, PAD.z - HOME_B.z); baseGroup.add(ring); baseGroup.userData.ring = ring;
  const mat = new THREE.MeshPhongMaterial({ color: 0x8a92a0, flatShading: true });
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2, b = new THREE.Mesh(new THREE.BoxGeometry(4 + (i % 3), 3 + (i % 4) * 1.5, 4), mat);
    b.position.set(Math.cos(a) * 14.5, 1.5 + (i % 4) * 0.7, Math.sin(a) * 14.5); b.rotation.y = -a; baseGroup.add(b);
  }
}

for (const b of BASES) if (b.kind === 'enemy') {
  const g = new THREE.Group(); g.position.set(b.x, b.h, b.z); zScene.add(g); b.surface = g;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 90, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.y = 45; g.add(beam); b.beam = beam;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(HOLE_R + 2.3, 0.18, 6, 48), new THREE.MeshBasicMaterial({ color: 0xff3020 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; g.add(ring); b.ring = ring;
  const mat = new THREE.MeshPhongMaterial({ color: 0x4a3a3a, flatShading: true });
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.3, m = new THREE.Mesh(new THREE.BoxGeometry(3.5 + (i % 2) * 2, 4 + (i % 3) * 2, 3.5), mat);
    m.position.set(Math.cos(a) * 14, 2 + (i % 3), Math.sin(a) * 14); m.rotation.y = -a; g.add(m);
  }
}

const funnelMat = new THREE.MeshLambertMaterial({ color: 0x4a3c31, side: THREE.DoubleSide, flatShading: true });
for (const b of BASES) {
  const f = new THREE.Mesh(new THREE.CylinderGeometry(HOLE_R, 4.4, 7, 28, 1, true), funnelMat);
  f.position.set(b.x, b.h - 3.5, b.z); zScene.add(f); b.funnel = f;
}

// player ship (zarch)
const heliModel = buildHeliMesh(), shipMesh = heliModel.group, cockpit = buildCockpit(), heliShell = heliModel.shell;
shipMesh.add(cockpit.group);
zScene.add(shipMesh);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const shipShadow = new THREE.Mesh(new THREE.CircleGeometry(3.4, 20).rotateX(-Math.PI / 2), shadowMat); zScene.add(shipShadow);

// bomb sight: where a bomb dropped now would land
const bombSight = (() => {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.8, depthTest: false });
  g.add(new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 28).rotateX(-Math.PI / 2), m));
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.5).rotateX(-Math.PI / 2), m); const a = i * Math.PI / 2; t.position.set(Math.cos(a) * 1.25, 0, Math.sin(a) * 1.25); t.rotation.y = -a; g.add(t); }
  for (const c of g.children) c.renderOrder = 11;
  g.visible = false; zScene.add(g); return g;
})();
const _bs = new THREE.Vector3(), _bv = new THREE.Vector3();
function updateBombSight(hide) {
  bombSight.visible = false;
  if (hide || !Z.alive || G.state !== 'play' || G.bombs <= 0 || H.landed || H.agl < 6) return;
  _bs.copy(H.pos); _bs.y -= 1.7; _bv.copy(H.vel);
  for (let i = 0; i < 200; i++) { _bv.y -= 9 * 0.04; _bs.addScaledVector(_bv, 0.04); const gy = groundY(_bs.x, _bs.z); if (_bs.y <= gy) { _bs.y = gy + 0.3; bombSight.visible = true; break; } }
  if (bombSight.visible) { bombSight.position.copy(_bs); bombSight.scale.setScalar(clamp(_bs.distanceTo(zCam.position) * 0.04, 1.5, 9)); }
}
const reticle = new THREE.Group();
{
  const m = new THREE.MeshBasicMaterial({ color: 0xff5a70, transparent: true, opacity: 0.95, depthTest: false });
  // built in screen pixels and scaled by distance every frame, so it stays a crisp, fixed-size mark at any range
  const dot = new THREE.Mesh(new THREE.CircleGeometry(2, 10), m); dot.renderOrder = 10; reticle.add(dot);
  for (let i = 0; i < 4; i++) {   // hairlines with a gap round the dot
    const l = new THREE.Mesh(new THREE.PlaneGeometry(2, 8), m); const a = i * Math.PI / 2;
    l.position.set(Math.sin(a) * 9, Math.cos(a) * 9, 0); l.rotation.z = -a; l.renderOrder = 10; reticle.add(l);
  }
  reticle.renderOrder = 10; zScene.add(reticle);
}
const aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xff5a70, transparent: true, opacity: 0.28, depthTest: false }));
aimLine.renderOrder = 10; zScene.add(aimLine);
const D = createDamage();
const H = createHeliSim(), _aimR = new THREE.Vector3();   // the UH-1H (hueyfm.js via heli.js)
// ngc/foot2: putting the Huey somewhere (a teleport, a respawn, a scene) brings it out of the hangar: a stowed Huey (a
// Hornet took the deck) is not simulated, and the deck crew would re-spot it on the carrier when the jet is put away
{ const reset0 = H.reset; H.reset = (...a) => { if (G.heliStowed) unstowHeli(); return reset0(...a); }; }
const HI = createHeliInput({ keyDown: kd, CTL, hwOn: () => !keyboardOnly, say: (t, s) => say(t, s) });
const SY = createHeliSystems({ D, G, say: (t, s) => say(t, s) });   // electrics, engine start, governor, cautions
const heliAI = createHeliAI(), heliAIenv = { ground: (x, z) => Math.max(terrainH(x, z), 0, war ? war.deckY(x, z) : -1e9) };   // COMMANDER: the Huey's crew when the commander is elsewhere
const Z = {
  pos: new THREE.Vector3(PAD.x, PAD_H + 0.9, PAD.z), vel: new THREE.Vector3(), lean: new THREE.Vector2(), facing: new THREE.Vector2(0, -1),
  aim: new THREE.Vector3(0, 0, -1), aimOff: new THREE.Vector2(), hd: 0, sector: -1, round: 0, throttle: 0, landed: true, alive: true, deadT: 0, fireCd: 0, wave: 0, waveT: 2,
};
// ---------------------------------------------------------------- the island war (war.js)
const nav = createNav(terrainH);
const seaSpot = (x, z) => { const [wx, wz] = nav.nearestWater(x, z); return [wx, wz, Math.atan2(wx, wz)]; };   // facing the map centre
const PSTORE = { get fuel() { return G.res; }, set fuel(v) { G.res = v; }, get mat() { return G.mat; }, set mat(v) { G.mat = v; }, get fuelMax() { return RES_MAX; } };
// FOUNDATION: everything the player can control is a craft (craft.js); PL is how war.js sees whichever one you are in
// COLLISION (wave 3, collision.js): one collision world for every unit - the crafts' footprints (craft.js syncs them),
// the ground war's machines and Marines, the island trees (ground.js); CW.step resolves contacts once a frame
const CW = createCollisionWorld({ cell: 10 });
setSquadWorld(CW); setPeopleWorld(CW);
const crafts = createCraftHost({ G, Z, say: (t, s) => say(t, s), cw: CW });
const PL = crafts.PL;
const feedItems = [];
function feed(t, kind = 'info') { feedItems.unshift({ t, kind, at: performance.now() }); feedItems.length = Math.min(feedItems.length, 6); }
function islandOwnerChanged(I, was) {
  padUniform[PADS.indexOf(I.pad)].copy(SIDE_COL[I.owner]);
  const b = I.base; if (!b) return;
  baseUniform[BASES.indexOf(b)].w = I.owner === 2 ? 1 : 0;
  if (b.beam) b.beam.material.color.setHex(I.owner === 1 ? 0x66ddff : 0xff4030);
  if (b.ring) b.ring.material.color.setHex(I.owner === 1 ? 0x33bbff : 0xff3020);
  if (!b.st || b.kind !== 'enemy') return;
  if (I.owner === 1) { for (const t of b.st.turrets) { t.alive = false; t.mesh.visible = false; } b.st.podTaken = true; }   // the garrison has surrendered
  else if (I.owner === 2 && was === 1) restockBase(b);
}
function warOver(result, why) {
  if (G.over) return; G.over = true; say(result === 'win' ? `VICTORY  -  ${why}` : `DEFEAT  -  ${why}`, 6);
  setTimeout(() => showEnd(result === 'win' ? 'VICTORY' : 'DEFEAT', why), 5000);
}
function showEnd(title, why) {
  if (G.craft !== 'heli') stowCrafts();   // out of the jet / off your feet / out of a vehicle: the title has the helicopter
  G.state = 'title'; G.mode = 'zarch'; $('title').style.display = 'flex'; $('title').querySelector('h1').textContent = title;
  $('result').textContent = `${why}  -  SCORE ${G.score}`; if (document.pointerLockElement) document.exitPointerLock();
}
war = createWar({
  scene: zScene, fx, sfx, terrainH, isWater, nav, ISLANDS, BASES, G: PSTORE, feed, addScore, ear: zCam.position,
  carrierStart: seaSpot(-300, 280), enemyStart: seaSpot(300, -280),
  player: () => PL, hurtPlayer: (a, why, at, dir, kind) => hurtPlayer(a, why, at, dir, kind), onOwner: islandOwnerChanged, onEnd: warOver,
  cw: CW,   // COLLISION: the ground war's units are bodies in the one collision world
});
if (params.has('sea')) war.setSeaDrift(params.has('seadrift')); else { war.setSea(SEA_PREF.ss); war.setSeaDrift(SEA_PREF.drift); }   // SEAWORLD
const world = createWorldLife({ scene: zScene, fx, sfx, terrainH, isWater, nav, war, fog, uTime: terrainUni.uTime, view, ISLANDS, PADS, BASES });   // WORLD (world/life.js)
// ---------------------------------------------------------------- the HORNET (jetplay.js)
const jetGroundY = (x, z) => Math.max(terrainH(x, z), 0, war.deckY(x, z));   // no shaft holes for a jet: the apron is solid
const jetPlayCtx = {   // TOMCAT: shared by the HORNET (jetplay.js) and the TOMCAT (units/air/tomcatplay.js)
  scene: zScene, war, fx, sfx, say, feed, CTL, GRAV, CARRIER, BOUND, keyDown: kd, groundY: jetGroundY, waterAt, addScore,
  surf: (x, z) => GR.surfAt(x, z),   // TERRAIN: tyre grip by surface (the Tomcat's airframe.js; the Hornet's jetfm has its own fixed tyre)
  takeFuel: u => { const t = Math.max(0, Math.min(u, G.res)); G.res -= t; return t; },
  onCarrier: (x, z) => { const u = war.shipAt(x, z); return !!u && u === war.carrier && u.sinking === undefined; },
  selectedIsland: () => selIsl, drawMap: (c, k) => drawJetMap(c, k), catClear: () => { const c = war.carrier; return !!c && laneClear(c, c.yaw) > 320; },
};
const JP = createJetPlay({
  ...jetPlayCtx,
  onLost: (why, ejected) => jetC.lost(why, ejected), onEject: () => {}, toggleView: () => { cockpitCam = !cockpitCam; if (!cockpitCam) JP.snapChase(); },
});
// open water ahead of the carrier's bow along heading yaw: how far (m) before land comes up
function laneClear(c, yaw, max = 700) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), bx = c.p.x - Math.sin(c.yaw) * 66, bz = c.p.z - Math.cos(c.yaw) * 66;
  for (let d = 0; d <= max; d += 15) if (terrainH(bx + fx * d, bz + fz * d) > -1) return d;
  return max + 1;
}
// before a launch the ALBATROSS steams onto the nearest heading with a clear run ahead (as carriers turn into the wind)
function turnIntoClear() {
  const c = war.carrier; if (!c || laneClear(c, c.yaw) > 320) return false;
  let best = null;
  for (let k = 1; k <= 24 && !best; k++) for (const s of [1, -1]) { const y = c.yaw + s * k * Math.PI / 12; if (laneClear(c, y) > 600) { best = y; break; } }
  if (best === null) return false;
  war.orderCarrier(c.p.x - Math.sin(best) * 500, c.p.z - Math.cos(best) * 500); feed('ALBATROSS: TURNING INTO CLEAR WATER FOR THE LAUNCH'); return true;
}
// 5 on the ALBATROSS deck: climb into a Hornet on the catapult (craftjet.js); Y on deck: get out and walk
const launchJet = () => jetC.launch();
const swapToHeli = () => getInOut();
// the AMPCD moving map (drawn in world metres; k = pixels per metre)
function drawJetMap(c, k) {
  c.fillStyle = 'rgb(10,38,74)'; c.fillRect(Z.pos.x - 6000, Z.pos.z - 6000, 12000, 12000);
  if (farMap.ready) c.drawImage(farMap.cv, farMap.ox, farMap.oz, farMap.size, farMap.size);
  c.imageSmoothingEnabled = true; c.drawImage(landImg, -BOUND, -BOUND, 2 * BOUND, 2 * BOUND); c.drawImage(fogImg, -BOUND, -BOUND, 2 * BOUND, 2 * BOUND);
  c.strokeStyle = 'rgba(255,220,120,.7)'; c.lineWidth = 2 / k; c.setLineDash([12 / k, 10 / k]); c.strokeRect(-BOUND, -BOUND, 2 * BOUND, 2 * BOUND); c.setLineDash([]);
  c.save(); c.translate(-BOUND + 8 / k, -BOUND + 22 / k); c.scale(1 / k, 1 / k); c.fillStyle = 'rgba(255,220,120,.9)'; c.font = 'bold 15px monospace'; c.textAlign = 'left'; c.fillText('CONTROL ZONE', 0, 0); c.restore();
  c.lineWidth = 2 / k;
  for (const I of ISLANDS) { if (!fog.exploredAt(I.pad.x, I.pad.z)) continue; c.strokeStyle = I.seen < 0 ? '#999' : OWN_COL[I.seen]; c.beginPath(); if (I.cave) c.rect(I.pad.x - 14, I.pad.z - 14, 28, 28); else c.arc(I.pad.x, I.pad.z, 14, 0, 6.283); c.stroke(); if (I === selIsl) { c.strokeStyle = '#ff8'; c.beginPath(); c.arc(I.pad.x, I.pad.z, 26, 0, 6.283); c.stroke(); } }
  for (const u of war.units) {
    if (u.side === 2 && !fog.visibleAt(u.p.x, u.p.z)) continue; c.fillStyle = u.side === 1 ? '#6ef' : '#f64';
    if (u.dims) { c.save(); c.translate(u.p.x, u.p.z); c.rotate(-u.yaw); c.fillRect(-u.dims.W / 2, -u.dims.L / 2, u.dims.W, u.dims.L); c.restore(); } else c.fillRect(u.p.x - 6, u.p.z - 6, 12, 12);
  }
}
// the para-drop repair team (logistics on land): a dropship from the carrier, a jump run, canopies, a crew that runs over
const drop = createDrop({
  scene: zScene, fx, sfx, war, groundY, terrainH, isWater, say, feed,
  home: () => { const s = spawnSpot(); return { x: s.x, z: s.z }; },
  onFuel: k => { G.fuel = Math.min(100, G.fuel + k); sfx.refuel?.(); },
  onRepaired: () => { const fixed = D.damaged(); D.fieldRepair(); sfx.pickup(); say(fixed ? 'FIELD REPAIR DONE  -  FLY HER HOME' : 'CREW DONE  -  FUEL ABOARD  -  FLY HER HOME', 3); },
  onFail: () => {}, onEnd: () => { G.rescue = null; },
  setThrottle: v => HI.setCollective(v), takeStick: () => {}, releaseStick: () => HI.setCollective(G.heliColl ?? 0), head,
});
// the SKY CARRIER's bridge: Tab on its deck takes the helm
const helm = createHelm({ war, say, groundY });
function toggleHelm() {
  if (G.state !== 'play' || G.mode !== 'zarch' || G.craft !== 'heli') return;
  if (helm.active) { leaveHelm(); return; }
  const c = war.carrier;
  if (!c || !c.sky) { say(`NO SKY CARRIER YET  -  REFIT THE ALBATROSS FROM THE MAP (6, ${COST.sky} MATERIEL)`, 2.2); return; }
  if (!c.sky.up) { say(`REFIT UNDER WAY  -  ${Math.ceil(c.sky.refit)}s`, 1.6); return; }
  if (!helm.canTake(Z.alive && H.landed, !!(Z.svc && Z.svc.deck))) { say('LAND ON THE ALBATROSS TO TAKE THE HELM', 1.8); return; }
  helm.take(); if (document.pointerLockElement) document.exitPointerLock();
}
function leaveHelm() { helm.leave(); HI.setCollective(G.heliColl ?? 0); }
// commands (any time; the big map shows what is selected): 1 CH-46 Sea Knight with Marines, 2 AA gun, 3 helicopter
let selIsl = null;
function command(n) {
  if (G.state !== 'play') return;
  // COMMANDER: 5 / 8 from anywhere - in the Huey on the deck or in the jet as before, else the commander takes the jet
  // out on cat 1 (or switches to the one already out); the unit you leave carries on
  const deckJet = k => G.mode === 'zarch' && (G.craft === k || (G.craft === 'heli' && heliOnDeckNow()));
  if (n === 5) { if (deckJet('jet') || G.mode !== 'zarch') launchJet(); else commander.deploy('jet', 'ship'); return; }
  if (n === 8) { if (deckJet('tomcat') || G.mode !== 'zarch') tomcatC.launch(); else commander.deploy('tomcat', 'ship'); return; }   // TOMCAT: an F-14A to cat 1 (crafttomcat.js)
  if (n === 7) { motorChoice(); return; }   // ngc/wheeledgame: the motor pool (then 1 M151A2 / 2 M35A2)
  if (n === 9 || n === 0) { deliverArmour(n === 9 ? 'm60' : 'm113'); return; }   // ARMOUR: by LCM-8 to a friendly beach (9 M60A3, 0 M113A2; 8 is the TOMCAT)
  if (n === 4) { say(war.sendEscort(selIsl), 2); return; }   // AIR: CAP over the selected island, else over the ALBATROSS
  if (n === 6) { say(war.upgradeCarrier(), 2.5); return; }
  if (n === 3) { if (G.mat < COST.heli) say('NOT ENOUGH MATERIEL FOR A HELICOPTER', 1.6); else { G.mat -= COST.heli; G.lives++; say('NEW HELICOPTER IN THE HANGAR', 1.6); sfx.dock(); } return; }
  if (!selIsl) { say('SELECT AN ISLAND ON THE MAP FIRST (M)', 1.8); return; }
  say(n === 1 ? war.sendDrone(selIsl) : war.orderAA(selIsl), 2);
}
// where a fresh helicopter starts: the carrier deck while it is afloat, else the home pad
function spawnSpot() {
  const c = war && war.carrier;
  // the aft helicopter spot (H3): the Huey's 48 ft disc clears the island there
  if (c && c.sinking === undefined && !params.has('homepad')) { const lx = -2, lz = 32, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), x = c.p.x + lx * cs + lz * sn, z = c.p.z - lx * sn + lz * cs, dy = war.deckY(x, z); return { x, z, y: dy > -1e8 ? dy : CARRIER.DECK + Math.max(0, c.p.y), yaw: c.yaw }; }   // NAVAL: deckY moves with the sea
  return { x: PAD.x, z: PAD.z, y: PAD_H, yaw: 0 };
}
function resetZarch(fromPad, spot = null) {   // COMMANDER: spot = a friendly island's pad (else the deck / home pad)
  const sp = spot || spawnSpot(); heliAI.off(); Z.handedOn = false;
  // on the deck / pad: hot at flight idle, the throttle rolls on by itself (?cold: cold and dark, start it yourself)
  const cold = fromPad && params.has('cold');
  H.reset(new THREE.Vector3(sp.x, sp.y - HELI.SKID_Y, sp.z), sp.yaw, fromPad, cold ? -1 : fromPad ? 0 : 1); HI.setCollective(0); SY.reset(cold);
  if (!fromPad) SY.grip = 1, SY.auto = null;
  Z.pos.copy(H.pos); Z.vel.set(0, 0, 0); Z.lean.set(0, 0); Z.landed = fromPad;
  Z.alive = true; shipMesh.visible = true; shipShadow.visible = true;
}
// Emergency landing: set down safely anywhere with an empty tank and a logistics team flies out a fuel drop.
// It takes a while and only brings half a tank - enough for a last-chance run home. A parachute crate drops beside you
// on the surface for the last few seconds. Crashing (or getting shot) while waiting cancels it.
const RESCUE_TIME = 25, RESCUE_FUEL = 50;
const crate = (() => {
  const g = new THREE.Group(); g.visible = false;
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.2), new THREE.MeshLambertMaterial({ color: 0x6b5a2e, emissive: 0x1a1508 })));
  const chute = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x553322, side: THREE.DoubleSide }));
  chute.position.y = 4; g.add(chute); g.userData.chute = chute;
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.6, 3), new THREE.MeshBasicMaterial({ color: 0xdddddd })); l.position.set(x * 0.9, 2.2, z * 0.9); l.rotation.set(z * 0.25, 0, -x * 0.25); g.add(l); }
  zScene.add(g); return g;
})();
function updateRescue(dt, landed, inCave) {
  const R = G.rescue;
  if (!R) {
    if (landed && G.fuel < 0.5 && G.state === 'play') { G.rescue = { t: RESCUE_TIME, cave: inCave }; say('EMERGENCY LANDING  -  LOGISTICS TEAM DISPATCHED', 3); sfx.dock(); }
    else if (landed && D.critical() && G.state === 'play' && !G.rescueHinted) { G.rescueHinted = true; say('DAMAGED  -  PRESS L TO CALL LOGISTICS FOR A FIELD REPAIR', 3); }
    if (!landed) G.rescueHinted = false;
    return;
  }
  if (!R.cave) { if (!R.drop) { R.drop = true; const sp = spawnSpot(); drop.start(Z.pos, { x: sp.x, y: sp.y, z: sp.z }); } return; }   // on land: the para-drop
  R.t -= dt;
  if (!R.cave && R.t < 6 && !crate.visible) {   // the drop: a crate on a chute lands a few metres off the nose
    const f = H.forward(); R.cx = Z.pos.x + f.x * 7 + 3; R.cz = Z.pos.z + f.z * 7; crate.visible = true; crate.userData.chute.visible = true;
  }
  if (crate.visible) {
    const gy = groundY(R.cx, R.cz), y = gy + 0.5 + Math.max(0, R.t) * 9;
    crate.position.set(R.cx, y, R.cz); crate.rotation.y += dt * 0.3; crate.userData.chute.visible = R.t > 0;
  }
  if (R.t <= 0) {
    G.fuel = Math.max(G.fuel, RESCUE_FUEL); const fixed = D.damaged(); D.fieldRepair(); G.rescue = null; sfx.refuel?.(); sfx.pickup();
    say(`${fixed ? 'FIELD REPAIR DONE  -  ' : ''}FUEL DROP ${RESCUE_FUEL}%  -  MAKE IT BACK TO BASE`, 3.5);
    setTimeout(() => { crate.visible = false; }, 8000);
  }
}
function doSwitch(id) {
  if (typeof cockpit !== 'undefined') cockpit.press(id);
  sfx.ui?.('select');
  if (id === 'engine') toggleEngine();
  else if (id === 'hyd') { D.hydBoost = !D.hydBoost; say(D.hydBoost ? 'HYDRAULIC BOOST ON' : 'HYDRAULIC BOOST OFF', 1.4); }
  else if (id === 'sas') HI.toggleSas();
  else if (id === 'light') { G.light = !G.light; say(G.light ? 'LANDING LIGHT ON' : 'LANDING LIGHT OFF', 1.2); }
  else if (id === 'radio') callLogistics();
  else if (id === 'fire') { const r = D.extinguish(); say(r === 'FIRE OUT' ? 'FIRE EXTINGUISHED' : r, 1.6); if (r === 'FIRE OUT') sfx.refuel?.(); }
  else if (['bat', 'gen', 'inv', 'gov', 'trim', 'lowrpm', 'starter', 'mc'].includes(id)) {   // Huey systems (heli.js)
    const on = SY.toggle(id), name = { bat: 'BATTERY', gen: 'MAIN GENERATOR', inv: 'INVERTER', gov: 'GOVERNOR', trim: 'FORCE TRIM', lowrpm: 'LOW RPM AUDIO', starter: 'STARTER' }[id];
    if (name) say(id === 'gov' ? `GOVERNOR ${on}${on === 'EMER' ? '  -  MANAGE THE RPM WITH THE THROTTLE (PGUP / PGDN)' : ''}` : id === 'starter' ? (on ? 'STARTER ENGAGED  -  RELEASES AT 40% N1' : 'STARTER RELEASED') : `${name} ${on ? 'ON' : 'OFF'}`, 1.6);
  }
}
// I: cut the fuel (autorotate) / with the engine stopped, the whole start sequence on one key (battery, starter to 40% N1,
// light-off, idle, throttle open: ~10 s). The cockpit switches and Home / PgUp / PgDn do it by hand.
function toggleEngine() {
  if (D.engineSwitch && (H.run || SY.auto)) { D.engineSwitch = false; SY.cut(); say('MAIN FUEL OFF  -  ENGINE CUT  -  AUTOROTATE', 1.8); return; }
  if (D.hp.engine <= 0.05) { D.engineSwitch = !D.engineSwitch; say('ENGINE WILL NOT START', 1.6); return; }
  if (H.run) { D.engineSwitch = true; say('MAIN FUEL ON', 1.2); return; }
  SY.quickStart(); say('ENGINE START  -  STARTER ENGAGED', 1.8);
}
// enemy fire / rams: break a part instead of killing outright
// war.js hits the player: route to the craft you are in (at = the round's position, dir = its velocity: body parts)
function hurtPlayer(amount, why, at, dir, kind) {   // kind (wave 2): the war.js projectile, for the Marine's wounds
  if (G.bench) return;
  if (G.craft === 'heli') hurtHeli(amount, why); else crafts.active.hurt(amount, why, at, dir, kind);
}
function hurtHeli(amount, why, part) {
  if (G.bench) return;
  if (G.craft !== 'heli') { crafts.active.hurt(amount, why, null, null); return; }   // (tests call this in the jet)
  const p = D.hit(amount, part), name = PARTS.find(q => q.id === p).name;
  sfx.hit?.() ?? sfx.boom(0.3);
  const m = D.mods();
  const msg = p === 'tail' && m.tail === 0 ? 'TAIL ROTOR SHOT AWAY  -  CUT THE ENGINE OR FLY FAST' : p === 'engine' && D.fire ? 'ENGINE FIRE  -  PRESS O TO EXTINGUISH' :
    p === 'rotor' && m.lift === 0 ? 'MAIN ROTOR DESTROYED' : p === 'fuel' && D.hp.fuel < 0.75 ? 'FUEL TANK HIT  -  LEAKING' : `${why}  -  ${name} HIT`;
  say(msg, 2);
}
function callLogistics() {
  const landed = G.mode === 'zarch' ? H.landed : T.landed, alive = G.mode === 'zarch' ? Z.alive : T.alive;
  if (G.rescue) { say(`LOGISTICS ALREADY INBOUND  -  ${rescueStatus()}`, 1.5); return; }
  if (!alive || !landed) { say('LAND FIRST TO CALL LOGISTICS', 1.5); return; }
  if (G.mode === 'zarch' && Z.svc) { say(`ON ${Z.svc.name}  -  REPAIRS AND FUEL ARE AUTOMATIC HERE`, 1.8); return; }
  if (!D.damaged() && G.fuel >= RESCUE_FUEL) { say('NOTHING TO FIX  -  TANKS ABOVE HALF', 1.5); return; }
  G.rescue = { t: RESCUE_TIME, cave: G.mode !== 'zarch' }; say('LOGISTICS TEAM DISPATCHED  -  FUEL AND FIELD REPAIR', 2.5); sfx.dock();
}
function cancelRescue() { if (helm.active) leaveHelm(); drop.cancel(); if (G.rescue) { G.rescue = null; crate.visible = false; } }
const rescueStatus = () => G.rescue && G.rescue.drop ? drop.status() : G.rescue ? `${Math.max(0, Math.ceil(G.rescue.t))}s` : '';

function killPlayerZ(why) {
  cancelRescue();
  if (!Z.alive) return;
  Z.alive = false; Z.deadT = 2.4; Z.lastDeath = { why, pos: H.pos.toArray().map(v => +v.toFixed(1)), t: performance.now() };   // for tests and post-mortems
  fx.explode(H.pos.x, H.pos.y, H.pos.z, 2.4, { fire: 45, debris: 16, color: 0x55613d, oil: true }); sfx.boom(1.2); sfx.engine(0);
  heliAI.off(); Z.handedOn = false;
  // COMMANDER: the fleet loses a Huey (the reserve was counted when it went out); the next one is the commander's call
  onUnitLost('heli', why, G.craft === 'heli');
  if (G.craft !== 'heli') { feed(`HUEY LOST  -  ${why}`, 'bad'); return; }   // the crew was flying it home, or it was parked
  say(why, 2);
}

// refuel / repair / rearm / unload cargo: on any friendly pad or our carrier's deck
function serviceAt(x, z) {
  const u = war.shipAt(x, z); if (u && u === war.carrier && u.sinking === undefined) return { name: 'ALBATROSS', deck: true };
  for (const p of PADS) if (p.isl.owner === 1 && Math.hypot(x - p.x, z - p.z) < p.r + 1) return { name: p.isl.name, pad: p };
  return null;
}
function service(svc, dt, piloted = true) {
  const say = piloted ? sayMsg : () => {};   // a parked helicopter is serviced quietly
  const fill = Math.min(G.res, 20 * dt, 100 - G.fuel); G.res -= fill; G.fuel += fill;
  if (G.cargo > 0) { const u = Math.min(G.cargo, 30 * dt, RES_MAX - G.res); G.cargo -= u; G.res += u; Z.unloaded = (Z.unloaded || 0) + u; if (G.cargo <= 0.01 && Z.unloaded > 0) { say(`FUEL UNLOADED  -  STORES ${Math.round(G.res)}`, 2); addScore(Math.round(Z.unloaded * 5)); Z.unloaded = 0; } }
  if (D.damaged()) { D.repair(0.25 * dt); if (!D.damaged()) say('REPAIRS COMPLETE', 1.5); }
  Z.rearmT = (Z.rearmT || 0) - dt;
  const cmLoading = cmH.rearm(dt), arming = G.rockets < ROCKETS_MAX || G.bombs < BOMBS_MAX;   // CM: the M130 reloads too
  if (arming && Z.rearmT <= 0) { Z.rearmT = 0.35; if (G.rockets < ROCKETS_MAX) G.rockets = Math.min(ROCKETS_MAX, G.rockets + 2); else G.bombs++; if (piloted) sfx.blip?.(700, 900, 0.05, 'square', 0.05); }
  if (fill > 0 || arming || cmLoading) Z.refuelling = true; else if (Z.refuelling) { Z.refuelling = false; say(G.res < 1 ? 'FUEL STORES EMPTY  -  TAKE FUEL ISLANDS OR LOOT ENEMY CAVES' : `${svc.name}  -  FUELLED AND ARMED`, 1.6); }
}
const _rk = new THREE.Vector3();
// the advisor: every so often, the next thing worth doing
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const bearing = (dx, dz) => COMPASS[Math.round(((Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360) / 45) % 8];
function advise(dt) {
  G.advT = (G.advT ?? 12) - dt; if (G.advT > 0) return; G.advT = 45;
  const P = Z.pos, b = war.battleship;
  if (b && b.sinking === undefined) { feed(`ADVISOR: THE LEVIATHAN IS ${Math.round(Math.hypot(b.p.x - P.x, b.p.z - P.z))}m ${bearing(b.p.x - P.x, b.p.z - P.z)}  -  BOMB IT (B) BEFORE IT REACHES THE ALBATROSS`, 'bad'); return; }
  if (war.E.bship > 55) { feed(`ADVISOR: THE LEVIATHAN IS ${Math.floor(war.E.bship)}% BUILT  -  BOMB THEIR FACTORIES AND THE IRONHOLD SHIPYARD`, 'bad'); return; }
  let best = null, bd = 1e9;
  for (const I of ISLANDS) if (I.owner !== 1 && !I.cave) { const d = Math.hypot(I.pad.x - P.x, I.pad.z - P.z) * (I.owner === 0 ? 1 : 1.6); if (d < bd) { bd = d; best = I; } }
  if (best) {
    const d = Math.round(Math.hypot(best.pad.x - P.x, best.pad.z - P.z)), dir = bearing(best.pad.x - P.x, best.pad.z - P.z);
    feed(best.owner === 0 ? `ADVISOR: ${best.name} (${KIND_NAME[best.kind]}) IS UNCLAIMED, ${d}m ${dir}  -  LAND ON ITS PAD OR SEND A SEA KNIGHT (M, 1)` : `ADVISOR: ${best.name} IS ENEMY-HELD, ${d}m ${dir}  -  SILENCE ITS GUNS, THEN LAND ON IT`);
    return;
  }
  const f = ISLANDS.find(I => I.cave && I.owner === 2); if (f) feed(`ADVISOR: STEAL THE POD FROM THE CAVE UNDER ${f.name} TO TAKE IT`);
}
// ---------------------------------------------------------------- the Huey's moving parts, panel and sound (heli.js)
const _hl = { nr: 0, tx: 0, ty: 0, cone: 0.05, coll: 0, ped: 0, rockets: 0, light: false, aim: new THREE.Vector3(), firing: false, tailLost: false, rotorHp: 1, run: false, n1: 0 };
function heliLook() {   // what the exterior model animates
  return Object.assign(_hl, { nr: H.rpm, tx: H.tx, ty: H.ty, cone: 0.03 + 0.03 * Math.min(1.5, H.thrust / (H.mass * 9.81)), coll: H.c.coll, ped: H.c.ped, rockets: G.rockets, light: G.light,
    firing: Z.fireCd > 0.06, tailLost: D.hp.tail <= 0, rotorHp: D.hp.rotor, run: H.run, n1: H.n1 }), _hl.aim.copy(Z.aim), _hl;
}
const _hp = { sw: {}, ctl: {} };
function heliPanel(hover) {   // everything the cockpit shows (hueycockpit.js)
  const a = H.attitude(), m = D.mods();
  return Object.assign(_hp, {
    ias: H.ias, alt: H.pos.y * 3.28084, vsi: H.vel.y * 196.85, pitch: a.pitch, roll: -a.roll, hdg: H.heading(), slip: H.slip, turn: -H.w.y, agl: H.agl, landed: H.landed,
    nr: H.rpm, n2: H.n2, n1: H.n1, torque: H.torque, egt: H.egt, engOilP: SY.engOilP, engOilT: SY.engOilT, xmsnOilP: SY.xmsnOilP, xmsnOilT: SY.xmsnOilT,
    fuelLb: G.fuel / 100 * 1358, fuelPct: G.fuel, volts: SY.volts, amps: SY.amps, ac: SY.ac, hydPsi: m.hydOk ? 1000 * Math.min(1, H.rpm * 1.5) : 0,
    throttle: SY.grip, cautions: SY.cautions, masterCaution: SY.masterCaution, rpmWarn: SY.rpmWarn, fire: D.fire, hover, avionics: D.hp.avionics, vrs: H.vrs, stall: H.stall,
    rwr: RWR, cm: cmH,   // CM: the APR-39 scope, threat lamps and the M130 counters
  }), Object.assign(_hp.sw, { bat: SY.bat, gen: SY.gen, inv: SY.inv, engine: D.engineSwitch, gov: SY.gov, hyd: D.hydBoost, trim: SY.trim, light: G.light, sas: HI.sas, lowrpm: SY.lowRpmAudio, starter: H.starter }),
    Object.assign(_hp.ctl, { cx: H.c.lat, cy: H.c.lon, pedal: H.c.ped, coll: H.c.coll }), _hp;
}
function hueyLine(ias, hdg, agl, c) {   // the numbers line under the external views
  const flags = [H.vrs > 0.4 && 'VORTEX RING!', SY.rpmWarn && 'RPM!', H.stall > 0.3 && 'BLADE STALL!', H.torque > 52 && 'OVERTORQUE', SY.gov === 'EMER' && 'GOV EMER'].filter(Boolean).join('  ');
  return `NR ${(H.rpm * 100).toFixed(0)}%  TQ ${H.torque.toFixed(0)} PSI  N1 ${(H.n1 * 100).toFixed(0)}%  EGT ${H.egt.toFixed(0)}°  IAS ${ias.toFixed(0)}kt  VS ${(H.vel.y * 196.85 / 100).toFixed(0) * 100}fpm  AGL ${agl.toFixed(0)}m  HDG ${hdg.toFixed(0).padStart(3, '0')}  COLL ${(H.coll * 100).toFixed(0)}%  ${c.sas ? 'ASSIST' : 'MANUAL'}  [${c.source || ''}]${flags ? '  ' + flags : ''}`;
}
function hueyHint() {   // what to do next, from the start sequence to the emergencies
  const n1 = Math.round(H.n1 * 100);
  if (!H.run && H.n1 < 0.1 && !SY.auto && !H.starter) return D.hp.engine <= 0.05 ? 'ENGINE DEAD  -  AUTOROTATE, OR CALL LOGISTICS ON THE GROUND (L)' : !H.landed ? 'ENGINE OUT  -  COLLECTIVE DOWN, KEEP 324 RPM, 70 KT, FLARE AT ~100 FT, CUSHION WITH THE COLLECTIVE' : 'ENGINE OFF  -  I: QUICK START  ·  BY HAND: BAT, MAIN FUEL, THROTTLE TO IDLE (PGUP), HOLD STARTER (HOME) TO 40% N1';
  if (H.hung) return `HUNG START  -  N1 ${n1}%  -  HOLD THE STARTER (HOME) TO 40% N1`;
  if (H.starter || SY.auto === 'crank' || (H.run && H.n1 < 0.6)) return `STARTING  -  N1 ${n1}%  EGT ${H.egt.toFixed(0)}°C${H.run ? '  -  LIGHT-OFF' : ''}${H.n1 > 0.4 ? '  -  RELEASE THE STARTER' : ''}`;
  if (H.landed && SY.grip < 0.95) return SY.auto === 'rollon' ? `THROTTLE ROLLING ON  -  NR ${Math.round(H.rpm * 100)}%` : 'FLIGHT IDLE  -  OPEN THE THROTTLE (PGUP) TO 6600 RPM';
  if (H.landed && H.rpm < 0.95) return `ROTOR COMING UP TO 324 RPM  -  NR ${Math.round(H.rpm * 100)}%`;
  if (H.landed) return '';
  if (!H.driven && H.rpm > 0.3) return 'AUTOROTATION  -  COLLECTIVE TO HOLD 324 RPM, 70 KT, FLARE AT ~100 FT, CUSHION WITH THE COLLECTIVE';
  if (H.vrs > 0.5) return 'VORTEX RING STATE  -  FORWARD CYCLIC: FLY OUT OF YOUR OWN DOWNWASH';
  if (H.stall > 0.3) return 'RETREATING BLADE STALL  -  SLOW DOWN, LOWER THE COLLECTIVE';
  if (SY.rpmWarn && H.rpm < 0.93) return 'LOW ROTOR RPM  -  LOWER THE COLLECTIVE';
  if (H.torque > 52) return 'OVERTORQUE  -  50 PSI IS THE LIMIT';
  return '';
}
function hueySound(piloted = true) {   // blade slap, turbine, low rotor rpm horn (audio.js)
  if (!sfx.huey) { sfx.engine(H.rpm * (0.25 + 0.75 * H.coll)); return; }
  // parked (you walked away, or you are driving past it): heard from outside, fading with distance
  const vol = piloted ? (G.craft === 'heli' ? 1 : 0) : Math.max(0, 1 - zCam.position.distanceTo(H.pos) / 220) * (crafts.active && crafts.active.kind === 'air' ? 0 : 1);
  sfx.huey({ nr: H.rpm, n1: H.n1, load: H.thrust / (H.mass * 9.81), torque: H.torque, vib: H.vib, horn: piloted && SY.horn, inside: piloted && cockpit.group.visible, spd: Math.hypot(H.vel.x, H.vel.z), on: G.state === 'play' && (G.mode === 'zarch' ? Z.alive : T.alive) && !G.heliStowed ? vol : 0 });
}
// the Huey on the surface. piloted: you fly it (HI controls, weapons, logistics, the helm, the advisor, the avatar Z);
// parked: nobody aboard - collective down, cyclic centred, engine left running at flight idle, the skids ride the deck
// or sit on the pad (it still refuels on a friendly pad), and it can still be lost (a ditching, a crash).
// CM (ngc/cmpolish): the Huey's M130 flare / chaff dispenser (units/defence/cm.js): one 30-cartridge payload module on
// the left side of the tail boom (INFERRED placement), 18 flares + 12 chaff; a press drops a pair of flares or one chaff
const HUEY_CM_KEYS = { Insert: 'flare', Semicolon: 'flare', Delete: 'chaff', Quote: 'chaff' };
const cmH = createDispenser({ name: 'M130', flares: 18, chaff: 12, program: { flare: 2, chaff: 1 }, gap: 0.22, ports: [[-0.62, 0.15, 3.0]], eject: { flare: [-0.55, -0.8, 0.25], chaff: [-0.8, -0.5, 0.2] }, sfx, say: (t, s) => say(t, s) });
const _cmQ = new THREE.Vector3();
const cmPose = { vel: null, toWorld: (l, o) => { _cmQ.set(l[0], l[1], l[2]).applyQuaternion(H.q).add(H.pos); o.x = _cmQ.x; o.y = _cmQ.y; o.z = _cmQ.z; return o; }, dirWorld: (l, o) => { _cmQ.set(l[0], l[1], l[2]).normalize().applyQuaternion(H.q); o.x = _cmQ.x; o.y = _cmQ.y; o.z = _cmQ.z; return o; } };
Object.defineProperty(cmPose, 'vel', { get: () => H.vel });
const _parkCtl = { cx: 0, cy: 0, pedal: 0, coll: 0, sas: false, fire: false, winch: false, rocket: false, bomb: false, hatX: 0, hatY: 0, source: 'PARKED' };
// COLLISION (wave 3): the Huey against the collision world (collision.js).
// The ROTOR DISC (48 ft, 7.32 m radius, at the hub) sweeps a horizontal disc: a tree's crown (a cone), a parked craft,
// a vehicle, a machine taller than the hub's height in reach is a strike. GAME: a tree's outer branches cost the blade
// tips (damage by how deep the disc cut in), anything solid takes a blade off; the rotor loses rpm; what it hits is
// damaged (a deep cut fells the tree). The FUSELAGE: hover-taxiing or sliding into something (not landed, low) is
// pushed out of it with damage by closing speed (aircontact.js bands), a crash past 7 m/s.
const _hub = new THREE.Vector3(), _dsc = {};
let rotorHitT = 0, heliBumpT = 0;
const RSTAT = { strikes: 0, last: null, bumps: 0 };
function heliContacts(dt, piloted) {
  rotorHitT -= dt; heliBumpT -= dt;
  const tell = (t, s) => piloted ? say(t, s) : feed(t, 'bad');
  // (landed: the deck crew / the spawn put her there - a parked jet in the Huey's spot is not a strike every frame; blades
  // already gone: nothing left to strike with)
  if (H.omega > 3 && rotorHitT <= 0 && !H.landed && D.hp.rotor > 0.02) {
    H.worldPoint(UH1H.HUB, _hub);
    let r = CW.disc(_hub.x, _hub.y, _hub.z, UH1H.R, heliC, _dsc);
    if (!r && !H.landed) { const g = GR.discHit(_hub.x, _hub.y, _hub.z, UH1H.R); if (g) r = { body: { cls: 'solid', owner: g.s ? { kind: g.what } : null, what: g.what }, depth: 9, x: g.x, z: g.z }; }   // buildings, walls, masts, island structures (in flight)
    if (r) {
      rotorHitT = 0.6; RSTAT.strikes++;
      const b = r.body, tree = b.cls === 'tree', sev = tree ? Math.min(1, r.depth / 2.5) : 1;
      D.hit(tree ? 0.12 + 0.55 * sev : 0.85, 'rotor');
      H.omega *= tree ? 1 - 0.12 * sev : 0.65;
      sfx.boom(0.35 + 0.4 * sev);
      const k = Math.max(0.3, sev), dx = r.x - _hub.x, dz = r.z - _hub.z, dl = Math.hypot(dx, dz) || 1;
      for (let i = 0; i < 14 * k; i++) fx.mix.spawn(r.x, _hub.y, r.z, rnd(-6, 6) + dx / dl * 8, rnd(-1, 4), rnd(-6, 6) + dz / dl * 8, rnd(0.15, 0.4), 0.8, 2, tree ? .25 : .5, tree ? .42 : .5, tree ? .2 : .5, 0.6, 3, 1, 0.3);
      let what = tree ? 'TREE' : b.what || 'SOMETHING';
      if (tree) { if (sev > 0.45) { const T = AW.fell('tree' + b.owner.i, dx / dl, dz / dl); if (!T) fellTree(b.owner, dx / dl, dz / dl); } }
      else if (b.owner && b.cls !== 'solid') {
        const o = b.owner; what = o.label || (o.kind ? String(o.kind).toUpperCase() : what);
        if (o.hurt && o !== heliC) o.hurt(0.6, 'ROTOR STRIKE');
        else if (o.kind && war.ground && war.ground.sim && war.ground.sim.applyHit) war.ground.sim.applyHit(o, { type: 'blast', weapon: 'ROTOR' }, 260);
      }
      RSTAT.last = { what, sev: +sev.toFixed(2), rotor: +D.hp.rotor.toFixed(2), t: war.time };
      tell(D.hp.rotor <= 0.02 ? `ROTOR STRIKE  -  ${what}  -  THE BLADES ARE GONE` : `ROTOR STRIKE  -  ${what}  -  MAIN ROTOR ${Math.round(D.hp.rotor * 100)}%`, 2.4);
    }
  }
  if (!H.landed && H.agl < 6) {   // the fuselage: hover-taxi / slide into something
    const B = crafts.syncBody(heliC, 0);
    const r = B && groundContact(CW, B, H.pos, H.vel);
    if (r) {
      const dm = contactDamage(r.speed);
      if (dm.band !== 'nudge' && heliBumpT <= 0) {
        heliBumpT = 1; RSTAT.bumps++;
        const o = r.other.owner, who = o && o.label ? o.label : r.other.cls === 'tree' ? 'A TREE' : 'SOMETHING';
        sfx.boom(Math.min(1, 0.2 + r.speed / 10));
        if (o && o.hurt && o !== heliC) o.hurt(dm.amount * 0.5, 'HIT BY THE HUEY');
        if (dm.band === 'crash') { if (piloted) killPlayerZ(`FLEW INTO ${who}`); else { D.hit(1, 'rotor'); D.hit(1, 'xmsn'); } return; }
        D.hit(dm.amount, dm.band === 'bump' ? 'skids' : undefined); tell(`HIT ${who}  -  ${(r.speed * 1.944).toFixed(0)} KT`, 1.8);
      }
    }
  }
}
function updateHeli(dt, inp, piloted) {
  const P = H.pos;
  if (piloted && Z.alive) advise(dt);
  if (!Z.alive) {   // COMMANDER: a lost Huey is gone; with the commander aboard, the next unit comes after the crew timer
    Z.deadT -= dt;
    if (Z.deadT <= 0 && !G.over && piloted && !Z.handedOn) { Z.handedOn = true; autoNext(); }
    return;
  }
  if (G.heliStowed) return;
  const M = D.mods();
  let ctl;
  if (piloted) {
    ctl = HI.read(dt, H, { trim: SY.trim, mods: M });
    drop.update(dt, ctl.raw ? { ...ctl, ...ctl.raw } : ctl, H);   // the raw stick (not the stability assist's output)
    const atHelm = helm.active; helm.update(dt, ctl.raw ? { ...ctl, ...ctl.raw } : ctl, {   // the raw stick: the assist would turn W into an attitude hold
      up: kd('Space', 'ShiftLeft'), down: kd('ControlLeft', 'KeyZ') });
    if (atHelm && !helm.active) HI.setCollective(G.heliColl ?? 0);
    if (drop.controlling || helm.active) { ctl.cx = ctl.cy = ctl.pedal = 0; ctl.fire = ctl.rocket = ctl.bomb = false; inp = { ...inp, fire: false }; ctl.coll = G.heliColl ?? 0; }   // the stick flies the dropship / canopies / ship
    else G.heliColl = ctl.coll;
    SY.starterKey = kd('Home') || !!ctl.starter;   // Home (or the HOTAS starter button): starter (hold), PgUp / PgDn: throttle twist grip
    const hp = ctl.press;   // ngc/hornethuey: HOTAS buttons for the Huey's switches (heli.js)
    if (hp && !drop.controlling && !helm.active) { if (hp.sas) doSwitch('sas'); if (hp.trim) doSwitch('trim'); if (hp.light) doSwitch('light');
      if (hp.view) { cockpitCam = !cockpitCam; if (!cockpitCam && document.pointerLockElement) document.exitPointerLock(); say(cockpitCam ? 'COCKPIT VIEW' : (chaseCam ? 'CHASE CAMERA' : 'FIXED CAMERA'), 1.2); } }
    Object.assign(ctl, SY.controls(dt, H, (kd('PageUp') ? 1 : 0) - (kd('PageDown') ? 1 : 0)));
  } else {
    ctl = Object.assign(_parkCtl, { cx: 0, cy: 0, pedal: 0, coll: 0 }); SY.starterKey = false;
    if (heliAI.phase !== 'off') {   // COMMANDER: left in the air - the crew flies her home (units/commander/heliai.js)
      Object.assign(ctl, heliAI.step(H, dt, heliAIenv));
      if (heliAI.phase === 'landed' && H.landed && H.c.coll < 0.05) { heliAI.off(); feed(`HUEY DOWN SAFELY${heliAI.dest ? ' AT ' + heliAI.dest : ''}`, 'good'); }
    }
    if (drop.active || drop.flying) drop.update(dt, ctl, H);
    Object.assign(ctl, SY.controls(dt, H, 0));
  }
  H.extraMass = G.cargo * 3;    // fuel drums from the caves
  const ev = H.step(dt, ctl, { groundY, fuel: G.fuel, water: waterAt, surfVel: war.surfVel, mods: M, surf: GR.surfAt });   // TERRAIN: skid friction by surface
  SY.update(dt, H, H.landed);
  for (const e of H.events) {
    if (!piloted) continue;
    if (e.e === 'overtemp') { D.hit(0.2, 'engine'); say('ENGINE OVERTEMP  -  EGT PAST 760°C', 2); }
    if (e.e === 'flameout' && D.engineSwitch && G.fuel > 0 && D.hp.engine > 0.05 && !SY.quick) say('FLAME-OUT  -  AUTOROTATE', 1.6);
  }
  if (H.mastBump > 0.25) { H.mastBump = 0; D.hit(0.3, 'rotor'); say('MAST BUMPING  -  LOW G: EASE THE CYCLIC, COLLECTIVE UP', 2.5); sfx.boom(0.3); }
  G.fuel = Math.max(0, G.fuel - D.update(dt));
  const fw = H.forward();
  if (piloted) {
    Z.pos.copy(H.pos); Z.vel.copy(H.vel); Z.landed = H.landed; Z.throttle = H.coll * H.rpm; Z.ctl = ctl;
    const fl = Math.hypot(fw.x, fw.z); if (fl > 0.15) Z.facing.set(fw.x / fl, fw.z / fl);
    const k = 1 - Math.exp(-6 * dt);
    Z.aimOff.x = lerp(Z.aimOff.x, -(ctl.hatX || 0) * 0.26, k); Z.aimOff.y = lerp(Z.aimOff.y, (ctl.hatY || 0) * 0.26, k);
    Z.aim.copy(fw).applyAxisAngle(H.up(), Z.aimOff.x).applyAxisAngle(_aimR.set(1, 0, 0).applyQuaternion(H.q), Z.aimOff.y);
  }
  G.fuel = Math.max(0, G.fuel - fuelBurnPct(H) * dt);   // the T53 fuel flow, scaled to the game tank (heli.js)
  if (piloted && G.fuel <= 0 && !H.landed) say('FUEL EXHAUSTED  -  AUTOROTATE AND SET DOWN SAFELY', 0.5);
  if (piloted) updateRescue(dt, H.landed, false);
  if (piloted && drop.flying) sfx.engine(drop.engineLevel()); else if (piloted && helm.active) sfx.engine(0.3); else hueySound(piloted);   // they share a mixer: one at a time
  const svc = H.landed ? serviceAt(P.x, P.z) : null; Z.svc = svc;
  if (svc) service(svc, dt, piloted);
  else if (ev === 'water') killPlayerZ('DITCHED IN THE WATER');
  else if (ev === 'rotor') killPlayerZ('ROTOR STRIKE');
  else if (ev === 'tailstrike') { D.hp.tail = 0; say('TAIL STRIKE  -  TAIL ROTOR GONE', 2.2); sfx.boom(0.5); }
  else if (ev === 'hardland') { D.hit(0.35, 'skids'); D.hit(0.15, 'xmsn'); say('HARD LANDING  -  SKIDS AND GEARBOX DAMAGED', 2); sfx.boom(0.4); }
  else if (ev === 'crash') killPlayerZ('CRASHED');
  if (!Z.alive) return;
  heliContacts(dt, piloted);   // COLLISION: the rotor disc and the fuselage against the collision world
  if (!Z.alive) return;
  // rotor downwash: dust (or spray over water) blown out radially under the disc
  if (H.agl < 20 && H.rpm > 0.5 && H.thrust > 8000) {   // the 48 ft disc throws dust (spray) out to a rotor diameter
    const gy = groundY(P.x, P.z), wet = waterAt(P.x, P.z), k = (1 - H.agl / 20) * Math.min(1, H.thrust / 40000);
    for (let i = 0; i < 4; i++) if (Math.random() < k) {
      const a = rnd(6.283), sp = rnd(10, 20), rr = rnd(2, 6);
      if (wet) fx.mix.spawn(P.x + Math.cos(a) * rr, gy + 0.3, P.z + Math.sin(a) * rr, Math.cos(a) * sp, rnd(0.5, 2.5), Math.sin(a) * sp, rnd(0.6, 1.1), 0.7, 3, .85, .92, .97, 0.4, 2, 1.4, 0.3);
      else fx.mix.spawn(P.x + Math.cos(a) * rr, gy + 0.3, P.z + Math.sin(a) * rr, Math.cos(a) * sp, rnd(0.5, 2.5), Math.sin(a) * sp, rnd(0.6, 1.2), 0.8, 3.4, .55, .48, .36, 0.45, 1.5, 1.5, 0.3);
    }
    Z.washT = (Z.washT || 0) - dt;
    if (wet && Z.washT <= 0 && k > 0.2) { Z.washT = 0.18; fx.water.add({ x: P.x, y: 0.1, z: P.z, size: 3, grow: 12, a: 0.45 * k, life: 1.1, tile: 1, pow: 1.5 }); }
  }
  if (!piloted) return;
  // weapons: door gun (F / trigger), rocket pods (G / button 3), bombs (B / button 5)
  Z.fireCd -= dt; Z.rkCd = (Z.rkCd || 0) - dt; Z.bmCd = (Z.bmCd || 0) - dt;
  if ((inp.fire || ctl.fire) && Z.fireCd <= 0) {
    Z.fireCd = 0.14; sfx.shot();
    war.fireBullet(P.clone().addScaledVector(Z.aim, 5), Z.aim.clone().multiplyScalar(75).addScaledVector(Z.vel, 0.5));
  }
  if (((kd('KeyG') && !drop.controlling) || ctl.rocket) && Z.rkCd <= 0) {
    if (G.rockets > 0) {
      Z.rkCd = 0.2; G.rockets--; Z.rkSide = -(Z.rkSide || 1);
      const p0 = P.clone().add(_rk.set(1.7 * Z.rkSide, -0.4, -0.6).applyQuaternion(H.q));
      war.fireRocket(p0, Z.aim.clone().multiplyScalar(105).add(Z.vel)); fx.flash(p0.x, p0.y, p0.z, 0.35);
    } else { Z.rkCd = 1; say('ROCKETS EMPTY  -  REARM ON THE CARRIER OR A FRIENDLY PAD', 1.4); }
  }
  if (((kd('KeyB') && !drop.controlling) || ctl.bomb) && Z.bmCd <= 0) {
    if (G.bombs > 0) { Z.bmCd = 0.45; G.bombs--; war.dropBomb(P.clone().add(_rk.set(0, -2.3, 0)), Z.vel.clone()); }
    else { Z.bmCd = 1; say('BOMBS GONE  -  REARM ON THE CARRIER OR A FRIENDLY PAD', 1.4); }
  }
  // CM: the M130 dispenser - HOTAS buttons (J binds them), then the queued program leaves the tail boom
  if (!drop.controlling && !helm.active) { const pr = CTL.state.pressed || {}; if (pr.flare) cmH.press('flare'); if (pr.chaff) cmH.press('chaff'); }
  cmH.update(dt, cmPose);
  { const hb = holeOf(P.x, P.z); if (hb && P.y < hb.h - 0.5 && Z.vel.y < 0) { enterCave(hb); return; } }
}

// ================================================================ FOUNDATION: the crafts
// Everything the player can control registers here (craft.js): the Huey (still special: the cave, the drop, the helm),
// the HORNET (craftjet.js), the soldier on foot (foot.js) and ground vehicles (vehicle.js on the ground host,
// ground.js). Wave-2 units register the same way - see docs/ngc1980/FOUNDATION.md.
const GR = createGround({ war, terrainH, holeOf, PADS, ISLANDS, CARRIER, trees: TREES, crafts, inZone, cw: CW });
// SEAWORLD: the lived-in world is solid - buildings, walls, hedges, parapets and poles collide; piers and bridge decks
// are floors; roads are road / dirt surfaces (world/solid.js, from the same generators the world is drawn from)
const worldSolid = createWorldSolid({ hf: islandH, zoneHf: terrainH, zone: () => world.zone || [] });
GR.addColliderSource((x, z, r) => worldSolid.near(x, z, r)); GR.addFloor(worldSolid.floor); GR.addStairs(worldSolid.stairAt);   // (ngc/interiors: stairs) GR.addSurface((x, z) => worldSolid.surface(x, z));
if (params.has('debug')) window.__SOLID = worldSolid;
if (params.has('debug')) { window.__DOORS = DOORS; Object.defineProperty(window, '__IN', { get: () => interiors }); Object.defineProperty(window, '__SEATS', { get: () => seats }); }   // ngc/interiors (tests)
const yawOfQ = q => { const f = _yawF.set(0, 0, -1).applyQuaternion(q); return Math.atan2(-f.x, -f.z); };
const _yawF = new THREE.Vector3();
// --- the UH-1H: its flying, HUD and cameras stay in main.js; the craft entry makes it enterable, parkable, routable
const heliC = crafts.register({
  id: 'heli', label: 'UH-1H HUEY', kind: 'air',
  // the pilot sits on the right; either cockpit door works (local: x right, y up from the CG, -z forward)
  seats: [{ id: 'pilot', label: 'PILOT', role: 'driver', doors: [[1.45, -0.8, -1.9], [-1.45, -0.8, -1.9]], exit: [2.4, HELI.SKID_Y, -1.9], reach: 2.4 }],
  present: () => Z.alive && !G.heliStowed && G.mode === 'zarch',
  frame: out => { out.x = H.pos.x; out.y = H.pos.y; out.z = H.pos.z; out.yaw = yawOfQ(H.q); return out; },
  enter: (seat, from) => {
    if (!Z.alive || G.heliStowed) return false;
    if (from === 'foot') { HI.setCollective(0); G.heliColl = 0; head.yaw = head.pitch = 0; say(H.run ? 'IN THE HUEY  -  COLLECTIVE UP TO LIFT  ·  Y GET OUT' : 'IN THE HUEY  -  I TO START THE ENGINE', 2.2); }
    if (from === 'command') {   // COMMANDER: you take her from the crew where she is (the collective where they had it)
      const air = !H.landed; heliAI.off(); HI.setCollective(air ? H.c.coll : 0); G.heliColl = air ? H.c.coll : 0; head.yaw = head.pitch = 0;
      Z.pos.copy(H.pos); Z.vel.copy(H.vel);
      say(air ? `YOU HAVE THE HUEY  -  ${Math.round(H.agl * 3.28)} FT` : H.run ? 'IN THE HUEY  -  COLLECTIVE UP TO LIFT' : 'IN THE HUEY  -  I TO START THE ENGINE', 2);
    }
    return true;
  },
  canExit: () => {
    if (G.mode !== 'zarch') return 'NOT IN A CAVE';
    if (drop.controlling || helm.active) return 'NOT WHILE YOU ARE FLYING THE DROPSHIP OR AT THE HELM';
    if (!H.landed) return 'LAND FIRST';
    const sv = war.surfVel(H.pos.x, H.pos.z), rel = Math.hypot(H.vel.x - (sv ? sv.vx : 0), H.vel.z - (sv ? sv.vz : 0));
    if (rel > 1) return 'SETTLE ON THE SKIDS FIRST';
    if (H.coll > 0.15) return 'COLLECTIVE DOWN FIRST (CTRL / Z)';
    return '';
  },
  exitSpots: () => [[2.4, HELI.SKID_Y, -1.9], [-2.4, HELI.SKID_Y, -1.9], [2.4, HELI.SKID_Y, 1.5], [-2.4, HELI.SKID_Y, 1.5]].map(p => crafts.toWorld(heliC, p)).map(w => ({ x: w.x, y: w.y, z: w.z, yaw: w.yaw - Math.PI / 2 })),
  exit: () => {
    HI.setCollective(0); G.heliColl = 0; cancelRescue(); if (bigMap) { bigMap = false; setMapSize(); }
    if (Z.alive && !G.heliStowed && !H.landed && G.mode === 'zarch') heliHome();   // COMMANDER: left in the air - the crew takes her home
  },
  update: (dt, inp) => updateHeli(dt, inp, true),
  idle: dt => updateHeli(dt, null, false),
  mass: () => 2360 + G.fuel * 6.3 + G.cargo * 3, cwClass: 'air',   // COLLISION: UH-1H empty 2,360 kg + fuel (the 209 gal tank ~ 630 kg at 100%) + cargo
  bounds: () => {   // cabin and tail boom, for walkers and vehicles bumping into a parked Huey
    if (!Z.alive || G.heliStowed) return null;
    const y = yawOfQ(H.q), c = Math.cos(y), s = Math.sin(y), y0 = H.pos.y + HELI.SKID_Y;
    heliC._b ||= [{}, {}];
    Object.assign(heliC._b[0], { x: H.pos.x + 0.3 * s, z: H.pos.z + 0.3 * c, yaw: y, hl: 2.7, hw: 1.35, y0, y1: y0 + 3.2, def: heliC });
    Object.assign(heliC._b[1], { x: H.pos.x + 6.2 * s, z: H.pos.z + 6.2 * c, yaw: y, hl: 3.4, hw: 0.45, y0: y0 + 1.1, y1: y0 + 4, def: heliC });
    return heliC._b;
  },
  pl: {
    alive: () => G.mode === 'zarch' ? Z.alive : T.alive, landed: () => G.mode === 'zarch' && Z.alive && H.landed, inCave: () => G.mode !== 'zarch',
    hitR: HELI.HIT_R, sight: 0,
  },
  hurt: (a, why) => hurtHeli(a, why),
  silence: () => { if (G.craft !== 'heli') sfx.huey?.({ nr: 0, n1: 0, load: 0, torque: 0, vib: 0, horn: false, inside: false, spd: 0, on: 0 }); },
});
// COMMANDER: what both jets get for the wingman (units/commander/wingman.js), the fleet's losses and cat 1
const jetCmd = {
  createWingman, onUnitLost: (id, why, mine) => onUnitLost(id, why, mine), catBusy: D => catBusy(D),
  aiEnv: wingmanEnv({ terrain: (x, z) => Math.max(terrainH(x, z), 0), carrier: () => war.carrier && war.carrier.sinking === undefined ? war.carrier : null, deckAt: war.deckAt, DECK: CARRIER.DECK }),
};
// --- the HORNET
const jetC = crafts.register(createJetCraft({
  JP, war, G, Z, CTL, say, feed, sfx, crafts, GR, head, advise: dt => advise(dt), serviceAt, gameOver: () => gameOver(),
  view: { get cockpit() { return cockpitCam; }, set cockpit(v) { cockpitCam = v; }, get freeLook() { return freeLook; }, locked: () => document.pointerLockElement === canvas },
  hover: () => switchHover, camZ: () => zCam, turnIntoClear: () => turnIntoClear(),
  heliOnDeck: () => { const s = Z.alive && H.landed && !G.heliStowed ? serviceAt(H.pos.x, H.pos.z) : null; return !!(s && s.deck); },
  stowHeli: () => stowHeli(), unstowHeli: () => unstowHeli(), spotHeli: () => spotHeli(), heliStowed: () => G.heliStowed,
  toHeli: msg => autoNext(msg), ...jetCmd,   // COMMANDER: after a lost jet the next unit (the Huey unless you pick); the wingman, losses, cat 1
}));
// --- the TOMCAT (crafttomcat.js): the same hooks as the HORNET, taken with 8 from the ALBATROSS deck
const tomcatC = crafts.register(createTomcatCraft({
  playCtx: jetPlayCtx, war, G, Z, CTL, say, feed, sfx, crafts, GR, head, advise: dt => advise(dt), gameOver: () => gameOver(),
  view: { get cockpit() { return cockpitCam; }, set cockpit(v) { cockpitCam = v; }, get freeLook() { return freeLook; }, locked: () => document.pointerLockElement === canvas },
  hover: () => switchHover, camZ: () => zCam, turnIntoClear: () => turnIntoClear(),
  heliOnDeck: () => { const s = Z.alive && H.landed && !G.heliStowed ? serviceAt(H.pos.x, H.pos.z) : null; return !!(s && s.deck); },
  stowHeli: () => stowHeli(), unstowHeli: () => unstowHeli(), spotHeli: () => spotHeli(), heliStowed: () => G.heliStowed,
  toHeli: msg => autoNext(msg), ...jetCmd,   // COMMANDER: after a lost jet the next unit (the Huey unless you pick); the wingman, losses, cat 1
}));
// --- ON FOOT
const foot = crafts.register(createFootCraft({
  scene: zScene, GR, crafts, war, fx, sfx, say, keyDown: kd, groundEnv: GR, camera: () => zCam,
  invulnerable: () => !!G.bench,
  onDeath: why => { G.crewDownT = 3.5; feed(`CREW LOST  -  ${why}`, 'bad'); onUnitLost('marine', why, true); },   // COMMANDER: a Marine lost; the next unit after the crew timer
}));
// wave 2 (ngc/foot2): the real 1980 Marine on that craft (marine.js): rifleman, medical, inventory, viewmodel, sound
const marine = foot.setMarine(createMarine({
  scene: zScene, GR, war, fx, sfx, say, feed, keyDown: kd, crafts, canvas, hudEl: $('hud'), terrainH, ISLANDS,
  serviceAt: (x, z) => serviceAt(x, z), active: () => G.craft === 'foot' && G.state === 'play' && G.mode === 'zarch',
  use: (x, y, z, yaw) => interiors.use(x, y, z, yaw), useHint: (x, y, z, yaw) => interiors.useHint(x, y, z, yaw),   // ngc/interiors: F opens doors and hatches
}));
// SEALIFE (ngc/waterfish, units/naval/sealife.js): fish round the camera that flee ships, wash, swimmers and blasts; the
// sea bed and the view from under the surface. The player's own disturbances come from here (the AI's from war.units).
const _slF = {};
const sealife = createSeaLife({
  scene: zScene, uniforms: terrainUni, terrain, sky, fx, war, depthAt: terrainH, isWater, cell: TG, canvas,
  active: () => G.mode === 'zarch' && camB < 0.01,
  heightPx: () => renderer.domElement.height,
  extra: S => {
    if (G.craft === 'heli' && Z.alive && !G.heliStowed && H.agl < 25 && waterAt(H.pos.x, H.pos.z)) S.point(H.pos.x, 0, H.pos.z, 8 + 14 * (1 - H.agl / 25), Math.min(1, H.thrust / 40000) * (1.1 - H.agl / 25), 0, 0, 2 + 3 * (1 - H.agl / 25));   // the Huey's downwash
    if (G.craft === 'foot' && foot.exists) { const f = foot.frame(_slF); if (f.y < 0.3 && isWater(f.x, f.z)) S.point(f.x, f.y + 0.6, f.z, 4.5, 0.65, 0, 0, 2.5); }   // a man in the water
  },
});
// --- ground vehicles (ngc/wheeledgame): the WHEELED M151A2s, M35A2s and civilian cars, through units/wheeled/motorpool.js
const vehCtx = {
  scene: zScene, GR, crafts, war, fx, sfx, say, feed, keyDown: kd, CTL, hwOn: () => !keyboardOnly, camZ: () => zCam,
  crewHit: (a, why, at) => foot.hurt(a, why, null),
  crewKilled: why => { say(`${why}  -  CREW KILLED`, 2.5); G.crewDownT = 3.5; feed(`CREW LOST  -  ${why}`, 'bad'); onUnitLost('marine', why, true); },
  unitLost: (def, why) => onUnitLost(rosterIdOf(def), why, false),   // COMMANDER: a vehicle destroyed (its crew's fate comes through crewKilled / bail-out)
};
const pool = createMotorPool({ ...vehCtx, foot, marine, world, ISLANDS, G, Z, terrainH, hover: () => switchHover, getInOut: () => getInOut(), serviceAt: (x, z) => serviceAt(x, z), selIsl: () => selIsl,
  holes: BASES.map(b => ({ x: b.x, z: b.z, r: HOLE_R + 0.6 })) });
void createVehicleCraft;   // (vehicle.js stays the host for tracked units)
// --- ARMOUR (wave 2, units/armor/): the M60A3 TTS and the M113A2 on their tracked-vehicle sim. armorworld.js is their
// ground (the terrain, roads and bridges, ship decks and the LCM-8, the sea, trees / houses / AA sites / crafts to push
// against), armorcraft.js the craft (seats at the hatches, interiors, sights, gunnery through war.js, damage, sound).
const AW = createArmorWorld({
  terrainH, ships: () => war.units, deckY: (x, z) => war.deckY(x, z), shipAt: (x, z) => war.shipAt(x, z), shipAlive: u => war.units.includes(u) && !(u.sinking > 4),
  roadAt: (x, z) => world.roadAt ? world.roadAt(x, z) : null, pads: PADS.filter(p => !p.isl.cave).map(p => ({ x: p.x, z: p.z, r: 26 })).concat(PADS.filter(p => p.isl.cave).map(p => ({ x: p.x, z: p.z, r: 20 }))),
  holes: BASES.map(b => ({ x: b.x, z: b.z, r: HOLE_R })), trees: TREES, structs: function* () { for (const I of ISLANDS) if (I.structs) yield* I.structs; },
  items: () => world.zone.flatMap(e => e.items), surface: (x, z) => inGrid(x, z) ? SURFACE[zoneSurf(x, z)].soil : null,   // TERRAIN: the islands' soils
  bounds: skip => crafts.bounds(skip), hitTest: (x, y, z) => war.hitTest(x, y, z, 1, 0.2),   // COLLISION: (these two had been swallowed by the comment above since TERRAIN: tanks drove through parked crafts)
  cw: CW,   // COLLISION: light crafts are shoved aside, the ground war's machines and men are obstacles / shoved
  onFell: (t, dx, dz, i) => fellTree(t, dx, dz, i),
});
function fellTree(t, dx, dz, i = t.i) {   // lay a pushed-over tree down along the push (COLLISION: and out of the collision world)
  if (t.down) return; t.down = true; if (t.body) CW.enable(t.body, false);
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); TREES.mesh.getMatrixAt(i, m4); m4.decompose(p, q, s);
  q.setFromAxisAngle(new THREE.Vector3(dz, 0, -dx).normalize(), 1.35); TREES.mesh.setMatrixAt(i, m4.compose(p, q, s)); TREES.mesh.instanceMatrix.needsUpdate = true;
}
const armCtx = { ...vehCtx, hover: () => switchHover, AW, SG: createSight({ canvas }), ground: (x, z) => Math.max(terrainH(x, z), war.deckY(x, z)), isWater, bail: def => { if (crafts.active === def) getInOut(); } };
const m60C = crafts.register(createArmorCraft(armCtx, 'm60'));
const m113C = crafts.register(createArmorCraft(armCtx, 'm113'));
// ngc/interiors: the rooms of the lived-in world (built near the camera), the barracks huts, the ALBATROSS's hangar deck
// and island; a passenger seat in the Huey's cabin or a CH-46 (the RIDE craft), the people seen in the seats
const interiors = createInteriors({ scene: zScene, GR, war, worldSolid, sfx, say, terrainH, holeOf, ISLANDS });
const seats = createSeats({ scene: zScene, crafts, war, foot, say, heli: { def: heliC, obj: () => shipMesh, landed: () => Z.alive && H.landed, vel: H.vel }, jet: { def: jetC, model: JP.model, P: JP } });
const armDelivery = createArmorDelivery({ scene: zScene, AW, terrainH, hards: HARDS, beach: (I, tw) => GR.beach(I, tw), blocked: (x, z) => !GR.clearAt(x, z, 2.5), fx, sfx, say, feed, camZ: () => zCam });
crafts.setActive('heli');
crafts.onSwitch = (from, to) => {
  if (to.kind === 'foot' || to.kind === 'ground') { if (bigMap) { bigMap = false; setMapSize(); } }   // a click captures the mouse (as in the cockpits)
  else if (document.pointerLockElement && !cockpitCam) document.exitPointerLock();
  head.yaw = head.pitch = 0;
};
// Y: get out of whatever you are in (if it lets you), or into the nearest door when on foot
function getInOut() {
  if (G.mode !== 'zarch' || G.over || G.state !== 'play') return;
  const a = crafts.active;
  if (a === foot) {
    if (!foot.alive) return;
    const W = foot.W, d = crafts.nearestDoor(W.x, W.y + 1, W.z, 2.6);
    if (!d) { say('NOTHING TO GET INTO HERE  -  WALK UP TO A DOOR', 1.5); return; }
    if (crafts.control(d.def.id, d.seat, 'foot')) sfx.ui?.('select');
    return;
  }
  const why = a.canExit(); if (why) { say(why, 1.8); return; }
  const spots = a.exitSpots ? a.exitSpots() : [];
  if (!foot.spawnAt(spots)) { say('NO ROOM TO GET OUT HERE', 1.5); return; }
  crafts.control('foot', 0, a.id);
  say(`OUT OF THE ${a.label}  -  Y BY A DOOR TO GET BACK IN`, 2);
}
// the Huey goes down to the hangar (a jet takes the deck) / comes back up / is spotted on deck with nobody in it
function heliOnDeckNow() { const s = Z.alive && H.landed && !G.heliStowed ? serviceAt(H.pos.x, H.pos.z) : null; return !!(s && s.deck); }
function stowHeli() { G.heliStowed = true; shipMesh.visible = false; shipShadow.visible = false; sfx.engine(0); cancelRescue(); }
function unstowHeli() { G.heliStowed = false; shipMesh.visible = true; }
function spotHeli() { G.heliStowed = false; const z = Z.pos.clone(), v = Z.vel.clone(), f = Z.facing.clone(); resetZarch(true); Z.pos.copy(z); Z.vel.copy(v); Z.facing.copy(f); }
// back into a fresh helicopter on the carrier (or the home pad): after a lost jet, a lost crew, a pick-up from the menu
function toHeli(msg) {
  { const a = crafts.active; if (a && a !== heliC && a !== foot && a.present()) a.exit(heliC); }   // COMMANDER: the unit you leave carries on (the wingman) or parks
  if (foot.exists) foot.exit();
  JP.active && !JP.alive && JP.stow(); tomcatC.TP.active && !tomcatC.TP.alive && tomcatC.TP.stow();   // TOMCAT
  G.heliStowed = false; G.fuel = 100; G.cargo = 0; D.reset(); G.rockets = ROCKETS_MAX; G.bombs = BOMBS_MAX; G.crewDownT = 0; cmH.reset();
  resetZarch(true); crafts.setActive('heli'); crafts.onSwitch(null, heliC);
  if (msg) say(msg, 2.5);
}
// title screen / new game: everyone back in the hangar, the player in the helicopter
function stowCrafts() { JP.stow(); jetC.park.on = false; tomcatC.TP.stow(); tomcatC.park.on = false; if (foot.exists) foot.exit(); G.heliStowed = false; G.crewDownT = 0; crafts.setActive('heli'); crafts.silence(); }
// a new war: the TEST CAR waits at the home island's motor pool (else on the carrier deck)
function placeVehicles() {
  pool.newGame();   // ngc/wheeledgame: M151s and M35s at every friendly motor pool and on the deck park
  // ARMOUR: the M60A3 waits at the top of the home island's landing beach (TERRAIN: was the hard), the M113A2 on the ALBATROSS's forward deck park (cold, parked)
  armDelivery.clear();
  const hh = HARDS.find(h => h.I === HOME_B.isl), hp = hh && hh.at(hh.u1 - 5), ts = hp ? { x: hp[0], z: hp[1], yaw: hh.yaw } : GR.motorPool(HOME_B.isl, 4.6); if (ts) m60C.spawnAt(ts); else m60C.stow();   // (on the concrete just below the top, nose inland: past the top it stood on mud and slid)
  const as = GR.deckSpot(2) || GR.motorPool(HOME_B.isl, 3.6); if (as) m113C.spawnAt(as); else m113C.stow();
}
// ARMOUR: 8 / 9 - an LCM-8 from the amphibious group lands an M113A2 (30 materiel) / an M60A3 TTS (60) on the beach of the
// selected friendly island (else the nearest one to you). The vehicle's crew drives it off and up the beach.
const COST_ARMOUR = { m113: 30, m60: 60 };
function deliverArmour(kind) {
  const def = kind === 'm60' ? m60C : m113C, cost = COST_ARMOUR[kind];
  if (crafts.active === def) { say(`YOU ARE IN THE ${def.label}`, 1.2); return; }
  if (armDelivery.busy(def)) { say(`THE ${def.label} IS ALREADY ON ITS WAY IN`, 1.6); return; }
  if (G.mat < cost) { say(`AN ${def.label} NEEDS ${cost} MATERIEL`, 1.6); return; }
  let I = selIsl && selIsl.owner === 1 && !selIsl.cave ? selIsl : null;
  if (!I) { let bd = 1e9; for (const J of ISLANDS) if (J.owner === 1) { const d = Math.hypot(J.pad.x - Z.pos.x, J.pad.z - Z.pos.z); if (d < bd) { bd = d; I = J; } } }
  if (!I) { say('NO FRIENDLY ISLAND TO LAND ON', 1.6); return; }
  const tw = war.carrier ? [war.carrier.p.x, war.carrier.p.z] : null;
  let r = armDelivery.start(def, I, tw);
  if (!r.ok && I !== HOME_B.isl) { const why = r.why; r = armDelivery.start(def, HOME_B.isl, tw); if (r.ok) feed(`${why}  -  LANDING AT HOME ISLAND INSTEAD`); }   // most islands are cliffs: the home beach always takes a boat
  if (!r.ok) { say(r.why, 2); return; }
  G.mat -= cost; say(`LCM-8 WITH AN ${def.label} INBOUND TO ${r.run.pl.beach.name}`, 2.5); sfx.dock();
}
// 7 (ngc/wheeledgame): the motor pool - then 1 = an M151A2 slung in by a CH-46 (10 materiel), 2 = an M35A2 run in by an
// LCM-8 (20), to the selected friendly island (else the nearest friendly island, else the carrier deck)
function deliverVehicle(type = 'm151') { return pool.deliver(type); }
let motorPick = 0;
function motorChoice() { motorPick = 3; say('MOTOR POOL  -  1: M151A2 BY CH-46 (10 MATERIEL)  ·  2: M35A2 BY LCM-8 (20)', 3); }
function motorKey(code) { if (motorPick <= 0 || (code !== 'Digit1' && code !== 'Digit2')) return false; motorPick = 0; deliverVehicle(code === 'Digit2' ? 'm35' : 'm151'); return true; }
// ================================================================ COMMANDER
// The player commands TASK FORCE ALBATROSS: any unit can be taken out at the carrier or a friendly island from the
// command board (\, units/commander/board.js), units already out are a key away (/), and the unit you leave carries
// on - the Huey's crew flies her home (heliai.js), the jets' wingman flies CAP and traps (wingman.js), vehicles park,
// a Marine you leave goes back to the barracks. Lives are the fleet's reserves (fleet.js): losing a unit costs the
// fleet; the war is lost when the fleet is spent.
const ALIVE_HELI = () => Z.alive && G.mode === 'zarch';
const groundDead = def => !!(def.dead || def.wrecked);
const rosterIdOf = def => def === heliC ? 'heli' : def === jetC ? 'jet' : def === tomcatC ? 'tomcat' : def === m60C ? 'm60' : def === m113C ? 'm113' : def === foot ? 'marine' : def && def.T && def.T.mil ? def.type : def && def.id;
// where something is, in words for the board
function whereIs(x, z) {
  const c = war.carrier;
  if (c && c.sinking === undefined && war.shipAt(x, z) === c) return 'ON THE ALBATROSS';
  let best = null, bd = 1e9; for (const I of ISLANDS) { if (!I.pad) continue; const d = Math.hypot(I.pad.x - x, I.pad.z - z); if (d < bd) { bd = d; best = I; } }
  if (best && bd < 140) return `AT ${best.name}`;
  if (c && c.sinking === undefined) { const d = Math.hypot(x - c.p.x, z - c.p.z); return `${Math.round(d)} m ${bearing(x - c.p.x, z - c.p.z)} OF THE ALBATROSS`; }
  return 'IN THE FIELD';
}
function commandBases() {
  const out = [], c = war.carrier;
  if (c && c.sinking === undefined) out.push({ key: 'ship', kind: 'ship', name: 'ALBATROSS', x: c.p.x, z: c.p.z });
  for (const I of ISLANDS) if (I.owner === 1 && I.pad) out.push({ key: I.name, kind: 'island', name: I.name, I, x: I.pad.x, z: I.pad.z });
  return out;
}
// spots: a clear deck park on the ALBATROSS (r = the vehicle's half length), a motor pool spot, a pad
function deckSpotFor(def, r) { for (let k = 0; k < 7; k++) { const s = GR.deckSpot(k); if (s && GR.clearAt(s.x, s.z, r, def)) return s; } return null; }
function padSpot(I) { const p = I.pad; return { x: p.x, z: p.z, y: groundY(p.x, p.z), yaw: Math.atan2(p.x, p.z) }; }
function marineSpots(b) {
  if (b.kind === 'ship') { const out = []; for (let k = 0; k < 5; k++) { const s = GR.deckSpot(k); if (s) out.push({ x: s.x, y: s.y, z: s.z, yaw: s.yaw }); } return out; }
  const p = b.I.pad, out = [];
  for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6, x = p.x + Math.cos(a) * (p.r + 3), z = p.z + Math.sin(a) * (p.r + 3); if (!holeOf(x, z) && terrainH(x, z) > 0.5) out.push({ x, y: terrainH(x, z), z, yaw: Math.atan2(x - p.x, z - p.z) + Math.PI }); }
  return out;
}
// the Huey left in the air: the crew flies to the nearest of the ALBATROSS's aft spot and the friendly pads
function heliHome() {
  const c = war.carrier, cands = [];
  if (c && c.sinking === undefined) cands.push({ name: 'THE ALBATROSS', x: c.p.x, z: c.p.z, ship: true });
  for (const I of ISLANDS) if (I.owner === 1 && I.pad && !I.cave) cands.push({ name: I.name, x: I.pad.x, z: I.pad.z, I });
  if (HOME_B.isl.owner === 1) cands.push({ name: HOME_B.name, x: PAD.x, z: PAD.z, I: HOME_B.isl });
  let best = null, bd = 1e9; for (const k of cands) { const d = Math.hypot(k.x - H.pos.x, k.z - H.pos.z) * (k.ship ? 0.8 : 1); if (d < bd) { bd = d; best = k; } }   // (the deck a little preferred: fuel and the crew)
  const T = { x: H.pos.x, y: 0, z: H.pos.z, vx: 0, vz: 0, hdg: null };
  heliAI.engage(H, () => {
    const cc = war.carrier;
    if (best && best.ship) { if (cc && cc.sinking === undefined) { const s = spawnSpot(); return Object.assign(T, { x: s.x, y: s.y, z: s.z, vx: cc.v.x, vz: cc.v.z, hdg: -cc.yaw }); } best = null; }
    if (best && best.I) { const p = best.I.pad; return Object.assign(T, { x: p.x, y: groundY(p.x, p.z), z: p.z, vx: 0, vz: 0, hdg: null }); }
    return Object.assign(T, { y: Math.max(terrainH(T.x, T.z), 0), vx: 0, vz: 0 });   // nowhere to go: down where it is
  });
  heliAI.dest = best ? best.name : '';
  feed(`HUEY: THE CREW IS FLYING HER TO ${best ? best.name : 'THE NEAREST CLEARING'}`, 'info');
}
// the Huey: take her where she is (from the crew, or up from the hangar), or a new one from the reserve at a base
function switchHeli() {
  if (!ALIVE_HELI()) return 'THE HUEY IS LOST';
  if (G.heliStowed) { spotHeli(); if (G.heliStowed) return 'NO DECK TO SPOT HER ON'; }
  return crafts.control('heli', 0, 'command') ? '' : 'CANNOT REACH THE HUEY';
}
function deployHeli(b) {
  G.heliStowed = false; G.fuel = 100; G.cargo = 0; D.reset(); G.rockets = ROCKETS_MAX; G.bombs = BOMBS_MAX; cmH.reset(); G.mode = 'zarch'; T.alive = true;
  resetZarch(true, b.kind === 'island' ? padSpot(b.I) : null); shipMesh.visible = true;
  return crafts.control('heli', 0, 'command') ? '' : 'THE HUEY WOULD NOT TAKE A CREW';
}
// cat 1 is one catapult for both jets
function catBusy(D) {
  const o = D === jetC ? tomcatC : jetC; if (!o.present()) return '';
  const A = o === jetC ? JP.J : tomcatC.TP.A;
  return A.cat || (o.park.on && o.park.cat) ? `CAT 1 IS BUSY  -  THE ${o.label} IS ON IT (SWITCH TO IT AND LAUNCH, OR STAND IT DOWN)` : '';
}
function groundRow(id, def, r) {
  return {
    id, label: def.label,
    out: () => def.present() && !groundDead(def), active: () => crafts.active === def && !groundDead(def),
    status: () => { const f = def.frame({}); return `${crafts.active === def ? 'YOU ARE DRIVING' : def.driver && def.driver.state === 'driving' ? 'DRIVING' : 'PARKED'} ${whereIs(f.x, f.z)}`; },
    can: () => '',
    deploy: b => {
      const sp = b.kind === 'ship' ? deckSpotFor(def, r) : GR.motorPool(b.I, r);
      if (!sp) return `NO ROOM FOR THE ${def.label} AT ${b.name}`;
      def.spawnAt(sp); return crafts.control(def.id, 0, 'command') ? '' : `THE ${def.label} WOULD NOT TAKE A CREW`;
    },
    switchTo: () => crafts.control(def.id, 0, 'command') ? '' : `CANNOT REACH THE ${def.label}`,
    canStandDown: () => crafts.active !== def && def.present() && !groundDead(def) && atBase(def),
    standDown: () => { if (!atBase(def)) return `THE ${def.label} MUST BE AT A BASE TO STAND DOWN`; def.stow(); return ''; },
  };
}
function atBase(def) { const f = def.frame({}), w = whereIs(f.x, f.z); return w === 'ON THE ALBATROSS' || (w.startsWith('AT ') && ISLANDS.some(I => I.owner === 1 && `AT ${I.name}` === w)); }
function jetRow(id, def, A, P) {
  return {
    id, label: def.label === 'HORNET' ? 'F/A-18A HORNET' : 'F-14A TOMCAT',
    out: () => def.present(), active: () => crafts.active === def && P.alive && !P.ejected,
    status: () => { const s = def.status(); return s === 'PARKED ON DECK' || s === 'FLYING' ? `${s === 'FLYING' ? 'FLYING' : 'PARKED'} ${whereIs(A.pos.x, A.pos.z)}` : `${s}  ·  ${Math.round(A.pos.y * 3.28)} FT  ·  FUEL ${Math.round(A.fuel * 2.2)} LB`; },
    can: () => catBusy(def),
    deploy: () => def.launch({ command: true }) ? '' : `THE ${def.label} COULD NOT BE SPOTTED ON CAT 1`,
    switchTo: () => crafts.control(def.id, 0, 'command') ? '' : `CANNOT REACH THE ${def.label}`,
    recall: () => def.wing ? (def.recall(), '') : `THE ${def.label} IS NOT ON CAP`,
    canStandDown: () => crafts.active !== def && def.park.on,
    standDown: () => { if (!def.park.on) return 'ONLY A JET PARKED ON THE DECK STANDS DOWN'; P.stow(); def.park.on = false; return ''; },
  };
}
// the WHEELED motor pool (units/wheeled/motorpool.js): several of a type can be out (every friendly island stocks
// them); the board switches you to the nearest one, takes a new one out with the pool's spawner, stands one down
function wheeledRow(type, r) {
  const outList = () => pool.list.filter(V => V.type === type && V.exists && !V.wrecked && V.owner !== 'civ');
  const nearest = (x, z) => { let best = null, bd = 1e9; for (const V of outList()) { const d = Math.hypot(V.sim.pos[0] - x, V.sim.pos[2] - z); if (d < bd) { bd = d; best = V; } } return best; };
  const mine = () => crafts.active && crafts.active.type === type && pool.list.includes(crafts.active) ? crafts.active : null;
  const parkedAtBase = () => outList().find(V => V !== crafts.active && atBase(V));
  return {
    id: type, label: fleet.type(type).label, multi: true,
    out: () => outList().length > 0, outCount: () => outList().length, active: () => !!mine() && !mine().wrecked,
    status: () => { const a = mine(), n = outList().length, V = a || nearest(Z.pos.x, Z.pos.z); if (!V) return ''; return `${n > 1 ? n + ' OUT  ·  ' : ''}${a ? 'YOU ARE DRIVING' : 'NEAREST PARKED'} ${whereIs(V.sim.pos[0], V.sim.pos[2])}`; },
    can: () => '',
    deploy: b => {
      const V = pool.spawners[type](b.kind === 'ship' ? 'deck' : b.I); if (!V) return `NO ROOM FOR AN ${fleet.type(type).label} AT ${b.name}`;
      return crafts.control(V.id, 0, 'command') ? '' : `THE ${V.label} WOULD NOT TAKE A CREW`;
    },
    switchTo: () => { const V = nearest(Z.pos.x, Z.pos.z); if (!V) return `NO ${fleet.type(type).short} OUT`; return crafts.control(V.id, 0, 'command') ? '' : `CANNOT REACH THE ${V.label}`; },
    canStandDown: () => !!parkedAtBase(),
    standDown: () => { const V = parkedAtBase(); if (!V) return `NO ${fleet.type(type).short} PARKED AT A BASE`; pool.remove(V); return ''; },
  };
}
const roster = [
  { id: 'heli', label: 'UH-1H HUEY', out: ALIVE_HELI, active: () => crafts.active === heliC && Z.alive,
    status: () => G.heliStowed ? 'IN THE HANGAR ON THE ALBATROSS' : crafts.active === heliC ? `${H.landed ? 'ON THE SKIDS' : 'FLYING'} ${whereIs(H.pos.x, H.pos.z)}` : heliAI.phase !== 'off' && heliAI.phase !== 'landed' ? `CREW FLYING HER TO ${heliAI.dest}` : H.landed ? `PARKED ${whereIs(H.pos.x, H.pos.z)}` : `HOVERING ${whereIs(H.pos.x, H.pos.z)}`,
    can: () => '', deploy: b => deployHeli(b), switchTo: () => switchHeli() },
  jetRow('jet', jetC, JP.J, JP),
  jetRow('tomcat', tomcatC, tomcatC.TP.A, tomcatC.TP),
  groundRow('m60', m60C, 4.8),
  groundRow('m113', m113C, 3.6),
  wheeledRow('m151', 2.4),
  wheeledRow('m35', 3.6),
  { id: 'marine', label: 'MARINE RIFLEMAN', out: () => crafts.active === foot && foot.exists && foot.alive, active: () => crafts.active === foot && foot.alive,
    status: () => `ON FOOT ${whereIs(foot.W.x, foot.W.z)}`, can: () => '',
    deploy: b => {
      if (!foot.spawnAt(marineSpots(b), { fresh: true })) return 'NO ROOM TO PUT A MARINE DOWN THERE';
      if (!crafts.control('foot', 0, 'command')) return 'THE MARINE IS NOT READY';
      foot.fromReserve = true; return '';
    },
    switchTo: () => '' },
];
const rosterOut = id => { const r = roster.find(r => r.id === id); return !!(r && r.out()); };
function checkSpent() { if (!G.over && G.state === 'play' && fleet.spent(rosterOut)) { feed('THE FLEET IS SPENT', 'bad'); gameOver(); } }
const nextLabel = () => ALIVE_HELI() || fleet.has('heli') ? 'THE HUEY' : (roster.find(r => r.out() && !r.active()) || { label: 'NOTHING' }).label;
// a unit is lost: the fleet counts it; the one you were in opens the board on the next unit
function onUnitLost(id, why, mine) {
  const t = fleet.type(id); if (!t) return;
  fleet.lose(id, why);
  if (id === 'marine') foot.fromReserve = false;
  checkSpent();
  if (mine && !G.over && G.state === 'play') commander.onLoss(`${t.short} LOST${why ? '  -  ' + why : ''}`, nextLabel());
}
// the hand-on after a loss (the crew timers in the crafts): the Huey where she is, else a new one from the reserve,
// else any unit that is out, else the board - unless the commander is already choosing on it
function autoNext(msg) {
  if (G.over) return;
  if (commander.holdAuto()) return;
  commander.lossMode = false; commander.close(); clearHandOn();
  if (roster.some(r => r.active())) return;   // still in a working unit (an armour crewman down, not the tank)
  if (ALIVE_HELI() && crafts.active !== heliC) { const w = switchHeli(); if (!w) { say(msg ? msg.replace(/HELICOPTER/, 'HUEY') : 'IN THE HUEY', 2.5); return; } }
  if (!Z.alive && fleet.take('heli')) { toHeli(msg || (war.carrier && war.carrier.sinking === undefined ? 'NEW CREW  -  A NEW HUEY ON THE ALBATROSS' : 'NEW CREW  -  A NEW HUEY ON THE HOME PAD')); return; }
  const r = roster.find(r => r.out() && !r.active()); if (r && !r.switchTo()) { say(`${r.label}  -  ${r.status()}`, 2.5); return; }
  checkSpent(); if (G.over) return;
  commander.open('NO HUEY LEFT  -  PICK YOUR NEXT UNIT');
}
function clearHandOn() {   // the commander picked a unit: no automatic hand-on later
  G.crewDownT = 0; G.jetDownT = 0; G.tomcatDownT = 0; Z.handedOn = true;
  if (JP.active && !JP.alive) JP.stow(); if (tomcatC.TP.active && !tomcatC.TP.alive) tomcatC.TP.stow();
}
const commander = createCommander({
  fleet, say, feed, sfx, hud: $('hud'), roster, bases: commandBases, store: PSTORE,
  here: () => Z.pos, mat: () => G.mat, fuelStores: () => G.res,
  onOpen: () => { if (document.pointerLockElement) document.exitPointerLock(); if (bigMap) { bigMap = false; setMapSize(); } },
  picked: () => clearHandOn(),
  closedWhileLost: () => autoNext(),
  // a Marine you leave (and who came from the reserve) goes back to the barracks
  leaving: () => ({ foot: crafts.active === foot && foot.exists && foot.alive && foot.fromReserve }),
  left: tok => { if (tok && tok.foot && crafts.active !== foot) { fleet.give('marine'); foot.fromReserve = false; feed('THE RIFLEMAN IS BACK WITH HIS PLATOON  -  MARINES IN RESERVE +1', 'info'); } },
});
function commandKey(code) {   // \ the board, / the next unit out (main's keydown, before the craft's own keys)
  if (code !== 'Backslash' && code !== 'IntlBackslash' && code !== 'Slash') return false;
  if (G.mode !== 'zarch') { say('CLIMB OUT OF THE CAVE FIRST', 1.4); return true; }
  if (code === 'Slash') commander.next(); else commander.toggle();
  return true;
}
// the per-frame entry for the surface: the active craft flies / drives / walks, the parked ones idle (craft.js)
function updateZarch(dt, inp) {
  inp.pad = G.craft === 'heli' || isJet() ? null : G.craft === 'foot' ? readGamepad() : readPad(); inp.keyboardOnly = keyboardOnly;   // on foot: a game controller only, never the HOTAS
  crafts.update(dt, inp);
  armDelivery.update(dt);   // ARMOUR: landing craft under way
  if (G.crewDownT > 0) { G.crewDownT -= dt; if (G.crewDownT <= 0 && !G.over) autoNext(war.carrier && war.carrier.sinking === undefined ? 'NEW CREW  -  IN THE HELICOPTER ON THE ALBATROSS' : 'NEW CREW  -  ON THE HOME PAD'); }   // COMMANDER: the next unit
}
function refuelAtBase() {
  sfx.dock(); sfx.engine(0);
  if (G.fuel < 99) say('REFUELLED', 1.5);
  G.fuel = 100;
}

// ================================================================ THRUST
const T_THRUST = 17, T_ROT = 3.4, ROPE = 4.2, PODM = 0.35, T_VIEWH = 30;
const T = { spin: 0, guide: 0, base: null, lvl: null, w: 0, ge: 0, onPad: false, yawF: -Math.PI / 2, face: 1, roll: 0, zOff: 0, q0: new THREE.Quaternion(), qLast: new THREE.Quaternion(), x: 0, y: 0, vx: 0, vy: 0, ang: 0, landed: true, alive: true, deadT: 0, fireCd: 0, pod: null, bullets: [], tb: [], parts: [], turrets: [], tanks: [], cam: new THREE.Vector2(), beamOn: false, thrOn: 0, hadPod: false };
const podMesh = makePod(), rope = makeRope();
const beam3 = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5.8, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x66ffee, transparent: true, opacity: 0.22, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
let caveGroup = null, tPartCloud = null, tBulCloud = null;
const caveToWorld = (x, y, out, b = T.base) => out.set(b.x + (x - CAVE_OX) * CS, b.h - CAVE_SINK + (y - T.lvl.H) * CS, b.z);
const sol = (x, y) => { const L = T.lvl; if (x < 0 || x >= L.W || y < 0) return 1; if (y >= L.H) return 0; return L.solid[Math.floor(y) * L.W + Math.floor(x)]; };
const isPad = (x, y) => { const L = T.lvl; if (x < 0 || x >= L.W || y < 0 || y >= L.H) return false; return L.pad[Math.floor(y) * L.W + Math.floor(x)] === 1; };

// Build every base's cave once: each base has its own procedurally generated cave (level.js, seeded by the base name,
// so the same island always has the same cave) and its own turrets/tanks/pod state, so a looted
// tank stays empty and a destroyed turret stays dead. The home cave is friendly: no turrets, a big reservoir tank and
// a blue intake pad where carried fuel is pumped into the reservoir.
const CARGO_MAX = 100;
function buildCaves() {
  const t0 = performance.now();
  BASES.forEach(b => {
    const L = b.L = buildLevel(b.tier, b.name, { home: b.kind === 'home' });
    const grp = b.group = new THREE.Group(); grp.scale.setScalar(CS); grp.position.set(b.x - CAVE_OX * CS, b.h - CAVE_SINK - L.H * CS, b.z); zScene.add(grp);
    const mesh = buildCaveMesh(L, { depth: CAVE_DEPTH }); grp.add(mesh);
    const dyn = new THREE.Group(); grp.add(dyn);
    b.st = { turrets: [], tanks: [], pod: null, podTaken: false };
    if (b.kind === 'home') {
      mesh.traverse(o => { if (o.isMesh && o.material.color && o.material.color.getHex() === 0x1abf59) { o.material = o.material.clone(); o.material.color.setHex(0x2a7fff); o.material.emissive.setHex(0x0a2a70); } });
      const res = makeTank(); res.scale.setScalar(2.2); res.position.set(L.tanks[1].x, L.padTop + 1.8, -1); dyn.add(res); b.resTank = res;
      b.st.pod = { x: -99, y: -99, vx: 0, vy: 0, attached: false }; b.st.podTaken = true;
    } else {
      b.st.turrets = L.turrets.map(t => ({ ...t, cd: rnd(0.5, 2), alive: true, ang: 0, mesh: null }));
      b.st.tanks = L.tanks.map(t => ({ ...t, mesh: null, max: t.fuel }));
      for (const t of b.st.turrets) { t.mesh = makeTurret(); t.mesh.position.set(t.x, t.y, 0); dyn.add(t.mesh); }
      for (const t of b.st.tanks) { t.mesh = makeTank(); t.mesh.position.set(t.x, t.y, 0); dyn.add(t.mesh); }
      b.st.pod = { x: L.orb.x, y: L.orb.y, vx: 0, vy: 0, attached: false };
    }
  });
  PROF.caves = performance.now() - t0;
  useCave(BASES[0]);
}
function useCave(b) {   // point the shared cave state + effects at base b
  T.base = b; T.lvl = b.L; caveGroup = b.group;
  T.turrets = b.st.turrets; T.tanks = b.st.tanks; T.pod = b.st.pod;
  if (!tPartCloud) { tPartCloud = new Cloud(caveGroup, 1600, 1.0, true); tBulCloud = new Cloud(caveGroup, 300, 1.9, true); }
  caveGroup.add(podMesh, rope.obj, beam3, tPartCloud.obj, tBulCloud.obj);
  T.bullets.length = 0; T.tb.length = 0; T.parts.length = 0;
}
function restockBase(b) {   // an enemy cave fortress gets its garrison, fuel and command pod back
  for (const t of b.st.turrets) { t.alive = true; t.mesh.visible = true; }
  for (const t of b.st.tanks) { t.fuel = t.max; t.mesh.userData.bar.scale.y = 1; }
  Object.assign(b.st.pod, { x: b.L.orb.x, y: b.L.orb.y, vx: 0, vy: 0, attached: false }); b.st.podTaken = false;
}
function resetBases() { for (const b of BASES) if (b.kind === 'enemy') restockBase(b); }   // new game
// Fly into the shaft from the surface: the same ship carries on, locked to the cave plane.
function enterCave(b) {
  useCave(b); T.caveT = 0;
  const L = T.lvl, P = Z.pos;
  G.mode = 'thrust';
  T.x = (P.x - b.x) / CS + CAVE_OX; T.y = (P.y - b.h + CAVE_SINK) / CS + L.H; T.vx = Z.vel.x / CS; T.vy = Z.vel.y / CS;
  T.vy = Math.max(T.vy, -5); T.vx = clamp(T.vx, -2, 2); T.guide = 1.2; T.q0.copy(shipMesh.quaternion);
  { const u = H.up(); T.ang = clamp(Math.atan2(u.x, u.y), -0.3, 0.3); } T.w = 0; T.zOff = P.z - b.z; T.landed = false; T.alive = true; T.thrOn = Z.throttle;
  T.face = Z.facing.x < 0 ? -1 : 1; T.yawF = -T.face * Math.PI / 2;
  say(b.kind === 'home' ? 'HOME BASE  -  LAND ON THE BLUE PAD TO UNLOAD FUEL' : b.isl.owner === 1 ? `${b.name}  -  OURS NOW, THE GARRISON HAS GONE` : `${b.name} (${TIER_NAMES[b.tier]})  -  STEAL THE POD TO TAKE THE ISLAND`, 3);
}
// Climb out of the shaft: hand the ship back to the 3D flight model with its momentum.
function exitCave() {
  const had = T.pod.attached;
  if (had) { addScore(1500); say('POD STOLEN  -  THE ISLAND IS OURS', 2.5); sfx.dock(); T.base.st.podTaken = true; war.setOwner(T.base.isl, 1, 'POD STOLEN'); }
  else say('BACK ON THE SURFACE', 1.5);
  T.pod.attached = false;
  caveToWorld(T.x, T.y, Z.pos); Z.vel.set(T.vx * CS, T.vy * CS, 0);
  H.pos.copy(Z.pos); H.vel.copy(Z.vel); H.q.copy(T.qLast); H.w.set(0, 0, 0); H.landed = false;
  Z.facing.set(T.face, 0); Z.landed = false; Z.alive = true; Z.throttle = T.thrOn;
  G.mode = 'zarch';
}
// COMMANDER: the Huey is gone and there is none in reserve: out of the cave view with no helicopter (the pod drops back)
function leaveCaveDead() {
  if (T.pod && T.pod.attached) Object.assign(T.pod, { attached: false, x: T.lvl.orb.x, y: T.lvl.orb.y, vx: 0, vy: 0 });
  G.mode = 'zarch'; Z.alive = false; Z.handedOn = true; heliAI.off(); shipMesh.visible = false; shipShadow.visible = false; sfx.engine(0);
}
// after a crash anywhere: a fresh helicopter, cold on the home pad. A pod on the line drops back where it came from.
function respawnHome() {
  if (T.pod && T.pod.attached) Object.assign(T.pod, { attached: false, x: T.lvl.orb.x, y: T.lvl.orb.y, vx: 0, vy: 0 });
  T.alive = true; T.landed = false; G.fuel = 100; G.cargo = 0; D.reset();
  G.mode = 'zarch'; resetZarch(true); say('NEW HELICOPTER ON THE HOME PAD', 2);
}
function shipPts() {
  // helicopter outline in cave cells (0.7 scale): nose, tail, rotor tips, then the two skid ends (which may touch down)
  const s = Math.sin(T.ang), c = Math.cos(T.ang), f = T.face;
  return [[1.7 * f, 0.1], [-2.6 * f, 0.5], [-1.65, 1.0], [1.65, 1.0], [0.9 * f, -0.75], [-0.9 * f, -0.75]].map(([lx, ly]) => [T.x + lx * c + ly * s, T.y - lx * s + ly * c]);
}
function crashThrust(why) {
  cancelRescue();
  if (!T.alive) return;
  T.alive = false; T.deadT = 2.2; shipMesh.visible = false;
  explode(T.parts, T.x, T.y, 0, 90, 14, true); sfx.boom(1); sfx.engine(0); say(why, 2);
  onUnitLost('heli', why, false);   // COMMANDER: the fleet loses the Huey; the next one comes out of the reserve (below)
}
function los(ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 0.4);
  for (let i = 1; i < n; i++) { const t = i / n; if (sol(ax + (bx - ax) * t, ay + (by - ay) * t)) return false; }
  return true;
}

// Door gun in the cave swivels: the POV hat points it in 8 directions and fires while held; otherwise it follows the mouse
// cursor (click fires) while the mouse is in use, else it points along the nose.
const _mray = new THREE.Raycaster();
function caveAim(ctl) {
  let ax = T.face * Math.cos(T.ang), ay = -T.face * Math.sin(T.ang);
  T.hatFire = false; T.aimSrc = 'nose';
  if (ctl.hatX || ctl.hatY) { const l = Math.hypot(ctl.hatX, ctl.hatY); ax = ctl.hatX / l; ay = ctl.hatY / l; T.hatFire = true; T.aimSrc = 'hat'; }
  else if (!document.pointerLockElement && (mouseFire || performance.now() - mouseAimT < 3000)) {
    _mray.setFromCamera(mouseNdc, zCam); const o = _mray.ray.origin, d = _mray.ray.direction, b = T.base;
    const t = Math.abs(d.z) > 1e-4 ? (b.z - o.z) / d.z : -1;
    if (t > 0) {
      const dx = (o.x + d.x * t - b.x) / CS + CAVE_OX - T.x, dy = (o.y + d.y * t - b.h + CAVE_SINK) / CS + T.lvl.H - T.y, l = Math.hypot(dx, dy);
      if (l > 0.8) { ax = dx / l; ay = dy / l; T.aimSrc = 'mouse'; }
    }
  }
  T.aimX = ax; T.aimY = ay;
}
function updateThrust(dt, inp) {
  const L = T.lvl;
  if (!T.alive) {   // COMMANDER: crashed in a cave - a new Huey from the reserve on the home pad, else back out to the fleet
    T.deadT -= dt;
    if (T.deadT <= 0 && !G.over) { if (fleet.take('heli')) respawnHome(); else { leaveCaveDead(); autoNext(); } }
    stepParts(T.parts, dt); return;
  }
  const ctl = HI.read(dt); Z.ctl = ctl;
  const M = D.mods();
  SY.starterKey = kd('Home'); Object.assign(ctl, SY.controls(dt, H, (kd('PageUp') ? 1 : 0) - (kd('PageDown') ? 1 : 0)));
  // the same rotor and engine, in axial flight: climb speed and the rock under the skids (ground effect) -> thrust / weight
  const zr = T.ge > 0 ? HELI.ROTOR_R * (0.55 + (1 - T.ge) * 1.5) : Infinity;
  const tw = T.landed && ctl.coll < 0.05 ? 0 : H.axial(dt, ctl, { mods: M, fuel: G.fuel }, T.landed ? 0 : T.vy * CS, zr);
  if (T.landed && ctl.coll < 0.05) H.axial(dt, ctl, { mods: M, fuel: G.fuel }, 0, HELI.ROTOR_R * 0.55);
  SY.update(dt, H, T.landed);
  G.fuel = Math.max(0, G.fuel - D.update(dt));
  const auth = H.rpm * H.rpm * M.lift, thr = Math.max(0, tw), beam = !!ctl.winch;
  T.spin = M.tail === 0 && H.driven ? H.torque / 40 : 0;   // no tail rotor: the airframe spins (visual) and the disc wanders
  T.thrOn = H.coll * H.rpm; T.beamOn = beam;
  hueySound();
  T.fireCd -= dt; T.caveT += dt;
  caveAim(ctl);
  if ((inp.fire || ctl.fire || T.hatFire) && T.fireCd <= 0) {
    T.fireCd = 0.15; sfx.shot();
    T.bullets.push({ x: T.x + T.aimX * 2, y: T.y + T.aimY * 2, vx: T.aimX * 26 + T.vx * .5, vy: T.aimY * 26 + T.vy * .5, life: 1.4 });
  }
  const n = Math.ceil(dt / (1 / 240)), h = dt / n, pod = T.pod;
  for (let it = 0; it < n && T.alive; it++) {
    const lift = thr * 7;   // the cave's gravity is 7 cells/s2: thrust / weight 1 = hover
    if (T.guide > 0) { T.guide -= h; T.landed = false; T.x += (CAVE_OX - T.x) * Math.min(1, 5 * h); T.vx *= 1 - Math.min(1, 4 * h); T.ang *= 1 - Math.min(1, 3 * h); }   // the funnel lines you up on the shaft
    if (T.landed) { if (lift > 7) { T.landed = false; T.onPad = false; } else { T.vx = T.vy = 0; T.w = 0; T.ang *= 0.9; break; } }
    {   // disc tilt rate follows the cyclic; stability assist levels it hands-off
      let want = ctl.cx * HELI.RATE.roll; if (ctl.sas && M.hydOk) want += -T.ang * 1.6 * (1 - Math.min(1, Math.abs(ctl.cx) * 2.5));
      T.w += ((want - T.w) * HELI.RESP * auth * M.hyd + T.spin * Math.sin(performance.now() * 0.004) * 2.2) * h; T.ang += T.w * h;
    }
    if (pod.attached) { pod.len = Math.max(ROPE, pod.len - 3 * h); pod.grace = Math.max(0, pod.grace - h); }
    let ax = Math.sin(T.ang) * lift, ay = Math.cos(T.ang) * lift - 7;
    if (pod.attached) {
      const dx = pod.x - T.x, dy = pod.y - T.y, d = Math.hypot(dx, dy) || 1;
      let pax = 0, pay = -7;
      if (d > pod.len) {
        const nx = dx / d, ny = dy / d, rv = (pod.vx - T.vx) * nx + (pod.vy - T.vy) * ny;
        const f = Math.min(40, Math.max(0, 60 * (d - pod.len) + 3 * rv));
        ax += nx * f * PODM; ay += ny * f * PODM; pax -= nx * f; pay -= ny * f;
      }
      pod.vx += pax * h; pod.vy += pay * h;
      const ox = pod.x, oy = pod.y; pod.x += pod.vx * h; pod.y += pod.vy * h;
      let hit = false; for (let k = 0; k < 8 && !hit; k++) { const a = k / 8 * Math.PI * 2; if (sol(pod.x + Math.cos(a) * .7, pod.y + Math.sin(a) * .7)) hit = true; }
      if (hit) { pod.x = ox; pod.y = oy; pod.vx *= -0.3; pod.vy *= -0.3; pod.scrape = 0.3; }
    }
    T.vx += (ax - T.vx * 0.05) * h; T.vy += (ay - T.vy * 0.05) * h; T.x += T.vx * h; T.y += T.vy * h;
    // ground effect: how close the skids are to rock below (0..1)
    T.ge = 0; for (let d = 0.5; d < 4; d += 0.5) if (sol(T.x, T.y - 0.8 - d)) { T.ge = 1 - d / 4; break; }
    const pts = shipPts(); let bad = null, skid = false;
    for (let i = 0; i < pts.length; i++) {
      if (!sol(pts[i][0], pts[i][1])) continue;
      if (i >= 4) skid = true; else bad = i >= 2 ? 'ROTOR STRIKE' : 'CRASHED';
    }
    if (T.guide > 0) { bad = null; skid = false; }   // no wall strikes or rim landings while the funnel lines you up
    if (bad) { crashThrust(bad); break; }
    if (skid) {   // a helicopter can set down on any ledge; only the pad refuels
      if (T.vy > -4 && Math.abs(T.vx) < 3.5 && Math.abs(T.ang) < 0.4) { T.y -= T.vy * h; T.vx = T.vy = 0; T.w = 0; T.landed = true; T.onPad = pts.slice(4).some(p => isPad(p[0], p[1] - 0.05)); }
      else if (T.vy > -7 && Math.abs(T.vx) < 6 && Math.abs(T.ang) < 0.7) { T.y -= T.vy * h; T.vx = T.vy = 0; T.w = 0; T.landed = true; D.hit(0.35, 'skids'); D.hit(0.15, 'xmsn'); say('HARD LANDING  -  SKIDS AND GEARBOX DAMAGED', 2); }
      else { crashThrust('HARD LANDING'); break; }
    }
    if (T.y > L.H + 1) { exitCave(); return; }
  }
  if (!T.alive) return;
  updateRescue(dt, T.landed, true);
  if (T.landed && T.onPad && T.base.kind === 'home') {
    const unload = Math.min(G.cargo, 30 * dt, RES_MAX - G.res); G.cargo -= unload; G.res += unload;
    const fill = Math.min(G.res, 25 * dt, 100 - G.fuel); G.res -= fill; G.fuel += fill;
    if (D.damaged()) D.repair(0.25 * dt);
    if (unload > 0) { T.unloaded = (T.unloaded || 0) + unload; if (G.cargo <= 0.01) { say(`FUEL UNLOADED  -  RESERVOIR ${Math.round(G.res)}`, 2); addScore(Math.round(T.unloaded * 5)); T.unloaded = 0; } }
  }
  if (Math.abs(T.vx) > 1.5) T.face = Math.sign(T.vx);
  if (thr > 0.1) {
    const s = Math.sin(T.ang), c = Math.cos(T.ang);
    // rotor downwash kicks dust off the rock below when close (ground effect range)
    if (T.ge > 0) { let gy = T.y - 0.8; while (!sol(T.x, gy) && gy > T.y - 5) gy -= 0.25;
      for (let i = 0; i < 2; i++) { const d = Math.random() < 0.5 ? -1 : 1; emit(T.parts, T.x + d * rnd(0.3, 1.5), gy + 0.4, 0, d * rnd(5, 10), rnd(0.3, 1.5), 0, 0.5, .55, .48, .38, 2); } }
  }
  G.fuel = Math.max(0, G.fuel - fuelBurnPct(H) * dt);
  if (beam && G.fuel > 0) {
    G.fuel = Math.max(0, G.fuel - 0.8 * dt);
    const bx = T.x - Math.sin(T.ang) * 3.5, by = T.y - Math.cos(T.ang) * 3.5, BR = 5.5;
    if (!pod.attached && Math.hypot(pod.x - bx, pod.y - by) < BR) { pod.attached = true; pod.len = Math.max(ROPE, Math.hypot(pod.x - T.x, pod.y - T.y)); pod.grace = 0; T.hadPod = true; addScore(500); sfx.pickup(); say('POD SECURED  -  GET OUT!', 2.5); }
    for (const tk of T.tanks) if (tk.fuel > 0 && Math.hypot(tk.x - bx, tk.y - by) < BR) {
      const toCargo = Math.min(tk.fuel, 30 * dt, CARGO_MAX - G.cargo), toTank = Math.min(tk.fuel - toCargo, 30 * dt - toCargo, 100 - G.fuel);
      const take = toCargo + Math.max(0, toTank); tk.fuel -= take; G.cargo += toCargo; G.fuel += Math.max(0, toTank);
      if (take > 0 && tk.fuel <= 0.01) say('TANK DRAINED  -  TAKE IT HOME', 1.5);
      tk.mesh.userData.bar.scale.y = Math.max(0.01, tk.fuel / tk.max);
      if (take > 0) emit(T.parts, tk.x, tk.y, 0, (T.x - tk.x) * 2, (T.y - tk.y) * 2, 0, 0.4, .3, 1, .5, 0);
    }
  }
  for (let i = T.bullets.length - 1; i >= 0; i--) {
    const b = T.bullets[i]; b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
    let dead = b.life <= 0 || sol(b.x, b.y);
    if (!dead) for (const t of T.turrets) if (t.alive && Math.hypot(t.x - b.x, t.y - b.y) < 1.0) {
      t.alive = false; t.mesh.visible = false; explode(T.parts, t.x, t.y, 0, 40, 9, true); sfx.boom(0.6); addScore(100); dead = true; break;
    }
    if (dead) { if (b.life > 0) explode(T.parts, b.x, b.y, 0, 5, 4, true); T.bullets[i] = T.bullets[T.bullets.length - 1]; T.bullets.pop(); }
  }
  for (const t of T.turrets) {
    if (!t.alive) continue;
    const dx = T.x - t.x, dy = T.y - t.y, d = Math.hypot(dx, dy);
    t.ang = Math.atan2(dy, dx);
    t.cd -= dt;
    if (d < 18 && t.cd <= 0 && los(t.x, t.y, T.x, T.y)) {
      t.cd = 3.1 - T.base.tier * 0.3 + rnd(0.8); sfx.enemyShot();
      const lead = d / 10, ax = T.x + T.vx * lead * .4 - t.x, ay = T.y + T.vy * lead * .4 - t.y, al = Math.hypot(ax, ay) || 1;
      T.tb.push({ x: t.x + ax / al * 1.2, y: t.y + ay / al * 1.2, vx: ax / al * 10, vy: ay / al * 10, life: 4 });
    }
  }
  for (let i = T.tb.length - 1; i >= 0; i--) {
    const b = T.tb[i]; b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
    let dead = b.life <= 0 || sol(b.x, b.y);
    if (!dead && T.alive && Math.hypot(b.x - T.x, b.y - T.y) < 1.2) { dead = true; hurtHeli(0.16, 'HIT'); }
    if (dead) { T.tb[i] = T.tb[T.tb.length - 1]; T.tb.pop(); }
  }
  stepParts(T.parts, dt);
}
// ================================================================ flow
function gameOver() {
  G.over = true;
  commander.close();
  setTimeout(() => { if (G.over) showEnd('DEFEAT', 'THE FLEET IS SPENT'); }, 2500);   // COMMANDER: no unit in reserve, none left out there
}
function startTransition(label, swap) { G.state = 'trans'; G.tr = { t: 0, phase: 0, swap }; $('fadeText').textContent = label; }
function newGame() {
  cancelRescue(); D.reset(); stowCrafts(); G.jetDownT = 0; G.tomcatDownT = 0;
  fleet.reset(); commander.close(); commander.lossMode = false; foot.fromReserve = false; heliAI.off();   // COMMANDER: a full fleet in reserve
  G.score = 0; G.fuel = 100; G.visit = 0; G.mode = 'zarch'; G.over = false; G.state = 'play';
  G.res = 250; G.mat = 90; G.rockets = ROCKETS_MAX; G.bombs = BOMBS_MAX; G.cargo = 0; cmH.reset(); selIsl = null; feedItems.length = 0; G.advT = 12;
  fx.clear(); war.reset(); resetBases(); fog.reset(); fog.enabled = !params.has('nofog'); resetZarch(true); placeVehicles();
  $('title').style.display = 'none'; $('title').querySelector('h1').textContent = 'THRUST / ZARCH'; $('result').textContent = '';
  say('ROTOR SPOOLING  -  RAISE COLLECTIVE TO LIFT', 3);
  feed('COMMAND: TAKE THE ISLANDS BEFORE THE ENEMY DOES  -  M FOR THE MAP  ·  \\ COMMAND BOARD'); feed('THE ENEMY CARRIER KRAKEN IS SOMEWHERE NORTH-EAST');
}
function pressStart() { if (G.state === 'title') newGame(); }

// Pause menu (Esc / P): resume, call a repair drop, or abandon the helicopter and start again on the carrier - the way
// out of any stuck state (set down broken somewhere logistics can't help, wedged in a cave, out of fuel at sea).
const menu = { items: [], sel: 0 };
// SEAWORLD: the sea state slider and the weather drift switch (in every variant of the menu)
const seaItems = () => [{ id: 'sea', label: 'SEA STATE', slider: true }, { id: 'seadrift', label: `WEATHER DRIFT: ${SEA_PREF.drift ? 'ON' : 'OFF'}`, note: SEA_PREF.drift ? 'THE SEA WANDERS UP TO 2 STATES ROUND YOUR CHOICE OVER THE WAR' : 'THE SEA STAYS WHERE YOU SET IT' }];
function menuItems() {
  if (isJet()) return [   // flying the Hornet (or the TOMCAT): no logistics; 'respawn' writes the jet off and puts you back in the helicopter
    { id: 'resume', label: 'RESUME' },
    { id: 'logistics', label: 'CALL LOGISTICS', note: 'JETS ARE SERVICED ON THE ALBATROSS DECK', off: true },
    { id: 'respawn', label: 'BACK TO THE ALBATROSS', note: G.craft === 'tomcat' ? `WRITES OFF THIS TOMCAT (${G.tomcats} LEFT IN THE HANGAR)  -  YOU GO BACK TO THE HELICOPTER` : `WRITES OFF THIS HORNET (${G.jets} LEFT IN THE HANGAR)  -  YOU GO BACK TO THE HELICOPTER`, off: G.over },
    { id: 'command', label: 'COMMAND BOARD', note: 'TAKE OUT OR SWITCH TO ANY UNIT OF THE FLEET  ·  \\ IN THE GAME', off: G.over || G.mode !== 'zarch' },   // COMMANDER
    { id: 'fov', label: 'COCKPIT FOV', slider: true }, ...seaItems(),
    { id: 'quit', label: 'QUIT TO TITLE', note: 'ENDS THIS WAR' },
  ];
  if (G.craft !== 'heli') return [   // on foot or in a ground vehicle: a pick-up back to the helicopter, nothing written off
    { id: 'resume', label: 'RESUME' },
    { id: 'logistics', label: 'CALL LOGISTICS', note: 'FOR THE HELICOPTER  -  GET BACK IN IT FIRST', off: true },
    { id: 'respawn', label: 'PICK-UP TO THE ALBATROSS', note: 'THE CREW IS FLOWN BACK AND THE HELICOPTER RECOVERED TO THE DECK', off: G.over || G.crewDownT > 0 },
    { id: 'command', label: 'COMMAND BOARD', note: 'TAKE OUT OR SWITCH TO ANY UNIT OF THE FLEET  ·  \\ IN THE GAME', off: G.over || G.mode !== 'zarch' },   // COMMANDER
    { id: 'fov', label: 'COCKPIT FOV', slider: true }, ...seaItems(),
    { id: 'quit', label: 'QUIT TO TITLE', note: 'ENDS THIS WAR' },
  ];
  const alive = G.mode === 'zarch' ? Z.alive : T.alive, landed = G.mode === 'zarch' ? H.landed : T.landed, home = war.carrier && war.carrier.sinking === undefined ? 'THE ALBATROSS' : 'THE HOME PAD';
  const last = G.lives <= 0, lastAll = last && fleet.spent(id => id !== 'heli' && rosterOut(id));   // COMMANDER: the war is lost only with the fleet
  return [
    { id: 'resume', label: 'RESUME' },
    { id: 'logistics', label: 'CALL LOGISTICS', note: G.rescue ? `INBOUND  -  ${rescueStatus()}` : landed ? (G.mode === 'zarch' ? 'A DROPSHIP FLIES OUT A PARA REPAIR TEAM' : 'FUEL DROP AND FIELD REPAIR WHERE YOU ARE') : 'LAND FIRST', off: !alive || !landed || !!G.rescue },
    { id: 'respawn', label: `RESPAWN ON ${home}`, note: lastAll ? 'THIS IS THE FLEET\'S LAST UNIT  -  ABANDONING IT LOSES THE WAR' : last ? 'NO HUEY IN RESERVE  -  THE CREW COMES HOME AND YOU PICK ANOTHER UNIT' : `ABANDON THIS HELICOPTER  -  COSTS ONE (${G.lives} IN RESERVE)`, off: !alive || G.over },
    { id: 'command', label: 'COMMAND BOARD', note: 'TAKE OUT OR SWITCH TO ANY UNIT OF THE FLEET  ·  \\ IN THE GAME', off: G.over || G.mode !== 'zarch' },   // COMMANDER
    { id: 'fov', label: 'COCKPIT FOV', slider: true }, ...seaItems(),
    { id: 'quit', label: 'QUIT TO TITLE', note: 'ENDS THIS WAR' },
  ];
}
function openMenu() {
  if (G.state !== 'play') return;
  commander.close();   // COMMANDER: the board steps aside (after a loss the hand-on goes ahead)
  G.state = 'paused'; menu.sel = 0; if (document.pointerLockElement) document.exitPointerLock();
  if (bigMap) { bigMap = false; setMapSize(); }
  sfx.engine(0); crafts.silence(); armDelivery.silence(); say('', 0);   /* ARMOUR: the landing craft's diesels */  renderMenu(); $('menu').classList.add('on');
}
function closeMenu() { $('menu').classList.remove('on'); if (G.state === 'paused') G.state = 'play'; menu.confirm = null; }
function renderMenu() {
  menu.items = menuItems();
  $('menuSub').textContent = `SCORE ${G.score}  ·  FLEET ${fleet.total()} IN RESERVE (HUEYS ${Math.max(0, G.lives)}  HORNETS ${G.jets}  TOMCATS ${G.tomcats})  ·  LOSSES ${fleet.losses()}  ·  ${G.craft !== 'heli' && crafts.active.menuNote ? crafts.active.menuNote() : `FUEL ${Math.round(G.fuel)}%`}`;
  const box = $('menuItems'); box.textContent = '';
  menu.items.forEach((it, i) => {
    if (it.slider) {   // COCKPIT FOV, SEA STATE: drag, or LEFT / RIGHT while it's selected
      const S = SLIDERS[it.id], d = document.createElement('div'); d.className = 'slider' + (i === menu.sel ? ' sel' : '');
      d.innerHTML = `<span>${it.label}  <b>${S.show(S.get())}</b></span><input type="range" min="${S.min}" max="${S.max}" step="1" value="${S.get()}"><small>${S.small}</small>`;
      const r = d.querySelector('input'), val = d.querySelector('b'); r.oninput = () => { S.set(+r.value); val.textContent = S.show(S.get()); };
      d.onmouseenter = () => { menu.sel = i; for (const [k, c] of [...box.children].entries()) c.classList.toggle('sel', k === i); };
      box.appendChild(d); return;
    }
    const b = document.createElement('button'); b.disabled = !!it.off; b.className = i === menu.sel ? 'sel' : '';
    const conf = menu.confirm === it.id;
    b.innerHTML = (conf ? `${it.label}?  PRESS AGAIN TO CONFIRM` : it.label) + (it.note ? `<small>${it.note}</small>` : '');
    b.onmouseenter = () => { if (!it.off) { menu.sel = i; for (const [k, c] of [...box.children].entries()) c.classList.toggle('sel', k === i); } };
    b.onclick = () => { menu.sel = i; menuPick(); };
    box.appendChild(b);
  });
}
function menuKey(e) {
  const n = menu.items.length;
  if (e.code === 'Escape' || e.code === 'KeyP') { closeMenu(); return; }
  if (['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS'].includes(e.code)) {
    const d = ['ArrowUp', 'KeyW'].includes(e.code) ? -1 : 1;
    for (let k = 0; k < n; k++) { menu.sel = (menu.sel + d + n) % n; if (!menu.items[menu.sel].off) break; }
    menu.confirm = null; renderMenu(); sfx.ui?.('select');
  }
  const it = menu.items[menu.sel];
  if (it && it.slider && ['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) { const S = SLIDERS[it.id]; S.set(S.get() + (['ArrowLeft', 'KeyA'].includes(e.code) ? -S.nudge : S.nudge)); renderMenu(); sfx.ui?.('select'); return; }
  if (e.code === 'Enter' || e.code === 'Space') menuPick();
}
function menuPick() {
  const it = menu.items[menu.sel]; if (!it || it.off || it.slider) return;
  sfx.ui?.('select');
  if ((it.id === 'respawn' || it.id === 'quit') && menu.confirm !== it.id) { menu.confirm = it.id; renderMenu(); return; }
  if (it.id === 'resume') closeMenu();
  else if (it.id === 'logistics') { closeMenu(); callLogistics(); }
  else if (it.id === 'seadrift') { setSeaDrift(!SEA_PREF.drift); renderMenu(); }   // SEAWORLD
  else if (it.id === 'respawn') { closeMenu(); abandonHeli(); }
  else if (it.id === 'command') { closeMenu(); commander.open(); }   // COMMANDER
  else if (it.id === 'quit') { closeMenu(); quitToTitle(); }
}
// SEAWORLD: U at a lift's console on the ALBATROSS's deck edge (or standing / parked on the lift) sends it up or down
function liftConsole() {
  const c = war.carrier; if (!c || c.sinking !== undefined || !c.parts.lifts) return false;
  const [lx, lz] = GR.toLocal(c, Z.pos.x, Z.pos.z), yl = Z.pos.y - c.p.y;
  for (const L of c.parts.lifts) {
    const atConsole = Math.hypot(lx - L.con.lx, lz - L.con.lz) < 3 && Math.abs(yl - 8) < 2.5, onIt = c.parts.liftAt(lx, lz) === L && Math.abs(yl - L.y) < 2.5;
    if (!atConsole && !onIt) continue;
    const dir = c.parts.lift(L.i); say(`LIFT ${L.i + 1} ${dir === 'down' ? 'GOING DOWN TO THE HANGAR DECK' : 'COMING UP TO THE FLIGHT DECK'}`, 2); sfx.ui?.('select');
    return true;
  }
  return false;
}
// the crew is picked up and the airframe written off; a fresh helicopter waits on the carrier
function abandonHeli() {
  // COMMANDER: a written-off unit is the fleet's loss; the way back is the Huey (recovered to the deck, or a new one
  // from the reserve), else another unit that is out, else the command board
  if (G.craft === 'jet') { jetC.writeOff(); fleet.lose('jet', 'WRITTEN OFF'); feed('HORNET WRITTEN OFF', 'bad'); backToHuey('BACK ON THE ALBATROSS  -  IN THE HELICOPTER'); return; }
  if (G.craft === 'tomcat') { tomcatC.writeOff(); fleet.lose('tomcat', 'WRITTEN OFF'); feed('TOMCAT WRITTEN OFF', 'bad'); backToHuey('BACK ON THE ALBATROSS  -  IN THE HELICOPTER'); return; }   // TOMCAT
  if (G.craft !== 'heli') { if (crafts.active === foot && foot.alive && foot.fromReserve) { fleet.give('marine'); foot.fromReserve = false; } backToHuey('PICKED UP  -  BACK IN THE HELICOPTER ON THE ALBATROSS'); return; }
  cancelRescue();
  if (G.mode !== 'zarch' ? !T.alive : !Z.alive) return;
  if (G.mode === 'zarch') fx.explode(Z.pos.x, Z.pos.y, Z.pos.z, 1.2, { debris: 4, color: 0x55613d });
  fleet.lose('heli', 'ABANDONED');
  if (!fleet.take('heli')) {
    leaveCaveDead(); T.alive = false; say('HUEY ABANDONED  -  NONE IN RESERVE', 2);
    checkSpent(); if (G.over) return;
    const r = roster.find(r => r.out() && !r.active()); if (r && !r.switchTo()) return;
    commander.open('THE HUEY IS ABANDONED  -  PICK YOUR NEXT UNIT'); return;
  }
  respawnHome(); G.rockets = ROCKETS_MAX; G.bombs = BOMBS_MAX;
  say(war.carrier && war.carrier.sinking === undefined ? 'CREW RECOVERED  -  NEW HELICOPTER ON THE ALBATROSS' : 'CREW RECOVERED  -  NEW HELICOPTER ON THE HOME PAD', 2.5);
}
function backToHuey(msg) {   // COMMANDER: the Huey as she is recovered to the deck (free), or a new one from the reserve
  if (ALIVE_HELI() || fleet.take('heli')) { toHeli(msg); return; }
  clearHandOn(); const r = roster.find(r => r.out() && !r.active()); if (r && !r.switchTo()) return;
  checkSpent(); if (!G.over) commander.open('NO HUEY LEFT  -  PICK YOUR NEXT UNIT');
}
function quitToTitle() { cancelRescue(); G.over = true; showEnd('THRUST / ZARCH', 'WAR ABANDONED'); }

// ---------------------------------------------------------------- hud / render
const radar = $('radar').getContext('2d');
function setMapSize() {
  const c = $('radar'); c.classList.toggle('big', bigMap);
  c.width = bigMap ? innerWidth : 150; c.height = bigMap ? innerHeight : 150;
}
addEventListener('resize', () => { if (bigMap) setMapSize(); });
// The map: the sea and islands, the fog of war (black where never seen, dim where not watched now), islands as you
// last saw them, your units always, enemy units only inside your sight. The big map (M) is the command screen.
const landImg = (() => {
  const N = 320, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const h = terrainH(-BOUND + (i + 0.5) * 2 * BOUND / N, -BOUND + (j + 0.5) * 2 * BOUND / N), k = (j * N + i) * 4;
    let col;
    if (h <= 0) { const d = clamp(-h / 10, 0, 1); col = [lerp(28, 8, d), lerp(92, 34, d), lerp(118, 78, d)]; }
    else {   // TERRAIN: sand, rock, grass by what the ground is
      const sf = zoneSurf(-BOUND + (i + 0.5) * 2 * BOUND / N, -BOUND + (j + 0.5) * 2 * BOUND / N), t = clamp((h - 6) / 28, 0, 1);
      col = sf === 'sand' || sf === 'wetsand' ? [188, 172, 120] : sf === 'rock' || sf === 'shingle' ? [128, 122, 112] : sf === 'mud' || sf === 'marsh' ? [86, 92, 58] : [lerp(48, 96, t), lerp(118, 112, t), lerp(50, 66, t)];
    }
    im.data[k] = col[0]; im.data[k + 1] = col[1]; im.data[k + 2] = col[2]; im.data[k + 3] = 255;
  }
  x.putImageData(im, 0, 0); return c;
})();
const fogImg = document.createElement('canvas'); fogImg.width = fogImg.height = fog.N;
const fogCtx = fogImg.getContext('2d'), fogData = fogCtx.createImageData(fog.N, fog.N);
function updateFogImg() {
  const d = fogData.data;
  for (let k = 0; k < fog.N * fog.N; k++) { const e = fog.enabled ? fog.exp[k] : 1, v = fog.enabled ? fog.vis[k] : 1; d[k * 4] = 4; d[k * 4 + 1] = 8; d[k * 4 + 2] = 16; d[k * 4 + 3] = (1 - e) * 240 + e * (1 - v) * 110; }
  fogCtx.putImageData(fogData, 0, 0);
}
const shipName = u => ({ battleship: 'LEVIATHAN', freighter: 'CONTAINER SHIP' }[u.type] || (u.side === 1 ? 'ALBATROSS' : 'KRAKEN'));
const KIND_TAG = { hq: 'HQ', fortress: 'C', fuel: 'F', factory: 'M', radar: 'R' };
const OWN_COL = ['#e8e4d0', '#4cf', '#f54'];
let mapView = null;
const _mapF = { x: 0, y: 0, z: 0, yaw: 0 };
function drawMap() {
  const W = radar.canvas.width, Hh = radar.canvas.height; radar.clearRect(0, 0, W, Hh);
  const big = bigMap, half = big ? Math.min(W, Hh - 120) * 0.47 / BOUND : 72 / 260, cx = W / 2, cy = big ? (Hh - 60) / 2 : Hh / 2;
  const ox = big ? 0 : Z.pos.x, oz = big ? 0 : Z.pos.z;
  const px = x => cx + (x - ox) * half, py = z => cy + (z - oz) * half;
  mapView = { half, cx, cy, ox, oz };
  radar.save();
  if (!big) { radar.beginPath(); radar.arc(cx, cy, 74, 0, 6.283); radar.clip(); }
  else { radar.fillStyle = 'rgba(2,8,16,.88)'; radar.fillRect(0, 0, W, Hh); }
  radar.imageSmoothingEnabled = true;
  if (!big) { radar.fillStyle = 'rgb(10,38,74)'; radar.fillRect(0, 0, W, Hh); if (farMap.ready) radar.drawImage(farMap.cv, px(farMap.ox), py(farMap.oz), farMap.size * half, farMap.size * half); }
  radar.drawImage(landImg, px(-BOUND), py(-BOUND), 2 * BOUND * half, 2 * BOUND * half);
  radar.drawImage(fogImg, px(-BOUND), py(-BOUND), 2 * BOUND * half, 2 * BOUND * half);
  radar.strokeStyle = 'rgba(255,220,120,.5)'; radar.lineWidth = 1; radar.setLineDash([4, 4]); radar.strokeRect(px(-BOUND), py(-BOUND), 2 * BOUND * half, 2 * BOUND * half); radar.setLineDash([]);   // the control zone
  if (big) { radar.fillStyle = 'rgba(255,220,120,.8)'; radar.font = 'bold 12px monospace'; radar.textAlign = 'left'; radar.fillText('CONTROL ZONE', px(-BOUND) + 6, py(-BOUND) + 16); }
  // islands, as last seen
  for (const I of ISLANDS) {
    if (!fog.exploredAt(I.x, I.z) && !fog.exploredAt(I.pad.x, I.pad.z)) continue;
    const X = px(I.pad.x), Y = py(I.pad.z), own = I.seen, col = own < 0 ? '#999' : OWN_COL[own], r = big ? 10 : 5;
    radar.strokeStyle = col; radar.fillStyle = col; radar.lineWidth = big ? 2.5 : 1.5;
    radar.beginPath(); if (I.cave) radar.rect(X - r, Y - r, 2 * r, 2 * r); else radar.arc(X, Y, r, 0, 6.283); radar.stroke();
    if (I.cap && fog.visibleAt(I.pad.x, I.pad.z)) { radar.strokeStyle = OWN_COL[I.cap.side]; radar.lineWidth = 3; radar.beginPath(); radar.arc(X, Y, r + 4, -1.571, -1.571 + 6.283 * I.cap.t); radar.stroke(); }
    if (big) {
      radar.font = 'bold 11px monospace'; radar.textAlign = 'center'; radar.fillText(KIND_TAG[I.kind], X, Y + 4);
      radar.font = '12px monospace'; radar.textAlign = 'left';
      const vis = fog.visibleAt(I.pad.x, I.pad.z), aa = vis && own > 0 ? war.aliveAA(I) : -1;
      radar.fillText(`${I.name}${own < 0 ? '  ?' : ''}${aa > 0 ? '  ' + '▲'.repeat(aa) : ''}`, X + 14, Y + 4);
      if (I === selIsl) { radar.strokeStyle = '#ff8'; radar.lineWidth = 2; radar.setLineDash([4, 4]); radar.beginPath(); radar.arc(X, Y, 18, 0, 6.283); radar.stroke(); radar.setLineDash([]); }
    }
  }
  // the carrier's course
  const c = war.carrier;
  if (c && c.path.length && c.sinking === undefined) {
    radar.strokeStyle = 'rgba(80,200,255,.7)'; radar.lineWidth = big ? 2 : 1; radar.setLineDash([6, 5]); radar.beginPath(); radar.moveTo(px(c.p.x), py(c.p.z));
    for (const [x, z] of c.path) radar.lineTo(px(x), py(z)); radar.stroke(); radar.setLineDash([]);
    const [gx, gz] = c.path[c.path.length - 1]; radar.beginPath(); radar.arc(px(gx), py(gz), big ? 6 : 3, 0, 6.283); radar.stroke();
  }
  // units
  for (const u of war.units) {
    if (u.side === 2 && !fog.visibleAt(u.p.x, u.p.z)) continue;
    const X = px(u.p.x), Y = py(u.p.z), col = u.side === 1 ? '#6ef' : '#f64';
    if (u.dims) {
      radar.save(); radar.translate(X, Y); radar.rotate(-u.yaw); radar.fillStyle = u.sinking !== undefined ? '#555' : col;
      const l = Math.max(big ? 12 : 7, u.dims.L * half), w = Math.max(big ? 4 : 3, u.dims.W * half); radar.fillRect(-w / 2, -l / 2, w, l); radar.restore();
      if (big) { radar.fillStyle = col; radar.font = 'bold 12px monospace'; radar.fillText(shipName(u), X + 12, Y - 8); }
    } else { radar.fillStyle = col; const sz = big ? (u.type === 'transport' ? 7 : u.type === 'dropship' ? 9 : 5) : u.type === 'dropship' ? 5 : 3; radar.fillRect(X - sz / 2, Y - sz / 2, sz, sz); }
  }
  if (war.ground && war.ground.drawMap) war.ground.drawMap(radar, px, py, big, fog);   // ngc/rwground-polish: ground units, wrecks, fights
  // FOUNDATION: your parked crafts (the Huey you walked away from, a Hornet on deck, vehicles): hollow white marks
  for (const d of crafts.defs) {
    if (d === crafts.active || d.kind === 'foot' || d.id === 'ride' || !d.present()) continue;   // (ngc/interiors: the RIDE seats are not a vehicle)
    const f = d.frame(_mapF), X = px(f.x), Y = py(f.z), r = big ? 6 : 3.5;
    radar.strokeStyle = '#fff'; radar.lineWidth = big ? 2 : 1.2; radar.beginPath();
    if (d.kind === 'ground') radar.rect(X - r, Y - r, 2 * r, 2 * r); else { radar.moveTo(X, Y - r * 1.3); radar.lineTo(X + r, Y + r); radar.lineTo(X - r, Y + r); radar.closePath(); }
    radar.stroke();
    if (big) { radar.fillStyle = '#fff'; radar.font = '11px monospace'; radar.textAlign = 'left'; radar.fillText(d.label, X + 10, Y + 4); }
  }
  // you: an arrow along the nose
  const X = px(Z.pos.x), Y = py(Z.pos.z), fx_ = Z.facing.x, fz = Z.facing.y, sz = big ? 9 : 5;
  radar.fillStyle = '#fff'; radar.beginPath();
  radar.moveTo(X + fx_ * sz, Y + fz * sz); radar.lineTo(X - fx_ * sz - fz * sz * .6, Y - fz * sz + fx_ * sz * .6); radar.lineTo(X - fx_ * sz + fz * sz * .6, Y - fz * sz - fx_ * sz * .6); radar.fill();
  radar.restore();
  if (big) {
    radar.font = '14px monospace'; radar.textAlign = 'center'; radar.fillStyle = '#bfe';
    radar.fillText('CLICK THE SEA: SAIL THE ALBATROSS THERE   ·   CLICK AN ISLAND: SELECT IT   ·   M: CLOSE', W / 2, Hh - 70);
    radar.fillStyle = '#ff8';
    radar.fillText(`1: SEA KNIGHT + 13 MARINES (${COST.drone})  ·  2: AA GUN ON OUR ISLAND (${COST.aa})  ·  3: NEW HELICOPTER (${COST.heli})  ·  4: TOMCAT ESCORT (${COST.escort})  ·  6: SKY CARRIER REFIT (${COST.sky})  ·  8: FLY A TOMCAT  ·  9 / 0: M60A3 / M113A2 BY LCM-8     MATERIEL ${Math.floor(G.mat)}`, W / 2, Hh - 46);
    radar.font = '12px monospace'; radar.fillStyle = '#8ab';
    radar.fillText('HQ  HEADQUARTERS     C  CAVE FORTRESS (STEAL ITS POD)     F  FUEL     M  MATERIEL (FACTORY)     R  RADAR     ▲ AA GUNS     SHIPS: ALBATROSS · KRAKEN · LEVIATHAN · CONTAINER SHIP', W / 2, Hh - 24);
    if (selIsl) {
      const I = selIsl, own = I.seen, info = [`${I.name}`, `${own < 0 ? 'UNKNOWN' : ['NEUTRAL', 'OURS', 'ENEMY'][own]}  ·  ${{ hq: 'HEADQUARTERS', fortress: 'CAVE FORTRESS', fuel: 'OIL - FUEL', factory: 'FACTORY - MATERIEL', radar: 'RADAR - LONG SIGHT' }[I.kind]}`];
      if (fog.visibleAt(I.pad.x, I.pad.z) && own > 0) info.push(`AA GUNS ${war.aliveAA(I)}`);
      info.push(I.cave ? 'TAKE IT: STEAL THE POD FROM ITS CAVE' : own === 1 ? 'PRESS 2 FOR AN AA GUN' : 'TAKE IT: SILENCE ITS GUNS, LAND ON THE PAD OR PRESS 1');
      radar.textAlign = 'left'; radar.font = 'bold 15px monospace';
      info.forEach((t, i) => { radar.fillStyle = i === 0 ? OWN_COL[Math.max(0, own)] : '#cde'; radar.fillText(t, 24, 90 + i * 22); });
    }
    radar.textAlign = 'left';
  }
}
$('radar').addEventListener('mousedown', e => {
  if (!bigMap || !mapView) return;
  e.stopPropagation(); e.preventDefault();
  const v = mapView, rc = $('radar').getBoundingClientRect(), mx = e.clientX - rc.left, my = e.clientY - rc.top;
  const wx = v.ox + (mx - v.cx) / v.half, wz = v.oz + (my - v.cy) / v.half;
  const I = ISLANDS.find(I => (fog.exploredAt(I.x, I.z) || fog.exploredAt(I.pad.x, I.pad.z)) && Math.hypot(v.cx + (I.pad.x - v.ox) * v.half - mx, v.cy + (I.pad.z - v.oz) * v.half - my) < 16);
  if (I) { selIsl = I; sfx.blip?.(500, 700, 0.06, 'square', 0.06); return; }
  if (war.orderCarrier(wx, wz)) { feed('ALBATROSS: COURSE SET'); sfx.blip?.(400, 300, 0.08, 'square', 0.06); }
});
$('radar').addEventListener('contextmenu', e => e.preventDefault());
const _hud = {};
function setText(id, v) { if (_hud[id] !== v) { _hud[id] = v; $(id).textContent = v; } }
function setStyle(id, k, v) { const key = id + k; if (_hud[key] !== v) { _hud[key] = v; $(id).style[k] = v; } }
const crossEl = (() => {
  const e = document.createElement('div'); e.style.cssText = 'position:absolute;left:50%;top:50%;width:25px;height:25px;margin:-12px 0 0 -12px;display:none';
  e.innerHTML = '<svg width="25" height="25" viewBox="0 0 25 25" style="filter:drop-shadow(0 0 1px #000)"><circle cx="12.5" cy="12.5" r="1.3" fill="#ffe8a0"/><path d="M12.5 1v7M12.5 17v7M1 12.5h7M17 12.5h7" stroke="#ffe8a0" stroke-width="1" opacity=".85"/></svg>';
  $('hud').appendChild(e); return e;
})();
const gfxEl = (() => { const e = document.createElement('div'); e.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:none'; $('hud').prepend(e); return e; })();
const rwrCue = createRwrCue($('hud'));   // CM: radar warning scope + LOCK / MISSILE LAUNCH / LASER words, outside views
const cautionEl = (() => { const e = document.createElement('div'); e.id = 'caution'; e.style.cssText = 'position:absolute;left:16px;bottom:100px;font-size:15px;letter-spacing:1px;font-weight:bold'; $('hud').appendChild(e); return e; })();
// what the island pad under / near you is doing: capture progress, guns in the way, services
function padHint() {
  if (Z.svc && G.craft === 'heli') return G.res < 1 && G.fuel < 98 ? 'FUEL STORES EMPTY  -  TAKE FUEL ISLANDS OR LOOT ENEMY CAVES' : G.fuel < 97 || D.damaged() || G.rockets < ROCKETS_MAX || G.bombs < BOMBS_MAX ? `${Z.svc.name}  -  REFUELLING, REPAIRING, REARMING` : `${Z.svc.name}  -  READY  ·  M FOR THE MAP`;
  for (const I of ISLANDS) {
    if (I.owner === 1 || Math.hypot(Z.pos.x - I.pad.x, Z.pos.z - I.pad.z) > 45) continue;
    if (I.cave) return I.owner === 2 ? `${I.name}  -  DESCEND THE SHAFT AND STEAL THE POD TO TAKE IT` : '';
    const aa = war.aliveAA(I);
    if (aa > 0) return `${I.name}  -  ${aa} AA GUN${aa > 1 ? 'S' : ''} DEFENDING  -  KNOCK ${aa > 1 ? 'THEM' : 'IT'} OUT FIRST`;
    if (PL.landed && I.cap && I.cap.side === 1) return `CAPTURING ${I.name}  ${Math.floor(I.cap.t * 100)}%`;
    return `${I.name}  -  LAND ON THE PAD TO TAKE IT`;
  }
  return '';
}
// floating labels over nearby islands and ships, so you can read the war without the map
const tagBox = (() => { const e = document.createElement('div'); e.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden'; $('hud').prepend(e); return e; })();
const tagPool = [], _tv = new THREE.Vector3();
const KIND_NAME = { hq: 'HEADQUARTERS', fortress: 'CAVE FORTRESS', fuel: 'FUEL', factory: 'FACTORY', radar: 'RADAR' };
function updateTags() {
  let n = 0;
  const put = (x, y, z, html, d) => {
    _tv.set(x, y, z).project(zCam); if (_tv.z > 1 || Math.abs(_tv.x) > 1.05 || Math.abs(_tv.y) > 1.05) return;
    if (n >= tagPool.length) { const e = document.createElement('div'); e.style.cssText = 'position:absolute;left:0;top:0;width:240px;margin-left:-120px;text-align:center;font-size:12px;line-height:1.35;white-space:nowrap;text-shadow:0 0 3px #000,0 0 5px #000'; tagBox.appendChild(e); tagPool.push(e); }
    const e = tagPool[n++]; if (e._h !== html) { e._h = html; e.innerHTML = html; }
    e.style.display = 'block'; e.style.transform = `translate(${((_tv.x + 1) / 2 * innerWidth).toFixed(0)}px,${((1 - _tv.y) / 2 * innerHeight - 30).toFixed(0)}px)`; e.style.opacity = clamp(1.4 - d / 380, 0.25, 1).toFixed(2);
  };
  if (G.state === 'play' && G.mode === 'zarch' && !bigMap && camB < 0.05) {
    const cx = zCam.position.x, cz = zCam.position.z;
    for (const I of ISLANDS) {
      const p = I.pad, d = Math.hypot(p.x - cx, p.z - cz); if (d > 430 || d < 25 || !fog.exploredAt(p.x, p.z)) continue;
      const vis = fog.visibleAt(p.x, p.z), own = vis ? I.owner : I.seen, col = own < 0 ? '#aaa' : OWN_COL[own], aa = vis && own > 0 ? war.aliveAA(I) : 0;
      const st = own < 0 ? 'UNKNOWN' : own === 1 ? (I.cap && I.cap.side === 2 ? '<span style="color:#f86">UNDER ATTACK</span>' : 'OURS') : own === 2 ? (I.cave ? 'ENEMY  ·  STEAL THE POD' : aa ? `ENEMY  ·  ${'▲'.repeat(aa)} AA` : 'ENEMY  ·  UNDEFENDED') : 'NEUTRAL  ·  LAND TO TAKE';
      put(p.x, p.h + 22, p.z, `<b style="color:${col}">${I.name}</b>  <span style="color:#9ab">${KIND_NAME[I.kind]}  ${Math.round(d)}m</span><br><span style="color:#cde">${st}</span>`, d);
    }
    for (const u of war.units) {
      if (!u.dims || u.sinking !== undefined || (u.side === 2 && !fog.visibleAt(u.p.x, u.p.z))) continue;
      const d = Math.hypot(u.p.x - cx, u.p.z - cz); if (d > 520 || d < 60) continue;
      put(u.p.x, u.dims.DECK + 30, u.p.z, `<b style="color:${OWN_COL[u.side]}">${shipName(u)}</b>  <span style="color:#9ab">${Math.round(100 * u.hp / u.hpMax)}%  ${Math.round(d)}m</span>`, d);
    }
  }
  for (let i = n; i < tagPool.length; i++) tagPool[i].style.display = 'none';
}
function updateHud() {
  updateTags();
  {   // in the cockpit the instruments carry fuel / rpm / speed, so the bottom text block steps aside and the map moves up
    const ck = cockpit.group.visible || JP.cockpit.group.visible || tomcatC.TP.cockpit.group.visible; setStyle('bot', 'display', ck || bigMap ? 'none' : 'block');
    for (const id of ['tl', 'hint', 'feed', 'war']) setStyle(id, 'display', bigMap ? 'none' : 'block');   // the command map has its own read-outs
    setStyle('radar', 'bottom', ck && !bigMap ? 'auto' : ''); setStyle('radar', 'top', ck && !bigMap ? '64px' : ''); setStyle('feed', 'top', ck ? '236px' : '');
  }
  crossEl.style.display = document.pointerLockElement === canvas && (cockpit.group.visible || JP.cockpit.group.visible || tomcatC.TP.cockpit.group.visible || armCk()) || (G.craft === 'foot' && !foot.marine && foot.alive && foot.firstPerson() && G.state === 'play') || (G.state === 'play' && crafts.active && crafts.active.switches && crafts.active.firstPerson()) ? 'block' : 'none';   // ngc/wheeledgame: a dot to work the cab's switches / lay the gun
  const ch = G.craft !== 'heli' && crafts.active ? crafts.active.hud() : null;   // FOUNDATION: any other craft's read-outs
  {   // g effects in the jet cockpit: grey tunnel closing in, black at G-LOC, red-out under negative g
    const gf = JP.cockpit.group.visible || (G.craft === 'jet' && JP.gloc > 0) ? JP.gfx() : tomcatC.TP.cockpit.group.visible || (G.craft === 'tomcat' && tomcatC.glocNow()) ? tomcatC.gfx() : { grey: 0, red: 0 };
    const k = (gf.grey * 100) | 0, r = (gf.red * 100) | 0, key = k * 1000 + r;
    if (gfxEl._k !== key) { gfxEl._k = key; gfxEl.style.display = key ? 'block' : 'none'; gfxEl.style.background = `radial-gradient(circle at 50% 45%, rgba(${r ? 120 : 0},0,0,${gf.red * 0.55}) ${Math.max(0, 62 - gf.grey * 70)}%, rgba(${r ? 90 : 0},0,0,${Math.min(1, 0.15 + gf.grey * 1.1 + gf.red * 0.4)}) ${Math.max(8, 95 - gf.grey * 80)}%)`; gfxEl.style.backdropFilter = gf.grey > 0.2 ? `grayscale(${Math.min(1, gf.grey * 1.4)})` : ''; }
  }
  { const list = G.state === 'play' && !cockpit.group.visible && G.craft === 'heli' ? D.cautions(G.fuel, H.rpm, G.mode === 'zarch' ? H.landed : T.landed) : [], blink = (performance.now() % 600) < 300;
    const html = list.map(c => `<span style="color:${c.warn ? (blink ? '#ff3a2a' : '#7a1810') : '#ffb020'};margin-right:12px">${c.t}</span>`).join('');
    if (cautionEl._h !== html) { cautionEl._h = html; cautionEl.innerHTML = html; } }
  setText('score', String(G.score)); setText('hi', String(G.hi));
  // (COMMANDER: the fleet strip under the score - reserves and units out - is drawn by the command board, units/commander/board.js)
  setStyle('fuel', 'width', clamp(ch ? ch.fuel ?? 0 : G.fuel, 0, 100).toFixed(1) + '%'); setText('fuelLbl', ch ? ch.fuelLabel || 'FUEL' : 'FUEL');
  setText('modeTag', `FUEL STORES ${Math.round(G.res)}/${RES_MAX}   MATERIEL ${Math.floor(G.mat)}${G.cargo > 0.5 ? '   CARGO ' + Math.round(G.cargo) : ''}`);
  setText('weap', ch ? ch.weap || '' : `ROCKETS ${G.rockets}   BOMBS ${G.bombs}   FLARES ${cmH.flare}   CHAFF ${cmH.chaff}`);
  {   // CM: the radar warning cue in the chase / outside views (the cockpits have their own scopes and lamps)
    const air = G.state === 'play' && G.mode === 'zarch' && (G.craft === 'heli' || (G.craft === 'jet' && JP.alive && !JP.ejected)), inside = cockpit.group.visible || JP.cockpit.group.visible;
    const f = G.craft === 'jet' ? JP.J.forward(_cmQ) : H.forward();
    rwrCue.update(air && !inside && !bigMap, Math.atan2(f.x, -f.z), performance.now() / 1000, G.craft === 'jet' ? JP.cm : cmH);
  }
  {   // the war at a glance
    const n = [0, 0, 0]; for (const I of ISLANDS) n[I.owner]++;
    const c = war.carrier, b = war.battleship, eb = war.E.bship;
    const html = `<span style="color:#4cf">OURS ${n[1]}</span> &nbsp; <span style="color:#f54">ENEMY ${n[2]}</span> &nbsp; <span style="color:#ddd">FREE ${n[0]}</span>` +
      ` &nbsp;·&nbsp; ALBATROSS <b style="color:${c && c.hp / c.hpMax < 0.4 ? '#f54' : '#9ff'}">${c ? Math.max(0, Math.round(100 * c.hp / c.hpMax)) : 0}%</b>` +
      (b && b.sinking === undefined ? ` &nbsp;·&nbsp; <b style="color:#f54">LEVIATHAN AT SEA ${Math.round(100 * b.hp / b.hpMax)}%</b>` : ` &nbsp;·&nbsp; LEVIATHAN BUILT <b style="color:${eb > 70 ? '#f54' : '#fb6'}">${Math.floor(eb)}%</b>`);
    if (_hud.war !== html) { _hud.war = html; $('war').innerHTML = html; }
    const now = performance.now(), fh = feedItems.filter(f => now - f.at < 14000).map(f => `<div style="color:${f.kind === 'good' ? '#7f9' : f.kind === 'bad' ? '#f86' : '#cde'};opacity:${Math.min(1, (14000 - (now - f.at)) / 2000).toFixed(2)}">${f.t}</div>`).join('');
    if (_hud.feed !== fh) { _hud.feed = fh; $('feed').innerHTML = fh; }
  }
  setText('pad', keyboardOnly ? 'KEYBOARD ONLY' : CTL.state.source && CTL.state.source !== 'NONE' ? `${CTL.state.source}${CTL.state.hasPedals ? ' + PEDALS' : ''}  ·  J CONTROLS` : readPad() ? 'CONTROLLER' : 'KEYBOARD');
  setStyle('radar', 'display', G.mode === 'zarch' ? 'block' : 'none');
  setStyle('bot', 'width', '440px'); setStyle('hint', 'left', '470px');   // the Huey's numbers line is as long as the jet's
  if (ch) {   // the HORNET, the soldier, ground vehicles ... (craft.hud())
    setText('alt', ch.line || ''); setText('hint', ch.tip ? padHint() || ch.hint : ch.hint || '');
    if (performance.now() - (Z.mapT || 0) > (bigMap ? 60 : 120)) { Z.mapT = performance.now(); drawMap(); }
  } else if (G.mode === 'zarch') {
    const hb = holeOf(Z.pos.x, Z.pos.z), alt = Z.pos.y - 0.9 - (hb ? hb.h : groundY(Z.pos.x, Z.pos.z)), bd = Math.hypot(Z.pos.x - HOME_B.x, Z.pos.z - HOME_B.z);
    const ias = Math.hypot(Z.vel.x, Z.vel.z) * 1.944, hdg = ((H.heading() * 180 / Math.PI) + 360) % 360, c = Z.ctl || {};
    setText('alt', hueyLine(ias, hdg, Math.max(0, hb ? Z.pos.y + HELI.SKID_Y - hb.h : H.agl), c));
    setText('hint', helm.active ? helm.status() : switchHover ? `${cockpit.labelOf(switchHover)}  -  CLICK` : G.rescue ? (G.rescue.drop ? drop.status() : `EMERGENCY LANDING  -  FUEL DROP IN ${Math.max(0, Math.ceil(G.rescue.t))}s`) : hueyHint() || padHint());
    if (performance.now() - (Z.mapT || 0) > (bigMap ? 60 : 120)) { Z.mapT = performance.now(); drawMap(); }
  } else {
    const c = Z.ctl || {};
    setText('alt', `COLL ${(H.coll * 100).toFixed(0)}%  NR ${(H.rpm * 100).toFixed(0)}%  TQ ${H.torque.toFixed(0)} PSI  VS ${T.vy.toFixed(1)}  ${c.sas ? 'ASSIST' : 'MANUAL'}  ${T.pod && T.pod.attached ? 'POD ON THE LINE' : ''}${SY.rpmWarn ? '  RPM!' : ''}`);
    const nearTank = T.tanks.some(t => t.fuel > 0 && Math.hypot(t.x - T.x, t.y - T.y) < 10) && G.cargo < CARGO_MAX;
    setText('hint', switchHover ? `${switchHover.toUpperCase()}  -  CLICK TO OPERATE` : G.rescue ? `EMERGENCY LANDING  -  FUEL RUN IN ${Math.max(0, Math.ceil(G.rescue.t))}s` : nearTank && !T.beamOn ? 'HOVER OVER THE TANK AND HOLD S / R (WINCH) TO DRAIN IT' : G.cargo >= CARGO_MAX ? 'CARGO FULL  -  CLIMB OUT AND TAKE IT HOME' : T.caveT < 8 ? 'HAT OR MOUSE AIMS THE DOOR GUN' : '');
  }
}
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); zCam.aspect = w / h; zCam.updateProjectionMatrix();
}
// dynamic resolution: if frames run long (GPU-bound, e.g. a 4K screen) step the render resolution down, and back up
// when there is headroom. Hysteresis + a cooldown keep it from hunting. Off with ?res=N (fixed ratio N).
const dynRes = { ms: 16.7, cool: 0 };
function updateDynRes(frameMs) {
  if (params.has('res') || frameMs > 250) return;
  dynRes.ms += (frameMs - dynRes.ms) * 0.05; dynRes.cool -= frameMs;
  if (dynRes.cool > 0) return;
  let pr = pixRatio;
  if (dynRes.ms > 19.5 && pr > 0.6) pr = Math.max(0.6, pr - 0.15);
  else if (dynRes.ms < 14.5 && pr < PR_MAX) pr = Math.min(PR_MAX, pr + 0.1);
  if (pr !== pixRatio) { pixRatio = pr; renderer.setPixelRatio(pr); resize(); dynRes.cool = 1500; }
}
addEventListener('resize', resize); resize();

const _u = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _tgt = new THREE.Vector3();
const lightPool = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
lightPool.renderOrder = 3; zScene.add(lightPool);
const _ld = new THREE.Vector3();
function updateLandingLight(inCave) {
  lightPool.visible = false;
  if (!G.light || inCave || !Z.alive || G.state !== 'play') return;   // (inCave is also passed true while flying the jet)
  _ld.set(0, -0.8, -0.6).applyQuaternion(H.q).normalize();   // fixed light under the nose, angled forward-down
  for (let t = 1; t < 70; t += 1) {
    const x = H.pos.x + _ld.x * t, y = H.pos.y + _ld.y * t, z = H.pos.z + _ld.z * t, gy = groundY(x, z);
    if (y <= gy) { lightPool.visible = true; lightPool.position.set(x, gy + 0.15, z); const k = 1.2 + t * 0.22; lightPool.scale.set(k, 1, k * 1.4); lightPool.material.opacity = 0.45 * (1 - t / 75); return; }
  }
}
const _wv0 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _yAx = new THREE.Vector3(0, 1, 0), _zAx = new THREE.Vector3(0, 0, 1), _xAx = new THREE.Vector3(1, 0, 0);
// camA is the 3D flight camera (fixed or chase); camS the side-on cave camera. zCam renders a blend of the two, so
// diving into the shaft swings the view round to the 2.5D side view with no cut.
const camA = new THREE.PerspectiveCamera(), camS = new THREE.PerspectiveCamera(), SIDE_FOV = 38, SIDE_VIEWH = 30 * CS;
let camB = 0;
function updateCamsAndMeshes(dt, time) {
  const P = Z.pos, inCave = G.mode === 'thrust' && !!T.lvl, jet = isJet() && G.state !== 'title';
  { const want = jet ? clamp(1100 + zCam.position.y * 1.2, 1100, 2600) : inZone(zCam.position.x, zCam.position.z) ? DRAW : 600; view.draw += (want - view.draw) * Math.min(1, 1.5 * dt); if (Math.abs(view.draw - want) < 1) view.draw = want; }
  if (inCave) {   // keep Z.pos on the ship so the 3D camera keeps following it through the swing
    caveToWorld(T.x, T.y, P); T.zOff *= Math.exp(-5 * dt); P.z = T.base.z + T.zOff;
  }
  heliModel.animate(heliLook(), dt, time, cockpit.group.visible);
  if (Z.alive && G.state === 'play' && (D.fire || D.hp.engine < 0.5) && Math.random() < (D.fire ? 0.9 : 0.35)) {
    const p = _wv0.set(0, 1.3, 1.4).applyQuaternion(shipMesh.quaternion).add(shipMesh.position);
    if (D.fire) fx.add.spawn(p.x, p.y, p.z, rnd(-1, 1), rnd(2, 4), rnd(-1, 1), rnd(0.3, 0.6), 1, 0.3, 1, rnd(.4, .6), .1, 0.9, -1.5, 1);
    fx.trail(p.x, p.y, p.z, D.fire ? 1.2 : 0.8);
  }
  for (const b of BASES) {
    b.funnel.visible = camB < 0.5;
    const d = Math.hypot(zCam.position.x - b.x, zCam.position.z - b.z), f = 1 - smooth(view.draw * 0.45, view.draw * 0.85, d);
    b.beam.visible = f > 0.01; b.beam.material.opacity = (b.kind === 'home' ? 0.35 : 0.3) * f;
  }
  for (const b of BASES) if (b.group) b.group.visible = b === T.base && inCave || Math.hypot(zCam.position.x - b.x, zCam.position.z - b.z) < 140;
  baseGroup.userData.ring.material.color.setHSL((time * 0.5) % 1, 1, 0.6);
  if (G.state === 'title') {
    const a = time * 0.07, c = war.carrier.p; camA.position.set(c.x + Math.cos(a) * 95, 30, c.z + Math.sin(a) * 95); camA.lookAt(c.x, 8, c.z);   // the ALBATROSS on station
  } else if (G.craft !== 'heli' && crafts.active) {   // FOUNDATION: the HORNET, the soldier, vehicles - each craft's own rigs
    crafts.active.camera(camA, dt, { locked: document.pointerLockElement === canvas, head });
  } else if (drop.camActive && !inCave) {
    drop.camera(camA, dt);
  } else if (helm.active && !inCave) {
    helm.camera(camA, dt, head);
  } else if (cockpitCam && !inCave && Z.alive) {
    // pilot's eye, rigidly in the airframe, with the Huey's two-per-rev bounce (stronger with load, ETL shudder, blade stall)
    camA.position.copy(EYE).applyQuaternion(H.q).add(H.pos); camA.quaternion.copy(H.q).multiply(_q2.setFromAxisAngle(_yAx, head.yaw)).multiply(_q2.setFromAxisAngle(_xAx, HELI.EYE_PITCH + head.pitch));   // eyes down a little to the panel, plus free look
    if (document.pointerLockElement !== canvas || !freeLook) { const k = Math.exp(-6 * dt); head.yaw *= k; head.pitch *= k; }   // released or free look off: back to centre and stay there
    const sh = (0.002 + 0.02 * H.vib + 0.03 * D.mods().vib) * H.rpm, b2 = 0.004 * (0.3 + H.coll + 2 * H.vib) * H.rpm * Math.sin(time * 2 * H.omega); camA.position.x += (Math.random() - 0.5) * sh; camA.position.y += (Math.random() - 0.5) * sh + b2;
  } else if (chaseCam && !inCave) {
    const k = 1 - Math.exp(-3 * dt); _cf.x = lerp(_cf.x, Z.facing.x, k); _cf.z = lerp(_cf.z, Z.facing.y, k);
    const m = Math.hypot(_cf.x, _cf.z) || 1; _cf.x /= m; _cf.z /= m;
    _tgt.set(P.x - _cf.x * 30, P.y + 10, P.z - _cf.z * 30); camA.position.lerp(_tgt, 1 - Math.exp(-6 * dt));
    camA.position.y = Math.max(camA.position.y, groundY(camA.position.x, camA.position.z) + 3);
    camA.lookAt(P.x + _cf.x * 14, P.y - 1, P.z + _cf.z * 14);
  } else {
    _tgt.set(P.x, P.y + 12, P.z + 28); camA.position.lerp(_tgt, 1 - Math.exp(-5 * dt));
    camA.position.y = Math.max(camA.position.y, groundY(camA.position.x, camA.position.z) + 3);
    camA.lookAt(P.x * 0.9 + camA.position.x * 0.1, P.y - 1, P.z - 12);
  }
  // side camera: clamp to the level (plus its rock margin) so the view never leaves the rock
  if (T.lvl) {
    const L = T.lvl, hh = 15, hw = hh * zCam.aspect;
    const k = 1 - Math.exp(-4 * dt);
    T.cam.x = lerp(T.cam.x, T.x + T.vx * 0.3, k); T.cam.y = lerp(T.cam.y, T.y + T.vy * 0.3, k);
    const cx = clamp(T.cam.x, hw - 10, L.W - hw + 10), cy = clamp(T.cam.y, hh - 10, L.H + 6 - hh);
    caveToWorld(cx, cy, camS.position); camS.position.z = T.base.z + SIDE_VIEWH / 2 / Math.tan(SIDE_FOV / 2 * Math.PI / 180);
    camS.quaternion.identity();
  }
  camB = clamp(camB + (inCave ? dt : -dt) / 1.3, 0, 1);
  const e = smooth(0, 1, camB);
  if (e <= 0) { zCam.position.copy(camA.position); zCam.quaternion.copy(camA.quaternion); }
  else {
    // arc the camera out in front of the cave face while it swings, rather than cutting through the rock
    // quadratic Bezier via a point above the cave front at surface height: the camera rises clear of the hills,
    // then sinks straight down through the ground into the side view; it turns to face the cave early
    _tgt.set(camS.position.x, (T.base ? T.base.h : PAD_H) + 16, camS.position.z);
    const a = (1 - e) * (1 - e), b = 2 * e * (1 - e), cc = e * e;
    zCam.position.set(a * camA.position.x + b * _tgt.x + cc * camS.position.x, a * camA.position.y + b * _tgt.y + cc * camS.position.y, a * camA.position.z + b * _tgt.z + cc * camS.position.z);
    zCam.quaternion.slerpQuaternions(camA.quaternion, camS.quaternion, smooth(0, 0.6, e));
  }
  const other = G.craft !== 'heli' && !!crafts.active && G.state !== 'title', otherFP = other && crafts.active.firstPerson();   // FOUNDATION
  const jetCk = jet && cockpitCam && (G.craft === 'tomcat' ? tomcatC.firstPerson() : JP.alive && !JP.ejected);
  const heliCk = cockpitCam && !inCave && Z.alive && G.craft === 'heli' && !drop.camActive, firstP = otherFP || heliCk || drop.cockpitView;
  const fov = lerp(firstP ? (otherFP && crafts.active.fov ? crafts.active.fov(ckFov) : ckFov) : 62, SIDE_FOV, e); if (Math.abs(zCam.fov - fov) > 0.01) { zCam.fov = fov; zCam.updateProjectionMatrix(); }
  zScene.fog.color.copy(HORIZON).multiplyScalar(1 - 0.85 * e); zScene.fog.near = lerp(view.draw * 0.5, DRAW * 0.8, e); zScene.fog.far = lerp(view.draw, DRAW, e);
  terrainUni.uFogN.value = view.draw * 0.5; terrainUni.uFogF.value = view.draw * 0.97;
  if (Math.abs(zCam.far - (view.draw + 15)) > 2) { zCam.far = view.draw + 15; zCam.updateProjectionMatrix(); }
  sky.scale.setScalar(view.draw / DRAW);
  if (fx.shake > 0.01) { const k = fx.shake * (cockpit.group.visible ? 0.1 : 0.4); zCam.position.x += rnd(-k, k); zCam.position.y += rnd(-k, k); zCam.position.z += rnd(-k, k); }
  fx.ear.copy(zCam.position); terrainUni.uTime.value = time;
  updateSeaUniforms(terrainUni, war.sea, war.units, zCam.position);   // SEAWORLD
  sky.position.copy(zCam.position);
  terrainStream(zCam.position.x, zCam.position.z);
  terrain.position.set(Math.round(zCam.position.x / TG) * TG, 0, Math.round(zCam.position.z / TG) * TG);
  farTerrain.visible = view.draw > DRAW + 20; terrainUni.uNear.value.set(terrain.position.x, terrain.position.z, TG * TN / 2 - 3);
  if (farTerrain.visible) farTerrain.position.set(Math.round(zCam.position.x / FAR_C) * FAR_C, 0, Math.round(zCam.position.z / FAR_C) * FAR_C);

  shipShadow.visible = Z.alive && !inCave && !G.heliStowed; if (G.heliStowed) shipMesh.visible = false;   // parked or flown, the Huey is drawn
  const HP = G.craft === 'heli' ? P : H.pos;
  if (inCave && T.alive) {
    // side view: the nose points along the thrust like the classic Thrust triangle, top of the ship faces the camera;
    // blended from the 3D attitude while the camera swings so the ship visibly pitches into it
    // side-on helicopter: nose toward its direction of travel (yaws round when it turns), disc tilted by T.ang
    if (T.spin > 0.05) T.yawF += T.spin * 5 * dt;   // tail rotor gone: it pirouettes
    else T.yawF = lerp(T.yawF, -T.face * Math.PI / 2 + Math.round((T.yawF + T.face * Math.PI / 2) / (2 * Math.PI)) * 2 * Math.PI, 1 - Math.exp(-5 * dt));
    _q.setFromAxisAngle(_zAx, -T.ang); _q2.setFromAxisAngle(_yAx, T.yawF); _q.multiply(_q2);
    shipMesh.quaternion.slerpQuaternions(T.q0, _q, e); T.qLast.copy(_q); shipMesh.position.copy(P);
    shipMesh.scale.setScalar(lerp(1, HELI.CAVE_SCALE, e));   // drawn small enough to fit the cave outline (shipPts), skids on its skid line
    shipMesh.position.addScaledVector(_u.set(0, 1, 0).applyQuaternion(shipMesh.quaternion), (HELI.CAVE_SKID - HELI.SKID_Y * lerp(1, HELI.CAVE_SCALE, e)) * e);
  } else if (Z.alive && !G.heliStowed) {
    shipMesh.quaternion.copy(H.q);
    if (e > 0) shipMesh.quaternion.slerp(T.qLast, e);   // still turning back from the side view after the climb out
    shipMesh.position.copy(HP); shipMesh.scale.setScalar(lerp(1, HELI.CAVE_SCALE, e));
    const gy = groundY(HP.x, HP.z), alt = HP.y - gy;
    shipShadow.position.set(HP.x, gy + 0.12, HP.z); const sc = 2.4 + alt * 0.03; shipShadow.scale.set(sc, 1, sc); shadowMat.opacity = clamp(0.5 - alt * 0.006, 0.12, 0.5);
  }
  const inCockpit = cockpitCam && !inCave && e < 0.01 && Z.alive && G.state !== 'title' && G.craft === 'heli' && !drop.camActive && !helm.active;
  cockpit.group.visible = inCockpit; for (const o of heliShell) o.visible = !inCockpit;   // seen from inside, the outer shell only gets in the way
  const near = inCockpit || otherFP || drop.cockpitView || helm.bridgeView ? 0.05 : 0.5; if (zCam.near !== near) { zCam.near = near; zCam.updateProjectionMatrix(); }
  updateLandingLight(inCave || G.craft !== 'heli'); updateBombSight(inCave || e > 0.05 || G.craft !== 'heli' || drop.camActive || helm.active);
  switchHover = inCockpit || jetCk || armCk() || (crafts.active && crafts.active.switches && G.craft !== 'heli') ? pickSwitch() : null;
  crafts.render(dt, time); if (G.state !== 'play') crafts.silence();   // every craft's model (the HORNET's cockpit, the soldier's arms...)
  if (inCockpit) cockpit.update(H, dt, heliPanel(switchHover));
  const caveAimOn = inCave && T.alive && T.aimX !== undefined && e > 0.9 && G.state === 'play';
  reticle.visible = (Z.alive && !inCave && G.state !== 'title' && G.craft === 'heli' && !drop.camActive && !helm.active) || caveAimOn; aimLine.visible = reticle.visible && !inCockpit;
  if (caveAimOn) _wv0.set(T.aimX, T.aimY, 0); else _wv0.copy(Z.aim);
  if (reticle.visible) {
    reticle.position.copy(P).addScaledVector(_wv0, caveAimOn ? 7 * CS * 0.7 : 40);   // far enough out that it never sits on the helicopter
    reticle.quaternion.copy(zCam.quaternion);   // always face the camera, so it never shows its edge
    reticle.scale.setScalar(2 * reticle.position.distanceTo(zCam.position) * Math.tan(zCam.fov * Math.PI / 360) / innerHeight);
    const a = aimLine.geometry.attributes.position, s0 = caveAimOn ? 2.2 : 3; a.setXYZ(0, P.x + _wv0.x * s0, P.y + _wv0.y * s0, P.z + _wv0.z * s0); a.setXYZ(1, reticle.position.x, reticle.position.y, reticle.position.z); a.needsUpdate = true; aimLine.geometry.computeBoundingSphere();
  }
  beam3.visible = rope.obj.visible = false;
  if (T.lvl) {
    const pod = T.pod, zo = inCave ? T.zOff / CS : 0;
    podMesh.position.set(pod.x, pod.y, 0); podMesh.visible = T.base.kind === 'enemy' && !T.base.st.podTaken;
    if (BASES[0].resTank) BASES[0].resTank.userData.bar.scale.y = Math.max(0.01, G.res / RES_MAX);
    beam3.visible = inCave && T.alive && T.beamOn && G.fuel > 0;
    if (beam3.visible) { beam3.position.set(T.x - Math.sin(T.ang) * 3.6, T.y - Math.cos(T.ang) * 3.6, zo); beam3.rotation.z = -T.ang; }
    rope.obj.visible = inCave && pod.attached;
    if (rope.obj.visible) rope.set(T.x, T.y, zo, pod.x, pod.y, 0);
    for (const t of T.turrets) if (t.alive) t.mesh.userData.barrel.rotation.z = t.ang;
    tPartCloud.begin(); drawParts(T.parts, tPartCloud); tPartCloud.end();
    tBulCloud.begin();
    for (const b of T.bullets) tBulCloud.add(b.x, b.y, 0, .5, 1, 1);
    for (const b of T.tb) tBulCloud.add(b.x, b.y, 0, 1, .4, .2);
    tBulCloud.end();
  }
}

let last = performance.now(), fpsAcc = 0, fpsN = 0, fogT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const now0 = performance.now();
  updateDynRes(now - last);
  // the sims substep, so they keep real time down to 10 fps. Never zero or negative: two frames with the same (or an
  // earlier) timestamp gave dt = 0 and the flight models divide by their step (NaN everywhere, seen in headless runs)
  const rdt = (now - last) / 1000, dt = Math.min(Math.max(rdt, 1e-3), 0.1); last = now;
  fpsAcc += rdt; fpsN++; if (fpsAcc > 1) { $('dbg').textContent = `${Math.round(fpsN / fpsAcc)} fps  ·  res ${Math.round(pixRatio * 100)}%`; fpsAcc = 0; fpsN = 0; }
  CTL.poll(dt);
  const inp = readInput();
  if (inp.start && !padWasStart) { sfx.init(); if (G.state === 'paused') menuPick(); else pressStart(); }
  padWasStart = inp.start;
  if (G.state !== 'paused') war.tickSea(dt);   // SEAWORLD: the sea's clock and the weather (the title screen too)
  if (G.msgT > 0) { G.msgT -= dt; if (G.msgT <= 0 && G.state !== 'paused') say(''); }
  if (G.state === 'play') {
    if (G.mode === 'zarch') updateZarch(dt, inp); else updateThrust(dt, inp);
    war.update(dt, PL, params.has('peace'));
    if (G.mode === 'zarch') { crafts.afterWar(); seats.afterWar(dt); }   // FOUNDATION: decks moved - the soldier, vehicles, parked jets catch up (ngc/interiors: the troops in their seats)
    if (G.mode === 'zarch') { const c0 = performance.now(); CW.step(dt); PROF.cw += (performance.now() - c0 + CW.stats.ms - PROF.cw) * 0.05; CW.stats.ms = 0; }   // COLLISION: contacts between moving bodies (pushes, knocks, hits)
    fogT -= dt; if (fogT <= 0) { fogT = 0.25; fog.update(war.visionSources(PL)); war.setVisibility(fog); updateFogImg(); }
  } else if (G.state === 'trans') {
    const tr = G.tr; tr.t += dt; const D = 0.8;
    if (tr.phase === 0) { $('fade').style.opacity = Math.min(1, tr.t / D); if (tr.t >= D) { tr.swap(); tr.phase = 1; tr.t = 0; } }
    else { $('fade').style.opacity = Math.max(0, 1 - tr.t / D); if (tr.t >= D) { G.state = 'play'; $('fade').style.opacity = 0; $('fadeText').textContent = ''; } }
  }
  fx.update(dt);
  sealife.update(G.state === 'paused' ? 0 : dt);   // SEALIFE
  const t1 = performance.now();
  updateCamsAndMeshes(dt, now / 1000);
  world.update(dt, zCam, G.state === 'play');   // WORLD: stream the lived-in world round the camera, ambient life
  commander.update(dt, G.state !== 'title');   // COMMANDER: the fleet strip under the score, the open board's statuses
  pool.update(dt, G.state === 'play' && G.mode === 'zarch'); if (motorPick > 0) motorPick -= dt;   // ngc/wheeledgame: parked / town / traffic vehicles, MG rounds, engine sound
  updateHud();
  { const hide = drop.flying || helm.active ? 'none' : ''; setStyle('bot', 'display', hide); setStyle('caution', 'display', hide); }
  const t2 = performance.now();
  fx.setView(zCam, renderer.domElement.height, zScene.fog);
  if (G.mode === 'zarch') interiors.update(G.state === 'paused' ? 0 : dt, zCam);   // ngc/interiors: doors swing, rooms near the camera, the carrier's inside
  { const a = G.craft !== 'heli' && G.state !== 'title' ? crafts.active : null; if (!(a && a.renderView && a.renderView(renderer, zScene, zCam))) renderer.render(zScene, zCam); }   // ARMOUR: a craft may draw the frame itself (the TTS thermal sight)
  if (G.craft === 'foot' && G.state !== 'title' && G.mode === 'zarch') foot.overlay(renderer, zCam);   // wave 2: the Marine's arms and weapon, their own pass
  const t3 = performance.now(), pk = 0.05;   // smoothed per-frame CPU cost: sim, scene/HUD prep, render submit
  PROF.sim += ((t1 - now0) - PROF.sim) * pk; PROF.prep += ((t2 - t1) - PROF.prep) * pk; PROF.render += ((t3 - t2) - PROF.render) * pk;
}
const PROF = { sim: 0, prep: 0, render: 0, cw: 0 };   // (cw: the collision world's step + this frame's circle pushes, ms)
buildCaves(); war.reset(); resetZarch(true); placeVehicles(); updateFogImg(); terrainStream(Z.pos.x, Z.pos.z);
requestAnimationFrame(frame);
if (params.has('debug')) { window.__G = { PROF_LOAD, fineTerrain, terrain, G, m60C, m113C, AW, HARDS, armDelivery, deliverArmour, cmH, RWR , tomcatC, Z, T, H, HI, SY, HELI, helm, toggleHelm, get ckFov() { return ckFov; }, setCkFov, menuKey, D, JP, CTL, view, islandH, HW, forest, groundY, inZone, launchJet, swapToHeli, get cockpitCam() { return cockpitCam; }, set cockpitCam(v) { cockpitCam = v; }, THREE, fx, PL, ISLANDS, PADS, PAD, HOME_B, terrainH, head, hurtHeli, cockpit, drop, callLogistics, openMenu, menuPick, get menu() { return menu; }, zCam, PROF, renderer, newGame, war, fog, nav, BASES, command, get selIsl() { return selIsl; }, set selIsl(v) { selIsl = v; }, enterCave, respawnHome, exitCave, get camB() { return camB; }, crafts, foot, GR, pool, get carC() { return pool.first('m151'); }, jetC, heliC, getInOut, deliverVehicle, toHeli, stowCrafts, hurtPlayer, marine, sealife, fleet, commander, roster, heliAI, autoNext, killPlayerZ, CW, TREES, fellTree, RSTAT }; if (params.has("auto")) newGame(); if (params.has('thrust')) { newGame(); const b = BASES[+params.get('thrust') || 0]; Z.pos.set(b.x, b.h - 1, b.z); Z.vel.set(0, -4, 0); enterCave(b); } }
