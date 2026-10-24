// Crew stations in 3D. M60A3: the driver's compartment (three M27 periscopes, instrument panel with live gauges and
// warning lights, the T-bar steering control, accelerator and brake pedals, the range selector, parking brake, hull
// ammunition rack beside him), the gunner's station (M35E1 and TTS eyepieces, the TTS display panel, the M21 computer
// control panel with the range readout and the ammunition selector, the power control handles, manual handwheels, the
// M68 breech beside him) and the commander's M19 cupola (eight vision blocks, the M85 receiver, the override handle).
// M113A2: the driver (four periscopes, laterals, selector, instruments) and the troop compartment (two benches,
// eleven seated infantrymen, the ramp and its door, the cargo hatch, dome lights).
//
// The rooms are closed except at the vision devices: the camera sits inside and sees the world only through the
// periscope and vision-block windows (the exterior hull and turret lofts are convex, so from inside they are back
// faces and cull away). US tank interiors of the period: lusterless white above the turret ring, grey-green below.
import * as THREE from 'three';
import { rodGeo } from './tankmodel.js';

const TAU = Math.PI * 2, D2R = Math.PI / 180;
const SANS = 'Arial, "Liberation Sans", Helvetica, sans-serif';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// interior surfaces are lit through hatches and periscopes and by dome lights: self-lit Lambert like the Huey's
const M = (c, k = 0.55) => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(k), flatShading: true });
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

function canvasTex(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return { cv, ctx: cv.getContext('2d'), tex }; }
function txt(c, t, x, y, col, size, align = 'center', bold = true) { c.fillStyle = col; c.font = `${bold ? 'bold ' : ''}${Math.round(size)}px ${SANS}`; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(t, x, y); }
// a round gauge: o = { v0, v1, a0, a1 (deg, clockwise from 12), major, minor, labels: [[v, text]], bands: [[v0, v1, col]], title, unit }
function dial(c, W, o, value, flag) {
  const R = W / 2, map = v => o.a0 + clamp((v - o.v0) / (o.v1 - o.v0), -0.02, 1.03) * (o.a1 - o.a0), P2 = (r, a) => [R + Math.sin(a * D2R) * r, R - Math.cos(a * D2R) * r];
  c.clearRect(0, 0, W, W); c.fillStyle = '#0d0e0e'; c.beginPath(); c.arc(R, R, R, 0, TAU); c.fill();
  c.strokeStyle = '#3a3b38'; c.lineWidth = R * 0.06; c.beginPath(); c.arc(R, R, R * 0.97, 0, TAU); c.stroke();
  for (const [a, b, col] of o.bands || []) { c.strokeStyle = col; c.lineWidth = R * 0.09; c.beginPath(); c.arc(R, R, R * 0.8, (map(a) - 90) * D2R, (map(b) - 90) * D2R); c.stroke(); }
  for (let v = o.v0; v <= o.v1 + 1e-6; v += o.minor) {
    const maj = Math.abs(v / o.major - Math.round(v / o.major)) < 1e-4, [x0, y0] = P2(R * (maj ? 0.68 : 0.76), map(v)), [x1, y1] = P2(R * 0.88, map(v));
    c.strokeStyle = '#e8e6da'; c.lineWidth = maj ? R * 0.045 : R * 0.022; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  }
  for (const [v, t] of o.labels || []) { const [x, y] = P2(R * 0.5, map(v)); txt(c, t, x, y, '#e8e6da', R * 0.19); }
  if (o.title) txt(c, o.title, R, R * 1.42, '#cfcdbf', R * 0.13);
  if (o.unit) txt(c, o.unit, R, R * 0.66, '#cfcdbf', R * 0.11);
  if (o.odo != null) { c.fillStyle = '#000'; c.fillRect(R * 0.62, R * 1.2, R * 0.76, R * 0.22); txt(c, String(Math.floor(o.odo)).padStart(5, '0'), R, R * 1.31, '#e8e6da', R * 0.17, 'center', false); }
  if (flag) { txt(c, 'OFF', R, R * 1.15, '#d03020', R * 0.2); return; }
  const a = map(value); c.save(); c.translate(R, R); c.rotate(a * D2R); c.fillStyle = '#f2f0e4';
  c.beginPath(); c.moveTo(-R * 0.035, R * 0.15); c.lineTo(-R * 0.02, -R * 0.78); c.lineTo(0, -R * 0.86); c.lineTo(R * 0.02, -R * 0.78); c.lineTo(R * 0.035, R * 0.15); c.closePath(); c.fill(); c.restore();
  c.fillStyle = '#2a2b2c'; c.beginPath(); c.arc(R, R, R * 0.09, 0, TAU); c.fill();
}
function gauge(parent, size, o, x, y, z, rx = 0, ry = 0) {
  const t = canvasTex(128, 128), m = new THREE.Mesh(new THREE.CircleGeometry(size / 2, 24), new THREE.MeshBasicMaterial({ map: t.tex }));
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); parent.add(m);
  const bezel = new THREE.Mesh(new THREE.CylinderGeometry(size / 2 + 0.008, size / 2 + 0.008, 0.02, 20).rotateX(Math.PI / 2).translate(0, 0, -0.011), M(0x202120, 0.2)); m.add(bezel);
  return { t, o, draw(v, flag) { dial(t.ctx, 128, o, v, flag); t.tex.needsUpdate = true; } };
}
// a warning light: a small lens that glows when on
function lamp(parent, col, x, y, z, rx = 0, ry = 0, r = 0.012) {
  const off = new THREE.Color(col).multiplyScalar(0.25), on = new THREE.Color(col);
  const mat = new THREE.MeshBasicMaterial({ color: off }), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.012, 10).rotateX(Math.PI / 2), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); parent.add(m);
  return v => mat.color.copy(v ? on : off);
}
function label(parent, text, w, h, x, y, z, rx = 0, ry = 0, col = '#1a1a18', bg = null, px = 28) {
  const t = canvasTex(256, Math.round(256 * h / w)); const c = t.ctx; if (bg) { c.fillStyle = bg; c.fillRect(0, 0, t.cv.width, t.cv.height); }
  txt(c, text, t.cv.width / 2, t.cv.height / 2, col, px); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t.tex, transparent: !bg }));
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); parent.add(m); return m;
}
// a wall plate with rectangular window holes: corners in its own (u, v) plane; placed by a matrix
function plateWithHoles(w, h, holes, mat) {
  const s = new THREE.Shape(); s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.lineTo(-w / 2, -h / 2);
  for (const [cx, cy, hw, hh] of holes) { const p = new THREE.Path(); p.moveTo(cx - hw, cy - hh); p.lineTo(cx - hw, cy + hh); p.lineTo(cx + hw, cy + hh); p.lineTo(cx + hw, cy - hh); p.lineTo(cx - hw, cy - hh); s.holes.push(p); }
  return new THREE.Mesh(new THREE.ShapeGeometry(s), mat);
}
// a frame (4 bars) round a window, depth d toward -z of its plane
function windowFrame(parent, cx, cy, hw, hh, d, mat, plane) {
  const g = [box(hw * 2 + 0.03, 0.015, d, cx, cy + hh + 0.007, -d / 2), box(hw * 2 + 0.03, 0.015, d, cx, cy - hh - 0.007, -d / 2), box(0.015, hh * 2, d, cx - hw - 0.007, cy, -d / 2), box(0.015, hh * 2, d, cx + hw + 0.007, cy, -d / 2)];
  for (const geo of g) { const m = new THREE.Mesh(geo, mat); plane.add(m); }
}

