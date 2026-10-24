// the aircraft the rotary preview knows: how to start each one's mission in the test world, its telemetry, a turntable
import * as THREE from 'three';
import { createCH46Unit } from '../js/units/air/rotary/ch46unit.js';
import { buildCH46Mesh } from '../js/units/air/rotary/ch46model.js';
import { createMV22Unit } from '../js/units/air/rotary/mv22unit.js';
import { buildMV22Mesh } from '../js/units/air/rotary/mv22model.js';
import { createWaspUnit } from '../js/units/air/rotary/waspunit.js';
import { buildWaspMesh } from '../js/units/air/rotary/waspmodel.js';
import { buildHueyMesh } from '../js/hueymodel.js';

const f = (v, d = 0) => (+v).toFixed(d), deg = r => r * 180 / Math.PI;
const tab = rows => rows.map(([k, v]) => `${k.padEnd(11)} ${v}`).join('\n');
function turntableFor(build, groundY, anim, scale = 1) {
  return (scene, s) => {
    const m = build(); scene.add(m.group); m.group.position.set(0, 400, 0);
    const deck = new THREE.Mesh(new THREE.CircleGeometry(30, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3c4045 })); deck.position.set(0, 400 + groundY, 0); scene.add(deck);
    const grid = new THREE.GridHelper(60, 60, 0x667080, 0x50565e); grid.position.copy(deck.position).y += 0.01; scene.add(grid);
    const st = { nr: 1, ...anim, ...s };
    return { center: new THREE.Vector3(0, 400 + (scale < 1 ? 0.2 : 1), 0), scale, update(dt, t) { m.animate(st, dt, t); }, model: m, state: st };
  };
}
export const UNITS = {
  ch46: {
    label: 'CH-46E Sea Knight',
    mission(scene, W) {
      const U = createCH46Unit({ parent: scene, env: W.env, world: W.world, lz: () => W.lz(18), home: () => W.spot(-2, -2), pad: W.PAD, start: { ...W.spot(-2, -2), yaw: W.deck.yaw }, modex: 5, board: true, deck: () => W.spot(-2, -2) });
      return {
        sound: () => [{ kind: 'ch46', x: U.S.body.pos[0], y: U.S.body.pos[1], z: U.S.body.pos[2], vx: U.S.body.vel[0], vy: U.S.body.vel[1], vz: U.S.body.vel[2], nr: U.S.rpm, load: (U.S.rf.T + U.S.ra.T) / (U.S.mass * 9.81) }],
        U, chase: 32, focus: () => U.model.group, squadCenter: () => { const c = {}; return U.squad.center(c) ? c : null; }, vel: () => ({ x: U.S.body.vel[0], z: U.S.body.vel[2] }), done: () => !!U.parked || !!U.dead,
        update: (dt, t) => U.update(dt, t),
        telemetry(t) {
          const S = U.S, a = S.attitude({}), v = Math.hypot(S.body.vel[0], S.body.vel[2]);
          return `<b>CH-46E SEA KNIGHT</b>  HMM-261  13 Marines\n` + tab([
            ['time', f(t, 1) + ' s'], ['phase', `<b>${U.AI.phase}</b>`], ['ground spd', f(v * 1.944) + ' kt'], ['IAS', f(S.ias) + ' kt'], ['alt / AGL', `${f(S.body.pos[1])} / ${f(S.agl, 1)} m`],
            ['climb', f(S.vz * 196.85) + ' fpm'], ['pitch/roll', `${f(deg(a.pitch), 1)} / ${f(deg(a.roll), 1)} deg`], ['heading', f((360 - deg(a.yaw)) % 360) + ' deg'],
            ['collective', f(S.c.coll * 100) + ' %'], ['DCP stick', f(S.c.lon, 2) + ' (+aft)'], ['lat / ped', `${f(S.c.lat, 2)} / ${f(S.c.ped, 2)}`], ['LCT', f(deg(S.lct), 1) + ' deg'],
            ['NR', f(S.rpm * 100) + ' %'], ['torque', f(S.torque * 100) + ' %'], ['fwd / aft', `${f(S.rf.power / 745.7)} / ${f(S.ra.power / 745.7)} shp`], ['N1', `${f(S.eng[0].n1 * 100)} / ${f(S.eng[1].n1 * 100)} %`],
            ['dist LZ', U.AI.cmd.dist ? f(U.AI.cmd.dist) + ' m' : '-'], ['squad', `${U.squad.alive} alive, ${U.squad.holding} holding`], ['ramp', f(U.ramp * 100) + ' %'],
          ]);
        },
      };
    },
    turntable: turntableFor(() => buildCH46Mesh({ modex: 5 }), -1.8, { F: { tx: 0, ty: 0 }, A: { tx: 0, ty: 0 }, ramp: 1, run: true, n1: 0.9 }),
  },
  mv22: {
    label: 'MV-22B Osprey (RUNAWAY)',
    mission(scene, W) {
      const lz = { ...W.lz(18), x: W.PAD.x - 18, hdg: Math.PI / 2 };
      const U = createMV22Unit({ parent: scene, env: W.env, world: W.world, lz: () => lz, home: () => W.krakenSpot(-1, -36), pad: W.PAD, start: { ...W.krakenSpot(-1, -36), yaw: W.kraken.yaw }, squad: 12, board: true, deck: () => W.krakenSpot(-1, -36) });
      return {
        sound: () => [{ kind: 'mv22', x: U.S.body.pos[0], y: U.S.body.pos[1], z: U.S.body.pos[2], vx: U.S.body.vel[0], vy: U.S.body.vel[1], vz: U.S.body.vel[2], nr: U.folding ? 0 : U.S.rpm, load: (U.S.rR.T + U.S.rL.T) / (U.S.mass * 9.81), nac: U.S.nac }],
        U, chase: 40, focus: () => U.model.group, homeDeck: () => W.kraken, squadCenter: () => { const c = {}; return U.squad.center(c) ? c : null; }, vel: () => ({ x: U.S.body.vel[0], z: U.S.body.vel[2] }), done: () => !!U.parked || !!U.dead,
        update: (dt, t) => U.update(dt, t),
        telemetry(t) {
          const S = U.S, a = S.attitude({}), v = Math.hypot(S.body.vel[0], S.body.vel[2]), cor = S.corridor(S.nac * 180 / Math.PI);
          const mode = S.nac > 80 * Math.PI / 180 ? 'HELICOPTER' : S.nac < 3 * Math.PI / 180 ? 'AIRPLANE' : 'CONVERSION';
          return `<b>MV-22B OSPREY</b>  RUNAWAY refit  12 machine troopers\n` + tab([
            ['time', f(t, 1) + ' s'], ['phase', `<b>${U.AI.phase}</b>`], ['mode', `<b>${mode}</b>`], ['nacelles', `${f(deg(S.nac))} deg (cmd ${f(U.P.nacT)})`], ['corridor', `${f(Math.max(0, cor.min))} - ${f(cor.max)} KIAS`],
            ['KIAS', f(S.ias)], ['ground spd', f(v * 1.944) + ' kt'], ['alt / AGL', `${f(S.body.pos[1])} / ${f(S.agl, 1)} m`], ['climb', f(S.body.vel[1] * 196.85) + ' fpm'],
            ['pitch/roll', `${f(deg(a.pitch), 1)} / ${f(deg(a.roll), 1)} deg`], ['alpha', f(deg(S.alpha), 1) + ' deg'], ['TCL', f(S.c.tcl * 100) + ' %'], ['stick', `${f(S.c.lon, 2)} / ${f(S.c.lat, 2)} ped ${f(S.c.ped, 2)}`],
            ['rotor rpm', f(S.rpm * 412) + (S.kH < 0.5 ? ' (prop gov)' : ' (eng gov)')], ['power', f(S.power / 745.7) + ' shp'], ['wing lift', f(S.wingL / 1000) + ' kN'], ['gear / flaps', `${S.gear > 0.5 ? 'DOWN' : 'UP'} / ${f(S.flap * 100)}%`],
            ['heli loops', f(U.P.k * 100) + ' %'], ['dist LZ', U.AI.cmd.dist ? f(U.AI.cmd.dist) + ' m' : '-'], ['squad', `${U.squad.alive} alive, ${U.squad.holding} holding`], ['fold', f(U.fold * 100) + ' %'],
          ]);
        },
      };
    },
    turntable: turntableFor(() => buildMV22Mesh(), -2.22, { nac: Math.PI / 2, tR: { tx: 0, ty: 0 }, tL: { tx: 0, ty: 0 }, gear: 1, ramp: 1, flap: 1, fold: 0 }),
  },
  wasp: {
    label: 'RW-3 WASP swarm',
    // four WASPs off the KRAKEN's side of the island against a Huey flying a race-track round the island; the fifth
    // starts behind the hills to show the ambush. Pulses are drawn here (the game uses its own rounds).
    mission(scene, W) {
      const huey = buildHueyMesh(); scene.add(huey.group);
      const P0 = W.PAD, tgtAt = t => { const a = t * 18 / 95 - 1.2, x = P0.x + Math.cos(a) * 95, z = P0.z + Math.sin(a) * 95; return { x, y: 44, z, vx: -Math.sin(a) * 18, vy: 0, vz: Math.cos(a) * 18, yaw: Math.atan2(Math.sin(a), Math.cos(a)) }; };
      const bolts = [], boltG = new THREE.CylinderGeometry(0.07, 0.07, 3.2, 5).rotateX(Math.PI / 2), boltM = new THREE.MeshBasicMaterial({ color: 0x9ff8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      const fire = (p, d) => { const m = new THREE.Mesh(boltG, boltM); m.position.copy(p); m.lookAt(p.x + d.x, p.y + d.y, p.z + d.z); scene.add(m); bolts.push({ m, v: d.clone().multiplyScalar(90), t: 0 }); };
      const mk = (k, x, y, z, slots) => createWaspUnit({ parent: scene, env: W.env, world: W.world, start: { x, y, z, yaw: 0 }, home: [x, z], id: k / 5, slot: k, slots, fire });
      const ws = [0, 1, 2, 3].map(k => mk(k, P0.x - 230 + k * 9, 50, P0.z + 160, 4));
      const amb = mk(4, P0.x + 70, 26, P0.z + 40, 1);
      const all = [...ws, amb];
      let shots = 0; const fire0 = fire;
      return {
        sound: () => all.map(w => ({ kind: 'wasp', x: w.S.body.pos[0], y: w.S.body.pos[1], z: w.S.body.pos[2], vx: w.S.body.vel[0], vy: w.S.body.vel[1], vz: w.S.body.vel[2], nr: w.S.power / 260e3, chirp: w.AI.fire })),
        U: { ws, amb }, chase: 18, focus: () => ws.find(w => !w.dead)?.model.group || huey.group, vel: () => { const w = ws.find(w => !w.dead) || ws[0]; return { x: w.S.body.vel[0], z: w.S.body.vel[2] }; },
        done: () => false, homeDeck: () => W.kraken,
        update(dt, t) {
          const tg = tgtAt(t); huey.group.position.set(tg.x, tg.y, tg.z); huey.group.rotation.set(0, Math.atan2(-tg.vx, -tg.vz), -0.25); huey.animate({ nr: 1, run: true }, dt, t);
          const others = all.map(w => ({ x: w.S.body.pos[0], y: w.S.body.pos[1], z: w.S.body.pos[2], vx: w.S.body.vel[0], vy: w.S.body.vel[1], vz: w.S.body.vel[2] }));
          for (const w of ws) w.update(dt, t, t > 2 ? tg : null, { reach: 110, others });
          const closing = -((tg.x - amb.S.body.pos[0]) * tg.vx + (tg.z - amb.S.body.pos[2]) * tg.vz) / 100;
          amb.update(dt, t, t > 2 ? tg : null, { reach: 110, ambush: closing > 2, others });
          for (let i = bolts.length - 1; i >= 0; i--) { const b = bolts[i]; b.t += dt; b.m.position.addScaledVector(b.v, dt); if (b.t > 1.6) { scene.remove(b.m); bolts.splice(i, 1); } }
        },
        telemetry(t) {
          const row = (w, i) => { const S = w.S, a = S.attitude({}), v = Math.hypot(S.body.vel[0], S.body.vel[2]); return `${i}  ${w.AI.mode.padEnd(7)} ${f(v).padStart(3)} m/s  alt ${f(S.body.pos[1]).padStart(3)}  pitch ${f(deg(a.pitch)).padStart(4)}  P ${f(S.power / 1000).padStart(3)} kW  ${w.AI.fire ? '<b>FIRE</b>' : (w.dead ? 'DEAD ' + w.dead : '')}`; };
          return `<b>RW-3 WASP</b>  ducted fan, 520 kg, 260 kW\n` + tab([['time', f(t, 1) + ' s'], ['target', 'UH-1H circling at 44 m, 18 m/s']]) + '\n\n' + all.map(row).join('\n') + `\n\n(4 = the ambusher behind the hills)`;
        },
      };
    },
    turntable: turntableFor(() => buildWaspMesh(), -0.95, { fan: 0.7, pitch: 0, roll: 0, gear: 1, firing: true, alert: 1 }, 0.26),
  },
};
