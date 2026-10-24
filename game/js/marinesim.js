// NGC-1980 wave 2 (ngc/foot2): the 1980 Marine in the game world, as one PURE object (no THREE, no DOM: node runs it
// in tools/marinebench.mjs). It joins the wave-1 modules:
//   - INFANTRY's rifleman (rifleman.js: soldier.js body - inertia, stances, stamina physiology, sway, recoil, ADS, lean -
//     plus the weapons, live projectiles and hit registration),
//   - MEDINV's medical sim (medical.js: wounds, bleeding, shock, treatments) and inventory (inventory.js: the rig, the
//     magazines), joined to the rifleman by invbridge.js (the inventory is his magazine source and sets his load),
//   - FOUNDATION's walker (footsim.js) as the part that knows the WORLD: ship decks that sail, turn, heave, pitch and
//     roll (platform.js through the ground host), ladders, walls, steps, swimming and falls.
// Every 1/120 s step: the deck carries the walker (and the soldier's view with it), the soldier decides how he wants to
// move (his deck-relative velocity, with inertia, load, slope, injuries), the walker moves him through the world, and
// what the world allowed (a wall, a ladder, a drop) is fed back to the soldier.
//
//   const MS = createMarineSim({ seed, raycast(x0, y0, z0, x1, y1, z1, P) });
//   MS.place(x, y, z, yaw);  each frame: MS.step(dt, input, GR) -> events;  after war.update: MS.afterWar(GR)
//   input: rifleman input (soldier.js / rifleman.js): { move: [x, y], look: [dx, dy] rad, sprint, walk, ads, fire, holdBreath,
//          lean, stance (one-shot), jump, bipod, actions: [...] }
//   MS.hit(hitInfo) -> medical result (hitInfo: medical.js normaliseHit / ballistics.js makeHitInfo; dir in world space is
//          turned into the body frame here)
import { createWalker } from './footsim.js';
import { createRifleman } from './units/infantry/rifleman.js';
import { createMedical, mulberry32 } from './units/infantry/medical.js';
import * as I from './units/infantry/inventory.js';
import { createInvBridge, resupply } from './units/infantry/invbridge.js';
import { atmosphere } from './units/infantry/ballistics.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MOA = Math.PI / 10800;
export const STEP = 1 / 120;   // the rifleman's recommended fixed step (soldier springs, sway, projectiles)
// the ground host's surfaces -> the soldier's (Pandolf terrain factors, footstep sounds, bullet impact materials)
export const SURF_MAP = { road: 'concrete', deck: 'metal', rock: 'rock', grass: 'grass', sand: 'sand', mud: 'mud', water: 'water', hole: 'rock',
  dirt: 'dirt', wetsand: 'sand', shingle: 'rock', marsh: 'mud' };   // TERRAIN (wave 3): the islands' new surfaces (world/terrain.js SURFACE .foot)

// MEDINV's state -> soldier.js medical modifiers (0..1 scales; see soldier.js MODS)
export function soldierMods(M, out = {}) {
  const R = M.regions, limb = r => { const x = R[r]; if (x.lost || x.hp <= 0) return 0.95; if (x.fracture) return 0.9 - 0.35 * x.splint; return clamp((1 - x.hp / x.max) * 0.5, 0, 0.45) + (x.tq.length ? 0.15 : 0); };
  const med = M.mods();
  out.pain = clamp(M.pain() / 100, 0, 1); out.morphine = M.analgesia(); out.adrenaline = M.adrenaline;
  out.legL = limb('legL'); out.legR = limb('legR'); out.armL = limb('armL'); out.armR = limb('armR');
  out.bloodLoss = clamp(M.lossFrac() * 2, 0, 1); out.shock = clamp((med.cls - 1) / 3, 0, 1);
  out.tremor = med.tremor / (3 * MOA);                       // soldier.js: 1 = 3 MOA of hand tremor; MEDINV: radians
  out.unconscious = !!(M.unconscious || M.dead);
  out.armInjury = Math.max(out.armL, out.armR); out.slowHands = Math.max(0, med.reloadMul - 1);   // weapons.js manual actions
  out.med = med;
  return out;
}

