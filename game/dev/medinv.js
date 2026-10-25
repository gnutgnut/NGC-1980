// Medical + inventory sandbox: pack a Marine, take simulated hits (round, range, part, armour), watch bleeding and
// shock develop in sim time (pause / x1 / x10 / x60), treat on the HEALTH screen, see the modifiers the soldier sim
// would get, and what he sees (vision effects, sight sway and tremor). ?debug exposes window.__MI for headless scenes.
import { ITEMS, ROUNDS, FRAGS, approxVelocity } from '../js/units/infantry/items.js';
import * as MED from '../js/units/infantry/medical.js';
import * as I from '../js/units/infantry/inventory.js';
import { createInvUI } from '../js/units/infantry/invui.js';
import { createMedUI, createMedHud, createVisionFX, FEEDTXT, CLASS_COL } from '../js/units/infantry/medui.js';
import { pickAid } from '../js/units/groundwar/fieldcare.js';   // ngc/marine-polish: the NEXT STEP on the HEALTH screen

const Q = new URLSearchParams(location.search);
const $ = s => document.querySelector(s);
const view = $('#view');
const W = { speed: 1, t: 0, hist: [], view: 'sandbox', loot: null, seed: +(Q.get('seed') || 0) };
const rng = W.seed ? MED.mulberry32(W.seed) : Math.random;
let M, inv, invUI, medUI;

function build(loadout = 'rifleman') {
  inv = I.loadout(loadout);
  M = MED.createMedical({ rng, skill: loadout === 'corpsman' ? 'corpsman' : $('#skill').value, name: loadout.toUpperCase() });
  $('#skill').value = M.skill;
  W.hist = []; W.t = 0;
  if (invUI) invUI.destroy(); if (medUI) medUI.destroy();
  const tabs = ['GEAR', 'HEALTH'];
  invUI = createInvUI({ inv, med: M, parent: view, tabs, onTab: t => setView(t === 'HEALTH' ? 'health' : 'gear'), onClose: () => W.view === 'gear' && setView('sandbox') });
  medUI = createMedUI({ med: M, inv, parent: view, tabs, title: 'PFC J. RIVERA, 2/4 MARINES', advise: (m, b) => pickAid(m, [inv], b), onTab: t => setView(t === 'GEAR' ? 'gear' : 'health'), onClose: () => W.view === 'health' && setView('sandbox') });
  if (W.view !== 'sandbox') setView(W.view);
}
function setView(v) {
  W.view = v;
  document.querySelectorAll('#top .tb').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  $('#sandbox').style.display = v === 'sandbox' ? 'flex' : 'none';
  if (v === 'gear') { if (medUI.isOpen()) medUI.S.open = false, medUI.el.classList.remove('on'); invUI.open(W.loot); } else if (invUI.isOpen()) { invUI.S.open = false; invUI.el.classList.remove('on'); }
  if (v === 'health') medUI.open(); else if (medUI.isOpen()) { medUI.S.open = false; medUI.el.classList.remove('on'); }
}

