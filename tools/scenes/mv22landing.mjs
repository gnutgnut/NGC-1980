// RUNAWAY MV-22 in the real game: an Osprey launched off the KRAKEN at SANDBAR (neutral). It lifts off the enemy deck,
// converts partway on the short hop, comes back to the hover, lands beside the pad, the machine troopers march out and
// take the island for the enemy, and the Osprey flies home and folds on the KRAKEN. Peace mode (nobody shoots).
// The Huey is parked on SANDBAR so the game draws the island round the camera.   node snap.mjs scenes/mv22landing.mjs
const HOOK = `(() => { const G = __G, T = G.THREE, r = G.renderer, cam = new T.PerspectiveCamera(50, 1, 0.3, 2500), orig = r.render.bind(r);
  const t = new T.Vector3(), p = new T.Vector3(), f = new T.Vector3();
  r.render = (s, c) => {
    const u = window.__follow; if (c !== G.zCam || !u || !window.__cam) return orig(s, c);
    const m = window.__cam; u.mesh.getWorldPosition(t); u.mesh.visible = true;
    if (m.mode === 'chase') { f.set(u.v.x, 0, u.v.z); if (f.lengthSq() < 9) f.set(-Math.sin(u.yaw), 0, -Math.cos(u.yaw)); f.normalize(); p.copy(t).addScaledVector(f, -m.d).y += m.h; }
    else if (m.mode === 'fixed') { p.set(...m.at); if (m.look) t.set(...m.look); }
    else { p.set(t.x + Math.sin(m.yaw) * m.d, t.y + m.h, t.z + Math.cos(m.yaw) * m.d); }
    cam.position.copy(p); cam.up.set(0, 1, 0); cam.lookAt(t); cam.aspect = c.aspect; cam.updateProjectionMatrix(); return orig(s, cam);
  };
  return true; })()`;
export default async function (h) {
  await h.goto('?debug&kb&peace&res=0.45');
  await h.waitFor('window.__G', 10000); await h.wait(500);
  await h.key('tap', 'Enter'); await h.waitFor(`__G.G.state === 'play'`, 10000); await h.wait(1500);
  await h.eval(HOOK);
  await h.eval(`(() => { const W = __G.war, I = __G.ISLANDS.find(i => i.name === 'SANDBAR'); window.__I = I;
    const u = W.rotary.make('transport', 2, 0, 0, 0, { target: I }); W.units.push(u); window.__u = u; window.__follow = u;
    window.__cam = { mode: 'orbit', yaw: 2.2, d: 40, h: 10 };
    // park the Huey across the pad from the LZ
    const a = Math.atan2(u.lz.z - I.pad.z, u.lz.x - I.pad.x) + Math.PI, x = I.pad.x + Math.cos(a) * 27, z = I.pad.z + Math.sin(a) * 27;
    __G.H.reset(new __G.THREE.Vector3(x, __G.terrainH(x, z) + 1.9, z), -a - Math.PI / 2, true, 1); __G.HI.setCollective(0);
    return { lz: u.lz, start: u.p.toArray().map(Math.round), phase: u.rot.AI.phase }; })()`);
  await h.expect(`__u.kind === 'mv22' && __u.rot.AI.phase === 'spool'`, 'an Osprey spooling up on the KRAKEN');
  for (let k = 0; k < 80 && !(await h.eval(`!!((__u.rot.AI.phase === 'transit' && __u.rot.AI.cmd.dist < 300) || __u.dead)`)); k++) await h.wait(5000);   // (troopers board first: embark.js)
  await h.eval(`(window.__cam = { mode: 'chase', d: 40, h: 9 }, ({ nac: __u.rot.S.nac * 57.3, ias: __u.rot.S.ias, gear: __u.rot.S.gear }))`); await h.wait(300); await h.shot('01-inbound');
  await h.eval(`(() => { const I = __I, a = Math.atan2(__u.lz.z - I.pad.z, __u.lz.x - I.pad.x), b = a + Math.PI + 0.35; window.__cam = { mode: 'fixed', at: [I.pad.x + Math.cos(b) * 46, I.pad.h + 16, I.pad.z + Math.sin(b) * 46], look: [I.pad.x + Math.cos(a) * 9, I.pad.h + 3, I.pad.z + Math.sin(a) * 9] }; return true; })()`);
  await h.waitFor(`(__u.rot.AI.phase === 'transit' && __u.rot.AI.cmd.dist < 40) || __u.dead`, 90000); await h.shot('02-final');
  for (let k = 0; k < 60 && !(await h.eval(`!!(__u.rot.AI.phase === 'ground' || __u.dead)`)); k++) await h.wait(5000); await h.shot('03-touchdown');
  await h.eval(`({ off: Math.hypot(__u.p.x - __u.lz.x, __u.p.z - __u.lz.z), dead: __u.dead, sink: __u.rot.S.body.maxSink })`);
  await h.expect(`!__u.dead && Math.hypot(__u.p.x - __u.lz.x, __u.p.z - __u.lz.z) < 4`, 'Osprey landed on its LZ');
  await h.waitFor(`(__u.squadUnit && __u.squadUnit.hp > 4) || __u.rot.squad.holding > 4 || __u.dead`, 60000);   // (GROUND WAR: the troopers are STRIDERs in a squad proxy) await h.shot('04-troopers');
  await h.waitFor(`__I.owner === 2`, 150000);
  await h.eval(`({ owner: __I.owner, feed: document.getElementById('feed').textContent.slice(0, 160) })`);
  await h.expect(`__I.owner === 2`, 'SANDBAR taken by the machine troopers');
  await h.shot('05-taken');
  await h.waitFor(`__u.rot.AI.phase === 'rtb' || __u.dead`, 40000); await h.wait(2500);
  await h.eval(`(window.__cam = { mode: 'chase', d: 45, h: 10 }, true)`); await h.wait(300); await h.shot('06-departing');
  for (let k = 0; k < 70 && !(await h.eval(`!!(__u.dead)`)); k++) await h.wait(10000);   // (polled: puppeteer caps one wait at 180 s, a loaded machine needs longer)
  await h.eval(`({ stowed: __u.stowed, crashed: __u.crashed })`);
  await h.expect(`__u.stowed && !__u.crashed`, 'back on the KRAKEN, folded and struck below');
}
