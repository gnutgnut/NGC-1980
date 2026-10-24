// driver.js - turns what a player (or an AI) wants into vehiclefm.js pedals and levers. Pure JS, node-testable.
// The physics never cheats: this is a driver working a real clutch, gearbox and pedals, like the Huey's stability assist.
//   mode 'auto'   : automatic clutch and gear changes; hold brake at a standstill to engage reverse (then the throttle
//                   key brakes and the brake key drives backwards, arcade style)
//   mode 'semi'   : automatic clutch, the player changes gear (shiftUp / shiftDown)
//   mode 'manual' : everything by hand: clutch pedal, gear lever (and you can stall it)
// input: { throttle 0..1, brake 0..1, steer -1..1, handbrake 0..1, clutch 0..1 (manual), shiftUp, shiftDown (edges),
//          gear (manual: direct), range, fwd, lock, ignition, starter, horn, kit }
// steering: the wheel turns at a human rate (spec.steer.turns, ~1.5 turns/s) and centres when let go (keyboard);
// an analogue stick sets the position directly (input.steerAbs = true).
import { table } from './vehiclefm.js';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const RPM = 60 / (2 * Math.PI);

export function createDriver(spec, mode = 'auto') {
  const E = spec.engine, GB = spec.gearbox, n = GB.ratios.length, diesel = E.diesel;
  const top = E.governor ? E.governor[0] : E.redline * 0.93;
  const D = {
    mode, ctl: { throttle: 0, brake: 0, clutch: 0, steer: 0, handbrake: 0, gear: 0, range: 'H', fwd: false, lock: false, ignition: true, starter: false, horn: false, kit: false },
    steer: 0, shift: 0, shiftTo: 0, hold: 0, lastShift: 0, reverse: false, revHold: 0, t: 0, launch: 0, rm: 0, acc: 0, v0: null, le: 0,
    reset(sim) {
      D.ctl.gear = sim.gear; D.shift = 0; D.shiftTo = 0; D.reverse = sim.gear < 0; D.steer = 0; D.ctl.range = sim.range; D.ctl.fwd = sim.fwd;
      D.le = 0; D.rm = 0; D.upT = 0; D.acc = 0; D.v0 = null; D.revHold = 0; D.lastShift = D.t; D.lastDown = -9; D.ctl.clutch = 1; D.ctl.throttle = 0; D.ctl.brake = 0;
    },
    update(sim, input, dt) {
      const c = D.ctl; D.t += dt;
      // the driver's feel for the acceleration (smoothed dv/dt)
      if (dt > 0) { const a = (sim.speed - (D.v0 ?? sim.speed)) / dt; D.acc += (a - D.acc) * Math.min(1, dt * 3); D.v0 = sim.speed; }
      // ---- steering wheel
      const rate = 1.6 / Math.max(1, spec.steer.turns) * 2 * (1 + 0.5 * (diesel ? 0 : 1));   // full lock per second-ish
      if (input.steerAbs) D.steer = clamp(input.steer || 0, -1, 1);
      else {
        const s = clamp(input.steer || 0, -1, 1);
        if (Math.abs(s) > 0.01) D.steer = clamp(D.steer + s * rate * dt * (Math.sign(s) !== Math.sign(D.steer) ? 1.6 : 1), -1, 1);
        else D.steer -= Math.sign(D.steer) * Math.min(Math.abs(D.steer), rate * 1.3 * dt * (0.4 + Math.min(1, Math.abs(sim.speed) / 8)));
      }
      c.steer = D.steer;
      for (const k of ['range', 'fwd', 'lock', 'ignition', 'starter', 'horn', 'kit']) if (input[k] !== undefined) c[k] = input[k];
      c.handbrake = input.handbrake || 0;
      if (D.mode === 'manual') {
        c.throttle = input.throttle || 0; c.brake = input.brake || 0; c.clutch = input.clutch || 0;
        if (input.gear !== undefined) c.gear = input.gear;
        if (input.shiftUp) c.gear = Math.min(n, c.gear + 1);
        if (input.shiftDown) c.gear = Math.max(-1, c.gear - 1);
        return c;
      }
      // ---- direction: reverse by holding brake at a standstill (auto), or the lever (semi)
      let thr = input.throttle || 0, brk = input.brake || 0;
      const v = sim.speed, rpm = sim.eng.rpm, idle = E.idle;
      if (D.mode === 'auto') {
        if (Math.abs(v) < 0.6 && brk > 0.5 && thr < 0.05 && !D.reverse) { D.revHold += dt; if (D.revHold > 0.35) { D.reverse = true; D.revHold = 0; } }
        else if (Math.abs(v) < 0.6 && thr > 0.5 && D.reverse && brk < 0.05) { D.revHold += dt; if (D.revHold > 0.2) { D.reverse = false; D.revHold = 0; } }
        else D.revHold = 0;
        if (D.reverse) { const t = thr; thr = brk; brk = t; }
      }
      // ---- gear selection
      const ratioOf = g => g < 0 ? GB.reverse : g > 0 ? GB.ratios[g - 1] : 0;
      const wOut = sim.solver.w[1];   // gearbox output shaft (rad/s)
      const rpmIn = g => Math.abs(wOut * ratioOf(g)) * RPM;
      let want = c.gear;
      if (D.mode === 'auto') {
        if (D.reverse) want = -1;
        else if (want <= 0) want = (thr > 0.02 || Math.abs(v) > 1) ? 1 : (want < 0 ? 0 : want);
        else if (D.shift === 0 && D.t - D.lastShift > (diesel ? 1.6 : 1.0)) {
          const up = top * (0.62 + 0.33 * thr), down = idle * (diesel ? 1.25 + 0.5 * thr : 1.35 + 0.9 * thr);
          // up: revs high and the next gear can still pull what the vehicle needs now (a loaded truck crawling up a
          // 60% grade stays in first); down: revs low
          const r1 = ratioOf(want), r2 = ratioOf(want + 1);
          const rng = sim.range === "L" ? (sim.spec.transfer.low || 1) : sim.spec.transfer.high, fin = sim.spec.axles.find(a => a.driven)?.final || 1;
          // gears are judged by ROAD speed, not by spinning wheels (in mud the revs say nothing)
          const vv = Math.abs(v), rpmV = g => vv / sim.wheels[0].r * fin * rng * ratioOf(g) * RPM, rpm2 = rpmV(want + 1);
          // what it takes to keep going: the slope (felt through the seat), rolling resistance and drag, in engine N m x ratio
          const need = (sim.massNow * 9.81 * (Math.max(0, Math.sin(sim.pitch)) + 0.025) + 0.6 * sim.spec.aero.CdA * vv * vv) * sim.wheels[0].r / (fin * rng * 0.9);
          const can = table(E.curve, rpm2) * (E.installed ?? 1) * r2;
          const upOk = want < n && D.t - (D.lastDown ?? -9) > 3 && rpmV(want) > up && c.clutch < 0.1 && thr > 0.05 && rpm2 > down * 1.03 && (thr < 0.9 || can > need * 1.15);
          D.upT = upOk ? (D.upT || 0) + dt : 0;   // held for 0.4 s: a jolt over a kink is not a reason to change up
          if (upOk && D.upT > 0.4) { want++; D.upT = 0; }
          else if (want > 1 && Math.min(rpm, rpmV(want)) < down && rpmV(want - 1) < top * 0.9 && (GB.synchro[want - 2] || Math.abs(wOut) < 0.5)) want--;   // judged by road speed too: a slipping clutch or spinning wheels keep the revs up
          else if (want > 1 && Math.abs(v) < 0.8 && brk > 0 && (GB.synchro[0] || Math.abs(wOut) < 0.5)) want = 1;
        }
      } else {
        if (input.shiftUp) want = Math.min(n, c.gear + 1);
        if (input.shiftDown) want = Math.max(-1, c.gear - 1);
        if (input.gear !== undefined) want = input.gear;
      }
      // ---- the shift itself: clutch down, lift, move the lever, (blip), clutch out
      const shiftTime = diesel ? 0.75 : 0.42;
      if (want !== c.gear && D.shift === 0) { D.shift = shiftTime; D.shiftTo = want; D.lastShift = D.t; if (want < c.gear && want > 0) D.lastDown = D.t; }
      if (D.shift > 0) {
        D.shift -= dt;
        c.clutch = 1; c.throttle = 0;
        // move the lever halfway through (the box needs the clutch down first); blip for a downshift
        if (D.shift < shiftTime * 0.55) { c.gear = D.shiftTo; if (sim.gear !== D.shiftTo) c.gear = D.shiftTo; if (D.shiftTo > 0 && rpmIn(D.shiftTo) > rpm + 150) c.throttle = clamp((rpmIn(D.shiftTo) - rpm) / 1200, 0, 0.8); }
        // a non-synchro gear (the M35's first, reverse) only goes in with the box stopped: clutch down, brake, wait
        const noSyn = D.shiftTo < 0 || (D.shiftTo > 0 && !GB.synchro[D.shiftTo - 1]);
        if (noSyn && Math.abs(wOut) > 0.4 && sim.gear !== D.shiftTo) { D.shift = Math.max(D.shift, 0.05); c.gear = sim.gear || 0; c.brake = Math.max(brk, 0.8); return c; }
        if (D.shift <= 0) { D.shift = 0; D.rm = 0.35; }
        c.brake = Math.abs(v) < 0.3 && Math.abs(sim.pitch) > 0.04 ? Math.max(brk, 0.7) : brk; return c;   // changing gear stopped on a hill: foot on the brake
      }
      // ---- automatic clutch: a launch that slips to a target rpm, locks once the shafts match, never lugs below stall
      const g = c.gear, ratio = ratioOf(g);
      if (!sim.eng.running) { c.clutch = 1; c.throttle = thr; c.brake = brk; return c; }
      if (g === 0) { c.clutch = 0; c.throttle = thr; c.brake = brk; return c; }
      const inRpm = rpmIn(g);
      const launch = idle + (diesel ? 350 + 650 * thr : 500 + 1500 * thr);
      // launch controller: slip the clutch to hold the launch rpm (the engine makes its torque, a turbo diesel builds
      // boost), engage further as the shafts come up to speed, lock once they match; never lug the engine below stall
      if (inRpm > idle * 1.08 && rpm > idle * 0.98 && rpm - inRpm < 250) D.le = 1;         // shafts matched: in
      else if (thr > 0.02 || inRpm > idle * 0.9) D.le = clamp(D.le + dt * (2.2 * (rpm - launch) / Math.max(200, launch - idle) + 0.25 * inRpm / launch), 0, 1);
      else D.le = 0;
      if (rpm < idle * 0.82) D.le = Math.min(D.le, 0.05);                                    // about to stall: clutch down
      if (brk > 0.3 && inRpm < idle * 0.95) D.le = 0;                                        // braking to a stop: clutch down
      let eng = D.le;
      if (D.rm > 0) { D.rm -= dt; eng = Math.min(eng, 1 - D.rm / 0.35 * 0.8); }              // release ramp after a shift
      const target = 1 - (0.08 + 0.62 * eng);                                                // pedal for that engagement (see vehiclefm)
      c.clutch += clamp(target - c.clutch, -dt * 4, dt * 6);
      if (eng >= 1) c.clutch = Math.min(c.clutch, 0);
      // wheelspin: feather the throttle (in mud a spinning tyre digs itself in)
      let spin = 0, nd = 0; for (const W of sim.wheels) if (sim.spec.axles[W.spec.axle].driven && W.contact) { spin += Math.max(0, W.ts.kappa * Math.sign(ratio || 1)); nd++; }
      spin = nd ? spin / nd : 0;
      if (spin > 0.35 && eng >= 1) thr *= clamp(1 - (spin - 0.35) * 1.2, 0.3, 1);
      // feeding the clutch, a driver keeps the revs up: throttle to hold the launch rpm (never more than asked + 0.5)
      if (eng < 1 && thr > 0.02 && rpm < launch) thr = Math.max(thr, Math.min(1, thr + 0.5, (launch - rpm) / (diesel ? 500 : 700)));
      // hill start: on a slope, the foot (or the handbrake) holds the vehicle until the clutch bites
      if (Math.abs(v) < 0.4 && Math.abs(sim.pitch) > 0.05 && thr > 0.02 && eng < 0.5) brk = Math.max(brk, 0.7 * (1 - eng / 0.5));
      c.throttle = thr; c.brake = brk;
      void ratio; return c;
    },
  };
  return D;
}

