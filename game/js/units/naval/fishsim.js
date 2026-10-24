// SEALIFE (ngc/waterfish): the fish of the archipelago. Pure simulation (no THREE, no DOM, no game imports; node-testable
// by tools/fishbench.mjs). sealife.js draws them and feeds them what disturbs them.
//
// What it models
// - SCHOOLS of one species each, spawned only round the camera (and only in water that suits the species), dropped when
//   the camera leaves. Inside a school every fish is a boid (Reynolds 1987): separation inside the nearest-neighbour
//   distance, alignment and cohesion with the fish round it, a slow wandering goal for the school, a depth band, the sea
//   bed below and the shore ahead (read through depthAt: the game's terrain height, so new beaches just work).
// - FRIGHT: hulls (a box round the waterline with the bow wave and the wake behind), rotor downwash on the surface,
//   swimmers, landing craft, splashes and gunfire on the water, explosions. A fish that feels it bolts at burst speed
//   away and down (vessel avoidance: fish dive and move aside ahead of a ship, Misund 1997, Vabo et al. 2002 - INFERRED
//   form, distances game-tuned); the fright runs through the school as a wave from where it started (the "Trafalgar
//   effect", Treherne & Foster 1981 - INFERRED form; game speed 8 m/s).
// - BLASTS: a fish close to an explosion in or on the water is stunned (rolls belly up, floats up, recovers after a
//   while) or killed (floats at the surface, then sinks away). Radii are game-tuned, not research.
// - SWIMMING: speed follows the body length (BL): cruise ~1-3 BL/s, escape bursts ~10 BL/s (Videler 1993 "Fish
//   Swimming"; Domenici & Blake 1997 J Exp Biol 200 - INFERRED, species values UNVERIFIED). The tail beats at the
//   Bainbridge (1958, J Exp Biol 35) relation U = L (3 f - 4) / 4, so f = (4 U / L + 4) / 3 (CONFIRMED form), amplitude
//   ~0.2 L (Bainbridge 1958, CONFIRMED order).
//
// Coordinates: world metres, y up, the mean sea surface at y = 0 (the game's convention). depthAt(x, z) returns the ground
// height there (negative under the sea), the same function the physics uses.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// The species. Body lengths and habitats are the real fish of a 1980 temperate archipelago (NE Atlantic / Mediterranean
// coasts); the game's sea is shallow (the zone's sea floor is ~14 m), so the depth bands are squeezed into it.
//   len    body length range (m)
//   n      fish per school
//   water  sea depth they are found over (m)
//   band   swimming depth below the surface (m); `bottom` > 0: they keep this close to the bed instead (bottom feeders)
//   cruise / burst  speeds in body lengths per second
//   nnd    nearest-neighbour distance in body lengths (schooling fish ~0.5-1 BL: Pitcher & Partridge 1979, INFERRED)
//   shy    how far (m) a threat of strength 1 is felt; fear lasts `calm` s
export const SPECIES = [
  {   // European pilchard (sardine), Sardina pilchardus: 15-20 cm, dense schools near the surface over the shelf.
    key: 'sardine', name: 'PILCHARD', len: [0.14, 0.2], n: [50, 90], water: [3, 99], band: [0.5, 5], bottom: 0,
    cruise: 2.2, burst: 12, nnd: 1.0, view: 1.6, agility: 3.5, shy: 1.0, calm: 4, weight: 3,
  },
  {   // Atlantic mackerel, Scomber scombrus: 30-40 cm, fast, schools in mid water; bursts ~5 m/s (Wardle 1975, INFERRED).
    key: 'mackerel', name: 'MACKEREL', len: [0.28, 0.38], n: [25, 45], water: [5, 99], band: [1, 8], bottom: 0,
    cruise: 2.6, burst: 11, nnd: 1.2, view: 3.0, agility: 3.0, shy: 1.1, calm: 5, weight: 2,
  },
  {   // Flathead grey mullet, Mugil cephalus: 30-50 cm, small groups grazing the bottom in the shallows by the beaches.
    key: 'mullet', name: 'GREY MULLET', len: [0.3, 0.5], n: [7, 16], water: [0.7, 4.5], band: [0.3, 4], bottom: 0.45,
    cruise: 1.0, burst: 8, nnd: 1.8, view: 3.5, agility: 2.2, shy: 1.4, calm: 6, weight: 2,
  },
  {   // Greater amberjack, Seriola dumerili: ~1 m, loose groups of a few, deep, near the bottom and round rocks and wrecks.
    key: 'amberjack', name: 'AMBERJACK', len: [0.8, 1.25], n: [4, 9], water: [8, 99], band: [4, 30], bottom: 1.6,
    cruise: 0.9, burst: 6, nnd: 2.5, view: 8, agility: 1.6, shy: 0.8, calm: 6, weight: 1,
  },
];
export const SPECIES_INDEX = Object.fromEntries(SPECIES.map((s, i) => [s.key, i]));

