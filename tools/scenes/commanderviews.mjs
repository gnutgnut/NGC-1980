// COMMANDER: every switch-in from the command board, looked at. The board itself, then each unit type taken out on the
// ALBATROSS and at the home island in its first-person / cockpit view: the view must be clean (no deck crew, no
// figure standing in the eye). After each switch-in the scene also asks the game what is within 2.5 m in front of the
// eye (deck crew, the world's people, Marines): nothing may be.
//   CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/commanderviews.mjs
export default {
  name: 'commanderviews',
  query: '?debug&auto&kb&peace&res=0.6',
  run: async (h) => {
    await h.waitFor("window.__G && __G.G.state === 'play' && __G.H.landed", 30000); await h.wait(800);
    await h.eval('(__G.G.bench = true, __G.G.extImmune = true, __G.G.mat = 900, 1)');
    await h.key('tap', 'Backslash'); await h.wait(600); await h.shot('board'); await h.key('tap', 'Backslash'); await h.wait(300);
    const cases = [['marine', 'ship'], ['m151', 'ship'], ['m35', 'ship'], ['m113', 'ship'], ['m60', 'ship'], ['heli', 'ship'], ['jet', 'ship'],
      ['marine', 'island'], ['m151', 'island'], ['m35', 'island'], ['m60', 'island'], ['m113', 'island'], ['heli', 'island'], ['tomcat', 'ship']];
    for (const [id, where] of cases) {
      await h.eval(`(() => { for (const d of [...__G.JETS, ...__G.TOMCATS]) if (d !== __G.crafts.active && d.present() && (d.JP || d.TP).A?.cat !== undefined) {} return 1; })()`);
      if (id === 'jet' || id === 'tomcat') await h.eval('(() => { for (const d of [...__G.JETS, ...__G.TOMCATS]) if (d.present() && d !== __G.crafts.active) { (d.JP || d.TP).stow(); d.park.on = false; d.wing = null; __G.fleet.give(d.craft); } return 1; })()');   // (cat 1 clear)
      await h.eval(`__G.commander.deploy(${JSON.stringify(id)}, ${where === 'ship' ? '"ship"' : '__G.HOME_B.isl.name'}, true)`);
      await h.wait(1500);
      await h.eval('(__G.cockpitCam = true, { craft: __G.crafts.active.id, view: __G.crafts.active.view, fp: __G.crafts.active.firstPerson() })');
      await h.wait(2500);
      const r = await h.eval('__G.eyeClear ? __G.eyeClear() : null');
      await h.expect(`__G.eyeClear().clear`, `${id} at the ${where}: nobody in front of the eye`);
      await h.shot(`${id}-${where}`);
      void r;
    }
  },
};
