# Findings - ngc/commander2 (the COMMANDER part 2, and the two ngc/integ blockers)

## 2026-10-24 - integ blocker 1: the wingman flew into the new islands in the carrier pattern
**Finding.** After the TERRAIN rebuild (bigger, higher islands reaching into the ALBATROSS's pattern) the AI pilot
(units/air/pilot.js: the escorts and the commander's wingman) flew a recalled Hornet into a hillside. The old pilot's
least height over land in the pattern was 8 m.
**Evidence.** commanderbench "wingman over the islands": the recall flown over the real islands (world.js islandH) from
10 carrier positions / headings. Old pilot: crashes, 8 m least height; now 10/10 trapped, 0 crashed, 34 m least height
over land (25 m required). jetfingerprint SAME, airbench 28/28, tomcatbench 32/32 (the player's jets untouched).
**Cause.** Only the CAP and transit legs had the terrain guard. The pattern was always laid on the same side, its
waypoints were at a fixed height over the sea, the final and the wave-off had no look at the ground, and the CAP floor
was the ground under the orbit's anchor only.
**Action.** Fixed in 7174235 (pattern side clear of the islands, waypoints 70 m over high ground, straight-in only with
a clear glideslope, 6 s look-ahead on the final -> wave-off 'TERRAIN', wave-off climb under the terrain guard, CAP floor
over the whole ring) and dc6e606 (recovery lane: a jet holding for a clear final has the ALBATROSS turn onto a heading
with a clear glideslope astern and open water ahead; land-only terrain checks). The recovery lane steers the carrier
(main.js `recoveryLane`, `war.orderCarrier`); it does not touch catapults or deck spawning. If bugsweep's deck-ops
module gets a "deck clear to land" / recovery window, the wingman's `needsLane` flag is the place to hook it.

## 2026-10-25 - integ blocker 2: foot.mjs 9/13 - the Marine can't re-board the Huey
**Finding.** On ngc/integ, foot.mjs failed at step 7 (back to the Huey): no "Y: GET IN THE UH-1H" hint, `Z.alive`
false; another run boarded but never lifted off. Not a door or collider problem: the Huey was gone.
**Evidence.** integ runs/2026-10-24_14-44-13-foot: shot 06 (stern ladder) shows the feed line "HUEY LOST - ROTOR
STRIKE"; shot 08 shows the Huey tipped over on the deck. The run went at 2-5 fps. A probe (Huey left running on deck,
the carrier ordered to zig-zag, CPU throttled 8x, about 6 fps) on integ: the Huey held her deck spot (ship-local x -1..-3,
z 32) until the ship's yaw rate flipped from -0.09 to +0.09 rad/s in one frame; within 5 s she was at ship-local
(-19, 51), then off the ship altogether. The same probe on this branch after 75755a7: the Huey stays within 0.5 m of her
spot through every turn. foot.mjs on this branch: 12/12 five times, one of them with the CPU throttled 5x (4 fps).
**Cause.** war.js `sailShip` stepped the ships' yaw rate (`u.w = clamp(turn, -rate, rate)`): a turn starting or reversing
moves a deck spot 32 m from the middle sideways by about 3-6 m/s in one frame. At 0.1 s frames (a loaded machine) the
skid friction can't hold that and the running Huey skates across the deck, rolls or puts a blade into the deck (rotor
strike). foot.mjs orders a turn while the Huey sits on deck. On experimental it passed because it ran faster; the
heavier terrain on integ dropped the frame rate. Same cause as ngc/bugsweep's 76e6524 (Sea Knights / Ospreys rolling
over on deck).
**Action.** Fixed in 75755a7 with bugsweep's exact lines (YAW_ACC 0.015 rad/s2 with a stopping rule), so the later
bugsweep merge is clean. foot.mjs: waits made long enough for 2-4 fps, the take-off waits in game time, it logs the
Huey before boarding, and `SLOW=<n>` throttles the CPU to test a loaded machine.

## 2026-10-25 - OPEN: a Huey thrown off the deck hangs 'landed' in mid-air over the sea
**Finding.** In the integ probe, once the Huey had left the ship she stayed at world y 10 with `H.landed` true and
`war.shipAt` false, 200 m from the ALBATROSS over open water (islandH there is -14), for the rest of the run.
**Evidence.** integ runs/2026-10-25_15-29-26-deckprobe (log: wp [-307,10,139] constant from t 84 to t 117 s).
**Cause.** Not found. The ground under her still reads as deck height after the deck has gone (a held platform or a
stale ground sample, probably in ground.js / the Huey's `env.groundY`).
**Action.** OPEN. With 75755a7 it no longer happens in the tests; worth a look by whoever owns ground.js (collision).
