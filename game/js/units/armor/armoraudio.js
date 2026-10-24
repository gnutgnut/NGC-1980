// Synthesised WebAudio for the tracked vehicles (no samples), in the audio.js style. Plug into the game's Sfx with
// new ArmorAudio(sfx.ctx, sfx.master), or let it make its own context (dev page).
// - Diesel: firing pulses at the firing frequency (AVDS-1790: 12-cylinder four-stroke = rpm/60 x 6; 6V53: six-cylinder
//   two-stroke = rpm/60 x 6) as a pulse wave through a low-pass, plus noise amplitude-modulated at the same rate (the
//   bark), load raises the brightness; AVDS cooling fans (the M60's whine) and supercharger whistle; the 6V53's Roots
//   blower scream; starter grind.
// - Tracks: link clank at the link passing frequency (track speed / pitch) with jitter, rattle from the wheels, squeal
//   when the track slips sideways (turning, pivots), ground rumble with speed, water slosh and wake when swimming.
// - Turret: hydraulic pump hum while powered, servo whine with the traverse rate.
// - Weapons: main gun (blast, low thump, then the breech and the spent case clanging on the turret floor inside), coax
//   and .50 reports per shot, impacts at a distance (delayed by the speed of sound, muffled with range).
// Inside a vehicle everything goes through a low-pass (hull) and the engine is felt more than heard.
export class ArmorAudio {
  constructor(ctx = null, dest = null) { this.ctx = ctx; this.dest = dest; this.on = false; }
  init() {
    if (this.ctx && this.built) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    if (!this.ctx) { const C = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext); if (!C) return; this.ctx = new C(); }
    const c = this.ctx;
    const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    this.out = c.createGain(); this.out.gain.value = 0.6; this.out.connect(this.dest || c.destination);
    this.muff = c.createBiquadFilter(); this.muff.type = 'lowpass'; this.muff.frequency.value = 18000; this.muff.connect(this.out);
    const noise = (type, f, q) => { const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q; s.connect(fl); s.start(0, Math.random() * 1.5); return fl; };
    const gain = (src, v = 0) => { const g = c.createGain(); g.gain.value = v; src.connect(g); g.connect(this.muff); return g; };
    // ---- engine: a pulse wave at the firing frequency (sharp pulses = harmonics), low-passed
    const N = 32, re = new Float32Array(N), im = new Float32Array(N); for (let k = 1; k < N; k++) re[k] = Math.exp(-k * 0.09) * (k % 3 === 0 ? 1.2 : 1);
    this.fire = c.createOscillator(); this.fire.setPeriodicWave(c.createPeriodicWave(re, im)); this.fireLP = c.createBiquadFilter(); this.fireLP.type = 'lowpass'; this.fireLP.Q.value = 1.4;
    this.fire.connect(this.fireLP); this.fireG = gain(this.fireLP);
    // bark: noise amplitude-modulated by the firing pulses
    this.barkN = noise('bandpass', 500, 0.8); this.barkG = c.createGain(); this.barkG.gain.value = 0; this.barkN.connect(this.barkG);
    this.barkD = c.createGain(); this.barkD.gain.value = 0; this.fire.connect(this.barkD); this.barkD.connect(this.barkG.gain); this.barkG.connect(this.muff);
    // sub rumble (an octave below, half-order: uneven firing / structure)
    this.sub = c.createOscillator(); this.sub.type = 'triangle'; this.subG = gain(this.sub);
    // fan / blower whine and the supercharger whistle
    this.fan = c.createOscillator(); this.fan.type = 'sawtooth'; this.fanF = c.createBiquadFilter(); this.fanF.type = 'bandpass'; this.fanF.Q.value = 6; this.fan.connect(this.fanF); this.fanG = gain(this.fanF);
    this.fanN = noise('bandpass', 1200, 1.5); this.fanNG = gain(this.fanN);
    this.sc = c.createOscillator(); this.sc.type = 'sine'; this.scG = gain(this.sc);
    // starter
    this.st = c.createOscillator(); this.st.type = 'square'; this.stF = c.createBiquadFilter(); this.stF.type = 'lowpass'; this.stF.frequency.value = 600; this.st.connect(this.stF); this.stG = gain(this.stF);
    // ---- tracks: clank pulses (noise gated by a fast pulse wave), squeal, rumble
    const pr = new Float32Array(24), pi = new Float32Array(24); for (let k = 1; k < 24; k++) pr[k] = 1;   // narrow pulses
    this.clk = c.createOscillator(); this.clk.setPeriodicWave(c.createPeriodicWave(pr, pi)); this.clkN = noise('bandpass', 1400, 1.2);
    this.clkG = c.createGain(); this.clkG.gain.value = 0; this.clkN.connect(this.clkG); this.clkD = c.createGain(); this.clkD.gain.value = 0; this.clk.connect(this.clkD); this.clkD.connect(this.clkG.gain); this.clkG.connect(this.muff);
    this.clk2 = c.createOscillator(); this.clk2.setPeriodicWave(c.createPeriodicWave(pr, pi)); this.clk2N = noise('bandpass', 700, 1.0);
    this.clk2G = c.createGain(); this.clk2G.gain.value = 0; this.clk2N.connect(this.clk2G); this.clk2D = c.createGain(); this.clk2D.gain.value = 0; this.clk2.connect(this.clk2D); this.clk2D.connect(this.clk2G.gain); this.clk2G.connect(this.muff);
    this.sq = noise('bandpass', 3200, 18); this.sqG = gain(this.sq); this.sqLfo = c.createOscillator(); this.sqLfo.frequency.value = 5; this.sqLfoG = c.createGain(); this.sqLfoG.gain.value = 0; this.sqLfo.connect(this.sqLfoG); this.sqLfoG.connect(this.sq.frequency);
    this.rum = noise('lowpass', 120); this.rumG = gain(this.rum);
    this.wat = noise('lowpass', 500); this.watG = gain(this.wat);
    this.wind = noise('highpass', 1200); this.windG = gain(this.wind);
    // ---- turret: hydraulic pump hum + servo whine
    this.hyd = c.createOscillator(); this.hyd.type = 'sawtooth'; this.hyd.frequency.value = 400; this.hydF = c.createBiquadFilter(); this.hydF.type = 'lowpass'; this.hydF.frequency.value = 900; this.hyd.connect(this.hydF); this.hydG = gain(this.hydF);
    this.srv = c.createOscillator(); this.srv.type = 'triangle'; this.srvG = gain(this.srv);
    // polish: the second cooling fan (the AVDS has two; their beat is the M60's signature), the starter motor's gear
    // whine, brake squeal, the turret's hydraulic valve hiss
    this.fan2 = c.createOscillator(); this.fan2.type = 'sawtooth'; this.fan2F = c.createBiquadFilter(); this.fan2F.type = 'bandpass'; this.fan2F.Q.value = 6; this.fan2.connect(this.fan2F); this.fan2G = gain(this.fan2F);
    this.stW = c.createOscillator(); this.stW.type = 'sawtooth'; this.stWF = c.createBiquadFilter(); this.stWF.type = 'bandpass'; this.stWF.Q.value = 4; this.stW.connect(this.stWF); this.stWG = gain(this.stWF);
    this.brk = noise('bandpass', 3800, 22); this.brkG = gain(this.brk);
    this.hiss = noise('bandpass', 2200, 1.5); this.hissG = gain(this.hiss);
    // the stabiliser's gyros running up after turret power on (a rising whine that settles to a hum)
    this.gyr = c.createOscillator(); this.gyr.type = 'sine'; this.gyrG = gain(this.gyr);
    for (const o of [this.fire, this.sub, this.fan, this.fan2, this.stW, this.sc, this.st, this.clk, this.clk2, this.sqLfo, this.hyd, this.srv, this.gyr]) o.start();
    this.built = true; this.on = true;
  }
  // V: the vehicle (createM60A3 / createM113); veh: 'm60' | 'm113'; o: { inside, view, dt, cam }
  update(V, veh, o = {}) {
    if (!this.built) return;
    const c = this.ctx, t = c.currentTime, sp = (p, v, k = 0.05) => p.setTargetAtTime(v, t, k), fm = V.fm, e = fm.eng;
    const rpm = e.w * 9.549, run = e.running ? 1 : 0, load = Math.max(0, Math.min(1, e.load)), inside = !!o.inside;
    const m60 = veh !== 'm113';
    // engine: firing frequency and brightness
    const ff = Math.max(1, rpm / 60 * 6);
    sp(this.fire.frequency, ff); sp(this.fireLP.frequency, 180 + ff * (m60 ? 2.2 : 3.0) * (0.6 + 0.8 * load));
    const ev = run ? (0.06 + 0.12 * load) : (rpm > 60 ? 0.04 * rpm / 300 : 0);
    sp(this.fireG.gain, ev * (inside ? 1.4 : 1)); sp(this.barkD.gain, run * (0.04 + 0.1 * load)); sp(this.barkN.frequency, m60 ? 380 + 300 * load : 700 + 500 * load);
    sp(this.sub.frequency, ff / 2); sp(this.subG.gain, (run ? 0.05 + 0.06 * load : 0) * (inside ? 1.8 : 1));
    // fans (M60: big cooling fans geared to the crank) / Roots blower (6V53)
    const fanHz = m60 ? rpm / 60 * 3.1 * 12 : rpm / 60 * 2 * 3 * 1.8;
    sp(this.fan.frequency, Math.max(20, fanHz)); sp(this.fanF.frequency, Math.max(100, fanHz * 1.02)); sp(this.fanG.gain, run * (m60 ? 0.03 : 0.045) * Math.min(1, rpm / 1200));
    sp(this.fan2.frequency, Math.max(20, fanHz * (m60 ? 1.017 : 2.0))); sp(this.fan2F.frequency, Math.max(100, fanHz * (m60 ? 1.03 : 2.02))); sp(this.fan2G.gain, run * (m60 ? 0.026 : 0.015) * Math.min(1, rpm / 1200));
    sp(this.fanN.frequency, (m60 ? 500 : 900) + rpm * 0.6); sp(this.fanNG.gain, run * (m60 ? 0.08 : 0.045) * Math.min(1, rpm / 1500));
    sp(this.sc.frequency, 1500 + rpm * (m60 ? 1.6 : 0.9)); sp(this.scG.gain, run * (m60 ? 0.006 : 0.01) * (0.3 + load));
    const cranking = fm.ctl.starter && !e.running;
    sp(this.st.frequency, 18 + rpm / 60 * 3); sp(this.stG.gain, cranking ? 0.12 : 0, 0.02);
    sp(this.stW.frequency, 260 + rpm * 1.4); sp(this.stWF.frequency, 500 + rpm * 2.5); sp(this.stWG.gain, cranking ? 0.035 : 0, 0.03);
    // one-shots on state changes: the engine catching (a cough, then it runs up), a range shift (the transmission's clunk)
    if (this._run === false && e.running) { this.burst(500, 70, 0.7, 0.45, 'lowpass', 0.6); this.tone(55, 90, 0.4, 0.25, 'sine'); }
    if (this._rng != null && this._rng !== fm.range && e.running) { this.burst(260, 70, 0.18, 0.3, 'bandpass', 1.2); this.tone(95, 60, 0.14, 0.18, 'sine'); }
    this._run = e.running; this._rng = fm.range;
    // tracks
    const v = Math.abs((fm.spr[0] + fm.spr[1]) / 2 * fm.P.TRACK.SPROCKET_R), lf = v / fm.P.TRACK.PITCH;
    const onGround = fm.load[0] + fm.load[1] > 0.2 * fm.mass * 9.81 ? 1 : 0.2;
    sp(this.clk.frequency, Math.max(0.5, lf)); sp(this.clkD.gain, onGround * Math.min(0.5, v * 0.06)); sp(this.clkN.frequency, 1100 + v * 30);
    sp(this.clk2.frequency, Math.max(0.5, lf * 0.5 + 0.3)); sp(this.clk2D.gain, onGround * Math.min(0.3, v * 0.03));
    const turn = Math.abs(fm.out.yawRate), slipLat = Math.min(1, turn * (v + 1) * 0.3);
    sp(this.sqG.gain, onGround * slipLat * 0.05 + (v > 0.5 && v < 6 ? 0.006 : 0)); sp(this.sqLfoG.gain, 300 * slipLat); sp(this.sq.frequency, 2800 + v * 40);
    sp(this.rumG.gain, Math.min(0.3, v * 0.025) * onGround * (inside ? 1.6 : 1));
    const vg = Math.abs(fm.out.fwd); sp(this.brkG.gain, (fm.ctl.brake || 0) > 0.2 && vg > 0.3 && vg < 6 ? 0.018 * (1 - vg / 6) : 0, 0.04);
    sp(this.watG.gain, fm.water.depth > 0.3 ? Math.min(0.25, 0.04 + v * 0.06) : 0); sp(this.windG.gain, inside ? 0 : Math.min(0.06, (fm.out.speed / 20) ** 2 * 0.06));
    // turret hydraulics (M60)
    if (m60 && V.hydP != null) {
      const tr = Math.abs(V.azRate || 0) + Math.abs(V.elRate || 0) * 2;
      sp(this.hydG.gain, V.hydP * (inside ? 0.03 : 0.008)); sp(this.hyd.frequency, 380 + 30 * V.hydP);
      sp(this.srv.frequency, 900 + tr * 1800); sp(this.srvG.gain, Math.min(0.05, tr * 0.12) * (inside ? 1 : 0.3));
      sp(this.hissG.gain, Math.min(0.04, tr * 0.1) * V.hydP * (inside ? 1 : 0.2));
      const gy = V.gyro ?? 0; sp(this.gyr.frequency, 120 + 1500 * gy); sp(this.gyrG.gain, V.hydP > 0.5 ? (gy < 1 ? 0.012 + 0.01 * gy : 0.004) * (inside ? 1 : 0.15) : 0, 0.3);
    } else { sp(this.hydG.gain, 0); sp(this.srvG.gain, 0); sp(this.hissG.gain, 0); }
    // inside: the hull filters the highs; outside: distance from the camera
    sp(this.muff.frequency, inside ? 1100 : 16000, 0.1);
    let g = 0.6; if (!inside && o.cam) { const p = fm.pos, d = Math.hypot(p[0] - o.cam.x, p[1] - o.cam.y, p[2] - o.cam.z); g = 0.6 * Math.min(1, 12 / Math.max(6, d)); }
    sp(this.out.gain, g, 0.1); this.inside = inside;
  }
  // one-shot helpers
  burst(f0, f1, dur, vol, type = 'bandpass', q = 0.8, delay = 0, dest = null) {
    if (!this.built) return; const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(f0, f1, dur, vol, type = 'sine', delay = 0) {
    if (!this.built) return; const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(15, f1), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  }
  clang(f, vol, delay = 0) { this.tone(f, f * 0.98, 0.35, vol, 'triangle', delay); this.tone(f * 2.76, f * 2.7, 0.2, vol * 0.5, 'sine', delay); this.burst(4000, 2000, 0.05, vol * 0.6, 'highpass', 0.7, delay); }
  mainGun() {
    if (!this.built) return;
    const ins = this.inside;
    this.burst(ins ? 900 : 3000, 60, 1.6, ins ? 0.9 : 1.0, 'lowpass', 0.5);          // the blast
    this.tone(70, 28, 0.9, ins ? 0.9 : 0.6, 'sine');                                     // the pressure thump
    this.burst(6000, 1500, 0.08, ins ? 0.2 : 0.6, 'highpass', 0.7);                      // the crack
    this.burst(400, 80, 3.0, 0.25, 'lowpass', 0.4, 0.15);                                // rolling echo
    if (ins) { this.clang(420, 0.25, 0.35); this.clang(260, 0.3, 0.75); this.clang(310, 0.18, 0.95); }   // breech opens, the case drops and rolls
  }
  mg(weapon) {
    if (!this.built) return;
    const big = weapon === 'mg50', ins = this.inside;
    this.burst(big ? 1800 : 2600, big ? 200 : 400, big ? 0.13 : 0.08, (big ? 0.35 : 0.22) * (ins ? (weapon === 'coax' ? 0.8 : 0.5) : 1), 'bandpass', 0.6);
    this.tone(big ? 110 : 160, big ? 50 : 80, big ? 0.08 : 0.05, big ? 0.2 : 0.1, 'sine');
  }
  // a switch thrown in the station (relay: a heavier clunk - the MASTER relay, turret power contactor)
  click(relay = false) { if (!this.built) return; this.burst(5200, 2600, 0.025, 0.22, 'bandpass', 2); if (relay) { this.tone(140, 90, 0.08, 0.2, 'square', 0.02); this.burst(700, 200, 0.12, 0.25, 'lowpass', 1, 0.02); } }
  // a hatch: the latch and spring as it lifts, the slam on its stop as it shuts (louder when it is your own)
  hatch(shut, mine = true) { if (!this.built) return; const v = mine ? 1 : 0.4; if (shut) { this.clang(180, 0.35 * v); this.burst(900, 120, 0.25, 0.45 * v, 'lowpass', 0.8); } else { this.burst(2200, 600, 0.08, 0.2 * v, 'bandpass', 1.5); this.clang(330, 0.12 * v, 0.05); } }
  loaded() { if (this.inside) { this.clang(520, 0.2); this.burst(900, 300, 0.12, 0.25, 'bandpass', 1, 0.05); } }
  impact(big, dist = 100) {
    if (!this.built) return; const d = Math.max(0, dist), delay = Math.min(6, d / 343), att = Math.min(1, 80 / Math.max(80, d));
    if (big) { this.burst(1600 * att + 200, 60, 1.4, 0.7 * att, 'lowpass', 0.5, delay); this.tone(55, 30, 0.6, 0.4 * att, 'sine', delay); }
    else this.burst(2500, 800, 0.05, 0.12 * att, 'bandpass', 0.8, delay);
  }
}
