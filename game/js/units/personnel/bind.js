// PERSONNEL: the roster <-> the ground war (groundsim.js). PURE (no THREE, no DOM): node runs real fights with it in
// tools/personnelbench.mjs. One person = one body: a Marine in a battle IS a roster record (u.pid); his kit IS the
// record's MEDINV kit (the near "rich" model fires out of it, the far model counts its rounds out of it); his skill
// sets how he shoots and reacts (u.skK, u.reactK, u.skSway) and how fast he treats (u.medK); every hit on him - the
// enemy's, ours (friendly fire) - lands on his record through the ground sim's own hit path.
//
//   const BD = createBinder(P, GS, { feed, me: () => rec | null, islandName: I => name })
//   BD.stick(n, loc) -> [recs]           a Sea Knight's load by role from the people at loc (a squad first; replacements)
//   BD.bind(u, rec, I)                   a ground-war Marine is this man;  BD.unbind(u)
//   BD.onEvent(e)                        groundsim's hooks.onEvent
//   BD.tick(dt)                          ~1 Hz: kit and health books, ammunition shared out, rearm on a friendly pad
//   BD.recOf(u) / BD.unitOf(rec)
import { summary, spend556, spend762, give, resupply } from './kit.js';
import { JOBS, MOS } from './roster.js';

// ground-war role <-> job, and the weapon skill each role fights with
export const ROLE_JOB = { sl: 'leader', tl: 'rifleman', ar: 'rifleman', aar: 'rifleman', gren: 'grenadier', mg: 'mg', doc: 'corpsman' };
export const JOB_ROLE = { leader: 'sl', rifleman: 'aar', grenadier: 'gren', mg: 'mg', corpsman: 'doc' };
const ROLE_SKILL = { mg: 'mg', gren: 'launcher' };
const ROLE_MOS = { sl: '0369', tl: '0311', ar: '0311', aar: '0311', gren: '0311', mg: '0331', doc: '8404' };
export const roleAt = (k, n) => k >= 5 && k === n - 1 ? 'doc' : ['sl', 'tl', 'ar', 'aar', 'gren'][k === 0 ? 0 : 1 + ((k - 1) % 4)];   // (groundwar.js's order off the ramp)
// what a hit from the war's own guns is called in the feed
export const WHAT = { b: 'DOOR GUN', rocket: 'ROCKETS', bomb: 'A BOMB', jb: 'A 20 MM GUN RUN', ciws: 'AA FIRE', shell: 'NAVAL GUNFIRE', aam: 'A MISSILE', blast: 'A BLAST', flak: 'FLAK',
  m16: 'M16 FIRE', m60: 'M60 FIRE', m203: 'AN M203 ROUND', law: 'A LAW', m67: 'A GRENADE', player: "THE COMMANDER'S RIFLE", crash: 'A VEHICLE' };
const HPSUM = 440;

