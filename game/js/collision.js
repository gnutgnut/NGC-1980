// NGC-1980 wave 3 #3 COLLISION: ONE collision world for every unit - aircraft (fuselage / wings), rotors (the disc's
// sweep), ships' parked crafts, vehicles, tanks, infantry, walkers, structures, trees - with a broadphase that scales to
// the whole war, contact response per class, and the AI's avoidance on the same data. PURE: no THREE, no DOM, no game
// imports (runs in node: tools/collisionbench.mjs).
//
//   const CW = createCollisionWorld({ cell: 10 });
//   const b = CW.add({ cls, mass, shape: 'circle' | 'box', r | hl, hw, x, z, y0, y1, yaw, ... })   a body (see BODY)
//   CW.addStatic(b)                       never moves (trees, posts): its own grid, never re-hashed
//   CW.place(b, x, z, yaw, y0, y1)        move a single-shape body (re-hashed only when it changes cells)
//   CW.setBoxes(b, boxes)                 a compound of world-space boxes { x, z, yaw, hl, hw, y0, y1 } (a craft's bounds())
//   CW.remove(b) / CW.enable(b, on)
//   CW.near(x, z, r, out, filt)           bodies whose bound circle touches the circle (dynamic + static), each once
//   CW.pushCircle(o, skip, filt)          o = { x, z, r, y0, y1 } pushed out of everything near; o.nx, o.nz, o.body = the
//                                         last contact; returns the number of contacts (the ground host's GR.collide)
//   CW.contact(a, b, out)                 narrowphase between two bodies: { nx, nz (from b to a), depth, x, z } or null
//   CW.step(dt)                           contact response between moving bodies (mass-weighted impulses and shoves,
//                                         hit events by closing speed); stats in CW.stats
//   CW.avoid(b, ux, uz, speed, out, o)    steering: the wanted direction (ux, uz) bent round the moving bodies ahead
//                                         (closest-approach prediction, keep right when head-on) -> { x, z, k (speed scale) }
//   CW.disc(x, y, z, R, skip, out, filt)  a rotor disc (horizontal, radius R at height y) against everything: the deepest
//                                         overlap { body, depth, x, z } or null (tree crowns are cones)
//   CW.segment(x0, y0, z0, x1, y1, z1, filt) -> { t, body } the first body a short segment passes through (trunks: cover)
//   CW.hard(mass, b)                      should a sim of this mass treat body b as a wall? (false: b is light and
//                                         pushable - CW.step shoves it out of the way instead: a tank through a car)
//
// BODY: { cls, mass (kg; Infinity = immovable), side, owner (the game object), y0, y1 (world heights),
//         vx, vz (m/s, for the response and the avoidance), enabled,
//         push(jx, jz, x, z)   a velocity impulse (N s, world) at a point: sims with momentum (vehicles, tanks, crafts)
//         shove(dx, dz)        a position correction (m): kinematic units (soldiers, walkers on a lite step)
//         hit(other, speed, c) a contact closing at `speed` m/s (damage, knock-downs, sounds); c.nx / nz from other to it
//         solid: false         seen by queries and the disc, not by pushCircle (things you can walk through)
//         avoidR               the radius the avoidance keeps clear (default: the shape's mean half-size) }
// Body classes (cls): 'veh' wheeled, 'trk' tracked / hover, 'inf' a man on foot, 'walk' a STRIDER, 'air' an aircraft on
// the ground, 'rotor' (unused as a body: the disc is a query), 'tree', 'struct', 'ship', 'misc'.
//
// Frames: as ground.js pushBox - a box's local x is right, local z is aft; yaw turns the local frame
// (lx = dx cos - dz sin, lz = dx sin + dz cos).

const INF = Infinity;
export const CLS_MASK = { veh: 1, trk: 2, inf: 4, walk: 8, air: 16, tree: 32, struct: 64, ship: 128, misc: 256, rotor: 512 };
export const MASK_GROUND = 1 | 2 | 4 | 8 | 16 | 32 | 64 | 128 | 256;
export const MASK_MOVERS = 1 | 2 | 4 | 8 | 16;
// a sim treats a body lighter than this fraction of its own mass, that can be pushed, as something to shove aside
export const PUSH_RATIO = 0.35;

