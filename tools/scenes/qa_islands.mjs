// QA (ngc/qa-islands): a screenshot tour of the islands and the lived-in world, kept as a regression shot list.
//   node snap.mjs scenes/qa_islands.mjs            [PARTS=air,coast,zone,base,town,inside,sea  to run some of it]
// air:    islands from 300 m and 80 m          coast: beaches from the waterline, cliffs, coves, dunes, valleys
// zone:   a zone village street, cottages       base:  pads, AA revetments, fences, the quonset, cave mouths
// town:   wild towns from the air, pub, school, church, harbour, farm, a destroyed house, a street at eye level
// inside: house rooms, the pub, the church, the quonset barracks (the Marine on foot)
// sea:    the shallows from above and under water
// The camera is set at render time (window.__cam); the Huey is parked over the shot so the terrain windows and the
// world chunks follow. Each shot waits for the world to finish streaming and a number of rendered frames, not time.
export const query = '?debug&auto&kb&peace&res=0.6';
export default async function (h) {
  await h.goto(query);
  await h.waitFor("window.__G && __G.G.state === 'play' && __G.H.landed && window.__WORLD", 60000);
  const parts = (process.env.PARTS || 'all').split(','), want = p => parts.includes(p) || parts.includes('all');
  await h.eval(`(async () => {
    window.__T = await import('./js/world/terrain.js'); window.__L = await import('./js/world/layout.js'); window.__N = await import('./js/world/net.js');
    const r = __G.renderer, orig = r.render.bind(r), T = __G.THREE, a = new T.Vector3(), b = new T.Vector3();
    window.__fr = 0;
    window.__hud = on => { for (const e of document.body.children) if (e.tagName !== "CANVAS" && e.tagName !== "SCRIPT") e.style.visibility = on ? "" : "hidden"; return 1; }; __hud(false);   // clean frames for judging
    r.render = (sc, cam) => { const C = window.__cam; if (C && cam.isPerspectiveCamera) { a.set(...C.wp); b.set(...C.wt); cam.position.copy(a); cam.up.set(0, 1, 0); cam.lookAt(b); cam.updateMatrixWorld(); } orig(sc, cam); window.__fr++; };
    // park the Huey over the shot (a height hold on the collective) so the streaming follows the camera
    window.__park = (x, y, z) => { const G = __G; G.H.reset(new T.Vector3(x, y, z), 0, false, 1); G.HI.setCollective(0.45);
      clearInterval(window.__hold); window.__hold = setInterval(() => { const H = G.H; if (!H.pos || G.G.craft !== 'heli') return; const err = y - H.pos.y; G.HI.setCollective(Math.max(0.2, Math.min(0.7, 0.45 + err * 0.02 - H.vel.y * 0.04))); }, 50); };
    window.__shot = (wp, wt) => { window.__cam = { wp, wt }; if (__G.G.craft === 'heli') __park(wp[0], Math.max(wp[1], Math.max(0, __G.terrainH(wp[0], wp[2]))) + 45, wp[2]); window.__f0 = __fr; return 1; };
    window.__isl = n => __G.ISLANDS.find(I => I.name === n);
    window.__coast = (I, a, off = 0) => { const c = Math.cos(a), s = Math.sin(a); let d = I.r + 160; for (; d > 5; d -= 0.5) if (__G.terrainH(I.x + c * d, I.z + s * d) > 0) break; d += off; return [I.x + c * d, I.z + s * d]; };
    window.__ready = () => __WORLD.stats.pending === 0;
    return { islands: __G.ISLANDS.map(I => [I.name, Math.round(I.x), Math.round(I.z), Math.round(I.r), I.cave ? 'cave' : '', I.owner]) };
  })()`);
  const slug = s => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  // a shot: camera from wp at wt, world streamed, N frames rendered
  const sh = async (name, wp, wt, frames = 14) => {
    await h.eval(`__shot(${JSON.stringify(wp)}, ${JSON.stringify(wt)})`);
    await h.waitFor(`__fr - __f0 >= 3 && __ready()`, 90000).catch(() => {});
    await h.eval(`(window.__f0 = __fr, 1)`); await h.waitFor(`__fr - __f0 >= ${frames}`, 90000);
    await h.shot(name);
  };
  const gH = p => h.eval(`Math.max(0, __G.terrainH(${p[0]}, ${p[1]}))`);
  const islands = await h.eval('__G.ISLANDS.map(I => I.name)');

  if (want('air')) {
    // every few islands from 300 m and from 80 m (a three-quarter view from the sea side)
    for (const [k, n] of islands.entries()) {
      const V = await h.eval(`(() => { const I = __isl(${JSON.stringify(n)}), a = Math.atan2(I.z, I.x) + 0.4, c = Math.cos(a), s = Math.sin(a); return { hi: [I.x + c * (I.r + 260), 300, I.z + s * (I.r + 260)], lo: [I.x + c * (I.r + 90), 80, I.z + s * (I.r + 90)], t: [I.x, 0, I.z] }; })()`);
      if (k % 3 === 0) await sh(`air300-${slug(n)}`, V.hi, V.t);
      if (k % 2 === 0) await sh(`air80-${slug(n)}`, V.lo, V.t);
    }
  }

  if (want('coast')) {
    // landing beaches from the waterline, looking up the beach; from the dunes looking out
    for (const n of ['HOME ISLAND', 'CITADEL', 'PELICAN', islands[5], islands[9]]) {
      const B = await h.eval(`(() => { const I = __isl(${JSON.stringify(n)}), B = __G.HARDS.find(b => b.I === I && b.main) || __G.HARDS.find(b => b.I === I); if (!B) return null; return { w: B.at(-3), up: B.at(40), dune: B.at(34), sea: B.at(-60, 15), y: [B.y(-3), B.y(34)] }; })()`);
      if (!B) continue;
      await sh(`beach-waterline-${slug(n)}`, [B.w[0], 1.7, B.w[1]], [B.up[0], 3, B.up[1]]);
      if (n === 'HOME ISLAND' || n === 'CITADEL') await sh(`beach-from-dunes-${slug(n)}`, [B.dune[0], B.y[1] + 1.8, B.dune[1]], [B.sea[0], 0.5, B.sea[1]]);
    }
    // cliffs with their stacks, from the sea; a cove; a valley
    let nc = 0;
    for (const n of islands) {
      if (nc >= 3) break;
      const C = await h.eval(`(() => { const I = __isl(${JSON.stringify(n)}), cl = __T.islandInfo(I).cliffs[0]; if (!cl) return null; const c = __coast(I, cl.a); const o = [I.x + Math.cos(cl.a + 0.3) * (I.r + 70), I.z + Math.sin(cl.a + 0.3) * (I.r + 70)]; return { from: [o[0], 8, o[1]], to: [c[0], 6, c[1]], top: __coast(I, cl.a, -6), out: [o[0], 0, o[1]] }; })()`);
      if (!C) continue; nc++;
      await sh(`cliff-${slug(n)}`, C.from, C.to);
      if (nc === 1) await sh(`cliff-top-${slug(n)}`, [C.top[0], (await gH(C.top)) + 1.8, C.top[1]], C.out);
    }
    // a stream valley from its head, looking down to the bay
    const Vl = await h.eval(`(() => { for (const I of __G.ISLANDS) { const inf = __T.islandInfo(I); const v = inf.valleys && inf.valleys[0]; const B = __G.HARDS.find(b => b.I === I && b.main); if (!B) continue; const top = B.at(110), low = B.at(10); if (__G.terrainH(top[0], top[1]) < 3) continue; return { n: I.name, from: [top[0], __G.terrainH(top[0], top[1]) + 6, top[1]], to: [low[0], 1, low[1]] }; } })()`);
    if (Vl) await sh(`valley-${slug(Vl.n)}`, Vl.from, Vl.to);
  }

  if (want('zone')) {
    // the zone villages from 60 m, then at eye level in the street
    const S = await h.eval(`__N.netState.zoneSites.filter(s => s.village).slice(0, 6).map(s => { const V = s.village, I = s.I, a = Math.atan2(V.z - I.z, V.x - I.x); return { n: I.name, x: V.x, y: V.y, z: V.z, a }; })`);
    for (const [k, V] of S.entries()) {
      if (k > 3) break;
      await sh(`zone-village-${slug(V.n)}`, [V.x + Math.cos(V.a) * 70, V.y + 34, V.z + Math.sin(V.a) * 70], [V.x, V.y, V.z]);
      if (k < 2) await sh(`zone-village-street-${slug(V.n)}`, [V.x - Math.cos(V.a) * 14, V.y + 1.7, V.z - Math.sin(V.a) * 14], [V.x + Math.cos(V.a) * 30, V.y + 1.5, V.z + Math.sin(V.a) * 30]);
    }
    // lighthouses / rim cottages / jetties on the small islands
    const LH = await h.eval(`(() => { const out = []; for (const e of __WORLD.zone) for (const it of e.items) if (it.t === 'lighthouse' || it.t === 'jetty') out.push({ t: it.t, x: it.x, y: it.y || 0, z: it.z }); return out.slice(0, 3); })()`);
    for (const [k, L] of LH.entries()) await sh(`zone-${L.t}-${k}`, [L.x + 30, L.y + 14, L.z + 34], [L.x, L.y + 3, L.z]);
  }

  if (want('base')) {
    // pads with their AA revetments and fences; the quonset barracks; the shaft collars (cave mouths)
    for (const n of ['HOME ISLAND', 'PELICAN', islands[7], islands[12]]) {
      const P = await h.eval(`(() => { const I = __isl(${JSON.stringify(n)}), p = I.pad; return { x: p.x, z: p.z, h: p.h }; })()`);
      await sh(`pad-${slug(n)}`, [P.x - 42, P.h + 26, P.z + 50], [P.x, P.h, P.z]);
    }
    const P = await h.eval(`(() => { const p = __G.HOME_B.isl.pad; return { x: p.x, z: p.z, h: p.h }; })()`);
    await sh('home-aa-revetment-close', [P.x + 31, P.h + 3.5, P.z + 31 + 14], [P.x + 15.5, P.h + 0.5, P.z + 15.5]);
    const HQ = await h.eval(`(() => { const I = __G.HOME_B.isl, s = I.structs.find(s => s.kind === 'hq') || I.structs[0]; return s && { x: s.x, z: s.z, y: __G.terrainH(s.x, s.z) }; })()`);
    if (HQ) { await sh('home-hq-fence', [HQ.x + 28, HQ.y + 9, HQ.z + 30], [HQ.x, HQ.y + 2, HQ.z]); await sh('home-fence-eye', [HQ.x - 20, HQ.y + 1.7, HQ.z + 26], [HQ.x, HQ.y + 1.5, HQ.z]); }
    const Q = await h.eval(`(() => { const R = __SOLID.roomsNear(__G.PAD.x, __G.PAD.z, 300).filter(r => /quonset|hut/.test(r.it.t)); const it = R[0] && R[0].it; return it && { x: it.x, y: it.y, z: it.z, yaw: it.yaw, t: it.t }; })()`);
    if (Q) await sh('quonset', [Q.x + Math.sin(Q.yaw) * 16 + Math.cos(Q.yaw) * 8, Q.y + 4, Q.z + Math.cos(Q.yaw) * 16 - Math.sin(Q.yaw) * 8], [Q.x, Q.y + 1.5, Q.z]);
    const Bs = await h.eval(`__G.BASES.slice(0, 2).map(b => ({ x: b.x, z: b.z, h: b.h }))`);
    for (const [k, b] of Bs.entries()) await sh(`cave-mouth-${k}`, [b.x + 24, b.h + 16, b.z + 22], [b.x, b.h - 2, b.z]);
  }

  if (want('town')) {
    // wild towns: from the air, then the pub, school, church, harbour; a farm; a house knocked down
    const Ts = await h.eval(`(() => { const ss = __WORLD.net.settlementsNear(2600, 0, 4200).filter(s => s.size !== 'hamlet').sort((a, b) => Math.hypot(a.x - 2600, a.z) - Math.hypot(b.x - 2600, b.z)); window.__TS = ss; return ss.slice(0, 4).map(s => ({ size: s.size, harbour: !!s.harbour, x: s.x, z: s.z, y: __G.terrainH(s.x, s.z) })); })()`);
    for (const [k, T] of Ts.entries()) {
      if (k > 2) break;
      await sh(`town-air-${k}-${T.size}`, [T.x + 260, T.y + 220, T.z + 200], [T.x, T.y, T.z]);
      if (k === 0) await sh(`town-air-low-${k}`, [T.x + 90, T.y + 60, T.z + 70], [T.x, T.y, T.z]);
    }
    // the institutions of the nearest towns
    const It = await h.eval(`(() => { const want = { pub: null, school: null, church: null, chapel: null, quay: null, petrol: null, slip: null }; for (const s of __TS.slice(0, 6)) for (const it of __L.townItems(s)) { const k = it.pub ? 'pub' : it.t; if (k in want && !want[k]) want[k] = { x: it.x, y: it.y || __G.terrainH(it.x, it.z), z: it.z, yaw: it.yaw || 0, w: it.w || 8, d: it.d || 8 }; } return want; })()`);
    for (const [k, it] of Object.entries(It)) {
      if (!it) continue;
      const D = Math.max(it.w, it.d) * 1.6 + 12, fx = it.x + Math.sin(it.yaw) * D + Math.cos(it.yaw) * D * 0.35, fz = it.z + Math.cos(it.yaw) * D - Math.sin(it.yaw) * D * 0.35;
      await sh(`town-${k}`, [fx, Math.max(it.y, await gH([fx, fz])) + 5, fz], [it.x, it.y + 3, it.z]);
    }
    // a farm
    const F = await h.eval(`(() => { const fs = __N.farmsIn(1800, -1600, 4200, 1600); const f = fs[0]; return f && { x: f.x, z: f.z, y: __G.terrainH(f.x, f.z) }; })()`);
    if (F) { await sh('farm-air', [F.x + 70, F.y + 45, F.z + 60], [F.x, F.y, F.z]); await sh('farm-yard', [F.x + 22, F.y + 4, F.z + 18], [F.x, F.y + 1.5, F.z]); }
    // a street at eye level in the first town (camera on the road, looking along it)
    const St = await h.eval(`(() => { const T = __TS[0], q = __WORLD.roadAt(T.x + 30, T.z) || null; const R = __WORLD.net.nearestRoad(T.x + 20, T.z + 10, 80); if (!R) return null; const p = __WORLD.roadPoint(R.road || R, Math.max(0, (R.s || 0)), 1.5), p2 = __WORLD.roadPoint(R.road || R, (R.s || 0) + 40, 1.5); return { a: [p.x, p.y + 1.7, p.z], b: [p2.x, p2.y + 1.5, p2.z] }; })()`).catch(() => null);
    if (St) await sh('town-street-eye', St.a, St.b);
    // knock down a house near the first town's centre, look at the ruin
    const K = await h.eval(`(() => { const T = __TS[0]; const k = __WORLD.damage.knock(T.x, T.z, 'destroyed'); return k && { x: k.x, z: k.z, y: __G.terrainH(k.x, k.z) }; })()`);
    if (K) await sh('town-destroyed-house', [K.x + 16, K.y + 7, K.z + 18], [K.x, K.y + 1, K.z]);
  }

  if (want('inside')) {
    // the Marine on foot: the rooms of a two-storey house, a cottage, the zone pub / church if any, the quonset
    await h.eval('(clearInterval(window.__hold), window.__cam = null, 1)');
    await h.key('tap', 'KeyY'); await h.waitFor("__G.G.craft === 'foot' && __G.foot.exists", 20000);
    const inRoom = async (name, pick, looks) => {
      const ok = await h.eval(`(() => { const p = __G.PAD, R = __SOLID.roomsNear(p.x, p.z, 900).filter(${pick}).sort((a, b) => Math.hypot(a.it.x - p.x, a.it.z - p.z) - Math.hypot(b.it.x - p.x, b.it.z - p.z))[0]; if (!R) return null;
        const it = R.it, d = R.P.doors.find(d => d.out) || R.P.doors[0], c = Math.cos(it.yaw), s = Math.sin(it.yaw), v = d.v - 1.6;   // just inside the front door
        window.__RM = it; const key = R.P.key + '#' + d.id; const D = window.__DOORS && __DOORS.get(key); if (D && D.open) D.open(); else if (D) D.a = 1;
        __G.foot.spawnAt({ x: it.x + c * d.u + s * v, y: it.y + 0.3, z: it.z - s * d.u + c * v, yaw: it.yaw + Math.PI, force: true }); return { t: it.t, x: it.x, z: it.z }; })()`);
      if (!ok) return;
      for (const [k, [dy, pt]] of looks.entries()) { await h.eval(`(__G.marine.aim(__RM.yaw + Math.PI + ${dy}, ${pt}), window.__f0 = __fr, 1)`); await h.waitFor('__fr - __f0 >= 12', 90000); await h.shot(`${name}-${k}`); }
    };
    await inRoom('house2', 'r => r.it.t === "house" && r.it.floors === 2', [[0, -0.1], [0.9, -0.15], [-0.9, -0.15], [Math.PI, -0.05]]);
    await inRoom('cottage', 'r => r.it.t === "cottage"', [[0, -0.1], [1.0, -0.15]]);
    await inRoom('shop', 'r => r.it.t === "terrace"', [[0, -0.1], [0.8, -0.1]]);
    await inRoom('church', 'r => r.it.t === "church"', [[0, 0], [0.6, 0.1]]);
    await inRoom('quonset-inside', 'r => /quonset|hut/.test(r.it.t)', [[0, -0.05], [Math.PI, -0.05]]);
    // and from outside: third person in the village street
    await h.eval('(__G.marine.view = "third", __G.marine.aim(__RM ? __RM.yaw : 0, -0.1), window.__f0 = __fr, 1)'); await h.waitFor('__fr - __f0 >= 12', 90000); await h.shot('marine-third-street');
    await h.eval('(__G.marine.view = "first", 1)');
  }

  if (want('sea')) {
    // the shallows off the home beach from above, then from under the water (camera only)
    const B = await h.eval(`(() => { const B = __G.HARDS.find(b => b.I === __G.HOME_B.isl && b.main); return { a: B.at(-14), b: B.at(-40), c: B.at(10), up: B.at(-8) }; })()`);
    if (await h.eval("__G.G.craft !== 'heli'")) await h.eval('(window.__cam = null, 1)');
    await sh('shallows-above', [B.a[0], 9, B.a[1]], [B.up[0], -1.5, B.up[1]]);
    await sh('shallows-high', [B.b[0], 45, B.b[1]], [B.c[0], 0, B.c[1]]);
    await sh('underwater-to-shore', [B.b[0], -1.6, B.b[1]], [B.c[0], -1.2, B.c[1]], 30);
  }
  await h.eval('(clearInterval(window.__hold), window.__cam = null, 1)');
}
