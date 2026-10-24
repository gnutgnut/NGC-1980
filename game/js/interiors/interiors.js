// INTERIORS (wave 3, ngc/interiors): the game side - rooms drawn near the camera, doors you open with F, the
// ALBATROSS's hangar deck and island, the task force's barracks huts by the pads.
//
//   const IN = createInteriors({ scene, GR, war, worldSolid, sfx, say, terrainH, holeOf, ISLANDS });
//   IN.update(dt, camera)              every frame: doors swing, rooms near the camera built / dropped, leaves placed,
//                                      doorway punches, the carrier interior attached to whichever ALBATROSS is afloat
//   IN.use(x, y feet, z, yaw) -> bool  F on foot: the door / hatch in front of you opens or shuts
//   IN.useHint(x, y, z, yaw) -> text   the HUD line for it
//
// How a room shows through a doorway: the world's buildings are closed shells drawn in the chunk meshes (world/
// models.js), so their insides are drawn FIRST (renderOrder -3: walls facing in, floors, ceilings, furniture, door
// leaves), then an invisible "punch" (renderOrder -2: depth only) in front of each doorway on the facade, then the
// world. The shell fails the depth test behind the punch, so the open doorway shows the hall behind it. From inside a
// building the shell's faces point away (culled), so its windows are real windows. Interiors are built only within
// ~55 m of the camera (one geometry per building, a few ms each, two per frame at most) and dropped beyond ~80 m.
import * as THREE from 'three';
import { geoFrom, worldMaterial } from '../world/gfx.js';
import { Geo, col, shade } from '../world/kit.js';
import { DOORS } from './doors.js';
import { buildRoomsGeo, leafGeo, RECIPES } from './furniture.js';
import { planOf, QUONSET } from './rooms.js';
import { roomParts, floorHere } from './roomsolid.js';
import { createAlbInterior, HANGAR } from './shipint.js';
import { buildShipGeo } from './shipgeo.js';
import { crewMesh } from './crewfig.js';

