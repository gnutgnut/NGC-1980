// Ship motion in a seaway: heave, pitch and roll from a random sea, plus heel in turns and trim with speed.
// Pure JS (no THREE, no DOM): runs in node for tools/navalbench.mjs.
//
// Model (linear seakeeping, the textbook "Froude-Krylov strip-averaged" level):
// - The sea is a Bretschneider (two-parameter Pierson-Moskowitz) spectrum for the sea state's significant height Hs
//   and modal period Tp, cut into N regular wave components with random phases and a cos^2 spread of directions
//   about the main wave direction.
// - Each component excites heave, pitch and roll with the wave elevation / slope averaged over the ship's waterplane
//   (a rectangle L x B): sinc() for elevation, 3(sin x - x cos x)/x^3 for slope. Long ships average short waves out,
//   which is why a carrier barely moves in a sea that throws a destroyer about.
// - Each degree of freedom is a damped linear oscillator (natural period, damping ratio) driven at the ENCOUNTER
//   frequency we = w - k U cos(mu): head seas shorten the period, following seas stretch it.
// - The response is the analytic steady state of every component (amplitude x |H(we)|, phase lag), with the phases
//   integrated over time so speed and heading changes stay smooth. No state to blow up at low frame rates.
// - Quasi-static: steady heel outward in a turn, tan(phi) = V r / g * (KG - T/2) / GM, with a lag; a little
//   bow-up trim with speed.
// Ship numbers are REAL-ship values (metres, seconds); `scale` maps the heave into game metres (the carriers are
// modelled at 0.44 scale, the RUNAWAY ships at full scale). Angles are not scaled.
//
// Sea state table: WMO code 3700 / NATO height ranges (CONFIRMED: SS3 0.5-1.25 m, SS4 1.25-2.5, SS5 2.5-4, SS6 4-6,
// SS7 6-9). Mean Hs and most probable modal periods per state: NATO STANAG 4194 / Bales (1983) open-ocean North
// Atlantic table as recalled (UNVERIFIED offline): SS3 0.88 m 7.5 s, SS4 1.88 m 8.8 s, SS5 3.25 m 9.7 s,
// SS6 5.0 m 12.4 s, SS7 7.5 m 15.0 s.
export const SEA_STATES = [
  { ss: 0, hs: 0.0, tp: 4.0, name: 'CALM (GLASSY)' },
  { ss: 1, hs: 0.05, tp: 4.5, name: 'CALM (RIPPLED)' },
  { ss: 2, hs: 0.3, tp: 6.3, name: 'SMOOTH' },
  { ss: 3, hs: 0.88, tp: 7.5, name: 'SLIGHT' },
  { ss: 4, hs: 1.88, tp: 8.8, name: 'MODERATE' },
  { ss: 5, hs: 3.25, tp: 9.7, name: 'ROUGH' },
  { ss: 6, hs: 5.0, tp: 12.4, name: 'VERY ROUGH' },
  { ss: 7, hs: 7.5, tp: 15.0, name: 'HIGH' },
];
const G = 9.81, TAU = Math.PI * 2;

