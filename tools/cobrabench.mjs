#!/usr/bin/env node
// cobrabench.mjs - the AH-1T Improved SeaCobra flight model (game/js/units/air/rotary/cobrafm.js) against published
// data, in plain node (PARITY: the Task Force's attack helicopter): control signs, hover power at weights against
// momentum theory, hover attitude, the power curve, maximum level speed, climb, service and hover ceilings, a twin-pac
// power section out, autorotation, the teetering rotor (no hub moment, mast bumping at low g), stability with and
// without the SCAS, ground handling, and the AI crew (cobraai.js) flying a waypoint course and an attack sortie over
// the test island.            node tools/cobrabench.mjs [--v]
// Published figures (see cobrafm.js): VFS Vertical Flight Development database, AH-1T: MTOW 14,000 lb, max level
// speed 149 kt, Vne 190 kt, max ROC 1,785 fpm, service ceiling 7,400 ft. Tags: CONFIRMED / INFERRED / UNVERIFIED.
import { ROT, DT, deg, rad, KT, FT, FPM, HP, clamp, isaRho, sea, land, table, run } from './rotarykit.mjs';
const { createCobraSim, COBRA } = await import(ROT + 'cobrafm.js');
const { createPilot, stateOf } = await import(ROT + 'pilot.js');
const { createCobraAI, flyCobra, autoRotate } = await import(ROT + 'cobraai.js');
const { createDevWorld } = await import(ROT + 'devworld.js');
const V = process.argv.includes('--v');
const T = table();
const MISSION = () => createCobraSim().mass;
function mk(o = {}) {
  const S = createCobraSim(); if (o.gw) S.stores += o.gw - S.mass;
  S.reset([0, o.alt ?? 300, 0], 0, false); S.body.vel[2] = -(o.speed ?? 0);
  const P = createPilot(COBRA.PILOT); P.reset(o.coll ?? 0.55);
  return { S, P, st: {} };
}
const keys = A => ({ coll: () => A.S.c.coll, lon: () => A.S.c.lon, lat: () => A.S.c.lat, ped: () => A.S.c.ped, pitch: () => deg(A.st.pitch), roll: () => deg(A.st.roll),
  shp: () => A.S.power / HP, mr: () => A.S.rotor.power / HP, tr: () => A.S.trPower / HP, vy: () => A.S.body.vel[1], vf: () => A.st.vf, rpm: () => A.S.rpm, tq: () => A.S.torque, tx: () => deg(A.S.rotor.tx) });
function trim(A, Vf, env = sea(), secs = 40, cmd = {}, agl) {
  return run(A.S, secs, () => { stateOf(A.S.body, A.st); return A.P.step(A.st, DT, { vx: 0, vz: -Vf, vy: agl === undefined ? 0 : clamp((agl - A.S.agl) * 0.8, -1, 1), hdg: 0, ...cmd }); }, env, keys(A), 6);
}
// collective held by a power loop at `limit` (W, total shaft power) while the pilot holds speed: climb performance
function climb(A, Vf, limit, env = sea(), secs = 45) {
  let c = A.S.c.coll || 0.5;
  return run(A.S, secs, () => { stateOf(A.S.body, A.st); const k = A.P.step(A.st, DT, { vx: 0, vz: -Vf, vy: 0, hdg: 0, collFix: c }); c = clamp(c + (limit - A.S.power) / limit * 0.6 * DT, 0, 1); return k; }, env, keys(A), 8);
}
const avail = rho => Math.min(COBRA.XMSN, 2 * COBRA.P_SEC * (rho / 1.225) ** 1.15);

