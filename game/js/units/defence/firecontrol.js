// AIR DEFENCE fire control: sensors, tracking, lead solutions, gun ballistics and dispersion, missiles, a laser.
// Pure: plain JS objects, no THREE, no DOM, no game imports, so it runs in node (tools/defencebench.mjs).
//
// What is simulated (per fire unit, per step):
//   1. SEARCH: a scanning radar (or the gunner's eyes) rolls a detection per scan for every target in its coverage.
//      Radar: Swerling-1 Pd = Pfa^(1/(1+SNR)), SNR ~ RCS / R^4 from the system's R50 (the range at which a 1 m^2
//      target is seen on half the looks). Line of sight is checked against the terrain height function (masking).
//      Low flyers pay a clutter penalty: a target near the ground/sea whose radial speed falls inside the radar's
//      MTI / Doppler notch (hovering, or flying a circle round the radar = "beaming") loses most of its SNR, and very
//      low targets over a flat surface fade by multipath.
//   2. TRACK: an alpha-beta filter on noisy measurements (range noise, angle noise) at the track rate. Misses coast
//      the track; too long without a hit drops it. Track quality q (0..1) grows with consecutive updates.
//      VADS is different: its AN/VPS-2 radar measures range (and range rate) only; the gunner tracks the target by eye
//      through the M61 gyro lead-computing sight, so the angles come with a human lag and jitter (that is why VADS
//      misses jinkers and hard crossers).
//   3. LEAD: constant-velocity intercept with the round's real ballistics: quadratic drag (closed form along the line
//      of fire) and the gravity drop of a decelerating round (closed form, see dropOf), iterated to convergence.
//   4. MOUNT: the turret slews in azimuth and elevation with rate and acceleration limits (fast close crossers outrun
//      the servos), and fires only when the pointing error is inside the tolerance and the track is good.
//   5. GUN: real rates of fire, burst lengths, barrel spin-up, per-round dispersion plus a per-burst bias, ammunition
//      count, reloads; rounds carry their tracer and self-destruct times. Phalanx closes the loop on its own stream.
//   6. MISSILES: 3-DOF point mass with a thrust curve and staging (57E6 booster + unpowered dart), drag, an
//      aerodynamic g limit that falls with dynamic pressure, and the guidance law of the real missile: command to line
//      of sight (Pantsir 57E6: the ground radar tracks target and missile and radios steering commands), or
//      proportional navigation with a gimbal-limited semi-active seeker (Sea Sparrow RIM-7H, needs the illuminator on
//      the target). Proximity fuse; warhead lethality vs miss distance.
//   7. LASER: irradiance on target from power, aperture, wavelength, beam quality, jitter, tracking error,
//      turbulence and the optical depth along the path (haze + smoke); the dose heats a spot that cools when the beam
//      slips (so it has to dwell); kill at the target's burn-through dose. A heat magazine limits lasing time.
//
// Units: SI (m, s, kg, rad). Frame: y up; azimuth as the game's yaw (az = atan2(-dx, -dz), 0 = looking along -z).
// Every number is tagged in tools/defencebench.mjs with CONFIRMED / INFERRED / UNVERIFIED and its source.
//
// The THEATRE: the archipelago is 1.3 km across; a Pantsir's real missile reach (20 km) would cover it many times over.
// Each system therefore gets a game envelope (GAME.R: weapons-free range) and its sensor ranges are shrunk by the same
// factor (game R / real effective R), so detection margins at the edge of the envelope are the real ones. Speeds,
// rates of fire, dispersion in mrad, missile kinematics, servo rates and reaction times stay real.

export const G0 = 9.81;
export const RHO0 = 1.225;
const D2R = Math.PI / 180, MIL = 1e-3;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

// ------------------------------------------------------------------------------------------- random numbers
// mulberry32: seeded, so the bench is repeatable; gauss by Box-Muller
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.gauss = () => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  return r;
}

// ------------------------------------------------------------------------------------------- ballistics
// Quadratic drag along the line of fire, closed form: s(t) = ln(1 + a t) / k, v(t) = v0 / (1 + a t), a = k v0,
// with k = rho Cd A / (2 m)  [1/m]  (v(s) = v0 e^(-k s)).
export const kOf = (cd, dmm, m) => RHO0 * cd * Math.PI * (dmm / 2000) ** 2 / (2 * m);
export const tofOf = (k, v0, R) => (Math.exp(k * R) - 1) / (k * v0);
export const velAt = (k, v0, R) => v0 * Math.exp(-k * R);
// gravity drop below the line of a round that slows by drag (linearised in g): w' = -g - k|v| w gives
// y(t) = -g / (2 a^2) ((u^2 - 1) / 2 - ln u), u = 1 + a t; it tends to g t^2 / 2 as k -> 0.
export function dropOf(k, v0, t, g = G0) {
  const a = k * v0, u = 1 + a * t;
  if (a * t < 1e-4) return 0.5 * g * t * t;
  return g / (2 * a * a) * ((u * u - 1) / 2 - Math.log(u));
}

// ------------------------------------------------------------------------------------------- ammunition
// m: projectile (flying) mass kg; v0 m/s; k from Cd and calibre; tracer: burn s; sd: self-destruct s (0 = none);
// cls: hit-effect class (TARGETS.pk). Drag coefficients are INFERRED (typical supersonic projectiles, Cd ~0.3).
export const AMMO = {
  M56A3: { name: 'M56A3 HEI', cal: 20, m: 0.102, v0: 1030, k: kOf(0.30, 20, 0.102), tracer: 0, sd: 0, cls: '20HE' },
  // M246: self-destructs at ~1,800 m of flight (TM 43-0001-27): the fuse time is the time of flight to 1,800 m
  M246: { name: 'M246 HEI-T-SD', cal: 20, m: 0.102, v0: 1030, k: kOf(0.30, 20, 0.102), tracer: 1.9, sd: 0, sdR: 1800, cls: '20HE' },
  OFZT: { name: '23 mm OFZT HE-T', cal: 23, m: 0.188, v0: 980, k: kOf(0.30, 23, 0.188), tracer: 3.0, sd: 8.0, cls: '23HE' },
  BZT: { name: '23 mm BZT API-T', cal: 23, m: 0.190, v0: 970, k: kOf(0.28, 23, 0.190), tracer: 3.0, sd: 0, cls: '23HE' },
  // Mk 149: the 15 mm DU penetrator (70 g) flies on after the sabot falls away
  MK149: { name: 'Mk 149 APDS (DU)', cal: 15, m: 0.070, v0: 1113, k: kOf(0.25, 15, 0.070), tracer: 0, sd: 0, cls: 'APDS' },
  OFZ30: { name: '30 mm OFZ HE-Frag', cal: 30, m: 0.389, v0: 960, k: kOf(0.30, 30, 0.389), tracer: 0, sd: 0, cls: '30HE' },
  OFZT30: { name: '30 mm OFZT HE-T', cal: 30, m: 0.389, v0: 960, k: kOf(0.30, 30, 0.389), tracer: 3.5, sd: 9.0, cls: '30HE' },
};
for (const A of Object.values(AMMO)) if (A.sdR) A.sd = tofOf(A.k, A.v0, A.sdR);

