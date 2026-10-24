// Naval effects: each ship's wake (the churned centre track and the two Kelvin arms at 19.5 deg from the bow, drawn
// as foam ribbons that follow the ship's real track), bow wave and spray when the bow digs in, and funnel smoke for
// the steam ships. One small dynamic mesh per ship; particles go through the shared fx pools.
// Ship parts the builders provide (ship frame: x starboard, y up, z aft): parts.bow, parts.stern (Vector3 at the
// waterline), parts.funnel (smoke outlet, optional), parts.fx = { wake: width scale, smoke: 0..1 } (optional).
import * as THREE from 'three';
import { canvasTex, rng } from './navkit.js';

const KELVIN = Math.tan(19.47 * Math.PI / 180);
const N = 64, STEP = 0.45;   // history points, seconds between them (~29 s of wake)
let foamTex = null;
function foam() {
  if (foamTex) return foamTex;
  foamTex = canvasTex(128, 256, (x, w, h) => {
    const r = rng(17); x.fillStyle = 'rgba(255,255,255,0)'; x.clearRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const cx = r() * w, cy = r() * h, rr = 1 + r() * 5, a = 0.15 + r() * 0.55;
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) { x.fillStyle = `rgba(255,255,255,${a})`; x.beginPath(); x.ellipse(cx + ox, cy + oy, rr * (1 + r()), rr, r() * 3, 0, 6.283); x.fill(); }
    }
  }, { srgb: true, repeat: true });
  return foamTex;
}

