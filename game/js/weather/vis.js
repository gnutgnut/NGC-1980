// WEATHER: the visibility controller - how far the camera sees this frame, and the fog that ends it.
//
// The rule (user request: "make the fog cover it until it's fully loaded, for seamless LOD"): the fog is fully
// opaque (fogshader.js reaches 1 exactly at `far`) at or before
//   - the draw distance (view.draw: the zone's 250 m, 600 m in the wild lands, the jet's 1.1-2.6 km),
//   - the weather's visibility (rain, a storm, the inside of a cloud; sea mist is a height fog on top of this),
//   - the edge of what is LOADED round the camera: each streaming source reports a radius inside which everything is
//     in place (the terrain heightmap windows, the world chunks, the forest), and the fog pulls in to the smallest.
// Pulling in is immediate (a teleport, a unit switch, a jet outrunning the chunk worker: the content is not there, so
// the fog must already be); easing out is gentle (about two seconds), so the view opens up as the world arrives.
// Level-of-detail switches that happen inside the view crossfade (lodFade in fogshader.js), so no level pops even
// in light haze. vis.stats records each frame's numbers for tests (scenes/lodfog.mjs).
import * as THREE from 'three';
import { WXF } from './fogshader.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const _lin = new THREE.Color();

export function createVis() {
  const V = {
    far: 250, near: 125, k: 1, sources: [], minFar: 22,
    stats: { far: 250, want: 250, ready: Infinity, readyBy: '', draw: 250, vis: 0, cloud: 0, pulledIn: 0 },
    // a streaming source: fn(x, y, z) -> radius (m) round the camera inside which it is complete (Infinity: all there)
    addSource(name, fn) { V.sources.push({ name, fn }); },
    readyR(x, y, z) {
      let r = Infinity, by = '';
      for (const s of V.sources) { let v; try { v = s.fn(x, y, z); } catch (e) { v = Infinity; } if (v < r) { r = v; by = s.name; } }
      V.stats.readyBy = by; return r;
    },
    // p: { draw, vis (m), haze 0..1, inCloud 0..1, cloudVis (m), under (sealife underwater) }
    update(dt, cam, p) {
      const c = cam.position, ready = V.readyR(c.x, c.y, c.z);
      let want = Math.min(p.draw, p.vis);
      if (p.inCloud > 0) want = Math.min(want, lerp(want, p.cloudVis, p.inCloud));
      const loaded = Math.max(V.minFar, ready * 0.97);
      if (loaded < want) { want = loaded; V.stats.pulledIn++; }
      want = Math.max(V.minFar, want);
      if (want < V.far || !(V.far > 0)) V.far = want;                       // in: at once
      else V.far = Math.min(want, V.far + (want - V.far) * (1 - Math.exp(-dt / 0.7)) + dt * 4);   // out: eased
      V.far = Math.min(V.far, p.draw);
      // the haze: thicker weather starts the fog nearer and bends the curve (k)
      const hz = clamp(p.haze, 0, 1);
      V.near = V.far * lerp(0.5, 0.0, Math.sqrt(hz));
      V.k = lerp(0.35, 3.0, hz);
      WXF[0] = V.near; WXF[1] = V.far; WXF[2] = V.k; WXF[3] = p.under ? 1 : 0;
      Object.assign(V.stats, { far: V.far, want, ready, draw: p.draw, vis: p.vis, cloud: p.inCloud });
      return V.far;
    },
    // three's own fog object (fx particles and any material that still reads it): the same numbers; colour in linear
    applyThree(fog, horizon) {
      _lin.setRGB(horizon[0], horizon[1], horizon[2]).convertSRGBToLinear();
      fog.color.copy(_lin); fog.near = V.near; fog.far = V.far; fog.k = V.k;   // (fog.k: fx.js particles use the same curve)
    },
  };
  return V;
}
