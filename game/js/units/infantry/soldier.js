// NGC-1980 infantry: the soldier's body. PURE: plain JS, no THREE, no DOM (runs in node).
//
// Movement with Arma-like inertia (accelerate / brake / turn limits, heavier with load), three stances with timed
// transitions, walk / run / sprint, lean, free look and an aim deadzone (weapon vs view split), weapon inertia, sway,
// recoil, breath holding, and a physiological stamina model:
//   - metabolic demand from the PANDOLF equation for walking (Pandolf, Givoni & Goldman 1977, J Appl Physiol 43:577):
//       M (W) = 1.5 W + 2.0 (W + L) (L / W)^2 + eta (W + L) (1.5 V^2 + 0.35 V G)          [CONFIRMED equation]
//     and the ACSM running equation (VO2 = 3.5 + 0.2 S + 0.9 S G, ml/kg/min, S in m/min) scaled by (W + L) / W,
//     with terrain factors eta (blacktop 1.0, dirt road 1.1, light brush 1.2, heavy brush 1.5, swamp 1.8, loose sand 2.1:
//     CONFIRMED, Pandolf 1977 / Soule & Goldman 1972)
//   - oxygen uptake follows demand with a lag (VO2 kinetics, tau ~25 s) up to VO2max; whatever it cannot cover comes out
//     of the anaerobic reserve (the maximal accumulated oxygen deficit, ~60-70 ml/kg for trained men: Medbo 1988) and is
//     paid back afterwards by extra uptake (EPOC): you are out of breath AFTER a sprint, recover faster at rest
//   - heart rate and breathing follow uptake and debt; they drive the sway. Long-term fatigue builds above ~45 % VO2max.
//   - slope: Tobler's hiking function scales walking pace on grades (Tobler 1993) [CONFIRMED function]
//
// Axes: three.js (+y up). yaw 0 faces -z, positive yaw turns left (counter-clockwise seen from above, like
// THREE.Euler 'YXZ'); pitch positive = up. Forward = (-sin yaw, 0, -cos yaw), right = (cos yaw, 0, -sin yaw).
//
// INPUT (per step):
//   { move: [x, y]   strafe right +, forward + (|v| <= 1),
//     look: [dx, dy] radians this step (mouse: right +, up +),
//     sprint, walk (slow walk), ads, freeLook, holdBreath, jump: booleans,
//     stance: null | 'stand' | 'crouch' | 'prone' | 'up' | 'down' (a request this step),
//     lean: -1 (left) .. 1 (right), bipod: toggle request, deadzone: aim deadzone half-angle in rad (0 = Tarkov style) }
// ENV (host world):
//   { groundY(x, z), surface?(x, z) -> 'grass'|'dirt'|'rock'|'sand'|'mud'|'wood'|'metal'|'concrete'|'water'|'brush',
//     waterDepth?(x, z), move?(pos, dx, dz, radius, height) -> {x, z} (collision), restAt?(x, y, z) -> bool (a ledge
//     under the handguard), headroom?(x, y, z) -> m above the feet (stand up blocked if < stance height), g = 9.81 }
// MODS (medical, from MEDINV; all optional, 0..1 unless noted):
//   { pain, legL, legR (> 0.6 = fractured: no run, limp), armL, armR (sway, slower hands), bloodLoss, shock,
//     tremor (extra hand tremor), morphine (dulls pain), adrenaline, unconscious (bool) }
// WEAPON (what the soldier holds, from rifleman.js): { mass (kg), cls: 'rifle'|'mg'|'pistol'|'law'|'gl'|'none',
//   adsTime (s), bipod (has one), busy (an action in progress) }

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2, MOA = Math.PI / 10800, DEG = Math.PI / 180;
const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

// ------------------------------------------------------------------------------------------------ data
// Eye heights (m above the feet): stand 1.62 (50th percentile US male eye height ~1.63 m: CONFIRMED, MIL-STD-1472),
// crouch / kneel 1.12 and prone 0.36 (rifle prone, propped on elbows): INFERRED.
export const BODY = {
  eye: { stand: 1.62, crouch: 1.12, prone: 0.36 }, height: { stand: 1.80, crouch: 1.30, prone: 0.50 }, radius: 0.30,
  lean: { stand: 0.34, crouch: 0.30, prone: 0.20 }, leanRoll: { stand: 14 * DEG, crouch: 12 * DEG, prone: 6 * DEG },
};
// Speeds (m/s). walk = quick time, 120 steps/min x 30 in = 1.52 m/s; run = double time, 180 steps/min x 36 in = 2.74 m/s
// (CONFIRMED, FM 22-5 Drill and Ceremonies). Sprint 5.8 m/s with a light fighting load: INFERRED (loaded soldiers
// sprint 5-6.5 m/s in 3-5 s rushes, FM 7-8 / FM 21-75 "I'm up, he sees me, I'm down"). Crouched and crawl: INFERRED.
export const SPEED = { walk: 1.52, run: 2.74, sprint: 5.8, crouchWalk: 1.0, crouchRun: 2.1, crawl: 0.32, crawlFast: 0.55, adsWalk: 1.2, limp: 0.9, swim: 0.8 };
// stance transition times (s), unloaded; scaled by (1 + load / 60): INFERRED (drill: stand-to-prone "rush" drop ~1 s)
export const STANCE_T = { 'stand>crouch': 0.45, 'crouch>stand': 0.5, 'crouch>prone': 0.85, 'prone>crouch': 1.05, 'stand>prone': 1.1, 'prone>stand': 1.6 };
// terrain factor eta for the Pandolf equation (CONFIRMED values, Pandolf 1977)
export const ETA = { concrete: 1.0, metal: 1.0, wood: 1.0, dirt: 1.1, grass: 1.2, rock: 1.25, brush: 1.5, mud: 1.8, sand: 2.1, water: 1.8 };
// sway half-amplitude in MOA for a shouldered rifle on the sights, rested 0.55x, bipod 0.25x. INFERRED from marksmanship
// hold data (trained shooter wobble: standing +-3-4 MOA, kneeling +-2, prone +-1).
const SWAY_MOA = { stand: 3.2, crouch: 2.0, prone: 0.9 };
const RECOIL_STANCE = { stand: 1.0, crouch: 0.85, prone: 0.6 };
const ORDER = ['prone', 'crouch', 'stand'];

