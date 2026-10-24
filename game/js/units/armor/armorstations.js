// armorstations.js - the crew stations' working controls and the crew inside (armour polish, wave 3). The interiors
// (tankinterior.js) are the rooms, gauges and moving levers; this module puts the Huey / Hornet "look at it and click"
// layer on them: invisible hit boxes on every switch, handle and rack a crewman works, the controls that were not
// modelled yet (the M60's MASTER and TURRET POWER switches, the M113's MASTER, START, RAMP, VANE and BILGE switches),
// a yellow frame on whatever the crosshair is over, and the crew you share the vehicle with (seated figures in the
// M60's fighting compartment: the gunner low and forward right, the commander behind him under the cupola, the loader
// standing on the left - each rises up through his hatch when he rides head out, where armorcraft.js's head-and-
// shoulders figure takes over).
//
//   const S = buildStations(interior, model, 'm60' | 'm113')
//   S.hitsFor(role, sub) -> the hit boxes of a station ('driver' | 'gunner' | 'loader' | 'commander' | 'troop')
//   S.labelOf(id) -> 'MASTER SWITCH' ...      S.update({ hover, V, IN, D, crewIn: { gunner, commander, loader } })
//
// Ids (armorcraft.js's D.click handles them):
//   driver   master start halon park range dhatch               (M113 also ramp vane pumps)
//   gunner   tpower stab tts ttsmag ttspol lase dump ammo:M735 ammo:M456 ammo:M393
//   loader   rack:M735 rack:M456 rack:M393 breech lhatch radio
//   commander chatch override can50 radio                         (M113: chatch can50 ramp radio)
//   troop    ramp cargo radio
import * as THREE from 'three';

