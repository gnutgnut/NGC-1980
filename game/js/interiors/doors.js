// INTERIORS (ngc/interiors): doors, gates and hatches - their state, their swing, and what they block (pure: no THREE).
// One registry for the whole game (a module singleton), so a door you left open in a farmhouse is still open when you
// come back, whoever asks: world/solid.js (the leaf as a collider for walkers and vehicles), interiors.js (the leaf
// drawn, the doorway punched, F opens it), the ALBATROSS interior (watertight doors, the trunk hatch).
//
// A door lives in a HOST frame (a building's item frame, a ship's frame): plan door d = { u, v, y, w, h, ax: 'u'|'v'
// (the wall runs along), hinge: -1|1 (which end of the opening), swing: -1|1 (into which side of the wall), kind }.
//   DOORS.register(key, d, host)  -> D (the same D for the same key: state survives a chunk being rebuilt)
//                                    host: { toWorld(u, v, out) -> out [x, z], yaw() (the frame's heading), y0() (the
//                                    frame's floor level in the world) }
//   D.leaf(out)                   -> { hu, hv, du, dv, len } the leaf now: hinge point and direction in the host frame
//   D.part                        -> a world box { x, z, yaw, hw, hl, y0, y1 } kept up to date (ground.js pushBox)
//   DOORS.toggle(D) / open(D) / close(D);  DOORS.step(dt) moves the leaves;  DOORS.events: [{ D, open }] since last read
//   DOORS.nearest(x, y, z, fx, fz, reach) -> the door in front of someone at (x, y, z) looking along (fx, fz)
// Kinds: 'house' | 'inner' | 'shop' | 'church' | 'mil' (a hinged leaf, ~1.4 rad open), 'barn' (a heavy leaf, slow),
// 'garage' (up-and-over: tilts up into the roof), 'wt' (a ship's watertight door: dogs to work, then the leaf),
// 'hatch' (a horizontal hatch: the host reads D.a and makes it a floor when shut), 'gate' (a five-bar field gate).
export const KINDS = {
  house:  { open: 1.45, t: 0.9, thick: 0.05 },
  inner:  { open: 1.5,  t: 0.7, thick: 0.04 },
  shop:   { open: 1.45, t: 0.8, thick: 0.05 },
  church: { open: 1.4,  t: 1.6, thick: 0.08 },
  mil:    { open: 1.5,  t: 0.8, thick: 0.05 },
  barn:   { open: 1.55, t: 2.4, thick: 0.08 },
  garage: { open: 1.0,  t: 1.6, thick: 0.05 },
  wt:     { open: 1.55, t: 1.8, thick: 0.08, dogs: 0.9 },   // 0.9 s to knock the dogs off before the leaf moves
  hatch:  { open: 1.5,  t: 1.4, thick: 0.08 },
  gate:   { open: 1.6,  t: 1.2, thick: 0.08 },
};
const ease = a => a * a * (3 - 2 * a);

