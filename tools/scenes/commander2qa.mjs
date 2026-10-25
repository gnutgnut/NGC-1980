// COMMANDER part 2 - QA shot list (quality bar: "no stone unturned"):
//  a. the wingman brings a recalled Hornet round the ALBATROSS's pattern over the rebuilt islands: a chase camera
//     behind and above the jet, a shot every ~15 s of game time, the least height over land logged (blocker 1);
//  b. the Marine boards the Huey on the deck: at the door in first and third person, then in the seat (cockpit) and
//     the Huey from outside (blocker 2).
//   CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/commander2qa.mjs
export default {
  name: 'commander2qa',
  query: '?debug&auto&kb&peace&res=0.6',
  run: async (h) => {
    const W = '__G.war';
    await h.waitFor("window.__G && __G.G.state === 'play' && __G.H.landed", 60000); await h.wait(500);
    await h.eval('(__G.G.bench = true, __G.G.extImmune = true, 1)');
    // a test-only chase camera: placed just before the frame is drawn (the game's camera code has run by then)
    await h.eval(`(() => { const R = __G.renderer, r0 = R.render.bind(R); R.render = (s, c) => { if (window.__camHook) window.__camHook(c); r0(s, c); }; return 1; })()`);
    // ---- a. a Hornet in the air ahead of the ship, the wingman takes her when we switch to the Huey, recalled at once
    await h.key('tap', 'Digit5'); await h.wait(700);
    await h.eval(`(() => { const J = __G.JP.J, c = ${W}.carrier; J.cat = null; J.launchBar = false; J.reset(c.p.x - Math.sin(c.yaw) * 600, 0, c.p.z - Math.cos(c.yaw) * 600, c.yaw, { running: true, airborne: true, alt: 260, speed: 85 }); J.gearCmd = 0; J.gear = 0; J.flapSel = 0; for (const e of J.eng) e.n = 0.85; __G.JP.thr = 0.8; return 1; })()`);
    await h.wait(500);
    await h.eval('__G.commander.deploy("heli")'); await h.wait(600);
    await h.expect('__G.G.craft === "heli" && !!__G.jetC.wing && __G.JP.alive', 'the wingman has the Hornet');
    await h.eval('(__G.jetC.wing.recall ? __G.jetC.wing.recall() : (__G.roster[1].recall && __G.roster[1].recall()), __G.jetC.wing.state)');
    await h.eval(`(() => { const J = __G.JP.J, _v = new __G.THREE.Vector3(); window.__minLand = 1e9;
      window.__camHook = c => { const w = __G.jetC.wing; if (!w || !__G.JP.alive) return; const v = J.vel, s = Math.hypot(v.x, v.z) || 1;
        c.position.set(J.pos.x - v.x / s * 38, J.pos.y + 11, J.pos.z - v.z / s * 38); c.lookAt(_v.set(J.pos.x + v.x / s * 30, J.pos.y - 2, J.pos.z + v.z / s * 30)); c.updateMatrixWorld();
        const g = __G.terrainH(J.pos.x, J.pos.z); if (g > 1 && !J.onGround) __minLand = Math.min(__minLand, J.pos.y - g);
        if (w.state === 'final' || w.state === 'waveoff') { const a = J.attitude(); (window.__fin = window.__fin || []).push([+__G.war.time.toFixed(1), w.state, Math.round(J.pos.y), w.lso ? Math.round(w.lso.R) : null, Math.round(J.eas), Math.round(a.roll * 57.3), Math.round(a.pitch * 57.3), +J.vel.y.toFixed(1), J.gearCmd, J.flapSel]); if (__fin.length > 400) __fin.splice(0, 100); } };
      return 1; })()`);
    let k = 0;
    for (let i = 0; i < 120; i++) {
      const r = await h.eval(`(() => { const w = __G.jetC.wing, J = __G.JP.J; return w ? { t: Math.round(${W}.time), st: w.state, y: Math.round(J.pos.y), land: Math.round(__G.terrainH(J.pos.x, J.pos.z)), min: Math.round(__minLand), R: w.lso ? Math.round(w.lso.R) : null } : { done: true, park: __G.jetC.park && __G.jetC.park.on }; })()`);
      if (!r || r.done) break;
      if (i % 3 === 0 && k < 14) { await h.shot(`wingman-${String(++k).padStart(2, '0')}-${r.st}`); }
      await h.wait(5000);
    }
    await h.eval('({ minOverLand: Math.round(__minLand), alive: __G.JP.alive, parked: !!(__G.jetC.park && __G.jetC.park.on), why: __G.JP.J.dead || null, final: (window.__fin || []).filter((r, i, a) => i % 4 === 0 || i > a.length - 12) })');   // [t, state, y, R, eas, roll, pitch, vy, gear, flap]
    await h.expect('__G.JP.alive && __minLand > 20', 'the wingman stayed clear of the islands (more than 20 m over land)');
    await h.expect('__G.jetC.park && __G.jetC.park.on && __G.war.shipAt(__G.JP.J.pos.x, __G.JP.J.pos.z) === __G.war.carrier', 'she trapped and parks on the deck');
    await h.eval('(window.__camHook = null, 1)');
    // ---- b. out of the Huey on deck, back in by the pilot's door: first and third person
    await h.eval('(__G.cockpitCam = true, 1)');
    await h.key('tap', 'KeyY'); await h.wait(800);
    await h.eval('({ craft: __G.G.craft, msg: document.getElementById("msg") && document.getElementById("msg").textContent, landed: __G.H.landed, stowed: __G.G.heliStowed, alive: __G.Z.alive, coll: __G.H.coll })');
    await h.expect("__G.G.craft === 'foot'", 'out of the Huey on foot');
    await h.eval(`(() => { const c = __G.war.carrier, d = __G.crafts.toWorld(__G.heliC, [2.6, -1.84, -1.9]); return __G.foot.spawnAt({ x: d.x, y: c.p.y + 8, z: d.z, yaw: d.yaw + Math.PI / 2 }); })()`);
    await h.eval("(__G.marine.view = 'first', 1)"); await h.wait(1500);
    await h.expect("document.getElementById('hint').textContent.startsWith('Y: GET IN THE UH-1H')", 'at the pilot door: the hint offers the Huey');
    await h.shot('door-first-person');
    await h.eval("(__G.marine.view = 'third', 1)"); await h.wait(1500); await h.shot('door-third-person');
    await h.eval("(__G.marine.view = 'first', 1)");
    await h.key('tap', 'KeyY'); await h.wait(1200);
    await h.expect("__G.G.craft === 'heli' && !__G.foot.exists", 'boarded the Huey');
    await h.eval('(__G.cockpitCam = true, 1)'); await h.wait(1500); await h.shot('in-the-seat-first-person');
    await h.eval('(__G.cockpitCam = false, 1)'); await h.wait(1500); await h.shot('huey-third-person');
  },
};
