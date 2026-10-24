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
    await h.eval(`(__G.G.bench = true, __G.G.extImmune = true, window.__t0 = ${W}.time, { n: ${F}.n, craft: __G.G.craft, mat: __G.G.mat })`);
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
    await h.expect(`__G.G.craft === 'm60' && ${F}.n.m60 === 0 && !__G.crafts.active.dead && __G.crafts.active !== __G.m60C && __G.m60C.dead && Math.hypot(__G.crafts.active.frame({}).x - __G.HOME_B.isl.pad.x, __G.crafts.active.frame({}).z - __G.HOME_B.isl.pad.z) < 60`, 'a fresh M60A3 (a new hull: the wreck stays) at the home island motor pool (1 -> 0)');
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

    // ---- 12. several of a type out (COMMANDER part 2): Hueys, Hornets, M60s; the crew picks a free spot; deliveries
    // come out of the reserve; the war hits units you are not in; the board on a game pad
    await h.eval('(__G.G.mat = 600, 1)');   // (materiel for the extra airframes this part buys)
    // a. a second Huey on the ALBATROSS while the first sits on the home island pad
    await h.eval(`(window.__h0 = ${F}.n.heli, __G.commander.deploy("heli", "ship", true), { n: ${F}.n.heli, slots: __G.HUEYS.length, st: __G.roster[0].status() })`); await h.wait(600);
    await h.expect(`__G.G.craft === 'heli' && __G.HUEYS.length === 1 && ${F}.n.heli === __h0 - 1 && __G.roster[0].outCount() === 2 && __G.war.shipAt(__G.H.pos.x, __G.H.pos.z) === __G.war.carrier && Math.hypot(__G.HUEYS[0].H.pos.x - __G.HOME_B.isl.pad.x, __G.HUEYS[0].H.pos.z - __G.HOME_B.isl.pad.z) < 8`, 'a second Huey out on the ALBATROSS (the first stays on the island pad)');
    // b. a third one on the deck: a different spot from the second (and clear of the parked Hornet)
    await h.eval(`(window.__p2 = __G.H.pos.clone(), __G.commander.deploy("heli", "ship", true), 1)`); await h.wait(600);
    await h.eval('({ main: __G.H.pos.toArray().map(Math.round), others: __G.HUEYS.map(s => s.H.pos.toArray().map(Math.round)), jet: __G.JP.J.pos.toArray().map(Math.round), n: __G.fleet.n.heli })');
    await h.expect(`__G.HUEYS.length === 2 && ${F}.n.heli === __h0 - 2 && __G.war.shipAt(__G.H.pos.x, __G.H.pos.z) === __G.war.carrier && Math.hypot(__G.H.pos.x - __p2.x, __G.H.pos.z - __p2.z) > 12 && __G.H.pos.distanceTo(__G.JP.J.pos) > 5`, 'a third Huey on another deck spot (15 m from the second, clear of the parked Hornet)');
    await h.expect(`!__G.heliSpotFree(__G.JP.J.pos.x, __G.JP.J.pos.z, null)`, 'a spot under a parked jet is not free');
    await h.wait(800); await h.shot('three-hueys');
    // c. ENTER on the Huey row while in one: the next Huey (swapped in where she stands)
    await h.eval(`(window.__p3 = __G.H.pos.clone(), __G.commander.deploy("heli"), 1)`); await h.wait(600);
    await h.expect(`__G.G.craft === 'heli' && __G.HUEYS.length === 2 && __G.H.pos.distanceTo(__p3) > 10 && __G.HUEYS.some(s => s.H.pos.distanceTo(__p3) < 1)`, 'switched to the next Huey; the one you left stays parked where she was');
    // d. the Huey you leave in the air lands on a free spot: in the air off the deck, then out on foot (a Marine)
    await h.eval(`(() => { const c = ${W}.carrier, H = __G.H; const x = c.p.x - Math.sin(c.yaw) * 20 + Math.cos(c.yaw) * 80, z = c.p.z - Math.cos(c.yaw) * 20 - Math.sin(c.yaw) * 80;
      H.reset(new __G.THREE.Vector3(x, 45, z), c.yaw, false, 1); H.vel.set(c.v.x, 0, c.v.z); __G.HI.setCollective(0.45); return [x, z]; })()`);
    await h.wait(500);
    await h.eval('__G.commander.deploy("marine", "ship")'); await h.wait(600);
    await h.eval('({ craft: __G.G.craft, ai: __G.heliAI.phase, spot: __G.heliAI.spotKey, taken: __G.HUEYS.map(s => __G.war.shipAt(s.H.pos.x, s.H.pos.z) === __G.war.carrier) })');
    await h.expect(`__G.G.craft === 'foot' && __G.heliAI.phase !== 'off' && !!__G.heliAI.spotKey`, 'on foot; the Huey crew flies her to a spot');
    await h.expect(`__G.war.ext.some(t => t.air && t.name === 'UH-1H HUEY')`, 'the Huey flown by her crew is a target in the war (in the air)');
    await h.waitFor('__G.heliAI.phase === "off" || !__G.Z.alive', 240000);
    await h.eval('({ pos: __G.H.pos.toArray().map(Math.round), others: __G.HUEYS.map(s => s.H.pos.toArray().map(Math.round)), d: Math.min(...__G.HUEYS.map(s => Math.round(s.H.pos.distanceTo(__G.H.pos)))) })');
    await h.expect(`__G.Z.alive && __G.H.landed && __G.war.shipAt(__G.H.pos.x, __G.H.pos.z) === __G.war.carrier && __G.HUEYS.every(s => s.H.pos.distanceTo(__G.H.pos) > 12) && __G.H.pos.distanceTo(__G.JP.J.pos) > 5`, 'the crew landed her on a free deck spot (clear of the other Hueys and the Hornet)');
    await h.wait(500); await h.shot('free-spot');
    // e. the war hits units you are not in: blasts on the Huey parked on the island and on the Hornet parked on deck
    await h.eval(`(__G.G.extImmune = false, window.__lh = ${F}.lost.heli, window.__lj = ${F}.lost.jet, 1)`);   // (the units out were kept alive so far: the steps above test other things)
    await h.expect(`__G.war.ext.length >= 6 && __G.war.ext.some(t => t.name === 'HORNET') && __G.war.ext.some(t => /M60/.test(t.name)) && __G.war.ext.some(t => /M151/.test(t.name))`, 'parked units are targets: Hueys, the Hornet, the M60, the motor pool');
    await h.eval(`(() => { const s = __G.HUEYS.find(s => Math.hypot(s.H.pos.x - __G.HOME_B.isl.pad.x, s.H.pos.z - __G.HOME_B.isl.pad.z) < 20); window.__isl = s; for (let k = 0; k < 8 && s.z.alive; k++) __G.war.blast(s.H.pos.x, s.H.pos.y, s.H.pos.z, 6, 12, 2); return { alive: s.z.alive, acc: s.z.hitAcc }; })()`);
    await h.waitFor('!__G.HUEYS.includes(__isl)', 20000);
    await h.expect(`${F}.lost.heli === __lh + 1 && !__G.HUEYS.includes(__isl) && __G.roster[0].outCount() === 2`, 'the Huey parked on the island, shot up: lost to the fleet (counted), the slot gone');
    await h.eval(`(() => { const J = __G.JP.J; for (let k = 0; k < 8 && __G.JP.alive; k++) __G.war.blast(J.pos.x, J.pos.y, J.pos.z, 6, 12, 2); return { alive: __G.JP.alive }; })()`);
    await h.wait(600);
    await h.expect(`${F}.lost.jet === __lj + 1 && !__G.JP.alive && !__G.roster[1].out()`, 'the Hornet parked on deck, shot up: lost to the fleet');
    await h.eval('({ feed: [...document.querySelectorAll("#feed div, #feed p, #feed span")].map(e => e.textContent).slice(0, 6), lost: __G.fleet.lost })');
    // f. two Hornets: one off the cat and flying, a second on the cat (a new airframe), then back to the first
    await h.eval(`(window.__j0 = ${F}.n.jet, __G.commander.deploy("jet", "ship"), 1)`); await h.wait(700);
    await h.eval(`(() => { const J = __G.crafts.active.JP.J, c = ${W}.carrier; J.cat = null; J.launchBar = false; J.reset(c.p.x - Math.sin(c.yaw) * 600, 0, c.p.z - Math.cos(c.yaw) * 600, c.yaw, { running: true, airborne: true, alt: 260, speed: 85 }); J.gearCmd = 0; J.gear = 0; J.flapSel = 0; for (const e of J.eng) e.n = 0.85; __G.crafts.active.JP.thr = 0.85; return __G.crafts.active.id; })()`);
    await h.wait(500);
    await h.eval('__G.commander.deploy("jet", "ship", true)'); await h.wait(800);
    await h.eval('({ id: __G.crafts.active.id, jets: __G.JETS.map(d => [d.id, d.present(), d.status()]), n: __G.fleet.n.jet })');
    await h.expect(`__G.G.craft === 'jet' && __G.crafts.active.id !== 'jet' && !!__G.crafts.active.JP.J.cat && __G.roster[1].outCount() === 2 && !!__G.jetC.wing && ${F}.n.jet <= Math.max(0, __j0 - 1)`, 'a second Hornet on cat 1 (another airframe); the wingman flies the first');
    await h.wait(800); await h.shot('second-hornet');
    await h.eval('__G.commander.deploy("jet")'); await h.wait(700);
    await h.expect(`__G.crafts.active === __G.jetC && __G.JETS.some(d => d !== __G.jetC && d.present() && d.park.on)`, 'ENTER on the Hornet row: back to the first one; the second parks on the cat');
    // g. a second M60 at the home island (N), the first still out
    await h.eval(`(window.__m60o = __G.roster[3].outCount(), __G.commander.deploy("m60", __G.HOME_B.isl.name, true))`); await h.wait(700);
    await h.expect(`__G.G.craft === 'm60' && __G.roster[3].outCount() === __m60o + 1 && __G.roster[3].outCount() >= 2`, 'a second M60A3 out at the home island (two hulls out)');
    // h. deliveries come out of the reserve: 0 (an M113 by LCM-8), 7-1 (an M151 by CH-46)
    await h.eval(`(window.__d = { m113: ${F}.n.m113, m151: ${F}.n.m151, mat: __G.G.mat, runs: __G.armDelivery.runs.length }, __G.deliverArmour('m113'), __G.deliverVehicle('m151'), { n: ${F}.n, mat: __G.G.mat, runs: __G.armDelivery.runs.length })`);
    await h.expect(`__G.armDelivery.runs.length === __d.runs + 1 && __G.armDelivery.runs[__G.armDelivery.runs.length - 1].def !== __G.m113C && (${F}.n.m113 === __d.m113 - 1 || (__d.m113 === 0 && __G.G.mat <= __d.mat - 30))`, 'an M113A2 by LCM-8: a new hull, one out of the reserve (or bought)');
    await h.expect(`${F}.n.m151 === __d.m151 - 1 || (__d.m151 === 0 && __G.G.mat <= __d.mat - 40)`, 'an M151A2 by CH-46: one out of the reserve (or bought)');
    // i. the board on a game pad: hold BACK, D-pad down, B closes
    await h.eval('(__G.keyboardOnly = false, 1)');   // (the scenes run keyboard-only: ?kb)
    await h.eval(`(() => { window.__pad = { id: 'Xbox 360 Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), timestamp: 0 };
      navigator.getGamepads = () => [window.__pad]; window.__padSet = (i, on) => { __pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; }; return 1; })()`);
    await h.eval('(__padSet(8, true), 1)'); await h.waitFor('__G.commander.isOpen', 20000); await h.eval('(__padSet(8, false), window.__sel0 = __G.commander.sel, 1)');
    await h.expect('__G.commander.isOpen', 'holding BACK on the pad opens the board');
    await h.wait(400); await h.eval('(__padSet(13, true), 1)'); await h.waitFor('__G.commander.sel !== __sel0', 10000); await h.eval('(__padSet(13, false), 1)');
    await h.expect('__G.commander.sel === (__sel0 + 1) % __G.roster.length', 'D-pad down selects the next row');
    await h.wait(300); await h.shot('pad-board');
    await h.eval('(__padSet(1, true), 1)'); await h.waitFor('!__G.commander.isOpen', 10000); await h.eval('(__padSet(1, false), navigator.getGamepads = () => [], __G.keyboardOnly = true, 1)');
    await h.expect('!__G.commander.isOpen', 'B on the pad closes the board');

    // ---- 13. the fleet spent: nothing in reserve, nothing out -> DEFEAT
    await h.eval(`(() => { for (const t of ${F}.types) ${F}.n[t.id] = 0; for (const d of [...__G.JETS, ...__G.TOMCATS]) { (d.JP || d.TP).stow(); d.park.on = false; d.wing = null; } for (const d of [...__G.ARMS.m60, ...__G.ARMS.m113]) d.stow(); __G.armDelivery.clear(); __G.pool.list.forEach(V => V.stow()); __G.HUEYS.forEach(s => { s.z.alive = false; }); __G.killPlayerZ('LAST HUEY (TEST)'); __G.checkSpent(); return __G.G.over; })()`);
    await h.waitFor("__G.G.state === 'title'", 20000);
    await h.expect("document.querySelector('#title h1').textContent === 'DEFEAT' && /FLEET IS SPENT/.test(document.getElementById('result').textContent)", 'the fleet spent: the war is lost');
    await h.shot('defeat');
  },
};
