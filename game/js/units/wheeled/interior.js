// Interiors / first person for the wheeled vehicles. buildInterior(spec, model) adds the driver's controls and the
// instrument panel to model.group (vehicle-local, rides with it) and returns { group, update(look, dt, inside),
// canvases(), controls }.
// - M151A2: the flat olive-drab panel: speedometer (MPH, odometer), fuel, water temperature (F), oil pressure, the
//   battery-generator indicator (the military "ammeter": red / amber / green), main light switch, rotary ignition
//   with START, panel light, data plates (shift pattern, front-drive caution). Steering wheel, clutch / brake /
//   accelerator, 4-speed floor shift, front-drive lever, parking-brake T-handle.
// - M35A2: speedometer, tachometer, oil, temperature, fuel, air-pressure (the air-over-hydraulic brakes; LOW AIR
//   buzzer lamp), battery-generator indicator, switches and plates; the big near-horizontal steering wheel, 5-speed
//   lever, transfer lever (HIGH / N / LOW), parking-brake lever.
// - Civilian: a binnacle with speedometer (km/h, Cyrillic on the Lada), fuel and temperature, warning lamps (oil,
//   charge), wheel, pedals, gear lever.
// Gauge faces are canvases drawn live (~12 Hz, only while a camera is inside). Controls move with look (modelkit.lookFrom).
import * as THREE from 'three';
import { PAL, mat, box, cylX, cylY, cylZ, sphere, rod, tube, builder, V } from './modelkit.js';
import { TYRES } from './tyre.js';

