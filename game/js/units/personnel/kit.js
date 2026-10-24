// PERSONNEL: every person's kit is MEDINV's inventory model (units/infantry/inventory.js: a soldier root with slots and
// nested grids, magazines with their rounds), generalised from the Marine rifleman to everyone: a pilot's survival
// vest and M1911, a tanker's pistol, a deck crewman's float-coat pockets, a sailor's dressing, a civilian with nothing.
// PURE (no THREE, no DOM). The kit is built lazily (a record with no figure near the camera costs nothing).
//
//   makeKit(rec) -> root                          by his job / MOS (the Marine kits are MEDINV's own loadouts)
//   summary(root) -> { r556, mags556, r762, r45, gl, m67, law, dressings, tq, morphine, iv, kg }
//   give(from, to, kind, n) -> how many moved     kinds: KINDS (magazines, dressings, grenades ...)
//   resupply(root, rec) -> [what was issued]      at a friendly pad / the carrier / a truck: MEDINV's rearm for riflemen
//   spend556(root, n) / spend762(root, n)         rounds a cheap (far) figure fired, taken from the real magazines
import * as I from '../infantry/inventory.js';
import { ITEMS } from '../infantry/items.js';
import { resupply as rifleResupply } from '../infantry/invbridge.js';

// job -> MEDINV loadout name (inventory.js loadout) or one of the small kits below
const JOB_KIT = { rifleman: 'rifleman', leader: 'rifleman', mg: 'mg', grenadier: 'grenadier', corpsman: 'corpsman' };
const put = (root, id, o) => { const it = I.newItem(id, o); return I.autoStore(root, it) ? it : null; };
function pistol(root, mags = 2) {
  const p = I.newItem('m1911a1'); I.slotIn(root, 'holster', p); I.slotIn(p, 'mag', I.newItem('mag_45', { fill: 'M1911', rounds: 7 }));
  for (let i = 0; i < mags; i++) put(root, 'mag_45', { fill: 'M1911', rounds: 7 });
}
export function makeKit(rec) {
  const job = rec.job, mos = rec.mos;
  if (rec.civ) return I.newSoldier();
  const lo = JOB_KIT[job] || (mos === '8404' ? 'corpsman' : mos === '0331' ? 'mg' : mos === '0351' ? 'grenadier' : (mos === '0311' || mos === '0369') ? 'rifleman' : null);
  if (lo) {
    const k = I.loadout(lo);
    if (lo === 'rifleman' && job !== 'rifleman' && k.slots.secondary) I.detach(k.slots.secondary);   // (the LAW: one man in three - the riflemen)
    return k;
  }
  const s = I.newSoldier();
  if (/^pilot|^rio/.test(job) || /^1310|^1320|^75/.test(mos)) { pistol(s, 1); put(s, 'dressing_field'); }          // aircrew: the survival vest's .38 is an M1911 here (GAME)
  else if (job === 'crewchief' || job === 'tank' || job === 'aa' || mos === '6172' || mos === '1812' || mos === '1833') { pistol(s, 2); put(s, 'dressing_field'); put(s, 'cravat'); }
  else if (job === 'driver' || mos === '3531') { I.slotIn(s, 'helmet', I.newItem('m1_helmet')); const r = I.newItem('m16a1'); I.slotIn(s, 'primary', r); I.slotIn(r, 'mag', I.newItem('mag_m16_20', { fill: 'M193', rounds: 20 })); for (let i = 0; i < 2; i++) put(s, 'mag_m16_20', { fill: 'M193', rounds: 20 }); put(s, 'dressing_field'); }
  else if (mos === 'HM-W') { for (const id of ['dressing_battle', 'dressing_field', 'dressing_field', 'cravat', 'tq_strap', 'morphine']) put(s, id); }
  else put(s, 'dressing_field');   // deck crew and ship's company: a dressing in the float coat / dungarees
  return s;
}
// what he carries, counted (the card, the AI's "out of ammo", the hand-over menu)
export function summary(root) {
  const o = { r556: 0, mags556: 0, r762: 0, r45: 0, gl: 0, m67: 0, law: 0, smoke: 0, dressings: 0, tq: 0, morphine: 0, iv: 0, splint: 0, kg: 0 };
  if (!root) return o;
  for (const it of I.walk(root)) {
    const d = ITEMS[it.id]; if (!d) continue;
    if (d.mag) { const n = I.magCount(it); if (d.mag.cal === '556') { o.r556 += n; if (n > 0) o.mags556++; } else if (d.mag.cal === '762n') o.r762 += n; else if (d.mag.cal === '45') o.r45 += n; }
    else if (d.box && it.ammo) { const n = I.magCount(it); if (d.box.round === 'M193' || d.box.round === 'M855A1') o.r556 += n; else if (d.box.round === 'M80') o.r762 += n; }
    if (d.round40 || it.id === 'r40_m406') o.gl += it.n ?? 1;
    if (it.id === 'm67') o.m67++;
    if (it.id === 'm72a2') o.law++;
    if (/^m18_/.test(it.id)) o.smoke++;
    if (/^dressing_|^cravat|quikclot/.test(it.id)) o.dressings += it.n ?? 1;
    if (/^tq_/.test(it.id)) o.tq++;
    if (it.id === 'morphine' || it.id === 'fentanyl') o.morphine += it.uses ?? 1;
    if (/^iv_/.test(it.id)) o.iv++;
    if (/splint/.test(it.id)) o.splint++;
  }
  o.kg = Math.round(I.totalWeight(root) * 10) / 10;
  return o;
}
// hand-over kinds: which items, best first
export const KINDS = {
  mag556: { label: '5.56 MAGAZINE', pick: (it, d) => !!d.mag && d.mag.cal === '556' && I.magCount(it) > 0, order: (a, b) => I.magCount(b) - I.magCount(a) },
  belt762: { label: 'M60 BELT', pick: (it, d) => !!d.mag && d.mag.cal === '762n' && I.magCount(it) > 0 && !inWeapon(it), order: (a, b) => I.magCount(b) - I.magCount(a) },
  mag45: { label: '.45 MAGAZINE', pick: (it, d) => !!d.mag && d.mag.cal === '45' && I.magCount(it) > 0 && !inWeapon(it) },
  m67: { label: 'M67 GRENADE', pick: it => it.id === 'm67' },
  gl: { label: '40 MM ROUND', pick: it => it.id === 'r40_m406' },
  dressing: { label: 'FIELD DRESSING', pick: it => /^dressing_|^cravat/.test(it.id) },
  tq: { label: 'TOURNIQUET', pick: it => /^tq_/.test(it.id) },
  morphine: { label: 'MORPHINE', pick: it => it.id === 'morphine' },
};
const inWeapon = it => { const p = I.parentOf(it); return !!(p && p.s === 'mag'); };
// move up to n items of a kind from one kit to another; magazines in a weapon stay in it (the spares go first)
export function give(from, to, kind, n = 1) {
  const K = KINDS[kind]; if (!K || !from || !to) return 0;
  const list = I.findAll(from, (it, d) => K.pick(it, d) && !inWeapon(it));   // never strip the magazine out of his rifle
  if (K.order) list.sort(K.order);
  let moved = 0;
  for (const it of list) {
    if (moved >= n) break;
    const back = I.parentOf(it); I.detach(it);
    if (I.autoStore(to, it)) moved++;
    else { if (back && back.s != null) I.slotIn(back.c, back.s, it); else if (back) I.placeIn(back.c, back.g, it, it.x, it.y, it.r); break; }   // no room: back where it was
  }
  return moved;
}
// a cheap (far) figure's rounds, taken out of the real kit: the emptiest magazine first, so the card shows what he has
function spend(root, cal, n) {
  if (!root || n <= 0) return 0;
  // magazines (the one in the rifle first, then the emptiest), then loose rounds in bandoliers / cans (stripper clips:
  // he reloads his empties from them)
  const BOX = { '556': ['M193', 'M196', 'M855A1'], '762n': ['M80', 'M62'] }[cal] || [];
  const mags = I.findAll(root, (it, d) => !!d.mag && d.mag.cal === cal && I.magCount(it) > 0).sort((a, b) => (inWeapon(b) - inWeapon(a)) || I.magCount(a) - I.magCount(b))
    .concat(I.findAll(root, (it, d) => !!d.box && BOX.includes(d.box.round) && I.magCount(it) > 0));
  let left = n;
  for (const m of mags) { while (left > 0 && I.magCount(m) > 0) { I.magPop(m); left--; } if (left <= 0) break; }
  return n - left;
}
export const spend556 = (root, n) => spend(root, '556', n);
export const spend762 = (root, n) => spend(root, '762n', n);
// a rearm: MEDINV's for anyone with a rifle (magazines topped up, a LAW, first aid); everyone else: pistol magazines
// and first-aid items
export function resupply(root, rec) {
  if (!root) return [];
  const s = summary(root);
  if (root.slots && root.slots.primary) return rifleResupply(root);
  const got = [];
  for (const it of I.findAll(root, (o, d) => !!d.mag && d.mag.cal === '45')) if (I.magCount(it) < 7) { it.ammo.length = 0; I.magPush(it, 'M1911', 7); got.push('.45 MAG'); }
  if (s.dressings < 1 && put(root, 'dressing_field')) got.push('DRSG');
  return got;
}
