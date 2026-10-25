// cobraai.js - the AH-1T SeaCobra's mind: a 1980 Marine attack helicopter crew. Pure JS (guidance only; pilot.js
// does the flying, so the teetering-rotor physics decides what the aircraft can actually do). PARITY: the Task Force
// counterpart of the WASP's mind (waspai.js), but where the machine is uncanny and precise, the Cobra crew fly the
// doctrine of the day (FM 1-112 / FMFM 5-35 style attack helicopter tactics, the general ideas only):
//   transit  - nap-of-the-earth: low over the terrain ahead (~15-20 m), fast, nose along the track
//   escort   - ride the escorted transport's right rear quarter, matching its speed; orbit it while it sits on the LZ
//   guard    - a wide, low orbit round a point (an island, a ship), nose along the orbit
//   approach - NOE run-in to a battle position at standoff from a ground target, staying low (masked)
//   popup    - unmask: climb over the cover, nose on, the turret works the target in bursts; then remask
//   remask   - drop back down and slide sideways to a new firing position (never pop up twice in the same place)
//   run      - running fire: a shallow dive at the target, rocket pairs in the release band, the gun, then...
//   break    - ...break hard 100+ deg off and extend low before coming round from a new bearing
//   standoff - against aircraft: hold off outside their reach, side-step, turret on them
//   home     - fly to the recovery point and come to a hover over it (the war takes it from there)
// Weapon release is decided here at game level (flags), the unit fires the war's rounds.
import { clamp, wrap } from './rb.js';

const hdgTo = (dx, dz) => Math.atan2(-dx, -dz);
export const COBRA_AI = {
  noe: 16, cruise: 50, runSpeed: 46, runIn: 700, gunReach: 330, rocketBand: [300, 520], standoff: 290, airStandoff: 210, airTooClose: 120,
  popTime: [5, 8], turretYaw: 110 * Math.PI / 180, turretUp: 21 * Math.PI / 180, turretDown: 50 * Math.PI / 180,   // M197 turret limits (headline: +-110 deg, +21 / -50 deg)
};

