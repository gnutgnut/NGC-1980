// THE GROUND WAR in the game: groundsim.js (the pure battles) wired into war.js. This file owns
//   * the views: STRIDER / RW-7 / MBT models (runaway/*model.js), Marines (INFANTRY's soldier model through the rotary
//     FIGURES table, marinefigure.js), the seized LCAC; distance culling, fog of war (W.setVisibility)
//   * the war's side of a fight: what the machines and the Marines can see and shoot of the outside world (the player
//     in whatever craft, AA sites, aircraft low over the island), the war's own rounds and blasts into the ground
//     units (door gun, rockets, bombs, the Hornet's cannon; WASPs and flak against Marines)
//   * landings: the MV-22's machine troopers become STRIDERs and the CH-46's figures become Marines as they come off the
//     ramp; a squad 'proxy' unit in W.units carries the war's contract (capture, gunship targets, expansion)
//   * the enemy commander's ground plans: RW-7 hover tanks over the sea, seized MBTs by LCAC to a beach
//   * sound (runaway/rwaudio.js on the game's sound bus) and effects (fx.js)
import * as THREE from 'three';
import { createGroundSim, RW_HURT } from './groundsim.js';
import { buildMarineFigure } from './marinefigure.js';
import { buildLCAC, LCAC } from './lcacmodel.js';
import { buildStrider } from '../runaway/stridermodel.js';
import { buildHoverTank } from '../runaway/hovertankmodel.js';
import { buildMBT } from '../runaway/mbtmodel.js';
import { RwAudio } from '../runaway/rwaudio.js';
import { FIGURES } from '../air/rotary/figures.js';
import { createCasevac } from './casevac.js';   // ngc/infdepth
import { careHands, throwHands } from '../infantry/carepose.js';   // ngc/infdepth-fix
import { createStriderLOD } from '../runaway/rwlod.js';   // ngc/rwground-polish
import { createGroundFx } from './gwfx.js';   // ngc/rwground-polish

const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// the rotary module's squads (the CH-46 cabin and ramp) show INFANTRY's Marine from now on (FIGURES contract)
FIGURES.marine = o => buildMarineFigure({ ...o, detail: 'full' });
export const GW_T = {
  HOVER_AT: 240, HOVER_COST: 32, HOVER_GAP: 70,     // s from the start / materiel / s between launches
  MBT_AT: 540, MBT_COST: 55, MBT_GAP: 150,
  DECK_RATE: 0.12,                                  // materiel / s of armour the KRAKEN's vehicle deck readies (game)
  STRIDERS: 8, SQUAD: 4,                            // per MV-22 load; per squad
  CAP_RW: 12, CAP_MAR: 9,                           // s to take a pad (the war's CAP_TIME for the old troops: 10 / 9)
  DRAW: { strider: 1400, hovertank: 1100, mbt: 1100, marine: 520, marineFull: 140 },
  LOD_STRIDER: 160,                                 // ngc/rwground-polish: full STRIDER model inside this, instanced stand-ins out to DRAW
  RICH_R: 120, RICH_MAX: 14,                        // ngc/infdepth: Marines this close to the camera run the real sims
};

