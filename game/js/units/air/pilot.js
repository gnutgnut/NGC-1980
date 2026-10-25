// AI pilots: behaviours that fly an airframe sim through the flight director (fd.js) - stick, pedals and throttle
// only. Pure (three.js maths); the world is reached through the `world` interface below, so the same pilots fly in
// the game (airwar.js), the dev page (game/dev/air.js) and node benches (tools/airbench.mjs).
//
//   FIGHTER (F-14A TOMCAT for us, RW-4 SHRIKE for the RUNAWAY):
//     cat (run-up, shot) -> climb-out (gear, flaps) -> CAP orbit over the anchor -> intercept a contact (BVR:
//     AIM-54A / AIM-7F with radar support, crank to slow the closure) -> merge (BFM: lead / pure / lag pursuit,
//     AIM-9L inside the envelope, guns on a lead solution, a break turn when someone sits behind you, a beam turn and
//     decoys against missiles) -> bingo or winchester -> RTB: marshal astern, configure (gear, full flaps, hook),
//     straight-in on a 3.5° glideslope (stick for the slope, throttle for on-speed AoA, roll for line-up),
//     trap or bolter / wave-off and go round -> recovered (struck below).
//   REAPER: cat -> climb to the orbit altitude -> orbit the area it is told to watch, spot (tell the world what it
//     sees), lase and fire Hellfires at what it is cleared to hit -> RTB and trap the same way, slowly.
//
// world = {
//   time, env(u) -> airframe env, carrier(side) -> { x, z, yaw, deck, vx, vz, w } | null, catClear(side) -> bool,
//   anchor(u) -> { x, y, z } | null,                  the point to cover / watch
//   contacts(u) -> [{ p, v, r, kind, ref, threat }], enemy air the unit knows about (radar, datalink, eyes)
//   groundTargets(u) -> [{ p, v, r, kind, ref }],     for the Reaper
//   incoming(u) -> [missile],                        missiles guided at the unit
//   fireMissile(u, type, tgt, station) -> missile, fireGun(u, dir), decoy(u, kind), say(u, text, kind), spotted(u, list)
// }
import * as THREE from 'three';
import { createFD } from './fd.js';
import { inEnvelope, MSL } from './missiles.js';
import { DECKOPS } from './airframe.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const D2R = Math.PI / 180, KT = 1.94384;
const _d = new THREE.Vector3(), _r = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3(), _l = new THREE.Vector3(), _g = new THREE.Vector3();
const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };

// per-type tactics and carrier numbers (EAS m/s; AoA rad). Tomcat: on-speed 15 units ~10.5° (UNVERIFIED conversion)
export const DOCTRINE = {
  TOMCAT: { cap: 150, capAlt: 220, capR: 650, corner: 170, fightMax: 6.5, amax: 0.36, onSpeedA: 10.5 * D2R, appEAS: 66, landX: -5, aimWire: 3, bingo: 1900, radar: 3800, gimbal: 65 * D2R, gun: true },
  SHRIKE: { cap: 165, capAlt: 200, capR: 600, corner: 175, fightMax: 11, amax: 0.7, onSpeedA: 9 * D2R, appEAS: 64, landX: -2.5, aimWire: 3, bingo: 420, radar: 2600, gimbal: 70 * D2R, gun: true },
  REAPER: { cap: 75, capAlt: 260, capR: 420, corner: 80, fightMax: 2.5, amax: 0.2, onSpeedA: 5 * D2R, appEAS: 42, landX: -2.5, aimWire: 3, bingo: 350, radar: 1800, gimbal: 100 * D2R, gun: false },
};

