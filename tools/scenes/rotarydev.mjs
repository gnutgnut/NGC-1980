// The rotary AI preview page (game/dev/rotary.html): model turntables and each aircraft's whole mission, stepped
// deterministically (paused page, __R.run / runUntil) and photographed at the interesting moments.
// ROTARY=ch46|mv22|wasp node snap.mjs scenes/rotarydev.mjs   (default: all)
const ONLY = process.env.ROTARY;
const VIEWS = [['front34', [Math.PI + 0.65, 0.18, 30]], ['side', [-Math.PI / 2, 0.05, 30]], ['rear34', [0.6, 0.22, 30]], ['top', [0.001, 1.35, 34]], ['low_rear', [0.25, 0.05, 20]]];
const U = '__R.unit.U';
const MISSIONS = {
  ch46: { states: [], shots: [
    ['01-deck', 'true', 'deck', 0], ['01b-boarding', `${U}.squad.figs.filter(F => F.st === 'embark' && F.delay < 0).length > 3`, 'deck'], ['01c-lse-signal', `${U}.embark.crewMode(0) === 'signal'`, 'deck'], ['02-liftoff', `${U}.AI.phase === 'lift' && ${U}.S.agl > 2`, 'deck'], ['03-transit', `${U}.AI.phase === 'transit' && ${U}.AI.cmd.dist < 330`, 'chase'],
    ['04-flare', `${U}.AI.phase === 'transit' && ${U}.AI.cmd.dist < 60`, 'lz'], ['05-touchdown', `${U}.AI.phase === 'ground'`, 'lz'], ['06-ramp', `${U}.ramp > 0.9`, 'lz'],
    ['07a-squad-run', `${U}.deployed && ${U}.unloadT > 1.2`, 'squad'], ['07-squad-out', `${U}.squad.holding > 4`, 'lz'], ['08-squad-close', `${U}.squad.holding > 10`, 'squad'],
    ['09-liftoff2', `${U}.AI.phase === 'rtb'`, 'lz'], ['10-deck-final', `${U}.AI.phase === 'descend2'`, 'deck'], ['11-parked', `__R.unit.done()`, 'deck']] },
  mv22: { states: [['airplane', { nac: 0, gear: 0, ramp: 0, flap: 0 }], ['conversion', { nac: 0.8, gear: 1, ramp: 0, flap: 1 }], ['folded', { nac: 0, gear: 1, ramp: 0, fold: 1, nr: 0 }]], shots: [
    ['01-deck', 'true', 'deck', 0], ['01b-boarding', `${U}.squad.figs.filter(F => F.st === 'embark' && F.delay < 0).length > 3`, 'deck'], ['01c-lse-signal', `${U}.embark.crewMode(0) === 'signal'`, 'deck'], ['02-liftoff', `${U}.AI.phase === 'lift' && ${U}.S.agl > 2`, 'deck'], ['03-conversion', `${U}.S.nac < 1.1 && ${U}.S.nac > 0.8`, 'side'],
    ['04-airplane', `${U}.S.nac < 0.03 && ${U}.S.ias > 190`, 'chase'], ['05-reconvert', `${U}.AI.phase === 'transit' && ${U}.S.nac > 1.2 && ${U}.S.ias > 60`, 'side'],
    ['06-final', `${U}.AI.phase === 'transit' && ${U}.AI.cmd.dist < 70`, 'lz'], ['07-touchdown', `${U}.AI.phase === 'ground'`, 'lz'], ['08-troopers', `${U}.squad.holding > 3`, 'squad'],
    ['09-troopers-hold', `${U}.squad.holding > 10`, 'lz'], ['10-rtb', `${U}.AI.phase === 'rtb' && ${U}.S.nac < 0.5`, 'chase'], ['11-deck-final', `${U}.AI.phase === 'descend2'`, 'deck'],
    ['12-folding', `${U}.fold > 0.6`, 'deck'], ['13-stowed', `__R.unit.done()`, 'deck']] },
  wasp: { states: [['vanes', { pitch: 0.8, roll: -0.6, gear: 0, firing: false }]], expects: [[`__R.unit.U.ws.every(w => !w.dead) && !__R.unit.U.amb.dead`, 'wasp: all five flew 90 s without a crash']], shots: [
    ['01-inbound', '__R.simT > 6', 'chase'], ['02-swarm', '__R.simT > 18', 'orbit'], ['03-strafe', `__R.unit.U.ws.some(w => w.AI.mode === 'strafe' && w.AI.fire)`, 'chase'],
    ['04-ambusher', '__R.simT > 30', 'chase'], ['05-later', '__R.simT > 60', 'chase'], ['06-end', '__R.simT > 90', 'orbit']] },
};
export default async function (h) {
  for (const ac of ONLY ? [ONLY] : Object.keys(MISSIONS)) {
    const M = MISSIONS[ac];
    // turntable (+ extra model states)
    await h.goto(`dev/rotary.html?ac=${ac}&view=model&paused&ui=0`); await h.waitFor('window.__R', 10000); await h.wait(500);
    for (const [n, [yaw, pitch, dist]] of VIEWS) { await h.eval(`(Object.assign(__R.cam, { yaw: ${yaw}, pitch: ${pitch}, dist: ${dist} }), __R.tm.update(0.05, 1), __R.render(), true)`); await h.wait(200); await h.shot(`${ac}-model-${n}`); }
    for (const [n, s] of M.states) { await h.eval(`(Object.assign(__R.tm.state, ${JSON.stringify(s)}), Object.assign(__R.cam, { yaw: ${Math.PI + 0.7}, pitch: 0.25, dist: 32 }), __R.tm.update(0.05, 1), __R.render(), true)`); await h.wait(200); await h.shot(`${ac}-model-${n}`); }
    // the mission
    await h.goto(`dev/rotary.html?ac=${ac}&paused`); await h.waitFor('window.__R', 10000); await h.wait(500);
    for (const [name, cond, cam, max = 400] of M.shots) {
      const t = await h.eval(`(__R.camMode = '${cam}', __R.runUntil(() => ${cond}, ${max}), __R.render(), +__R.simT.toFixed(1))`);
      await h.wait(200); await h.shot(`${ac}-${name}`);
    }
    if (M.expects) { for (const [e, l] of M.expects) await h.expect(e, l); continue; }
    await h.expect(`${U}.parked && !${U}.dead`, `${ac}: mission flown, back on the deck`);
    await h.expect(`${U}.squad.holding >= 11`, `${ac}: squad holding the pad`);
  }
}
