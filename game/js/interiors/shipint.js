// INTERIORS (ngc/interiors): the ALBATROSS inside - the hangar deck, the island's levels and the navigation bridge
// (pure: no THREE). Ship frame (units/naval/albatross.js): x starboard, y up from the waterline, z aft; flight deck at
// y 8, the island's tower frame at (TOWER_X 10.5, 8, TOWER_Z 6), the hangar deck at the lifts' lower stop (y 4.25).
//
//   HANGAR DECK  y 4.25 to the deck's underside (7.45), x +-11.9 inside the hull's hangar sides, z -35 to +50: openings
//                to the three deck-edge lifts (a chain across each while its lift is not down), the hangar deck
//                control booth, spare engines on their stands, tow tractors, tool boxes, drums, crates, fire stations.
//   ISLAND       in through the watertight door on its port face (the middle of the three drawn doors):
//     O-3 (flight deck level)  Flight Deck Control with the "Ouija board" (the deck-handling table with its aircraft
//                              templates), the trunk down to the hangar deck behind a watertight door, stairs up
//     O-5          the squadron ready room (ready-room chairs facing the status board)
//     O-7          flag plot (the plot table, status boards, the admiral's chair) under the glass band
//     O-9 BRIDGE   helm, lee helm (engine order telegraph), the captain's chair to port, radar repeater, chart table,
//                  doors out to both bridge wings, and a ladder up through a hatch to the island top deck
//   The inclined ladders ("stairs") are ramps at 34 degrees, so footsim walks them (SLOPE_TAN 0.75).
//
// API (createAlbInterior(ship)) - read by ground.js (floors, walls), interiors.js (drawn), the craft that steps on:
//   INT.zoneOf(lx, ly, lz)     -> 'island' | 'hangar' | null : where the layered floors replace the one deck height
//   INT.floorAt(lx, ly, lz)    -> the highest floor (ship y) at or under ly in a zone, or undefined outside the zones
//   INT.boxes()                -> axis-aligned walls [x0, x1, z0, z1, y0, y1] (ship frame; doors as they stand now)
//   INT.ladders                -> ladders in GR's ship-frame ladder format (the bridge -> top deck, behind its hatch)
//   INT.doors                  -> doors.js doors (watertight doors, the hatch), INT.plan: walls / floors / furniture
//   INT.crew                   -> [{ kind, pose, x, y, z, yaw }] the people at their stations (interiors.js draws them)
import { DOORS } from './doors.js';

export const HANGAR = { y: 4.25, top: 7.45, x: 11.9, z0: -35, z1: 50 };
const TX = 10.5, TZ = 6, DK = 8;
const X = tx => TX + tx, Z = tz => TZ + tz, Y = ty => DK + ty;
const STAIR = 0.68;
// the island's levels above the flight deck (tower frame)
export const ISL = {
  base: { x0: -2.3, x1: 2.6, z0: -8.5, z1: 8.8 },           // O-3 / O-4 block (0..3.2)
  l1: { x0: -2.2, x1: 2.5, z0: -8.0, z1: 8.5, y: 3.2 },     // O-5 / O-6 (3.2..6.4)
  l2: { x0: -2.4, x1: 2.5, z0: -7.2, z1: 4.0, y: 6.4 },     // O-7 flag bridge (6.4..9.0), the funnel aft of z 4
  br: { x0: -2.5, x1: 2.5, z0: -6.0, z1: 4.0, y: 9.1 },     // navigation bridge (9.0..13.05)
};
const W = 0.15;   // bulkhead thickness

