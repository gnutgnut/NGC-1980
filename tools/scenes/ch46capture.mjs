// CH-46 + Marines in the real game: command 1 on SANDBAR (neutral, no guns). The Sea Knight spools up on the
// ALBATROSS, lifts off the moving deck, flies to the island, lands beside the pad, the Marines run out and take it,
// and the helicopter flies home and lands back on the deck. A render hook gives a chase / tower camera on it.
// node snap.mjs scenes/ch46capture.mjs
const HOOK = `(() => { const G = __G, T = G.THREE, r = G.renderer, cam = new T.PerspectiveCamera(50, 1, 0.3, 2500), orig = r.render.bind(r);
  const t = new T.Vector3(), p = new T.Vector3(), f = new T.Vector3();
  r.render = (s, c) => {
    const u = window.__follow; if (c !== G.zCam || !u || !window.__cam) return orig(s, c);
    const m = window.__cam; u.mesh.getWorldPosition(t);
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
  await h.eval(`(() => { const I = __G.ISLANDS.find(i => i.name === 'SANDBAR'); window.__I = I; __G.G.mat = 200; __G.selIsl = I; __G.command(1); const u = __G.war.units.find(u => u.kind === 'ch46'); window.__follow = u; window.__u = u;
    window.__cam = { mode: 'orbit', yaw: 2.4, d: 34, h: 9 }; return { owner: I.owner, n: __G.war.units.filter(u => u.kind === 'ch46').length, lz: u && u.lz, feed: document.getElementById('feed').textContent.slice(0, 120) }; })()`);
  await h.expect(`!!window.__u && __u.kind === 'ch46' && __u.rot.AI.phase === 'spool'`, 'a CH-46 is spooling up on the deck');
  await h.wait(1500); await h.shot('01-on-deck');
  // embark.js: the stick files up the ramp, chocks off, the LSE signals the lift
  await h.waitFor(`__u.rot.squad.figs.filter(F => F.st === 'embark' && F.delay < 0).length > 4 || __u.dead`, 60000); await h.shot('01b-boarding');
  await h.expect(`__u.rot.squad.figs.some(F => F.st === 'embark' || F.st === 'aboard') && __u.rot.AI.phase === 'spool' && __u.rot.squad.figs.every(F => F.st !== 'stick' || Math.abs(F.y - (__u.p.y - 1.8)) < 0.6)`, 'Marines boarding by the ramp on deck (the waiting stick stands on the flight deck, clear of the island)');
  const phase = (p, ms = 90000) => h.waitFor(`__u.rot.AI.phase === '${p}' || __u.dead`, ms);
  await h.waitFor(`__u.rot.S.agl > 3 || __u.dead`, 150000); await h.shot('02-liftoff');
  await h.eval(`(window.__cam = { mode: 'chase', d: 34, h: 9 }, true)`);
  await h.waitFor(`(__u.rot.AI.phase === 'transit' && __u.rot.AI.cmd.dist < 300) || __u.dead`, 90000); await h.shot('03-transit');
  // the game draws terrain round the player (250 m): park the Huey on SANDBAR across the pad from the LZ to watch
  await h.eval(`(() => { const I = __I, a = Math.atan2(__u.lz.z - I.pad.z, __u.lz.x - I.pad.x) + Math.PI, x = I.pad.x + Math.cos(a) * 27, z = I.pad.z + Math.sin(a) * 27; __G.H.reset(new __G.THREE.Vector3(x, __G.terrainH(x, z) + 1.9, z), -a - Math.PI / 2, true, 1); __G.HI.setCollective(0); return [x, z]; })()`);
  await h.eval(`(() => { const I = __I, a = Math.atan2(__u.lz.z - I.pad.z, __u.lz.x - I.pad.x), b = a + Math.PI + 0.35; window.__cam = { mode: 'fixed', at: [I.pad.x + Math.cos(b) * 44, I.pad.h + 15, I.pad.z + Math.sin(b) * 44], look: [I.pad.x + Math.cos(a) * 9, I.pad.h + 2.5, I.pad.z + Math.sin(a) * 9] }; return true; })()`);
  await h.waitFor(`(__u.rot.AI.phase === 'transit' && __u.rot.AI.cmd.dist < 50) || __u.dead`, 90000); await h.shot('04-approach');
  await phase('ground'); await h.shot('05-touchdown');
  await h.eval(`({ phase: __u.rot.AI.phase, off: Math.hypot(__u.p.x - __u.lz.x, __u.p.z - __u.lz.z), sink: __u.rot.S.body.maxSink, landed: __u.rot.S.landed })`);
  await h.expect(`!__u.dead && Math.hypot(__u.p.x - __u.lz.x, __u.p.z - __u.lz.z) < 4`, 'landed on the LZ');
  await h.waitFor(`(__u.squadUnit && __u.squadUnit.hp > 3) || __u.rot.squad.holding > 3 || __u.dead`, 60000);   // (GROUND WAR: the Marines are a squad proxy) await h.shot('06-marines-out');
  await h.waitFor(`__I.owner === 1 || __u.dead`, 150000);
  await h.eval(`({ owner: __I.owner, squads: __G.war.units.filter(u => u.type === 'squad').length, feed: document.getElementById('feed').textContent.slice(0, 200) })`);
  await h.expect(`__I.owner === 1`, 'SANDBAR taken by the Marines');
  await h.shot('07-captured');
  await h.eval(`(window.__cam = { mode: 'chase', d: 40, h: 10 }, true)`);
  await h.waitFor(`__u.rot.AI.phase === 'rtb' || __u.dead`, 40000); await h.wait(4000); await h.shot('08-rtb');
  await h.eval(`(() => { const c = __G.war.carrier, lx = -2, lz = 32, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw); __G.H.reset(new __G.THREE.Vector3(c.p.x + lx * cs + lz * sn, 8 + 1.9, c.p.z - lx * sn + lz * cs), c.yaw, true, 1); __G.HI.setCollective(0); window.__cam = { mode: 'orbit', yaw: 2.4, d: 45, h: 14 }; return true; })()`);
  for (let k = 0; k < 50 && !(await h.eval(`!!(__u.rot.AI.phase === 'descend2' || __u.dead)`)); k++) await h.wait(10000);   // (polled: puppeteer caps one wait at 180 s, a loaded machine needs longer) await h.shot('09-deck-approach');
  await h.waitFor(`__u.dead`, 60000);
  await h.eval(`({ stowed: __u.stowed, crashed: __u.crashed, units: __G.war.units.filter(u => u.kind === 'ch46').length, alive: __G.Z.alive })`);
  await h.expect(`__u.stowed && !__u.crashed`, 'back aboard the ALBATROSS (stowed)');
  await h.eval(`(window.__follow = null, true)`); await h.shot('10-garrison-view');
}
