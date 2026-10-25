// THE GROUND WAR: the seized MBTs (runaway/mbt.js) on the TANK agent's tracked-vehicle sim (armor/trackfm.js).
// Pure (no THREE, no DOM): runs in node (tools/groundwarbench.mjs).
//
//   createMBT(MBT.m1a2, { drive: createTrackDrive })       mbt.js's documented drive factory: the turret, gun,
//                                                          damage and autopilot stay mbt.js's; the hull is trackfm's
//   TRACK_PARAMS.m1a2 / .t90m                              trackfm parameter sets (M60A3 format)
//   drive.setDetail(full, env)                             level of detail: far from the camera the drive falls back to
//                                                          mbt.js's placeholder (no suspension, no soil) and comes back
//                                                          to trackfm where it left off
//
// Sources: general published figures only (the same as runaway/mbt.js: dimensions, combat mass, engine power, top
// speed, roadwheel count). Tags as the TANK agent's: C = published figure (commonly quoted: manufacturer brochures,
// Jane's summaries as on Wikipedia / Army Recognition), U = unverified, I = inferred / tuned to a C figure.
// Weapons and armour stay mbt.js's game tables.
import { createTrackSim } from '../armor/trackfm.js';
import { M60A3 } from '../armor/m60a3.js';
import { createPlaceholderDrive } from '../runaway/mbt.js';

const IN = 0.0254, HP = 745.7, LBFT = 1.35582;
const clone = o => JSON.parse(JSON.stringify(o));

// build hull probes and buoyancy columns for a hull of length L, width W, deck height Hd, turret top Ht (M60A3's layout scaled)
function hullShape(P, L, W, Hd, Ht, gunFwd, gunY) {
  const c = P.HULL.CLEAR, hl = L / 2, hw = W / 2, PR = P.HULL.PROBES = [], C = P.HULL.COLS = [];
  const add = (name, p, n, mu) => { const l = Math.hypot(...n); PR.push({ name, p, n: n.map(v => v / l), mu }); };
  for (const x of [-hw * 0.52, hw * 0.52]) for (const z of [-hl * 0.78, -hl * 0.39, 0, hl * 0.39, hl * 0.78]) add('belly', [x, c, z], [0, -1, 0]);
  for (const x of [-hw * 0.55, 0, hw * 0.55]) { add('nose', [x, c + 0.15, -hl * 0.92], [0, -0.6, -0.8]); add('noseTip', [x, c + 0.55, -hl], [0, -0.2, -1]); add('glacis', [x, Hd - 0.1, -hl * 0.86], [0, 0.42, -0.9]); }
  for (const x of [-hw * 0.55, 0, hw * 0.55]) { add('tailLow', [x, c + 0.2, hl * 0.95], [0, -0.55, 0.83]); add('tail', [x, Hd - 0.2, hl], [0, 0, 1]); }
  for (const s of [-1, 1]) for (const z of [-hl * 0.85, -hl * 0.3, hl * 0.3, hl * 0.85]) { add('fender', [s * hw, Hd - 0.25, z], [s, 0.1, 0]); add('roofEdge', [s * (hw - 0.1), Hd, z], [s * 0.6, 0.8, 0]); }
  for (const s of [-1, 1]) for (const z of [-0.9, 0.9]) add('turret', [s * hw * 0.62, Ht - 0.15, z], [s * 0.5, 0.85, 0]);
  add('turretTop', [0, Ht, 0], [0, 1, 0]);
  add('muzzle', [0, gunY, -gunFwd], [0, 0, -1], 0.4); PR[PR.length - 1].k = 2.5e5; PR[PR.length - 1].c = 1.2e5;
  for (const z of [-hl * 0.63, 0, hl * 0.63]) for (const x of [-hw * 0.3, hw * 0.3]) { C.push({ x, z, ax: hw * 0.3, az: hl * 0.32, y0: c, y1: Hd * 0.6 }); C.push({ x: x * 1.36, z, ax: hw * 0.41, az: hl * 0.32, y0: Hd * 0.6, y1: Hd }); }
}

