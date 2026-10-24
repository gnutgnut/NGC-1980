# MODLOG — Thrust/Zarch experimental (helicopter build)

Own browser game (Three.js r170), no third-party game files. Route: direct source changes (we own the code).
Oracle: tools/snap.mjs headless Chrome (SwiftShader) driving the real game with keyboard + debug bridge
(`?debug&kb&peace`, `window.__G`). Scenes in tools/scenes/: smoke, heli, loop, rescue, perf (+ damage, cockpit).

## 2026-10-10 — damage model + fuel + cockpit
Plan (one commit per stage, each verified with a scene + screenshots):
1. Fuel: burn 2.2 → 0.9 %/s at full collective (hover ≈ 3.5 min), emergency fuel drop 25 → 50 %.
2. Damage model (game/js/damage.js): components with health (main rotor, tail rotor, engine, transmission,
   hydraulics, fuel tank, avionics, skids). Hits from enemy fire / rams / hard landings / tail strikes damage
   parts instead of instant death. Failure effects feed the flight model:
   - tail rotor lost → no anti-torque → torque-reaction spin; cure: lower collective, fly fast (fin), or cut the
     engine and autorotate (no engine torque, no spin);
   - engine damage → power loss / rpm droop; engine fire burns it out (extinguisher puts it out);
   - transmission chip → seizes when critical → rotor rpm decays;
   - hydraulics → heavy, slow controls, no SAS; fuel tank → leak; avionics → gauges fail; skids → softer limits;
   - main rotor destroyed → no lift → fall.
   Repairs: home pad / home intake pad = full repair; field repair via logistics call (L) when landed safely.
3. Cockpit: second gauge row (fuel, eng temp, xmsn, hyd, torque, N1/N2), caution/warning annunciator panel,
   clickable switches (engine, SAS, hyd boost, fire extinguisher, landing light) + keyboard shortcuts.

### Stage 2 notes (damage model) — verified with tools/scenes/damage.json (11 checks, 3/3 runs green)
- Tail rotor lost at hover → ~1.3 rad/s yaw after 2.5 s (death spin). Cutting the engine (I) removes main-rotor
  torque: spin falls to <0.5 rad/s; autorotation + flare lands intact; L → field repair (tail ≥ 60%) + 50% fuel;
  engine back on, lift-off without spin.
- Gotcha 1: touchdown only checked ground under the centre → on slopes the tail and then a blade struck the uphill
  side (ROTOR STRIKE death). Fix: contact = highest ground under the four skid ends.
- Gotcha 2: lifting off a slope scraped the tail → "tail strike". Now only counts with >2 m/s or >8.6° nose-up,
  and 25 cm below ground.
- Gotcha 3: cave "hard landing" branch accepted side-on wall hits at 25 cells/s; now needs |vx| < 6.
- Scripted autopilots must flare like a pilot (target sink = 0.45·AGL); a fixed collective can't autorotate.

### Stage 3 notes (cockpit) — verified with tools/scenes/cockpit.json + screenshots
- Two-row panel: IAS, attitude, altitude, VSI, dual tach (NR yellow / N2 blue: split needles = engine not driving
  the rotor); lower row fuel, torque, EGT (red line 760), XMSN oil psi, HYD psi, clock. Failing avionics drop
  gauges to OFF flags.
- Glare-shield annunciator: 10 lights, amber cautions, flashing red warnings (driven by damage.cautions()).
- Pedestal switch panel: ENGINE, HYD BOOST, SAS, LDG LIGHT toggles + LOGISTICS and FIRE EXT push buttons.
  Click with the crosshair (mouse captured) or the cursor; a switch hit consumes the click (no gunfire).
  Keys: I, U, H, N, L, O. Test clicks via real mousemove+mousedown at the projected switch position.
- Landing light: the terrain shader is unlit, so the light is drawn as an additive pool where the beam meets the ground.
- Gotcha: D.hit() randomises damage ×0.7–1.3, so "destroy the tail rotor" must set hp = 0 directly (tail strike, tests).

## Stage: readability + cave combat pass (2026-10-10)
- Cockpit rebuilt to fit the cabin: windscreen runs glare shield -> roof beam (it used to lean forward and sit in front of
  the panel), A-pillars/centre post on its edges, door glass is a shape that meets the pillar, panel/glare shield inside
  the walls, exterior shell (cab/nose/roof/mast) hidden from inside. Annunciator: 2 rows of 5, full captions.
  Eye pitch -0.22 so both instrument rows show; pedestal lowered so it doesn't hide the lower row.
- HUD: bottom text block hidden in the cockpit, minimap moves top-right; hint sits between the fuel block and the map.
- Reticle: dot + 4 hairlines built in pixels and scaled by distance (fixed screen size), 40 m out so it never sits on the heli.
- Free look toggle T (off = mouse released, view eased to centre and held).
- Cave: hat aims the door gun in 8 directions and auto-fires; else mouse cursor aims (click fires); else nose.
  Base tiers N1..W4 -> tier+1 turrets, range 18, slower fire for light bases, cave hits 0.16. Winch reach 5.5, beam visible.
- Gotcha: a `//` comment inserted mid-line by sed swallowed the rest of the statement (hit boxes lost userData).
- Scenes: caveaim.json (new), cockpit.json (+free look), audit.json (cockpit look-around screenshots).

## Stage: THE ISLAND WAR (2026-10-22) — Carrier Command x Raid on Bungeling Bay
- world.js: archipelago of 17 islands (2 HQs, 3 cave fortresses, fuel/factory/radar outposts) on open sea, BOUND 640.
  Same island list drives JS heights and the terrain. Coarse A* sea-lane grid (20 m cells, 14 m margin) for ships.
- Terrain perf: per-vertex island maths + per-pixel loops over 22 pads cost ~150 ms/frame in SwiftShader. Now a heightmap
  baked at load (one texel per grid vertex, R32F nearest = exact) + a 4 m "decor" texture (nearest pad/shaft index) so
  each pixel shades one pad. Tests run with &res=0.45; dt clamp raised to 0.1 (sims substep) so game time keeps real time.
- fx.js: pooled soft particles (additive 5000 + alpha 6000), fires that burn then smoulder for minutes, chimneys,
  bouncing debris that stays (700, instanced), scorch decals that never fade (450), transient water decals (wakes,
  ripples, oil, shockwaves). Particles fade out within ~size of the camera (fill-rate + looks).
- fog.js: 112² grid, visible (recomputed 4 Hz from sight sources) + explored; one RGBA texture used by the terrain
  shader and a material patch (trees). Enemy units hidden outside sight, buildings until explored, map shows last-seen owner.
- war.js: carriers (A* paths, wakes, CIWS/flak, self-repair, sinking), islands with HQ/production/AA, capture = no
  owner AA alive + hold the pad (heli 6 s, drone 9 s, transport 10 s), cave islands flip on pod theft, enemy recapture
  restocks the cave. Economy: fuel (stores, cap 600) and materiel. Enemy outposts ship output by FREIGHTER to the KRAKEN.
  Enemy commander every 2 s: defend, expand (danger-weighted, backs off 100 s after losing a transport there), fortify,
  raid, guard, supply, battleship (factories 0.08 %/s each + shipyard 0.06 %/s; launches at 100 %, hunts the ALBATROSS).
- Player: door gun, rockets (G/btn 3), bombs (B/btn 5) with a yellow impact ring; commands 1 drone 2 AA 3 heli 4 escort;
  M = command map (click sea = sail, click island = select). Respawn on the carrier deck. heli.js rides moving decks
  (env.surfVel: velocity, yaw rate, centre).
- Balance (aisim.json, idle player): enemy takes ~1 island/min, battleship ~6.5 min. Win: sink KRAKEN or take IRONHOLD.
- Gotchas: bow probe braked a carrier that was turning away from land (only brake when |turn| < 0.6); fogPatch needs a
  newline after the injected GLSL (else "#define" glued to "}"); a cut() that swallowed `const _hud = {}`; tests that
  assumed fixed setInterval ids; peace mode must also silence enemy guns (tests fly near enemy islands).
- Scenes: war.json, war2.json, aisim.json (fast-forwarded AI), ships.json, playwar.json, fx.json.

## 2026-10-22 — HORNET carrier jet (flyable, full cockpit, HOTAS 4 + T-Rudder pedals)
Files: game/js/jetfm.js (flight model, pure), jetmodel.js (exterior), jetcockpit.js (3D cockpit, HUD, displays),
jetplay.js (input, weapons, carrier ops, HUD data, cautions, g tolerance, ejection, cameras), jetdamage.js, hotas.js
(multi-device controls + bind panel), plus hooks in main.js / war.js / audio.js / heli.js.
- World scale: the map is 1.3 km, so the air is 4x sea-level density (sound speed 170 m/s). Forces, g and the
  airspeed indicator (dynamic pressure = equivalent airspeed) are the real Hornet's; true speeds are half, turn radii a
  quarter. Mach is computed honestly against the 170 m/s sound speed, so transonic drag and M~1.05 top speed hold.
- Flight model: 6DOF rigid body, Hornet mass/inertia, lift curve with soft stall + flat-plate blend, drag polar + wave
  drag, linear derivatives that degrade past the stall; twin F404s with spool lag, AB, fuel flow, EGT, nozzles, start.
  FCS (CAS) by dynamic inversion: g command (7.5 g / 3.5 g gear down), roll rate, sideslip + turn coordination,
  AoA limiter ~27°. DIRECT switch hands the surfaces to the stick.
- tools/jetbench.mjs (node, 24 checks, all pass): signs, hands-off trim, damping, 1 g stall 117 KEAS, approach 132 KEAS
  at 8.1° AoA, roll 191°/s, 7.6 g limit, M 0.94 MIL / 1.04 AB, cat end 189 KEAS, trap runout 21 m, brakes hold.
- Hardware (from the Windows HID descriptors): T.Flight Hotas 4 044F:B67C = X Y stick, Z throttle (fwd = -1), Rz twist,
  Slider (rocker?), hat axis 9, 12 buttons; T-Rudder 044F:B679 = X Y Z (published: Z rudder, Y left / X right toe
  brake; UNVERIFIED on this unit, the J panel binds by wiggling). readPad() now never picks the pedals as the stick,
  and the helicopter's pedals read the rudder pedals when bound.
- Gotchas: the stabilator rate limit (40°/s) made the first NDI pitch law bang-bang (10 g overshoot): command model
  + measured flight-path-rate feed-forward fixed it; CAS must stay engaged at low airspeed (it handed full aft stick to
  the surfaces in a zoom); tyre friction needed a deadbeat + slip anchor or braked jets creep; the wire force sign;
  an inline // that swallowed a brace (again); 500 m/s jet rounds and 340 m/s missiles need swept hit / fuse tests at
  low frame rates; hitTest() reuses war.js's _w (don't loop with it); the game starts with the ALBATROSS facing FORGE,
  so the carrier now turns into clear water before a launch; hold-to-eject must use real time, not sim time.
- Scenes (headless, all pass): jet.mjs, jettrap.mjs, jetweapons.mjs, jetsystems.mjs; helicopter scenes still pass.

## 2026-10-22 — infinite procedural world, no limits
- world.js: wild islands outside the archipelago: one per 460 m cell with probability 0.42, placed/sized by an integer
  hash of the cell (same every run), at least 160 m clear of the operating area; islandH() adds them (3x3 cells).
- main.js: the terrain shader samples the baked core heightmap inside the operating area and, outside, a second
  512x512 @ 8 m heightmap streamed around the camera (re-baked island by island when the camera moves 700 m, then
  swapped; bilinear by hand in the vertex shader). Wild-island trees refill on each bake. Fog of war stops at the area.
- No clamps for the helicopter or the jet. Leaving the area: one message + feed line, then a hint with the distance and
  bearing back. Minimap and the jet's AMPCD draw open sea, wild islands and the operating area's dashed outline.
- Scene: infinite.mjs (jet 4 km out over wild islands, physics height on the island, helicopter lands on one).
- Note: damage.json's scripted lift-off is timing-sensitive at low headless fps (flaky under load, passes on rerun).

## 2026-10-22 — real-world terrain past the control zone (replaces the wild islands)
- world.js: gradient-noise world (fixed seed): continents (7 km fBm), lowlands and hills, mountain belts (8 km mask) with
  ridged multifractal ranges (2.4 km) peaking ~1.5 km, forests (fBm mask, gentle slopes, tree line ~360 m). Open sea for
  ~0.5-2 km round the zone. Stats over 40 km: 55% land, 8.5% above 200 m, 3% above 450 m; 0.35 µs per height query.
- terrainworker.js bakes 2 km @ 4 m (+ ~7-9k forest trees on a fixed jittered grid) and 8 km @ 16 m heightmaps from the
  same function; the vertex shader takes the 4 m window where it reaches, else the 16 m one. Wild colours: rock on
  steep faces and above ~200 m, snow caps above ~450 m. Jet view 1.1-2.6 km (far ring 24 m x 220), helicopter 600 m
  outside the zone.
- The zone is the CONTROL ZONE: outlined and labelled on the maps, no messages, no limits anywhere.
- jetweapons.mjs gun test now flies hands-off: the scripted altitude hold moved the gun line tens of metres at 330 m.

## 2026-10-22 — merged experimental (pause menu, para-drop dropship, Tomcat escorts) into main
- Conflicts were all "both sides added here": imports, keydown (controls panel > pause menu > jet keys > H autopilot /
  SAS), camera branches (jet, then dropship), cockpit/near-plane/reticle conditions (helicopter cockpit only when
  neither the jet nor the dropship view is up), the debug bridge.
- The pause menu knows about the jet: no logistics in the jet; RESPAWN becomes BACK TO THE ALBATROSS (writes the Hornet
  off, no life lost); the jet's sounds stop while paused; showEnd() stows the jet.
- war.js projectiles now integrate gravity exactly (p += v dt + ½ g dt²) so bombs fall the same at any frame rate; the
  CCIP predictor does the same: pipper vs impact 0.2 m (was ~5 m from frame-rate integration error).
- All scenes pass except damage.json's scripted lift-off, which is flaky on experimental as well (1 of 2 runs there).

## 2026-10-22 — HORNET terrain warnings work with the real-world terrain
- The old PULL UP looked only straight down (height over sink rate), so flying level into a mountainside was silent.
  Now a look-ahead check (10 Hz) flies the escape the pilot would fly: a reaction delay, then a wings-level pull (4 g,
  or what the wing gives at this speed; 3 g gear down) up to a 45° climb, trading speed for height, over the real
  terrain/sea/deck heights. Fails with 1 s reaction: PULL UP (break-X, "Pull up, pull up"). Fails with 3 s reaction
  against ground rising ahead: TERRAIN (HUD text, "Terrain, terrain"). Clearance shrinks when already low so level
  flight low over flat ground stays quiet; gear down counts only ground above you (not the deck you're landing on).
  The sink-rate PULL UP and ALTITUDE calls are unchanged.
- tools/scenes/jetterrain.mjs: hands off at a 980 m peak 250 m below its top: TERRAIN 7.4 s and PULL UP 4.7 s before
  impact; pulling on the PULL UP clears it; 11 s level at ~25 m over open sea: no warnings. jettrap/jet/infinite pass;
  jetsystems passes (its G-LOC timing is flaky at headless ~10 fps).
## Stage: procedural caves (2026-10-22)
- game/js/level.js: `buildLevel(tier, seed, { home })` generates each base's cave, seeded by the base name (so the
  same island always has the same cave). 64 wide; height 44 (home), 56/60/64/68 for tiers 1-4. The shaft stays at
  x 29..35 (CAVE_OX 32.5) and drops 16-21 cells straight onto a flat ledge in the entry chamber, like the old drop.
- Recipe: 3+tier chambers -> tunnel tree (higher tiers chain more, so routes are longer; low tiers may get a shortcut
  loop) of midpoint-displaced polylines swept with a disk (twistier with tier) -> flat floor slab per chamber ->
  boundary noise + 4 rounds of cellular-automata smoothing with a guaranteed-open core -> fill stray pockets.
- Roles from the real flying distance (navMap: a 6-cell disk flooded from the shaft mouth, 8-connected): pod in the
  furthest chamber, pad in the deepest of the rest, tanks in the next two. Any target unreachable -> next seed
  (about 1.3 attempts on average). Turrets (tier+1) on rock seats facing open air, away from the drop and the entry,
  favouring the pod and tank chambers.
- main.js buildCaves: one buildCaveMesh per base (no shared proto); all five caves build in ~70 ms (PROF.caves).
- Gotchas: a tunnel arriving from below cut through the floor slab and left a 4-cell squeeze -> tunnels to a chamber
  below leave from a side port; a short shaft let dropping helicopters crash on a lumpy chamber bottom (caveaim, loop)
  -> long straight drop onto a flat ledge.
- Tests: tools/cavebench.mjs (pure node: ASCII maps, seed sweep, connectivity/width/floors/turret seats/determinism),
  tools/scenes/caves.mjs (enters all five caves, parks by the pod and on the pad, winches the pod).

