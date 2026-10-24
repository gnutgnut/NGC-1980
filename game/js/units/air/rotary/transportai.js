// transportai.js - the mission brain of an AI transport (CH-46 Sea Knight, MV-22 Osprey): lift off a (moving) deck,
// fly to the landing zone over the terrain, a decelerating approach down a glide path, a vertical descent to touchdown,
// unload, lift off, fly home and land back on the deck. Pure JS: no game imports, runs in node (tools/rotarymission.mjs).
//
// Flown the way Marine helicopter crews fly it (NATOPS / FM 1-203 habits): a stabilized approach down a ~10 deg
// glide path to a hover check at a few metres over the spot, a proper flare (nose up ~10-12 deg) in the last stretch,
// approach gates with a WAVE-OFF (too high, too fast, or the zone fouled: power on, straight ahead, climb away, come
// round again), a hover check after every lift-off, and a ship recovery from a hover off the deck's port quarter with a
// sidestep over the spot.
//
// It only produces guidance - a desired world velocity, climb rate and heading (+ hints like the wanted airspeed for
// the tiltrotor's nacelles). The aircraft's own pilot (pilot.js / the tiltrotor controller) turns that into stick,
// collective and pedals, and the flight model does the flying. No position is ever set.
import { clamp, wrap } from './rb.js';

// the approach: closing speed from the distance (a sqrt profile = constant deceleration that stops over the point),
// height from the glide path near the LZ and the terrain ahead far from it
export function approach(st, tgt, o, world, out = {}) {
  const dx = tgt.x - st.x, dz = tgt.z - st.z, d = Math.hypot(dx, dz) || 1e-6, ux = dx / d, uz = dz / d;
  // too high above the hover point to get down in time at vDesc: slow down (a steep approach, flown slowly)
  const above = st.y - (tgt.y + o.hover), steep = above > 8 ? Math.max(4, (d - o.stop) * o.vDesc * (o.steepK ?? 1.6) / above) : 1e9;   // time to go on a braking profile is ~2d/v: v <= 2 d vDesc / above (x 0.8 margin); the old d/v (x 0.8) asked for more braking than a helicopter has
  const vs = Math.sqrt(2 * o.aDec * Math.max(0, d - o.stop)), Vc = Math.min(o.cruise, vs, d * (o.kpos ?? 0.22), steep);   // linear close in: the position loop stays slower than the velocity loop
  out.vx = (tgt.vx || 0) + ux * Vc; out.vz = (tgt.vz || 0) + uz * Vc;
  // on the braking curve: feed the deceleration forward so the pilot raises the nose in time (the loop only trims it)
  // (inside ~50 m the linear close-in takes over: it brakes at kpos x V, fed forward too - without it the aircraft ran
  // ~6 m/s behind the plan all the way down and crossed the spot at 7 m/s)
  const kp = o.kpos ?? 0.22, brake = Vc === vs && vs < o.cruise && d > 12 ? o.aDec * (d < (o.flareD ?? 70) && Vc > 5 ? (o.flareK ?? 1.5) : 1) : Vc === d * kp && Vc < o.cruise ? kp * Vc : 0;   // the flare
  out.ax = -ux * brake; out.az = -uz * brake; out.dist = d; out.closing = Vc;
  // braking: the pilot may pull the nose up further than in cruise (o.flareTilt, rad; a real flare is 10-15 deg) and ask
  // for more deceleration - at the cruise limits the CH-46 ran ~6 m/s behind the plan all the way down
  const fl = brake > 0 && o.flareTilt && Math.hypot(st.vx - (tgt.vx || 0), st.vz - (tgt.vz || 0)) > Vc + 0.5; out.tilt = fl ? o.flareTilt : undefined; out.aMax = fl ? o.flareA : undefined;
  // terrain floor along the way (look-ahead grows with speed) and close round the aircraft
  const look = Math.min(d, 60 + 6 * Math.hypot(st.vx, st.vz));
  const clr = o.hover - 1 + (o.clear - o.hover + 1) * clamp((d - o.flat) / 120, 0, 1);   // clearance shrinks to the hover height on short final
  const floor = world.floorAlong(st.x, st.z, ux, uz, look) + clr;
  const glide = tgt.y + o.hover + Math.max(0, d - o.flat) * Math.tan(o.glide);
  const cruiseH = Math.max(floor, world.floorAlong(st.x, st.z, ux, uz, Math.min(d, 400)) + o.agl);
  const hDes = Math.max(Math.min(cruiseH, glide), floor);
  out.hDes = hDes;
  // descent limit: slow, steep descents put a rotor in its own wake (vortex ring) - below ~40 kt keep it under
  // o.vDescSlow (the V-22's ~800 fpm below 40 KCAS rule; a good habit for the CH-46 too)
  const vd = Math.hypot(st.vx - (tgt.vx || 0), st.vz - (tgt.vz || 0)) < 20 ? Math.min(o.vDesc, o.vDescSlow ?? 3.5) : o.vDesc;
  out.vy = clamp((hDes - st.y) * o.kh, -vd, o.vClimb) + (tgt.vy || 0);
  // heading: along the track while far, the landing heading in the last part
  const trackHdg = Math.atan2(-out.vx + (tgt.vx || 0), -out.vz + (tgt.vz || 0));
  out.hdg = d > o.hdgDist ? (Vc > 3 ? trackHdg : null) : tgt.hdg;
  if (out.hdg === null || out.hdg === undefined) out.hdg = st.yaw;
  // slow and pointing the wrong way (just off the deck): turn onto the track in the hover first, then go
  const gs = Math.hypot(st.vx - (tgt.vx || 0), st.vz - (tgt.vz || 0)), herr = Math.abs(wrap(trackHdg - st.yaw));
  if (d > o.hdgDist && gs < 12 && herr > 0.5) { out.hdg = trackHdg; out.vx = (tgt.vx0 ?? st.vx * 0.9); out.vz = (tgt.vz0 ?? st.vz * 0.9); out.ax = out.az = 0; out.turning = true; }
  out.speed = Vc;
  return out;
}
// hold a point (relative to a moving deck) while climbing or descending
export function hold(st, tgt, vy, k = 0.22, out = {}) {
  out.vx = (tgt.vx || 0) + clamp((tgt.x - st.x) * k, -4, 4); out.vz = (tgt.vz || 0) + clamp((tgt.z - st.z) * k, -4, 4);
  out.vy = vy; out.hdg = tgt.hdg ?? st.yaw; out.ax = out.az = 0; out.speed = 0; return out;
}