export const TRACK_PARAMS = {};
// ---- M1A2 SEPv3 (seized; RUNAWAY crew)
{
  const P = TRACK_PARAMS.m1a2 = clone(M60A3);
  P.name = 'M1A2 SEPv3';
  P.MASS = 66800;                          // C (~73.6 short tons, SEPv3 combat weight)
  P.CG = [0, 1.05, 0.15];                  // I: low hull, heavy turret forward, turbine and transmission aft
  P.I = [330e3, 360e3, 105e3];             // I: 0.85 x solid box 7.93 x 3.66 x 2.44 m
  P.FUEL_L = 1907;                         // 504 US gal C
  P.AERO_CDA = 8.5;
  P.DIM = { HULL_L: 7.93, LEN_GUN_FWD: 9.77, WIDTH: 3.66, HEIGHT: 2.44, CLEAR: 0.48 };   // C
  Object.assign(P.TRACK, {
    GAUGE: 3.0,                            // track centres I (3.66 m over skirts - 0.635 m track)
    WIDTH: 0.635,                          // T-158 C
    PITCH: 0.192, SHOES: 78,               // U
    THICK: 0.09, WHEEL_R: 25.5 * IN / 2,   // 25.5 in roadwheels U
    WHEELS: [-2.13, -1.42, -0.71, 0, 0.71, 1.42, 2.13],   // 7 per side C, even spacing I -> contact ~4.6 m (mbt.js)
    FRONT: { z: -3.25, y: 0.62, r: 0.33, kind: 'idler' },
    REAR: { z: 3.3, y: 0.7, r: 0.35, kind: 'sprocket', teeth: 11 },   // rear drive C
    RETURN: [{ z: -1.8, y: 1.0 }, { z: -0.3, y: 1.02 }, { z: 1.4, y: 1.0 }],   // support rollers U
    J_SPROCKET: 420,
  });
  P.TRACK.SPROCKET_R = 0.192 / (2 * Math.sin(Math.PI / 11));
  // torsion bars and rotary shocks: 15 in of roadwheel travel (C, quoted for the M1) -> soft, long travel
  Object.assign(P.SUSP, { K: 2.0e5, C: [3.8e4, 3.8e4, 0, 0, 0, 0, 3.8e4], REBOUND: 0.15, BUMP: 0.23 });
  // AGT1500 gas turbine: 1,500 shp (C) at ~3,000 rpm output; output torque falls with speed (a free power turbine),
  // ~3,950 lb ft peak (U). Turbines spool slowly: a long injection lag stands in for the gas generator (I).
  Object.assign(P.ENGINE, {
    IDLE: 1000, GOV: 3000, CUTOFF: 3150, STALL_RPM: 250, LIGHT_RPM: 120,
    CURVE: [[0, 4200], [500, 4800], [1000, 3950 * LBFT], [2000, 4500], [3000, 1500 * HP / (3000 / 9.549)], [3150, 2200], [3300, 0]],
    FRICTION: [60, 40], J: 2.2, KGOV: 140, TAU: 1.8,
    STARTER: 600, STARTER_RPM: 300, FAN_W: 40 * HP,
    SFC: 0.36 / 3.6e6, IDLE_FUEL: 0.012, FUEL_DENS: 0.81,   // a thirsty turbine: ~45 L/h at idle (U)
  });
  P.CONV = { KF: 5.2, STALL_TR: 1.7, COUPLING: 0.86, OVERRUN: 1.1 };
  // X1100-3B: 4 forward, 2 reverse, automatic (C); hydrostatic steer, pivots (C). Ratios not published -> I:
  // top gear gives the governed 67 km/h (C, mbt.js), first the 60 % gradient (C), reverse ~30 km/h (C).
  P.TRANS = {
    ...P.TRANS,
    ranges: { R: { ratio: -2.95 }, '1': { ratio: 4.9 }, '2': { ratio: 2.75 }, '3': { ratio: 1.75 }, '4': { ratio: 1.2 }, D: { auto: 4 } },
    AUTO: ['1', '2', '3', '4'], UP_RPM: 2700, DOWN_RPM: 1500,
    FINAL: 4.4,
    LOCKUP: { ranges: ['2', '3', '4'], SR: 0.8, ON_RPM: 1700, OFF_RPM: 1400, CAP: 6000 },
    J_TURBINE: 2.6, TURB_DRAG: 0.45, CLUTCH_CAP: 3.6e4, SHIFT_T: 0.6,
    BRAKE: 1.1e5,
    STEER: { REF: 'input', K: 0.05, PIVOT: true, CAP: 9e4 },
  };
  P.HULL = { ...P.HULL, CLEAR: 0.48, K: 3.6e6, C: 2.8e5, INTAKE_Y: 1.5, INTAKE_Z: 3.2, DECK_Y: 1.6, DECK_Z: 3.3 };
  hullShape(P, 7.93, 3.66, 1.62, 2.44, 5.7, 2.05);
  P.WATER = { ...P.WATER, SWIMS: false };   // fords 1.22 m unprepared (C)
}
// ---- T-90M (seized; RUNAWAY crew)
{
  const P = TRACK_PARAMS.t90m = clone(M60A3);
  P.name = 'T-90M';
  P.MASS = 48000;                          // C (46.5-48 t)
  P.CG = [0, 0.95, 0.1];
  P.I = [210e3, 230e3, 80e3];
  P.FUEL_L = 1600;                         // internal 1,600 L (U), plus drums
  P.AERO_CDA = 7.8;
  P.DIM = { HULL_L: 6.86, LEN_GUN_FWD: 9.63, WIDTH: 3.78, HEIGHT: 2.23, CLEAR: 0.49 };   // C (mbt.js)
  Object.assign(P.TRACK, {
    GAUGE: 2.79,                           // C (mbt.js)
    WIDTH: 0.58,                           // C
    PITCH: 0.137, SHOES: 96,               // U
    THICK: 0.08, WHEEL_R: 0.375,           // 750 mm roadwheels C
    WHEELS: [-2.05, -1.23, -0.41, 0.41, 1.23, 2.05],   // 6 per side C; contact ~4.27 m (mbt.js) I
    FRONT: { z: -2.95, y: 0.58, r: 0.3, kind: 'idler' },
    REAR: { z: 3.0, y: 0.62, r: 0.33, kind: 'sprocket', teeth: 13 },
    RETURN: [{ z: -1.6, y: 0.95 }, { z: -0.1, y: 0.97 }, { z: 1.4, y: 0.95 }],
    J_SPROCKET: 300,
  });
  P.TRACK.SPROCKET_R = 0.137 / (2 * Math.sin(Math.PI / 13));
  Object.assign(P.SUSP, { K: 1.9e5, C: [3e4, 3e4, 0, 0, 0, 3e4], REBOUND: 0.12, BUMP: 0.18 });
  // V-92S2F diesel: 1,130 hp (C) at 2,000 rpm (U)
  Object.assign(P.ENGINE, {
    IDLE: 800, GOV: 2000, CUTOFF: 2150, STALL_RPM: 380, LIGHT_RPM: 160,
    CURVE: [[0, 0], [500, 2600], [900, 4200], [1400, 4700], [2000, 1130 * HP / (2000 / 9.549)], [2150, 2600], [2300, 0]],
    FRICTION: [100, 80], J: 3.2, KGOV: 120, TAU: 0.15,
    STARTER: 700, STARTER_RPM: 280, FAN_W: 60 * HP,
    SFC: 0.235 / 3.6e6, IDLE_FUEL: 0.003, FUEL_DENS: 0.84,
  });
  // mechanical gearbox and main clutch (no converter): a stiff coupling stands in (I); 7 forward, 1 reverse (C, T-72
  // family), shifted automatically here. Top gear the 60 km/h road speed (C), reverse ~17 km/h (mbt.js) I.
  P.CONV = { KF: 3.3, STALL_TR: 1.25, COUPLING: 0.9, OVERRUN: 1.05 };
  P.TRANS = {
    ...P.TRANS,
    ranges: { R: { ratio: -2.9 }, '1': { ratio: 8.0 }, '2': { ratio: 5.0 }, '3': { ratio: 3.4 }, '4': { ratio: 2.45 }, '5': { ratio: 1.75 }, '6': { ratio: 1.25 }, '7': { ratio: 0.72 }, D: { auto: 7 } },
    AUTO: ['1', '2', '3', '4', '5', '6', '7'], UP_RPM: 1850, DOWN_RPM: 1100,
    FINAL: 4.6,
    LOCKUP: { ranges: ['2', '3', '4', '5', '6', '7'], SR: 0.82, ON_RPM: 1100, OFF_RPM: 900, CAP: 7000 },
    J_TURBINE: 1.6, TURB_DRAG: 0.35, CLUTCH_CAP: 3e4, SHIFT_T: 0.9,
    BRAKE: 8e4,
    STEER: { REF: 'input', K: 0.045, PIVOT: true, CAP: 7e4 },   // planetary steering gears; neutral pivot I (game)
  };
  P.HULL = { ...P.HULL, CLEAR: 0.49, K: 3.2e6, C: 2.4e5, INTAKE_Y: 1.3, INTAKE_Z: 2.6, DECK_Y: 1.42, DECK_Z: 2.9 };
  hullShape(P, 6.86, 3.78, 1.42, 2.23, 5.95, 1.82);
  P.WATER = { ...P.WATER, SWIMS: false };   // fords 1.2 m unprepared (C)
}