## 2026-10-22 — UH-1H "Huey" (flight model, cockpit, exterior, sound, systems)
Files: game/js/hueyfm.js (flight model, pure), hueymodel.js (exterior), hueycockpit.js (3D cockpit), heli.js (now the
glue: systems, cautions, HOTAS / pedals via hotas.js CTL, stability assist), audio.js (sfx.huey), main.js (heli parts
only), tools/hueybench.mjs + hueypilot.mjs (node bench), scenes hueystart / hueyhover / hueyauto / hueycockpit / hueymodel.
Sources (reused from the MC-Huey project's notes): Heffley NASA CR-3144 (trims, inertias, derivatives), Talbot NASA
TM-73,254 (fuselage, stab bar, tail rotor), DCS UH-1H manual (limits, procedures), TM 55-1520-210-10 charts (autorotation).
- World scale: real air and real gravity (9.81) for the Huey only - a helicopter fits the 1.3 km map at real speeds, and
  the validated numbers are the in-game numbers. Real size too: 48 ft rotor, ~17.4 m long (the jet is real size as well).
- Model: 2-blade teetering rotor (no hub moment: control = thrust tilt, so low g = no control), blade-element thrust with
  Glauert inflow + first-order dynamic inflow, Johnson's empirical vortex-ring curve, Cheeseman-Bennett ground effect,
  flapback / coning / transverse-flow flapping (CCW rotor: right roll in ETL), Bell stabilizer bar (gyro, 0.16 mixing,
  3.3 s washout - Talbot), retreating blade stall and tip Mach drag, mast-bump stop. Tail rotor = fan (momentum) + part
  of Talbot's T4 damping. T53: N1 lag/accel limit, free-turbine torque (2 - N2), PI governor with the droop compensator
  and conditional integration, EMER, starter / light-off / hung start, EGT. Freewheel between engine and rotor.
  Talbot fuselage, synchronized elevator (DCS/Talbot table), cambered fin, downwash on fuselage and stab. Skids: 6 spring
  contacts, deadbeat skid friction on the effective mass (rotation included) relative to moving decks.
- Bench (node tools/hueybench.mjs, 41 checks, all pass; 3629 kg / 8000 lb, SL) vs published:
  | item | model | published |
  |---|---|---|
  | hover OGE torque | 36.5 psi (73%) | 32-40 psi (DCS), est 38.4 |
  | hover collective / pitch / roll | 15.3° root / +4.2° / -1.1° (left skid low) | 14.5° / +4.0° / -1.1° (H) CONFIRMED |
  | hover pedal / tail rotor pitch | 22% left / 7.2° | 1/4-1/3 left (DCS), 6.4° (H) |
  | trims 0-120 kt (coll / pitch / tail) | max err 0.8° / 1.5° / 1.0° | Heffley cases 122-128 |
  | power bucket | min 19.4 psi at 60 kt | Vy ~55-60 kt (TM) |
  | IGE (1 m) vs OGE torque | -10% | ~10-20% (INFERRED) |
  | climb at 50 psi, 60 kt | 11.6 m/s | 12.4 m/s (H, "max power") |
  | retreating blade stall onset / reaches VNE | 132 kt / 128 kt at < 54 psi | ~120-130 kt (DCS), 124 kt red line |
  | autorotation 70 kt, NR 100% | 9.8 m/s (1925 fpm), +4.1°, right pedal | ~8.6 m/s TM, +3.1° H, tail ~0° |
  | full-down rpm at 70 kt | 334 rpm | 320-340 (DCS) |
  | engine failure at 90 kt, 2 s | 272 rpm | decays toward ~280 (DCS) |
  | collective +12% droop | 4.2 rpm | 3-5 rpm (DCS) |
  | yaw damping Nr hover | -0.70 /s | -0.71 (H) ; Lp -1.08 vs -0.57, Mq -0.29 vs -0.19 (too damped, bar) |
  | VRS: -10% collective from OGE hover | settles to ~3000 fpm | runs to ~2000 fpm in 1-2 s (DCS) |
  | tail rotor lost: hover / 30 kt / 100 kt power reduced | spins 117°/s / spins / held at 12° sideslip | -10 manual procedures |
  CONFIRMED = from the source; INFERRED (tuned, stated in hueyfm.js): CD0 0.0072, hub 0.12 m ahead of the CG, stall
  angle, fin camber, Talbot N1 cut to 5.5 (with 13.95 the bare airframe is directionally unstable and a tail rotor loss
  is never flyable), stab area (Heffley's 2.03 m2 not Talbot's 1.52), tail solidity (Heffley chord), idle gas power.
- Systems (heli.js): battery / generator / inverter (DC volts, AC instruments), main fuel, governor AUTO/EMER, hydraulic
  control, force trim (keyboard stick stays put), low rpm audio, starter, master caution; the 20 real UH-1H caution
  captions + RPM and FIRE warning lights driven by the damage model. Spawn hot at flight idle with an automatic
  throttle roll-on; I = one-key start (~10 s) / fuel cut; ?cold = cold and dark.
- Input: CTL (hotas.js) stick = cyclic, throttle lever = collective (whichever moved last of lever / keys), rudder
  pedals or twist = anti-torque, buttons = door gun / rockets / bombs / winch, hat = door gun. The old heli calibration
  is retired: J opens the CTL controls panel. Stability assist (H, default on for keyboard): attitude command + hover
  drift hold + yaw-rate command, the flight model untouched; a stick switches it off unless you ask for it.
- Fuel: the game tank follows the T53 fuel flow x50 (a tank = ~3 min hover, ~5 min cruise).
- Cave: same rotor and engine in axial flight (H.axial) -> thrust / weight; the model is drawn at 0.36 to fit shipPts.
- Gotchas: the skid friction limit-cycled sideways (the deadbeat gain ignored the roll lever arm of a contact 1.84 m
  under the CG) - use the effective mass at the point; 0/0 when a contact carries no load (NaN everywhere); governor
  wind-up on the throttle roll-on (108% NR) - conditional integration + N2-rate term; idle power drove the rotor so a
  practice autorotation never split the needles; the assist pre-set the wrong lift-off trim (forward/right instead of
  aft/LEFT) and drifted the big rotor into the carrier's island (rotor strike) - spawn moved to the aft H spot;
  scripted test pilots must hold rpm with the collective and stay out of the H-V avoid area (old scenes cut the engine
  at 150 ft in a hover: not survivable in a real Huey); a scripted height hold that pulls collective with drooping
  rpm over-pitches the rotor (a real Huey trait - the test now backs off below 95% NR).
- Scenes updated for the real aircraft: rescue / damage (failures in a low hover over the flat apron), loop (cave hover
  collective 0.385), dive (was already broken on main: pre-archipelago coordinates).

## 2026-10-22 — cockpit FOV slider
- Pause menu (Esc / P): COCKPIT FOV, 40-100° vertical (default 70; was 62 in the helicopter, 74 in the jet), drag or
  LEFT / RIGHT, stored in localStorage (tz_ckfov). Applies to the Huey cockpit, the Hornet cockpit (zoom = 0.4x of it)
  and the dropship flight deck; chase cameras and the cave side view keep their own. The jet HUD is a physical
  combiner in the cockpit model, so it stays conformal at any FOV. Scene: tools/scenes/fov.mjs.

## 2026-10-23 — Huey sits on the flying SKY CARRIER deck (merge fix)
- Root cause: the Huey's skid contact moved with the deck horizontally (surfVel vx/vz + yaw) but not vertically.
  `war.surfVel` had no vy, and groundY is sampled once per frame before war.update moves the ship, so inside the
  Huey's substeps a climbing deck stood still and then jumped up by vy*dt: the skids hopped (contacts 6/0/6...),
  `H.landed` flickered, Tab could not take the helm. Second merge bug: the helm read the Huey's assisted stick, so
  the stability assist turned W into a pitch hold and the telegraph went astern; it now reads `ctl.raw`.
- Fix: `war.surfVel` returns vy (skyFall keeps u.v.y = S.vy); hueyfm / jetfm `surfaceVel` carry vy into the contact
  relative velocity, and `groundAt` lifts a moving deck by vy * (time into the frame step) for skids, tail, nose
  (jet: gear and hull); the jet's catapult keeps the deck's vy; spawnSpot uses DECK + c.p.y like deckY.
- Checked: sky 8/8 (twice); a scratch scene climbing + turning + ahead, then descending: Huey stays at the same deck
  spot and heading (±0.2 m, ±0.01 rad), lifts off, and the climbing deck catches it in a hover for a clean landing.
  hueyhover, hueystart, hueyauto, rescue, smoke, loop, jettrap green; hueybench 41/41.
## 2026-10-23 — NGC-1980 MEDICAL + INVENTORY (wave 1, branch ngc/medinv)
Pure modules in `game/js/units/infantry/` (no DOM, no THREE, node-testable) + HTML overlay UIs + a sandbox.
- `items.js`: the item database (about 90 items): 1980 USMC kit (M16A1, M16A1/M203, M60, M1911A1, M72A2, magazines,
  M193 bandoliers, M67, M18 smoke, claymore, LC-2 belt and ALICE pouches, M69 vest, M1 helmet, ALICE packs, Unit One
  bag, e-tool, P-38), 1980 medicine (field / battle dressing, cravat, strap-and-buckle tourniquet, wire ladder splint,
  morphine syrette, APC, Lactated Ringer's IV, ammonia inhalant, 14G catheter), rations (MCI "C-rats", LRP), seized
  modern loot (M4A1 RW refit, PMAGs, M855A1, plate carrier, ECH, CAT, QuikClot, SAM, Hyfin, fentanyl lozenge, IFAK,
  2030s MRE) and RUNAWAY items (needle carbine, cells, carapace, MENDER nanite injector, sensor core). Crates and caches.
  Decision: the MRE was adopted in 1975 but reached troops in 1983, so in 1980 the Marines eat C-rats; the MRE is loot.
- `medical.js`: 7 regions with Tarkov HP (35/85/70/60/65) and blacked-out limbs (damage spills x0.7, stomach x1.5);
  zones (cranium/face/neck, chest, abdomen/pelvis, upper arm/forearm/hand, thigh/shin/foot) decide vessels, bones and
  armour coverage. Blood 70 ml/kg; bleeds light/heavy/arterial with flow at normal pressure, scaled by MAP (they slow in
  shock), clotting (light ~4 min, heavy slowly, arterial not), control class tq/junctional/internal; ATLS classes I-IV
  drive HR, BP, RR, mental state, consciousness (cerebral perfusion), vision, tremor and stamina. Haematocrit and
  crystalloid (3:1 rule; IV pressure makes an uncontrolled bleed bleed faster), transcapillary refill, pneumothorax
  (open / sealed / tension / decompressed / vented), fractures, pain + adrenaline, morphine PK (overdose worse in shock),
  hydration and energy (bite after hours), tourniquet ischaemia (2 h safe, limb lost at 6 h), RW nanites.
- DAMAGE AND ARMOUR ARE GAME-LEVEL (coordinator instruction, mid-task): rounds carry Tarkov-style dmg / pen / bleed,
  armour has classes 1-6 (M69 and M1 = 2, seized soft armour 3, ECH 4, ceramic plates 5, RUNAWAY lattice 6) with
  coverage per zone and face, durability and blunt damage; fragments are a simple falloff table. No real terminal
  ballistics are modelled or researched; the medical side keeps its sourced depth. Bench section 4 checks feel only.
- Treatments (times self / buddy): dressing 40/25 s (stops light, heavy x0.3, arterial x0.6, wrapper seals a sucking
  chest wound), tourniquets roll success per application (CAT 97% leg, strap-and-buckle 30% leg / 85% arm, cravat
  windlass 60% leg; +8% buddy), TIGHTEN re-rolls a windlass, a second TQ above the first; QuikClot (3 min pressure)
  packs junctional wounds; splint / sling; morphine (absorption compressed ~10x for play, documented); IV is
  CORPSMAN ONLY (decision); wound care with the Unit One bag (corpsman) restores a ruined limb to 50%; the inhalant
  wakes a knocked-out man, not a shocked one; MENDER heals everything (a second dose within 10 min: seizure).
- `inventory.js`: nested grids and named slots, rotation, stacks (split / merge), magazines with LIFO round segments
  (tracers on top feed first), loading from loose rounds (0.9 s/rd) or stripper clips (0.3 s/rd), reload swaps the
  fullest magazine in and the empty back where it came from, quick slots, search (items revealed one by one),
  encumbrance from load / body mass + the Pandolf load-carriage equation, loadouts (rifleman, grenadier, mg,
  corpsman, RW trooper body), loot tables, serialise / relink.
- `invui.js` / `medui.js`: overlays in the game's style. The health screen draws the figure facing you (his right on
  your left), wounds, tourniquet bands, splints, an M on the forehead after morphine. Also `createMedHud` (HUD strip)
  and `createVisionFX` (vignette + canvas grayscale / blur + blackout + nanite tint).
- Sandbox `game/dev/medinv.html` (?debug -> window.__MI, &manual stops real-time stepping, &seed=N).
- Bench `tools/medinvbench.mjs`: 108 checks pass. Femoral artery untreated: class III 3:15, unconscious 5:34, dead
  6:21 (lit. 3-5 min, INFERRED); carotid 2:02 / 3:56; brachial 6:33 / 12:55; heavy venous class III 17:14 and survives;
  light ooze clots; ATLS HR/SBP/RR bands per class (CONFIRMED). Femoral bleed + self-aid at 0:15, survive 30 min:
  CAT 98%, strap 29%, two straps (buddy) 62%, cravat 59%, cravat + tighten 87%. QuikClot on a groin bleed 91%.
  Ringer's: 403 of 1000 ml left after an hour. Sealed sucking chest wound -> dead of tension at 20:22; decompressed
  survives; vented seal no tension. Loads incl. 3.6 kg clothing: rifleman 29.8 kg (fighting 20.5), grenadier 28.7,
  corpsman 30.6, M60 gunner 41.3 (FM 21-18: 22 kg fighting / 33 kg approach). Pandolf 75+30 kg at 1.34 m/s: 429 W.
- Scenes: `tools/scenes/medinv.mjs` (10 expects) and `medinv_ui.mjs` (11 expects) drive the real UI with the mouse.
- Gotchas: `pickW(obj, rng)` got the function, not a number (every hit landed on the cranium); the Unit One bag had
  cat 'pack' so the pack main grid (deny pack) refused it and the loadout silently dropped it - loadouts now throw;
  `dblclick` never fires when the DOM re-renders between the clicks (search ticking) - double-click is detected by
  item uid in pointerdown; an ECG canvas inside innerHTML is recreated every refresh - it is now re-attached;
  3-digit hex + alpha ('#4f6' + '18') is not a colour; a canvas arc after rect() needs a moveTo.

### Interfaces for wave 2
- INFANTRY (weapons) -> medical: `M.hit(hitInfo, I.armour(inv))`, hitInfo = { part | zone (+ side), round (ROUNDS
  id) + velocity (m/s at impact) or dmg + pen directly, dir (travel direction in the victim's body frame: x right, y up,
  z forward), kind 'bullet' | 'fragment' | 'blunt', source }. Returns { region, zone, face, penetrated, layers[{ cls,
  pPen, stopped }], hp, bleed, fracture, ptx, concussion } for hit markers and the feed. Grenades:
  `fragmentHits(FRAGS id, distM, rng, { prone })` -> hit-infos. Falls: `M.fall(impactSpeed, { plf })`.
  The INFANTRY branch's `ballistics.js makeHitInfo()` object is accepted as is (checked in the bench): its `dmg` is
  read as a scale, `part: 'neck'` becomes head/neck, and its world `dir` array is turned into the body frame when
  the caller adds `victimYaw` (three.js yaw, facing -z at 0). Its `explosionInfo()` keys M433 / M72 exist in FRAGS.
- Weapons <-> inventory: magazines are items. `I.weaponMag(w)`, `I.magPop(m)` -> round id (feed), `I.magCount`,
  `I.reload(inv, weapon)` -> { mag, old, dropped }, `I.countRounds(inv, cal)`, `ROUNDS[id]` (cal, v0, cartG, dmg,
  pen, bleed, tracer); weapon defs carry `weapon: { cal, rpm, modes, barrelIn, vMul, single }`; the M203 slot is `gl`.
- Soldier sim (FOUNDATION / INFANTRY): call `M.update(dt, { exertion 0..1, moving })` every frame and read
  `M.mods()`: speedMul, sprint, jump, crawlOnly, limp, aimSway (x), tremor (rad), reloadMul, adsTimeMul, weaponUse
  ('both' | 'one' | 'none'), staminaRegenMul, staminaMaxMul, vision { tunnel, grey, blur, blackout, tint }, hearing,
  breathing, heartRate, dead, unconscious. Load: `I.encumbrance(I.totalWeight(inv))` or `I.pandolfWatts(...)`.
  Events from `M.update` (bleed, fracture, unconscious, death, treated ...) feed the HUD and sound.
- UI: `createInvUI({ inv, med, parent, tabs: ['GEAR','HEALTH'], onTab, onUse?, onDrop?(item to the ground) })`,
  `.open(loot?)` with a crate (`I.fillCrate`) or a dead soldier's inventory root; `createMedUI({ med, inv, parent,
  by: () => ({ self, skill }) })`; `createMedHud(hudEl, M)`; `createVisionFX(hudEl, canvas)`. Both overlays close on
  Esc and stop key propagation while open; FOUNDATION should bind Tab / H and release pointer lock.
- Buddy aid: `patient.startTreatment({ item, region, by: { self: false, skill: medic.skill } })`; `patient.action`
  is the progress (cancel when they move more than `BUDDY.treatRangeM` apart); `BUDDY.dragSpeed(medicMods,
  casualtyKg, medicLoadKg)`, `carrySpeed`, `staminaDrainMul`.
- Untested: in-game integration (no on-foot mode yet), gamepad on real hardware (only the button mapping is wired),
  touch input, the UIs below 1280x720, save / load across sessions.
## 2026-10-23 — NAVAL: ALBATROSS, KRAKEN, LEVIATHAN, container ship, ships that move with the sea
Files: game/js/units/naval/ (albatross.js, kraken.js, leviathan.js, containership.js, deckcrew.js, mounts.js,
navalfx.js, navkit.js, seamotion.js), game/dev/ships.html (+ ships-dev.js), tools/navalbench.mjs,
tools/scenes/naval.mjs, tools/scenes/shipsdev.mjs. ships.js keeps buildCarrier / buildBattleship / buildFreighter and
CARRIER / BSHIP / FREIGHTER as thin wrappers (the old builders are gone).
- ALBATROSS (1980, Midway / Forrestal style, haze grey, hull number 44): flared hull with an enclosed hurricane bow,
  black boot-top over red anti-fouling, waterline grime, hangar-deck openings under three deck-edge elevators (roller
  doors part up, hangar lights), catwalks and safety nets, gun sponsons. Island: flag bridge, navigation bridge (the
  helm.js bridge room sits inside it unchanged), pri-fly overhanging the deck, raked funnel with black uptakes and
  boiler smoke, tripod mast with SPS-49 (rotating curved reflector), SPS-48 planar array (rotating), SPN-35 radome,
  TACAN, ESM domes, yardarms, life-raft racks, hull number with shadow, rust weeping from the scuppers. Deck: textured
  (non-skid patches, padeye grid, tyre rubber in the landing area, oil stains, catapult soot), landing-area lines on
  x = -2.5, four wires (cross-deck pendants on supports) at the DECKOPS positions, catapult track + shuttle at the
  launch bar of a spotted jet, a JBD that rises behind a jet on the cat, LSO platform with its team, Fresnel lens
  (meatball + datums), deck-edge / centreline / drop lights. Lived in: 31 deck crew in 1980 jersey colours (idle,
  walk, signal, kneel at wheels, LSO, talk, seated driver), a tractor lapping the fantail, MD-3A tractors, Tilly,
  a fuel bowser, huffers, fire bottles, tow bars, two parked Hornets (baked from buildJetMesh, instanced) and two
  parked Tomcats at real size with oversweep and added gear, chocks and chains. Crew clear out from under a helicopter
  or jet coming down near them (war.js tickParts passes an avoid() in the ship frame).
- KRAKEN (seized 2030s Ford-class): angled-deck sponson and starboard elevator bulges (a deck polygon), island far aft
  with flat radar arrays, no funnel, four flush EMALS tracks, three AAG wires. RUNAWAY refit: sensor pods, cyan IFF
  strip round the whole deck edge, glyphs over the old "82" and the painted-out stern name, a crystal sensor spire,
  glowing conduits across the deck, autonomous deck tugs, cargo pallets, nine parked RW ducted-fan flying-wing drones
  (instanced, glowing seams), heavier rust (months unmaintained). Mounts: 2 RAM (seized), 2 RUNAWAY lasers.
  dims.TOWER_Z = 22 (its own; the ALBATROSS keeps 6).
- LEVIATHAN (RW-9, replaces the battleship): 96 m wave-piercing tumblehome hull, ceramic upper works on dark
  composite, cyan seams, asymmetric (sensor blade to starboard with flat arrays, a port-side sensor fin, power spine
  with heat-sink fins off the centreline). Three railgun turrets (twin rails, glowing bore) that train and elevate to
  the shot, kick back and flare cyan when they fire (war.js updateBattleship); four point-defence lasers whose beam
  shows when they fire (war.js gunFire -> userData.fireBeam). Game-level visuals and behaviour only.
- Container ship (replaces the freighter): Yara Birkeland-class autonomous electric feeder at real size (80 x 15 m):
  deckhouse right forward with its windows plated over in ceramic, sensor mast with pods, no funnel, battery vents
  and azimuth-pod hatches aft, 8 bays x 5 rows of 20 ft boxes from a fixed stow plan (one InstancedMesh, colour per
  box), a few boxes swapped for glowing RUNAWAY cargo pods, lashing bridges, the name painted out, a forecastle laser.
  FREIGHTER dims are now { L: 80, W: 15, DECK: 4 } (was 46 x 10 x 3): a bigger target.
- Ship motion (seamotion.js, pure, node-tested): Bretschneider sea for the NATO sea state (Hs, Tp), 14 components,
  cos^2 spread; each excites heave / pitch / roll through waterplane-averaged elevation and slope (sinc and
  3(sin x - x cos x)/x^3 over an effective 0.7 L x 0.8 B waterplane, Smith depth attenuation), a damped oscillator per
  DOF at the ENCOUNTER frequency, analytic steady state with integrated phases (stable at any frame rate); heel
  outward in turns (tan phi = V r / g (KG - T/2) / GM) and a little trim with speed. Real-ship numbers per hull
  (Midway, Ford, Yara Birkeland: CONFIRMED dimensions; natural periods and damping INFERRED); heave scaled to the
  game hull (the carriers are 0.44 / 0.38 scale), angles not. Sea state: ?sea=0..7 (default 4 MODERATE), war.setSea(n).
- tools/navalbench.mjs (22 checks, all pass): WMO / NATO Hs ranges, Hs of the discretised sea, ALBATROSS head-sea
  pitch SA SS3 0.09° / SS4 0.39° / SS5 0.94° / SS6 1.67°, heave SS5 0.29 m, ramp vertical velocity SS5 1.8 m/s,
  beam-sea roll 0.9°, roll damping grows with speed, encounter period head < following, the Ford pitches less than
  the Midway, the 96 m monitor pitches 3.9° and the 80 m feeder rolls 4.8° in SS5, steady turn heel 4.7° at 30 kn /
  1.5°/s, deck-height maths vs the YXZ rotation matrix. The bands are INFERRED from published CV seakeeping summaries;
  the NATO mean Hs / modal periods per state are as recalled (Bales 1983 / STANAG 4194), UNVERIFIED offline.
- deckY includes the motion: war.js deckY uses each builder's localDeck(lx, lz) (deck + superstructure in the ship
  frame) through shipPointY(heave, pitch, roll) - the same attitude the mesh gets (placeShip). surfVel also returns
  vy (the deck's vertical velocity), W.deckAt(u, x, z) gives the deck plane; jetfm's catapult and wire checks use it
  (via jetplay's carrier().deckAt), main.js spawnSpot puts the helicopter on the moving deck. The sky carrier's tilt
  goes into the same attitude.
- Effects (navalfx.js): a per-ship foam ribbon mesh following the real track: the churned centre wake from the stern
  and the two Kelvin arms (points the bow passed, pushed out at 19.47°), fading over ~29 s; bow spray at speed and in
  bursts when the stem plunges; stern boil; boiler smoke from the ALBATROSS funnel (none for the nuclear KRAKEN or
  the electric feeder). Replaces the old fx.wake decals for ships at sea.
- Mounts API: parts.mounts = [{ kind: 'ciws' | 'sam' | 'ram' | 'laser' | 'railgun', pos: Vector3 (ship frame),
  dir: Vector3 (outward), node: Object3D (the mount; its userData.yaw / pitch groups are what war.js turns),
  gun: index into parts.guns (absent for the railgun turrets), arc: [yawMin, yawMax] (ALBATROSS only) }]. To fit a
  full model, empty node's children and rebuild under userData.yaw / pitch, or swap parts.guns[i].
- Gotchas: Kit.loft winding was inside out (hulls looked right from one side: you saw the far side's inner faces);
  glow kits need the same push() as the hull kit (the mast lights floated off the island); a headless test camera
  far from the helicopter leaves the sky dome and terrain window behind (naval.mjs parks the helicopter above it).
## 2026-10-23 — NGC-1980 air defence units (ngc/defence-v2)
Files: game/js/units/defence/ (tune.js tunables, kit.js modelling + bake, models.js, brain.js behaviour, sound.js),
game/dev/defence.html + defence-sandbox.js, tools/scenes/defence.mjs, defencewar.mjs, defbalance.mjs. war.js: small
commented `DEFENCE hook` lines only (import, createDefence, addStruct model + attach, starting-garrison flag,
makeShip carrier refit + attach, updateGuns update, W.update tick, W.reset reset). ships.js and main.js untouched.
- Units (game units, game-design numbers; no real weapon performance data): M163 VADS (command 2 on our islands),
  ZSU-23-4 (our starting guns: the Soviet contingent), ALBATROSS close-in gun (white dome) and 8-cell box launcher,
  RW TALON seized 8x8 gun/missile truck (most enemy islands; RUNAWAY refit: ceramic sensor pod on the cab, cyan IFF
  strips, machine stencil over a scraped number, old camo patches), RW-5 LANCE laser (enemy hq + fortress islands,
  two on IRONHOLD). Real-world sizes (M113 hull 4.86 x 2.69 m, Shilka 6.5 m, the truck 9.6 m).
- Models: primitives in a hierarchy, then baked (kit.js) into ONE vertex-coloured flat-shaded Lambert mesh per
  moving part (hull / turret / cradle / barrels / radar). The bake weathers: per-face jitter, mud low down, chips,
  rust streaks. Team colour stays a separate material (air-recognition panels), as war.js recolours by identity.
  4-5k tris for the vehicles, 1-1.5k for the mounts and the LANCE; 9-36 draw calls each.
- Behaviour (brain.js): search (radar spins) -> track (turret slews at a capped rate; with terrain line of sight a
  lock builds over `lock` s; losing sight keeps `lockKeep` of it, then it bleeds away) -> fire. Guns lead with a
  linear prediction and fire tracer bursts up close, airbursts (the old 'flak' round) further out, through war.js's
  own projectiles (so all hit rules and player damage stay war.js's). Missiles are the module's own projectiles:
  visible, steer at a capped turn rate, guided only while the launcher still sees the target, proximity fuse.
  LANCE: charge (seams brighten, aiming line, rising hum) -> beam along the barrel (so a target crossing faster than
  the turret slews slides out of it) -> burns only after a dwell -> spreads with range -> stopped by terrain and by
  smoke (it sums the opacity of fx.mix puffs along the ray) -> cools (fins glow red, steam).
- Tells: lamp blinks faster as the lock builds, steady when locked; rotary barrels spin up (with a whine) before
  firing; Shilka's dish stops and points; cockpit warning for a lock on the player (beeps -> steady warble -> fast
  high warble with a missile in the air) and a MISSILE LAUNCH feed line. Sounds synthesised (sound.js): bursts are
  noise chopped at the gun's rate, single heavy rounds, motor whine, launch whoosh, the LANCE voice, steam vent.
- Balance (scenes/defbalance.mjs; sandbox units 'legacy1'/'legacy2' run the old war.js gunFire rules). Open sky,
  no hills (the player's worst case), hurtPlayer per minute on a circling stand-in, orbits close / mid / far:
  | unit | close | mid | far |
  |---|---|---|---|
  | old enemy gun | 5.45 | 2.58 | 0.59 |
  | TALON | 6.07 | 1.33 | 0.75 |
  | LANCE | 2.45 | 1.67 | 0.87 |
  Our side, kills/min of hp-12 stand-ins: old island gun 3.5, VADS 3.0, Shilka 2.8; the ALBATROSS's four mounts
  together ~1.2x its old four (CIWS 6.7, launcher 2.0 each). Checks: enemy within 1.25x close / mid, 2x far (range
  used to be nearly free; the missile and LANCE make it dangerous on purpose - that is what the hills are for).
- Gotchas: the TALON's tracer outscored the old gun with fewer rounds, because the old gun led its tracer as if it
  flew at flak speed (it missed a lot) - fixed with longer gaps between bursts; a missile with a 1.5 rad/s turn hits
  a helicopter almost every time in open sky, so missiles are rare (20 s) and light, and line of sight is the
  counter; the sandbox's first rAF stamp can be older than its start time (negative dt lit the muzzle flashes);
  long trucks parked radially poked into the HQ / factory, so vehicles park along the gun ring.
- Tests: defence.mjs PASS 11/11 (tools/runs/*-defence), defencewar.mjs PASS 5/5, defbalance.mjs PASS 4/4,
  smoke 5/5, war 5/5, war2 6/6, dropflak 1/1.
- Untested: the sounds by ear (the paths run without errors in a live AudioContext); the NAVAL agent's
  carrier `userData.mounts` (the code reads { kind, pos, dir } and falls back to the old four deck spots); the sky
  carrier as a missile / beam target in a real fight; performance on a mid-range GPU with every island garrisoned.
## 2026-10-23 — NGC-1980 INFANTRY: the 1980 Marine rifleman (wave 1, branch ngc/infantry)
Standalone modules in `game/js/units/infantry/` plus the range sandbox `game/dev/infantry.html`; nothing in main.js
yet (FOUNDATION wires it in wave 2). Contract for FOUNDATION / MEDINV / RUNAWAY: [docs/ngc1980/INFANTRY.md](docs/ngc1980/INFANTRY.md).
- **Flight of the rounds** (`ballistics.js`, pure): point mass with the standard G1 / G7 drag functions, wind, air
  density from temperature / pressure / humidity, Heun steps (allocation-free, sub-stepped to 1/400 s). Headline
  figures only: muzzle velocities M193 991, M80 853, .45 253, M433 76, M72 145 m/s; drag fitted so the maximum ranges
  match the field manuals (M193 2,861 vs 2,653 m: a point mass flies the subsonic tail too far; M80 3,959 vs 3,725;
  .45 1,547 vs 1,500; M433 402 vs 400; M72 996 vs 1,000). G7 fits the rifle rounds' maximum range better than G1
  (+8 % vs +16 %). Sight solutions: M16A1 apertures (250 m battlesight, 'L' 375 m), M60 leaf (battle + 300-1,100 m),
  M203 quadrant 50-400 m and leaf, M72 front-sight range lines, M1911 fixed 25 m.
- **Hits are a game table**, deliberately (coordinator's call): penetration power (`pen` x v/mv) against material
  resistance per 10 cm, ricochet below a material's grazing angle, a `dmg` scale per round for MEDINV. Tuned so cover
  behaves: a sandbag layer stops rifle ball, plank walls and car bodies do not, brick stops the .45, steel plate stops
  small arms, shallow shots skip off water.
- **Weapons** (`weapons.js`, pure state machines): rates of fire (M16A1 750, M60 550 rpm), semi / auto, closed vs
  open bolt, bolt hold-open, forward assist, 20-round magazines (loaded with 18 like 1980 Marines: full ones jam more),
  M60 belts (4:1 tracer), M203 single shot, M72 extend -> arm -> fire -> discard (backblast event), M1911 slide lock.
  Manual actions run on keyframes (the viewmodel animates the same fractions): tactical / speed reloads (partial
  magazines stay items; speed reloads drop them), charging, SPORTS immediate action, remedial action for stuck cases
  and double feeds, mag / chamber checks (you only know what you have looked at), M60 belt change, barrel change (the
  hot barrel goes into the pack and cools), runaway gun (break the belt). Stoppages scale with fouling, heat, dirt and
  full magazines; barrel heat by Newton cooling fitted to the FM 23-67 barrel-change schedule; cook-off risk on a hot
  closed-bolt chamber. Recoil impulse = bullet + gas momentum.
- **The body** (`soldier.js`, pure): Arma-like inertia (accelerate / brake limits, heavier with load), stand / crouch
  (kneel) / prone with timed transitions, walk 1.52 / run 2.74 m/s (FM 22-5 quick time / double time) / sprint ~5.6,
  lean, free look, aim deadzone, weapon inertia (heavy guns lag), Tobler slope pace, wading and swimming, falls.
  Stamina is physiology: demand from the Pandolf walking equation and the ACSM running equation (load, grade, terrain
  factor), a sprint as an all-out effort; oxygen uptake follows with a lag, the deficit comes out of an anaerobic
  reserve that is paid back afterwards (out of breath after the sprint, fastest recovery at rest); heart rate and
  breathing follow, and drive the sway (breathing figure-8, drift, pulse, pain tremor, movement) by stance, rest and
  bipod. Breath hold ~8 s rested, ~3 s blown. Medical modifiers in, `fallInjury` out.
- **Rifleman** (`rifleman.js`, pure): the whole Marine in one `step()`: loadouts, weapon slots and swap times, the M203
  under the M16, projectiles with host raycasts, body hits through armour layers, explosions, supersonic cracks at the
  listener, dropped items, a HUD status that only reports what the soldier has checked.
- **Viewmodel**: ERDL sleeves, a GI watch, bare hands parented to anchors on the weapon, arms by two-bone IK from
  fixed shoulders; ADS puts the rear sight exactly eyeRelief in front of the eye (the real sight picture: blurred
  aperture ring, front post, the carry handle ears; the M60 leaf; the M203 through its quadrant, raised by the set
  elevation; the LAW reticle with range lines; the M1911 at arm's length); hip, sprint (port arms), prone; inertia from
  turning, bob, recoil kick, bolt cycle, muzzle flash, brass; action tracks for every drill.
- **Third person** (`soldiermodel.js`): a shared rigid skeleton (17 bones, one mesh each), procedural poses (walk /
  run / sprint / crawl cycles, kneel, prone, down, lean, aim, stance blending, arm IK onto the weapon), hitboxes per
  bone (head, neck, thorax, stomach, arms, legs; helmet and vest coverage), and the Marine: M1 helmet with the Mitchell
  cover, a bug-juice bottle in the band and the chin straps hanging, ERDL or OG-107 utilities, M1955 flak vest, ALICE
  belt, suspenders, magazine pouches, canteens, boots.
- **Sound** (`infantryaudio.js`): synthesised; your own shot = blast + body + the action (the M16's buffer-spring
  twang) + reverb tail; distant shots arrive late, darker and quieter with an echo off the treeline; a passing
  supersonic round cracks before its report; steel gongs ring after time of flight + the sound's return;
  mechanics, footsteps by surface with gear rattle, breathing from the soldier's breath phase / depth, heartbeat.
- **Bench** `tools/infantrybench.mjs`: 90 checks (flight, sights, cover table, rates of fire, barrel schedule, stoppages,
  SPORTS, recoil, sway order, march / run / sprint / rush / recovery times, heart-rate recovery, Pandolf, Tobler,
  injuries, the whole shot -> hit loop, hitboxes on the posed skeleton, every module parses).
- **Scenes** (`tools/scenes/`, all on `dev/infantry.html?debug&fixed`, which steps the sim synchronously through
  `__I.advance(sec, input)`): `infantry` (100 / 300 m shots, drop vs the sight line), `infantrydrills` (reloads frame by
  frame, bolt lock, SPORTS, M203 quadrant, M60 bipod + barrel change, LAW, M1911, third person), `infantryviews` (every
  placement, lean, free look, rest and bipod on the sandbags, the aim deadzone), `infantrysights` (one sight picture per
  weapon + spotting scope), `infantryhits` (mannequin parts and armour layers), `infantrymalf` (press check, stuck case ->
  double feed -> rod, runaway M60), `infantrymove` (blown on the hill, wading / swimming, gait cycles in third person),
  `infantryaudio` (offline render: a shot 340 m away arrives 1.0 s late, 8x quieter, darker; crack before report; echo;
  gong after time of flight + sound), `infantryhands` (orbit the arms), `infantrymodels` (weapons and postures). Tags: CONFIRMED (field manual / primary source), INFERRED, UNVERIFIED, GAME.
- Gotchas: (1) a `//` comment appended inside a one-line `if (...) { ... }` swallowed the brace again (weaponmodels):
  the bench now parses every module. (2) Inner `function key()` shadowed the `key` parameter of `createWeapon`.
  (3) Targets lined up in a lane hid each other: they are staggered across the lane by distance. (4) The M16A1 has no
  elevation knob on the left (that is the A2): an early model put one right in the sight picture. (5) A through-and-through
  restarted inside the same hitbox and hit it again: rounds now resume past the exit. (6) Low ready pivoted on the rear
  sight (the stock stood up beside the face): it pivots on the butt in the shoulder pocket. (7) The 1980 range kit with every
  weapon weighed 49 kg, over the 45 kg no-sprint limit: correct, so the range kit is lighter.
## 2026-10-23 — NGC-1980 wave 1: RUNAWAY ground forces (RW-1 STRIDER, RW-7 hover tank, seized M1A2 SEPv3 / T-90M, squad AI)
Branch `ngc/rwground`. New files only (no main.js / war.js changes this wave):
`game/js/units/runaway/` hit.js (hit-info contract), strider.js + stridermodel.js, hovertank.js + hovertankmodel.js,
mbt.js + mbtmodel.js, squadai.js, rwworld.js (world query + sandbox island), sandbox.js (pure battle host), rwaudio.js,
rwkit.js (model kit); `game/dev/runaway.html` (+ runaway.js, the sandbox), `game/dev/rwmodels.html` (+ rwmodels.js,
turntable); `tools/runawaybench.mjs`; scenes `runaway.mjs`, `runawaycloseup.mjs`, `runawaylive.mjs`, `rwmodels.mjs`,
`striderfall.mjs`. Weapons are GAME-TUNED throughout (ammo classes and armour points in hit.js, no real-world
weapon-performance data); the depth is in locomotion, hover physics, models, sound and squad behaviour.

### RW-1 STRIDER (strider.js, stridermodel.js)
- A 2.2 m, 150 kg digitigrade machine soldier (design values). Body = 3D variable-height linear inverted pendulum
  over a centre of pressure that can only sit inside the support polygon (one toe pad 0.30 x 0.14 m, or the hull of
  both). Stepping by divergent-component-of-motion control (Englsberger 2015 / Pratt 2006 capture point) WITH step
  timing adaptation: every substep it searches the remaining step time (longest first) for a foothold that (1) the
  swing leg reaches in 3D (a foothold below the hip on a grade costs reach), (2) the stance leg is still long enough
  for, (3) the swing foot can get to (11 m/s). Hurried steps = the STUMBLE; no reachable foothold = the FALL.
- Fall: rigid pendulum about the support edge (theta'' = g / L sin theta), impact, lie, then the get-up: feet plant
  under the hips, fold (no rise), one fast swing through 75 %, a dead stop, a slow mechanical finish. A shot-off leg
  = down for good, still armed (shoots prone). Rifle hits to the sensor head blind it (sound only).
- Hits (hit-info contract): momentum pushes the CoM and spins the torso; energy past the armour damages the part AND
  glitches its servos (a stance leg sags and loses its ankle control) - a machine-gun burst into the stance leg while
  running knocks it off its stride. Game armour: rifles get through the head and arms only, MGs the legs too,
  launchers anything.
- Uncanny traits (measured in the bench): the body glides level (1.3 cm bob vs ~5 cm human), the sensor head is
  gyro-stabilised in space (0.00° yaw wander walking) and snaps between scan positions, the torso + weapon slew at a
  hard 7 rad/s and stop dead, a recovering machine keeps its weapon on target while its legs scramble.
- Gait: walk 1.6 m/s at 100 steps/min, run 4.6 m/s at 210 steps/min (quick, scuttling; no flight phase). On grades
  the step period shortens and the body lowers; uphill the top speed falls (a power limit). The hips face the actual
  travel (facing the command while the body lags it made the feet cross in turns); the command turns with a bounded
  lateral acceleration (tight turns are taken slower).
- Model: thigh forward, shin back to a raised hock, a long metatarsal down to a clawed toe pad; ceramic plates over
  dark composite, pale cyan seams, an off-centre lens cluster on a wedge sensor pod, a sensor mast on the left
  shoulder, armoured right shoulder; seized XM7 (coyote, optic, suppressor) with a RUNAWAY sensor puck and IFF strip,
  or the RW coil carbine. ~13 draw calls per machine (rigid merged segments posed from S.pose(); the IK lives in the
  sim so the bench checks it).

### RW-7 hover tank (hovertank.js, hovertankmodel.js)
- 16.5 t, 7.8 x 3.9 m, rigid body 6 DOF. Four ducted lift fans each feed a skirt cell: plenum pressure from the fan
  curve Q = Qmax n (1 - p/pmax) against the hem leakage Q = perimeter x gap x Cd x sqrt(2p/rho), plus the cell's
  volume pumping; lift = p x area along the hull normal. The cushion is a soft spring that follows the ground; an
  active ride control (per fan) damps heave and holds the hem 0.42 m clear (lift = weight at 6.3 kPa, fans 77 %).
- Thrust vectoring 0.45 g in the hull plane (enough to hold and climb 20°), no grip: a hard turn at 16 m/s drifts
  45° between nose and travel. PI station keeping holds it across a 20° slope. The turret's offset weight rocks the
  hull when it slews (3.3°) and the PI trim works it off; the coilgun's recoil kicks the hull back 0.44 m/s.
  A dead fan sags its corner and grounds that cell's skirt, the hull still flies. Vehicles steer along the contour
  where the ground is steeper than they can climb (rwworld steer maxGrade).
- Point defence: an incoming rocket / shell within 45 m gets a flechette burst (55 %, 1.4 s cycle) - a game rule.
- Model: low faceted ceramic hull floating over a thin flared skirt (the gap shows), glowing fan rings under deck
  grilles (rotors spin), off-centre wedge turret with a coilgun of rails and lit coil collars, sensor mast with a
  sweeping head, PD dome aft, underglow, dust.

### Seized MBTs (mbt.js, mbtmodel.js)
| | hull | with gun fwd | width | height | mass | road speed (placeholder drive) |
|---|---|---|---|---|---|---|
| M1A2 SEPv3 | 7.93 m | 9.77 m | 3.66 m | 2.44 m | 66.8 t | 67.0 km/h, 16 km/h on 20° |
| T-90M | 6.86 m | 9.63 m | 3.78 m | 2.23 m (2.22 pub.) | 48 t | 60.0 km/h, 17 km/h on 20° |

Commonly published overall figures; models built to them (7 / 6 road wheels, skirts, CROWS / CITV / doghouse on the
M1, Relikt chevron + glacis V + bustle slat cage on the T-90M), weathered, RUNAWAY refit (ceramic sensor pod on the
roof, cyan IFF strips, glyph blocks painted over the national markings). The drive is a PLACEHOLDER (power-limited
traction, grip, rolling / grade / air resistance, skid-steer yaw limit, attitude from the four track ends) behind the
interface wave 2 fills with the TANK agent's `trackfm.js`: `createMBT(P, { drive: factory })`, factory(P) returns
`{ place(x, z, yaw, env), step(dt, {throttle, steer, brake}, env), p, yaw, pitch, roll, speed, yawRate, wheelSpin }`.

### Hit-info contract (hit.js) - for the INFANTRY agent's ballistics
`{ calibre mm, mass kg, velocity m/s, energy J, direction {x,y,z}, part, point {x,y,z}, type 'ball'|'ap'|'heat'|'frag'|
'blast'|'coil', pen (armour points, optional), impulse N s (optional), side, weapon, src }`; normalizeHit() accepts
`dir`/`direction` as object or array, `vel` (vector), `caliber`. Parts follow the infantry zones (head, thorax,
stomach, armL, armR, legL, legR; machines add weapon; vehicles front / side / rear / top / turret / fan).
Every RUNAWAY unit takes `unit.sim.hit(hit)` and returns `{ part, dmg, pen }`.

### World query (rwworld.js) and the squad AI (squadai.js)
- `makeWorldQuery({ height, water, obstacles })` -> height, normal, isWater, los, raycast, coverPoints, coverScore,
  hullDown, steer(maxGrade); `bakeHeight(fn)` grids an analytic height function (the sandbox got 4x faster).
- AI: `createSquadAI(world)`; `addSquad({ id, side, members, order })`; `order(id, { type: take|defend|patrol|hold|
  retreat, x, z, r })`; `hear(sound)`; `nearMiss(id)`; `update(dt, targets)`; outputs `m.ai = { move, run, crouch,
  face, aim, aimId, fire, look, state }`. Squad states: advance (wedge, armour 30 m behind) -> contact (to cover:
  walls, rocks, or a fold in the ground that hides a crouched body but lets it fire standing) -> bounds (fire teams,
  exact 6 s cadence) -> flank (a stalled fight: a team goes round the RIGHT at 75°) -> assault (strong, close, the
  enemy quiet, after 12 s) / retreat (strength ratio < 0.55: bounding withdrawal to a rally, then hold until
  re-tasked) / regroup / defend (cover round the point, never leaves it). Perception: 10 Hz sensor sweeps in sectors,
  spotting builds with range / movement / firing / cover, terrain + obstacle LOS; sounds triangulated across members.
  Combined arms: striders hunt AT gunners near their vehicles; armour takes hull-down overwatch and backs out of any
  known AT gunner's reach (M1 front to the gunner 150 m, RW-7 with point defence 180 m; the link spans squads);
  armour picks firing positions on an arc round the threat with line of sight (hull-down preferred) and, with no shot
  for 30 s while the walkers fight, accepts the risk and pushes in to 100 m (an ambush chance for a patient gunner).
- Machine weaknesses (deliberate): kill the LINK NODE (member 0) -> 8 s without the link + 1.5 s freeze; synchronised
  volleys (2.4 s on / 0.9 s off: a window to move); exact bound timing; always flank right; strict threat priority
  (a loud MG or an AT gunner draws every rifle: decoys work); loud noises pull them.

### Sound (rwaudio.js)
`new RwAudio(ctx, dest)`: servo whine bank following the nearby striders' joint activity, footfalls (thump + toe tick,
harder when running / stumbling), hover fan roar + blade-pass tone + whistle, M1 turbine / T-90 diesel + track clatter,
coilgun charge whine and crack (snap, falling zap, sub thump), machine 'speech' (FM chirp phrases on squad decisions;
LINK LOST is a broken, glitching phrase), gunfire for both sides, blasts, ricochet pings off ceramic.

### Sandbox (game/dev/runaway.html)
430 m island (central ridge to 24 m with 20-30° flanks, a farm plain with dry-stone walls, roofless crofts, boulders,
a pine wood, a pad). Scenarios 1-6: assault, combined (two strider squads + RW-7 + M1A2), flank, outnumbered, defend,
patrol, vs 1980 DUMMIES (rifle / MG / AT launcher / an M60-ish tank stand-in) that spot, shoot back and get
suppressed. Free camera (drag + WASD/QE, F follow, G free), debug overlay (O: squad + member states, link node,
destinations, aim lines red when firing, cover normals, known contacts, threat axis, flank point, AI log), time
scale, sound on click. `?debug` bridge `window.__RW` { B, start, run(secs), look, lookAt, follow, step, audio }.

### Bench (node tools/runawaybench.mjs): 48 checks, all pass
STRIDER: walk 1.65 / run 4.61 m/s; 20° slopes walking AND running, 8 headings x 60 s, 0 falls (max leg stretch 0.98);
26° walking 0 falls; 8 machines roam the island 90 s (1.9 km, ground to 31°) 0 falls; push recovery 400 N s fore/aft,
240 N s sideways standing, 300 N s any way walking; a 900 N s blow knocks it down and it is up in 3.6 s; 30 rifle
rounds into the thorax do not stop it; an MG burst into the stance leg makes it stumble; rifle -> blind, rocket ->
destroyed, leg off -> disabled but armed; deterministic. RW-7: 10 checks (above). MBTs: dimensions, speed, grade.
AI over three seeds: cover 100 %, flanks right 3/3 and the flankers get there 3/3, retreats 3/3, AT-gunner priority
100 %, no fire in the volley gap, suppression -> cover, link loss -> freeze, armour stands off known AT (199 / 173 /
205 m), defend radius held, ~22 ms CPU per simulated second for a 10 v 10 fight.

### Gotchas found on the way
- Starting from rest by lifting a foot straight away throws the CoM sideways: weight shift first (the DCM moved over
  the stance pad, and pushed forward so the first step goes forward, not back).
- The pad centre sits ahead of the foot reference: unaccounted, every step leaked speed (stops drifted backwards).
- Fixed step timing can't recover pushes: the stance leg runs out of length mid-step (all velocity along the leg was
  killed by the inextensible-leg constraint). Joint foothold + timing search fixed falls from 60 N s pushes.
- Turning: hips facing the command while the body lagged made the feet cross over; face the actual travel.
- Uphill the height servo lagged a ramp by 0.36 m (velocity feed-forward from grad(h).v fixed it), and the 2D reach
  ignored the foothold being below the hip (3D reach + feet set down within reach).
- RW-7: shared scratch vectors overwritten inside the cell loop (forward / right became cell positions: a 3° crab on
  a straight line); fan saturation at the hover point left no trim authority (fan headroom: Qmax up).
- Events raised by hit() between steps were cleared by the next step(): leg-shot falls never reached the host.
- Perception cone + no scanning = squads blind on their flank: sector scanning by the sensor heads.
- Assault on the strength ratio of what was SEEN (one defender) = suicide; armour in the squad centroid made the
  walkers wait for tanks that waited for them (centroid of walkers only); an MBT crept backwards on a slope at the
  brake / grade balance and its steering flipped sign at -0.3 m/s.

### Proposed wave-2 integration (war.js / main.js; nothing changed this wave)
1. `war.js`: import `createSquadAI` (squadai.js), `makeWorldQuery, bakeHeight` (rwworld.js), the sims and models.
   Build the world once in createWar: `makeWorldQuery({ height: bakeHeight(terrainH, 1300, 1.5), water: isWater,
   obstacles })` with obstacles from every island's structs (box from `mesh.userData.r / h`) + AA guns (cyl r 2.8).
2. Lift sandbox.js's host loop into a ground host inside war.js (same adapters: sync / driveUnit / projectiles):
   RUNAWAY ground squads live in `W.ground = { ai, units, proj }`, updated in `W.update` after the air units. Models go
   in islandGroup; `W.setVisibility` hides them outside the fog like other enemy units.
3. Commander (`think`, after step 2 'expand'): when a transport (MV-22B in wave 2) lands at island I, unload a squad
   (4 STRIDERs; from 600 s also an RW-7; from 900 s a seized MBT off the KRAKEN) and `ai.order(id, { type: 'take',
   x: I.pad.x, z: I.pad.z, r: 30 })`; owned islands get `{ type: 'defend', ... }`; squads that retreated are re-tasked
   when `S.holdUntil` passes. `updateCapture`: an RW squad with >= 2 machines up within `pad.r + 10` counts as a
   capturer at `CAP_TIME.squad = 12`; the existing rule (live enemy AA blocks capture) stays.
4. Targets for the AI each frame: the player's infantry / vehicles (INFANTRY, TANK, WHEELED agents: kind inf / mg /
   at / vehicle), player AA guns and structs as 'vehicle', the player's helicopter when below 60 m as 'vehicle'.
5. Damage both ways: player projectiles (`W.proj` 'b' -> AMMO.mg, 'jb' -> AMMO.hmg, 'rocket' -> heat pen 300,
   'bomb' -> blast) get sandbox.projStep's segment tests against RW ground units and call `unit.sim.hit()`; RW ground
   fire goes through `W.shoot` with a hit callback into `W.damage` for structs / aircraft and into the infantry
   agent's damage API for soldiers (same hit-info).
6. Sound: `new RwAudio(sfx.ctx, sfx.master)`, listener = camera, `loops()` with the units near the camera, events from
   the ground host.
7. Performance: squads > 600 m from the camera step at 5 Hz with their walkers moved kinematically along the AI's
   path (no balance sim); full sims within 600 m.

### Untested / known gaps
- Nothing runs inside the real game yet (wave 2). The 1980 side in the sandbox is dummies, not the INFANTRY / TANK
  agents' units; their hit-info field names are matched by convention (the infantry file was not committed yet).
- The MBT drive is a placeholder; no suspension, no track slip. MBT guns / coax fire at game rates.
- STRIDER running has no flight phase; striders do not climb over walls (they path round them); no crouch-walk.
- No pathfinding (local steering only): a squad can get stuck behind a long wall or a cliff; tanks can be cornered
  against steep ground.
- The hover tank's fan / vectoring numbers are design values; no water running (it is a hovercraft, but the sandbox
  keeps it ashore).
- Audio was only checked for errors and a running context headless (no ears on it).
## 2026-10-23 — NGC-1980 FOUNDATION: crafts, on foot, the ground-vehicle host (branch ngc/foundation)
API reference for wave 2: [docs/ngc1980/FOUNDATION.md](docs/ngc1980/FOUNDATION.md).
- craft.js: a registry of player-controllable crafts with one interface (seats with eyes / doors / exits, enter /
  canExit / exitSpots / exit, update / idle / afterWar / render, camera / firstPerson / fov, key / look, hud, silence,
  pl, avatar, hurt, bounds). main.js routes keys, mouse, cameras, FOV, near plane, HUD, pause menu, silence and war.js's
  PL through it. G.craft is still the active id ('heli', 'jet', 'foot', 'boxcar').
