// WEATHER: the sky - a dome painted from the same air colour as the fog (fogshader.js wxFogCol), the sun, and a cloud
// layer you can fly into.
//
// Clouds are a layer between `base` and `top` (state.js per weather). Seen from under it they are drawn on the dome by
// intersecting each view ray with the plane at the cloud base (so they sit at the right height, move with the wind
// and shrink towards the horizon in perspective); from above, the tops. A plane mesh at the base (camera below) or the
// top (camera above) draws the same clouds in the scene with depth, so an aircraft above the ceiling is hidden by it
// and the sea is hidden under the tops - it uses the same function, so it is seamless against the dome. Inside the
// layer the visibility controller (vis.js) closes the fog in to cloud-grey.
// The clouds are not fogged by the game's short draw-distance fog (they are sky, kilometres off); they fade into the
// weather's own visibility with distance and into the horizon haze at grazing angles.
import * as THREE from 'three';
import { WX_GLSL, WXU } from './fogshader.js';

// cloud density along a cloud-layer point p (m): three octaves of value noise, cut by the cover
export const CLOUD_GLSL = `
uniform sampler2D wxNT;   // 256^2 value noise (cloudDen below: JS reads the same texels, so the CPU knows where the cloud is)
float wxCloudN(vec2 p){ return texture2D(wxNT, p).r * .55 + texture2D(wxNT, p * 2.13 + .173).r * .3 + texture2D(wxNT, p * 4.71 - .091).r * .15; }
float wxCloudDen(vec2 p){
  vec2 q = (p + wxF[7].zw) / (620. * 256.);
  float n = wxCloudN(q), cv = wxF[5].w;
  return smoothstep(1. - cv - .02, 1. - cv + .3, n * .9 + .1 * cv);
}
// colour of the cloud at layer point p seen along dir, from below (under=1) or above; t = distance to it
vec4 wxCloud(vec2 p, vec3 dir, float t, float under){
  float den = wxCloudDen(p); if (den <= .002) return vec4(0.);
  float dk = wxF[7].y, sun = wxF[6].w, sd = max(dot(dir, wxF[2].xyz), 0.);
  float thick = clamp((wxF[6].y - wxF[6].x) / 1500., .2, 1.4), tex = texture2D(wxNT, p / 35840.).r * .5 + texture2D(wxNT, p / 12032.).r * .5;
  vec3 c;
  if (under > .5) {   // the cloud base: grey, darker where thicker and denser, a bright fringe round thin edges towards the sun
    c = mix(vec3(.93, .94, .96), vec3(.58, .6, .64), clamp(den * thick * .9 + .2 * dk, 0., 1.)) * (1. - .55 * dk);
    c *= .86 + .2 * tex;
    c += vec3(1., .95, .85) * pow(sd, 6.) * (1. - den) * sun * .5;
  } else {            // the tops in sunshine
    c = vec3(1.) * (.8 + .22 * sun) * (.88 + .16 * tex);
    c *= 1. - .35 * dk;
  }
  c += wxF[4].y * vec3(.6, .65, .8);   // lightning lights the cloud
  float haze = 1. - exp(-t / max(wxF[6].z * .55, 60.));
  return vec4(mix(c, wxFogCol(dir), haze), den * (1. - haze * .25));
}
`;

const SKY_VS = 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const SKY_FS = `
${WX_GLSL}
${CLOUD_GLSL}
varying vec3 vP;
void main(){
  vec3 d = normalize(vP);
  vec3 hor = wxFogCol(d), zen = wxF[3].rgb + wxF[4].y * vec3(.45, .5, .65);
  float y = d.y, sun = wxF[6].w, sd = dot(d, wxF[2].xyz);
  vec3 c = mix(hor, zen, pow(smoothstep(0., .6, max(y, 0.)), .75));
  // the sun: a disc and its aureole, dimmed and widened by haze and cloud
  float haze = wxF[0].z * .2 + wxF[7].y;
  c += vec3(1., .96, .86) * (smoothstep(.99955, .9998, sd) * 2.2 * sun * sun + pow(max(sd, 0.), 220.) * .5 * sun) * (1. - .6 * haze);
  float cy = cameraPosition.y, base = wxF[6].x, top = wxF[6].y;
  if (wxF[5].w > .01) {
    if (cy < base && y > .0015) { float t = (base - cy) / y; vec4 k = wxCloud(cameraPosition.xz + d.xz * t, d, t, 1.); c = mix(c, k.rgb, k.a * smoothstep(.0015, .05, y)); }
    else if (cy > top && y < -.0015) { float t = (cy - top) / -y; vec4 k = wxCloud(cameraPosition.xz + d.xz * t, d, t, 0.); c = mix(c, k.rgb, k.a * smoothstep(-.0015, -.05, y)); }
  }
  c = mix(c, mix(vec3(.8, .82, .85), vec3(.5, .52, .56), wxF[7].y) + wxF[4].y * vec3(.5), wxF[7].x);   // inside the cloud
  gl_FragColor = vec4(c, 1.);
}`;
// the cloud plane in the scene (same clouds, with depth): one quad centred on the camera, at the base or the top
const PL_VS = 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const PL_FS = `
${WX_GLSL}
${CLOUD_GLSL}
varying vec3 vW; uniform float uUnder;
void main(){
  vec3 rel = vW - cameraPosition; float t = length(rel); vec3 d = rel / t;
  vec4 k = wxCloud(vW.xz, d, t, uUnder);
  k.a *= smoothstep(.0015, .05, abs(d.y));
  if (k.a < .01) discard;
  gl_FragColor = vec4(k.rgb, k.a);
}`;

