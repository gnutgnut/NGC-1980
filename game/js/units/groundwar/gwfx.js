// THE GROUND WAR, readable (ngc/rwground-polish): what a fight on an island looks like from a helicopter a kilometre
// out and from the map.
//   * tracers: one instanced pool of camera-facing ribbons for every ground-war round in flight near the camera. Red-orange for the 1980 side
//     (the M60's belts run four ball to one tracer; riflemen's magazines carry a few), pale cyan for the machines (the
//     coil carbines' darts glow all the way, their seized rifles and coax load machine tracer), a hot white streak for
//     a tank round. GAME look, not ballistics: the streak is the last ~35 ms of the round's path.
//   * damage you can see on the living: smoke from a hurt vehicle's engine deck or a wrecked lift fan's duct, sparks
//     from a STRIDER's stumps, dust behind tracks, the RW-7's skirt blowing dust (or spray over the sea); a thin wisp
//     off a fresh wreck
//   * the machines' chatter: their squad decisions (contact, flank, bound, withdraw, LINK LOST) as FM chirp phrases near
//     the camera (runaway/rwaudio.js), from the squad AI's decision log
//   * the map: ground units on the minimap and the big map (ours always, theirs where the fog lets you see), wrecks,
//     landing craft, and a pulsing CONTACT ring round every island with a fight on it
import * as THREE from 'three';
import { RW7 } from '../runaway/hovertank.js';

const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
// the share of each ammunition that shows a tracer (game look)
const TRACER = { m60: 0.25, mg: 0.25, m16: 0.12, rifle: 0.12, hmg: 0.25, cannon20: 0.2, xm7: 0.2, needle: 1, coil120: 1, mbt120: 1, mbt125: 1, pd: 0.35 };
const COL = { 1: [1, 0.3, 0.06], 2: [0.3, 0.9, 1], tank: [1, 0.92, 0.7] };

