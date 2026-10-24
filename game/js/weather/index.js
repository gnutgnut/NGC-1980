// WEATHER: the weather system's host side (THREE). main.js creates it once (createWeather) and calls
// weather.update() every frame after the camera is placed; everything else hangs off it:
//   state.js     the weather and its blends, the drift, wind and gusts, lightning timing (pure; weatherbench.mjs)
//   fogshader.js one fog for everything (radial, exponential, sea mist, aerial perspective, wet surfaces, LOD dither)
//   vis.js       how far the camera sees: draw distance, weather visibility, cloud, and what is loaded round it
//   sky.js       the sky dome and the cloud layer you can fly into
//   rain.js      rain / drizzle streaks round the camera, splashes on the ground, decks and the sea
//   glass.js     rain on canopies and windscreens, wipers
//   storm.js     lightning bolts, flashes, thunder after the light; rain, wind and thunder sound
//   trees.js     tree level of detail (near trees in full, cones further out, the forest canopy beyond)
// It feeds the wind to the sims that take one (fx smoke and the windsocks, the para-drop and its C-130), drags the
// sea into the weather's range (a storm raises it, sea fog needs a calm), and lights the world (sun, sky light).
import * as THREE from 'three';
import { createWeatherState, WX, WX_NAMES, WX_LABEL } from './state.js';
import { WXF } from './fogshader.js';
import { createVis } from './vis.js';
import { createSky, cloudDen } from './sky.js';
import { retuneSea } from '../units/naval/seamotion.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function createWeather(ctx) {
  const { scene, sun, war, fx } = ctx;
  const hemi = scene.children.find(o => o.isHemisphereLight);
  const sun0 = sun.intensity, hemi0 = hemi ? hemi.intensity : 0;
  const st = createWeatherState(ctx.initial || 'clear', 1980);
  const vis = createVis();
  const sky = createSky(ctx.sky, scene);
  const sunDir = new THREE.Vector3().copy(sun.position).normalize();
  const wind = { x: 0, z: 0 };
  const W = {
    st, vis, sky, names: WX_NAMES, labels: WX_LABEL, wind, flash: 0, cloudOff: [0, 0], inCloud: 0, playerSea: null, parts: [],
    set(name, secs) { const ok = st.set(name, secs ?? undefined); if (ok && ctx.onSet) ctx.onSet(name); return ok; },
    setDrift(on) { st.setDrift(on); },
    get name() { return st.name; }, get label() { return WX_LABEL[st.name]; }, get p() { return st.p; },
    // a part (rain, glass, storm, trees) plugged in: { update(dt, cam, W) }
    add(part) { W.parts.push(part); return part; },
    update(dt, cam, o = {}) {
      const sea = war && war.sea;
      const ev = st.step(dt, { seaSS: sea ? sea.ss : 3, seaDir: sea ? sea.dir : 0 });
      if (ev && ctx.feed) ctx.feed(ev.msg);
      const p = st.p;
      // the sea agrees with the sky: pulled into the weather's sea-state range at a few minutes per state
      if (sea && war.weather && dt > 0) {
        const lo = st.to.sea[0], hi = st.to.sea[1], s = sea.ss, want = clamp(s, lo, hi);
        if (Math.abs(want - s) > 1e-4) {
          const ns = s + clamp(want - s, -dt / 45, dt / 45); retuneSea(sea, ns, sea.dir);
          const sw = war.weather; sw.cur = ns; sw.target = clamp(sw.target, lo, hi); sw.base = clamp(sw.base, lo, hi);
        }
      }
      st.wind(wind);
      if (fx && fx.wind) { fx.windHold = true; fx.wind.set(wind.x, wind.z); }   // smoke, dust, the windsocks (fx.js reads fx.windHold)
      W.cloudOff[0] += wind.x * 1.6 * dt; W.cloudOff[1] += wind.z * 1.6 * dt;   // the clouds go with the wind (a bit faster: the wind aloft)
      // where the camera is in the cloud layer
      const c = cam.position, base = p.base, top = p.base + p.thick;
      const edge = smooth(0, 30, c.y - base) * smooth(0, 30, top - c.y);
      W.inCloud = edge > 0 ? edge * clamp(cloudDen(c.x, c.z, W.cloudOff[0], W.cloudOff[1], p.cover) * 1.4, 0, 1) : 0;
      // lightning (storm.js turns flash on and fades it)
      W.flash = Math.max(0, W.flash - dt * 6);
      for (const q of W.parts) q.update(dt, cam, W, o);
      // light: the sun dims under cloud and in rain, the sky light greys; a flash lights everything for a moment
      const sunK = p.sun;
      sun.intensity = sun0 * lerp(0.18, 1, sunK) * (1 - 0.3 * p.dark) + W.flash * 1.5;
      if (hemi) { hemi.intensity = hemi0 * lerp(1.12, 1, sunK) * (1 - 0.42 * p.dark) + W.flash * 1.2; }
      // the fog
      const draw = o.draw ?? 250;
      const far = vis.update(dt, cam, { draw, vis: p.vis, haze: p.haze, inCloud: W.inCloud, cloudVis: 38, under: !!o.under });
      const hz = p.sky;
      WXF.set([hz[0], hz[1], hz[2], 0.9 * p.sun], 4);
      WXF.set([sunDir.x, sunDir.y, sunDir.z, p.mist * 0.026], 8);
      WXF.set([p.zen[0], p.zen[1], p.zen[2], o.dry ? 0 : st.wet], 12);
      WXF[16] = (WXF[16] + dt) % 4096; WXF[17] = W.flash; WXF[18] = p.mist > 0.01 ? 0.75 : 0; WXF[19] = p.mistH;
      WXF.set([wind.x, wind.z, p.rain, p.cover], 20);
      WXF.set([base, top, p.vis, p.sun], 24);
      WXF.set([W.inCloud, p.dark, W.cloudOff[0], W.cloudOff[1]], 28);
      vis.applyThree(scene.fog, hz);
      sky.update(cam, p.cover, base, top, draw);
      return far;
    },
  };
  // under water sealife.js swaps the scene's fog for the water's in scene.onBeforeRender: the fog chunk then uses it
  // (wxF[0].w = 1) instead of the air's
  const prevBR = scene.onBeforeRender && scene.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender ? scene.onBeforeRender : null;
  scene.onBeforeRender = function (r, s, c) { if (prevBR) prevBR.call(this, r, s, c); if (ctx.terrainUni && ctx.terrainUni.uSeaK.value.x > 0.5) WXF[3] = 1; };
  if (ctx.params && ctx.params.has('wx')) st.set(ctx.params.get('wx'), 0);   // ?wx=storm: a weather from the start (tests)
  return W;
}
