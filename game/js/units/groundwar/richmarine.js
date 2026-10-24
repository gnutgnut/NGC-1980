// THE GROUND WAR, infantry depth (ngc/infdepth): an AI Marine on the REAL rifleman sim, for the men near the camera.
// Pure (no THREE, no DOM): node runs it in tools/groundwarbench.mjs / tools/buddyaidbench.mjs.
//
// Far away a Marine is marine.js's kinematic body (paces, stance timers, part HP and game wound rules). Close to the
// camera (groundsim's near level of detail) he is promoted to this: INFANTRY's rifleman (soldier.js body with inertia,
// load, Tobler, stance transitions, stamina; weapons.js state machines: magazines out of his own MEDINV rig through
// invbridge.js, stoppages, SPORTS immediate action and remedial action, reloads that take their real time) and MEDINV's
// medical sim (bleeding, shock, consciousness, going down, being treated, coming back). The squad AI (marineai.js) still
// decides; this turns its intent into the rifleman's input, the way a player's hands would:
//   move / pace -> move vector in his own frame, walk / run / sprint; stance -> one-shot stance requests;
//   face / aim -> look deltas at a human turn rate (the soldier's weapon inertia and sway do the rest);
//   fire 'rifle' -> trigger pulls at an aimed cadence, 'auto' -> the AR's selector on AUTO and bursts;
//   an empty magazine -> 'reload' (tactical, the rig's fullest magazine); a stoppage -> 'ia' (SPORTS), a stuck case ->
//   'remedial'. The rounds themselves stay GAME-LEVEL: each 'shot' the rifleman fires (from his real muzzle, along his
//   real swaying bore) becomes one of groundsim's projectiles, as every other round in the ground war (BIBLE: weapons
//   stay at game level). M203 lobs and LAWs keep groundsim's simple firing (the body shows the right weapon).
//
//   const RM = createRichMarine(u, { rng, env })        u: the groundsim unit (u.body = marine.js body, u.role)
//   RM.place(x, z, yaw)                                 when he comes into the near level of detail
//   RM.step(dt, ai, env, steer) -> shot events [{ x, y, z, dir, ammo }]
//   RM.hit(hitInfo) -> medical result                  (medical.js hit-info: part, dmg, pen, kind)
//   RM.medStep(dt)                                      medical only (far away, or lying wounded)
//   RM.state() -> 'ok' | 'down' | 'dead'               (game rule on top of MEDINV: see downNow)
import { createRifleman } from '../infantry/rifleman.js';
import { createMedical, mulberry32 } from '../infantry/medical.js';
import * as I from '../infantry/inventory.js';
import { createInvBridge } from '../infantry/invbridge.js';
import { soldierMods } from '../../marinesim.js';
import { pickAid } from './fieldcare.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const angN = a => ((a % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
// squad role -> MEDINV loadout (inventory.js): the automatic rifleman carries the rifleman's kit with more magazines
export const ROLE_KIT = { sl: 'rifleman', tl: 'rifleman', ar: 'rifleman', aar: 'rifleman', gren: 'grenadier', mg: 'mg', doc: 'corpsman' };
// GAME: how fast a man turns his head and rifle onto a new bearing (rad / s), and how close is "on target" (rad)
const TURN = 4.5, ON_TGT = 0.03;   // (~260 deg/s: a trained target transition, 90 deg in ~0.35 s; ~1.7 deg: a combat shot, not a range shot; ngc/infdepth-fix: 0.012 starved the fire, 3.2 rad/s left the near men firing half the cheap model's rounds)
export const RICH_STEP = 1 / 30;   // rifleman sub-step for AI men (the player runs 1/120 s; AI aim needs less)

