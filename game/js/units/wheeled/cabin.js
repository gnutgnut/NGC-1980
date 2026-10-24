// cabin.js - the working cab of a wheeled vehicle in the game (ngc/wheeledgame), on top of the WHEELED interior
// (interior.js: live gauges, wheel, pedals, levers, hands): every switch and lever you can click (look at it and click,
// as in the jets' cockpits), the light switch with the 1980 military blackout positions, wipers that sweep, the driver's
// legs and boots on the pedals and his body in the seat, the fire extinguisher, lamps that glow.
//   const C = createCabin(V, ctx);  C.attach(model, interior) (once per model)  C.update(dt, look, st)
//   C.hitBoxes / C.group (for main.js's switch ray: craft.switches()), C.click(id), C.labelOf(id)
// Procedures and controls (TM 9-2320-218-10 M151A2, TM 9-2320-209-10 M35A2, owners' handbooks for the cars):
//   M151A2: rotary ignition switch OFF / ON / START on the panel; main light switch (the military 4-position switch:
//     OFF, BO MARKER, BO DRIVE, SERVICE DRIVE); panel light; electric wiper motors on the windscreen's top rail; front-
//     wheel-drive lever; T-handle parking brake under the dash; the horn button; the fire extinguisher by the passenger.
//   M35A2: ENGINE switch + START button, the same military light switch, air-operated wipers on the top rail, the
//     transfer lever HIGH / N / LOW, the parking-brake lever, horn, extinguisher; the air gauge (wait for 65 psi).
//   Cars: key OFF / ON / START on the column, lights stalk (OFF / SIDE / HEAD), wiper stalk, handbrake lever, horn.
import * as THREE from 'three';

const MIL_LIGHTS = ['OFF', 'BO MARKER', 'BO DRIVE', 'SERVICE DRIVE'], CIV_LIGHTS = ['OFF', 'SIDE LIGHTS', 'HEADLIGHTS'];
// per type: wipers (pivot in the model / windscreen frame, arm length, top-hung or bottom-hung, sweep), lamps (front
// headlamps, blackout drive lamp, tail), the extinguisher; positions from the models (m151model / m35model / civmodel)
const FIT = {
  m151: { wipers: { parent: 'screen', at: [[-0.38, 0.45, -0.03], [0.30, 0.45, -0.03]], len: 0.36, top: true }, head: [[-0.52, 0.88, -1.72], [0.52, 0.88, -1.72]], bo: [-0.68, 1.06, -1.62], tail: [[-0.69, 0.87, 1.73], [0.69, 0.87, 1.73]], ext: [0.55, 0.62, -0.32] },
  m35: { wipers: { parent: 'screen', at: [[-0.5, 0.5, -0.03], [0.4, 0.5, -0.03]], len: 0.42, top: true }, head: [[-0.82, 1.28, -2.98], [0.82, 1.28, -2.98]], bo: [-0.95, 1.42, -2.9], tail: [[-1.0, 1.0, 3.66], [1.0, 1.0, 3.66]], ext: [0.86, 1.55, -1.25] },
  civ: { wipers: { parent: null, top: false, len: 0.38 }, head: null, bo: null, tail: null, ext: null },
};
let _glowTex = null;
const glowTex = () => _glowTex || (_glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 1, 32, 32, 31); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })());

