// NGC-1980 air defence units: ALL gameplay tunables in one table.
//
// These are game-design numbers (cadence, reaction windows, damage), not weapon data. The baseline they keep is the
// old island AA gun in war.js: range 150 m, a flak burst every ~0.7 s (ours) / 1.1-1.6 s (theirs, faster as the war
// goes on), a stream of tracer inside 45 m, 7 hp. What is new: every system has to SEE its target (terrain line of
// sight) and hold it for `lock` seconds before it opens up, its turret turns at a capped rate, and it shows a tell
// (lamp, radar, charge glow, lock tone) the whole time - so a pilot who stays low behind hills or breaks across the
// turret's slew rate gets out alive.
//
// Units:      side  where
//   vads      1     M163-style 6-barrel Vulcan on a tracked hull: command 2 builds these on our islands
//   vadst     1     M167 towed Vulcan (gunner on the mount, loader + spotter): command 2 alternates it with the M163
//   shilka    1     ZSU-23-4-style quad gun with a dish radar: the Soviet contingent, our starting guns
//   zu23      1     ZU-23-2 towed twin 23 mm (two on the mount, two loaders): alternates with the Shilka
//   ciws      1     white-domed close-in gun mount: the ALBATROSS
//   sparrow   1     8-cell box missile launcher: the ALBATROSS
//   talon     2     seized 8x8 truck with twin guns + missiles (RUNAWAY refit): most enemy islands
//   lance     2     RW-5 LANCE laser turret: enemy HQ and fortress islands (one each), IRONHOLD (two)
//
// Fields (all optional per unit):
//   hp, r, h          hit points and hit cylinder (radius, half height) handed to war.js
//   yawRate, pitchRate turret slew limits, rad/s; pitchMin / pitchMax elevation limits, rad
//   scan              how often the radar looks for a new target, s
//   lock              seconds of continuous line of sight on a target before it fires (the reaction window)
//   lockKeep          fraction of a full lock kept the moment sight is lost (then it bleeds away at 2x): pop up
//                     from behind a hill again and it needs (1 - lockKeep) x lock to be back on you
//   tol               aim error allowed when firing, rad
//   gun   { range, near, rate, burst, pause, speed, spread, flakRate, flakJit, flakErr, flakErrPlayer, ramp }
//         near: inside this a tracer stream ('ciws' rounds); beyond it up to range: airburst rounds ('flak')
//         rate: seconds between tracer rounds inside a burst; burst / pause: burst length and gap, s
//         flakRate (+ random 0..flakJit): seconds between airburst rounds; ramp: that shortens by up to `ramp` s, at
//         time / 900 s of war (the old gun's escalation); flakErr(Player): burst scatter, m per 100 m of range
//   msl   { min, range, salvo, gap, reload, speed0, speed, accel, turn, life, prox, dmg, playerDmg, lockExtra }
//         lockExtra: extra lock time before a missile (on top of `lock`) - missiles are the slow, loud threat
//   mag   { rounds, trip, flak }  ready rounds on the gun (headline figures: M163 1,100 ready, M167 500, Shilka 2,000,
//         ZU-23-2 2 x 50-round boxes); an airburst round uses `flak` of them. The crew's loaders (the TALON's TICK) bring
//         `trip` rounds a delivery whenever there is room, so a gun only runs dry under long, heavy fire - and stops
//         until the next box arrives. No `mag`: deck-fed / unlimited (the ship mounts).
//   beam  { range, charge, on, dwell, dps, playerDps, cool, width, full, falloff }
//         charge: glow + aiming line before it fires; dwell: beam must sit on the target this long before it burns;
//         on: max beam time; dps: damage per second to aircraft after the dwell; playerDps: hurtPlayer per second;
//         the beam spreads: full strength out to `full` m, down to `falloff` of it at `range`
export const DEF = {
  vads: {
    name: 'M163 VADS', side: 1, hp: 7, r: 3.0, h: 1.4, yawRate: 1.6, pitchRate: 1.2, pitchMin: -0.09, pitchMax: 1.4,
    scan: 0.3, lock: 0.7, lockKeep: 0.8, tol: 0.08, spin: 1.0,
    gun: { range: 150, near: 55, rate: 0.045, burst: 0.55, pause: 0.6, speed: 150, spread: 0.022, flakRate: 0.7, flakErr: 5 },
    mag: { rounds: 1100, trip: 100, flak: 6 },
  },
  shilka: {
    name: 'ZSU-23-4', side: 1, hp: 7, r: 3.4, h: 1.5, yawRate: 1.3, pitchRate: 1.0, pitchMin: -0.07, pitchMax: 1.4,
    scan: 0.3, lock: 0.7, lockKeep: 0.8, tol: 0.08,
    gun: { range: 150, near: 55, rate: 0.06, burst: 0.7, pause: 0.7, speed: 140, spread: 0.028, flakRate: 0.75, flakErr: 5 },
    mag: { rounds: 2000, trip: 100, flak: 4 },
  },
  ciws: {
    name: 'CIWS', side: 1, hp: 9, r: 2.4, h: 1.6, yawRate: 2.6, pitchRate: 2.2, pitchMin: -0.2, pitchMax: 1.45,
    scan: 0.2, lock: 0.5, lockKeep: 0.9, tol: 0.06, spin: 1.0,
    gun: { range: 95, near: 95, rate: 0.03, burst: 0.7, pause: 1.5, speed: 170, spread: 0.045 },
  },
  sparrow: {
    name: 'SEA SPARROW', side: 1, hp: 9, r: 2.4, h: 1.6, yawRate: 1.1, pitchRate: 0.9, pitchMin: 0.05, pitchMax: 1.1,
    scan: 0.3, lock: 1.2, lockKeep: 0.5, tol: 0.25,
    msl: { min: 45, range: 220, salvo: 2, gap: 0.6, reload: 12, speed0: 22, speed: 95, accel: 120, turn: 2.6, life: 5.5, prox: 6, dmg: 4, playerDmg: 0, lockExtra: 0 },
  },
  talon: {
    name: 'RW TALON (seized 8x8)', side: 2, hp: 7, r: 4.2, h: 1.6, yawRate: 1.0, pitchRate: 0.9, pitchMin: -0.05, pitchMax: 1.3,
    scan: 0.4, lock: 1.3, lockKeep: 0.6, tol: 0.1,
    gun: { range: 150, near: 45, rate: 0.1, burst: 0.4, pause: 2.4, speed: 140, spread: 0.05, flakRate: 1.1, flakJit: 0.6, flakErr: 5, flakErrPlayer: 7, ramp: 0.5 },
    msl: { min: 70, range: 190, salvo: 1, gap: 0, reload: 20, speed0: 18, speed: 70, accel: 60, turn: 1.5, life: 6.5, prox: 4.5, dmg: 5, playerDmg: 0.25, lockExtra: 1.6 },
    mag: { rounds: 400, trip: 60, flak: 4 },
  },
  lance: {
    name: 'RW-5 LANCE', side: 2, hp: 7, r: 2.6, h: 2.2, yawRate: 0.75, pitchRate: 0.65, pitchMin: -0.12, pitchMax: 1.45,
    scan: 0.35, lock: 0.8, lockKeep: 0.4, tol: 0.06,
    beam: { range: 150, charge: 1.8, on: 2.2, dwell: 0.45, dps: 3.2, playerDps: 0.26, cool: 5, width: 2.2, full: 60, falloff: 0.2 },
  },
};
// defence polish: the towed guns. Game numbers: lighter than the tracked mounts (no armour), the same fire control
DEF.vadst = { ...DEF.vads, name: 'M167 VADS (towed)', hp: 6, r: 2.4, h: 1.1, yawRate: 1.7, mag: { rounds: 500, trip: 100, flak: 6 } };
DEF.zu23 = { ...DEF.shilka, name: 'ZU-23-2', hp: 6, r: 2.4, h: 1.1, yawRate: 1.5, pitchRate: 1.2, pitchMin: -0.1, pitchMax: 1.5,
  gun: { ...DEF.shilka.gun, rate: 0.065, burst: 0.6, pause: 0.55, spread: 0.03 }, mag: { rounds: 100, trip: 50, flak: 4 } };
// SEAWORLD: the RUNAWAY ships' mounts (brain.js refitShip). The same units on a deck; a ship's mount is tougher (the
// old ship guns had 9 hp) and the LANCE's beam a little weaker (a moving, rolling platform; four of them on the LEVIATHAN)
DEF.talonm = { ...DEF.talon, name: 'RW TALON (ship mount)', hp: 9, r: 2.4, h: 1.4, mag: null };   // deck-fed
DEF.lancem = { ...DEF.lance, name: 'RW-5 LANCE (ship mount)', hp: 9, beam: { ...DEF.lance.beam, dps: 2.6, playerDps: 0.2 } };
// war-wide knobs
export const DEF_WAR = {
  losStep: 6,          // m between terrain samples on a line-of-sight check
  losClear: 0.6,       // the line must pass this far above the ground
  smokeBlock: 1.0,     // summed smoke opacity along a beam that stops it
  lockToneRange: 260,  // m: a lock on the player sounds the warning tone in the cockpit
  launchFeedEvery: 9,  // s: at most one MISSILE LAUNCH line in the feed this often
};