// ====================================================================================================== M60A3
export function buildTankInterior() {
  const white = M(0xd9d6c8, 0.5), grey = M(0x6c6e66, 0.45), dark = M(0x2c2d2a, 0.35), olive = M(0x4c5236, 0.45), black = M(0x141414, 0.2), red = M(0xa01c12, 0.4), brass = M(0x9c7a3a, 0.45), seatM = M(0x3b3e30, 0.4), metal = M(0x8a8c86, 0.4), periM = M(0x5a5f48, 0.45);
  const g = new THREE.Group(); g.name = 'tankInterior'; g.visible = false;
  // ------------------------------------------------------------------------------------------- driver's compartment
  // eye (0, 1.62, -2.05). Room x -0.78..0.78, floor 0.56, roof 1.80; the periscope wall at z -2.30 (three windows)
  const D = new THREE.Group(); D.name = 'driverStation'; g.add(D);
  const add = (geo, m, p = D) => { const o = new THREE.Mesh(geo, m); p.add(o); return o; };
  const FL = 0.56, RF = 1.80, ZW = -2.30, ZB = -1.35, XW = 0.8;
  // periscope wall with three windows (the M27s' lower windows), angled out like the heads
  const winY = 1.635, winH = 0.05, winW = 0.08;
  const pw = plateWithHoles(1.6, 0.36, [[-0.27, winY - 1.62, winW, winH], [0, winY - 1.62, winW, winH], [0.27, winY - 1.62, winW, winH]], white);
  pw.position.set(0, 1.62, ZW); D.add(pw);
  for (const x of [-0.27, 0, 0.27]) { const fr = new THREE.Group(); fr.position.set(x, winY, ZW + 0.001); D.add(fr); windowFrame(fr, 0, 0, winW, winH, 0.06, black, fr); add(box(0.19, 0.028, 0.06, x, winY + 0.066, ZW + 0.03), periM); add(box(0.19, 0.022, 0.06, x, winY - 0.063, ZW + 0.03), periM); add(box(0.15, 0.022, 0.035, x, winY + 0.093, ZW + 0.065), black); }   // the M27s: slim olive bodies, a rubber brow pad above each
  // glacis inner face below the periscopes, sloping forward-down toward the nose (the driver's legs go under it)
  add(rodGeo(new THREE.Vector3(0, 1.44, ZW), new THREE.Vector3(0, 0.62, -3.1), 1.6, 0.04), white);
  add(box(1.6, 0.04, 1.0, 0, RF, (ZW + ZB) / 2), white);                                   // roof
  add(box(1.6, 0.04, 1.6, 0, FL, -2.1), olive);                                             // floor
  // walls. QA (ngc/qa-units): ahead of the periscope wall only up to the glacis top (1.44): full-height walls ran on to
  // z -3.1 and filled the left and right M27 windows with flat white
  for (const s of [-1, 1]) { add(box(0.04, RF - FL, ZB - ZW, s * XW, (RF + FL) / 2, (ZW + ZB) / 2), white); add(box(0.04, 1.44 - FL, ZW + 3.1, s * XW, (1.44 + FL) / 2, (ZW - 3.1) / 2), white); }
  add(box(1.6, RF - FL, 0.04, 0, (RF + FL) / 2, ZB), grey);                                 // turret basket wall behind
  add(box(1.6, 0.36, 0.04, 0, 1.62, ZW - 0.0), white).visible = false;
  // hatch ring and the hatch underside with its lever
  add(new THREE.TorusGeometry(0.3, 0.025, 6, 20).rotateX(Math.PI / 2).translate(0, RF - 0.03, -2.0), metal);
  add(box(0.22, 0.03, 0.04, 0.12, RF - 0.06, -1.86), red);
  // seat
  add(box(0.48, 0.09, 0.46, 0, 1.0, -1.72), seatM); add(box(0.48, 0.5, 0.08, 0, 1.28, -1.48), seatM); add(box(0.08, 0.42, 0.08, 0, 0.78, -1.72), metal);
  // hull ammunition rack to the right: rows of round bases (brass) in tubes
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) { add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12).rotateX(Math.PI / 2).translate(0.48 + k * 0.0, 0.75 + r * 0.14, -1.95 - k * 0.0 + (k - 1.5) * 0.14), brass); }
  add(box(0.06, 0.62, 0.6, 0.42, 0.95, -1.95), grey);
  add(box(0.36, 0.62, 0.62, 0.62, 0.95, -1.96), dark);
  // instrument panel to the left front, angled toward the eye
  const IP = new THREE.Group(); IP.position.set(-0.5, 1.33, -2.12); IP.rotation.set(-0.35, 0.62, 0, 'YXZ'); D.add(IP);
  add(box(0.5, 0.36, 0.03, 0, 0, -0.016), dark, IP);
  const gS = gauge(IP, 0.105, { v0: 0, v1: 50, a0: -135, a1: 135, major: 10, minor: 5, labels: [[0, '0'], [10, '10'], [20, '20'], [30, '30'], [40, '40'], [50, '50']], title: 'SPEED', unit: 'MPH', bands: [[30, 50, '#c8a020']] }, -0.12, 0.07, 0.002);
  const gT = gauge(IP, 0.105, { v0: 0, v1: 30, a0: -135, a1: 135, major: 5, minor: 1, labels: [[0, '0'], [5, '5'], [10, '10'], [15, '15'], [20, '20'], [25, '25'], [30, '30']], title: 'RPM x100', bands: [[24, 30, '#c02818']] }, 0.06, 0.07, 0.002);
  const gO = gauge(IP, 0.07, { v0: 0, v1: 100, a0: -120, a1: 120, major: 20, minor: 10, labels: [[0, '0'], [50, '50'], [100, '100']], title: 'OIL PSI', bands: [[0, 15, '#c02818']] }, -0.17, -0.09, 0.002);
  const gE = gauge(IP, 0.07, { v0: 100, v1: 350, a0: -120, a1: 120, major: 50, minor: 25, labels: [[100, '100'], [200, '200'], [300, '300']], title: 'OIL TEMP', bands: [[290, 350, '#c02818']] }, -0.07, -0.09, 0.002);
  const gF = gauge(IP, 0.07, { v0: 0, v1: 1, a0: -90, a1: 90, major: 0.25, minor: 0.125, labels: [[0, 'E'], [0.5, '1/2'], [1, 'F']], title: 'FUEL' }, 0.03, -0.09, 0.002);
  const gV = gauge(IP, 0.07, { v0: 16, v1: 32, a0: -90, a1: 90, major: 4, minor: 2, labels: [[16, '16'], [24, '24'], [32, '32']], title: 'VOLTS', bands: [[16, 22, '#c02818'], [22, 26, '#c8a020'], [26, 30, '#2a9a3a']] }, 0.13, -0.09, 0.002);
  const lOil = lamp(IP, 0xff3020, -0.2, 0.15, 0.004), lGen = lamp(IP, 0xffa020, -0.15, 0.15, 0.004), lPark = lamp(IP, 0xff3020, -0.1, 0.15, 0.004), lMaster = lamp(IP, 0x30ff40, 0.18, 0.15, 0.004), lHot = lamp(IP, 0xff3020, -0.05, 0.15, 0.004);
  [['OIL', -0.2], ['GEN', -0.15], ['PARK', -0.1], ['TEMP', -0.05], ['MASTER', 0.18]].forEach(([t, x]) => label(IP, t, 0.06, 0.016, x, 0.128, 0.003, 0, 0, '#d8d6c8', null, 60));
  // master switch, start button, fire extinguisher pulls
  // (the MASTER switch and the START button: armorstations.js, with their hit boxes)
  for (const x of [-0.6, -0.68]) add(box(0.05, 0.07, 0.03, x, 1.2, -1.7), red);
  label(D, 'FIRE', 0.1, 0.03, -0.64, 1.27, -1.69, 0, 0, '#f0e8d0', '#a01c12', 30);
  // T-bar steering control: column from the floor, the bar rotates with the steer input
  add(new THREE.CylinderGeometry(0.03, 0.035, 0.6, 8).rotateX(0.55).translate(0, 1.0, -2.28), metal);
  const tbar = new THREE.Group(); tbar.position.set(0, 1.25, -2.12); D.add(tbar);
  tbar.add(new THREE.Mesh(box(0.56, 0.035, 0.035), dark)); for (const s of [-1, 1]) tbar.add(new THREE.Mesh(box(0.05, 0.12, 0.05, s * 0.28, 0, 0), black));
  // pedals: accelerator (right), brake (left)
  const accel = new THREE.Group(); accel.position.set(0.16, 0.66, -2.45); D.add(accel); accel.add(new THREE.Mesh(box(0.09, 0.02, 0.2, 0, 0, -0.08), metal));
  const brake = new THREE.Group(); brake.position.set(-0.16, 0.68, -2.45); D.add(brake); brake.add(new THREE.Mesh(box(0.13, 0.025, 0.12, 0, 0, -0.06), metal));
  // range selector quadrant (right of the T-bar) and parking brake handle (left)
  const QD = new THREE.Group(); QD.position.set(0.32, 1.08, -2.0); QD.rotation.x = -0.4; D.add(QD);
  QD.add(new THREE.Mesh(box(0.08, 0.02, 0.2), dark)); label(QD, 'R  N  L  H', 0.18, 0.03, 0, 0.012, 0, -Math.PI / 2, Math.PI / 2, '#e8e4d0', null, 34);
  const lever = new THREE.Group(); lever.position.set(0.32, 1.08, -2.0); D.add(lever);
  lever.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.16, 6).translate(0, 0.08, 0), metal), new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6).translate(0, 0.17, 0), black));
  const park = new THREE.Group(); park.position.set(-0.45, 0.85, -1.85); D.add(park); park.add(new THREE.Mesh(box(0.03, 0.3, 0.03, 0, 0.15, 0), metal), new THREE.Mesh(box(0.08, 0.03, 0.03, 0, 0.3, 0), red));
  // ------------------------------------------------------------------------------------------- gunner's station
  // turret frame (ring centre origin, rotates with the turret). The gunner sits right of the gun, low and forward; his
  // eye at GUNNER_EYE_T (0.52, 0.55, -0.62) when he sits back from the sight. Closed room: no windows (the sights are the
  // gunner's windows; in the sight he sees the full-screen sight picture).
  const GU = new THREE.Group(); GU.name = 'gunnerStation'; GU.visible = false;
  const ga = (geo, m, p = GU) => { const o = new THREE.Mesh(geo, m); p.add(o); return o; };
  // the whole fighting compartment is one room: roof, curved cast walls (as flat slants), the bustle behind
  ga(box(2.4, 0.04, 3.4, 0, 0.97, 0.3), white);                            // turret roof (to the bustle's rear wall)
  ga(box(0.04, 1.6, 3.2, 1.2, 0.2, 0.4), white); ga(box(0.04, 1.6, 3.2, -1.2, 0.2, 0.4), white);   // side walls
  { const fw = ga(box(1.3, 1.6, 0.04, 0.6, 0.2, -1.22), white); fw.rotation.y = -0.35; }   // front walls either side of the gun
  { const fw = ga(box(1.3, 1.6, 0.04, -0.6, 0.2, -1.22), white); fw.rotation.y = 0.35; }
  ga(box(0.9, 1.6, 0.04, 0, 0.2, -1.0), grey);                             // the gun shield's inner face round the trunnions
  ga(box(2.4, 1.6, 0.04, 0, 0.2, 1.98), white);                            // bustle rear wall
  ga(box(2.4, 0.04, 2.0, 0, -0.62, -0.3), olive); ga(box(2.4, 0.04, 0.9, 0, 0.3, 1.55), grey);   // basket floor; the bustle's raised floor                           // turret basket floor at knee level (legs below)
  // the bustle ready rack: rows of round bases (brass) facing the loader, the radio above
  // (the round bases themselves: armorstations.js, painted by type and taken out as the rack empties)
  ga(box(1.6, 0.4, 0.42, 0, 0.55, 1.73), dark);
  ga(box(0.8, 0.22, 0.25, 0.1, 0.86, 1.8), olive); label(GU, 'AN/VRC-12', 0.3, 0.05, 0.1, 0.86, 1.67, 0, Math.PI, '#d8d6c8', null, 40);
  ga(box(0.36, 0.06, 0.36, -0.65, -0.15, 0.1), seatM);                     // loader's seat (folded down)
  // the M68's breech on the left, the recoil guard, the coax M240 with its ammunition box
  const breech = new THREE.Group(); breech.position.set(0, 0.38, -0.25); GU.add(breech);
  breech.add(new THREE.Mesh(box(0.44, 0.44, 0.52), metal), new THREE.Mesh(box(0.46, 0.14, 0.2, 0, 0.22, 0.12), dark), new THREE.Mesh(box(0.08, 0.3, 0.08, -0.26, 0, 0.1), dark));
  breech.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 14).rotateX(Math.PI / 2).translate(0, 0, 0.27), black));   // chamber (with a round loaded: brass)
  const roundBase = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.01, 14).rotateX(Math.PI / 2).translate(0, 0, 0.281), brass); breech.add(roundBase);
  ga(box(0.05, 0.5, 0.9, 0.3, 0.3, 0.15), metal);                          // recoil guard
  ga(box(0.1, 0.12, 0.6, 0.38, 0.4, -0.78), dark); ga(box(0.16, 0.16, 0.24, 0.42, 0.32, -0.45), olive);   // coax M240 + ammo box
  // the sight: TTS / M35E1 eyepiece with a rubber eyeguard, the TTS display housing above; the M105D telescope left
  ga(box(0.3, 0.26, 0.36, 0.55, 0.78, -0.95), dark);
  ga(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 12).rotateX(Math.PI / 2).translate(0.52, 0.58, -0.8), black);
  ga(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 10).rotateX(Math.PI / 2).translate(0.28, 0.5, -0.95), dark);
  ga(new THREE.CylinderGeometry(0.03, 0.04, 0.08, 10).rotateX(Math.PI / 2).translate(0.28, 0.5, -0.62), black);
  ga(box(0.14, 0.24, 0.12, 0.52, 0.7, -0.85), dark);
  // power control handle (the "Cadillacs"): a yoke on a pedestal that turns with traverse and tilts with elevation
  ga(new THREE.CylinderGeometry(0.035, 0.05, 0.4, 8).translate(0.52, 0.0, -0.68), metal);
  const pch = new THREE.Group(); pch.position.set(0.52, 0.22, -0.66); GU.add(pch);
  pch.add(new THREE.Mesh(box(0.34, 0.05, 0.06), dark)); for (const s of [-1, 1]) { pch.add(new THREE.Mesh(box(0.05, 0.15, 0.06, s * 0.17, 0.06, 0), black)); pch.add(new THREE.Mesh(box(0.02, 0.04, 0.03, s * 0.17, 0.06, -0.045), red)); }
  // manual handwheels: traverse (right, flat) and elevation (left, upright)
  ga(new THREE.TorusGeometry(0.1, 0.012, 6, 16).rotateX(Math.PI / 2).translate(0.9, -0.15, -0.6), metal);
  ga(new THREE.TorusGeometry(0.09, 0.012, 6, 16).rotateY(Math.PI / 2).translate(0.27, 0.0, -0.55), metal);
  // M21 computer control panel on the right wall: range readout, ammunition selector, lights; TTS / stab panel
  const CP = new THREE.Group(); CP.position.set(1.12, 0.48, -0.55); CP.rotation.y = -Math.PI / 2 + 0.25; GU.add(CP);
  CP.add(new THREE.Mesh(box(0.42, 0.3, 0.04, 0, 0, -0.02), dark));
  const cpTex = canvasTex(256, 184); const cpFace = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.288), new THREE.MeshBasicMaterial({ map: cpTex.tex })); cpFace.position.z = 0.001; CP.add(cpFace);
  // gunner's seat and back rest
  ga(box(0.36, 0.06, 0.36, 0.55, -0.2, -0.3), seatM); ga(box(0.36, 0.36, 0.06, 0.55, 0.0, -0.1), seatM);
  g.userData.gunner = GU;
  function drawCP(V) {
    const c = cpTex.ctx, W = 256, H = 184; c.fillStyle = '#2a2c27'; c.fillRect(0, 0, W, H);
    txt(c, 'COMPUTER  M21', W / 2, 14, '#d8d6c6', 12);
    c.fillStyle = '#080808'; c.fillRect(30, 26, 196, 46);
    const r = V.laser.range != null ? String(V.laser.range).padStart(4, '0') : V.fc.battlesight ? '1200' : '----';
    txt(c, r, W / 2, 50, '#ff3a1a', 38, 'center', false);
    const sel = V.gun.round || V.next;
    ['M735', 'M456', 'M393'].forEach((id, i) => { const x = 50 + i * 78; c.fillStyle = sel === id ? '#ffd040' : '#3c3c30'; c.beginPath(); c.arc(x, 96, 9, 0, TAU); c.fill(); txt(c, ['SABOT', 'HEAT', 'HEP'][i], x, 116, '#d8d6c6', 12); });
    const lamps = [['COMP', V.fc.solved ? '#40ff40' : '#204020'], ['LASER', V.laser.ready ? '#40ff40' : '#204020'], ['READY', V.gun.state === 'ready' ? '#ffb030' : '#403010'], ['STAB', V.stab && V.hydP > 0.5 ? '#40ff40' : '#204020'], ['TTS', V.ttsCool > 0.95 ? '#40ff40' : V.ttsCool > 0 ? '#c0c020' : '#204020']];
    lamps.forEach(([t, col], i) => { const x = 28 + i * 50; c.fillStyle = col; c.beginPath(); c.arc(x, 148, 8, 0, TAU); c.fill(); txt(c, t, x, 168, '#d8d6c6', 11); });
    cpTex.tex.needsUpdate = true;
  }
  // ------------------------------------------------------------------------------------------- commander's cupola
  // the cupola frame (rotates with the cupola / .50). A closed drum with eight vision-block windows; the M85's
  // receiver, the sight periscope, the hatch above.
  const CU = new THREE.Group(); CU.name = 'commanderStation'; CU.visible = false;
  {
    const R = 0.44, y0 = -0.35, y1 = 0.42, wy0 = 0.13, wy1 = 0.21, half = 0.13, pos = [];
    const quad = (a0, a1, ya, yb) => { const p = (a, y) => [Math.sin(a) * R, y, -Math.cos(a) * R]; const A = p(a0, ya), B = p(a1, ya), C = p(a1, yb), D2 = p(a0, yb); pos.push(...A, ...C, ...B, ...A, ...D2, ...C); };
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU + Math.PI / 8, n0 = a + half, n1 = a + TAU / 8 - half;
      quad(a - half, a + half, y0, wy0); quad(a - half, a + half, wy1, y1);       // below / above the window
      for (let s = 0; s < 3; s++) quad(n0 + (n1 - n0) * s / 3, n0 + (n1 - n0) * (s + 1) / 3, y0, y1);
      const fr = new THREE.Mesh(box(0.15, 0.1, 0.06, 0, 0, 0), black); fr.position.set(Math.sin(a) * (R - 0.02), (wy0 + wy1) / 2, -Math.cos(a) * (R - 0.02)); fr.rotation.y = -a; CU.add(fr);
      // the frame is a box with the window through it: replace by four bars
      fr.geometry = new THREE.BufferGeometry().copy(box(0.001, 0.001, 0.001));
      const bars = [box(0.17, 0.02, 0.07, 0, 0.05, 0), box(0.17, 0.02, 0.07, 0, -0.05, 0), box(0.02, 0.1, 0.07, 0.085, 0, 0), box(0.02, 0.1, 0.07, -0.085, 0, 0)];
      for (const b of bars) { const m = new THREE.Mesh(b, black); fr.add(m); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
    CU.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xd9d6c8, emissive: 0x6c6b64, side: THREE.DoubleSide, flatShading: true })));
    CU.add(new THREE.Mesh(new THREE.CircleGeometry(R, 24).rotateX(Math.PI / 2).translate(0, y1, 0), white));      // hatch underside
    CU.add(new THREE.Mesh(new THREE.CircleGeometry(R, 24).rotateX(-Math.PI / 2).translate(0, y0, 0), dark));      // looking down into the turret
    // the M85 receiver hung under the cupola roof, its feed tray and ammo can; the sight periscope ahead
    CU.add(new THREE.Mesh(box(0.14, 0.11, 0.18, -0.34, 0.3, 0.06), olive));   // the .50 ammunition can (the receiver is the exterior mount, in the cupola)
    CU.add(new THREE.Mesh(box(0.1, 0.08, 0.08, 0.22, 0.31, -0.33), dark));
    CU.add(new THREE.Mesh(box(0.04, 0.04, 0.1, 0.3, 0.08, -0.24), red));   // the override handle (above the turret roof line: the roof hides anything lower)
  }
  g.userData.commander = CU;
  // ------------------------------------------------------------------------------------------- update
  let k = 0, odo = 0;
  const gaugeList = [gS, gT, gO, gE, gF, gV];
  const update = (V, IN, dt) => {
    const fm = V.fm, e = fm.eng, el = V.elec;
    odo += Math.abs(fm.out.fwd) * dt / 1609.34;
    gS.o.odo = 1824 + odo;
    // draw two gauges per frame (round-robin)
    for (let n = 0; n < 2; n++) {
      const G = gaugeList[k++ % gaugeList.length];
      if (G === gS) G.draw(Math.abs(fm.out.fwd) * 2.237); else if (G === gT) G.draw(e.w * 9.549 / 100);
      else if (G === gO) G.draw(e.running ? 30 + 45 * Math.min(1, e.w * 9.549 / 2400) : 0); else if (G === gE) G.draw(140 + (e.temp - 30) * 2.4);
      else if (G === gF) G.draw(e.fuel / fm.P.FUEL_L, !el.master); else if (G === gV) G.draw(el.volts);
    }
    lOil(e.oilP < 0.3 && el.master); lGen(!el.gen && el.master); lPark(IN.park); lMaster(el.master); lHot(e.temp > 110);
    tbar.rotation.z = -(fm.ctl.steer || 0) * 0.45;
    accel.rotation.x = (fm.ctl.throttle || 0) * 0.35; brake.rotation.x = (fm.ctl.brake || 0) * 0.4;
    lever.rotation.x = ({ R: -0.45, N: -0.15, L: 0.15, H: 0.45 })[fm.range] ?? 0;
    park.rotation.x = IN.park ? -0.5 : 0;
    // gunner: handles, breech recoil and the round in the chamber, the computer panel (every third frame)
    pch.rotation.y = -(IN.trav || 0) * 0.35; pch.rotation.x = -(IN.elev || 0) * 0.3;
    breech.position.z = -0.25 + (V.gun.recoil || 0); roundBase.visible = V.gun.state === 'ready';
    if (GU.visible && (k % 3 === 0)) drawCP(V);
  };
  return { group: g, driver: D, gunner: GU, commander: CU, panel: IP, update };
}

