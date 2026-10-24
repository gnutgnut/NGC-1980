// C-130H / KC-130R flight deck, 1980 analog: a full 3D interior in airframe space (x right, y up, nose -z, origin = CG,
// same frame as c130model.js), so it rides with the aeroplane and free look finds a whole flight deck.
// - Main instrument panel (C-130H layout, simplified): pilot's ASI / ADI / altimeter, radar altimeter / HSI / VSI,
//   turn & slip / clock; the centre engine stack, four columns (engines 1-4 left to right) of TORQUE, TIT, RPM and FUEL
//   FLOW; flap position, fuel quantity, the gear handle with its three greens; the copilot's flight instruments.
//   Glare shield: MASTER CAUTION, the caution / advisory lights, the jump light repeaters (red / green) and AP status.
// - Pedestal: four power levers with the flight idle gate (the beta range below it on the ground), the flap lever,
//   the elevator trim wheel and tab indicator, the autopilot panel.
// - Overhead: four condition levers (RUN / GND STOP / AIR START / FEATHER), the four fire T-handles, engine start
//   buttons, autofeather arm.
// - Pilot's side console: the PARATROOP panel - jump light switch (OFF / RED / GREEN), alarm bell, and (a game liberty:
//   in the real aircraft the loadmaster runs them) the para door and ramp switches.
// - Both yokes and both pairs of rudder pedals move with the controls; a copilot, a flight engineer and the navigator
//   (at his table with the APN-59 radar scope and the APN-147 Doppler readout) in their seats.
// Every gauge face is a canvas drawn live, round-robin (~15 Hz each). Switches are clickable (hit boxes; the hover gets a
// yellow frame), like the Huey and Hornet cockpits.
// API: buildC130Deck() -> { group, hitBoxes, labelOf(id, S, X), update(S, X, dt, hoverId), canvases() }
//   S = c130fm sim, X = { ap, jumpLight: 'off'|'red'|'green', dz: { brg (rad, heading convention), dist (m) } | null,
//   agl (m), cautions: { ... }, time }
import * as THREE from 'three';
import { C130M, windowFrames, noseLiningGeo, noseGlassGeo } from './c130model.js';
import { KT, K_EQ, C130 } from './c130fm.js';

export const DECK_EYE = new THREE.Vector3(...C130M.EYE_L), DECK_EYE_PITCH = -0.13;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2, D2R = Math.PI / 180, FT = 3.28084;
const SANS = 'Arial, "Liberation Sans", Helvetica, sans-serif';
const FLOOR = -0.2;
const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _mInv = new THREE.Matrix4();

