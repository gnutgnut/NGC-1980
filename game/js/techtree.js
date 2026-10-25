// NGC-1980 TECH TREE: what each side can buy, build and launch, and the research that unlocks it.
// Pure logic: no THREE, no DOM, no game imports, no Math.random - it runs in node (tools/techbench.mjs) and in the CPU vs
// CPU simulation, and a run replays exactly from the same inputs.
//
// ---------------------------------------------------------------- API (a contract: the sim's AI commanders use it)
//   import { TECH, createTech, unitAllowed, gateMsg, aiPickResearch, DOCTRINES, GATES, MODS, techStartFromQuery } from './techtree.js'
//
//   TECH: the node table, [{ id, name, side: 1 | 2 | 0 (both), tier: 0..3, cost: { mat, fuel? }, time (game s),
//         requires: [ids], unlocks: { units?: [keys], abilities?: [keys], mods?: { key: multiplier } }, desc }]
//         side 1 = TASK FORCE ALBATROSS (the player), side 2 = RUNAWAY (the enemy commander).
//
//   const T = createTech(side, { start })   start:
//     'default' (or omitted)  the side's tier-0 nodes: today's opening is playable, everything else is researched
//     'all'                   every node that unlocks a unit or ability, no stat upgrades: EXACTLY today's game
//                             (old benches, old scenes and ?debug runs rely on it)
//     'max'                   every node, upgrades too
//     'none'                  nothing (tests)
//     [ids]                   just those nodes (unknown ids are ignored)
//   T.side, T.mode ('default' | 'all' | 'max' | 'none' | 'list'), T.done (Set of ids), T.nodes (this side's nodes)
//   T.has(id) -> bool
//   T.canResearch(id, econ) -> true | 'REASON IN CAPITALS'      econ = { mat, fuel } (the side's store; read only)
//   T.research(id, econ) -> true | reason                      pays econ.mat / econ.fuel up front, starts the clock
//   T.cancel(econ) -> true | reason                            stops the current research, refunds it in full
//   T.update(dt) -> id | null                                  dt in GAME seconds; returns the id that finished
//   T.current -> { id, t, time } | null    T.progress -> 0..1 (0 when idle)    T.remaining -> s left (0 when idle)
//   T.unlocked(kind) -> Set of keys ('units' | 'abilities')    T.allows(key) -> bool (see unitAllowed)
//   T.mod(key) -> the product of every done node's multiplier for key (1 when none)
//   T.available(econ?) -> ids that could start now (requirements met; with econ: also affordable)
//   T.onDone(cb) -> unsubscribe fn                             cb(node, T) when a research finishes
//   T.snapshot() -> plain JSON; T.restore(snap)               (save games, sim rewinds)
//   T.reset(start?)                                            back to a start set (a new war)
//   T.log -> [{ e: 'start' | 'done' | 'cancel', id, t }]      t = the tech clock (sum of dt given to update)
//
//   unitAllowed(T, key) -> bool       the gate every buy / build / launch asks first (player orders AND the AI).
//                                     A key no node of T's side gates is always allowed; T null / undefined = allowed.
//   gateMsg(T, key) -> '' | 'NEEDS <NODE> RESEARCH'   the line the board shows on a locked buy
//   aiPickResearch(T, econ, situation = {}, doctrine = 'balanced') -> id | null
//                                     a readable default research policy; the sim swaps in its own. situation (all
//                                     optional): { time, reserve (materiel to keep for units, default 25),
//                                     foeAir, foeArmour, foeShips, threat } - counts the side has seen of the other.
//   DOCTRINES[side][name] -> [ids]    research orders the policy walks ('balanced', 'air', 'ground', 'naval' / 'econ')
//   GATES: { key: { side, where } }  every gated key and the game code that asks for it (techbench checks it exists)
//   MODS: { key: what it scales }    every mod key and where war.js / casevac.js apply it
//   techStartFromQuery(params, side) -> start    ?tech=all|default|max|none (both sides), or ?tech=id,id (tier 0 plus
//                                     those); ?etech= the same for the enemy only. With ?debug and no ?tech: 'all'
//                                     (today's game, so every older scene and bench still runs unchanged)
//
// Weapons stay at game level: node names are headline unit names, mods are game-tuned multipliers on war.js stats.

