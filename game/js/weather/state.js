// WEATHER: the weather over the war (pure JS: no THREE, no DOM; node-testable, tools/weatherbench.mjs).
//
// Seven weathers of a summer archipelago at sea, each a set of numbers the renderer, the sea and the sims read:
//   clear      a few fair-weather cumulus, long visibility, a light breeze
//   scattered  scattered cumulus (3-4 oktas) at ~900 m
//   overcast   a grey stratocumulus deck (8 oktas) at ~520 m: aircraft climb through it into sunshine
//   drizzle    low stratus at ~330 m, fine drops, misty
//   rain       nimbostratus at ~300 m, steady rain, 2-3 km visibility
//   storm      a thunderstorm: cumulonimbus base ~260 m, heavy rain, gusts, lightning
//   seafog     advection fog: mist banks lying on the water, a calm sea, the sun a white disc through it
// Changing weather blends every number from where it is now to the new weather's over `blend` seconds (no jumps).
// With DRIFT on, the weather wanders by itself (a Markov chain of plausible successions, 4-10 min each).
//
// The sea agrees: each weather has a sea-state range (a storm raises at least a rough sea, sea fog needs a calm one);
// the sea the player chose in the pause menu is pulled into that range (seaTarget). The wind is the Beaufort wind of
// the sea state actually running (so the wind you feel is the wind that raised the waves you see), blowing the way
// the waves travel, plus the weather's gusts. Numbers: Beaufort / WMO sea-state code 3700 (as in seasurface.js);
// visibility classes (WMO-No. 8: fog < 1 km, mist 1-5 km, haze), cloud bases typical of each cloud type (WMO cloud
// atlas: St 0-500 m, Sc 500-1500 m, Ns 300-1000 m, Cb base 300-1500 m, Cu 600-1500 m) - INFERRED, game-scaled low so
// the ceilings come into play in a game whose aircraft fly at 50-600 m.
export const WX_NAMES = ['clear', 'scattered', 'overcast', 'drizzle', 'rain', 'storm', 'seafog'];
export const WX_LABEL = { clear: 'CLEAR', scattered: 'SCATTERED CLOUD', overcast: 'OVERCAST', drizzle: 'DRIZZLE', rain: 'RAIN', storm: 'THUNDERSTORM', seafog: 'SEA FOG' };