// seaY(x, z): the drawn sea surface height (SEAWORLD: the wake rides the waves), optional
export function createNavalFx(scene, fx, seaY = null) {
  const ships = new Map();
  const rnd = (a, b) => a + Math.random() * (b - a);
  function track(u) {
    let T = ships.get(u);
    if (T) return T;
    // 3 strips (centre, port arm, starboard arm) x N points x 2 vertices
    const nv = 5 * N * 2, pos = new Float32Array(nv * 3), col = new Float32Array(nv * 4), uv = new Float32Array(nv * 2), idx = [];
    for (let s = 0; s < 5; s++) for (let i = 0; i < N - 1; i++) { const a = (s * N + i) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: foam(), vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    mesh.frustumCulled = false; mesh.renderOrder = 2; scene.add(mesh);
    T = { mesh, g, pos, col, uv, hist: [], t: 0, smokeT: 0, sprayT: 0, u };
    ships.set(u, T); return T;
  }
  // world point of a ship-frame point (heading and heave; the small pitch / roll don't matter for effects)
  const W = (u, lx, ly, lz, out) => { const c = Math.cos(u.yaw), s = Math.sin(u.yaw); return out.set(u.p.x + lx * c + lz * s, u.p.y + (u.att ? u.att.heave : 0) + ly, u.p.z - lx * s + lz * c); };
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();

  const api = {
    ship(u, dt, ear) {
      const T = track(u), P = u.parts, D = u.dims, L = D.L, Wd = D.W, k = (P.fx && P.fx.wake) || 1;
      const bow = P.bow || _b.set(0, 0, -L / 2), st = P.stern || _b.set(0, 0, L / 2);
      // record the bow and stern every STEP seconds (and keep the newest point glued to the ship)
      T.t += dt; T.clock = (T.clock || 0) + dt;
      const bw = W(u, bow.x, 0, bow.z, new THREE.Vector3()), sw = W(u, st.x, 0, st.z, new THREE.Vector3());
      const head = { bx: bw.x, bz: bw.z, sx: sw.x, sz: sw.z, yaw: u.yaw, v: u.speed, age: 0 };
      if (T.t >= STEP || !T.hist.length) { T.t = 0; T.hist.unshift(head); if (T.hist.length > N) T.hist.pop(); }
      else T.hist[0] = head;
      for (let i = 1; i < T.hist.length; i++) T.hist[i].age += dt;
      // build the strips: path length along the bow track for the Kelvin arms' spread
      const H = T.hist, n = H.length, pos = T.pos, col = T.col, uv = T.uv, life = N * STEP;
      let sB = 0, sS = 0;
      for (let i = 0; i < N; i++) {
        const h = H[Math.min(i, n - 1)], valid = i < n;
        if (i > 0 && valid) { sB += Math.hypot(h.bx - H[i - 1].bx, h.bz - H[i - 1].bz); sS += Math.hypot(h.sx - H[i - 1].sx, h.sz - H[i - 1].sz); }
        const px = Math.cos(h.yaw), pz = -Math.sin(h.yaw);   // starboard unit vector at that time
        const fade = valid ? Math.max(0, 1 - h.age / life) : 0, vk = Math.min(1, h.v / 3.5);
        // centre wake: from the stern, widening and fading; strongest just behind the screws
        const cw = (Wd * 0.24 + sS * 0.05) * k, ca = fade * fade * vk * 0.55 * Math.min(1, 0.35 + i * 0.25);
        // Kelvin arms: points the bow passed, now pushed out by the wave crest at 19.5 deg; width grows a little
        const off = sB * KELVIN + Wd * 0.38, aw = (0.7 + sB * 0.02) * k, aa = fade * vk * 0.32 * Math.min(1, i * 0.5);
        const set = (strip, j, x, z, a, u0, v0) => { const o = ((strip * N + i) * 2 + j); pos[o * 3] = x; pos[o * 3 + 1] = (seaY ? seaY(x, z) : 0) + 0.07 + strip * 0.004; pos[o * 3 + 2] = z; col[o * 4] = col[o * 4 + 1] = col[o * 4 + 2] = 1; col[o * 4 + 3] = a; uv[o * 2] = u0; uv[o * 2 + 1] = v0; };
        set(0, 0, h.sx - px * cw, h.sz - pz * cw, ca, 0, sS / 22); set(0, 1, h.sx + px * cw, h.sz + pz * cw, ca, 1, sS / 22);
        for (const [strip, sd] of [[1, -1], [2, 1]]) {
          const cx = h.bx + px * off * sd, cz = h.bz + pz * off * sd;
          set(strip, 0, cx - px * aw, cz - pz * aw, aa, 0, sB / 14); set(strip, 1, cx + px * aw, cz + pz * aw, aa, 0.5, sB / 14);
        }
      }
      // the bow wave: the crest a hull pushes up along its forward shoulders, attached to the ship (strips 3 and 4):
      // it hugs the stem, then stands off the side and fades a third of the way aft; stronger with speed, and it
      // rises and falls with the bow (a plunging bow throws a bigger one)
      {
        const c = Math.cos(u.yaw), sn = Math.sin(u.yaw), Lb = L * 0.34, vk = Math.min(1, u.speed / 5), a0 = u.att || {};
        const plunge = Math.max(0, -((a0.vHeave || 0) - (a0.vPitch || 0) * bow.z)), amp = Math.min(1, vk * 0.75 + plunge * 0.25);
        const wl = P.waterHalf || (z => Wd * 0.4);
        for (let i = 0; i < N; i++) {
          const t = Math.min(1, i / 15), lz = bow.z + t * Lb, half = Math.max(0.2, wl(lz)), off = half + 0.4 + t * (1.2 + vk * 2.2), w = (0.5 + t * 1.3) * k;
          const a = i < 16 ? amp * Math.sin(Math.min(1, t * 3) * Math.PI / 2) * (1 - t) * 0.85 : 0;
          for (const [strip, sd] of [[3, -1], [4, 1]]) {
            const lx0 = sd * (off - w), lx1 = sd * (off + w), o0 = ((strip * N + i) * 2), y = 0.075 + strip * 0.004;
            const px0 = u.p.x + lx0 * c + lz * sn, pz0 = u.p.z - lx0 * sn + lz * c, px1 = u.p.x + lx1 * c + lz * sn, pz1 = u.p.z - lx1 * sn + lz * c;
            pos.set([px0, y, pz0, px1, y, pz1], o0 * 3); col.set([1, 1, 1, a, 1, 1, 1, a * 0.6], o0 * 4); uv.set([0, (lz + T.clock * u.speed * 0.6) / 9, 0.6, (lz + T.clock * u.speed * 0.6) / 9], o0 * 2);
          }
        }
      }
      for (const a of ['position', 'color', 'uv']) T.g.attributes[a].needsUpdate = true;
      // particles only near the camera
      const near = Math.hypot(u.p.x - ear.x, u.p.z - ear.z) < 650;
      if (!near) return;
      const sea = u.mo ? u.mo.sea.hs : 1, a = u.att || {};
      // bow wave and spray: a steady curl at speed, bursts when the bow plunges (vertical velocity at the stem)
      const vBow = (a.vHeave || 0) - (a.vPitch || 0) * bow.z;   // vertical velocity at the stem (bow down = negative)
      T.sprayT -= dt;
      const rate = u.speed * u.speed * 0.02 + Math.max(0, -vBow) * 3 * sea;
      if (T.sprayT <= 0 && rate > 0.05) {
        T.sprayT = 0.06;
        const n2 = Math.min(6, Math.round(rate * (0.5 + Math.random())));
        for (let i = 0; i < n2; i++) {
          const sd = Math.random() < 0.5 ? -1 : 1, z = bow.z + rnd(1, 5), x = sd * rnd(0.5, 2.5);
          W(u, x, 0.6, z, _a); const c = Math.cos(u.yaw), s = Math.sin(u.yaw), out = rnd(2, 5) * sd;
          fx.mix.spawn(_a.x, _a.y, _a.z, out * c + u.v.x * 0.6, rnd(2, 4.5) + Math.max(0, -vBow) * 2, -out * s + u.v.z * 0.6, rnd(0.7, 1.4), 0.6, 2.4, .9, .94, .98, 0.55, 9, 0.8);
        }
      }
      // stern boil: foam thrown up by the screws
      if (u.speed > 1 && Math.random() < u.speed * 0.08) { W(u, st.x + rnd(-2, 2), 0.3, st.z + rnd(1, 4), _a); fx.mix.spawn(_a.x, 0.4, _a.z, rnd(-1, 1), rnd(0.5, 1.5), rnd(-1, 1), rnd(0.8, 1.6), 1, 3.5, .92, .95, .98, 0.4, 3, 1); }
      // funnel smoke (steam plants): light grey-brown haze, thicker when she works up speed
      if (P.funnel && P.fx && P.fx.smoke) {
        T.smokeT -= dt;
        if (T.smokeT <= 0) {
          T.smokeT = 0.12;
          const f = P.funnel, kk = P.fx.smoke * (0.4 + Math.min(1, u.speed / 6) * 0.8);
          W(u, f.x + rnd(-0.6, 0.6), f.y, f.z + rnd(-0.6, 0.6), _a);
          const g = rnd(0.6, 0.7);   // oil-fired boilers at cruise: a light grey-brown haze, not black smoke
          fx.mix.spawn(_a.x, _a.y, _a.z, rnd(-0.3, 0.3) + u.v.x * 0.3, rnd(2.5, 4), rnd(-0.3, 0.3) + u.v.z * 0.3, rnd(7, 12), 1.6, 9 * kk + 3, g, g * 0.97, g * 0.93, 0.16 * kk + 0.06, -0.12, 0.35, 1.4);
        }
      }
    },
    remove(u) { const T = ships.get(u); if (T) { scene.remove(T.mesh); T.g.dispose(); ships.delete(u); } },
    // forget ships that are gone
    sweep(units) { for (const u of [...ships.keys()]) if (!units.includes(u) || u.gone) api.remove(u); },
  };
  return api;
}