const SANS = 'Arial, "Liberation Sans", Helvetica, sans-serif';
const M = (c, k = 0.5) => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(k), flatShading: true });
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
function plate(parent, text, w, h, x, y, z, ry = 0, rx = 0, fg = '#e8e4d0', bg = '#2a2c27') {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = Math.max(16, Math.round(256 * h / w)); const c = cv.getContext('2d');
  c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = fg; c.font = `bold ${Math.round(cv.height * 0.55)}px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 128, cv.height / 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); parent.add(m); return m;
}
// a toggle switch: base plate, a bat handle that throws up (on) / down (off); returns the handle group
function toggle(parent, x, y, z, ry = 0, rx = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx, ry, 0, 'YXZ'); parent.add(g);
  g.add(new THREE.Mesh(box(0.035, 0.035, 0.008, 0, 0, 0.004), M(0x222320, 0.3)));
  const bat = new THREE.Group(); bat.position.z = 0.008; g.add(bat); bat.add(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.03, 6).translate(0, 0.015, 0), M(0xb8b8b0, 0.4)));
  return bat;
}

// a crewman sitting (or standing) inside: OG-107 coveralls, the CVC helmet; faces -z in his own frame, seat at y = 0
function crewInside(standing = false) {
  const g = new THREE.Group(), cloth = M(0x4d5236, 0.35), dark = M(0x3d4129, 0.3), skin = M(0xc19a76, 0.35), cvc = M(0x585a3e, 0.3), boot = M(0x161412, 0.2);
  const add = (geo, m) => { const o = new THREE.Mesh(geo, m); g.add(o); return o; };
  const hip = standing ? 0.95 : 0.08;
  add(box(0.4, 0.55, 0.26, 0, hip + 0.32, 0.02), cloth);                                       // torso
  add(new THREE.SphereGeometry(0.1, 8, 6).translate(0, hip + 0.73, 0), skin);                   // head
  add(new THREE.SphereGeometry(0.135, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(1, 1, 1.08).translate(0, hip + 0.75, 0.01), cvc);
  for (const s of [-1, 1]) {
    if (standing) { add(box(0.15, 0.9, 0.16, s * 0.1, 0.5, 0), dark); add(box(0.14, 0.1, 0.26, s * 0.1, 0.05, -0.04), boot); }
    else { add(box(0.15, 0.14, 0.44, s * 0.1, 0.07, -0.2), dark); add(box(0.14, 0.42, 0.14, s * 0.1, -0.15, -0.4), dark); add(box(0.13, 0.1, 0.24, s * 0.1, -0.36, -0.46), boot); }
    add(box(0.1, 0.34, 0.11, s * 0.24, hip + 0.38, -0.06), cloth).rotation.x = standing ? 0.15 : 0.55;   // arms forward to the controls
  }
  g.userData.heat = 0.85; g.visible = false;
  return g;
}

export function buildStations(interior, model, type) {
  const M60 = type === 'm60';
  const hitM = new THREE.MeshBasicMaterial({ visible: false }), byRole = {}, labels = {}, hitsOf = {};
  const hit = (roles, id, w, h, d, x, y, z, parent, label) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitM); o.position.set(x, y, z); o.userData.sw = id; o.userData.size = [w, h, d]; parent.add(o);
    for (const r of roles.split(' ')) (byRole[r] = byRole[r] || []).push(o);
    (hitsOf[id] = hitsOf[id] || []).push(o); labels[id] = label; return o;
  };
  const anim = {};   // switch handles that move
  const figs = {};
  const red = M(0xa01c12, 0.45), dark = M(0x2c2d2a, 0.35), metal = M(0x8a8c86, 0.4), olive = M(0x4c5236, 0.45);
  if (M60) {
    // ------------------------------------------------------------------ driver (hull frame; the panel IP is tipped toward his eye)
    const D = interior.driver, IP = interior.panel;
    // under the MASTER lamp (upper right of the panel, clear of the T-bar): the MASTER switch, the START button below it
    anim.master = toggle(IP, 0.18, 0.075, 0.0);
    IP.add(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 10).rotateX(Math.PI / 2).translate(0.21, -0.005, 0.01), red));
    plate(IP, 'START', 0.05, 0.012, 0.21, -0.035, 0.004);
    hit('driver', 'master', 0.06, 0.07, 0.05, 0.18, 0.075, 0.015, IP, 'MASTER SWITCH');
    hit('driver', 'start', 0.05, 0.05, 0.05, 0.21, -0.005, 0.015, IP, 'START  -  HOLD UNTIL IT CATCHES');
    hit('driver', 'halon', 0.2, 0.12, 0.08, -0.64, 1.22, -1.7, D, 'FIXED FIRE EXTINGUISHER  -  PULL (ENGINE)');
    hit('driver', 'park', 0.12, 0.38, 0.1, -0.45, 1.0, -1.85, D, 'PARKING BRAKE');
    hit('driver', 'range', 0.12, 0.2, 0.24, 0.32, 1.12, -2.0, D, 'RANGE SELECTOR  -  HIGH / LOW');
    hit('driver', 'dhatch', 0.3, 0.08, 0.14, 0.12, 1.74, -1.86, D, "DRIVER'S HATCH");
    // ------------------------------------------------------------------ gunner (turret frame)
    const GU = interior.gunner;
    // the turret power panel above the computer control panel on the right wall: TURRET POWER and the stab mode switch
    const TP = new THREE.Group(); TP.position.set(1.12, 0.74, -0.5); TP.rotation.y = -Math.PI / 2 + 0.25; GU.add(TP);
    TP.add(new THREE.Mesh(box(0.3, 0.14, 0.03, 0, 0, -0.015), dark));
    plate(TP, 'TURRET POWER', 0.12, 0.022, -0.07, 0.045, 0.002, 0, 0, '#e8e4d0', '#1c1d1a'); plate(TP, 'STAB / POWER', 0.12, 0.022, 0.07, 0.045, 0.002, 0, 0, '#e8e4d0', '#1c1d1a');
    anim.tpower = toggle(TP, -0.07, -0.015, 0); anim.stab = toggle(TP, 0.07, -0.015, 0);
    hit('gunner', 'tpower', 0.09, 0.09, 0.05, -0.07, -0.01, 0.02, TP, 'TURRET POWER');
    hit('gunner', 'stab', 0.09, 0.09, 0.05, 0.07, -0.01, 0.02, TP, 'STABILISER  -  STAB / POWER');
    // the computer control panel (its canvas: range readout, ammunition push buttons, the lamp row) - a hit per button
    const CP = new THREE.Group(); CP.position.set(1.12, 0.48, -0.55); CP.rotation.y = -Math.PI / 2 + 0.25; GU.add(CP);
    const cx = px => (px / 256 - 0.5) * 0.4, cy = py => (0.5 - py / 184) * 0.288;
    hit('gunner', 'lase', 0.3, 0.07, 0.04, 0, cy(50), 0.02, CP, 'RANGE  -  LASE');
    [['M735', 'SABOT'], ['M456', 'HEAT'], ['M393', 'HEP']].forEach(([id, n], i) => hit('gunner', 'ammo:' + id, 0.07, 0.06, 0.04, cx(50 + i * 78), cy(102), 0.02, CP, `AMMUNITION SELECT  -  ${n}`));
    hit('gunner', 'dump', 0.06, 0.06, 0.04, cx(28), cy(152), 0.02, CP, 'COMPUTER  -  DUMP (BATTLESIGHT 1200)');
    hit('gunner', 'tts', 0.06, 0.06, 0.04, cx(228), cy(152), 0.02, CP, 'SIGHT  -  DAY / THERMAL');
    // the TTS controls on the sight housing: field of view and polarity knobs
    for (const [id, x, t] of [['ttsmag', 0.47, '3X/8X'], ['ttspol', 0.63, 'WH/BH']]) {
      GU.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10).rotateX(Math.PI / 2).translate(x, 0.84, -0.765), M(0x111111, 0.2)));
      plate(GU, t, 0.06, 0.014, x, 0.875, -0.768, 0, 0, '#e8e4d0', '#1c1d1a');
      hit('gunner', id, 0.06, 0.06, 0.05, x, 0.85, -0.76, GU, id === 'ttsmag' ? 'THERMAL SIGHT  -  FIELD OF VIEW 3X / 8X' : 'THERMAL SIGHT  -  WHITE HOT / BLACK HOT');
    }
    // ------------------------------------------------------------------ loader (the same room)
    // the bustle ready rack: the bases of the rounds, painted by type and taken out as the rack empties
    const S_ = 'M735', H_ = 'M456', P_ = 'M393', kinds = [[S_, S_, S_, S_, H_, H_, H_], [S_, S_, S_, H_, H_, P_, P_]],   // 7 SABOT, 5 HEAT, 2 HEP slots (bottom row, top row)
      baseM = { M735: M(0x9aa0a4, 0.45), M456: M(0x9c7a3a, 0.45), M393: M(0x8a6a2a, 0.4) };
    const rackBases = { M735: [], M456: [], M393: [] };
    for (let r = 0; r < 2; r++) for (let k = 0; k < 7; k++) { const t = kinds[r][k], m = new THREE.Mesh(new THREE.CylinderGeometry(0.061, 0.061, 0.02, 12).rotateX(Math.PI / 2).translate(-0.6 + k * 0.2, 0.47 + r * 0.16, 1.49), baseM[t]); GU.add(m); rackBases[t].push(m); }
    plate(GU, 'SABOT', 0.3, 0.035, -0.4, 0.73, 1.49, Math.PI, 0, '#e8e4d0', '#1c1d1a'); plate(GU, 'HEAT', 0.2, 0.035, 0.1, 0.73, 1.49, Math.PI, 0, '#e8e4d0', '#1c1d1a'); plate(GU, 'HEP', 0.14, 0.035, 0.5, 0.73, 1.49, Math.PI, 0, '#e8e4d0', '#1c1d1a');
    for (const [id, x, w, y, n] of [['M735', -0.3, 0.8, 0.47, 'SABOT (M735)'], ['M735', -0.4, 0.6, 0.63, 'SABOT (M735)'], ['M456', 0.4, 0.6, 0.47, 'HEAT (M456)'], ['M456', 0.1, 0.4, 0.63, 'HEAT (M456)'], ['M393', 0.5, 0.4, 0.63, 'HEP (M393)']])
      hit('loader', 'rack:' + id, w, 0.16, 0.14, x, y, 1.47, GU, 'READY RACK  -  ' + n);
    hit('loader', 'breech', 0.5, 0.5, 0.6, 0, 0.38, -0.25, GU, 'BREECH  -  RAM THE ROUND');
    hit('loader', 'lhatch', 0.5, 0.08, 0.5, -0.62, 0.93, 0.15, GU, "LOADER'S HATCH");
    hit('loader', 'radio', 0.8, 0.24, 0.3, 0.1, 0.86, 1.78, GU, 'AN/VRC-12  -  REPORT TO THE PLATOON');
    anim.rack = rackBases;
    // ------------------------------------------------------------------ commander (cupola frame; seen when he looks about inside, E)
    const CU = interior.commander;
    hit('commander', 'chatch', 0.6, 0.06, 0.6, 0, 0.4, 0, CU, "COMMANDER'S HATCH");
    hit('commander', 'override', 0.12, 0.1, 0.16, 0.3, 0.08, -0.24, CU, 'OVERRIDE  -  LAY THE MAIN GUN ON THE CUPOLA');
    hit('commander', 'can50', 0.18, 0.15, 0.22, -0.34, 0.3, 0.06, CU, 'M85  -  CHANGE THE AMMUNITION CAN');
    plate(CU, 'OVERRIDE', 0.09, 0.02, 0.3, 0.115, -0.3, 0, -0.4, '#e8e4d0', '#5a1410');
    // ------------------------------------------------------------------ the crew in the fighting compartment
    figs.gunner = crewInside(); figs.gunner.position.set(0.55, -0.17, -0.3); GU.add(figs.gunner);
    figs.commander = crewInside(); figs.commander.position.set(0.62, 0.42, 0.42); GU.add(figs.commander);
    figs.loader = crewInside(true); figs.loader.position.set(-0.62, -0.6, 0.2); figs.loader.rotation.y = Math.PI * 0.85; GU.add(figs.loader);
  } else {
    // ------------------------------------------------------------------ M113 driver (hull frame; the panel to his left front)
    const D = interior.driver, IP = interior.panel;
    anim.master = toggle(IP, 0.08, -0.135, 0); anim.pumps = toggle(IP, -0.135, 0.09, 0);
    IP.add(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.02, 10).rotateX(Math.PI / 2).translate(0.16, -0.135, 0.01), red));
    plate(IP, 'MASTER', 0.05, 0.011, 0.08, -0.155, 0.004); plate(IP, 'START', 0.05, 0.011, 0.16, -0.155, 0.004); plate(IP, 'BILGE', 0.05, 0.012, -0.135, 0.06, 0.004);
    hit('driver', 'master', 0.05, 0.06, 0.05, 0.08, -0.14, 0.015, IP, 'MASTER SWITCH');
    hit('driver', 'start', 0.05, 0.05, 0.05, 0.16, -0.14, 0.015, IP, 'START  -  HOLD UNTIL IT CATCHES');
    hit('driver', 'pumps', 0.06, 0.06, 0.05, -0.135, 0.09, 0.015, IP, 'BILGE PUMPS');
    // the ramp control and the trim vane handle on the left wall, the fire extinguisher pull, hatch, selector
    const LW = new THREE.Group(); LW.position.set(-1.17, 1.1, -1.55); LW.rotation.y = Math.PI / 2; D.add(LW);
    LW.add(new THREE.Mesh(box(0.34, 0.16, 0.03, 0, 0, -0.015), dark));
    plate(LW, 'RAMP', 0.1, 0.022, -0.08, 0.05, 0.002); plate(LW, 'VANE', 0.1, 0.022, 0.08, 0.05, 0.002);
    anim.ramp = toggle(LW, -0.08, -0.02, 0); anim.vane = toggle(LW, 0.08, -0.02, 0);
    hit('driver', 'ramp', 0.1, 0.1, 0.05, -0.08, -0.01, 0.02, LW, 'RAMP  -  RAISE / LOWER');
    hit('driver', 'vane', 0.1, 0.1, 0.05, 0.08, -0.01, 0.02, LW, 'TRIM VANE');
    D.add(new THREE.Mesh(box(0.05, 0.08, 0.04, -1.15, 0.95, -1.25), red));
    hit('driver', 'halon', 0.1, 0.12, 0.1, -1.15, 0.95, -1.25, D, 'FIRE EXTINGUISHER  -  PULL');
    hit('driver', 'range', 0.1, 0.28, 0.1, -0.25, 1.07, -1.75, D, 'RANGE SELECTOR  -  1-3 / 1-2');
    hit('driver', 'dhatch', 0.44, 0.06, 0.44, -0.62, 1.82, -1.35, D, "DRIVER'S HATCH");
    hit('driver', 'park', 0.12, 0.2, 0.1, -0.46, 1.25, -1.95, D, 'PARKING BRAKE (LATERALS LATCHED)');
    // ------------------------------------------------------------------ the troop compartment: the commander inside, the squad
    const C = interior.troops;
    hit('commander troop', 'radio', 0.5, 0.35, 0.32, 0.75, 1.55, -0.68, C, 'AN/VRC-46  -  REPORT');
    hit('commander', 'can50', 0.3, 0.22, 0.2, -0.3, 1.6, -0.62, C, 'M2  -  NEW AMMUNITION BOX');
    C.add(new THREE.Mesh(box(0.28, 0.18, 0.12, -0.3, 1.6, -0.62), olive));   // the ready box, stowed forward left of the cupola
    hit('commander troop', 'ramp', 0.7, 0.5, 0.2, 0.3, 1.0, 2.6, C, 'RAMP  -  RAISE / LOWER');
    hit('troop', 'cargo', 1.0, 0.08, 0.9, 0, 1.78, 1.35, C, 'CARGO HATCH');
    hit('commander', 'chatch', 0.6, 0.06, 0.6, 0.25, 2.1, -0.35, C, "COMMANDER'S HATCH");   // (overhead: the lid on the cupola ring)
  }
  // the hover marker
  const hov = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffd040, depthTest: false, transparent: true }));
  hov.renderOrder = 9; hov.visible = false; hov.matrixAutoUpdate = false; model.group.add(hov);
  const _m = new THREE.Matrix4(), _s = new THREE.Matrix4();
  const set = (bat, on) => { if (bat) bat.rotation.x = on ? -0.5 : 0.5; };
  return {
    figs,
    hitsFor: role => byRole[role] || [],
    clear() { hov.visible = false; },
    labelOf: id => labels[id] || id.toUpperCase(),
    update(o) {
      const { hover, V, IN, D } = o;
      hov.visible = false;
      const h = hover && hitsOf[hover] && hitsOf[hover].find(x => { let p = x.parent; while (p) { if (!p.visible) return false; p = p.parent; } return true; });
      if (h) { const z = h.userData.size; h.updateWorldMatrix(true, false); model.group.updateWorldMatrix(true, false); _m.copy(model.group.matrixWorld).invert().multiply(h.matrixWorld); hov.matrix.copy(_m).multiply(_s.makeScale(z[0], z[1], z[2])); hov.visible = true; }
      set(anim.master, IN.master);
      if (M60) {
        set(anim.tpower, IN.power); set(anim.stab, IN.stab);
        const r = V.racks.readyAmmo; for (const k in anim.rack) anim.rack[k].forEach((m, i) => { m.visible = i < (r[k] || 0); });
      } else { set(anim.pumps, IN.pumps); set(anim.ramp, IN.ramp); set(anim.vane, IN.vane); }
      const ci = o.crewIn || {};
      for (const k in figs) { const f = figs[k], c = ci[k]; f.visible = !!c; if (c) f.position.y = (k === 'loader' ? -0.6 : k === 'commander' ? 0.42 : -0.17) + (c === 'up' ? 0.55 : 0); }
    },
  };
}
