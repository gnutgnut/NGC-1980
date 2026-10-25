// PARITY: the AH-1T SeaCobra on the rotary preview page (game/dev/rotary.html?ac=cobra): close turntable views at
// several angles, model states (turret slewed and firing, rockets leaving the pods, rotor stopped), then the whole
// sortie stepped deterministically (paused page, __R.runUntil) and photographed: deck, lift-off, NOE transit, a
// pop-up gun attack, a running-fire rocket pass, the break, the air target (turret on a WASP), home to the deck.
//   COBRA_PART=model|mission node snap.mjs scenes/cobra.mjs   (default: both)
const PART = process.env.COBRA_PART;
const VIEWS = [['front34', [Math.PI + 0.65, 0.16, 15]], ['side', [-Math.PI / 2, 0.04, 17]], ['rear34', [0.6, 0.22, 16]], ['top', [0.001, 1.35, 20]], ['low_front', [Math.PI - 0.35, -0.05, 9]],
  ['cockpit', [Math.PI + 1.1, 0.25, 6.5]], ['tail', [0.9, 0.15, 7]], ['other_side', [Math.PI / 2, 0.08, 14]]];
const U = '__R.unit.U';
const STATES = [
  ['turret_firing', { turret: { yaw: -0.9, pitch: -0.35 }, firing: true, rocketT: 9 }, [Math.PI + 0.9, 0.1, 9]],
  ['rockets', { turret: { yaw: 0, pitch: -0.1 }, firing: false, rocketT: 0.05 }, [Math.PI + 0.5, 0.12, 12]],
  ['rotor_stopped', { nr: 0, run: false, firing: false, rocketT: 9, turret: { yaw: 0, pitch: -0.1 } }, [Math.PI + 0.65, 0.3, 17]],
];
const SHOTS = [
  ['01-deck', 'true', 'deck', 0], ['02-liftoff', `${U}.S.agl > 4`, 'deck'], ['03-transit', `${U}.AI.mode === 'transit' && ${U}.S.ias > 70`, 'chase'],
  ['04-approach', `${U}.AI.mode === 'approach'`, 'chase'], ['05-popup', `${U}.AI.mode === 'popup' && ${U}.firing`, 'orbit'], ['06-popup-side', `${U}.AI.mode === 'popup' && ${U}.firing`, 'side'],
  ['07-run-rockets', `${U}.AI.mode === 'run' && ${U}.rocketT < 0.2`, 'chase'], ['08-run-close', `${U}.AI.mode === 'run' && ${U}.firing`, 'orbit'], ['09-break', `${U}.AI.mode === 'break'`, 'chase'],
  ['10-air-target', `__R.simT > 160 && ${U}.firing`, 'orbit'], ['11-home', `${U}.AI.mode === 'home' && ${U}.S.ias > 60`, 'chase'], ['12-deck-final', `__R.unit.done()`, 'deck', 200],
];
export default async function (h) {
  if (PART !== 'mission') {
    await h.goto('dev/rotary.html?ac=cobra&view=model&paused&ui=0&res=0.45'); await h.waitFor('window.__R', 15000); await h.wait(500);
    for (const [n, [yaw, pitch, dist]] of VIEWS) { await h.eval(`(Object.assign(__R.cam, { yaw: ${yaw}, pitch: ${pitch}, dist: ${dist} }), __R.tm.update(0.05, 1), __R.render(), true)`); await h.wait(200); await h.shot(`cobra-model-${n}`); }
    for (const [n, s, [yaw, pitch, dist]] of STATES) { await h.eval(`(Object.assign(__R.tm.state, ${JSON.stringify(s)}), Object.assign(__R.cam, { yaw: ${yaw}, pitch: ${pitch}, dist: ${dist} }), __R.tm.update(0.05, 1.01), __R.render(), true)`); await h.wait(200); await h.shot(`cobra-model-${n}`); }
  }
  if (PART !== 'model') {
    await h.goto('dev/rotary.html?ac=cobra&paused&res=0.45'); await h.waitFor('window.__R', 15000); await h.wait(500);
    for (const [name, cond, cam, max = 260] of SHOTS) {
      await h.eval(`(__R.camMode = '${cam}', Object.assign(__R.cam, { yaw: 2.2, pitch: 0.18, dist: 26 }), __R.runUntil(() => ${cond}, ${max}), __R.render(), +__R.simT.toFixed(1))`);
      await h.wait(200); await h.shot(`cobra-${name}`);
    }
    await h.expect(`!${U}.dead`, 'cobra: flew the sortie without crashing');
    await h.expect(`__R.unit.stats().gun > 100 && __R.unit.stats().rockets >= 6`, 'cobra: fired the gun and rockets');
    await h.expect(`__R.unit.stats().hits > 10`, 'cobra: rounds hit the targets');
    await h.expect(`__R.unit.done()`, 'cobra: back over the deck');
  }
}
