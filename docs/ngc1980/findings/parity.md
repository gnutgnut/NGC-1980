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