// AI: steer for a point and hold a speed (pure pursuit on the target, speed by throttle / brake). Returns an input for
// driver.update in 'auto' mode. target {x, z}, vWant m/s (negative = back up).
export function aiInput(sim, target, vWant, out = {}) {
  const dx = target.x - sim.pos[0], dz = target.z - sim.pos[2];
  const fx = sim.fwdv[0], fz = sim.fwdv[2], rx = -fz, rz = fx;   // right = fwd x up
  const along = dx * fx + dz * fz, side = dx * rx + dz * rz, L = Math.hypot(dx, dz) || 1;
  const wb = sim.spec.dims.wheelbase, curv = 2 * side / (L * L);
  let steer = Math.atan(curv * wb) / sim.spec.steer.max;
  if (along < 0 && vWant > 0) steer = Math.sign(side) || 1;
  out.steer = clamp(steer * (vWant < 0 ? -1 : 1), -1, 1); out.steerAbs = true;
  const v = sim.speed, err = vWant - v;
  if (vWant >= 0) { out.throttle = clamp(err * 0.35 + 0.1, 0, 1) * (err > -0.3 ? 1 : 0); out.brake = clamp(-err * 0.3, 0, 1) * (err < -0.8 ? 1 : 0); }
  else { out.throttle = clamp(-err * 0.3, 0, 1) * (err > 0.8 ? 1 : 0); out.brake = clamp(err * 0.35 + 0.1, 0, 1) * (err < 0.3 ? 1 : 0); }
  out.handbrake = 0; return out;
}

