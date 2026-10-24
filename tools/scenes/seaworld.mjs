// SEAWORLD: the live sea and the islands as places.   [PARTS=sea,elevator] node snap.mjs scenes/seaworld.mjs
// - sea states 1, 4 and 7 from the ALBATROSS's deck and from altitude (the waves are the ones the ships ride)
// (more parts are added below as they are built)
export const query = '?debug&kb&peace&res=0.6&nofog&sea=4';
export default async function (h) {
  await h.goto('?debug&kb&peace&res=0.6&nofog&sea=4');
  await h.waitFor('window.__G', 15000);
  await h.key('tap', 'Enter'); await h.wait(1200);
  await h.waitFor("__G.G.state === 'play'", 10000);
  // a scripted camera: window.__cam = { u, p: [lx, ly, lz], t: [lx, ly, lz] } in a ship's frame (heading only), or
  // { wp: [x, y, z], wt: [x, y, z] } in world space
  await h.eval(`(() => {
    const r = __G.renderer, orig = r.render.bind(r), T = __G.THREE, a = new T.Vector3(), b = new T.Vector3();
    const W = (u, l, out) => { const c = Math.cos(u.yaw), s = Math.sin(u.yaw); return out.set(u.p.x + l[0] * c + l[2] * s, u.p.y + l[1], u.p.z - l[0] * s + l[2] * c); };
    r.render = (sc, cam) => { const C = window.__cam; if (C) { if (C.u) { W(C.u, C.p, a); W(C.u, C.t, b); } else { a.set(...C.wp); b.set(...C.wt); } cam.position.copy(a); cam.up.set(0, 1, 0); cam.lookAt(b); cam.updateMatrixWorld(); } orig(sc, cam);
      // the horizon check: when asked, the fraction of pure-black pixels in the top 60 % of the frame (the clear colour
      // only shows where nothing - not even the sky dome - was drawn)
      if (window.__wantBlk) { window.__wantBlk = false; const gl = r.getContext(), w = gl.drawingBufferWidth, hh = gl.drawingBufferHeight, px = new Uint8Array(w * hh * 4); gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let n = 0, b = 0; for (let y = Math.floor(hh * 0.4); y < hh; y += 4) for (let x = 0; x < w; x += 4) { const k = (y * w + x) * 4; n++; if (px[k] + px[k + 1] + px[k + 2] < 12) b++; } window.__blk = b / n; } };
    // the terrain window, sky and fog follow the PLAYER's camera, so the helicopter waits 40 m above the shot
    window.__shot = (C) => { window.__cam = C; if (C.u) W(C.u, C.p, a); else a.set(...C.wp); if (__G.G.craft === "heli") __G.H.reset(a.clone().add(new T.Vector3(0, 40, 0)), 0, false, 1); __G.HI.setCollective(0.475); };
    // foot2: the Marine turns through marine.aim and has its own view (the walker's yaw alone no longer steers him)
    window.__face = y => (__G.marine && __G.marine.aim ? __G.marine.aim(y, 0) : (__G.foot.W.yaw = y));
    window.__view = v => { if (__G.marine) __G.marine.view = v; __G.foot.view = v; };
    window.__park = () => { __G.H.reset(new T.Vector3(__G.HOME_B.x + 18, 60, __G.HOME_B.z + 18), 0, false, 1); __G.HI.setCollective(0.475); };
    return true; })()`);
  const parts = (process.env.PARTS || 'all').split(',');   // PARTS=sea,elevator,... to run some of them
  const want = p => parts.includes(p) || parts.includes('all');
  await h.waitFor('__G.H.landed', 10000);   // the helicopter starts on the ALBATROSS's deck

  // helpers: the soldier in the carrier's frame
  await h.eval(`(window.__F = {
    loc: () => { const c = __G.war.carrier, W = __G.foot.W; const [x, z] = __G.GR.toLocal(c, W.x, W.z); return { x: +x.toFixed(2), z: +z.toFixed(2), y: +(W.y - c.p.y).toFixed(2), ground: W.onGround, plat: W.plat ? W.plat.type : null, on: +(W.y - __G.war.deckY(W.x, W.z)).toFixed(3), under: +c.parts.localDeck(x, z).toFixed(3) }; },
    place: (lx, lz, yawRel, ly = 8) => { const c = __G.war.carrier, w = __G.GR.toWorld(c, lx, lz); return __G.foot.spawnAt({ x: w.x, y: c.p.y + ly, z: w.z, yaw: c.yaw + yawRel }); },
  }, 1)`);

  if (want('lift')) {
    // the deck-edge lifts: a Hornet spotted on lift 1 and a soldier beside it ride down to the hangar door and back up
    await h.key('tap', 'KeyY'); await h.wait(600);
    await h.expect("__G.G.craft === 'foot'", 'out of the Huey on the deck');
    await h.eval('(() => { const P = __G.war.carrier.parts; return { lifts: P.lifts.map(L => [L.i, L.y, L.target]), deckOnLift: P.localDeck(15.0, -23.3), deckOnHornet: P.localDeck(18.9, -17), deckHornet2: P.localDeck(13.0, -30), deckTomcat: P.localDeck(9.0, 27.5), deckClear: P.localDeck(-6, 0) }; })()');
    await h.expect('(() => { const P = __G.war.carrier.parts; return P.localDeck(18.9, -17) > 9.5 && P.localDeck(13.0, -30) > 9.5 && P.localDeck(9.0, 27.5) > 9.5 && Math.abs(P.localDeck(-6, 0) - 8) < 1e-6; })()', 'parked aircraft stand up out of the deck (deckY)');
    await h.eval('(__F.place(15.2, -23.2, -Math.PI / 2), 1)'); await h.wait(800);
    await h.eval('__F.loc()');
    await h.expect('Math.abs(__F.loc().on) < 0.1 && Math.abs(__F.loc().under - 8) < 0.01 && __G.foot.W.onGround', 'standing on lift 1, up');
    await h.eval(`(__shot({ u: __G.war.carrier, p: [34, 13, -34], t: [16, 7, -17] }), 1)`); await h.wait(1200); await h.shot('lift-up');
    // U at the console runs it (the soldier is on it: that works too)
    await h.key('tap', 'KeyU'); await h.wait(300);
    await h.expect('__G.war.carrier.parts.lifts[0].target < 5', 'U sends lift 1 down');
    await h.waitFor('__G.war.carrier.parts.lifts[0].y < 4.3', 25000); await h.wait(600);
    await h.eval('({ soldier: __F.loc(), lift: __G.war.carrier.parts.lifts[0].y, hornetY: __G.war.carrier.parts.localDeck(18.9, -17) })');
    await h.expect('Math.abs(__F.loc().on) < 0.15 && Math.abs(__F.loc().under - 4.25) < 0.02 && __G.foot.W.onGround && __F.loc().plat === "carrier"', 'the soldier rode the lift down to the hangar door');
    await h.expect('Math.abs(__G.war.carrier.parts.localDeck(18.9, -17) - 4.25 - 1.65) < 1.5', 'the Hornet came down with it (its footprint too)');
    await h.eval(`(__shot({ u: __G.war.carrier, p: [36, 9, -32], t: [16, 4, -17] }), 1)`); await h.wait(1200); await h.shot('lift-down');
    await h.eval(`(__view('third'), __face(__G.war.carrier.yaw + Math.PI * 0.85), 1)`); await h.wait(300);
    await h.eval('(window.__cam = null, 1)'); await h.wait(1200); await h.shot('lift-down-third-person');
    // the hull is a wall from down here: walking inboard he stays on the platform
    await h.eval('(__face(__G.war.carrier.yaw + Math.PI / 2), 1)');
    await h.key('down', 'KeyW'); await h.wait(2500); await h.key('up', 'KeyW');
    await h.eval('__F.loc()');
    await h.expect('__F.loc().x > 13.6 && Math.abs(__F.loc().under - 4.25) < 0.02 && Math.abs(__F.loc().on) < 0.15', 'the hull side stops him (no walking into the deck from below)');
    await h.eval('(__G.war.carrier.parts.lift(0, "up"), 1)');
    await h.waitFor('__G.war.carrier.parts.lifts[0].y > 7.99', 25000); await h.wait(600);
    await h.expect('Math.abs(__F.loc().under - 8) < 0.02 && Math.abs(__F.loc().on) < 0.15 && __G.foot.W.onGround', 'and back up with it');
    // walking into a parked Hornet: it is solid
    await h.eval('(__F.place(4.6, -31, -Math.PI / 2), __view("first"), 1)'); await h.wait(500);
    await h.key('down', 'KeyW'); await h.wait(3500); await h.key('up', 'KeyW');
    await h.eval('__F.loc()');
    await h.expect('__F.loc().x < 7.2 && __F.loc().plat === "carrier" && Math.abs(__G.foot.W.y - __G.war.deckAt(__G.war.carrier, __G.foot.W.x, __G.foot.W.z)) < 0.15', 'a parked Hornet stops a walker');
    await h.eval(`(__view('third'), 1)`); await h.wait(900); await h.shot('walker-at-parked-hornet');
    await h.eval(`(__view('first'), 1)`);
  }

  const toFoot = async () => { if (await h.eval("__G.G.craft !== 'foot'")) { await h.key('tap', 'KeyY'); await h.wait(600); } };
  if (want('house')) {
    await toFoot();
    // a zone village house: walk at its front door and be stopped by the wall
    await h.eval(`(() => { const W = __WORLD, hs = []; for (const e of W.zone) for (const it of e.items) if (it.t === 'house' || it.t === 'cottage') hs.push(it);
      const it = hs[0]; window.__house = it; const fx = Math.sin(it.yaw), fz = Math.cos(it.yaw);
      __G.foot.spawnAt({ x: it.x + fx * (it.d / 2 + 2.2), y: it.y + 0.5, z: it.z + fz * (it.d / 2 + 2.2), yaw: it.yaw }); __view('third');   // facing -front: at the house
      return { n: hs.length, t: it.t, x: +it.x.toFixed(1), z: +it.z.toFixed(1), w: it.w, d: it.d }; })()`);
    await h.wait(600);
    await h.expect("__G.G.craft === 'foot'", 'on foot in the village');
    await h.key('down', 'KeyW'); await h.wait(4500); await h.key('up', 'KeyW');
    await h.eval(`(() => { const it = __house, W = __G.foot.W, fx = Math.sin(it.yaw), fz = Math.cos(it.yaw); window.__hd = (W.x - it.x) * fx + (W.z - it.z) * fz; return { front: +__hd.toFixed(2), halfDepth: it.d / 2, y: +W.y.toFixed(2), ground: W.onGround }; })()`);
    await h.expect('__hd > __house.d / 2 + 0.2 && __hd < __house.d / 2 + 1.2', 'walking into a house: stopped at its wall');
    await h.eval('(__face(__house.yaw + 0.5), 1)'); await h.wait(1200); await h.shot('house-wall');
  }

  if (want('bridge')) {
    await toFoot();
    // a bridge in the wild lands (one worldsolidbench finds near 5103, -2004): walk (sprint) over it end to end; the
    // deck carries him (bridges are not in the terrain)
    await h.eval(`(() => { const W = __WORLD; W.roadGraph(5103, -2004, 300);
      const q = W.roadAt(5103, -2004); if (!q || !q.bridge) return null; const R = W.roadById(q.road); let i0 = 0, d0 = 1e9; for (let i = 0; i < R.xs.length; i++) { const d = Math.hypot(R.xs[i] - 5103, R.zs[i] + 2004); if (d < d0) { d0 = d; i0 = i; } } let i1 = i0; while (i0 > 0 && R.br[i0 - 1]) i0--; while (i1 < R.xs.length - 1 && R.br[i1]) i1++; const best = { L: R.s[i1] - R.s[i0] };
      const a = Math.max(0, i0 - 2), b = Math.min(R.xs.length - 1, i1 + 2);
      window.__br = { R, i0, i1, a, b, L: best.L, ex: R.xs[b], ez: R.zs[b], minUp: 1e9, wet: false };
      const yaw = Math.atan2(-(R.xs[a + 1] - R.xs[a]), -(R.zs[a + 1] - R.zs[a]));
      __G.foot.spawnAt({ x: R.xs[a], y: R.ys[a] + 0.3, z: R.zs[a], yaw }); __view('third');
      let span = 0; for (let k = i0; k < i1; k++) span = Math.max(span, R.ys[k] - Math.max(0, __G.terrainH(R.xs[k], R.zs[k])));
      return { len: +best.L.toFixed(0), at: [+R.xs[i0].toFixed(0), +R.zs[i0].toFixed(0)], deckOverGround: +span.toFixed(1), type: R.type }; })()`);
    await h.expect('!!window.__br', 'found a bridge in the wild lands');
    await h.wait(2500);   // the terrain bake and the world chunk catch up with the soldier
    // steer him along the road while he sprints: each tick, face the next road point
    await h.eval(`(window.__brI = setInterval(() => { const B = __br, W = __G.foot.W, R = B.R; let k = B.a; for (let i = B.a; i <= B.b; i++) if (Math.hypot(R.xs[i] - W.x, R.zs[i] - W.z) < Math.hypot(R.xs[k] - W.x, R.zs[k] - W.z)) k = i;
      const n = Math.min(B.b, k + 2); __face(Math.atan2(-(R.xs[n] - W.x), -(R.zs[n] - W.z)));
      { const q = __WORLD.roadAt(W.x, W.z); if (q && q.bridge) { B.onBridge = true; B.under = Math.max(B.under || 0, q.y - W.y); B.high = Math.max(B.high || 0, W.y - Math.max(0, __G.terrainH(W.x, W.z))); } } if (W.swim || W.wade > 0) B.wet = true; }, 50), 1)`);
    await h.key('down', 'KeyW'); await h.key('down', 'ShiftLeft');
    await h.waitFor('Math.hypot(__G.foot.W.x - __br.ex, __G.foot.W.z - __br.ez) < 4', 60000);
    await h.eval('({ belowDeckMax: +(__br.under || 0).toFixed(2), maxAboveGround: +(__br.high || 0).toFixed(1), wet: __br.wet, onBridge: !!__br.onBridge })');
    await h.wait(1);
    await h.key('up', 'ShiftLeft'); await h.key('up', 'KeyW'); await h.eval('(clearInterval(__brI), 1)');
    await h.expect('__br.onBridge && !__br.wet && __br.under < 0.5 && __br.high > 5', 'walked over the bridge on its deck (never in the water or the valley)');
    // back to the middle for a picture
    await h.eval(`(() => { const B = __br, R = B.R, m = Math.round((B.i0 + B.i1) / 2); __G.foot.spawnAt({ x: R.xs[m], y: R.ys[m] + 0.3, z: R.zs[m], yaw: Math.atan2(-(R.xs[m + 1] - R.xs[m]), -(R.zs[m + 1] - R.zs[m])) + 2.4 }); return 1; })()`);
    await h.wait(1500); await h.shot('bridge-deck');
  }

  if (want('mounts')) {
    // the KRAKEN's new fit: TALON modules where the seized RAM launchers were, LANCE turrets aft. The scene runs in
    // ?peace (enemy guns hold fire), so the mounts are driven directly against the helicopter hovering off her quarter.
    await h.eval('(window.__cam = null, __G.G.craft !== "heli" && __G.toHeli(), 1)'); await h.wait(800);
    await h.eval(`(() => { const K = __G.war.enemyCarrier; return { guns: K.guns.map(g => g.def && g.def.type), mounts: K.parts.mounts.filter(m => m.def).map(m => m.def) }; })()`);
    await h.expect(`(() => { const t = __G.war.enemyCarrier.guns.map(g => g.def && g.def.type); return t.filter(x => x === 'talonm').length === 2 && t.filter(x => x === 'lancem').length === 2; })()`, 'KRAKEN: two TALON and two LANCE mounts');
    await h.expect(`(() => { const W = __G.war; return W.units.filter(u => u.dims && u.side === 2).every(u => u.guns.every(g => g.def)); })()`, 'every RUNAWAY ship gun is a DEFENCE unit');
    await h.eval(`(() => { const K = __G.war.enemyCarrier, c = Math.cos(K.yaw), s = Math.sin(K.yaw), lx = 60, lz = 10; __G.H.reset(new __G.THREE.Vector3(K.p.x + lx * c + lz * s, 45, K.p.z - lx * s + lz * c), 0, false, 1); __G.HI.setCollective(0.475);
      window.__mf = { proj0: __G.war.proj.length, shots: 0, msl: 0, beam: 0, locks: 0 }; const D = __G.war.defence, foes = () => [{ player: true, p: __G.Z.pos, v: __G.Z.vel }];
      window.__mi = setInterval(() => { for (const g of K.guns) { D.update(g, 1 / 30, foes()); if (g.def.mode === 'fire' || g.def.lockT > g.def.T.lock) __mf.locks++; if (g.def.beam && g.def.beam.visible) __mf.beam++; } __mf.msl = Math.max(__mf.msl, D.missiles.length); __mf.shots = Math.max(__mf.shots, __G.war.proj.length - __mf.proj0); }, 33); return 1; })()`);
    await h.wait(5000);
    await h.eval(`(__shot({ u: __G.war.enemyCarrier, p: [-46, 18, 78], t: [-12, 8, 52] }), 1)`); await h.wait(1500); await h.shot('kraken-mounts-aft');
    await h.eval(`(__shot({ u: __G.war.enemyCarrier, p: [36, 16, -10], t: [14, 6, -36] }), 1)`); await h.wait(1500); await h.shot('kraken-talon-fwd');
    await h.wait(4000);
    await h.eval('(clearInterval(__mi), window.__cam = null, __mf)');
    await h.expect('__mf.locks > 0 && (__mf.shots > 0 || __mf.msl > 0 || __mf.beam > 0)', 'the KRAKEN mounts lock on and fire');
    await h.eval('(__G.toHeli(), 1)'); await h.wait(800);
  }

  if (want('horizon')) {
    // the horizon from the deck and from altitude, chase and cockpit, and from a scripted camera far off the player (what
    // used to clip the sky dome into a black dome): no pure-black pixels above the horizon
    await h.eval('(window.__cam = null, __G.G.craft !== "heli" && __G.toHeli(), 1)'); await h.wait(800); await h.waitFor('__G.H.landed', 8000);
    const blk = async (name) => { await h.wait(1200); await h.eval('(window.__wantBlk = true, 1)'); await h.wait(400); const v = await h.eval('window.__blk'); await h.shot('horizon-' + name); await h.expect(`window.__blk < 0.002`, `horizon ${name}: no black above the horizon (${(v * 100).toFixed(2)} %)`); };
    await h.eval('(__G.cockpitCam = true, 1)'); await blk('deck-heli-cockpit');
    await h.eval('(__G.cockpitCam = false, 1)'); await blk('deck-heli-chase');
    await h.eval(`(window.__cam = { u: __G.war.carrier, p: [-180, 30, 160], t: [-400, 20, 400] }, 1)`); await blk('scripted-camera-180m-off');
    await h.eval(`(window.__cam = { u: __G.war.carrier, p: [150, 120, -150], t: [600, 40, -600] }, 1)`); await blk('scripted-camera-high');
    await h.eval('(window.__cam = null, 1)');
    await h.key('tap', 'Digit5'); await h.wait(1500); await h.waitFor('__G.G.craft === "jet"', 8000);
    await h.eval('(() => { const c = __G.war.carrier, J = __G.JP.J; J.cat = null; J.reset(c.p.x + 300, 0, c.p.z - 600, 2.4, { running: true, airborne: true, alt: 600, speed: 120 }); J.gearCmd = 0; J.gear = 0; __G.cockpitCam = false; __G.JP.snapChase(); return 1; })()');
    await blk('jet-chase-600m');
    await h.eval('(__G.cockpitCam = true, 1)'); await blk('jet-cockpit-600m');
    await h.eval('(__G.cockpitCam = false, __G.toHeli(), 1)'); await h.wait(800);
  }

  if (want('sea')) {
    await h.eval('(window.__cam = null, __G.G.craft !== "heli" && __G.toHeli(), 1)'); await h.wait(800); await h.waitFor('__G.H.landed', 8000);
    // from the HORNET at 600 m (its view reaches ~1.5 km): the swell and the whitecaps out to the horizon
    await h.eval('(__G.war.setSea(7), 1)');
    await h.key('tap', 'Digit5'); await h.wait(1500);
    await h.waitFor('__G.G.craft === "jet"', 8000);
    await h.eval('(() => { const c = __G.war.carrier, J = __G.JP.J; J.cat = null; J.reset(c.p.x + 600, 0, c.p.z + 500, 0.9, { running: true, airborne: true, alt: 600, speed: 120 }); J.gearCmd = 0; J.gear = 0; __G.cockpitCam = false; __G.JP.snapChase(); return 1; })()');
    await h.wait(3000); await h.shot('ss7-jet-600m');
    await h.eval('(__G.war.setSea(4), 1)'); await h.wait(1500); await h.shot('ss4-jet-600m');
    await h.eval('(__G.toHeli(), 1)'); await h.wait(1000); await h.waitFor('__G.G.craft === "heli"', 5000);
    await h.eval('(__park(), 1)');
    // the carrier under way into the swell; the camera on deck (port side, looking out over the bow quarter) and up high
    await h.eval(`(() => { const c = __G.war.carrier; c.speed = 4; const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw); __G.war.orderCarrier(c.p.x + fx * 900, c.p.z + fz * 900); return 1; })()`);
    for (const ss of [1, 4, 7]) {
      await h.eval(`(__G.war.setSea(${ss}), 1)`); await h.wait(2500);
      await h.expect(`Math.abs(__G.war.sea.ss - ${ss}) < 1e-6 && __G.war.sea.comps.length === 14`, `sea state ${ss} set`);
      await h.eval(`(__shot({ u: __G.war.carrier, p: [-12, 10.2, -20], t: [-60, 4, -90] }), 1)`); await h.wait(1500); await h.shot(`ss${ss}-deck`);
      await h.eval(`(__shot({ u: __G.war.carrier, p: [-120, 70, -60], t: [0, 0, 0] }), 1)`); await h.wait(1500); await h.shot(`ss${ss}-alt`);
      // the ship rides the drawn sea: a sample of the surface next to the hull and the carrier's heave
      await h.eval(`(() => { const W = __G.war, c = W.carrier; return { ss: W.sea.ss, hs: W.sea.hs, heave: +c.att.heave.toFixed(3), pitchDeg: +(c.att.pitch * 57.3).toFixed(2), rollDeg: +(c.att.roll * 57.3).toFixed(2), seaAtShip: +W.seaY(c.p.x, c.p.z).toFixed(3) }; })()`);
    }
    await h.eval(`(__G.war.setSea(4), window.__cam = null, 1)`);
  }
}
