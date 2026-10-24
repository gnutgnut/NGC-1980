// WEATHER: one fog for the whole world - the terrain, every built-in material, the sky, the particles - so nothing
// shows through it differently and nothing appears out of it.
//
// What it replaces: three's linear fog worked on view DEPTH (-mv.z) in display space, the terrain shader on radial
// distance with the horizon colour passed as a LINEAR colour (so fogged land was a darker blue than fogged trees, and
// trees stood out of the fog as pale ghosts), and the sky had its own gradient. Now:
// - distance is RADIAL (the length of the view vector) everywhere, so the fog is opaque at the same distance at the
//   edge of the screen as in the middle, and every LOD / streaming radius can be checked against one number;
// - it is fully opaque at `far` (wxF[0].y) - the visibility controller (vis.js) keeps every level-of-detail switch and
//   every part of the world that is not loaded yet beyond it;
// - the curve is exponential (real haze: 1 - exp(-k t), normalised to reach 1 at far), so near things are crisp and
//   the haze thickens with distance;
// - height fog: sea mist lying on the water, an exponential layer (density m at sea level, scale height H) integrated
//   along the view ray in closed form, broken into banks by a slow noise;
// - aerial perspective: the fog colour depends on the view direction (brighter and warmer towards the sun, the sky's
//   own horizon colour elsewhere), and the sky dome uses the same function at the horizon, so fogged land meets the
//   sky without a seam;
// - wet surfaces (rain): built-in lit materials darken (more on upward faces) and pick up a Fresnel sheen of the sky.
// All of it is driven by one shared uniform array `wxF` (8 x vec4). The built-in materials get it by reference: the
// array is added to three's ShaderLib uniform sets (UniformsUtils.clone keeps typed arrays by reference), so the
// ShaderChunk replacements below see live values without touching any material.
import * as THREE from 'three';

// wxF layout (all colours in display space, like the fog itself)
//  0: near, far, curve k, under water (1: the old linear fog with three's fog uniforms, sealife's underwater fog)
//  1: horizon rgb, sun glow strength
//  2: sun direction xyz, mist density at sea level (1/m)
//  3: zenith rgb, wetness 0..1
//  4: time s, lightning flash 0..1, mist banks 0..1, mist scale height m
//  5: wind x, wind z (m/s), rain 0..1, cloud cover 0..1
//  6: cloud base m, cloud top m, visibility m (the sky's own haze), sun 0..1
//  7: in-cloud 0..1, darkness 0..1, cloud drift x, z (m: the wind carries the clouds)
export const WXF = new Float32Array(32);
export const WXU = { value: WXF };
WXF.set([125, 250, 1, 0, 0.75, 0.85, 0.95, 0.3, 0.45, 0.89, 0.27, 0, 0.22, 0.42, 0.85, 0, 0, 0, 0, 30, 1, 0.5, 0, 0.1, 1100, 1600, 40000, 1, 0, 0, 2.2, 0]);

export const WX_GLSL = `
uniform vec4 wxF[8];
float wxH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wxN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(wxH(i), wxH(i + vec2(1., 0.)), f.x), mix(wxH(i + vec2(0., 1.)), wxH(i + 1.), f.x), f.y); }
// the colour of the air looking along dir (unit, world): the horizon colour, lit towards the sun, a lightning flash
vec3 wxFogCol(vec3 dir){
  float s = max(dot(dir, wxF[2].xyz), 0.);
  vec3 c = wxF[1].rgb + vec3(1., .88, .68) * wxF[1].a * (pow(s, 5.) * .22 + pow(s, 32.) * .28);
  c = mix(c, c * vec3(.93, .96, 1.04), clamp(-dir.y * 2.5, 0., 1.) * (1. - wxF[7].y));   // looking down: a touch bluer
  return c + wxF[4].y * vec3(.5, .55, .7);
}
// how much fog between the camera and a point rel (world offset) away: opaque at far, plus the sea mist
float wxFogF(vec3 rel, vec3 wp){
  float d = length(rel), n = wxF[0].x, f = wxF[0].y, k = wxF[0].z;
  float t = clamp((d - n) / max(f - n, 1.), 0., 1.);
  float a = k > .01 ? (1. - exp(-k * t)) / (1. - exp(-k)) : t;
  if (wxF[2].w > 0.) {   // mist: rho(y) = m e^(-y/H), integrated along the ray from the camera's height
    float H = wxF[4].w, y0 = max(cameraPosition.y, 0.), dy = rel.y;
    float bank = 1. + wxF[4].z * (wxN(wp.xz * .0045 + wxF[4].x * vec2(.0011, .0007)) * 1.7 - .85);
    float m = wxF[2].w * max(bank, .08), e0 = exp(-y0 / H);
    float od = abs(dy) < .01 * d ? m * e0 * d : m * H * (e0 - exp(-max(y0 + dy, 0.) / H)) * d / dy;
    a = 1. - (1. - a) * exp(-max(od, 0.));
  }
  return a;
}
vec3 wxFog(vec3 c, vec3 wp){ vec3 rel = wp - cameraPosition; float d = max(length(rel), 1e-3); return mix(c, wxFogCol(rel / d), wxFogF(rel, wp)); }
// wet: darker, more so facing up, and a Fresnel sheen of the sky (n world normal, v unit view ray)
vec3 wxWet(vec3 c, vec3 n, vec3 v, float d){
  float w = wxF[3].w * smoothstep(2.2, 4.7, d); if (w <= 0.) return c;
  float up = clamp(n.y, 0., 1.);
  c *= 1. - w * (.12 + .26 * up);
  float fr = pow(1. - clamp(dot(-v, n), 0., 1.), 4.) * w * (.25 + .6 * up);
  return mix(c, wxFogCol(reflect(v, n)) * .9, fr * .7);
}
// LOD crossfade: a 4x4 ordered dither, the same threshold for both levels, so a pixel is drawn by exactly one of them
float wxB2(vec2 a){ return fract(a.x * .5 + a.y * a.y * .75); }
float wxBayer(vec2 fc){ vec2 p = floor(mod(fc, 4.)); return wxB2(floor(p * .5)) * .25 + wxB2(mod(p, 2.)) + .03125; }
`;

