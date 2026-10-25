// TECH TREE: the RESEARCH page - the task force's research plotted on the operations room's perspex board in grease
// pencil: one column per tier, a stencilled card per programme, pencilled lines from what it needs. Opened with
// SHIFT+\ from anywhere, or T on the command board; the war goes on while it is open (it is a board, not a pause).
// Keys while open: arrows / WASD move, ENTER starts the selected research, X / BACKSPACE cancels the one under way
// (full refund), T back to the command board, ESC or SHIFT+\ closes. Mouse: click a card to select, again to start.
// The logic is techtree.js (the tree held by war.js, W.tech[1]); this file only draws it and passes the orders on.
//   const ui = createTechUI({ war, hud, say, feed, sfx, store, onBoard })   // store = the player's { mat, fuel }
//   ui.open() / ui.close() / ui.toggle() / ui.key(e) -> bool (true: the page used it) / ui.update(dt) / ui.isOpen
// DOM + 2D canvas only; no THREE.
import { TECH } from './techtree.js';

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const TIER_NAME = ['TIER 0  -  IN SERVICE', 'TIER 1', 'TIER 2', 'TIER 3'];
// grease-pencil and board colours (the command board's cyan family, the map's chinagraph yellow)
const INK = { board: '#16231f', grid: 'rgba(150,190,170,.07)', pencil: '#f2d64b', chalk: '#e8e4d0', dim: '#5d6d66', red: '#e8543a', green: '#7fd38a', cyan: '#8ff' };