// the noise texture: a hashed lattice, bilinear and repeating (LinearFilter on the GPU; cloudDen does the same in JS)
const NT_N = 256, NT = new Uint8Array(NT_N * NT_N);
{ let s = 1980; for (let i = 0; i < NT.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; NT[i] = s >>> 24; } }
const ntTex = new THREE.DataTexture(NT, NT_N, NT_N, THREE.RedFormat); ntTex.wrapS = ntTex.wrapT = THREE.RepeatWrapping; ntTex.magFilter = ntTex.minFilter = THREE.LinearFilter; ntTex.needsUpdate = true;
export const WXNT = { value: ntTex };
const ntAt = (u, v) => {   // texture2D(wxNT, (u, v)) with LinearFilter + RepeatWrapping
  const x = u * NT_N - 0.5, y = v * NT_N - 0.5, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, m = NT_N - 1;
  const a = NT[(j & m) * NT_N + (i & m)], b = NT[(j & m) * NT_N + ((i + 1) & m)], c = NT[((j + 1) & m) * NT_N + (i & m)], d = NT[((j + 1) & m) * NT_N + ((i + 1) & m)];
  return ((a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy) / 255;
};
// the cloud density at world (x, z), the clouds drifted by (ox, oz), cover cv - wxCloudDen in JS
export function cloudDen(x, z, ox, oz, cv) {
  const S = 620 * 256, u = (x + ox) / S, v = (z + oz) / S;
  const n = ntAt(u, v) * 0.55 + ntAt(u * 2.13 + 0.173, v * 2.13 + 0.173) * 0.3 + ntAt(u * 4.71 - 0.091, v * 4.71 - 0.091) * 0.15;
  const e0 = 1 - cv - 0.02, e1 = 1 - cv + 0.3, q = Math.min(1, Math.max(0, (n * 0.9 + 0.1 * cv - e0) / (e1 - e0)));
  return q * q * (3 - 2 * q);
}
export function createSky(sky, scene) {
  sky.material = new THREE.ShaderMaterial({ uniforms: { wxF: WXU, wxNT: WXNT }, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false });
  const planeU = { wxF: WXU, wxNT: WXNT, uUnder: { value: 1 } };
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: planeU, vertexShader: PL_VS, fragmentShader: PL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }));
  plane.frustumCulled = false; plane.renderOrder = 2; plane.visible = false; scene.add(plane);
  // where the plane goes this frame (the rendering camera; scripted test cameras too)
  plane.onBeforeRender = (r, s, cam) => { const P = cam.position, B = plane.userData; const under = P.y < B.base; planeU.uUnder.value = under ? 1 : 0; plane.position.set(P.x, under ? B.base : B.top, P.z); plane.scale.set(B.R, 1, B.R); plane.updateMatrixWorld(); };
  plane.userData = { base: 1000, top: 1500, R: 250 };
  return {
    plane,
    // the camera this frame and how far it can see: the plane only within the draw distance (beyond it, the dome)
    update(cam, cover, base, top, draw) {
      const y = cam.position.y, B = plane.userData; B.base = base; B.top = top; B.R = draw;
      const dist = y < base ? base - y : y > top ? y - top : 0;
      plane.visible = cover > 0.01 && dist > 0 && dist < draw * 0.9;
    },
  };
}
