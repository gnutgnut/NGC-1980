// FOUNDATION: the registry of everything the player can control - the UH-1H, the HORNET, the soldier on foot, ground
// vehicles, and whatever wave 2 adds (C-130, M60A3, M113, M151, M35...). main.js owns one host; every craft registers
// a plain object with the interface below and the host routes input, cameras, HUD, the pause/silence hook, enter /
// exit / seats and the player hooks war.js reads (PL) to whichever craft the player is in.
//
// The full API reference with worked examples is docs/ngc1980/FOUNDATION.md. In short, a craft def is:
//
//   {
//     id: 'boxcar', label: 'TEST CAR', kind: 'air' | 'ground' | 'foot',
//     seats: [{ id: 'driver', label: 'DRIVER', role: 'driver', door: [x, y, z], exit: [x, y, z] }, ...],
//                                         // door / exit in the craft's local frame (x right, y up, -z forward), metres
//     present()            -> bool        // does it exist in the world right now (parked or driven)?
//     frame(out)           -> {x,y,z,yaw} // where it is: the local frame for doors / exits (yaw: forward = (-sin, -cos))
//     enter(seat, from)    -> bool        // the player climbs in (from: 'foot' | 'spawn' | 'swap')
//     canExit()            -> ''|reason   // '' = may get out now, else what to say
//     exit()                              // the player has left (the craft stays parked where it is)
//     setSeat(i)           -> bool        // optional: change seat inside (driver -> gunner -> ...)
//     update(dt, input)                   // while the player is in it
//     idle(dt)                            // optional: every frame while nobody is in it (parked engines, deck carry)
//     render(dt, time, firstPerson)       // optional: every frame (model, effects), whether driven or parked
//     camera(cam, dt, view)               // first-person eye of the current seat (view.first) or chase / orbit
//     firstPerson()        -> bool        // is the camera in the eye (FOV slider, near plane, HUD layout)
//     key(code, e)         -> bool        // keyboard commands while in it; true = used (the host's keys come after)
//     look(dx, dy)                        // optional: captured-mouse movement (pixels) - the soldier's mouse look
//     hud()                -> { line, hint, weap, fuel }  // the numbers line, the hint, weapons line, fuel bar 0..100
//     silence()                           // stop every sound (pause menu, title screen)
//     pl: { alive, landed, inCave, hitR, sight, sources, detect, capTime }   // what war.js sees (see PL below)
//     avatar(Z)                           // copy pos / vel / facing into the player avatar Z (map, tags, camera)
//     hurt(amount, why, at, dir)          // enemy fire / blasts (at: world hit point, dir: round's velocity)
//     bounds(out)          -> { x, z, yaw, hl, hw, y0, y1 } | null   // optional footprint for collisions (when parked)
//     menuNote()           -> string      // optional: the pause menu sub-line
//   }
//
// All functions are optional except id, label, kind, present, update, pl. The host fills in safe defaults.
const NOOP = () => {};
const DEFAULT_PL = { alive: true, landed: false, inCave: false, hitR: 2.6, sight: 0, sources: null, detect: 1, capTime: 0 };

