#!/usr/bin/env node
// groundwarbench.mjs - THE GROUND WAR in node: the Marine body and squad AI, the seized MBTs on trackfm, road routes,
// level of detail, and whole fights on the RUNAWAY sandbox island (Marines vs STRIDERs, with and without a helicopter
// overhead). Weapons are game-level throughout (BIBLE): the checks are about behaviour, balance and cost.
//   node tools/groundwarbench.mjs              all checks
//   node tools/groundwarbench.mjs fight 3      one verbose fight, seed 3 (diagnostics)
import { createGroundSim, GW_AMMO } from '../game/js/units/groundwar/groundsim.js';
import { createMarine, MARINE } from '../game/js/units/groundwar/marine.js';
import { MAR_T } from '../game/js/units/groundwar/marineai.js';
import { createTrackDrive, TRACK_PARAMS, roadRoute } from '../game/js/units/groundwar/mbttrack.js';
import { createMBT, MBT } from '../game/js/units/runaway/mbt.js';
import { sandboxIsland } from '../game/js/units/runaway/rwworld.js';

let pass = 0, fail = 0;
const check = (ok, name, info = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -  ' + info : ''}`); };
const isl = sandboxIsland(1980);

// ------------------------------------------------------------------------------------------------- a fight
// 13 Marines (a reinforced squad) dug in round the pad vs an MV-22 load of 8 STRIDERs coming to take it; optionally a
// helicopter circling 55 m up, its door gunner firing bursts at what he can see (the war's 'b' rounds through segHit)
export function fight(o = {}) {
  const I = { id: 0, name: 'TEST', x: 0, z: 0, r: 215, pad: { x: 0, z: 30, r: 8.5, h: isl.height(0, 30) }, structs: [], owner: o.owner ?? 1 };
  const GS = createGroundSim({ terrainH: isl.heightExact, islands: [I], seed: o.seed ?? 1, hooks: {}, full: o.full });
  GS.maps.bakeAll(); GS.maps.setObstacles(I, isl.obstacles.map(q => ({ ...q })));
  const B = GS.battle(I), mar = [], rw = [];
  const nM = o.marines ?? 13, nR = o.striders ?? 8;
  for (let k = 0; k < nM; k++) mar.push(GS.addMarine(B, MARINE.ROLES[k % 13], (k % 5) * 3 - 6, 40 + Math.floor(k / 5) * 3, 0, { seed: k + 13 * (o.seed ?? 1) }));
  if (nM) GS.squadMarines(B, mar, o.marOrder || { type: 'defend', x: 0, z: 30, r: 25 });
  for (let k = 0; k < nR; k++) rw.push(GS.addStrider(B, -40 + (k % 4) * 4, -130 + Math.floor(k / 4) * 4, Math.PI, { weapon: k % 4 === 0 ? 'coil' : 'xm7' }));
  for (let k = 0; k < nR; k += 4) GS.squadRW(B, rw.slice(k, k + 4), o.rwOrder || { type: 'take', x: 0, z: 30, r: 30 });
  for (const v of o.vehicles || []) { const u = v.kind === 'hovertank' ? GS.addHover(B, v.x, v.z, Math.PI) : GS.addMBT(v.kind, B, v.x, v.z, Math.PI); GS.join(B, u, { type: 'take', x: 0, z: 30, r: 30 }); rw.push(u); }
  // PARITY (ngc/parity): the Task Force's own AI tanks (side 1) with the Marines
  const tf = []; for (const v of o.tf || []) { const u = GS.addMBT(v.kind || 'm60a3', B, v.x, v.z, v.yaw ?? 0, { side: 1 }); GS.join(B, u, o.tfOrder || o.marOrder || { type: 'defend', x: 0, z: 30, r: 25 }); tf.push(u); }
  let ffHits = 0;   // side 1's rounds landing on side 1's tanks (must stay 0)
  const ev = {}, T = o.secs ?? 300, dt = 1 / 30, heli = o.heli;
  let heliT = 0, heliShots = 0, heliHits = 0, ended = null, rocketT = 5;
  const t0 = performance.now();
  for (let i = 0; i < T / dt; i++) {
    const cam = o.far ? { x: 3000, y: 50, z: 3000 } : { x: 0, y: 60, z: 0 };
    for (const e of GS.step(dt, { cam })) { ev[e.e] = (ev[e.e] || 0) + 1; if (e.e === 'hit' && e.side === 1 && tf.some(u => u.id === e.id)) ffHits++; if (e.e === 'kia' || e.e === 'wia') { const k = e.e + '_' + e.part; ev[k] = (ev[k] || 0) + 1; } if (e.e === 'hit' && e.side === 1 && e.kind === 'strider') { const k = 'h_' + e.ammo + '_' + e.part + (e.pen ? '+' : ''); ev[k] = (ev[k] || 0) + 1; } }
    // the helicopter: a slow orbit 220 m round the pad, 55 m up; the door gun fires ~6 rounds/s in bursts at the
    // nearest STRIDER in sight within 350 m (game rounds: 75 m/s tracer as war.js, swept against the units)
    if (heli && GS.time > (heli.from ?? 60)) {
      const a = GS.time * 0.08, hx = Math.cos(a) * 220, hz = 30 + Math.sin(a) * 220, hy = 55 + isl.height(hx, hz) * 0.3;
      heliT -= dt;
      if (heliT <= 0) {
        heliT = (i % 40 < 26) ? 0.16 : 0.5;
        let best = null, bd = 350;
        for (const u of rw) if (u.alive) { const d = Math.hypot(u.x - hx, u.y - hy, u.z - hz); if (d < bd && B.M.world.los(hx, hy, hz, u.x, u.y + 1.4, u.z)) { bd = d; best = u; } }
        if (best) {
          heliShots++;
          // a round flies ~bd / 75 s; walk it along in 1/30 s segments with the war's gravity (2.2) and a gunner's spread
          let px = hx, py = hy, pz = hz; const sp = 0.03, dx = best.x - hx + (Math.random() - 0.5) * bd * sp, dy = best.y + 1.2 - hy + (Math.random() - 0.5) * bd * sp, dz = best.z - hz + (Math.random() - 0.5) * bd * sp, L = Math.hypot(dx, dy, dz);
          let vx = dx / L * 75, vy = dy / L * 75 + 2.2 * L / 75 / 2, vz = dz / L * 75;
          for (let s = 0; s < 200; s++) {
            const nx = px + vx * dt, ny = py + vy * dt, nz = pz + vz * dt; vy -= 2.2 * dt;
            const r = GS.segHit(1, 'm60', px, py, pz, nx, ny, nz, 60);
            if (r) { heliHits++; break; }
            if (ny < isl.height(nx, nz)) break;
            px = nx; py = ny; pz = nz;
          }
          GS.hearWar(hx, hy, hz, 1, 380);
          // a pair of 2.75 in rockets every ~10 s at the same machine (the war's 'rocket': 105 m/s, a 6 m blast)
          if ((rocketT -= 0.16) <= 0) {
            rocketT = 10;
            for (let r = 0; r < 2; r++) {
              let px = hx, py = hy, pz = hz; const e = 0.012 * bd, dx = best.x - hx + (Math.random() - 0.5) * e, dy = best.y + 1 - hy + (Math.random() - 0.5) * e, dz = best.z - hz + (Math.random() - 0.5) * e, L = Math.hypot(dx, dy, dz);
              let vx = dx / L * 105, vy = dy / L * 105 + 1.2 * L / 105 / 2, vz = dz / L * 105;
              for (let st = 0; st < 200; st++) {
                const nx = px + vx * dt, ny = py + vy * dt, nz = pz + vz * dt; vy -= 1.2 * dt;
                const hit = GS.segHit(1, 'ffar', px, py, pz, nx, ny, nz, 300, 0.3);
                if (hit || ny < isl.height(nx, nz)) { const q = hit || { x: nx, y: Math.max(ny, isl.height(nx, nz)), z: nz }; GS.blast(q.x, q.y, q.z, 6 * 0.9, 1, 1); if (hit) heliHits++; break; }
                px = nx; py = ny; pz = nz;
              }
            }
          }
        }
      }
    }
    const mA = mar.filter(m => m.alive && m.able).length, rA = rw.filter(u => u.alive).length;
    if (o.log && i % (30 / dt) === 0) console.log(`t=${GS.time.toFixed(0)} marines ${mA}/${nM} (kia ${GS.stats.kia} wia ${GS.stats.wia}) machines ${rA}/${rw.length} | mar ${B.mar.squads[0]?.state} | rw ${B.rw.squads.map(s => s.state).join(',')} | shots ${GS.stats.shots[1]}/${GS.stats.shots[2]} hits ${GS.stats.hits[1]}/${GS.stats.hits[2]}${heli ? ` | heli ${heliHits}/${heliShots}` : ''}`);
    if ((nM && !mA) || !rA) { ended = GS.time; break; }
  }
  const cost = (performance.now() - t0) / GS.time;
  const onPad = rw.filter(u => u.alive && Math.hypot(u.x - 0, u.z - 30) < 25).length;
  return { GS, B, mar, rw, tf, ffHits, tanks: tf.filter(u => u.alive).length, ev, ended, cost, marines: mar.filter(m => m.alive && m.able).length, kia: GS.stats.kia, wia: GS.stats.wia, machines: rw.filter(u => u.alive).length, crippled: rw.filter(u => u.alive && (!u.sim.armed || u.sim.blind || u.sim.mode === 'disabled')).length, onPad, heliHits, heliShots, time: GS.time };
}

if (process.argv[2] === 'fight') {
  const seed = +(process.argv[3] || 1), heli = process.argv.includes('heli');
  const secs = +process.argv.slice(4).find(a => !isNaN(+a)) || 300;
  const r = fight({ seed, log: true, heli: heli ? {} : null, secs });
  console.log('END', JSON.stringify({ marines: r.marines, kia: r.kia, wia: r.wia, machines: r.machines, crippled: r.crippled, onPad: r.onPad, t: Math.round(r.time), msPerSimS: +r.cost.toFixed(1) }));
  console.log(JSON.stringify(r.ev));
  for (const u of r.rw) console.log(u.id, u.weaponName, JSON.stringify(Object.fromEntries(Object.entries(u.sim.hp).map(([k, v]) => [k, Math.round(v)]))), u.sim.mode, u.sim.blind ? 'BLIND' : '', u.sim.armed ? '' : 'DISARMED');
  for (const m of r.mar) console.log(m.role.padEnd(4), 'laws', m.laws, 'gl', m.gl, m.alive ? (m.able ? 'ok' : 'WIA') : 'KIA', m.ai.state, '|', m.ai.note);
  console.log(r.B.mar.log.map(l => `${l.t.toFixed(0)} ${l.st} ${l.note || ''}`).join(' | '));
  process.exit(0);
}

// ------------------------------------------------------------------------------------------------- PARITY: tank duels
// (ngc/parity) a Task Force M60A3 (side 1, B.tf's squad AI) and a seized tank (side 2, the machines' squad AI) start on
// opposite corners of the sandbox island, both ordered to take the pad, and fight it out (both ends swapped by `swap`)
export function duel(o = {}) {
  const I = { id: 0, name: 'TEST', x: 0, z: 0, r: 215, pad: { x: 0, z: 30, r: 8.5, h: isl.height(0, 30) }, structs: [], owner: 0 };
  const GS = createGroundSim({ terrainH: isl.heightExact, islands: [I], seed: o.seed ?? 1, hooks: {} });
  GS.maps.bakeAll(); GS.maps.setObstacles(I, isl.obstacles.map(q => ({ ...q })));
  // (four meetings on the low ground round the island's central hill - the pad's hilltop is too steep for a fair duel: both drives bog on its 40 % sides)
  const LAY = [[[-110, -100], [110, -100], [0, -110]], [[-100, 110], [100, 100], [0, 115]], [[-150, 0], [-30, -140], [-90, -80]], [[150, -20], [40, 140], [110, 70]]], L = LAY[(o.layout ?? 0) % 4], G = L[2];
  const jit = (p, k) => { const s = Math.sin((o.seed ?? 1) * 91.7 + k * 37.3) * 43758.5, r = s - Math.floor(s), q = Math.sin((o.seed ?? 1) * 51.3 + k * 17.9) * 24634.6, r2 = q - Math.floor(q); let x = p[0] + (r - 0.5) * 50, z = p[1] + (r2 - 0.5) * 50; while (isl.height(x, z) < 1) { x *= 0.92; z *= 0.92; } return [x, z]; };   // (each seed moves both start points up to 25 m)
  const B = GS.battle(I), [pa, pb] = o.swap ? [jit(L[1], 1), jit(L[0], 2)] : [jit(L[0], 1), jit(L[1], 2)];
  const yawTo = (p, q) => Math.atan2(-(q[0] - p[0]), -(q[1] - p[1]));
  const a = GS.addMBT('m60a3', B, pa[0], pa[1], yawTo(pa, G), { side: 1 }); GS.join(B, a, { type: 'take', x: G[0], z: G[1], r: 30 });
  const b = GS.addMBT(o.enemy || 't90m', B, pb[0], pb[1], yawTo(pb, G)); GS.join(B, b, { type: 'take', x: G[0], z: G[1], r: 30 });
  const dt = 1 / 30, T = o.secs ?? 420; let first = null;
  const main = { 1: 0, 2: 0 }, mhit = { 1: 0, 2: 0 }, MAIN = { mbt105: 1, mbt120: 1, mbt125: 1 };
  for (let i = 0; i < T / dt && a.alive && b.alive; i++) for (const e of GS.step(dt, { cam: { x: 0, y: 60, z: 0 } })) {
    if (e.e === 'shot' && MAIN[e.ammo]) { main[e.side]++; if (!first) first = e.side; }
    if (e.e === 'hit' && MAIN[e.ammo]) mhit[e.side]++;
  }
  return { m60: a.alive, foe: b.alive, t: GS.time, first, shots: GS.stats.shots, main, mhit, a, b };
}
if (process.argv[2] === 'duels') {   // node tools/groundwarbench.mjs duels [t90m|m1a2]: every duel, one line each
  for (const seed of [1, 2, 3, 4, 5]) for (const swap of [false, true]) for (const layout of [0, 1, 2, 3]) {
    const r = duel({ seed, swap, layout, enemy: process.argv[3] });
    console.log(`seed ${seed} swap ${+swap} layout ${layout}: ${r.m60 && !r.foe ? 'M60 WON  ' : !r.m60 && r.foe ? 'FOE WON  ' : r.m60 ? 'no result' : 'both dead'} ${r.t.toFixed(0)} s | main gun hits/rounds: M60 ${r.mhit[1]}/${r.main[1]}, foe ${r.mhit[2]}/${r.main[2]} | first round: side ${r.first}`);
  }
  process.exit(0);
}
function parityChecks() {
  console.log('  PARITY (ngc/parity): the Task Force\'s AI armour');
  // 1. friendly fire: side 1's rounds and blasts pass our M60; side 2's hit it
  {
    const I = { id: 0, name: 'TEST', x: 0, z: 0, r: 215, pad: { x: 0, z: 30, r: 8.5, h: isl.height(0, 30) }, structs: [], owner: 1 };
    const GS = createGroundSim({ terrainH: isl.heightExact, islands: [I], seed: 3, hooks: {} });
    GS.maps.bakeAll(); GS.maps.setObstacles(I, isl.obstacles.map(q => ({ ...q })));
    const B = GS.battle(I), t = GS.addMBT('m60a3', B, -40, 90, 0, { side: 1 }); GS.join(B, t, { type: 'defend', x: 0, z: 30, r: 25 });
    const hp0 = t.sim.hp.hull + t.sim.hp.turret, y = t.y + 1.4;
    const r1 = GS.segHit(1, 'ffar', t.x - 20, y, t.z, t.x + 20, y, t.z, 300);          // the war's side-1 rocket straight through it
    const r1b = GS.segHit(1, 'm60', t.x, y, t.z - 20, t.x, y, t.z + 20, 60);
    GS.blast(t.x, t.y + 1, t.z + 2, 6, 3, 1);                                          // a side-1 bomb next to it
    const hp1 = t.sim.hp.hull + t.sim.hp.turret;
    // a Marine's LAW fired through it (the ground war's own projectile, side 1)
    const m = GS.addMarine(B, 'tl', t.x, t.z + 40, Math.PI, { seed: 1 }); GS.squadMarines(B, [m], { type: 'hold' });
    GS.shoot(1, m, 'law', [t.x, t.y + 1.5, t.z + 30], [t.x, t.y + 1.2, t.z - 30], 0, 145);
    let lawHit = false; for (let i = 0; i < 60; i++) for (const e of GS.step(1 / 30, { cam: { x: 0, y: 60, z: 0 }, peace: true })) if (e.e === 'hit' && e.id === t.id) lawHit = true;
    const hp2 = t.sim.hp.hull + t.sim.hp.turret;
    check(!r1 && !r1b && hp1 === hp0 && !lawHit && hp2 === hp0, 'PARITY: no friendly fire - side 1\'s rounds, blasts and a Marine\'s LAW pass our own M60A3', `hp ${hp0} -> ${hp2}`);
    const r2 = GS.segHit(2, 'mbt125', t.x - 30, y, t.z, t.x + 30, y, t.z, 600);
    check(!!r2 && r2.unit === t && !t.alive, 'PARITY: a side-2 round (a T-90M\'s 125 mm in the side) knocks the M60A3 out', r2 ? `hit ${r2.unit.kind}, alive ${t.alive}` : 'missed');
    const t2 = GS.addMBT('m60a3', B, 40, 90, 0, { side: 1 }); GS.join(B, t2, { type: 'defend', x: 0, z: 30, r: 25 });
    const q0 = t2.sim.hp.hull; GS.blast(t2.x, t2.y + 1, t2.z + 2, 6, 3, 2);
    check(t2.sim.hp.hull < q0, 'PARITY: a side-2 blast hurts it', `${q0} -> ${t2.sim.hp.hull.toFixed(0)}`);
  }
  // 2. the duel: M60A3 vs T-90M, both ends, two layouts (rough parity: each side wins its share)
  {
    const res = [];
    for (const seed of [1, 2, 3, 4, 5]) for (const swap of [false, true]) for (const layout of [0, 1, 2, 3]) res.push(duel({ seed, swap, layout }));
    const w60 = res.filter(r => r.m60 && !r.foe).length, wT = res.filter(r => !r.m60 && r.foe).length, both = res.filter(r => !r.m60 && !r.foe).length, none = res.filter(r => r.m60 && r.foe).length;
    console.log(`  M60A3 vs T-90M duels (${res.length}, 4 meetings x 5 seeds x both ends): M60 won ${w60}, T-90M won ${wT}, both dead ${both}, no result ${none} | first shot by side 1 in ${res.filter(r => r.first === 1).length} | mean ${(res.reduce((s, r) => s + r.t, 0) / res.length).toFixed(0)} s`);
    const decided = res.length - none;
    check(w60 >= decided * 0.2 && wT >= decided * 0.2 && none <= res.length * 0.25, 'PARITY: M60A3 vs T-90M resolves both ways over seeds and layouts (each side wins at least a fifth of the decided duels; a quarter at most undecided in 7 min)', `M60 ${w60} / T-90M ${wT} / both ${both} / undecided ${none} of ${res.length}`);
    globalThis.__duel = { w60, wT, both, none, n: res.length };
  }
  // 3. Marines + an M60A3 vs the MV-22 load: better than the Marines alone (section 4: 0/8 there)
  {
    const seeds = [1, 2, 3, 4, 5, 6];
    const alone = seeds.map(seed => fight({ seed, secs: 360 })), withTank = seeds.map(seed => fight({ seed, secs: 360, tf: [{ x: 10, z: 70, yaw: 0 }] }));
    const win = r => r.machines === 0 || (r.marines > 0 && r.onPad === 0 && r.machines <= 2);
    const wa = alone.filter(win).length, wt = withTank.filter(win).length, ff = withTank.reduce((s, r) => s + r.ffHits, 0);
    const sa = alone.reduce((s, r) => s + r.marines, 0), st = withTank.reduce((s, r) => s + r.marines, 0);
    console.log('  Marines + M60A3 vs 8 STRIDERs:', withTank.map(r => `[M ${r.marines} (${r.kia}k ${r.wia}w) | tank ${r.tanks ? 'up' : 'lost'} | R ${r.machines} ${r.ended ? Math.round(r.ended) + 's' : ''}]`).join(' '));
    check(wt > wa && st > sa, 'PARITY: Marines with an M60A3 in support beat the STRIDERs more often than alone, and more of them live', `won ${wt}/${seeds.length} (alone ${wa}), ${st} vs ${sa} standing`);
    check(ff === 0, 'PARITY: the Marines never shoot their own tank (no side-1 round lands on it in the fights)', `${ff} friendly hits`);
    const tankShots = withTank.reduce((s, r) => s + (r.ev.mainGun || 0), 0);
    check(tankShots > seeds.length, 'PARITY: the tank fights (main gun rounds at the machines)', `${tankShots} main-gun rounds in ${seeds.length} fights`);
    globalThis.__support = { wt, wa, st, sa };
  }
}
if (process.argv[2] === 'parity') { parityChecks(); console.log(`\n${pass}/${pass + fail} checks pass`); process.exit(fail ? 1 : 0); }

// ------------------------------------------------------------------------------------------------- 1. the Marine's body
{
  const env = { height: () => 0 }, M = createMarine({ role: 'tl', env });
  const pace = (stance, v, secs = 6) => { const m = createMarine({ role: 'tl', env }); for (let i = 0; i < secs * 60; i++) m.step(1 / 60, { vx: 0, vz: -v, stance }, env); return m.speed; };
  check(Math.abs(pace('stand', MAR_T.SPEED.walk) - 1.52) < 0.02, 'Marine walks at quick time 1.52 m/s (FM 22-5)', pace('stand', 1.52).toFixed(2));
  check(Math.abs(pace('stand', MAR_T.SPEED.run) - 2.74) < 0.02, 'runs at double time 2.74 m/s', pace('stand', 2.74).toFixed(2));
  check(Math.abs(pace('stand', 9) - 4.5) < 0.05, 'a rush tops out at 4.5 m/s', pace('stand', 9).toFixed(2));
  check(Math.abs(pace('prone', 3) - 0.5) < 0.02, 'crawls at 0.5 m/s', pace('prone', 3).toFixed(2));
  const m2 = createMarine({ role: 'tl', env }); let t = 0; m2.step(1 / 60, { stance: 'prone' }, env); while (m2.stanceT < 1 && t < 5) { m2.step(1 / 60, { stance: 'prone' }, env); t += 1 / 60; }
  check(t > 0.9 && t < 1.3, 'stand -> prone takes ~1.1 s', t.toFixed(2) + ' s');
  // slope: Tobler's hiking function slows him uphill
  const hill = { height: (x, z) => -z * 0.25 };
  const mh = createMarine({ role: 'tl', env: hill }); for (let i = 0; i < 300; i++) mh.step(1 / 60, { vx: 0, vz: -1.52, stance: 'stand' }, hill);
  check(mh.speed < 0.8 && mh.speed > 0.5, 'uphill 25 %: Tobler pace 0.42 x flat', mh.speed.toFixed(2) + ' m/s');
  // wounds: a head shot kills, a leg hit puts him down, light hits slow him
  const h1 = createMarine({ role: 'tl', env, seed: 3 }); const r1 = h1.hit({ part: 'head', hp: 60 });
  const h2 = createMarine({ role: 'tl', env, seed: 3 }); h2.hit({ part: 'legL', hp: 60 }); const r2 = h2.hit({ part: 'legL', hp: 60 });
  const h3 = createMarine({ role: 'tl', env, seed: 3 }); const r3 = h3.hit({ part: 'armL', hp: 30 });
  check(r1.kia && r2.wia && !r3.kia && !r3.wia && h3.able, 'wounds: head = killed, leg gone = down, a graze = fights on');
  let kia = 0, wia = 0; for (let s = 0; s < 200; s++) { const q = createMarine({ role: 'tl', env, seed: s }); q.hit({ part: 'thorax', hp: 60 }); const r = q.hit({ part: 'thorax', hp: 60 }); if (r.kia) kia++; else if (!q.able) wia++; }
  check(kia > 40 && kia < 100 && wia > 100, 'two rounds in the chest: about a third killed, the rest down', `${kia} killed, ${wia} wounded of 200`);
  // the hit volume follows the stance
  const s1 = createMarine({ role: 'tl', env }); const tStand = s1.segHit(-5, 1.0, 0, 5, 1.0, 0);
  for (let i = 0; i < 120; i++) s1.step(1 / 60, { stance: 'prone' }, env); const tProne = s1.segHit(-5, 1.0, 0, 5, 1.0, 0), tLow = s1.segHit(-5, 0.2, 0, 5, 0.2, 0);
  check(tStand > 0 && tProne < 0 && tLow > 0, 'hit volume: a round at 1 m hits him standing, passes over him prone, a low one still finds him');
}

// ------------------------------------------------------------------------------------------------- 2. the seized MBTs on trackfm
{
  const env = { height: () => 0, surface: () => 'paved', water: () => -Infinity };
  for (const [id, vmax] of [['m1a2', 67], ['t90m', 60], ['m60a3', 48]]) {
    const T = createMBT(MBT[id], { drive: createTrackDrive }); T.place(0, 0, 0, env);
    let t32 = null; const t0 = performance.now();
    for (let i = 0; i < 3600; i++) { T.step(1 / 60, { throttle: 1, steer: 0 }, env); if (t32 === null && T.speed > 32 / 3.6) t32 = i / 60; }
    const ms = (performance.now() - t0) / 3600, top = T.speed * 3.6;
    check(Math.abs(top - vmax) / vmax < 0.08, `${MBT[id].name}: top speed on the road ${top.toFixed(1)} km/h (published ${vmax}, C)`);
    if (id === 'm60a3') check(t32 > 9 && t32 < 20, `${MBT[id].name} (PARITY: the Task Force's AI tank): 0-32 km/h in ${t32.toFixed(1)} s (tankbench's band 9-20, U)`);
    else check(t32 > 4 && t32 < 10, `${MBT[id].name}: 0-32 km/h in ${t32.toFixed(1)} s (M1A1 quoted 7.2 s, C; INFERRED band 4-10)`);
    for (let i = 0; i < 600; i++) T.step(1 / 60, { throttle: 0, steer: 0, brake: 1 }, env);
    check(Math.abs(T.speed) < 0.2, `${MBT[id].name}: brakes to a stop`, T.speed.toFixed(2));
    const y0 = T.yaw; for (let i = 0; i < 300; i++) T.step(1 / 60, { throttle: 0, steer: 1 }, env);
    const piv = (T.yaw - y0) / 5 * 57.3;
    check(piv < -10 && piv > -40, `${MBT[id].name}: pivots in neutral (to the right for steer +)`, piv.toFixed(1) + ' deg/s');
    check(ms < 0.5, `${MBT[id].name}: ${ms.toFixed(3)} ms per 60 Hz frame (120 Hz substeps)`);
    // the drive keeps mbt.js's interface: p on the ground, a wheel spin that grows, the autopilot reaches a point
    const T2 = createMBT(MBT[id], { drive: createTrackDrive }); T2.place(0, 0, 0, env);
    let tt = 0; for (; tt < 90; tt += 1 / 60) { const dx = 150 - T2.p[0], dz = -100 - T2.p[2], d = Math.hypot(dx, dz); if (d < 6) break; const sp = Math.min(10, d * 0.5); T2.step(1 / 60, { vx: dx / d * sp, vz: dz / d * sp }, env); }
    check(tt < 40 && Math.abs(T2.p[1]) < 0.1 && T2.drive.wheelSpin[0] > 100, `${MBT[id].name}: mbt.js's autopilot drives the trackfm hull 180 m to a point`, tt.toFixed(1) + ' s');
    // level of detail: to the placeholder and back without a jump
    const T3 = createMBT(MBT[id], { drive: createTrackDrive }); T3.place(0, 0, 0, env);
    for (let i = 0; i < 300; i++) T3.step(1 / 60, { throttle: 0.6, steer: 0.1 }, env);
    const p0 = T3.p.slice(), v0 = T3.speed; T3.drive.setDetail(false, env); const p1 = T3.p.slice();
    for (let i = 0; i < 120; i++) T3.step(1 / 60, { throttle: 0.6, steer: 0.1 }, env);
    const p2 = T3.p.slice(), v2 = T3.speed; T3.drive.setDetail(true, env); const p3 = T3.p.slice();
    for (let i = 0; i < 60; i++) T3.step(1 / 60, { throttle: 0.6, steer: 0.1 }, env);
    check(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) < 0.05 && Math.hypot(p3[0] - p2[0], p3[2] - p2[2]) < 0.3 && Math.abs(T3.speed - v2) < 3, `${MBT[id].name}: level of detail hands over without a jump`, `speeds ${v0.toFixed(1)} / ${v2.toFixed(1)} / ${T3.speed.toFixed(1)} m/s`);
  }
  check(TRACK_PARAMS.m1a2.TRACK.WHEELS.length === 7 && TRACK_PARAMS.t90m.TRACK.WHEELS.length === 6, 'roadwheels: M1A2 seven, T-90M six a side (C)');
}