// An AI driver who is stuck (asking for drive, not moving, wheels spinning: a cross-axle hang on open diffs, a kerb
// taken too slowly) backs off a few metres and rushes it again, the way a driver would. Wraps an aiInput result:
//   const U = createUnstick();  each step: U.update(sim, aiInput(sim, target, v))   (U.state: 'drive'|'back'|'rush')
// Timing from sim._t, so it needs no dt. Gives up retrying after opts.tries attempts (then just keeps pushing).
export function createUnstick(opts = {}) {
  const o = { wait: 2.5, back: 2.2, rush: 4, tries: 4, ...opts };
  const U = { state: 'drive', t0: 0, stuck: 0, last: null, tries: 0,
    update(sim, inp) {
      const t = sim._t ?? 0, dt = U.last === null ? 0 : Math.max(0, Math.min(0.2, t - U.last)); U.last = t;
      const v = Math.abs(sim.speed);
      if (U.state === 'drive') {
        const spin = sim.wheels.some(w => w.contact !== false && Math.abs(w.ts?.kappa ?? 0) > 0.4);
        U.stuck = inp.throttle > 0.25 && v < 0.3 && (spin || sim.eng.rpm > sim.spec.engine.idle * 1.8) ? U.stuck + dt : Math.max(0, U.stuck - dt * 2);
        if (U.stuck > o.wait && U.tries < o.tries) { U.state = 'back'; U.t0 = t; U.stuck = 0; U.tries++; }
        if (v > 3) U.tries = 0;
      }
      if (U.state === 'back') {   // brake held at a standstill = reverse (auto driver), then the brake pedal drives it back
        inp.throttle = 0; inp.brake = 0.7; inp.steer = 0; inp.handbrake = 0;
        if (t - U.t0 > o.back + 0.6) { U.state = 'rush'; U.t0 = t; }
      } else if (U.state === 'rush') {   // forward again with a run at it
        inp.brake = 0; inp.throttle = Math.max(inp.throttle, 0.75);
        if (t - U.t0 > o.rush) U.state = 'drive';
      }
      return inp;
    },
  };
  return U;
}

