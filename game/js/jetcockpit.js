// HORNET cockpit, the 1980 F/A-18A (full-scale development): a full 3D interior in jet-local space (x right, y up,
// nose -z), so it rides with the airframe and free look finds a whole cockpit. Everything that has a needle or a number is live:
// - HUD (Kaiser AVQ-28 style): symbology drawn on the combiner glass and projected from the pilot's eye, so it is
//   conformal (the pitch ladder on the real horizon, the velocity vector on the real flight path, target boxes on
//   targets, the CCIP pipper on the impact point) wherever you look; speed / altitude boxes, heading tape, bank scale.
// - Left / right DDI, monochrome green (pages RDR, SMS, FCS, ENG, CHK = checklist; cautions come up on the left DDI),
//   the HI (horizontal indicator: moving map with the HSI over it, TACAN to the carrier), the EFD (engine fuel display),
//   UFC, standby airspeed / attitude / altimeter / VSI, the caution light panel, AoA indexer, LOCK / SHOOT, FIRE,
//   MASTER CAUTION, APU FIRE, the advisory lights, the RWR azimuth indicator with SAM / AAA / AI / CW, the ALE-39 counters.
// - Stick, throttles and rudder pedals move with your HOTAS and pedals; gloved hands ride on the stick and throttle.
// - Clickable: gear and hook handles, flaps, master arm, EMER JETT, FCS CAS/DIRECT, BATT, APU, ENG CRANK L / R,
//   fire lights (push to extinguish), master caution, canopy, lights, parking brake, eject handle, DDI / HI buttons.
import * as THREE from 'three';
import { KT, FT, LB, HORNET, DECKOPS } from './jetfm.js';
import { drawRwr } from './units/defence/cm.js';   // ngc/cmpolish: the radar warning scope

export const JEYE = new THREE.Vector3(0, 0.98, -4.35);
const HUD = { z: -5.1, cy: 1.0, hw: 0.15, hh: 0.135, W: 600, H: 540 };   // ~22° wide from the eye
const GRN = '#6dff7c', AMB = '#ffb21e', RED = '#ff3a2a';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const deg = r => r * 180 / Math.PI;
const FONT = 'Consolas, "Liberation Mono", monospace';
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _iq = new THREE.Quaternion(), _eye = new THREE.Vector3();

function canvasTex(w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { cv, ctx: cv.getContext('2d'), tex };
}