export function createAlbInterior(ship) {
  const walls = [], floors = [], furn = [], crew = [], dyn = [];
  const P = { walls, floors, furn };
  // a bulkhead box in TOWER coordinates (or ship, abs: true); color for drawing; noDraw for the island's outer skin
  const box = (x0, x1, z0, z1, y0, y1, c = 0x8c9296, o = {}) => { const b = o.abs ? [x0, x1, z0, z1, y0, y1] : [X(x0), X(x1), Z(z0), Z(z1), Y(y0), Y(y1)]; walls.push({ b, c, ...o }); return b; };
  // a wall along z (at x, thickness W inward by sign s) from z0 to z1 with door gaps [{ a, b, h }] (tower frame)
  const wallZ = (x, s, z0, z1, y0, y1, gaps = [], c, o) => { const xa = s > 0 ? x : x - W, xb = s > 0 ? x + W : x; let cur = z0; for (const g of [...gaps].sort((p, q) => p.a - q.a)) { if (g.a > cur) box(xa, xb, cur, g.a, y0, y1, c, o); if (g.h < y1 - y0) box(xa, xb, g.a, g.b, y0 + g.h, y1, c, o); cur = g.b; } if (z1 > cur) box(xa, xb, cur, z1, y0, y1, c, o); };
  const wallX = (z, s, x0, x1, y0, y1, gaps = [], c, o) => { const za = s > 0 ? z : z - W, zb = s > 0 ? z + W : z; let cur = x0; for (const g of [...gaps].sort((p, q) => p.a - q.a)) { if (g.a > cur) box(cur, g.a, za, zb, y0, y1, c, o); if (g.h < y1 - y0) box(g.a, g.b, za, zb, y0 + g.h, y1, c, o); cur = g.b; } if (x1 > cur) box(cur, x1, za, zb, y0, y1, c, o); };
  // floors: { x0, x1, z0, z1, y } ship frame; ramps { ..., ry: [y at the axis' low end, high end], ax: 'z'|'x' }
  const slab = (x0, x1, z0, z1, ty, c = 0x5a5f63, o = {}) => { const f = { x0: X(x0), x1: X(x1), z0: Z(z0), z1: Z(z1), y: Y(ty), c, ...o }; floors.push(f); return f; };
  const slabHole = (x0, x1, z0, z1, ty, h, c, o) => { const [hx0, hx1, hz0, hz1] = h; for (const [a, b, p, q] of [[x0, hx0, z0, z1], [hx1, x1, z0, z1], [hx0, hx1, z0, hz0], [hx0, hx1, hz1, z1]]) if (b - a > 0.01 && q - p > 0.01) slab(a, b, p, q, ty, c, o); };
  const stair = (x0, x1, z0, z1, yLow, yHigh, upToward, c = 0x6a7076) => { // upToward: +1 rises toward +z, -1 toward -z (along z only)
    floors.push({ x0: X(x0), x1: X(x1), z0: Z(z0), z1: Z(z1), y: Y(yHigh), ry: upToward > 0 ? [Y(yLow), Y(yHigh)] : [Y(yHigh), Y(yLow)], ax: 'z', c, stair: true });
    // under the flight: stepped boxes (nobody walks through it from underneath), the handrails either side
    const L = z1 - z0, n = Math.ceil(L / 0.5);
    for (let k = 0; k < n; k++) { const s0 = z0 + k * L / n, s1 = z0 + (k + 1) * L / n, low = upToward > 0 ? yLow + (yHigh - yLow) * (s0 - z0) / L : yLow + (yHigh - yLow) * (z1 - s1) / L; if (low - 0.35 > yLow + 0.05) box(x0, x1, s0, s1, yLow - 0.1, low - 0.35, c, { under: true, noDraw: true }); }
    for (const x of [x0 - 0.03, x1 + 0.03]) furn.push({ k: 'handrail', x: X(x), z0: Z(z0), z1: Z(z1), y0: Y(upToward > 0 ? yLow : yHigh) + 0.9, y1: Y(upToward > 0 ? yHigh : yLow) + 0.9 });
  };
  const put = (k, tx, ty, tz, yaw = 0, o = {}, sz = null) => { furn.push({ k, x: X(tx), y: Y(ty), z: Z(tz), yaw, o }); if (sz) { const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)), hx = (sz[0] * c + sz[1] * s) / 2, hz = (sz[0] * s + sz[1] * c) / 2; box(tx - hx, tx + hx, tz - hz, tz + hz, ty - 0.05, ty + sz[2], 0, { noDraw: true, furn: true }); } };
  const putAbs = (k, x, y, z, yaw = 0, o = {}, sz = null) => put(k, x - TX, y - DK, z - TZ, yaw, o, sz);
  const man = (kind, pose, tx, ty, tz, yaw, o = {}) => crew.push({ kind, pose, x: X(tx), y: Y(ty), z: Z(tz), yaw, ...o });
  const doorsList = [];
  // a door in TOWER coordinates (u = x, v = z): the host is the ship (its frame moves; doors.js keeps world boxes up to date)
  const host = {
    toWorld: (u, v, out) => { const c = Math.cos(ship.yaw), s = Math.sin(ship.yaw), lx = X(u), lz = Z(v); out[0] = ship.p.x + lx * c + lz * s; out[1] = ship.p.z - lx * s + lz * c; return out; },
    yaw: () => ship.yaw, y0: () => ship.p.y + (ship.att ? ship.att.heave : 0) + DK,
  };
  const door = (key, d) => { const D = DOORS.register('ALBATROSS#' + key, d, host); doorsList.push(D); return D; };

  // =========================================================================== the hangar deck
  const H = HANGAR, lifts = ship.parts && ship.parts.lifts ? ship.parts.lifts : [];
  const openings = lifts.map(L => ({ sd: L.sd, z0: Math.max(H.z0, L.E.z0), z1: Math.min(H.z1, L.E.z1), L }));
  floors.push({ x0: -H.x, x1: H.x, z0: H.z0, z1: H.z1, y: H.y, c: 0x4a4e52, hangar: true });
  for (const o of openings) floors.push({ x0: o.sd > 0 ? H.x : -14.05, x1: o.sd > 0 ? 14.05 : -H.x, z0: o.z0, z1: o.z1, y: H.y, c: 0x55595c, sill: true });   // the sill out to the lift
  for (const sd of [-1, 1]) {
    const gaps = openings.filter(o => o.sd === sd).map(o => ({ a: o.z0, b: o.z1, h: 2.6 }));
    let cur = H.z0; for (const g of gaps.sort((p, q) => p.a - q.a)) { if (g.a > cur) box(sd > 0 ? H.x : -H.x - 0.2, sd > 0 ? H.x + 0.2 : -H.x, cur, g.a, H.y - 0.3, H.top, 0x9aa0a4, { abs: true, hangarSide: sd }); box(sd > 0 ? H.x : -H.x - 0.2, sd > 0 ? H.x + 0.2 : -H.x, g.a, g.b, H.y + g.h, H.top, 0x9aa0a4, { abs: true, hangarSide: sd }); cur = g.b; }
    if (H.z1 > cur) box(sd > 0 ? H.x : -H.x - 0.2, sd > 0 ? H.x + 0.2 : -H.x, cur, H.z1, H.y - 0.3, H.top, 0x9aa0a4, { abs: true, hangarSide: sd });
  }
  box(-H.x, H.x, H.z0 - 0.2, H.z0, H.y - 0.3, H.top, 0x9aa0a4, { abs: true });   // forward and aft bulkheads
  box(-H.x, H.x, H.z1, H.z1 + 0.2, H.y - 0.3, H.top, 0x9aa0a4, { abs: true });
  // the chains across an opening whose lift is not down at the hangar deck (dynamic: boxes() adds them)
  const chains = openings.map(o => ({ o, b: [o.sd > 0 ? H.x + 0.05 : -H.x - 0.25, o.sd > 0 ? H.x + 0.25 : -H.x - 0.05, o.z0, o.z1, H.y, H.y + 1.0] }));
  // fittings: the booth, engines, tractors, the clutter of a working hangar (ship coordinates)
  putAbs('hdcBooth', -9.8, H.y, 4, Math.PI / 2, {}, [3.0, 2.2, 2.6]);
  putAbs('engineStand', -6.5, H.y, -16, 0.2, {}, [1.2, 4.2, 1.6]); putAbs('engineStand', -6.0, H.y, 36, -0.1, {}, [1.2, 4.2, 1.6]);
  putAbs('tilly', 4.5, H.y, -28, 0.4, {}, [2.4, 4.6, 2.6]);
  putAbs('tractor', -2.5, H.y, 22, 1.2, {}, [1.7, 3.0, 1.3]); putAbs('tractor', 5.5, H.y, 40, -0.4, {}, [1.7, 3.0, 1.3]);
  for (const [x, z, a] of [[-10.6, -20, 0], [-10.6, 30, 0], [10.6, -5, Math.PI], [10.6, 44, Math.PI], [-10.6, 12, 0]]) putAbs('toolbox', x, H.y, z, a + Math.PI / 2, {}, [1.0, 0.55, 1.1]);
  for (const [x, z] of [[-10.4, -30], [-10.4, 46], [9.8, 47], [-3, -33.6]]) putAbs('drums', x, H.y, z, 0, {}, [1.4, 1.4, 0.95]);
  for (const [x, z, a] of [[8.5, -33, 0.1], [-8.5, 46.5, -0.2], [2, 47.5, 0]]) putAbs('crates', x, H.y, z, a, {}, [2.2, 1.4, 1.5]);
  for (const z of [-34.75, 49.75]) for (const x of [-7, 7]) putAbs('fireStation', x, H.y, z, z < 0 ? 0 : Math.PI, {});
  for (const z of [-5, 25]) furn.push({ k: 'fireCurtain', x: 0, y: H.top, z, w: 2 * H.x });
  for (let z = H.z0 + 3; z < H.z1 - 1; z += 3) for (let x = -9; x <= 9; x += 3) furn.push({ k: 'padeye', x, y: H.y, z });
  furn.push({ k: 'hangarLines', y: H.y });
  man('deck', 'stand', -9.8 - TX + 0.2, H.y - DK, 4 - TZ - 0.4, Math.PI / 2, { jersey: 'yellow' });
  man('deck', 'stand', -6.5 - TX + 1.0, H.y - DK, -16 - TZ + 1.4, -2.0, { jersey: 'green' });
  man('deck', 'kneel', -6.0 - TX - 0.9, H.y - DK, 36 - TZ, 1.4, { jersey: 'green' });
  man('deck', 'stand', 4.5 - TX - 1.7, H.y - DK, -28 - TZ + 1.0, 2.6, { jersey: 'blue' });

  // =========================================================================== the island
  const B = ISL.base, L1 = ISL.l1, L2 = ISL.l2, BR = ISL.br;
  const skin = 0x7e878f, inner = 0xb8bcb4, deckc = 0x5a5f63, red = 0x7a3a32, tile = 0x6a6e66;
  // the outer skin (collision: the model draws the outside), one level at a time, with the doors
  const ext = { noDrawOut: true };
  const dPort = { a: -1.0 - 0.45, b: -1.0 + 0.45, h: 1.9 };
  wallZ(B.x0, 1, B.z0, B.z1, 0, 3.2, [dPort], inner, ext); wallZ(B.x1, -1, B.z0, B.z1, 0, 3.2, [], inner, ext);
  wallX(B.z0, 1, B.x0, B.x1, 0, 3.2, [], inner, ext); wallX(B.z1, -1, B.x0, B.x1, 0, 3.2, [], inner, ext);
  wallZ(L1.x0, 1, L1.z0, L1.z1, 3.2, 6.4, [], inner, ext); wallZ(L1.x1, -1, L1.z0, L1.z1, 3.2, 6.4, [], inner, ext);
  wallX(L1.z0, 1, L1.x0, L1.x1, 3.2, 6.4, [], inner, ext); wallX(L1.z1, -1, L1.x0, L1.x1, 3.2, 6.4, [], inner, ext);
  wallZ(L2.x0, 1, L2.z0, L2.z1, 6.4, 9.0, [], inner, { ...ext, glass: [7.6 - 6.4, 8.3 - 6.4] }); wallZ(L2.x1, -1, L2.z0, L2.z1, 6.4, 9.0, [], inner, { ...ext, glass: [1.2, 1.9] });
  wallX(L2.z0, 1, L2.x0, L2.x1, 6.4, 9.0, [], inner, { ...ext, glass: [1.2, 1.9] }); wallX(L2.z1, -1, L2.x0, L2.x1, 6.4, 9.0, [], 0x8a8f90, ext);
  const WZ = { '-1': -3.2, '1': -4.6 };   // the bridge wings' centres (NAVAL's model: port at z -3.2, starboard -4.6)
  const dWing = sd => ({ a: WZ[sd] - 0.42, b: WZ[sd] + 0.42, h: 1.95 });
  wallZ(BR.x0, 1, BR.z0, BR.z1, 9.0, 13.05, [dWing(-1)], inner, { ...ext, glass: [0.95, 3.55] }); wallZ(BR.x1, -1, BR.z0, BR.z1, 9.0, 13.05, [dWing(1)], inner, { ...ext, glass: [0.95, 3.55] });
  wallX(BR.z0, 1, BR.x0, BR.x1, 9.0, 13.05, [], inner, { ...ext, glass: [0.95, 3.55] }); wallX(BR.z1, -1, BR.x0, BR.x1, 9.0, 13.05, [], inner, { ...ext, glass: [0.95, 3.55] });
  // what stays solid outside: pri-fly, the funnel, the mast, the top-deck rails, the wings' rails (as ALB_BOXES had them)
  // (NAVAL's own list when the model exports it - parts.islandBoxes from pri-fly on: funnel, mast, SPS-48 pedestal, the
  // top-deck and catwalk rails, the port wing's ledge; else the same boxes as ground.js ALB_BOXES had)
  const outside = ship.parts && ship.parts.islandBoxes ? ship.parts.islandBoxes.slice(4) : [[-3.4, 1.0, 0.3, 4.9, 13.15, 15.8], [-2.0, 2.2, 4.1, 8.7, 6.4, 17.8], [-0.2, 0.4, -1.3, -0.7, 13.3, 28], [-2.5, 2.6, -6.25, -6.05, 13.3, 14.3], [2.45, 2.65, -6.1, 0.4, 13.3, 14.3], [-2.65, -2.45, -6.1, 0.3, 13.3, 14.3]];
  for (const b of outside) box(...b, 0, { noDraw: true });
  for (const sd of [-1, 1]) { const z = WZ[sd]; box(sd > 0 ? 3.85 : -3.95, sd > 0 ? 3.95 : -3.85, z - 1.2, z + 1.2, 9.1, 10.1, 0, { noDraw: true }); box(sd > 0 ? 2.5 : -3.95, sd > 0 ? 3.95 : -2.5, z - 1.3, z - 1.15, 9.1, 10.1, 0, { noDraw: true }); }
  // ---- O-3: Flight Deck Control forward, the vestibule, the trunk down, the stairs up
  slabHole(-3.96, 3.29, -9.3, 9.4, 0, [0.3, 1.2, 1.0, 1.0 + 3.75 / STAIR], deckc, { deck: true });   // (the flight deck round the island too: to its edge at x 13.79)
  wallX(-2.2, -1, B.x0 + W, B.x1 - W, 0, 3.05, [{ a: -1.7, b: -0.8, h: 2.0 }], inner);   // FDC's aft bulkhead
  wallX(6.65, 1, B.x0 + W, B.x1 - W, 0, 3.05, [], inner);                                 // the aft stores (closed)
  slab(-2.15, 2.45, -8.35, -2.2, 0.02, tile);
  put('ouija', 0.3, 0, -5.4, 0, {}, [1.9, 3.8, 0.95]);
  put('shipChair', -1.1, 0, -6.2, Math.PI / 2); put('shipChair', 1.7, 0, -4.4, -Math.PI / 2);
  put('plotBoard', 0.2, 0, -8.3, 0, { w: 3.6 }); put('console', 2.15, 0, -7.4, -Math.PI / 2, { w: 1.6 }, [1.6, 0.7, 1.2]); put('phones', -2.1, 1.3, -3.5, Math.PI / 2);
  man('officer', 'seated', 1.7, 0, -4.4, -Math.PI / 2, { look: 'down' }); man('sailor', 'stand', -0.75, 0, -5.4, Math.PI / 2, { arms: 'table' }); man('deck', 'stand', 0.6, 0, -7.4, 0, { jersey: 'yellow', arms: 'table' });
  // the trunk: a watertight door across the top of the ladder down, the coaming rails round its open side
  const dTrunk = door('trunk', { u: 0.75, v: 0.95, y: 0, w: 0.75, h: 1.88, ax: 'u', hinge: -1, swing: -1, kind: 'wt', c: 0x8c9296 });
  wallX(0.95 - W / 2, 1, 0.15, 0.375, 0, 2.1, [], inner); wallX(0.95 - W / 2, 1, 1.125, 1.35, 0, 2.1, [], inner); box(0.375, 1.125, 0.95 - W / 2, 0.95 + W / 2, 1.88, 2.1, inner);
  wallZ(0.15, -1, 0.95, 6.65, 0, 1.0, [], 0x5a5f63); wallZ(1.35, 1, 0.95, 6.65, 0, 1.0, [], 0x5a5f63);
  stair(0.3, 1.2, 1.0, 1.0 + 3.75 / STAIR, -3.75, 0, -1);
  // the shaft below the flight deck down to the hangar deck, open at its aft end
  wallZ(0.15, -1, 0.95, 6.65, -3.75, -0.3, [], inner); wallZ(1.35, 1, 0.95, 6.65, -3.75, -0.3, [], inner); wallX(0.95, -1, 0.15 - W, 1.35 + W, -3.75, -0.3, [], inner);
  // up to O-5: the second flight beside it
  stair(-1.0, -0.1, 1.0, 1.0 + 3.2 / STAIR, 0, 3.2, 1);
  // ---- O-5: the squadron ready room
  slabHole(L1.x0, L1.x1, L1.z0, L1.z1, 3.2, [-1.0, -0.1, 1.0, 1.0 + 3.2 / STAIR], 0x4a4e3e);
  wallZ(-0.1, 1, 1.0, 1.0 + 3.2 / STAIR, 3.2, 4.2, [], 0x5a5f63); wallZ(-1.0, -1, 1.0, 1.0 + 3.2 / STAIR, 3.2, 4.2, [], 0x5a5f63); wallX(1.0, -1, -1.0 - W, -0.1 + W, 3.2, 4.2, [], 0x5a5f63);   // rails round the stairwell
  wallX(0.5, 1, L1.x0 + W, L1.x1 - W, 3.2, 6.25, [{ a: 0.3, b: 1.2, h: 2.0 }], inner);   // the ready room's aft bulkhead
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) put('readyChair', -1.45 + c * 0.95, 3.2, -5.4 + r * 1.35, Math.PI, {}, [0.7, 0.75, 1.1]);
  put('statusBoard', 0.15, 3.2, -7.85, 0, { w: 4.2 }); put('tvSet', 2.1, 5.2, -7.4, -0.5);
  man('pilot', 'seated', -0.5, 3.2, -4.05, Math.PI); man('pilot', 'seated', 1.4, 3.2, -2.7, Math.PI); man('pilot', 'seated', -1.45, 3.2, -1.35, Math.PI); man('officer', 'stand', 0.9, 3.2, -7.1, 0.3, { arms: 'point' });
  // up to O-7: the third flight, rising forward along the starboard side
  stair(1.3, 2.2, 5.6 - 3.2 / STAIR, 5.6, 3.2, 6.4, -1);
  // ---- O-7: flag plot
  slabHole(L2.x0 + W, L2.x1 - W, L2.z0 + W, L2.z1 - W, 6.4, [1.3, 2.2, 5.6 - 3.2 / STAIR, 5.6], 0x4a4e52);
  slabHole(L1.x0, L1.x1, L1.z0, L1.z1, 6.4, [1.3, 2.2, 5.6 - 3.2 / STAIR, 5.6], deckc, { roof: true });   // O-5's roof round O-7 (the model draws it)
  wallZ(1.3, -1, 5.6 - 3.2 / STAIR, 4.0, 6.4, 7.4, [], 0x5a5f63);
  put('plotTable', 0.0, 6.4, -3.2, 0, {}, [1.6, 2.4, 0.95]); put('flagChair', -1.5, 6.4, -5.8, Math.PI + 0.3, {}, [0.7, 0.7, 1.1]);
  put('plotBoard', 0.2, 6.4, 3.85, Math.PI, { w: 3.0 }); put('console', 2.1, 6.4, -1.2, -Math.PI / 2, { w: 1.4 }, [1.4, 0.7, 1.2]);
  man('officer', 'stand', 0.9, 6.4, -3.2, -Math.PI / 2, { arms: 'table' }); man('sailor', 'stand', 0.2, 6.4, 3.3, 0, { arms: 'point' });
  // up to the bridge: the fourth flight, port side, rising aft (clear of the wing door and the captain's chair)
  const s4 = [-2.3, -1.4, -2.6, -2.6 + 2.7 / STAIR];
  stair(s4[0], s4[1], s4[2], s4[3], 6.4, 9.1, 1);
  // ---- O-9: the navigation bridge (wheel where helm.js puts it), the wings, the hatch to the top deck
  const hatchR = [1.6, 2.4, 3.0, 3.85];
  slabHole(BR.x0, BR.x1, BR.z0, BR.z1, 9.1, s4, 0x3b3530);
  slab(L2.x0, L2.x1, L2.z0, BR.z0, 9.0, deckc, { roof: true }); slab(L2.x0, L2.x1, BR.z1, 6.0, 9.0, deckc, { roof: true });   // O-7's roof round the bridge
  wallZ(s4[1], 1, s4[2] - W, s4[3], 9.1, 10.1, [], 0x5a5f63); wallX(s4[2], -1, s4[0] - 0.05, s4[1], 9.1, 10.1, [], 0x5a5f63);   // rails: inboard and forward of the well
  for (const sd of [-1, 1]) slab(sd > 0 ? 2.5 : -3.95, sd > 0 ? 3.95 : -2.5, WZ[sd] - 1.2, WZ[sd] + 1.2, 9.12, deckc, { wing: sd, roof: true, noCeil: true });
  slab(-3.62, -2.3, -7.2, 5.2, 6.4, deckc, { roof: true, noCeil: true });   // the O-7 catwalk on the port face (NAVAL's ladders land on it)
  const dWP = door('wingP', { u: BR.x0 + W / 2, v: WZ[-1], y: 9.1, w: 0.84, h: 1.85, ax: 'v', hinge: 1, swing: 1, kind: 'wt', c: 0x8c9296, out: -1 });
  const dWS = door('wingS', { u: BR.x1 - W / 2, v: -4.6, y: 9.1, w: 0.84, h: 1.85, ax: 'v', hinge: 1, swing: -1, kind: 'wt', c: 0x8c9296, out: 1 });
  put('helm', -0.2, 9.1, -3.6, 0, {}, [0.9, 0.7, 1.3]); put('telegraph', 0.75, 9.1, -3.75, 0, {}, [0.5, 0.5, 1.2]);
  put('captainChair', -1.85, 9.1, -4.9, Math.PI + 0.25, {}, [0.75, 0.75, 1.3]); put('radarRepeater', 1.4, 9.1, -1.5, -0.6, {}, [0.8, 0.8, 1.2]);
  put('chartTable', -0.5, 9.1, 3.1, Math.PI, {}, [1.6, 1.0, 0.95]); put('console', 0, 9.1, -5.5, 0, { w: 4.2, windows: true }, [4.2, 0.6, 1.05]);
  put('binocs', 2.0, 9.1, -5.3, 0); put('phones', BR.x1 - 0.2, 10.4, 0.8, -Math.PI / 2);
  man('sailor', 'stand', -0.2, 9.1, -3.0, Math.PI, { arms: 'wheel', hat: 'white' }); man('sailor', 'stand', 0.75, 9.1, -3.2, Math.PI, { arms: 'side', hat: 'white' });
  man('officer', 'seated', -1.85, 9.1, -4.9, Math.PI + 0.25, { hat: 'ball', seatH: 0.85 }); man('officer', 'stand', 1.9, 9.1, -4.6, Math.PI - 0.15, { arms: 'binocs' });
  // the ladder up to the top deck, through the hatch in the bridge roof (aft starboard corner)
  const dHatch = door('hatch', { u: 2.0, v: (hatchR[2] + hatchR[3]) / 2, y: 13.3, w: hatchR[3] - hatchR[2], h: hatchR[1] - hatchR[0], ax: 'v', hinge: -1, swing: 1, kind: 'hatch', c: 0x8c9296, horizontal: true });
  const roofHatchSlab = { x0: X(hatchR[0]), x1: X(hatchR[1]), z0: Z(hatchR[2]), z1: Z(hatchR[3]), y: Y(13.3), c: deckc, when: () => dHatch.a < 0.5, hatch: true };
  // (rungs on the aft bulkhead; the climber faces aft (yaw pi), up through the hatch, off forward onto the roof)
  const ladders = [{ ship: 'carrier', side: 1, name: 'BRIDGE LADDER (HATCH)', lx: X(2.0), lz: Z(3.83), yaw: Math.PI, y0: Y(9.1), y1: Y(13.3), w: 0.5, top: [0, -1.3], inside: true, open: () => dHatch.a > 0.6 }];
  furn.push({ k: 'ladderIn', x: X(2.0), z: Z(3.83), y0: Y(9.1), y1: Y(13.3) });
  // roofs (walkable from outside): bridge roof (with the hatch), the top deck, pri-fly, the funnel top
  slabHole(-2.65, 2.65, -6.15, 4.15, 13.3, hatchR, deckc, { roof: true }); floors.push(roofHatchSlab);
  slab(-2.5, 2.65, -6.15, 0.4, 13.33, deckc, { roof: true }); slab(-3.4, 1.0, 0.3, 4.9, 15.8, deckc, { roof: true }); slab(-2.0, 2.2, 4.1, 8.7, 17.8, deckc, { roof: true });

  // the island's port door (the middle of the three the model draws), the punch openings seen from outside
  const dIsl = door('port', { u: B.x0 + W / 2, v: -1.0, y: 0, w: 0.85, h: 1.9, ax: 'v', hinge: -1, swing: 1, kind: 'wt', c: 0x2b2e32, out: -1 });
  const punches = [
    { door: dIsl, x: X(B.x0) - 0.14, z: Z(-1.0), y0: Y(0), y1: Y(1.9), w: 0.85, nx: -1 },
    { door: dWP, x: X(BR.x0) - 0.14, z: Z(WZ[-1]), y0: Y(9.1), y1: Y(10.95), w: 0.84, nx: -1 },
    { door: dWS, x: X(BR.x1) + 0.14, z: Z(-4.6), y0: Y(9.1), y1: Y(10.95), w: 0.84, nx: 1 },
    ...openings.map(o => ({ hangar: true, x: o.sd * (12.37), z: (o.z0 + o.z1) / 2, y0: H.y, y1: H.y + 2.6, w: o.z1 - o.z0, nx: o.sd })),
  ];

  // =========================================================================== queries
  const zones = {
    island: { x0: X(-3.96), x1: X(3.96), z0: Z(-9.3), z1: Z(9.4), y0: H.y - 0.6 },
    hangar: { x0: -14.06, x1: 14.06, z0: H.z0, z1: H.z1, y0: H.y - 0.6, y1: H.top + 0.1 },
  };
  const INT = { ship, plan: P, walls, floors, furn, crew, doors: doorsList, ladders, punches, zones, hatch: dHatch, H };
  INT.zoneOf = (lx, ly, lz) => {
    const I = zones.island; if (lx > I.x0 && lx < I.x1 && lz > I.z0 && lz < I.z1 && ly > I.y0) return 'island';
    const G = zones.hangar; if (lz > G.z0 && lz < G.z1 && ly > G.y0 && ly < G.y1) {
      if (Math.abs(lx) < H.x + 0.05) return 'hangar';
      for (const o of openings) if (lz > o.z0 && lz < o.z1 && (o.sd > 0 ? lx > 0 && lx < 14.06 : lx < 0 && lx > -14.06)) return 'hangar';
    }
    return null;
  };
  // the highest floor at or under ly (ship frame), in a zone; undefined outside the zones (the old deck rules apply)
  INT.floorAt = (lx, ly, lz) => {
    const zn = INT.zoneOf(lx, ly, lz); if (!zn) return undefined;
    let best = -Infinity;
    for (const f of floors) {
      if (lx < f.x0 || lx > f.x1 || lz < f.z0 || lz > f.z1) continue;
      if (f.when && !f.when()) continue;
      let y = f.y; if (f.ry) { const t = (lz - f.z0) / (f.z1 - f.z0); y = f.ry[0] + (f.ry[1] - f.ry[0]) * t; }
      if (y <= ly + 1e-3 && y > best) best = y;
    }
    // the deck under the island footprint outside the drawn floors (nothing: the flight deck is a slab there)
    return best;
  };
  // collision walls: static, the chains at the openings whose lift is not down, the doors as they stand
  const _out = [], statics = walls.map(w => w.b);
  const doorBox = D => {   // a hinged leaf in the ship frame as an axis-aligned box: across the opening shut, against the wall open
    const d = D.d; if (d.horizontal) return null;
    const open = D.a > 0.45, t = 0.08;
    if (d.ax === 'v') {   // the wall runs along z at x = d.u
      if (!open) return [X(d.u) - t, X(d.u) + t, Z(d.v - d.w / 2), Z(d.v + d.w / 2), Y(d.y), Y(d.y + d.h)];
      const hz = d.v + (d.hinge || 1) * d.w / 2, sx = d.swing || 1;
      return [X(d.u) + Math.min(0, sx * d.w), X(d.u) + Math.max(0, sx * d.w), Z(hz) - t, Z(hz) + t, Y(d.y), Y(d.y + d.h)];
    }
    if (!open) return [X(d.u - d.w / 2), X(d.u + d.w / 2), Z(d.v) - t, Z(d.v) + t, Y(d.y), Y(d.y + d.h)];
    const hx = d.u + (d.hinge || 1) * d.w / 2, sz = d.swing || 1;
    return [X(hx) - t, X(hx) + t, Z(d.v) + Math.min(0, sz * d.w), Z(d.v) + Math.max(0, sz * d.w), Y(d.y), Y(d.y + d.h)];
  };
  INT.boxes = () => {
    _out.length = 0;
    for (const b of statics) _out.push(b);
    for (const c of chains) if (!(c.o.L.y < H.y + 0.3)) _out.push(c.b);
    for (const D of doorsList) { const b = doorBox(D); if (b) _out.push(b); }
    return _out;
  };
  // ladders: GR's format; the hatch must be open to use the bridge ladder
  INT.laddersOpen = () => ladders.filter(L => !L.open || L.open());
  // on an inclined ladder (the walker climbs it at a ladder's pace, not a hill's): ship-frame point
  INT.stairAt = (lx, ly, lz) => { if (!INT.zoneOf(lx, ly, lz)) return false; for (const f of floors) if (f.ry && lx >= f.x0 && lx <= f.x1 && lz >= f.z0 && lz <= f.z1) { const y = f.ry[0] + (f.ry[1] - f.ry[0]) * (lz - f.z0) / (f.z1 - f.z0); if (Math.abs(y - ly) < 0.35) return true; } return false; };
  INT.near = (lx, lz) => lx > -16 && lx < 16 && lz > -40 && lz < 55;
  return INT;
}
