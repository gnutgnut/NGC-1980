// M113A2 exterior model: the aluminium box at real dimensions (4.86 x 2.69 m, hull roof 1.85 m), sloped glacis with the
// plywood trim vane (folded / raised), driver's hatch with periscopes, exhaust and intake grilles on the right front,
// commander's cupola with the M2HB, rear cargo hatch, the power ramp (opens to the ground), 5 dual roadwheels per
// side on torsion arms, front sprocket, rear idler, T130 track without support rollers (the top run rides the wheels).
// Same house style and running-gear kit as the M60A3 (tankmodel.js). Frame: trackfm's hull frame (z aft).
import * as THREE from 'three';
import { M113A2 } from './m113.js';
import { paintFaces, weathered, merge, loftHalfRings, rodGeo, buildRunningGear, MAT, camoColor } from './tankmodel.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cylY = (r, h, seg = 12, x = 0, y = 0, z = 0, r2 = r) => new THREE.CylinderGeometry(r2, r, h, seg).translate(x, y, z);
const cylZ = (r, len, seg = 12, x = 0, y = 0, z = 0, r2 = r) => new THREE.CylinderGeometry(r2, r, len, seg).rotateX(Math.PI / 2).translate(x, y, z);
const cylX = (r, len, seg = 12, x = 0, y = 0, z = 0) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2).translate(x, y, z);

