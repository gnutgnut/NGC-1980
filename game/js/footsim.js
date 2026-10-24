// FOUNDATION: the default soldier movement sim - a kinematic character controller for a 1980 Marine on foot: walk,
// run, sprint (stamina), crouch, prone, jump, falls, wading and swimming, ladders, steps and slopes, walls, and riding
// moving / turning / flying ship decks (platform-relative, through the ground host's carry / settle).
// Pure: no THREE, no DOM, no game imports. It talks to the world only through `env` (game: ground.js; node: a stub,
// see tools/footbench.mjs). The INFANTRY agent may replace it with a richer sim of the same shape (see FOUNDATION.md):
//   const W = createWalker();  W.place(x, y, z, yaw);  W.step(dt, intent, env) -> events
//   intent: { mx, mz (-1..1: right / forward), sprint, stance: 'stand'|'crouch'|'prone', jump, yaw, pitch }
//   env:    { floor(x, z, y, step, tall), sample(x, z, out), collide(o), ladderAt(x, z, y, r), carry(o), settle(o, onGround) }
//
// Numbers (CONFIRMED = from the source, INFERRED = typical / tuned):
//   quick time 120 steps/min x 30 in = 1.52 m/s, double time 180 steps/min x 36 in = 2.74 m/s   FM 22-5 (1986) CONFIRMED
//   loaded sprint ~5.5 m/s for a 3-5 s rush (FM 7-8 rushes); 20-25 kg of fighting load                  INFERRED
//   crouched walk ~1.4 m/s, crawl (high crawl) ~0.5 m/s                                                 INFERRED
//   eye height standing 1.62 m (US male 50th %ile 1.63 m, MIL-STD-1472 anthropometry), kneeling ~1.05   CONFIRMED / INFERRED
//   standing jump with load ~0.45 m -> 2.97 m/s take-off                                                INFERRED
//   falls: injury from ~2.5 m (7 m/s at impact), often fatal beyond ~8 m (12.5 m/s)                     INFERRED (CDC/NIOSH fall data)
//   swimming in uniform ~0.8-1 m/s                                                                      INFERRED
//   ngc/waterfish: diving (hold C) to ~4.5 m at ~1 m/s; breath held ~45 s (untrained adults 30-90 s)    INFERRED
export const SOLDIER = {
  R: 0.3, TALL: { stand: 1.8, crouch: 1.2, prone: 0.45 }, EYE: { stand: 1.62, crouch: 1.05, prone: 0.3 },
  SPEED: { walk: 1.52, run: 2.74, sprint: 5.5, crouch: 1.4, prone: 0.5, swim: 0.9, ladder: 1.1 },
  ACCEL: 9, AIR: 1.5, JUMP_V: 2.97, STEP: 0.45, DROP: 0.55, SLOPE_TAN: 0.75, G: 9.81,
  FALL_HURT: 7.0, FALL_KILL: 12.5, WATER_HURT: 16, SWIM_D: 1.3, DIVE_D: 4.5, BREATH_S: 45, STAMINA_S: 14, STAMINA_REST_S: 25,
  STANCE_T: { stand: 0.35, crouch: 0.3, prone: 0.9 },
};

