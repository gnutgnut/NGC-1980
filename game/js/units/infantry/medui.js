// NGC-1980 health screen: body silhouette with per-region HP and status, live vitals (ECG, BP, SpO2, blood volume
// with the ATLS shock classes), conditions, the effects the soldier sim gets, and treatment by drag and drop: drag a
// medical item from the list onto a body part (or anywhere on the body for drugs, water, food), watch the timed
// progress bar. Right-click a limb for TIGHTEN / REMOVE TOURNIQUET. HTML overlay in the game's style.
//
//   const ui = createMedUI({ med, inv, parent, by?: () => ({ self, skill }), onTab?, tabs?, title? });
//   ui.open() / close() / toggle() / isOpen() / tick(dt)   (self-ticks with rAF while open unless manualTick)
// Also exported for the in-game HUD (FOUNDATION):
//   createMedHud(parent, med) -> { el, update() }        a small blood bar + status icons strip
//   createVisionFX(parent, canvas?) -> { el, update(mods) }  tunnel vignette, greyscale / blur, blackout, nanite tint
import { ITEMS } from './items.js';
import { REGIONS, REGION, ZONES, MED } from './medical.js';
import * as I from './inventory.js';
import { iconSVG, injectCSS, CSS as INV_CSS } from './invui.js';

const CSS = `
.ngc-med .bd{flex:1;display:flex;gap:14px;padding:10px 14px;min-height:0}
.ngc-med .col{display:flex;flex-direction:column;gap:8px;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:#2a6a70 transparent}
.ngc-med .vit{width:310px;flex:none}.ngc-med .body{flex:1;align-items:center;justify-content:center;position:relative}.ngc-med .side{width:360px;flex:none}
.ngc-med .sec{background:rgba(0,30,44,.45);border:1px solid #234c55;padding:6px 8px}
.ngc-med h4{margin:0 0 4px;font-size:12px;letter-spacing:2px;color:#ff8;font-weight:normal;border-bottom:1px solid #4aa5;padding-bottom:2px;display:flex;justify-content:space-between}
.ngc-med h4 span{color:#8ab;letter-spacing:0}
.ngc-med .big{display:flex;align-items:baseline;gap:6px}.ngc-med .big b{font-size:30px;color:#fff;font-weight:normal;text-shadow:0 0 10px #0cf}
.ngc-med .kv{display:grid;grid-template-columns:auto 1fr;gap:1px 10px;font-size:13px}.ngc-med .kv span{color:#6aa}.ngc-med .kv b{color:#fff;font-weight:normal}
.ngc-med .blood{position:relative;height:16px;border:1px solid #4aa;background:rgba(40,0,0,.5);margin:4px 0 14px}
.ngc-med .blood i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#801820,#d8303a)}
.ngc-med .blood u{position:absolute;top:-3px;bottom:-3px;border-left:1px dashed #ff8b}.ngc-med .blood em{position:absolute;top:16px;font-size:10px;color:#ff8;font-style:normal;transform:translateX(-50%)}
.ngc-med .cls{display:inline-block;padding:1px 8px;border:1px solid;letter-spacing:2px;font-size:13px}
.ngc-med .mbar{height:6px;background:#0006;border:1px solid #2f6a74;margin:2px 0 5px}.ngc-med .mbar i{display:block;height:100%}
.ngc-med canvas.ecg{width:100%;height:56px;display:block;background:rgba(0,16,10,.7);border:1px solid #1d5040}
.ngc-med svg.fig{height:100%;max-height:640px;width:auto;overflow:visible}
.ngc-med .reg{stroke:#9ff;stroke-width:1.2;cursor:pointer;transition:stroke .1s}
.ngc-med .reg:hover,.ngc-med .reg.tgt{stroke:#fff;stroke-width:2.5;filter:drop-shadow(0 0 6px #8ff)}.ngc-med .reg.tgt.no{stroke:#f55;filter:drop-shadow(0 0 6px #f55)}
.ngc-med .reg.sel{stroke:#ff8;stroke-width:2.5}
.ngc-med text{font-family:Consolas,"Courier New",monospace;pointer-events:none}
.ngc-med .art{animation:spurt .7s infinite}@keyframes spurt{0%{opacity:1}50%{opacity:.35}}
.ngc-med .medlist{display:grid;grid-template-columns:1fr 1fr;gap:4px}
.ngc-med .mi{display:flex;gap:6px;align-items:center;padding:3px 4px;border:1px solid #2f6a74;background:rgba(104,36,46,.35);cursor:grab;position:relative;min-height:40px}
.ngc-med .mi:hover{border-color:#cfe;box-shadow:0 0 8px #8ff6}.ngc-med .mi .ico{width:34px;height:34px;flex:none;display:flex;align-items:center;justify-content:center}
.ngc-med .mi .t{font-size:11px;line-height:1.2;color:#e8f4f0}.ngc-med .mi .t small{display:block;color:#8ab;font-size:10px}
.ngc-med .mi .n{position:absolute;right:3px;top:1px;color:#ff8;font-size:11px}
.ngc-med .mi.food{background:rgba(44,74,92,.4)}.ngc-med .mi.rw{background:rgba(30,90,110,.4)}
.ngc-med .cond div{padding:1px 0;border-bottom:1px solid #123a40;font-size:12px}.ngc-med .cond .r{color:#f66}.ngc-med .cond .o{color:#fb4}.ngc-med .cond .g{color:#6f8}.ngc-med .cond .c{color:#5ef}
.ngc-med .mi.next{border-color:#ff4;box-shadow:0 0 10px #ff48;animation:ngcNext 1.2s ease-in-out infinite}@keyframes ngcNext{50%{box-shadow:0 0 2px #ff42}}
.ngc-med .nextup .nx{color:#ff8;font-size:12.5px;padding:2px 0}.ngc-med .nextup .nx small{color:#cb8}.ngc-med .nextup>small{color:#8ab;font-size:10px}.ngc-med .nextup .nx.g{color:#6f8}
.ngc-med .eff{display:grid;grid-template-columns:1fr auto;gap:0 8px;font-size:12px}.ngc-med .eff span{color:#6aa}.ngc-med .eff b{font-weight:normal;color:#fff}.ngc-med .eff b.bad{color:#fb4}.ngc-med .eff b.vbad{color:#f66}
.ngc-med .act{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);width:440px;max-width:90%;background:rgba(0,14,26,.95);border:1px solid #4aa;padding:6px 10px;display:none}
.ngc-med .act.on{display:block}.ngc-med .act .p{height:8px;border:1px solid #4aa;margin-top:4px}.ngc-med .act .p i{display:block;height:100%;background:#ff8;box-shadow:0 0 8px #ff8}
.ngc-med .act .l{color:#fff;letter-spacing:1px}.ngc-med .act .s{float:right;color:#ff8}
.ngc-med .ghost{position:fixed;z-index:60;pointer-events:none;opacity:.9}
.ngc-med .tip{position:fixed;z-index:61;pointer-events:none;background:rgba(0,10,20,.95);border:1px solid #4aa;padding:3px 7px;font-size:12px;letter-spacing:1px;white-space:nowrap}
.ngc-med .tip.ok{color:#6f8}.ngc-med .tip.no{color:#f66}
.ngc-med .menu{position:fixed;z-index:62;background:rgba(0,14,26,.97);border:1px solid #4aa;min-width:200px}
.ngc-med .menu div{padding:4px 12px;cursor:pointer;letter-spacing:1px}.ngc-med .menu div:hover{background:#0a5a6a;color:#fff}.ngc-med .menu div.off{color:#456;cursor:default;background:none}
.ngc-med .feed div{font-size:11px;color:#9cc;padding:1px 0}.ngc-med .feed div b{color:#ff8;font-weight:normal}
.ngc-med .who{display:flex;gap:4px;margin-left:12px}.ngc-med .who span{padding:1px 8px;border:1px solid #2f6a74;cursor:pointer;font-size:12px;color:#7aa}.ngc-med .who span.on{color:#fff;border-color:#8ff;background:rgba(0,90,120,.6)}
.ngc-med .dead{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:42px;letter-spacing:12px;color:#f44;text-shadow:0 0 18px #a00;pointer-events:none;background:rgba(20,0,0,.35)}
`;
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const mmss = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
export const hpColor = f => f <= 0 ? '#151515' : `hsl(${Math.round(120 * Math.pow(f, 1.2))},70%,${30 + 12 * f}%)`;
export const CLASS_COL = ['', '#4f6', '#fd2', '#f92', '#f33'];

