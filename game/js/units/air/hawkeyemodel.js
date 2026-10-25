// E-2C HAWKEYE exterior model, the TASK FORCE's 1980 airborne early-warning aircraft, at real dimensions (span
// 24.56 m, length 17.54 m, height 5.58 m, rotodome 24 ft / 7.32 m: Jane's / navy.mil fact sheet) in the house style
// (flat-shaded, low-poly, colours from materials, small details as geometry).
// 1980 VAW paint: light gull grey (FS 36440) over gloss white, the rotodome with its black rim and white band,
// squadron markings on the outboard fins (fictional VAW-118 "SENTINELS", tail code AB of the carrier ALBATROSS),
// modex 6xx on the nose, NAVY and full-colour national insignia, anti-glare panel, nav lights, exhaust soot and wear.
// Moving parts: the rotodome (about 6 rpm), the two Hamilton Standard four-blade props (blur disc at speed), ailerons,
// flaps, elevators, rudders, gear.
// Local frame: +x right, +y up, nose along -z, origin at the CG. Geometry matches hawkeyefm.js: wheel bottoms at y -2.3
// (nose gear z -5.35, mains x +-3.66 z 0.9), prop plane z -4.55 axis y 0.25 radius 2.055 at x +-3.66, wing y ~1.05,
// outboard fins x +-3.95 to y 3.0, rotodome centred z 1.4.
import * as THREE from 'three';
import { M, B, V, slab, loft, merge, cylZ, boxG, mesh, rod, hinged, tube, wheel, canvasTex, decal, drawStarBar } from './meshkit.js';

const GEAR = [[0, -2.3, -5.35], [-3.66, -2.3, 0.9], [3.66, -2.3, 0.9]];   // = HAWKEYE.GEAR (hawkeyefm.js)
const ENG_X = 3.66, PROP_Z = -4.55, PROP_Y = 0.25, PROP_R = 2.055, DOME_Z = 1.4, DOME_Y = 2.9, DOME_R = 3.66;
const SQ = '#c2412a';   // squadron colour (VAW-118 red-orange)