const TAU = Math.PI * 2, D2R = Math.PI / 180;
const SANS = 'Arial, "Liberation Sans", Helvetica, sans-serif';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ------------------------------------------------------------------------------------------- dial drawing
function P(cx, cy, r, aDeg) { const a = (aDeg - 90) * D2R; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }
function dial(c, cx, cy, R, o) {
  // bezel, face, arcs, ticks, labels
  c.fillStyle = '#262823'; c.beginPath(); c.arc(cx, cy, R * 1.12, 0, TAU); c.fill();
  c.fillStyle = '#0d0e0c'; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
  const map = v => o.a0 + (v - o.v0) / (o.v1 - o.v0) * (o.a1 - o.a0);
  for (const [va, vb, col] of o.bands || []) { c.strokeStyle = col; c.lineWidth = R * 0.1; c.beginPath(); c.arc(cx, cy, R * 0.84, (map(va) - 90) * D2R, (map(vb) - 90) * D2R); c.stroke(); }
  c.strokeStyle = '#e8e4d4';
  if (o.major) for (let v = o.v0; v <= o.v1 + 1e-6; v += o.minor || o.major) {
    const maj = Math.abs(v / o.major - Math.round(v / o.major)) < 1e-4, [x0, y0] = P(cx, cy, R * (maj ? 0.72 : 0.8), map(v)), [x1, y1] = P(cx, cy, R * 0.92, map(v));
    c.lineWidth = maj ? R * 0.045 : R * 0.022; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  }
  c.fillStyle = '#e8e4d4'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const [v, t] of o.labels || []) { const [x, y] = P(cx, cy, R * (o.lr || 0.55), map(v)); c.font = `bold ${Math.round(R * (o.ls || 0.2))}px ${SANS}`; c.fillText(t, x, y); }
  if (o.title) { c.font = `bold ${Math.round(R * 0.15)}px ${SANS}`; c.fillStyle = '#c8c4b0'; c.fillText(o.title, cx, cy + R * (o.ty ?? 0.42)); }
  return map;
}
function needle(c, cx, cy, R, aDeg, col = '#f0ede0', len = 0.82) {
  c.save(); c.translate(cx, cy); c.rotate(aDeg * D2R); c.fillStyle = col; c.beginPath();
  c.moveTo(-R * 0.04, R * 0.18); c.lineTo(-R * 0.018, -R * len); c.lineTo(R * 0.018, -R * len); c.lineTo(R * 0.04, R * 0.18); c.closePath(); c.fill(); c.restore();
  c.fillStyle = '#2b2c28'; c.beginPath(); c.arc(cx, cy, R * 0.09, 0, TAU); c.fill();
}
function odo(c, cx, cy, w, h, val) {
  const s = String(Math.floor(val)).padStart(6, '0'); c.fillStyle = '#050505'; c.fillRect(cx - w / 2, cy - h / 2, w, h);
  c.font = `bold ${Math.round(h * 0.78)}px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let i = 0; i < 6; i++) { c.fillStyle = i === 5 ? '#d8d0c0' : '#e8e4d8'; if (i === 5) { c.fillStyle = '#e8e4d8'; c.fillRect(cx - w / 2 + w * 5 / 6, cy - h / 2, w / 6, h); c.fillStyle = '#111'; } c.fillText(s[i], cx - w / 2 + w * (i + 0.5) / 6, cy + 1); }
}
function plate(c, x, y, w, h, lines, bg = '#1f201b', fg = '#d8d4c0') {
  c.fillStyle = bg; c.fillRect(x, y, w, h); c.strokeStyle = '#6a6a5a'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
  c.fillStyle = '#777'; for (const [px, py] of [[x + 5, y + 5], [x + w - 5, y + 5], [x + 5, y + h - 5], [x + w - 5, y + h - 5]]) { c.beginPath(); c.arc(px, py, 2.2, 0, TAU); c.fill(); }
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
  lines.forEach((l, i) => { c.font = `${l.b ? 'bold ' : ''}${l.s || 11}px ${SANS}`; c.fillText(l.t, x + w / 2, y + (i + 0.7) * h / (lines.length + 0.4)); });
}
function shiftPattern(c, x, y, w, h, gears, title) {
  plate(c, x, y, w, h, [{ t: title, s: 10, b: true }]);
  c.strokeStyle = '#d8d4c0'; c.lineWidth = 2; c.font = `bold 13px ${SANS}`; c.fillStyle = '#d8d4c0'; c.textAlign = 'center';
  const cols = gears.length, gx = i => x + w * (0.2 + 0.6 * i / Math.max(1, cols - 1)), yt = y + h * 0.42, yb = y + h * 0.86, ym = (yt + yb) / 2;
  c.beginPath(); c.moveTo(gx(0), ym); c.lineTo(gx(cols - 1), ym); c.stroke();
  gears.forEach(([top, bot], i) => { c.beginPath(); c.moveTo(gx(i), top ? yt + 6 : ym); c.lineTo(gx(i), bot ? yb - 6 : ym); c.stroke(); if (top) c.fillText(top, gx(i), yt); if (bot) c.fillText(bot, gx(i), yb + 2); });
}
function lampDot(c, x, y, r, on, col, label) {
  c.fillStyle = '#1a1a18'; c.beginPath(); c.arc(x, y, r * 1.25, 0, TAU); c.fill();
  c.fillStyle = on ? col : '#3a3530'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  if (on) { c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU); c.fill(); }
  if (label) { c.fillStyle = '#c8c4b0'; c.font = `bold ${Math.round(r * 0.9)}px ${SANS}`; c.textAlign = 'center'; c.fillText(label, x, y + r * 2.1); }
}
function toggleSw(c, x, y, s, on, label) {
  c.fillStyle = '#3a3b35'; c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill(); c.fillStyle = '#b8b8b0'; c.fillRect(x - s * 0.18, on ? y - s * 1.3 : y, s * 0.36, s * 1.3);
  if (label) { c.fillStyle = '#c8c4b0'; c.font = `bold ${Math.round(s * 0.75)}px ${SANS}`; c.textAlign = 'center'; c.fillText(label, x, y + s * 2.2); }
}
const F = c => c * 9 / 5 + 32, MPH = 0.621371;

// ------------------------------------------------------------------------------------------- panel definitions
// w x h metres, px canvas; centre (x, y, z) in the model frame, facing +z (the driver) unless tilt given (rad, top away)
const PANELS = {
  m151: { w: 0.92, h: 0.2, px: [1104, 240], at: [-0.06, 0.88, -0.405], tilt: 0.22, bg: '#3d4229',
    draw(c, W, H, L, bg) {
      if (bg) {
        plate(c, 700, 22, 190, 68, [{ t: 'FRONT WHEEL DRIVE', s: 11, b: true }, { t: 'ENGAGE ONLY OFF ROAD / LOW TRACTION', s: 8 }, { t: 'DISENGAGE ON HARD SURFACE', s: 8 }]);
        shiftPattern(c, 900, 22, 180, 96, [['R', '1'], ['2', '3'], ['4', '']], 'TRANSMISSION SHIFT PATTERN');
        plate(c, 700, 100, 190, 44, [{ t: 'TRUCK, UTILITY, 1/4 TON, 4X4, M151A2', s: 9, b: true }, { t: 'MAX SPEED 66 MPH   FORD 21 IN', s: 8 }]);
        plate(c, 900, 128, 180, 88, [{ t: 'CAUTION', s: 12, b: true }, { t: 'DO NOT TURN SHARPLY AT SPEED', s: 9 }, { t: 'VEHICLE MAY OVERTURN', s: 9 }, { t: 'WEAR SEAT BELTS', s: 9 }], '#3a2a10', '#f0c020');
        for (let i = 0; i < 16; i++) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.arc(30 + i * 68, 10, 3, 0, TAU); c.fill(); c.beginPath(); c.arc(30 + i * 68, H - 10, 3, 0, TAU); c.fill(); }
        return;
      }
      // speedometer (MPH) in front of the driver
      const sx = 330, sy = 118, sr = 84;
      const sm = dial(c, sx, sy, sr, { v0: 0, v1: 70, a0: -135, a1: 135, major: 10, minor: 5, labels: [0, 10, 20, 30, 40, 50, 60, 70].map(v => [v, String(v)]), title: 'MPH', ty: 0.62, ls: 0.17 });
      odo(c, sx, sy + 34, 78, 16, L.odo / 1609.34);
      needle(c, sx, sy, sr, sm(Math.abs(L.kmh) * MPH));
      // fuel, temperature, oil, battery-generator indicator
      const g = (x, o, v) => { const m = dial(c, x, 118, 48, { ...o, ls: 0.24, lr: 0.56 }); needle(c, x, 118, 48, m(v)); };
      g(110, { v0: 0, v1: 1, a0: -60, a1: 60, major: 0.25, labels: [[0, 'E'], [0.5, '1/2'], [1, 'F']], title: 'FUEL', bands: [[0, 0.12, '#b03020']] }, L.fuel);
      g(470, { v0: 100, v1: 250, a0: -60, a1: 60, major: 50, minor: 25, labels: [[100, '100'], [180, '180'], [250, '250']], title: 'WATER °F', bands: [[160, 200, '#3a9a40'], [225, 250, '#c03020']] }, F(L.temp));
      g(575, { v0: 0, v1: 80, a0: -60, a1: 60, major: 20, minor: 10, labels: [[0, '0'], [40, '40'], [80, '80']], title: 'OIL PSI', bands: [[0, 8, '#c03020']] }, L.oil);
      // battery-generator indicator: red / amber / green sectors, needle by charge state
      const bm = dial(c, 110, 205, 32, { v0: 0, v1: 1, a0: -60, a1: 60, bands: [[0, 0.33, '#b02a18'], [0.33, 0.66, '#d8a020'], [0.66, 1, '#3a9a40']], title: 'BATTERY-GEN', ty: 0.6 });
      needle(c, 110, 205, 32, bm(L.running && L.gen ? 0.83 : L.battery > 0.5 ? 0.5 : 0.2));
      // switches: main light (lever), ignition (rotary OFF / ON / START), panel light
      toggleSw(c, 470, 205, 12, L.lights, 'LIGHTS'); toggleSw(c, 520, 205, 10, L.lights, 'PANEL');
      c.fillStyle = '#20211d'; c.beginPath(); c.arc(590, 205, 18, 0, TAU); c.fill(); c.save(); c.translate(590, 205); c.rotate(L.starter ? 0.9 : L.ignition ? 0.4 : -0.4); c.fillStyle = '#c8c4b0'; c.fillRect(-3, -16, 6, 20); c.restore();
      c.fillStyle = '#c8c4b0'; c.font = `bold 10px ${SANS}`; c.textAlign = 'center'; c.fillText('OFF  ON  START', 590, 234);
      lampDot(c, 230, 210, 8, L.running && L.oil < 8, '#ff3020', 'OIL'); lampDot(c, 260, 210, 8, L.dmg && L.dmg.fire > 0, '#ff6010', 'FIRE');
      lampDot(c, 640, 205, 9, L.fwd, '#f0b020', '4WD');
    } },
  m35: { w: 1.42, h: 0.28, px: [1280, 252], at: [-0.22, 1.69, -1.43], tilt: 0.35, bg: '#3d4229',
    draw(c, W, H, L, bg) {
      if (bg) {
        shiftPattern(c, 840, 18, 190, 104, [['R', '1'], ['2', '3'], ['4', '5']], 'TRANSMISSION (2-5 SYNCHRO)');
        plate(c, 1040, 18, 220, 104, [{ t: 'TRANSFER', s: 12, b: true }, { t: 'HIGH  -  N  -  LOW', s: 11 }, { t: 'FRONT AXLE ENGAGES AUTOMATICALLY', s: 8 }, { t: '(SPRAG) - LOCKED IN LOW RANGE', s: 8 }]);
        plate(c, 840, 132, 420, 50, [{ t: 'TRUCK, CARGO, 2 1/2 TON, 6X6, M35A2  -  MULTIFUEL', s: 11, b: true }, { t: 'GOVERNED 2600 RPM   MAX 56 MPH   FORD 30 IN (72 IN W/ KIT)', s: 9 }]);
        plate(c, 840, 190, 420, 50, [{ t: 'CAUTION: DO NOT MOVE VEHICLE UNTIL AIR PRESSURE', s: 10, b: true }, { t: 'REACHES 65 PSI  -  LOW AIR BUZZER BELOW 60 PSI', s: 9 }], '#3a2a10', '#f0c020');
        return;
      }
      const sx = 230, sy = 112, sr = 82;
      const sm = dial(c, sx, sy, sr, { v0: 0, v1: 60, a0: -135, a1: 135, major: 10, minor: 5, labels: [0, 10, 20, 30, 40, 50, 60].map(v => [v, String(v)]), title: 'MPH', ty: 0.62, ls: 0.17 });
      odo(c, sx, sy + 34, 76, 16, L.odo / 1609.34); needle(c, sx, sy, sr, sm(Math.abs(L.kmh) * MPH));
      const tm = dial(c, 410, 112, 74, { v0: 0, v1: 35, a0: -135, a1: 135, major: 5, minor: 1, labels: [0, 5, 10, 15, 20, 25, 30, 35].map(v => [v, String(v)]), title: 'RPM x100', ty: 0.6, ls: 0.17, bands: [[26, 28.5, '#d8a020'], [28.5, 35, '#c03020']] });
      needle(c, 410, 112, 74, tm(L.rpm / 100));
      const g = (x, y, o, v) => { const m = dial(c, x, y, 44, { ...o, ls: 0.24, lr: 0.56 }); needle(c, x, y, 44, m(v)); };
      g(560, 70, { v0: 0, v1: 150, a0: -60, a1: 60, major: 50, minor: 25, labels: [[0, '0'], [75, '75'], [150, '150']], title: 'AIR PSI', bands: [[0, 60, '#c03020']] }, L.air);
      g(660, 70, { v0: 0, v1: 80, a0: -60, a1: 60, major: 20, minor: 10, labels: [[0, '0'], [40, '40'], [80, '80']], title: 'OIL PSI', bands: [[0, 10, '#c03020']] }, L.oil);
      g(560, 180, { v0: 100, v1: 250, a0: -60, a1: 60, major: 50, minor: 25, labels: [[100, '100'], [180, '180'], [250, '250']], title: 'WATER °F', bands: [[160, 200, '#3a9a40'], [225, 250, '#c03020']] }, F(L.temp));
      g(660, 180, { v0: 0, v1: 1, a0: -60, a1: 60, major: 0.25, labels: [[0, 'E'], [0.5, '1/2'], [1, 'F']], title: 'FUEL', bands: [[0, 0.12, '#b03020']] }, L.fuel);
      const bm = dial(c, 760, 70, 36, { v0: 0, v1: 1, a0: -60, a1: 60, bands: [[0, 0.33, '#b02a18'], [0.33, 0.66, '#d8a020'], [0.66, 1, '#3a9a40']], title: 'BATT-GEN', ty: 0.6 });
      needle(c, 760, 70, 36, bm(L.running && L.gen ? 0.83 : L.battery > 0.5 ? 0.5 : 0.2));
      lampDot(c, 745, 170, 11, L.running && L.air < 60, '#ff3020', 'LOW AIR'); lampDot(c, 790, 170, 9, L.lights, '#3070ff', 'BEAM');
      toggleSw(c, 60, 70, 13, L.lights, 'LIGHTS'); toggleSw(c, 60, 160, 13, L.ignition, 'ENGINE');
      c.fillStyle = L.starter ? '#c03020' : '#7a2018'; c.beginPath(); c.arc(110, 215, 14, 0, TAU); c.fill(); c.fillStyle = '#c8c4b0'; c.font = `bold 10px ${SANS}`; c.textAlign = 'center'; c.fillText('START', 110, 243);
    } },
  civ: { w: 0.42, h: 0.16, px: [672, 256], tilt: 0.25, bg: '#141412',
    draw(c, W, H, L, bg, spec) {
      if (bg) return;
      const kmh = spec.id !== 'landrover', cyr = spec.id === 'lada';
      const top = spec.published?.vmax ? Math.ceil(spec.published.vmax * 3.6 * (kmh ? 1 : MPH) / 20) * 20 + (kmh ? 20 : 10) : 160;
      const sm = dial(c, 200, 128, 112, { v0: 0, v1: top, a0: -130, a1: 130, major: kmh ? 20 : 10, minor: kmh ? 10 : 5, labels: Array.from({ length: Math.floor(top / (kmh ? 20 : 10)) + 1 }, (_, i) => i * (kmh ? 20 : 10)).filter((v, i) => kmh ? i % 1 === 0 : i % 2 === 0).map(v => [v, String(v)]), title: kmh ? (cyr ? 'км/ч' : 'km/h') : 'MPH', ty: 0.55, ls: 0.13 });
      odo(c, 200, 182, 96, 18, L.odo / (kmh ? 1000 : 1609.34)); needle(c, 200, 128, 112, sm(Math.abs(L.kmh) * (kmh ? 1 : MPH)), '#f4f0e0');
      const g = (x, y, o, v) => { const m = dial(c, x, y, 58, { ...o, ls: 0.22, lr: 0.55 }); needle(c, x, y, 58, m(v)); };
      g(470, 80, { v0: 0, v1: 1, a0: -55, a1: 55, major: 0.5, labels: [[0, cyr ? '0' : 'E'], [1, cyr ? '1' : 'F']], title: cyr ? 'ТОПЛИВО' : 'FUEL', bands: [[0, 0.12, '#b03020']] }, L.fuel);
      g(470, 196, { v0: 40, v1: 120, a0: -55, a1: 55, major: 40, labels: [[40, cyr ? '40' : 'C'], [120, cyr ? '120' : 'H']], title: spec.engine.aircooled ? 'OIL °C' : (cyr ? 'ВОДА °C' : 'TEMP'), bands: [[105, 120, '#c03020']] }, L.temp);
      lampDot(c, 590, 60, 13, L.running && L.oil < 8 || !L.running && L.ignition, '#ff3020', 'OIL'); lampDot(c, 590, 140, 13, L.ignition && !L.gen, '#ff3020', 'GEN');
      lampDot(c, 590, 215, 11, L.lights, '#30a040', '');
    } },
};

// ------------------------------------------------------------------------------------------- control layouts (model frame)
// wheel: centre, radius, column tilt (rad from vertical, top towards the driver), spokes; pedals: x list, pivot y/z;
// shifter: floor base, length, pattern offsets per gear [dx, dz]; extra levers.
const LAYOUT = {
  m151: { wheel: { c: [-0.36, 1.04, -0.21], r: 0.205, tilt: 0.62, spokes: 3, col: [-0.36, 0.86, -0.42] },
    pedals: { x: [-0.53, -0.40, -0.25], y: 0.56, z: -0.58, len: 0.2 }, floor: 0.445,
    shifter: { base: [-0.11, 0.5, -0.20], len: 0.46, gate: { R: [-0.05, -0.05], 1: [-0.05, 0.05], 2: [0, -0.05], 3: [0, 0.05], 4: [0.05, -0.05], 0: [0, 0] } },
    levers: [{ id: 'fwd', base: [-0.02, 0.47, -0.16], len: 0.26, on: [0, -0.05], off: [0, 0.05], knob: 0x9a2a1a }],
    park: { kind: 'tee', at: [-0.66, 0.79, -0.37] } },
  m35: { wheel: { c: [-0.48, 1.92, -1.18], r: 0.255, tilt: 1.0, spokes: 3, col: [-0.48, 1.45, -1.5] },
    pedals: { x: [-0.66, -0.50, -0.30], y: 1.33, z: -1.4, len: 0.22 }, floor: 1.17,
    shifter: { base: [-0.12, 1.2, -1.25], len: 0.72, gate: { R: [-0.06, -0.06], 1: [-0.06, 0.06], 2: [0, -0.06], 3: [0, 0.06], 4: [0.06, -0.06], 5: [0.06, 0.06], 0: [0, 0] } },
    levers: [{ id: 'range', base: [0.02, 1.2, -1.18], len: 0.6, H: [0, -0.07], N: [0, 0], L: [0, 0.07], knob: 0x1a1a1a }, { id: 'park', base: [0.16, 1.2, -1.15], len: 0.62, on: [0, 0.08], off: [0, -0.06], knob: 0x1a1a1a }],
    park: null },
  // civilian cars: aligned to each body in civmodel.js (its dash face, bench / seats, floor); panel = the binnacle face
  landrover: { panelAt: [0.42, 1.235, -0.635], panelTilt: 0.2, wheel: { c: [0.42, 1.33, -0.40], r: 0.215, tilt: 0.78, spokes: 3, col: [0.42, 1.05, -0.80] },
    pedals: { x: [0.27, 0.42, 0.56], y: 0.82, z: -0.70, len: 0.2 }, floor: 0.76,
    shifter: { base: [0.06, 0.78, -0.33], len: 0.55, gate: { R: [-0.06, -0.06], 1: [-0.06, 0.06], 2: [0, -0.06], 3: [0, 0.06], 4: [0.06, -0.06], 0: [0, 0] } },
    levers: [{ id: 'range', base: [-0.06, 0.78, -0.30], len: 0.42, H: [0, -0.05], N: [0, 0], L: [0, 0.05], knob: 0xd8c020 }], park: { kind: 'lever', at: [-0.14, 0.78, -0.25] } },
  hilux: { panelAt: [0.38, 1.0, -0.492], panelTilt: 0.25, wheel: { c: [0.38, 1.10, -0.30], r: 0.19, tilt: 0.55, spokes: 2, col: [0.38, 0.95, -0.58] },
    pedals: { x: [0.24, 0.37, 0.50], y: 0.72, z: -0.66, len: 0.17 }, floor: 0.64,
    shifter: { base: [0.02, 0.66, -0.28], len: 0.45, gate: { R: [0.05, 0.05], 1: [-0.05, -0.05], 2: [-0.05, 0.05], 3: [0, -0.05], 4: [0, 0.05], 0: [0, 0] } },
    levers: [{ id: 'range', base: [-0.08, 0.66, -0.25], len: 0.32, H: [0, -0.05], N: [0, 0], L: [0, 0.05], knob: 0x1a1a1a }], park: { kind: 'tee', at: [0.62, 0.86, -0.50] } },
  beetle: { panelAt: [-0.28, 0.99, -0.862], panelTilt: 0.15, panelW: 0.30, wheel: { c: [-0.33, 1.0, -0.56], r: 0.2, tilt: 0.42, spokes: 2, col: [-0.33, 0.85, -0.95] },
    pedals: { x: [-0.44, -0.33, -0.21], y: 0.44, z: -0.98, len: 0.16 }, floor: 0.36,
    shifter: { base: [0.0, 0.40, -0.42], len: 0.42, gate: { R: [0.05, 0.05], 1: [-0.05, -0.05], 2: [-0.05, 0.05], 3: [0, -0.05], 4: [0, 0.05], 0: [0, 0] } },
    levers: [], park: { kind: 'lever', at: [0.0, 0.42, -0.2] } },
  lada: { panelAt: [-0.35, 0.87, -0.582], panelTilt: 0.25, wheel: { c: [-0.35, 0.93, -0.34], r: 0.19, tilt: 0.55, spokes: 2, col: [-0.35, 0.80, -0.62] },
    pedals: { x: [-0.47, -0.35, -0.22], y: 0.45, z: -0.86, len: 0.16 }, floor: 0.36,
    shifter: { base: [0.0, 0.42, -0.32], len: 0.4, gate: { R: [0.05, 0.05], 1: [-0.05, -0.05], 2: [-0.05, 0.05], 3: [0, -0.05], 4: [0, 0.05], 0: [0, 0] } },
    levers: [], park: { kind: 'lever', at: [0.0, 0.42, -0.10] } },
};

export function buildInterior(spec, model) {
  const g = new THREE.Group(); g.name = 'interior'; model.group.add(g);
  const isCiv = !PANELS[spec.id];
  const drv = spec.seats.find(s => s.role === 'driver'), dx = drv.at[0], eye = drv.eye;
  // a vehicle without a layout of its own: one derived from the driver's seat
  const L0 = LAYOUT[spec.id] || {
    wheel: { c: [dx, drv.at[1] + 0.40, drv.at[2] - 0.40], r: 0.19, tilt: 0.45, spokes: spec.id === 'beetle' ? 2 : 3, col: [dx, drv.at[1] + 0.22, drv.at[2] - 0.78] },
    pedals: { x: [dx - 0.16, dx - 0.03, dx + 0.12], y: drv.at[1] - 0.02, z: drv.at[2] - 0.82, len: 0.17 }, floor: drv.at[1] - 0.25,
    shifter: { base: [dx + 0.32 * (dx < 0 ? 1 : -1), drv.at[1] - 0.18, drv.at[2] - 0.38], len: 0.42, gate: { R: [0.05, 0.05], 1: [-0.05, -0.05], 2: [-0.05, 0.05], 3: [0, -0.05], 4: [0, 0.05], 0: [0, 0] } },
    levers: [], park: { kind: 'lever', at: [dx + 0.36 * (dx < 0 ? 1 : -1), drv.at[1] - 0.1, drv.at[2] - 0.05] },
  };
  const blk = mat(PAL.black, { vc: false }), steelD = mat(PAL.steelDark, { vc: false }), od = mat(isCiv ? 0x2a2826 : PAL.od, { vc: false }), rubber = mat(0x151514, { vc: false });
  const B = builder(false);
  // ---- instrument panel canvas
  const PD = isCiv ? { ...PANELS.civ, at: L0.panelAt || [dx, drv.at[1] + 0.47, drv.at[2] - 0.62], tilt: L0.panelTilt ?? PANELS.civ.tilt,
    w: L0.panelW || PANELS.civ.w, h: (L0.panelW || PANELS.civ.w) * PANELS.civ.h / PANELS.civ.w } : PANELS[spec.id];
  const cv = document.createElement('canvas'); cv.width = PD.px[0]; cv.height = PD.px[1]; const ctx = cv.getContext('2d');
  const bgc = document.createElement('canvas'); bgc.width = PD.px[0]; bgc.height = PD.px[1]; const bx = bgc.getContext('2d');
  bx.fillStyle = PD.bg; bx.fillRect(0, 0, PD.px[0], PD.px[1]);
  // a little paint wear on the panel
  for (let i = 0; i < 260; i++) { bx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,230'},${Math.random() * 0.06})`; bx.fillRect(Math.random() * PD.px[0], Math.random() * PD.px[1], Math.random() * 30, Math.random() * 8); }
  PD.draw(bx, PD.px[0], PD.px[1], null, true, spec);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(PD.w, PD.h), new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.18 }));
  panel.position.set(...PD.at); panel.rotation.x = -(PD.tilt || 0); panel.name = 'panel'; g.add(panel);
  // the panel's housing (civ binnacle / military plate edge)
  if (isCiv) {
    // a shallow binnacle hood around the dials (the car's own dash is in civmodel.js)
    const tm = new THREE.Matrix4().makeRotationX(-(PD.tilt || 0));
    B.add(box(PD.w + 0.03, PD.h + 0.03, 0.012, 0, 0, -0.008).applyMatrix4(tm).translate(...PD.at), od);
    B.add(box(PD.w + 0.04, 0.012, 0.07, 0, PD.h / 2 + 0.012, 0.03).applyMatrix4(tm).translate(...PD.at), od);
  } else {
    B.add(box(PD.w + 0.03, PD.h + 0.03, 0.02, 0, 0, -0.012).applyMatrix4(new THREE.Matrix4().makeRotationX(-(PD.tilt || 0))).translate(...PD.at), od);
  }
  // ---- steering column + wheel (wheel spins about its own axis, the column axis)
  const W0 = L0.wheel, wc = V(...W0.c), colA = V(...W0.col);
  B.add(rod(colA, wc.clone().lerp(colA, 0.08), 0.05, 8), steelD);
  const wheelPivot = new THREE.Group(); wheelPivot.position.copy(wc); wheelPivot.rotation.x = W0.tilt; g.add(wheelPivot);   // axis up and back, facing the driver
  const wheelG = new THREE.Group(); wheelPivot.add(wheelG);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(W0.r, 0.014, 6, 28).rotateX(Math.PI / 2), blk); wheelG.add(rim);
  const hub = new THREE.Mesh(cylY(0.04, 0.05, 0, -0.01, 0, 10), blk); wheelG.add(hub);
  for (let k = 0; k < W0.spokes; k++) { const a = (W0.spokes === 2 ? [0.28, Math.PI - 0.28][k] : [Math.PI / 2, Math.PI - 0.15, 0.15][k]); wheelG.add(new THREE.Mesh(rod([0, -0.01, 0], [Math.cos(a) * W0.r, 0, Math.sin(a) * W0.r], 0.016), blk)); }
  const hornBtn = new THREE.Mesh(cylY(0.03, 0.02, 0, 0.02, 0, 10), mat(isCiv ? 0x8a2a1a : 0x2a2a28, { vc: false })); wheelG.add(hornBtn);
  // gloved hands at ten to two, riding the rim
  const glove = mat(isCiv ? 0x7a5a40 : 0x3a3626, { vc: false }).clone(), sleeve = mat(isCiv ? 0x3a4a6a : 0x4a5232, { vc: false }).clone();   // (own copies: setDriver recolours them)
  const hands = [-1, 1].map(s => { const h = new THREE.Group(); const a = -Math.PI / 2 + s * 1.05;   /* local -z = the top of the rim (ten to two) */ h.position.set(Math.cos(a) * W0.r, 0.01, Math.sin(a) * W0.r); h.add(new THREE.Mesh(sphere(0.045, 0, 0, 0, 8, 6).scale(1, 0.75, 1.3), glove)); wheelG.add(h); return h; });
  // arms: upper arm + forearm with an elbow that drops down and out (two tapered segments per side)
  const seg = (r0, r1) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 1, 7).rotateX(Math.PI / 2), sleeve); g.add(m); return m; };
  const arms = [-1, 1].map(() => ({ up: seg(0.045, 0.038), fore: seg(0.036, 0.03) }));
  const _el = V(), _sh = V();
  const limb = (m, a, b) => { m.position.copy(a).add(b).multiplyScalar(0.5); m.scale.set(1, 1, a.distanceTo(b)); _sh.copy(b); g.localToWorld(_sh); m.lookAt(_sh); };
  // ---- pedals: clutch, brake, accelerator (pivot at the top, swing forward when pressed)
  const P0 = L0.pedals;
  const pedals = P0.x.map((x, i) => {
    const piv = new THREE.Group(); piv.position.set(x, P0.y + P0.len * 0.8, P0.z); g.add(piv);
    const arm = new THREE.Mesh(box(0.025, P0.len, 0.025, 0, -P0.len / 2, 0), steelD); piv.add(arm);
    const pad = new THREE.Mesh(box(i === 2 ? 0.07 : 0.08, i === 2 ? 0.13 : 0.07, 0.02, 0, -P0.len, 0.01), rubber); piv.add(pad);
    return piv;
  });
  // ---- gear lever and the other levers (a ball joint at the base, tilting to the gate position)
  const lever = (base, len, knobCol = 0x161616, knobR = 0.028) => {
    const piv = new THREE.Group(); piv.position.set(...base); g.add(piv);
    piv.add(new THREE.Mesh(cylY(0.011, len, 0, len / 2, 0, 6), steelD));
    piv.add(new THREE.Mesh(sphere(knobR, 0, len, 0, 10, 8), mat(knobCol, { vc: false })));
    B.add(cylY(0.05, 0.04, base[0], base[1] + 0.01, base[2], 10), rubber);   // boot
    piv.userData.len = len; return piv;
  };
  const S0 = L0.shifter, shifter = lever(S0.base, S0.len);
  const levers = L0.levers.map(l => ({ ...l, piv: lever(l.base, l.len, l.knob, 0.024) }));
  let parkG = null;
  if (L0.park?.kind === 'tee') { parkG = new THREE.Group(); parkG.position.set(...L0.park.at); g.add(parkG); parkG.add(new THREE.Mesh(cylZ(0.008, 0.16, 0, 0, 0.08, 6), steelD)); parkG.add(new THREE.Mesh(box(0.1, 0.022, 0.022, 0, 0, 0.16), blk)); }
  if (L0.park?.kind === 'lever') { parkG = lever(L0.park.at, 0.22, 0x1a1a1a, 0.02); parkG.rotation.x = 0.9; }
  B.build(g, 'interiorStatic', false);

  // ---- per-frame
  let tDraw = 0;
  const _a = V(), _b = V();
  const gateOf = (gate, k) => gate[k] ?? gate[0];
  const api = {
    group: g, controls: { wheelG, pedals, shifter, levers, parkG, panel, hands, arms, hornBtn }, canvases: () => [cv], layout: L0, panelDef: PD,
    // ngc/wheeledgame: the hands and arms on the wheel only when somebody is driving (not on a parked, empty vehicle)
    setDriver(on, colours) { for (const h of hands) h.visible = on; for (const a of arms) { a.up.visible = a.fore.visible = on; } if (colours) { glove.color.setHex(colours.glove); sleeve.color.setHex(colours.sleeve); } },
    update(look, dt, inside) {
      if (!look) return;
      // steering wheel: steer -1..1 = half the lock-to-lock turns either way
      wheelG.rotation.y = -(look.steer || 0) * (spec.steer.turns || 3.5) * Math.PI;
      hornBtn.position.y = look.horn ? 0.005 : 0.02;
      pedals[0].rotation.x = -(look.clutch || 0) * 0.55; pedals[1].rotation.x = -(look.brake || 0) * 0.45; pedals[2].rotation.x = -(look.throttle || 0) * 0.4;
      const gk = look.gear < 0 ? 'R' : look.gear;
      const [gx, gz] = gateOf(S0.gate, gk);
      shifter.rotation.set(gz / S0.len * 3, 0, -gx / S0.len * 3);
      for (const l of levers) {
        const p = l.id === 'fwd' ? (look.fwd ? l.on : l.off) : l.id === 'range' ? l[look.range] || l.H : l.id === 'park' ? (look.handbrake ? l.on : l.off) : [0, 0];
        l.piv.rotation.set(p[1] / l.len * 3, 0, -p[0] / l.len * 3);
      }
      if (parkG && L0.park?.kind === 'tee') parkG.position.z = L0.park.at[2] + (look.handbrake ? 0.12 : 0);
      else if (parkG) parkG.rotation.x = look.handbrake ? 0.2 : 0.9;
      // arms from the shoulders to the hands
      g.updateMatrixWorld(true);
      for (let k = 0; k < 2; k++) {
        const s = k ? 1 : -1; _a.set(eye[0] + s * 0.19, eye[1] - 0.32, eye[2] + 0.06);   // shoulder
        hands[k].getWorldPosition(_b); g.worldToLocal(_b);                               // hand
        // elbow: a little past the middle, dropped and pushed out
        _el.copy(_a).lerp(_b, 0.55); _el.y -= 0.14; _el.x += s * 0.1; _el.z += 0.04;
        limb(arms[k].up, _a, _el); limb(arms[k].fore, _el, _b);
      }
      // gauge faces (only while someone looks)
      tDraw -= dt;
      if (inside && tDraw <= 0) { tDraw = 1 / 12; ctx.drawImage(bgc, 0, 0); PD.draw(ctx, PD.px[0], PD.px[1], look, false, spec); tex.needsUpdate = true; }
    },
  };
  // draw once so the panel isn't blank from outside
  ctx.drawImage(bgc, 0, 0); PD.draw(ctx, PD.px[0], PD.px[1], { kmh: 0, odo: 0, fuel: 1, temp: 20, oil: 0, rpm: 0, air: 0, battery: 1, steer: 0, gear: 0, range: 'H' }, false, spec); tex.needsUpdate = true;
  void TYRES; return api;
}