export function buildJetCockpit() {
  const g = new THREE.Group(); g.visible = false; g.name = 'jetCockpit';
  // interior fill: the tub is lit through the canopy, so give every surface some self-light (like the heli cockpit)
  const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.5), ...o });
  const grey = M(0x40464c), dark = M(0x1e2125), black = M(0x0b0c0d), tubM = M(0x4c535a), suit = M(0x5d6542), glove = M(0x2b2723);
  const yellow = M(0xd8b018), redM = M(0xb81a10), metal = M(0x777d82), seatM = M(0x2d3134), cushion = M(0x3d4a35);
  const box = (w, h, d, m, x, y, z, p = g, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); p.add(o); return o; };
  const cyl = (r0, r1, h, m, x, y, z, p = g, rx = 0, rz = 0, seg = 8) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); p.add(o); return o; };
  const plane = (w, h, mat, x, y, z, p = g, rx = 0) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); o.position.set(x, y, z); o.rotation.x = rx; p.add(o); return o; };
  const lit = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });

  // ---------------------------------------------------------------- tub, consoles, seat, glare shield
  const X = 0.52;   // inner half-width
  for (const s of [-1, 1]) {
    box(0.03, 1.0, 2.75, tubM, s * (X + 0.015), 0.22, -4.35);               // side walls up to the sill
    box(0.1, 0.03, 2.75, grey, s * (X - 0.03), 0.72, -4.35);                 // sill / canopy rail
    box(0.2, 0.3, 1.25, grey, s * 0.43, 0.21, -4.25);                        // side console
    box(0.2, 0.02, 1.25, dark, s * 0.43, 0.365, -4.25);                      // console top
  }
  box(1.04, 0.03, 2.75, dark, 0, -0.28, -4.35);                              // floor
  box(1.04, 1.25, 0.04, tubM, 0, 0.35, -2.98);                               // aft bulkhead behind the seat
  box(0.6, 0.6, 0.5, dark, 0, -0.05, -5.42);                                 // pedal well / under-panel
  // instrument panel (tilted back) carries the displays; panel group local: x right, y up the panel face
  const P = new THREE.Group(); P.position.set(0, 0.55, -5.14); P.rotation.x = -0.15; g.add(P);
  box(0.96, 0.62, 0.05, dark, 0, -0.01, -0.03, P);
  const art = canvasTex(960, 620); const artMesh = plane(0.96, 0.62, new THREE.MeshLambertMaterial({ map: art.tex, emissive: 0xffffff, emissiveMap: art.tex, emissiveIntensity: 0.55 }), 0, -0.01, 0.0, P);
  // glare shield: a padded slab over the panel with a lip toward the pilot
  box(0.98, 0.04, 0.48, black, 0, 0.845, -5.33); box(0.98, 0.03, 0.04, black, 0, 0.85, -5.085);
  // ejection seat
  const seat = new THREE.Group(); seat.position.set(0, 0.0, -3.9); g.add(seat);
  box(0.46, 0.1, 0.48, seatM, 0, 0.18, -0.22, seat); box(0.42, 0.06, 0.42, cushion, 0, 0.25, -0.22, seat);
  box(0.46, 0.95, 0.12, seatM, 0, 0.66, 0.08, seat, -0.17); box(0.4, 0.8, 0.04, cushion, 0, 0.66, 0.0, seat, -0.17);
  box(0.36, 0.32, 0.22, seatM, 0, 1.24, 0.2, seat, -0.17);   // headbox
  for (const s of [-1, 1]) box(0.05, 1.1, 0.1, metal, s * 0.25, 0.6, 0.12, seat, -0.17);   // seat rails
  // eject handle: yellow/black loop on the seat front, between the knees
  const ejectH = new THREE.Group(); ejectH.position.set(0, 0.2, -4.42); g.add(ejectH);
  for (let i = 0; i < 6; i++) box(0.035, 0.02, 0.02, i % 2 ? black : yellow, -0.06 + i * 0.024, 0.02, 0, ejectH);
  box(0.02, 0.06, 0.02, yellow, -0.07, -0.01, 0, ejectH); box(0.02, 0.06, 0.02, yellow, 0.07, -0.01, 0, ejectH);

  // ---------------------------------------------------------------- windscreen and canopy (inside view)
  const glass = new THREE.MeshBasicMaterial({ color: 0xb8dcff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
  const frame = M(0x2a2e33);
  // a half-elliptic loft along z: rings of (half-width w, height h above the sill)
  function loft(rings, segs = 14) {
    const pos = [], idx = [];
    rings.forEach(([z, w, h, y0], i) => { for (let k = 0; k <= segs; k++) { const a = Math.PI * k / segs; pos.push(Math.cos(a) * w, y0 + Math.sin(a) * h, z); } });
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < segs; k++) { const a = i * (segs + 1) + k, b = a + segs + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
  }
  function arc(z, w, h, y0, r = 0.018, p = g) {
    const pts = []; for (let k = 0; k <= 16; k++) { const a = Math.PI * k / 16; pts.push(new THREE.Vector3(Math.cos(a) * w, y0 + Math.sin(a) * h, z)); }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 5), frame); p.add(m); return m;
  }
  const ws = new THREE.Mesh(loft([[-5.72, 0.46, 0.06, 0.8], [-5.45, 0.53, 0.32, 0.76], [-5.1, 0.56, 0.6, 0.73]]), glass); ws.renderOrder = 5; g.add(ws);
  arc(-5.1, 0.56, 0.6, 0.73, 0.022);                                          // windscreen bow
  for (const s of [-1, 1]) { const pts = [new THREE.Vector3(s * 0.46, 0.8, -5.72), new THREE.Vector3(s * 0.5, 1.02, -5.45), new THREE.Vector3(s * 0.4, 1.25, -5.12)]; g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.014, 4), frame)); }
  for (const x of [-0.16, 0, 0.16]) box(0.1, 0.035, 0.015, metal, x, 1.3, -5.08);   // rear-view mirrors on the bow
  const canopyG = new THREE.Group(); canopyG.position.set(0, 0.95, -2.4); g.add(canopyG);   // hinged at the rear
  const cg = new THREE.Group(); cg.position.set(0, -0.95, 2.4); canopyG.add(cg);
  const cnp = new THREE.Mesh(loft([[-5.1, 0.56, 0.6, 0.73], [-4.6, 0.58, 0.7, 0.73], [-4.0, 0.57, 0.72, 0.73], [-3.3, 0.52, 0.6, 0.73], [-2.7, 0.42, 0.38, 0.73], [-2.4, 0.3, 0.2, 0.73]]), glass); cnp.renderOrder = 5; cg.add(cnp);
  arc(-3.35, 0.52, 0.6, 0.73, 0.016, cg);                                     // canopy bow frame behind the head
  for (const s of [-1, 1]) box(0.03, 0.04, 2.7, frame, s * 0.55, 0.75, -3.75, cg);

  // ---------------------------------------------------------------- displays
  const disp = (w, h, cw, ch, x, y, p = P, z = 0.006) => { const t = canvasTex(cw, ch); const m = plane(w, h, new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false }), x, y, z, p); return { ...t, mesh: m, w: cw, h: ch }; };
  // 1980 F/A-18A main panel: two monochrome green DDIs, the HI (horizontal indicator: a projected colour-film moving map
  // with the HSI drawn over it; the colour AMPCD came with the F/A-18C), the EFD (engine fuel display, LCD; the IFEI is
  // later), standby instruments, the caution light panel, the UFC under the HUD.
  const ddiL = disp(0.15, 0.15, 360, 360, -0.255, 0.035), ddiR = disp(0.15, 0.15, 360, 360, 0.255, 0.035);
  const ampcd = disp(0.155, 0.155, 380, 380, 0, -0.14), ufc = disp(0.2, 0.11, 400, 220, 0, 0.19);
  const ifei = disp(0.14, 0.08, 336, 192, -0.2, -0.205), stby = disp(0.14, 0.14, 300, 300, 0.205, -0.205);
  const caut = disp(0.1, 0.13, 200, 260, 0.41, 0.09), gearL = disp(0.08, 0.06, 160, 120, -0.41, -0.2);
  // CM (ngc/cmpolish): the RWR azimuth indicator right of the UFC (threat letters by bearing, ALR-style); right of it the
  // threat lights of the right warning panel (SAM / AAA / AI / CW) over the ALE-39 FLARE / CHAFF counters; left of the
  // UFC the left advisory lights (L / R BLEED, SPD BRK, STBY, L BAR red / green, REC, XMIT)
  const rwrD = disp(0.1, 0.1, 200, 200, 0.25, 0.215), thrD = disp(0.1, 0.1, 200, 200, 0.41, 0.225), advD = disp(0.17, 0.1, 340, 200, -0.235, 0.215);
  // HUD combiner glass and its symbology
  const hud = canvasTex(HUD.W, HUD.H);
  const hudMesh = new THREE.Mesh(new THREE.PlaneGeometry(HUD.hw * 2, HUD.hh * 2), new THREE.MeshBasicMaterial({ map: hud.tex, transparent: true, depthWrite: false, toneMapped: false }));
  hudMesh.position.set(0, HUD.cy, HUD.z); hudMesh.renderOrder = 6; g.add(hudMesh);
  const comb = new THREE.Mesh(new THREE.PlaneGeometry(HUD.hw * 2, HUD.hh * 2), new THREE.MeshBasicMaterial({ color: 0x9fe8c0, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide }));
  comb.position.set(0, HUD.cy, HUD.z - 0.004); comb.renderOrder = 5; g.add(comb);
  for (const s of [-1, 1]) box(0.007, HUD.hh * 2 + 0.02, 0.008, frame, s * (HUD.hw + 0.004), HUD.cy - 0.01, HUD.z);   // thin combiner side rails
  box(0.26, 0.05, 0.12, black, 0, 0.885, -5.18);                              // HUD projector body on the glare shield
  // lights: AoA indexer (left of HUD), LOCK / SHOOT (right), fire lights at the glare shield ends, master caution
  const lamp = (w, h, x, y, z, on, offc = 0x1a1a1a, p = g) => { const m = new THREE.MeshBasicMaterial({ color: offc, toneMapped: false }); const o = plane(w, h, m, x, y, z, p); o.userData = { on: new THREE.Color(on), off: new THREE.Color(offc) }; return o; };
  const setLamp = (o, v) => { if (o.userData.cap) { const m = v ? o.userData.tOn : o.userData.tOff; if (o.material.map !== m) o.material.map = m; o.userData.lit = !!v; } else o.material.color.copy(v ? o.userData.on : o.userData.off); };
  const aoaHi = lamp(0.03, 0.018, -0.165, 1.0, -5.09, 0x30ff40), aoaOn = lamp(0.022, 0.022, -0.165, 0.976, -5.09, 0xffa020), aoaLo = lamp(0.03, 0.018, -0.165, 0.952, -5.09, 0xff3020);
  const lockL = lamp(0.04, 0.02, 0.17, 1.0, -5.09, 0x30ff40), shootL = lamp(0.04, 0.02, 0.17, 0.975, -5.09, 0x30ff40);
  // under the glare shield: FIRE L and MASTER CAUTION on the left warning panel, FIRE R and APU FIRE on the right one.
  // Each caption lamp carries its legend (dark grey when off, black on the colour when lit).
  const capLamp = (w, h, x, y, z, text, onCss, offCss, p = g) => {
    const mk = on => { const t = canvasTex(Math.round(w * 2000), Math.round(h * 2000)), c = t.ctx, W = t.cv.width, H = t.cv.height; c.fillStyle = on ? onCss : offCss; c.fillRect(0, 0, W, H); c.strokeStyle = '#000'; c.lineWidth = 4; c.strokeRect(0, 0, W, H);
      const L = text.split('|'); L.forEach((s, i) => txt(c, s, W / 2, H / 2 + (i - (L.length - 1) / 2) * H * 0.4 + H * (L.length > 1 ? 0.13 : 0.17), on ? '#111' : '#5c5650', Math.round(H * (L.length > 1 ? 0.34 : 0.5)), 'center')); t.tex.needsUpdate = true; return t.tex; };
    const o = plane(w, h, new THREE.MeshBasicMaterial({ map: mk(false), toneMapped: false }), x, y, z, p); o.userData = { tOn: mk(true), tOff: o.material.map, cap: true }; return o;
  };
  const fireLL = capLamp(0.07, 0.035, -0.36, 0.885, -5.07, 'FIRE', '#ff2a14', '#240806'), fireRL = capLamp(0.07, 0.035, 0.36, 0.885, -5.07, 'FIRE', '#ff2a14', '#240806');
  const mcL = capLamp(0.07, 0.035, -0.282, 0.885, -5.07, 'MASTER|CAUTION', '#ffb020', '#1c1606'), apuL = capLamp(0.07, 0.035, 0.282, 0.885, -5.07, 'APU|FIRE', '#ff2a14', '#240806');
  for (const s of [-1, 1]) box(0.165, 0.048, 0.012, black, s * 0.321, 0.885, -5.079);   // the warning light panels the lamps sit in
  // ---------------------------------------------------------------- handles and switches
  const hitM = new THREE.MeshBasicMaterial({ visible: false }), hits = [], sw = {};
  const hit = (id, w, h, d, x, y, z, p = g, label = id) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitM); o.position.set(x, y, z); o.userData.sw = id; o.userData.label = label; p.add(o); hits.push(o); return o; };
  // gear handle (wheel-shaped knob, red light inside) and hook handle on the panel sides
  const gearH = new THREE.Group(); gearH.position.set(-0.41, -0.08, 0.02); P.add(gearH);
  box(0.012, 0.09, 0.012, metal, 0, 0, 0, gearH); const knob = cyl(0.026, 0.026, 0.02, M(0xe8e8e0), 0, 0.05, 0, gearH, Math.PI / 2, 0, 12);
  const gearRed = new THREE.Mesh(new THREE.CircleGeometry(0.012, 10), lit(0x300808)); gearRed.position.set(0, 0.05, 0.012); gearH.add(gearRed);
  hit('gear', 0.07, 0.13, 0.08, -0.41, -0.06, 0.03, P, 'LANDING GEAR');
  const hookH = new THREE.Group(); hookH.position.set(0.41, -0.08, 0.02); P.add(hookH);
  box(0.012, 0.09, 0.012, metal, 0, 0, 0, hookH); box(0.05, 0.016, 0.03, yellow, 0, 0.05, 0.005, hookH);
  hit('hook', 0.07, 0.13, 0.08, 0.41, -0.06, 0.03, P, 'ARRESTING HOOK');
  const hookLamp = lamp(0.04, 0.018, 0.41, -0.165, 0.006, 0xffb020, 0x1a1a1a, P);
  // toggle switches: a bat that flips up/down
  const toggle = (id, x, y, z, p, label, flat = false) => {
    const piv = new THREE.Group(); piv.position.set(x, y, z); p.add(piv);
    const bat = cyl(0.005, 0.007, 0.04, M(0xd0d0c8), 0, 0.02, 0, piv); if (flat) piv.rotation.x = -Math.PI / 2;
    cyl(0.012, 0.012, 0.008, metal, 0, 0, 0, piv);
    hit(id, 0.05, flat ? 0.04 : 0.06, flat ? 0.06 : 0.05, x, y + (flat ? 0.015 : 0), z + (flat ? 0 : 0.015), p, label);
    sw[id] = piv; return piv;
  };
  toggle('arm', -0.41, 0.12, 0.012, P, 'MASTER ARM');
  hit('mc', 0.075, 0.04, 0.03, -0.282, 0.885, -5.07, g, 'MASTER CAUTION RESET');
  hit('fireL', 0.08, 0.05, 0.04, -0.36, 0.885, -5.07, g, 'L FIRE - PUSH TO EXTINGUISH'); hit('fireR', 0.08, 0.05, 0.04, 0.36, 0.885, -5.07, g, 'R FIRE - PUSH TO EXTINGUISH');
  hit('jett', 0.05, 0.04, 0.03, -0.41, 0.24, 0.01, P, 'EMER JETT  -  JETTISON THE BOMBS');
  const jettB = cyl(0.014, 0.014, 0.012, redM, -0.41, 0.24, 0.008, P, Math.PI / 2, 0, 10);
  hit('eject', 0.2, 0.08, 0.08, 0, 0.2, -4.42, g, 'EJECT (CLICK TWICE)');
  // consoles (flat switch plates facing up; canvas top = forward)
  const conL = canvasTex(200, 640), conR = canvasTex(200, 640);
  plane(0.19, 0.62, new THREE.MeshLambertMaterial({ map: conL.tex, emissive: 0xffffff, emissiveMap: conL.tex, emissiveIntensity: 0.6 }), -0.43, 0.377, -4.25, g, -Math.PI / 2);
  plane(0.19, 0.62, new THREE.MeshLambertMaterial({ map: conR.tex, emissive: 0xffffff, emissiveMap: conR.tex, emissiveIntensity: 0.6 }), 0.43, 0.377, -4.25, g, -Math.PI / 2);
  toggle('flaps', -0.43, 0.38, -4.48, g, 'FLAPS AUTO / HALF / FULL', true);
  toggle('cas', 0.43, 0.38, -4.48, g, 'FCS  CAS / DIRECT', true);
  // start panel (right console): BATT, APU with its green READY light, the ENG CRANK switch (L / OFF / R: its bat tips
  // toward the engine it cranks; click the left or right half)
  toggle('batt', 0.39, 0.38, -4.36, g, 'BATTERY  ON / OFF', true); toggle('apu', 0.47, 0.38, -4.36, g, 'APU  ON / OFF (READY LIGHT WHEN IT CAN CRANK)', true);
  const apuReady = new THREE.Mesh(new THREE.CircleGeometry(0.009, 10), new THREE.MeshBasicMaterial({ color: 0x0c240c, toneMapped: false })); apuReady.rotation.x = -Math.PI / 2; apuReady.position.set(0.497, 0.378, -4.36); g.add(apuReady);
  const crankP = new THREE.Group(); crankP.position.set(0.43, 0.38, -4.13); g.add(crankP);
  cyl(0.005, 0.007, 0.04, M(0xd0d0c8), 0, 0.02, 0, crankP); cyl(0.012, 0.012, 0.008, metal, 0, 0, 0, crankP);
  hit('engL', 0.035, 0.04, 0.05, 0.41, 0.395, -4.13, g, 'ENG CRANK  L'); hit('engR', 0.035, 0.04, 0.05, 0.45, 0.395, -4.13, g, 'ENG CRANK  R');
  toggle('lights', 0.47, 0.38, -4.25, g, 'EXT LIGHTS', true); toggle('canopy', 0.39, 0.38, -4.25, g, 'CANOPY', true);
  toggle('pbrake', 0.43, 0.38, -4.02, g, 'PARKING BRAKE', true);
  // DDI / HI bezel page buttons (top row of each display)
  const PAGES = ['RDR', 'SMS', 'FCS', 'ENG', 'CHK'];   // CHK = the takeoff / landing CHECKLIST page (the HSI is on the HI)
  for (const [d, cx] of [['L', -0.255], ['R', 0.255]]) PAGES.forEach((pg, i) => { box(0.016, 0.012, 0.01, M(0x55585c), cx - 0.06 + i * 0.03, 0.035 + 0.088, 0.004, P); hit(`ddi${d}:${pg}`, 0.026, 0.02, 0.03, cx - 0.06 + i * 0.03, 0.035 + 0.088, 0.01, P, `DDI ${pg} PAGE`); });
  ['MAP', 'MAP+', 'MAP-'].forEach((pg, i) => { box(0.016, 0.012, 0.01, M(0x55585c), -0.03 + i * 0.03, -0.14 + 0.09, 0.004, P); hit(`ampcd:${pg}`, 0.026, 0.02, 0.03, -0.03 + i * 0.03, -0.14 + 0.09, 0.01, P, pg === 'MAP' ? 'HI  NORTH UP / TRACK UP' : pg === 'MAP+' ? 'HI  MAP SCALE IN' : 'HI  MAP SCALE OUT'); });
  // hover marker: a thin yellow frame that sits on whatever the crosshair / cursor is over
  const hov = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffd040, depthTest: false, transparent: true })); hov.renderOrder = 9; hov.visible = false; g.add(hov);

  // ---------------------------------------------------------------- stick, throttles, pedals, pilot
  const stickP = new THREE.Group(); stickP.position.set(0, -0.02, -4.66); g.add(stickP);
  cyl(0.06, 0.08, 0.06, black, 0, 0.0, 0, stickP);                            // boot
  cyl(0.014, 0.016, 0.42, metal, 0, 0.22, 0, stickP);
  const grip = new THREE.Group(); grip.position.set(0, 0.47, 0); stickP.add(grip);
  box(0.045, 0.13, 0.05, black, 0, 0, 0, grip, 0.15); box(0.012, 0.03, 0.015, M(0x333333), 0, 0.02, -0.03, grip);   // grip + trigger
  box(0.05, 0.03, 0.06, black, 0, 0.075, -0.005, grip);                       // head with the hat and buttons
  const thr = [-0.455, -0.405].map(x => { const t = new THREE.Group(); t.position.set(x, 0.38, -4.2); g.add(t); box(0.012, 0.11, 0.012, metal, 0, 0.055, 0, t); box(0.04, 0.05, 0.07, black, x < -0.43 ? -0.01 : 0.01, 0.12, 0, t); return t; });
  box(0.02, 0.015, 0.45, black, -0.43, 0.374, -4.18);                          // throttle slot
  const pedals = [-0.16, 0.16].map(x => { const p = new THREE.Group(); p.position.set(x, -0.14, -5.12); g.add(p); const pl = box(0.1, 0.2, 0.025, metal, 0, 0.06, 0, p, -0.35); box(0.02, 0.18, 0.02, dark, 0, -0.04, 0.06, p); return { p, pl }; });
  // the pilot: legs to the pedals, a hand on the stick and one on the throttle
  const limb = (a, b, r, m) => { const d = new THREE.Vector3().subVectors(b, a), o = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, d.length(), 7), m); o.position.copy(a).add(b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(o); return o; };
  for (const s of [-1, 1]) {
    const hip = new THREE.Vector3(s * 0.12, 0.3, -4.05), knee = new THREE.Vector3(s * 0.15, 0.46, -4.72), ank = new THREE.Vector3(s * 0.16, -0.06, -5.02);
    limb(hip, knee, 0.075, suit); limb(knee, ank, 0.058, suit);
    const boot = box(0.1, 0.09, 0.24, black, s * 0.16, -0.09, -5.08); boot.rotation.x = -0.35;
  }
  const handR = new THREE.Group(); grip.add(handR); box(0.07, 0.09, 0.07, glove, 0.0, -0.005, 0.01, handR); limb(new THREE.Vector3(0.12, 0.35, -4.25), new THREE.Vector3(0.03, 0.42, -4.6), 0.04, suit);
  const handL = new THREE.Group(); thr[0].add(handL); handL.position.set(0.02, 0.12, 0); box(0.08, 0.06, 0.09, glove, 0, 0.02, 0, handL);

  // ---------------------------------------------------------------- static panel art (labels, bezels)
  function drawArt(hover) {
    const c = art.ctx, W = 960, H = 620, px = x => (x + 0.48) * 1000, py = y => (0.3 - y) * 1000;
    c.fillStyle = '#2b3036'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#4b5258'; c.lineWidth = 3; c.strokeRect(4, 4, W - 8, H - 8);
    const bez = (cx, cy, s) => { c.fillStyle = '#16181b'; c.fillRect(px(cx - s / 2), py(cy + s / 2), s * 1000, s * 1000); c.strokeStyle = '#555c62'; c.strokeRect(px(cx - s / 2), py(cy + s / 2), s * 1000, s * 1000); };
    bez(-0.255, 0.035, 0.19); bez(0.255, 0.035, 0.19); bez(0, -0.14, 0.19); bez(-0.2, -0.205, 0.155); bez(0.205, -0.205, 0.155); bez(0, 0.19, 0.22); bez(0.25, 0.215, 0.115); bez(-0.235, 0.215, 0.18); bez(0.41, 0.225, 0.11); bez(0.41, 0.09, 0.14);
    c.fillStyle = '#e8e4d0'; c.font = `bold 12px ${FONT}`; c.textAlign = 'center';
    const lab = (t, x, y) => c.fillText(t, px(x), py(y));
    lab('MASTER ARM', -0.41, 0.175); lab('ARM', -0.41, 0.155); lab('SAFE', -0.41, 0.075); lab('EMER', -0.41, 0.285); lab('JETT', -0.41, 0.205);
    lab('RWR', 0.25, 0.152); lab('LDG GEAR', -0.41, 0.0); lab('HOOK', 0.41, -0.19); lab('CAUTION LIGHTS', 0.41, 0.012);
    lab('EFD', -0.2, -0.282); lab('STBY', 0.205, -0.282); lab('LEFT DDI', -0.255, -0.07); lab('RIGHT DDI', 0.255, -0.07); lab('HORIZONTAL INDICATOR', 0, -0.245);
    c.font = `bold 11px ${FONT}`;
    PAGES.forEach((pg, i) => { lab(pg, -0.255 - 0.06 + i * 0.03, 0.035 + 0.102); lab(pg, 0.255 - 0.06 + i * 0.03, 0.035 + 0.102); });
    ['N/T', 'SCL+', 'SCL-'].forEach((pg, i) => lab(pg, -0.03 + i * 0.03, -0.14 + 0.104));
    art.tex.needsUpdate = true;
    for (const [cv, items] of [[conL, [['FLAPS', 'AUTO HALF FULL', -4.48], ['THROTTLES', 'IDLE  MIL  MAX', -4.02]]], [conR, [['FCS', 'CAS / DIRECT', -4.48], ['BATT    APU', 'ON        READY', -4.36], ['CANOPY  LIGHTS', '', -4.25], ['ENG CRANK', 'L   OFF   R', -4.13], ['PARK BRK', '', -4.02]]]]) {
      const x = cv.ctx; x.fillStyle = '#262a2e'; x.fillRect(0, 0, 200, 640); x.strokeStyle = '#555'; x.strokeRect(2, 2, 196, 636);
      x.fillStyle = '#e8e4d0'; x.textAlign = 'center';
      for (const [t, s, z] of items) { const y = (z + 4.25 + 0.31) / 0.62 * 640; x.font = `bold 20px ${FONT}`; x.fillText(t, 100, y - 30); x.font = `14px ${FONT}`; x.fillText(s, 100, y + 44); }
      cv.tex.needsUpdate = true;
    }
  }
  drawArt();

  // ---------------------------------------------------------------- display painters
  // the DDIs are monochrome green CRTs: emphasis is brightness, not colour
  const PAL = { bg: '#020a04', fg: '#56f070', dim: '#2a8a3a', amb: '#c4ffc0', red: '#eaffe6', cy: '#8cff9a', wh: '#dcffd8' };
  const page = { L: 'RDR', R: 'FCS' }; let mapZoom = 1, mapTrack = true;
  function osb(ctx, W, labels, sel) {   // the page legends along the top edge, the selected one boxed
    ctx.font = `bold 15px ${FONT}`; ctx.textAlign = 'center';
    labels.forEach((l, i) => { const x = W / 2 + (i - (labels.length - 1) / 2) * (W * 0.19); ctx.fillStyle = l === sel ? PAL.bg : PAL.fg; if (l === sel) { ctx.fillStyle = PAL.fg; ctx.fillRect(x - 24, 4, 48, 20); ctx.fillStyle = PAL.bg; } ctx.fillText(l, x, 19); });
  }
  function txt(ctx, t, x, y, col = PAL.fg, size = 16, align = 'left') { ctx.fillStyle = col; ctx.font = `bold ${size}px ${FONT}`; ctx.textAlign = align; ctx.fillText(t, x, y); }
  const pages = {
    RDR(c, W, S, J) {   // B-scope: azimuth across, range up; contacts the radar sees ahead
      const R = S.radar || { range: 2000, contacts: [] }, top = 40, bot = W - 30, l = 30, r = W - 30, rng = R.range;
      c.strokeStyle = PAL.dim; c.lineWidth = 1; c.strokeRect(l, top, r - l, bot - top);
      for (let i = 1; i < 4; i++) { const y = top + (bot - top) * i / 4; c.beginPath(); c.moveTo(l, y); c.lineTo(l + 10, y); c.stroke(); c.beginPath(); c.moveTo(r - 10, y); c.lineTo(r, y); c.stroke(); }
      for (const a of [-30, 0, 30]) { const x = l + (r - l) * (a + 60) / 120; c.beginPath(); c.moveTo(x, bot); c.lineTo(x, bot - 8); c.stroke(); }
      for (const k of R.contacts) {
        const x = l + (r - l) * clamp((deg(k.az) + 60) / 120, 0, 1), y = bot - (bot - top) * clamp(k.range / rng, 0, 1);
        c.fillStyle = k.ship ? PAL.cy : PAL.fg; if (k.locked) { c.strokeStyle = PAL.amb; c.lineWidth = 2; c.strokeRect(x - 11, y - 11, 22, 22); c.lineWidth = 1; }
        if (k.ship) c.fillRect(x - 9, y - 3, 18, 6); else c.fillRect(x - 5, y - 5, 10, 10);
        c.fillStyle = PAL.dim; c.font = `12px ${FONT}`; c.textAlign = 'center'; c.fillText(k.alt, x, y + 18);
      }
      txt(c, `RWS  ${(rng / 1000).toFixed(1)} KM`, l, W - 8, PAL.fg, 15); txt(c, `${R.contacts.length} TGT`, r, W - 8, PAL.fg, 15, 'right');
      if (S.tgt) txt(c, `${S.tgt.name}  ${(S.tgt.range / 1000).toFixed(2)} KM  ${S.tgt.lock ? 'LOCK' : ''}`, W / 2, top + 22, PAL.amb, 14, 'center');
    },
    SMS(c, W, S, J) {   // stores: top view of the jet with what is left on each station
      const cx = W / 2, cy = W / 2 + 20, k = 26;
      c.strokeStyle = PAL.fg; c.lineWidth = 2; c.beginPath();
      c.moveTo(cx, cy - 5.5 * k); c.lineTo(cx + 0.9 * k, cy - 1.5 * k); c.lineTo(cx + 5.5 * k, cy + 1.2 * k); c.lineTo(cx + 5.5 * k, cy + 1.9 * k); c.lineTo(cx + 1.2 * k, cy + 2.2 * k);
      c.lineTo(cx + 2.8 * k, cy + 4.3 * k); c.lineTo(cx, cy + 4.0 * k); c.lineTo(cx - 2.8 * k, cy + 4.3 * k); c.lineTo(cx - 1.2 * k, cy + 2.2 * k); c.lineTo(cx - 5.5 * k, cy + 1.9 * k);
      c.lineTo(cx - 5.5 * k, cy + 1.2 * k); c.lineTo(cx - 0.9 * k, cy - 1.5 * k); c.closePath(); c.stroke();
      const st = J.stores, sel = S.mode;
      [[-5.9, 0], [5.9, 0]].forEach(([x], i) => txt(c, st.aam[i] ? '9L' : '--', cx + x * k * 0.92, cy + 2.9 * k, st.aam[i] ? (sel === 'AA' ? PAL.wh : PAL.fg) : PAL.dim, 15, 'center'));
      [-3.9, -2.6, 2.6, 3.9].forEach((x, i) => txt(c, st.bomb[i] ? '82' : '--', cx + x * k, cy + 2.9 * k + (i % 2) * 18, st.bomb[i] ? (sel === 'AG' ? PAL.wh : PAL.fg) : PAL.dim, 15, 'center'));
      txt(c, `GUN ${J.gun * 5}`, cx, cy - 2.6 * k, PAL.fg, 16, 'center');
      txt(c, S.arm ? 'ARM' : 'SAFE', 20, W - 12, S.arm ? PAL.amb : PAL.fg, 18); txt(c, { NAV: 'NAV', AA: 'A/A  AIM-9L', AG: 'A/G  MK-82 CCIP' }[sel], W - 20, W - 12, PAL.fg, 15, 'right');
    },
    FCS(c, W, S, J) {   // flight control surfaces, live, in degrees (like the Hornet's FCS page)
      const s = J.surf, d = v => `${Math.round(deg(v))}`.padStart(3, ' ');
      const cell = (label, v, x, y) => { c.strokeStyle = PAL.dim; c.strokeRect(x - 34, y - 20, 68, 28); txt(c, d(v), x + 4, y + 2, PAL.fg, 18, 'center'); txt(c, label, x < W / 2 ? x + 44 : x - 44, y + 2, PAL.dim, 13, x < W / 2 ? 'left' : 'right'); };
      const yL = [92, 146, 200, 254, 308], xL = 50, xR = W - 50;   // left surfaces down the left side, right ones down the right
      cell('LEF', s.lef * 0.6, xL, yL[0]); cell('LEF', s.lef * 0.6, xR, yL[0]); cell('TEF', s.flap * 0.78, xL, yL[1]); cell('TEF', s.flap * 0.78, xR, yL[1]);
      cell('AIL', s.ail, xL, yL[2]); cell('AIL', -s.ail, xR, yL[2]); cell('RUD', s.rud, xL, yL[3]); cell('RUD', s.rud, xR, yL[3]);
      cell('STAB', s.stab + s.ail * 0.2, xL, yL[4]); cell('STAB', s.stab - s.ail * 0.2, xR, yL[4]);
      txt(c, 'L', xL, 62, PAL.wh, 16, 'center'); txt(c, 'R', xR, 62, PAL.wh, 16, 'center');
      txt(c, J.casActive || (J.cas && J.onGround) ? 'CAS' : 'DIRECT', W / 2, 120, J.cas ? PAL.fg : PAL.amb, 22, 'center');
      txt(c, J.pa ? 'PA' : 'UA', W / 2, 150, PAL.fg, 18, 'center'); if (J.limiter) txt(c, 'AOA LIM', W / 2, 180, PAL.amb, 16, 'center');
      if (S.dmg && !S.dmg.fcsOk) txt(c, 'FCS FAIL', W / 2, 220, PAL.red, 18, 'center');
    },
    ENG(c, W, S, J) {   // engine and fuel page
      const row = (label, a, b, y, unit = '') => { txt(c, label, W / 2, y, PAL.dim, 14, 'center'); txt(c, a + unit, W / 2 - 70, y, PAL.fg, 20, 'right'); txt(c, b + unit, W / 2 + 70, y, PAL.fg, 20, 'left'); };
      const [L, R] = J.eng;
      txt(c, 'L', W / 2 - 100, 60, PAL.wh, 16, 'center'); txt(c, 'R', W / 2 + 100, 60, PAL.wh, 16, 'center');
      row('RPM %', Math.round(L.n * 100), Math.round(R.n * 100), 95); row('EGT C', Math.round(L.egt), Math.round(R.egt), 130);
      row('FF PPH', Math.round(L.ff * 7937 / 10) * 10, Math.round(R.ff * 7937 / 10) * 10, 165); row('NOZ %', Math.round(L.nozzle * 100), Math.round(R.nozzle * 100), 200);
      row('OIL PSI', Math.round(L.oil), Math.round(R.oil), 235); row('THRUST KN', (L.thrust / 1000).toFixed(0), (R.thrust / 1000).toFixed(0), 270);
      txt(c, `FUEL ${Math.round(J.fuel * LB / 10) * 10} LB`, W / 2, 315, J.fuel * LB < S.bingo ? PAL.amb : PAL.fg, 20, 'center');
      txt(c, `GW ${Math.round(J.mass * LB / 100) / 10}K LB`, W / 2, 342, PAL.dim, 15, 'center');
    },
    CHK(c, W, S, J) {   // CHECKLIST page: the takeoff checklist on deck, the landing checklist in the air, items live
      const ground = J.onGround || !!J.cat, a = deg(J.alpha);
      txt(c, ground ? 'TAKEOFF CHECKLIST' : 'LANDING CHECKLIST', W / 2, 62, PAL.wh, 18, 'center');
      const rows = ground ? [
        ['CANOPY', J.canopyCmd ? 'OPEN' : 'CLOSED', !J.canopyCmd && J.canopy < 0.02],
        ['FLAPS', ['AUTO', 'HALF', 'FULL'][J.flapSel], J.flapSel > 0],
        ['TRIM', 'T/O', true],
        ['SPD BRK', J.surf.brake > 0.05 ? 'OUT' : 'IN', J.surf.brake <= 0.05],
        ['L BAR', J.launchBar ? 'DOWN' : 'UP', !!J.cat || !J.launchBar],
        ['HOOK', J.hookCmd ? 'DOWN' : 'UP', !J.hookCmd],
        ['PARK BRK', S.pbrake ? 'SET' : 'OFF', !S.pbrake || !J.cat],
        ['FCS', J.cas ? 'CAS' : 'DIRECT', J.cas],
        ['FUEL', `${Math.round(J.fuel * LB / 100) * 100}`, J.fuel * LB > S.bingo],
      ] : [
        ['GEAR', J.gear > 0.99 ? 'DOWN' : J.gear > 0.01 ? 'TRANSIT' : 'UP', J.gear > 0.99],
        ['FLAPS', ['AUTO', 'HALF', 'FULL'][J.flapSel], J.flapSel === 2],
        ['HOOK', J.hookCmd ? 'DOWN' : 'UP', !!J.hookCmd],
        ['SPD BRK', J.surf.brake > 0.05 ? 'OUT' : 'IN', J.surf.brake <= 0.05],
        ['L BAR', J.launchBar ? 'DOWN' : 'UP', !J.launchBar],
        ['MASTER ARM', S.arm ? 'ARM' : 'SAFE', !S.arm],
        ['AOA', a.toFixed(1), J.pa ? Math.abs(a - 8.1) < 0.7 : true],
        ['FUEL', `${Math.round(J.fuel * LB / 100) * 100}`, J.fuel * LB > 800],
      ];
      rows.forEach(([k, v, good], i) => {
        const y = 100 + i * 25; txt(c, k, 40, y, PAL.fg, 16); txt(c, v, W - 70, y, good ? PAL.fg : PAL.amb, 16, 'right');
        if (good) txt(c, '✓', W - 40, y, PAL.fg, 16, 'center'); else if ((performance.now() % 700) < 450) { c.strokeStyle = PAL.amb; c.lineWidth = 1.5; c.strokeRect(W - 160, y - 17, 140, 22); }
      });
    },
  };
  function drawDDI(d, side, S, J) {
    const c = d.ctx, W = d.w; c.fillStyle = S.power ? PAL.bg : '#030404'; c.fillRect(0, 0, W, W);
    if (!S.power) { d.tex.needsUpdate = true; return; }   // no generator, no DDI
    if (S.flicker && Math.random() < 0.5) { txt(c, 'NO VIDEO', W / 2, W / 2, PAL.dim, 18, 'center'); d.tex.needsUpdate = true; return; }
    pages[page[side]](c, W, S, J); osb(c, W, PAGES, page[side]);
    // the Hornet's caution messages come up on the left DDI over whatever page it shows
    const L = side === 'L' && S.ddiCautions; if (L && L.length) {
      const n = Math.min(4, L.length), h = 18 + Math.ceil(n / 2) * 20; c.fillStyle = PAL.bg; c.fillRect(0, W - h - 4, W, h + 4); c.strokeStyle = PAL.fg; c.lineWidth = 1.5; c.strokeRect(6, W - h - 2, W - 12, h);
      for (let i = 0; i < n; i++) txt(c, L[i], 18 + (i % 2) * (W / 2 - 6), W - h + 15 + Math.floor(i / 2) * 20, PAL.amb, 16);
    }
    d.tex.needsUpdate = true;
  }
  // HI (horizontal indicator): the projected moving map (colour film in the real set) with the HSI drawn over it:
  // compass rose round the aircraft, heading box, the TACAN needle to the carrier and the course line to the waypoint
  function drawMap(S, J) {
    const c = ampcd.ctx, W = ampcd.w, hd = J.heading(), up = mapTrack ? hd : 0, cx = W / 2, cy = W / 2 + 8, R = W * 0.4;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, W);
    if (!S.power) { ampcd.tex.needsUpdate = true; return; }
    const scale = W / (1600 / mapZoom);
    c.save(); c.translate(cx, cy); c.rotate(-up); c.scale(scale, scale); c.translate(-J.pos.x, -J.pos.z);
    if (S.drawMap) S.drawMap(c, scale);
    c.restore();
    const SY = '#f2f2e8', SY2 = '#ffd860', rel = b => b - up - Math.PI / 2;
    c.strokeStyle = SY; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R, 0, 6.283); c.stroke();
    for (let a = 0; a < 360; a += 10) {
      const t = rel(a * Math.PI / 180), l = a % 30 ? 7 : 14;
      c.beginPath(); c.moveTo(cx + Math.cos(t) * R, cy + Math.sin(t) * R); c.lineTo(cx + Math.cos(t) * (R - l), cy + Math.sin(t) * (R - l)); c.stroke();
      if (a % 30 === 0) txt(c, a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a / 10), cx + Math.cos(t) * (R - 26), cy + Math.sin(t) * (R - 26) + 6, SY, 15, 'center');
    }
    if (S.wpt) {   // course line from the aircraft to the selected island, its name and distance
      const t = rel(S.wpt.brg); c.setLineDash([8, 6]); c.strokeStyle = SY2; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(t) * R, cy + Math.sin(t) * R); c.stroke(); c.setLineDash([]);
      txt(c, `${S.wpt.name.slice(0, 9)} ${(S.wpt.dist / 1852).toFixed(1)}`, W - 8, W - 10, SY2, 14, 'right');
    }
    if (S.carrier) {   // TACAN bearing needle (head + tail) to the ALBATROSS, and the DME range
      const t = rel(S.carrier.brg); c.strokeStyle = '#7fe8ff'; c.fillStyle = '#7fe8ff'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx - Math.cos(t) * (R - 4), cy - Math.sin(t) * (R - 4)); c.lineTo(cx - Math.cos(t) * (R - 22), cy - Math.sin(t) * (R - 22)); c.stroke();
      const hx = cx + Math.cos(t) * (R - 4), hy = cy + Math.sin(t) * (R - 4), px = -Math.sin(t), py = Math.cos(t);
      c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx - Math.cos(t) * 20 + px * 8, hy - Math.sin(t) * 20 + py * 8); c.lineTo(hx - Math.cos(t) * 20 - px * 8, hy - Math.sin(t) * 20 - py * 8); c.fill();
      txt(c, `TCN ${String(Math.round((deg(S.carrier.brg) + 360) % 360)).padStart(3, '0')} ${(S.carrier.dist / 1852).toFixed(1)}`, 8, W - 10, '#7fe8ff', 14);
    }
    c.save(); c.translate(cx, cy); c.rotate(hd - up);   // the aircraft symbol
    c.strokeStyle = SY; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -14); c.lineTo(0, 12); c.moveTo(-11, -2); c.lineTo(11, -2); c.moveTo(-5, 10); c.lineTo(5, 10); c.stroke(); c.restore();
    c.fillStyle = '#000'; c.fillRect(cx - 26, 30, 52, 24); c.strokeStyle = SY; c.lineWidth = 1.5; c.strokeRect(cx - 26, 30, 52, 24);
    txt(c, String(Math.round((deg(hd) + 360) % 360)).padStart(3, '0'), cx, 49, SY, 18, 'center');
    txt(c, mapTrack ? 'HDG UP' : 'N UP', 8, 48, SY, 13); txt(c, `${(800 / mapZoom / 1852).toFixed(2)} NM`, W - 8, 48, SY, 13, 'right');
    osb(c, W, ['N/T', 'SCL+', 'SCL-'], ''); ampcd.tex.needsUpdate = true;
  }
  // EFD (engine fuel display): reflective LCD, dark segments on grey-green; engines left / right, fuel and BINGO
  function drawIFEI(S, J) {
    const c = ifei.ctx, W = 336, H = 192; c.fillStyle = '#8e9a86'; c.fillRect(0, 0, W, H); c.fillStyle = '#9fab96'; c.fillRect(6, 6, W - 12, H - 12);
    const [L, R] = J.eng, col = '#11160f', lc = '#3b4436', row = (lab, a, b, y) => { txt(c, a, 96, y, col, 23, 'right'); txt(c, lab, 132, y - 2, lc, 13, 'center'); txt(c, b, 212, y, col, 23, 'right'); };
    const on = S.battPower !== false;   // the EFD runs on the battery
    if (on) {
      row('RPM', Math.round(L.n * 100), Math.round(R.n * 100), 34); row('TEMP', Math.round(L.egt), Math.round(R.egt), 64);
      row('FF', Math.round(L.ff * 79.4), Math.round(R.ff * 79.4), 94); row('NOZ', Math.round(L.nozzle * 100), Math.round(R.nozzle * 100), 124); row('OIL', Math.round(L.oil), Math.round(R.oil), 154);
      const lb = Math.round(J.fuel * LB / 10) * 10, low = lb < S.bingo && (performance.now() % 800) < 500;
      if (!(lb < S.bingo) || low) txt(c, `${lb}`, W - 12, 40, col, 24, 'right');
      txt(c, 'TOTAL', W - 12, 60, lc, 12, 'right'); txt(c, `${S.bingo}`, W - 12, 112, col, 20, 'right'); txt(c, 'BINGO', W - 12, 130, lc, 12, 'right');
    }
    c.strokeStyle = '#59644f'; c.lineWidth = 2; c.beginPath(); c.moveTo(222, 14); c.lineTo(222, H - 14); c.stroke();
    ifei.tex.needsUpdate = true;
  }
  function needle(c, cx, cy, r, a, col = '#fff', w = 3) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r); c.stroke(); }
  function dialFace(c, cx, cy, r, n, labels) {
    c.fillStyle = '#0c0d0e'; c.beginPath(); c.arc(cx, cy, r, 0, 6.283); c.fill(); c.strokeStyle = '#ddd'; c.lineWidth = 2;
    for (let i = 0; i < n; i++) { const a = i / n * 6.283; c.beginPath(); c.moveTo(cx + Math.sin(a) * r * 0.82, cy - Math.cos(a) * r * 0.82); c.lineTo(cx + Math.sin(a) * r * 0.95, cy - Math.cos(a) * r * 0.95); c.stroke(); }
    if (labels) labels.forEach((t, i) => txt(c, t, cx + Math.sin(i / labels.length * 6.283) * r * 0.62, cy - Math.cos(i / labels.length * 6.283) * r * 0.62 + 5, '#ddd', 13, 'center'));
  }
  function drawStby(S, J) {   // standby: airspeed, attitude, altimeter, vertical speed
    const c = stby.ctx, W = 300; c.fillStyle = '#1a1c1e'; c.fillRect(0, 0, W, W); const r = 66;
    const kt = J.eas * KT; dialFace(c, 75, 75, r, 20, ['0', '100', '200', '300', '400', '500', '600', '700']);
    needle(c, 75, 75, r * 0.85, clamp(kt, 0, 800) / 800 * 6.283); txt(c, 'KNOTS', 75, 108, '#aaa', 11, 'center');
    {   // attitude ball
      const att = J.attitude(); c.save(); c.beginPath(); c.arc(225, 75, r, 0, 6.283); c.clip(); c.translate(225, 75); c.rotate(-att.roll);
      const off = clamp(deg(att.pitch), -90, 90) * 2.2; c.fillStyle = '#3c78c8'; c.fillRect(-120, -260 + off, 240, 260); c.fillStyle = '#6a4626'; c.fillRect(-120, off, 240, 260);
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(-90, off); c.lineTo(90, off); c.stroke();
      for (const p of [-20, -10, 10, 20]) { c.beginPath(); c.moveTo(-18, off - p * 2.2); c.lineTo(18, off - p * 2.2); c.stroke(); }
      c.restore(); c.strokeStyle = '#ffd040'; c.lineWidth = 4; c.beginPath(); c.moveTo(190, 75); c.lineTo(215, 75); c.lineTo(225, 84); c.lineTo(235, 75); c.lineTo(260, 75); c.stroke();
    }
    const ft = J.pos.y * FT; dialFace(c, 75, 225, r, 10, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    needle(c, 75, 225, r * 0.85, (ft % 1000) / 1000 * 6.283); needle(c, 75, 225, r * 0.5, (ft % 10000) / 10000 * 6.283, '#ccc', 5);
    txt(c, String(Math.round(ft)).padStart(5, ' '), 75, 262, '#fff', 14, 'center');
    const vs = J.vel.y * FT * 60 / 1000; dialFace(c, 225, 225, r, 12, ['0', '1', '2', '4', '6', '', '6', '4', '2', '1']);
    needle(c, 225, 225, r * 0.85, -Math.PI / 2 + clamp(vs, -6, 6) / 6 * Math.PI * 0.9 + Math.PI / 2 - Math.PI / 2); txt(c, 'VSI', 225, 262, '#aaa', 11, 'center');
    stby.tex.needsUpdate = true;
  }
  // F/A-18A caution light panel, panel order (NATOPS): 3 columns x 4 rows, amber legends; the rest of the Hornet's
  // cautions are messages on the left DDI
  const CAUTS = ['CK SEAT', 'APU ACC', 'BATT SW', 'FCS HOT', 'GEN TIE', '', 'FUEL LO', 'FCES', '', 'L GEN', 'R GEN', ''];
  let cautKey = null;
  function drawCaut(S) {
    const lit = S.cautLights || [], k = lit.join(); if (k === cautKey) return; cautKey = k;
    const c = caut.ctx; c.fillStyle = '#0a0b0c'; c.fillRect(0, 0, 200, 260);
    CAUTS.forEach((t, i) => { const x = (i % 3) * 66 + 3, y = Math.floor(i / 3) * 64 + 3, on = t && lit.includes(t); c.fillStyle = on ? '#f0a418' : '#1c1a16'; c.fillRect(x, y, 62, 60); if (t) t.split(' ').forEach((w, j, a) => txt(c, w, x + 31, y + 34 + (j - (a.length - 1) / 2) * 17, on ? '#1a1000' : '#4a463c', 14, 'center')); });
    caut.tex.needsUpdate = true;
  }
  function drawGearLights(J, S) {
    const c = gearL.ctx; c.fillStyle = '#0a0b0c'; c.fillRect(0, 0, 160, 120);
    const bp = S.battPower !== false, down = bp && J.gear > 0.99, moving = bp && J.gear > 0.01 && J.gear <= 0.99;
    ['NOSE', 'LEFT', 'RIGHT'].forEach((t, i) => { c.fillStyle = down ? '#30d040' : '#1b1d1b'; c.fillRect(4 + i * 52, 6, 48, 44); txt(c, t, 28 + i * 52, 34, down ? '#041' : '#444', 12, 'center'); });
    const f = bp ? J.surf.flap : 0; [['HALF', f > 0.3 && f < 0.7], ['FULL', f > 0.9], ['FLAPS', f > 0.05 && J.surf.flap !== [0, 0.5, 1][J.flapSel]]].forEach(([t, on], i) => { c.fillStyle = on ? (i === 2 ? '#e8a010' : '#30d040') : '#1b1d1b'; c.fillRect(4 + i * 52, 62, 48, 44); txt(c, t, 28 + i * 52, 90, on ? '#041' : '#444', 12, 'center'); });
    gearL.tex.needsUpdate = true; gearRed.material.color.setHex(moving ? 0xff2010 : 0x300808);
  }
  // UFC (up-front control): function selector buttons across the top, the scratchpad, the 3 x 4 keypad, five option
  // windows down the right with their select buttons, COMM 1 / COMM 2 channel windows at the bottom corners
  function drawUFC(S, J) {
    const c = ufc.ctx, G = '#6dff7c', pw = S.power; c.fillStyle = '#1a1d20'; c.fillRect(0, 0, 400, 220);
    ['A/P', 'IFF', 'TCN', 'ILS', 'D/L', 'BCN', 'ON/OFF'].forEach((t, i) => { c.fillStyle = '#2f3438'; c.fillRect(8 + i * 55, 6, 50, 24); txt(c, t, 33 + i * 55, 23, '#d8d8d0', 12, 'center'); });
    c.fillStyle = '#04100a'; c.fillRect(10, 36, 236, 40); if (pw) txt(c, S.ufc || `${S.mode}  ${S.arm ? 'ARM' : 'SAFE'}`, 128, 64, G, 22, 'center');
    const opts = S.ufcOpt || [];
    for (let i = 0; i < 5; i++) { const y = 36 + i * 30; c.fillStyle = '#2f3438'; c.fillRect(254, y + 2, 20, 24); c.fillStyle = '#04100a'; c.fillRect(278, y, 114, 28); if (pw && opts[i]) txt(c, opts[i], 284, y + 21, G, 16); }
    '123456789C0E'.split('').forEach((k, i) => { const x = 22 + (i % 3) * 60, y = 84 + Math.floor(i / 3) * 33; c.fillStyle = '#2f3438'; c.fillRect(x, y, 52, 28); txt(c, k === 'C' ? 'CLR' : k === 'E' ? 'ENT' : k, x + 26, y + 20, '#e8e8e0', k > '9' ? 13 : 17, 'center'); });
    c.fillStyle = '#04100a'; c.fillRect(200, 190, 40, 26); c.fillRect(352, 190, 40, 26); if (pw) { txt(c, '15', 220, 210, G, 16, 'center'); txt(c, 'G', 372, 210, G, 16, 'center'); }
    txt(c, 'COMM 1', 220, 184, '#9a9890', 10, 'center'); txt(c, 'COMM 2', 372, 184, '#9a9890', 10, 'center');
    ufc.tex.needsUpdate = true;
  }
  // ---------------------------------------------------------------- HUD
  const hc = hud.ctx;
  // project a jet-local direction through the eye onto the combiner: returns canvas px or null when off the glass
  const _pr = [0, 0];
  function projLocal(d) {
    if (d.z > -1e-4) return null;
    const t = (HUD.z - JEYE.z) / d.z, x = JEYE.x + d.x * t, y = JEYE.y + d.y * t - HUD.cy;
    _pr[0] = HUD.W / 2 + x / HUD.hw * HUD.W / 2; _pr[1] = HUD.H / 2 - y / HUD.hh * HUD.H / 2; return _pr;
  }
  function projWorldDir(J, dw) { _v.copy(dw).applyQuaternion(_iq); return projLocal(_v); }
  function projWorldPt(J, p) { _v.copy(p).sub(_eye).applyQuaternion(_iq); if (_v.z > -0.5) return null; _v.normalize(); return projLocal(_v); }
  const onGlass = p => p && p[0] > 4 && p[0] < HUD.W - 4 && p[1] > 4 && p[1] < HUD.H - 4;
  function drawHUD(J, S) {
    const c = hc, W = HUD.W, H = HUD.H; c.clearRect(0, 0, W, H);
    if (!S.power) { hud.tex.needsUpdate = true; return; }
    if (S.flicker && Math.random() < 0.35) { hud.tex.needsUpdate = true; return; }
    c.save(); c.strokeStyle = GRN; c.fillStyle = GRN; c.lineWidth = 3; c.font = `bold 20px ${FONT}`; c.shadowColor = 'rgba(80,255,110,.8)'; c.shadowBlur = 4;
    const line = (x0, y0, x1, y1) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
    const T = (t, x, y, a = 'center', sz = 17) => { c.font = `bold ${Math.round(sz * 1.2)}px ${FONT}`; c.textAlign = a; c.fillText(t, x, y); };
    // waterline (boresight) and the flight path marker
    const wl = projLocal(_w.set(0, 0, -1)); if (wl) { const [x, y] = wl; line(x - 18, y, x - 8, y); line(x - 8, y, x - 4, y + 6); line(x - 4, y + 6, x, y); line(x, y, x + 4, y + 6); line(x + 4, y + 6, x + 8, y); line(x + 8, y, x + 18, y); }
    let fpm = null;
    if (J.tas > 8) { const p = projWorldDir(J, _w.copy(J.vel).normalize()); if (p) { fpm = [clamp(p[0], 20, W - 20), clamp(p[1], 20, H - 20)]; } }
    const fx = fpm ? fpm[0] : W / 2, fy = fpm ? fpm[1] : H / 2;
    // pitch ladder: conformal, every 5 degrees, centred on the flight path's heading
    const hv = Math.atan2(J.vel.x, -J.vel.z), vh = J.tas > 8 ? hv : J.heading();
    for (let k = -90; k <= 90; k += 5) {
      const e = k * Math.PI / 180, mk = (dpsi) => projWorldDir(J, _w.set(Math.sin(vh + dpsi) * Math.cos(e), Math.sin(e), -Math.cos(vh + dpsi) * Math.cos(e)));
      const half = k === 0 ? 0.2 : 0.075, gap = k === 0 ? 0.035 : 0.025;
      const a0 = mk(-half), a0b = a0 && [a0[0], a0[1]], a1 = mk(-gap), a1b = a1 && [a1[0], a1[1]], b0 = mk(gap), b0b = b0 && [b0[0], b0[1]], b1 = mk(half), b1b = b1 && [b1[0], b1[1]];
      if (!a0b || !a1b || !b0b || !b1b) continue;
      if (Math.max(a0b[1], b1b[1]) < -40 || Math.min(a0b[1], b1b[1]) > H + 40) continue;
      c.setLineDash(k < 0 ? [8, 6] : []);
      line(a0b[0], a0b[1], a1b[0], a1b[1]); line(b0b[0], b0b[1], b1b[0], b1b[1]); c.setLineDash([]);
      if (k !== 0) {
        const nx = (b1b[1] - a0b[1]), ny = -(b1b[0] - a0b[0]), nl = Math.hypot(nx, ny) || 1, tk = (k > 0 ? 9 : -9) / nl;
        line(a0b[0], a0b[1], a0b[0] - nx * tk, a0b[1] - ny * tk); line(b1b[0], b1b[1], b1b[0] - nx * tk, b1b[1] - ny * tk);
        T(String(Math.abs(k)), a0b[0] - 16, a0b[1] + 6, 'right', 14); T(String(Math.abs(k)), b1b[0] + 16, b1b[1] + 6, 'left', 14);
      }
    }
    // flight path marker: circle with wings and a fin
    c.beginPath(); c.arc(fx, fy, 8, 0, 6.283); c.stroke(); line(fx - 8, fy, fx - 22, fy); line(fx + 8, fy, fx + 22, fy); line(fx, fy - 8, fx, fy - 16);
    if (J.pa && J.tas > 8) {   // AoA approach bracket: on-speed (8.1 deg) when the FPM sits in its middle
      const bx = fx - 30, a = deg(J.alpha), by = fy + (a - 8.1) * 9;
      line(bx, by - 18, bx, by + 18); line(bx, by - 18, bx + 6, by - 18); line(bx, by + 18, bx + 6, by + 18); line(bx - 6, by, bx, by);
    }
    // speed box (left), altitude box (right), heading tape (top)
    const box = (x, y, w, h, t) => { c.strokeRect(x - w / 2, y - h / 2, w, h); T(t, x, y + 7, 'center', 20); };
    box(70, H / 2 - 30, 82, 30, String(Math.round(J.eas * KT)));
    const ftv = J.pos.y * FT, aglft = S.agl * FT;
    box(W - 76, H / 2 - 30, 92, 30, aglft < 1500 && S.agl < 400 ? `${Math.round(aglft / 10) * 10}R` : String(Math.round(ftv / 10) * 10));
    T(`M ${J.mach.toFixed(2)}`, 70, H / 2 + 10, 'center', 15); T(`G ${J.nz.toFixed(1)}`, 70, H / 2 + 30, 'center', 15);
    T(`α ${deg(J.alpha).toFixed(1)}`, 70, H / 2 - 62, 'center', 15);
    if (J.nzMax > 4) T(`${J.nzMax.toFixed(1)}`, 70, H / 2 + 50, 'center', 14);
    T(`${J.vel.y >= 0 ? '+' : ''}${Math.round(J.vel.y * FT * 60)}`, W - 76, H / 2 + 10, 'center', 14);
    {
      const hd = (deg(J.heading()) + 360) % 360, cx = W / 2, y = 36;
      for (let a = Math.ceil((hd - 12) / 5) * 5; a <= hd + 12; a += 5) { const x = cx + (a - hd) * 13; line(x, y, x, y + (a % 10 ? 6 : 11)); if (a % 10 === 0) T(String(((a + 360) % 360) / 10 | 0).padStart(2, '0'), x, y - 4, 'center', 14); }
      line(cx, y + 14, cx - 6, y + 22); line(cx, y + 14, cx + 6, y + 22);
    }
    // carrier: ship symbol on its position, range, and in PA mode the ICLS needles (glideslope / centreline)
    if (S.carrier) {
      const p = projWorldPt(J, S.carrier.pos); if (onGlass(p)) { c.strokeRect(p[0] - 10, p[1] - 4, 20, 8); line(p[0], p[1] - 4, p[0], p[1] - 10); }
      T(`CV ${(S.carrier.dist / 1852).toFixed(1)}`, W - 76, H / 2 + 74, 'center', 14);
      if (J.pa && S.carrier.icls) {
        const { gs, loc } = S.carrier.icls, cx = W / 2, cy = H / 2 + 10;   // needle offsets in degrees: +gs = above path, +loc = right of centreline
        c.setLineDash([3, 4]); line(cx - 70, cy + clamp(gs, -1.5, 1.5) * 50, cx + 70, cy + clamp(gs, -1.5, 1.5) * 50); line(cx - clamp(loc, -3, 3) * 25, cy - 70, cx - clamp(loc, -3, 3) * 25, cy + 70); c.setLineDash([]);
      }
    }
    // weapons
    if (S.mode === 'AA') {
      const sk = S.seeker; if (sk) { const p = projWorldDir(J, sk.dir); if (p) { c.beginPath(); c.arc(p[0], p[1], sk.locked ? 14 : 40, 0, 6.283); c.stroke(); } }
      T(`AIM-9 ${J.stores.aam.filter(Boolean).length}`, 70, H - 22, 'center', 15);
    } else if (S.mode === 'AG') {
      T(`MK-82 ${J.stores.bomb.filter(Boolean).length}`, 70, H - 22, 'center', 15);
      if (S.ccip) {
        const p = projWorldPt(J, S.ccip);
        if (p) {   // displayed impact line from the FPM down to the pipper; off the glass the pipper sits on the edge, dashed
          const px = clamp(p[0], 14, W - 14), py = clamp(p[1], 14, H - 14), off = px !== p[0] || py !== p[1];
          if (off) c.setLineDash([6, 6]); line(fx, fy + 8, px, py); c.setLineDash([]);
          c.beginPath(); c.arc(px, py, 7, 0, 6.283); c.stroke(); c.fillRect(px - 1.5, py - 1.5, 3, 3);
          if (!off) T('REL', px + 26, py + 6, 'left', 13);
        }
      }
    } else T('NAV', 70, H - 22, 'center', 15);
    T(`${S.arm ? 'ARM' : 'SAFE'}  GUN ${J.gun * 5}`, W - 80, H - 22, 'center', 14);
    if (S.pipper) {   // gun pipper: where the rounds fired now will be at the target range (with target lead)
      const p = projWorldPt(J, S.pipper); if (onGlass(p)) { c.beginPath(); c.arc(p[0], p[1], 18, 0, 6.283); c.stroke(); c.fillRect(p[0] - 2, p[1] - 2, 4, 4);
        if (S.tgt) { const fr = clamp(S.tgt.range / 1200, 0, 1); c.lineWidth = 4; c.beginPath(); c.arc(p[0], p[1], 22, -Math.PI / 2, -Math.PI / 2 + fr * 6.283); c.stroke(); c.lineWidth = 2.2; } }
    }
    if (S.tgt) {   // target designator box on the radar target, range, and the SHOOT cue
      const p = projWorldPt(J, S.tgt.pos);
      if (onGlass(p)) { c.strokeRect(p[0] - 13, p[1] - 13, 26, 26); if (S.tgt.lock) { c.beginPath(); c.moveTo(p[0], p[1] - 19); c.lineTo(p[0] + 19, p[1]); c.lineTo(p[0], p[1] + 19); c.lineTo(p[0] - 19, p[1]); c.closePath(); c.stroke(); } }
      else { const a = Math.atan2(-(_v.y), _v.x); line(W / 2, H / 2, W / 2 + Math.cos(a) * 60, H / 2 + Math.sin(a) * 60); }
      T(`${(S.tgt.range / 1852).toFixed(1)}`, W - 76, H / 2 + 52, 'center', 15);
      if (S.tgt.shoot && (performance.now() % 600) < 400) T('SHOOT', W / 2, H - 52, 'center', 22);
    }
    // bank angle scale at the bottom of the glass: ticks at 0, 5, 10, 15, 20, 30, 45 degrees, the caret is the bank
    { const bx = W / 2, by = H - 160, br = 82, roll = J.attitude().roll;
      for (const a of [-45, -30, -20, -15, -10, -5, 0, 5, 10, 15, 20, 30, 45]) { const p = a * Math.PI / 180, l = a % 15 ? 7 : 13; line(bx + Math.sin(p) * br, by + Math.cos(p) * br, bx + Math.sin(p) * (br + l), by + Math.cos(p) * (br + l)); }
      if (Math.abs(roll) < 1.2) { const p = roll, x = bx + Math.sin(p) * (br - 4), y = by + Math.cos(p) * (br - 4); c.beginPath(); c.moveTo(x, y); c.lineTo(x - Math.cos(p) * 7 - Math.sin(p) * 12, y + Math.sin(p) * 7 - Math.cos(p) * 12); c.lineTo(x + Math.cos(p) * 7 - Math.sin(p) * 12, y - Math.sin(p) * 7 - Math.cos(p) * 12); c.closePath(); c.stroke(); } }
    // ground warnings. 1980: no GPWS yet (it came to the Hornet in the 2000s); what the pilot had was the radar
    // altimeter's low-altitude warning (the voice says ALTITUDE). The game's look-ahead escape check is kept as an aid:
    // TERRAIN flashes the altitude box, PULL UP puts the break-X on the glass.
    if (S.warn === 'TERRAIN') { if ((performance.now() % 600) < 300) { c.lineWidth = 5; c.strokeRect(W - 76 - 52, H / 2 - 30 - 21, 104, 42); c.lineWidth = 3; } }
    else if (S.warn && (performance.now() % 500) < 330) { c.lineWidth = 4; line(W / 2 - 70, H / 2 - 58, W / 2 + 70, H / 2 + 58); line(W / 2 + 70, H / 2 - 58, W / 2 - 70, H / 2 + 58); c.lineWidth = 3; }
    if (J.fuel * LB < S.bingo) T('BINGO', W / 2, 122, 'center', 18);
    if (J.limiter) T('AOA', W / 2 - 110, H / 2 - 62, 'center', 15);
    if (J.cat) T(J.cat.state === 'hold' ? 'CAT  -  MIL POWER TO LAUNCH' : 'CAT', W / 2, H - 112, 'center', 15);
    if (J.wire) T(`WIRE ${J.trapWire}`, W / 2, H - 112, 'center', 18);
    if (J.gear > 0.5 && !J.onGround && J.eas * KT > 250) T('GEAR', W / 2, 96, 'center', 18);
    c.restore(); hud.tex.needsUpdate = true;
  }

  // CM: the right warning panel's threat lights (ALR-45/67 era: SAM, AAA, AI, CW) and DISP, over the ALE-39 counters;
  // mapped from the game's radar warning picture: SAM = a TALON tracking you (flashing: a missile in the air), AAA = a
  // gun radar locked, AI = a WASP's sensor on you, CW = a LANCE beam (continuous illumination). Redrawn on change only.
  let thrKey = '', advKey = '';
  const lampAt = (c, x, y, w, h, label, on, col, off, fs = 20) => { c.fillStyle = on ? col : off; c.fillRect(x, y, w, h); c.strokeStyle = '#000'; c.lineWidth = 3; c.strokeRect(x, y, w, h); txt(c, label, x + w / 2, y + h / 2 + fs * 0.36, on ? '#111' : '#5a5d56', fs, 'center'); };
  function drawThreat(S) {
    const R = S.rwr, d = S.cm, bl = (performance.now() % 400) < 220, pw = S.power !== false, T = R ? R.threats : [];
    const lk = pw && R && R.locked && !R.launch, ln = pw && R && R.launch && bl, lz = pw && R && R.laser;
    const sam = pw && R && (T.some(o => o.kind === 'T' && o.locked) && !R.launch || ln), aaa = pw && R && T.some(o => o.kind === 'A' && o.locked), ai = pw && R && T.some(o => o.kind === 'W' && (o.locked || o.lock > 0.5));
    const k = `${lk}${ln}${lz}${pw}${sam}${aaa}${ai}${d ? d.flare + ':' + d.chaff + ':' + d.queue.length : ''}`; if (k === thrKey) return; thrKey = k;
    const c = thrD.ctx; c.fillStyle = '#0d0f11'; c.fillRect(0, 0, 200, 200);
    lampAt(c, 4, 4, 94, 40, 'SAM', sam, '#ff3020', '#220806'); lampAt(c, 102, 4, 94, 40, 'AAA', aaa, '#ff3020', '#220806');
    lampAt(c, 4, 48, 94, 40, 'AI', ai, '#ff3020', '#220806'); lampAt(c, 102, 48, 94, 40, 'CW', lz, '#ffb020', '#1c1606');
    lampAt(c, 4, 92, 192, 30, 'DISP', pw && d && d.queue.length > 0, '#40e050', '#081a0a', 18);
    c.fillStyle = '#05060a'; c.fillRect(4, 128, 192, 68); c.strokeStyle = '#3c4440'; c.lineWidth = 2; c.strokeRect(4, 128, 192, 68);
    txt(c, 'ALE-39', 100, 146, '#9a9890', 13, 'center');
    if (pw && d) { txt(c, `F ${String(d.flare).padStart(2, '0')}`, 52, 184, d.flare ? '#ffb040' : '#ff6030', 28, 'center'); txt(c, `C ${String(d.chaff).padStart(2, '0')}`, 148, 184, d.chaff ? '#ffb040' : '#ff6030', 28, 'center'); }
    thrD.tex.needsUpdate = true;
  }
  // left advisory lights (left of the UFC): L BLEED / R BLEED (red), SPD BRK (green), STBY, L BAR red (bar down
  // in the air) / L BAR green (bar down on deck), REC, XMIT
  function drawAdv(S, J) {
    const pw = S.power !== false, sb = pw && J.surf.brake > 0.05, red = pw && J.launchBar && !J.onGround, grn = pw && J.launchBar && J.onGround, k = `${pw}${sb}${red}${grn}`;
    if (k === advKey) return; advKey = k;
    const c = advD.ctx; c.fillStyle = '#0d0f11'; c.fillRect(0, 0, 340, 200);
    const L = [['L BLEED', false, '#ff3020', '#220806'], ['R BLEED', false, '#ff3020', '#220806'], ['SPD BRK', sb, '#40e050', '#081a0a'], ['STBY', false, '#ffb020', '#1c1606'],
      ['L BAR', red, '#ff3020', '#220806'], ['L BAR', grn, '#40e050', '#081a0a'], ['REC', false, '#40e050', '#081a0a'], ['XMIT', false, '#40e050', '#081a0a']];
    L.forEach(([t, on, col, off], i) => lampAt(c, 4 + (i % 4) * 83, 8 + Math.floor(i / 4) * 96, 79, 88, t, on, col, off, 18));
    advD.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- per frame
  let t = 0, slot = 0, artKey = '', mcFlash = 0;
  return {
    group: g, hitBoxes: hits, PAGES, cmState: () => thrKey,   // CM: lamp / counter state, for tests
    canvases: () => [ddiL.cv, ddiR.cv, ampcd.cv, ufc.cv, ifei.cv, stby.cv, caut.cv, gearL.cv, rwrD.cv, thrD.cv, advD.cv, hud.cv],   // for test contact sheets
    lamps: () => ({ mc: !!mcL.userData.lit, fireL: !!fireLL.userData.lit, apuReady: apuReady.material.color.getHex() === 0x40ff50 }),
    labelOf(id) { const h = hits.find(o => o.userData.sw === id); return h ? h.userData.label : id; },
    press(id) {
      if (id.startsWith('ddiL:')) page.L = id.slice(5); else if (id.startsWith('ddiR:')) page.R = id.slice(5);
      else if (id === 'ampcd:MAP') mapTrack = !mapTrack; else if (id === 'ampcd:MAP+') mapZoom = Math.min(8, mapZoom * 2); else if (id === 'ampcd:MAP-') mapZoom = Math.max(0.5, mapZoom / 2);
      if (id === 'mc') mcFlash = 0.2;
    },
    // J = jet sim, ctl = pilot inputs { pitch, roll, yaw, throttle:[l,r], brakeL, brakeR }, S = everything else (see main.js)
    update(J, ctl, dt, S, cam) {
      t += dt;
      _eye.copy(JEYE).applyQuaternion(J.q).add(J.pos); _iq.copy(J.q).invert();
      // moving parts follow the pilot's hands and feet
      stickP.rotation.set((ctl.pitch || 0) * 0.28, 0, -(ctl.roll || 0) * 0.28);
      thr.forEach((o, i) => { o.position.z = -3.98 - 0.4 * clamp(ctl.throttle ? ctl.throttle[i] : 0, 0, 1); o.rotation.x = 0; });
      pedals[0].p.position.z = -5.12 + (ctl.yaw || 0) * 0.07; pedals[1].p.position.z = -5.12 - (ctl.yaw || 0) * 0.07;
      pedals[0].pl.rotation.x = -0.35 - (ctl.brakeL || 0) * 0.25; pedals[1].pl.rotation.x = -0.35 - (ctl.brakeR || 0) * 0.25;
      canopyG.rotation.x = J.canopy * 0.75;
      gearH.rotation.x = J.gearCmd ? 0.0 : 0.5; gearH.position.y = J.gearCmd ? -0.1 : -0.06; hookH.position.y = J.hookCmd ? -0.1 : -0.06;
      const flip = (id, on, three) => { if (!sw[id]) return; sw[id].rotation.z = 0; sw[id].rotation.y = 0; if (three !== undefined) sw[id].rotation.x = -Math.PI / 2 + [-0.5, 0, 0.5][three]; else if (sw[id].parent === P) sw[id].rotation.x = on ? -0.5 : 0.5; else sw[id].rotation.x = -Math.PI / 2 + (on ? -0.5 : 0.5); };
      flip('arm', S.arm); flip('flaps', 0, J.flapSel); flip('cas', J.cas); flip('batt', S.batt !== false); flip('apu', !!S.apu);
      crankP.rotation.z = S.crank === 0 ? 0.5 : S.crank === 1 ? -0.5 : 0;   // ENG CRANK held toward the engine being cranked
      flip('lights', S.lights); flip('canopy', J.canopyCmd); flip('pbrake', S.pbrake);
      // lamps
      const a = deg(J.alpha), pa = J.pa && !J.onGround;
      setLamp(aoaHi, pa && a > 8.8); setLamp(aoaOn, pa && a > 7.4 && a < 8.8); setLamp(aoaLo, pa && a < 7.4);
      setLamp(lockL, S.tgt && S.tgt.lock); setLamp(shootL, S.tgt && S.tgt.shoot);
      const blink = (performance.now() % 500) < 260;
      const bp = S.battPower !== false; setLamp(fireLL, bp && S.fire && S.fire[0] && blink); setLamp(fireRL, bp && S.fire && S.fire[1] && blink); setLamp(apuL, false);
      apuReady.material.color.setHex(S.apu === 'READY' ? 0x40ff50 : 0x0c240c);
      mcFlash -= dt; setLamp(mcL, (S.masterCaution && blink) || mcFlash > 0); setLamp(hookLamp, J.hook > 0.01 && J.hook < 0.99 || (J.hookCmd && !J.wire && J.onGround));
      jettB.position.z = 0.008 - (S.hover === 'jett' ? 0.003 : 0);
      // hover marker
      hov.visible = false;
      if (S.hover) { const h = hits.find(o => o.userData.sw === S.hover); if (h) { h.updateWorldMatrix(true, false); g.updateWorldMatrix(true, false); hov.visible = true; hov.matrixAutoUpdate = false; h.geometry.computeBoundingBox(); const bb = h.geometry.boundingBox; hov.matrix.copy(g.matrixWorld).invert().multiply(h.matrixWorld).multiply(new THREE.Matrix4().makeScale(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z)); } }
      // displays: HUD every frame, the rest round-robin at ~15 Hz each
      drawHUD(J, S);
      drawAdv(S, J);
      if (S.rwr) { drawThreat(S); if (slot % 2) { const f = J.forward(_w); drawRwr(rwrD.ctx, 200, S.rwr, Math.atan2(f.x, -f.z), t, 'alr', S.power !== false); rwrD.tex.needsUpdate = true; } }   // CM
      slot = (slot + 1) % 4;
      if (slot === 0) drawDDI(ddiL, 'L', S, J); else if (slot === 1) drawDDI(ddiR, 'R', S, J); else if (slot === 2) drawMap(S, J);
      else { drawIFEI(S, J); drawStby(S, J); drawCaut(S); drawGearLights(J, S); const k = `${S.mode}${S.arm}${S.ufc}${S.power}${(S.ufcOpt || []).join()}`; if (k !== artKey) { artKey = k; drawUFC(S, J); } }
    },
  };
}