// ---------------------------------------------------------------------------------------------- built-in materials
const C = THREE.ShaderChunk;
C.fog_pars_vertex = `#ifdef USE_FOG
  varying vec3 vWxRel;
#endif`;
C.fog_vertex = `#ifdef USE_FOG
  vWxRel = mvPosition.xyz * mat3(viewMatrix);   // WEATHER: world offset from the camera (R^T times the view vector)
#endif`;
C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor; varying vec3 vWxRel; uniform float fogNear; uniform float fogFar;
  ${WX_GLSL}
#endif`;
C.fog_fragment = `#ifdef USE_FOG
  {
    float wxD = max(length(vWxRel), 1e-3);
    if (wxF[0].w > .5 || wxF[0].y <= 0.) gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(fogNear, fogFar, wxD));
    else {
      vec3 wxV = vWxRel / wxD;
      #if defined(LAMBERT) || defined(PHONG) || defined(STANDARD) || defined(TOON)
        gl_FragColor.rgb = wxWet(gl_FragColor.rgb, normalize(normal * mat3(viewMatrix)), wxV, wxD);
      #endif
      gl_FragColor.rgb = mix(gl_FragColor.rgb, wxFogCol(wxV), wxFogF(vWxRel, vWxRel + cameraPosition));
    }
  }
#endif`;
for (const k in THREE.ShaderLib) { const S = THREE.ShaderLib[k]; if (S.uniforms && S.uniforms.fogColor) S.uniforms.wxF = WXU; }
THREE.UniformsLib.fog.wxF = WXU;

// ---------------------------------------------------------------------------------------------- LOD crossfades
// lodFade(material, band, level): crossfade a level of detail by pixel distance from the camera.
//   band: a shared uniform { value: THREE.Vector2(R, W) } - the switch radius and the width of the dissolve
//   level: 'near' draws pixels nearer than R (dissolving out over R-W..R), 'far' the complement (dissolving in)
// Both levels use the same dither threshold, so in the band each pixel is drawn by exactly one of them: no gap, no
// double draw, no pop. Chains any onBeforeCompile the material already has.
export function lodFade(mat, band, level) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.wxLod = band;
    sh.vertexShader = 'varying vec3 vWxLodW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vWxLodW = mvPosition.xyz;`);
    sh.fragmentShader = `uniform vec2 wxLod; varying vec3 vWxLodW;
      float wxB2l(vec2 a){ return fract(a.x * .5 + a.y * a.y * .75); }
      float wxBayerL(vec2 fc){ vec2 p = floor(mod(fc, 4.)); return wxB2l(floor(p * .5)) * .25 + wxB2l(mod(p, 2.)) + .03125; }
      ` + sh.fragmentShader.replace('void main() {', `void main() {
      { float wxT = clamp((length(vWxLodW) - (wxLod.x - wxLod.y)) / max(wxLod.y, 1e-3), 0., 1.), wxTh = wxBayerL(gl_FragCoord.xy);
        ${level === 'near' ? 'if (wxTh >= 1. - wxT) discard;' : 'if (wxTh < 1. - wxT) discard;'} }`);
  };
  mat.customProgramCacheKey = () => prevKey() + '|lod' + level;
  mat.needsUpdate = true;
  return mat;
}
export const lodBand = (R, W) => ({ value: new THREE.Vector2(R, W) });
