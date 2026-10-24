// RUNAWAY squad AI: perception, cover, fire and manoeuvre, flanking, suppression, target priority, retreat / regroup,
// and vehicle + infantry combined tactics. Pure (no THREE, no DOM): runs in node (tools/runawaybench.mjs) and the
// browser (dev/runaway.html; wave 2: war.js).
//
// INTERFACES
//   ai = createSquadAI(world, { seed })          world = makeWorldQuery(...) (rwworld.js): height, los, coverPoints,
//                                                 coverScore, hullDown, steer
//   ai.addSquad({ id, side, members, order })   members = adapters the host keeps current every frame:
//       { id, kind: 'strider' | 'hovertank' | 'mbt', x, y, z, yaw, eye (m over its y), alive, up (on its feet / able),
//         hp (0..1), weapon: { range, antiArmor, rpm (rounds / min, for the volley clock) }, vehicle: bool }
//     each member gets m.ai = { move: [x, z] | null, run: bool, crouch: 0..1, face: yaw | undefined,
//                               aim: [x, y, z] | null, aimId, fire: bool, state, note }   (read by the host)
//   ai.order(squadId, order)                     from the war.js commander:
//       { type: 'take', x, z, r }   clear and hold the island pad at (x, z)
//       { type: 'defend', x, z, r } hold cover round (x, z), engage what comes within r + 150 m
//       { type: 'patrol', points: [[x, z], ...] }   { type: 'hold' }   { type: 'retreat', x, z }
//   ai.hear({ x, y, z, loud, side, kind })       a sound (shots ~250-400 m, blasts ~600 m, engines ~150 m)
//   ai.nearMiss(memberId, strength)              a round passed close / hit (suppression input)
//   ai.update(dt, targets)                       targets = everything that can be seen / shot:
//       { id, side, kind: 'inf' | 'mg' | 'at' | 'vehicle', x, y, z, vx, vz, h (height), alive, firing (s since its
//         last shot, Infinity if never), cover (0..1 how well it is hidden right now) }
//
// MACHINE TRAITS (deliberate, documented for gameplay - exploitable weaknesses):
//   * Data link: the squad shares everything one member sees, instantly; sounds are triangulated across members.
//     Kill the LINK NODE (member 0, marked on its head) and the squad drops to individual perception for 8 s and
//     FREEZES for 1.5 s while it re-elects.
//   * Synchronised volleys: every member fires on one clock (2.4 s on, 0.9 s off) and they reload together - a
//     predictable window to move in.
//   * Exact bounds: fire-team bounds last exactly BOUND_T seconds, every time.
//   * Always flank RIGHT (their right) at the same angle: learn it and meet them there.
//   * Strict threat priority: they all shoot the single highest-threat target - a loud machine gun or an AT gunner
//     draws every rifle (decoys work).
//   * They investigate loud sounds: noise pulls them.
// Fearless but not stupid: suppression makes them hold and take cover, it decays fast (they don't panic, they wait).

import { rng } from './rwworld.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const AI_T = {
  THINK: 0.5,             // s between squad decisions
  BOUND_T: 6.0,           // s per fire-team bound (exact: a machine trait)
  VOLLEY_ON: 2.4, VOLLEY_OFF: 0.9,
  FLANK_ANG: 1.3,         // rad off the enemy-to-squad axis, always to the squad's right
  LINK_DOWN: 8, FREEZE: 1.5,
  SIGHT: { strider: 260, hovertank: 330, mbt: 330 },   // m, daylight
  FOV: { strider: 2.2, hovertank: 6.3, mbt: 3.2 },      // rad full cone (the hover tank's sensor mast sees all round)
  ROTOR: 180,             // m: an aircraft low over the island is heard all round - its bearing is found without facing it
  RETREAT_RATIO: 0.55, ASSAULT_RATIO: 2.4,
  POWER: { strider: 1.8, hovertank: 5, mbt: 6 },
  THREAT: { inf: 1, mg: 1.6, at: 1.8, vehicle: 4, air: 2 },   // (air: a helicopter low over the fight - GROUND WAR, wave 2)
};
// how much a member wants to shoot a target kind (strict priorities: machines are predictable)
const PRIO = {
  strider: { at: 3.2, mg: 2.4, inf: 1.6, vehicle: 0.35, air: 0.5 },
  hovertank: { vehicle: 3.5, at: 2.8, mg: 1.6, inf: 1.0, air: 1.0 },
  mbt: { vehicle: 3.5, at: 2.4, mg: 1.6, inf: 1.0, air: 0.6 },
};

