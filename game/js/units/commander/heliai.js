// COMMANDER: the Huey's AI pilot. When the commander leaves a Huey in the air (switches to another unit), the crew
// flies it home and sets it down: to the nearest friendly pad or the ALBATROSS's aft helicopter spot. It flies the
// real flight model (hueyfm.js) through the same cyclic, pedals and collective a pilot uses - the loops are the
// node bench pilot's (tools/hueypilot.mjs: speed -> pitch attitude, drift -> bank, heading -> pedals, vertical
// speed -> collective) with ground-velocity targets on top, so it can match a moving deck. Pure (three.js maths
// only); tools/commanderbench.mjs flies it to a pad and onto a moving deck in node.
//
//   const AI = createHeliAI();
//   AI.engage(H, target)     target() -> { x, y (the deck / pad surface), z, vx, vz, hdg (or null: keep), name }
//   ctl = AI.step(H, dt, env) each frame -> { cx, cy, pedal, coll } (merge into the sim's ctl), AI.phase:
//         'transit' (en route at cruise height), 'approach' (slowing into a high hover over the spot),
//         'descend' (straight down onto it), 'landed' (collective down: done), 'off'
//   env: { ground(x, z) -> height of the ground / deck / sea (0) under a point, for the cruise height }
import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const _f = new THREE.Vector3();

export const HELI_AI = {
  CRUISE: 26,        // m/s ground speed en route (~50 kt: an unhurried transit)
  CRUISE_AGL: 38,    // m over the highest ground on the way
  HOVER_H: 9,        // m over the spot when it arrives
  APPROACH_R: 45,    // m: inside this it slows into the hover over the spot
  SKID: 1.9,         // CG over the skids (m), hueyfm's SKID_Z
};

