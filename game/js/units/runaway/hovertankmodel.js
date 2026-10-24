// RW-7 hover tank exterior model (7.8 x 3.9 m). Low faceted ceramic hull over a dark segmented skirt, four ducted
// lift fans under deck grilles (their rings glow pale cyan underneath), an off-centre low turret with a long coilgun
// (rails between capacitor blocks, coil rings), a sensor mast instead of any vision block, a point-defence turret
// aft. No windows, no hatches. Wear: dust on the skirt and the lower hull, scorched coil rings.
// Local frame = the sim's body frame: origin at the hull centre 0.55 m above the skirt hem, -z forward.
// API: buildHoverTank() -> { group, update(T, dt, time), parts }
import * as THREE from 'three';
import { Kit, RW, rwMats, stencilTex, decal, setBodyMat } from './rwkit.js';
import { RW7 } from './hovertank.js';

const C = RW;
function hullKit() {
  const k = new Kit(), L = RW7.L, W = RW7.W, hem = RW7.SKIRT_Y, hl = L / 2, hw = W / 2;
  // plan: a long hexagon with a narrowed prow (the hull is wider than the skirt line by a little)
  const plan = (s, nose = 1) => [[-hw * s, hl * s], [hw * s, hl * s], [hw * s, -hl * 0.55], [hw * 0.62 * s, -hl * s * nose], [-hw * 0.62 * s, -hl * s * nose], [-hw * s, -hl * 0.55]];
  // skirt: a thin flared band of fingers from the hem up 0.3 m (the hem floats ~0.4 m clear: the gap shows)
  k.prism(plan(0.97), hem, 0.3, C.composite, 1.03);
  const fingers = 34;
  for (let i = 0; i < fingers; i++) {
    const z = -hl * 0.5 + (i + 0.5) * (L * 0.74) / fingers;
    for (const s of [-1, 1]) k.box(0.06, 0.26, L * 0.74 / fingers - 0.04, s * (hw * 0.97 + 0.02), hem + 0.15, z, i % 2 ? C.composite2 : C.composite, [0, 0, s * 0.2]);
  }
  k.prism(plan(0.95), hem + 0.3, 0.06, C.ceramicDirt, 1.0);                     // dust line
  // lower hull (dark composite) with sloped sides, then the ceramic upper body (narrower top: chamfered)
  k.prism(plan(0.93), hem + 0.36, 0.42, C.composite2, 0.97);
  k.prism(plan(1.0, 0.98), hem + 0.78, 0.5, C.ceramic, 0.86);
  k.prism(plan(0.86, 0.95), hem + 1.28, 0.05, C.ceramic2, 0.98);                // deck plate
  // the prow: a sloped glacis wedge with the sensor band
  k.box(W * 0.62, 0.06, 1.4, 0, hem + 1.05, -hl + 0.62, C.ceramic2, [-0.42, 0, 0]);
  k.box(W * 0.5, 0.09, 0.08, 0, hem + 0.95, -hl + 0.12, C.lensDark, [-0.42, 0, 0]);
  for (const x of [-0.6, 0.1, 0.45]) k.glowBox(0.06, 0.03, 0.02, x, hem + 0.95, -hl + 0.07);
  // side seams + sponson lines
  for (const s of [-1, 1]) { k.strip([s * (hw - 0.02), hem + 0.8, -hl * 0.5], [s * (hw - 0.02), hem + 0.8, hl - 0.2], 0.02); k.box(0.04, 0.2, L * 0.6, s * (hw * 0.95), hem + 1.0, 0.6, C.ceramic2, [0, 0, s * 0.5]); }
  // rear: dark plate + status bars
  k.box(W * 0.8, 0.4, 0.06, 0, hem + 0.95, hl + 0.01, C.composite2);
  for (const s of [-1, 1]) k.glowBox(0.5, 0.05, 0.02, s * 0.9, hem + 1.05, hl + 0.04);
  // fan ducts: four deck openings with grilles and a glowing ring (the rotors are separate parts, they spin)
  const deck = hem + 1.33;
  for (const [xx, zz] of RW7.CELLS) {
    k.cyl(0.84, 0.84, 0.06, 20, xx, deck, zz, C.composite);
    k.cyl(0.9, 0.9, 0.03, 20, xx, deck + 0.025, zz, C.ceramic2);
    for (let g = -3; g <= 3; g++) k.box(1.5, 0.025, 0.04, xx, deck + 0.05, zz + g * 0.21, C.composite2);
    k.seam(new THREE.TorusGeometry(0.86, 0.022, 4, 24).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(xx, deck + 0.045, zz));
  }
  // hull glyphs (machine markings)
  for (let i = 0; i < 9; i++) k.box(0.02 + (i % 3) * 0.015, 0.12, 0.01, -1.3 + i * 0.05, hem + 1.08, -hl + 0.95, C.glyph, [-0.42, 0, 0]);
  return k;
}
function turretKit() {
  // origin at the turret ring (deck level), -z forward; ring 0.25 m left of the centreline (asymmetric)
  const k = new Kit();
  const plan = s => [[-1.05 * s, 1.5 * s], [1.05 * s, 1.5 * s], [1.15 * s, -0.2], [0.45 * s, -1.65 * s], [-0.45 * s, -1.65 * s], [-1.15 * s, -0.2]];
  k.prism(plan(1), 0, 0.22, C.composite2, 0.98);
  k.prism(plan(0.98), 0.22, 0.24, C.ceramic, 0.82);
  k.prism(plan(0.8), 0.46, 0.04, C.ceramic2, 0.97);
  k.box(1.5, 0.32, 0.8, 0, 0.2, 1.75, C.composite2);                                // capacitor bustle
  for (let i = 0; i < 4; i++) k.glowBox(0.03, 0.16, 0.02, -0.45 + i * 0.3, 0.2, 2.16);
  k.box(0.12, 0.62, 0.12, 0.75, 0.75, 0.55, C.composite);                          // sensor mast (head separate)
  k.strip([-1.1, 0.33, -0.25], [-0.5, 0.33, -1.55], 0.018); k.strip([1.1, 0.33, -0.25], [0.5, 0.33, -1.55], 0.018);
  for (let i = 0; i < 6; i++) k.box(0.02 + (i % 2) * 0.02, 0.14, 0.01, -1.14, 0.3, 0.2 + i * 0.07, C.glyph);
  return k;
}
function gunKit() {
  // origin at the trunnion, -z forward: two rails between capacitor blocks, coil collars, an emitter
  const k = new Kit(), L = 5.2;
  k.box(0.56, 0.34, 0.8, 0, 0, -0.1, C.composite2);
  for (const s of [-1, 1]) k.box(0.08, 0.18, L - 0.6, s * 0.11, 0, -0.5 - (L - 0.6) / 2, C.composite);   // rails
  k.box(0.14, 0.06, L - 0.8, 0, 0.11, -0.5 - (L - 0.8) / 2, C.ceramic2);            // top spine
  for (let i = 0; i < 7; i++) {
    const z = -0.95 - i * 0.6;
    k.box(0.38, 0.32, 0.1, 0, 0, z, i > 4 ? C.composite : C.composite2);
    k.glowBox(0.4, 0.025, 0.035, 0, 0.165, z);
  }
  k.box(0.32, 0.26, 0.28, 0, 0, -L + 0.1, C.ceramic);
  k.glowBox(0.12, 0.06, 0.02, 0, 0, -L - 0.05);
  return k;
}
function fanKit() {   // a lift fan rotor (spins about y)
  const k = new Kit();
  k.cyl(0.18, 0.18, 0.16, 10, 0, 0, 0, C.joint);
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; k.box(0.62, 0.02, 0.16, Math.cos(a) * 0.48, 0, Math.sin(a) * 0.48, C.composite, [0.4, -a, 0]); }
  return k;
}
function sensorHeadKit() {
  const k = new Kit();
  k.taper(0.42, 0.3, 0.3, 0.2, 0.26, 0, 0, 0, C.ceramic, [-Math.PI / 2, 0, 0], 0, 0);
  k.box(0.3, 0.12, 0.04, 0, 0.0, -0.27, C.lensDark);
  k.glowDisc(0.04, -0.08, 0.0, -0.295, [0, Math.PI, 0], 10);
  k.glowBox(0.02, 0.02, 0.01, 0.06, 0.02, -0.293);
  k.box(0.02, 0.4, 0.02, 0.15, 0.25, 0.1, C.composite);
  return k;
}
function pdKit() {   // the point-defence mount: a small dome + a stubby flechette barrel
  const k = new Kit();
  k.sphere(0.28, 0, 0.12, 0, C.ceramic2, 1, 0.7, 1, 10, 6);
  k.box(0.08, 0.08, 0.6, 0, 0.18, -0.35, C.composite);
  k.box(0.18, 0.12, 0.18, 0, 0.18, 0.05, C.composite2);
  k.glowBox(0.04, 0.04, 0.01, 0, 0.18, -0.66);
  return k;
}

