// INTERIORS (wave 3, ngc/interiors): the rooms inside the lived-in world's 1980 buildings, as PLANS (pure: no THREE, no
// DOM; node-testable, worker-safe). One plan per world item, from the same seeded item the world worker draws the
// shell from (world/models.js), in the item's local frame: u along its x (width), v along its z (depth, the street
// front at +v), y up from its floor level (it.y). The plan is what everything else reads:
//   world/solid.js     walls (with door gaps) instead of one solid box, floors (ground floor, upper floor, stairs, the
//                      front step), furniture colliders, door leaves (doors.js) - what a Marine or a jeep bumps into
//   interiors.js       the rooms drawn near the camera: inner walls with real window holes, floors, ceilings, stairs,
//                      period furniture (furniture.js), the doors' leaves, the doorway "punch" (see interiors.js)
// Buildings with interiors: house (1-2 floors: living room, kitchen, stairs, bedrooms, bathroom), cottage, terrace
// units (2-3 floors: shops - grocer, newsagent, hardware, cafe - or houses; the first floor flat up the stairs), the
// parish church (porch, nave with pews, chancel), the filling station kiosk, barns, boat sheds, garages, and the task
// force's quonset barracks (interiors.js places them by the pads).
//
// plan = { t, H, walls: [box], floors: [floor], ceils: [rect], doors: [door], furn: [piece], solid: [box], wins: [] }
//   box   { u0, u1, v0, v1, y0, y1, c (hex), skip (Geo.box face mask: 1 bottom 2 top 4 -v 8 +v 16 -u 32 +u) }
//   floor { u0, u1, v0, v1, y, ry: [y at the low end, y at the high end] + ax 'u'|'v' + up +1|-1 (stairs), c, kind }
//   door  { id, u, v, y, w, h, ax: 'u'|'v' (the wall runs along), hinge: -1|1 (which end), swing: -1|1 (into -/+ the
//           wall normal), kind: 'house'|'shop'|'church'|'barn'|'garage'|'boat'|'gate', c (hex), out (the facade side) }
//   piece { k (furniture.js recipe), u, v, y, yaw, o (options) }   solid: furniture colliders, as boxes
import { rng } from '../world/rng.js';

export const LIFT = 0.27;        // the shell's plinth top is 0.25 above its floor level (models.js plinth): floors at 0.27
export const STAIR_TAN = 0.68;   // footsim.js walks up a grade under SLOPE_TAN 0.75 (a steep 34 degree domestic stair)
const T = 0.18;                  // inner wall thickness (inside the shell's faces)

// ------------------------------------------------------------------ shared with world/models.js (the shell)
// a 0..1 hash of the item (its seed) and a salt: what the shell and the rooms agree on without sharing a random stream
export const hash01 = (seed, salt = 0) => { let h = (seed | 0) ^ Math.imul(salt + 0x9e3779b9 | 0, 0x85ebca6b); h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// the front door's centre (u) on a house / cottage front: models.js draws it there, the rooms leave the gap there
export const doorU = it => (hash01(it.seed, 1) - 0.5) * (it.w - 2.4);
// which terrace units are shops (models.js draws the shopfront)
export const shopUnit = (it, i) => it.pub ? i === 0 : !!it.shops && hash01(it.seed, 10 + i) < 0.85;   // ngc/world-polish: a pub's bar is unit 0
export const SHOP_KINDS = ['grocer', 'newsagent', 'hardware', 'cafe'];
export const shopKind = (it, i) => it.pub && i === 0 ? 'pub' : SHOP_KINDS[Math.floor(hash01(it.seed, 20 + i) * 4)];
export const ENTERABLE = new Set(['house', 'cottage', 'terrace', 'church', 'petrol', 'barn', 'boatshed', 'garage', 'hall', 'barracks']);

// ------------------------------------------------------------------ palettes (1980: magnolia, avocado, mustard, brown)
const WALLPAPER = [0xe8dcc0, 0xd8c890, 0xb8c08a, 0xe0c8a0, 0xc8b8a0, 0xe6d8b8, 0xd0b48a, 0xc0c8b0, 0xe8d0b0];
const CARPET = [0x7a4a2a, 0x8a5a2a, 0x5a6a3a, 0x8a3a2a, 0x6a5a4a, 0x4a5a6a, 0xa0703a];
const LINO = [0xc8b890, 0xa89870, 0xd0c8b0];
const CEIL = 0xe8e4d8, SKIRT = 0x6a4a30;

// window rows exactly as models.js windowsZ lays them out (the shell's glass): [{ c, y0, y1, hw }] along one wall
function winRow(x0, x1, floors, fh, opt = {}) {
  const n = Math.max(1, Math.floor((x1 - x0) / (opt.spacing || 2.7))), ww = opt.w || 1.0, wh = opt.h || 1.25, out = [];
  for (let f = 0; f < floors; f++) for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * (x1 - x0) / n; if (opt.skip !== undefined && opt.skip !== null && f === 0 && Math.abs(cx - opt.skip) < 1.3) continue;
    const y0 = f * fh + (opt.sill || 0.95); out.push({ c: cx, y0, y1: y0 + wh, hw: ww / 2, f });
  }
  return out;
}

