// NGC-1980 infantry: synthesised WebAudio sound (no samples), in the style of game/js/audio.js.
// - Gunshots by weapon and DISTANCE: at the gun a hard broadband blast + low thump + the action (the M16's buffer-spring
//   "twang", the M60's heavy clatter, the .45's deep pop, the M203's "bloop", the LAW's bang and backblast roar);
//   far away the sound arrives late (distance / 340 m/s), loses its highs (air absorption), drops with distance, and
//   comes back again as an ECHO off the treeline / hills; a supersonic round passing near the listener CRACKS first,
//   before its own report.
// - Impacts: dirt thuds, the steel gong's ring (arriving after time of flight + sound's return), water plops.
// - Mechanics: magazine out / in, charging handle, bolt release, forward assist, selector, dry click, M60 cover / belt /
//   barrel latch, M203 breech, LAW extend / arm, brass tinkle.
// - Body: footsteps by surface (grass, dirt, rock, concrete, wood, metal, water, sand, mud) and gait, gear rattle with
//   load, breathing that follows the soldier's breathing rate and depth (held breath = silence, then a gasp), heartbeat
//   when blown.
// API: const A = new InfantryAudio(ctx?, destination?); A.init() on a user gesture; then the methods below.
export class InfantryAudio {
  constructor(ctx = null, dest = null) { this.ctx = ctx; this.dest = dest; this.c = 340; }
  init() {
    if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; this.ctx = new C(); }
    if (this.ctx.state === 'suspended' && !(window.OfflineAudioContext && this.ctx instanceof OfflineAudioContext)) this.ctx.resume();
    if (this.master) return;
    const c = this.ctx;
    const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    // master: a compressor keeps the gun at your shoulder from clipping
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 6; this.comp.attack.value = 0.002; this.comp.release.value = 0.15;
    this.master = c.createGain(); this.master.gain.value = 0.8; this.master.connect(this.comp); this.comp.connect(this.dest || c.destination);
    // outdoor reverb: a short decaying noise impulse (open field + treeline)
    const rl = Math.floor(c.sampleRate * 1.6), ir = c.createBuffer(2, rl, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < rl; i++) { const t = i / c.sampleRate; x[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3.2) * (t < 0.04 ? t / 0.04 : 1) * 0.6; } }
    this.verb = c.createConvolver(); this.verb.buffer = ir; this.verbG = c.createGain(); this.verbG.gain.value = 0.35; this.verb.connect(this.verbG); this.verbG.connect(this.master);
    // breathing: a looped noise through a formant-ish band, gain driven per frame
    const bs = c.createBufferSource(); bs.buffer = b; bs.loop = true;
    this.brF = c.createBiquadFilter(); this.brF.type = 'bandpass'; this.brF.frequency.value = 900; this.brF.Q.value = 0.8;
    this.brF2 = c.createBiquadFilter(); this.brF2.type = 'highshelf'; this.brF2.frequency.value = 3000; this.brF2.gain.value = -12;
    this.brG = c.createGain(); this.brG.gain.value = 0; bs.connect(this.brF); this.brF.connect(this.brF2); this.brF2.connect(this.brG); this.brG.connect(this.master); bs.start();
    this.lastHeart = 0;
  }
  get t() { return this.ctx.currentTime; }
  // ------------------------------------------------------------------------------------------------ building blocks
  _noise(at, dur, { type = 'bandpass', f0 = 1000, f1 = null, q = 1, vol = 0.3, attack = 0.001, out = this.master, curve = 'exp' } = {}) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, at); if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur); f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vol, at + attack);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, at + dur); else g.gain.linearRampToValueAtTime(0, at + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(at, Math.random() * 1.5); s.stop(at + dur + 0.05);
    return g;
  }
  _tone(at, dur, f0, f1, vol, type = 'sine', out = this.master) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, at); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vol, at + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(out); o.start(at); o.stop(at + dur + 0.02);
  }
  // a chain for distant sounds: lowpass by distance (air absorption + ground), gain by 1/r, stereo pan
  _dist(dist, pan = 0) {
    const c = this.ctx, lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(350, 16000 / (1 + dist / 60)); lp.Q.value = 0.5;
    const g = c.createGain(); g.gain.value = Math.min(1, 6 / Math.max(6, dist)) ** 0.9;
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    lp.connect(g); if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(this.master); p.connect(this.verb); } else { g.connect(this.master); g.connect(this.verb); }
    return lp;
  }
  // ------------------------------------------------------------------------------------------------ gunshots
  // o: { weapon: 'M16A1' | 'M60' | 'M1911A1' | 'M203' | 'M72A2', dist (m from the listener; 0 = your own), pan (-1..1),
  //      crack: { miss (m), delay (s) } a supersonic round passing you, echo: true }
  shot(o) {
    if (!this.ctx || !this.master) return;
    const w = o.weapon || 'M16A1', dist = o.dist || 0, now = this.t, at = now + dist / this.c, own = dist < 2;
    const out = own ? this.master : this._dist(dist, o.pan || 0);
    const P = { M16A1: { blast: 1, f: 2600, body: 0.5, thump: 95, dur: 0.12 }, M60: { blast: 1.25, f: 1800, body: 0.75, thump: 75, dur: 0.18 }, M1911A1: { blast: 0.85, f: 1400, body: 0.7, thump: 110, dur: 0.11 },
      M203: { blast: 0.45, f: 500, body: 0.6, thump: 140, dur: 0.15 }, M72A2: { blast: 1.6, f: 900, body: 1, thump: 55, dur: 0.5 },
      M2: { blast: 1.55, f: 1100, body: 1.0, thump: 52, dur: 0.24 } }[w] || {};   // M2: ngc/wheeledgame (the M35's ring mount)
    const v = own ? 0.9 : 1.6;
    // the blast: a broadband crack with a fast decay, plus the low body
    this._noise(at, P.dur, { type: 'bandpass', f0: P.f * 1.6, f1: P.f * 0.5, q: 0.5, vol: P.blast * 0.9 * v, out });
    this._noise(at, P.dur * 2.2, { type: 'lowpass', f0: 1800, f1: 200, q: 0.7, vol: P.body * 0.9 * v, out });
    this._tone(at, P.dur * 1.6, P.thump * 1.6, P.thump * 0.6, P.body * 0.6 * v, 'sine', out);
    if (w === 'M203') this._tone(at, 0.12, 380, 160, 0.4 * v, 'sine', out);                      // "bloop"
    if (w === 'M72A2') this._noise(at + 0.02, 0.9, { type: 'lowpass', f0: 2500, f1: 300, q: 0.4, vol: 0.7 * v, out });   // backblast roar
    if (own) {
      // the action: the M16 buffer spring twang, the M60's heavy bolt, the .45 slide
      if (w === 'M16A1') { this._tone(now + 0.012, 0.07, 1180, 1060, 0.05, 'triangle'); this._noise(now + 0.01, 0.03, { f0: 3500, q: 3, vol: 0.12 }); }
      if (w === 'M60') { this._noise(now + 0.03, 0.05, { f0: 1200, q: 2, vol: 0.18 }); this._tone(now + 0.03, 0.05, 420, 300, 0.06, 'square'); }
      if (w === 'M1911A1') this._noise(now + 0.025, 0.04, { f0: 2200, q: 2.5, vol: 0.15 });
      // your own shot: the reverb tail and a late echo off the treeline (~150 m away)
      const e = this.ctx.createGain(); e.gain.value = 0.5; e.connect(this.verb);
      this._noise(now, P.dur * 1.4, { type: 'lowpass', f0: 3000, f1: 400, vol: P.blast * 0.6, out: e });
    }
    if (o.echo !== false) {   // echo off the hills / treeline: delayed, dull, quieter
      const ed = (dist + 2 * 140) / this.c - dist / this.c, eo = this._dist(dist + 280, -(o.pan || 0) * 0.5);
      this._noise(at + ed, P.dur * 3, { type: 'lowpass', f0: 900, f1: 150, vol: P.blast * 0.35, out: eo, attack: 0.02 });
      this._noise(at + ed * 1.6, P.dur * 3, { type: 'lowpass', f0: 600, f1: 120, vol: P.blast * 0.15, out: eo, attack: 0.03 });
    }
    // the bullet's crack arrives BEFORE the report when it passes close by
    if (o.crack) this.crack(o.crack.miss, o.crack.delay || 0);
  }
  // supersonic crack of a passing round: a short sharp N-wave, louder the closer
  crack(miss = 3, delay = 0) {
    if (!this.ctx || !this.master) return;
    const at = this.t + delay, v = Math.min(1, 2.5 / Math.max(0.5, miss));
    this._noise(at, 0.012, { type: 'highpass', f0: 2200, q: 0.7, vol: 0.9 * v, attack: 0.0004 });
    this._tone(at, 0.01, 1800, 700, 0.3 * v, 'square');
    if (miss < 1.5) this._noise(at + 0.004, 0.08, { type: 'bandpass', f0: 5000, f1: 2500, q: 2, vol: 0.2 * v });   // the whine of a very close one
  }
  // ------------------------------------------------------------------------------------------------ impacts
  impact(material, dist = 50, pan = 0, result = 'stop') {
    if (!this.ctx || !this.master) return;
    const at = this.t + dist / this.c, out = this._dist(dist, pan);
    if (material === 'steel' || material === 'armour') { this._tone(at, 1.1, 820, 800, 0.5, 'sine', out); this._tone(at, 0.8, 1310, 1290, 0.25, 'sine', out); this._tone(at, 0.6, 2140, 2100, 0.12, 'sine', out); this._noise(at, 0.02, { f0: 4000, q: 1, vol: 0.5, out }); }
    else if (material === 'water') { this._noise(at, 0.15, { type: 'bandpass', f0: 1200, f1: 400, q: 2, vol: 0.4, out }); this._tone(at + 0.02, 0.08, 600, 1400, 0.15, 'sine', out); }
    else if (material === 'wood') this._noise(at, 0.06, { type: 'bandpass', f0: 700, q: 2, vol: 0.5, out });
    else if (material === 'brick' || material === 'concrete') { this._noise(at, 0.05, { type: 'bandpass', f0: 2600, q: 1.2, vol: 0.5, out }); this._noise(at + 0.01, 0.2, { type: 'lowpass', f0: 1500, f1: 300, vol: 0.2, out }); }
    else { this._noise(at, 0.09, { type: 'lowpass', f0: 900, f1: 200, vol: 0.55, out }); }
    if (result === 'ricochet') this._tone(at + 0.005, 0.35, 2600 + Math.random() * 1500, 900, 0.18, 'sine', out);   // the whine of a ricochet
  }
  explosion(dist = 50, pan = 0, size = 1) {
    if (!this.ctx || !this.master) return;
    const at = this.t + dist / this.c, out = this._dist(dist * 0.6, pan);
    this._noise(at, 1.2 * size, { type: 'lowpass', f0: 2400, f1: 60, q: 0.5, vol: 1.2 * size, out });
    this._tone(at, 0.8, 70, 30, 0.9 * size, 'sine', out);
    this._noise(at + 0.05, 1.8, { type: 'lowpass', f0: 600, f1: 80, vol: 0.4 * size, out, attack: 0.05 });   // debris and rumble
  }
  // ------------------------------------------------------------------------------------------------ mechanics
  mech(name, weapon = 'M16A1') {
    if (!this.ctx || !this.master) return;
    const t = this.t, n = (dl, d, o) => this._noise(t + dl, d, o), tn = (dl, d, a, b, v, ty) => this._tone(t + dl, d, a, b, v, ty);
    const heavy = weapon === 'M60';
    switch (name) {
      case 'magOut': n(0, 0.015, { f0: 3000, q: 4, vol: 0.25 }); n(0.02, 0.08, { f0: 1600, f1: 900, q: 2, vol: 0.12 }); break;
      case 'magIn': n(0, 0.04, { f0: 1400, q: 2, vol: 0.2 }); n(0.05, 0.02, { f0: 2800, q: 5, vol: 0.35 }); tn(0.05, 0.03, 900, 700, 0.06, 'square'); break;
      case 'slap': n(0, 0.03, { f0: 900, q: 1, vol: 0.35 }); n(0.005, 0.015, { f0: 2600, q: 4, vol: 0.25 }); break;
      case 'chargeBack': n(0, heavy ? 0.12 : 0.09, { f0: heavy ? 1100 : 1800, f1: heavy ? 700 : 1100, q: 3, vol: 0.18 }); n(heavy ? 0.12 : 0.09, 0.02, { f0: 2400, q: 4, vol: 0.3 }); break;
      case 'chargeFwd': case 'boltRelease': case 'close': n(0, 0.03, { f0: heavy ? 1300 : 2200, q: 3, vol: 0.4 }); tn(0, 0.04, heavy ? 500 : 900, heavy ? 350 : 700, 0.08, 'square'); if (weapon === 'M16A1') tn(0.004, 0.06, 1180, 1060, 0.03, 'triangle'); break;
      case 'fa': n(0, 0.02, { f0: 1800, q: 4, vol: 0.3 }); n(0.06, 0.02, { f0: 1700, q: 4, vol: 0.2 }); break;
      case 'selector': n(0, 0.012, { f0: 4200, q: 6, vol: 0.25 }); break;
      case 'click': n(0, 0.012, { f0: 3200, q: 5, vol: 0.35 }); tn(0, 0.02, 1400, 1200, 0.05, 'square'); break;
      case 'coverOpen': n(0, 0.05, { f0: 900, q: 2, vol: 0.3 }); tn(0, 0.06, 300, 250, 0.08, 'square'); break;
      case 'coverClose': n(0, 0.04, { f0: 1100, q: 2, vol: 0.45 }); tn(0, 0.05, 260, 200, 0.12, 'square'); break;
      case 'beltOn': for (let i = 0; i < 5; i++) n(i * 0.025, 0.02, { f0: 3000 + Math.random() * 1500, q: 6, vol: 0.12 }); break;
      case 'barrelLatch': case 'barrelOut': case 'barrelIn': n(0, 0.05, { f0: 1500, q: 2, vol: 0.3 }); tn(0, 0.15, 620, 600, 0.05, 'sine'); break;
      case 'open': n(0, 0.06, { f0: 1000, f1: 700, q: 2, vol: 0.3 }); break;
      case 'insert': n(0, 0.05, { f0: 700, q: 1.5, vol: 0.25 }); break;
      case 'extend': n(0, 0.2, { f0: 600, f1: 1200, q: 1, vol: 0.2 }); n(0.2, 0.03, { f0: 1500, q: 3, vol: 0.4 }); break;
      case 'arm': n(0, 0.02, { f0: 2400, q: 4, vol: 0.35 }); break;
      case 'pin': n(0, 0.03, { f0: 3000, q: 5, vol: 0.2 }); break;
      case 'brass': for (let i = 0; i < 2; i++) tn(0.15 + i * 0.07 + Math.random() * 0.05, 0.05, 4200 + Math.random() * 2500, 4000, 0.02, 'sine'); break;
      case 'drop': n(0, 0.06, { f0: 1500, q: 2, vol: 0.2 }); n(0.08, 0.03, { f0: 1800, q: 3, vol: 0.12 }); break;
      case 'stance': n(0, 0.25, { type: 'lowpass', f0: 900, f1: 200, vol: 0.2 }); for (let i = 0; i < 3; i++) n(0.05 + i * 0.06, 0.02, { f0: 2500 + i * 300, q: 6, vol: 0.05 }); break;
      case 'bipod': n(0, 0.03, { f0: 2000, q: 4, vol: 0.3 }); n(0.05, 0.03, { f0: 1800, q: 4, vol: 0.25 }); break;
      case 'deadTrigger': n(0, 0.008, { f0: 2600, q: 6, vol: 0.1 }); break;
      default: n(0, 0.03, { f0: 2000, q: 3, vol: 0.15 });
    }
  }
  // ------------------------------------------------------------------------------------------------ body
  footstep(surface = 'grass', gait = 'walk', load = 20, stance = 'stand') {
    if (!this.ctx || !this.master) return;
    const t = this.t, k = gait === 'sprint' ? 1.4 : gait === 'run' ? 1.1 : gait === 'crawl' ? 0.6 : 0.7, v = 0.18 * k;
    const n = (dl, d, o) => this._noise(t + dl, d, o);
    switch (surface) {
      case 'grass': n(0, 0.09, { type: 'highpass', f0: 2500, vol: v * 0.6 }); n(0, 0.05, { type: 'lowpass', f0: 300, vol: v * 0.5 }); break;
      case 'dirt': n(0, 0.06, { type: 'lowpass', f0: 500, vol: v * 0.9 }); n(0.01, 0.07, { type: 'bandpass', f0: 2500, q: 1, vol: v * 0.35 }); break;
      case 'sand': n(0, 0.14, { type: 'bandpass', f0: 1800, q: 0.6, vol: v * 0.5 }); break;
      case 'mud': n(0, 0.12, { type: 'lowpass', f0: 400, vol: v * 0.9 }); this._tone(t + 0.04, 0.05, 220, 500, v * 0.2, 'sine'); break;
      case 'rock': n(0, 0.04, { type: 'bandpass', f0: 3200, q: 1.5, vol: v * 0.7 }); n(0.02, 0.05, { type: 'bandpass', f0: 1600, q: 1.5, vol: v * 0.4 }); break;
      case 'concrete': n(0, 0.035, { type: 'bandpass', f0: 1800, q: 1.2, vol: v * 0.8 }); break;
      case 'wood': n(0, 0.05, { type: 'lowpass', f0: 600, vol: v }); this._tone(t, 0.08, 180, 140, v * 0.4, 'sine'); break;
      case 'metal': n(0, 0.04, { f0: 1200, q: 2, vol: v * 0.6 }); this._tone(t, 0.25, 640, 620, v * 0.2, 'sine'); break;
      case 'water': n(0, 0.25, { type: 'bandpass', f0: 900, f1: 400, q: 1.2, vol: v * 1.1 }); n(0.05, 0.2, { type: 'highpass', f0: 3000, vol: v * 0.4 }); break;
      default: n(0, 0.06, { type: 'lowpass', f0: 600, vol: v });
    }
    // gear: canteens, magazines in pouches, sling swivels jingle more running and with more on you
    if (gait === 'run' || gait === 'sprint') for (let i = 0; i < 2 + (load > 25 ? 2 : 0); i++) n(0.02 + Math.random() * 0.08, 0.02, { f0: 2500 + Math.random() * 3000, q: 8, vol: 0.03 * k });
  }
  // per frame: the breath (phase, depth 0..1, rate /min, held), heart rate
  body(b) {
    if (!this.ctx || !this.master) return;
    const t = this.t, inh = Math.sin(b.phase), loud = Math.max(0, (b.depth - 0.35)) * (b.held ? 0 : 1);
    // inhale through the teeth is higher and softer, exhale lower and louder
    const g = loud * (inh > 0 ? 0.05 * inh : 0.08 * -inh) * (b.rate > 30 ? 1.4 : 1);
    this.brG.gain.setTargetAtTime(g, t, 0.05); this.brF.frequency.setTargetAtTime(inh > 0 ? 1400 : 700, t, 0.1);
    if (b.hr > 150 && t - this.lastHeart > 60 / b.hr) { this.lastHeart = t; this._tone(t, 0.09, 55, 40, 0.15 * Math.min(1, (b.hr - 150) / 40), 'sine'); this._tone(t + 0.12, 0.08, 50, 38, 0.1 * Math.min(1, (b.hr - 150) / 40), 'sine'); }
  }
  gasp() { if (!this.ctx || !this.master) return; this._noise(this.t, 0.5, { type: 'bandpass', f0: 1100, f1: 600, q: 0.8, vol: 0.12, attack: 0.05, curve: 'lin' }); }
}
