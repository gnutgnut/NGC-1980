// rotorsound.js - synthesized voices for the AI rotorcraft (WebAudio, audio.js style: no samples). A small pool per
// type; every frame the nearest aircraft of each type get the voices, with distance falloff (like the war's other
// sounds) and Doppler on the tonal parts.
//   CH-46: two 3-blade rotors at 264 rpm = 13.2 Hz blade passage each, counter-rotating and a hair apart in phase and
//          rate: the tandem's double "whop-whop" that beats; a low rotor drone; two T58 whines and the high,
//          singing whine of the combining / aft transmissions. Descending slowly the blades cut the tip vortices of
//          the blade ahead (blade-vortex interaction): the slap goes sharp and loud - the classic approach crack.
//   MV-22: two big 3-blade proprotors at 412 rpm = 20.6 Hz (333 rpm = 16.7 Hz in airplane mode): a deep, buzzing
//          thrum that turns into a propeller drone as the nacelles come down; the AE1107 whine and a hot jet hiss
//          from the exhausts; a heavy, chesty throb in the hover under load; slap on a slow descent too.
//   WASP:  two counter-rotating 7-blade fans (~5400 rpm): a tone near 630 Hz and a second one detuned so they beat,
//          a slow, wavering formant over it (eerie), a sub hum, a breathy hiss that swells and fades out of step
//          with everything else (wrong for a machine), a slow pitch wander; a chirp when it acquires a target.
// API: createRotorSound(sfx) -> { update(list, ear, dt) } with list = [{ kind, x, y, z, vx, vy, vz, nr, load, nac }]
const VOICES = { ch46: 2, mv22: 2, wasp: 3 };
const C_SOUND = 340;

