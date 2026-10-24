// COLLISION (wave 3 #3, the user's "a person's figure stands right in front of the camera; people overlap the
// player"): people are bodies that block each other, step out of the player's way, never stand inside each other,
// inside a vehicle or aircraft, or inside the camera; the third-person camera never sits inside anything.
//   1. on the ALBATROSS deck on foot (first person): walk straight at five of the deck crew in turn; every 100 ms the
//      camera (the eye) must be clear of every person, nobody inside anybody (> 12 cm) or inside a craft (> 12 cm), and
//      the crew must have stepped aside
//   2. a Hornet spotted on the catapult among the cat crew: within a few seconds nobody is left inside her
//   3. third person with the camera boom swung through a crew member: the camera is never inside him (or a craft)
//   4. a village street with people walking: walk along it into them - the same checks
//     node snap.mjs scenes/people.mjs
const CHECK = `(() => { const G = __G, CW = G.CW, FB = () => G.foot._cwb;
  window.__PC = { n: 0, cam: 0, camWho: null, pp: 0, ppWho: null, pv: 0, pvWho: null, minEye: 99,
    reset() { Object.assign(this, { n: 0, cam: 0, camWho: null, pp: 0, ppWho: null, pv: 0, pvWho: null, minEye: 99 }); },
    tick() { const c = G.zCam.position, A = CW.audit(c.x, c.z, 70); this.n++;
      if (A.pp > this.pp) { this.pp = A.pp; this.ppWho = A.worstPP; } if (A.pv > this.pv) { this.pv = A.pv; this.pvWho = A.worstPV; }
      const fb = FB(), inP = CW.pointIn(c.x, c.y, c.z, 0.12, b => b === fb || b.cls !== 'inf' && b.cls !== 'veh' && b.cls !== 'trk' && b.cls !== 'air' && b.cls !== 'walk');
      if (inP && !(inP.owner === G.crafts.active)) { this.cam++; this.camWho = inP.owner && (inP.owner.jersey || inP.owner.label || inP.owner.kind) || inP.cls; }
      for (const b of CW.near(c.x, c.z, 3, [], b => b.isPerson, false)) this.minEye = Math.min(this.minEye, Math.hypot(b.x - c.x, b.z - c.z));
    } };
  clearInterval(window.__PCi); window.__PCi = setInterval(() => { try { __PC.tick(); } catch (e) { __PC.err = String(e); } }, 100);
  return true; })()`;
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 40000);
  await h.key('tap', 'KeyY'); await h.wait(600);
  await h.expect("__G.G.craft === 'foot'", 'on foot on the ALBATROSS deck');
  await h.eval(CHECK);
  await h.waitFor('__PC.n > 10', 20000);
  await h.expect('__G.war.carrier.parts.crew.members.filter(p => p.cwb && p.cwb.enabled).length >= 10', 'the deck crew are people in the collision world');
  // ---- 1. walk at five crew members in turn (the nearest standing ones), first person
  await h.eval(`(window.__walkAt = k => { const c = __G.war.carrier, co = Math.cos(c.yaw), si = Math.sin(c.yaw), W = __G.foot.W;
    const ms = c.parts.crew.members.filter(p => p.cwb && p.cwb.enabled && p.mode !== 'walk').map(p => ({ p, d: Math.hypot(p.cwb.x - W.x, p.cwb.z - W.z) })).sort((a, b) => a.d - b.d);
    const m = ms[Math.min(k, ms.length - 1)]; if (!m) return null; window.__tgt = m.p; m.p.cwb.yields = 0;
    const b = m.p.cwb; __G.marine.aim(Math.atan2(-(b.x - W.x), -(b.z - W.z)), -0.05); return { jersey: m.p.jersey, mode: m.p.mode, d: +m.d.toFixed(1) }; }, 1)`);
  let yielded = 0;
  for (let k = 0; k < 5; k++) {
    await h.eval(`__walkAt(${k ? 1 : 0})`, `walk at crew member ${k + 1}`);
    await h.key('down', 'KeyW');
    await h.waitFor('(() => { const W = __G.foot.W, b = __tgt.cwb; __G.marine.aim(Math.atan2(-(b.x - W.x), -(b.z - W.z)), -0.05); return Math.hypot(b.x - W.x, b.z - W.z) < 0.9 || __tgt.cwb.yields > 20; })()', 25000);
    await h.wait(1500);
    await h.key('up', 'KeyW');
    if (k === 0) await h.shot('1-face-to-face-with-the-deck-crew');
    const r = await h.eval('({ who: __tgt.jersey, yields: __tgt.cwb.yields, off: +Math.hypot(__tgt.cwb.ox, __tgt.cwb.oz).toFixed(2), gap: +Math.hypot(__tgt.cwb.x - __G.foot.W.x, __tgt.cwb.z - __G.foot.W.z).toFixed(2), pc: { ...__PC } })');
    if (r && r.yields > 0) yielded++;
  }
  await h.expect(`${yielded} >= 4`, 'the crew stepped out of his way (at least four of five)');
  await h.expect('__PC.cam === 0', 'the camera was never inside a person (first person among the deck crew)');
  await h.expect('__PC.minEye > 0.45', 'nobody ever came within 0.45 m of his eye');
  await h.expect('__PC.pp < 0.12', 'nobody stood inside anybody (worst overlap under 12 cm)');
  await h.expect('__PC.pv < 0.12', 'nobody stood inside a craft or vehicle');
  // ---- 2. a Hornet on the catapult among the cat crew
  await h.eval('(__PC.reset(), __G.jetC.launch({ command: true }), __G.G.craft)', 'a Hornet to the catapult');
  await h.wait(4000);
  await h.eval('(__PC.reset(), 1)');
  await h.wait(4000);
  await h.eval('({ ...__PC })', 'the cat crew round her');
  await h.expect('__PC.pv < 0.12', 'nobody left standing inside the Hornet');
  await h.key('tap', 'KeyY'); await h.wait(600);
  await h.expect("__G.G.craft === 'foot'", 'back on foot beside her');
  // ---- 3. third person, the camera boom through a crew member
  await h.eval(`(() => { __PC.reset(); __G.marine.view = 'third'; __G.foot.view = 'third'; const c = __G.war.carrier, W = __G.foot.W;
    const m = c.parts.crew.members.filter(p => p.cwb && p.cwb.enabled).sort((a, b) => Math.hypot(a.cwb.x - W.x, a.cwb.z - W.z) - Math.hypot(b.cwb.x - W.x, b.cwb.z - W.z))[0]; window.__tgt = m;
    const b = m.cwb, a = Math.atan2(-(b.x - W.x), -(b.z - W.z)), x = b.x + Math.sin(a) * 1.6, z = b.z + Math.cos(a) * 1.6;   // stand 1.6 m in front of him, facing away (the boom behind runs through him)
    __G.foot.spawnAt({ x, y: W.y + 0.3, z, yaw: a + Math.PI }); __G.marine.aim(a + Math.PI, 0); return { who: m.jersey }; })()`, 'third person, the boom swung through a crew member');
  await h.wait(5000);
  await h.shot('3-third-person-camera-clear');
  await h.eval('({ ...__PC, clear: !__G.GR.solidAt(__G.zCam.position.x, __G.zCam.position.y, __G.zCam.position.z) })', 'third-person camera');
  await h.expect('__PC.cam === 0 && !__G.GR.solidAt(__G.zCam.position.x, __G.zCam.position.y, __G.zCam.position.z)', 'the third-person camera never sat inside a person, a craft or a solid');
  await h.eval("(__G.marine.view = 'first', __G.foot.view = 'first', 1)");
  // ---- 4. a village street with people in it
  await h.eval(`(() => { const its = __WORLD.zone.flatMap(e => e.items || []).filter(i => i.t === 'house'); const I = __G.HOME_B.isl; its.sort((a, b) => Math.hypot(a.x - I.x, a.z - I.z) - Math.hypot(b.x - I.x, b.z - I.z)); const it = its[0]; if (!it) return null;
    const x = it.x + 9, z = it.z + 9; __G.foot.spawnAt({ x, y: __G.terrainH(x, z) + 0.5, z, yaw: 0 }); return { house: [Math.round(it.x), Math.round(it.z)], n: its.length }; })()`, 'to a village on the home island');
  await h.waitFor('__WORLD.ambient.people.some(p => p.state === "walk" && Math.hypot(p.x - __G.foot.W.x, p.z - __G.foot.W.z) < 150)', 30000);
  const town = await h.eval(`(() => { const A = __WORLD.ambient, W = __G.foot.W; const p = A.people.filter(p => p.state === 'walk').sort((a, b) => Math.hypot(a.x - W.x, a.z - W.z) - Math.hypot(b.x - W.x, b.z - W.z))[0]; if (!p) return null; window.__vp = p;
    const x = p.x + 6, z = p.z + 6; __G.foot.spawnAt({ x, y: __G.terrainH(x, z) + 0.5, z, yaw: 0 }); return { at: [Math.round(p.x), Math.round(p.z)], people: A.people.length }; })()`, 'into a village street');
  if (town) {
    await h.wait(3000);
    await h.eval('(__PC.reset(), 1)');
    await h.key('down', 'KeyW');
    for (let k = 0; k < 6; k++) { await h.eval('(() => { const W = __G.foot.W, p = __vp, b = p.cwb || p; __G.marine.aim(Math.atan2(-(b.x - W.x), -(b.z - W.z)), -0.05); return 1; })()'); await h.wait(1500); }
    await h.key('up', 'KeyW');
    await h.shot('4-village-street');
    await h.eval('({ ...__PC, villager: __vp.cwb ? { yields: __vp.cwb.yields, off: +Math.hypot(__vp.cwb.ox, __vp.cwb.oz).toFixed(2) } : null })', 'walking into the villagers');
    await h.expect('__PC.cam === 0 && __PC.pp < 0.12 && __PC.pv < 0.12', 'in the street: the camera clear, nobody inside anybody or a vehicle');
    await h.expect('__vp.cwb && __vp.cwb.yields > 0', 'the villager stepped aside for him');
  }
}