export const TECH = [
  // ================================================================ TASK FORCE ALBATROSS (side 1, 1980 Cold War)
  // tier 0: what the task force sails with (the default start)
  { id: 'p.huey', side: 1, tier: 0, name: 'UH-1H UTILITY FLIGHT', cost: { mat: 20 }, time: 20, requires: [], unlocks: { units: ['heli'] },
    desc: 'HUEYS FOR THE HANGAR: COMMAND 3 AND THE BOARD BUY SPARE HELICOPTERS' },
  { id: 'p.marines', side: 1, tier: 0, name: 'MARINE RIFLE COMPANY', cost: { mat: 20 }, time: 20, requires: [], unlocks: { units: ['marine'] },
    desc: 'MARINE RIFLEMEN ON FOOT FROM THE BARRACKS' },
  { id: 'p.airassault', side: 1, tier: 0, name: 'MARINE AIR ASSAULT', cost: { mat: 30 }, time: 30, requires: ['p.huey', 'p.marines'], unlocks: { units: ['drone'] },
    desc: 'CH-46 SEA KNIGHTS LIFT 13 MARINES ONTO AN ISLAND PAD (COMMAND 1)' },
  { id: 'p.aaa', side: 1, tier: 0, name: 'AIR DEFENCE BATTERIES', cost: { mat: 30 }, time: 30, requires: [], unlocks: { units: ['aa'] },
    desc: 'M163 VADS GUNS ON OUR ISLANDS (COMMAND 2)' },
  { id: 'p.motorpool', side: 1, tier: 0, name: 'MOTOR POOL', cost: { mat: 20 }, time: 20, requires: [], unlocks: { units: ['m151', 'm35'] },
    desc: 'M151A2 JEEPS BY CH-46, M35A2 TRUCKS BY LCM-8 (COMMAND 7)' },
  { id: 'p.airwing', side: 1, tier: 0, name: 'CARRIER AIR WING', cost: { mat: 40 }, time: 30, requires: [], unlocks: { units: ['jet'] },
    desc: 'F/A-18A HORNETS OFF CAT 1 (COMMAND 5)' },
  // PARITY (ngc/parity): the TASK FORCE's counterparts of RUNAWAY units, each on the tier of the unit it mirrors
  { id: 'p.sealift', side: 1, tier: 0, name: 'MSC SEALIFT', cost: { mat: 20 }, time: 20, requires: [], unlocks: { units: ['convoy'] },
    desc: 'MSC FREIGHTERS SHIP OUR OUTPOSTS\' OUTPUT TO THE ALBATROSS (AUTOMATIC: GUARD THE CONVOYS)' },
  { id: 'p.cobra', side: 1, tier: 0, name: 'AH-1T SEACOBRA', cost: { mat: 30 }, time: 30, requires: ['p.huey'], unlocks: { units: ['cobra'] },
    desc: 'MARINE ATTACK HELICOPTERS: STRIKE, OVERWATCH AND ESCORT SORTIES (MAP: SHIFT+1)' },
  // tier 1
  { id: 'p.amtrac', side: 1, tier: 1, name: 'AMPHIBIOUS ARMOUR', cost: { mat: 40 }, time: 40, requires: ['p.motorpool'], unlocks: { units: ['m113'] },
    desc: 'LCM-8 LANDING CRAFT PUT M113A2 APCS ON A FRIENDLY BEACH (COMMAND 0)' },
  { id: 'p.cap', side: 1, tier: 1, name: 'FLEET AIR DEFENCE', cost: { mat: 50 }, time: 45, requires: ['p.airwing'], unlocks: { units: ['escort'] },
    desc: 'F-14A TOMCAT ESCORTS FLY CAP OVER THE ALBATROSS OR AN ISLAND (COMMAND 4)' },
  { id: 'p.logistics', side: 1, tier: 1, name: 'FIELD LOGISTICS', cost: { mat: 30 }, time: 30, requires: ['p.huey'], unlocks: { abilities: ['logistics'] },
    desc: 'C-130H PARA-DROPS AND THE FUEL TEAM FOR A DOWNED HUEY (RADIO / L)' },
  { id: 'p.medicine', side: 1, tier: 1, name: 'FIELD MEDICINE', cost: { mat: 25 }, time: 30, requires: ['p.marines'], unlocks: { mods: { medic: 1.6 } },
    desc: 'THE SICKBAY RETURNS EVACUATED MARINES 1.6 X FASTER (CHEAPER SEA KNIGHT STICKS)' },
  { id: 'p.picket', side: 1, tier: 1, name: 'RADAR PICKET', cost: { mat: 35 }, time: 40, requires: ['p.aaa'], unlocks: { mods: { sight: 1.25 } },
    desc: 'PICKET RADARS: EVERY FRIENDLY SIGHT RANGE + 25%' },
  { id: 'p.hawkeye', side: 1, tier: 1, name: 'E-2C HAWKEYE', cost: { mat: 30 }, time: 50, requires: ['p.airwing'], unlocks: { units: ['hawkeye'] },
    desc: 'AIRBORNE EARLY WARNING: FINDS THE KRAKEN, LONG SIGHT (MAP: SHIFT+3)' },
  { id: 'p.hawk', side: 1, tier: 1, name: 'MIM-23 HAWK', cost: { mat: 40 }, time: 60, requires: ['p.aaa'], unlocks: { units: ['hawk'] },
    desc: 'HAWK SAM BATTERIES ON OUR HQ ISLANDS (NEW AA ORDERS THERE)' },
  // tier 2
  { id: 'p.mbt', side: 1, tier: 2, name: 'HEAVY ARMOUR', cost: { mat: 70 }, time: 60, requires: ['p.amtrac'], unlocks: { units: ['m60', 'armour'] },
    desc: 'M60A3 TTS MAIN BATTLE TANKS BY LCM-8 (COMMAND 9; AI PLATOONS: MAP SHIFT+2)' },
  { id: 'p.tomahawk', side: 1, tier: 2, name: 'BGM-109 SALVOS', cost: { mat: 45 }, time: 60, requires: ['p.hawkeye'], unlocks: { units: ['tomahawk'] },
    desc: 'GROUND-LAUNCHED MISSILES FROM OUR ISLANDS AT THE SPOTTED KRAKEN OR THEIR BUILDINGS (MAP: SHIFT+4)' },
  { id: 'p.tomcat', side: 1, tier: 2, name: 'TOMCAT CONVERSION', cost: { mat: 60 }, time: 50, requires: ['p.cap'], unlocks: { units: ['tomcat'] },
    desc: 'FLY THE F-14A YOURSELF (COMMAND 8)' },
  { id: 'p.seabees', side: 1, tier: 2, name: 'SEABEE ENGINEERS', cost: { mat: 45 }, time: 45, requires: ['p.aaa', 'p.motorpool'], unlocks: { mods: { 'aa.build': 0.6, rebuild: 0.6 } },
    desc: 'AA GUNS GO UP AND FLATTENED BUILDINGS COME BACK IN 60% OF THE TIME' },
  { id: 'p.yield', side: 1, tier: 2, name: 'ISLAND PRODUCTION', cost: { mat: 60 }, time: 60, requires: ['p.logistics'], unlocks: { mods: { 'econ.mat': 1.25, 'econ.fuel': 1.25 } },
    desc: 'OUR ISLANDS PRODUCE 25% MORE MATERIEL AND FUEL' },
  { id: 'p.helo', side: 1, tier: 2, name: 'HELIBORNE DOCTRINE', cost: { mat: 50 }, time: 50, requires: ['p.airassault', 'p.medicine'], unlocks: { mods: { 'cap.time': 0.75, 'hp.drone': 1.4 } },
    desc: 'PADS TAKEN IN 75% OF THE TIME, SEA KNIGHTS WITH ARMOUR KITS (+40% HP)' },
  // tier 3
  { id: 'p.damagectl', side: 1, tier: 3, name: 'DAMAGE CONTROL PARTIES', cost: { mat: 60 }, time: 60, requires: ['p.seabees'], unlocks: { mods: { 'ship.repair': 2, 'aa.hp': 1.5 } },
    desc: 'THE ALBATROSS PATCHES ITSELF TWICE AS FAST, AA GUNS +50% HP' },
  { id: 'p.sky', side: 1, tier: 3, name: 'SKY CARRIER PROGRAMME', cost: { mat: 120, fuel: 40 }, time: 90, requires: ['p.seabees', 'p.yield'], unlocks: { abilities: ['sky'] },
    desc: 'THE LIFT-FAN REFIT FOR THE ALBATROSS (COMMAND 6, THEN 300 MATERIEL)' },
  { id: 'p.iowa', side: 1, tier: 3, name: 'IOWA REACTIVATION', cost: { mat: 100 }, time: 90, requires: ['p.yield', 'p.mbt'], unlocks: { units: ['battleship'] },
    desc: 'OUR FACTORIES REACTIVATE THE BATTLESHIP USS IOWA: SHE HUNTS THE KRAKEN (MAP: SHIFT+5 TO TASK HER)' },
  { id: 'p.navyyard', side: 1, tier: 3, name: 'REACTIVATION CREWS', cost: { mat: 60 }, time: 60, requires: ['p.iowa'], unlocks: { mods: { 'bship.rate': 1.5 } },
    desc: 'THE IOWA IS READY 50% SOONER' },

  // ================================================================ RUNAWAY (side 2, futuristic + seized modern)
  { id: 'e.mv22', side: 2, tier: 0, name: 'MV-22B LANDING FORCE', cost: { mat: 30 }, time: 30, requires: [], unlocks: { units: ['transport'] },
    desc: 'OSPREYS LAND STRIDER WALKERS ON A PAD' },
  { id: 'e.wasp', side: 2, tier: 0, name: 'RW-3 WASP DRONES', cost: { mat: 30 }, time: 30, requires: [], unlocks: { units: ['gunship'] },
    desc: 'HOVER GUNSHIPS: GUARDS, HUNTERS AND STRIKE GROUPS' },
  { id: 'e.talon', side: 2, tier: 0, name: 'TALON AIR DEFENCE', cost: { mat: 30 }, time: 30, requires: [], unlocks: { units: ['aa'] },
    desc: 'SEIZED TALON AA TRUCKS ON THEIR ISLANDS' },
  { id: 'e.freight', side: 2, tier: 0, name: 'AUTONOMOUS FREIGHT', cost: { mat: 20 }, time: 20, requires: [], unlocks: { units: ['freighter'] },
    desc: 'UNMANNED CONTAINER SHIPS CARRY THE OUTPOSTS\' OUTPUT TO THE KRAKEN' },
  { id: 'e.reaper', side: 2, tier: 1, name: 'MQ-9 REAPER SPOTTER', cost: { mat: 30 }, time: 50, requires: ['e.wasp'], unlocks: { units: ['reaper'] },
    desc: 'A LONG-ENDURANCE DRONE THAT FINDS THE ALBATROSS' },
  { id: 'e.hover', side: 2, tier: 1, name: 'RW-7 HOVER TANKS', cost: { mat: 45 }, time: 80, requires: ['e.mv22'], unlocks: { units: ['hovertank'] },
    desc: 'HOVER TANKS CROSS THE SEA TO THE ISLAND FIGHTS' },
  { id: 'e.lance', side: 2, tier: 1, name: 'RW-5 LANCE LASER', cost: { mat: 40 }, time: 60, requires: ['e.talon'], unlocks: { units: ['lance'] },
    desc: 'LANCE BEAM TURRETS ON THEIR HQ AND FORTRESS ISLANDS' },
  { id: 'e.fab', side: 2, tier: 1, name: 'FABRICATOR YIELD', cost: { mat: 50 }, time: 60, requires: ['e.freight'], unlocks: { mods: { 'econ.mat': 1.25, 'econ.fuel': 1.25 } },
    desc: 'THEIR ISLANDS PRODUCE 25% MORE' },
  { id: 'e.ceramic', side: 2, tier: 1, name: 'CERAMIC SHELLS', cost: { mat: 40 }, time: 60, requires: ['e.wasp'], unlocks: { mods: { 'hp.gunship': 1.4, 'hp.transport': 1.25 } },
    desc: 'WASPS +40% HP, OSPREYS +25%' },
  { id: 'e.shrike', side: 2, tier: 1, name: 'RW-4 SHRIKE FIGHTERS', cost: { mat: 60 }, time: 80, requires: ['e.wasp'],   // PARITY: tier 1, facing the Tomcat CAP (was tier 2 after the REAPER)
    unlocks: { units: ['shrike'] },
    desc: 'MACHINE FIGHTERS OFF THE KRAKEN: THEY ANSWER OUR TOMCATS' },
  { id: 'e.shahed', side: 2, tier: 2, name: 'SHAHED SALVOS', cost: { mat: 45 }, time: 60, requires: ['e.reaper'], unlocks: { units: ['shahed'] },
    desc: 'LOITERING MUNITIONS AT THE SPOTTED ALBATROSS OR OUR BUILDINGS' },
  { id: 'e.mbt', side: 2, tier: 2, name: 'SEIZED MAIN BATTLE TANKS', cost: { mat: 70 }, time: 90, requires: ['e.hover', 'e.freight'], unlocks: { units: ['mbt'] },
    desc: 'M1A2 SEPV3 AND T-90M BY LANDING CRAFT' },
  { id: 'e.assault', side: 2, tier: 2, name: 'MACHINE ASSAULT PROTOCOL', cost: { mat: 40 }, time: 50, requires: ['e.hover'], unlocks: { mods: { 'cap.time': 0.8 } },
    desc: 'THEIR LANDING PARTIES TAKE A PAD IN 80% OF THE TIME' },
  { id: 'e.nanorepair', side: 2, tier: 2, name: 'NANOREPAIR', cost: { mat: 50 }, time: 60, requires: ['e.fab'], unlocks: { mods: { 'ship.repair': 2, rebuild: 0.6, 'aa.build': 0.7 } },
    desc: 'THE KRAKEN REPAIRS TWICE AS FAST, BUILDINGS AND GUNS COME BACK SOONER' },
  { id: 'e.leviathan', side: 2, tier: 3, name: 'LEVIATHAN PROGRAMME', cost: { mat: 100 }, time: 90, requires: ['e.fab', 'e.mbt'], unlocks: { units: ['battleship'] },
    desc: 'IRONHOLD\'S SHIPYARD STARTS THE RW-9 RAILGUN MONITOR' },
  { id: 'e.yards', side: 2, tier: 3, name: 'IRONHOLD YARDS', cost: { mat: 60 }, time: 60, requires: ['e.leviathan'], unlocks: { mods: { 'bship.rate': 1.5 } },
    desc: 'THE LEVIATHAN IS BUILT 50% FASTER' },
  // PARITY (ngc/parity): the RUNAWAY's counterparts of TASK FORCE nodes
  { id: 'e.sky', side: 2, tier: 3, name: 'KRAKEN LIFT FANS', cost: { mat: 120, fuel: 40 }, time: 90, requires: ['e.nanorepair', 'e.fab'], unlocks: { abilities: ['sky'] },
    desc: 'THE KRAKEN GROWS LIFT FANS AND FLIES (300 MATERIEL REFIT)' },
  { id: 'e.lattice', side: 2, tier: 3, name: 'LATTICE ARMOUR', cost: { mat: 60 }, time: 60, requires: ['e.nanorepair'], unlocks: { mods: { 'aa.hp': 1.5 } },
    desc: 'THEIR NEW AA UNITS +50% HP (DAMAGE CONTROL PARTIES\' COUNTERPART)' },
];