export function createCabin(V, ctx) {
  const T = V.T, spec = V.spec, mil = !!T.mil, fit = FIT[V.type] || FIT.civ;
  const C = { hitBoxes: [], group: null, lights: 0, panel: false, wiper: false, wipeT: 0, park: false, ext: mil ? 2 : 0, spare: 1, legs: null };
  const LIGHTS = mil ? MIL_LIGHTS : CIV_LIGHTS;
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3(), _k = new THREE.Vector3(), _a = new THREE.Vector3();   // (no per-frame allocations)
  function hit(id, parent, pos, size = 0.07) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), hitMat); m.position.copy(pos); m.userData.sw = id; parent.add(m); C.hitBoxes.push(m); return m;
  }
  // a point on the instrument panel from its canvas pixel coordinates
  function onPanel(panel, px, py, out) {
    const pg = panel.geometry.parameters, img = panel.material.map.image;
    out.set((px / img.width - 0.5) * pg.width, (0.5 - py / img.height) * pg.height, 0.02).applyEuler(panel.rotation).add(panel.position);
    return out;
  }
  C.attach = (model, interior) => {
    if (C.model === model) return; C.model = model; C.group = model.group; C.hitBoxes.length = 0;
    const g = model.group, I = interior && interior.controls;
    // ---- the switches
    if (I) {
      if (V.type === 'm151') { hit('lights', g, onPanel(I.panel, 470, 205, _v)); hit('panel', g, onPanel(I.panel, 520, 205, _v)); hit('ign', g, onPanel(I.panel, 590, 205, _v), 0.08); }
      else if (V.type === 'm35') { hit('lights', g, onPanel(I.panel, 60, 70, _v)); hit('ign', g, onPanel(I.panel, 60, 160, _v)); hit('start', g, onPanel(I.panel, 110, 215, _v)); }
      else {   // the cars: key on the column's right, stalks either side
        const col = I.wheelG.parent; _v.set(0.13, -0.08, 0.03).applyEuler(col.rotation).add(col.position); hit('ign', g, _v, 0.06);
        _v.set(-0.24, -0.02, 0.06).applyEuler(col.rotation).add(col.position); hit('lights', g, _v, 0.06);
        _v.set(0.24, -0.02, 0.06).applyEuler(col.rotation).add(col.position); hit('wiper', g, _v, 0.06);
      }
      _v.set(0, 0.03, 0).applyEuler(I.wheelG.parent.rotation).add(I.wheelG.parent.position); hit('horn', g, _v, 0.07);
      for (const l of I.levers) { l.piv.getWorldPosition(_w); g.worldToLocal(_w); _w.y += l.len * 0.9; hit(l.id === 'park' ? 'park' : l.id, g, _w, 0.08); }
      if (I.parkG) { I.parkG.getWorldPosition(_w); g.worldToLocal(_w); hit('park', g, _w, 0.09); }
    }
    // ---- wipers: thin black arms with a blade, swinging about their pivots
    C.wipers = [];
    const parent = fit.wipers.parent === 'screen' && model.parts && model.parts.screen ? model.parts.screen : g;
    let wat = fit.wipers.at;
    if (!wat && I && I.panel) { const p = I.panel.position; wat = [[p.x - 0.32, p.y + 0.2, p.z - 0.3], [p.x + 0.12, p.y + 0.2, p.z - 0.3]]; }   // cars: at the cowl, ahead of the binnacle
    const armM = new THREE.MeshLambertMaterial({ color: 0x141414 });
    for (const a of wat || []) {
      const piv = new THREE.Group(); piv.position.set(a[0], a[1], a[2]); parent.add(piv);
      const L = fit.wipers.len, s = fit.wipers.top ? -1 : 1;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, L, 0.012).translate(0, s * L / 2, 0), armM); piv.add(arm);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.014, L * 0.85, 0.02).translate(0, s * L * 0.55, -0.012), armM); piv.add(blade);
      piv.rotation.z = fit.wipers.top ? -0.9 : 1.2;   // parked
      C.wipers.push({ piv, rest: piv.rotation.z, s });
    }
    if (fit.wipers.parent === 'screen') hit('wiper', parent, _v.set(wat[0][0], wat[0][1] + 0.02, wat[0][2] + 0.03), 0.07);
    // ---- the extinguisher (military vehicles): a red bottle in its bracket
    if (fit.ext) {
      const e = new THREE.Group(); e.position.set(...fit.ext); g.add(e);
      e.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.32, 10).translate(0, 0.16, 0), new THREE.MeshLambertMaterial({ color: 0x9a1a14 })));
      e.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.05).translate(0, 0.35, 0), new THREE.MeshLambertMaterial({ color: 0x222222 })));
      C.extMesh = e; hit('ext', g, _v.set(fit.ext[0], fit.ext[1] + 0.18, fit.ext[2]), 0.12);
    }
    // ---- lamps: glow sprites (no scene lights: the game has no night and new lights recompile every shader)
    C.glows = [];
    const add = (p, col, kind) => { if (!p) return; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.position.set(p[0], p[1], p[2] - (kind === 'tail' ? -0.03 : 0.03)); sp.visible = false; g.add(sp); C.glows.push({ sp, kind }); };
    for (const p of fit.head || []) add(p, 0xfff2d0, 'head');
    if (fit.bo) add(fit.bo, 0xfff0c8, 'bo');
    for (const p of fit.tail || []) add(p, 0xff3020, 'tail');
    if (!mil) {   // the cars: headlamps at the front corners of the body
      const f = Math.min(...spec.hull.map(q => q[2])) + 0.05, b = Math.max(...spec.hull.map(q => q[2])) - 0.05, w = spec.dims.W / 2 - 0.25;
      for (const s of [-1, 1]) { add([s * w, 0.72, f], 0xfff2d0, 'head'); add([s * w, 0.78, b], 0xff3020, 'tail'); }
    }
    // ---- the driver's legs and boots (first person: look down) and his body in the seat
    const drv = V.seats.find(s => s.role === 'driver');
    if (drv && I && I.pedals) {
      const cloth = new THREE.MeshLambertMaterial({ color: mil ? 0x575b3c : 0x34405a, flatShading: true }), boot = new THREE.MeshLambertMaterial({ color: mil ? 0x1a1816 : 0x3a2a1e, flatShading: true });
      const seg = (r0, r1, m) => { const s = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 1, 7).rotateX(Math.PI / 2), m); g.add(s); return s; };
      const legs = [0, 1].map(() => ({ thigh: seg(0.075, 0.06, cloth), shin: seg(0.055, 0.045, cloth), boot: (() => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.28), boot); g.add(b); return b; })() }));
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.24).translate(0, 0.25, 0), cloth); torso.position.set(drv.at[0], drv.at[1] + 0.08, drv.at[2] + 0.16); g.add(torso);
      C.legs = { legs, torso, drv, all: [torso, ...legs.flatMap(l => [l.thigh, l.shin, l.boot])] };
    }
    C.setBody(false);
  };
  C.setBody = on => { if (C.legs) for (const m of C.legs.all) m.visible = on; };
  // ---- clicks
  C.labelOf = id => {
    const S = V.sim, ign = V.inp.ignition;
    switch (id) {
      case 'ign': return mil && V.type === 'm151' ? `IGNITION  (${ign ? (S.eng.running ? 'ON' : 'ON  -  CLICK AGAIN: START') : 'OFF'})` : mil ? `ENGINE SWITCH  (${ign ? 'ON' : 'OFF'})` : `KEY  (${ign ? (S.eng.running ? 'ON' : 'ON  -  CLICK AGAIN: START') : 'OFF'})`;
      case 'start': return 'START BUTTON';
      case 'lights': return `${mil ? 'MAIN LIGHT SWITCH' : 'LIGHTS'}  (${LIGHTS[C.lights]})`;
      case 'panel': return `PANEL LIGHT  (${C.panel ? 'ON' : 'OFF'})`;
      case 'wiper': return `WIPERS  (${C.wiper ? 'ON' : 'OFF'})`;
      case 'horn': return 'HORN';
      case 'park': return `PARKING BRAKE  (${C.park ? 'SET' : 'OFF'})`;
      case 'fwd': return `FRONT-WHEEL DRIVE LEVER  (${V.inp.fwd ? 'ENGAGED' : 'DISENGAGED'})`;
      case 'range': return `TRANSFER LEVER  (${V.inp.range === 'L' ? 'LOW' : V.inp.range === 'N' ? 'NEUTRAL' : 'HIGH'})`;
      case 'ext': return `FIRE EXTINGUISHER  (${C.ext} LEFT)`;
      default: return id.toUpperCase();
    }
  };
  C.click = id => {
    const S = V.sim, say = ctx.say;
    switch (id) {
      case 'ign':
        if (!V.inp.ignition) { V.inp.ignition = true; say(mil ? 'IGNITION ON  -  LAMPS TEST' : 'KEY ON', 1); }
        else if (!S.eng.running && (V.type === 'm151' || !mil)) { V.crank = 1.6; say('START', 0.8); }
        else { V.inp.ignition = false; V.crank = 0; say(mil ? 'ENGINE OFF' : 'KEY OFF', 1); }
        break;
      case 'start': if (!V.inp.ignition) say('ENGINE SWITCH FIRST', 1.2); else if (!S.eng.running) { V.crank = 1.6; say('START', 0.8); } break;
      case 'lights': C.lights = (C.lights + 1) % LIGHTS.length; say(`LIGHTS  -  ${LIGHTS[C.lights]}`, 1.2); break;
      case 'panel': C.panel = !C.panel; break;
      case 'wiper': C.wiper = !C.wiper; say(C.wiper ? 'WIPERS ON' : 'WIPERS OFF', 0.8); break;
      case 'horn': C.hornT = 0.5; break;
      case 'park': C.park = !C.park; say(C.park ? 'PARKING BRAKE SET' : 'PARKING BRAKE OFF', 1); break;
      case 'fwd': V.key('KeyU'); break;
      case 'range': V.key('KeyL'); break;
      case 'ext': C.extinguish(); break;
    }
    ctx.sfx.blip?.(1500, 1100, 0.03, 'square', 0.05);
  };
  C.extinguish = () => {
    const d = V.dmg;
    if (C.ext <= 0) { ctx.say(mil ? 'THE EXTINGUISHER IS EMPTY' : 'NO EXTINGUISHER IN THIS CAR', 1.4); return false; }
    if (!(d.state.fire > 0)) { ctx.say('NO FIRE', 1); return false; }
    C.ext--; const ok = d.extinguish();
    ctx.say(ok ? 'FIRE OUT' : `STILL BURNING  -  ${C.ext} EXTINGUISHER${C.ext === 1 ? '' : 'S'} LEFT`, 1.8);
    for (let i = 0; i < 14; i++) ctx.fx.mix?.spawn(V.sim.pos[0] + (Math.random() - 0.5), V.sim.pos[1] + 1, V.sim.pos[2] + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2, 1.4, 0.5, 2, 0.92, 0.92, 0.92, 0.6, -0.2, 1, 0.5);
    return ok;
  };
  // ---- the spare wheel: stopped, ten minutes' work done in a game half-minute
  C.changeWheel = () => {
    const S = V.sim, d = V.dmg;
    if (C.spare <= 0) { ctx.say('NO SPARE LEFT', 1.4); return false; }
    if (Math.abs(S.speed) > 0.3) { ctx.say('STOP FIRST', 1); return false; }
    let worst = -1, wp = 2; d.state.tyres.forEach((t, i) => { if (t.pressure < wp) { wp = t.pressure; worst = i; } });
    if (worst < 0 || wp > 0.8) { ctx.say('NO FLAT TO CHANGE', 1.2); return false; }
    C.wheelJob = { t: 25, i: worst }; ctx.say(`CHANGING THE ${spec.wheels[worst].id} WHEEL FOR THE SPARE  -  JACK, LUG NUTS (25 s)`, 2.5);
    return true;
  };
  // ---- per frame
  C.update = (dt, look, st) => {
    const S = V.sim;
    if (C.hornT > 0) C.hornT -= dt;
    S.lights = C.lights > 0;
    // wipers: ~45 sweeps a minute
    if (C.wipers) {
      if (C.wiper && (S.battery > 0.05 || S.eng.running)) C.wipeT += dt * 4.7;
      else if (C.wipeT % (Math.PI * 2) > 0.05) C.wipeT += dt * 4.7;   // run back to the park position
      const a = (1 - Math.cos(C.wipeT)) * 0.5;
      for (const w of C.wipers) w.piv.rotation.z = w.rest + (fit.wipers.top ? 1.8 : -2.0) * a;
    }
    // lamps
    for (const gl of C.glows || []) {
      const m = C.lights, on = gl.kind === 'head' ? (mil ? m === 3 : m === 2) : gl.kind === 'bo' ? m === 2 : gl.kind === 'tail' ? m >= 1 : false;
      gl.sp.visible = on && S.battery > 0.02; const k = gl.kind === 'head' ? 0.75 : gl.kind === 'bo' ? 0.35 : 0.3; gl.sp.scale.set(k, k, k);
    }
    if (C.extMesh) C.extMesh.visible = C.ext > 0;
    // the wheel change
    if (C.wheelJob) {
      C.wheelJob.t -= dt; V.inp.throttle = 0;
      if (Math.abs(S.speed) > 0.5) { C.wheelJob = null; ctx.say('WHEEL CHANGE ABANDONED', 1.2); }
      else if (C.wheelJob.t <= 0) { const T0 = V.dmg.state.tyres[C.wheelJob.i]; Object.assign(T0, { pressure: 1, leak: 0, blown: false, flatEv: false }); C.spare--; C.wheelJob = null; if (C.model && C.model.parts && C.model.parts.spare) C.model.parts.spare.visible = false; ctx.say('SPARE ON  -  TYRE GOOD', 1.6); }
    }
    // the driver's legs: hips from the seat, feet on the pedals (right on the brake when braking, else the gas; left on
    // the clutch when it is down, else beside it)
    if (C.legs && st.body) {
      const I = st.interior.controls, d = C.legs.drv, g = C.group;
      const padPos = (i, out) => { const p = I.pedals[i]; out.set(0, -p.children[0].geometry.parameters.height, 0.02); p.localToWorld(out); g.worldToLocal(out); return out; };
      for (let k = 0; k < 2; k++) {
        const L = C.legs.legs[k], s = k ? 1 : -1;
        const hip = _v.set(d.at[0] + s * 0.1, d.at[1] + 0.12, d.at[2] + 0.02);
        const foot = k ? padPos((look.brake || 0) > 0.05 ? 1 : 2, _f) : padPos(0, _f).add(_w.set((look.clutch || 0) > 0.3 ? 0 : -0.1, (look.clutch || 0) > 0.3 ? 0 : 0.02, (look.clutch || 0) > 0.3 ? 0 : 0.06));
        const knee = _k.copy(hip).lerp(foot, 0.5); knee.y = Math.max(hip.y, foot.y) + 0.16; knee.z -= 0.04;
        limb(L.thigh, hip, knee); limb(L.shin, knee, _a.set(foot.x, foot.y + 0.07, foot.z + 0.05));
        L.boot.position.set(foot.x, foot.y + 0.03, foot.z + 0.03); L.boot.rotation.x = -0.3;
      }
    }
  };
  function limb(m, a, b) { m.position.copy(a).add(b).multiplyScalar(0.5); m.scale.set(1, 1, a.distanceTo(b)); _w.copy(b); C.group.localToWorld(_w); m.lookAt(_w); }
  return C;
}
