// COMMANDER part 2: the war shoots at the units you are NOT in. A Huey parked on the home island pad while the commander
// is a Marine on the ALBATROSS: a pair of RW-3 WASPs sent at her (the enemy's own raid targeting) strafe her, the
// rounds hit her through war.ext, her damage model takes it and, shot up, she is lost to the fleet (counted, in the
// feed). Then a jeep parked at the motor pool is in the war's target list too. No peace: the real war runs.
//   CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/commanderwar.mjs
export default {
  name: 'commanderwar',
  query: '?debug&auto&kb&res=0.45',
  run: async (h) => {
    const F = '__G.fleet', W = '__G.war';
    await h.waitFor("window.__G && __G.G.state === 'play' && __G.H.landed", 30000); await h.wait(500);
    await h.eval('(__G.G.bench = true, 1)');   // (the commander himself is not hurt: only the units he is not in)
    // a second Huey out at the home island pad (the first stays on the deck), then the commander walks the deck as a Marine
    await h.eval('__G.commander.deploy("heli", __G.HOME_B.isl.name, true)'); await h.wait(600);
    await h.expect(`__G.G.craft === 'heli' && __G.HUEYS.length === 1 && Math.hypot(__G.H.pos.x - __G.HOME_B.isl.pad.x, __G.H.pos.z - __G.HOME_B.isl.pad.z) < 20`, 'a second Huey on the home island pad');
    await h.eval('__G.commander.deploy("marine", "ship")'); await h.wait(800);
    await h.expect(`__G.G.craft === 'foot' && __G.war.ext.some(t => t.name === 'UH-1H HUEY' && Math.hypot(t.p.x - __G.HOME_B.isl.pad.x, t.p.z - __G.HOME_B.isl.pad.z) < 20)`, 'on foot on the deck; the Huey on the island pad is in the war\'s target list');
    await h.eval(`({ d: Math.round(Math.hypot(__G.foot.W.x - __G.H.pos.x, __G.foot.W.z - __G.H.pos.z)), ext: __G.war.ext.map(t => t.name) })`);
    // the raid: two WASPs 120 m off the pad, sent at the parked Huey
    await h.eval(`(() => { const t = __G.EXT.get(__G.heliC), p = t.p; window.__lh = ${F}.lost.heli; window.__w = [0, 1].map(k => ${W}.spawnGunship(2, [p.x + 120 * Math.cos(k * 2), p.y + 40, p.z + 120 * Math.sin(k * 2)], t)); for (const u of __w) u.hp = 400;   // (armoured for the test: the island's guns would knock them down before they get there)
      return __w.map(u => u.type || u.kind); })()`);
    await h.waitFor('(__G.Z.hitAcc || 0) > 0 || !__G.Z.alive', 240000);
    await h.eval('({ acc: __G.Z.hitAcc, alive: __G.Z.alive, hp: __G.D.hp, wasps: __w.map(u => !u.dead && Math.round(u.p.distanceTo(__G.H.pos))) })');
    await h.expect('(__G.Z.hitAcc || 0) > 0 || !__G.Z.alive', 'the WASPs\' rounds hit the parked Huey (her damage model takes them)');
    await h.wait(1500); await h.shot('wasps-on-the-parked-huey');
    await h.waitFor(`!__G.Z.alive || __w.every(u => u.dead)`, 400000);
    await h.eval(`({ alive: __G.Z.alive, lost: ${F}.lost.heli, why: __G.Z.lastDeath, feed: document.getElementById('feed') && document.getElementById('feed').textContent.slice(0, 300) })`);
    await h.expect(`!__G.Z.alive && ${F}.lost.heli === __lh + 1 && __G.G.craft === 'foot'`, 'shot up on the pad: the Huey is lost to the fleet (counted); the commander stays where he is');
    await h.expect(`__G.roster[0].outCount() === 1 && __G.HUEYS.length === 1`, 'the other Huey is still out on the deck');
    await h.shot('huey-lost-on-the-pad');
    await h.expect(`__G.war.ext.some(t => /M151|M35/.test(t.name)) && __G.war.ext.some(t => /M60|M113/.test(t.name))`, 'the motor pool and the armour parked are targets too');
  },
};
