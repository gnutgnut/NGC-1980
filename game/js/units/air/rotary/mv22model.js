// MV-22B Osprey exterior, as the RUNAWAY run it: a 2030s Marine Osprey seized before the jump and refitted by machines.
// Real metres (17.5 m long, 25.8 m wide with the rotors turning, 6.7 m tall with the nacelles up). Moving parts: the
// nacelles tilt about the wing tips (0 = airplane, 90 = helicopter, 97.5 = a little aft), proprotors spin (3 twisted
// blades that feather, flap on the gimbal and FOLD back along the nacelle for stowage), the wing swings 90 deg on its
// ring to stow fore-and-aft, gear retracts (nose forward, mains into the sponsons), rear ramp, flaperons, elevator,
// rudders. Refit: weathered two-tone grey with patches of matte ceramic primer, cyan IFF strips and seams, a sensor
// ball bolted under the nose, crude machine glyphs stencilled over the old MARINES and national markings.
// Local frame: x right, y up, nose -z, origin at the CG, wheels on the ground at y = MV22M.GROUND.
// API: buildMV22Mesh() -> { group, animate(S, dt, time), RAMP_END, parts }
import * as THREE from 'three';
import { M, B, V, clamp, smooth, slab, loft, merge, cylZ, cylX, cylY, boxG, sphG, mesh, group, rodG, bucket, rr, full, QH, shift, ringGeo, decal, canDecal, sideDecal, geom } from './modelkit.js';

// a proprotor blade as one smooth piece: stations along the span, each a thin lens section, chord tapering from the
// broad root to the tip and twisted ~47 deg root to tip (the V-22's nonlinear twist, simplified). Along +x from r0.
function bladeGeo(r0, r1, n = 12) {
  const st = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, r = r0 + (r1 - r0) * u, c = 0.95 - 0.42 * u, t = 0.62 * (1 - u) - 0.2 * u * u, th = 0.075 * (1 - u) + 0.02;
    const ct = Math.cos(t), sn = Math.sin(t), P = (zc, yc) => [r, yc * ct + zc * sn, -yc * sn + zc * ct];
    st.push([P(-0.42 * c, 0), P(0.05 * c, th / 2), P(0.58 * c, 0), P(0.05 * c, -th / 2)]);   // leading edge, top, trailing edge, bottom
  }
  const pos = [];
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { const a = st[i][k], b = st[i][(k + 1) % 4], c = st[i + 1][(k + 1) % 4], d = st[i + 1][k]; pos.push(...a, ...b, ...c, ...a, ...c, ...d); }
  for (const [s, f] of [[st[0], 1], [st[n], 0]]) { const [a, b, c, d] = s; if (f) pos.push(...a, ...c, ...b, ...a, ...d, ...c); else pos.push(...a, ...b, ...c, ...a, ...c, ...d); }
  return geom(pos);
}