// ------------------------------------------------------------------------------------------- targets
// rcs: m^2 (aspect-averaged); r: radius of the presented area (m) used for the hit test, sqrt(A_presented / pi);
// pk: chance one hit of a class kills (vulnerable area / presented area); fluence: absorbed laser dose (J/m^2) that
// burns through to something vital; hard: missile warhead hardness (miss distance scale).
export const TARGETS = {
  heli: { name: 'UH-1H class helicopter', rcs: 5, r: 2.4, pk: { '20HE': 0.10, '23HE': 0.14, '30HE': 0.28, APDS: 0.05 }, fluence: 1.4e7, hard: 1 },
  jet: { name: 'F/A-18 class fighter', rcs: 2, r: 2.2, pk: { '20HE': 0.12, '23HE': 0.16, '30HE': 0.30, APDS: 0.07 }, fluence: 1.8e7, hard: 1.15 },
  drone: { name: 'Group 1-2 drone', rcs: 0.02, r: 0.6, pk: { '20HE': 0.7, '23HE': 0.8, '30HE': 0.95, APDS: 0.5 }, fluence: 3e6, hard: 0.5 },
  gunship: { name: 'RW-3 WASP hover drone', rcs: 0.5, r: 1.6, pk: { '20HE': 0.3, '23HE': 0.38, '30HE': 0.6, APDS: 0.2 }, fluence: 7e6, hard: 0.7 },
  transport: { name: 'MV-22 class transport', rcs: 10, r: 3.4, pk: { '20HE': 0.06, '23HE': 0.09, '30HE': 0.2, APDS: 0.03 }, fluence: 2e7, hard: 1.3 },
  missile: { name: 'anti-ship missile', rcs: 0.1, r: 0.35, pk: { '20HE': 0.5, '23HE': 0.6, '30HE': 0.8, APDS: 0.6 }, fluence: 6e6, hard: 0.6 },
};

// ------------------------------------------------------------------------------------------- missiles
// stages: [{ thrust N, burn s, mass0 -> mass1 kg, cd, S m^2 }] in order (the last coasts for ever);
// gMax: autopilot / structural limit (g); cnMax: max normal force coefficient (aero g limit = q S cnMax / m);
// fuse: proximity fuse radius (m); L0 / L1: warhead lethality (Pk 1 inside L0, then exp(-((d - L0) / L1)^2));
// guid: 'clos' (command, wn = command loop bandwidth rad/s) | 'pn' (nav constant, seeker gimbal limit).
export const MISSILES = {
  '57E6': { name: '57E6 (Pantsir-S1)', guid: 'clos', wn: 3.2,
    stages: [{ thrust: 49000, burn: 1.5, mass0: 71, mass1: 44, cd: 0.40, S: 0.00636 }, { thrust: 0, burn: 1e9, mass0: 30, mass1: 30, cd: 0.30, S: 0.00454 }],
    gMax: 35, cnMax: 10, fuse: 10, L0: 6, L1: 4.6, warhead: 20, life: 30 },
  RIM7H: { name: 'RIM-7H Sea Sparrow', guid: 'pn', nav: 4,
    stages: [{ thrust: 46000, burn: 4.0, mass0: 230, mass1: 170, cd: 0.45, S: 0.0324 }, { thrust: 0, burn: 1e9, mass0: 170, mass1: 170, cd: 0.45, S: 0.0324 }],
    gMax: 25, cnMax: 6, fuse: 10, L0: 4, L1: 5, warhead: 30, life: 30, gimbal: 40 * D2R },
};
export const warheadPk = (M, d, hard = 1) => { const x = d * hard; return x <= M.L0 ? 1 : Math.exp(-(((x - M.L0) / M.L1) ** 2)); };