// ------------------------------------------------------------------ the plan builder
class Plan {
  constructor(it, t) { this.it = it; this.t = t; this.walls = []; this.floors = []; this.ceils = []; this.doors = []; this.furn = []; this.solid = []; this.H = 3; this.lights = []; }
  // a wall along u (ax 'u': u from a0 to a1, v from c0 to c0 + t) or along v (ax 'v'), y0..y1, with openings
  // [{ a, b, lo, hi }] (a door: lo = its floor, hi = its head; a window: lo = sill, hi = head); skip: faces not drawn
  wall(ax, c0, t, a0, a1, y0, y1, c, open = [], skip = 0) {
    const ops = open.filter(o => o.b > a0 && o.a < a1).sort((p, q) => p.a - q.a);
    // the room side of an outer wall (the face toward the shell is skipped): where its curtains hang
    const inside = skip & 8 || skip & 32 ? -1 : skip & 4 || skip & 16 ? 1 : 0;
    const put = (a, b, lo, hi, win) => { if (b - a < 0.005 || hi - lo < 0.005) return; this.walls.push(ax === 'u' ? { u0: a, u1: b, v0: c0, v1: c0 + t, y0: lo, y1: hi, c, skip, win, inside } : { u0: c0, u1: c0 + t, v0: a, v1: b, y0: lo, y1: hi, c, skip, win, inside }); };
    let cur = a0;
    for (const o of ops) {
      const a = Math.max(a0, o.a), b = Math.min(a1, o.b);
      put(cur, a, y0, y1); put(a, b, y0, o.lo, o.lo > y0 + 0.05 && inside ? o : null); put(a, b, o.hi, y1); cur = Math.max(cur, b);
    }
    put(cur, a1, y0, y1);
  }
  floor(u0, u1, v0, v1, y, c, kind = 'floor', extra) { this.floors.push({ u0, u1, v0, v1, y, c, kind, ...extra }); }
  ceil(u0, u1, v0, v1, y, c = CEIL) { this.ceils.push({ u0, u1, v0, v1, y, c }); }
  door(d) { d.id = this.doors.length; this.doors.push(d); return d; }
  // a piece of furniture; sz [w, d, h] (local x, z, y) also makes it a collider
  put(k, u, v, y, yaw = 0, o = {}, sz = null) {
    const F = { k, u, v, y, yaw, o }; this.furn.push(F);
    if (sz) { const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)), hu = (sz[0] * c + sz[1] * s) / 2, hv = (sz[0] * s + sz[1] * c) / 2; this.solid.push(F.sb = { u0: u - hu, u1: u + hu, v0: v - hv, v1: v + hv, y0: y - 0.1, y1: y + sz[2] }); }
  }
  // the way in kept clear (ngc/integ): no furniture (put since index `from`) in the first `depth` m inside front door d
  // (in a +v wall), the door's width + 0.4 m each side - a piece in it moves back into the room along v, else sideways,
  // else goes; room [u0, u1, v0, v1]: where it may go. (A sofa end 1.4 m inside the door stopped you in the doorway.)
  clearEntry(d, from, room, depth = 1.9) {
    const zu0 = d.u - d.w / 2 - 0.4, zu1 = d.u + d.w / 2 + 0.4, zv0 = d.v - depth, [ru0, ru1, rv0, rv1] = room;
    for (let i = from; i < this.furn.length; i++) {
      const F = this.furn[i], b = F.sb; if (!b || b.u1 <= zu0 || b.u0 >= zu1 || b.v1 <= zv0 || b.v0 >= d.v) continue;
      let du = 0, dv = 0;
      if (b.v0 - (b.v1 - zv0) >= rv0) dv = zv0 - b.v1;
      else if (b.u1 - zu0 <= zu1 - b.u0 && b.u0 - (b.u1 - zu0) >= ru0) du = zu0 - b.u1;
      else if (b.u1 + (zu1 - b.u0) <= ru1) du = zu1 - b.u0;
      else if (b.u0 - (b.u1 - zu0) >= ru0) du = zu0 - b.u1;
      else { this.furn.splice(i, 1); this.solid.splice(this.solid.indexOf(b), 1); i--; continue; }
      F.u += du; F.v += dv; b.u0 += du; b.u1 += du; b.v0 += dv; b.v1 += dv;
    }
  }
  // a straight stair (a ramp you walk, drawn as steps): from (low end) at y0 up to y1, along ax, rising toward `up`
  // (+1: toward + the axis). Under it, stepped colliders so nobody walks through the flight from the side underneath.
  stair(ax, a0, a1, b0, b1, y0, y1, up, c) {
    // a0..a1: the run along ax; b0..b1 across it
    const f = ax === 'v' ? { u0: b0, u1: b1, v0: a0, v1: a1 } : { u0: a0, u1: a1, v0: b0, v1: b1 };
    this.floors.push({ ...f, y: y1, ry: up > 0 ? [y0, y1] : [y1, y0], ax, up, c, kind: 'stair' });   // ry: y at the axis' low end, its high end
    const L = a1 - a0, n = Math.max(1, Math.ceil(L / 0.5));
    for (let k = 0; k < n; k++) {
      const s0 = a0 + k * L / n, s1 = a0 + (k + 1) * L / n, lowY = up > 0 ? y0 + (y1 - y0) * (s0 - a0) / L : y0 + (y1 - y0) * (a1 - s1) / L;
      const top = lowY - 0.35; if (top <= y0 + 0.05) continue;
      this.solid.push(ax === 'v' ? { u0: b0, u1: b1, v0: s0, v1: s1, y0: y0 - 0.1, y1: top } : { u0: s0, u1: s1, v0: b0, v1: b1, y0: y0 - 0.1, y1: top });
    }
  }
  rail(u0, u1, v0, v1, y) { this.walls.push({ u0, u1, v0, v1, y0: y, y1: y + 0.95, c: 0x5a3a24, skip: 0, rail: true }); }
}

// the slab of an upper floor with a stairwell hole: rects round the hole
function slabWithHole(P, u0, u1, v0, v1, y, hole, c, under) {
  const [hu0, hu1, hv0, hv1] = hole;
  const R = [[u0, hu0, v0, v1], [hu1, u1, v0, v1], [hu0, hu1, v0, hv0], [hu0, hu1, hv1, v1]];
  for (const [a, b, p, q] of R) if (b - a > 0.02 && q - p > 0.02) { P.floor(a, b, p, q, y, c, 'slab'); P.ceil(a, b, p, q, y - 0.2, under); }
}