// every gated key and the game code that asks for it (tools/techbench.mjs greps each 'where' for the key)
export const GATES = {
  heli: { side: 1, where: ['game/js/main.js'] }, marine: { side: 1, where: ['game/js/units/commander/fleet.js'] },
  drone: { side: 1, where: ['game/js/war.js'] }, aa: { side: 0, where: ['game/js/war.js'] },
  m151: { side: 1, where: ['game/js/units/commander/fleet.js'] }, m35: { side: 1, where: ['game/js/units/commander/fleet.js'] },
  jet: { side: 1, where: ['game/js/units/commander/fleet.js'] }, m113: { side: 1, where: ['game/js/main.js'] },
  escort: { side: 1, where: ['game/js/units/air/airwar.js'] }, logistics: { side: 1, where: ['game/js/main.js'] },
  m60: { side: 1, where: ['game/js/main.js'] }, tomcat: { side: 1, where: ['game/js/units/commander/fleet.js'] },
  sky: { side: 0, where: ['game/js/war.js'] },   // PARITY: the KRAKEN's refit too
  convoy: { side: 1, where: ['game/js/units/parity/paritywar.js'] }, cobra: { side: 1, where: ['game/js/units/parity/paritywar.js'] },
  hawkeye: { side: 1, where: ['game/js/units/parity/paritywar.js'] }, tomahawk: { side: 1, where: ['game/js/units/parity/paritywar.js'] },
  armour: { side: 1, where: ['game/js/units/parity/paritywar.js'] }, hawk: { side: 1, where: ['game/js/units/defence/brain.js'] },
  transport: { side: 2, where: ['game/js/war.js'] }, gunship: { side: 2, where: ['game/js/war.js'] },
  freighter: { side: 2, where: ['game/js/war.js'] }, reaper: { side: 2, where: ['game/js/units/air/airwar.js'] },
  hovertank: { side: 2, where: ['game/js/units/groundwar/groundwar.js'] }, lance: { side: 2, where: ['game/js/units/defence/brain.js'] },
  shrike: { side: 2, where: ['game/js/units/air/airwar.js'] }, shahed: { side: 2, where: ['game/js/units/air/airwar.js'] },
  mbt: { side: 2, where: ['game/js/units/groundwar/groundwar.js'] }, battleship: { side: 0, where: ['game/js/war.js'] },   // PARITY: the IOWA (side 1) too
};
// every mod key: what it scales (game level), and where
export const MODS = {
  'econ.mat': 'materiel produced by the side\'s islands (war.js updateEconomy)',
  'econ.fuel': 'fuel produced by the side\'s islands (war.js updateEconomy)',
  'cap.time': 'time the side\'s units take to capture a pad (war.js updateCapture; < 1 is faster)',
  sight: 'every friendly sight radius on the fog map (war.js visionSources)',
  'aa.build': 'time an AA gun takes to go up (war.js orderAA / think)',
  'aa.hp': 'hit points of a new AA gun (war.js buildAA)',
  rebuild: 'time before a flattened building is rebuilt (war.js killStruct)',
  'ship.repair': 'the carrier\'s self-repair rate (war.js updateEconomy)',
  'bship.rate': 'the LEVIATHAN / IOWA build rate (war.js updateEconomy)',
  'hp.drone': 'CH-46 hit points (war.js makeAir)', 'hp.gunship': 'WASP hit points (war.js makeAir)', 'hp.transport': 'MV-22 hit points (war.js makeAir)',
  medic: 'sickbay recovery speed (units/groundwar/casevac.js)',
};