- The HORNET moved out of main.js into craftjet.js (taking a jet, flying, losing it, cameras, keys, HUD, radar sight).
  Y stopped on deck now climbs out: the jet stays parked and rides the deck; the deck crew brings the Huey up from the
  hangar; Y at the boarding ladder climbs back in; 5 in the Huey re-spots the parked jet instead of a new one.
- The Huey is a craft too (doors either side, exit when landed with the collective down, parked: collective down,
  engine left at flight idle, still serviced on a friendly pad, can still be lost). Its flying / cave / drop / helm
  stay special in main.js (updateHeli(dt, inp, piloted)).
- ON FOOT (foot.js + pure footsim.js): FM 22-5 walk 1.52 / run 2.74 m/s, sprint 5.5 m/s with stamina, crouch, prone,
  jump, Tobler slopes (blocked past 37°), 0.45 m steps, falls (hurt from ~2.5 m), wading, swimming, ladders (carrier
  stern from the water, island to its roof), mouse look, first / third person, a placeholder 1980 Marine and arms with
  an M16A1 that fires war.js bullets. Slots for INFANTRY (soldier sim, viewmodel, body, weapon) and MEDINV (medical,
  inventory). Hits are routed to body parts from the round's closest point.
- platform.js: kinematic deck carrying (ship motion since the last settle is added, so mouse look and the sim's own
  motion are kept); crafts.afterWar() re-carries after war.update so nothing trails its deck by a frame.
