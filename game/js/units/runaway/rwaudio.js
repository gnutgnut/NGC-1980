// RUNAWAY ground forces: synthesised sound (WebAudio, no samples), in the style of audio.js.
//   const rwa = new RwAudio(sfx.ctx, sfx.master)      (wave 2: reuse the game's Sfx context and master gain)
//   rwa.listener(x, y, z)                                 every frame (the camera / player)
//   rwa.loops(units)                                      every frame: continuous voices from the living units
//        units: [{ kind: 'strider' | 'hovertank' | 'mbt', x, y, z, servo (0..1.5), fan (0..1), speed (m/s), engine (0..1),
//                  charge (0..1 coilgun capacitor) }]
//   rwa.event(e)                                          one-shots: { e: 'step' | 'shot' | 'mainGun' | 'blast' | 'impact' |
//        'hit' | 'fall' | 'thud' | 'getup' | 'chirp' | 'pd' | 'stumble', x, y, z, ... } (sandbox.js events + 'chirp')
// Voices:
//   servo whine  - two detuned saws through a resonant band-pass, pitch and level follow the nearby striders' joint
//                  activity (S.servo): a thin, precise electric whine that rises when they run or scramble
//   footfalls    - a dull thump (low-passed noise) + a short metallic tick (the toe claws), heavier when running /
//                  stumbling, pitch-varied per foot
//   hover fans   - band-passed roar + the blade-pass tone (9 blades x rpm) + a high fan whistle, per nearby hover tank
//   MBT engines  - turbine whine (M1A2) / diesel rumble (T-90M), track clatter with speed
//   coilgun      - capacitor charge whine (rising), then the crack: a broadband snap, a falling 'zap' and a sub thump
//   machine speech - short FM chirp phrases on the data link (contact, bound, link lost: a broken, glitching phrase)
//   gunfire      - the seized rifle's crack, the coil carbine's tick, the 1980 dummies' rifle / MG / LAW (simple)
export class RwAudio {
  constructor(ctx, dest) {
    this.ctx = ctx; this.out = ctx.createGain(); this.out.gain.value = 0.9; this.out.connect(dest || ctx.destination);
    this.L = [0, 0, 0];
    const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    this.loopsInit();
  }
  listener(x, y, z) { this.L[0] = x; this.L[1] = y; this.L[2] = z; }
  near(x, y, z, range) { return Math.max(0, 1 - Math.hypot(x - this.L[0], y - this.L[1], z - this.L[2]) / range); }
  _noise(type, f, q) { const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q; s.connect(fl); s.start(0, Math.random() * 1.5); return fl; }
  _gain(v = 0) { const g = this.ctx.createGain(); g.gain.value = v; g.connect(this.out); return g; }
  loopsInit() {
    const c = this.ctx;
    // servo bank
    this.sv = [0, 1].map(i => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 900 + i * 7; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 14; f.frequency.value = 1800; const g = this._gain(0); o.connect(f); f.connect(g); o.start(); return { o, f, g }; });
    // hover fans (one shared voice set, level = sum of nearby fans)
    this.fanRoarF = this._noise('bandpass', 220, 0.8); this.fanRoar = this._gain(0); this.fanRoarF.connect(this.fanRoar);
    this.fanTone = c.createOscillator(); this.fanTone.type = 'triangle'; this.fanToneG = this._gain(0); this.fanTone.connect(this.fanToneG); this.fanTone.start();
    this.fanWhF = this._noise('bandpass', 3200, 6); this.fanWh = this._gain(0); this.fanWhF.connect(this.fanWh);
    // coilgun charge whine
    this.chg = c.createOscillator(); this.chg.type = 'sine'; this.chgG = this._gain(0); this.chg.connect(this.chgG); this.chg.start();
    // MBT engines
    this.turb = c.createOscillator(); this.turb.type = 'sawtooth'; this.turbF = c.createBiquadFilter(); this.turbF.type = 'bandpass'; this.turbF.Q.value = 6; this.turbG = this._gain(0); this.turb.connect(this.turbF); this.turbF.connect(this.turbG); this.turb.start();
    this.dslF = this._noise('lowpass', 120); this.dsl = this._gain(0); this.dslF.connect(this.dsl);
    this.clatF = this._noise('bandpass', 900, 2); this.clat = this._gain(0); this.clatF.connect(this.clat);
    this.clatLfo = c.createOscillator(); this.clatLfo.frequency.value = 8; this.clatD = c.createGain(); this.clatD.gain.value = 0; this.clatLfo.connect(this.clatD); this.clatD.connect(this.clat.gain); this.clatLfo.start();
  }
  loops(units) {
    if (!this.ctx) return; const t = this.ctx.currentTime, sp = (p, v, k = 0.08) => p.setTargetAtTime(v, t, k);
    let servo = 0, fan = 0, fanRpm = 0, charge = 0, turb = 0, dsl = 0, clat = 0, clatRate = 0;
    for (const u of units) {
      if (u.kind === 'strider') { const k = this.near(u.x, u.y, u.z, 60); servo += k * k * u.servo; }
      else if (u.kind === 'hovertank') { const k = this.near(u.x, u.y, u.z, 260); fan += k * k * u.fan; fanRpm = Math.max(fanRpm, u.fan); charge = Math.max(charge, k * k * (u.charge < 1 ? u.charge : 0)); }
      else { const k = this.near(u.x, u.y, u.z, 300); if (u.type === 'm1a2') turb += k * k * (0.3 + 0.7 * u.engine); else dsl += k * k * (0.3 + 0.7 * u.engine); clat += k * k * Math.min(1, Math.abs(u.speed) / 6); clatRate = Math.max(clatRate, Math.abs(u.speed)); }
    }
    servo = Math.min(1.5, servo);
    for (let i = 0; i < 2; i++) { sp(this.sv[i].o.frequency, 700 + servo * 900 + i * 9); sp(this.sv[i].f.frequency, 1500 + servo * 1600); sp(this.sv[i].g.gain, Math.min(0.05, servo * 0.03)); }
    fan = Math.min(2, fan);
    sp(this.fanRoar.gain, 0.12 * fan); sp(this.fanRoarF.frequency, 150 + 140 * fanRpm);
    sp(this.fanTone.frequency, 9 * (40 + 25 * fanRpm)); sp(this.fanToneG.gain, 0.03 * fan);
    sp(this.fanWh.gain, 0.02 * fan); sp(this.fanWhF.frequency, 2600 + 1400 * fanRpm);
    sp(this.chg.frequency, 300 + 2600 * charge); sp(this.chgG.gain, charge > 0.05 ? 0.012 * Math.min(1, charge * 2) : 0);
    sp(this.turbG.gain, 0.04 * Math.min(1.5, turb)); sp(this.turb.frequency, 500 + 700 * Math.min(1, turb)); sp(this.turbF.frequency, 1800 + 1500 * Math.min(1, turb));
    sp(this.dsl.gain, 0.2 * Math.min(1.5, dsl));
    sp(this.clat.gain, 0); sp(this.clatD.gain, 0.08 * Math.min(1.5, clat)); sp(this.clatLfo.frequency, 4 + clatRate * 2.2);
  }
  // ---------------------------------------------------------------- one-shots
  burst(f0, f1, dur, vol, type = 'bandpass', q = 1, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay, s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(f0, f1, dur, vol, type = 'sine', delay = 0) {
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.02);
  }
  // machine speech: a phrase of FM chirps; 'glitch' breaks it up
  chirp(kind = 'ack', k = 1, delay = 0) {
    const P = { ack: [1800, 2400, 1600], contact: [2200, 2900, 2200, 3300], bound: [1500, 1900], lost: [2600, 1900, 1200, 700], up: [900, 1400, 2100], down: [1600, 900] }[kind] || [2000];
    P.forEach((f, i) => { const d = delay + i * 0.055 + (kind === 'lost' ? Math.random() * 0.04 : 0); this.tone(f, f * (kind === 'lost' ? 0.6 : 1.12), 0.045, 0.035 * k, 'square', d); this.tone(f * 1.5, f * 1.4, 0.03, 0.012 * k, 'sine', d + 0.01); });
  }
  event(e) {
    if (!this.ctx) return;
    const k = e.x !== undefined ? this.near(e.x, e.y ?? this.L[1], e.z, { step: 45, shot: 500, mainGun: 900, blast: 900, impact: 120, hit: 140, fall: 80, thud: 80, getup: 60, chirp: 70, pd: 300, stumble: 60, destroyed: 260 }[e.e] || 300) : 1;
    if (k <= 0.01) return; const v = k * k;
    switch (e.e) {
      case 'step': {
        const hv = Math.min(2, e.v || 1), p = 0.85 + Math.random() * 0.3;
        this.burst(260 * p, 70, 0.09 + 0.03 * hv, 0.16 * v * hv, 'lowpass', 0.7);
        this.burst(4200 * p, 2600, 0.025, 0.05 * v * (0.6 + hv * 0.3), 'bandpass', 4);
        if (e.stumble > 0.5) this.burst(1200, 300, 0.12, 0.08 * v, 'bandpass', 2);
        break;
      }
      case 'shot': {
        // (ngc/rwground-polish: the ground war's 1980 rounds by their own names - the Marines' M16s, M60s and M203s were
        // silent: m16 -> rifle, m60 -> mg; the M203's hollow 'bloop')
        const a = e.ammo === 'm16' ? 'rifle' : e.ammo === 'm60' ? 'mg' : e.ammo;
        if (a === 'm203') { this.burst(320, 90, 0.12, 0.3 * v, 'lowpass', 1.2); this.tone(260, 120, 0.09, 0.12 * v, 'sine'); break; }
        if (a === 'xm7') { this.burst(2400, 400, 0.12, 0.35 * v, 'bandpass', 0.8); this.burst(180, 60, 0.15, 0.25 * v, 'lowpass'); }
        else if (a === 'needle') { this.burst(6000, 3000, 0.04, 0.2 * v, 'highpass', 1); this.tone(5200, 1800, 0.05, 0.05 * v, 'sine'); }
        else if (a === 'rifle') { this.burst(2000, 500, 0.1, 0.3 * v, 'bandpass', 0.8); }
        else if (a === 'mg') { this.burst(1600, 300, 0.1, 0.32 * v, 'bandpass', 0.7); this.burst(140, 50, 0.12, 0.2 * v, 'lowpass'); }
        else if (a === 'law') { this.burst(900, 120, 0.7, 0.4 * v, 'bandpass', 0.6); this.burst(3000, 600, 0.4, 0.15 * v, 'highpass', 0.5); }
        else if (a === 'tankgun' || a === 'mbt120' || a === 'mbt125') { this.burst(600, 40, 1.2, 0.8 * v, 'lowpass', 0.5); this.burst(2500, 300, 0.3, 0.3 * v, 'bandpass', 0.5); }
        else if (a === 'coil120') { this.burst(9000, 1200, 0.08, 0.6 * v, 'highpass', 0.6); this.tone(3600, 140, 0.35, 0.18 * v, 'sawtooth'); this.burst(120, 30, 0.6, 0.6 * v, 'lowpass', 0.8); this.tone(55, 30, 0.4, 0.25 * v, 'sine'); }
        break;
      }
      case 'blast': this.burst(1400 * (e.big || 1), 50, 1.4, 0.75 * v, 'lowpass', 0.6); this.burst(3000, 400, 0.25, 0.2 * v, 'bandpass', 0.6); break;
      case 'impact': this.burst(e.unit ? 3500 : 1800, 600, 0.06, 0.08 * v, 'bandpass', 2); break;
      case 'hit': if (e.pen === false) this.tone(2600 + Math.random() * 900, 1800, 0.08, 0.06 * v, 'triangle'); else this.burst(2800, 700, 0.09, 0.14 * v, 'bandpass', 3); break;   // a ricochet ping off ceramic / a crunch
      case 'fall': this.chirp('down', k); this.burst(700, 150, 0.3, 0.1 * v, 'bandpass', 1.5); break;
      case 'thud': this.burst(200, 40, 0.35, 0.4 * v, 'lowpass', 0.7); this.burst(2200, 900, 0.15, 0.08 * v, 'bandpass', 3, 0.02); break;
      case 'getup': this.chirp('up', k); this.tone(400, 1600, 0.7, 0.03 * v, 'sawtooth'); break;
      case 'stumble': this.burst(1800, 600, 0.12, 0.06 * v, 'bandpass', 3); break;
      case 'chirp': this.chirp(e.kind, k); break;
      case 'pd': this.burst(5000, 2000, 0.18, 0.25 * v, 'bandpass', 1.5); this.tone(4000, 3500, 0.15, 0.04 * v, 'square'); break;
      // ngc/rwground-polish: a machine dies - a STRIDER's servos wind down in a falling whine with a broken last phrase;
      // a vehicle's capacitors / turbine run down under the blast (the blast itself is the war's boom)
      case 'destroyed':
        if (e.kind === 'strider') { this.tone(2400, 90, 1.4, 0.07 * v, 'sawtooth'); this.chirp('lost', k * 0.8, 0.15); }
        else if (e.kind === 'hovertank') { this.tone(900, 40, 2.2, 0.1 * v, 'sawtooth'); this.burst(5000, 1500, 0.6, 0.12 * v, 'highpass', 0.5, 0.3); }
        else if (e.kind === 'mbt') { this.tone(420, 30, 2.6, 0.08 * v, 'triangle'); this.burst(2600, 500, 1.2, 0.18 * v, 'bandpass', 0.7, 0.9); }
        break;
    }
  }
}
