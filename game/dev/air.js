// Air units dev page.
//   ?model=tomcat|shrike|reaper|shahed   turntable of the exterior model, sliders for the moving parts (window.__A)
//   ?fly=sortie|fight|reaper|shahed      watch the AI fly the real flight models over the archipelago: the ALBATROSS
//                                        (sailing), islands, a Tomcat sortie (cat, CAP, RTB, trap), a Tomcat vs SHRIKE
//                                        fight, a REAPER orbit, a SHAHED salvo. Chase camera, telemetry. (window.__F)
//   &ui=0 hides the panel; &cam=yaw,pitch,dist,tx,ty,tz; &s={json state}; &t=<speed-up>
import * as THREE from 'three';
import { buildTomcatModel, TCAT } from '../js/units/air/tomcatmodel.js';
import { createTomcatSim, cadcSweep } from '../js/units/air/tomcatfm.js';
import { createPilot } from '../js/units/air/pilot.js';
import { homeAAM, decoyCheck } from '../js/units/air/gameproj.js';
import * as RW from '../js/units/air/rwfm.js';
import * as RM from '../js/units/air/rwmodel.js';
import { buildCarrier, CARRIER } from '../js/ships.js';
import { islandH, ISLANDS } from '../js/world.js';

const Q = new URLSearchParams(location.search), MODEL = Q.get('model'), FLY = Q.get('fly') || (MODEL ? null : 'sortie');
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio) * (+Q.get('res') || 1)); document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8fb6d8);
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a5a34, 0.9));
const sun = new THREE.DirectionalLight(0xfff0d0, 1.1); sun.position.set(0.5, 1, 0.3); scene.add(sun);
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 6000);
const cam = { yaw: 0.7, pitch: 0.35, dist: 26, t: new THREE.Vector3(0, 0, 0) };
if (Q.get('cam')) { const [y, p, d, x, yy, z] = Q.get('cam').split(',').map(Number); Object.assign(cam, { yaw: y, pitch: p, dist: d }); cam.t.set(x || 0, yy || 0, z || 0); }
const ui = document.getElementById('ui'), tele = document.getElementById('tele');
if (Q.get('ui') === '0') { ui.classList.add('hide'); document.getElementById('info').remove(); }
const row = (label, el) => { const l = document.createElement('label'); l.textContent = label; l.appendChild(el); ui.appendChild(l); return el; };
function slider(label, get, set, min, max, step = 0.01) { const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = get(); r.oninput = () => set(+r.value); row(label, r); }
function toggle(label, get, set) { const c = document.createElement('input'); c.type = 'checkbox'; c.checked = get(); c.onchange = () => set(c.checked); row(label, c); }
let drag = null;
renderer.domElement.addEventListener('pointerdown', e => drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey });
addEventListener('pointerup', () => drag = null);
addEventListener('pointermove', e => {
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (drag.pan) { const r = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0), u = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1); cam.t.addScaledVector(r, -dx * cam.dist * 0.0015).addScaledVector(u, dy * cam.dist * 0.0015); }
  else { cam.yaw -= dx * 0.006; cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch + dy * 0.006)); }
});
addEventListener('wheel', e => cam.dist *= Math.exp(e.deltaY * 0.001));
function size() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', size); size();
const orbitCam = () => { camera.position.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(cam.dist).add(cam.t); camera.lookAt(cam.t); };