- ground.js (GR): surfaces (road / deck / rock / grass / sand / mud / water, mu + rolling resistance), floor() with
  walls, colliders (island trees now recorded, buildings, AA guns, ship islands, every craft's footprint), ladders,
  spawn spots (carrier deck park, island motor pools, beaches), clearView for third-person cameras.
- vehicle.js: any pure wheeled / tracked sim + model becomes a drivable craft (keyboard / gamepad / HOTAS + pedals,
  seat eyes with head-look, chase orbit, motor sound, hull damage, crew exposure, wrecks, sinking). Placeholder TEST
  CAR (units/placeholder/boxcar*.js, M151A2-ish numbers) at the home motor pool; 7 = motor pool delivery.
- war.js (small, commented FOUNDATION): swept bullet hits on the player with the hit point, pl.detect (gunship hunt,
  AA ranges, the commander's defend check), pl.capTime / kind (a soldier or a vehicle takes a pad).
- audio.js: sfx.motor (piston engine), huey()/jet() accept a volume for parked aircraft heard from outside.
- Gotchas: requestPointerLock from a key press froze headless screenshots (now only on a click); a frame with
  dt = 0 (same rAF timestamp) made the flight models divide by zero (NaN Huey) - dt is now at least 1 ms; the first
  deck carry snapped the walker back to his stored yaw (mouse look dead on ships) - carry now adds only the ship's
  motion; reading the soldier between war.update and the next frame showed him trailing his deck (afterWar); a
  vehicle wheel compared against the body height took slopes for walls - each wheel is compared with its own height.
- Tests: tools/footbench.mjs (28 checks), tools/boxcarbench.mjs (20), scenes foot.mjs (12), vehicle.mjs (14),
  jettrap.mjs (now walks away from the parked Hornet to the Huey); regression results in the branch report.
- Untested: real HOTAS / gamepad driving and walking (only keyboard in headless), pointer-lock mouse look in a real
  browser, the SKY CARRIER flying with a soldier on deck (bench only), many vehicles at once.
## 2026-10-23 — NGC-1980 AIR (fixed wing): F-14A on a real flight model flown by an AI pilot; the RUNAWAY air arm
Branch ngc/airfw (airframe, Tomcat FM, flight director) + ngc/airfw-2 (pilot, RUNAWAY aircraft, models, war hooks).
- **Parametric airframe** (units/air/airframe.js): the Hornet's flight model generalised (aero table, engine schedule,
  NDI or SAS control law, sweep / engine hooks). jetfm.js is now the Hornet's parameter set, bit-identical
  (tools/jetfingerprint.mjs hashes every state float over 12 scenarios; jetbench 24/24).
- **F-14A TOMCAT** (units/air/tomcatfm.js): CADC sweep 20-68° + oversweep (Heatblur table, 15°/s), TF30-P-412A (slow
  spool, AB zones, compressor stalls at high AoA / sideslip / slams, 0.69 / 2.78 TSFC), mechanical stick + SAS (no
  limiter). tools/tomcatbench.mjs 32/32: 1 g min 114 KEAS (~115-125), on-speed 124 KEAS (~130-135 at 51,800 lb), roll
  145°/s at 350 KEAS, M 0.91 MIL / M 1.14 AB low level (M 1.2 Jane's), 6.5 g sustained at 343 KEAS, fuel flow 8,337 /
  57,678 lb/h (8,500 / 58,000), cat end 187 KEAS, trap.
- **AI pilot** (units/air/pilot.js) flies only stick, pedals and throttles through the flight director (fd.js):
  - cat run-up and shot, climb-out (gear and flaps up on schedule), CAP orbit (lead-point guidance on a circle; turns
    kept flat, no loops to reverse), radar contacts, intercept, dogfight: lead / pure / lag (high yo-yo) pursuit,
    "bugout" extension (the Tomcat does not turn with a better turner), energy limit (no zooms below vmin), defensive
    break into an attacker with guns jinks, missile break; game weapons in range bands with a gun snapshot cone;
  - terrain look-ahead: the path is sampled out to 14 s, the climb angle raised to clear by 55 m, and if no sane climb
    does, a clearing heading is held for a few seconds (no flip-flop along ridges); hard deck 140 m in fights, and a
    dive-recovery check (pull-out height V^2(1-cos g)/(g(n-1)) + roll-out) that rolls level and pulls;
  - recovery: bingo / winchester RTB; pattern (upwind, downwind, base) or straight in; final: carrot onto the extended
    centreline + glideslope, gear / hook / flaps, speedbrake when fast; the last 700 m flown like the LSO wants: stick
    for the 3.5° slope (vertical speed), throttle for on-speed EAS from the weight (aeroCoeffs at 10.5° AoA) trimmed on
    AoA, bank for lineup; wave-off in close (lineup, glideslope, AoA, swinging deck), bolter (MIL on touchdown), go
    round; trap and wire release. The 3 wire: the hook hangs 3.4 m under the CG at 7° nose up and a wire catches within
    0.45 m of the deck, so the glideslope is aimed 20 m up the deck from the hook's touchdown point.
- **RUNAWAY aircraft** (units/air/rwfm.js): RW-4 SHRIKE (FICTIONAL: blended delta drone, 39 kN dry, NDI 11 g, ~280°/s
  roll, M 0.92 low level, 2 decoys, hp 2); MQ-9 REAPER on the airframe with a turboprop engineFn (671 kW TPE331,
  eta 0.8, thrust = eta P / EAS; cruise 178 KEAS at 70%, slow flight 99 KEAS; GA-ASI: cruise ~170 kt) that orbits and
  spots; SHAHED-style one-way drone as a point mass (bank-to-turn, lift / drag / prop thrust, rail booster; GAME
  ~115 KEAS) with terrain-following cruise and a terminal dive.
- **Weapons stay game level** (BIBLE rule): AIM-54 / AIM-7 / AIM-9 and the SHRIKE's missiles are all war.js 'aam'
  projectiles (units/air/gameproj.js: the existing capped-turn-rate homing moved into a shared module, unchanged) with
  game range bands; guns are war.js 'jb'; the SHAHED's warhead is a war.js blast. Decoys are a game rule: a missile
  closing inside 350 m and again inside 150 m on an aircraft with decoys is drawn off 45% of the time.
- **tools/airbench.mjs 28/28** (node): two full sorties off a fake ALBATROSS (with tower) sailing at 6 m/s and turning
  during CAP: cat at 7 s, CAP at 20 s (r 430-490 m, 249 m), bingo at 295 s, 3 wire, 0 wave-offs, < 3.6 g, never below
  110 m AGL outside the approach; a forced wave-off and a hook-skip bolter that both go round and trap; a 700 m ridge in
  front of a low CAP point (cleared by 56 m); SHRIKE / REAPER / SHAHED checks; Tomcat vs SHRIKE: BVR 5 wins / 1 loss,
  merge (AIM-9 + gun only, a 10-g drone) 3 / 3, nobody into the sea, every pursuit mode used; a Tomcat on CAP vs
  SHAHED salvos at 70 m: 9/12 shot down, never below 80 m (dive limit: no dive steeper than one it can pull out of
  above the 140 m hard deck; below 460 m no reversals through the vertical).
- **Models** (house style, real size): TOMCAT (units/air/tomcatmodel.js) driven by the sim: swing wings, glove vanes,
  slats, flaps, spoilers, differential stabs, rudders, speedbrakes, gear with launch bar, hook, canopy, two crew, TF30
  nozzles + afterburner, AIM-54 / 7 / 9 on their stations, gull grey over white, fictional 1980 squadron VF-118 on the
  ALBATROSS (tail code AB, modex 2xx), full-colour star-and-bar. SHRIKE, REAPER, SHAHED (units/air/rwmodel.js) with
  RUNAWAY marks (cyan IFF strips, stencils over painted-out markings, a bolted-on sensor pod on the REAPER).
- **In the war** (units/air/airwar.js; war.js hooks marked AIR): command 4 queues a Tomcat for the bow catapult (one at
  a time, waits for open water ahead up to 20 s), CAP over the selected island or the ALBATROSS (main.js one-liner:
  `war.sendEscort(selIsl)`), fights anything of the RUNAWAY's in the air, RTBs and traps (+15 materiel back); the enemy
  launches SHRIKE pairs off the KRAKEN (answering our Tomcats, sweeps), a REAPER that finds the ALBATROSS and then SHAHED
  salvos from its nearest island at her (or at our islands' buildings). The player is a target too (missiles, cannon).
  Fuel runs 8x real for game-length sorties (~5 min CAP). Sounds (units/air/airsound.js, on the Sfx bus): TF30 roar with
  AB crackle and Doppler for the three nearest jets, REAPER turboprop buzz, SHAHED moped drone.
- **Gotchas**: ship heading vs flight heading convention (bow at -z: heading = -yaw; one sign error made every wave-off
  turn the wrong way); FD.steer asked for all of the g as turn and none to hold the nose up in steep turns at low g
  limits (now it keeps sqrt(n^2-1) for the turn); "push instead of rolling inverted" is wrong in a fight (option); the
  catapult holds forever (burning all its fuel) if the lane-ahead check never clears; the dev page's carrier sat on an
  island; the old kinematic escort code in war.js is gone.
- **Untested**: hours of real play balance (SHRIKE / SHAHED pacing, materiel costs); the escorts with the sky carrier
  airborne; Tomcats over the real mountains outside the zone (bench ridge only); many simultaneous sims on a slow GPU.
- Scenes: escorts.mjs (new), airmodels.mjs, airfly.mjs (dev/air.html); jets.json and war2.json updated for real jets.
## 2026-10-23 — NGC-1980 AIR AI rotary: CH-46E + Marines, RUNAWAY MV-22B, RW-3 WASP (branch ngc/airrot)
Three AI rotorcraft that fly physically: a pure-JS flight model, a node bench against published data, an AI pilot that
works the controls (stick, collective / thrust lever, pedals, nacelles - never a position), a mission brain, an
exterior model, synthesized sound, a dev page and in-game scenes. Files: game/js/units/air/rotary/* (all new),
game/dev/rotary.html (+ rotary-dev.js, rotary-units.js), tools/{ch46bench,mv22bench,waspbench,rotarymission,
waspmission,rotaryperf,rotarykit,runscenes}.mjs, scenes ch46capture / mv22landing / wasp / rotarydamage / rotarydev.

### Shared core
- rb.js: 6-DOF rigid body (FRD dynamics, three-style quaternion so meshes take it as is) with gear contacts: spring /
  damper normal force and the Huey's deadbeat friction on the effective mass, relative to moving decks (surfVel).
- rotor.js: the Huey's rotor concepts as a reusable disc, but thrust / torque from 8-10 blade-element strips with the
  azimuth-mean tangential speed (reproduces CT = sigma a/2 (theta0 (1/3 + mu^2/2) ...) - checked: 0.00576 vs 0.00573 in
  the Huey's hover) so the same code is a lifting rotor AND a proprotor in high axial inflow. Glauert inflow + lag,
  Johnson's ring curve, Cheeseman-Bennett ground effect, external inflow (rotor interference), flapback / lateral
  flapping signed by rotation sense, disc lag behind body rates, articulated hub moment (hinge offset) or gimbal spring.
  Non-uniform inflow factor 1.12 (INFERRED).
- pilot.js: layered autopilot - velocity -> attitude (+ learned trim, slewed at a pilot's pace) -> cyclic PD+I,
  vertical speed PI on the collective, yaw rate on the pedals. transportai.js: the transport mission (spool on the
  deck, lift off a moving deck, turn onto the track in the hover, terrain-following transit, a sqrt-profile approach
  with deceleration feed-forward and a linear close-in, glide path, steep-approach speed limit, VRS descent limit below
  ~40 kt, slewed climb commands, vertical descent, unload, RTB to the moving deck, park).

### CH-46E Sea Knight (player transport, command 1: replaces the MANTA capture drone)
- Tandem: pitch by DIFFERENTIAL COLLECTIVE (DCP), roll by lateral cyclic, yaw by DIFFERENTIAL LATERAL CYCLIC. The brief
  said "differential collective for yaw" - on a tandem that is pitch; yaw is differential lateral cyclic (decision).
  LCT (both discs forward with airspeed), overlap interference in the hover (+~10% induced power, Harris), the aft rotor
  in the front rotor's wake in forward flight (fades as the wake passes below the higher aft rotor), counter-rotating
  (front CCW, aft CW), unstable fuselage in pitch, aft-pylon weathercock, dual SAS. 2 x T58-GE-16 with N2 governor,
  collective anticipator, torque topping (~105%, INFERRED), a 2,800 shp transmission limit (INFERRED: the D/F drive
  train). Gear: fixed tricycle.
- Bench (node tools/ch46bench.mjs, 21/21; CH-46E SL ISA):
  | item | model | published |
  |---|---|---|
  | max level speed, 24,300 lb, 2,800 shp | 144 kt | 144 kt (CONFIRMED) |
  | max climb, 24,300 lb, 75 kt | 1,799 fpm | 1,715 fpm (CONFIRMED; weight / speed INFERRED) |
  | hover ceiling OGE / IGE, 24,300 lb | 6,000 / 9,000 ft | 5,750 / 9,500 ft (CONFIRMED; weight INFERRED) |
  | hover OGE at mission weight (22,000 lb) | 2,298 shp, pitch +3.8 deg | - |
  | aft rotor power > front in forward flight | 60 kt: 584 / 777 shp | qualitative (Stepniewski & Keys, Harris) CONFIRMED |
  | one engine out, 70 kt, mission weight | +815 fpm | E upgrade bought single-engine capability (INFERRED) |
  | autorotation 80 kt | NR 102%, 2,650 fpm | rpm limits 94-113% CONFIRMED; rate UNVERIFIED |
  | SAS off at 100 kt | pitch diverges 4.2 deg in 6 s (0.6 with SAS) | tandems need SAS (qualitative) |
  INFERRED (tuned / estimated, stated in ch46fm.js): flat-plate drag 5.6 m2 (to 144 kt), inertias, blade chord 18.25 in
  (UNVERIFIED), twist, Lock, hinge offset, shaft tilt 4.5 deg, LCT schedule, interference factors, transmission limit.
  Source conflict: 83 ft 4 in rotors-turning length gives 33.3 ft shaft spacing, the "16 ft overlap" figure 34 ft (used 33.3).
- Mission (node tools/rotarymission.mjs): lifts off the ALBATROSS at 6 m/s, lands 1.2 m from its LZ mark at 0.19 m/s,
  unloads, lands back on the moved deck at 0.20 m/s, min 29 m AGL en route, bank <= 17 deg, torque <= 105%.
- In the war: the LZ is chosen beside the pad (18 m out, perpendicular to the HQ / production line, tail to the pad,
  rotor discs and fuselage clear of every building, flat ground); the ramp lowers, 13 Marines run up the cabin, down the
  ramp and out to a perimeter round the pad, kneel facing out; the squad is its own unit ('squad': capTime 9 s like the
  drone, hp = men alive, hits drop them one by one, it fires back at game level) and holds the pad; the Sea Knight lifts
  off once they're clear and flies home to its deck spot (or HOME ISLAND's pad if the carrier is gone or flying), parks
  and is struck below. Below half hp an engine quits (abort, home on one engine); killed: both engines out, the AI
  autorotates (40% of the time the aft rotor is lost - it falls), the wreck explodes, Marines aboard are lost. Taken
  islands keep their Marines standing guard until the island falls again.
- Model (ch46model.js): lofted fuselage at real size, cockpit glazing, crew in the cockpit, five-a-side windows, crew
  door with the upper half swung up, hoist, sponsons + main wheels, twin nose wheels, forward pylon, roof tunnel, aft
  pylon with trailing fin, T58 nacelles with soot, 3-blade articulated heads (blades flap into each tip-path plane,
  droop at rest, blur discs), red troop seats, the ramp (lowers to the ground; crew chief appears), beacons / nav /
  landing light, 1980 USMC markings: dark green, black MARINES, full-colour star and bar, "EM 05" (HMM-261, INFERRED),
  BuNo, nose modex.

### MV-22B Osprey (RUNAWAY, replaces the enemy twin-rotor transport)
- Tiltrotor: two 3-blade gimballed proprotors (rotor.js discs) on nacelles 0-97.5 deg (CONFIRMED), 90 deg in ~12 s
  (CONFIRMED), cross-shafted (either engine turns both, CONFIRMED). FCS mixing by nacelle angle: helicopter =
  longitudinal cyclic (pitch), differential collective (roll), differential longitudinal cyclic (yaw); airplane =
  elevator, flaperons, twin rudders. Thrust lever -> collective on an axial-inflow schedule in the helicopter share,
  -> engine power with a collective prop governor in the airplane share; 412 rpm helicopter / conversion, 333 rpm
  airplane (CONFIRMED two-speed rotor); FCS overspeed protection. Wing halves in the rotor wash (download), H-tail,
  twin fins, retractable gear, proprotor ground strike. Conversion corridor INFERRED from the published XV-15 / V-22
  shape, with the floor scaled to the wing's stall speed at the present weight.
- Bench (node tools/mv22bench.mjs, 21/21):
  | item | model | published |
  |---|---|---|
  | disc loading at 47,500 lb | 20.9 lb/ft2 | 20.9 (CONFIRMED) |
  | hover OGE at 47,500 lb | 8,787 shp (71% of 2 x 6,150), FM 0.78, download 10.7% | FM ~0.78, download ~10-12% (INFERRED) |
  | level trims hover .. 260 kt inside the corridor | all held, max pitch 8.1 deg | - |
  | max level speed SL, 2 x 6,150 shp | 270 kt | 275 kt (CONFIRMED) |
  | climb, airplane mode, 154 KCAS, MCP, 52,600 lb | 2,774 fpm | 2,320-4,000 fpm (CONFIRMED; 154 KCAS AOPA) |
  | conversion 90 -> 0 | 11.9 s | ~12 s (CONFIRMED) |
  | rotor speed heli / airplane | 412 / 333 rpm | 412 / 333 (CONFIRMED) |
  | one engine out at 200 kt | level, both rotors at 333 rpm | cross-shaft (CONFIRMED) |
  CONFLICT: the published 110 kt "stall speed" can't be the wing alone (W/S 158 lb/ft2 needs CL 3.8); the model's flapped
  wing stalls at 137 kt at 39,500 lb. INFERRED: f = 3.55 m2 (to 275 kt), inertias, linear twist -40 deg (real -47
  nonlinear), wing CLmax 1.6 / 2.05 flapped, wash factor, tail sizes, MCP ~5,000 shp.
- Tilt pilot (tiltpilot.js): accelerates and slows with the nacelle angle (the thumbwheel), attitude near level; the
  helicopter loops (speed by pitch, height by thrust lever) hand over to airplane loops (speed by thrust lever, climb
  by pitch, turn by bank, zero sideslip) only once the wing has margin (1.0-1.22 x stall speed); one set of integrators
  in charge at a time (bumpless); decelerating from airplane mode on power first. Mission (rotarymission.mjs): from the
  KRAKEN 6.5 km out - converts to 0 deg / 206 KIAS, back to the hover, lands 1.6 m from its LZ at 0.24 m/s, unloads,
  back to the moving KRAKEN at 0.24 m/s, 0 s outside the corridor, power <= 97%, min AGL 32 m.
- In the war ('transport'): off the KRAKEN's bow spot (or IRONHOLD); 12 machine troopers march out in lock-step (one
  shared gait phase) and stand round the pad sweeping their heads together (capTime 10 s as before); if the commander's
  target is taken first it's re-tasked to the next island; it folds on the KRAKEN when it gets home (rotor brake,
  nacelles down, blades fold back, wing swings fore-and-aft) and is struck below. Engine hits: it presses on
  (cross-shaft); killed: it falls and explodes with the troopers aboard.
- Model (mv22model.js): two-tone grey, primer patches, nacelles that tilt about the wing tips with spinners and three
  twisted blades (fold), wing on its stow ring with flaperons, H-tail + twin fins / rudders, sponsons, retracting gear,
  rear ramp, refuelling probe; RUNAWAY refit: a sensor ball under the chin with cyan lenses, cyan IFF strips and seams,
  machine cores where the pilots sat, crude glyphs stencilled over MARINES.

### RW-3 WASP (RUNAWAY ducted-fan attack drone, replaces the saucer gunship)
- Physics (waspfm.js, a fictional machine: physics checks, not a spec sheet): shrouded-fan momentum theory with the wake
  held at the exit (P = T^1.5 / sqrt(4 sigma rho A); fan share 1/(2 sigma)), climb inflow, edgewise momentum drag and
  the nose-up lip moment (Fleming 2003, Abrego & Bulaga 2002), exit vanes below the CG, fan torque split for yaw, an
  onboard stabiliser (open loop it diverges, as ducted fans do), three feet. The AI never tilts further than full power
  can hold 1 g.
- Bench (waspbench.mjs 13/13): hover 156 kW = FM 0.78 against the ducted ideal, 1.5x less than an open rotor (sqrt(2
  sigma)), lip share 55% (from the fan's pressure jump), 60% power to hover, momentum drag 1 kN at 10 m/s -> 1.8 kN at
  20, vanes trim nose-down with speed, holds 30 m/s at 41 deg, top speed 39 m/s at 52 deg, open loop diverges, lands.
- Mind (waspai.js): guard with mechanical sensor sweeps (yaw steps); AMBUSH - finds low ground with terrain between it
  and a target that's closing, hovers there still, springs when it's in reach; STRAFE - runs in on an offset line,
  fires, overflies, breaks away and comes back from a new bearing; SNIPE - hovers at standoff and slides sideways; SWARM
  - raid groups take evenly spaced slots on a ring round the target, turning in lock-step, breaking off one at a time;
  predictive avoidance of the target and each other. Node (waspmission.mjs 8/8): a swarm of four round a circling Huey
  for 2 min - no losses, >= 10 m from the target, >= 9.8 m apart, 39-58 s of firing windows each; the ambusher hides 9 s
  behind the hills and springs at 40 s.
- In the war ('gunship', same unit-list and damage semantics, hp 3): the old targeting rules (the player within
  170 / 260 m, our transports / squads / escorts within 160 m, raid targets, guard home), swarm slots shared by WASPs on
  one target, some lie in ambush when the player is coming their way. WEAPON AT GAME LEVEL (orchestrator's rule): bursts
  of three of the war's own 'b' rounds at 90 m/s with spread, drawn cyan (one-line b.col hook in war.js updateProj).
  Shot down: fans die, it tumbles and explodes.
- Model (waspmodel.js): a lathed ceramic shroud with cyan seams round two counter-rotating fans, stators and two stages
  of exit vanes (animated), a faceted sensor head offset to the left with three eyes and a sweeping scanner slit, a
  sensor fin on the right, a segmented abdomen curling under into an articulated stinger (the emitter tracks its
  target, flashes when it fires), three legs that fold.
- Escort decision: the blue-saucer "escort" variant of buildGunship is retired - the Tomcats (fixed-wing agent) fly
  escort, and a 1980 task force has no hover drones. ships.js keeps buildDrone / buildTransport / buildGunship as
  wrappers that build the CH-46 / MV-22 / WASP.

### Troops (figures.js, squad.js)
- Stand-in soldiers, deliberately simple and SWAPPABLE: FIGURES[kind](opts) -> { group, pose(state, phase) }, states
  run / walk / stand / kneel / aim / fall / dead / seated. 1980 Marine (M1 helmet with the leaf cover, ERDL utilities,
  M1955 flak vest, ALICE pack + canteens, M16A1; four skin tones) and RUNAWAY machine trooper (ceramic plates, cyan
  sensor slit, seized carbine with a cyan optic). 6 meshes each with one shared vertex-colour material. The INFANTRY
  and RW-1 work can replace them by registering in FIGURES.

### Sound (rotorsound.js)
- A voice pool per type for the nearest aircraft, distance falloff like the war's sounds, Doppler on the tones. CH-46:
  two 13.2 Hz blade-passage pulse trains gating noise bands, a hair apart (the beating tandem whop-whop), rotor thump,
  T58 whine. MV-22: deep 20.6 Hz proprotor thrum that turns into a propeller drone as the nacelles come down, AE1107
  whine. WASP: two detuned fan tones that beat, a slowly wavering formant, a sub hum, a chirp when it acquires a target.

### Shared-file hooks
- war.js: import createRotary; `const ROT = createRotary(...)` + `W.rotary`; makeAir first line (ROT.make), updateAir
  first line (ROT.update - rotary units fly themselves, dying too), W.update `W.peace = peace` and `ROT.tick(dt)`,
  W.reset `ROT.reset()`, updateCapture uses `u.capTime || CAP_TIME[u.type]`, gunship targeting includes 'squad',
  pickExpansion skips islands with an enemy landing party on them, sendDrone / damage feed texts (SEA KNIGHT), the
  b.col tracer colour. ships.js: three builders replaced by wrappers + three imports. main.js: ONE line - the command
  map legend "1: SEA KNIGHT + 13 MARINES" (the advisor's "SEND A DRONE (M, 1)" line in main.js is left for FOUNDATION).
- External placement: if a script / test moves a rotary unit's u.p, its flight model follows (jetweapons.mjs pins a
  gunship ahead of the jet).

### Tests (2026-10-23, load average ~70 from 13 agents: headless runs at 3-15 fps)
- node: ch46bench 21/21, mv22bench 21/21, waspbench 13/13, rotarymission 12/12, waspmission 8/8, rotaryperf (3 CH-46
  + 2 MV-22 + 12 WASP = 0.39 ms of CPU per 60 fps frame).
- scenes: ch46capture 4/4, mv22landing 4/4, wasp 3/3, rotarydamage 8/8, rotarydev 5/5 (all three missions + turntables),
  smoke 5/5, war 5/5 (two earlier runs at 3 fps failed a carrier-moved-3-m-in-5-s and an 8 s heli capture check: game
  time falls behind real time under load, before any rotary unit exists; passed on rerun), war2 6/6, jets 1/1,
  jetweapons 7/7, ships / aisim / playwar run clean (no expects).
- Untested: sound by ear (the graph builds; headless audio is muted); the CH-46 / Osprey launching from a pad when
  their carrier is gone; a flying SKY CARRIER as home (falls back to the HQ pad); many simultaneous squads on one
  island; the advisor text in main.js still says DRONE.

### Gotchas
- An inline `//` comment swallowed the rest of a line again (mv22bench) - keep comments off code lines in edits.
- dt = 0 on a page's first update divided by zero in the gear friction (NaN everywhere): every sim's step() returns on
  dt <= 0.
- With the gear up the Osprey lost its AGL and water / ground detection (they came from the gear contacts): belly check.
- Torque limiting by the needle pumped: rotor droop raises free-turbine torque. Limit on rotor power, slowly.
- Tandem transition: a fast nose-down command = forward stick = more aft-rotor collective = 135% torque: attitude
  commands slew at a pilot's pace.
- The tiltrotor's hard part was the conversion, not the hover: accelerating by pitching (a helicopter habit) with the
  nacelles already forward sank it; slowing from airplane mode by raising the nacelles at 190 kt windmilled the rotors
  (122% rpm). Fixes: speed by nacelle angle, attitude near level, wing-load handover, slow on power first, an FCS
  overspeed protection.
- Ducted fans have huge momentum drag at high disc loading: the WASP needs ~40 deg of tilt for 30 m/s; it sank when the
  pilot leant further than the thrust allowed (tilt limit from the fan model).
- The game only draws terrain round the player (250 m): in-game scenes park the Huey near the action for screenshots.
- The ALBATROSS's guns shred WASPs (hp 3, like the saucer) before they're in range; the wasp scene silences them to test
  the weapon.
## 2026-10-23 — NGC-1980 armour: M60A3 TTS and M113A2 (track sim, models, interiors, sound, test ground)
Files (all new): game/js/units/armor/ trackfm.js (the tracked-vehicle sim, pure), m60a3.js (M60A3 parameters + the
tank: turret, stabiliser, fire control, racks, loader, crew, electrics, fire, armour zones), m113.js (M113A2 parameters +
the APC: ramp, trim vane, bilge pumps, M2HB, 11 seats), armorballistics.js (game-level shells and armour), tankmodel.js
(M60A3 exterior + the shared running-gear kit), m113model.js, tankinterior.js (M60 driver / gunner / cupola, M113 driver
/ troop compartment), armoraudio.js, testground.js (the test ground, pure: used by the bench and the dev page);
game/dev/tank.html + tank.js; tools/tankbench.mjs; scenes tankmodel / tankinterior / tankdrive / tankm113 / tankaudio.
No shared files touched (main.js, audio.js, war.js untouched): wave 2 plugs these in through the interface below.

**The sim (trackfm.js), per 1/240 s substep** (AI vehicles can run 1/120: `createTrackSim(P, { substep: 1/120 })`):
- 6-DOF rigid hull (CG, diagonal inertia, quaternion). Hull frame: origin on the ground at static ride height, centre of
  the track contact; x right, y up, z AFT (forward -z, like the jet).
- Roadwheels: massless, on preloaded torsion bars (the rebound stop is a stiff spring, so a hanging wheel touches down
  without a force step), dampers on the stations that have shocks, bump stops. Travel = where the ground puts the wheel
  circle, sampled at 7 points (a kerb lifts the wheel before its centre reaches it). Between adjacent wheels the bottom
  run is two more contacts (it bears on ridges and step lips). Idler and sprocket arcs (to 155° from down) and the
  inclined front / rear runs are rigid contacts; hull probes for high-centring, rollovers and the gun digging in.
- Contact normal = the terrain normal; a contact that meets a wall or an edge (kink in the height field: second
  difference > 5 cm) uses its own geometry. Soil edges crumble under a heavily loaded track (up to 0.3 m).
- Track-ground shear: Wong's exponential law on a 2-D shear-displacement state per contact, relaxed as fresh links
  arrive (steady state = Wong's drawbar-pull / slip curve; at standstill a stiff spring: parks on a 30 % slope with zero
  creep). The links in contact move along the contact plane at track speed (the track conforms). Longitudinal and
  lateral slip, skid steer and pivots all come from this one law.
- Soils (SOILS): Bekker n, kc, kphi, cohesion, friction angle (Wong table 2.3: LLL sandy loam = grass, dry sand, WES lean
  clay 32 % = mud, lean clay 22 % = dirt, snow) + an INFERRED bog; rubber pads on paved / rock. Sinkage from a low-passed
  track pressure (plastic: sinks fast, recovers slowly) plus slip sinkage; compaction resistance; internal track
  resistance R_in = W (222 + 3 V) N (Wong).
- Drivetrain: engine, converter turbine and two sprockets as rotating bodies joined by torque-limited constraints solved
  with sequential impulses: range clutch, converter lock-up, one proportional steer constraint (cross-drive: steer speed from the
  input, pivot in neutral; controlled differential: steer ratio on the output, no pivot), brakes, park brake, downshift
  inhibitor, automatic shifting (TX100). Diesel with an all-speed governor on a net torque curve, injection lag,
  starter, stall, fuel burn incl. fan power; Trilok converter (capacity factor + torque ratio). The ground's pull on each
  sprocket is implicit (stiff soil stays stable).
- Water: buoyant hull columns, quadratic drag, paddle thrust from track slip through the water (and its torque back on
  the sprockets), the M113's trim vane (bow lift), intake flooding after ~0.8 s under (stalls the engine), leaks through
  the deck line, bilge pumps; water aboard adds mass (sinking). Events: stall, start, flooded, thrown, bellied, rollover,
  swimming, sinking, knockdown, impact, gunDug.

**INTERFACE FOR FOUNDATION (wave 2)**
- Create: `createM60A3(opt)` / `createM113(opt)` (vehicle with crew systems) or `createTrackSim(P, opt)` (bare chassis).
  `V.reset(x, z, yaw, env, { range, park, speed, running, cold, vane, pumps, ramp })` sits it on the ground (plane fit
  under the track corners). `V.step(dt, env, input)` returns this frame's events. Pose for rendering: `V.fm.origin()`
  (hull frame origin, world) + `V.fm.q` (quaternion {x,y,z,w}, three.js convention); `V.fm.pos` is the CG.
- env (what the host provides): `height(x, z)` REQUIRED; `surface(x, z)` -> 'paved'|'rock'|'dirt'|'grass'|'sand'|'mud'|
  'bog'|'snow' (default dirt); `water(x, z)` -> water level or -Infinity; `normal(x, z, out)` optional;
  `obstacles(x, z, r)` -> [{ kind: 'cyl', x, z, r, top, id, breakN } | { kind: 'box', x, z, hx, hz, yaw, top, id,
  breakN }] (things with breakN get pushed over: event 'knockdown'); `raycast(o, d, max)` -> distance (laser).
  `makeArmorEnv({ height, seaLevel, paved, forest, obstacles, raycast })` (armorenv.js) builds this from the game's own
  terrain: sand on the sea bed and beach band, rock on steep or high ground, mud in wet coastal hollows, grass / dirt
  patches, paved where the host says (pads, roads, decks); water at the sea level.
  Moving decks are not supported yet.
- Inputs (M60A3): throttle, brake, steer (-1..1, + right), range ('R','N','L','H'), park, starter, fuelOn; trav, elev
  (power control handle, + right / up), fire, coax, lase, dump, ammo ('M735'|'M456'|'M393'), stab, power, sight
  ('day'|'tts'), ttsMag (3|8), ttsPolarity ('wh'|'bh'); commander: cupTrav, cupElev, fire50; extinguish.
  (M113): the same driving inputs with ranges 'R','N','1','1-2','1-3'; mgTrav, mgElev, fire50; ramp, vane, pumps,
  dismount / mount (seat index, 'all', 'any').
- Shots come out as events `{ type: 'shot', weapon: 'main'|'coax'|'mg50', round, p, dir, v0, vel }`: the host flies
  them with armorballistics `newShot` / `stepShot` (the model the computer's tables use) and reports hits with
  `V.hit({ round, range, o, d })` (a ray in the hull frame; returns the result + events: crew wounds, component damage,
  fire, cook-off, kill state M / F / K). Recoil is applied to the hull by the tank itself.
- Models: `buildM60A3Mesh()` / `buildM113Mesh()` -> { group, hull, turret, cupola, ..., animate(state), setInside(bool) };
  state from the sim: travel = fm.wheels[s][i].s, trackPos = fm.trackPos, az / el / recoil / cupAz / mgEl, hatches,
  ramp / vane. Interiors: `buildTankInterior()` (add .group to the hull, .gunner to model.turret, .commander to
  model.cupola) / `buildM113Interior()` (add .group to the hull, .rampIn to model.ramp, .cargoIn to the cargo hatch);
  eyes: TANK.DRIVER_EYE, TANK.GUNNER_EYE_T, TANK.COMMANDER_EYE_T, M113_EYES. Sound: `new ArmorAudio(sfx.ctx, sfx.master)`,
  `.update(V, 'm60'|'m113', { inside, cam })` per frame, `.mainGun()`, `.mg(weapon)`, `.loaded()`, `.impact(big, dist)`.
  The dev page (game/dev/tank.js) is the reference host: cameras, sights, thermal view, shells, hits, sound.
- Cost: ~1.0 ms per 1/60 s frame for an M60A3 at 240 Hz on rough ground (0.55 ms at 120 Hz), M113 0.4 ms; no
  allocation in the substep loops.

**Bench (node tools/tankbench.mjs: 72 checks, all pass, incl. 7 state-hygiene checks from a code review).** C = in a source read for this work (AFVDB, FAS, Wikipedia
citing Foss / Jane's and Hunnicutt, armedconflicts.com), U = unverified, I = inferred, GAME = game balance.
| item | M60A3 sim | published | M113A2 sim | published |
|---|---|---|---|---|
| top speed, road | 48.7 km/h | 48 (C) | 63.6 km/h | 64 (C) |
| 0-32 km/h | 10.3 s | not found (U ~15-20) | 9.2 s | 11.0 s (FAS, C) |
| reverse | 17.1 km/h | 16 (FAS, C) | 19.0 km/h | - |
| road range at 30 km/h | 500 km | 450-500 (C) | 446 km | 480 (C) |
| gradient | climbs 60 % at 3.5 km/h, fails 85 % (pad friction) | 60 % (C) | 60 % at 2.3 km/h, fails 85 % | 60 % (C) |
| side slope | holds 30 % parked (no creep) and driving | 30 % (C) | same | 30 % (C) |
| vertical step | 0.91 m yes, 1.2 m no | 0.91 m (C) | 0.61 m yes, 0.85 m no | 0.61 m (C) |
| trench (crawl) | 2.59 m yes; sim limit ~3.6 m | 2.59 m (C) | 1.68 m yes; sim limit ~2.8 m | 1.68 m (C) |
| fording | 1.2 m dry, floods at 1.6 m | 1.22 m (C) | swims | 1.02 m / swims (C) |
| swimming | - | - | 5.5 km/h, 32 cm freeboard | 5.8 km/h (C) |
| turning | pivots 34°/s (dirt); half T-bar at 40 km/h: ~40 m radius | pivot (C) | 8.0 m circle, no pivot | 7.9 m (C) |
| ground pressure | 0.867 kg/cm2 | 0.852 (C) | 0.557 empty / 0.61 with troops | 0.55 (C) |
| traverse / elevation | 16.2 s for 360°, 3.9°/s, +20/-10° | 16 s, 4°/s, +20/-10° (C) | - | - |
| stabiliser on the move | 2.3 mrad on vs 44 off at 23 km/h | two-axis; Pk >70 % with, ~0 without (C, qualitative) | - | - |
| soft ground | grass 44, sand 42, mud 27 km/h (sinks 24 cm), bog: bellied | - (I) | 43 / 41 / 32, bog: bellied | - (I) |
INFERRED parameters (stated in the files): gear ratios (CD-850-6A: L 5.1, H 1.26, R 3.62, final 4.4; TX100: 4.0 / 1.75 /
1.0, R 3.4, final 3.95), converter capacity and stall ratios, steer ratios (the M113's tuned to its 7.9 m circle),
torsion bar rates (~1.1 Hz heave), track masses and inertias, the M113 track's internal-resistance factor, buoyancy
columns, paddle coefficient (tuned to 5.8 km/h), the soil-to-surface mapping and the bog.

**Weapons are GAME-LEVEL** (the coordinator's instruction mid-wave): headline muzzle velocities only (M735 1501, M456
1173, M393 732, 7.62 853, .50 887 m/s), a game drag, game penetration values and game armour thicknesses per zone
(layered: track skirts and fenders use up part of a round's value). The computer is a simple range (superelevation from
the same flight model) + lead (tracking rate x time of flight, capped at 25 mils) solution, applied by offsetting the
gun from the sight line (the gunner keeps the reticle on the target). Decisions: the coax is the M240 (standardised with
the M60A3 around 1979: Wikipedia, FAS); hydraulics are fire-resistant with Halon (two shots; crew compartment automatic,
engine manual); 63 rounds in three racks (13 ready in the bustle at 7.5 s a round, 26 in the hull at 13 s, 24 on the
floor at 11 s; the loader slows when wounded or on the move, and the commander loads if the loader is dead); combat weight
52,617 kg (sources conflict 51.4-52.6 t).

**Models and interiors.** M60A3 at real size (lofted hull and needle-nose turret, fenders with stowage boxes, headlight
guards, TTS housing with doors, M19 cupola with the M85, xenon searchlight, thermal-sleeved M68 with bore evacuator,
bustle rack with bedrolls, smoke dischargers, antennas, spare track blocks, jerry cans, tow cable), MERDC Summer Verdant
painted per face from a 3-D noise, mud low down, dust on top, stencilled bumper codes and the turret number. The
running-gear kit (both vehicles): wheels ride trailing torsion arms with the sim's travel, shocks stretch, sprocket /
idler / wheels spin with the track, and the links (80 on the M60, 63 on the M113, instanced) follow the real belt round
the circles (support rollers, sag). M113: aluminium box with glacis, plywood trim vane (folds / raises), ramp with door,
cargo hatch, cupola with M2HB, front sprocket, no support rollers. Interiors are closed rooms seen only through the
vision devices (the exterior lofts are back faces from inside): driver (periscopes, live gauges, warning lights, T-bar,
pedals, selector, park brake, hull rack), gunner (full-screen M35E1 day / TTS thermal sight pictures with mil reticle,
range, round, READY, mode; E looks up into the fighting compartment: breech that recoils, power control handles that
move, M21 panel with a live range readout and lamps, handwheels, bustle ready rack), commander (cupola with eight vision
blocks, turns with the .50), M113 driver (four periscopes, laterals that pull, selector, gauges, bilge lamps) and troop
compartment (two benches, eleven seated infantrymen in OG-107 and M1 helmets with M16A1s, the ramp opens to the world,
dome lights, radio). The TTS view re-renders the scene in heat greys (hot hulks, engine decks and running gear, cool sky
and ground) through a green-phosphor shader with scan lines, noise and WH / BH polarity.

**Gotchas found on the way.**
- The first frame's rAF timestamp can be earlier than the load-time performance.now(): dt < 0 ran the sim backwards into
  NaN (and crept the smoothed inputs). Clamp dt >= 0 on the page and refuse dt <= 0 in sim.step.
- Contact normals along the hull's tilted up axis gave a FREE horizontal force whenever the hull pitched (2.7 kN of thrust
  at the M113's 1.3° nose-down trim): top speed depended on the CG position. Use the terrain normal; geometry normals
  only at walls and edges.
- A finite-difference normal over a step lip looks like a 51° slope (passes a steepness test) and pushes the hull back:
  detect kinks by the second difference instead.
- Inclined track runs with a link direction fixed in the hull dragged when pressed flat on the ground (the cos of the run
  angle): project the link direction onto the contact plane at track speed.
- Sinkage computed from the instantaneous load fed back through the dampers into a period-2 limit cycle (730 / 300 kN
  alternating): low-pass the load and measure damper rates over the unsunk ground.
- The side-slope lane had no eastern bound and raised a 4.8 m wall across the bump course; it is a bounded ridge now.
- Steering first used a steer brake easing off against a steer clutch coming in: at half travel their torques cancelled
  and the lower half of the T-bar did nothing. One proportional steer constraint now (squared response on the M113's
  laterals); full steer at top speed still skids and throws tracks, so the dev page narrows the keyboard steer with
  speed (Right Shift: no limit).
- A cleared 2D overlay canvas was not re-composited in headless Chrome (a stale reticle in later shots): hide it instead.
- The gun muzzle probe had the hull's stiffness: a tank that hit a bank at 47 km/h was thrown back at 28 km/h off its
  own gun, and a 75 % slope "stopped" it only because the barrel jammed into the slope. The muzzle is a soft, lossy stop
  now (the barrel bends; each dig-in costs the gun a quarter of its hp) and hull contacts are ~half critically damped.
- The snap harness wraps evals in `const __r = ...`: a scene variable named __r breaks it.
- A fresh-eyes code review found state that survived reset() (the intake-flood timer re-flooded a reset tank in a
  puddle; rate-limited events stayed silent; damper rates jolted the first step), probes shared between tank instances
  (every tank's muzzle probe followed the last-stepped gun), an M113 automatic range that went NaN at speed, troop mass
  baked in, knockdowns that relied on mutating the host's objects, an engine fire that never burned, machine guns
  firing below their rate. All fixed; the probes are now bench checks (state hygiene).
- A `//` comment pasted mid-line by sed swallowed the rest of the statement (again): use /* */ in one-liners.
- Sensitivities, documented not hidden: a sharp CONCRETE 0.91 m wall is marginal for the M60 in the sim (face friction
  must lift the nose against the rear pivot; earth banks with crumbling lips are fine, so the test ground's steps are
  earth banks), and both vehicles bridge trenches ~1.4-1.6x their ratings at a crawl (rigid track, firm far wall; the
  ratings carry field margins).

**Tests and runs.** node tools/tankbench.mjs 72/72. Scenes (from tools/, CHROME_PATH=... node snap.mjs scenes/<s>):
tankmodel.mjs 2/2 (VEH=m113 too), tankinterior.mjs 2/2 (driver, sight pictures, gunner station, cupola),
tankdrive.mjs 9/9 (step, trench, 60 % ramp, ridge, mud, ford, laser range, a first-round SABOT hit at 1000 m, a
stabilised hit on the move at ~1000 m),
tankm113.mjs 4/4 (ramp, vane, troops, swims at ~5.9 km/h), tankaudio.mjs 4/4 (offline render: louder under load,
muffled highs inside, the gun, the 6V53).

**Untested / not done.** A HOTAS / gamepad on the tank (keyboard + mouse on the dev page); moving decks (landing craft);
the hatch-open driver view; AI driving; damage drawn on the model (burning, a thrown track off its wheels); night (the
searchlight lights nothing yet); terrain heat in the TTS beyond a flat grey; sound on real speakers (only measured
offline). Next step (wave 2): FOUNDATION hosts V.step / the model / the interior on the island terrain (height, surface
from the terrain classes, water at 0), shells through war.js, enter / exit at the hatches; then AI tank and APC drivers.


## 2026-10-23 — NGC-1980: faction structures and a lived-in world (ngc/world)
Files: game/js/world/ (net.js, layout.js, models.js, kit.js, chunkgen.js, worldworker.js, gfx.js, life.js, ambient.js,
structures.js, rng.js), game/dev/world.html (+ world-preview.js), tools/worldbench.mjs, tools/scenes/world.mjs,
worldprev.mjs, structprev.mjs, worldperf.mjs, worldjet.mjs.
- **Settlements and roads (net.js, pure, seeded).** Wild lands: one settlement candidate per 1.6 km cell (hamlet 70 m,
  village 135 m, town 210 m radius; harbour towns on the coast), linked by a relaxed relative-neighbourhood graph
  (tarmac between villages and towns, lanes to hamlets, dirt between hamlets). Each road is routed by dynamic
  programming down a corridor (40 m stations, 25 m lateral steps, cost = length + grade + water), Chaikin-smoothed,
  resampled at 8 m, given a grade-limited profile (tarmac 8.5 %, lane 10 %, street 12 %, dirt 14 %), causeways over
  short shallow water, bridges over longer water or fills > 5 m (max 420 m). Towns get side streets, a harbour lane and
  a quay; farms (one per 420 m cell where the land allows) get a dirt track to the nearest road and up to seven walled or
  hedged fields (wheat, barley, hay, potato, plough, pasture) inside their own cell. Control zone: a village on each big
  island (away from the pad, the shaft and the war's building slots), a lane from the pad apron, a harbour lane to a
  stone quay, a back street; jetties, rim cottages and lighthouses on the small islands.
- **The ground agrees.** world.js: `rawH` is the old islandH; `islandH = roadBed(rawH)`: road beds (flat 1.6 m past the
  edge, shoulder 3-18 m), squares, quays, farmyards and **building platforms** (cut-and-fill pads, blended by weights
  that don't depend on generation order) are flattened in, so physics, the terrain bake and the road ribbons agree
  (99.9 % of road centreline samples within 5 cm; the rest are junctions). The 16 m far bake uses rawH.
- **Determinism.** Everything is seeded by position and generated lazily per 1.6 km cell, independently on the main
  thread, the terrain worker and the world worker. What keeps the threads agreeing: lots and farms only look at things
  guaranteed to exist first (prepArea), incident roads are sorted by key, farms stay in their own cell. worldbench: a
  second process generating in the opposite order agrees to 5e-5 m over 20 000 points.
- **Buildings (models.js on kit.js).** 1980 houses (1-2 storeys, gable / hip, framed windows, doors, porches, chimneys,
  TV aerials, flower boxes), cottages, terraces with shopfronts, awnings and fascias, the church (nave, chancel, porch,
  tower with spire or battlements, clock, churchyard), filling station, barns, Dutch barns, silos, tractors, boat sheds,
  quay walls, timber piers, lobster pots, lighthouses with keeper's cottages, guyed radio masts, phone and post boxes,
  bus shelters, lamps, signs, war memorials, benches, laundry lines, sheds, woodpiles, garages, parked cars, garden
  trees; wooden power poles every 45 m along tarmac and lane links with sagging wires.
- **Chunks (chunkgen.js, worldworker.js, life.js).** 400 m chunks built in a worker: four merged buffers (solid near,
  solid far, ground overlay near, ground overlay far; 18 bytes a vertex), one draw call each. Near within ~520 m, far to
  the jet's view (capped 2.3 km), at most two in flight, nearest first. Ground overlays (roads, fields, squares) use a
  polygon offset, sit on the terrain as drawn (the 4 m lattice, bilinear), and lift a little with distance so the
  coarser far terrain doesn't swallow them. The zone villages are built at start (fog-of-war patched materials).
- **Faction structures (structures.js; ships.js buildStructure delegates for hq / factory / fuel / radar).** 1980: HQ
  bunker in an earth berm (concrete face, blast door, prefab hut, guyed mast, whips, flag), fuel farm (three bunded
  tanks with ladders, pipes, pump house, a nodding pumpjack), depot (two quonsets, workshop with stove pipe, crates),
  radar site (AN/TPS-43-style planar array turning on its trailer, radome, shelters on M35s). Military clutter (jeeps,
  M35s, camo nets, sandbags, generators, floodlights) while we hold it; Land Rover, notice board and flower tubs while
  it is neutral. RUNAWAY: command node (leaning ceramic monolith, sensor head, fins), siphon spire with spherical tanks,
  fabricator (maw, sliding gantry arm, vents), sensor spire (tripod, rotating ring array, crystal tip); pale cyan seams.
  When the machines take a site their structure grows out of the 1980 ruin (9 s, sparks, seams blazing) and RW power
  pylons go up across the island one by one; when we take it back the machine goes dark and stays as shards round the
  1980 site, and half the pylons topple. Damaged below 50 % hp (smoke that keeps going, scorch, mast blown over, flag
  gone, seams flickering); destroyed = the structure's own ruin (no generic rubble). Dressing: helipad windsock (turns
  to fx.wind, droops in a calm), edge lights, ops shack; a collar over each cave shaft (RUNAWAY ring and leaning pylons /
  our sandbag ring and floodlights) replacing main.js's placeholder blocks.
- **Ambient life (ambient.js).** Civilians (instanced, walk cycle in the vertex shader, shirts from the instance colour)
  walk the verges, go in and out of front doors, and run for their doors at any explosion within ~160-200 m (and stay
  in a minute). Traffic: saloons, hatchbacks, estates, VW-style vans, pickups, lorries, tractors (on dirt), country
  buses; keeping right, slowing for bends (2.6 m/s² lateral) and the car in front, carrying on at road ends and turning
  off at junctions, turning round and leaving when a battle is near, burning out when a shell lands next to them. Moored
  dinghies and crabbers bob at the piers; trawlers work the fishing grounds offshore (six more in the zone, kept to deep
  water by the nav grid) with gulls following; cows and sheep in the pastures; up to eight chimneys lit near the camera.
  A village on a machine-held island is deserted (no people, no smoke, no traffic).
- **Interfaces for vehicles and AI** (net.js; also on the world object): `roadAt(x, z)` -> { surface 'tarmac'|'dirt',
  type, kind, bridge, y, road, s, heading, dist, hw } or null; `roadGraph(x, z, r)` -> { roads: [{ id, type, surface,
  kind, hw, xs, ys, zs, br (bridge per segment), s (arc length), len, junctions: [{ s, road, end }], a, b }], nodes:
  [{ id, x, y, z, roads: [{ road, end }] }] }; `roadPoint(R, s, lateral)` -> { x, y, z, dx, dz, grade, bridge };
  `nearestRoad(x, z, maxD)`. Bridge decks are NOT in groundY: a wheeled vehicle must use roadAt(x, z).y on a bridge.
  Traffic models are swappable: `world.traffic.setModel(kind, { geometry, length })` (instanced; an optional aPaint
  vertex attribute marks the paint) or `{ object, length }` (cloned per car); kinds saloon, hatch, estate, van, pickup,
  truck, tractor, bus.
- **Hooks.** main.js (4 lines marked WORLD): import, createWorldLife after createWar, world.update after
  updateCamsAndMeshes, clearedAt() keeps the zone trees off the villages. war.js: structAngle (HQ / production slots
  seeded per island, were random), ud.attach / setSide / onHp / setState / tick when present, dead faction structures
  stay visible as their ruin, fronts face the pad and sit on a cardinal direction between the AA slots on the diagonals.
  terrainworker.js: far bake on rawH, forest trees skip clearedAt(). ships.js: delegate.
- **Numbers.** worldbench (9 km square 3.6 km east of the zone): 18 settlements, 26 farms / 89 fields, 125 km of road,
  7 bridges, steepest grade 14 %; a new cell costs 10-20 ms on the main thread (the first, cold, ~240 ms; prewarmed only
  near the wild lands); a 2 km x 4 m terrain bake 54 ms with roads vs 43 raw; chunk build in the worker 5-50 ms; a town
  chunk ~12k near tris; world main-thread cost 0.1-0.4 ms a frame. worldperf A/B (same run, load average ~70 on the
  shared box): deck 10.8 -> 9.9 fps, 151 -> 165 calls, 139k -> 147k tris; over a town 6.9 -> 6.5 fps, 106 -> 134 calls,
  294k -> 327k tris (most of those are the forest). Jet at 300 m over the zone: +34 calls, +9k tris.
- **Gotchas.** Every ground overlay quad faced down at first (faceW / upW now wind quads by direction); the ES-module
  cycle world.js <-> net.js <-> layout.js needs lazy references (a top-level `{ hf: ground0 }` hit the TDZ); a piped
  write cut short by process.exit; a trailing // comment swallowed the rest of a line again (worldperf caught it).
- **Untested / next.** Wheeled vehicles driving on the roads (roadAt for the surface and bridge decks); AI ground units
  on the road graph; civilians react to explosions and impacts only (not aircraft overhead); no night lighting; the
  zone villages are small (the islands are steep and mostly base). A Huey NaN was seen once at the very start of a run
  at load average ~70, with and without the world (not reproduced).
## 2026-10-23 — NGC-1980 wave 2: SEAWORLD (the live sea, the lifts, solid villages, RUNAWAY ship mounts; ngc/seaworld2)
Files: game/js/units/naval/seasurface.js (GLSL + uniforms), seaweather.js, game/js/world/solid.js, tools/seabench.mjs,
tools/worldsolidbench.mjs, tools/scenes/seaworld.mjs. Changed: seamotion.js, navalfx.js, albatross.js, defence/
(models, brain, tune), ground.js, platform.js, world/life.js (zone roads kept), main.js, war.js, index.html, jetplay.js.
- **One live sea.** seamotion.js: makeSea takes a fractional sea state (Hs, Tp interpolated between the NATO rows) and
  keeps each component's random draws, so retuneSea() moves the same sea to another state without the waves jumping
  (integer states give exactly the old numbers: navalbench 22/22 unchanged). advanceSea() is the sea's clock (main.js
  calls war.tickSea every frame but in the pause menu, the title screen too). The surface is drawn at the ALBATROSS's
  0.44 scale in height AND wavelength (steepness stays real) with the real periods; then k_game U_game = k U_real, so a
  carrier's encounter frequency is exactly its motion model's, and each ship now reads its phases off the surface at its
  position (step(.., x, z)): the ships ride the waves you see (seabench: position phases == encounter integration to
  1e-12 over 60 s; a ship at rest heaves with the drawn surface, r = 0.70; the waterplane averaging takes the rest).
- **The surface** (seasurface.js, plugged into main.js's terrain shader where the ground is below sea level): the 14
  wave components displace the sea VERTICES and give the slope per vertex (no per-pixel wave sums); a grid only carries
  waves longer than 5 cells (the 24 m far ring shows the long swell only, never aliasing; the jet's long view works);
  waves die out over the last metres of depth (the coast stays put). Fragment: the swell's normal shades and Fresnels,
  a separate mostly-ripple "glitter" normal with a sparkle mask carries the sun (a glint on whole wave faces looked like
  white blobs), whitecaps on the crests (coverage per state roughly Monahan's W(U) for the state's wind, lifted at the
  low end: 0.4 % SS2 ... 26 % SS7), wind-aligned foam streaks at 6-7, surf whose band widens and pulses with the swell,
  foam round each of the six nearest ships' waterline (thicker at the bow and with speed; parts.waterline per hull), a
  darker greyer sea when rough. The wake ribbons ride the waves (navalfx seaY).
- **SEA STATE slider and WEATHER DRIFT** in the pause menu (all three variants), remembered per browser (tz_sea,
  tz_seadrift); ?sea= wins and leaves the drift off unless ?seadrift. Drift (seaweather.js): a new target every 3-7 min
  within +-2 of your choice, at most one state per 4 min, the main direction veers up to 25 deg, a feed line when the
  rounded state changes ("WEATHER: THE SEA IS GETTING UP - SEA STATE 5 ROUGH"). Over 4 h: 2.4 .. 4.9 round SS4.
- **ALBATROSS deck-edge lifts.** The three ELEVATORS are now platforms OUTBOARD of the deck edge (real Midway /
  Forrestal practice; the old ones were painted inside the deck), 9 m x 13-14 m, flush with the flight deck when up,
  down at the hangar-deck door (y 4.25) when lowered, 0.42 m/s; railings, guide posts, a sill, hazard strips on the deck
  edge, a console forward of each with a lamp that flashes amber while it moves. U at a console (or standing / parked on
  the lift) runs it, on foot or in a vehicle (before the craft's key: foot / vehicles swallow U). A Hornet is spotted on
  lift 1 (lengthwise; real-size aircraft overhang a 0.44-scale lift as they do). The forward port Sea Sparrow sponson moved
  to z -20.5 (it sat where the port lift goes). platform.js subY: whoever stands on a lift goes up and down with it.
- **Parked aircraft are solid.** heightField() rasterises the baked geometry (edges + covered cell centres, 0.5 m) into
  a plan of tops; the ALBATROSS's localDeck includes them (and the lifts), so war.js deckY sees them: the Hornet's hull
  points / gear (airframe.js) and the Huey's skids meet them, walkers and vehicles find a wall (GR.floor). Deck spots for
  vehicles must be clear (a car footprint); spare spots port-side forward and aft of the island.
- **The world is solid** (world/solid.js, through new ground.js hooks GR.addColliderSource / GR.addFloor and the existing
  addSurface): houses, cottages, terraces, halls, the church (nave, porch, chancel, tower, churchyard wall), filling
  station kiosk and canopy posts, barns, Dutch-barn posts, silos, boat sheds, garages, sheds, lighthouses + keeper's
  cottage, masts + huts, phone / post boxes, bus shelters, memorials, parked cars, tractors, wood piles, garden trees,
  power poles, field walls and hedges (segment by segment with the same gate gap chunkgen leaves), bridge parapets.
  Walls / hedges are `soft` (o.crush in GR.collide skips them: for the tanks). Piers and jetties (deck + T head) and
  BRIDGE DECKS (roadAt().y + the ribbon lift) are floors for anyone at or above them; underneath you are under them.
  Roads are 'road' / 'dirt' surfaces (new SURF.dirt: mu 0.65, crr 0.04, INFERRED Wong). Built per 400 m chunk from the
  same seeded generators the worker draws (chunkContent / zone items), 27 ms for a town chunk, once, in a 16 m grid.
- **RUNAWAY ship mounts** (DEFENCE, game level): defence.refitShip(parts) replaces the RAM launchers and RW lasers on
  NAVAL's parts.mounts: KRAKEN 2 TALON modules (on a deck pedestal: buildTalon(side, { mount: true })) + 2 LANCE,
  LEVIATHAN TALONs forward / LANCEs aft, the container ship a TALON on the forecastle. DEF.talonm / lancem: hp 9 (the
  old ship guns), the ship LANCE's beam a little weaker (dps 2.6, player 0.2). The units behave exactly as on the islands
  (see, lock with tells, fire); the brain's LANCE checks now go by T.beam, not the type name.
- **Authentic sea states (polish).** Each state looks like its WMO code 3700 / Douglas description and the Beaufort
  wind that raises it: 0 a mirror with one hard sun glint, 1 ripples, 2 glassy wavelets that never break, 3 scattered
  white horses, 4 fairly frequent, 5 many, 6 foam crests everywhere and the first streaks, 7 well-marked streaks along
  the wind. Whitecap coverage per state from Monahan and O'Muircheartaigh's W = 3.84e-6 U^3.41 for the state's Beaufort
  wind (0.06 % at Bf 3 to 8 % at Bf 8), about 3x so it reads at game distances; the shader's foam threshold is that
  coverage turned into a noise quantile (an inverse-normal fit), so the coverage is what the table says, not a guess.
  The sun's glitter is a fine sparkle (it lit whole wave faces in white patches before).
- **The black dome on the horizon (root cause).** The sky dome (radius 0.97 x the draw distance) and the terrain windows
  were centred on zCam in updateCamsAndMeshes. Any camera moved after that - every test scene's scripted camera patches
  renderer.render to move the camera - sat off-centre, the far side of the dome fell beyond the far plane (draw + 15 m)
  and was clipped, and the black clear colour showed as a dome above the horizon (the terrain grid also ended short).
  Now sky, fine grid and far ring are centred on the rendering camera in their onBeforeRender. seaworld 'horizon' part:
  deck and 600 m, chase and cockpit, two scripted cameras: < 0.2 % pure black above the horizon (without the fix the
  high scripted camera shows 100 %).
- **Cost.** Software WebGL pays per pixel: the first version's per-pixel six-ship hull-foam loop cost ~25 % of a frame over
  the sea; the foam is now found per vertex (the pixel only adds the noise), the noise for whitecaps / streaks / glint
  only runs where it can show, and the GPU draws the 8 largest of the 14 components.
- **Names** (HUD, feed, advisor, map, title help, the Hornet's target box): LEVIATHAN, CONTAINER SHIP, SEA KNIGHT,
  MV-22 OSPREY, RW-3 WASP, TOMCAT ESCORT; the map legend lists the ships.
- **Tests.** seabench 15/15, worldsolidbench 9/9, navalbench 22/22, footbench, boxcarbench pass. seaworld.mjs 25/25
  (lift: soldier and Hornet ride it down and up, the hull is a wall from below, a parked Hornet stops a walker; the
  horizon from six views; a village
  house wall stops a walker; a wild-lands bridge is crossed on its deck 12 m over the valley; the KRAKEN's TALON and
  LANCE mounts lock and fire; SS 1 / 4 / 7 from the deck, 100 m and a Hornet at 600 m). Regression results and fps in
  the branch report.
- **Gotchas.** A trailing `//` comment inside a scene's eval swallowed the rest of the expression again (the page then
  sat in a never-ending evaluate); `out` is a GLSL keyword; the deck stops at 0.985 of its half width, so a soldier walked
  off the lift through a 0.2 m seam into the sea (the lift's footprint reaches 0.3 m inboard); deck-relative heights in
  tests must use deckY (the ships really move now).
- **Untested / next.** Swimmers and wading soldiers still float at y = 0 (the waves pass through them: GR could offer
  W.seaY); fx splashes / rotor-wash rings sit at y = 0; the KRAKEN's own elevators and the parked RW drones are not solid
  yet; the hangar itself is not modelled (the lift stops at its door); LANCE / TALON balance on ships against a real
  player in a war (driven directly in the test); wheeled / tracked vehicles over bridges (the floor hook is generic, only
  a walker was tested); whether the weather feed lines are too chatty (one per state change, ~6 min apart).
## 2026-10-23 — NGC-1980: the C-130H / KC-130R Hercules replaces the MULE 1 dropship (para-drop)
Files: game/js/units/air/c130fm.js (flight model, pure), c130model.js (exterior), c130cockpit.js (flight deck),
c130audio.js (sound), jumper.js (1980 paratrooper + MC1-1); drop.js rewritten for them; ships.js buildDropship /
buildJumper now delegate (same contract plus rig / canopyAnim); tools/c130bench.mjs; game/dev/c130.html (+ c130.js),
game/dev/c130-model.html; scenes c130.mjs, c130model.mjs. fixedwing.js is no longer used (kept, unreferenced).
- Decision, markings: a USMC KC-130R of VMGR-352 (tail code QB), 1980 gloss light gull grey with a white top, MARINES,
  star-and-bar, BuNo 160021 (a KC-130R-range number used for flavour, not checked against a real airframe), pylon tanks
  and refuelling pods. The Marines' own Hercules flying a Marine stick fits the carrier task force and the bible's
  Marine infantry; the KC-130R is a C-130H airframe, so the C-130H data applies (it has T56-A-16s, same rating).
- World scale (as the Hornet): air at 4x sea-level density, so forces, g and IAS are real and true speeds half
  (K_EQ = 2). The props, the slipstream and the rotary damping run in the real-equivalent frame (real density
  1.225 sigma, real TAS 2x world), so blade angles, prop thrust, roll rate and short-period damping match the real
  aeroplane at the same IAS. Heights are not scaled: a climb gradient is real, so a world vertical speed is half the
  real one; ground-run distances are a quarter (same forces, half the speed), the airborne part of a take-off is not
  scaled. The bench converts all of this; the cockpit instruments show the world (IAS real, VSI and altimeter honest).
- Flight model: 6DOF rigid body, C-130 mass / inertia (Roskam radii), lift curve with soft stall, flaps raising CL0
  and CLmax, slipstream lift from the thrust coefficient (blown wing: power-on stall ~6 % lower, a dead engine rolls the
  aeroplane towards it), drag polar + flaps / gear / ramp / para doors, stability derivatives that fade past the stall
  (buffet, nose drop, a wing drop of ~10-20 deg), tricycle gear with tandem mains, tiller, anti-skid brakes, hull points.
- Engines and props: each a shaft (J 260 kg m2) between T56 torque and the prop's blade-element torque (3 stations,
  momentum inflow by bisection, tip loss, helical-Mach drag rise). ALPHA range: fuel from the lever, the governor holds
  100 % by blade angle (with throttle anticipation), low pitch stop 23 deg; BETA range (ground): blade angle from the
  lever down to -6.5 deg reverse, the fuel governor holds rpm; flight idle gate in the air. Condition levers RUN /
  GND STOP / AIR START / FEATHER, feathering 92.5 deg, NTS (coarsens a prop driving its dead engine past -1,260 in-lb),
  autofeather, air starts and ground starts, TIT, torque (in-lb), fuel flow. Overtorque is possible (lever full forward
  at sea level reads ~21,000 in-lb, as on the real aircraft; the autopilot and the crew stay under 19,000).
- Autopilot: heading by bank, height by pitch on a vertical-speed loop with auto-trim, speed by the four levers
  (torque-limited), FLC climbs, rudder for sideslip and engine out; it keeps under the flap and para door limits.
- tools/c130bench.mjs: 38 checks, all pass. Highlights vs published (CONFIRMED unless noted): max speed 318 KTAS at
  20,000 ft (320, Wikipedia spec box); cruise at TIT 1010 C 295 KTAS (292); climb 1,676 fpm at 155,000 lb climb power
  (1,830); Vs clean 155,000 lb 116 KIAS (~115 INFERRED from the ops card: 180 KIAS = power-off stall + 65); Vs 100 %
  flaps 122,000 lb 87 KIAS (81-88 INFERRED from the 105 KIAS landing speed); Vs 50 % 96 KIAS (UNVERIFIED); take-off run
  3,260 ft at 155,000 lb (3,586); to 50 ft ~4,000 ft (~5,160 Jane's, from memory: UNVERIFIED); 130 KIAS drop run with
  50 % flaps trims at +1 deg AoA, ~5,400 in-lb; governor holds 98-102 % through a slam; NTS, feathering in ~4 s,
  three-engine flight, Vmca ~88 KIAS (UNVERIFIED), air start, static thrust 65 kN at 19,600 in-lb (INFERRED),
  reverse, roll 30 deg in 2.2 s at 130 KIAS (MIL-F-8785C class III guide, UNVERIFIED), landing roll ~800 ft with max
  reverse + max braking (short: UNVERIFIED). Sources: Wikipedia C-130H spec box (USAF fact sheet, Frawley, Donald, Eden),
  baseops.net C-130H ops limits card (T.O. 1C-130H-1: torque, TIT, rpm, blade angles, airspeed limits, quadrant
  angles, weights), FM 3-21.38 (130-135 KIAS personnel drops), Lockheed Service News v26n3 (54H60).
- Model: real span / length / height (scene asserts them), deep T56 nacelles, props that spin with blade angle and
  feather, blur discs with the yellow tip ring, Fowler flaps (aft + down), ailerons, elevators, rudder, tandem mains
  that retract straight up into the sponsons, steerable nose gear, ramp and upper cargo door lofted from the hole they
  fill, plug para doors that slide up inside, air deflectors and jump platforms, jump lights, the hold (red troop
  seats), crew in the windows. Wear in vertex colours (no textures): faded / touched-up panels, exhaust soot over the
  wing behind each nacelle, grimy belly, oil streaks.
- Flight deck: pilot / copilot flight instruments (ASI, ADI, altimeter, radar altimeter, HSI with a DZ course arrow
  and DME, VSI, turn and slip, clock, g meter), the centre engine stack (TORQUE / TIT / RPM / FUEL FLOW x4), flaps, fuel,
  hydraulics, glare shield master caution + 12 caution lights + jump light repeaters + AP; pedestal with the four power
  levers (flight idle gate), flap lever, trim wheel and tab indicator, autopilot; overhead condition levers, fire
  T-handles, starts, autofeather; a paratroop panel left of the pilot (jump lights OFF / RED / GREEN, alarm bell,
  para doors, ramp: in reality the loadmaster works doors and ramp - a game liberty). Yokes and pedals move; copilot
  and flight engineer in their seats. Clickable like the Huey / Hornet (hit boxes, yellow hover frame, label in the
  hint line); drop.js listens itself (capture-phase mousedown), no main.js change.
- The drop: entry 1.4 km out at 150 KIAS / ~750 ft on a jump run: a straight line through the release point (CARP,
  where an unsteered jumper leaving at 130 KIAS lands on the helicopter, throw + drift computed like the predictor),
  flown with a line-following autopilot (crabbing into the wind); the crew drops 50 % flaps, slows to 130 KIAS and
  descends to ~550 ft AGL; red light inside 1 km (the loadmaster opens both para doors, a man stands in each), green
  when the predicted landing point comes abeam the helicopter within 90 m (they steer the rest); jumps only above
  400 ft and below 150 KIAS. An overshoot without the stick out flies a go-around: out past the start of the run,
  480 m to the side, so the 180 deg turn rolls out on the line.
  F (or the switch) turns the green on; the jumpmaster sends them alternately from the two doors, 0.6 s apart. Wind 1.5-4.5 m/s (inside the 13 kt training limit). Static line: canopy out
  at ~2 s, open at 3.5 s; MC1-1 drive 4.1 m/s, descent 5.5 m/s, 360 in 9 s (real air for the canopies: the 4x density
  is a trick for the aeroplanes), S = rear-riser slip, a hands-off jumper turns into the wind under 30 m; landing faster
  than 7 m/s over the ground is a hard landing. Flak hits damage engines (fire: pull the handle; the crew feathers a
  dead engine on autopilot).
- Sound: four props' blade-passage tone (68 Hz at 100 %) with harmonics growing with torque, detuned a hair so they
  beat (the Herc throb), T56 whine and howl, exhaust roar, wind; muffled on the flight deck, distance / air absorption
  and Doppler outside; gains fall to zero by themselves when update() stops (pause).
- Gotchas: a raycast for cockpit hover must update the camera matrix first (the aeroplane moves ~0.8 m a frame, the
  switches are 0.9 m away); vertex-colour materials on meshes without a color attribute render black; the BETA fuel
  governor needs to go to zero power or ground idle overspeeds; the overhead panel's text "up" must point aft (you read
  it with your head tipped back); a ramp that rotates the wrong way hides inside the hold; the first prop iteration
  (fixed-point inflow) found a different branch at static, bisection fixed it; flaps out at 195 KIAS when the crew
  extended them before the autopilot slowed down (the AP now respects the flap / door limits).
- Tests (headless, all pass on the last runs): node tools/c130bench.mjs 38/38; scenes drop.json 5/5, dropflak.json,
  rescue.json, smoke.json 5/5, c130.mjs 5/5 (deck views, hover + real mouse click on condition lever 1 -> feathered,
  autopilot height hold, drop-run autopilot red -> green, take-off), c130model.mjs (dimensions, wheel line).
  drop.json's manual-flight check and rescue.json were flaky on the way (an autopilot weaving on the line, a red light
  while still turning in, the helicopter's trimmed stick read as input): fixed, but they run at ~10 fps headless.
- Untested: the sound (headless has no audio), a real HOTAS on the Hercules, an engine fire from real flak (the code
  path runs only on hits; the bail-out path is tested), the ground start sequence in the game (bench only), landing
  the Hercules in the game (the dev page and the bench do it).
- Next: a proper loadmaster figure and cargo-hold view (ramp jumps / heavy drops), CDS bundles for the repair kit,
  the INFANTRY agent's soldier swapped in for buildParatrooper, an engine-out checklist voice from the crew.
- Fix after the FOUNDATION merge (branch ngc/dropfix): drop.json's "roll with D, the plane banks" check failed 1/5.
  Not the input routing: the keys reach HI.read and drop.update unchanged (logged per frame: KEYBOARD source, cx ramps
  to 1, the autopilot drops out, the roll command reaches 0.7). The merged game runs ~8 fps headless instead of ~10-19,
  the frame step is capped at 0.1 s, so the scene's 1 s wall-clock key hold gave only ~0.7 s of flight (7 frames, two
  of them spent on the keyboard ramp) and bank grows roughly with t squared from rest: 0.05-0.09 instead of > 0.1. The
  same probe against the ngc/c130 build in the same session: 10 fps, 10 frames, bank 0.11. The scene now holds D and
  waits for the hands-off recovery in game time (drop.state.t: 1 s and 2.5 s) instead of wall time; no game code
  changed. Seen once: a jumper landed in the water (fuel 20, expect > 20) - drop scatter, not this bug.

## 2026-10-23 — NGC-1980 wave 2: THE 1980 MARINE in the game (branch ngc/foot2)
On-foot play is now INFANTRY's rifleman with MEDINV's medical and inventory, on FOUNDATION's craft. Get out of the Huey,
a vehicle or the Hornet on deck and you are an M16A1 rifleman of 1980 with the inventory's rifleman kit.
- **marinesim.js (pure, node-benched)** joins three wave-1 cores: the rifleman (soldier.js body: inertia, stances,
  Pandolf / ACSM stamina, sway, recoil, ADS, lean; weapons; projectiles; hit registration), MEDINV's medical sim and
  rig, and FOUNDATION's walker (footsim.js) for the world. Each 1/120 s step: the deck carries the walker and the
  soldier's view turns with the ship; the soldier decides his deck-relative velocity; the walker resolves it against
  walls, steps, ladders, the sea and decks (footsim `intent.vel`, new); what the world allowed goes back into the
  soldier. Medical runs at 10 Hz and feeds soldier.js modifiers (legs / arms / pain / blood loss / shock / tremor /
  unconscious), sprint and weapon-use limits. Falls go to `M.fall`.
- **invbridge.js (pure)**: the rifleman's magazine items are VIEWS of inventory instances (`rounds` reads / pops the
  LIFO round segments: MEDINV's tracers-last loading feeds the tracer round to ballistics), so the inventory is his
  magazine source and his load (`totalKg`, minus the guns the rifleman counts itself). Each step reconciles the gun's
  magazine with the weapon item's mag slot both ways (a reload seats the new magazine in the M16 item; a magazine
  dragged onto the rifle on the gear screen feeds the gun), weapons added / removed on the gear screen, the fired LAW
  leaves the rig. `resupply()` refills magazines (two tracers last), replaces missing ones and the LAW, restocks the
  dressing and cravat.
- **marine.js (game side)**: keys / mouse (LMB fire, RMB sights, wheel weapons) / gamepad; the world for his rounds
  (raycast: terrain, sea, decks / hulls / islands via the ground host, island buildings and AA guns, tree trunks (new
  `GR.treeHit`), war.js units as spheres or their own `u.hitRay`, ship gun mounts, crafts' footprints as thin skins,
  soldier figures by soldiermodel hitboxes); GAME damage to war units (M193 0.22, M80 0.35 war units: ~14 rounds for a
  gunship, buildings and hulls barely scratched); M433 / M72 explosions -> `war.blast`. Incoming fire -> MEDINV hit-info:
  the WASP's bolts ('b': dmg 50 pen 34), CIWS / 20 mm ('ciws' / 'jb': dmg 95 pen 55) on the body part under the round's
  closest point (`hitZone`), flak / blasts / shells / missiles as `fragmentHits` (closer = more), the LANCE laser as a
  burn. The viewmodel in its own pass after the world (`foot.overlay`, main.js), the 17-bone Marine for third person,
  figures and bodies; tracers, impacts, muzzle light; InfantryAudio on the game's AudioContext (own shots, impacts,
  cracks of enemy rounds passing within 6 m, footsteps by surface, breathing, heartbeat).
- **Screens**: Tab / I = GEAR, H = HEALTH (MEDINV's invui / medui; pointer lock released; movement and fire blocked
  while open; what is dragged to GROUND becomes a pile at his feet). The medical HUD strip, vision effects (tunnel,
  grey, blur, blackout) and a red hit vignette on the HUD.
- **World**: an ammunition crate and a medical chest on the ALBATROSS deck forward of the island, one more aft, one by
  every island pad (RUNAWAY caches on enemy islands); they ride the ship. F searches the nearest crate / pile / body;
  F on a friendly pad or the carrier deck rearms. Speed-reload magazines fall into a pile at his feet. RUNAWAY trooper
  figures (`marine.addFigure`, a start for the ground-war agent): hit twice (once in head or chest) they go down and
  their seized kit is lootable. G throws an M67 from the rig (14 m/s, 4.5 s fuse, bounces): MEDINV fragments for anyone near
  (him too), war.blast for war units.
- **Life**: bleeding out (or any medical death) ends the life with the game's rules (lives - 1, a new crew in the Huey
  after 3.5 s). His body stays where he fell (on a deck it rides the ship) with his kit. The next Marine out is fresh;
  getting in and out of crafts keeps the same man (kit and wounds).
- **FOUNDATION fixes**: platform.js carries with the FULL ship frame (heave, pitch, roll, the sky carrier's climb), not
  position + yaw; ladders in the full frame. The ALBATROSS island in ground.js is now NAVAL's model: level boxes in the
  ship frame (O-3..O-7, bridge, pri-fly, funnel, mast, top-deck rails; colliders lean with the roll), a walkable top
  deck 13.33 m above the flight deck (`GR.deckH` replaces war.deckY's 17 m block there), the island ladder moved
  forward of the bridge wing on the port face; KRAKEN's island collider to its model; the island ladder only on the
  ALBATROSS (it was drawn on the KRAKEN too). H.reset on a stowed Huey unstows it (infinite.mjs: a teleported Huey was
  not simulated and the deck crew re-spotted it on the carrier). naval.mjs follows the Y-out-of-the-jet flow.
- **Shared files**: main.js (import, `foot.setMarine(createMarine(...))`, `foot.overlay` after the world render,
  hurtPlayer passes `kind`, no crosshair for the Marine, the H.reset wrapper, `__G.marine`), war.js (hurtPlayer gets the
  projectile kind / hit point at the bullet, flak, blast and SHRIKE cannon calls), foot.js (`setMarine` and its
  delegations, `F.overlay`, `hurt(.., kind)`), footsim.js (`intent.vel`), ground.js, platform.js, invui.js (label
  polish), index.html (help line), README.
- **Polish (MEDINV report)**: item labels in small grid cells: a dark backing behind name and count, one-cell items
  wrap the name onto two tight lines instead of clipping, counts never wrap; the in-game gear screen uses 40 px cells.
- **Tests**: `node tools/marinebench.mjs` 24 checks (walk 1.53 / run 2.70 m/s with 20 kg; a wall stops him; prone;
  0.000 m slip standing on a deck that sails, turns, climbs, heaves, pitches and rolls; walks straight along a rolling
  deck; rounds come out of the inventory magazine; tactical reload seats a pouch magazine and stows the old one, rounds
  conserved; a gear-screen magazine feeds the gun; fired dry then resupplied; the LAW fired and gone from the rig;
  5 / 5 aimed rounds on a plate at 100 m; a thigh wound bleeds; untreated femoral: dead of blood loss in ~6 min;
  cravat windlass tourniquet stops it). Scenes: `foot.mjs` 12/12, `marine.mjs` 15/15, `marinelife.mjs` 10/10,
  `naval.mjs` 5/5, `infinite.mjs` 5/5 (+ notblank), `jettrap.mjs` 7/7.
- **Gotchas**: the viewmodel's springs are explicit Euler: at headless frame rates (dt 0.1 s) they blew up and the
  arms vanished off screen - stepped at <= 1/60 s now; the soldier toggles crouch / prone on every repeated stance
  request (one-shots only); a measurement taken before the frame's carry reads one frame of ship motion as slip; the
  semi-auto M16 needs trigger releases (holding fire is one shot); a bandolier is loose rounds, not magazines.
- **Untested / next**: real mouse / pointer lock feel and the gamepad map on hardware; buddy aid (MEDINV's BUDDY API is
  ready: the CH-46 squad could treat you); AI soldiers using createRifleman (the figures are static targets now); the
  medical sim pauses while you ride a craft; enemy small-arms fire from RUNAWAY ground units arrives once the ground-war
  agent's units shoot `'b'` / their own kinds through hurtPlayer; grenades are thrown straight off the rig (no cooking, no throw animation in the viewmodel).

## 2026-10-23 — NGC-1980: the F-14A TOMCAT, flyable (branch ngc/tomcat)
The AI escorts' Tomcat (units/air/tomcatfm.js on the parametric airframe) as a player craft at the HORNET's level.
- **Getting one**: in the helicopter on the ALBATROSS deck press **8** (command 5 is still the HORNET): an F-14A on cat 1,
  engines turning, tanks from the fleet stores, the 1980 CAP fit (2 AIM-9, 2 AIM-54, 2 AIM-7, 675 rounds). Two in the
  hangar (`G.tomcats`, top-left TOMCATS line, pause menu), a new one 100 materiel. 8 again on deck: back to the cat.
  Y on deck climbs out (it stays parked and rides the deck; Y at the boarding ladder, left side, climbs back in, either
  seat). Command 4 (AI escorts, cat 2) is unchanged.
- **Files**: crafttomcat.js (the craft adapter, like craftjet.js), units/air/tomcatplay.js (input, systems, weapons,
  warnings, ejection, cameras), tomcatsys.js (pure: wing sweep controls, AFCS, start air), tomcatcockpit.js (both
  cockpits), gaugekit.js (steam-gauge helpers), tomcatdamage.js, tomcatsound.js; game/dev/tomcat.html (cockpit / model
  preview driven by sliders); tools/tomcatsysbench.mjs; scenes tomcat.mjs, tomcatcockpit.mjs, tomcatdev.mjs.
- **Cockpit (1980, analog)**. Pilot: AVG-12 HUD (conformal ladder every 5°, dashed below the horizon, velocity vector,
  the "W" waterline, heading scale, IAS / altitude boxes, Mach, g; modes T.O. / CRUISE / A/A / A/G / LDG auto-selected by
  phase or by the panel buttons; LDG: the AoA E-bracket and ICLS needles; A/A: Sidewinder seeker circle, Sparrow /
  Phoenix ASE circle with steering dot, target diamond, gun pipper with range bar, SHOOT). VDI (green contact-analog
  horizon with a perspective ground grid, pitch lines, bank scale, heading strip, ICLS on approach) and HSD (compass rose,
  TACAN needle and DME to the ALBATROSS, the selected island as the waypoint, ground track; or a TID repeat). Steam
  gauges: AoA tape in units (15 = on speed, units = deg x 1.43, INFERRED from 10.5° = 15 u), airspeed with a Mach
  window, counter-pointer altimeter, VSI, standby ADI, accelerometer with tell-tales, wing sweep indicator (position
  needle, command bug, AUTO / MAN / EMER / OVER / STUCK window), flap / slat, TF30 RPM / TIT / FF / nozzle pairs, oil,
  fuel (feed tapes, totaliser, BINGO), clock, ALR-45 threat scope, gear indicator with barber poles; MASTER CAUTION,
  WHEELS, ALT LOW, LAUNCH, SWEEP, HOOK, ACM lights, L / R FIRE push-lights on the coaming, the AoA indexer, a 24-caption
  caution / advisory panel on the right vertical console. Clickable: gear, hook, flaps, master arm, weapon select, HUD
  modes, HSD mode, FIRE, ACM jettison, master caution, engine crank L / R, the throttle's sweep switch (FWD / AFT / AUTO),
  the emergency sweep handle (guard), SAS / autopilot / ALT, lights, canopy, parking brake, the face curtain and lower
  ejection handle. Stick, two throttles (MIL and AB detents marked), pedals with toe brakes and pedal shaker move.
  RIO ([ / ]): DDD (pulse-doppler range / azimuth, STT gate), TID (tracks with numbers and velocity leaders, the hooked
  track's data, range 0.5-8.6 nm), RWR repeat, weapon type / STT / TWS / LAUNCH lights, standby ASI / altimeter / clock,
  side consoles (UHF, TACAN, IFF, data link, ECM, NAV), the hand control unit. In that seat the pilot (the AI's flight
  director) flies the heading / altitude / speed you set with A D W S Shift Ctrl.
- **Systems**: wing sweep AUTO (CADC program, the sim's), MAN (thumb switch, aft of the program only), EMER handle (any
  sweep 20-68°), OVERSWEEP 75° on deck only, flaps down bring the wings to 20°, a dead CADC freezes them (EMER still
  works), 15°/s or 7.5°/s on one hydraulic system. Pitch trim (; ' or the stick hat). AFCS: stab aug switch (off or shot
  out = the airframe's DIRECT), autopilot ATTITUDE HOLD with control stick steering and ALTITUDE HOLD (drops out past 70°
  bank, gear handle down, SAS loss: AUTO PILOT caution). TF30: crank needs air (deck start cart / cross-bleed /
  windmill above 225 KEAS); compressor stalls come from the sim (high AoA, sideslip, slams, slow AB light-offs) with a
  bang, the inlet caution, the HUD / hint cue; idle + nose down clears it, holding power flames it out. Keyboard stick:
  ramps, and the "hand" stops pulling past 6.5 g (the jet has no limiter; HOTAS gets the raw stick). Fuel 2x real burn
  (TCFG.FUEL_X, game), BINGO 3000 lb.
- **Warnings: 1980 tones and lights, no voice** (decided: the F-14A had no voice warning system; the HORNET keeps
  Betty): ALT LOW light + warbling radar-altimeter tone sinking below 60 m AGL; FIRE light + pulsed tone; MASTER CAUTION
  light + a two-note chime per new caption; the ALR-45 launch warble and LAUNCH light for a RUNAWAY missile closing;
  the rudder-pedal shaker from 20 units; the flashing WHEELS light (gear up, slow, low, descending) has no tone.
- **Weapons, game level** (BIBLE): M61 as war.js jet rounds, AIM-9 off the seeker lock, AIM-7 only with the STT lock
  (otherwise unguided), AIM-54 off any hooked TWS track; all war.fireMissile. Game ranges: SW 150-1100 m, SP 250-1700,
  PH 450-3600; AWG-9 at game scale 4 km, ±65°. No guidance laws or Pk modelling.
- **Damage** (tomcatdamage.js): L / R TF30 (fire + one bottle each, a damaged one stalls up to 3.4x as easily),
  hydraulics, SAS, CADC, fuel (leaks), avionics (HUD / CRTs / radar flicker), gear, hook, airframe. Ejection: canopy,
  RIO, then the pilot 0.4 s later; two chutes; rescue then back to the helicopter.
- **Shared-file changes**: main.js (TOMCAT-commented: import, `isJet()` replacing `G.craft === 'jet'` in the T / V /
  pad / draw-distance / menu paths, the tomcat cockpit in pickSwitch / click / wheel zoom / HUD visibility / g vignette,
  `jetPlayCtx` shared by both jets, the craft registration, command 8 + Digit8, hangar counts, stow / toHeli / newGame,
  debug bridge `tomcatC`); index.html (TOMCATS line); hotas.js (actions WING SWEEP FWD / AFT / AUTO, no default
  buttons). war.js, craft.js, craftjet.js, jetplay.js untouched.
- **Tests**: tomcatsysbench 32/32 (sweep modes, OVERSWEEP 75°, dead CADC, 3.2 / 6.3 s sweep times, ATT hold 0.04° /
  30 s, CSS hold < 1°, ALT hold 2 m in a 30° bank, disengage rules, start air, windmill airstart light-off 1.9 s, stall
  procedure, damage); jetbench 24/24, tomcatbench 32/32, airbench 28/28, jetfingerprint bit-identical.
  Scene tomcat.mjs: 8 -> cat, keyboard throttles to MIL, the shot, stick / gear / flaps by keys, climb, the wings
  sweeping with Mach (M 0.70 -> 26°, 0.80 -> 50°, 0.92 -> 61°: the CADC table), a 6.5 g turn (vapour), a double
  compressor stall at 140 kt full power + rudder (the jet departs; idle + nose down clears both), the RIO's TID / DDD with
  two SHRIKEs hooked and STT-locked, a 1-wire trap, Y out / Y in, oversweep on deck, a second launch and a two-seat
  ejection, back to the helicopter. tomcatcockpit.mjs: close-ups on the dev page.
- **Gotchas**: a scene that clears `carrier.path` before the launch holds the cat forever (the ship never turns into
  clear water); headless frame rates make wall-clock key holds unreliable (wait for state instead); events read by a test
  hook lag a frame; a box in front of a CRT plane by 3 mm hid the RIO's displays; assigning to a getter-only property
  throws in modules.
- **Untested**: real HOTAS hardware (sweep buttons, hat trim); sound by ear (headless is muted); long sessions of
  combat against SHRIKEs in the player's Tomcat; the sky carrier with a Tomcat on deck; flat spins after an asymmetric
  flame-out are possible in the sim but not exercised.
## 2026-10-23 — NGC-1980 wheeled vehicles (M151A2, M35A2, Land Rover 109, Hilux, Beetle, Lada 2101)
Branch ngc/wheeled. Files: game/js/units/wheeled/ (tyre.js, vehiclefm.js, driver.js, vehicledamage.js, m151.js, m35.js,
civilian.js, index.js, modelkit.js, m151model.js, m35model.js, civmodel.js, interior.js, wheeledaudio.js), dev test
ground game/dev/vehicle.html + vehicle.js + vehicle-ground.js, tools/wheeledbench.mjs, scenes wheeledmodel / wheeledcockpit
/ wheeleddrive / wheeledaudio. Not wired into main.js: FOUNDATION hooks it up (createWheeled, makeTerrainEnv).
Sources: TM 9-2320-218-10 (M151A2), TM 9-2320-209-10 (M35A2), AMG / Jane's tables, period road tests and factory data for
the civilians. Every bench row carries CONFIRMED / INFERRED / UNVERIFIED.
- Sim (pure, no THREE): Pacejka-style magic formula on normalised combined slip with transient deflection states,
  camber, load sensitivity, sliding-speed friction decay, sinkage and soil bulldozing, lateral plough (tripped rollovers);
  9 SURFACES. Quarter car per wheel (unsprung mass, strut state, compliant tyre), sprung body about its own CG, roll-centre
  jacking, camber / toe gain, ARBs, the M35's walking bogie. Drivetrain solved exactly as an LCP (clutch, gearbox,
  transfer high/low, part-time / sprag / full front drive, open or locked diffs, brakes, rolling resistance, park brake
  as friction rows). Engine: torque curve, idle control, governor, starter, stall, enrichment fuel use, drowned ignition,
  hydrolock; coolant, oil, battery, air brakes; fording, buoyancy, hull contacts, env.collide spheres, aero.
- Driver: auto (clutch launch controller, gears by road speed with 0.4 s up-shift hold, wheelspin feathering, hill
  start, arcade reverse = brake held at a stop), semi, manual. AI: aiInput (pure pursuit), createFollower (road traffic
  with bend / gap / end speed limits), createUnstick (stuck → back off 2 s → rush it again).
- Damage: rifle / hmg / cannon / frag hits and blasts on tyres (puncture, blowout, flat), engine, oil, coolant, fuel
  (leak → fire → wreck), battery, crew seats; events for the game layer. Wrecks seize (brakes on, engine locked).
- Bench: node tools/wheeledbench.mjs, 65/65. Selected rows:
  | item | model | reference |
  |---|---|---|
  | top speed M151 / M35 / Beetle / Lada | 106.6 / 85.4 / 116.9 / 146.2 km/h | 106 / 90 / 115 / 142 (TM, factory) |
  | gradeability M151 / M35 loaded | 60% climbed / 60% in 1L | TM 60% both CONFIRMED |
  | fording / with kit | M151 0.53 / 1.45 m; M35 0.76 / 1.74 m; drowns above intake | TM 21 / 60 in; 30 / 72 in |
  | M151 SSF / tilt table / roll gradient | 1.12 / 41° / 6.5°/g | ~1.1 class; < atan(SSF); 4-7°/g |
  | turning circle M151 / M35 / LR | 11.1 / 23.4 / 15.0 m | 10.9 / 21.9 / 14.3 m |
  | M151 stop 32 / 80 km/h | 6.8 m / 45.6 m | MIL service-brake class |
  | fuel M151 55 km/h / M35 50 km/h | 9.2 / 20.4 l/100 km (steady) | 13.3 / 34 mixed-use (range CONFIRMED) |
  | tuck-in (lift + brake in a turn) | curvature +23% | the M151's known lift-off oversteer |
  | trip order (sideways slide onto soil) | LR, M35 15 < Hilux 20 < M151 35 < Beetle, Lada 38 km/h | SSF order |
- Gotchas: (1) bump-stop impulses with a massless strut launched cars off steps → quarter car with a compliant tyre.
  (2) explicit gyroscopic term gained energy → integrate angular momentum. (3) a tyre probe crossing a sheer heightfield
  face (a kerb as a cliff) found 10 cm of penetration in one step and fired 3-5 g kicks, and against a face the whole
  vehicle mass sits behind the tyre spring so it bounced back elastically → tyre closure rate-limited by wheel speed,
  hysteresis on steep-normal contacts (FOUNDATION: terrain with real cliffs needs env.collide, not just height).
  (4) open diffs cross-axle: one spinning wheel per axle stops a 6x6; the AI now backs off and retries. (5) the dev
  page runs fixed 60 Hz steps (15 per frame max) so slow SwiftShader frames don't change the physics. (6) SwiftShader
  depth-fights long thin triangles: models are built from short segments. (7) winding a Land Rover to full lock at
  35 km/h rolls it (0.9 g demand vs SSF ~0.85) — correct, the scenes steer gently.
- Scenes (one browser at a time): wheeledmodel 6/6, wheeledcockpit 12/12, wheeleddrive 7/7, wheeledaudio 10/10,
  smoke 5/5. Perf: near LOD ~0.3 ms per vehicle per 60 Hz frame, far LOD ~0.09 ms.

## 2026-10-23 — NGC-1980 wave 2: THE GROUND WAR (branch ngc/rwwar)
The RUNAWAY ground forces and the CH-46's Marines fight on the islands. Files (new): `game/js/units/groundwar/`
groundsim.js (the battles as a pure simulation), groundwar.js (THREE + war glue), gwmap.js (per-island maps),
marine.js + marineai.js (the 1980 Marine and his squad), marinefigure.js (INFANTRY's soldier model through the rotary
FIGURES table), mbttrack.js (M1A2 / T-90M on trackfm + road routes), lcacmodel.js (seized LCAC);
`tools/groundwarbench.mjs`; scenes `groundwar.mjs`, `groundaisim.json`.
- **Architecture.** groundsim.js lifts runaway/sandbox.js's host loop into the archipelago, pure (node runs whole fights):
  one BATTLE per island (a progressively baked height grid, 2 m, a few rows a frame; a world query rebuilt behind a stable
  facade when its obstacles change; a RUNAWAY squad AI and a Marine squad AI over it), units (STRIDER / RW-7 / MBT sims,
  Marine bodies), game-level projectiles with swept hits through the hit-info contract, blasts, the outside world through
  hooks (`targetsFor`, `extSeg`, `extBlast`). groundwar.js does views, effects, sound, landings, squad proxies, the
  commander's ground plans and the LCAC.
- **Landings.** The rotary unload hook hands a transport over (`GW.landing`): each figure becomes a unit when it steps
  off the ramp (the CH-46's figures ARE the soldier-model Marines, re-parented; the Osprey's troopers become STRIDERs),
  in a squad with orders from the first man off (no one waits in the open). An Osprey carries its twelve-trooper payload
  as eight STRIDERs (two squads of four, the link node with the coil carbine). Hot islands: the transport's LZ moves to
  the flat ground farthest from the enemy (`GW.hotLZ`, re-checked in transit).
- **Squads in the war.** A 'squad' proxy per landed group stays in W.units (`ext`, `noHit`, `ground`): war.js capture
  (landed = two able men on the pad, or armour within 55 m of it, nobody of the other side within 70 m; 12 s for
  machines, 9 for Marines), WASP targets, expansion checks. When war.js marks a lander dead on capture, the proxy turns
  that into 'hold': the garrison stays and DEFENDS (and counter-attacks with 'take' if the island is lost).
- **The Marine squad AI (marineai.js), the machines' ideas made human.** No data link: men spot for themselves and
  shout contacts that reach the squad leader 1-2.6 s late and roughly placed; 0.6-2.2 s reaction on contact; walk 1.52,
  run 2.74, rushes of 3-5 s at 4.5 m/s cover to cover; states move / contact / fight (base of fire + manoeuvre round the
  flank with MORE cover, teams swap at irregular times, the reserve follows) / assault / defend (360 ring in cover) /
  pinned / withdraw (morale from casualties, the SL's death, odds). Suppression decays at 0.15/s (machines 0.35).
  Weapons by role: M16A1 aimed, the AR's bursts, an attached M60 (a reinforced squad), M203 lobs (M433 HEDP), M72 LAWs
  (a LAW decision sticks until fired). Word gets round: the MG aims at STRIDER legs, riflemen at the sensor head.
- **The Marine (marine.js).** FM 22-5 paces, stances with real transition times (stand -> prone 1.1 s), Tobler on grades,
  foot.js body parts and HP; game rules: a trunk wound kills a third of the time (else down, WIA), the M1 helmet turns
  40 % of head hits to a glance, a limb gone / half the body = down. Hit volume follows the stance (prone: a capsule).
- **STRIDER shutdown (game rule).** A machine broken in two places (blind, weapon arm, a leg, the gut) shuts down after 3 s;
  only the thorax killed outright before, so Marines crippled machines but never finished one.
- **Seized MBTs on trackfm.** `createMBT(MBT.m1a2, { drive: createTrackDrive })` (mbt.js's documented factory). Parameter
  sets in the M60A3 format: M1A2 SEPv3 66.8 t, 7 roadwheels, AGT1500 1,500 shp turbine (falling torque curve, slow spool),
  X1100-3B 4F/2R automatic, hydrostatic pivot; T-90M 48 t, 6 roadwheels, V-92S2F 1,130 hp, 7F/1R auto. Bench: M1A2 69.3
  km/h (published 67, C), 0-32 km/h 6.2 s (M1A1 quoted 7.2 s), T-90M 60.0 (60, C) 6.9 s; pivots ~18-22 deg/s; 0.03-0.07
  ms per frame at 120 Hz; LOD swaps to the placeholder drive far from the camera and back without a jump. The driver
  pivots in neutral (half brakes on a slope), parks on placement, never drives into the sea (`dry`), drives up out of it.
  Road routes: Dijkstra over WORLD's roadGraph (`roadRoute`, benched on a junction) - the zone roads only exist on the
  cave islands, so it is unused by the commander yet.
- **RW-7s and the LCAC.** Hover tanks leave the KRAKEN over the sea (nav.path + a beach), come ashore and join the
  island's machines (`squadai.addMember`), or form their own armour squad (squadai: an armour-only squad now leads
  itself). The LCAC (26.4 x 14.3 m, two shrouded props, bow ramp, RUNAWAY sensor pod / IFF strips) carries one MBT,
  picks the least-bad beach (most islands rise steeply out of 14 m of water), runs up it, drops the ramp, the tank
  drives off, the craft backs off and goes home. Idle hover tanks are the mobile reserve (cross to the next fight).
- **The commander's ground plans** (`GW.think`, called first in war.js's think): armour from 4 min (RW-7, 32) and 9 min
  (MBT, 55) out of a budget the KRAKEN's vehicle deck fills (0.12 materiel / s) plus any surplus over 60; targets: a
  fight in progress, a Marine-held island of ours without AA, a landing party that hasn't taken its pad, else a garrison.
- **Damage both ways.** War rounds through `GW.segHit` (war.js updateProj): door gun / foot rifle = M60 ball, ciws = .50,
  jb = 20 mm, rockets = 2.75 in (game HEAT; an RW-7's point defence shoots 55 % down), bombs via `GW.blast` (war.js
  blast). WASP rounds and battleship shells hurt Marines. RW fire hits the player in any craft (`ctx.hurtPlayer` with the
  hit point: body parts on foot; coilgun 0.7 / rifle 0.08 to the Huey), our AA sites (0.15 a rifle hit, 3.2 a coilgun),
  aircraft low over the island (rifle fire barely scratches: 0.008 a hit; the machines only open up inside 170 m).
- **LOD and fog.** A battle whose island is > 560 m from the camera thinks at 5 Hz and its STRIDERs move kinematically
  (3.4 vs 15.5 ms CPU per simulated second for a 21-unit fight); views culled by distance (Marines in full soldier model
  inside 140 m, the 6-mesh stand-in to 520 m); side-2 units and the LCAC only where `fog.visibleAt` (W.setVisibility).
- **Sound.** runaway/rwaudio.js on the game's bus (sfx.ctx / sfx.master): servo whine, footfalls, fans, turbine /
  diesel, coilgun, machine chirps, shots and blasts for both sides; loops go quiet 0.3 s after the war stops updating.
- **Balance (groundwarbench, 8 seeds; the walker sims use Math.random so runs vary).** 13 Marines dug in vs an MV-22
  load of 8 STRIDERs: the Marines hold 2-3 of 8 alone, losing ~5 killed and ~3-4 wounded and killing / crippling ~4
  machines; with a helicopter's door gun (+ a rocket pair every 10 s) overhead they win 8/8 with ~0 losses (the bench
  helicopter isn't shot at; in the game the machines fire back). War (groundaisim, 20 min, no player input): the
  machines take CINDER (4 min) and BEACON (10 min), Marines take FORGE and ECHO, hover tanks wear down the FORGE garrison
  over ~10 min and take it; an MBT arrives by ~15 min.
- **Shared-file changes** (all commented GROUND WAR): war.js - import; `GW = createGroundWar(...)`, `W.ground`, `ROT.ground`;
  targets() skips `noHit`; enemiesOf() skips `ground` (AA guns don't engage troops); blast(..., noGround) + `GW.blast`;
  updateProj `GW.segHit` + no dust on a ground hit; W.update `GW.update`; think `GW.think` first; W.reset; setVisibility;
  sendDrone may reinforce one of our islands the machines are on. rotary.js - unload -> `R.ground.landing` (2 lines),
  hot LZ (2 lines), `u.reinforce` keeps a Sea Knight going to its own island, `R.FOOT`. squadai.js - 'air' target kind
  (PRIO / THREAT), `addMember`, `removeSquad`, armour-only squads lead. FIGURES.marine is now the soldier model
  (groundwar.js). Scenes ch46capture / mv22landing read the squad proxy. README lines.
- **Tests.** groundwarbench 33/33; groundwar.mjs 10/10; mv22landing 4/4; ch46capture 4/4; smoke 5/5; war 5/5; war2
  5/5; wasp 3/3; escorts 3/3; defencewar 5/5; world.mjs 4/4; runawaybench 48/48; tankbench 72/72.
- **Gotchas.** A trailing `//` comment swallowed the rest of a declaration again (tmapM undefined): comments on their own
  line. Rotary transports roll over lifting off the pitching KRAKEN when the war is stepped at 0.1 s (aisim.json's step;
  pre-existing): balance runs step at 1/30 s. A CH-46 next to eight volleying machines took ~500 rifle hits a minute:
  rifle damage to aircraft is now tiny and machines hold fire on aircraft past 170 m - the TALON the machines bring
  with a captured island is what kills Sea Knights: knock it out first. Ground units' AI picked firing positions in the
  sea (now pulled landward); the MBT rolled backwards off a beach in neutral (parks on placement, brakes on slopes).
- **Untested / next.** Sound by ear; the player on foot in a firefight (hits route through foot.hurt, not exercised in
  a scene); the player's own ground vehicles as targets (only the active craft is a war target); road routes in the
  commander's plans (the zone roads are on cave islands only); MBT gun hits on our structures beyond AA sites; Marines
  don't fire at aircraft; no Marine medics / casualty evacuation; strider models in far LOD are hidden (not posed).
## 2026-10-23 — NGC-1980 wave 2: countermeasures, cockpit warnings, C-130 jumpers, WASP balance (branch ngc/cmpolish)
All game level (bible: "weapons stay at game level"): counters are game rules with game numbers, no seeker or radar
physics. Files: game/js/units/defence/cm.js (new: the rules, the shared state, the dispensers, the RWR scope drawing
and the chase-view cue), units/defence/brain.js (hooks), units/air/jumper.js (figure rewritten), units/air/rotary/rotary.js
(WASP tune), game/dev/jumper.html, tools/scenes/countermeasures.mjs and waspbalance.mjs.
- **Three counters, one per threat.** FLARES decoy missiles: every burning flare gets one roll against each missile
  guiding on the player that has it within 60 deg of its nose and 160 m (62 %, 30 % once the missile is inside 45 m: late
  flares rarely work); a decoyed missile steers at the flare and bursts there (inside 14 m it still throws 35 % of its
  damage at you). CHAFF breaks a radar lock: when a cloud blooms within 80 m of the player, every RUNAWAY radar (TALON
  guns and missiles, not the optical LANCE) tracking him within 320 m keeps a quarter of its lock and can't rebuild it
  for 2.6 s (it also aborts a salvo); missiles get one 28 % roll at a cloud. SMOKE blocks sight: `cm.addSmoke` lays a
  plume of spheres (one every 1.5 s, 2.5 -> 9 m radius over 6 s, drifting at 0.6 x the wind, 20 s each); the summed
  chord x density along a line > 1 blocks the defence units' line of sight (lock, missile guidance), the LANCE beam
  (on top of its own fx-puff test) and the WASPs' fire check. A plume blocks within ~2 s of the grenade popping.
- **Dispensers** (`createDispenser`): the Huey's M130 (one 30-cartridge payload module on the left of the tail boom,
  INFERRED placement: 18 flares + 12 chaff; a press drops a pair of flares or one chaff) and the Hornet's ALE-39 (30 + 30
  in the aft fuselage; pairs). Keys Insert or ; = flares, Delete or ' = chaff; HOTAS actions FLARES / CHAFF (hotas.js
  ACTIONS, stick defaults 12 / 13 zero-based, bindable in J). A pop and a candle hiss per cartridge; flares are a white-hot
  core, a halo, sparks and the hanging white smoke arc; chaff a glitter of foil and a faint haze. Rearm a cartridge at a time
  on the carrier deck and friendly pads (the Huey's `service()`, the Hornet's deck service); full again on a new
  helicopter / new jet / new game. Counters in the weapons line.
- **M18 smoke for the Marine**: Shift+G (or ; / ') throws an M18 from the rig (the items existed: green / red, 60 s burn);
  it pops after 1.5 s and pours coloured smoke (half the puffs roll out low). The rifleman's and corpsman's loadouts carry
  one M18 green (not the grenadier: his fighting load would pass the bench's 24 kg), resupply restocks one.
- **Radar warning picture** (`RWR`, filled by brain.js every frame, published at the end of `defence.tick`): every unit
  that sees and tracks the player (TALON 'T', LANCE 'L', other guns 'A', WASPs 'W' from rotary.js), its bearing, range
  and lock fraction, every missile guiding on him ('M'). Huey: an AN/APR-39 style round scope right of the pilot's flight
  instruments (green strobes toward each emitter, longer as the lock builds, the missile strobe flashing, a dot for the
  laser) with LOCK (amber, any gun lock), MISSILE (red, flashing) and LASER (cyan) caption lamps and the M130 control
  panel (FLARE / CHAFF windows, ARM lamp), all on DC power. Hornet: an RWR scope right of the UFC (ALR style: threat
  letters by bearing, inner ring = locked / firing, a circle on locks, a diamond on the top threat) and left of the UFC
  a LOCK / LAUNCH / LASER lamp row over the ALE-39 FLR / CHF counters. Outside the cockpits (chase / fixed views) a
  small scope with LOCK / MISSILE LAUNCH / LASER / SEARCH and the counts shows top left while anything tracks you (1.5 s
  hold). The lock / launch tones and the MISSILE LAUNCH feed line are the DEFENCE module's (unchanged); new feed lines
  MISSILE DECOYED - FLARE / CHAFF.
- **C-130 jumpers**: `buildParatrooper` is now INFANTRY's 17-bone Marine (soldiermodel.js `buildMarine`, no flak vest, no
  rifle in hand) in the T-10 harness built on the bones: main lift webs and connectors, chest strap, the MC1-1 pack tray
  with its stowed static line and yellow snap hook, the T-10 reserve with rip cord and D-rings, the saddle and leg straps,
  the ALICE hung below the reserve, the M1950 weapons case down the left leg, the repair toolbox on its lowering line
  under the canopy. Same contract for drop.js (unchanged): `body` is the spine (bends at the waist, legs stay), `arms` /
  `legs` are the upper arm / thigh bones behind a small proxy, so drop.js's `.rotation.x` swings also bend the elbows and
  knees (running looks like running). Poses stand / door / exit / canopy / plf. Each look (4 seeds x ERDL / OG-107) is
  built once and cloned (the camouflage paint is per face; geometry and materials are shared). game/dev/jumper.html
  shows every pose and one man under his MC1-1.
- **WASP balance** (scenes/waspbalance.mjs, fast-forwarded in the real war; `war.rotary.waspTune` is live):
  | | old (saucer numbers) | new |
  |---|---|---|
  | hit points / hit sphere | 3 / 2.8 m | 6 / 2.2 m |
  | aim error | 0.025 rad flat | 0.03 + 0.0006 / m (0.09 rad at 100 m) |
  | ambushers | 49 % by id, only picked the player up at 130-170 m: ~3 % lay in wait in practice | 35 %; they pick him up at 320 m when he flies their way: ~25 % lie in wait |
  | 3 WASPs vs a hovering Huey | 100-170 hits / min (98 % of pulses) | 53-87 / min (50 %) |
  | 3 WASPs vs a Huey circling at 25 m/s | 30-62 / min (55 %) | 26-33 / min (20-25 %) |
  | 4-WASP raid on the ALBATROSS | mean life 14-16 s, 0-15 pulses | 13-19 s, 4-15 pulses |
  The raid barely moves: the Sea Sparrow salvo (2 x 4 dmg) gets the first WASP at ~150 m whatever its hp (without the
  missile boxes they live 27 s, without the close-in guns 19-25 s), and the WASPs' cyan pulses do nothing to a hull
  anyway, so a raid on the carrier is a threat to what is on her deck. Not changed: the DEFENCE units' numbers
  (defbalance.mjs keeps its checks). The door gun needs 6 hits now, an AIM-9 (9) still kills, the Marine's M193 ~27.
  WASPs also show on the RWR (with line of sight) and smoke blocks their fire.
- **Shared-file hooks**: main.js (import; `HUEY_CM_KEYS` / `cmH` / `cmPose` before `updateHeli`; Huey key routing one
  line; HOTAS flare / chaff + `cmH.update` after the bomb code; `service()` rearms; three `cmH.reset()`; `heliPanel`
  passes `rwr` / `cm`; the weapons line; the chase cue block in `updateHud`; `__G.cmH`, `__G.RWR`), hotas.js (two
  ACTIONS + stick defaults), jetplay.js (dispenser, keys, buttons, service, weapons line, hudState), hueycockpit.js /
  jetcockpit.js (the scopes, lamps, counters; `cmLamps` / `cmState()` for tests), marine.js (Shift+G smoke, the M18
  throw and burn in `stepGrenades`), inventory.js (one line), invbridge.js (one line), rotary.js (tune, LOS, RWR).
  war.js untouched (createDefence now owns the countermeasures).
- **Tests**: countermeasures.mjs 13/13 (Huey: TALON on the APR-39 + LOCK lamp, missile on the picture, two flare pairs,
  missile decoyed, chase cue up, chaff jams the lock; Hornet: LOCK lamp, two pairs, decoyed; Marine: smoke thrown,
  LANCE loses sight, still hidden 4 s on). smoke 5/5, defencewar 5/5, drop.json 5/5, rescue.json 2/2 (one earlier run
  lost the parked helicopter while the Hercules was inbound, before any jumper; passed twice since; cause not found),
  dropflak 1/1, c130.mjs 5/5, wasp.mjs 3/3, jet.mjs 8/8, hueyhover.json 3/3, marine.mjs 15/15, aisim / playwar clean;
  node: jetbench 24/24, jetfingerprint bit-identical, waspbench 13/13, waspmission 8/8, medinvbench 109/109, marinebench,
  infantrybench 90/90, hotas self-test.
- **Gotchas**: the RWR's LOCK lamp first followed the warning tone's mode 2 (the full missile lock, lock + lockExtra = 2.9 s
  on a TALON) and stayed dark while the guns were already firing; it follows any gun lock now. A missile only showed on
  the scope after its 0.25 s boost (it is added before the guidance step now). The test's first cockpit screenshot took
  longer than the missile's flight at 3 fps headless: dispense first, photograph after. Setting the Marine's third-person
  view before `foot.spawnAt` is undone by the spawn.
- **Untested**: the sounds by ear (headless audio is muted); a real HOTAS on the new buttons (13 / 14 may not exist on
  every stick: bind them in J); the flare / chaff numbers in a long real fight (only the scene's single engagements);
  WASPs' ambush on a real player (fast-forwarded only); performance with many plumes (each is a handful of spheres and
  ~14 puffs / s).

## 2026-10-23 — NGC-1980 wave 2: the M60A3 TTS and M113A2 in the game (branch ngc/armorgame)
Files (new, game/js/units/armor/): armorcraft.js (the craft adapter), armorworld.js (the trackfm environment on the real
islands, pure), armordriver.js (an AI driver, pure), armorgunnery.js (rounds through war.js), armorsight.js (sight
overlay + thermal render of the game scene), armordelivery.js + lcm8.js (the LCM-8 landing craft: model, sound, run-in,
ramp, unloading), landinghard.js (landing hards, pure); tools/armorgamebench.mjs (20 checks), tools/scenes/armorgame.mjs
(+ armorprobe.mjs, a scratch probe). Shared files: main.js only (blocks marked ARMOUR); vehicle.js, ground.js, war.js
untouched (war.js's exported hitTest / damage / blast carry the gunnery).

- **Crafts.** `createArmorCraft(ctx, 'm60' | 'm113')` on the FOUNDATION craft interface - richer than createVehicleCraft
  because the tank sims are 6-DOF with turret, stations and component damage. Seats with doors at the hull sides (walk up,
  Y): M60 driver / gunner / commander / loader; M113 driver / commander (.50) / 11 troop seats (by the ramp). Eyes from
  tankinterior.js (driver periscopes with the live panel, the gunner's station, the M19 cupola, the M113 driver and
  troop compartment); H opens the seat's hatch for the head-out eye (loader and the M113 commander start head out; the
  troops stand in the cargo hatch). The gunner's M35E1 day (8x) and TTS (3x / 8x, WH / BH) sights are full-screen
  views: the reticle overlay sits just above the WebGL canvas (under the HUD); the TTS re-renders the whole game scene
  with heat materials (terrain through its own heat shader: cool sea, sun-warmed slopes; RUNAWAY machines hot) and the
  green-phosphor post pass, through a new craft hook `renderView` in main.js's frame. V: chase view; as gunner the
  turret lays on what the camera ring is on (a reticle shows where the gun is laid and its range).
- **Controls.** From every seat W / S / A / D are orders to the driver (the crew drives; in the driver seat you drive):
  steering narrowed with speed (Right Shift: full), S brakes then reverses, steering at a standstill pivots (M60) /
  creeps round (M113), the park brake sets itself, Z low range. The mouse lays the gun as a position target turned into
  power-control-handle rates (the inverse of the handle's ^1.6 shaping, so small corrections still drive) and holds in
  space with the stabiliser. Gamepad: left stick / RT / LT drive, right stick lays, RB / LB / X / Y fire / coax / lase /
  sight. HOTAS (CTL): pedals steer, throttle lever drives, the stick is the gunner's handle, trigger / pickle fire.
- **The world (armorworld.js).** Terrain sampled on a 2 m lattice in a direct-mapped cache and interpolated with a
  Catmull-Rom bicubic: slope-continuous (trackfm reads a 5 cm second difference as an edge) and 16 table reads a height
  (the bench: within 0.0 cm of terrainH on smooth ground, no false edges). Ship decks (war.deckY) and the host's own
  platforms (the LCM) win where higher; bridge decks from WORLD's roadAt().y near bridges; surfaces: decks, pads, hards
  and tarmac paved, dirt roads dirt, beaches / sea bed sand, steep or high ground rock, wet hollows mud, grass / dirt
  patches; water at sea level except over decks and inside a landing craft. Obstacles: trees (they give way: the M60
  pushes over small ones - laid down in the instanced mesh), village houses (boxes from WORLD's zone items), island
  buildings and AA sites, the cave shafts, every craft's footprint. The laser ranges terrain, decks, houses, crafts and
  war targets. Deck riding: platform.js carry / settle on the hull origin (position, heading and velocity turn with the
  deck) - bench: parked on a deck that sails 6 m/s and turns 45 degrees for 30 s, 0.0 cm slip.
- **Weapons (game level).** Shot events fly on armorballistics (≤ 3 m sub-steps) and hit through war.hitTest /
  war.damage / war.blast: SABOT 10 (+1.5 blast), HEAT 8 (+5 in 5 m), HEP 6 (+9 in 7 m), .50 1.0, 7.62 0.45 war units (an AA
  site has 7 hp, an HQ 30). Muzzle flash, smoke and the blast's dust ring, tracers through fx.js, ArmorAudio on the game's
  audio bus (sfx.ctx / master: engines by distance, the gun, impacts with sound delay).
- **RUNAWAY fire into the sim.** hurt(amount, why, at, dir) becomes a ray in the hull frame into V.hit: a cannon round
  (23 mm KE, pen 40: perforates the M113, scars the M60), a missile (HEAT 420), a shell's blast (HEP 55 from above), flak
  fragments. Component knock-outs, crew wounds (the player's own position goes to the soldier's medical system, killed =
  a crew lost), fires (Halon, X extinguisher), cook-off; catastrophic kills make a scorched, burning wreck (turret lifted)
  and the crew bails out. Small arms and splinters can find the man with his head out of a hatch.
- **Getting armour to the islands.** New war: the M60A3 at the top of the home island hard, the M113A2 on the ALBATROSS forward
  deck park. 8 / 9 (30 / 60 materiel): an LCM-8 (22.4 m, two 12V71s, 9 kn loaded; modelled with its well, wing walls,
  armoured coxswain's station, exhausts, mast lights, tyre fenders, hull number, ramp with cleats; twin-diesel sound)
  motors in from the amphibious group, grounds, drops its ramp onto the concrete, the crew drives the vehicle off and up
  (the AI driver, gun in the travel position), the ramp comes up and the boat backs off, turns and leaves.
  Landing hards: the archipelago's coasts are cliffs (a 0.7-2.6 rise per metre in the first 26 m inland round the whole
  home island), so planHards cuts a 1-in-5 concrete ramp on each island where the cut / fill is least (45 degree slopes,
  kept off the pads, the structures, the shipyard, the village and roads) and main.js folds it into terrainH (the
  renderer, soldier, war and tanks all agree); concrete strip, kerbs, marker posts and a sign drawn on top. 10 of 17
  islands get one (HOME, IRONHOLD, NORTH ROCK, SOUTH REEF, CITADEL, PELICAN, LOOKOUT, BEACON, FORGE, SANDBAR); an island
  without one gets its armour at home. The hard is also where an M113 drives into the sea to swim.
- **AI hook.** `createTrackDriver(V)` (armordriver.js, pure): goTo / follow (pure pursuit, yaw-rate steering loop,
  speed for turn and stop, pivots when facing away, backs off and retries when stuck, gives up after 3) -> the same
  inputs a player gives, so AI armour obeys the sim. On a craft: `def.order(points, { speed, arrive })`,
  `def.driver.state`. Bench: M60 and M113 drive 200 m and stop within 2.2 m, turn to a target behind, run a 60 m square,
  give up against a wall. For the RUNAWAY ground war's seized MBTs on trackfm: give them a createTrackDriver and an env
  from AW.env(self) (prep each frame), carry / settle for decks.
- **Gotchas.** The M60's diesel catches at 160 rpm and dies under 380: a starter released the frame it "ran" never
  started a parked tank at 120 Hz - crank until it is past stall speed. The gun's dig-in rule (a quarter of the gun per
  dig) fired on house walls and on the LCM's raised ramp: refunded when the muzzle is above the terrain. The first LCM
  plan ramped a tank into a 52 degree bank (GR.beach checks the beach point, not the climb): hence the hards. Sed and
  long node one-liners are refused by the worktree guard: scripted edits go through files.
- **Untested.** Real HOTAS / gamepad on the tank (code paths only); parked / AI armour as war targets (only the player's
  craft is targeted, as for every craft); the M113's squad dismounting into the war; soldiers walking onto an LCM (it is
  not a GR deck); bridge decks (no bridges in the control zone); performance with several tanks fighting at once.
- **Performance.** A tank asleep (parked, engine off, at rest) costs nothing; asleep on a deck it is carried kinematically
  (held at its deck height); a driven tank runs trackfm at 240 Hz, an idle / AI one at 120 Hz; nothing past 900 m is drawn,
  the running gear stays still past 250 m. Headless (SwiftShader, load ~30): sim 1.8 -> ~2.6 ms, render 3.4 -> 4.7 ms a
  frame with the M113 parked on deck in view.
- **Tests (2026-10-23).** node tools/armorgamebench.mjs 20/20; node tools/tankbench.mjs 72/72; scenes/armorgame.mjs 18/18
  (runs/2026-10-23_14-19-53-armorgame); smoke 5/5, war 5/5 (failed 4/5 while the M113 kept simulating on the deck at
  4 fps: the carrier moved 2.2 m instead of 3 in 5 s of wall time - fixed by sleeping on decks), vehicle 14/14 (failed 13/17
  while the M60 and M113 were parked in the test car's path - moved), jettrap 7/7, world 4/4; foot.mjs 10/12 (the island
  roof ladder top and the medical slot check; the experimental base scored 6/18 on the same machine - load-dependent).

## 2026-10-23 — NGC-1980 wave 2: rotary polish (branch ngc/airrot-polish)

Authenticity pass on the CH-46E, MV-22B and RW-3 WASP (game/js/units/air/rotary/*).

- **RW-3 WASP redesign (waspmodel.js), per the bible.** A low lens-section ceramic disc (lathed, knife rim with a
  white seam and a cyan lip seam, hair-thin panel seams), grilled 9-blade fans with crossed vanes that flutter, an
  off-centre sensor spine forward-left carrying an eight-lens spider cluster that moves in saccades, an antenna blade
  right-rear, a two-segment sting folded under the disc (seg 1 hangs back-down, the elbow takes the aim pitch), three
  two-jointed insect legs that fold flush in flight.
- **MV-22B.** Smooth one-piece proprotor blades (lens sections, chord 0.95 -> 0.53 m, ~47 deg twist) that feather
  with the flight model's real blade angle (`S.th75`: fine in the hover, coarse in cruise); blunt dome spinners;
  6 deg forward sweep on the leading edge and ~2 deg dihedral; the dorsal fairing over the stow ring; flaperons droop
  in the hover (the download fix); cabin windows (one plated over in primer); the nacelle actuator eases into its stops
  (conversion 12.6 s).
- **CH-46E.** Two M2 .50 cal door guns on pintles (right crew door, left forward window) with gunners who swing onto
  targets and flash; ramp hydraulic struts re-aimed every frame; short boxy aft sponsons as on the real aircraft;
  lighter Marine green; sooty T58 exhaust. In the war (rotary.js `doorGuns`) the gun on the target's side fires short
  bursts of game-level rounds at enemies below within ~150 m near the zone (transit < 450 m, wave-off, hover, ground).
- **Marine-style procedures (transportai.js).** 10 deg approach (CH-46; MV-22 stays 7 deg) to a hover check at 5 m,
  a proper flare (deceleration x1.5 over the last 70 m: ~12 deg nose-up), a hover check after every lift-off; approach
  gates on the way in to an LZ - too high at 150-280 m (> 40 m above the path), too fast at short final (closing
  actually flown > 1.6 x planned + 5 m/s), zone fouled (another aircraft within 16 m and below 15 m; rotary.js
  `fouled`) -> WAVE-OFF: power on, straight ahead, climb, out to 320 m, come round again (gates off after two);
  ship recovery from a hover off the port quarter (26 m aft, 22 m to port) with a sidestep over the spot.
  `AI.homing()` replaces the old phase list in rotary.js. `AI.waveoffs / why / woLog` record it.
- **Sound (rotorsound.js).** Blade-vortex slap on slow descents (the approach crack), CH-46 transmission whine,
  MV-22 turbine whine + exhaust hiss + a chestier hover throb, WASP breathing hiss and slow pitch wander.
- **Tests.** node: ch46bench 21/21, mv22bench 21/21, waspbench 13/13, waspmission 8/8, rotarymission 18/18 (new:
  a fouled-zone run that waves off once and lands; normal approaches no longer wave off). Browser: see the report.

### 2026-10-24 — rotary polish, part 2: deck ops and troop loading (same branch, after merging experimental)

- **Embarkation on deck (embark.js, new; squad.js `stick / embark / boarded / boardNow`).** A troop lift worked the
  way an amphibious flight deck does it (LPH / LHA habits; INFERRED in the detail): the stick waits in two files clear
  of the rotor arc on the port quarter, away from the island (Marines kneeling, RUNAWAY machines standing in ranks), the ramp comes
  down, the stick files up it one man every 0.45 s (machines 0.6 s, in lock-step) and goes forward in the cabin; ramp
  up; the two blue shirts kneeling at the main wheels pull the chocks and chains and run clear; the LSE (yellow) out in
  front of the nose gives the lift-off signal; it lifts. Recovery: the LSE signals it over the spot, the chockers run in
  once it is down. The KRAKEN's crew wear cyan. The deck crew reuse NAVAL's `deckcrew.js` instancing (3 people per
  aircraft). Figures on the deck follow the deck height (`groundY`), not the aircraft's pitched frame. Hooked into
  transportai.js through a `board(ai, dt)` hook in the 'spool' phase; units opt in with `o.board` / `o.deck` (the war
  and the dev page do; rotarymission does not). Loading takes ~20 s (CH-46) / ~28 s (MV-22) from ramp down to lift-off.
  A transport re-tasked mid-load takes the rest aboard at once; rotary.js clears the crews of transports that leave.
- **Approach fix (transportai.js).** With the longer deck time the CH-46 started from a different spot and waved off
  'fast' at 11 m on a normal approach: it ran ~6 m/s behind the braking plan all the way down and crossed the spot at
  ~7 m/s. Three causes: the 'too high' speed limit assumed constant speed (d/v) so it asked for more braking than a
  helicopter has (now the braking-profile time to go, ~2d/v: `steepK` 1.6); inside ~50 m the linear close-in had no
  braking fed forward (now kpos x V); and the cruise pitch limit (11 deg nose up) capped the flare - while behind the
  plan the CH-46 pilot may now flare to ~15 deg and ask for 2.6 m/s2 (`flareTilt`, `flareA`). Now it arrives over the
  spot at ~1.4 m/s. `cmd.turning` no longer sticks on.
- **Tests.** node: embarkbench 12/12 (new), rotarymission 18/18, ch46bench 21/21, mv22bench 21/21, waspbench 13/13,
  waspmission 8/8. Browser (load average ~140 on the shared machine): ch46capture 5/5 (new check: the waiting stick stands
  on the flight deck, clear of the island - it first stood on the starboard side, inside the island; moved to port),
  rotarydev ch46 2/2 (new shots 01b-boarding, 01c-lse-signal), smoke 5/5, rescue 2/2, drop 5/5; mv22landing 3/5 and
  rotarydamage 5/9 fail only on waits: the Osprey's 6.5 km trip home outlasts puppeteer's 180 s cap per wait at this
  load (now polled), and rotarydamage's squad part reads `s.squad` which the GROUND WAR's squad proxy no longer has
  (stale since that merge, not this work). Scene timeouts raised for the ~20-28 s of loading.


## 2026-10-23 — NGC-1980 wave 2: the WHEELED vehicles in the game (branch ngc/wheeledgame)
The M151A2 MUTT, the M35A2 and the 1980 civilian cars (Land Rover 109, Hilux, Beetle, Lada 2101) are crafts in the real
game on the WHEELED sim (vehiclefm.js); the placeholder TEST CAR is gone. Files (game/js/units/wheeled/): wheeledcraft.js
(the craft), wheeledenv.js (the world as the sim sees it), wheeledworld.js (WORLD buildings as obstacles, parked town
cars), motorpool.js (who is where, traffic, sound, service, crew wounds), vehicleguns.js (M60 / M2), delivery.js +
lcm8model.js (CH-46 sling, LCM-8), wheeledbake.js (one-mesh far LOD and the WORLD's instanced traffic); world/parked.js.
- **Seats, doors, exits.** From the spec's seats: driver, front passenger, the M151's M60 pedestal gunner and rear seat,
  the M35's cab, M36 ring-mount M2 gunner and six of the sixteen troop places on the benches (three a side, doors at the
  tailgate), the Hilux bed, the cars' rear seats. `[ ]` changes seat, Y gets out (below 8 km/h). The Marine keeps his kit
  and wounds: while he rides the walker sits at the seat (so hits land on the right body part) and his medical keeps
  running (bleeding goes on; dying of wounds in a seat ends the life). Parked engines go off; the starter cranks when you
  take the wheel (the sim's starter motor). Seated Marine figures show you in chase view; civilians drive the traffic.
- **Controls.** Keyboard throttle / brake ramps, hold S stopped = reverse (driver.js auto), the steering wheel turns at a
  hand's rate and the keys' lock narrows with speed (to a ~0.42 g turn: full lock at 60 km/h would roll the M151, as it
  should with a stick), the parking brake holds when stopped with no pedal; gamepad (left stick with a softer narrowing,
  RT / LT, A) and HOTAS via CTL (stick X or pedals, the throttle lever, toe brakes); U 4x4, L low range, G fording kit, N
  gearbox auto / semi / manual (E / Q, C clutch), I engine, H horn, O lights. Gunner: the mouse (or arrows / right stick)
  lays the gun within the mount's elevation limits, LMB / F / RT fires, R changes the belt. V: seat eye / chase.
- **Environment (wheeledenv.js on makeTerrainEnv).** terrainH through a 1 m lattice cache with bilinear interpolation
  (the sim asks ~300 heights a substep; terrainH costs 1-2 us); the WORLD road ribbons' lift (0.10-0.14 m) is in the
  lattice so the wheels roll on the drawn road; surfaces from roadAt (tarmac / dirt) then the ground host (pads = tarmac,
  sand, rock, grass, mud, sea bottom = sand); bridge decks from roadAt().y (+lift) when the vehicle is up there, with
  parapets at hw + 5 cm; ship decks from GR.deckH (only when a ship is within 140 m), carried kinematically by
  platform.js (`sim.transport`, new in vehiclefm.js) so parked and driven vehicles ride a sailing, turning carrier with
  sub-25 cm drift; the sea for fording; collide = the ground host (trees, island buildings, AA, ship islands, crafts),
  the WORLD's houses, barns, churches, sheds, garden trees, lamps (wheeledworld.js, 32 m grid, wild towns indexed when
  first approached), other wheeled vehicles (an impact pushes them), the fenced cave shafts, and terrain faces steeper
  than ~57 deg (the WHEELED report: cliffs need collide).
- **Where they are.** An M151 and an M35 at every friendly island's motor pool, an M151 and an M35 on the deck park
  (deck spot 3 is the armour's M113), an M151 when an island is taken. 7 then 1: an M151 slung in under a CH-46E from
  the ALBATROSS (10 materiel; it hovers, lowers it onto its wheels, releases and goes home); 7 then 2: an M35 run in by an
  LCM-8 to a beach a truck can climb (20; ramp down, the truck drives off up the sand under a driver.js follower). Real
  cars parked on the verges of the town streets (kerbside, by position hash: the WORLD's garden cars never get placed -
  see gotchas) can be commandeered; parked vehicles sleep (no physics) until touched. Vehicles stopped on a friendly pad
  or the deck refuel, are repaired after 3 s and get their belts back.
- **Traffic.** The WORLD's instanced saloons / hatches / estates / vans / pickups are our Lada / Beetle / Lada / Land
  Rover / Hilux baked into one mesh each (paint per instance from the cars' own colours). Within 150 m of the player up to
  six are handed to the real sim (far LOD: 1 probe, 1/240 s; mid within 60 m) with a createFollower on their lane, gaps
  to the player, our vehicles and the WORLD's cars ahead, a toot when held up, restart after a stall, carrying on into
  the next road; handed back to the WORLD past 240 m. Stand in front of one: it stops; Y at its door commandeers it.
- **Weapons (game level).** M60: 550 rpm, 853 m/s, 100-round belts, 6 boxes; M2: 500 rpm, 890 m/s, 100-round cans, 4.
  Rounds fly with gravity and dispersion, every fifth a tracer, swept in 2.5 m steps against terrain, decks, island
  trees and war.hitTest; war.damage(side 1) 0.38 / 1.1 war units a hit; impacts through fx; InfantryAudio shots (an M2
  voice added). Incoming: war.js bullets ('b' as hmg, 'ciws' / 'jb' as cannon) walk vehicledamage.js's ray through
  tyres, engine, radiator, fuel tank, battery, crew; blasts (and every fx.explode near a vehicle) blast it and push it;
  fire, leaks, flats, seizures and wrecks (charred model, burning) follow from the damage model. A crew hit on your seat
  becomes the Marine's wound (bullets on the body part, blasts / crashes as fragments, fire as burns).
- **HUD and sound.** Line: type, seat, speed, gear and rpm, 4x4 / 6x6, surface (BRIDGE), wading depth against the fording
  depth, temperature, oil pressure, damage (FLAT, LEAKS, FIRE), the Marine's bleeding; fuel bar in litres; weapons line
  belt / boxes and troops. WheeledAudio on the game's bus for your vehicle (inside / outside) and the nearest other
  running one; silent in the pause menu (and the deliveries stop).
- **The M35's troops.** B at one of our pads: six Marines board (105 kg each through sim.setLoad), sit on the benches,
  the capture time on a pad drops 8 -> 4 s; B again dismounts them.
- **The working cab (cabin.js, on interior.js).** The vehicles stand cold. Look at a switch and click, as in the jets
  (main.js's switch ray asks `craft.switches()` / `craft.click(id)`): M151A2 rotary ignition OFF / ON / START, M35A2
  ENGINE switch + START button (TM 9-2320-209-10; the air gauge), the cars' key; the military main light switch OFF /
  BO MARKER / BO DRIVE / SERVICE DRIVE (lamps as glow sprites: head, blackout drive, tail; no scene lights - they recompile
  every shader), panel light, wipers that sweep (~45 a minute, back to park), horn button, front-drive / transfer levers,
  parking brake (T-handle / lever), the fire extinguisher (2 on the military vehicles: X or click; works on a young fire).
  T changes a flat for the spare (stopped, 25 s, the spare goes off the body). The driver's hands and arms on the wheel only
  when somebody drives (you, traffic, an AI); his legs and boots on the pedals (right foot to the brake when braking, left
  on the clutch) and his body in the seat in first person. The camera shakes with hits, crashes and a rough engine.
- **Input.** Gamepad: A handbrake, B horn, X engine (gunner: reload), Y view, LB / RB seat, Back get out. HOTAS through
  CTL's bindings: trigger = horn (gunner: the gun), pickle = engine, VIEW, GEAR = next seat, EJECT = get out, FLAPS =
  lights, WHEEL BRAKE = parking brake. **Racing wheel** (wheelinput.js, pure; Logitech G27 / G29 / G920 / G923,
  Thrustmaster T150 / T300 / TMX / T248, Fanatec, Moza ... by id): the rim is axis 0; the pedals are found from their rest
  values (an axis sitting at +-1 when first seen; +1 or -1 released both work; one reported 0 until touched counts as
  released; a hat axis at ~1.29 is not a pedal), in axis order gas, brake, clutch; `localStorage.tz_wheel_axes =
  "0,1,2,3"` (`!` inverts) overrides. Paddles shift (semi / manual), the clutch pedal works the manual gearbox (C on the
  keys, ramped), face buttons horn / engine / view / handbrake, 6 / 7 seats. A wheel replaces the gamepad and HOTAS paths
  while you drive (its buttons would double up).
- **COMMANDER hook (motorpool.js).** One function per vehicle type, no materiel, no delivery:
  `pool.spawnM151(where, opt)`, `spawnM35`, `spawnLandRover`, `spawnHilux`, `spawnBeetle`, `spawnLada`, and the same as
  `pool.spawners[type]`. where = an island (its motor pool spot), 'deck' (the deck park) or { x, z, yaw } (the nearest
  clear, dry, level place within 40 m: no roof, wall, tree or vehicle; `plat` / `exact` place it as given); opt = {
  running, owner, colour, home }; returns the craft (in pool.list and crafts) or null. `window.__G.pool` in ?debug.
- **Fix: hits between sim steps were lost.** vehiclefm.js cleared `S.events` at the start of each step, so the events a
  round raised through `dmg.hit` from war.js (between steps) - crewHit above all - never reached the craft: the seat
  died silently and the Marine riding in it was never wounded. Events raised between steps are now queued
  (`S._between`) and reported with the next step. (The scene's old check fired 12 rounds synchronously and read the
  wound at once; it now waits a frame.)
- **Tests.** wheeledbench 65/65; wheelinputbench 14/14 (fake pads: G29 / G920 / T150 / G923 reversed pedals / T300 at 0 /
  Fanatec with an override; the HOTAS, T-Rudder and an Xbox pad are not wheels); wheeledgame.mjs (walk to the M151, the
  cab's ignition ON / START, lights, wipers, keyboard drive, village street, bridge, farm field in 4x4, ford, M60 on an
  enemy building, hits and the crew wound, commandeer a town car, the deck under way, the M35's troops and ring mount,
  the commander spawners) 27/27 (tools/runs/2026-10-24_09-58-48-wheeledgame); vehicle 14/14, wheeleddeliver 6/6,
  wheeledcockpit 12/12, wheeleddrive 7/7, wheeledmodel 6/6, wheeledaudio 10/10, smoke 5/5.
- **Fix: a jeep could not drive into the surf.** vehicle.mjs's last leg had failed since the M151 went in (it dug in on
  the beach: GR's 'sand' is all ground under 2.5 m, the soft dry kind, crr 0.12 and sinkage, a spinning tyre digs a 2WD
  jeep in and even 4WD stalled on a twisted beach). Sand under 0.8 m (the tide line, the shallows) is now firm (dirt) for
  the wheeled sim (wheeledenv.js): the soft sand is up the beach, as on a real one. The LCM-8's truck gets ashore on it too.
- **One .50 hit kills.** A round through a seated man's chest is fatal (crewHit hands MEDINV the hit at the seat's chest
  height); the scene reads the wound off his medical and patches him up before foot.js sees the death.
- **Untested / next.** A real wheel's axis layout on Linux / macOS drivers (only Windows-style layouts assumed; the
  override covers the rest); force feedback (the Gamepad API has none for wheels); night (the lamps are sprites: the game
  has no night yet); the cab's switches in the M35 by eye in every light; AI crews in the other seats of a vehicle you
  drive (only the M35's troops ride along).

## 2026-10-23 — NAVAL polish (authenticity pass)
- ALBATROSS: crew placed by role round each aircraft and station (plane captain brown at the nose, blue chockers at
  the mains, purple fuel crew at the refuel point, red ordnancemen at the wing stations; green catapult crew, a yellow
  catapult officer and a white safety PO by cat 1, all clear of the launch lane), a yellow director at the fantail.
  1970s-80s details: the bridle arrester horn off the bow at the end of cat 1, bullnose and jackstaff, a starboard
  UNREP receiving sponson at hangar-deck level, a boat pocket aft with the gig and a motor whaleboat. The fuel bowser
  no longer sits under a parked Hornet; funnel smoke is a light oil-fired haze, not black.
- Deck vehicle park: the port strip forward of the landing area (SEAWORLD's DECK_SPOTS, x -10.5), clear of the catapult
  lane; tow bars and the bow tractor moved off it.
- KRAKEN: Ford-class plan - a broad blunt bow, both starboard elevators forward of the island (one was under the
  island) plus the port one aft, the deck's underside and edge fascia wherever it overhangs the hull. The RW drones are
  a proper tailless flying wing now (sawtooth trailing edge, lift fans in the roots, leading-edge seams).
- LEVIATHAN: the port sensor fin is a small blade in the same language as the main one (was a box with a pole).
- Sea: each hull has a bow wave (foam crests along its forward shoulders, attached to the ship, stronger with speed
  and when the bow plunges); parts.waterHalf(z) gives the waterline half-beam for it.
- **Island ladder (user bug: it didn't line up).** The ladders are the model's now: albatross.js exports
  `parts.ladders` ({ name, lx, lz, yaw, y0, y1, w, top: [dx, dz], cage, drawn }, ship frame) and draws them itself
  (`buildLadderGeo`: rails, rungs, stand-off brackets, grab handles, the upper flight caged); ground.js `GR.laddersOf`
  reads them (its old LADDERS table stays the fallback) and foot.js skips drawing a ladder marked `drawn`. A 1980
  island arrangement: two flights up the port face, flight deck -> the O-7 catwalk (now a proper bracketed walkway with
  rails, open at the forward end) -> the island top deck (a gap in its port rail at the ladder head); a Jacob's
  ladder off the fantail of both carriers (KRAKEN too). The island colliders and floors come from the model as well
  (`parts.islandBoxes`, `parts.islandFloor`): the catwalk is walkable, the boxes match the geometry.
  scenes/ladder.mjs climbs every ladder (9/9, runs/2026-10-24_09-10-02-ladder); foot.mjs step 4 takes the two flights.
- Tests (2026-10-24, after merging experimental): ladder 9/9; foot 12/12; naval 5/5; seaworld 25/25; smoke 5/5;
  navalbench 22/22; seabench 15/15; node --check game/js/*.js clean.
- Tests: navalbench 22/22; naval.mjs 5/5 (runs/2026-10-23_15-30-10-naval); smoke 5/5; jettrap 7/7; sky 6/8 - the
  same two expects fail on experimental 651012c (runs/2026-10-23_15-33-06-sky), not a naval regression.
## 2026-10-23 — NGC-1980 wave 2: INFANTRY DEPTH - buddy aid, the corpsman, casevac, AI Marines on the real sims, the grenade drill (branch ngc/infdepth)
- **AI Marines on the real rifleman sim** (`units/groundwar/richmarine.js`, pure). Inside 120 m of the camera (up to 14
  men; `GW_T.RICH_R / RICH_MAX`) a ground-war Marine is promoted from marine.js's kinematic body to INFANTRY's rifleman
  (soldier.js inertia, load, Tobler, timed stance transitions, stamina; weapons.js magazines out of his own MEDINV rig
  through invbridge.js, stoppages, SPORTS immediate action / remedial action, tactical reloads in lulls) and MEDINV's
  medical sim. The squad AI still decides; its intent becomes the rifleman's input (move vector in his frame, walk /
  run / sprint, one-shot stances, look deltas at a human turn rate, trigger pulls on the sights, the AR's selector on
  AUTO and bursts). His rounds stay GAME-LEVEL: each rifleman `shot` (real muzzle, real swaying bore) becomes one of
  groundsim's projectiles. M203 and LAW keep the cheap firing. Hits go to MEDINV (`RICH_HIT` table, game damage on
  MEDINV's HP scale); a GAME rule decides "down": dead, unconscious, both arms out, shock class III, crawl only, a bleed
  over 120 ml/min, a blacked chest or belly; once down he goes back in only with no tourniquet, no unsplinted fracture
  and class I. Self aid (FM 21-11) from his own kit while conscious. Far away the cheap model runs; a man keeps his
  medical state (and bleeds) wherever the camera is; a cheap man promoted while hurt gets MEDINV wounds of the same size.
  **Cost: 1.3-1.9 ms of CPU per simulated second per rich Marine (0.04 ms per man per 1/30 s frame in a fight; 14 men
  ~0.6 ms a frame).** Balance (`buddyaidbench cmp 4`, 4 fights, 13 vs 8 STRIDERs): cheap 32 KIA / 25 WIA, rich 24 / 15,
  machines left 30 / 30 - the near men are not weaker than the far ones.
- **Casualty care** (`units/groundwar/fieldcare.js`, pure, run by groundsim after the squad AI): the wounded call out
  ("I'M HIT!", "CORPSMAN UP!"), crawl to a spot the enemy can't see; the squad's **Navy corpsman** (HM3, the 13th man off
  every Sea Knight) goes to the worst casualty, rushing when far, crawling the last metres under fire, kneels on the far
  side from the enemy and works with MEDINV's buddy-aid API (`startTreatment({ item, region, by: { self: false, skill:
  'corpsman' } })`, buddy times x0.8, the casualty's own kit first, IV and needle decompression corpsman-only), takes
  over a man's self aid; up to two riflemen do buddy aid at the same time (when the squad isn't in the thick of it).
  Treatment choice follows 1980 doctrine (FM 21-11): field dressing and pressure first, a tourniquet for a spurting
  artery or a limb bleeding through its dressing (the best one for that limb by MEDINV's success odds: a cravat windlass
  beats the strap-and-buckle on a thigh), never on an ooze; then chest seals, needle, IV in shock, splints, morphine
  (never in shock), salts. Once quiet, the walking wounded walk to the casualty collection point by the pad, litter cases
  are dragged there by the drag strap at MEDINV's `BUDDY.dragSpeed` (0.97 m/s). Cheap model: GAME timers (dies of wounds
  in 4-12 min untreated, 20-45 s corpsman / 40-80 s buddy treatment, back in the fight if half his body is left).
- **The player's side** (`marinecare.js`): F by a wounded Marine opens HIS HEALTH screen with YOUR kit (buddy aid at
  buddy times; walking away cancels: `BUDDY.treatRangeM`); Shift+F drags him (you back up at `BUDDY.dragSpeed` for your
  wounds, his 80 kg + kit and your load; stamina drain x2.2), F lifts him into a fireman's carry (`BUDDY.carrySpeed`,
  both arms and good legs; x3.5), Shift+F puts him down; F at the Huey's door loads him. Bleeding near a squad, the
  corpsman (or a buddy) comes and treats you - stand still. A dead Marine's kit is searchable (his own rig if he died on
  the rich model; else his role's loadout with the magazines he had left). The rifle is slung (viewmodel lowered) while
  your hands are full.
- **CASEVAC and the pool** (`units/groundwar/casevac.js`): land the Huey within 45 m of wounded and stay down - walking
  wounded walk to the cabin, buddies carry the litter cases (~5 s each), six litters (UH-1H medevac fit). Land on the
  ALBATROSS (or a friendly HQ pad): delivered to the sickbay. A Sea Knight that has put its stick down keeps its ramp
  down while the island's wounded are carried aboard (up to 12, max 90 s), flies them home; lost with it if it goes
  down. After 4 min (GAME) the evacuated are back in the pool: each fills a seat on the next Sea Knight (a 13th of its
  materiel; war.js hook, feed "13 MARINES (2 BACK FROM THE SICKBAY)").
- **First-person polish**: the **M67 / M18 drill** in the viewmodel (`units/infantry/throwvm.js`): rifle down to the
  slung side, draw from the pouch, safety clip off and the pin pulled by the left forefinger (the ring stays on it), arm
  cocked back, the off hand pointing at the target; HOLD G to cook (the spoon flies off, the fuse burns: thrown with
  4.5 s less the cook, and too long it goes off in your hand), the overhand arc and follow-through (RMB: underhand lob,
  8 m/s), the grenade leaves the hand where the hand is. **Weapon rest** on walls and windows: a wall top or sill under
  the handguard with nothing over it, or a wall / frame beside it (GR.collide probes: buildings, superstructures, parked
  crafts) - HUD "RESTED ON A WALL, RIGHT". **Breath in the camera**: the chest rises with each breath (deeper with the
  oxygen debt), blown the head sways and drops on the exhale, a heart over 120 knocks the view each beat; less on the
  sights. Lean (Q / E) was already there; checked in the scene (view rolls).
- **Fixes on the way**: the player's rounds never reached the ground war (STRIDERs, hover tanks, MBTs, Marines - friendly
  fire is real now: "CEASE FIRE!") - marine.js raycasts groundsim's hit volumes and hits go to `GS.hitUnit`; the war's
  squad proxies (`noHit`) no longer stop the player's rounds as an invisible 3.6 m sphere; marine.mjs's leg-bleed check
  is deterministic (`MS.reseed`, and it waits for an arterial bleed).
- **Shared-file changes** (all commented ngc/infdepth): war.js (`W.sendDrone` cost less the pool credit, 3 lines);
  marine.js (imports, raycast into the ground war + noHit, warHit gw branch, F / Shift+F, the throw drill replacing the
  instant throw, care update / HUD hints, camera breath, rested label, the drag pose in third person); marinesim.js
  (`MS.burden` speed cap + stamina, wall / window rest, `reseed`); viewmodel.js (`solveArm` exported); groundsim.js
  (rich / care options off by default - the balance benches are unchanged -, `place`, `enrich`, `unitT`, `hitUnit`,
  `casualties`, `evacuate`, bodies stay 7 min with care on); groundwar.js (rich + care on, corpsman role, names and
  ranks, rich poses, the carried casualty, care news, CV); marine.js (ground war body: crawl / walking-wounded movement,
  doc load), marineai.js (doc power); scenes groundwar.mjs (counts the evacuated) and marine.mjs (deterministic).
- **Tests**: `buddyaidbench` 23/23; `buddyaid.mjs` 23/23 (run `tools/runs/2026-10-23_15-15-15-buddyaid`: the drill
  phase by phase, the cooked throw, a dead Marine searched, drag, fireman's carry, the cravat on his thigh from your
  kit, the corpsman at work, a Marine treating you, rested on the Huey's cabin, lean, casevac to the ALBATROSS, the pool);
  marine 15/15, marinelife 11/11, groundwar 10/10, ch46capture 4/4, foot 12/12, smoke 5/5; benches medinv 109, infantry
  90, marine all, groundwar 33/33.
- **Gotchas**: (1) a trailing `//` comment swallowed a line again (groundsim's body removal) - comments on their own
  line. (2) MEDINV's corpsman fixes nearly everything (wound care restores ruined limbs, salts wake the knocked out), so a
  "down" man treated would always get up: the return-to-duty rule (no tourniquet, class I) is what makes casevac matter.
  (3) A single care job per squad left the player bleeding while the corpsman was busy: up to three jobs. (4) Headless
  frames are ~0.3 s: the drill's phases are frozen for the screenshots (`marine.freezeThrow`).
- **Untested / next**: AI Marines throwing grenades and the third-person throw / drag hand poses (the body only kneels
  and slings the rifle); voices for the callouts (text only); casevac by a dedicated CH-46 flight (only Sea Knights that
  land anyway take the wounded); the Huey crew chief loading in the cabin (the wounded vanish at the door); a gamepad
  binding for drag / carry; real mouse feel of cooking with G; the M18's colour choice (always the first in the rig).
## 2026-10-23 — armour polish: M60A3 TTS and M113A2 authenticity (branch ngc/tank-polish)
- **M60A3 turret** re-lofted after Hunnicutt's drawings: the M60A1 / A3 "needle nose" (a long wedge in plan narrowing to
  the gun shield, the roof sloping down to it, the chin undercut), full width ~2.8 m over the ring, and a long bustle that
  overhangs the engine deck (its floor well above the ring) to a near-vertical rear plate: ~3.95 m of casting, plus the
  rack. The AN/VSS-1 xenon searchlight is now the big box it is (0.82 x 0.7 m, 0.6 m lens) on brackets over the shield,
  elevating with the gun; the shield wears its laced canvas dust cover; the M85 has its armoured mantlet in the M19's
  front. Bustle rack rebuilt round the new rear plate (bedrolls, duffels, ammo cans, a water can, the tarp). The bustle's
  armour plate, the ready rack and radio, and the gunner's / loader's room follow the longer bustle.
- **Markings** were never visible: the bumper-code decals faced into the hull (wrong sign on their tilt - the M113's too).
  Fixed; added the US Army registration on the glacis (subdued black) and the yellow NATO bridge-classification disc
  (MLC 60) on the right front light guard. M113A2: M243 smoke dischargers on the roof corners, a tow cable.
- **Driver's M27 periscopes**: slim olive bodies with a rubber brow pad, not black slabs crowding the windows.
- **Start-up (TM order, game times)**: the MASTER switch gates the starter, turret power and the sights; the diesel cranks
  ~2.5 s (AVDS) / 1.2 s (6V53) before it catches and has a run-up grace (it caught below its stall speed and died);
  turret POWER builds hydraulic pressure, then the stabiliser's gyros run up for ~20 s (POWER mode until then: the sights
  show STAB RUN-UP nn %); the TTS cooler as before. Dev page: ?cold, 0 MASTER, hold I START, 9 turret POWER. Bench check.
- **Sound**: the AVDS's two cooling fans (a detuned pair: the beat is the M60's signature) and more fan roar; the 6V53's
  Roots-blower scream; the starter motor's gear whine; a cough when the diesel catches; the transmission's clunk on a
  range shift; brake squeal at low speed; the turret's hydraulic valve hiss while laying.
- **Tests**: tankbench 73/73 (+ the start-up check), armorgamebench 20/20, tankaudio 4/4, tankmodel 2/2 (M60, M113).

## 2026-10-24 — NGC-1980 WATER + FISH (branch ngc/waterfish)
What: fish schools round the camera, water clarity seen from above, the view under water, diving.
- **fishsim.js** (pure, node): four species of a 1980 temperate archipelago, each with its body length, school size,
  sea depth (habitat), swimming depth band, cruise / burst speed: pilchard (0.14-0.2 m, 50-90, near the surface),
  mackerel (0.28-0.38 m, mid water), grey mullet (0.3-0.5 m, small groups grazing the bottom in 0.7-4.5 m by the
  beaches), amberjack (~1 m, a few, deep near the bed). Boids per school (separation inside the nearest-neighbour
  distance, alignment, cohesion, a wandering goal), depth band, sea bed below and shore ahead read through `terrainH`
  (cached on a 2 m grid), so the coming beaches (ngc/terrain) need no change. Spawned only within 70-170 m of the
  camera (more when higher; none above 160 m), dropped behind it; at most 760 fish / 14 schools.
  Fright: hulls (box round the waterline, bow wave grows with speed, flee aside and down), point disturbances (rotor
  downwash, swimmers, LCAC, RW-7 hover tanks), transient scares (splashes, gunfire on the water, wakes), and a wave of
  alarm through the school at 8 m/s. Blasts in / on the water stun (belly up, float up, come to and bolt) or kill
  (float, then sink); a burst in the air does next to nothing. Radii game-tuned.
  Numbers: tail beat from Bainbridge 1958 U = L(3f-4)/4 (CONFIRMED form), amplitude ~0.2 L; cruise 1-3 BL/s, escape
  ~10 BL/s (Videler 1993, Domenici & Blake 1997: INFERRED, per-species UNVERIFIED); NND ~1 BL (Pitcher & Partridge
  1979, INFERRED); vessel avoidance (dive and move aside, Misund 1997 / Vabo 2002: form INFERRED, distances game-tuned).
- **sealife.js** (THREE): one instanced draw for every fish (a 66-triangle fusiform body + forked tail, dorsal and
  pectoral fins, bent by the tail-beat wave in the vertex shader, countershaded, species marks: mackerel bars, mullet
  lines, amberjack stripe and eye band; silver flanks flash). From above, fish are seen THROUGH the water: light lost
  on the path down and back, Fresnel, and their depth written at the sea's crest plane so the opaque sea does not hide
  them (ships and land in front still do). Disturbances come from war.units (ships, low rotary units), war.ground (LCAC,
  hover tanks), main.js `extra` (the Huey's downwash, the Marine in the water) and wrapped fx recipes (explode, splash,
  impact on water, wake, water decals) - no edits to fx.js or war.js.
  Under water (the rendering camera below the drawn surface: the same 8 waves the GPU draws): fog to the water colour
  (~26 m visibility, less in a rough sea and deeper; greener near the top, darker down), the sky dome off, the terrain
  drawn double-sided so the surface shows from below (Snell's window 48.6 deg, total reflection outside, bright rim,
  foam), a 96 m sea bed mesh round the camera from the fish sim's bed cache (built a few hundred vertices a frame while
  the camera is low over water, so a dive finds it ready), screen edges darkened. All switched in scene.onBeforeRender,
  so scripted test cameras work too.
- **seasurface.js**: `SEA_FS_WATER` replaces the flat shallows-to-deep ramp: refracted view ray (n = 1.333) to the bed,
  per-channel extinction (red first: pure water ~0.35-0.45 / 0.06 / 0.02 per m, Pope & Fry 1997, a little lighter for
  the look) plus turbidity with sea state, the water's own colour filling in with depth; deep water keeps the old
  deep blue. `SEABED_GLSL`: sand with ripples, Posidonia sea grass from ~2 m, rock on steep bed, caustics (shared by the
  clarity from above and the bed mesh below). `SEA_FS_UNDER`: the surface from below. New uniforms uSeaK, uUWCol.
- **Diving**: footsim.js (I.dive: down at ~1 m/s to 4.5 m or just over the bottom, breath 45 s, forced up when out),
  marinesim.js passes it, marine.js: hold C (pad B) in the water; HUD shows the breath.
- Shared-file lines: main.js (import, `${SEA_FS_WATER}` in place of the `wc` ramp line, `${SEA_FS_UNDER}` after the
  foam mix, `createSeaLife` block after the Marine, `sealife.update(dt)` after `fx.update`, `sealife` in `__G`);
  footsim.js / marinesim.js / marine.js (dive, a few lines each).
- **Tests**: `node tools/fishbench.mjs` 29/29 (Bainbridge, habitats, schooling NND / polarisation / cruise speed,
  ship pass: aside, down, none inside the hull, calm again; downwash; swimmer; blast stun / kill / recover; airburst;
  spawn / drop round the camera; real archipelago heights; cost 0.34 ms for 661 fish per frame in node).
  `tools/scenes/fish.mjs` (PARTS=look,fps,hull,wash,blast,under) 10/10 after merging experimental: schools by the camera, hull,
  downwash and fx.explode frighten / stun, dive -> under water with the bed built, back up. smoke 5/5, naval 5/5,
  seaworld (sea, horizon) 9/9.
- **fps**: same camera, fish on / off in alternating 50-frame blocks (SwiftShader, res 0.6, machine at load ~130):
  median 272.6 ms on vs 274.6 ms off - no measurable cost; sealife CPU ~1 ms a frame (sim, threats, instance upload),
  one draw call. Without culling, one run with all ~500 fish drawn showed ~20 % in SwiftShader (vertex-bound: a
  software rasteriser runs the bending vertex shader on the CPU), so fish that cannot show are left out of the draw:
  behind the camera, under a pixel, or behind more than ~28 m of water along the line of sight (40 m under water).
- **Gotchas**: three's fog and background are colour-managed (converted to sRGB), the raw terrain / fish / bed shaders
  are not: the underwater fog colour goes to them as a linear colour (convertSRGBToLinear) or the far water shows as a
  pale band. foot.spawnAt refuses a spot in deep water unless `{ force: true }`.
- **Untested / next**: fish sound none (bubbles under water would help); a swimmer at the surface does not ride the
  waves (his eye is at +0.32 m, a big crest can cover the camera without the underwater switch); fish do not avoid
  ship hulls they are not near when the hull is stationary (by design, fish shelter by moored hulls); the far terrain
  grid could be culled under water for fps; amberjack rarely spawn in the zone's 14 m sea.

## 2026-10-24 — armour at the Huey / Hornet bar: clickable crew stations, start-up, crew, HUD (branch ngc/armorgame-polish)

What (on top of the stopped 2026-10-23 session's crew procedures, hatch figures, fire-command calls and LCM-8 work):
- **Every crew station clickable** (`units/armor/armorstations.js`, new): invisible hit boxes on the controls each
  crewman works, picked by the crosshair (mouse captured) or the cursor, framed in yellow and named on the hint line,
  click to work them - the same path as the Huey / Hornet cockpits (main.js `pickSwitch` -> `armCk()` ->
  `craft.cockpitObj()` / `craft.click(id)`). M60A3 driver: MASTER switch, START button, parking brake, range selector,
  the fixed fire extinguisher pull, hatch. Gunner (E looks up from the sight): a TURRET POWER / STAB panel on the right
  wall, the M21 computer panel's buttons (lase, dump to battlesight, SABOT / HEAT / HEP), the TTS field-of-view and
  polarity knobs. Loader: the ready rack (round bases painted by type, taken out as the rack empties; click a type to
  take that round and ram it), the breech, his hatch, the AN/VRC-12 (status report on the net). Commander (E: look
  about inside the cupola): hatch, OVERRIDE (the turret slews onto the cupola's bearing, the cupola holds it), a new
  .50 can. M113A2 driver: MASTER, START, BILGE, a RAMP / VANE panel on the left wall, fire pull, range, parking brake,
  hatch; commander (E: look about the troop compartment): hatch, ramp, .50 ammunition box, AN/VRC-46; troops: ramp,
  cargo hatch, radio. New geometry where the controls were missing (MASTER / START / switch panels, labels).
- **Start-up procedure**: vehicles spawn cold and dark (`spawnAt({ ..., state: 'cold' | 'hot' })`, cold by default;
  'hot' = running, power up, gyros run up - for units spawned into a fight). In the driver's seat the start-up is
  yours (I = MASTER + START, or click them); in any other seat the crew does it, each man his part, with the calls
  (DRIVER: MASTER ON / STARTING, GUNNER: TURRET POWER ON - STAB RUNNING UP / STAB UP). The gunner's I is TURRET POWER.
  Left alone the crew shuts down (fuel off, then MASTER and turret power off). `crankUp()` (orders, the LCM-8) starts
  at once. HUD line: COLD - MASTER OFF, the stab mode.
- **Crew in and out**: seated / standing figures in the M60's fighting compartment (gunner, commander, loader - each
  rises through his hatch when he rides head out, where the head-and-shoulders figure takes over), shown when you
  are inside; the M113's squad as before.
- **Sound**: switch clicks and relay clunks, hatch latch / slam, the stabiliser gyros' run-up whine.
- **Fixes**: the band across the gunner's periscope picture (the needle nose, the AN/VSS-1 searchlight and the shield
  were in front of the sight camera, which sat inside the turret): the sight eye is now at the sight head and the own
  tank is hidden while looking through it. The HUD weapons line wraps short of the message feed (`#weap` max-width),
  the centre message sits below the top-left block (`#msg` top max(22%, 236px)), the sight's TURRET POWER OFF note
  moved up out of the hint line. The M113 commander's head-out view was a wall (the cupola lid stood in front of his
  face): the lid now opens back past vertical and his eye is ahead of the hinge. The M60 at the home hard parked on mud
  past the top and slid (its gun dug in: MAIN GUN OUT before anyone got in - why the gunner "would not fire"): it now
  parks on the concrete 5 m below the top; a muzzle resting on the ground while the tank barely moves no longer bends
  the gun, and the gunner will not lay the gun into the ground (chase-view aim on the near ground ignored).
- Commander integration: `spawnAt(sp)` (cold / hot), `order(pts)`, `crankUp()`, `startUp()` stay plain calls.

Tests: `scenes/armorpolish.mjs` (every station: driver cold start by clicking, gunner power off / on, loader HEAT out
of the rack into the breech, commander override slew, crew head out / buttoned up under fire, HUD overlap check,
M113 driver start + RAMP switch, commander radio, LCM-8 run), `scenes/armorgame.mjs` (start-up keys added),
`scenes/armorprobe.mjs` (sight / periscope pictures looking down the hard), tankbench 73/73, armorgamebench 20/20.
Untested: the hover frame with a real captured mouse on a real GPU (headless fakes the pointer lock); gamepad / HOTAS
buttons for the switches (keyboard I / E cover them).

## 2026-10-24 — NGC-1980 infantry depth, fixes: the rich Marines' rounds, hands off the rifle in third person, AI grenades and carries (branch ngc/infdepth-fix)
- **"Both sides fire" (groundwar scene), counted right**: every round the near (rich) Marines fire already went through
  groundsim's `shoot()` into `GS.stats.shots[1]`; what was wrong was the rest of the count and the men themselves.
  `GS.stats.hits` now only counts hits by the ground war's own rounds (the Huey's door gun, rockets and the player's rifle
  go to the new `GS.stats.warHits`, so hits[1] can no longer exceed shots[1]); `GS.stats.richShots` counts the rich men's
  share. The scene counts from the Sea Knight's touchdown (`__s0`), and checks the rich men's rounds when any were rich.
- **Why it failed**: in a hot-LZ fight (13 Marines 15-60 m from 3 STRIDERs, `node` A/B of the same fights) the rich men
  fired a fifth to a half of the cheap model's rounds and lost twice the men - they held fire on every rush to cover
  (the cheap model fires on the way) and turned onto targets at 3.2 rad/s. Now: unsighted fire (2x the tolerance) on the
  run too, a 4.5 rad/s target transition (~0.35 s for 90 deg). Same fights after: cheap 1302 rounds / 15 KIA, rich 1104 /
  12. The scene's Sea Knight gets 400 hp (below half it loses an engine and turns for home - one run never landed) and
  the door gun thins the STRIDERs to two (SANDBAR is 60 m across: the LZ can't be far from them). 3 / 3 runs pass.
- **Hands off the rifle, third person** (`units/infantry/carepose.js`, `poseSkeleton`'s `pose.hands`): drag (crouched,
  both hands on the drag strap, a heave with each step back), fireman's carry (bent under him, right arm round his leg
  to his wrist, left hand on his back, `stand` targets that follow the pelvis down), buddy aid (bent over the wound),
  and the M67 / M18 drill (pouch, pin to the off hand, the arm cocked with the throwing shoulder turned back, over the
  top, follow-through; underhand). Blended in and out over ~0.25 s per figure (hand targets from wherever the hands are,
  the rifle slung onto the back by the same weight, spine / chest turn and pelvis drop scaled with it); the grenade in
  the right hand (`pose.grenade`) for the player and the AI. Player (marine.js) and AI (groundwar.js `careLook`).
- **AI Marines throw M67s** (game level): a man with one (2 per rifleman, `MARINE.LOAD.frags`), his target 10-30 m off and
  behind cover (or a STRIDER inside 20 m), none of his own within 12 m of it, ~0.3 / s chance: stops, kneels, runs the
  drill (`AI_DRILL`: 0.45 draw, 0.55 pin, 0.35 ready, 1.0 cook, 0.5 throw), lets go at a ~35 deg lob; the grenade
  (`GW_AMMO.m67`) lands, rolls a little and goes off when the 4.5 s fuse runs out (6 m blast, power 0.5). A man hit
  before he lets go keeps it (pin back in: GAME). No rifle fire with a grenade in his hand.
- **AI fireman's carry** (fieldcare.js): a litter case being dragged with nobody shooting and more than 12 m to go is
  lifted onto the shoulders (`BUDDY.carrySpeed`, 1.21 m/s) and put down at the CCP; the views put him across the
  carrier's shoulders (groundwar.js `carriedView`, as marinecare.js does for the player). Drag distance 0.85 m (hands on
  the strap).
- **Tests**: new scene `carepose.mjs` 11/11 (AI drag, carry, the drill phase by phase, a real throw and its burst);
  groundwar 10/10 x3, buddyaid 23/23, marine 15/15 (the leg-bleed check), foot 12/12, smoke 5/5; buddyaidbench 24/24
  (the "under fire" check passes again: the near men suppress), groundwarbench 33/33, infantrybench 90, medinvbench 109,
  marinebench and footbench all.
- **Gotchas**: (1) `BUDDY.carrySpeed` needs `sprint: true` in the mods it is given, or it is 0 - the carrier stood still
  for 240 s. (2) a trailing `//` comment on a long line swallowed `_want.aim = aim` again. (3) a landed Huey within 45 m
  of a casualty is a CASEVAC: the litter goes to the Huey, not the CCP (scenes: get out first). (4) a casualty's care
  record is dropped while `u.able` is still true (the same frame he went down): set it after one step.
- **Next**: the rich carrier walks at his rifleman's walk, not the carry speed (the body follows the soldier sim);
  a grenade in flight is not drawn; a man killed with a cooked grenade could drop it.
## 2026-10-24 — NGC-1980: the TOMCAT cockpit, clickable, with a cold start (branch ngc/tomcat-cockpit)
The player's F-14A pilot cockpit brought to the HORNET / HUEY bar: every control clickable with the hover frame and the
placard + current position on the hint line ("L GENERATOR  NORM / OFF  [NORM  -  ON LINE]"), a real start sequence on
the switches, real-state cautions, switch sounds, and the RIO visible behind you. Flight model untouched.
- **Start / electrics** (tomcatsys.js, pure: createStart / startPress / startStep / startPost / startAuto). NATOPS order,
  game-paced: deck power and the air start cart whenever the jet stands on the ALBATROSS; ENG CRANK R (a 3-way L - OFF - R
  switch on the right console), the starter motors the TF30 to 20% (~6 s), the right throttle's finger lift OFF -> IDLE
  (fuel + ignition), light-off at ~24% with TIT rising, the crank switch drops out at 50% (solenoid), the generator comes
  on line at 55%, idle 68%; then the left. Throttle IDLE before the crank turns it = a WET start: the light-off is a hot
  start (TIT ~1260 °C on the gauge, a little engine damage). Throttle OFF shuts an engine down. Airstarts use the same
  switches (cross-bleed off the other engine, or windmill air above 225 KEAS). L / R GEN NORM / OFF; no generator in
  flight = the EMERG GEN keeps the essential bus; no essential bus = every lamp and caption dark; no main bus = HUD, VDI,
  HSD, TID / DDD off. I runs the whole start on the same switches (right engine first), or shuts both down. The sim's
  e.start / e.run / e.n are the only things it moves (the motored rpm is set after each sim step).
- **Cold jet**: Y out leaves it cold (throttles OFF, crank OFF); Y back in, start it on the switches or with I. 8 on deck
  (respot) and a fresh Tomcat from the hangar are still hot on the cat.
- **Cockpit** (tomcatcockpit.js): left console redone (throttles with OFF / IDLE finger lifts and an IDLE stop, FUEL DUMP,
  AFCS: STAB AUG PITCH / ROLL / YAW + autopilot ENGAGE / ALT, VEC/PCD and ACL placards), right console redone (ELEC POWER:
  L / R GEN, the EMERG GEN guard; ENG START: ENG CRANK, AIR SOURCE; EXT LTS; canopy and parking brake T-handles; ECS /
  OXYGEN), panel placards per section. The emergency wing sweep handle now runs the right way (forward = 20°, aft = 68° /
  OVER), the red guard over the slot's forward end is its own click (EMER / AUTO), and the handle steps 5° fore / aft by
  click. Caution panel 28 captions (adds L / R OIL PRESS, EMERG GEN, TRANS/RECT), from the real state: GEN off line, OIL /
  FUEL PRESS with an engine stopped, HYD PRESS with no pump turning, START VALVE while cranking, CANOPY whenever it is open,
  the STAB channel switched off, plus the damage model's. Advisories (START VALVE, LADDER, SPD BRK, LAUNCH BAR) are green
  and do not light MASTER CAUTION (they used to chime). The hint line walks you through the start.
- **The RIO** as a figure: torso in the harness, white helmet with the visor down and a squadron stripe, oxygen mask and
  hose, the right hand on the hand control unit, the left on his console; his head works the TID and checks six every
  ~14 s, braced under g. Looking aft (head yaw past ~1.6) the eye swings round behind the neck and out beside the
  headbox, and the shoulders twist (up to ~165°), so you see him over either shoulder (as in the jet, not through the seat).
- **FUEL DUMP**: 1,500 lb/min from the mast at the tail, stops at 4,000 lb, not with weight on wheels; a white mist
  trail, a torch in the afterburner plume (dump and burn). STAB AUG: three channels (all three = the sim's SAS; any off =
  DIRECT and the autopilot drops).
- **Sound** (tomcatsound.js): click(kind) for every control that moves (toggle snap, push-button tick, handle clunk,
  throttle over its detent, guard, the crank solenoid in and its thump out at 50%, thumb switches); the huffer idles
  beside a cold jet on deck and roars while it cranks one.
- **Tests**: tomcatsysbench 43/43 (+11: motoring to 20% with no light-off on the starter alone, light-off / crank-out /
  generator order, one GEN off line, throttle OFF shutdown, wet start, no air, the auto start R then L, EMERG GEN in
  flight, an airstart on the crank switch). tomcatbench 32/32, airbench 28/28, jetbench 24/24, jetfingerprint
  bit-identical. Scene tomcatcockpit.mjs (new): 8 -> cat, Y out / Y in (cold), then through the real mouse path (hover,
  hint, mousedown): ENG CRANK R, throttle IDLE at 20%, light-off, crank out, R GEN, the left engine, MASTER CAUTION reset,
  STAB AUG pitch off / on, L GEN off / on, FUEL DUMP, the emergency sweep guard and handle (the wings follow to 30°), a
  wet / hot start, I shutdown and auto start, the RIO over both shoulders, back to the cat (MIL, the cat fires). The
  old preview-page close-ups are now tomcatpanels.mjs.
- **Known, not from this branch**: headless (SwiftShader, 3-4 fps) the Tomcat dies ('crash' at deck height, ~180 KEAS)
  at the end of the catapult stroke, so tomcat.mjs fails from the shot on. Reproduced with experimental's own game code
  (574ad1b) and a minimal 8 -> MIL -> shot scene; for whoever owns the deck / cat (something solid at the bow?).
- **Gotchas**: headless game time runs well below real time (the auto start needs minutes of wall clock: wait on state);
  the cockpit camera pulls the head back to centre unless the mouse is captured (scenes hold it with an interval, as
  hueycockpit.mjs does); a hit box parented to a moving lever (the throttle finger lifts) picks fine.
- **Untested**: by ear (headless is muted); the start on real HOTAS; the RIO's mirrors (the three canopy-bow mirrors
  are still plain metal).

## 2026-10-23 — Hercules polish: start flow, jump procedure, flight deck, sound, markings (branch ngc/c130-polish)
- **Engine start (c130fm.js)**, after T.O. 1C-130H-1 normal start and the OPS card: battery; the GTC (the C-130H's
  gas turbine compressor) comes on speed in ~20 s and puts bleed air on the manifold; with the condition lever at RUN
  the start button engages the air turbine starter (~95 N m at the engine, x13.54); fuel and ignition at 16 %
  (light-off ~3 s), TIT peaks ~775 C (normal start 750-830), the starter drops out at 60 % (~9 s), the fuel control's
  acceleration schedule takes it to ground idle (~14 s). No battery or no bleed air: no start; >60 s below 60 %: hung
  start, aborted. Later engines start on cross-bleed from a running one. Bench: 46/46 (the 38 plus 8 start checks).
- **Checklists**: a checklist card on the flight deck (by the pilot's left knee) shows what the crew is working
  through, ticked live: STARTING ENGINES (battery, GTC, bleed air, power levers ground idle, brakes, engines
  3-4-2-1 with rpm / peak TIT) and BEFORE TAXI on the ground; DESCENT, SLOWDOWN / AIRDROP (drop altitude, flaps 50,
  130 KIAS, stick hooked up, doors and deflectors, door bundle, jump lights) and COMPLETION OF DROP in the drop.
  dev/c130.html?start=cold + K: the flight engineer runs the start himself (one action every ~1.2 s).
- **Overhead**: BATTERY, GTC START, GTC BLEED AIR switches, GTC rpm gauge, engine oil pressure (50-60 psi) and
  temperature (60-85 C) per engine (OPS card bands); condition-lever labels moved inside their box.
- **Jump procedure (drop.js)**: the jumpmaster's commands by time to the release point (FM 3-21.220 order, compressed
  like the run): GET READY, OUTBOARD PERSONNEL STAND UP, HOOK UP, CHECK STATIC LINES, CHECK EQUIPMENT, SOUND OFF FOR
  EQUIPMENT CHECK ("OKAY!"), doors open / air deflectors out / platforms down, STAND BY on the red light, GO on the
  green. No jump before HOOK UP ("NOT HOOKED UP - HOLD"). The door bundle (A-21 bag on a G-14 cargo chute, new
  buildDoorBundle in jumper.js) goes out of the left door first; it lands short of the jumpers (no drive, ~28 ft/s);
  within 200 m of the helicopter on dry land the tools are recovered and the repair goes 1.5x faster. Each jumper's
  static line runs from the anchor cable over the door to his pack while it pays out (~0.6 s), then the spent line and
  its deployment bag stream aft from the door, flapping, until the jumpmaster pulls them in (~7 s after the last man);
  the doors close after that. The bail-out (alarm bell / shot down) skips all of it.
- **Sound (c130audio.js)**: each engine on its own stereo position (on the flight deck #1/#2 on the left; outside
  panned by where each prop is across the camera), the synchrophaser's slow hunting (the beat comes and goes), the
  flat-pitch buzz-saw on the ground in beta, the GTC's thin scream and bleed-air hiss. c130.mjs checks the graph runs:
  props 2-4 at 68 Hz (blade passage at 100 %), the feathered #1 winding down.
- **Exterior**: red DANGER PROPELLER bands on the fuselage in the plane of the props, wing walkway lines, the HF long
  wire from the flight deck roof to the fin.
- **Landing on the home island: decided against for now.** HOME ISLAND is a 260 m, hilly island (hills up to ~40 m);
  an assault strip needs a flattened bed in the terrain (world.js / world/net.js, other agents' files and the baked
  terrain). In this world a C-130 landing roll is ~70-80 m (a quarter of the real ~1,000 ft), but the approach and
  roll-out need a ~250 m flat, clear strip: the island has none. The test page lands on its runway; the bench lands.
  Next step if wanted: a dirt strip as a flattened bed in net.js, then a landing mode in drop.js.
- Tests: c130bench 46/46; c130.mjs 8/8 (adds cold start 3-4-2-1 with TIT < 830 and the sound graph), c130jump.json
  (new: jumpmaster stages, doors, bundle, trailing bags, retrieval) 4/4, drop.json 5/5 (the F press waits for the
  bundle, then the first man).

## 2026-10-24 — Hercules polish, part 2: crew in the hold, navigator, door bundle on the DZ (branch ngc/c130-polish)
- Reviewed and kept the stopped session's work (ground start, jump procedure, checklist card, sound, markings, the
  overhead gauges drawn three a frame); merged experimental (MODLOG conflict only: both sides kept).
- **Jumpmaster and safety visible (drop.js holdCrew, jumper.js poses 'doorcheck' / 'safety')**: from DOORS OPEN the
  jumpmaster does his door check in the left door (FM 3-21.220: hands on both edges, leaning into the slipstream,
  looking toward the nose for the DZ); the next jumper only steps into that door after the jumpmaster has pushed the
  door bundle. Then he stands at the aft edge of the left door facing the stick, controlling the static lines; the
  safety (the loadmaster) does the same at the right door. Both stay aboard and retrieve the bags; gone with the doors.
- **Navigator on the flight deck (c130cockpit.js)**: seated at the existing table (left, aft of the pilot), facing
  outboard, grease pencil on a jump-run chart (IP, CARP, DZ circle); his panel has the APN-59 search radar scope
  (green phosphor, 4 s sweep painting the DZ return at its bearing / range) and the APN-147 Doppler readout (ground
  speed and drift angle, real-equivalent knots like the ASI and DME). `seated()` takes a parent group now.
- **Door bundle on the DZ (drop.js predictPattern)**: the release point was set for the men alone, so the bundle (no
  drive, ~28 ft/s) landed ~70-150 m short, on WELLSPRING usually in the sea (c130jump: bundleOK false, 148 m). While
  the bundle is aboard, the computed impact point is 80 % of the way from the men's unsteered point to the bundle's,
  and the green comes with that point at the helicopter, not up to 35 m early. Now the bundle lands ~25 m short and
  the stick, which steers (~120 m of drive from 800 ft), still lands within 10 m (c130jump: bundle -24 m, men 1-13 m).
- Test hook: `drop.camLocal = [[x,y,z],[lx,ly,lz]]` puts the camera at a point in the aeroplane's frame (scenes).
- Tests: c130bench 46/46; c130.mjs 8/8 (new deck_navigator shot); c130jump.json 7/7 (adds the door check, the safeties,
  the stick in the door, bundleOK); drop.json 5/5; dropflak.json 1/1; smoke.json 5/5.

## 2026-10-24 — NGC-1980 wave 3 #2: INTERIORS - enterable buildings, doors / gates / hatches, the ALBATROSS inside, seats and occupants (branch ngc/interiors)

**What.** The lived-in world's buildings are now rooms you walk into, the carrier has a hangar deck, an island and a
bridge you can reach on foot, and people sit in the seats.
- **Buildings** (`game/js/interiors/rooms.js`, pure plans from the same seeded world items the worker draws): detached
  houses (1-2 floors: living room with tiled fireplace, sofa, armchairs, the telly with its aerial, sideboard; lino
  kitchen with units, cooker, sink, fridge, table; a 34-degree stair up the side wall to the bedrooms - double bed,
  bedside tables, wardrobe, dressing table - and the bathroom), cottages, terrace units (shops on the ground floor:
  grocer, newsagent, hardware, cafe - counter and till, shelves of goods, the freezer, sweet jars, news rack - or a
  home; a stair to the first-floor flat), the parish church (porch, two blocks of pews, pulpit, lectern, font, organ,
  chancel with altar and rail), the filling-station kiosk, barns (hay, sacks, the tractor), boat sheds (an upturned
  clinker dinghy, pots, oars), lock-up garages (a car, the bench, tyres) and the task force's **quonset barracks** -
  one by each island pad (bunks, footlockers, wall lockers, oil stove, the duty desk, rifle rack). Inner walls carry
  real window holes where the shell has glass (sills, curtains), skirting, ceilings with pendant lights.
- **Drawing** (`interiors/interiors.js`, `furniture.js`): rooms are built only within ~55 m of the camera (one merged
  geometry per building, <=2 builds a frame, dropped beyond 80 m). The shells stay the world's closed chunk meshes:
  rooms draw first (renderOrder -3), then a depth-only **punch** in front of each facade doorway (-2), then the world -
  so an open front door shows the hall, and from inside the shell's faces are culled (windows are windows).
  `world/kit.js` gable soffits now cover only the overhang (they were a false ceiling across every house).
- **Doors, gates, hatches** (`interiors/doors.js`, one registry): hinged house / shop / church / hut doors, barn and
  boat-shed double doors, up-and-over garage doors, ship's watertight doors (the dogs come off first), the bridge
  hatch, and a five-bar **gate in every field wall's gap**. Each leaf is a live collider (walls, vehicles; gates are
  soft: a tank goes through), drawn instanced, with synthesised latch / creak / dog / slam sounds. **F** opens or
  shuts the door you face (HUD: "F: OPEN THE DOOR").
- **Walking them** (`interiors/roomsolid.js`, `world/solid.js`): each enterable item is its walls with door gaps,
  furniture boxes, door leaves and floors (ground floor, upper floor round its stairwell, stairs as ramps, the front
  step and steps down a slope) instead of one box.
- **ALBATROSS** (`interiors/shipint.js` pure plan, `shipgeo.js`): the **hangar deck** at the lifts' lower stop (y 4.25)
  inside the hull's hangar sides, open to the three deck-edge lifts (chains across while a lift is up), deckhead
  beams and lights, fire curtains, the hangar deck control booth, spare engines on stands, tow tractors, a crash
  crane, tool boxes, drums, crates, fire stations, crew at work. The **island**: in through the port watertight door
  to Flight Deck Control (the Ouija board with its aircraft templates), a watertight door and inclined ladder down
  the trunk to the hangar deck, inclined ladders up to the O-5 **ready room** (16 ready-room chairs, status board,
  pilots), O-7 **flag plot** and the O-9 **navigation bridge** (helm, engine order telegraph, captain's chair to port,
  radar repeater, chart table, bridge-wing doors, glass all round), a ladder up through a **hatch** to the island top
  deck. Sailors, officers and pilots at their stations.
- **Seats and occupants** (`interiors/seats.js`, `crewfig.js`): a RIDE craft - Y at a free seat's door: the Huey's
  four-man troop bench, two seats by a CH-46's ramp (the AI crew flies you out; Y once it has landed; [ ] along the
  bench and on to the Huey's controls; V looks from outside); you are seen in the seat (a 1980 Marine, M16 between
  the knees). The Hornet now shows its pilot (HGU-33, visor, mask, harness) while someone flies it; a CH-46's 13
  Marines sit in the red troop seats until they file down the ramp; the MV-22's machine troopers stand in their racks.

**Shared-file hooks** (commented ngc/interiors): `ground.js` (deckH(x, z, y): layered ship floors inside the ALBATROSS
interior zones; interior walls replace ALB_BOXES when present; interior ladders; GR.stairAt / addStairs);
`platform.js` (settle reads the deck under the man's feet); `footsim.js` (stairs at a stair's pace; the grade probe
looks 0.8 m up, not 1.2 - the next deck overhead read as a wall); `units/infantry/soldier.js` + `marinesim.js`
(env.onStair: stairs are not Tobler hills); `marine.js` (F use + hint); `world/solid.js` (rooms, gates, ramps,
roomsNear / gatesNear / stairAt); `world/models.js` (door position / shop units from the seed, shared with the rooms);
`world/kit.js` (soffit); `main.js` (create, update, afterWar, map skips the RIDE craft, debug handles).

**Tests.** `tools/scenes/interiors.mjs` 18/18 (+ the gate when a farm is found): the island door blocks shut, opens,
in to FDC, the trunk door, down to the hangar deck, up O-5 / O-7 / bridge, the hatch blocks the ladder until opened,
out onto the top deck, Huey cabin seat in / out, a two-storey house's front door blocks / opens / the rooms, a CH-46
with its squad seated. `tools/scenes/interiorsprev.mjs` shoots `game/dev/interiors.html` (every plan cut away, the
ship interior, the crew figures). smoke 5/5, foot 12/12, marine 15/15; footbench, marinebench, infantrybench 90/90,
worldsolidbench 9/9, worldbench pass.

**Known / next.** Terraces' second floor and above, the church tower, pri-fly and the KRAKEN stay closed. Interiors
are lit by the sun like the outside (no interior lighting model). The punch hides other figures standing just
inside a doorway when seen from outside. AI soldiers do not open doors. Rounds do not hit the world's buildings
(as before). Field gates exist only where the far world has farms. The ALBATROSS layout fits experimental's island
model: if NAVAL's island changes (ngc/naval-polish: parts.islandBoxes / islandFloor), `shipint.js`'s ISL table and
the punch positions must follow it.

## 2026-10-24 — NGC-1980 WORLD polish batch 2: towns, harbours, farms, bases, damage, LOD (branch ngc/world-polish)

**What.** The lived-in world's towns and structures brought up towards the Hornet / Huey bar, authentic 1980.
- **Village institutions** (`world/townkit.js`, placed by `layout.js civic()`): the **pub** on the square (or on the
  main street when the square is full; hamlets 45 %) - painted ground floor, small-paned bay windows, fascia with its
  name in cream letters, the hanging sign on a wrought-iron bracket, lantern, hanging baskets, picnic tables and the
  landlord's car at the side. It is a one-unit `terrace` with `pub: true`, so INTERIORS fits it out: `rooms.js`
  shopUnit / shopKind make unit 0 a 'pub' (bar counter without a till, bottles on the shelves, three tables). The
  **village school** (Victorian board school: stone or brick, tall many-paned windows, BOYS / GIRLS porches, bell-cote,
  tarmac playground with hopscotch and a netball ring, iron railings, the red-triangle SCHOOL sign), the
  nonconformist **chapel** (gable to the street, arched windows, pediment door, date stone, railed forecourt), the
  **village hall** (models.js hall, as `vhall`). Schools / chapels / halls are solid, not enterable.
- **Street furniture**: the K6 kiosk (domed roof, TELEPHONE strip, glazing bars), the pillar box with its cap,
  1970s concrete lamp columns with sodium lanterns, litter bins, the 30 limit roundels and the village name board on
  every link road in, fingerposts in hamlets, bus stop flags.
- **1980 cars** (`townkit car2`): saloon (Cortina / Marina), hatchback, estate, Mini, Transit-style van - raked
  glasshouses, chrome bumpers, grille, lamps, white front / yellow rear plates, hub caps. Parked nose-in round the
  bigger squares (`pcar`, solid), the garden cars use them too (the drivable ones stay ngc/wheeledgame's crafts).
- **Harbours** (`layout.js harbour()`): a concrete slipway down to 2.5 m of water with a boat at its head, the hand
  crane on the quay edge, fish boxes, a heap of nets with floats, a fuel tank, the harbour office ashore, clinker boats
  hauled up on the hard (a real stationed hull: transom, sheer, thwarts, inside planking), mooring buoys in the bay.
- **Farmyards** (`layout.js farmyard()`): milking parlour with its feed hopper, a stack of small bales, the muck heap, a
  water trough, a tipping trailer, the farm Land Rover, and the **milk churn stand** where the farm track meets the road.
- **Weathering** (`kit.js Geo.weather / weatherAll`): every face a shade off its neighbours (keyed on its first corner
  so quads stay whole) and a grime / damp band darkening the bottom metre towards earth brown - on every building,
  the clutter, the faction structures, the AA emplacements. No extra vertices.
- **Building damage** (`world/damage.js`, `life.js`): every `fx.explode` (wrapped like ambient.js does) of size s within
  R = 2 + 2.4 s of a building's walls and below its roof does (s - 0.5)(1 - d/R)^1.5 against a game-level hp (house 2.6,
  cottage 2, terrace 3.4, church 6, ...). Past 45 %: DAMAGED (soot plumes from the windows, a burnt hole in the roof
  with rafters, glass and slates in the street, smoke). Past 100 %: DESTROYED - its vertex ranges in the chunk's merged
  near / far meshes (recorded per building in `dyn.bld`) collapse to a point and a ruin is drawn (wall stumps of broken
  heights, often a gable still standing, rubble heaps, charred beams leaning out, scorched floor), fire then a long
  smoulder, a scorch decal. Kept per building key (rooms.js planOf's), so a chunk streamed out and back in comes back
  ruined. `solid.js`: a destroyed building is one low soft rubble box (tanks push through), its rooms and doors go
  (the chunk's colliders are rebuilt; interiors.js drops the built rooms on its next scan). One small 'ruins' mesh per
  chunk with anything damaged. Tests / scripts: `__WORLD.damage.knock(x, z, 'damaged' | 'destroyed')`.
- **Faction structures** (`structures.js`): a **perimeter fence** round the back and sides of every 1980 site (concrete
  posts every 3 m on the real ground, four line wires, cranked arms with three strands of barbed wire), stepping round
  the pad, the AA slots and the other sites; a **sentry box** with a red-and-white barrier pole while we hold it.
  **AA emplacements** on each pad's four AA slots (`buildAASite`, placed by life.js, merged: 2 meshes an island): ours
  an earth revetment with sandbags on the lip, a gap facing the pad to drive in by, ready-use ammunition and a netted
  crew shelter; the machines' a ring of leaning ceramic plates with cyan seams. Follow island ownership.
- **Performance** (`chunkgen.js`): a third, **detail** level per chunk (street furniture, cars, garden / yard / harbour
  clutter: ~20 % of a town's near triangles) drawn only within ~240 m. The garage and the new buildings have far
  boxes. worldperf (same scene before / after, load average 110-145 on the shared box, so fps is noise): Huey over a
  wild town 984 -> 933 draw calls, 619k -> 574k triangles with more in the town; on the deck 556 -> 559 calls, 299k ->
  301k. Town chunk build in the worker 17 ms mean, 38 ms max (worldpolishbench); main-thread world cost unchanged.

**Shared-file hooks**: `interiors/rooms.js` (shopUnit / shopKind: the pub; shopFit 'pub'), `interiors/furniture.js`
(GOODS.pub). No main.js / war.js changes (the AA slot formula is repeated from war.js aaSlots, commented).

**Tests.** `node tools/worldpolishbench.mjs` 18/18 (pubs, schools, signs, parked cars, harbour gear, farmyards, every
building's vertex ranges, chunk build time, the detail layer, a bomb damages / two destroy a house, rubble colliders,
air bursts do nothing). worldbench ALL PASS, worldsolidbench 9/9. Scenes: `worldpolish.mjs` (preview: pub, school,
chapel, square cars, signs, two harbours, a farmyard, a village with every third building knocked about, the base
fences and AA emplacements) 1/1, `worlddamage.mjs` (in game: bombs on a town house, damaged -> destroyed with its
range collapsed, PELICAN's fence and AA sites) 4/4, world.mjs 4/4, interiors.mjs 20/20, smoke 5/5, worldprev 1/1.

**Known / next.** The square's parked cars are static geometry (not drivable, not shoved by vehicles). Fences and AA
revetments are not colliders. Door leaves of a destroyed building stay in the door registry (F can still find one in
the rubble). Ambient people still walk to a ruin's front door and chimneys of a ruin may still smoke. Damage is from
explosions only (not small arms). The zone villages are small and steep, so few of the new institutions fit there;
the terrain rebuild (ngc/terrain) will change which lots take them.

## 2026-10-24 — NGC-1980 HORNET + HUEY polish: 1980 F/A-18A and UH-1H authenticity, HOTAS 4 + T-Rudder defaults (branch ngc/hornethuey-polish)
- **HORNET thrust, the one flight-model change**: F404-GE-400 (1980 FSD and early production) instead of the 1990s
  -402 EPE: 16,000 lbf with afterburner (GE / Jane's Aero-Engines: CONFIRMED), ~10,600 lbf dry (sources 10,500-10,700:
  INFERRED) = TMIL 47,150 N / TAB 71,170 N per engine. jetbench 24/24 (M 0.94 MIL / 1.01 AB low level, cat end 188
  KEAS, approach unchanged); `tools/jetfingerprint.ref` re-baselined for this change only, SAME on all 12 scenarios since.
- **HORNET = FSD #3, BuNo 160777** (jetmodel.js): gull grey over white, full-colour insignia, the NATC fin band, fin
  span 2.5 m (the real fin height); the player's jet is always #3. **Cockpit** (jetcockpit.js): the F/A-18A layout -
  horizontal indicator and engine fuel display, monochrome DDIs (left DDI CHECKLIST page and caution messages), the real
  caution light panel (CK SEAT, APU ACC, BATT SW, FCS HOT, GEN TIE, FUEL LO, FCES, L / R GEN...), the warning /
  advisory lights left of the left DDI (L / R BLEED, SPD BRK, STBY, the red and green L BAR, REC, XMIT), threat lamps,
  UFC layout, HUD bank scale. **Start** (jetplay.js): BATT, APU (READY light), ENG CRANK R then L, generators on line,
  the crank refused without APU air; I still does it all. Voice alerts limited to the period's (ALTITUDE, FUEL LOW,
  BINGO - no GPWS "pull up").
- **HUEY = 1980 US Army UH-1H** (hueymodel.js): subdued black markings and fin serial, the WSPS wire cutter /
  windscreen deflector, APR-39 antennas, the crew chief on the right M60D. Cockpit: ENGINE INLET AIR caption (the
  20-caption panel in its 5 x 4 order), caution lamp TEST, a tail-rotor buzz in audio.js (2 blades x 5.123 x Nr = 55 Hz).
- **HOTAS 4 + T-Rudder defaults for both aircraft** (hotas.js, heli.js, main.js): one binding table, two meanings. The
  J panel labels say both ("LANDING GEAR · HUEY STAB ASSIST"). Huey: trigger door gun, 2 / 4 hoist, 3 rockets, 5 bombs,
  6 stability assist, 7 force trim, 8 landing light, 9 view, 11 starter (held; the real starter is the trigger under the
  collective grip). The throttle rocker is FLARES (right) / CHAFF (left) in every aircraft (the HOTAS 4 has 12 buttons, so
  the old 13 / 14 defaults did not exist); the panel now shows "HOTAS 4 ROCKER RIGHT / LEFT" for them, the device's
  short name is "HOTAS 4" so button numbers are not cut off. README: a button table for both aircraft.
- **Flight models unchanged** apart from the thrust above: jetfingerprint SAME (bit-identical, 12 scenarios),
  jetbench 24/24, hueybench 41/41, tomcatbench 32/32, airbench 28/28, hotas self-test (+ rocker test).
- **Scenes**: hornetcockpit.mjs 10/10 (panel, every display, cold and dark, battery-only cautions, APU, crank, checklist,
  voice alerts), hueycockpit.mjs 7/7, new hueyhotas.mjs 11/11 (a fake HOTAS 4 + T-Rudder through navigator.getGamepads:
  starter on button 11 to light-off, buttons 6-9, collective and pedals, the panel), jet.mjs 8/8, smoke 5/5.
- **Gotchas / untested**: the machine ran at load ~170 during testing, so wall-clock waits in the older scenes
  (hueystart.json, hueyhover.json, jets.json) time out at 1-5 fps (the game caps dt at 0.1 s, so sim time runs at a
  third of real time); hueystart / hueyhover / jets fail identically on a clean `experimental` checkout (checked).
  jets.json: the AI Tomcat stays on the cat there too; worth a look when the machine is quiet. hueyhotas waits on game state. Real HOTAS button numbering is from the Windows HID
  order (1 = trigger); not checked on the physical stick in this pass.
## 2026-10-24 — NGC-1980: THE COMMANDER - you command the task force, not the helicopter (branch ngc/commander)
- **What**: the player is TASK FORCE ALBATROSS's commander. `\` opens the **command board** (units/commander/board.js,
  DOM, the war keeps running while it is open): every unit type of the fleet - UH-1H Huey, F/A-18A Hornet, F-14A Tomcat,
  M60A3, M113A2, M151A2 jeep, M35A2 truck, a Marine rifleman - with its reserve, the unit that is out (where, doing what)
  and one key to take a unit out at the selected base (the ALBATROSS or any friendly island; LEFT / RIGHT) or switch to
  the one already out. No need to land the Huey first: 5 / 8 work from any unit too. `/` jumps to the next unit out.
  On the board R recalls a jet on CAP, X stands a parked unit at a base down into reserve; with no reserve left the
  board buys one for materiel (game costs: Huey 60, Hornet 80, Tomcat 100, M60 60, M113 30, M151 10, M35 20, Marine 5). The motor pool's types can have several out: ENTER switches to the nearest, N takes another out.
- **The unit you leave carries on.** A Huey in the air: her crew flies her home (units/commander/heliai.js) to the
  nearest friendly pad or the ALBATROSS's aft spot, through the real flight model's cyclic, pedals and collective (the
  bench pilot's loops from tools/hueypilot.mjs, with ground-velocity targets so the hover matches the moving deck, a
  sqrt braking profile en route, cruise 38 m over the highest ground ahead). A jet in the air (or rolling, or on the cat
  stroke): the escorts' own AI pilot (units/air/pilot.js) takes the airframe (units/commander/wingman.js: no weapons, no
  radar; CAP over the ALBATROSS, home at bingo or on recall, pattern, glideslope, trap, then she parks where the wire
  left her). `jetplay.js` / `tomcatplay.js` got a small `P.wingman(dt, pilot, aiEnv)` that steps the airframe through
  the pilot with the jet's own damage and leaks running; a crash under the wingman is a loss like any other. Vehicles
  park (brakes on). A Marine you leave goes back to his platoon (+1 Marine in reserve, only if he came from it).
- **Lives are the fleet** (units/commander/fleet.js, pure): a reserve per type (start: Huey 3 - the old lives - Hornet 2,
  Tomcat 2, M60 1, M113 1, M151 2, M35 1, Marines 6, besides what starts out: the Huey on deck, the M60 / M113 parked, the motor pool's stock).
  Taking a unit out costs one from reserve; losing one out there is counted (`fleet.lost`, LOSSES on the board); a unit
  that stands down goes back. `G.lives`, `G.jets`, `G.tomcats` stay as views of the Huey / Hornet / Tomcat reserves (the
  old scenes and menus read them). The HUD strip under the score replaces the HELICOPTERS / HORNETS / TOMCATS lines
  ("HUEY 2+1": two in reserve, one out). The war is lost when the fleet is spent: nothing in reserve, nothing alive out.
- **After a loss** of the unit you are in, the board opens on the next unit; unless you start choosing, the old crew
  timers (3.5 s on foot / in a vehicle, 3 s in a jet, the Huey's 2.4 s) hand you on: the Huey where she is (out of the
  hangar if a jet had the deck), else a new one from the reserve on the deck, else any unit that is out, else the board.
  A Huey lost while you are elsewhere is no longer replaced for free: the next one comes from the reserve.
- **Host hooks** (main.js, COMMANDER block): `roster` (one entry per type: out / active / status / can / deploy /
  switchTo / recall / standDown), `commandBases()`, `onUnitLost(id, why, mine)` (craftjet / crafttomcat `ctx.onUnitLost`,
  vehicle.js / armorcraft.js `ctx.unitLost(def, why)`), `autoNext()` (the hand-on), `heliHome()`; `resetZarch(fromPad,
  spot)` takes an island pad; craftjet / crafttomcat `launch({ command: true })`, `D.wing`, `D.recall()`, `D.status()`,
  `D.exit(next)` engages the wingman when she is flying. The WHEELED motor pool (ngc/wheeledgame) is two
  roster rows (`wheeledRow`: pool.spawners, pool.remove; wheeledcraft's wreck calls `ctx.unitLost` for military vehicles).
- **Tests**: `node tools/commanderbench.mjs` 32/32 - the ledger; the Huey AI to a pad 420 m away over a 40 m hill
  (lands 1.1 m off the spot, 0.32 m/s at touchdown), onto a deck steaming at 7 m/s (2.4 m off the aft spot, rides it
  after), out of a 45 m/s 25 m sinking run, staying down when landed; the wingman on the Hornet and the Tomcat airframes
  (CAP, recall, trap: 4 / 3 wire, no wave-offs) and climbing out low and dirty off the bow. Scene `tools/scenes/
  commander.mjs` 29/29: board open, a Marine on the deck, 5 from on foot (Hornet on cat 1, the Huey to the hangar, the
  Marine back in reserve), switch to the Huey (wingman flies the Hornet, recalled with R on the board), the Huey left in
  the air while you take the M113 (the crew lands her on the moving deck in ~30 s game time), `/`, a Tomcat on cat 1,
  the M60 knocked out (counted) and a new one at the home island motor pool, an M151 stood down and one out on the
  deck, the nearest M35 switched to and another out at the island (N), the parked Huey lost and a new one on the island pad, the M113 stood down and out at the island, the war clock
  running throughout, the Tomcat lost with you in it (the board opens, the hand-on puts you in the Huey), the wingman's
  trap and park on deck, and DEFEAT when the fleet is spent.
- **Known limits / next**: war.js still targets only the unit you are in (left units, the AI-flown Huey and jets
  included, can't be hit - as parked crafts before); one instance of each aircraft and armour type (one Hornet, one Tomcat, one
  M60...): a second of a type out at once needs the crafts made multi-instance; the wingman does not fight (the escorts'
  weapon logic wants their stores layout); the Huey's crew lands at the aft helicopter spot even if a jet sits there;
  no gamepad navigation on the board (keyboard and mouse); the LCM-8 deliveries (9 / 0) and the motor pool's deliveries (7) keep
  their materiel costs and don't touch the reserve (9 / 0 move the single M60 / M113).
- **Regression** (after merging experimental with the WHEELED motor pool): smoke 5/5, menu 9/9 (its last step now spends
  the whole fleet), marinelife 10/11 (the miss is its TEST CAR step: the car is gone since ngc/wheeledgame, fails on
  experimental too), foot 12/12, rescue 2/2. jets.json, damage.json, jetsystems, jettrap, vehicle, tomcat and armorgame
  fail the same checks on the untouched experimental tree on this heavily loaded headless machine (1-8 fps: timing).


## 2026-10-24 — NGC-1980 TERRAIN (wave 3 #1, branch ngc/terrain): real islands and one surface table
What: the 17 control-zone islands rebuilt in `game/js/world/terrain.js` (pure, node-safe), replacing the old dome
islands (`hills * 0.7 + 9` under a radial land mask, cliffs all round). Island positions and `I.r` are unchanged (the war,
nav, AA rings and every scene depend on them); the coastline now sits at ~1.0 r (was ~0.78 r), so land area is up ~60%.
- **Geology per island** (granite / volcanic / limestone / sandstone): rock and sand colours, ruggedness, tors, cliff height.
- **Shores** blended by angle: BEACH (in a cove on the big islands - a bay with a stream valley behind it - or on a spit
  on the small ones; the low fuel islands are sandy cays with a ring of beach and salt marsh inside), CLIFF (6-20 m faces
  on the exposed side of the high islands, deep water at the foot, 1-3 sea stacks off each), ROCKY (low bank, shingle strand).
  Beaches face open water (fetch scored round each island; never into the narrow channels, never across the cave strip
  or IRONHOLD's shipyard). Beach profile: shoreface 1 in 14-22 to ~2.5 m, shelf 1 in 8 beyond (offshore the shore
  weights are blurred so the shelves spread naturally), swash zone, berm at 1.5-1.9 m, two dune ridges (blowouts, a gap
  where the stream / the beach exit cuts through), then the island's ground.
- **Inland**: a plateau at the pad / base height (so the pads, shaft aprons and ground over the caves sit on natural
  ground), rolling ground, 1-3 ridged peaks off the pad (volcanic main peak with a crater), granite tors, stream valleys
  from the bays (floor 1 in 12, ending before the base apron). Near-camera relief: grass hummocks, boulders on rock.
- **Grid**: everything is baked once per thread into a 1.25 m grid over +-760 m (heights + surface ids), 0.45-0.95 s
  (node / headless); `zoneH` is a bilinear lookup, so `rawH` in the zone got ~6x cheaper (islandH 1025^2: 739 -> 111 ms).
- **Surfaces** (`SURF_NAMES`): grass, sand, wetsand, rock, mud, dirt, shingle, marsh, from height, slope, shore kind,
  dune / valley / tor flags and noise. `SURFACE[name]` = { mu, crr, sink, speed, skid, tyre, soil, foot }: Wong (Theory of
  Ground Vehicles, tables 1.2 / 1.4 / 2.1) ranges, values INFERRED inside them; skid = steel skid shoe vs concrete, INFERRED.
  Who reads it: ground.js (`GR.sample` now also gives skid and the sea bed `bed`; new `GR.surfaceAt` / `GR.surfAt`),
  foot (speed / footsteps via marinesim SURF_MAP), the TEST CAR, armour (armorworld `o.surface` -> trackfm SOILS: marsh is
  bog), the ground war's AI tracks (groundsim), the Huey's skids (hueyfm `env.surf`: skid grip x skid factor), the
  Tomcat's tyres (airframe `env.surf`: mu and rolling drag on soft ground; concrete / deck / benches unchanged, Hornet
  fingerprint bit-identical). Roads stay WORLD's provider (road / dirt), pads and shaft aprons 'road'.
- **Landing beaches** replace the concrete LANDING HARDS: `beaches()` gives each cove's waterline point, inland axis, top
  of the sand, run-in; same shape as a hard, so `HARDS` in main.js now holds them and armordelivery's hard path lands the
  LCM-8 on the island's main beach (toe in ~0.55 m of water, ramp -15 deg). The main beach's exit is a dirt track up the
  valley / to the plateau, no mud or dunes on it; villages, lots and cottages keep off the landing corridor (net.js).
  `GR.beach` prefers the terrain's beaches. landinghard.js / buildHardMesh are no longer used (left for the armour files).
- **WORLD refit**: villages are found on the new ground as before (net.js zoneNet on rawH); the zone lanes are now graded
  on the ground main.js makes (shaft apron, pad, ground over the cave), start on the pad apron at its height between the
  war's sites (AA diagonals, HQ / production slots), are routed round the shaft; main.js keeps road beds across apron blends.
  Non-cave pad blend r1 52 -> 44 (main PADS, net padOf).
- **Rendering**: heightmap at 1.25 m (1025^2), a surface-weight texture (RGBA8 linear: sand, rock, mud, dirt; grass the
  rest), island id in the decor texture's blue channel for the geology colours; a FINE 1.25 m grid +-50 m round the camera
  while it is under 70 m above the ground, stitched to the 2.5 m grid (edge vertices take the coarse edge's height); the
  main grid has a hole under it (separate index range drawn only when the fine grid is off). Land colour only where land.
  Trees only on grass / dirt. Minimap shows sand, rock, marsh.
Tests: `scenes/terrain.mjs` 13/13 (load cost, beaches, surface API, pads / shafts / caves, zone roads 0/97 off the ground,
zone buildings 0/84 floating or buried, LCM-8 plan on every island, views); `scenes/terrainfps.mjs` before / after;
smoke 5/5; benches all green (armorgame 20/20, groundwar 33/33, foot, huey 41/41, tomcat 32/32 + Hornet bit-identical,
naval 22/22, infantry 90/90, runaway 48/48, wheeled, tank 73/73, world, worldsolid 9/9, cave).
FPS (headless SwiftShader, res 0.45, the same 4 fixed views, base = 7f56098 run back to back, ms/frame):
  low over home shore 231.7 -> 191.9, 180 m over home 281.9 -> 206.5, low pass at CITADEL 142.1 -> 131.1,
  chase cam at home 251.7 -> 239.6 (JS sim/prep/render ms lower or equal; triangles +4%, draw calls -10..-40%). Run to
  run noise on the shared machine is +-20%: read it as "no regression". The first fine-grid version (80 m, overdrawn by the
  main grid with a discard) cost ~+25%; the hole and the 50 m / low-only rule took that back.
Gotchas: the polar shore profiles need `mix(h, E, sm(0.62, 0.3, t))` or the centre gets a seam; a beach weight wider than
its bay notch puts sand along the bay's flanks in radial wedges; villages love the flattest land, which is the landing
beach (reserved now); the zone lane from the pad crossed an AA slot and stopped the M60.
Untested / next: islands are still 110-260 m across (real scale would mean moving them: the war's job); no streams of
water (valley floors are mud); the waterfish agent should read `zoneH` (sea bed), `shoreAt` and `beaches()` for shallows.
