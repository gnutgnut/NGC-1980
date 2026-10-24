// The archipelago: open sea with islands. Every height query (JS physics and the GLSL terrain shader) comes from the
// same island list, so what you see is what you collide with. Islands are static; who owns them is game state (war.js).
//
// kinds:  hq        - a side's headquarters island; has a cave (home reservoir / enemy fortress). Taken only via its cave.
//         fortress  - enemy-held cave fortress: steal its pod (the command core) from the cave to take the island.
//         fuel      - oil derricks: fuel for the fleet's stores
//         factory   - materiel for drones, guns and helicopters (enemy factories also build the battleship)
//         radar     - long-range sight through the fog of war
import { roadBed } from './world/net.js';   // the lived-in world (roads, towns, farms): flattened into islandH below
import { zoneH } from './world/terrain.js';  // TERRAIN (wave 3): the islands' real ground (geology, beaches, cliffs, valleys)
export const BOUND = 640, SEA_FLOOR = -14;
export const ISLANDS = [
  { name: 'HOME ISLAND', kind: 'hq', owner: 1, x: -420, z: 400, r: 130, tier: 0 },
  { name: 'IRONHOLD', kind: 'hq', owner: 2, x: 420, z: -400, r: 130, tier: 4 },
  { name: 'NORTH ROCK', kind: 'fortress', owner: 2, x: -400, z: -360, r: 112, tier: 1 },
  { name: 'SOUTH REEF', kind: 'fortress', owner: 2, x: 400, z: 360, r: 112, tier: 2 },
  { name: 'CITADEL', kind: 'fortress', owner: 2, x: 0, z: 0, r: 122, tier: 3 },
  { name: 'PELICAN', kind: 'fuel', owner: 1, x: -170, z: 480, r: 62 },
  { name: 'ANVIL', kind: 'factory', owner: 2, x: 170, z: -480, r: 62 },
  { name: 'LOOKOUT', kind: 'radar', owner: 0, x: -540, z: 110, r: 58 },
  { name: 'BEACON', kind: 'radar', owner: 0, x: 540, z: -110, r: 58 },
  { name: 'FORGE', kind: 'factory', owner: 0, x: -210, z: 190, r: 66 },
  { name: 'CINDER', kind: 'factory', owner: 0, x: 210, z: -190, r: 66 },
  { name: 'WELLSPRING', kind: 'fuel', owner: 0, x: -150, z: -230, r: 60 },
  { name: 'SANDBAR', kind: 'fuel', owner: 0, x: 150, z: 230, r: 60 },
  { name: 'DRIFTWOOD', kind: 'factory', owner: 0, x: -560, z: -130, r: 56 },
  { name: 'KILN', kind: 'factory', owner: 0, x: 560, z: 130, r: 56 },
  { name: 'SPIRE', kind: 'radar', owner: 0, x: -60, z: -560, r: 54 },
  { name: 'ECHO', kind: 'radar', owner: 0, x: 60, z: 560, r: 54 },
];
ISLANDS.forEach((I, i) => { I.id = i; I.cave = I.kind === 'hq' || I.kind === 'fortress'; });

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
// rolling hills (the original Zarch landscape), only raised where there is an island
const hills = (x, z) => 14 * Math.sin(x * .035 + 1.3) * Math.cos(z * .04) + 9 * Math.sin(x * .09 + z * .07) + 5 * Math.sin(z * .13 - x * .05) + 2.5 * Math.sin(x * .31) * Math.sin(z * .27) + 8;
const wobble = (x, z) => 14 * Math.sin(x * .045 + z * .03) + 9 * Math.sin(z * .071 - x * .052);   // ragged coastlines
export function landMask(x, z) {
  const w = wobble(x, z); let m = 0;
  for (const I of ISLANDS) { const d = Math.hypot(x - I.x, z - I.z) + w; if (d < I.r) m = Math.max(m, 1 - sm(I.r * 0.55, I.r, d)); }
  return m;
}
// Beyond the archipelago (the control zone, where the war is) the world goes on for ever: continents with coasts,
// lowlands, forests and mountain ranges, from fixed-seed gradient noise (same world every run). It's open sea for a
// kilometre or two round the zone, then the land starts. Everything here is pure maths, so the terrain worker
// (terrainworker.js) bakes exactly what the physics collides with.
export const inZone = (x, z) => Math.max(Math.abs(x), Math.abs(z)) <= BOUND;
const PERM = (() => { const p = new Uint8Array(512), a = [...Array(256).keys()]; let s = 1234567; for (let i = 255; i > 0; i--) { s = (s * 1103515245 + 12345) >>> 0; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } for (let i = 0; i < 512; i++) p[i] = a[i & 255]; return p; })();
const GX = [1, -1, 1, -1, 1.414, -1.414, 0, 0], GZ = [1, 1, -1, -1, 0, 0, 1.414, -1.414];
export function noise(x, z) {   // 2D gradient noise, about -0.7..0.7
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, X = xi & 255, Z = zi & 255;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = zf * zf * zf * (zf * (zf * 6 - 15) + 10);
  const g = (h, dx, dz) => { h &= 7; return GX[h] * dx + GZ[h] * dz; };
  const a = g(PERM[PERM[X] + Z], xf, zf), b = g(PERM[PERM[X + 1] + Z], xf - 1, zf), c = g(PERM[PERM[X] + Z + 1], xf, zf - 1), d = g(PERM[PERM[X + 1] + Z + 1], xf - 1, zf - 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, oct) { let s = 0, a = 1, n = 0; for (let i = 0; i < oct; i++) { s += noise(x, z) * a; n += a; a *= 0.5; const t = x * 1.6 - z * 1.2; z = x * 1.2 + z * 1.6; x = t + 17.3; } return s / n; }
function ridged(x, z, oct) {   // sharp crests: 1 - |noise|, squared, each octave weighted by the last (rugged on the ridges)
  let s = 0, a = 1, w = 1, n = 0;
  for (let i = 0; i < oct; i++) { let r = 1 - Math.abs(noise(x, z)) * 1.6; r = r < 0 ? 0 : r * r; s += r * a * w; n += a; w = Math.min(1, r * 1.8); a *= 0.5; const t = x * 1.7 - z * 1.1; z = x * 1.1 + z * 1.7; x = t - 9.1; }
  return s / n;
}
// how far outside the zone, and the land: <0 sea, >0 land
function landness(x, z) { const d = Math.max(Math.abs(x), Math.abs(z)) - BOUND, near = sm(400, 2400, d); return { near, land: (fbm(x / 7000 + 31.7, z / 7000 - 12.3, 4) * 1.7 + 0.04) * near - (1 - near) * 0.5 }; }
export function wildH(x, z) {
  const { near, land } = landness(x, z);
  if (land < -0.12) return SEA_FLOOR - 26 * near * Math.min(1, -land * 2);     // open sea, deepening offshore
  const coast = sm(-0.02, 0.25, land);
  const low = 2 + coast * (40 + 45 * fbm(x / 1900 + 3.1, z / 1900 - 8.4, 3)) + coast * hills(x, z) * 0.5;   // plains and hills
  const belt = sm(-0.08, 0.24, fbm(x / 8000 - 7.1, z / 8000 + 3.3, 3));          // where the mountain ranges run
  const r = ridged(x / 2400, z / 2400, 5), mtn = belt * coast * r * r * 1700;   // ranges, peaks past 1 km
  return mix(SEA_FLOOR - 4, low + mtn, sm(-0.12, 0.0, land));
}
// forests: where the forest noise says so, on gentle slopes between the beach and the tree line (~360 m)
export function forestAt(x, z, h, slopeY) { return h > 3.5 && h < 360 - 60 * noise(x / 300, z / 300) && slopeY > 0.82 && fbm(x / 1700 + 5.5, z / 1700 + 9.2, 3) > -0.08; }
// rawH: the natural ground. islandH: the ground people built on - road beds, town squares, quays and farmyards are
// flattened in by world/net.js (the lived-in world), so physics, the terrain bake and the road ribbons all agree.
// TERRAIN (wave 3): inside the zone the natural ground is world/terrain.js's islands (a 1.25 m grid baked once per
// thread); the old dome islands (landMask, hills) stay below as rawH0, for reference only.
export const rawH = (x, z) => Math.max(Math.abs(x), Math.abs(z)) < BOUND + 300 ? zoneH(x, z) : wildH(x, z);
export const rawH0 = (x, z) => Math.max(Math.abs(x), Math.abs(z)) < BOUND + 300 ? mix(SEA_FLOOR, hills(x, z) * 0.7 + 9, landMask(x, z)) : wildH(x, z);
export const islandH = (x, z) => roadBed(x, z, rawH(x, z));
export const islandAt = (x, z, pad = 0) => ISLANDS.find(I => Math.hypot(x - I.x, z - I.z) < I.r + pad);

// the same, as GLSL (constants baked in: the islands never move)
const f = v => (+v).toFixed(2);
export const islandGLSL = `
float hills(vec2 p){return 14.*sin(p.x*.035+1.3)*cos(p.y*.04)+9.*sin(p.x*.09+p.y*.07)+5.*sin(p.y*.13-p.x*.05)+2.5*sin(p.x*.31)*sin(p.y*.27)+8.;}
float landMask(vec2 p){
  float w=14.*sin(p.x*.045+p.y*.03)+9.*sin(p.y*.071-p.x*.052), m=0.;
${ISLANDS.map(I => `  m=max(m,1.-smoothstep(${f(I.r * 0.55)},${f(I.r)},length(p-vec2(${f(I.x)},${f(I.z)}))+w));`).join('\n')}
  return m;
}
float islandH(vec2 p){ return mix(${f(SEA_FLOOR)}, hills(p)*.7+9., landMask(p)); }
`;

// --------------------------------------------------------------------------------------------- sea navigation
// Ships route over a coarse grid of deep-water cells (A*), so carriers sail round islands instead of beaching.
export function createNav(heightAt, { cell = 20, draft = -5, margin = 14 } = {}) {
  const N = Math.ceil(2 * BOUND / cell), ok = new Uint8Array(N * N);
  const cx = i => -BOUND + (i + 0.5) * cell;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = cx(i), z = cx(j); let wet = Math.abs(x) < BOUND - 25 && Math.abs(z) < BOUND - 25;
    for (const [ox, oz] of [[0, 0], [margin, 0], [-margin, 0], [0, margin], [0, -margin], [margin, margin], [-margin, -margin], [margin, -margin], [-margin, margin]]) if (wet && heightAt(x + ox, z + oz) > draft) wet = false;
    ok[j * N + i] = wet ? 1 : 0;
  }
  const idx = (x, z) => [Math.min(N - 1, Math.max(0, Math.floor((x + BOUND) / cell))), Math.min(N - 1, Math.max(0, Math.floor((z + BOUND) / cell)))];
  const nearestWet = (i, j) => {
    if (ok[j * N + i]) return [i, j];
    for (let r = 1; r < N; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < N && b < N && ok[b * N + a]) return [a, b];
    }
    return [i, j];
  };
  function lineClear(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / (cell * 0.5));
    for (let k = 1; k <= n; k++) { const [i, j] = idx(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n); if (!ok[j * N + i]) return false; }
    return true;
  }
  return {
    N, cell, ok, wet: (x, z) => { const [i, j] = idx(x, z); return !!ok[j * N + i]; },
    nearestWater(x, z) { const [i, j] = nearestWet(...idx(x, z)); return [cx(i), cx(j)]; },
    // world-space waypoints from (x0,z0) to (x1,z1), smoothed by line-of-sight
    path(x0, z0, x1, z1) {
      const [si, sj] = nearestWet(...idx(x0, z0)), [ti, tj] = nearestWet(...idx(x1, z1));
      const S = sj * N + si, T = tj * N + ti, g = new Float32Array(N * N).fill(1e9), from = new Int32Array(N * N).fill(-1), closed = new Uint8Array(N * N);
      const open = [S]; g[S] = 0;
      const hh = k => Math.hypot((k % N) - ti, Math.floor(k / N) - tj);
      let guard = 0;
      while (open.length && guard++ < 20000) {
        let bi = 0; for (let k = 1; k < open.length; k++) if (g[open[k]] + hh(open[k]) < g[open[bi]] + hh(open[bi])) bi = k;
        const c = open[bi]; open[bi] = open[open.length - 1]; open.pop();
        if (c === T) break; if (closed[c]) continue; closed[c] = 1;
        const ci = c % N, cj = Math.floor(c / N);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue; const a = ci + di, b = cj + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue;
          const k = b * N + a; if (!ok[k] || closed[k]) continue;
          if (di && dj && (!ok[cj * N + a] || !ok[b * N + ci])) continue;   // no squeezing diagonally between two land cells
          const ng = g[c] + (di && dj ? 1.414 : 1); if (ng < g[k]) { g[k] = ng; from[k] = c; open.push(k); }
        }
      }
      if (from[T] < 0 && T !== S) return [[x1, z1]];
      const cells = []; for (let k = T; k !== -1; k = from[k]) { cells.push([cx(k % N), cx(Math.floor(k / N))]); if (k === S) break; }
      cells.reverse();
      { const [oi, oj] = idx(x1, z1); if (ok[oj * N + oi] && cells.length) cells[cells.length - 1] = [x1, z1]; }   // the exact goal when it is open water
      const out = []; let ax = x0, az = z0;
      for (let k = 0; k < cells.length; k++) {
        const nx = cells[k + 1];
        if (nx && lineClear(ax, az, nx[0], nx[1])) continue;   // skip cells we can see past
        out.push(cells[k]); [ax, az] = cells[k];
      }
      return out.length ? out : [[x1, z1]];
    },
  };
}
