// lcm8.js - the LCM-8 "Mike boat": the landing craft that brings an M60A3 or an M113A2 ashore (wave 2 armour delivery).
// Model in the house style (flat-shaded Lambert, colours from materials, details as geometry) at real size, its deck as a
// platform for armorworld.js (the tank rides it with the same platform carry as a ship's deck), and a twin-diesel sound.
//
// LCM-8 (Mod 1, steel), 1960s-1980s US Navy / Army: length 73 ft 7 in (22.43 m), beam 21 ft (6.42 m), draft ~5 ft
// (1.5 m) loaded, two Detroit Diesel 12V71 (2 x ~300 hp), 2 shafts, 9 kn loaded / 12 kn light, cargo one M48 / M60 tank
// or 60 short tons, crew 4-5. Bow ramp hinged at the well deck, coxswain's station aft above the engine room.
// (U: commonly published figures - Jane's Fighting Ships / navsource; not re-read for this work.)
//
// Frame (ship convention, like war.js units): x right (starboard), y up from the waterline, z aft (bow at -z).
import * as THREE from 'three';

export const LCM8 = {
  L: 22.43, B: 6.42, DRAFT: 1.5, SPEED: 4.6, SPEED_LIGHT: 6.2,   // m, m/s (9 kn loaded, 12 kn light) U
  WELL: { x: 2.25, z0: -9.6, z1: 3.4, y: 0.4 },                    // the cargo well: half width, from the ramp hinge aft, floor height
  GUNWALE: 2.25, STERN_DECK: 2.3, BOW: -10.6, STERN: 11.2,
  RAMP: { len: 3.7, hw: 2.2, up: 1.42, down: -0.42 },              // ramp length; angle from horizontal (rad): up ~81 deg, down ~-24 deg
};
const M = (c, k = 0) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, emissive: new THREE.Color(c).multiplyScalar(k) });
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// the deck under (lx, lz) relative to p.y, or -1e9 off the boat; `ramp` = the ramp angle (rad, + = raised)
export function lcmDeck(lx, lz, ramp) {
  const W = LCM8.WELL, ax = Math.abs(lx);
  if (lz > LCM8.STERN || ax > LCM8.B / 2) return -1e9;
  if (lz >= W.z0 && lz <= W.z1 && ax <= W.x) return W.y;                              // the well
  if (lz > W.z1) return lz < W.z1 + 0.5 ? LCM8.STERN_DECK + 0.6 : LCM8.STERN_DECK;   // the forward bulkhead of the stern section, the stern deck
  if (ax > W.x && lz >= LCM8.BOW) return LCM8.GUNWALE;                                 // the wing walls
  if (lz < W.z0 && ax <= LCM8.RAMP.hw) {                                                // the ramp
    const R = LCM8.RAMP, c = Math.cos(ramp), s = Math.sin(ramp), along = W.z0 - lz;    // distance forward of the hinge
    if (c < 0.2) return along < 0.35 ? W.y + R.len * s : -1e9;                            // raised: a wall
    if (along > R.len * c) return -1e9;
    return W.y + along * s / c;
  }
  if (lz >= LCM8.BOW && lz < W.z0) return LCM8.GUNWALE;                                 // the bow bulwark beside the ramp
  return -1e9;
}

