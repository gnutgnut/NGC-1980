// ngc/world-polish: the lived-in world's buildings take damage (pure: no THREE; one registry per thread).
// A building (chunkgen.js dyn.bld: { k, t, x, y, z, yaw, w, d, H, dz }) soaks up blasts: each explosion of size s
// (fx.explode's s: a shell ~1.3, a rocket ~2.2, a bomb 2.4-2.8, a crashing aircraft 3-6) within R = 2 + 2.4 s metres
// of its walls and below its roof does (s - 0.5) (1 - d / R)^1.5. Past 45 % of its hp it is DAMAGED (soot, a hole in the
// roof, smoke), past 100 % DESTROYED (wall stumps, rubble, fire). Game-level numbers: two bombs or four shells on a
// two-storey house, a church takes a lot more.
// Keys are rooms.js planOf's (type:seed:x10:z10), so the interiors and the colliders (world/solid.js) can ask too.
export const HP = { house: 2.6, cottage: 2.0, terrace: 3.4, church: 6, petrol: 2.2, barn: 2.6, boatshed: 1.6, school: 3.6, chapel: 3.2, vhall: 2.4, parlour: 2.4, office: 1.0, garage: 1.2 };
const state = new Map(), listeners = [];
export const DAMAGE = {
  state,
  cond: k => { const s = state.get(k); return s ? s.cond : 'intact'; },
  dead: k => { const s = state.get(k); return !!s && s.cond === 'destroyed'; },
  onChange(fn) { listeners.push(fn); },
  // distance from (x, z) to building b's walls (0 inside)
  dist(b, x, z) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z, u = c * dx - s * dz, v = s * dx + c * dz - (b.dz || 0);
    return Math.hypot(Math.max(0, Math.abs(u) - b.w / 2), Math.max(0, Math.abs(v) - b.d / 2));
  },
  // a blast of size s at (x, y, z) on building b: returns the new condition when it changed, else null
  hit(b, x, y, z, s) {
    if (y > b.y + b.H + 5 || y < b.y - 6) return null;
    const R = 2 + 2.4 * s, d = DAMAGE.dist(b, x, z); if (d >= R) return null;
    const dmg = Math.max(0, s - 0.5) * (1 - d / R) ** 1.5; if (dmg < 0.02) return null;
    let st = state.get(b.k); if (!st) state.set(b.k, st = { dmg: 0, cond: 'intact' });
    if (st.cond === 'destroyed') return null;
    const hp = HP[b.t] || 2, was = st.cond;
    st.dmg += dmg; st.cond = st.dmg >= hp ? 'destroyed' : st.dmg >= hp * 0.45 ? 'damaged' : 'intact';
    if (st.cond === was) return null;
    for (const f of listeners) f(b, st.cond, was);
    return st.cond;
  },
  // knock it straight to a condition (tests, scripted events)
  set(b, cond) { let st = state.get(b.k); if (!st) state.set(b.k, st = { dmg: 0, cond: 'intact' }); const was = st.cond; if (was === cond) return; st.cond = cond; st.dmg = cond === 'destroyed' ? (HP[b.t] || 2) : cond === 'damaged' ? (HP[b.t] || 2) * 0.5 : 0; for (const f of listeners) f(b, cond, was); },
};
