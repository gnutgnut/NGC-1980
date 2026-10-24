// 1980 US paratrooper (Marine force recon / Army airborne) and the MC1-1 steerable round canopy he jumps with.
// The figure is INFANTRY's 17-bone Marine (units/infantry/soldiermodel.js: the shared skeleton, M1 helmet with the
// Mitchell cover, ERDL or OG-107 utilities, ALICE belt and canteens) wearing the parachute harness, with the small rig
// contract drop.js uses: { group, body, legs[2], arms[2], pose(name, t), setKit(k) } (ngc/cmpolish swapped the old
// box figure for it; drop.js is unchanged).
//
// Kit (bible: M1 steel helmet, OG-107 / ERDL woodland, ALICE): no flak vest for the jump, the T-10 harness (main lift
// webs over the shoulders, chest strap, leg straps, the saddle), the T-10 reserve on the chest, the MC1-1 main in its
// pack tray on the back, the ALICE pack hung below the reserve in front of the thighs, the M16A1 in its M1950 weapons
// case down the left leg. Repair team: a toolbox below the reserve (it rides on the lowering line under the canopy).
// Canopy (FM 3-21.220 / TM 10-1670-1: CONFIRMED): MC1-1 35 ft nominal diameter (10.7 m), 30 gores, olive drab nylon,
// a TU-shaped cut-out of the rear gores for ~8 kt forward drive, two steering toggles on the rear risers; descent
// ~18 ft/s at a 250 lb jumper (sea level), a 360 deg turn in ~9 s. Inflated diameter ~0.7 x nominal = 7.5 m (INFERRED);
// lines 25 ft (7.6 m) from the skirt to the connector links (INFERRED from the T-10 family).
// Frame: +y up, the jumper faces -z, origin between his feet.
import * as THREE from 'three';
import { buildMarine } from '../infantry/soldiermodel.js';
import { Kit, KITMAT, CAMO, COL } from '../infantry/meshkit.js';

const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
const boxG = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const mesh = (geo, mat, parent, name) => { const m = new THREE.Mesh(geo, mat); if (name) m.name = name; parent && parent.add(m); return m; };
const group = (parent, name, x = 0, y = 0, z = 0) => { const o = new THREE.Group(); o.name = name; o.position.set(x, y, z); parent && parent.add(o); return o; };