// world: { groundY(x, z), los(ax, ay, az, bx, by, bz), floorAlong(x, z, ux, uz, L) }
// me: { x, y, z, vx, vy, vz, yaw }; tgt: { x, y, z, vx, vy, vz, air } | null
// ctx: { time, los, task: { kind: 'escort'|'guard'|'strike'|'home', x, y, z, vx, vz, r }, rockets, gun, peace }
export function createCobraAI(o = {}) {
  // a seeded generator (mulberry32 on the id): the same crew flies the same way (deterministic benches and scenes)
  let seed = Math.floor(((o.id ?? 0.5) % 1) * 4294967296) || 0x9e3779b9;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const A = COBRA_AI;
  const AI = {
    mode: 'transit', t: 0, cmd: { vx: 0, vz: 0, vy: 0, hdg: null }, fireGun: false, fireRockets: false, turretOk: false, noseErr: 0, o,
    side: rnd() < 0.5 ? -1 : 1, bp: null, brk: null, pops: 0,
    set(m) { if (m !== AI.mode) { AI.mode = m; AI.t = 0; AI.rn = null; AI.popH = null; AI.tot = 0; } },
    step(me, tgt, dt, world, ctx = {}) {
      AI.t += dt; const c = AI.cmd; AI.fireGun = AI.fireRockets = false; AI.turretOk = false;
      const floor = (ux, uz, L) => world.floorAlong(me.x, me.z, ux, uz, L);
      const sp = Math.hypot(me.vx, me.vz), mvx = sp > 3 ? me.vx / sp : -Math.sin(me.yaw), mvz = sp > 3 ? me.vz / sp : -Math.cos(me.yaw);
      // fly to a point at a speed, low over the terrain (agl over the highest ground ahead), nose along the track
      const goTo = (px, pz, vmax, agl, arrive = 2.0, hold = null) => {
        const dx = px - me.x, dz = pz - me.z, d = Math.hypot(dx, dz), v = Math.min(vmax, Math.sqrt(2 * arrive * Math.max(0, d - 4)) + 0.5);
        c.vx = d > 1 ? dx / d * v : 0; c.vz = d > 1 ? dz / d * v : 0;
        const ux = d > 1 ? dx / d : mvx, uz = d > 1 ? dz / d : mvz, fl = Math.max(floor(ux, uz, 40 + v * 2.5), 0);
        c.vy = clamp((fl + agl - me.y) * 0.45, -4, 6);
        c.hdg = hold ?? (v > 8 ? hdgTo(dx, dz) : c.hdg ?? me.yaw);
        return d;
      };
      const task = ctx.task || { kind: 'guard', x: o.home ? o.home[0] : me.x, z: o.home ? o.home[1] : me.z };
      if (task.kind === 'home') {   // going home overrides everything (bingo fuel / Winchester)
        AI.set('home');
        const d = goTo(task.x, task.z, A.cruise, 0, 1.6);
        const hy = (task.y ?? 0) + (d < 120 ? 12 : 30); c.vy = clamp((Math.max(hy, Math.max(floor(mvx, mvz, 80), 0) + A.noe) - me.y) * 0.5, -3, 5);
        if (d < 60) { c.vx += task.vx || 0; c.vz += task.vz || 0; c.vy = clamp((hy - me.y) * 0.5, -2.5, 3); c.hdg = task.hdg ?? c.hdg; }
        return c;
      }
      if (!tgt) {   // ---- no target: the task
        AI.bp = null; AI.brk = null;
        if (task.kind === 'escort' && task.x !== undefined) {   // right rear quarter of the transport, matching it
          AI.set('escort');
          const tv = Math.hypot(task.vx || 0, task.vz || 0);
          if (tv > 6) {
            const fx = task.vx / tv, fz = task.vz / tv, rx = -fz, rz = fx, px = task.x - fx * 35 + rx * 45 * AI.side, pz = task.z - fz * 35 + rz * 45 * AI.side;
            const ex = px - me.x, ez = pz - me.z;
            c.vx = task.vx + clamp(ex * 0.5, -18, 18); c.vz = task.vz + clamp(ez * 0.5, -18, 18);
            c.vy = clamp((Math.max((task.y ?? 0) + 8, Math.max(floor(mvx, mvz, 80), 0) + A.noe) - me.y) * 0.5, -4, 5);
            c.hdg = Math.hypot(c.vx, c.vz) > 8 ? hdgTo(c.vx, c.vz) : hdgTo(fx, fz);
          } else orbit(task.x, task.z, 130, 26, 30);   // it's down on the LZ: circle over it
        } else if (task.kind === 'strike' || task.kind === 'guard') {
          const r = task.r ?? (task.kind === 'strike' ? 210 : 160), d = Math.hypot(task.x - me.x, task.z - me.z);
          if (d > r + 120) { AI.set('transit'); goTo(task.x, task.z, A.cruise, A.noe + 4, 3); }
          else { AI.set('guard'); orbit(task.x, task.z, r, 30, 32); }
        } else { AI.set('guard'); orbit(me.x, me.z, 120, 26, 30); }
        return c;
      }
      // ---- a target
      const dx = tgt.x - me.x, dz = tgt.z - me.z, dy = tgt.y - me.y, dh = Math.hypot(dx, dz), d = Math.hypot(dh, dy), ux = dx / (dh || 1), uz = dz / (dh || 1);
      const bearing = hdgTo(dx, dz); AI.noseErr = Math.abs(wrap(bearing - me.yaw));
      if (tgt.air && !tgt.slow) {   // ---- an aircraft (WASPs, Ospreys, drones): stand off outside its reach, side-step
        if (!['standoff', 'break'].includes(AI.mode)) AI.set('standoff');
        if (AI.mode === 'standoff') {
          const stand = A.airStandoff, slide = Math.sin(AI.t * 0.3 + (o.id || 0) * 5) * 22;
          const px = tgt.x - ux * stand - uz * slide, pz = tgt.z - uz * stand + ux * slide;
          { const ex = px - me.x, ez = pz - me.z, ed = Math.hypot(ex, ez), v = Math.min(40, Math.sqrt(2 * 2.6 * ed), ed * 0.6); c.vx = ex / (ed || 1) * v + (tgt.vx || 0) * 0.7; c.vz = ez / (ed || 1) * v + (tgt.vz || 0) * 0.7; }   // arrive, don't overshoot into its reach
          c.vy = clamp((Math.max(tgt.y - 6, Math.max(floor(ux, uz, 60), 0) + A.noe) - me.y) * 0.5, -4, 5); c.hdg = bearing;
          if (d < A.airTooClose) { AI.set('break'); AI.brk = { a: Math.atan2(-uz, -ux) + AI.side * 0.9 }; }
        } else breakAway(dh, 6, 260);
      } else {   // ---- a ground target (or a slow one: a freighter, a hovering transport)
        if (['standoff', 'transit', 'guard', 'escort', 'home'].includes(AI.mode)) AI.set('approach');
        switch (AI.mode) {
          case 'approach': {   // NOE to a battle position at standoff, on a bearing a little off our line in
            if (!AI.bp) { const a = Math.atan2(-uz, -ux) + AI.side * (0.25 + rnd() * 0.35); AI.bp = { a, r: A.standoff + rnd() * 40 }; }
            const px = tgt.x + Math.cos(AI.bp.a) * AI.bp.r, pz = tgt.z + Math.sin(AI.bp.a) * AI.bp.r;
            const left = goTo(px, pz, A.cruise, A.noe, 3.2);
            if (left < 40 || dh < A.standoff + 20) AI.set((ctx.rockets ?? 0) > 0 && AI.pops % 2 === 1 ? 'run' : 'popup');
            break;
          }
          case 'popup': {   // unmask over the cover, nose on, guns; a slow side-slip
            const sl = Math.sin(AI.t * 0.5) * 3;
            c.vx = -uz * sl * AI.side + (tgt.vx || 0); c.vz = ux * sl * AI.side + (tgt.vz || 0);
            if (dh < A.standoff - 60) { c.vx -= ux * 8; c.vz -= uz * 8; } else if (dh > A.gunReach - 20) { c.vx += ux * 8; c.vz += uz * 8; }
            // unmask: rise until the target is in sight (no higher than the cover between us + a margin), then hold
            const cover = Math.max(world.floorAlong(me.x, me.z, ux, uz, Math.max(12, dh - 30)), 0);
            if (AI.popH === null) AI.popH = Math.max(me.y, tgt.y + 8);
            if (!(ctx.los ?? true)) AI.popH = Math.min(AI.popH + 4 * dt, Math.max(cover + 14, tgt.y + 14));
            c.vy = clamp((Math.max(AI.popH, Math.max(world.groundY(me.x, me.z), 0) + A.noe) - me.y) * 0.8, -3, 4); c.hdg = bearing;
            if ((ctx.los ?? true) && AI.noseErr < 0.6) AI.tot += dt;   // time on target counts once it's in sight
            if (AI.tot > A.popTime[0] + ((o.id || 0) * 7 % 1) * (A.popTime[1] - A.popTime[0]) || AI.t > 22) { AI.pops++; AI.set('remask'); AI.rm = { a: Math.atan2(me.z - tgt.z, me.x - tgt.x) + AI.side * (0.35 + rnd() * 0.3) }; }
            break;
          }
          case 'remask': {   // down behind the cover and slide to a new position
            const r = A.standoff + 30, px = tgt.x + Math.cos(AI.rm.a) * r, pz = tgt.z + Math.sin(AI.rm.a) * r;
            const left = goTo(px, pz, 26, A.noe - 4, 2.5, bearing);
            if (left < 25 || AI.t > 12) { AI.set((ctx.rockets ?? 0) > 0 && AI.pops % 2 === 1 ? 'run' : 'popup'); if (AI.mode === 'run') AI.bp = null; }
            break;
          }
          case 'run': {   // running fire: out to a run-in point, then in at speed on a shallow dive, rockets in the band, guns, break at the bottom
            if (!AI.rn) { const a = Math.atan2(me.z - tgt.z, me.x - tgt.x) + AI.side * (0.6 + rnd() * 0.4); AI.rn = { out: dh < A.runIn - 100, x: tgt.x + Math.cos(a) * A.runIn, z: tgt.z + Math.sin(a) * A.runIn, t: AI.t }; }
            if (AI.rn.out) {   // set up: NOE out to the run-in point (the attack starts at speed)
              const left = goTo(AI.rn.x, AI.rn.z, A.cruise, A.noe + 4, 40);   // no slowing for the turn-in point
              if (left < 160 || AI.t - AI.rn.t > 30) { AI.rn.out = false; AI.rn.t = AI.t; }
              break;
            }
            const v = A.runSpeed;   // the run in
            c.vx = ux * v + (tgt.vx || 0) * 0.5; c.vz = uz * v + (tgt.vz || 0) * 0.5;
            const want = tgt.y + clamp(dh * 0.08, 12, 32);
            c.vy = clamp((Math.max(want, Math.max(floor(ux, uz, Math.min(dh, 160)), 0) + 12) - me.y) * 0.45, -5, 6); c.hdg = bearing;
            const [r0, r1] = A.rocketBand;
            AI.fireRockets = dh > r0 && dh < r1 && AI.noseErr < 0.1 && (ctx.rockets ?? 0) > 0;
            if (dh < 300 || AI.t - AI.rn.t > 25) { AI.pops++; AI.set('break'); AI.brk = { a: Math.atan2(uz, ux) + AI.side * (1.8 + rnd() * 0.4) }; AI.side = -AI.side; }
            break;
          }
          case 'break': breakAway(dh, 5, A.standoff + 40); if (AI.mode === 'approach') AI.bp = null; break;
          default: AI.set('approach');
        }
      }
      // weapon: the M197 turret reaches +-110 deg round and +21 / -50 deg; a clear line, inside the gun's reach
      const rel = wrap(bearing - me.yaw), el = Math.atan2(dy, dh);
      AI.turretOk = Math.abs(rel) < A.turretYaw && el < A.turretUp && el > -A.turretDown;
      const gunMode = ['popup', 'run', 'standoff'].includes(AI.mode);
      AI.fireGun = gunMode && AI.turretOk && d < A.gunReach && (ctx.los ?? true) && (ctx.gun ?? 1) > 0 && !ctx.peace;
      AI.fireRockets = AI.fireRockets && (ctx.los ?? true) && !ctx.peace;
      return c;

      function breakAway(dist, tMin, dOut) {   // hard turn off, extend low, then come round again
        const bx = Math.cos(AI.brk ? AI.brk.a : 0), bz = Math.sin(AI.brk ? AI.brk.a : 0);
        c.vx = bx * A.cruise; c.vz = bz * A.cruise; c.vy = clamp((Math.max(floor(bx, bz, 120), 0) + A.noe - me.y) * 0.45, -4, 5); c.hdg = hdgTo(bx, bz);
        if (AI.t > tMin && dist > dOut) { AI.set(tgt.air && !tgt.slow ? 'standoff' : 'approach'); AI.bp = null; }
      }
    },
  };
  function orbit(cx, cz, r, agl, v) {   // a counter-clockwise (left-hand) orbit, nose along it
    const c = AI.cmd, ax = AI._me.x - cx, az = AI._me.z - cz, d = Math.hypot(ax, az) || 1, tx = -az / d, tz = ax / d;   // tangent
    const er = r - d;
    c.vx = tx * v + ax / d * clamp(er * 0.3, -12, 12); c.vz = tz * v + az / d * clamp(er * 0.3, -12, 12);
    const fl = AI._world.floorAlong(AI._me.x, AI._me.z, tx, tz, 90);
    c.vy = clamp((Math.max(fl, 0) + agl - AI._me.y) * 0.4, -3, 4); c.hdg = hdgTo(c.vx, c.vz);
  }
  // at speed a pilot TURNS onto a new course (banks round, keeps the speed) rather than braking to a stop and
  // accelerating the other way: the commanded velocity swings round from the present one by at most ~20 deg
  const TURN = 0.35;
  function turnLimit(c, me) {
    const sp = Math.hypot(me.vx, me.vz), cs = Math.hypot(c.vx, c.vz);
    if (sp < 15 || cs < 15 || ((AI.mode === 'popup' || AI.mode === 'standoff') && sp < 25)) return;
    const a0 = Math.atan2(me.vz, me.vx), da = wrap(Math.atan2(c.vz, c.vx) - a0);
    if (Math.abs(da) <= TURN) return;
    const a = a0 + Math.sign(da) * TURN; c.vx = Math.cos(a) * cs; c.vz = Math.sin(a) * cs;
    if (Math.abs(da) > 1.2) c.hdg = hdgTo(c.vx, c.vz);   // nose with the turn until it's round
  }
  // never into the ground (every mode, home included): the highest ground ahead along the commanded track
  function groundGuard(c, me, world) {
    const s2 = Math.hypot(c.vx, c.vz), sp = Math.hypot(me.vx, me.vz), ux = s2 > 2 ? c.vx / s2 : sp > 2 ? me.vx / sp : 0, uz = s2 > 2 ? c.vz / s2 : sp > 2 ? me.vz / sp : 0;
    const fl = Math.max(world.floorAlong(me.x, me.z, ux, uz, 30 + Math.max(s2, sp) * 3.5), 0), m = AI.mode === "home" ? 4 : 9;
    if (me.y < fl + m) c.vy = Math.max(c.vy, (fl + m + 2 - me.y) * 0.9);
  }
  const step0 = AI.step; AI.step = (me, tgt, dt, world, ctx) => { AI._me = me; AI._world = world; const c = step0(me, tgt, dt, world, ctx); turnLimit(c, me); groundGuard(c, me, world); return c; };
  return AI;
}

