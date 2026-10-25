// SIM MODE: the island war in plain node, no browser - war.js and everything it drives (the rotary, air, ground,
// defence and naval modules) built on a THREE scene that is never rendered; the effects and sound are no-ops; the
// ground is main.js's (game/js/sim/zone.js). Both sides are CPU commanders (game/js/sim/commanderai.js for the TASK
// FORCE, game/js/sim/redai.js for the RUNAWAY). One call is one war:  await runWar(cfg) -> the record (telemetry.js).
//
//   cfg: { seed, blue, red (doctrine names or objects), tmax (game s), dt, tech ('all' | 'default' | 'max' | [ids]),
//          etech (the RUNAWAY's, else tech), pilot ('ai' = the AI Hornet strike wing, 'none'), set: { 'COST.drone': 50, ... },
//          blueKnobs / redKnobs: { aggression: 1.4, 'mix.air': 2 }, every (sample s), grid (Float32Array or null) }
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
if (!globalThis.__simThree) {
  globalThis.__simThree = true;
  register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(pathToFileURL(new URL('../../game/vendor/three.module.min.js', import.meta.url).pathname).href)}, shortCircuit: true }; return n(s, c); }`));
}
const noop = () => {};
// a canvas for the decal / texture builders (ships, aircraft): draws nothing
const ctx2d = new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop, set: (t, k, v) => { t[k] = v; return true; } });
if (typeof globalThis.document === 'undefined') globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };
// fx: every call is a no-op that returns something that also takes any call (fx.burn(...).ox = 1, fx.chimney().off)
const deep = () => { const f = function () { return P; }; const P = new Proxy(f, { get: (t, k) => k === Symbol.iterator ? function* () {} : k === Symbol.toPrimitive ? () => 0 : k === 'length' ? 0 : P, set: () => true, apply: () => P }); return P; };
const fx = deep();
const sfx = new Proxy({}, { get: (t, k) => (k === 'ctx' || k === 'master') ? undefined : noop });

const THREE = await import('../../game/vendor/three.module.min.js');
const { createZone } = await import('../../game/js/sim/zone.js');
const WAR = await import('../../game/js/war.js');
const { createCommanderAI } = await import('../../game/js/sim/commanderai.js');
const { createRedAI } = await import('../../game/js/sim/redai.js');
const { createStrikeWing } = await import('../../game/js/sim/strike.js');
const { createTelemetry } = await import('../../game/js/sim/telemetry.js');
const { doctrine, tweak } = await import('../../game/js/sim/doctrine.js');
const { seedMath } = await import('../../game/js/sim/rng.js');
const { createTech } = await import('../../game/js/techtree.js');
const { installResearch } = await import('../../game/js/sim/policy.js');
const { createFleet } = await import('../../game/js/units/commander/fleet.js');
const GWM = await import('../../game/js/units/groundwar/groundwar.js');
const AWM = await import('../../game/js/units/air/airwar.js');
const PARM = await import('../../game/js/units/parity/paritywar.js');   // PARITY: its tunables sweep too

// the knobs a sweep may turn (game tunables, restored after every war)
const TUNABLES = { COST: WAR.COST, CAP_TIME: WAR.CAP_TIME, PROD: WAR.PROD, GW_T: GWM.GW_T, AIR: AWM.AIR, PAR_T: PARM.PAR_T };
const snapshot = () => JSON.parse(JSON.stringify(TUNABLES, (k, v) => v === Infinity ? 'Infinity' : v));
const BASE = snapshot();
function restore() { const fix = (dst, src) => { for (const k of Object.keys(src)) { const v = src[k]; if (v && typeof v === 'object') fix(dst[k], v); else dst[k] = v === 'Infinity' ? Infinity : v; } }; for (const k of Object.keys(TUNABLES)) fix(TUNABLES[k], BASE[k]); }
export function setTunable(path, value) {
  const p = path.split('.'), root = TUNABLES[p.shift()]; if (!root) throw new Error(`unknown tunable ${path} (${Object.keys(TUNABLES).join(', ')})`);
  let o = root; while (p.length > 1) { o = o[p.shift()]; if (!o) throw new Error(`unknown tunable ${path}`); }
  if (!(p[0] in o)) throw new Error(`unknown tunable ${path}`);
  o[p[0]] = +value;
}
export const listTunables = () => BASE;

let Z = null;
export function zone(grid) { if (!Z) { Z = createZone(); if (grid) Z.useGrid(grid); } return Z.navReady; }
// the baked ground table (zone.js useGrid), cached on disk by the hash of the sources it comes from; returned in a
// SharedArrayBuffer so worker threads share one copy
export async function loadGrid() {
  const fs = await import('node:fs'), crypto = await import('node:crypto'), path = await import('node:path');
  const root = new URL('../../', import.meta.url).pathname;
  const src = ['game/js/world.js', 'game/js/sim/zone.js', 'game/js/units/armor/landinghard.js', 'game/js/world/net.js'].map(f => fs.readFileSync(path.join(root, f)));
  const h = crypto.createHash('sha1'); for (const b of src) h.update(b);
  const dir = path.join(root, 'tools/runs/sim'), file = path.join(dir, `.terrain-${h.digest('hex').slice(0, 12)}.f32`);
  const { GRID } = await import('../../game/js/sim/zone.js'), n = GRID.N * GRID.N;
  const sab = new SharedArrayBuffer(n * 4), out = new Float32Array(sab);
  if (fs.existsSync(file) && fs.statSync(file).size === n * 4) { const b = fs.readFileSync(file); out.set(new Float32Array(b.buffer, b.byteOffset, n)); return out; }
  const t0 = performance.now(), Zx = createZone(), t = Zx.bake(); out.set(t);
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, Buffer.from(t.buffer));
  for (const f of fs.readdirSync(dir)) if (f.startsWith('.terrain-') && path.join(dir, f) !== file) fs.unlinkSync(path.join(dir, f));
  console.error(`(baked the ground table in ${((performance.now() - t0) / 1000).toFixed(1)} s -> ${path.relative(root, file)})`);
  return out;
}

export async function runWar(cfg) {
  const z = zone(cfg.exact ? null : cfg.grid || (Z ? null : await loadGrid()));
  restore();
  for (const [k, v] of Object.entries(cfg.set || {})) setTunable(k, v);
  const R = seedMath(cfg.seed ?? 1);
  const dt = cfg.dt ?? 1 / 30, tmax = cfg.tmax ?? 3600;
  const blue = tweak(typeof cfg.blue === 'object' ? cfg.blue : doctrine(1, cfg.blue || 'BALANCED'), cfg.blueKnobs || {});
  const red = tweak(typeof cfg.red === 'object' ? cfg.red : doctrine(2, cfg.red || 'DEFAULT'), cfg.redKnobs || {});
  const techB = createTech(1, { start: cfg.tech ?? 'all' }), techR = createTech(2, { start: cfg.etech ?? cfg.tech ?? 'all' });
  const G = { fuel: 250, mat: 90, get fuelMax() { return 600; } };   // main.js's opening store (G.res 250, G.mat 90)
  const PL = { alive: false, landed: false, inCave: false, pos: new THREE.Vector3(0, -1000, 0), vel: new THREE.Vector3(), hitR: 2.6, detect: 1, kind: 'none' };
  const scene = new THREE.Scene();
  let T = null;
  const ctx = {
    headless: true, scene, fx, sfx, terrainH: z.terrainH, isWater: z.isWater, nav: z.nav, ISLANDS: z.ISLANDS, BASES: z.BASES, G,
    // the camera far away: every fight at its distant level of detail, as the game runs the fights far from you
    feed: cfg.feed || noop, addScore: noop, ear: new THREE.Vector3(5e4, 5e4, 5e4), carrierStart: z.carrierStart, enemyStart: z.enemyStart,
    player: () => PL, hurtPlayer: noop, onOwner: (I, was) => T && T.onOwner(I, was), onEnd: noop,
  };
  const W = WAR.createWar(ctx);
  W.tech[1] = techB; W.tech[2] = techR;   // TECH TREE: this run's start sets (W.reset resets them to these)
  W.reset();
  // --patch catlane: the two Hornets parked on the ALBATROSS's bow are solid deck (albatross.js height fields) and the
  // F-14's right main gear runs into the forward one at the end of the cat 2 stroke: every escort breaks up on launch
  // (found by this sim, confirmed in the browser). The patch takes their footprints off the deck for this run only.
  if ((cfg.patch || []).includes('catlane') && W.carrier.parts.parked) { const P = W.carrier.parts.parked; for (let i = P.length - 1; i >= 0; i--) if (P[i].z < -20) P.splice(i, 1); }
  T = createTelemetry(W, { every: cfg.every ?? 5 });
  const log = (side, what, extra) => T.decision(side, what, extra);
  installResearch(W, 1, blue, log); installResearch(W, 2, red, log);
  const fleet = createFleet();
  const strike = cfg.pilot === 'none' || !(blue.mix.air > 0) ? null : createStrikeWing({ W, terrainH: z.terrainH, scene, feed: cfg.feed || noop, fleet, THREE });
  const C = createCommanderAI({ W, nav: z.nav, doctrine: blue, tech: techB, strike, fleet, log, terrainH: z.terrainH });
  W.redAI = createRedAI({ W, nav: z.nav, feed: cfg.feed || noop, sfx, doctrine: red, log });
  const t0 = performance.now(); let bad = null; const anomalies = [];
  const n = Math.round(tmax / dt);
  if (cfg.hook) cfg.hook({ W, C, strike, T, z, fleet, techB, techR });   // (dev scripts and the bench look inside)
  z.bad = null;
  for (let i = 0; i < n && !W.over; i++) {
    W.tickSea(dt); W.update(dt, PL, false); C.update(dt); T.sample(); if (cfg.onStep) cfg.onStep(W);
    if (i % 15 === 0) {
      // a unit whose flight model ran away (NaN, or thrown off the map) is an anomaly: logged, written off, the war
      // goes on; anything else wrong (NaN materiel, a NaN soldier) stops the run as an error
      for (const a of runaways(W)) { anomalies.push(a.why); a.u.dead = true; a.u.hp = 0; }
      if (z.bad) { anomalies.push(z.bad); z.bad = null; }
      bad = sanity(W); if (bad || anomalies.length > 20) { bad = bad || 'too many anomalies'; break; }
    }
  }
  const wall = (performance.now() - t0) / 1000;
  const rec = T.finish(bad ? 'error' : W.over ? 'over' : 'tmax', {
    seed: cfg.seed, blue: blue.name, red: red.name, tech: cfg.tech ?? 'all', etech: cfg.etech ?? cfg.tech ?? 'all', set: cfg.set || {}, knobs: { blue: cfg.blueKnobs || {}, red: cfg.redKnobs || {} },
    wall: +wall.toFixed(2), speed: +(W.time / 60 / wall).toFixed(2), bad, anomalies, rngCalls: R.calls,
    research: { 1: techB.log.filter(e => e.e === 'done').map(e => [e.id, Math.round(e.t)]), 2: techR.log.filter(e => e.e === 'done').map(e => [e.id, Math.round(e.t)]) },
    strike: strike ? strike.stats : null, spent: { 1: C.spent, 2: W.redAI.spent }, fleet: { lost: fleet.lost, bought: fleet.bought },
    final: { mat1: Math.round(W.P.mat), mat2: Math.round(W.E.mat), c1: W.carrier ? Math.round(W.carrier.hp) : 0, c2: W.enemyCarrier ? Math.round(W.enemyCarrier.hp) : 0, own: [0, 1, 2].map(s => W.islands.filter(I => I.owner === s).length) },
  });
  R.restore(); restore();
  return rec;
}
// units thrown off the map or gone NaN (seen: a CH-46 flying into the airborne sky carrier's deck is launched at
// thousands of m/s by its gear springs), and units far too fast for what they are
function runaways(W) {
  const out = [];
  for (const u of W.units) {
    if (!u.p || u.dead) continue;
    const sp = u.v ? u.v.length() : 0, nan = !Number.isFinite(u.p.x + u.p.y + u.p.z);
    if (nan || Math.abs(u.p.x) > 20000 || Math.abs(u.p.z) > 20000 || sp > 900) out.push({ u, why: `t ${W.time.toFixed(0)}: ${u.type} (side ${u.side}) ${nan ? 'NaN position' : sp > 900 ? `at ${sp.toFixed(0)} m/s` : 'off the map'} near ${Math.round(u._simLast?.x ?? 0)}, ${Math.round(u._simLast?.z ?? 0)}${W.carrier && W.carrier.sky && W.carrier.sky.up ? ' (sky carrier up)' : ''}` });
    else u._simLast = { x: u.p.x, z: u.p.z };
  }
  return out;
}
// NaN anywhere else that matters
function sanity(W) {
  if (!Number.isFinite(W.P.mat) || !Number.isFinite(W.E.mat)) return 'NaN materiel';
  const GS = W.ground && W.ground.sim; if (GS) for (const u of GS.units) if (u.alive && !Number.isFinite(u.x + u.z)) return `NaN ground unit ${u.kind}`;
  return null;
}
