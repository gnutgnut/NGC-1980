// COMMANDER: the command board - the player is the task force's commander. Backslash (\) opens it from any unit:
// every unit type of the fleet with its reserve and the one that is out (where it is, what it is doing), the base
// to deploy at (the ALBATROSS or a friendly island, LEFT / RIGHT), and one key to take a unit out there or switch to
// the one already out. The war keeps running while it is open (it is a radio, not a pause menu). After a loss it
// opens by itself and, unless the commander starts choosing, hands on to the next unit (the Huey) after the crew
// timer (main.js). Slash (/) jumps straight to the next unit that is out, without the board.
//
// The host (main.js) supplies the roster, one entry per FLEET_TYPES id:
//   { id, label, out() -> bool (in the world and alive), active() -> bool (the commander is in it), status() -> string,
//     can(base) -> '' | why not here, deploy(base) -> '' | why it failed (the reserve is already taken),
//     switchTo() -> '' | why, recall?() -> '' | why (jets on CAP), standDown?() -> '' | why (parked at a base) }
// and bases() -> [{ key, kind: 'ship' | 'island', name, x, z }] (nearest first is not needed: the board sorts).
// TECH TREE (optional): gate(id) -> '' | 'NEEDS ... RESEARCH' locks a type's deploy and buy (one already out can still
// be switched to); research() opens the RESEARCH page (T); researchLine() -> '' | text for the board's sub line.
// DOM only; no THREE.
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function createCommander(h) {
  const { fleet, say, feed, sfx } = h;
  const C = { isOpen: false, sel: 0, baseKey: null, banner: '', lossMode: false, choosing: false, rows: [], bases: [], lastHtml: '' };
  // ---------------------------------------------------------------- DOM
  const css = document.createElement('style');
  css.textContent = `
#cmdBoard{position:absolute;left:16px;top:50%;transform:translateY(-50%);width:600px;max-width:calc(100vw - 32px);max-height:calc(100vh - 40px);overflow:auto;box-sizing:border-box;
  display:none;padding:12px 14px 10px;background:rgba(4,14,22,.86);border:1px solid #3a8;pointer-events:auto;font-size:14px;color:#9ff;text-shadow:none}
#cmdBoard.on{display:block}
#cmdBoard h3{margin:0;font-size:20px;letter-spacing:6px;color:#fff;text-shadow:0 0 10px #0af}
#cmdBoard .sub{font-size:12px;color:#8ab;margin:2px 0 8px;letter-spacing:1px}
#cmdBoard .ban{margin:0 0 8px;padding:6px 8px;background:rgba(120,30,10,.55);border:1px solid #f86;color:#fdb;font-size:13px;letter-spacing:1px}
#cmdBoard .base{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:14px;letter-spacing:2px}
#cmdBoard .base b{color:#ff8;flex:1;text-align:center}
#cmdBoard .base span{cursor:pointer;padding:0 8px;border:1px solid #3a8;color:#9ff}
#cmdBoard .row{display:grid;grid-template-columns:22px 1fr 110px;gap:1px 8px;padding:5px 8px;margin:3px 0;background:rgba(0,40,60,.6);border:1px solid #275;cursor:pointer}
#cmdBoard .row.sel{background:rgba(0,90,120,.85);border-color:#8ff}
#cmdBoard .row.off{opacity:.45}
#cmdBoard .row.lock .st{color:#f97}
#cmdBoard .row .k{color:#6aa;font-size:12px;padding-top:2px}
#cmdBoard .row .nm{color:#fff;letter-spacing:1px}
#cmdBoard .row .nm small{color:#7aa;letter-spacing:0;margin-left:6px}
#cmdBoard .row .ct{text-align:right;color:#fff}
#cmdBoard .row .ct small{color:#7aa;font-size:11px;margin-left:4px}
#cmdBoard .row .st{grid-column:2/4;font-size:12px;color:#9cc}
#cmdBoard .row .st i{font-style:normal;color:#ff8}
#cmdBoard .row.here .st i{color:#7f9}
#cmdBoard .foot{margin-top:8px;font-size:11px;color:#7aa;letter-spacing:1px;line-height:1.5}
#fleet{font-size:14px;line-height:1.4;color:#bdf;text-shadow:0 0 3px #000,0 0 6px #000,0 0 2px #000}
#fleet b{color:#9cf;font-weight:normal}
#fleet i{font-style:normal;color:#fff}
#fleet .out{color:#8f9}
#fleet .hint{color:#9bc;font-size:12px}`;
  document.head.appendChild(css);
  const el = document.createElement('div'); el.id = 'cmdBoard'; h.hud.appendChild(el);
  const strip = document.getElementById('fleet');

  // ---------------------------------------------------------------- bases
  function basesNow() {
    const here = h.here(), bs = h.bases().slice();
    for (const b of bs) b.d = Math.hypot(b.x - here.x, b.z - here.z);
    bs.sort((a, b) => (a.kind === 'ship' ? -1 : 0) - (b.kind === 'ship' ? -1 : 0) || a.d - b.d);   // the ALBATROSS first, then islands by distance
    return bs;
  }
  const base = () => C.bases.find(b => b.key === C.baseKey) || C.bases[0] || null;
  function nearestBaseKey() { let best = null; for (const b of C.bases) if (!best || b.d < best.d) best = b; return best ? best.key : null; }

  // ---------------------------------------------------------------- what each row offers at the selected base
  function rowOf(r, fresh = false) {   // fresh: another of a type that can have several out (r.multi: the motor pool)
    const t = fleet.type(r.id), n = Math.max(0, fleet.n[r.id] || 0), b = base(), out = r.out(), act = r.active(), another = fresh && r.multi;
    const o = { r, t, n, out, act, status: out ? r.status() : '', action: 'none', label: '', why: '' };
    if (act && !another) { o.action = 'here'; o.label = 'YOU ARE HERE'; return o; }
    if (out && !another) { o.action = 'switch'; o.label = 'SWITCH TO IT'; return o; }
    const gate = h.gate ? h.gate(r.id) : '';   // TECH TREE: a type not yet researched can't be taken out
    if (gate) { o.why = gate; o.label = gate; o.locked = true; return o; }
    const why = !b ? 'NO BASE' : !t.at.includes(b.kind) ? (b.kind === 'island' ? 'CARRIER ONLY' : 'ISLANDS ONLY') : r.can(b);
    if (why) { o.why = why; o.label = why; return o; }
    if (n > 0) { o.action = 'deploy'; o.label = `DEPLOY AT ${b.name}`; return o; }
    if (h.mat() >= t.cost) { o.action = 'buy'; o.label = `BUY (${t.cost} MATERIEL) + DEPLOY`; return o; }
    o.why = `NONE LEFT  -  ${t.cost} MATERIEL BUYS ONE`; o.label = o.why; return o;
  }

  // ---------------------------------------------------------------- acting
  function done() { C.lossMode = false; C.choosing = false; C.banner = ''; h.picked?.(); C.close(); }
  C.act = (i = C.sel, fresh = false) => {
    const o = fresh ? h.roster[i] && rowOf(h.roster[i], true) : C.rows[i] || rowOf(h.roster[i]); if (!o) return false;
    const r = o.r, b = base();
    sfx?.ui?.('select');
    if (o.action === 'here') { say(`YOU ARE IN THE ${r.label}`, 1.2); return false; }
    if (o.action === 'switch') { const tok = h.leaving?.(); const w = r.switchTo(); if (w) { say(w, 1.8); return false; } h.left?.(tok); done(); return true; }
    if (o.action === 'none') { say(o.why || 'NOT AVAILABLE', 1.6); return false; }
    if (o.action === 'buy') { const w = fleet.buy(r.id, h.store); if (w) { say(w, 1.8); return false; } feed(`MATERIEL: A NEW ${o.t.label} FOR THE FLEET`, 'good'); }
    if (!fleet.take(r.id)) { say(`NO ${o.t.short} LEFT`, 1.6); return false; }
    const tok = h.leaving?.();
    const w = r.deploy(b);
    if (w) { fleet.give(r.id); say(w, 2); return false; }
    h.left?.(tok);
    feed(`COMMAND: ${o.t.label} OUT AT ${b.name}`, 'good');
    done(); return true;
  };
  // deploy / switch to a type at once (keys 5 / 8 from any unit; tests): base = the nearest that takes it
  C.deploy = (id, baseKey, fresh = false) => {   // fresh: another of a motor-pool type even with one out
    const i = h.roster.findIndex(r => r.id === id); if (i < 0) return false;
    C.bases = basesNow(); const t = fleet.type(id);
    if (baseKey) C.baseKey = baseKey;
    else { let best = null; for (const b of C.bases) if (t.at.includes(b.kind) && (!best || b.d < best.d)) best = b; C.baseKey = best ? best.key : nearestBaseKey(); }
    C.rows = h.roster.map(r => rowOf(r));
    return C.act(i, fresh);
  };
  C.recall = (i = C.sel) => { const r = h.roster[i]; if (!r || !r.recall) { say('NOTHING TO RECALL', 1.2); return; } const w = r.recall(); say(w || `${r.label}  -  RECALLED TO THE ALBATROSS`, 1.8); };
  C.standDown = (i = C.sel) => {
    const r = h.roster[i]; if (!r || !r.standDown || !r.out() || r.active()) { say('NOTHING TO STAND DOWN', 1.2); return; }
    const w = r.standDown(); if (w) { say(w, 1.8); return; }
    fleet.give(r.id); feed(`COMMAND: ${r.label} STOOD DOWN  -  BACK IN RESERVE`, 'info'); sfx?.ui?.('select');
  };
  // Slash: the next unit that is out, in fleet order after the one you are in
  C.next = () => {
    const R = h.roster, k = Math.max(0, R.findIndex(r => r.active()));
    for (let j = 1; j <= R.length; j++) {
      const r = R[(k + j) % R.length]; if (r.active() || !r.out()) continue;
      const tok = h.leaving?.(); const w = r.switchTo(); if (w) { say(w, 1.6); continue; }
      h.left?.(tok);
      say(`${r.label}  -  ${r.status()}`, 1.6); sfx?.ui?.('select'); done(); return true;
    }
    say('NO OTHER UNIT OUT  -  \\ FOR THE COMMAND BOARD', 1.6); return false;
  };

  // ---------------------------------------------------------------- open / close / keys
  C.open = (banner = '') => {
    C.bases = basesNow(); if (!C.baseKey || !C.bases.some(b => b.key === C.baseKey) || !C.isOpen) C.baseKey = nearestBaseKey();
    C.banner = banner; C.isOpen = true; el.classList.add('on');
    const i = h.roster.findIndex(r => r.active()); if (!C.lossMode) C.sel = Math.max(0, i);
    h.onOpen?.(); render(true);
  };
  C.close = () => { if (!C.isOpen) return; C.isOpen = false; el.classList.remove('on'); const lm = C.lossMode && C.choosing; C.banner = ''; if (lm) { C.lossMode = false; C.choosing = false; h.closedWhileLost?.(); } };
  C.toggle = () => C.isOpen ? C.close() : C.open();
  // a loss: the board opens on the default next unit; the host's timer hands on unless the commander starts choosing
  C.onLoss = (why, nextLabel) => {
    C.lossMode = true; C.choosing = false;
    const i = h.roster.findIndex(r => r.id === 'heli'); C.sel = Math.max(0, i);
    C.open(`${why}  -  NEXT: ${nextLabel || 'THE HUEY'} IN A MOMENT, OR PICK ONE`);
  };
  C.holdAuto = () => C.isOpen && C.lossMode && C.choosing;   // the host's hand-on timer waits while the commander chooses
  const nav = () => { if (C.lossMode && !C.choosing) { C.choosing = true; C.banner = C.banner.replace(/NEXT: .*$/, 'PICK YOUR NEXT UNIT'); } };
  C.key = e => {   // while open: every key is the board's (the unit you are in gets no input)
    const c = e.code, R = h.roster;
    if (c === 'Backslash' && e.shiftKey && h.research) { C.close(); h.research(); return true; }   // TECH TREE: SHIFT+\ the RESEARCH page
    if (c === 'Escape' || c === 'Backslash') { C.close(); return true; }
    if (c === 'ArrowUp' || c === 'KeyW') { nav(); C.sel = (C.sel - 1 + R.length) % R.length; render(true); return true; }
    if (c === 'ArrowDown' || c === 'KeyS') { nav(); C.sel = (C.sel + 1) % R.length; render(true); return true; }
    if (c === 'ArrowLeft' || c === 'KeyA' || c === 'ArrowRight' || c === 'KeyD') {
      nav(); const bs = C.bases, k = Math.max(0, bs.findIndex(b => b.key === C.baseKey)), d = c === 'ArrowLeft' || c === 'KeyA' ? -1 : 1;
      if (bs.length) C.baseKey = bs[(k + d + bs.length) % bs.length].key; render(true); sfx?.ui?.('select'); return true;
    }
    if (c === 'Enter' || c === 'Space' || c === 'KeyF') { nav(); C.act(); render(true); return true; }
    if (e.shiftKey && /^Digit[1-5]$/.test(c) && h.orders) { nav(); say(h.orders.run(+c.slice(5)), 2.4); render(true); return true; }   // PARITY: the support orders
    if (/^Digit[1-9]$/.test(c)) { const i = +c.slice(5) - 1; if (i < R.length) { nav(); C.sel = i; C.act(i); render(true); } return true; }
    if (c === 'KeyR') { nav(); C.recall(); render(true); return true; }
    if (c === 'KeyX') { nav(); C.standDown(); render(true); return true; }
    if (c === 'KeyN') { nav(); C.act(C.sel, true); render(true); return true; }   // another one (the motor pool's types)
    if (c === 'Slash') { C.next(); return true; }
    if (c === 'KeyT' && h.research) { C.close(); h.research(); return true; }   // TECH TREE: the RESEARCH page
    return !['KeyM', 'KeyP', 'KeyK', 'KeyJ'].includes(c);   // the map, pause, keyboard-only and the controls panel still work
  };

  // ---------------------------------------------------------------- drawing
  el.addEventListener('mousedown', e => e.stopPropagation(), true);
  el.addEventListener('click', e => {
    const row = e.target.closest('[data-i]'), bb = e.target.closest('[data-b]');
    if (bb) { nav(); const bs = C.bases, k = Math.max(0, bs.findIndex(b => b.key === C.baseKey)), d = +bb.dataset.b; if (bs.length) C.baseKey = bs[(k + d + bs.length) % bs.length].key; render(true); return; }
    if (row) { nav(); const i = +row.dataset.i; if (C.sel === i) C.act(i); else C.sel = i; render(true); }
  });
  function render(force) {
    if (!C.isOpen) return;
    C.bases = basesNow(); if (!C.bases.some(b => b.key === C.baseKey)) C.baseKey = nearestBaseKey();
    C.rows = h.roster.map(r => rowOf(r));
    const b = base();
    let html = `<h3>COMMAND</h3><div class="sub">TASK FORCE ALBATROSS  ·  MATERIEL <b>${Math.floor(h.mat())}</b>  ·  FUEL STORES <b>${Math.round(h.fuelStores())}</b>  ·  LOSSES <b>${fleet.losses()}</b>${h.researchLine ? h.researchLine() : ''}</div>`;
    if (C.banner) html += `<div class="ban">${esc(C.banner)}</div>`;
    html += `<div class="base"><span data-b="-1">&lt;</span><b>DEPLOY AT: ${b ? esc(b.name) + (b.kind === 'island' ? ' (ISLAND)' : ' (CARRIER)') : 'NO BASE'}${b && b.d > 60 ? `  ·  ${Math.round(b.d)} m` : ''}</b><span data-b="1">&gt;</span></div>`;
    C.rows.forEach((o, i) => {
      const cls = ['row', i === C.sel ? 'sel' : '', o.action === 'none' ? 'off' : '', o.act ? 'here' : '', o.locked ? 'lock' : ''].join(' ');
      const more = o.r.multi && (o.out || o.act) ? `  ·  N: ANOTHER AT ${esc(b ? b.name : '')}` : '';
      const st = o.act ? `<i>YOU ARE HERE</i>  ·  ${esc(o.status)}${more}` : o.out ? `<i>OUT</i>  ·  ${esc(o.status)}  ·  ENTER: SWITCH TO IT${o.r.recall && /CAP/.test(o.status) ? '  ·  R: RECALL' : ''}${o.r.standDown && o.r.canStandDown && o.r.canStandDown() ? '  ·  X: STAND DOWN' : ''}${more}` : `${o.action === 'none' ? '' : 'ENTER: '}${esc(o.label)}`;
      html += `<div class="${cls}" data-i="${i}"><span class="k">${i + 1}</span><span class="nm">${esc(o.t.short)}<small>${esc(o.r.label || o.t.label)}  ·  ${esc(o.t.note)}</small></span><span class="ct">${o.n}<small>IN RESERVE</small></span><span class="st">${st}</span></div>`;
    });
    if (h.orders) {   // PARITY: the support orders (units/commander/orders.js), at the island selected on the map
      const tg = h.orderTarget ? h.orderTarget() : '';
      html += `<div class="sub" style="margin-top:8px">SUPPORT ORDERS  ·  AT <b>${esc(tg || 'NO ISLAND SELECTED (M, CLICK ONE)')}</b></div>`;
      for (const o of h.orders.rows()) html += `<div class="row${o.locked ? ' lock off' : ''}"><span class="k">⇧${o.n}</span><span class="nm">${esc(o.label)}<small>${o.cost ? o.cost + ' MATERIEL' : 'NO COST'}</small></span><span class="ct"></span><span class="st">${esc(o.locked ? o.why : o.status)}</span></div>`;
    }
    html += `<div class="foot">UP / DOWN SELECT  ·  LEFT / RIGHT BASE  ·  ENTER DEPLOY OR SWITCH  ·  1-${h.roster.length} PICK  ·  R RECALL A JET  ·  X STAND DOWN  ·  N ANOTHER VEHICLE  ·  / NEXT UNIT  ·  SHIFT+1-5 SUPPORT ORDERS  ·  T RESEARCH  ·  \\ CLOSE<br>THE WAR GOES ON: A UNIT YOU LEAVE IS FLOWN HOME BY ITS CREW OR PARKS WHERE IT IS</div>`;
    if (force || html !== C.lastHtml) { C.lastHtml = html; el.innerHTML = html; }
  }
  // per frame: the HUD fleet strip; the open board refreshes ~4x a second (statuses move)
  let rt = 0, st = 0, shown = null;
  C.update = (dt, show) => {
    if (C.isOpen) { rt -= dt; if (rt <= 0) { rt = 0.25; render(false); } }
    if (!strip) return;
    st -= dt; if (st > 0 && show === shown) return; st = 0.25; shown = show;   // the strip: 4x a second is plenty
    const s = fleet.strip(id => { const r = h.roster.find(r => r.id === id); return r ? (r.outCount ? r.outCount() : r.out() ? 1 : 0) : 0; });
    const html = show ? `FLEET ${s.map(x => `<b>${x.short}</b> <i>${x.n}</i>${x.out ? `<span class="out">+${x.out}</span>` : ''}`).join('  ')}<div class="hint">\\ COMMAND BOARD  ·  / NEXT UNIT OUT  ·  +N = OUT IN THE WAR</div>` : '';
    if (strip._h !== html) { strip._h = html; strip.innerHTML = html; }
  };
  return C;
}