// guidance cmd -> controls (pilot.js loops), like flyCH46: on the skids no trim wind-up and a smooth pull; in the air a
// collective ceiling that keeps the rotor power under the transmission / engine limit (the pilot on the torque meter)
// In forward flight the heading change is held to what a coordinated turn gives (yaw rate g tan(bank) / V): a flat,
// skidding pedal turn at speed would roll the aircraft off through the fin's sideslip (a pilot turns with the cyclic).
const _cmd = {}, CMD_KEYS = ["vx", "vz", "vy", "hdg", "ax", "az", "tilt", "pitch", "roll", "collFix", "kv", "aMax"];
export function flyCobra(S, P, st, cmd, dt) {
  if (S.body.contacts >= 2) { P.i.lon = P.i.lat = P.i.th = P.i.ph = 0; P.i.coll = Math.min(P.i.coll, S.c.coll + 0.05); }
  const V = Math.hypot(st.vx, st.vz), G = P.G;
  const KEYS = CMD_KEYS; for (let i = 0; i < KEYS.length; i++) _cmd[KEYS[i]] = cmd[KEYS[i]]; cmd = _cmd;   // a fresh copy (no keys left over from the last call)
  if (cmd.hdg !== undefined && cmd.hdg !== null && V > 12) {
    const rc = Math.min(G.psi[1], 9.81 * Math.tan(Math.abs(st.roll) + 0.12) / V);
    cmd.hdg = st.yaw + clamp(wrap(cmd.hdg - st.yaw), -rc / G.psi[0], rc / G.psi[0]);
  }
  // the lift vector leans far for a turn (G.aMax, ~33 deg bank) but the nose goes down / up less for speed changes:
  // the forward part of the velocity error is held to what ~20 deg nose-down / ~25 deg nose-up asks
  { const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), ef = ((cmd.vx ?? 0) - st.vx) * fx + ((cmd.vz ?? 0) - st.vz) * fz, k = G.kv;
    const lim = clamp(ef, -G.aDec / k, G.aFwd / k); if (lim !== ef) { cmd.vx = (cmd.vx ?? 0) - (ef - lim) * fx; cmd.vz = (cmd.vz ?? 0) - (ef - lim) * fz; } }
  // no steep descents slow (vortex ring state, settling with power): below ~30 kt the sink is held to ~300-600 fpm
  if (V < 25 && cmd.vy !== undefined && cmd.collFix === undefined) cmd.vy = Math.max(cmd.vy, -1.0 - V * 0.1);
  // ...and if the wake catches up anyway (vortex ring), fly out of it: forward cyclic for speed, don't pull (Vuichard /
  // the classic recovery), until clear
  if (cmd.collFix === undefined && (S.rotor.vrs > 0.3 || (S.rotor.vrs > 0.12 && st.vy < -3))) {
    const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw); cmd.vx = st.vx + fx * 12; cmd.vz = st.vz + fz * 12; cmd.vy = 0;
  }
  // height first: sinking faster than wanted, or low, the pilot levels out (less lean leaves more thrust to hold height)
  { const sink = (cmd.vy ?? 0) - st.vy, low = S.agl < 9 ? (9 - S.agl) / 9 : 0;
    cmd.tilt = clamp((cmd.tilt ?? G.tilt) - Math.max(0, sink - 1.5) * 0.08 - low * 0.35, 0.14, G.tilt); }
  const c = P.step(st, dt, cmd);
  const lim = Math.min(S.xmsn, S.pAvail || S.xmsn) * 0.97, pw = (S.rotor.power + S.trPower) / lim;
  P.cMax = clamp((P.cMax ?? 1) + (1 - pw) * (pw > 1 ? 2.5 : 0.8) * dt - Math.max(0, 0.93 - S.rpm) * 3 * dt, Math.max(0.2, S.c.coll - 0.25), 1);   // + never pull the rotor rpm down (overpitching)
  if (c.coll > P.cMax) { c.coll = P.cMax; P.i.coll = Math.min(P.i.coll, P.cMax); }
  if (S.agl > 4 && cmd.collFix === undefined && c.coll < 0.1) { c.coll = 0.1; P.i.coll = Math.max(P.i.coll, 0.1); }   // in flight never bottom the lever (keeps the engines up, the rpm in hand)
  return c;
}