// ------------------------------------------------------------------ rooms
// furnishing helpers (all coordinates in the item frame)
// the yaw that turns a piece's front (local +z) at (u, v) toward (tu, tv)
const face = (u, v, tu, tv) => Math.atan2(tu - u, tv - v);
function livingRoom(P, r, u0, u1, v0, v1, y, opt = {}) {
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, w = u1 - u0, d = v1 - v0;
  const fireOn = opt.fireSide ?? -1;   // which side wall the fireplace is on (-1: u0)
  const fu = fireOn < 0 ? u0 + 0.25 : u1 - 0.25, fy = fireOn < 0 ? Math.PI / 2 : -Math.PI / 2;
  P.put('fireplace', fu, cv, y, fy, { tile: r.pick([0x8a6a4a, 0x6a7a5a, 0xa08a6a, 0x5a4a3a]) }, [1.5, 0.45, 1.2]);
  const sofaU = fireOn < 0 ? Math.min(u1 - 0.6, u0 + 2.9) : Math.max(u0 + 0.6, u1 - 2.9);
  const fab = r.pick([0x7a5a3a, 0x5a6a3a, 0xa0703a, 0x8a3a2a, 0x6a5a6a, 0xb08a4a]);
  if (w > 3.2) P.put('sofa', sofaU, cv, y, -fy, { c: fab, w: Math.min(2.0, d - 1.4) }, [Math.min(2.0, d - 1.4), 0.85, 0.85]);
  const mu = (fu + sofaU) / 2, a1v = Math.min(v1 - 0.5, cv + d * 0.33), a2v = Math.max(v0 + 0.5, cv - d * 0.33), sb = opt.sideboard !== false && w > 3.4 && d > 3.6;
  P.put('armchair', mu, a1v, y, face(mu, a1v, mu, cv), { c: fab }, [0.8, 0.8, 0.85]);
  if (d > 3 && !sb) P.put('armchair', mu, a2v, y, face(mu, a2v, mu, cv), { c: r.pick([0x6a4a2a, 0x4a5a3a, 0x7a6a4a]) }, [0.8, 0.8, 0.85]);
  P.put('rug', (fu + sofaU) / 2, cv, y, 0, { w: Math.min(2.4, Math.abs(sofaU - fu) - 0.6), d: Math.min(2.6, d - 1), c: r.pick([0x8a3a2a, 0x3a5a6a, 0xa07a3a, 0x5a3a5a]) });
  P.put('coffeeTable', (fu + sofaU) / 2 + (fireOn < 0 ? 0.2 : -0.2), cv, y, Math.PI / 2, {}, [1.0, 0.5, 0.45]);
  // the telly on its stand in a corner, the standard lamp, a sideboard
  if (opt.tv !== false) { const tu = fireOn < 0 ? u1 - 0.45 : u0 + 0.45, tv = opt.tvBack ? v0 + 0.45 : v1 - 0.5; P.put('tv', tu, tv, y, face(tu, tv, mu, cv), {}, [0.75, 0.55, 1.1]); }
  if (sb) P.put('sideboard', opt.sbU ?? cu, v0 + 0.3, y, 0, { c: r.pick([0x5a3a20, 0x6a4a2a, 0x4a3018]) }, [1.6, 0.45, 0.85]);
  P.put('lamp', fu + (fireOn < 0 ? 0.35 : -0.35), Math.min(v1 - 0.4, cv + 1.1), y, 0, { shade: r.pick([0xe0c080, 0xd09060, 0xe8d8b0]) });
  P.lights.push([cu, y + 2.0, cv]);
}
function kitchen(P, r, u0, u1, v0, v1, y, backV = -1) {
  // units along the back wall (v0 side if backV < 0), cooker and sink in the run, the fridge at the end, a little table
  const w = u1 - u0, vv = backV < 0 ? v0 + 0.3 : v1 - 0.3, yaw = backV < 0 ? 0 : Math.PI;
  const unitC = r.pick([0xe8e0c0, 0x8a6a3a, 0xc8a050, 0x6a7a4a, 0xd8d0c0]);
  const runW = Math.max(1.2, w - 0.9);
  P.put('kitchenRun', u0 + runW / 2 + 0.05, vv, y, yaw, { w: runW, c: unitC, top: r.pick([0xd8c8a0, 0x8a7a6a, 0xc0b8a8]), cooker: 0.25, sink: 0.7 }, [runW, 0.6, 0.92]);
  P.put('fridge', u1 - 0.38, vv, y, yaw, {}, [0.6, 0.6, 1.45]);
  if (v1 - v0 > 2.4 && w > 2.2) { P.put('kitchenTable', (u0 + u1) / 2 - 0.2, (v0 + v1) / 2 + (backV < 0 ? 0.35 : -0.35), y, 0, { c: r.pick([0xd0c0a0, 0x8a6a4a, 0xe0d8c8]) }, [1.1, 0.75, 0.75]); }
  P.lights.push([(u0 + u1) / 2, y + 2.0, (v0 + v1) / 2]);
}
function bedroom(P, r, u0, u1, v0, v1, y, opt = {}) {
  const cv = (v0 + v1) / 2, d = v1 - v0, side = opt.side ?? -1, bu = side < 0 ? u0 + 1.1 : u1 - 1.1, yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2;   // head to the side wall
  const dbl = opt.double !== false && d > 2.6;
  const cover = r.pick([0x8a5a7a, 0x5a7a8a, 0xc0905a, 0x7a8a5a, 0xa04a3a, 0xd8c8a0]);
  P.put('bed', bu, cv, y, yaw, { w: dbl ? 1.4 : 0.95, c: cover }, [dbl ? 1.4 : 0.95, 2.05, 0.6]);
  const hu = side < 0 ? u0 + 0.25 : u1 - 0.25;
  for (const s of dbl ? [-1, 1] : [1]) P.put('bedside', hu, cv + s * (dbl ? 1.0 : 0.75), y, yaw, {}, [0.45, 0.4, 0.55]);
  if (opt.wardrobe !== false) { const wu = side < 0 ? Math.min(u1 - 0.45, u0 + 3.4) : Math.max(u0 + 0.45, u1 - 3.4); P.put('wardrobe', wu, opt.wardV ?? (v0 + 0.33), y, opt.wardV !== undefined && opt.wardV > cv ? Math.PI : 0, { c: r.pick([0x6a4a2a, 0x8a6a40, 0xd8d0c0]) }, [1.1, 0.6, 1.95]); }
  if (opt.dresser) P.put('dresser', (u0 + u1) / 2 + side * -0.4, v1 - 0.28, y, Math.PI, {}, [1.0, 0.45, 0.8]);
  P.lights.push([(u0 + u1) / 2, y + 2.0, cv]);
}
function bathroom(P, r, u0, u1, v0, v1, y, backV = -1, bath = true) {
  const vv = backV < 0 ? v0 + 0.4 : v1 - 0.4, yaw = backV < 0 ? 0 : Math.PI, suite = r.pick([0xe8e8e0, 0xa8c0a0, 0xe0c8b0, 0x9ab0b8]), b = bath ? 1.7 : 0;
  if (bath) P.put('bath', u0 + 0.85, vv, y, yaw, { c: suite }, [1.7, 0.75, 0.55]);
  P.put('toilet', Math.min(u1 - 0.4, u0 + b + 0.35), vv - (backV < 0 ? 0.05 : -0.05), y, yaw, { c: suite }, [0.4, 0.65, 0.8]);
  if (u1 - u0 > b + 1.2) P.put('basin', Math.min(u1 - 0.35, u0 + b + 1.05), vv - (backV < 0 ? 0.1 : -0.1), y, yaw, { c: suite }, [0.55, 0.45, 0.85]);
}

// the shell's windows on the four walls (models.js windowsAround): openings for the inner walls, by wall and storey
function aroundWins(w, d, floors, fh, opt) {
  const front = winRow(-w / 2 + 0.6, w / 2 - 0.6, floors, fh, opt);
  const back = winRow(-w / 2 + 0.6, w / 2 - 0.6, floors, fh, { ...opt, skip: null }).map(o => ({ ...o, c: -o.c }));
  const side = opt.sides === false || d <= 5 ? [] : winRow(-d / 2 + 1, d / 2 - 1, floors, fh, { ...opt, skip: null, spacing: 3.4 });
  return { front, back, right: side.map(o => ({ ...o, c: -o.c })), left: side };
}
const asOpen = (ws, f, fh) => ws.filter(o => o.f === f).map(o => ({ a: o.c - o.hw, b: o.c + o.hw, lo: o.y0, hi: o.y1 }));

// the four outer walls of a w x d box, storey by storey (each storey its own windows), doors on the front
function shellWalls(P, w, d, floors, fh, H, wins, doorsFront, c, cUp) {
  for (let f = 0; f < floors; f++) {
    const y0 = f === 0 ? -0.3 : f * fh, y1 = f === floors - 1 ? H : (f + 1) * fh, wc = f === 0 ? c : (cUp ? cUp[f - 1] || c : c);
    const fr = asOpen(wins.front, f, fh).concat(f === 0 ? doorsFront : []);
    P.wall('u', d / 2 - T, T, -w / 2, w / 2, y0, y1, wc, fr, 8);
    P.wall('u', -d / 2, T, -w / 2, w / 2, y0, y1, wc, asOpen(wins.back, f, fh), 4);
    P.wall('v', w / 2 - T, T, -d / 2 + T, d / 2 - T, y0, y1, wc, asOpen(wins.right, f, fh), 32);
    P.wall('v', -w / 2, T, -d / 2 + T, d / 2 - T, y0, y1, wc, asOpen(wins.left, f, fh), 16);
  }
}
// the front step and, where the ground falls away, stone steps down to it (ramp floors): walkable into the door
function frontSteps(P, u, w, d, hf, it) {
  P.floor(u - w / 2 - 0.25, u + w / 2 + 0.25, d / 2 - T - 0.02, d / 2 + 0.85, 0, 0x9a958a, 'step');
  if (!hf) return;
  const c = Math.cos(it.yaw || 0), s = Math.sin(it.yaw || 0), at = v => hf(it.x + c * u + s * v, it.z - s * u + c * v) - it.y;
  // the flight's foot must meet the ground: where it falls away from the door the ground under the foot is lower than
  // 1.4 m out, so lengthen the flight to it (a few rounds; ngc/integ - the steps ended in the air on the new slopes)
  let g = Math.min(at(d / 2 + 0.9), at(d / 2 + 1.4));
  if (g < -0.35) for (let k = 0; k < 6; k++) { const gf = at(d / 2 + 0.85 - g / 0.62 - 0.15); if (gf > g - 0.03) break; g = Math.max(gf, -4.2); }
  if (g < -0.35 && g > -4.2) { const L = -g / 0.62; P.stair('v', d / 2 + 0.85, d / 2 + 0.85 + L, u - w / 2 - 0.1, u + w / 2 + 0.1, g, 0, -1, 0x9a958a); P.floors[P.floors.length - 1].kind = 'steps'; }
}

