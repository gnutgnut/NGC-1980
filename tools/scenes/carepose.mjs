// INFANTRY DEPTH, third person (ngc/infdepth-fix): the AI Marines' hands off the rifle, posed by carepose.js and blended
// in poseSkeleton - on SANDBAR with a Marine squad:
//   1. a man down who can't walk (both legs out), 26 m out beyond the pad from the casualty collection point (CCP):
//      a buddy fetches him, DRAGS him by the vest's strap (crouched, backing up), then with
//      nobody shooting and a long way to the casualty collection point lifts him into a FIREMAN'S CARRY (fieldcare.js);
//   2. a rifleman's M67 drill frozen phase by phase (pin, cooking with the arm back, over the top, the follow-through),
//      then a real throw: it flies, lies there and bursts when the fuse runs out (groundsim.js, game level).
//   CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/carepose.mjs
const HOOK = `(() => { const G = __G, T = G.THREE, r = G.renderer, cam = new T.PerspectiveCamera(45, 1, 0.1, 2500), orig = r.render.bind(r);
  const t = new T.Vector3(), p = new T.Vector3();
  r.render = (s, c) => {
    const m = window.__cam; if (c !== G.zCam || !m || (!m.follow && !m.at)) return orig(s, c);
    if (m.follow) { const u = m.follow, yaw = (m.rel ? (u.yaw ?? 0) : 0) + m.yaw; t.set(u.x ?? u.p.x, (u.y ?? u.p.y) + (m.ty ?? 1.0), u.z ?? u.p.z); p.set(t.x + Math.sin(yaw) * m.d, t.y + m.h, t.z + Math.cos(yaw) * m.d); }
    else { p.set(...m.at); t.set(...m.look); }
    { const gy = Math.max(G.terrainH(p.x, p.z), 0); if (p.y < gy + 0.6) p.y = gy + 0.6; }
    cam.position.copy(p); cam.up.set(0, 1, 0); cam.lookAt(t); cam.aspect = c.aspect; cam.updateProjectionMatrix();
    G.zCam.position.copy(p);   // (the war's ear and the figures' level of detail follow this camera)
    return orig(s, cam);
  };
  window.__ff = (secs, dt = 1 / 30, until) => { const W = G.war; for (let i = 0; i < secs / dt; i++) { W.update(dt, G.PL, !!window.__peace); G.fx.update(dt); if (until && until()) return true; } return false; };
  // hold a man's grenade drill at t seconds (the war runs on; his drill is put back every frame)
  const upd = G.war.update.bind(G.war);
  G.war.update = (...a) => { const f = window.__freeze; if (f) { f.u.thrT = f.t; f.u.thr = f.u.thr || { phase: 'draw', p: 0, gone: false }; f.u.thr.gone = f.gone; f.u.thrAim = f.aim; f.u.frags = f.u.body.frags = 2; if (f.at) G.war.ground.sim.place(f.u, ...f.at); } return upd(...a); };
  window.__hand = (u, sd = 'R') => { const V = G.war.ground.views.get(u.id), v = new T.Vector3(); if (!V || !V.skeleton) return null; const pv = new T.Vector3(); V.skeleton.bones.pelvis.getWorldPosition(pv); V.skeleton.bones['hand' + sd].getWorldPosition(v); return { x: v.x, y: v.y - u.body.y, up: v.y - pv.y, z: v.z, fwd: (v.x - u.body.x) * -Math.sin(u.body.yaw) + (v.z - u.body.z) * -Math.cos(u.body.yaw) }; };
  window.__rifle = u => { const V = G.war.ground.views.get(u.id), v = new T.Vector3(); if (!V || !V.skeleton || !V.skeleton.weaponModel) return null; V.skeleton.weaponModel.group.getWorldPosition(v); return { y: v.y - u.body.y, fwd: (v.x - u.body.x) * -Math.sin(u.body.yaw) + (v.z - u.body.z) * -Math.cos(u.body.yaw) }; };
  return true; })()`;