// Ship hydrostatics / dynamics (real ships; sources in the comments, INFERRED where estimated).
//  L, B, T: waterline length, beam, draft (m). Tn*: natural periods (s). z*: damping ratios. kh: (KG - T/2) / GM
//  for the turn heel. scale: game metres per real metre (heave only).
export const SHIPS = {
  // ALBATROSS: Midway / Forrestal class. Midway (CV-41) after SCB-101.66: 295 m LOA, ~274 m LWL, 36.9 m WL beam,
  // 10.8 m draft (CONFIRMED, DANFS / Jane's 1980). Roll period ~19 s, heave / pitch ~7.5 s (INFERRED: GM ~3 m,
  // k_xx 0.4 B; T_heave = 2pi sqrt(T Cb (1 + a33) / Cwp / g)). Bilge-keel roll damping 0.06 (INFERRED).
  albatross: { L: 274, B: 36.9, T: 10.8, TnH: 7.6, TnP: 7.2, TnR: 19, zH: 0.35, zP: 0.32, zR: 0.06, kh: 2.0, scale: 120 / 274 },
  // KRAKEN: Gerald R. Ford class (CVN-78): 337 m LOA, 317 m LWL, 41 m WL beam, 12 m draft (CONFIRMED, NAVSEA).
  kraken: { L: 317, B: 41, T: 12, TnH: 8.2, TnP: 7.8, TnR: 22, zH: 0.35, zP: 0.32, zR: 0.06, kh: 2.0, scale: 120 / 317 },
  // LEVIATHAN: RUNAWAY railgun monitor, game size = real size (96 x 16 m, 4.5 m draft), active fins (INFERRED).
  leviathan: { L: 92, B: 16, T: 4.5, TnH: 4.6, TnP: 4.4, TnR: 9.5, zH: 0.32, zP: 0.3, zR: 0.14, kh: 1.6, scale: 1 },
  // Container ship: Yara Birkeland, the autonomous electric feeder: 79.5 m LOA, 14.8 m beam, 6 m draft, 120 TEU,
  // 13 kn max (CONFIRMED, Kongsberg / Yara). Roll ~11 s (INFERRED, container feeders run low GM).
  container: { L: 76, B: 14.8, T: 6, TnH: 5.0, TnP: 4.8, TnR: 11, zH: 0.3, zP: 0.3, zR: 0.07, kh: 1.4, scale: 1 },
  // PARITY - MSC freighter (mscfreighter.js): a C4-S-1a "Mariner": 171.8 m LOA, ~160 m LWL, 23.2 m beam, 8.9 m draft
  // (CONFIRMED as recalled, offline: MARAD C4-S-1a design data). Built at 80 m in the game: scale 80 / 171.8. Roll
  // ~15 s (INFERRED: a loaded break-bulk ship, GM ~1.2-1.5 m, k_xx ~0.38 B), heave / pitch ~6 s (INFERRED, same
  // T_heave formula as the carriers), bilge-keel roll damping 0.07 (INFERRED).
  msc: { L: 160, B: 23.2, T: 8.9, TnH: 6.2, TnP: 6.0, TnR: 15, zH: 0.32, zP: 0.3, zR: 0.07, kh: 1.6, scale: 80 / 171.8 },
  // PARITY - Iowa-class battleship (iowa.js): 270.4 m LOA, 262 m LWL, 33.0 m beam, ~11 m draft at full load
  // (CONFIRMED, DANFS / NAVSEA BB-61 class data). Built at 104 m: scale 104 / 270.4. Roll ~15.5 s (INFERRED: GM
  // ~2.8-3 m, k_xx ~0.39 B), heave / pitch ~7 s (INFERRED), bilge keels: roll damping 0.08 (INFERRED). A long, fine,
  // heavy hull: she pitches less than a carrier her length would suggest and rolls slowly.
  iowa: { L: 262, B: 33, T: 11, TnH: 7.0, TnP: 6.8, TnR: 15.5, zH: 0.34, zP: 0.32, zR: 0.08, kh: 1.8, scale: 104 / 270.4 },
};

