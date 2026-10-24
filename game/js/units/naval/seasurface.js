// SEAWORLD: the sea surface, drawn from the same live sea the ships move on (seamotion.js).
//
// main.js's terrain shader draws the sea where the ground is below sea level; these GLSL snippets plug into it:
// - VERTEX: the 14 wave components of W.sea displace the sea vertices (heights at the game's 0.44 scale, real
//   periods - see seamotion.js SEA_GAME_SCALE) and give the slope for the normal (computed per vertex, interpolated:
//   the fragment shader adds only a cheap ripple). Waves shorter than ~5 grid cells are left out of a grid (so the 24 m
//   far ring carries only the long swell, never aliasing), and the waves die out over the last few metres of depth
//   (the coast stays where it is).
// - FRAGMENT: the swell's slope lights the water; whitecaps break on the crests, more and bigger with the sea state
//   (WMO / Douglas / Beaufort descriptions, Monahan coverage: see CAPS), wind streaks of foam at 6-7; surf on the beaches
//   widens and pulses with the swell; foam hugs every ship's waterline (thicker at the bow and with speed).
// Cost: ~14 cos/sin per sea VERTEX (not per pixel), one value-noise pair per sea pixel, a 6-ship loop with an early out.
import * as THREE from 'three';
import { SEA_GAME_SCALE } from './seamotion.js';

// SEA_NV: the components the GPU draws - the largest by amplitude (8 of 14 carry ~90 % of the variance; the ships
// and seaElevation use all 14, so the drawn surface is a hair smoother than the one they ride)
export const SEA_N = 14, SEA_NV = 8, SEA_SHIPS = 6;
// The look of each state follows the WMO sea-state code 3700 / Douglas descriptions and the Beaufort wind that raises
// that sea (WMO / Met Office sea criteria):
//   0 CALM (GLASSY)   mirror; the sun a single hard glint                                         (Bf 0)
//   1 CALM (RIPPLED)  ripples like scales, no crests                                              (Bf 1)
//   2 SMOOTH          small wavelets, glassy crests that do not break                             (Bf 2)
//   3 SLIGHT          large wavelets, crests begin to break: scattered white horses               (Bf 3-4)
//   4 MODERATE        small waves getting longer, fairly frequent white horses                    (Bf 4-5)
//   5 ROUGH           moderate waves, many white horses, some spray                               (Bf 5-6)
//   6 VERY ROUGH      large waves, white foam crests everywhere, foam starts to blow in streaks   (Bf 6-7)
//   7 HIGH            the sea heaps up, foam from breaking waves blown in well-marked streaks     (Bf 7-8)
// Whitecap coverage: Monahan and O'Muircheartaigh W = 3.84e-6 U^3.41 for the Beaufort wind of the state (Bf 3 ~4.4 m/s
// 0.06 %, Bf 4 ~6.7 0.25 %, Bf 5 ~9.3 0.8 %, Bf 6 ~12.3 2 %, Bf 7 ~15.5 4 %, Bf 8 ~19 8 %), about 3x so it reads at game
// distances (a crest's foam patch outlasts the instantaneous whitecap the formula measures).
const CAPS = [0, 0, 0, 0.004, 0.012, 0.03, 0.07, 0.17];
// the noise level a crest's foam must beat for coverage c: the foam noise (n1 .6 + n2 .4 of two value noises) is about
// normal, mean .5, sd .13; the crests that can break are ~30 % of the surface (Acklam's inverse normal, short form)
const zOf = p => { const t = Math.sqrt(-2 * Math.log(Math.min(p, 1 - p))), z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t); return p < 0.5 ? -z : z; };
const capTh = c => c <= 0 ? 2 : 0.5 + 0.13 * zOf(Math.max(1e-4, 1 - Math.min(0.95, c / 0.3)));
const capAt = ss => { const i = Math.min(6, Math.floor(ss)), f = ss - i; return CAPS[i] + (CAPS[i + 1] - CAPS[i]) * f; };