function housePlan(it, hf) {
  const P = new Plan(it, it.t), r = rng((it.seed | 0) ^ 0x51ed), cot = it.t === 'cottage';
  const w = it.w, d = it.d, fl = cot ? 1 : it.floors, fh = cot ? 2.6 : 2.8, H = cot ? 2.6 : fl * fh, y = LIFT;
  const dx = doorU(it), dw = cot ? 0.9 : 1.0, dh = cot ? 1.95 : 2.1;
  P.H = H;
  const wins = cot ? aroundWins(w, d, 1, 2.6, { skip: dx, w: 0.8, h: 0.95, sill: 0.9, spacing: 2.3, sides: false }) : aroundWins(w, d, fl, fh, { skip: dx });
  const paper = [r.pick(WALLPAPER), r.pick(WALLPAPER), r.pick(WALLPAPER)];
  shellWalls(P, w, d, fl, fh, H, wins, [{ a: dx - dw / 2, b: dx + dw / 2, lo: -0.3, hi: dh }], paper[0], [paper[1]]);
  P.door({ u: dx, v: d / 2 - T / 2, y: 0, w: dw, h: dh, ax: 'u', hinge: hash01(it.seed, 3) < 0.5 ? -1 : 1, swing: -1, kind: 'house', c: it.door ?? 0x2f5a3a, out: 1 });
  frontSteps(P, dx, dw, d, hf, it);
  const iu0 = -w / 2 + T, iu1 = w / 2 - T, iv0 = -d / 2 + T, iv1 = d / 2 - T;
  const carpet = r.pick(CARPET), lino = r.pick(LINO);
  if (fl >= 2) {
    // stairs up the side wall away from the door, from the front to the back; the kitchen behind the living room
    const S = dx > 0 ? -1 : 1, su0 = S > 0 ? iu1 - 0.9 : iu0, su1 = S > 0 ? iu1 : iu0 + 0.9;
    const rise = fh - y, run = rise / STAIR_TAN, sv1 = iv1 - 0.2, sv0 = sv1 - run;
    const ru0 = S > 0 ? iu0 : su1, ru1 = S > 0 ? su0 : iu1;     // the rooms' width (beside the stair strip)
    const vk = iv0 + Math.min(2.7, (iv1 - iv0) * 0.42);           // kitchen / living partition
    P.floor(ru0, ru1, vk, iv1, y, carpet); P.floor(su0, su1, sv1, iv1, y, carpet); P.floor(su0, su1, iv0, sv0, y, carpet);
    P.floor(ru0, ru1, iv0, vk, y, lino, 'lino');
    P.stair('v', sv0, sv1, su0, su1, y, fh, -1, 0x6a4a30);
    P.wall('u', vk - 0.06, 0.12, ru0, ru1, -0.3, fh - 0.2, paper[2], [{ a: (ru0 + ru1) / 2 + S * 0.6 - 0.45, b: (ru0 + ru1) / 2 + S * 0.6 + 0.45, lo: -0.3, hi: 2.05 }]);
    P.door({ u: (ru0 + ru1) / 2 + S * 0.6, v: vk, y, w: 0.9, h: 1.78, ax: 'u', hinge: S, swing: 1, kind: 'inner', c: 0xd8d0b8 });
    // the stair's side: a banister along the open side, a wall under it (the cupboard under the stairs)
    P.wall('v', S > 0 ? su0 - 0.08 : su1, 0.08, sv0 + 0.4, sv1 - 1.0, -0.3, 0.9 + y, 0x7a5a3a);   // (the lowest metre open: you step on from the side)
    slabWithHole(P, iu0, iu1, iv0, iv1, fh, [su0, su1, sv0, sv1], r.pick(CARPET), CEIL);
    P.rail(S > 0 ? su0 - 0.06 : su1, S > 0 ? su0 : su1 + 0.06, sv0, sv1, fh); P.rail(su0, su1, sv1, sv1 + 0.06, fh);
    const f0 = P.furn.length; livingRoom(P, r, ru0, ru1, vk + 0.06, iv1, y, { fireSide: -S, sbU: (ru0 + ru1) / 2 - S * 1.1 }); P.clearEntry(P.doors[0], f0, [ru0, ru1, vk + 0.06, iv1]);
    kitchen(P, r, ru0, ru1, iv0, vk - 0.06, y, -1);
    // upstairs: front bedroom, back room (a bathroom in a narrow house, else a second bedroom); the landing by the stairs
    const vp = iv0 + Math.max(2.3, (iv1 - iv0) * 0.42);
    P.wall('u', vp - 0.06, 0.12, ru0, ru1, fh, H, paper[1], [{ a: S > 0 ? ru1 - 1.1 : ru0 + 0.2, b: S > 0 ? ru1 - 0.2 : ru0 + 1.1, lo: fh, hi: fh + 1.95 }]);
    P.door({ u: S > 0 ? ru1 - 0.65 : ru0 + 0.65, v: vp, y: fh, w: 0.9, h: 1.95, ax: 'u', hinge: -S, swing: 1, kind: 'inner', c: 0xd8d0b8 });
    bedroom(P, r, ru0, ru1, vp + 0.06, iv1, fh, { side: -S, wardV: vp + 0.4, dresser: true });
    if (ru1 - ru0 < 5.6) bathroom(P, r, ru0, ru1, iv0, vp - 0.06, fh, -1); else { bedroom(P, r, ru0, (ru0 + ru1) / 2, iv0, vp - 0.06, fh, { side: -1, double: false, wardrobe: false }); bathroom(P, r, (ru0 + ru1) / 2 + 0.1, ru1, iv0, vp - 0.06, fh, -1); P.wall('v', (ru0 + ru1) / 2 - 0.02, 0.12, iv0, vp - 0.06, fh, H, paper[2], [{ a: vp - 1.2, b: vp - 0.3, lo: fh, hi: fh + 1.95 }]); }
    P.ceil(iu0, iu1, iv0, iv1, H - 0.02);
    P.lights.push([(su0 + su1) / 2, fh + 2.2, sv0 - 0.4]);
  } else {
    // one storey: the living room at the front; at the back a kitchen and a bedroom, a wall between them
    const vk = iv0 + Math.min(2.9, (iv1 - iv0) * 0.5), ceil = H - 0.04;
    P.floor(iu0, iu1, vk, iv1, y, carpet); P.floor(iu0, 0, iv0, vk, y, lino, 'lino'); P.floor(0, iu1, iv0, vk, y, r.pick(CARPET));
    const gK = -1.0, gB = 1.0;   // the two doorways in the partition: the kitchen (u < 0) and the bedroom (u > 0)
    P.wall('u', vk - 0.06, 0.12, iu0, iu1, -0.3, ceil, paper[2], [{ a: gK - 0.45, b: gK + 0.45, lo: -0.3, hi: Math.min(1.95, ceil - 0.2) }, { a: gB - 0.45, b: gB + 0.45, lo: -0.3, hi: Math.min(1.95, ceil - 0.2) }]);
    P.wall('v', -0.06, 0.12, iv0, vk - 0.06, -0.3, ceil, paper[1]);
    P.door({ u: gB, v: vk, y, w: 0.9, h: Math.min(1.95, ceil - 0.2) - y, ax: 'u', hinge: 1, swing: -1, kind: 'inner', c: 0xd8d0b8 });
    const f0 = P.furn.length; livingRoom(P, r, iu0, iu1, vk + 0.06, iv1, y, { fireSide: dx > 0 ? -1 : 1, tvBack: true, sideboard: false }); P.clearEntry(P.doors[0], f0, [iu0, iu1, vk + 0.06, iv1]);
    kitchen(P, r, iu0, -0.06, iv0, vk - 0.06, y, -1);
    bedroom(P, r, 0.06, iu1, iv0, vk - 0.06, y, { side: 1, double: iu1 > 2, wardrobe: false });
    P.ceil(iu0, iu1, iv0, iv1, ceil);
  }
  return P;
}

