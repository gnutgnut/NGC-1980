// Sound of four Allison T56s turning Hamilton Standard 54H60s, synthesised (WebAudio, audio.js style, no samples).
// - Prop beat: blade passage 4 x 1,021 rpm / 60 = 68 Hz at 100 %, a rich periodic wave per propeller whose upper
//   harmonics grow with blade loading (torque). The four props run a hair apart (the synchrophaser holds them within
//   ~0.1 %), so their fundamentals beat against each other: the slow "wow-wow" throb you hear under a Herc.
// - Turbine: the T56's compressor / turbine whine (shaft 13,820 rpm = 230 Hz; a band-passed saw high up, plus the
//   characteristic ~1 kHz howl), pitch with each engine's rpm; starts and shut-downs are audible.
// - Exhaust roar (band-passed noise) with shaft power, wind with airspeed.
// - Inside (flight deck): muffled through the insulation, the beat and the low drone dominate. Outside: distance falls
//   off (and the highs go first, air absorption), Doppler on a fly-by, and a stopped prop is silent.
// Gains fall to zero by themselves if update() stops being called (pause menu, the aircraft gone).
// API: createC130Audio(sfx) -> { update(o), stop() }, o = { eng: [{ N, shp, torque, run }] x4, tas (world m/s),
//   inside, dist (m to the listener), vr (m/s, + = coming closer), level (0..1 master) }
export function createC130Audio(sfx) {
  let A = null;
  const DET = [-0.12, 0.05, -0.03, 0.1];   // per-prop detune (Hz at 68 Hz): the synchrophaser's slack
  function init() {
    const c = sfx && sfx.ctx; if (!c || A || !sfx.noise) return;
    const out = c.createGain(); out.gain.value = 0;
    const air = c.createBiquadFilter(); air.type = 'lowpass'; air.frequency.value = 18000;   // distance / insulation
    air.connect(out); out.connect(sfx.master);
    const noise = (type, f, q) => { const s = c.createBufferSource(); s.buffer = sfx.noise; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q; s.connect(fl); s.start(0, Math.random() * 1.5); return fl; };
    // blade-passage wave: strong fundamental and 2nd, a buzzy tail of harmonics
    const N = 24, re = new Float32Array(N), im = new Float32Array(N);
    for (let k = 1; k < N; k++) im[k] = (k === 1 ? 1 : k === 2 ? 0.55 : 0.5 / Math.pow(k, 1.05)) * (k % 4 === 0 ? 1.3 : 1);
    const wave = c.createPeriodicWave(re, im);
    const props = [], turb = [];
    const propBus = c.createGain(); propBus.gain.value = 1;
    const propLP = c.createBiquadFilter(); propLP.type = 'lowpass'; propLP.frequency.value = 700; propLP.Q.value = 0.7;
    propBus.connect(propLP); propLP.connect(air);
    for (let k = 0; k < 4; k++) {
      // each engine on its own stereo position: on the flight deck #1 and #2 are on the pilot's left
      const pan = c.createStereoPanner ? c.createStereoPanner() : c.createGain(); if (pan.pan) pan.pan.value = [-0.8, -0.4, 0.4, 0.8][k]; pan.connect(propBus);
      const tpan = c.createStereoPanner ? c.createStereoPanner() : c.createGain(); if (tpan.pan) tpan.pan.value = [-0.8, -0.4, 0.4, 0.8][k]; tpan.connect(air);
      const o = c.createOscillator(); o.setPeriodicWave(wave); o.frequency.value = 68; const g = c.createGain(); g.gain.value = 0; o.connect(g); g.connect(pan); o.start();
      // turbine: a saw through a narrow band-pass high up, and the howl
      const w = c.createOscillator(); w.type = 'sawtooth'; w.frequency.value = 230; const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.Q.value = 7; wf.frequency.value = 3200;
      const wg = c.createGain(); wg.gain.value = 0; w.connect(wf); wf.connect(wg); wg.connect(tpan); w.start();
      const h = c.createOscillator(); h.type = 'triangle'; h.frequency.value = 1000; const hg = c.createGain(); hg.gain.value = 0; h.connect(hg); hg.connect(tpan); h.start();
      props.push({ o, g, pan }); turb.push({ w, wf, wg, h, hg, tpan });
    }
    const roarF = noise('bandpass', 420, 0.6), roar = c.createGain(); roar.gain.value = 0; roarF.connect(roar); roar.connect(air);
    const rumbleF = noise('lowpass', 90), rumble = c.createGain(); rumble.gain.value = 0; rumbleF.connect(rumble); rumble.connect(air);
    const windF = noise('highpass', 1200), wind = c.createGain(); wind.gain.value = 0; windF.connect(wind); wind.connect(out);
    // the GTC (APU) on the ground: a thin turbine scream with a hiss of bleed air
    const gtcO = c.createOscillator(); gtcO.type = 'sawtooth'; gtcO.frequency.value = 600; const gtcF = c.createBiquadFilter(); gtcF.type = 'bandpass'; gtcF.Q.value = 10; gtcF.frequency.value = 5200;
    const gtcG = c.createGain(); gtcG.gain.value = 0; gtcO.connect(gtcF); gtcF.connect(gtcG); gtcG.connect(air); gtcO.start();
    const hissF = noise('highpass', 3500), hiss = c.createGain(); hiss.gain.value = 0; hissF.connect(hiss); hiss.connect(air);
    A = { out, air, props, turb, roar, roarF, rumble, wind, windF, propLP, gtcO, gtcF, gtcG, hiss };
  }
  return {
    update(o) {
      init(); if (!A) return;
      const c = sfx.ctx, t = c.currentTime, sp = (p, v, k = 0.08) => p.setTargetAtTime(v, t, k);
      const inside = !!o.inside, d = Math.max(1, o.dist || 1), dop = 340 / Math.max(120, 340 - clamp(o.vr || 0, -150, 150));
      let loadSum = 0, powSum = 0;
      for (let k = 0; k < 4; k++) {
        const e = o.eng[k] || { N: 0, shp: 0, torque: 0 }, N = Math.max(0, e.N), P = A.props[k], T = A.turb[k];
        // the synchrophaser holds the props within a fraction of a percent but hunts slowly: the beat comes and goes
        const load = Math.max(0, e.torque || 0) / 19600, f0 = (68 * N + (DET[k] + 0.07 * Math.sin(t * 0.31 + k * 1.7)) * N) * dop;
        const flat = e.beta !== undefined && e.beta < 23 && N > 0.5 ? 1 + (23 - e.beta) / 18 : 1;   // flat pitch on the ground: the famous buzz-saw
        if (P.pan.pan) sp(P.pan.pan, o.pans ? o.pans[k] : [-0.8, -0.4, 0.4, 0.8][k] * (inside ? 1 : 0.3), 0.1);
        if (T.tpan.pan) sp(T.tpan.pan, o.pans ? o.pans[k] : [-0.8, -0.4, 0.4, 0.8][k] * (inside ? 1 : 0.3), 0.1);
        loadSum += load; powSum += (e.shp || 0) / 4591;
        sp(P.o.frequency, Math.max(1, f0), 0.05);
        // the beat gets louder and buzzier with blade loading; a windmilling or feathered prop barely speaks
        sp(P.g.gain, Math.min(1, N * 1.2) ** 2 * (0.05 + 0.12 * Math.min(1.2, load + 0.15)) * flat * (inside ? 1.3 : 1));
        sp(T.w.frequency, (120 + 110 * N) * dop, 0.1); sp(T.wf.frequency, (900 + 2900 * N) * dop, 0.1);
        sp(T.wg.gain, Math.min(1, N * 1.5) * (inside ? 0.006 : 0.022) * (e.run ? 1 : 0.5));
        sp(T.h.frequency, (500 + 560 * N) * dop, 0.1); sp(T.hg.gain, Math.min(1, N * 1.3) * (inside ? 0.004 : 0.012));
      }
      const gN = o.gtc || 0; sp(A.gtcO.frequency, 120 + 560 * gN); sp(A.gtcF.frequency, 1200 + 4200 * gN); sp(A.gtcG.gain, gN * (inside ? 0.01 : 0.03)); sp(A.hiss.gain, gN > 0.95 && o.bleed ? (inside ? 0.01 : 0.025) : 0);
      sp(A.propLP.frequency, (inside ? 380 : 900) + 500 * Math.min(1, loadSum / 4));
      sp(A.roar.gain, Math.min(1, powSum / 4 + 0.1 * loadSum / 4) * (inside ? 0.05 : 0.16)); sp(A.roarF.frequency, 280 + 400 * Math.min(1, powSum / 4));
      sp(A.rumble.gain, Math.min(1, loadSum / 4 + 0.2) * (inside ? 0.25 : 0.12) * (powSum > 0.02 ? 1 : 0.3));
      const spd = Math.max(0, o.tas || 0) * 2;   // real-equivalent airspeed
      sp(A.wind.gain, Math.min(0.14, (spd / 160) ** 2 * 0.12) * (inside ? 0.6 : 1)); sp(A.windF.frequency, 700 + spd * 6);
      // listener: inside = the insulated flight deck; outside = distance (the highs go first)
      const lvl = (o.level ?? 1) * (inside ? 0.85 : Math.min(1, Math.pow(90 / d, 1.15)));
      sp(A.air.frequency, inside ? 1500 : clamp(16000 * Math.exp(-d / 700), 350, 16000), 0.1);
      A.out.gain.cancelScheduledValues(t); A.out.gain.setTargetAtTime(lvl, t, 0.06); A.out.gain.setTargetAtTime(0, t + 0.4, 0.15);   // watchdog
    },
    state() { return A ? { freq: A.props.map(p => p.o.frequency.value), gain: A.props.map(p => p.g.gain.value), out: A.out.gain.value } : null; },
    stop() { if (A) { const t = sfx.ctx.currentTime; A.out.gain.cancelScheduledValues(t); A.out.gain.setTargetAtTime(0, t, 0.1); } },
  };
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