console.log(`--- control signs (trimmed hover at ${MISSION().toFixed(0)} kg = ${(MISSION() * 2.2046).toFixed(0)} lb, 0.3 input for 0.6 s, SCAS off) ---`);
{
  const resp = mod => { const A = mk(); trim(A, 0, sea(), 25); const c = { ...A.P.ctl, sas: false }; mod(c); const s0 = { ...stateOf(A.S.body, {}) }; run(A.S, 0.6, () => c, sea()); return { s0, s1: stateOf(A.S.body, {}) }; };
  let r = resp(c => c.lon += 0.3); T.check('stick aft: nose up', r.s1.q > 0.02 && r.s1.pitch > r.s0.pitch, `q ${deg(r.s1.q).toFixed(1)} deg/s`);
  r = resp(c => c.lat += 0.3); T.check('stick right: roll right', r.s1.p > 0.03 && r.s1.roll > r.s0.roll, `p ${deg(r.s1.p).toFixed(1)} deg/s`);
  r = resp(c => c.ped += 0.3); T.check('right pedal (less tail rotor pitch): nose right', r.s1.r > 0.02, `r ${deg(r.s1.r).toFixed(1)} deg/s`);
  r = resp(c => c.coll += 0.08); T.check('collective up: climbs', r.s1.vy > 0.5, `vy ${r.s1.vy.toFixed(2)} m/s`);
}

console.log('--- hover (OGE, sea level ISA) ---');
const A0 = Math.PI * COBRA.R ** 2;
{
  for (const [lb, label] of [[MISSION() * 2.2046, 'combat load'], [14000, 'max gross']]) {
    const gw = lb / 2.2046, H = trim(mk({ gw }), 0), W = gw * 9.81, Pid = W ** 1.5 / Math.sqrt(2 * 1.225 * A0), FM = Pid / (H.mr * HP);
    T.check(`hover power, ${lb.toFixed(0)} lb (${label})`, H.shp < avail(1.225) / HP && FM > 0.6 && FM < 0.78, `${H.shp.toFixed(0)} shp total (main rotor ${H.mr.toFixed(0)}, tail ${H.tr.toFixed(0)}), FM ${FM.toFixed(2)}`, `< ${(avail(1.225) / HP).toFixed(0)} shp available; FM 0.6-0.78 (2-blade, wide chord)`, 'momentum theory; Leishman ch. 2-3');
    if (label === 'max gross') {
      T.check('tail rotor power in the hover', H.tr / H.shp > 0.05 && H.tr / H.shp < 0.12, `${(100 * H.tr / H.shp).toFixed(1)}% of the total`, '5-12% (single main rotor helicopters)', 'CONFIRMED typical (Leishman, Prouty)');
      T.check('hover attitude: slightly nose up, left skid low', H.pitch > -1 && H.pitch < 5 && H.roll < -0.5 && H.roll > -4, `pitch ${H.pitch.toFixed(1)} deg, roll ${H.roll.toFixed(1)} deg, pedal ${H.ped.toFixed(2)} (left)`, 'CCW rotor + tail rotor drift: left skid low', 'CONFIRMED qualitative (US single-rotor helicopters)');
    }
  }
}

console.log('--- level flight (max gross 14,000 lb) ---');
const sweep = [];
{
  for (const kt of [0, 20, 40, 60, 80, 100, 120, 140, 150]) { const r = trim(mk({ speed: kt / KT, gw: COBRA.MTOW }), kt / KT); r.kt = kt; sweep.push(r); }
  console.log('   KIAS  coll%   lon    lat    ped   pitch  roll   shp   tail shp');
  for (const r of sweep) console.log(`   ${String(r.kt).padStart(4)}  ${(r.coll * 100).toFixed(0).padStart(4)}  ${r.lon.toFixed(2).padStart(5)}  ${r.lat.toFixed(2).padStart(5)}  ${r.ped.toFixed(2).padStart(5)}  ${r.pitch.toFixed(1).padStart(5)}  ${r.roll.toFixed(1).padStart(5)}  ${r.shp.toFixed(0).padStart(5)}  ${r.tr.toFixed(0).padStart(4)}`);
  const mi = sweep.reduce((b, r, i) => r.shp < sweep[b].shp ? i : b, 0);
  T.check('power bucket (minimum power speed)', sweep[mi].kt >= 60 && sweep[mi].kt <= 90, `${sweep[mi].shp.toFixed(0)} shp at ${sweep[mi].kt} kt (hover ${sweep[0].shp.toFixed(0)})`, '60-90 kt, about half the hover power', 'INFERRED');
  const s120 = sweep.find(r => r.kt === 120);
  T.check('cruise: nose down a few degrees, cyclic margin left', s120.pitch < 0 && s120.pitch > -8 && s120.lon > -0.7, `${s120.pitch.toFixed(1)} deg at 120 kt, stick ${s120.lon.toFixed(2)}`, 'pitch 0 to -8 deg, |stick| < 0.7');
  T.check('the cambered fin unloads the tail rotor in cruise', s120.tr < 0.4 * sweep[0].tr, `${s120.tr.toFixed(0)} shp at 120 kt vs ${sweep[0].tr.toFixed(0)} in the hover`, 'tail rotor power falls with speed', 'CONFIRMED qualitative');
}

