// NGC-1980 medical model for a soldier (the player's Marine, his buddies, any human on the map). Pure: no DOM, no
// THREE, no game imports except the item database; runs in node (tools/medinvbench.mjs).
//
// What it simulates, all in real time (seconds):
// - 7 body regions with Tarkov-style hit points (head 35, thorax 85, stomach 70, arms 60, legs 65). A region at 0 HP is
//   "blacked out": head or thorax at 0 = dead; a blacked limb stops working and passes further damage on to the rest
//   of the body (x0.7, the stomach x1.5). HP does not regenerate in the field: a corpsman's wound care or a RUNAWAY
//   nanite injector brings it back. Each region is split into anatomical zones (cranium / face / neck, chest, abdomen /
//   pelvis, upper arm / forearm / hand, thigh / shin / foot) that decide armour coverage, vessels and bones.
// - Circulation: blood volume in ml (70 ml/kg, 5250 ml for a 75 kg Marine; ATLS), red-cell volume (haematocrit 0.44),
//   mean arterial pressure from the volume deficit. Bleeds are light (venous ooze), heavy (venous / many small vessels)
//   or arterial; each has a flow at normal pressure and flows in proportion to pressure, so a bleed slows as the man
//   goes into shock. Light bleeds clot on their own, heavy ones slowly, arterial ones not at all. Wounds are
//   compressible (tourniquet works: limbs), junctional (neck, groin: only packing works) or internal (chest, belly:
//   nothing in the field works). Transcapillary refill slowly moves water from the tissues back into the vessels.
// - ATLS haemorrhagic shock classes I-IV (<15, 15-30, 30-40, >40 % loss) drive heart rate, blood pressure, breathing,
//   mental state, then consciousness (cerebral perfusion), vision (tunnel, greyscale), tremor and stamina.
//   Death: blood loss >= 50 % (exsanguination), head or thorax at 0 HP, sustained hypoxia (SpO2 < 60 % for 2 min),
//   opioid respiratory arrest.
// - Pneumothorax from chest wounds: an open ("sucking") one hurts breathing; sealing it with the dressing wrapper (FM
//   21-11) stops that but, unvented, can build into a tension pneumothorax that kills in ~20 min unless a corpsman
//   decompresses it with a needle (or a vented chest seal is used).
// - Fractures (bone zones, falls, blunt trauma behind armour), splints, slings.
// - Pain per region with adrenaline masking it for the first minutes, analgesia from morphine (pharmacokinetics with
//   overdose: sedation, respiratory depression, worse in shock) and APC tablets.
// - Hydration and energy that drain over hours (summer island heat); they only bite after a long patrol.
// - Wound model (GAME level, Tarkov-style tables): hit-info -> armour (coverage roll by zone and face, penetration
//   value vs armour class, blunt damage behind it, durability) -> HP damage, then bleeds (type by the vessels of the
//   zone), fractures, pneumothorax, concussion. The MEDICAL side (what a wound does to the body over time) is the deep part.
// - Treatments with real application times, self vs. buddy aid, corpsman-only skills, one action at a time.
//
// Numbers: CONFIRMED (published), INFERRED (derived / tuned to published behaviour), UNVERIFIED (plausible guess).
// Sources are the keys of S in items.js. The bench (tools/medinvbench.mjs) checks the emergent timings.
//
// INTERFACE (see also MODLOG "MEDICAL + INVENTORY"):
//   const M = createMedical({ massKg: 75, rng, skill: 'rifleman' | 'corpsman' });
//   M.hit(hitInfo, armourItems) -> result        hitInfo: see normaliseHit(); armourItems: inventory.armour()
//   M.update(dt, { exertion: 0..1, moving: bool }) -> events[]   (call every frame or at >= 4 Hz)
//   M.mods() -> modifiers for the soldier sim (speed, sway, tremor, stamina, vision ...), see mods()
//   M.vitals() -> { hr, sbp, dbp, map, rr, spo2, cls, mental, bloodMl, lossPct, ... }
//   M.treatOptions(item, region, by) / M.startTreatment({ item, region, by }) / M.cancelTreatment()
//   M.fall(speedMs), M.damage(region, hp, opts), M.restore(), M.serialize(), M.load(obj)
//   BUDDY.dragSpeed(...), BUDDY.carrySpeed(...): buddy aid and casualty movement
import { ITEMS, ROUNDS, MATS, FRAGS, ARMOUR_CLASS } from './items.js';

// -------------------------------------------------------------------------------------------------------- constants
export const REGIONS = ['head', 'thorax', 'stomach', 'armL', 'armR', 'legL', 'legR'];
export const REGION = {
  head:    { name: 'HEAD',      hp: 35, vital: true,  zones: { cranium: 0.55, face: 0.33, neck: 0.12 } },
  thorax:  { name: 'THORAX',    hp: 85, vital: true,  zones: { chest: 1 } },
  stomach: { name: 'STOMACH',   hp: 70, spill: 1.5,   zones: { abdomen: 0.6, pelvis: 0.4 } },
  armL:    { name: 'LEFT ARM',  hp: 60, limb: 'arm', spill: 0.7, zones: { upperArm: 0.45, forearm: 0.4, hand: 0.15 } },
  armR:    { name: 'RIGHT ARM', hp: 60, limb: 'arm', spill: 0.7, zones: { upperArm: 0.45, forearm: 0.4, hand: 0.15 } },
  legL:    { name: 'LEFT LEG',  hp: 65, limb: 'leg', spill: 0.7, zones: { thigh: 0.5, shin: 0.4, foot: 0.1 } },
  legR:    { name: 'RIGHT LEG', hp: 65, limb: 'leg', spill: 0.7, zones: { thigh: 0.5, shin: 0.4, foot: 0.1 } },
};
// Zones. dmgMul: GAME HP multiplier (cranium 2.6); light/heavy:
// ml/min at normal pressure and the base chance of a heavy bleed; artery: chance a wound opens the named vessel, its
// flow (ml/min, INFERRED from resting arterial flows: femoral ~350-500, brachial ~150-250, carotid ~400-800 - a cut
// artery bleeds at about its full flow against low resistance) and how it can be controlled; bone: fracture chance.
// ctl: 'tq' = distal to a tourniquet site, 'junctional' = packable but no tourniquet, 'internal' = non-compressible.
export const ZONES = {
  cranium:  { region: 'head', dmgMul: 2.6, light: 15, heavyP: 0.25, heavy: 80, heavyCtl: 'junctional', artery: { p: 0.03, rate: 150, ctl: 'internal', name: 'INTRACRANIAL' }, bone: 0 },
  face:     { region: 'head', dmgMul: 1.2, light: 20, heavyP: 0.35, heavy: 100, heavyCtl: 'junctional', artery: { p: 0.08, rate: 200, ctl: 'junctional', name: 'FACIAL A.' }, bone: 0.4, boneName: 'JAW' },
  neck:     { region: 'head', dmgMul: 1.4, light: 20, heavyP: 0.4, heavy: 150, heavyCtl: 'junctional', artery: { p: 0.3, rate: 800, ctl: 'junctional', name: 'CAROTID A.' }, bone: 0 },
  chest:    { region: 'thorax', dmgMul: 1.0, light: 15, heavyP: 0.3, heavy: 120, heavyCtl: 'internal', artery: { p: 0.06, rate: 700, ctl: 'internal', name: 'GREAT VESSELS' }, bone: 0.3, boneName: 'RIBS', ptx: 0.65 },
  abdomen:  { region: 'stomach', dmgMul: 1.0, light: 15, heavyP: 0.4, heavy: 120, heavyCtl: 'internal', artery: { p: 0.06, rate: 450, ctl: 'internal', name: 'MESENTERIC / LIVER' }, bone: 0 },
  pelvis:   { region: 'stomach', dmgMul: 1.0, light: 15, heavyP: 0.3, heavy: 120, heavyCtl: 'junctional', artery: { p: 0.12, rate: 600, ctl: 'junctional', name: 'ILIAC / COMMON FEMORAL A.' }, bone: 0.25, boneName: 'PELVIS' },
  upperArm: { region: 'arm', dmgMul: 1.0, light: 12, heavyP: 0.25, heavy: 80, heavyCtl: 'tq', artery: { p: 0.10, rate: 250, ctl: 'tq', name: 'BRACHIAL A.' }, bone: 0.35, boneName: 'HUMERUS' },
  forearm:  { region: 'arm', dmgMul: 1.0, light: 10, heavyP: 0.2, heavy: 60, heavyCtl: 'tq', artery: { p: 0.12, rate: 150, ctl: 'tq', name: 'RADIAL / ULNAR A.' }, bone: 0.45, boneName: 'RADIUS / ULNA' },
  hand:     { region: 'arm', dmgMul: 0.9, light: 8, heavyP: 0.15, heavy: 40, heavyCtl: 'tq', artery: { p: 0.05, rate: 80, ctl: 'tq', name: 'PALMAR ARCH' }, bone: 0.5, boneName: 'HAND' },
  thigh:    { region: 'leg', dmgMul: 1.0, light: 15, heavyP: 0.3, heavy: 120, heavyCtl: 'tq', artery: { p: 0.12, rate: 500, ctl: 'tq', name: 'FEMORAL A.' }, bone: 0.4, boneName: 'FEMUR' },
  shin:     { region: 'leg', dmgMul: 1.0, light: 12, heavyP: 0.25, heavy: 80, heavyCtl: 'tq', artery: { p: 0.08, rate: 200, ctl: 'tq', name: 'POPLITEAL / TIBIAL A.' }, bone: 0.5, boneName: 'TIBIA' },
  foot:     { region: 'leg', dmgMul: 0.9, light: 10, heavyP: 0.2, heavy: 50, heavyCtl: 'tq', artery: { p: 0.04, rate: 80, ctl: 'tq', name: 'DORSALIS PEDIS' }, bone: 0.5, boneName: 'FOOT' },
};
export const regionOfZone = (zone, side) => { const r = ZONES[zone].region; return r === 'arm' ? 'arm' + side : r === 'leg' ? 'leg' + side : r; };

