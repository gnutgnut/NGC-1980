// THE GROUND WAR: a 1980 Marine rifle squad's AI. Pure (no THREE, no DOM): runs in node (tools/groundwarbench.mjs)
// and the game (groundwar.js). The ideas are the machines' (runaway/squadai.js: perception, cover, fire and movement,
// suppression, retreat), MADE HUMAN:
//   * no data link: every Marine spots for himself and SHOUTS contacts to the squad - reports arrive 1-2.6 s late, with
//     the bearing and range a man can call ("two o'clock, two hundred"), so the squad leader's picture lags and is rough;
//   * reaction: on contact each man takes a moment (0.6-2.2 s) before he is down and firing;
//   * slower and less coordinated: walk 1.5 m/s, run 2.7, a rush 4.5 for 3-5 s ("I'm up, he sees me, I'm down"), then
//     down again; no lock-step clocks: every timer is jittered; teams bound when their leader judges, not on a beat;
//   * fire and movement as the 1980 Marine squad drills it (FMFM 6-5 / MCI rifle squad): one fire team is the base of
//     fire and suppresses, another manoeuvres to the flank with MORE COVER (not always the same side), the third holds
//     or follows; the squad leader moves with the manoeuvre;
//   * suppression pins people: they go prone, fire wildly or not at all, and come back slowly (decay 0.15 / s, the
//     machines 0.35); casualties and the squad leader's death cost morale; a broken squad pulls back to its rally;
//   * weapons by role: M16A1 aimed fire, the automatic rifleman's bursts, the M203 grenadier lobbing into cover, M72
//     LAWs for armour (and a STRIDER at close range). Game-level: the host turns `fire` into rounds.
//
// INTERFACES (the same shape as squadai.js so the host treats both alike)
//   ai = createMarineAI(world, { seed })                world: rwworld query (height, los, raycast, coverPoints, ...)
//   ai.addSquad({ id, side, members, order })          members: host adapters kept current every frame:
//       { id, role: 'sl'|'tl'|'ar'|'aar'|'gren', x, y, z, yaw, alive, able (not down wounded), laws, gl (M203 rounds) }
//     each member gets m.ai = { move: [x, z] | null, pace: 'crawl'|'walk'|'run'|'rush', stance: 'stand'|'crouch'|'prone',
//       face: yaw | undefined, aim: [x, y, z] | null, aimId, fire: null|'rifle'|'auto'|'gl'|'law', state, note, supp }
//   ai.order(id, { type: 'take'|'defend'|'hold'|'retreat', x, z, r })
//   ai.hear({ x, y, z, loud, side, kind, src }), ai.nearMiss(memberId, k), ai.casualty(memberId, 'kia'|'wia')
//   ai.update(dt, targets)      targets: { id, side, kind: 'strider'|'hovertank'|'mbt'|'aa'|'inf', x, y, z, vx, vz, h,
//                                          alive, firing (s since last shot), cover 0..1 }
import { rng } from '../runaway/rwworld.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const d2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const angN = a => ((a % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
export const MAR_T = {
  THINK: 0.8,                       // s between the squad leader's decisions (+ jitter)
  LOOK: 0.2,                        // s between a man's looks round (5 Hz; the machines sweep at 10)
  SIGHT: 260, FOV: 2.4,             // m daylight for a 2 m machine; rad (eyes + head turning)
  REPORT: [1.0, 2.6],               // s for a shouted contact report to reach the squad leader
  REACT: [0.6, 2.2],                // s from the first round / sighting to down and firing
  SPEED: { crawl: 0.5, walk: 1.52, run: 2.74, rush: 4.5 },   // FM 22-5 quick time / double time (as foot.js)
  RUSH: [3, 5],                     // s per rush
  SUPP_DECAY: 0.15, PIN: 0.7, UNPIN: 0.35,
  THREAT: { strider: 2.2, hovertank: 6, mbt: 7, aa: 0.6, inf: 1, air: 1.5 },
  POWER: { sl: 1, tl: 1, ar: 1.4, mg: 1.9, aar: 1, gren: 1.2, doc: 0.6 },   // (doc: the corpsman, ngc/infdepth)
  RANGE: { rifle: 460, auto: 460, mg: 800, gl: 330, law: 200, frag: 30 },   // m: M16A1 / M60 / M203 / M72 effective-ish, an M67 thrown (game)
  FRAG: { min: 10, safe: 12, p: 0.3 },   // M67: not closer than 10 m (FM 23-30: 15 m casualty radius, behind cover), none of his own within 12 m of the
                                          // aim point, a ~0.3 / s chance a man with one decides on it (ngc/infdepth-fix)
  WITHDRAW_RATIO: 0.45, ASSAULT_RATIO: 2.2,
};

