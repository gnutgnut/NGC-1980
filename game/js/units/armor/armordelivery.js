// armordelivery.js - getting armour to the islands (wave 2): an LCM-8 from the task force's amphibious group motors in
// to a friendly island's beach with an M60A3 or an M113A2 in its well, grounds, drops its ramp, the vehicle's crew drives
// it off and up the beach (the AI driver, armordriver.js), the ramp comes up and the boat backs off and leaves.
// The boat is a platform for armorworld.js, so the vehicle rides it under its own physics (platform carry, as on a ship).
//
//   const DL = createArmorDelivery({ scene, AW, terrainH, beach(I, toward), fx, sfx, say, feed, camZ });
//   DL.start(def, I, toward) -> { ok, why, run }    DL.update(dt)    DL.busy(def)    DL.clear()    DL.runs
import * as THREE from 'three';
import { LCM8, lcmDeck, buildLCM8Mesh, lcmSound } from './lcm8.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export function createArmorDelivery(ctx) {
  const { scene, AW, terrainH, fx } = ctx;
  const DL = { runs: [] };
  const fwd = yaw => [-Math.sin(yaw), -Math.cos(yaw)];
  const toWorld = (P, lx, lz) => { const c = Math.cos(P.yaw), s = Math.sin(P.yaw); return [P.p.x + lx * c + lz * s, P.p.z - lx * s + lz * c]; };
  // where to land on island I: a beach facing `toward`, the spot offshore where the ramp's toe meets 1.1 m of water, and a
  // straight run in over open water (other beaches round the island if that one won't do)
  // a landing beach of our own: round the island every 4 degrees, the shoreline, then a gentle climb inland (an LCM
  // puts a tank ashore where the ground rises less than ~1 in 3 for 25 m and nothing stands in the way)
  function landings(I, toward) {
    const out = [], a0 = toward ? Math.atan2(toward[1] - I.z, toward[0] - I.x) : 0;
    for (let k = 0; k < 180; k++) {
      const a = k * Math.PI / 90, cx = Math.cos(a), sz = Math.sin(a);
      let shore = -1;
      for (let r = 8; r < (I.r || 80) + 160; r += 1) if (terrainH(I.x + cx * r, I.z + sz * r) < 0) { shore = r; break; }
      if (shore < 0) continue;
      let ok = true, worst = 0;
      for (let s = 0; s <= 26 && ok; s += 2) {   // inland from the waterline: gentle along and across
        const r = shore - s, x = I.x + cx * r, z = I.z + sz * r, h = terrainH(x, z);
        const along = Math.abs(terrainH(x + cx * 2, z + sz * 2) - terrainH(x - cx * 2, z - sz * 2)) / 4, across = Math.abs(terrainH(x - sz * 2.5, z + cx * 2.5) - terrainH(x + sz * 2.5, z - cx * 2.5)) / 5;
        worst = Math.max(worst, along, across * 1.5);
        if (along > 0.58 || across > 0.3 || h > 24) ok = false;   // the M60 climbs 60 % and holds a 30 % side slope (C)
        if (s >= 6 && ctx.blocked && ctx.blocked(x, z)) ok = false;
      }
      if (!ok) continue;
      const bx = I.x + cx * (shore - 6), bz = I.z + sz * (shore - 6);
      const d = toward ? Math.abs(Math.atan2(Math.sin(a - a0), Math.cos(a - a0))) : 0;
      out.push({ name: `${I.name} BEACH`, x: bx, z: bz, y: terrainH(bx, bz), yaw: Math.atan2(cx, sz), score: worst + d * 0.15 });   // nose inland
    }
    return out.sort((p, q) => p.score - q.score);
  }
  DL.landings = landings;
  function plan(I, toward) {
    // the island's landing hard (landinghard.js): the ramp's toe goes down on the concrete in 0.6 m of water
    const hd = (ctx.hards || []).find(h => h.I === I);
    if (hd) {
      const toeU = -8, reach = -LCM8.BOW + LCM8.RAMP.len * 0.97, c = hd.at(toeU - reach), fx_ = hd.fx, fz_ = hd.fz;
      let ok = true;
      for (let s = 20; s <= 200 && ok; s += 10) if (terrainH(c[0] - fx_ * s, c[1] - fz_ * s) > -1.8) ok = false;   // a clear run in
      if (ok) {
        const b = { name: hd.name, x: hd.at(4)[0], z: hd.at(4)[1], yaw: hd.yaw }, down = -Math.asin(clamp((LCM8.WELL.y - hd.y(toeU)) / LCM8.RAMP.len, 0.04, 0.45));
        return { beach: b, hard: hd, stop: c, yaw: hd.yaw, down, start: [c[0] - fx_ * (DL.runIn || 170), c[1] - fz_ * (DL.runIn || 170)], inland: hd.at(hd.u1 + 10) };
      }
    }
    const gb = ctx.beach(I, toward);
    for (const b of [...(gb ? [gb] : []), ...landings(I, toward)]) {
      const [fx_, fz_] = fwd(b.yaw);   // inland
      // the ramp's toe goes down on the sand in ~0.4 m of water; the bow (forefoot) grounds in ~0.8 m, the stern floats
      let tip = null;
      for (let s = 0; s < 140; s += 0.5) { const x = b.x - fx_ * s, z = b.z - fz_ * s; if (terrainH(x, z) < -0.35) { tip = [x, z]; break; } }
      if (!tip) continue;
      const reach = -LCM8.BOW + LCM8.RAMP.len * 0.97;
      const c = [tip[0] - fx_ * reach, tip[1] - fz_ * reach];
      let ok = terrainH(c[0] + fx_ * (-LCM8.BOW - 0.5), c[1] + fz_ * (-LCM8.BOW - 0.5)) < -0.55;   // the forefoot has water
      for (let s = -4; s <= 10 && ok; s += 3) for (const lat of [-2.5, 2.5]) { const x = c[0] - fx_ * s + fz_ * lat, z = c[1] - fz_ * s - fx_ * lat; if (terrainH(x, z) > -0.9 - s * 0.05) ok = false; }   // afloat aft of the bow
      for (let s = 20; s <= 200 && ok; s += 10) if (terrainH(c[0] - fx_ * s, c[1] - fz_ * s) > -1.8) ok = false;   // a clear run in
      if (!ok) continue;
      const toeY = terrainH(tip[0], tip[1]), down = -Math.asin(clamp((LCM8.WELL.y - toeY) / LCM8.RAMP.len, 0.04, 0.45));
      return { beach: b, stop: c, yaw: b.yaw, down, start: [c[0] - fx_ * (DL.runIn || 170), c[1] - fz_ * (DL.runIn || 170)], inland: [b.x + fx_ * 14, b.z + fz_ * 14] };
    }
    return null;
  }
  DL.plan = plan;
  // the boat's radio calls (to the beachmaster) in the feed
  const radio = (r, t) => ctx.feed?.(`LCM ${r.hull}: ${t}`);
  DL.busy = def => DL.runs.some(r => r.def === def && r.state !== 'leaving');
  DL.start = (def, I, toward) => {
    const pl = plan(I, toward); if (!pl) return { ok: false, why: `NO BEACH ON ${I.name} A LANDING CRAFT CAN USE` };
    const hull = `8-${41 + ((DL.count = (DL.count || 0) + 1) - 1) % 30}`;   // the boat's number, painted on both bows
    const model = buildLCM8Mesh({ num: hull }); scene.add(model.group);
    const P = { name: 'LCM-8', type: 'lcm', p: { x: pl.start[0], y: 0, z: pl.start[1] }, yaw: pl.yaw, ramp: LCM8.RAMP.up, gone: false };
    P.deck = (lx, lz) => lcmDeck(lx, lz, P.ramp);
    P.dry = (lx, lz) => Math.abs(lx) < LCM8.B / 2 && lz > LCM8.BOW && lz < LCM8.STERN;
    AW.addPlatform(P);
    const run = { P, model, def, pl, I, hull, state: 'inbound', t: 0, v: LCM8.SPEED, snd: null, wakeT: 0 };
    // the vehicle in the well, nose to the ramp
    const [vx, vz] = toWorld(P, 0, -1.2);   // (aft enough that the gun clears the raised ramp)
    def.spawnAt({ x: vx, z: vz, yaw: P.yaw, plat: P });
    DL.runs.push(run);

    const eta = Math.round(Math.hypot(pl.stop[0] - P.p.x, pl.stop[1] - P.p.z) / LCM8.SPEED + 10);
    ctx.feed?.(`BEACHMASTER: LCM ${run.hull} WITH ONE ${def.label}, ETA ${pl.beach.name} ${eta} S`, 'good');
    return { ok: true, run };
  };
  const _v = new THREE.Vector3();
  DL.update = dt => {
    for (let i = DL.runs.length - 1; i >= 0; i--) {
      const r = DL.runs[i], P = r.P, pl = r.pl; r.t += dt;
      const [fx_, fz_] = fwd(P.yaw);
      let speed = 0, rpm = 900, load = 0.15;
      if (r.state === 'inbound') {
        const d = Math.hypot(pl.stop[0] - P.p.x, pl.stop[1] - P.p.z);
        speed = Math.min(LCM8.SPEED, 0.3 + d * 0.16); rpm = 1300 + 900 * speed / LCM8.SPEED; load = 0.7;
        const step = Math.min(d, speed * dt); P.p.x += fx_ * step; P.p.z += fz_ * step;
        // the stern (kedge) anchor goes over ~50 m out, so the boat can winch itself back off the beach
        if (!r.anchor && d < 50) { r.anchor = true; const [ax, az] = toWorld(P, 1.6, LCM8.STERN + 1); fx.splash(ax, az, 0.5); radio(r, 'STERN ANCHOR AWAY'); }
        if (d < 0.25) { r.state = 'beached'; r.t = 0; r.def.crankUp?.(); radio(r, `BEACHED ON ${pl.beach.name}  -  RAMP GOING DOWN`); }
      } else if (r.state === 'beached') {
        rpm = 1000; load = 0.3;   // holding her on the beach with the engines
        P.ramp = Math.max(pl.down, P.ramp - dt * (LCM8.RAMP.up - pl.down) / 7);
        if (P.ramp <= pl.down + 1e-3 && r.t > 7.5) {
          r.state = 'unload'; r.t = 0;
          const [tx, tz] = toWorld(P, 0, LCM8.BOW - 4.5);
          r.def.order(pl.hard ? [[tx, tz], pl.hard.at(pl.hard.u1 - 2), pl.inland] : [[tx, tz], pl.inland], { speed: 2.6, arrive: 3 });   // straight up the hard
        }
      } else if (r.state === 'unload') {
        rpm = 1000; load = 0.3;
        const f = r.def.fm.origin(), ahead = (f[0] - P.p.x) * fx_ + (f[2] - P.p.z) * fz_;
        if (ahead > -LCM8.BOW + 7 || r.t > 70 || r.def.dead || !r.def.exists) {
          r.state = 'rampUp'; r.t = 0;
          if (!r.def.dead && r.def.exists) ctx.feed?.(`BEACHMASTER: ${r.def.label} ASHORE AT ${pl.beach.name}`, 'good');
          radio(r, 'RAMP COMING UP');
        }
      } else if (r.state === 'rampUp') {
        P.ramp = Math.min(LCM8.RAMP.up, P.ramp + dt * (LCM8.RAMP.up - pl.down) / 6);
        if (P.ramp >= LCM8.RAMP.up - 1e-3) { r.state = 'backing'; r.t = 0; r.back = 0; radio(r, 'RETRACTING  -  HEAVING IN ON THE STERN ANCHOR'); }
      } else if (r.state === 'backing') {   // astern off the beach, then round and away
        speed = -Math.min(2.2, 0.4 + r.t * 0.4); rpm = 1600; load = 0.6;
        P.p.x += fx_ * speed * dt; P.p.z += fz_ * speed * dt; r.back += -speed * dt;
        if (r.back > 35) { r.state = 'turning'; r.t = 0; r.turned = 0; }
      } else if (r.state === 'turning') {
        speed = 2.5; rpm = 1700; load = 0.6; const w = 0.16; P.yaw += w * dt; r.turned += w * dt;
        P.p.x += fx_ * speed * dt; P.p.z += fz_ * speed * dt;
        if (r.turned > Math.PI) { r.state = 'leaving'; r.t = 0; r.anchor = false; radio(r, 'CLEAR OF THE BEACH, RETURNING TO THE GROUP'); }
      } else if (r.state === 'leaving') {
        speed = Math.min(LCM8.SPEED_LIGHT, 2.5 + r.t * 0.4); rpm = 2000; load = 0.8;
        P.p.x += fx_ * speed * dt; P.p.z += fz_ * speed * dt;
        if (r.t > 50) { P.gone = true; AW.removePlatform(P); scene.remove(r.model.group); r.snd?.stop(); DL.runs.splice(i, 1); continue; }
      }
      P.p.y = 0.04 * Math.sin(r.t * 0.9 + i) + (r.state === 'inbound' || r.state === 'leaving' ? 0 : 0);
      // the model, wake and spray, the diesels
      r.model.group.position.set(P.p.x, P.p.y, P.p.z); r.model.group.rotation.set(0, P.yaw, 0, 'YXZ');   // (no trim: the deck the vehicle rides is level)
      r.model.animate({ ramp: P.ramp, anchorOut: !!r.anchor });
      r.wakeT -= dt;
      if (Math.abs(speed) > 0.8 && r.wakeT <= 0) {
        r.wakeT = 0.18;
        const [sx, sz] = toWorld(P, 0, speed > 0 ? LCM8.STERN + 1 : LCM8.BOW - 1); fx.wake(sx, sz, 1.6);
        const [bx, bz] = toWorld(P, (Math.random() - 0.5) * 6, speed > 0 ? LCM8.BOW + 0.5 : LCM8.STERN);
        for (let k = 0; k < 2; k++) fx.mix.spawn(bx, 0.3, bz, (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.9, 0.6, 2, 0.86, 0.92, 0.97, 0.55, 8, 0.6);
      }
      if (Math.random() < dt * (load > 0.5 ? 6 : 2)) { const [ex, ez] = toWorld(P, Math.random() < 0.5 ? -2.2 : 2.2, 8.6); const g = 0.3; fx.mix.spawn(ex, LCM8.STERN_DECK + 1.8, ez, 0, 1.2, 0, 2, 0.4, 2.2, g, g, g, 0.35, -0.2, 0.8, 1.2); }
      if (!r.snd) r.snd = lcmSound(ctx.sfx);
      const cam = ctx.camZ?.(); if (r.snd && cam) r.snd.update(rpm, load, cam.position.distanceTo(_v.set(P.p.x, 1, P.p.z)));
    }
  };
  DL.silence = () => { for (const r of DL.runs) r.snd?.stop(); };
  DL.clear = () => { for (const r of DL.runs) { r.P.gone = true; AW.removePlatform(r.P); scene.remove(r.model.group); r.snd?.stop(); } DL.runs.length = 0; };
  return DL;
}