console.log('--- performance (sea level ISA) ---');
{
  let vmax = 0;
  for (const kt of [135, 140, 145, 149, 153, 157, 161, 165]) {
    const A = mk({ speed: kt / KT, gw: COBRA.MTOW }), r = trim(A, kt / KT, sea(), 35);
    if (V) console.log(`   ${kt} kt  ${r.shp.toFixed(0)} shp  coll ${(r.coll * 100).toFixed(0)}%  pitch ${r.pitch.toFixed(1)}  vf ${(r.vf * KT).toFixed(1)}`);
    if (r.shp <= COBRA.MCP / HP && Math.abs(r.vf * KT - kt) < 2) vmax = kt;
  }
  T.check('max level speed, 14,000 lb, max continuous (1,770 shp)', Math.abs(vmax - COBRA.PUB.VMAX) <= 8, `${vmax} kt`, `${COBRA.PUB.VMAX} kt`, 'CONFIRMED (VFS); MCP UNVERIFIED');
  const c = climb(mk({ speed: 70 / KT, gw: COBRA.MTOW }), 70 / KT, avail(1.225));
  T.check('max rate of climb, 14,000 lb, 70 kt, take-off power', Math.abs(c.vy * FPM - COBRA.PUB.ROC) < 0.25 * COBRA.PUB.ROC, `${(c.vy * FPM).toFixed(0)} fpm (${c.shp.toFixed(0)} shp)`, `${COBRA.PUB.ROC} fpm`, 'CONFIRMED (VFS; weight / speed INFERRED)');
  // service ceiling: the published 7,400 ft is far below what any ISA power balance gives for 1,970 shp at 14,000 lb
  // (the AH-1J's 10,500 ft for 1,100 shp is the same story): it is taken as a hot-day / limit-defined figure (UNVERIFIED
  // interpretation). Checked: at least 100 fpm at the published ceiling; the ISA 100 fpm ceiling is printed.
  const c74 = climb(mk({ speed: 70 / KT, gw: COBRA.MTOW }), 70 / KT, avail(isaRho(COBRA.PUB.CEIL / FT)), sea(isaRho(COBRA.PUB.CEIL / FT)), 40);
  let ceil = 0;
  for (let ft = 0; ft <= 14000; ft += 1000) {
    const rho = isaRho(ft / FT), r = climb(mk({ speed: 70 / KT, gw: COBRA.MTOW }), 70 / KT, avail(rho), sea(rho), 40);
    if (V) console.log(`   ${ft} ft  climb ${(r.vy * FPM).toFixed(0)} fpm at ${r.shp.toFixed(0)} shp`);
    if (r.vy * FPM >= 100) ceil = ft; else break;
  }
  T.check('climb at the published service ceiling (7,400 ft), 14,000 lb', c74.vy * FPM >= 100, `${(c74.vy * FPM).toFixed(0)} fpm at 7,400 ft ISA (ISA 100-fpm ceiling ~${ceil}${ceil >= 14000 ? '+' : ''} ft)`, '>= 100 fpm', 'CONFIRMED figure (VFS); interpretation UNVERIFIED');
  // hover ceilings at max gross (no published figure found: UNVERIFIED expectation - the T was hot-and-high limited)
  const ceiling = (gw, skids) => {
    let best = -1;
    for (let ft = 0; ft <= 14000; ft += 500) {
      const rho = isaRho(ft / FT), env = skids === undefined ? sea(rho) : land(rho), A = mk({ gw, alt: skids === undefined ? 300 : COBRA.CG_H + skids });
      const r = trim(A, 0, env, 25, {}, skids);
      if (V) console.log(`   ${ft} ft ${skids === undefined ? 'OGE' : 'IGE'}  need ${r.shp.toFixed(0)} shp, available ${(avail(rho) / HP).toFixed(0)}`);
      if (r.shp * HP <= avail(rho) && Math.abs(r.vy) < 0.3 && (skids === undefined || Math.abs(A.S.agl - skids) < 0.5)) best = ft; else break;
    }
    return best;
  };
  const oge = ceiling(COBRA.MTOW), ige = ceiling(COBRA.MTOW, 1.5);
  T.check('hover ceiling OGE, 14,000 lb', oge >= 0 && oge <= 6000, `${oge} ft`, 'low: 0-6,000 ft (marginal at max gross)', 'UNVERIFIED (no published AH-1T figure found)');
  T.check('hover ceiling IGE (5 ft skid height), 14,000 lb', ige > oge + 2000, `${ige} ft`, 'well above OGE (ground effect)', 'INFERRED (Cheeseman-Bennett)');
}

