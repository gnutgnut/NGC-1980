#!/usr/bin/env node
// embarkbench.mjs - deck ops and troop loading, the whole unit in node (flight model + AI + model + squad + deck crew,
// embark.js): the CH-46 on the ALBATROSS and the MV-22 on the KRAKEN in the dev world. The stick waits in two files
// clear of the rotors, files up the ramp after the ramp is down, the ramp comes up, the chockers run clear, the LSE
// signals, it lifts; at the LZ the troops come off; back on deck the chockers go in. Three.js is mapped to the vendored
// build (the units build their meshes), nothing is rendered.
//   node tools/embarkbench.mjs [--v]
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
const THREE_URL = pathToFileURL(new URL('../game/vendor/three.module.min.js', import.meta.url).pathname).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) { return s === 'three' ? { url: ${JSON.stringify(THREE_URL)}, shortCircuit: true } : n(s, c); }`));
const { table } = await import('./rotarykit.mjs');
const ROT = '../game/js/units/air/rotary/';
const THREE = await import('three');
const { createDevWorld } = await import(ROT + 'devworld.js');
const { createCH46Unit } = await import(ROT + 'ch46unit.js');
const { createMV22Unit } = await import(ROT + 'mv22unit.js');
const V = process.argv.includes('--v'), T = table(), DT = 1 / 30;

async function run(name, mk, maxT) {
  const W = createDevWorld(), scene = new THREE.Group(), r = mk(W, scene), U = r.U, Q = U.squad;
  const ev = {}, mark = k => { if (ev[k] === undefined) ev[k] = +t.toFixed(1); };
  let t = 0, minRotorGap = 1e9, crewOff = 0, maxFigY = -1e9, lastPhase = '';
  for (; t < maxT && !U.parked && !U.dead; t += DT) {
    U.update(DT, t); W.move(DT);
    const ph = U.AI.phase; if (ph !== lastPhase) { if (V) console.log(t.toFixed(1), ph, 'ramp', U.ramp.toFixed(2), 'squad', Q.state); lastPhase = ph; }
    if (ph === 'spool') {
      if (Q.figs.some(F => F.st === 'embark' && F.delay <= 0)) mark('firstMoves');
      if (U.ramp > 0.95) mark('rampDown');
      if (Q.state === 'aboard') mark('allAboard');
      // the stick waits / jogs clear of the rotor discs (CH-46: both rotors 7.62 m; MV-22: the proprotors, 5.8 m, at x +-7)
      for (const F of Q.figs) if (F.st === 'stick') {
        const lx = F.l.x, lz = F.l.z, gap = r.discs.reduce((m, [hx, hz, R]) => Math.min(m, Math.hypot(lx - hx, lz - hz) - R), 1e9);
        minRotorGap = Math.min(minRotorGap, gap);
        const dk = W.toLocal(F.x, F.z); if (r.deckOf(W, F)) crewOff++;
      }
      for (const F of Q.figs) if (F.st === 'stick' || (F.st === 'embark' && F.wp < 2)) maxFigY = Math.max(maxFigY, Math.abs(F.y - r.deckY(W)));
    }
    if (ph === 'lift') { mark('lift'); ev.rampAtLift ??= U.ramp; ev.lseAtLift ??= U.embark.crewMode?.(0); ev.chockAtLift ??= U.embark.crewMode?.(1); ev.aboardAtLift ??= Q.state; }
    if (ph === 'ground' && U.deployed) mark('deployed');
    if (ph === 'parked') { mark('parked'); }
  }
  for (let k = 0; k < 150 && U.parked && !U.dead; k++) { U.embark.update(DT, t, U.AI.phase); t += DT; }   // the chockers run in after it is down
  console.log('   wave-offs', U.AI.waveoffs || 0, JSON.stringify(U.AI.woLog || []));
  const crewEnd = U.embark.crewMode ? [U.embark.crewMode(0), U.embark.crewMode(1), U.embark.crewMode(2)] : [];
  console.log(`   ${name} events`, JSON.stringify(ev), 'crew at the end', crewEnd.join(' '));
  T.check(`${name}: stick waits clear of the rotor discs`, minRotorGap > 2, `${minRotorGap.toFixed(1)} m outside the tips`, '> 2 m');
  T.check(`${name}: stick on the deck`, crewOff === 0 && maxFigY < 0.25, `${crewOff} samples off the deck, max ${maxFigY.toFixed(2)} m off the deck height`, 'on it');
  T.check(`${name}: ramp down before the first man moves`, ev.rampDown !== undefined && ev.firstMoves >= ev.rampDown, `ramp down ${ev.rampDown} s, first man ${ev.firstMoves} s`);
  T.check(`${name}: all aboard, ramp up, chocks off, LSE signal, then lift`, ev.allAboard < ev.lift && ev.rampAtLift < 0.05 && ev.aboardAtLift === 'aboard' && ev.lseAtLift === 'signal' && ev.chockAtLift === 'idle', `aboard ${ev.allAboard} s, lift ${ev.lift} s, ramp ${(ev.rampAtLift ?? 1).toFixed(2)}, LSE ${ev.lseAtLift}, chocks ${ev.chockAtLift}`);
  T.check(`${name}: loading time`, ev.lift - ev.rampDown > r.load[0] && ev.lift - ev.rampDown < r.load[1], `${(ev.lift - ev.rampDown).toFixed(1)} s ramp down to lift`, `${r.load[0]}-${r.load[1]} s`);
  T.check(`${name}: troops off at the LZ, home and chocked`, ev.deployed && U.parked && crewEnd[1] === 'kneel' && crewEnd[2] === 'kneel', `deployed ${ev.deployed} s, parked ${ev.parked} s, chockers ${crewEnd.slice(1).join('/')}`);
}

const deckOf = d => (W, F) => { const [lx, lz] = (() => { const c = Math.cos(d(W).yaw), s = Math.sin(d(W).yaw), dx = F.x - d(W).x, dz = F.z - d(W).z; return [dx * c - dz * s, dx * s + dz * c]; })(); return Math.abs(lx) > d(W).W / 2 || Math.abs(lz) > d(W).L / 2; };
console.log('--- CH-46E on the ALBATROSS: 13 Marines ---');
await run('CH-46', (W, scene) => ({
  U: createCH46Unit({ parent: scene, env: W.env, world: W.world, lz: () => W.lz(18), home: () => W.spot(-2, -2), pad: W.PAD, start: { ...W.spot(-2, -2), yaw: W.deck.yaw }, modex: 5, board: true, deck: () => W.spot(-2, -2) }),
  discs: [[0, -5.08, 7.62], [0, 5.08, 7.62]], deckOf: deckOf(W => W.deck), deckY: W => W.deck.H, load: [8, 35],
}), 420);
console.log('--- MV-22B on the KRAKEN: 12 machine troopers ---');
await run('MV-22', (W, scene) => ({
  U: createMV22Unit({ parent: scene, env: W.env, world: W.world, lz: () => ({ ...W.lz(18), x: W.PAD.x - 18, hdg: Math.PI / 2 }), home: () => W.krakenSpot(-1, -36), pad: W.PAD, start: { ...W.krakenSpot(-1, -36), yaw: W.kraken.yaw }, squad: 12, board: true, deck: () => W.krakenSpot(-1, -36) }),
  discs: [[7, 0, 5.8], [-7, 0, 5.8]], deckOf: deckOf(W => W.kraken), deckY: W => W.kraken.H, load: [8, 40],
}), 600);
T.done();
