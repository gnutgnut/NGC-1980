// PARITY in the game: each new counterpart seen in the war (docs/ngc1980/PARITY.md) - the MSC freighter at sea, the
// IOWA in a gun duel with the LEVIATHAN, the KRAKEN flying on her RUNAWAY lift fans, the E-2C Hawkeye, a BGM-109
// salvo, a HAWK battery on HOME ISLAND, the command board's support orders and the map legend.
//   node snap.mjs scenes/parity.mjs        (PARTS=msc,iowa,sky,hawkeye,salvo,hawk,board to pick)
export const query = '?debug&kb&peace&res=0.45&nofog';
export default async function (h) {
  const want = (process.env.PARTS || 'msc,iowa,sky,hawkeye,salvo,hawk,board').split(',');
  await h.goto('?debug&kb&peace&res=0.45&nofog&sea=3');
  await h.waitFor('window.__G', 15000);
  await h.key('tap', 'Enter'); await h.wait(1200);
  await h.waitFor("__G.G.state === 'play'", 10000);
  // a scripted camera in a unit's frame (heading only): window.__cam = { u, p: [lx, ly, lz], t: [lx, ly, lz] }
  await h.eval(`(() => {
    const r = __G.renderer, orig = r.render.bind(r), T = __G.THREE, a = new T.Vector3(), b = new T.Vector3();
    const W = (u, l, out) => { const y = u.yaw || 0, c = Math.cos(y), s = Math.sin(y); return out.set(u.p.x + l[0] * c + l[2] * s, u.p.y + l[1], u.p.z - l[0] * s + l[2] * c); };
    r.render = (sc, cam) => { const C = window.__cam; if (C && C.u) { W(C.u, C.p, a); W(C.u, C.t, b); cam.position.copy(a); cam.up.set(0, 1, 0); cam.lookAt(b); cam.updateMatrixWorld(); } orig(sc, cam); };
    window.__shot = (u, p, t) => { window.__cam = { u, p, t }; return 1; };
    __G.H.reset(new T.Vector3(__G.HOME_B.x + 18, 60, __G.HOME_B.z + 18), 0, false, 1); __G.HI.setCollective(0.475);
    __G.G.mat = 3000; return 1; })()`);
  const sea = '[0, 60]';   // open water mid-map
  if (want.includes('msc')) {
    await h.eval(`(() => { const W = __G.war, f = W.makeShip('freighter', 1, ${sea}[0] - 300, ${sea}[1], 0.6); f.cargo = 40; f.from = __G.ISLANDS[1]; f.repath = 999; f.speed = 4; f.path = [[f.p.x - 600 * Math.sin(0.6), f.p.z - 600 * Math.cos(0.6)]]; window.__msc = f; return f.name; })()`);
    await h.wait(5000);
    await h.expect('__G.war.units.includes(window.__msc) && __msc.side === 1', 'an MSC ship at sea');
    await h.eval('(__shot(__msc, [60, 28, 70], [0, 4, 0]), 1)'); await h.wait(1500); await h.shot('msc-34');
    await h.eval('(__shot(__msc, [-26, 12, -50], [0, 6, -10]), 1)'); await h.wait(1200); await h.shot('msc-bow');
    await h.eval('(__shot(__msc, [18, 10, 52], [0, 6, 30]), 1)'); await h.wait(1200); await h.shot('msc-stern-m167');
  }
  if (want.includes('iowa')) {
    await h.eval(`(() => { const W = __G.war; W.iowa = W.makeShip('battleship', 1, ${sea}[0] - 120, ${sea}[1] + 260, Math.PI / 2); W.battleship = W.makeShip('battleship', 2, ${sea}[0] + 120, ${sea}[1] + 260, -Math.PI / 2);
      for (const s of [W.iowa, W.battleship]) { s.max = 0.01; s.plan = 1e9; } return W.iowa.name; })()`);
    await h.wait(12000);
    await h.eval('(__shot(__G.war.iowa, [-55, 22, -90], [0, 6, -10]), 1)'); await h.wait(1500); await h.shot('iowa-bow');
    await h.eval('(__shot(__G.war.iowa, [40, 14, -20], [0, 8, -24]), 1)'); await h.wait(2500); await h.shot('iowa-turrets-trained');
    await h.eval('(__shot(__G.war.iowa, [70, 40, 60], [0, 4, 0]), 1)'); await h.wait(3000); await h.shot('iowa-firing-34');
    await h.eval('(__shot(__G.war.iowa, [0, 60, -160], [0, 0, 120]), 1)'); await h.wait(3000); await h.shot('iowa-vs-leviathan');
    await h.expect('__G.war.battleship && __G.war.battleship.hp < __G.war.battleship.hpMax', 'the IOWA hits the LEVIATHAN');
    await h.eval(`(() => { const W = __G.war; for (const s of [W.iowa, W.battleship]) if (s) { s.hp = 0; s.dead = true; } W.iowa = null; W.battleship = null; return 1; })()`);
  }
  if (want.includes('sky')) {
    await h.eval(`(__G.war.upgradeCarrier({ side: 2, free: true, instant: true }), 1)`);
    await h.eval(`(__shot(__G.war.enemyCarrier, [90, 30, 90], [0, 8, 0]), 1)`); await h.wait(3500); await h.shot('kraken-fans-unfolding');
    await h.waitFor('__G.war.enemyCarrier.sky && __G.war.enemyCarrier.sky.up', 20000);
    await h.eval(`(() => { const W = __G.war, c = W.enemyCarrier; c.sky.hold = 70; return 1; })()`);
    await h.wait(25000);
    await h.eval('({ y: Math.round(__G.war.enemyCarrier.p.y) })');
    await h.expect('__G.war.enemyCarrier.p.y > 15', 'the KRAKEN flies');
    await h.eval('(__shot(__G.war.enemyCarrier, [150, 10, 160], [0, 10, 0]), 1)'); await h.wait(1500); await h.shot('kraken-flying');
    await h.eval('(__shot(__G.war.enemyCarrier, [55, 6, -20], [28, 0, -38]), 1)'); await h.wait(1500); await h.shot('kraken-fan-close');
  }
  if (want.includes('hawkeye')) {
    await h.eval(`(window.__hk = null, window.__hkMsg = __G.war.sendHawkeye(), __hkMsg)`);
    await h.wait(1500);
    await h.eval(`(window.__hk = __G.war.units.find(u => u.type === 'hawkeye'), !!__hk)`);
    await h.expect('!!window.__hk', 'the Hawkeye is up');
    await h.wait(8000);
    await h.eval(`(() => { const u = __hk; u.yaw = Math.atan2(-u.v.x, -u.v.z); return 1; })()`);
    await h.eval('(__shot(__hk, [22, 6, -26], [0, 0, 0]), 1)'); await h.wait(1500); await h.shot('hawkeye-34');
    await h.eval(`(() => { const u = __hk; u.yaw = Math.atan2(-u.v.x, -u.v.z); return 1; })()`);
    await h.eval('(__shot(__hk, [-30, 10, 30], [0, 0, 0]), 1)'); await h.wait(1200); await h.shot('hawkeye-rear');
  }
  if (want.includes('salvo')) {
    await h.eval(`(() => { const W = __G.war, ec = W.enemyCarrier; W.spotP = { t: W.time, ship: ec }; window.__sv = W.salvoTomahawk(null); return __sv; })()`);
    await h.wait(2200);
    await h.eval(`(window.__gl = __G.war.units.find(u => u.type === 'glcm'), !!__gl)`);
    await h.expect('!!window.__gl', 'BGM-109s in the air');
    await h.eval(`(() => { const u = __gl; u.yaw = Math.atan2(-u.v.x, -u.v.z); return 1; })()`);
    await h.eval('(__shot(__gl, [8, 3, 10], [0, 0, -2]), 1)'); await h.wait(600); await h.shot('glcm-boost');
    await h.wait(4000);
    await h.eval(`(window.__gl = __G.war.units.find(u => u.type === 'glcm') || __gl, __gl.yaw = Math.atan2(-__gl.v.x, -__gl.v.z), 1)`);
    await h.eval('(__shot(__gl, [6, 2, 8], [0, 0, -2]), 1)'); await h.wait(600); await h.shot('glcm-cruise');
  }
  if (want.includes('hawk')) {
    await h.eval(`(() => { const W = __G.war, I = __G.ISLANDS.find(I => I.name === 'HOME ISLAND'); window.__hawkMsg = W.orderAA(I); const s = I.structs.filter(s => s.kind === 'aa').pop(); s.building = 0.01; window.__hs = { p: { x: s.x, y: s.y, z: s.z }, yaw: 0, s }; return [__hawkMsg, s.def && s.def.type]; })()`);
    await h.expect('__hs.s.def && __hs.s.def.type === "hawk"', 'a HAWK battery on HOME ISLAND');
    await h.wait(1500);
    await h.eval('(__shot(__hs, [12, 6, 12], [0, 1.5, 0]), 1)'); await h.wait(1500); await h.shot('hawk-34');
    await h.eval('(__shot(__hs, [-10, 4, -9], [0, 1.5, 0]), 1)'); await h.wait(1200); await h.shot('hawk-rear');
  }
  if (want.includes('board')) {
    await h.eval('(window.__cam = null, __G.selIsl = __G.ISLANDS.find(I => I.owner === 2 && !I.cave), __G.commander.open(), 1)');
    await h.wait(1200); await h.shot('board-support-orders');
    await h.key('tap', 'Backslash'); await h.wait(400);
    await h.key('tap', 'KeyM'); await h.wait(1500); await h.shot('map-legend');
    await h.key('tap', 'KeyM'); await h.wait(300);
  }
}
