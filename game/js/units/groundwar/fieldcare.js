// THE GROUND WAR, infantry depth (ngc/infdepth): casualty care in a Marine squad. Pure (no THREE, no DOM); groundsim.js
// runs it after the squad AI each step, so it can take a man off the squad's plan for a while:
//   * the WOUNDED call out ("CORPSMAN UP!"), and if they can, crawl to the nearest spot the enemy can't see;
//   * the squad's NAVY CORPSMAN (role 'doc', the 13th man of a CH-46 stick) goes to the worst casualty - rushing cover to
//     cover when it is far, crawling the last metres under fire - and works on him out of his Unit One bag: MEDINV's
//     buddy-aid API, patient.startTreatment({ item, region, by: { self: false, skill: 'corpsman' } }), one treatment
//     at a time at its real buddy-aid time; he uses the casualty's own first-aid kit first (doctrine) and is the only
//     one who starts an IV or decompresses a chest. With no corpsman, a rifleman nearby does buddy aid (dressings,
//     tourniquets) when the squad isn't in the middle of a fight;
//   * once he is treated and the shooting has stopped, a buddy DRAGS him (MEDINV's BUDDY.dragSpeed) to the squad's
//     casualty collection point by the pad, where a CH-46 or the player's Huey can take him out (groundwar.js);
//   * the player is a patient too (hooks.patients): a corpsman within reach comes to him when he is bleeding.
// Men far from the camera run marine.js's cheap wound model; for them the same flow runs on timers (GAME): an untreated
// casualty dies of his wounds after 4-12 min, treatment takes 20-45 s (corpsman) or 40-80 s (buddy), and a lightly
// hurt man treated goes back into the fight.
//
//   const FC = createFieldCare({ world (rwworld query), R (rng), ev(e, props), kitOf(u) -> inventory root,
//                                patients() -> [{ id, x, y, z, M (medical), inv, moving, ext: true }] })
//   FC.step(B, dt)    B: groundsim battle (B.mar = marineai, B.units)
//   pickAid(M, invs, by) -> { item, region } | null      the next treatment for a casualty (also used by the player UI)
import * as I from '../infantry/inventory.js';
import { ITEMS } from '../infantry/items.js';
import { BUDDY, REGIONS } from '../infantry/medical.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const d2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const CARE = {
  CALL: [5, 11],                 // s between a conscious casualty's shouts
  BLEED_OUT: [240, 720],         // s an untreated casualty on the cheap model lives (GAME; MEDINV's femoral bleed: ~6 min)
  TREAT: { doc: [20, 45], buddy: [40, 80] },   // s of work on the cheap model (GAME)
  CONSCIOUS: 0.7,                // share of cheap-model casualties who can still crawl and shout (GAME)
  RTD: 0.5,                      // cheap model: a man treated with at least half his body left goes back in (GAME)
  DOC_RANGE: 160, BUDDY_RANGE: 28, PLAYER_RANGE: 90,
  QUIET: 12,                     // s without a known enemy close before casualties are moved to the CCP
  CCP: 13,                       // m from the pad, on the side away from the enemy
  REACH: 1.3,                    // m: the medic kneels this close (MEDINV BUDDY.treatRangeM 1.5)
  JOBS: 3,                       // medics at work at once in a squad (the corpsman + two buddies; GAME)
  CARRY_MIN: 12,                 // m: further than this to go and nobody shooting, a drag becomes a fireman's carry (GAME)
  DRAG_D: 0.85,                  // m from the dragger's feet to the casualty's root (his hands on the drag strap)
};
// what a medic reaches for, in order (the first that applies to the worst region wins): MEDINV item ids
const BLEED_ITEMS = { limb: ['tq_cat', 'tq_strap', 'cravat', 'dressing_battle', 'dressing_field'], trunk: ['quikclot', 'dressing_battle', 'dressing_field', 'chest_seal'] };
const LATER = ['needle_14g', 'chest_seal', 'iv_lr', 'splint_wire', 'sam_splint', 'morphine', 'ammonia', 'unit1_bag'];