export const MED = {
  BLOOD_ML_PER_KG: 70,          // ATLS: blood volume ~7% of body weight (CONFIRMED)
  HCT0: 0.44,                   // normal haematocrit, adult male (CONFIRMED)
  CLASS: [0.15, 0.30, 0.40],    // ATLS class boundaries as loss fraction (CONFIRMED)
  DEATH_LOSS: 0.50,             // loss of half the blood volume = death without transfusion (INFERRED; ATLS: >40% immediately life-threatening)
  MAP0: 93,                     // normal mean arterial pressure mmHg (CONFIRMED)
  LIGHT_CLOT_S: 240,            // light venous ooze clots with a ~4 min time constant (INFERRED: Ivy bleeding time 2-9 min for small cuts)
  HEAVY_CLOT_S: 2400,           // heavy bleeds slowly clot (INFERRED)
  REFILL_FRAC_PER_H: 0.25,      // transcapillary refill: ~1/4 of the deficit per hour (INFERRED: 0.5-1 l in the first hours after haemorrhage)
  REFILL_MAX_ML_MIN: 15,
  CRYST_KEEP: 1 / 3,            // a third of infused crystalloid stays intravascular (CONFIRMED rule of thumb, "3:1 rule")
  CRYST_LEAK_S: 1800,           // ... the rest leaves over ~30-60 min (INFERRED)
  TQ_SAFE_S: 2 * 3600,          // tourniquet safe for 2 h (CONFIRMED: KRAGH)
  TQ_LOSS_S: 6 * 3600,          // limb non-viable after ~6 h (INFERRED: KRAGH, ischaemia literature)
  OPIOID_HALF_S: 2.5 * 3600,    // morphine elimination half-life 2-3 h (CONFIRMED: MORPH)
  OPIOID_ABS_S: { im: 150, otfc: 60, iv: 10 }, // absorption time constant. Real IM peaks at 30-60 min: compressed ~10x for play (DOCUMENTED DEVIATION)
  OPIOID_EC50: 9,               // mg morphine in the body for half the pain gone (INFERRED)
  OPIOID_SEDATE: 26,            // mg where drowsiness starts (INFERRED)
  OPIOID_APNOEA: 50,            // mg where breathing stops (INFERRED: 3 x 16 mg syrettes in a man in shock)
  ADRENALINE_S: 180,            // combat stress masks pain for a few minutes (INFERRED)
  SWEAT_ML_H: [400, 1400],      // water lost per hour at rest / hard work in 30 C heat (INFERRED: TB MED 507, 0.5-1.5 qt/h)
  KCAL_H: [100, 500],           // energy per hour at rest / hard work (INFERRED: ~4000 kcal/day on operations)
  PAIN_DECAY_S: 300,
};