// ------------------------------------------------------------------------------------------------- the figure
// Front view, facing the viewer: the soldier's RIGHT side is on the viewer's left (labels say L / R).
const FIG = {
  head: 'M100 8C117 8 125 22 125 40C125 57 115 68 104 70L111 70L113 84L87 84L89 70C85 69 75 57 75 40C75 22 83 8 100 8Z',
  thorax: 'M88 84L112 84L141 90C148 94 150 102 148 112L143 172C128 180 72 180 57 172L52 112C50 102 52 94 59 90Z',
  stomach: 'M57 175C72 183 128 183 143 175L145 212C147 230 141 243 137 254C121 264 79 264 63 254C59 243 53 230 55 212Z',
  armR: 'M56 92C44 95 38 104 37 118L30 190L22 250C20 262 24 270 32 269C39 267 41 259 41 250L51 193L55 140Z',
  armL: 'M144 92C156 95 162 104 163 118L170 190L178 250C180 262 176 270 168 269C161 267 159 259 159 250L149 193L145 140Z',
  legR: 'M64 257C79 266 95 264 99 260L97 342L93 430L96 454L71 457L73 432L68 342C63 302 61 272 64 257Z',
  legL: 'M136 257C121 266 105 264 101 260L103 342L107 430L104 454L129 457L127 432L132 342C137 302 139 272 136 257Z',
};
const ZPOS = { cranium: [100, 28], face: [100, 52], neck: [100, 78], chest: [100, 128], abdomen: [100, 200], pelvis: [100, 240], upperArm: [45, 130], forearm: [36, 205], hand: [28, 260], thigh: [82, 300], shin: [83, 390], foot: [84, 446] };
const zpos = (zone, region) => { const p = ZPOS[zone] || [100, 100]; return region.endsWith('L') ? [200 - p[0], p[1]] : p; };
// label anchor [x, y, side] and the point on the figure its leader line goes to
const LABEL = { head: [215, 14, 'start', 122, 34], thorax: [215, 92, 'start', 128, 112], armL: [215, 178, 'start', 168, 196], legL: [215, 330, 'start', 120, 340], armR: [-15, 122, 'end', 40, 140], stomach: [-15, 206, 'end', 70, 214], legR: [-15, 330, 'end', 80, 340] };
const dropPath = (x, y, s, col, cls = '') => `<path class="${cls}" d="M${x} ${y - 7 * s}C${x + 4.5 * s} ${y - 1.5 * s} ${x + 4.5 * s} ${y + 4 * s} ${x} ${y + 4 * s}C${x - 4.5 * s} ${y + 4 * s} ${x - 4.5 * s} ${y - 1.5 * s} ${x} ${y - 7 * s}Z" fill="${col}" stroke="#000" stroke-width=".6"/>`;
const bone = (x, y, col = '#fff') => `<g transform="translate(${x} ${y}) rotate(-35)"><rect x="-6" y="-1.6" width="12" height="3.2" fill="${col}"/><circle cx="-6" cy="-1.8" r="2" fill="${col}"/><circle cx="-6" cy="1.8" r="2" fill="${col}"/><circle cx="6" cy="-1.8" r="2" fill="${col}"/><circle cx="6" cy="1.8" r="2" fill="${col}"/></g>`;
const BLEED_COL = { light: '#f6a040', heavy: '#e02828', arterial: '#ff1030' };