// research orders for the default policy (any node left out is tried afterwards, by tier)
export const DOCTRINES = {
  1: {
    balanced: ['p.cap', 'p.hawkeye', 'p.amtrac', 'p.logistics', 'p.hawk', 'p.picket', 'p.medicine', 'p.yield', 'p.helo', 'p.mbt', 'p.tomahawk', 'p.seabees', 'p.iowa', 'p.tomcat', 'p.damagectl', 'p.sky', 'p.navyyard'],
    air: ['p.cap', 'p.hawkeye', 'p.tomcat', 'p.tomahawk', 'p.picket', 'p.logistics', 'p.yield', 'p.helo', 'p.seabees', 'p.sky'],
    ground: ['p.amtrac', 'p.medicine', 'p.mbt', 'p.helo', 'p.logistics', 'p.yield', 'p.hawk', 'p.seabees', 'p.iowa'],
    econ: ['p.logistics', 'p.yield', 'p.seabees', 'p.hawk', 'p.damagectl', 'p.picket', 'p.iowa', 'p.navyyard', 'p.sky'],
  },
  2: {
    balanced: ['e.reaper', 'e.hover', 'e.fab', 'e.shahed', 'e.lance', 'e.shrike', 'e.mbt', 'e.ceramic', 'e.assault', 'e.nanorepair', 'e.leviathan', 'e.yards', 'e.lattice', 'e.sky'],
    air: ['e.reaper', 'e.ceramic', 'e.shrike', 'e.shahed', 'e.fab', 'e.lance', 'e.hover', 'e.nanorepair', 'e.sky'],
    ground: ['e.hover', 'e.assault', 'e.fab', 'e.mbt', 'e.reaper', 'e.lance'],
    naval: ['e.fab', 'e.hover', 'e.mbt', 'e.leviathan', 'e.nanorepair', 'e.yards', 'e.sky', 'e.reaper'],
  },
};