// squadron art for the outer face of each outboard fin: a sweeping band with a white flash, tail code, modex, NAVY
function tailArt(modex) {
  return canvasTex('e2Tail' + modex, 256, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = SQ; x.beginPath(); x.moveTo(0, h * 0.55); x.lineTo(w, h * 0.3); x.lineTo(w, h * 0.46); x.lineTo(0, h * 0.72); x.fill();
    x.fillStyle = '#f2f2ee'; x.beginPath(); x.moveTo(w * 0.2, h * 0.62); x.lineTo(w * 0.85, h * 0.42); x.lineTo(w * 0.62, h * 0.52); x.lineTo(w * 0.24, h * 0.66); x.fill();
    x.fillStyle = '#16191c'; x.font = 'bold 80px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('AB', w * 0.5, h * 0.2);
    x.font = 'bold 30px sans-serif'; x.fillText(String(modex), w * 0.7, h * 0.88);
    x.font = 'bold 22px sans-serif'; x.fillStyle = SQ; x.fillText('VAW-118', w * 0.3, h * 0.88);
  });
}
const noseNumber = modex => canvasTex('e2Modex' + modex, 128, 64, (x, w, h) => { x.clearRect(0, 0, w, h); x.font = 'bold 50px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#1b1e22'; x.fillText(String(modex), w / 2, h / 2 + 2); });
const navyTex = () => canvasTex('e2Navy', 256, 64, (x, w, h) => { x.clearRect(0, 0, w, h); x.font = 'bold 44px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#1b1e22'; x.fillText('NAVY', w / 2, h / 2); });
const starTex = () => canvasTex('starbar', 256, 128, (x, w, h) => { x.clearRect(0, 0, w, h); drawStarBar(x, w, h); });
const domeTex = () => canvasTex('e2Dome', 256, 64, (x, w, h) => { x.clearRect(0, 0, w, h); x.font = 'bold 40px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = SQ; x.fillText('SENTINELS', w / 2, h / 2); });
const stencilTex = (txt) => canvasTex('e2St' + txt, 256, 32, (x, w, h) => { x.clearRect(0, 0, w, h); x.font = 'bold 20px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#2a2d30'; x.fillText(txt, w / 2, h / 2); });

// a rounded-box cross-section (closed ring) at station z: top / belly heights, half width, squareness exponent
function ring(z, top, hw, bot, n = 16, e = 0.55) {
  const c = (top + bot) / 2, hh = (top - bot) / 2, r = [];
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2, s = Math.sin(a), co = Math.cos(a);
    r.push([hw * Math.sign(s) * Math.abs(s) ** e, c + hh * Math.sign(co) * Math.abs(co) ** e, z]);
  }
  return r;
}
// merge the static meshes sitting directly in `g` by material (fewer draw calls); multi-material and transparent ones stay
function mergeStatic(g) {
  const buckets = new Map();
  for (const o of [...g.children]) {
    if (!o.isMesh || Array.isArray(o.material) || o.material.transparent || o.geometry.groups.length) continue;
    o.updateMatrix(); const geo = o.geometry.clone().applyMatrix4(o.matrix);
    (buckets.get(o.material) || buckets.set(o.material, []).get(o.material)).push(geo); g.remove(o);
  }
  for (const [mat, geos] of buckets) mesh(merge(geos), mat, g, 'static');
}

export function buildHawkeyeModel({ modex = 600 } = {}) {
  const g = new THREE.Group(); g.name = 'hawkeye';
  const greyM = M(0xa6abaf), whiteM = M(0xe6e7e3), darkM = M(0x2a2d30), blackM = M(0x0e0f10, { shininess: 6 }), antiM = M(0x1c1f1c, { shininess: 3 });
  const metalM = M(0x5a5f64, { shininess: 50 }), tyreM = M(0x1b1b1b, { shininess: 4 }), gearM = M(0xe2e4e2), sootM = M(0x7d8185), panelM = M(0x9aa0a4), walkM = M(0x6d7277);
  const glassM = M(0x22343e, { shininess: 90, specular: 0x8899aa }), sqM = M(0xc2412a), redM = M(0xb52a22), yelM = M(0xd8b030);

  // ---- fuselage: lofted rounded-box sections, nose to the upswept tail cone. [z, top, half width, belly]
  const ST = [
    [-9.32, -0.38, 0.02, -0.42], [-9.24, -0.1, 0.3, -0.7], [-9.0, 0.12, 0.5, -0.88], [-8.6, 0.3, 0.68, -1.0], [-8.15, 0.52, 0.8, -1.06], [-7.6, 0.86, 0.95, -1.15],
    [-7.0, 1.08, 1.04, -1.2], [-6.2, 1.15, 1.1, -1.24], [-4.0, 1.17, 1.15, -1.25], [-1.0, 1.17, 1.16, -1.24], [1.5, 1.15, 1.12, -1.16],
    [3.5, 1.1, 1.0, -0.92], [5.2, 1.04, 0.82, -0.52], [6.6, 1.0, 0.6, -0.12], [7.6, 0.96, 0.4, 0.2], [8.24, 0.86, 0.12, 0.5],
  ];
  const N = 16, rings = ST.map(([z, t, w, b]) => ring(z, t, w, b, N));
  // segment k of the ring: 0..N, k=0 at the top, N/2 at the keel. Upper ~5/8 grey, lower white; glazing band in the cockpit;
  // anti-glare on the nose ahead of the windscreen
  mesh(loft(rings, (r, k) => {
    const z = ST[r][0], h = Math.min(k, N - 1 - k);   // 0 = top segments, N/2-1 = keel
    if (z >= -8.15 && z < -7.6 && h >= 1 && h <= 2) return 2;             // windscreen
    if (z >= -7.6 && z < -7.0 && h === 2) return 2;                        // side windows
    if (z >= -8.6 && z < -8.15 && h <= 2) return 3;                        // anti-glare ahead of the windscreen
    return h >= 4 ? 1 : 0;
  }, 0), [greyM, whiteM, glassM, antiM], g, 'fuselage');
  // nose cap, window frames, crew door, belly antennas, tail bumper
  mesh(new THREE.SphereGeometry(0.06, 6, 4).translate(0, -0.38, -9.32), darkM, g, 'noseCap');
  for (const s of [-1, 1]) {
    // side observation windows of the CIC (three small dark ports aft of the cockpit)
    for (let i = 0; i < 3; i++) mesh(new THREE.CircleGeometry(0.13, 8).rotateY(s * Math.PI / 2).translate(s * 1.17, 0.45, -4.6 + i * 1.3), glassM, g, 'port');
  }
  mesh(boxG(0.03, 1.3, 0.75, -1.165, -0.1, -5.6), panelM, g, 'crewDoor');
  mesh(boxG(0.04, 0.06, 0.6, -1.18, 0.15, -5.25), metalM, g, 'doorHandle');
  for (const [z, hgt] of [[-3.0, 0.45], [2.0, 0.35], [-6.4, 0.3]]) mesh(slab([[0, 0, .05], [0.3, 0, .04], [0.35, hgt, .03], [0.2, hgt, .03]], (a, b, w) => [w, -1.24 - b, z + a]), darkM, g, 'belly antenna');
  mesh(cylZ(0.015, 0.025, 0.7, 5).translate(0.55, -0.45, -9.0), metalM, g, 'pitot');
  mesh(cylZ(0.015, 0.025, 0.7, 5).translate(-0.55, -0.45, -9.0), metalM, g, 'pitot');
  mesh(boxG(0.16, 0.18, 0.5, 0, 0.42, 8.0), darkM, g, 'tailBumper');
  // panel lines and wear on the grey: a dorsal spine strip, oil streaks under the nacelle line, scuffed walkway
  mesh(boxG(0.5, 0.01, 6.0, 0, 1.175, -3.4), panelM, g, 'spinePanel');
  for (const s of [-1, 1]) mesh(boxG(0.012, 0.02, 9.5, s * 1.13, 0.0, -2.5), panelM, g, 'panelLine');
  // markings: modex on the nose, NAVY and the star and bars aft
  for (const s of [-1, 1]) {
    const d = decal(noseNumber(modex), 0.7, 0.35, g, 'modex'); d.position.set(s * 0.95, -0.1, -7.6); d.rotation.y = s * (Math.PI / 2 - 0.12);
    const nv = decal(navyTex(), 1.6, 0.4, g, 'navy'); nv.position.set(s * 1.0, 0.25, 3.6); nv.rotation.y = s * (Math.PI / 2 - 0.1);
    const st = decal(starTex(), 1.5, 0.75, g, 'insignia'); st.position.set(s * 1.15, 0.1, 0.4); st.rotation.y = s * Math.PI / 2;
    const ws = decal(stencilTex('NO STEP'), 0.8, 0.1, g, 'stencil'); ws.position.set(s * 0.6, 1.181, -5.0); ws.rotation.set(-Math.PI / 2, 0, 0);
  }

  // ---- wing: high, straight, slightly tapered; ailerons outboard, big Fowler flaps inboard; fold joint at x 4.95
  const surf = {}, wy = 1.13;
  const LE = x => -2.05 + x * 0.135, TE = x => 1.4 - x * 0.02;    // root chord 3.45, tip chord 1.5 at x 12.28
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R', map = (a, b, w) => [s * a, wy + w, b];
    const th = x => 0.42 - x * 0.025;
    const fx = 5.3, ax = 8.2;   // flap / aileron split; ailerons to the tip
    mesh(slab([[0.3, LE(0.3), th(0.3)], [12.28, LE(12.28), th(12.28)], [12.28, TE(12.28) - 0.42, 0.1], [ax, TE(ax) - 0.62, th(ax) * 0.5], [fx, TE(fx) - 0.75, th(fx) * 0.5], [0.3, TE(0.3) - 0.8, th(0.3) * 0.5]], map), greyM, g, 'wing' + S);
    mesh(new THREE.SphereGeometry(0.1, 6, 4).scale(0.6, 0.6, 3.5).translate(s * 12.3, wy, LE(12.28) + 0.75), greyM, g, 'tipCap');
    const hp = (x, z) => V(...map(x, z, 0)), pair = (a, b) => s > 0 ? [a, b] : [b, a];
    surf['ail' + S] = hinged(g, slab([[ax + 0.05, TE(ax) - 0.62, .1], [12.2, TE(12.2) - 0.42, .06], [12.2, TE(12.2), .03], [ax + 0.05, TE(ax), .04]], map), greyM, ...pair(hp(ax + 0.05, TE(ax) - 0.62), hp(12.2, TE(12.2) - 0.42)), 'ail' + S);
    surf['flap' + S] = hinged(g, slab([[1.15, TE(1.15) - 0.8, .14], [ax - 0.05, TE(ax) - 0.62, .1], [ax - 0.05, TE(ax), .05], [1.15, TE(1.15), .06]], map), greyM, ...pair(hp(1.15, TE(1.15) - 0.8), hp(ax - 0.05, TE(ax) - 0.62)), 'flap' + S);
    // underside white: a thin plate just below the wing skin
    mesh(slab([[0.3, LE(0.3) + 0.05, .01], [12.2, LE(12.2) + 0.05, .01], [12.2, TE(12.2) - 0.45, .01], [0.3, TE(0.3) - 0.85, .01]], (a, b, w) => [s * a, wy - th(a) * 0.5 - 0.006 + w, b]), whiteM, g, 'wingBelly');
    // fold joint, walkway, NO STEP, exhaust soot over the wing behind the nacelle, star on the upper left / lower right
    mesh(boxG(0.04, 0.02, 3.0, s * 4.95, wy + 0.2, -0.1), darkM, g, 'foldJoint');
    mesh(boxG(0.9, 0.01, 2.2, s * 1.9, wy + 0.205, -0.6), walkM, g, 'walkway');
    mesh(slab([[ENG_X - 0.35, 0.6, .01], [ENG_X + 0.35, 0.6, .01], [ENG_X + 0.55, 1.5, .01], [ENG_X - 0.15, 1.45, .01]], (a, b, w) => [s * a, wy + th(a) * 0.5 + 0.004 + w, b]), sootM, g, 'soot');
    if (s < 0) { const st = decal(starTex(), 2.2, 1.1, g, 'wingStar'); st.position.set(-9.0, wy + 0.17, -0.3); st.rotation.set(-Math.PI / 2, 0, Math.PI); }
    else { const st = decal(starTex(), 2.2, 1.1, g, 'wingStarLow'); st.position.set(9.0, wy - 0.13, -0.3); st.rotation.set(Math.PI / 2, 0, 0); }
  }

  // ---- nacelles: T56 under the wing, intake over the spinner, exhaust on the outboard side, gear bay beneath
  const NS = [[-4.4, 0.62, 0.4, -0.12], [-4.05, 0.84, 0.55, -0.32], [-3.2, 1.05, 0.64, -0.5], [-1.0, 1.08, 0.66, -0.6], [1.0, 1.05, 0.6, -0.57], [2.4, 0.98, 0.48, -0.3], [3.6, 0.9, 0.18, 0.55]];
  const props = [];
  for (const s of [-1, 1]) {
    const x0 = s * ENG_X, nr = NS.map(([z, t, w, b]) => ring(z, t, w, b, 14, 0.7).map(p => [p[0] + x0, p[1], p[2]]));
    mesh(loft(nr, (r, k) => (Math.min(k, 13 - k) >= 4 ? 1 : 0), 0), [greyM, whiteM], g, 'nacelle');
    mesh(boxG(0.45, 0.14, 0.7, x0, 0.98, -3.85), darkM, g, 'intakeLip');
    mesh(boxG(0.36, 0.1, 0.05, x0, 0.97, -4.2), blackM, g, 'intake');
    // exhaust stack on the outboard side, soot behind it
    mesh(cylZ(0.14, 0.17, 0.5, 8).rotateY(s * 0.5).translate(x0 + s * 0.63, 0.45, 1.3), metalM, g, 'exhaust');
    mesh(new THREE.CircleGeometry(0.13, 8).rotateY(Math.PI + s * 0.5).translate(x0 + s * 0.76, 0.45, 1.53), blackM, g, 'exhaustHole');
    mesh(boxG(0.01, 0.35, 1.6, x0 + s * 0.58, 0.5, 2.3), sootM, g, 'nacelleSoot');
    mesh(boxG(0.05, 0.02, 1.0, x0, -0.585, -0.1), darkM, g, 'gearDoorLine');
    // propeller: spinner, four Hamilton Standard blades (dark grey, white-red-white tips), blur disc
    const pg = new THREE.Group(); pg.name = 'prop' + (s < 0 ? 'L' : 'R'); pg.position.set(x0, PROP_Y, PROP_Z); g.add(pg);
    mesh(new THREE.ConeGeometry(0.4, 0.95, 12).rotateX(-Math.PI / 2).translate(0, 0, -0.4), M(0x9da2a6), pg, 'spinner');
    mesh(cylZ(0.4, 0.4, 0.2, 12).translate(0, 0, 0.12), M(0x9da2a6), pg, 'spinnerBack');
    const blades = new THREE.Group(); pg.add(blades);
    const bladeGeo = merge([slab([[0.3, -0.12, .06], [0.55, -0.17, .07], [1.3, -0.16, .05], [1.85, -0.12, .035], [1.85, 0.12, .03], [1.3, 0.15, .04], [0.55, 0.16, .06], [0.3, 0.12, .06]], (a, b, w) => [b, a, w])]);
    const tipGeo = merge([boxG(0.25, 0.08, 0.03, 0, 1.9, 0), boxG(0.25, 0.08, 0.03, 0, 2.02, 0)]), tipRedGeo = boxG(0.25, 0.04, 0.032, 0, 1.96, 0);
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Group(); b.rotation.z = k * Math.PI / 2 + 0.3; blades.add(b);
      const pitch = new THREE.Group(); pitch.rotation.y = s * 0.45; b.add(pitch);
      mesh(bladeGeo, M(0x2c2f32), pitch, 'blade'); mesh(tipGeo, whiteM, pitch, 'bladeTip'); mesh(tipRedGeo, redM, pitch, 'bladeTip');
    }
    const discM = new THREE.MeshBasicMaterial({ color: 0x2a2c2e, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const disc = mesh(new THREE.RingGeometry(0.4, PROP_R, 28), discM, pg, 'propDisc');
    const ringM = new THREE.MeshBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const tipRing = mesh(new THREE.RingGeometry(PROP_R - 0.17, PROP_R - 0.04, 28), ringM, pg, 'tipRing'); tipRing.position.z = 0.01;
    props.push({ pg, blades, disc, discM, ringM, spin: s * 0.4 });
    // a red warning stripe on the fuselage in the prop plane
    mesh(boxG(0.01, 1.0, 0.12, s * 1.165, 0.3, PROP_Z), redM, g, 'propStripe');
  }

  // ---- tail: dihedral-free tailplane with elevators, two outboard fins (through the tailplane) and two inboard fins
  const ty = 0.98, tLE = x => 6.55 + Math.abs(x) * 0.12, tTE = () => 8.15;
  mesh(slab([[-4.0, tLE(4.0), .1], [0, 6.55, .14], [4.0, tLE(4.0), .1], [4.0, 7.65, .08], [-4.0, 7.65, .08]], (a, b, w) => [a, ty + w, b]), greyM, g, 'tailplane');
  mesh(slab([[-1.1, 6.55, .2], [1.1, 6.55, .2], [1.4, 7.65, .16], [-1.4, 7.65, .16]], (a, b, w) => [a, ty + w, b]), greyM, g, 'tailRoot');
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R', p0 = V(s * 0.2, ty, 7.65), p1 = V(s * 3.9, ty, 7.65);
    surf['elev' + S] = hinged(g, slab([[0.2, 7.65, .06], [3.9, 7.65, .05], [3.9, tTE(3.9), .03], [0.2, tTE(0.2), .04]], (a, b, w) => [s * a, ty + w, b]), greyM, ...(s > 0 ? [p0, p1] : [p1, p0]), 'elevator' + S);
  }
  const finTips = [];
  const fin = (x, yb, yt, zLEb, zLEt, cb, ct, rudder, outer) => {
    const map = (z, y, w) => [x + w, y, z];
    const hingeB = zLEb + cb * 0.7, hingeT = zLEt + ct * 0.7;
    mesh(slab([[zLEb, yb, .14], [zLEt, yt, .08], [hingeT, yt, .06], [hingeB, yb, .1]], map), greyM, g, 'fin');
    mesh(slab([[zLEt - 0.05, yt, .09], [zLEt + ct + 0.05, yt, .07], [zLEt + ct, yt + 0.12, .05], [zLEt + 0.1, yt + 0.12, .06]], map), darkM, g, 'finCap');
    let pv = null;
    if (rudder) pv = hinged(g, slab([[hingeB, yb + 0.05, .07], [hingeT, yt - 0.02, .05], [zLEt + ct, yt - 0.02, .03], [zLEb + cb, yb + 0.05, .04]], map), greyM, V(x, yb + 0.05, hingeB), V(x, yt - 0.02, hingeT), 'rudder');
    if (outer) {
      const art = decal(tailArt(modex), 1.75, 1.75, g, 'tailArt'); art.position.set(x + Math.sign(x) * 0.075, (yb + yt) / 2 + 0.25, (zLEb + zLEt) / 2 + 0.85); art.rotation.y = Math.sign(x) * Math.PI / 2;
      const art2 = decal(tailArt(modex), 1.75, 1.75, g, 'tailArtIn'); art2.position.set(x - Math.sign(x) * 0.075, (yb + yt) / 2 + 0.25, (zLEb + zLEt) / 2 + 0.85); art2.rotation.y = -Math.sign(x) * Math.PI / 2;
      finTips.push(V(x, yt + 0.12, zLEt + ct * 0.5));
    }
    return pv;
  };
  surf.rudL = fin(-3.95, 0.25, 3.0, 6.55, 7.2, 1.7, 1.05, true, true);
  surf.rudR = fin(3.95, 0.25, 3.0, 6.55, 7.2, 1.7, 1.05, true, true);
  surf.rudIL = fin(-1.35, ty + 0.08, 2.75, 6.75, 7.25, 1.5, 1.0, true, false);
  surf.rudIR = fin(1.35, ty + 0.08, 2.75, 6.75, 7.25, 1.5, 1.0, true, false);
  // tailhook (stowed under the tail cone) and the hook bumper
  rod(V(0, 0.08, 6.0), V(0, 0.3, 7.9), 0.09, M(0x60666b), g, 'hookArm');
  mesh(boxG(0.12, 0.14, 0.25, 0, 0.27, 8.0), M(0xe8e8e8), g, 'hookShoe');
  

  // ---- rotodome pylon: two streamlined struts splayed into an A, raked, carrying the turntable
  for (const s of [-1, 1]) for (const [z0, z1] of [[-0.25, 0.85], [2.4, 2.0]]) {
    const a = V(s * 0.62, 1.12, z0), b = V(s * 0.28, DOME_Y - 0.4, z1), d = V().subVectors(b, a), L = d.length();
    const st = mesh(new THREE.CylinderGeometry(0.11, 0.13, L, 8).scale(1, 1, 3.4), greyM, g, 'pylon');
    st.position.addVectors(a, b).multiplyScalar(0.5); st.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  }
  mesh(slab([[-0.35, 0.6, 0.5], [2.6, 0.6, 0.5], [2.1, 1.25, 0.5], [0.2, 1.25, 0.5]], (z, y, w) => [w, y + 0.55, z]), greyM, g, 'pylonRoot');
  mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.32, 12).translate(0, DOME_Y - 0.36, DOME_Z), greyM, g, 'turntable');
  const dome = new THREE.Group(); dome.name = 'rotodome'; dome.position.set(0, DOME_Y, DOME_Z); g.add(dome);
  const lathe = (pts, mat, name, seg = 32) => mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat, dome, name);
  // upper skin (grey centre, white band, black rim), lower skin grey
  lathe([[2.55, 0.29], [1.5, 0.36], [0.001, 0.38]], greyM, 'domeTop');
  lathe([[3.4, 0.14], [2.75, 0.27], [2.55, 0.29]], whiteM, 'domeBand');
  lathe([[DOME_R, 0.0], [3.55, 0.08], [3.4, 0.14]], blackM, 'domeRim');
  lathe([[0.001, -0.38], [1.5, -0.36], [2.55, -0.29], [3.2, -0.2]], greyM, 'domeBottom');
  lathe([[3.2, -0.2], [3.55, -0.08], [DOME_R, 0.0]], greyM, 'domeRimLow');
  // the squadron name across the top and a seam ring
  { const t = decal(domeTex(), 2.6, 0.65, dome, 'domeName'); t.position.set(0, 0.39, 0); t.rotation.x = -Math.PI / 2; }
  mesh(new THREE.TorusGeometry(1.5, 0.012, 3, 32).rotateX(Math.PI / 2).translate(0, 0.362, 0), panelM, dome, 'domeSeam');

  // ---- antennas and lights
  for (const [x, y, z, h] of [[0, 1.17, -6.3, 0.35], [0, 1.17, 3.8, 0.45], [0.4, 1.17, -2.8, 0.25]]) mesh(slab([[0, 0, .04], [0.35, 0, .03], [0.4, h, .02], [0.2, h, .02]], (a, b, w) => [x + w, y + b, z + a]), darkM, g, 'antenna');
  tube([[0, 1.18, 4.4], [0.6, 2.5, 6.9], [1.3, 2.7, 7.4]], 0.01, blackM, g, 'wireAntenna', 6);
  tube([[0, 1.18, 4.4], [-0.6, 2.5, 6.9], [-1.3, 2.7, 7.4]], 0.01, blackM, g, 'wireAntenna', 6);
  const lightG = new THREE.Group(); lightG.name = 'lights'; g.add(lightG);
  const bulb = (c, r, p, name) => { const m = mesh(new THREE.SphereGeometry(r, 6, 4), B(c), lightG, name); m.position.copy(p); return m; };
  bulb(0xff2a1a, 0.08, V(-12.36, wy, LE(12.28) + 0.7), 'navPort'); bulb(0x2aff5a, 0.08, V(12.36, wy, LE(12.28) + 0.7), 'navStbd');
  bulb(0xffffff, 0.06, V(0, 0.75, 8.3), 'tailLight');
  const beacons = [bulb(0xff3020, 0.1, V(0, 1.22, -1.4), 'beacon'), bulb(0xff3020, 0.1, V(0, -1.28, 0.6), 'beaconLow')];
  const strobes = finTips.map((p, i) => bulb(0xffffff, 0.07, p.clone().add(V(0, 0.06, 0.4)), 'strobe' + i));

  // ---- gear: nose leg with twin wheels and a launch bar, mains on trailing struts under the nacelles
  const gearG = new THREE.Group(); gearG.name = 'gear'; g.add(gearG);
  { const [x, y, z] = GEAR[0], wr = 0.33, wc = y + wr;
    rod(V(0, -1.2, z - 0.2), V(0, wc, z), 0.14, gearM, gearG, 'noseLeg'); rod(V(0, -1.2, z + 0.5), V(0, wc + 0.25, z + 0.05), 0.07, gearM, gearG, 'noseDrag');
    for (const s of [-1, 1]) wheel(wr, 0.2, gearG, x + s * 0.2, wc, z, tyreM, gearM);
    mesh(boxG(0.1, 0.06, 0.8, 0, wc + 0.15, z - 0.45), M(0x60666b), gearG, 'launchBar');
    for (const s of [-1, 1]) mesh(boxG(0.03, 0.6, 1.0, s * 0.33, -1.45, z + 0.3), greyM, gearG, 'noseDoor'); }
  for (const i of [1, 2]) {
    const [x, y, z] = GEAR[i], wr = 0.48, wc = y + wr, s = Math.sign(x);
    rod(V(x, -0.55, z - 0.6), V(x, wc, z), 0.17, gearM, gearG, 'mainLeg'); rod(V(x, -0.55, z + 0.6), V(x, wc + 0.3, z + 0.05), 0.09, gearM, gearG, 'mainDrag');
    wheel(wr, 0.3, gearG, x + s * 0.18, wc, z, tyreM, gearM); mesh(cylZ(0.05, 0.05, 0.3, 6).rotateY(Math.PI / 2).translate(x + s * 0.03, wc, z), gearM, gearG, 'axle');
    for (const d of [-1, 1]) mesh(boxG(0.03, 0.55, 1.3, x + d * 0.42, -0.8, z - 0.35), greyM, gearG, 'mainDoor');
  }

  mergeStatic(g);
  let rot = 0;
  const ZS = {};
  function animate(A = {}, dt = 0, time = 0) {
    const S = A.surf || ZS, ail = S.ail || 0, el = S.stab || 0, rud = S.rud || 0, fl = S.flap || 0;
    surf.ailR.rotation.x = -ail; surf.ailL.rotation.x = ail; surf.flapR.rotation.x = surf.flapL.rotation.x = fl * 0.6;
    surf.elevR.rotation.x = surf.elevL.rotation.x = -el;
    for (const k of ['rudL', 'rudR', 'rudIL', 'rudIR']) surf[k].rotation.x = rud;
    rot += dt * 0.63; dome.rotation.y = rot;                // 6 rpm
    for (let i = 0; i < 2; i++) {
      const e = A.eng && (A.eng[i] || A.eng[0]), v = e ? (e.prop ?? e.n ?? 0) : (A.prop ?? 0.9);
      const w = v > 2 ? v : v * 107;                        // shaft speed in rad/s (governed ~1,020 prop rpm = 107 rad/s)
      const P = props[i]; P.spin += dt * Math.min(w, 60);   // above ~10 rev/s show the disc, keep the blades stroboscopic-slow
      P.blades.rotation.z = -P.spin;
      const k = THREE.MathUtils.clamp((w - 25) / 50, 0, 1);
      P.discM.opacity = 0.32 * k; P.ringM.opacity = 0.28 * k; P.blades.visible = k < 0.85;
    }
    gearG.visible = (A.gear ?? 1) > 0.5;
    const lit = A.lights ?? true; lightG.visible = lit;
    if (lit) { const st = time % 1.2 < 0.07; for (const s of strobes) s.visible = st; for (const b of beacons) b.visible = (time + 0.6) % 1.0 < 0.15; }
  }
  animate({});
  return { group: g, animate, nozzles: [], tips: [V(-12.3, wy, LE(12.28) + 0.7), V(12.3, wy, LE(12.28) + 0.7)], parts: { surf, dome, props, gear: gearG, lights: lightG } };
}