// tail-beat frequency (Hz) of a fish of length L (m) at speed U (m/s): Bainbridge 1958
export const tailBeatHz = (U, L) => (4 * U / L + 4) / 3;

export const FISH = {
  MAX_FISH: 760,        // the most fish alive at once (the instance buffer)
  MAX_SCHOOLS: 14,
  R_UNDER: 70,          // sim radius when the camera is under water (visibility ~30 m)
  R_MIN: 70, R_MAX: 170, // above water: grows with the camera's height (you see further into the water from above)
  ALT_MAX: 160,         // above this the fish are not simulated (they cannot be seen)
  SPAWN_DT: 0.35,       // s between spawn attempts
  FADE: 1.8,            // s to fade a new school in
  ALARM_V: 8,           // m/s: how fast fright runs through a school
  STEP: 1 / 20,         // the longest sim substep (s)
  DEAD_T: 90,           // s a dead fish floats before it sinks away
};

// stride of one fish in a school's Float32Array
const F_X = 0, F_Y = 1, F_Z = 2, F_VX = 3, F_VY = 4, F_VZ = 5, F_FEAR = 6, F_STUN = 7, F_PH = 8, F_LEN = 9, F_ROLL = 10, F_DEAD = 11, F_AL = 12, F_JIT = 13;
const STRIDE = 14;

function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }

export function createFishSim({ depthAt, seed = 1980 } = {}) {
  const r = rng(seed);
  // ---- the sea bed, cached on a 2 m grid (the game's terrainH is not free: sealife asks it a few thousand times a
  // second otherwise). Cells are filled on first use and kept while the camera stays near.
  const BC = 2, bedCache = new Map();
  const cellH = (i, j) => { const k = i * 1048576 + j; let h = bedCache.get(k); if (h === undefined) { h = depthAt(i * BC, j * BC); bedCache.set(k, h); } return h; };
  const bed = (x, z) => {
    const gx = x / BC, gz = z / BC, i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const a = cellH(i, j), b = cellH(i + 1, j), c = cellH(i, j + 1), d = cellH(i + 1, j + 1);
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
  };

  const S = {
    enabled: true, schools: [], t: 0, nFish: 0, spawnT: 0, cam: { x: 0, y: 0, z: 0 }, radius: 0, ms: 0,
    threats: [], nThreats: 0, transient: [], stats: { spawned: 0, despawned: 0, stunned: 0, killed: 0, fled: 0 }, bed,
  };
  // ------------------------------------------------------------------ threats
  // A threat each frame (the host fills them before update): kind 0 point, 1 hull (box in the ship's frame).
  //   x, y, z   where; r  how far it is felt at k = 1; k  strength (0..1+); vx, vz  its velocity
  //   hull: c, s (cos / sin of the heading: forward = (-s, -c) as the game's units), hl, hw (half length / beam), dr (draft)
  const threat = () => { let t = S.threats[S.nThreats]; if (!t) { t = { kind: 0, x: 0, y: 0, z: 0, r: 1, k: 1, vx: 0, vz: 0, c: 1, s: 0, hl: 0, hw: 0, dr: 0, deep: 0 }; S.threats.push(t); } S.nThreats++; t.vx = t.vz = 0; t.deep = 0; return t; };
  S.clearThreats = () => { S.nThreats = 0; };
  // a point disturbance (rotor wash, a swimmer, a craft): r metres at strength k; deep: how far down it reaches (m)
  S.point = (x, y, z, r, k = 1, vx = 0, vz = 0, deep = 4) => { const t = threat(); t.kind = 0; t.x = x; t.y = y; t.z = z; t.r = r; t.k = k; t.vx = vx; t.vz = vz; t.deep = deep; return t; };
  // a hull at (x, z) heading yaw (forward = (-sin yaw, -cos yaw)), half length / beam, draft, speed (m/s)
  S.hull = (x, z, yaw, hl, hw, dr, speed = 0) => {
    const t = threat(); t.kind = 1; t.x = x; t.y = 0; t.z = z; t.c = Math.cos(yaw); t.s = Math.sin(yaw); t.hl = hl; t.hw = hw; t.dr = dr;
    t.vx = -t.s * speed; t.vz = -t.c * speed; t.r = 6 + Math.abs(speed) * 3.5 + hw; t.k = 0.55 + Math.min(0.6, Math.abs(speed) * 0.12); t.deep = dr + 6; return t;
  };
  // something brief: a splash, a burst of gunfire on the water, a wake patch (lasts `life` s, fading)
  S.scare = (x, y, z, r, k = 1, life = 1.5, deep = 5) => {
    if (S.transient.length > 48) S.transient.shift();
    S.transient.push({ x, y, z, r, k, life, t: life, deep });
  };
  // an explosion at (x, y, z) of size s (the fx scale: a grenade ~0.8, a shell 1-2, a ship's magazine 5)
  S.blast = (x, y, z, s = 1) => {
    const coup = y > 0.4 ? Math.exp(-(y - 0.4) / 1.5) : 1;   // in the air above the water little of it goes in
    if (coup < 0.05) { S.scare(x, 0, z, 12 + 8 * s, 0.8, 2); return 0; }
    const rStun = (3 + 6 * s) * coup, rKill = rStun * 0.2;
    let hit = 0;
    for (const sc of S.schools) {
      if (Math.hypot(sc.cx - x, sc.cz - z) > rStun + sc.rad + 2) continue;
      const a = sc.a;
      for (let i = 0; i < sc.n; i++) {
        const o = i * STRIDE; if (a[o + F_DEAD] > 0) continue;
        const d = Math.hypot(a[o] - x, (a[o + F_Y] - Math.min(y, 0)), a[o + F_Z] - z);
        if (d > rStun) continue;
        hit++;
        if (d < rKill * (0.7 + 0.6 * r())) { a[o + F_DEAD] = 1; a[o + F_STUN] = FISH.DEAD_T; S.stats.killed++; }
        else { a[o + F_STUN] = Math.max(a[o + F_STUN], 6 + 16 * (1 - d / rStun) * (0.6 + 0.8 * r())); S.stats.stunned++; }
        const k = 4 * (1 - d / rStun) / Math.max(d, 0.5);   // thrown outward
        a[o + F_VX] += (a[o] - x) * k; a[o + F_VZ] += (a[o + F_Z] - z) * k; a[o + F_VY] += 0.5;
      }
    }
    S.scare(x, 0, z, 22 + 14 * s, 1.2, 3.5, 20);
    return hit;
  };

  // ------------------------------------------------------------------ schools
  const habitatOK = (sp, depth) => depth >= sp.water[0] && depth <= sp.water[1];
  function pickSpecies(depth) {
    let tot = 0; for (const sp of SPECIES) if (habitatOK(sp, depth)) tot += sp.weight;
    if (!tot) return -1;
    let u = r() * tot; for (let i = 0; i < SPECIES.length; i++) { const sp = SPECIES[i]; if (!habitatOK(sp, depth)) continue; u -= sp.weight; if (u <= 0) return i; }
    return -1;
  }
  // the depth band (y range) for species sp over a bed at height b: [lo, hi] with lo < hi <= 0
  function band(sp, b, len, out) {
    const top = -Math.max(sp.band[0], 0.25 + len * 0.5), floor = b + Math.max(0.25, len * 0.6);
    let lo = Math.max(-sp.band[1], floor), hi = top;
    if (sp.bottom > 0) { hi = Math.min(hi, b + sp.bottom + len); lo = Math.max(lo, b + Math.max(0.2, len * 0.5)); }
    if (lo > hi) { const m = (Math.max(floor, -sp.band[1]) + top) * 0.5; lo = hi = Math.min(m, -0.3); }
    out[0] = lo; out[1] = hi; return out;
  }
  const _b = [0, 0];
  function spawnSchool(spi, x, z, fadeIn = true) {
    const sp = SPECIES[spi], n = Math.round(sp.n[0] + r() * (sp.n[1] - sp.n[0]));
    if (S.nFish + n > FISH.MAX_FISH) return null;
    const b = bed(x, z), L0 = sp.len[0] + r() * (sp.len[1] - sp.len[0]);
    band(sp, b, L0, _b); const yc = _b[1] - (_b[1] - _b[0]) * (0.15 + 0.35 * r());   // (the upper part of the band)
    const hd = r() * TAU, sp0 = sp.cruise * L0;
    const sc = { sp: spi, n, a: new Float32Array(n * STRIDE), cx: x, cy: yc, cz: z, rad: 2, gx: x, gz: z, goalT: 0, alarm: 0, ax: 0, az: 0, at: -99, fade: fadeIn ? 0 : 1, L: L0, vx: 0, vz: 0, id: S.stats.spawned };
    // a ball of fish, nnd apart, all heading roughly one way
    const spread = Math.cbrt(n) * sp.nnd * L0 * 1.1;
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE, a = sc.a, len = L0 * (0.85 + 0.3 * r());
      a[o] = x + (r() - 0.5) * 2 * spread; a[o + F_Z] = z + (r() - 0.5) * 2 * spread;
      if (bed(a[o], a[o + F_Z]) > _b[0] - 0.2) { a[o] = x + (r() - 0.5) * 0.5; a[o + F_Z] = z + (r() - 0.5) * 0.5; }   // (not in the ground)
      a[o + F_Y] = clamp(yc + (r() - 0.5) * spread, _b[0], _b[1]);
      const h = hd + (r() - 0.5) * 0.6; a[o + F_VX] = Math.sin(h) * sp0; a[o + F_VZ] = Math.cos(h) * sp0; a[o + F_VY] = 0;
      a[o + F_PH] = r() * TAU; a[o + F_LEN] = len; a[o + F_JIT] = r();
    }
    S.schools.push(sc); S.nFish += n; S.stats.spawned++;
    return sc;
  }
  S.spawnSchool = (key, x, z, fadeIn = false) => spawnSchool(typeof key === 'number' ? key : SPECIES_INDEX[key], x, z, fadeIn);
  function dropSchool(i) { const sc = S.schools[i]; S.nFish -= sc.n; S.schools.splice(i, 1); S.stats.despawned++; }
  S.clear = () => { S.schools.length = 0; S.nFish = 0; S.transient.length = 0; };

  // a new spot for the school to wander to: within ~30 m, water deep enough for it
  function newGoal(sc) {
    const sp = SPECIES[sc.sp];
    for (let k = 0; k < 6; k++) {
      const a = r() * TAU, d = 8 + r() * 26, x = sc.cx + Math.cos(a) * d, z = sc.cz + Math.sin(a) * d;
      if (habitatOK(sp, -bed(x, z))) { sc.gx = x; sc.gz = z; break; }
    }
    sc.goalT = 6 + r() * 12;
  }

  // ------------------------------------------------------------------ one fish's fear from the threats
  function fearAt(x, y, z, sp, out) {   // out: [fear, fleeX, fleeY, fleeZ]
    let best = 0, fx = 0, fy = 0, fz = 0;
    for (let k = 0; k < S.nThreats + S.transient.length; k++) {
      const t = k < S.nThreats ? S.threats[k] : S.transient[k - S.nThreats];
      const life = k < S.nThreats ? 1 : t.t / t.life;
      const R = t.r * sp.shy, below = Math.max(0, -y - (t.kind === 1 ? t.dr : 0));
      let dx, dz, d;
      if (t.kind === 1) {
        // ship frame: lx starboard, lz aft; the hull box plus the bow wave (more ahead with speed) and the wake behind
        const rx = x - t.x, rz = z - t.z, lx = rx * t.c - rz * t.s, lz = rx * t.s + rz * t.c;
        const ox = Math.max(0, Math.abs(lx) - t.hw), oz = lz < 0 ? Math.max(0, -lz - t.hl) * 0.6 : Math.max(0, lz - t.hl) * 1.4;
        d = Math.hypot(ox, oz) + below * 0.8;
        // flee sideways, away from the keel line, and down
        const side = lx >= 0 ? 1 : -1; dx = side * t.c; dz = -side * t.s;
        if (lz < -t.hl) { dx += -t.s * -0.3; dz += -t.c * -0.3; }
      } else {
        dx = x - t.x; dz = z - t.z; const h = Math.hypot(dx, dz) || 1e-3; dx /= h; dz /= h;
        d = h + Math.max(0, below - t.deep) * 2;
      }
      if (d >= R) continue;
      const f = t.k * life * (1 - d / R) * (1 - d / R) * 2.2;
      if (f > best) best = f;
      const w = f; fx += dx * w; fz += dz * w; fy -= 0.6 * w;
    }
    out[0] = Math.min(1, best); out[1] = fx; out[2] = fy; out[3] = fz;
    return out;
  }

  // ------------------------------------------------------------------ steering
  const _f = [0, 0, 0, 0];
  function stepSchool(sc, h) {
    const sp = SPECIES[sc.sp], a = sc.a, n = sc.n;
    const L = sc.L, R = sp.view, R2 = R * R, sep = sp.nnd * L, sep2 = sep * sep;
    sc.goalT -= h; if (sc.goalT <= 0) newGoal(sc);
    sc.alarm = Math.max(0, sc.alarm - h / sp.calm);
    const alarmR = (S.t - sc.at) * FISH.ALARM_V;
    let cx = 0, cy = 0, cz = 0, vxs = 0, vzs = 0, live = 0;
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      let x = a[o], y = a[o + F_Y], z = a[o + F_Z], vx = a[o + F_VX], vy = a[o + F_VY], vz = a[o + F_VZ];
      const len = a[o + F_LEN];
      const b = bed(x, z);
      // ---- stunned / dead: no swimming; float up (dead or stunned), roll belly up, drift
      if (a[o + F_STUN] > 0) {
        a[o + F_STUN] -= h;
        const dead = a[o + F_DEAD] > 0, sink = dead && a[o + F_STUN] < 8;
        const ty = sink ? b + 0.1 : -0.06 - len * 0.15;
        vy += ((ty - y) * (sink ? 0.15 : 0.35) - vy) * Math.min(1, h * 1.5);
        vx *= Math.exp(-h * 1.2); vz *= Math.exp(-h * 1.2);
        a[o + F_ROLL] += (Math.PI * (dead ? 1 : 0.85) - a[o + F_ROLL]) * Math.min(1, h * 2.5) + (dead ? 0 : Math.sin(S.t * 3 + i) * h * 0.6);
        x += vx * h; y += vy * h; z += vz * h; { const nb = bed(x, z); if (nb > -0.3) { x -= vx * h; z -= vz * h; vx = vz = 0; } else if (y < nb + 0.05) { y = nb + 0.05; vy = 0; } }
        a[o] = x; a[o + F_Y] = y; a[o + F_Z] = z; a[o + F_VX] = vx; a[o + F_VY] = vy; a[o + F_VZ] = vz;
        if (!dead && a[o + F_STUN] <= 0) { a[o + F_STUN] = 0; a[o + F_FEAR] = 1; }   // comes to and bolts
        if (dead && a[o + F_STUN] <= 0) a[o + F_STUN] = 0.001;   // (stays on the bottom: dropped with the school)
        continue;
      }
      a[o + F_ROLL] *= Math.exp(-h * 3);
      // ---- neighbours (the school only)
      let nN = 0, ax = 0, ay = 0, az = 0, mx = 0, my = 0, mz = 0, sx = 0, sy = 0, sz = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const q = j * STRIDE; if (a[q + F_STUN] > 0) continue;
        const dx = a[q] - x, dy = a[q + F_Y] - y, dz = a[q + F_Z] - z, d2 = dx * dx + dy * dy * 1.5 + dz * dz;
        if (d2 > R2) continue;
        nN++; mx += dx; my += dy; mz += dz; ax += a[q + F_VX]; ay += a[q + F_VY]; az += a[q + F_VZ];
        if (d2 < sep2) { const k = (sep2 - d2) / (d2 + 0.02 * sep2); sx -= dx * k; sy -= dy * k; sz -= dz * k; }
      }
      const spd = Math.hypot(vx, vy, vz) || 1e-4;
      // desired direction: keep going, plus the rules
      let dx = vx / spd, dy = vy / spd, dz = vz / spd;
      if (nN) {
        const al = Math.hypot(ax, ay, az) || 1; dx += ax / al * 0.9; dy += ay / al * 0.9; dz += az / al * 0.9;   // alignment
        const ml = Math.hypot(mx, my, mz) / nN; if (ml > sep) { dx += mx / nN / ml * 0.5; dy += my / nN / ml * 0.5; dz += mz / nN / ml * 0.5; }   // cohesion
        dx += sx / sep * 1.6; dy += sy / sep * 1.6; dz += sz / sep * 1.6;   // separation
      } else {   // alone: back to the school
        const gx = sc.cx - x, gy = sc.cy - y, gz = sc.cz - z, gl = Math.hypot(gx, gy, gz) || 1; dx += gx / gl * 1.2; dy += gy / gl * 0.6; dz += gz / gl * 1.2;
      }
      // the school's wander goal
      { const gx = sc.gx - x, gz = sc.gz - z, gl = Math.hypot(gx, gz); if (gl > 2) { dx += gx / gl * 0.25; dz += gz / gl * 0.25; } }
      // depth band, the bed, the surface
      band(sp, b, len, _b);
      if (y < _b[0]) dy += Math.min(2, (_b[0] - y) * 1.5); else if (y > _b[1]) dy -= Math.min(2, (y - _b[1]) * 1.5);
      // the shore ahead: too shallow there -> turn towards deeper water (the bed's downhill)
      {
        const look = 1.5 + spd * 1.2, hx = x + vx / spd * look, hz = z + vz / spd * look, ah = bed(hx, hz);
        if (-ah < sp.water[0] * 0.8 || ah > y - len) {
          const gxx = bed(x + 2, z) - bed(x - 2, z), gzz = bed(x, z + 2) - bed(x, z - 2), gl = Math.hypot(gxx, gzz) || 1;
          dx -= gxx / gl * 2.2; dz -= gzz / gl * 2.2; dy -= 0.2;
        }
      }
      // fear: own (threats), the school's alarm once its wave reaches this fish
      fearAt(x, y, z, sp, _f);
      let fear = a[o + F_FEAR] * Math.exp(-h / sp.calm);
      if (_f[0] > fear) { fear = _f[0]; if (_f[0] > 0.35 && _f[0] > sc.alarm) { if (sc.alarm < 0.2) S.stats.fled++; sc.alarm = _f[0]; sc.ax = x; sc.az = z; sc.at = S.t; } }
      if (sc.alarm > 0 && Math.hypot(x - sc.ax, z - sc.az) < alarmR) fear = Math.max(fear, sc.alarm * 0.75);
      a[o + F_FEAR] = fear;
      if (_f[0] > 0.02) { const fl = Math.hypot(_f[1], _f[2], _f[3]) || 1; const w = 1 + 5 * _f[0]; dx += _f[1] / fl * w; dy += _f[2] / fl * w * (y > _b[0] + 0.3 ? 1 : 0); dz += _f[3] / fl * w; }
      else if (fear > 0.2) { dy -= 0.3 * fear * (y > _b[0] + 0.3 ? 1 : 0); }   // alarmed but nothing seen: go down
      // speed: cruise with a little life in it, up to a burst when frightened
      const jit = 0.85 + 0.3 * (0.5 + 0.5 * Math.sin(S.t * (0.3 + a[o + F_JIT]) + a[o + F_JIT] * 9));
      const want = len * (sp.cruise * jit + (sp.burst - sp.cruise) * fear * fear);
      const dl = Math.hypot(dx, dy * 1.4, dz) || 1;
      let tvx = dx / dl * want, tvy = dy / dl * want * 0.6, tvz = dz / dl * want;
      const ag = Math.min(1, h * sp.agility * (1 + 4 * fear));
      vx += (tvx - vx) * ag; vy += (tvy - vy) * ag; vz += (tvz - vz) * ag;
      // integrate, never through the bed or out of the water
      const ox = x, oy = y, oz = z;
      x += vx * h; y += vy * h; z += vz * h;
      const nb = bed(x, z);
      if (nb > -0.4 && nb > b) { x = ox; y = oy; z = oz; vx = -vx * 0.3; vz = -vz * 0.3; }   // would beach: back off
      else {
        if (y > -0.18) { y = -0.18; vy = Math.min(vy, 0); }
        if (y < nb + 0.15) { y = Math.min(nb + 0.15, -0.18); vy = Math.max(vy, 0); }
      }
      // the tail: Bainbridge
      a[o + F_PH] = (a[o + F_PH] + TAU * tailBeatHz(Math.hypot(vx, vy, vz), len) * h) % TAU;
      a[o] = x; a[o + F_Y] = y; a[o + F_Z] = z; a[o + F_VX] = vx; a[o + F_VY] = vy; a[o + F_VZ] = vz;
      cx += x; cy += y; cz += z; vxs += vx; vzs += vz; live++;
    }
    if (live) { sc.cx = cx / live; sc.cy = cy / live; sc.cz = cz / live; sc.vx = vxs / live; sc.vz = vzs / live; }
    let rad = 0; for (let i = 0; i < n; i++) { const o = i * STRIDE; rad = Math.max(rad, Math.abs(a[o] - sc.cx) + Math.abs(a[o + F_Z] - sc.cz)); }
    sc.rad = rad; sc.live = live;
    sc.fade = Math.min(1, sc.fade + h / FISH.FADE);
  }

  // ------------------------------------------------------------------ the frame
  // cam: the camera position. Returns nothing; read S.write() for the instances.
  S.update = (dt, cam) => {
    if (!S.enabled) { S.ms = 0; return; }
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    S.t += dt; S.cam.x = cam.x; S.cam.y = cam.y; S.cam.z = cam.z;
    const under = cam.y < 0, alt = Math.max(0, cam.y);
    S.radius = under ? FISH.R_UNDER : clamp(FISH.R_MIN + alt * 1.1, FISH.R_MIN, FISH.R_MAX);
    const off = alt > FISH.ALT_MAX;
    // transient threats age
    for (let i = S.transient.length - 1; i >= 0; i--) { const t = S.transient[i]; t.t -= dt; if (t.t <= 0) S.transient.splice(i, 1); }
    // drop the far schools (and everything when too high to see)
    for (let i = S.schools.length - 1; i >= 0; i--) { const sc = S.schools[i]; if (off || Math.hypot(sc.cx - cam.x, sc.cz - cam.z) > S.radius + 45) dropSchool(i); }
    if (bedCache.size > 90000) bedCache.clear();
    // spawn: a few tries a second, more right at the start (or after a jump)
    S.spawnT -= dt;
    if (!off && S.spawnT <= 0) {
      const empty = S.schools.length === 0;
      S.spawnT = FISH.SPAWN_DT;
      for (let k = 0; k < (empty ? 24 : 2); k++) {
        if (S.schools.length >= FISH.MAX_SCHOOLS) break;
        const a = r() * TAU, rr = empty ? S.radius * Math.sqrt(0.04 + 0.96 * r()) : S.radius * (0.55 + 0.45 * Math.sqrt(r()));
        const x = cam.x + Math.cos(a) * rr, z = cam.z + Math.sin(a) * rr, depth = -bed(x, z);
        if (depth < 0.6) continue;
        const spi = pickSpecies(depth); if (spi < 0) continue;
        // not on top of another school of the same kind; the big ones are rarer
        let crowd = 0; for (const sc of S.schools) if (Math.hypot(sc.cx - x, sc.cz - z) < 30) crowd += sc.sp === spi ? 2 : 1;
        if (crowd >= 2) continue;
        let same = 0; for (const sc of S.schools) if (sc.sp === spi) same++;
        if (same >= [5, 4, 4, 2][spi]) continue;
        spawnSchool(spi, x, z, !empty);
      }
    }
    // step (substeps at low frame rates)
    let left = Math.min(dt, 0.25);
    while (left > 1e-6) { const h = Math.min(FISH.STEP, left); left -= h; for (const sc of S.schools) stepSchool(sc, h); }
    S.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  };

  // ------------------------------------------------------------------ instances out
  // A: (x, y, z, length)  B: (yaw, pitch, roll, species)  C: (tail phase, swim effort 0..1, fade 0..1, fear)
  // view (optional): { x, y, z, fx, fy, fz, cos, px } the camera, its forward, the cosine of a cone round the view and
  // pixels per radian: fish that cannot show are left out of the draw (behind the camera, under a pixel, or so deep
  // along the line of sight from above that the water hides them)
  S.culled = 0;
  S.write = (A, B, C, max, view) => {
    let k = 0; S.culled = 0;
    for (const sc of S.schools) {
      const a = sc.a, sp = SPECIES[sc.sp];
      for (let i = 0; i < sc.n && k < max; i++) {
        const o = i * STRIDE, vx = a[o + F_VX], vy = a[o + F_VY], vz = a[o + F_VZ], hs = Math.hypot(vx, vz), len = a[o + F_LEN];
        if (view) {
          const dx = a[o] - view.x, dy = a[o + F_Y] - view.y, dz = a[o + F_Z] - view.z, d = Math.hypot(dx, dy, dz) + 1e-6;
          const vis = (dx * view.fx + dy * view.fy + dz * view.fz) / d > view.cos && len / d * view.px > 0.9
            && (view.y < 0 ? d < 40 : (-a[o + F_Y]) * d / Math.max(view.y - a[o + F_Y], 0.1) < 28);   // (water path, m: green ~exp(-0.07 x 28) ~ 0.14)
          if (!vis) { S.culled++; continue; }
        }
        const j = k * 4;
        A[j] = a[o]; A[j + 1] = a[o + F_Y]; A[j + 2] = a[o + F_Z]; A[j + 3] = len;
        B[j] = Math.atan2(vx, vz); B[j + 1] = Math.atan2(vy, Math.max(hs, 1e-4)) * (a[o + F_STUN] > 0 ? 0.2 : 1); B[j + 2] = a[o + F_ROLL]; B[j + 3] = sc.sp;
        const dead = a[o + F_DEAD] > 0, sinkFade = dead ? clamp(a[o + F_STUN] / 6, 0, 1) : 1;
        C[j] = a[o + F_PH]; C[j + 1] = a[o + F_STUN] > 0 ? 0 : clamp(Math.hypot(vx, vy, vz) / (len * sp.burst), 0.15, 1); C[j + 2] = sc.fade * sinkFade; C[j + 3] = a[o + F_FEAR];
        k++;
      }
    }
    return k;
  };
  // (tests) every fish as plain objects
  S.fish = () => { const out = []; for (const sc of S.schools) for (let i = 0; i < sc.n; i++) { const o = i * STRIDE, a = sc.a; out.push({ school: sc, sp: SPECIES[sc.sp].key, x: a[o], y: a[o + F_Y], z: a[o + F_Z], vx: a[o + F_VX], vy: a[o + F_VY], vz: a[o + F_VZ], fear: a[o + F_FEAR], stun: a[o + F_STUN], dead: a[o + F_DEAD] > 0, len: a[o + F_LEN], roll: a[o + F_ROLL] }); } return out; };
  return S;
}