export function createSeaUniforms() {
  return {
    uWave: { value: Array.from({ length: SEA_NV }, () => new THREE.Vector4()) },   // (kx, kz, amplitude, clock phase)
    uSeaP: { value: new THREE.Vector4(0.8, 2, 0.5, 0) },                        // (Hs game m, whitecap cover, 0..1 state, -)
    uSeaD: { value: new THREE.Vector2(0, -1) },                                    // main direction the waves travel
    uShipP: { value: Array.from({ length: SEA_SHIPS }, () => new THREE.Vector4()) }, // (x, z, cos yaw, sin yaw)
    uShipD: { value: Array.from({ length: SEA_SHIPS }, () => new THREE.Vector4()) }, // (half length, half beam, speed 0..1, on)
    // SEALIFE (ngc/waterfish, sealife.js keeps these): (camera under water 0/1, its depth m, turbidity 1/m, -) and the
    // colour of the water round an underwater camera
    uSeaK: { value: new THREE.Vector4(0, 0, 0.05, 0) },
    uUWCol: { value: new THREE.Color(0.08, 0.36, 0.44) },
  };
}
// once a frame: the sea's components and the ships near the camera
const _near = [], _byA = [];
export function updateSeaUniforms(U, sea, units, cam) {
  const W = U.uWave.value, comps = _byA; _byA.length = 0; for (const c of sea.comps) _byA.push(c); _byA.sort((a, b) => b.a - a.a);
  for (let i = 0; i < SEA_NV; i++) {
    const c = comps[i];
    if (!c) { W[i].set(0, 0, 0, 0); continue; }
    W[i].set(c.dx * c.kg, c.dz * c.kg, c.a * SEA_GAME_SCALE, c.ph % (Math.PI * 2));
  }
  const ssK = sea.ss / 7;
  U.uSeaP.value.set(sea.hs * SEA_GAME_SCALE, capTh(capAt(sea.ss)), ssK, 0);   // y: the whitecap threshold (2 = none)
  U.uSeaD.value.set(-Math.sin(sea.dir), -Math.cos(sea.dir));
  // ships: the nearest few afloat
  _near.length = 0;
  for (const u of units) if (u.dims && !u.gone && (u.sinking === undefined || u.sinking < 6) && !(u.sky && u.p.y > 3)) _near.push(u);
  _near.sort((a, b) => Math.hypot(a.p.x - cam.x, a.p.z - cam.z) - Math.hypot(b.p.x - cam.x, b.p.z - cam.z));
  for (let i = 0; i < SEA_SHIPS; i++) {
    const u = _near[i];
    if (!u) { U.uShipD.value[i].set(0, 0, 0, 0); continue; }
    const wl = u.parts.waterline || { hl: u.dims.L * 0.5, hw: u.dims.W * 0.38 };
    U.uShipP.value[i].set(u.p.x, u.p.z, Math.cos(u.yaw), Math.sin(u.yaw));
    U.uShipD.value[i].set(wl.hl, wl.hw, Math.min(1, Math.abs(u.speed || 0) / 6), 1);
  }
}

// ---------------------------------------------------------------------------------------------- GLSL
export const SEA_VS_DECL = `uniform vec4 uWave[${SEA_NV}]; uniform vec4 uSeaP; uniform vec4 uShipP[${SEA_SHIPS}], uShipD[${SEA_SHIPS}]; varying vec3 vSea; varying float vHull;
    // foam round the ships' waterlines, 0..1, per VERTEX (the fragment shader adds the noise: a per-pixel 6-ship
    // loop was a quarter of the frame in software WebGL)
    float hullFoam(vec2 p){
      float f=0.;
      for(int i=0;i<${SEA_SHIPS};i++){
        vec4 d=uShipD[i]; if(d.w<.5) continue;
        vec4 s=uShipP[i]; vec2 r=p-s.xy; if(abs(r.x)+abs(r.y)>d.x+d.y+30.) continue;
        float lx=r.x*s.z-r.y*s.w, lz=r.x*s.w+r.y*s.z;              // ship frame (x starboard, z aft)
        float tb=clamp(-lz/d.x,0.,1.), hw=d.y*(lz<0.?sqrt(max(0.,1.-tb*tb*tb)):1.-.12*clamp(lz/d.x,0.,1.));
        float ou=max(abs(lx)-hw,abs(lz)-d.x);                          // metres outside the hull (roughly)
        float band=1.6+2.6*d.z+2.2*uSeaP.z, bow=smoothstep(-.3,-.95,lz/d.x)*(.4+d.z);
        float k=(1.-smoothstep(0.,band*(1.+bow),ou))*step(-.6,ou);
        f=max(f,k);
      }
      return f;
    }`;
// in: vec4 w (world position, w.y already the ground / sea floor), float h (raw height), CELL (grid spacing).
// out: w.y displaced on the sea, vSea = (elevation, slope x, slope z)
export const SEA_VS = `
      vSea=vec3(0.); vHull=0.;
      if(h<=0.){
        vHull=hullFoam(w.xz);
        float att=smoothstep(.3,7.,-h), e=0., sx=0., sz=0.;
        for(int i=0;i<${SEA_NV};i++){
          vec4 c=uWave[i]; float kk=length(c.xy); if(kk<1e-5) continue;
          float a=c.z*smoothstep(CELL*2.5,CELL*5.,6.2832/kk); if(a<1e-4) continue;   // the grid must carry the wave (the far ring skips most)
          float ph=c.w-dot(c.xy,w.xz), s=a*sin(ph);
          e+=a*cos(ph); sx+=s*c.x; sz+=s*c.y;
        }
        w.y=e*att; vSea=vec3(e*att,sx*att,sz*att);
      }`;
