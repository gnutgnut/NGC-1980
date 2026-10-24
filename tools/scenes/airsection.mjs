// AIR polish (ngc/airai-polish): a section of two F-14As (command 4 twice: the second joins on the first's wing), the CAP
// racetrack in formation, a RW-4 SHRIKE damaged (scorch, smoke) and shot down over an island (it tumbles, sheds a wing,
// leaves a burning charred wreck), a damaged REAPER, then the section's bingo: home together, the break one at a time,
// both trap.                                                    node snap.mjs scenes/airsection.mjs
export default async function (h) {
  await h.goto('?debug&kb&peace&res=0.45');
  await h.waitFor('window.__G', 15000);
  await h.key('tap', 'Enter'); await h.wait(1500);
  await h.eval(`(() => { const G = __G; G.G.mat = 400; G.G.bench = true; G.selIsl = null; G.command(4); G.command(4);
    const c = G.war.carrier; G.H.reset(new G.THREE.Vector3(c.p.x + 28, c.p.y + 22, c.p.z - 30), c.yaw, false, 1); G.HI.setCollective(0.475);
    window.__esc = () => G.war.units.filter(u => u.type === 'escort');
    const T = G.THREE, r0 = G.renderer.render.bind(G.renderer), off = new T.Vector3(); window.__cam = null;
    G.renderer.render = (sc, cam) => { const f = window.__cam; if (f && (f.u || f.p)) { const p = f.u ? f.u.p : f.p; off.set(...(f.off || [0, 5, 32])); if (f.u && f.u.sim && !f.world) off.applyQuaternion(f.u.sim.q); cam.position.copy(p).add(off); cam.lookAt(f.at ? f.at : p); cam.updateMatrixWorld(); } r0(sc, cam); };
    return 1 })()`);
  await h.waitFor('__esc().length === 2 && __esc().every(u => u.ai.state === "cap")', 240000);
  await h.eval('({ lead: __esc()[0].ai.wing === __esc()[1].ai, form: __esc()[1].ai.form, log: __esc()[1].ai.log.map(l => l.t + " " + l.msg).join("; ") })');
  await h.expect('__esc()[1].ai.lead === __esc()[0].ai');
  await h.wait(15000);
  await h.eval(`(() => { const [L, W] = __esc(), d = L.p.distanceTo(W.p); window.__cam = { u: W, off: [-10, 5, 45], at: L.p }; return { d: Math.round(d), form: W.ai.form, leg: L.ai.leg } })()`);
  await h.wait(600); await h.shot('section_cap');
  await h.eval('(window.__cam = { u: __esc()[0], off: [6, 1.5, -9], at: __esc()[0].p }, 1)'); await h.wait(600); await h.shot('crew_look');
  await h.expect('__esc()[0].p.distanceTo(__esc()[1].p) < 120');
  // a SHRIKE over an island, hit once (damage state), then down: tumble, debris, a burning wreck on the ground
  await h.eval(`(() => { const G = __G, I = G.war.islands.filter(I => I.pad).sort((a, b) => b.pad.h - a.pad.h)[0], b = { x: I.pad.x, y: I.pad.h + 160, z: I.pad.z, yaw: 0 };
    window.__s = G.war.air.spawnShrike(b, { x: I.pad.x, y: 0, z: I.pad.z }); window.__s.hp = 1; window.__I = I.name; window.__cam = { u: __s, off: [7, 3, 18] }; return I.name })()`);
  await h.wait(2500); await h.shot('shrike_damaged');
  await h.eval('(() => { const s = __s; s.hp = 0; s.dying = true; window.__cam = { u: s, off: [20, 8, 40], world: true }; return 1 })()');
  await h.wait(1500); await h.shot('shrike_falling');
  await h.waitFor('__s.dead', 60000);
  await h.eval(`(() => { const w = __G.war.air.wrecks[__G.war.air.wrecks.length - 1]; if (!w) return 'no wreck'; window.__cam = { p: w.obj.position, off: [14, 8, 18], world: true }; return { wet: w.wet, y: +w.obj.position.y.toFixed(1), debris: __G.war.air.debris.length } })()`);
  await h.wait(3000); await h.shot('shrike_wreck');
  // a REAPER, damaged (an aileron gone, smoke)
  await h.eval(`(() => { const G = __G, c = G.war.carrier; window.__rq = G.war.air.spawnReaper(c.p); __rq.hp = 1; window.__cam = { u: __rq, off: [14, 5, 26] }; return 1 })()`);
  await h.wait(2500); await h.shot('reaper_damaged');
  await h.eval('(() => { __rq.hp = 0; __rq.dying = true; return 1 })()');
  // bingo for the lead: the section comes home, breaks one at a time and both trap
  await h.eval('(() => { const L = __esc()[0]; L.sim.fuel = 1850; window.__L = L; window.__W = __esc()[1]; window.__cam = null; return L.name })()');
  await h.waitFor('__W.ai.state === "rtb" || __W.dead', 60000);
  await h.waitFor('__L.ai.log.some(l => l.msg === "THE BREAK") || __L.dead || __L.dying', 180000);
  await h.eval('(window.__cam = { u: __L, off: [-30, 12, 60], world: true }, 1)'); await h.wait(1500); await h.shot('the_break');
  await h.waitFor('(__L.ai.recovered || __L.dead || __L.dying) && (__W.ai.recovered || __W.dead || __W.dying)', 400000);
  await h.eval('[__L, __W].map(u => ({ name: u.name, trapped: u.ai.trapped && u.ai.trapped.wire, waveoffs: u.ai.waveoffs, bolters: u.ai.bolters, dying: !!u.dying, log: u.ai.log.slice(-14).map(l => l.t + " " + l.msg).join("; ") }))');
  await h.expect('!!__L.ai.trapped && !!__W.ai.trapped');
}