export function createGroundFx({ root, fx, GS, hAt }) {
  // a ribbon per tracer: a unit quad stretched along the round's last ~22 ms, turned to face the camera, at least ~1.5
  // pixels wide however far off (a GL line is one pixel and vanishes at the game's render scale); bright at the head,
  // fading out to the tail (vertex alpha), the instance colour the tracer's
  const MAX = 600;
  const qg = new THREE.PlaneGeometry(1, 1), qp = qg.attributes.position, qc = new Float32Array(qp.count * 4);
  for (let i = 0; i < qp.count; i++) { const head = qp.getX(i) > 0; qc[i * 4] = qc[i * 4 + 1] = qc[i * 4 + 2] = 1; qc[i * 4 + 3] = head ? 1 : 0; }   // (alpha: the tail fades out)
  qg.setAttribute('color', new THREE.BufferAttribute(qc, 4));
  const lines = new THREE.InstancedMesh(qg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }), MAX);
  lines.instanceMatrix.setUsage(THREE.DynamicDrawUsage); lines.setColorAt(0, new THREE.Color(1, 1, 1)); lines.instanceColor.setUsage(THREE.DynamicDrawUsage);
  lines.name = 'gwTracers'; lines.frustumCulled = false; lines.renderOrder = 3; lines.count = 0; root.add(lines);
  const F = { lines, tracers: 0 };
  const _d = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4(), _col = new THREE.Color();

  // ------------------------------------------------------------------------------------------- tracers
  F.tracersUpdate = (ear) => {
    let n = 0;
    for (const p of GS.proj) {
      if (n >= MAX) break;
      if (p.frag || p.gl || p.ammo === 'law') continue;   // (grenades and the LAW's rocket: no tracer)
      if (p.tr === undefined) p.tr = Math.random() < (TRACER[p.ammo] ?? 0.15);
      if (!p.tr) continue;
      const dx = p.x - ear.x, dy = p.y - ear.y, dz = p.z - ear.z, dist = Math.hypot(dx, dy, dz); if (dist > 1100) continue;
      const v = Math.hypot(p.vx, p.vy, p.vz) || 1, L = Math.min(p.big ? 40 : 22, v * 0.022);
      _d.set(p.vx / v, p.vy / v, p.vz / v);
      _c.set(p.x - _d.x * L / 2, p.y - _d.y * L / 2, p.z - _d.z * L / 2);
      _n.set(ear.x - _c.x, ear.y - _c.y, ear.z - _c.z).normalize();
      _s.crossVectors(_d, _n); if (_s.lengthSq() < 1e-6) _s.set(0, 1, 0); _s.normalize();
      const w = Math.max(p.big ? 0.2 : 0.06, dist * 0.0032);
      _n.crossVectors(_d, _s);
      _m.makeBasis(_d.multiplyScalar(L), _s.multiplyScalar(w), _n).setPosition(_c);
      lines.setMatrixAt(n, _m);
      const c = p.big ? COL.tank : COL[p.side] || COL[1]; lines.setColorAt(n, _col.setRGB(c[0], c[1], c[2]));
      n++;
    }
    lines.count = n; lines.instanceMatrix.needsUpdate = true; if (lines.instanceColor) lines.instanceColor.needsUpdate = true;
    lines.visible = n > 0; F.tracers = n;
  };

  // ------------------------------------------------------------------------------------------- damage + movement effects
  let acc = 0;
  const _v = new THREE.Vector3();
  F.unitsUpdate = (dt, ear, views) => {
    acc += dt; if (acc < 0.05) return; const h = acc; acc = 0;   // (20 Hz is plenty for smoke and dust)
    for (const u of GS.units) {
      if (u.kind === 'marine') continue;
      const dx = u.x - ear.x, dz = u.z - ear.z, d2 = dx * dx + dz * dz; if (d2 > 520 * 520) continue;
      const s = u.sim, V = views.get(u.id), fogOk = u.fogVis !== false; if (!fogOk) continue;
      if (u.kind === 'strider') {
        if (u.alive && !u.lite && V && V.stumps && V.stumps.length && Math.random() < 6 * h) {
          // sparks off a stump: a shower of short-lived additive bits from the hip / shoulder
          const p = s.pose(), k = V.stumps[Math.floor(Math.random() * V.stumps.length)];
          const at = k === 'legL' ? p.legs[0].knee : k === 'legR' ? p.legs[1].knee : k === 'armL' ? p.arms[0].elbow : p.arms[1].elbow;
          for (let i = 0; i < 5; i++) fx.add.spawn(at[0], at[1], at[2], rnd(-2, 2), rnd(0.5, 3), rnd(-2, 2), rnd(0.15, 0.4), 0.12, 0.05, 1, rnd(0.7, 0.95), 0.45, 1, 9, 0.4);
        }
        if (!u.alive && u.deadT < 25 && Math.random() < 3 * h) fx.mix.spawn(u.x + rnd(-0.3, 0.3), u.y + 0.4, u.z + rnd(-0.3, 0.3), rnd(-0.2, 0.2), rnd(0.6, 1.2), rnd(-0.2, 0.2), rnd(3, 5), 0.3, 2.2, .22, .22, .22, 0.35, -0.1, 0.5, 1);
        continue;
      }
      if (!u.alive) continue;   // (wrecks burn: fx.burn from the kill)
      const hp = u.hp ?? 1, fwdx = -Math.sin(u.yaw), fwdz = -Math.cos(u.yaw), sp = Math.hypot(u.vx || 0, u.vz || 0), gy = hAt(u.x, u.z);
      // a hurt vehicle smokes from its engine deck, blacker and thicker the worse it is
      const smoky = u.kind === 'mbt' ? (s.hp.engine <= 0 ? 1 : hp < 0.6 ? (0.6 - hp) / 0.6 : 0) : hp < 0.6 ? (0.6 - hp) / 0.6 : 0;
      if (smoky > 0 && Math.random() < (2 + 10 * smoky) * h) {
        const back = u.kind === 'mbt' ? 2.8 : 2.4, g = 0.32 - smoky * 0.22;
        fx.mix.spawn(u.x - fwdx * back + rnd(-0.5, 0.5), u.y + 2.0, u.z - fwdz * back + rnd(-0.5, 0.5), rnd(-0.3, 0.3), rnd(1.2, 2.4), rnd(-0.3, 0.3), rnd(3, 6), 0.8, 4 + 4 * smoky, g, g, g * 1.02, 0.5, -0.2, 0.6, 1.2);
      }
      if (u.kind === 'hovertank') {
        // a wrecked fan's duct smokes; the skirt blows dust off the ground (or spray off the sea) all round
        for (let i = 0; i < 4; i++) if (s.fanHp && s.fanHp[i] <= 0 && Math.random() < 4 * h) { const [cx, cz] = RW7.CELLS[i]; _v.set(cx, 0.9, cz).applyAxisAngle(THREE.Object3D.DEFAULT_UP, u.yaw); fx.mix.spawn(u.x + _v.x, u.y + 1.6, u.z + _v.z, rnd(-0.2, 0.2), rnd(1.5, 2.5), rnd(-0.2, 0.2), rnd(3, 5), 0.6, 3.5, .14, .14, .14, 0.55, -0.2, 0.6, 1.2); }
        const fan = (s.fan[0] + s.fan[1] + s.fan[2] + s.fan[3]) / 4, rate = (fan * 6 + sp * 0.8) * h * (d2 < 250 * 250 ? 1 : 0.4);
        for (let i = 0; i < rate; i++) {
          const a = rnd(6.283), r = 2.6, wx = u.x + Math.cos(a) * r * 1.5, wz = u.z + Math.sin(a) * r * 1.5, wet = hAt(wx, wz) < 0.05, out = rnd(4, 9);
          if (wet) fx.mix.spawn(wx, 0.3, wz, Math.cos(a) * out, rnd(0.5, 1.8), Math.sin(a) * out, rnd(0.8, 1.5), 0.8, 3.2, .86, .92, .97, 0.35, 1.5, 1.4, 0.3);
          else fx.mix.spawn(wx, Math.max(gy, 0) + 0.3, wz, Math.cos(a) * out, rnd(0.3, 1.2), Math.sin(a) * out, rnd(1, 2), 0.8, 3.5, .58, .52, .42, 0.3, 0.3, 1.4, 0.4);
        }
      } else if (u.kind === 'mbt' && sp > 2 && gy > 0.4 && Math.random() < sp * 0.45 * h * 10) {
        // dust off the tracks, thrown up behind
        for (const side of [-1, 1]) { const rx = Math.cos(u.yaw) * side * 1.6, rz = -Math.sin(u.yaw) * side * 1.6; fx.mix.spawn(u.x - fwdx * 3.8 + rx, gy + 0.4, u.z - fwdz * 3.8 + rz, -fwdx * 1.5 + rnd(-0.5, 0.5), rnd(0.5, 1.5), -fwdz * 1.5 + rnd(-0.5, 0.5), rnd(1.5, 2.8), 1, 4 + sp * 0.3, .6, .54, .43, 0.32, 0.2, 1.1, 0.6); }
      }
    }
  };

  // ------------------------------------------------------------------------------------------- the machines' chatter
  const CHIRP = { contact: 'contact', flank: 'ack', assault: 'contact', retreat: 'down', regroup: 'ack', 'LINK LOST': 'lost', defend: 'ack' };
  F.chatter = (rwa, ear) => {
    for (const B of GS.battles) {
      const log = B.rw.log; if (!log) continue;
      if (B.logI === undefined) B.logI = log.length;
      for (; B.logI < log.length; B.logI++) {
        const L = log[B.logI], kind = CHIRP[L.st]; if (!kind || !rwa) continue;
        const S = B.rw.squads.find(q => q.id === L.sq); if (!S || S.cx === undefined) continue;
        if (Math.hypot(S.cx - ear.x, S.cz - ear.z) > 140) continue;
        rwa.event({ e: 'chirp', kind, x: S.cx, y: (S.members[0]?.y ?? 0) + 1.9, z: S.cz });
      }
      if (log.length > 400) { log.splice(0, log.length - 200); B.logI = Math.min(B.logI, log.length); }   // (the AI's log would grow all war)
    }
  };

  // ------------------------------------------------------------------------------------------- the map
  // ctx: the radar canvas; px / py: world -> canvas; big: the full map; fog: fog of war; t: game time; lcacs
  F.drawMap = (ctx, px, py, big, fog, t, lcacs, islands) => {
    // a fight on an island: a pulsing ring (the radio net knows where the shooting is)
    const s1 = new Set(), s2 = new Set();
    for (const u of GS.units) if (u.alive && u.B) (u.side === 1 ? (u.able ? s1 : null) : s2)?.add(u.B.I);
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    for (const I of islands) {
      if (!s1.has(I) || !s2.has(I)) continue;
      const X = px(I.pad.x), Y = py(I.pad.z), r = (big ? 16 : 8) + pulse * (big ? 5 : 3);
      ctx.strokeStyle = `rgba(255,150,40,${0.5 + 0.5 * pulse})`; ctx.lineWidth = big ? 2.5 : 1.5; ctx.beginPath(); ctx.arc(X, Y, r, 0, 6.283); ctx.stroke();
      if (big) { ctx.fillStyle = '#fb6'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left'; ctx.fillText('CONTACT', X + r + 3, Y - 10); }
    }
    for (const u of GS.units) {
      if (u.side === 2 && !(fog.visibleAt(u.x, u.z))) continue;
      const X = px(u.x), Y = py(u.z);
      if (!u.alive) { if (big && u.vehicle) { ctx.strokeStyle = '#777'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X - 3, Y - 3); ctx.lineTo(X + 3, Y + 3); ctx.moveTo(X + 3, Y - 3); ctx.lineTo(X - 3, Y + 3); ctx.stroke(); } continue; }
      if (u.kind === 'marine') { if (!u.able) continue; ctx.fillStyle = '#7ef'; const r = big ? 1.6 : 1; ctx.fillRect(X - r, Y - r, 2 * r, 2 * r); continue; }
      ctx.fillStyle = '#f64'; ctx.strokeStyle = '#f64';
      if (u.kind === 'strider') { const r = big ? 2.4 : 1.6; ctx.beginPath(); ctx.moveTo(X, Y - r); ctx.lineTo(X + r, Y); ctx.lineTo(X, Y + r); ctx.lineTo(X - r, Y); ctx.closePath(); ctx.fill(); continue; }
      // armour: a block with its heading
      const r = big ? 4 : 2.6, fx_ = -Math.sin(u.yaw), fz = -Math.cos(u.yaw);
      ctx.fillRect(X - r, Y - r, 2 * r, 2 * r); ctx.lineWidth = big ? 2 : 1.2; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + fx_ * r * 2.4, Y + fz * r * 2.4); ctx.stroke();
      if (big) { ctx.font = '10px monospace'; ctx.textAlign = 'left'; ctx.fillText(u.kind === 'hovertank' ? 'RW-7' : u.mbtType === 't90m' ? 'T-90M' : 'M1A2', X + 7, Y + 3); }
    }
    for (const L of lcacs) {
      if (!fog.visibleAt(L.x, L.z)) continue;
      const X = px(L.x), Y = py(L.z), r = big ? 5 : 3;
      ctx.strokeStyle = '#f64'; ctx.lineWidth = 1.5; ctx.strokeRect(X - r, Y - r, 2 * r, 2 * r);
      if (big) { ctx.fillStyle = '#f64'; ctx.font = '10px monospace'; ctx.textAlign = 'left'; ctx.fillText('LCAC', X + 8, Y + 3); }
    }
  };
  F.dispose = () => { root.remove(lines); lines.dispose(); qg.dispose(); };
  return F;
}
