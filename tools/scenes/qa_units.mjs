// QA (ngc/qa-units): the regression shot list for every unit model and every person: close up, at game distances, in
// their seats and in first person, plus an automatic EYE CHECK in every seat a player can sit in (no crewman, no
// passenger and none of the player's own body in front of the eye, nothing inside the near plane).
// Sections (QA=deck,seats,foot,war,dev comma list; default: all):
//   deck   the ALBATROSS deck: the Huey (front / rear 3/4, side, 150 m), the deck crew, the parked aircraft, scale lineup
//   seats  first person in every seat: Huey, Hornet, Tomcat (pilot, RIO), M60 (4), M113 (13), M151, M35, Lada, Land
//          Rover; the eye check for each seat looking ahead / left / right / back; outside views of the crews
//   foot   the Marine: first and third person, stand / crouch / prone, next to the Huey and a jeep for scale
//   war    a fight on SANDBAR: an MV-22 lands STRIDERs, a CH-46 lands Marines, an RW-7 and an M1A2 come ashore, wrecks
//   dev    dev pages: the Marine poses, the RUNAWAY lineup, the AA units, the CH-46 / MV-22 / C-130 / Hornet / Tomcat
//          turntables, the wheeled and tracked vehicles
//   CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh QA=seats node snap.mjs scenes/qa_units.mjs
const PART = (process.env.QA || 'deck,seats,foot,war,dev').split(',');
const has = p => PART.includes(p);
const PI = Math.PI;

// the game camera hook: window.__cam = { f: () => ({x,y,z,yaw}), yaw, pitch, dist, ty } (orbit round a frame: yaw 0 =
// behind it, PI = in front) | { follow: unit, ... } | { p: [x,y,z], t: [x,y,z] } (fixed) | null (the game's own camera)
const HOOK = `(() => { const G = __G, T = G.THREE, r = G.renderer, orig = r.render.bind(r), cam = new T.PerspectiveCamera(40, 1, 0.1, 6000);
  r.render = (s, c) => {
    if (c === G.zCam) window.__scene = s;
    const C = window.__cam; if (!C || c !== G.zCam) return orig(s, c);
    let f = C.f ? C.f() : C.follow ? { x: C.follow.x ?? C.follow.p.x, y: C.follow.y ?? C.follow.p.y, z: C.follow.z ?? C.follow.p.z, yaw: C.follow.yaw || 0 } : null;
    if (f) { const a = f.yaw + C.yaw, d = C.dist, p = C.pitch;
      cam.position.set(f.x + Math.sin(a) * Math.cos(p) * d, f.y + (C.ty || 0) + Math.sin(p) * d, f.z + Math.cos(a) * Math.cos(p) * d); cam.up.set(0, 1, 0); cam.lookAt(f.x, f.y + (C.ty || 0), f.z); }
    else if (C.p) { cam.position.set(...C.p); cam.up.set(0, 1, 0); cam.lookAt(...C.t); }
    else return orig(s, c);
    { const gy = Math.max(G.terrainH(cam.position.x, cam.position.z), -50); if (cam.position.y < gy + 0.4) cam.position.y = gy + 0.4; }
    cam.fov = C.fov || 40; cam.aspect = c.aspect; cam.near = C.near || 0.1; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    G.zCam.position.copy(cam.position);   // (LOD and the war's ear follow the test camera)
    return orig(s, cam);
  };
  window.__fr = id => () => { const d = G.crafts.get(id); return d && d.present() && d.frame ? d.frame({}) : null; };
  // hold the head (first person) at a yaw / pitch: the game recentres it otherwise
  window.__look = (yaw, pitch = 0) => { clearInterval(window.__lookI); window.__lookI = setInterval(() => { const d = G.crafts.active; for (const hd of [d && d.head, G.head]) if (hd) { hd.yaw = yaw; hd.pitch = pitch; } if (d) d.headHold = true; }, 5); };
  // EYE CHECK: rays from the game camera through a grid over the middle of the view; anything that belongs to a person
  // (crew, passengers, soldiers, the player's own figure) within 0.9 m, or any mesh nearer than the near plane x 1.5
  const PERSON = /soldier|marine|crew|pilot|gunner|figure|person|civilian|body|torso|pelvis|chest|head$|^head|trooper|jumper|squad|passenger|occupant|driverfig|\bRIO\b/i;
  window.__eyeCheck = (tag) => { const c = G.zCam, s = window.__scene; if (!s) return { tag, err: 'no scene' }; c.updateMatrixWorld();
    const rc = new T.Raycaster(); rc.near = 0; rc.far = 0.9; rc.params.Points.threshold = 0; rc.params.Line.threshold = 0; rc.layers.mask = c.layers.mask;
    const bad = new Map(), nv = new T.Vector2(), near = c.near;
    const vis = o => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
    const path = o => { const n = []; for (let q = o; q && n.length < 7; q = q.parent) if (q.name) n.push(q.name); return n.join('<'); };
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      nv.set(i * 0.3, j * 0.3); rc.setFromCamera(nv, c);
      let hits = []; try { hits = rc.intersectObject(s, true); } catch (e) { return { tag, err: String(e) }; }
      for (const hh of hits) { const o = hh.object; if (!o.isMesh || !vis(o)) continue; const m = o.material; if (m && (m.transparent && m.opacity < 0.3 || m.visible === false)) continue;
        const pth = path(o), person = PERSON.test(pth), clip = hh.distance < near * 1.5;
        if (person || clip) { const k = (person ? 'PERSON ' : 'CLIP ') + (pth || o.type); const b = bad.get(k); if (!b || b > hh.distance) bad.set(k, +hh.distance.toFixed(2)); }
        break; }
    }
    return { tag, craft: G.G.craft, seat: G.crafts.seat, near: +near.toFixed(3), bad: [...bad].map(([k, d]) => k + ' @' + d) }; };
  window.__eyeLog = []; window.__hud = v => { const e = document.getElementById('hud'); if (e) e.style.visibility = v ? '' : 'hidden'; };
  __hud(false); return true; })()`;