export function createMarineAI(world, opt = {}) {
  const R = rng(opt.seed ?? 1980);
  const jit = (a, b) => a + (b - a) * R();
  const AI = { squads: [], time: 0, sounds: [], log: [] };
  const byMember = new Map();

  AI.addSquad = sq => {
    const S = { id: sq.id, side: sq.side ?? 1, members: sq.members, order: sq.order || { type: 'hold' }, state: 'move', stateT: 0,
      know: new Map(), reports: [], thinkT: R() * MAR_T.THINK, morale: 1, base: 1, man: 2, flankSide: 0, phaseT: 0,
      leaderNow: null, confuse: 0, rally: null, threat: null, ratio: 1, casualties: 0, note: '', start: sq.members.length };
    sq.members.forEach((m, i) => {
      const team = i === 0 ? 0 : 1 + Math.floor((i - 1) / 4);   // 0 = the squad leader, 1-3 = fire teams A B C
      m.ai = { move: null, pace: 'walk', stance: 'stand', face: undefined, aim: null, aimId: null, fire: null, state: 'move', note: '', supp: 0, team,
        own: new Map(), spot: new Map(), lookT: R() * MAR_T.LOOK, react: 0, contactT: -1, rushT: 0, waitT: jit(1, 4), cover: null, coverT: -99, lookYaw: m.yaw ?? 0, slot: i };
      byMember.set(m.id, { m, S });
    });
    AI.squads.push(S); return S;
  };
  // a man joins a squad in the field (the rest of a stick coming off the ramp)
  AI.addMember = (id, m) => {
    const S = AI.squads.find(s => s.id === id); if (!S) return null;
    const i = S.members.length; S.members.push(m); S.start = Math.max(S.start, S.members.length);
    const team = i === 0 ? 0 : 1 + Math.floor((i - 1) / 4);
    m.ai = { move: null, pace: 'walk', stance: 'stand', face: undefined, aim: null, aimId: null, fire: null, state: 'move', note: '', supp: 0, team,
      own: new Map(), spot: new Map(), lookT: R() * MAR_T.LOOK, react: 0, contactT: -1, rushT: 0, waitT: jit(1, 4), cover: null, coverT: -99, lookYaw: m.yaw ?? 0, slot: i };
    byMember.set(m.id, { m, S }); return S;
  };
  AI.order = (id, order) => { const S = AI.squads.find(s => s.id === id); if (!S) return; S.order = order; if (S.state !== 'withdraw') setState(S, order.type === 'defend' || order.type === 'hold' ? 'defend' : 'move'); for (const m of S.members) if (m.ai) m.ai.cover = null; };
  AI.hear = ev => AI.sounds.push(ev);
  AI.nearMiss = (id, k = 0.15) => { const e = byMember.get(id); if (!e) return; const a = e.m.ai; a.supp = clamp(a.supp + k, 0, 1.3); if (a.contactT < 0) { a.contactT = AI.time; a.react = jit(...MAR_T.REACT); } };
  AI.casualty = (id, kind) => {
    const e = byMember.get(id); if (!e) return; const S = e.S;
    S.casualties++; S.morale = clamp(S.morale - (kind === 'kia' ? 0.11 : 0.07) - (e.m.ai.team === 0 ? 0.15 : 0), 0, 1);
    for (const m of S.members) if (m.alive && d2(m.x, m.z, e.m.x, e.m.z) < 25) m.ai.supp = clamp(m.ai.supp + 0.25, 0, 1.3);   // a man down next to you
    if (S.members[0] === e.m || S.leaderNow === e.m.id) { S.confuse = jit(4, 8); AI.log.push({ t: AI.time, sq: S.id, st: 'SL DOWN' }); }
  };
  function setState(S, st, note = '') { if (S.state !== st) { S.state = st; S.stateT = 0; S.phaseT = 0; AI.log.push({ t: AI.time, sq: S.id, st, note }); } S.note = note; }
  const able = S => S.members.filter(m => m.alive && m.able);

  // ------------------------------------------------------------------------------------------------- perception
  const eyeH = m => m.ai.stance === 'prone' ? 0.35 : m.ai.stance === 'crouch' ? 1.05 : 1.62;
  function perceive(S, dt, targets) {
    for (const m of S.members) {
      if (!m.alive) continue;
      const a = m.ai; a.lookT -= dt; if (a.lookT > 0) continue;
      const ldt = MAR_T.LOOK - a.lookT; a.lookT = MAR_T.LOOK * jit(0.8, 1.25);
      // where he looks: the threat if there is one (with a wander), else the way he walks / his sector, sweeping
      const thr = S.threat; const base = thr ? Math.atan2(-(thr[0] - m.x), -(thr[1] - m.z)) : a.move ? Math.atan2(-(a.move[0] - m.x), -(a.move[1] - m.z)) : (a.sector ?? m.yaw);
      a.lookYaw = base + Math.sin(AI.time * 0.6 + m.id * 1.7) * (thr ? 0.5 : 1.1);
      const ey = m.y + eyeH(m), pinned = a.supp > MAR_T.PIN;
      for (const t of targets) {
        if (!t.alive || t.side === S.side) continue;
        const dx = t.x - m.x, dz = t.z - m.z, d = Math.hypot(dx, dz);
        let sp = a.spot.get(t.id) || 0, vis = false;
        if (d < MAR_T.SIGHT * (t.kind === 'hovertank' || t.kind === 'mbt' ? 1.6 : t.kind === 'air' ? 2 : 1)) {
          const off = Math.abs(angN(Math.atan2(-dx, -dz) - a.lookYaw));
          if ((off < MAR_T.FOV / 2 || d < 30 || (t.firing ?? 99) < 1.5) && !(pinned && R() < 0.6))
            vis = world.los(m.x, ey, m.z, t.x, t.y + t.h * 0.85, t.z) || world.los(m.x, ey, m.z, t.x, t.y + t.h * 0.45, t.z);
        }
        if (vis) {
          const mv = Math.hypot(t.vx || 0, t.vz || 0);
          const rate = (0.5 + 1.2 * Math.min(1, mv / 2) + ((t.firing ?? 99) < 2 ? 2.5 : 0)) * (1 - 0.6 * (t.cover || 0)) * clamp(1.3 - d / MAR_T.SIGHT, 0.15, 1.3)
            * (t.kind === 'hovertank' || t.kind === 'mbt' ? 2.2 : 1) * (a.stance === 'prone' ? 0.7 : 1) * (1 - 0.5 * Math.min(1, a.supp));
          sp = Math.min(1.5, sp + rate * ldt);
        } else sp = Math.max(0, sp - ldt * 0.4);
        a.spot.set(t.id, sp);
        if (vis && sp >= 1) {
          const fresh = !a.own.has(t.id) || !a.own.get(t.id).seen;
          const k = { id: t.id, x: t.x, y: t.y, z: t.z, vx: t.vx || 0, vz: t.vz || 0, h: t.h, kind: t.kind, t: AI.time, conf: 1, seen: true, firing: t.firing ?? 99 };
          a.own.set(t.id, k);
          if (fresh) {
            if (a.contactT < 0) { a.contactT = AI.time; a.react = jit(...MAR_T.REACT); }
            // "CONTACT!": the squad leader hears it a moment later, roughly placed
            const err = d * 0.05 + 3, an = R() * 6.283;
            S.reports.push({ at: AI.time + jit(...MAR_T.REPORT), k: { ...k, x: t.x + Math.cos(an) * err, z: t.z + Math.sin(an) * err, seen: false, by: m.id } });
          } else if (R() < 0.08) S.reports.push({ at: AI.time + jit(...MAR_T.REPORT), k: { ...k, seen: false, by: m.id } });
        }
      }
    }
    // gunfire heard: every man in earshot gets a bearing (rough), and reacts
    for (const ev of AI.sounds) {
      if (ev.side === S.side) continue;
      for (const m of S.members) {
        if (!m.alive) continue;
        const d = d2(m.x, m.z, ev.x, ev.z); if (d > ev.loud) continue;
        const a = m.ai; if (a.contactT < 0 && d < ev.loud * 0.6) { a.contactT = AI.time; a.react = jit(...MAR_T.REACT); }
        const id = ev.src ?? ('snd' + Math.round(ev.x / 15) + ',' + Math.round(ev.z / 15));
        const old = a.own.get(id); if (old && old.seen && AI.time - old.t < 2) { old.firing = 0; continue; }
        const err = d * 0.2, an = R() * 6.283;
        const k = { id, x: ev.x + Math.cos(an) * err, y: ev.y, z: ev.z + Math.sin(an) * err, vx: 0, vz: 0, h: 2, kind: old?.kind || (ev.kind === 'blast' ? 'hovertank' : 'strider'), t: AI.time, conf: 0.5, seen: false, heard: true, firing: 0 };
        a.own.set(id, k);
        if (R() < 0.3) S.reports.push({ at: AI.time + jit(...MAR_T.REPORT), k: { ...k } });
      }
    }
    // reports arrive at the squad leader
    for (let i = S.reports.length - 1; i >= 0; i--) {
      const r = S.reports[i]; if (r.at > AI.time) continue;
      S.reports.splice(i, 1);
      const old = S.know.get(r.k.id); if (!old || old.t <= r.k.t) S.know.set(r.k.id, r.k);
    }
    // decay: memory fades, positions are extrapolated a little (people guess where a mover went)
    const decay = (map, life) => { for (const [id, k] of map) { const age = AI.time - k.t; if (k.seen && age > 1.5) k.seen = false; k.conf = Math.max(0, (k.heard ? 0.5 : 1) - age / life); const e = Math.min(age, 3); k.px = k.x + k.vx * e; k.pz = k.z + k.vz * e; if (k.conf <= 0) map.delete(id); } };
    decay(S.know, 40);
    for (const m of S.members) decay(m.ai.own, 30);
    // the dead drop out of the picture
    for (const t of targets) if (!t.alive) { S.know.delete(t.id); for (const m of S.members) m.ai.own.delete(t.id); }
  }
  function threatOf(k, x, z) { return (MAR_T.THREAT[k.kind] ?? 1) * k.conf / (1 + d2(k.px ?? k.x, k.pz ?? k.z, x, z) / 120) * ((k.firing ?? 99) < 3 ? 1.5 : 1); }

  // ------------------------------------------------------------------------------------------------- the squad leader
  function think(S) {
    const ms = able(S);
    if (!ms.length) { setState(S, 'dead'); return; }
    S.leaderNow = ms[0].id;
    const cx = ms.reduce((s, m) => s + m.x, 0) / ms.length, cz = ms.reduce((s, m) => s + m.z, 0) / ms.length;
    S.cx = cx; S.cz = cz;
    if (S.confuse > 0) { S.note = 'squad leader down'; return; }   // nobody in charge for a few seconds: everyone keeps doing what he was doing
    const en = [...S.know.values()].filter(k => k.conf > 0.25);
    const near = en.filter(k => d2(k.px, k.pz, cx, cz) < 380);
    let own = 0, theirs = 0;
    for (const m of ms) own += MAR_T.POWER[m.role] * (m.laws > 0 ? 1.25 : 1) * (1 - 0.4 * Math.min(1, m.ai.supp));
    for (const k of near) theirs += (MAR_T.THREAT[k.kind] ?? 1) * (k.kind === 'hovertank' || k.kind === 'mbt' ? (ms.some(m => m.laws > 0) ? 0.7 : 1.4) : 1);
    S.ratio = theirs ? own / theirs : 99;
    let tx = 0, tz = 0, tw = 0; for (const k of near) { const w = threatOf(k, cx, cz); tx += k.px * w; tz += k.pz * w; tw += w; }
    S.threat = tw ? [tx / tw, tz / tw] : null;
    const O = S.order, supp = ms.reduce((s, m) => s + m.ai.supp, 0) / ms.length;
    S.morale = clamp(S.morale + 0.006 * MAR_T.THINK * (near.length ? 0.3 : 1), 0, 1);   // nerve comes back
    // ---- breaking: casualties, morale, hopeless odds -> pull back to the rally point (the LZ or away from the enemy)
    if (S.state === 'withdraw') {
      if (!near.length && S.stateT > 15) { setState(S, 'hold', 'rallied'); return; }
      if (S.rally && d2(cx, cz, S.rally[0], S.rally[1]) < 14 && S.stateT > 10) { setState(S, near.length ? 'defend' : 'hold', 'at the rally'); S.order = { type: 'defend', x: S.rally[0], z: S.rally[1], r: 18 }; return; }
      return;
    }
    const lost = 1 - ms.length / S.start;
    if (near.length && O.type !== 'defend' && (S.morale < 0.25 || (S.ratio < MAR_T.WITHDRAW_RATIO && lost > 0.3) || (lost > 0.55 && S.ratio < 1))) {
      const ax = S.threat ? cx - S.threat[0] : 0, az = S.threat ? cz - S.threat[1] : 1, al = Math.hypot(ax, az) || 1;
      S.rally = O.rally || [cx + ax / al * 90, cz + az / al * 90];
      for (let i = 0; i < 6 && world.isWater(S.rally[0], S.rally[1]); i++) { S.rally[0] = (S.rally[0] + cx) / 2; S.rally[1] = (S.rally[1] + cz) / 2; }
      setState(S, 'withdraw', `breaking contact (morale ${S.morale.toFixed(2)}, ratio ${S.ratio.toFixed(2)})`); return;
    }
    if (!near.length) {
      // nothing known: carry on with the order (move to it / hold it)
      const goal = O.type === 'take' || O.type === 'defend' || O.type === 'hold' ? [O.x ?? cx, O.z ?? cz] : null;
      const there = goal && d2(cx, cz, goal[0], goal[1]) < Math.max(14, (O.r ?? 20) * 0.6);
      setState(S, there || O.type === 'defend' || O.type === 'hold' ? 'defend' : 'move', there ? 'on the objective' : '');
      return;
    }
    // ---- contact
    if (O.type === 'defend' || O.type === 'hold') { setState(S, 'defend', 'engaging'); return; }
    if (S.state === 'move') { setState(S, 'contact', 'contact'); return; }
    if (S.state === 'contact' && S.stateT < jit(4, 7)) return;   // everybody down and firing; the leader sizes it up
    const nearest = Math.min(...near.map(k => d2(k.px, k.pz, cx, cz)));
    const quiet = near.every(k => (k.firing ?? 99) > 3);
    if (S.ratio > MAR_T.ASSAULT_RATIO && nearest < 70 && (quiet || supp < 0.25) && S.stateT > 8) { if (S.state !== 'assault') setState(S, 'assault', `ratio ${S.ratio.toFixed(1)}`); return; }
    if (supp > MAR_T.PIN && S.state !== 'pinned') { setState(S, 'pinned', 'pinned down'); return; }
    if (S.state === 'pinned') { if (supp < MAR_T.UNPIN && S.stateT > 5) setState(S, 'fight', 'back in it'); return; }
    if (S.state !== 'fight') {
      setState(S, 'fight', 'base of fire, manoeuvre');
      // the manoeuvre goes round the side with more cover (dead ground or walls), not a fixed side
      if (S.threat) {
        const ax = cx - S.threat[0], az = cz - S.threat[1], dd = Math.hypot(ax, az) || 1, b0 = Math.atan2(az, ax), r = clamp(dd * 0.7, 30, 120);
        let best = 0, bs = -1e9;
        for (const sd of [-1, 1]) {
          const fx = S.threat[0] + Math.cos(b0 + sd * 1.05) * r, fz = S.threat[1] + Math.sin(b0 + sd * 1.05) * r;
          if (world.isWater(fx, fz)) continue;
          let sc = R() * 1.5;
          for (let i = 1; i <= 4; i++) { const px = cx + (fx - cx) * i / 4, pz = cz + (fz - cz) * i / 4; if (!world.los(S.threat[0], world.height(S.threat[0], S.threat[1]) + 1.8, S.threat[1], px, world.height(px, pz) + 0.9, pz)) sc += 1; }
          sc += world.coverPoints(fx, fz, 25, []).length * 0.3;
          if (sc > bs) { bs = sc; best = sd; }
        }
        S.flankSide = best || 1;
        S.flank = { x: S.threat[0] + Math.cos(b0 + S.flankSide * 1.05) * r, z: S.threat[1] + Math.sin(b0 + S.flankSide * 1.05) * r };
      }
      S.base = 1 + Math.floor(R() * 3); S.man = 1 + (S.base % 3); S.phaseT = 0; S.swapAt = jit(25, 40);
    }
    // teams swap: the manoeuvre team gets down and becomes the base; the old base moves (irregular)
    S.phaseT += MAR_T.THINK;
    if (S.phaseT > S.swapAt) { const b = S.base; S.base = S.man; S.man = b; S.phaseT = 0; S.swapAt = jit(25, 45); S.note = 'teams swap'; }
  }

  // ------------------------------------------------------------------------------------------------- a man's choices
  function pickTarget(S, m) {
    const a = m.ai; let best = null, bs = 0;
    const lists = [a.own.values(), S.know.values()];
    for (let li = 0; li < 2; li++) for (const k of lists[li]) {
      if (k.conf < 0.2) continue;
      const d = d2(k.px ?? k.x, k.pz ?? k.z, m.x, m.z); if (d > MAR_T.RANGE.rifle) continue;
      const armour = k.kind === 'hovertank' || k.kind === 'mbt';
      let s = (MAR_T.THREAT[k.kind] ?? 1) * k.conf / (1 + d / 100) * ((k.firing ?? 99) < 3 ? 1.8 : 1) * (k.seen ? 1.6 : li ? 0.4 : 0.7);
      if (armour) s *= m.laws > 0 && d < MAR_T.RANGE.law ? 2.5 : 0.35;   // rifles do nothing to armour: only a LAW man cares
      if (k.kind === 'air') s *= 0.4;
      if (s > bs) { bs = s; best = k; }
    }
    return best;
  }
  function chooseCover(S, m, ax, az, maxR, thr) {
    if (!thr) return null;
    const ty = world.height(thr[0], thr[1]) + 1.6; let best = null, bs = -1e9;
    for (const cp of world.coverPoints(ax, az, maxR, [])) {
      if (cp.taken && cp.taken !== m.id && cp.takenT > AI.time) continue;
      const sc = world.coverScore(cp, thr[0], ty, thr[1], 0.9, 1.6);
      const s = (sc.hidden ? 3 : 0) + (sc.canFire ? 2 : 0) + sc.facing - d2(cp.x, cp.z, m.x, m.z) / 12 - d2(cp.x, cp.z, ax, az) / 14 + R() * 1.2;   // (people don't pick the best spot, just a good one)
      if (s > bs) { bs = s; best = cp; }
    }
    // the ground itself: a dip or a crest you can lie behind and still see over when you raise your head
    if (!best || bs < 2.5) {
      let tb = null, ts = -1e9;
      for (let i = 0; i < 12; i++) {
        const an = R() * 6.283, r = 3 + R() * maxR * 0.8, x = ax + Math.cos(an) * r, z = az + Math.sin(an) * r;
        if (world.isWater(x, z)) continue;
        const y = world.height(x, z), hid = !world.los(thr[0], ty, thr[1], x, y + 0.45, z), see = world.los(x, y + 0.9, z, thr[0], ty, thr[1]);
        const s = (hid ? 2.5 : 0) + (see ? 2 : 0) - d2(x, z, m.x, m.z) / 12 - d2(x, z, ax, az) / 14;
        if (s > ts) { ts = s; tb = { x, z, y, h: 0.5, nx: 0, nz: 0, terrain: true }; }
      }
      if (tb && ts > bs) best = tb;
    }
    if (best && !best.terrain) { best.taken = m.id; best.takenT = AI.time + 15; }
    return best;
  }
  // perimeter slots round a point (the pad): a 360 ring, the leader in the middle
  function ringSlot(S, m, x, z, r, n) {
    const i = m.ai.slot, N = S.members.length;
    if (i === 0) return [x + 2, z + 2];
    const a = (i - 1) / Math.max(1, N - 1) * Math.PI * 2 + (S.ringA ?? (S.ringA = R() * 6.283));
    return [x + Math.cos(a) * r, z + Math.sin(a) * r];
  }
  function act(S, m, dt) {
    const a = m.ai;
    a.supp = Math.max(0, a.supp - dt * MAR_T.SUPP_DECAY);
    if (!m.alive || !m.able) { a.move = null; a.fire = null; a.state = m.alive ? 'wounded' : 'dead'; a.stance = 'prone'; return; }
    const O = S.order, st = S.state, thr = S.threat, ms = able(S), n = ms.indexOf(m), lead = m.id === S.leaderNow;
    const cx = S.cx ?? m.x, cz = S.cz ?? m.z;
    a.fire = null; a.aim = null; a.aimId = null; a.face = undefined;
    // reacting to contact: a moment of nothing useful, then down
    const reacting = a.contactT >= 0 && AI.time - a.contactT < a.react;
    // ---- shooting (any state but a rush; pinned men fire seldom and badly)
    // a LAW, once a man has decided on it, stays his job until it is fired (extend, arm, aim: a couple of seconds)
    if (a.law && (AI.time > a.law.until || m.laws <= 0)) a.law = null;
    if (a.frag && (AI.time > a.frag.until || !(m.frags > 0))) a.frag = null;   // (the same for a hand grenade: the host clears it when it is thrown)
    let tgt = reacting ? null : pickTarget(S, m);
    if (a.law && !reacting) { const k = S.know.get(a.law.id) || a.own.get(a.law.id); if (k && k.conf > 0.2) tgt = k; else a.law = null; }
    if (a.frag && !reacting) { const k = S.know.get(a.frag.id) || a.own.get(a.frag.id); if (k && k.conf > 0.2) tgt = k; else a.frag = null; }
    if (tgt) {
      const tx = tgt.px ?? tgt.x, tz = tgt.pz ?? tgt.z, ty0 = tgt.y ?? world.height(tx, tz), d = d2(tx, tz, m.x, m.z);
      // where to hold: centre of mass, except on a STRIDER - word gets round fast: the machine gun goes for the legs,
      // riflemen close in go for the sensor head (the armour stops rifle rounds on the body)
      const hgt = tgt.kind === 'strider' ? (m.role === 'mg' || m.role === 'ar' ? 0.32 : d < 160 ? 0.9 : 0.6) : 0.55;
      a.aimId = tgt.id; a.aim = [tx, ty0 + (tgt.h || 1.8) * hgt, tz];
      const ey = m.y + eyeH(m) - 0.05, clear = world.los(m.x, ey, m.z, a.aim[0], a.aim[1], a.aim[2]);
      const armour = tgt.kind === 'hovertank' || tgt.kind === 'mbt';
      let wpn = m.role === 'ar' ? 'auto' : m.role === 'mg' ? 'mg' : 'rifle';
      if (!a.law && m.laws > 0 && ((armour && d < MAR_T.RANGE.law) || (tgt.kind === 'strider' && d < 140 && tgt.seen && R() < 0.35 * dt) || (tgt.kind === 'aa' && d < 170))) a.law = { id: tgt.id, until: AI.time + jit(5, 8) };
      // an M67 over the cover: a man with one, his target in throwing range and behind cover (or a machine close in),
      // none of his own near where it will land
      if (!a.law && !a.frag && m.frags > 0 && !armour && d > MAR_T.FRAG.min && d < MAR_T.RANGE.frag && (!clear || tgt.cover > 0.3 || (tgt.kind === 'strider' && d < 20)) && R() < MAR_T.FRAG.p * dt
        && !S.members.some(o => o !== m && o.alive && d2(o.x, o.z, tx, tz) < MAR_T.FRAG.safe)) a.frag = { id: tgt.id, until: AI.time + 6 };
      if (a.law) wpn = 'law';
      else if (a.frag) wpn = 'frag';
      else if (m.role === 'gren' && m.gl > 0 && d > 40 && d < MAR_T.RANGE.gl && (!clear || tgt.cover > 0.3 || tgt.kind === 'strider' || R() < 0.3)) wpn = 'gl';
      if (armour && wpn !== 'law') wpn = null;   // no point shooting a tank with a rifle
      let ok = clear && (tgt.seen || AI.time - tgt.t < 2);
      if (!ok && wpn && wpn !== 'law' && (st === 'fight' || st === 'defend' || st === 'contact') && d < 260) {   // suppressive fire at a reported position
        const rc = world.raycast(m.x, ey, m.z, a.aim[0], a.aim[1], a.aim[2]);
        ok = !rc || (1 - rc.t) * d < 5;
      }
      if (wpn === 'gl') ok = d > 40;   // lobbed: over the cover
      if (wpn === 'frag') ok = true;     // thrown over it (he knows where they are)
      if (a.supp > 1.0 && R() < 0.7) ok = false;   // heads down
      if (a.rushT > 0) ok = false;
      if (ok && wpn && d < MAR_T.RANGE[wpn]) { a.fire = wpn; a.note = `${wpn} at ${tgt.kind} ${Math.round(d)} m`; }
      a.face = Math.atan2(-(tx - m.x), -(tz - m.z));
    }
    // ---- movement by the squad's state
    let dest = null, pace = 'walk', stance = 'stand';
    a.sector = undefined;
    if (st === 'move') {
      // a wedge per fire team toward the objective, 8-10 m between men (they bunch up a bit: people do)
      const gx = O.x ?? cx, gz = O.z ?? cz, hx = gx - cx, hz = gz - cz, hl = Math.hypot(hx, hz) || 1, fx = hx / hl, fz = hz / hl;
      const team = a.team, row = team === 0 ? 1 : team === 2 ? 0 : 2, lat = team === 0 ? 0 : team === 1 ? -1 : 1;
      const k = (m.ai.slot - 1) % 4, side = team === 0 ? 0 : (k % 2 ? 1 : -1) * (1 + Math.floor(k / 2)) * 0.5;
      const ahead = Math.min(14, hl);
      dest = [cx + fx * ahead - fx * row * 9 - fz * (lat * 14 + side * 8), cz + fz * ahead - fz * row * 9 + fx * (lat * 14 + side * 8)];
      if (hl < 12) dest = ringSlot(S, m, gx, gz, 9, S.members.length);
      pace = hl > 60 ? 'run' : 'walk'; stance = 'stand'; a.state = 'move';
    } else if (st === 'defend' || st === 'hold') {
      // a 360 perimeter round the point, in cover facing out; toward the threat when there is one
      const ox = O.x ?? cx, oz = O.z ?? cz, rr = O.r ?? 18;
      const slot = ringSlot(S, m, ox, oz, Math.min(rr * 0.7, 14), S.members.length);
      if (thr && (!a.cover || AI.time - a.coverT > 20)) { a.cover = chooseCover(S, m, slot[0], slot[1], 10, thr); a.coverT = AI.time; }
      dest = a.cover && thr ? [a.cover.x, a.cover.z] : slot;
      a.sector = Math.atan2(-(slot[0] - ox), -(slot[1] - oz));
      pace = thr ? 'run' : 'walk'; stance = thr ? (a.cover && !a.cover.terrain && a.cover.h > 1.2 ? 'crouch' : 'prone') : 'crouch';
      if (!thr) a.face = a.sector;
      a.state = thr ? 'defend: engage' : 'perimeter';
    } else if (st === 'contact' || st === 'pinned') {
      // down where you are: the nearest cover within a few strides, or flat on the ground
      if (!reacting && (!a.cover || AI.time - a.coverT > 25)) { a.cover = chooseCover(S, m, m.x, m.z, st === 'pinned' ? 6 : 10, thr || [m.x - Math.sin(m.yaw) * 50, m.z - Math.cos(m.yaw) * 50]); a.coverT = AI.time; }
      dest = reacting ? null : a.cover ? [a.cover.x, a.cover.z] : null;
      pace = 'rush'; stance = a.cover && !a.cover.terrain && a.cover.h > 1.2 ? 'crouch' : 'prone';
      if (reacting) stance = a.stance;
      a.state = st === 'pinned' ? 'pinned' : reacting ? 'reacting' : 'take cover';
    } else if (st === 'fight') {
      const goal = O.type === 'take' ? [O.x, O.z] : thr || [cx, cz];
      const base = a.team === S.base || (a.team === 0 && !lead), manoeuvre = a.team === S.man || (a.team === 0 && lead);
      if (base || (!manoeuvre && a.team !== 0)) {
        // the base of fire (and the reserve team): in cover, firing; the reserve follows the fight at a distance
        if (!a.cover || AI.time - a.coverT > 30) { const anc = base ? [m.x, m.z] : [cx + (m.x - cx) * 0.5, cz + (m.z - cz) * 0.5]; a.cover = chooseCover(S, m, anc[0], anc[1], 14, thr); a.coverT = AI.time; }
        dest = a.cover ? [a.cover.x, a.cover.z] : null; pace = 'rush';
        stance = a.cover && !a.cover.terrain && a.cover.h > 1.2 ? 'crouch' : 'prone';
        a.state = base ? 'base of fire' : 'reserve';
      } else {
        // the manoeuvre: individual rushes cover to cover toward the flank point (then the objective)
        const f = S.flank && d2(cx, cz, S.flank.x, S.flank.z) > 15 && S.phaseT < 30 ? [S.flank.x, S.flank.z] : goal;
        if (a.rushT > 0) {
          a.rushT -= dt; dest = a.rushDest; pace = 'rush'; stance = 'stand'; a.state = 'rush';
          if (!dest || d2(dest[0], dest[1], m.x, m.z) < 1.2 || a.rushT <= 0) { a.rushT = 0; a.waitT = jit(2, 6) * (1 + a.supp); }
        } else {
          a.waitT -= dt;
          dest = a.cover ? [a.cover.x, a.cover.z] : null; pace = 'run';
          stance = a.cover && !a.cover.terrain && a.cover.h > 1.2 ? 'crouch' : 'prone';
          a.state = 'manoeuvre: down';
          if (a.waitT <= 0 && a.supp < 0.6) {
            // up and rush: 12-25 m toward the flank / objective, to cover if there is any
            const dx = f[0] - m.x, dz = f[1] - m.z, dl = Math.hypot(dx, dz) || 1, step = Math.min(jit(12, 25), Math.max(0, dl - 8));
            if (step > 3) {
              const ax2 = m.x + dx / dl * step, az2 = m.z + dz / dl * step;
              a.cover = chooseCover(S, m, ax2, az2, 9, thr); a.coverT = AI.time;
              a.rushDest = a.cover ? [a.cover.x, a.cover.z] : [ax2 + (R() - 0.5) * 6, az2 + (R() - 0.5) * 6];
              a.rushT = jit(...MAR_T.RUSH);
            } else a.waitT = jit(3, 6);
          }
        }
      }
    } else if (st === 'assault') {
      // everybody up, moving through the position firing (walking, not running: marching fire)
      const k = tgt || (thr && { px: thr[0], pz: thr[1] });
      dest = k ? [k.px + ((m.ai.slot % 5) - 2) * 4, k.pz + ((m.ai.slot % 3) - 1) * 4] : null; pace = 'walk'; stance = 'stand'; a.state = 'assault';
    } else if (st === 'withdraw') {
      // bounding back: half the squad covers, half runs; irregular
      const goingT = Math.floor((S.stateT + m.ai.slot * 0.7) / jit(6, 8)) % 2 === (a.team % 2);
      if (goingT || !thr) { dest = [S.rally[0] + Math.cos(m.ai.slot * 1.9) * 6, S.rally[1] + Math.sin(m.ai.slot * 1.9) * 6]; pace = 'run'; stance = 'stand'; a.state = 'withdraw'; if (a.fire !== 'law') a.fire = null; }
      else { if (!a.cover || AI.time - a.coverT > 15) { a.cover = chooseCover(S, m, m.x, m.z, 10, thr); a.coverT = AI.time; } dest = a.cover ? [a.cover.x, a.cover.z] : null; pace = 'rush'; stance = 'prone'; a.state = 'cover the withdrawal'; }
    }
    // pinned under heavy fire: down now, wherever you are
    if (a.supp > MAR_T.PIN && a.rushT <= 0 && st !== 'withdraw') { stance = 'prone'; if (!dest || d2(dest[0], dest[1], m.x, m.z) > 6) dest = null; pace = 'crawl'; a.state = 'pinned'; }
    // a LAW or a grenade needs a man on one knee at least
    if (a.fire === 'law' || a.fire === 'gl' || a.fire === 'frag') { if (stance === 'prone') stance = 'crouch'; }
    if (a.fire === 'frag') dest = null;   // (he stops to throw it)
    if (dest && d2(dest[0], dest[1], m.x, m.z) < 1.0) dest = null;
    if (dest && (pace === 'rush' || pace === 'run') && stance !== 'stand' && d2(dest[0], dest[1], m.x, m.z) > 2.5) stance = 'stand';   // you get up to run
    if (dest && pace === 'crawl') stance = 'prone';
    a.move = dest; a.pace = pace; a.stance = stance;
  }

  AI.update = (dt, targets) => {
    AI.time += dt;
    for (const S of AI.squads) {
      S.stateT += dt; S.confuse = Math.max(0, S.confuse - dt);
      perceive(S, dt, targets);
      S.thinkT -= dt; if (S.thinkT <= 0) { S.thinkT = MAR_T.THINK * jit(0.8, 1.4); think(S); }
      for (const m of S.members) act(S, m, dt);
    }
    AI.sounds.length = 0;
  };
  // steering helper for hosts (the same as squadai's): a destination -> a velocity round obstacles
  AI.steerVel = (m, speed) => {
    const a = m.ai; if (!a.move) return [0, 0];
    const dx = a.move[0] - m.x, dz = a.move[1] - m.z, d = Math.hypot(dx, dz); if (d < 0.5) return [0, 0];
    const [ux, uz] = world.steer(m.x, m.z, dx, dz, 0.45, 4, 0);
    const s = speed * Math.min(1, d / 1.5); return [ux * s, uz * s];
  };
  AI.squadOf = id => byMember.get(id)?.S;
  return AI;
}