// SEALIFE: how fast light is lost in the water per metre (red, green, blue): pure-water absorption (Pope & Fry 1997:
// ~0.35-0.45 red, ~0.06 green, ~0.02 blue /m) plus clear coastal scattering, a little lighter for the game's look
export const SEA_EXT_GLSL = 'const vec3 SEA_EXT=vec3(.32,.07,.045);';
// value noise (the sea's foam, glitter, and the sea bed), and the light loss above
export const SEA_NOISE_GLSL = `
    ${SEA_EXT_GLSL}
    float sHash(vec2 p){ p=mod(p,289.); return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float sNoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(sHash(i),sHash(i+vec2(1.,0.)),f.x),mix(sHash(i+vec2(0.,1.)),sHash(i+1.),f.x),f.y); }
`;
// SEALIFE (ngc/waterfish): the sea bed, one look for both ways of seeing it - through the surface from above (the clarity
// in SEA_FS_WATER) and the bed mesh round a camera under water (sealife.js). Sand with ripples near the beaches, sea
// grass meadows from ~2 m down (Posidonia oceanica, the Mediterranean's: dense meadows ~1-35 m, CONFIRMED range), rock
// where the bed is steep; caustics where the sun comes through a shallow surface. Needs sNoise.
export const SEABED_GLSL = `
    vec3 bedColour(vec2 p, float d, float sl){
      float n1=sNoise(p*.09), n2=sNoise(p*.41+7.3), n3=sNoise(p*1.7-3.1);
      float rip=.93+.07*sin(dot(p,vec2(1.9,1.1))+n2*5.);                        // sand ripples (wave-built, parallel to the shore-ish)
      vec3 sand=mix(vec3(.78,.72,.53),vec3(.66,.60,.43),n2)*rip;
      float grass=smoothstep(.56,.64,n1+.18*n2)*smoothstep(1.6,3.2,d);
      vec3 c=mix(sand,mix(vec3(.09,.2,.09),vec3(.15,.29,.13),n3),grass);
      float rock=smoothstep(.32,.62,sl+.3*(n2-.5));
      return mix(c,mix(vec3(.38,.35,.3),vec3(.23,.22,.2),n3),rock);
    }
    // caustics: the bright net the swell's lenses throw on the bed (two drifting noises, bright where they cross)
    float caustic(vec2 p, float t){
      float a=sNoise(p*.75+vec2(t*.33,t*.21)), b=sNoise(p*1.02-vec2(t*.24,-t*.29)+3.7);
      float c=clamp(1.-abs(a-b)*3.2,0.,1.); return c*c*c*c;
    }
`;
export const SEA_FS_DECL = `uniform vec4 uSeaP; uniform vec2 uSeaD; varying vec3 vSea; varying float vHull; uniform vec4 uSeaK; uniform vec3 uUWCol;
${SEA_NOISE_GLSL}    // the sun glint's sparkle mask (only asked where there is a glint)
    float glitAt(vec2 p, float t, float sk){ return mix(1.,.3+1.1*smoothstep(.55,.9,sNoise(p*3.1+vec2(t*1.3,-t*.9))),smoothstep(.1,.4,sk)); }   // glitter: fine sparkle, not patches
${SEABED_GLSL}`;
// in: vec2 p (world xz), float d (depth), float t (time), vec3 V (to eye), vec3 L (sun), wc (water colour so far).
// out: vec3 wn (the swell's normal: shading, fresnel), wg (glitter normal: the sun's specular - mostly ripple, so the
// glint breaks up into sparkle instead of lighting whole wave faces), glit (sparkle mask), float foam (0..1)
export const SEA_FS_NORMAL = `
        float sk=uSeaP.z, rk=mix(.05,1.15,smoothstep(0.,.5,sk));            // SS0 a mirror, SS1 ripples, rough: a choppy face
        vec3 wn=normalize(vec3(-vSea.y+(cos(a1)*.12+cos(a3)*.07)*rk, 1., -vSea.z+(cos(a2)*.14+cos(a3)*.07)*rk));
        vec3 wg=normalize(vec3(-vSea.y*.15+(cos(a1)*.12+cos(a3)*.07)*rk, 1., -vSea.z*.15+(cos(a2)*.14+cos(a3)*.07)*rk));
`;
export const SEA_FS_FOAM = `
        float crest=vSea.x/max(uSeaP.x*.55,.02), th=uSeaP.y;
        vec2 wd=uSeaD, q=vec2(dot(p,wd),dot(p,vec2(-wd.y,wd.x)));
        float cap=0., streak=0.;   // (branches: the noise only where it can show - SwiftShader pays for every pixel)
        if(th<1.5&&crest>.2){ float n1=sNoise(p*.16+wd*t*.35), n2=sNoise(p*.7-wd*t*.6); cap=smoothstep(.2,.9,crest)*smoothstep(th,th+.05,n1*.6+n2*.4)*(.55+.45*n2); }
        if(sk>.7) streak=smoothstep(.7,.88,sNoise(vec2(q.x*.03-t*.25,q.y*.32)))*smoothstep(.7,1.,sk)*.35;
        float surfW=1.4+3.5*sk, surf=(1.-smoothstep(0.,surfW,d))*(.55+.45*sin(d*8./(1.+sk*2.)-t*2.4+sin(a1)+vSea.x*2.));
        float foam=clamp(max(max(surf,cap),max(streak*(1.-smoothstep(150.,600.,length(cameraPosition.xz-p))),(vHull>.01?vHull*(.45+.55*sNoise(p*.6+vec2(t*.4,t*1.2))):0.))),0.,1.);`;