console.log('--- engines out ---');
{
  const A = mk({ speed: 36, gw: COBRA.MTOW }); trim(A, 36, sea(), 20); A.S.eng[1].ok = false;
  const r = climb(A, 36, COBRA.P_SEC, sea(), 40);
  T.check('one twin-pac power section out at 70 kt, max gross: holds height', r.vy > -0.3 && r.rpm > 0.95, `climb ${(r.vy * FPM).toFixed(0)} fpm at ${r.shp.toFixed(0)} shp, NR ${(r.rpm * 100).toFixed(0)}%`, '>= 0 fpm (the twin-pac\'s point)', 'INFERRED');
  const B = mk({ speed: 41 }); trim(B, 41, sea(), 20); B.S.eng[0].ok = B.S.eng[1].ok = false;
  let c = 0.25;
  const a = run(B.S, 40, () => { stateOf(B.S.body, B.st); const k = B.P.step(B.st, DT, { vx: 0, vz: -41, hdg: 0, collFix: c }); c = clamp(c + (B.S.rpm - 1.0) * 1.2 * DT, 0, 1); return k; }, sea(), keys(B), 8);
  T.check('autorotation at 80 kt: rotor rpm held by the collective', a.rpm > 0.92 && a.rpm < 1.08, `NR ${(a.rpm * 100).toFixed(0)}%, coll ${(a.coll * 100).toFixed(0)}%`, '92-108% NR');
  T.check('autorotation descent rate', -a.vy * FPM > 1200 && -a.vy * FPM < 2600, `${(-a.vy * FPM).toFixed(0)} fpm`, '~1,500-2,200 fpm', 'UNVERIFIED (Bell 2-blade: ~1,700-2,000 fpm)');
  // touchdown from an autorotation (cobraai.autoRotate: flare at 30 m, level and cushion at 5 m); on the skids: heading
  // held, cyclic centred, collective down (a dynamic rollover otherwise: the tail rotor pushes, the skid holds)
  const landing = (alt, kt) => {
    const D = mk({ speed: kt / KT, alt }); const L = land(); trim(D, kt / KT, L, 15); D.S.eng[0].ok = D.S.eng[1].ok = false; let td = null;
    run(D.S, 70, t => { stateOf(D.S.body, D.st); if (!td) return autoRotate(D.S, D.P, D.st, DT); const c = D.P.step(D.st, DT, { vx: D.st.vx, vz: D.st.vz, hdg: td.h, collFix: Math.max(0, D.S.c.coll - DT * 1.5) }); c.lon = c.lat = 0; c.eng0 = c.eng1 = false; return c; }, L, {}, 0, (t, e) => { if (e && !td) td = { e, vy: D.S.body.maxSink, vf: D.st.vf, h: D.st.yaw, t }; });
    return { td, dead: D.S.dead };
  };
  for (const [alt, kt] of [[160, 80], [80, 80]]) {
    const { td, dead } = landing(alt, kt);
    T.check(`autorotative landing from ${alt} m at ${kt} kt`, td && (td.e === 'land' || td.e === 'hardland') && td.vy < 4.5 && !dead, td ? `${td.e}, sink ${td.vy.toFixed(1)} m/s, ${(td.vf * KT).toFixed(0)} kt run-on${dead ? ', ' + dead : ''}` : 'no touchdown', 'sink < 4.5 m/s, survived', 'INFERRED (Bell autorotation technique)');
  }
  { const { td, dead } = landing(60, 20); T.check('from 60 m at 20 kt: inside the height-velocity "dead man\'s curve"', !!dead || (td && td.vy > 6), td ? `sink ${td.vy.toFixed(1)} m/s${dead ? ', ' + dead : ''}` : 'no touchdown', 'not survivable', 'CONFIRMED qualitative (H-V diagrams)'); }
}

