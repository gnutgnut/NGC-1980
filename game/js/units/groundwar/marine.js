// THE GROUND WAR: one AI Marine's body. Pure (no THREE, no DOM). A kinematic soldier (the player's own soldier is the
// FOUNDATION / INFANTRY sim; AI men in a squad fight need the same numbers, not the same cost): FM 22-5 paces (walk
// 1.52, run 2.74 m/s), a rush 4.5, crawl 0.5, stances with real transition times, inertia, turning, slopes (Tobler),
// and a wound model on the same body parts and hit points as the player (foot.js BODY_PARTS: head 35, thorax 85,
// stomach 70, arms 60, legs 65). Weapons are bookkeeping for the host (game level): magazines, LAWs, M203 rounds.
//
//   const M = createMarine({ id, role, x, z, yaw, env })      role: 'sl' | 'tl' | 'ar' | 'aar' | 'gren'
//   M.step(dt, { vx, vz, stance, face }, env) -> events       env: { height(x, z), water?(x, z) }
//   M.hit({ part?, point?, hp, kind: 'bullet'|'blast' }) -> { part, kia, wia }
//   M.segHit(ax, ay, az, bx, by, bz, pad) -> t (0..1) or -1   the round's path against the body for its stance
export const MARINE = {
  HP: { head: 35, thorax: 85, stomach: 70, armL: 60, armR: 60, legL: 65, legR: 65 },
  SPEED: { crawl: 0.5, walk: 1.52, run: 2.74, rush: 4.5 },
  ACC: 3.5, TURN: 4.5,
  STANCE_T: { 'stand>crouch': 0.45, 'crouch>stand': 0.5, 'crouch>prone': 0.8, 'prone>crouch': 0.9, 'stand>prone': 1.1, 'prone>stand': 1.3 },
  H: { stand: 1.78, crouch: 1.15, prone: 0.42 },
  R: { stand: 0.27, crouch: 0.32, prone: 0.26 },
  LOAD: { sl: { mags: 7, laws: 0, gl: 0, frags: 2 }, tl: { mags: 7, laws: 1, gl: 0, frags: 2 }, ar: { mags: 12, laws: 0, gl: 0, frags: 2 }, mg: { mags: 6, laws: 0, gl: 0, frags: 1 }, aar: { mags: 8, laws: 1, gl: 0, frags: 2 }, gren: { mags: 6, laws: 0, gl: 12, frags: 2 }, doc: { mags: 5, laws: 0, gl: 0, frags: 0 } },   // (doc: the Navy corpsman, ngc/infdepth; frags: M67s, ngc/infdepth-fix)
  ROLES: ['sl', 'tl', 'mg', 'aar', 'gren', 'tl', 'ar', 'aar', 'gren', 'tl', 'ar', 'aar', 'gren'],   // a reinforced squad: SL, three fire teams, an attached M60 gunner in the first
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

export function createMarine(o = {}) {
  const L = MARINE.LOAD[o.role || 'aar'];
  const M = {
    id: o.id ?? 0, side: 1, kind: 'marine', role: o.role || 'aar', seed: o.seed ?? 1,
    x: o.x ?? 0, y: 0, z: o.z ?? 0, yaw: o.yaw ?? 0, vx: 0, vz: 0, speed: 0,
    stance: 'stand', stanceFrom: 'stand', stanceTo: 'stand', stanceT: 1, gait: 0,
    hp: { ...MARINE.HP }, alive: true, able: true, wounded: 0, deadT: 0, why: '',
    mags: L.mags, rounds: 18, laws: L.laws, gl: L.gl, frags: L.frags ?? 0, firedT: 99, fireKind: null,
    events: [],
  };
  if (o.env) M.y = o.env.height(M.x, M.z);
  // ---- the body as a hit volume (for the round's path)
  M.height = () => { const k = M.stanceT < 1 ? M.stanceT : 1; return MARINE.H[M.stanceFrom] + (MARINE.H[M.stanceTo] - MARINE.H[M.stanceFrom]) * k; };
  M.segHit = (ax, ay, az, bx, by, bz, pad = 0) => {
    if (M.stanceTo === 'prone' && M.stanceT > 0.6 || !M.able && M.stanceTo !== 'stand') {   // (a walking wounded stands: ngc/infdepth)
      // lying: a capsule from the feet to the head along the facing, 0.25 m up
      const fx = -Math.sin(M.yaw), fz = -Math.cos(M.yaw), hx = M.x + fx * 0.9, hz = M.z + fz * 0.9, tx = M.x - fx * 0.9, tz = M.z - fz * 0.9;
      return segCapsule(ax, ay, az, bx, by, bz, tx, M.y + 0.22, tz, hx, M.y + 0.22, hz, MARINE.R.prone + pad);
    }
    return segCyl(ax, ay, az, bx, by, bz, M.x, M.z, MARINE.R[M.stanceTo] + pad, M.y, M.y + M.height() + pad * 0.5);
  };
  // ---- wounds (game rule on top of the real part HP): head / thorax / stomach to zero = killed; a limb gone or the
  // body at half = down and out of the fight (wounded); light wounds slow him and spoil his aim
  M.hit = h => {
    if (!M.alive) return { part: null, kia: false, wia: false };
    let part = h.part;
    if (!part && h.point) part = partAt(M, h.point);
    if (h.kind === 'blast' || !part) {
      // fragments: spread over the body (less on a prone man)
      const k = M.stanceTo === 'prone' ? 0.6 : 1;
      for (const p in M.hp) M.hp[p] = Math.max(0, M.hp[p] - h.hp * k / 7 * (p === 'head' ? 0.6 : 1));
      part = 'blast';
    } else {
      // the M1 steel helmet turns some rounds (a glancing hit: a ringing head, not a hole) - game rule, seeded
      M.headN = (M.headN || 0) + (part === 'head' ? 1 : 0);
      const glance = part === 'head' && ((x => x - Math.floor(x))(Math.sin(M.seed * 7.13 + M.headN * 31.7) * 9631.17)) < 0.4;
      M.hp[part] = Math.max(0, M.hp[part] - h.hp * (glance ? 0.3 : 1));
    }
    const tot = Object.values(M.hp).reduce((s, v) => s + v, 0) / 440;
    const wasAble = M.able;
    // a wound to the trunk kills about a third of the time (game rule; most hits put a man down rather than dead); the head
    // and a body shot to pieces always do (a seeded roll keeps runs repeatable)
    M.hits = (M.hits || 0) + 1;
    const roll = (x => x - Math.floor(x))(Math.sin(M.seed * 12.9898 + M.hits * 78.233) * 43758.5453);
    const trunk = M.hp.thorax <= 0 || M.hp.stomach <= 0;
    if (trunk && !M.trunkRolled) { M.trunkRolled = true; M.trunkKia = roll < 0.3; }
    if (M.hp.head <= 0 || (trunk && (M.trunkKia || !wasAble)) || tot < 0.3) { M.alive = false; M.able = false; M.why = h.why || ''; M.events.push({ e: 'kia', part }); return { part, kia: true, wia: false }; }
    if (trunk || M.hp.legL <= 0 || M.hp.legR <= 0 || M.hp.armR <= 0 || tot < 0.55) { M.able = false; M.events.push({ e: 'wia', part }); return { part, kia: false, wia: wasAble }; }
    M.wounded = 1 - tot;
    M.events.push({ e: 'hit', part });
    return { part, kia: false, wia: false };
  };
  M.place = (x, z, yaw, env) => { M.x = x; M.z = z; M.yaw = yaw; M.y = env.height(x, z); M.vx = M.vz = 0; };
  // ---- movement
  M.step = (dt, c, env) => {
    M.events.length = 0; M.firedT += dt;
    if (!M.alive) { M.deadT += dt; M.vx = M.vz = 0; M.speed = 0; M.y = env.height(M.x, M.z); return M.events; }
    // stance
    let want = M.able ? (c.stance || 'stand') : c.crawl === 'walk' ? 'stand' : 'prone';   // (ngc/infdepth: a walking wounded)
    if (want !== M.stanceTo && M.stanceT >= 1) { M.stanceFrom = M.stanceTo; M.stanceTo = want; M.stanceT = 0; M.stanceDur = MARINE.STANCE_T[`${M.stanceFrom}>${want}`] ?? 0.6; M.events.push({ e: 'stance', to: want }); }
    if (M.stanceT < 1) { M.stanceT = Math.min(1, M.stanceT + dt / M.stanceDur); if (M.stanceT >= 1) M.stance = M.stanceTo; }
    // speed limits by stance, wounds and the slope (Tobler: walking pace e^-3.5|grade + 0.05| relative to flat)
    const st = M.stanceT < 1 ? 'moving' : M.stance;
    let vmax = st === 'prone' ? MARINE.SPEED.crawl : st === 'crouch' ? 1.4 : st === 'moving' ? 0.6 : MARINE.SPEED.rush;
    if (!M.able) vmax = c.crawl === 'walk' ? 1.0 : c.crawl ? 0.3 : 0;   // (ngc/infdepth: a casualty can drag himself into cover)
    vmax *= 1 - 0.5 * M.wounded;
    let vx = c.vx || 0, vz = c.vz || 0; const vl = Math.hypot(vx, vz);
    if (vl > 0.05) {
      const ux = vx / vl, uz = vz / vl, gx = env.height(M.x + ux, M.z + uz) - env.height(M.x - ux, M.z - uz), grade = gx / 2;
      const tob = Math.min(1, Math.exp(-3.5 * Math.abs(grade + 0.05)) / Math.exp(-3.5 * 0.05));   // Tobler: the same effort is a slower pace on a grade
      if (env.water && env.water(M.x + ux * 1.5, M.z + uz * 1.5)) vmax = 0;   // stays out of the sea
      if (vl > vmax) { vx = ux * vmax; vz = uz * vmax; }
      vx *= tob; vz *= tob;
    }
    const dvx = vx - M.vx, dvz = vz - M.vz, dl = Math.hypot(dvx, dvz), am = MARINE.ACC * dt * (dl > 0 && vl < 0.05 ? 1.6 : 1);
    if (dl > am) { M.vx += dvx / dl * am; M.vz += dvz / dl * am; } else { M.vx = vx; M.vz = vz; }
    M.x += M.vx * dt; M.z += M.vz * dt; M.speed = Math.hypot(M.vx, M.vz);
    M.y = env.height(M.x, M.z);
    // facing: the aim, else the way he moves
    const face = c.face !== undefined ? c.face : M.speed > 0.3 ? Math.atan2(-M.vx, -M.vz) : M.yaw;
    M.yaw += clamp(angDiff(M.yaw, face), -MARINE.TURN * dt, MARINE.TURN * dt);
    M.gait += dt * (M.speed < 0.1 ? 0 : st === 'prone' ? 3.2 : 2 * Math.PI * (M.speed < 2 ? 1.85 : 2.6) * 0.5);
    return M.events;
  };
  return M;
}

// which part a point on the body is (stand / crouch: height bands and the side; prone: along the body)
export function partAt(M, p) {
  const fx = -Math.sin(M.yaw), fz = -Math.cos(M.yaw), lx = -Math.cos(M.yaw), lz = Math.sin(M.yaw);
  const dx = p.x - M.x, dz = p.z - M.z, lat = dx * lx + dz * lz;
  if (M.stanceTo === 'prone' || !M.able && M.stanceTo !== 'stand') {
    const along = (dx * fx + dz * fz) / 0.9;   // -1 feet .. +1 head
    return along > 0.72 ? 'head' : along > 0.25 ? (Math.abs(lat) > 0.2 ? (lat > 0 ? 'armL' : 'armR') : 'thorax') : along > -0.1 ? 'stomach' : lat > 0 ? 'legL' : 'legR';
  }
  const u = (p.y - M.y) / M.height();
  if (u > 0.87) return 'head';
  if (u > 0.62) return Math.abs(lat) > 0.2 ? (lat > 0 ? 'armL' : 'armR') : 'thorax';
  if (u > 0.48) return 'stomach';
  return lat > 0 ? 'legL' : 'legR';
}
// first t in [0, 1] of the segment a-b inside a vertical cylinder, or -1
export function segCyl(ax, ay, az, bx, by, bz, cx, cz, r, y0, y1) {
  const dx = bx - ax, dz = bz - az, fx = ax - cx, fz = az - cz, a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r;
  let t0, t1;
  if (a < 1e-9) { if (c > 0) return -1; t0 = 0; t1 = 1; }
  else { const D = b * b - 4 * a * c; if (D < 0) return -1; const s = Math.sqrt(D); t0 = (-b - s) / (2 * a); t1 = (-b + s) / (2 * a); }
  t0 = Math.max(0, t0); t1 = Math.min(1, t1); if (t0 > t1) return -1;
  // the height band inside [t0, t1]
  const ya = ay + (by - ay) * t0, yb = ay + (by - ay) * t1;
  if (ya >= y0 && ya <= y1) return t0;
  if ((ya < y0 && yb < y0) || (ya > y1 && yb > y1)) return -1;
  const yt = ya < y0 ? y0 : y1, t = t0 + (t1 - t0) * (yt - ya) / ((yb - ya) || 1e-9);
  return t >= t0 && t <= t1 ? t : -1;
}
// first t of segment a-b within r of segment p-q (sampled; fine for bodies)
export function segCapsule(ax, ay, az, bx, by, bz, px, py, pz, qx, qy, qz, r) {
  // closest approach between the two segments, then back off along a-b by the penetration
  const ux = bx - ax, uy = by - ay, uz = bz - az, vx = qx - px, vy = qy - py, vz = qz - pz, wx = ax - px, wy = ay - py, wz = az - pz;
  const a = ux * ux + uy * uy + uz * uz, b = ux * vx + uy * vy + uz * vz, c = vx * vx + vy * vy + vz * vz, d = ux * wx + uy * wy + uz * wz, e = vx * wx + vy * wy + vz * wz;
  const D = a * c - b * b; let s = D > 1e-9 ? clamp((b * e - c * d) / D, 0, 1) : 0, t = c > 1e-9 ? clamp((b * s + e) / c, 0, 1) : 0;
  s = a > 1e-9 ? clamp((b * t - d) / a, 0, 1) : 0;
  const cx = ax + ux * s - (px + vx * t), cy = ay + uy * s - (py + vy * t), cz = az + uz * s - (pz + vz * t), dist = Math.hypot(cx, cy, cz);
  if (dist > r) return -1;
  const L = Math.sqrt(a) || 1, back = Math.sqrt(Math.max(0, r * r - dist * dist)) / L;
  return Math.max(0, s - back);
}