export function buildLCM8Mesh(opts = {}) {
  const g = new THREE.Group(); g.name = 'LCM-8';
  const grey = M(0x7d858b), dgrey = M(0x5b6166), deckM = M(0x4e5458), black = M(0x1e2022), boot = M(0x24272a), red = M(0x7a2a22), white = M(0xd8d8d0, 0.2), rust = M(0x6a4a34), rubber = M(0x161616), glass = M(0x2a3a44, 0.15), canvas = M(0x5d6450);
  const add = (geo, m, p = g) => { const o = new THREE.Mesh(geo, m); p.add(o); return o; };
  const L = LCM8, W = L.WELL, hb = L.B / 2;
  // ---- hull: a shallow box with flared sides, the bottom raked up at the bow (the ramp end) and the stern
  {
    const shape = new THREE.Shape();   // a U section: the hull bottom with the chines, the wing walls, open over the well
    const wi = W.x + 0.12, pts = [[-hb + 0.35, -1.3], [hb - 0.35, -1.3], [hb, -0.55], [hb, L.GUNWALE], [wi, L.GUNWALE], [wi, W.y - 0.12], [-wi, W.y - 0.12], [-wi, L.GUNWALE], [-hb, L.GUNWALE], [-hb, -0.55]];
    shape.moveTo(...pts[0]); for (const p of pts.slice(1)) shape.lineTo(...p); shape.closePath();
    const hull = new THREE.ExtrudeGeometry(shape, { depth: L.STERN - (L.BOW + 1.2), bevelEnabled: false }); hull.translate(0, 0, L.BOW + 1.2);
    // hollow the well: draw the well floor, walls and keep the outer hull (cheap: a darker inner box over the top)
    add(hull, grey);
    // the bow rake below the ramp
    const rake = new THREE.BufferGeometry(); const v = [-hb, L.GUNWALE, L.BOW + 1.2, hb, L.GUNWALE, L.BOW + 1.2, hb - 0.3, -1.3, L.BOW + 1.2, -hb + 0.3, -1.3, L.BOW + 1.2, -hb, L.GUNWALE * 0.3, L.BOW, hb, L.GUNWALE * 0.3, L.BOW];
    rake.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); rake.setIndex([0, 4, 3, 3, 4, 5, 3, 5, 2, 1, 2, 5, 0, 1, 5, 0, 5, 4]); rake.computeVertexNormals();
    add(rake, grey).material.side = THREE.DoubleSide;
  }
  add(box(L.B + 0.02, 0.32, L.STERN - L.BOW - 1.2, 0, -0.05, (L.STERN + L.BOW + 1.2) / 2), boot);   // the boot topping at the waterline
  add(box((W.x + 0.12) * 2, L.STERN_DECK - W.y + 0.1, 0.12, 0, (L.STERN_DECK + W.y) / 2, L.STERN - 0.06), grey);   // the transom between the wing walls
  // ---- the well: floor, inner walls, ribs, tie-down rings
  add(box(W.x * 2, 0.12, W.z1 - W.z0, 0, W.y - 0.06, (W.z0 + W.z1) / 2), deckM);
  for (const s of [-1, 1]) {
    add(box(0.12, L.GUNWALE - W.y, W.z1 - W.z0 + 0.6, s * (W.x + 0.06), (L.GUNWALE + W.y) / 2, (W.z0 + W.z1) / 2 - 0.3), dgrey);
    for (let z = W.z0 + 1; z < W.z1; z += 1.6) { add(box(0.1, L.GUNWALE - W.y - 0.2, 0.08, s * (W.x - 0.01), (L.GUNWALE + W.y) / 2, z), grey); add(new THREE.TorusGeometry(0.09, 0.02, 4, 8).rotateY(Math.PI / 2).translate(s * (W.x - 0.06), W.y + 0.15, z + 0.8), black); }
    add(box(L.B / 2 - W.x - 0.12, 0.08, L.STERN - L.BOW - 1.3, s * (W.x + 0.12 + (L.B / 2 - W.x - 0.12) / 2), L.GUNWALE + 0.02, (L.STERN + L.BOW + 1.2) / 2 + 0.05), deckM);   // gunwale walkways
    // fenders (old tyres) along the sides, bollards, a life ring
    for (let z = -7; z <= 8; z += 3.5) add(new THREE.TorusGeometry(0.32, 0.12, 6, 12).rotateY(Math.PI / 2).translate(s * (hb + 0.1), 1.2, z), rubber);
    for (const z of [-9.8, 0, 10.4]) add(new THREE.CylinderGeometry(0.11, 0.13, 0.35, 8).translate(s * (hb - 0.35), L.GUNWALE + 0.2, z), black);
  }
  for (let z = W.z0 + 0.6; z < W.z1; z += 0.55) add(box(W.x * 2 - 0.1, 0.03, 0.06, 0, W.y + 0.015, z), grey);   // non-skid strips
  // ---- stern: engine room deck, coxswain's armoured station, exhausts, mast
  add(box(L.B - 0.2, 0.15, L.STERN - W.z1, 0, L.STERN_DECK, (L.STERN + W.z1) / 2), deckM);
  add(box(W.x * 2 + 0.1, L.STERN_DECK + 0.6 - W.y, 0.2, 0, (L.STERN_DECK + 0.6 + W.y) / 2, W.z1 + 0.1), dgrey);   // the forward bulkhead (cargo stops)
  const wh = new THREE.Group(); wh.position.set(0, L.STERN_DECK, 6.4); g.add(wh);
  add(box(2.8, 1.5, 2.4, 0, 0.75, 0), grey, wh);
  add(box(2.9, 0.08, 2.5, 0, 1.52, 0), deckM, wh);
  for (const x of [-0.85, 0, 0.85]) add(box(0.6, 0.32, 0.04, x, 1.18, -1.21), glass, wh);           // the conning slits
  for (const s of [-1, 1]) add(box(0.04, 0.32, 0.7, s * 1.41, 1.18, -0.4), glass, wh);
  add(box(0.06, 1.0, 0.7, 0.9, 0.5, 1.21), dgrey, wh);                                                 // the door
  add(box(0.9, 0.55, 0.8, -0.7, 1.8, 0.4), canvas, wh);                                                // the canvas dodger over the upper steering position
  add(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 12).rotateX(Math.PI / 2).translate(0.35, 1.9, -0.05), black, wh);   // the upper wheel
  const coxswain = new THREE.Group(); coxswain.position.set(0.35, 1.55, 0.35); wh.add(coxswain);        // the coxswain (head and shoulders above the dodger)
  add(box(0.45, 0.5, 0.28, 0, 0.25, 0), M(0x3c4a6a), coxswain); add(new THREE.SphereGeometry(0.12, 8, 6).translate(0, 0.62, 0), M(0xc9a27e), coxswain); add(new THREE.CylinderGeometry(0.14, 0.15, 0.1, 10).translate(0, 0.72, 0), M(0x2a3a54), coxswain);
  for (const s of [-1, 1]) {   // exhaust stacks either side, sooty tops
    add(new THREE.CylinderGeometry(0.13, 0.13, 1.6, 10).translate(s * 2.2, L.STERN_DECK + 0.8, 8.6), dgrey);
    add(new THREE.CylinderGeometry(0.135, 0.135, 0.3, 10).translate(s * 2.2, L.STERN_DECK + 1.5, 8.6), black);
  }
  add(new THREE.CylinderGeometry(0.05, 0.06, 3.2, 6).translate(0, L.STERN_DECK + 3.1, 6.9), dgrey);     // the mast
  add(box(0.6, 0.04, 0.04, 0, L.STERN_DECK + 4.2, 6.9), dgrey);
  add(new THREE.SphereGeometry(0.06, 6, 4).translate(0, L.STERN_DECK + 4.75, 6.9), white);             // masthead light
  add(new THREE.SphereGeometry(0.05, 6, 4).translate(-0.3, L.STERN_DECK + 4.25, 6.9), M(0xc02020, 0.5)); add(new THREE.SphereGeometry(0.05, 6, 4).translate(0.3, L.STERN_DECK + 4.25, 6.9), M(0x20a040, 0.5));
  add(new THREE.TorusGeometry(0.3, 0.07, 6, 14).translate(1.42, L.STERN_DECK + 0.9, 6.0).rotateY(0), M(0xd85a20));   // life ring on the wheelhouse
  add(box(0.5, 0.06, 0.04, 0, L.STERN_DECK + 0.05, L.STERN - 0.1), M(0xb0b0a0));                                    // stern light board
  const flag = add(box(0.02, 0.35, 0.55, 0, L.STERN_DECK + 2.3, L.STERN - 0.4), M(0x2a3a7a));
  // rust streaks and the hull number (white stencil) on both bows
  for (const s of [-1, 1]) {
    for (const [z, h] of [[-8, 1.2], [-2, 0.9], [4, 1.4], [9, 0.8]]) add(box(0.02, h, 0.12, s * (hb + 0.005), L.GUNWALE - h / 2 - 0.1, z), rust);
    const c = document.createElement('canvas'); c.width = 256; c.height = 96; const k = c.getContext('2d'); k.fillStyle = '#e8e8e0'; k.font = 'bold 72px Arial'; k.textAlign = 'center'; k.fillText(opts.num || '8-41', 128, 74);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const num = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshLambertMaterial({ map: t, transparent: true }));
    num.position.set(s * (hb + 0.02), 1.3, -6.5); num.rotation.y = s * Math.PI / 2; g.add(num);
  }
  // ---- the bow ramp (a group hinged at the well floor's front edge)
  const ramp = new THREE.Group(); ramp.position.set(0, W.y, W.z0); g.add(ramp);
  const R = L.RAMP, rp = new THREE.Group(); ramp.add(rp);   // rp: the ramp along -z from the hinge (rotation.x = angle)
  add(box(R.hw * 2, 0.14, R.len, 0, 0.07, -R.len / 2), grey, rp);
  add(box(R.hw * 2, 0.04, R.len - 0.2, 0, 0.16, -R.len / 2), deckM, rp);
  for (let z = -0.3; z > -R.len; z -= 0.32) add(box(R.hw * 2 - 0.2, 0.05, 0.05, 0, 0.19, z), black, rp);   // cleats
  for (const s of [-1, 1]) add(box(0.14, 0.75, R.len, s * (R.hw - 0.07), -0.3, -R.len / 2), dgrey, rp);
  add(box(R.hw * 2 - 0.3, 0.5, 0.1, 0, -0.25, -R.len + 0.05), grey, rp);   // the toe
  // the ramp gallows: a post at the forward end of each wing wall with a sheave; the ramp winch's wire runs from the
  // sheave to an eye at the ramp's upper corner (the cables are re-laid every frame as the ramp moves)
  const sheaves = [], cables = [], cableM = black;
  for (const s of [-1, 1]) {
    const px = s * (W.x + 0.45), pz = W.z0 + 0.25, top = L.GUNWALE + 2.0;
    add(box(0.22, top - L.GUNWALE, 0.22, px, (top + L.GUNWALE) / 2, pz), dgrey);
    add(box(0.5, 0.12, 0.14, px - s * 0.18, top - 0.1, pz), dgrey);
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 12).rotateZ(Math.PI / 2).translate(px - s * 0.38, top - 0.1, pz), black);
    sheaves.push(new THREE.Vector3(px - s * 0.38, top - 0.25, pz));
    const cb = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 5), cableM); g.add(cb); cables.push(cb);
  }
  add(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 12).rotateZ(Math.PI / 2).translate(0, L.STERN_DECK + 0.45, W.z1 + 1.2), M(0x3a3d40));   // the ramp winch on the after deck
  // the stern (kedge) anchor and its winch: dropped on the run in, the boat heaves itself off the beach on it
  const kedge = new THREE.Group(); kedge.position.set(1.6, L.STERN_DECK + 0.2, L.STERN - 0.5); g.add(kedge);
  add(box(0.08, 0.08, 1.1, 0, 0, 0), black, kedge); add(box(0.9, 0.06, 0.08, 0, 0, 0.5), black, kedge);
  for (const s of [-1, 1]) { const f = add(box(0.06, 0.05, 0.6, s * 0.3, 0, 0.25), black, kedge); f.rotation.y = s * 0.35; }   // Danforth flukes
  add(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 12).rotateZ(Math.PI / 2).translate(1.6, L.STERN_DECK + 0.35, L.STERN - 2.0), M(0x3a3d40));   // the anchor winch drum
  // two deckhands on the gunwale walkways (dungarees, kapok life jackets, helmets)
  const hand = (x, z, ry) => {
    const d = new THREE.Group(); d.position.set(x, L.GUNWALE + 0.05, z); d.rotation.y = ry; g.add(d);
    add(box(0.32, 0.8, 0.2, 0, 0.4, 0), M(0x283a5a), d); add(box(0.4, 0.42, 0.3, 0, 1.05, 0), M(0xd86a1a), d);   // trousers, the orange kapok jacket
    add(box(0.12, 0.45, 0.12, -0.24, 1.0, 0), M(0x7f9ab8), d); add(box(0.12, 0.45, 0.12, 0.24, 1.0, 0), M(0x7f9ab8), d);   // chambray sleeves
    add(new THREE.SphereGeometry(0.1, 8, 6).translate(0, 1.38, 0), M(0xc19a76), d);
    add(new THREE.SphereGeometry(0.13, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.42, 0), M(0x5a5e48), d);
    return d;
  };
  const hands = [hand(-2.85, -7.6, 0.2), hand(2.85, -5.8, -0.3)];
  const wake = { t: 0 };
  const api = { group: g, ramp: rp, flag, coxswain, wake, kedge, hands };
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
  api.animate = (o = {}) => {
    rp.rotation.x = o.ramp ?? R.up;
    for (let i = 0; i < 2; i++) {   // wire from the sheave to the ramp's upper corner eye
      const s = i ? 1 : -1, a = rp.rotation.x;
      _b.set(s * (R.hw - 0.1), W.y + Math.sin(a) * (R.len - 0.2), W.z0 - Math.cos(a) * (R.len - 0.2));
      _a.copy(sheaves[i]); const d = _b.clone().sub(_a), l = d.length();
      cables[i].position.copy(_a).addScaledVector(d, 0.5); cables[i].scale.set(1, l, 1); cables[i].quaternion.copy(_q.setFromUnitVectors(_up, d.normalize()));
    }
    kedge.visible = !o.anchorOut;
  };
  api.animate({});
  g.userData.heat = 0.42; wh.userData.heat = 0.5;
  return api;
}