export function createBinder(P, GS, o = {}) {
  const feed = o.feed || (() => {});
  const BD = { units: new Map(), stats: { bound: 0, ffHits: 0, shared: 0, rearmed: 0, dry: 0 } };
  BD.recOf = u => (u && u.pid ? P.get(u.pid) : null);
  BD.unitOf = r => (r && r.body && r.body.kind === 'gw' ? BD.units.get(r.body.id) || null : null);
  // ------------------------------------------------------------------------------------------------- who goes
  // a stick of n for a Sea Knight from the people at loc: a squad that is there first (the commander's organisation),
  // then the best free man for each role, then green replacements (the battalion sends them)
  BD.stick = (n, loc = 'ALBATROSS', o2 = {}) => {
    const roles = Array.from({ length: n }, (_, k) => roleAt(k, n)), out = new Array(n).fill(null), used = new Set();
    const free = r => P.able(r) && !r.civ && !r.body && !r.unit && r.loc === loc && !used.has(r.id) && !r.transit;
    let pool = [];
    const sq = o2.squad || P.squads.find(s => s.loc === loc && !s.gs && P.members(s).filter(free).length >= Math.min(4, n));
    if (sq) pool = P.members(sq).filter(free);
    const fill = (k, cands) => {
      const job = ROLE_JOB[roles[k]], J = JOBS[job];
      let best = null, bx = -1;
      for (const r of cands) { if (used.has(r.id) || P.qualified(r, job)) continue; const x = (J.skill ? P.xp(r, J.skill) : 0) + (r.job === job ? 30 : 0); if (x > bx) { bx = x; best = r; } }
      if (best) { out[k] = best; used.add(best.id); }
    };
    const order = roles.map((r, k) => k).sort((a, b) => (roles[a] === 'doc' || roles[a] === 'sl' ? -1 : 0) - (roles[b] === 'doc' || roles[b] === 'sl' ? -1 : 0));
    for (const k of order) fill(k, pool);
    const rest = P.recs.filter(r => free(r) && (MOS[r.mos].svc === 'usmc' && JOBS[r.job]?.foot || r.mos === '8404' || r.job === 'reserve'));
    for (const k of order) if (!out[k]) fill(k, rest);
    // a squad of riflemen with no corpsman / leader at loc: a rifleman fills the seat (the doc's seat: whoever is left)
    for (const k of order) if (!out[k]) { const r = rest.find(r => !used.has(r.id) && !P.qualified(r, 'rifleman')); if (r) { out[k] = r; used.add(r.id); } }
    for (let k = 0; k < n; k++) if (!out[k]) { out[k] = P.add({ mos: ROLE_MOS[roles[k]], loc, green: true }); P.note(out[k], 'JOINED AS A REPLACEMENT'); BD.stats.replacements = (BD.stats.replacements || 0) + 1; }
    for (let k = 0; k < n; k++) out[k].stickRole = roles[k];
    return { recs: out, squad: sq || null };
  };
  // ------------------------------------------------------------------------------------------------- bind
  BD.skill = (u, r) => {
    const ws = ROLE_SKILL[u.role] || 'rifle', k = P.perf(r, ws);
    u.skK = 1 / k; u.skSway = 1 / Math.sqrt(k); u.reactK = 1 / Math.sqrt(P.perf(r, 'rifle'));
    u.medK = P.perf(r, 'medical') / (u.role === 'doc' ? 1 : 0.8);
  };
  BD.bind = (u, r, I) => {
    if (!u || !r) return;
    if (u.pid && u.pid !== r.id) BD.unbind(u);
    u.pid = r.id; r.body = { kind: 'gw', id: u.id }; BD.units.set(u.id, u); BD.stats.bound++;
    u.name = P.label(r);
    if (!u.rich) u.kit = P.kit(r);   // (the rich model, made later, fires out of this kit: GS.kitOf reads u.kit)
    const s = summary(u.kit || P.kit(r));
    u.ammo = u.role === 'mg' ? s.r762 : s.r556; u.spent = 0;
    u.body.laws = u.laws = s.law; u.body.gl = u.gl = s.gl; u.body.frags = u.frags = s.m67;
    r.loc = I ? (o.islandName ? o.islandName(I) : I.name) : r.loc; r.unit = null; r.seat = null; r.transit = null;
    const job = ROLE_JOB[u.role]; if (job && !P.qualified(r, job)) r.job = job;
    r.status = u.body.able ? (r.hp < 0.98 ? 'wounded' : 'fit') : 'down';
    BD.skill(u, r);
  };
  BD.unbind = u => {
    const r = BD.recOf(u);
    if (r) { BD.books(u, r); if (r.body && r.body.id === u.id) r.body = null; }
    BD.units.delete(u.id);
  };
  // the books: rounds fired out of his kit, his health on the record
  BD.books = (u, r) => {
    if (u.spent > 0 && !u.richOn) { (u.role === 'mg' ? spend762 : spend556)(r.kitRoot, u.spent); }
    u.spent = 0;
    { const s = summary(r.kitRoot); u.ammo = u.role === 'mg' ? s.r762 : s.r556; }
    if (u.body) {
      const hp = u.rich ? richHp(u) : Object.values(u.body.hp).reduce((a, b) => a + b, 0) / HPSUM;
      P.health(r, hp, !u.body.alive ? 'kia' : !u.body.able ? 'down' : hp < 0.98 ? 'wounded' : 'fit');
    }
  };
  const richHp = u => { const R = u.rich.M.regions; let a = 0, b = 0; for (const k in R) { a += Math.max(0, R[k].hp); b += R[k].max; } return b ? a / b * (1 - Math.min(0.6, u.rich.M.lossFrac?.() || 0)) : 1; };
  // ------------------------------------------------------------------------------------------------- events
  const unitById = id => BD.units.get(id) || GS.units.find(u => u.id === id) || null;
  BD.shooter = src => {
    if (src === 'player') return o.me ? o.me() : null;
    if (typeof src === 'number') { const u = BD.units.get(src); return u ? BD.recOf(u) : null; }
    return null;
  };
  BD.onEvent = e => {
    switch (e.e) {
      case 'shot': {
        if (e.side !== 1) break;
        const u = BD.units.get(e.src); const r = u && BD.recOf(u); if (!r) break;
        r.stats.shots++; P.gain(r, e.ammo === 'm60' ? 'mg' : e.ammo === 'm203' || e.ammo === 'law' ? 'launcher' : 'rifle', e.ammo === 'law' ? 0.8 : e.ammo === 'm203' ? 0.3 : 0.02);
        break;
      }
      case 'hit': {
        const shooter = BD.shooter(e.src), victimU = unitById(e.id);
        if (shooter && victimU && victimU.side === 2 && e.side === 1) { shooter.stats.hits++; P.gain(shooter, e.ammo === 'm60' ? 'mg' : e.ammo === 'm203' || e.ammo === 'law' || e.blast ? 'launcher' : 'rifle', 0.6); }
        if (!victimU || victimU.kind !== 'marine') break;
        const r = BD.recOf(victimU); if (!r) break;
        const kind = typeof e.src === 'string' && e.src.startsWith('war:') ? e.src.slice(4) : e.src === 'player' ? 'player' : e.ammo;
        const what = WHAT[kind] || WHAT[e.ammo] || 'ENEMY FIRE', hp0 = r.hp;
        const hp = victimU.rich ? richHp(victimU) : Object.values(victimU.body.hp).reduce((a, b) => a + b, 0) / HPSUM;
        const st = !victimU.body.alive ? 'kia' : !victimU.body.able ? 'down' : 'wounded';
        const by = { side: e.side, pid: shooter ? shooter.id : null, what };
        if (e.ff) BD.stats.ffHits++;
        P.hurt(r, { amount: Math.max(0, hp0 - hp), hp, status: st, part: e.part && e.part !== 'blast' ? e.part : e.blast ? 'fragments' : 'body', what: e.side === 2 ? (e.ammo === 'coil120' ? 'COILGUN' : 'STRIDER FIRE') : what, by });
        BD.pend.delete(victimU.id);
        break;
      }
      // (a kill inside a hit comes before its 'hit' event: wait for it, so the record knows whose round it was)
      case 'kia': { const u = unitById(e.id); if (u && BD.recOf(u)) BD.pend.set(u.id, e); break; }
      case 'wia': { const u = unitById(e.id); const r = u && BD.recOf(u); if (r) P.health(r, r.hp, 'down'); break; }
      case 'rtd': { const u = unitById(e.id); const r = u && BD.recOf(u); if (r) { P.health(r, r.hp, 'wounded'); P.note(r, 'BACK IN THE FIGHT'); } break; }
      case 'treat': case 'treated': {
        const m = unitById(e.medic); const r = m && BD.recOf(m); if (r) { r.stats.treated += e.e === 'treated' ? 1 : 0; P.gain(r, 'medical', e.e === 'treat' ? 1.2 : 2); }
        break;
      }
      case 'evac': { const u = e.u || unitById(e.id); const r = u && BD.recOf(u); if (r) { BD.books(u, r); r.status = r.status === 'kia' ? 'kia' : 'evac'; r.evacUnit = u.id; r.body = null; r.loc = 'CASEVAC'; if (r.squad) P.leaveSquad(r); P.note(r, 'CASUALTY EVACUATION'); } if (u) BD.units.delete(u.id); break; }
      case 'remove': { const u = e.u; if (u && BD.units.has(u.id)) BD.unbind(u); break; }
      case 'dry': { const r = P.get(e.pid); if (r) { BD.stats.dry++; P.note(r, 'OUT OF AMMUNITION'); } break; }
    }
  };
  // casevac: delivered to the sick bay / lost aboard a Sea Knight
  BD.delivered = ids => { for (const r of P.recs) if (r.evacUnit != null && ids.includes(r.evacUnit) && r.status !== 'kia') { r.evacUnit = null; P.toSickBay(r); } };
  BD.lostAboard = ids => { for (const r of P.recs) if (r.evacUnit != null && ids.includes(r.evacUnit)) { r.evacUnit = null; P.kill(r, 'LOST WITH THE SEA KNIGHT'); } };
  // ------------------------------------------------------------------------------------------------- the 1 Hz books
  // ammunition: a man dry takes two magazines (or a belt) from the squad mate with the most within 25 m (GAME: "ammo
  // up" - redistribution); a squad on a friendly pad rearms from the island's stocks every 90 s
  BD.pend = new Map();
  BD.flush = () => { for (const [id, e] of BD.pend) { const u = unitById(id); const r = u && BD.recOf(u); if (r && r.status !== 'kia') P.kill(r, e.dow ? 'DIED OF WOUNDS' : 'KILLED IN ACTION'); } BD.pend.clear(); };
  // frac < 1: only that share of the men this call (the game calls it every frame with frac = dt: each man ~once a
  // second, the cost spread evenly instead of a spike)
  let cursor = 0;
  BD.tick = (dt, ctx = {}, frac = 1) => {
    BD.flush();
    const all = [...BD.units.values()], n = all.length, k = frac >= 1 ? n : Math.min(n, Math.ceil(n * frac));
    for (let j = 0; j < k; j++) {
      const u = all[(cursor + j) % n];
      const r = BD.recOf(u); if (!r) { BD.units.delete(u.id); continue; }
      if (!GS.units.includes(u)) { BD.unbind(u); continue; }
      BD.books(u, r);
      if (!u.alive) continue;
      if (u.dry && u.able) {
        const kind = u.role === 'mg' ? 'belt762' : 'mag556', key = u.role === 'mg' ? 'r762' : 'r556';
        let best = null, bn = u.role === 'mg' ? 100 : 60;
        for (const m of (u.squad && u.squad.members) || []) {
          if (m === u || !m.alive || !m.pid || Math.hypot(m.x - u.x, m.z - u.z) > 25) continue;
          const mr = BD.recOf(m); if (!mr) continue; const n = summary(mr.kitRoot)[key];
          if (n > bn) { bn = n; best = mr; }
        }
        if (best && give(best.kitRoot, r.kitRoot, kind, u.role === 'mg' ? 1 : 2)) {
          BD.stats.shared++; u.ammo = summary(r.kitRoot)[key]; u.dry = false; P.note(r, `AMMO FROM ${P.label(best)}`);
          if (ctx.near && ctx.near(u)) feed(`${P.label(r)}: "AMMO UP!"  -  ${P.label(best)} TOSSES HIM ${u.role === 'mg' ? 'A BELT' : 'TWO MAGAZINES'}`, 'info');
        }
      }
      const I = u.B && u.B.I;
      if (I && I.owner === 1 && I.pad && Math.hypot(u.x - I.pad.x, u.z - I.pad.z) < (I.pad.r || 10) + 30 && (GS.time - (u.rearmT ?? -99)) > 90) {
        const s0 = summary(r.kitRoot), want = u.role === 'mg' ? s0.r762 < 300 : s0.r556 < 120;
        if (want) { const got = resupply(r.kitRoot, r); if (got.length) { u.rearmT = GS.time; BD.stats.rearmed++; const s = summary(r.kitRoot); u.ammo = u.role === 'mg' ? s.r762 : s.r556; u.dry = false; u.body.laws = u.laws = s.law; P.note(r, `REARMED AT ${I.name}`); } }
      }
      BD.skill(u, r);
    }
    cursor = n ? (cursor + k) % n : 0;
  };
  return BD;
}