export function createRotorSound(sfx) {
  const R = { voices: null, t: 0 };
  function noise(c, type, f, q) { const s = c.createBufferSource(); s.buffer = sfx.noise; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q; s.connect(fl); s.start(0, Math.random() * 1.5); return { s, fl }; }
  function pulseWave(c, sharp = 0.13) { const N = 24, re = new Float32Array(N), im = new Float32Array(N); for (let k = 1; k < N; k++) re[k] = Math.exp(-k * sharp) * (k % 2 ? 1 : 0.85); return c.createPeriodicWave(re, im); }
  function build() {
    const c = sfx.ctx, out = c.createGain(); out.gain.value = 0.9; out.connect(sfx.master);
    R.voices = {};
    for (const kind of Object.keys(VOICES)) R.voices[kind] = Array.from({ length: VOICES[kind] }, () => voice(c, kind, out));
  }
  // one voice: a gain stage + the type's generators; set(p, k, dop) drives it
  function voice(c, kind, out) {
    const g = c.createGain(); g.gain.value = 0; g.connect(out);
    const V = { g, kind, set: null };
    if (kind === 'ch46' || kind === 'mv22') {
      const pw = pulseWave(c, kind === 'mv22' ? 0.2 : 0.13), slaps = [], thump = noise(c, 'lowpass', kind === 'mv22' ? 70 : 95);
      const thG = c.createGain(); thG.gain.value = 0; thump.fl.connect(thG); thG.connect(g);
      for (let i = 0; i < 2; i++) {   // two rotors: a noise band gated by the blade-passage pulse
        const n = noise(c, 'bandpass', kind === 'mv22' ? 140 : 240, kind === 'mv22' ? 0.9 : 1.1), sg = c.createGain(); sg.gain.value = 0;
        const o = c.createOscillator(); o.setPeriodicWave(pw); const d = c.createGain(); d.gain.value = 0; o.connect(d); d.connect(sg.gain); n.fl.connect(sg); sg.connect(g); o.start();
        const td = c.createGain(); td.gain.value = 0; o.connect(td); td.connect(thG.gain);
        slaps.push({ o, d, sg, n, td });
      }
      const wh = c.createOscillator(); wh.type = 'sawtooth'; const whF = c.createBiquadFilter(); whF.type = 'bandpass'; whF.Q.value = 8; const whG = c.createGain(); whG.gain.value = 0; wh.connect(whF); whF.connect(whG); whG.connect(g); wh.start();
      // the high whine: CH-46 transmissions (a singing ~3 kHz), MV-22 AE1107 turbines (+ a hiss of hot exhaust)
      const hi = c.createOscillator(); hi.type = 'sine'; const hiG = c.createGain(); hiG.gain.value = 0; hi.connect(hiG); hiG.connect(g); hi.start();
      const hiss = noise(c, 'highpass', kind === 'mv22' ? 2200 : 3500), hsG = c.createGain(); hsG.gain.value = 0; hiss.fl.connect(hsG); hsG.connect(g);
      const prop = c.createOscillator(); prop.type = 'sawtooth'; const prF = c.createBiquadFilter(); prF.type = 'lowpass'; prF.frequency.value = 260; const prG = c.createGain(); prG.gain.value = 0; prop.connect(prF); prF.connect(prG); prG.connect(g); prop.start();
      V.set = (p, k, dop, t) => {
        const sp = (a, v) => a.setTargetAtTime(v, t, 0.08), nr = Math.max(0, p.nr ?? 1), ld = Math.min(2, Math.max(0, p.load ?? 1));
        const gs = Math.hypot(p.vx || 0, p.vz || 0), bvi = Math.min(1, Math.max(0, -(p.vy || 0) / 2.5)) * Math.max(0, 1 - Math.abs(gs - 18) / 16) * nr;   // blade-vortex interaction
        const throb = kind === 'mv22' ? 0.8 * Math.max(0, Math.min(1, ((p.nac ?? 1.57) - 1.0) / 0.5)) : 0;   // the Osprey hover's chesty throb
        const bpf = (kind === 'mv22' ? 3 * 412 : 3 * 264) / 60 * nr * dop;
        slaps.forEach((s, i) => { sp(s.o.frequency, Math.max(0.5, bpf * (1 + i * 0.012))); const a = nr * nr * (0.09 + 0.12 * ld); sp(s.d.gain, a * (1 + 0.8 * bvi)); sp(s.td.gain, nr * 0.16 * (0.6 + 0.5 * ld) * (1 + throb)); sp(s.sg.gain, a * (0.25 + 0.5 * bvi)); sp(s.n.fl.frequency, (kind === 'mv22' ? 120 : 200) + 120 * Math.min(1, ld) + 500 * bvi); });
        sp(wh.frequency, (kind === 'mv22' ? 260 : 210) * (0.4 + 0.6 * nr) * dop); sp(whF.frequency, 2600 * (0.5 + 0.5 * nr) * dop); sp(whG.gain, 0.03 * nr);
        sp(hi.frequency, (kind === 'mv22' ? 2250 : 3050) * nr * dop); sp(hiG.gain, (kind === 'mv22' ? 0.008 : 0.014) * nr); sp(hsG.gain, (kind === 'mv22' ? 0.035 : 0.012) * nr * (0.6 + 0.4 * Math.min(1, ld)));
        // the Osprey's propeller drone as the nacelles come down (airplane mode: a fundamental near 16.7 Hz x harmonics)
        const am = kind === 'mv22' ? 1 - Math.min(1, (p.nac ?? 1.57) / 1.2) : 0; sp(prop.frequency, bpf * 2); sp(prG.gain, 0.12 * am * nr);
        sp(g.gain, k);
      };
    } else {   // WASP
      const f1 = c.createOscillator(), f2 = c.createOscillator(); f1.type = 'triangle'; f2.type = 'sawtooth';
      const fF = c.createBiquadFilter(); fF.type = 'bandpass'; fF.Q.value = 6; const fG = c.createGain(); fG.gain.value = 0;
      f1.connect(fF); f2.connect(fF); fF.connect(fG); fG.connect(g); f1.start(); f2.start();
      const form = noise(c, 'bandpass', 900, 12), foG = c.createGain(); foG.gain.value = 0; form.fl.connect(foG); foG.connect(g);   // the wavering formant
      const sub = c.createOscillator(); sub.type = 'sine'; const suG = c.createGain(); suG.gain.value = 0; sub.connect(suG); suG.connect(g); sub.start();
      const br = noise(c, 'highpass', 4200), brG = c.createGain(); brG.gain.value = 0; br.fl.connect(brG); brG.connect(g);
      const brL = c.createOscillator(); brL.frequency.value = 0.11 + Math.random() * 0.05; const brD = c.createGain(); brD.gain.value = 0; brL.connect(brD); brD.connect(brG.gain); brL.start();   // breathing
      const wan = c.createOscillator(); wan.frequency.value = 0.07 + Math.random() * 0.04; const wanG = c.createGain(); wanG.gain.value = 9; wan.connect(wanG); wanG.connect(f1.frequency); wanG.connect(f2.frequency); wan.start();   // pitch wander
      const lfo = c.createOscillator(); lfo.frequency.value = 0.23 + Math.random() * 0.1; const lfoG = c.createGain(); lfoG.gain.value = 260; lfo.connect(lfoG); lfoG.connect(form.fl.frequency); lfo.start();
      V.set = (p, k, dop, t) => {
        const sp = (a, v) => a.setTargetAtTime(v, t, 0.06), nr = Math.max(0, p.nr ?? 0.6), f = (380 + 300 * nr) * dop;
        sp(f1.frequency, f); sp(f2.frequency, f * 1.061); sp(fF.frequency, f * 1.5); sp(fG.gain, 0.05 * nr);
        sp(form.fl.frequency, 700 + 500 * nr); sp(foG.gain, 0.05 * nr); sp(sub.frequency, 48 + 20 * nr); sp(suG.gain, 0.08 * nr); sp(brG.gain, 0.012 * nr); sp(brD.gain, 0.012 * nr);
        sp(g.gain, k);
        if (p.chirp && t - (V.chirpT || 0) > 2) { V.chirpT = t; sfx.blip?.(2400 * dop, 3800 * dop, 0.12, 'sine', 0.05 * k); setTimeout(() => sfx.blip?.(3800 * dop, 2900 * dop, 0.1, 'sine', 0.04 * k), 130); }
      };
    }
    return V;
  }
  R.update = (list, ear, dt, range = 650) => {
    if (!sfx.ctx || !sfx.noise || sfx.ctx.state !== 'running') return;
    if (!R.voices) build();
    const t = sfx.ctx.currentTime;
    for (const kind of Object.keys(VOICES)) {
      const pool = R.voices[kind], near = [];
      for (const p of list) if (p.kind === kind) { p._d = Math.hypot(p.x - ear.x, p.y - ear.y, p.z - ear.z); if (p._d < range) near.push(p); }
      near.sort((a, b) => a._d - b._d);
      for (let i = 0; i < pool.length; i++) {
        const p = near[i], V = pool[i];
        if (!p) { V.g.gain.setTargetAtTime(0, t, 0.15); continue; }
        const k = (1 - p._d / range) ** 2 * (kind === 'wasp' ? 0.8 : 1);
        // Doppler: the closing speed along the line of sight
        const ux = (ear.x - p.x) / (p._d || 1), uy = (ear.y - p.y) / (p._d || 1), uz = (ear.z - p.z) / (p._d || 1), vr = (p.vx || 0) * ux + (p.vy || 0) * uy + (p.vz || 0) * uz;
        V.set(p, k, C_SOUND / Math.max(150, C_SOUND - vr), t);
      }
    }
  };
  return R;
}
