// INTERIORS (ngc/interiors): seats and the people in them.
//
//   RIDE - a craft (craft.js) that is a seat in someone else's machine: the Huey's troop bench, the CH-46's troop seats
//          by the ramp (the AI crew flies you to the landing zone), a seat in anything that offers RIDE_SEATS. Y at the
//          door of a free seat gets you in (the host's own seats - the pilot's - stay the host craft's); [ ] moves along
//          the bench (or up to the host's pilot seat when it is a craft you can fly); Y gets you out once it has landed;
//          V looks from the seat or from outside. You are seen in the seat (a seated 1980 Marine, rifle between knees).
//   OCCUPANTS - the people the models did not have: the HORNET's pilot (HGU-33, oxygen mask, harness) while someone is
//          flying it; the CH-46's Marines in their red troop seats until they file out of the ramp (the squad's own
//          figures, seated); the RUNAWAY MV-22's troopers standing in their racks.
//
//   const SE = createSeats({ scene, crafts, war, foot, say, heli: { def, obj(), landed() }, jet: { def, model } });
//   SE.afterWar(dt)   after war.update: the aboard squads seated, the pilot shown, the rider kept in his seat
import * as THREE from 'three';
import { crewGeometry, crewMaterial } from './crewfig.js';

// seat layouts in each host's model frame (x right, y up, -z forward; the figure origin under the hips, facing yaw:
// 0 = the craft's forward)
const HUEY_SEATS = [-0.82, -0.27, 0.27, 0.82].map((x, i) => ({ id: 'troop' + i, label: `TROOP SEAT ${i + 1}`, at: [x, -0.58, 2.02], yaw: 0, eye: [x, 0.37, 1.98], door: [Math.sign(x) * 1.45, -0.8, 1.2] }));
const CH46_SEATS = [{ id: 'r0', label: 'TROOP SEAT 14 (BY THE RAMP)', at: [0.86, -0.49, 3.25], yaw: Math.PI / 2 }, { id: 'r1', label: 'TROOP SEAT 15 (BY THE RAMP)', at: [-0.86, -0.49, 3.25], yaw: -Math.PI / 2 }]
  .map(s => ({ ...s, eye: [s.at[0] * 0.75, s.at[1] + 0.95, s.at[2] - 0.03] }));
// the CH-46 squad's own seats (13): along both walls facing in, forward of the riders' (figures.js figures stand on
// the cabin floor, their 'seated' pose drops them onto the seat)
const CH46_SQUAD = []; for (let i = 0; i < 13; i++) { const s = i % 2 ? -1 : 1, k = Math.floor(i / 2); CH46_SQUAD.push({ at: [s * 0.8, -0.95, -3.55 + k * 0.95], yaw: s > 0 ? Math.PI / 2 : -Math.PI / 2 }); }
const MV22_RACK = []; for (let i = 0; i < 12; i++) { const s = i % 2 ? -1 : 1, k = Math.floor(i / 2); MV22_RACK.push({ at: [s * 0.78, -1.22, -3.8 + k * 1.15], yaw: s > 0 ? Math.PI / 2 : -Math.PI / 2 }); }