// ====================================================================================================== shared
// a drum wall (inward facing) round a vertical axis at (cx, cz): angles from aStart to aEnd (0 = forward, -z; + = to
// the right / clockwise from above), with window gaps { a, half, y0, y1 }; frames as bars round each window.
function drumWall(cx, cz, R, y0, y1, aStart, aEnd, windows, mat, frameMat) {
  const pos = [], g = new THREE.Group();
  const p = (a, y) => [cx + Math.sin(a) * R, y, cz - Math.cos(a) * R];
  const quad = (a0, a1, ya, yb) => { const A = p(a0, ya), B = p(a1, ya), C = p(a1, yb), D = p(a0, yb); pos.push(...A, ...C, ...B, ...A, ...D, ...C); };
  const cuts = windows.slice().sort((u, v) => u.a - v.a);
  let a = aStart;
  const span = (a0, a1) => { const n = Math.max(1, Math.ceil((a1 - a0) / 0.2)); for (let i = 0; i < n; i++) quad(a0 + (a1 - a0) * i / n, a0 + (a1 - a0) * (i + 1) / n, y0, y1); };
  for (const w of cuts) {
    if (w.a - w.half > a) span(a, w.a - w.half);
    quad(w.a - w.half, w.a + w.half, y0, w.y0); quad(w.a - w.half, w.a + w.half, w.y1, y1);
    const fr = new THREE.Group(); const c = p(w.a, (w.y0 + w.y1) / 2); fr.position.set(c[0], c[1], c[2]); fr.rotation.y = -w.a; g.add(fr);
    const hw = Math.sin(w.half) * R, hh = (w.y1 - w.y0) / 2;
    for (const b of [box(hw * 2 + 0.03, 0.02, 0.07, 0, hh + 0.01, -0.03), box(hw * 2 + 0.03, 0.02, 0.07, 0, -hh - 0.01, -0.03), box(0.02, hh * 2, 0.07, hw + 0.01, 0, -0.03), box(0.02, hh * 2, 0.07, -hw - 0.01, 0, -0.03)]) fr.add(new THREE.Mesh(b, frameMat));
    a = w.a + w.half;
  }
  if (aEnd > a) span(a, aEnd);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
  const mm = mat.clone(); mm.side = THREE.DoubleSide; g.add(new THREE.Mesh(geo, mm));
  return g;
}
// a seated 1980 infantryman (OG-107 fatigues, M1 helmet with a cover, LBE, M16A1 between the knees), facing +z in his
// own frame, seat surface at y = 0. Merged, vertex-coloured.
function soldierGeo(seed = 0) {
  const parts = [], col = (g, c) => { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); };
  const og = 0x5b5f40, ogD = 0x4c5034, skin = [0xc89a78, 0x8a5a3c, 0xd8b090, 0x6a4430][seed % 4], helm = 0x4a5032, boot = 0x161412, web = 0x5a5838;
  col(box(0.36, 0.5, 0.22, 0, 0.42, -0.04), og);
  col(box(0.38, 0.1, 0.24, 0, 0.22, -0.04), web);
  col(box(0.12, 0.42, 0.06, -0.12, 0.42, 0.08), web); col(box(0.12, 0.42, 0.06, 0.12, 0.42, 0.08), web);
  col(new THREE.SphereGeometry(0.1, 8, 6).translate(0, 0.79, 0.0), skin);
  col(new THREE.SphereGeometry(0.135, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1.05).translate(0, 0.81, -0.01), helm);
  for (const s of [-1, 1]) {
    col(box(0.14, 0.13, 0.42, s * 0.1, 0.05, 0.19), ogD);
    col(box(0.13, 0.34, 0.13, s * 0.1, -0.16, 0.38), ogD);
    col(box(0.12, 0.1, 0.24, s * 0.1, -0.33, 0.43), boot);
    col(box(0.09, 0.32, 0.1, s * 0.22, 0.48, 0.02), og);
    col(box(0.08, 0.08, 0.28, s * 0.17, 0.3, 0.16), og);
  }
  col(box(0.028, 0.74, 0.045, 0.0, 0.2, 0.36), 0x202020);    // M16A1 upright between the knees: barrel and receiver
  col(box(0.026, 0.14, 0.05, 0.0, 0.02, 0.41), 0x202020);    // magazine
  col(box(0.03, 0.03, 0.03, 0.0, 0.58, 0.36), 0x2a2a2a);     // front sight block
  col(box(0.04, 0.16, 0.07, 0.0, -0.22, 0.36), 0x202020);    // stock on the floor
  const g = new THREE.BufferGeometry(); let n = 0; for (const p of parts) n += p.attributes.position.count;
  const P = new Float32Array(n * 3), C = new Float32Array(n * 3); let o = 0;
  for (const p of parts) { P.set(p.attributes.position.array, o * 3); C.set(p.attributes.color.array, o * 3); o += p.attributes.position.count; }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.computeVertexNormals();
  return g;
}