// ------------------------------------------------------------------------------------------- the systems
// sensor.kind: 'radar' (search + track radar), 'optical' (gunner's eyes + range-only radar, VADS), 'eo' (Lance).
// R50: search range (m) where a 1 m^2 target is seen on half the looks; R50t: the tracking radar's; scan: search
// revisit (s); trk: track rate (Hz); sR (m), sA (rad): measurement noise; notch: clutter / MTI notch (m/s radial);
// clut: SNR factor inside the notch near the surface; acq: search-to-track handover (s); react: from lock-on to the
// first shot at the earliest (s); mount: rates (rad/s), accelerations (rad/s^2), elevation limits (rad), h =
// trunnion height above the site (m). gun: rpm, burst (rounds), ammo, spare (stowed), spin (barrel spin-up s), disp
// (rad, 1 sigma per round), bias (rad, 1 sigma per burst), ammoMix (repeating belt), tol (pointing tolerance rad),
// reload (s, GAMEPLAY: the crew reloads from stowage / a resupply). REAL: real envelope; GAME: in-game envelope.
export const SYSTEMS = {
  M163: { name: 'M163 VADS', side: 1, era: '1980',
    sensor: { kind: 'optical', R50: 5000, visR: 6000, scan: 1.0, trk: 20, sR: 6, sA: 1.0 * MIL, lag: 0.30, notch: 0, clut: 1, acq: 2.0, react: 1.5 },
    mount: { azRate: 75 * D2R, azAcc: 150 * D2R, elRate: 60 * D2R, elAcc: 120 * D2R, elMin: -5 * D2R, elMax: 80 * D2R, h: 2.3 },
    gun: { rpm: 3000, rpmGround: 1000, burst: 60, bursts: [10, 30, 60, 100], ammo: 1200, spare: 800, spin: 0.25, disp: 3.0 * MIL, bias: 1.2 * MIL, ammoMix: ['M246', 'M56A3', 'M56A3', 'M56A3'], tol: 6 * MIL, reload: 45, barrels: 6 },
    REAL: { R: 1200, alt: 1200 }, GAME: { R: 420, alt: 420, Rmin: 25 } },
  ZSU234: { name: 'ZSU-23-4 Shilka', side: 1, era: '1980',
    sensor: { kind: 'radar', R50: 13000, R50t: 7500, scan: 1.0, trk: 10, sR: 8, sA: 1.5 * MIL, notch: 8, clut: 0.05, acq: 3.5, react: 2.5 },
    mount: { azRate: 70 * D2R, azAcc: 120 * D2R, elRate: 60 * D2R, elAcc: 100 * D2R, elMin: -4 * D2R, elMax: 85 * D2R, h: 2.1 },
    gun: { rpm: 3400, burst: 40, bursts: [12, 40, 120], ammo: 2000, spare: 0, spin: 0.05, disp: 3.5 * MIL, bias: 1.5 * MIL, ammoMix: ['OFZT', 'OFZT', 'OFZT', 'OFZT', 'BZT'], tol: 7 * MIL, reload: 60, barrels: 4 },
    REAL: { R: 2500, alt: 1500 }, GAME: { R: 480, alt: 480, Rmin: 25 } },
  PHALANX: { name: 'Mk 15 Phalanx Block 0', side: 1, era: '1980',
    sensor: { kind: 'radar', R50: 5500, scan: 0.75, trk: 30, sR: 3, sA: 0.5 * MIL, notch: 3, clut: 0.2, acq: 1.0, react: 1.0, spot: true },
    mount: { azRate: 100 * D2R, azAcc: 400 * D2R, elRate: 86 * D2R, elAcc: 350 * D2R, elMin: -10 * D2R, elMax: 80 * D2R, h: 1.9 },
    gun: { rpm: 3000, burst: 100, bursts: [100, 200], ammo: 989, spare: 0, spin: 0.3, disp: 2.0 * MIL, bias: 1.5 * MIL, ammoMix: ['MK149'], tol: 4 * MIL, reload: 60, barrels: 6 },
    REAL: { R: 1490, alt: 1490 }, GAME: { R: 450, alt: 450, Rmin: 20 } },
  SEASPARROW: { name: 'NATO Sea Sparrow (Mk 29 / RIM-7H)', side: 1, era: '1980',
    sensor: { kind: 'radar', R50: 40000, R50t: 30000, scan: 2.0, trk: 10, sR: 10, sA: 1.0 * MIL, notch: 4, clut: 0.1, acq: 4.0, react: 4.0 },
    mount: { azRate: 60 * D2R, azAcc: 80 * D2R, elRate: 40 * D2R, elAcc: 60 * D2R, elMin: 0 * D2R, elMax: 85 * D2R, h: 1.6 },
    msl: { type: 'RIM7H', ready: 8, salvo: 1, interval: 2.5, reload: 300 },
    REAL: { R: 15000, alt: 15000, Rmin: 1500 }, GAME: { R: 950, alt: 650, Rmin: 140 } },
  PANTSIR: { name: 'Pantsir-S1', side: 2, era: 'modern',
    sensor: { kind: 'radar', R50: 50000, R50t: 20000, scan: 2.0, trk: 25, sR: 3, sA: 0.3 * MIL, notch: 2, clut: 0.3, acq: 2.0, react: 2.5 },
    mount: { azRate: 90 * D2R, azAcc: 200 * D2R, elRate: 60 * D2R, elAcc: 150 * D2R, elMin: -5 * D2R, elMax: 85 * D2R, h: 3.4 },
    gun: { rpm: 5000, burst: 50, bursts: [30, 50, 100], ammo: 1400, spare: 0, spin: 0, disp: 2.5 * MIL, bias: 1.0 * MIL, ammoMix: ['OFZT30', 'OFZ30', 'OFZ30', 'OFZ30'], tol: 5 * MIL, reload: 90, barrels: 4 },
    msl: { type: '57E6', ready: 12, salvo: 1, interval: 1.6, reload: 420 },
    REAL: { R: 20000, Rgun: 4000, alt: 15000, Rmin: 1200 }, GAME: { R: 900, Rgun: 480, alt: 700, Rmin: 110 } },
  LANCE: { name: 'RW-5 LANCE laser', side: 2, era: 'runaway',
    sensor: { kind: 'eo', R50: 7000, scan: 0.5, trk: 50, sR: 1, sA: 0.02 * MIL, notch: 0, clut: 1, acq: 1.0, react: 0.8 },
    mount: { azRate: 120 * D2R, azAcc: 600 * D2R, elRate: 120 * D2R, elAcc: 600 * D2R, elMin: -10 * D2R, elMax: 89 * D2R, h: 4.2 },
    // P W, aperture m, wavelength m, beam quality, jitter rad, tracking error rad, latency s (smear x angular rate),
    // haze extinction 1/m, Cn^2 (m^-2/3), heated-spot floor radius m, cooling time constant s, heat magazine J,
    // wall-plug efficiency, heat dump W, absorptivity
    laser: { P: 150e3, D: 0.55, lambda: 1.07e-6, M2: 1.4, jitter: 6e-6, track: 50e-6, lat: 0.004, haze: 0.2e-3, cn2: 1e-14, spot0: 0.025, cool: 3.0,
      heatCap: 30e6, eff: 0.35, dump: 120e3, absorb: 0.45 },
    REAL: { R: 3000, alt: 3000 }, GAME: { R: 430, alt: 430, Rmin: 10 } },
};
export const THEATRE = k => { const S = SYSTEMS[k]; return S.GAME.R / S.REAL.R; };

// advance a round by dt: drag exact along its velocity, then gravity. r: {x,y,z,vx,vy,vz,k,t}
export function stepRound(r, dt, g = G0) {
  const sp = Math.hypot(r.vx, r.vy, r.vz) || 1, a = r.k * sp * dt, s = Math.log1p(a) / r.k, f = 1 / (1 + a);
  const ux = r.vx / sp, uy = r.vy / sp, uz = r.vz / sp;
  r.x += ux * s; r.y += uy * s - 0.5 * g * dt * dt; r.z += uz * s;
  r.vx *= f; r.vy = r.vy * f - g * dt; r.vz *= f; r.t += dt;
  return r;
}
// closest approach of a segment a0->a1 (round) to a point moving b0->b1 (target) during the same step.
// returns the fraction (0..1) and writes the miss distance to out.d
export function sweptMiss(ax0, ay0, az0, ax1, ay1, az1, bx0, by0, bz0, bx1, by1, bz1, out) {
  const px = ax0 - bx0, py = ay0 - by0, pz = az0 - bz0;
  const dx = (ax1 - ax0) - (bx1 - bx0), dy = (ay1 - ay0) - (by1 - by0), dz = (az1 - az0) - (bz1 - bz0);
  const L2 = dx * dx + dy * dy + dz * dz;
  const f = L2 > 1e-12 ? clamp(-(px * dx + py * dy + pz * dz) / L2, 0, 1) : 0;
  const ex = px + dx * f, ey = py + dy * f, ez = pz + dz * f;
  out.d = Math.sqrt(ex * ex + ey * ey + ez * ez); out.f = f; return f;
}

// the intercept: aim (az, el) for a round (ammo) from the gun at (gx, gy, gz) at a target at p moving with v
// (constant velocity). Writes out = { ok, t, R, az, el, x, y, z (the predicted point) }. Iterates the time of flight.
export function leadSolution(gx, gy, gz, p, v, ammo, out, g = G0, Rmax = 6000) {
  let t = Math.hypot(p.x - gx, p.y - gy, p.z - gz) / ammo.v0, ax = 0, ay = 0, az = 0, R = 0;
  for (let i = 0; i < 6; i++) {
    ax = p.x + v.x * t - gx; ay = p.y + v.y * t - gy; az = p.z + v.z * t - gz;
    R = Math.hypot(ax, ay, az);
    if (R > Rmax || ammo.k * R > 4) { out.ok = false; return false; }
    t = tofOf(ammo.k, ammo.v0, R);
  }
  const drop = dropOf(ammo.k, ammo.v0, t, g);
  const hz = Math.hypot(ax, az), el0 = Math.atan2(ay, hz);
  // the drop is perpendicular to the line of fire: raise the aim by drop * cos(el) over the slant range
  out.t = t; out.R = R; out.az = Math.atan2(-ax, -az); out.el = el0 + Math.atan2(drop * Math.cos(el0), R); out.ok = true;
  out.x = ax + gx; out.y = ay + gy; out.z = az + gz;
  return true;
}