// the numbers per weather (every one blends):
//   cover 0..1 cloud cover; base m cloud base; thick m deck thickness; vis m visibility; haze 0..1 how milky the air
//   is short of the visibility; rain 0..1 rate (drizzle: fine drops); drop 0..1 drop size; gust 0..1 gust factor;
//   bolt flashes per minute; sun 0..1 direct sun; mist 0..1 low fog lying on the sea; mistH m its depth;
//   sky [r,g,b] horizon and zen [r,g,b] zenith colours (display space); dark 0..1 how much the light is cut; sea [lo, hi]
export const WX = {
  clear:     { cover: 0.12, base: 1100, thick: 500, vis: 40000, haze: 0.10, rain: 0, drop: 0.6, gust: 0.12, bolt: 0, sun: 1.0, mist: 0.0, mistH: 25, sky: [0.75, 0.85, 0.95], zen: [0.22, 0.42, 0.85], dark: 0.0, sea: [0, 4] },
  scattered: { cover: 0.42, base: 900, thick: 600, vis: 30000, haze: 0.18, rain: 0, drop: 0.6, gust: 0.2, bolt: 0, sun: 0.92, mist: 0.0, mistH: 25, sky: [0.74, 0.83, 0.92], zen: [0.27, 0.45, 0.82], dark: 0.05, sea: [1, 5] },
  overcast:  { cover: 0.97, base: 520, thick: 700, vis: 14000, haze: 0.38, rain: 0, drop: 0.6, gust: 0.25, bolt: 0, sun: 0.28, mist: 0.05, mistH: 30, sky: [0.68, 0.71, 0.74], zen: [0.54, 0.57, 0.62], dark: 0.3, sea: [2, 5] },
  drizzle:   { cover: 1.0, base: 330, thick: 600, vis: 3500, haze: 0.6, rain: 0.3, drop: 0.15, gust: 0.25, bolt: 0, sun: 0.18, mist: 0.25, mistH: 40, sky: [0.63, 0.66, 0.68], zen: [0.5, 0.53, 0.56], dark: 0.42, sea: [2, 4] },
  rain:      { cover: 1.0, base: 300, thick: 1200, vis: 2200, haze: 0.66, rain: 0.68, drop: 0.6, gust: 0.35, bolt: 0, sun: 0.12, mist: 0.15, mistH: 35, sky: [0.55, 0.58, 0.61], zen: [0.42, 0.45, 0.49], dark: 0.52, sea: [3, 6] },
  storm:     { cover: 1.0, base: 260, thick: 2500, vis: 1100, haze: 0.78, rain: 1.0, drop: 1.0, gust: 0.6, bolt: 7, sun: 0.04, mist: 0.1, mistH: 30, sky: [0.38, 0.41, 0.44], zen: [0.24, 0.26, 0.3], dark: 0.72, sea: [5, 7] },
  seafog:    { cover: 0.55, base: 700, thick: 400, vis: 5000, haze: 0.5, rain: 0, drop: 0.6, gust: 0.08, bolt: 0, sun: 0.45, mist: 1.0, mistH: 70, sky: [0.8, 0.82, 0.84], zen: [0.5, 0.6, 0.78], dark: 0.12, sea: [0, 2] },
};
const KEYS = ['cover', 'base', 'thick', 'vis', 'haze', 'rain', 'drop', 'gust', 'bolt', 'sun', 'mist', 'mistH', 'dark'];
// Beaufort mid-range wind (m/s at 10 m) that raises each sea state (seasurface.js table: SS3 ~ Bf 3-4 ... SS7 ~ Bf 7-8)
export const SEA_WIND = [0.6, 2.2, 4.4, 6.5, 8.8, 11.6, 14.6, 18.3];
// what can follow what (drift): [next, weight]
const NEXT = {
  clear: [['scattered', 0.75], ['seafog', 0.25]],
  scattered: [['clear', 0.35], ['overcast', 0.5], ['seafog', 0.15]],
  overcast: [['scattered', 0.35], ['drizzle', 0.3], ['rain', 0.35]],
  drizzle: [['overcast', 0.45], ['rain', 0.4], ['seafog', 0.15]],
  rain: [['storm', 0.3], ['overcast', 0.3], ['drizzle', 0.4]],
  storm: [['rain', 1]],
  seafog: [['clear', 0.45], ['scattered', 0.35], ['overcast', 0.2]],
};
export const WX_T = {
  blend: 90,            // s: a drifted change takes this long (the sky closes in over a minute and a half)
  pick: 25,             // s: a weather picked in the menu
  stay: [240, 600],     // s: how long a drifted weather lasts
  wetUp: 1 / 70,        // wetness per second per unit rain (surfaces soak in about a minute of steady rain)
  dryDown: 1 / 420,     // wetness lost per second when it stops (puddles and decks dry over ~7 min)
  seaRate: 1 / 45,      // sea states per second when the weather drags the sea into its range
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

export function createWeatherState(name = 'clear', seed = 1980) {
  const r = rng(seed);
  const snap = n => { const P = WX[n], o = { sky: P.sky.slice(), zen: P.zen.slice(), sea: P.sea.slice() }; for (const k of KEYS) o[k] = P[k]; return o; };
  const S = {
    name, from: snap(name), to: snap(name), p: snap(name), t: 1, T: 1, drift: false, nextT: 0, time: 0,
    wet: 0, windDir: 0, windSpd: 0, gust: 0, gustPh: 0, boltT: 5,
    // set the weather: blends from wherever the sky is now to `n` over `secs` (0 = at once)
    set(n, secs = WX_T.pick) {
      if (!WX[n]) return false;
      S.from = Object.assign(snap(S.name), { sky: S.p.sky.slice(), zen: S.p.zen.slice() }); for (const k of KEYS) S.from[k] = S.p[k];
      S.name = n; S.to = snap(n); S.t = 0; S.T = Math.max(1e-6, secs);
      if (secs <= 0) { S.t = S.T; S.p = snap(n); }
      S.nextT = S.time + WX_T.stay[0] + r() * (WX_T.stay[1] - WX_T.stay[0]);
      return true;
    },
    setDrift(on) { S.drift = !!on; if (on) S.nextT = S.time + WX_T.stay[0] + r() * (WX_T.stay[1] - WX_T.stay[0]); },
    // the next weather the drift would choose from `n` (weighted)
    successor(n = S.name) { const L = NEXT[n]; let x = r(), k = 0; for (; k < L.length - 1; k++) { x -= L[k][1]; if (x < 0) break; } return L[k][0]; },
    // the sea state this weather wants given the player's choice (pulled into the weather's range)
    seaTarget(choice) { return clamp(choice, S.to.sea[0], S.to.sea[1]); },
    // advance. env: { seaSS (running sea state), seaDir (rad, the waves travel towards it) }. returns the change
    // event { name, msg } when the drift picked a new weather, else null.
    step(dt, env = {}) {
      S.time += dt; let ev = null;
      if (S.drift && S.time >= S.nextT) { const n = S.successor(); S.set(n, WX_T.blend); ev = { name: n, msg: `WEATHER: ${forecast(n)}` }; }
      if (S.t < S.T) {
        S.t = Math.min(S.T, S.t + dt); const k = smooth(S.t / S.T), A = S.from, B = S.to;
        // the cloud closes in first and the rain comes after it (and stops before it clears): rain lags the cover
        for (const key of KEYS) S.p[key] = lerp(A[key], B[key], key === 'rain' || key === 'bolt' ? smooth(clamp((S.t / S.T - (B.rain > A.rain ? 0.35 : 0)) / 0.65, 0, 1)) : k);
        S.p.vis = Math.exp(lerp(Math.log(A.vis), Math.log(B.vis), k));   // visibility blends on a log scale (40 km -> 170 m is a slow close-in, not a cliff)
        for (let i = 0; i < 3; i++) { S.p.sky[i] = lerp(A.sky[i], B.sky[i], k); S.p.zen[i] = lerp(A.zen[i], B.zen[i], k); }
      }
      // surfaces soak up and dry off
      S.wet = clamp(S.p.rain > 0.02 ? S.wet + dt * WX_T.wetUp * (0.3 + S.p.rain) : S.wet - dt * WX_T.dryDown, 0, 1);
      // the wind: the sea's own (Beaufort for the running sea state), along the waves, with gusts on top
      const ss = env.seaSS ?? 3, i = clamp(Math.floor(ss), 0, 6), f = clamp(ss - i, 0, 1);
      const base = lerp(SEA_WIND[i], SEA_WIND[i + 1], f);
      S.windDir = env.seaDir ?? S.windDir;
      // gusts: two incommensurate slow waves and a sharper one in a storm (game-level, not a turbulence model)
      S.gustPh += dt;
      const g = S.p.gust, q = Math.sin(S.gustPh * 0.53) * 0.5 + Math.sin(S.gustPh * 1.37 + 1.3) * 0.35 + Math.max(0, Math.sin(S.gustPh * 0.21)) ** 6 * 1.2;
      S.gust = g * q; S.windSpd = Math.max(0, base * (1 + S.gust));
      // lightning: a flash due when the count runs out (Poisson at the weather's rate)
      if (S.p.bolt > 0.05) { S.boltT -= dt; } else S.boltT = Math.max(S.boltT, 2);
      return ev;
    },
    // true once per flash (the caller draws it and sets off the thunder); the next one is drawn from the rate
    takeBolt() { if (S.p.bolt <= 0.05 || S.boltT > 0) return false; S.boltT = -Math.log(1 - r() * 0.98) * 60 / S.p.bolt; return true; },
    rand: r,
    // the wind as a world vector (m/s): travelling the way the waves travel, (-sin dir, -cos dir)
    wind(out = { x: 0, z: 0 }) { out.x = -Math.sin(S.windDir) * S.windSpd; out.z = -Math.cos(S.windDir) * S.windSpd; return out; },
    get label() { return WX_LABEL[S.name]; },
    get blending() { return S.t < S.T; },
  };
  return S;
}
export function forecast(n) {
  return { clear: 'CLEARING  -  GOOD VISIBILITY', scattered: 'SCATTERED CLOUD BUILDING', overcast: 'CLOUDING OVER  -  CEILING LOWERING', drizzle: 'DRIZZLE AND LOW STRATUS', rain: 'RAIN SETTING IN  -  VISIBILITY FALLING', storm: 'THUNDERSTORM APPROACHING  -  GUSTS, LIGHTNING', seafog: 'SEA FOG ROLLING IN' }[n] || n.toUpperCase();
}