const BY_ID = new Map(TECH.map(n => [n.id, n]));
export const techNode = id => BY_ID.get(id) || null;
const sideNodes = side => TECH.filter(n => n.side === side || n.side === 0);
const isFeature = n => !!((n.unlocks.units && n.unlocks.units.length) || (n.unlocks.abilities && n.unlocks.abilities.length));
const keysOf = n => [...(n.unlocks.units || []), ...(n.unlocks.abilities || [])];

function startSet(side, start) {
  const nodes = sideNodes(side);
  if (Array.isArray(start)) return { mode: 'list', ids: start.filter(id => nodes.some(n => n.id === id)) };
  if (start === 'all') return { mode: 'all', ids: nodes.filter(isFeature).map(n => n.id) };
  if (start === 'max') return { mode: 'max', ids: nodes.map(n => n.id) };
  if (start === 'none') return { mode: 'none', ids: [] };
  return { mode: 'default', ids: nodes.filter(n => n.tier === 0).map(n => n.id) };
}

export function createTech(side, { start = 'default' } = {}) {
  const nodes = sideNodes(side), own = new Map(nodes.map(n => [n.id, n]));
  const gatedBy = new Map();   // key -> [node ids] that unlock it on this side
  for (const n of nodes) for (const k of keysOf(n)) { if (!gatedBy.has(k)) gatedBy.set(k, []); gatedBy.get(k).push(n.id); }
  const subs = new Set();
  const T = { side, nodes, done: new Set(), current: null, mode: 'default', clock: 0, log: [], gatedBy };
  let modCache = null, unlockCache = null;
  const dirty = () => { modCache = null; unlockCache = null; };
  T.reset = (s = start) => { const st = startSet(side, s); T.mode = st.mode; T.done = new Set(st.ids); T.current = null; T.clock = 0; T.log = []; dirty(); return T; };
  T.has = id => T.done.has(id);
  T.node = id => own.get(id) || null;
  T.canResearch = (id, econ = { mat: Infinity, fuel: Infinity }) => {
    const n = own.get(id);
    if (!n) return 'NO SUCH RESEARCH';
    if (T.done.has(id)) return 'ALREADY RESEARCHED';
    if (T.current) return T.current.id === id ? 'UNDER WAY' : `BUSY  -  ${own.get(T.current.id).name}`;
    const miss = n.requires.filter(r => !T.done.has(r));
    if (miss.length) return `NEEDS ${miss.map(r => own.get(r)?.name || r).join(' + ')}`;
    const mat = n.cost.mat || 0, fuel = n.cost.fuel || 0;
    if ((econ.mat ?? 0) < mat) return `NEEDS ${mat} MATERIEL`;
    if ((econ.fuel ?? 0) < fuel) return `NEEDS ${fuel} FUEL`;
    return true;
  };
  T.research = (id, econ) => {
    const ok = T.canResearch(id, econ); if (ok !== true) return ok;
    const n = own.get(id);
    if (econ) { econ.mat -= n.cost.mat || 0; if (n.cost.fuel) econ.fuel -= n.cost.fuel; }
    T.current = { id, t: 0, time: n.time }; T.log.push({ e: 'start', id, t: T.clock }); return true;
  };
  T.cancel = econ => {
    if (!T.current) return 'NOTHING UNDER WAY';
    const n = own.get(T.current.id);
    if (econ) { econ.mat += n.cost.mat || 0; if (n.cost.fuel) econ.fuel += n.cost.fuel; }
    T.log.push({ e: 'cancel', id: n.id, t: T.clock }); T.current = null; return true;
  };
  T.update = dt => {
    T.clock += dt;
    const c = T.current; if (!c) return null;
    c.t += dt; if (c.t < c.time) return null;
    T.current = null; T.done.add(c.id); dirty(); T.log.push({ e: 'done', id: c.id, t: T.clock });
    const n = own.get(c.id); for (const cb of subs) cb(n, T);
    return c.id;
  };
  Object.defineProperty(T, 'progress', { get: () => T.current ? Math.min(1, T.current.t / T.current.time) : 0 });
  Object.defineProperty(T, 'remaining', { get: () => T.current ? Math.max(0, T.current.time - T.current.t) : 0 });
  T.unlocked = kind => {
    if (!unlockCache) { unlockCache = { units: new Set(), abilities: new Set() }; for (const id of T.done) { const n = own.get(id); if (!n) continue; for (const k of n.unlocks.units || []) unlockCache.units.add(k); for (const k of n.unlocks.abilities || []) unlockCache.abilities.add(k); } }
    return unlockCache[kind] || new Set();
  };
  T.allows = key => { const g = gatedBy.get(key); return !g || g.some(id => T.done.has(id)); };
  T.needFor = key => { const g = gatedBy.get(key); if (!g || g.some(id => T.done.has(id))) return null; return own.get(g[0]); };
  T.mod = key => {
    if (!modCache) { modCache = {}; for (const id of T.done) { const m = own.get(id)?.unlocks.mods; if (m) for (const k in m) modCache[k] = (modCache[k] ?? 1) * m[k]; } }
    return modCache[key] ?? 1;
  };
  T.available = econ => nodes.filter(n => !T.done.has(n.id) && n.requires.every(r => T.done.has(r)) && (!econ || ((econ.mat ?? 0) >= (n.cost.mat || 0) && (econ.fuel ?? 0) >= (n.cost.fuel || 0)))).map(n => n.id);
  T.onDone = cb => { subs.add(cb); return () => subs.delete(cb); };
  T.snapshot = () => ({ side, mode: T.mode, done: [...T.done].sort(), current: T.current ? { ...T.current } : null, clock: T.clock });
  T.restore = s => {
    T.mode = s.mode || 'list'; T.done = new Set((s.done || []).filter(id => own.has(id)));
    T.current = s.current && own.has(s.current.id) ? { ...s.current } : null; T.clock = s.clock || 0; dirty(); return T;
  };
  return T.reset(start);
}

