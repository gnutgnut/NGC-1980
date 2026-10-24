// ngc/world-polish in the game: bombs on a wild town's house (damaged, then destroyed: ruin, fire, its collapsed
// vertex range, its rubble), the pub and the square close up from the Huey, a harbour, and our island's base with its
// fence and the dug-in AA emplacements.
export default {
  name: 'worlddamage',
  query: '?debug&auto&kb&peace&res=0.45',
  run: async h => {
    await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && window.__WORLD", 30000);
    const hover = (x, z, agl, yaw) => h.eval(`(() => { const G = __G, y = Math.max(G.groundY(${x}, ${z}), 0) + ${agl}; G.H.reset(new G.THREE.Vector3(${x}, y, ${z}), ${yaw}, false, 1); G.HI.setCollective(0.45);
      clearInterval(window.__hold); const ty = y; window.__hold = setInterval(() => { const H = G.H; if (!H.pos) return; const err = ty - H.pos.y; G.HI.setCollective(Math.max(0.2, Math.min(0.7, 0.45 + err * 0.02 - H.vel.y * 0.04))); }, 50); return Math.round(y); })()`);
    const face = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
    await h.eval(`(() => { const W = __WORLD, ss = W.net.settlementsNear(3600, 1200, 5000).filter(s => s.size !== 'hamlet').sort((a, b) => Math.hypot(a.x - 3600, a.z - 1200) - Math.hypot(b.x - 3600, b.z - 1200)); window.__T = ss[0]; return { size: ss[0].size, x: Math.round(ss[0].x), z: Math.round(ss[0].z) }; })()`);
    const T = await h.eval('({ x: __T.x, z: __T.z })');
    await hover(T.x + 40, T.z + 45, 18, face(T.x + 40, T.z + 45, T.x, T.z));
    await h.waitFor('__WORLD.stats.chunks > 4 && __WORLD.stats.pending === 0', 40000); await h.wait(4000);
    await h.eval(`({ calls: __G.renderer.info.render.calls, tris: __G.renderer.info.render.triangles, detail: __WORLD.stats.detailChunks, fps: document.getElementById('dbg').textContent })`);
    await h.shot('square'); await h.notblank();
    // the house nearest the square
    await h.eval(`(() => { let best = null; for (const c of __WORLD.chunks.values()) if (c.state === 'ready') for (const b of c.dyn.bld) if (b.t === 'house') { const d = Math.hypot(b.x - __T.x, b.z - __T.z); if (!best || d < best.d) best = { d, b, c }; } window.__B = best; return best && { k: best.b.k, d: Math.round(best.d) }; })()`);
    const B = await h.eval('({ x: __B.b.x, z: __B.b.z, y: __B.b.y, yaw: __B.b.yaw, d: __B.b.d })');
    const vx = B.x + Math.sin(B.yaw) * 30 + Math.cos(B.yaw) * 10, vz = B.z + Math.cos(B.yaw) * 30 - Math.sin(B.yaw) * 10;
    await hover(vx, vz, 10, face(vx, vz, B.x, B.z)); await h.wait(2500); await h.shot('house-before');
    const fv = B.d / 2 + 1.5, fx = B.x + Math.sin(B.yaw) * fv, fz = B.z + Math.cos(B.yaw) * fv;
    await h.eval(`(__G.fx.explode(${fx}, ${B.y} + 0.5, ${fz}, 2.8, { debris: 8, crater: 3 }), __WORLD.damage.DAMAGE.cond(__B.b.k))`);
    await h.expect(`__WORLD.damage.DAMAGE.cond(__B.b.k) === 'damaged' && !!__B.c.ruins`);
    await h.wait(3000); await h.shot('house-damaged');
    await h.eval(`(__G.fx.explode(${B.x}, ${B.y} + 3, ${B.z}, 2.8, { debris: 8, crater: 3 }), __WORLD.damage.DAMAGE.cond(__B.b.k))`);
    await h.expect(`__WORLD.damage.DAMAGE.cond(__B.b.k) === 'destroyed' && __B.b.gone`);
    await h.expect(`(() => { const p = __B.c.sN.geometry.attributes.position.array, a = __B.b.n[0], e = __B.b.n[1] - 1; return p[a * 3] === p[e * 3] && p[a * 3 + 2] === p[e * 3 + 2]; })()`);
    await h.wait(4000); await h.shot('house-destroyed');
    await h.wait(8000); await h.shot('house-ruin-burning');
    // our base on PELICAN: fence and AA emplacements
    await h.eval(`(() => { const I = __G.ISLANDS.find(I => I.name === 'PELICAN'), s = I.structs.find(s => s.kind === 'hq'); window.__S = s; return { x: Math.round(s.x), z: Math.round(s.z), side: s.side, aa: __WORLD.sites.find(t => t.I === I).aa[0].children.map(c => c.visible) }; })()`);
    const S = await h.eval('({ x: __S.x, z: __S.z })');
    await hover(S.x + 30, S.z + 34, 22, face(S.x + 30, S.z + 34, S.x, S.z)); await h.wait(3000); await h.shot('base-hq-fence');
    await h.eval(`(() => { const I = __S.I, p = I.pad; return { x: p.x, z: p.z }; })()`);
    const P = await h.eval('({ x: __S.I.pad.x, z: __S.I.pad.z })');
    await hover(P.x - 30, P.z + 36, 26, face(P.x - 30, P.z + 36, P.x, P.z)); await h.wait(3000); await h.shot('base-aa-sites');
    await h.eval('(clearInterval(window.__hold), 1)');
  },
};