// ------------------------------------------------------------------------------------------------------ controls
for (const [id, r] of Object.entries(ROUNDS)) $('#round').insertAdjacentHTML('beforeend', `<option value="${id}">${r.name}</option>`);
$('#round').value = 'M193';
for (const r of MED.REGIONS) $('#part').insertAdjacentHTML('beforeend', `<option value="${r}">${MED.REGION[r].name}</option>`);
for (const [id, f] of Object.entries(FRAGS)) $('#frag').insertAdjacentHTML('beforeend', `<option value="${id}">${f.name}</option>`);
function zones() { const p = $('#part').value; $('#zone').innerHTML = '<option value="">RANDOM</option>' + (p ? Object.keys(MED.REGION[p].zones).map(z => `<option value="${z}">${z.toUpperCase()}</option>`).join('') : ''); }
$('#part').onchange = zones; zones();
const bindRange = (id, fmt) => { const e = $('#' + id), o = $('#' + id + 'v'); const f = () => o.textContent = fmt(+e.value); e.oninput = f; f(); };
bindRange('range', v => v + ' m'); bindRange('fdist', v => v + ' m'); bindRange('fall', v => v + ' m'); bindRange('ex', v => v < 5 ? 'REST' : v < 40 ? 'WALK' : v < 75 ? 'MARCH' : 'SPRINT');
const DIRS = { front: { x: 0, y: 0, z: -1 }, back: { x: 0, y: 0, z: 1 }, side: { x: 1, y: 0, z: 0 }, top: { x: 0, y: -1, z: 0 } };
function fire() {
  const round = $('#round').value, range = +$('#range').value;
  const h = { round, velocity: approxVelocity(round, range), part: $('#part').value || undefined, zone: $('#zone').value || undefined, dir: DIRS[$('#face').value], source: ROUNDS[round].name + ' @' + range + ' m' };
  const r = M.hit(h, $('#armour').checked ? I.armour(inv) : []);
  $('#hitres').innerHTML = `${MED.REGION[r.region].name} / ${r.zone.toUpperCase()} / ${r.face.toUpperCase()}<br>${r.penetrated ? `<b style="color:#f88">PENETRATED</b> ${r.hp} HP` : `<b style="color:#6f8">STOPPED</b> (${r.layers.filter(l => l.covered).map(l => 'CLASS ' + l.cls).join(', ')}) ${r.hp} HP BLUNT`}${r.bleed ? ' &middot; ' + r.bleed.toUpperCase() + ' BLEED' : ''}${r.fracture ? ' &middot; ' + r.fracture : ''}`;
  return r;
}
$('#fire').onclick = fire; $('#burst').onclick = () => { for (let i = 0; i < 3; i++) fire(); };
$('#blast').onclick = () => { const hs = MED.fragmentHits($('#frag').value, +$('#fdist').value, rng, { prone: $('#prone').checked }); for (const h of hs) M.hit(h, I.armour(inv)); $('#hitres').textContent = `${hs.length} FRAGMENT HIT(S) AT ${$('#fdist').value} M`; };
$('#dofall').onclick = () => { const h = +$('#fall').value; const v = Math.sqrt(2 * 9.81 * h); const r = M.fall(v); $('#hitres').textContent = `FELL ${h} M (${v.toFixed(1)} M/S)${r ? ' - ' + Math.round(r.hp) + ' HP TO THE LEGS' : ' - OK'}`; };
$('#skill').onchange = () => { M.skill = $('#skill').value; };
document.querySelectorAll('#top .tb').forEach(b => b.onclick = () => setView(b.dataset.v));
document.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => W.speed = +b.dataset.sp);
$('#loadout').onchange = () => build($('#loadout').value);
$('#loot').onchange = () => { const v = $('#loot').value; W.loot = !v ? null : v === 'rwbody' ? Object.assign(I.loadoutRW(rng), { name: 'RW TROOPER (MACHINE-CREWED)' }) : I.fillCrate(v, rng); if (W.loot && v === 'rwbody') I.hideContents(W.loot); setView('gear'); };
$('#restore').onclick = () => { M.restore(); W.hist = []; };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Tab') { e.preventDefault(); setView(W.view === 'gear' ? 'sandbox' : 'gear'); }
  if (e.code === 'KeyH' && W.view !== 'gear') setView(W.view === 'health' ? 'sandbox' : 'health');
});