function figureSVG(M, opt = {}) {
  const sum = M.summary(); let s = '';
  s += `<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#111"/><rect width="2" height="6" fill="#522"/></pattern></defs>`;
  for (const r of REGIONS) {
    const R = sum[r], f = R.hp / R.max;
    s += `<path class="reg${opt.sel === r ? ' sel' : ''}" data-region="${r}" d="${FIG[r]}" fill="${R.lost ? 'url(#hatch)' : hpColor(f)}" fill-opacity="${R.blacked ? 1 : 0.82}"${R.blacked ? ' stroke="#f33"' : ''}/>`;
  }
  // ngc/marine-polish: the part the next step goes on (opt.hint), outlined
  if (opt.hint && FIG[opt.hint]) s += `<path class="hint" d="${FIG[opt.hint]}" fill="none" stroke="#ff4" stroke-width="2.2" stroke-dasharray="5 3" pointer-events="none"/>`;
  // anatomy hints
  s += `<path d="M100 92V170M80 128Q100 136 120 128M76 214H124" stroke="#0005" fill="none"/>`;
  // dressings, tourniquets, splints, wounds
  for (const r of REGIONS) {
    const R = sum[r], reg = M.regions[r];
    if (R.dressed) { const z = M.bleeds.find(b => b.region === r && b.dressed)?.zone || Object.keys(REGION[r].zones)[0]; const [x, y] = zpos(z, r); s += `<rect x="${x - 7}" y="${y - 5}" width="14" height="10" rx="1.5" fill="#ece8d6" stroke="#998" stroke-width=".6" opacity=".95"/>`; }
    if (R.splint && REGION[r].limb) { const zz = REGION[r].limb === 'arm' ? 'forearm' : 'shin'; const [x, y] = zpos(zz, r); s += `<rect x="${x - 9}" y="${y - 26}" width="3" height="52" fill="#9fc" opacity=".8"/><rect x="${x + 6}" y="${y - 26}" width="3" height="52" fill="#9fc" opacity=".8"/>`; }
    R.tq.forEach((q, i) => { const arm = REGION[r].limb === 'arm'; const [x, y] = zpos(arm ? 'upperArm' : 'thigh', r); const yy = y - (arm ? 18 : 24) - i * 8; s += `<rect x="${x - (arm ? 12 : 17)}" y="${yy}" width="${arm ? 24 : 34}" height="5" fill="${q.item === 'tq_cat' ? '#111' : '#3d4630'}" stroke="${q.ok ? '#ff8' : '#f55'}" stroke-width=".8"/>`; });
  }
  // bleeding wounds (one marker per bleed, at its zone, offset a little when several share a zone)
  const seen = {};
  for (const b of M.bleeds) { if (b.stopped && !b.dressed) continue; const k = b.region + b.zone; const n = seen[k] = (seen[k] || 0) + 1; let [x, y] = zpos(b.zone, b.region); x += (n - 1) * 9 - 4; y += 9;
    if (b.stopped) continue; s += dropPath(x, y, b.type === 'arterial' ? 1.25 : b.type === 'heavy' ? 1.05 : 0.8, BLEED_COL[b.type], b.type === 'arterial' ? 'art' : ''); }
  for (const r of REGIONS) if (sum[r].fracture) { const zz = { head: 'face', thorax: 'chest', stomach: 'pelvis' }[r] || (REGION[r].limb === 'arm' ? 'forearm' : 'shin'); const [x, y] = zpos(zz, r); s += bone(x + (r === 'thorax' ? 22 : 0), y - 12, sum[r].splint ? '#9fc' : '#fff'); }
  if (M.ptx) s += `<circle cx="122" cy="118" r="7" fill="none" stroke="${M.ptx.tension > 0.3 ? '#f33' : '#5ef'}" stroke-width="1.6" class="${M.ptx.tension > 0.5 ? 'art' : ''}"/><text x="122" y="121.5" font-size="9" text-anchor="middle" fill="${M.ptx.tension > 0.3 ? '#f33' : '#5ef'}">P</text>`;
  if (M.opioid > 1 || M.opioidDepot.length) s += `<text x="100" y="27" font-size="14" text-anchor="middle" fill="#200" font-weight="bold">M</text>`;   // FM 21-11: an M on the forehead
  if (M.iv) s += `<path d="M${zpos('forearm', M.iv.region)[0]} ${zpos('forearm', M.iv.region)[1]}l${M.iv.region.endsWith('L') ? 22 : -22} -60" stroke="#cfe7f2" stroke-dasharray="3 2" fill="none"/>`;
  // labels: name, hp, bar
  for (const r of REGIONS) {
    const R = sum[r], [lx, ly, an, px, py] = LABEL[r], f = R.hp / R.max;
    const bw = 70, bx = an === 'end' ? lx - bw : lx;
    s += `<path d="M${an === 'end' ? lx + 4 : lx - 4} ${ly + 8}L${an === 'end' ? lx + 14 : lx - 14} ${ly + 8}L${px} ${py}" stroke="#4aa" stroke-width=".7" fill="none" opacity=".8"/><circle cx="${px}" cy="${py}" r="1.8" fill="#9ff"/>`;
    s += `<text x="${lx}" y="${ly}" font-size="10.5" fill="#9ff" text-anchor="${an}" letter-spacing="1">${REGION[r].name}</text>`;
    s += `<text x="${lx}" y="${ly + 13}" font-size="12" fill="${R.blacked ? '#f44' : '#fff'}" text-anchor="${an}">${R.lost ? 'LOST' : R.blacked ? 'BLACKED' : Math.ceil(R.hp) + ' / ' + R.max}</text>`;
    s += `<rect x="${bx}" y="${ly + 17}" width="${bw}" height="4" fill="#0008" stroke="#2f6a74" stroke-width=".5"/><rect x="${bx}" y="${ly + 17}" width="${bw * f}" height="4" fill="${hpColor(f)}"/>`;
    let ix = an === 'end' ? lx - 6 : lx + 6; const iy = ly + 32; const step = an === 'end' ? -14 : 14;
    if (R.bleed) { s += dropPath(ix, iy, 0.75, BLEED_COL[R.bleed], R.bleed === 'arterial' ? 'art' : ''); s += `<text x="${ix + (an === 'end' ? -8 : 8)}" y="${iy + 3}" font-size="9.5" fill="${R.bleedMlMin ? BLEED_COL[R.bleed] : '#8ab'}" text-anchor="${an}">${R.bleedMlMin ? R.bleedMlMin + ' ML/MIN' : 'CONTROLLED'}</text>`; }
    else if (R.fracture) s += bone(ix, iy - 2, R.splint ? '#9fc' : '#fff');
  }
  return s;
}