// terrace: units side by side, party walls between them; shops (grocer, newsagent, hardware, cafe) or homes, the
// first floor up the stairs (a flat), the floors above it closed
function terracePlan(it, hf) {
  const P = new Plan(it, 'terrace'), r = rng((it.seed | 0) ^ 0x7e11), n = it.units, uw = it.w / n, d = it.d, fl = it.floors, fh = 3.0, H = fl * fh, y = LIFT;
  P.H = H;
  for (let i = 0; i < n; i++) {
    const x = -it.w / 2 + uw * (i + 0.5), shop = shopUnit(it, i), paper = [r.pick(WALLPAPER), r.pick(WALLPAPER)];
    const iu0 = x - uw / 2 + (i === 0 ? T : 0.08), iu1 = x + uw / 2 - (i === n - 1 ? T : 0.08), iv0 = -d / 2 + T, iv1 = d / 2 - T;
    const dU = shop ? x + uw / 2 - 0.85 : x + uw / 2 - 1.1, dW = shop ? 0.9 : 1.0, dH = shop ? 2.2 : 2.1;
    // front: the shop window (glass from 0.5 to 2.5) or the house windows; back: windowsZ mirrored
    const front = shop ? [{ a: x - uw / 2 + 0.3, b: x + uw / 2 - 1.5, lo: 0.5, hi: 2.5 }] : winRow(x - uw / 2 + 0.4, x + uw / 2 - 1.8, 1, fh, {}).map(o => ({ a: o.c - o.hw, b: o.c + o.hw, lo: o.y0, hi: o.y1 }));
    const up = winRow(x - uw / 2 + 0.4, x + uw / 2 - 0.4, fl - 1, fh, { sill: fh + 0.9, spacing: 2.4 }).filter(o => o.f === 0).map(o => ({ a: o.c - o.hw, b: o.c + o.hw, lo: o.y0, hi: o.y1 }));
    const back = winRow(-uw / 2 + 0.4, uw / 2 - 0.4, fl, fh, { spacing: 2.6 }).map(o => ({ ...o, c: x - o.c }));
    for (let f = 0; f < Math.min(fl, 2); f++) {
      const y0 = f === 0 ? -0.3 : fh, y1 = f === 0 ? fh : 2 * fh, wc = paper[f];
      P.wall('u', d / 2 - T, T, x - uw / 2, x + uw / 2, y0, y1, wc, f === 0 ? front.concat([{ a: dU - dW / 2, b: dU + dW / 2, lo: -0.3, hi: dH }]) : up, 8);
      P.wall('u', -d / 2, T, x - uw / 2, x + uw / 2, y0, y1, wc, asOpen(back, f, fh), 4);
      if (i === 0) P.wall('v', -it.w / 2, T, iv0, iv1, y0, y1, wc, [], 16);
      if (i === n - 1) P.wall('v', it.w / 2 - T, T, iv0, iv1, y0, y1, wc, [], 32);
      if (i > 0) P.wall('v', x - uw / 2 - 0.08, 0.16, iv0, iv1, y0, y1, wc);   // party wall (one per pair)
    }
    if (fl > 2) P.walls.push({ u0: x - uw / 2, u1: x + uw / 2, v0: -d / 2, v1: d / 2, y0: 2 * fh, y1: H, c: 0xcccccc, skip: 63, hide: true });   // the closed floors above (solid only)
    const fd = P.door({ u: dU, v: d / 2 - T / 2, y: 0, w: dW, h: dH, ax: 'u', hinge: 1, swing: -1, kind: shop ? 'shop' : 'house', c: shop ? 0x3a3a3a : 0x2f5a3a, out: 1 });
    frontSteps(P, dU, dW, d, hf, it);
    // stairs along the back wall, rising toward -u, to the flat upstairs
    const rise = fh - y, run = rise / STAIR_TAN, su1 = iu1 - 0.2, su0 = Math.max(iu0 + 0.3, su1 - run), sv0 = iv0, sv1 = iv0 + 0.9;
    P.stair('u', su0, su1, sv0, sv1, y, fh, -1, 0x6a4a30);
    const vp = iv0 + 2.3;   // back room / front room partition
    P.wall('u', vp, 0.12, iu0, iu1, -0.3, fh - 0.2, paper[0], [{ a: iu1 - 1.3, b: iu1 - 0.4, lo: -0.3, hi: 2.05 }]);
    P.door({ u: iu1 - 0.85, v: vp + 0.06, y, w: 0.9, h: 1.78, ax: 'u', hinge: 1, swing: 1, kind: 'inner', c: 0xd8d0b8 });
    P.floor(iu0, iu1, vp, iv1, y, shop ? r.pick(LINO) : r.pick(CARPET), shop ? 'lino' : 'floor');
    P.floor(iu0, iu1, sv1, vp, y, r.pick(LINO), 'lino'); P.floor(iu0, su0, sv0, sv1, y, r.pick(LINO), 'lino');
    slabWithHole(P, iu0, iu1, iv0, iv1, fh, [su0, su1, sv0, sv1], r.pick(CARPET), CEIL);
    P.rail(su0, su1, sv1, sv1 + 0.06, fh);
    P.ceil(iu0, iu1, iv0, iv1, 2 * fh - 0.02);
    const f0 = P.furn.length;
    if (shop) shopFit(P, r, shopKind(it, i), iu0, iu1, vp + 0.06, iv1, y, dU);
    else { livingRoom(P, r, iu0, iu1, vp + 0.06, iv1, y, { fireSide: -1, tv: true }); }
    P.clearEntry(fd, f0, [iu0, iu1, vp + 0.06, iv1], shop ? 1.3 : 1.9);
    kitchen(P, r, iu0, iu1 - 1.5, sv1 + 0.05, vp - 0.06, y, 1);   // a galley along the partition, clear of its doorway
    // upstairs: a bedroom at the front, the WC at the back (by the landing)
    P.wall('u', vp, 0.12, iu0, iu1, fh, 2 * fh, paper[1], [{ a: iu1 - 1.1, b: iu1 - 0.2, lo: fh, hi: fh + 1.95 }]);
    bedroom(P, r, iu0, iu1, vp + 0.06, iv1, fh, { side: -1, wardV: vp + 0.4 });
    bathroom(P, r, iu0, iu1 - 1.3, sv1 + 0.05, vp - 0.06, fh, 1, false);
  }
  return P;
}
// a 1980 village shop: the counter with the till, shelves of tins and packets, the goods by kind
function shopFit(P, r, kind, u0, u1, v0, v1, y, doorU) {
  const cv = v0 + 1.0, cLen = Math.max(1.2, (u1 - u0) - 1.6);
  P.put('counter', u0 + cLen / 2, cv, y, 0, { w: cLen, c: r.pick([0x6a4a2a, 0x8a6a40, 0x4a5a6a]), till: kind !== 'cafe' && kind !== 'pub' }, [cLen, 0.6, 0.95]);
  const sw = Math.max(1.0, Math.min(2.4, v1 - v0 - 2.6)); P.put('shelves', u0 + 0.22, cv + 0.8 + sw / 2, y, Math.PI / 2, { w: sw, goods: kind }, [sw, 0.4, 2.0]);
  P.put('shelves', u0 + cLen / 2, v0 + 0.22, y, 0, { w: cLen, goods: kind, low: true }, [cLen, 0.4, 1.8]);
  if (kind === 'grocer') { P.put('vegCrates', (u0 + u1) / 2 - 0.3, v1 - 0.5, y, Math.PI, {}, [1.4, 0.6, 0.8]); P.put('freezer', u0 + 1.3, cv + 1.4, y, 0, {}, [1.2, 0.7, 0.85]); }
  if (kind === 'newsagent') { P.put('newsRack', u1 - 0.3, (v0 + v1) / 2 + 0.3, y, -Math.PI / 2, {}, [1.4, 0.5, 1.4]); P.put('sweetJars', u0 + 0.6, cv, y + 0.95, 0, {}); }
  if (kind === 'hardware') { P.put('buckets', u0 + 0.9, v1 - 0.6, y, 0, {}, [0.9, 0.6, 0.7]); P.put('shelves', u1 - 0.22, (v0 + v1) / 2 + 0.1, y, -Math.PI / 2, { w: 1.6, goods: kind }, [1.6, 0.4, 2.0]); }
  if (kind === 'pub') for (let k = 0; k < 3; k++) { const tu = u0 + 1.0 + k * 1.5, tv = v1 - 1.0; if (tu > u1 - 0.8) break; P.put('cafeTable', tu, tv, y, 0, { c: 0x5a3a22 }, [0.7, 0.7, 0.75]); }   // ngc/world-polish: the bar's tables
  if (kind === 'cafe') for (let k = 0; k < 2; k++) { const tu = u0 + 1.1 + k * 1.6, tv = v1 - 1.1; if (tu > u1 - 0.8) break; P.put('cafeTable', tu, tv, y, 0, { c: r.pick([0xc04030, 0x30a050, 0xe0e0d8]) }, [0.7, 0.7, 0.75]); }
  P.lights.push([(u0 + u1) / 2, y + 2.3, (v0 + v1) / 2]);
}