// the next treatment for M from the given inventories (the casualty's own kit first, then the medic's)
export function pickAid(M, invs, by) {
  if (!M || M.dead || M.action) return null;
  const has = id => { for (const v of invs) { if (!v) continue; const it = I.find(v, o => o.id === id && !o._gone && (o.uses ?? 1) > 0); if (it) return it; } return null; };
  const sum = M.summary();
  // 1. bleeding, worst first (ml / min)
  const regs = REGIONS.filter(r => sum[r].bleedMlMin > 0 && !sum[r].internal || sum[r].bleeds.some(b => !b.dressed && b.ctl !== 'internal')).sort((a, b) => sum[b].bleedMlMin - sum[a].bleedMlMin);
  for (const r of regs) {
    const limb = r.startsWith('arm') || r.startsWith('leg'), lk = r.startsWith('arm') ? 'arm' : 'leg';
    // the item that works best on this limb (MEDINV's per-application success: a cravat windlass beats the strap on a
    // thigh, the strap is good on an arm), the casualty's own kit first when two are as good (doctrine)
    // 1980 doctrine (FM 21-11, First Aid for Soldiers): a field dressing with pressure first; the tourniquet is for a
    // spurting artery, or a limb still bleeding through its dressing. An ooze never gets one.
    const cands = [], light = sum[r].bleed === 'light', dressFirst = sum[r].bleed === 'heavy' && !sum[r].bleeds.some(b => b.dressed);
    BLEED_ITEMS[limb ? 'limb' : 'trunk'].forEach((id, k) => invs.forEach((v, vi) => {
      if (!v) return; const tq = ITEMS[id].med?.tq; if (tq && light) return;
      const it = I.find(v, o => o.id === id && !o._gone && (o.uses ?? 1) > 0); if (!it) return;
      const p = tq ? tq.p[lk] : (dressFirst ? 1.5 : 0.25) - k * 0.01;
      cands.push({ it, s: p - vi * 0.001 });
    }));
    cands.sort((a, b) => b.s - a.s);
    for (const c of cands) { const o = M.treatOptions(c.it, r, by); if (o.ok) return { item: c.it, region: o.region ?? r, label: o.label, time: o.time }; }
  }
  // 2. a tourniquet that didn't close the artery: tighten it (windlass) or add a second
  for (const r of ['legL', 'legR', 'armL', 'armR']) {
    if (!sum[r].tq.length || sum[r].bleedMlMin < 20) continue;
    let o = M.treatOptions('tightenTQ', r, by); if (o.ok) return { item: 'tightenTQ', region: r, label: o.label, time: o.time };
    for (const id of ['tq_cat', 'tq_strap', 'cravat']) { const it = has(id); if (!it) continue; o = M.treatOptions(it, r, by); if (o.ok) return { item: it, region: r, label: o.label, time: o.time }; }
  }
  // 3. the rest: chest (decompress / seal), volume (IV, corpsman), fractures, pain, a man knocked out
  const cls = M.cls();
  for (const id of LATER) {
    if (id === 'iv_lr' && cls < 2) continue;
    if (id === 'morphine' && (cls >= 3 || M.pain() < 40 || M.opioid > 8)) continue;   // never morphine in shock
    const it = has(id); if (!it) continue;
    for (const r of id === 'iv_lr' || id === 'morphine' || id === 'ammonia' ? [null] : id.includes('splint') || id === 'unit1_bag' ? ['legL', 'legR', 'armL', 'armR', 'stomach', 'thorax'] : ['thorax']) {
      const o = M.treatOptions(it, r, by); if (o.ok) return { item: it, region: o.region ?? r, label: o.label, time: o.time };
    }
  }
  return null;
}