// ============================================================================================ model turntable
if (MODEL) {
  const builders = { tomcat: () => buildTomcatModel(1), shrike: () => RM.buildShrikeModel(), reaper: () => RM.buildReaperModel(), shahed: () => RM.buildShahedModel() };
  const model = builders[MODEL](); scene.add(model.group);
  // (airai-polish) &lod=far shows the far level of detail close up; &dmg=<hp fraction> a damage state; &dead=1 killed
  if (Q.get('lod') === 'far' && model.far) { scene.remove(model.group); scene.add(model.far); }
  if (Q.get('dmg') !== null && model.setDamage) model.setDamage(+Q.get('dmg'));
  if (Q.get('dead') === '1' && model.kill) model.kill();
  const ground = { tomcat: -2.5, shrike: RW.SHRIKE.GEAR[0][1], reaper: RW.REAPER.GEAR[0][1], shahed: -0.6 }[MODEL];
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3c4045 })); deck.position.y = ground; scene.add(deck);
  const grid = new THREE.GridHelper(80, 80, 0x667080, 0x50565e); grid.position.y = ground + 0.002; scene.add(grid);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff00ff })); scene.add(tip);
  const S = { surf: { stab: 0, ail: 0, rud: 0, flap: 0, lef: 0, brake: 0 }, sweep: 20, vane: 0, gear: 1, hook: 0, canopy: 0, steer: 0, wow: [0, 0, 0], launchBar: false,
    eng: [{ n: 0.7, nozzle: 0.6, ab: 0 }, { n: 0.7, nozzle: 0.6, ab: 0 }], lights: true, prop: 0, stores: MODEL === 'tomcat' ? createTomcatSim().stores : [{ w: 'aam', st: 'L', on: true }, { w: 'aam', st: 'R', on: true }] };
  if (Q.get('s')) { const o = JSON.parse(Q.get('s')); if (o.surf) Object.assign(S.surf, o.surf), delete o.surf; Object.assign(S, o); }
  for (const k of ['stab', 'ail', 'rud', 'flap', 'lef', 'brake']) slider(k, () => S.surf[k], v => S.surf[k] = v, k === 'flap' || k === 'lef' || k === 'brake' ? 0 : -0.5, k === 'flap' || k === 'lef' || k === 'brake' ? 1 : 0.5);
  if (MODEL === 'tomcat') { slider('sweep', () => S.sweep, v => S.sweep = v, 20, 75, 0.5); slider('vane', () => S.vane, v => S.vane = v, 0, 1); }
  for (const k of ['gear', 'hook', 'canopy']) slider(k, () => S[k], v => S[k] = v, 0, 1);
  slider('AB', () => S.eng[0].ab, v => { S.eng[0].ab = S.eng[1].ab = v; S.eng[0].nozzle = S.eng[1].nozzle = 0.3 + 0.7 * v; }, 0, 1);
  toggle('launchBar', () => S.launchBar, v => S.launchBar = v); toggle('lights', () => S.lights, v => S.lights = v);
  let auto = Q.get('auto') === '1'; toggle('turntable', () => auto, v => auto = v);
  let last = performance.now(), time = 0;
  const frame = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt; if (auto) cam.yaw += dt * 0.3;
    orbitCam(); model.animate(S, dt, time); if (model.hookTip) model.hookTip(tip.position);
    renderer.render(scene, camera); requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.__A = { model, S, cam, camera, scene, renderer, THREE, TCAT, render: () => { orbitCam(); model.animate(S, 0, time); renderer.render(scene, camera); } };
}