let P = null;
function protos() {
  if (P) return P; const M = rwMats();
  P = { hull: hullKit().build(M.body, M.glow, 'rw7hull'), turret: turretKit().build(M.body, M.glow, 'rw7turret'), gun: gunKit().build(M.body, M.glow, 'rw7gun'),
    fan: fanKit().build(M.body, M.glow, 'rw7fan'), head: sensorHeadKit().build(M.body, M.glow, 'rw7sensor'), pd: pdKit().build(M.body, M.glow, 'rw7pd') };
  return P;
}
export function buildHoverTank(opt = {}) {
  const pr = protos(), M = rwMats();
  const group = new THREE.Group(); group.name = 'rw7';
  const hull = pr.hull.clone(); group.add(hull);
  const turret = pr.turret.clone(); turret.position.set(-0.25, RW7.SKIRT_Y + 1.33, -0.2); group.add(turret);
  const gun = pr.gun.clone(); gun.position.set(0, 0.3, -0.9); turret.add(gun);
  const head = pr.head.clone(); head.position.set(0.75, 1.25, 0.55); turret.add(head);
  const pd = pr.pd.clone(); pd.position.set(1.15, RW7.SKIRT_Y + 1.33, 2.9); group.add(pd);
  const fans = RW7.CELLS.map(([x, z]) => { const f = pr.fan.clone(); f.position.set(x, RW7.SKIRT_Y + 1.2, z); group.add(f); return f; });
  // underglow: the fans' downwash lit from inside the skirt (a soft disc under each cell)
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
  const under = RW7.CELLS.map(([x, z]) => { const m = new THREE.Mesh(new THREE.CircleGeometry(1.0, 16).rotateX(Math.PI / 2), glowMat); m.position.set(x, RW7.SKIRT_Y + 0.02, z); group.add(m); return m; });
  if (opt.tag && typeof document !== 'undefined') { const d = decal(stencilTex(opt.tag, { w: 256, h: 64, color: '#1a1d20', font: 'bold 44px monospace' }), 1.0, 0.25, -1.73, 0.62, 1.2, [0, -Math.PI / 2, 0]); hull.add(d); }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(RW7.W * 1.2, RW7.L * 1.15).rotateX(-Math.PI / 2), M.shadow); shadow.renderOrder = -1;
  const sgroup = new THREE.Group(); sgroup.add(shadow);
  const glows = []; group.traverse(o => { if (o.isMesh && o.material === M.glow) glows.push(o); });
  let spin = [0, 0, 0, 0], headA = 0, recoil = 0, wreck = null;
  const gunZ = gun.position.z, _q = new THREE.Quaternion(), _e = new THREE.Euler();
  const api = {
    group, shadow: sgroup, parts: { hull, turret, gun, head, pd, fans },
    // ngc/rwground-polish: the coilgun's slug kicks the rail assembly back into the turret (it runs out again in 0.7 s)
    recoil() { recoil = 1; },
    update(T, dt, time, groundY) {
      group.position.set(T.p[0], T.p[1], T.p[2]); group.quaternion.set(T.q[0], T.q[1], T.q[2], T.q[3]);
      turret.rotation.y = T.turretYaw; gun.rotation.x = T.gunPitch;
      recoil = Math.max(0, recoil - dt / 0.7); gun.position.z = gunZ + 0.55 * Math.min(1, recoil * 3) * recoil;
      for (let i = 0; i < 4; i++) {
        spin[i] += T.fan[i] * 70 * dt * (i % 2 ? 1 : -1); fans[i].rotation.y = spin[i];
        // a fan the hits wrecked: the rotor is gone from its duct (smoke from it: groundwar's damage effects)
        fans[i].visible = !(T.fanHp && T.fanHp[i] <= 0);
      }
      headA += dt * 1.7; head.rotation.y = T.alive ? Math.sin(headA) * 0.9 : head.rotation.y;
      glowMat.opacity = T.alive ? 0.22 * Math.min(1, (T.fan[0] + T.fan[1] + T.fan[2] + T.fan[3]) / 3) : 0;
      if (groundY !== undefined) { sgroup.position.set(T.p[0], groundY + 0.04, T.p[2]); sgroup.rotation.y = T.yaw; }
      if (T.alive) { const lit = true; for (const g of glows) g.material = lit ? M.glow : M.glowDim; return; }
      // ---- the wreck: the cushion dumps, the hull drops onto its crushed skirt with one corner low (the cell that
      // burst), soot over the ceramic, the seams dead, the coilgun sagging in its trunnions
      if (!wreck) {
        const k = (T.id ?? 0) * 2.399;
        wreck = { t: 0, y0: T.p[1], pitch: 0.035 * Math.cos(k), roll: 0.05 * Math.sin(k), turret: T.turretYaw };
        setBodyMat(group, M.burnt, M.glowOff); for (const f of fans) f.visible = false;
      }
      wreck.t = Math.min(1, wreck.t + dt / 0.6);
      const gy = groundY ?? (T.p[1] + RW7.SKIRT_Y), restY = gy - RW7.SKIRT_Y - 0.14, e = wreck.t * wreck.t;
      _e.set(0, T.yaw, 0, 'YXZ'); _q.setFromEuler(_e); group.quaternion.slerp(_q, e);
      group.position.y = wreck.y0 + (restY - wreck.y0) * e; group.rotateX(wreck.pitch * e); group.rotateZ(wreck.roll * e);
      turret.rotation.y = wreck.turret; gun.rotation.x = -0.09 * e;
    },
  };
  return api;
}