// twin 12V71 two-stroke diesels: firing at rpm/60 x 12 (two-stroke V12), the Detroit howl, a low pulse; by distance
export function lcmSound(sfx) {
  if (!sfx.ctx) return null;
  const c = sfx.ctx, out = c.createGain(); out.gain.value = 0; out.connect(sfx.master);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.connect(out);
  const o1 = c.createOscillator(), o2 = c.createOscillator(), o3 = c.createOscillator(); o1.type = 'sawtooth'; o2.type = 'sawtooth'; o3.type = 'triangle';
  const g1 = c.createGain(), g2 = c.createGain(), g3 = c.createGain(); g1.gain.value = 0.35; g2.gain.value = 0.3; g3.gain.value = 0.5;
  o1.connect(g1); o2.connect(g2); o3.connect(g3); g1.connect(lp); g2.connect(lp); g3.connect(lp);
  const len = c.sampleRate, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const n = c.createBufferSource(); n.buffer = b; n.loop = true; const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.7; const ng = c.createGain(); ng.gain.value = 0.08; n.connect(nf); nf.connect(ng); ng.connect(out);
  for (const o of [o1, o2, o3]) o.start(); n.start();
  return {
    update(rpm, load, dist) {
      const t = c.currentTime, f = rpm / 60 * 12;
      o1.frequency.setTargetAtTime(f, t, 0.1); o2.frequency.setTargetAtTime(f * 1.013, t, 0.1); o3.frequency.setTargetAtTime(f / 4, t, 0.1);
      lp.frequency.setTargetAtTime(300 + 900 * load, t, 0.2);
      out.gain.setTargetAtTime(Math.min(0.35, 9 / Math.max(10, dist)) * (0.5 + 0.5 * load), t, 0.2);
    },
    stop() { out.gain.setTargetAtTime(0, c.currentTime, 0.1); },
  };
}