const D2R = Math.PI / 180;
export const MV22M = { GROUND: -2.22, R: 5.805, PIVOT: [7.0, 1.9, -0.05], MAST: 1.9, OMEGA: 412 * Math.PI / 30, RAMP_HINGE: [0, -1.25, 4.6], RAMP_LEN: 3.1 };
const LV = [0.6, 0.0, -0.6];
// fuselage stations [z, top, bottom, half width, rt, rb]
const FUS = [
  [-8.75, -0.35, -0.75, 0.05, 0.05, 0.05], [-8.62, -0.05, -0.98, 0.48, 0.32, 0.3], [-8.3, 0.32, -1.18, 0.86, 0.45, 0.38], [-7.8, 0.68, -1.34, 1.08, 0.5, 0.36],
  [-7.1, 1.02, -1.46, 1.22, 0.5, 0.34], [-6.3, 1.18, -1.52, 1.27, 0.48, 0.3], [-5.4, 1.24, -1.56, 1.3, 0.46, 0.3],
  ...[-4.4, -3.0, -1.5, 0, 1.5, 3.0].map(z => [z, 1.3, -1.6, 1.32, 0.46, 0.3]),
  [4.0, 1.32, -1.5, 1.3, 0.46, 0.3], [4.6, 1.33, -1.3, 1.28, 0.46, 0.3], [5.6, 1.35, -0.78, 1.18, 0.44, 0.28], [6.7, 1.38, -0.2, 0.98, 0.4, 0.24], [7.8, 1.4, 0.4, 0.72, 0.34, 0.2], [8.9, 1.42, 0.92, 0.42, 0.22, 0.12],
];
const FZ = FUS.map(f => f[0]);
// 0 grey, 1 glass, 2 dark grey (upper), 3 ceramic primer patch, -1 hole (ramp opening, crew door)
function skinMat(z0, z1, qh, s) {
  if (z0 >= -8.3 && z1 <= -6.3 && qh >= 2 && qh <= 6) return 1;            // windscreens and side windows
  if (z0 >= -7.8 && z1 <= -7.1 && qh >= 9 && qh <= 10) return 1;           // chin windows
  if (s > 0 && z0 >= -5.4 && z1 <= -4.4 && qh >= 5 && qh <= 11) return -1; // crew door (right front), open
  if (z0 >= 4.6 && qh >= 11) return -1;                                    // the ramp opening
  if (qh <= 2) return 2;                                                   // the darker upper surfaces (two-tone)
  if ((z0 >= -1.5 && z1 <= 0 && s < 0 && qh >= 5 && qh <= 8) || (z0 >= 3.0 && z1 <= 4.6 && s > 0 && qh >= 4 && qh <= 6)) return 3;   // primer patches
  return 0;
}