// ------------------------------------------------------------------ the figure
// Building a Marine paints every face (camouflage noise), so each look (seed x utilities) is built once as a template
// and every jumper is a clone of it (geometry and materials shared).
const TEMPLATES = new Map();
const HARNESS = 0x4b4f33, TRAY = 0x4a5233, RESERVE = 0x56603c, METAL = 0x7a7e80, TOOL = 0x7c2c1c;
function template(seed, og) {
  const key = `${seed}:${og ? 1 : 0}`;
  if (TEMPLATES.has(key)) return TEMPLATES.get(key);
  const sk = buildMarine({ seed, camo: og ? 'og107' : 'erdl', vest: false, weapon: null, detail: 'low' }), B = sk.bones;
  const put = (bone, name, build) => { const k = new Kit(); build(k); const m = k.mesh(KITMAT.lambert(), name); m.castShadow = false; B[bone].add(m); return m; };
  const web = CAMO.od(HARNESS), od = CAMO.od(0x575a3b);
  // chest: main lift webs over the shoulders down the front and back, the chest strap, the reserve's tie-down,
  // the MC1-1 main pack tray on the back with its static line stowed across it
  put('chest', 'harness', k => {
    for (const s of [-1, 1]) {
      k.box(0.05, 0.36, 0.014, web, [s * 0.095, 0.06, -0.122]); k.box(0.05, 0.3, 0.014, web, [s * 0.095, 0.08, 0.12]);
      k.box(0.05, 0.014, 0.25, web, [s * 0.095, 0.245, 0]);                                   // over the shoulder
      k.box(0.04, 0.03, 0.03, METAL, [s * 0.095, 0.17, -0.135]);                                // canopy release / connector
    }
    k.box(0.3, 0.035, 0.014, web, [0, 0.13, -0.128]);                                           // chest strap
    k.box(0.4, 0.5, 0.2, TRAY, [0, 0.03, 0.22]); k.box(0.36, 0.06, 0.205, CAMO.od(0x3f4429), [0, 0.22, 0.22]);   // main pack + top flap
    k.box(0.04, 0.4, 0.03, 0xd8d0b0, [0.12, 0.05, 0.33], [0, 0, 0.1]);                         // static line in its retainer bands
    k.box(0.05, 0.05, 0.03, 0xffd040, [0.13, 0.27, 0.33]);                                     // static line snap hook (yellow)
  });
  // spine (stomach): the T-10 reserve on its D-rings, the rip-cord handle
  put('spine', 'reserve', k => {
    k.box(0.34, 0.2, 0.16, RESERVE, [0, 0.02, -0.2]); k.box(0.3, 0.03, 0.17, CAMO.od(0x4a5233), [0, 0.13, -0.2]);
    k.box(0.06, 0.03, 0.03, METAL, [0.12, 0.02, -0.29]);                                      // rip cord grip
    for (const s of [-1, 1]) k.box(0.03, 0.03, 0.05, METAL, [s * 0.16, 0.06, -0.13]);          // D-rings
  });
  // pelvis: the saddle and the ALICE pack hung below the reserve (H-harness), riding in front of the thighs
  const alice = put('pelvis', 'alice', k => {
    k.box(0.36, 0.05, 0.25, web, [0, -0.1, 0.02]);                                             // saddle
    k.box(0.34, 0.34, 0.2, od, [0, -0.28, -0.27]); k.box(0.3, 0.08, 0.21, CAMO.od(0x4b4f33), [0, -0.12, -0.27], [-0.15, 0, 0]);   // ALICE + flap
    for (const s of [-1, 1]) k.box(0.03, 0.22, 0.03, web, [s * 0.12, -0.05, -0.19]);           // its lowering line attachment
  });
  // thighs: leg straps; the M1950 weapons case down the outside of the left leg
  for (const side of ['L', 'R']) put('thigh' + side, 'legstrap', k => {
    k.cyl(0.092, 0.088, 0.04, web, [0, -0.06, 0], 'y', 8);
    if (side === 'L') { k.box(0.1, 0.8, 0.13, CAMO.od(0x5a5d3c), [-0.12, -0.35, 0.0]); k.box(0.11, 0.04, 0.14, web, [-0.12, -0.05, 0]); k.box(0.11, 0.04, 0.14, web, [-0.12, -0.55, 0]); }
  });
  TEMPLATES.set(key, sk);
  return sk;
}
const POSED = ['pelvis', 'spine', 'chest', 'neck', 'head', 'upperArmL', 'forearmL', 'handL', 'upperArmR', 'forearmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
let _n = 0;
// a stand-in rotation with a settable x: drop.js swings legs / arms by `.rotation.x`; the knee and elbow follow
function limb(upper, lower, kind) {
  const rot = {
    get x() { return upper.rotation.x; },
    set x(v) {
      upper.rotation.x = v;
      if (kind === 'leg') lower.rotation.x = -0.12 - 0.9 * Math.max(0, -v) - 0.25 * Math.max(0, v);   // knee bends as the leg swings back
      else lower.rotation.x = v < -2 ? 0.25 : v < -0.6 ? 0.5 : 0.35 + 0.6 * Math.max(0, v);           // elbows: bent running, straighter overhead
    },
    get y() { return upper.rotation.y; }, set y(v) { upper.rotation.y = v; },
    get z() { return upper.rotation.z; }, set z(v) { upper.rotation.z = v; },
    set(x, y, z) { upper.rotation.set(x, y, z); return rot; },
  };
  return { rotation: rot, bone: upper };
}
export function buildParatrooper(o = {}) {
  const seed = o.seed ?? (_n++ % 4), T = template(seed, !!o.og);
  const root = T.root.clone(true); root.name = 'paratrooper';
  const B = {}; root.traverse(c => { if (POSED.includes(c.name)) B[c.name] = c; });
  // repair kit: a toolbox strapped below the reserve (it rides on the lowering line after the canopy opens)
  const kit = group(B.pelvis, 'kit', 0, -0.52, -0.32);
  mesh(boxG(0.36, 0.18, 0.18), M(TOOL), kit); mesh(boxG(0.3, 0.03, 0.04, 0, 0.1, 0), M(0x1c1c1c), kit);
  const line = mesh(boxG(0.01, 1, 0.01, 0, 0.5, 0), M(0xc8c8b8), kit, 'loweringLine'); line.visible = false;
  const alice = root.getObjectByName('alice');
  const arms = [limb(B.upperArmL, B.forearmL, 'arm'), limb(B.upperArmR, B.forearmR, 'arm')], legs = [limb(B.thighL, B.shinL, 'leg'), limb(B.thighR, B.shinR, 'leg')];
  // body: the spine bends at the waist (the legs stay where they are), as the old figure's hip pivot did
  const rig = { group: root, body: B.spine, head: B.head, arms, legs, kit, alice, bones: B };
  // poses: stand (in the hold), door (in the door, hands on the edges), exit (tight body position: chin down, elbows in,
  // hands on the reserve, feet together), canopy (hands up on the toggles / risers, feet and knees together), plf
  // (the parachute landing fall), run and work are animated by drop.js on top of 'stand'
  const E = (b, x, y = 0, z = 0) => B[b].rotation.set(x, y, z);
  rig.pose = (name, t = 0) => {
    for (const n of POSED) B[n].rotation.set(0, 0, 0);
    B.pelvis.position.set(0, 0.98, 0);
    kit.position.set(0, -0.52, -0.32); line.visible = false;
    if (name === 'stand') { E('upperArmL', 0.1, 0, -0.08); E('upperArmR', 0.1, 0, 0.08); E('forearmL', 0.35); E('forearmR', 0.35); E('shinL', -0.05); E('shinR', -0.05); }
    else if (name === 'door') {   // crouched in the door, both hands outside on the trailing edge, eyes on the horizon
      E('upperArmL', -0.4, 0, -1.25); E('upperArmR', -0.4, 0, 1.25); E('forearmL', 0.5); E('forearmR', 0.5);
      E('spine', -0.12); E('thighL', 0.35); E('shinL', -0.5); E('thighR', 0.15); E('shinR', -0.3); B.pelvis.position.y = 0.93; E('head', -0.15);
    } else if (name === 'exit') {   // tight body: chin on the chest, elbows in, hands on the ends of the reserve, feet together, knees bent
      E('spine', 0.35); E('chest', 0.1); E('head', 0.45);
      E('upperArmL', -0.35, 0, -0.22); E('upperArmR', -0.35, 0, 0.22); E('forearmL', 1.5, 0, 0.35); E('forearmR', 1.5, 0, -0.35);
      E('thighL', 0.25); E('thighR', 0.25); E('shinL', -0.35); E('shinR', -0.35);
    } else if (name === 'canopy') {   // hands up on the toggles, feet and knees together, the kit down on its lowering line
      E('upperArmL', 0, 0, -2.75); E('upperArmR', 0, 0, 2.75); E('forearmL', 0.35); E('forearmR', 0.35);
      E('thighL', 0.12); E('thighR', 0.12); E('shinL', -0.18); E('shinR', -0.18); E('footL', 0.35); E('footR', 0.35);
      kit.position.set(0, -2.4, -0.1); line.visible = true; line.scale.y = 1.9;
    } else if (name === 'doorcheck') {   // the jumpmaster's door check: hands on both edges of the door, leaning out into
      // the slipstream, head turned toward the nose to pick up the DZ and look along the fuselage (t: +1 left door, -1 right)
      E('upperArmL', -0.75, 0, -0.95); E('upperArmR', -0.75, 0, 0.95); E('forearmL', 0.4); E('forearmR', 0.4);
      E('spine', 0.55); E('chest', 0.15); E('head', -0.55, -1.0 * (t || 1), 0);
      E('thighL', 0.3); E('shinL', -0.45); E('thighR', -0.1); E('shinR', -0.15); B.pelvis.position.y = 0.95;
    } else if (name === 'safety') {   // standing at the aft edge of the door facing the stick: one arm out controlling the
      // static lines, the other on the anchor cable; head turned to the door (t: +1 left door, -1 right)
      E('upperArmL', -1.2, 0, -0.15); E('upperArmR', -2.3, 0, 0.25); E('forearmL', 0.5); E('forearmR', 0.3);
      E('head', 0, 0.45 * (t || 1), 0); E('shinL', -0.05); E('shinR', -0.05);
    } else if (name === 'plf') {   // feet and knees together, rolling onto the side: thighs back, body over, arms over the head
      E('spine', 0.5); E('thighL', -0.9); E('thighR', -0.9); E('shinL', -0.6); E('shinR', -0.6);
      E('upperArmL', -2.4, 0, -0.4); E('upperArmR', -2.4, 0, 0.4); E('forearmL', 0.6); E('forearmR', 0.6); B.pelvis.position.y = 0.6;
    }
  };
  rig.setKit = k => { kit.visible = !!k; };
  rig.pose('stand');
  return rig;
}

// MC1-1: an olive drab dome of 30 gores with the TU cut-out in the rear, suspension lines to four risers, toggles
export function buildMC1Canopy() {
  const g = group(null, 'mc1-1'), dome = group(g, 'dome', 0, 7.9, 0);
  const R = 3.75, H = 2.3, N = 30, rings = 6;
  const od = M(0x5a6038, { side: THREE.DoubleSide }), od2 = M(0x4e5431, { side: THREE.DoubleSide }), apexM = M(0x3f4429, { side: THREE.DoubleSide });
  // dome surface: gore k spans angle [k, k+1]; ring j from the apex (j = 0) to the skirt (j = rings); profile is a
  // flattened hemisphere with the skirt pulled in a little, as an inflated round canopy looks
  const P = (k, j) => { const a = (k / N) * Math.PI * 2, t = j / rings, polar = t * Math.PI * 0.5 * 1.08, r = R * Math.sin(polar) * (j === rings ? 0.93 : 1), y = H * Math.cos(polar); return [Math.sin(a) * r, y, Math.cos(a) * r]; };
  // TU cut-out: rear gores (around +z, the jumper faces -z), the "T" bar across rings 2-3 and the two "U" legs down
  const isHole = (k, j) => { const dk = Math.min(Math.abs(k - 0), Math.abs(k - N)) + 0.5 - 0.5, kk = (k + N / 2) % N - N / 2 + 0.5;   // kk: gore offset from the rear centre
    const ak = Math.abs(kk); return (j === 2 && ak < 4) || ((j === 3 || j === 4) && ak > 2.5 && ak < 4); };
  const pos = [[], [], []];
  for (let k = 0; k < N; k++) for (let j = 0; j < rings; j++) {
    if (isHole(k, j)) continue;
    const a = P(k, j), b = P(k + 1, j), c = P(k + 1, j + 1), d = P(k, j + 1), m = j === 0 ? 2 : k % 2;
    pos[m].push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  [od, od2, apexM].forEach((m, i) => { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos[i], 3)); ge.computeVertexNormals(); mesh(ge, m, dome, 'canopyPanels'); });
  // vent cap at the apex
  mesh(new THREE.CircleGeometry(0.28, 10).rotateX(-Math.PI / 2).translate(0, H + 0.02, 0), apexM, dome, 'vent');
  // suspension lines: every second gore seam to the nearest of four riser ends (connector links ~0.7 m above the shoulders)
  const links = [[-0.18, 2.25, -0.08], [0.18, 2.25, -0.08], [-0.18, 2.25, 0.12], [0.18, 2.25, 0.12]];
  const lp = [];
  for (let k = 0; k < N; k += 1) {
    const s = P(k, rings), sw = [s[0], s[1] + 7.9, s[2]];
    const li = (s[0] < 0 ? 0 : 1) + (s[2] < 0 ? 0 : 2);
    lp.push(...sw, ...links[li]);
  }
  for (const L of links) lp.push(L[0], L[1], L[2], L[0] * 0.8, 1.55, L[2] * 0.5);   // risers down to the shoulder
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xc8c8b8, transparent: true, opacity: 0.55 })); lines.name = 'lines'; g.add(lines);
  const toggles = [-1, 1].map(s => { const t = mesh(boxG(0.03, 0.12, 0.03), M(0x1c1c1c), g, 'toggle'); t.position.set(s * 0.2, 2.05, 0.15); return t; });
  // inflation 0..1 (a streamer, then the skirt opens), breathing, steering (one toggle down)
  const anim = { open: 1 };
  const animate = (time, open = 1, steer = 0) => {
    const o = Math.max(0.05, Math.min(1, open)), w = o * o * (3 - 2 * o), br = 1 + 0.025 * Math.sin(time * 2.3) * w;
    dome.scale.set((0.12 + 0.88 * w) * br, 0.6 + 0.4 * w + 0.6 * (1 - w), (0.12 + 0.88 * w) * br);
    lines.scale.set(0.15 + 0.85 * w, 1, 0.15 + 0.85 * w);
    dome.rotation.z = steer * 0.12; dome.rotation.x = 0.06;   // the canopy leans into a turn, and back over the drive
    toggles[0].position.y = 2.05 - Math.max(0, -steer) * 0.5; toggles[1].position.y = 2.05 - Math.max(0, steer) * 0.5;
  };
  animate(0, 1, 0);
  return { group: g, dome, lines, animate, anim };
}

