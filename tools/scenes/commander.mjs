// COMMANDER: the player commands the task force. Every unit type taken out from the ALBATROSS or a friendly island
// (the Marine, the Hornet and the Tomcat on cat 1, the M60A3 / M113A2 / motor-pool car at an island motor pool or on
// the deck park, a Huey on an island pad), switching between units that are out (the board, Slash), the unit you
// leave carrying on (the Hornet's wingman flies CAP, the Huey's crew flies her home and lands on the deck), the war
// clock running through every switch, the fleet's reserves and losses counted, and the game lost when the fleet is spent.
// All waits are on game state, not wall time (headless runs at a few fps).
export default {
  name: 'commander',
  query: '?debug&auto&kb&res=0.45',
  run: async (h) => {
    const F = '__G.fleet', W = '__G.war';
    await h.waitFor("window.__G && __G.G.state === 'play' && __G.H.landed", 20000); await h.wait(500);
    await h.eval(`(__G.G.bench = true, window.__t0 = ${W}.time, { n: ${F}.n, craft: __G.G.craft, mat: __G.G.mat })`);
    await h.expect(`${F}.n.heli === 3 && ${F}.n.jet === 2 && ${F}.n.tomcat === 2 && ${F}.n.marine === 6 && __G.G.lives === 3 && __G.G.jets === 2`, 'the fleet starts with its reserves (G.lives / G.jets are views of it)');
    await h.expect("/HUEY/.test(document.getElementById('fleet').textContent) && /MARINES/.test(document.getElementById('fleet').textContent)", 'the fleet strip is on the HUD');

    // ---- 1. the board (\): open, a Marine on the ALBATROSS (key 8 on the board), close
    await h.key('tap', 'Backslash'); await h.wait(400);
    await h.expect('__G.commander.isOpen && document.getElementById("cmdBoard").classList.contains("on")', 'Backslash opens the command board');
    await h.shot('board-open');
    await h.key('tap', 'Digit8'); await h.wait(600);
    await h.expect(`__G.G.craft === 'foot' && __G.foot.alive && ${F}.n.marine === 5 && !__G.commander.isOpen`, 'a Marine out on the ALBATROSS from the reserve (6 -> 5)');
    await h.expect(`__G.war.shipAt(__G.foot.W.x, __G.foot.W.z) === __G.war.carrier`, 'he stands on the carrier deck');
    await h.wait(800); await h.shot('marine-on-deck');

    // ---- 2. 5 from on foot: a Hornet on cat 1 (no need to land the Huey); the Marine goes back to the reserve
    await h.key('tap', 'Digit5'); await h.wait(700);
    await h.expect(`__G.G.craft === 'jet' && !!__G.JP.J.cat && ${F}.n.jet === 1 && ${F}.n.marine === 6`, '5 from on foot: the Hornet on cat 1 (2 -> 1), the Marine back in reserve');
    await h.expect('__G.G.heliStowed', 'the Huey went down to the hangar off the deck');
    // fly her: put her in the air off the bow (the cat shot itself is jettrap / jet scenes' business)
    await h.eval(`(() => { const J = __G.JP.J, c = ${W}.carrier; J.cat = null; J.launchBar = false; J.reset(c.p.x - Math.sin(c.yaw) * 600, 0, c.p.z - Math.cos(c.yaw) * 600, c.yaw, { running: true, airborne: true, alt: 260, speed: 85 }); J.gearCmd = 0; J.gear = 0; J.flapSel = 0; for (const e of J.eng) e.n = 0.85; __G.JP.thr = 0.85; __G.JP.snapChase(); return J.pos.y; })()`);
    await h.wait(1500); await h.shot('hornet-flying');

    // ---- 3. switch to the Huey (in the hangar: spotted on deck) - the wingman takes the Hornet
    await h.eval('__G.commander.deploy("heli")'); await h.wait(600);
    await h.expect(`__G.G.craft === 'heli' && !__G.G.heliStowed && !!__G.jetC.wing && __G.JP.alive`, 'switched to the Huey; the wingman flies the Hornet');
    await h.eval('({ wing: __G.jetC.wing.state, y: __G.JP.J.pos.y, status: __G.roster[1].status() })');
    await h.waitFor(`${W}.time > __t0 + 12`, 60000);
    await h.expect('__G.JP.alive && __G.JP.J.pos.y > 120 && !__G.JP.J.dead', 'the Hornet is still flying under the wingman');
    await h.eval('({ wing: __G.jetC.wing && __G.jetC.wing.state, y: Math.round(__G.JP.J.pos.y), eas: Math.round(__G.JP.J.eas * 1.944) })');
    // R on the board: recall her - the wingman flies the pattern and traps while the rest of this scene goes on (checked in 11)
    await h.key('tap', 'Backslash'); await h.wait(300); await h.key('tap', 'ArrowDown'); await h.key('tap', 'KeyR'); await h.wait(300);
    await h.expect(`__G.jetC.wing && __G.jetC.wing.state === 'rtb'`, 'board R: the Hornet recalled (RTB)');
    await h.key('tap', 'Backslash'); await h.wait(200);

    // ---- 4. the Huey airborne, then switch to the M113 (out on the deck park): the crew flies the Huey home
    await h.eval(`(() => { const c = ${W}.carrier, H = __G.H; const x = c.p.x - Math.sin(c.yaw) * 30 + Math.cos(c.yaw) * 70, z = c.p.z - Math.cos(c.yaw) * 30 - Math.sin(c.yaw) * 70;
      H.reset(new __G.THREE.Vector3(x, 45, z), c.yaw, false, 1); H.vel.set(c.v.x, 0, c.v.z); __G.HI.setCollective(0.45); return [x, z]; })()`);
    await h.wait(500);
    await h.key('tap', 'Backslash'); await h.wait(300); await h.key('tap', 'Digit5'); await h.wait(700);
    await h.expect(`__G.G.craft === 'm113' && __G.heliAI.phase !== 'off'`, 'board 5: switched to the M113; the Huey crew has her');
    await h.eval('({ ai: __G.heliAI.phase, dest: __G.heliAI.dest, m113: __G.roster[4].status() })');
    await h.wait(800); await h.shot('m113-driver');
    await h.eval('(window.__tq = __G.war.time, 1)');
    await h.waitFor('__G.heliAI.phase === "off" || !__G.Z.alive', 240000);
    await h.expect(`__G.Z.alive && __G.H.landed && __G.war.shipAt(__G.H.pos.x, __G.H.pos.z) === __G.war.carrier`, 'the Huey crew landed her on the ALBATROSS');
    await h.eval('({ landedAfter: Math.round(__G.war.time - __tq), pos: __G.H.pos.toArray().map(Math.round) })');

    // ---- 5. Slash: the next unit that is out (the Huey, landed), then the Tomcat on cat 1 from the board API
    await h.key('tap', 'Slash'); await h.wait(500);
    await h.expect(`__G.G.craft !== 'm113'`, 'Slash jumps to the next unit out');
    await h.eval('({ craft: __G.G.craft })');
    await h.eval('__G.commander.deploy("tomcat")'); await h.wait(700);
    await h.expect(`__G.G.craft === 'tomcat' && !!__G.tomcatC.TP.A.cat && ${F}.n.tomcat === 1`, 'a Tomcat on cat 1 from the reserve (2 -> 1)');
    await h.wait(800); await h.shot('tomcat-on-cat');

    // ---- 6. losses: the M60A3 knocked out (out at the home island) - counted; a new one from the reserve at the island motor pool
    await h.eval('(__G.m60C.wreck("KNOCKED OUT (TEST)", true), 1)');
    await h.expect(`${F}.lost.m60 === 1 && !__G.roster[3].out()`, 'the wrecked M60A3 is a loss to the fleet');
    await h.eval(`__G.commander.deploy("m60", __G.HOME_B.isl.name)`); await h.wait(700);
    await h.expect(`__G.G.craft === 'm60' && ${F}.n.m60 === 0 && !__G.m60C.dead && Math.hypot(__G.m60C.frame({}).x - __G.HOME_B.isl.pad.x, __G.m60C.frame({}).z - __G.HOME_B.isl.pad.z) < 60`, 'a fresh M60A3 at the home island motor pool (1 -> 0)');
    await h.wait(1200); await h.shot('m60-island');

    // ---- 7. the motor pool (several of a type out): stand an M151 down at a base, take one out on the ALBATROSS deck,
    // switch to the nearest M35 (the islands stock them), then N: another M35 at the home island
    await h.eval('(window.__j0 = __G.fleet.n.m151, window.__o0 = __G.roster[5].outCount(), __G.commander.standDown(5), { n: __G.fleet.n.m151, out: __G.roster[5].outCount() })');
    await h.expect(`${F}.n.m151 === __j0 + 1 && __G.roster[5].outCount() === __o0 - 1`, 'an M151A2 stands down into reserve');
    await h.eval('__G.commander.deploy("m151", "ship", true)'); await h.wait(600);
    await h.expect(`__G.crafts.active.type === 'm151' && ${F}.n.m151 === __j0 && __G.war.shipAt(__G.crafts.active.sim.pos[0], __G.crafts.active.sim.pos[2]) === __G.war.carrier`, 'an M151A2 out on the ALBATROSS deck park');
    await h.wait(800); await h.shot('m151-deck');
    await h.eval('(window.__t0n = __G.fleet.n.m35, window.__t0o = __G.roster[6].outCount(), __G.commander.deploy("m35"), { craft: __G.G.craft, out: __G.roster[6].outCount() })');
    await h.expect(`__G.crafts.active.type === 'm35' && ${F}.n.m35 === __t0n`, 'switched to the nearest M35A2 that is out (no reserve used)');
    await h.eval(`__G.commander.deploy("m35", __G.HOME_B.isl.name, true)`); await h.wait(600);
    await h.expect(`__G.crafts.active.type === 'm35' && ${F}.n.m35 === __t0n - 1 && __G.roster[6].outCount() === __t0o + 1`, 'N: another M35A2 out at the home island (reserve 1 -> 0)');
    await h.eval('__G.commander.deploy("m151")'); await h.wait(400);

    // ---- 8. the Huey lost while parked; a new one from the reserve on an island pad
    await h.eval('(__G.killPlayerZ("DESTROYED ON DECK (TEST)"), 1)');
    await h.expect(`!__G.Z.alive && ${F}.lost.heli === 1 && ${F}.n.heli === 3 && __G.crafts.active.type === 'm151'`, 'the parked Huey is lost (counted); you stay in the jeep');
    await h.eval(`__G.commander.deploy("heli", __G.HOME_B.isl.name)`); await h.wait(600);
    await h.expect(`__G.G.craft === 'heli' && __G.Z.alive && ${F}.n.heli === 2 && Math.hypot(__G.H.pos.x - __G.HOME_B.isl.pad.x, __G.H.pos.z - __G.HOME_B.isl.pad.z) < 5`, 'a new Huey on the home island pad (3 -> 2)');
    await h.wait(1000); await h.shot('huey-island-pad');

    // ---- 9. the M113 stood down on the deck, out again at the island; the war clock ran through all of it
    await h.eval('(window.__m0 = __G.fleet.n.m113, __G.commander.standDown(4), __G.commander.deploy("m113", __G.HOME_B.isl.name), { n: __G.fleet.n.m113, craft: __G.G.craft })');
    await h.expect(`__G.G.craft === 'm113' && ${F}.n.m113 === __m0`, 'the M113A2 stood down on the deck and out again at the island');
    await h.expect(`${W}.time > __t0 + 20 && ${W}.units.length > 3`, 'the war ran on through every switch');
    await h.eval('({ warTime: Math.round(__G.war.time - __t0), n: __G.fleet.n, lost: __G.fleet.lost, strip: document.getElementById("fleet").textContent })');

    // ---- 10. the unit you are in is lost: the board opens on the next unit, the hand-on comes after the crew timer
    await h.eval('__G.commander.deploy("tomcat")'); await h.wait(500);
    await h.expect(`__G.G.craft === 'tomcat'`, 'back in the Tomcat (it was out on cat 1)');
    await h.eval('(__G.tomcatC.TP.A.dead = "crash", 1)'); await h.wait(600);
    await h.expect(`${F}.lost.tomcat === 1 && __G.commander.isOpen && __G.commander.lossMode`, 'the Tomcat lost: counted, the board opens');
    await h.shot('loss-board');
    await h.waitFor(`__G.G.craft === 'heli' && __G.Z.alive && !__G.commander.isOpen`, 60000);
    await h.expect(`__G.G.craft === 'heli' && ${F}.n.tomcat === 1`, 'the hand-on: into the Huey');

    // ---- 11. the wingman brought the Hornet home on the recall (pattern, glideslope, trap) and she parks on deck
    for (let k = 0; k < 75; k++) {   // (polls: a single wait is capped by the browser protocol at 180 s)
      const r = await h.eval('(() => { const w = __G.jetC.wing; return w ? { t: Math.round(__G.war.time), st: w.state, R: w.lso ? Math.round(w.lso.R) : null, y: Math.round(__G.JP.J.pos.y) } : { done: true }; })()');
      if (!r || r.done) break; await h.wait(8000);
    }
    await h.eval('({ alive: __G.JP.alive, park: __G.jetC.park.on, onDeck: __G.war.shipAt(__G.JP.J.pos.x, __G.JP.J.pos.z) === __G.war.carrier, loss: __G.JP.lastLoss })');
    await h.expect('__G.JP.alive && __G.jetC.park.on && __G.war.shipAt(__G.JP.J.pos.x, __G.JP.J.pos.z) === __G.war.carrier', 'the wingman trapped the Hornet and she is parked on the deck');
    await h.eval('(__G.cockpitCam = false, 1)'); await h.wait(500); await h.shot('hornet-recovered');

    // ---- 12. the fleet spent: nothing in reserve, nothing out -> DEFEAT
    await h.eval(`(() => { for (const t of ${F}.types) ${F}.n[t.id] = 0; __G.JP.stow(); __G.jetC.park.on = false; __G.m60C.stow(); __G.m113C.stow(); __G.pool.list.forEach(V => V.stow()); __G.tomcatC.TP.stow(); __G.killPlayerZ('LAST HUEY (TEST)'); return __G.G.over; })()`);
    await h.waitFor("__G.G.state === 'title'", 20000);
    await h.expect("document.querySelector('#title h1').textContent === 'DEFEAT' && /FLEET IS SPENT/.test(document.getElementById('result').textContent)", 'the fleet spent: the war is lost');
    await h.shot('defeat');
  },
};
