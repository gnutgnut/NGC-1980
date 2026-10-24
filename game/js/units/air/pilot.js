// AI pilot for the airframe sims (units/air/airframe.js). It flies the real flight model only through the stick,
// pedals and throttles (via the flight director, fd.js) - no steering by hand of god. Pure: no THREE scene, no DOM, no
// game imports; runs in node (tools/airbench.mjs) and in the game (units/air/airwar.js).
//
// Behaviour, as a state machine:
//   cat       on the catapult: run up (MIL / AB), wait for the shot
//   climb     off the bow: hold ~9° nose up wings level, gear up, flaps up, climb to the CAP altitude
//   cap       orbit the anchor (the ALBATROSS or an ordered point); radar search; commit on a contact
//   fight     intercept and dogfight: lead / pure / lag pursuit, overshoot avoidance (lag + yo-yo), defensive break
//             turns into an attacker, weapons (game-level missiles and the gun)
//   rtb       bingo fuel or winchester: back to the ship, into the pattern (upwind, downwind, base)
//   final     carrot guidance onto the extended centreline and the 3.5° glideslope, then the LSO's last 700 m:
//             stick for the glideslope, throttle for on-speed AoA (15 units), lineup by bank
//   waveoff   out of parameters in close (lineup, height, a turning deck): full power, climb straight ahead, go round
//   bolter    touched down, no wire: power is already up (MIL on touchdown), off the bow and round again
//   trapped   on the wire: MIL until it holds, then idle; 'recovered' once stopped and the wire lets go
//   patrol    (drones) orbit a point and spot; 'strike' fly to a point and dive on it
// Everything airborne goes through terrain look-ahead: the predicted path is sampled against the ground (the game has
// real mountains outside the archipelago), the climb angle raised to clear it, and if no climb will do, a heading that
// clears is chosen; inside a few seconds of impact it rolls wings level and pulls.
import * as THREE from 'three';
import { createFD } from './fd.js';
import { DECKOPS, aeroCoeffs } from './airframe.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const D2R = Math.PI / 180;
const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _r = new THREE.Vector3(), _f = new THREE.Vector3(), _a = new THREE.Vector3(), _q = new THREE.Vector3();
const _k = new THREE.Vector3(), _s = new THREE.Vector3(), _lv = new THREE.Vector3();