// ngc/infdepth: a name and rank for the men (the HEALTH screen of a casualty, the feed). Navy corpsmen are HM3 / HN.
const SURN = ['RIVERA', 'KOWALSKI', 'JACKSON', 'NGUYEN', 'MURPHY', 'GARCIA', 'WASHINGTON', 'OLSEN', 'DELGADO', 'BROOKS', 'HARRIS', 'SCHULTZ', 'TAYLOR', 'MARTINEZ', 'COLLINS', 'REYES', 'MORGAN', 'BAKER', 'WILLIAMS', 'NOVAK', 'PRICE', 'HAYES', 'ORTIZ', 'FLETCHER'];
const RANK = { sl: 'SGT', tl: 'CPL', ar: 'LCPL', aar: 'PFC', gren: 'LCPL', mg: 'LCPL', doc: 'HM3' };
const nameOf = (role, id) => `${RANK[role] || 'PFC'} ${SURN[(id * 7 + 3) % SURN.length]}`;
export function createGroundWar(ctx) {
  const { W, scene, fx, sfx, terrainH, nav } = ctx;
  const ear = ctx.ear, hear = ctx.hear, feed = ctx.feed;
  const root = new THREE.Group(); root.name = 'groundwar'; scene.add(root);
  const sid = new WeakMap(); let sidN = 1; const idOf = o => { if (!sid.has(o)) sid.set(o, 'w' + sidN++); return sid.get(o); };
  const _at = new THREE.Vector3(), _dir = new THREE.Vector3();
  // ------------------------------------------------------------------------------------------- the outside world
  const pl = () => ctx.player();
  function plKind(P) { return P.kind === 'foot' ? 'inf' : P.kind === 'ground' ? 'vehicle' : 'air'; }
  function targetsFor(B, side) {
    const I = B.I, out = [];
    if (side === 2) {
      const P = pl();
      if (P.alive && !P.inCave && Math.hypot(P.pos.x - I.x, P.pos.z - I.z) < I.r + 260 && !(P.landed && terrainH(P.pos.x, P.pos.z) < 0)) {   // (not the player sitting on a ship's deck out at sea)
        const k = plKind(P), gy = Math.max(terrainH(P.pos.x, P.pos.z), 0), agl = P.pos.y - gy;
        if (k !== 'air' || agl < 110) out.push({ id: 'player', side: 1, kind: k === 'air' && agl < 4 && P.landed ? 'vehicle' : k, x: P.pos.x, y: k === 'air' ? P.pos.y - 1.5 : gy, z: P.pos.z, vx: P.vel.x, vz: P.vel.z, h: k === 'inf' ? 1.7 : 3, alive: true, firing: GW.playerFiredT, cover: k === 'inf' ? 1 - (P.detect ?? 1) : 0 });
      }
      for (const s of I.structs) if (s.kind === 'aa' && s.side === 1) out.push({ id: idOf(s), side: 1, kind: 'vehicle', x: s.x, y: s.y, z: s.z, h: 3, alive: !s.dead && !s.building, firing: 99, cover: 0, ref: s });
      for (const u of W.units) {
        if (u.side !== 1 || u.ground || u.dims || !u.p || u.dead || u.dying) continue;
        if (Math.hypot(u.p.x - I.x, u.p.z - I.z) > I.r + 220) continue;
        const agl = u.p.y - Math.max(terrainH(u.p.x, u.p.z), 0); if (agl > 120) continue;
        out.push({ id: idOf(u), side: 1, kind: agl < 5 ? 'vehicle' : 'air', x: u.p.x, y: agl < 5 ? u.p.y - agl : u.p.y - 1.5, z: u.p.z, vx: u.v.x, vz: u.v.z, h: 4, alive: true, firing: 99, cover: 0, ref: u });
      }
      for (const u of W.ext || []) {   // COMMANDER: the fleet's units out that the player is not in (a parked Huey, a tank, a jeep...)
        if (u.dead || Math.hypot(u.p.x - I.x, u.p.z - I.z) > I.r + 220) continue;
        const gy = Math.max(terrainH(u.p.x, u.p.z), 0), agl = u.p.y - gy; if (agl > 120 || (agl < 4 && terrainH(u.p.x, u.p.z) < 0)) continue;   // (not on a ship's deck out at sea)
        out.push({ id: idOf(u), side: 1, kind: agl < 5 ? 'vehicle' : 'air', x: u.p.x, y: agl < 5 ? gy : u.p.y - 1.5, z: u.p.z, vx: u.v.x, vz: u.v.z, h: 3, alive: true, firing: 99, cover: 0, ref: u });
      }
    } else {
      for (const s of I.structs) if (s.kind === 'aa' && s.side === 2) out.push({ id: idOf(s), side: 2, kind: 'aa', x: s.x, y: s.y, z: s.z, h: 3, alive: !s.dead && !s.building, firing: 99, cover: 0, ref: s });
    }
    return out;
  }
  // a RUNAWAY round's path against the outside world: the player, our AA sites, our aircraft low over the island
  function segPoint(ax, ay, az, bx, by, bz, px, py, pz) { const sx = bx - ax, sy = by - ay, sz = bz - az, L2 = sx * sx + sy * sy + sz * sz || 1e-9; const k = clamp(((px - ax) * sx + (py - ay) * sy + (pz - az) * sz) / L2, 0, 1); return [k, Math.hypot(ax + sx * k - px, ay + sy * k - py, az + sz * k - pz)]; }
  function extSeg(p, ax, ay, az, bx, by, bz) {
    let best = null;
    const H = RW_HURT[p.ammo] || RW_HURT.xm7;
    const P = pl();
    if (P.alive && !P.inCave && !GW.godPlayer) {
      const [k, d] = segPoint(ax, ay, az, bx, by, bz, P.pos.x, P.pos.y, P.pos.z), r = P.hitR || 2.6;
      if (d < r && (!best || k < best.t)) best = { t: k, apply: (x, y, z) => { _at.set(x, y, z); _dir.set(p.vx, p.vy, p.vz); ctx.hurtPlayer(P.kind === 'air' ? H.heli : H.war, p.ammo === 'coil120' ? 'COILGUN' : p.ammo.startsWith('mbt') ? 'TANK FIRE' : 'STRIDER FIRE', _at, _dir); } };
    }
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, I = GS.maps.at(mx, mz);
    if (I) for (const s of I.structs) if (s.kind === 'aa' && s.side === 1 && !s.dead) {
      const [k, d] = segPoint(ax, ay, az, bx, by, bz, s.x, s.y + 1.6, s.z);
      if (d < 2.6 && (!best || k < best.t)) best = { t: k, apply: () => W.damage(s, H.war, 2) };
    }
    for (const u of W.units) {
      if (u.side !== 1 || u.ground || u.dims || !u.p || u.dead || u.dying) continue;
      if (Math.abs(u.p.x - mx) > 90 || Math.abs(u.p.z - mz) > 90) continue;
      const [k, d] = segPoint(ax, ay, az, bx, by, bz, u.p.x, u.p.y, u.p.z);
      if (d < (u.r || 4) * 0.6 && (!best || k < best.t)) best = { t: k, apply: () => W.damage(u, H.air, 2) };
    }
    for (const u of W.ext || []) {   // COMMANDER: the fleet's units out (the same hurt as the player in that unit)
      if (u.dead || Math.abs(u.p.x - mx) > 90 || Math.abs(u.p.z - mz) > 90) continue;
      const [k, d] = segPoint(ax, ay, az, bx, by, bz, u.p.x, u.p.y, u.p.z);
      if (d < u.r && (!best || k < best.t)) best = { t: k, apply: (x, y, z) => { _at.set(x, y, z); _dir.set(p.vx, p.vy, p.vz); u.hurt(u.air ? H.heli : H.war, p.ammo === 'coil120' ? 'COILGUN' : p.ammo.startsWith('mbt') ? 'TANK FIRE' : 'STRIDER FIRE', _at, _dir); } };
    }
    return best;
  }
  function extBlast(x, y, z, r, power, side) { W.blast(x, y, z, r, 4 * power, side, true); }   // (true: the ground war already did its own)
  // ngc/infdepth: the Marines near the camera on the real rifleman + medical sims (rich), casualty care, casevac
  const GS = createGroundSim({ terrainH, islands: W.islands, hooks: { targetsFor, extSeg, extBlast, patients: B => CV.patients(B) }, rich: { r: GW_T.RICH_R, max: GW_T.RICH_MAX }, care: true });
  const CV = createCasevac({ GS, W, PL: () => ctx.player(), feed });
  const LOD = createStriderLOD(root, 160), GFX = createGroundFx({ root, fx, GS, hAt: (x, z) => GS.hAt(x, z) });   // ngc/rwground-polish
  const GW = { LOD, GFX, sim: GS, root, views: new Map(), proxies: [], landings: [], lcacs: [], hoverT: GW_T.HOVER_AT, mbtT: GW_T.MBT_AT, playerFiredT: 99, bank: 0, kills: new Map(), godPlayer: false, T: GW_T, CV };

  // ------------------------------------------------------------------------------------------- views
  function viewOf(u) {
    let V = GW.views.get(u.id); if (V) return V;
    if (u.kind === 'strider') { V = buildStrider({ weapon: u.weaponName, tag: u.tag }); root.add(V.group); }
    else if (u.kind === 'hovertank') { V = buildHoverTank({ tag: u.tag }); root.add(V.group, V.shadow); }
    else if (u.kind === 'mbt') { V = u.adoptView || buildMBT(u.mbtType, { tag: u.tag }); if (!V.group.parent || V.group.parent !== root) root.add(V.group); }
    else { V = u.adoptView || buildMarineFigure({ seed: u.seed, weapon: u.role === 'gren' ? 'M16A1/M203' : 'M16A1' }); root.add(V.group); if (u.role === 'gren') V.setWeapon('M16A1/M203'); }
    V.kind = u.kind; GW.views.set(u.id, V); return V;
  }
  function dropView(id) {
    const V = GW.views.get(id); if (!V) return;
    root.remove(V.group); if (V.shadow && V.shadow !== V.group) root.remove(V.shadow);
    GW.views.delete(id);
  }
  // ngc/infdepth-fix: a medic's, a dragger's, a carrier's or a grenadier's hands (carepose.js): rifle slung, hands on
  // the casualty / the grenade (poseSkeleton blends them in and out)
  function careLook(u, p) {
    const st = (u.ai && u.body.alive && u.body.able && u.ai.state) || '';
    p.hands = null; p.sling = 0; p.grenade = false;
    if (u.thr && u.body.alive && u.body.able) { p.hands = throwHands(u.thr.phase, u.thr.p, false); p.sling = 1; p.ads = 0; p.grenade = !u.thr.gone; }
    else if (/carrying/.test(st)) { p.hands = careHands('carry', W.time, p.gaitPhase || 0); p.sling = 1; p.ads = 0; p.stance = p.stanceFrom = p.stanceTo = 'stand'; p.stanceT = 1; }
    else if (/dragging/.test(st)) { p.hands = careHands('drag', W.time, p.gaitPhase || 0); p.sling = 1; p.ads = 0; p.stance = p.stanceFrom = p.stanceTo = 'crouch'; p.stanceT = 1; }
    else if (/treating/.test(st)) { p.hands = careHands('treat', W.time + u.id); p.sling = 1; p.ads = 0; if (p.stance === 'stand') { p.stance = p.stanceFrom = p.stanceTo = 'crouch'; p.stanceT = 1; } }
  }
  // a casualty in an AI Marine's fireman's carry (fieldcare.js: u.cas.carry = the carrier's id): across his shoulders,
  // face down, his middle on the right shoulder (as marinecare.js puts the player's)
  const _cq = new THREE.Quaternion(), _cq2 = new THREE.Quaternion(), _ce = new THREE.Euler(), _cv = new THREE.Vector3(), _carried = { x: 0, y: 0, z: 0, q: new THREE.Quaternion(), hidden: false };
  function carriedView(u) {
    const c = u.cas && u.cas.carry != null && GS.units.find(v => v.id === u.cas.carry); if (!c || !c.alive) return null;
    const M = c.body, yaw = M.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    _cq.setFromEuler(_ce.set(0, yaw + Math.PI / 2, 0, 'YXZ')); _cq2.setFromEuler(_ce.set(0, 0, Math.PI, 'XYZ')); _cq.multiply(_cq2);
    _cv.set(0, 0.13, -0.6).applyQuaternion(_cq);   // (the down pose's middle, from its root)
    _carried.x = M.x + rx * 0.12 - _cv.x - fx * 0.05; _carried.y = M.y + 1.6 - 0.16 - _cv.y; _carried.z = M.z + rz * 0.12 - _cv.z - fz * 0.05; _carried.q.copy(_cq);
    return _carried;
  }
  const _pose = { stance: 'stand', stanceFrom: 'stand', stanceTo: 'stand', stanceT: 1, speed: 0, gaitPhase: 0, aimPitch: 0, down: false, cls: 'rifle', ads: 0, gait: 'walk' }, _rp = {};
  function renderUnits(dt) {
    const cx = ear.x, cy = ear.y, cz = ear.z;
    LOD.begin();
    for (const u of GS.units) {
      const d = Math.hypot(u.x - cx, u.y - cy, u.z - cz), draw = GW_T.DRAW[u.kind];
      const fogOk = u.side === 1 || u.fogVis !== false;
      let show = d < draw && fogOk && !u.hidden;
      let V = GW.views.get(u.id);
      // ngc/rwground-polish: a STRIDER past the close range (or one only moving kinematically in a far battle) is an
      // instanced stand-in (rwlod.js): four draw calls for every far machine in the war
      if (u.kind === 'strider' && show && (u.lite || d > GW_T.LOD_STRIDER + (u.lodFull ? 15 : 0))) {
        u.lodFull = false;
        const s = u.sim, st = !u.alive ? 'dead' : u.lite || s.up ? 'up' : 'down';
        LOD.add(u.id, u.x, u.y, u.z, u.yaw, Math.hypot(u.vx, u.vz), st, dt);
        show = false;
      } else if (u.kind === 'strider') u.lodFull = show;
      if (!show) { if (V) { V.group.visible = false; if (V.shadow && V.shadow !== V.group) V.shadow.visible = false; } continue; }
      V = viewOf(u); V.group.visible = true; if (V.shadow && V.shadow !== V.group) V.shadow.visible = true;
      if (u.kind === 'strider') V.update(u.sim, dt, W.time);
      else if (u.kind === 'hovertank') V.update(u.sim, dt, W.time, GS.hAt(u.x, u.z) > 0 ? GS.hAt(u.x, u.z) : 0.05);
      else if (u.kind === 'mbt') V.update(u.sim, dt, W.time);
      else {
        const M = u.body, g = V.group;
        g.position.set(M.x, M.y, M.z); g.rotation.set(0, M.yaw, 0);
        V.setDetail(d < GW_T.DRAW.marineFull ? 'full' : 'lite');
        // ngc/infdepth: carried by the player (marine.js sets u.viewAt: a fireman's carry over the shoulders), or a
        // man on the rifleman sim (his real pose: stance transitions, lean, ADS, reload actions, limp)
        const va = u.viewAt || (u.cas && u.cas.carry != null ? carriedView(u) : null);
        if (va) { _pose.hands = null; _pose.sling = 0; _pose.grenade = false; g.visible = !va.hidden; g.position.set(va.x, va.y, va.z); g.quaternion.copy(va.q); _pose.down = true; _pose.speed = 0; _pose.stance = _pose.stanceFrom = _pose.stanceTo = 'stand'; _pose.stanceT = 1; V.poseFull(_pose, dt); continue; }
        if (u.richOn && u.rich && M.alive && (M.able || (u.crawl && u.crawl.walk))) {
          const R = u.rich.R, p = u.rich.S.pose(_rp); p.cls = R.cls === 'gl' ? 'rifle' : R.cls === 'none' ? 'rifle' : R.cls; p.action = R.cur && R.cur.act ? { name: R.cur.act.name, p: R.cur.act.t / R.cur.act.dur } : null; p.down = false;
          careLook(u, p);
          if (V.skeleton && R.carrier && V.setWeapon) V.setWeapon(u.ai && u.ai.fire === 'law' && u.laws > 0 ? 'M72A2' : R.carrier.key === 'M16A1' && R.carrier.gl ? 'M16A1/M203' : R.carrier.key);
          V.poseFull(p, dt); continue;
        }
        if (u.ai && u.ai.fire === 'law' && u.laws > 0) V.setWeapon('M72A2'); else V.setWeapon(u.role === 'gren' ? 'M16A1/M203' : 'M16A1');
        _pose.stance = M.stance; _pose.stanceFrom = M.stanceFrom; _pose.stanceTo = M.stanceTo; _pose.stanceT = M.stanceT;
        _pose.speed = M.speed; _pose.gaitPhase = M.gait; _pose.down = !M.able && !(u.crawl && u.crawl.walk); _pose.gait = M.speed > 3.5 ? 'sprint' : M.speed > 2 ? 'run' : 'walk';
        _pose.cls = u.ai && u.ai.fire === 'law' ? 'law' : 'rifle'; _pose.ads = u.ai && u.ai.fire && u.firedT < 1.5 ? 1 : 0;
        _pose.aimPitch = u.ai && u.ai.aim ? clamp(Math.atan2(u.ai.aim[1] - (M.y + 1.5), Math.hypot(u.ai.aim[0] - M.x, u.ai.aim[2] - M.z)), -0.6, 0.6) : 0;
        careLook(u, _pose);
        // the dead lie still (posed once)
        if (!M.alive && u.posedDead) continue;
        V.poseFull(_pose, dt); if (!M.alive) u.posedDead = true;
      }
      if (u.kind !== 'marine' && !u.alive && !u.dimmed) { u.dimmed = true; }
    }
    LOD.end();
  }
  // ngc/infdepth: what the casualty care says, near the player: shouts, the corpsman, men back on their feet
  const careT = new Map();
  function careNews(evs) {
    for (const e of evs) {
      if (e.x === undefined) continue;
      const d = Math.hypot(e.x - ear.x, e.z - ear.z), key = e.e + (e.id ?? '');
      const say = (txt, r, gap = 6, kind = 'bad') => { if (d > r || (careT.get(key) ?? -99) > W.time - gap) return; careT.set(key, W.time); if (GW.sayHook) GW.sayHook(txt, kind); else feed(txt, kind); };
      const u = e.id !== undefined ? GS.units.find(q => q.id === e.id) : null, who = u?.name || 'MARINE';
      if (e.e === 'callout') { if (CV.player && CV.player.active()) say(`${who}: "${e.text}"`, 70, 7); }   // (heard on foot, not over a rotor)
      else if (e.e === 'medic' && !e.ext) say(`CORPSMAN MOVING TO ${GS.units.find(q => q.id === e.to)?.name || 'A CASUALTY'}`, 90, 10, 'good');
      else if (e.e === 'medic' && e.ext) say('"HANG ON, I GOT YOU"  -  THE CORPSMAN IS COMING TO YOU', 1e9, 10, 'good');
      else if (e.e === 'treat') say(e.ext ? `CORPSMAN: ${e.label} (${e.time} S)  -  STAY STILL` : `${who === 'MARINE' ? 'CORPSMAN' : GS.units.find(q => q.id === e.medic)?.name || 'CORPSMAN'}: ${e.label}`, e.ext ? 1e9 : 40, 2, 'good');
      else if (e.e === 'rtd') say(`${who} IS BACK ON HIS FEET`, 120, 10, 'good');
      else if (e.e === 'drag') say(`${GS.units.find(q => q.id === e.id)?.name || 'A MARINE'} DRAGGING ${GS.units.find(q => q.id === e.to)?.name || 'A CASUALTY'} TO THE CCP`, 80, 10, 'good');
    }
  }
  GW.setVisibility = fog => { for (const u of GS.units) if (u.side === 2) u.fogVis = fog.visibleAt(u.x, u.z); for (const L of GW.lcacs) L.view.group.visible = fog.visibleAt(L.x, L.z); };

  // ------------------------------------------------------------------------------------------- effects + sound
  let rwa = null, sndT = 0, silenceTimer = null;
  const sndUnits = [];
  function sound(dt, evs) {
    if (!sfx || !sfx.ctx || !sfx.master) return;
    if (!rwa) { try { rwa = new RwAudio(sfx.ctx, sfx.master); rwa.out.gain.value = 0.7; } catch (e) { rwa = null; return; } }
    rwa.listener(ear.x, ear.y, ear.z);
    for (const e of evs) if (e.x !== undefined && (e.e !== 'step' || Math.hypot(e.x - ear.x, e.z - ear.z) < 45)) rwa.event(e);
    if ((sndT -= dt) <= 0) {
      sndT = 0.1; let n = 0;
      for (const u of GS.units) {
        if (!u.alive || u.kind === 'marine' || Math.hypot(u.x - ear.x, u.z - ear.z) > 320) continue;
        const o = sndUnits[n] || (sndUnits[n] = {}); n++;
        o.kind = u.kind; o.x = u.x; o.y = u.y; o.z = u.z; o.type = u.mbtType;
        o.servo = u.kind === 'strider' ? (u.lite ? 0.3 : u.sim.servo) : 0; o.fan = u.kind === 'hovertank' ? (u.sim.fan[0] + u.sim.fan[1] + u.sim.fan[2] + u.sim.fan[3]) / 4 : 0;
        o.speed = u.kind === 'mbt' ? u.sim.speed : Math.hypot(u.vx, u.vz); o.engine = u.kind === 'mbt' ? (u.sim.drive.engine ?? 0.5) : 0; o.charge = u.kind === 'hovertank' ? u.sim.charge : 1;
      }
      sndUnits.length = n; rwa.loops(sndUnits);
    }
    // the war stops calling us (pause menu, title): the loops go quiet
    clearTimeout(silenceTimer); silenceTimer = setTimeout(() => { if (rwa) rwa.loops([]); }, 300);
  }
  GW.silence = () => { if (rwa) rwa.loops([]); };
  // ngc/rwground-polish: what our Marines (or the player, close by) see the machines do, on the feed - throttled per island
  function squadNews(B, S, st) {
    const I = B.I, ours = GS.units.some(u => u.alive && u.side === 1 && u.able && u.B === B);
    if (!ours && Math.hypot(ear.x - S.cx, ear.z - S.cz) > 450) return;   // (nobody of ours there to see it)
    if (st === 'retreat') note(I, 'THE MACHINES ARE FALLING BACK', 'good');
    else if (st === 'LINK LOST') note(I, 'STRIDER LINK NODE DOWN  -  THE SQUAD FREEZES', 'good');
    else if (st === 'flank') note(I, 'MACHINES WORKING ROUND OUR FLANK');
    else if (st === 'assault') note(I, 'THE MACHINES ARE ASSAULTING');
  }
  // ngc/rwground-polish: main.js drawMap hook - ground units, wrecks, landing craft and fights on the map
  GW.drawMap = (c2d, px, py, big, fog) => GFX.drawMap(c2d, px, py, big, fog, W.time, GW.lcacs, W.islands);
  const near = (x, z, r) => Math.hypot(x - ear.x, z - ear.z) < r;
  function effects(evs) {
    for (const e of evs) {
      switch (e.e) {
        case 'shot': {
          if (!near(e.x, e.z, 700) || e.ammo === 'm67') break;   // (a hand grenade: no flash)
          const big = e.ammo === 'coil120' || e.ammo === 'mbt120' || e.ammo === 'mbt125', cyan = e.side === 2 && (e.ammo === 'needle' || e.ammo === 'coil120');
          fx.add.spawn(e.x + e.dx * 0.5, e.y + e.dy * 0.5, e.z + e.dz * 0.5, 0, 0, 0, 0.05, big ? 4 : 0.7, big ? 2 : 0.3, cyan ? 0.6 : 1, cyan ? 0.95 : 0.8, cyan ? 1 : 0.45, 1);
          if (e.ammo === 'coil120') for (let i = 0; i < 26; i++) { const k = i * 4; fx.add.spawn(e.x + e.dx * k, e.y + e.dy * k, e.z + e.dz * k, 0, 0.3, 0, 0.25, 0.8, 0.2, 0.75, 0.97, 1, 1); }
          if (big || e.ammo === 'law') for (let i = 0; i < 8; i++) fx.mix.spawn(e.x, e.y, e.z, rnd(-2, 2) + e.dx * 4, rnd(0, 1.5), rnd(-2, 2) + e.dz * 4, rnd(1.5, 3), 0.8, 3.5, .7, .68, .62, 0.45, -0.2, 1.2, 0.4);
          break;
        }
        case 'backblast': if (near(e.x, e.z, 500)) for (let i = 0; i < 10; i++) fx.mix.spawn(e.x, e.y, e.z, Math.sin(e.yaw) * rnd(4, 9) + rnd(-1, 1), rnd(0, 1.5), Math.cos(e.yaw) * rnd(4, 9) + rnd(-1, 1), rnd(1, 2.4), 0.6, 3, .74, .72, .66, 0.5, -0.1, 1.1, 0.4); break;
        case 'impact': if (near(e.x, e.z, 400)) fx.impact(e.x, e.y, e.z, e.unit ? 'metal' : 'ground'); break;
        case 'hit': if (near(e.x, e.z, 450)) { if (e.kind === 'marine') fx.mix.spawn(e.x, e.y, e.z, 0, 0.5, 0, 0.5, 0.25, 0.7, .35, .1, .08, 0.6, 0, 1, 0.2); else fx.impact(e.x, e.y, e.z, 'metal'); } break;
        case 'blast': fx.explode(e.x, e.y + 0.3, e.z, 0.8 + e.big * 0.8, { debris: Math.round(2 + e.big * 4), crater: 1.2 + e.big }); ctx.boomAt(e.x, e.y, e.z, 0.3 + e.big * 0.4); break;
        case 'pd': if (near(e.x, e.z, 600)) { const [fx0, fy0, fz0] = e.from; for (let i = 0; i <= 10; i++) { const k = i / 10; fx.add.spawn(fx0 + (e.x - fx0) * k, fy0 + (e.y - fy0) * k, fz0 + (e.z - fz0) * k, 0, 0, 0, 0.06, 0.4, 0.2, 0.85, 0.98, 1, 1); } if (e.ok) fx.flash(e.x, e.y, e.z, 0.5); } break;
        case 'thud': if (near(e.x, e.z, 300)) for (let i = 0; i < 6; i++) fx.mix.spawn(e.x + rnd(-1, 1), e.y - 0.6, e.z + rnd(-1, 1), rnd(-2, 2), rnd(0, 1), rnd(-2, 2), rnd(0.8, 1.6), 0.8, 2.5, .55, .5, .42, 0.4, 0.5, 1.5, 0.3); break;
        case 'destroyed': destroyedFx(e); break;
        case 'mainGun': { const V = GW.views.get(e.id); if (V && V.recoil && V.group.visible) V.recoil(); if (e.kind === 'mbt' && near(e.x, e.z, 600)) { const gy = GS.hAt(e.x, e.z); for (let i = 0; i < 14; i++) { const a = rnd(6.283), sp = rnd(5, 11); fx.mix.spawn(e.x - e.dx * 4 + Math.cos(a) * 2, Math.max(gy, 0) + 0.4, e.z - e.dz * 4 + Math.sin(a) * 2, Math.cos(a) * sp + e.dx * 4, rnd(0.3, 1.2), Math.sin(a) * sp + e.dz * 4, rnd(1.5, 3), 1.2, 5, .62, .56, .46, 0.4, 0.3, 1.3, 0.5); } } break; }   // (ngc/rwground-polish: recoil, and the muzzle blast raises a ring of dust)
        case 'remove': dropView(e.id); break;
        case 'arrived': if (e.I) { const u = GS.units.find(q => q.id === e.id); if (u) attachProxy(u, e.I); if (e.kind === 'hovertank') note(e.I, 'RW-7 HOVER TANK COMING ASHORE'); } break;
      }
    }
  }
  function destroyedFx(e) {
    const vehicle = e.kind === 'hovertank' || e.kind === 'mbt';
    if (e.kind === 'marine') return;
    fx.explode(e.x, e.y, e.z, vehicle ? 2.6 : 0.9, { debris: vehicle ? 14 : 4, fire: vehicle ? 90 : 0, color: e.side === 2 ? 0xc8c6be : 0x46553b });
    ctx.boomAt(e.x, e.y, e.z, vehicle ? 1.0 : 0.4);
    if (vehicle) fx.burn(e.x, e.y, e.z, 80, 1.6);
    // ngc/rwground-polish: a catastrophic MBT kill (mbtmodel.js throws the turret) - the ammunition cooks off: a second,
    // bigger fireball out of the turret ring and a pillar of fire; a STRIDER's death is its power-down whine
    if (e.kind === 'mbt' && ((e.id * 7 + 3) % 5) < 2 && near(e.x, e.z, 1500)) { fx.explode(e.x, e.y + 1.2, e.z, 3.4, { debris: 18, fire: 140 }); for (let i = 0; i < 26; i++) fx.add.spawn(e.x + rnd(-0.6, 0.6), e.y + 1, e.z + rnd(-0.6, 0.6), rnd(-1.2, 1.2), rnd(10, 22), rnd(-1.2, 1.2), rnd(0.5, 1.1), 2.2, 4, 1, rnd(0.45, 0.7), 0.15, 0.9, 6, 0.8); ctx.boomAt(e.x, e.y, e.z, 1.4); }
    if (rwa) rwa.event({ e: 'destroyed', kind: e.kind, x: e.x, y: e.y, z: e.z });
    if (e.side === 2) {
      ctx.addScore(e.kind === 'strider' ? 150 : e.kind === 'hovertank' ? 600 : 800);
      if (vehicle) feed(`${e.I ? e.I.name + ': ' : ''}${e.kind === 'hovertank' ? 'RW-7 HOVER TANK' : (e.mbtType === 't90m' ? 'SEIZED T-90M' : 'SEIZED M1A2')} DESTROYED`, 'good');
      else tally(e.I, 'striders');
    }
  }
  // kill and casualty tallies, fed in batches (a firefight would flood the feed otherwise)
  function tally(I, what) { if (!I) return; const k = GW.kills.get(I) || { striders: 0, kia: 0, wia: 0, t: 0 }; k[what]++; GW.kills.set(I, k); }
  function flushTallies(dt) {
    for (const [I, k] of GW.kills) {
      k.t += dt; if (k.t < 6) continue;
      if (k.striders) feed(`${I.name}: ${k.striders} STRIDER${k.striders > 1 ? 'S' : ''} DOWN`, 'good');
      if (k.kia || k.wia) feed(`${I.name}: MARINES TAKING CASUALTIES  -  ${k.kia} KILLED, ${k.wia} WOUNDED`, 'bad');
      GW.kills.delete(I);
    }
  }
  const noteT = new Map();
  function note(I, text, kind = 'bad') { const k = I.name + text; if ((noteT.get(k) ?? -99) > W.time - 30) return; noteT.set(k, W.time); feed(`${I.name}: ${text}`, kind); }

  // ------------------------------------------------------------------------------------------- squads in the war
  // a 'proxy' unit in W.units stands for a landed group: war.js's capture (landed + target + capTime), the gunships'
  // targets (type 'squad') and the commander's expansion check (a landing party on an island) all read it
  function makeProxy(side, I) {
    const P = { type: 'squad', side, p: new THREE.Vector3(I.pad.x, I.pad.h + 1, I.pad.z), v: new THREE.Vector3(), yaw: 0, hp: 1, hpMax: 1, r: 7, cd: 0,
      target: I, landed: false, capTime: side === 2 ? GW_T.CAP_RW : GW_T.CAP_MAR, mesh: new THREE.Object3D(), ext: true, noHit: true, ground: true,
      members: [], squads: [], wiped: false, captured: false, home: I };
    // war.js marks a lander dead when its island flips (the old troops stood down as the garrison): ours stay and hold
    Object.defineProperty(P, 'dead', { get: () => P.wiped, set: v => { if (v && !P.wiped) P.captured = true; }, configurable: true });
    W.units.push(P); GW.proxies.push(P);
    return P;
  }
  function contested(I, side) { for (const u of GS.units) if (u.alive && u.side !== side && (u.kind !== 'marine' || u.able) && Math.hypot(u.x - I.pad.x, u.z - I.pad.z) < 70) return true; return false; }
  GW.contested = I => { const s1 = GS.units.some(u => u.alive && u.side === 1 && u.able && u.B?.I === I), s2 = GS.units.some(u => u.alive && u.side === 2 && u.B?.I === I); return s1 && s2; };
  GW.presence = (I, side) => GS.units.filter(u => u.alive && u.side === side && (u.kind !== 'marine' || u.able) && u.B?.I === I).length;
  function updateProxies() {
    for (let i = GW.proxies.length - 1; i >= 0; i--) {
      const P = GW.proxies[i], I = P.home;
      const up = P.members.filter(u => u.alive && (u.kind !== 'marine' || u.able));
      if (P.formed && !up.length) { P.wiped = true; GW.proxies.splice(i, 1); if (P.side === 1) note(I, 'MARINE SQUAD WIPED OUT'); else { feed(`${I.name}: ENEMY LANDING PARTY DESTROYED`, 'good'); ctx.addScore(300); } continue; }
      if (up.length) { let x = 0, z = 0, y = 0; for (const u of up) { x += u.x; y += u.y; z += u.z; } P.p.set(x / up.length, y / up.length + 1, z / up.length); }
      P.hp = P.hpMax = Math.max(1, up.length);
      // capture: two men (machines) able on the pad, nobody of the other side near it, the island not ours yet
      const onPad = up.filter(u => Math.hypot(u.x - I.pad.x, u.z - I.pad.z) < I.pad.r + (u.vehicle ? (P.landed ? 75 : 55) : (P.landed ? 18 : 12))).length;   // (armour holds the pad from the apron's edge: the guns cover it)
      P.target = I;
      P.landed = P.formed && I.owner !== P.side && onPad >= Math.min(2, up.length) && !contested(I, P.side) && !(I.kind === 'hq' && P.side === 2) && !(I.cave && P.side === 1);
      // the island changed hands: hold it (ours now) or take it back (lost)
      const own = I.owner === P.side;
      if (own !== P.holding) {
        P.holding = own;
        for (const S of P.squads) GS.order(S, own ? { type: 'defend', x: I.pad.x, z: I.pad.z, r: S.marines ? 20 : 30 } : { type: 'take', x: I.pad.x, z: I.pad.z, r: 30 });
      }
    }
  }

  // ------------------------------------------------------------------------------------------- landings (rotary hook)
  // u: the transport (war unit), U: its rotary unit (U.squad = the figures filing out), I: the island. Returns the proxy.
  GW.landing = (u, U, side, I) => {
    const P = makeProxy(side, I), B = GS.battle(I);
    GW.landings.push({ u, U, Q: U.squad, side, I, B, P, units: [], n: 0 });
    if (side === 2) note(I, 'ENEMY LANDING  -  STRIDERS ON THE GROUND');
    if (side === 1 && u.kind === 'ch46' && U.AI) CV.landing(u, U, I);   // ngc/infdepth: the Sea Knight takes the island's wounded home
    return P;
  };
  function updateLandings(dt) {
    for (let i = GW.landings.length - 1; i >= 0; i--) {
      const L = GW.landings[i], Q = L.Q;
      Q.update(dt, W.time);
      let pending = 0;
      // the Osprey's cabin holds twelve troopers' worth (its payload, 1.8 t): eight STRIDERs - the rest of the seats stay empty
      if (L.side === 2 && !L.trimmed) { L.trimmed = true; Q.figs.slice(GW_T.STRIDERS).forEach(F => { F.st = 'gone'; F.gw = true; F.f.group.visible = false; F.f = { group: new THREE.Object3D(), pose() {} }; }); }
      for (const F of Q.figs) {
        if (F.st === 'aboard' || F.st === 'queue' || F.st === 'path') { pending++; continue; }
        if (F.st !== 'run' || F.gw) continue;
        // off the ramp: the figure becomes a fighting unit where it stands
        F.gw = true; F.st = 'gone';   // (squad.js leaves an unknown state alone; the figure is swapped for a stub below)
        const k = L.n++, fig = F.f;
        F.f = { group: new THREE.Object3D(), pose() {} };
        let unit;
        if (L.side === 2) { fig.group.parent?.remove(fig.group); unit = GS.addStrider(L.B, F.x, F.z, F.yaw, { weapon: k % GW_T.SQUAD === 0 ? 'coil' : 'xm7', tag: `R${L.I.id}-${String(GS.nextId).padStart(3, '0')}` }); }
        else {
          // ngc/infdepth: the last man off a Sea Knight is the squad's Navy corpsman
          const role = k >= 5 && k === Q.figs.length - 1 ? 'doc' : ['sl', 'tl', 'ar', 'aar', 'gren'][k === 0 ? 0 : 1 + ((k - 1) % 4)];
          unit = GS.addMarine(L.B, role, F.x, F.z, F.yaw, { seed: k, name: nameOf(role, GS.nextId) });
          if (fig.poseFull) { unit.adoptView = fig; fig.group.parent?.remove(fig.group); }   // the same man, now in the fight
          else fig.group.parent?.remove(fig.group);
        }
        L.units.push(unit); L.P.members.push(unit);
        // in a squad (with orders) from the first man off: nobody stands about in the open waiting for the rest
        const I = L.I, order = I.owner === L.side ? { type: 'defend', x: I.pad.x, z: I.pad.z, r: 25 } : { type: 'take', x: I.pad.x, z: I.pad.z, r: 30 };
        if (L.side === 2) { if (k % GW_T.SQUAD === 0) { L.curS = GS.squadRW(L.B, [unit], order); L.P.squads.push(L.curS); } else { L.B.rw.addMember(L.curS.id, unit); unit.squad = L.curS; } }
        else if (!L.curS) { L.curS = GS.squadMarines(L.B, [unit], order); L.P.squads.push(L.curS); } else { L.B.mar.addMember(L.curS.id, unit); unit.squad = L.curS; }
        L.P.formed = true; L.P.holding = I.owner === L.side;
      }
      const lost = L.u.dying || L.u.dead && !L.u.stowed;
      if (lost && pending) { Q.killAll(); pending = 0; }
      if (!pending && !L.formed) {
        L.formed = true;
        if (!L.units.length) { L.P.wiped = true; GW.proxies.splice(GW.proxies.indexOf(L.P), 1); }
        Q.dispose(); GW.landings.splice(i, 1);
      }
    }
  }
  // a hot island: the transport puts down away from the fighting (the far side from the enemy's centre, flat, clear),
  // and the troops walk in. foot / chooseLZ are the rotary module's (rotor discs and fuselage clear of buildings).
  GW.hotLZ = (I, side, foot, chooseLZ) => {
    const foes = GS.units.filter(u => u.alive && u.side !== side && (u.kind !== 'marine' || u.able) && Math.hypot(u.x - I.x, u.z - I.z) < I.r + 60);
    if (!foes.length) return null;
    const ex = foes.reduce((s, u) => s + u.x, 0) / foes.length, ez = foes.reduce((s, u) => s + u.z, 0) / foes.length;
    let best = null, bs = -1e9;
    for (let k = 0; k < 16; k++) for (const f of [0.3, 0.45, 0.6]) {
      const a = k / 16 * Math.PI * 2, x = I.x + Math.cos(a) * I.r * f, z = I.z + Math.sin(a) * I.r * f, h = terrainH(x, z);
      if (h < 1.5) continue;
      let rough = 0; for (let j = 0; j < 6; j++) rough = Math.max(rough, Math.abs(terrainH(x + Math.cos(j) * 8, z + Math.sin(j) * 8) - h));
      if (rough > 2.5) continue;
      const d = Math.min(...foes.map(u => Math.hypot(u.x - x, u.z - z)));
      const s = Math.min(d, 160) - rough * 8 - Math.hypot(x - ex, z - ez) * 0 - Math.hypot(x - I.pad.x, z - I.pad.z) * 0.15;
      if (s > bs) { bs = s; best = { x, z, h }; }
    }
    if (!best) return null;
    const lz = chooseLZ({ pad: { x: best.x, z: best.z, h: best.h }, structs: I.structs }, foot, [0, 5, 9, 13]);
    return lz;
  };
  // armour arriving on its own (a hover tank off the sea, an MBT off the landing craft) joins the island's landing party
  // for the war's purposes (capture, expansion), or becomes one
  function attachProxy(u, I) {
    let P = GW.proxies.find(p => p.home === I && p.side === u.side && !p.wiped);
    if (!P) { P = makeProxy(u.side, I); P.formed = true; P.holding = I.owner === u.side; }
    if (!P.members.includes(u)) P.members.push(u);
    if (u.squad && !P.squads.includes(u.squad)) P.squads.push(u.squad);
  }
  GW.attachProxy = attachProxy;
  // tests / debug: put a squad straight on an island
  GW.addSquad = (side, I, n, x, z, o = {}) => {
    const B = GS.battle(I), P = makeProxy(side, I), units = [];
    for (let k = 0; k < n; k++) {
      const a = k * 2.4, r = 2 + k * 0.9, ux = x + Math.cos(a) * r, uz = z + Math.sin(a) * r;
      const role = k >= 5 && k === n - 1 ? 'doc' : ['sl', 'tl', 'ar', 'aar', 'gren'][k === 0 ? 0 : 1 + ((k - 1) % 4)];   // (ngc/infdepth: a corpsman with six or more)
      units.push(side === 2 ? GS.addStrider(B, ux, uz, o.yaw ?? 0, { weapon: k % GW_T.SQUAD === 0 ? 'coil' : 'xm7', tag: `R${I.id}-${GS.nextId}` }) : GS.addMarine(B, role, ux, uz, o.yaw ?? 0, { seed: k, name: nameOf(role, GS.nextId) }));
    }
    const order = o.order || (I.owner === side ? { type: 'defend', x: I.pad.x, z: I.pad.z, r: 25 } : { type: 'take', x: I.pad.x, z: I.pad.z, r: 30 });
    if (side === 2) for (let k = 0; k < units.length; k += GW_T.SQUAD) P.squads.push(GS.squadRW(B, units.slice(k, k + GW_T.SQUAD), order));
    else P.squads.push(GS.squadMarines(B, units, order));
    P.members.push(...units); P.formed = true; P.holding = I.owner === side;
    return P;
  };

  // ------------------------------------------------------------------------------------------- the commander's ground plans
  function launchPoint() { const c = W.enemyCarrier; if (c && c.sinking === undefined && !(c.sky && c.sky.up)) return [c.p.x + Math.cos(c.yaw) * 30, c.p.z - Math.sin(c.yaw) * 30]; const I = W.islands.find(I => I.name === 'IRONHOLD'); return nav.nearestWater(I.x - 160, I.z + 160); }
  // a beach on island I facing (fx, fz): { land: [x, z] just above the waterline, sea: [x, z] off it, a }
  function beachOf(I, fx, fz) {
    // a real beach: the sea shelving gently up to the waterline and low ground behind it (cliffs and banks are no
    // good for a landing craft or a hovercraft), on the side facing the way in if there is one, clear of buildings
    const a0 = Math.atan2(fz - I.z, fx - I.x), P = (a, r) => [I.x + Math.cos(a) * r, I.z + Math.sin(a) * r], H = (a, r) => terrainH(...P(a, r));
    let best = null;
    for (let k = 0; k < 32; k++) {
      const a = k / 32 * Math.PI * 2; let shore = null;
      for (let r = I.r + 40; r > 10; r -= 2) if (H(a, r) > 0.3) { shore = r; break; }
      if (!shore) continue;
      const sea1 = H(a, shore + 8), sea2 = H(a, shore + 16), land1 = H(a, shore - 10), land2 = H(a, shore - 20);
      const steep = Math.max(0, -4.5 - sea1) + Math.max(0, land1 - 6);   // (most of the islands rise steeply out of deep water: take the least bad)
      const da = Math.abs(Math.atan2(Math.sin(a - a0), Math.cos(a - a0))), [lx, lz] = P(a, shore - 12);
      const sc = (land2 - sea2) / 36 * 12 + steep * 0.8 + da * 1.6 + Math.max(0, land2 - 8) * 0.3 + (I.structs.some(s => Math.hypot(s.x - lx, s.z - lz) < 18) ? 20 : 0);
      if (!best || sc < best.sc) best = { sc, a, land: [lx, lz], edge: P(a, shore + 4), sea: P(a, shore + 50) };
    }
    return best;
  }
  GW.beachOf = beachOf;
  function seaRoute(x0, z0, I) {
    const b = beachOf(I, x0, z0); if (!b) return null;
    const r = nav.path(x0, z0, b.sea[0], b.sea[1]).map(p => [p[0], p[1]]);
    r.push(b.sea, b.edge, b.land);
    return { route: r, beach: b };
  }
  // where the machines need help most: a fight on an island (reinforce), then a landing party that hasn't taken its
  // pad yet, then (armour only) an island of ours nearest the task force's (a garrison)
  function pickGroundTarget(armour) {
    let best = null, bs = -1e9;
    for (const I of W.islands) {
      if (I.cave && I.owner !== 2) continue;
      const rw = GW.presence(I, 2), mar = GW.presence(I, 1);
      let s = -1e9;
      if (rw && mar) s = 100 + mar * 3 - rw;
      else if (mar && I.owner === 2) s = 80 + mar * 3;
      else if (rw && I.owner !== 2) s = 40 - rw;
      else if (armour && I.owner === 1 && !I.cave && mar && W.aliveAA(I) === 0) s = 30 - mar;   // (an island of theirs held only by Marines: armour goes in)
      else if (armour && I.owner === 2 && !I.cave) { let dmin = 1e9; for (const J of W.islands) if (J.owner === 1) dmin = Math.min(dmin, Math.hypot(J.x - I.x, J.z - I.z)); s = 10 - dmin / 100 - (GS.units.some(u => u.alive && u.vehicle && u.B?.I === I) ? 30 : 0); }
      if (s > bs) { bs = s; best = I; }
    }
    return bs > -1e8 ? best : null;
  }
  GW.launchHover = I => {
    const [x0, z0] = launchPoint(), R = seaRoute(x0, z0, I); if (!R) return null;
    const u = GS.addHover(null, x0, z0, Math.atan2(-(R.route[0][0] - x0), -(R.route[0][1] - z0)), { tag: `RW7-${GS.nextId}` });
    GS.transit(u, R.route, GS.battle(I), I.owner === 2 ? { type: 'defend', x: I.pad.x, z: I.pad.z, r: 30 } : { type: 'take', x: I.pad.x, z: I.pad.z, r: 30 });
    u.goal = I; return u;
  };
  GW.launchMBT = (I, type) => {
    const [x0, z0] = launchPoint(), R = seaRoute(x0, z0, I); if (!R) return null;
    const view = buildLCAC({ tag: 'ᚱ⟟⋔ 04' }); root.add(view.group);
    const cargo = buildMBT(type, { tag: type === 'm1a2' ? `RW-A1 ${GS.nextId}` : `RW-T9 ${GS.nextId}` }); cargo.group.position.set(0, LCAC.DECK + 0.05, 1.5); view.group.add(cargo.group);
    const L = { x: x0, z: z0, yaw: Math.atan2(-(R.route[0][0] - x0), -(R.route[0][1] - z0)), v: 0, route: R.route.slice(0, -2), beach: R.beach, I, type, view, cargo, phase: 'run', t: 0, ramp: 0, lift: 1, prop: 1, i: 0 };
    GW.lcacs.push(L); return L;
  };
  function updateLCACs(dt) {
    for (let i = GW.lcacs.length - 1; i >= 0; i--) {
      const L = GW.lcacs[i]; L.t += dt;
      let tx, tz, want = 0;
      if (L.phase === 'run' || L.phase === 'home') {
        const rt = L.route; while (L.i < rt.length - 1 && Math.hypot(rt[L.i][0] - L.x, rt[L.i][1] - L.z) < 30) L.i++;
        [tx, tz] = rt[L.i]; const d = Math.hypot(tx - L.x, tz - L.z), last = L.i === rt.length - 1;
        want = last ? Math.min(20, 3 + d * 0.25) : 20;   // ~40 kt (C)
        if (L.phase === 'run' && last && d < 10) { L.phase = 'beach'; L.t = 0; }
        if (L.phase === 'home' && last && d < 30) { root.remove(L.view.group); GW.lcacs.splice(i, 1); continue; }
      } else if (L.phase === 'beach') {   // run up the beach until the bow is on dry land
        [tx, tz] = L.beach.land; want = 6;
        const bx = L.x - Math.sin(L.yaw) * 12, bz = L.z - Math.cos(L.yaw) * 12;
        if ((terrainH(L.x, L.z) > -0.3 && terrainH(bx, bz) > 1.0) || terrainH(bx, bz) > 4 || L.t > 40) { L.phase = 'ramp'; L.t = 0; }   // (the hull up on the sand, or the bow against a bank)
      } else if (L.phase === 'ramp') {
        want = 0; L.ramp = Math.min(1, L.ramp + dt / 4);
        if (L.ramp >= 1 && !L.mbt) {
          // the MBT drives off: the model leaves the deck and becomes the unit
          const fx = -Math.sin(L.yaw), fz = -Math.cos(L.yaw); let sd = 13; while (sd < 34 && terrainH(L.x + fx * sd, L.z + fz * sd) < 0.6) sd++;   // (off the ramp onto dry ground)
          const x = L.x + fx * (sd + 4), z = L.z + fz * (sd + 4);
          L.view.group.remove(L.cargo.group);
          const u = GS.addMBT(L.type, null, x, z, L.yaw, { tag: '' }); u.adoptView = L.cargo; u.goal = L.I;
          GS.join(GS.battle(L.I), u, L.I.owner === 2 ? { type: 'defend', x: L.I.pad.x, z: L.I.pad.z, r: 30 } : { type: 'take', x: L.I.pad.x, z: L.I.pad.z, r: 30 });
          L.mbt = u; attachProxy(u, L.I); note(L.I, `SEIZED ${L.type === 'm1a2' ? 'M1A2' : 'T-90M'} COMING ASHORE`);
        }
        if (L.mbt && (L.t > 14 || Math.hypot(L.mbt.x - L.x, L.mbt.z - L.z) > 30)) { L.phase = 'back'; L.t = 0; }
      } else if (L.phase === 'back') {
        L.ramp = Math.max(0, L.ramp - dt / 4); want = -5;
        if (L.t > 7) { const [hx, hz] = launchPoint(); L.route = nav.path(L.x, L.z, hx, hz).map(p => [p[0], p[1]]); L.i = 0; L.phase = 'home'; }
      }
      // a hovercraft: heading turns toward the target, speed follows; it slides a little (no grip)
      if (tx !== undefined && want > 0) { let da = Math.atan2(-(tx - L.x), -(tz - L.z)) - L.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); L.yaw += clamp(da, -0.35 * dt, 0.35 * dt); }
      L.v += clamp(want - L.v, -3 * dt, 1.5 * dt);
      L.x += -Math.sin(L.yaw) * L.v * dt; L.z += -Math.cos(L.yaw) * L.v * dt;
      const hfx = -Math.sin(L.yaw), hfz = -Math.cos(L.yaw), hb = Math.max(terrainH(L.x + hfx * 11, L.z + hfz * 11), 0), hs = Math.max(terrainH(L.x - hfx * 11, L.z - hfz * 11), 0);
      const gy = Math.max(Math.max(terrainH(L.x, L.z), 0), (hb + hs) / 2), g = L.view.group, pitch = Math.atan2(hb - hs, 22);   // (the skirt rides the beach: the hull pitches up it)
      g.position.set(L.x, gy + 0.05 + Math.sin(W.time * 1.7 + i) * 0.04, L.z); g.rotation.set(pitch + Math.sin(W.time * 1.1) * 0.01 - (L.v - 5) * 0.002, L.yaw, Math.sin(W.time * 0.9) * 0.012, 'YXZ');
      L.view.animate({ ramp: L.ramp, prop: L.v > 0.5 ? 1 : L.v < -0.5 ? -1 : 0.2, lift: 1 }, dt);
      if (near(L.x, L.z, 500) && Math.random() < 0.6) { const wet = terrainH(L.x, L.z) < 0, a = rnd(6.283); if (wet) fx.mix.spawn(L.x + Math.cos(a) * 9, 0.4, L.z + Math.sin(a) * 9, Math.cos(a) * rnd(6, 12), rnd(0.5, 2), Math.sin(a) * rnd(6, 12), rnd(1, 2), 1, 4, .86, .92, .97, 0.4, 1.5, 1.2, 0.3); else fx.mix.spawn(L.x + Math.cos(a) * 9, gy + 0.4, L.z + Math.sin(a) * 9, Math.cos(a) * rnd(6, 12), rnd(0.5, 2), Math.sin(a) * rnd(6, 12), rnd(1, 2), 1, 4, .58, .52, .42, 0.4, 1.5, 1.2, 0.3); }
      L.view.group.visible = L.fogVis !== false;
    }
  }
  GW.think = P => {
    const E = W.E, t = W.time;
    const hovers = GS.units.filter(u => u.kind === 'hovertank' && u.alive).length, mbts = GS.units.filter(u => u.kind === 'mbt' && u.alive).length + GW.lcacs.filter(L => !L.mbt).length;
    GW.hoverT -= 2; GW.mbtT -= 2;
    // the ground arm saves up: when armour is due it takes a share of the materiel as it comes in (the air arm would
    // otherwise spend every point on WASPs), and pays for the launch out of that
    const wantH = t >= GW_T.HOVER_AT && hovers < Math.min(4, 1 + Math.floor(t / 420)), wantM = t >= GW_T.MBT_AT && mbts < Math.min(3, Math.floor(t / 540));
    // (the KRAKEN's own vehicle deck: a steady armour budget, plus any surplus the commander has lying about - the air
    // arm and the expansion keep first call on the materiel)
    if ((wantH || wantM) && GW.bank < GW_T.MBT_COST) { const take = Math.max(0, Math.min(E.mat - 60, 4)); E.mat -= take; GW.bank += take + GW_T.DECK_RATE * 2; }
    if (wantH && GW.hoverT <= 0 && GW.bank >= GW_T.HOVER_COST) {
      const I = pickGroundTarget(true); if (I && GW.launchHover(I)) { GW.bank -= GW_T.HOVER_COST; GW.hoverT = GW_T.HOVER_GAP; feed(`RADAR: RW-7 HOVER TANK LEAVING THE KRAKEN  -  HEADING FOR ${I.name}`, 'bad'); }
    }
    if (wantM && GW.mbtT <= 0 && GW.bank >= GW_T.MBT_COST) {
      const I = pickGroundTarget(true); if (I && GW.launchMBT(I, Math.random() < 0.5 ? 'm1a2' : 't90m')) { GW.bank -= GW_T.MBT_COST; GW.mbtT = GW_T.MBT_GAP; feed(`RADAR: ENEMY LANDING CRAFT WITH ARMOUR  -  HEADING FOR ${I.name}`, 'bad'); }
    }
    // the hover tanks are the machines' mobile reserve: one with nothing to do crosses to where there is a fight
    for (const u of GS.units) {
      if (u.kind !== 'hovertank' || !u.alive || u.transit || !u.B) continue;
      const S = u.squad; if (!S || S.state === 'contact' || S.state === 'flank' || S.state === 'assault') { u.idleT = 0; continue; }
      u.idleT = (u.idleT || 0) + 2;
      if (u.idleT < 60) continue;
      const I = pickGroundTarget(false); if (!I || I === u.B.I) continue;
      const R = seaRoute(u.x, u.z, I); if (!R) continue;
      u.idleT = 0; const k = u.B.units.indexOf(u); if (k >= 0) u.B.units.splice(k, 1); if (S) { const j = S.members.indexOf(u); if (j >= 0) S.members.splice(j, 1); }
      // (out to sea from where it is, then round to the new beach)
      const b0 = beachOf(u.B.I, u.x, u.z); GS.transit(u, [b0 ? b0.sea : [u.x, u.z], ...R.route], GS.battle(I), I.owner === 2 ? { type: 'defend', x: I.pad.x, z: I.pad.z, r: 30 } : { type: 'take', x: I.pad.x, z: I.pad.z, r: 30 });
      u.goal = I;
    }
  };

  // ------------------------------------------------------------------------------------------- the war's rounds
  // war.js updateProj hook: the round's path this frame against the ground units. Returns true when it hit one (the
  // war then plays its own impact / explosion; blasts come back through GW.blast).
  const WAR_AMMO = { b: 'm60', ciws: 'hmg', jb: 'cannon20', rocket: 'ffar', aam: 'ffar', bomb: 'ffar', shell: 'mbt120', flak: 'hmg' };
  const WAR_HP = { b: 60, ciws: 80, jb: 150, rocket: 300, aam: 300, bomb: 600, shell: 600, flak: 50 };
  GW.segHit = (b, from) => {
    if (!GS.units.length) return false;
    // the machines hear the player's guns
    if (b.side === 1 && !b._gw) { b._gw = true; if (b.kind === 'b' || b.kind === 'rocket' || b.kind === 'jb') { GS.hearWar(from.x, from.y, from.z, 1, b.kind === 'rocket' ? 500 : 380); GW.playerFiredT = 0; } }
    if (b.kind === 'flak' && b.life > 0) return false;   // (flak bursts at its fuse; the war's blast handles it)
    // RW-7 point defence against the player's rockets
    if (b.side === 1 && b.kind === 'rocket' && GS.pdIntercept(b.p.x, b.p.y, b.p.z)) { b.boom = true; return true; }
    const r = GS.segHit(b.side, WAR_AMMO[b.kind] || 'm60', from.x, from.y, from.z, b.p.x, b.p.y, b.p.z, WAR_HP[b.kind] ?? 60, b.kind === 'rocket' ? 0.3 : 0);
    if (!r) return false;
    b.p.set(r.x, r.y, r.z); b.gwHit = true;
    if (b.kind === 'b' || b.kind === 'jb' || b.kind === 'ciws') fx.impact(r.x, r.y, r.z, r.unit.kind === 'marine' ? 'ground' : 'metal');
    return true;
  };
  // war.js blast hook (bombs, rockets, shells, crashes): the ground units in reach
  GW.blast = (x, y, z, r, dmg, side) => { if (GS.units.length) GS.blast(x, y, z, r * 0.9, dmg / 4, side); };

  // ------------------------------------------------------------------------------------------- the frame
  GW.update = (dt, P, peace) => {
    GW.playerFiredT += dt;
    if (GW.landings.length) updateLandings(dt);
    // transports on their way: if the island has turned hot since they took off, a new LZ away from the fighting
    if ((GW.lzT = (GW.lzT || 0) - dt) <= 0 && W.rotary) {
      GW.lzT = 2;
      for (const u of W.units) {
        if (!u.rot || !u.rot.AI || (u.kind !== 'ch46' && u.kind !== 'mv22') || !u.target || u.rot.deployed || u.dying || u.rot.AI.phase !== 'transit') continue;
        if (Math.hypot(u.p.x - u.lz.x, u.p.z - u.lz.z) < 260 || u.hotChecked === GS.units.length) continue;
        u.hotChecked = GS.units.length;
        const hot = GW.hotLZ(u.target, u.side, W.rotary.FOOT[u.kind], W.rotary.chooseLZ);
        if (hot) u.lz = hot;
      }
    }
    const evs = GS.step(dt, { cam: ear, peace });
    for (const e of evs) { if (e.e === 'kia') tally(e.I, 'kia'); else if (e.e === 'wia') tally(e.I, 'wia'); }
    CV.update(dt); careNews(evs);   // ngc/infdepth
    updateProxies();
    updateLCACs(dt);
    renderUnits(dt);
    effects(evs);
    GFX.tracersUpdate(ear); GFX.unitsUpdate(dt, ear, GW.views); GFX.chatter(rwa, ear, squadNews);   // ngc/rwground-polish
    flushTallies(dt);
    sound(dt, evs);
  };
  GW.reset = () => {
    for (const id of [...GW.views.keys()]) dropView(id);
    for (const L of GW.lcacs) root.remove(L.view.group); GW.lcacs.length = 0;
    for (const L of GW.landings) L.Q.dispose(); GW.landings.length = 0;
    LOD.begin(); LOD.end(); GW.proxies.length = 0; GW.kills.clear(); GS.reset(); CV.reset(); GW.hoverT = GW_T.HOVER_AT; GW.mbtT = GW_T.MBT_AT; GW.bank = 0; GW.silence();
  };
  return GW;
}