export function createTechUI(h) {
  const { war, say, sfx } = h, side = 1;
  const U = { isOpen: false, sel: 'p.cap', hover: null, lastSub: '', cells: [] };
  const T = () => war.tech[side];
  const nodes = () => T().nodes;
  // ---------------------------------------------------------------- DOM
  const css = document.createElement('style');
  css.textContent = `
#techBoard{position:absolute;left:50%;top:calc(50% + 4px);transform:translate(-50%,-50%);width:1180px;max-width:calc(100vw - 32px);max-height:calc(100vh - 76px);overflow:auto;box-sizing:border-box;
  display:none;padding:12px 14px 10px;background:rgba(4,14,22,.97);border:1px solid #3a8;pointer-events:auto;font-size:14px;color:#9ff;z-index:5}
#techBoard.on{display:block}
#techBoard h3{margin:0;font-size:20px;letter-spacing:6px;color:#fff;text-shadow:0 0 10px #0af}
#techBoard .sub{font-size:12px;color:#8ab;margin:2px 0 8px;letter-spacing:1px}
#techBoard .sub b{color:#fff;font-weight:normal}
#techBoard .sub .now{color:#ff8}
#techBoard canvas{display:block;width:100%;border:1px solid #275;cursor:pointer;background:${INK.board}}
#techBoard .det{display:grid;grid-template-columns:1fr 300px;gap:4px 16px;margin-top:8px;padding:8px 10px;background:rgba(0,40,60,.6);border:1px solid #275;min-height:58px}
#techBoard .det .nm{color:#fff;font-size:15px;letter-spacing:2px}
#techBoard .det .ds{color:#bde;font-size:13px;margin-top:3px}
#techBoard .det .rq{color:#8ab;font-size:12px;margin-top:3px}
#techBoard .det .st{text-align:right;font-size:13px;color:#ff8;align-self:center}
#techBoard .det .st.ok{color:#7f9}
#techBoard .det .st.no{color:#f97}
#techBoard .intel{margin-top:6px;font-size:12px;color:#f97;letter-spacing:1px}
#techBoard .foot{margin-top:6px;font-size:11px;color:#7aa;letter-spacing:1px;line-height:1.5}`;
  document.head.appendChild(css);
  const el = document.createElement('div'); el.id = 'techBoard'; h.hud.appendChild(el);
  el.innerHTML = `<h3>RESEARCH</h3><div class="sub"></div><canvas width="1150" height="440"></canvas><div class="det"></div><div class="intel"></div>
<div class="foot">ARROWS / WASD SELECT  ·  ENTER START (PAID UP FRONT)  ·  X CANCEL (FULL REFUND)  ·  T COMMAND BOARD  ·  ESC / SHIFT+\\ CLOSE<br>CLICK A CARD, AGAIN TO START  ·  ONE PROGRAMME AT A TIME, ON WAR TIME: THE WAR GOES ON WHILE THIS BOARD IS OPEN</div>`;
  const subEl = el.querySelector('.sub'), cv = el.querySelector('canvas'), detEl = el.querySelector('.det'), intelEl = el.querySelector('.intel');
  const c2 = cv.getContext('2d');
  el.addEventListener('mousedown', e => e.stopPropagation(), true);

  // ---------------------------------------------------------------- layout: columns by tier, rows in table order
  const CW = 1150, CH = 440, COLW = CW / 4, CARD_W = 218, CARD_H = 56;
  function layout() {
    const cols = [[], [], [], []];
    for (const n of nodes()) cols[n.tier].push(n);
    U.cols = cols; U.cells = [];
    cols.forEach((col, t) => {
      const top = 40, gap = (CH - top - 8) / Math.max(6, col.length);
      col.forEach((n, i) => {
        const x = t * COLW + (COLW - CARD_W) / 2, y = top + i * gap + (gap - CARD_H) / 2 + (6 - col.length) * gap / 2 * (col.length < 4 ? 1 : 0);
        U.cells.push({ n, x, y, w: CARD_W, h: CARD_H, t, i });
      });
    });
  }
  layout();
  const cellOf = id => U.cells.find(c => c.n.id === id);

  // deterministic wobble: a grease-pencil line is never quite straight
  function pencil(x0, y0, x1, y1, seed, col, w = 2.2, dash = null) {
    c2.save(); c2.strokeStyle = col; c2.lineWidth = w; c2.lineCap = 'round'; if (dash) c2.setLineDash(dash);
    const mx = (x0 + x1) / 2, n = 6;
    c2.beginPath(); c2.moveTo(x0, y0);
    for (let k = 1; k <= n; k++) {
      const f = k / n, j = Math.sin(seed * 12.9898 + k * 78.233) * 1.4 * (k < n ? 1 : 0);
      // an S-bend through the gutter between the columns
      const bx = f < 0.5 ? x0 + (mx - x0) * (f * 2) : mx + (x1 - mx) * ((f - 0.5) * 2);
      const by = f < 0.5 ? y0 + (y1 - y0) * (f * f * 2) : y0 + (y1 - y0) * (1 - (1 - f) * (1 - f) * 2);
      c2.lineTo(bx + j, by + j * 0.6);
    }
    c2.stroke(); c2.restore();
  }
  function stateOf(n) {
    const Tt = T();
    if (Tt.has(n.id)) return 'done';
    if (Tt.current && Tt.current.id === n.id) return 'now';
    if (n.requires.every(r => Tt.has(r))) return 'open';
    return 'locked';
  }
  function draw() {
    const Tt = T(), store = h.store;
    c2.clearRect(0, 0, CW, CH);
    // the board: a faint plotting grid and the tier columns ruled in chalk
    c2.fillStyle = INK.board; c2.fillRect(0, 0, CW, CH);
    c2.strokeStyle = INK.grid; c2.lineWidth = 1;
    for (let x = 0; x < CW; x += 25) { c2.beginPath(); c2.moveTo(x + 0.5, 0); c2.lineTo(x + 0.5, CH); c2.stroke(); }
    for (let y = 0; y < CH; y += 25) { c2.beginPath(); c2.moveTo(0, y + 0.5); c2.lineTo(CW, y + 0.5); c2.stroke(); }
    c2.font = 'bold 13px Consolas, "Courier New", monospace'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
    for (let t = 0; t < 4; t++) {
      if (t) pencil(t * COLW, 30, t * COLW, CH - 8, t * 3.1, 'rgba(232,228,208,.18)', 1.4, [7, 6]);
      c2.fillStyle = 'rgba(232,228,208,.75)'; c2.fillText(TIER_NAME[t], t * COLW + COLW / 2, 17);
    }
    // the lines: what each programme needs, pencilled from the right edge of the need to the left edge of the card
    for (const c of U.cells) for (const r of c.n.requires) {
      const p = cellOf(r); if (!p) continue;
      const done = Tt.has(r), sel = c.n.id === U.sel || r === U.sel;
      if (p.t === c.t) {   // same tier (only in the start set): a short bracket on the left
        const x = c.x - 8; c2.save(); c2.strokeStyle = done ? 'rgba(242,214,75,.55)' : INK.dim; c2.lineWidth = 1.6; c2.beginPath(); c2.moveTo(p.x, p.y + p.h / 2); c2.lineTo(x, p.y + p.h / 2); c2.lineTo(x, c.y + c.h / 2); c2.lineTo(c.x, c.y + c.h / 2); c2.stroke(); c2.restore();
        continue;
      }
      pencil(p.x + p.w, p.y + p.h / 2, c.x, c.y + c.h / 2, c.i * 7 + p.i, sel ? INK.pencil : done ? 'rgba(242,214,75,.42)' : 'rgba(120,140,130,.45)', sel ? 3 : 1.8, done ? null : [8, 5]);
    }
    // the cards
    for (const c of U.cells) {
      const n = c.n, st = stateOf(n), sel = n.id === U.sel, hov = n.id === U.hover;
      const ok = st === 'open' ? Tt.canResearch(n.id, store) : null;
      const afford = ok === true || (typeof ok === 'string' && !/MATERIEL|FUEL/.test(ok));
      // card body: masking tape on the perspex
      c2.fillStyle = st === 'done' ? 'rgba(52,84,58,.95)' : st === 'now' ? 'rgba(92,74,24,.95)' : st === 'open' ? 'rgba(34,52,58,.95)' : 'rgba(26,34,34,.9)';
      c2.fillRect(c.x, c.y, c.w, c.h);
      c2.lineWidth = sel ? 3 : 1.5; c2.setLineDash(st === 'locked' ? [5, 4] : []);
      c2.strokeStyle = sel ? '#ff8' : hov ? '#cfe' : st === 'done' ? INK.green : st === 'now' ? INK.pencil : st === 'open' ? (afford ? INK.chalk : '#b98') : INK.dim;
      c2.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1); c2.setLineDash([]);
      // progress: hatched in grease pencil
      if (st === 'now') {
        const w = (c.w - 4) * Tt.progress; c2.save(); c2.beginPath(); c2.rect(c.x + 2, c.y + c.h - 9, w, 7); c2.clip();
        c2.strokeStyle = INK.pencil; c2.lineWidth = 2; for (let x = c.x - 10; x < c.x + w + 10; x += 6) { c2.beginPath(); c2.moveTo(x, c.y + c.h - 2); c2.lineTo(x + 7, c.y + c.h - 9); c2.stroke(); }
        c2.restore(); c2.strokeStyle = 'rgba(242,214,75,.6)'; c2.lineWidth = 1; c2.strokeRect(c.x + 2.5, c.y + c.h - 9.5, c.w - 5, 7);
      }
      // stencil name (two lines if long), and the cost / state line
      c2.textAlign = 'left'; c2.textBaseline = 'alphabetic';
      c2.fillStyle = st === 'locked' ? '#8a9690' : '#fff'; c2.font = 'bold 13px Consolas, "Courier New", monospace';
      const name = n.name; let l1 = name, l2 = '';
      if (c2.measureText(name).width > c.w - 16) { const words = name.split(' '); l1 = ''; for (const w of words) { const t = l1 ? l1 + ' ' + w : w; if (!l2 && c2.measureText(t).width <= c.w - 16) l1 = t; else l2 = l2 ? l2 + ' ' + w : w; } }
      c2.fillText(l1, c.x + 8, c.y + 17); if (l2) c2.fillText(l2, c.x + 8, c.y + 31);
      c2.font = '11px Consolas, "Courier New", monospace';
      const what = [...(n.unlocks.units || []), ...(n.unlocks.abilities || [])].length ? 'UNLOCKS' : 'UPGRADE';
      let line = st === 'done' ? (n.tier === 0 && Tt.mode !== 'list' ? 'IN SERVICE' : 'RESEARCHED') : st === 'now' ? `UNDER WAY  ${Math.round(Tt.progress * 100)}%  ${Math.ceil(Tt.remaining)} s` : `${what}  ·  ${n.cost.mat} MAT${n.cost.fuel ? ` + ${n.cost.fuel} FUEL` : ''}  ·  ${n.time} s`;
      if (c2.measureText(line).width > c.w - 16) line = line.replace(/  ·  /g, ' · ');
      if (c2.measureText(line).width > c.w - 16) line = line.replace(/^(UNLOCKS|UPGRADE) · /, '');
      c2.fillStyle = st === 'done' ? INK.green : st === 'now' ? INK.pencil : st === 'open' ? (afford ? '#bde' : '#d9a') : '#6f7d77';
      c2.fillText(line, c.x + 8, c.y + (l2 ? 46 : 40));
      if (st === 'done') {   // a grease-pencil tick
        c2.save(); c2.strokeStyle = INK.green; c2.lineWidth = 3; c2.lineCap = 'round'; c2.beginPath(); c2.moveTo(c.x + c.w - 26, c.y + 14); c2.lineTo(c.x + c.w - 19, c.y + 22); c2.lineTo(c.x + c.w - 8, c.y + 7); c2.stroke(); c2.restore();
      } else if (st === 'locked') {   // a pencilled padlock
        const x = c.x + c.w - 20, y = c.y + 10; c2.save(); c2.strokeStyle = INK.dim; c2.lineWidth = 2; c2.strokeRect(x, y + 6, 12, 9); c2.beginPath(); c2.arc(x + 6, y + 6, 4, Math.PI, 0); c2.stroke(); c2.restore();
      }
    }
  }
  function details() {
    const Tt = T(), n = Tt.node(U.sel); if (!n) { detEl.innerHTML = ''; return; }
    const st = stateOf(n), ok = Tt.canResearch(n.id, h.store);
    const req = n.requires.length ? `NEEDS: ${n.requires.map(r => { const q = Tt.node(r); return `${Tt.has(r) ? '✓ ' : ''}${q ? q.name : r}`; }).join('  ·  ')}` : 'NEEDS: NOTHING';
    const unl = [...(n.unlocks.units || []), ...(n.unlocks.abilities || [])];
    const mods = n.unlocks.mods ? Object.entries(n.unlocks.mods).map(([k, v]) => `${k.toUpperCase()} x${v}`).join('  ·  ') : '';
    let stx, cls = '';
    if (st === 'done') { stx = 'RESEARCHED'; cls = 'ok'; }
    else if (st === 'now') stx = `UNDER WAY  -  ${Math.ceil(Tt.remaining)} s LEFT  ·  X CANCELS`;
    else if (ok === true) { stx = `ENTER: START  (${n.cost.mat} MATERIEL${n.cost.fuel ? `, ${n.cost.fuel} FUEL` : ''}, ${n.time} s)`; cls = 'ok'; }
    else { stx = ok; cls = 'no'; }
    detEl.innerHTML = `<div><div class="nm">${esc(n.name)}</div><div class="ds">${esc(n.desc)}</div><div class="rq">${esc(req)}${unl.length ? `  ·  UNLOCKS: ${esc(unl.join(', ').toUpperCase())}` : ''}${mods ? `  ·  ${esc(mods)}` : ''}</div></div><div class="st ${cls}">${esc(stx)}</div>`;
  }
  function subline() {
    const Tt = T(), cur = Tt.current ? Tt.node(Tt.current.id) : null;
    const done = Tt.nodes.filter(n => Tt.has(n.id)).length;
    return `TASK FORCE ALBATROSS  ·  MATERIEL <b>${Math.floor(h.store.mat)}</b>  ·  FUEL STORES <b>${Math.round(h.store.fuel)}</b>  ·  ${done} / ${Tt.nodes.length} PROGRAMMES  ·  ${cur ? `<span class="now">UNDER WAY: ${esc(cur.name)}  ${Math.round(Tt.progress * 100)}%  (${Math.ceil(Tt.remaining)} s)</span>` : 'NO RESEARCH UNDER WAY'}`;
  }
  function intel() {   // what the RUNAWAY have fielded beyond their opening (the feed announces each one)
    const E = war.tech[2]; if (!E) return '';
    const seen = E.nodes.filter(n => n.tier > 0 && E.has(n.id) && (n.unlocks.units || []).length).map(n => n.name);
    return seen.length ? `INTEL  -  THE RUNAWAY HAVE FIELDED: ${seen.join('  ·  ')}` : 'INTEL  -  NO NEW RUNAWAY WEAPONS SEEN YET';
  }
  function render() {
    if (!U.isOpen) return;
    draw(); details();
    const s = subline(); if (s !== U.lastSub) { U.lastSub = s; subEl.innerHTML = s; }
    const i = intel(); if (intelEl._t !== i) { intelEl._t = i; intelEl.textContent = i; }
  }

  // ---------------------------------------------------------------- orders
  function start(id = U.sel) {
    const r = war.research(side, id), n = T().node(id);
    if (r === true) { say(`RESEARCH STARTED  -  ${n.name}  (${n.time} s)`, 2); h.feed?.(`RESEARCH: ${n.name} UNDER WAY`, 'info'); sfx?.ui?.('select'); }
    else { say(r, 1.8); }
    render();
  }
  function cancel() {
    const cur = T().current; const r = war.cancelResearch(side);
    if (r === true) { say(`RESEARCH CANCELLED  -  ${T().node(cur.id).name}  -  REFUNDED`, 1.8); sfx?.ui?.('select'); } else say(r, 1.2);
    render();
  }
  function move(dc, dr) {
    const c = cellOf(U.sel) || U.cells[0]; let t = c.t + dc, i = c.i + dr;
    if (dc) { t = (t + 4) % 4; const col = U.cols[t]; i = Math.min(col.length - 1, Math.round(c.i * (col.length - 1) / Math.max(1, U.cols[c.t].length - 1))); }
    else { const col = U.cols[t]; i = (i + col.length) % col.length; }
    U.sel = U.cols[t][i].id; sfx?.ui?.('select'); render();
  }
  cv.addEventListener('click', e => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * CW / r.width, y = (e.clientY - r.top) * CH / r.height;
    const c = U.cells.find(c => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h); if (!c) return;
    if (U.sel === c.n.id && stateOf(c.n) === 'open') start(c.n.id); else { U.sel = c.n.id; sfx?.ui?.('select'); render(); }
  });
  cv.addEventListener('mousemove', e => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * CW / r.width, y = (e.clientY - r.top) * CH / r.height;
    const c = U.cells.find(c => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h); const id = c ? c.n.id : null;
    if (id !== U.hover) { U.hover = id; render(); }
  });

  // ---------------------------------------------------------------- open / close / keys
  U.open = () => {
    layout();
    if (!T().node(U.sel)) U.sel = nodes()[0].id;
    // open on the research under way, else on the first programme that could start
    const Tt = T(); U.sel = Tt.current ? Tt.current.id : (Tt.available(h.store)[0] || Tt.available()[0] || U.sel);
    U.isOpen = true; el.classList.add('on'); U.lastSub = ''; h.onOpen?.(); render();
  };
  U.close = () => { if (!U.isOpen) return; U.isOpen = false; el.classList.remove('on'); };
  U.toggle = () => U.isOpen ? U.close() : U.open();
  U.key = e => {
    const c = e.code;
    if (c === 'Escape' || (c === 'Backslash' && e.shiftKey) || c === 'IntlBackslash') { U.close(); return true; }
    if (c === 'Backslash' || c === 'KeyT') { U.close(); h.onBoard?.(); return true; }
    if (c === 'ArrowUp' || c === 'KeyW') { move(0, -1); return true; }
    if (c === 'ArrowDown' || c === 'KeyS') { move(0, 1); return true; }
    if (c === 'ArrowLeft' || c === 'KeyA') { move(-1, 0); return true; }
    if (c === 'ArrowRight' || c === 'KeyD') { move(1, 0); return true; }
    if (c === 'Enter' || c === 'Space' || c === 'KeyF') { start(); return true; }
    if (c === 'KeyX' || c === 'Backspace' || c === 'Delete') { cancel(); return true; }
    return !['KeyM', 'KeyP', 'KeyK', 'KeyJ'].includes(c);   // the map, pause, keyboard-only and the controls panel still work
  };
  U.select = id => { if (T().node(id)) { U.sel = id; render(); } };
  let rt = 0;
  U.update = dt => { if (!U.isOpen) return; rt -= dt; if (rt <= 0) { rt = 0.25; render(); } };
  U.el = el; U.TECH = TECH;
  return U;
}
