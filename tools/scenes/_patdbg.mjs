export default async function (h) {
  await h.goto('?debug&kb&peace&res=0.45');
  await h.waitFor('window.__G', 15000);
  await h.key('tap', 'Enter'); await h.wait(1500);
  await h.eval(`(() => { const G = __G; G.G.mat = 300; G.G.bench = true; G.selIsl = null; G.command(4); G.command(4);
    window.__u = G.war.air.pending[0]; window.__trace = [];
    const c = () => G.war.carrier;
    window.__dd = () => { const u = __u, A = u.sim, C = c(), dx = A.pos.x - C.p.x, dz = A.pos.z - C.p.z, co = Math.cos(C.yaw), si = Math.sin(C.yaw);
      return [Math.round(G.war.time), u.ai.state, u.ai.wp, Math.round(dx * co - dz * si), Math.round(dx * si + dz * co), Math.round(A.pos.y), Math.round(G.terrainH(A.pos.x, A.pos.z)), Math.round(A.eas * 1.944), +(A.alpha * 57.3).toFixed(1), +(A.attitude().roll * 57.3).toFixed(0), +A.eng[0].n.toFixed(2), A.dead || '', u.dying ? 'DYING' : ''].join(' '); };
    setInterval(() => { if (__u.ai.state === 'rtb' || __u.ai.state === 'final' || __u.ai.state === 'waveoff') { __trace.push(__dd()); if (__trace.length > 400) __trace.shift(); } }, 250);
    return 1 })()`);
  await h.waitFor('__G.war.units.filter(u => u.type === "escort" && u.ai.state === "cap").length === 2', 300000);
  await h.eval('(__u.sim.fuel = 1850, 1)');
  await h.waitFor('__u.ai.recovered || __u.dying || __u.dead', 400000);
  await h.eval('__trace.slice(-90).join("\\n")');
  await h.eval('__u.ai.log.map(l => l.t + " " + l.msg).join("; ")');
}
