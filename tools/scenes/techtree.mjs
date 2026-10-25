// TECH TREE in the game: the default start locks what has to be researched (the orders say what they need, the board
// greys the rows, the M60A3 is not parked), the RESEARCH page (T on the board / SHIFT+\) starts a programme that runs
// on war time and opens the gate when it is done, cancel refunds, the enemy researches by its policy, and ?debug
// without ?tech is exactly the old game (every gate open, no upgrades). All waits are on game state, not wall time.
export default {
  name: 'techtree',
  query: '?debug&auto&kb&peace&res=0.45&tech=default',
  run: async (h) => {
    const T1 = '__G.war.tech[1]', T2 = '__G.war.tech[2]', msg = "document.getElementById('msg').textContent";
    await h.waitFor("window.__G && __G.G.state === 'play' && __G.H.landed", 20000); await h.wait(500);
    await h.expect(`${T1}.mode === 'default' && ${T2}.mode === 'default' && __G.tech === __G.war.tech`, '?tech=default: both trees on their opening sets; __G.tech is the war\'s');
    await h.expect(`__G.war.allow(1, 'drone') && __G.war.allow(1, 'aa') && __G.war.allow(1, 'heli') && __G.war.allow(1, 'jet') && !__G.war.allow(1, 'm60') && !__G.war.allow(1, 'escort')`, 'the opening is open (CH-46, AA, Huey, Hornet), the rest is locked');
    await h.expect('!__G.m60C.present() && !__G.m113C.present()', 'no M60A3 / M113A2 parked before their research');
    // ---- the orders say what they need
    await h.eval('(__G.G.mat = 400, __G.command(9), 1)'); await h.wait(150);
    await h.expect(`/NEEDS HEAVY ARMOUR RESEARCH/.test(${msg})`, '9 (M60A3): NEEDS HEAVY ARMOUR RESEARCH');
    await h.expect(`/NEEDS FLEET AIR DEFENCE/.test(__G.war.sendEscort(null)) && /NEEDS SKY CARRIER PROGRAMME/.test(__G.war.upgradeCarrier()) && __G.G.mat === 400`, 'Tomcat escort and sky carrier refit locked, nothing paid');
    await h.eval('(__G.command(3), 1)'); await h.wait(150);
    await h.expect(`/NEW HELICOPTER/.test(${msg}) && __G.G.mat === 340`, '3 (a new Huey) still works: in the opening set');
    // ---- the board: locked rows
    await h.key('tap', 'Backslash'); await h.wait(400);
    await h.expect('__G.commander.isOpen && [...document.querySelectorAll("#cmdBoard .row.lock")].length >= 3', 'the board greys the locked types (Tomcat, M60A3, M113A2)');
    await h.expect('/NEEDS TOMCAT CONVERSION RESEARCH/.test(document.getElementById("cmdBoard").textContent) && /RESEARCH <b>IDLE/.test(document.querySelector("#cmdBoard .sub").innerHTML)', 'the rows say what they need; the sub line shows research');
    await h.shot('board-locked');
    // ---- T: the research page
    await h.key('tap', 'KeyT'); await h.wait(500);
    await h.expect('!__G.commander.isOpen && __G.techUI.isOpen && document.getElementById("techBoard").classList.contains("on")', 'T on the board opens the RESEARCH page');
    await h.shot('research-page');
    await h.eval(`(__G.techUI.select('p.cap'), window.__m0 = __G.G.mat, 1)`); await h.key('tap', 'Enter'); await h.wait(300);
    await h.expect(`${T1}.current && ${T1}.current.id === 'p.cap' && Math.abs(__G.G.mat - (__m0 - 50)) < 2`, 'ENTER starts FLEET AIR DEFENCE, 50 materiel paid (the islands still produce meanwhile)');
    await h.eval(`(window.__w0 = __G.war.time, window.__p0 = ${T1}.progress, 1)`);
    await h.waitFor('__G.war.time > __w0 + 3', 90000);
    await h.eval(`({ dt: __G.war.time - __w0, dp: ${T1}.progress - __p0, want: (__G.war.time - __w0) / 45 })`);
    await h.expect(`Math.abs((${T1}.progress - __p0) - (__G.war.time - __w0) / 45) < 0.02`, 'research runs on war time (progress = war seconds / 45)');
    await h.shot('research-under-way');
    // fast forward the rest of the 45 s on the tree's own clock (headless runs at a few fps), then the gate is open
    await h.eval(`(${T1}.update(${T1}.remaining + 0.01), 1)`); await h.wait(600);
    await h.expect(`${T1}.has('p.cap') && __G.war.allow(1, 'escort') && /RESEARCH COMPLETE: FLEET AIR DEFENCE/.test(document.getElementById('feed').textContent)`, 'done: Tomcat escorts allowed, the feed says so');
    await h.expect(`/TOMCAT .* TO THE CAT/.test(__G.war.sendEscort(null))`, '4 now launches a Tomcat escort');
    await h.shot('research-done');
    // ---- cancel refunds; X key
    await h.eval(`(__G.techUI.select('p.amtrac'), 1)`); await h.key('tap', 'Enter'); await h.wait(200);
    await h.eval('(window.__m1 = __G.G.mat, 1)');
    await h.key('tap', 'KeyX'); await h.wait(200);
    await h.expect(`!${T1}.current && Math.abs(__G.G.mat - (__m1 + 40)) < 2 && !${T1}.has('p.amtrac')`, 'X cancels with a full refund');
    // the arrow keys walk the board
    await h.eval(`(__G.techUI.select('p.huey'), 1)`); await h.key('tap', 'ArrowRight'); await h.key('tap', 'ArrowDown'); await h.wait(200);
    await h.eval('({ sel: __G.techUI.sel })');
    await h.expect(`__G.techUI.sel !== 'p.huey' && ${T1}.node(__G.techUI.sel).tier === 1`, 'arrows move the selection across tiers');
    // research the armour, then the M60A3 order goes through to the landing craft
    await h.eval(`(() => { for (const id of ['p.amtrac', 'p.mbt']) { __G.war.research(1, id); ${T1}.update(1e3); } return [...${T1}.done]; })()`);
    await h.expect(`__G.war.allow(1, 'm60') && __G.war.allow(1, 'm113')`, 'AMPHIBIOUS ARMOUR + HEAVY ARMOUR researched');
    await h.wait(400); await h.shot('research-armour');
    await h.key('tap', 'Escape'); await h.wait(300);
    await h.expect('!__G.techUI.isOpen && __G.G.state === "play"', 'ESC closes the page (not the pause menu)');
    // ---- the enemy researches by its policy (peace: its 2 s tick is off here, so one tick by hand)
    await h.eval(`(__G.war.E.mat = 200, __G.war.researchTick(2, __G.PL), { cur: ${T2}.current && ${T2}.current.id, mat: __G.war.E.mat })`);
    await h.expect(`${T2}.current && ${T2}.current.id === 'e.reaper' && __G.war.E.mat === 170`, 'the RUNAWAY commander starts its first research (MQ-9 REAPER, 30 materiel)');
    await h.eval(`(${T2}.update(1e3), 1)`); await h.wait(300);
    await h.expect(`/INTEL: THE RUNAWAY HAVE FIELDED MQ-9 REAPER/.test(document.getElementById('feed').textContent)`, 'the feed reports what the enemy fields');
    // ---- the map's order line
    await h.key('tap', 'KeyM'); await h.wait(700); await h.shot('map-orders');
    await h.key('tap', 'KeyM'); await h.wait(200);
    // ---- SHIFT+\ opens the page from anywhere
    await h.page.keyboard.down('ShiftLeft'); await h.key('tap', 'Backslash'); await h.page.keyboard.up('ShiftLeft'); await h.wait(400);
    await h.expect('__G.techUI.isOpen', 'SHIFT+\\ opens the RESEARCH page');
    await h.shot('research-intel');
    await h.key('tap', 'Escape'); await h.wait(200);
    // ---- the war runs on with the enemy researching: 300 war seconds in the page (dt 0.1, the commander's ticks on)
    await h.eval(`(() => { const W = __G.war, t0 = W.time, m0 = W.E.mat; W.E.mat += 300; let err = null;
      try { for (let i = 0; i < 3000; i++) W.update(0.1, __G.PL, false); } catch (e) { err = String(e && e.stack || e).slice(0, 300); }
      window.__ff = { err, dt: Math.round(W.time - t0), log: ${T2}.log.map(l => l.e + ' ' + l.id + ' @' + Math.round(l.t)), cur: ${T2}.current && ${T2}.current.id, mat: Math.round(W.E.mat), units: W.units.filter(u => u.side === 2).map(u => u.type) };
      return window.__ff; })()`);
    await h.expect('!__ff.err && __ff.dt >= 299', 'the war ran 300 s on the default trees without an error');
    await h.expect(`${T2}.log.filter(l => l.e === 'done').length >= 3`, 'the RUNAWAY researched on its own (3+ programmes in 300 s)');
    await h.wait(500); await h.shot('after-300s');
    // ---- ?debug without ?tech: the old game
    await h.goto('?debug&auto&kb&peace&res=0.45');
    await h.waitFor("window.__G && __G.G.state === 'play' && __G.H.landed", 20000); await h.wait(500);
    await h.expect(`${T1}.mode === 'all' && ${T2}.mode === 'all' && __G.war.researchPolicy[2] === null`, '?debug alone: both trees all, no enemy research');
    await h.expect(`['drone','aa','heli','jet','escort','m60','m113','tomcat','sky','logistics','m151','m35','marine'].every(k => __G.war.allow(1, k)) && ['transport','gunship','aa','freighter','reaper','hovertank','lance','shrike','shahed','mbt','battleship'].every(k => __G.war.allow(2, k))`, 'every gate open on both sides');
    await h.expect(`['econ.mat','econ.fuel','cap.time','sight','aa.build','aa.hp','rebuild','ship.repair','bship.rate','hp.drone','hp.gunship','medic'].every(k => __G.war.techMod(1, k) === 1 && __G.war.techMod(2, k) === 1)`, 'no upgrades: every mod 1');
    await h.expect('__G.m60C.present() && __G.m113C.present()', 'the M60A3 and M113A2 parked as before');
  },
};
