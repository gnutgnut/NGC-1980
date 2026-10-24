# NGC-1980

**1980.** Machines from the runaway star NGC-1980 have made a one-way jump back in time to Earth, bringing their own
war machines and modern weapons from our future. A joint Cold War task force is sent to stop them.

A browser game in Three.js (formerly *Thrust Zarch: The Island War*) that grew out of *Zarch*, *Thrust*, *Raid on
Bungeling Bay* and *Carrier Command*. Design bible: [docs/ngc1980/BIBLE.md](docs/ngc1980/BIBLE.md).
You fly a simulated helicopter from the deck of your carrier, the ALBATROSS, across a sea of 17 islands.
The enemy carrier KRAKEN is out there doing the same, and whoever controls the map wins.

![The KRAKEN and the enemy battleship](docs/screenshot.png)

## What's in it

- **Endless world.** The 17 islands are the CONTROL ZONE, where the war happens. Past it the world goes on for ever: open sea, then continents with coasts, forests and mountain ranges over a kilometre high, all perfectly flyable, just without objectives.
- **A lived-in world.** Villages and market towns with churches, shops and pubs, harbours with piers, trawlers and gulls, farms with walled fields, cows and sheep, lighthouses, radio masts and power lines, joined by a real road network (tarmac, lanes, farm tracks, bridges) that the ground is levelled for. People walk the streets and run indoors when the shooting starts; 1980 cars, vans, lorries and tractors drive the roads. The same world every run.
- **Two kinds of base.** Our 1980 sites (sandbagged HQ bunker, fuel farm with a nodding pumpjack, quonset-hut depot, a TPS-43 radar on its trailer) and the RUNAWAY's machine structures, which grow out of the ruins when they take an island, string glowing power pylons across it, and are left as dark shards when we take it back. Hits leave them smoking and scorched, then in ruins.
- **Archipelago and fog of war.** You only see what your helicopter, carrier, drones and islands can see. Radar islands see further.
- **Capture islands.** Silence the owner's AA guns, then land on the pad or send a CH-46 Sea Knight with a Marine squad (command 1). Fortress islands hide a cave: fly down the shaft, Thrust-style, and steal the pod. Every cave is procedurally generated (the same island always has the same cave), and the heavier the fortress, the deeper and more twisted its cave and the more turrets guard it.
- **Economy.** Islands produce fuel and materiel. Spend materiel on Sea Knight landings, AA guns, spare helicopters and escort fighters.
- **An enemy commander.** It sends RUNAWAY MV-22 Ospreys full of machine troopers to take islands, swarms of RW-3 WASP ducted-fan drones to hunt you, fortifies, raids your carrier, ships supplies in autonomous container ships, and builds the LEVIATHAN railgun monitor in its factories to hunt the ALBATROSS. Bomb the factories to slow it down.
- **HORNET carrier jet.** Land on the ALBATROSS and press 5: an F/A-18-style fighter on the catapult. Full 6-DOF flight model with a Hornet-like flight computer, a 3D cockpit with a conformal HUD and working displays, catapult launches, arrested landings, gun, AIM-9s and CCIP bombs, ejection. Built for a T.Flight HOTAS 4 and rudder pedals with toe brakes (any stick, pad or keyboard works).
- **Fly the TOMCAT.** Land on the ALBATROSS and press 8: an F-14A on cat 1 (two in the hangar). The AI escorts' real flight model (swing wings on the CADC, TF30s that stall at high AoA, a mechanical stick with stability augmentation and no limiter) with a 1980 analog cockpit: the AVG-12 HUD, the VDI and HSD CRTs, steam gauges (AoA in units, airspeed / Mach, altimeter, VSI, accelerometer, the wing sweep indicator, TF30 RPM / TIT / fuel flow / nozzles, fuel), the caution panel, the throttles' sweep switch and the emergency sweep handle (OVERSWEEP on deck), pitch trim and the autopilot; every switch clickable, and a cold start on them (ENG CRANK, the throttles OFF -> IDLE at 20%, generators, a wet start if you rush it). The RIO sits behind you. Change to the RIO's seat for the AWG-9's TID and DDD (hook, lock, launch Phoenix and Sparrow) while the pilot flies where you tell him. Warnings are 1980 tones and lights, not a voice. Ejection takes both of you.
- **Tomcat escorts and the RUNAWAY air arm.** Press 4: an F-14A Tomcat goes to the ALBATROSS's bow catapult and an AI pilot flies its real flight model (swing wings, TF30s, mechanical stick) through stick, pedals and throttle: catapult shot, CAP over the ship or the island you selected, intercepts and dogfights with game-level missiles and the gun, bingo, the carrier pattern and an arrested landing (with wave-offs and bolters). The enemy answers with RW-4 SHRIKE fighter drones off the KRAKEN, an MQ-9 REAPER that hunts for the ALBATROSS and SHAHED drone salvos. Watch them alone on `game/dev/air.html`.
- **Para-drop repair team.** Downed on land? Press L and home base sends a steel dropship from over the horizon. You fly it in from the flight deck with a real fixed-wing flight model (or let the autopilot), line up the jump run against the wind, jump on the green light, then steer the canopies down; whoever lands on dry ground runs over with fuel and fixes the helicopter. Enemy flak can bring the dropship down.
- **Para-drop repair team: the KC-130 Hercules.** Downed on land? Press L and home base sends a Marine KC-130R from over the horizon with a repair team. Fly it in from a full 1980 flight deck (or let the crew and autopilot do it) on a real C-130H flight model: four T56 turboprops with governed propellers, beta, feathering and engine-out handling, Fowler flaps, the blown wing. Slow to 130 KIAS with 50% flaps, call the green light, and the stick goes out of both para doors under MC1-1 canopies that you steer down. Whoever lands on dry ground runs over with fuel and fixes the helicopter. Flak knocks out engines and can bring the Hercules down.
- **SKY CARRIER.** Spend 300 materiel (6 on the map) and the ALBATROSS is refitted with four ducted lift fans and takes to the air. Land on her and press Tab to stand on the bridge: wheel, speed telegraph and lift lever, all slow and heavy. Send her anywhere from the map and she flies over the islands; flak can bring her down.
- **UH-1H Huey.** A Bell UH-1H with a validated flight model (teetering two-blade rotor with the Bell stabilizer bar, translational lift, ground effect, vortex ring state, retreating blade stall, a T53 engine with governor and freewheel so autorotations work), a full 3D cockpit with live instruments and the real caution panel, an authentic (optional) start sequence, the two-blade "wop wop", and a damage model where hits cause failures you can survive and repair. Built for a T.Flight HOTAS 4 + T-Rudder pedals: stick = cyclic, throttle lever = collective, pedals (or twist) = anti-torque; keyboard works too with the stability assist.
- **Ships that live and move.** The ALBATROSS is a 1980 Midway-class big deck in haze grey with a working deck: crew in coloured jerseys, tractors, Tilly, parked Hornets and Tomcats, an LSO team, the meatball, SPS-48 and SPS-49 turning, boiler smoke from the funnel. The enemy has a seized 2030s Ford-class supercarrier (the KRAKEN) refitted by the machines, the RW-9 LEVIATHAN railgun monitor and autonomous container ships. Every ship heaves, pitches and rolls on one live sea, the same waves you see: a swell from the west-south-west, whitecaps that build with the sea state, wind streaks in a gale, surf on the beaches and foam round every hull. Set the SEA STATE (0 glassy to 7 high) in the pause menu, or turn on WEATHER DRIFT and let it wander over the war. The ALBATROSS's three deck-edge lifts work: walk to the console at the deck edge (or stand on a lift) and press U to take it down to the hangar door with whatever is spotted on it. Parked aircraft are solid. Wakes, bow spray and smoke follow each ship's real track.
- **Air defences you can read.** Our islands are guarded by the Soviet contingent's ZSU-23-4s, and command 2 builds M163 Vulcans; the ALBATROSS carries two white-domed close-in guns and two box missile launchers. The RUNAWAY field seized 8x8 gun-missile trucks and, on their strongholds, the RW-5 LANCE laser; their ships carry the same TALON gun-missile modules and LANCE turrets on deck. Every one of them has to see you (terrain blocks it) and lock on before it fires, and shows it: radars stop and point, barrels spin up, lamps blink faster, the LANCE glows and paints you with an aiming line, and a lock and missile warning sounds in the cockpit. Missiles steer but turn at a capped rate and go dumb if you drop behind a hill; smoke stops the laser. Stay low.
- **Get out and walk.** Land the Huey (or stop a Hornet on deck), press Y and climb out: walk the carrier's deck while she sails and turns (you stay where you stand), climb the island ladder to its roof, go over the side and swim to the stern ladder, walk onto an island pad and hold it. Villages are solid: houses, churches, field walls and hedges stop you, piers and bridges carry you. A placeholder Marine with an M16 for now; the real infantry, weapons, medical and inventory plug into slots (see [docs/ngc1980/FOUNDATION.md](docs/ngc1980/FOUNDATION.md)).
- **Real islands.** The 17 islands have their own geology (granite, volcanic, limestone, sandstone: the rock and sand colours), sand beaches in coves and on spits with dunes behind them, cliffs and sea stacks on the exposed sides, stream valleys, hills and tors, salt marsh on the low fuel islands, and a sandy shelf you can see through the shallows. What the ground is made of (sand, wet sand, grass, rock, mud, shingle, marsh, dirt tracks, roads, concrete) is one table that the boots, tyres, tracks, skids and landing gear all read: tanks bog in the marsh, the Huey's skids plough in sand, a truck rolls hard in it. Near the ground the terrain is drawn at 1.25 m, the same grid the physics stands on.
- **Drive.** M151A2 MUTTs and M35A2 trucks wait at every friendly island's motor pool and on the ALBATROSS's deck park; walk up to a door and press Y. The real wheeled sim (tyres, suspension, gearbox, fording, rollovers) on the roads, bridges and fields of the lived-in world, through fords and on a carrier deck that sails and turns under you. Man the M151's pedestal M60 or the M35's ring-mount M2 and fire on the RUNAWAY; their fire punctures tyres, holes radiators and fuel tanks, sets the truck alight and wounds the Marine riding in it. Board six Marines into an M35 at a pad (B) and they take the next pad with you. Commandeer the 1980 Land Rovers, Hilux pickups, Beetles and Ladas parked in the towns (the traffic on the roads is the same cars). More from the motor pool: 7 then 1 = an M151 slung in under a CH-46 (10 materiel), 7 then 2 = an M35 landed on the island's beach by an LCM-8 (20). They stand cold: start them in the cab (ignition / ENGINE switch, START; every switch and lever clicks: blackout lights, wipers, parking brake, extinguisher), and they stall, overheat, get flat tyres (T: the spare) and burn. Keyboard, gamepad, HOTAS or a racing wheel and pedals (paddles shift, clutch pedal for the manual box).
- **AI rotorcraft that really fly.** The CH-46E Sea Knight (tandem rotors, differential collective, longitudinal cyclic trim), the RUNAWAY's seized MV-22B Osprey (tiltrotor: nacelles convert from helicopter to airplane mode inside the conversion corridor) and the RW-3 WASP (ducted fan) each have a physical flight model checked against published data, and an AI pilot that flies it through stick, collective, pedals and nacelles: deck launches from a moving carrier, terrain-following transits, decelerating approaches, touchdowns beside the pad. On deck the stick waits in two files clear of the rotors and files up the ramp, the blue shirts pull the chocks and chains and the LSE (yellow; cyan on the KRAKEN) signals the lift; approaches are flown down a glide path with a real flare, with a wave-off when too high, too fast or the zone is fouled. Marines run off the Sea Knight's ramp and take the pad; the Osprey's machine troopers march out in lock-step. WASPs strafe, snipe from a hover, lie in ambush behind hills and circle in eerie swarms. Watch them on `game/dev/rotary.html`.
- **Armour: M60A3 TTS and M113A2** (on their test ground for now, `dev/tank.html`; they join the war in the next wave). A tracked-vehicle simulation with torsion-bar roadwheels, track-soil shear and sinkage on road, grass, sand, mud and bog, a real drivetrain (diesel, torque converter, cross-drive with pivot turns / controlled differential), steps, trenches, slopes, fording, and the M113 swims on its tracks. The tank has a stabilised turret, laser rangefinder and ballistic computer, day and thermal (TTS) sights, a loader, coax and .50; both have full crew interiors (driver's periscopes and gauges, gunner's station, commander's cupola, the M113's troop compartment) and synthesised engine, track and gun sound.
- **Wheeled vehicles (NGC-1980).** M151A2 MUTT, M35A2 6x6 "deuce", Land Rover 109, Toyota Hilux, VW Beetle and Lada 2101, all drivable on one shared vehicle model: real tyres, suspension, gearboxes, transfer cases and diffs, engines that stall and drown, fording, rollovers, damage that punctures tyres and sets fuel tanks alight, 3D cabs with live gauges and synthesised engine sound. Test drive them on `game/dev/vehicle.html`.
- **The ground war.** The islands are fought over on the ground. The Osprey's machine troopers come off the ramp as RW-1 STRIDERs (balancing bipeds that stumble when hit, fall, get up) in squads of four that bound, flank and suppress, take the pad and hold the islands the machines own; from four minutes in the enemy sends RW-7 hover tanks across the sea from the KRAKEN, and from nine a seized LCAC runs a seized M1A2 or T-90M (on the TANK track sim) up a beach. Your CH-46 lands a reinforced Marine squad (SL, three fire teams, an attached M60: M16s, an automatic rifleman, M203s and M72 LAWs, the INFANTRY agent's soldier model) that moves, gets down under fire, bounds by fire teams round the flank with more cover, aims for the STRIDERs' legs and sensor heads, and takes casualties (killed and wounded). Command 1 can now also send Marines to reinforce one of your islands the machines have landed on. The machines shoot back at you, your Huey, your AA sites and your Marines; your door gun, rockets, bombs and the Hornet's cannon hurt them, and a helicopter overhead decides a fight. Clear the LZ first: a Sea Knight landing next to a TALON or a squad of STRIDERs gets shot up.
- **Wounded and the corpsman.** Each Sea Knight stick brings its Navy corpsman (HM3). Marines near you fight on the real rifleman and medical sims: a hit man bleeds, goes down, calls out ("CORPSMAN UP!"), crawls to cover and treats himself; the corpsman runs to him under fire and works out of his Unit One bag (tourniquets, dressings, morphine, the IV only he may start); buddies drag the litter cases to the casualty collection point by the pad, the walking wounded walk. You can treat them (F: their HEALTH screen with your kit), drag them (Shift+F) or fireman-carry them (F) and load them into your Huey; bleeding yourself, the corpsman comes to you. Land the Huey by the wounded and they come aboard (six litters); a Sea Knight takes the island's wounded home too. Delivered to the ALBATROSS, they are back in the pool four minutes later and fill seats on the next Sea Knight (less materiel). The dead keep their kit for you to search.
- **Armour: M60A3 TTS and M113A2**, playable on the islands (the M60 waits at the home island motor pool, the M113 on the ALBATROSS deck; 0 / 9 land another by LCM-8 on a friendly island's landing beach). Crew seats at the hatches (driver, gunner, commander, loader; the M113's driver, commander and 11 troop seats), the gunner's day and thermal sights full screen, rounds through the island war, RUNAWAY fire into the armour model (components, crew, fire, cook-off). The test ground is `dev/tank.html`. A tracked-vehicle simulation with torsion-bar roadwheels, track-soil shear and sinkage on road, grass, sand, mud and bog, a real drivetrain (diesel, torque converter, cross-drive with pivot turns / controlled differential), steps, trenches, slopes, fording, and the M113 swims on its tracks. The tank has a stabilised turret, laser rangefinder and ballistic computer, day and thermal (TTS) sights, a loader, coax and .50; both have full crew interiors (driver's periscopes and gauges, gunner's station, commander's cupola, the M113's troop compartment) and synthesised engine, track and gun sound.
- **Life in the sea.** Schools of pilchard, mackerel, grey mullet and amberjack swim round wherever you are (boids, each species at its own depth and over its own water), scatter from ship hulls, rotor downwash, swimmers and landing craft, and a shell in the water leaves fish stunned belly-up at the surface. The water is clear: sand, sea grass and caustics show through the shallows by the beaches. In the water on foot, hold C to dive: under the surface the view turns to the sea (fog, the sea bed, the sky through Snell's window). `node tools/fishbench.mjs`, `tools/scenes/fish.mjs`.
- **Effects that build up.** Smoke columns, fires, scorch marks, debris and oil slicks stay on the map.

Win by sinking the KRAKEN or taking IRONHOLD. You lose if the ALBATROSS sinks or you run out of helicopters.

## Run it

It's static files with no build step. Serve the `game/` folder and open it in a browser:

```
node tools/serve.mjs          # http://127.0.0.1:8765/
```

Any static server works (for example `npx serve game`). On Windows, `game/start.bat` does the same and opens the browser.

**Desktop launchers (Windows + WSL).** `bash launcher/install.sh` (run in WSL) puts two icons on the Windows desktop:
**Thrust Zarch** runs this checkout (`main`, port 8765) and **Thrust Zarch EXPERIMENTAL** runs the `experimental`
worktree next to it (port 8766, the icon with the orange EXP band). Each click starts that build's server inside WSL
(or reuses it) and opens the browser, so both builds can run side by side. Set up the experimental worktree once with
`git worktree add --track -b experimental ../thrust-zarch-experimental origin/experimental`, and `git pull` there to
update it. The launcher lives in `%LOCALAPPDATA%\ThrustZarch` (log: `launcher.log`).

**World preview and checks.** `game/dev/world.html` shows the lived-in world on its own (`?focus=town|village|hamlet|harbour|farm|bridge|zone`, `?structs=1` for every faction structure in every state, `?lod=far`). `node tools/worldbench.mjs` checks the road network and its determinism in node and draws a map to `tools/runs/`. `?noworld` turns the towns and traffic off (for A/B frame timing).

## Controls

| Key | Action |
|---|---|
| Space / Shift, Ctrl / Z | collective up / down |
| W A S D or arrows | cyclic |
| Q / E | pedals (anti-torque; the Huey needs some left pedal in the hover) |
| F / G / B | gun / rockets / bombs |
| Insert or ; / Delete or ' | M130 dispenser: a pair of flares (decoys a missile) / chaff (breaks a radar lock); HOTAS 4: throttle rocker right / left |
| R | winch (pick up the pod in a cave) |
| M | command map: click the sea to sail the carrier, click an island to select it |
| 1-4, 6 | send drone, build AA gun, spare helicopter, Tomcat escort (CAP over the selected island, else over the ALBATROSS), SKY CARRIER refit |
| 1-5 | send a Sea Knight + Marines, build AA gun, spare helicopter, escort fighter, SKY CARRIER refit |
| Tab | take / leave the SKY CARRIER helm (landed on her deck) |
| V / C | cockpit view / chase camera |
| H | stability assist on/off (on: the cyclic holds attitude, pedals hold heading; default for keyboard) |
| J | controls panel: bind and calibrate HOTAS / pedals (throttle lever = collective, pedals or twist = anti-torque) |
| I | engine: cut the fuel (autorotate) / with the engine stopped, the one-key start |
| PgUp / PgDn, Home | throttle twist grip (idle detent ... full open), starter (hold to 40% N1) |
| U / N / O / L | hydraulic control, landing light, fire extinguisher, call logistics (on the ground) |
| Esc / P | menu: resume, call logistics, respawn on the carrier if stuck, cockpit FOV slider, quit |

Radar warning: the Huey has an AN/APR-39 scope right of the pilot's instruments (a green strobe toward each radar painting
you, longer as its lock builds) with LOCK / MISSILE / LASER lamps and the M130's FLARE / CHAFF counters; the Hornet has an
RWR scope right of the UFC (threat letters: 8 the TALON truck, L the LANCE, W a WASP, A other guns, M a missile) and the
lamps and ALE-39 counters left of it. Outside the cockpit a small scope with LOCK / MISSILE LAUNCH / LASER shows top left
while anything tracks you. Flares and chaff rearm on the carrier and friendly pads.