const sinc = x => Math.abs(x) < 1e-4 ? 1 - x * x / 6 : Math.sin(x) / x;
const slopeAvg = x => { if (Math.abs(x) < 0.02) return 1 - x * x / 10; return 3 * (Math.sin(x) - x * Math.cos(x)) / (x * x * x); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
// Bretschneider spectral density S(w) for Hs, Tp
export function spectrum(w, hs, tp) { const wp = TAU / tp; return 5 / 16 * hs * hs * wp ** 4 / w ** 5 * Math.exp(-1.25 * (wp / w) ** 4); }

// A regular-wave decomposition of a sea state. dir = direction the waves travel TOWARDS (rad, the game's yaw
// convention: travelling along (-sin dir, -cos dir)).
// ss may be fractional (a sea that is getting up or easing): Hs and Tp are interpolated between the table rows.
// The random draws (frequency jitter, spread angle, phase) are kept on each component, so retuneSea() can move the
// same sea to another state without the waves jumping (an integer ss gives exactly the draws and numbers it always did).
export function makeSea(ss = 3, dir = 0, seed = 1, n = 14, spread = true) {
  const r = rng(seed), comps = [];
  for (let i = 0; i < n; i++) {
    const u = r();
    // cos^2 spreading: sample the angle with rejection
    let th = 0; if (spread) do { th = (r() - 0.5) * Math.PI; } while (r() > Math.cos(th) ** 2);
    const ph0 = r() * TAU;
    comps.push({ i, u, th, ph0, ph: ph0, w: 0, k: 0, kg: 0, a: 0, dir: 0, dx: 0, dz: 1 });
  }
  const sea = { ss: 0, hs: 0, tp: 0, name: '', dir, n, comps, t: 0 };
  retuneSea(sea, ss, dir);
  if (sea.hs <= 0) sea.comps = [];   // a glassy sea: nothing to excite (the comps stay reachable for retuneSea)
  return sea;
}
// The table row for a (fractional) sea state
export function seaRow(ss) {
  const s = clamp(ss, 0, SEA_STATES.length - 1), i = Math.min(SEA_STATES.length - 2, Math.floor(s)), f = s - i, A = SEA_STATES[i], B = SEA_STATES[i + 1];
  return { hs: A.hs + (B.hs - A.hs) * f, tp: A.tp + (B.tp - A.tp) * f, name: SEA_STATES[Math.round(s)].name };
}
// Move a sea to another (fractional) state and main direction, keeping each component's running phase.
export function retuneSea(sea, ss, dir = sea.dir) {
  const S = seaRow(ss), all = sea._all || (sea._all = sea.comps), n = all.length;
  sea.ss = clamp(ss, 0, SEA_STATES.length - 1); sea.hs = S.hs; sea.tp = S.tp; sea.name = S.name; sea.dir = dir;
  const wp = TAU / S.tp, w0 = 0.45 * wp, w1 = 2.6 * wp, dw = (w1 - w0) / n;
  let m0 = 0;
  for (const c of all) {
    c.w = w0 + (c.i + 0.3 + 0.4 * c.u) * dw; c.a = S.hs > 0 ? Math.sqrt(2 * spectrum(c.w, S.hs, S.tp) * dw) : 0;
    c.k = c.w * c.w / G; c.kg = c.k / SEA_GAME_SCALE; c.dir = dir + c.th; c.dx = -Math.sin(c.dir); c.dz = -Math.cos(c.dir);
    m0 += c.a * c.a / 2;
  }
  // renormalise so the discretised sea has exactly the table's Hs (4 sqrt(m0))
  if (m0 > 0) { const f = S.hs / (4 * Math.sqrt(m0)); for (const c of all) c.a *= f; }
  sea.comps = all;
  return sea;
}

// ------------------------------------------------------------------------------------- the live sea (the game)
// The game shows ONE sea: main.js draws its surface from these components and every ship moves on it. It is drawn
// at the game's scale (the ALBATROSS's 0.44: heights AND wavelengths, so the steepness stays real) with the real
// periods: then a carrier modelled at that scale meets the waves at exactly the encounter frequency its motion model
// uses (k_game U_game = k U_real), and a ship's phases can be read off the surface at its position (step(.., x, z)).
export const SEA_GAME_SCALE = 120 / 274;
// the sea's clock: every component's phase runs at its own frequency (call once per frame)
export function advanceSea(sea, dt) {
  sea.t += dt;
  for (const c of sea._all || sea.comps) { c.ph += c.w * dt; if (c.ph > 1e4) c.ph -= TAU * Math.floor(c.ph / TAU); }
}
// surface elevation (game metres above y = 0) at a world point (game metres), and the slope if `out` is given
export function seaElevation(sea, x, z, out) {
  let e = 0, sx = 0, sz = 0;
  for (const c of sea.comps) {
    const ph = c.ph - c.kg * (c.dx * x + c.dz * z), a = c.a * SEA_GAME_SCALE;
    e += a * Math.cos(ph);
    if (out) { const s = a * Math.sin(ph) * c.kg; sx += s * c.dx; sz += s * c.dz; }
  }
  if (out) { out.e = e; out.sx = sx; out.sz = sz; }
  return e;
}

// The motion of one ship. step(dt, speed, yaw, yawRate) advances it; the state is read from mo.heave (game m),
// mo.pitch (rad, bow up +), mo.roll (rad, starboard up +), and their rates.
export function createShipMotion(P, sea, seed = 1) {
  const r = rng(seed * 7919 + 13);
  const mo = { P, sea, heave: 0, pitch: 0, roll: 0, vHeave: 0, vPitch: 0, vRoll: 0, heel: 0, trim: 0, t: 0, ph: [] };
  const wnH = TAU / P.TnH, wnP = TAU / P.TnP, wnR = TAU / P.TnR;
  // |H| and phase lag of a damped oscillator at frequency we
  const resp = (we, wn, z) => { const q = Math.abs(we) / wn, re = 1 - q * q, im = 2 * z * q; return [1 / Math.hypot(re, im), Math.atan2(im, re)]; };
  mo.setSea = s => { mo.sea = s; mo.ph = (s._all || s.comps).map(c => c.ph0 + r() * TAU); };
  mo.setSea(sea);
  // x, z (optional, game metres): the ship's position on the LIVE sea (advanceSea): its phases are then read off the
  // surface there, so it rides the waves main.js draws; without them the phases integrate the encounter frequency.
  mo.step = (dt, U = 0, yaw = 0, yawRate = 0, x, z) => {
    mo.t += dt;
    const sea = mo.sea, L = P.L * 0.7, B = P.B * 0.8, smith = P.T;   // effective waterplane: the ends are fine (Cwp ~0.75), so less cancellation than a rectangle
    const zR = P.zR + 0.004 * Math.abs(U) / P.scale;   // roll damping grows with speed (bilge keels, fins, lift)
    let h = 0, p = 0, ro = 0, vh = 0, vp = 0, vr = 0;
    for (let i = 0; i < sea.comps.length; i++) {
      const c = sea.comps[i], mu = c.dir - yaw, cm = Math.cos(mu), sm = Math.sin(mu);
      // ship speed in REAL m/s: game speeds are game metres per second, so divide the carrier's by its scale
      const Ur = U / P.scale, we = c.w - c.k * Ur * cm;   // following seas (cos mu = 1) stretch it, head seas shorten it
      if (x !== undefined) mo.ph[i] = c.ph - c.kg * (c.dx * x + c.dz * z); else mo.ph[i] += we * dt;
      const att = Math.exp(-c.k * smith * 0.5);            // pressure falls off with depth (Smith correction)
      const xL = c.k * L * cm / 2, xB = c.k * B * sm / 2;
      // heave: elevation averaged over the waterplane
      const fH = c.a * sinc(xL) * sinc(xB) * att;
      // pitch: wave slope along the ship, averaged over the length; roll: slope across, averaged over the beam
      const fP = c.k * c.a * cm * slopeAvg(xL) * sinc(xB) * att;
      const fR = c.k * c.a * sm * slopeAvg(xB) * sinc(xL) * att;
      const [gH, lH] = resp(we, wnH, P.zH), [gP, lP] = resp(we, wnP, P.zP), [gR, lR] = resp(we, wnR, zR);
      const ph = mo.ph[i];
      h += fH * gH * Math.cos(ph - lH); vh -= fH * gH * we * Math.sin(ph - lH);
      p += fP * gP * Math.sin(ph - lP); vp += fP * gP * we * Math.cos(ph - lP);
      ro += fR * gR * Math.sin(ph - lR + 0.7); vr += fR * gR * we * Math.cos(ph - lR + 0.7);
    }
    // steady heel in a turn (outward), first-order lag ~ a quarter roll period; trim bow-up a little with speed
    const Ur = U / P.scale, heelWant = clamp(-Math.atan(Ur * yawRate / G * P.kh), -0.11, 0.11);
    mo.heel += (heelWant - mo.heel) * (1 - Math.exp(-dt / (P.TnR * 0.25)));
    mo.trim = 0.00001 * Ur * Ur;   // ~0.1 deg bow-up at 30 kn
    mo.heave = h * P.scale; mo.vHeave = vh * P.scale;
    mo.pitch = p + mo.trim; mo.vPitch = vp;
    mo.roll = ro + mo.heel; mo.vRoll = vr;
    return mo;
  };
  return mo;
}

// Height (world y) of a point given in the ship's frame (x starboard, y up from the waterline, z aft), for a ship at
// waterline height py with the mesh rotation order 'YXZ' = (pitch, yaw, roll): roll about z first, then pitch about x.
export function shipPointY(py, heave, pitch, roll, lx, ly, lz) {
  const y1 = lx * Math.sin(roll) + ly * Math.cos(roll);
  return py + heave + y1 * Math.cos(pitch) - lz * Math.sin(pitch);
}
// and its vertical velocity (for decks: what a landing gear feels)
export function shipPointVY(vHeave, pitch, roll, vPitch, vRoll, lx, ly, lz) {
  const y1 = lx * Math.sin(roll) + ly * Math.cos(roll), dy1 = (lx * Math.cos(roll) - ly * Math.sin(roll)) * vRoll;
  return vHeave + dy1 * Math.cos(pitch) - y1 * Math.sin(pitch) * vPitch - lz * Math.cos(pitch) * vPitch;
}