// the parish church: porch (the door), nave with two blocks of pews and the aisle, the chancel through the arch
function churchPlan(it) {
  const P = new Plan(it, 'church'), r = rng((it.seed | 0) ^ 0xc4c4), L = 20, w = 9, H = 7, y = LIFT, stone = 0xb8b0a0;
  P.H = H;
  // nave walls: the south wall (+v) has the porch opening at u -2.7..-1.3, the east (-u) end the chancel arch
  const lan = []; for (let i = 0; i < 5; i++) lan.push({ a: -L / 2 + 2 + i * 3.6, b: -L / 2 + 2.9 + i * 3.6, lo: 2, hi: 5.4 });
  P.wall('u', w / 2 - 0.35, 0.35, -L / 2, L / 2, -0.3, H, stone, lan.concat([{ a: -2.7, b: -1.3, lo: -0.3, hi: 2.6 }]), 8);
  P.wall('u', -w / 2, 0.35, -L / 2, L / 2, -0.3, H, stone, lan.map(o => ({ ...o })), 4);
  P.wall('v', L / 2 - 0.35, 0.35, -w / 2 + 0.35, w / 2 - 0.35, -0.3, H, stone, [], 32);   // the tower wall (closed)
  P.wall('v', -L / 2, 0.35, -w / 2 + 0.35, w / 2 - 0.35, -0.3, H, stone, [{ a: -2.0, b: 2.0, lo: -0.3, hi: 4.4 }], 16);
  // the porch (3.4 x 3.2 at u -2, v 4.5..7.7): its walls, the outer door on its +v face
  P.wall('v', -3.7, 0.25, w / 2, w / 2 + 3.2 - 0.25, -0.3, 3.2, stone, [], 16); P.wall('v', -0.55, 0.25, w / 2, w / 2 + 3.2 - 0.25, -0.3, 3.2, stone, [], 32);
  P.wall('u', w / 2 + 3.2 - 0.25, 0.25, -3.7, -0.3, -0.3, 3.2, stone, [{ a: -2.7, b: -1.3, lo: -0.3, hi: 2.6 }], 8);
  P.door({ u: -2, v: w / 2 + 3.2 - 0.125, y: 0, w: 1.4, h: 2.6, ax: 'u', hinge: -1, swing: -1, kind: 'church', c: 0x4a2a1a, out: 1 });
  P.floor(-3.45, -0.55, w / 2 - 0.35, w / 2 + 3.2, y, 0x8a8478);
  P.floor(-2.6, -1.4, w / 2 + 3.2 - 0.25, w / 2 + 3.2 + 0.85, 0, 0x9a958a, 'step');
  P.ceil(-3.45, -0.55, w / 2, w / 2 + 2.95, 2.9, 0x6a5a4a);
  // chancel: 6 x 6.5 at u -13 (u -16..-10), its floor a step up, the altar at the east wall
  P.wall('u', 3.25 - 0.3, 0.3, -16, -L / 2, -0.3, 5.5, stone, [], 8); P.wall('u', -3.25, 0.3, -16, -L / 2, -0.3, 5.5, stone, [], 4); P.wall('v', -16, 0.3, -3.25 + 0.3, 3.25 - 0.3, -0.3, 5.5, stone, [], 16);
  P.floor(-L / 2 + 0.35, L / 2 - 0.35, -w / 2 + 0.35, w / 2 - 0.35, y, 0x8a8478, 'flags');
  P.floor(-15.7, -L / 2 + 0.35, -2.95, 2.95, y + 0.17, 0x7a3a2a, 'carpet');
  P.ceil(-L / 2 + 0.35, L / 2 - 0.35, -w / 2 + 0.35, w / 2 - 0.35, H - 0.05, 0x5a4a3a); P.ceil(-15.7, -L / 2, -2.95, 2.95, 5.4, 0x5a4a3a);
  for (let k = 0; k < 7; k++) for (const s of [-1, 1]) { const u = -L / 2 + 3.3 + k * 1.05; P.put('pew', u + 0.2, s * 2.3, y, -Math.PI / 2, { w: 3.2 }, [3.2, 0.55, 0.95]); }
  P.put('altar', -15.2, 0, y + 0.17, Math.PI / 2, {}, [2.0, 0.9, 1.0]);
  P.put('rail', -L / 2 - 0.4, 0, y + 0.17, Math.PI / 2, { w: 4.6 }, [4.6, 0.25, 0.8]);
  P.put('pulpit', -L / 2 + 1.3, -2.9, y, Math.PI / 2, {}, [1.1, 1.1, 1.3]);
  P.put('lectern', -L / 2 + 1.3, 2.9, y, Math.PI / 2, {}, [0.5, 0.5, 1.2]);
  P.put('font', L / 2 - 2.2, 2.6, y, 0, {}, [0.8, 0.8, 1.0]);
  P.put('hymnBoard', -L / 2 + 0.4, 3.6, y + 1.6, Math.PI / 2, {});
  P.put('organ', L / 2 - 1.2, -3.0, y, -Math.PI / 2, {}, [1.6, 0.8, 1.6]);
  P.lights.push([0, y + 5, 0]);
  return P;
}
// the filling station's kiosk (7 x 5 at v -6..-1, front glass at v -1): counter, till, oil cans, the sweets
function petrolPlan(it) {
  const P = new Plan(it, 'petrol'), r = rng((it.seed | 0) ^ 0x9e7), y = LIFT, H = 3, c = 0xe8e4d8;
  P.H = H;
  P.wall('u', -1 - T, T, -3.5, 3.5, -0.3, H, c, [{ a: -3, b: 2, lo: 0.4, hi: 2.4 }, { a: 2.3, b: 3.2, lo: -0.3, hi: 2.1 }], 8);
  P.wall('u', -6, T, -3.5, 3.5, -0.3, H, c, [], 4);
  P.wall('v', 3.5 - T, T, -6 + T, -1 - T, -0.3, H, c, [], 32); P.wall('v', -3.5, T, -6 + T, -1 - T, -0.3, H, c, [], 16);
  P.door({ u: 2.75, v: -1 - T / 2, y: 0, w: 0.9, h: 2.1, ax: 'u', hinge: 1, swing: -1, kind: 'shop', c: 0xd8d8d0, out: 1 });
  P.floor(-3.5 + T, 3.5 - T, -6 + T, -1 - T, y, 0xb0a890, 'lino');
  P.floor(2.1, 3.4, -1 - T, -0.2, 0, 0x8a8a86, 'step');
  P.ceil(-3.5 + T, 3.5 - T, -6 + T, -1 - T, H - 0.05);
  P.put('counter', -0.6, -3.6, y, 0, { w: 3.6, c: 0x7a2a22, till: true }, [3.6, 0.6, 0.95]);
  P.put('shelves', -0.6, -5.6, y, 0, { w: 4.6, goods: 'oil' }, [4.6, 0.4, 2.0]);
  P.put('shelves', 3.1, -3.5, y, -Math.PI / 2, { w: 2.2, goods: 'newsagent', low: true }, [2.2, 0.4, 1.4]);
  P.put('newsRack', -2.9, -1.6, y, Math.PI / 2, {}, [1.0, 0.5, 1.4]);
  P.lights.push([0, y + 2.2, -3.5]);
  return P;
}
// a barn: the big doors (two leaves) on the front, hay stacked, sacks, the old tractor, tools on the wall
function barnPlan(it) {
  const P = new Plan(it, 'barn'), r = rng((it.seed | 0) ^ 0xba7), w = it.w, d = it.d, H = it.h || 5.5, y = LIFT, c = 0x6a5a4a;
  P.H = H;
  P.wall('u', d / 2 - T, T, -w / 2, w / 2, -0.3, H, c, [{ a: -2.2, b: 2.2, lo: -0.3, hi: 4.2 }], 8);
  P.wall('u', -d / 2, T, -w / 2, w / 2, -0.3, H, c, [], 4);
  P.wall('v', w / 2 - T, T, -d / 2 + T, d / 2 - T, -0.3, H, c, [], 32); P.wall('v', -w / 2, T, -d / 2 + T, d / 2 - T, -0.3, H, c, [], 16);
  for (const s of [-1, 1]) P.door({ u: s * 1.1, v: d / 2 - T / 2, y: 0, w: 2.2, h: 4.2, ax: 'u', hinge: s, swing: 1, kind: 'barn', c: 0x6b5038, out: 1 });
  P.floor(-w / 2 + T, w / 2 - T, -d / 2 + T, d / 2 - T, y, 0x6a5e4a, 'earth');
  P.floor(-2.4, 2.4, d / 2 - T, d / 2 + 1.0, 0, 0x7a705a, 'step');
  P.ceil(-w / 2 + T, w / 2 - T, -d / 2 + T, d / 2 - T, H - 0.05, 0x4a3e30);
  const hx = -w / 2 + 1.4; P.put('hayStack', hx + 1.2, -d / 2 + 1.6, y, 0, { n: Math.max(2, Math.floor((w / 2 - 3) / 1.3)) }, [Math.max(2, Math.floor((w / 2 - 3) / 1.3)) * 1.25, 2.6, 2.4]);
  P.put('tractor', w / 2 - 2.2, 0, y, Math.PI / 2 + (r() - 0.5) * 0.3, {}, [1.8, 3.6, 2.6]);
  P.put('sacks', -w / 2 + 1.0, d / 2 - 1.4, y, 0, {}, [1.2, 1.0, 0.7]);
  P.put('toolWall', w / 2 - 0.25, -d / 2 + 1.6, y + 1.2, -Math.PI / 2, {});
  P.lights.push([0, y + 4, 0]);
  return P;
}
// a boat shed (6 x 10): double doors to the slip, a clinker dinghy on trestles, oars, pots and nets, the bench
function boatshedPlan(it) {
  const P = new Plan(it, 'boatshed'), w = 6, d = 10, H = 3.6, y = LIFT, c = 0x5a4a3a;
  P.H = H;
  P.wall('u', d / 2 - T, T, -w / 2, w / 2, -0.3, H, c, [{ a: -2, b: 2, lo: -0.3, hi: 3 }], 8);
  P.wall('u', -d / 2, T, -w / 2, w / 2, -0.3, H, c, [], 4);
  P.wall('v', w / 2 - T, T, -d / 2 + T, d / 2 - T, -0.3, H, c, [], 32); P.wall('v', -w / 2, T, -d / 2 + T, d / 2 - T, -0.3, H, c, [], 16);
  for (const s of [-1, 1]) P.door({ u: s, v: d / 2 - T / 2, y: 0, w: 2, h: 3, ax: 'u', hinge: s, swing: 1, kind: 'barn', c: 0x4a3a2a, out: 1 });
  P.floor(-w / 2 + T, w / 2 - T, -d / 2 + T, d / 2 - T, y, 0x6a5a48, 'boards');
  P.floor(-2.2, 2.2, d / 2 - T, d / 2 + 1.0, 0, 0x7a705a, 'step');
  P.ceil(-w / 2 + T, w / 2 - T, -d / 2 + T, d / 2 - T, H - 0.05, 0x3a3028);
  P.put('dinghy', -0.4, -0.5, y, 0, {}, [1.6, 4.4, 1.2]);
  P.put('bench', w / 2 - 0.5, -d / 2 + 1.8, y, -Math.PI / 2, {}, [2.0, 0.7, 0.95]);
  P.put('pots', -w / 2 + 0.8, -d / 2 + 0.8, y, 0, {}, [1.4, 1.4, 1.0]);
  P.put('oars', w / 2 - 0.2, 1.8, y, -Math.PI / 2, {});
  P.lights.push([0, y + 2.6, 0]);
  return P;
}
// a lock-up garage (3.2 x 5.5): the up-and-over door, a car, the bench, tins and tyres
function garagePlan(it) {
  const P = new Plan(it, 'garage'), r = rng((it.seed | 0) ^ 0x6a7), w = 3.2, d = 5.5, H = 2.5, y = 0.05, c = 0x8a8478;
  P.H = H;
  P.wall('u', d / 2 - 0.12, 0.12, -w / 2, w / 2, -0.3, H, c, [{ a: -1.3, b: 1.3, lo: -0.3, hi: 2.1 }], 8);
  P.wall('u', -d / 2, 0.12, -w / 2, w / 2, -0.3, H, c, [], 4);
  P.wall('v', w / 2 - 0.12, 0.12, -d / 2 + 0.12, d / 2 - 0.12, -0.3, H, c, [], 32); P.wall('v', -w / 2, 0.12, -d / 2 + 0.12, d / 2 - 0.12, -0.3, H, c, [], 16);
  P.door({ u: 0, v: d / 2 - 0.06, y: 0, w: 2.6, h: 2.1, ax: 'u', hinge: 0, swing: -1, kind: 'garage', c: 0xd8d8d0, out: 1 });
  P.floor(-w / 2 + 0.12, w / 2 - 0.12, -d / 2 + 0.12, d / 2 - 0.12, y, 0x7a7a74, 'concrete');
  P.ceil(-w / 2 + 0.12, w / 2 - 0.12, -d / 2 + 0.12, d / 2 - 0.12, H - 0.05, 0x5a5a56);
  if (hash01(it.seed, 30) < 0.6) P.put('car', 0, 0.3, y, Math.PI, { paint: r.pick([0x8a2a20, 0x2e4a6e, 0xd6c27a, 0x6e6a62, 0x2f5a3a]) }, [1.7, 4.2, 1.4]);
  P.put('bench', 0, -d / 2 + 0.4, y, 0, {}, [2.0, 0.6, 0.95]);
  P.put('tyres', w / 2 - 0.4, -d / 2 + 1.3, y, 0, {}, [0.65, 0.65, 0.9]);
  P.lights.push([0, y + 2.2, 0]);
  return P;
}
// the task force's quonset barracks (interiors.js puts one by each island's pad): a half-cylinder hut 6 m across and
// 14 long on a concrete slab, doors at both ends, two rows of bunks with footlockers and wall lockers, the oil stove,
// the duty NCO's desk and the rifle rack. it: { t: 'barracks', x, z, y, yaw, seed }   (local z along the hut)
export const QUONSET = { w: 6.1, d: 14.6, H: 4.25, knee: 1.2 };   // an arch of radius w / 2 on 1.2 m knee walls
function barracksPlan(it) {
  const P = new Plan(it, 'barracks'), r = rng((it.seed | 0) ^ 0xba44), { w, d, H } = QUONSET, y = 0.25, c = 0x6a6e5a;
  P.H = H;
  // the curved shell's walls for colliding: low side walls (the arch comes in over them), the end walls with doors
  P.wall('v', w / 2 - 0.15, 0.15, -d / 2 + 0.15, d / 2 - 0.15, -0.3, 1.8, c, [], 32); P.wall('v', -w / 2, 0.15, -d / 2 + 0.15, d / 2 - 0.15, -0.3, 1.8, c, [], 16);
  for (const s of [-1, 1]) {
    P.wall('u', s > 0 ? d / 2 - 0.15 : -d / 2, 0.15, -w / 2, w / 2, -0.3, H, 0x5a5e4a, [{ a: -0.5, b: 0.5, lo: -0.3, hi: 2.1 }, { a: -2.2, b: -1.4, lo: 1.0, hi: 1.9 }, { a: 1.4, b: 2.2, lo: 1.0, hi: 1.9 }], s > 0 ? 8 : 4);
    P.door({ u: 0, v: s * (d / 2 - 0.075), y: 0.0, w: 1.0, h: 2.1, ax: 'u', hinge: -s, swing: -s, kind: 'mil', c: 0x4a5038, out: s });
    P.floor(-0.8, 0.8, s > 0 ? d / 2 - 0.15 : -d / 2 - 0.9, s > 0 ? d / 2 + 0.9 : -d / 2 + 0.15, 0.1, 0x8a8a84, 'step');
  }
  P.floor(-w / 2 + 0.15, w / 2 - 0.15, -d / 2 + 0.15, d / 2 - 0.15, y, 0x8a8a80, 'boards');
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
    const v = -d / 2 + 2.2 + k * 2.9;
    P.put('bunk', s * (w / 2 - 1.15), v, y, s > 0 ? -Math.PI / 2 : Math.PI / 2, {}, [0.9, 2.0, 1.7]);
    P.put('footlocker', s * 0.67, v, y, s > 0 ? -Math.PI / 2 : Math.PI / 2, {}, [0.8, 0.45, 0.45]);
    P.put('locker', s * (w / 2 - 0.35), v + 1.35, y, s > 0 ? -Math.PI / 2 : Math.PI / 2, {}, [0.6, 0.5, 1.8]);
  }
  P.put('stove', 0, -0.75, y, 0, {}, [0.5, 0.5, 1.0]);
  P.put('desk', -1.6, d / 2 - 1.2, y, Math.PI, {}, [1.2, 0.7, 0.75]);
  P.put('rifleRack', 1.6, d / 2 - 0.5, y, Math.PI, {}, [1.4, 0.4, 1.5]);
  P.lights.push([0, y + 2.6, -3], [0, y + 2.6, 3]);
  return P;
}