export function createWalker(P = SOLDIER) {
  const W = {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, stance: 'stand', eye: P.EYE.stand, tall: P.TALL.stand,
    onGround: true, swim: false, wade: 0, ladder: null, sprinting: false, stamina: 1, winded: false, surface: 'grass',
    plat: null, loc: null, carried: null, stride: 0, airT: 0, peakVy: 0, events: [], P, breath: P.BREATH_S || 45, gasp: false,
  };
  const _s = {}, _o = { x: 0, z: 0, r: P.R, y0: 0, y1: 0, nx: 0, nz: 0 };
  W.place = (x, y, z, yaw = 0) => { Object.assign(W, { x, y, z, yaw, vx: 0, vy: 0, vz: 0, onGround: true, swim: false, ladder: null, plat: null, loc: null, airT: 0 }); };
  const ev = (e, o) => W.events.push({ e, ...o });
  function speedFor(intent) {
    const S = P.SPEED;
    if (W.swim) return S.swim;
    if (W.stance === 'prone') return S.prone;
    if (W.stance === 'crouch') return S.crouch;
    const run = intent.walk ? S.walk : S.run;
    return (W.sprinting ? S.sprint : run) * (intent.speedK ?? 1);   // speedK: injuries, load (medical / inventory slots)
  }
  // try to move horizontally to (nx, nz): stairs / deck edges up to STEP, no walls, no steep climbs
  function tryMove(nx, nz, env) {
    if (nx === W.x && nz === W.z) return false;
    const f = env.floor(nx, nz, W.y, P.STEP, W.tall);
    if (f === Infinity) return false;
    if ((W.onGround || W.wade > 0) && f > W.y + P.STEP) return false;
    if (!W.onGround && !W.swim && f > W.y + 0.05) return false;   // airborne into a ledge
    if (W.swim && f > W.y + P.STEP + 0.3) return false;              // swimming into a cliff or a quay
    if (W.onGround && f > W.y + 1e-4 && grade(nx - W.x, nz - W.z, env) > P.SLOPE_TAN) return false;   // too steep to walk up
    W.x = nx; W.z = nz; return true;
  }
  // rise over the next metre along (dx, dz) - a ramp's grade; steps and edges (more than STEP) are not slopes
  function grade(dx, dz, env, d = 1) {
    const l = Math.hypot(dx, dz) / d; if (l < 1e-6) return 0;
    const g = env.floor(W.x + dx / l, W.z + dz / l, W.y + 0.8, P.STEP + 0.8, W.tall);   // (ngc/interiors: was +1.2: a deck 2.6 m overhead, the next level, read as a wall of a slope)
    return g === Infinity ? 0 : g - W.y;
  }
  W.step = (dt, intent, env) => {
    W.events.length = 0;
    env.carry(W);   // the deck under us has moved / turned / climbed since the last frame
    const n = Math.max(1, Math.ceil(dt / 0.02)), h = dt / n;
    for (let k = 0; k < n; k++) sub(h, intent, env, k === 0);
    const had = W.plat, c = W.carried;
    env.settle(W, W.onGround || !!W.ladder);
    if (had && !W.plat && dt > 0) {   // stepped off a moving deck: keep its speed (deckV: the host's measure, else this step's carry)
      if (W.deckV) { W.vx += W.deckV.x; W.vz += W.deckV.z; } else if (c) { W.vx += c.dx / dt; W.vz += c.dz / dt; }
    }
    if (!W.plat) W.deckV = null;
    return W.events;
  };
  function sub(h, I, env, first) {
    // stance: prone / crouch / stand (no standing up under a ... we have no ceilings yet), heights ease over STANCE_T
    let want = I.stance || 'stand';
    if (W.swim || W.ladder) want = 'stand';
    if (want !== W.stance && first) { W.stance = want; ev('stance', { stance: want }); }
    const tk = h / P.STANCE_T[W.stance];
    W.eye += Math.max(-tk * 1.4, Math.min(tk * 1.4, P.EYE[W.stance] - W.eye)); W.tall = P.TALL[W.stance];
    // stamina: sprinting drains it, resting refills; winded below 5% until 30%
    W.sprinting = !!I.sprint && W.stance === 'stand' && !W.swim && !W.winded && (I.mz || 0) > 0.3 && W.onGround;
    W.stamina = Math.max(0, Math.min(1, W.stamina + (W.sprinting ? -h / P.STAMINA_S : h / P.STAMINA_REST_S)));
    if (W.stamina < 0.05) W.winded = true; else if (W.stamina > 0.3) W.winded = false;

    // ---- on a ladder: up / down the rungs, off at the top onto the deck / roof
    if (W.ladder) {
      const L = env.ladderAt(W.x, W.z, W.y, 0.9);
      if (!L) { W.ladder = null; W.onGround = false; return; }
      W.ladder = L;
      const dir = (I.mz || 0) > 0.2 ? 1 : (I.mz || 0) < -0.2 ? -1 : 0;
      W.vx = W.vz = 0; W.vy = dir * P.SPEED.ladder; W.y += W.vy * h;
      W.x += (L.x - L.fx * 0.42 - W.x) * Math.min(1, 10 * h); W.z += (L.z - L.fz * 0.42 - W.z) * Math.min(1, 10 * h);
      if (dir && Math.floor(W.y / 0.3) !== Math.floor((W.y - W.vy * h) / 0.3)) ev('rung');
      if (W.y >= L.y1 - 0.05) { W.x = L.tx; W.z = L.tz; W.y = L.y1; W.vy = 0; W.ladder = null; W.onGround = true; ev('ladderTop'); }
      else if (W.y <= L.y0 && dir < 0) { W.ladder = null; W.onGround = false; }
      else if (I.jump) { W.ladder = null; W.onGround = false; W.vx = -L.fx * 1.5; W.vz = -L.fz * 1.5; }
      return;
    }
    // ---- where we are: surface, water
    env.sample(W.x, W.z, _s); W.surface = _s.surface;
    const seabed = _s.surface === 'water' || _s.water > 0 ? _s.h : -Infinity;
    const depth = seabed > -Infinity ? -seabed : 0;   // sea depth here (surface at y = 0)
    const wasSwim = W.swim;
    W.swim = depth > P.SWIM_D && W.y < 0.3;
    if (W.swim && !wasSwim && W.vy < -1) {   // fell (or jumped) into the sea
      const v = -W.vy; W.vy *= 0.25; W.onGround = false; ev('splash', { v });
      if (v > P.WATER_HURT) ev('fall', { v: v * 0.6, water: true });
    }
    W.wade = !W.swim && depth > 0 && W.y < 0.05 ? Math.min(1, depth / P.SWIM_D) : 0;
    // ---- what the legs want: a horizontal velocity along the look direction
    const mx = I.mx || 0, mz = I.mz || 0, ml = Math.hypot(mx, mz), k = ml > 1 ? 1 / ml : 1;
    const fx = -Math.sin(W.yaw), fz = -Math.cos(W.yaw), rx = Math.cos(W.yaw), rz = -Math.sin(W.yaw);
    let sp = speedFor(I) * (W.swim ? 1 : 1 - 0.55 * W.wade) * (W.onGround && !W.swim ? Math.max(0.6, (env.SURF && env.SURF[_s.surface] ? env.SURF[_s.surface].speed : 1)) : 1);
    if (mz < 0) sp *= W.stance === 'stand' && !W.swim ? 0.7 : 1;   // walking backwards is slower
    if (W.onGround && ml > 0.1 && env.stairAt && env.stairAt(W.x, W.z, W.y)) sp *= 0.6;   // ngc/interiors: a stair is climbed step by step (~0.9 m/s up its slope), not at a hill's pace
    else if (W.onGround && ml > 0.1 && !W.swim && !W.wade) {   // hills: Tobler's hiking function relative to the flat (Tobler 1993, CONFIRMED form)
      const dx = fx * mz + rx * mx, dz = fz * mz + rz * mx, S = grade(dx, dz, env), S2 = grade(dx * 0.5, dz * 0.5, env, 0.5) * 2;
      if (Math.abs(S) < 1.2 && Math.abs(S - S2) < 0.3) sp *= Math.max(0.3, Math.min(1.1, Math.exp(-3.5 * (Math.abs(S + 0.05) - 0.05))));   // a drop off an edge is not a slope
    }
    const wx = (fx * mz + rx * mx) * k * sp, wz = (fz * mz + rz * mx) * k * sp;
    if (I.vel && (W.onGround || W.swim)) { W.vx = I.vel.x; W.vz = I.vel.z; }   // wave 2: the Marine's body (soldier.js) decides the deck-relative velocity; this sim only resolves it against the world
    else {
      const acc = (W.onGround || W.swim ? P.ACCEL : P.AIR) * h;
      const dvx = wx - W.vx, dvz = wz - W.vz, dl = Math.hypot(dvx, dvz);
      if (dl > 0) { const s = Math.min(1, acc / dl); W.vx += dvx * s; W.vz += dvz * s; }
    }
    // ---- jump (standing, on the ground, not wading deep)
    if (I.jump && first && W.onGround && W.stance === 'stand' && W.wade < 0.5 && !W.swim) { W.vy = P.JUMP_V; W.onGround = false; W.airT = 0; ev('jump'); }
    // ---- horizontal move: walls, steps, slopes; then push out of trees, buildings, crafts
    const ox = W.x, oz = W.z, nx = W.x + W.vx * h, nz = W.z + W.vz * h;
    if (!tryMove(nx, nz, env)) {
      if (tryMove(nx, W.z, env)) W.vz = 0; else if (tryMove(W.x, nz, env)) W.vx = 0; else { W.vx = W.vz = 0; }
    }
    _o.x = W.x; _o.z = W.z; _o.r = P.R; _o.y0 = W.y + 0.25; _o.y1 = W.y + W.tall;
    if (env.collide(_o, null)) {
      // collided: keep the push only if the new spot is standable, kill the velocity into the obstacle
      if (env.floor(_o.x, _o.z, W.y, P.STEP, W.tall) <= W.y + P.STEP) { W.x = _o.x; W.z = _o.z; }
      else { W.x = ox; W.z = oz; }
      const vn = W.vx * _o.nx + W.vz * _o.nz; if (vn < 0) { W.vx -= vn * _o.nx; W.vz -= vn * _o.nz; }
    }
    W.stride += Math.hypot(W.x - ox, W.z - oz);
    // ---- ladder: walking into one (facing it) grabs it
    if (mz > 0.3) {
      const L = env.ladderAt(W.x, W.z, W.y, P.R + 0.25);
      if (L && fx * L.fx + fz * L.fz > 0.3 && (W.y < L.y1 - 0.3)) { W.ladder = L; W.vx = W.vz = W.vy = 0; W.onGround = false; W.swim = false; ev('ladder', { name: L.name }); return; }
    }
    // ---- vertical: swimming, standing (follow the ground down steps / slopes), or falling
    const g = env.floor(W.x, W.z, W.y, P.STEP, W.tall), gnd = g === Infinity ? W.y : g;
    if (W.swim) {
      // ngc/waterfish: I.dive (hold C) takes him under, to DIVE_D or just over the bottom; he holds his breath down there
      // (BREATH_S) and comes up when he lets go or runs out (then not again until he has his breath back)
      const sub = W.y < -P.SWIM_D - 0.5, bs = P.BREATH_S || 45;
      W.breath = sub ? Math.max(0, W.breath - h) : Math.min(bs, W.breath + h * 3);
      if (W.breath <= 0 && !W.gasp) { W.gasp = true; ev('breath'); } else if (W.breath > bs * 0.5) W.gasp = false;
      const dive = !!I.dive && !W.gasp, ty = dive ? Math.min(-P.SWIM_D, Math.max(-(P.DIVE_D || 4.5), gnd + 0.6)) : -P.SWIM_D;
      if (dive || sub) { W.vy += ((ty - W.y) * 2 - W.vy * 2.5) * h; W.vy = Math.max(-1.1, Math.min(1.4, W.vy)); } else W.vy += ((ty - W.y) * 6 - W.vy * 3) * h;
      W.y += W.vy * h; W.onGround = false;
      if (gnd > ty - 0.05 && W.y <= gnd + 0.05) { W.y = gnd; W.vy = 0; W.onGround = true; W.swim = false; }   // shallows: feet on the bottom
      else if (W.y < gnd) W.y = gnd;
      return;
    }
    if (W.onGround) {
      if (gnd <= W.y + P.STEP && gnd >= W.y - P.DROP) { W.y = gnd; W.vy = 0; }
      else { W.onGround = false; W.airT = 0; W.vy = Math.min(W.vy, 0); }   // walked off an edge
    }
    if (!W.onGround) {
      W.airT += h; W.vy -= P.G * h; W.y += W.vy * h;
      if (depth > P.SWIM_D && W.y < 0.3) { /* into the sea: next substep swims (and splashes) */ }
      else if (W.y <= gnd) {
        const v = -W.vy; W.y = gnd; W.vy = 0; W.onGround = true;
        ev('land', { v, surface: W.surface });
        if (v > P.FALL_HURT) ev('fall', { v });
      }
    }
  }
  return W;
}