// Road traffic for the WORLD layer: follow a polyline of waypoints [{x, z, v?}] (v = speed limit m/s at that point).
// Pure pursuit with a speed-dependent lookahead; slows for bends (lateral g budget), for the limit, for a vehicle or
// person ahead (opts.gap(): metres to the obstacle on the path, or Infinity), and stops at the end (or loops).
//   const F = createFollower(path, { speed: 14, loop: true, latG: 0.25 });  each frame: input = F.update(sim); driver.update(sim, input, dt)
export function createFollower(path, opts = {}) {
  const o = { speed: 12, loop: false, latG: 0.25, lookahead: 4, stopDist: 4, gap: null, ...opts };
  const F = { path, i: 0, done: false, input: {}, unstick: o.unstick === false ? null : createUnstick(),
    // nearest segment ahead of the vehicle (keeps the index moving forward)
    update(sim) {
      const px = sim.pos[0], pz = sim.pos[2], n = path.length;
      for (let k = 0; k < 4; k++) {   // advance past waypoints we've passed
        const a = path[F.i], b = path[(F.i + 1) % n]; if (!b || (!o.loop && F.i >= n - 1)) break;
        const sx = b.x - a.x, sz = b.z - a.z, t = ((px - a.x) * sx + (pz - a.z) * sz) / (sx * sx + sz * sz || 1);
        if (t > 1) F.i = o.loop ? (F.i + 1) % n : Math.min(n - 1, F.i + 1); else break;
      }
      // lookahead point along the path
      const v = Math.abs(sim.speed), L = o.lookahead + v * 0.9; let left = L, j = F.i, qx = px, qz = pz;
      let tx = path[Math.min(n - 1, j + 1)].x, tz = path[Math.min(n - 1, j + 1)].z;
      for (let k = 0; k < n && left > 0; k++) {
        const a = k === 0 ? { x: qx, z: qz } : path[j % n], b = path[(j + 1) % n]; if (!o.loop && j + 1 >= n) { tx = path[n - 1].x; tz = path[n - 1].z; break; }
        const d = Math.hypot(b.x - a.x, b.z - a.z); if (d >= left) { tx = a.x + (b.x - a.x) * left / d; tz = a.z + (b.z - a.z) * left / d; break; }
        left -= d; tx = b.x; tz = b.z; j++;
      }
      // speed: limit, bends ahead (curvature over the next ~3 segments), the end of the path, the gap ahead
      let vmax = path[F.i].v ?? o.speed;
      for (let k = 1; k <= 3; k++) {
        const a = path[(F.i + k - 1) % n], b = path[(F.i + k) % n], c = path[(F.i + k + 1) % n]; if (!o.loop && F.i + k + 1 >= n) break;
        const a1 = Math.atan2(b.z - a.z, b.x - a.x), a2 = Math.atan2(c.z - b.z, c.x - b.x); let da = Math.abs(a2 - a1); if (da > Math.PI) da = 2 * Math.PI - da;
        const seg = Math.hypot(c.x - b.x, c.z - b.z) || 1, R = seg / Math.max(1e-3, da);
        vmax = Math.min(vmax, Math.sqrt(o.latG * 9.81 * R), b.v ?? Infinity);
      }
      if (!o.loop) { const end = path[n - 1], de = Math.hypot(end.x - px, end.z - pz); vmax = Math.min(vmax, Math.max(0, (de - o.stopDist) * 0.6)); F.done = de < o.stopDist + 1 && v < 0.5; }
      const gap = o.gap ? o.gap(sim) : Infinity; if (gap < Infinity) vmax = Math.min(vmax, Math.max(0, (gap - 6) * 0.5));
      // COLLISION (wave 3): opts.avoid(sim, dx, dz, v) -> { x, z (unit), k } bends the aim round other moving bodies
      // (collision.js CW.avoid: keep right head-on) and slows for what is ahead
      if (o.avoid && vmax > 0.3) { const dx = tx - px, dz = tz - pz, L = Math.hypot(dx, dz) || 1, a = o.avoid(sim, dx / L, dz / L, Math.max(v, vmax)); if (a) { tx = px + a.x * L; tz = pz + a.z * L; vmax *= a.k; F.avoiding = a.k < 0.99 || a.x * dx / L + a.z * dz / L < 0.995; } }
      aiInput(sim, { x: tx, z: tz }, vmax, F.input);
      if (vmax < 0.3 && v < 1) { F.input.throttle = 0; F.input.brake = 0.4; F.input.handbrake = v < 0.2 ? 1 : 0; }
      else if (F.unstick) F.unstick.update(sim, F.input);   // stuck on something: back off and have another go
      return F.input;
    },
  };
  return F;
}
