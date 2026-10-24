// UH-1H "Huey" cockpit: a full 3D interior in helicopter-local space (x right, y up, nose -z, origin = CG), so it rides
// with the airframe and free look finds a whole cockpit. Pilot on the RIGHT (x +0.55), copilot left.
// - Instrument panel (UH-1H layout): pilot's ASI / attitude / altimeter, RMI / turn & slip / VSI, course indicator /
//   radar altimeter / clock; centre engine column: EGT, gas producer (N1), torque, dual tachometer (rotor + engine:
//   split needles = freewheel open), XMSN / engine oil, fuel pressure, DC / loadmeters / AC, fuel quantity; copilot's
//   duplicate flight instruments; MASTER CAUTION, RPM and FIRE lights on the panel top. Every face is a canvas drawn
//   live, round-robin (~15 Hz each); AC instruments drop / flag OFF without the inverter, failing avionics flicker.
// - Pedestal: caution panel (the 20 heli.js CAPTIONS) with TEST/RESET and LOW RPM AUDIO, ENGINE panel (GOV, DE-ICE,
//   MAIN FUEL), MISC panel (FORCE TRIM, HYD CONTROL, STAB ASSIST), radios (ARC-51BX, ARC-131 with LOGISTICS call,
//   ARC-134, ARN-82, ARN-83, APX-72). Overhead console: DC / AC power (BATTERY, MAIN GEN, INVERTER) and breakers.
//   Collective switch box: STARTER trigger, LANDING LIGHT.
// - Cyclic, collective with the throttle twist grip, pedals (both seats, linked) move with the applied controls; the
//   pilot's gloved hands ride the cyclic and the collective, legs go to the pedals.
import * as THREE from 'three';
import { CAPTIONS } from './heli.js';
import { buildSeatedCrewman } from './hueymodel.js';   // QA: the copilot
import { drawRwr } from './units/defence/cm.js';   // ngc/cmpolish: the radar warning scope   // circular, but only read inside buildHueyCockpit (after both modules ran)

export const HUEY_EYE = new THREE.Vector3(0.55, 0.16, -1.95), HUEY_EYE_PITCH = -0.16;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2, D2R = Math.PI / 180;
const SANS = 'Arial, "Liberation Sans", Helvetica, sans-serif';
const FL = -1.05, RF = 0.45, WX = 1.13;   // floor, roof, inner wall
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _m4 = new THREE.Matrix4(), _m5 = new THREE.Matrix4();

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
function offFlag(c, W, t = 'OFF', x = 0.3, y = 0.62, rot = -0.35) {   // red/white striped failure flag
  const R = W / 2; c.save(); c.translate(W * x, W * y); c.rotate(rot); const w = R * 0.62, h = R * 0.24;
  c.fillStyle = '#d82a18'; c.fillRect(-w / 2, -h / 2, w, h); c.strokeStyle = '#f4f0e0'; c.lineWidth = R * 0.03;
  for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * w / 6 - h / 2, h / 2); c.lineTo(i * w / 6 + h / 2, -h / 2); c.stroke(); }
  c.fillStyle = '#111'; c.fillRect(-w * 0.32, -h * 0.36, w * 0.64, h * 0.72); txt(c, t, 0, 1, '#f4f0e0', h * 0.62); c.restore();
}
const lin = (v0, a0, v1, a1) => v => a0 + clamp((v - v0) / (v1 - v0), -0.02, 1.04) * (a1 - a0);   // needles stop just past the ends
// a standard round gauge face: ticks, labels, coloured arcs, red radials, title
function dialFace(c, W, o) {
  const R = W / 2, m = o.map; faceBg(c, W);
  for (const [va, vb, col] of o.bands || []) band(c, R, m(va), m(vb), col, R * 0.86, R * 0.09);
  c.strokeStyle = '#ecebe2';
  for (let v = o.v0; v <= o.v1 + 1e-6; v += o.minor) {
    const maj = Math.abs(v / o.major - Math.round(v / o.major)) < 1e-4; radial(c, R, m(v), '#ecebe2', R * (maj ? 0.74 : 0.8), R * 0.92, maj ? R * 0.045 : R * 0.025);
  }
  for (const v of o.reds || []) radial(c, R, m(v), '#e8281a', R * 0.7, R * 0.96, R * 0.06);
  for (const [v, t] of o.labels || []) { const [x, y] = P2(R, R * (o.lr || 0.56), m(v)); txt(c, t, x, y, '#ecebe2', R * (o.ls || 0.2)); }
  if (o.title) o.title.split('|').forEach((t, i, a) => txt(c, t, R, R * (o.ty || 1.36) + (i - (a.length - 1) / 2) * R * 0.15, '#cfcdc0', R * (o.ts || 0.12)));
  if (o.unit) txt(c, o.unit, R, R * (o.uy || 0.62), '#cfcdc0', R * 0.11);
}