// ============================================================================================ watch the AI fly
if (FLY) {
  scene.fog = new THREE.Fog(0x8fb6d8, 1500, 5500); scene.background = new THREE.Color(0x8fb6d8);
  // sea, islands (the game's own height function), the ALBATROSS sailing
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x2a5872 })); scene.add(sea);
  const N = 160, L = 1600, tg = new THREE.PlaneGeometry(L, L, N, N).rotateX(-Math.PI / 2), tp = tg.attributes.position, cols = [];
  for (let i = 0; i < tp.count; i++) { const h = islandH(tp.getX(i), tp.getZ(i)); tp.setY(i, h); const c = h < 1.5 ? [0.76, 0.7, 0.5] : h < 20 ? [0.36, 0.5, 0.26] : [0.45, 0.47, 0.38]; cols.push(...c); }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); tg.computeVertexNormals();
  scene.add(new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  const terrain = (x, z) => Math.max(0, Math.abs(x) < 800 && Math.abs(z) < 800 ? islandH(x, z) : 0);
  const car = buildCarrier(1); scene.add(car.group);
  // the ALBATROSS in open water, steaming along the longest clear lane (as the game turns her into clear water to launch)
  const C = { x: -350, z: -40, yaw: 0, speed: 5, w: 0 };
  { let best = -1; for (let k = 0; k < 36; k++) { const y = k * Math.PI / 18; let d = 0; while (d < 1500 && islandH(C.x - Math.sin(y) * d, C.z - Math.cos(y) * d) < -2) d += 20; if (d > best) { best = d; C.yaw = y; } } }
  const loc = (x, z) => { const dx = x - C.x, dz = z - C.z, co = Math.cos(C.yaw), si = Math.sin(C.yaw); return [dx * co - dz * si, dx * si + dz * co]; };
  const deckAt = (x, z) => { const [lx, lz] = loc(x, z); let hw = CARRIER.W / 2 * 0.97, h = -1e9; if (lz < -CARRIER.L / 2 + 16) hw *= Math.max(0, (lz + CARRIER.L / 2 + 6) / 22); if (Math.abs(lx) < hw && lz > -CARRIER.L / 2 - 6 && lz < CARRIER.L / 2) h = CARRIER.DECK; if (Math.abs(lx - CARRIER.TOWER_X) < 2.9 && Math.abs(lz - CARRIER.TOWER_Z) < 9) h = CARRIER.DECK + CARRIER.TOWER_H; return h; };
  const env = {
    terrain, groundY: (x, z) => Math.max(terrain(x, z), deckAt(x, z)), water: (x, z) => terrain(x, z) <= 0 && deckAt(x, z) < 0,
    surfVel: (x, z) => deckAt(x, z) > 0 ? { vx: -Math.sin(C.yaw) * C.speed, vz: -Math.cos(C.yaw) * C.speed, w: C.w, cx: C.x, cz: C.z } : null,
    carrier: () => ({ x: C.x, z: C.z, yaw: C.yaw, deck: CARRIER.DECK, vx: -Math.sin(C.yaw) * C.speed, vz: -Math.cos(C.yaw) * C.speed, speed: C.speed, w: C.w }),
    anchor: () => ({ x: C.x, y: 0, z: C.z }),
  };
  // units: { A (sim) | D (shahed), pilot, model, side, hp, r }
  const units = [], proj = [], pmesh = new THREE.Group(); scene.add(pmesh);
  const addUnit = (u) => { u.p = (u.A || u.D).pos; u.v = (u.A || u.D).vel; u.air = true; units.push(u); scene.add(u.model.group); if (u.pilot) u.pilot.unit = u; return u; };
  env.foes = function* (side) { for (const u of units) if (u.side !== side && !u.dying && !u.dead) yield u; };
  env.missiles = function* (side) { for (const b of proj) if (b.kind === 'aam' && b.side !== side) yield b; };
  env.inFlight = t => proj.filter(b => b.kind === 'aam' && b.tgt === t).length;
  const _f = new THREE.Vector3();
  env.fire = (kind, A, st, tgt, W) => {
    const u = units.find(u => u.A === A); A.forward(_f);
    if (kind === 'gun') { proj.push({ kind: 'gun', side: u.side, p: A.pos.clone().addScaledVector(_f, 9), v: _f.clone().multiplyScalar(W.speed).add(A.vel), life: 1.2 }); return; }
    const sp = (A.P.STATIONS || {})[st.st] || [0, -1, 0];
    const b = { kind: 'aam', side: u.side, p: A.worldPoint(sp), v: _f.clone().multiplyScalar(W.v0).add(A.vel), tgt, age: 0, spd: A.vel.length() + W.v0, life: W.life };
    b.mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff })); pmesh.add(b.mesh); proj.push(b);
  };
  const trail = new THREE.Group(); scene.add(trail); const trailPts = [];
  const puff = (p, c = 0xdddddd, s = 1.2, life = 3) => { const m = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 4), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6 })); m.position.copy(p); m.life = life; trail.add(m); trailPts.push(m); };
  function tomcat(state) {
    const A = createTomcatSim(9, { fuelX: 8 }), model = buildTomcatModel(1, { modex: 200 + units.length + 1 }), P = createPilot(A, { side: 1, name: 'VICTORY ' + (200 + units.length + 1) });
    A.reset(C.x, CARRIER.DECK, C.z, C.yaw, { running: true });
    const u = addUnit({ A, pilot: P, model, side: 1, hp: 4, r: 4.5, name: P.name, decoys: 6 });
    if (state === 'cat') P.launch(env); else { A.reset(C.x + 400, 0, C.z, C.yaw, { running: true, airborne: true, alt: 250, speed: 75 }); for (const e of A.eng) e.n = 0.9; A.sweep = cadcSweep(0.5); P.spawnAir('cap'); }
    return u;
  }
  function shrike(x, z, yaw) {
    const A = RW.createShrikeSim(9), model = RM.buildShrikeModel(), P = createPilot(A, { side: 2 });
    A.reset(x, 0, z, yaw, { running: true, airborne: true, alt: 260, speed: 80 }); for (const e of A.eng) e.n = 0.9; P.anchor = { x: C.x, y: 0, z: C.z }; P.spawnAir('cap');
    return addUnit({ A, pilot: P, model, side: 2, hp: 2, r: 3.5, name: 'RW-4 SHRIKE', decoys: 2 });
  }
  function reaper(x, z) {
    const A = RW.createReaperSim(9), model = RM.buildReaperModel(), P = createPilot(A, { side: 2 });
    A.reset(x, 0, z, 0, { running: true, airborne: true, alt: 260, speed: 28 }); A.eng[0].n = 0.6; P.anchor = { x: x + 300, y: 0, z }; P.spawnAir('patrol');
    return addUnit({ A, pilot: P, model, side: 2, hp: 3, r: 5, name: 'MQ-9 REAPER' });
  }
  function shahed(x, z, tgt, k) {
    const D = RW.createShahedSim(9), model = RM.buildShahedModel(); D.launch(x + k * 6, 4, z, Math.atan2(tgt.x - x, -(tgt.z - z)) + (k - 2) * 0.1);
    return addUnit({ D, model, side: 2, hp: 1, r: 2, name: 'SHAHED', tgt, delay: k * 1.2 });
  }
  if (FLY === 'sortie') tomcat('cat');
  if (FLY === 'fight') { tomcat('air'); shrike(C.x - 1800, C.z - 900, 0.9); }
  if (FLY === 'reaper') reaper(ISLANDS[9].x - 300, ISLANDS[9].z);
  if (FLY === 'shahed') { const t = { x: ISLANDS[9].x, y: 10, z: ISLANDS[9].z }; for (let k = 0; k < 4; k++) shahed(t.x + 900, t.z - 500, t, k); tomcat('air'); }

  let follow = 0, camMode = 0, speedUp = +Q.get('t') || 1, time = 0;
  addEventListener('keydown', e => {
    if (e.code === 'KeyC') camMode = (camMode + 1) % 3;
    if (e.code === 'KeyT') speedUp = speedUp === 1 ? 4 : 1;
    if (/^Digit[1-9]$/.test(e.code)) follow = Math.min(units.length - 1, +e.code.slice(5) - 1);
  });
  const chase = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion();
  const DT = 1 / 60;
  function step() {
    time += DT; C.x += -Math.sin(C.yaw) * C.speed * DT; C.z += -Math.cos(C.yaw) * C.speed * DT;
    for (const u of units) {
      if (u.dead) continue;
      if (u.dying) { u.v.y -= 9 * DT; u.p.addScaledVector(u.v, DT); if (u.p.y < terrain(u.p.x, u.p.z)) { u.dead = true; u.model.group.visible = false; puff(u.p, 0xff9030, 6, 2); } continue; }
      if (u.pilot) { u.pilot.update(DT, env); if (u.A.dead) { u.dying = true; puff(u.p, 0xff9030, 5, 2); } if (u.pilot.recovered) { u.dead = true; u.model.group.visible = false; } }
      else if (u.D) {
        if ((u.delay -= DT) > 0) { u.model.group.visible = false; continue; } u.model.group.visible = true;
        RW.shahedGuide(u.D, u.tgt, terrain); u.D.step(DT);
        if (u.D.pos.y <= terrain(u.D.pos.x, u.D.pos.z) + 0.3) { u.dead = true; u.model.group.visible = false; puff(u.p, 0xff7020, 8, 2.5); }
      }
    }
    for (let i = proj.length - 1; i >= 0; i--) {
      const b = proj[i]; b.life -= DT;
      if (b.kind === 'aam') { const tu = units.find(u => u === b.tgt); decoyCheck(b, tu); homeAAM(b, DT); if (Math.random() < 0.5) puff(b.p, 0xeeeeee, 0.8, 2); } else b.v.y -= 9 * DT;
      b.p.addScaledVector(b.v, DT); let done = b.life <= 0 || b.p.y < terrain(b.p.x, b.p.z);
      for (const u of units) if (!done && u.side !== b.side && !u.dying && !u.dead && u.p.distanceTo(b.p) < (b.kind === 'aam' ? 7 : u.r)) { u.hp -= b.kind === 'aam' ? 9 : 1.4; if (u.hp <= 0) { u.dying = true; puff(u.p, 0xff9030, 5, 2); } done = true; }
      if (b.mesh) { b.mesh.position.copy(b.p); b.mesh.lookAt(_v.copy(b.p).add(b.v)); }
      if (done) { if (b.mesh) pmesh.remove(b.mesh); proj.splice(i, 1); }
    }
    for (let i = trailPts.length - 1; i >= 0; i--) { const m = trailPts[i]; m.life -= DT; m.material.opacity = Math.max(0, m.life / 3 * 0.6); if (m.life <= 0) { trail.remove(m); trailPts.splice(i, 1); } }
  }
  let last = performance.now(), acc = 0;
  const frame = now => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt * speedUp;
    let n = 0; while (acc > DT && n < 40) { step(); acc -= DT; n++; }
    car.group.position.set(C.x, 0, C.z); car.group.rotation.y = C.yaw;
    for (const u of units) {
      if (u.dead) continue; const m = u.model.group;
      if (u.A) { m.position.copy(u.A.pos); m.quaternion.copy(u.A.q); u.model.animate(u.A, dt, time); }
      else { m.position.set(u.D.pos.x, u.D.pos.y, u.D.pos.z); m.rotation.set(u.D.gam, -u.D.hdg, -u.D.bank, 'YXZ'); u.model.animate(u.D, dt, time); }
    }
    const fu = units[follow];
    if (fu && camMode < 2) {
      const A = fu.A || null, p = fu.p;
      if (A) { _q.copy(A.q); _v.set(0, camMode ? 3 : 6, camMode ? 22 : 40).applyQuaternion(_q); } else _v.set(0, 4, 18).applyAxisAngle(new THREE.Vector3(0, 1, 0), -fu.D.hdg);
      chase.lerp(_v.add(p), chase.lengthSq() ? 0.15 : 1); camera.position.copy(chase); camera.lookAt(p);
    } else { cam.t.set(C.x, 10, C.z); cam.dist = Math.max(cam.dist, 300); orbitCam(); }
    const P = fu && fu.pilot, A = fu && fu.A;
    tele.textContent = fu ? [`${fu.name}  [${follow + 1}/${units.length}]  ${P ? P.state.toUpperCase() + (P.mode && P.state === 'fight' ? ' / ' + P.mode : '') : fu.D ? (fu.D.diving ? 'DIVE' : 'CRUISE') : ''}  hp ${fu.hp}`,
      A ? `EAS ${(A.eas * 1.944).toFixed(0)} kt  M ${A.mach.toFixed(2)}  ALT ${A.pos.y.toFixed(0)} m  AoA ${(A.alpha * 57.3).toFixed(1)}°  g ${A.nz.toFixed(1)}  sweep ${(A.sweep ?? 0).toFixed(0)}°` : fu.D ? `EAS ${(fu.D.eas * 1.944).toFixed(0)} kt  ALT ${fu.D.pos.y.toFixed(0)} m` : '',
      A ? `N ${A.eng.map(e => (e.n * 100).toFixed(0)).join('/')}%  AB ${A.eng.map(e => (e.ab || 0).toFixed(1)).join('/')}  fuel ${A.fuel.toFixed(0)} kg  gear ${A.gear.toFixed(1)} flap ${A.surf.flap.toFixed(1)} hook ${A.hook.toFixed(1)}` : '',
      P && P.lso && (P.state === 'final' || P.state === 'trapped') ? `LSO  R ${P.lso.R.toFixed(0)} m  lineup ${P.lso.latErr.toFixed(1)} m  glideslope ${P.lso.hErr.toFixed(1)} m  AoA ${P.lso.aoa.toFixed(1)}°` : '',
      P ? P.log.slice(-4).map(l => `${l.t.toFixed(0).padStart(4)}  ${l.msg}`).join('\n') : ''].filter(Boolean).join('\n') : '';
    renderer.render(scene, camera); requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.__F = { units, proj, C, env, cam, camera, THREE, get time() { return time; }, set follow(v) { follow = v; }, set camMode(v) { camMode = v; }, set speedUp(v) { speedUp = v; }, step, tomcat, shrike, reaper, shahed };
}