export function createCollisionWorld(opt = {}) {
  const CELL = opt.cell || 10, INV = 1 / CELL;
  const DG = new Map(), SG = new Map();   // dynamic grid (re-hashed as bodies cross cells), static grid
  const key = (i, j) => (i + 50000) * 100000 + (j + 50000);
  const bodies = [];                      // every dynamic body
  let nextId = 1, stamp = 1;
  // off: a test / profiling switch - avoidance passes the wanted direction through and the contact step does nothing
  // (the bodies and the circle pushes stay: the sims need them). For before / after CPU measurements.
  const CW = { bodies, CELL, off: false, stats: { queries: 0, narrow: 0, pairs: 0, contacts: 0, rehash: 0, ms: 0, stepMs: 0, statics: 0 } };
  const now = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

  // ------------------------------------------------------------------ bodies and parts
  // part (world space): { k: 'c' | 'b', x, z, c, s, r, hl, hw, y0, y1, cone }
  function mkPart(b) { return { k: b.shape === 'box' ? 'b' : 'c', x: 0, z: 0, c: 1, s: 0, r: b.r || 0, hl: b.hl || 0, hw: b.hw || 0, y0: 0, y1: 0, cone: b.cone || 0 }; }
  function init(b) {
    b.id = nextId++; b.cls ||= 'misc'; b.mask = CLS_MASK[b.cls] || 256; b.mass ??= INF; b.enabled ??= true; b.solid ??= true;
    b.vx ||= 0; b.vz ||= 0; b.yaw ||= 0; b.y0 ??= -1e9; b.y1 ??= 1e9;
    if (!b.parts) { b.parts = [mkPart(b)]; b._single = true; }
    b._i0 = b._i1 = b._j0 = b._j1 = 0; b._in = false; b._st = 0; b.R = 0;
    refresh(b);
    return b;
  }
  // world-space parts and the bound circle of a single-shape body from its x, z, yaw, y0, y1
  function refresh(b) {
    if (b._single) {
      const p = b.parts[0]; p.x = b.x; p.z = b.z; p.c = Math.cos(b.yaw); p.s = Math.sin(b.yaw); p.y0 = b.y0; p.y1 = b.y1;
      p.r = b.r || p.r; p.hl = b.hl || p.hl; p.hw = b.hw || p.hw;
      b.R = p.k === 'c' ? Math.max(p.r, p.cone || 0) : Math.hypot(p.hl, p.hw);   // (a crown wider than its trunk: the rotor disc finds it)
      b.avoidR ??= p.k === 'c' ? p.r : (p.hl + p.hw) / 2;
    } else {
      let R = 0;
      for (const p of b.parts) R = Math.max(R, Math.hypot(p.x - b.x, p.z - b.z) + (p.k === 'c' ? p.r : Math.hypot(p.hl, p.hw)));
      b.R = R;
    }
  }
  function cells(b, G) {
    const i0 = Math.floor((b.x - b.R) * INV), i1 = Math.floor((b.x + b.R) * INV), j0 = Math.floor((b.z - b.R) * INV), j1 = Math.floor((b.z + b.R) * INV);
    if (b._in && i0 === b._i0 && i1 === b._i1 && j0 === b._j0 && j1 === b._j1) return;
    if (b._in) unhash(b, G);
    b._i0 = i0; b._i1 = i1; b._j0 = j0; b._j1 = j1; b._in = true; CW.stats.rehash++;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); let a = G.get(k); if (!a) G.set(k, a = []); a.push(b); }
  }
  function unhash(b, G) {
    for (let i = b._i0; i <= b._i1; i++) for (let j = b._j0; j <= b._j1; j++) {
      const k = key(i, j), a = G.get(k); if (!a) continue;
      const n = a.indexOf(b); if (n >= 0) { a[n] = a[a.length - 1]; a.pop(); } if (!a.length) G.delete(k);
    }
    b._in = false;
  }
  CW.add = b => { init(b); b.static = false; bodies.push(b); cells(b, DG); return b; };
  CW.addStatic = b => { init(b); b.static = true; cells(b, SG); CW.stats.statics++; return b; };
  CW.remove = b => { if (!b || !b.id) return; unhash(b, b.static ? SG : DG); if (!b.static) { const n = bodies.indexOf(b); if (n >= 0) bodies.splice(n, 1); } };
  CW.enable = (b, on) => { if (b) b.enabled = !!on; };
  CW.place = (b, x, z, yaw = b.yaw, y0 = b.y0, y1 = b.y1) => { b.x = x; b.z = z; b.yaw = yaw; b.y0 = y0; b.y1 = y1; refresh(b); cells(b, b.static ? SG : DG); return b; };
  // a compound from world-space boxes (a craft's bounds(): fuselage, wings, tail boom ...); the body sits at the first
  CW.setBoxes = (b, boxes) => {
    if (b._single) { b._single = false; b.parts = []; }
    const P = b.parts; P.length = boxes.length;
    let y0 = 1e9, y1 = -1e9;
    for (let n = 0; n < boxes.length; n++) {
      const B = boxes[n], p = P[n] ||= { k: 'b', x: 0, z: 0, c: 1, s: 0, r: 0, hl: 0, hw: 0, y0: 0, y1: 0, cone: 0 };
      if (B.r !== undefined && B.hl === undefined) { p.k = 'c'; p.r = B.r; } else { p.k = 'b'; p.hl = B.hl; p.hw = B.hw; }
      p.x = B.x; p.z = B.z; p.c = Math.cos(B.yaw || 0); p.s = Math.sin(B.yaw || 0); p.y0 = B.y0 ?? -1e9; p.y1 = B.y1 ?? 1e9;
      y0 = Math.min(y0, p.y0); y1 = Math.max(y1, p.y1);
    }
    b.x = boxes[0].x; b.z = boxes[0].z; b.yaw = boxes[0].yaw || 0; b.y0 = y0; b.y1 = y1;
    if (b.avoidR === undefined) { const q = boxes[0]; b.avoidR = q.hl !== undefined ? (q.hl + q.hw) / 2 : q.r; }
    refresh(b); cells(b, b.static ? SG : DG);
    return b;
  };

  // ------------------------------------------------------------------ broadphase
  const visit = (G, i0, i1, j0, j1, x, z, r, out, filt) => {
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = G.get(key(i, j)); if (!a) continue;
      for (let n = 0; n < a.length; n++) {
        const b = a[n]; if (b._st === stamp || !b.enabled) continue; b._st = stamp;
        const dx = b.x - x, dz = b.z - z, m = r + b.R;
        if (dx * dx + dz * dz > m * m) continue;
        if (filt && !filt(b)) continue;
        out.push(b);
      }
    }
  };
  CW.near = (x, z, r, out = [], filt = null, statics = true) => {
    out.length = 0; stamp++; CW.stats.queries++;
    const pad = statics ? 4 : 0;   // (a static body's bound is at most this past its cells: trees, posts)
    const i0 = Math.floor((x - r) * INV), i1 = Math.floor((x + r) * INV), j0 = Math.floor((z - r) * INV), j1 = Math.floor((z + r) * INV);
    visit(DG, i0, i1, j0, j1, x, z, r, out, filt);
    if (statics) { void pad; visit(SG, i0, i1, j0, j1, x, z, r, out, filt); }
    return out;
  };

  // ------------------------------------------------------------------ narrowphase (plan view + a vertical overlap)
  // a circle (x, z, r) against a part: depth > 0 and the normal (from the part to the circle) in R_
  const R_ = { nx: 0, nz: 0, depth: 0, x: 0, z: 0 };
  function circlePart(x, z, r, p) {
    if (p.k === 'c') {
      const dx = x - p.x, dz = z - p.z, d2 = dx * dx + dz * dz, m = r + p.r; if (d2 >= m * m) return false;
      const d = Math.sqrt(d2); R_.nx = d > 1e-6 ? dx / d : 1; R_.nz = d > 1e-6 ? dz / d : 0; R_.depth = m - d;
      R_.x = p.x + R_.nx * p.r; R_.z = p.z + R_.nz * p.r; return true;
    }
    const dx = x - p.x, dz = z - p.z, lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c;
    const qx = Math.max(-p.hw, Math.min(p.hw, lx)), qz = Math.max(-p.hl, Math.min(p.hl, lz));
    const ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez; if (d2 >= r * r) return false;
    let nlx, nlz, pen;
    if (d2 > 1e-12) { const d = Math.sqrt(d2); nlx = ex / d; nlz = ez / d; pen = r - d; }
    else { const fx = p.hw - Math.abs(lx), fz = p.hl - Math.abs(lz); if (fx < fz) { nlx = Math.sign(lx) || 1; nlz = 0; pen = fx + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; pen = fz + r; } }
    R_.nx = nlx * p.c + nlz * p.s; R_.nz = -nlx * p.s + nlz * p.c; R_.depth = pen;
    R_.x = p.x + qx * p.c + qz * p.s; R_.z = p.z - qx * p.s + qz * p.c;
    return true;
  }
  // box against box (2D SAT over the four axes): the minimum-overlap axis, pointing from q to p
  function boxBox(p, q) {
    const dx = p.x - q.x, dz = p.z - q.z;
    let best = INF, bx = 0, bz = 0;
    const ax = [p.c, -p.s, p.s, p.c, q.c, -q.s, q.s, q.c];   // the local x (right) and z (aft) axes of both, in the world
    for (let k = 0; k < 8; k += 2) {
      const ux = ax[k], uz = ax[k + 1];
      const rp = p.hw * Math.abs(p.c * ux - p.s * uz) + p.hl * Math.abs(p.s * ux + p.c * uz);
      const rq = q.hw * Math.abs(q.c * ux - q.s * uz) + q.hl * Math.abs(q.s * ux + q.c * uz);
      const d = dx * ux + dz * uz, o = rp + rq - Math.abs(d);
      if (o <= 0) return false;
      if (o < best) { best = o; const sg = d >= 0 ? 1 : -1; bx = ux * sg; bz = uz * sg; }
    }
    R_.nx = bx; R_.nz = bz; R_.depth = best;
    // contact point: q's support point toward p (good enough for a torque arm)
    const lx = bx * q.c - bz * q.s, lz = bx * q.s + bz * q.c, sx = Math.sign(lx) * q.hw, sz = Math.sign(lz) * q.hl;
    R_.x = q.x + sx * q.c + sz * q.s; R_.z = q.z - sx * q.s + sz * q.c;
    return true;
  }
  function partPart(p, q) {
    if (p.y1 < q.y0 || p.y0 > q.y1) return false;
    CW.stats.narrow++;
    if (p.k === 'c') return circlePart(p.x, p.z, p.r, q);
    if (q.k === 'c') { if (!circlePart(q.x, q.z, q.r, p)) return false; R_.nx = -R_.nx; R_.nz = -R_.nz; return true; }
    return boxBox(p, q);
  }
  // contact between two bodies: the deepest part pair (normal from b to a)
  CW.contact = (a, b, out = {}) => {
    if (a.y1 < b.y0 || a.y0 > b.y1) return null;
    let best = 0;
    for (const p of a.parts) for (const q of b.parts) if (partPart(p, q) && R_.depth > best) { best = R_.depth; out.nx = R_.nx; out.nz = R_.nz; out.depth = R_.depth; out.x = R_.x; out.z = R_.z; }
    return best > 0 ? out : null;
  };

  // ------------------------------------------------------------------ the ground host's circle push
  const _nb = [], _sn = [];
  CW.pushCircle = (o, skip = null, filt = null) => {
    const t0 = now();
    CW.near(o.x, o.z, o.r + 0.5, _nb, filt);
    let n = 0; const y0 = o.y0 ?? -1e9, y1 = o.y1 ?? 1e9;
    for (const b of _nb) {
      if (b === skip || b.owner === skip || !b.solid) continue;
      if (y1 < b.y0 || y0 > b.y1) continue;
      for (const p of b.parts) {
        if (y1 < p.y0 || y0 > p.y1) continue;
        if (!circlePart(o.x, o.z, o.r, p)) continue;
        o.x += R_.nx * R_.depth; o.z += R_.nz * R_.depth; o.nx = R_.nx; o.nz = R_.nz; o.body = b; n++;
      }
    }
    CW.stats.ms += now() - t0;
    return n;
  };
  CW.hard = (mass, b) => !(b.mass < mass * PUSH_RATIO && (b.push || b.shove));
  // the bodies overlapping a box (a catapult track, a landing area, a parking spot): out[] of bodies
  const _qb = { parts: [{ k: 'b', x: 0, z: 0, c: 1, s: 0, r: 0, hl: 0, hw: 0, y0: 0, y1: 0 }], y0: 0, y1: 0 }, _qn = [], _qc = {};
  CW.boxQuery = (x, z, yaw, hl, hw, y0, y1, out = [], filt = null) => {
    out.length = 0; const p = _qb.parts[0];
    p.x = x; p.z = z; p.c = Math.cos(yaw); p.s = Math.sin(yaw); p.hl = hl; p.hw = hw; p.y0 = _qb.y0 = y0; p.y1 = _qb.y1 = y1;
    for (const b of CW.near(x, z, Math.hypot(hl, hw), _qn, filt, false)) if (CW.contact(_qb, b, _qc)) out.push(b);
    return out;
  };

  // ------------------------------------------------------------------ contact response
  // Every moving body against everything near it, each pair once. Impulse along the normal with the masses (a body
  // without push / shove counts as immovable), restitution 0.15, positional correction for what overlaps: shoves for
  // kinematic bodies, a separating-velocity bias for sims (they move themselves). hit() events by closing speed.
  const _c = { nx: 0, nz: 0, depth: 0, x: 0, z: 0 }, _cf = { nx: 0, nz: 0, depth: 0, x: 0, z: 0 };
  const E = 0.15, SLOP = 0.02, BETA = 0.6;
  const invM = b => (b.static || !(b.push || b.shove) || !(b.mass < INF)) ? 0 : 1 / b.mass;
  CW.step = (dt) => {
    if (CW.off) { CW.stats.stepMs = 0; return; }
    const t0 = now(); let pairs = 0, hits = 0;
    for (const a of bodies) {
      if (!a.enabled || !(a.push || a.shove || a.hit)) continue;
      CW.near(a.x, a.z, a.R + 0.2, _sn);
      for (const b of _sn) {
        if (b === a || (!b.static && (b.push || b.shove || b.hit) && b.id < a.id)) continue;   // each moving pair once
        if (a.owner && a.owner === b.owner) continue;
        if (a.ignore && a.ignore(b)) continue; if (b.ignore && b.ignore(a)) continue;
        pairs++;
        if (!CW.contact(a, b, _c)) continue;
        hits++;
        const ia = invM(a), ib = invM(b), nx = _c.nx, nz = _c.nz;
        const rv = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz, closing = -rv;
        _cf.nx = -nx; _cf.nz = -nz; _cf.depth = _c.depth; _cf.x = _c.x; _cf.z = _c.z;
        if (closing > 0.3) { if (a.hit) a.hit(b, closing, _c); if (b.hit) b.hit(a, closing, _cf); }
        if (ia + ib <= 0 || !b.solid || !a.solid) continue;
        // impulse (only while closing) + a separating bias for sims, a shove for kinematic bodies
        let J = closing > 0 ? (1 + E) * closing / (ia + ib) : 0;
        const corr = Math.max(0, _c.depth - SLOP) * BETA;
        const bias = Math.min(3, corr / Math.max(dt, 1e-3) * 0.25);
        const Ja = J + (a.shove ? 0 : bias / (ia + ib)), Jb = J + (b.shove ? 0 : bias / (ia + ib));
        if (ia > 0) { if (a.push && Ja > 0) a.push(nx * Ja, nz * Ja, _c.x, _c.z); if (a.shove) a.shove(nx * corr * ia / (ia + ib), nz * corr * ia / (ia + ib)); }
        if (ib > 0) { if (b.push && Jb > 0) b.push(-nx * Jb, -nz * Jb, _c.x, _c.z); if (b.shove) b.shove(-nx * corr * ib / (ia + ib), -nz * corr * ib / (ia + ib)); }
      }
    }
    CW.stats.pairs = pairs; CW.stats.contacts = hits; CW.stats.stepMs = now() - t0;
  };

  // ------------------------------------------------------------------ avoidance
  // The wanted direction (ux, uz) at `speed` bent round the moving bodies within the look-ahead: for each, the time of
  // closest approach of the relative motion (capped at T s) and the miss distance; a miss closer than the two avoid
  // radii plus a margin steers away from where it will be (to the right when it is dead ahead: both keep right and
  // pass port to port), weighted by how soon; already too close: straight apart. k < 1 slows for what is ahead.
  const _av = [], _wn = new Float64Array(18);
  // a body's half-extent along a unit direction (a box: its projection; a compound: its avoid radius)
  const ext = (b, ux, uz) => { if (!b._single) return b.avoidR ?? b.R; const p = b.parts[0]; return p.k === 'c' ? p.r : p.hw * Math.abs(ux * p.c - uz * p.s) + p.hl * Math.abs(ux * p.s + uz * p.c); };
  CW.avoid = (b, ux, uz, speed, out = {}, o = {}) => {
    if (CW.off) { const l0 = Math.hypot(ux, uz) || 1; out.x = ux / l0; out.z = uz / l0; out.k = 1; return out; }
    const t0 = now(), T = o.T ?? 3, margin = o.margin ?? 0.6, look = o.look ?? Math.max(4, speed * T) + b.avoidR;
    const filt = o.filt || null, myR = b.avoidR ?? b.R;
    let l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
    let sx = 0, sz = 0, k = 1, nw = 0;
    CW.near(b.x, b.z, look + 12, _av, filt, o.statics ?? false);
    const vx = ux * speed, vz = uz * speed;
    for (const n of _av) {
      if (n === b || (b.owner && n.owner === b.owner) || !n.solid) continue;
      if (n.y1 < b.y0 || n.y0 > b.y1) continue;
      const dx = n.x - b.x, dz = n.z - b.z, d = Math.hypot(dx, dz);
      if (d > look + myR + 2 * n.R + margin) continue;
      const ud = d > 1e-6 ? 1 / d : 0, e0 = ext(b, dx * ud, dz * ud) + ext(n, dx * ud, dz * ud) + margin;
      const rvx = vx - (n.vx || 0), rvz = vz - (n.vz || 0), rv2 = rvx * rvx + rvz * rvz;
      const Tn = T + n.R / Math.max(1, speed);   // (a big one is seen sooner: the time to get round it)
      let t = rv2 > 1e-4 ? (dx * rvx + dz * rvz) / rv2 : 0; t = Math.max(0, Math.min(Tn, t));
      const cx = dx - rvx * t, cz = dz - rvz * t, cd = Math.hypot(cx, cz), uc = cd > 1e-6 ? 1 / cd : 0;
      const minD = cd > 0.25 ? ext(b, cx * uc, cz * uc) + ext(n, cx * uc, cz * uc) + margin : ext(b, -uz, ux) + ext(n, -uz, ux) + margin;   // the two shapes' extents along the miss (dead ahead: across our way)
      // inside the clearance already: straight out (a box: off its nearest face), slower if it is ahead
      let ins = false, ax = 0, az = 0, pen = 0;
      const p0 = n._single ? n.parts[0] : null;
      if (p0 && p0.k === 'b') { if (circlePart(b.x, b.z, myR + margin, p0)) { ins = true; ax = R_.nx; az = R_.nz; pen = Math.min(1, R_.depth / (myR + margin)); } }
      else if (d < e0) { ins = true; ax = d > 1e-3 ? -dx / d : -uz; az = d > 1e-3 ? -dz / d : ux; pen = (e0 - d) / e0; }
      if (ins) { if (nw < 6) { _wn[nw * 3] = ax; _wn[nw * 3 + 1] = az; _wn[nw * 3 + 2] = pen; nw++; } continue; }   // (slid along after the sum)
      if (cd >= minD || (dx * rvx + dz * rvz) <= 0) continue;   // misses, or opening
      const w = (1 - cd / minD) * (1 - t / (Tn + 0.5)) * 2;
      // away from the closest-approach point; nearly head-on: the right of the way we go (keep right)
      const rx = -uz, rz = ux, side = cx * rx + cz * rz;   // > 0: it passes on our right
      ax = 0; az = 0;
      if (Math.abs(side) < minD * 0.25) { ax = rx; az = rz; }   // dead ahead: break right
      else { ax = -cx / (cd || 1); az = -cz / (cd || 1); const lat = ax * rx + az * rz; ax = rx * lat; az = rz * lat; }   // its lateral part
      sx += ax * w; sz += az * w;
      // the static one we close on (parked, slower): ease off as it gets near
      const along = dx * ux + dz * uz; if (along > 0 && t < 1.5) k = Math.min(k, Math.max(0.25, t / 1.5));
    }
    let rx = ux + sx, rz = uz + sz;
    // inside something's clearance: slide along it (the part of the way that goes into it taken out; straight into it:
    // along its face to our right), and ease out of it
    for (let i = 0; i < nw; i++) {
      const nx = _wn[i * 3], nz = _wn[i * 3 + 1], pen = _wn[i * 3 + 2], dp = rx * nx + rz * nz;
      if (dp < 0) {
        rx -= nx * dp; rz -= nz * dp;
        if (Math.hypot(rx, rz) < 0.35) { let tx = -nz, tz = nx; if (tx * -uz + tz * ux < 0) { tx = -tx; tz = -tz; } rx += tx * 0.8; rz += tz * 0.8; }
        k = Math.min(k, Math.max(0.35, 1 - pen * 0.6));
      }
      rx += nx * pen * 0.6; rz += nz * pen * 0.6;
    }
    l = Math.hypot(rx, rz);
    if (l < 1e-3) { rx = -uz; rz = ux; l = 1; }
    out.x = rx / l; out.z = rz / l; out.k = k; CW.stats.ms += now() - t0;
    return out;
  };

  // ------------------------------------------------------------------ rotor discs and segments
  // a horizontal disc (radius R at height y) against the parts whose height range holds y: the deepest overlap
  const _dn = [];
  CW.disc = (x, y, z, R, skip = null, out = {}, filt = null) => {
    CW.near(x, z, R + 0.5, _dn, filt);
    let best = 0;
    for (const b of _dn) {
      if (b === skip || (skip && b.owner === skip) || y < b.y0 || y > b.y1) continue;
      for (const p of b.parts) {
        if (y < p.y0 || y > p.y1) continue;
        let hit;
        if (p.k === 'c' && p.cone) {   // a crown: its radius shrinks to the tip
          const rr = p.cone * (1 - (y - p.y0) / Math.max(0.1, p.y1 - p.y0)), dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz), m = R + Math.max(p.r, rr);
          hit = d < m; if (hit) { R_.depth = m - d; R_.x = p.x; R_.z = p.z; }
        } else hit = circlePart(x, z, R, p);
        if (hit && R_.depth > best) { best = R_.depth; out.body = b; out.depth = R_.depth; out.x = R_.x; out.z = R_.z; out.part = p; }
      }
    }
    return best > 0 ? out : null;
  };
  CW.segment = (x0, y0, z0, x1, y1, z1, filt = null) => {
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, L = Math.hypot(x1 - x0, z1 - z0);
    if (L > CELL * 8) return null;
    CW.near(mx, mz, L / 2 + 1, _dn, filt);
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1e-9;
    let best = null;
    for (const b of _dn) for (const p of b.parts) {
      let t;
      if (p.k === 'c') {
        const fx = x0 - p.x, fz = z0 - p.z, B2 = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - p.r * p.r;   // where the path enters the circle
        if (C <= 0) t = 0; else { const q = B2 * B2 - 4 * L2 * C; if (q < 0) continue; t = (-B2 - Math.sqrt(q)) / (2 * L2); if (t < 0 || t > 1) continue; }
      } else {   // slab test in the box frame
        const ax = x0 - p.x, az = z0 - p.z, lx0 = ax * p.c - az * p.s, lz0 = ax * p.s + az * p.c, ldx = dx * p.c - dz * p.s, ldz = dx * p.s + dz * p.c;
        let t0 = 0, t1 = 1; let ok = true;
        for (const [o0, d0, h] of [[lx0, ldx, p.hw], [lz0, ldz, p.hl]]) {
          if (Math.abs(d0) < 1e-9) { if (Math.abs(o0) > h) { ok = false; break; } continue; }
          let a = (-h - o0) / d0, c = (h - o0) / d0; if (a > c) { const s = a; a = c; c = s; }
          t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) { ok = false; break; }
        }
        if (!ok) continue; t = t0;
      }
      const y = y0 + (y1 - y0) * t; if (y < p.y0 || y > p.y1) continue;
      if (!best || t < best.t) best = { t, body: b, part: p };
    }
    return best;
  };
  return CW;
}

// typical masses (kg) for the bodies the game registers (CONFIRMED / INFERRED; headline figures):
//   M151A2 1,100 (TM 9-2320-218-10 curb ~1,090), M35A2 5,900 (curb), M60A3 52,600 combat (FM 17-12 / TM 9-2350-253-10),
//   M113A2 11,250 combat, F/A-18A ~10,500 empty, F-14A ~18,200 empty, UH-1H 2,360 empty, a Marine with kit ~100,
//   RW-1 STRIDER (game) 420, RW-7 (game) 24,000, M1A2 SEPv3 66,800, T-90M 46,500.
export const MASS = { m151: 1100, m35: 5900, car: 1000, m60: 52600, m113: 11250, hornet: 10500, tomcat: 18200, huey: 2360, marine: 100, strider: 420, hovertank: 24000, mbt: 60000 };