console.log('--- the teetering rotor, stability ---');
{
  // no hub moment: at the same TPP tilt the moment about the CG is thrust x hub height (CH-46-like articulated heads
  // add e x Sb x Omega^2; the teetering hub adds nothing)
  const A = mk(); trim(A, 0, sea(), 20); const S = A.S;
  T.check('teetering hub: no hub moment', S.rotor.M[0] === 0 && S.rotor.M[1] === 0, `hub moment ${S.rotor.M[0].toFixed(0)}, ${S.rotor.M[1].toFixed(0)} N m`, '0 (the see-saw hub)', 'CONFIRMED (teetering rotor theory)');
  // low g: a push-over at 100 kt (collective down, full forward stick) then the instinctive left stick against the right
  // roll the tail rotor gives at low g: the disc reaches the teeter stop with no thrust on it - mast bumping
  const B = mk({ speed: 51 }); trim(B, 51, sea(), 20); let minNz = 9; const c0 = { ...B.P.ctl };
  run(B.S, 6, t => { stateOf(B.S.body, B.st); minNz = Math.min(minNz, B.S.nz); return { coll: t < 0.3 ? c0.coll : 0.05, lon: t < 0.3 ? c0.lon : -1, lat: t < 1 ? c0.lat : -1, ped: c0.ped, sas: false }; }, sea());
  T.check('low-g push-over + roll: mast bumping', B.S.dead === 'mastbump' || B.S.mastBump > 0.1, `nz down to ${minNz.toFixed(2)} g, ${B.S.dead ? 'MAST BUMP (rotor lost)' : 'mast stop ' + B.S.mastBump.toFixed(2) + ' s'}`, 'the 2-blade teetering rotor\'s killer', 'CONFIRMED qualitative (Bell 2-blade low-g warnings)');
  // SCAS off at 100 kt, hands fixed after a pitch-rate kick: compare with SCAS on
  const diverge = sas => { const C = mk({ speed: 51 }); trim(C, 51, sea(), 25); const c = { ...C.P.ctl, sas }; C.S.body.w[1] = 0.05; const th0 = stateOf(C.S.body, {}).pitch; let md = 0; run(C.S, 5, () => c, sea(), {}, 0, () => { md = Math.max(md, Math.abs(stateOf(C.S.body, {}).pitch - th0)); }); return md; };
  const off = diverge(false), on = diverge(true);
  T.check('SCAS off at 100 kt: the kick grows more; SCAS on: damped', on < off && on < rad(8), `5 s after a 2.9 deg/s kick: ${deg(off).toFixed(1)} deg off vs ${deg(on).toFixed(1)} deg with SCAS`, 'SCAS improves the damping', 'CONFIRMED qualitative (AH-1 SCAS)');
}