export function createDoorWorld() {
  const all = new Map(), moving = new Set(), grid = new Map(), G = 16;
  const W = { all, events: [] };
  const cell = (x, z) => Math.floor(x / G) * 100003 + Math.floor(z / G);
  const _w = [0, 0];
  W.register = (key, d, host) => {
    let D = all.get(key);
    if (D) { D.d = d; D.host = host; place(D); return D; }
    const K = KINDS[d.kind] || KINDS.house;
    D = { key, d, host, K, a: 0, want: 0, dogs: 0, part: { x: 0, z: 0, yaw: 0, hw: 0.5, hl: 0.05, y0: 0, y1: 2, r: d.w, door: true, t: 'door' }, cx: 0, cz: 0, cy: 0, cell: null, locked: !!d.locked };
    D.part.D = D;
    all.set(key, D); place(D); return D;
  };
  W.get = key => all.get(key) || null;
  // the doorway's centre in the world (for reach tests and sounds), and the grid cell it is filed under
  function place(D) {
    const d = D.d, h = D.host;
    h.toWorld(d.u, d.v, _w); D.cx = _w[0]; D.cz = _w[1]; D.cy = h.y0() + d.y + (d.horizontal ? -2.2 : d.h * 0.45);   // (a hatch overhead: reached from the deck below it)
    const c = cell(D.cx, D.cz);
    if (c !== D.cell) { if (D.cell !== null) { const a = grid.get(D.cell); if (a) { const i = a.indexOf(D); if (i >= 0) a.splice(i, 1); } } let a = grid.get(c); if (!a) grid.set(c, a = []); a.push(D); D.cell = c; }
    update(D);
  }
  W.place = place;
  // the leaf in the host frame: hinge (hu, hv), direction (du, dv) from the hinge along the leaf, its length
  const _l = { hu: 0, hv: 0, du: 0, dv: 0, len: 0, ang: 0, lift: 0 };
  function D_leaf(D, out = _l) {
    const d = D.d, k = ease(D.a), ang = k * D.K.open;
    out.len = d.w; out.ang = ang; out.lift = 0;
    if (d.kind === 'garage') {   // up-and-over: the whole leaf goes up and in; as a wall it stays across the opening until it clears your head
      out.hu = d.ax === 'u' ? d.u + d.w / 2 : d.u; out.hv = d.ax === 'u' ? d.v : d.v + d.w / 2;
      out.du = d.ax === 'u' ? -1 : 0; out.dv = d.ax === 'u' ? 0 : -1; out.lift = k; return out;
    }
    const hg = d.hinge || 1, sw = d.swing || 1, ca = Math.cos(ang), sa = Math.sin(ang);
    if (d.ax === 'u') { out.hu = d.u + hg * d.w / 2; out.hv = d.v; out.du = -hg * ca; out.dv = sw * sa; }
    else { out.hu = d.u; out.hv = d.v + hg * d.w / 2; out.du = sw * sa; out.dv = -hg * ca; }
    return out;
  }
  W.leaf = D_leaf;
  // the world collider of the leaf (a thin box from the hinge along the leaf); a garage door clears the opening as it rises
  function update(D) {
    const L = D_leaf(D), h = D.host, p = D.part, d = D.d;
    const mu = L.hu + L.du * L.len / 2, mv = L.hv + L.dv * L.len / 2;
    h.toWorld(mu, mv, _w); p.x = _w[0]; p.z = _w[1];
    // direction of the leaf in the world: the host frame turned by its heading
    const hy = h.yaw(), c = Math.cos(hy), s = Math.sin(hy), dx = c * L.du + s * L.dv, dz = -s * L.du + c * L.dv;
    p.yaw = Math.atan2(-dz, dx); p.hw = L.len / 2; p.hl = Math.max(0.06, D.K.thick);
    const y0 = h.y0() + d.y;
    if (d.kind === 'garage') { p.y0 = y0 + L.lift * (d.h - 0.2); p.y1 = y0 + d.h; }
    else if (d.kind === 'hatch') { p.y0 = y0; p.y1 = y0 + 0.9 * Math.sin(L.ang); }   // a raised hatch lid stands up off the deck
    else { p.y0 = y0 - 0.05; p.y1 = y0 + d.h; }
    D.world = { x: p.x, z: p.z };
  }
  W.update = update;
  W.toggle = D => D.want > 0.5 ? W.close(D) : W.open(D);
  W.open = D => { if (D.locked) { W.events.push({ D, open: false, locked: true }); return false; } if (D.want === 1) return true; D.want = 1; D.dogs = D.a < 0.01 && D.K.dogs ? D.K.dogs : 0; moving.add(D); W.events.push({ D, open: true }); return true; };
  W.close = D => { if (D.want === 0) return true; D.want = 0; D.dogs = 0; moving.add(D); W.events.push({ D, open: false }); return true; };
  W.set = (D, open) => { D.want = D.a = open ? 1 : 0; update(D); };
  W.step = dt => {
    for (const D of moving) {
      if (D.dogs > 0) { D.dogs -= dt; continue; }
      const v = dt / D.K.t;
      D.a += Math.max(-v, Math.min(v, D.want - D.a));
      if (Math.abs(D.a - D.want) < 1e-4) { D.a = D.want; moving.delete(D); if (D.want === 0 && D.K.dogs) { D.dogs = 0; W.events.push({ D, open: false, shut: true }); } }
      // a moving ship / item host: re-place (the cell and centre follow the host)
      place(D);
    }
  };
  // doors near (x, z): the grid cells round it
  const _near = [];
  W.near = (x, z, r = 3) => {
    _near.length = 0;
    for (let i = Math.floor((x - r) / G); i <= Math.floor((x + r) / G); i++) for (let j = Math.floor((z - r) / G); j <= Math.floor((z + r) / G); j++) { const a = grid.get(i * 100003 + j); if (a) for (const D of a) if (Math.abs(D.cx - x) < r + 2 && Math.abs(D.cz - z) < r + 2) _near.push(D); }
    return _near;
  };
  // the door someone at (x, y feet, z) looking along (fx, fz) means: within reach of its doorway, most in front of him
  W.nearest = (x, y, z, fx, fz, reach = 1.9) => {
    let best = null, bs = -1e9;
    for (const D of W.near(x, z, reach + 1)) {
      const dx = D.cx - x, dz = D.cz - z, d = Math.hypot(dx, dz);
      if (d > reach || Math.abs(D.cy - (y + 1.0)) > 1.6) continue;
      const along = d > 1e-3 ? (dx * fx + dz * fz) / d : 1, sc = along * 1.5 - d;
      if (along < -0.35 && d > 0.9) continue;
      if (sc > bs) { bs = sc; best = D; }
    }
    return best;
  };
  // ships move: their doors are re-placed by their host every frame it is near (shipint calls this)
  W.refresh = list => { for (const D of list) place(D); };
  return W;
}
// the game's one registry
export const DOORS = createDoorWorld();
