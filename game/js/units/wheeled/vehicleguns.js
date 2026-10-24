// vehicleguns.js - the mounted machine guns on the wheeled vehicles (ngc/wheeledgame): the M60 on the M151A2's pedestal
// and the M2 .50 on the M35A2's M36 ring mount. GAME level (BIBLE section 3: headline figures only, game-tuned damage):
// rate of fire, muzzle velocity, belt size, gravity drop and a little dispersion; rounds hit the war's units through
// war.js (war.damage / war.hitTest, side 1), tracers every fifth round, impacts through fx.
//
//   const GUNS = createGunRounds({ scene, war, fx, terrainH, GR, audio: () => InfantryAudio | null });
//   const g = createMountedGun(GUN.M60);   g.update(dt, trigger, muzzle [x,y,z], dir [x,y,z] unit, carrierVel [x,y,z], GUNS) -> fired
//   GUNS.update(dt) every frame
import * as THREE from 'three';

// rate (rounds / min), v0 (m/s), belt (rounds per box / can), boxes carried, war damage per hit (war units; the
// Marine's M80 rifle round is 0.35, a WASP takes ~14 of those), dispersion (rad, 1 sigma, a pintle mount on a moving
// vehicle), the vehicledamage kind the round counts as
export const GUN = {
  M60: { name: 'M60', rpm: 550, v0: 853, belt: 100, boxes: 6, dmg: 0.38, disp: 0.0035, kind: 'rifle', sound: 'M60', reload: 4.5 },   // 7.62 mm NATO M80 ball / M62 tracer 4:1
  M2: { name: 'M2 .50', rpm: 500, v0: 890, belt: 100, boxes: 4, dmg: 1.1, disp: 0.0028, kind: 'hmg', sound: 'M2', reload: 6 },      // .50 BMG M33 ball / M17 tracer 4:1
};
const G = 9.81;

export function createMountedGun(spec) {
  const g = { spec, belt: spec.belt, boxes: spec.boxes - 1, cd: 0, reloadT: 0, fired: 0, heat: 0, n: 0, flash: 0 };
  g.reload = () => { if (g.reloadT > 0 || g.boxes <= 0 || g.belt === spec.belt) return false; g.reloadT = spec.reload; return true; };
  g.resupply = () => { g.belt = spec.belt; g.boxes = spec.boxes - 1; g.reloadT = 0; };
  g.update = (dt, trigger, muz, dir, carrier, rounds) => {
    g.cd -= dt; g.flash = Math.max(0, g.flash - dt); g.heat = Math.max(0, g.heat - dt * 0.02);
    if (g.reloadT > 0) { g.reloadT -= dt; if (g.reloadT <= 0) { g.boxes--; g.belt = spec.belt; } return 0; }
    if (!trigger) { g.cd = Math.max(g.cd, 0); return 0; }
    if (g.belt <= 0) { if (g.boxes > 0) g.reload(); return 0; }
    let n = 0;
    while (g.cd <= 0 && g.belt > 0) {
      g.cd += 60 / spec.rpm; g.belt--; g.n++; n++; g.heat = Math.min(1, g.heat + 0.004);
      const s = spec.disp * (1 + g.heat * 2);
      const dx = dir[0] + gauss() * s, dy = dir[1] + gauss() * s, dz = dir[2] + gauss() * s, l = Math.hypot(dx, dy, dz);
      rounds.fire(muz, dx / l * spec.v0 + carrier[0], dy / l * spec.v0 + carrier[1], dz / l * spec.v0 + carrier[2], spec, g.n % 5 === 0);
    }
    if (n) { g.flash = 0.06; rounds.report(spec, muz); }
    return n;
  };
  return g;
}
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;

// every round in flight, for every vehicle gun: swept against the ground (terrain, decks, the sea) and the war's units
export function createGunRounds({ scene, war, fx, terrainH, GR, audio = () => null }) {
  const MAX = 160, R = [];
  // tracers: one line segment each (the round's last 0.03 s of travel), additive orange
  const pos = new Float32Array(MAX * 6), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setDrawRange(0, 0);
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffb050, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  lines.frustumCulled = false; scene.add(lines);
  const _v = new THREE.Vector3();
  const api = {
    rounds: R, hits: 0, fired: 0, log: [],   // log: the last impacts { x, y, z, where, hit } (tests)
    fire(p, vx, vy, vz, spec, tracer) { if (R.length >= MAX) R.shift(); R.push({ x: p[0], y: p[1], z: p[2], vx, vy, vz, t: 0, spec, tracer }); api.fired++; },
    report(spec, p) { const A = audio(); if (A) A.shot({ weapon: spec.sound, dist: 0 }); },
    update(dt) {
      let nl = 0;
      for (let i = R.length - 1; i >= 0; i--) {
        const b = R[i], x0 = b.x, y0 = b.y, z0 = b.z;
        b.vy -= G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.t += dt;
        let done = b.t > 2.6, hit = null, hx = b.x, hy = b.y, hz = b.z, where = 'ground';
        // walk the segment in 2.5 m steps: the ground / sea / a deck, then the war's units
        const L = Math.hypot(b.x - x0, b.y - y0, b.z - z0), n = Math.max(1, Math.ceil(L / 2.5));
        for (let k = 1; k <= n && !done; k++) {
          const f = k / n, x = x0 + (b.x - x0) * f, y = y0 + (b.y - y0) * f, z = z0 + (b.z - z0) * f;
          const t = terrainH(x, z), d = war.deckY(x, z, 1);
          if (y < Math.max(t, 0) || (d > -1e8 && y < d && y > d - 4)) { done = true; hx = x; hy = Math.max(y, t, 0); hz = z; where = t < 0 && d < -1e8 ? 'water' : 'ground'; break; }
          hit = war.hitTest(x, y, z, 1, 0.3);
          if (hit) { done = true; hx = x; hy = y; hz = z; where = 'metal'; break; }
          const tr = GR.treeHit && k === 1 ? GR.treeHit(x0, y0, z0, b.x, b.y, b.z) : null;
          if (tr) { done = true; const q = tr.t; hx = x0 + (b.x - x0) * q; hy = y0 + (b.y - y0) * q; hz = z0 + (b.z - z0) * q; where = 'ground'; break; }
        }
        if (done) {
          if (b.t <= 2.6) {
            if (hit) { war.damage(hit, b.spec.dmg, 1); api.hits++; }
            fx.impact(hx, hy, hz, where);
            api.log.push({ x: +hx.toFixed(1), y: +hy.toFixed(1), z: +hz.toFixed(1), where, hit: hit ? (hit.kind || hit.type || 'unit') : null }); if (api.log.length > 24) api.log.shift();
          }
          R.splice(i, 1); continue;
        }
        if (b.tracer && nl < MAX) {   // a streak from where it was 0.03 s ago
          const o = nl * 6; pos[o] = b.x - b.vx * 0.03; pos[o + 1] = b.y - b.vy * 0.03; pos[o + 2] = b.z - b.vz * 0.03; pos[o + 3] = b.x; pos[o + 4] = b.y; pos[o + 5] = b.z; nl++;
        }
      }
      geo.setDrawRange(0, nl * 2); geo.attributes.position.needsUpdate = true; void _v;
    },
    clear() { R.length = 0; geo.setDrawRange(0, 0); },
  };
  return api;
}