export function createSquadAI(world, opt = {}) {
  const R = rng(opt.seed ?? 7);
  const AI = { squads: [], time: 0, sounds: [], log: [] };
  const byMember = new Map();

  AI.addSquad = (sq) => {
    const S = { id: sq.id, side: sq.side ?? 2, members: sq.members, order: sq.order || { type: 'hold' }, state: 'advance', stateT: 0,
      know: new Map(), thinkT: R() * AI_T.THINK, boundT: 0, team: 0, linkDown: 0, freeze: 0, leader: sq.members[0]?.id, volley0: 0,
      flank: null, rally: null, ratio: 1, contactT: 0, lastEnemyCount: 0, note: '', patrolI: 0 };
    sq.members.forEach((m, i) => { m.ai = { move: null, run: false, crouch: 0, face: undefined, aim: null, aimId: null, fire: false, state: 'idle', note: '', supp: 0, team: i % 2, dest: null, cover: null, own: new Map(), spot: new Map() }; byMember.set(m.id, { m, S }); });
    AI.squads.push(S); return S;
  };
  AI.order = (id, order) => { const S = AI.squads.find(s => s.id === id); if (S) { S.order = order; S.patrolI = 0; S.holdUntil = 0; if (S.state !== 'retreat') setState(S, 'advance'); } };
  // GROUND WAR (wave 2): a unit joins a squad already in the field (a hover tank or an MBT landed as reinforcement)
  AI.addMember = (id, m) => { const S = AI.squads.find(s => s.id === id); if (!S) return null; m.ai = { move: null, run: false, crouch: 0, face: undefined, aim: null, aimId: null, fire: false, state: 'idle', note: '', supp: 0, team: S.members.length % 2, dest: null, cover: null, own: new Map(), spot: new Map() }; S.members.push(m); byMember.set(m.id, { m, S }); return S; };
  AI.removeSquad = id => { const i = AI.squads.findIndex(s => s.id === id); if (i < 0) return; for (const m of AI.squads[i].members) byMember.delete(m.id); AI.squads.splice(i, 1); };
  AI.hear = (ev) => { AI.sounds.push({ ...ev, t: AI.time }); };
  AI.nearMiss = (id, k = 0.15) => { const e = byMember.get(id); if (e) e.m.ai.supp = clamp(e.m.ai.supp + k, 0, 1.2); };

  function setState(S, st, note = '') { if (S.state !== st) { S.state = st; S.stateT = 0; AI.log.push({ t: AI.time, sq: S.id, st, note }); } S.note = note; }
  const alive = S => S.members.filter(m => m.alive);

  // ------------------------------------------------------------------------------------------------- perception
  function perceive(S, dt, targets) {
    const link = S.linkDown <= 0;
    for (const m of S.members) {
      if (!m.alive) continue;
      // each sensor sweeps 10 times a second (staggered across the squad): spotting integrates over the sweep
      const a = m.ai; a.lookAcc = (a.lookAcc ?? (m.id % 3) * 0.034) + dt; if (a.lookAcc < 0.1) continue;
      const ldt = a.lookAcc; a.lookAcc = 0;
      const sight = AI_T.SIGHT[m.kind] * (m.blind ? 0 : 1), fov = AI_T.FOV[m.kind] / 2;
      for (const t of targets) {
        if (!t.alive || t.side === S.side) continue;
        const dx = t.x - m.x, dz = t.z - m.z, d = Math.hypot(dx, dz);
        let sp = a.spot.get(t.id) || 0;
        let vis = false;
        if (d < sight) {
          const ang = Math.atan2(-dx, -dz), off = Math.abs(((ang - (m.headYaw ?? m.yaw)) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
          if (off < fov || d < 25 || (t.kind === 'air' && d < AI_T.ROTOR)) vis = world.los(m.x, m.y + m.eye, m.z, t.x, t.y + t.h * 0.92, t.z) || world.los(m.x, m.y + m.eye, m.z, t.x, t.y + t.h * 0.6, t.z) || world.los(m.x, m.y + m.eye, m.z, t.x, t.y + t.h * 0.3, t.z);
        }
        if (vis) {
          // detection builds faster close in, on movers and shooters, slower on targets in cover
          const mv = Math.hypot(t.vx || 0, t.vz || 0), rate = (1.6 + 2.5 * Math.min(1, mv / 2) + (t.firing < 2 ? 3 : 0)) * (1 - 0.7 * (t.cover || 0)) * clamp(1.4 - d / sight, 0.15, 1.4) * (t.kind === 'vehicle' ? 2 : 1);
          sp = Math.min(1.5, sp + rate * ldt);
        } else sp = Math.max(0, sp - ldt * 0.5);
        a.spot.set(t.id, sp);
        if (vis && sp >= 1) {
          const k = { id: t.id, x: t.x, y: t.y, z: t.z, vx: t.vx || 0, vz: t.vz || 0, h: t.h, kind: t.kind, t: AI.time, conf: 1, err: 0, seen: true, by: m.id, firing: t.firing };
          a.own.set(t.id, k);
          if (link || m.id === S.leaderNow) S.know.set(t.id, k); else if (!S.know.has(t.id)) S.know.set(t.id, { ...k });
        }
      }
    }
    // sounds: a gunshot is heard by every member in range; the data link triangulates (error shrinks with listeners)
    for (const ev of AI.sounds) {
      if (ev.side === S.side) continue;
      const ears = S.members.filter(m => m.alive && dist2(m.x, m.z, ev.x, ev.z) < ev.loud);
      if (!ears.length) continue;
      const d = Math.min(...ears.map(m => dist2(m.x, m.z, ev.x, ev.z))), err = d * 0.12 / (link ? Math.sqrt(ears.length) : 1);
      const id = ev.src ?? ('snd' + Math.round(ev.x / 10) + ',' + Math.round(ev.z / 10));
      const old = S.know.get(id);
      if (old && old.seen && AI.time - old.t < 1.5) { old.firing = 0; continue; }   // already in sight: just note it fired
      const a = R() * 2 * Math.PI, e = R() * err;
      S.know.set(id, { id, x: ev.x + Math.cos(a) * e, y: ev.y, z: ev.z + Math.sin(a) * e, vx: 0, vz: 0, h: 1.6, kind: targets.find(t => t.id === id)?.kind || old?.kind || (ev.kind === 'blast' ? 'at' : 'inf'), t: AI.time, conf: Math.max(old?.conf || 0, 0.6), err, seen: false, heard: true, by: ears[0].id, firing: 0 });
    }
    // decay: a contact not seen for a while fades; extrapolate briefly along its last velocity
    for (const [id, k] of S.know) {
      const age = AI.time - k.t;
      if (k.seen && age > 1) k.seen = false;
      k.conf = Math.max(0, (k.heard && !k.seen ? 0.6 : 1) - age / 45);
      if (age < 4) { k.px = k.x + k.vx * age; k.pz = k.z + k.vz * age; } else { k.px = k.x + k.vx * 4; k.pz = k.z + k.vz * 4; }
      if (k.conf <= 0) S.know.delete(id);
      const tg = targets.find(t => t.id === id); if (tg && !tg.alive) S.know.delete(id);
    }
  }
  function enemies(S, m) {
    const list = [];
    const link = S.linkDown <= 0;
    for (const k of (link || !m ? S.know : m.ai.own).values()) if (k.conf > 0.15) list.push(k);
    return list;
  }
  function threatOf(k, x, z) { return AI_T.THREAT[k.kind] * k.conf / (1 + dist2(k.px ?? k.x, k.pz ?? k.z, x, z) / 120) * (k.firing < 3 ? 1.6 : 1); }

  // ------------------------------------------------------------------------------------------------- squad brain
  function think(S) {
    const ms = alive(S); if (!ms.length) { setState(S, 'dead'); return; }
    // link node: the first living member; losing it costs the link and a freeze
    const lead = ms[0].id;
    if (S.leaderNow !== undefined && S.leaderNow !== lead) { S.linkDown = AI_T.LINK_DOWN; S.freeze = AI_T.FREEZE; AI.log.push({ t: AI.time, sq: S.id, st: 'LINK LOST', note: 'node ' + S.leaderNow + ' down' }); }
    S.leaderNow = lead;
    // the squad's centre is its walkers' (the armour keeps station on them, not the other way round)
    const core = ms.some(m => !m.vehicle) ? ms.filter(m => !m.vehicle) : ms;
    const cx = core.reduce((s, m) => s + m.x, 0) / core.length, cz = core.reduce((s, m) => s + m.z, 0) / core.length;
    S.cx = cx; S.cz = cz;
    const en = enemies(S);
    let own = 0, theirs = 0;
    for (const m of ms) own += AI_T.POWER[m.kind] * (0.3 + 0.7 * m.hp) * (m.up ? 1 : 0.3);
    // (the data link spans squads: friendly machines within 200 m count, at 70%)
    for (const O2 of AI.squads) if (O2 !== S && O2.side === S.side) for (const m of O2.members) if (m.alive && dist2(m.x, m.z, cx, cz) < 200) own += 0.7 * AI_T.POWER[m.kind] * (0.3 + 0.7 * m.hp);
    for (const k of en) if (k.conf > 0.3 && dist2(k.x, k.z, cx, cz) < 350) theirs += AI_T.THREAT[k.kind] * (k.kind === 'at' && ms.some(m => m.vehicle) ? 1.5 : 1);
    S.ratio = theirs > 0 ? own / theirs : 99;
    const near = en.filter(k => k.conf > 0.35 && dist2(k.px, k.pz, cx, cz) < 320);
    // ngc/rwground-polish: an aircraft working the squad over (it fired in the last few seconds and is within reach, or
    // it is right on top of them): the walkers break for cover from IT and spread out, the hover tanks keep moving
    let air = null, airD = 1e9;
    for (const k of en) if (k.kind === 'air' && k.conf > 0.4 && AI.time - k.t < 4) { const d = dist2(k.px ?? k.x, k.pz ?? k.z, cx, cz); if ((d < 350 && (k.firing ?? 99) < 5) || d < 90) if (d < airD) { airD = d; air = k; } }
    if (air && !S.air) AI.log.push({ t: AI.time, sq: S.id, st: 'AIR', note: 'aircraft on us: cover + disperse' });
    S.air = air ? { id: air.id, x: air.px ?? air.x, y: air.y ?? world.height(air.x, air.z) + 30, z: air.pz ?? air.z } : null;
    const O = S.order;
    // the main threat axis
    let tx = 0, tz = 0, tw = 0; for (const k of near) { const w = threatOf(k, cx, cz); tx += k.px * w; tz += k.pz * w; tw += w; }
    S.threat = tw ? [tx / tw, tz / tw] : null;
    // ---- retreat / regroup
    if (S.state === 'retreat') {
      if (!near.length || dist2(cx, cz, S.rally[0], S.rally[1]) < 15 || S.stateT > 40) { setState(S, 'regroup', 'reached rally'); S.regroupT = 0; S.holdUntil = AI.time + 30; }   // (then hold at the rally: re-tasking is the commander's call)
      return;
    }
    if (O.type === 'retreat' || (near.length && S.ratio < AI_T.RETREAT_RATIO && O.type !== 'defend')) {
      // fall back away from the threat (toward the order's rally, or straight back), one team covering the other
      const ax = S.threat ? cx - S.threat[0] : 0, az = S.threat ? cz - S.threat[1] : 1, al = Math.hypot(ax, az) || 1;
      S.rally = O.type === 'retreat' ? [O.x, O.z] : [cx + ax / al * 120, cz + az / al * 120];
      for (let i = 0; i < 6 && world.isWater(S.rally[0], S.rally[1]); i++) { S.rally[0] = (S.rally[0] + cx) / 2; S.rally[1] = (S.rally[1] + cz) / 2; }
      setState(S, 'retreat', `outnumbered ${S.ratio.toFixed(2)}`); S.boundT = 0; return;
    }
    if (S.state === 'regroup') {
      const spread = Math.max(...core.map(m => dist2(m.x, m.z, cx, cz)));
      S.regroupT = (S.regroupT || 0) + AI_T.THINK;
      if (spread < 14 || S.regroupT > 12) setState(S, near.length ? 'contact' : 'advance', 'regrouped');
      return;
    }
    S.fightT = near.length ? (S.fightT || 0) + AI_T.THINK : 0;   // (how long this engagement has gone on)
    // a flank in progress is a commitment: it runs its course (or its flankers go down)
    if (S.state === 'flank') {
      S.flank.t += AI_T.THINK;
      const fl = ms.filter(m => m.ai.flanker && m.up), there = fl.length && fl.every(m => dist2(m.x, m.z, S.flank.x, S.flank.z) < 14);
      if (!fl.length) { setState(S, 'contact', 'flankers lost'); S.contactT = -20; }
      else if (S.flank.t > 40 || (there && S.flank.t > 12 && !near.length)) { setState(S, near.length ? 'contact' : 'advance', 'flank done: push on'); S.contactT = -25; }
      return;
    }
    if (!near.length) {
      const spread = Math.max(...core.map(m => dist2(m.x, m.z, cx, cz)));
      if (spread > 45 && S.state !== 'advance') { setState(S, 'regroup', 'spread out'); S.regroupT = 0; S.rally = [cx, cz]; return; }
      const holdOn = (S.holdUntil ?? 0) > AI.time;
      setState(S, O.type === 'defend' ? 'defend' : O.type === 'hold' || holdOn ? 'hold' : 'advance', holdOn ? 'holding at the rally' : ''); S.contactT = 0; return;
    }
    // ---- contact
    S.contactT += AI_T.THINK;
    if (O.type === 'defend') { setState(S, 'defend', 'engaging'); return; }
    if (S.state !== 'contact' && S.state !== 'flank' && S.state !== 'assault') { setState(S, 'contact', 'contact: to cover'); S.boundT = 0; S.team = 0; for (const m of ms) m.ai.cover = null; }
    // assault when strong and the enemy is close and quiet
    const nearest = Math.min(...near.map(k => dist2(k.px, k.pz, cx, cz)));
    const quiet = near.every(k => (k.firing ?? 99) > 2.5);
    if (S.ratio > AI_T.ASSAULT_RATIO && S.contactT > 12 && nearest < 70 && quiet) { if (S.state !== 'assault') setState(S, 'assault', `ratio ${S.ratio.toFixed(1)}`); return; }
    // flank when the fight stalls: contact for a while, the enemy count not falling, enough bodies to split
    const striders = ms.filter(m => !m.vehicle && m.up);
    if (S.state === 'contact' && S.contactT > 10 && nearest < 170 && near.length >= S.lastEnemyCount && striders.length >= 3 && S.threat) {
      const ax = cx - S.threat[0], az = cz - S.threat[1], d = Math.hypot(ax, az) || 1, base = Math.atan2(az, ax);
      // always their RIGHT: facing the enemy, right = clockwise seen from above (y up, x right, z toward the viewer)
      const a = base - AI_T.FLANK_ANG, r = clamp(d * 0.75, 35, 110);
      let fx = S.threat[0] + Math.cos(a) * r, fz = S.threat[1] + Math.sin(a) * r;
      if (world.isWater(fx, fz)) { fx = (fx + S.threat[0]) / 2; fz = (fz + S.threat[1]) / 2; }
      S.flank = { x: fx, z: fz, t: 0 };
      // the flankers: team 1's walkers that can walk (topped up from team 0 if short), never the link node
      for (const m of ms) m.ai.flanker = !m.vehicle && m.up && m.ai.team === 1 && m.id !== S.leaderNow;
      for (const m of striders) if (ms.filter(q => q.ai.flanker).length < 2 && !m.ai.flanker && m.id !== S.leaderNow) m.ai.flanker = true;
      setState(S, 'flank', 'stalled: flank right');
    }
    S.lastEnemyCount = Math.max(S.lastEnemyCount * 0.9, near.length);
  }

  // ------------------------------------------------------------------------------------------------- members
  // how close armour lets a known AT gunner get: the M1 / T-90 frontal armour shrugs off a 1980 launcher (it keeps
  // its front to the gunner), the RW-7 trusts its point defence for half the shots
  const atSafe = m => m.kind === "mbt" ? 150 : 180;
  // the nearest AT gunner any friendly squad knows of (the data link spans squads)
  function nearestAT(S, x, z) {
    let best = null;
    for (const O2 of AI.squads) if (O2.side === S.side && (O2 === S || O2.linkDown <= 0)) for (const k of O2.know.values()) if (k.kind === 'at' && k.conf > 0.2) { const d = dist2(k.px ?? k.x, k.pz ?? k.z, x, z); if (!best || d < best.d) best = { k: { ...k, px: k.px ?? k.x, pz: k.pz ?? k.z }, d }; }
    return best;
  }
  function pickTarget(S, m) {
    let best = null, bs = 0;
    const pr = PRIO[m.kind];
    for (const k of enemies(S, m)) {
      const d = dist2(k.px, k.pz, m.x, m.z); if (d > m.weapon.range * 1.15) continue;
      // (strict priority among what this machine can engage: its own sensors on it now count most)
      const mine = m.ai.own.get(k.id), mineNow = mine && AI.time - mine.t < 1.5;
      let s = pr[k.kind] * k.conf / (1 + d / 90) * (k.firing < 3 ? 1.5 : 1) * (mineNow ? 2.2 : k.seen ? 0.8 : 0.5);
      if (!m.weapon.antiArmor && k.kind === 'vehicle') s *= 0.2;
      // combined arms: striders hunt AT gunners that threaten their vehicles
      if (!m.vehicle && k.kind === 'at') for (const v of S.members) if (v.alive && v.vehicle && dist2(v.x, v.z, k.px, k.pz) < 320) { s *= 1.8; break; }
      if (s > bs) { bs = s; best = k; }
    }
    return best;
  }
  function chooseCover(S, m, anchorX, anchorZ, maxR = 32, from = null) {
    const thr = from ? [from.x, from.z] : S.threat; if (!thr) return null;   // (from: cover from somewhere else - an aircraft)
    const ty = from ? from.y : world.height(thr[0], thr[1]) + 1.5;
    let best = null, bs = -1e9;
    for (const cp of world.coverPoints(anchorX, anchorZ, maxR, [])) {
      if (cp.taken && cp.taken !== m.id && cp.takenT > AI.time) continue;
      if (world.isWater(cp.x, cp.z)) continue;
      const sc = world.coverScore(cp, thr[0], ty, thr[1]);
      const dMe = dist2(cp.x, cp.z, m.x, m.z), dAnchor = dist2(cp.x, cp.z, anchorX, anchorZ), dThr = dist2(cp.x, cp.z, thr[0], thr[1]);
      let s = (sc.hidden ? 3 : 0) + (sc.canFire ? 2.2 : 0) + sc.facing - dMe / 18 - dAnchor / 14 + (dThr < 25 ? -3 : 0) + (dThr > m.weapon.range ? -2 : 0);
      if (s > bs) { bs = s; best = cp; }
    }
    // no wall or rock that works: use the ground itself - a fold or crest that hides a crouched machine from the threat
    // but lets it shoot standing (sampled on rings round the anchor)
    if (!best || bs < 2) {
      let tb = null, ts = -1e9;
      for (let i = 0; i < 18; i++) {
        const a = i * 2.4, r = 5 + (i % 6) * 4, x = anchorX + Math.cos(a) * r, z = anchorZ + Math.sin(a) * r;
        if (world.isWater(x, z)) continue;
        const y = world.height(x, z), hid = !world.los(thr[0], ty, thr[1], x, y + 0.75, z), shoot = world.los(x, y + 1.9, z, thr[0], ty, thr[1]);
        const s = (hid ? 3 : 0) + (shoot ? 2.2 : 0) - dist2(x, z, m.x, m.z) / 18 - dist2(x, z, anchorX, anchorZ) / 14;
        if (s > ts) { ts = s; const dx = x - thr[0], dz = z - thr[1], l = Math.hypot(dx, dz) || 1; tb = { x, z, y, h: 1.0, nx: dx / l, nz: dz / l, terrain: true }; }
      }
      if (tb && ts > bs && ts >= 3) return tb;
    }
    if (best) { best.taken = m.id; best.takenT = AI.time + 12; }
    return best;
  }
  function vehiclePosition(S, m, wantX, wantZ, standoff, ref, push) {
    // a firing position for armour: on an arc round the threat at the stand-off range (and a little beyond), the one
    // that sees the threat - hull-down if the ground offers it - nearest to where the vehicle is, never inside a
    // known AT gunner's reach, never on ground too steep to sit on
    const thr = S.threat || ref; if (!thr) return [wantX, wantZ];
    const ty = world.height(thr[0], thr[1]) + 1.6, b0 = Math.atan2(wantZ - thr[1], wantX - thr[0]);
    let best = [wantX, wantZ], bs = -1e9;
    for (let i = -6; i <= 6; i++) for (const dr of [0, 40, 80, 130]) {
      const a = b0 + i * 0.2, r = standoff + dr, x = thr[0] + Math.cos(a) * r, z = thr[1] + Math.sin(a) * r;
      if (dist2(x, z, m.x, m.z) > 90) continue;   // (a position within reach: no cross-island detours)
      if (world.isWater(x, z)) continue;
      const n = world.normal(x, z); if (n[1] < Math.cos(m.kind === 'hovertank' ? 0.3 : 0.38)) continue;
      const at = nearestAT(S, x, z); if (!push && at && at.d < atSafe(m)) continue;
      const top = world.los(x, world.height(x, z) + (m.kind === 'mbt' ? 2.4 : 2.1), z, thr[0], ty, thr[1]);
      const hd = top && world.hullDown(x, z, thr[0], ty, thr[1], 1.3, m.kind === 'mbt' ? 2.5 : 2.2);
      const s = (hd ? 6 : 0) + (top ? 4 : -4) - dist2(x, z, m.x, m.z) / 30 - Math.abs(i) * 0.15 - dr / 50;   // (closer in is likelier to see over the ground)
      if (s > bs) { bs = s; best = [x, z]; }
    }
    return best;
  }
  function act(S, m, dt) {
    const a = m.ai; a.supp = Math.max(0, a.supp - dt * 0.35);
    if (!m.alive) { a.move = null; a.fire = false; a.state = 'dead'; return; }
    const O = S.order, ms = alive(S), lead = ms[0];
    const n = ms.indexOf(m), cx = S.cx ?? m.x, cz = S.cz ?? m.z;
    a.fire = false; a.aim = null; a.aimId = null; a.face = undefined; a.run = false; a.crouch = 0;
    // sensor scan: each machine owns a sector of the circle (the squad covers all round) and sweeps it in precise
    // jumps - the head snaps 0.4 rad every 0.45 s, then holds dead still (uncanny, and readable)
    { const N = S.members.length, base = S.threat ? Math.atan2(-(S.threat[0] - m.x), -(S.threat[1] - m.z)) : (S.scanBase ?? (S.scanBase = m.yaw)); const sector = base + (S.threat ? (n - (N - 1) / 2) * 0.35 : n * 2 * Math.PI / Math.max(1, N)); const k = Math.floor(AI.time / 0.45 + m.id) % 4; a.look = sector + [-0.6, -0.2, 0.2, 0.6][k]; }
    // ---- targeting (every state): strict priority, fire on the squad's volley clock
    const tgt = pickTarget(S, m);
    if (tgt) {
      // aim centre mass, or at what shows over cover
      const ty0 = (tgt.y ?? world.height(tgt.px, tgt.pz));
      a.aimId = tgt.id; a.aim = [tgt.px, ty0 + tgt.h * 0.6, tgt.pz];
      for (const k of [0.88, 0.97]) if (!world.los(m.x, m.y + (m.gun ?? m.eye), m.z, a.aim[0], a.aim[1], a.aim[2])) a.aim[1] = ty0 + tgt.h * k;
      const vol = ((AI.time - S.volley0) % (AI_T.VOLLEY_ON + AI_T.VOLLEY_OFF)) < AI_T.VOLLEY_ON;
      const canSee = tgt.seen || (AI.time - tgt.t < 1.2);
      const suppress = !canSee && tgt.conf > 0.5 && dist2(tgt.px, tgt.pz, m.x, m.z) < 140 && (S.state === 'contact' || S.state === 'flank' || S.state === 'defend');
      // aimed fire needs the shooter's own line from the muzzle; otherwise it is suppressive fire into the target's
      // cover (rounds striking within 3.5 m keep its head down), at a third of the volley rate (machines ration it)
      const clear = world.los(m.x, m.y + (m.gun ?? m.eye), m.z, a.aim[0], a.aim[1], a.aim[2]);
      let ok = clear && canSee;
      if (!ok && (suppress || canSee) && ((AI.time * 2.7 + m.id * 0.37) % 1) < 0.33) { const rc = world.raycast(m.x, m.y + (m.gun ?? m.eye), m.z, a.aim[0], a.aim[1], a.aim[2]); if (rc && rc.kind === 'obstacle') { const L = dist2(m.x, m.z, a.aim[0], a.aim[2]); ok = (1 - rc.t) * L < 3.5; } else if (!rc) ok = true; }
      a.fire = vol && (m.up || m.prone) && ok && dist2(tgt.px, tgt.pz, m.x, m.z) < m.weapon.range;
      a.note = (ok && canSee && clear ? 'engage ' : 'suppress ') + tgt.kind;
    }
    if (S.freeze > 0) { a.move = null; a.state = 'freeze'; a.fire = false; return; }
    // ---- movement by squad state
    const st = S.state;
    let dest = null;
    if (st === 'advance' || st === 'hold' || st === 'regroup') {
      let ox = cx, oz = cz;
      if (st === 'advance') {
        if (O.type === 'take' || O.type === 'defend') { ox = O.x; oz = O.z; }
        else if (O.type === 'patrol' && O.points?.length) { const p = O.points[S.patrolI % O.points.length]; ox = p[0]; oz = p[1]; if (dist2(cx, cz, ox, oz) < 12) S.patrolI++; }
      }
      if (st === 'regroup') { ox = S.rally?.[0] ?? cx; oz = S.rally?.[1] ?? cz; }
      // wedge formation on the squad's heading toward the objective (vehicles 30 m behind, in overwatch)
      const hx = ox - cx, hz = oz - cz, hl = Math.hypot(hx, hz) || 1, fx = hx / hl, fz = hz / hl;
      const rank = Math.ceil(n / 2), side = n % 2 ? 1 : -1;
      let sx = cx + fx * Math.min(12, hl) - fx * rank * 6 + -fz * side * rank * 7, sz = cz + fz * Math.min(12, hl) - fz * rank * 6 + fx * side * rank * 7;
      if (m.vehicle && ms.some(q => !q.vehicle)) {   // (GROUND WAR: an armour-only squad leads itself instead of station-keeping on its own centroid)
        sx = cx - fx * 30 + -fz * side * 12; sz = cz - fz * 30 + fx * side * 12;
        // never roll into a known AT gunner's reach to keep station: stop short of it
        const at = nearestAT(S, sx, sz), sf = atSafe(m); if (at && at.d < sf) { const ax = sx - at.k.px, az = sz - at.k.pz, al = Math.hypot(ax, az) || 1; sx = at.k.px + ax / al * sf; sz = at.k.pz + az / al * sf; }
      }
      if (hl < 8 && st === 'advance') { sx = ox + Math.cos(n * 2.1) * (6 + n * 3); sz = oz + Math.sin(n * 2.1) * (6 + n * 3); }   // spread round the objective
      dest = [sx, sz]; a.state = st === 'regroup' ? 'regroup' : hl < 10 ? 'on objective' : 'advance';
      if (st === 'hold') { dest = dist2(m.x, m.z, cx, cz) > 25 ? [cx, cz] : null; a.state = 'hold'; }
    } else if (st === 'retreat') {
      // bounding withdrawal: the team not moving covers (exact cadence)
      const moving = Math.floor(S.stateT / AI_T.BOUND_T) % 2 === a.team;
      if (moving || m.vehicle) { dest = [S.rally[0] + Math.cos(n * 1.7) * 8, S.rally[1] + Math.sin(n * 1.7) * 8]; a.run = true; a.state = 'withdraw'; if (!m.vehicle) a.fire = false; }
      else { a.state = 'cover withdrawal'; dest = a.cover ? [a.cover.x, a.cover.z] : null; }
    } else if (st === 'contact' || st === 'flank' || st === 'defend' || st === 'assault') {
      if (m.vehicle) {
        // armour: stand off from AT, hull-down in overwatch behind the striders
        const thr = S.threat || [O.x ?? m.x, O.z ?? m.z];
        const atK = nearestAT(S, m.x, m.z), atNear = atK && atK.d < atSafe(m) + 15;
        // cost-benefit (a machine trait): armour that has had no shot for 30 s while the walkers fight accepts the AT
        // risk and pushes in to 100 m - dangerous, and an ambush chance for a gunner who waits
        if (a.fire) a.lastFireT = AI.time;
        const push = S.fightT > 30 && AI.time - (a.lastFireT ?? -1e9) > 30;
        const standoff = push ? 100 : atNear ? atSafe(m) : st === 'assault' ? 60 : 120;
        const ref = atNear ? [atK.k.px, atK.k.pz] : thr, ax = m.x - ref[0], az = m.z - ref[1], al = Math.hypot(ax, az) || 1;
        const wx = ref[0] + ax / al * Math.max(standoff, Math.min(al, 230)), wz = ref[1] + az / al * Math.max(standoff, Math.min(al, 230));
        if (!a.vdest || AI.time - (a.vdestT || 0) > 6 || dist2(a.vdest[0], a.vdest[1], wx, wz) > 40 || (atNear && !a.wasAT)) { a.vdest = vehiclePosition(S, m, wx, wz, standoff, atNear ? ref : null, push); a.vdestT = AI.time; }
        dest = a.vdest; a.wasAT = !!atNear; a.state = push ? 'push in (no shot)' : atNear ? 'stand-off (AT)' : 'overwatch';
        if (tgt) a.face = Math.atan2(-(tgt.px - m.x), -(tgt.pz - m.z));
        else if (atNear && m.kind === 'mbt') a.face = Math.atan2(-(atK.k.px - m.x), -(atK.k.pz - m.z));   // (front armour to the gunner)
      } else if (st === 'assault') {
        const k = tgt || S.threat && { px: S.threat[0], pz: S.threat[1] };
        dest = k ? [k.px + (n - 1) * 4, k.pz + (n % 2) * 4] : null; a.run = true; a.state = 'assault';
      } else if (st === 'flank' && a.flanker) {
        // the flanking team runs cover to cover to the flank point, then engages from there
        const f = S.flank, df = dist2(m.x, m.z, f.x, f.z);
        if (df > 8) { dest = [f.x + (n % 3) * 3, f.z + (n % 2) * 3]; a.run = true; a.state = 'flanking'; if (a.supp < 0.5) a.fire = false; }
        else { if (!a.cover || dist2(a.cover.x, a.cover.z, m.x, m.z) > 12) a.cover = chooseCover(S, m, f.x, f.z, 18); dest = a.cover ? [a.cover.x, a.cover.z] : null; a.state = 'flank: engage'; }
      } else if (st === 'defend') {
        const ox = O.x ?? cx, oz = O.z ?? cz, rr = O.r ?? 30;
        const ang = S.threat ? Math.atan2(S.threat[1] - oz, S.threat[0] - ox) : n * 1.3;
        if (!a.cover || AI.time - (a.coverT || 0) > 15) { a.cover = chooseCover(S, m, ox + Math.cos(ang + (n - 1) * 0.5) * rr * 0.6, oz + Math.sin(ang + (n - 1) * 0.5) * rr * 0.6, rr); a.coverT = AI.time; }
        // (ngc/rwground-polish: no threat known yet - no cover to pick against it - so a perimeter: each walker on its own
        // bearing round the point, facing out, instead of the whole squad bunching on the point itself)
        if (a.cover) dest = [a.cover.x, a.cover.z];
        else {
          const N = Math.max(1, ms.filter(q => !q.vehicle).length), b = (n / N) * 2 * Math.PI + (S.id.length % 7);
          let px = ox + Math.cos(b) * rr * 0.55, pz = oz + Math.sin(b) * rr * 0.55;
          for (let i = 0; i < 6 && world.isWater(px, pz); i++) { px = (px + ox) / 2; pz = (pz + oz) / 2; }
          dest = [px, pz]; if (!tgt) a.face = Math.atan2(-(px - ox), -(pz - oz));
        }
        a.state = 'defend';
      } else {
        // fire and manoeuvre: team (bound index % 2) bounds forward to the next cover; the other suppresses
        const boundI = Math.floor(S.stateT / AI_T.BOUND_T), moving = boundI % 2 === a.team && S.stateT > 3;
        if (a.boundI !== boundI) {
          a.boundI = boundI; a.openDest = null;
          if (moving && a.supp < 0.6) {
            // next cover: 20-30 m toward the objective / enemy, near the line
            const thr = S.threat, ox = O.type === 'take' ? O.x : thr ? thr[0] : m.x, oz = O.type === 'take' ? O.z : thr ? thr[1] : m.z;
            const dx = ox - m.x, dz = oz - m.z, dl = Math.hypot(dx, dz) || 1, step = Math.min(26, Math.max(0, dl - 35));
            a.cover = chooseCover(S, m, m.x + dx / dl * step, m.z + dz / dl * step, 22);
          } else if (!a.cover) a.cover = chooseCover(S, m, m.x, m.z, 30);
        }
        if (a.boundI === boundI && !a.cover && moving && !a.openDest) {   // no cover there: bound to the spot in the open
          const thr = S.threat, ox = O.type === 'take' ? O.x : thr ? thr[0] : m.x, oz = O.type === 'take' ? O.z : thr ? thr[1] : m.z;
          const dx = ox - m.x, dz = oz - m.z, dl = Math.hypot(dx, dz) || 1, step = Math.min(22, Math.max(0, dl - 35));
          a.openDest = [m.x + dx / dl * step + (n - 1.5) * 3, m.z + dz / dl * step];
        }
        if (!moving) a.openDest = null;
        dest = a.cover ? [a.cover.x, a.cover.z] : a.openDest;
        a.run = moving; a.state = moving ? 'bound' : 'cover / suppress';
        if (moving && dest && dist2(dest[0], dest[1], m.x, m.z) > 3 && a.supp < 0.5) a.fire = a.fire && false;
      }
    }
    // ngc/rwground-polish: under air attack - every walker that isn't the one shooting back at the aircraft (or a
    // flanker committed to its run) goes to the nearest cover from the aircraft's side, crouched, and nobody stays
    // bunched: a squad mate within 7 m steps off; a hover tank never sits still (it jinks round its position)
    if (S.air && st !== 'retreat') {
      if (!m.vehicle) {
        const shootingAir = a.aimId === S.air.id && a.fire;
        if (!shootingAir && !(st === 'flank' && a.flanker)) {
          if (AI.time - (a.airCoverT ?? -99) > (a.airCover ? 8 : 2)) { a.airCover = chooseCover(S, m, m.x, m.z, 20, S.air); a.airCoverT = AI.time; }   // (none: look again in 2 s, not every step)
          if (a.airCover) { a.cover = a.airCover; dest = [a.airCover.x, a.airCover.z]; a.run = true; a.state = 'air: to cover'; }
          else {
            // ngc/integ: no cover from it within reach (open sand - a flat cay, a beach): break sideways off its line of
            // fire, each walker its own way, a fresh dash every few seconds - never stand still under the door gun
            if (!a.airDash || AI.time - a.airDashT > 5 || dist2(a.airDash[0], a.airDash[1], m.x, m.z) < 1.5) {
              const bx = m.x - S.air.x, bz = m.z - S.air.z, bl = Math.hypot(bx, bz) || 1, sd = (m.id + Math.floor(AI.time / 5)) % 2 ? 1 : -1;
              let px = -bz / bl * sd * 12, pz = bx / bl * sd * 12; if (world.isWater(m.x + px, m.z + pz)) { px = -px; pz = -pz; }
              a.airDash = world.isWater(m.x + px, m.z + pz) ? null : [m.x + px, m.z + pz]; a.airDashT = AI.time;
            }
            if (a.airDash) { dest = a.airDash; a.run = true; a.state = 'air: disperse'; }
          }
        }
        let nb = null, nd = 7;
        for (const q of ms) if (q !== m && !q.vehicle) { const d = dist2(q.x, q.z, m.x, m.z); if (d < nd) { nd = d; nb = q; } }
        if (nb && !(dest && a.cover && dist2(dest[0], dest[1], m.x, m.z) < 1.5)) {
          const ax = m.x - nb.x, az = m.z - nb.z, al = Math.hypot(ax, az) || 1, k = (7.5 - nd) + 1;
          const b = dest || [m.x, m.z]; dest = [b[0] + ax / al * k, b[1] + az / al * k]; if (world.isWater(dest[0], dest[1])) dest = b;
          if (a.state !== 'air: to cover') a.state = 'air: disperse';
        }
      } else if (m.kind === 'hovertank') {
        if (!dest || dist2(dest[0], dest[1], m.x, m.z) < 6) { const ang = AI.time * 0.35 + m.id; let jx = m.x + Math.cos(ang) * 16, jz = m.z + Math.sin(ang) * 16; if (world.isWater(jx, jz)) { jx = m.x - Math.cos(ang) * 16; jz = m.z - Math.sin(ang) * 16; } dest = [jx, jz]; }
        a.run = true; a.state = 'air: jinking';
      }
    }
    // suppression: too much incoming and caught moving in the open -> nearest cover now
    if (a.supp > 0.75 && !m.vehicle && st !== 'retreat') {
      if (!a.cover || dist2(a.cover.x, a.cover.z, m.x, m.z) > 10) a.cover = chooseCover(S, m, m.x, m.z, 14);
      if (a.cover) dest = [a.cover.x, a.cover.z];
      a.run = true; a.state = 'suppressed'; a.crouch = 1;
    }
    // at the destination in cover: crouch between volleys, stand to fire
    if (dest && dist2(dest[0], dest[1], m.x, m.z) < 1.5) {
      dest = null;
      if (a.cover && !m.vehicle) a.crouch = a.fire ? (a.cover.h > 1.6 ? 0 : 0.15) : 1;
    }
    a.move = dest;
    a.dest = dest;
    if (a.state !== a.prevState) { a.prevState = a.state; a.stateT0 = AI.time; }   // (when the member entered its current state)
  }

  AI.update = (dt, targets) => {
    AI.time += dt;
    for (const S of AI.squads) {
      S.stateT += dt; S.linkDown = Math.max(0, S.linkDown - dt); S.freeze = Math.max(0, S.freeze - dt);
      perceive(S, dt, targets);
      S.thinkT -= dt; if (S.thinkT <= 0) { S.thinkT = AI_T.THINK; think(S); }
      for (const m of S.members) act(S, m, dt);
    }
    AI.sounds.length = 0;
  };
  // steering helper for hosts: turn a destination into a velocity around obstacles
  AI.steerVel = (m, speed) => {
    const a = m.ai; if (!a.move) return [0, 0];
    const dx = a.move[0] - m.x, dz = a.move[1] - m.z, d = Math.hypot(dx, dz); if (d < (m.vehicle ? 4 : 0.6)) return [0, 0];   // (a tank stops near the spot rather than circling it)
    const [ux, uz] = world.steer(m.x, m.z, dx, dz, m.vehicle ? 2.5 : 0.6, m.vehicle ? 10 : 5, m.kind === 'hovertank' ? 0.32 : m.kind === 'mbt' ? 0.45 : 0);
    const s = speed * Math.min(1, d / 3); return [ux * s, uz * s];
  };
  return AI;
}