// --------------------------------------------------------------------------------------------------------- the UI
export function createMedUI(opt) {
  injectCSS('ngc-inv-css', INV_CSS); injectCSS('ngc-med-css', CSS);
  const root = document.createElement('div'); root.className = 'ngc-ov ngc-med'; (opt.parent || document.body).appendChild(root);
  const S = { open: false, sel: null, drag: null, menu: null, who: 'self', ecg: [], ecgT: 0, lastRender: 0, feedN: 0 };
  const by = () => opt.by ? opt.by() : S.who === 'self' ? { self: true, skill: opt.med.skill } : { self: false, skill: S.who };
  const M = () => opt.med;
  root.innerHTML = `<div class="hd"><span class="tabs"></span><span class="who"></span><span style="flex:1"></span><span class="ttl" style="color:#bde"></span></div>
    <div class="bd"><div class="col vit"></div><div class="col body"><svg class="fig" viewBox="-110 -4 420 470"></svg><div class="act"><span class="l"></span><span class="s"></span><div class="p"><i></i></div></div></div><div class="col side"></div></div>
    <div class="help"><b>DRAG</b> AN ITEM ONTO A BODY PART TO TREAT (DRUGS, WATER, FOOD: ANYWHERE ON THE BODY) &middot; <b>CLICK</b> A PART FOR ITS WOUNDS &middot; <b>RIGHT-CLICK</b> A LIMB: TIGHTEN / REMOVE TOURNIQUET &middot; <b>ESC</b> CANCEL TREATMENT / CLOSE</div>`;
  const $ = s => root.querySelector(s);
  const vit = $('.vit'), side = $('.side'), fig = $('svg.fig'), act = $('.act');

  function header() {
    $('.tabs').innerHTML = (opt.tabs || ['HEALTH']).map(t => `<span class="tab${t === 'HEALTH' ? ' on' : ''}" data-tab="${t}">${t}</span>`).join('');
    $('.who').innerHTML = opt.by ? '' : `TREAT AS: ${['self', 'rifleman', 'corpsman'].map(w => `<span data-who="${w}" class="${S.who === w ? 'on' : ''}">${w === 'self' ? 'SELF' : w === 'rifleman' ? 'BUDDY' : 'CORPSMAN'}</span>`).join('')}`;
    $('.ttl').textContent = (opt.title || M().name || 'MARINE') + (M().skill === 'corpsman' ? ' (CORPSMAN)' : '');
  }
  function vitals() {
    const m = M(), v = m.vitals(), lf = m.lossFrac();
    const mbar = (f, col) => `<div class="mbar"><i style="width:${Math.max(0, Math.min(100, f * 100)).toFixed(0)}%;background:${col}"></i></div>`;
    const water = 1 - Math.min(1, Math.max(0, m.waterDef) / 4500), food = 1 - Math.min(1, Math.max(0, m.kcalDef) / 6000);
    vit.innerHTML = `<div class="sec"><h4>VITALS<span>${esc(v.mental)}</span></h4>
      <div class="big"><b style="color:${v.hr > 120 ? '#fb4' : '#fff'}">${v.hr}</b> BPM<span style="flex:1"></span><b style="font-size:22px">${v.sbp}/${v.dbp}</b> MMHG</div>
      <div class="ecgslot"></div>
      <div class="kv" style="margin-top:6px"><span>RESP</span><b>${v.rr} /MIN</b><span>SPO2</span><b style="color:${v.spo2 < 90 ? '#f66' : '#fff'}">${v.spo2} %</b><span>MAP</span><b>${v.map} MMHG</b><span>CONSCIOUS</span><b>${m.unconscious ? '<span style="color:#f66">NO</span>' : (m.conscious * 100).toFixed(0) + ' %'}</b><span>HAEMATOCRIT</span><b>${(v.hct * 100).toFixed(0)} %</b></div></div>
      <div class="sec"><h4>BLOOD<span>${v.bloodMl} / ${m.V0} ML</span></h4>
      <div class="blood"><i style="width:${((1 - lf) * 100).toFixed(1)}%"></i>${[0.15, 0.3, 0.4, 0.5].map((c, i) => `<u style="left:${(1 - c) * 100}%"></u><em style="left:${(1 - c) * 100}%">${['II', 'III', 'IV', 'DEATH'][i]}</em>`).join('')}</div>
      <div class="kv"><span>SHOCK</span><b><span class="cls" style="color:${CLASS_COL[v.cls]};border-color:${CLASS_COL[v.cls]}">CLASS ${['I', 'II', 'III', 'IV'][v.cls - 1]}</span> &nbsp;-${v.lossPct}%</b>
      <span>BLEEDING</span><b style="color:${v.bleedMlMin > 0 ? '#f55' : '#6f8'}">${v.bleedMlMin} ML/MIN${v.bleedMlMin > 0 && lf < 0.5 ? (() => { const nx = [0.15, 0.3, 0.4, 0.5].find(c => c > lf); return ` &middot; ${nx === 0.5 ? 'DEATH' : ['', '', 'II', 'III', 'IV'][[0.15, 0.3, 0.4].indexOf(nx) + 2]} IN ${eta(m, nx)}`; })() : ''}</b>
      ${m.iv ? `<span>IV</span><b style="color:#cfe7f2">${Math.round(m.iv.left)} ML LEFT</b>` : ''}</div></div>
      <div class="sec"><h4>PAIN &amp; DRUGS</h4><div class="kv"><span>PAIN</span><b>${v.pain} ${v.pain > 70 ? '(SEVERE)' : v.pain > 35 ? '(MODERATE)' : v.pain > 5 ? '(MILD)' : ''}</b></div>${mbar(v.pain / 100, '#fb4')}
      <div class="kv"><span>MORPHINE</span><b>${(m.opioid + m.opioidDepot.reduce((s, d) => s + d.mg, 0)).toFixed(1)} MG${m.opioidSed() > 0 ? ` <span style="color:#f88">SEDATED ${(m.opioidSed() * 100).toFixed(0)}%</span>` : ''}</b><span>ADRENALINE</span><b>${(m.adrenaline * 100).toFixed(0)} %</b><span>ANALGESIA</span><b>${(m.analgesia() * 100).toFixed(0)} %</b></div></div>
      <div class="sec"><h4>WATER &amp; FOOD</h4><div class="kv"><span>HYDRATION</span><b>${m.waterDef > 0 ? '-' + (m.waterDef / 1000).toFixed(2) + ' L' : 'OK'}</b></div>${mbar(water, '#4cf')}<div class="kv"><span>ENERGY</span><b>${m.kcalDef > 0 ? '-' + Math.round(m.kcalDef) + ' KCAL' : 'OK'}</b></div>${mbar(food, '#ad6')}</div>`;
    if (!S.ecgCanvas) { S.ecgCanvas = document.createElement('canvas'); S.ecgCanvas.className = 'ecg'; S.ecgCanvas.width = 290; S.ecgCanvas.height = 56; }
    vit.querySelector('.ecgslot').appendChild(S.ecgCanvas);   // the same canvas survives re-renders, so the trace keeps scrolling
  }
  function eta(m, target) {   // seconds until a loss fraction at the current bleed (linear, a hint only)
    const r = m.bleedRate(); if (r <= 0.5) return '-'; const ml = (target - m.lossFrac()) * m.V0; return ml <= 0 ? 'NOW' : mmss(ml / r * 60);
  }
  function medItems() {
    const out = new Map(); if (!opt.inv) return [];
    for (const o of I.walk(opt.inv)) { const d = ITEMS[o.id]; if (!d.med || o._gone) continue; const k = d.id; if (!out.has(k)) out.set(k, { d, items: [] }); out.get(k).items.push(o); }
    return [...out.values()].sort((a, b) => (a.d.cat === 'med' ? 0 : 1) - (b.d.cat === 'med' ? 0 : 1));
  }
  // ngc/marine-polish: opt.advise(med, by) -> { item, region, label, time } | null - the NEXT STEP by the 1980 first-aid
  // doctrine (the host passes fieldcare.js pickAid: FM 21-11). Shown over CONDITIONS; its item glows in the list and its
  // body part is outlined on the figure, so the screen says what to drag where.
  let nextUp = null;
  function sideHTML() {
    const m = M(), b = by();
    nextUp = opt.advise && !m.dead && !m.action ? opt.advise(m, b) : null;
    const nxId = nextUp ? (typeof nextUp.item === 'object' ? nextUp.item.id : nextUp.item) : null;
    const list = medItems().map(({ d, items }) => {
      const t = d.med.time ? (b.self ? d.med.time.self : d.med.time.buddy) : 0; const ts = typeof t === 'object' ? `${t.arm}/${t.leg} S` : t + ' S';
      const n = items.reduce((s, o) => s + (o.n || 1) * (o.uses || 1), 0); const water = d.water ? ` ${(items.reduce((s, o) => s + o.water, 0) / 1000).toFixed(1)} L` : '';
      const lock = d.med.who === 'corpsman' && b.skill !== 'corpsman';
      return `<div class="mi ${d.cat === 'food' || d.cat === 'drink' ? 'food' : ''} ${d.era === 'rw' ? 'rw' : ''}${d.id === nxId ? ' next' : ''}" data-id="${d.id}" style="${lock ? 'opacity:.45' : ''}"><div class="ico">${iconSVG(d.id, 32, 32)}</div><div class="t">${esc(d.short || d.name)}<small>${ts}${lock ? ' &middot; CORPSMAN' : ''}${water}</small></div><span class="n">${d.water ? '' : 'x' + n}</span></div>`;
    }).join('') || '<div style="color:#678">NO MEDICAL ITEMS</div>';
    let cond = [];
    const sum = m.summary();
    for (const bl of m.bleeds) if (!bl.stopped) cond.push(`<div class="${bl.type === 'light' ? 'o' : 'r'}">${bl.type.toUpperCase()} BLEED &middot; ${esc(bl.name)} (${REGION[bl.region].name})${bl.ctl === 'internal' ? ' &middot; INTERNAL' : bl.ctl === 'junctional' ? ' &middot; JUNCTIONAL' : ''}${bl.dressed ? ' &middot; DRESSED' : ''}${bl.packed ? ' &middot; PACKED' : ''}</div>`);
    for (const r of REGIONS) { const R = sum[r]; if (R.fracture) cond.push(`<div class="${R.splint ? 'g' : 'o'}">FRACTURE &middot; ${esc(R.fracture)} (${REGION[r].name})${R.splint ? R.sling ? ' &middot; SLING' : ' &middot; SPLINTED' : ''}</div>`);
      for (const q of R.tq) cond.push(`<div class="${q.t > MED.TQ_SAFE_S ? 'r' : q.ok ? 'c' : 'r'}">TOURNIQUET &middot; ${REGION[r].name} &middot; ${mmss(q.t)}${q.ok ? '' : ' &middot; NOT TIGHT'}${q.t > MED.TQ_SAFE_S ? ' &middot; ISCHAEMIA' : ` &middot; ${mmss(MED.TQ_SAFE_S - q.t)} TO 2 H`}</div>`);
      if (R.lost) cond.push(`<div class="r">LIMB LOST &middot; ${REGION[r].name}</div>`); else if (R.blacked) cond.push(`<div class="r">BLACKED OUT &middot; ${REGION[r].name}</div>`); }
    if (m.ptx) cond.push(`<div class="${m.ptx.tension > 0.3 ? 'r' : 'o'}">${m.ptx.tension > 0.3 ? 'TENSION PNEUMOTHORAX' : m.ptx.open && !m.ptx.sealed ? 'OPEN PNEUMOTHORAX (SUCKING)' : 'PNEUMOTHORAX'}${m.ptx.sealed ? m.ptx.vented ? ' &middot; VENTED SEAL' : ' &middot; SEALED' : ''}${m.ptx.decompressed ? ' &middot; DECOMPRESSED' : ''}</div>`);
    if (m.ko > 0) cond.push(`<div class="o">KNOCKED OUT &middot; ${Math.ceil(m.ko)} S</div>`); else if (m.concussion > 0.2) cond.push(`<div class="o">CONCUSSION</div>`);
    if (m.nanite) cond.push(`<div class="c">NANITES ACTIVE &middot; ${Math.ceil(m.nanite.left)} S</div>`);
    if (m.dead) cond = [`<div class="r">${esc(m.cause)}</div>`];
    if (!cond.length) cond.push('<div class="g">NO INJURIES</div>');
    const mo = m.mods(), x = v => 'x' + v.toFixed(2), cl = (v, a, b2) => v >= b2 ? 'vbad' : v >= a ? 'bad' : '';
    const eff = [['SPEED', x(mo.speedMul) + (mo.crawlOnly ? ' CRAWL' : ''), cl(1 - mo.speedMul, 0.1, 0.4)], ['SPRINT / JUMP', `${mo.sprint ? 'YES' : 'NO'} / ${mo.jump ? 'YES' : 'NO'}`, mo.sprint ? '' : 'bad'], ['WEAPON', mo.weaponUse.toUpperCase() + ' HANDS', mo.weaponUse === 'both' ? '' : 'vbad'],
      ['AIM SWAY', x(mo.aimSway), cl(mo.aimSway, 1.3, 2)], ['TREMOR', (mo.tremor * 1000).toFixed(1) + ' MRAD', cl(mo.tremor, 0.002, 0.006)], ['RELOAD TIME', x(mo.reloadMul), cl(mo.reloadMul, 1.2, 1.6)], ['STAMINA REGEN', x(mo.staminaRegenMul), cl(1 - mo.staminaRegenMul, 0.2, 0.5)], ['STAMINA MAX', x(mo.staminaMaxMul), cl(1 - mo.staminaMaxMul, 0.15, 0.4)],
      ['VISION', `TUNNEL ${(mo.vision.tunnel * 100).toFixed(0)}% GREY ${(mo.vision.grey * 100).toFixed(0)}% BLUR ${(mo.vision.blur * 100).toFixed(0)}%`, cl(mo.vision.tunnel + mo.vision.grey, 0.2, 0.8)]];
    const feed = m.log.filter(e => FEEDTXT[e.type]).slice(-6).reverse().map(e => `<div><b>${mmss(e.t)}</b> ${esc(FEEDTXT[e.type](e))}</div>`).join('');
    side.innerHTML = `<div class="sec"><h4>MEDICAL<span>${by().self ? 'SELF AID' : by().skill === 'corpsman' ? 'CORPSMAN' : 'BUDDY AID'}</span></h4><div class="medlist">${list}</div></div>
      ${opt.advise ? `<div class="sec nextup"><h4>NEXT STEP<span>FM 21-11</span></h4>${m.action ? `<div class="nx">WORKING: ${esc(m.action.label)} &middot; ${Math.round(m.action.t)} / ${Math.round(m.action.T)} S</div>`
        : nextUp ? `<div class="nx">${esc(nextUp.label)}${nextUp.region ? ' &rarr; ' + REGION[nextUp.region].name : ''} <small>(${nextUp.time} S)</small></div><small>DRAG THE GLOWING ITEM ONTO THE OUTLINED PART${opt.adviseKey ? ' &middot; OR ' + opt.adviseKey : ''}</small>`
        : `<div class="nx g">${m.dead ? '-' : 'NOTHING MORE FROM THIS KIT'}</div>`}</div>` : ''}
      <div class="sec cond"><h4>CONDITIONS</h4>${cond.join('')}</div>
      <div class="sec"><h4>EFFECTS</h4><div class="eff">${eff.map(([k, v, c]) => `<span>${k}</span><b class="${c}">${v}</b>`).join('')}</div></div>
      <div class="sec feed"><h4>LOG</h4>${feed || '<div>-</div>'}</div>`;
  }
  function figure() {
    fig.innerHTML = figureSVG(M(), { sel: S.sel, hint: nextUp && nextUp.region });
    let d = root.querySelector('.dead'); if (M().dead && !d) { d = document.createElement('div'); d.className = 'dead'; d.textContent = 'KIA'; $('.body').appendChild(d); } else if (!M().dead && d) d.remove();
    if (S.sel) {   // wounds of the selected part as an SVG callout
      const r = S.sel, bl = M().bleeds.filter(b => b.region === r);
      const lines = bl.length ? bl.map(b => `${b.stopped ? 'STOPPED' : b.type.toUpperCase()} ${b.name}${b.stopped ? '' : ' ' + Math.round(b.rate * b.ctrl) + ' ML/MIN NOMINAL'}`) : ['NO WOUNDS'];
      fig.insertAdjacentHTML('beforeend', `<g transform="translate(-108 392)"><rect width="190" height="${14 + lines.length * 12}" fill="#000c" stroke="#ff8" stroke-width=".6"/><text x="5" y="11" font-size="9.5" fill="#ff8">${REGION[r].name}: ${M().regions[r].wounds} WOUND(S)</text>${lines.map((l, i) => `<text x="5" y="${23 + i * 12}" font-size="8.5" fill="#cde">${esc(l)}</text>`).join('')}</g>`);
    }
  }
  function action() {
    const a = M().action; act.classList.toggle('on', !!a);
    if (a) { act.querySelector('.l').textContent = a.label + (a.region ? ' - ' + REGION[a.region].name : ''); act.querySelector('.s').textContent = `${a.t.toFixed(1)} / ${a.T} S`; act.querySelector('.p i').style.width = (a.t / a.T * 100).toFixed(1) + '%'; }
  }
  function render() { header(); vitals(); sideHTML(); figure(); action(); }

  // ECG trace: a P-QRS-T template at the current heart rate; flat when dead.
  function ecg(dt) {
    const cv = S.ecgCanvas; if (!cv) return; const g = cv.getContext('2d'); const m = M(); const hr = m.dead ? 0 : m.vitals().hr;
    S.ecgT += dt; const W = cv.width, H = cv.height;
    const beat = hr > 0 ? 60 / hr : 1e9; S.ecg.push(waveAt(S.ecgT % beat / beat, hr > 0)); while (S.ecg.length > W / 2) S.ecg.shift();
    g.clearRect(0, 0, W, H); g.strokeStyle = '#0f3a28'; g.lineWidth = 1; for (let x = 0; x < W; x += 15) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    g.strokeStyle = m.dead ? '#f44' : '#4f8'; g.lineWidth = 1.6; g.shadowColor = g.strokeStyle; g.shadowBlur = 6; g.beginPath();
    S.ecg.forEach((v, i) => { const x = i * 2, y = H * 0.62 - v * H * 0.5; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.shadowBlur = 0;
  }
  const waveAt = (p, alive) => !alive ? 0 : p < 0.1 ? 0.12 * Math.sin(p / 0.1 * Math.PI) : p < 0.16 ? 0 : p < 0.18 ? -0.15 : p < 0.21 ? 1 : p < 0.24 ? -0.3 : p < 0.36 ? 0 : p < 0.5 ? 0.22 * Math.sin((p - 0.36) / 0.14 * Math.PI) : 0;

  // --------------------------------------------------------------------------------------------------------- input
  const regionAt = (x, y) => { const el = document.elementsFromPoint(x, y).find(e => e.dataset?.region); return el ? el.dataset.region : null; };
  const onBody = (x, y) => { const r = fig.getBoundingClientRect(); return x > r.left && x < r.right && y > r.top && y < r.bottom; };
  function pickItem(id) { return medItems().find(g => g.d.id === id)?.items[0]; }
  function tryTreat(item, region, quiet) {
    const m = M(), b = { ...by(), has: t => opt.inv && I.hasItem(opt.inv, t) };
    let reg = region;
    const def = typeof item === 'string' ? null : ITEMS[item.id];
    if (def && !['dressing', 'tourniquet', 'cravat', 'hemostatic', 'splint', 'woundcare', 'iv'].includes(def.med.kind)) reg = null;   // systemic
    const o = m.treatOptions(item, reg, b);
    if (quiet) return o;
    if (!o.ok) return o;
    return m.startTreatment({ item, region: reg, by: b });
  }
  root.addEventListener('pointerdown', e => {
    closeMenu();
    const tab = e.target.closest('.tab'); if (tab) { opt.onTab && opt.onTab(tab.dataset.tab); return; }
    const w = e.target.closest('[data-who]'); if (w) { S.who = w.dataset.who; render(); return; }
    const mi = e.target.closest('.mi');
    if (mi && e.button === 0) {
      const item = pickItem(mi.dataset.id); if (!item) return;
      const layer = document.createElement('div'); root.appendChild(layer);
      S.drag = { item, layer };
      const mv = ev => {
        const reg = regionAt(ev.clientX, ev.clientY); fig.querySelectorAll('.reg').forEach(p => p.classList.remove('tgt', 'no'));
        let tip = '';
        if (reg || onBody(ev.clientX, ev.clientY)) { const o = tryTreat(item, reg, true); tip = o.ok ? `${o.label} &middot; ${o.time} S` : o.reason; const p = reg && fig.querySelector(`[data-region="${reg}"]`); if (p) p.classList.add('tgt'), o.ok || p.classList.add('no'); layer.dataset.ok = o.ok ? 1 : ''; }
        layer.innerHTML = `<div class="ghost" style="left:${ev.clientX - 20}px;top:${ev.clientY - 20}px">${iconSVG(item.id, 40, 40)}</div>${tip ? `<div class="tip ${layer.dataset.ok ? 'ok' : 'no'}" style="left:${ev.clientX + 18}px;top:${ev.clientY + 16}px">${tip}</div>` : ''}`;
      };
      const up = ev => {
        removeEventListener('pointermove', mv); removeEventListener('pointerup', up); layer.remove(); S.drag = null; fig.querySelectorAll('.reg').forEach(p => p.classList.remove('tgt', 'no'));
        const reg = regionAt(ev.clientX, ev.clientY);
        if (reg || onBody(ev.clientX, ev.clientY)) { const r = tryTreat(item, reg); flash(r.ok ? `${r.label} (${r.time} S)` : r.reason, r.ok); }
        render();
      };
      addEventListener('pointermove', mv); addEventListener('pointerup', up); mv(e); e.preventDefault(); return;
    }
    const reg = e.target.dataset?.region;
    if (reg && e.button === 0) { S.sel = S.sel === reg ? null : reg; render(); }
    if (reg && e.button === 2) menu(reg, e.clientX, e.clientY);
  });
  root.addEventListener('contextmenu', e => e.preventDefault());
  function menu(reg, x, y) {
    const items = [['TIGHTEN TOURNIQUET', 'tightenTQ'], ['REMOVE TOURNIQUET', 'removeTQ']].map(([t, a]) => { const o = M().treatOptions(a, reg, by()); return [t + (o.ok ? ` (${o.time} S)` : ` - ${o.reason}`), o.ok ? () => { const r = M().startTreatment({ item: a, region: reg, by: by() }); flash(r.ok ? r.label : r.reason, r.ok); render(); } : null]; });
    const m = document.createElement('div'); m.className = 'menu'; m.style.left = x + 'px'; m.style.top = y + 'px';
    m.innerHTML = `<div class="off" style="color:#ff8">${REGION[reg].name}</div>`;
    for (const [t, f] of items) { const d = document.createElement('div'); d.textContent = t; if (f) d.onclick = () => { closeMenu(); f(); }; else d.className = 'off'; m.appendChild(d); }
    root.appendChild(m); S.menu = m;
  }
  const closeMenu = () => { S.menu?.remove(); S.menu = null; };
  function flash(t, ok) { const e = document.createElement('div'); e.className = 'tip ' + (ok ? 'ok' : 'no'); e.style.cssText = 'left:50%;bottom:74px;transform:translateX(-50%);font-size:15px;position:absolute'; e.textContent = t; root.appendChild(e); setTimeout(() => e.remove(), 1800); }
  const onKey = e => { if (!S.open) return; if (e.code === 'Escape') { if (S.menu) closeMenu(); else if (M().action) M().cancelTreatment(); else api.close(); e.preventDefault(); e.stopPropagation(); } };
  addEventListener('keydown', onKey, true);

  // ------------------------------------------------------------------------------------------------------- loop
  let raf = 0, last = 0, acc = 0;
  function tick(dt) {
    if (!S.open) return;
    acc += dt; ecg(dt); action();
    if (acc > 0.25 && !S.drag) { acc = 0; vitals(); sideHTML(); figure(); if (opt.inv) I.prune(opt.inv); }
  }
  function loop(t) { const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t; if (!opt.manualTick) tick(dt); if (S.open) raf = requestAnimationFrame(loop); }
  const api = {
    el: root, S, render, tick, tryTreat,
    open() { S.open = true; root.classList.add('on'); render(); last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); },
    close() { S.open = false; root.classList.remove('on'); closeMenu(); cancelAnimationFrame(raf); opt.onClose && opt.onClose(); },
    toggle() { S.open ? api.close() : api.open(); }, isOpen: () => S.open, select(r) { S.sel = r; render(); },
    destroy() { api.close(); removeEventListener('keydown', onKey, true); root.remove(); },
  };
  return api;
}

// event log text
const RN = r => r ? REGION[r]?.name || r : '';
export const FEEDTXT = {
  hit: e => `HIT ${RN(e.region)} (${e.zone.toUpperCase()}) ${e.penetrated ? Math.round(e.hp) + ' HP' : 'STOPPED BY ARMOUR, ' + Math.round(e.hp) + ' HP BLUNT'}`,
  bleed: e => `${e.bleed.toUpperCase()} BLEED: ${e.name} (${RN(e.region)})`, bleedStop: e => `BLEEDING STOPPED (${RN(e.region)})`,
  fracture: e => `FRACTURE: ${e.name} (${RN(e.region)})`, blacked: e => `${RN(e.region)} BLACKED OUT`, ptx: e => e.open ? 'SUCKING CHEST WOUND' : 'PNEUMOTHORAX',
  treatStart: e => `${e.label}${e.region ? ' - ' + RN(e.region) : ''} (${e.time} S)`, treated: e => `DONE: ${e.action.toUpperCase()}${e.region ? ' - ' + RN(e.region) : ''}`, treatCancel: () => 'TREATMENT INTERRUPTED',
  tqApplied: e => `TOURNIQUET ${e.ok ? 'TIGHT' : 'STILL BLEEDING - TIGHTEN OR ADD A SECOND'} (${RN(e.region)})`, tqIschaemia: e => `TOURNIQUET OVER 2 H: ${RN(e.region)}`, limbLost: e => `LIMB LOST: ${RN(e.region)}`,
  unconscious: e => `UNCONSCIOUS (${e.why.toUpperCase()})`, conscious: () => 'CONSCIOUS AGAIN', death: e => e.cause, ivDone: () => 'IV BAG EMPTY', healed: e => `WOUND CARE: ${RN(e.region)} ${Math.round(e.hp)} HP`,
  naniteDone: () => 'NANITES DORMANT', naniteOverdose: () => 'NANITE OVERLOAD - SEIZURE', regrown: e => `${RN(e.region)} REGROWN`, restored: () => 'FULLY RESTORED', fall: e => `FALL ${e.v.toFixed(1)} M/S`,
};

// ---------------------------------------------------------------------------------------------------- HUD + vision
// A compact in-game strip: blood bar, shock class, bleeding drops per region, fracture / TQ / morphine flags, and the
// current treatment's progress. FOUNDATION places it (default: bottom left above the fuel block).
export function createMedHud(parent, med) {
  injectCSS('ngc-medhud-css', `.ngc-mh{position:absolute;left:16px;bottom:64px;width:300px;font:12px Consolas,monospace;color:#9ff;text-shadow:0 0 4px #0cf6;pointer-events:none}
.ngc-mh .b{height:8px;border:1px solid #a44;background:#2008;margin:2px 0}.ngc-mh .b i{display:block;height:100%;background:#d8303a}.ngc-mh .ic{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}
.ngc-mh .ic span{padding:0 4px;border:1px solid}.ngc-mh .p{height:4px;background:#0006;margin-top:3px}.ngc-mh .p i{display:block;height:100%;background:#ff8}`);
  const el = document.createElement('div'); el.className = 'ngc-mh'; parent.appendChild(el);
  return { el, update() {
    const m = med, v = m.vitals(), s = m.summary(); const ic = [];
    for (const r of REGIONS) { const R = s[r]; if (R.bleed) ic.push(`<span style="color:${BLEED_COL[R.bleed]};border-color:${BLEED_COL[R.bleed]}">${R.bleed === 'arterial' ? '!!' : R.bleed === 'heavy' ? '!' : '.'} ${REGION[r].name}</span>`); if (R.fracture) ic.push(`<span style="color:#fff;border-color:#fff">BONE ${REGION[r].name}</span>`); if (R.tq.length) ic.push(`<span style="color:#ff8;border-color:#ff8">TQ ${mmss(R.tq[0].t)}</span>`); }
    if (m.ptx) ic.push(`<span style="color:#5ef;border-color:#5ef">CHEST</span>`);
    const a = m.action;
    el.innerHTML = `BLOOD ${v.bloodMl} ML <b style="color:${CLASS_COL[v.cls]}">${['', 'I', 'II', 'III', 'IV'][v.cls]}</b> ${v.bleedMlMin ? `<span style="color:#f55">-${v.bleedMlMin} ML/MIN</span>` : ''}<div class="b"><i style="width:${(100 - v.lossPct * 2).toFixed(0)}%"></i></div><div class="ic">${ic.join('')}</div>${a ? `<div>${a.label}</div><div class="p"><i style="width:${(a.t / a.T * 100).toFixed(0)}%"></i></div>` : ''}`;
  } };
}
// Vision effects from mods().vision: a vignette for tunnel vision, CSS filters on the game canvas for greyscale and
// blur (cheap: compositor), black fade for blackout, a faint cyan tint while nanites run.
export function createVisionFX(parent, canvas) {
  const el = document.createElement('div'); el.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5'; parent.appendChild(el);
  return { el, update(mods) {
    const v = mods.vision; const t = v.tunnel;
    el.style.background = `radial-gradient(ellipse at 50% 50%, transparent ${Math.max(8, 70 - 55 * t)}%, rgba(0,0,0,${(0.35 + 0.6 * t).toFixed(2)}) ${Math.max(30, 100 - 40 * t)}%)${v.tint ? `, rgba(${v.tint.slice(0, 3).map(c => Math.round(c * 255)).join(',')},${v.tint[3]})` : ''}${v.blackout > 0 ? `, rgba(0,0,0,${v.blackout.toFixed(2)})` : ''}`;
    el.style.opacity = t > 0.01 || v.blackout > 0 || v.tint ? 1 : 0;
    if (canvas) canvas.style.filter = v.grey > 0.01 || v.blur > 0.01 ? `grayscale(${v.grey.toFixed(2)}) blur(${(v.blur * 3).toFixed(1)}px)` : '';
  } };
}
