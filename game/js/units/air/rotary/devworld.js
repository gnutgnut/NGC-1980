// devworld.js - the test world for the rotary benches (tools/rotarymission.mjs) and the dev page (game/dev/rotary.html):
// one hilly island with a flat pad (an HQ and a factory beside it, like the game's islands), open sea, the ALBATROSS
// deck 8 m high steaming at 6 m/s and turning slowly 580 m from the island, and the KRAKEN 6.5 km out (the Osprey's
// home: a leg long enough for a full conversion to airplane mode and back). Pure JS.
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export function createDevWorld() {
  const PAD = { x: 520, z: -260, h: 6, r: 8.5 };
  const hills = (x, z) => 14 * Math.sin(x * .035 + 1.3) * Math.cos(z * .04) + 9 * Math.sin(x * .09 + z * .07) + 8;
  function terrain(x, z) {
    const d = Math.hypot(x - PAD.x, z - PAD.z), isl = clamp(1 - (d - 70) / 40, 0, 1);
    let h = -14 + (hills(x, z) * 0.9 + 14) * isl;
    if (d < 52) { const k = clamp((d - 30) / 22, 0, 1); h = PAD.h + (h - PAD.h) * k * k * (3 - 2 * k); }
    return h;
  }
  const mkDeck = (x, z, yaw, sp, w) => ({ x, z, yaw, sp, w, L: 120, W: 40, H: 8 });   // (40 m: room for the stick waiting on the port side, embark.js)
  const deck = mkDeck(0, 0, 1.0, 6, 0.004), kraken = mkDeck(-4000, 5150, 0.4, 5, 0), decks = [deck, kraken];
  const toLocalD = (d, x, z) => { const dx = x - d.x, dz = z - d.z, c = Math.cos(d.yaw), s = Math.sin(d.yaw); return [dx * c - dz * s, dx * s + dz * c]; };
  const toWorldD = (d, lx, lz) => { const c = Math.cos(d.yaw), s = Math.sin(d.yaw); return [d.x + lx * c + lz * s, d.z - lx * s + lz * c]; };
  const deckAt = (x, z) => decks.find(d => { const [lx, lz] = toLocalD(d, x, z); return Math.abs(lx) < d.W / 2 && Math.abs(lz) < d.L / 2; });
  const velOf = d => ({ vx: -Math.sin(d.yaw) * d.sp, vz: -Math.cos(d.yaw) * d.sp });
  const env = {
    groundY: (x, z) => Math.max(terrain(x, z), 0, deckAt(x, z) ? 8 : -1e9),
    water: (x, z) => !deckAt(x, z) && terrain(x, z) < 0,
    surfVel: (x, z) => { const d = deckAt(x, z); return d ? { ...velOf(d), w: d.w, cx: d.x, cz: d.z } : null; },
  };
  const world = { groundY: env.groundY, floorAlong(x, z, ux, uz, L) { let m = env.groundY(x, z); for (let s = 10; s <= L; s += 10) m = Math.max(m, env.groundY(x + ux * s, z + uz * s)); return m; },
    los(ax, ay, az, bx, by, bz) { const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 6); for (let i = 1; i < n; i++) { const k = i / n; if (env.groundY(ax + (bx - ax) * k, az + (bz - az) * k) > ay + (by - ay) * k) return false; } return true; } };
  // buildings beside the pad (on the line through it, like war.js puts the HQ and the factory)
  const structs = [{ kind: 'hq', x: PAD.x, z: PAD.z - 17, r: 7, h: 12 }, { kind: 'factory', x: PAD.x, z: PAD.z + 18, r: 8, h: 9 }];
  const spotOn = (d, lx, lz) => { const [x, z] = toWorldD(d, lx, lz), v = velOf(d); return { x, y: d.H, z, hdg: d.yaw, vx: v.vx - d.w * (z - d.z) * 0, vz: v.vz }; };
  return {
    PAD, deck, kraken, decks, terrain, env, world, structs, onDeck: (x, z) => !!deckAt(x, z),
    toWorld: (lx, lz) => toWorldD(deck, lx, lz), toLocal: (x, z) => toLocalD(deck, x, z),
    move(dt) { for (const d of decks) { d.x += -Math.sin(d.yaw) * d.sp * dt; d.z += -Math.cos(d.yaw) * d.sp * dt; d.yaw += d.w * dt; } },
    spot: (lx, lz) => spotOn(deck, lx, lz), krakenSpot: (lx, lz) => spotOn(kraken, lx, lz),
    // a landing zone beside the pad, perpendicular to the building line, tail toward the pad
    lz(off = 18) { return { x: PAD.x + off, y: PAD.h, z: PAD.z, hdg: -Math.PI / 2, vx: 0, vz: 0 }; },
  };
}
