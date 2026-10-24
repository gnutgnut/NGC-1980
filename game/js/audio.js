export class Sfx {
  constructor() { this.ctx = null; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const c = this.ctx = new C();
    const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    this.master = c.createGain(); this.master.gain.value = 0.5; this.master.connect(c.destination);
    const src = c.createBufferSource(); src.buffer = b; src.loop = true;
    this.engF = c.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 200;
    this.engG = c.createGain(); this.engG.gain.value = 0;
    src.connect(this.engF); this.engF.connect(this.engG); this.engG.connect(this.master); src.start();
  }
  engine(l) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.engG.gain.setTargetAtTime(l * 0.35, t, 0.05); this.engF.frequency.setTargetAtTime(180 + l * 600, t, 0.05);
    if (!l && this.hG) this.hG.gain.setTargetAtTime(0, t, 0.08);   // engine(0) = the helicopter is gone / swapped out
  }

  // ---------------------------------------------------------------- HUEY
  // UH-1H: the two-blade "wop wop" (blade slap: a noise band pulsed at the blade passage frequency, 2 x 5.4 Hz at 324 rpm,
  // harder with rotor load, in turns, flares and blade-vortex interaction), a low rotor drone, the T53 turbine whine
  // (pitch follows N1), exhaust roar with power, wind with speed, and the low rotor rpm warning horn.
  hueyInit() {
    if (!this.ctx || this.hG) return; const c = this.ctx;
    const noise = (type, f, q) => { const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q; s.connect(fl); s.start(0, Math.random()); return fl; };
    // a sharp pulse train (period = one blade passage) as a periodic wave: the slap envelope
    const N = 24, re = new Float32Array(N), im = new Float32Array(N); for (let k = 1; k < N; k++) re[k] = Math.exp(-k * 0.13) * (k % 2 ? 1 : 0.85);
    const pulse = c.createPeriodicWave(re, im, { disableNormalization: false });
    this.hSlapF = noise('bandpass', 260, 1.1); this.hSlapG = c.createGain(); this.hSlapG.gain.value = 0; this.hSlapF.connect(this.hSlapG);
    this.hSlapL = c.createOscillator(); this.hSlapL.setPeriodicWave(pulse); this.hSlapD = c.createGain(); this.hSlapD.gain.value = 0; this.hSlapL.connect(this.hSlapD); this.hSlapD.connect(this.hSlapG.gain);
    this.hThF = noise('lowpass', 90); this.hThG = c.createGain(); this.hThG.gain.value = 0; this.hThF.connect(this.hThG);   // the low "wop"
    this.hThD = c.createGain(); this.hThD.gain.value = 0; this.hSlapL.connect(this.hThD); this.hThD.connect(this.hThG.gain);
    this.hWh = c.createOscillator(); this.hWh.type = 'sawtooth'; this.hWhF = c.createBiquadFilter(); this.hWhF.type = 'bandpass'; this.hWhF.Q.value = 9; this.hWhG = c.createGain(); this.hWhG.gain.value = 0;
    this.hWh.connect(this.hWhF); this.hWhF.connect(this.hWhG);
    this.hWh2 = c.createOscillator(); this.hWh2.type = 'sine'; this.hWh2G = c.createGain(); this.hWh2G.gain.value = 0; this.hWh2.connect(this.hWh2G);
    this.hExF = noise('lowpass', 400); this.hExG = c.createGain(); this.hExG.gain.value = 0; this.hExF.connect(this.hExG);
    this.hWiF = noise('highpass', 900); this.hWiG = c.createGain(); this.hWiG.gain.value = 0; this.hWiF.connect(this.hWiG);
    // ngc/hornethuey: the tail rotor's buzz, 2 blades x 5.123 x rotor speed = 55 Hz at 324 rpm, a sawtooth (its harmonics)
    this.hTr = c.createOscillator(); this.hTr.type = 'sawtooth'; this.hTrF = c.createBiquadFilter(); this.hTrF.type = 'lowpass'; this.hTrF.frequency.value = 420; this.hTrG = c.createGain(); this.hTrG.gain.value = 0;
    this.hTr.connect(this.hTrF); this.hTrF.connect(this.hTrG); this.hTr.start();
    this.hHorn = c.createOscillator(); this.hHorn.type = 'square'; this.hHornG = c.createGain(); this.hHornG.gain.value = 0; this.hHorn.connect(this.hHornG);
    this.hMuff = c.createBiquadFilter(); this.hMuff.type = 'lowpass'; this.hMuff.frequency.value = 18000;
    this.hG = c.createGain(); this.hG.gain.value = 0;
    for (const n of [this.hSlapG, this.hThG, this.hWhG, this.hWh2G, this.hExG, this.hWiG, this.hTrG]) n.connect(this.hMuff);
    this.hMuff.connect(this.hG); this.hHornG.connect(this.hG); this.hG.connect(this.master);
    for (const o of [this.hSlapL, this.hWh, this.hWh2, this.hHorn]) o.start();
  }
  // o: { nr, n1 (0..1), load (thrust / weight), torque (psi), vib (0..1), horn, inside, spd (m/s), on }
  huey(o) {
    if (!this.ctx) return; this.hueyInit(); const t = this.ctx.currentTime, sp = (p, v, k = 0.06) => p.setTargetAtTime(v, t, k);
    if (this.engG.gain.value > 0.001) sp(this.engG.gain, 0);   // the old generic engine stays quiet
    const nr = Math.max(0, o.nr), bpf = 2 * 5.4 * nr, rot = Math.min(1, nr * 1.1), ld = Math.max(0, Math.min(2, o.load));
    // the slap gets sharper and louder with load (and in turns / flares / blade-vortex interaction = vib)
    const slap = rot * rot * (0.05 + 0.16 * ld + 0.25 * o.vib), depth = 0.6 + 0.4 * Math.min(1, ld);
    sp(this.hSlapL.frequency, Math.max(0.5, bpf)); sp(this.hSlapG.gain, slap * (1 - depth) * 0.5); sp(this.hSlapD.gain, slap * depth);
    sp(this.hSlapF.frequency, 180 + 140 * Math.min(1, ld) + 200 * o.vib);
    sp(this.hThG.gain, rot * 0.12 * (0.5 + ld) * 0.3); sp(this.hThD.gain, rot * rot * 0.22 * (0.6 + 0.6 * Math.min(1.4, ld)));
    // turbine: whine follows N1 (starter spin-up is audible), exhaust roar with power
    const n1 = Math.max(0, o.n1); sp(this.hWh.frequency, 180 + 760 * n1); sp(this.hWhF.frequency, 900 + 2600 * n1); sp(this.hWhG.gain, 0.035 * Math.min(1, n1 * 2) * (o.inside ? 1.3 : 0.8));
    sp(this.hWh2.frequency, 2600 + 4200 * n1); sp(this.hWh2G.gain, 0.008 * Math.min(1, n1 * 1.6));
    sp(this.hExG.gain, 0.06 * Math.max(0, n1 - 0.4) * (0.6 + o.torque / 60)); sp(this.hExF.frequency, 250 + 300 * Math.min(1, o.torque / 50));
    sp(this.hWiG.gain, Math.min(0.12, (o.spd / 60) ** 2 * 0.12)); sp(this.hWiF.frequency, 700 + o.spd * 12);
    sp(this.hTr.frequency, Math.max(1, 2 * 5.123 * 5.4 * nr)); sp(this.hTrG.gain, rot * rot * 0.028 * (0.6 + 0.5 * Math.min(1.4, ld)) * (o.inside ? 0.5 : 1));   // tail rotor buzz
    // low rotor rpm warning: the UH-1H's pulsing horn in the headset
    const hornOn = o.horn && (t % 0.5) < 0.32; sp(this.hHornG.gain, hornOn ? 0.05 : 0, 0.01); sp(this.hHorn.frequency, (t % 1) < 0.5 ? 640 : 560, 0.01);
    sp(this.hMuff.frequency, o.inside ? 2400 : 18000); sp(this.hG.gain, typeof o.on === 'number' ? o.on : o.on ? 1 : 0, 0.1);   // FOUNDATION: on may be a volume (a parked Huey heard from outside)
  }
  // ---------------------------------------------------------------- GROUND VEHICLES (FOUNDATION hook)
  // a piston engine: the firing pulse (rpm / 60 x cylinders / 2) as a buzzy sawtooth, exhaust rumble (noise), muffled
  // inside. o: { rpm, load 0..1, cyl, on (0..1 volume, 0 = silent), inside }. One engine at a time (the one you drive
  // or stand next to); unit agents may build their own richer sound beside it.
  motorInit() {
    if (!this.ctx || this.mG) return; const c = this.ctx;
    this.mOsc = c.createOscillator(); this.mOsc.type = 'sawtooth'; this.mOscG = c.createGain(); this.mOscG.gain.value = 0; this.mOsc.connect(this.mOscG);
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; this.mNF = c.createBiquadFilter(); this.mNF.type = 'lowpass'; this.mNF.frequency.value = 300; s.connect(this.mNF);
    this.mNG = c.createGain(); this.mNG.gain.value = 0; this.mNF.connect(this.mNG);
    this.mF = c.createBiquadFilter(); this.mF.type = 'lowpass'; this.mF.frequency.value = 900; this.mG = c.createGain(); this.mG.gain.value = 0;
    this.mOscG.connect(this.mF); this.mNG.connect(this.mF); this.mF.connect(this.mG); this.mG.connect(this.master); this.mOsc.start(); s.start(0, Math.random());
  }
  motor(o) {
    if (!this.ctx) return; this.motorInit(); const t = this.ctx.currentTime, sp = (p, v) => p.setTargetAtTime(v, t, 0.06);
    const f = Math.max(8, (o.rpm || 0) / 60 * (o.cyl || 4) / 2), ld = Math.max(0, Math.min(1, o.load || 0));
    sp(this.mOsc.frequency, f); sp(this.mOscG.gain, 0.06 + 0.1 * ld); sp(this.mNF.frequency, 120 + f * 3); sp(this.mNG.gain, 0.12 + 0.25 * ld);
    sp(this.mF.frequency, o.inside ? 500 + f * 4 : 900 + f * 8); sp(this.mG.gain, (o.rpm > 50 ? 1 : 0) * Math.max(0, Math.min(1, o.on || 0)) * 0.55);
  }
  blip(f0, f1, dur, type = 'square', vol = 0.15) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  }
  shot() { this.blip(900, 200, 0.12); }
  enemyShot() { this.blip(300, 120, 0.2, 'sawtooth', 0.1); }
  pickup() { this.blip(400, 1200, 0.25, 'triangle', 0.2); }
  dock() { this.blip(200, 800, 0.6, 'sine', 0.25); }
  rocket() { this.noiseBurst(2400, 300, 0.35, 0.25); this.blip(500, 1400, 0.25, 'sawtooth', 0.05); }
  bombDrop() { this.blip(1600, 600, 0.9, 'sine', 0.05); }
  flak() { this.noiseBurst(900, 120, 0.25, 0.18); }
  alarm() { if (!this.ctx) return; const t = this.ctx.currentTime; if (t - (this._al || 0) < 3) return; this._al = t; this.blip(880, 660, 0.18, 'square', 0.08); setTimeout(() => this.blip(880, 660, 0.18, 'square', 0.08), 260); }
  noiseBurst(f0, f1, dur, vol) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  boom(big = 1) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1500 * big, t); f.frequency.exponentialRampToValueAtTime(80, t + 0.8);
    const g = c.createGain(); g.gain.setValueAtTime(0.6 * big, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + 0.85);
  }

  // ---------------------------------------------------------------- HORNET
  // jet: two engines' roar (band-passed noise) + turbine whine (saw through a band-pass, pitch follows rpm),
  // afterburner rumble (low noise), wind with airspeed; muffled when you are in the cockpit
  jetInit() {
    if (!this.ctx || this.jg) return; const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    this.jRoarF = c.createBiquadFilter(); this.jRoarF.type = 'bandpass'; this.jRoarF.Q.value = 0.7;
    this.jRoar = c.createGain(); this.jRoar.gain.value = 0; src.connect(this.jRoarF); this.jRoarF.connect(this.jRoar);
    const src2 = c.createBufferSource(); src2.buffer = this.noise; src2.loop = true;
    this.jAbF = c.createBiquadFilter(); this.jAbF.type = 'lowpass'; this.jAbF.frequency.value = 160;
    this.jAb = c.createGain(); this.jAb.gain.value = 0; src2.connect(this.jAbF); this.jAbF.connect(this.jAb);
    const src3 = c.createBufferSource(); src3.buffer = this.noise; src3.loop = true;
    this.jWindF = c.createBiquadFilter(); this.jWindF.type = 'highpass'; this.jWindF.frequency.value = 900;
    this.jWind = c.createGain(); this.jWind.gain.value = 0; src3.connect(this.jWindF); this.jWindF.connect(this.jWind);
    this.jWhine = c.createOscillator(); this.jWhine.type = 'sawtooth'; this.jWhineF = c.createBiquadFilter(); this.jWhineF.type = 'bandpass'; this.jWhineF.Q.value = 8;
    this.jWhineG = c.createGain(); this.jWhineG.gain.value = 0; this.jWhine.connect(this.jWhineF); this.jWhineF.connect(this.jWhineG);
    this.jMuff = c.createBiquadFilter(); this.jMuff.type = 'lowpass'; this.jMuff.frequency.value = 20000;
    this.jg = c.createGain(); this.jg.gain.value = 1;
    for (const n of [this.jRoar, this.jAb, this.jWind, this.jWhineG]) n.connect(this.jMuff);
    this.jMuff.connect(this.jg); this.jg.connect(this.master);
    // seeker tone: AIM-9 growl (low, warbling) and the high lock tone
    this.sk = c.createOscillator(); this.sk.type = 'triangle'; this.skLfo = c.createOscillator(); this.skLfo.frequency.value = 11; this.skLfoG = c.createGain(); this.skLfoG.gain.value = 0;
    this.skLfo.connect(this.skLfoG); this.skLfoG.connect(this.sk.frequency); this.skG = c.createGain(); this.skG.gain.value = 0; this.sk.connect(this.skG); this.skG.connect(this.master);
    for (const s of [src, src2, src3]) s.start(); this.jWhine.start(); this.sk.start(); this.skLfo.start();
  }
  // n: mean rpm 0..1.05, ab 0..1, spd m/s true airspeed, inside: in the cockpit, on: jet is the player's aircraft
  jet(n, ab, spd, inside, on = true) {
    if (!this.ctx) return; this.jetInit(); const t = this.ctx.currentTime, k = typeof on === 'number' ? on : on ? 1 : 0, sp = (v, x) => v.setTargetAtTime(x, t, 0.08);
    const run = Math.max(0, (n - 0.2) / 0.85);
    sp(this.jRoar.gain, k * (0.05 + 0.32 * run * run)); sp(this.jRoarF.frequency, 300 + 900 * run);
    sp(this.jWhineG.gain, k * 0.05 * Math.min(1, n * 1.5) * (inside ? 1.4 : 0.8)); sp(this.jWhine.frequency, 220 + 900 * n); sp(this.jWhineF.frequency, 1200 + 2800 * n);
    sp(this.jAb.gain, k * 0.55 * ab); sp(this.jWind.gain, k * Math.min(0.35, (spd / 180) ** 2 * 0.35)); sp(this.jWindF.frequency, 700 + spd * 6);
    sp(this.jMuff.frequency, inside ? 1500 : 18000);
  }
  // 0 = off, 1 = growl (seeker sees a heat source), 2 = lock
  seeker(mode) {
    if (!this.ctx || !this.sk) return; const t = this.ctx.currentTime;
    this.skG.gain.setTargetAtTime(mode ? 0.05 : 0, t, 0.03); this.sk.frequency.setTargetAtTime(mode === 2 ? 1250 : 420, t, 0.02); this.skLfoG.gain.setTargetAtTime(mode === 1 ? 120 : 0, t, 0.02);
  }
  missile() { this.noiseBurst(3000, 200, 0.9, 0.35); this.blip(300, 120, 0.6, 'sawtooth', 0.06); }
  jetGun(on) {   // the M61's buzz-saw while the trigger is held
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    if (!this.gunO) { this.gunO = c.createOscillator(); this.gunO.type = 'square'; this.gunO.frequency.value = 100; this.gunN = c.createGain(); this.gunN.gain.value = 0; this.gunO.connect(this.gunN); this.gunN.connect(this.master); this.gunO.start(); }
    this.gunN.gain.setTargetAtTime(on ? 0.09 : 0, t, 0.02);
  }
  thump(v = 0.5) { this.noiseBurst(220, 60, 0.3, 0.4 * v); }
  catShot() { this.noiseBurst(500, 90, 2.0, 0.45); }
  // "Bitching Betty": the Hornet's voice warnings, through the browser's speech synthesis (rate-limited per message)
  betty(msg, every = 6) {
    try {
      const now = performance.now() / 1000; this._bt = this._bt || {};
      if (now - (this._bt[msg] || -1e9) < every || !window.speechSynthesis || this.muteVoice) return;
      if (speechSynthesis.speaking && now - (this._btAny || 0) < 1.2) return;
      this._bt[msg] = now; this._btAny = now;
      const u = new SpeechSynthesisUtterance(msg); u.rate = 1.15; u.pitch = 1.1; u.volume = 0.8;
      const v = speechSynthesis.getVoices().find(v => /female|zira|samantha|susan|hazel|aria|jenny/i.test(v.name)) || speechSynthesis.getVoices().find(v => /^en/i.test(v.lang));
      if (v) u.voice = v; speechSynthesis.speak(u);
    } catch (e) {}
  }
}
