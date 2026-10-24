// INFANTRY DEPTH (ngc/infdepth) in the real game, on SANDBAR with a Marine squad (13 men, the 13th their Navy corpsman):
//   1. the M67 drill in first person: draw, pull the pin, cook (the spoon flies), the overhand arc, the burst;
//   2. a Marine goes down with a femoral bleed in the open; the player drags him (Shift+F) back to the Huey's lee,
//      opens his HEALTH screen (F) and twists his own cravat on as a tourniquet (MEDINV buddy aid with the player's kit);
//   3. the squad's corpsman comes across and works on him (fieldcare.js: the buddy-aid API, by: corpsman);
//   4. the player bleeding: the corpsman comes to him too; a dead Marine's kit is searched; lean and a weapon rest;
//   5. CASEVAC: the player in the Huey on the island, the wounded come aboard; flown to the ALBATROSS: the sickbay pool.
// The war is fast-forwarded between screenshots (headless is slow); the near Marines run the rifleman + medical sims.
//   CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/buddyaid.mjs
const HOOK = `(() => { const G = __G, T = G.THREE, r = G.renderer, cam = new T.PerspectiveCamera(50, 1, 0.1, 2500), orig = r.render.bind(r);
  const t = new T.Vector3(), p = new T.Vector3();
  r.render = (s, c) => {
    const m = window.__cam; if (c !== G.zCam || !m || (!m.follow && !m.at)) return orig(s, c);
    if (m.follow) { const u = m.follow; t.set(u.x ?? u.p.x, (u.y ?? u.p.y) + (m.ty ?? 1.0), u.z ?? u.p.z); p.set(t.x + Math.sin(m.yaw) * m.d, t.y + m.h, t.z + Math.cos(m.yaw) * m.d); }
    else { p.set(...m.at); t.set(...m.look); }
    { const gy = Math.max(G.terrainH(p.x, p.z), 0); if (p.y < gy + 0.6) p.y = gy + 0.6; }
    cam.position.copy(p); cam.up.set(0, 1, 0); cam.lookAt(t); cam.aspect = c.aspect; cam.updateProjectionMatrix();
    return orig(s, cam);
  };
  window.__ff = (secs, dt = 1 / 30, until) => { const W = G.war; for (let i = 0; i < secs / dt; i++) { W.update(dt, G.PL, !!window.__peace); G.fx.update(dt); if (until && until()) return true; } return false; };
  window.__fem = (M, region) => { M.bleeds.push({ id: 900 + M.bleeds.length, region, zone: 'thigh', type: 'arterial', rate: 500, ctl: 'tq', name: 'FEMORAL A.', clot: 0, ctrl: 1, t: 0, dressed: false, packed: false, stopped: false }); };
  return true; })()`;