// ------------------------------------------------------------------------------------------- vision preview
const sc = $('#scene'), vis = $('#vis');
const vfx = createVisionFX(vis, sc), hud = createMedHud(vis, { vitals: () => M.vitals(), summary: () => M.summary(), get ptx() { return M.ptx; }, get action() { return M.action; } });
hud.el.style.zIndex = 6; hud.el.style.bottom = '10px'; hud.el.style.left = '10px';
let swayT = 0;
function drawScene(dt, mods) {
  const r = vis.getBoundingClientRect(); if (sc.width !== Math.round(r.width)) { sc.width = Math.round(r.width); sc.height = Math.round(r.height); }
  const g = sc.getContext('2d'), w = sc.width, h = sc.height; swayT += dt;
  const sky = g.createLinearGradient(0, 0, 0, h * 0.55); sky.addColorStop(0, '#5f8fbf'); sky.addColorStop(1, '#c7d9e4'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2f5b78'; g.fillRect(0, h * 0.52, w, h);
  g.fillStyle = '#4d6b3a'; g.beginPath(); g.moveTo(0, h * 0.6); for (let x = 0; x <= w; x += 20) g.lineTo(x, h * 0.6 - 40 * Math.sin(x * 0.008) - 25 * Math.sin(x * 0.021 + 1) - 30); g.lineTo(w, h); g.lineTo(0, h); g.fill();
  g.fillStyle = '#6b7a46'; g.fillRect(0, h * 0.72, w, h);
  for (let i = 0; i < 9; i++) { const x = (i * 137) % w, y = h * 0.6 - 30 - (i % 3) * 8; g.fillStyle = '#2e4a26'; g.beginPath(); g.arc(x, y, 14 + (i % 4) * 3, 0, 7); g.fill(); }
  // a sandbagged position with a RUNAWAY strider silhouette
  const tx = w * 0.62, ty = h * 0.6; g.fillStyle = '#a99a72'; for (let i = 0; i < 6; i++) g.fillRect(tx - 60 + i * 20, ty + 6, 18, 9);
  g.fillStyle = '#dfe4e8'; g.fillRect(tx - 6, ty - 40, 12, 26); g.fillRect(tx - 10, ty - 50, 20, 11); g.fillStyle = '#5ef'; g.fillRect(tx - 6, ty - 46, 12, 2);
  g.fillStyle = '#c5cbd0'; g.fillRect(tx - 9, ty - 14, 5, 20); g.fillRect(tx + 4, ty - 14, 5, 20);
  // sight picture: rear aperture ring and front post, displaced by sway (slow figure-8 + breathing) and tremor (fast jitter)
  const amp = (mods.aimSway - 1) * 0.012 + 0.002 + mods.breathing * 0.006, br = 0.5 + 0.5 * mods.breathing;
  const sx = Math.sin(swayT * 0.9) * amp + mods.tremor * (Math.random() * 2 - 1) * 1.4, sy = Math.sin(swayT * 1.8) * amp * 0.6 + Math.sin(swayT * 2 * (1 + br)) * 0.003 * br + mods.tremor * (Math.random() * 2 - 1) * 1.4;
  const px = tx + sx * w * 1.2, py = ty - 30 + sy * w * 1.2;
  g.save(); g.fillStyle = '#05080a'; g.beginPath(); g.rect(0, 0, w, h); g.moveTo(px + Math.min(w, h) * 0.32, py); g.arc(px, py, Math.min(w, h) * 0.32, 0, 7, true); g.fill('evenodd');
  g.strokeStyle = '#111'; g.lineWidth = 14; g.beginPath(); g.arc(px, py, Math.min(w, h) * 0.32, 0, 7); g.stroke();
  g.fillStyle = '#0b0d0e'; g.fillRect(px - 4, py, 8, h); g.fillRect(px - 40, py + 36, 80, h);
  g.restore();
}

// ------------------------------------------------------------------------------------------------------- chart
function drawChart() {
  const cv = $('#chartc'), r = cv.getBoundingClientRect(); if (cv.width !== Math.round(r.width)) { cv.width = Math.round(r.width); cv.height = Math.round(r.height); }
  const g = cv.getContext('2d'), w = cv.width, h = cv.height, L = 44, R = 50, T = 18, B = 20, pw = w - L - R, ph = h - T - B;
  g.clearRect(0, 0, w, h); g.font = '11px Consolas,monospace';
  const yOf = pct => T + ph * (1 - (pct - 40) / 60);   // blood 40..100 %
  [[100, 85, 1], [85, 70, 2], [70, 60, 3], [60, 50, 4]].forEach(([a, b, c]) => { g.fillStyle = ['', 'rgba(68,255,102,.10)', 'rgba(255,221,34,.10)', 'rgba(255,153,34,.12)', 'rgba(255,51,51,.14)'][c]; g.fillRect(L, yOf(a), pw, yOf(b) - yOf(a)); g.fillStyle = CLASS_COL[c]; g.fillText(['', 'I', 'II', 'III', 'IV'][c], L + pw + 6, (yOf(a) + yOf(b)) / 2 + 4); });
  g.fillStyle = '#f33'; g.fillRect(L, yOf(50), pw, 1); g.fillText('DEATH', L + pw + 6, yOf(50) + 12);
  g.fillStyle = '#6aa'; for (const p of [100, 80, 60]) g.fillText(p + '%', 4, yOf(p) + 4);
  g.fillStyle = '#ff8'; g.fillText('BLOOD VOLUME', L, 12); g.fillStyle = '#f66'; g.fillText('BLEED ML/MIN (0-600)', L + 120, 12);
  const H = W.hist; if (H.length < 2) return; const t0 = H[0].t, t1 = Math.max(H[H.length - 1].t, t0 + 60); const xOf = t => L + (t - t0) / (t1 - t0) * pw;
  g.strokeStyle = '#f55a'; g.lineWidth = 1; g.beginPath(); H.forEach((p, i) => { const y = T + ph * (1 - Math.min(1, p.bleed / 600)); i ? g.lineTo(xOf(p.t), y) : g.moveTo(xOf(p.t), y); }); g.stroke();
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); H.forEach((p, i) => { const y = yOf(p.blood); i ? g.lineTo(xOf(p.t), y) : g.moveTo(xOf(p.t), y); }); g.stroke();
  g.fillStyle = '#6aa'; g.fillText(fmtT(t0), L, h - 5); g.fillText(fmtT(t1), L + pw - 40, h - 5);
}
const fmtT = s => { s = Math.floor(s); return `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

// ---------------------------------------------------------------------------------------------------- side panel
function sidePanel(mods) {
  const v = M.vitals();
  $('#vk').innerHTML = [['HEART RATE', v.hr + ' BPM'], ['BLOOD PRESSURE', v.sbp + '/' + v.dbp], ['RESPIRATION', v.rr + ' /MIN'], ['SPO2', v.spo2 + ' %'], ['BLOOD', `${v.bloodMl} ML (-${v.lossPct}%)`], ['SHOCK CLASS', `<span style="color:${CLASS_COL[v.cls]}">${['I', 'II', 'III', 'IV'][v.cls - 1]}</span>`], ['BLEEDING', v.bleedMlMin + ' ML/MIN'], ['PAIN', v.pain], ['MENTAL', v.mental]].map(([k, x]) => `<span>${k}</span><b>${x}</b>`).join('');
  const f = x => typeof x === 'number' ? x.toFixed(3) : x;
  $('#mods').innerHTML = [['speedMul', mods.speedMul], ['sprint / jump', `${mods.sprint} / ${mods.jump}`], ['crawlOnly', mods.crawlOnly], ['weaponUse', mods.weaponUse], ['aimSway', mods.aimSway], ['tremor (rad)', mods.tremor], ['reloadMul', mods.reloadMul], ['adsTimeMul', mods.adsTimeMul], ['staminaRegenMul', mods.staminaRegenMul], ['staminaMaxMul', mods.staminaMaxMul], ['vision.tunnel', mods.vision.tunnel], ['vision.grey', mods.vision.grey], ['vision.blur', mods.vision.blur], ['vision.blackout', mods.vision.blackout], ['breathing', mods.breathing], ['load (kg)', I.totalWeight(inv)], ['load state', I.encumbrance(I.totalWeight(inv)).state]].map(([k, x]) => `<span>${k}</span><b>${f(x)}</b>`).join('');
  $('#log').innerHTML = M.log.filter(e => FEEDTXT[e.type]).slice(-12).reverse().map(e => `<div><b>${fmtT(e.t)}</b> ${FEEDTXT[e.type](e)}</div>`).join('');
}

// --------------------------------------------------------------------------------------------------------- loop
let last = 0, sideAcc = 0, histAcc = 0;
function advance(sec) {   // sim time in <= 0.25 s steps
  const ctx = { exertion: +$('#ex').value / 100, moving: $('#moving').checked };
  while (sec > 1e-6) { const d = Math.min(0.25, sec); M.update(d, ctx); W.t += d; sec -= d; histAcc += d;
    if (histAcc >= Math.max(1, W.speed / 4)) { histAcc = 0; W.hist.push({ t: W.t, blood: 100 * (1 - M.lossFrac()), bleed: M.bleedRate() }); if (W.hist.length > 900) W.hist.splice(0, W.hist.length - 900); } }
  I.prune(inv);
}
function frame(t) {
  const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
  if (!Q.has('manual')) advance(dt * W.speed);
  const mods = M.mods();
  $('#clock').textContent = `T+${fmtT(W.t)} x${W.speed}`;
  if (W.view === 'sandbox') { drawScene(dt, mods); vfx.update(mods); hud.update(); sideAcc += dt; if (sideAcc > 0.2) { sideAcc = 0; sidePanel(mods); drawChart(); } }
  requestAnimationFrame(frame);
}
build('rifleman');
requestAnimationFrame(frame);

// ------------------------------------------------------------------------------------------------- debug bridge
if (Q.has('debug')) {
  window.__MI = {
    get M() { return M; }, get inv() { return inv; }, get invUI() { return invUI; }, get medUI() { return medUI; }, W, I, MED, ITEMS,
    advance(sec) { advance(sec); medUI.isOpen() && medUI.render(); return M.vitals(); },
    hit(o, armour = true) { return M.hit(o, armour ? I.armour(inv) : []); },
    treat(id, region, by = { self: true, skill: M.skill }) { const it = typeof id === 'string' && ITEMS[id] ? (I.find(inv, o => o.id === id) || I.newItem(id)) : id; return M.startTreatment({ item: it, region, by }); },
    view: setView, loadout: n => { $('#loadout').value = n; build(n); return true; },
    loot(kind) { $('#loot').value = kind; $('#loot').onchange(); return true; },
    speed(s) { W.speed = s; },
  };
}
