export default async function (h) {
  await h.goto('?debug&kb&peace&res=0.45');
  await h.waitFor('window.__G', 15000);
  await h.key('tap', 'Enter'); await h.wait(1500);
  await h.eval(`(() => { const G = __G; G.G.mat = 300; G.G.bench = true; G.selIsl = null; G.command(4); G.command(4);
    const c = G.war.carrier; G.H.reset(new G.THREE.Vector3(c.p.x + 28, c.p.y + 22, c.p.z - 30), c.yaw, false, 1); G.HI.setCollective(0.475);
    window.__all = G.war.air.pending.slice();
    window.__d = () => __all.map(u => ({ n: u.name, st: u.ai.state, mode: u.ai.mode, hp: u.hp, dead: !!u.dead, dying: !!u.dying, sim: u.sim.dead, y: Math.round(u.p.y), eas: Math.round(u.sim.eas * 1.944), log: u.ai.log.slice(-12).map(l => l.t + ' ' + l.msg).join('; ') }));
    return __all.length })()`);
  await h.waitFor('__all.every(u => u.ai.state === "cap")', 240000);
  await h.eval('__d()');
  await h.eval(`(() => { const G = __G, c = G.war.carrier, b = { x: c.p.x + 1300, y: 260, z: c.p.z - 900, yaw: -2.2 }; window.__sh = [G.war.air.spawnShrike(b, c.p), G.war.air.spawnShrike({ ...b, x: b.x + 60 }, c.p)]; return __sh.length })()`);
  for (let i = 0; i < 8; i++) { await h.wait(8000); await h.eval('({ t: Math.round(__G.war.time), e: __d(), s: __sh.map(s => [s.hp, !!s.dying, Math.round(s.p.y)]), proj: __G.war.proj.filter(b => b.kind === "aam").map(b => b.side + ">" + (b.tgt && (b.tgt.name || b.tgt.type))) })'); }
}