// ------------------------------------------------------------------------------------------------ physiology
// metabolic demand in ml O2 / kg body mass / min (1 W = 60 / 20.1 ml O2 per min; 20.1 J per ml O2)
export function metabolicDemand({ W = 80, L = 0, V = 0, G = 0, eta = 1.1, stance = 'stand', crawl = false, sprint = false }) {
  const toVO2 = watts => watts / 20.1 * 60 / W;
  const stand = 1.5 * W + 2.0 * (W + L) * (L / W) ** 2;
  if (crawl) return toVO2(stand) + (12 + 60 * V) * (1 + 0.5 * L / W) * (eta / 1.1);   // crawling: INFERRED (~30-45 ml/kg/min)
  // Pandolf walking (downhill term floored: the equation goes negative on steep descents; Santee 2001 fix approximated)
  const walkW = stand + eta * (W + L) * (1.5 * V * V + 0.35 * V * G);
  const walk = Math.max(toVO2(stand) * 1.1, toVO2(walkW));
  if (V < 2.0) return walk + (stance === 'crouch' && V > 0.1 ? 5 : 0);
  // ACSM running, loaded, with a sprint inefficiency factor above 4 m/s (acceleration, cutting, rifle carry): INFERRED
  const S = V * 60, run = (3.5 + 0.2 * S + 0.9 * S * Math.max(0, G / 100)) * (W + L) / W * (0.85 + 0.15 * eta) * (1 + 0.15 * Math.max(0, V - 4) ** 2);
  // a sprint is an all-out effort: ~150 ml/kg/min equivalent (about 3x VO2max, a 30-40 s anaerobic effort) plus the
  // load; the load shows up as a slower sprint, not a cheaper one. INFERRED (fits loaded rushes, see infantrybench)
  if (sprint) return Math.max(run, 150 * (1 + 0.6 * L / W) * (0.85 + 0.15 * eta));
  return V < 2.6 ? lerp(walk, run, (V - 2.0) / 0.6) : run;
}
// Tobler's hiking function as a pace factor relative to flat ground (slope = dh/ds)
export const tobler = s => Math.exp(-3.5 * Math.abs(s + 0.05)) / Math.exp(-3.5 * 0.05);