// ------------------------------------------------------------------ entry points
const cache = new Map();
// the plan of item `it` (null if it has no interior). hf(x, z): the ground (front steps); cached by seed
export function planOf(it, hf = null) {
  if (!ENTERABLE.has(it.t)) return null;
  const key = it.t + ':' + (it.seed | 0) + ':' + Math.round(it.x * 10) + ':' + Math.round(it.z * 10);
  let P = cache.get(key); if (P) return P;
  switch (it.t) {
    case 'house': case 'cottage': P = housePlan(it, hf); break;
    case 'terrace': P = terracePlan(it, hf); break;
    case 'church': P = churchPlan(it); break;
    case 'petrol': P = petrolPlan(it); break;
    case 'barn': P = barnPlan(it); break;
    case 'boatshed': P = boatshedPlan(it); break;
    case 'garage': P = garagePlan(it); break;
    case 'barracks': P = barracksPlan(it); break;
    default: return null;
  }
  P.key = key;
  cache.set(key, P); if (cache.size > 600) for (const k of cache.keys()) { cache.delete(k); if (cache.size < 450) break; }
  return P;
}
// item frame <-> world
export function itemToWorld(it, u, v, out = [0, 0]) { const c = Math.cos(it.yaw || 0), s = Math.sin(it.yaw || 0); out[0] = it.x + c * u + s * v; out[1] = it.z - s * u + c * v; return out; }
export function worldToItem(it, x, z, out = [0, 0]) { const c = Math.cos(it.yaw || 0), s = Math.sin(it.yaw || 0), dx = x - it.x, dz = z - it.z; out[0] = c * dx - s * dz; out[1] = s * dx + c * dz; return out; }
// the floor height (item frame y) of floor f at (u, v): a slab's y, a stair's ramp
export function floorY(f, u, v) {
  if (!f.ry) return f.y;
  const t = f.ax === 'v' ? (v - f.v0) / (f.v1 - f.v0) : (u - f.u0) / (f.u1 - f.u0);
  return f.ry[0] + (f.ry[1] - f.ry[0]) * Math.max(0, Math.min(1, t));
}