// The door bundle: an A-21 cargo bag (canvas, webbing, ~0.9 x 0.6 x 0.55 m, up to 500 lb) under a G-14 cargo
// parachute (34 ft nominal, olive drab, no steering; ~28 ft/s with a full load: TM 10-1670-1, CONFIRMED order of
// magnitude). The jumpmaster pushes it out of the door first on the green light; the team's tools ride in it.
// Frame: origin at the bottom of the bag, the canopy above. animate(time, open 0..1) like the MC1-1.
export function buildDoorBundle() {
  const g = group(null, 'doorBundle'), bag = group(g, 'a21');
  const canvasM = M(0x5d6440), web = M(0x3b4128), metal = M(0x7a7d80);
  mesh(boxG(0.9, 0.55, 0.6, 0, 0.275, 0), canvasM, bag, 'bag');
  for (const x of [-0.25, 0.25]) mesh(boxG(0.05, 0.57, 0.62, x, 0.275, 0), web, bag);       // webbing round the bag
  mesh(boxG(0.92, 0.05, 0.62, 0, 0.45, 0), web, bag); mesh(boxG(0.12, 0.06, 0.12, 0, 0.58, 0), metal, bag);   // the quick release on top
  // G-14: a plain round dome, 24 gores, alternate panels slightly different olive (cargo chutes are patched and re-used)
  const dome = group(g, 'g14', 0, 6.8, 0), R = 3.6, H = 2.2, N = 24, rings = 5, pos = [[], []];
  const P = (k, j) => { const a = k / N * Math.PI * 2, polar = j / rings * Math.PI * 0.5 * 1.08, r = R * Math.sin(polar) * (j === rings ? 0.92 : 1); return [Math.sin(a) * r, H * Math.cos(polar), Math.cos(a) * r]; };
  for (let k = 0; k < N; k++) for (let j = 0; j < rings; j++) { const a = P(k, j), b = P(k + 1, j), c = P(k + 1, j + 1), d = P(k, j + 1); pos[k % 2].push(...a, ...b, ...c, ...a, ...c, ...d); }
  [M(0x596036, { side: THREE.DoubleSide }), M(0x666b44, { side: THREE.DoubleSide })].forEach((m, i) => { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos[i], 3)); ge.computeVertexNormals(); mesh(ge, m, dome); });
  const lp = []; for (let k = 0; k < N; k++) { const s = P(k, rings); lp.push(s[0], s[1] + 6.8, s[2], 0, 0.62, 0); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xc8c8b8, transparent: true, opacity: 0.5 })); g.add(lines);
  const canopy = group(g, 'canopy'); canopy.add(dome); canopy.add(lines);
  const animate = (time, open = 1) => {
    const o = Math.max(0.05, Math.min(1, open)), w = o * o * (3 - 2 * o), br = 1 + 0.03 * Math.sin(time * 2.7) * w;
    dome.scale.set((0.12 + 0.88 * w) * br, 0.6 + 0.4 * w + 0.6 * (1 - w), (0.12 + 0.88 * w) * br); lines.scale.set(0.15 + 0.85 * w, 1, 0.15 + 0.85 * w);
  };
  animate(0, 1);
  return { group: g, bag, canopy, animate };
}