// o: { cruise, aDec, stop, glide, flat, hover, agl, clear, kh, vDesc, vClimb, hdgDist, liftAgl, spool }
// hooks: lz() / home() -> { x, y (ground), z, hdg, vx, vz } | null; unload(ai, dt) -> true when done; parked(ai)
export function createTransportAI(o, hooks) {
  const AI = {
    phase: 'spool', t: 0, cmd: {}, o, hooks, spot: null, err: 0, maxSink: 0, landedAt: null, log: [],
    set(p) { if (p !== AI.phase) { AI.log.push([+AI.tAll.toFixed(1), p]); AI.phase = p; AI.t = 0; } },
    tAll: 0,
    // st: pilot.stateOf(); sim: { agl, landed, contacts }; world: { floorAlong, groundY }
    step(st, sim, dt, world) {
      AI.t += dt; AI.tAll += dt;
      const c = AI.cmd; c.collFix = undefined; c.ground = false; c.pitch = undefined; c.roll = undefined; c.tilt = c.aMax = undefined; c.turning = false; const vyPrev = c.vy ?? 0;
      switch (AI.phase) {
        case 'spool': {   // engines to flight rpm, rotors spinning up on the deck
          AI.spot = AI.spot || { x: st.x, z: st.z, hdg: st.yaw };
          const h = hooks.home && hooks.home(); hold(st, { ...AI.spot, vx: h ? h.vx : 0, vz: h ? h.vz : 0 }, 0, 0, c);
          c.collFix = 0; c.ground = true;
          const ready = !hooks.board || hooks.board(AI, dt);   // troops loading, chocks and chains, the LSE's signal (embark.js)
          if (AI.t > o.spool && ready) AI.set('lift');
          break;
        }
        case 'lift': case 'lift2': {   // straight up off the deck / pad, keeping station over it, then away
          const h = AI.phase === 'lift' ? (hooks.home && hooks.home()) : null, sp = AI.spot;
          const tgt = { x: sp.x, z: sp.z, hdg: sp.hdg, vx: h ? h.vx : 0, vz: h ? h.vz : 0 };
          if (h) { sp.x += (h.vx || 0) * dt; sp.z += (h.vz || 0) * dt; }   // the deck moves on
          hold(st, tgt, sim.agl < 1 ? 1.2 : clamp((o.liftAgl + 2 - sim.agl) * 0.6, 0.5, 3), 0.22, c);
          if (sim.agl > o.liftAgl) { AI.chk = (AI.chk || 0) + dt; if (AI.chk > (o.liftCheck ?? 1.2)) { AI.chk = 0; AI.set(AI.phase === 'lift' ? 'transit' : 'rtb'); } }
          break;
        }
        case 'transit': case 'rtb': {
          let tgt = AI.phase === 'transit' ? hooks.lz() : hooks.home && hooks.home();
          if (!tgt) { AI.set('hover'); break; }
          // ship recovery: come to a hover off the deck's port quarter first (then sidestep over the spot)
          const ship = AI.phase === 'rtb' && Math.hypot(tgt.vx || 0, tgt.vz || 0) > 0.5;
          if (ship) tgt = AI.quarter(tgt);
          approach(st, tgt, o, world, c);
          const rel = Math.hypot(st.vx - (tgt.vx || 0), st.vz - (tgt.vz || 0));
          // approach gates: established and not far above the glide path at ~250 m; slow enough at short final; a clear zone
          if (AI.phase === 'transit' && !AI.gateOff && AI.t > 6) {
            const toward = ((st.vx - (tgt.vx || 0)) * (tgt.x - st.x) + (st.vz - (tgt.vz || 0)) * (tgt.z - st.z)) / Math.max(c.dist, 1);   // closing speed actually flown
            const why = c.dist < 280 && c.dist > 150 && st.y - c.hDes > 40 ? 'high' : c.dist < 40 && toward > 1.6 * c.closing + 5 ? 'fast' : c.dist < 140 && hooks.fouled && hooks.fouled() ? 'fouled' : null;
            if (why) { AI.waveoffs = (AI.waveoffs || 0) + 1; AI.why = why; (AI.woLog ||= []).push([why, +c.dist.toFixed(0), +rel.toFixed(1), +c.closing.toFixed(1), +(st.y - c.hDes).toFixed(1)]); AI.woHdg = Math.atan2(-(st.vx || 1e-3), -(st.vz || 1e-3)); AI.set('waveoff'); break; }
          }
          if (c.dist < o.stop + 1.5 && rel < 1.5 && Math.abs(st.y - (tgt.y + o.hover)) < 3) AI.set(AI.phase === 'transit' ? 'hoverchk' : ship ? 'sidestep' : 'hoverchk2');
          break;
        }
        case 'waveoff': {   // power on, straight ahead, climb away; then round again (a fresh approach from wherever it is)
          // climb first, then accelerate (no nosing over close to the ground)
          const fx = -Math.sin(AI.woHdg), fz = -Math.cos(AI.woHdg), sp = Math.min(o.cruise * 0.6, 30) * clamp((AI.t - 1.5) / 4, 0.25, 1);
          c.vx = fx * sp; c.vz = fz * sp; c.ax = c.az = 0; c.hdg = AI.woHdg;
          const floor = world.floorAlong(st.x, st.z, fx, fz, 120);
          c.vy = clamp((Math.max(floor + o.clear + 10, st.y + 10) - st.y) * 0.5, 2.5, o.vClimb);
          const lz = hooks.lz(), far = !lz || Math.hypot(lz.x - st.x, lz.z - st.z) > (o.goRound ?? 320);   // far enough out to set up a fresh approach
          if (AI.t > 9 && st.y > floor + o.clear && (far || AI.t > 45)) { AI.gateOff = AI.waveoffs >= 2; if (hooks.waveoff) hooks.waveoff(AI); AI.set('transit'); }
          break;
        }
        case 'hoverchk': case 'hoverchk2': {   // stabilized hover over the spot: power check, then set it down
          const tgt = AI.phase === 'hoverchk' ? hooks.lz() : hooks.home && hooks.home();
          if (!tgt) { AI.set('hover'); break; }
          hold(st, tgt, clamp((tgt.y + o.hover - st.y) * 0.6, -1, 1), 0.25, c);
          const off = Math.hypot(tgt.x - st.x, tgt.z - st.z), rel = Math.hypot(st.vx - (tgt.vx || 0), st.vz - (tgt.vz || 0));
          if (AI.t > (o.hoverCheck ?? 2) && off < 2 && rel < 0.8) AI.set(AI.phase === 'hoverchk' ? 'descend' : 'descend2');
          if (AI.t > 12) AI.set(AI.phase === 'hoverchk' ? 'descend' : 'descend2');
          break;
        }
        case 'sidestep': {   // from the hover off the port quarter, slide across and over the spot, matching the deck
          const tgt = hooks.home && hooks.home(); if (!tgt) { AI.set('hover'); break; }
          hold(st, { ...tgt, y: tgt.y }, clamp((tgt.y + o.hover - st.y) * 0.6, -1, 1), 0.3, c);
          if (Math.hypot(tgt.x - st.x, tgt.z - st.z) < 2.5) AI.set('hoverchk2');
          break;
        }
        case 'descend': case 'descend2': {   // vertical descent over the spot, slowing toward the ground
          const tgt = AI.phase === 'descend' ? hooks.lz() : hooks.home && hooks.home();
          if (!tgt) { AI.set('hover'); break; }
          const agl = sim.agl;
          hold(st, tgt, -clamp(0.25 + agl * 0.3, 0.3, 2.2), 0.22, c);
          const off = Math.hypot(tgt.x - st.x, tgt.z - st.z);
          if (off > 6 && agl > 2) AI.set(AI.phase === 'descend' ? 'transit' : 'rtb');   // blown off the spot: go round
          if (sim.landed || sim.contacts >= 3) { AI.landedAt = { x: st.x, z: st.z, off, t: AI.tAll }; AI.spot = { x: st.x, z: st.z, hdg: st.yaw }; AI.set(AI.phase === 'descend' ? 'ground' : 'parked'); }
          break;
        }
        case 'ground': case 'parked': {   // collective down, sit on the wheels; unload / stow
          const tgt = AI.phase === 'parked' ? hooks.home && hooks.home() : null;
          hold(st, { x: st.x, z: st.z, hdg: st.yaw, vx: tgt ? tgt.vx : 0, vz: tgt ? tgt.vz : 0 }, -0.5, 0, c);
          c.collFix = Math.max(0, 0.35 - AI.t * 0.25); c.ground = true;
          if (AI.phase === 'ground' && AI.t > 1.5 && hooks.unload(AI, dt)) { AI.spot = { x: st.x, z: st.z, hdg: st.yaw }; AI.set('lift2'); }
          if (AI.phase === 'parked' && AI.t > 1.5 && hooks.parked) hooks.parked(AI);
          break;
        }
        case 'hover': default: {   // nothing to do: hold here
          hold(st, { x: st.x, z: st.z, hdg: st.yaw }, clamp((20 - sim.agl) * 0.3, -1, 1), 0.3, c);
          if (AI.t > 1 && hooks.home && hooks.home()) AI.set('rtb');
        }
      }
      c.vy = vyPrev + clamp((c.vy ?? 0) - vyPrev, -(o.vyRate ?? 1.5) * dt, (o.vyRate ?? 1.5) * dt);   // no steps in the climb / descent command
      return c;
    },
    goHome() { if (!AI.homing()) AI.set(AI.phase === 'ground' || AI.phase === 'spool' ? 'lift2' : 'rtb'); },
    homing: () => ['rtb', 'sidestep', 'hoverchk2', 'descend2', 'parked'].includes(AI.phase),
    // the hover point off a ship's port quarter: aft and to the left of the spot (deck heading), at the hover height
    quarter(t) { const h = t.hdg ?? 0, fx = -Math.sin(h), fz = -Math.cos(h), lx = -fz * -1, lz = fx * -1; const aft = o.quarterAft ?? 26, port = o.quarterPort ?? 22; return { ...t, x: t.x - fx * aft + lx * port, z: t.z - fz * aft + lz * port, hdg: h }; },
  };
  return AI;
}
export { wrap };