export function createPilot(u, world, o = {}) {
  const A = u.A, D = DOCTRINE[A.P.name], side = u.side;
  const fd = createFD(A, { gmax: o.gmax ?? D.fightMax, amax: D.amax });
  const B = {
    fd, D, state: o.state || 'cat', t: 0, target: null, msg: '', shots: {}, lastShot: -99, lockT: 0, gunT: 0, waveoffs: 0, traps: 0, bolters: 0,
    tel: {},   // telemetry for the dev page / tests
  };
  u.pilot = B;
  A.landX = D.landX;
  const env = () => world.env(u);
  const say = (t, k) => world.say && world.say(u, t, k);
  const go = s => { if (B.state !== s) { B.prev = B.state; B.state = s; B.t = 0; B.sub = null; } };
  B.go = go;
  // ------------------------------------------------------------------ helpers
  const agl = () => A.pos.y - Math.max(0, env().groundY(A.pos.x, A.pos.z));
  // terrain look-ahead: if flying on for 4 s would come within `clr` of the ground, climb instead (returns true)
  function terrainGuard(d, clr = 45) {
    const V = Math.max(A.tas, 20), g = env().groundY;
    let worst = -1e9;
    for (let k = 1; k <= 8; k++) { const s = k * 0.5 * V, x = A.pos.x + A.vel.x / V * s, z = A.pos.z + A.vel.z / V * s, y = A.pos.y + A.vel.y / V * s; worst = Math.max(worst, g(x, z) + clr - y); }
    if (worst > 0) { const gam = clamp(0.15 + worst * 0.01, 0.15, 0.6), h = Math.atan2(A.vel.x, -A.vel.z); fd.dirHdg(h, gam, d); B.terrain = true; return true; }
    B.terrain = false; return false;
  }
  function carrierLocal(c, x, z) { const dx = x - c.x, dz = z - c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw); return [dx * co - dz * si, dx * si + dz * co]; }
  function carrierWorld(c, lx, lz, out) { const co = Math.cos(c.yaw), si = Math.sin(c.yaw); return out.set(c.x + lx * co + lz * si, 0, c.z - lx * si + lz * co); }
  function stores(w) { return A.stores.filter(s => s.on && s.w === w); }
  function hasWeapons() { return A.stores.some(s => s.on) || (D.gun && A.gun > 10); }
  function fly(d, eas, opts = {}) { if (!opts.noGuard) terrainGuard(d, opts.clr); return fd.steer(d, B.dt, { eas, ab: opts.ab ?? true, gmax: opts.gmax ?? D.fightMax, k: opts.k ?? 1.6 }); }
  function apply() { for (let k = 0; k < A.eng.length; k++) if (A.eng[k].stalled) fd.ctl.throttle[k] = 0; }

  // ------------------------------------------------------------------ phases
  B.update = (dt) => {
    B.dt = dt; B.t += dt;
    const E = env();
    if (A.dead) return fd.ctl;
    // TF30 compressor stall: idle that engine, unload the wing, let it clear
    if (A.eng.some(e => e.stalled)) { fd.amax = Math.min(D.amax, 0.2); if (!B.stallSaid) { B.stallSaid = true; say(`${u.call}: COMPRESSOR STALL  -  ${A.eng[0].stalled ? 'LEFT' : 'RIGHT'} ENGINE`, 'bad'); } } else { fd.amax = D.amax; B.stallSaid = false; }
    const S = B.state;
    if (S === 'cat') phaseCat(dt, E);
    else if (S === 'climb') phaseClimb(dt);
    else if (S === 'cap') phaseCap(dt);
    else if (S === 'intercept' || S === 'merge') phaseFight(dt);
    else if (S === 'orbit') phaseOrbit(dt);
    else if (S === 'rtb') phaseRtb(dt, E);
    else if (S === 'final') phaseFinal(dt, E);
    else if (S === 'rollout') phaseRollout(dt);
    else if (S === 'goaround') phaseGoAround(dt);
    else if (S === 'transit') phaseTransit(dt);
    else if (S === 'stowed') { fd.setThrottle(0); }
    // anywhere airborne: missiles inbound -> defend (overrides the controls this frame)
    if (!A.onGround && S !== 'cat' && S !== 'final' && S !== 'rollout' && S !== 'stowed') defendMissiles(dt);
    // fuel state
    if (!B.bingo && A.fuel < D.bingo && !A.onGround && ['cap', 'intercept', 'merge', 'orbit', 'climb', 'transit'].includes(B.state)) { B.bingo = true; say(`${u.call}: BINGO FUEL  -  RTB`); go('rtb'); }
    apply();
    B.tel = { state: B.state, eas: A.eas * KT, alt: A.pos.y, nz: A.nz, aoa: A.alpha / D2R, fuel: A.fuel, sweep: A.sweep, tgt: B.target ? B.target.kind : null, terrain: B.terrain };
    return fd.ctl;
  };

  // catapult: run up, hold for the shot, then fly it off the bow
  function phaseCat(dt, E) {
    if (!A.cat && A.onGround) { if (!A.attachCat(E)) return; }
    if (A.cat) {
      A.catClear = world.catClear ? world.catClear(side) : true;
      fd.ctl.pitch = 0; fd.ctl.roll = 0; fd.ctl.yaw = 0;
      fd.setThrottle(A.P.name === 'REAPER' ? 1 : B.t > 1 ? 1 : 0.8);   // MIL, then zone 5 (Tomcat's cat shot)
      return;
    }
    go('climb'); fd.thr = 1;
  }
  function phaseClimb(dt) {
    // 12° nose-up off the bow, wings level; gear up with a positive climb, flaps up at 180 KEAS (Tomcat 225 limit)
    const att = A.attitude();
    if (A.vel.y > 2 && A.pos.y > (env().carrier()?.deck ?? 0) + 12) A.gearCmd = 0;
    if (A.eas > 90 || (A.P.name === 'REAPER' && A.eas > 50)) A.flapSel = 0;
    const want = A.P.name === 'REAPER' ? 0.12 : 0.21, hdg = A.heading();
    fly(fd.dirHdg(hdg, Math.min(want, B.t * 0.08 + 0.05), _d), A.P.name === 'REAPER' ? 60 : 150, { gmax: 3, noGuard: B.t < 4 });
    if (A.gear < 0.05 && A.flapSel === 0 && (agl() > 90 || B.t > 20)) { go(A.P.name === 'REAPER' ? 'orbit' : 'cap'); A.hookCmd = 0; }
  }
  // CAP: a wide orbit over the anchor, looking for trade on the radar
  function phaseCap(dt) {
    const a = world.anchor(u) || A.pos;
    const R = D.capR + (u.slot || 0) * 120, alt = Math.max(a.y, 0) + D.capAlt + (u.slot || 0) * 40;
    orbit(a, R, alt, D.cap, u.slot % 2 ? -1 : 1);
    pickTarget();
    if (B.target) { go('intercept'); say(`${u.call}: ${B.target.kind === 'loiter' ? 'DRONES' : 'BANDITS'}  -  ENGAGING`); }
    else if (!hasWeapons()) { say(`${u.call}: WINCHESTER  -  RTB`); go('rtb'); }
  }
  function orbit(a, R, alt, eas, dir = 1) {
    // fly toward a point on the circle a little ahead of us (a carrot), at the orbit altitude
    const ang = Math.atan2(A.pos.z - a.z, A.pos.x - a.x) + dir * clamp(eas * 0.6 / R, 0.25, 0.6), r = Math.hypot(A.pos.x - a.x, A.pos.z - a.z);
    const tx = a.x + Math.cos(ang) * R, tz = a.z + Math.sin(ang) * R;
    const ty = alt + Math.max(0, env().groundY(tx, tz));
    fd.dirTo(tx, ty, tz, _d, r > R * 2 ? 0.3 : 0.2);
    fly(_d, eas, { ab: false, gmax: 4 });
  }
  // target choice: threats near the anchor first, then the nearest; a stickiness bonus for the current one
  function pickTarget() {
    const a = world.anchor(u); let best = null, bs = 1e9;
    for (const c of world.contacts(u)) {
      const d = c.p.distanceTo(A.pos); if (d > D.radar) continue;
      let s = d * (c.kind === 'fighter' ? 0.7 : c.kind === 'loiter' ? 0.8 : 1);
      if (a) s += 0.5 * Math.hypot(c.p.x - a.x, c.p.z - a.z);
      if (B.target && c.ref === B.target.ref) s *= 0.6;
      if (s < bs) { bs = s; best = c; }
    }
    if (best !== null && (!B.target || best.ref !== B.target.ref)) { B.target = best; B.lockT = 0; }
    if (!best) B.target = null;
    return best;
  }
  // ------------------------------------------------------------------ air combat
  function phaseFight(dt) {
    B.retarget = (B.retarget || 0) - dt;
    if (B.retarget <= 0) { B.retarget = 1; pickTarget(); }
    const T = B.target;
    if (!T || T.ref.dead || T.ref.dying || T.ref.gone) { B.target = null; if (!pickTarget()) { go(hasWeapons() ? 'cap' : 'rtb'); } return; }
    _r.copy(T.p).sub(A.pos); const R = _r.length(), V = Math.max(A.tas, 1);
    _f.copy(A.vel).divideScalar(V);
    const ata = Math.acos(clamp(_r.dot(_f) / R, -1, 1));                     // angle off my nose
    const tv = T.v.length(), aa = tv > 1 ? Math.acos(clamp(-_r.dot(T.v) / (R * tv), -1, 1)) : 0;   // target aspect (0 = his tail toward me)
    const closing = -(_t.copy(T.v).sub(A.vel)).dot(_r) / R;
    B.tel.range = R; B.tel.ata = ata / D2R;
    if (B.state === 'intercept' && R < 1300) go('merge');
    if (B.state === 'merge' && R > 2200) go('intercept');
    let eas = D.corner, ab = true;
    // threat behind (a fighter inside 1 km, behind the 3-9 line, nose on us): break turn
    const bandit = world.contacts(u).find(c => c.kind === 'fighter' && c.p.distanceTo(A.pos) < 1000 && (() => { _l.copy(A.pos).sub(c.p); const vv = c.v.length() || 1; return _l.dot(_f) > 0 && _l.dot(c.v) / (vv * _l.length()) > 0.8; })());
    if (bandit && B.state === 'merge' && (bandit !== T || ata > 2.2)) {
      // break: turn hard across his line of fire, toward him (into the threat), max g, burner
      _l.copy(bandit.p).sub(A.pos); _l.addScaledVector(_f, -_l.dot(_f)).normalize();
      _d.copy(_f).multiplyScalar(0.2).add(_l).normalize();
      fly(_d, D.corner + 20, { gmax: D.fightMax }); B.tel.mode = 'BREAK'; decoys(dt, 0.6); return;
    }
    // pursuit geometry: lead-collision far out, then lead for guns, lag when the closure is too high close in
    let lead = 0, mode;
    if (R > 1600) { lead = Math.min(8, R / Math.max(60, closing + 40)); mode = 'LEAD COLL'; }
    else if (R < 700 && ata < 0.5) { lead = R / 560; mode = 'GUN LEAD'; }
    else if (R < 500 && closing > 50) { lead = -1.0; mode = 'LAG'; eas = D.corner - 30; ab = false; }
    else { lead = Math.min(1.5, R / 600); mode = 'PURE'; }
    _t.copy(T.p).addScaledVector(T.v, lead);
    if (mode === 'GUN LEAD') _t.y += 4.5 * (R / 560) ** 2;   // gravity drop of the rounds
    fd.dirTo(_t.x, _t.y, _t.z, _d, 1.2);
    // BVR crank: after a radar-missile shot, hold the target ~45° off the nose to slow the closure (radar keeps it)
    if (B.crankT > 0) { B.crankT -= dt; const s = B.crankSide || 1; _l.set(-_d.z, 0, _d.x).normalize().multiplyScalar(s); _d.multiplyScalar(0.72).addScaledVector(_l, 0.7).normalize(); mode = 'CRANK'; }
    const minAlt = env().groundY(A.pos.x, A.pos.z) + (T.kind === 'heli' || T.kind === 'loiter' ? 35 : 60);
    if (A.pos.y < minAlt + 30 && _d.y < 0) _d.y *= clamp((A.pos.y - minAlt) / 30, 0, 1);
    fly(_d, eas, { gmax: D.fightMax, ab, k: 2.2, clr: T.kind === 'heli' || T.kind === 'loiter' ? 28 : 45 });
    B.tel.mode = mode;
    weapons(dt, T, R, ata, closing);
  }
  // shoot: the right weapon for the range and geometry, one at a time, then let it work
  function weapons(dt, T, R, ata, closing) {
    const since = world.time - B.lastShot, fwd = A.forward(_g);
    // seeker / radar lock builds while the target sits near the nose
    B.lockT = ata < 0.4 ? B.lockT + dt : Math.max(0, B.lockT - 2 * dt);
    const tryM = (w, gap) => {
      const st = stores(w); if (!st.length || since < gap || B.lockT < 0.5) return false;
      if (!inEnvelope(w, A.pos, A.vel, T.p, T.v, fwd)) return false;
      if ((MSL[w].seeker === 'sarh' || MSL[w].seeker === 'arh') && B.inFlight && B.inFlight.some(m => !m.dead && m.tgt === T.ref)) return false;   // one radar missile at a time per target
      const s = st[0]; s.on = false; const m = world.fireMissile(u, w, T.ref, s.st); B.lastShot = world.time;
      if (m) (B.inFlight ||= []).push(m);
      say(`${u.call}: ${w === 'aim54' ? 'FOX THREE' : w === 'aim7' ? 'FOX ONE' : w === 'hellfire' ? 'RIFLE' : 'FOX TWO'}  -  ${MSL[w].name}`);
      if (MSL[w].seeker === 'sarh' || MSL[w].seeker === 'arh') { B.crankT = R > 1500 ? 6 : 0; B.crankSide = Math.random() < 0.5 ? -1 : 1; }
      return true;
    };
    if (B.inFlight) B.inFlight = B.inFlight.filter(m => !m.dead);
    const fighter = T.kind === 'fighter';
    // BVR: Phoenix at long range on fighters and big targets, Sparrow in the middle, Sidewinder close; guns inside 600 m
    if (R > 1500 && (fighter || T.kind === 'drone') && tryM('aim54', 4)) return;
    if (R > 600 && tryM('aim7', 3)) return;
    if (tryM(A.P.name === 'SHRIKE' ? 'rwaam' : 'aim9', fighter ? 2.5 : 4)) return;
    // gun: the target inside 600 m and the lead solution within ~1.5° of the nose
    if (D.gun && A.gun > 0 && R < 650 && R > 60) {
      const tof = R / 560; _t.copy(T.p).addScaledVector(T.v, tof).sub(A.pos); _t.y += 4.5 * tof * tof;
      const err = Math.acos(clamp(_t.dot(fwd) / _t.length(), -1, 1));
      if (err < 0.03 + 4 / R) { B.gunT += dt; while (B.gunT > 0.05) { B.gunT -= 0.05; if (A.gun > 0) { A.gun--; world.fireGun(u, _t.normalize()); } } B.firing = true; }
      else { B.gunT = 0; B.firing = false; }
    } else B.firing = false;
  }
  // missiles at us: beam turn (put it 90° off), burner, and decoys; the AI has a moment of reaction
  function defendMissiles(dt) {
    const inc = world.incoming ? world.incoming(u) : [];
    let m = null, md = 1e9; for (const x of inc) { const d = x.p.distanceTo(A.pos); if (d < md) { md = d; m = x; } }
    if (!m || md > 1600) { B.defending = false; return; }
    if (!B.defending) { B.defending = true; B.reactT = 0.4 + Math.random() * 0.6; say(`${u.call}: MISSILE  -  DEFENDING`, 'warn'); }
    if ((B.reactT -= dt) > 0) return;
    _l.copy(m.p).sub(A.pos); _l.y = 0; _l.normalize();
    const s = (_l.x * A.vel.z - _l.z * A.vel.x) > 0 ? 1 : -1;   // turn so it ends up abeam on the side it's already on
    _d.set(-_l.z * s, 0, _l.x * s); _d.y = (A.pos.y - env().groundY(A.pos.x, A.pos.z) > 150) ? -0.25 : 0.05; _d.normalize();
    terrainGuard(_d, 40);
    fd.steer(_d, dt, { eas: D.corner + 30, ab: true, gmax: D.fightMax });
    decoys(dt, 1.4); B.tel.mode = 'DEFEND';
  }
  function decoys(dt, rate) { B.decoyT = (B.decoyT || 0) - dt; if (B.decoyT <= 0 && world.decoy) { B.decoyT = 1 / rate; world.decoy(u, 'flare'); } }

  // ------------------------------------------------------------------ Reaper: orbit, spot, lase, shoot
  function phaseOrbit(dt) {
    const a = world.anchor(u) || A.pos;
    orbit(a, D.capR, Math.max(a.y || 0, 0) + D.capAlt, D.cap, 1);
    B.scanT = (B.scanT || 0) - dt;
    if (B.scanT <= 0) {
      B.scanT = 1.5;
      const seen = world.groundTargets ? world.groundTargets(u) : [];
      if (world.spotted) world.spotted(u, seen);
      // pick something to kill: the cleared target nearest under the orbit
      B.target = null; let bd = 1e9;
      for (const c of seen) { const d = c.p.distanceTo(A.pos); if (d < MSL.hellfire.rmax && d < bd) { bd = d; B.target = c; } }
    }
    const T = B.target;
    if (T && !(T.ref.dead || T.ref.dying || T.ref.gone)) {
      const st = stores('hellfire');
      if (st.length && world.time - B.lastShot > 5 && T.p.distanceTo(A.pos) > MSL.hellfire.rmin) {
        const s = st[0]; s.on = false; B.lastShot = world.time; world.fireMissile(u, 'hellfire', T.ref, s.st); say(`${u.call}: RIFLE  -  HELLFIRE AT ${T.label || T.kind.toUpperCase()}`, 'warn');
      }
    }
    if (!stores('hellfire').length && world.time - B.lastShot > 12) { B.bingo = true; go('rtb'); }
  }
  // ------------------------------------------------------------------ transit (Reaper / fighter to a point)
  function phaseTransit(dt) {
    const p = B.goal; if (!p) { go('cap'); return; }
    fd.dirTo(p.x, p.y, p.z, _d, 0.25); fly(_d, D.cap, { ab: false });
    if (Math.hypot(p.x - A.pos.x, p.z - A.pos.z) < 300) go(B.after || 'cap');
  }

  // ------------------------------------------------------------------ recovery: marshal, straight-in, trap
  // the glide path: 3.5° to the aim wire, flown by the hook; the approach course is the carrier's heading
  const GS = 3.5 * D2R;
  function aimZ() { return DECKOPS.WIRES[D.aimWire - 1] + 1; }
  function phaseRtb(dt, E) {
    const c = E.carrier && E.carrier(); if (!c) { orbit(A.pos, 500, 150, D.cap); return; }
    // the entry gate: 1300 m astern of the ship on the approach course, ~90 m up; fly there at cruise speed
    const lzGate = 1300, gate = carrierWorld(c, D.landX, lzGate, _g), gy = c.deck + Math.tan(GS) * (lzGate - aimZ()) + 3;
    const [lx, lz] = carrierLocal(c, A.pos.x, A.pos.z);
    // come round to the gate from abeam (a wide arc), not across the ship
    let tx = gate.x, tz = gate.z;
    if (lz < lzGate - 200) { const off = lx >= D.landX ? 1 : -1; carrierWorld(c, D.landX + off * 700, Math.max(lz + 300, lzGate * 0.6), _t); tx = _t.x; tz = _t.z; }
    const dist = Math.hypot(tx - A.pos.x, tz - A.pos.z);
    fd.dirTo(tx, Math.max(gy, env().groundY(tx, tz) + 60), tz, _d, 0.2);
    const near = Math.hypot(gate.x - A.pos.x, gate.z - A.pos.z);
    fly(_d, near < 900 ? D.appEAS + 12 : D.cap, { ab: false, gmax: 3 });
    // configure inside ~1.5 km of the gate: gear, full flaps, hook (the Tomcat's wings come forward with the flaps)
    if (near < 1500 && A.eas < A.P.VNE_GEAR) { A.gearCmd = 1; A.flapSel = A.P.name === 'REAPER' ? 1 : 2; A.hookCmd = 1; A.brakeCmd = 0; }
    const hdgErr = Math.abs(wrap(A.heading() - c.yaw));
    if (near < 220 && hdgErr < 0.45 && A.gear > 0.9) { go('final'); B.thrI = fd.thr; say(`${u.call}: ${A.P.name === 'TOMCAT' ? 'TOMCAT' : A.P.name} BALL, ${(A.fuel * 2.2046 / 1000).toFixed(1)}`); }
    else if (near < 220 && B.t > 4) { B.sub = 'reset'; }
  }
  function phaseFinal(dt, E) {
    const c = E.carrier && E.carrier(); if (!c) { go('rtb'); return; }
    const [lx, lz] = carrierLocal(c, A.pos.x, A.pos.z), hook = A.hookTip(_t), [, hz] = carrierLocal(c, hook.x, hook.z);
    const R = hz - aimZ();                                   // hook's distance to the aim point along the deck
    const yDes = c.deck + 0.3 + Math.tan(GS) * Math.max(0, R);   // hook on the glide path
    const vs = Math.hypot(c.vx || 0, c.vz || 0), co = Math.cos(c.yaw), si = Math.sin(c.yaw);
    // relative velocity along the deck (closure) and across it
    const rvx = A.vel.x - (c.vx || 0), rvz = A.vel.z - (c.vz || 0), vAcross = rvx * co - rvz * si;
    const closure = -rvx * si - rvz * co;   // + toward the bow
    const vyDes = -Math.tan(GS) * Math.max(10, closure) + 0.35 * (yDes - hook.y);
    // stick: g for the glide path. throttle: AoA (on-speed), with a lead on the sink error
    const att = A.attitude(), aerr = A.alpha - D.onSpeedA;
    B.thrI = clamp((B.thrI ?? 0.6) + aerr * 0.9 * dt, 0, 0.8);
    fd.setThrottle(clamp(B.thrI + aerr * 3 + (vyDes - A.vel.y) * 0.04, 0, 0.82));
    const n = Math.cos(att.pitch) + clamp(0.14 * (vyDes - A.vel.y), -0.6, 0.6);
    fd.ctl.pitch = fd.pitchFor(n, dt);
    // line-up: bank toward the centreline, killing the drift across it
    const dx = lx - D.landX, phi = clamp(-dx * 0.012 - vAcross * 0.05, -0.35, 0.35);
    fd.ctl.roll = fd.rollFor(phi); fd.ctl.yaw = fd.law === 'ndi' ? 0 : clamp(A.beta * 3, -0.5, 0.5);
    B.tel.gs = hook.y - yDes; B.tel.lineup = dx; B.tel.R = R;
    // the LSO waves it off if it's way out of the groove close in
    if (!A.onGround && !A.wire && R < 300 && R > 20 && (Math.abs(dx) > 7 || Math.abs(hook.y - yDes) > 6 || aerr > 0.09)) { waveOff(Math.abs(dx) > 7 ? 'LINE-UP' : aerr > 0.09 ? 'SLOW' : hook.y > yDes ? 'HIGH' : 'LOW'); return; }
    if (A.wire) { go('rollout'); B.traps++; return; }
    if (A.onGround && !A.wire && lz < DECKOPS.WIRES[3] - 4) { B.bolters++; say(`${u.call}: BOLTER  BOLTER`, 'warn'); go('goaround'); }
  }
  function waveOff(why) { B.waveoffs++; say(`LSO: WAVE OFF  -  ${why}`, 'warn'); go('goaround'); }
  function phaseGoAround(dt) {
    A.hookCmd = 1; fd.thr = 1;
    fd.dirHdg(A.heading(), 0.14, _d); fly(_d, D.appEAS + 20, { gmax: 2.5, noGuard: B.t < 3 });
    if (B.t > 8 && A.pos.y > 60) { A.gearCmd = 1; go('rtb'); }
  }
  function phaseRollout(dt) {
    fd.ctl.pitch = 0; fd.ctl.roll = 0; fd.ctl.yaw = 0;
    // MIL until stopped (in case the wire breaks), then idle so it lets go; brakes; wings to oversweep for the deck
    fd.setThrottle(A.wire && A.wire.held === 0 ? 0.8 : 0);
    fd.ctl.brakeL = fd.ctl.brakeR = A.wire ? 0 : 1;
    if (A.wire && A.wire.held > 0 || !A.wire) { A.hookCmd = 0; A.flapSel = 0; if (A.sweepMode !== undefined) A.sweepMode = 'over'; }
    if (!A.wire && B.t > 2) { if (!B.stowT) { B.stowT = world.time; say(`${u.call}: RECOVERED  -  ${A.trapWire} WIRE`, 'good'); } if (world.time - B.stowT > 4) go('stowed'); }
  }
  return B;
}