const NEAR = 55, FAR = 80, MAXL = 160;
export function createInteriors(ctx) {
  const { scene, GR, war, worldSolid, sfx } = ctx;
  const say = ctx.say || (() => {});
  const MAT = worldMaterial();   // the world's own vertex-colour material (the rooms are the world)
  const built = new Map();       // P.key -> { R, mesh, doors, inside, box }
  const IN = { built, doors: DOORS, stats: { built: 0, ms: 0 } };

  // ------------------------------------------------------------------ door leaves (instanced, one mesh per kind)
  const LEAF_KINDS = ['house', 'inner', 'shop', 'church', 'mil', 'barn', 'garage', 'wt', 'gate'];
  const leafMesh = {};
  for (const k of LEAF_KINDS) {
    const g = geoFrom(leafGeo(k === 'inner' ? 'house' : k === 'mil' ? 'house' : k).build());
    if (k === 'garage') g.translate(0, -1, 0);   // up-and-over: hangs from its top edge
    const m = new THREE.InstancedMesh(g, worldMaterial({ instanced: true }), MAXL); m.count = 0; m.renderOrder = -3; m.frustumCulled = false;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXL * 3), 3);
    scene.add(m); leafMesh[k] = m;
  }
  // the punch: depth only, in front of each facade doorway
  const punchMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  const punch = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), punchMat, MAXL); punch.count = 0; punch.renderOrder = -2; punch.frustumCulled = false; scene.add(punch);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color(), _w = [0, 0];
  const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);

  // ------------------------------------------------------------------ the task force's barracks huts (one by each pad)
  const huts = [], hutParts = [], hutFloors = [];
  function placeHuts() {
    if (!ctx.ISLANDS) return;
    for (const I of ctx.ISLANDS) {
      const p = I.pad; if (!p || I.cave) continue;
      let done = false;
      for (const d of [36, 42, 48, 56]) { for (let k = 0; k < 16 && !done; k++) {
        const a = k * Math.PI / 8 + I.id * 0.7, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, yaw = Math.atan2(p.x - x, p.z - z) + Math.PI / 2;   // its side to the pad
        if (spotOK(I, x, z, yaw)) { const y = maxGround(x, z, yaw) + 0.15; const it = { t: 'barracks', x, z, y, yaw, seed: 9000 + I.id, isl: I, drop: 0.6 }; huts.push(it); roomParts(it, null, hutParts, hutFloors); done = true; }
      } if (done) break; }
    }
    if (huts.length) scene.add(hutShells());
  }
  const corners = (x, z, yaw, f) => { const c = Math.cos(yaw), s = Math.sin(yaw), w = QUONSET.w / 2 + 1, d = QUONSET.d / 2 + 1.5; for (const [u, v] of [[-w, -d], [w, -d], [w, d], [-w, d], [0, 0], [0, d], [0, -d]]) f(x + c * u + s * v, z - s * u + c * v); };
  const maxGround = (x, z, yaw) => { let m = -1e9; corners(x, z, yaw, (px, pz) => { m = Math.max(m, ctx.terrainH(px, pz)); }); return m; };
  function spotOK(I, x, z, yaw) {
    let lo = 1e9, hi = -1e9, bad = false;
    corners(x, z, yaw, (px, pz) => { const h = ctx.terrainH(px, pz); lo = Math.min(lo, h); hi = Math.max(hi, h); if ((ctx.holeOf && ctx.holeOf(px, pz)) || (worldSolid && worldSolid.surface(px, pz))) bad = true; });
    if (bad || lo < 1.6 || hi - lo > 0.9) return false;
    for (const s of I.structs || []) if (Math.hypot(s.x - x, s.z - z) < (s.r || 6) + 11) return false;
    for (const h of huts) if (Math.hypot(h.x - x, h.z - z) < 20) return false;
    return GR.clearAt(x, z, 8.5);
  }
  // the huts' outsides: corrugated arch on knee walls, end walls with the door and windows (always drawn, one mesh)
  function hutShells() {
    const g = new Geo(), { w, d, H, knee } = QUONSET, r = w / 2, tin = col(0x6a6e5a), tin2 = col(0x5e624f), end = col(0x5a5e4a), slab = col(0x8a8a84);
    for (const it of huts) {
      g.push(it.x, it.y, it.z, it.yaw);
      g.box(0, -1.2, 0, w + 1.6, 1.45, d + 2.6, slab, 0);   // the concrete slab, the steps at each end on it
      for (const s of [-1, 1]) g.box(s * (w / 2 - 0.05), 0, 0, 0.1, knee, d, tin, 0);
      const n = 12;
      for (let i = 0; i < n; i++) {   // the arch: n flat strips (outside and inside faces both drawn: the hut has no interior shell of its own)
        const a0 = Math.PI * i / n, a1 = Math.PI * (i + 1) / n, x0 = Math.cos(a0) * r, y0 = knee + Math.sin(a0) * r * 0.85, x1 = Math.cos(a1) * r, y1 = knee + Math.sin(a1) * r * 0.85, c = i % 2 ? tin : tin2;
        g.quad([x0, y0, d / 2], [x1, y1, d / 2], [x1, y1, -d / 2], [x0, y0, -d / 2], c); g.quad([x0, y0, -d / 2], [x1, y1, -d / 2], [x1, y1, d / 2], [x0, y0, d / 2], shade(col(0xb8b8a8), 0.9));
      }
      for (const s of [-1, 1]) {   // end walls: the arch outline as vertical strips round the door and the two windows
        g.push(0, 0, s * d / 2, s > 0 ? 0 : Math.PI);
        for (let x = -r; x < r - 1e-3; x += 0.25) {
          const xm = x + 0.125, top = knee + Math.sqrt(Math.max(0, r * r - xm * xm)) * 0.85;
          const holes = [[-0.5, 0.5, 0, 2.1], [-2.2, -1.4, 1.0, 1.9], [1.4, 2.2, 1.0, 1.9]].filter(([a, b]) => xm > a && xm < b);
          if (!holes.length) g.box(xm, 0, 0, 0.25, top, 0.12, end, 0);
          else { const [, , h0, h1] = holes[0]; if (h0 > 0) g.box(xm, 0, 0, 0.25, h0, 0.12, end, 0); g.box(xm, h1, 0, 0.25, top - h1, 0.12, end, 0); }
        }
        g.box(0, 2.1, 0.12, 1.4, 0.12, 0.6, end, 0);   // the door hood
        g.box(1.6, 2.5, 0.07, 0.5, 0.35, 0.02, col(0xe8e8e0), 0);   // the hut's number board
        g.pop();
      }
      g.pop();
    }
    const m = new THREE.Mesh(geoFrom(g.build()), MAT); m.name = 'barracks-huts'; return m;
  }
  if (GR) {
    GR.addColliderSource((x, z, r) => { _hl.length = 0; for (const p of hutParts) if (Math.abs(p.x - x) < r + 9 && Math.abs(p.z - z) < r + 9) _hl.push(p); return _hl; });
    GR.addFloor((x, z, y, step) => { let best = null; for (const f of hutFloors) { if (Math.abs(f.x - x) > 12 || Math.abs(f.z - z) > 12) continue; const fy = floorHere(f, x, z); if (fy !== null && fy <= y + step && (best === null || fy > best)) best = fy; } return best; });
  }
  const _hl = [];
  let hutsPlaced = false;   // (once the war has put its sites on the islands: the huts keep clear of them)
  IN.huts = huts;

  // ------------------------------------------------------------------ land rooms near the camera
  const _cands = [];
  let scanT = 0;
  function scan(cx, cz) {
    _cands.length = 0;
    if (worldSolid) for (const R of worldSolid.roomsNear(cx, cz, FAR)) _cands.push(R);
    for (const it of huts) if (Math.abs(it.x - cx) < FAR && Math.abs(it.z - cz) < FAR) _cands.push({ it, P: planOf(it) });
    const keep = new Set();
    let builds = 0;
    _cands.sort((a, b) => Math.hypot(a.it.x - cx, a.it.z - cz) - Math.hypot(b.it.x - cx, b.it.z - cz));
    for (const R of _cands) {
      const d = Math.hypot(R.it.x - cx, R.it.z - cz) - 8;
      if (d > NEAR && !built.has(R.P.key)) continue;
      keep.add(R.P.key);
      if (!built.has(R.P.key) && builds < 2) { build(R); builds++; }
    }
    for (const [k, B] of built) if (!keep.has(k)) { scene.remove(B.mesh); B.mesh.geometry.dispose(); built.delete(k); }
  }
  function build(R) {
    const t0 = performance.now(), { it, P } = R;
    const g = buildRoomsGeo(P), mesh = new THREE.Mesh(geoFrom(g.build()), MAT);
    mesh.position.set(it.x, it.y, it.z); mesh.rotation.y = it.yaw || 0; mesh.renderOrder = -3; mesh.name = 'rooms:' + it.t;
    mesh.updateMatrixWorld(true); scene.add(mesh);
    const doors = P.doors.map(d => DOORS.get(P.key + '#' + d.id)).filter(Boolean);
    // the building's box in its frame (the camera inside it: no punch)
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (const w of P.walls) { u0 = Math.min(u0, w.u0); u1 = Math.max(u1, w.u1); v0 = Math.min(v0, w.v0); v1 = Math.max(v1, w.v1); }
    built.set(P.key, { R, mesh, doors, box: [u0, u1, v0, v1, P.H] });
    IN.stats.built++; IN.stats.ms += performance.now() - t0;
  }
  // one leaf (an instance of its kind) where its door stands: hinge, swing, the garage door's tilt (host frame -> world)
  function placeLeaf(D) {
    const d = D.d, M = leafMesh[d.kind] || leafMesh.house; if (M.count >= MAXL) return;
    const L = DOORS.leaf(D), h = D.host, hy = h.yaw(), c = Math.cos(hy), s = Math.sin(hy), y0 = h.y0();
    h.toWorld(L.hu, L.hv, _w); const wx = _w[0], wz = _w[1];
    const ddx = c * L.du + s * L.dv, ddz = -s * L.du + c * L.dv, yaw = Math.atan2(-ddz, ddx);
    _q.setFromAxisAngle(Y, yaw);
    if (d.kind === 'garage') {   // up and over: the panel turns about its top edge, its foot swinging in
      const nv = d.swing || -1, nx = s * nv, nz = c * nv, sg = Math.sign(nx * Math.sin(yaw) + nz * Math.cos(yaw)) || 1;
      _q2.setFromAxisAngle(X, sg * L.lift * Math.PI / 2 * 0.98); _q.multiply(_q2);
      _m.compose(_p.set(wx, y0 + d.y + d.h, wz), _q, _s.set(d.w, d.h, 1));
    } else _m.compose(_p.set(wx, y0 + d.y, wz), _q, _s.set(d.w, d.h, 1));
    M.setMatrixAt(M.count, _m); _c.setHex(d.c ?? 0x2f5a3a); M.instanceColor.setXYZ(M.count, _c.r, _c.g, _c.b); M.count++;
  }
  // per frame: leaves and punches of the built rooms, the field gates near the camera
  function drawLeaves(cam) {
    for (const k of LEAF_KINDS) leafMesh[k].count = 0;
    punch.count = 0;
    if (worldSolid && worldSolid.gatesNear) for (const D of worldSolid.gatesNear(cam.position.x, cam.position.z, 70)) placeLeaf(D);
    for (const B of built.values()) {
      const it = B.R.it, c = Math.cos(it.yaw || 0), s = Math.sin(it.yaw || 0);
      const dx = cam.position.x - it.x, dz = cam.position.z - it.z, cu = c * dx - s * dz, cv = s * dx + c * dz, cy = cam.position.y - it.y;
      const inside = cu > B.box[0] - 0.05 && cu < B.box[1] + 0.05 && cv > B.box[2] - 0.05 && cv < B.box[3] + 0.05 && cy > -1 && cy < B.box[4] + 1.5;
      B.inside = inside;
      for (const D of B.doors) {
        const d = D.d;
        placeLeaf(D);
        // the punch on the facade (only seen from outside the building)
        if (d.out && !inside && punch.count < MAXL) {
          const o = d.out * (0.09 + 0.13);   // half the wall (0.18 / 2) out to the shell's face, then clear of its door quad
          const pu = d.ax === 'u' ? d.u : d.u + o, pv = d.ax === 'u' ? d.v + o : d.v;
          _q.setFromAxisAngle(Y, (it.yaw || 0) + (d.ax === 'u' ? 0 : Math.PI / 2));
          _m.compose(_p.set(it.x + c * pu + s * pv, it.y + d.y + d.h / 2 - 0.05, it.z - s * pu + c * pv), _q, _s.set(d.w + 0.02, d.h + 0.1, 1));
          punch.setMatrixAt(punch.count++, _m);
        }
      }
    }
    for (const k of LEAF_KINDS) { const M = leafMesh[k]; M.instanceMatrix.needsUpdate = true; M.instanceColor.needsUpdate = true; }
    punch.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ the ALBATROSS inside
  let alb = null;   // { u, INT, group, leaves: [{ D, obj }], punches: [{ p, obj }], crew }
  function attachCarrier(u) {
    const INT = createAlbInterior(u); u.interior = INT;
    const group = new THREE.Group(); group.name = 'albatross-interior';
    const g = buildShipGeo(INT), mesh = new THREE.Mesh(geoFrom(g.build()), MAT); mesh.renderOrder = -3; group.add(mesh);
    const crew = crewMesh(INT.crew); crew.renderOrder = -3; group.add(crew);
    // the watertight doors' leaves (in the ship frame) and the hatch lid
    const leaves = INT.doors.map(D => {
      const k = D.d.kind === 'hatch' ? 'hatch' : 'wt', geo = geoFrom(leafGeo(k).build());
      const o = new THREE.Mesh(geo, worldMaterial()); o.renderOrder = -3; group.add(o);
      const tint = new THREE.Color(D.d.c ?? 0x8c9296); o.material = o.material.clone(); o.material.color = tint; return { D, obj: o };
    });
    const punches = INT.punches.map(p => {
      const o = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), punchMat); o.renderOrder = -2;
      o.position.set(p.x, (p.y0 + p.y1) / 2, p.z); o.rotation.y = Math.PI / 2; o.scale.set(p.w, p.y1 - p.y0, 1); group.add(o); return { p, obj: o };
    });
    u.mesh.add(group);
    alb = { u, INT, group, leaves, punches, crew };
  }
  const _sh = new THREE.Vector3();
  function updateCarrier(cam) {
    const u = war.carrier;
    if (alb && (alb.u !== u || !war.units.includes(alb.u))) { alb.group.parent?.remove(alb.group); alb = null; }
    if (!u || u.side !== 1 || !u.parts || !u.mesh || u.sinking !== undefined) return;
    if (!alb) attachCarrier(u);
    const near = Math.hypot(cam.position.x - u.p.x, cam.position.z - u.p.z) < 260;
    alb.group.visible = near; if (!near) return;
    // the camera in the ship frame: inside the island / the hangar (no punches) or outside
    _sh.copy(cam.position); u.mesh.worldToLocal(_sh);
    const zn = alb.INT.zoneOf(_sh.x, _sh.y, _sh.z), inIsland = zn === 'island' && _sh.y > 7.9 && insideIsland(_sh), inHangar = zn === 'hangar' || (zn === 'island' && _sh.y < 7.9);
    for (const { p, obj } of alb.punches) obj.visible = p.hangar ? !inHangar : !inIsland;
    for (const { D, obj } of alb.leaves) placeShipLeaf(D, obj);
    DOORS.refresh(alb.INT.doors);
  }
  const insideIsland = v => { const tx = v.x - 10.5, tz = v.z - 6; return tx > -2.3 && tx < 2.6 && tz > -8.5 && tz < 8.8 && v.y < 8 + 13.1; };
  function placeShipLeaf(D, obj) {
    const d = D.d, L = DOORS.leaf(D), hx = 10.5 + L.hu, hz = 6 + L.hv;
    if (d.horizontal) {   // the hatch: a lid hinged on its aft edge, lifting toward the bow
      const ang = L.ang; obj.position.set(10.5 + d.u - d.h / 2, 8 + d.y + 0.02, 6 + d.v + d.w / 2);
      obj.rotation.set(0, Math.PI / 2, 0); obj.rotateX(-Math.PI / 2 + ang); obj.scale.set(d.h, d.w, 1); return;
    }
    obj.position.set(hx, 8 + d.y, hz); obj.rotation.set(0, Math.atan2(-L.dv, L.du), 0); obj.scale.set(d.w, d.h, 1);
  }

  // ------------------------------------------------------------------ sound: latches, hinges, watertight dogs
  function doorSound(e) {
    const c = sfx && sfx.ctx; if (!c) return;
    const t = c.currentTime, D = e.D, out = sfx.master, cam = IN.cam, dist = cam ? Math.hypot(cam.position.x - D.cx, cam.position.z - D.cz) : 5;
    const vol = Math.min(1, 6 / Math.max(2, dist)) * 0.5; if (vol < 0.03) return;
    const noise = (dur, f0, f1, q, gain, at = 0, type = 'bandpass') => {
      const n = c.createBufferSource(), b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate), a = b.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; n.buffer = b;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t + at); f.frequency.exponentialRampToValueAtTime(f1, t + at + dur); f.Q.value = q;
      const g = c.createGain(); g.gain.setValueAtTime(0, t + at); g.gain.linearRampToValueAtTime(gain * vol, t + at + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + at + dur);
      n.connect(f); f.connect(g); g.connect(out); n.start(t + at); n.stop(t + at + dur + 0.02);
    };
    const tone = (f0, f1, dur, gain, at = 0, type = 'triangle') => { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t + at); o.frequency.exponentialRampToValueAtTime(f1, t + at + dur); const g = c.createGain(); g.gain.setValueAtTime(gain * vol, t + at); g.gain.exponentialRampToValueAtTime(0.001, t + at + dur); o.connect(g); g.connect(out); o.start(t + at); o.stop(t + at + dur + 0.02); };
    const k = D.d.kind;
    if (e.locked) { tone(220, 200, 0.08, 0.4, 0, 'square'); return; }
    if (k === 'wt' || k === 'hatch') {   // the dogs knocked off one by one (steel on steel), then the heavy leaf; shut: the slam and the dogs
      if (e.open) { for (let i = 0; i < 4; i++) { tone(900 + i * 37, 600, 0.09, 0.35, i * 0.2, 'square'); noise(0.06, 3000, 1500, 3, 0.6, i * 0.2); } noise(0.9, 300, 120, 2, 0.5, 0.85); }
      else if (e.shut) { noise(0.25, 180, 60, 1.5, 1.2, 0); tone(110, 70, 0.4, 0.6, 0, 'sine'); for (let i = 0; i < 4; i++) { tone(860 + i * 41, 580, 0.09, 0.3, 0.35 + i * 0.18, 'square'); } }
      return;
    }
    if (k === 'garage') { noise(1.4, 900, 400, 1.5, 0.35, 0); tone(140, 90, 0.3, 0.3, e.open ? 1.35 : 0); return; }
    if (k === 'barn' || k === 'gate') { noise(1.0, 500, 260, 4, 0.45); tone(320, 240, 0.8, 0.12, 0.1, 'sawtooth'); return; }
    // a house door: the latch, the hinge creak; shut: the thump and the latch
    if (e.open) { tone(1800, 1200, 0.04, 0.4, 0, 'square'); tone(520, 700, 0.5, 0.06, 0.05, 'sawtooth'); noise(0.4, 1400, 900, 6, 0.15, 0.05); }
    else { tone(1700, 1100, 0.04, 0.4, 0.6, 'square'); noise(0.12, 260, 100, 1.5, 0.8, 0.55); }
  }

  // ------------------------------------------------------------------ use (F) and its hint
  const nearestFor = (x, y, z, yaw) => DOORS.nearest(x, y, z, -Math.sin(yaw), -Math.cos(yaw), 1.9);
  const NAMES = { house: 'THE DOOR', inner: 'THE DOOR', shop: 'THE SHOP DOOR', church: 'THE CHURCH DOOR', mil: 'THE HUT DOOR', barn: 'THE BARN DOOR', garage: 'THE GARAGE DOOR', wt: 'THE WATERTIGHT DOOR', hatch: 'THE HATCH', gate: 'THE GATE' };
  IN.use = (x, y, z, yaw) => {
    const D = nearestFor(x, y, z, yaw); if (!D) return false;
    const open = D.want < 0.5;
    if (open) DOORS.open(D); else DOORS.close(D);
    say(`${open ? 'OPENING' : 'SHUTTING'} ${NAMES[D.d.kind] || 'THE DOOR'}${D.d.kind === 'wt' && open ? '  -  KNOCKING OFF THE DOGS' : ''}`, 1.2);
    return true;
  };
  IN.useHint = (x, y, z, yaw) => { const D = nearestFor(x, y, z, yaw); return D ? `F: ${D.want > 0.5 ? 'SHUT' : 'OPEN'} ${NAMES[D.d.kind] || 'THE DOOR'}` : ''; };

  // ------------------------------------------------------------------ per frame
  IN.update = (dt, cam) => {
    IN.cam = cam;
    if (!hutsPlaced && war && war.units && war.units.length) { hutsPlaced = true; placeHuts(); }
    DOORS.step(dt);
    for (const e of DOORS.events) doorSound(e);
    DOORS.events.length = 0;
    if ((scanT -= dt) <= 0) { scanT = 0.25; scan(cam.position.x, cam.position.z); }
    drawLeaves(cam);
    if (war) updateCarrier(cam);
  };
  IN.carrier = () => alb;
  return IN;
}