export function createRichMarine(u, o = {}) {
  const rng = o.rng || mulberry32((u.seed ?? u.id ?? 1) * 7919 + 13);
  const kit = ROLE_KIT[u.role] || 'rifleman';
  const inv = o.inventory || I.loadout(kit);
  // the AR: two more magazines (FMFM 6-5: the automatic rifleman's basic load is heavier); the LAW only for the men the
  // body says have one
  if (u.role === 'ar') for (let i = 0; i < 2; i++) I.autoStore(inv, Object.assign(I.newItem('mag_m16_20', { fill: 'M193', rounds: 18 })));
  if (kit === 'rifleman' && !(u.body && u.body.laws > 0) && inv.slots.secondary) I.detach(inv.slots.secondary);
  const B = createInvBridge(inv, { rng });
  const R = createRifleman({ loadout: B.loadout(), inventory: B, kitKg: 0, id: 'gw' + u.id, side: 1, rng, swayScale: 1, deadzone: 0 });
  B.attach(R);
  const S = R.soldier;
  const M = createMedical({ rng, skill: u.role === 'doc' ? 'corpsman' : 'rifleman', name: (u.role === 'doc' ? 'HM3 ' : 'PFC ') + (u.name || 'MARINE ' + u.id) });
  const RM = { u, R, S, M, inv, B, mods: {}, medAcc: 0, trigT: 0, burst: 0, shots: [], active: false, prevState: 'ok', t: 0, stats: { shots: 0, reloads: 0, ia: 0, steps: 0 } };
  if (u.role === 'ar') { const w = R.slots[0]; if (w && w.def.modes.includes('auto')) w.mode = w.def.modes.indexOf('auto'); }
  soldierMods(M, RM.mods);

  RM.place = (x, z, yaw, env) => {
    const y = env.height(x, z);
    S.place(x, y, z, yaw, u.body?.stanceTo === 'prone' ? 'prone' : u.body?.stanceTo === 'crouch' ? 'crouch' : 'stand');
    S.vel.x = u.body?.vx || 0; S.vel.z = u.body?.vz || 0;
  };
  // ---- medical (10 Hz near, the caller can run it slower far away)
  RM.medStep = dt => {
    const evs = M.update(dt, { exertion: S.exertion, moving: S.speed > 0.3 });
    soldierMods(M, RM.mods);
    if (!RM.noSelfAid) RM.selfAid();
    if (evs.some(e => e.type === 'consumed')) I.prune(inv);   // (used dressings and tourniquets leave the rig)
    return evs;
  };
  // GAME RULE on top of MEDINV (what takes a man out of the fight): dead; unconscious; both arms out; shock class III+
  // (he can't fight on); both legs out (crawl only). A man treated back below that gets up again.
  // + a bleed he can't ignore (> 250 ml/min: an artery) or a blacked-out chest / belly: he is a casualty
  // until it is under control
  // Once down, he only goes back into the fight with no tourniquet on, no broken bone and no more than class I blood
  // loss (GAME; a man with a tourniquet is a casualty to evacuate, walking or not)
  RM.state = () => {
    if (M.dead) return 'dead';
    const md = RM.mods.med || M.mods();
    if (M.unconscious || md.weaponUse === 'none' || md.cls >= 3 || md.crawlOnly || md.bleeding > 250 || M.regions.thorax.hp <= 0 || M.regions.stomach.hp <= 0) { RM.wasDown = true; return 'down'; }
    if (RM.wasDown && (md.cls >= 2 || ['armL', 'armR', 'legL', 'legR'].some(r => M.regions[r].tq.length || (M.regions[r].fracture && !M.regions[r].splint)))) return 'down';
    RM.wasDown = false;
    return 'ok';
  };
  // a casualty who can still walk (to the CCP, to a helicopter): conscious, legs that carry him
  RM.canWalk = () => { const md = RM.mods.med || M.mods(); return !M.dead && !M.unconscious && !md.crawlOnly && md.speedMul > 0.45 && md.cls < 4; };
  // SELF AID (FM 21-11: the casualty treats himself if he can): conscious and bleeding, out of his own kit, one thing at
  // a time (the medical sim's own application times, slower than buddy aid)
  RM.selfAid = () => {
    if (M.dead || M.unconscious || M.action || (RM.mods.med?.bleeding ?? M.bleedRate()) < 25) return null;
    const a = pickAid(M, [inv], { self: true, skill: M.skill });
    if (a && M.startTreatment({ item: a.item, region: a.region, by: { self: true, skill: M.skill } }).ok) { RM.stats.selfAid = (RM.stats.selfAid || 0) + 1; return a; }
    return null;
  };
  // ---- one AI step: intent -> the rifleman's input
  const inp = { move: [0, 0], look: [0, 0], sprint: false, walk: false, ads: false, fire: false, holdBreath: false, lean: 0, stance: null, actions: [] };
  const env2 = { g: 9.81, groundY: null, surface: () => 'grass', waterDepth: () => 0, raycast: null, listener: null, dirt: 0.1 };
  RM.step = (dt, a, env, steer, want) => {
    RM.shots.length = 0; RM.t += dt; env2.groundY = env.height;
    // medical at ~10 Hz
    RM.medAcc += dt; if (RM.medAcc >= 0.1) { RM.medStep(RM.medAcc); RM.medAcc = 0; }
    const down = RM.state() !== 'ok';
    // ---- what the AI wants
    let vx = 0, vz = 0, face = a && a.face, fire = want && want.fire, aim = want && want.aim;
    if (a && a.move && !down) [vx, vz] = steer;
    if (down) { vx = want?.crawl ? want.crawl.vx : 0; vz = want?.crawl ? want.crawl.vz : 0; }   // (crawling to cover, or a walking wounded)
    // turn: toward the aim / face, else the way he moves
    const sp = Math.hypot(vx, vz);
    let yawT = S.yaw;
    if (aim) yawT = Math.atan2(-(aim[0] - S.pos.x), -(aim[2] - S.pos.z));
    else if (face !== undefined) yawT = face;
    else if (sp > 0.3) yawT = Math.atan2(-vx, -vz);
    const dyaw = angN(yawT - S.aimYaw), maxT = TURN * dt * (1 - 0.5 * (RM.mods.armInjury || 0));
    inp.look[0] = -clamp(dyaw, -maxT, maxT);
    let pT = 0;
    if (aim) { const ey = S.eye.y - 0.05; pT = Math.atan2(aim[1] - ey, Math.hypot(aim[0] - S.pos.x, aim[2] - S.pos.z)); }
    inp.look[1] = clamp(pT - S.aimPitch, -maxT, maxT);
    // move in his own frame (forward = -z at yaw 0)
    if (sp > 0.05) {
      const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw), rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw), k = 1 / sp;
      inp.move[0] = (vx * rx + vz * rz) * k; inp.move[1] = (vx * fx + vz * fz) * k;
    } else { inp.move[0] = inp.move[1] = 0; }
    const pace = a?.pace || 'walk';
    inp.walk = pace === 'walk'; inp.sprint = pace === 'rush' && !aim && !down;
    // stance (one-shot requests: soldier.js toggles crouch / prone when asked again)
    const walkW = down && want?.crawl?.walk && RM.canWalk();
    if (walkW) { inp.walk = true; inp.sprint = false; }
    const cur = S.stanceT < 1 ? S.stanceTo : S.stance, wantSt = walkW ? 'stand' : down ? 'prone' : (pace === 'crawl' ? 'prone' : a?.stance || 'stand');
    inp.stance = wantSt !== cur && S.stanceT >= 1 ? wantSt : null;
    // weapons: on the sights when he has a target and is not moving fast; trigger at an aimed cadence
    const w = R.cur, acts = inp.actions; acts.length = 0;
    inp.ads = !!aim && !down && sp < 1.6;
    inp.fire = false;
    const selfAid = !!(M.action && M.action.by && M.action.by.self);   // (his hands are on his own wound)
    if (w && !down && !selfAid && !w.act && !R.swap) {
      const mag = w.mag ? w.mag.rounds : 0;
      if (w.malf) { acts.push(w.malf === 'extract' || w.malf === 'double' ? 'remedial' : 'ia'); RM.stats.ia++; }
      else if (w.def.feed !== 'none' && w.def.feed !== 'single' && mag <= 0 && !w.chamber) { acts.push('reload'); RM.stats.reloads++; }
      else if (fire && aim) {
        const off = Math.abs(angN(yawT - S.aimYaw)) + Math.abs(pT - S.aimPitch);
        RM.trigT -= dt;
        // on the sights: within ON_TGT; off them (moving, or running to cover) he fires from the shoulder unsighted, twice
        // as loose (the cheap model fires on the move and on the way to cover too; ngc/infdepth-fix: holding fire on every
        // rush to cover cost the near men a third of their rounds)
        const tol = ON_TGT * (1 + 2 * (want.supp || 0)), aimedOk = S.ads > 0.5 ? off < tol : off < tol * 2;
        const W8 = RM.stats.wait || (RM.stats.wait = { off: 0, ads: 0, ok: 0 }); if (aimedOk) W8.ok++; else if (off >= tol) W8.off++; else W8.ads++;
        if (aimedOk) {
          if (fire === 'auto' || fire === 'mg') { if (RM.burst <= 0 && RM.trigT <= 0) { RM.burst = want.burstS || 0.35; RM.trigT = want.pause || 1.2; } }
          else if (RM.trigT <= 0) { inp.fire = true; RM.trigT = want.gap || 1.1; }
        }
        if (RM.burst > 0) { inp.fire = true; RM.burst -= dt; }
      }
    }
    if (!down && w && w.mag && w.mag.rounds < 4 && !fire && !w.act && RM.idleT > 3 && w.def.feed === 'mag') { acts.push('reload'); RM.stats.reloads++; RM.idleT = 0; }   // a lull: top up (tactical)
    RM.idleT = fire ? 0 : (RM.idleT || 0) + dt;
    // ---- step the rifleman in sub-steps (the trigger and look on the first)
    let left = dt, first = true;
    while (left > 1e-6) {
      const h = Math.min(RICH_STEP, left); left -= h;
      if (!first) { inp.look[0] = inp.look[1] = 0; inp.stance = null; acts.length = 0; }
      for (const e of R.step(h, inp, env2, RM.mods)) if (e.e === 'shot') RM.shots.push({ x: e.x, y: e.y, z: e.z, dir: e.dir, v: e.v, weapon: e.weapon, tracer: e.tracer });
      R.projectiles.length = 0;   // (the rounds fly as groundsim projectiles: game level)
      first = false; RM.stats.steps++;
    }
    B.sync();
    RM.stats.shots += RM.shots.length;
    return RM.shots;
  };
  // ---- wounds (medical.js hit-info); the state change is read by the caller
  RM.hit = h => { const r = M.hit(h, I.armour(inv)); soldierMods(M, RM.mods); return r; };
  // rounds left for the HUD / the body's bookkeeping
  RM.roundsLeft = () => { const w = R.slots[0]; return w && w.def.fit ? B.count(w.def.fit) : 0; };
  return RM;
}