export default async function (h) {
  const shot = async (n, ms = 1200) => { await h.wait(ms); await h.shot(n); };
  const cam = async (o, n, ms) => { await h.eval(`(window.__cam = ${o}, 1)`); if (n) await shot(n, ms); };
  // first person in the active craft: look about, eye-check each direction, shoot the ones named in `shots`
  const eyes = async (tag, looks, shots = []) => {
    for (const [ln, y, p] of looks) {
      await h.eval(`(__look(${y}, ${p}), 1)`); await h.wait(700);
      const r = await h.eval(`(() => { const r = __eyeCheck('${tag}-${ln}'); __eyeLog.push(r); return r; })()`);
      if (shots.includes(ln)) await shot(`${tag}-${ln}`, 300);
    }
  };
  const LOOKS = [['ahead', 0, -0.05], ['left', 1.25, -0.1], ['right', -1.25, -0.1], ['back', 2.5, -0.1], ['down', 0, -0.7]];
  const game = has('deck') || has('seats') || has('foot') || has('war');
  if (game) {
    await h.goto('?debug&auto&kb&peace&res=0.45');
    await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 40000);
    await h.eval(HOOK);
    await h.wait(1500);
  }
  // ------------------------------------------------------------------------------------------------ deck
  if (has('deck')) {
    const F = `__fr('heli')`;
    await cam(`{ f: ${F}, yaw: ${PI + 0.65}, pitch: 0.12, dist: 17, ty: 1.2 }`, 'huey-front34');
    await cam(`{ f: ${F}, yaw: 0.75, pitch: 0.18, dist: 18, ty: 1.2 }`, 'huey-rear34');
    await cam(`{ f: ${F}, yaw: ${-PI / 2}, pitch: 0.04, dist: 16, ty: 1.2 }`, 'huey-side');
    await cam(`{ f: ${F}, yaw: ${PI + 0.55}, pitch: 0.08, dist: 5.5, ty: 1.0 }`, 'huey-cockpit-crew');
    await cam(`{ f: ${F}, yaw: ${-PI / 2 + 0.3}, pitch: 0.08, dist: 5.5, ty: 0.8 }`, 'huey-door-gunner');
    await cam(`{ f: ${F}, yaw: ${PI + 0.5}, pitch: 0.1, dist: 150, ty: 1.2, fov: 12 }`, 'huey-150m');
    // the deck crew (ship frame) and the parked aircraft
    await h.eval(`(() => { const c = __G.war.carrier, m = c.parts.crew.members; const near = m.slice().sort((a, b) => Math.hypot(a.x, a.z - 20) - Math.hypot(b.x, b.z - 20));
      window.__crewAt = k => { const p = near[k], w = __G.GR.toWorld(c, p.x, p.z); return [w.x, c.p.y + (c.parts.localDeck ? 0 : 0) + (__G.war.deckY ? __G.war.deckY(c, w.x, w.z) - c.p.y : 0) + (p.y || 0), w.z]; };
      return { n: m.length, modes: [...new Set(m.map(q => q.mode))].join(','), jerseys: [...new Set(m.map(q => q.jersey))].join(',') }; })()`);
    for (const k of [0, 4, 9]) {
      await h.eval(`(window.__cp = __crewAt(${k}), window.__cp.map(v => +v.toFixed(1)))`);
      await cam(`{ p: [__cp[0] + 2.6, __cp[1] + 1.5, __cp[2] + 2.6], t: [__cp[0], __cp[1] + 0.9, __cp[2]] }`, `deckcrew-close-${k}`);
    }
    await cam(`{ p: [__cp[0] + 18, __cp[1] + 9, __cp[2] + 18], t: [__cp[0], __cp[1] + 0.9, __cp[2]] }`, 'deckcrew-wide');
    await h.eval(`(() => { const c = __G.war.carrier; window.__pk = c.parts.parked.map(p => { if (!p) return null; const o = p.group || p.mesh || p.obj || p.model || (p.isObject3D ? p : null); if (!o || !o.getWorldPosition) return null; const P = new __G.THREE.Vector3(); o.getWorldPosition(P); return P.toArray(); }); return __pk.map(p => p && p.map(Math.round)); })()`);
    for (let i = 0; i < 5; i++) {
      const ok = await h.eval(`!!(__pk[${i}])`);
      if (ok) await cam(`{ p: [__pk[${i}][0] + 13, __pk[${i}][1] + 5, __pk[${i}][2] + 13], t: [__pk[${i}][0], __pk[${i}][1] + 1.5, __pk[${i}][2]] }`, `deck-parked-${i}`);
    }
    await cam('null');
  }
  // ------------------------------------------------------------------------------------------------ seats
  if (has('seats')) {
    // the Huey: the player's own seat
    await h.eval('(__G.cockpitCam = true, 1)'); await h.wait(1200);
    await eyes('huey-pilot', LOOKS, ['ahead', 'left', 'right', 'back']);
    // the Hornet on the cat
    await h.eval('(__G.launchJet(), 1)'); await h.wait(1500);
    if (await h.eval('__G.G.craft === "jet"')) {
      await h.eval('(__G.cockpitCam = true, 1)'); await h.wait(1500);
      await eyes('hornet', LOOKS, ['ahead', 'left', 'down']);
      await h.eval('(clearInterval(__lookI), __G.cockpitCam = false, __G.JP.snapChase && __G.JP.snapChase(), 1)'); await shot('hornet-chase-cat', 1500);
    }
    await h.eval('(__G.swapToHeli && __G.swapToHeli(), 1)'); await h.wait(1500);
    // the Tomcat: pilot and RIO
    await h.eval('(__G.tomcatC.launch(), 1)'); await h.wait(1500);
    if (await h.eval('__G.G.craft === "tomcat"')) {
      await h.eval('(__G.cockpitCam = true, 1)'); await h.wait(1500);
      await eyes('tomcat-pilot', LOOKS, ['ahead', 'back']);
      await h.key('tap', 'BracketRight'); await h.wait(1200);
      await eyes('tomcat-rio', LOOKS, ['ahead', 'left']);
      await h.key('tap', 'BracketLeft'); await h.wait(300);
      await h.eval('(clearInterval(__lookI), __G.cockpitCam = false, __G.tomcatC.TP.snapChase && __G.tomcatC.TP.snapChase(), 1)'); await shot('tomcat-chase-cat', 1500);
    }
    // ground crafts: every seat looking about (eye check), the driver's seat and one passenger shot
    const ground = [['m60', 4], ['m113', 13], ['m151-7', 4], ['m35-8', 9], ['lada-13', 4], ['landrover-14', 3]];
    for (const [id, n] of ground) {
      const ok = await h.eval(`(() => { const d = __G.crafts.get('${id}'); if (!d || !d.present()) return false; return __G.crafts.control('${id}', 0, 'foot'); })()`);
      if (!ok) { await h.log(`no ${id}`); continue; }
      await h.eval('(__G.cockpitCam = true, 1)'); await h.wait(2000);
      for (let s = 0; s < n; s++) {
        if (s) { await h.eval(`(__G.crafts.cycleSeat(1), __G.crafts.seat)`); await h.wait(900); }
        const sh = s === 0 ? ['ahead', 'left', 'right', 'back'] : (s === 1 || s === n - 1) ? ['ahead', 'back'] : [];
        await eyes(`${id}-s${s}`, LOOKS.slice(0, 4), sh);
      }
      await h.eval('(clearInterval(__lookI), 1)');
      // the outside, crew aboard
      await cam(`{ f: __fr('${id}'), yaw: ${PI + 0.7}, pitch: 0.18, dist: ${id === 'm60' || id === 'm113' || id === 'm35-8' ? 11 : 7}, ty: 1.4 }`, `${id}-outside-front34`);
      await cam(`{ f: __fr('${id}'), yaw: 0.8, pitch: 0.2, dist: ${id === 'm60' || id === 'm113' || id === 'm35-8' ? 11 : 7}, ty: 1.4 }`, `${id}-outside-rear34`);
      await cam(`{ f: __fr('${id}'), yaw: ${PI + 0.5}, pitch: 0.25, dist: 150, ty: 1.2, fov: 10 }`, `${id}-150m`);
      await cam('null');
    }
    await h.eval('(__G.cockpitCam = false, 1)');
    await h.eval('__eyeLog.filter(r => r.bad && r.bad.length || r.err)');
    await h.expect('__eyeLog.length > 20 && __eyeLog.every(r => !r.err && !r.bad.some(b => b.startsWith("PERSON")))', 'EYE CHECK: no person in front of the eye in any seat');
    await h.expect('__eyeLog.every(r => !r.bad.some(b => b.startsWith("CLIP")))', 'EYE CHECK: nothing clips into the camera in any seat');
  }
  const fresh = async (q = '?debug&auto&kb&peace&res=0.45') => {
    await h.goto(q);
    await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 40000);
    await h.eval(HOOK); await h.wait(1000);
  };
  // ------------------------------------------------------------------------------------------------ foot
  if (has('foot')) {
    if (game && (has('deck') || has('seats'))) await fresh();
    await h.key('tap', 'KeyY'); await h.wait(1500);
    await h.expect("__G.G.craft === 'foot' && !!__G.marine", 'out of the Huey as the Marine');
    // stand him a few metres off the Huey's nose, facing it (scale)
    await h.eval(`(() => { const f = __G.crafts.get('heli').frame({}), a = f.yaw; __G.foot.spawnAt({ x: f.x - Math.sin(a) * 6.5 + Math.cos(a) * 2, y: f.y + 4, z: f.z - Math.cos(a) * 6.5 - Math.sin(a) * 2, yaw: a + PI_ }); __G.marine.view = 'third'; return 1; })()`.replace('PI_', 'Math.PI'));
    await h.wait(1500);
    const M = `() => { const W = __G.foot.W; return { x: W.x, y: W.y, z: W.z, yaw: __G.marine.S.yaw }; }`;
    for (const [st, key] of [['stand', 'KeyX'], ['crouch', 'KeyC'], ['prone', 'KeyZ']]) {
      await h.eval(`(__G.marine.key('${key}'), 1)`); await h.wait(1800);
      const ty = st === 'prone' ? 0.3 : st === 'crouch' ? 0.7 : 1.0;
      await cam(`{ f: ${M}, yaw: ${PI - 0.6}, pitch: 0.12, dist: 2.6, ty: ${ty} }`, `marine-${st}-front34`);
      await cam(`{ f: ${M}, yaw: 0.6, pitch: 0.18, dist: 2.6, ty: ${ty} }`, `marine-${st}-rear34`);
      await cam(`{ f: ${M}, yaw: ${-PI / 2}, pitch: 0.05, dist: 2.6, ty: ${ty} }`, `marine-${st}-side`);
      await cam('null');
      await h.eval(`(__G.marine.view = 'first', 1)`); await h.wait(1000);
      for (const [ln, p] of [['ahead', 0], ['down', -1.2], ['up', 0.9]]) {
        await h.eval(`(__G.marine.aim(__G.marine.S.yaw, ${p}), 1)`); await h.wait(800);
        await h.eval(`(() => { const r = __eyeCheck('marine-${st}-${ln}'); __eyeLog.push(r); return r; })()`);
        if (ln !== 'up') await shot(`marine-${st}-first-${ln}`, 200);
      }
      await h.eval(`(__G.marine.aim(__G.marine.S.yaw, 0), __G.marine.view = 'third', 1)`);
    }
    await h.eval(`(__G.marine.key('KeyX'), 1)`); await h.wait(1500);
    await cam(`{ f: ${M}, yaw: ${PI - 0.9}, pitch: 0.15, dist: 13, ty: 1.4 }`, 'marine-scale-huey');
    await cam(`{ f: ${M}, yaw: ${PI - 0.5}, pitch: 0.06, dist: 150, ty: 1.0, fov: 6 }`, 'marine-150m');
    await cam('null');
    await h.eval('__eyeLog.filter(r => r.bad && r.bad.length || r.err)');
    await h.expect('__eyeLog.every(r => !r.err && !r.bad.length)', 'EYE CHECK: the Marine sees nothing of himself in front of the eye, nothing clips');
  }
  // ------------------------------------------------------------------------------------------------ war
  if (has('war')) {
    if (game && (has('deck') || has('seats') || has('foot'))) await h.goto('about:blank').catch(() => {});
    await h.goto('?debug&kb&res=0.45');
    await h.waitFor('window.__G', 15000); await h.wait(500);
    await h.key('tap', 'Enter'); await h.waitFor(`__G.G.state === 'play'`, 15000); await h.wait(1200);
    await h.eval(HOOK);
    await h.eval(`(() => { const G = __G; window.__ff = (secs, dt = 1 / 30, until) => { const W = G.war; for (let i = 0; i < secs / dt; i++) { W.update(dt, G.PL, false); G.fx.update(dt); if (until && until()) return true; } return false; };
      const I = G.ISLANDS.find(i => i.name === 'SANDBAR'); window.__I = I; const W = G.war; W.E.mat = 0; W.transT = 1e9; G.G.bench = true;
      const x = I.pad.x - 22, z = I.pad.z + 14; G.H.reset(new G.THREE.Vector3(x, G.terrainH(x, z) + 1.9, z), 0.6, true, 1); G.HI.setCollective(0); G.war.ground.godPlayer = true;
      window.__GS = () => G.war.ground.sim; window.__kill = (u, n = 400) => { const T = G.THREE; for (let k = 0; k < n && u.alive; k++) { const gx = u.x + 30, gy = u.y + 25, gz = u.z + 20, v = new T.Vector3(u.x - gx, u.y + 1 - gy, u.z - gz).normalize().multiplyScalar(105); if (k % 10 === 0) W.fireRocket(new T.Vector3(gx, gy, gz), v); __ff(1 / 30); } return !u.alive; };
      return { pad: [I.pad.x, I.pad.z] }; })()`);
    // MV-22 with STRIDERs
    await h.eval(`(() => { const W = __G.war, u = W.rotary.make('transport', 2, 0, 0, 0, { target: __I }); W.units.push(u); window.__u = u; return u.kind; })()`);
    await h.eval(`__ff(240, 1 / 30, () => __u.rot.AI.phase === 'ground' || __u.dead)`);
    await h.eval(`(window.__cam = { follow: __u, yaw: 2.6, dist: 28, pitch: 0.2, ty: 2 }, __ff(4), 1)`); await shot('mv22-down-ramp');
    await h.eval(`(window.__cam = { follow: __u, yaw: 0.4, dist: 18, pitch: 0.15, ty: 2 }, 1)`); await shot('mv22-rear');
    await h.eval(`__ff(25, 1 / 30, () => __GS().units.filter(u => u.kind === 'strider').length >= 8)`);
    await h.eval(`(() => { const s = __GS().units.find(u => u.kind === 'strider'); window.__s = s; window.__cam = { follow: s, yaw: 3.4, dist: 7, pitch: 0.15, ty: 1.3 }; __ff(2); return 1; })()`); await shot('strider-close');
    await h.eval(`(window.__cam = { follow: __s, yaw: 0.6, dist: 7, pitch: 0.2, ty: 1.3 }, 1)`); await shot('strider-rear');
    await h.eval(`(window.__cam = { follow: __s, yaw: 2.4, dist: 150, pitch: 0.05, ty: 1.3, fov: 8 }, 1)`); await shot('strider-150m');
    await h.eval(`__ff(90, 1 / 30, () => __I.owner === 2)`);
    // a CH-46 with Marines
    await h.eval(`(() => { __G.G.mat = 200; __G.war.P.mat = 200; __G.war.sendDrone(__I); const c = __G.war.units.find(u => u.kind === 'ch46'); window.__c = c; if (c) c.hp = c.hpMax = 400; return !!c; })()`);
    await h.eval(`(window.__cam = { follow: __c, yaw: 2.2, dist: 30, pitch: 0.15 }, __ff(120, 1 / 30, () => __c.rot.AI.phase === 'transit' && __c.p.y > 30), 1)`); await shot('ch46-flying');
    await h.eval(`__ff(200, 1 / 30, () => __c.rot.AI.phase === 'ground' || __c.dead)`);
    await h.eval(`(window.__cam = { follow: __c, yaw: 1.8, dist: 24, pitch: 0.18, ty: 1 }, __ff(6), 1)`); await shot('ch46-unloading');
    await h.eval(`(() => { __ff(15); const m = __GS().units.find(u => u.kind === 'marine' && u.alive); window.__m = m; window.__cam = { follow: m, yaw: 0.8, dist: 4.5, pitch: 0.15, ty: 0.9 }; return !!m; })()`); await shot('ai-marine-close');
    await h.eval(`(window.__cam = { follow: __m, yaw: 2.6, dist: 4.5, pitch: 0.1, ty: 0.9 }, 1)`); await shot('ai-marine-front');
    await h.eval(`(() => { __ff(20); window.__cam = { p: [__I.pad.x - 50, __I.pad.h + 30, __I.pad.z + 45], t: [__I.pad.x, __I.pad.h + 2, __I.pad.z] }; return 1; })()`); await shot('firefight');
    // armour ashore
    await h.eval(`(() => { const GW = __G.war.ground; window.__hv = GW.launchHover(__I); window.__lc = GW.launchMBT(__I, 't90m') || GW.launchMBT(__I, 'm1a2'); return { hv: !!__hv, lc: !!__lc }; })()`);
    await h.eval(`(window.__cam = { follow: __hv, yaw: 2.2, dist: 18, pitch: 0.2, ty: 1 }, __ff(60, 1 / 30, () => !__hv.transit), 1)`); await shot('hovertank-ashore');
    await h.eval(`(window.__cam = { follow: __hv, yaw: 0.5, dist: 16, pitch: 0.25, ty: 1 }, 1)`); await shot('hovertank-rear');
    await h.eval(`(() => { __ff(120, 1 / 30, () => !!__lc.mbt); __ff(10); window.__cam = { follow: __lc.mbt || __lc, yaw: 2.6, dist: 16, pitch: 0.2, ty: 1.2 }; return !!__lc.mbt; })()`); await shot('mbt-ashore');
    // wrecks
    await h.eval(`(() => { const r = __kill(__hv); __ff(1.5); window.__cam = { follow: __hv, yaw: 2.0, dist: 14, pitch: 0.3, ty: 0.5 }; return r; })()`); await shot('hovertank-wreck');
    await h.eval(`(() => { const s = __GS().units.find(u => u.kind === 'strider' && !u.alive) || __GS().units.find(u => u.kind === 'strider'); if (s && s.alive) __kill(s); window.__cam = { follow: s, yaw: 2.0, dist: 6, pitch: 0.35, ty: 0.3 }; __ff(1); return !!s; })()`); await shot('strider-wreck');
    await h.eval(`(() => { const t = __lc.mbt; if (!t) return null; __kill(t, 900); __ff(1.5); window.__cam = { follow: t, yaw: 2.3, dist: 15, pitch: 0.3, ty: 0.8 }; return !t.alive; })()`); await shot('mbt-wreck');
    await h.eval(`(() => { const m = __GS().units.find(u => u.kind === 'marine' && !u.alive) || __GS().units.find(u => u.kind === 'marine' && u.alive && !u.able); if (!m) return null; window.__cam = { follow: m, yaw: 1.4, dist: 4, pitch: 0.4, ty: 0.2 }; return { able: m.able, alive: m.alive }; })()`); await shot('marine-down');
    await h.eval('(window.__cam = null, 1)');
  }
  // ------------------------------------------------------------------------------------------------ dev pages
  if (has('dev')) {
    // the Marine in every pose (dev/infantry.html?view=model: stand, aim, walk, sprint, kneel, prone, lean, down,
    // seated, climb, swim, self aid at x = i * 2.4 - see infantrymodels.mjs)
    await h.goto('dev/infantry.html?view=model&ui=0');
    await h.waitFor('window.__I', 10000);
    const F = PI - 0.6;
    for (const [n, y, p, d, x, yy, z] of [['line_front', PI - 0.2, 0.12, 13, 8.4, 0.8, 0], ['line_back', 0.3, 0.2, 12, 8.4, 0.8, 0], ['stand', F, 0.1, 2.6, 0.0, 1.0, 0], ['aim', F, 0.1, 2.4, 2.4, 1.3, 0],
      ['kneel', F, 0.15, 2.4, 9.6, 0.8, 0], ['prone', F, 0.35, 3.0, 12.0, 0.3, 0.4], ['down', 0.9, 0.5, 3.0, 16.8, 0.2, -0.4], ['seated', F, 0.15, 2.4, 19.2, 0.6, 0], ['climb', 0.7, 0.1, 2.6, 21.6, 1.3, 0], ['swim', F, 0.35, 3.0, 24.0, 1.0, 0], ['selfaid', F, 0.25, 2.2, 26.4, 0.6, 0]]) {
      await h.eval(`(() => { Object.assign(__I.cam, { yaw: ${y}, pitch: ${p}, dist: ${d} }); __I.cam.t.set(${x}, ${yy}, ${z}); return true; })()`);
      await shot(`dev-marine-${n}`, 300);
    }
    // the RUNAWAY ground models
    for (const [unit, views] of [['all', [['lineup', '3.6,0.18,34,4,1.2,0']]], ['strider', [['front34', '3.74,0.15,4.4,0,1.1,0'], ['rear34', '0.6,0.25,4.4,0,1.1,0'], ['side', '1.5708,0.05,4.4,0,1.1,0']]],
      ['hover', [['front34', '3.7,0.25,14,0,1,0'], ['rear34', '0.7,0.3,14,0,1,0']]], ['m1', [['front34', '3.7,0.2,15,0,1.2,0'], ['rear34', '0.7,0.3,15,0,1.2,0']]], ['t90', [['front34', '3.7,0.2,15,0,1.1,0']]]]) {
      await h.goto(`dev/rwmodels.html?unit=${unit}&ui=0`); await h.waitFor('window.__RW && __RW.units.length', 10000); await h.wait(600);
      for (const [n, c] of views) { await h.eval(`(() => { const [y, p, d, x, yy, z] = '${c}'.split(',').map(Number); Object.assign(__RW.cam, { yaw: y, pitch: p, dist: d }); __RW.cam.t.set(x, yy, z); return 1; })()`); await shot(`dev-rw-${unit}-${n}`, 400); }
    }
    // the AA units and their crews
    await h.goto('dev/defence.html?mode=lineup&ui=0&cam=0.45,0.2,48,0,1.5,0'); await h.waitFor('window.__D', 15000); await shot('dev-aa-lineup', 800);
    for (const [type, c] of [['vads', '0.75,0.3,8,0,1.4,0'], ['shilka', '0.75,0.28,10,0,1.4,0'], ['lance', '0.8,0.18,12,0,2.4,0'], ['talon', '0.8,0.25,17,0,2.0,0']]) {
      await h.goto(`dev/defence.html?mode=view&unit=${type}&ui=0&drones=0`); await h.waitFor('window.__D && __D.unit', 15000);
      await h.eval(`(() => { __D.pause(); const [y, p, d, x, yy, z] = '${c}'.split(',').map(Number); Object.assign(__D.cam, { yaw: y, pitch: p, dist: d }); __D.cam.t.set(x, yy, z); return 1; })()`); await shot(`dev-aa-${type}`, 500);
    }
    // the CH-46 and MV-22 turntables
    for (const ac of ['ch46', 'mv22']) {
      await h.goto(`dev/rotary.html?ac=${ac}&view=model&paused&ui=0`); await h.waitFor('window.__R', 10000); await h.wait(500);
      for (const [n, [y, p, d]] of [['front34', [PI + 0.65, 0.18, 30]], ['rear34', [0.6, 0.22, 30]], ['cockpit', [PI + 0.5, 0.15, 12]]]) { await h.eval(`(Object.assign(__R.cam, { yaw: ${y}, pitch: ${p}, dist: ${d} }), __R.tm.update(0.05, 1), __R.render(), true)`); await shot(`dev-${ac}-${n}`, 300); }
    }
    // the Hercules: outside, the flight deck crew, the hold
    await h.goto('dev/c130-model.html?ui=0'); await h.waitFor('window.__P', 10000);
    for (const [n, c] of [['front34', '2.4,0.25,52,0,1,0'], ['rear34-ramp', '0.6,0.22,40,0,0,6'], ['nose', '3.7,0.12,14,0,0.5,-10']]) {
      await h.eval(`(() => { const P = __P, [y, p, d, x, yy, z] = '${c}'.split(',').map(Number); Object.assign(P.cam, { yaw: y, pitch: p, dist: d }); P.cam.t.set(x, yy, z); Object.assign(P.S, { ramp: ${n.includes('ramp') ? 1 : 0}, door: [${n.includes('ramp') ? '1, 1' : '0, 0'}] }); return 1; })()`); await shot(`dev-c130-${n}`, 500);
    }
    await h.goto('dev/c130.html?view=deck&ui=0'); await h.waitFor('window.__C', 15000); await h.wait(1500);
    for (const [n, y, p] of [['deck-ahead', 0, -0.1], ['deck-copilot', -1.3, -0.1], ['deck-navigator', 2.3, -0.3], ['deck-back', 3.0, -0.2]]) { await h.eval(`(__C.head.yaw = ${y}, __C.head.pitch = ${p}, 1)`); await shot(`dev-c130-${n}`, 700); }
    // the Hornet and the Tomcat close up
    await h.goto('dev/jet-preview.html?ui=0'); await h.waitFor('window.__J', 10000);
    for (const [n, c] of [['front34', '2.4,0.3,22,0,0,0'], ['cockpit', '2.2,0.5,6,0,0.7,-4.3']]) { await h.eval(`(() => { const [y, p, d, x, yy, z] = '${c}'.split(',').map(Number); Object.assign(__J.cam, { yaw: y, pitch: p, dist: d }); __J.cam.t.set(x, yy, z); return 1; })()`); await shot(`dev-hornet-${n}`, 400); }
    await h.goto('dev/air.html?model=tomcat&ui=0'); await h.waitFor('window.__A', 10000);
    for (const [n, c] of [['front34', '2.4,0.3,26,0,0,0'], ['cockpit', '2.3,0.45,8,0,0.8,-5']]) { await h.eval(`(() => { const [y, p, d, x, yy, z] = '${c}'.split(',').map(Number); Object.assign(__A.cam, { yaw: y, pitch: p, dist: d }); __A.cam.t.set(x, yy, z); return 1; })()`); await shot(`dev-tomcat-${n}`, 400); }
    // the wheeled vehicles side by side is the game's motor pool; here each one close (front 3/4, rear 3/4)
    await h.goto('dev/vehicle.html?debug&ui=0&hud=0&v=m151&zone=start&cam=orbit&paused'); await h.waitFor('window.__V && __V.sim', 15000);
    for (const id of ['m151', 'm35', 'landrover', 'hilux', 'beetle', 'lada']) {
      await h.eval(`__V.setVehicle('${id}', {}, 'start').then(() => 1)`); await h.wait(500);
      await h.eval('(__V.pause(false), 1)'); await h.wait(1000); await h.eval('(__V.pause(true), 1)');
      for (const [n, y, p, d] of [['front34', 2.45, 0.22, 1.2], ['rear34', 0.75, 0.22, 1.2]]) { await h.eval(`(__V.cam('orbit', { yaw: ${y}, pitch: ${p}, dist: __V.sim.spec.dims.L * ${d} + 1.5 }), 1)`); await shot(`dev-${id}-${n}`, 400); }
    }
    // the M60A3 and M113A2
    for (const veh of ['m60', 'm113']) {
      await h.goto(`dev/tank.html?debug&ui=0&res=1&view=free${veh === 'm113' ? '&veh=m113' : ''}`); await h.waitFor('window.__T', 15000);
      await h.eval('(__T.pause(true), __T.step(90), 1)');
      for (const [n, y, p, d] of [['front34', 2.5, 0.22, 13], ['rear34', -0.6, 0.3, 13], ['side', 1.5708, 0.05, 12]]) { await h.eval(`(() => { Object.assign(__T.cam, { yaw: ${y}, pitch: ${p}, dist: ${d} }); __T.view = 'free'; __T.render(); return 1; })()`); await shot(`dev-${veh}-${n}`, 300); }
    }
  }
}
