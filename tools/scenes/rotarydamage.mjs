// Damage on the rotary units in the real game (peace mode, damage applied through war.damage like any hit):
//   CH-46: below half hp one engine quits - it aborts and turns for home on the other; then killed: both engines out,
//          the AI autorotates down, the wreck explodes (Marines aboard lost)
//   MV-22: shot down in cruise - falls, explodes
//   WASP:  shot down - fans dead, tumbles, explodes
//   squad: hits drop Marines one by one; wiped out, the unit is gone, the bodies stay a while
// node snap.mjs scenes/rotarydamage.mjs
export default async function (h) {
  await h.goto('?debug&kb&peace&res=0.45');
  await h.waitFor('window.__G', 10000); await h.wait(500);
  await h.key('tap', 'Enter'); await h.waitFor(`__G.G.state === 'play'`, 10000); await h.wait(1000);
  // CH-46 to SANDBAR; in transit an engine is hit
  await h.eval(`(() => { const I = __G.ISLANDS.find(i => i.name === 'SANDBAR'); __G.G.mat = 300; __G.selIsl = I; __G.command(1); window.__u = __G.war.units.find(u => u.kind === 'ch46'); return !!__u; })()`);
  await h.waitFor(`__u.rot.AI.phase === 'transit' && __u.rot.AI.cmd.dist < 380`, 240000);
  await h.eval(`(__G.war.damage(__u, 6, 2), { hp: __u.hp, engines: __u.rot.S.eng.map(e => e.ok), phase: __u.rot.AI.phase })`);
  await h.wait(3000);
  await h.eval(`({ hp: __u.hp, engines: __u.rot.S.eng.map(e => e.ok), phase: __u.rot.AI.phase, live: __u.rot.S.live, feed: document.getElementById('feed').textContent.slice(0, 120) })`);
  await h.expect(`__u.rot.S.eng.filter(e => e.ok).length === 1 && __u.rot.AI.phase === 'rtb'`, 'CH-46: one engine out, aborts and turns for home');
  await h.wait(4000);
  await h.expect(`!__u.dead && __u.rot.S.rpm > 0.93`, 'CH-46: flies on one engine (rotor rpm held)');
  // now kill it
  await h.eval(`(__G.war.damage(__u, 10, 2), { dying: !!__u.dying, alt: Math.round(__u.p.y) })`);
  await h.waitFor(`__u.dead`, 60000);
  await h.eval(`({ crashed: __u.crashed, cat: __u.catastrophic, feed: document.getElementById('feed').textContent.slice(0, 160) })`);
  await h.expect(`__u.dead && __u.crashed`, 'CH-46: shot down - autorotated / fell and crashed');
  // an Osprey in cruise
  await h.eval(`(() => { const W = __G.war, I = __G.ISLANDS.find(i => i.name === 'FORGE'); window.__o = W.rotary.make('transport', 2, 0, 0, 0, { target: I }); W.units.push(__o); return __o.kind; })()`);
  await h.waitFor(`__o.rot.AI.phase === 'transit' && __o.rot.S.ias > 50`, 240000);
  await h.eval(`(__G.war.damage(__o, 20, 1), { dying: !!__o.dying })`);
  await h.waitFor(`__o.dead`, 60000);
  await h.expect(`__o.dead && __o.crashed`, 'MV-22: shot down, crashed');
  // a WASP
  await h.eval(`(() => { const W = __G.war, c = W.carrier; window.__w = W.spawnGunship(2, [c.p.x + 120, 40, c.p.z - 60]); return __w.kind; })()`);
  await h.wait(2000);
  await h.eval(`(__G.war.damage(__w, 5, 1), { dying: !!__w.dying })`);
  await h.waitFor(`__w.dead`, 30000);
  await h.expect(`__w.dead`, 'WASP: shot down, tumbled and exploded');
  // a squad: land a second CH-46's Marines, then hit them
  await h.eval(`(() => { const I = __G.ISLANDS.find(i => i.name === 'SANDBAR'); __G.selIsl = I; __G.command(1); window.__u2 = __G.war.units.filter(u => u.kind === 'ch46').pop(); return !!__u2; })()`);
  for (let k = 0; k < 50 && !(await h.eval(`!!(__G.war.units.some(u => u.type === 'squad'))`)); k++) await h.wait(10000);   // (polled: puppeteer caps one wait at 180 s, a loaded machine needs longer)
  await h.wait(4000);
  await h.eval(`(() => { const s = __G.war.units.find(u => u.type === 'squad'); window.__s = s; const a0 = s.squad.alive; __G.war.damage(s, 3, 2); return { a0, hp: s.hp }; })()`);
  await h.wait(1500);
  await h.eval(`({ alive: __s.squad.alive, hp: __s.hp })`);
  await h.expect(`__s.squad.alive === 10`, 'squad: three hits, three Marines down');
  await h.eval(`(__G.war.damage(__s, 20, 2), true)`); await h.wait(2000);
  await h.expect(`__s.dead && __s.squad.alive === 0`, 'squad: wiped out, the unit is gone');
  await h.expect(`__G.war.rotary.squads.length >= 1`, 'squad: the fallen stay on the island a while');
}