// ---- M60A3 TTS (PARITY, ngc/parity: the Task Force's AI tank in the ground war): the TANK agent's own set, unchanged
{
  const P = TRACK_PARAMS.m60a3 = clone(M60A3);
  // the AI crew's driver works the CD-850's two ranges as tankbench's driver does (L -> H at ~11 km/h, back to L below
  // ~9 km/h): a 'D' selector over L / H stands in for him (createTrackDrive drives in 'D')
  P.TRANS.ranges.D = { auto: 2 }; P.TRANS.AUTO = ['L', 'H']; P.TRANS.UP_RPM = 2100; P.TRANS.DOWN_RPM = 430;   // turbine rpm in L at 11 km/h; in H at ~9 km/h (I)
}

// ---- the drive factory for mbt.js: createMBT(MBT.m1a2, { drive: createTrackDrive })
// interface (mbt.js): place(x, z, yaw, env), step(dt, { throttle -1..1, steer -1..1, brake 0..1 }, env), p [x, y, z]
// (hull origin on the ground), yaw, pitch (+ nose up), roll (+ right side down), speed (m/s + forward), yawRate,
// wheelSpin [left, right] (track travel, m)
export function createTrackDrive(Pm, opt = {}) {
  const P = TRACK_PARAMS[Pm.id]; if (!P) return createPlaceholderDrive(Pm);
  const sim = createTrackSim(P, { substep: opt.substep ?? 1 / 120 });
  const lite = createPlaceholderDrive(Pm);
  const D = { p: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, speed: 0, yawRate: 0, wheelSpin: [0, 0], engine: 0.3, full: true, sim, lite, events: [], rpm: 0, gear: 'N' };
  const _o = [0, 0, 0];
  function sync() {
    if (D.full) {
      sim.origin(_o); D.p[0] = _o[0]; D.p[1] = _o[1]; D.p[2] = _o[2];
      const at = sim.attitude(), y0 = D.yaw; D.yaw = at.heading; D.pitch = at.pitch; D.roll = -at.roll; D.speed = sim.out.fwd;
      D.wheelSpin[0] = sim.trackPos[0]; D.wheelSpin[1] = sim.trackPos[1];
      D.rpm = sim.eng.w * 9.549 / P.ENGINE.GOV; D.engine = Math.min(1, sim.eng.load ?? D.engine); D.gear = sim.range;
      return y0;
    }
    D.p[0] = lite.p[0]; D.p[1] = lite.p[1]; D.p[2] = lite.p[2]; D.yaw = lite.yaw; D.pitch = lite.pitch; D.roll = lite.roll; D.speed = lite.speed; D.yawRate = lite.yawRate;
    D.wheelSpin[0] = lite.wheelSpin[0]; D.wheelSpin[1] = lite.wheelSpin[1]; D.rpm = 0.4 + 0.6 * lite.engine; D.engine = lite.engine;
    return D.yaw;
  }
  D.place = (x, z, yaw, env) => {
    sim.reset(x, z, yaw, env, { range: 'N', park: true, running: true });
    lite.place(x, z, yaw, env); sync(); return D;
  };
  D.setDetail = (full, env) => {
    if (full === D.full) return;
    if (full) {   // back to the full sim where the cheap one left off (same speed, on the ground under it)
      sim.reset(lite.p[0], lite.p[2], lite.yaw, env, { range: 'D', park: false, running: true, speed: Math.max(0, lite.speed) });
      sim.trackPos[0] = lite.wheelSpin[0]; sim.trackPos[1] = lite.wheelSpin[1];
    } else { lite.place(D.p[0], D.p[2], D.yaw, env); lite.speed = D.speed; lite.wheelSpin[0] = D.wheelSpin[0]; lite.wheelSpin[1] = D.wheelSpin[1]; }
    D.full = full; sync();
  };
  D.step = (dt, c, env) => {
    D.events.length = 0;
    if (!D.full) { lite.step(dt, c, env); sync(); return D.events; }
    const thr = c.throttle || 0, ctl = sim.ctl, v = sim.out.fwd || 0;
    // the driver: forward in D, reverse in R (only once nearly stopped), brakes to stop or to change direction
    ctl.park = false; ctl.fuelOn = true; ctl.starter = !sim.eng.running;
    if (thr > 0.02) { if (v < -0.6) { ctl.range = ctl.range; ctl.brake = 1; ctl.throttle = 0; } else { ctl.range = 'D'; ctl.throttle = Math.min(1, thr); ctl.brake = c.brake || 0; } }
    else if (thr < -0.02) { if (v > 0.6) { ctl.brake = 1; ctl.throttle = 0; } else { ctl.range = 'R'; ctl.throttle = Math.min(1, -thr); ctl.brake = c.brake || 0; } }
    else if (Math.abs(c.steer || 0) > 0.1 && Math.abs(v) < 0.8) { ctl.range = 'N'; ctl.throttle = 0.35 + 0.45 * Math.abs(c.steer); ctl.brake = Math.abs(D.pitch) > 0.03 ? 0.5 : 0; }   // neutral steer (on a slope the brakes stay half on, or it would roll away): pivot in place on the engine
    else { ctl.throttle = 0; ctl.brake = Math.max(c.brake || 0, Math.abs(v) < 0.3 ? 1 : 0.35); }
    // (PARITY fixes, ngc/parity, found with the M60A3's geared cross-drive and half the power to weight: a hard turn from a
    // crawl in gear needs revs - it stalled at full lock on the autopilot's ~0.2 throttle and sat there; and a turn the
    // autopilot brakes for (the way wanted is behind it) is a neutral pivot, not a fight between gear, brakes and steer)
    const hard = Math.abs(c.steer || 0) > 0.6 && Math.abs(v) < 1;
    if (hard && thr > 0.02 && (c.brake || 0) > 0.3 && Math.abs(v) < 0.8) { ctl.range = 'N'; ctl.throttle = 0.35 + 0.45 * Math.abs(c.steer); ctl.brake = Math.abs(D.pitch) > 0.03 ? 0.5 : 0; }
    else if (hard && thr > 0.02 && ctl.range !== 'N') ctl.throttle = Math.max(ctl.throttle, 0.3 + 0.5 * Math.abs(c.steer));
    ctl.steer = c.steer || 0;
    const ev = sim.step(dt, env); for (const e of ev) D.events.push(e);
    const y0 = sync();
    let dy = D.yaw - y0; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI; D.yawRate = dt > 0 ? dy / dt : 0;
    return D.events;
  };
  return D;
}