// ------------------------------------------------------------------------------------------- sensors
// line of sight over the terrain (and the sea): samples every `step` m between the ends, ignoring the last few m at
// each end (the site's own hill, the target's own shadow)
export function losClear(terrainH, ax, ay, az, bx, by, bz, step = 8) {
  const L = Math.hypot(bx - ax, by - ay, bz - az), n = Math.ceil(L / step);
  for (let i = 1; i < n; i++) {
    const f = i / n; if (f * L < 4 || (1 - f) * L < 3) continue;
    const x = ax + (bx - ax) * f, y = ay + (by - ay) * f, z = az + (bz - az) * f;
    if (Math.max(0, terrainH(x, z)) > y) return false;
  }
  return true;
}
// Swerling-1 single-look detection probability for a false-alarm rate Pfa. SNR50 = SNR giving Pd 0.5.
const PFA = 1e-6;
export const SNR50 = Math.log(PFA) / Math.log(0.5) - 1;   // 18.9 (12.8 dB)
export const pdOf = snr => Math.pow(PFA, 1 / (1 + Math.max(0, snr)));
// SNR of a target (rcs m^2) at range R for a radar with R50 (m, for 1 m^2), with the clutter / notch / multipath penalty
export function snrOf(sensor, rcs, R, vr, hAgl, elev, R50 = sensor.R50) {
  let snr = SNR50 * rcs * (R50 / Math.max(1, R)) ** 4;
  if (sensor.notch > 0) {
    // low and slow (radially): in the clutter. The penalty fades out above ~3 deg elevation or 60 m above the surface.
    const low = clamp(1 - Math.max(elev / (3 * D2R), hAgl / 60), 0, 1);
    const inNotch = clamp(1 - Math.abs(vr) / sensor.notch, 0, 1);
    snr *= 1 - (1 - sensor.clut) * low * Math.max(inNotch, 0.35 * low);   // even outside the notch, ground clutter costs something when very low
    // multipath over flat water / ground: very low targets fade (lobing), worst at the lowest grazing angles
    if (hAgl < 8 && elev < 1.5 * D2R) snr *= 0.3 + 0.7 * Math.max(0, hAgl) / 8;
  }
  return snr;
}

// ------------------------------------------------------------------------------------------- tracking
// alpha-beta filter on Cartesian measurements (critically damped Benedict-Bordner gains from alpha)
export function createTrack(id, m, t) {
  return { id, x: m.x, y: m.y, z: m.z, vx: 0, vy: 0, vz: 0, n: 1, miss: 0, q: 0, t0: t, tLast: t, res: 0, acq: 0 };
}
export function trackPredict(T, dt) { T.x += T.vx * dt; T.y += T.vy * dt; T.z += T.vz * dt; }
export function trackUpdate(T, m, dt, alpha, beta) {
  const rx = m.x - T.x, ry = m.y - T.y, rz = m.z - T.z;
  if (T.n === 1 && dt > 0) { T.vx = rx / dt; T.vy = ry / dt; T.vz = rz / dt; T.x = m.x; T.y = m.y; T.z = m.z; }
  else {
    T.x += alpha * rx; T.y += alpha * ry; T.z += alpha * rz;
    if (dt > 0) { T.vx += beta / dt * rx; T.vy += beta / dt * ry; T.vz += beta / dt * rz; }
  }
  T.n++; T.miss = 0; T.res = Math.hypot(rx, ry, rz);
  T.q = Math.min(1, T.q + (1 - T.q) * 0.18);
}
export const abGains = a => [a, a * a / (2 - a)];

// ------------------------------------------------------------------------------------------- missiles
export function createMissile(type, x, y, z, ux, uy, uz, v0 = 25) {
  const M = MISSILES[type];
  return { type, M, x, y, z, vx: ux * v0, vy: uy * v0, vz: uz * v0, t: 0, stage: 0, alive: true, gCmd: 0, miss: 1e9, det: false, lost: false, dist: 0, thrust: 0 };
}
function stageAt(m) { let t = m.t; const st = m.M.stages; for (let i = 0; i < st.length; i++) { if (t < st[i].burn) return [st[i], t, i]; t -= st[i].burn; } return [st[st.length - 1], t, st.length - 1]; }
// one step. tgt: {x,y,z,vx,vy,vz} truth (fuse / seeker); trk: the fire unit's estimate (command guidance); site: the
// tracking radar position (the CLOS line's origin). Returns 'det' when the proximity fuse fires, 'dud' at end of life.
const _o = { d: 0, f: 0 };
export function stepMissile(m, dt, tgt, trk, site, g = G0) {
  if (!m.alive) return null;
  const [S, ts, si] = stageAt(m); m.stage = si;
  const mass = S.mass0 + (S.mass1 - S.mass0) * Math.min(1, ts / S.burn), thrust = ts < S.burn ? S.thrust : 0;
  m.thrust = thrust;
  const sp = Math.hypot(m.vx, m.vy, m.vz) || 1, ux = m.vx / sp, uy = m.vy / sp, uz = m.vz / sp;
  const q = 0.5 * RHO0 * sp * sp, drag = q * S.cd * S.S;
  // guidance: a lateral acceleration command (perpendicular to the velocity)
  let ax = 0, ay = 0, az = 0;
  if (tgt && !m.lost) {
    if (m.M.guid === 'pn') {
      // semi-active seeker: proportional navigation on the line of sight to the illuminated target, gimbal-limited
      const rx = tgt.x - m.x, ry = tgt.y - m.y, rz = tgt.z - m.z, R = Math.hypot(rx, ry, rz) || 1;
      const off = Math.acos(clamp((rx * ux + ry * uy + rz * uz) / R, -1, 1));
      if (off > m.M.gimbal && m.t > 0.6) m.lost = true;
      else {
        const vx = tgt.vx - m.vx, vy = tgt.vy - m.vy, vz = tgt.vz - m.vz;   // relative velocity
        // LOS rate w = (r x v) / R^2; a = N Vc (w x r_hat)
        const wx = (ry * vz - rz * vy) / (R * R), wy = (rz * vx - rx * vz) / (R * R), wz = (rx * vy - ry * vx) / (R * R);
        const Vc = -(rx * vx + ry * vy + rz * vz) / R, N = m.M.nav;
        ax = N * Vc * (wy * rz - wz * ry) / R; ay = N * Vc * (wz * rx - wx * rz) / R + g; az = N * Vc * (wx * ry - wy * rx) / R;
      }
    } else {
      // command to line of sight: the ground radar measures the missile's offset from the site->target line and radios
      // a correction: PD on the offset (the "beam riding" loop) plus the acceleration of the point on the line at the
      // missile's range (the line swings as the target moves: feed-forward). Uses the radar TRACK, not the truth, so
      // track noise (angle noise x range) becomes miss distance at long range.
      const T = trk || tgt;
      const lx = T.x - site.x, ly = T.y - site.y, lz = T.z - site.z, L = Math.hypot(lx, ly, lz) || 1, lux = lx / L, luy = ly / L, luz = lz / L;
      const mx = m.x - site.x, my = m.y - site.y, mz = m.z - site.z, along = mx * lux + my * luy + mz * luz;
      const Px = site.x + lux * along, Py = site.y + luy * along, Pz = site.z + luz * along;
      const ex = Px - m.x, ey = Py - m.y, ez = Pz - m.z;   // from the missile to the line
      const C = m.clos || (m.clos = { ex, ey, ez, dx: 0, dy: 0, dz: 0, px: Px, py: Py, pz: Pz, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0, n: 0 });
      const lp = Math.min(1, dt / 0.08);   // derivative filters (80 ms)
      C.dx += ((ex - C.ex) / dt - C.dx) * lp; C.dy += ((ey - C.ey) / dt - C.dy) * lp; C.dz += ((ez - C.ez) / dt - C.dz) * lp;
      const pvx = (Px - C.px) / dt, pvy = (Py - C.py) / dt, pvz = (Pz - C.pz) / dt;
      if (C.n > 1) { C.ax += ((pvx - C.vx) / dt - C.ax) * lp; C.ay += ((pvy - C.vy) / dt - C.ay) * lp; C.az += ((pvz - C.vz) / dt - C.az) * lp; }
      C.n++; C.vx = pvx; C.vy = pvy; C.vz = pvz; C.px = Px; C.py = Py; C.pz = Pz; C.ex = ex; C.ey = ey; C.ez = ez;
      const wn = m.M.wn, zeta = 0.7;   // command loop bandwidth (rad/s, INFERRED) and damping
      ax = wn * wn * ex + 2 * zeta * wn * C.dx + C.ax; ay = wn * wn * ey + 2 * zeta * wn * C.dy + C.ay + g; az = wn * wn * ez + 2 * zeta * wn * C.dz + C.az;
    }
    // keep the part across the velocity, then limit by the airframe (aero) and the autopilot (structural)
    const al = ax * ux + ay * uy + az * uz; ax -= al * ux; ay -= al * uy; az -= al * uz;
    const aMag = Math.hypot(ax, ay, az), aLim = Math.min(m.M.gMax * g, q * S.S * m.M.cnMax / mass);
    if (aMag > aLim) { const s = aLim / aMag; ax *= s; ay *= s; az *= s; }
    m.gCmd = Math.min(aMag, aLim) / g;
  }
  if (m.t < 0.25) { ax = ay = az = 0; }   // straight off the rail / out of the tube first
  const along = (thrust - drag) / mass;
  const px = m.x, py = m.y, pz = m.z;
  m.vx += (ux * along + ax) * dt; m.vy += (uy * along + ay - g) * dt; m.vz += (uz * along + az) * dt;
  m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.t += dt; m.dist += sp * dt; m.speed = sp;
  // proximity fuse: closest approach to the TRUE target this step (armed after 0.5 s)
  if (tgt && m.t > 0.5) {
    sweptMiss(px, py, pz, m.x, m.y, m.z, tgt.x - tgt.vx * dt, tgt.y - tgt.vy * dt, tgt.z - tgt.vz * dt, tgt.x, tgt.y, tgt.z, _o);
    m.miss = Math.min(m.miss, _o.d);
    const closing = (tgt.x - m.x) * (m.vx - tgt.vx) + (tgt.y - m.y) * (m.vy - tgt.vy) + (tgt.z - m.z) * (m.vz - tgt.vz) > 0;
    if (_o.d < m.M.fuse && (_o.f < 1 || !closing)) {
      m.alive = false; m.det = true; m.missD = _o.d; m.x = px + (m.x - px) * _o.f; m.y = py + (m.y - py) * _o.f; m.z = pz + (m.z - pz) * _o.f; return 'det';
    }
    if (!closing && m.t > 1.5 && Math.hypot(tgt.x - m.x, tgt.y - m.y, tgt.z - m.z) > 60) m.lost = true;   // flew past
  }
  if (m.t > m.M.life || (sp < 150 && m.t > 4)) { m.alive = false; return 'dud'; }
  return null;
}