// ----------------------------------------------------------------------------------------------------------- helpers
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function piece(x, xs, ys) { if (x <= xs[0]) return ys[0]; for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return lerp(ys[i - 1], ys[i], (x - xs[i - 1]) / (xs[i] - xs[i - 1])); return ys[ys.length - 1]; }
export function mulberry32(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pickW = (obj, r) => { let s = 0; for (const k in obj) s += obj[k]; let x = r * s; for (const k in obj) { x -= obj[k]; if (x <= 0) return k; } return Object.keys(obj)[0]; };
const defOf = it => typeof it === 'string' ? ITEMS[it] : ITEMS[it?.id];   // id string, item def or item instance ({ uid, id, ... })
export const shockClass = loss => loss < MED.CLASS[0] ? 1 : loss < MED.CLASS[1] ? 2 : loss < MED.CLASS[2] ? 3 : 4;

// ------------------------------------------------------------------------------------------------------------ hit info
// The hit-info contract with the INFANTRY module. Required: part (region id) or zone (else a random body part).
// Damage: either round (a ROUNDS id) + velocity (m/s at impact; full damage at the round's v0), or dmg + pen
// directly (fragments, blasts, melee, anything). Optional: dir (travel direction in the victim's body frame: x right,
// y up, z forward = where he faces; decides front / back / side / top for armour), side ('L'/'R' when only a limb
// zone is given), kind ('bullet' | 'fragment' | 'blunt'), bleed (multiplier), source and rangeM (logs).
// All damage numbers are GAME tuning (Tarkov-style), not a model of real terminal ballistics.
// Also accepts the INFANTRY ballistics.js makeHitInfo() object as is: dmg there is a SCALE (rifle ball = 1, already
// x v/mv), dir a world-space array (pass victimYaw, the soldier's three.js yaw, facing -z at yaw 0, to turn it into
// the body frame) and part 'neck' is its own hitbox.
export function normaliseHit(h, rng = Math.random) {
  const o = { kind: h.kind || 'bullet', ...h };
  if (o.part === 'neck') { o.part = 'head'; o.zone = 'neck'; }
  if (Array.isArray(o.dir)) {
    const [x, y, z] = o.dir, yaw = o.victimYaw || 0, c = Math.cos(yaw), s = Math.sin(yaw);
    o.dir = { x: x * c - z * s, y, z: -x * s - z * c };   // right = (cos, 0, -sin), forward = (-sin, 0, -cos)
  }
  if (o.dmg != null && o.dmg <= 3 && o.kind === 'bullet') { o.dmgScale = o.dmg; delete o.dmg; }   // INFANTRY scale
  const rd = o.round ? ROUNDS[o.round] : null;
  if (!rd && o.dmgScale != null) o.dmg = 54 * o.dmgScale;   // an unknown round: scale a rifle ball
  if (rd) {
    const f = clamp((o.velocity ?? rd.v0) / rd.v0, 0, 1.2);
    o.dmg = o.dmg ?? rd.dmg * (0.55 + 0.45 * f);       // GAME: damage falls to ~55% as the round slows
    o.pen = o.pen ?? rd.pen * (0.4 + 0.6 * f);         // GAME: penetration falls faster
    o.bleed = o.bleed ?? rd.bleed;
  }
  o.dmg = o.dmg ?? 20; o.pen = o.pen ?? 10; o.bleed = o.bleed ?? 1;
  let part = o.part, zone = o.zone;
  if (zone && !part) { const r = ZONES[zone].region; part = r === 'arm' || r === 'leg' ? r + (o.side || (rng() < 0.5 ? 'L' : 'R')) : r; }
  if (!part) part = pickW({ head: 0.12, thorax: 0.28, stomach: 0.2, armL: 0.08, armR: 0.08, legL: 0.12, legR: 0.12 }, rng());
  if (!zone || ZONES[zone] && regionOfZone(zone, part.slice(-1)) !== part) zone = pickW(REGION[part].zones, rng());
  o.part = part; o.zone = zone;
  const d = o.dir || { x: 0, y: 0, z: -1 };   // default: shot from the front
  const ix = -d.x, iy = -d.y, iz = -d.z;      // towards the shooter
  o.face = iy > 0.75 ? 'top' : Math.abs(ix) > Math.abs(iz) ? 'side' : iz >= 0 ? 'front' : 'back';
  return o;
}

// GAME: chance a hit with penetration `pen` gets through armour class `cls` (worn armour counts as lower class).
export function penProbability(pen, cls, durFrac = 1) {
  const eff = cls * 10 * (0.6 + 0.4 * durFrac);
  return 1 / (1 + Math.exp(-(pen - eff) / 4));
}

// Fragment presets -> hit-infos for a man distM from the burst (expected count from a 0.5 m^2 standing target;
// prone 0.2). GAME table, see FRAGS in items.js.
export function fragmentHits(presetId, distM, rng = Math.random, { prone = false, dir } = {}) {
  const P = FRAGS[presetId]; const area = prone ? 0.2 : 0.5;
  const lambda = P.count * area / (4 * Math.PI * Math.max(1, distM) ** 2);
  let n = 0, L = Math.exp(-lambda), p = 1; do { n++; p *= rng(); } while (p > L && n < 60); n--;   // Poisson
  const out = [], k = Math.exp(-distM / P.falloff);
  for (let i = 0; i < n; i++) out.push({ kind: 'fragment', dmg: P.dmg * k * (0.5 + rng()), pen: P.pen * k * (0.7 + 0.6 * rng()), bleed: 0.8, source: P.name, rangeM: distM, dir });
  return out;
}

// --------------------------------------------------------------------------------------------------------- the model
export function createMedical(opts = {}) {
  const rng = opts.rng || Math.random;
  const massKg = opts.massKg ?? 75;
  const V0 = MED.BLOOD_ML_PER_KG * massKg;
  const M = {
    massKg, V0, skill: opts.skill || 'rifleman', name: opts.name || 'MARINE',
    t: 0, regions: {}, bleeds: [], nextId: 1,
    vol: V0, rbc: V0 * MED.HCT0, cryst: 0, crystIn: 0, iv: null,
    opioidDepot: [], opioid: 0, tablets: [], adrenaline: 0, concussion: 0, ko: 0,
    ptx: null, spo2: 98, hypoxiaT: 0, apnoeaT: 0,
    waterDef: 0, kcalDef: 0,
    nanite: null, naniteDoses: [], conscious: 1, unconscious: false, dead: false, cause: null,
    action: null, log: [], events: [], exertion: 0,
  };
  function freshRegions() { for (const r of REGIONS) M.regions[r] = { hp: REGION[r].hp, max: REGION[r].hp, pain: 0, fracture: null, splint: 0, sling: false, tq: [], lost: false, dressings: 0, wounds: 0 }; }
  freshRegions();
  const ev = (type, o = {}) => { const e = { type, t: M.t, ...o }; M.events.push(e); M.log.push(e); if (M.log.length > 200) M.log.shift(); return e; };

  // ------------------------------------------------------------------------------------------------- derived state
  M.lossFrac = () => clamp(1 - M.vol / V0, 0, 1);
  M.hct = () => M.vol > 1 ? M.rbc / M.vol : 0;
  M.cls = () => shockClass(M.lossFrac());
  M.blacked = r => M.regions[r].hp <= 0;
  M.opioidSed = () => clamp((M.opioid * (M.cls() >= 3 ? 1.5 : 1) - MED.OPIOID_SEDATE) / (MED.OPIOID_APNOEA - MED.OPIOID_SEDATE));
  M.analgesia = () => { const o = M.opioid / (M.opioid + MED.OPIOID_EC50); const tb = M.tablets.reduce((s, x) => s + x.a, 0); return clamp(1 - (1 - o) * (1 - Math.min(0.3, tb))); };
  function mapNow() {
    const lf = M.lossFrac();
    let map = piece(lf, [0, 0.15, 0.30, 0.40, 0.50, 0.60], [93, 92, 86, 68, 46, 25]);   // INFERRED from ATLS: BP normal in I-II, falls in III, greatly in IV
    map -= 8 * M.opioidSed();                                                         // vasodilation
    if (M.ptx) map *= 1 - 0.55 * smooth(0.6, 1, M.ptx.tension);                       // obstructive shock
    return Math.max(10, map);
  }
  M.map = mapNow;
  // total pain (0..~150) before / after analgesia and adrenaline
  M.painRaw = () => REGIONS.reduce((s, r) => s + M.regions[r].pain, 0);
  M.pain = () => M.painRaw() * (1 - M.analgesia()) * (1 - 0.5 * M.adrenaline);

  // flow of one bleed now (ml/s)
  function tqOcclusion(region) {
    const R = M.regions[region]; if (!R.tq.length) return 0;
    let open = 1; for (const q of R.tq) open *= 1 - clamp(q.occl - q.slip); return 1 - open;
  }
  function bleedFlow(b, mapRatio) {
    if (b.stopped) return 0;
    let f = b.rate / 60 * mapRatio * (1 - b.clot) * b.ctrl;
    if (b.ctl === 'tq') f *= 1 - tqOcclusion(b.region);
    return Math.max(0, f);
  }
  M.bleedRate = () => { const mr = mapNow() / MED.MAP0; return M.bleeds.reduce((s, b) => s + bleedFlow(b, mr), 0) * 60; };   // ml/min

  M.vitals = () => {
    const lf = M.lossFrac(), cls = shockClass(lf), map = mapNow();
    const sbp = Math.round(piece(lf, [0, 0.15, 0.30, 0.40, 0.50, 0.6], [122, 120, 112, 86, 62, 38]) * map / piece(lf, [0, 0.15, 0.30, 0.40, 0.50, 0.60], [93, 92, 86, 68, 46, 25]));
    const dbp = Math.round(Math.max(10, (3 * map - sbp) / 2));
    let hr = piece(lf, [0, 0.15, 0.30, 0.40, 0.48, 0.5], [72, 99, 120, 140, 155, 60]) + 22 * M.adrenaline + 0.15 * M.pain() + 55 * M.exertion * (lf < 0.45 ? 1 : 0);
    if (M.ptx) hr += 25 * M.ptx.tension;
    let rr = piece(lf, [0, 0.15, 0.30, 0.40, 0.5], [15, 19, 28, 36, 40]) + 14 * M.exertion;   // ATLS
    if (M.ptx) rr += 10 * M.ptx.sev + 14 * M.ptx.tension;
    rr *= 1 - 0.85 * M.opioidSed();
    const mental = M.dead ? 'DEAD' : M.unconscious ? 'UNCONSCIOUS' : ['SLIGHTLY ANXIOUS', 'MILDLY ANXIOUS', 'ANXIOUS, CONFUSED', 'CONFUSED, LETHARGIC'][cls - 1];
    if (M.dead) return { hr: 0, sbp: 0, dbp: 0, map: 0, rr: 0, spo2: 0, cls, mental, bloodMl: Math.round(M.vol), lossPct: Math.round(lf * 100), hct: M.hct(), bleedMlMin: 0, pain: 0, temp: 37 };
    return { hr: Math.round(hr), sbp, dbp, map: Math.round(map), rr: Math.round(rr), spo2: Math.round(M.spo2), cls, mental, bloodMl: Math.round(M.vol), lossPct: Math.round(lf * 100),
      hct: +M.hct().toFixed(2), bleedMlMin: Math.round(M.bleedRate()), pain: Math.round(M.pain()), opioidMg: +M.opioid.toFixed(1), conscious: +M.conscious.toFixed(2) };
  };

  // -------------------------------------------------------------------------------------------------------- damage
  function addPain(region, v) { M.regions[region].pain = Math.min(100, M.regions[region].pain + v); }
  M.damage = (region, hp, o = {}) => {
    if (M.dead || hp <= 0) return;
    const R = M.regions[region];
    addPain(region, hp * 1.1);
    if (R.hp > 0) { const d = Math.min(R.hp, hp); R.hp -= d; hp -= d; if (R.hp <= 0) { R.hp = 0; ev('blacked', { region }); } if (hp <= 0.001) return checkVital(region, o); }
    // overflow from a blacked part spreads over the others in proportion to their max HP
    const mul = REGION[region].spill ?? 1; const alive = REGIONS.filter(r => r !== region && M.regions[r].hp > 0);
    if (REGION[region].vital) return checkVital(region, o);
    const tot = alive.reduce((s, r) => s + M.regions[r].max, 0);
    for (const r of alive) { const R2 = M.regions[r]; R2.hp = Math.max(0, R2.hp - hp * mul * R2.max / tot); if (R2.hp <= 0) ev('blacked', { region: r }); checkVital(r, o); }
  };
  function checkVital(region, o) { if (REGION[region].vital && M.regions[region].hp <= 0) die(region === 'head' ? 'KIA: HEAD WOUND' : 'KIA: CHEST WOUND', o); }
  function die(cause, o = {}) { if (M.dead) return; M.dead = true; M.unconscious = true; M.conscious = 0; M.cause = cause; M.action = null; ev('death', { cause, by: o.source }); }
  function addBleed(region, zone, type, rate, ctl, name) {
    const b = { id: M.nextId++, region, zone, type, rate, ctl, name, clot: 0, ctrl: 1, t: 0, dressed: false, packed: false, stopped: false };
    M.bleeds.push(b); ev('bleed', { region, zone, bleed: type, rate, name }); return b;
  }
  function addFracture(region, name) { const R = M.regions[region]; if (R.fracture) return; R.fracture = name || 'FRACTURE'; R.splint = 0; addPain(region, 35); ev('fracture', { region, name: R.fracture }); }

  // The wound model (GAME tables). armour: item instances (or defs) with def.armour; instance.dur is worn down.
  M.hit = (hitIn, armour = []) => {
    const h = normaliseHit(hitIn, rng);
    const Z = ZONES[h.zone], res = { region: h.part, zone: h.zone, face: h.face, dmg: +h.dmg.toFixed(1), pen: +h.pen.toFixed(1), layers: [], penetrated: true, hp: 0, bleed: null, fracture: null, ptx: null, concussion: false, source: h.source || h.round || h.kind };
    if (M.dead) { res.dead = true; return res; }
    let dmg = h.dmg, pen = h.pen, blunt = 0;
    // armour, outermost first (layers in listed order per item, items in given order)
    for (const it of armour) {
      const def = defOf(it); const A = def?.armour; if (!A) continue;
      for (const L of A.layers) {
        const cov = L.zones[h.zone]; if (!cov || (L.faces && !L.faces.includes(h.face))) continue;
        if (rng() > cov) { res.layers.push({ item: def.id, mat: L.mat, covered: false }); continue; }
        const durMax = A.durMax || 1; if (it.dur == null && it.uid != null) it.dur = durMax;   // instances (with uid) wear; bare defs don't
        const durFrac = it.dur != null ? clamp(it.dur / durMax) : 1;
        const cls = MATS[L.mat].cls, p = penProbability(pen, cls, durFrac), stopped = rng() >= p;
        if (it.dur != null) it.dur = Math.max(0, it.dur - dmg * (stopped ? 0.12 : 0.05) * (1 + pen / 40));   // GAME wear
        res.layers.push({ item: def.id, mat: L.mat, cls, covered: true, pPen: +p.toFixed(3), stopped });
        if (stopped) { res.penetrated = false; blunt = dmg * ARMOUR_CLASS[cls].blunt; break; }
        dmg *= 0.85; pen *= 0.75;   // GAME: going through armour costs damage and penetration
      }
      if (!res.penetrated) break;
    }
    M.adrenaline = Math.min(1, M.adrenaline + 0.45);
    const region = h.part;
    if (!res.penetrated) {
      res.hp = +blunt.toFixed(1); res.blunt = res.hp;
      M.damage(region, blunt, h); addPain(region, blunt * 0.8);
      if (h.zone === 'chest' && rng() < clamp((blunt - 6) / 30, 0, 0.5)) { addFracture('thorax', 'RIBS'); res.fracture = 'RIBS'; }
      if (h.zone === 'cranium' && rng() < clamp((blunt - 4) / 12, 0, 0.7)) { res.concussion = true; concuss(15 + rng() * 30); }
      ev('hit', { ...res });
      return res;
    }
    const hp = dmg * Z.dmgMul * (0.85 + 0.3 * rng()); res.hp = +hp.toFixed(1);
    res.exit = h.kind === 'bullet' && dmg > 45 && rng() < 0.6;
    M.regions[region].wounds++;
    // bleed: the wound's worst vessel decides its type. Wound size k scales the chance of reaching a big vessel.
    const k = clamp(dmg / 45 * h.bleed, 0.1, 1.6);
    if (dmg > 2) {
      if (rng() < Z.artery.p * k) res.bleed = addBleed(region, h.zone, 'arterial', Z.artery.rate * (0.8 + 0.4 * rng()), Z.artery.ctl, Z.artery.name);
      else if (rng() < clamp(Z.heavyP * k, 0, 0.8)) res.bleed = addBleed(region, h.zone, 'heavy', Z.heavy * (0.7 + 0.6 * rng()), Z.heavyCtl === 'internal' && rng() < 0.4 ? 'junctional' : Z.heavyCtl, 'VENOUS');
      else if (rng() < 0.9) res.bleed = addBleed(region, h.zone, 'light', Z.light * (0.6 + 0.8 * rng()) * (0.4 + 0.6 * Math.min(1, k)), Z.heavyCtl === 'internal' ? 'surface' : Z.heavyCtl === 'junctional' ? 'surface' : Z.heavyCtl, 'WOUND');
      if (res.exit && rng() < 0.7) addBleed(region, h.zone, 'light', Z.light * 0.8, Z.heavyCtl === 'tq' ? 'tq' : 'surface', 'EXIT WOUND');
    }
    if (res.bleed) res.bleed = res.bleed.type;
    if (Z.bone && rng() < clamp(Z.bone * Math.min(1.6, dmg / 50))) { addFracture(region, Z.boneName); res.fracture = Z.boneName; }
    if (Z.ptx && dmg > 8 && rng() < Z.ptx * Math.min(1, dmg / 30)) {
      const open = res.exit || dmg > 60 || rng() < 0.45;
      if (!M.ptx) M.ptx = { open, sev: open ? 0.45 : 0.25, sealed: false, vented: false, tension: 0, decompressed: 0 };
      else { M.ptx.open = M.ptx.open || open; M.ptx.sealed = M.ptx.sealed && !open; }
      res.ptx = open ? 'OPEN' : 'CLOSED'; ev('ptx', { open });
    }
    if (h.zone === 'cranium' && hp < M.regions.head.hp && rng() < 0.6) { res.concussion = true; concuss(20 + rng() * 60); }
    M.damage(region, hp, h);
    ev('hit', { ...res });
    return res;
  };
  function concuss(s) { M.concussion = Math.min(1, M.concussion + 0.6); M.ko = Math.max(M.ko, s); }

  // falls: impact speed m/s. Below ~6 m/s (1.8 m) nothing; leg damage and fractures above (INFERRED: 50% leg/ankle
  // injury around 4-5 m drops (~9.5 m/s), parachute landing ~5-7 m/s is survivable with a PLF).
  M.fall = (v, { plf = false } = {}) => {
    const e = Math.max(0, v - (plf ? 7 : 6)); if (e <= 0) return null;
    const hp = e * e * 2.2;
    for (const r of ['legL', 'legR']) { M.damage(r, hp * (0.7 + 0.6 * rng())); if (rng() < clamp(e / 6)) addFracture(r, rng() < 0.5 ? 'TIBIA' : 'ANKLE'); }
    if (e > 8) M.damage('stomach', hp * 0.5); if (e > 12) M.damage('head', hp * 0.4);
    ev('fall', { v }); return { hp };
  };

  // ----------------------------------------------------------------------------------------------------- treatment
  // by: { self: bool, skill: 'rifleman' | 'corpsman', mods?: medic's own mods (hands) }
  const ARM = { armL: 1, armR: 1 }, LEG = { legL: 1, legR: 1 };
  const worstBleed = (region, pred) => M.bleeds.filter(b => b.region === region && !b.stopped && pred(b)).sort((a, b) => b.rate * b.ctrl - a.rate * a.ctrl)[0];
  const isLimb = r => ARM[r] || LEG[r];
  // Options for using `item` on `region`. Returns { ok, reason, action, time, label }.
  M.treatOptions = (item, region, by = { self: true, skill: M.skill }) => {
    const def = defOf(item);
    if (item === 'removeTQ') {
      const R = M.regions[region]; if (!R?.tq.length) return { ok: false, reason: 'NO TOURNIQUET' };
      return { ok: true, action: 'removeTQ', time: by.self ? 8 : 5, label: 'REMOVE TOURNIQUET' };
    }
    if (item === 'tightenTQ') {   // windlass types only (CAT, cravat): another turn and re-lock
      const R = M.regions[region]; const q = R?.tq[R.tq.length - 1];
      if (!q) return { ok: false, reason: 'NO TOURNIQUET' };
      if (q.item === 'tq_strap') return { ok: false, reason: 'STRAP: ADD A SECOND' };
      if (q.ok && q.slip < 0.02) return { ok: false, reason: 'ALREADY TIGHT' };
      return { ok: true, action: 'tightenTQ', time: by.self ? 15 : 10, label: 'TIGHTEN TOURNIQUET' };
    }
    const med = def?.med; if (!med) return { ok: false, reason: 'NOT A MEDICAL ITEM' };
    if (M.dead) return { ok: false, reason: 'DEAD' };
    if (by.self && M.unconscious) return { ok: false, reason: 'UNCONSCIOUS' };
    if (med.who === 'corpsman' && by.skill !== 'corpsman') return { ok: false, reason: 'CORPSMAN ONLY' };
    const usesLeft = item?.uses ?? med.uses ?? 1; if (usesLeft <= 0) return { ok: false, reason: 'EMPTY' };
    if (by.self) {
      const armsOut = ['armL', 'armR'].filter(a => M.regions[a].hp <= 0 || M.regions[a].lost).length;
      if (armsOut >= 2) return { ok: false, reason: 'NO WORKING HANDS' };
    }
    const R = region ? M.regions[region] : null;
    let action = null, label = '', why = '';
    switch (med.kind) {
      case 'dressing': {
        if (!R) { why = 'PICK A BODY PART'; break; }
        if (region === 'thorax' && M.ptx?.open && !M.ptx.sealed) { action = 'seal'; label = 'SEAL CHEST WOUND (WRAPPER)'; break; }
        const b = worstBleed(region, b => !b.dressed && b.ctl !== 'internal'); if (b) { action = 'dress'; label = `DRESS ${b.type.toUpperCase()} BLEED`; } else why = M.bleeds.some(b => b.region === region && !b.stopped) ? 'INTERNAL BLEEDING' : 'NO OPEN WOUND';
        break;
      }
      case 'tourniquet': case 'cravat': {
        if (!R) { why = 'PICK A LIMB'; break; }
        if (med.kind === 'cravat' && !isLimb(region)) { why = 'LIMBS ONLY'; break; }
        if (med.kind === 'cravat' && !worstBleed(region, b => b.ctl === 'tq' && (b.type !== 'light'))) {
          if (R.fracture && !R.splint && !R.sling && ARM[region]) { action = 'sling'; label = 'SLING AND SWATHE'; break; }
          why = R.fracture ? 'NEEDS A SPLINT' : 'NO LIMB BLEED'; break;
        }
        if (!isLimb(region)) { why = 'LIMBS ONLY'; break; }
        if (R.lost) { why = 'LIMB LOST'; break; }
        if (R.tq.length >= (LEG[region] ? 2 : 1)) { why = 'ALREADY ON'; break; }
        action = 'tq'; label = med.kind === 'cravat' ? 'IMPROVISED TOURNIQUET' : R.tq.length ? 'SECOND TOURNIQUET, ABOVE' : 'TOURNIQUET HIGH AND TIGHT'; break;
      }
      case 'hemostatic': {
        if (!R) { why = 'PICK A BODY PART'; break; }
        const b = worstBleed(region, b => !b.packed && (b.ctl === 'tq' || b.ctl === 'junctional') && b.type !== 'light');
        if (b) { action = 'pack'; label = `PACK ${b.name}`; } else why = M.bleeds.some(b => b.region === region && !b.stopped && b.ctl === 'internal') ? 'INTERNAL: NEEDS SURGERY' : 'NOTHING TO PACK';
        break;
      }
      case 'splint': if (!R || !isLimb(region)) { why = 'LIMBS ONLY'; break; } if (!R.fracture) { why = 'NO FRACTURE'; break; } if (R.splint >= med.quality) { why = 'ALREADY SPLINTED'; break; } action = 'splint'; label = 'SPLINT'; break;
      case 'chestseal': if (!M.ptx?.open || (M.ptx.sealed && M.ptx.vented)) { why = 'NO OPEN CHEST WOUND'; break; } action = 'seal'; label = 'VENTED CHEST SEAL'; region = 'thorax'; break;
      case 'decompress': if (!M.ptx) { why = 'NO PNEUMOTHORAX'; break; } if (by.self && by.skill !== 'corpsman') { why = 'CORPSMAN ONLY'; break; } action = 'decompress'; label = 'NEEDLE DECOMPRESSION'; region = 'thorax'; break;
      case 'woundcare': {
        if (!R) { why = 'PICK A BODY PART'; break; }
        if (R.lost) { why = 'LIMB LOST'; break; }
        if (R.hp >= R.max * med.hpTo) { why = 'NOT NEEDED'; break; }
        if (REGION[region].vital && R.hp <= 0) { why = 'TOO LATE'; break; }
        action = 'woundcare'; label = 'WOUND CARE'; break;
      }
      case 'opioid': action = 'opioid'; label = `${med.mg} MG ${med.route.toUpperCase()}`; region = null; break;
      case 'tablet': action = 'tablet'; label = 'TAKE TABLETS'; region = null; break;
      case 'iv': if (M.iv) { why = 'IV ALREADY RUNNING'; break; } action = 'iv'; label = `START IV ${med.ml} ML`; region = region && isLimb(region) ? region : 'armL'; break;
      case 'inhalant': if (!M.unconscious || M.ko <= 0) { why = M.unconscious ? 'WON\'T HELP (SHOCK)' : 'NOT NEEDED'; break; } action = 'rouse'; label = 'AMMONIA INHALANT'; region = null; break;
      case 'nanite': action = 'nanite'; label = 'INJECT NANITES'; region = null; break;
      case 'drink': if (M.unconscious) { why = 'UNCONSCIOUS'; break; } if ((item?.water ?? def.water ?? 0) <= 0) { why = 'EMPTY'; break; } action = 'drink'; label = 'DRINK'; region = null; break;
      case 'eat': if (M.unconscious) { why = 'UNCONSCIOUS'; break; } action = 'eat'; label = 'EAT'; region = null; break;
      default: why = 'UNKNOWN';
    }
    if (!action) return { ok: false, reason: why || 'CAN\'T' };
    // application time
    let T = med.time ? (by.self ? med.time.self : med.time.buddy) : 10;
    if (T && typeof T === 'object') T = region && ARM[region] ? T.arm : T.leg;
    if (by.self) {
      if (region && ARM[region] && (action === 'tq' || action === 'splint' || action === 'sling') && med.kind !== 'tourniquet') T *= 1.6;   // one-handed on your own arm
      const bad = ['armL', 'armR'].filter(a => M.regions[a].hp <= 0 || (M.regions[a].fracture && !M.regions[a].splint)).length;
      if (bad) T *= 1.5;
      if (M.cls() >= 3) T *= 1.3;   // fumbling
    }
    if (by.skill === 'corpsman' && !by.self) T *= 0.8;
    if (by.speed > 0) T /= by.speed;   // PERSONNEL: the medic's own experience (roster perf, ~0.55 green .. 1.2 veteran)
    if (action === 'eat' && def.med.needs === 'p38' && by.has && !by.has('p38')) { T *= 2; label += ' (BAYONET AS OPENER)'; }
    return { ok: true, action, time: Math.round(T * 10) / 10, label, region };
  };

  M.startTreatment = ({ item, region, by = { self: true, skill: M.skill } }) => {
    if (M.action) return { ok: false, reason: 'BUSY' };
    const o = M.treatOptions(item, region, by); if (!o.ok) return o;
    M.action = { item: typeof item === 'object' ? item : null, def: typeof item === 'string' && !ITEMS[item] ? null : defOf(item)?.id, kind: o.action, region: o.region ?? region, t: 0, T: o.time, label: o.label, by };
    ev('treatStart', { action: o.action, region: M.action.region, time: o.time, label: o.label });
    return o;
  };
  M.cancelTreatment = () => { if (M.action) { ev('treatCancel', { action: M.action.kind }); M.action = null; } };

  function consume(item, n = 1) {
    if (!item || typeof item !== 'object') return;
    if (item.n > 1) { item.n -= n; return; }
    const def = defOf(item); item.uses = (item.uses ?? def.med?.uses ?? 1) - n;
    if (item.uses <= 0) { item._gone = true; ev('consumed', { item: def.id, uid: item.uid }); }
  }
  function applyTreatment(a) {
    const def = a.def ? ITEMS[a.def] : null, med = def?.med, R = a.region ? M.regions[a.region] : null;
    switch (a.kind) {
      case 'dress': {
        const b = worstBleed(a.region, b => !b.dressed && b.ctl !== 'internal'); if (!b) return;
        b.dressed = true;
        if (b.type === 'light') b.stopped = true; else b.ctrl *= b.type === 'heavy' ? med.heavyMul : med.arterialMul;
        // the same dressing covers the light oozes of that region too
        for (const o of M.bleeds) if (o.region === a.region && o.type === 'light' && o.ctl !== 'internal') { o.stopped = true; o.dressed = true; }
        R.dressings++; consume(a.item); break;
      }
      case 'seal': M.ptx.sealed = true; M.ptx.vented = !!med.vented; R.dressings++; consume(a.item);
        for (const o of M.bleeds) if (o.region === 'thorax' && o.type === 'light') o.stopped = true; break;
      case 'tq': {
        // Each application succeeds (artery closed) or not (venous congestion, partial flow) - field effectiveness
        // per type (WALTERS, KRAGH): CAT ~97%, strap & buckle on a thigh ~30%, cravat windlass ~60%. A buddy has both
        // hands and a better angle (+8%). A failed one shows as a limb that keeps bleeding: tighten = add a second.
        const q = med.tq, limb = REGION[a.region].limb;
        const ok = rng() < Math.min(1, q.p[limb] + (a.by?.self ? 0 : 0.08));
        const occl = ok ? lerp(q.occl[0], q.occl[1], rng()) : lerp(q.fail[0], q.fail[1], rng());
        R.tq.push({ item: def.id, occl, ok, slip: 0, slipPerMin: q.slipPerMin, pain: q.pain, t: 0 });
        addPain(a.region, q.pain); consume(a.item); ev('tqApplied', { region: a.region, ok }); break;
      }
      case 'removeTQ': R.tq.pop(); ev('tqOff', { region: a.region }); break;
      case 'tightenTQ': {
        const q = R.tq[R.tq.length - 1]; if (!q) return; const d = ITEMS[q.item].med.tq, limb = REGION[a.region].limb;
        q.slip = 0; if (!q.ok && rng() < Math.min(1, d.p[limb] + 0.1)) { q.ok = true; q.occl = lerp(d.occl[0], d.occl[1], rng()); }
        addPain(a.region, 10); ev('tqApplied', { region: a.region, ok: q.ok, tightened: true }); break;
      }
      case 'sling': R.sling = true; R.splint = Math.max(R.splint, 0.4); consume(a.item); break;
      case 'pack': {
        const b = worstBleed(a.region, b => !b.packed && (b.ctl === 'tq' || b.ctl === 'junctional') && b.type !== 'light'); if (!b) return;
        b.packed = true; if (rng() < (b.type === 'arterial' ? med.arterial : med.heavy)) b.stopped = true; else b.ctrl *= 0.3;
        consume(a.item); break;
      }
      case 'splint': R.splint = Math.max(R.splint, med.quality); consume(a.item); break;
      case 'decompress': M.ptx.tension = 0; M.ptx.decompressed++; consume(a.item); break;
      case 'woundcare': {
        R.hp = Math.max(R.hp, Math.round(R.max * med.hpTo)); R.pain *= 0.7;
        for (const b of M.bleeds) if (b.region === a.region && b.type === 'light') b.stopped = true;
        consume(a.item); ev('healed', { region: a.region, hp: R.hp }); break;
      }
      case 'opioid': M.opioidDepot.push({ mg: med.mg, tau: MED.OPIOID_ABS_S[med.route] || 120 }); consume(a.item); break;
      case 'tablet': M.tablets.push({ a: med.analgesia, left: med.hours * 3600 }); consume(a.item); break;
      case 'iv': M.iv = { left: med.ml, rate: med.mlPerMin / 60, region: a.region }; consume(a.item); break;
      case 'rouse': M.ko = 0; M.concussion *= 0.5; consume(a.item); break;
      case 'nanite': {
        const recent = M.naniteDoses.filter(t => M.t - t < 600).length; M.naniteDoses.push(M.t);
        M.nanite = { left: med.seconds, T: med.seconds }; consume(a.item);
        if (recent) { M.ko = Math.max(M.ko, 60); ev('naniteOverdose', {}); }
        break;
      }
      case 'drink': {
        const it = a.item, have = it?.water ?? 0, ml = Math.min(med.sipMl, have);
        if (it) it.water = have - ml; M.waterDef = Math.max(-500, M.waterDef - ml); break;
      }
      case 'eat': M.kcalDef = Math.max(-1500, M.kcalDef - med.kcal); M.waterDef += -(med.waterMl || 0); consume(a.item); break;
    }
    ev('treated', { action: a.kind, region: a.region, item: a.def });
  }
  // where a quick-slot medical item should go without the health screen (Tarkov-style auto target)
  M.autoTarget = (item, by = { self: true, skill: M.skill }) => {
    const def = defOf(item); if (!def?.med) return null;
    const order = [...REGIONS].sort((a, b) => regionUrgency(b) - regionUrgency(a));
    for (const r of [null, ...order]) { const o = M.treatOptions(item, r, by); if (o.ok) return o.region ?? r; }
    return undefined;
  };
  function regionUrgency(r) { const R = M.regions[r], mr = mapNow() / MED.MAP0; return M.bleeds.filter(b => b.region === r).reduce((s, b) => s + bleedFlow(b, mr), 0) * 100 + (R.fracture && !R.splint ? 5 : 0) + (1 - R.hp / R.max); }

  // ------------------------------------------------------------------------------------------------------- update
  // ctx: { exertion 0..1 (0 = standing, 0.5 = walking with load, 1 = sprinting), moving }
  M.update = (dt, ctx = {}) => {
    M.events = [];
    if (dt <= 0) return M.events;
    M.t += dt;
    if (M.dead) return M.events;
    M.exertion = M.unconscious ? 0 : clamp(ctx.exertion ?? 0);
    const map = mapNow(), mr = map / MED.MAP0;
    // bleeding
    let lost = 0;
    for (const b of M.bleeds) {
      if (b.stopped) continue;
      b.t += dt;
      const f = bleedFlow(b, mr) * dt; lost += f;
      // clotting: light bleeds clot; heavy slowly (faster when dressed or the pressure is low); arterial only at very low pressure
      if (b.type === 'light') b.clot = 1 - (1 - b.clot) * Math.exp(-dt / (MED.LIGHT_CLOT_S * (ctx.moving ? 1.6 : 1)));
      else if (b.type === 'heavy') b.clot = 1 - (1 - b.clot) * Math.exp(-dt / (MED.HEAVY_CLOT_S * (b.dressed ? 0.35 : 1) / (mr < 0.75 ? 2 : 1)));
      else if (mr < 0.5) b.clot = 1 - (1 - b.clot) * Math.exp(-dt / 900);
      if (b.clot > 0.98 && b.type !== 'arterial') { b.stopped = true; ev('bleedStop', { region: b.region, bleed: b.type }); }
    }
    if (lost > 0) { const h = M.hct(); M.vol -= lost; M.rbc -= lost * h; }
    // IV infusion
    if (M.iv) { const ml = Math.min(M.iv.left, M.iv.rate * dt); M.iv.left -= ml; M.vol += ml; M.cryst += ml; M.crystIn += ml; if (M.iv.left <= 0) { M.iv = null; ev('ivDone', {}); } }
    if (M.cryst > M.crystIn * MED.CRYST_KEEP) { const leak = (M.cryst - M.crystIn * MED.CRYST_KEEP) * dt / MED.CRYST_LEAK_S; M.cryst -= leak; M.vol -= leak; }
    // transcapillary refill (plasma only; draws on body water)
    const deficit = V0 - M.vol;
    if (deficit > 0 && M.waterDef < 4000) { const ml = Math.min(MED.REFILL_MAX_ML_MIN / 60, deficit * MED.REFILL_FRAC_PER_H / 3600) * dt; M.vol += ml; M.waterDef += ml; }
    // nanites (FICTION): stop bleeds, knit bones, rebuild tissue and blood over their run
    if (M.nanite) {
      const k = dt / M.nanite.T; M.nanite.left -= dt;
      for (const b of M.bleeds) { b.ctrl *= Math.exp(-dt / 4); if (b.ctrl < 0.02) b.stopped = true; }
      for (const r of REGIONS) { const R = M.regions[r]; if (R.lost && M.nanite.left < M.nanite.T * 0.3) { R.lost = false; ev('regrown', { region: r }); } if (!R.lost) R.hp = Math.min(R.max, R.hp + R.max * k * 1.2); if (R.fracture && M.nanite.left < M.nanite.T * 0.5) { R.fracture = null; R.splint = 0; } R.pain *= Math.exp(-dt / 10); }
      const add = Math.min(V0 - M.vol, 1200 * k); if (add > 0) { M.vol += add; M.rbc += add * MED.HCT0; }
      if (M.ptx && M.nanite.left < M.nanite.T * 0.5) M.ptx = null;
      if (M.nanite.left <= 0) { M.nanite = null; ev('naniteDone', {}); }
    }
    // opioids: depot -> body -> eliminated
    for (const d of M.opioidDepot) { const a = d.mg * (1 - Math.exp(-dt / d.tau)); d.mg -= a; M.opioid += a; }
    M.opioidDepot = M.opioidDepot.filter(d => d.mg > 0.05);
    M.opioid *= Math.exp(-dt * Math.LN2 / MED.OPIOID_HALF_S);
    for (const tb of M.tablets) tb.left -= dt; M.tablets = M.tablets.filter(tb => tb.left > 0);
    M.adrenaline *= Math.exp(-dt / MED.ADRENALINE_S);
    M.concussion *= Math.exp(-dt / 600);
    if (M.ko > 0) M.ko = Math.max(0, M.ko - dt);
    // tourniquets: slip, ischaemia
    for (const r of REGIONS) {
      const R = M.regions[r];
      for (const q of R.tq) {
        q.t += dt; q.slip = Math.min(q.occl, q.slip + q.slipPerMin * dt / 60 * (ctx.moving ? 2 : 1));
        if (q.t > MED.TQ_SAFE_S && !R.lost) { R.hp = Math.max(0, R.hp - R.max * dt / (MED.TQ_LOSS_S - MED.TQ_SAFE_S)); if (!q.warned) { q.warned = true; ev('tqIschaemia', { region: r }); } }
        if (q.t > MED.TQ_LOSS_S && !R.lost) { R.lost = true; R.hp = 0; ev('limbLost', { region: r }); }
      }
      // pain relaxes towards a floor set by damage, fractures and tourniquets
      const floor = (1 - R.hp / R.max) * 30 + (R.fracture ? 40 * (1 - 0.7 * R.splint) : 0) + R.tq.reduce((s, q) => s + q.pain, 0) + (R.lost ? 10 : 0);
      R.pain = R.pain > floor ? floor + (R.pain - floor) * Math.exp(-dt / MED.PAIN_DECAY_S) : floor;
      if (R.fracture && !R.splint && ctx.moving && LEG[r]) R.pain = Math.min(100, R.pain + 4 * dt);
    }
    // pneumothorax: open = steady; sealed without a vent or closed = tension builds; vented = resolves
    if (M.ptx) {
      const P = M.ptx;
      if (P.open && !P.sealed) P.sev = 0.45;
      else if (P.sealed && P.vented) { P.sev = Math.max(0.1, P.sev - dt / 600); P.tension = Math.max(0, P.tension - dt / 120); }
      else { P.sev = P.open ? 0.15 : 0.25; P.tension = Math.min(1, P.tension + dt / 60 * (P.decompressed ? 0.008 : P.open ? 0.05 : 0.04)); }
    }
    // water and energy
    M.waterDef += lerp(MED.SWEAT_ML_H[0], MED.SWEAT_ML_H[1], M.exertion) * dt / 3600;
    M.kcalDef += lerp(MED.KCAL_H[0], MED.KCAL_H[1], M.exertion) * dt / 3600 * (M.blacked('stomach') ? 3 : 1);
    // oxygen: pneumothorax, respiratory depression, very low perfusion
    const sed = M.opioidSed();
    let spo2 = 98 - (M.ptx ? 10 * M.ptx.sev + 42 * M.ptx.tension : 0) - 30 * smooth(0.6, 1, sed) - 10 * smooth(0.42, 0.5, M.lossFrac());
    M.spo2 += (spo2 - M.spo2) * (1 - Math.exp(-dt / 20));
    // consciousness: cerebral perfusion x oxygen x sedation x knock-out
    const c = smooth(48, 68, map) * smooth(70, 88, M.spo2) * (1 - 0.8 * smooth(0.5, 1, sed));
    M.conscious = M.ko > 0 ? 0 : c;
    const wasOut = M.unconscious;
    M.unconscious = M.ko > 0 || M.conscious < (wasOut ? 0.4 : 0.25);
    if (M.unconscious && !wasOut) { ev('unconscious', { why: M.ko > 0 ? 'knocked out' : sed > 0.6 ? 'opioids' : M.spo2 < 85 ? 'hypoxia' : 'shock' }); if (M.action?.by?.self) M.cancelTreatment(); }
    if (!M.unconscious && wasOut) ev('conscious', {});
    // death
    if (M.lossFrac() >= MED.DEATH_LOSS) die('DIED: BLOOD LOSS');
    M.hypoxiaT = M.spo2 < 60 ? M.hypoxiaT + dt : Math.max(0, M.hypoxiaT - dt);
    if (M.hypoxiaT > 120) die(M.ptx?.tension > 0.7 ? 'DIED: TENSION PNEUMOTHORAX' : sed > 0.8 ? 'DIED: MORPHINE OVERDOSE' : 'DIED: HYPOXIA');
    if (M.opioid * (M.cls() >= 3 ? 1.5 : 1) > MED.OPIOID_APNOEA * 1.15) { M.apnoeaT += dt; if (M.apnoeaT > 180) die('DIED: MORPHINE OVERDOSE'); } else M.apnoeaT = 0;
    // treatment progress
    if (M.action && !M.dead) { M.action.t += dt; if (M.action.t >= M.action.T) { const a = M.action; M.action = null; applyTreatment(a); } }
    return M.events;
  };

  // ------------------------------------------------------------------------------------------------------ modifiers
  // Consumed by the soldier sim each frame. Multipliers are 1 when healthy.
  M.mods = () => {
    const lf = M.lossFrac(), cls = shockClass(lf), pain = M.pain(), sed = M.opioidSed();
    const o = { dead: M.dead, unconscious: M.unconscious, conscious: M.conscious, cls, pain: Math.round(pain), bleeding: M.bleedRate(), bloodPct: Math.round((1 - lf) * 100),
      speedMul: 1, sprint: true, jump: true, crawlOnly: false, limp: 0, aimSway: 1, tremor: 0, adsTimeMul: 1, reloadMul: 1, weaponUse: 'both',
      staminaRegenMul: 1, staminaMaxMul: 1, staminaDrainMul: 1, vision: { tunnel: 0, grey: 0, blur: 0, blackout: 0, tint: null }, hearing: 1, breathing: 0, heartRate: 0, nanite: !!M.nanite };
    if (M.dead || M.unconscious) { o.speedMul = 0; o.sprint = o.jump = false; o.weaponUse = 'none'; o.vision.blackout = 1; return o; }
    // legs
    let legsOut = 0;
    for (const r of ['legL', 'legR']) {
      const R = M.regions[r]; let f = 1;
      if (R.hp <= 0 || R.lost) { f = 0.6; legsOut++; } else if (R.hp < R.max * 0.5) f = 0.9;
      if (R.fracture) f = Math.min(f, lerp(0.5, 0.85, R.splint));
      if (R.tq.length) f *= 0.92;
      o.speedMul *= f; o.limp = Math.max(o.limp, 1 - f);
      if (R.fracture || R.hp <= 0 || R.lost) { o.sprint = false; o.jump = false; }
    }
    if (legsOut === 2) { o.crawlOnly = true; o.speedMul = Math.min(o.speedMul, 0.25); }
    if (M.regions.stomach.fracture) { o.speedMul *= 0.6; o.sprint = false; o.jump = false; }   // pelvis
    // arms
    let armsOut = 0;
    for (const r of ['armL', 'armR']) {
      const R = M.regions[r]; let s = 0;
      if (R.hp <= 0 || R.lost) { s = 1.0; armsOut++; } else if (R.fracture) s = lerp(0.9, 0.3, R.splint); else if (R.hp < R.max * 0.5) s = 0.2;
      if (R.tq.length) s += 0.25;
      o.aimSway += s; o.reloadMul += s * 0.6; o.adsTimeMul += s * 0.4;
      if ((R.fracture && !R.splint) || R.hp <= 0 || R.lost) o.tremor += 0.0015;
    }
    o.weaponUse = armsOut >= 2 ? 'none' : armsOut === 1 || (M.regions.armL.fracture && M.regions.armR.fracture) ? 'one' : 'both';
    // shock
    const SH = [null, { sp: 1, sw: 0, tr: 0, reg: 1 }, { sp: 0.95, sw: 0.2, tr: 0.001, reg: 0.8 }, { sp: 0.75, sw: 0.6, tr: 0.004, reg: 0.5 }, { sp: 0.45, sw: 1.2, tr: 0.008, reg: 0.2 }][cls];
    o.speedMul *= SH.sp; o.aimSway += SH.sw; o.tremor += SH.tr; o.staminaRegenMul *= SH.reg; o.staminaMaxMul *= lerp(1, 0.4, smooth(0.15, 0.45, lf));
    if (cls >= 3) { o.sprint = false; o.jump = false; }
    // pain, adrenaline, opioids
    o.aimSway += pain / 120; o.tremor += 0.0025 * smooth(25, 90, pain) + 0.0025 * M.adrenaline;
    if (pain > 85) { o.sprint = false; o.speedMul *= 0.85; }
    o.staminaRegenMul *= 1 - 0.3 * smooth(30, 100, pain);
    o.aimSway += 0.6 * sed; o.speedMul *= 1 - 0.25 * sed; o.reloadMul += 0.5 * sed;
    // breathing: pneumothorax, ribs
    if (M.ptx) { o.staminaRegenMul *= 1 - 0.5 * M.ptx.sev - 0.4 * M.ptx.tension; o.staminaMaxMul *= 1 - 0.3 * M.ptx.sev; if (M.ptx.tension > 0.5) o.sprint = false; }
    if (M.regions.thorax.fracture) { o.staminaRegenMul *= 0.75; o.aimSway += 0.15; }
    if (M.regions.thorax.hp <= M.regions.thorax.max * 0.4) o.staminaMaxMul *= 0.8;
    // water and food (only after hours)
    const dry = smooth(1500, 4500, M.waterDef), hungry = smooth(2500, 6000, M.kcalDef);
    o.staminaRegenMul *= 1 - 0.4 * dry - 0.3 * hungry; o.tremor += 0.0015 * dry; o.aimSway += 0.3 * dry;
    // nanites hum
    if (M.nanite) { o.tremor += 0.003; o.vision.tint = [0.3, 0.95, 1, 0.12]; }
    // vision
    o.vision.tunnel = clamp(smooth(0.27, 0.48, lf) * 0.85 + smooth(90, 70, M.spo2) * 0.6 + 0.3 * sed);
    o.vision.grey = clamp(smooth(0.22, 0.46, lf));
    o.vision.blur = clamp(0.5 * M.concussion + 0.4 * sed + 0.3 * smooth(0.38, 0.48, lf));
    o.vision.blackout = clamp(1 - smooth(0.25, 0.8, M.conscious));
    o.hearing = 1 - 0.6 * M.concussion;
    o.breathing = clamp(M.exertion * 0.6 + (cls - 1) * 0.2 + (M.ptx ? 0.5 * M.ptx.sev + 0.5 * M.ptx.tension : 0));
    o.heartRate = M.vitals().hr;
    o.speedMul = clamp(o.speedMul, 0, 1);
    return o;
  };

  // ------------------------------------------------------------------------------------------------- state access
  // Per-region summary for UIs: hp, status flags and the live bleed rate.
  M.summary = () => {
    const mr = mapNow() / MED.MAP0, out = {};
    for (const r of REGIONS) {
      const R = M.regions[r], bl = M.bleeds.filter(b => b.region === r && !b.stopped);
      const worst = bl.reduce((w, b) => { const k = { light: 1, heavy: 2, arterial: 3 }[b.type]; return k > w ? k : w; }, 0);
      out[r] = { name: REGION[r].name, hp: R.hp, max: R.max, blacked: R.hp <= 0, lost: R.lost, fracture: R.fracture, splint: R.splint, sling: R.sling, pain: Math.round(R.pain),
        bleed: [null, 'light', 'heavy', 'arterial'][worst], bleedMlMin: Math.round(bl.reduce((s, b) => s + bleedFlow(b, mr), 0) * 60), internal: bl.some(b => b.ctl === 'internal'),
        tq: R.tq.map(q => ({ item: q.item, t: q.t, ok: q.ok, occl: clamp(q.occl - q.slip) })), dressed: bl.some(b => b.dressed) || R.dressings > 0, wounds: R.wounds,
        bleeds: bl.map(b => ({ id: b.id, type: b.type, zone: b.zone, name: b.name, ctl: b.ctl, mlMin: Math.round(bleedFlow(b, mr) * 60), dressed: b.dressed, packed: b.packed })) };
    }
    return out;
  };
  M.restore = () => { freshRegions(); M.bleeds = []; M.vol = V0; M.rbc = V0 * MED.HCT0; M.cryst = M.crystIn = 0; M.iv = null; M.opioidDepot = []; M.opioid = 0; M.tablets = []; M.adrenaline = 0; M.concussion = 0; M.ko = 0; M.ptx = null; M.spo2 = 98; M.hypoxiaT = M.apnoeaT = 0; M.waterDef = M.kcalDef = 0; M.nanite = null; M.naniteDoses = []; M.conscious = 1; M.unconscious = M.dead = false; M.cause = null; M.action = null; ev('restored'); };
  const KEYS = ['t', 'regions', 'bleeds', 'nextId', 'vol', 'rbc', 'cryst', 'crystIn', 'iv', 'opioidDepot', 'opioid', 'tablets', 'adrenaline', 'concussion', 'ko', 'ptx', 'spo2', 'hypoxiaT', 'apnoeaT', 'waterDef', 'kcalDef', 'nanite', 'naniteDoses', 'conscious', 'unconscious', 'dead', 'cause', 'skill'];
  M.serialize = () => JSON.parse(JSON.stringify(Object.fromEntries(KEYS.map(k => [k, M[k]]))));
  M.load = o => { for (const k of KEYS) if (k in o) M[k] = JSON.parse(JSON.stringify(o[k])); M.action = null; };
  return M;
}

// ---------------------------------------------------------------------------------------------------------- buddy aid
// Treating another soldier: call patient.startTreatment({ item, region, by: { self: false, skill: medic.skill } })
// from the medic's side; the medic is "busy" while patient.action is set (the INFANTRY layer should lock the medic's
// hands and cancel when either moves > 1.5 m apart). Items come out of the MEDIC's inventory (or the patient's: a
// corpsman uses the casualty's own first-aid case first - doctrine).
// Moving casualties (speeds INFERRED from casualty-drag trials: ~0.6-1.0 m/s dragging an 80-100 kg loaded casualty,
// fireman's carry ~1.1 m/s but exhausting; the dragger's own injuries and load reduce both).
export const BUDDY = {
  dragSpeed(draggerMods, casualtyKg = 95, draggerLoadKg = 25) {
    if (!draggerMods || draggerMods.weaponUse === 'none' || draggerMods.unconscious) return 0;
    const k = clamp(1.25 - 0.004 * (casualtyKg - 75) - 0.006 * Math.max(0, draggerLoadKg - 20), 0.3, 1.2);
    return +(0.85 * k * (draggerMods.weaponUse === 'one' ? 0.55 : 1) * Math.min(1, draggerMods.speedMul + 0.2)).toFixed(2);
  },
  carrySpeed(carrierMods, casualtyKg = 95, carrierLoadKg = 25) {
    if (!carrierMods || !carrierMods.sprint || carrierMods.weaponUse !== 'both') return 0;   // needs both arms and good legs
    return +(1.1 * clamp(1.3 - 0.005 * (casualtyKg + carrierLoadKg - 95), 0.4, 1.1) * carrierMods.speedMul).toFixed(2);
  },
  staminaDrainMul: { drag: 2.2, carry: 3.5 },   // on top of the walker's normal drain (INFERRED)
  treatRangeM: 1.5,
};