// The CAP racetrack in its own axes (a along the threat axis, b across): straight legs at b = +R (inbound, toward the
// threat) and b = -R, joined by half circles. trackPoint: the point s metres along the loop; trackS: the s of the
// point nearest (pa, pb).
export function trackPoint(s, L, R, out) {
  const P = Math.PI * R, tot = 2 * L + 2 * P; s = ((s % tot) + tot) % tot;
  if (s < L) return out.set(-L / 2 + s, 0, R);
  s -= L; if (s < P) { const th = Math.PI / 2 - s / R; return out.set(L / 2 + R * Math.cos(th), 0, R * Math.sin(th)); }
  s -= P; if (s < L) return out.set(L / 2 - s, 0, -R);
  s -= L; const th = -Math.PI / 2 - s / R; return out.set(-L / 2 + R * Math.cos(th), 0, R * Math.sin(th));
}
export function trackS(pa, pb, L, R) {
  const P = Math.PI * R;
  if (Math.abs(pa) <= L / 2) return pb >= 0 ? pa + L / 2 : L + P + (L / 2 - pa);
  if (pa > L / 2) return L + R * (Math.PI / 2 - Math.atan2(pb, pa - L / 2));
  let u = -Math.PI / 2 - Math.atan2(pb, pa + L / 2); u = ((u % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return 2 * L + P + R * u;
}

// per-type behaviour numbers (EAS in m/s; the game's air is 4x denser, so true speeds are about half: see jetfm.js)
// Weapons are game-level: a kind, the range band and nose cone it is fired in, how long the projectile lives.
export const PILOTS = {
  TOMCAT: {
    climbEAS: 150, capEAS: 128, corner: 170, fightTop: 200, vmin: 82, gmax: 6.5, gfight: 6.8, tactic: 'energy', aoaApp: 10.5 * D2R, capAlt: 240, capR: 520,
    radar: 1700, leash: 1900, bingo: 1900, patAlt: 110, gs: 3.5 * D2R, landX: -4.5, catX: -2.5, abFight: true,   // (ngc/bugsweep) catX: the port bow cat - the starboard one (4.5) is fouled by the two Hornets SEAWORLD parks on the starboard bow, solid now: the right main ran into one at the end of the stroke (55 g, breakup)
    weapons: [   // game ranges for a 1.3 km map: long shots with the AIM-54 / AIM-7, the AIM-9 close, then the gun
      { w: 'aim54', rmin: 650, rmax: 1500, cone: 0.35, life: 10, v0: 25, every: 4 },
      { w: 'aim7', rmin: 380, rmax: 1000, cone: 0.3, life: 8, v0: 20, every: 3 },
      { w: 'aim9', rmin: 130, rmax: 520, cone: 0.45, life: 6, v0: 15, every: 2 },
    ],
    gun: { range: 380, cone: 0.06, speed: 520, burst: 0.45, rest: 0.5 },   // snapshots too: a burst whenever the pipper sweeps through
    // (airai-polish) CAP as a racetrack on the threat axis, the section's wingman slot (right of, below and behind the
    // lead, in the lead's axes: x right, y up, z aft), the break interval in the Case I pattern
    racetrack: true, capLeg: 700, slot: [26, -3, 26], breakGap: 16, ballCall: true,
  },
  SHRIKE: {
    climbEAS: 160, capEAS: 140, corner: 165, fightTop: 210, vmin: 78, gmax: 9, gfight: 10, capAlt: 200, capR: 450,
    radar: 1400, leash: 2200, bingo: 0, abFight: false, aggressive: true,
    weapons: [{ w: 'aam', rmin: 150, rmax: 600, cone: 0.4, life: 6, v0: 15, every: 4 }],
    gun: { range: 280, cone: 0.04, speed: 480, burst: 0.4, rest: 0.8 },
  },
  REAPER: { climbEAS: 52, capEAS: 50, corner: 60, fightTop: 70, gmax: 2.5, gfight: 2.5, capAlt: 260, capR: 300, radar: 0, leash: 0, bingo: 0, weapons: [], gun: null },
};

export function createPilot(A, o = {}) {
  const T = { ...(PILOTS[A.P.name] || PILOTS.TOMCAT), ...o };
  const FD = createFD(A, { gmax: T.gmax, grav: o.grav });
  const DK = A.P.DECK || DECKOPS;
  const PL = {
    A, FD, T, side: o.side ?? 1, name: o.name || A.P.name, state: o.state || 'cap', t: 0, stateT: 0,
    tgt: null, threat: null, anchor: null, wp: 0, log: [], lastFire: -99, gunT: 0, gunRest: 0, fired: {},
    trapped: null, recovered: false, waveoffs: 0, bolters: 0, kills: 0, why: '', tdT: -1, terrainPull: 0, minAGL: 1e9,
    lead: null, wing: null, form: '', capAxis: 0, brokeAt: -99, look: null, ball: false, gone: false,   // (airai-polish) section, racetrack, crew's eyes
  };
  const _look = new THREE.Vector3();
  const say = (msg) => { PL.log.push({ t: +PL.t.toFixed(1), msg }); if (PL.log.length > 60) PL.log.shift(); if (o.onSay) o.onSay(msg, PL); };
  const set = (s, why) => { if (PL.state !== s) { PL.state = s; PL.stateT = 0; PL.wp = 0; A.brakeCmd = 0; say(`${s.toUpperCase()}${why ? '  ' + why : ''}`); } };
  PL.set = set;
  A.landX = T.landX ?? DK.LAND_X; A.catX = T.catX ?? DK.CAT_X;

  // ------------------------------------------------------------------ geometry helpers
  const deck = (c, x, z) => { const dx = x - c.x, dz = z - c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw); return [dx * co - dz * si, dx * si + dz * co]; };
  const world = (c, lx, lz, out) => { const co = Math.cos(c.yaw), si = Math.sin(c.yaw); return out.set(c.x + lx * co + lz * si, 0, c.z - lx * si + lz * co); };
  const hdgOf = v => Math.atan2(v.x, -v.z);
  const eas = () => A.eas;

  // terrain look-ahead: raise the climb angle of direction d (unit, world) so the path clears the ground by `clear`;
  // if no sane climb clears it, swing the heading to one that does. Returns the (possibly modified) d.
  function terrainGuard(d, env, clear = 55) {
    if (!env.terrain) return d;
    const V = Math.max(A.tas, 30), y = A.pos.y, hz = Math.hypot(d.x, d.z) || 1, vh = Math.hypot(A.vel.x, A.vel.z) || 1;
    const cache = PL._nc || (PL._nc = new Map());
    const need = (dx, dz) => {   // climb angle needed along horizontal direction (dx, dz); cached ~0.1 s per 3° of heading
      const key = Math.round(Math.atan2(dx, dz) * 20), c = cache.get(key);
      if (c && PL.t - c.t < 0.1 && Math.abs(c.y - y) < 4) return c.g;
      let g = -1;
      for (const s of [1, 2, 3.5, 5, 7, 10, 14]) {
        const L = V * s, f = env.terrain(A.pos.x + dx * L, A.pos.z + dz * L);
        g = Math.max(g, Math.atan2(f + clear - y, L));
      }
      if (c) { c.t = PL.t; c.y = y; c.g = g; } else cache.set(key, { t: PL.t, y, g });
      return g;
    };
    let gNeed = Math.max(need(d.x / hz, d.z / hz), need(A.vel.x / vh, A.vel.z / vh) - 0.1);
    let hx = d.x / hz, hzz = d.z / hz, turned = false;
    const avoiding = PL.t < (PL.avoidUntil || 0);
    if (gNeed > 0.4 || avoiding) {   // too steep to climb over: turn to a heading that clears and climb along it
      if (!avoiding) {
        const h0 = Math.atan2(A.vel.x, -A.vel.z); let best = 9, bh = h0;
        for (const k of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI]) {
          const h = h0 + k, g = need(Math.sin(h), -Math.cos(h)) + Math.abs(k) * 0.03;
          if (g < best) { best = g; bh = h; }
        }
        PL.avoidHdg = bh; PL.avoidUntil = PL.t + 4;   // hold it a few seconds (no flip-flopping along a ridge)
      }
      hx = Math.sin(PL.avoidHdg); hzz = -Math.cos(PL.avoidHdg); gNeed = Math.max(need(hx, hzz), 0.22); turned = true; PL.terrainPull = 1;
    }
    const gam = Math.asin(clamp(d.y, -1, 1));
    if (gNeed > gam || turned) {
      const g = Math.min(Math.max(gNeed, turned ? 0.22 : gam), 0.6); d.set(hx * Math.cos(g), Math.sin(g), hzz * Math.cos(g)); PL.terrainPull = Math.max(PL.terrainPull, 0.5);
    }
    // close to impact on the present path: roll level and pull now
    const tImp = A.vel.y < -1 ? (y - env.terrain(A.pos.x + A.vel.x * 2, A.pos.z + A.vel.z * 2) - 15) / -A.vel.y : 99;
    if (tImp < 3) { d.set(hx * 0.8, 0.6, hzz * 0.8).normalize(); PL.terrainPull = 2; }
    return d;
  }
  // fly toward direction d with terrain protection; speed target in EAS
  function fly(d, dt, env, { speed, ab = false, g = T.gmax, k = 1.6, guard = true, free = false, push = true } = {}) {
    PL.terrainPull = 0;
    if (!free) {   // outside a fight, turns are flat: at most ~60° of heading change asked for at once (no loops to reverse)
      const vh = Math.hypot(A.vel.x, A.vel.z), dh = Math.hypot(d.x, d.z);
      if (vh > 5 && dh > 1e-3) {
        const h0 = Math.atan2(A.vel.x, -A.vel.z), dw = wrap(Math.atan2(d.x, -d.z) - h0), lim = 1.0;
        if (Math.abs(dw) > lim) { const h = h0 + Math.sign(dw) * lim; d.set(Math.sin(h) * dh, d.y, -Math.cos(h) * dh); }
      }
    }
    if (guard) terrainGuard(d, env);
    // hard deck and dive recovery: below the fight floor no new dives; and if the height left is less than the
    // pull-out from this dive needs (V^2 (1 - cos gamma) / (g (n - 1)), plus the roll-out), wings level and pull now
    if (guard && env.terrain && !A.onGround) {
      const agl = A.pos.y - Math.max(env.terrain(A.pos.x, A.pos.z), env.terrain(A.pos.x + A.vel.x * 2, A.pos.z + A.vel.z * 2));
      const floor = T.hardDeck ?? 140;
      if (PL.state === 'fight' && agl < floor && d.y < 0.05) { d.y = agl < floor * 0.6 ? 0.25 : Math.max(d.y, 0.05); d.normalize(); }
      if (A.vel.y < -2) {
        const V = A.tas, gam = Math.asin(clamp(-A.vel.y / V, 0, 1)), n = Math.max(2, Math.min(g, A.qbar * A.P.S * 1.1 / (A.mass * 9)));
        const hpo = V * V * (1 - Math.cos(gam)) / (9 * (n - 1)) * 1.6 + Math.abs(A.attitude().roll) / 2 * -A.vel.y * 1.5 + 30;   // + the roll-out, while the dive steepens
        if (agl < hpo) { const vh = Math.hypot(A.vel.x, A.vel.z) || 1; d.set(A.vel.x / vh * 0.7, 0.7, A.vel.z / vh * 0.7).normalize(); PL.terrainPull = 2; g = Math.max(g, T.gfight); k = 5; }
      }
    }
    if (PL.terrainPull) { speed = Math.max(speed ?? 0, T.climbEAS); ab = true; if (PL.terrainPull >= 1) g = Math.max(g, Math.min(T.gfight, 5)); }   // climbing for the terrain: power up
    FD.steer(d, dt, { gmax: g, k: PL.terrainPull ? Math.max(k, 2) : k, eas: speed ?? null, ab, push });
    if (A.nz > g + 0.2) FD.ctl.pitch = Math.max(-1, FD.ctl.pitch - (A.nz - g - 0.2) * 0.5);   // feel the g: ease off past the limit
    const agl = A.pos.y - (env.terrain ? env.terrain(A.pos.x, A.pos.z) : 0); if ((PL.state === 'cap' || PL.state === 'fight' || PL.state === 'rtb' || PL.state === 'patrol') && !A.onGround) PL.minAGL = Math.min(PL.minAGL, agl);
  }
  const dirTo = (x, y, z, maxG = 0.45, out = _d) => FD.dirTo(x, y, z, out, maxG);

  // ------------------------------------------------------------------ launch
  PL.launch = env => {   // spot on the catapult (bow cat 2) and run up
    if (!A.attachCat(env)) return false;
    for (const e of A.eng) { e.run = true; if (e.n < 0.68) e.n = 0.68; }
    A.hookCmd = 0; A.flapSel = 1; set('cat'); return true;
  };
  PL.spawnAir = (state = 'cap') => { set(state); FD.reset(); FD.thr = 0.8; FD.ti = 0.8; };

  // ------------------------------------------------------------------ the combat brain
  function pickTarget(env) {
    if (!env.foes || !T.radar) return null;
    const anc = PL.anchor; let best = null, bs = 1e9;
    for (const f of env.foes(PL.side)) {
      if (f.dead || f.dying || f.gone) continue;
      const d = f.p.distanceTo(A.pos); if (d > T.radar) continue;
      const da = anc ? Math.hypot(f.p.x - anc.x, f.p.z - anc.z) : 0;
      if (anc && da > T.leash && d > 500) continue;   // outside the CAP's patch and not on top of us: let it go
      const score = d + da * 0.5 - (f.air ? 400 : 0);
      if (score < bs) { bs = score; best = f; }
    }
    return best;
  }
  // a foe whose nose is on us, close: the one to break against
  function pickThreat(env) {
    if (!env.foes) return null; let best = null, bd = 900;
    for (const f of env.foes(PL.side)) {
      if (!f.air || f.dead || f.dying) continue;
      _t.copy(A.pos).sub(f.p); const d = _t.length(); if (d > bd) continue;
      const fv = f.v.length(); if (fv < 5) continue;
      if (_t.dot(f.v) / (d * fv) > Math.cos(32 * D2R)) { best = f; bd = d; }
    }
    if (env.missiles) for (const m of env.missiles(PL.side)) if (m.tgt === PL.unit || m.tgt === A) { const d = m.p.distanceTo(A.pos); if (d < 700 && d < bd) { best = m; bd = d; } }
    return best;
  }
  function weapons(dt, env) {
    const t = PL.tgt; if (!t || !env.fire) return;
    _t.copy(t.p).sub(A.pos); const R = _t.length(); A.forward(_f); const ata = Math.acos(clamp(_f.dot(_t) / R, -1, 1));
    // missiles: one of the right kind for the range, a few seconds apart, not at the same target while one is in flight
    if (PL.t - PL.lastFire > 1.2) for (const W of T.weapons) {
      if (R < W.rmin || R > W.rmax || ata > W.cone || PL.t - (PL.fired[W.w] ?? -99) < W.every) continue;
      if (env.inFlight && env.inFlight(t) > 0) break;
      const st = A.stores.find(s => s.on && s.w === W.w); if (!st) continue;
      st.on = false; PL.lastFire = PL.fired[W.w] = PL.t;
      env.fire(W.w, A, st, t, W); say(`FOX ${W.w === 'aim54' ? 'THREE' : W.w === 'aim7' ? 'ONE' : 'TWO'} ${W.w.toUpperCase()}  ${R.toFixed(0)} m`);
      break;
    }
    // gun: lead the target by the bullet's time of flight, bursts while the pipper is on
    const G = T.gun; PL.gunT -= dt; PL.gunRest -= dt;
    if (G && A.gun > 0 && R < G.range && PL.gunRest <= 0) {
      const tof = R / G.speed; _a.copy(t.p).addScaledVector(t.v, tof).sub(A.pos); _a.y += 0.5 * 9 * tof * tof;
      const err = Math.acos(clamp(_f.dot(_a) / _a.length(), -1, 1));
      if (err < G.cone || PL.gunT > 0) {
        if (PL.gunT <= 0) PL.gunT = G.burst;
        PL.gunAcc = (PL.gunAcc || 0) + dt;
        while (PL.gunAcc > 0.05 && A.gun > 0) { PL.gunAcc -= 0.05; A.gun--; env.fire('gun', A, null, t, G); }
        if (PL.gunT - dt <= 0) PL.gunRest = G.rest;
      }
    }
  }
  // energy: the slower we are, the less we may point up (no zoom climbs to a stall); below vmin, nose low and unload
  function energyLimit(d) {
    const vmin = T.vmin ?? 80, e = clamp((A.eas - vmin) / (T.corner - vmin), 0, 1), gMax = -0.25 + 1.15 * e;
    const gam = Math.asin(clamp(d.y, -1, 1));
    if (gam > gMax) { const h = Math.hypot(d.x, d.z) || 1, c = Math.cos(gMax); d.set(d.x / h * c, Math.sin(gMax), d.z / h * c); }
    return e;
  }
  // dive limit: no steeper dive than one we can pull out of above the hard deck (V^2 (1 - cos g) / (g (n - 1)), x1.6)
  function diveLimit(d, env) {
    const agl = A.pos.y - (env.terrain ? env.terrain(A.pos.x, A.pos.z) : 0), room = Math.max(0, agl - (T.hardDeck ?? 140)), V = Math.max(A.tas, 30);
    const gMin = -Math.acos(clamp(1 - room * 9 * (Math.min(T.gfight, 6) - 1) / (V * V * 1.6), -1, 1));
    if (Math.asin(clamp(d.y, -1, 1)) < gMin) { const h = Math.hypot(d.x, d.z) || 1, c = Math.cos(gMin); d.set(d.x / h * c, Math.sin(gMin), d.z / h * c); }
  }
  // room for the vertical (loops, split-S, reversals through the vertical); below that, turns stay turns
  const vertOk = env => A.pos.y - (env.terrain ? env.terrain(A.pos.x, A.pos.z) : 0) > (T.hardDeck ?? 140) + 320;
  function fight(dt, env) {
    const t = PL.tgt, th = PL.threat;
    if (th && PL.defT > 0) {   // defensive: break into the attacker (or across a missile's path) at max g, nose a little low
      PL.mode = 'break';
      _t.copy(th.p).sub(A.pos).normalize();
      _d.copy(_t).addScaledVector(A.vel, -_t.dot(A.vel) / A.vel.lengthSq());   // the part of the line of sight across our path
      if (_d.lengthSq() < 1e-4) _d.set(-A.vel.z, 0, A.vel.x);
      _d.normalize(); A.forward(_f); _d.multiplyScalar(2).add(_f.normalize()).normalize(); _d.y = clamp(_d.y, -0.2, 0.1);
      if (th.kind !== 'aam') { const j = Math.floor(PL.t / 1.3) % 3; _d.y += j === 0 ? 0.45 : j === 1 ? -0.3 : 0; }   // guns jink: change the plane every second or so
      energyLimit(_d.normalize()); diveLimit(_d, env);
      fly(_d, dt, env, { speed: T.corner, ab: T.abFight, g: T.gfight, k: 4, free: vertOk(env), push: false });
      return;
    }
    if (!t) return;
    _t.copy(t.p).sub(A.pos); const R = _t.length(), los = _t.divideScalar(R);
    const closure = -((t.v.x - A.vel.x) * los.x + (t.v.y - A.vel.y) * los.y + (t.v.z - A.vel.z) * los.z);
    A.forward(_f); const ata = Math.acos(clamp(_f.dot(los), -1, 1));
    let mode;
    if (R > 900) mode = 'intercept';
    else if (A.eas < (T.vmin ?? 80) * 1.05) mode = 'extend';                   // out of energy: unload, nose low, get speed back
    else if (T.tactic === 'energy' && (PL.bugT > 0 || (R < 650 && ata > 0.8 && PL.t - (PL.bugEnd || -99) > 6))) mode = 'bugout';   // don't turn with a better turner: run, then come back for a shot
    else if (R < 260 && closure > 25 && ata > 0.6) mode = 'lag';             // about to overshoot: lag and go up (high yo-yo)
    else if (R < (T.gun ? T.gun.range * 1.3 : 300) && ata < 0.5) mode = 'lead';
    else mode = 'pure';
    PL.mode = mode;
    if (mode === 'intercept') {   // collision-course lead on a far target
      const tgo = R / Math.max(40, closure + 30);
      _a.copy(t.p).addScaledVector(t.v, Math.min(6, tgo) * 0.7);
    } else if (mode === 'lead') {
      const tof = R / (T.gun ? T.gun.speed : 400); _a.copy(t.p).addScaledVector(t.v, tof * 1.2); _a.y += 0.5 * 9 * tof * tof;
    } else if (mode === 'lag') {
      _a.copy(t.p).addScaledVector(t.v, -1.0); _a.y += 40;
    } else if (mode === 'bugout') {
      if (!(PL.bugT > 0)) { PL.bugT = 7; say('EXTENDING'); }
      PL.bugT -= dt; if (R > 1300 || PL.bugT <= 0) { PL.bugT = 0; PL.bugEnd = PL.t; }
      const h = Math.hypot(los.x, los.z) || 1; _a.set(A.pos.x - los.x / h * 400, A.pos.y - 25, A.pos.z - los.z / h * 400);
    } else if (mode === 'extend') {
      const vh = Math.hypot(A.vel.x, A.vel.z) || 1; _a.set(A.pos.x + A.vel.x / vh * 300, A.pos.y - 60, A.pos.z + A.vel.z / vh * 300);
    } else _a.copy(t.p);
    _d.copy(_a).sub(A.pos).normalize();
    energyLimit(_d); diveLimit(_d, env);
    const sp = mode === 'intercept' ? T.fightTop : T.corner;
    fly(_d, dt, env, { speed: mode === 'bugout' ? T.fightTop + 40 : sp, ab: T.abFight && (A.eas < T.corner - 10 || mode === 'bugout' || mode === 'intercept' && R > 1200), g: mode === 'lead' ? Math.min(T.gfight, 5) : mode === 'extend' ? 1 : mode === 'bugout' ? 4 : T.gfight, k: mode === 'lead' ? 2.5 : 3, free: R < 1200 && vertOk(env), push: false });
  }

  // ------------------------------------------------------------------ carrier recovery
  // pattern waypoints in deck coordinates (lx starboard, lz aft of the ship's centre), heights above the deck
  // Case I (airai-polish): in at the INITIAL, astern and to starboard of the wake at 1.5 x pattern height, up the
  // starboard side, THE BREAK over the bow (a level ~4 g turn to port, power back, speedbrake), DOWNWIND at pattern
  // height, dirty at the ABEAM (gear, hook, full flaps), THE 180 well aft (game scale: the LSO's part wants ~700 m of
  // groove), then 'final' flies the turn into the groove. A section stays together to the break and breaks one at a
  // time, T.breakGap s apart; a jet still in the groove ahead extends the downwind. Straight in only when short of fuel.
  // Waypoints in deck coordinates (lx starboard, lz aft of the ship's centre), height factor, EAS.
  const PATTERN = [[90, 1500, 1.5, 150], [40, -260, 1.5, 150], [-430, -120, 1, 112], [-430, 260, 1, 104], [-430, 860, 0.95, 100]];
  const WPNAME = ['', 'INITIAL', 'THE BREAK', 'DOWNWIND', 'ABEAM', 'THE 180'];
  function dirtyUp() {
    if (A.gearCmd === 0 && A.eas < 140) { A.gearCmd = 1; say('GEAR DOWN'); }
    if (!A.hookCmd) { A.hookCmd = 1; say('HOOK DOWN'); }
    if (A.flapSel < 2 && A.eas < 112) { A.flapSel = 2; say('FLAPS FULL'); }
  }
  // which side to fly the downwind and the 180 (TERRAIN: an island off the ship's port quarter): the left-hand pattern
  // unless the right-hand one is clearly lower; the pattern height rises to clear what is left under it
  function patSide(c, env) {
    PL.patSide = 1; PL.patLift = 0; if (!env.terrain) return;
    let best = 1, bh = 1e9;
    for (const K of [1, -1]) {
      let h = -1e9;
      for (let lz = -300; lz <= 1400; lz += 100) for (const lx0 of [-520, -430, -330, -220, -110]) {
        if (lx0 > -300 && lz < 700) continue;   // inside the downwind only where the 180 swings in
        world(c, A.landX + K * (lx0 - A.landX), lz, _k); h = Math.max(h, env.terrain(_k.x, _k.z));
      }
      if (h < bh - 5) { bh = h; best = K; }
    }
    PL.patSide = best; PL.patLift = Math.max(0, bh + 55 - (c.deck + T.patAlt));
    if (best < 0 || PL.patLift > 0) say(`${best < 0 ? 'RIGHT-HAND PATTERN' : 'PATTERN'}${PL.patLift > 0 ? '  HIGH ' + PL.patLift.toFixed(0) : ''}  (TERRAIN)`);
  }
  function recover(dt, env) {
    const c = env.carrier && env.carrier();
    if (!c) { orbit(dt, env, PL.anchor || A.pos, T.capEAS); return; }
    const [lx, lz] = deck(c, A.pos.x, A.pos.z), aimZ = DK.WIRES[2] - A.P.HOOK_TIP[2] - (T.hookLead ?? 20);   // the hook hangs ~3.4 m under the CG at ~7° nose up and a wire catches it within 0.45 m of the deck: aiming the CG's glideslope this far up the deck takes the 3 wire
    const R = lz - aimZ, hdgS = -c.yaw, hdgA = hdgOf(A.vel), herr = wrap(hdgA - hdgS);   // ship's bow along -z: heading -yaw
    const patH = c.deck + T.patAlt + (PL.patLift || 0);
    if (PL.state === 'rtb') {
      // short of fuel and already behind the ship, roughly lined up: straight in; else the break
      if (A.fuel < (T.bingo || 1e9) * 0.45 && R > 1300 && R < 3200 && Math.abs(lx - A.landX) < R * 0.45 && Math.abs(herr) < 1.0) { set('final', 'STRAIGHT IN'); return; }
      if (PL.wp === 0) { PL.wp = 1; patSide(c, env); }
      const K = PL.patSide || 1, mx = v => A.landX + K * (v - A.landX), mlx = mx(lx);   // mirrored for a right-hand pattern
      if (PL.wp <= 2 && PL.lead && PL.leadOk() && PL.lead.state === 'rtb') { formation(dt, env); PL.wp = Math.max(PL.wp, PL.lead.wp); return; }   // on the lead's wing to the break
      if (PL.wp === 6) {   // the 180: a steady descending left turn whose radius puts the roll-out on the centreline
        // left turn through b (rad) from radius rho rolls out at lx + rho (1 - cos b): rho for lx -> landX; the bank for
        // that radius at this TAS; the height comes down from pattern height to the glideslope as the turn winds off
        let b = K * herr; if (b < -0.3) b += 2 * Math.PI;
        const V = Math.max(A.tas, 20), rho = clamp((A.landX - mlx) / Math.max(0.08, 1 - Math.cos(b)), 60, 1200);
        const phi = clamp(Math.atan(V * V / (9 * rho)), 0.12, 0.72);
        const yGS = c.deck + A.P.REST_H + Math.tan(T.gs) * Math.max(0, R), yW = Math.min(patH, yGS + Math.max(0, patH - yGS) * clamp(b / Math.PI, 0, 1));
        const vyDes = clamp(0.25 * (yW - A.pos.y) - 1, -6, 0.5);   // down to the glideslope, never a climb in the turn (slow, dirty, a TF30)
        // AoA protection: past on-speed + 6° the pull eases and the bank comes off (the TF30 stalls at high AoA, and a
        // stalled pair at idle in a slow turn is how the Tomcat went in)
        const over = A.alpha - (T.aoaApp + 6 * D2R), phiA = over > 0 ? phi * clamp(1 - over * 4, 0.5, 1) : phi;
        let nC = Math.cos(A.attitude().pitch) / Math.cos(phiA) + 0.12 * (vyDes - A.vel.y); if (over > 0) nC = Math.min(nC, Math.max(0.7, A.nz - over * 2));
        FD.ctl.roll = FD.rollFor(-phiA * K); FD.ctl.pitch = FD.pitchFor(nC, dt);
        FD.ctl.yaw = clamp(A.beta * 3, -0.6, 0.6);
        dirtyUp(); speedOnFinal(dt, A.surf.flap > 0.85 && A.gear > 0.95, 6);
        // terrain: the turn is flown low and slow; anything in the next few seconds of path inside 35 m: go round, high
        if (env.terrain) for (const s of [2, 4, 6]) { const g = env.terrain(A.pos.x + A.vel.x * s, A.pos.z + A.vel.z * s); if (g > 2 && g > A.pos.y - 35) { PL.waveoffs++; set('waveoff', 'TERRAIN IN THE TURN'); return; } }
        if (b < 0.2 || b > 2 * Math.PI - 0.5) set('final', Math.abs(lx - A.landX) < 40 ? 'IN THE GROOVE' : 'OVERSHOT THE GROOVE');
        return;
      }
      const w = PATTERN[PL.wp - 1];
      let wz = w[1];
      if (PL.wp === 5 && env.traffic) for (const o of env.traffic(PL)) if (o !== PL && (o.state === 'final' || (o.state === 'rtb' && o.wp === 6))) wz = Math.max(wz, Math.min(1350, deck(c, o.A.pos.x, o.A.pos.z)[1] + 520));   // a jet turning in or in the groove ahead: extend downwind
      world(c, mx(w[0]), wz, _t); _t.y = c.deck + T.patAlt * w[2] + (PL.patLift || 0);
      _t.x += (c.vx || 0) * 8; _t.z += (c.vz || 0) * 8;   // the ship moves: aim where the waypoint will be
      let hold = false;   // at the break with another jet just broken ahead: carry on up the deck heading, then break
      if (PL.wp === 2 && lz < -150 && env.traffic) for (const o of env.traffic(PL)) if (o !== PL && o.t - o.brokeAt < (T.breakGap ?? 11)) hold = true;
      if (hold) FD.dirHdg(hdgS, clamp((_t.y - A.pos.y) * 0.01, -0.1, 0.1), _d); else dirTo(_t.x, _t.y, _t.z, 0.25);
      const brk = PL.wp === 3;
      fly(_d, dt, env, { speed: PL.wp >= 4 ? vApproach() + (PL.wp === 4 ? 16 : 12) : w[3], g: brk ? 4.2 : 3, k: brk ? 2.4 : 1.6, ab: false });
      A.brakeCmd = A.eas > w[3] + 12 ? 1 : 0;
      if (PL.wp >= 4) dirtyUp();
      const dh = Math.hypot(_t.x - A.pos.x, _t.z - A.pos.z);
      let next = false;
      if (PL.wp === 1) next = dh < 300 || (lz > 0 && lz < w[1] && mlx > -150 && mlx < 260 && Math.abs(herr) < 0.6);
      else if (PL.wp === 2) next = !hold && (lz < -150 || dh < 150);
      else if (PL.wp === 3) next = dh < 220 || (lz > w[1] - 40 && mlx < -250);
      else if (PL.wp === 4) next = lz > wz;
      else next = lz > wz - 30;
      if (next) {
        if (PL.wp === 2) PL.brokeAt = PL.t;
        if (PL.wp >= 5) { PL.wp = 6; say(WPNAME[5]); return; }
        say(WPNAME[PL.wp]); PL.wp++;
      }
      return;
    }
    // ---- final: dirty up, carrot onto the centreline, then the LSO controller
    if (A.gearCmd === 0 && A.eas < 140) { A.gearCmd = 1; say('GEAR DOWN'); }
    if (!A.hookCmd) { A.hookCmd = 1; say('HOOK DOWN'); }
    if (A.flapSel < 2 && A.eas < 112) { A.flapSel = 2; say('FLAPS FULL'); }
    const clos = Math.max(15, A.tas - (c.speed || 0));   // closure along the deck
    const yGS = c.deck + A.P.REST_H + Math.tan(T.gs) * Math.max(0, R), yDes = Math.min(yGS, patH + 10);
    const dirty = A.surf.flap > 0.85 && A.gear > 0.95;
    // lateral and vertical errors, relative velocity in deck axes
    const co = Math.cos(c.yaw), si = Math.sin(c.yaw), rvx = A.vel.x - (c.vx || 0), rvz = A.vel.z - (c.vz || 0);
    const vlat = rvx * co - rvz * si, vlong = rvx * si + rvz * co;   // + starboard, + aft
    const latErr = lx - A.landX, hErr = A.pos.y - yGS;
    PL.lso = { R, latErr, hErr, aoa: A.alpha / D2R, eas: A.eas };
    // wave-off: out of parameters in close, or the deck is swinging, or the landing area is foul (a jet still in the wires)
    if (R < 320 && R > 15 && env.deckFoul && env.deckFoul(PL)) { PL.waveoffs++; set('waveoff', 'FOUL DECK'); return; }
    if (R < 320 && R > 15) {
      const tol = R < 120 ? 1 : 1.6;
      if (Math.abs(latErr) > 5 * tol || Math.abs(hErr) > 5 * tol || Math.abs(c.w || 0) > 0.03 || !dirty || A.alpha > 15 * D2R || A.alpha < 5 * D2R) {
        PL.why = `R ${R.toFixed(0)} lat ${latErr.toFixed(1)} h ${hErr.toFixed(1)} aoa ${(A.alpha / D2R).toFixed(1)} dirty ${dirty}`;
        PL.waveoffs++; set('waveoff', PL.why); return;
      }
    }
    if (R < -10 && !A.onGround) { PL.waveoffs++; set('waveoff', 'OVERFLEW THE DECK'); return; }
    if (R > 700) PL.ball = false;
    if (R > 700 || Math.abs(latErr) > 40 || Math.abs(herr) > 0.3) {
      if (R < 450) { PL.waveoffs++; set('waveoff', `NOT LINED UP  lat ${latErr.toFixed(0)} hdg ${(herr / D2R).toFixed(0)}°`); return; }
      // carrot: a point on the centreline ahead of us, at the glideslope height
      const L = clamp(R * 0.3, 220, 500), zC = Math.max(aimZ, lz - L);
      world(c, A.landX, zC, _t); _t.x += (c.vx || 0) * (L / clos); _t.z += (c.vz || 0) * (L / clos);
      _d.set(_t.x - A.pos.x, 0, _t.z - A.pos.z).normalize();
      const vy = -Math.tan(T.gs) * clos + 0.2 * (yDes - A.pos.y), gam = Math.asin(clamp(vy / Math.max(A.tas, 20), -0.2, 0.15));
      _d.multiplyScalar(Math.cos(gam)); _d.y = Math.sin(gam);
      FD.steer(_d, dt, { gmax: 2.5, k: 1.2 });
      speedOnFinal(dt, dirty);
      return;
    }
    // the last 700 m: stick flies the glideslope (vertical speed), throttle holds the AoA, bank holds the lineup
    if (!PL.ball) { PL.ball = true; if (T.ballCall) say(`BALL  ${(A.fuel * 2.2046 / 1000).toFixed(1)}`); }   // "Tomcat ball, 4.2": the meatball in sight, and his fuel
    const vyDes = -Math.tan(T.gs) * clos + 0.25 * (yGS - A.pos.y);
    FD.ctl.pitch = FD.pitchFor(Math.cos(A.attitude().pitch) + 0.12 * (vyDes - A.vel.y), dt);
    const rollCmd = clamp(-latErr * 0.012 - vlat * 0.05, -0.35, 0.35);
    FD.ctl.roll = clamp((rollCmd - A.attitude().roll) * 1.5 - A.w.x * 0.2, -1, 1);
    FD.ctl.yaw = clamp(A.beta * 3 + herr * 0, -0.6, 0.6);
    speedOnFinal(dt, dirty);
    void vlong;
  }
  // on-speed: the EAS that gives the approach AoA at this weight, flaps full, gear down (what the AoA indexer shows)
  const _cfg = { flap: 1, lef: 0.85, gear: 1, brake: 0, stab: 0, rud: 0, stores: 0 }, _co = {};
  function vApproach() {
    const K = A.P.aeroAt ? A.P.aeroAt(A) : A.P.aero; _cfg.stores = A.P.storeDrag(A);
    const CL = aeroCoeffs(K, T.aoaApp, 0, 0.2, _cfg, _co).CL;
    return Math.sqrt(2 * A.mass * 9 * Math.cos(T.gs) / (1.225 * A.P.S * CL));
  }
  // throttle: speed while configuring, then on-speed held by EAS with the AoA as the fine trim; the TF30 spools slowly,
  // so the integrator is generous and the AoA term leads
  function speedOnFinal(dt, dirty, extra = 0) {
    const va = vApproach(), want = (dirty ? va : Math.max(va + 12, Math.min(A.eas, 112) - 4)) + extra;
    const e = want - A.eas, aerr = dirty ? A.alpha - T.aoaApp : 0;
    PL.thrI = clamp((PL.thrI ?? 0.6) + (e * 0.02 + aerr * 0.6) * dt, 0.05, 0.79);
    const tw = clamp(PL.thrI + e * 0.04 + aerr * 2.5, 0, 0.95);
    FD.thr += clamp(tw - FD.thr, -1.2 * dt, 1.2 * dt); FD.setThrottle(FD.thr); PL.vapp = va;   // (airai-polish) no slams: a TF30 slammed at high AoA stalls
    A.brakeCmd = e < -12 && !dirty ? 1 : 0;   // speedbrake out when well fast on the way in
  }
  // wave-off: power up, wings level, stop the sink and climb gently on AoA (never past on-speed + 3°: a slow TF30
  // is still spooling), then up and away along the deck heading and round the pattern
  function waveoff(dt, env) {
    const c = env.carrier && env.carrier();
    // (airai-polish) MIL, as the TF30 jets fly it; burner only while still sinking or slow in the first seconds
    const wt = PL.stateT < 3 && (A.vel.y < -1 || A.eas < (PL.vapp || 70)) ? 1 : 0.8; FD.setThrottle(wt); FD.thr = wt; PL.thrI = 0.79;
    if (PL.stateT < 6 || A.eas < 105) {
      const vyDes = PL.stateT < 2 ? 0.5 : 3;
      let n = Math.cos(A.attitude().pitch) + 0.1 * (vyDes - A.vel.y);
      if (A.alpha > T.aoaApp + 3 * D2R) n = Math.min(n, A.nz - 0.15);
      FD.ctl.roll = FD.rollFor(0); FD.ctl.pitch = FD.pitchFor(clamp(n, 0.6, 1.6), dt); FD.ctl.yaw = clamp(A.beta * 3, -0.6, 0.6);
    } else {
      FD.dirHdg(c ? -c.yaw : hdgOf(A.vel), 0.12, _d);
      fly(_d, dt, env, { g: 2.5, k: 1.2 }); FD.setThrottle(0.8);
    }
    if (PL.stateT > 4 && A.flapSel === 2 && A.vel.y > 1) A.flapSel = 1;
    // (airai-polish) the bolter / wave-off pattern is flown dirty (gear and hook down, half flaps): upwind, then a left
    // turn to the downwind and round again
    if (c && A.pos.y > c.deck + 60 && PL.stateT > 8 && A.eas > 105) { A.flapSel = 1; set('rtb', 'PATTERN'); PL.wp = 3; }
  }

  // ------------------------------------------------------------------ orbit / CAP
  function orbit(dt, env, anc, speed, R = T.capR, alt = T.capAlt) {
    const a = Math.atan2(A.pos.z - anc.z, A.pos.x - anc.x), d = Math.hypot(A.pos.x - anc.x, A.pos.z - anc.z);
    const dir = PL.orbitDir || 1, lead = d > R * 1.6 ? 0 : 0.55;
    const tx = d > R * 1.6 ? anc.x : anc.x + Math.cos(a + dir * lead) * R, tz = d > R * 1.6 ? anc.z : anc.z + Math.sin(a + dir * lead) * R;
    const floor = env.terrain ? Math.max(env.terrain(anc.x, anc.z), 0) : 0;
    dirTo(tx, Math.max(anc.y || 0, floor) + alt, tz, 0.3);
    fly(_d, dt, env, { speed, g: 3.5 });
  }

  // ------------------------------------------------------------------ CAP racetrack (airai-polish)
  // Two legs along the threat axis (PL.capAxis, a heading; the inbound leg points the radar at the threat) joined by
  // half circles of ~0.8 capR, the anchor in the middle; followed with a carrot a few seconds ahead of the nearest
  // point on the track (so the turns at the ends are flown at a steady bank, not as corners).
  function racetrack(dt, env, anc, speed) {
    const R = T.capR * 0.82, L = T.capLeg ?? 700, ax = PL.capAxis || 0, sg = PL.orbitDir || 1;
    const ux = Math.sin(ax), uz = -Math.cos(ax), vx = Math.cos(ax) * sg, vz = Math.sin(ax) * sg;
    const dx = A.pos.x - anc.x, dz = A.pos.z - anc.z, pa = dx * ux + dz * uz, pb = dx * vx + dz * vz;
    const s = trackS(pa, pb, L, R); trackPoint(s, L, R, _k);
    const off = Math.hypot(pa - _k.x, pb - _k.z);
    trackPoint(s + Math.max(160, A.tas * 3) + Math.min(off, 600) * 0.5, L, R, _k);
    PL.leg = s < L ? 'INBOUND' : s < L + Math.PI * R ? 'TURN' : s < 2 * L + Math.PI * R ? 'OUTBOUND' : 'TURN';
    const floor = env.terrain ? Math.max(env.terrain(anc.x, anc.z), 0) : 0;
    dirTo(anc.x + _k.x * ux + _k.z * vx, Math.max(anc.y || 0, floor) + T.capAlt, anc.z + _k.x * uz + _k.z * vz, 0.3);
    fly(_d, dt, env, { speed, g: 3.5 });
  }

  // ------------------------------------------------------------------ the section (airai-polish)
  // A wingman (PL.lead set) keeps station in the lead's axes (T.slot: right, up, aft), so in a turn he stays on the
  // lead's plane, as in parade. Far off he rendezvouses: a cut-off point ahead of the lead, 20 m/s faster. Close in,
  // the stick flies at a carrot 1.6 s ahead of the slot along the lead's path and the throttle matches the lead's power
  // plus the along-track error and closure (the TF30 is slow: the speedbrake takes off an overrun).
  PL.leadOk = () => { const L = PL.lead; return !!L && !L.gone && !L.A.dead && (L.state === 'climb' || L.state === 'cap' || (L.state === 'rtb' && L.wp <= 2 && L.wp > 0)); };
  function formation(dt, env) {
    const L = PL.lead, LA = L.A;
    _s.set(T.slot[0], T.slot[1], T.slot[2]).applyQuaternion(LA.q).add(LA.pos);
    const vl = LA.vel.length() || 1; _lv.copy(LA.vel).divideScalar(vl);
    _t.copy(_s).sub(A.pos); const dist = _t.length(), along = _t.dot(_lv), k = A.eas / Math.max(A.tas, 1);
    if (dist > 450) {
      const tgo = clamp(dist / 70, 1, 9); _a.copy(_s).addScaledVector(LA.vel, tgo);
      _d.copy(_a).sub(A.pos).normalize(); PL.form = 'JOIN';
      fly(_d, dt, env, { speed: Math.min(T.fightTop, LA.eas + 22), g: 4, k: 1.4, ab: false }); A.brakeCmd = 0;
      return dist;
    }
    PL.form = dist < 30 ? 'PARADE' : 'CLOSING';
    _a.copy(_s).addScaledVector(LA.vel, 1.6); _d.copy(_a).sub(A.pos);
    _t.copy(LA.pos).sub(A.pos); const dl = _t.length();
    if (dl < 16) _d.addScaledVector(_t, -(16 - dl) * 0.6 / dl);   // never into the lead himself
    _d.normalize();
    const clos = (A.vel.x - LA.vel.x) * _lv.x + (A.vel.y - LA.vel.y) * _lv.y + (A.vel.z - LA.vel.z) * _lv.z;   // + = gaining on the slot
    PL.fI = clamp((PL.fI || 0) + along * dt * 0.03, -12, 12);   // a slow trim on the along-track error (a steady lag or lead)
    const easCmd = LA.eas + clamp((along * 0.2 + PL.fI - clos * 0.9) * k, -25, 30);
    if (L.FD) FD.ti += (L.FD.thr - FD.ti) * Math.min(1, dt * 0.6);   // match the lead's power, then trim
    fly(_d, dt, env, { speed: easCmd, g: 5, k: 2.2, ab: along > 150 });
    A.brakeCmd = along < -10 && clos > 1.5 ? 1 : 0;
    return dist;
  }

  // ------------------------------------------------------------------ per frame
  PL.update = (dt, env) => {
    PL.t += dt; PL.stateT += dt; PL.defT = (PL.defT || 0) - dt;
    if (A.dead) { if (PL.state !== 'dead') set('dead', A.dead); return A.step(0, FD.ctl, env); }
    // think: targets, threats, fuel
    PL.thinkT = (PL.thinkT || 0) - dt;
    const airborne = ['climb', 'cap', 'fight', 'patrol'].includes(PL.state);
    if (PL.thinkT <= 0) {
      PL.thinkT = 0.25;
      if (airborne && T.radar) {
        const t = pickTarget(env); if (t !== PL.tgt) { PL.tgt = t; if (t) say(`CONTACT ${t.type || ''} ${t.p.distanceTo(A.pos).toFixed(0)} m`); }
        const th = pickThreat(env);
        if (th) { A.forward(_f); _t.copy(th.p).sub(A.pos); const behind = th.kind === 'aam' || (_f.dot(_t) / _t.length() < 0.5 && _t.length() < 550); if (behind) { if (PL.defT <= 0) say(th.kind === 'aam' ? 'MISSILE  BREAK' : 'BREAK'); PL.defT = Math.max(PL.defT, 1.2); } }
        PL.threat = th;
        if ((PL.tgt || PL.threat) && PL.state !== 'climb') set('fight');
        if (!PL.tgt && !PL.threat && PL.state === 'fight') set('cap');
      }
      const wpnLeft = !T.weapons.length || A.stores.some(s => s.on) || (T.gun && A.gun > 0);
      if (T.bingo && airborne && A.fuel < T.bingo) { PL.tgt = null; PL.threat = null; set('rtb', `BINGO ${A.fuel.toFixed(0)} kg`); }
      else if (T.bingo && airborne && !wpnLeft && PL.state !== 'climb') { PL.tgt = null; set('rtb', 'WINCHESTER'); }
      else if (PL.lead && PL.state === 'cap' && !PL.lead.gone && PL.lead.state === 'rtb' && PL.lead.wp <= 2) set('rtb', 'WITH LEAD');   // the section comes home together
      if (PL.lead && (PL.lead.gone || PL.lead.A.dead)) { if (PL.lead.wing === PL) PL.lead.wing = null; PL.lead = null; say('LEAD LOST  -  SINGLE'); }
    }
    const anc = PL.anchor || (env.anchor && env.anchor()) || A.pos;
    switch (PL.state) {
      case 'cat': {
        FD.ctl.pitch = 0; FD.ctl.roll = 0; FD.ctl.yaw = 0;
        if (A.catClear === false) PL.runT = 0; else PL.runT = (PL.runT || 0) + dt;   // tensioned and waiting for the shooter: idle
        FD.thr = PL.runT > 0.6 ? 1 : 0.3; FD.setThrottle(FD.thr);
        if (!A.cat) set('climb');
        break;
      }
      case 'climb': {
        if (A.gearCmd && A.vel.y > 1.5 && PL.stateT > 1.5) { A.gearCmd = 0; say('GEAR UP'); }
        if (A.flapSel && A.eas > 95 && PL.stateT > 3) { A.flapSel = 0; say('FLAPS UP'); }
        const floor = env.terrain ? Math.max(0, env.terrain(anc.x, anc.z)) : 0;
        if (PL.stateT > 6 && PL.lead && PL.leadOk() && A.gearCmd === 0) {   // the wingman: join on the lead
          const d = formation(dt, env);
          if (d < 200 && A.pos.y > Math.max(anc.y || 0, floor) + T.capAlt * 0.5) set('cap', 'JOINED');
          break;
        }
        const gam = PL.stateT < 4 ? 0.16 : 0.22, hdg = PL.stateT < 6 ? hdgOf(A.vel) : Math.atan2(anc.x - A.pos.x, -(anc.z - A.pos.z));
        FD.dirHdg(PL.stateT < 6 ? hdg : hdgOf(A.vel) + clamp(wrap(hdg - hdgOf(A.vel)), -0.6, 0.6), gam, _d);
        fly(_d, dt, env, { speed: T.climbEAS, ab: PL.stateT < 6, g: 3 });
        if (A.pos.y > Math.max(anc.y || 0, floor) + T.capAlt * 0.75 && PL.stateT > 6) set('cap');
        break;
      }
      case 'cap':
        if (PL.lead && PL.leadOk()) formation(dt, env);
        else if (T.racetrack) racetrack(dt, env, anc, T.capEAS);
        else orbit(dt, env, anc, T.capEAS);
        break;
      case 'patrol': orbit(dt, env, anc, T.capEAS); break;
      case 'fight': fight(dt, env); weapons(dt, env); break;
      case 'strike': {
        const s = PL.strike; if (!s) { set('patrol'); break; }
        dirTo(s.x, s.y, s.z, 0.8); fly(_d, dt, env, { speed: T.fightTop, g: T.gmax, guard: Math.hypot(s.x - A.pos.x, s.z - A.pos.z) > 400 });
        break;
      }
      case 'rtb': case 'final': recover(dt, env); break;
      case 'waveoff': waveoff(dt, env); break;
      case 'bolter': {
        FD.setThrottle(1); FD.thr = 1; FD.ctl.roll = FD.rollFor(0); FD.ctl.pitch = A.onGround ? 0.25 : FD.pitchFor(1.4, dt);
        if (!A.onGround && PL.stateT > 1) { PL.bolters++; set('waveoff', 'BOLTER'); }
        break;
      }
      case 'trapped': {
        FD.ctl.pitch = 0; FD.ctl.roll = 0; FD.ctl.yaw = 0;
        const t = A.wire && A.wire.held === 0 ? 0.8 : 0; FD.setThrottle(t); FD.ctl.brakeL = FD.ctl.brakeR = A.wire ? 0 : 1;
        if (!A.wire && A.onGround && PL.stateT > 1.5 && !PL.recovered) { PL.recovered = true; say('RECOVERED'); }
        break;
      }
    }
    // where the crew look (the model turns their heads): the bandit, the threat, the lead (or now and then the
    // wingman), the ship in the pattern; null = the pilot's own scan
    const cv = (PL.state === 'rtb' || PL.state === 'final') && env.carrier ? env.carrier() : null;
    PL.look = PL.threat && PL.defT > 0 ? PL.threat.p : PL.tgt && PL.state === 'fight' ? PL.tgt.p
      : PL.lead && PL.leadOk() && (PL.state === 'cap' || PL.state === 'climb' || PL.state === 'rtb') ? PL.lead.A.pos
      : PL.wing && !PL.wing.gone && PL.t % 11 < 2.5 ? PL.wing.A.pos
      : cv ? _look.set(cv.x, cv.deck, cv.z) : null;
    const ev = A.step(dt, FD.ctl, env);
    for (const e of ev) {
      if (e.e === 'catshot') say('CAT SHOT');
      else if (e.e === 'catend') say(`AIRBORNE  ${(A.eas * 1.944).toFixed(0)} KEAS`);
      else if (e.e === 'trap') { PL.trapped = e; set('trapped', `${e.wire} WIRE`); }
      else if (e.e === 'touchdown' && (PL.state === 'final' || PL.state === 'trapped')) { PL.tdT = PL.t; if (!PL.td) PL.td = { vy: A.vel.y, eas: A.eas }; }
      else if (e.e === 'overstress') say(`OVER-G ${e.g.toFixed(1)}`);
      else if (e.e === 'compstall') say('COMPRESSOR STALL');
    }
    // touched down on the deck with no wire: bolter (power is already coming up)
    if (PL.state === 'final' && A.onGround && PL.tdT > 0 && PL.t - PL.tdT > 0.35 && !A.wire) set('bolter');
    if (PL.state === 'final' && A.onGround) { FD.setThrottle(0.8); }   // MIL on touchdown, as the Navy flies it
    return ev;
  };
  return PL;
}
