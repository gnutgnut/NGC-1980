// ch46ai.js - how the AI flies the CH-46: mission profile numbers for transportai.js and the adapter from guidance
// to the tandem's controls (pilot.js loops, torque limiting, hands on the ground). Pure JS.
import { clamp } from './rb.js';

// Mission profile (INFERRED from the usual Marine assault-support habits, scaled to a 1.3 km war zone): cruise 90 kt,
// ~45 m above the terrain, a 10 deg approach, 1.2 m/s2 deceleration rising to a ~10-12 deg flare over the last 70 m,
// a hover check at 5 m, vertical descent; ship recovery from a hover off the port quarter.
export const CH46_AI = {
  cruise: 46, aDec: 1.2, stop: 0.6, glide: 10 * Math.PI / 180, flat: 18, hover: 5, agl: 45, clear: 18, kh: 0.45, vDesc: 4, vClimb: 6,
  hdgDist: 70, liftAgl: 7, spool: 2.5, flareTilt: 0.33, flareA: 2.6,   // flare: up to ~15 deg nose up while behind the braking plan
};
// guidance cmd -> controls. On the ground: collective as asked, stick and pedals centred, the loops' memory reset.
// In the air: pilot.js, with the torque held under the transmission limit (a pilot watches the torque gauge).
export function flyCH46(S, P, st, cmd, dt) {
  if (cmd.ground) {
    P.i.lon = P.i.lat = P.i.ped = 0; P.i.th = P.i.ph = 0; P.i.coll = cmd.collFix ?? 0;
    return { coll: cmd.collFix ?? 0, lon: 0, lat: 0, ped: 0 };
  }
  if (S.body.contacts >= 2) {   // light on the wheels: no trim wind-up against the gear, pull pitch smoothly
    P.i.lon = P.i.lat = P.i.th = P.i.ph = 0; P.i.coll = Math.min(P.i.coll, S.c.coll + 0.04);
  }
  const c = P.step(st, dt, cmd);
  // torque limiting: a collective ceiling that follows the rotor power against the transmission limit smoothly (the pilot
  // on the torque gauge; rotor power, not the needle, so a passing rpm droop doesn't make it pump), no integrator wind-up
  const pw = (S.rf.power + S.ra.power) / S.xmsn;
  P.cMax = clamp((P.cMax ?? 1) + (0.96 - pw) * (pw > 0.96 ? 2.5 : 0.8) * dt, 0.25, 1);
  if (c.coll > P.cMax) { c.coll = P.cMax; P.i.coll = Math.min(P.i.coll, P.cMax); }
  return c;
}