// ------------------------------------------------------------------------------------------- laser
// spot radius (1/e, m) at range R for a target moving across the line at angular rate w (rad/s): diffraction
// (1.22 lambda / D * M2), turbulence (lambda / r0, r0 = Fried parameter of a horizontal path), jitter, tracking error
// and the tracker's latency smear, in quadrature, over a floor = the size of the spot the heat spreads into.
export function laserSpot(L, R, w = 0) {
  const k = 2 * Math.PI / L.lambda, r0 = Math.pow(0.423 * k * k * L.cn2 * R, -3 / 5);
  const diff = 1.22 * L.lambda / L.D * L.M2 * R, turb = L.lambda / r0 * R, jit = Math.hypot(L.jitter, L.track, w * L.lat) * R;
  return Math.sqrt(diff * diff + turb * turb + jit * jit + L.spot0 * L.spot0);
}
// peak irradiance (W/m^2) on target through optical depth tau
export function laserIrradiance(L, R, tau, w = 0) { const s = laserSpot(L, R, w); return L.P * Math.exp(-tau) / (Math.PI * s * s); }
// dwell to kill (s) at constant irradiance I (absorbed) against a dose threshold F with cooling tau_c; Infinity if never
export function dwellToKill(I, F, tc) { const ss = I * tc; return ss <= F ? Infinity : -tc * Math.log(1 - F / ss); }