// ====================================================================================================== M113A2
export const M113_EYES = { driver: [-0.62, 1.6, -1.42], troops: [0.0, 1.3, 2.05], commander: [0.25, 1.95, -0.35] };
export function buildM113Interior() {
  const white = M(0xd4d4c4, 0.5), grey = M(0x6c6e66, 0.45), dark = M(0x2c2d2a, 0.35), olive = M(0x4c5236, 0.45), black = M(0x141414, 0.2), red = M(0xa01c12, 0.4), metal = M(0x8a8c86, 0.4), canvasM = M(0x5a5a3c, 0.45);
  const g = new THREE.Group(); g.name = 'm113Interior';
  const add = (geo, m, p = g) => { const o = new THREE.Mesh(geo, m); p.add(o); return o; };
  // ------------------------------------------------------------------------------- driver (front left)
  const D = new THREE.Group(); D.name = 'driverStation'; D.visible = false; g.add(D);
  const da = (geo, m) => add(geo, m, D);
  const hc = [-0.62, -1.35];
  D.add(drumWall(hc[0], hc[1], 0.31, 1.5, 1.84, -1.6, 1.6, [-0.9, -0.3, 0.3, 0.9].map(a => ({ a, half: 0.2, y0: 1.6, y1: 1.67 })), white, black));
  da(new THREE.CircleGeometry(0.31, 20).rotateX(Math.PI / 2).translate(hc[0], 1.84, hc[1]), white);
  da(rodGeo(new THREE.Vector3(-0.62, 1.5, -1.62), new THREE.Vector3(-0.62, 0.7, -2.35), 1.1, 0.04), white);
  da(box(1.1, 0.04, 0.6, -0.62, 1.82, -1.1), white);
  da(box(0.04, 1.3, 1.4, -1.2, 1.2, -1.6), white); da(box(0.04, 1.3, 1.4, -0.06, 1.2, -1.6), grey);
  da(box(1.15, 0.04, 1.4, -0.62, 0.58, -1.6), olive); da(box(1.15, 1.3, 0.04, -0.62, 1.2, -0.9), grey);
  const lat = [-0.78, -0.46].map(x => { const l = new THREE.Group(); l.position.set(x, 0.62, -1.95); D.add(l); l.add(new THREE.Mesh(box(0.03, 0.72, 0.03, 0, 0.36, 0), metal), new THREE.Mesh(box(0.05, 0.12, 0.05, 0, 0.74, 0), black)); return l; });
  const sel = new THREE.Group(); sel.position.set(-0.25, 0.95, -1.75); D.add(sel); sel.add(new THREE.Mesh(box(0.02, 0.22, 0.02, 0, 0.11, 0), metal), new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6).translate(0, 0.23, 0), black));
  label(D, 'R N 1 1-2 1-3', 0.2, 0.03, -0.25, 0.94, -1.75, -Math.PI / 2, 0, '#e8e4d0', '#2c2d2a', 30);
  const acc = new THREE.Group(); acc.position.set(-0.48, 0.66, -2.1); D.add(acc); acc.add(new THREE.Mesh(box(0.08, 0.02, 0.18, 0, 0, -0.07), metal));
  const IP = new THREE.Group(); IP.position.set(-1.05, 1.32, -1.78); IP.rotation.set(-0.25, 1.0, 0, 'YXZ'); D.add(IP);
  add(box(0.44, 0.32, 0.03, 0, 0, -0.016), dark, IP);
  const gS = gauge(IP, 0.095, { v0: 0, v1: 50, a0: -135, a1: 135, major: 10, minor: 5, labels: [[0, '0'], [10, '10'], [20, '20'], [30, '30'], [40, '40'], [50, '50']], title: 'SPEED', unit: 'MPH' }, -0.1, 0.06, 0.002);
  const gT = gauge(IP, 0.095, { v0: 0, v1: 35, a0: -135, a1: 135, major: 5, minor: 1, labels: [[0, '0'], [10, '10'], [20, '20'], [30, '30']], title: 'RPM x100', bands: [[28, 35, '#c02818']] }, 0.08, 0.06, 0.002);
  const gO = gauge(IP, 0.065, { v0: 0, v1: 80, a0: -120, a1: 120, major: 20, minor: 10, labels: [[0, '0'], [40, '40'], [80, '80']], title: 'OIL PSI' }, -0.14, -0.09, 0.002);
  const gW = gauge(IP, 0.065, { v0: 100, v1: 250, a0: -120, a1: 120, major: 50, minor: 25, labels: [[100, '100'], [175, '175'], [250, '250']], title: 'WATER', bands: [[215, 250, '#c02818']] }, -0.05, -0.09, 0.002);
  const gF = gauge(IP, 0.065, { v0: 0, v1: 1, a0: -90, a1: 90, major: 0.25, minor: 0.125, labels: [[0, 'E'], [1, 'F']], title: 'FUEL' }, 0.04, -0.09, 0.002);
  const gV = gauge(IP, 0.065, { v0: 16, v1: 32, a0: -90, a1: 90, major: 4, minor: 2, labels: [[16, '16'], [24, '24'], [32, '32']], title: 'VOLTS', bands: [[16, 22, '#c02818'], [26, 30, '#2a9a3a']] }, 0.13, -0.09, 0.002);
  const lB1 = lamp(IP, 0x30ff40, -0.16, 0.14, 0.004), lB2 = lamp(IP, 0x30ff40, -0.11, 0.14, 0.004), lOil = lamp(IP, 0xff3020, 0.1, 0.14, 0.004), lGen = lamp(IP, 0xffa020, 0.15, 0.14, 0.004);
  [['BILGE 1', -0.16], ['BILGE 2', -0.11], ['OIL', 0.1], ['GEN', 0.15]].forEach(([t, x]) => label(IP, t, 0.06, 0.016, x, 0.118, 0.003, 0, 0, '#d8d6c8', null, 52));
  // ------------------------------------------------------------------------------- troop compartment
  const C = new THREE.Group(); C.name = 'troopCompartment'; C.visible = false; g.add(C);
  const ca = (geo, m) => add(geo, m, C);
  ca(box(2.36, 0.04, 1.75, 0, 1.8, -0.15), white);
  ca(box(0.04, 1.34, 3.3, -1.2, 1.14, 0.75), white); ca(box(0.04, 1.34, 3.3, 1.2, 1.14, 0.75), white);
  ca(box(2.36, 0.04, 3.3, 0, 0.48, 0.75), M(0x3a3c34, 0.4));
  ca(box(2.36, 1.26, 0.04, 0, 1.19, -0.9), grey);
  const soldiers = [];
  const solGeo = [0, 1, 2, 3].map(soldierGeo), solMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x2a2a20 });
  for (const s of [-1, 1]) {
    ca(box(0.4, 0.06, 2.5, s * 0.97, 0.81, 0.95), canvasM); ca(box(0.04, 0.45, 2.5, s * 1.16, 1.12, 0.95), canvasM);
    for (let k = 0; k < 5; k++) ca(box(0.03, 0.3, 0.03, s * 0.8, 0.64, -0.15 + k * 0.55), metal);
    for (let k = 0; k < 5; k++) {
      const m = new THREE.Mesh(solGeo[(k + (s > 0 ? 2 : 0)) % 4], solMat); m.position.set(s * 0.98, 0.84, -0.05 + k * 0.5); m.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; C.add(m); soldiers.push(m);
    }
  }
  { const m = new THREE.Mesh(solGeo[1], solMat); m.position.set(-0.5, 0.84, -0.55); m.rotation.y = Math.PI; C.add(m); soldiers.push(m); ca(box(0.42, 0.06, 0.4, -0.5, 0.81, -0.5), canvasM); }
  const dome = [-0.4, 1.0].map(z => { const mm = new THREE.MeshBasicMaterial({ color: 0xfff4d8 }); C.add(new THREE.Mesh(box(0.12, 0.04, 0.12, 0, 1.77, z), mm)); return mm; });
  ca(box(0.5, 0.35, 0.3, 0.75, 1.55, -0.68), dark); label(C, 'AN/VRC-46', 0.2, 0.04, 0.75, 1.55, -0.52, 0, 0, '#d8d6c8', null, 40);
  ca(box(0.25, 0.25, 0.4, 1.0, 1.65, 2.0), olive); ca(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 10).translate(-1.08, 1.45, -0.6), red);
  for (let k = 0; k < 4; k++) ca(box(0.1, 0.18, 0.28, -0.5 + k * 0.13, 0.66, 2.1), M(0x4a4a30, 0.45));
  // the ramp's inner face (add to the ramp group: it opens with it) and the cargo hatch underside (add to the hatch)
  const rampIn = new THREE.Group(); rampIn.add(new THREE.Mesh(box(1.86, 1.3, 0.04, 0, 0.65, -0.05), white), new THREE.Mesh(box(0.6, 1.0, 0.03, 0.42, 0.72, -0.08), grey), new THREE.Mesh(box(0.05, 0.12, 0.04, 0.18, 0.75, -0.1), red));
  const cargoIn = new THREE.Group(); cargoIn.add(new THREE.Mesh(box(1.6, 0.04, 1.45, 0, -0.04, -0.72), white));
  C.add(new THREE.Mesh(box(2.36, 0.04, 0.45, 0, 1.8, 2.15), white));
  let k = 0, odo = 0; const gl = [gS, gT, gO, gW, gF, gV];
  const update = (V, IN, dt) => {
    const fm = V.fm, e = fm.eng;
    odo += Math.abs(fm.out.fwd) * dt / 1609.34; gS.o.odo = 4416 + odo;
    if (D.visible) for (let n = 0; n < 2; n++) {
      const G = gl[k++ % gl.length];
      if (G === gS) G.draw(Math.abs(fm.out.fwd) * 2.237); else if (G === gT) G.draw(e.w * 9.549 / 100); else if (G === gO) G.draw(e.running ? 20 + 35 * Math.min(1, e.w * 9.549 / 2800) : 0);
      else if (G === gW) G.draw(120 + (e.temp - 30) * 1.6); else if (G === gF) G.draw(e.fuel / fm.P.FUEL_L); else if (G === gV) G.draw(V.elec.volts);
    }
    lB1(fm.water.pumps); lB2(fm.water.pumps); lOil(e.oilP < 0.3); lGen(!V.elec.gen);
    const st = fm.ctl.steer || 0, br = fm.ctl.brake || 0;
    lat[0].rotation.x = Math.max(br, -st) * 0.5; lat[1].rotation.x = Math.max(br, st) * 0.5;   // pull a lateral to steer that way, both to brake
    sel.rotation.x = ({ R: -0.5, N: -0.25, '1': 0, '1-2': 0.25, '1-3': 0.5 })[fm.ctl.range] ?? 0;
    acc.rotation.x = (fm.ctl.throttle || 0) * 0.35;
    for (let i = 0; i < 11; i++) soldiers[i].visible = !!V.seats[i];
    for (const d of dome) d.color.setHex(0xfff4d8);
  };
  return { group: g, driver: D, troops: C, rampIn, cargoIn, panel: IP, update };
}