function stencil(text, w = 256, h = 64) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.font = 'bold 44px "Courier New", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#e4e0cc'; x.fillText(text, w / 2, h / 2 + 2);
  x.globalCompositeOperation = 'destination-out'; x.fillRect(0, h / 2 - 1, w, 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function decal(tex, w, h, pos, rotY = 0, rotX = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.position.copy(pos); m.rotation.set(rotX, rotY, 0, 'YXZ'); return m;
}

export const APC = {
  DRIVER_EYE: [-0.62, 1.62, -1.62], COMMANDER_EYE: [0.25, 1.75, -0.35], TROOP_EYE: [0, 1.4, 1.9],
  RAMP_HINGE: [0, 0.5, 2.43], VANE_HINGE: [0, 0.98, -2.45],
};
export function buildM113Mesh(opts = {}) {
  const T = M113A2.TRACK, seed = opts.seed ?? 8.3, dirt = opts.dirt ?? 1;
  const root = new THREE.Group(); root.name = 'M113A2';
  const paintM = MAT.paint(), steel = MAT.steel(), bright = MAT.bright(), rubber = MAT.rubber(), glass = MAT.glass(), black = MAT.black();
  const steelP = new THREE.MeshLambertMaterial({ color: 0x4c4a3c, flatShading: true }), trackSteel = new THREE.MeshLambertMaterial({ color: 0x34302a, flatShading: true });
  const W = weathered(seed, null, dirt), P = g => paintFaces(g, W);
  const hull = new THREE.Group(); hull.name = 'hull'; root.add(hull);
  const shell = [], glassIn = [];
  // ---- hull: loft along z. Half rings: roof, upper side (over the track), sponson underside, lower hull, belly.
  const c = M113A2.HULL.CLEAR, uw = 1.27, lw = 0.88, sy = 0.86;
  const ring = (z, top, bot, w = uw) => [z, [[0, top], [w - 0.05, top], [w, top - 0.05], [w, Math.max(sy, bot + 0.06)], [Math.min(lw, w), Math.max(sy, bot + 0.06)], [Math.min(lw, w), bot + 0.08], [Math.min(lw, w) - 0.08, bot], [0, bot]]];
  const ST = [
    ring(-2.43, 1.0, 0.92, 1.25),        // nose: the top of the lower front plate
    ring(-2.38, 1.06, 0.80),
    ring(-2.2, 1.24, 0.58),               // glacis rising at 45 deg, lower front plate going back down at ~30 deg
    ring(-1.95, 1.49, 0.434),
    ring(-1.6, 1.84, 0.434),
    ring(-1.52, 1.85, 0.434),
    ring(2.36, 1.85, 0.434),
    ring(2.43, 1.84, 0.46),
  ];
  const parts = [P(loftHalfRings(ST))];
  // fender lips / track shroud rail along the sponson edge
  for (const s of [-1, 1]) {
    parts.push(P(box(0.05, 0.1, 4.75, s * 1.29, 0.9, 0)));
    // headlights with guards on the glacis corners, tail lights
    parts.push(P(box(0.22, 0.16, 0.12, s * 1.0, 1.22, -2.16)));
    hull.add(new THREE.Mesh(cylZ(0.055, 0.03, 10, s * 0.95, 1.24, -2.23), glass));
    hull.add(new THREE.Mesh(box(0.12, 0.1, 0.04, s * 1.05, 1.62, 2.45), MAT.red()));
    parts.push(P(rodGeo(V3(s * 0.86, 1.12, -2.25), V3(s * 0.86, 1.36, -2.12), 0.025)));
    parts.push(P(rodGeo(V3(s * 1.16, 1.12, -2.25), V3(s * 1.16, 1.36, -2.12), 0.025)));
    // tow eyes
    hull.add(new THREE.Mesh(box(0.07, 0.14, 0.12, s * 0.65, 0.78, -2.44), steelP));
    hull.add(new THREE.Mesh(box(0.07, 0.14, 0.12, s * 0.7, 0.62, 2.49), steelP));
    // pioneer tools on the roof sides (shovel, pick, axe) as thin bars
    parts.push(P(box(0.06, 0.05, 1.2, s * 1.1, 1.88, 0.4)));
  }
  // exhaust grille and air inlet on the right front (glacis / roof), the exhaust stack outlet
  for (let k = 0; k < 7; k++) hull.add(new THREE.Mesh(box(0.55, 0.02, 0.035, 0.75, 1.86, -1.45 + k * 0.1), black));
  const ex = new THREE.Mesh(box(0.42, 0.06, 0.32, 0, 0, 0), black); ex.position.set(0.95, 1.42, -1.9); ex.rotation.x = -Math.PI / 4; ex.userData.heat = 1; hull.add(ex);
  // driver's hatch (front left) with four periscopes
  const dh = new THREE.Group(); dh.position.set(-0.62, 1.86, -1.35); hull.add(dh);
  parts.push(P(cylY(0.36, 0.06, 14, -0.62, 1.87, -1.35)));
  for (const a of [-0.9, -0.3, 0.3, 0.9]) { const pe = new THREE.Mesh(box(0.13, 0.08, 0.06), glass); pe.position.set(Math.sin(a) * 0.3, 0.06, -Math.cos(a) * 0.3); pe.rotation.y = -a; dh.add(pe); glassIn.push(pe); }
  const dHatch = new THREE.Group(); dHatch.position.set(0, 0.06, 0.18); dh.add(dHatch); dHatch.add(new THREE.Mesh(P(cylY(0.28, 0.05, 12, 0, 0, -0.18)), paintM));
  // cargo hatch (roof rear) and its hinge
  parts.push(P(box(1.7, 0.03, 1.55, 0, 1.865, 1.45)));
  const cargo = new THREE.Group(); cargo.position.set(0, 1.88, 2.22); hull.add(cargo);
  cargo.add(new THREE.Mesh(P(box(1.6, 0.05, 1.45, 0, 0, -0.72)), paintM));
  // ramp: hinged at the bottom of the rear plate; a door in it
  const ramp = new THREE.Group(); ramp.position.set(...APC.RAMP_HINGE); hull.add(ramp);
  const rp = [P(box(1.86, 1.3, 0.06, 0, 0.65, 0.0)), P(box(0.62, 1.02, 0.03, 0.42, 0.72, 0.04))];
  ramp.add(new THREE.Mesh(merge(rp), paintM));
  ramp.add(new THREE.Mesh(box(0.06, 0.12, 0.03, 0.18, 0.75, 0.065), steel));   // door handle
  ramp.add(decal(stencil('2-41IN  C-12', 512, 64), 0.9, 0.11, V3(-0.4, 1.05, 0.04), 0, 0));
  // trim vane: plywood board hinged at the bottom of the glacis; folded flat on the glacis, raised it stands forward
  const vane = new THREE.Group(); vane.position.set(...APC.VANE_HINGE); hull.add(vane);
  const vaneM = new THREE.MeshLambertMaterial({ color: 0x6a6a46, flatShading: true });
  vane.add(new THREE.Mesh(paintFaces(box(2.2, 0.03, 1.12, 0, 0, 0.56), (ctr) => camoColor(ctr.x, ctr.y + 5, ctr.z - 3, seed, new THREE.Color())), paintM));
  vane.add(new THREE.Mesh(box(2.25, 0.05, 0.05, 0, 0.02, 1.1), vaneM));
  // commander's cupola + M2HB on its pintle (rotates with the gun)
  const cup = new THREE.Group(); cup.position.set(...M113A2.MG.PIVOT.map((v, i) => i === 1 ? 1.85 : v)); hull.add(cup);
  cup.add(new THREE.Mesh(merge([P(cylY(0.48, 0.24, 16, 0, 0.12, 0)), P(cylY(0.42, 0.04, 16, 0, 0.26, 0))]), paintM));
  for (let k = 0; k < 5; k++) { const a = (k - 2) * 0.6; const vb = new THREE.Mesh(box(0.13, 0.07, 0.03), glass); vb.position.set(Math.sin(a) * 0.47, 0.13, -Math.cos(a) * 0.47); vb.rotation.y = -a; cup.add(vb); glassIn.push(vb); }
  const mg = new THREE.Group(); mg.position.set(0, 0.33, -0.05); cup.add(mg);
  const mgEl = new THREE.Group(); mg.add(mgEl);
  mgEl.add(new THREE.Mesh(box(0.13, 0.14, 0.55, 0, 0.0, -0.1), black));                    // receiver
  mgEl.add(new THREE.Mesh(cylZ(0.022, 1.14, 8, 0, 0.0, -0.95), black));                    // barrel
  mgEl.add(new THREE.Mesh(cylZ(0.035, 0.4, 8, 0, 0.0, -0.55), black));                     // barrel jacket
  mgEl.add(new THREE.Mesh(box(0.12, 0.14, 0.18, -0.11, -0.04, -0.1), new THREE.MeshLambertMaterial({ color: 0x4a4a32 })));   // ammo box
  mgEl.add(new THREE.Mesh(box(0.06, 0.1, 0.06, 0, -0.06, 0.2), black));                    // spade grips
  mg.add(new THREE.Mesh(cylY(0.03, 0.3, 6, 0, -0.15, 0), steelP));                          // pintle
  const cHatch = new THREE.Group(); cHatch.position.set(0, 0.28, 0.3); cup.add(cHatch); cHatch.add(new THREE.Mesh(P(cylY(0.36, 0.05, 14, 0, 0, -0.3)), paintM));
  // antennas
  for (const [x, z] of [[-1.05, 1.9], [1.05, -0.9]]) { const a = new THREE.Mesh(cylY(0.011, 2.6, 4, 0, 1.3, 0), black); a.position.set(x, 1.85, z); a.rotation.x = 0.1; hull.add(a); hull.add(new THREE.Mesh(cylY(0.045, 0.1, 8, x, 1.9, z), steelP)); }
  // M243 smoke grenade dischargers (4 tubes each) on the front corners of the roof - an M113A2 feature
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    const tb = new THREE.Mesh(cylZ(0.042, 0.2, 8, 0, 0, 0), steelP); tb.position.set(s * (1.08 - (k % 2) * 0.09), 1.92 + Math.floor(k / 2) * 0.09, -1.35); tb.rotation.set(0.5, s * 0.6, 0); hull.add(tb);
  }
  // tow cable coiled along the left side of the roof, a pick and shovel on the right
  hull.add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 4, 14).rotateX(Math.PI / 2).translate(-0.85, 1.87, 1.3), steel));
  hull.add(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 4, 14).rotateX(Math.PI / 2).translate(-0.85, 1.9, 1.3), steel));
  // jerry cans and a stowage rack on the rear corners
  for (const s of [-1, 1]) hull.add(new THREE.Mesh(box(0.33, 0.46, 0.17, s * 1.05, 1.4, 2.53), new THREE.MeshLambertMaterial({ color: 0x3e4a2e, flatShading: true })));
  const hullMesh = new THREE.Mesh(merge(parts), paintM); hullMesh.name = 'hullShell'; hull.add(hullMesh); shell.push(hullMesh);
  hull.add(decal(stencil('2-41IN'), 0.4, 0.1, V3(-0.6, 0.86, -2.425), Math.PI, 0.52));
  hull.add(decal(stencil('C-12'), 0.32, 0.08, V3(0.6, 0.86, -2.425), Math.PI, 0.52));
  for (const s of [-1, 1]) hull.add(decal(stencil('C12', 256, 96), 0.5, 0.19, V3(s * 1.272, 1.45, 0.6), s * Math.PI / 2, 0));
  // ---- running gear: front sprocket, rear idler, 5 roadwheels, no support rollers
  const gearDef = s => ({
    x: s * T.GAUGE / 2, wheels: T.WHEELS.map(z => ({ z, r: T.WHEEL_R })), hubY0: T.WHEEL_R + T.THICK, armLen: 0.38, armUp: 0.12, armFwd: 1,
    rollers: [], idler: T.REAR, sprocket: T.FRONT, frontIsSprocket: true,
    track: { pitch: T.PITCH, width: T.WIDTH, thick: T.THICK * 0.8, pads: true, links: T.SHOES }, shocks: [0, 1, 4], discW: 0.09, discGap: 0.08,
  });
  const gear = [-1, 1].map(s => { const rg = buildRunningGear(gearDef(s), { steelP, steel, rubber, trackSteel, bright }, s); hull.add(rg.group); return rg; });
  const api = { group: root, hull, gear, shell, glassIn, setInside: v => { for (const m of glassIn) m.visible = !v; }, cupola: cup, mg, mgEl, ramp, vane, hatches: { driver: dHatch, cupola: cHatch, cargo } };
  // state: { travel, trackPos, mgAz, mgEl, ramp 0..1, vane 0..1, hatches: { driver, cupola, cargo }, inside }
  api.animate = (st = {}) => {
    for (let i = 0; i < 2; i++) { gear[i].update(st.travel ? st.travel[i] : null, st.trackPos ? st.trackPos[i] : 0); gear[i].setTrack(!(st.thrown && st.thrown[i])); }
    cup.rotation.y = st.mgAz || 0; mgEl.rotation.x = st.mgEl || 0;
    ramp.rotation.x = (st.ramp || 0) * 1.32;                // down to the ground (~76 deg)
    vane.rotation.x = -Math.PI / 4 - (st.vane || 0) * 1.31;   // folded on the 45 deg glacis -> standing forward of the bow
    const h = st.hatches || {};
    dHatch.rotation.x = (h.driver || 0) * 1.7; cHatch.rotation.x = (h.cupola || 0) * 2.6; cargo.rotation.x = (h.cargo || 0) * 1.6;
    for (const m of glassIn) m.visible = !st.inside;
  };
  api.animate({});
  return api;
}