export function createMarineSim(o = {}) {
  // (a reseedable generator: tests make a wound roll repeatable with MS.reseed(n); ngc/infdepth)
  let gen = o.rng || mulberry32(o.seed || 1980);
  const rng = () => gen();
  const W = createWalker();
  const inv = o.inventory || I.loadout(o.loadout || 'rifleman');
  const B = createInvBridge(inv, { rng });
  const R = createRifleman({ loadout: B.loadout(), inventory: B, kitKg: 0, id: o.id ?? 'player', side: 1, rng, swayScale: o.swayScale ?? 1, deadzone: o.deadzone ?? 0 });
  B.attach(R);
  const S = R.soldier;
  const M = o.medical || createMedical({ rng, skill: o.skill || 'rifleman', name: o.name || 'MARINE' });
  const MS = { W, R, S, M, inv, B, mods: {}, events: [], medEvents: [], dead: false, cause: null, atmos: atmosphere({ T: 27, rh: 0.75 }), listener: { x: 0, y: 0, z: 0, id: o.id ?? 'player' }, raycast: o.raycast || null, medAcc: 0, t: 0 };
  // ---------------------------------------------------------------- the soldier's world (soldier.js / rifleman.js env)
  // groundY: the floor the walker stands on (a wall reads as level ground: the walker stops him there, not the slope
  // code); move: none (the walker moves him); water from the walker's own wading / swimming
  let GRc = null;
  const _rp = { x: 0, z: 0, r: 0.1, y0: 0, y1: 0, nx: 0, nz: 0 };   // (a probe for the weapon-rest test)
  const renv = {
    g: 9.81,   // people and bullets at real gravity (the game's jets use 9.0)
    groundY: (x, z) => { if (!GRc) return W.y; const f = GRc.floor(x, z, W.y + 0.3, 0.75); return f === Infinity || f < W.y - 3 ? W.y : f; },
    surface: () => W.swim || W.wade > 0.05 ? 'water' : SURF_MAP[W.surface] || 'grass',
    waterDepth: () => W.swim ? 2 : W.wade * 1.3,
    onStair: () => !!(GRc && GRc.stairAt && GRc.stairAt(W.x, W.z, W.y)),   // ngc/interiors
    move: pos => ({ x: pos.x, z: pos.z }),
    // a ledge under the handguard (sandbags, a deck-edge coaming, a wall top): rested aim
    restAt: (x, y, z, yaw) => {
      if (!GRc) return false; const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      for (const d of [0.45, 0.65]) { const f = GRc.floor(x + fx * d, z + fz * d, y + 0.1, 0.6); if (f !== Infinity && f > y - 0.25 && f < y + 0.08) { MS.restKind = 'ledge'; return true; } }
      // ngc/infdepth: walls and windows (GR.collide: buildings, superstructures, rails, sandbag colliders, parked crafts):
      // the top of a wall or a sill just under the handguard with nothing above it, or the side of a wall / a window
      // frame right beside it (the handguard pressed against it, Arma style)
      if (GRc.collide) {
        const rx = Math.cos(yaw), rz = -Math.sin(yaw), hx = x + fx * 0.5, hz = z + fz * 0.5;
        const hit = (px, pz, r, y0, y1) => { _rp.x = px; _rp.z = pz; _rp.r = r; _rp.y0 = y0; _rp.y1 = y1; _rp.nx = _rp.nz = 0; return GRc.collide(_rp, null) > 0; };
        if (hit(hx, hz, 0.12, y - 0.3, y - 0.05) && !hit(hx, hz, 0.1, y + 0.03, y + 0.3)) { MS.restKind = 'wall'; return true; }
        // (the side probes reach 0.4 m out: his own body keeps him ~0.3 m off a wall)
        for (const s of [-1, 1]) if (hit(hx + rx * 0.28 * s, hz + rz * 0.28 * s, 0.12, y - 0.08, y + 0.2) && !hit(x + fx * 0.25, z + fz * 0.25, 0.08, y - 0.05, y + 0.1)) { MS.restKind = s < 0 ? 'left' : 'right'; return true; }
      }
      MS.restKind = null; return false;
    },
    raycast: (x0, y0, z0, x1, y1, z1, P) => MS.raycast ? MS.raycast(x0, y0, z0, x1, y1, z1, P) : null,
    get atmos() { return MS.atmos; }, listener: MS.listener, dirt: 0,
  };
  MS.env = renv;
  MS.reseed = s => { gen = mulberry32(s); };
  // the walker's world: the ground host, but the deck carry is done here (once per frame, propagated to the soldier)
  let wenv = null;
  const wrapEnv = GR => { if (!wenv || wenv._GR !== GR) { wenv = Object.create(GR); wenv._GR = GR; wenv.carry = () => {}; } return wenv; };
  // ---------------------------------------------------------------- placing him
  // (foot.js places the walker - spawns, getting out of a craft - so W.place puts the soldier there too)
  const wPlace = W.place;
  W.place = (x, y, z, yaw = 0) => { wPlace(x, y, z, yaw); S.place(x, y, z, yaw, 'stand'); W.stance = 'stand'; W.pitch = 0; MS.syncPos(); };
  MS.place = (x, y, z, yaw = 0, stance = 'stand') => {
    W.place(x, y, z, yaw); if (stance !== 'stand') { S.place(x, y, z, yaw, stance); W.stance = stance; }
    MS.syncPos();
  };
  MS.syncPos = () => { const dx = W.x - S.pos.x, dy = W.y - S.pos.y, dz = W.z - S.pos.z; S.pos.x = W.x; S.pos.y = W.y; S.pos.z = W.z; S.eye.x += dx; S.eye.y += dy; S.eye.z += dz; };
  // the deck moved him (W.carried): the soldier's body, view and gun turn with the ship
  function propagateCarry() {
    const c = W.carried; if (!c) { MS.syncPos(); return; }
    S.yaw += c.dyaw; S.wYaw += c.dyaw; S.aimYaw += c.dyaw; S.camYaw += c.dyaw;
    MS.syncPos();
  }
  MS.afterWar = GR => { if (!W.plat) return null; GR.carry(W); const c = W.carried; propagateCarry(); GR.settle(W, W.onGround || !!W.ladder); return c; };
  // ---------------------------------------------------------------- one frame
  const intent = { mx: 0, mz: 0, sprint: false, walk: false, stance: 'stand', jump: false, yaw: 0, pitch: 0, speedK: 1, vel: { x: 0, z: 0 } };
  MS.step = (dt, input, GR) => {
    GRc = GR; MS.events.length = 0; MS.medEvents.length = 0;
    const genv = wrapEnv(GR);
    GR.carry(W); MS.carried = W.carried; propagateCarry();
    let left = Math.min(dt, 0.25), first = true;
    while (left > 1e-6) {
      const h = Math.min(STEP, left); left -= h;
      sub(h, first ? input : { ...input, look: [0, 0], actions: [], stance: null, jump: false, bipod: false }, genv, first); first = false;
    }
    GR.settle(W, W.onGround || !!W.ladder);
    MS.t += dt;
    return MS.events;
  };
  function sub(h, input, genv, first) {
    // medical at ~10 Hz (its own integration is good to 0.25 s)
    MS.medAcc += h;
    if (MS.medAcc >= 0.1) { const evs = M.update(MS.medAcc, { exertion: S.exertion, moving: S.speed > 0.3 }); MS.medAcc = 0; for (const e of evs) MS.medEvents.push(e); soldierMods(M, MS.mods); }
    const med = MS.mods.med;
    if (M.dead && !MS.dead) { MS.dead = true; MS.cause = M.cause; }
    const inp = input;
    if (med && !med.sprint) inp.sprint = false;
    if (med && med.weaponUse === 'none') inp.fire = false;
    if (W.ladder || W.swim) { inp.fire = false; inp.ads = false; }
    MS.listener.x = S.eye.x; MS.listener.y = S.eye.y; MS.listener.z = S.eye.z;
    const evs = R.step(h, inp, renv, MS.mods);
    let jumped = false;
    for (const e of evs) { MS.events.push(e); if (e.e === 'body' && e.ev.e === 'jump') jumped = true; }
    // the walker moves him through the world with the soldier's velocity (deck-relative)
    const st = S.stanceT < 1 ? S.stanceTo : S.stance;
    intent.mx = (inp.move || [0, 0])[0]; intent.mz = (inp.move || [0, 0])[1]; intent.stance = st; intent.jump = jumped; intent.yaw = S.yaw;
    intent.vel.x = S.vel.x; intent.vel.z = S.vel.z;
    intent.dive = !!inp.dive;   // ngc/waterfish: hold C in the water to dive
    // ngc/infdepth: a casualty in his hands (marinecare.js sets MS.burden = { v: MEDINV BUDDY drag / carry speed, drain }):
    // no faster than that, and the effort comes out of his anaerobic reserve on top of the walking demand
    if (MS.burden) {
      const vl = Math.hypot(S.vel.x, S.vel.z), cap = MS.burden.v;
      if (vl > cap) { const k = cap / vl; S.vel.x *= k; S.vel.z *= k; intent.vel.x = S.vel.x; intent.vel.z = S.vel.z; }
      if (vl > 0.1) S.reserve = Math.max(0, S.reserve - (MS.burden.drain - 1) * 0.09 * h * Math.min(1, vl / Math.max(0.3, cap)));
    }
    W.yaw = S.yaw; W.pitch = S.pitch;
    const eye0x = S.eye.x - S.pos.x, eye0y = S.eye.y - S.pos.y, eye0z = S.eye.z - S.pos.z;
    const wevs = W.step(h, intent, genv);
    for (const e of wevs) {
      MS.events.push({ e: 'walker', ev: e });
      if (e.e === 'land' && e.v > 6) M.fall(e.v);
      else if (e.e === 'fall' && e.water) M.fall(e.v * 0.6);
    }
    // what the world allowed, back into the soldier
    S.pos.x = W.x; S.pos.y = W.y; S.pos.z = W.z; S.eye.x = W.x + eye0x; S.eye.y = W.y + eye0y; S.eye.z = W.z + eye0z;
    if (W.ladder) { S.vel.x = S.vel.z = 0; S.lower = 1; }
    else if (W.onGround || W.swim) { S.vel.x = W.vx; S.vel.z = W.vz; }
    S.onGround = W.onGround || !!W.ladder || W.swim;
    // the weapons and the gear on the man: reconcile magazines with the inventory items
    B.sync();
  }
  // ---------------------------------------------------------------- wounds
  // h: medical.js hit-info. A world-space dir array is turned into the body frame with his yaw.
  MS.hit = h => {
    if (M.dead) return null;
    if (Array.isArray(h.dir)) h.victimYaw = S.yaw;
    else if (h.dir && h.dir.x !== undefined && h.world) { h.dir = [h.dir.x, h.dir.y, h.dir.z]; h.victimYaw = S.yaw; }
    const r = M.hit(h, I.armour(inv));
    soldierMods(M, MS.mods);
    if (M.dead && !MS.dead) { MS.dead = true; MS.cause = M.cause; }
    return r;
  };
  // rearm / resupply (a friendly pad, the carrier): magazines refilled, LAW, first-aid items
  MS.resupply = () => { const got = resupply(inv); B.sync(); return got; };
  // a fresh man (a new life): new kit, new body
  MS.reset = () => {
    const fresh = I.loadout(o.loadout || 'rifleman');
    for (const k of Object.keys(inv)) delete inv[k];
    Object.assign(inv, fresh); I.relink(inv);
    B.attach(R); M.restore(); MS.dead = false; MS.cause = null; S.reserve = S.maod; S.fatigue = 0; S.hr = S.hrRest;
    R.projectiles.length = 0; R.swap = null; R.glMode = false; soldierMods(M, MS.mods);
  };
  soldierMods(M, MS.mods);
  return MS;
}