// autorotation to the ground (both power sections out, or the war's shoot-down): the collective holds rotor rpm, the
// nose holds ~70 kt; at ~30 m the flare (nose up: trades speed for rpm and stops the sink), level at ~6 m and the
// cushion (collective up on the rotor's stored energy) - the textbook Bell autorotation. Pure; returns the controls.
const _ar = { vx: 0, vz: 0, hdg: 0, collFix: 0, pitch: undefined, tilt: 0.16, kv: 0.12 };
export function autoRotate(S, P, st, dt, k = {}) {
  const agl = S.agl, fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), vf = st.vf, hi = k.flare ?? 30, lo = k.level ?? 5;
  if (P.arColl === undefined) P.arColl = P.i.coll;
  P.arColl = clamp(P.arColl + (S.rpm - 1.02) * 1.4 * dt, 0, 1);   // the collective keeps the rotor in the green
  let coll = P.arColl, pitch;
  if (agl > hi) { _ar.vx = fx * 36; _ar.vz = fz * 36; }   // glide at ~70 kt (a gentle nose-down to get there)
  else if (agl > lo) {   // flare: nose up while there is speed to trade and sink to stop (stops the sink, builds rpm), level by the bottom
    const kf = k.kf ?? 0.4; pitch = clamp(0.03 + kf * clamp(vf / 30, 0, 1) * clamp(-st.vy / (k.ks ?? 6), 0, 1) * clamp((agl - lo) / 5, 0.25, 1), 0, 0.4); _ar.vx = fx * vf * 0.6; _ar.vz = fz * vf * 0.6;
  } else {   // skids level, cushion: collective against the sink on the rotor's stored energy
    pitch = 0.03; _ar.vx = fx * vf * 0.5; _ar.vz = fz * vf * 0.5;
    coll = clamp(P.arColl + Math.max(0, -st.vy - 0.3) * (k.kc ?? 0.15) + (k.kp ?? 0.15), 0, 1);
  }
  _ar.hdg = st.yaw; _ar.collFix = coll; _ar.pitch = pitch;
  const c = P.step(st, dt, _ar); c.eng0 = c.eng1 = false; return c;
}
