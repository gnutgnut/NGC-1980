// F-14A TOMCAT cockpits, 1980: analog, both seats, as 3D interiors in Tomcat-local space (x right, y up, nose -z,
// origin at the CG; units/air/tomcatmodel.js frame) so they ride with the airframe and free look finds a whole cockpit.
//
// PILOT (front):
// - AVG-12 HUD on the glare shield: 1980 symbology drawn on the combiner and projected from the pilot's eye, so it is
//   conformal: horizon and pitch bars every 5° (dashed below the horizon), velocity vector, waterline, heading scale;
//   modes T.O. / CRUISE / A/A / A/G / LDG (LDG: the AoA "E" bracket and the ICLS needles off the ALBATROSS; A/A: the
//   Sidewinder seeker circle, the Sparrow / Phoenix ASE circle and steering dot, the target diamond, the lead-computing
//   gun pipper with its range bar).
// - VDI (vertical display indicator): green CRT "contact analog" horizon with a perspective ground grid, pitch lines,
//   heading, and the ship and needles on approach. HSD (horizontal situation display): compass rose, TACAN to the
//   ALBATROSS, the selected island as the waypoint; or a repeat of the RIO's TID (click the HSD's mode button).
// - Steam gauges: AoA tape in units (15 = on speed), airspeed with a Mach window, counter-pointer altimeter, VSI,
//   standby ADI, accelerometer with max / min tell-tales, wing sweep indicator (position needle, command bug, AUTO /
//   MAN / EMER / OVER window), flap and slat indicator, TF30 RPM / TIT / fuel flow / nozzle pairs, oil pressure, fuel
//   quantity (feed tapes, totaliser, BINGO bug), clock, ALR-45 radar warning scope, gear indicator with barber poles.
// - Lights: MASTER CAUTION, WHEELS, ALT LOW, L / R FIRE (push to discharge the bottle), LAUNCH (RWR), the AoA indexer
//   on the glare shield, the caution / advisory panel (28 captions: amber cautions, green advisories) on the right knee
//   panel. Everything goes dark without the essential bus (tomcatsys.js electrics).
// - Controls you can click (hover: a frame round it and its placard + position on the hint line): gear handle, hook
//   handle, flap handle, master arm, weapon select, HUD mode buttons, FIRE lights, ACM jettison; left console: the
//   throttles' OFF / IDLE finger lifts, their sweep switch (FWD / AFT / AUTO), FUEL DUMP, STAB AUG PITCH / ROLL / YAW,
//   autopilot ENGAGE / ALT; the emergency wing sweep handle on the sill (the guard up: EMER; the handle fore / aft in
//   5° steps, past 68° on deck: OVERSWEEP); right console: L / R GEN, the 3-way ENG CRANK switch (L - OFF - R, it
//   drops out at 50% rpm), exterior lights, the canopy and parking brake handles; the ejection face curtain over your
//   head and the lower handle.
// - The stick, the two throttles (OFF behind the IDLE stop, MIL and afterburner detents), the rudder pedals and toe
//   brakes move. The RIO sits behind you (seen over either shoulder), working his TID, now and then checking six.
// RIO (back): the TID (round tactical information display: tracks, the hooked track's data, range scales), the DDD
// (detail data display: the AWG-9's pulse-doppler range / azimuth scope, the STT lock gate), the RWR repeat, the
// armament panel (PH / SP / SW, LAUNCH), standby airspeed / altimeter / clock, the hand control unit, his own
// ejection handle and the command selector (MCO: one pull ejects both, the RIO first).
import * as THREE from 'three';
import { KT, FT, LB } from './airframe.js';
import { arch, loft as mkLoft, tube } from './meshkit.js';
import { TCAT } from './tomcatmodel.js';
import { TAU, D2R, SANS, MONO, clamp, canvasTex, P2, txt, faceBg, band, radial, needle, hub, offFlag, barber, lin, dialFace, drum } from './gaugekit.js';

export const TEYE = [new THREE.Vector3(0, 1.04, -5.45), new THREE.Vector3(0, 1.08, -4.22)];   // pilot, RIO
const HUD = { z: -6.12, cy: 1.05, hw: 0.13, hh: 0.12, W: 560, H: 518 };
const GRN = '#7dff8a';
const deg = r => r * 180 / Math.PI;
const units = a => clamp(deg(a) * 1.43, -2, 32);   // AoA units (15 = on speed = ~10.5°; tomcatbench / NATOPS chart, INFERRED)
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _iq = new THREE.Quaternion(), _eye = new THREE.Vector3();
// the caution / advisory panel, 7 rows of 4 (amber cautions; the green ADVISORIES do not light the MASTER CAUTION)
export const CAUTS = [
  'L GEN', 'R GEN', 'L OIL PRESS', 'R OIL PRESS', 'L OIL HOT', 'R OIL HOT', 'L FUEL PRESS', 'R FUEL PRESS',
  'L INLET', 'R INLET', 'HYD PRESS', 'EMERG GEN', 'TRANS/RECT', 'WING SWEEP', 'CADC', 'AUTO PILOT',
  'PITCH STAB', 'ROLL STAB', 'YAW STAB', 'FUEL LEAK', 'FUEL LOW', 'BINGO', 'CANOPY', 'HOOK',
  'START VALVE', 'LADDER', 'SPD BRK', 'LAUNCH BAR',
];
export const ADVS = ['START VALVE', 'LADDER', 'SPD BRK', 'LAUNCH BAR'];

