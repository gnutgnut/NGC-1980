# NGC-1980 — unit parity matrix

User request (2026-10-25): "both sides should have equivalent of each unit in role and size and power, for example
kraken has container freighters that albatross doesnt have and enemy carrier cant fly with upgrades."

**Equivalent** = same ROLE, comparable SIZE (game scale), comparable POWER (game hp / damage / speed / cost) and the
same TECH TIER. Not identical: each side's unit is in its own style (BIBLE §1-2): the TASK FORCE is 1980 Cold War
hardware, the RUNAWAY are futuristic machines plus seized 2015-2035 hardware.

Columns: game numbers are war.js / module values (hp in war hit points; cost in materiel). Tier = tech tree tier
(techtree.js). **GAP** rows are the work list of ngc/parity; the *Fill* column says what closes them.

## Before (experimental @ 3f6bf44)

| Role | TASK FORCE | RUNAWAY | Size (game) | Power (game) | Tier P / R | GAP? |
|---|---|---|---|---|---|---|
| Carrier | ALBATROSS (1980 conventional carrier) | KRAKEN (seized 2030s supercarrier) | 120 x 28 m both | hp 600, 6 m/s both | start / start | no |
| Carrier mobility upgrade | SKY CARRIER refit (lift fans, flies) | **none** | - | 300 mat, 24 s refit | 3 / - | **GAP** (user) |
| Capital gun ship | **none** | RW-9 LEVIATHAN railgun monitor | - / 96 x 16 m | hp 420, 7.5 m/s, 3 turrets, 16 dmg shells r 10 m, 320 m reach | - / 3 | **GAP** |
| Capital ship programme speed-up | **none** | IRONHOLD YARDS (bship.rate 1.5) | | | - / 3 | **GAP** |
| Supply freighter | **none** (island output arrives instantly) | autonomous container ship (outposts' output to the KRAKEN) | - / 80 x 15 m | hp 70, 5 m/s, salvage 50% when sunk | - / 0 | **GAP** (user) |
| Troop transport | CH-46E Sea Knight + 13 Marines | MV-22B Osprey + 8 STRIDERs | 25.4 m rotors / 25.8 m span | hp 10 / 12, cost 40 / 25 | 0 / 0 | no (cost check) |
| Attack rotorcraft | **none** (AI) | RW-3 WASP ducted-fan gunship | - / 2.4 m ring | hp 6, 12 mat each, raids of 2-5 | - / 0 | **GAP** |
| Fleet fighter | F-14A Tomcat CAP | RW-4 SHRIKE | 19 m / 11.5 m | hp 4 / 2, 30 / 30 (pairs) | 1 / 2 | tier mismatch |
| Strike fighter | F/A-18A Hornet (player, AI wing in sim) | (WASP raids + SHAHEDs) | | | 0 / 0 | no |
| Recon / AEW spotter | **none** (radar picket = sight +25%) | MQ-9 REAPER (spots the ALBATROSS for SHAHEDs) | - / 20 m span | hp 3, 20 mat | - / 1 | **GAP** |
| Standoff strike / loitering munition | **none** | SHAHED salvos (3-6) from their islands | - | hp 1, 6 each, blast 16 r 10, 20 on a deck | - / 2 | **GAP** |
| Island AA gun | M163 VADS (ZSU-23-4 at the start) | seized TALON 8x8 | | hp 7 both, 30 mat | 0 / 0 | no |
| Island AA, tier 1 | **none** | RW-5 LANCE laser (HQ / fortress islands) | | hp 7 | - / 1 | **GAP** |
| Ship point defence | Phalanx CIWS + Sea Sparrow (ALBATROSS) | TALON + LANCE mounts (KRAKEN, LEVIATHAN, container ship) | | | start | no |
| Main battle tank (AI, ground war) | **none** (M60A3 only with the player in it) | seized M1A2 SEPv3 / T-90M by LCAC | - / 7.9 m | 55 mat | - / 2 | **GAP** |
| Main battle tank (player) | M60A3 TTS by LCM-8 | (no player) | | | 2 / - | n/a |
| Light / amphibious armour | M113A2 (player only) | RW-7 hover tank (AI, crosses the sea) | | 32 mat | 1 / 1 | partial |
| Infantry | Marine rifle squads (13 per CH-46) | RW-1 STRIDER walkers (8 per MV-22) | | | 0 / 0 | no |
| Landing craft | LCM-8 | seized LCAC | | | 1 / 2 | no |
| Utility helicopter | UH-1H Huey (the player) | (no player) | | | 0 / - | n/a (player craft) |
| Logistics airlift | C-130H para repair team (player) | (no player) | | | 1 / - | n/a (player craft) |
| Light vehicles | M151A2, M35A2 (player) | (no player) | | | 0 / - | n/a (player craft) |
| Medical / repair | FIELD MEDICINE (sickbay), SEABEES, DAMAGE CONTROL | NANOREPAIR | | | 1-3 / 2 | ok |
| Capture speed | HELIBORNE DOCTRINE (0.75) | MACHINE ASSAULT PROTOCOL (0.8) | | | 2 / 2 | ok |
| Production | ISLAND PRODUCTION (+25%) | FABRICATOR YIELD (+25%) | | | 2 / 1 | ok |
| Mines | none | none | | | | no (neither side) |

## Work list (ngc/parity)

| GAP | Fill | Side gets | Tier |
|---|---|---|---|
| Sky carrier | KRAKEN lift-fan refit (RUNAWAY ceramic fans), bought and flown by the enemy commander; war.js sky code generalised by side | RUNAWAY | 3 (mirrors SKY CARRIER PROGRAMME) |
| Capital gun ship | USS IOWA (BB-61), a 1980 reactivation, game-scaled to the LEVIATHAN; built from factory output like the LEVIATHAN, AI gunnery and course, the player can order a bombardment | TASK FORCE | 3 (mirrors LEVIATHAN PROGRAMME) |
| Yards | NAVAL REACTIVATION (bship.rate 1.5) | TASK FORCE | 3 |
| Supply freighter | MSC cargo ship (USNS break-bulk freighter): our outposts' output is shipped to the ALBATROSS like theirs to the KRAKEN; the enemy hunts the convoys | TASK FORCE | 0 (mirrors AUTONOMOUS FREIGHT) |
| Attack rotorcraft | AH-1T SeaCobra (physical flight model, AI attack pilot, M197 + 2.75 in rockets) | TASK FORCE | 0 (mirrors RW-3 WASP) |
| AEW spotter | E-2C Hawkeye (spots the KRAKEN, long sight) | TASK FORCE | 1 (mirrors MQ-9 REAPER) |
| Standoff strike | BGM-109 Tomahawk salvos from our islands at the spotted KRAKEN or enemy buildings | TASK FORCE | 2 (mirrors SHAHED SALVOS) |
| Island AA tier 1 | MIM-23 HAWK battery on our HQ islands | TASK FORCE | 1 (mirrors RW-5 LANCE) |
| AI MBT | M60A3 TTS platoon by LCM-8 in the ground war | TASK FORCE | 2 (mirrors SEIZED MBTs) |
| Fighter tier | RW-4 SHRIKE moved to tier 1 (needs the WASP) to face the Tomcat CAP's tier | RUNAWAY | 1 |

Player-only craft (Huey, C-130 para team, jeeps and trucks, the drivable M60A3 / M113A2) have no RUNAWAY
counterpart on purpose: the RUNAWAY have no player. Their roles in the AI war are covered by the AI units above.