export function buildHueyCockpit() {
  const g = new THREE.Group(); g.visible = false; g.name = 'hueyCockpit';
  // interior fill: the cabin is lit through the greenhouse, so every surface gets some self-light (like the jet's M())
  const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.5), ...o });
  const black = M(0x161718), panelM = M(0x1d1f20), glareM = M(0x101112), olive = M(0x4a5236), oliveD = M(0x353b28), lining = M(0x5c604c);
  const floorM = M(0x34372e), seatM = M(0x3a3e34), cushion = M(0x2c3127), armour = M(0x56603f), metal = M(0x7b8186), frameM = M(0x2c3029);
  const suit = M(0x5b6340), vest = M(0x4a5233), glove = M(0x5a4a3a), bootM = M(0x141414), redM = M(0xb81a10), whiteM = M(0xd8d8d0);
  const box = (w, h, d, m, x, y, z, p = g, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); p.add(o); return o; };
  const cyl = (r0, r1, h, m, x, y, z, p = g, rx = 0, rz = 0, seg = 8) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); p.add(o); return o; };
  const plane = (w, h, mat, x, y, z, p = g) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); o.position.set(x, y, z); p.add(o); return o; };
  const lit = c => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  const canvasMat = (t, k = 0.6) => new THREE.MeshLambertMaterial({ map: t.tex, emissive: 0xffffff, emissiveMap: t.tex, emissiveIntensity: k });
  // a flat polygon in the y-z plane at x (pts / holes as [z, y]); used for doors, walls and the pedestal sides
  const wallGeo = (pts, holes = []) => {
    const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-z, y)));
    for (const h of holes) sh.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(-z, y))));
    const geo = new THREE.ShapeGeometry(sh); geo.rotateY(Math.PI / 2); return geo;   // shape x = -z -> local z
  };
  const wall = (x, pts, m, holes) => { const o = new THREE.Mesh(wallGeo(pts, holes), m); o.material.side = THREE.DoubleSide; o.position.x = x; g.add(o); return o; };
  // a quad from four corners (p00 p10 p11 p01), optionally bulged along n by sin(pi u) sin(pi v) (curved glass)
  const quadGeo = (p00, p10, p11, p01, bulge = 0, n = null, nu = 1, nv = 1, bu = 0) => {
    const pos = [], idx = [], P = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3();
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv; A.copy(p00).lerp(p10, u); B.copy(p01).lerp(p11, u); P.copy(A).lerp(B, v);
      if (n) P.addScaledVector(n, bulge * Math.sin(Math.PI * v) * (bu ? Math.sin(Math.PI * u) : 1) + (bu ? 0 : bulge * 0.6 * Math.sin(Math.PI * u) * (1 - v)));
      pos.push(P.x, P.y, P.z);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + nu + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
  };
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const tube = (pts, r, m = frameM, p = g) => { const o = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(4, pts.length * 4), r, 6), m); p.add(o); return o; };
  // a limb between two points (static) or re-aimed per frame (setLimb)
  const limbGeo = new THREE.CylinderGeometry(1, 0.9, 1, 8);
  const limb = (a, b, r, m) => { const o = new THREE.Mesh(limbGeo, m); o.userData.r = r; g.add(o); setLimb(o, a, b); return o; };
  function setLimb(o, a, b) { _v.subVectors(b, a); const L = _v.length(); o.position.copy(a).addScaledVector(_v, 0.5); o.quaternion.setFromUnitVectors(_up, _v.multiplyScalar(1 / L)); o.scale.set(o.userData.r, L, o.userData.r); }

  // ---------------------------------------------------------------- glass
  const glass = new THREE.MeshBasicMaterial({ color: 0xb8dcff, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide });
  const green = new THREE.MeshBasicMaterial({ color: 0x3fae5a, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide });
  const pane = (geo, m = glass) => { const o = new THREE.Mesh(geo, m); o.renderOrder = 5; g.add(o); return o; };

  // ---------------------------------------------------------------- windscreen, greenhouse, doors, nose
  // windscreen halves: glare shield (y -0.135, z -2.93 at the centre post, sweeping back to z -2.76 at the sides) up to
  // the roof (y 0.45, z -2.10 .. -1.98); bulged outward so they read as the Huey's big curved panes
  const wsB = x => -2.93 + (Math.abs(x) - 0.03) / 1.07 * 0.17;   // windscreen bottom edge z at x
  const wsN = V3(0, 0.45, -0.89).normalize();
  for (const s of [-1, 1]) {
    const b0 = V3(s * 0.03, -0.135, -2.93), b1 = V3(s * 1.1, -0.1, -2.76), t0 = V3(s * 0.03, RF, -2.1), t1 = V3(s * 1.12, 0.43, -1.98);
    pane(s > 0 ? quadGeo(b0, b1, t1, t0, 0.05, wsN, 8, 6) : quadGeo(b1, b0, t0, t1, 0.05, wsN, 8, 6));
    tube([V3(s * 1.1, -0.1, -2.76), V3(s * 1.11, 0.188, -2.415), V3(s * 1.12, 0.43, -1.98)], 0.03);   // A-pillar
    tube([V3(s * 0.03, RF - 0.01, -2.1), V3(s * 0.6, RF + 0.005, -2.06), V3(s * 1.12, 0.43, -1.98)], 0.025);   // roof bow
  }
  tube([V3(0, -0.13, -2.94), V3(0, 0.18, -2.56), V3(0, RF - 0.01, -2.1)], 0.026);   // centre post (follows the bulge)
  // greenhouse: green-tinted roof windows over each pilot, solid strip in the middle for the overhead console
  for (const s of [-1, 1]) {
    pane(quadGeo(V3(s * 0.23, RF, -2.1), V3(s * 1.1, 0.43, -1.98), V3(s * 1.1, 0.43, -1.42), V3(s * 0.23, RF, -1.42)), green);
    box(0.04, 0.03, 0.7, frameM, s * 0.66, RF - 0.01, -1.76); box(0.9, 0.04, 0.04, frameM, s * 0.66, RF - 0.01, -1.42);
  }
  box(0.46, 0.02, 0.7, lining, 0, RF, -1.76);                                    // roof strip over the console
  box(2.28, 0.02, 0.47, lining, 0, RF, -1.185);                                  // cabin roof lining, aft of the greenhouse
  // crew doors: big upper window following the A-pillar, small lower window ("kick window")
  const doorPts = [[-2.76, FL], [-1.15, FL], [-1.15, 0.43], [-1.98, 0.43], [-2.76, -0.1]];
  const upWin = [[-2.64, -0.3], [-1.25, -0.3], [-1.25, 0.37], [-2.0, 0.37], [-2.64, -0.06]], loWin = [[-2.6, -0.92], [-2.1, -0.92], [-2.1, -0.5], [-2.6, -0.5]];
  for (const s of [-1, 1]) {
    wall(s * WX, doorPts, olive, [upWin, loWin]);
    for (const w of [upWin, loWin]) { const o = pane(wallGeo(w)); o.position.x = s * (WX + 0.004); }
    box(0.03, 0.03, 1.39, frameM, s * (WX - 0.02), -0.3, -1.945); box(0.03, 0.03, 1.2, frameM, s * (WX - 0.02), -0.42, -1.85);   // sill, armrest rail
    box(0.03, 0.05, 0.12, metal, s * (WX - 0.03), -0.3, -1.35);                 // door handle
    box(0.06, 1.5, 0.15, frameM, s * (WX - 0.01), -0.3, -1.075);                // door post behind the crew door
    // nose side under the A-pillar, forward of the door
    wall(s * (WX - 0.03), [[-3.6, FL + 0.05], [-2.76, FL], [-2.76, -0.1], [-3.0, -0.12], [-3.6, -0.3]], oliveD);
  }
  // nose under the glare shield: front bulkhead, keel strip and chin bubbles (the ground below the pedals)
  box(2.2, 0.6, 0.03, oliveD, 0, -0.55, -3.55);
  const chinN = V3(0, -0.95, -0.3).normalize();
  for (const s of [-1, 1]) {
    const a = V3(s * 0.2, FL, -2.66), b = V3(s * 0.98, FL, -2.66), c2 = V3(s * 0.95, -0.82, -3.5), d = V3(s * 0.22, -0.82, -3.5);
    pane(s > 0 ? quadGeo(a, b, c2, d, 0.06, chinN, 6, 4, 1) : quadGeo(b, a, d, c2, 0.06, chinN, 6, 4, 1), glass);
    tube([V3(s * 0.98, FL, -2.66), V3(s * 1.0, -0.88, -3.2), V3(s * 0.95, -0.8, -3.52)], 0.022);
    box(0.12, 0.03, 0.88, oliveD, s * 1.04, -0.95, -3.08, g, -0.25);
  }
  box(0.4, 0.04, 0.9, oliveD, 0, -0.95, -3.1, g, -0.27);                        // keel between the chin bubbles
  tube([V3(-0.98, FL + 0.005, -2.66), V3(0.98, FL + 0.005, -2.66)], 0.02);
  tube([V3(-0.95, -0.81, -3.51), V3(0.95, -0.81, -3.51)], 0.02);
  box(2.28, 0.03, 1.71, floorM, 0, FL - 0.015, -1.805);                        // cockpit floor (the cargo cabin is hueymodel.js)
  // fire extinguisher bottle on the floor at the aft end of the pedestal
  cyl(0.055, 0.055, 0.34, redM, 0, FL + 0.17, -1.28); cyl(0.02, 0.02, 0.06, metal, 0, FL + 0.37, -1.28);

  // ---------------------------------------------------------------- glare shield
  {
    const pos = [], idx = [], N = 12;
    for (let i = 0; i <= N; i++) { const x = -1.02 + 2.04 * i / N; pos.push(x, -0.125, Math.min(wsB(x) + 0.01, -2.74), x, -0.125, -2.712); if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const gs = new THREE.Mesh(geo, glareM); glareM.side = THREE.DoubleSide; g.add(gs);
    box(2.04, 0.018, 0.02, glareM, 0, -0.128, -2.715);                          // padded lip, flush with the panel top
  }
  // standby magnetic compass on the centre post
  box(0.075, 0.06, 0.06, black, 0, -0.085, -2.82); cyl(0.006, 0.006, 0.05, metal, 0, -0.035, -2.84);
  const compass = canvasTex(160, 64); { const o = plane(0.05, 0.02, lit(0xffffff), 0, -0.085, -2.789); o.material.map = compass.tex; }

  // ---------------------------------------------------------------- instrument panel
  // panel group: x right, y up the face, z toward the crew; tilted back
  const P = new THREE.Group(); P.position.set(0, -0.397, -2.653); P.rotation.x = -0.25; g.add(P);
  box(2.22, 0.48, 0.04, panelM, 0, 0.03, -0.025, P); box(0.56, 0.2, 0.04, panelM, 0.035, -0.31, -0.025, P);
  // gauge layout (panel coords, diameter)
  const GL = {
    asi: [0.40, 0.14, 0.115], adi: [0.555, 0.14, 0.13], alt: [0.71, 0.14, 0.115], rmi: [0.40, 0.005, 0.105], ts: [0.555, 0.005, 0.095], vsi: [0.71, 0.005, 0.105],
    cdi: [0.40, -0.125, 0.095], ralt: [0.555, -0.125, 0.09], clk: [0.71, -0.125, 0.075],
    egt: [-0.155, 0.15, 0.1], n1: [-0.03, 0.15, 0.1], tq: [0.1, 0.15, 0.11], tach: [0.235, 0.145, 0.12],
    xop: [-0.16, 0.025, 0.08], xot: [-0.07, 0.025, 0.08], eop: [0.02, 0.025, 0.08], eot: [0.11, 0.025, 0.08], fp: [0.2, 0.025, 0.08],
    dcv: [-0.16, -0.085, 0.08], load: [-0.07, -0.085, 0.08], sload: [0.02, -0.085, 0.08], acv: [0.11, -0.085, 0.08], fuel: [0.235, -0.09, 0.1],
    asi2: [-0.71, 0.14, 0.115], adi2: [-0.555, 0.14, 0.13], alt2: [-0.40, 0.14, 0.115], rmi2: [-0.71, 0.005, 0.105], ts2: [-0.555, 0.005, 0.095], vsi2: [-0.40, 0.005, 0.105],
    cdi2: [-0.71, -0.125, 0.095], clk2: [-0.40, -0.125, 0.075],
  };
  // static panel art: flat black with the sub-panel outlines, square bezels and screws, placards
  const art = canvasTex(1920, 700), PXM = 1000, ax = x => (x + 0.96) * PXM, ay = y => (0.27 - y) * PXM;
  {
    const c = art.ctx; c.clearRect(0, 0, 1920, 700);
    c.fillStyle = '#1b1d1e'; c.fillRect(0, 0, 1920, 480); c.fillRect(ax(-0.245), 0, 560, 700);
    c.strokeStyle = '#33373a'; c.lineWidth = 3;
    for (const [x0, x1] of [[-0.95, -0.3], [-0.245, 0.315], [0.33, 0.95]]) { c.strokeRect(ax(x0), ay(0.262), (x1 - x0) * PXM, (x0 === -0.245 ? 0.68 : 0.47) * PXM); }
    for (const k in GL) {
      const [x, y, d] = GL[k], s = d * 1.12 * PXM; c.fillStyle = '#111213'; c.fillRect(ax(x) - s / 2, ay(y) - s / 2, s, s);
      c.fillStyle = '#5a5e60'; for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.beginPath(); c.arc(ax(x) + dx * s * 0.41, ay(y) + dy * s * 0.41, 4, 0, TAU); c.fill(); }
    }
    const lab = (t, x, y, s = 13, col = '#e0ddd0') => txt(c, t, ax(x), ay(y), col, s);
    lab('PILOT', 0.86, 0.24, 12, '#8a8d88'); lab('COPILOT', -0.86, 0.24, 12, '#8a8d88');
    lab('ROTOR RPM 294 - 324', 0.04, -0.15, 12); lab('ENGINE RPM 6400 - 6600', 0.04, -0.17, 12); lab('VNE 124 KIAS', 0.04, -0.2, 12);
    lab('TORQUE LIMIT 50 PSI', 0.04, -0.23, 12); lab('EGT 760°C MAX START', 0.04, -0.26, 12);
    c.fillStyle = '#2a2d2e'; c.fillRect(ax(0.15), ay(-0.285), 140, 34); lab('UH-1H', 0.22, -0.302, 16, '#d0d0c8');
    lab('FIRE', -0.02, 0.205, 10, '#9a9d98'); lab('EXT', 0.06, 0.205, 10, '#9a9d98');
    art.tex.needsUpdate = true;
  }
  plane(1.92, 0.7, new THREE.MeshLambertMaterial({ map: art.tex, emissive: 0xffffff, emissiveMap: art.tex, emissiveIntensity: 0.55, alphaTest: 0.5 }), 0, -0.08, 0, P);
  // gauges: a canvas face on a disc, a bezel ring; faces with a static part are pre-rendered into bg
  const gauges = [];
  const ringM = M(0x2a2c2e);
  function gauge(key, size, face, dyn) {
    const [x, y, d] = GL[key], t = canvasTex(size, size), o = new THREE.Mesh(new THREE.CircleGeometry(d / 2, 36), new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false, color: 0xe2e2e2 }));
    o.position.set(x, y, 0.004); P.add(o);
    const ring = new THREE.Mesh(new THREE.RingGeometry(d / 2, d / 2 + 0.007, 36), ringM); ring.position.set(x, y, 0.006); P.add(ring);
    let bg = null; if (face) { bg = document.createElement('canvas'); bg.width = bg.height = size; face(bg.getContext('2d'), size); }
    const G = { key, W: size, ...t, bg, dyn, i: gauges.length }; gauges.push(G); return G;
  }

  // ---------------------------------------------------------------- lamps
  // a caption lamp: two pre-drawn textures (off / on), swapped by setLamp
  function lamp(parent, w, h, x, y, z, text, on, off = '#2a2420', ink = '#111') {
    const mk = lit => { const W = Math.round(w * 2400), H = Math.round(h * 2400), t = canvasTex(W, H), c = t.ctx; c.fillStyle = lit ? on : off; c.fillRect(0, 0, W, H); c.strokeStyle = '#000'; c.lineWidth = 4; c.strokeRect(0, 0, W, H);
      const L = text.split('|'); L.forEach((s, i) => txt(c, s, W / 2, H / 2 + (i - (L.length - 1) / 2) * H * 0.4, lit ? ink : '#5c5650', H * (L.length > 1 ? 0.34 : 0.5))); t.tex.needsUpdate = true; return t.tex; };
    const tOff = mk(false), tOn = mk(true), o = plane(w, h, new THREE.MeshBasicMaterial({ map: tOff, toneMapped: false }), x, y, z, parent);
    o.userData = { tOn, tOff, on: false }; return o;
  }
  const setLamp = (o, v) => { v = !!v; if (o.userData.on !== v) { o.userData.on = v; o.material.map = v ? o.userData.tOn : o.userData.tOff; } };
  const fireL = lamp(P, 0.065, 0.03, -0.02, 0.232, 0.005, 'FIRE', '#ff2a14', '#3a0e08');
  const rpmL = lamp(P, 0.06, 0.03, 0.47, 0.232, 0.005, 'RPM', '#ff2a14', '#3a0e08');
  const mcL = lamp(P, 0.075, 0.03, 0.645, 0.232, 0.005, 'MASTER|CAUTION', '#ffaa18', '#2e2408');
  const rpmL2 = lamp(P, 0.06, 0.03, -0.555, 0.232, 0.005, 'RPM', '#ff2a14', '#3a0e08');
  // CM (ngc/cmpolish): right of the pilot's flight instruments, the AN/APR-39 radar warning scope (green strobes toward
  // each radar painting you, longer as its lock builds), three threat lamps, and the M130 dispenser's counters
  const rwrT = canvasTex(192, 192);
  { const o = new THREE.Mesh(new THREE.CircleGeometry(0.05, 32), new THREE.MeshBasicMaterial({ map: rwrT.tex, toneMapped: false })); o.position.set(0.865, 0.13, 0.004); P.add(o);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.057, 32), ringM); ring.position.set(0.865, 0.13, 0.006); P.add(ring); }
  const lockL = lamp(P, 0.075, 0.024, 0.865, 0.052, 0.005, 'LOCK', '#ffaa18', '#2e2408');
  const mslL = lamp(P, 0.075, 0.024, 0.865, 0.024, 0.005, 'MISSILE', '#ff2a14', '#3a0e08');
  const lasL = lamp(P, 0.075, 0.024, 0.865, -0.004, 0.005, 'LASER', '#40e0ff', '#08262c');
  const cmT = canvasTex(240, 150); plane(0.088, 0.055, new THREE.MeshBasicMaterial({ map: cmT.tex, toneMapped: false }), 0.865, -0.06, 0.004, P);
  let cmKey = '';
  function drawCm(S) {   // M130 dispenser control panel: counters and the ARM lamp (flat paint, white stencils)
    const d = S.cm, pw = S.volts > 18, k = d ? `${pw}${d.flare}${d.chaff}${d.queue.length > 0}` : '-';
    if (k === cmKey) return; cmKey = k; const c = cmT.ctx;
    c.fillStyle = '#1e2122'; c.fillRect(0, 0, 240, 150); c.strokeStyle = '#4a4f52'; c.lineWidth = 4; c.strokeRect(2, 2, 236, 146);
    txt(c, 'M130  DISPENSER', 120, 22, '#d8d6cc', 19);
    const win = (x, label, n) => { c.fillStyle = '#060606'; c.fillRect(x - 46, 44, 92, 50); txt(c, pw && d ? String(n).padStart(2, '0') : '', x, 70, '#ffb02a', 38, 'center'); txt(c, label, x, 112, '#d8d6cc', 17); };
    win(62, 'FLARE', d ? d.flare : 0); win(178, 'CHAFF', d ? d.chaff : 0);
    c.fillStyle = pw ? (d && d.queue.length ? '#ffe070' : '#3b8a3a') : '#1a2a1a'; c.fillRect(100, 124, 40, 18); txt(c, 'ARM', 120, 134, '#111', 13);
    cmT.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- switches and hit boxes
  const hitM = new THREE.MeshBasicMaterial({ visible: false }), hits = [], hitsOf = {}, sw = {}, push = {}, pt = {};
  const hit = (id, w, h, d, x, y, z, p, label) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitM); o.position.set(x, y, z); o.userData.sw = id; o.userData.label = label; o.userData.size = [w, h, d]; p.add(o); hits.push(o); (hitsOf[id] = hitsOf[id] || []).push(o); return o; };
  const batM = M(0xd6d6ce);
  // toggle: a bat on a panel (local z = out of the face); on = tipped toward local +y (sign -1 flips it)
  const toggle = (id, p, x, y, label, { sign = 1, guard = false, dummy = false, on = false } = {}) => {
    const base = cyl(0.009, 0.009, 0.006, metal, x, y, 0.003, p, Math.PI / 2);
    const piv = new THREE.Group(); piv.position.set(x, y, 0.005); p.add(piv);
    cyl(0.0035, 0.005, 0.03, batM, 0, 0, 0.015, piv, Math.PI / 2); piv.userData.sign = sign;
    if (guard) for (const s of [-1, 1]) box(0.003, 0.024, 0.03, redM, x + s * 0.013, y, 0.015, p);   // red guard cheeks
    if (!dummy) { hit(id, 0.05, 0.055, 0.05, x, y, 0.02, p, label); sw[id] = piv; } else piv.rotation.x = -(on ? 0.5 : -0.5) * sign;
    return piv;
  };
  const button = (id, p, x, y, r, mat, label) => { const b = cyl(r, r, 0.012, mat, x, y, 0.006, p, Math.PI / 2, 0, 14); push[id] = { o: b, z: 0.006 }; hit(id, r * 3, r * 3, 0.04, x, y, 0.015, p, label); return b; };
  // panel top: FIRE light, FIRE EXT push button, RPM / MASTER CAUTION lights (the master caution lamp also resets)
  button('fire', P, 0.06, 0.232, 0.013, redM, 'FIRE EXTINGUISHER  -  PUSH');
  hit('mc', 0.085, 0.04, 0.03, 0.645, 0.232, 0.01, P, 'MASTER CAUTION RESET');
  // hover marker: a thin yellow frame on whatever the crosshair / cursor is over
  const hovs = [0, 1].map(() => { const o = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffd040, depthTest: false, transparent: true })); o.renderOrder = 9; o.visible = false; o.matrixAutoUpdate = false; g.add(o); return o; });   // one per hit box of the id (MASTER CAUTION has two)

  // ---------------------------------------------------------------- pedestal
  // two faces: A slopes from the panel bottom down/aft (caution, ENGINE, MISC panels), B is nearly flat (radios).
  // face group: x right, y forward along the face, z up out of it; canvas top = forward
  const face = (y0, z0, y1, z1, hw) => { const L = Math.hypot(y1 - y0, z1 - z0), s = Math.atan2(y0 - y1, z1 - z0), o = new THREE.Group(); o.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2); o.rotation.x = -Math.PI / 2 + s; g.add(o); o.userData.L = L; return o; };
  const PA = face(-0.66, -2.59, -0.83, -2.02), PB = face(-0.83, -2.02, -0.87, -1.4), LA = PA.userData.L, LB = PB.userData.L;
  for (const s of [-1, 1]) wall(s * 0.17, [[-2.6, -0.65], [-2.02, -0.83], [-1.4, -0.87], [-1.4, FL], [-2.6, FL]], panelM);
  box(0.34, 0.18, 0.02, panelM, 0, -0.96, -1.4);
  const pedA = canvasTex(680, Math.round(LA * 2000)), pedB = canvasTex(680, Math.round(LB * 2000));
  plane(0.34, LA, canvasMat(pedA, 0.55), 0, 0, 0.001, PA); plane(0.34, LB, canvasMat(pedB, 0.55), 0, 0, 0.001, PB);
  // caution panel captions (own canvas, redrawn when the lit set changes)
  const cautT = canvasTex(480, 320); plane(0.235, 0.155, new THREE.MeshBasicMaterial({ map: cautT.tex, toneMapped: false }), -0.042, 0.175, 0.003, PA);
  toggle('mc', PA, 0.125, 0.22, 'MASTER CAUTION RESET'); toggle('lowrpm', PA, 0.125, 0.125, 'LOW RPM AUDIO');
  toggle('gov', PA, -0.1, -0.01, 'GOVERNOR  AUTO / EMER', { guard: true }); toggle('deice', PA, 0, -0.01, '', { dummy: true }); toggle('engine', PA, 0.1, -0.01, 'MAIN FUEL', { guard: true });
  toggle('trim', PA, -0.1, -0.18, 'FORCE TRIM'); toggle('hyd', PA, 0, -0.18, 'HYD CONTROL'); toggle('sas', PA, 0.1, -0.18, 'STABILITY ASSIST  (GAME AID)');
  for (const x of [-0.12, -0.06, 0, 0.06, 0.12]) for (const y of [0.27, 0.16, 0.06, -0.05, -0.15, -0.25]) if ((x * 100 + y * 10) % 3 > 1) cyl(0.008, 0.009, 0.012, black, x, y, 0.006, PB, Math.PI / 2, 0, 10);   // radio knobs
  button('radio', PB, 0.12, 0.13, 0.011, M(0x2a62c8), 'LOGISTICS  -  RADIO CALL (FUEL DROP / FIELD REPAIR)');
  // pedestal art
  const pedPx = (t, L) => ({ X: x => (x + 0.17) * 2000, Y: y => (L / 2 - y) * 2000 });
  function plate(c, X, Y, x0, y0, x1, y1, title) {
    c.fillStyle = '#222527'; c.fillRect(X(x0), Y(y0), (x1 - x0) * 2000, (y0 - y1) * 2000); c.strokeStyle = '#43484b'; c.lineWidth = 3; c.strokeRect(X(x0), Y(y0), (x1 - x0) * 2000, (y0 - y1) * 2000);
    c.fillStyle = '#5a5e60'; for (const [x, y] of [[x0 + 0.008, y0 - 0.008], [x1 - 0.008, y0 - 0.008], [x0 + 0.008, y1 + 0.008], [x1 - 0.008, y1 + 0.008]]) { c.beginPath(); c.arc(X(x), Y(y), 5, 0, TAU); c.fill(); }
    if (title) txt(c, title, X((x0 + x1) / 2), Y(y0) + 26, '#e8e4d4', 26);
  }
  function drawPedA() {
    const c = pedA.ctx, { X, Y } = pedPx(pedA, LA), l = (t, x, y, s = 16, col = '#e8e4d4') => txt(c, t, X(x), Y(y), col, s * 1.45);
    c.fillStyle = '#17191a'; c.fillRect(0, 0, 680, pedA.cv.height);
    plate(c, X, Y, -0.168, LA / 2 - 0.002, 0.168, 0.088, '');
    l('TEST', 0.125, 0.256, 14); l('RESET', 0.125, 0.186, 14); l('LOW RPM', 0.125, 0.163, 13); l('AUDIO', 0.125, 0.15, 13); l('OFF', 0.125, 0.094, 13);
    plate(c, X, Y, -0.168, 0.084, 0.168, -0.092, 'ENGINE');
    l('GOV', -0.1, 0.035, 16); l('AUTO', -0.1, 0.022, 13); l('EMER', -0.1, -0.045, 13, '#ff8a5a');
    l('DE-ICE', 0, 0.035, 16); l('ON', 0, 0.022, 13); l('OFF', 0, -0.045, 13);
    l('MAIN FUEL', 0.1, 0.035, 16); l('ON', 0.1, 0.022, 13); l('OFF', 0.1, -0.045, 13);
    plate(c, X, Y, -0.168, -0.096, 0.168, -LA / 2 + 0.002, 'MISC');
    l('FORCE TRIM', -0.1, -0.135, 13); l('ON', -0.1, -0.148, 12); l('OFF', -0.1, -0.215, 12);
    l('HYD CONT', 0, -0.135, 13); l('ON', 0, -0.148, 12); l('OFF', 0, -0.215, 12);
    c.fillStyle = '#1e4a9a'; c.fillRect(X(0.06), Y(-0.126), 0.08 * 2000, 0.018 * 2000); l('STAB ASSIST', 0.1, -0.135, 13, '#fff'); l('ON', 0.1, -0.148, 12); l('OFF', 0.1, -0.215, 12); l('(GAME AID)', 0.1, -0.235, 11, '#9ab');
    pedA.tex.needsUpdate = true;
  }
  const RADIOS = [['AN/ARC-51BX  UHF', 0.31, 0.21, '251.0'], ['AN/ARC-131  FM', 0.21, 0.1, '30.00'], ['AN/ARC-134  VHF', 0.1, 0.0, '121.50'], ['AN/ARN-82  VOR', 0.0, -0.1, '108.00'], ['AN/ARN-83  ADF', -0.1, -0.2, '0350'], ['AN/APX-72  IFF', -0.2, -0.31, '1200']];
  function drawPedB(pw) {
    const c = pedB.ctx, { X, Y } = pedPx(pedB, LB), l = (t, x, y, s = 15, col = '#e8e4d4') => txt(c, t, X(x), Y(y), col, s * 1.45);
    c.fillStyle = '#17191a'; c.fillRect(0, 0, 680, pedB.cv.height);
    for (const [name, y0, y1, f] of RADIOS) {
      plate(c, X, Y, -0.168, y0 - 0.002, 0.168, y1 + 0.002, ''); l(name, -0.03, y0 - 0.016, 15);
      c.fillStyle = '#050605'; c.fillRect(X(-0.07), Y(y0 - 0.032), 0.12 * 2000, 0.036 * 2000);
      l(f, -0.01, (y0 + y1) / 2 - 0.004, 34, pw ? '#ffb040' : '#2a2018');
      for (const x of [-0.14, 0.09]) { c.strokeStyle = '#555'; c.lineWidth = 2; c.beginPath(); c.arc(X(x), Y((y0 + y1) / 2 - 0.01), 22, 0, TAU); c.stroke(); }
      l(name.includes('IFF') ? 'MODE 3/A' : name.includes('ADF') ? 'ADF  ANT  LOOP' : 'OFF  T/R  T/R+G', -0.01, y1 + 0.012, 11, '#9a9d98');
    }
    l('LOGISTICS', 0.12, 0.183 - 0.003, 12, '#9cf'); l('CALL', 0.12, 0.112, 12, '#9cf');
    pedB.tex.needsUpdate = true;
  }
  drawPedA(); drawPedB(false);

  // ---------------------------------------------------------------- overhead console
  // a trapezoid hanging from the roof between the greenhouse windows; the pilot's power switches on its right face
  {
    const zc = -1.76, L = 0.7, pts = [[-0.22, RF], [0.22, RF], [0.12, 0.33], [-0.12, 0.33]];
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), geo = new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false }); geo.translate(0, 0, zc - L / 2);
    g.add(new THREE.Mesh(geo, panelM));
  }
  const ohFace = (sx) => {   // side face toward one seat: local x along the console (forward to the viewer's right), y up the face, z out
    const o = new THREE.Group(), n = V3(sx * 0.12, -0.1, 0).normalize(), xa = V3(0, 0, -sx), ya = V3().crossVectors(n, xa);
    o.quaternion.setFromRotationMatrix(_m4.makeBasis(xa, ya, n)); o.position.set(sx * 0.17, 0.39, -1.76).addScaledVector(n, 0.002); g.add(o); return o;
  };
  const OR = ohFace(1), OL = ohFace(-1), ohR = canvasTex(1400, 312), ohL = canvasTex(1400, 312), ohB = canvasTex(480, 1400);
  plane(0.7, 0.156, canvasMat(ohR, 0.55), 0, 0, 0, OR); plane(0.7, 0.156, canvasMat(ohL, 0.55), 0, 0, 0, OL);
  { const o = plane(0.24, 0.7, canvasMat(ohB, 0.55), 0, 0.329, -1.76); o.rotation.x = Math.PI / 2; }
  // pilot's face, forward end on the left of the canvas... forward is local +x (toward -z): BAT, MAIN GEN, STARTER GEN, NON-ESS, INVERTER
  toggle('bat', OR, 0.27, -0.01, 'BATTERY'); toggle('gen', OR, 0.19, -0.01, 'MAIN GENERATOR'); toggle('stgen', OR, 0.11, -0.01, '', { dummy: true, on: true });
  toggle('noness', OR, 0.03, -0.01, '', { dummy: true }); toggle('inv', OR, -0.08, -0.01, 'INVERTER  MAIN / OFF');
  for (let i = 0; i < 3; i++) cyl(0.012, 0.012, 0.014, black, -0.17 - i * 0.055, -0.01, 0.007, OR, Math.PI / 2, 0, 12);   // light rheostats
  {   // circuit breakers: rows of little black buttons on the bottom face and the copilot side
    const cb = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.012, 8), black, 96), m = new THREE.Matrix4(), q = new THREE.Quaternion();
    let k = 0;
    for (let r = 0; r < 4; r++) for (let i = 0; i < 14; i++) { m.compose(V3(-0.075 + r * 0.05, 0.325, -2.06 + i * 0.045), q.identity(), V3(1, 1, 1)); cb.setMatrixAt(k++, m); }
    OL.updateMatrix(); for (let r = 0; r < 2; r++) for (let i = 0; i < 14; i++) { m.compose(V3(-0.3 + i * 0.045, 0.03 - r * 0.05, 0.006), q.setFromAxisAngle(V3(1, 0, 0), Math.PI / 2), V3(1, 1, 1)); cb.setMatrixAt(k++, _m5.multiplyMatrices(OL.matrix, m)); }
    cb.count = k; g.add(cb);
  }
  function drawOverhead() {
    const W = 1400, H = 312, X = x => (x + 0.35) * 2000, Y = y => (0.078 - y) * 2000;
    { const c = ohR.ctx; c.fillStyle = '#1d1f20'; c.fillRect(0, 0, W, H); c.strokeStyle = '#43484b'; c.lineWidth = 3; c.strokeRect(4, 4, W - 8, H - 8);
      const l = (t, x, y, s = 20, col = '#e8e4d4') => txt(c, t, X(x), Y(y), col, s);
      c.strokeRect(X(-0.0), 14, 0.33 * 2000, H - 28); c.strokeRect(X(-0.14), 14, 0.13 * 2000, H - 28);
      l('DC POWER', 0.15, 0.06, 22); l('BAT', 0.27, 0.03); l('MAIN GEN', 0.19, 0.03); l('STARTER GEN', 0.11, 0.03, 15); l('NON-ESS BUS', 0.03, 0.03, 15);
      for (const x of [0.27, 0.19, 0.11, 0.03]) { l('ON', x, 0.015, 14); l('OFF', x, -0.05, 14); }
      l('AC POWER', -0.075, 0.06, 20); l('INVERTER', -0.08, 0.03, 16); l('MAIN', -0.08, 0.015, 13); l('OFF', -0.08, -0.05, 13);
      l('CONSOLE   PEDESTAL   INSTR', -0.225, 0.03, 13); l('LIGHTS', -0.225, -0.05, 15);
      ohR.tex.needsUpdate = true; }
    { const c = ohL.ctx; c.fillStyle = '#1d1f20'; c.fillRect(0, 0, W, H); c.strokeStyle = '#43484b'; c.lineWidth = 3; c.strokeRect(4, 4, W - 8, H - 8);
      txt(c, 'CIRCUIT BREAKERS  -  AC / DC ESSENTIAL BUS', W / 2, 30, '#e8e4d4', 20); for (let i = 0; i < 14; i++) txt(c, ['PITOT', 'GOV', 'FUEL', 'IGN', 'START', 'INV', 'GEN', 'BAT', 'CAUT', 'FIRE', 'RPM', 'TRIM', 'HYD', 'LDG LT'][i], X(-0.3 + i * 0.045), Y(0.055), '#bdbab0', 12);
      ohL.tex.needsUpdate = true; }
    { const c = ohB.ctx; c.fillStyle = '#1d1f20'; c.fillRect(0, 0, 480, 1400); c.strokeStyle = '#43484b'; c.lineWidth = 3; c.strokeRect(4, 4, 472, 1392);
      for (let r = 0; r < 4; r++) for (let i = 0; i < 14; i++) txt(c, String(5 + ((r * 7 + i * 3) % 4) * 5), 240 - 150 + r * 100 + 26, 1400 - (0.04 + i * 0.045) * 2000 - 10, '#9a9890', 12);
      ohB.tex.needsUpdate = true; }
  }
  drawOverhead();

  // ---------------------------------------------------------------- seats
  for (const s of [-1, 1]) {
    const x = s * 0.55, seat = new THREE.Group(); seat.position.set(x, 0, 0); g.add(seat);
    box(0.5, 0.06, 0.48, seatM, 0, -0.64, -1.88, seat); box(0.46, 0.06, 0.44, cushion, 0, -0.6, -1.89, seat);     // bucket + cushion
    box(0.5, 0.64, 0.08, armour, 0, -0.31, -1.6, seat, 0.1); box(0.44, 0.5, 0.05, cushion, 0, -0.33, -1.655, seat, 0.1);   // armoured back (shoulder high) + pad
    box(0.06, 0.62, 0.5, armour, s * 0.28, -0.33, -1.85, seat);                  // sliding side armour (outboard)
    box(0.04, 0.07, 0.46, seatM, -s * 0.25, -0.63, -1.87, seat);                 // inboard rail (low: the collective sits beside it)
    for (const sx of [-0.2, 0.2]) box(0.04, 0.4, 0.04, metal, sx, -0.85, -1.85, seat);   // seat legs
    box(0.06, 0.04, 0.5, black, s * 0.29, -0.02, -1.85, seat);                  // armour panel handle rail
  }
  // QA (ngc/qa-units): the copilot in the left seat, as the exterior model shows him (was: an empty seat with the belts
  // lying on it). Hands on his thighs; 1.1 m left of the pilot's eye, so he never blocks the view ahead.
  { const cp = buildSeatedCrewman({ suit: M(0x5a6247), vest: M(0x3a3f2e), helmet: M(0x4a5532), skin: M(0xc19a77), visor: M(0x151515) });
    cp.position.set(-0.55, -0.57, -1.81); g.add(cp); }

  // ---------------------------------------------------------------- flight controls (both seats, linked)
  const cyclics = [], collectives = [], pedalSets = [];
  for (const s of [1, -1]) {
    // cyclic: pivot in the floor, long stick with a slight bend, grip with trigger / trim buttons
    const cp = new THREE.Group(); cp.position.set(s * 0.55, FL + 0.04, -2.08); g.add(cp);
    cyl(0.06, 0.075, 0.07, black, 0, 0.0, 0, cp);                               // boot
    cyl(0.014, 0.017, 0.62, metal, 0, 0.31, 0, cp);
    const grip = new THREE.Group(); grip.position.set(0, 0.68, -0.02); cp.add(grip);
    box(0.04, 0.12, 0.045, black, 0, 0, 0, grip, 0.12); box(0.05, 0.035, 0.055, black, 0, 0.07, -0.008, grip); box(0.01, 0.025, 0.012, M(0x444444), 0, 0.02, -0.03, grip);
    cyl(0.005, 0.005, 0.01, redM, 0.012, 0.09, -0.01, grip); cyl(0.005, 0.005, 0.01, M(0x888888), -0.012, 0.09, -0.01, grip);
    cyclics.push({ cp, grip });
    // collective: pivot aft beside the seat, lever forward and up; throttle twist grip and the switch box at its end
    const cx = s > 0 ? 0.255 : -0.88, cl = new THREE.Group(); cl.position.set(cx, -0.72, -1.55); g.add(cl);
    box(0.05, 0.08, 0.1, black, 0, -0.02, 0.02, cl);                            // pivot housing
    cyl(0.017, 0.017, 0.4, metal, 0, 0, -0.2, cl, Math.PI / 2);
    box(0.035, 0.012, 0.25, black, 0, -0.025, -0.15, cl);                       // friction rail
    const tw = new THREE.Group(); tw.position.set(0, 0, -0.43); cl.add(tw);
    cyl(0.023, 0.023, 0.1, M(0x303234), 0, 0, 0, tw, Math.PI / 2, 0, 12);
    box(0.004, 0.006, 0.1, whiteM, 0, 0.023, 0, tw);                             // index mark on the grip
    const sb = new THREE.Group(); sb.position.set(0, 0.0, -0.51); cl.add(sb);
    box(0.06, 0.055, 0.07, M(0x45494c), 0, 0.005, 0, sb);                       // switch box
    const trig = box(0.014, 0.02, 0.018, M(0x9a9a92), 0, -0.032, 0.012, sb);     // starter trigger underneath
    const ll = new THREE.Group(); ll.position.set(0.0, 0.034, 0.01); sb.add(ll); cyl(0.003, 0.004, 0.022, batM, 0, 0.011, 0, ll);
    box(0.006, 0.01, 0.006, whiteM, 0.018, 0.033, -0.015, sb); box(0.006, 0.01, 0.006, whiteM, -0.018, 0.033, -0.015, sb);
    if (s > 0) { hit('starter', 0.05, 0.035, 0.05, 0, -0.035, 0.0, sb, 'STARTER TRIGGER  -  ENGAGE TO 40% N1'); hit('light', 0.05, 0.035, 0.05, 0, 0.04, 0.005, sb, 'LANDING LIGHT'); }
    collectives.push({ cl, tw, trig, ll });
    // pedals hanging in front of the seat
    pedalSets.push([-0.13, 0.13].map(dx => { const p = new THREE.Group(); p.position.set(s * 0.55 + dx, -0.9, -2.8); g.add(p); box(0.1, 0.2, 0.025, metal, 0, 0, 0, p, -0.45); box(0.02, 0.02, 0.2, oliveD, 0, 0.09, 0.08, p); box(0.08, 0.02, 0.01, black, 0, 0.0, 0.015, p, -0.45); return p; }));
  }
  // the pilot: legs to the pedals, right hand on the cyclic grip, left hand on the collective twist grip
  const legs = [];
  for (const dx of [-0.13, 0.13]) {
    const hip = V3(0.55 + dx * 0.9, -0.52, -1.82), knee = V3(0.55 + dx * 1.4, -0.47, -2.36);
    limb(hip, knee, 0.066, suit);
    const shin = limb(knee, V3(0.55 + dx, -0.88, -2.74), 0.05, suit), boot = box(0.1, 0.09, 0.27, bootM, 0.55 + dx, -0.88, -2.82); boot.rotation.x = -0.45;
    legs.push({ knee, shin, boot, dx });
  }
  box(0.36, 0.38, 0.2, vest, 0.55, -0.31, -1.76);                              // torso (survival vest) below the eye
  for (const x of [0.48, 0.62]) box(0.05, 0.005, 0.22, M(0x6a6a50), x, -0.12, -1.86, g, -0.5);   // harness straps
  // forearms only (upper arms would sit right next to the eye): elbows low beside the body, re-aimed at the grips per frame
  const foreR = limb(V3(0.8, -0.44, -1.84), V3(0.55, -0.35, -2.1), 0.04, suit), foreL = limb(V3(0.32, -0.5, -1.76), V3(0.255, -0.68, -1.98), 0.04, suit);
  const handR = new THREE.Group(); cyclics[0].grip.add(handR); box(0.065, 0.085, 0.07, glove, 0.0, -0.005, 0.012, handR); box(0.02, 0.03, 0.04, glove, -0.03, 0.03, -0.01, handR);   // fist + thumb
  const handL = new THREE.Group(); collectives[0].cl.add(handL); handL.position.set(0, 0.0, -0.43); box(0.075, 0.06, 0.09, glove, 0, 0.012, 0, handL);

  // ---------------------------------------------------------------- instruments
  const asiMap = v => v <= 20 ? v : 20 + (Math.min(v, 160) - 20) * 300 / 130;
  const vsiMap = v => { const a = Math.min(4, Math.abs(v) / 1000), f = a <= 1 ? a * 70 : a <= 2 ? 70 + (a - 1) * 45 : 115 + (a - 2) / 2 * 45; return -90 + Math.sign(v) * f; };
  const tachMap = e => e <= 5000 ? -150 + e / 5000 * 180 : 30 + (Math.min(e, 7200) - 5000) / 2000 * 120;
  const raltMap = f => f <= 200 ? f / 200 * 180 : 180 + (Math.min(f, 1500) - 200) / 1300 * 120;
  const F = {
    asi: (c, W) => { const R = W / 2; dialFace(c, W, { map: asiMap, v0: 20, v1: 150, major: 10, minor: 5, labels: [20, 40, 60, 80, 100, 120, 140].map(v => [v, String(v)]), reds: [124], title: 'AIRSPEED', ty: 1.32, unit: 'KNOTS', uy: 0.66 }); },
    alt: (c, W) => { dialFace(c, W, { map: lin(0, 0, 1000, 360), v0: 0, v1: 980, major: 100, minor: 20, labels: [...Array(10)].map((_, i) => [i * 100, String(i)]), ls: 0.24, lr: 0.6, title: 'ALT', ty: 1.38, unit: '100 FEET', uy: 0.76 });
      const R = W / 2; c.fillStyle = '#000'; c.fillRect(R * 1.2, R * 0.86, R * 0.58, R * 0.28); c.strokeStyle = '#555'; c.strokeRect(R * 1.2, R * 0.86, R * 0.58, R * 0.28); txt(c, '29.92', R * 1.49, R * 1.0, '#ecebe2', R * 0.16); },
    vsi: (c, W) => { const R = W / 2; faceBg(c, W);
      for (const v of [-4000, -3000, -2000, -1500, -1000, -500, 0, 500, 1000, 1500, 2000, 3000, 4000]) radial(c, R, vsiMap(v), '#ecebe2', R * 0.74, R * 0.92, R * 0.045);
      for (let v = -1000; v <= 1000; v += 100) if (v % 500) radial(c, R, vsiMap(v), '#ecebe2', R * 0.82, R * 0.92, R * 0.025);
      for (const v of [0, 1000, 2000, 4000, -1000, -2000, -4000]) { const [x, y] = P2(R, R * 0.56, vsiMap(v)); txt(c, String(Math.abs(v / 1000)), x, y, '#ecebe2', R * 0.2); }
      txt(c, 'UP', R * 0.66, R * 0.68, '#cfcdc0', R * 0.12); txt(c, 'DOWN', R * 0.66, R * 1.32, '#cfcdc0', R * 0.12); txt(c, 'VERT SPEED', R * 1.1, R * 0.7, '#cfcdc0', R * 0.1); txt(c, '1000 FT/MIN', R * 1.1, R * 1.3, '#cfcdc0', R * 0.09); },
    ts: (c, W) => { const R = W / 2; faceBg(c, W);
      for (const a of [-18, 18]) { c.strokeStyle = '#ecebe2'; c.lineWidth = R * 0.05; const [x, y] = P2(R, R * 0.8, a); c.strokeRect(x - R * 0.07, y - R * 0.1, R * 0.14, R * 0.2); }
      radial(c, R, 0, '#ecebe2', R * 0.72, R * 0.92, R * 0.05); txt(c, 'L', R * 0.42, R * 0.6, '#ecebe2', R * 0.2); txt(c, 'R', R * 1.58, R * 0.6, '#ecebe2', R * 0.2);
      band(c, R, 152, 208, '#c8c4b0', R * 0.62, R * 0.2); txt(c, '2 MIN TURN', R, R * 1.0, '#cfcdc0', R * 0.11); },
    tq: (c, W) => dialFace(c, W, { map: lin(0, -150, 60, 150), v0: 0, v1: 60, major: 10, minor: 2, labels: [0, 10, 20, 30, 40, 50, 60].map(v => [v, String(v)]), bands: [[0, 50, '#2db040']], reds: [50], title: 'TORQUE', unit: 'PSI' }),
    n1: (c, W) => { const R = W / 2; dialFace(c, W, { map: lin(0, -150, 100, 150), v0: 0, v1: 100, major: 10, minor: 2, labels: [0, 20, 40, 60, 80, 100].map(v => [v, String(v)]), reds: [101.5], title: 'GAS PROD', ts: 0.12, ty: 0.64, unit: '% RPM', uy: 0.78 });
      c.fillStyle = '#000'; c.beginPath(); c.arc(R, R * 1.3, R * 0.17, 0, TAU); c.fill();   // units sub-dial
      for (let i = 0; i < 10; i++) { const a = i * 36 * D2R; c.strokeStyle = '#ccc'; c.lineWidth = 2; c.beginPath(); c.moveTo(R + Math.sin(a) * R * 0.12, R * 1.3 - Math.cos(a) * R * 0.12); c.lineTo(R + Math.sin(a) * R * 0.16, R * 1.3 - Math.cos(a) * R * 0.16); c.stroke(); } },
    egt: (c, W) => dialFace(c, W, { map: lin(0, -135, 1000, 135), v0: 0, v1: 1000, major: 100, minor: 50, labels: [0, 200, 400, 600, 800, 1000].map(v => [v, String(v / 100)]), bands: [[400, 610, '#2db040'], [610, 760, '#e8c020']], reds: [760], title: 'EXH TEMP', unit: '°C x100' }),
    tach: (c, W) => { const R = W / 2; faceBg(c, W);
      band(c, R, tachMap(6400), tachMap(6600), '#2db040', R * 0.88, R * 0.08); radial(c, R, tachMap(6700), '#e8281a', R * 0.8, R * 0.96, R * 0.05);
      for (let e = 0; e <= 7000; e += 500) radial(c, R, tachMap(e), '#ecebe2', R * (e % 1000 ? 0.86 : 0.78), R * 0.93, e % 1000 ? R * 0.025 : R * 0.04);
      for (let e = 0; e <= 7000; e += 1000) { const [x, y] = P2(R, R * 0.66, tachMap(e)); txt(c, String(e / 100), x, y, '#ecebe2', R * 0.14); }
      const rm = r => tachMap(r * 6600 / 324);   // rotor scale on the inner ring, aligned so 324 rpm sits on 6600 (married needles)
      band(c, R, rm(294), rm(324), '#2db040', R * 0.46, R * 0.07); for (const r of [294, 339]) radial(c, R, rm(r), '#e8281a', R * 0.4, R * 0.53, R * 0.045);
      for (let r = 0; r <= 350; r += 50) radial(c, R, rm(r), '#ecebe2', R * 0.42, R * 0.5, R * 0.025);
      for (const r of [0, 100, 200, 300]) { const [x, y] = P2(R, R * 0.3, rm(r)); txt(c, String(r / 10), x, y, '#cfcdc0', R * 0.1); }
      txt(c, 'ENGINE', R * 0.7, R * 1.4, '#cfcdc0', R * 0.09); txt(c, 'ROTOR', R * 1.3, R * 1.4, '#cfcdc0', R * 0.09); txt(c, 'RPM', R, R * 1.55, '#cfcdc0', R * 0.1); },
    small: o => (c, W) => dialFace(c, W, { ls: 0.24, lr: 0.6, ts: 0.15, ty: 0.6, uy: 1.36, ...o }),   // title in the upper half, end labels only
    fuel: (c, W) => dialFace(c, W, { map: lin(0, -135, 1600, 135), v0: 0, v1: 1600, major: 200, minor: 100, labels: [0, 400, 800, 1200, 1600].map(v => [v, String(v / 100)]), ls: 0.22, title: 'FUEL', ts: 0.14, ty: 1.4, unit: 'LBS x100' }),
    ralt: (c, W) => { const R = W / 2; dialFace(c, W, { map: raltMap, v0: 0, v1: 200, major: 50, minor: 10, labels: [[0, '0'], [50, '50'], [100, '100'], [150, '150'], [200, '200']], ls: 0.15, title: 'RADAR ALT', ts: 0.11, ty: 0.68 });
      for (const f of [500, 1000, 1500]) { radial(c, R, raltMap(f), '#ecebe2', R * 0.74, R * 0.92, R * 0.045); const [x, y] = P2(R, R * 0.56, raltMap(f)); txt(c, String(f / 100), x, y, '#ecebe2', R * 0.15); } },
    clk: (c, W) => dialFace(c, W, { map: lin(0, 0, 60, 360), v0: 0, v1: 59, major: 5, minor: 1, labels: [12, 3, 6, 9].map(h => [h * 5 % 60, String(h)]), ls: 0.26, lr: 0.58 }),
    cdi: (c, W) => { const R = W / 2; faceBg(c, W); for (let a = 0; a < 360; a += 10) radial(c, R, a, '#ecebe2', R * (a % 30 ? 0.84 : 0.76), R * 0.94, R * 0.03);
      for (let a = 0; a < 360; a += 30) { const [x, y] = P2(R, R * 0.62, a); txt(c, a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a / 10), x, y, '#ecebe2', R * 0.15); }
      for (let i = -2; i <= 2; i++) if (i) { c.fillStyle = '#ecebe2'; c.beginPath(); c.arc(R + i * R * 0.17, R, R * 0.035, 0, TAU); c.fill(); }
      c.fillStyle = '#ecebe2'; c.beginPath(); c.moveTo(R, R * 0.08); c.lineTo(R - R * 0.06, R * 0.2); c.lineTo(R + R * 0.06, R * 0.2); c.fill(); },
  };
  const SM = (title, v0, v1, major, minor, labels, bands = [], reds = [], unit = '') => F.small({ title, map: lin(v0, -135, v1, 135), v0, v1, major, minor, labels: [labels[0], labels[labels.length - 1]].map(v => [v, String(v)]), bands, reds, unit });
  const GRN = '#2db040', YEL = '#e8c020';
  // the live parts. V = damped needle values (updated every frame), S = the panel snapshot
  const V = { ias: 0, alt: 0, vsi: 0, turn: 0, slip: 0, nr: 0, n2: 0, n1: 0, tq: 0, egt: 20, eop: 0, eot: 20, xop: 0, xot: 20, fuel: 0, fp: 0, dcv: 0, load: 0, acv: 0, agl: 0, p: 0, r: 0 };
  const flaky = (S, i) => S.avionics < 0.4 && ((performance.now() / 700 + i * 1.7) % 3) < 1.2;   // failing avionics drop gauges in and out
  const simple = (key, size, faceFn, val, a, opt = {}) => gauge(key, size, faceFn, (c, W, S, G) => {
    const R = W / 2; if (flaky(S, G.i)) { offFlag(c, W); return; }
    needle(c, R, a(val()), R * (opt.len || 0.86), '#f2f2ea', R * (opt.w || 0.09)); hub(c, R, 0.1); if (opt.ac && !S.ac) offFlag(c, W, 'OFF', 0.32, 0.7);
  });
  function adiDraw(c, W, S, G) {
    const R = W / 2; c.clearRect(0, 0, W, W); const ppd = R * 0.024;
    c.save(); c.beginPath(); c.arc(R, R, R * 0.97, 0, TAU); c.clip(); c.translate(R, R); c.rotate(-V.r);
    const off = clamp(V.p / D2R, -60, 60) * ppd;
    c.fillStyle = '#4a86c4'; c.fillRect(-W, -2 * W + off, 2 * W, 2 * W); c.fillStyle = '#5a3a1e'; c.fillRect(-W, off, 2 * W, 2 * W);
    c.strokeStyle = '#fff'; c.lineWidth = R * 0.03; c.beginPath(); c.moveTo(-W, off); c.lineTo(W, off); c.stroke();
    c.lineWidth = R * 0.018;
    for (let p = -30; p <= 30; p += 5) if (p) { const y = off - p * ppd, w = p % 10 ? R * 0.12 : R * 0.26; c.strokeStyle = p > 0 ? '#fff' : '#f0f0f0'; c.beginPath(); c.moveTo(-w, y); c.lineTo(w, y); c.stroke(); if (!(p % 10)) { txt(c, String(Math.abs(p)), -w - R * 0.12, y, '#fff', R * 0.11); txt(c, String(Math.abs(p)), w + R * 0.12, y, '#fff', R * 0.11); } }
    // bank pointer rides the ball
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -R * 0.78); c.lineTo(-R * 0.06, -R * 0.66); c.lineTo(R * 0.06, -R * 0.66); c.fill();
    c.restore();
    // fixed bank scale and the miniature aircraft
    c.fillStyle = '#111'; c.beginPath(); c.arc(R, R, R, 0, TAU); c.arc(R, R, R * 0.8, 0, TAU, true); c.fill();
    for (const a of [-60, -30, -20, -10, 10, 20, 30, 60]) radial(c, R, a, '#ecebe2', R * 0.8, R * (Math.abs(a) % 30 ? 0.9 : 0.97), R * 0.03);
    c.fillStyle = '#ecebe2'; c.beginPath(); c.moveTo(R, R * 0.2); c.lineTo(R - R * 0.07, R * 0.06); c.lineTo(R + R * 0.07, R * 0.06); c.fill();
    c.strokeStyle = '#ff9a20'; c.lineWidth = R * 0.07; c.lineCap = 'round'; c.beginPath(); c.moveTo(R - R * 0.55, R); c.lineTo(R - R * 0.2, R); c.lineTo(R - R * 0.1, R + R * 0.1); c.moveTo(R + R * 0.55, R); c.lineTo(R + R * 0.2, R); c.lineTo(R + R * 0.1, R + R * 0.1); c.stroke();
    c.fillStyle = '#ff9a20'; c.beginPath(); c.arc(R, R, R * 0.045, 0, TAU); c.fill(); c.lineCap = 'butt';
    if (!S.ac || flaky(S, G.i)) offFlag(c, W, 'OFF', 0.28, 0.68, -0.5);
  }
  function rmiDraw(c, W, S, G) {   // compass card turning with the heading; no station tuned: both needles parked at 3 o'clock
    const R = W / 2; faceBg(c, W); if (flaky(S, G.i)) { offFlag(c, W); return; }
    c.save(); c.translate(R, R); c.rotate(-S.hdg);
    for (let a = 0; a < 360; a += 5) { const L = a % 30 ? (a % 10 ? 0.07 : 0.11) : 0.15; c.strokeStyle = '#ecebe2'; c.lineWidth = R * 0.025; c.beginPath(); c.moveTo(Math.sin(a * D2R) * R * 0.88, -Math.cos(a * D2R) * R * 0.88); c.lineTo(Math.sin(a * D2R) * R * (0.88 - L), -Math.cos(a * D2R) * R * (0.88 - L)); c.stroke(); }
    for (let a = 0; a < 360; a += 30) { c.save(); c.rotate(a * D2R); txt(c, a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a / 10), 0, -R * 0.6, '#ecebe2', R * 0.17); c.restore(); }
    c.restore();
    c.fillStyle = '#ff9a20'; c.beginPath(); c.moveTo(R, R * 0.14); c.lineTo(R - R * 0.07, R * 0.02); c.lineTo(R + R * 0.07, R * 0.02); c.fill();   // lubber
    needle(c, R, 90, R * 0.8, '#e8e4d4', R * 0.06); needle(c, R, 94, R * 0.66, '#9fd0e8', R * 0.1, 0.5); hub(c, R, 0.11);
    if (!S.ac) offFlag(c, W, 'OFF', 0.32, 0.72);
  }
  function altDraw(c, W, S, G) {
    const R = W / 2; if (flaky(S, G.i)) { offFlag(c, W); return; }
    const ft = Math.max(0, V.alt); needle(c, R, (ft % 10000) / 10000 * 360, R * 0.94, '#ecebe2', R * 0.03, 0); needle(c, R, (ft % 10000) / 10000 * 360 * 10 % 360, R * 0.5, '#ecebe2', R * 0.14, 0.12);
    needle(c, R, (ft % 1000) / 1000 * 360, R * 0.86, '#f2f2ea', R * 0.08); hub(c, R, 0.1);
  }
  function tsDraw(c, W, S, G) {
    const R = W / 2; if (flaky(S, G.i)) { offFlag(c, W); return; }
    const dc = S.volts > 18, a = dc ? clamp(V.turn / D2R / 3, -2.2, 2.2) * 18 : 0;
    needle(c, R, a, R * 0.8, '#f2f2ea', R * 0.09, 0.1, R, R * 1.05);
    const ba = 180 - clamp(V.slip, -1, 1) * 24, [bx, by] = P2(R, R * 0.62, ba);
    c.fillStyle = '#0a0a0a'; c.beginPath(); c.arc(bx, by, R * 0.085, 0, TAU); c.fill();
    for (const k of [-8, 8]) radial(c, R, 180 + k, '#111', R * 0.52, R * 0.72, R * 0.02);
    if (!dc) offFlag(c, W, 'OFF', 0.3, 0.38);
  }
  function tachDraw(c, W, S, G) {
    const R = W / 2;   // engine (N2) needle long with an E, rotor (NR) needle shorter with an R: married at 6600 / 324
    const ae = tachMap(V.n2 * 6600), ar = tachMap(V.nr * 324 * 6600 / 324);
    needle(c, R, ae, R * 0.88, '#f2f2ea', R * 0.07); needle(c, R, ar, R * 0.62, '#f2f2ea', R * 0.11);
    const [ex, ey] = P2(R, R * 0.62, ae), [rx, ry] = P2(R, R * 0.4, ar); txt(c, 'E', ex, ey, '#111', R * 0.08); txt(c, 'R', rx, ry, '#111', R * 0.08); hub(c, R, 0.11);
  }
  function n1Draw(c, W, S, G) {
    const R = W / 2, u = (V.n1 * 100) % 10 / 10 * 360;   // sub-dial: the units of % N1
    c.strokeStyle = '#f2f2ea'; c.lineWidth = R * 0.03; c.beginPath(); c.moveTo(R, R * 1.3); c.lineTo(R + Math.sin(u * D2R) * R * 0.14, R * 1.3 - Math.cos(u * D2R) * R * 0.14); c.stroke();
    needle(c, R, -150 + V.n1 * 100 * 3, R * 0.86, '#f2f2ea', R * 0.08); hub(c, R, 0.09);
  }
  function raltDraw(c, W, S, G) {
    const R = W / 2, ft = V.agl * 3.28084, on = S.volts > 18 && S.ac && !flaky(S, G.i);
    if (!on || ft > 1500) { c.fillStyle = '#222'; c.beginPath(); c.moveTo(R, R); c.arc(R, R, R * 0.7, (raltMap(1500) - 90) * D2R, (360 - 90) * D2R); c.fill(); }
    if (on && ft <= 1500) { needle(c, R, raltMap(ft), R * 0.84, '#f2f2ea', R * 0.08); }
    hub(c, R, 0.1); c.fillStyle = '#000'; c.fillRect(R * 0.62, R * 1.05, R * 0.76, R * 0.26); txt(c, on ? String(Math.round(Math.min(ft, 9999))) : '----', R, R * 1.18, on ? '#ffb040' : '#333', R * 0.2);
    if (!on) offFlag(c, W, 'OFF', 0.32, 0.36);
  }
  function clkDraw(c, W) {
    const R = W / 2, t = new Date(), s = t.getSeconds(), m = t.getMinutes() + s / 60, h = (t.getHours() % 12) + m / 60;
    needle(c, R, h * 30, R * 0.5, '#f2f2ea', R * 0.11); needle(c, R, m * 6, R * 0.8, '#f2f2ea', R * 0.08); needle(c, R, s * 6, R * 0.86, '#ff9a20', R * 0.03); hub(c, R, 0.08);
  }
  function cdiDraw(c, W, S, G) {   // course indicator: nothing tuned, so the NAV flag is in view and the bars are centred
    const R = W / 2; c.strokeStyle = '#ecebe2'; c.lineWidth = R * 0.05; c.beginPath(); c.moveTo(R, R * 0.35); c.lineTo(R, R * 1.65); c.stroke();
    c.lineWidth = R * 0.035; c.beginPath(); c.moveTo(R * 0.35, R); c.lineTo(R * 1.65, R); c.stroke(); offFlag(c, W, 'NAV', 0.7, 0.32, 0.3);
  }
  // pilot + copilot flight instruments
  for (const sfx of ['', '2']) {
    gauge('asi' + sfx, 256, F.asi, (c, W, S, G) => { const R = W / 2; if (flaky(S, G.i)) { offFlag(c, W); return; } needle(c, R, asiMap(V.ias), R * 0.86); hub(c, R); });
    gauge('adi' + sfx, 320, null, adiDraw); gauge('alt' + sfx, 256, F.alt, altDraw);
    gauge('rmi' + sfx, 256, null, rmiDraw); gauge('ts' + sfx, 224, F.ts, tsDraw);
    gauge('vsi' + sfx, 256, F.vsi, (c, W, S, G) => { const R = W / 2; if (flaky(S, G.i)) { offFlag(c, W); return; } needle(c, R, vsiMap(V.vsi), R * 0.86); hub(c, R); });
    gauge('cdi' + sfx, 224, F.cdi, cdiDraw); gauge('clk' + sfx, 192, F.clk, clkDraw);
  }
  gauge('ralt', 224, F.ralt, raltDraw);
  // engine and systems
  gauge('tach', 320, F.tach, tachDraw); gauge('n1', 256, F.n1, n1Draw);
  simple('tq', 256, F.tq, () => V.tq, lin(0, -150, 60, 150), { ac: true });
  simple('egt', 256, F.egt, () => V.egt, lin(0, -135, 1000, 135));
  simple('xop', 192, SM('XMSN OIL|PRESS', 0, 100, 20, 10, [0, 50, 100], [[40, 70, GRN]], [30, 70], 'PSI'), () => V.xop, lin(0, -135, 100, 135), { ac: true });
  simple('xot', 192, SM('XMSN OIL|TEMP', -70, 150, 50, 10, [-50, 50, 150], [[15, 110, GRN]], [110], '°C'), () => V.xot, lin(-70, -135, 150, 135));
  simple('eop', 192, SM('ENG OIL|PRESS', 0, 100, 20, 10, [0, 50, 100], [[80, 100, GRN]], [25, 100], 'PSI'), () => V.eop, lin(0, -135, 100, 135), { ac: true });
  simple('eot', 192, SM('ENG OIL|TEMP', -70, 150, 50, 10, [-50, 50, 150], [[0, 93, GRN]], [93], '°C'), () => V.eot, lin(-70, -135, 150, 135));
  simple('fp', 192, SM('FUEL|PRESS', 0, 50, 10, 5, [0, 25, 50], [[5, 35, GRN]], [5, 35], 'PSI'), () => V.fp, lin(0, -135, 50, 135), { ac: true });
  simple('dcv', 192, SM('DC|VOLTS', 0, 30, 5, 1, [0, 10, 20, 30], [[26, 29, GRN]], []), () => V.dcv, lin(0, -135, 30, 135));
  simple('load', 192, SM('MAIN GEN|LOAD', 0, 1, 0.25, 0.05, [0, 0.5, 1], [], [1]), () => V.load, lin(0, -135, 1, 135));
  simple('sload', 192, SM('STBY GEN|LOAD', 0, 1, 0.25, 0.05, [0, 0.5, 1], [], [1]), () => 0, lin(0, -135, 1, 135));
  simple('acv', 192, SM('AC|VOLTS', 0, 150, 50, 10, [0, 50, 100, 150], [[112, 118, GRN]], []), () => V.acv, lin(0, -135, 150, 135));
  simple('fuel', 256, F.fuel, () => V.fuel, lin(0, -135, 1600, 135), { ac: true });

  // caution panel: 4 columns x 5 rows of captions, amber when lit
  const capLines = CAPTIONS.map(t => { const w = t.split(' '); if (w.length < 2) return [t]; const k = Math.ceil(w.length / 2); return [w.slice(0, k).join(' '), w.slice(k).join(' ')]; });
  let cautKey = -1, lampTest = 0;
  function drawCaut(S) {
    let key = 0; const L = S.cautions || []; for (let i = 0; i < CAPTIONS.length; i++) if (L.includes(CAPTIONS[i]) || (lampTest > 0 && S !== NOCAUT)) key |= 1 << i;   // TEST lights every segment
    if (key === cautKey) return; cautKey = key;
    const c = cautT.ctx; c.fillStyle = '#060606'; c.fillRect(0, 0, 480, 320);
    for (let i = 0; i < 20; i++) {
      const x = (i % 4) * 120 + 3, y = Math.floor(i / 4) * 64 + 3, on = key & (1 << i);
      c.fillStyle = on ? '#f0a418' : '#1c1a16'; c.fillRect(x, y, 114, 58);
      capLines[i].forEach((t, k, a) => txt(c, t, x + 57, y + 29 + (k - (a.length - 1) / 2) * 20, on ? '#1a1000' : '#4a463c', 15));
    }
    cautT.tex.needsUpdate = true;
  }
  function drawCompass(S) {
    const c = compass.ctx, h = ((S.hdg / D2R) % 360 + 360) % 360; c.fillStyle = '#e8e2c8'; c.fillRect(0, 0, 160, 64);
    for (let d = Math.floor((h - 40) / 5) * 5; d <= h + 40; d += 5) { const x = 80 + (d - h) * 2.2, dd = (d + 360) % 360; c.fillStyle = '#111'; c.fillRect(x - 1, 0, 2, dd % 10 ? 10 : 18);
      if (dd % 30 === 0) txt(c, dd === 0 ? 'N' : dd === 90 ? 'E' : dd === 180 ? 'S' : dd === 270 ? 'W' : String(dd / 10), x, 40, '#111', 22); }
    c.fillStyle = '#c01810'; c.fillRect(79, 0, 3, 64); compass.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- per frame
  let slot = 0, pedPw = null;
  const LBL = {}; for (const h of hits) LBL[h.userData.sw] = LBL[h.userData.sw] || h.userData.label;
  const stateLbl = {};   // "<label>  [ON]" strings, built once
  const lblOf = (id, st) => { const k = id + st; return stateLbl[k] || (stateLbl[k] = `${LBL[id]}  [${st}]`); };
  let lastS = null;
  const flip = (id, on) => { const p = sw[id]; if (p) p.rotation.x = -(on ? 0.5 : -0.5) * p.userData.sign; };
  return {
    group: g, hitBoxes: hits, cmLamps: { lock: lockL, msl: mslL, laser: lasL },   // CM: for tests
    canvases: () => [...gauges.map(G => G.cv), cautT.cv, pedA.cv, pedB.cv, ohR.cv],   // canvases: for test contact sheets
    labelOf(id) {
      const s = lastS && lastS.sw; if (!s || !LBL[id]) return LBL[id] || id;
      if (id === 'gov') return lblOf(id, s.gov); if (id === 'engine' || id === 'inv' || id === 'bat' || id === 'gen' || id === 'hyd' || id === 'trim' || id === 'light' || id === 'sas' || id === 'lowrpm') return lblOf(id, s[id] ? 'ON' : 'OFF');
      if (id === 'starter') return lblOf(id, s.starter ? 'ENGAGED' : 'OFF');
      return LBL[id];
    },
    press(id) { pt[id] = 0.18; if (id === 'mc') lampTest = 1.2; },   // the TEST / RESET switch: a lamp test, then the reset
    update(H, dt, S) {
      lastS = S; const k = Math.min(1, 7 * dt), kk = Math.min(1, 2.5 * dt), ac = S.ac, s = S.sw, c = S.ctl;
      // needles: pneumatic and self-generating ones always live, AC ones fall to zero without the inverter
      V.ias += (Math.max(0, S.ias) - V.ias) * k; V.alt += (S.alt - V.alt) * k; V.vsi += (S.vsi - V.vsi) * Math.min(1, 3 * dt);
      V.turn += (S.turn - V.turn) * k; V.slip += (S.slip - V.slip) * Math.min(1, 4 * dt); V.agl += (S.agl - V.agl) * k;
      V.nr += (S.nr - V.nr) * k; V.n2 += (S.n2 - V.n2) * k; V.n1 += (S.n1 - V.n1) * k; V.egt += (S.egt - V.egt) * k;
      V.tq += ((ac ? S.torque : 0) - V.tq) * k; V.eop += ((ac ? S.engOilP : 0) - V.eop) * kk; V.xop += ((ac ? S.xmsnOilP : 0) - V.xop) * kk;
      V.eot += ((S.volts > 18 ? S.engOilT : -70) - V.eot) * kk; V.xot += ((S.volts > 18 ? S.xmsnOilT : -70) - V.xot) * kk;
      V.fuel += ((ac ? S.fuelLb : 0) - V.fuel) * kk; V.fp += ((ac && s.engine && S.volts > 12 ? 10 + 14 * Math.min(1, S.n1 * 1.4) : 0) - V.fp) * kk;
      V.dcv += (S.volts - V.dcv) * k; V.load += (S.amps / 150 - V.load) * k; V.acv += ((ac ? 115 : 0) - V.acv) * k;
      // attitude gyro: follows when powered, slowly topples when the AC goes away
      if (ac) { V.p += (S.pitch - V.p) * Math.min(1, 12 * dt); V.r += (S.roll - V.r) * Math.min(1, 12 * dt); } else { V.p += (0.35 - V.p) * 0.03 * dt; V.r += (0.6 - V.r) * 0.03 * dt; }
      // controls: cyclic (+right / +aft), collective (+up, twist grip = throttle), pedals (+right = right pedal forward)
      for (const cy of cyclics) cy.cp.rotation.set(c.cy * 0.2, 0, -c.cx * 0.16);
      for (const cl of collectives) { cl.cl.rotation.x = 0.29 + c.coll * 0.38; cl.tw.rotation.z = -S.throttle * 1.3; cl.trig.position.y = s.starter || pt.starter > 0 ? -0.026 : -0.032; cl.ll.rotation.x = s.light ? -0.5 : 0.5; }
      for (const ps of pedalSets) { ps[0].position.z = -2.8 + c.pedal * 0.07; ps[1].position.z = -2.8 - c.pedal * 0.07; }
      for (const L of legs) { const pz = L.dx < 0 ? -2.8 + c.pedal * 0.07 : -2.8 - c.pedal * 0.07; _w.set(0.55 + L.dx, -0.88, pz + 0.06); setLimb(L.shin, L.knee, _w); L.boot.position.z = pz - 0.02; }
      // forearms reach the grips (computed in cockpit space from the lever angles)
      { const cy = cyclics[0].cp; _w.set(0, 0.66, 0).applyEuler(cy.rotation).add(cy.position); setLimb(foreR, V3e(0.8, -0.44, -1.84), _w); }
      { const cl = collectives[0].cl; _w.set(0, 0.012, -0.43).applyEuler(cl.rotation).add(cl.position); setLimb(foreL, V3e(0.32, -0.5, -1.76), _w); }
      // switches
      flip('bat', s.bat); flip('gen', s.gen); flip('inv', s.inv); flip('engine', s.engine); flip('gov', s.gov === 'AUTO'); flip('hyd', s.hyd); flip('trim', s.trim); flip('sas', s.sas); flip('lowrpm', s.lowrpm);
      sw.mc.rotation.x = pt.mc > 0 ? 0.5 : 0;   // TEST / RESET rests in the centre, flicked down to reset
      for (const id in pt) pt[id] -= dt;
      for (const id in push) push[id].o.position.z = push[id].z - (pt[id] > 0 ? 0.005 : 0);
      // lamps (DC powered); master caution steady amber, RPM / FIRE red
      const pw = S.volts > 18; lampTest -= dt; setLamp(mcL, pw && (S.masterCaution || lampTest > 0)); setLamp(rpmL, pw && S.rpmWarn); setLamp(rpmL2, pw && S.rpmWarn); setLamp(fireL, S.volts > 12 && S.fire);
      if (S.rwr) {   // CM: threat lamps (LOCK steady, MISSILE flashing, LASER while a LANCE charges or fires), scope, counters
        const R = S.rwr, fl = (performance.now() % 400) < 220;
        setLamp(lockL, pw && R.locked && !R.launch); setLamp(mslL, pw && R.launch && fl); setLamp(lasL, pw && R.laser);
        if (slot === 3) { drawRwr(rwrT.ctx, 192, R, S.hdg, performance.now() / 1000, 'apr39', pw); rwrT.tex.needsUpdate = true; drawCm(S); }
      }
      // hover marker
      hovs[0].visible = hovs[1].visible = false;
      const hl = S.hover && hitsOf[S.hover];
      if (hl) for (let i = 0; i < hl.length && i < 2; i++) { const h = hl[i], z = h.userData.size; h.updateWorldMatrix(true, false); _m4.copy(g.matrixWorld).invert().multiply(h.matrixWorld); hovs[i].matrix.copy(_m4).multiply(_m5.makeScale(z[0], z[1], z[2])); hovs[i].visible = true; }
      // canvases: a quarter of the gauges per frame (~15 Hz each at 60 fps), plus the caution panel / radios / compass
      slot = (slot + 1) % 4;
      for (let i = slot; i < gauges.length; i += 4) { const G = gauges[i], cx = G.ctx; if (G.bg) { cx.clearRect(0, 0, G.W, G.W); cx.drawImage(G.bg, 0, 0); } G.dyn(cx, G.W, S, G); G.tex.needsUpdate = true; }
      if (slot === 0) drawCaut(pw ? S : NOCAUT); else if (slot === 1) drawCompass(S); else if (slot === 2 && pedPw !== pw) { pedPw = pw; drawPedB(pw); }
    },
  };
}
const NOCAUT = { cautions: [] };
const _e = new THREE.Vector3(); function V3e(x, y, z) { return _e.set(x, y, z); }
