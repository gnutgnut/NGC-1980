// The player's F-14A TOMCAT, heard (WebAudio, synthesised on the game's Sfx bus like audio.js; no samples):
// - two TF30-P-412A: a deep roar (the TF30 is a low, rumbling engine next to the F404's hiss), each engine's own
//   turbine whine (two detuned saws that beat when the rpm splits), the "howl" of the big fan at mid power;
//   afterburner rumble with a thump for each zone as it lights (five zones, the TF30's staged light-off);
// - the deck's air start cart (the "huffer") spinning a starter up, the light-off whoomp;
// - the compressor stall: a bang like a shotgun, then the chug of a surging engine until it clears;
// - wind with airspeed, all of it muffled in the cockpit (less with the canopy open);
// - 1980 warnings are TONES AND LIGHTS, not a voice (the F-14A had no voice warning system):
//     radar altimeter ALT LOW: a warbling tone (APN-194 low-altitude warning), the WHEELS light flashing has no tone;
//     FIRE: a steady pulsed tone with the FIRE light; MASTER CAUTION: a short two-note chime when a new caution lights;
//     ALR-45 radar warning receiver: a fast high warble when a missile is in the air at you;
//     the stall warning is the rudder pedal shaker: felt (and heard) as a low buzz through the airframe.
export function createTomcatSound(sfx) {
  let ready = false, N = null, lastZone = [0, 0];
  function init() {
    if (ready || !sfx.ctx) return ready; const c = sfx.ctx;
    const noise = (type, f, q) => { const s = c.createBufferSource(); s.buffer = sfx.noise; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q; s.connect(fl); s.start(0, Math.random()); return fl; };
    const gain = (src, v = 0) => { const g = c.createGain(); g.gain.value = v; src.connect(g); return g; };
    const osc = (type, f) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
    N = {};
    N.muff = c.createBiquadFilter(); N.muff.type = 'lowpass'; N.muff.frequency.value = 18000;
    N.out = c.createGain(); N.out.gain.value = 0; N.muff.connect(N.out); N.out.connect(sfx.master);
    N.roarF = noise('bandpass', 260, 0.6); N.roar = gain(N.roarF); N.roar.connect(N.muff);
    N.lowF = noise('lowpass', 90); N.low = gain(N.lowF); N.low.connect(N.muff);
    N.abF = noise('lowpass', 150); N.ab = gain(N.abF); N.ab.connect(N.muff);
    N.abCrF = noise('bandpass', 900, 1.2); N.abCr = gain(N.abCrF); N.abCr.connect(N.muff);   // AB crackle
    N.windF = noise('highpass', 900); N.wind = gain(N.windF); N.wind.connect(N.muff);
    N.wh = [0, 1].map(() => { const o = osc('sawtooth', 300), f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 10; o.connect(f); const g = gain(f); g.connect(N.muff); return { o, f, g }; });
    N.howl = osc('sine', 140); N.howlG = gain(N.howl); N.howlG.connect(N.muff);
    // the huffer and starter
    N.hufF = noise('bandpass', 1400, 2); N.huf = gain(N.hufF); N.huf.connect(N.muff);
    N.st = osc('sawtooth', 600); N.stF = c.createBiquadFilter(); N.stF.type = 'bandpass'; N.stF.Q.value = 6; N.st.connect(N.stF); N.stG = gain(N.stF); N.stG.connect(N.muff);
    // surge chug (a stalled engine): noise gated by a ~6 Hz pulse
    N.chugF = noise('lowpass', 300); N.chug = gain(N.chugF); N.chug.connect(N.muff);
    N.chugL = osc('square', 6); N.chugD = gain(N.chugL); N.chugD.connect(N.chug.gain);
    // pedal shaker (stall warning): a low buzz
    N.shk = osc('square', 28); N.shkF = c.createBiquadFilter(); N.shkF.type = 'lowpass'; N.shkF.frequency.value = 120; N.shk.connect(N.shkF); N.shkG = gain(N.shkF); N.shkG.connect(sfx.master);
    // warning tones straight into the headset (not muffled)
    N.tone = osc('square', 1000); N.toneF = c.createBiquadFilter(); N.toneF.type = 'lowpass'; N.toneF.frequency.value = 2500; N.tone.connect(N.toneF); N.toneG = gain(N.toneF); N.toneG.connect(sfx.master);
    N.rwr = osc('triangle', 1800); N.rwrG = gain(N.rwr); N.rwrG.connect(sfx.master);
    ready = true; return ready;
  }
  const S = {
    // o: { n:[2], ab:[2], tas, inside, canopy 0..1, on 0..1, start:[2] (cranking), stalled:[2], shaker 0..1,
    //      lowAlt, fire, rwr 0 | 1 (search / lock) | 2 (missile launch) }
    update(o) {
      if (!init()) return; const c = sfx.ctx, t = c.currentTime, sp = (p, v, k = 0.08) => p.setTargetAtTime(v, t, k), on = o.on;
      const n = (o.n[0] + o.n[1]) / 2, run = Math.max(0, (n - 0.2) / 0.85), ab = Math.max(o.ab[0], o.ab[1]);
      sp(N.out.gain, on, 0.1);
      sp(N.roar.gain, 0.04 + 0.3 * run * run); sp(N.roarF.frequency, 200 + 700 * run);
      sp(N.low.gain, 0.08 * run + 0.35 * ab); sp(N.ab.gain, 0.5 * ab); sp(N.abCr.gain, 0.06 * ab * (0.6 + 0.4 * Math.random()));
      sp(N.wind.gain, Math.min(0.3, (o.tas / 180) ** 2 * 0.3) * (o.inside ? 0.8 + o.canopy : 1)); sp(N.windF.frequency, 700 + o.tas * 6);
      for (let k = 0; k < 2; k++) { const e = o.n[k], w = N.wh[k]; sp(w.o.frequency, 180 + 820 * e + k * 3); sp(w.f.frequency, 1000 + 2600 * e); sp(w.g.gain, 0.04 * Math.min(1, e * 1.6) * (o.inside ? 1.4 : 0.8)); }
      sp(N.howl.frequency, 90 + 140 * n); sp(N.howlG.gain, 0.03 * Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (n - 0.6) / 0.4)))));
      const crank = o.start[0] || o.start[1];
      sp(N.huf.gain, crank ? 0.06 : o.cart ? 0.022 : 0, 0.3);   // the huffer: idling beside a cold jet, roaring as it cranks one sp(N.stG.gain, crank ? 0.05 : 0, 0.2); sp(N.st.frequency, 400 + 3200 * Math.min(0.35, n) / 0.35);
      const st = o.stalled[0] || o.stalled[1]; sp(N.chug.gain, st ? 0.12 : 0, 0.05); sp(N.chugD.gain, st ? 0.12 : 0, 0.05);   // 0..0.24, pulsing
      sp(N.shkG.gain, 0.08 * o.shaker * on, 0.03);
      sp(N.muff.frequency, o.inside ? 1300 + 4000 * o.canopy : 18000);
      // warning tones (the cockpit only: on = player's aircraft)
      const ph = t % 1;
      let tone = 0, f = 1000;
      if (o.fire) { tone = (t % 0.6) < 0.4 ? 0.05 : 0; f = 800; }
      else if (o.lowAlt) { tone = 0.045; f = (t % 0.25) < 0.125 ? 1050 : 820; }
      sp(N.toneG.gain, on >= 0.99 ? tone : 0, 0.01); sp(N.tone.frequency, f, 0.005);
      const rw = o.rwr === 2 ? 0.05 : o.rwr === 1 ? ((t % 1.2) < 0.15 ? 0.03 : 0) : 0;
      sp(N.rwrG.gain, on >= 0.99 ? rw : 0, 0.01); sp(N.rwr.frequency, o.rwr === 2 ? 1700 + 900 * Math.abs(Math.sin(t * 30)) : 1200, 0.005);
      // afterburner zones lighting: a thump per zone (0.2 steps)
      for (let k = 0; k < 2; k++) { const z = Math.floor(o.ab[k] * 5 + 0.2); if (z > lastZone[k] && on > 0.05) sfx.noiseBurst?.(260, 60, 0.18, 0.1 * on * (o.inside ? 0.6 : 1)); lastZone[k] = z; }
      void ph;
    },
    bang(v = 1) { if (!sfx.ctx) return; sfx.boom?.(0.9 * v); sfx.noiseBurst?.(2600, 180, 0.12, 0.5 * v); },   // compressor stall
    lightoff() { sfx.noiseBurst?.(400, 80, 0.5, 0.25); },
    // cockpit controls moving (synthesised clicks): a toggle's snap, a push-button's tick, a handle's clunk, a lever over
    // its detent, a guard flipping, the ENG CRANK switch's solenoid (in, and thumping out at 50%), the thumb switches
    click(kind = 'toggle') {
      if (!sfx.ctx) return; const nb = (...a) => sfx.noiseBurst?.(...a), bl = (...a) => sfx.blip?.(...a);
      if (kind === 'toggle') { nb(4200, 2400, 0.025, 0.22); bl(1900, 900, 0.015, 'square', 0.03); }
      else if (kind === 'button') { nb(2600, 1700, 0.02, 0.13); bl(1300, 1100, 0.012, 'square', 0.02); }
      else if (kind === 'handle') { nb(700, 180, 0.13, 0.32); bl(180, 80, 0.09, 'sine', 0.14); }
      else if (kind === 'lever') { nb(1300, 380, 0.08, 0.22); bl(260, 160, 0.05, 'triangle', 0.06); }
      else if (kind === 'guard') { nb(3200, 1500, 0.03, 0.2); setTimeout(() => nb(900, 300, 0.06, 0.18), 70); }
      else if (kind === 'crank') { nb(950, 280, 0.07, 0.22); bl(140, 70, 0.1, 'square', 0.07); }
      else if (kind === 'thumb') { nb(3600, 2600, 0.015, 0.1); }
    },
    chime() { sfx.blip?.(880, 870, 0.18, 'sine', 0.07); setTimeout(() => sfx.blip?.(660, 650, 0.25, 'sine', 0.07), 190); },
    silence() { if (ready) { const t = sfx.ctx.currentTime; for (const g of [N.out.gain, N.shkG.gain, N.toneG.gain, N.rwrG.gain]) g.setTargetAtTime(0, t, 0.03); } },
  };
  return S;
}
