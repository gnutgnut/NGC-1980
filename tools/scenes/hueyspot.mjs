// COMMANDER part 2: the Huey's crew lands her on a free ALBATROSS spot with two more Hueys out (commander.mjs step 12d
// on its own, quicker). Polled every ~2 s of game time; on a loss the rotor disc's ring is scanned for what stood
// higher than the blade tips (deck, parked aircraft, island).
//   CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/hueyspot.mjs
export default {
  name: 'hueyspot',
  query: '?debug&auto&kb&peace&res=0.45',
  run: async (h) => {
    await h.waitFor("window.__G && __G.G.state === 'play' && __G.H.landed", 60000); await h.wait(500);
    await h.eval('(__G.G.bench = true, __G.G.extImmune = true, __G.G.mat = 600, 1)');
    await h.eval('(__G.commander.deploy("heli", "ship", true), __G.commander.deploy("heli", "ship", true), { slots: __G.HUEYS.length, main: __G.H.pos.toArray().map(Math.round), others: __G.HUEYS.map(s => s.H.pos.toArray().map(Math.round)) })');
    await h.wait(800); await h.shot('three-hueys');
    await h.eval(`(() => { const c = __G.war.carrier, H = __G.H; const x = c.p.x - Math.sin(c.yaw) * 20 + Math.cos(c.yaw) * 80, z = c.p.z - Math.cos(c.yaw) * 20 - Math.sin(c.yaw) * 80;
      H.reset(new __G.THREE.Vector3(x, 45, z), c.yaw, false, 1); H.vel.set(c.v.x, 0, c.v.z); __G.HI.setCollective(0.45); return [x, z]; })()`);
    await h.wait(300);
    // the ALBATROSS under way and turning (as in a war): her crew has to land on a moving, swinging deck
    if (process.env.STILL !== '1') await h.eval('(() => { const c = __G.war.carrier, a = c.yaw + 1.0; __G.war.orderCarrier(c.p.x - Math.sin(a) * 900, c.p.z - Math.cos(a) * 900); return 1; })()');
    await h.eval('__G.commander.deploy("marine", "ship")'); await h.wait(600);
    await h.expect(`__G.G.craft === 'foot' && __G.heliAI.phase !== 'off' && !!__G.heliAI.spotKey`, 'on foot; the Huey crew flies her to a spot');
    await h.eval(`(window.__Q = () => { const c = __G.war.carrier, H = __G.H, s = __G.GR.toShip(c, H.pos.x, H.pos.y, H.pos.z), a = H.attitude ? H.attitude() : {};
      const ring = []; for (let k = 0; k < 16; k++) { const b = k * Math.PI / 8, x = H.pos.x + Math.cos(b) * 7.3, z = H.pos.z + Math.sin(b) * 7.3, g = __G.groundY(x, z), q = __G.GR.toShip(c, x, 0, z); ring.push([+q.x.toFixed(1), +q.z.toFixed(1), +(g - c.p.y).toFixed(1)]); }
      return { t: +__G.war.time.toFixed(1), alive: __G.Z.alive, death: __G.Z.lastDeath && __G.Z.lastDeath.why, ph: __G.heliAI.phase, spot: __G.heliAI.spotKey, lx: +s.x.toFixed(1), ly: +s.y.toFixed(2), lz: +s.z.toFixed(1), pitch: +(a.pitch || 0).toFixed(2), roll: +(a.roll || 0).toFixed(2), agl: +H.agl.toFixed(1), shipW: +(c.w || 0).toFixed(3), shipV: +c.speed.toFixed(1), ringHigh: ring.filter(r => r[2] > 8.2) }; }, __Q())`);
    for (let k = 0; k < 150; k++) {
      const r = await h.eval('(window.__t1 = __G.war.time, __Q())');
      if (!r || !r.alive || r.ph === 'off') break;
      await h.waitFor(r.agl < 5 ? '__G.war.time > __t1 + 0.5 || !__G.Z.alive' : '__G.war.time > __t1 + 2 || !__G.Z.alive', 60000);
    }
    await h.eval('__Q()');
    await h.expect(`__G.Z.alive && __G.H.landed && __G.war.shipAt(__G.H.pos.x, __G.H.pos.z) === __G.war.carrier && __G.HUEYS.every(s => s.H.pos.distanceTo(__G.H.pos) > 12)`, 'the crew landed her on a free deck spot (clear of the other Hueys)');
    await h.eval("(__G.marine.aim(Math.atan2(__G.foot.W.x - __G.H.pos.x, __G.foot.W.z - __G.H.pos.z), -0.1), __G.marine.view = 'third', 1)"); await h.wait(1200); await h.shot('free-spot');
  },
};