export function buildMV22Mesh() {
  const g = new THREE.Group(); g.name = 'mv22';
  const greyM = M(0x98a0a6), grey2M = M(0x7a8288), darkM = M(0x3a3f44), primerM = M(0xd2cfc4, { shininess: 4 }), blackM = M(0x141516, { shininess: 6 });
  const metalM = M(0x4d5256, { shininess: 50 }), tyreM = M(0x161616, { shininess: 4 }), bladeM = M(0x3e4348, { shininess: 25 }), tipM = M(0xd8d8d0);
  const cyanM = B(0x5ff2ff), cyanDim = B(0x1d6a74), sootM = M(0x34302c, { shininess: 4 });
  const glassM = new THREE.MeshPhongMaterial({ color: 0x7f9aa8, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  const innerM = M(0x3a3f44, { side: THREE.BackSide }), floorM = M(0x2a2d30);
  const body = bucket();

  // ---- fuselage + lining, floor, the machines' racks inside
  const rings = FUS.map(([z, t, b, w, rt, rb]) => full(rr(z, t, b, w, rt, rb, LV)));
  mesh(loft(rings, (r, k) => skinMat(FZ[r], FZ[r + 1], QH(k), k < 13 ? 1 : -1), 0, 0), [greyM, glassM, grey2M, primerM], g, 'fuselage');
  mesh(loft(rings.slice(2), (r, k) => { const m = skinMat(FZ[r + 2], FZ[r + 3], QH(k), k < 13 ? 1 : -1); return m === 1 ? -1 : 0; }), innerM, g, 'lining');
  body.add(boxG(2.2, 0.05, 10.5, 0, -1.25, -0.2), floorM);
  for (const s of [-1, 1]) for (let z = -3.8; z <= 3.6; z += 1.1) body.add(boxG(0.1, 1.6, 0.1, s * 1.05, -0.45, z), darkM);   // trooper docking racks (RUNAWAY)
  // sponsons with the main gear wells, cyan IFF strip along them
  const SP = [[-1.6, -0.6, -1.5, 0.2], [-1.0, -0.4, -1.55, 0.55], [0.0, -0.35, -1.55, 0.72], [2.2, -0.35, -1.55, 0.72], [3.2, -0.45, -1.5, 0.55], [3.8, -0.65, -1.4, 0.2]];
  for (const s of [-1, 1]) {
    body.add(loft(SP.map(([z, t, b, w]) => shift(full(rr(z, t, b, w, Math.min(0.25, w), Math.min(0.22, w), [t - 0.1, (t + b) / 2, b + 0.1])), s * 1.55)), () => 0, 0, 0), greyM);
    body.add(boxG(0.03, 0.08, 4.2, s * 2.28, -0.75, 1.1), cyanM);
  }
  // nose: refuelling probe (right), the RUNAWAY sensor ball under the chin with cyan lenses, pitot, antennas
  body.add(rodG([0.75, 0.5, -6.6], [0.85, 0.6, -10.0], 0.12, 8), grey2M); body.add(rodG([0.85, 0.6, -10.0], [0.85, 0.6, -10.35], 0.07, 6), metalM);
  body.add(rodG([0, -1.4, -6.9], [0, -1.62, -6.9], 0.16, 8), darkM); body.add(sphG(0.42, 0, -1.92, -6.9, 1, 1, 1, 12, 8), primerM);
  for (const [x, y] of [[-0.14, -1.86], [0.14, -1.86], [0, -2.06]]) body.add(sphG(0.09, x, y, -7.3, 1, 1, 0.4, 8, 5), cyanM);
  body.add(rodG([-0.5, 0.45, -8.2], [-0.5, 0.45, -8.9], 0.04, 4), metalM);
  body.add(boxG(0.04, 0.5, 0.4, 0, 1.55, 2.0), blackM); body.add(boxG(0.04, 0.3, 0.4, 0, 1.5, -2.6), blackM);
  body.add(boxG(1.0, 0.04, 0.08, 0, 1.33, -3.6), cyanM);                                                            // IFF strip on the roof
  // crew door: dark recess; pilots' seats seen through the glass hold nothing - a machine core in each
  for (const s of [-1, 1]) { body.add(boxG(0.5, 0.9, 0.5, s * 0.5, -0.7, -6.6), darkM); body.add(sphG(0.18, s * 0.5, -0.05, -6.65, 1, 1, 1, 8, 5), darkM); body.add(sphG(0.05, s * 0.5, -0.03, -6.84, 1, 1, 1, 6, 4), cyanM); }

  // ---- tail: H-tail with twin fins and rudders, elevator
  const ht = slab([[6.9, -2.9, 0.12], [8.3, -2.9, 0.1], [8.6, 2.9, 0.1], [7.2, 2.9, 0.12]].map(([a, b, w]) => [a, b, w]), (a, b, w) => [b, 1.55 + w, a]);
  body.add(ht, greyM);
  const elev = group(g, 'elevator', 0, 1.55, 8.45); mesh(boxG(5.6, 0.07, 0.55, 0, 0, 0.27), grey2M, elev);
  const rudders = [];
  for (const s of [-1, 1]) {
    body.add(slab([[6.6, 0.2, 0.14], [8.1, 0.2, 0.12], [8.7, 3.3, 0.08], [7.7, 3.4, 0.1]], (a, b, w) => [s * 2.95 + w, 1.4 + b, a]), greyM);
    body.add(boxG(0.03, 0.06, 1.2, s * 3.04, 3.0, 7.9), cyanM);
    const rd = group(g, 'rudder', s * 2.95, 1.6, 8.4); mesh(boxG(0.08, 2.8, 0.5, 0, 1.4, 0.25), grey2M, rd); rudders.push(rd);
  }

  // ---- wing on its stow ring, flaperons; nacelles at the tips
  const wing = group(g, 'wing', 0, 1.65, -0.05);
  { const wb = bucket();
    wb.add(cylY(1.1, 1.1, 0.25, 20).translate(0, -0.05, 0), grey2M);                                                       // stow ring
    for (const s of [-1, 1]) {
      wb.add(slab([[0.2, -1.25, 0.56], [6.4, -1.5, 0.5], [6.4, 1.15, 0.2], [0.2, 1.25, 0.24]].map(([a, b, w]) => [a * s, b, w, 0.35]), (a, b, w) => [a, 0.12 + w + Math.abs(a) * 0.035, b]), greyM);   // 6 deg forward sweep on the leading edge, ~2 deg dihedral
      wb.add(boxG(5.6, 0.03, 0.05, s * 3.4, 0.42, -1.12), cyanM);                                                         // leading-edge seam
      wb.add(boxG(0.4, 0.02, 1.6, s * 2.0, 0.42, -0.1), primerM);                                                          // primer patch over a repair
    }
    // the dorsal fairing over the wing's stow ring and mid-wing gearbox, blending into the fuselage top
    const DF = [[-2.7, 0.05, 0.0, 0.25], [-2.0, 0.5, 0.0, 0.6], [-1.3, 0.72, 0.0, 0.74], [0.4, 0.76, 0.0, 0.76], [1.7, 0.62, 0.0, 0.66], [2.8, 0.25, 0.0, 0.4], [3.6, 0.04, 0.0, 0.18]];
    wb.add(loft(DF.map(([z, t, b, w]) => full(rr(z, t, b - 0.3, w, Math.min(0.35, w), 0.05, [t - 0.1, t - 0.2, t - 0.3]))), () => 0, 0, 0), greyM);
    wb.flush(wing, 'wingParts'); }
  const flaperons = [-1, 1].map(s => { const f = group(wing, 'flaperon', s * 3.3, 0.18, 1.2); mesh(boxG(5.6, 0.1, 0.7, 0, 0, 0.35), grey2M, f); return f; });
  const nacelles = [], BLADE = bladeGeo(0.1, 4.75), BLADE_TIP = bladeGeo(4.75, 5.25, 2);
  for (const s of [-1, 1]) {
    const piv = group(wing, 'nacelle', s * MV22M.PIVOT[0], MV22M.PIVOT[1] - 1.65, 0);   // pivot at the wing tip; local +y = along the shaft toward the rotor
    const nb = bucket();
    nb.add(cylY(0.8, 0.76, 3.0, 16).translate(0, 0.1, 0), greyM); nb.add(sphG(0.78, 0, -1.4, 0, 1, 0.5, 1, 16, 8), grey2M);
    nb.add(cylY(0.72, 0.82, 0.6, 16).translate(0, 1.7, 0), grey2M);                     // gearbox fairing below the hub
    nb.add(boxG(0.5, 1.4, 0.06, 0, 0.2, 0.8), darkM);                                     // intake grille
    nb.add(cylY(0.32, 0.36, 0.5, 10).translate(0, -1.7, 0.4), sootM);                    // exhaust (down in the hover, aft in cruise)
    nb.add(boxG(0.05, 2.6, 0.05, s * 0.8, 0.1, 0), cyanM);                                // cyan seam
    nb.flush(piv, 'nacelleParts');
    const hub = group(piv, 'hub', 0, MV22M.MAST, 0), spin = group(hub, 'spin');
    { const hb = bucket(); hb.add(new THREE.SphereGeometry(0.64, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.1, 1).translate(0, 0.12, 0), grey2M); hb.add(cylY(0.62, 0.62, 0.3, 14), metalM); hb.flush(spin, 'spinner'); }
    const blades = [];
    for (let k = 0; k < 3; k++) {
      const arm = group(spin, 'arm'); arm.rotation.y = k * 2 * Math.PI / 3;
      const fold = group(arm, 'fold', 0.55, 0.1, 0), pitch = group(fold, 'pitch');
      mesh(BLADE, bladeM, pitch, 'blade'); mesh(BLADE_TIP, tipM, pitch, 'bladeTip'); mesh(boxG(0.45, 0.16, 0.34, 0.05, 0, 0), metalM, pitch, 'cuff');
      blades.push({ fold, pitch });
    }
    const discG = group(hub, 'disc'); const dm = B(0x2a2d30, { transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const d1 = mesh(ringGeo(0.7, MV22M.R), dm, discG); d1.renderOrder = 2;
    nacelles.push({ piv, hub, spin, blades, discG, dm, s, psi: Math.random() * 6 });
  }

  // ---- gear: nose (retracts forward) and mains (into the sponsons), twin wheels each
  const G0 = MV22M.GROUND;
  const noseGear = group(g, 'noseGear', 0, -1.45, -5.6);
  { const nb = bucket(); nb.add(rodG([0, 0, 0], [0, G0 + 1.45 + 0.32, 0], 0.16, 8), metalM); for (const x of [-0.2, 0.2]) { nb.add(cylX(0.32, 0.18, 12).translate(x, G0 + 1.45 + 0.32, 0), tyreM); } nb.flush(noseGear, 'noseGearParts'); }
  const mains = [-1, 1].map(s => { const m = group(g, 'mainGear', s * 1.95, -1.3, 1.0); const mb = bucket(); mb.add(rodG([0, 0, 0], [0, G0 + 1.3 + 0.4, 0], 0.2, 8), metalM);
    for (const z of [-0.25, 0.25]) mb.add(cylX(0.4, 0.28, 14).translate(0, G0 + 1.3 + 0.4, z), tyreM); mb.flush(m, 'mainParts'); return m; });

  // ---- the rear ramp
  const [hx, hy, hz] = MV22M.RAMP_HINGE, L = MV22M.RAMP_LEN;
  const ramp = group(g, 'ramp', hx, hy, hz);
  { const rb = bucket(); rb.add(boxG(2.3, 0.1, L, 0, -0.05, L / 2), greyM); rb.add(boxG(2.1, 0.02, L - 0.1, 0, 0.01, L / 2), floorM); for (let z = 0.3; z < L; z += 0.4) rb.add(boxG(2.0, 0.02, 0.05, 0, 0.03, z), metalM); rb.flush(ramp, 'rampPanel'); }
  const RAMP_UP = 0.47, RAMP_DOWN = -Math.asin(Math.min(1, (hy - G0) / L));

  // ---- lights: red beacons, nav, formation strips (cyan on this one)
  const beaconM = B(0xff2414), beaconOff = M(0x5a120e);
  const beacons = [[0, 1.45, 3.0], [0, -1.65, 0.5]].map(p => { const h = mesh(sphG(0.1), beaconOff, g, 'beacon'); h.position.set(...p); return h; });

  // ---- markings: the RUNAWAY stencilled their glyphs over the Marine markings
  if (canDecal) {
    const glyph = (x, w, h) => {   // a crude machine stencil: bars and circles, black, sprayed (rough edges)
      x.fillStyle = '#111'; x.globalAlpha = 0.92;
      const u = h / 6; for (let i = 0; i < 6; i++) { const gx = w * 0.08 + i * w * 0.15; x.fillRect(gx, u * (i % 3), w * 0.05, u * (3 + (i * 7) % 3)); if (i % 2) { x.beginPath(); x.arc(gx + w * 0.07, h * 0.75, u * 0.9, 0, 7); x.fill(); } }
      for (let i = 0; i < 300; i++) x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    };
    const ghost = (x, w, h) => { x.font = 'bold 60px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = 'rgba(30,30,30,0.35)'; x.fillText('MARINES', w / 2, h / 2); x.fillStyle = 'rgba(200,198,188,0.9)'; x.fillRect(w * 0.05, h * 0.2, w * 0.9, h * 0.6); glyph(x, w, h); };
    for (const s of [-1, 1]) {
      sideDecal(g, decal('rwglyph', 512, 96, ghost, 2.8, 0.52), s, s * 1.335, 0.35, -1.2);
      sideDecal(g, decal('rwglyph2', 256, 128, glyph, 1.0, 0.5), s, s * 1.0, 0.5, 6.5);
      sideDecal(g, decal('rwfin', 256, 256, (x, w, h) => { x.fillStyle = '#5ff2ff'; x.fillRect(w * 0.1, h * 0.42, w * 0.8, h * 0.16); glyph(x, w, h); }, 0.9, 0.9), s, s * 3.04, 2.3, 7.7);
    }
  }
  // small square cabin windows (two a side); the RUNAWAY plated one over with ceramic primer
  { const winM = M(0x1b2328, { shininess: 90, specular: 0x8aa0aa });
    for (const [s, z, plated] of [[-1, -3.3, false], [-1, -0.9, true], [1, -2.3, false], [1, 0.4, false]]) { body.add(boxG(0.03, 0.4, 0.4, s * 1.322, 0.55, z), plated ? primerM : winM); body.add(boxG(0.025, 0.48, 0.48, s * 1.318, 0.55, z), darkM); } }
  body.flush(g, 'airframe');

  // ---- animation. S: { nr, nac (rad), coll, tR/tL: { tx, ty } TPP tilts, gear 0..1, ramp 0..1, flap, el, rud, ail,
  //      fold 0..1 (blades folded + nacelles down + wing stowed), run }
  function animate(S = {}, dt = 0, time = 0) {
    const nr = S.nr ?? 0, nac = S.nac ?? Math.PI / 2, fold = clamp(S.fold ?? 0, 0, 1), coll = S.coll ?? 0.3;
    for (const N of nacelles) {
      N.piv.rotation.x = -(Math.PI / 2 - nac);   // local +y along the shaft: up at 90 deg, forward (-z) at 0
      N.psi = (N.psi + N.s * nr * MV22M.OMEGA * dt) % (Math.PI * 2);   // right rotor counter-clockwise (from the thrust side), left clockwise
      N.spin.rotation.y = fold > 0 ? N.spin.rotation.y + (((N.s > 0 ? 0.0 : Math.PI / 3)) - N.spin.rotation.y) * Math.min(1, dt * 2) : N.psi;   // blades index for the fold
      const T = N.s > 0 ? S.tR : S.tL, tx = T ? T.tx : 0, ty = T ? T.ty : 0;
      for (const b of N.blades) {
        const a = N.spin.rotation.y + b.fold.parent.rotation.y;
        b.fold.rotation.z = (0.03 - tx * Math.sin(a) - ty * Math.cos(a)) * (1 - fold) + fold * -1.35;   // fold: blades swing back along the nacelle
        b.pitch.rotation.x = N.s * -((S.th75 ?? (0.1 + coll * 0.3)) - 0.3) * (1 - fold);   // feathers with the real blade angle: fine in the hover, coarse in cruise
      }
      const dk = smooth(nr, 0.35, 0.9) * (1 - fold); N.dm.opacity = 0.18 * dk; N.discG.visible = dk > 0.01;
      N.discG.rotation.set(-tx, 0, -ty); N.discG.scale.y = 0.03;
    }
    wing.rotation.y = -fold * smooth(fold, 0.55, 1) * Math.PI / 2;                       // the wing swings fore-and-aft last
    const gr = clamp(S.gear ?? 1, 0, 1); noseGear.rotation.x = (1 - gr) * 1.6; for (const m of mains) m.rotation.x = -(1 - gr) * 1.55;
    noseGear.visible = gr > 0.02; for (const m of mains) m.visible = gr > 0.02;
    ramp.rotation.x = -(RAMP_UP + (RAMP_DOWN - RAMP_UP) * clamp(S.ramp ?? 0, 0, 1));
    // flaperons: flaps, plus the big droop in the hover that cuts the rotor wash on the wing (the V-22's download fix)
    const droop = clamp(((S.nac ?? 1.57) - 1.2) / 0.37, 0, 1) * (S.gear ?? 1);
    for (const [i, f] of flaperons.entries()) f.rotation.x = (S.flap ?? 0) * 0.45 + droop * 0.75 + (i ? -1 : 1) * (S.ail ?? 0) * 0.35;
    elev.rotation.x = -(S.el ?? 0) * 0.35; for (const r of rudders) r.rotation.y = (S.rud ?? 0) * 0.35;
    const fl = (time % 1.3) < 0.1 && (S.run ?? true); for (const b of beacons) { b.material = fl ? beaconM : beaconOff; b.scale.setScalar(fl ? 1.6 : 1); }
    cyanM.color.setHSL(0.52, 1, 0.62 + 0.12 * Math.sin(time * 2.1));
  }
  animate({});
  const RAMP_END = V(hx, G0, hz + Math.cos(RAMP_DOWN) * L);
  return { group: g, animate, RAMP_END, parts: { nacelles, wing, ramp, noseGear, mains } };
}