// ------------------------------------------------------------------------------------------------- road routes
// A route along the WORLD road graph (world/net.js roadGraph): from the road nearest the start to the road point
// nearest the goal, Dijkstra over the junction graph, then sampled every `step` m. Returns [[x, z], ...] or null when
// there is no road worth taking (none near, or no shorter than going straight). Pure: the graph is passed in.
//   graph = roadGraph(cx, cz, r) -> { roads: [{ id, xs, zs, s, len, junctions: [{ s, road, end }], a, b }], nodes: [{ id, x, z, roads: [{ road, end }] }] }
export function roadRoute(graph, x0, z0, x1, z1, o = {}) {
  if (!graph || !graph.roads || !graph.roads.length) return null;
  const maxOff = o.maxOff ?? 70, step = o.step ?? 8;
  // nearest point on any road: { road, i (segment), s (arc length) , d }
  const nearest = (x, z) => {
    let best = null;
    for (const R of graph.roads) for (let i = 0; i < R.xs.length - 1; i++) {
      const ax = R.xs[i], az = R.zs[i], bx = R.xs[i + 1], bz = R.zs[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), px = ax + dx * k, pz = az + dz * k, d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { R, i, k, s: R.s[i] + (R.s[i + 1] - R.s[i]) * k, d, x: px, z: pz };
    }
    return best;
  };
  const A = nearest(x0, z0), B = nearest(x1, z1);
  if (!A || !B || A.d > maxOff || B.d > maxOff) return null;
  // graph: vertices = road ends and junction points (road id + s); edges along roads and through junctions
  const V = new Map(), key = (rid, s) => rid + ':' + Math.round(s);
  const vert = (R, s) => { const k = key(R.id, s); if (!V.has(k)) V.set(k, { k, R, s, e: [] }); return V.get(k); };
  const byId = new Map(graph.roads.map(R => [R.id, R]));
  for (const R of graph.roads) {
    const pts = [0, R.len, ...(R.junctions || []).map(j => j.s)];
    if (R === A.R) pts.push(A.s); if (R === B.R) pts.push(B.s);
    const sorted = [...new Set(pts.map(s => Math.round(s)))].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) { const u = vert(R, sorted[i]), w = vert(R, sorted[i + 1]), c = sorted[i + 1] - sorted[i]; u.e.push([w, c]); w.e.push([u, c]); }
    for (const j of R.junctions || []) { const O = byId.get(j.road); if (!O) continue; const u = vert(R, j.s), w = vert(O, j.end ? O.len : 0); u.e.push([w, 0]); w.e.push([u, 0]); }
  }
  for (const n of graph.nodes || []) for (let i = 0; i < n.roads.length; i++) for (let j = i + 1; j < n.roads.length; j++) {
    const Ra = byId.get(n.roads[i].road), Rb = byId.get(n.roads[j].road); if (!Ra || !Rb) continue;
    const u = vert(Ra, n.roads[i].end ? Ra.len : 0), w = vert(Rb, n.roads[j].end ? Rb.len : 0); u.e.push([w, 0]); w.e.push([u, 0]);
  }
  const src = vert(A.R, A.s), dst = vert(B.R, B.s);
  const dist = new Map([[src.k, 0]]), prev = new Map(), open = [src];
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (dist.get(open[i].k) < dist.get(open[bi].k)) bi = i;
    const u = open.splice(bi, 1)[0]; if (u === dst) break;
    for (const [w, c] of u.e) { const nd = dist.get(u.k) + c; if (nd < (dist.get(w.k) ?? Infinity)) { dist.set(w.k, nd); prev.set(w.k, u); if (!open.includes(w)) open.push(w); } }
  }
  if (!dist.has(dst.k)) return null;
  const chain = []; for (let v = dst; v; v = prev.get(v.k)) chain.unshift(v);
  const out = [[A.x, A.z]];
  const at = (R, s) => { let i = 0; while (i < R.s.length - 2 && R.s[i + 1] < s) i++; const k = (s - R.s[i]) / ((R.s[i + 1] - R.s[i]) || 1); return [R.xs[i] + (R.xs[i + 1] - R.xs[i]) * k, R.zs[i] + (R.zs[i + 1] - R.zs[i]) * k]; };
  for (let i = 0; i < chain.length - 1; i++) {
    const u = chain[i], w = chain[i + 1]; if (u.R !== w.R) continue;
    const n = Math.max(1, Math.ceil(Math.abs(w.s - u.s) / step));
    for (let k = 1; k <= n; k++) out.push(at(u.R, u.s + (w.s - u.s) * k / n));
  }
  out.push([x1, z1]);
  const roadLen = dist.get(dst.k) + A.d + B.d, straight = Math.hypot(x1 - x0, z1 - z0);
  if (o.onlyIfShorter && roadLen > straight * (o.detour ?? 1.6)) return null;
  return out;
}
// follow a route: the next point to steer at (pure pursuit with a look-ahead), the index advancing as it is passed
export function routeTarget(route, st, x, z, look = 12) {
  while (st.i < route.length - 1 && Math.hypot(route[st.i][0] - x, route[st.i][1] - z) < look) st.i++;
  return route[st.i];
}