// ------------------------------------------------------------------------------------------- the fire unit
// world: { terrainH(x,z), g, rng, targets: [{ id, x,y,z, vx,vy,vz, cls, rcs?, alive }], tau?(x0,y0,z0,x1,y1,z1) }
// opt: { x, y, z (site ground), yaw (hull), side, real: true = real envelopes (bench), burst: rounds, ammo }
// fu.ev after each step: { e: 'fire', key, x,y,z, vx,vy,vz, k, tracer, sd, cls } | { e: 'launch', m } |
//   { e: 'det', m, tgt, d } | { e: 'dud', m } | { e: 'beam', id, I, tau, frac, R, dI } | { e: 'kill', id, by } |
//   { e: 'reload' } | { e: 'overheat' }
export function createFireUnit(kind, opt = {}) {
  const S = SYSTEMS[kind], sc = opt.real ? 1 : THEATRE(kind), env = opt.real ? S.REAL : S.GAME;
  const sen = S.sensor, mnt = S.mount;
  const fu = {
    kind, S, side: opt.side ?? S.side, x: opt.x || 0, y: opt.y || 0, z: opt.z || 0, yaw: opt.yaw || 0,
    sc, env, R50: sen.R50 * sc, R50t: (sen.R50t || sen.R50 * 1.41) * sc, visR: (sen.visR || 0) * sc,
    Rmax: env.R, Rgun: env.Rgun || env.R, Rmin: env.Rmin || 0, alt: env.alt,
    az: opt.yaw || 0, el: 0.15, azV: 0, elV: 0, scanT: 0, tracks: new Map(), tgt: null, state: 'search', t: 0, engT: 0,
    ammo: opt.ammo ?? S.gun?.ammo ?? 0, spare: S.gun?.spare ?? 0, burstLeft: 0, burstSize: opt.burst || S.gun?.burst || 0, fireAcc: 0, spin: 0, gap: 0,
    biasAz: 0, biasEl: 0, reload: 0, mix: 0, lead: { ok: false, R: 0, t: 0, az: 0, el: 0 }, err: 1, firing: false, shots: 0, range: 0,
    msl: S.msl ? { ready: S.msl.ready, cd: 0, reload: 0, list: [] } : null,
    heat: 0, hold: false, beam: null, dose: new Map(), ev: [], gunner: null, info: '', aimAz: 0, aimEl: 0,
    spotAz: 0, spotEl: 0, lockOn: null,   // Phalanx closed-loop correction; the id the radar is locked on (RWR)
  };
  const [alpha, beta] = abGains(sen.kind === 'eo' ? 0.65 : sen.kind === 'optical' ? 0.5 : 0.45);
  const gunY = () => fu.y + mnt.h;
  const gp = { x: 0, y: 0, z: 0 };

  function geom(T) {
    const dx = T.x - fu.x, dy = T.y - gunY(), dz = T.z - fu.z, R = Math.hypot(dx, dy, dz) || 1;
    return { R, az: Math.atan2(-dx, -dz), el: Math.asin(clamp(dy / R, -1, 1)), vr: (dx * T.vx + dy * T.vy + dz * T.vz) / R,
      w: Math.hypot(dy * T.vz - dz * T.vy, dz * T.vx - dx * T.vz, dx * T.vy - dy * T.vx) / (R * R) };
  }
  function sees(T, world, Gm, R50) {
    if (!losClear(world.terrainH, fu.x, gunY() + 0.5, fu.z, T.x, T.y, T.z)) return false;
    const rcs = T.rcs ?? TARGETS[T.cls]?.rcs ?? 1;
    const hAgl = T.y - Math.max(0, world.terrainH(T.x, T.z));
    if (sen.kind === 'optical') {
      // the gunner (and the crew commander) spotting by eye: likely out to ~40% of the visual range, falling to nothing
      // at 120%, scaled by the target's size
      const k = clamp(1 - (Gm.R - fu.visR * 0.4) / (fu.visR * 0.8), 0, 1) * clamp(Math.sqrt(rcs / 4), 0.3, 1.2);
      return world.rng() < k;
    }
    let snr = snrOf(sen, rcs, Gm.R, Gm.vr, hAgl, Gm.el, R50);
    if (sen.kind === 'eo' && world.tau) snr *= Math.exp(-2 * world.tau(fu.x, gunY(), fu.z, T.x, T.y, T.z));   // smoke blinds the EO tracker too
    return world.rng() < pdOf(snr);
  }
  // VADS: the range-only radar has to see it too, once the gunner points at it (blade Doppler shows helicopters)
  function rangeRadar(T, world, Gm) { return world.rng() < pdOf(snrOf({ notch: 0 }, T.rcs ?? TARGETS[T.cls]?.rcs ?? 1, Gm.R, 0, 99, 1, fu.R50)); }
  // a measurement: range noise along the line, angle noise across it
  function measure(T, Gm, rng) {
    const R = Gm.R + rng.gauss() * sen.sR;
    let az = Gm.az + rng.gauss() * sen.sA, el = Gm.el + rng.gauss() * sen.sA;
    if (sen.kind === 'optical') {   // the gunner's line of sight lags the target (first order) and shakes
      const gn = fu.gunner || (fu.gunner = { az: Gm.az, el: Gm.el, id: T.id });
      if (gn.id !== T.id) { gn.az = Gm.az; gn.el = Gm.el; gn.id = T.id; }
      const k = Math.min(1, (1 / sen.trk) / sen.lag);
      gn.az += angDiff(gn.az, Gm.az) * k + rng.gauss() * sen.sA; gn.el += (Gm.el - gn.el) * k + rng.gauss() * sen.sA;
      az = gn.az; el = gn.el;
    }
    const ce = Math.cos(el);
    return { x: fu.x - Math.sin(az) * ce * R, y: gunY() + Math.sin(el) * R, z: fu.z - Math.cos(az) * ce * R };
  }
  // the mount: rate- and acceleration-limited servo toward (az, el); returns the pointing error (rad)
  function servo(dt, az, el) {
    const elC = clamp(el, mnt.elMin, mnt.elMax), ea = angDiff(fu.az, az), ee = elC - fu.el;
    // time-optimal-ish: the rate that still lets it stop (sqrt(2 a d)), capped
    const wa = Math.sign(ea) * Math.min(mnt.azRate, Math.sqrt(2 * mnt.azAcc * Math.abs(ea)) * 0.9, Math.abs(ea) * 12) + (fu.lead.wAz || 0);
    const we = Math.sign(ee) * Math.min(mnt.elRate, Math.sqrt(2 * mnt.elAcc * Math.abs(ee)) * 0.9, Math.abs(ee) * 12) + (fu.lead.wEl || 0);
    fu.azV += clamp(clamp(wa, -mnt.azRate, mnt.azRate) - fu.azV, -mnt.azAcc * dt, mnt.azAcc * dt);
    fu.elV += clamp(clamp(we, -mnt.elRate, mnt.elRate) - fu.elV, -mnt.elAcc * dt, mnt.elAcc * dt);
    fu.az += fu.azV * dt; fu.el = clamp(fu.el + fu.elV * dt, mnt.elMin, mnt.elMax);
    if (fu.az > Math.PI) fu.az -= 2 * Math.PI; else if (fu.az < -Math.PI) fu.az += 2 * Math.PI;
    return Math.hypot(angDiff(fu.az, az) * Math.cos(fu.el), el - fu.el);
  }

  fu.step = (dt, world) => {
    const rng = world.rng, g = world.g ?? G0; fu.t += dt; fu.ev.length = 0; fu.firing = false;
    gp.x = fu.x; gp.y = gunY(); gp.z = fu.z;
    const byId = fu._byId || (fu._byId = new Map()); byId.clear();
    for (const T of world.targets) if (T.alive !== false) byId.set(T.id, T);
    // ---------------- search
    fu.scanT -= dt;
    if (fu.scanT <= 0) {
      fu.scanT += sen.scan;
      for (const T of byId.values()) {
        if (fu.tracks.has(T.id)) continue;
        const Gm = geom(T); if (Gm.R > fu.Rmax * 2 || Gm.el > mnt.elMax + 0.05) continue;
        if (sees(T, world, Gm, fu.R50)) { const tr = createTrack(T.id, measure(T, Gm, rng), fu.t); tr.acq = sen.acq; fu.tracks.set(T.id, tr); }
      }
    }
    // ---------------- track (track-while-scan on everything held; the fire unit engages one at a time)
    for (const [id, tr] of fu.tracks) {
      const T = byId.get(id);
      trackPredict(tr, dt);
      if (!T) { fu.tracks.delete(id); if (fu.tgt === tr) fu.tgt = null; continue; }
      if (tr.acq > 0) tr.acq -= dt;
      const dtT = fu.t - tr.tLast;
      if (dtT < 1 / sen.trk - 1e-9) continue;
      const Gm = geom(T);
      const ok = Gm.R < fu.Rmax * 2.2 && Gm.el < mnt.elMax + 0.05 && sees(T, world, Gm, fu.R50t) && (sen.kind !== 'optical' || rangeRadar(T, world, Gm) || tr.n < 3);
      if (ok) { trackUpdate(tr, measure(T, Gm, rng), dtT, alpha, beta); tr.tLast = fu.t; }
      else { tr.miss++; tr.tLast = fu.t; tr.q *= 0.9; if (tr.miss > sen.trk * 1.5) { fu.tracks.delete(id); if (fu.tgt === tr) fu.tgt = null; } }
    }
    // ---------------- threat evaluation: the nearest (by range less a closing bonus) track inside the envelope
    let best = null, bs = 1e9;
    for (const tr of fu.tracks.values()) {
      if (tr.acq > 0 || tr.n < 3) continue;
      const dx = tr.x - gp.x, dy = tr.y - gp.y, dz = tr.z - gp.z, R = Math.hypot(dx, dy, dz) || 1;
      if (R > fu.Rmax * 1.25 || tr.y - fu.y > fu.alt) continue;
      const close = -(dx * tr.vx + dy * tr.vy + dz * tr.vz) / R, s = R - 4 * Math.max(0, close) - (tr === fu.tgt ? 150 : 0);
      if (s < bs) { bs = s; best = tr; }
    }
    if (best !== fu.tgt) { fu.tgt = best; if (best) fu.engT = fu.t; fu.burstLeft = 0; }
    const tr = fu.tgt;
    fu.lockOn = tr ? tr.id : null;
    fu.state = tr ? 'track' : fu.tracks.size ? 'acquire' : 'search';
    // ---------------- reloads
    if (fu.reload > 0) { fu.reload -= dt; if (fu.reload <= 0) { fu.ammo = S.gun.ammo; fu.ev.push({ e: 'reload' }); } }
    if (fu.msl && fu.msl.reload > 0) { fu.msl.reload -= dt; if (fu.msl.reload <= 0) fu.msl.ready = S.msl.ready; }
    // ---------------- aim
    let canShoot = false;
    if (tr) {
      const R = Math.hypot(tr.x - gp.x, tr.y - gp.y, tr.z - gp.z);
      const pAz = fu.lead.az, pEl = fu.lead.el, had = fu.lead.ok;
      if (S.gun) leadSolution(gp.x, gp.y, gp.z, tr, { x: tr.vx, y: tr.vy, z: tr.vz }, AMMO[S.gun.ammoMix[0]], fu.lead, g, fu.Rgun * 2);
      else { fu.lead.ok = true; fu.lead.az = Math.atan2(-(tr.x - gp.x), -(tr.z - gp.z)); fu.lead.el = Math.asin(clamp((tr.y - gp.y) / R, -1, 1)); fu.lead.R = R; fu.lead.t = 0; }
      // the solution's own rate: the servo feeds it forward so it tracks without a standing lag
      if (fu.lead.ok && had) { fu.lead.wAz = clamp(angDiff(pAz, fu.lead.az) / dt, -3, 3) * 0.9; fu.lead.wEl = clamp((fu.lead.el - pEl) / dt, -3, 3) * 0.9; } else { fu.lead.wAz = 0; fu.lead.wEl = 0; }
      if (fu.lead.ok) {
        fu.aimAz = fu.lead.az + fu.spotAz; fu.aimEl = fu.lead.el + fu.spotEl;
        fu.err = servo(dt, fu.aimAz, fu.aimEl);
        canShoot = fu.t - fu.engT > sen.react && tr.q > 0.55 && fu.lead.el > mnt.elMin - 0.01 && fu.lead.el < mnt.elMax;
      } else fu.err = servo(dt, fu.az, 0.15);
      fu.range = R;
    } else {
      // no target: a slow search sweep (VADS gunner scanning) or stowed forward
      fu.lead.ok = false; fu.lead.wAz = 0; fu.lead.wEl = 0;
      fu.err = servo(dt, sen.kind === 'optical' ? fu.az + 0.4 : fu.az, sen.kind === 'eo' ? 0.25 : 0.12);
      fu.spotAz *= 0.9; fu.spotEl *= 0.9; fu.range = 0;
    }
    // ---------------- guns
    if (S.gun) {
      const G = S.gun, inGun = tr && fu.lead.ok && fu.lead.R < fu.Rgun && fu.lead.R > fu.Rmin;
      const want = canShoot && inGun && fu.err < G.tol && fu.ammo > 0 && fu.reload <= 0;
      if (want && fu.burstLeft <= 0 && fu.gap <= 0) {   // a new burst: a new per-burst bias (gun / boresight / servo)
        fu.burstLeft = fu.burstSize; fu.biasAz = rng.gauss() * G.bias; fu.biasEl = rng.gauss() * G.bias;
      }
      fu.gap -= dt;
      const shooting = fu.burstLeft > 0 && fu.ammo > 0 && fu.reload <= 0 && tr && fu.err < G.tol * 2.5;
      fu.spin = shooting ? Math.min(1, fu.spin + dt / Math.max(0.01, G.spin)) : Math.max(0, fu.spin - dt / 1.2);
      if (shooting && fu.spin >= 1) {
        fu.firing = true; fu.fireAcc += dt * G.rpm / 60;
        while (fu.fireAcc >= 1 && fu.burstLeft > 0 && fu.ammo > 0) {
          fu.fireAcc -= 1; fu.burstLeft--; fu.ammo--; fu.shots++;
          const key = G.ammoMix[fu.mix++ % G.ammoMix.length], A = AMMO[key];
          const az = fu.az + fu.biasAz + rng.gauss() * G.disp, el = fu.el + fu.biasEl + rng.gauss() * G.disp, c = Math.cos(el);
          const ux = -Math.sin(az) * c, uy = Math.sin(el), uz = -Math.cos(az) * c;
          // muzzle ahead of the trunnion; 4-barrel mounts (Shilka, Pantsir) alternate sides
          const off = G.barrels === 4 ? ((fu.shots & 1) ? 1 : -1) * 0.55 : 0, sub = (fu.fireAcc / Math.max(1e-6, dt * G.rpm / 60)) * dt;
          fu.ev.push({ e: 'fire', key, x: gp.x + ux * 2.6 + Math.cos(fu.az) * off, y: gp.y + uy * 2.6, z: gp.z + uz * 2.6 - Math.sin(fu.az) * off,
            vx: ux * A.v0, vy: uy * A.v0, vz: uz * A.v0, k: A.k, tracer: A.tracer, sd: A.sd, cls: A.cls, sub });
        }
        if (fu.burstLeft <= 0) fu.gap = 0.35;   // reassess between bursts
        if (fu.ammo <= 0) { fu.reload = G.reload; fu.burstLeft = 0; }
        if (sen.spot && tr) {   // Phalanx closed loop: the radar sees the stream's miss and walks it onto the target
          fu.spotAz += (-fu.biasAz - fu.spotAz) * Math.min(1, dt * 3); fu.spotEl += (-fu.biasEl - fu.spotEl) * Math.min(1, dt * 3);
        }
      } else fu.fireAcc = 0;
    }
    // ---------------- missiles
    if (fu.msl) {
      const MS = S.msl, Mn = MISSILES[MS.type];
      fu.msl.cd -= dt;
      if (canShoot && tr && fu.msl.ready > 0 && fu.msl.cd <= 0 && fu.err < 0.2) {
        const R = fu.range, gunsBetter = S.gun && R < fu.Rgun * 0.7 && fu.ammo > 0;
        let inFlight = 0; for (const m of fu.msl.list) if (m.alive && m.tid === tr.id) inFlight++;
        if (R > fu.Rmin && R < fu.Rmax && !gunsBetter && inFlight < MS.salvo + (R > fu.Rmax * 0.5 ? 1 : 0)) {
          const az = fu.az, el = Math.max(0.12, Math.asin(clamp((tr.y - gp.y) / R, -1, 1)) + 0.08), c = Math.cos(el);
          const m = createMissile(MS.type, gp.x - Math.sin(az) * 1.5, gp.y + 0.4, gp.z - Math.cos(az) * 1.5, -Math.sin(az) * c, Math.sin(el), -Math.cos(az) * c);
          m.tid = tr.id; m.side = fu.side; fu.msl.list.push(m); fu.msl.ready--; fu.msl.cd = MS.interval;
          fu.ev.push({ e: 'launch', m });
          if (fu.msl.ready <= 0) fu.msl.reload = MS.reload;
        }
      }
      for (const m of fu.msl.list) {
        if (!m.alive) continue;
        const T = byId.get(m.tid), est = fu.tracks.get(m.tid);
        if (!est) m.lost = true;   // command guidance needs the radar on the target; the seeker needs the illuminator
        const r = stepMissile(m, dt, T || null, est || null, gp, g);
        if (r === 'det') fu.ev.push({ e: 'det', m, tgt: m.tid, d: m.missD });
        else if (r === 'dud') fu.ev.push({ e: 'dud', m });
      }
      if (fu.msl.list.length > 24) fu.msl.list = fu.msl.list.filter(m => m.alive);
    }
    // ---------------- laser
    if (S.laser) {
      const L = S.laser;
      fu.heat = Math.max(0, fu.heat - L.dump * dt / L.heatCap);
      if (fu.hold && fu.heat < 0.3) fu.hold = false;
      const T = tr ? byId.get(tr.id) : null;
      let on = false;
      if (T && canShoot && !fu.hold && fu.err < 3e-3 && fu.range < fu.Rmax) {
        const Gm = geom(T);
        if (losClear(world.terrainH, gp.x, gp.y, gp.z, T.x, T.y, T.z)) {
          on = true;
          const tau = (world.tau ? world.tau(gp.x, gp.y, gp.z, T.x, T.y, T.z) : 0) + L.haze * Gm.R;
          const I = laserIrradiance(L, Gm.R, tau, Gm.w) * L.absorb, cls = TARGETS[T.cls] || TARGETS.heli;
          // the heated spot cools (conduction, airflow) with a time constant: the beam has to dwell
          const dose = (fu.dose.get(T.id) || 0) * Math.exp(-dt / L.cool) + I * dt;
          fu.dose.set(T.id, dose);
          const frac = dose / cls.fluence;
          fu.beam = { id: T.id, I, tau, frac, R: Gm.R };
          fu.ev.push({ e: 'beam', id: T.id, I, tau, frac, R: Gm.R, dI: I * dt / cls.fluence });
          if (frac >= 1) { fu.ev.push({ e: 'kill', id: T.id, by: 'laser' }); fu.dose.set(T.id, 0); }
          fu.heat += L.P / L.eff * (1 - L.eff) * dt / L.heatCap;
          if (fu.heat >= 1) { fu.hold = true; fu.ev.push({ e: 'overheat' }); }
        }
      }
      if (!on) { fu.beam = null; for (const [id, d] of fu.dose) fu.dose.set(id, d * Math.exp(-dt / L.cool)); }
      fu.firing = on;
    }
    fu.info = tr ? `TRACK q${tr.q.toFixed(2)} ${fu.range.toFixed(0)}m` : fu.state.toUpperCase();
    return fu.ev;
  };
  return fu;
}