export function buildTomcatCockpit() {
  const g = new THREE.Group(); g.visible = false; g.name = 'tomcatCockpit';
  // interior: lit through the canopy, so every surface gets some self-light (like the Hornet's and the Huey's)
  const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.45), ...o });
  const grey = M(0x3e4449), dark = M(0x1d2023), black = M(0x0a0b0c), tubM = M(0x4a5056), suit = M(0x5b6340), glove = M(0x3a2c22);
  const yellow = M(0xd8b018), redM = M(0xb81a10), metal = M(0x7a8086), seatM = M(0x2f3336), cushion = M(0x3d4a35), helmW = M(0xe8eae4), batM = M(0xd6d6ce);
  const lit = c => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  const box = (w, h, d, m, x, y, z, p = g, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); p.add(o); return o; };
  const cyl = (r0, r1, h, m, x, y, z, p = g, rx = 0, rz = 0, seg = 10) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); p.add(o); return o; };
  const plane = (w, h, mat, x, y, z, p = g, rx = 0, ry = 0) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); o.position.set(x, y, z); o.rotation.set(rx, ry, 0); p.add(o); return o; };
  const limb = (a, b, r, m, p = g) => { const d = new THREE.Vector3().subVectors(b, a), o = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, d.length(), 7), m); o.position.copy(a).add(b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); p.add(o); return o; };
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // ================================================================ tubs (pilot z -6.45 .. -4.95, RIO -4.95 .. -3.3)
  const X = 0.55, SILL = 0.74;
  for (const s of [-1, 1]) {
    box(0.03, 1.05, 3.2, tubM, s * (X + 0.015), 0.23, -4.85);                 // side walls up to the sill
    box(0.1, 0.035, 3.2, grey, s * (X - 0.03), SILL, -4.85);                  // canopy rail
    box(0.2, 0.32, 1.45, grey, s * 0.44, 0.27, -5.5);                         // pilot's side consoles
    box(0.2, 0.32, 1.25, grey, s * 0.44, 0.31, -3.95);                        // RIO's side consoles
  }
  box(1.1, 0.03, 3.2, dark, 0, -0.2, -4.85);                                   // floor
  box(1.1, 1.0, 0.04, tubM, 0, 0.3, -3.3);                                     // aft bulkhead behind the RIO
  box(0.7, 0.5, 0.55, dark, 0, 0.0, -6.42);                                    // pilot's pedal well / under the panel
  // glare shield: a padded coaming over the panel, sloping down to the windscreen
  const hoodM = M(0x141618, { side: THREE.DoubleSide }); g.add(new THREE.Mesh(mkLoft([arch(-6.13, 0.84, 0.5, 0.76, 13), arch(-6.45, 0.82, 0.54, 0.75, 13), arch(-6.8, 0.79, 0.55, 0.73, 13)]), hoodM));   // the coaming, curved
  tube(arch(-6.13, 0.845, 0.5, 0.76), 0.012, black, g, 'hoodLip');   // padded lip toward the pilot

  // ================================================================ windscreen, canopy (inside view; the model's shell is hidden)
  const glass = new THREE.MeshBasicMaterial({ color: 0xb8dcff, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide });
  const frameM = M(0x2b2f33);
  const wsR = [arch(-6.85, 0.8, 0.56, 0.72, 13), arch(-6.55, 1.12, 0.59, 0.73, 13), arch(-6.2, 1.38, 0.6, 0.74, 13)];
  const ws = new THREE.Mesh(mkLoft(wsR), glass); ws.renderOrder = 5; g.add(ws);
  tube(arch(-6.2, 1.39, 0.605, 0.74), 0.03, frameM, g, 'wsBow'); tube(arch(-6.84, 0.81, 0.565, 0.72), 0.02, frameM, g, 'wsBase');
  for (const s of [-1, 1]) tube([[s * 0.56, 0.72, -6.85], [s * 0.59, 0.73, -6.55], [s * 0.6, 0.74, -6.2]], 0.02, frameM, g, 'wsPost');
  for (const x of [-0.18, 0, 0.18]) box(0.11, 0.035, 0.015, metal, x, 1.33, -6.17);   // rear-view mirrors on the bow
  const canopyG = new THREE.Group(); canopyG.position.set(...TCAT.CANOPY_HINGE); g.add(canopyG);
  const cvv = new THREE.Group(); cvv.position.set(...TCAT.CANOPY_HINGE).negate(); canopyG.add(cvv);
  const cr = [[-6.2, 1.38, .6, .74], [-5.6, 1.58, .64, .74], [-4.9, 1.64, .65, .74], [-4.2, 1.6, .64, .75], [-3.7, 1.44, .6, .76], [-3.35, 1.22, .5, .85], [-3.1, 1.05, .38, .95]];
  const cnp = new THREE.Mesh(mkLoft(cr.map(c => arch(...c, 13))), glass); cnp.renderOrder = 5; cvv.add(cnp);
  tube(arch(-4.86, 1.63, 0.64, 0.74), 0.025, frameM, cvv, 'midBow');
  for (const s of [-1, 1]) tube(cr.map(([z, , hw, b]) => [s * (hw - 0.01), b + 0.01, z]), 0.03, frameM, cvv, 'sill');
  box(0.6, 0.08, 0.06, frameM, 0, 1.6, -4.9, cvv);                              // canopy bow handgrip bar
  // pilot's seat (GRU-7A) with the face-curtain handle over the headbox
  const seat = (z, y0) => {
    const s = new THREE.Group(); s.position.set(0, y0, z); s.name = 'seat'; g.add(s);
    box(0.5, 0.1, 0.5, seatM, 0, 0.18, -0.22, s); box(0.44, 0.06, 0.44, cushion, 0, 0.25, -0.22, s);
    box(0.52, 1.0, 0.12, seatM, 0, 0.7, 0.08, s, -0.16); box(0.44, 0.84, 0.04, cushion, 0, 0.68, 0.0, s, -0.16);
    box(0.38, 0.3, 0.24, seatM, 0, 1.3, 0.24, s, -0.16);                     // headbox (parachute)
    for (const k of [-1, 1]) box(0.05, 1.15, 0.1, metal, k * 0.27, 0.65, 0.14, s, -0.16);   // rails
    const fc = new THREE.Group(); fc.position.set(0, 1.5, 0.22); s.add(fc);       // face curtain handle: yellow / black loop
    for (let i = 0; i < 7; i++) box(0.03, 0.025, 0.025, i % 2 ? black : yellow, -0.09 + i * 0.03, 0.02, -0.12, fc);
    for (const k of [-1, 1]) box(0.025, 0.07, 0.025, yellow, k * 0.1, -0.01, -0.1, fc);
    const lh = new THREE.Group(); lh.position.set(0, 0.24, -0.5); s.add(lh);     // lower ejection handle between the knees
    for (let i = 0; i < 5; i++) box(0.03, 0.02, 0.02, i % 2 ? black : yellow, -0.06 + i * 0.03, 0.02, 0, lh);
    return s;
  };
  seat(-5.15, 0.05);   // pilot
  seat(-3.9, 0.1);     // RIO
  // the pilot as the RIO sees him: helmet and shoulders over the headbox (hidden from the front seat)
  const pilotFig = new THREE.Group(); g.add(pilotFig);
  box(0.46, 0.28, 0.3, suit, 0, 0.82, -5.2, pilotFig);
  { const h = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), helmW); h.position.set(0, 1.08, -5.38); pilotFig.add(h); }

  // ================================================================ the HUD (AVG-12) on the glare shield
  const hud = canvasTex(HUD.W, HUD.H);
  const hudMesh = new THREE.Mesh(new THREE.PlaneGeometry(HUD.hw * 2, HUD.hh * 2), new THREE.MeshBasicMaterial({ map: hud.tex, transparent: true, depthWrite: false, toneMapped: false }));
  hudMesh.position.set(0, HUD.cy, HUD.z); hudMesh.renderOrder = 6; g.add(hudMesh);
  const comb = new THREE.Mesh(new THREE.PlaneGeometry(HUD.hw * 2, HUD.hh * 2), new THREE.MeshBasicMaterial({ color: 0x9fe8c0, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }));
  comb.position.set(0, HUD.cy, HUD.z - 0.004); comb.renderOrder = 5; g.add(comb);
  for (const s of [-1, 1]) box(0.006, 0.33, 0.01, black, s * (HUD.hw + 0.004), 1.015, HUD.z);   // thin combiner frame down to the projector
  box(0.26, 0.012, 0.012, black, 0, HUD.cy - HUD.hh - 0.006, HUD.z);
  box(0.24, 0.04, 0.16, black, 0, 0.83, -6.2);                                // projector, down in the coaming

  // ================================================================ the main instrument panel (tilted back)
  const P = new THREE.Group(); P.position.set(0, 0.5, -6.22); P.rotation.x = -0.3; g.add(P);
  const PW = 1.1, PH = 0.66;
  box(PW, PH, 0.05, dark, 0, 0, -0.03, P);
  const art = canvasTex(1100, 660);
  plane(PW, PH, new THREE.MeshLambertMaterial({ map: art.tex, emissive: 0xffffff, emissiveMap: art.tex, emissiveIntensity: 0.55 }), 0, 0, 0, P);
  // ---- round gauges: [x, y, diameter] on the panel
  const GL = {
    sweep: [-0.405, 0.185, 0.11], asi: [-0.275, 0.185, 0.105], flap: [-0.405, 0.06, 0.085], gmeter: [-0.29, 0.06, 0.095],
    alt: [0.17, 0.2, 0.1], vsi: [0.17, 0.085, 0.09], adi: [0.17, -0.03, 0.09], clock: [0.17, -0.145, 0.07],
    rpmL: [0.285, 0.235, 0.08], rpmR: [0.375, 0.235, 0.08], titL: [0.285, 0.14, 0.08], titR: [0.375, 0.14, 0.08],
    ffL: [0.285, 0.045, 0.08], ffR: [0.375, 0.045, 0.08], nozL: [0.285, -0.05, 0.08], nozR: [0.375, -0.05, 0.08],
    oil: [0.48, 0.045, 0.075], rwr: [0.48, 0.2, 0.09],
  };
  const gauges = [], ringM = M(0x26282a);
  function gauge(key, size, face, dyn, p = P, gl = GL) {
    const [x, y, d] = gl[key], t = canvasTex(size, size), o = new THREE.Mesh(new THREE.CircleGeometry(d / 2, 36), new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false, color: 0xdedede }));
    o.position.set(x, y, 0.004); p.add(o);
    const ring = new THREE.Mesh(new THREE.RingGeometry(d / 2, d / 2 + 0.006, 36), ringM); ring.position.set(x, y, 0.006); p.add(ring);
    let bg = null; if (face) { bg = document.createElement('canvas'); bg.width = bg.height = size; face(bg.getContext('2d'), size); }
    const G = { key, W: size, ...t, bg, dyn, i: gauges.length, seat: p === P || p === g ? 0 : 1 }; gauges.push(G); return G;
  }
  // rectangular instruments (tapes, indicators) on their own canvas
  const rects = [];
  function rect(key, w, h, px, x, y, dyn, p = P, seatI = 0) { const t = canvasTex(Math.round(w * px), Math.round(h * px)), o = plane(w, h, new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false, color: 0xdedede }), x, y, 0.004, p); const R = { key, ...t, dyn, mesh: o, seat: seatI }; rects.push(R); return R; }
  // CRT displays: green phosphor, a bezel
  const crt = (w, h, px, x, y, p = P) => { box(w + 0.03, h + 0.03, 0.03, black, x, y, -0.005, p); const t = canvasTex(Math.round(w * px), Math.round(h * px)); const o = plane(w, h, new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false }), x, y, 0.012, p); return { ...t, mesh: o }; };
  const vdi = crt(0.2, 0.18, 2400, 0, 0.13), hsd = crt(0.17, 0.17, 2400, 0, -0.13);

  // ---- caption lamps: two pre-drawn textures (off / on), swapped by setLamp
  function lamp(parent, w, h, x, y, z, text, on, off = '#2a2420', ink = '#111', rx = 0, ry = 0) {
    const mk = litOn => { const W = Math.round(w * 2400), H = Math.round(h * 2400), t = canvasTex(W, H), c = t.ctx; c.fillStyle = litOn ? on : off; c.fillRect(0, 0, W, H); c.strokeStyle = '#000'; c.lineWidth = 4; c.strokeRect(0, 0, W, H);
      const L = text.split('|'); L.forEach((s, i) => txt(c, s, W / 2, H / 2 + (i - (L.length - 1) / 2) * H * 0.4, litOn ? ink : '#5c5650', H * (L.length > 1 ? 0.34 : 0.5))); t.tex.needsUpdate = true; return t.tex; };
    const tOff = mk(false), tOn = mk(true), o = plane(w, h, new THREE.MeshBasicMaterial({ map: tOff, toneMapped: false }), x, y, z, parent, rx, ry);
    o.userData = { tOn, tOff, on: false }; return o;
  }
  const setLamp = (o, v) => { v = !!v; if (o.userData.on !== v) { o.userData.on = v; o.material.map = v ? o.userData.tOn : o.userData.tOff; } };
  const L = {
    mc: lamp(P, 0.075, 0.032, -0.47, 0.295, 0.005, 'MASTER|CAUTION', '#ffaa18', '#2e2408'),
    wheels: lamp(P, 0.07, 0.03, -0.37, 0.295, 0.005, 'WHEELS', '#ff2a14', '#3a0e08'),
    altlo: lamp(P, 0.06, 0.03, -0.155, -0.27, 0.005, 'ALT|LOW', '#ff2a14', '#3a0e08'),
    launch: lamp(P, 0.065, 0.03, 0.48, 0.295, 0.005, 'LAUNCH', '#ff2a14', '#3a0e08'),
    acm: lamp(P, 0.055, 0.026, -0.275, 0.295, 0.005, 'ACM', '#3cff50', '#0e2410'),
    sweep: lamp(P, 0.065, 0.026, -0.405, 0.255, 0.005, 'SWEEP', '#ffaa18', '#2e2408'),
    hook: lamp(P, 0.05, 0.026, 0.49, -0.27, 0.005, 'HOOK', '#ffaa18', '#2e2408'),
    fireL: lamp(g, 0.075, 0.034, -0.38, 0.875, -6.15, 'L FIRE', '#ff2a14', '#3a0e08', '#111', -0.5),
    fireR: lamp(g, 0.075, 0.034, 0.38, 0.875, -6.15, 'R FIRE', '#ff2a14', '#3a0e08', '#111', -0.5),
  };
  // AoA indexer, left of the HUD: green ˅ (slow / high AoA), amber ○ (on speed), red ˄ (fast)
  const idx = (() => {
    const mk = (draw, col) => { const t = canvasTex(64, 64); t.ctx.clearRect(0, 0, 64, 64); draw(t.ctx, col); t.tex.needsUpdate = true; return t.tex; };
    const chev = (dn) => (c, col) => { c.strokeStyle = col; c.lineWidth = 10; c.beginPath(); if (dn) { c.moveTo(8, 18); c.lineTo(32, 46); c.lineTo(56, 18); } else { c.moveTo(8, 46); c.lineTo(32, 18); c.lineTo(56, 46); } c.stroke(); };
    const ring = (c, col) => { c.strokeStyle = col; c.lineWidth = 9; c.beginPath(); c.arc(32, 32, 20, 0, TAU); c.stroke(); };
    const mkLamp = (draw, on, y) => { const tOn = mk(draw, on), tOff = mk(draw, '#222'); const o = plane(0.018, 0.018, new THREE.MeshBasicMaterial({ map: tOff, transparent: true, toneMapped: false }), -0.185, y, -6.128, g); o.userData = { tOn, tOff, on: false }; return o; };
    return { hi: mkLamp(chev(true), '#40ff50', 0.95), on: mkLamp(ring, '#ffb020', 0.93), lo: mkLamp(chev(false), '#ff3a20', 0.91) };
  })();
  box(0.026, 0.066, 0.012, black, -0.185, 0.93, -6.136);
  // caution / advisory panel on the right knee panel (a slanted face right of the main panel)
  const KP = new THREE.Group(); KP.position.set(0.525, 0.56, -5.72); KP.rotation.set(0, -Math.PI / 2 + 0.25, 0); g.add(KP);
  box(0.24, 0.232, 0.03, dark, 0, 0, -0.016, KP);
  const caut = canvasTex(480, 462); plane(0.22, 0.212, new THREE.MeshBasicMaterial({ map: caut.tex, toneMapped: false }), 0, 0, 0.001, KP);

  // ================================================================ switches, handles and their hit boxes
  const hitM = new THREE.MeshBasicMaterial({ visible: false }), hitsP = [], hitsR = [], sw = {};
  const hit = (id, w, h, d, x, y, z, p, label, list = hitsP) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitM); o.position.set(x, y, z); o.userData.sw = id; o.userData.label = label; p.add(o); list.push(o); return o; };
  const toggle = (id, p, x, y, label, list = hitsP, hw = 0.045) => {   // a bat on a panel (local z = out of the face)
    cyl(0.009, 0.009, 0.006, metal, x, y, 0.003, p, Math.PI / 2);
    const piv = new THREE.Group(); piv.position.set(x, y, 0.005); p.add(piv);
    cyl(0.0035, 0.005, 0.03, batM, 0, 0, 0.015, piv, Math.PI / 2);
    hit(id, hw, 0.05, 0.05, x, y, 0.02, p, label, list); sw[id] = piv; return piv;
  };
  const button = (id, p, x, y, w, h, mat, label, list = hitsP) => { const b = box(w, h, 0.012, mat, x, y, 0.006, p); hit(id, w + 0.012, h + 0.012, 0.04, x, y, 0.015, p, label, list); return b; };
  // panel: gear handle (wheel knob, red light in it), hook handle, master arm, weapon select, HUD mode buttons, ACM jett
  const gearH = new THREE.Group(); gearH.position.set(-0.49, -0.17, 0.02); P.add(gearH);
  box(0.014, 0.1, 0.014, metal, 0, 0, 0, gearH); cyl(0.028, 0.028, 0.022, M(0xe8e8e0), 0, 0.055, 0, gearH, Math.PI / 2, 0, 14);
  const gearRed = new THREE.Mesh(new THREE.CircleGeometry(0.012, 10), lit(0x300808)); gearRed.position.set(0, 0.055, 0.012); gearH.add(gearRed);
  hit('gear', 0.07, 0.15, 0.08, -0.49, -0.15, 0.03, P, 'LANDING GEAR');
  const hookH = new THREE.Group(); hookH.position.set(0.49, -0.17, 0.02); P.add(hookH);
  box(0.014, 0.1, 0.014, metal, 0, 0, 0, hookH); box(0.06, 0.02, 0.03, yellow, 0, 0.055, 0.006, hookH);
  hit('hook', 0.07, 0.15, 0.08, 0.49, -0.15, 0.03, P, 'ARRESTING HOOK');
  toggle('arm', P, -0.36, -0.115, 'MASTER ARM');
  button('wpn', P, -0.27, -0.115, 0.05, 0.03, M(0x50565c), 'WEAPON SELECT  SW / SP / PH / GUN');
  const MODES = ['T.O.', 'CRUISE', 'A/A', 'A/G', 'LDG'], modeB = {};
  MODES.forEach((m, i) => { modeB[m] = button('hud:' + m, P, -0.1 + i * 0.05, 0.27, 0.04, 0.022, M(0x50565c), `HUD MODE ${m}`); });
  const hsdB = button('hsdmode', P, 0.115, -0.2, 0.03, 0.02, M(0x50565c), 'HSD  NAV / TID REPEAT');
  hit('mc', 0.085, 0.04, 0.03, -0.47, 0.295, 0.01, P, 'MASTER CAUTION RESET');
  const jettB = cyl(0.016, 0.016, 0.012, redM, -0.47, -0.27, 0.008, P, Math.PI / 2, 0, 12); hit('jett', 0.05, 0.05, 0.03, -0.47, -0.27, 0.01, P, 'ACM JETTISON (STORES)');
  hit('fireL', 0.08, 0.05, 0.04, -0.38, 0.875, -6.15, g, 'L FIRE  -  PUSH TO DISCHARGE'); hit('fireR', 0.08, 0.05, 0.04, 0.38, 0.875, -6.15, g, 'R FIRE  -  PUSH TO DISCHARGE');
  // left console (flat, facing up; canvas top = forward): throttle quadrant, sweep handle, flaps, AFCS, crank
  const conL = canvasTex(440, 1520), conR = canvasTex(440, 1520); conL.ctx.scale(2, 2); conR.ctx.scale(2, 2);   // drawn in 220 x 760 units at 2x for legible placards
  const LC = new THREE.Group(); LC.position.set(-0.44, 0.432, -5.5); LC.rotation.x = -Math.PI / 2; g.add(LC);
  const RC = new THREE.Group(); RC.position.set(0.44, 0.432, -5.5); RC.rotation.x = -Math.PI / 2; g.add(RC);
  plane(0.2, 0.69, new THREE.MeshLambertMaterial({ map: conL.tex, emissive: 0xffffff, emissiveMap: conL.tex, emissiveIntensity: 0.55 }), 0, 0, 0.001, LC);
  plane(0.2, 0.69, new THREE.MeshLambertMaterial({ map: conR.tex, emissive: 0xffffff, emissiveMap: conR.tex, emissiveIntensity: 0.55 }), 0, 0, 0.001, RC);
  // console-local: x right, y forward (along -z world), z up. Throttles run along y.
  const thr = [-0.032, 0.026].map((x, i) => {   // two levers; the outboard grip carries the sweep switch, the inboard the speed brake
    const t = new THREE.Group(); t.position.set(x, 0, 0); LC.add(t); box(0.012, 0.014, 0.1, metal, 0, 0, 0.05, t);
    const grip = box(i ? 0.045 : 0.052, 0.055, 0.11, M(0x24272a), i ? 0.004 : -0.006, -0.01, 0.14, t); grip.rotation.x = 0.28;
    box(0.02, 0.012, 0.012, i ? M(0x9a9a92) : redM, i ? 0.012 : -0.03, 0.0, 0.17, t);   // switches on the grips
    return t;
  });
  box(0.075, 0.3, 0.012, black, 0, 0.0, 0.002, LC);   // throttle slot
  box(0.012, 0.006, 0.014, yellow, -0.045, 0.092, 0.008, LC); box(0.012, 0.006, 0.014, yellow, 0.045, 0.092, 0.008, LC);   // the afterburner detent (84%: -0.11 + 0.24 x 0.84)
  box(0.012, 0.006, 0.014, M(0xe0e0d8), -0.045, 0.082, 0.008, LC);   // MIL (80%)
  const sweepSw = box(0.012, 0.016, 0.012, M(0xd0d0c8), -0.04, 0.0, 0.16, thr[0]);   // thumb switch on the outboard grip
  hit('sweepFwd', 0.05, 0.035, 0.05, -0.035, 0.035, 0.15, LC, 'WING SWEEP  FWD (MAN)'); hit('sweepAft', 0.05, 0.035, 0.05, -0.035, -0.035, 0.15, LC, 'WING SWEEP  AFT (MAN)');
  hit('sweepAuto', 0.04, 0.03, 0.04, 0.03, 0.0, 0.17, LC, 'WING SWEEP  AUTO');
  // the throttles' OFF / IDLE finger lifts (lift and the lever comes back over the IDLE stop to OFF, or forward to IDLE
  // for the start), on the outboard side of each lever's base: they ride with the levers
  thr.forEach((t, i) => { box(0.018, 0.014, 0.012, M(0xe8e8e0), i ? 0.014 : -0.014, -0.03, 0.03, t); hit(i ? 'thrR' : 'thrL', 0.03, 0.045, 0.06, i ? 0.016 : -0.016, -0.03, 0.04, t, `${i ? 'RIGHT' : 'LEFT'} THROTTLE  OFF / IDLE  (FINGER LIFT)`); });
  box(0.012, 0.006, 0.014, M(0xb03020), -0.045, -0.11, 0.008, LC); box(0.012, 0.006, 0.014, M(0xb03020), 0.045, -0.11, 0.008, LC);   // the IDLE stop (OFF is behind it)
  // emergency wing sweep handle: outboard on the sill, quadrant 20 (forward) .. 68 .. OVER (aft), a red guard over the
  // slot's forward end holds it stowed at 20° (guard up = EMER: the wings follow the handle; aft past 68° on deck = OVERSWEEP)
  const EH = new THREE.Group(); EH.position.set(-0.505, 0.6, -5.5); g.add(EH);
  box(0.03, 0.02, 0.36, dark, 0, 0, 0, EH);
  for (let v = 20; v <= 76; v += 8) box(0.034, 0.003, 0.004, M(0xe6e2cf), 0, 0.011, -0.15 + 0.3 * (Math.min(v, 75) - 20) / 55, EH);   // quadrant marks
  const ehLever = new THREE.Group(); EH.add(ehLever); box(0.012, 0.1, 0.012, metal, 0, 0.05, 0, ehLever); box(0.06, 0.02, 0.025, M(0xe8e8e0), 0, 0.1, 0, ehLever);
  const ehGuard = new THREE.Group(); ehGuard.position.set(0, 0.012, -0.19); EH.add(ehGuard); box(0.04, 0.008, 0.09, redM, 0, 0, 0.045, ehGuard);
  hit('emer', 0.06, 0.06, 0.1, -0.505, 0.63, -5.64, g, 'EMERGENCY WING SWEEP  -  GUARD (UP = EMER, DOWN = AUTO)');
  hit('emerFwd', 0.06, 0.13, 0.11, -0.505, 0.65, -5.535, g, 'EMERGENCY WING SWEEP HANDLE  -  FORWARD 5°');
  hit('emerAft', 0.06, 0.13, 0.15, -0.505, 0.65, -5.405, g, 'EMERGENCY WING SWEEP HANDLE  -  AFT 5°');
  // flap handle forward on the left console; FUEL MGMT (DUMP) beside it; AFCS panel aft (three STAB AUG channels, the
  // autopilot's ENGAGE and ALT)
  const flapH = new THREE.Group(); flapH.position.set(-0.05, 0.27, 0.0); LC.add(flapH); box(0.01, 0.01, 0.07, metal, 0, 0, 0.035, flapH); box(0.04, 0.02, 0.02, M(0xe8e8e0), 0, 0, 0.075, flapH);
  hit('flaps', 0.06, 0.06, 0.1, -0.05, 0.27, 0.05, LC, 'FLAPS  UP / DN');
  toggle('dump', LC, 0.05, 0.27, 'FUEL DUMP', hitsP, 0.04);
  toggle('sasP', LC, -0.07, -0.215, 'STAB AUG  PITCH', hitsP, 0.032); toggle('sasR', LC, -0.035, -0.215, 'STAB AUG  ROLL', hitsP, 0.032); toggle('sasY', LC, 0.0, -0.215, 'STAB AUG  YAW', hitsP, 0.032);
  toggle('afcs', LC, -0.05, -0.29, 'AUTOPILOT ENGAGE  (ATTITUDE HOLD, CONTROL STICK STEERING)', hitsP, 0.04);
  toggle('alt', LC, -0.005, -0.29, 'AUTOPILOT  ALTITUDE HOLD', hitsP, 0.04);
  // right console: ELEC POWER (L / R GEN, the EMERG GEN guard), ENG START (the 3-way ENG CRANK switch: L - OFF - R), EXT
  // LIGHTS, the canopy handle, the parking brake handle; ECS and OXYGEN aft (placards)
  toggle('genL', RC, -0.055, 0.29, 'L GENERATOR  NORM / OFF', hitsP, 0.04); toggle('genR', RC, -0.015, 0.29, 'R GENERATOR  NORM / OFF', hitsP, 0.04);
  box(0.024, 0.03, 0.012, redM, 0.045, 0.29, 0.012, RC);   // emergency generator switch under its red guard
  cyl(0.011, 0.011, 0.006, metal, -0.02, 0.165, 0.003, RC, Math.PI / 2);
  const crankSw = new THREE.Group(); crankSw.position.set(-0.02, 0.165, 0.005); RC.add(crankSw); cyl(0.004, 0.006, 0.034, batM, 0, 0, 0.017, crankSw, Math.PI / 2);
  hit('crankL', 0.04, 0.05, 0.05, -0.045, 0.165, 0.02, RC, 'ENG CRANK  L  (HELD IN TO 50% RPM)'); hit('crankR', 0.04, 0.05, 0.05, 0.005, 0.165, 0.02, RC, 'ENG CRANK  R  (HELD IN TO 50% RPM)');
  box(0.022, 0.022, 0.016, black, 0.06, 0.165, 0.008, RC);   // the AIR SOURCE knob
  toggle('lights', RC, -0.05, 0.04, 'EXT LIGHTS  MASTER');
  const canH = new THREE.Group(); canH.position.set(0.04, 0.02, 0.0); RC.add(canH);   // the canopy T-handle
  box(0.008, 0.008, 0.05, metal, 0, 0, 0.025, canH); box(0.05, 0.014, 0.014, yellow, 0, 0, 0.055, canH);
  hit('canopy', 0.06, 0.05, 0.08, 0.04, 0.02, 0.04, RC, 'CANOPY HANDLE  OPEN / CLOSE');
  const pbH = new THREE.Group(); pbH.position.set(-0.02, -0.11, 0.0); RC.add(pbH);   // parking brake T-handle
  box(0.008, 0.008, 0.035, metal, 0, 0, 0.018, pbH); box(0.04, 0.012, 0.012, M(0xd04020), 0, 0, 0.04, pbH);
  hit('pbrake', 0.05, 0.04, 0.07, -0.02, -0.11, 0.035, RC, 'PARKING BRAKE');
  hit('eject', 0.24, 0.1, 0.12, 0, 1.58, -5.05, g, 'EJECT  -  FACE CURTAIN (CLICK TWICE)'); hit('eject', 0.16, 0.06, 0.1, 0, 0.3, -5.67, g, 'EJECT  -  LOWER HANDLE (CLICK TWICE)');

  // ================================================================ stick, pedals, the pilot's legs and hands
  const stickP = new THREE.Group(); stickP.position.set(0, 0.02, -5.8); g.add(stickP);
  cyl(0.07, 0.09, 0.06, black, 0, 0, 0, stickP);
  cyl(0.015, 0.018, 0.4, metal, 0, 0.21, 0, stickP);
  const grip = new THREE.Group(); grip.position.set(0, 0.45, 0); stickP.add(grip);
  box(0.045, 0.13, 0.05, black, 0, 0, 0, grip, 0.15); box(0.012, 0.03, 0.016, M(0x333333), 0, 0.02, -0.03, grip); box(0.05, 0.03, 0.06, black, 0, 0.075, -0.005, grip);
  const pedals = [-0.17, 0.17].map(x => { const p = new THREE.Group(); p.position.set(x, -0.08, -6.35); g.add(p); const pl = box(0.1, 0.2, 0.025, metal, 0, 0.06, 0, p, -0.35); box(0.02, 0.18, 0.02, dark, 0, -0.04, 0.06, p); return { p, pl }; });
  for (const s of [-1, 1]) {
    const hip = V3(s * 0.12, 0.4, -5.27), knee = V3(s * 0.2, 0.4, -5.8), ank = V3(s * 0.19, -0.05, -6.12);
    limb(hip, knee, 0.072, suit); limb(knee, ank, 0.056, suit);
    const boot = box(0.1, 0.09, 0.24, black, s * 0.19, -0.08, -6.2); boot.rotation.x = -0.35;
  }
  const handR = new THREE.Group(); grip.add(handR); box(0.075, 0.09, 0.075, glove, 0.0, -0.005, 0.01, handR); limb(V3(0.15, 0.48, -5.25), V3(0.03, 0.5, -5.7), 0.042, suit);
  const handL = new THREE.Group(); thr[0].add(handL); handL.position.set(0.02, 0.0, 0.14); box(0.07, 0.08, 0.06, glove, 0, 0, 0, handL); limb(V3(0.01, -0.02, 0.15), V3(-0.03, -0.27, 0.22), 0.04, suit, thr[0]);   // forearm back to the elbow
  const pilotSeatFig = [];   // nothing extra: the front seat is you

  // ================================================================ RIO's cockpit
  const RP = new THREE.Group(); RP.position.set(0, 0.62, -4.72); RP.rotation.x = -0.32; g.add(RP);
  box(0.92, 0.6, 0.05, dark, 0, 0, -0.03, RP);
  const rart = canvasTex(920, 600);
  plane(0.92, 0.6, new THREE.MeshLambertMaterial({ map: rart.tex, emissive: 0xffffff, emissiveMap: rart.tex, emissiveIntensity: 0.55 }), 0, 0, 0, RP);
  box(0.92, 0.04, 0.22, black, 0, 0.3, -0.1, RP);                                // hood over the RIO panel
  const ddd = crt(0.22, 0.14, 2200, 0, 0.17, RP);
  // TID: the big round CRT in a square bezel
  box(0.3, 0.3, 0.03, black, 0, -0.1, -0.008, RP);
  const tidT = canvasTex(560, 560); const tidM = new THREE.Mesh(new THREE.CircleGeometry(0.125, 48), new THREE.MeshBasicMaterial({ map: tidT.tex, toneMapped: false })); tidM.position.set(0, -0.1, 0.012); RP.add(tidM);
  const tid = { ...tidT, mesh: tidM };
  const RGL = { rasi: [-0.36, 0.2, 0.085], ralt: [-0.36, 0.095, 0.085], rclk: [-0.36, -0.01, 0.065], rrwr: [0.35, 0.2, 0.09] };
  const rLamps = {
    mc: lamp(RP, 0.07, 0.03, -0.36, -0.1, 0.005, 'MASTER|CAUTION', '#ffaa18', '#2e2408'),
    launch: lamp(RP, 0.06, 0.028, 0.35, 0.11, 0.005, 'LAUNCH', '#ff2a14', '#3a0e08'),
    ph: lamp(RP, 0.05, 0.026, 0.28, -0.01, 0.005, 'PH', '#3cff50', '#0e2410'), sp: lamp(RP, 0.05, 0.026, 0.35, -0.01, 0.005, 'SP', '#3cff50', '#0e2410'), sw: lamp(RP, 0.05, 0.026, 0.42, -0.01, 0.005, 'SW', '#3cff50', '#0e2410'),
    stt: lamp(RP, 0.06, 0.026, 0.28, -0.08, 0.005, 'STT', '#ffaa18', '#2e2408'), tws: lamp(RP, 0.06, 0.026, 0.35, -0.08, 0.005, 'TWS', '#3cff50', '#0e2410'),
  };
  button('rio:launch', RP, 0.42, -0.08, 0.04, 0.03, redM, 'MISSILE LAUNCH (RIO)', hitsR);
  button('rio:wpn', RP, 0.35, -0.15, 0.06, 0.025, M(0x50565c), 'WEAPON TYPE  PH / SP / SW', hitsR);
  button('rio:stt', RP, 0.28, -0.15, 0.05, 0.025, M(0x50565c), 'STT LOCK / BREAK LOCK', hitsR);
  button('rio:next', RP, 0.18, -0.25, 0.04, 0.025, M(0x50565c), 'HOOK NEXT TRACK', hitsR);
  button('rio:rng+', RP, -0.18, -0.25, 0.04, 0.025, M(0x50565c), 'TID RANGE UP', hitsR); button('rio:rng-', RP, -0.12, -0.25, 0.04, 0.025, M(0x50565c), 'TID RANGE DOWN', hitsR);
  hit('mc', 0.08, 0.04, 0.03, -0.36, -0.1, 0.01, RP, 'MASTER CAUTION RESET', hitsR);
  const allLamps = [...Object.values(L), ...Object.values(rLamps), idx.hi, idx.on, idx.lo];
  hit('eject', 0.24, 0.1, 0.12, 0, 1.68, -3.8, g, 'EJECT  -  FACE CURTAIN (CLICK TWICE)', hitsR);
  const cmdSel = toggle('rio:cmd', RP, -0.25, -0.2, 'COMMAND EJECT SELECTOR  MCO / RIO ONLY', hitsR);
  // the RIO's side consoles: radios, IFF, the TACAN, ECM, the data link (flat panels, canvas top = forward)
  const rcon = [-1, 1].map(s => { const t = canvasTex(220, 640), p = new THREE.Group(); p.position.set(s * 0.44, 0.472, -3.95); p.rotation.x = -Math.PI / 2; g.add(p); plane(0.2, 0.58, new THREE.MeshLambertMaterial({ map: t.tex, emissive: 0xffffff, emissiveMap: t.tex, emissiveIntensity: 0.55 }), 0, 0, 0.001, p); return t; });
  // hand control unit (the radar stick) between the RIO's knees, his legs
  const hcu = new THREE.Group(); hcu.position.set(0, 0.35, -4.2); g.add(hcu); box(0.12, 0.05, 0.16, grey, 0, 0, 0, hcu); box(0.04, 0.09, 0.05, black, 0, 0.06, -0.02, hcu, 0.25);
  // the RIO as the pilot sees him over his shoulder (hidden in the back seat: that is you): torso in the harness, the
  // white helmet with the visor down and the oxygen mask, the right hand on the hand control unit, the left on the
  // console; his head works the TID, then checks six
  const rioFig = new THREE.Group(); rioFig.name = 'rioFig'; g.add(rioFig);
  const harn = M(0x2a2c22), maskM = M(0x3a3d40), visM = new THREE.MeshLambertMaterial({ color: 0x1a2430, emissive: 0x0a1018 });
  box(0.42, 0.46, 0.26, suit, 0, 0.78, -3.97, rioFig); box(0.44, 0.1, 0.26, suit, 0, 0.98, -3.97, rioFig);   // torso, shoulders
  for (const s of [-1, 1]) box(0.05, 0.47, 0.012, harn, s * 0.1, 0.8, -4.105, rioFig);   // harness straps
  box(0.3, 0.06, 0.012, harn, 0, 0.66, -4.105, rioFig); box(0.12, 0.08, 0.06, M(0x6b6f60), 0.13, 0.84, -4.12, rioFig);   // lap belt, survival vest pocket
  limb(V3(0, 1.0, -3.98), V3(0, 1.06, -4.04), 0.055, suit, rioFig);   // neck
  const rioHead = new THREE.Group(); rioHead.position.set(0, 1.1, -4.06); rioFig.add(rioHead);
  { const hm = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10), helmW); hm.scale.set(1, 1.05, 1.12); rioHead.add(hm);
    const vz = new THREE.Mesh(new THREE.SphereGeometry(0.138, 14, 8, -Math.PI * 0.42 - Math.PI / 2, Math.PI * 0.84, Math.PI * 0.32, Math.PI * 0.26), visM); vz.scale.set(1, 1.05, 1.12); rioHead.add(vz);
    box(0.03, 0.02, 0.2, M(0xc8a020), 0, 0.13, 0.0, rioHead);   // the squadron stripe over the helmet
    cyl(0.04, 0.055, 0.08, maskM, 0, -0.06, -0.12, rioHead, -1.2); limb(V3(0, -0.09, -0.14), V3(0.06, -0.3, -0.06), 0.014, maskM, rioHead); }   // oxygen mask and hose
  for (const s of [-1, 1]) {   // arms: right to the hand control unit, left onto the console
    const sh = V3(s * 0.23, 0.96, -3.98), el = V3(s * 0.27, 0.66, -4.12), hd = s > 0 ? V3(0.04, 0.45, -4.24) : V3(-0.34, 0.52, -4.18);
    limb(sh, el, 0.045, suit, rioFig); limb(el, hd, 0.038, suit, rioFig); const gl = box(0.06, 0.05, 0.08, glove, hd.x, hd.y, hd.z, rioFig); gl.rotation.y = s * 0.3;
  }
  for (const s of [-1, 1]) { const hip = V3(s * 0.12, 0.43, -3.86), knee = V3(s * 0.16, 0.5, -4.4), ank = V3(s * 0.17, -0.08, -4.62); limb(hip, knee, 0.075, suit); limb(knee, ank, 0.058, suit); box(0.1, 0.09, 0.24, black, s * 0.17, -0.12, -4.68).rotation.x = -0.35; }

  // ================================================================ hover marker
  const hov = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffd040, depthTest: false, transparent: true })); hov.renderOrder = 9; hov.visible = false; hov.matrixAutoUpdate = false; g.add(hov);

  // ================================================================ static panel art
  function drawArt() {
    const c = art.ctx, W = 1100, H = 660, px = x => (x + PW / 2) * 1000, py = y => (PH / 2 - y) * 1000;
    c.fillStyle = '#353b40'; c.fillRect(0, 0, W, H);
    // panel sections with screw heads (the F-14's grey panels), white placard lettering
    const sect = (x0, y0, x1, y1) => { c.fillStyle = '#3a4046'; c.fillRect(px(x0), py(y1), (x1 - x0) * 1000, (y1 - y0) * 1000); c.strokeStyle = '#22272b'; c.lineWidth = 3; c.strokeRect(px(x0), py(y1), (x1 - x0) * 1000, (y1 - y0) * 1000); c.fillStyle = '#80868c'; for (const [sx, sy] of [[x0 + 0.008, y0 + 0.008], [x1 - 0.008, y0 + 0.008], [x0 + 0.008, y1 - 0.008], [x1 - 0.008, y1 - 0.008]]) { c.beginPath(); c.arc(px(sx), py(sy), 3, 0, TAU); c.fill(); } };
    sect(-0.545, -0.325, -0.215, 0.325); sect(0.115, -0.325, 0.545, 0.325); sect(-0.21, -0.325, 0.11, 0.325);
    c.fillStyle = '#e6e2cf'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const lab = (t, x, y, s = 12, col = '#e6e2cf') => { c.fillStyle = col; c.font = `bold ${s}px ${SANS}`; c.fillText(t, px(x), py(y)); };
    lab('WING SWEEP', -0.405, 0.12, 11); lab('AIRSPEED / MACH', -0.275, 0.12, 11); lab('FLAPS / SLATS', -0.405, 0.007, 10); lab('ACCEL', -0.29, 0.0, 11);
    lab('AOA', -0.16, 0.255, 12); lab('UNITS', -0.16, 0.24, 9);
    lab('ALT', 0.17, 0.258, 11); lab('VERT VEL', 0.17, 0.035, 10); lab('STBY ATT', 0.17, -0.08, 10); lab('CLOCK', 0.17, -0.188, 9);
    for (const [t, y] of [['RPM', 0.235], ['TIT', 0.14], ['FF', 0.045], ['NOZ', -0.05]]) lab(t, 0.33, y + 0.05, 10);
    lab('L', 0.285, 0.285, 11); lab('R', 0.375, 0.285, 11); lab('OIL', 0.48, 0.0, 10); lab('THREAT', 0.48, 0.25, 9);
    lab('LDG GEAR', -0.49, -0.245, 11); lab('HOOK', 0.49, -0.245, 11); lab('MASTER ARM', -0.36, -0.15, 9); lab('ON', -0.36, -0.083, 9); lab('WPN SEL', -0.27, -0.15, 9);
    lab('ACM JETT', -0.47, -0.305, 9); lab('VDI', -0.115, 0.05, 10); lab('HSD', -0.105, -0.2, 10); lab('NAV/TID', 0.115, -0.225, 8);
    lab('FUEL', 0.33, -0.12, 11); lab('LB X 1000', 0.33, -0.31, 8);
    MODES.forEach((m, i) => lab(m, -0.1 + i * 0.05, 0.3, 9));
    c.fillStyle = '#2a2e32'; c.fillRect(px(-0.545), py(-0.3), 120, 26); lab('F-14A', -0.485, -0.315, 13, '#cfd0c8');
    art.tex.needsUpdate = true;
    // the side consoles: grey Dzus panels (console-local metres: x across, y forward), white placards by each control
    const cx = x => (x + 0.1) / 0.2 * 220, cy = y => (0.345 - y) / 0.69 * 760;
    const consoleArt = (cv, panels, labels) => {
      const x = cv.ctx; x.fillStyle = '#2a2e32'; x.fillRect(0, 0, 220, 760);
      for (const [y1, y0, title] of panels) {
        const a = cy(y1), b = cy(y0); x.fillStyle = '#3a4046'; x.fillRect(6, a + 3, 208, b - a - 6); x.strokeStyle = '#1c2024'; x.lineWidth = 3; x.strokeRect(6, a + 3, 208, b - a - 6);
        x.fillStyle = '#80868c'; for (const [sx, sy] of [[13, a + 10], [207, a + 10], [13, b - 10], [207, b - 10]]) { x.beginPath(); x.arc(sx, sy, 3, 0, TAU); x.fill(); }
        if (title) { x.fillStyle = '#e6e2cf'; x.font = `bold 14px ${SANS}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(title, 110, a + 16); }
      }
      for (const [t, lx, ly, s = 11] of labels) { x.fillStyle = '#e6e2cf'; x.font = `bold ${s}px ${SANS}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, cx(lx), cy(ly)); }
      cv.tex.needsUpdate = true;
    };
    consoleArt(conL, [[0.345, 0.2, ''], [0.2, -0.165, ''], [-0.165, -0.345, 'AFCS']], [
      ['FLAPS', -0.05, 0.325, 12], ['UP', -0.08, 0.27], ['DN', -0.08, 0.235], ['FUEL', 0.05, 0.325, 12], ['DUMP', 0.05, 0.305, 10], ['OFF', 0.05, 0.235],
      ['THROTTLES', 0, 0.185, 12], ['MAX', -0.075, 0.135, 9], ['MIL', -0.075, 0.082, 9], ['IDLE', -0.075, -0.11, 9], ['OFF', -0.075, -0.14, 9],
      ['L', -0.032, -0.155, 10], ['R', 0.026, -0.155, 10],
      ['PITCH', -0.07, -0.185, 9], ['ROLL', -0.035, -0.185, 9], ['YAW', 0.0, -0.185, 9], ['STAB AUG', -0.035, -0.248, 9], ['AUTOPILOT', -0.05, -0.322, 9], ['ALT', -0.005, -0.322, 9],
      ['VEC/PCD', 0.06, -0.215, 8], ['ACL', 0.06, -0.29, 8]]);
    consoleArt(conR, [[0.345, 0.225, 'ELEC POWER'], [0.225, 0.105, 'ENG START'], [0.105, -0.165, ''], [-0.165, -0.345, 'ECS']], [
      ['L GEN', -0.055, 0.25, 9], ['R GEN', -0.015, 0.25, 9], ['EMERG', 0.045, 0.255, 9], ['NORM', -0.035, 0.315, 9],
      ['ENG CRANK', -0.02, 0.2, 10], ['L', -0.05, 0.135, 11], ['OFF', -0.02, 0.13, 9], ['R', 0.01, 0.135, 11], ['AIR', 0.06, 0.2, 9], ['SOURCE', 0.06, 0.188, 8],
      ['EXT LTS', -0.05, 0.085, 10], ['CANOPY', 0.04, 0.085, 10], ['OPEN', 0.04, -0.015, 9], ['PARK BRAKE', -0.02, -0.07, 10],
      ['CABIN TEMP', -0.04, -0.21, 9], ['OXYGEN', 0.04, -0.21, 9], ['ON', 0.04, -0.3, 9], ['RAM AIR', -0.04, -0.3, 9]]);
    { const x = conR.ctx; for (const [kx, ky] of [[-0.04, -0.255], [0.04, -0.255]]) { x.fillStyle = '#16181a'; x.beginPath(); x.arc(cx(kx), cy(ky), 15, 0, TAU); x.fill(); x.strokeStyle = '#6a7076'; x.lineWidth = 2; x.stroke(); x.strokeStyle = '#e6e2cf'; x.beginPath(); x.moveTo(cx(kx), cy(ky)); x.lineTo(cx(kx) + 8, cy(ky) - 10); x.stroke(); } conR.tex.needsUpdate = true; }
    { const x = conL.ctx; for (const kx of [0.06]) for (const ky of [-0.235, -0.31]) { x.fillStyle = '#d6d6ce'; x.fillRect(cx(kx) - 7, cy(ky) - 5, 14, 10); } conL.tex.needsUpdate = true; }
    // RIO panel art
    const r = rart.ctx, rpx = x => (x + 0.46) * 1000, rpy = y => (0.3 - y) * 1000; r.fillStyle = '#353b40'; r.fillRect(0, 0, 920, 600);
    r.strokeStyle = '#22272b'; r.lineWidth = 3; r.strokeRect(4, 4, 912, 592);
    const rl = (t, x, y, s = 12) => { r.fillStyle = '#e6e2cf'; r.font = `bold ${s}px ${SANS}`; r.textAlign = 'center'; r.textBaseline = 'middle'; r.fillText(t, rpx(x), rpy(y)); };
    rl('DDD', -0.15, 0.255, 12); rl('TID', -0.16, 0.04, 12); rl('AIRSPEED', -0.36, 0.25, 10); rl('ALT', -0.36, 0.145, 10); rl('THREAT', 0.35, 0.255, 10);
    rl('WEAPON TYPE', 0.35, 0.02, 10); rl('LAUNCH', 0.42, -0.05, 9); rl('STT', 0.28, -0.12, 9); rl('WPN', 0.35, -0.12, 9); rl('HOOK', 0.18, -0.22, 9); rl('RANGE', -0.15, -0.22, 9);
    rl('CMD SEL', -0.25, -0.24, 9); rl('MCO', -0.25, -0.165, 9); rl('AN/AWG-9', 0.0, -0.28, 13);
    rart.tex.needsUpdate = true;
    // the RIO's side consoles: grey panels with knobs, frequency windows and placards (static)
    const PANELS = [[['UHF 1  ARC-159', 3, '243.0'], ['TACAN  ARN-84', 2, 'CH 071X'], ['IFF  APX-72', 4, 'MODE 3 / 7700'], ['DATA LINK', 2, 'ADR 012']], [['ECM  ALQ-100', 3, 'STBY'], ['UHF 2  ARC-51', 2, '305.5'], ['NAV MODE', 3, 'INS  ALIGN'], ['RWR  ALR-45', 2, 'BRT  AUD']]];
    rcon.forEach((t, si) => {
      const x = t.ctx; x.fillStyle = '#30353a'; x.fillRect(0, 0, 220, 640);
      PANELS[si].forEach(([title, knobs, win], i) => {
        const y0 = 8 + i * 158; x.fillStyle = '#3a4046'; x.fillRect(8, y0, 204, 150); x.strokeStyle = '#22272b'; x.lineWidth = 3; x.strokeRect(8, y0, 204, 150);
        x.fillStyle = '#e6e2cf'; x.font = `bold 15px ${SANS}`; x.textAlign = 'center'; x.fillText(title, 110, y0 + 22);
        x.fillStyle = '#050505'; x.fillRect(40, y0 + 34, 140, 30); x.fillStyle = '#ffb040'; x.font = `bold 17px ${MONO}`; x.fillText(win, 110, y0 + 55);
        for (let k = 0; k < knobs; k++) { const kx = 220 / (knobs + 1) * (k + 1), ky = y0 + 108; x.fillStyle = '#16181a'; x.beginPath(); x.arc(kx, ky, 17, 0, TAU); x.fill(); x.strokeStyle = '#6a7076'; x.lineWidth = 2; x.stroke(); x.strokeStyle = '#e6e2cf'; x.beginPath(); x.moveTo(kx, ky); x.lineTo(kx + 12 * Math.sin(k * 1.7 + i), ky - 12 * Math.cos(k * 1.7 + i)); x.stroke(); }
        for (let k = 0; k < 4; k++) { x.fillStyle = '#80868c'; x.beginPath(); x.arc(14 + (k % 2) * 192, y0 + 6 + Math.floor(k / 2) * 138, 3, 0, TAU); x.fill(); }
      });
      t.tex.needsUpdate = true;
    });
  }
  drawArt();

  // ================================================================ gauges (faces pre-rendered, dynamic parts drawn live)
  const V = { ias: 0, mach: 0, alt: 0, vsi: 0, g: 1, aoa: 0, sweep: 20, cmd: 20, p: 0, r: 0, rpm: [0, 0], tit: [0, 0], ff: [0, 0], noz: [0, 0], oil: [0, 0], fuel: 0, flap: 0, slat: 0 };
  const flaky = (S, i) => S.avionics < 0.4 && ((performance.now() / 700 + i * 1.7) % 3) < 1.2;
  const asiMap = v => v <= 100 ? v / 100 * 30 : v <= 400 ? 30 + (v - 100) / 300 * 180 : 210 + Math.min(v - 400, 450) / 450 * 120;   // expanded 100-400 kt
  gauge('asi', 256, (c, W) => { const R = W / 2; faceBg(c, W); for (let v = 0; v <= 850; v += 10) { const maj = v % 50 === 0; if (v > 400 && v % 50) continue; radial(c, R, asiMap(v), '#ecebe2', R * (maj ? 0.74 : 0.84), R * 0.93, maj ? R * 0.04 : R * 0.02); }
    for (const v of [100, 150, 200, 250, 300, 350, 400, 500, 600, 700, 800]) { const [x, y] = P2(R, R * 0.58, asiMap(v)); txt(c, String(v / 10), x, y, '#ecebe2', R * 0.15); }
    txt(c, 'KNOTS', R, R * 1.36, '#cfcdc0', R * 0.1); c.fillStyle = '#000'; c.fillRect(R * 0.62, R * 1.12, R * 0.76, R * 0.26); },
  (c, W, S, G) => { const R = W / 2; if (flaky(S, G.i)) { offFlag(c, W); return; } txt(c, V.mach.toFixed(2), R, R * 1.25, '#f2f2ea', R * 0.2, 'center', MONO); txt(c, 'MACH', R, R * 0.7, '#cfcdc0', R * 0.1); needle(c, R, asiMap(V.ias), R * 0.86); hub(c, R, 0.1); });
  // wing sweep: 20 .. 68 (and OVER 75) over 270°; the position needle and the command bug
  const swMap = lin(20, -120, 75, 140);
  gauge('sweep', 256, (c, W) => { const R = W / 2; faceBg(c, W); for (let v = 20; v <= 68; v += 4) radial(c, R, swMap(v), '#ecebe2', R * (v % 8 === 4 ? 0.8 : 0.72), R * 0.93, R * 0.035); for (const v of [20, 28, 36, 44, 52, 60, 68]) { const [x, y] = P2(R, R * 0.56, swMap(v)); txt(c, String(v), x, y, '#ecebe2', R * 0.15); }
    band(c, R, swMap(68.5), swMap(75), '#d8d0b0', R * 0.86, R * 0.1); const [ox, oy] = P2(R, R * 0.56, swMap(74)); txt(c, 'OV', ox, oy, '#ecebe2', R * 0.14); txt(c, 'SWEEP', R, R * 1.42, '#cfcdc0', R * 0.1); },
  (c, W, S) => { const R = W / 2, sw = S.sweep || {}; c.fillStyle = '#000'; c.fillRect(R * 0.58, R * 1.12, R * 0.84, R * 0.24); txt(c, (sw.mode || 'AUTO').toUpperCase(), R, R * 1.24, sw.mode === 'EMER' || sw.mode === 'OVER' ? '#ff6040' : sw.mode === 'MAN' ? '#ffd060' : '#f2f2ea', R * 0.16);
    const [bx, by] = P2(R, R * 0.93, swMap(V.cmd)); c.fillStyle = '#ff9a20'; c.beginPath(); c.arc(bx, by, R * 0.08, 0, TAU); c.fill(); txt(c, 'C', bx, by, '#111', R * 0.11);
    needle(c, R, swMap(V.sweep), R * 0.84); hub(c, R, 0.1); });
  // accelerometer: -4 .. +10 g, main needle and the two tell-tales (max / min since reset)
  const gMap = lin(-4, -150, 10, 150);
  gauge('gmeter', 256, (c, W) => dialFace(c, W, { map: gMap, v0: -4, v1: 10, major: 2, minor: 1, labels: [-4, -2, 0, 2, 4, 6, 8, 10].map(v => [v, String(v)]), reds: [-3, 7.5], title: 'G' , ty: 1.3 }),
    (c, W, S) => { const R = W / 2; needle(c, R, gMap(S.gmax ?? 1), R * 0.8, '#d0a040', R * 0.05, 0.1); needle(c, R, gMap(S.gmin ?? 1), R * 0.8, '#d0a040', R * 0.05, 0.1); needle(c, R, gMap(V.g), R * 0.86); hub(c, R, 0.1); });
  // flap / slat position: two vertical bars in a dial
  gauge('flap', 192, (c, W) => { const R = W / 2; faceBg(c, W); txt(c, 'SLAT', R * 0.6, R * 0.32, '#cfcdc0', R * 0.15); txt(c, 'FLAP', R * 1.4, R * 0.32, '#cfcdc0', R * 0.15); for (const x of [0.6, 1.4]) { c.strokeStyle = '#ecebe2'; c.lineWidth = 2; c.strokeRect(R * x - R * 0.13, R * 0.48, R * 0.26, R * 1.0); for (let k = 0; k <= 4; k++) { const y = R * 0.48 + k * R * 0.25; c.beginPath(); c.moveTo(R * x + R * 0.15, y); c.lineTo(R * x + R * 0.24, y); c.stroke(); } } txt(c, 'UP', R, R * 0.52, '#ecebe2', R * 0.12); txt(c, 'DN', R, R * 1.44, '#ecebe2', R * 0.12); },
    (c, W) => { const R = W / 2; c.fillStyle = '#f2f2ea'; c.fillRect(R * 0.49, R * 0.5, R * 0.22, R * 0.96 * V.slat + 2); c.fillRect(R * 1.29, R * 0.5, R * 0.22, R * 0.96 * V.flap + 2); });
  // altimeter: counter-pointer (needle = hundreds, drum = thousands)
  gauge('alt', 256, (c, W) => dialFace(c, W, { map: lin(0, 0, 1000, 360), v0: 0, v1: 980, major: 100, minor: 20, labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => [k * 100, String(k)]), lr: 0.6 }),
    (c, W, S, G) => { const R = W / 2; if (flaky(S, G.i)) { offFlag(c, W); return; } drum(c, R * 0.5, R * 0.72, R * 1.0, R * 0.28, Math.floor(Math.max(0, V.alt) / 100), 3); txt(c, 'FT', R, R * 1.3, '#cfcdc0', R * 0.1); needle(c, R, (Math.max(0, V.alt) % 1000) / 1000 * 360, R * 0.86); hub(c, R, 0.1); });
  // VSI: +-6000 ft/min, expanded near zero
  const vsiMap = v => { const s = Math.sign(v), a = Math.min(6000, Math.abs(v)); return -90 + s * (a <= 1000 ? a / 1000 * 70 : a <= 2000 ? 70 + (a - 1000) / 1000 * 40 : 110 + (a - 2000) / 4000 * 60); };
  gauge('vsi', 224, (c, W) => { const R = W / 2; faceBg(c, W); for (const v of [-6000, -4000, -2000, -1000, -500, 0, 500, 1000, 2000, 4000, 6000]) radial(c, R, vsiMap(v), '#ecebe2', R * 0.74, R * 0.93, R * 0.04); for (const [v, t] of [[0, '0'], [1000, '1'], [2000, '2'], [4000, '4'], [6000, '6'], [-1000, '1'], [-2000, '2'], [-4000, '4']]) { const [x, y] = P2(R, R * 0.58, vsiMap(v)); txt(c, t, x, y, '#ecebe2', R * 0.17); } txt(c, 'UP', R * 1.0, R * 0.62, '#cfcdc0', R * 0.1); txt(c, 'DN', R * 1.0, R * 1.38, '#cfcdc0', R * 0.1); txt(c, 'x1000', R * 1.35, R, '#cfcdc0', R * 0.1); },
    (c, W) => { const R = W / 2; needle(c, R, vsiMap(V.vsi), R * 0.86); hub(c, R, 0.1); });
  gauge('adi', 224, null, (c, W, S, G) => {
    const R = W / 2; c.clearRect(0, 0, W, W); if (S.stbyOff) { faceBg(c, W); offFlag(c, W); return; } const ppd = R * 0.024;
    c.save(); c.beginPath(); c.arc(R, R, R * 0.97, 0, TAU); c.clip(); c.translate(R, R); c.rotate(-V.r);
    const off = clamp(V.p / D2R, -60, 60) * ppd;
    c.fillStyle = '#5a8cc0'; c.fillRect(-W, -2 * W + off, 2 * W, 2 * W); c.fillStyle = '#2a2a2a'; c.fillRect(-W, off, 2 * W, 2 * W);   // grey / black ball (1980 standby)
    c.strokeStyle = '#fff'; c.lineWidth = R * 0.03; c.beginPath(); c.moveTo(-W, off); c.lineTo(W, off); c.stroke(); c.lineWidth = R * 0.018;
    for (let p = -30; p <= 30; p += 10) if (p) { const y = off - p * ppd, w = R * 0.24; c.beginPath(); c.moveTo(-w, y); c.lineTo(w, y); c.stroke(); }
    c.restore(); c.fillStyle = '#111'; c.beginPath(); c.arc(R, R, R, 0, TAU); c.arc(R, R, R * 0.82, 0, TAU, true); c.fill();
    for (const a of [-60, -30, 30, 60]) radial(c, R, a, '#ecebe2', R * 0.82, R * 0.96, R * 0.03);
    c.strokeStyle = '#ff9a20'; c.lineWidth = R * 0.07; c.beginPath(); c.moveTo(R * 0.45, R); c.lineTo(R * 0.8, R); c.lineTo(R * 0.9, R * 1.1); c.moveTo(R * 1.55, R); c.lineTo(R * 1.2, R); c.lineTo(R * 1.1, R * 1.1); c.stroke();
  });
  gauge('clock', 160, (c, W) => dialFace(c, W, { map: lin(0, 0, 60, 360), v0: 0, v1: 59, major: 5, minor: 1, labels: [[0, '12'], [15, '3'], [30, '6'], [45, '9']], ls: 0.22 }),
    (c, W) => { const R = W / 2, t = new Date(), h = t.getHours() % 12 + t.getMinutes() / 60, m = t.getMinutes() + t.getSeconds() / 60; needle(c, R, h * 30, R * 0.5, '#f2f2ea', R * 0.1); needle(c, R, m * 6, R * 0.8, '#f2f2ea', R * 0.07); needle(c, R, t.getSeconds() * 6, R * 0.85, '#e8a020', R * 0.025); hub(c, R, 0.1); });
  // engines
  const rpmMap = lin(0, -135, 110, 135), titMap = lin(0, -135, 1300, 135), ffMap = lin(0, -135, 12, 135), nozMap = lin(0, -120, 100, 120), oilMap = lin(0, -135, 100, 135);
  for (const k of [0, 1]) {
    const s = k ? 'R' : 'L';
    gauge('rpm' + s, 192, (c, W) => dialFace(c, W, { map: rpmMap, v0: 0, v1: 110, major: 10, minor: 5, labels: [[0, '0'], [20, '2'], [40, '4'], [60, '6'], [80, '8'], [100, '10']], bands: [[90, 104, '#2db040']], reds: [107], ls: 0.2 }),
      (c, W, S) => { const R = W / 2; txt(c, String(Math.round(V.rpm[k])), R, R * 1.42, '#f2f2ea', R * 0.18, 'center', MONO); needle(c, R, rpmMap(V.rpm[k]), R * 0.86); hub(c, R, 0.1); if (S.stalled && S.stalled[k]) txt(c, 'STALL', R, R * 0.62, '#ff5030', R * 0.16); });
    gauge('tit' + s, 192, (c, W) => dialFace(c, W, { map: titMap, v0: 0, v1: 1300, major: 200, minor: 100, labels: [[0, '0'], [400, '4'], [800, '8'], [1200, '12']], bands: [[300, 1100, '#2db040']], reds: [1190], ls: 0.2 }),
      (c, W) => { const R = W / 2; txt(c, String(Math.round(V.tit[k])), R, R * 1.42, '#f2f2ea', R * 0.16, 'center', MONO); needle(c, R, titMap(V.tit[k]), R * 0.86); hub(c, R, 0.1); });
    gauge('ff' + s, 192, (c, W) => dialFace(c, W, { map: ffMap, v0: 0, v1: 12, major: 2, minor: 1, labels: [[0, '0'], [4, '4'], [8, '8'], [12, '12']], ls: 0.2 }),
      (c, W) => { const R = W / 2; txt(c, 'PPH', R, R * 0.66, '#cfcdc0', R * 0.1); needle(c, R, ffMap(V.ff[k] / 1000), R * 0.86); hub(c, R, 0.1); });
    gauge('noz' + s, 192, (c, W) => dialFace(c, W, { map: nozMap, v0: 0, v1: 100, major: 25, minor: 12.5, labels: [[0, 'C'], [50, '1/2'], [100, 'O']], ls: 0.2 }),
      (c, W) => { const R = W / 2; needle(c, R, nozMap(V.noz[k]), R * 0.86); hub(c, R, 0.1); });
  }
  gauge('oil', 160, (c, W) => dialFace(c, W, { map: oilMap, v0: 0, v1: 100, major: 25, minor: 12.5, labels: [[0, '0'], [50, '50'], [100, '100']], bands: [[25, 65, '#2db040']], ls: 0.2 }),
    (c, W) => { const R = W / 2; needle(c, R, oilMap(V.oil[0]), R * 0.8, '#f2f2ea', R * 0.08); needle(c, R, oilMap(V.oil[1]), R * 0.62, '#9fd0e8', R * 0.1); hub(c, R, 0.1); txt(c, 'L', R * 0.7, R * 1.4, '#f2f2ea', R * 0.15); txt(c, 'R', R * 1.3, R * 1.4, '#9fd0e8', R * 0.15); });
  // ALR-45 threat azimuth scope (also the RIO's repeat): green CRT, threats by relative bearing, closer = nearer the centre
  const rwrDraw = (c, W, S) => {
    const R = W / 2; c.fillStyle = '#020803'; c.beginPath(); c.arc(R, R, R, 0, TAU); c.fill(); c.strokeStyle = '#1f7a2c'; c.lineWidth = 2;
    for (const r of [0.33, 0.66, 0.95]) { c.beginPath(); c.arc(R, R, R * r, 0, TAU); c.stroke(); }
    for (let a = 0; a < 360; a += 30) radial(c, R, a, '#1f7a2c', R * 0.9, R * 0.97, 2);
    if (!S.power) return;
    for (const t of S.rwr || []) {
      const [x, y] = P2(R, R * clamp(0.25 + 0.7 * t.r, 0.2, 0.92), t.brg * 180 / Math.PI), col = t.launch ? '#ff6a40' : '#7dff8a', blink = !t.launch || (performance.now() % 300) < 180;
      if (!blink) continue; txt(c, t.sym, x, y, col, R * 0.2, 'center', MONO); if (t.lock || t.launch) { c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(x, y, R * 0.14, 0, TAU); c.stroke(); }
    }
    c.fillStyle = '#7dff8a'; c.beginPath(); c.moveTo(R, R - 6); c.lineTo(R - 5, R + 5); c.lineTo(R + 5, R + 5); c.fill();
  };
  gauge('rwr', 192, null, rwrDraw);
  // AoA tape: 0 .. 30 units with the on-speed band, a pointer that rides it
  rect('aoa', 0.044, 0.2, 2400, -0.16, 0.12, (c, W, H) => {
    c.fillStyle = '#0c0d0e'; c.fillRect(0, 0, W, H); const y = u => H - 14 - (H - 28) * clamp(u, 0, 30) / 30;
    c.fillStyle = '#2db040'; c.fillRect(W * 0.18, y(17.5), W * 0.2, y(12.5) - y(17.5)); c.fillStyle = '#e8c020'; c.fillRect(W * 0.18, y(30), W * 0.2, y(20) - y(30));
    for (let u = 0; u <= 30; u += 1) { c.strokeStyle = '#ecebe2'; c.lineWidth = u % 5 ? 1 : 2; c.beginPath(); c.moveTo(W * 0.42, y(u)); c.lineTo(W * (u % 5 ? 0.55 : 0.62), y(u)); c.stroke(); if (u % 10 === 0) txt(c, String(u), W * 0.8, y(u), '#ecebe2', W * 0.24); }
    c.fillStyle = '#ff9a20'; const yy = y(V.aoa); c.beginPath(); c.moveTo(W * 0.4, yy); c.lineTo(W * 0.04, yy - 8); c.lineTo(W * 0.04, yy + 8); c.fill();
  });
  // gear position indicator: wheels, UP, or a barber pole in transit; brake / flap advisories under it
  rect('gearInd', 0.11, 0.06, 2000, -0.4, -0.12, (c, W, H, S, A) => {
    c.fillStyle = '#16181a'; c.fillRect(0, 0, W, H); const dn = A.gear > 0.99, up = A.gear < 0.01;
    [[W * 0.36, 4], [W * 0.04, H * 0.48], [W * 0.68, H * 0.48]].forEach(([x, y], i) => {
      const w = W * 0.28, h = H * 0.44; if (!dn && !up) barber(c, x, y, w, h); else { c.fillStyle = '#050505'; c.fillRect(x, y, w, h); if (dn) { c.strokeStyle = '#f2f2ea'; c.lineWidth = 3; c.beginPath(); c.arc(x + w / 2, y + h / 2, h * 0.32, 0, TAU); c.stroke(); } else txt(c, 'UP', x + w / 2, y + h / 2, '#f2f2ea', h * 0.5); }
      void i;
    });
  });
  // fuel quantity: feed tapes (L / R) and the totaliser with the BINGO counter
  rect('fuel', 0.16, 0.13, 2000, 0.33, -0.215, (c, W, H, S, A) => {
    c.fillStyle = '#0c0d0e'; c.fillRect(0, 0, W, H); const lb = A.fuel * LB, feed = Math.min(lb / 2, 4000) / 4000;
    for (const [x, t] of [[W * 0.08, 'L'], [W * 0.78, 'R']]) { c.strokeStyle = '#ecebe2'; c.lineWidth = 2; c.strokeRect(x, H * 0.12, W * 0.14, H * 0.7); c.fillStyle = '#f2f2ea'; c.fillRect(x + 3, H * 0.12 + H * 0.7 * (1 - feed), W * 0.14 - 6, H * 0.7 * feed); txt(c, t, x + W * 0.07, H * 0.92, '#cfcdc0', H * 0.1); }
    txt(c, 'TOTAL', W * 0.5, H * 0.12, '#cfcdc0', H * 0.1); drum(c, W * 0.3, H * 0.2, W * 0.4, H * 0.24, Math.round(lb / 10) * 10, 5, lb < 2000 ? '#ffb040' : '#f2f2ea');
    txt(c, 'BINGO', W * 0.5, H * 0.58, '#cfcdc0', H * 0.1); drum(c, W * 0.34, H * 0.66, W * 0.32, H * 0.2, S.bingo || 0, 4, '#f2f2ea');
  });

  // ================================================================ CRTs
  const PH_ = { bg: '#020a04', fg: '#7dff8a', dim: '#2f9a44', faint: '#164a22', amb: '#ffd060' };
  const ctext = (c, t, x, y, s, col = PH_.fg, a = 'center') => txt(c, t, x, y, col, s, a, MONO);
  function drawVDI(A, S) {
    const c = vdi.ctx, W = vdi.w, H = vdi.h, cx = W / 2, cy = H * 0.46, ppd = H / 46;   // ~46° tall
    c.fillStyle = PH_.bg; c.fillRect(0, 0, W, H);
    if (!S.power || (S.flicker && Math.random() < 0.4)) { vdi.tex.needsUpdate = true; return; }
    const att = A.attitude(), hd = A.heading();
    c.save(); c.translate(cx, cy); c.rotate(-att.roll);
    const off = deg(att.pitch) * ppd;
    // ground: perspective lines converging on the horizon, scrolling with heading; "furrows" running toward you with speed
    c.save(); c.beginPath(); c.rect(-W, off, 2 * W, 2 * H); c.clip();
    c.fillStyle = 'rgba(30,110,50,0.18)'; c.fillRect(-W, off, 2 * W, 2 * H);
    c.strokeStyle = PH_.dim; c.lineWidth = 1.5;
    const ph = ((deg(hd) % 10) + 10) % 10;
    for (let k = -16; k <= 16; k++) { const a = (k * 10 - ph) * D2R * 0.9; c.beginPath(); c.moveTo(Math.tan(clamp(a, -1.4, 1.4)) * 30, off); c.lineTo(Math.tan(clamp(a, -1.4, 1.4)) * 900, off + 600); c.stroke(); }
    const sp = ((performance.now() / 1000) * A.tas * 0.02) % 1;
    for (let k = 1; k < 12; k++) { const d = (k - sp) ** 2 * 3 + 2, y = off + 600 / d; if (y > off + 1) { c.beginPath(); c.moveTo(-W, y); c.lineTo(W, y); c.stroke(); } }
    c.restore();
    // horizon and pitch lines (every 10°; 5° ticks)
    c.strokeStyle = PH_.fg; c.lineWidth = 3; c.beginPath(); c.moveTo(-W, off); c.lineTo(W, off); c.stroke(); c.lineWidth = 2;
    for (let p = -80; p <= 80; p += 5) if (p) { const y = off - p * ppd; if (Math.abs(y) > H) continue; const w = p % 10 ? W * 0.06 : W * 0.14; c.setLineDash(p < 0 ? [6, 5] : []); c.beginPath(); c.moveTo(-w, y); c.lineTo(w, y); c.stroke(); c.setLineDash([]); if (!(p % 10)) { ctext(c, String(Math.abs(p)), -w - 18, y, 14); ctext(c, String(Math.abs(p)), w + 18, y, 14); } }
    c.restore();
    // fixed aircraft symbol
    c.strokeStyle = PH_.fg; c.lineWidth = 4; c.beginPath(); c.moveTo(cx - 60, cy); c.lineTo(cx - 18, cy); c.lineTo(cx - 9, cy + 9); c.moveTo(cx + 60, cy); c.lineTo(cx + 18, cy); c.lineTo(cx + 9, cy + 9); c.stroke(); c.fillStyle = PH_.fg; c.fillRect(cx - 3, cy - 3, 6, 6);
    // bank pointer
    c.save(); c.translate(cx, cy); c.rotate(-att.roll); c.beginPath(); c.moveTo(0, -H * 0.4); c.lineTo(-7, -H * 0.4 + 12); c.lineTo(7, -H * 0.4 + 12); c.fill(); c.restore();
    for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) { const r0 = H * 0.42, r1 = H * (a % 30 ? 0.445 : 0.46); c.lineWidth = 2; c.beginPath(); c.moveTo(cx + Math.sin(a * D2R) * r0, cy - Math.cos(a * D2R) * r0); c.lineTo(cx + Math.sin(a * D2R) * r1, cy - Math.cos(a * D2R) * r1); c.stroke(); }
    // approach: ICLS needles
    if (S.carrier && S.carrier.icls && S.mode === 'LDG') { const { gs, loc } = S.carrier.icls; c.setLineDash([5, 5]); c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 80, cy + clamp(gs, -1.5, 1.5) * 40); c.lineTo(cx + 80, cy + clamp(gs, -1.5, 1.5) * 40); c.moveTo(cx - clamp(loc, -3, 3) * 22, cy - 70); c.lineTo(cx - clamp(loc, -3, 3) * 22, cy + 70); c.stroke(); c.setLineDash([]); }
    // heading strip at the bottom, mode at the top
    c.fillStyle = PH_.bg; c.fillRect(0, H - 34, W, 34); const h0 = (deg(hd) + 360) % 360;
    for (let a = Math.ceil((h0 - 20) / 5) * 5; a <= h0 + 20; a += 5) { const x = cx + (a - h0) * 9; c.strokeStyle = PH_.fg; c.lineWidth = 2; c.beginPath(); c.moveTo(x, H - 34); c.lineTo(x, H - (a % 10 ? 28 : 24)); c.stroke(); if (a % 10 === 0) ctext(c, String(((a + 360) % 360) / 10 | 0).padStart(2, '0'), x, H - 13, 14); }
    c.beginPath(); c.moveTo(cx, H - 36); c.lineTo(cx - 6, H - 46); c.lineTo(cx + 6, H - 46); c.fill();
    ctext(c, S.mode, 34, 14, 14, PH_.fg, 'center'); if (S.afcs && S.afcs !== 'OFF') ctext(c, S.afcs, W - 8, 14, 13, PH_.amb, 'right');
    vdi.tex.needsUpdate = true;
  }
  function drawHSD(A, S) {
    const c = hsd.ctx, W = hsd.w, cx = W / 2, cy = W / 2 + 6, R = W * 0.38;
    c.fillStyle = PH_.bg; c.fillRect(0, 0, W, W);
    if (!S.power || (S.flicker && Math.random() < 0.4)) { hsd.tex.needsUpdate = true; return; }
    if (S.hsdMode === 'TID') { drawTIDInto(c, W, A, S, 0.9); ctext(c, 'TID', 8, 14, 13, PH_.fg, 'left'); hsd.tex.needsUpdate = true; return; }
    const hd = A.heading();
    c.strokeStyle = PH_.fg; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
    for (let a = 0; a < 360; a += 5) { const t = a * D2R - hd - Math.PI / 2, l = a % 30 === 0 ? 14 : a % 10 === 0 ? 9 : 5; c.beginPath(); c.moveTo(cx + Math.cos(t) * R, cy + Math.sin(t) * R); c.lineTo(cx + Math.cos(t) * (R - l), cy + Math.sin(t) * (R - l)); c.stroke(); if (a % 30 === 0) ctext(c, a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a / 10), cx + Math.cos(t) * (R - 26), cy + Math.sin(t) * (R - 26), 15); }
    c.fillStyle = PH_.fg; c.beginPath(); c.moveTo(cx, cy - 14); c.lineTo(cx - 9, cy + 10); c.lineTo(cx, cy + 5); c.lineTo(cx + 9, cy + 10); c.fill();
    c.beginPath(); c.moveTo(cx, cy - R - 2); c.lineTo(cx - 7, cy - R - 13); c.lineTo(cx + 7, cy - R - 13); c.fill();
    const ptr = (brg, col, w, dashed) => { const t = brg - hd - Math.PI / 2; c.strokeStyle = col; c.lineWidth = w; if (dashed) c.setLineDash([8, 6]); c.beginPath(); c.moveTo(cx - Math.cos(t) * (R - 10), cy - Math.sin(t) * (R - 10)); c.lineTo(cx + Math.cos(t) * (R - 10), cy + Math.sin(t) * (R - 10)); c.stroke(); c.setLineDash([]); c.fillStyle = col; c.beginPath(); const hx = cx + Math.cos(t) * (R - 4), hy = cy + Math.sin(t) * (R - 4); c.moveTo(hx, hy); c.lineTo(hx - Math.cos(t - 0.4) * 16, hy - Math.sin(t - 0.4) * 16); c.lineTo(hx - Math.cos(t + 0.4) * 16, hy - Math.sin(t + 0.4) * 16); c.fill(); };
    if (S.wpt) ptr(S.wpt.brg, PH_.dim, 3, true);
    if (S.carrier) ptr(S.carrier.brg, PH_.fg, 4, false);
    // ground track tick
    const tr = Math.atan2(A.vel.x, -A.vel.z) - hd - Math.PI / 2; if (A.tas > 10) { c.fillStyle = PH_.fg; c.beginPath(); c.arc(cx + Math.cos(tr) * (R - 20), cy + Math.sin(tr) * (R - 20), 4, 0, TAU); c.fill(); }
    ctext(c, String(Math.round((deg(hd) + 360) % 360)).padStart(3, '0'), cx, 16, 16);
    if (S.carrier) { ctext(c, 'TCN  CV', 8, W - 40, 12, PH_.fg, 'left'); ctext(c, `${(S.carrier.dist / 1852).toFixed(1)} NM`, 8, W - 22, 14, PH_.fg, 'left'); }
    if (S.wpt) { ctext(c, S.wpt.name.slice(0, 9), W - 8, W - 40, 12, PH_.dim, 'right'); ctext(c, `${(S.wpt.dist / 1852).toFixed(1)} NM`, W - 8, W - 22, 14, PH_.dim, 'right'); }
    ctext(c, 'NAV', 8, 14, 13, PH_.fg, 'left');
    hsd.tex.needsUpdate = true;
  }
  // TID: ownship at the bottom centre (aircraft stabilised), tracks with velocity leaders, the hooked track's data
  let tidRange = 4000;
  function drawTIDInto(c, W, A, S, k = 1) {
    const cx = W / 2, cy = W * 0.86, Rpx = W * 0.78, hd = A.heading(), rng = S.tidRange || tidRange;
    c.strokeStyle = PH_.faint; c.lineWidth = 2;
    for (const f of [0.25, 0.5, 0.75, 1]) { c.beginPath(); c.arc(cx, cy, Rpx * f, -Math.PI / 2 - 1.15, -Math.PI / 2 + 1.15); c.stroke(); }
    for (const a of [-65, 0, 65]) { const t = a * D2R - Math.PI / 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(t) * Rpx, cy + Math.sin(t) * Rpx); c.stroke(); }
    for (const t of S.tracks || []) {
      const rel = t.brg - hd, r = t.range / rng; if (r > 1.05) continue;
      const x = cx + Math.sin(rel) * r * Rpx, y = cy - Math.cos(rel) * r * Rpx, col = t.hooked ? PH_.amb : PH_.fg, s = 9 * k;
      c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 2.5;
      if (t.ship) { c.beginPath(); c.moveTo(x - s, y); c.lineTo(x - s * 0.6, y + s * 0.8); c.lineTo(x + s * 0.6, y + s * 0.8); c.lineTo(x + s, y); c.stroke(); }
      else { c.beginPath(); c.moveTo(x - s, y + s * 0.4); c.lineTo(x, y - s * 0.7); c.lineTo(x + s, y + s * 0.4); c.stroke(); }   // hostile: the hat
      if (t.vrel) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.sin(t.vrel.hdg - hd) * t.vrel.spd * 0.18 * k, y - Math.cos(t.vrel.hdg - hd) * t.vrel.spd * 0.18 * k); c.stroke(); }
      ctext(c, String(t.n).padStart(2, '0'), x + 14 * k, y - 10 * k, 11 * k, PH_.dim, 'left');
      if (t.hooked) { c.strokeRect(x - 13 * k, y - 13 * k, 26 * k, 26 * k); if (t.locked) { c.beginPath(); c.arc(x, y, 18 * k, 0, TAU); c.stroke(); } }
    }
    c.fillStyle = PH_.fg; c.beginPath(); c.moveTo(cx, cy - 12); c.lineTo(cx - 8, cy + 8); c.lineTo(cx + 8, cy + 8); c.fill();
    ctext(c, `${(rng / 1852).toFixed(1)} NM`, W - 10, W * 0.06, 12 * k, PH_.dim, 'right');
  }
  function drawTID(A, S) {
    const c = tid.ctx, W = tid.w; c.fillStyle = PH_.bg; c.fillRect(0, 0, W, W);
    if (!S.power || (S.flicker && Math.random() < 0.4)) { tid.tex.needsUpdate = true; return; }
    drawTIDInto(c, W, A, S, 1.3);
    const h = (S.tracks || []).find(t => t.hooked);
    ctext(c, `TWS  ${(S.tracks || []).length} TRK`, W * 0.18, W * 0.1, 18, PH_.fg); ctext(c, S.lock ? 'STT' : 'RWS', W * 0.82, W * 0.16, 18, S.lock ? PH_.amb : PH_.fg);
    if (h) { const b = (deg(h.brg) + 360) % 360; ctext(c, `TRK ${String(h.n).padStart(2, '0')}  ${h.name}`, W / 2, W * 0.2, 18, PH_.amb); ctext(c, `BRG ${String(Math.round(b)).padStart(3, '0')}  RNG ${(h.range / 1852).toFixed(1)}  ALT ${h.alt}`, W / 2, W * 0.26, 16, PH_.fg); }
    ctext(c, `${S.wpn || ''}  ${S.arm ? 'ARM' : 'SAFE'}`, W / 2, W * 0.95, 16, S.arm ? PH_.amb : PH_.fg);
    tid.tex.needsUpdate = true;
  }
  // DDD: pulse-doppler B-scope (range up, azimuth across), raw returns and the STT gate
  function drawDDD(A, S) {
    const c = ddd.ctx, W = ddd.w, H = ddd.h; c.fillStyle = PH_.bg; c.fillRect(0, 0, W, H);
    if (!S.power || (S.flicker && Math.random() < 0.4)) { ddd.tex.needsUpdate = true; return; }
    const l = 30, r = W - 16, t = 14, b = H - 22, rng = S.tidRange || tidRange;
    c.strokeStyle = PH_.faint; c.lineWidth = 1; c.strokeRect(l, t, r - l, b - t);
    for (let i = 1; i < 4; i++) { const y = t + (b - t) * i / 4; c.beginPath(); c.moveTo(l, y); c.lineTo(r, y); c.stroke(); }
    for (let i = 0; i < 60; i++) { c.fillStyle = 'rgba(80,220,110,0.18)'; c.fillRect(l + Math.random() * (r - l), b - Math.random() * (b - t) * 0.25, 3, 2); }   // clutter low
    const sweep = (performance.now() / 1000 * 0.9) % 2, sx = l + (r - l) * (sweep < 1 ? sweep : 2 - sweep);
    c.strokeStyle = PH_.dim; c.beginPath(); c.moveTo(sx, t); c.lineTo(sx, b); c.stroke();
    for (const k of S.tracks || []) {
      const x = l + (r - l) * clamp((deg(k.az) + 65) / 130, 0, 1), y = b - (b - t) * clamp(k.range / rng, 0, 1);
      c.fillStyle = k.hooked ? PH_.amb : PH_.fg; c.fillRect(x - 6, y - 2, 12, 4);
      if (k.locked) { c.strokeStyle = PH_.amb; c.lineWidth = 2; c.strokeRect(x - 12, y - 8, 24, 16); c.beginPath(); c.moveTo(l, y); c.lineTo(l + 12, y); c.moveTo(r - 12, y); c.lineTo(r, y); c.stroke(); }
    }
    ctext(c, S.lock ? 'PD STT' : 'PD SRCH', l, H - 8, 12, PH_.fg, 'left'); ctext(c, `${(rng / 1852).toFixed(1)}`, r, H - 8, 12, PH_.fg, 'right');
    ddd.tex.needsUpdate = true;
  }
  function drawCaut(S) {
    const c = caut.ctx, W = 480, H = 462; c.fillStyle = '#0a0b0c'; c.fillRect(0, 0, W, H); const on = new Set(S.cautions || []);
    CAUTS.forEach((t, i) => { const x = (i % 4) * 120 + 3, y = Math.floor(i / 4) * 66 + 3, l = on.has(t) && S.ess !== false, adv = ADVS.includes(t); c.fillStyle = l ? (adv ? '#40d050' : '#e8a010') : '#1d1f1c'; c.fillRect(x, y, 114, 60); txt(c, t, x + 57, y + 31, l ? '#111' : '#55584f', t.length > 9 ? 15 : 18); });
    caut.tex.needsUpdate = true;
  }

  // ================================================================ the HUD
  const hc = hud.ctx;
  const _pr = [0, 0];
  function projLocal(d) {
    if (d.z > -1e-4) return null;
    const E = TEYE[0], t = (HUD.z - E.z) / d.z, x = E.x + d.x * t, y = E.y + d.y * t - HUD.cy;
    _pr[0] = HUD.W / 2 + x / HUD.hw * HUD.W / 2; _pr[1] = HUD.H / 2 - y / HUD.hh * HUD.H / 2; return _pr;
  }
  const projWorldDir = dw => { _v.copy(dw).applyQuaternion(_iq); return projLocal(_v); };
  const projWorldPt = p => { _v.copy(p).sub(_eye).applyQuaternion(_iq); if (_v.z > -0.5) return null; _v.normalize(); return projLocal(_v); };
  const onGlass = p => p && p[0] > 4 && p[0] < HUD.W - 4 && p[1] > 4 && p[1] < HUD.H - 4;
  function drawHUD(A, S) {
    const c = hc, W = HUD.W, H = HUD.H; c.clearRect(0, 0, W, H);
    if (!S.power || (S.flicker && Math.random() < 0.35)) { hud.tex.needsUpdate = true; return; }
    c.save(); c.strokeStyle = GRN; c.fillStyle = GRN; c.lineWidth = 3.2; c.shadowColor = 'rgba(80,255,110,.8)'; c.shadowBlur = 4;
    const line = (x0, y0, x1, y1) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
    const T = (t, x, y, a = 'center', sz = 17) => { c.font = `bold ${Math.round(sz * 1.65)}px ${MONO}`; c.textAlign = a; c.textBaseline = 'alphabetic'; c.fillText(t, x, y); };
    const mode = S.mode;
    // waterline: the 1980 "W"
    const wl = projLocal(_w.set(0, 0, -1)); if (wl) { const [x, y] = wl; line(x - 16, y, x - 8, y); line(x - 8, y, x - 4, y + 7); line(x - 4, y + 7, x, y); line(x, y, x + 4, y + 7); line(x + 4, y + 7, x + 8, y); line(x + 8, y, x + 16, y); }
    let vv = null; if (A.tas > 8) { const p = projWorldDir(_w.copy(A.vel).normalize()); if (p) vv = [clamp(p[0], 20, W - 20), clamp(p[1], 20, H - 20)]; }
    const fx = vv ? vv[0] : W / 2, fy = vv ? vv[1] : H / 2;
    // pitch ladder: conformal, every 5°, solid above, dashed below (horizon long)
    const hv = A.tas > 8 ? Math.atan2(A.vel.x, -A.vel.z) : A.heading();
    for (let k = -85; k <= 85; k += 5) {
      const e = k * D2R, mk = (dpsi, o) => { const p = projWorldDir(_w.set(Math.sin(hv + dpsi) * Math.cos(e), Math.sin(e), -Math.cos(hv + dpsi) * Math.cos(e))); return p ? (o[0] = p[0], o[1] = p[1], o) : null; };
      const half = k === 0 ? 0.24 : 0.07, gap = k === 0 ? 0.03 : 0.022;
      const a0 = mk(-half, [0, 0]), a1 = mk(-gap, [0, 0]), b0 = mk(gap, [0, 0]), b1 = mk(half, [0, 0]);
      if (!a0 || !a1 || !b0 || !b1) continue; if (Math.max(a0[1], b1[1]) < -40 || Math.min(a0[1], b1[1]) > H + 40) continue;
      c.setLineDash(k < 0 ? [7, 6] : []); line(a0[0], a0[1], a1[0], a1[1]); line(b0[0], b0[1], b1[0], b1[1]); c.setLineDash([]);
      if (k !== 0 && k % 10 === 0) { T(String(Math.abs(k)), a0[0] - 12, a0[1] + 6, 'right', 13); }
    }
    // velocity vector
    c.beginPath(); c.arc(fx, fy, 7, 0, TAU); c.stroke(); line(fx - 7, fy, fx - 20, fy); line(fx + 7, fy, fx + 20, fy); line(fx, fy - 7, fx, fy - 14);
    // heading scale
    { const hd = (deg(A.heading()) + 360) % 360, cx = W / 2, y = 30; for (let a = Math.ceil((hd - 14) / 5) * 5; a <= hd + 14; a += 5) { const x = cx + (a - hd) * 11; line(x, y, x, y + (a % 10 ? 6 : 11)); if (a % 10 === 0) T(String(((a + 360) % 360) / 10 | 0).padStart(2, '0'), x, y - 4, 'center', 13); } line(cx, y + 14, cx - 5, y + 21); line(cx, y + 14, cx + 5, y + 21); }
    // airspeed (left) and altitude (right) as numbers; Mach and g under the speed
    T(String(Math.round(A.eas * KT)), 72, H / 2 - 22, 'center', 19); c.strokeRect(26, H / 2 - 54, 92, 42);
    const ftv = A.pos.y * FT; T(String(Math.round(ftv / 10) * 10), W - 76, H / 2 - 22, 'center', 19); c.strokeRect(W - 132, H / 2 - 54, 112, 42);
    if (S.agl < 300) T(`${Math.round(S.agl * FT / 10) * 10} R`, W - 76, H / 2 + 14, 'center', 14);
    T(`${A.mach.toFixed(2)}`, 72, H / 2 + 14, 'center', 14);
    if (mode === 'A/A' || A.nz > 3) T(`${A.nz.toFixed(1)}G`, 72, H / 2 + 42, 'center', 14);
    T(mode, 50, H - 18, 'center', 13);
    // landing: AoA "E" bracket against the velocity vector (on speed = VV centred in it), ICLS needles
    if (mode === 'LDG' || (mode === 'T.O.' && !A.onGround && A.gear > 0.5)) {
      const bx = fx - 34, u = units(A.alpha), by = fy - (u - 15) * 4;
      line(bx, by - 20, bx, by + 20); line(bx, by - 20, bx + 7, by - 20); line(bx, by + 20, bx + 7, by + 20); line(bx, by, bx + 7, by);
      if (S.carrier && S.carrier.icls) { const { gs, loc } = S.carrier.icls, cx = W / 2, cy = H / 2 + 10; c.setLineDash([3, 4]); line(cx - 70, cy + clamp(gs, -1.5, 1.5) * 50, cx + 70, cy + clamp(gs, -1.5, 1.5) * 50); line(cx - clamp(loc, -3, 3) * 25, cy - 70, cx - clamp(loc, -3, 3) * 25, cy + 70); c.setLineDash([]); }
    }
    if (S.carrier) { const p = projWorldPt(S.carrier.pos); if (onGlass(p)) { c.strokeRect(p[0] - 9, p[1] - 3, 18, 6); line(p[0] + 3, p[1] - 3, p[0] + 3, p[1] - 9); } }
    // weapons
    if (mode === 'A/A') {
      const w = S.wpn;
      if (w === 'SW' && S.seeker) { const p = projWorldDir(S.seeker.dir); if (p) { c.beginPath(); c.arc(p[0], p[1], S.seeker.locked ? 13 : 34, 0, TAU); c.stroke(); } }
      if ((w === 'SP' || w === 'PH') && S.tgt) {   // ASE circle (allowable steering error), steering dot toward the target
        const p = projWorldPt(S.tgt.pos), cx = W / 2, cy = H / 2; c.beginPath(); c.arc(cx, cy, 60, 0, TAU); c.stroke();
        if (p) { const dx = clamp(p[0] - cx, -80, 80), dy = clamp(p[1] - cy, -80, 80); c.beginPath(); c.arc(cx + dx * 0.75, cy + dy * 0.75, 4, 0, TAU); c.fill(); }
      }
      T(`${w}  ${S.count || 0}`, W / 2, H - 18, 'center', 14);
    } else if (mode === 'A/G') { T('GUN  A/G', W / 2, H - 18, 'center', 14); }
    if (S.tgt) {   // target diamond on the radar track, range, the IN RANGE cue
      const p = projWorldPt(S.tgt.pos);
      if (onGlass(p)) { c.beginPath(); c.moveTo(p[0], p[1] - 14); c.lineTo(p[0] + 14, p[1]); c.lineTo(p[0], p[1] + 14); c.lineTo(p[0] - 14, p[1]); c.closePath(); c.stroke(); if (S.tgt.lock) { c.beginPath(); c.arc(p[0], p[1], 20, 0, TAU); c.stroke(); } }
      T(`${(S.tgt.range / 1852).toFixed(1)}`, W - 64, H / 2 + 46, 'center', 14);
      if (S.tgt.shoot && (performance.now() % 600) < 400) T('SHOOT', W / 2, H - 46, 'center', 20);
    }
    if (S.pipper) { const p = projWorldPt(S.pipper); if (onGlass(p)) { c.beginPath(); c.arc(p[0], p[1], 22, 0, TAU); c.stroke(); c.fillRect(p[0] - 2, p[1] - 2, 4, 4); if (S.tgt) { const fr = clamp(S.tgt.range / 1200, 0, 1); c.lineWidth = 4; c.beginPath(); c.arc(p[0], p[1], 26, -Math.PI / 2, -Math.PI / 2 + fr * TAU); c.stroke(); c.lineWidth = 2.4; } } }
    // cues
    if (A.cat) T(A.cat.state === 'hold' ? 'CAT  -  MIL TO LAUNCH' : 'CAT', W / 2, H - 70, 'center', 14);
    if (A.wire) T(`WIRE ${A.trapWire}`, W / 2, H - 70, 'center', 17);
    if (S.stallCue) { if ((performance.now() % 500) < 330) T(S.stallCue, W / 2, H / 2 + 74, 'center', 17); }
    if (S.afcs && S.afcs !== 'OFF') T(S.afcs, W - 62, H - 18, 'center', 13);
    c.restore(); hud.tex.needsUpdate = true;
  }

  // ================================================================ per frame
  let t = 0, slot = 0, mcFlash = 0, seatNow = 0, lastS = null, lastA = null;
  function stateOf(id, S, A) {
    const ss = S.ss, k = id.endsWith('R') ? 1 : 0, onOff = v => v ? 'ON' : 'OFF';
    if (ss && (id === 'genL' || id === 'genR')) return `${ss.gen[k] ? 'NORM' : 'OFF'}${ss.gens[k] ? '  -  ON LINE' : ''}`;
    if (ss && (id === 'crankL' || id === 'crankR')) return `${ss.crank}${ss.cranking && ss.cranking[k] ? '  -  ' + ss.cranking[k] + ' AIR' : ''}`;
    if (ss && (id === 'thrL' || id === 'thrR')) return `${ss.thrOff[k] ? 'OFF' : 'IDLE'}  -  RPM ${Math.round(A.eng[k].n * 100)}%`;
    if (id === 'sasP' || id === 'sasR' || id === 'sasY') return onOff((S.sasCh || [])['PRY'.indexOf(id[3])]);
    const sw0 = S.sweep || {};
    switch (id) {
      case 'afcs': return S.afcs && S.afcs !== 'OFF' ? 'ENGAGED' : 'OFF';
      case 'alt': return S.afcs === 'ALT' ? 'ALT HOLD' : 'OFF';
      case 'dump': return onOff(S.dump); case 'lights': return onOff(S.lights); case 'arm': return S.arm ? 'ARM' : 'SAFE';
      case 'canopy': return A.canopyCmd ? 'OPEN' : 'CLOSED'; case 'pbrake': return S.pbrake ? 'SET' : 'OFF';
      case 'gear': return A.gearCmd ? 'DOWN' : 'UP'; case 'hook': return A.hookCmd ? 'DOWN' : 'UP'; case 'flaps': return A.flapSel ? 'DN' : 'UP';
      case 'emer': case 'emerFwd': case 'emerAft': return `${sw0.mode || 'AUTO'}  ${Math.round(sw0.mode === 'EMER' || sw0.mode === 'OVER' ? sw0.handle : A.sweep)}°`;
      case 'sweepFwd': case 'sweepAft': case 'sweepAuto': return `${sw0.mode || 'AUTO'}  ${Math.round(A.sweep)}°`;
      case 'wpn': case 'rio:wpn': return S.wpn; case 'hsdmode': return S.hsdMode; case 'rio:stt': return S.lock ? 'STT' : 'TWS';
      case 'fireL': case 'fireR': return S.fire && S.fire[k] ? 'FIRE' : '';
    }
    if (id.startsWith('hud:')) return S.mode === id.slice(4) ? 'SELECTED' : '';
    return '';
  }
  const ease = (o, k, v, r) => { o[k] += (v - o[k]) * r; };
  const C = {
    group: g, TEYE, MODES,
    get hitBoxes() { return seatNow ? hitsR : hitsP; },
    // the hint line's text for the control under the cursor: its placard plus where it is now ("[NORM]", "[OFF]" ...)
    labelOf(id) { const h = [...hitsP, ...hitsR].find(o => o.userData.sw === id), st = lastS && lastA ? stateOf(id, lastS, lastA) : ''; return (h ? h.userData.label : id) + (st ? `  [${st}]` : ''); },
    press(id) { if (id === 'mc') mcFlash = 0.2; if (id === 'rio:rng+') tidRange = Math.min(16000, tidRange * 2); if (id === 'rio:rng-') tidRange = Math.max(1000, tidRange / 2); },
    get tidRange() { return tidRange; }, set tidRange(v) { tidRange = v; },
    // A = the airframe sim, ctl = pilot inputs { pitch, roll, yaw, throttle:[l,r], brakeL, brakeR }, S = everything else (tomcatplay.js)
    update(A, ctl, dt, S) {
      t += dt; seatNow = S.seat || 0; lastS = S; lastA = A;
      const E = TEYE[0]; _eye.copy(E).applyQuaternion(A.q).add(A.pos); _iq.copy(A.q).invert();
      pilotFig.visible = seatNow === 1; rioFig.visible = seatNow === 0;
      if (seatNow === 0) {   // the RIO's head: mostly down on the TID, a look out to either side now and then, braced under g
        const ph = t % 14, look = ph < 6 ? 0 : ph < 8 ? Math.sin((ph - 6) / 2 * Math.PI) * 0.9 : ph < 10 ? 0 : ph < 12 ? -Math.sin((ph - 10) / 2 * Math.PI) * 0.8 : 0;
        rioHead.rotation.set(look ? 0.08 : -0.32 + clamp((A.nz - 1) * 0.04, 0, 0.25), look, 0, 'YXZ');
      }
      // moving parts
      stickP.rotation.set((ctl.pitch || 0) * 0.26, 0, -(ctl.roll || 0) * 0.26);
      const ss = S.ss || { thrOff: [false, false], crank: 'OFF', gen: [true, true] };
      thr.forEach((o, i) => { const v = clamp(ctl.throttle ? ctl.throttle[i] : 0, 0, 1); o.position.y = ss.thrOff[i] ? -0.138 : -0.11 + 0.24 * v; });
      pedals[0].p.position.z = -6.35 + (ctl.yaw || 0) * 0.07; pedals[1].p.position.z = -6.35 - (ctl.yaw || 0) * 0.07;
      pedals[0].pl.rotation.x = -0.35 - (ctl.brakeL || 0) * 0.25; pedals[1].pl.rotation.x = -0.35 - (ctl.brakeR || 0) * 0.25;
      if (S.shaker > 0.05) { const k = S.shaker * 0.004; pedals[0].p.position.x = -0.17 + (Math.random() - 0.5) * k; pedals[1].p.position.x = 0.17 + (Math.random() - 0.5) * k; }
      canopyG.rotation.x = A.canopy * TCAT.CANOPY_OPEN;
      gearH.rotation.x = A.gearCmd ? 0.0 : 0.5; gearH.position.y = A.gearCmd ? -0.19 : -0.15; hookH.position.y = A.hookCmd ? -0.19 : -0.15;
      flapH.rotation.x = A.flapSel ? -0.6 : 0.3;
      const sw0 = S.sweep || {}; ehGuard.rotation.x = sw0.mode === 'EMER' || sw0.mode === 'OVER' ? -1.4 : 0; ehLever.position.z = -0.15 + 0.3 * clamp(((sw0.handle ?? 20) - 20) / 55, 0, 1);
      sweepSw.position.y = sw0.thumb ? sw0.thumb * 0.006 : 0;
      const flip = (id, on) => { if (sw[id]) sw[id].rotation.x = on ? -0.5 : 0.5; }, sc = S.sasCh || [S.sas, S.sas, S.sas];
      flip('arm', S.arm); flip('sasP', sc[0]); flip('sasR', sc[1]); flip('sasY', sc[2]); flip('afcs', S.afcs && S.afcs !== 'OFF'); flip('alt', S.afcs === 'ALT');
      flip('genL', ss.gen[0]); flip('genR', ss.gen[1]); flip('dump', S.dump);
      crankSw.rotation.y = ss.crank === 'L' ? -0.5 : ss.crank === 'R' ? 0.5 : 0;
      flip('lights', S.lights); flip('rio:cmd', S.cmdSel !== 'RIO');
      canH.position.z = A.canopyCmd ? 0.025 : 0; pbH.position.z = S.pbrake ? 0.022 : 0;
      for (const m of MODES) modeB[m].position.z = 0.006 - (S.mode === m ? 0.005 : 0);
      void hsdB; void jettB;
      // lamps
      const blink = (performance.now() % 500) < 260, u = units(A.alpha), pa = A.gear > 0.5 && !A.onGround;
      setLamp(idx.hi, pa && u > 16.5); setLamp(idx.on, pa && u >= 13.5 && u <= 16.5); setLamp(idx.lo, pa && u < 13.5);
      mcFlash -= dt;
      setLamp(L.mc, (S.masterCaution && blink) || mcFlash > 0); setLamp(L.wheels, S.wheels && blink); setLamp(L.altlo, S.altLow); setLamp(L.launch, S.rwrLaunch && blink);
      setLamp(L.acm, S.arm); setLamp(L.sweep, (S.cautions || []).includes('WING SWEEP') || sw0.mode === 'EMER'); setLamp(L.hook, A.hook > 0.01 && A.hook < 0.99 || (A.hookCmd && !A.wire && A.onGround));
      setLamp(L.fireL, S.fire && S.fire[0] && blink); setLamp(L.fireR, S.fire && S.fire[1] && blink);
      setLamp(rLamps.mc, (S.masterCaution && blink) || mcFlash > 0); setLamp(rLamps.launch, S.rwrLaunch && blink);
      setLamp(rLamps.ph, S.wpn === 'PH'); setLamp(rLamps.sp, S.wpn === 'SP'); setLamp(rLamps.sw, S.wpn === 'SW'); setLamp(rLamps.stt, S.lock); setLamp(rLamps.tws, !S.lock && S.power);
      gearRed.material.color.setHex(A.gear > 0.01 && A.gear < 0.99 && S.ess !== false ? 0xff2010 : 0x300808);
      if (S.ess === false) for (const o of allLamps) setLamp(o, false);   // no essential bus: every light in the cockpit dark
      // hover marker
      hov.visible = false;
      if (S.hover) { const h = C.hitBoxes.find(o => o.userData.sw === S.hover); if (h) { h.updateWorldMatrix(true, false); g.updateWorldMatrix(true, false); hov.visible = true; h.geometry.computeBoundingBox(); const bb = h.geometry.boundingBox; hov.matrix.copy(g.matrixWorld).invert().multiply(h.matrixWorld).multiply(new THREE.Matrix4().makeScale(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z)); } }
      // needles: damped toward the sim
      const r = Math.min(1, dt * 8), att = A.attitude();
      ease(V, 'ias', A.eas * KT, r); ease(V, 'mach', A.mach, r); ease(V, 'alt', A.pos.y * FT, r); ease(V, 'vsi', A.vel.y * FT * 60, Math.min(1, dt * 3)); ease(V, 'g', A.nz, r); ease(V, 'aoa', units(A.alpha), r);
      ease(V, 'sweep', A.sweep, r); ease(V, 'cmd', sw0.cmd ?? A.sweep, r); V.p = att.pitch; V.r = att.roll; ease(V, 'flap', A.surf.flap, r); ease(V, 'slat', A.surf.lef, r);
      for (let k = 0; k < 2; k++) { const e = A.eng[k]; V.rpm[k] += (e.n * 100 - V.rpm[k]) * r; V.tit[k] += (e.egt * 1.25 - V.tit[k]) * r; V.ff[k] += (e.ff * 7937 - V.ff[k]) * r; V.noz[k] += ((e.ab > 0.01 ? 0.5 + 0.5 * e.ab : clamp((e.nozzle - 0.3) / 0.7, 0, 1) * 0.5) * 100 - V.noz[k]) * r; V.oil[k] += (e.oil - V.oil[k]) * r; }
      // displays: the seat you're in every frame / round robin; the other seat slowly
      if (seatNow === 0) {
        drawHUD(A, S); if ((slot & 1) === 0) drawVDI(A, S); else drawHSD(A, S);
      } else { if ((slot & 1) === 0) drawTID(A, S); else drawDDD(A, S); }
      slot = (slot + 1) % 8;
      for (let i = slot % 4; i < gauges.length; i += 4) { const G = gauges[i]; if (G.seat !== seatNow && slot > 3) continue; const cx = G.ctx; cx.clearRect(0, 0, G.W, G.W); if (G.bg) cx.drawImage(G.bg, 0, 0); G.dyn(cx, G.W, S, G); G.tex.needsUpdate = true; }
      if (slot % 4 === 1) for (const R of rects) { R.dyn(R.ctx, R.w, R.h, S, A); R.tex.needsUpdate = true; }
      if (slot % 4 === 3) drawCaut(S);
    },
  };
  // the RIO's standby instruments and RWR repeat (seat 1)
  gauge('rasi', 192, (c, W) => { const R = W / 2; faceBg(c, W); for (let v = 0; v <= 850; v += 50) radial(c, R, asiMap(v), '#ecebe2', R * 0.76, R * 0.93, R * 0.035); for (const v of [100, 200, 300, 400, 600, 800]) { const [x, y] = P2(R, R * 0.58, asiMap(v)); txt(c, String(v / 10), x, y, '#ecebe2', R * 0.16); } txt(c, 'KNOTS', R, R * 1.36, '#cfcdc0', R * 0.1); }, (c, W) => { const R = W / 2; needle(c, R, asiMap(V.ias), R * 0.86); hub(c, R, 0.1); }, RP, RGL);
  gauge('ralt', 192, (c, W) => dialFace(c, W, { map: lin(0, 0, 1000, 360), v0: 0, v1: 980, major: 100, minor: 20, labels: [0, 2, 4, 6, 8].map(k => [k * 100, String(k)]), lr: 0.6 }), (c, W) => { const R = W / 2; drum(c, R * 0.5, R * 0.72, R * 1.0, R * 0.28, Math.floor(Math.max(0, V.alt) / 100), 3); needle(c, R, (Math.max(0, V.alt) % 1000) / 1000 * 360, R * 0.86); hub(c, R, 0.1); }, RP, RGL);
  gauge('rclk', 128, (c, W) => dialFace(c, W, { map: lin(0, 0, 60, 360), v0: 0, v1: 59, major: 5, minor: 5, labels: [[0, '12'], [30, '6']], ls: 0.24 }), (c, W) => { const R = W / 2, d = new Date(); needle(c, R, (d.getHours() % 12 + d.getMinutes() / 60) * 30, R * 0.5, '#f2f2ea', R * 0.1); needle(c, R, d.getMinutes() * 6, R * 0.8, '#f2f2ea', R * 0.07); hub(c, R, 0.1); }, RP, RGL);
  gauge('rrwr', 192, null, rwrDraw, RP, RGL);
  void pilotSeatFig; void cmdSel;
  return C;
}