export function createFieldCare(o) {
  const { world } = o, R = o.R || Math.random, ev = o.ev || (() => {});
  const jit = (a, b) => a + (b - a) * R();
  const FC = { log: [], stats: { treated: 0, rtd: 0, dow: 0, dragged: 0, callouts: 0, treatments: 0, playerTreated: 0 } };
  const drag0 = BUDDY.dragSpeed({ weaponUse: 'both', speedMul: 1 }, 95, 25);   // a fit Marine dragging a loaded casualty
  FC.dragV = drag0;
  const carry0 = BUDDY.carrySpeed({ weaponUse: 'both', speedMul: 1, sprint: true }, 95, 25);   // ... and carrying him (fireman's carry)
  FC.carryV = carry0;

  // the casualty collection point of a battle: by the pad, away from where the enemy is (or was)
  function ccp(B, S) {
    const I = B.I, thr = S && (S.threat || S.lastThreat);
    if (B.ccp && (!thr || B.ccpFor === S?.id)) return B.ccp;
    let ax = 1, az = 0;
    if (thr) { ax = I.pad.x - thr[0]; az = I.pad.z - thr[1]; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l; }
    let best = null, bs = -1e9;
    for (let k = 0; k < 8; k++) {
      const a = Math.atan2(az, ax) + (k - 3.5) * 0.35, x = I.pad.x + Math.cos(a) * CARE.CCP, z = I.pad.z + Math.sin(a) * CARE.CCP;
      if (world.isWater(x, z)) continue;
      const h = world.height(x, z), rough = Math.abs(world.height(x + 2, z) - h) + Math.abs(world.height(x, z + 2) - h);
      const sc = -Math.abs(k - 3.5) - rough * 2 + (thr && !world.los(thr[0], world.height(thr[0], thr[1]) + 1.7, thr[1], x, h + 0.5, z) ? 3 : 0);
      if (sc > bs) { bs = sc; best = { x, z, y: h }; }
    }
    B.ccp = best || { x: I.pad.x + 8, z: I.pad.z, y: world.height(I.pad.x + 8, I.pad.z) }; B.ccpFor = S?.id;
    return B.ccp;
  }
  FC.ccp = ccp;
  const urgency = p => p.rich ? (p.rich.M.bleedRate() + (p.rich.M.unconscious ? 50 : 0) + (p.rich.M.ptx ? 80 : 0)) : p.ext ? p.M.bleedRate() : (p.cas && !p.cas.treated ? 100 + p.cas.t : 0);
  const quiet = S => !S.threat && (S.state === 'defend' || S.state === 'hold' || S.state === 'move' || S.state === 'withdraw' && S.stateT > 20);

  // a casualty's care record
  function casOf(u) {
    if (u.cas) return u.cas;
    u.cas = { t: 0, callT: jit(0.5, 2.5), treated: false, treatT: 0, need: 0, conscious: R() < CARE.CONSCIOUS, bleed: jit(...CARE.BLEED_OUT), cover: null, atCCP: false, held: null };
    return u.cas;
  }
  // the medic's hands on a patient for one step. Returns true while there is work.
  function treat(medic, p, dt, skill) {
    const by = { self: false, skill };
    if (p.rich || p.ext) {
      const M = p.ext ? p.M : p.rich.M;
      if (M.dead) return false;
      if (M.action && M.action.by && M.action.by.self && !p.ext) M.cancelTreatment();   // (he was working on himself: the medic takes over, faster)
      if (M.action) {   // (the medic and the patient must stay together: BUDDY.treatRangeM; the caller checks the distance)
        if (p.ext && p.moving) { M.cancelTreatment(); return true; }
        return true;
      }
      const invs = [p.inv || p.rich?.inv, o.kitOf(medic)];
      const aid = pickAid(M, invs, by);
      if (!aid) return false;
      const r = M.startTreatment({ item: aid.item, region: aid.region, by });
      if (r.ok) { FC.stats.treatments++; if (p.ext) FC.stats.playerTreated++; ev('treat', { id: p.id, medic: medic.id, label: aid.label, time: aid.time, x: p.x, y: p.y, z: p.z, ext: !!p.ext }); }
      return !!r.ok;
    }
    // cheap model: a timer
    const c = casOf(p);
    if (!c.need) c.need = jit(...CARE.TREAT[skill === 'corpsman' ? 'doc' : 'buddy']);
    c.treatT += dt;
    if (c.treatT >= c.need) { c.treated = true; FC.stats.treated++; ev('treated', { id: p.id, medic: medic.id, x: p.x, y: p.y, z: p.z }); return false; }
    return true;
  }
  // a patient's treatment is done (nothing left to do with the kit at hand)
  const doneWith = p => p.ext ? !p.M.action && (p.M.bleedRate() < 4 || !pickAid(p.M, [p.inv, null], { self: false, skill: 'corpsman' })) : p.rich ? !p.rich.M.action && p.cas?.treated : p.cas?.treated;

  FC.step = (B, dt) => {
    if (FC.pause) return;   // (scenes: hold the corpsman back while the player works)
    const ext = o.patients ? o.patients(B) : [];
    for (const S of B.mar.squads) {
      const ms = S.members;
      if (S.threat) S.lastThreat = S.threat;
      S.quietT = S.threat ? 0 : (S.quietT || 0) + dt;
      // ---- the casualties
      const cas = [];
      for (const u of ms) {
        if (!u.alive) { u.cas = null; continue; }
        if (u.able) { if (u.cas && !u.cas.held) u.cas = null; continue; }
        const c = casOf(u); c.t += dt; cas.push(u);
        // conscious? (rich: MEDINV decides; cheap: a roll at the wound)
        const awake = u.rich ? !u.rich.M.unconscious && !u.rich.M.dead : c.conscious;
        // dying of wounds (cheap model only: the rich model bleeds for real)
        if (!u.rich && !c.treated) { c.bleed -= dt; if (c.bleed <= 0) { FC.stats.dow++; o.kill(u, 'DIED OF WOUNDS'); continue; } }
        // calling out
        if (awake && !c.treated && !c.held && (c.callT -= dt) <= 0) { c.callT = jit(...CARE.CALL); FC.stats.callouts++; ev('callout', { id: u.id, x: u.x, y: u.y + 0.4, z: u.z, text: c.t < 8 ? "I'M HIT!" : R() < 0.6 ? 'CORPSMAN!' : 'CORPSMAN UP!' }); }
        // crawling to cover from where it came (if he can move and nobody is working on him)
        u.crawl = null;
        const thr = S.threat || S.lastThreat;
        if (awake && !c.held && !c.medic && !c.atCCP && thr && S.quietT < 20) {
          if (!c.cover || c.coverT === undefined) {
            c.coverT = 0; let best = null, bs = -1e9; const ty = world.height(thr[0], thr[1]) + 1.7;
            for (const cp of world.coverPoints(u.x, u.z, 9, [])) { const sc = world.coverScore(cp, thr[0], ty, thr[1], 0.5, 1); const s = (sc.hidden ? 3 : 0) - d2(cp.x, cp.z, u.x, u.z) / 3; if (s > bs) { bs = s; best = cp; } }
            c.cover = best && bs > 0 ? [best.x, best.z] : 'none';
          }
          if (Array.isArray(c.cover) && d2(c.cover[0], c.cover[1], u.x, u.z) > 0.8) { const dx = c.cover[0] - u.x, dz = c.cover[1] - u.z, l = Math.hypot(dx, dz); u.crawl = { vx: dx / l * 0.25, vz: dz / l * 0.25, walk: false }; }
        }
        // a walking wounded on his way to the CCP (told to go when it went quiet)
        // (or to a helicopter that has come for the wounded: casevac.js sets toHuey)
        if (c.toHuey && !c.held && !c.medic && (u.rich ? u.rich.canWalk() : c.conscious && u.body.hp.legL > 0 && u.body.hp.legR > 0)) {
          const dx = c.toHuey[0] - u.x, dz = c.toHuey[1] - u.z, l = Math.hypot(dx, dz);
          if (l > 3) u.crawl = { vx: dx / l * 1.0, vz: dz / l * 1.0, walk: true };
        } else if (c.walkCCP && !c.held && !c.medic) {
          const P = ccp(B, S), dx = P.x - u.x, dz = P.z - u.z, l = Math.hypot(dx, dz);
          if (l < 2.5 || S.threat) { c.walkCCP = false; if (l < 3.5) c.atCCP = true; }
          else u.crawl = { vx: dx / l * 1.0, vz: dz / l * 1.0, walk: true };
        }
      }
      // the player, when he is near this squad and bleeding (a corpsman comes to him)
      const cx = S.cx ?? (ms[0] && ms[0].x), cz = S.cz ?? (ms[0] && ms[0].z);
      for (const p of ext) if (cx !== undefined && d2(p.x, p.z, cx, cz) < CARE.PLAYER_RANGE && !p.M.dead && (p.M.bleedRate() > 6 || p.M.unconscious || p.M.action && p.careBy === S.id)) { p.careBy = S.id; cas.push(p); }
      // ---- the medics: the corpsman, and riflemen doing buddy aid (when the squad isn't in the thick of it, or the man
      // is right next to them); up to CARE.JOBS at once so the squad keeps fighting
      S.cares = (S.cares || []).filter(job => {
        const ok = job.medic.alive && job.medic.able && (job.p.ext ? (cas.includes(job.p) || job.phase === 'treat') : job.p.alive);
        if (!ok) { if (job.p.cas) job.p.cas.medic = null; job.medic.ai.paceV = undefined; }
        return ok;
      });
      const busyM = new Set(S.cares.map(j => j.medic)), busyP = new Set(S.cares.map(j => j.p));
      const doc = ms.find(m => m.role === 'doc' && m.alive && m.able);
      if (cas.length && S.cares.length < CARE.JOBS) {
        // (a treated man is only looked at again if he has started bleeding again and there is something to do about it)
        const again = p => p.rich && p.rich.M.bleedRate() > 20 && !!pickAid(p.rich.M, [p.rich.inv, doc ? o.kitOf(doc) : null], { self: false, skill: doc ? 'corpsman' : 'rifleman' });
        const order = cas.filter(p => !busyP.has(p) && !(p.cas && p.cas.held) && !(p.cas && p.cas.treated && !again(p))).sort((a, b) => urgency(b) - urgency(a));
        for (const p of order) {
          if (S.cares.length >= CARE.JOBS) break;
          let job = null;
          if (doc && !busyM.has(doc) && d2(doc.x, doc.z, p.x, p.z) < CARE.DOC_RANGE) job = { medic: doc, p, phase: 'go', skill: 'corpsman', t: 0 };
          else {
            let best = null, bd = CARE.BUDDY_RANGE;
            const calm = quiet(S) || S.state === 'defend';
            for (const m of ms) if (m.alive && m.able && m !== ms[0] && m.role !== 'mg' && m.role !== 'doc' && !busyM.has(m)) { const d = d2(m.x, m.z, p.x, p.z); if (d < bd && (calm || d < 6)) { bd = d; best = m; } }
            if (best) job = { medic: best, p, phase: 'go', skill: 'rifleman', t: 0 };
          }
          if (job) { S.cares.push(job); busyM.add(job.medic); busyP.add(p); if (p.cas) p.cas.medic = job.medic.id; ev('medic', { id: job.medic.id, to: p.id, x: job.medic.x, y: job.medic.y, z: job.medic.z, doc: job.skill === 'corpsman', ext: !!p.ext }); }
        }
      }
      // a treated casualty and a quiet squad: to the CCP (walking wounded by themselves; the rest dragged by a buddy)
      // (and a helicopter down for the wounded - casevac.js sets toHuey: the litter cases are carried to it, quiet or not)
      const heli = cas.find(p => p.cas && p.cas.toHuey)?.cas.toHuey;
      if ((quiet(S) && S.quietT > CARE.QUIET) || heli) {
        const P = ccp(B, S), dest = p => p.cas.toHuey ? { x: p.cas.toHuey[0], z: p.cas.toHuey[1] } : P;
        for (const p of cas) if (!heli && !p.ext && p.cas && p.cas.treated && !p.cas.atCCP && !p.cas.held && !p.cas.walkCCP && !busyP.has(p) && (p.rich ? p.rich.canWalk() : p.cas.conscious && p.body.hp.legL > 0 && p.body.hp.legR > 0)) { p.cas.walkCCP = true; ev('walking', { id: p.id, x: p.x, y: p.y, z: p.z }); }
        const canWalk = p => p.rich ? p.rich.canWalk() : p.cas.conscious && p.body.hp.legL > 0 && p.body.hp.legR > 0;
        const wait = cas.find(p => !p.ext && p.cas && (p.cas.treated || p.cas.toHuey) && !(p.rich && p.rich.M.action) && !(p.cas.atCCP && !p.cas.toHuey) && !p.cas.held && !p.cas.walkCCP && !(p.cas.toHuey && canWalk(p)) && !busyP.has(p) && d2(p.x, p.z, dest(p).x, dest(p).z) > 3.5);
        if (wait && S.cares.length < CARE.JOBS) {
          let best = null, bd = 80;
          for (const m of ms) if (m.alive && m.able && m !== ms[0] && !busyM.has(m)) { const d = d2(m.x, m.z, wait.x, wait.z); if (d < bd) { bd = d; best = m; } }
          if (best) { S.cares.push({ medic: best, p: wait, phase: 'fetch', skill: best.role === 'doc' ? 'corpsman' : 'rifleman', t: 0 }); busyP.add(wait); }
        }
        for (const p of cas) if (p.cas && !p.cas.atCCP && d2(p.x, p.z, P.x, P.z) < 3.5) p.cas.atCCP = true;
      }
      S.care = S.cares[0] || null;   // (the first job, for hosts and benches that look at one)
      for (const job of [...S.cares]) if (runJob(B, S, job, dt) === 'end') { const k = S.cares.indexOf(job); if (k >= 0) S.cares.splice(k, 1); }
    }
  };
  // one medic's job for one step: 'end' when it is over
  function runJob(B, S, job, dt) {
    const m = job.medic, a = m.ai, p = job.p; job.t += dt;
    const d = d2(m.x, m.z, p.x, p.z), fight = !!S.threat && !quiet(S);
    a.fire = null; a.aim = null; if (a.law) a.law = null;
    const end = () => { if (p.cas) p.cas.medic = null; a.paceV = undefined; return 'end'; };
    if (job.phase === 'go' || job.phase === 'fetch') {
      // kneel on the far side of him from the enemy
      const thr = S.threat || S.lastThreat; let tx = p.x, tz = p.z;
      if (thr) { const ax = p.x - thr[0], az = p.z - thr[1], l = Math.hypot(ax, az) || 1; tx += ax / l * 0.9; tz += az / l * 0.9; }
      a.move = [tx, tz]; a.face = Math.atan2(-(p.x - m.x), -(p.z - m.z));
      a.pace = d > 14 ? (fight && a.supp < 0.6 ? 'rush' : 'run') : fight ? 'crawl' : 'walk';
      a.stance = a.pace === 'crawl' ? 'prone' : 'stand'; a.paceV = undefined;
      a.state = job.phase === 'go' ? `${job.skill === 'corpsman' ? 'corpsman' : 'buddy aid'}: to ${p.ext ? 'the player' : 'casualty ' + p.id}` : 'fetching a casualty';
      if (d < CARE.REACH + (p.ext ? 0.2 : 0)) {
        if (job.phase === 'go') { job.phase = 'treat'; ev('kneel', { id: m.id, to: p.id }); }
        else { job.phase = 'drag'; if (p.cas) p.cas.held = m.id; FC.stats.dragged++; ev('drag', { id: m.id, to: p.id, x: p.x, y: p.y, z: p.z }); }
      }
      if (job.t > 90) return end();
    } else if (job.phase === 'treat') {
      a.move = d > CARE.REACH + 0.6 ? [p.x, p.z] : null; a.pace = 'walk'; a.face = Math.atan2(-(p.x - m.x), -(p.z - m.z));
      a.stance = fight ? 'prone' : 'crouch'; a.state = `${job.skill === 'corpsman' ? 'corpsman' : 'buddy aid'}: treating`;
      if (d > BUDDY.treatRangeM + 0.3) { if (p.ext ? p.M.action : p.rich?.M.action) (p.ext ? p.M : p.rich.M).cancelTreatment(); job.phase = 'go'; return; }   // (he moved: follow him)
      if (!p.ext && p.able && !(p.rich && p.rich.M.action)) { ev('done', { id: m.id, to: p.id, x: p.x, y: p.y, z: p.z }); return end(); }   // back on his feet
      const busy = treat(m, p, dt, job.skill);
      if (!busy || doneWith(p)) {
        if (p.cas) p.cas.treated = true;
        if (!p.ext) FC.stats.treated += p.rich ? 1 : 0;
        ev('done', { id: m.id, to: p.id, ext: !!p.ext, x: p.x, y: p.y, z: p.z });
        // cheap model: a man with enough of him left gets up and goes back to his fire team
        if (!p.ext && !p.rich && p.body && p.body.alive && o.rtd && o.rtd(p, CARE.RTD)) { FC.stats.rtd++; }
        if (p.ext) p.careBy = null;
        return end();
      }
    } else if (job.phase === 'drag') {
      // backwards, the casualty by the vest's drag strap: MEDINV's drag speed for a loaded casualty. FM 21-11: drag under
      // fire (low); with nobody shooting and a long way to go, he lifts him into a fireman's carry (faster, upright)
      const P = p.cas && p.cas.toHuey ? { x: p.cas.toHuey[0], z: p.cas.toHuey[1] } : ccp(B, S), dd = d2(m.x, m.z, P.x, P.z);   // (to the CCP, or the helicopter that came for him)
      const held = p.cas && p.cas.held === m.id; job.holdT = (job.holdT || 0) + dt;
      if (held && !job.carry && dd > CARE.CARRY_MIN && !S.threat && m.able && job.holdT > 1.5 && o.carry) { job.carry = true; FC.stats.carried = (FC.stats.carried || 0) + 1; ev('carry', { id: m.id, to: p.id, x: p.x, y: p.y, z: p.z }); }
      a.move = [P.x, P.z]; a.pace = 'walk'; a.paceV = job.carry ? carry0 : drag0; a.stance = 'stand'; a.state = job.carry ? 'carrying a casualty' : 'dragging a casualty';
      a.face = job.carry ? undefined : Math.atan2(-(p.x - m.x), -(p.z - m.z));   // (carrying: he walks forward)
      if (held) {
        if (job.carry) o.carry(p, m);
        else { const bx = m.x - p.x, bz = m.z - p.z, bl = Math.hypot(bx, bz) || 1; if (bl > CARE.DRAG_D) o.drag(p, m.x - bx / bl * CARE.DRAG_D, m.z - bz / bl * CARE.DRAG_D, Math.atan2(bx, bz)); }
      }
      if (dd < 2.5 || (S.threat && !(p.cas && p.cas.toHuey)) || job.t > 240 || !m.able) {
        if (p.cas) { p.cas.held = null; p.cas.atCCP = dd < 4; }
        if (job.carry) { if (o.carry) o.carry(p, null, m); job.carry = false; }   // (put down beside him)
        ev('dropped', { id: m.id, to: p.id, atCCP: dd < 4 }); return end();
      }
    }
  }
  return FC;
}