export function createCraftHost({ G, Z, say = NOOP }) {
  const defs = [], byId = new Map();
  const host = {
    defs, active: null, seat: 0,
    // captured mouse movement since the last frame, consumed by the active craft's look()
    mouse: { dx: 0, dy: 0 },
    onSwitch: NOOP,   // (from, to) -> void : main.js hook (cameras, pointer lock, HUD)
  };

  host.register = def => {
    if (!def || !def.id || byId.has(def.id)) throw new Error('craft: bad or duplicate id ' + (def && def.id));
    def.seats ||= [{ id: 'pilot', label: 'PILOT', role: 'driver' }];
    def.kind ||= 'air';
    def.pl ||= {};
    for (const k of ['update', 'idle', 'render', 'camera', 'exit', 'silence', 'avatar', 'hurt', 'look']) if (typeof def[k] !== 'function') def[k] = NOOP;
    if (typeof def.present !== 'function') def.present = () => false;
    if (typeof def.enter !== 'function') def.enter = () => true;
    if (typeof def.canExit !== 'function') def.canExit = () => 'YOU CANNOT GET OUT HERE';
    if (typeof def.key !== 'function') def.key = () => false;
    if (typeof def.firstPerson !== 'function') def.firstPerson = () => false;
    if (typeof def.hud !== 'function') def.hud = () => ({ line: '', hint: '', weap: '', fuel: null });
    defs.push(def); byId.set(def.id, def); return def;
  };
  // ngc/wheeledgame: crafts that come and go (parked town cars, WORLD traffic taken over by the vehicle sim, deliveries)
  host.unregister = def => { if (!def || host.active === def) return false; const i = defs.indexOf(def); if (i >= 0) defs.splice(i, 1); byId.delete(def.id); return true; };
  host.get = id => byId.get(id) || null;
  Object.defineProperty(host, 'cur', { get: () => host.active });

  // hand control to craft `id` (seat index), the previous one is left parked. Returns false if it refused.
  host.control = (id, seat = 0, from = 'swap') => {
    const def = byId.get(id); if (!def) return false;
    const prev = host.active;
    // PERSONNEL: host.gate(def, seat, from) -> '' or why not: the person must be qualified for the seat (an untrained
    // man can't fly the Hornet); on the command board it picks who goes
    const why = host.gate ? host.gate(def, seat, from) : ''; if (why) { say(why, 2.4); return false; }
    if (def.enter(seat, from) === false) { host.gateUndo?.(); return false; }
    if (prev && prev !== def) prev.exit(def);
    host.active = def; host.seat = seat; G.craft = id;
    host.onSwitch(prev, def);
    return true;
  };
  // set the active craft without calling enter/exit (new game, respawn: the caller already placed everything)
  host.setActive = (id, seat = 0) => { const def = byId.get(id); host.active = def; host.seat = seat; G.craft = id; };

  // ------------------------------------------------------------------ seats and doors
  const _f = { x: 0, y: 0, z: 0, yaw: 0 };
  // world position of a point given in the craft's local frame (x right, y up, -z forward)
  host.toWorld = (def, p, out = { x: 0, y: 0, z: 0 }) => {
    const f = def.frame ? def.frame(_f) : null; if (!f) return null;
    const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
    out.x = f.x + p[0] * c + p[2] * s; out.y = f.y + p[1]; out.z = f.z - p[0] * s + p[2] * c; out.yaw = f.yaw;
    return out;
  };
  // the nearest door (any present craft except `skip`) within reach of (x, y, z): { def, seat, d }
  const _d = { x: 0, y: 0, z: 0 };
  host.nearestDoor = (x, y, z, reach = 2.6, skip = null) => {
    let best = null;
    for (const def of defs) {
      if (def === skip || def.kind === 'foot' || !def.present()) continue;
      def.seats.forEach((s, i) => {
        if (s.locked) return;
        for (const p of s.doors || (s.door ? [s.door] : [])) {   // a seat may have several doors (the Huey: either side)
          const w = host.toWorld(def, p, _d); if (!w) return;
          const d = Math.hypot(w.x - x, (w.y - y) * 0.6, w.z - z);
          if (d < (s.reach || reach) && (!best || d < best.d)) best = { def, seat: i, d };
        }
      });
    }
    return best;
  };
  host.seatName = (def, i) => (def.seats[i] && def.seats[i].label) || 'SEAT';
  // change seat inside the current craft (the [ and ] keys)
  host.cycleSeat = dir => {
    const def = host.active; if (!def || def.seats.length < 2 || !def.setSeat) { say('NO OTHER SEAT', 1); return false; }
    const n = def.seats.length; let i = host.seat;
    for (let k = 0; k < n; k++) { i = (i + dir + n) % n; if (!def.seats[i].locked && !(host.gate && host.gate(def, i, 'seat', true)) && def.setSeat(i) !== false) { host.seat = i; host.onSeat?.(def, i); say(`${def.label}  -  ${host.seatName(def, i)}`, 1.2); return true; } }   // (PERSONNEL: a seat he isn't qualified for is skipped)
    return false;
  };

  // ------------------------------------------------------------------ per-frame
  host.update = (dt, input) => {
    const a = host.active;
    if (a) a.update(dt, input);
    for (const def of defs) if (def !== a && def.present()) def.idle(dt);
    if (a) a.avatar(Z);
    host.mouse.dx = host.mouse.dy = 0;
  };
  // after war.update has moved the ships: everything standing / parked on a deck catches up with it now, so the frame
  // is drawn with no lag (a soldier would otherwise trail his deck by one frame of the ship's motion)
  host.afterWar = () => {
    for (const def of defs) if (def.afterWar && def.present()) def.afterWar();
    if (host.active) host.active.avatar(Z);
  };
  host.render = (dt, time) => { for (const def of defs) if (def.render && def.render !== NOOP) def.render(dt, time, def === host.active && def.firstPerson()); };
  host.silence = () => { for (const def of defs) def.silence(); };
  // footprints of everything parked or driven (except `skip`): for walkers and vehicles to bump into
  const _b = [];
  host.bounds = (skip = null) => {
    _b.length = 0;
    for (const def of defs) { if (def === skip || !def.bounds || !def.present()) continue; const b = def.bounds(); if (b) { if (Array.isArray(b)) _b.push(...b); else _b.push(b); } }
    return _b;
  };

  // ------------------------------------------------------------------ PL: the player as war.js sees it
  // pos / vel are the avatar Z (always the controlled craft's centre); the rest asks the active craft.
  //   alive    can be targeted / hurt          landed   on the ground (pad capture counts this)
  //   inCave   in a 2D cave (out of the war)   hitR     radius (m) a round must pass within
  //   sight    fog-of-war sight radius (0 = the war's default for the helicopter)
  //   sources  extra sight patches [{x, z, r}] (the jet's radar)
  //   detect   0..1 how visible: scales enemy detection / engagement ranges (infantry prone ~0.25)
  //   capTime  seconds to take a pad standing on it (0 = the war's default)
  const val = k => { const a = host.active, p = a && a.pl; const v = p ? (typeof p[k] === 'function' ? p[k]() : p[k]) : undefined; return v === undefined ? DEFAULT_PL[k] : v; };
  host.PL = {
    pos: Z.pos, vel: Z.vel,
    get alive() { return !!val('alive'); }, get landed() { return !!val('landed'); }, get inCave() { return !!val('inCave'); },
    get hitR() { return val('hitR'); }, get sight() { return val('sight'); }, get sources() { return val('sources'); },
    get detect() { return val('detect'); }, get capTime() { return val('capTime'); },
    get kind() { return host.active ? host.active.kind : 'air'; }, get craft() { return host.active ? host.active.id : ''; },
  };
  return host;
}