function canvasTex(w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { cv, ctx: cv.getContext('2d'), tex };
}
// ---------------------------------------------------------------- dial drawing (angles in degrees, clockwise from 12)
const P2 = (R, r, a) => [R + Math.sin(a * D2R) * r, R - Math.cos(a * D2R) * r];
function txt(c, t, x, y, col, size, align = 'center', bold = true) { c.fillStyle = col; c.font = `${bold ? 'bold ' : ''}${Math.round(size)}px ${SANS}`; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(t, x, y); }
function faceBg(c, W) { const R = W / 2; c.clearRect(0, 0, W, W); c.fillStyle = '#0c0d0e'; c.beginPath(); c.arc(R, R, R, 0, TAU); c.fill(); }
function band(c, R, a0, a1, col, r, w) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.arc(R, R, r, (a0 - 90) * D2R, (a1 - 90) * D2R); c.stroke(); }
function radial(c, R, a, col, r0, r1, w) { const [x0, y0] = P2(R, r0, a), [x1, y1] = P2(R, r1, a); c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
function needle(c, R, a, len, col = '#f2f2ea', w = R * 0.07, tail = 0.2, cx = R, cy = R) {
  c.save(); c.translate(cx, cy); c.rotate(a * D2R); c.fillStyle = col; c.beginPath();
  c.moveTo(-w / 2, tail * R); c.lineTo(-w * 0.32, -len * 0.8); c.lineTo(0, -len); c.lineTo(w * 0.32, -len * 0.8); c.lineTo(w / 2, tail * R); c.closePath(); c.fill(); c.restore();
}
function hub(c, R, r = 0.09) { c.fillStyle = '#2a2b2c'; c.beginPath(); c.arc(R, R, R * r, 0, TAU); c.fill(); c.strokeStyle = '#666'; c.lineWidth = 1; c.stroke(); }
const lin = (v0, a0, v1, a1) => v => a0 + clamp((v - v0) / (v1 - v0), -0.02, 1.04) * (a1 - a0);
function dialFace(c, W, o) {
  const R = W / 2, m = o.map; faceBg(c, W);
  for (const [va, vb, col] of o.bands || []) band(c, R, m(va), m(vb), col, R * 0.86, R * 0.09);
  for (let v = o.v0; v <= o.v1 + 1e-6; v += o.minor) {
    const maj = Math.abs(v / o.major - Math.round(v / o.major)) < 1e-4; radial(c, R, m(v), '#ecebe2', R * (maj ? 0.74 : 0.8), R * 0.92, maj ? R * 0.045 : R * 0.025);
  }
  for (const v of o.reds || []) radial(c, R, m(v), '#e8281a', R * 0.7, R * 0.96, R * 0.06);
  for (const [v, t] of o.labels || []) { const [x, y] = P2(R, R * (o.lr || 0.56), m(v)); txt(c, t, x, y, '#ecebe2', R * (o.ls || 0.2)); }
  if (o.title) o.title.split('|').forEach((t, i, a) => txt(c, t, R, R * (o.ty || 1.34) + (i - (a.length - 1) / 2) * R * 0.16, '#cfcdc0', R * (o.ts || 0.13)));
}

// ---------------------------------------------------------------- the deck
export function buildC130Deck() {
  const g = new THREE.Group(); g.visible = false; g.name = 'c130Deck';
  const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.45), ...o });
  const black = M(0x151617), panelM = M(0x1c1e1f), glareM = M(0x222527), wallM = M(0x6e7568), wallD = M(0x4f554b), floorM = M(0x2f3331);
  const seatM = M(0x3c3a33), cushion = M(0x5a4a33), metal = M(0x8a8f93), frameM = M(0x3c4146), redM = M(0xc01a10), whiteM = M(0xdedbd0);
  const knobM = M(0x1a1a1a), yellowM = M(0xd8b21a), suit = M(0x6b7055), helmetM = M(0xd2d2c8), skinM = M(0xc19a77), gloveM = M(0x3a3226), bootM = M(0x161616);
  const box = (w, h, d, m, x, y, z, p = g, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); p.add(o); return o; };
  const cyl = (r0, r1, h, m, x, y, z, p = g, rx = 0, rz = 0, seg = 8) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); p.add(o); return o; };
  const plane = (w, h, mat, x, y, z, p = g) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); o.position.set(x, y, z); p.add(o); return o; };
  const lit = c => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  const canvasMat = (t, k = 0.6) => new THREE.MeshLambertMaterial({ map: t.tex, emissive: 0xffffff, emissiveMap: t.tex, emissiveIntensity: k });
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const tube = (pts, r, m = frameM, p = g) => { const o = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(q => q.isVector3 ? q : V3(...q))), Math.max(4, pts.length * 4), r, 6), m); p.add(o); return o; };
  const limbGeo = new THREE.CylinderGeometry(1, 0.9, 1, 8);
  const limb = (a, b, r, m) => { const o = new THREE.Mesh(limbGeo, m); o.userData.r = r; g.add(o); setLimb(o, a, b); return o; };
  function setLimb(o, a, b) { _v.subVectors(b, a); const L = _v.length(); o.position.copy(a).addScaledVector(_v, 0.5); o.quaternion.setFromUnitVectors(_up, _v.multiplyScalar(1 / L)); o.scale.set(o.userData.r, L, o.userData.r); }

  // ---------------------------------------------------------------- shell: lining, glass, frames, floor, bulkhead
  { const lining = new THREE.Mesh(noseLiningGeo(0.05), [M(0x737a6c, { side: THREE.DoubleSide })]); g.add(lining); }
  const glassM = new THREE.MeshBasicMaterial({ color: 0xb8d4e6, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
  { const gl = new THREE.Mesh(noseGlassGeo(), glassM); gl.renderOrder = 5; g.add(gl); }
  for (const [pts, r] of windowFrames()) tube(pts.map(p => V3(p[0] * 0.985, p[1] - 0.012, p[2])), r * 0.6, frameM);
  box(3.6, 0.04, 2.95, floorM, 0, FLOOR - 0.02, -10.82);                         // flight deck floor
  box(3.9, 2.3, 0.05, wallD, 0, 0.95, -9.42);                                     // aft bulkhead (crew rest / bunk behind)
  box(0.9, 1.7, 0.06, M(0x2a2c2a), 1.1, 0.65, -9.44);                             // doorway to the stairs down into the hold
  box(3.6, 0.6, 0.05, wallD, 0, -0.5, -12.0);                                     // forward floor bulkhead under the panel (nose wheel well)
  // chin windows down by the rudder pedals are glass in the nose skin; the floor stops short of them

  // ---------------------------------------------------------------- glare shield and the main panel
  box(3.15, 0.035, 0.24, glareM, 0, 0.635, -11.56); box(3.15, 0.06, 0.025, glareM, 0, 0.61, -11.45);   // glare shield, padded lip just aft of the panel top
  const P = new THREE.Group(); P.position.set(0, 0.25, -11.43); P.rotation.x = -0.16; g.add(P);   // x right, y up the face, z toward the crew
  box(3.1, 0.74, 0.04, panelM, 0, 0.0, -0.025, P);
  const GL = {
    asi: [-0.92, 0.2, 0.11], adi: [-0.66, 0.18, 0.15], alt: [-0.40, 0.2, 0.11],
    ralt: [-0.92, 0.04, 0.095], hsi: [-0.66, 0.0, 0.15], vsi: [-0.40, 0.04, 0.1],
    ts: [-0.92, -0.12, 0.085], clk: [-0.40, -0.12, 0.075], acc: [-1.14, 0.12, 0.08],
    asi2: [0.40, 0.2, 0.11], adi2: [0.66, 0.18, 0.15], alt2: [0.92, 0.2, 0.11],
    vsi2: [0.40, 0.04, 0.1], hsi2: [0.66, 0.0, 0.15], ralt2: [0.92, 0.04, 0.095], clk2: [0.92, -0.12, 0.075],
    flap: [-0.15, -0.23, 0.085], fuel: [0.0, -0.23, 0.085], hyd: [0.15, -0.23, 0.085],
  };
  const EX = [-0.165, -0.055, 0.055, 0.165], ER = { tq: 0.235, tit: 0.13, rpm: 0.025, ff: -0.08 };
  for (let k = 0; k < 4; k++) for (const r in ER) GL[r + k] = [EX[k], ER[r], 0.09];
  // static panel art
  const art = canvasTex(2048, 512), PXM = 660, ax = x => (x + 1.55) * PXM, ay = y => (0.37 - y) * PXM;
  {
    const c = art.ctx; c.fillStyle = '#1b1d1e'; c.fillRect(0, 0, 2048, 512);
    c.strokeStyle = '#33373a'; c.lineWidth = 3;
    for (const [x0, x1] of [[-1.25, -0.27], [-0.235, 0.235], [0.27, 1.25]]) c.strokeRect(ax(x0), ay(0.31), (x1 - x0) * PXM, 0.62 * PXM);
    for (const k in GL) {
      const [x, y, d] = GL[k], s = d * 1.12 * PXM; c.fillStyle = '#111213'; c.fillRect(ax(x) - s / 2, ay(y) - s / 2, s, s);
      c.fillStyle = '#5a5e60'; for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.beginPath(); c.arc(ax(x) + dx * s * 0.41, ay(y) + dy * s * 0.41, 3, 0, TAU); c.fill(); }
    }
    const lab = (t, x, y, s = 11, col = '#e0ddd0') => txt(c, t, ax(x), ay(y), col, s);
    ['1', '2', '3', '4'].forEach((n, k) => lab(n, EX[k], 0.295, 13));
    lab('TORQUE', 0, 0.183, 9, '#9a9d98'); lab('TURBINE INLET TEMP', 0, 0.078, 9, '#9a9d98'); lab('TACHOMETER', 0, -0.027, 9, '#9a9d98'); lab('FUEL FLOW', 0, -0.132, 9, '#9a9d98');
    lab('PILOT', -1.05, 0.29, 11, '#8a8d88'); lab('COPILOT', 1.05, 0.29, 11, '#8a8d88');
    lab('MAX TORQUE 19,600 IN-LB   TIT 1083°C 5 MIN   RPM 98-102 %', 0, -0.33, 11);
    lab('FLAPS: 100% 145  50% 180  10% 220 KIAS   GEAR 165   RAMP+DOOR 150   DOORS 185', -0.75, -0.3, 10);
    lab('LANDING GEAR', -0.32, -0.33, 10, '#9a9d98');
    c.fillStyle = '#2a2d2e'; c.fillRect(ax(0.95), ay(-0.27), 130, 30); lab('KC-130R', 1.05, -0.293, 15, '#d0d0c8');
    art.tex.needsUpdate = true;
  }
  plane(3.1, 0.776, new THREE.MeshLambertMaterial({ map: art.tex, emissive: 0xffffff, emissiveMap: art.tex, emissiveIntensity: 0.5 }), 0, -0.01, 0.0, P);
  const gauges = [], ringM = M(0x2a2c2e);
  function gauge(key, size, face, dyn) {
    const [x, y, d] = GL[key], t = canvasTex(size, size), o = new THREE.Mesh(new THREE.CircleGeometry(d / 2, 32), new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false, color: 0xe2e2e2 }));
    o.position.set(x, y, 0.004); P.add(o);
    const ring = new THREE.Mesh(new THREE.RingGeometry(d / 2, d / 2 + 0.006, 32), ringM); ring.position.set(x, y, 0.006); P.add(ring);
    let bg = null; if (face) { bg = document.createElement('canvas'); bg.width = bg.height = size; face(bg.getContext('2d'), size); }
    const G = { key, W: size, ...t, bg, dyn, i: gauges.length }; gauges.push(G); return G;
  }
  // ---------------------------------------------------------------- lamps
  function lamp(parent, w, h, x, y, z, text, on, off = '#2a2420', ink = '#111') {
    const mk = litOn => { const W = Math.round(w * 2400), H = Math.round(h * 2400), t = canvasTex(W, H), c = t.ctx; c.fillStyle = litOn ? on : off; c.fillRect(0, 0, W, H); c.strokeStyle = '#000'; c.lineWidth = 4; c.strokeRect(0, 0, W, H);
      const L = text.split('|'); L.forEach((s, i) => txt(c, s, W / 2, H / 2 + (i - (L.length - 1) / 2) * H * 0.4, litOn ? ink : '#5c5650', H * (L.length > 1 ? 0.32 : 0.46))); t.tex.needsUpdate = true; return t.tex; };
    const tOff = mk(false), tOn = mk(true), o = plane(w, h, new THREE.MeshBasicMaterial({ map: tOff, toneMapped: false }), x, y, z, parent);
    o.userData = { tOn, tOff, on: false }; return o;
  }
  const setLamp = (o, v) => { v = !!v; if (o.userData.on !== v) { o.userData.on = v; o.material.map = v ? o.userData.tOn : o.userData.tOff; } };
  // glare shield: master caution (pilot and copilot), jump light repeaters, AP, caution panel in the middle
  const GS = new THREE.Group(); GS.position.set(0, 0.6, -11.436); GS.rotation.x = -0.25; g.add(GS);
  const mcL = lamp(GS, 0.09, 0.04, -0.95, 0, 0, 'MASTER|CAUTION', '#ffaa18', '#2e2408'), mcR = lamp(GS, 0.09, 0.04, 0.95, 0, 0, 'MASTER|CAUTION', '#ffaa18', '#2e2408');
  const jrL = lamp(GS, 0.05, 0.04, -0.8, 0, 0, 'RED', '#ff2010', '#2a0806', '#fff'), jgL = lamp(GS, 0.05, 0.04, -0.74, 0, 0, 'GREEN', '#30ff40', '#062a08');
  const apL = lamp(GS, 0.07, 0.04, -0.6, 0, 0, 'AUTO|PILOT', '#40e050', '#0a2a10');
  const CAUT = [['GEAR|UNSAFE', 'gear'], ['FLAP|OVERSPEED', 'flapOs'], ['RAMP|OPEN', 'ramp'], ['PARA|DOOR', 'door'], ['OVER|TORQUE', 'otq'], ['TIT|HIGH', 'tit'],
    ['NTS', 'nts'], ['ENGINE|OUT', 'eng'], ['FUEL|LOW', 'fuel'], ['STALL|BUFFET', 'stall'], ['AUTO|FEATHER', 'af'], ['DOOR|OVERSPEED', 'doorOs']];
  const cautL = CAUT.map(([t, k], i) => [k, lamp(GS, 0.085, 0.036, -0.27 + (i % 6) * 0.093, i < 6 ? 0.022 : -0.02, 0, t, k === 'af' ? '#e8e8e0' : '#ffb020', '#24200c')]);
  // gear handle (wheel-shaped knob, red light in it) and three greens
  const gearPiv = new THREE.Group(); gearPiv.position.set(-0.32, -0.24, 0.01); P.add(gearPiv);
  box(0.02, 0.1, 0.02, metal, 0, 0.05, 0.02, gearPiv); const gearKnob = cyl(0.025, 0.025, 0.02, whiteM, 0, 0.1, 0.03, gearPiv, Math.PI / 2, 0, 12);
  const gearRed = lamp(P, 0.025, 0.018, -0.32, -0.29, 0.006, '', '#ff2010', '#300806');
  const greens = [-0.36, -0.32, -0.28].map((x, i) => lamp(P, 0.022, 0.018, x, -0.17, 0.006, '', '#30ff40', '#062a08'));

  // ---------------------------------------------------------------- switches and hit boxes
  const hitM = new THREE.MeshBasicMaterial({ visible: false }), hits = [], hitsOf = {};
  const hit = (id, w, h, d, x, y, z, p, label) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitM); o.position.set(x, y, z); o.userData.sw = id; o.userData.label = label; o.userData.size = [w, h, d]; p.add(o); hits.push(o); (hitsOf[id] = hitsOf[id] || []).push(o); return o; };
  const batM = M(0xd6d6ce), sw = {};
  const toggle = (id, p, x, y, label, { guard = false, three = false } = {}) => {
    cyl(0.009, 0.009, 0.006, metal, x, y, 0.003, p, Math.PI / 2);
    const piv = new THREE.Group(); piv.position.set(x, y, 0.005); p.add(piv);
    cyl(0.0035, 0.005, 0.03, batM, 0, 0, 0.015, piv, Math.PI / 2);
    if (guard) for (const s of [-1, 1]) box(0.003, 0.024, 0.03, redM, x + s * 0.013, y, 0.015, p);
    hit(id, 0.045, 0.05, 0.05, x, y, 0.02, p, label); sw[id] = piv; piv.userData.three = three; return piv;
  };
  const setToggle = (id, v) => { const p = sw[id]; if (p) p.rotation.x = -0.5 * v; };   // v: -1 down, 0 centre, 1 up
  hit('gear', 0.07, 0.16, 0.06, -0.32, -0.19, 0.03, P, 'LANDING GEAR LEVER');
  hit('mc', 0.1, 0.05, 0.03, -0.95, 0, 0.01, GS, 'MASTER CAUTION  -  RESET'); hit('mc', 0.1, 0.05, 0.03, 0.95, 0, 0.01, GS, 'MASTER CAUTION  -  RESET');
  hit('ap', 0.08, 0.05, 0.03, -0.6, 0, 0.01, GS, 'AUTOPILOT');

  // ---------------------------------------------------------------- pedestal: power levers, flap lever, trim, AP
  const PED = new THREE.Group(); PED.position.set(0, 0.28, -10.78); g.add(PED);
  box(0.5, 0.5, 1.05, panelM, 0, -0.25, 0, PED); box(0.48, 0.02, 1.0, M(0x232627), 0, 0.005, 0, PED);
  const pedArt = canvasTex(512, 1024); plane(0.48, 0.96, canvasMat(pedArt, 0.5), 0, 0.017, 0, PED).rotation.x = -Math.PI / 2;
  {
    const c = pedArt.ctx, X = x => (x + 0.24) / 0.48 * 512, Y = z => (z + 0.48) / 0.96 * 1024; c.fillStyle = '#202324'; c.fillRect(0, 0, 512, 1024);
    c.fillStyle = '#121314'; for (const x of [-0.12, -0.04, 0.04, 0.12]) c.fillRect(X(x) - 6, Y(-0.4), 12, Y(0.05) - Y(-0.4));   // lever slots
    c.fillRect(X(0.205) - 6, Y(-0.35), 12, Y(0.0) - Y(-0.35));
    const lab = (t, x, z, s = 14, col = '#d8d6cc') => txt(c, t, X(x), Y(z), col, s);
    lab('TAKEOFF', -0.0, -0.44, 13); lab('FLT IDLE', 0, -0.12, 12, '#ffd040'); lab('GND IDLE', 0, -0.03, 12); lab('REVERSE', 0, 0.07, 13);
    lab('FLAPS', 0.205, -0.38, 12); ['UP', '50', '100'].forEach((t, i) => lab(t, 0.205, -0.33 + i * 0.16, 11));
    c.strokeStyle = '#ffd040'; c.lineWidth = 3; c.beginPath(); c.moveTo(X(-0.17), Y(-0.1)); c.lineTo(X(0.17), Y(-0.1)); c.stroke();   // flight idle gate
    c.fillStyle = '#2a2d2e'; c.fillRect(X(-0.22), Y(0.18), 0.44 / 0.48 * 512, 0.26 / 0.96 * 1024); lab('AUTOPILOT', 0, 0.2, 14, '#9a9d98');
    lab('ENGAGE', -0.12, 0.38, 11); lab('ALT HOLD', 0.0, 0.38, 11); lab('ELEV TAB', 0.13, 0.38, 11);
    pedArt.tex.needsUpdate = true;
  }
  const throttles = EX.map((_, k) => {
    const x = [-0.12, -0.04, 0.04, 0.12][k], piv = new THREE.Group(); piv.position.set(x, 0.0, -0.15); PED.add(piv);
    box(0.018, 0.22, 0.018, metal, 0, 0.11, 0, piv); const kn = box(0.05, 0.035, 0.05, knobM, 0, 0.23, 0, piv);
    txt; return piv;
  });
  const flapPiv = new THREE.Group(); flapPiv.position.set(0.205, 0.0, -0.18); PED.add(flapPiv);
  box(0.014, 0.15, 0.014, metal, 0, 0.075, 0, flapPiv); box(0.06, 0.02, 0.035, whiteM, 0, 0.155, 0, flapPiv);   // airfoil-shaped knob
  hit('flap', 0.07, 0.2, 0.35, 0.205, 0.1, -0.18, PED, 'FLAP LEVER');
  const trimWheel = new THREE.Group(); trimWheel.position.set(-0.26, -0.08, 0.05); PED.add(trimWheel);
  { const w = cyl(0.11, 0.11, 0.03, black, 0, 0, 0, trimWheel, 0, Math.PI / 2, 16); for (let i = 0; i < 8; i++) box(0.035, 0.01, 0.012, whiteM, 0, Math.cos(i / 8 * TAU) * 0.1, Math.sin(i / 8 * TAU) * 0.1, trimWheel); }
  const PEDF = new THREE.Group(); PEDF.position.set(0, 0.02, 0.3); PEDF.rotation.x = -Math.PI / 2; PED.add(PEDF);   // the AP strip (face up)
  toggle('ap', PEDF, -0.12, -0.05, 'AUTOPILOT ENGAGE'); toggle('apAlt', PEDF, 0.0, -0.05, 'ALTITUDE HOLD');
  const tabInd = canvasTex(128, 128); plane(0.06, 0.06, new THREE.MeshBasicMaterial({ map: tabInd.tex, toneMapped: false }), 0.13, -0.06, 0.004, PEDF);

  // ---------------------------------------------------------------- overhead: condition levers, fire handles, starts
  // The panel faces down and aft (read with the head tipped back, so the text's "up" points aft); the condition levers
  // are at its front edge (local -y), fire handles in the middle, start buttons and autofeather at the back.
  const OH = new THREE.Group(); OH.position.set(0, 1.8, -11.0); OH.rotation.x = Math.PI / 2 - 0.42; g.add(OH);
  box(1.2, 0.9, 0.06, panelM, 0, 0, -0.04, OH);
  const ohArt = canvasTex(1024, 768); plane(1.2, 0.9, canvasMat(ohArt, 0.5), 0, 0, 0.0, OH);
  const OX = [-0.18, -0.06, 0.06, 0.18], OIL_X = [0.385, 0.435, 0.485, 0.535];
  {
    const c = ohArt.ctx, X = x => (x + 0.6) / 1.2 * 1024, Y = y => (0.45 - y) / 0.9 * 768; c.fillStyle = '#1e2122'; c.fillRect(0, 0, 1024, 768);
    const lab = (t, x, y, s = 16, col = '#d8d6cc') => txt(c, t, X(x), Y(y), col, s);
    c.strokeStyle = '#3a3f42'; c.lineWidth = 3; c.strokeRect(X(-0.32), Y(-0.06), 0.64 / 1.2 * 1024, 0.38 / 0.9 * 768); lab('ENGINE CONDITION', 0, -0.09, 16, '#9a9d98');
    ['RUN', 'GND STOP', 'AIR START', 'FEATHER'].forEach((t, i) => lab(t, -0.27, -0.39 + i * 0.075, 10));
    OX.forEach((x, k) => lab(String(k + 1), x, -0.42, 15));
    c.fillStyle = '#121314'; for (const x of OX) c.fillRect(X(x) - 5, Y(-0.12), 10, Y(-0.4) - Y(-0.12));
    lab('FIRE EMERGENCY', 0, 0.2, 15, '#e05040'); OX.forEach((x, k) => lab('ENG ' + (k + 1), x, 0.0, 11));
    lab('ENGINE START', 0, 0.37, 14, '#9a9d98'); lab('AUTOFEATHER', 0.42, 0.37, 12, '#9a9d98'); lab('ARM', 0.42, 0.33, 11);
    // the flight engineer's side: electrics, GTC and bleed air (left), engine oil (right)
    c.strokeRect(X(-0.58), Y(-0.06), 0.22 / 1.2 * 1024, 0.38 / 0.9 * 768); lab('GTC / AIR', -0.47, -0.09, 13, '#9a9d98');
    lab('BATTERY', -0.47, -0.37, 11); lab('GTC START', -0.47, -0.27, 11); lab('BLEED AIR', -0.47, -0.17, 11); lab('GTC RPM', -0.47, 0.1, 10, '#9a9d98');
    c.strokeRect(X(0.34), Y(-0.06), 0.24 / 1.2 * 1024, 0.38 / 0.9 * 768); lab('ENGINE OIL', 0.46, -0.09, 13, '#9a9d98');
    lab('PRESS', 0.46, -0.355, 9); lab('TEMP', 0.46, -0.235, 9); OIL_X.forEach((x, k) => lab(String(k + 1), x, -0.42, 10));
    ohArt.tex.needsUpdate = true;
  }
  const COND_POS = { run: 0, stop: 1, airstart: 2, feather: 3 };
  const condLevers = OX.map((x, k) => {
    const piv = new THREE.Group(); piv.position.set(x, -0.26, 0); OH.add(piv);
    box(0.014, 0.014, 0.12, metal, 0, 0, 0.06, piv); box(0.04, 0.03, 0.035, M(0xa01810), 0, 0, 0.13, piv);
    hit('cond' + k, 0.07, 0.3, 0.16, x, -0.26, 0.07, OH, 'CONDITION LEVER ' + (k + 1));
    return piv;
  });
  const fireH = OX.map((x, k) => { const o = new THREE.Group(); o.position.set(x, 0.08, 0.01); OH.add(o); box(0.07, 0.022, 0.02, redM, 0, 0, 0.04, o); box(0.012, 0.012, 0.04, metal, 0, 0, 0.015, o);
    hit('fire' + k, 0.09, 0.05, 0.06, x, 0.08, 0.03, OH, 'FIRE HANDLE ' + (k + 1)); return o; });
  const fireLamps = OX.map((x, k) => lamp(OH, 0.05, 0.022, x, 0.13, 0.004, 'FIRE', '#ff2010', '#300806', '#fff'));
  const startB = OX.map((x, k) => { const b = cyl(0.016, 0.016, 0.012, M(0x2a62c8), x, 0.3, 0.006, OH, Math.PI / 2, 0, 12); hit('start' + k, 0.05, 0.05, 0.04, x, 0.3, 0.015, OH, 'ENGINE START ' + (k + 1)); return b; });
  toggle('af', OH, 0.42, 0.28, 'AUTOFEATHER ARM');
  toggle('bat', OH, -0.47, -0.33, 'BATTERY'); toggle('gtc', OH, -0.47, -0.23, 'GTC (APU)  START / STOP'); toggle('bleed', OH, -0.47, -0.13, 'GTC BLEED AIR VALVE');
  // small round gauges on the overhead: GTC rpm, oil pressure and oil temperature per engine
  const ohG = []; let ohRR = 0;
  const ohGauge = (x, y, d, face, dyn) => { const t = canvasTex(96, 96), o = new THREE.Mesh(new THREE.CircleGeometry(d / 2, 24), new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false, color: 0xe2e2e2 })); o.position.set(x, y, 0.004); OH.add(o);
    const bg = document.createElement('canvas'); bg.width = bg.height = 96; face(bg.getContext('2d'), 96); ohG.push({ ...t, bg, dyn, W: 96 }); };
  const opMap = lin(0, -140, 100, 140), otMap = lin(0, -140, 120, 140), gtcMap = lin(0, -140, 110, 140);
  ohGauge(-0.47, 0.2, 0.09, (c, W) => dialFace(c, W, { map: gtcMap, v0: 0, v1: 110, minor: 10, major: 50, bands: [[95, 105, '#2a8a3a']], labels: [[0, '0'], [50, '50'], [100, '100']], ls: 0.22 }), (c, W, S) => { needle(c, W / 2, gtcMap(S.gtc.N * 100), W * 0.4); hub(c, W / 2); });
  OIL_X.forEach((x, k) => {
    ohGauge(x, -0.3, 0.045, (c, W) => dialFace(c, W, { map: opMap, v0: 0, v1: 100, minor: 10, major: 50, bands: [[50, 60, '#2a8a3a']], ls: 0.2 }), (c, W, S) => { const e = S.eng[k]; needle(c, W / 2, opMap(55 * Math.min(1, e.N / 0.35) * (e.N > 0.05 ? 1 : 0)), W * 0.42); hub(c, W / 2); });   // 50-60 psi (OPS)
    ohGauge(x, -0.18, 0.045, (c, W) => dialFace(c, W, { map: otMap, v0: 0, v1: 120, minor: 10, major: 40, bands: [[60, 85, '#2a8a3a']], reds: [100], ls: 0.2 }), (c, W, S) => { const e = S.eng[k]; e.oilT = (e.oilT ?? (e.run ? 75 : 20)) + ((e.run ? 70 + 10 * (e.shp / 4591) : 20) - (e.oilT ?? 20)) * 0.002; needle(c, W / 2, otMap(e.oilT), W * 0.42); hub(c, W / 2); });   // 60-85 C (OPS)
  });
  // the checklist: a card clipped by the pilot's side window, drawn from what the crew is doing (X.checklist)
  const ckT = canvasTex(320, 420); { const o = plane(0.26, 0.34, new THREE.MeshLambertMaterial({ map: ckT.tex, emissive: 0xffffff, emissiveMap: ckT.tex, emissiveIntensity: 0.45 }), -1.5, 0.72, -10.7); o.rotation.set(-0.35, 1.15, 0.1); box(0.03, 0.02, 0.02, metal, -1.5, 0.89, -10.7); }   // on the side wall by the pilot's left knee
  let ckKey = '';
  function drawChecklist(C) {
    const key = JSON.stringify(C); if (key === ckKey) return; ckKey = key;
    const c = ckT.ctx; c.fillStyle = '#e8e2c8'; c.fillRect(0, 0, 320, 420); c.fillStyle = '#c8bf98'; c.fillRect(0, 0, 320, 44);
    txt(c, 'KC-130R CHECKLIST', 160, 14, '#222', 15); txt(c, (C && C.title) || 'CRUISE', 160, 33, '#7a1010', 15);
    (C && C.items || []).forEach(([t, done, val], i) => { const y = 64 + i * 26; c.fillStyle = '#333'; c.font = 'bold 13px ' + SANS; c.textAlign = 'left'; c.fillText(t, 10, y);
      c.textAlign = 'right'; c.fillStyle = done ? '#1a6a20' : '#888'; c.fillText(done ? (val || 'CHECK') : '. . . . .', 310, y); if (done) { c.strokeStyle = '#1a6a20'; c.lineWidth = 2; c.beginPath(); c.moveTo(6, y - 4); c.lineTo(9, y); c.lineTo(15, y - 10); c.stroke(); } });
    ckT.tex.needsUpdate = true;
  }
  drawChecklist(null);

  // ---------------------------------------------------------------- pilot's side console: the paratroop panel
  const SC = new THREE.Group(); SC.position.set(-1.28, 0.42, -10.85); SC.rotation.set(-Math.PI / 2, 0, 0.35); g.add(SC);   // face up, tipped toward the pilot
  box(0.36, 0.5, 0.05, panelM, 0, 0, -0.03, SC);
  const scArt = canvasTex(380, 520); plane(0.36, 0.5, canvasMat(scArt, 0.5), 0, 0, 0.0, SC);
  {
    const c = scArt.ctx, X = x => (x + 0.18) / 0.36 * 380, Y = y => (0.25 - y) / 0.5 * 520; c.fillStyle = '#202324'; c.fillRect(0, 0, 380, 520);
    const lab = (t, x, y, s = 14, col = '#d8d6cc') => txt(c, t, X(x), Y(y), col, s);
    lab('PARATROOP', 0, 0.22, 18, '#e0c040'); lab('JUMP LIGHTS', -0.07, 0.15, 12); lab('GREEN', -0.07, 0.115, 10, '#40e050'); lab('OFF', -0.0, 0.07, 10); lab('RED', -0.07, 0.025, 10, '#ff4030');
    lab('ALARM', 0.1, 0.15, 12); lab('BELL', 0.1, 0.13, 11);
    lab('PARA DOORS', 0, -0.03, 12, '#9a9d98'); lab('LEFT', -0.08, -0.06, 11); lab('RIGHT', 0.08, -0.06, 11);
    lab('RAMP & DOOR', 0, -0.16, 12, '#9a9d98'); lab('(LOADMASTER)', 0, -0.225, 10, '#7a7d78');
    scArt.tex.needsUpdate = true;
  }
  toggle('jump', SC, -0.07, 0.07, 'JUMP LIGHTS', { three: true });
  const bell = cyl(0.016, 0.016, 0.012, M(0xd8a020), 0.1, 0.09, 0.006, SC, Math.PI / 2, 0, 12); hit('bell', 0.05, 0.05, 0.04, 0.1, 0.09, 0.015, SC, 'ALARM BELL  -  ABANDON: EVERYONE JUMPS');
  toggle('doorL', SC, -0.08, -0.1, 'LEFT PARA DOOR'); toggle('doorR', SC, 0.08, -0.1, 'RIGHT PARA DOOR'); toggle('ramp', SC, 0, -0.2, 'RAMP AND CARGO DOOR');

  // ---------------------------------------------------------------- yokes, pedals, seats
  const yokes = [-0.62, 0.62].map(x => {
    const col = new THREE.Group(); col.position.set(x, FLOOR + 0.05, -11.12); g.add(col);
    box(0.08, 0.62, 0.08, frameM, 0, 0.31, 0, col, 0.18);
    const wheel = new THREE.Group(); wheel.position.set(0, 0.64, 0.12); col.add(wheel);
    cyl(0.035, 0.035, 0.08, black, 0, 0, 0, wheel, Math.PI / 2);
    tube([V3(-0.19, 0.07, 0.03), V3(-0.17, -0.04, 0.03), V3(-0.06, -0.06, 0.03), V3(0.06, -0.06, 0.03), V3(0.17, -0.04, 0.03), V3(0.19, 0.07, 0.03)], 0.016, black, wheel);   // the W wheel
    for (const s of [-1, 1]) cyl(0.022, 0.022, 0.11, M(0x2a2622), s * 0.19, 0.11, 0.03, wheel);   // horns
    box(0.08, 0.05, 0.02, M(0x9a9da0), 0, 0.0, 0.06, wheel);   // emblem plate
    return { col, wheel };
  });
  const pedals = [-0.62, 0.62].map(x => [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(x + s * 0.13, FLOOR + 0.05, -11.55); g.add(p); box(0.08, 0.2, 0.025, metal, 0, 0.12, 0, p, -0.4); return p; }));
  for (const x of [-0.62, 0.62]) {
    box(0.55, 0.1, 0.55, seatM, x, FLOOR + 0.42, -10.35); box(0.5, 0.08, 0.48, cushion, x, FLOOR + 0.5, -10.35);
    box(0.55, 0.8, 0.1, seatM, x, FLOOR + 0.9, -10.06, g, -0.12); box(0.5, 0.65, 0.07, cushion, x, FLOOR + 0.9, -10.12, g, -0.12);
    box(0.25, 0.4, 0.25, metal, x, FLOOR + 0.2, -10.35);
    for (const s of [-1, 1]) box(0.05, 0.05, 0.4, seatM, x + s * 0.3, FLOOR + 0.68, -10.32);   // arm rests
  }
  // flight engineer's seat (centre, behind and raised) and the navigator's table on the left
  box(0.5, 0.1, 0.5, seatM, 0.0, FLOOR + 0.6, -9.85); box(0.5, 0.65, 0.08, seatM, 0, FLOOR + 1.0, -9.6);
  box(0.75, 0.04, 0.5, M(0x5a5e55), -1.35, FLOOR + 0.78, -9.9); box(0.8, 0.5, 0.05, panelM, -1.6, FLOOR + 1.1, -9.9, g, 0, Math.PI / 2);

  // ---------------------------------------------------------------- crew: copilot (right seat) and flight engineer
  // seated aircrew (1980 USMC: sage CWU-27/P flight suit, grey HGU-26/P helmet with the visor down, oxygen mask
  // hanging, brown gloves): capsule limbs between joints, hands on the given points
  const capsule = (a, b, r, m, p = g) => { const L = a.distanceTo(b); const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, L - 2 * r * 0.6), 3, 8), m); o.position.copy(a).lerp(b, 0.5); o.quaternion.setFromUnitVectors(_up, _v.subVectors(b, a).normalize()); p.add(o); return o; };
  const seated = (x, seatY, z, hands, lean = 0.12, p = g) => {
    const hip = V3(x, seatY + 0.1, z), neck = V3(x, seatY + 0.66, z + Math.sin(lean) * 0.55);
    const torso = capsule(hip, neck, 0.16, suit, p); torso.scale.set(1.12, 1, 0.72);
    box(0.3, 0.2, 0.06, M(0x4c513c), x, seatY + 0.42, z - 0.1, p);   // survival vest pockets
    const head = V3(x, seatY + 0.84, z + 0.05);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 7), skinM); h.position.copy(head); p.add(h);
    const hm = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, TAU, 0, 1.9), helmetM); hm.position.copy(head).add(V3(0, 0.035, 0.01)); hm.scale.set(1, 1, 1.12); p.add(hm);
    box(0.2, 0.06, 0.05, M(0x1c2a30), x, head.y + 0.0, head.z - 0.11, p);                                  // visor
    box(0.07, 0.07, 0.06, black, x + 0.07, head.y - 0.09, head.z - 0.08, p);                                // mask hanging off one bayonet
    for (const s of [-1, 1]) {
      const kn = V3(x + s * 0.13, seatY + 0.14, z - 0.46), ft = V3(x + s * 0.15, FLOOR + 0.1, z - 0.62);
      capsule(V3(x + s * 0.1, seatY + 0.1, z), kn, 0.075, suit, p); capsule(kn, ft, 0.06, suit, p);
      box(0.1, 0.09, 0.27, bootM, ft.x, FLOOR + 0.05, ft.z - 0.06, p);
    }
    for (const [s, hd] of hands) {
      const sh = V3(x + s * 0.2, seatY + 0.6, z + 0.05), H = V3(...hd), el = sh.clone().lerp(H, 0.5).add(V3(s * 0.08, -0.14, 0.06));
      capsule(sh, el, 0.055, suit, p); capsule(el, H, 0.045, suit, p); const gl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 5), gloveM); gl.position.copy(H); gl.scale.set(1, 0.8, 1.3); p.add(gl);
    }
  };
  seated(0.62, FLOOR + 0.54, -10.32, [[-1, [0.44, FLOOR + 0.92, -10.96]], [1, [0.8, FLOOR + 0.92, -10.96]]]);   // copilot, hands on the yoke horns
  seated(0.0, FLOOR + 0.66, -9.85, [[-1, [-0.1, FLOOR + 0.86, -10.5]], [1, [0.16, FLOOR + 0.86, -10.45]]], 0.3);   // engineer: leaning in, a hand by the power levers
  // the navigator at his table, facing outboard: on the run he computes the release point (CARP) and calls the red and
  // the green. His panel: the APN-59 search radar scope (green P7 phosphor, the sweep painting the coast and the DZ
  // island ahead) and the APN-147 Doppler readout (ground speed and drift angle), the 1980 KC-130 navigation fit.
  box(0.45, 0.08, 0.45, seatM, -0.8, FLOOR + 0.42, -9.8); box(0.42, 0.06, 0.4, cushion, -0.8, FLOOR + 0.49, -9.8);
  box(0.08, 0.6, 0.45, seatM, -0.52, FLOOR + 0.82, -9.8, g, 0, 0, -0.1); cyl(0.05, 0.05, 0.4, metal, -0.8, FLOOR + 0.2, -9.8);
  { const nav = new THREE.Group(); nav.position.set(-0.8, 0, -9.8); nav.rotation.y = Math.PI / 2; g.add(nav);
    seated(0, FLOOR + 0.48, 0, [[-1, [-0.17, FLOOR + 0.82, -0.42]], [1, [0.12, FLOOR + 0.82, -0.5]]], 0.28, nav);
    box(0.012, 0.012, 0.16, M(0x2a62c8), 0.12, FLOOR + 0.83, -0.56, nav, 0, 0.5); }   // grease pencil in his right hand
  const chart = canvasTex(256, 192);
  { const c = chart.ctx; c.fillStyle = '#e4dcc4'; c.fillRect(0, 0, 256, 192); c.strokeStyle = '#b8c8d0'; c.lineWidth = 1;
    for (let i = 16; i < 256; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 192); c.stroke(); } for (let i = 16; i < 192; i += 32) { c.beginPath(); c.moveTo(0, i); c.lineTo(256, i); c.stroke(); }
    c.fillStyle = '#c9c294'; c.strokeStyle = '#6a6040'; c.lineWidth = 1.5;
    for (const [x, y, r] of [[70, 60, 22], [150, 110, 30], [205, 45, 16], [60, 150, 14]]) { c.beginPath(); for (let a = 0; a <= 12; a++) { const q = a / 12 * TAU, rr = r * (0.8 + 0.25 * Math.sin(q * 3 + x)); c.lineTo(x + Math.cos(q) * rr, y + Math.sin(q) * rr * 0.8); } c.closePath(); c.fill(); c.stroke(); }
    c.strokeStyle = '#1a1a1a'; c.lineWidth = 2; c.beginPath(); c.moveTo(10, 180); c.lineTo(150, 110); c.lineTo(250, 70); c.stroke();
    c.strokeStyle = '#c01810'; c.lineWidth = 2.5; c.beginPath(); c.arc(150, 110, 9, 0, TAU); c.stroke(); txt(c, 'DZ', 168, 98, '#c01810', 13);
    c.beginPath(); c.moveTo(118, 126); c.lineTo(126, 118); c.stroke(); txt(c, 'CARP', 112, 136, '#c01810', 11); txt(c, 'IP', 30, 168, '#1a1a1a', 11);
    txt(c, 'JUMP RUN 130 KIAS  800 FT AGL', 128, 182, '#2a62c8', 11); chart.tex.needsUpdate = true; }
  { const o = plane(0.6, 0.42, new THREE.MeshLambertMaterial({ map: chart.tex }), -1.33, FLOOR + 0.805, -9.9); o.rotation.x = -Math.PI / 2; }
  const scope = canvasTex(128, 128), dop = canvasTex(160, 48);
  { const o = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), canvasMat(scope, 0.9)); o.position.set(-1.548, FLOOR + 1.15, -9.95); o.rotation.y = Math.PI / 2; g.add(o);
    cyl(0.115, 0.115, 0.03, ringM_(), -1.57, FLOOR + 1.15, -9.95, g, 0, Math.PI / 2, 20); cyl(0.1, 0.1, 0.032, black, -1.569, FLOOR + 1.15, -9.95, g, 0, Math.PI / 2, 20);
    const d = plane(0.2, 0.06, canvasMat(dop, 0.8), -1.565, FLOOR + 0.98, -9.65); d.rotation.y = Math.PI / 2;
    txtPlate('RADAR', -1.57, FLOOR + 1.3, -9.95); txtPlate('DOPPLER', -1.57, FLOOR + 1.05, -9.65); }
  function ringM_() { return M(0x2a2c2e); }
  function txtPlate(t, x, y, z) { const tt = canvasTex(128, 24); txt(tt.ctx, t, 64, 12, '#cfcdc0', 16); tt.tex.needsUpdate = true; const o = plane(0.13, 0.025, canvasMat(tt, 0.5), x, y, z); o.rotation.y = Math.PI / 2; o.material.transparent = true; }
  let navT = 0;
  function drawNav(S, X) {   // the radar sweep (one revolution in 4 s) and the Doppler counters, ~10 Hz
    const c = scope.ctx, t = X.time || 0, R = 64; c.fillStyle = 'rgba(2,14,6,0.35)'; c.fillRect(0, 0, 128, 128);
    const sw = (t / 4 % 1) * TAU; c.strokeStyle = '#3cff70'; c.lineWidth = 2; c.beginPath(); c.moveTo(R, R); c.lineTo(R + Math.sin(sw) * R, R - Math.cos(sw) * R); c.stroke();
    if (X.dz) { const a = X.dz.brg - S.heading, r = Math.min(0.92, X.dz.dist / 6000) * R; const da = ((sw - (-a)) % TAU + TAU) % TAU; if (da < 1.2) { c.fillStyle = `rgba(80,255,120,${1 - da / 1.2})`; c.beginPath(); c.arc(R + Math.sin(-a) * r, R - Math.cos(-a) * r, 5, 0, TAU); c.fill(); } }
    c.strokeStyle = 'rgba(80,255,120,0.25)'; c.lineWidth = 1; for (const rr of [0.33, 0.66, 1]) { c.beginPath(); c.arc(R, R, rr * R - 1, 0, TAU); c.stroke(); }
    scope.tex.needsUpdate = true;
    const gs = Math.hypot(S.vel.x, S.vel.z) * K_EQ * KT,   // real-equivalent knots, like the ASI and DME
    dr = Math.round(((S.track ? S.track() : S.heading) - S.heading + 3 * Math.PI) % TAU / D2R - 180);
    const d = dop.ctx; d.fillStyle = '#0c0d0e'; d.fillRect(0, 0, 160, 48); txt(d, `GS ${String(Math.round(gs)).padStart(3, '0')}`, 40, 24, '#ffb43a', 17);
    txt(d, `DA ${String(Math.abs(dr)).padStart(2, '0')}${dr < 0 ? 'L' : dr > 0 ? 'R' : ' '}`, 118, 24, '#ffb43a', 17); dop.tex.needsUpdate = true;
  }

  // hover marker
  const hovs = [0, 1].map(() => { const o = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffd040, depthTest: false, transparent: true })); o.renderOrder = 9; o.visible = false; o.matrixAutoUpdate = false; g.add(o); return o; });

  // ---------------------------------------------------------------- gauge faces
  const asiMap = v => v < 60 ? v / 60 * 20 : 20 + (v - 60) / 290 * 320;
  const asiFace = (c, W) => dialFace(c, W, { map: asiMap, v0: 60, v1: 350, minor: 10, major: 50, bands: [[85, 145, '#e8e8e0'], [145, 180, '#c8c8c0']], labels: [[100, '100'], [150, '150'], [200, '200'], [250, '250'], [300, '300']], ls: 0.17, title: 'KNOTS', ty: 1.3 });
  const altFace = (c, W) => { const R = W / 2; faceBg(c, W); for (let i = 0; i < 50; i++) radial(c, R, i * 7.2, '#ecebe2', R * (i % 5 ? 0.82 : 0.72), R * 0.93, i % 5 ? R * 0.025 : R * 0.045); for (let i = 0; i < 10; i++) { const [x, y] = P2(R, R * 0.56, i * 36); txt(c, String(i), x, y, '#ecebe2', R * 0.22); } txt(c, 'ALT', R, R * 0.68, '#cfcdc0', R * 0.12); txt(c, 'FEET', R, R * 1.32, '#cfcdc0', R * 0.11); };
  const vsiMap = v => -90 + clamp(v, -6, 6) / 6 * 170;
  const vsiFace = (c, W) => dialFace(c, W, { map: vsiMap, v0: -6, v1: 6, minor: 0.5, major: 1, labels: [[0, '0'], [1, '1'], [2, '2'], [4, '4'], [6, '6'], [-1, '1'], [-2, '2'], [-4, '4'], [-6, '6']], ls: 0.15, title: 'VERT SPEED|1000 FT/MIN', ty: 1.3, ts: 0.1 });
  const raltMap = ft => ft < 500 ? ft / 500 * 180 : 180 + clamp((ft - 500) / 2000, 0, 1) * 120;
  const raltFace = (c, W) => dialFace(c, W, { map: raltMap, v0: 0, v1: 500, minor: 50, major: 100, labels: [[0, '0'], [100, '1'], [200, '2'], [300, '3'], [400, '4'], [500, '5']], ls: 0.15, title: 'RADAR ALT|x100 FT', ty: 1.3, ts: 0.1 });
  const tqMap = lin(0, -150, 20, 150), titMap = lin(0, -150, 12, 150), rpmMap = lin(0, -150, 110, 150), ffMap = lin(0, -150, 30, 150);
  const tqFace = (c, W) => dialFace(c, W, { map: tqMap, v0: 0, v1: 20, minor: 1, major: 5, reds: [19.6], bands: [[0, 19.6, '#2a8a3a']], labels: [[0, '0'], [5, '5'], [10, '10'], [15, '15'], [20, '20']], ls: 0.2, title: 'x1000', ty: 1.3, ts: 0.14 });
  const titFace = (c, W) => dialFace(c, W, { map: titMap, v0: 0, v1: 12, minor: 0.5, major: 2, reds: [10.83], bands: [[2, 10.1, '#2a8a3a'], [10.1, 10.83, '#d8b020']], labels: [[0, '0'], [4, '4'], [8, '8'], [12, '12']], ls: 0.2, title: '°C x100', ty: 1.3, ts: 0.14 });
  const rpmFace = (c, W) => dialFace(c, W, { map: rpmMap, v0: 0, v1: 110, minor: 5, major: 20, reds: [106], bands: [[98, 102, '#2a8a3a']], labels: [[0, '0'], [40, '40'], [80, '80'], [100, '100']], ls: 0.18, title: '% RPM', ty: 1.3, ts: 0.14 });
  const ffFace = (c, W) => dialFace(c, W, { map: ffMap, v0: 0, v1: 30, minor: 1, major: 5, labels: [[0, '0'], [10, '10'], [20, '20'], [30, '30']], ls: 0.2, title: 'PPH x100', ty: 1.3, ts: 0.14 });
  const flapMap = lin(0, -120, 100, 120);
  const flapFace = (c, W) => dialFace(c, W, { map: flapMap, v0: 0, v1: 100, minor: 10, major: 50, labels: [[0, 'UP'], [50, '50'], [100, 'DN']], ls: 0.2, title: 'FLAPS %', ty: 1.3, ts: 0.14 });
  const fuelMap = lin(0, -140, 50, 140);
  const fuelFace = (c, W) => dialFace(c, W, { map: fuelMap, v0: 0, v1: 50, minor: 2.5, major: 10, reds: [4], labels: [[0, '0'], [10, '10'], [20, '20'], [30, '30'], [40, '40'], [50, '50']], ls: 0.16, title: 'FUEL|LB x1000', ty: 1.3, ts: 0.11 });
  const hydFace = (c, W) => dialFace(c, W, { map: lin(0, -140, 4, 140), v0: 0, v1: 4, minor: 0.25, major: 1, bands: [[2.9, 3.2, '#2a8a3a']], labels: [[0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4']], ls: 0.18, title: 'HYD PSI|x1000', ty: 1.3, ts: 0.11 });
  const accFace = (c, W) => dialFace(c, W, { map: lin(-2, -150, 4, 150), v0: -2, v1: 4, minor: 0.5, major: 1, reds: [3], labels: [[-2, '-2'], [0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4']], ls: 0.17, title: 'G', ty: 1.3, ts: 0.13 });

  function adiDraw(c, W, S) {
    const R = W / 2, att = S.attitude(), pitch = att.pitch, roll = att.roll;
    c.clearRect(0, 0, W, W); c.save(); c.beginPath(); c.arc(R, R, R * 0.97, 0, TAU); c.clip();
    c.translate(R, R); c.rotate(-roll); const k = R * 2.2, py = pitch * k;
    c.fillStyle = '#3b6fae'; c.fillRect(-W, -W * 2 + py, W * 2, W * 2); c.fillStyle = '#6a4a2a'; c.fillRect(-W, py, W * 2, W * 2);
    c.strokeStyle = '#f2f2ea'; c.lineWidth = R * 0.03; c.beginPath(); c.moveTo(-W, py); c.lineTo(W, py); c.stroke();
    for (const d of [-20, -10, -5, 5, 10, 20]) { const y = py - d * D2R * k, w = (Math.abs(d) % 10 ? 0.15 : 0.3) * R; c.lineWidth = R * 0.02; c.beginPath(); c.moveTo(-w, y); c.lineTo(w, y); c.stroke(); if (!(Math.abs(d) % 10)) { txt(c, String(Math.abs(d)), -w - R * 0.12, y, '#f2f2ea', R * 0.12); } }
    c.restore();
    c.strokeStyle = '#f2f2ea'; c.lineWidth = R * 0.03; for (const a of [-60, -30, -20, -10, 0, 10, 20, 30, 60]) radial(c, R, a, '#f2f2ea', R * 0.84, R * 0.95, R * (a ? 0.025 : 0.05));
    needle(c, R, -roll / D2R, R * 0.92, '#ffffff', R * 0.08, -0.82);
    c.strokeStyle = '#ffb000'; c.lineWidth = R * 0.06; c.beginPath(); c.moveTo(R * 0.35, R); c.lineTo(R * 0.78, R); c.lineTo(R * 0.86, R * 1.1); c.moveTo(R * 1.65, R); c.lineTo(R * 1.22, R); c.lineTo(R * 1.14, R * 1.1); c.stroke();
    c.fillStyle = '#ffb000'; c.beginPath(); c.arc(R, R, R * 0.04, 0, TAU); c.fill();
    c.strokeStyle = '#333'; c.lineWidth = R * 0.05; c.beginPath(); c.arc(R, R, R * 0.97, 0, TAU); c.stroke();
  }
  function hsiDraw(c, W, S, X) {
    const R = W / 2, hdg = ((-S.heading / D2R) % 360 + 360) % 360; faceBg(c, W);
    c.save(); c.translate(R, R); c.rotate(-hdg * D2R);
    for (let d = 0; d < 360; d += 5) { const a = d * D2R, r0 = R * (d % 30 ? 0.8 : 0.72); c.strokeStyle = '#ecebe2'; c.lineWidth = d % 10 ? 1 : 2; c.beginPath(); c.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0); c.lineTo(Math.sin(a) * R * 0.9, -Math.cos(a) * R * 0.9); c.stroke(); }
    for (let d = 0; d < 360; d += 30) { const a = d * D2R, t = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10); c.save(); c.rotate(a); txt(c, t, 0, -R * 0.6, '#ecebe2', R * 0.14); c.restore(); }
    // course arrow (TACAN to the pathfinders' beacon at the drop zone): bearing to the DZ
    if (X.dz) { const b = ((-X.dz.brg / D2R) % 360 + 360) % 360; c.save(); c.rotate(b * D2R); c.fillStyle = '#ffcc33'; c.fillRect(-R * 0.025, -R * 0.55, R * 0.05, R * 1.1); c.beginPath(); c.moveTo(0, -R * 0.68); c.lineTo(-R * 0.08, -R * 0.52); c.lineTo(R * 0.08, -R * 0.52); c.fill(); c.restore(); }
    c.restore();
    c.fillStyle = '#ffb000'; c.beginPath(); c.moveTo(R, R * 0.04); c.lineTo(R - R * 0.06, R * 0.16); c.lineTo(R + R * 0.06, R * 0.16); c.fill();   // lubber
    c.strokeStyle = '#ffb000'; c.lineWidth = R * 0.04; c.beginPath(); c.moveTo(R, R * 0.8); c.lineTo(R, R * 1.25); c.moveTo(R * 0.8, R * 1.05); c.lineTo(R * 1.2, R * 1.05); c.stroke();   // aircraft symbol
    c.fillStyle = '#000'; c.fillRect(R * 0.08, R * 0.08, R * 0.5, R * 0.22); txt(c, X.dz ? (X.dz.dist / 1852 * 2).toFixed(1) : '---', R * 0.33, R * 0.19, '#ff9a30', R * 0.15);   // DME, real-equivalent nm (world distance x2)
    txt(c, 'DME', R * 0.33, R * 0.36, '#9a9d98', R * 0.09);
  }
  function altDraw(c, W, S, G) { const R = W / 2; c.drawImage(G.bg, 0, 0); const ft = S.pos.y * FT; needle(c, R, (ft % 1000) / 1000 * 360, R * 0.85, '#f2f2ea', R * 0.08); needle(c, R, (ft % 10000) / 10000 * 360, R * 0.55, '#f2f2ea', R * 0.13); c.fillStyle = '#000'; c.fillRect(R * 1.1, R * 0.88, R * 0.6, R * 0.24); txt(c, String(Math.round(ft / 10) * 10).padStart(5, ' '), R * 1.4, R, '#ecebe2', R * 0.17); hub(c, R); }
  function asiDraw(c, W, S, G) { const R = W / 2; c.drawImage(G.bg, 0, 0); const v = S.kias; radial(c, R, asiMap(250), '#e8281a', R * 0.7, R * 0.96, R * 0.05); needle(c, R, asiMap(Math.max(0, v)), R * 0.85); hub(c, R); }
  function vsiDraw(c, W, S, G) { const R = W / 2; c.drawImage(G.bg, 0, 0); needle(c, R, vsiMap(S.vel.y * 196.85 / 1000), R * 0.85); hub(c, R); }
  function raltDraw(c, W, S, G, X) { const R = W / 2; c.drawImage(G.bg, 0, 0); const ft = (X.agl ?? 9999) * FT; needle(c, R, raltMap(Math.min(2500, Math.max(0, ft))), R * 0.85); if (ft > 2500) { c.fillStyle = '#d82a18'; c.fillRect(R * 0.7, R * 1.35, R * 0.6, R * 0.2); txt(c, 'OFF', R, R * 1.45, '#fff', R * 0.14); } hub(c, R); }
  function tsDraw(c, W, S) { const R = W / 2; faceBg(c, W); c.strokeStyle = '#ecebe2'; c.lineWidth = R * 0.04; c.beginPath(); c.moveTo(R * 0.5, R * 0.62); c.lineTo(R * 1.5, R * 0.62); c.stroke(); const rate = -S.w.z; c.save(); c.translate(R, R * 0.62); c.rotate(clamp(rate / 0.1, -1.2, 1.2) * 0.4); c.fillStyle = '#f2f2ea'; c.fillRect(-R * 0.04, -R * 0.5, R * 0.08, R * 0.5); c.restore();
    c.fillStyle = '#d8d0a0'; c.beginPath(); c.ellipse(R, R * 1.32, R * 0.5, R * 0.14, 0, 0, TAU); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(R + clamp(-S.ny * 2.5, -0.38, 0.38) * R, R * 1.32, R * 0.11, 0, TAU); c.fill(); txt(c, 'TURN', R, R * 0.35, '#cfcdc0', R * 0.13); }
  function clkDraw(c, W, S, G, X) { const R = W / 2; faceBg(c, W); for (let i = 0; i < 12; i++) radial(c, R, i * 30, '#ecebe2', R * 0.75, R * 0.92, R * 0.05); const t = (X.time || 0) + 13 * 3600 + 22 * 60; needle(c, R, (t / 3600 % 12) * 30, R * 0.5, '#f2f2ea', R * 0.1); needle(c, R, (t / 60 % 60) * 6, R * 0.8, '#f2f2ea', R * 0.07); needle(c, R, (t % 60) * 6, R * 0.85, '#ffb000', R * 0.03); hub(c, R); }
  const engDraw = (map, get) => (c, W, S, G) => { const R = W / 2; c.drawImage(G.bg, 0, 0); needle(c, R, map(get(S.eng[G.k])), R * 0.82); hub(c, R); };
  function flapDraw(c, W, S, G) { const R = W / 2; c.drawImage(G.bg, 0, 0); needle(c, R, flapMap(S.flap * 100), R * 0.82); hub(c, R); }
  function fuelDraw(c, W, S, G) { const R = W / 2; c.drawImage(G.bg, 0, 0); needle(c, R, fuelMap(S.fuel * 2.20462 / 1000), R * 0.82); hub(c, R); }
  function hydDraw(c, W, S, G) { const R = W / 2; c.drawImage(G.bg, 0, 0); const live = S.eng.some(e => e.N > 0.5); needle(c, R, lin(0, -140, 4, 140)(live ? 3.05 : 0.2), R * 0.82); hub(c, R); }
  function accDraw(c, W, S, G) { const R = W / 2; c.drawImage(G.bg, 0, 0); needle(c, R, lin(-2, -150, 4, 150)(S.nz), R * 0.82); needle(c, R, lin(-2, -150, 4, 150)(S.nzMax ?? 1), R * 0.6, '#ffb000', R * 0.04); hub(c, R); }
  gauge('asi', 192, asiFace, asiDraw); gauge('adi', 256, null, adiDraw); gauge('alt', 192, altFace, altDraw);
  gauge('ralt', 160, raltFace, raltDraw); gauge('hsi', 256, null, hsiDraw); gauge('vsi', 160, vsiFace, vsiDraw);
  gauge('ts', 128, null, tsDraw); gauge('clk', 128, null, clkDraw); gauge('acc', 128, accFace, accDraw);
  gauge('asi2', 192, asiFace, asiDraw); gauge('adi2', 256, null, adiDraw); gauge('alt2', 192, altFace, altDraw);
  gauge('vsi2', 160, vsiFace, vsiDraw); gauge('hsi2', 256, null, hsiDraw); gauge('ralt2', 160, raltFace, raltDraw); gauge('clk2', 128, null, clkDraw);
  gauge('flap', 144, flapFace, flapDraw); gauge('fuel', 144, fuelFace, fuelDraw); gauge('hyd', 144, hydFace, hydDraw);
  for (let k = 0; k < 4; k++) {
    gauge('tq' + k, 144, tqFace, engDraw(tqMap, e => Math.max(0, e.torque) / 1000)).k = k;
    gauge('tit' + k, 144, titFace, engDraw(titMap, e => e.tit / 100)).k = k;
    gauge('rpm' + k, 144, rpmFace, engDraw(rpmMap, e => e.N * 100)).k = k;
    gauge('ff' + k, 144, ffFace, engDraw(ffMap, e => e.ff / 100)).k = k;
  }
  for (const G of gauges) { const c = G.ctx; if (G.bg) c.drawImage(G.bg, 0, 0); G.tex.needsUpdate = true; }

  // ---------------------------------------------------------------- per-frame
  let rr = 0;
  const condName = { run: 'RUN', stop: 'GND STOP', airstart: 'AIR START', feather: 'FEATHER' };
  return {
    group: g, hitBoxes: hits, canvases: () => gauges.map(G => G.cv),
    labelOf(id, S, X = {}) {
      const k = +id.slice(-1);
      if (id.startsWith('cond')) { const e = S.eng[k]; return `CONDITION LEVER ${k + 1}  -  ${condName[e.cond]}  -  CLICK: ${e.cond === 'run' ? 'FEATHER' : e.cond === 'feather' ? 'AIR START' : 'RUN'}  ·  RIGHT CLICK: GND STOP`; }
      if (id.startsWith('fire')) return `ENGINE ${k + 1} FIRE HANDLE  -  PULL: FUEL OFF, FEATHER, AGENT`;
      if (id.startsWith('start')) return `ENGINE ${k + 1} START  (CONDITION LEVER AT RUN)`;
      return {
        bat: `BATTERY  -  ${S.battery ? 'ON' : 'OFF'}`, gtc: `GTC  -  ${S.gtc.cmd ? (S.gtc.N > 0.95 ? 'ON SPEED' : 'STARTING ' + Math.round(S.gtc.N * 100) + ' %') : 'OFF'}`, bleed: `GTC BLEED AIR  -  ${S.bleedValve ? 'OPEN' : 'CLOSED'}`,
        gear: `LANDING GEAR  -  ${S.gearCmd ? 'DOWN' : 'UP'}  (G)`, flap: `FLAP LEVER  -  ${Math.round(S.flapSel * 100)} %  (CLICK STEPS 0 / 50 / 100)`, mc: 'MASTER CAUTION  -  RESET',
        ap: `AUTOPILOT  -  ${X.ap ? 'ENGAGED' : 'OFF'}  (H)`, apAlt: 'ALTITUDE HOLD (WITH THE AUTOPILOT)', af: `AUTOFEATHER  -  ${S.autoFeatherArm ? 'ARMED' : 'OFF'}`,
        jump: `JUMP LIGHTS  -  ${(X.jumpLight || 'off').toUpperCase()}  (CLICK: OFF / RED / GREEN · F = GREEN)`, bell: 'ALARM BELL  -  BAIL OUT: THE STICK GOES NOW',
        doorL: `LEFT PARA DOOR  -  ${S.doorCmd[0] ? 'OPEN' : 'CLOSED'}  (LIMIT 185 KIAS)`, doorR: `RIGHT PARA DOOR  -  ${S.doorCmd[1] ? 'OPEN' : 'CLOSED'}  (LIMIT 185 KIAS)`,
        ramp: `RAMP & CARGO DOOR  -  ${S.rampCmd ? 'OPEN' : 'CLOSED'}  (LIMIT 150 KIAS)`,
      }[id] || id;
    },
    update(S, X, dt, hover) {
      if (!g.visible) return;
      // levers, yokes, pedals
      for (let k = 0; k < 4; k++) {
        throttles[k].rotation.x = 0.55 - (S.eng[k].lever / 90) * 1.3;   // forward = more power
        condLevers[k].rotation.x = 0.33 - COND_POS[S.eng[k].cond] * 0.22;   // RUN forward ... FEATHER aft
        fireH[k].position.z = 0.01 + (S.eng[k].firePulled ? 0.05 : 0);
        setLamp(fireLamps[k], S.eng[k].fire && S.eng[k].fire !== 'out');
      }
      flapPiv.rotation.x = -0.45 + S.flapSel * 0.9;
      gearPiv.rotation.x = S.gearCmd ? -0.3 : 0.3;
      trimWheel.rotation.x = -S.trim * 6;
      const c = X.ctl || { pitch: 0, roll: 0, yaw: 0 };
      for (const y of yokes) { y.col.rotation.x = clamp(c.pitch || 0, -1, 1) * 0.18; y.wheel.rotation.z = -clamp(c.roll || 0, -1, 1) * 1.1; }
      for (const pr of pedals) { pr[0].position.z = -11.55 + clamp(c.yaw || 0, -1, 1) * 0.06; pr[1].position.z = -11.55 - clamp(c.yaw || 0, -1, 1) * 0.06; }
      setToggle('bat', S.battery ? 1 : -1); setToggle('gtc', S.gtc.cmd ? 1 : -1); setToggle('bleed', S.bleedValve ? 1 : -1);
      for (let i = 0; i < 3; i++) { const G = ohG[(ohRR++) % ohG.length]; G.ctx.drawImage(G.bg, 0, 0); G.dyn(G.ctx, G.W, S); G.tex.needsUpdate = true; }   // three a frame
      drawChecklist(X.checklist);
      navT += dt; if (navT > 0.1) { navT = 0; drawNav(S, X); }
      setToggle('ap', X.ap ? 1 : -1); setToggle('apAlt', X.ap ? 1 : -1); setToggle('af', S.autoFeatherArm ? 1 : -1);
      setToggle('jump', X.jumpSwitch === 'green' ? 1 : X.jumpSwitch === 'red' ? -1 : 0);
      setToggle('doorL', S.doorCmd[0] ? 1 : -1); setToggle('doorR', S.doorCmd[1] ? 1 : -1); setToggle('ramp', S.rampCmd ? 1 : -1);
      // lamps
      const C = X.cautions || {}, blink = ((X.time || 0) % 0.5) < 0.3;
      for (const [k, l] of cautL) setLamp(l, C[k]);
      const anyC = Object.values(C).some(Boolean) && !X.mcReset;
      setLamp(mcL, anyC && blink); setLamp(mcR, anyC && blink);
      setLamp(jrL, X.jumpLight === 'red'); setLamp(jgL, X.jumpLight === 'green' && blink); setLamp(apL, X.ap);
      const down = S.gear > 0.99, up = S.gear < 0.01;
      for (const gl of greens) setLamp(gl, down); setLamp(gearRed, !down && !up);
      // tab indicator
      { const t = tabInd.ctx; t.fillStyle = '#0c0d0e'; t.fillRect(0, 0, 128, 128); t.strokeStyle = '#ecebe2'; t.lineWidth = 3; t.beginPath(); t.moveTo(20, 64); t.lineTo(108, 64); t.stroke(); txt(t, 'NOSE DN', 64, 18, '#cfcdc0', 14); txt(t, 'NOSE UP', 64, 112, '#cfcdc0', 14); t.fillStyle = '#ffb000'; t.fillRect(56, 64 + S.trim * 40 - 6, 16, 12); tabInd.tex.needsUpdate = true; }
      // a quarter of the gauges per frame
      const n = Math.ceil(gauges.length / 4);
      for (let i = 0; i < n; i++) { const G = gauges[(rr + i) % gauges.length]; G.dyn(G.ctx, G.W, S, G, X); G.tex.needsUpdate = true; }
      rr = (rr + n) % gauges.length;
      // hover frame
      const hb = hover ? hitsOf[hover] || [] : [];
      for (let i = 0; i < hovs.length; i++) {
        const o = hovs[i], h = hb[i]; o.visible = !!h; if (!h) continue;
        h.updateWorldMatrix(true, false); o.matrix.copy(h.matrixWorld); const [w, hh, d] = h.userData.size; o.matrix.scale(_v.set(w, hh, d));
        g.updateWorldMatrix(true, false); o.matrix.premultiply(_mInv.copy(g.matrixWorld).invert());
      }
    },
  };
}