console.log('--- ground ---');
{
  const S = createCobraSim(); const env = land(); S.reset([3, 0, 4], 0.4, true, env); S.step(DT, { coll: 0 }, env); const p0 = [...S.body.pos];
  run(S, 12, () => ({ coll: 0, ped: -0.1 }), env);
  const drift = Math.hypot(S.body.pos[0] - p0[0], S.body.pos[2] - p0[2]);
  T.check('on the skids, rotor turning, collective down: holds still', S.landed && drift < 0.15, `drift ${drift.toFixed(3)} m, contacts ${S.body.contacts}`);
  T.check('stands on its skids at the CG height', Math.abs(S.body.pos[1] - COBRA.CG_H) < 0.15, `CG ${S.body.pos[1].toFixed(2)} m over the ground`, `${COBRA.CG_H} m`);
  const P = createPilot(COBRA.PILOT); P.reset(0.2); const st = {}; let off = -1, td = null;
  run(S, 30, t => { stateOf(S.body, st); const vy = t < 12 ? clamp(3 - S.agl, -1, 1.5) : -0.6; return flyCobra(S, P, st, { vx: 0, vz: 0, vy, hdg: 0.4 }, DT); }, env, {}, 0, (t, e) => { if (off < 0 && S.agl > 0.5) off = t; if (t > 12 && e && !td) td = { e, t }; });
  T.check('lift-off, hover at 3 m, set down', off > 0 && td && td.e === 'land', `airborne at ${off.toFixed(1)} s, ${td ? td.e + ' at ' + td.t.toFixed(1) + ' s' : 'no touchdown'}`);
}

