export default async function (h) {
  await h.goto('?debug&auto&kb&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 40000);
  await h.eval(`(() => { const G = __G, o = {}; o.defs = Object.keys(G.crafts.defs).map(k => k + ':' + (G.crafts.defs[k].seats || []).length + ':' + (G.crafts.defs[k].label||'')).join(' | ');
    const ks = x => x ? Object.keys(x).join(',') : null; o.rotary = ks(G.war.rotary); o.ground = ks(G.war.ground); o.air = ks(G.war.air); o.defence = ks(G.war.defence);
    o.crew = ks(G.war.carrier.parts.crew); o.parked = ks(G.war.carrier.parts.parked); o.pool = G.pool.list.map(v => v.id + '@' + (v.where||'')).join(','); o.roster = JSON.stringify(G.roster).slice(0, 600);
    o.fleet = JSON.stringify(G.fleet.types).slice(0, 600); return o; })()`);
}