// ------------------------------------------------------------------------------------------------- 3. road routes
{
  // a T junction: road 1 west-east along z = 0, road 2 north from its middle to (0, -200)
  const mk = (id, pts) => { const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]), s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1])); return { id, xs, zs, s, len: s[s.length - 1], junctions: [] }; };
  const r1 = mk(1, Array.from({ length: 21 }, (_, i) => [-200 + i * 20, 0])), r2 = mk(2, Array.from({ length: 11 }, (_, i) => [0, -i * 20]));
  r1.junctions.push({ s: 200, road: 2, end: 0 });
  const g = { roads: [r1, r2], nodes: [] };
  const route = roadRoute(g, -190, 15, 10, -195);
  const via = route && route.some(p => Math.abs(p[0]) < 3 && Math.abs(p[1]) < 3);
  check(!!route && via && Math.hypot(route[route.length - 1][0] - 10, route[route.length - 1][1] + 195) < 1, 'road route: along the first road to the junction, up the second, to the goal', route ? `${route.length} points` : 'none');
  check(roadRoute(g, -190, 300, 10, -195) === null, 'no road near the start: no route (the driver goes cross-country)');
}

// ------------------------------------------------------------------------------------------------- 4. fights
{
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];   // (the walker sims use Math.random in places: outcomes vary run to run, so several seeds and margins)
  const res = seeds.map(seed => fight({ seed, secs: 360 }));
  const sum = k => res.reduce((s, r) => s + r[k], 0);
  console.log('  Marines alone (13, dug in) vs 8 STRIDERs:', res.map(r => `[M ${r.marines} (${r.kia}k ${r.wia}w) | R ${r.machines}${r.crippled ? ' (' + r.crippled + ' crippled)' : ''} ${r.ended ? Math.round(r.ended) + 's' : ''}]`).join(' '));
  const killed = 8 * seeds.length - sum('machines'), mWins = res.filter(r => r.machines === 0 || (r.marines > 0 && r.onPad === 0 && r.machines <= 2)).length;
  check(killed + sum('crippled') >= seeds.length * 2, 'the Marines hurt the machines: STRIDERs killed or crippled (avg >= 2 a fight)', `${killed} killed + ${sum('crippled')} crippled in ${seeds.length} fights`);
  check(res.some(r => r.machines >= 4) && mWins <= seeds.length / 2, 'unsupported, a squad usually loses to a full MV-22 load (the machines are the stronger force)', `Marines won ${mWins}/${seeds.length}`);
  check(sum('wia') >= sum('kia') * 0.5, 'casualties are wounded as well as killed', `${sum('kia')} killed, ${sum('wia')} wounded`);
  const cost = sum('cost') / seeds.length;
  check(cost < 60, `cost: ${cost.toFixed(1)} ms of CPU per simulated second, 21 units in contact (full detail)`);
  // the helicopter tips it
  const rh = seeds.map(seed => fight({ seed, secs: 360, heli: { from: 50 } }));
  const hWins = rh.filter(r => r.machines === 0 || (r.marines > 0 && r.onPad === 0 && r.machines <= 2)).length;
  console.log('  ... with a Huey door gun overhead:', rh.map(r => `[M ${r.marines} (${r.kia}k ${r.wia}w) | R ${r.machines} ${r.ended ? Math.round(r.ended) + 's' : ''} | gun ${r.heliHits}/${r.heliShots}]`).join(' '));
  check(hWins >= mWins + 1 && hWins > seeds.length / 2, 'a helicopter overhead tips the fight to the Marines', `Marines won ${hWins}/${seeds.length} (alone ${mWins})`);
  check(rh.reduce((s, r) => s + r.marines, 0) > sum('marines'), 'and more Marines live through it', `${rh.reduce((s, r) => s + r.marines, 0)} vs ${sum('marines')} standing at the end`);
  // far from the camera: cheap
  const rf = fight({ seed: 1, secs: 120, far: true });
  check(rf.cost < cost * 0.6, `a battle far from the camera runs cheap (5 Hz AI, kinematic STRIDERs)`, `${rf.cost.toFixed(1)} vs ${cost.toFixed(1)} ms per simulated s`);
}

parityChecks();   // PARITY (ngc/parity)
console.log(`\n${pass}/${pass + fail} checks pass`);
process.exit(fail ? 1 : 0);