export function createSeats(ctx) {
  const { scene, crafts, war, foot } = ctx, say = ctx.say || (() => {});
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), UP = new THREE.Vector3(0, 1, 0);
  const SE = {};
  // ------------------------------------------------------------------ the rider's own figure (seen in the seat)
  const riderFig = new THREE.Mesh(crewGeometry('marine', 'seated', { arms: 'rifle', seed: 4 }), crewMaterial()); riderFig.visible = false; riderFig.name = 'rider';
  // ------------------------------------------------------------------ seat hosts: where a rider can sit right now
  // host: { key, label, obj (Object3D in whose frame the seats are), seats, landed(), alive(), craft (a def you could fly) }
  const hosts = [];
  function listHosts() {
    hosts.length = 0;
    const H = ctx.heli;
    if (H && H.def.present() && crafts.active !== H.def) hosts.push({ key: 'huey', label: 'UH-1H HUEY', obj: H.obj(), seats: HUEY_SEATS, landed: () => H.landed(), alive: () => H.def.present(), craft: H.def, vel: H.vel });
    for (const u of war.units) {
      if (!u.rot || u.kind !== 'ch46' || u.dead || u.dying || u.side !== 1) continue;
      const U = u.rot; hosts.push({ key: u, label: 'CH-46 SEA KNIGHT', obj: U.model.group, seats: CH46_SEATS, landed: () => !!(U.S && U.S.landed) && u.v.length() < 1.5, alive: () => war.units.includes(u) && !u.dead && !u.dying, ramp: () => U.ramp > 0.85, U, u, vel: u.v });
    }
    return hosts;
  }
  // the seats a man on foot could get into: door points in the world (the RIDE craft's frame is the world)
  const seatsView = [];
  function refreshSeats() {
    seatsView.length = 0;
    if (crafts.active === RIDE && cur) { for (const s of cur.host.seats) seatsView.push({ id: s.id, label: s.label }); return; }   // (riding: the bench, for [ ])
    for (const h of listHosts()) {
      if (!h.landed()) continue;
      h.obj.updateMatrixWorld(true);
      h.seats.forEach((s, i) => {
        let door = s.door; if (h.U) door = h.ramp && h.ramp() ? [h.U.model.RAMP_END.x, h.U.model.RAMP_END.y + 0.6, h.U.model.RAMP_END.z] : [1.25, -0.4, -4.2];   // the ramp lip when it is down, else the crew door
        _v.set(door[0], door[1], door[2]); h.obj.localToWorld(_v);
        seatsView.push({ id: s.id, label: `${h.label}: ${s.label}`, doors: [[_v.x, _v.y, _v.z]], reach: 2.2, host: h, seat: s, hostLabel: h.label });
      });
    }
  }
  // ------------------------------------------------------------------ the RIDE craft
  let cur = null;   // { host, seat, i, look: { yaw, pitch }, view, last: Vector3 }
  const RIDE = {
    id: 'ride', label: 'PASSENGER SEAT', kind: 'ground',
    get seats() { return seatsView; },
    present: () => seatsView.length > 0 || crafts.active === RIDE,
    frame: out => { out.x = 0; out.y = 0; out.z = 0; out.yaw = 0; return out; },
    enter(i, from) {
      const s = seatsView[i]; if (!s || !s.host) return false;
      cur = { host: s.host, seat: s.seat, i: s.host.seats.indexOf(s.seat), look: { yaw: 0, pitch: 0 }, view: 'first', last: new THREE.Vector3() };
      label(); s.host.obj.add(riderFig); placeFig();
      say(`IN THE ${s.host.label}  -  ${s.seat.label}  ·  Y GET OUT WHEN LANDED  ·  [ ] CHANGE SEAT  ·  V VIEW`, 2.4);
      return true;
    },
    canExit() {
      if (!cur) return '';
      if (cur.host.alive() && !cur.host.landed()) return 'WAIT UNTIL IT LANDS';
      return '';
    },
    exitSpots() {
      if (!cur) return [];
      const h = cur.host, o = h.obj; o.updateMatrixWorld(true);
      const pts = h.U ? (h.ramp && h.ramp() ? [[h.U.model.RAMP_END.x, h.U.model.RAMP_END.y, h.U.model.RAMP_END.z + 1.2]] : [[2.0, -1.4, -4.2], [-2.0, -1.4, -4.2]]) : [[Math.sign(cur.seat.at[0]) * 2.3, -1.6, 1.2], [-Math.sign(cur.seat.at[0]) * 2.3, -1.6, 1.2], [0, -1.6, 4.5]];
      return pts.map(p => { _v.set(p[0], p[1], p[2]); o.localToWorld(_v); const yaw = yawOf(o); return { x: _v.x, y: _v.y + 0.3, z: _v.z, yaw }; });
    },
    exit() { if (riderFig.parent) riderFig.parent.remove(riderFig); riderFig.visible = false; cur = null; setTimeout(label, 0); },
    setSeat(i) {   // craft.js cycleSeat asks for host.seat +- 1: that gives the direction along the bench
      if (!cur) return false;
      const n = cur.host.seats.length, dir = i === (crafts.seat + 1) % n ? 1 : -1, j = cur.i + dir;
      // past the end of the bench of a craft you can fly: up front to its controls
      if ((j < 0 || j >= n) && cur.host.craft) { const c = cur.host.craft; setTimeout(() => crafts.control(c.id, 0, 'swap'), 0); return false; }
      cur.i = (j + n) % n; cur.seat = cur.host.seats[cur.i]; placeFig(); say(`${cur.host.label}  -  ${cur.seat.label}`, 1.2); return true;
    },
    update(dt, input) {
      if (!cur) return;
      if (!cur.host.alive()) {   // the machine is gone under him: out where the seat was
        const o = cur.host.obj; o.updateMatrixWorld(true); _v.set(...cur.seat.at); o.localToWorld(_v);
        const sp = [{ x: _v.x, y: _v.y + 0.2, z: _v.z, yaw: yawOf(o) }];
        say(`THE ${cur.host.label} IS GOING DOWN  -  GET OUT!`, 2.5);
        if (foot.spawnAt(sp)) crafts.control('foot', 0, 'ride');
      }
    },
    look(dx, dy) { if (!cur) return; cur.look.yaw = Math.max(-2.4, Math.min(2.4, cur.look.yaw - dx * 0.0022)); cur.look.pitch = Math.max(-1.2, Math.min(1.2, cur.look.pitch - dy * 0.0022)); },
    key(code) { if (code === 'KeyV' && cur) { cur.view = cur.view === 'first' ? 'third' : 'first'; say(cur.view === 'first' ? 'FROM THE SEAT' : 'OUTSIDE VIEW', 1); return true; } return false; },
    firstPerson: () => !!cur && cur.view === 'first',
    camera(cam, dt) {
      if (!cur) return;
      const o = cur.host.obj; o.updateMatrixWorld(true);
      o.getWorldQuaternion(_q);
      _q2.setFromEuler(_e.set(cur.look.pitch, cur.seat.yaw + cur.look.yaw, 0, 'YXZ'));
      if (cur.view === 'first') { _v.set(...cur.seat.eye); o.localToWorld(_v); cam.position.copy(_v); cam.quaternion.copy(_q).multiply(_q2); }
      else {   // from outside: beside the cabin door (the Huey), behind the open ramp (a Sea Knight)
        const s = cur.seat, off = cur.host.U ? [s.at[0] * 0.3, 1.4, 9 + cur.look.pitch * 3] : [Math.sign(s.at[0] || 1) * 4.2, 1.2 + cur.look.pitch * 2, s.at[2] - 0.4 - cur.look.yaw * 2];
        _v.set(s.at[0], s.at[1] + 0.6, s.at[2]); o.localToWorld(_v); _v2.set(...off); o.localToWorld(_v2); cam.position.copy(_v2); cam.lookAt(_v);
      }
      riderFig.visible = cur.view !== 'first';
    },
    avatar(Z) {
      if (!cur) return; const o = cur.host.obj; _v.set(...cur.seat.at); o.localToWorld(_v);
      Z.pos.copy(_v); if (cur.host.vel) Z.vel.copy(cur.host.vel); else Z.vel.set(0, 0, 0);
    },
    hud() {
      if (!cur) return { line: '', hint: '' };
      const h = cur.host, ld = h.landed();
      return { line: `PASSENGER  ·  ${h.label}  ·  ${cur.seat.label}  ·  ${ld ? 'ON THE GROUND' : 'IN FLIGHT'}`, hint: ld ? 'Y: GET OUT  ·  [ ] CHANGE SEAT  ·  V VIEW  ·  CLICK: LOOK ROUND' : 'IN FLIGHT  -  Y TO GET OUT ONCE IT LANDS  ·  V VIEW', weap: '', fuel: null };
    },
    hurt: (a, why, at, dir) => foot.hurt(a, why, at, dir),
    pl: { alive: () => foot.alive !== false, landed: () => !!cur && cur.host.landed(), hitR: 0.7, detect: 0.25, sight: 0 },
    silence() {},
  };
  function label() { RIDE.label = cur ? `${cur.host.label} (A PASSENGER SEAT)` : 'PASSENGER SEAT'; }
  function placeFig() { const s = cur.seat; riderFig.position.set(s.at[0], s.at[1], s.at[2]); riderFig.rotation.set(0, Math.PI + s.yaw, 0); }   // the figure faces +z: turned to the seat's forward
  const yawOf = o => { o.getWorldQuaternion(_q); _v2.set(0, 0, -1).applyQuaternion(_q); return Math.atan2(-_v2.x, -_v2.z); };
  crafts.register(RIDE);
  SE.ride = RIDE;

  // ------------------------------------------------------------------ occupants
  // the HORNET's pilot, shown while someone flies it (the cockpit module draws its own in the cockpit view)
  let jetPilot = null;
  if (ctx.jet && ctx.jet.model) {
    jetPilot = new THREE.Mesh(crewGeometry('jetPilot', 'seated', { arms: 'controls', seed: 2 }), crewMaterial()); jetPilot.name = 'hornet-pilot';
    jetPilot.position.set(0, 0.02, -4.22); jetPilot.rotation.y = Math.PI; jetPilot.visible = false; ctx.jet.model.group.add(jetPilot);
  }
  const _seat = new THREE.Vector3();
  SE.afterWar = dt => {
    refreshSeats();
    if (jetPilot) { const J = ctx.jet; jetPilot.visible = crafts.active === J.def && !!(J.model.shell && J.model.shell[0] && J.model.shell[0].visible) && !(J.P && J.P.ejected); }
    // the transports' troops: in their seats (or racks) while aboard
    for (const u of war.units) {
      if (!u.rot || !u.rot.squad || !u.rot.model || (u.kind !== 'ch46' && u.kind !== 'mv22')) continue;
      const U = u.rot, Q = U.squad, g = U.model.group, seats = u.kind === 'ch46' ? CH46_SQUAD : MV22_RACK;
      if (!Q.figs || !g.visible) continue;
      let k = 0;
      g.updateMatrixWorld(true); g.getWorldQuaternion(_q);
      for (const F of Q.figs) {
        if (F.st !== 'aboard') { k++; continue; }
        const s = seats[k++ % seats.length], G = F.f.group;
        _seat.set(s.at[0], s.at[1], s.at[2]); g.localToWorld(_seat);
        if (G.parent && G.parent !== scene) G.parent.worldToLocal(_seat);
        G.position.copy(_seat); G.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(UP, s.yaw));   // the figures face -z: turned to face across the cabin
        F.f.pose(u.kind === 'ch46' ? 'seated' : 'stand', 0); G.visible = true;
      }
    }
  };
  return SE;
}