// a LANDING HARD (landinghard.js) drawn: the concrete ramp with its tyre-worn strips and joints, kerbs along the edges,
// red / white marker posts at the waterline, a sign board at the top. `mats` may carry the game's fog-of-war patched
// materials { concrete (vertex colours), post, sign }.
export function buildHardMesh(h, mats = {}) {
  const g = new THREE.Group(); g.name = h.name;
  const pos = [], col = [], c = new THREE.Color();
  const quad = (a, b, cc, d, k) => { for (const p of [a, b, cc, a, cc, d]) pos.push(...p); for (let i = 0; i < 6; i++) col.push(k[0], k[1], k[2]); };
  const P = (u, lat, dy = 0.05) => { const [x, z] = h.at(u, lat); return [x, h.y(u) + dy, z]; };
  const n = Math.ceil((h.u1 + 3 - h.u0) / 1);
  for (let i = 0; i < n; i++) {
    const u = h.u0 + i, u2 = u + 1, joint = i % 4 === 0;
    for (const [l0, l1, tone] of [[-h.w, -2.1, 0.62], [-2.1, -1.3, 0.5], [-1.3, 1.3, 0.6], [1.3, 2.1, 0.5], [2.1, h.w, 0.62]]) {   // the wheel / track strips worn darker
      const v = tone * (joint ? 0.8 : 1) * (0.96 + 0.08 * Math.sin(u * 1.7 + l0 * 3)); c.setRGB(v, v * 0.99, v * 0.95);
      quad(P(u, l0), P(u, l1), P(u2, l1), P(u2, l0), [c.r, c.g, c.b]);
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  const conc = mats.concrete || new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  conc.polygonOffset = true; conc.polygonOffsetFactor = -2; conc.polygonOffsetUnits = -2;
  g.add(new THREE.Mesh(geo, conc));
  // kerbs on the dry part, marker posts at the waterline, the sign at the top
  const kerbM = mats.post || new THREE.MeshLambertMaterial({ color: 0x8c8a84, flatShading: true });
  const uDry = Math.max(h.u0, (0 - h.y0) / h.g + h.u0);
  for (const s of [-1, 1]) {
    const a = P(uDry, s * (h.w + 0.15), 0.12), b = P(h.u1 + 2, s * (h.w + 0.15), 0.12), L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, L), kerbM); k.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); k.lookAt(b[0], b[1], b[2]); g.add(k);
    for (const u of [uDry + 1, uDry + 9]) {
      const [x, z] = h.at(u, s * (h.w + 0.9)), y = h.y(u) - 0.5;
      for (let j = 0; j < 5; j++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.45, 6), mats[j % 2 ? 'white' : 'red'] || new THREE.MeshLambertMaterial({ color: j % 2 ? 0xe8e8e0 : 0xb02a20, flatShading: true })); m.position.set(x, y + 0.25 + j * 0.45, z); g.add(m); }
    }
  }
  {
    const [x, z] = h.at(h.u1 + 3, h.w + 2.2), y = h.y(h.u1);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const k = cv.getContext('2d');
    k.fillStyle = '#e9e4d2'; k.fillRect(0, 0, 256, 128); k.fillStyle = '#1d1d1b'; k.font = 'bold 30px Arial'; k.textAlign = 'center'; k.fillText('LANDING HARD', 128, 48); k.font = 'bold 22px Arial'; k.fillText(h.name.replace(' HARD', ''), 128, 84); k.font = '16px Arial'; k.fillText('MAX 60 T  ·  1 IN 5', 128, 112);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), mats.sign ? mats.sign(t) : new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
    board.position.set(x, y + 1.9, z); board.rotation.y = h.yaw; g.add(board);   // facing down the hard, to the boats
    for (const s of [-0.85, 0.85]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.9, 0.08), kerbM); p.position.set(x + Math.cos(h.yaw) * s, y + 0.95, z - Math.sin(h.yaw) * s); g.add(p); }
  }
  // beach marker panels either side of the top of the hard (the shore party's markers in the beach's colour, seen from
  // the boats coming in; the left one carries a vertical stripe)
  {
    const pm = mats.red ? mats.post : new THREE.MeshLambertMaterial({ color: 0x8c8a84, flatShading: true });
    const green = mats.green || new THREE.MeshLambertMaterial({ color: 0x2f7a3a, flatShading: true, side: THREE.DoubleSide }), white = mats.white || new THREE.MeshLambertMaterial({ color: 0xe8e8e0, flatShading: true });
    for (const s of [-1, 1]) {
      const [x, z] = h.at(h.u1 - 1, s * (h.w + 3.2)), y = h.y(h.u1 - 1);
      const p = new THREE.Group(); p.position.set(x, y, z); p.rotation.y = h.yaw; g.add(p);
      const pan = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 0.06), green); pan.position.set(0, 2.6, 0); p.add(pan);
      if (s < 0) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.0, 0.07), white); st.position.set(0, 2.6, 0); p.add(st); }
      for (const q of [-0.7, 0.7]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 3.6, 0.09), pm); post.position.set(q, 1.8, 0.06); p.add(post); }
    }
  }
  g.userData.heat = 0.3;
  return g;
}