The Huey spawns hot at flight idle and rolls the throttle on by itself. With `?cold` it starts cold and dark: BAT and MAIN FUEL on, throttle to the idle detent (PgUp), hold the starter (Home) to 40% N1 (light-off at ~12%), let it reach idle (~70% N1), then throttle full open to 6600 rpm. The cockpit switches (battery, generator, inverter, main fuel, governor AUTO/EMER, hydraulic control, force trim, low rpm audio, starter, master caution) are clickable. To autorotate: collective down to keep 324 rpm, 70 kt, flare at ~100 ft, cushion with the collective.

### HOTAS 4 + T-Rudder defaults (both aircraft)

With nothing bound, a Thrustmaster T.Flight HOTAS 4 and T-Rudder pedals work as below (J opens the panel: every row
shows what the button does in the jets and, after the dot, in the Huey; BIND / DEF / CLR change it per device).
Stick X / Y = stick / cyclic, throttle lever = throttles / collective, pedals (else the stick twist) = rudder /
anti-torque, toe brakes = wheel brakes, hat = look around (Huey: door gun aim), throttle rocker right / left = flares / chaff.

| Button | HORNET (and Tomcat) | UH-1H |
|---|---|---|
| 1 (trigger) | gun | door gun |
| 2 | weapon release | hoist |
| 3 | missile (press again to fire) | rockets |
| 4 | speed brake (hold) | hoist |
| 5 | bombs | bombs |
| 6 | landing gear | stability assist |
| 7 | flaps (AUTO / HALF / FULL) | force trim |
| 8 | tail hook | landing light |
| 9 | cockpit / chase view | cockpit / outside view |
| 10 | zoom (hold) | - |
| 11 | wheel brakes (hold) | starter (hold to 40% N1; the trigger under the real collective grip) |
| 12 | eject (hold 1 s) | - |
### COMMAND (you command the task force)