// SEALIFE (ngc/waterfish): the water's clarity, seen from above. Replaces the flat shallows-to-deep ramp: the eye looks
// down through the surface (refracted, Snell n = 1.333) to the bed (SEABED_GLSL), the light losing red first on the
// way down and back (pure-water absorption ~0.35-0.45 /m red, ~0.06 green, ~0.02 blue: Pope & Fry 1997, CONFIRMED
// order; plus a little scattering), and the water's own blue-green fills in with depth. So sand shows in the shallows
// by the beaches, the sea grass darkens the bays, and deep water keeps the old deep blue.
// in: d (depth m), p (world xz), t, sk (sea state 0..1), vW, vRaw.  out: vec3 wc
export const SEA_FS_WATER = `
        vec3 wc;
        {
          vec3 Vw=normalize(cameraPosition-vW); float ca=clamp(Vw.y,.04,1.), st=sqrt(1.-ca*ca)/1.333, ct=sqrt(1.-st*st);
          vec2 hd=length(Vw.xz)>1e-4?-normalize(Vw.xz):vec2(0.);
          float dd=max(d,0.);
          vec2 bp=p+hd*(st/ct)*dd;                                       // where the refracted ray meets the bed
          float path=(dd/ct+dd)*.85;                                      // sunlight down to the bed, then up to the eye
          vec3 Tb=exp(-(SEA_EXT+uSeaK.z)*path);
          vec2 gs=vec2(length(vec2(dFdx(vRaw),dFdy(vRaw))),length(vec2(length(dFdx(vW.xz)),length(dFdy(vW.xz)))));
          vec3 bed=bedColour(bp,dd,clamp(gs.x/max(gs.y,1e-3),0.,1.));
          if(dd<8.) bed*=1.+caustic(bp,t)*1.1*(1.-dd/8.)*(1.-.7*sk)*(1.-smoothstep(60.,160.,length(cameraPosition-vW)));
          vec3 body=mix(vec3(.1,.46,.52),vec3(.02,.13,.36),smoothstep(0.,10.,dd));   // the water's own colour (light it scatters back)
          wc=bed*Tb+body*(1.-dot(Tb,vec3(.2,.5,.3)));
        }`;
// SEALIFE: the surface seen from BELOW (a camera under water; the terrain is drawn double-sided then). Inside Snell's
// window (48.6 deg round the vertical, asin(1/1.333)) the sky and the sun come through; outside it the surface is a
// mirror of the water below (total internal reflection). Foam shows as bright patches. in: wn, foam, L, c. out: c
export const SEA_FS_UNDER = `
        if(!gl_FrontFacing){
          vec3 I=normalize(vW-cameraPosition), nw=normalize(vec3(wn.x*.6,1.,wn.z*.6));
          float cA=dot(I,nw), win=smoothstep(.62,.7,cA);
          vec3 sky=mix(vec3(.62,.8,.92),vec3(.9,.97,1.),smoothstep(.75,1.,cA))+vec3(1.,.95,.8)*pow(max(dot(I,L),0.),40.)*1.5;
          vec3 tir=uUWCol*(.7+.25*sNoise(p*.3+t*.2));
          c=mix(tir,sky,win)+vec3(.6,.8,.85)*smoothstep(.55,.66,cA)*(1.-win)*.6;   // the bright rim of the window
          c=mix(c,vec3(.75,.85,.88),foam*.55);
        }`;
