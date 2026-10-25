# ngc/parity findings

## 2026-10-25 - Parity audit: 9 gaps, 2 of them the user's examples
**Finding:** role by role, the RUNAWAY had units the TASK FORCE lacked (supply freighters, a capital gun ship, an AI
attack rotorcraft, an AEW spotter, loitering-munition salvos, a tier-1 island AA, AI tanks in the ground war) and the
TASK FORCE had one the RUNAWAY lacked (the sky carrier refit). The Tomcat CAP (tier 1) faced the SHRIKE at tier 2.
**Evidence:** docs/ngc1980/PARITY.md (before table); war.js think / updateEconomy (only RUNAWAY outposts ship their
output by freighter, ours is credited instantly), groundwar.js GW.think (RW-7 / seized MBTs are AI; our M60A3 /
M113A2 only fight with the player in them), airwar.js think (REAPER + SHAHED), techtree.js tiers.
**Cause:** the RUNAWAY side was built as the AI opponent and the TASK FORCE side as the player's craft.
**Action:** the work list in PARITY.md; each fill gets its own entry below.

## 2026-10-25 - Economy asymmetry (the freighter gap is bigger than a unit)
**Finding:** RUNAWAY outposts (non-HQ islands) put their output into a stockpile that only counts once a container
ship carries it to the KRAKEN (and the Task Force salvages 50% of a sunk ship's cargo); TASK FORCE islands credit
the player's store every second. So the Task Force economy was instant and invulnerable, the RUNAWAY's delayed and
sinkable.
**Evidence:** war.js updateEconomy (`if (I.owner === 2 && I.kind !== 'hq') I.stock = ...`), think() step 6,
updateFreighters, checkShip salvage.
**Action:** parity: our outposts stockpile too and an MSC freighter (AUTONOMOUS FREIGHT's counterpart, tier 0) ships
it to the ALBATROSS; the enemy commander hunts the convoys. Measured in the sim (below).

## 2026-10-25 - A 5 m/s freighter never catches a carrier at 6 m/s
**Finding:** the first cut of the MSC convoys sailed for the ALBATROSS and never arrived: 2 sailings, 0 deliveries
in a 15 min war; under tech=default the Task Force then researched nothing in 20 min (simbench check failed).
**Cause:** freighters steered for the moving carrier (max 5 vs 6 m/s); the CPU commander keeps the ALBATROSS
steaming between islands. The RUNAWAY's container ships had the same rule but the KRAKEN dawdles more.
**Action:** fixed: a freighter unloads at the nearer of its carrier and its HQ island's anchorage (both sides, the
same rule). Research came back (p.cap at 466 s, p.hawkeye 517 s in seed 21).

## 2026-10-25 - The cruise-missile sim tripped the safety check
**Finding:** the sub-agent writing a BGM-109 point-mass sim (booster, cruise, terrain following, pop-up and dive)
was stopped by auto mode's safety check, as the BIBLE warns for deep weapon modelling, though it was game level.
**Action:** dropped the new sim; the Task Force's salvo flies the game's existing SHAHED point-mass drone unchanged
(rwfm.js createShahedSim / shahedGuide) under a GLCM model. Only the model is new. The E-2C part of that agent's
work (hawkeyefm.js, tools/hawkeyebench.mjs 11/11) stands.