// ------------------------------------------------------------------------------------------------ the soldier
export function createSoldier(o = {}) {
  const rng = o.rng || Math.random;
  const S = {
    W: o.bodyMass ?? 80,                 // kg (USMC 1980 average ~75-80 kg: INFERRED)
    load: o.load ?? 20,                  // kg carried (inventory + weapons); the host updates it every step
    vo2max: o.vo2max ?? 50,              // ml/kg/min, fit young Marine: INFERRED (45-55 typical)
    maod: o.maod ?? 65,                  // ml/kg anaerobic reserve: INFERRED (Medbo 1988, 60-70 trained)
    hrRest: 65, hrMax: 194,              // Tanaka 2001: 208 - 0.7 x age (20 y) = 194: CONFIRMED formula
    pos: { x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0 }, vel: { x: 0, y: 0, z: 0 },
    yaw: o.yaw ?? 0, pitch: 0,           // view (body heading + view pitch)
    headYaw: 0, headPitch: 0,            // free-look offsets
    dzYaw: 0, dzPitch: 0,                // weapon offset inside the aim deadzone
    wYaw: o.yaw ?? 0, wPitch: 0, wYawV: 0, wPitchV: 0,   // weapon direction with inertia (lags the target)
    swayYaw: 0, swayPitch: 0, recYaw: 0, recPitch: 0, recYawV: 0, recPitchV: 0,
    aimYaw: o.yaw ?? 0, aimPitch: 0,     // final bore direction (before the sight elevation)
    camYaw: o.yaw ?? 0, camPitch: 0, camRoll: 0,
    eye: { x: 0, y: 0, z: 0 },
    stance: 'stand', stanceFrom: 'stand', stanceTo: 'stand', stanceT: 1, stanceDur: 0, eyeH: BODY.eye.stand,
    lean: 0, ads: 0, adsTarget: false, lower: 0, raiseT: 0, sprinting: false, walkMode: !!o.walkMode,
    speed: 0, gait: 'idle', gaitPhase: 0, stepDist: 0, footSide: 0, bob: { x: 0, y: 0 },
    onGround: true, airborne: false, fallStartY: 0, swimming: false, grade: 0, surface: 'grass',
    bipod: false, rested: false, holdBreath: false, holdT: 0, holdMax: 8, gaspT: 0,
    // physiology
    vo2: 8, demand: 8, reserve: o.maod ?? 65, fatigue: 0, hr: 65, breathRate: 12, breathPhase: 0, breathDepth: 0.3,
    pendingYaw: 0, ouY: 0, ouP: 0, tremPhase: 0, pulsePhase: 0, shake: 0, t: 0,
    mods: {}, events: [], canFire: true, deadzone: o.deadzone ?? 0, swayScale: o.swayScale ?? 1,   // swayScale: 0 for tests
    get exertion() { return clamp((S.hr - S.hrRest) / (S.hrMax - S.hrRest), 0, 1); },
    get debt() { return clamp(1 - S.reserve / S.maod, 0, 1); },
    get staminaFrac() { return clamp(S.reserve / S.maod, 0, 1); },
    get transitioning() { return S.stanceT < 1; },
  };
  const ev = (e, x) => { const a = { e }; if (x) Object.assign(a, x); S.events.push(a); };
  const legCap = m => Math.max(m.legL || 0, m.legR || 0);
  const armI = m => Math.max(m.armL || 0, m.armR || 0);

  // ---------------------------------------------------------------- stance
  function requestStance(req) {
    if (!req) return;
    const cur = S.stanceT < 1 ? S.stanceTo : S.stance;
    let to = req;
    if (req === 'up') to = ORDER[Math.min(2, ORDER.indexOf(cur) + 1)];
    if (req === 'down') to = ORDER[Math.max(0, ORDER.indexOf(cur) - 1)];
    if (req === cur && (req === 'crouch' || req === 'prone')) to = 'stand';   // toggles (C / Z pressed again)
    if (to === cur) return;
    if (to === 'stand' && legCap(S.mods) > 0.85) return;   // can't stand on two broken legs
    if (S.swimming) return;
    if (S._env && S._env.headroom) { const hr = S._env.headroom(S.pos.x, S.pos.y, S.pos.z); if (hr < BODY.height[to]) { ev('blocked'); return; } }
    const from = S.stanceT < 1 ? S.stanceTo : S.stance;
    S.stanceFrom = S.stanceT < 1 ? (S.eyeH > BODY.eye.crouch ? 'stand' : S.eyeH > BODY.eye.prone + 0.2 ? 'crouch' : 'prone') : S.stance;
    S.stanceTo = to; S.stanceT = 0;
    S.stanceDur = (STANCE_T[S.stanceFrom + '>' + to] || 0.6) * (1 + S.load / 60) * (1 + 0.6 * legCap(S.mods)) * (1 + 0.3 * S.fatigue);
    S._eyeFrom = S.eyeH;
    // the energy of getting up / down (lifting body + load; 25 % muscular efficiency), taken from the reserve
    const dh = BODY.eye[to] - BODY.eye[from], J = Math.max(0, dh) * (S.W + S.load) * 9.81 / 0.25 + Math.max(0, -dh) * (S.W + S.load) * 9.81 * 0.4;
    S.reserve -= J / 20.1 / S.W;
    if (to !== 'prone') S.bipod = false;
    ev('stance', { from, to, dur: S.stanceDur });
  }

  // ---------------------------------------------------------------- step
  S.step = function (dt, inp = {}, env = {}, mods = {}, wpn = { mass: 3.2, cls: 'rifle', adsTime: 0.28 }) {
    S.events.length = 0; S.mods = mods; S._env = env; S.t += dt;
    const g = env.g ?? 9.81, m = mods;
    if (m.unconscious) inp = {};
    const look = inp.look || [0, 0], mv = inp.move || [0, 0];
    S.deadzone = inp.deadzone ?? S.deadzone;
    const leg = legCap(m), arm = armI(m), pain = (m.pain || 0) * (1 - 0.8 * (m.morphine || 0)), blood = m.bloodLoss || 0;

    // ------------------------------------------------ stance transition
    requestStance(inp.stance);
    if (S.stanceT < 1) {
      S.stanceT = Math.min(1, S.stanceT + dt / S.stanceDur);
      const e = S.stanceT * S.stanceT * (3 - 2 * S.stanceT);
      S.eyeH = lerp(S._eyeFrom, BODY.eye[S.stanceTo], e);
      if (S.stanceT >= 1) { S.stance = S.stanceTo; ev('stanceDone', { stance: S.stance }); }
    } else S.eyeH = BODY.eye[S.stance];
    const st = S.stanceT < 1 ? S.stanceTo : S.stance;

    // ------------------------------------------------ gait selection and target speed
    let mx = mv[0], my = mv[1]; const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    const moving = ml > 0.05;
    const wantSprint = !!inp.sprint && moving && my > 0.3 && st === 'stand' && S.stanceT >= 1 && !S.bipod;
    const canSprint = S.reserve > 0.12 * S.maod && leg < 0.6 && pain < 0.8 && S.load < 45 && !S.swimming;
    // sprint latches on above 12 % reserve and drops out (blown) at 5 %; it takes a breather to start again
    if (wantSprint && (S.sprinting || canSprint) && S.reserve > 0.05 * S.maod) S.sprinting = true;
    else { if (S.sprinting && wantSprint) ev('blown'); S.sprinting = false; }
    if (inp.sprint && S.stance !== 'stand' && S.stanceT >= 1 && moving && my > 0.3 && st !== 'prone') requestStance('stand');   // sprint from crouch stands you up
    S.adsTarget = !!inp.ads && !S.sprinting && !S.swimming && !m.unconscious;
    if (S.sprinting) S.adsTarget = false;
    let vmax;
    if (S.swimming) vmax = SPEED.swim;
    else if (st === 'prone') vmax = inp.sprint ? SPEED.crawlFast : SPEED.crawl;
    else if (st === 'crouch') vmax = S.walkMode || inp.walk ? SPEED.crouchWalk : SPEED.crouchRun;
    else vmax = S.sprinting ? SPEED.sprint * (0.78 + 0.22 * S.staminaFrac) : S.walkMode || inp.walk ? SPEED.walk : SPEED.run;
    if (S.ads > 0.5) vmax = Math.min(vmax, st === 'prone' ? SPEED.crawl * 0.6 : SPEED.adsWalk * (st === 'crouch' ? 0.75 : 1));
    if (S.stanceT < 1) vmax = Math.min(vmax, 0.3);
    if (S.bipod) vmax = 0;
    // load: run / sprint slow down with load above ~20 kg (FM 21-18: fighting load <= 22 kg, approach march <= 33 kg)
    const loadF = clamp(1 - 0.007 * (S.load - 20), 0.55, 1.05);
    if (vmax > SPEED.walk) vmax = SPEED.walk + (vmax - SPEED.walk) * loadF;
    if (S.load > 60) vmax = Math.min(vmax, SPEED.walk * 0.8);
    // injuries, fatigue, exhaustion
    if (leg > 0.6) vmax = Math.min(vmax, st === 'prone' ? SPEED.crawl * 0.7 : SPEED.limp); else vmax *= 1 - 0.45 * leg;
    vmax *= (1 - 0.15 * S.fatigue) * (1 - 0.4 * blood) * (1 - 0.3 * (m.shock || 0));
    if (S.reserve < 0.05 * S.maod && vmax > SPEED.walk) vmax = SPEED.walk * 1.1;
    // direction: backwards and sideways are slower
    const dirF = my < -0.1 ? 0.6 : 1 - 0.2 * Math.abs(mx) / Math.max(0.01, ml);
    vmax *= dirF;
    // ngc/marine-polish: a ground-speed cap from the host (a casualty on his shoulders or on the drag strap: MEDINV's
    // BUDDY.carrySpeed / dragSpeed are speeds over the ground, so the cap comes after the direction factor)
    if (m.vCap != null && vmax > m.vCap) vmax = m.vCap;
    // slope along the wish direction
    const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw), rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw);
    let wx = fx * my + rx * mx, wz = fz * my + rz * mx; const wl = Math.hypot(wx, wz);
    if (wl > 1e-6) { wx /= wl; wz /= wl; }
    let slope = 0;
    if (env.groundY && moving) { const h0 = env.groundY(S.pos.x, S.pos.z), h1 = env.groundY(S.pos.x + wx * 0.6, S.pos.z + wz * 0.6); slope = (h1 - h0) / 0.6; }
    S.grade = slope;
    if (moving && env.onStair && env.onStair()) vmax *= 0.55;   // ngc/interiors: stairs and a ship's inclined ladders - step by step, not a hillside
    else if (moving) vmax *= clamp(tobler(slope), 0.15, 1.05) * (slope > 0.9 ? 0 : 1);   // > ~42 deg: can't climb it
    // water
    const depth = env.waterDepth ? env.waterDepth(S.pos.x, S.pos.z) : 0;
    if (depth > 1.35 && !S.swimming) { S.swimming = true; if (S.stance !== 'stand') { S.stance = S.stanceTo = 'stand'; S.stanceT = 1; } ev('swim', { on: true }); }
    else if (depth < 1.2 && S.swimming) { S.swimming = false; ev('swim', { on: false }); }
    if (!S.swimming && depth > 0.3) vmax *= 1 - 0.55 * clamp((depth - 0.3) / 1.0, 0, 1);
    const target = moving ? vmax * Math.min(1, ml) : 0;

    // ------------------------------------------------ inertia (Arma-like): accelerate toward the wish velocity
    const tvx = wx * target, tvz = wz * target;
    const massF = (S.W) / (S.W + S.load);   // heavier = slower to start and stop
    const accel = (S.sprinting ? 3.2 : st === 'prone' ? 2.0 : 4.2) * (0.55 + 0.45 * massF / 0.8) * (1 - 0.5 * leg);
    const brake = (st === 'prone' ? 3 : 6.5) * (0.6 + 0.4 * massF / 0.8);
    if (S.onGround || S.swimming) {
      const dvx = tvx - S.vel.x, dvz = tvz - S.vel.z, dv = Math.hypot(dvx, dvz);
      // accelerating along the current velocity uses `accel`, slowing / turning uses `brake`
      const along = (dvx * S.vel.x + dvz * S.vel.z) >= 0 || Math.hypot(S.vel.x, S.vel.z) < 0.2;
      const a = (along ? accel : brake) * dt;
      if (dv <= a) { S.vel.x = tvx; S.vel.z = tvz; } else { S.vel.x += dvx / dv * a; S.vel.z += dvz / dv * a; }
    }
    // ------------------------------------------------ integrate position (host collision if provided)
    const dx = S.vel.x * dt, dz = S.vel.z * dt;
    if (env.move) { const r = env.move(S.pos, dx, dz, BODY.radius, BODY.height[st]); S.pos.x = r.x; S.pos.z = r.z; if (r.blockedX) S.vel.x = 0; if (r.blockedZ) S.vel.z = 0; }
    else { S.pos.x += dx; S.pos.z += dz; }
    const gy = env.groundY ? env.groundY(S.pos.x, S.pos.z) : 0;
    if (S.swimming) { S.pos.y = gy + depth - 1.45; S.vel.y = 0; S.onGround = false; }
    else if (S.onGround) {
      if (inp.jump && st === 'stand' && S.stanceT >= 1 && S.reserve > 0.1 * S.maod && leg < 0.6) { S.vel.y = 2.6; S.onGround = false; S.fallStartY = S.pos.y; S.reserve -= 3; ev('jump'); }   // ~0.35 m hop over a ledge
      else if (S.pos.y - gy > 0.45) { S.onGround = false; S.fallStartY = S.pos.y; S.vel.y = 0; }   // walked off an edge
      else S.pos.y = S.pos.y + (gy - S.pos.y) * Math.min(1, dt * 18);   // follow the ground (small steps smoothed)
    }
    if (!S.onGround && !S.swimming) {
      S.vel.y -= g * dt; S.pos.y += S.vel.y * dt;
      if (S.pos.y <= gy) {
        const v = -S.vel.y; S.pos.y = gy; S.vel.y = 0; S.onGround = true;
        ev('land', { v, h: S.fallStartY - gy });
        // falls: > ~6 m/s (1.8 m) hurt the legs, > ~10 m/s (5 m) can break them: INFERRED (MEDINV decides the injury)
        if (v > 6) ev('fallInjury', { v, severity: clamp((v - 6) / 6, 0, 1) });
        S.vel.x *= 0.5; S.vel.z *= 0.5;
      }
    }
    // slide down very steep ground
    if (S.onGround && env.groundY) {
      const e = 0.4, hx = (env.groundY(S.pos.x + e, S.pos.z) - env.groundY(S.pos.x - e, S.pos.z)) / (2 * e), hz = (env.groundY(S.pos.x, S.pos.z + e) - env.groundY(S.pos.x, S.pos.z - e)) / (2 * e);
      const sl = Math.hypot(hx, hz);
      if (sl > 1.0) { S.vel.x -= hx / sl * 4 * dt * (sl - 1); S.vel.z -= hz / sl * 4 * dt * (sl - 1); }
    }
    S.speed = Math.hypot(S.vel.x, S.vel.z);
    S.surface = depth > 0.05 ? 'water' : env.surface ? env.surface(S.pos.x, S.pos.z) : 'grass';

    // ------------------------------------------------ gait, footsteps, head bob
    // step length from cadence: 0.76 m at 1.52 m/s (120/min), 0.91 m at 2.74 (180/min), ~1.6 m sprinting
    const stepLen = st === 'prone' ? 0.45 : S.speed < 1.52 ? 0.5 + 0.17 * S.speed : S.speed < 2.74 ? 0.76 + (S.speed - 1.52) * 0.123 : 0.91 + (S.speed - 2.74) * 0.23;
    S.gait = S.speed < 0.15 ? 'idle' : st === 'prone' ? 'crawl' : S.sprinting ? 'sprint' : S.speed > 2.0 ? 'run' : 'walk';
    if (S.onGround || S.swimming) {
      S.stepDist += S.speed * dt; S.gaitPhase = (S.gaitPhase + S.speed * dt / (2 * stepLen) * TAU) % TAU;
      if (S.stepDist >= stepLen) { S.stepDist -= stepLen; S.footSide ^= 1; ev('footstep', { surface: S.surface, gait: S.gait, side: S.footSide, speed: S.speed, load: S.load, stance: st }); }
    }
    const bobA = S.gait === 'sprint' ? 0.055 : S.gait === 'run' ? 0.035 : S.gait === 'walk' ? 0.018 : S.gait === 'crawl' ? 0.03 : 0;
    const limp = leg > 0.3 ? leg : 0;
    S.bob.y = lerp(S.bob.y, -Math.abs(Math.sin(S.gaitPhase)) * bobA * (1 + limp) + bobA * 0.5, Math.min(1, dt * 12));
    S.bob.x = lerp(S.bob.x, Math.sin(S.gaitPhase * 0.5) * bobA * 0.4, Math.min(1, dt * 12));

    // ------------------------------------------------ physiology
    const eta = ETA[S.surface] ?? 1.15;
    S.demand = metabolicDemand({ W: S.W, L: S.load, V: S.speed, G: slope * 100, eta, stance: st, crawl: st === 'prone' && S.speed > 0.05, sprint: S.sprinting && S.speed > 3 })
      + (S.swimming ? 25 : 0) + (S.holdBreath ? 1.5 : 0) + 2.5 * S.ads * (wpn.mass > 8 && st !== 'prone' && !S.bipod ? 1 : 0.2);   // holding a heavy gun up costs
    const vmaxEff = S.vo2max * (1 - 0.25 * S.fatigue) * (1 - 0.5 * blood) * (1 + 0.05 * (m.adrenaline || 0));
    const debtMl = S.maod - S.reserve;
    const vTarget = Math.min(vmaxEff, S.demand + Math.max(0, debtMl) / 1.2);    // EPOC: pay the debt back over ~1.2 min of headroom
    const tau = vTarget > S.vo2 ? 0.4 : 0.6;                                     // min (VO2 on / off kinetics: INFERRED)
    S.vo2 += (vTarget - S.vo2) * (1 - Math.exp(-dt / 60 / tau));
    if (S.demand > S.vo2) S.reserve -= (S.demand - S.vo2) * dt / 60;
    else S.reserve = Math.min(S.maod, S.reserve + (S.vo2 - S.demand) * 0.7 * dt / 60 * (1 - 0.5 * blood));
    S.reserve = Math.max(-5, S.reserve);
    const rel = S.vo2 / S.vo2max;
    if (rel > 0.45) S.fatigue = Math.min(1, S.fatigue + (rel - 0.45) * dt / 3600 * 0.9);
    else if (S.speed < 0.2) S.fatigue = Math.max(0, S.fatigue - dt / 7200 * (0.3 + S.fatigue));
    // heart rate: part uptake, part what you are doing now (it falls 20-40 bpm in the first minute of rest while the
    // breathing still pays the oxygen debt back)
    const hrRel = 0.55 * clamp(rel, 0, 1) + 0.45 * clamp(S.demand / S.vo2max, 0, 1);
    const hrT = S.hrRest + (S.hrMax - S.hrRest) * hrRel * 0.95 + 14 * S.debt + 15 * pain + 25 * blood + 10 * (m.adrenaline || 0);
    S.hr += (Math.min(S.hrMax + 10, hrT) - S.hr) * (1 - Math.exp(-dt / (hrT > S.hr ? 6 : 18)));
    const brT = 12 + 30 * rel * rel + 16 * S.debt + (S.gaspT > 0 ? 10 : 0);
    S.breathRate += (brT - S.breathRate) * (1 - Math.exp(-dt / 3));
    S.breathDepth += (0.3 + 0.7 * clamp(rel + S.debt * 0.6, 0, 1) - S.breathDepth) * (1 - Math.exp(-dt / 3));
    // breath hold: up to ~8 s rested, much less when blown; then a tremor builds and the breath comes out
    S.holdMax = 8 * (1 - 0.75 * S.debt) * (1 - 0.5 * rel) + 1;
    const wantHold = !!inp.holdBreath && S.ads > 0.6 && S.gaspT <= 0;
    if (wantHold && !S.holdBreath) { S.holdBreath = true; S.holdT = 0; ev('breath', { hold: true }); }
    if (S.holdBreath) {
      S.holdT += dt;
      if (!wantHold || S.holdT > S.holdMax * 1.6) { S.holdBreath = false; S.gaspT = clamp(S.holdT / S.holdMax, 0.3, 1.6) * 2; S.reserve -= Math.max(0, S.holdT - S.holdMax) * 0.8; ev('breath', { hold: false, gasp: S.holdT > S.holdMax }); }
    } else { S.gaspT = Math.max(0, S.gaspT - dt); S.breathPhase = (S.breathPhase + TAU * S.breathRate / 60 * dt) % TAU; }
    if (!S.holdBreath && Math.floor((S.breathPhase - TAU * S.breathRate / 60 * dt) / Math.PI) !== Math.floor(S.breathPhase / Math.PI)) ev('breathe', { inhale: S.breathPhase < Math.PI, depth: S.breathDepth, rate: S.breathRate });
    S.pulsePhase = (S.pulsePhase + TAU * S.hr / 60 * dt) % TAU;

    // ------------------------------------------------ ADS, weapon lowering (sprint), lean, bipod, rest
    const adsTime = (wpn.adsTime || 0.3) * (1 + 0.8 * arm) * (1 + 0.2 * S.fatigue);
    S.ads = clamp(S.ads + (S.adsTarget ? 1 : -1.3) * dt / adsTime, 0, 1);
    S.lower = clamp(S.lower + (S.sprinting || S.swimming ? 1 : -1) * dt / 0.25, 0, 1);   // swimming: the rifle is slung up out of the water
    const leanT = S.sprinting || S.swimming ? 0 : clamp(inp.lean || 0, -1, 1);
    S.lean += clamp(leanT - S.lean, -dt * 4, dt * 4);
    if (inp.bipod) {
      if (S.bipod) { S.bipod = false; ev('bipod', { on: false }); }
      else if (wpn.bipod && (st === 'prone' || S.rested) && S.speed < 0.2 && S.stanceT >= 1) { S.bipod = true; ev('bipod', { on: true }); }
      else ev('bipodFail');
    }
    if (S.bipod && (S.speed > 0.3 || (st !== 'prone' && !S.rested))) { S.bipod = false; ev('bipod', { on: false }); }
    S.rested = !!(env.restAt && S.ads > 0.3 && env.restAt(S.eye.x, S.eye.y - 0.12, S.eye.z, S.aimYaw));

    // ------------------------------------------------ look: free look, deadzone, prone turn limit, weapon inertia
    let dyaw = -look[0], dpitch = look[1];   // mouse right = turn right = yaw decreases (yaw + = left)
    if (inp.freeLook) {
      S.headYaw = clamp(S.headYaw + dyaw, -100 * DEG, 100 * DEG); S.headPitch = clamp(S.headPitch + dpitch, -70 * DEG, 70 * DEG);
      dyaw = 0; dpitch = 0;
    } else { const k = Math.min(1, dt * 8); S.headYaw -= S.headYaw * k; S.headPitch -= S.headPitch * k; }
    // aim deadzone: the weapon moves first, the view follows when it reaches the edge (Arma); none in ADS
    const dzR = S.ads > 0.5 ? 0 : S.deadzone;
    if (dzR > 0) {
      S.dzYaw += dyaw; S.dzPitch += dpitch;
      const r = Math.hypot(S.dzYaw, S.dzPitch);
      if (r > dzR) { const ex = (r - dzR) / r; dyaw = S.dzYaw * ex; dpitch = S.dzPitch * ex; S.dzYaw -= dyaw; S.dzPitch -= dpitch; } else { dyaw = 0; dpitch = 0; }
    } else { const k = Math.min(1, dt * 10); dyaw += S.dzYaw * k; dpitch += S.dzPitch * k; S.dzYaw -= S.dzYaw * k; S.dzPitch -= S.dzPitch * k; }
    // prone: the body turns slowly (elbows), the bipod even slower
    S.pendingYaw += dyaw;
    const yawRate = S.bipod ? 0.6 : st === 'prone' ? 1.6 : 1e9;
    const dy = clamp(S.pendingYaw, -yawRate * dt, yawRate * dt); S.pendingYaw -= dy; if (yawRate > 1e8) S.pendingYaw = 0;
    S.yaw = wrap(S.yaw + dy);
    const pmin = st === 'prone' ? (S.bipod ? -10 : -25) * DEG : -85 * DEG, pmax = st === 'prone' ? (S.bipod ? 12 : 35) * DEG : 85 * DEG;
    S.pitch = clamp(S.pitch + dpitch, pmin, pmax);
    // weapon inertia: the gun follows the target direction through a critically damped spring; heavy = laggy
    const tYaw = S.yaw + S.dzYaw, tPitch = S.pitch + S.dzPitch;
    const k = (S.bipod ? 900 : 380 / (1 + (wpn.mass || 3) / 4)) * (1 - 0.4 * arm), c = 2 * Math.sqrt(k);
    const ey = wrap(tYaw - S.wYaw), ep = tPitch - S.wPitch;
    S.wYawV += (k * ey - c * S.wYawV) * dt; S.wPitchV += (k * ep - c * S.wPitchV) * dt;
    S.wYaw = wrap(S.wYaw + S.wYawV * dt); S.wPitch += S.wPitchV * dt;
    if (Math.abs(wrap(tYaw - S.wYaw)) > 0.6) { S.wYaw = tYaw; S.wYawV = 0; }   // safety: never more than ~35 deg behind

    // ------------------------------------------------ sway
    const stF = S.stanceT < 1 ? 2.5 : 1;
    let base = SWAY_MOA[st] * MOA * stF * (S.bipod ? 0.25 : S.rested ? 0.55 : 1);
    const cls = wpn.cls || 'rifle';
    base *= cls === 'mg' && !S.bipod ? (st === 'prone' ? 1.4 : 1.9) : cls === 'pistol' ? 1.6 : cls === 'law' ? 1.25 : 1;
    base *= (1 + 1.5 * arm) * (1 + S.fatigue) * (1 + blood) * (1 + 0.5 * (m.shock || 0));
    const ex = S.exertion, hipF = 1 + 1.6 * (1 - S.ads);
    // breathing (vertical figure-8), fades out while the breath is held
    S._bA = lerp(S._bA ?? 1, S.holdBreath ? 0 : 1, Math.min(1, dt * 5));
    const bA = base * 0.9 * (0.4 + 1.6 * S.breathDepth) * (1 + 2.5 * ex) * S._bA * (S.bipod ? 0.3 : 1);
    const bPitch = bA * Math.sin(S.breathPhase), bYaw = bA * 0.35 * Math.sin(2 * S.breathPhase);
    // drift: Ornstein-Uhlenbeck random walk (muscle fatigue, balance), tau 0.6 s
    const sig = base * 0.6 * (1 + 2 * ex) * (S.holdBreath && S.holdT > S.holdMax ? 1 + 2 * (S.holdT - S.holdMax) / S.holdMax : 1);
    const a = Math.exp(-dt / 0.6), sd = sig * Math.sqrt(1 - a * a);
    S.ouY = S.ouY * a + sd * gaussian(rng); S.ouP = S.ouP * a + sd * gaussian(rng);
    // pulse twitch (each heartbeat), physiological / pain tremor (8-10 Hz)
    const pulse = base * 0.18 * (1 + ex) * Math.max(0, Math.sin(S.pulsePhase)) ** 8;
    S.tremPhase += dt * TAU * (8.5 + rng());
    const trem = (pain * 2.5 + (m.tremor || 0) * 3 + (S.holdBreath && S.holdT > S.holdMax ? 1.5 : 0)) * MOA * (1 + arm);
    // moving while aiming: the gait shakes the gun
    const moveS = S.speed * (st === 'prone' ? 30 : 9) * MOA * (S.ads > 0.5 ? 1 : 1.5);
    S.swayPitch = (bPitch + S.ouP + pulse + trem * Math.sin(S.tremPhase) + moveS * Math.sin(S.gaitPhase * 2)) * hipF;
    S.swayYaw = (bYaw + S.ouY + trem * 0.7 * Math.cos(S.tremPhase * 1.13) + moveS * 0.6 * Math.sin(S.gaitPhase)) * hipF;

    // ------------------------------------------------ recoil recovery (spring back toward zero, the shooter's pull)
    const kr = S.bipod ? 260 : 120, cr = 2 * Math.sqrt(kr) * 1.05;
    S.recPitchV += (-kr * S.recPitch - cr * S.recPitchV) * dt; S.recYawV += (-kr * S.recYaw - cr * S.recYawV) * dt;
    S.recPitch += S.recPitchV * dt; S.recYaw += S.recYawV * dt;
    S.shake *= Math.exp(-dt * 12);

    // ------------------------------------------------ outputs
    S.swayPitch *= S.swayScale; S.swayYaw *= S.swayScale;
    S.aimYaw = wrap(S.wYaw + S.swayYaw + S.recYaw);
    S.aimPitch = S.wPitch + S.swayPitch + S.recPitch;
    const st2 = S.stanceT < 1 ? (S.eyeH > 0.9 ? 'crouch' : 'prone') : st;
    const leanD = BODY.lean[st2] * S.lean, roll = BODY.leanRoll[st2] * S.lean;
    // camera: the view, or (ADS) the weapon's sight line; free look on top
    const adsE = S.ads * S.ads * (3 - 2 * S.ads);
    S.camYaw = wrap(lerp(S.yaw, S.aimYaw, adsE) + S.headYaw + S.recYaw * 0.3 * (1 - adsE));
    S.camPitch = lerp(S.pitch, S.aimPitch, adsE) + S.headPitch + S.recPitch * 0.3 * (1 - adsE);
    S.camRoll = -roll + S.shake * (rng() - 0.5) * 0.02;
    const bobK = 1 - 0.7 * adsE;
    S.eye.x = S.pos.x + (Math.cos(S.yaw) * leanD) + Math.cos(S.yaw) * S.bob.x * bobK;
    S.eye.z = S.pos.z + (-Math.sin(S.yaw) * leanD) - Math.sin(S.yaw) * S.bob.x * bobK;
    S.eye.y = S.pos.y + S.eyeH - Math.abs(S.lean) * 0.06 + S.bob.y * bobK;
    S.canFire = S.lower < 0.15 && S.stanceT >= 1 && !S.swimming && !m.unconscious && !(S.raiseT > 0);
    return S.events;
  };

  // recoil from a shot event (weapons.js 'shot': J impulse N s, rise and riseYaw rad/s per N s)
  S.recoil = function (shot) {
    const st = S.stance;
    const k = RECOIL_STANCE[st] * (S.bipod ? 0.35 : S.rested ? 0.7 : 1) * (1 + 0.6 * armI(S.mods)) * (1 + 0.3 * (1 - S.ads)) * (1 + 0.2 * S.fatigue);
    S.recPitchV += shot.J * shot.rise * k * (0.85 + 0.3 * rng());
    S.recYawV += shot.J * shot.riseYaw * k * gaussian(rng);
    // part of the climb is not recovered by the shooter: it moves the view (pull it back down yourself)
    S.pitch += shot.J * shot.rise * k * 0.012 * (S.bipod ? 0.3 : 1);
    S.shake = Math.min(1, S.shake + shot.J * 0.06);
  };
  // place the soldier (spawn, enter / exit vehicles)
  S.place = function (x, y, z, yaw = S.yaw, stance = 'stand') {
    Object.assign(S.pos, { x, y, z }); Object.assign(S.vel, { x: 0, y: 0, z: 0 });
    S.yaw = S.wYaw = S.aimYaw = S.camYaw = yaw; S.pitch = S.wPitch = S.aimPitch = 0; S.wYawV = S.wPitchV = 0;
    S.stance = S.stanceFrom = S.stanceTo = stance; S.stanceT = 1; S.eyeH = BODY.eye[stance]; S.onGround = true; S.bipod = false;
    S.eye.x = x; S.eye.y = y + S.eyeH; S.eye.z = z;
  };
  // the posture the third-person model needs (soldiermodel.js poseFromSoldier)
  S.pose = function (out = {}) {
    out.stance = S.stance; out.stanceFrom = S.stanceFrom; out.stanceTo = S.stanceTo; out.stanceT = S.stanceT; out.eyeH = S.eyeH;
    out.speed = S.speed; out.gait = S.gait; out.gaitPhase = S.gaitPhase; out.lean = S.lean; out.ads = S.ads; out.lower = S.lower;
    out.yaw = S.yaw; out.aimPitch = S.aimPitch; out.aimYaw = wrap(S.aimYaw - S.yaw); out.headYaw = S.headYaw; out.headPitch = S.headPitch;
    const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw), rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw);
    out.moveF = S.vel.x * fx + S.vel.z * fz; out.moveR = S.vel.x * rx + S.vel.z * rz;
    out.bipod = S.bipod; out.limp = Math.max(S.mods.legL || 0, S.mods.legR || 0); out.breath = Math.sin(S.breathPhase) * S.breathDepth;
    out.airborne = !S.onGround; out.swimming = S.swimming;
    return out;
  };
  S.place(S.pos.x, S.pos.y, S.pos.z, S.yaw);
  return S;
}
function gaussian(rng) { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rng()); }
