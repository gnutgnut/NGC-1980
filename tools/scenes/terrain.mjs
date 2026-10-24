// TERRAIN (wave 3): the 17 islands rebuilt - beaches, cliffs, dunes, valleys, surface types, and everything that sits on
// them still working.   node snap.mjs scenes/terrain.mjs      [PARTS=api,views,fps to run some of it]
// - the surface API (GR.surfaceAt / GR.sample / GR.surfAt) answers sand, wet sand, rock, grass, road, water where they are
// - every island has a landing beach the LCM-8 can use (the old concrete hards are gone)
// - pads flat at their height, shaft holes open, the ground over every cave at or above the base
// - WORLD's roads and village lots sit on the ground (no floating, no burying)
// - screenshots: beaches, a cliff coast with stacks, the sandy fuel cay, a village, the pad, near-ground detail
// - fps with the camera low over a beach (the 1.25 m fine grid in view) and high over the zone
export const query = '?debug&kb&peace&res=0.6&nofog';
export default async function (h) {
  await h.goto(query);
  await h.waitFor('window.__G', 20000);
  await h.key('tap', 'Enter'); await h.wait(1200);
  await h.waitFor("__G.G.state === 'play'", 10000);
  const parts = (process.env.PARTS || 'all').split(','), want = p => parts.includes(p) || parts.includes('all');
  await h.eval(`(async () => {
    window.__T = await import('./js/world/terrain.js');
    const r = __G.renderer, orig = r.render.bind(r), T = __G.THREE, a = new T.Vector3(), b = new T.Vector3();
    r.render = (sc, cam) => { const C = window.__cam; if (C) { a.set(...C.wp); b.set(...C.wt); cam.position.copy(a); cam.up.set(0, 1, 0); cam.lookAt(b); cam.updateMatrixWorld(); } orig(sc, cam); };
    // the terrain windows follow the player's camera: park the Huey 40 m over the shot (hover collective)
    window.__shot = (wp, wt) => { window.__cam = { wp, wt }; __G.H.reset(new T.Vector3(wp[0], Math.max(wp[1], __G.terrainH(wp[0], wp[2])) + 40, wp[2]), 0, false, 1); __G.HI.setCollective(0.475); };
    window.__isl = n => __G.ISLANDS.find(I => I.name === n);
    window.__coast = (I, a, off = 0) => { const c = Math.cos(a), s = Math.sin(a); let d = I.r + 120; for (; d > 5; d -= 0.5) if (__G.terrainH(I.x + c * d, I.z + s * d) > 0) break; d += off; return [I.x + c * d, I.z + s * d]; };
    return { load: __G.PROF_LOAD, beaches: __T.beaches().length };
  })()`);

  if (want('api')) {
    // ---- load cost
    await h.eval('__G.PROF_LOAD');
    await h.expect('__G.PROF_LOAD.terrainBake < 4000 && __G.PROF_LOAD.hmBake < 4000', 'the island bake and the heightmap bake stay under 4 s each (headless)');
    // ---- every island has a landing beach with sand on it and open water off it
    await h.eval(`__G.HARDS.map(B => ({ n: B.name, u1: B.u1, run: B.runIn, w: Math.round(B.w), y: [0, 6, 12, 20].map(u => +B.y(u).toFixed(2)), sea: [-10, -25, -40].map(u => +B.y(u).toFixed(1)), surf: [2, 8, 14].map(u => { const p = B.at(u); return __G.GR.surfaceAt(p[0], p[1]); }) }))`);
    await h.expect(`__G.ISLANDS.every(I => __G.HARDS.some(B => B.I === I))`, 'every island has a landing beach');
    await h.expect(`__G.HARDS.filter(B => B.main).every(B => { const g = (B.y(12) - B.y(0)) / 12; return g > 0.03 && g < 0.12 && B.y(-25) < -1.0 && B.runIn >= 200; })`, 'landing beaches: a 1 in 8 - 1 in 30 foreshore, 1 m of water 25 m out, 200 m of clear run-in');
    await h.expect(`__G.HARDS.filter(B => B.main).every(B => { const p = B.at(8); return ['sand', 'wetsand'].includes(__G.GR.surfaceAt(p[0], p[1])); })`, 'sand on every landing beach');
    // ---- the surface API in the places that matter
    await h.eval(`(() => { const I = __isl('HOME ISLAND'), B = __G.HARDS.find(b => b.I === I), out = {};
      const at = (k, x, z) => { const s = __G.GR.sample(x, z); out[k] = { surf: s.surface, bed: s.bed, mu: s.mu, crr: s.crr, skid: s.skid, h: +s.h.toFixed(2) }; };
      let p = B.at(1); at('swash', p[0], p[1]); p = B.at(10); at('beach', p[0], p[1]); p = B.at(-15); at('offshore', p[0], p[1]);
      at('pad', I.pad.x, I.pad.z); const inf = __T.islandInfo(I); const cl = inf.cliffs[0]; if (cl) { const c = __coast(I, cl.a, -2); at('cliffTop', c[0], c[1]); }
      const pk = inf.peaks[0]; if (pk) at('peak', pk.x, pk.z);
      // what the island is made of: the share of each surface over its land
      const n = {}; let tot = 0; for (let x = I.x - I.r - 20; x < I.x + I.r + 20; x += 3) for (let z = I.z - I.r - 20; z < I.z + I.r + 20; z += 3) { if (__G.terrainH(x, z) <= 0) continue; const s = __G.GR.surfaceAt(x, z); n[s] = (n[s] || 0) + 1; tot++; }
      for (const k in n) n[k] = +(n[k] / tot).toFixed(3); out.share = n; window.__api = out; return out; })()`);
    await h.expect(`['wetsand', 'sand'].includes(__api.swash.surf) && __api.beach.surf === 'sand' && __api.offshore.surf === 'water' && ['sand', 'shingle'].includes(__api.offshore.bed) && __api.pad.surf === 'road'`, 'swash / beach sand / water over a sandy bed / concrete pad');
    await h.expect(`Object.keys(__api.share).length >= 5 && __api.share.grass > 0.3 && __api.share.sand > 0.03 && __api.share.rock > 0.02`, 'HOME ISLAND is grass, sand, rock and more');
    await h.expect(`__api.beach.crr > __api.pad.crr * 5 && __api.beach.skid > __api.pad.skid && __G.GR.surfAt(__G.HOME_B.isl.pad.x, __G.HOME_B.isl.pad.z).mu > 0.8`, 'sand rolls hard and holds skids; concrete grips');
    // each sim's own name for the surface it stands on
    await h.eval(`(() => { const S = __T.SURFACE; return Object.fromEntries(Object.entries(S).map(([k, v]) => [k, [v.tyre, v.soil, v.foot]])); })()`);
    // ---- pads, shafts, caves
    await h.eval(`__G.PADS.map(p => ({ n: p.isl.name, h: p.h, c: +__G.terrainH(p.x, p.z).toFixed(2), r20: +Math.max(...[0, 1, 2, 3, 4, 5, 6, 7].map(k => Math.abs(__G.terrainH(p.x + Math.cos(k * 0.785) * (p.isl.cave ? 10 : 20), p.z + Math.sin(k * 0.785) * (p.isl.cave ? 10 : 20)) - p.h))).toFixed(2) }))`);
    await h.expect(`__G.PADS.every(p => Math.abs(__G.terrainH(p.x, p.z) - p.h) < 0.05 && [0, 1, 2, 3, 4, 5, 6, 7].every(k => Math.abs(__G.terrainH(p.x + Math.cos(k * 0.785) * (p.isl.cave ? 10 : 20), p.z + Math.sin(k * 0.785) * (p.isl.cave ? 10 : 20)) - p.h) < 0.3))`, 'every pad flat at its height');
    await h.expect(`__G.BASES.every(b => __G.GR.surfaceAt(b.x, b.z) === 'hole' && [-70, -40, 40, 70].every(dx => __G.terrainH(b.x + dx, b.z) >= b.h - 0.05))`, 'shaft holes open, ground over each cave at or above the base');
    // ---- WORLD's roads and village lots on the new ground
    await h.eval(`(async () => { const N = await import('./js/world/net.js'); const bad = [], n = { roads: 0, pts: 0, lots: 0 };
      for (const site of N.netState.zoneSites) for (const id of site.roads) { const R = N.roadById(id); n.roads++; for (let i = 0; i < R.xs.length; i += 2) { if (R.br[i]) continue; n.pts++; const d = R.ys[i] - __G.terrainH(R.xs[i], R.zs[i]); if (Math.abs(d) > 0.25) bad.push([site.I.name, Math.round(R.xs[i]), Math.round(R.zs[i]), +d.toFixed(2)]); } }
      window.__roads = { ...n, bad: bad.length, worst: bad.slice(0, 6) }; return window.__roads; })()`);
    await h.expect('__roads.roads >= 10 && __roads.bad <= Math.ceil(__roads.pts * 0.03)', 'zone roads lie on the ground (road bed within 0.25 m of terrainH; a village lot platform may overlap a back street)');
    // the zone's buildings (village lots, cottages, lighthouses) stand on their footings: the ground under a building's
    // centre within 0.6 m of its floor level (cut and fill platforms are part of the ground)
    await h.eval(`(() => { const out = { n: 0, bad: [] }; for (const e of __WORLD.zone) for (const it of e.items) { if (!['house', 'cottage', 'lighthouse', 'church', 'shop', 'barn', 'pub'].includes(it.t) || it.y === undefined || !it.w) continue; out.n++;
        const c = Math.cos(it.yaw), s = Math.sin(it.yaw), g = [[0, 0], [-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].map(([u, v]) => __G.terrainH(it.x + c * u * it.w + s * v * it.d, it.z - s * u * it.w + c * v * it.d));
        const lo = Math.min(...g), hi = Math.max(...g), float = it.y - (it.drop || 0) - lo, bury = hi - it.y;   // the plinth reaches the ground, the floor is above it
        if (float > 0.15 || bury > 0.1) out.bad.push([it.t, Math.round(it.x), Math.round(it.z), +float.toFixed(2), +bury.toFixed(2)]); } out.nb = out.bad.length; out.bad = out.bad.slice(0, 8); window.__lots = out; return out; })()`);
    await h.expect('__lots.n >= 20 && __lots.nb <= Math.ceil(__lots.n * 0.05)', 'zone buildings sit on the ground (plinth to the lowest corner, floor over the highest)');
    // ---- the LCM-8 lands armour on a beach (the plan finds the island's landing beach, ramp toe in shallow water)
    await h.eval(`(() => { const out = []; for (const I of __G.ISLANDS) { const pl = __G.armDelivery.plan(I); out.push(pl ? { n: I.name, beach: pl.beach.name, viaBeach: !!pl.hard, toe: +__G.terrainH(pl.stop[0] + Math.sin(pl.yaw) * -14, pl.stop[1] + Math.cos(pl.yaw) * -14).toFixed(2), down: +pl.down.toFixed(2) } : { n: I.name, plan: null }); } window.__lcm = out; return out; })()`);
    await h.expect(`__lcm.filter(p => p.beach).length >= 15 && __lcm.find(p => p.n === 'HOME ISLAND').viaBeach`, 'the LCM-8 can land on (nearly) every island, HOME on its landing beach');
  }

  if (want('views')) {
    const sh = async (name, wp, wt, ms = 2600) => { await h.eval(`(__shot(${JSON.stringify(wp)}, ${JSON.stringify(wt)}), 1)`); await h.wait(ms); await h.shot(name); };
    const B = await h.eval(`(() => { const B = __G.HARDS.find(b => b.I === __G.HOME_B.isl); return { sea: B.at(-70, -25), top: B.at(30, 10), mid: B.at(10), low: B.at(-12, 6), dunes: B.at(36) }; })()`);
    // the landing beach from the sea, low, as the LCM-8 sees it
    await sh('home-beach-from-sea', [B.sea[0], 9, B.sea[1]], [B.top[0], 4, B.top[1]]);
    await h.notblank(0.05);
    // standing on it: near-ground detail (the fine grid), wet sand, berm, dunes
    await sh('home-beach-ground', [B.low[0], 1.9, B.low[1]], [B.dunes[0], 3.5, B.dunes[1]]);
    // the cliff coast with its stacks
    const C = await h.eval(`(() => { for (const n of ['HOME ISLAND', 'NORTH ROCK', 'CITADEL', 'IRONHOLD', 'SOUTH REEF', 'LOOKOUT']) { const I = __isl(n), cl = __T.islandInfo(I).cliffs[0]; if (!cl) continue; const c = __coast(I, cl.a); const o = [I.x + Math.cos(cl.a + 0.35) * (I.r + 75), I.z + Math.sin(cl.a + 0.35) * (I.r + 75)]; return { n, from: [o[0], 14, o[1]], to: [c[0], 6, c[1]] }; } })()`);
    await sh(`cliffs-${C.n.replace(/ /g, '-').toLowerCase()}`, C.from, C.to);
    // the sandy fuel cay (PELICAN), from above
    const P = await h.eval(`(() => { const I = __isl('PELICAN'); return { from: [I.x + 120, 70, I.z + 110], to: [I.x, 0, I.z] }; })()`);
    await sh('pelican-cay', P.from, P.to);
    // a big island from altitude: bays, valleys, peaks, cliffs
    for (const n of ['HOME ISLAND', 'CITADEL']) {
      const V = await h.eval(`(() => { const I = __isl('${n}'); return { from: [I.x - 110, 95, I.z + 125], to: [I.x, 0, I.z] }; })()`);
      await sh(`overview-${n.replace(/ /g, '-').toLowerCase()}`, V.from, V.to, 3200);
    }
    // a village on the new ground
    const Vg = await h.eval(`(async () => { const N = await import('./js/world/net.js'); const s = N.netState.zoneSites.find(s => s.village); if (!s) return null; const V = s.village, I = s.I, a = Math.atan2(V.z - I.z, V.x - I.x); return { n: I.name, from: [V.x + Math.cos(a) * 70, V.y + 28, V.z + Math.sin(a) * 70], to: [V.x, V.y, V.z] }; })()`);
    if (Vg) await sh('village', Vg.from, Vg.to, 3200);
    // the home pad and the shaft apron (unchanged)
    const Pd = await h.eval(`(() => { const p = __G.HOME_B.isl.pad; return { from: [p.x + 55, p.h + 22, p.z + 60], to: [p.x, p.h, p.z - 20] }; })()`);
    await sh('home-pad', Pd.from, Pd.to);
  }

  if (want('fps')) {
    const fps = async (label) => {
      await h.eval(`(window.__ft = [], window.__lt = performance.now(), (function f(t) { __ft.push(t - __lt); __lt = t; if (__ft.length < 80) requestAnimationFrame(f); })(performance.now()), 1)`);
      await h.waitFor('window.__ft.length >= 80', 60000);
      return h.eval(`(() => { const a = __ft.slice(5).sort((x, y) => x - y), avg = a.reduce((s, x) => s + x, 0) / a.length; return { view: '${label}', avgMs: +avg.toFixed(1), fps: +(1000 / avg).toFixed(1), p90: +a[Math.floor(a.length * 0.9)].toFixed(1), tris: __G.renderer.info.render.triangles, calls: __G.renderer.info.render.calls }; })()`);
    };
    const B = await h.eval(`(() => { const B = __G.HARDS.find(b => b.I === __G.HOME_B.isl); return { low: B.at(-20, 0), to: B.at(60) }; })()`);
    await h.eval(`(__shot([${B.low[0]}, 6, ${B.low[1]}], [${B.to[0]}, 4, ${B.to[1]}]), 1)`); await h.wait(2000);
    await fps('low over the landing beach');
    await h.eval(`(__shot([${B.low[0]}, 180, ${B.low[1]}], [${B.to[0]}, 0, ${B.to[1]}]), 1)`); await h.wait(2000);
    await fps('180 m over the island');
    await h.eval('(window.__cam = null, 1)');
  }
}