export default async function (h) {
  await h.goto('?debug&kb&res=0.45');
  await h.waitFor('window.__G', 10000); await h.wait(500);
  await h.key('tap', 'Enter'); await h.waitFor(`__G.G.state === 'play'`, 10000); await h.wait(1200);
  await h.eval(HOOK);
  await h.eval(`(() => { const I = __G.ISLANDS.find(i => i.name === 'SANDBAR'); window.__I = I; const W = __G.war;
    W.E.mat = 0; W.transT = 1e9; __G.G.bench = true; window.__peace = true; W.ground.godPlayer = true;
    const x = I.pad.x - 22, z = I.pad.z + 14; __G.H.reset(new __G.THREE.Vector3(x, __G.terrainH(x, z) + 1.9, z), 0.6, true, 1); __G.HI.setCollective(0);
    window.__P = W.ground.addSquad(1, I, 13, I.pad.x + 8, I.pad.z + 6, { order: { type: 'defend', x: I.pad.x, z: I.pad.z, r: 20 } });
    window.__GS = W.ground.sim; window.__cam = { at: [I.pad.x + 30, I.pad.h + 20, I.pad.z + 30], look: [I.pad.x, I.pad.h, I.pad.z] }; return { n: __P.members.length }; })()`);
  await h.eval(`__ff(20)`);
  // the player out of the Huey (a landed Huey is a CASEVAC: the wounded would be brought to it) and off to one side
  await h.key('tap', 'KeyY'); await h.wait(700);
  await h.eval(`(() => { const I = __I, x = I.pad.x - 30, z = I.pad.z - 30; __G.foot.spawnAt({ x, y: __G.terrainH(x, z), z, yaw: 0 }, { force: true }); __G.marine.view = 'third'; return { craft: __G.G.craft }; })()`);   // (third person: no viewmodel over the pictures)
  // ---- 1. a man who can't walk, 26 m out from the pad: his buddies come for him (drag, then a fireman's carry)
  await h.eval(`(() => { const u = __P.members[3], I = __I; window.__cas = u; __GS.enrich(u);
    const C = __GS.FC.ccp(u.B, u.squad), ca = window.__ccpA = Math.atan2(C.z - I.pad.z, C.x - I.pad.x);
    let best = null; for (let k = 0; k < 24; k++) { const a = ca + Math.PI + (k - 12) / 24 * 2.4, x = I.pad.x + Math.cos(a) * 26, z = I.pad.z + Math.sin(a) * 26, hh = __G.terrainH(x, z), hf = __G.terrainH(I.pad.x + Math.cos(a) * 18, I.pad.z + Math.sin(a) * 18); if (hh < 1.5 || hf < 1.5) continue; const s = -Math.abs(hh - I.pad.h); if (!best || s > best.s) best = { x, z, s }; }
    __GS.place(u, best.x, best.z, 0); u.rich.M.regions.legL.hp = u.rich.M.regions.legR.hp = 0; u.rich.noSelfAid = true; __GS.richState(u);   /* (both legs out: he can only crawl) */
    return { at: [best.x, best.z].map(Math.round), ccp: [C.x, C.z].map(Math.round), toCCP: Math.round(Math.hypot(best.x - C.x, best.z - C.z)), able: u.able, alive: u.alive }; })()`);
  await h.eval(`__ff(1)`);
  await h.eval(`(() => { const c = __cas.cas, S = __cas.squad; if (c) { c.treated = true; c.medic = null; } for (const j of S.cares || []) j.medic.ai.paceV = undefined; S.cares = []; return { cas: !!c }; })()`);   // (already seen to: a litter case for the CCP)
  await h.expect(`!__cas.able && __cas.alive && !!__cas.cas`, 'a Marine down 26 m out, both legs out (he cannot walk)');
  await h.eval(`__ff(90, 1 / 30, () => __GS.units.some(u => u.ai && /dragging/.test(u.ai.state)))`);
  await h.eval(`(() => { window.__drg = __GS.units.find(u => u.ai && /dragging/.test(u.ai.state)); __GS.enrich(__drg); __ff(0.4); window.__cam = { follow: __drg, rel: true, yaw: 1.35, d: 3.6, h: 0.9, ty: 0.7 }; return { who: __drg && __drg.name, state: __drg && __drg.ai.state, d: __drg && +Math.hypot(__drg.x - __cas.x, __drg.z - __cas.z).toFixed(2) }; })()`);
  await h.expect(`!!window.__drg`, 'a buddy takes him by the drag strap');
  await h.wait(1500);   // (the hands blend off the rifle)
  await h.eval(`({ handR: __hand(__drg), handL: __hand(__drg, 'L'), rifle: __rifle(__drg), state: __drg.ai.state })`);
  await h.expect(`/dragging/.test(__drg.ai.state) && __hand(__drg).y < 0.8 && __hand(__drg, 'L').y < 0.8 && __hand(__drg).fwd > 0.25 && __rifle(__drg).fwd < 0.2`, 'dragging: crouched, both hands low in front on the strap, the rifle slung on his back');
  await h.shot('ai-drag');
  await h.eval(`__ff(8, 1 / 30, () => /carrying/.test(__drg.ai.state))`);
  await h.eval(`(window.__cam = { follow: __drg, rel: true, yaw: 1.9, d: 4.2, h: 0.5, ty: 1.1 }, __ff(1), { state: __drg.ai.state, carried: __cas.cas && __cas.cas.carry, v: +Math.hypot(__drg.body.vx, __drg.body.vz).toFixed(2) })`);
  await h.wait(1500);
  await h.eval(`({ handR: __hand(__drg), handL: __hand(__drg, 'L'), casY: __G.war.ground.views.get(__cas.id).group.position.y - __drg.body.y })`);
  await h.expect(`/carrying/.test(__drg.ai.state) && __cas.cas.carry === __drg.id && __hand(__drg, 'L').y > 1.3 && __G.war.ground.views.get(__cas.id).group.position.y - __drg.body.y > 1.0`, "nobody shooting, a long way to go: a fireman's carry (the casualty across his shoulders, a hand on him)");
  await h.shot('ai-fireman-carry');
  await h.eval(`(window.__cam = { follow: __drg, rel: true, yaw: -2.4, d: 4.5, h: 0.6, ty: 1.1 }, 1)`); await h.wait(1200); await h.shot('ai-fireman-carry-behind');
  await h.eval(`__ff(60, 1 / 30, () => !__cas.cas || __cas.cas.carry == null)`);
  await h.eval(`({ state: __drg.ai.state, atCCP: __cas.cas && __cas.cas.atCCP, carry: __cas.cas && __cas.cas.carry, care: __GS.FC.stats })`);
  await h.expect(`__cas.cas && __cas.cas.atCCP && __cas.cas.carry == null`, 'carried to the casualty collection point and put down');
  // ---- 2. a rifleman's M67 drill, seen from outside (frozen per phase)
  await h.eval(`(() => { const u = __P.members.find(m => m.role === 'tl' && m.alive && m.able && m !== __drg); window.__g = u; __GS.enrich(u);
    const I = __I; let a = 0; for (let k = 0; k < 16; k++) { const b = k / 16 * Math.PI * 2; if (__G.terrainH(I.pad.x + Math.cos(b) * 24, I.pad.z + Math.sin(b) * 24) > 1.5 && Math.abs(Math.atan2(Math.sin(b - __ccpA), Math.cos(b - __ccpA))) > 1.2) { a = b; break; } }
    const x = I.pad.x + Math.cos(a) * 2, z = I.pad.z + Math.sin(a) * 2, aim = [I.pad.x + Math.cos(a) * 24, __G.terrainH(I.pad.x + Math.cos(a) * 24, I.pad.z + Math.sin(a) * 24) + 0.5, I.pad.z + Math.sin(a) * 24];
    window.__gaim = aim; window.__gat = [x, z, Math.atan2(-(aim[0] - x), -(aim[2] - z))]; __GS.place(u, ...__gat); return { who: u.name, at: [x, z].map(Math.round), aim: aim.map(Math.round) }; })()`);   // (on the open pad, throwing outward, away from the CCP)
  const drill = async (t, gone, name, cam) => {
    await h.eval(`(window.__freeze = { u: __g, t: ${t}, gone: ${gone}, aim: __gaim, at: __gat }, window.__cam = ${cam}, 1)`);
    await h.wait(1600);
    await h.eval(`({ thr: __g.thr, handR: __hand(__g), handL: __hand(__g, 'L'), rifle: __rifle(__g) })`);
    await h.shot(name);
  };
  const side = `{ follow: __g, rel: true, yaw: -1.45, d: 3.4, h: 0.4, ty: 1.2 }`, front = `{ follow: __g, rel: true, yaw: -0.6, d: 3.6, h: 0.5, ty: 1.2 }`;
  await drill(0.8, false, 'ai-m67-1-pin', front);
  await h.expect(`__g.thr && __g.thr.phase === 'pin' && __hand(__g, 'L').up > 0.15 && __hand(__g).up > 0.15 && __rifle(__g).fwd < 0`, 'the pin: both hands up at his chest, the rifle slung');
  await drill(1.9, false, 'ai-m67-2-cooking-arm-back', side);
  await h.expect(`__g.thr && __g.thr.phase === 'cook' && __hand(__g).up > 0.5 && __hand(__g).fwd < 0.1 && __hand(__g, 'L').fwd > 0.3`, 'cooking: the throwing arm back and up, the off hand pointing at the target');
  await drill(2.47, false, 'ai-m67-3-over-the-top', side);
  await h.expect(`__g.thr && __g.thr.phase === 'throw' && __hand(__g).up > 0.75`, 'the throw: the hand comes over the top');
  await drill(2.72, true, 'ai-m67-4-follow-through', front);
  await h.expect(`__g.thr && __g.thr.phase === 'throw' && __hand(__g).up < 0.5 && __hand(__g).fwd > 0.2`, 'the follow-through: the arm down and across');
  // let him throw it for real
  await h.eval(`(() => { window.__freeze = null; __g.thrT = 0; __g.thr = { phase: 'draw', p: 0, gone: false }; __g.thrAim = __gaim; __g.frags = __g.body.frags = 2; window.__f0 = __GS.stats.frags || 0; window.__blasts = 0;
    const st = __GS.step.bind(__GS); __GS.step = (...a) => { const e = st(...a); for (const x of e) if (x.e === 'blast' && x.ammo === 'm67') { window.__blasts++; window.__bl = { x: x.x, z: x.z }; } return e; }; return 1; })()`);
  await h.eval(`__ff(2.7, 1 / 30, () => (__GS.stats.frags || 0) > __f0)`);
  await h.eval(`(() => { const p = __GS.proj.find(p => p.frag); window.__cam = p ? { at: [p.x + 6, p.y + 3, p.z + 6], look: [p.x, p.y, p.z] } : window.__cam; return { thrown: (__GS.stats.frags || 0) - __f0, proj: p && { y: +p.y.toFixed(1), fuse: +p.fuse.toFixed(2) } }; })()`);
  await h.expect(`(__GS.stats.frags || 0) > __f0 && __GS.proj.some(p => p.frag && p.fuse > 2 && p.fuse < 3.6)`, 'he lets it go cooked ~1 s: the fuse in flight is 4.5 s less the cook');
  await h.eval(`__ff(6, 1 / 30, () => __blasts > 0)`);
  await h.wait(300); await h.shot('ai-m67-5-burst');
  await h.eval(`({ blasts: __blasts, at: __bl, d: __bl && +Math.hypot(__bl.x - __gaim[0], __bl.z - __gaim[2]).toFixed(1), from: __bl && +Math.hypot(__bl.x - __g.x, __bl.z - __g.z).toFixed(1) })`);
  await h.expect(`__blasts > 0 && Math.hypot(__bl.x - __gaim[0], __bl.z - __gaim[2]) < 6 && Math.hypot(__bl.x - __g.x, __bl.z - __g.z) > 14`, 'it lands near his aim point, well away from him, and bursts when the fuse runs out');
}