const center = async (h, sel) => h.page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; }, sel);
async function drag(h, from, to) {
  const m = h.page.mouse; await m.move(from[0], from[1]); await m.down();
  for (let i = 1; i <= 10; i++) { await m.move(from[0] + (to[0] - from[0]) * i / 10, from[1] + (to[1] - from[1]) * i / 10); await h.wait(16); }
  await h.wait(80); await m.up(); await h.wait(150);
}
export default async function (h) {
  await h.goto('?debug&kb&res=0.45');
  await h.waitFor('window.__G', 10000); await h.wait(500);
  await h.key('tap', 'Enter'); await h.waitFor(`__G.G.state === 'play'`, 10000); await h.wait(1200);
  await h.eval(HOOK);
  // SANDBAR: the Huey parked by the pad, a reinforced Marine squad with its corpsman dug in round the pad
  await h.eval(`(() => { const I = __G.ISLANDS.find(i => i.name === 'SANDBAR'); window.__I = I; const W = __G.war;
    W.E.mat = 0; W.transT = 1e9; __G.G.bench = true; window.__peace = true; W.ground.godPlayer = true;
    const x = I.pad.x - 22, z = I.pad.z + 14; __G.H.reset(new __G.THREE.Vector3(x, __G.terrainH(x, z) + 1.9, z), 0.6, true, 1); __G.HI.setCollective(0);
    window.__P = W.ground.addSquad(1, I, 13, I.pad.x + 8, I.pad.z + 6, { order: { type: 'defend', x: I.pad.x, z: I.pad.z, r: 20 } });
    window.__GS = W.ground.sim; window.__doc = __P.members.find(u => u.role === 'doc'); __GS.FC.pause = true;
    return { pad: [I.pad.x, I.pad.z], roles: __P.members.map(u => u.role).join(','), names: __P.members.map(u => u.name).slice(0, 4) }; })()`);
  await h.eval(`__ff(25)`);   // (the island map bakes, the squad takes up its perimeter)
  await h.expect(`__doc && __doc.name.startsWith('HM3') && __P.members.length === 13`, 'a Marine squad of 13 on SANDBAR, the 13th man its Navy corpsman (HM3)');
  await h.eval(`({ rich: __GS.units.filter(u => u.richOn).length, cost: __GS.richCost.steps ? +(__GS.richCost.ms / __GS.richCost.steps).toFixed(3) : null })`);
  // out of the Huey, standing 30 m off the pad (away from the squad)
  await h.key('tap', 'KeyY'); await h.wait(700);
  // (an open spot 14-26 m off the pad, no trees or buildings within 5 m, on the side away from the squad; he faces out)
  await h.eval(`(() => { const I = __I, sq = Math.atan2(6, 8); let best = null, bs = -1e9;
    for (const r of [14, 18, 22, 26]) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, x = I.pad.x + Math.cos(a) * r, z = I.pad.z + Math.sin(a) * r, h = __G.terrainH(x, z);
      if (h < 1.5 || !__G.GR.clearAt(x, z, 5)) continue; const ox = x + Math.cos(a) * 25, oz = z + Math.sin(a) * 25; if (__G.terrainH(ox, oz) < 0.5) continue;
      const s = Math.abs(Math.atan2(Math.sin(a - sq), Math.cos(a - sq))) * 3 - Math.abs(__G.terrainH(ox, oz) - h) * 0.3 - r * 0.05; if (s > bs) { bs = s; best = { x, z, a }; } }
    window.__spot = best; const yaw = Math.atan2(-Math.cos(best.a), -Math.sin(best.a));
    __G.foot.spawnAt({ x: best.x, y: __G.terrainH(best.x, best.z), z: best.z, yaw }); __G.marine.view = 'first'; __G.marine.aim(yaw, 0.05); return { at: [best.x, best.z].map(v => +v.toFixed(1)), yaw: +yaw.toFixed(2) }; })()`);
  await h.wait(600);
  await h.expect(`__G.G.craft === 'foot' && __G.foot.exists`, 'on foot on SANDBAR');
  // ---- 1. the grenade drill, phase by phase (frozen for the camera), then a cooked throw
  await h.eval(`(__G.marine.freezeThrow = true, __G.marine.input({ throwHeld: true }), __G.marine.throwGrenade('frag'), 1)`);
  const phase = async (ph, t, name) => { await h.eval(`(() => { const T = __G.marine.throwState(); T.phase = '${ph}'; T.t = ${t}; T.p = ${t} / ({ draw: 0.55, pin: 0.45, throw: 0.34 }['${ph}'] || 1); if ('${ph}' === 'cook') { T.cooked = true; T.cook = 1.2; } return 1; })()`); await h.wait(900); await h.shot(name); };
  await phase('draw', 0.4, 'm67-1-draw-from-the-pouch');
  await phase('pin', 0.4, 'm67-2-pin-pulled');
  await h.eval(`(__G.marine.TV.spoon(), 1)`);
  await phase('cook', 0.3, 'm67-3-cooking-spoon-gone');
  await phase('throw', 0.12, 'm67-4-the-arc');
  // the same drill seen from outside (carepose.js: rifle slung, the off hand pointing, the throwing arm cocked / over)
  await h.eval(`(() => { const W = __G.foot.W, S = __G.marine.S, rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw), fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw); __G.marine.view = 'third';
    window.__cam = { at: [W.x + rx * 3.2 - fx * 1.2, W.y + 1.7, W.z + rz * 3.2 - fz * 1.2], look: [W.x, W.y + 1.3, W.z] }; return 1; })()`);
  await phase('cook', 0.6, 'm67-3p-1-cooking-arm-back');
  await phase('throw', 0.15, 'm67-3p-2-over-the-top');
  await h.eval(`(window.__cam = null, __G.marine.view = 'first', 1)`);
  await h.expect(`/COOKING/.test(document.getElementById('hint').textContent) || __G.marine.throwState().phase === 'throw'`, 'the HUD counts the cook');
  // let it run: cooked 1.2 s, let go of G -> the throw
  await h.eval(`(() => { const T = __G.marine.throwState(); T.phase = 'cook'; T.t = 0; T.cook = 1.2; __G.marine.freezeThrow = false; __G.marine.input({ throwHeld: false }); window.__b0 = __G.marine.stats.booms || 0; return 1; })()`);
  await h.waitFor(`__G.marine.lastThrow && __G.marine.lastThrow.cooked > 1`, 15000);
  await h.wait(200); await h.shot('m67-5-in-the-air');
  await h.expect(`__G.marine.lastThrow.fuse < 3.4`, 'a cooked M67: the fuse in the air is 4.5 s less the cook');
  await h.waitFor(`(__G.marine.stats.booms || 0) > __b0`, 15000); await h.shot('m67-6-burst');
  await h.eval(`({ boom: __G.marine.lastBoom, from: [__G.foot.W.x, __G.foot.W.z].map(v => +v.toFixed(1)), d: +Math.hypot(__G.marine.lastBoom.x - __G.foot.W.x, __G.marine.lastBoom.z - __G.foot.W.z).toFixed(1) })`);
  await h.expect(`Math.hypot(__G.marine.lastBoom.x - __G.foot.W.x, __G.marine.lastBoom.z - __G.foot.W.z) > 12`, 'it burst well away from him');
  // a dead Marine's kit (killed outright: a head wound on MEDINV's sim)
  await h.eval(`(() => { const u = __P.members[7]; __GS.enrich(u); u.rich.M.hit({ part: 'head', dmg: 200, pen: 99, kind: 'bullet' }, []); __GS.richState(u); window.__kia = u; const W = __G.foot.W, S = __G.marine.S; __GS.place(u, W.x - Math.sin(S.yaw) * 1.3, W.z - Math.cos(S.yaw) * 1.3); __G.marine.aim(S.yaw, -0.5); return { alive: u.alive, name: u.name }; })()`);
  await h.eval(`__ff(0.2)`); await h.wait(700);
  await h.expect(`!__kia.alive && /SEARCH .*KIA/.test(document.getElementById('hint').textContent)`, "a dead Marine at his feet: F searches his kit");
  await h.shot('a-dead-marine');
  await h.key('tap', 'KeyF'); await h.wait(900); await h.shot('searching-a-dead-marine');
  await h.expect(`__G.marine.ui === 'gear' && document.querySelector('.ngc-inv.on') && /KIA/.test(document.querySelector('.ngc-inv.on').textContent)`, 'his kit on the gear screen, next to yours');
  await h.key('tap', 'Escape'); await h.wait(300);
  await h.eval(`(() => { const S = __G.marine.S; __GS.place(__kia, __G.foot.W.x + Math.cos(S.yaw) * 6, __G.foot.W.z - Math.sin(S.yaw) * 6); return 1; })()`);
  // ---- 2. a Marine down in the open with a femoral bleed; drag him back, a tourniquet from your kit
  await h.eval(`(() => { const u = __P.members[4]; window.__cas = u; __GS.enrich(u); const W = __G.foot.W, S = __G.marine.S, fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw);
    __GS.place(u, W.x + fx * 1.6, W.z + fz * 1.6, S.yaw); __fem(u.rich.M, 'legL'); u.rich.M.ko = 900; u.rich.noSelfAid = true; __GS.richState(u);
    __G.marine.aim(S.yaw, -0.35); return { name: u.name, able: u.able, bleed: Math.round(u.rich.M.bleedRate()) }; })()`);
  await h.eval(`__ff(0.5)`); await h.wait(500);
  await h.expect(`!__cas.able && __cas.alive && /IS DOWN/.test(document.getElementById('hint').textContent)`, 'a Marine down next to him: the HUD offers F: TREAT / SHIFT+F: DRAG');
  await h.shot('casualty-down-in-the-open');
  await h.key('down', 'ShiftLeft'); await h.key('tap', 'KeyF'); await h.key('up', 'ShiftLeft'); await h.wait(400);
  await h.expect(`__G.marine.care.hold && __G.marine.care.hold.mode === 'drag'`, 'Shift+F: he takes the casualty by the drag strap');
  await h.eval(`(window.__d0 = [__cas.x, __cas.z], window.__v = [], window.__vi = setInterval(() => __v.push(+__G.marine.S.speed.toFixed(2)), 150), 1)`);
  await h.key('down', 'KeyS'); await h.waitFor(`Math.hypot(__cas.x - __d0[0], __cas.z - __d0[1]) > 3`, 60000); await h.shot('dragging-him-back'); await h.key('up', 'KeyS');
  await h.eval(`(clearInterval(__vi), { moved: +Math.hypot(__cas.x - __d0[0], __cas.z - __d0[1]).toFixed(1), vmax: Math.max(...__v), burden: __G.marine.MS.burden, stamina: +__G.marine.S.staminaFrac.toFixed(2) })`);
  await h.expect(`Math.max(...__v) <= __G.marine.MS.burden.v + 0.05 && __G.marine.MS.burden.v < 1.3`, 'dragging: no faster than MEDINV BUDDY.dragSpeed');
  await h.eval(`(() => { const W = __G.foot.W, S = __G.marine.S, fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw), rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw); __G.marine.view = 'third';
    window.__cam = { at: [W.x + rx * 4.5 + fx * 0.8, W.y + 2.2, W.z + rz * 4.5 + fz * 0.8], look: [W.x + fx * 0.8, W.y + 0.5, W.z + fz * 0.8] }; return 1; })()`);
  await h.wait(900); await h.shot('dragging-third-person');
  // F: up into a fireman's carry (MEDINV BUDDY.carrySpeed), a few steps, then down again
  await h.key('tap', 'KeyF'); await h.wait(400);
  await h.expect(`__G.marine.care.hold && __G.marine.care.hold.mode === 'carry' && __G.marine.MS.burden.v > 0.3`, "F: a fireman's carry (both arms, good legs: MEDINV carrySpeed)");
  await h.eval(`(() => { const W = __G.foot.W, S = __G.marine.S, rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw), fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw); window.__cam = { at: [W.x - fx * 3.6 + rx * 0.6, W.y + 1.9, W.z - fz * 3.6 + rz * 0.6], look: [W.x, W.y + 1.35, W.z] }; return { v: __G.marine.MS.burden.v, kg: +__G.marine.care.hold.kg.toFixed(0) }; })()`);
  await h.key('down', 'KeyW'); await h.wait(1500); await h.key('up', 'KeyW'); await h.wait(600); await h.shot('fireman-carry');
  await h.eval(`(window.__cam = null, __G.marine.view = 'first', 1)`);
  await h.key('down', 'ShiftLeft'); await h.key('tap', 'KeyF'); await h.key('up', 'ShiftLeft'); await h.wait(300);
  await h.expect(`!__G.marine.care.hold`, 'Shift+F: he puts him down');
  // F: his health screen; the player's own cravat onto the bleeding thigh
  await h.key('tap', 'KeyF'); await h.wait(800);
  await h.expect(`__G.marine.ui === 'patient' && !!document.querySelector('.ngc-med.on')`, "F: the casualty's HEALTH screen with your kit (buddy aid)");
  await h.shot('his-health-screen');
  const cr = await center(h, '.ngc-med.on .mi[data-id="cravat"]'), part = await center(h, '.ngc-med.on path[data-region="legL"]');
  await h.eval(`({ cravat: ${JSON.stringify(cr)}, leg: ${JSON.stringify(part)} })`);
  if (cr && part) await drag(h, cr, part);
  await h.expect(`__cas.rich.M.action && /TOURNIQUET/.test(__cas.rich.M.action.label) && __cas.rich.M.action.by && !__cas.rich.M.action.by.self`, 'the cravat dragged onto his thigh: an improvised tourniquet, as buddy aid');
  await h.shot('tourniquet-going-on');
  await h.eval(`(() => { const M = __cas.rich.M; let t = 0; while (M.action && t < 120) { M.update(0.25, {}); t += 0.25; } return { t, tq: M.regions.legL.tq.length, ok: M.regions.legL.tq[0] && M.regions.legL.tq[0].ok, bleed: Math.round(M.bleedRate()) }; })()`);
  await h.wait(1500); await h.shot('his-health-after');
  await h.expect(`__cas.rich.M.regions.legL.tq.length >= 1`, 'a tourniquet on his left thigh');
  await h.key('tap', 'Escape'); await h.wait(400);
  // ---- 3. the corpsman comes over
  await h.eval(`(() => { const W = __G.foot.W, S = __G.marine.S; __G.foot.spawnAt({ x: W.x + Math.sin(S.yaw) * 3.5, y: W.y, z: W.z + Math.cos(S.yaw) * 3.5, yaw: S.yaw }, { force: true }); return 1; })()`);   // (step back: out of the picture)
  await h.eval(`(() => { __GS.FC.pause = false; __G.marine.view = 'third'; window.__cam = { follow: __cas, yaw: 0.9, d: 6, h: 2.6, ty: 0.3 }; return { doc: [__doc.x, __doc.z].map(v => +v.toFixed(1)), cas: [__cas.x, __cas.z].map(v => +v.toFixed(1)) }; })()`);
  await h.eval(`__ff(90, 1 / 30, () => Math.hypot(__doc.x - __cas.x, __doc.z - __cas.z) < 1.6 && __GS.FC.stats.treatments > 0)`);
  await h.eval(`__ff(1)`); await h.wait(600); await h.shot('the-corpsman-works-on-him');
  await h.eval(`({ doc: __doc.ai.state, d: +Math.hypot(__doc.x - __cas.x, __doc.z - __cas.z).toFixed(2), care: __GS.FC.stats, action: __cas.rich.M.action && __cas.rich.M.action.label, by: __cas.rich.M.action && __cas.rich.M.action.by })`);
  await h.expect(`Math.hypot(__doc.x - __cas.x, __doc.z - __cas.z) < 2 && __GS.FC.stats.treatments > 0`, 'the corpsman is with him, treating him (by: corpsman)');
  await h.eval(`(window.__cam = null, __G.marine.view = 'first', 1)`);
  // ---- 4. the player bleeding: the corpsman (or a buddy, the corpsman being busy) comes to him
  await h.eval(`(() => { const M = __G.marine.M; __fem(M, 'armR'); M.regions.armR.hp = 30; window.__pt0 = __GS.FC.stats.playerTreated; __GS.FC.stats.playerTreated = 0; __G.marine.input({ move: [0, 0] }); return { bleed: Math.round(M.bleedRate()) }; })()`);
  await h.eval(`__ff(60, 1 / 30, () => __GS.FC.stats.playerTreated > 0)`);
  await h.wait(800); await h.eval(`(__G.marine.view = 'third', __G.marine.aim(__G.marine.S.yaw + 2.4, -0.25), 1)`); await h.wait(800); await h.shot('the-corpsman-treats-the-player');
  await h.eval(`({ treated: __GS.FC.stats.playerTreated, action: __G.marine.M.action && __G.marine.M.action.label, hint: document.getElementById('hint').textContent })`);
  await h.expect(`__GS.FC.stats.playerTreated > 0 && __G.marine.M.action && !__G.marine.M.action.by.self`, 'bleeding near the squad: a Marine comes to him and works on his arm (buddy aid on the player)');
  await h.eval(`(() => { const M = __G.marine.M; let t = 0; while (M.action && t < 120) { M.update(0.25, {}); t += 0.25; } __G.marine.view = 'first'; return { bleed: Math.round(M.bleedRate()), tq: M.regions.armR.tq.length }; })()`);
  // lean and a weapon rest against the parked Huey's cabin
  await h.eval(`(() => { const b = __G.crafts.bounds(null).find(q => q.def && q.def.id === 'heli'), c = Math.cos(b.yaw), s = Math.sin(b.yaw), x = b.x + c * (b.hw + 0.32) + s * 1.2, z = b.z - s * (b.hw + 0.32) + c * 1.2;
    __G.foot.spawnAt({ x, y: __G.terrainH(x, z), z, yaw: b.yaw + Math.PI }, { force: true }); __G.marine.view = 'first'; __G.marine.aim(b.yaw + Math.PI, 0.02); __G.marine.input({ ads: true }); return { at: [x, z] }; })()`);
  await h.wait(1500);
  await h.eval(`(() => { const S = __G.marine.S, b = __G.crafts.bounds(null).find(q => q.def && q.def.id === 'heli'); return { rested: S.rested, kind: __G.marine.MS.restKind, ads: +S.ads.toFixed(2), eye: [S.eye.x, S.eye.y, S.eye.z].map(v => +v.toFixed(2)), probe: __G.marine.MS.env.restAt(S.eye.x, S.eye.y - 0.12, S.eye.z, S.aimYaw), box: { x: +b.x.toFixed(2), z: +b.z.toFixed(2), yaw: +b.yaw.toFixed(2), y0: +b.y0.toFixed(2), y1: +b.y1.toFixed(2) }, me: [__G.foot.W.x, __G.foot.W.z].map(v => +v.toFixed(2)) }; })()`);
  await h.shot('rested-against-the-huey');
  await h.expect(`__G.marine.S.rested`, 'aiming with the handguard against the cabin of the Huey: rested');
  await h.eval(`(__G.marine.input({ ads: false, lean: -1 }), 1)`); await h.wait(1200); await h.shot('leaning-left');
  await h.expect(`__G.marine.S.lean < -0.5 && __G.marine.S.camRoll > 0.05`, 'Q: he leans left (the view rolls with him)');
  await h.eval(`(__G.marine.input({ lean: 0 }), 1)`);
  // ---- 5. CASEVAC: into the Huey on the island; the wounded come aboard; to the ALBATROSS
  await h.eval(`(() => { for (const u of __P.members) if (u !== __cas && u.alive && u.able && u.role === 'tl') { __GS.enrich(u); __fem(u.rich.M, 'legR'); u.rich.M.ko = 30; u.rich.noSelfAid = false; __GS.richState(u); window.__cas2 = u; break; } return __GS.casualties(__I.pad.x, __I.pad.z, 200).map(u => u.name); })()`);
  await h.eval(`__ff(40)`);   // (the second man is treated, wakes and can walk)
  await h.eval(`(() => { const d = __G.crafts.toWorld(__G.heliC, [2.6, -1.84, -1.9]); __G.foot.spawnAt({ x: d.x, y: __G.terrainH(d.x, d.z), z: d.z, yaw: d.yaw + Math.PI / 2 }, { force: true }); return 1; })()`);
  await h.wait(500); await h.key('tap', 'KeyY'); await h.wait(800);
  await h.expect(`__G.G.craft === 'heli' && __G.PL.landed`, 'back in the Huey, on the ground on SANDBAR');
  await h.eval(`(() => { const list = __GS.casualties(__G.H.pos.x, __G.H.pos.z, 45); for (const u of list) if (Math.hypot(u.x - __G.H.pos.x, u.z - __G.H.pos.z) > 30) __GS.place(u, __G.H.pos.x + 12, __G.H.pos.z + 8); window.__cam = { at: [__G.H.pos.x + 21, __G.H.pos.y + 3.5, __G.H.pos.z + 16], look: [__G.H.pos.x + 5, __G.H.pos.y - 0.5, __G.H.pos.z + 3] }; return __GS.casualties(__G.H.pos.x, __G.H.pos.z, 45).map(u => [u.name, u.rich ? u.rich.canWalk() : null]); })()`);
  await h.eval(`__ff(4)`); await h.wait(500); await h.shot('casevac-wounded-coming-to-the-huey');
  await h.eval(`__ff(90, 1 / 30, () => __G.war.ground.CV.huey.aboard.length >= 2)`);
  await h.eval(`({ aboard: __G.war.ground.CV.huey.aboard.length, left: __GS.casualties(__G.H.pos.x, __G.H.pos.z, 200).map(u => ({ n: u.name, d: +Math.hypot(u.x - __G.H.pos.x, u.z - __G.H.pos.z).toFixed(1), cas: u.cas && { held: u.cas.held, toHuey: !!u.cas.toHuey, medic: u.cas.medic, walk: u.rich && u.rich.canWalk() } })), evac: __GS.stats.evac })`);
  await h.expect(`__G.war.ground.CV.huey.aboard.length >= 2`, 'the wounded are aboard the Huey');
  await h.eval(`(() => { const c = __G.war.carrier, lx = -2, lz = 32, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw); __G.H.reset(new __G.THREE.Vector3(c.p.x + lx * cs + lz * sn, 8 + 1.9, c.p.z - lx * sn + lz * cs), c.yaw, true, 1); __G.HI.setCollective(0); window.__cam = null; return 1; })()`);
  await h.eval(`__ff(2)`); await h.wait(600);
  await h.eval(`({ CV: __G.war.ground.CV.stats, sickbay: __G.war.ground.CV.sickbay.length, pool: __G.war.ground.CV.ready })`);
  await h.expect(`__G.war.ground.CV.stats.delivered >= 2 && __G.war.ground.CV.huey.aboard.length === 0`, 'landed on the ALBATROSS: the wounded go down to the sickbay');
  await h.shot('on-the-albatross-casevac-delivered');
  await h.eval(`__ff(250)`);
  await h.eval(`(() => { const W = __G.war, m0 = W.P.mat = 200, msg = W.sendDrone(W.islands.find(i => i.owner !== 1 && !i.cave)); return { msg, spent: m0 - W.P.mat, ready: W.ground.CV.ready }; })()`);
  await h.expect(`/BACK FROM THE SICKBAY/.test(__G.war.ground.CV.stats.returned ? 'BACK FROM THE SICKBAY' : '') && __G.war.ground.CV.stats.returned >= 2`, 'four minutes on they are back in the pool: the next Sea Knight takes them (less materiel)');
}