export function unitAllowed(T, key) { return !T || T.allows(key); }
export function gateMsg(T, key) { const n = T && T.needFor(key); return n ? `NEEDS ${n.name} RESEARCH` : ''; }

// the default research policy: walk the doctrine's order, skip what can't start, keep a reserve of materiel for units;
// a couple of readable reactions to what the other side fields. Returns an id to research, or null (wait).
export function aiPickResearch(T, econ, situation = {}, doctrine = 'balanced') {
  if (!T || T.current) return null;
  const S = situation, reserve = S.reserve ?? 25;
  const D = DOCTRINES[T.side] || {}, order = (D[doctrine] || D.balanced || []).slice();
  if (T.side === 2) {
    if ((S.foeAir || 0) > 0) order.unshift('e.reaper', 'e.shrike');        // their Tomcats are up: fighters first
    if ((S.foeArmour || 0) > 0) order.unshift('e.hover');                  // armour ashore: hover tanks
  } else if (T.side === 1) {
    if ((S.foeAir || 0) > 1) order.unshift('p.cap');                       // SHRIKEs / WASPs about: Tomcat CAP
    if ((S.foeShips || 0) > 0) order.unshift('p.seabees', 'p.damagectl');  // the LEVIATHAN is out: damage control
  }
  const rest = T.nodes.filter(n => !order.includes(n.id)).sort((a, b) => a.tier - b.tier || (a.cost.mat || 0) - (b.cost.mat || 0)).map(n => n.id);
  for (const id of [...order, ...rest]) {
    if (T.done.has(id)) continue;
    const n = T.node(id); if (!n || !n.requires.every(r => T.done.has(r))) continue;
    if ((econ.mat ?? 0) - (n.cost.mat || 0) < reserve || (econ.fuel ?? 0) < (n.cost.fuel || 0)) return null;   // the next one in line waits for the money
    return id;
  }
  return null;
}

// ?tech= / ?etech= (URLSearchParams or a plain object with get / has)
export function techStartFromQuery(q, side) {
  if (!q) return 'default';
  const v = side === 2 && q.has('etech') ? q.get('etech') : q.has('tech') ? q.get('tech') : (q.has('debug') ? 'all' : 'default');
  if (['all', 'default', 'max', 'none'].includes(v)) return v;
  return String(v || '').split(',').map(s => s.trim()).filter(Boolean).flatMap(s => { const n = techNode(s); return n ? [s] : []; }).concat(sideNodes(side).filter(n => n.tier === 0).map(n => n.id));
}