console.log('--- the AI crew (cobraai.js) over the test island ---');
{
  const W = createDevWorld(), env = W.env, world = W.world;
  const fly = (A, AI, tgt, ctx) => { stateOf(A.S.body, A.st); const me = A.st; const cmd = AI.step({ x: me.x, y: me.y, z: me.z, vx: me.vx, vy: me.vy, vz: me.vz, yaw: me.yaw }, tgt, DT, world, ctx); return flyCobra(A.S, A.P, A.st, cmd, DT); };
  // waypoint course: four legs round the island (NOE), each waypoint reached in turn
  {
    const P0 = W.PAD, wps = [[P0.x - 300, P0.z + 200], [P0.x + 250, P0.z + 180], [P0.x + 220, P0.z - 260], [P0.x - 260, P0.z - 220]];
    const A = mk(); A.S.reset([P0.x - 500, 40, P0.z + 300], 0, false); A.S.body.vel[2] = -30; const AI = createCobraAI({ id: 0.4 });
    let k = 0, t = 0, minAgl = 99, maxSp = 0;
    for (; t < 240 && k < wps.length && !A.S.dead; t += DT) {
      const [x, z] = wps[k]; fly(A, AI, null, { task: { kind: 'strike', x, z, r: 1 }, time: t }); A.S.step(DT, A.P.ctl, env);
      if (Math.hypot(A.S.body.pos[0] - x, A.S.body.pos[2] - z) < 130) k++;
      if (t > 10) { minAgl = Math.min(minAgl, A.S.agl); maxSp = Math.max(maxSp, A.S.ias); }
    }
    T.check('waypoint course round the island (NOE)', k === wps.length && !A.S.dead && minAgl > 4, `${k}/${wps.length} waypoints in ${t.toFixed(0)} s, lowest ${minAgl.toFixed(1)} m AGL, top ${maxSp.toFixed(0)} KIAS${A.S.dead ? ', DEAD ' + A.S.dead : ''}`, 'all, never below 4 m');
  }
  // attack sortie: a ground target on the hillside; pop-ups, a rocket pass, breaks - and a WASP-like air target
  {
    const P0 = W.PAD, gx = P0.x - 45, gz = P0.z + 40, tgt = { x: gx, y: W.terrain(gx, gz) + 1.2, z: gz, vx: 0, vy: 0, vz: 0 };
    const A = mk(); A.S.reset([P0.x - 700, 40, P0.z + 500], 0, false); const AI = createCobraAI({ id: 0.3 });
    const modes = new Set(); let gunT = 0, rk = 0, rkCd = 0, minD = 1e9, minAgl = 99, rockets = 14;
    for (let t = 0; t < 180 && !A.S.dead; t += DT) {
      const los = world.los(A.S.body.pos[0], A.S.body.pos[1], A.S.body.pos[2], tgt.x, tgt.y + 1, tgt.z);
      fly(A, AI, tgt, { task: { kind: 'strike', x: P0.x, z: P0.z }, time: t, los, rockets, gun: 750 }); A.S.step(DT, A.P.ctl, env);
      modes.add(AI.mode); if (AI.fireGun) gunT += DT; rkCd -= DT; if (AI.fireRockets && rkCd <= 0 && rockets > 0) { rk += 2; rockets -= 2; rkCd = 0.35; }
      minD = Math.min(minD, Math.hypot(A.S.body.pos[0] - tgt.x, A.S.body.pos[2] - tgt.z)); if (t > 5) minAgl = Math.min(minAgl, A.S.agl);
    }
    const need = ['approach', 'popup', 'remask', 'run', 'break'];   // (the bench's own rocket counter: pairs at 0.35 s, as the unit)
    T.check('attack sortie: battle positions, pop-ups, running fire, breaks', need.every(m => modes.has(m)) && !A.S.dead, `modes ${[...modes].join(' ')}${A.S.dead ? ', DEAD ' + A.S.dead : ''}`, need.join(' '));
    T.check('attack sortie: weapons used, kept out of the target\'s face', gunT > 8 && rk >= 6 && minD > 60 && minAgl > 3 && !A.S.dead, `gun ${gunT.toFixed(0)} s on, ${rk} rockets, closest ${minD.toFixed(0)} m, lowest ${minAgl.toFixed(1)} m AGL${A.S.dead ? ", DEAD " + A.S.dead : ""}`, 'gun > 8 s, >= 6 rockets, > 60 m, > 3 m AGL');
    // air target: a hovering WASP; the Cobra stands off outside its 110 m reach and works it with the turret
    const air = { x: P0.x + 150, y: 40, z: P0.z - 120, vx: 0, vy: 0, vz: 0, air: true }; let close = 1e9, gunA = 0;
    for (let t = 0; t < 60 && !A.S.dead; t += DT) { if (A.S.dead) break; A.tA = t;
      fly(A, AI, air, { task: { kind: 'guard', x: P0.x, z: P0.z }, time: t, los: true, rockets, gun: 750 }); A.S.step(DT, A.P.ctl, env);
      if (t > 25) close = Math.min(close, Math.hypot(A.S.body.pos[0] - air.x, A.S.body.pos[1] - air.y, A.S.body.pos[2] - air.z)); if (AI.fireGun) gunA += DT;
    }
    T.check('air target: stand-off outside the WASP\'s reach, turret on', close > 110 && gunA > 8 && !A.S.dead, `closest ${close.toFixed(0)} m after the run-in (t ${(A.tA ?? 0).toFixed(1)}), gun ${gunA.toFixed(0)} s on${A.S.dead ? ', DEAD ' + A.S.dead : ''}`, '> 110 m, > 8 s');
    // home: back to the moving deck, a hover over the spot
    let dHome = 1e9, tH = 0;
    for (let t = 0; t < 150 && !A.S.dead; t += DT) {
      W.move(DT); const s = W.spot(-2, 31);
      fly(A, AI, null, { task: { kind: 'home', x: s.x, y: s.y, z: s.z, vx: s.vx, vz: s.vz, hdg: s.hdg }, time: t }); A.S.step(DT, A.P.ctl, env);
      dHome = Math.hypot(A.S.body.pos[0] - s.x, A.S.body.pos[2] - s.z); tH = t; if (dHome < 25 && A.S.body.pos[1] < s.y + 25) break;
    }
    T.check('home: over the moving deck spot', dHome < 25 && !A.S.dead, `${dHome.toFixed(0)} m off the spot after ${tH.toFixed(0)} s`, '< 25 m (the war recovers it there)');
  }
}
T.done();