You are TASK FORCE ALBATROSS's commander, not one helicopter crew. **\\** opens the command board (the war keeps
running while it is open): every unit type of the fleet - UH-1H Huey, F/A-18A Hornet, F-14A Tomcat, M60A3, M113A2,
M151A2 jeep, M35A2 truck, a Marine rifleman - with how many are in reserve and the one that is out (where it is, what
it is doing). Pick the base with LEFT / RIGHT (the ALBATROSS, or any friendly island: jets only from the carrier's cat 1),
ENTER (or 1-8) takes a unit out there and puts you in it, or switches you to the one already out; with none left in
reserve the board buys one for materiel. **/** jumps straight to the next unit that is out. On the board, R recalls a
jet on CAP, X stands a parked unit down into reserve, N takes another jeep or truck out (several can be out). **5** / **8** work from any unit (no need to land the Huey).

The unit you leave carries on: a Huey in the air is flown home by her crew (to the nearest friendly pad or the
ALBATROSS's aft spot, matching the deck's motion); a Hornet or Tomcat in the air goes to the escorts' AI pilot (CAP
over the carrier, home at bingo or on recall, the pattern, the glideslope, a trap); vehicles park; a Marine you leave
goes back to his platoon. Lives are the fleet: the HUD strip under the score shows each type's reserve (+1 = out in
the war). A lost unit is a loss to the fleet; when the unit you are in is lost the board opens and, unless you pick,
hands you on to the Huey. The war is lost when the fleet is spent - nothing in reserve and nothing left out there.

### HORNET (jet)

| Key | Action |
|---|---|
| 5 | on the ALBATROSS deck: a Hornet on the catapult (throttle to MIL or afterburner and the cat fires) |
| W S A D / arrows, Q E | stick, rudder |
| Shift / Space, Ctrl / Z | throttle (above 80% is MIL, above 84% afterburner) |
| G / L / H / O | gear / flaps (AUTO, HALF, FULL) / hook / speed brake |
| . | wheel brakes (toe brakes on the pedals) |
| F / X / mouse, R, B | gun, A/A missiles (press again to fire), A/G bombs with CCIP (press again to drop) |
| , / I / U / N | master arm / engines / canopy / lights |
| Insert or ; / Delete or ' | ALE-39: a pair of flares / two chaff (HOTAS 4: rock the throttle rocker right / left) |
| hold Backspace | eject |
| V, mouse wheel, hat | cockpit or chase view, zoom, look around |
| J | controls panel: live view of every axis and button, bind and calibrate HOTAS / pedals |
| Y | stopped on the deck: climb out (the Hornet stays parked; the deck crew brings the Huey up) |

### On foot: the 1980 Marine, and in vehicles

Get out of the landed Huey, a stopped vehicle or the Hornet stopped on deck (Y) and you are an M16A1 rifleman of 1980:
the rifleman's kit from the inventory (M16A1 with six 20-round magazines in the ammo pouches and two in the vest, an
M72 LAW slung, a bandolier in the pack, grenades, two canteens, a field dressing and a cravat), real ballistics, wounds
that bleed and a body that tires. Iron sights only, no crosshair. The ship decks carry you as they sail, heave, pitch
and roll; the ALBATROSS island has a ladder on its port face up to the top deck, the carriers a stern ladder from the sea.
### TOMCAT (F-14A)

| Key | Action |
|---|---|
| 8 | on the ALBATROSS deck (in the helicopter): a Tomcat on cat 1; again on deck: back to the cat. Throttles to MIL (80%) or zone 5 for the shot |
| W S A D / arrows, Q E | stick (a mechanical stick: no g limiter, 7.5 g is yours to hold), rudder |
| Shift / Space, Ctrl / Z | throttles (80% MIL, 84%+ the five afterburner zones light one after another) |
| ; / ' | pitch trim nose down / up (hold; the stick hat trims on a HOTAS when it is not the look hat) |
| - / = | wing sweep AFT / FWD (MAN, aft of the CADC program only); 0: back to AUTO |
| 9 | the emergency sweep handle (guard up: the wings go where - / = put the handle; past 68° on deck = OVERSWEEP 75°) |
| \` | autopilot: ATTITUDE HOLD (fly with the stick, let go and it holds) / ALTITUDE HOLD / off |
| G / L / H / O | gear / flaps UP-DN (flaps down bring the wings to 20°) / hook / speed brakes |
| . | wheel brakes (toe brakes on the pedals) |
| F / X / mouse | M61 gun |
| R / Enter, C, B | A/A mode and launch, weapon select (SW, SP, PH, GUN), next radar track (the RIO hooks it) |
| , / I / U / N | master arm / engines: I runs the whole start on the switches (or I shuts both down) / canopy / lights |
| mouse (T: free look off) | click the cockpit: hover shows a frame and the control's placard and position on the hint line. Cold start on the deck (after Y out and back in): ENG CRANK R on the right console, the right throttle's finger lift (OFF -> IDLE) at 20% rpm, light-off, the crank switch drops out at 50%; then the left. Throttle IDLE before the crank = a wet / hot start. L / R GEN, STAB AUG PITCH / ROLL / YAW, autopilot, FUEL DUMP (1,500 lb/min, burns in the afterburner plume), the emergency sweep handle (guard, then fore / aft) |
| hold Backspace | eject (both seats: the RIO goes first) |
| [ / ] | PILOT / RIO. In the RIO's seat: B / Q / E hook a track, L STT lock, R launch, C weapon type, - / = TID range, and A D W S Shift Ctrl tell the pilot where to fly |
| V, mouse wheel, hat, T | cockpit or chase view, zoom, look around, free look |
| Y | stopped on deck: climb out (the boarding ladder is on the left side; Y there climbs back in) |

Compressor stall (a bang, the RPM rolls back, TIT climbs, L / R INLET on the caution panel, the jet yaws): throttles to idle, nose down below 15 units, wait for it to clear, then power up slowly. Holding power and the pull flames it out; airstart: ENG CRANK on that side (cross-bleed off the other engine, or windmill air above 225 KEAS) with its throttle at IDLE, or I. HOTAS: bind WING SWEEP FWD / AFT / AUTO to buttons in the J panel.

### On foot and in vehicles

| Key | Action |
|---|---|
| Y | get out (Huey landed with the collective down, Hornet stopped on deck, vehicle stopped) / get in at a door |
| [ / ] | change seat (driver, passenger, rear) |
| W A S D, mouse (click to capture), arrows | walk and look (arrows turn), or drive and steer |
| Shift | sprint (stamina: the oxygen debt is paid back afterwards); hold breath while aiming |
| Ctrl / Caps Lock | walk / run toggle |
| C / Z / X, Space | kneel / prone / stand (toggles), jump (stands you up first) |
| Q / E | lean left / right |
| left mouse, right mouse | fire, aim down the sights (hold) |
| R, R R | tactical reload (the old magazine back in a pouch), speed reload (dropped); LAW: R extends, R arms |
| T, Shift+T, O, U | immediate action (SPORTS), remedial action, charging handle, forward assist |
| B, PageUp / PageDown | fire mode (safe / semi / auto), sight aperture |
| L, Shift+L | check the magazine, check the chamber (the HUD only knows what you checked) |
| 1 2 3, mouse wheel | rifle / LAW / pistol, cycle (Shift+digit: the war commands) |
| G | the M67 drill: draw, clip off, pull the pin, arm back - let go of G to throw; HOLD G to cook it (the spoon flies, 4.5 s fuse burning in your hand); hold the right mouse button for an underhand lob (M203 on / off on the grenadier's rifle) |
| Shift+G (or ; / ') | throw an M18 smoke grenade: after ~1.5 s it pours coloured smoke for a minute; thick smoke hides you from the RUNAWAY guns' lock and stops the LANCE beam |
| N | bipod (M60) |
| Tab (or I), H | GEAR screen, HEALTH screen (the mouse is released; Esc closes) |
| K | self aid: the next first-aid step from your own kit (FM 21-11: a dressing or a tourniquet on the worst bleed, then the rest); you kneel and both hands go to the wound; K again: time left; sprinting stops it. The HEALTH screen shows the same NEXT STEP (the item glows, the body part is outlined) |
| F | search a crate, a pile of dropped kit or a body (a dead Marine: his kit); by a wounded Marine: his HEALTH screen to treat him with your kit (buddy aid); dragging: lift him into a fireman's carry; carrying at the Huey door: load him; on a friendly pad or the carrier deck: rearm and resupply |
| Shift+F | drag a casualty by his drag strap (MEDINV drag speed) / put him down |
| (aim at a wall) | the rifle rests on a ledge, a wall top or a sill under the handguard, or against a wall or window frame beside it: less sway (HUD: RESTED) |
| V | first / third person on foot; seat eye / chase in a vehicle (the mouse orbits) |
| W / S, A / D, Space | vehicle: gas / brake (hold S when stopped: reverse), steer (the keys turn less at speed), handbrake |
| click (cab) | vehicles stand cold: ignition (M151: OFF / ON / START rotary; M35: ENGINE switch + START button; cars: the key), the light switch (OFF, BO MARKER, BO DRIVE, SERVICE DRIVE), panel light, wipers, horn, front drive / transfer levers, parking brake, extinguisher - look at it, click |
| X, T, O | vehicle: fire extinguisher, change a flat for the spare (stopped), lights |
| I / H, U, L, G, N, E / Q | vehicle: engine / horn, front drive (4x4), low range (M35), deep-water fording kit, gearbox auto / semi / manual, gear up / down |
| [ ] , mouse, LMB / F, R | change seat (driver, passengers, the M60 / M2 gunner, the M35's benches); the gunner lays the gun with the mouse (or the arrows), fires, reloads |
| B | M35: six Marines board / dismount at a pad |
| gamepad / HOTAS | vehicles: left stick or stick X / pedals steer, RT or the throttle lever = gas, LT or toe brakes = brake, A handbrake; gunner: right stick aims, RT fires |
| racing wheel | rim steers, gas / brake / clutch pedals (found from their rest positions; override: `localStorage.tz_wheel_axes = "0,1,2,3"`, `!` inverts), paddles shift up / down, buttons 0 horn, 1 engine, 2 view, 3 handbrake, 6 / 7 seat; C = clutch on the keys (manual gearbox) |
| 7, then 1 / 2 | motor pool: an M151A2 by CH-46 sling (10 materiel) / an M35A2 by LCM-8 to the beach (20), to the selected friendly island |
| U | at an ALBATROSS deck-edge lift console (or on the lift): send it down to the hangar door / back up |
| 0 / 9 | an LCM-8 lands an M113A2 (30 materiel) / an M60A3 TTS (60) on the selected friendly island's landing beach (else the home island's) |

### Armour (M60A3 TTS, M113A2)

| Key | Action |
|---|---|
| Y, [ / ] | get in at a hatch (walk up to the hull side) / out; change seat (M60: driver, gunner, commander, loader; M113: driver, commander, troops) |
| W / S, A / D | drive (from any seat: orders to the driver). Steering narrows with speed; Right Shift = full steer. S brakes, then reverses. At a standstill A / D pivot (M60) |
| Space, Z, I, H | brake; low / high range; your station's power (driver: MASTER + START, or engine off; gunner: TURRET POWER; anyone else: tells the driver to start / stop); hatch (head out / buttoned up; troops stand in the cargo hatch) |
| look + click | every station's controls work like the Huey's: put the crosshair on a switch, handle or rack (it is framed in yellow and named on the hint line) and click. Driver: MASTER, START, parking brake, range, fire pull, hatch (M113: RAMP, VANE, BILGE too). Gunner (E: look up from the sight): TURRET POWER, STAB, the computer panel (lase, dump, SABOT / HEAT / HEP), the TTS knobs. Loader: a round out of the ready rack, the breech, hatch, radio. Commander (E: look about the cupola): hatch, OVERRIDE (the turret slews onto the cupola's line), a new .50 can; the M113's commander also the ramp and the radio |
| cold start | vehicles stand cold and dark. Get in at the driver's hatch and it is your start-up (I, or click MASTER then START); in any other seat the crew does it, each man his own part (driver: MASTER, START; gunner: TURRET POWER, then ~20 s for the stab to run up) |
| V | the seat's view / chase (the mouse orbits; as gunner the turret lays on what the ring is on) |
| mouse / arrows (Shift: fine) | gunner: lay the gun (the sight follows); commander: the .50 |
| click / F, G, T, R | fire (main gun / .50), coax, lase, dump the computer |
| Q | the loader's next round (SABOT, HEAT, HEP) |
| O, N, U, B, E | day / thermal sight, TTS 3x / 8x, white / black hot, stabiliser, look up from the sight |
| R, N, B (M113) | ramp, trim vane, bilge pumps (raise the vane and run the pumps before you swim) |
| X | extinguisher (engine fire) |

Gamepad: left stick steers, RT / LT drive / brake-reverse, right stick lays the turret, RB fire, LB coax, X lase, Y sight. HOTAS: pedals steer, the throttle lever drives, the stick is the gunner's power control handle, trigger / pickle fire / coax.

Wounds: enemy rounds, flak, blasts and lasers hit body parts (MEDINV's wound model behind the M1 helmet and M69 vest);
bleeding drains blood volume through the shock classes (tunnel vision, grey, unconsciousness). Treat yourself on the
HEALTH screen: drag the field dressing onto the wound, the cravat onto a limb as a tourniquet. Bleeding out costs a
life like a lost helicopter; your body stays where you fell with your kit on it. Crates: an ammunition crate and a
medical chest on the ALBATROSS deck forward of the island, one by every island pad (RUNAWAY caches on enemy islands).

Cockpit switches are clickable (gear and hook handles, flaps, master arm, FCS CAS/DIRECT, engine cranks, fire lights, master caution, jettison, eject, DDI pages). To land: gear down, flaps FULL, hook down, fly the ICLS needles at 8° AoA (the green/amber/red indexer) into the wires.

### KC-130 Hercules (para-drop)

| Key | Action |
|---|---|
| L (landed) | call logistics: the Hercules flies out the repair team |
| H / V | autopilot (the crew flies the run, works flaps, doors and lights) / flight deck or chase view |
| stick, Shift / Ctrl | yoke and the four power levers together |
| F / X | green light: the stick jumps (the jumpmaster holds below 400 ft or above 150 KIAS) |
| R / G / [ ] | flaps 0-50-100 / gear / elevator trim (on a stick) |
| A D, S (under canopy) | steer the lead canopy, rear-riser slip; hands off and he steers himself |

The flight deck is clickable: the four condition levers on the overhead (click: RUN -> FEATHER -> AIR START -> RUN, right click GND STOP), fire T-handles, engine starts, battery / GTC / bleed air, autofeather, gear and flap levers, autopilot, and the paratroop panel left of the pilot (jump lights OFF / RED / GREEN, alarm bell = everyone out now, para doors, ramp). The copilot, flight engineer and navigator (radar scope, Doppler, chart) are at their stations; a checklist card by your knee ticks off what the crew is doing. On the run the jumpmaster calls the time warnings (GET READY .. HOOK UP .. SOUND OFF .. STAND BY .. GO), does his door check leaning out of the left door, pushes the door bundle (the tools: repairs go faster) and stands safety with the loadmaster while the stick goes. `game/dev/c130.html?start=cold`, K: the engineer runs the engine start (battery, GTC, bleed air, 3-4-2-1). A flak hit can set an engine on fire: pull its fire handle. `game/dev/c130.html` flies the aeroplane alone (`?start=air|runway|drop`) with a chase camera and telemetry; `game/dev/c130-model.html` is the model turntable.

The in-game help screen has the full list.

### On foot: medical and inventory (NGC-1980, work in progress)

The 1980 Marine gets Tarkov-style gear and a deep medical model (`game/js/units/infantry/`). Try it in the sandbox at
`dev/medinv.html`: pack a rifleman, grenadier, M60 gunner or Navy corpsman, take hits, watch the bleeding and shock
develop at x1 to x60, then treat him.

- **Gear (Tab):** drag and drop between pockets, the LC-2 belt and its ALICE pouches, the M69 vest and the ALICE pack. **R** rotates while dragging, **Shift-drag** splits a stack, **Ctrl-click** quick-moves, double-click inspects or opens a container, right-click opens the menu (unload, fill from rig, reload, quick slot, drop). Drop rounds on a magazine to load it (stripper clips are faster than thumbing). Bodies and crates are searched item by item. Arrows and Enter (or a gamepad d-pad and A) work as a cursor.
- **Health (H):** drag a dressing, tourniquet, splint, morphine syrette, IV (corpsman only) or canteen onto the body. Right-click a limb to tighten or remove a tourniquet. Blood volume follows the ATLS shock classes I-IV. A tourniquet is safe for 2 hours. The modern CAT tourniquet and QuikClot looted from the RUNAWAY's seized stocks are anachronisms that work far better than the 1980 strap-and-buckle.
### Infantry (NGC-1980 Marine rifleman, dev range)

`game/dev/infantry.html` is a firing range for the on-foot Marine of 1980 (M16A1 with M203, M60, M72 LAW, M1911A1):
pop-up E-type targets at 25-400 m, steel gongs, a spotting scope that shows where each round landed (drop against your
sight line, time of flight, speed), reload and malfunction drills, stamina on the hill, a pond to wade.
`?view=model` shows the weapons and the Marine's postures. Press I on the range for the controls.

| Key | Action |
|---|---|
| W A S D, Shift, Ctrl | move, sprint, walk toggle |
| C / Z / X, Q / E, hold Alt | crouch (kneel) / prone / stand, lean, free look |
| right mouse, left mouse, Shift on the sights | aim down the sights, fire, hold breath |
| 1-4, G, B | M16A1 (+M203) / M60 / LAW / M1911, M203 on/off, fire mode |
| R, R R | tactical reload (keeps the magazine), speed reload (drops it); LAW: extend, then arm |
| T, Shift+T, Y, U | immediate action (SPORTS), remedial action, charging handle, forward assist |
| K / J / L / H / N | check magazine / check chamber / inspect / M60 barrel change / bipod |
| PgUp PgDn or [ ], arrows | sight setting (aperture, leaf, M203 quadrant), zeroing clicks |
| F, Backspace, M, P, V | pick up a dropped magazine, reset targets, spotting scope, bullet trails, third person |

## Tests

`tools/` has a headless test harness: Puppeteer drives the game in software WebGL and takes screenshots. See [tools/README.md](tools/README.md).

```
cd tools && npm install && node snap.mjs scenes/war.json
node tools/jetbench.mjs             # the jet's flight model against published F/A-18C figures, in plain node
node tools/c130bench.mjs            # the C-130H flight model against published C-130H data (spec box, ops limits card, FM 3-21.38)
node tools/tomcatsysbench.mjs       # the flyable F-14A's systems: wing sweep AUTO / MAN / EMER / OVERSWEEP, dead CADC, AFCS, the start on the switches (crank, throttles, wet start, auto start), generators / EMERG GEN, airstarts, stalls, damage
node tools/hueybench.mjs            # the Huey's flight model against published UH-1H data (Heffley, Talbot, DCS / TM charts)
node tools/medinvbench.mjs          # medical (ATLS shock timing, tourniquets, drugs, IV), kit weights, inventory grids
node tools/ch46bench.mjs            # CH-46E tandem rotor: max speed, climb, hover ceilings, single engine, autorotation, SAS
node tools/mv22bench.mjs            # MV-22B tiltrotor: hover / download / figure of merit, the conversion corridor, 275 kt, 412 / 333 rpm
node tools/waspbench.mjs            # RW-3 WASP ducted fan against shrouded-fan momentum theory and wind-tunnel trends
node tools/rotarymission.mjs        # CH-46 and MV-22 fly their whole missions (deck -> LZ -> deck) physically
node tools/embarkbench.mjs          # deck ops: the stick boards by the ramp, chocks and chains off, the LSE signals the lift; chocked back on deck
node tools/waspmission.mjs          # WASP swarm, strafing and ambush behaviours
```

Medical and inventory scenes: `medinv.mjs` (hits, bleeding, a mouse-dragged tourniquet, gear, looting, inspect, death) and `medinv_ui.mjs` (rotate, split, menu, container window, quick move, cursor, corpsman IV, class IV vision).
node tools/navalbench.mjs           # ship motion in a seaway: sea states, carrier pitch / heave / roll, turn heel, deck maths
node tools/seabench.mjs             # the live sea: fractional sea states, phases kept on retune, ships riding the drawn waves, weather drift
node tools/worldsolidbench.mjs      # the lived-in world as colliders: houses stop a walker, field walls, bridge decks and parapets
```

Sea and world: `seaworld.mjs` (`PARTS=lift,house,bridge,mounts,horizon,sea`): the ALBATROSS's lift carrying a spotted Hornet and a soldier, a parked Hornet stopping a walker, a village house wall, a bridge crossed on its deck, the KRAKEN's TALON and LANCE mounts firing, no black above the horizon from six views (deck / 600 m, chase / cockpit, scripted cameras), sea states 1 / 4 / 7 from the deck, from 100 m and from a Hornet at 600 m.

Naval: `game/dev/ships.html` orbits each ship on a sea with sea-state, speed and turn sliders (`?ship=albatross|kraken|leviathan|container`). Scenes: `naval.mjs` (every ship in the game, the deck moving with the sea, crew clearing out from under a helicopter), `shipsdev.mjs` (the preview page from many angles, draw calls).

Air AI: `node tools/airbench.mjs` (a Tomcat sortie cat -> CAP -> bingo -> trap off a fake carrier, wave-off and bolter, terrain, Tomcat vs SHRIKE), `node tools/tomcatbench.mjs` (the F-14A flight model vs published data), scenes `escorts.mjs`, `airfly.mjs`, `airmodels.mjs`.
node tools/wheeledbench.mjs         # the wheeled vehicles against TM / factory figures (speed, grades, fording, stability, fuel)
```

Wheeled vehicle scenes: `wheeledmodel.mjs` (exteriors and variants), `wheeledcockpit.mjs` (cabs, gauges, driving), `wheeleddrive.mjs` (dirt loop, 60% ramp, twist ditch, ford, side slope, mud, fire and wreck), `wheeledaudio.mjs` (engine sound); add `--query "?only=m151"` to the first two.

Jet scenes: `jet.mjs` (launch, climb, turn), `jettrap.mjs` (arrested landing), `jetweapons.mjs` (AIM-9, gun, CCIP), `jetsystems.mjs` (damage, fire, DIRECT, G-LOC, ejection), `jetterrain.mjs` (TERRAIN and PULL UP at a mountain).
`node tools/cavebench.mjs` checks the cave generator without a browser: it prints every island's cave as an ASCII map and
sweeps hundreds of seeds per tier, checking that each cave is connected, wide enough to fly and has its pad, tanks and
pod on solid floors. `scenes/caves.mjs` flies into every cave and screenshots it.
Air defence: `game/dev/defence.html` is a sandbox to view each AA unit and watch it engage target drones (`?unit=talon&player=1`, smoke and ridge included); `defence.mjs` (model close-ups, engagements, line of sight, the LANCE and smoke), `defencewar.mjs` (the units in the game, a lock and missile on the player, hiding behind a hill), `defbalance.mjs` (damage rates against the old AA gun).
`node tools/infantrybench.mjs` checks the infantry cores (flight of the rounds against the field-manual maximum ranges and
zeroes, rates of fire, barrel heat, stoppages, recoil, march / run / sprint speeds and stamina against the Pandolf and
ACSM equations); `scenes/infantry.mjs`, `infantrydrills.mjs` and `infantrymodels.mjs` drive the range page.
On foot and vehicles: `node tools/footbench.mjs` (soldier movement vs FM 22-5 cadences, ladders, swimming, moving decks), `node tools/boxcarbench.mjs` (the old placeholder car), scenes `foot.mjs` and `vehicle.mjs` (the M151A2). Wheeled vehicles in the game: scene `wheeledgame.mjs` (motor pool, village street, bridge, fields, ford, M60, enemy hits, commandeering, the carrier deck, the M35's troops) and `wheeleddeliver.mjs` (CH-46 sling and LCM-8 deliveries). The Marine in the game: `node tools/marinebench.mjs` (the rifleman, medical and inventory on the walker: FM 22-5 paces with the real load, standing still on a deck in a seaway, magazines fired and reloaded from the rig, wounds, bleeding out, tourniquet), scenes `marine.mjs` (seaway deck, iron sights, reload, wound and treatment on the health screen, gear screen) and `marinelife.mjs` (crates, rearm, vehicles, bleeding out, the next life).
Rotary AI scenes: `ch46capture.mjs` (command 1: a Sea Knight takes SANDBAR), `mv22landing.mjs` (an Osprey lands machine troopers), `wasp.mjs` (a WASP raid), `rotarydev.mjs` (the dev page: model turntables and each aircraft's whole mission; `ROTARY=ch46|mv22|wasp`).
Hercules scenes: `drop.json`, `dropflak.json`, `rescue.json` (the para-drop in the game), `c130.mjs` (flight deck, switches, engine out, drop run, take-off on the test page), `c130model.mjs` (exterior screenshots and dimensions).
Huey scenes: `hueystart.json` (cold start), `hueyhover.json` (hover trim, forward flight), `hueyauto.json` (practice autorotation with power recovery), `hueycockpit.mjs`, `hueymodel.mjs` (screenshots).
`node tools/tankbench.mjs` checks the M60A3 and M113A2 against published figures (speed, acceleration, gradient, side
slope, step, trench, fording, swimming, turning, turret rates, stabiliser), every number tagged with its source.
Armour in the game: `node tools/armorgamebench.mjs` (the AI driver, the island environment, riding a moving deck, trees pushed over) and `scenes/armorgame.mjs` (into the M60 at the hatch, road / off-road / hill, day and thermal sights hitting a RUNAWAY building, RUNAWAY fire into the armour, the M113 on the moving carrier deck and swimming off the landing beach, the LCM-8 delivery).

Terrain: `scenes/terrain.mjs` (the surface API, landing beaches, pads / shafts / caves, roads and buildings on the ground, views of beaches, cliffs, the sandy cay, a village; fps) and `scenes/terrainfps.mjs` (frame times from fixed viewpoints; runs on older builds too, for before / after).
Armour scenes: `tankmodel.mjs` (exterior; `VEH=m113` for the APC), `tankinterior.mjs` (crew stations, sight pictures),
`tankdrive.mjs` (the obstacle lanes, a first-round hit at 1000 m), `tankm113.mjs` (ramp, troops, swimming),
`tankaudio.mjs` (the synthesised sound, rendered offline).

**Armour test ground** (`game/dev/tank.html`, `?veh=m113` for the APC): W/S accelerator / brake, A/D steer, Z X C V
range R N L H (M113: R N 1-2 1-3), P park brake, I engine; Tab cycles the views (chase, driver, gunner, commander,
free); arrows or mouse lay the gun, Space fires, F coax, T lase, G dump, 1 2 3 SABOT HEAT HEP, B stabiliser, O day /
thermal sight, [ ] TTS 3x / 8x, U white / black hot, E (gunner) look up from the sight, K searchlight, M or Space in
the cupola fires the .50, H hatches; M113: R ramp, Y trim vane, J bilge pumps.

**The ground war** (`game/js/units/groundwar/`): `node tools/groundwarbench.mjs` (33 checks: the Marine's paces, stances, wounds and hit volume; the M1A2 / T-90M on trackfm against their published speeds; road routes; whole fights of 13 Marines against 8 STRIDERs with and without a helicopter overhead; the cost of a far battle; `node tools/groundwarbench.mjs fight 3 [heli]` prints one fight in detail). Scenes `groundwar.mjs` (an Osprey lands STRIDERs who take SANDBAR, the Huey's guns thin them, a Sea Knight's Marines take it back, an RW-7 and an LCAC with an M1A2 come ashore) and `groundaisim.json` (twenty minutes of the war fast-forwarded, the ground forces counted).

**Marine polish** (ngc/marine-polish): scenes `marinepolish.mjs` (the kit close up, self aid with K, first-person hands on a ladder and swimming, a cooked grenade dropped live) and `carepose.mjs` (the carry speed, the AI's M67 drawn in flight, a man hit mid-cook drops it live); `infantrymodels.mjs` shoots the kit, seated, ladder, swim and self-aid poses on `dev/infantry.html?view=model`.

**Infantry depth** (ngc/infdepth): `node tools/buddyaidbench.mjs` (28 checks: the treatment chooser, the rich AI Marine on the rifleman sim (inertia, reloads, SPORTS), self aid, the corpsman, buddy aid, drags, the player as a patient, a fight with rich men, evacuation, the cost per Marine); `node tools/buddyaidbench.mjs cmp 4` (cheap vs rich balance); scene `buddyaid.mjs`.

**RUNAWAY ground forces (NGC-1980; in the game through the ground war).** The enemy's land army as standalone sims and models in
`game/js/units/runaway/`: the RW-1 STRIDER (a balancing biped that stumbles when hit, falls and gets back up), the
RW-7 hover tank (fan-fed air cushion, drifts), seized M1A2 SEPv3 and T-90M tanks, and a squad AI (cover, bounds,
flanking, suppression, retreat, combined arms). Try them in the sandbox `game/dev/runaway.html` (keys 1-6 pick a
fight, F follows a unit, O toggles the AI overlay, click for sound) and on the turntable `game/dev/rwmodels.html?unit=strider|hover|m1|t90|all`.
`node tools/runawaybench.mjs` checks locomotion on 20° slopes, push recovery, hover physics, the tanks' dimensions and
the squad behaviours in plain node; scenes `runaway.mjs`, `runawaycloseup.mjs`, `runawaylive.mjs`, `rwmodels.mjs`,
`striderfall.mjs` photograph them.
In the war (ngc/rwground-polish): tracers over a fight (red-orange ours, cyan theirs), the ground units, wrecks, landing
craft and a pulsing CONTACT ring on the minimap and the big map (M), burnt-out wrecks that stay ten minutes, limbs shot off,
smoking hulls, the machines breaking for cover from a helicopter working them over; scene `rwpolish.mjs`.

## Credits

Built by Jason with Claude (Anthropic) as an AI pair-programmer. Uses [three.js](https://threejs.org) (MIT), vendored in `game/vendor/`.