export function createHeliAI() {
  const AI = { phase: 'off', target: null, t: 0, i: { c: 0.42, lon: 0, lat: 0, ped: -0.25, th: 0, ph: 0 }, ctl: { cx: 0, cy: 0, pedal: 0, coll: 0 }, hdg: 0, err: 0 };
  const I = AI.i;
  function state(H) {   // the bench pilot's read-outs (tools/hueypilot.mjs)
    H.forward(_f); _f.y = 0; _f.normalize();
    const a = H.attitude();
    return { fx: _f.x, fz: _f.z, u: H.vel.x * _f.x + H.vel.z * _f.z, v: H.vel.x * -_f.z + H.vel.z * _f.x, vz: H.vel.y, pitch: a.pitch, roll: -a.roll, hdg: H.heading(), p: -H.w.z, q: H.w.x, r: -H.w.y };
  }
  AI.engage = (H, target) => {
    AI.target = target; AI.phase = H.landed ? 'landed' : 'transit'; AI.t = 0;
    const s = state(H);
    // take over from where the pilot left the controls (no jump in the stick)
    I.c = H.c.coll; I.lon = H.c.lon; I.lat = H.c.lat; I.ped = H.c.ped; I.th = clamp(s.pitch, -0.2, 0.2); I.ph = clamp(s.roll, -0.2, 0.2); AI.hdg = s.hdg;
  };
  AI.off = () => { AI.phase = 'off'; AI.target = null; };
  AI.step = (H, dt, env) => {
    const c = AI.ctl; if (AI.phase === 'off') return null;
    AI.t += dt;
    const T = AI.target && AI.target();
    if (!T || AI.phase === 'landed' || H.landed && AI.phase === 'descend') {   // down: collective full down, stick neutral
      if (AI.phase !== 'off') AI.phase = 'landed';
      c.coll = Math.max(0, c.coll - 0.8 * dt); c.cx = 0; c.cy = 0; c.pedal = 0;
      return c;
    }
    const s = state(H), P = H.pos, dx = T.x - P.x, dz = T.z - P.z, d = Math.hypot(dx, dz), tvx = T.vx || 0, tvz = T.vz || 0;
    AI.err = d;
    // ---- where to go: a ground velocity (world) and a height
    let wx, wz, yDes, vzMax = 4;
    if (AI.phase === 'transit') {
      const sp = clamp(Math.sqrt(2 * 0.9 * Math.max(0, d - 8)), 6, HELI_AI.CRUISE);   // brakes in time: ~0.9 m/s2
      wx = tvx + dx / d * sp; wz = tvz + dz / d * sp;
      // cruise height: over the highest ground along the next ~10 s of the track and over the target
      let hi = Math.max(T.y, env.ground(P.x, P.z));
      for (const k of [0.25, 0.5, 0.75, 1]) { const L = Math.min(d, sp * 10) * k; hi = Math.max(hi, env.ground(P.x + dx / d * L, P.z + dz / d * L)); }
      yDes = hi + HELI_AI.CRUISE_AGL + HELI_AI.SKID;
      if (d < HELI_AI.APPROACH_R) AI.phase = 'approach';
    } else {
      const sp = Math.min(d * 0.18, Math.sqrt(2 * 0.6 * d), 7);
      wx = tvx + (d > 0.01 ? dx / d * sp : 0); wz = tvz + (d > 0.01 ? dz / d * sp : 0);
      const rel = Math.hypot(H.vel.x - tvx, H.vel.z - tvz);
      if (AI.phase === 'approach') {
        yDes = Math.max(T.y + HELI_AI.HOVER_H, env.ground(P.x, P.z) + 6) + HELI_AI.SKID;
        if (d < 3.5 && rel < 1.5 && Math.abs(P.y - yDes) < 3) AI.phase = 'descend';
        if (d > HELI_AI.APPROACH_R * 1.6) AI.phase = 'transit';
      } else {   // descend: straight down, slowing to a gentle touchdown; back up if it drifts off the spot
        const agl = P.y - HELI_AI.SKID - T.y;
        yDes = null; vzMax = -clamp(agl * 0.35, 0.45, 2.2);
        if (d > 6) AI.phase = 'approach';
      }
    }
    // heading: along the track en route; over the spot the deck's heading (or the one it had)
    if (AI.phase === 'transit' && Math.hypot(wx - tvx, wz - tvz) > 4) AI.hdg = Math.atan2(wx - tvx, -(wz - tvz));
    else if (T.hdg !== undefined && T.hdg !== null && AI.phase !== 'transit') AI.hdg = T.hdg;
    // ---- the bench pilot's loops, on body-axis velocity errors
    const uDes = wx * s.fx + wz * s.fz, vDes = wx * -s.fz + wz * s.fx;
    I.th = clamp(I.th + (s.u - uDes) * 0.012 * dt, -0.3, 0.3);
    const thT = clamp(I.th + (s.u - uDes) * 0.045, -0.26, 0.3);
    I.ph = clamp(I.ph - (s.v - vDes) * 0.012 * dt, -0.2, 0.2);
    const phT = clamp(I.ph - (s.v - vDes) * 0.045, -0.3, 0.3);
    I.lon = clamp(I.lon + (thT - s.pitch) * 1.2 * dt, -1, 1); I.lat = clamp(I.lat + (phT - s.roll) * 1.5 * dt, -1, 1);
    c.cy = clamp(I.lon + (thT - s.pitch) * 3 - s.q * 1.2, -1, 1);
    c.cx = clamp(I.lat + (phT - s.roll) * 3 - s.p * 0.8, -1, 1);
    const dh = wrap(AI.hdg - s.hdg), dhc = clamp(dh, -0.6, 0.6);
    I.ped = clamp(I.ped + (dhc * 1.0 - s.r) * 0.8 * dt, -1, 1); c.pedal = clamp(I.ped + dhc * 1.5 - s.r * 1.2, -1, 1);
    const vzDes = yDes === null ? vzMax : clamp((yDes - P.y) * 0.45, -3, vzMax);
    I.c = clamp(I.c + (vzDes - s.vz) * 0.05 * dt, 0, 1); c.coll = clamp(I.c + (vzDes - s.vz) * 0.08, 0, 1);
    return c;
  };
  return AI;
}