// ------------------------------------------------------------------------------------------- engagement helper
// Run one fire unit against scripted targets (bench / dev page). target.path(t) -> {x,y,z,vx,vy,vz}. Rounds are
// flown with stepRound and checked with sweptMiss against each target's presented radius; a hit rolls the per-hit
// kill chance; a missile detonation rolls the warhead Pk at its miss distance; the laser kills at its dose.
export function engage(kind, site, targets, opt = {}) {
  const dt = opt.dt ?? 1 / 60, T = opt.T ?? 30, rng = makeRng(opt.seed ?? 1), g = opt.g ?? G0;
  const fu = createFireUnit(kind, { ...site, real: opt.real, burst: opt.burst });
  const terrainH = opt.terrainH || (() => -5);
  const rounds = [], o = { d: 0, f: 0 };
  const st = targets.map((t, i) => ({ id: i, cls: t.cls, rcs: t.rcs, alive: true, path: t.path, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, hits: 0, killed: false, tKill: null }));
  const res = { rounds: 0, missiles: 0, dets: [], firstShot: null, detectT: null, trackT: null, beamT: 0, minR: 1e9 };
  for (let t = 0; t < T; t += dt) {
    for (const s of st) { const p = s.path(t); s.px = s.x; s.py = s.y; s.pz = s.z; Object.assign(s, p); if (t === 0) { s.px = s.x; s.py = s.y; s.pz = s.z; } }
    const world = { terrainH, rng, g, targets: st.filter(s => s.alive), tau: opt.tau };
    const ev = fu.step(dt, world);
    if (res.detectT === null && fu.tracks.size) res.detectT = t;
    if (res.trackT === null && fu.tgt) res.trackT = t;
    for (const s of st) res.minR = Math.min(res.minR, Math.hypot(s.x - fu.x, s.y - fu.y, s.z - fu.z));
    for (const e of ev) {
      if (e.e === 'fire') { rounds.push({ x: e.x, y: e.y, z: e.z, vx: e.vx, vy: e.vy, vz: e.vz, k: e.k, t: 0, cls: e.cls, life: e.sd || 6 }); res.rounds++; if (res.firstShot === null) res.firstShot = t; }
      else if (e.e === 'launch') { res.missiles++; if (res.firstShot === null) res.firstShot = t; }
      else if (e.e === 'det') {
        const s = st[e.tgt]; if (!s || !s.alive) continue; res.dets.push(+e.d.toFixed(1));
        if (rng() < warheadPk(e.m.M, e.d, TARGETS[s.cls].hard)) { s.alive = false; s.killed = true; s.tKill = t; }
      } else if (e.e === 'beam') { res.beamT += dt; if (res.firstShot === null) res.firstShot = t; }
      else if (e.e === 'kill') { const s = st[e.id]; if (s && s.alive) { s.alive = false; s.killed = true; s.tKill = t; } }
    }
    for (let i = rounds.length - 1; i >= 0; i--) {
      const r = rounds[i], x0 = r.x, y0 = r.y, z0 = r.z; stepRound(r, dt, g);
      let gone = r.t > r.life || r.y < Math.max(0, terrainH(r.x, r.z));
      if (!gone) for (const s of st) {
        if (!s.alive) continue;
        sweptMiss(x0, y0, z0, r.x, r.y, r.z, s.px, s.py, s.pz, s.x, s.y, s.z, o);
        if (o.d < TARGETS[s.cls].r) { s.hits++; gone = true; if (rng() < TARGETS[s.cls].pk[r.cls]) { s.alive = false; s.killed = true; s.tKill = t; } break; }
      }
      if (gone) { rounds[i] = rounds[rounds.length - 1]; rounds.pop(); }
    }
    if (st.every(s => !s.alive)) break;
  }
  res.fu = fu; res.targets = st; res.hits = st.reduce((a, s) => a + s.hits, 0); res.killed = st.filter(s => s.killed).length; res.tKill = st[0].tKill;
  return res;
}
