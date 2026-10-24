// SEALIFE (ngc/waterfish): life under the sea, and the view from under it.
//
//   const sealife = createSeaLife({ scene, uniforms: terrainUni, terrain, sky, fx, war, depthAt: terrainH, isWater, cell: TG,
//                                   canvas, extra: S => {...}, active: () => bool });
//   each frame: sealife.update(dt)   (the drawing side runs at render time, from scene.onBeforeRender)
//
// - FISH: fishsim.js simulates schools round the camera; here they are one instanced draw (a low-poly fish body that
//   bends with its tail beat, countershaded, silver flanks that flash when they turn). Seen from above they are seen
//   THROUGH the water: dimmed and tinted by the light's path down to them and back, behind the surface's reflection
//   (their depth is drawn at the surface so the opaque sea does not hide them). Under water they are fogged like the rest.
// - DISTURBANCE: ships (hulls, wakes), aircraft low over the water (downwash), the LCAC, RW-7 hover tanks, swimmers,
//   splashes, gunfire into the water and explosions (fx.js recipes are wrapped: anything that splashes, wakes or blows up
//   in the water reaches the fish without touching the callers).
// - UNDER WATER: when the camera that renders is below the drawn surface (the same waves the GPU draws), the scene's fog
//   becomes the water (visibility ~25 m, greener near the top, darker deeper, murkier in a rough sea), the sky dome goes,
//   the surface is drawn from below (Snell's window, seasurface.js SEA_FS_UNDER), a sea bed mesh is built round the camera
//   from the same heights the physics uses (with the caustics and sea grass of the clarity seen from above), and the
//   screen edges darken a little.
import * as THREE from 'three';
import { createFishSim, SPECIES } from './fishsim.js';
import { SEA_NOISE_GLSL, SEABED_GLSL, SEA_EXT_GLSL } from './seasurface.js';

const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------------------------------------- the fish body
// Unit length along +z (nose at +0.5), stations from the caudal peduncle to the snout: (s 0 tail tip .. 1 nose, half
// height, half width), a fusiform (mackerel-like) profile, scaled per species in the shader.
const STATIONS = [[0.12, 0.022, 0.012], [0.24, 0.05, 0.028], [0.42, 0.088, 0.052], [0.6, 0.1, 0.06], [0.76, 0.09, 0.055], [0.89, 0.06, 0.04]];
const RING = 6;
function fishGeometry() {
  const P = [], N = [], S = [], T = [], F = [], I = [];
  const v = (x, y, z, nx, ny, nz, s, tone, fin) => { P.push(x, y, z); N.push(nx, ny, nz); S.push(s); T.push(tone); F.push(fin); return P.length / 3 - 1; };
  const rings = STATIONS.map(([s, hh, hw]) => {
    const r = [];
    for (let k = 0; k < RING; k++) {
      const a = k / RING * TAU, sy = Math.cos(a), sx = Math.sin(a), nl = Math.hypot(sx / hw, sy / hh);
      r.push(v(sx * hw, sy * hh, s - 0.5, sx / hw / nl, sy / hh / nl, 0, s, 0.5 + 0.5 * sy, 0));
    }
    return r;
  });
  for (let i = 0; i + 1 < rings.length; i++) for (let k = 0; k < RING; k++) { const a = rings[i][k], b = rings[i][(k + 1) % RING], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % RING]; I.push(a, c, b, b, c, d); }
  const nose = v(0, -0.008, 0.5, 0, 0, 1, 1, 0.5, 0), last = rings[rings.length - 1];
  for (let k = 0; k < RING; k++) I.push(last[k], nose, last[(k + 1) % RING]);
  // tail fin (forked): peduncle top / bottom, the two lobe tips, the fork
  const pt = v(0, 0.022, -0.38, 1, 0, 0, 0.12, 0.8, 1), pb = v(0, -0.022, -0.38, 1, 0, 0, 0.12, 0.8, 1);
  const tt = v(0, 0.13, -0.535, 1, 0, 0, 0, 0.8, 1), tb = v(0, -0.13, -0.535, 1, 0, 0, 0, 0.8, 1), fk = v(0, 0, -0.455, 1, 0, 0, 0.05, 0.8, 1);
  I.push(pt, tt, fk, pb, fk, tb, pt, fk, pb);
  // first dorsal fin
  const d0 = v(0, 0.092, 0.02, 1, 0, 0, 0.52, 0.95, 2), d1 = v(0, 0.088, 0.16, 1, 0, 0, 0.66, 0.95, 2), dp = v(0, 0.16, 0.06, 1, 0, 0, 0.56, 0.95, 2);
  I.push(d0, dp, d1);
  // pectoral fins (small, flat, angled out and down)
  for (const sd of [-1, 1]) { const a = v(sd * 0.05, -0.03, 0.22, 0, -1, 0, 0.72, 0.4, 3), b = v(sd * 0.05, -0.035, 0.3, 0, -1, 0, 0.8, 0.4, 3), c = v(sd * 0.12, -0.07, 0.17, 0, -1, 0, 0.67, 0.4, 3); I.push(a, b, c); }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(S, 1)); g.setAttribute('aTone', new THREE.Float32BufferAttribute(T, 1)); g.setAttribute('aFin', new THREE.Float32BufferAttribute(F, 1));
  g.setIndex(I);
  return g;
}
// per species (fishsim.js SPECIES order): shape (height, width, tail span, dorsal), back / flank / belly / fin colours,
// marks (x: mackerel bars, y: mullet lines, z: amberjack band and stripe)
const LOOK = {
  sardine: { shape: [0.85, 0.72, 0.95, 0.75], back: 0x1f4f63, side: 0x9aa8b2, belly: 0xdfe5ea, fin: 0x6c7a80, mark: [0, 0, 0, 0] },
  mackerel: { shape: [0.82, 0.8, 1.15, 0.9], back: 0x1b4f4a, side: 0x8ca2a6, belly: 0xe2e6e6, fin: 0x52605e, mark: [1, 0, 0, 0] },
  mullet: { shape: [1.0, 0.95, 0.85, 1.0], back: 0x46504f, side: 0x8f9696, belly: 0xd0d2cc, fin: 0x5c6260, mark: [0, 1, 0, 0] },
  amberjack: { shape: [1.12, 0.8, 1.3, 0.9], back: 0x4a4650, side: 0xa3a39e, belly: 0xd8d5cc, fin: 0x8c7a42, mark: [0, 0, 1, 0] },
};

const FISH_VS = `
  ${SEA_EXT_GLSL}
  attribute vec4 iA, iB, iC; attribute float aS, aTone, aFin;
  uniform vec4 uShape[4], uMark[4]; uniform vec3 uBack[4], uSide[4], uBelly[4], uFinC[4];
  uniform vec4 uUW;      // (camera under water 0/1, sea top y for the depth trick, turbidity 1/m, -)
  uniform vec4 uFogP;    // (fog near, fog far) for the side the camera is on
  uniform vec3 uFogC, uSunD;
  varying vec3 vCol; varying float vA;
  vec3 rotP(vec3 p, float yaw, float pitch, float roll){
    float c=cos(roll), s=sin(roll); p=vec3(c*p.x-s*p.y, s*p.x+c*p.y, p.z);
    c=cos(-pitch); s=sin(-pitch); p=vec3(p.x, c*p.y-s*p.z, s*p.y+c*p.z);
    c=cos(yaw); s=sin(yaw); return vec3(c*p.x+s*p.z, p.y, -s*p.x+c*p.z);
  }
  void main(){
    int sp=int(iB.w+.5); vec4 sh=uShape[sp];
    vec3 p=position, nrm=normal;
    if(aFin>.5&&aFin<1.5) p.y*=sh.z; else { p.y*=sh.x; p.x*=sh.y; if(aFin>1.5&&aFin<2.5) p.y+=(p.y-.09*sh.x)*(sh.w-1.); }
    // the tail beat: a wave running back along the body, growing to ~0.1 L each side at the tail (Bainbridge 1958)
    float s=clamp(aS,0.,1.), env=.06+.94*pow(1.-s,2.2), amp=.1*(.45+.55*iC.y);
    float bend=sin(iC.x-5.4*(1.-s));
    p.x+=amp*env*bend; nrm.x-=amp*env*cos(iC.x-5.4*(1.-s))*5.4*.3;
    if(aFin>2.5) p.y+=.02*sin(iC.x*.5+p.x*40.);   // pectorals flutter
    vec3 wp=iA.xyz+rotP(p*iA.w, iB.x, iB.y, iB.z), n=normalize(rotP(nrm, iB.x, iB.y, iB.z));
    // colour: countershading, the species' marks, fins
    float tone=aTone; vec3 col=tone>.5?mix(uSide[sp],uBack[sp],smoothstep(.62,.85,tone)):mix(uBelly[sp],uSide[sp],smoothstep(.2,.45,tone));
    vec4 mk=uMark[sp];
    if(mk.x>.5&&tone>.6&&aFin<.5) col=mix(col,vec3(.03,.06,.07),step(.45,sin(s*58.+position.y*120.+sin(s*21.)*2.))*.85);      // mackerel: the wavy black bars
    if(mk.y>.5&&tone>.35&&tone<.85&&aFin<.5) col*=.82+.18*step(.5,fract(position.y*95.));                               // mullet: dark lines along the flank
    if(mk.z>.5&&aFin<.5){ col=mix(col,vec3(.83,.66,.28),smoothstep(.06,.0,abs(tone-.6))*.8); if(s>.8&&s<.88&&tone>.62) col*=.45; }   // amberjack: the amber stripe, the dark band through the eye
    if(aFin>.5) col=uFinC[sp];
    if(aFin<.5&&s>.86&&abs(position.x)>.02&&tone>.5&&tone<.75) col=vec3(.04);   // the eye
    // light from above: dimmer and bluer with depth; the silver flank as a vertical mirror that flashes when it turns to you
    float dpt=max(-wp.y,0.);
    vec3 light=exp(-(SEA_EXT+uUW.z)*dpt*1.3);
    vec3 V=normalize(cameraPosition-wp), L=normalize(uSunD);
    float dif=.5+.5*max(dot(n,L),0.)+.15*n.y;
    float fl=smoothstep(.2,.4,tone)*smoothstep(.85,.6,tone)*step(aFin,.5);
    float sp2=pow(max(dot(reflect(-L,n),V),0.),8.)*fl*.9 + pow(max(dot(reflect(vec3(0.,1.,0.),n),-V),0.),6.)*fl*.35;
    col=(col*dif+vec3(.9,.95,1.)*sp2)*light;
    vA=iC.z;
    vec4 clip=projectionMatrix*viewMatrix*vec4(wp,1.);
    float dist=length(cameraPosition-wp);
    if(uUW.x>.5){   // the camera under water: fog to the water
      vCol=mix(col,uFogC,smoothstep(uFogP.x,uFogP.y,dist));
    } else {
      // seen from above, through the surface: what is lost on the way up from the fish, and the surface's reflection
      vec3 ray=wp-cameraPosition; float cy=cameraPosition.y;
      float top=min(uUW.y,max(cy*.5,.02)), tt=clamp((cy-top)/max(cy-wp.y,1e-3),0.,1.);
      vec3 sp3=cameraPosition+ray*tt;
      float path=length(wp-sp3);
      vec3 T=exp(-(SEA_EXT+uUW.z)*path);
      float ca=clamp((cy-wp.y)/max(dist,1e-3),0.,1.), fres=.02+.98*pow(1.-ca,5.);
      vCol=col*T/max(dot(T,vec3(.33)),.05);
      vA*=clamp(dot(T,vec3(.2,.5,.3))*1.15,0.,1.)*(1.-fres)*(1.-smoothstep(uFogP.x,uFogP.y,dist));
      vec4 cs=projectionMatrix*viewMatrix*vec4(sp3,1.);   // drawn at the surface's depth: in front of the opaque sea
      clip.z=(cs.z/cs.w)*clip.w-1e-4*clip.w;
    }
    gl_Position=clip;
  }`;
const FISH_FS = `
  varying vec3 vCol; varying float vA;
  void main(){ if(vA<.01) discard; gl_FragColor=vec4(vCol,vA); }`;

// ---------------------------------------------------------------------------------------------- the sea bed mesh
const BED_N = 48, BED_C = 2;   // 96 m square at 2 m (the fish sim's bed cells, so fish and bed agree)
const BED_VS = `
  varying vec3 vW;
  void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const BED_FS = `
  uniform vec4 uSeaK; uniform vec3 uUWCol, uSunD; uniform float uTime; uniform vec2 uFogP;
  varying vec3 vW;
  ${SEA_NOISE_GLSL}
  ${SEABED_GLSL}
  void main(){
    vec3 n=normalize(cross(dFdx(vW),dFdy(vW))); if(n.y<0.) n=-n;
    float d=max(-vW.y,0.);
    vec3 c=bedColour(vW.xz,d,clamp(sqrt(max(1.-n.y*n.y,0.))/max(n.y,.2),0.,1.));
    vec3 light=exp(-(SEA_EXT+uSeaK.z)*d);
    float dif=.45+.55*max(dot(n,normalize(uSunD)),0.);
    float cz=d<10.?caustic(vW.xz,uTime)*1.3*(1.-d/10.):0.;
    c=c*light*(dif+cz)+uUWCol*.25;
    float fd=length(cameraPosition-vW);
    gl_FragColor=vec4(mix(c,uUWCol,smoothstep(uFogP.x,uFogP.y,fd)),1.);
  }`;

export function createSeaLife(ctx) {
  const { scene, uniforms: U, terrain, sky, fx, war, depthAt, isWater, cell = 2.5 } = ctx;
  const active = ctx.active || (() => true);
  const sim = createFishSim({ depthAt, seed: 1980 });
  const L = { sim, under: false, camDepth: 0, surfY: 0, enabled: true, fishOn: true, fishDrawn: 0, ms: 0, cam: new THREE.Vector3(0, 30, 0), bedReady: false };

  // ------------------------------------------------------------------ fish mesh
  const MAX = 760, geo = fishGeometry();
  const A = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4), B = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4), C = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
  for (const a of [A, B, C]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iA', A); geo.setAttribute('iB', B); geo.setAttribute('iC', C); geo.instanceCount = 0;
  const col = h => new THREE.Color(h);
  const looks = SPECIES.map(s => LOOK[s.key]);
  const fishU = {
    uShape: { value: looks.map(l => new THREE.Vector4(...l.shape)) }, uMark: { value: looks.map(l => new THREE.Vector4(...l.mark)) },
    uBack: { value: looks.map(l => col(l.back)) }, uSide: { value: looks.map(l => col(l.side)) }, uBelly: { value: looks.map(l => col(l.belly)) }, uFinC: { value: looks.map(l => col(l.fin)) },
    uUW: { value: new THREE.Vector4(0, 0.5, 0.05, 0) }, uFogP: { value: new THREE.Vector4(125, 250, 0, 0) }, uFogC: { value: new THREE.Color() }, uSunD: { value: new THREE.Vector3(0.5, 1, 0.3) },
  };
  const fishMat = new THREE.ShaderMaterial({ uniforms: fishU, vertexShader: FISH_VS, fragmentShader: FISH_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const fishMesh = new THREE.Mesh(geo, fishMat); fishMesh.frustumCulled = false; fishMesh.renderOrder = 1.5; fishMesh.name = 'sealife-fish';
  scene.add(fishMesh);

  // ------------------------------------------------------------------ sea bed mesh (under water only)
  const bedGeo = new THREE.PlaneGeometry(BED_N * BED_C, BED_N * BED_C, BED_N, BED_N).rotateX(-Math.PI / 2);
  const bedPos = bedGeo.attributes.position; bedPos.setUsage(THREE.DynamicDrawUsage);
  const bedU = { uSeaK: U.uSeaK, uUWCol: U.uUWCol, uTime: U.uTime, uSunD: fishU.uSunD, uFogP: { value: new THREE.Vector2(1, 25) } };
  const bedMesh = new THREE.Mesh(bedGeo, new THREE.ShaderMaterial({ uniforms: bedU, vertexShader: BED_VS, fragmentShader: BED_FS }));
  bedMesh.frustumCulled = false; bedMesh.visible = false; bedMesh.name = 'sealife-seabed'; scene.add(bedMesh);
  const bedJob = { cx: 1e9, cz: 1e9, next: null, i: 0, h: new Float32Array(bedPos.count) };
  const NV = BED_N + 1, half = BED_N * BED_C / 2;
  function bedStep(budget) {   // fill the heights of the pending grid; swap it in when done
    const J = bedJob; if (!J.next) return;
    const [cx, cz] = J.next, end = Math.min(bedPos.count, J.i + budget);
    for (; J.i < end; J.i++) { const ix = J.i % NV, iz = (J.i / NV) | 0; J.h[J.i] = Math.min(sim.bed(cx - half + ix * BED_C, cz - half + iz * BED_C), -0.05); }
    if (J.i >= bedPos.count) {
      for (let k = 0; k < bedPos.count; k++) bedPos.setY(k, J.h[k]);
      bedPos.needsUpdate = true; bedMesh.position.set(cx, 0, cz); bedMesh.updateMatrixWorld(); J.cx = cx; J.cz = cz; J.next = null; L.bedReady = true;
    }
  }
  function bedWant(x, z, now) {
    const cx = Math.round(x / 8) * 8, cz = Math.round(z / 8) * 8;   // (8 m: a multiple of the 2 m cells)
    if (bedJob.next || (Math.abs(cx - bedJob.cx) < 20 && Math.abs(cz - bedJob.cz) < 20)) { if (now) bedStep(1e9); return; }
    bedJob.next = [cx, cz]; bedJob.i = 0;
    if (now || Math.abs(cx - bedJob.cx) > 40 || Math.abs(cz - bedJob.cz) > 40) bedStep(1e9);   // too far: build it at once
  }

  // ------------------------------------------------------------------ the drawn surface at a point (what the GPU draws)
  function surfaceAt(x, z) {
    let e = 0;
    for (const c of U.uWave.value) {
      const kk = Math.hypot(c.x, c.y); if (kk < 1e-5) continue;
      const a = c.z * smooth(cell * 2.5, cell * 5, TAU / kk); if (a < 1e-4) continue;
      e += a * Math.cos(c.w - (c.x * x + c.y * z));
    }
    return e * smooth(0.3, 7, -sim.bed(x, z));
  }

  // ------------------------------------------------------------------ under water: fog, sky, surface from below
  let tint = null;
  const saved = { uFog: null, bg: null };
  const uwCol = new THREE.Color(), _c = new THREE.Color(), fogUW = new THREE.Color(), linUW = new THREE.Color();   // (linUW: the same colour for three's colour-managed fog and background: they convert to sRGB, the raw shaders do not)
  const OPEN = new THREE.Color(0.07, 0.36, 0.44), DEEP = new THREE.Color(0.012, 0.07, 0.15), MURK = new THREE.Color(0.16, 0.3, 0.3);
  function setUnder(on) {
    if (on === L.under) return;
    L.under = on;
    terrain.material.side = on ? THREE.DoubleSide : THREE.FrontSide;   // the sea surface seen from below
    if (sky) sky.visible = !on;
    if (on) { saved.uFog = U.uFog.value; U.uFog.value = fogUW; saved.bg = scene.background; scene.background = linUW; }
    else { if (saved.uFog) U.uFog.value = saved.uFog; scene.background = saved.bg; }
    fishMat.depthWrite = on;
    bedMesh.visible = on;
    if (ctx.canvas && typeof document !== 'undefined') {
      if (!tint) { tint = document.createElement('div'); tint.id = 'uwTint'; Object.assign(tint.style, { position: 'fixed', inset: '0', pointerEvents: 'none', display: 'none', background: 'radial-gradient(ellipse at 50% 42%, rgba(0,40,50,0) 48%, rgba(0,18,28,.55) 100%)' }); ctx.canvas.after(tint); }
      tint.style.display = on ? 'block' : 'none';
    }
  }
  const _ft = { near: 0, far: 0 };
  scene.onBeforeRender = ((prev) => function (renderer, sc, camera) {
    if (prev) prev.call(this, renderer, sc, camera);
    const p = camera.position; L.cam.copy(p); L.camObj = camera;
    const water = L.enabled && active() && isWater(p.x, p.z);
    const surf = water ? surfaceAt(p.x, p.z) : 0;
    const bedH = water ? sim.bed(p.x, p.z) : 0;
    const under = water && p.y < surf - 0.03 && p.y > bedH - 0.5;
    L.surfY = surf; L.camDepth = under ? surf - p.y : 0;
    const sk = U.uSeaP.value.z;
    U.uSeaK.value.set(under ? 1 : 0, L.camDepth, 0.03 + 0.09 * sk * sk, 0);
    // the water's colour round the camera: blue-green near the top, darker down; a rough sea is murkier and greyer
    uwCol.copy(OPEN).lerp(DEEP, smooth(0, 22, L.camDepth)).lerp(_c.copy(MURK).multiplyScalar(0.8), 0.35 * sk);
    U.uUWCol.value.copy(uwCol);
    setUnder(under);
    // the fish: the fog of the side the camera is on
    fishU.uUW.value.set(under ? 1 : 0, Math.max(0.15, U.uSeaP.value.x * 0.7 + 0.1), U.uSeaK.value.z, 0);
    if (U.uSun) fishU.uSunD.value.copy(U.uSun.value);
    if (under) {
      const vis = 26 * (1 - 0.45 * sk) * (1 - 0.25 * smooth(0, 20, L.camDepth));
      fogUW.copy(uwCol); linUW.copy(uwCol).convertSRGBToLinear();
      if (sc.fog) { sc.fog.color.copy(linUW); sc.fog.near = 0.5; sc.fog.far = vis; }
      U.uFogN.value = 0.5; U.uFogF.value = vis;
      bedU.uFogP.value.set(0.5, vis); fishU.uFogP.value.set(0.5, vis, 0, 0); fishU.uFogC.value.copy(uwCol);
      if (fx) for (const q of [fx.add, fx.mix]) { if (q && q.uni && q.uni.uFogNear) { q.uni.uFogNear.value = 0.5; q.uni.uFogFar.value = vis; q.uni.uFogCol && q.uni.uFogCol.value.copy(uwCol); } }
      bedWant(p.x, p.z, !L.bedReady);
    } else if (sc.fog) { fishU.uFogP.value.set(sc.fog.near, sc.fog.far, 0, 0); fishU.uFogC.value.copy(sc.fog.color); }
  })(scene.onBeforeRender && scene.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender ? scene.onBeforeRender : null);

  // ------------------------------------------------------------------ disturbances from fx (wrapped once)
  const wrap = (obj, name, after) => { if (!obj || typeof obj[name] !== 'function') return; const o = obj[name]; obj[name] = function (...a) { const r = o.apply(this, a); try { if (L.enabled) after(...a); } catch (e) { /* never break the fx */ } return r; }; };
  if (fx) {
    wrap(fx, 'explode', (x, y, z, s = 1) => { if (isWater(x, z) && y < 6) sim.blast(x, y, z, s); });
    wrap(fx, 'splash', (x, z, s = 1) => sim.scare(x, 0, z, 9 + 9 * s, 1, 2, 3 + 2 * s));
    wrap(fx, 'impact', (x, y, z, kind) => { if (kind === 'water') sim.scare(x, 0, z, 6, 0.8, 1, 2.5); });
    wrap(fx, 'wake', (x, z, s = 1) => sim.scare(x, 0, z, 7 + 5 * s, 0.75, 1.4, 4));
    wrap(fx.water, 'add', d => { if (d && d.y < 0.6 && d.tile === 1 && d.life < 4 && isWater(d.x, d.z)) sim.scare(d.x, 0, d.z, 4 + d.size + d.grow * 0.35, Math.min(1, 0.4 + d.a), 1.2, 3); });   // rotor wash spray, splash rings
  }

  // ------------------------------------------------------------------ each frame
  const ROTARY = { drone: 1, transport: 1, gunship: 1 }, _view = {};
  L.update = dt => {
    if (!L.enabled || !active()) { sim.clearThreats(); geo.instanceCount = 0; fishMesh.visible = false; L.ms = 0; return; }
    fishMesh.visible = true;
    const t0 = performance.now(), c = L.cam;
    sim.clearThreats();
    if (war && war.units) for (const u of war.units) {
      if (!u.p || u.gone) continue;
      if (Math.abs(u.p.x - c.x) > 260 || Math.abs(u.p.z - c.z) > 260) continue;
      if (u.dims && u.p.y < 3 && !(u.sinking > 8)) {   // a ship
        const wl = (u.parts && u.parts.waterline) || { hl: u.dims.L * 0.5, hw: u.dims.W * 0.4 };
        sim.hull(u.p.x, u.p.z, u.yaw || 0, wl.hl, wl.hw, Math.min(9, Math.max(2, u.dims.W * 0.3)), u.speed || 0);
      } else if (ROTARY[u.type] && u.p.y < 32 && isWater(u.p.x, u.p.z)) {   // downwash on the water under a low helicopter / tilt-rotor / drone
        const k = 1 - u.p.y / 32; sim.point(u.p.x, 0, u.p.z, 10 + 16 * k, 0.4 + 0.7 * k, 0, 0, 2 + 3 * k);
      }
    }
    const G = war && war.ground;
    if (G && G.lcacs) for (const q of G.lcacs) if (Math.abs(q.x - c.x) < 260 && Math.abs(q.z - c.z) < 260) { sim.hull(q.x, q.z, q.yaw, 13, 7, 1, q.v || 0); sim.point(q.x, 0, q.z, 22, 0.9, 0, 0, 3); }   // the LCAC: skirt, spray, props
    if (G && G.sim && G.sim.units) for (const u of G.sim.units) if (u.kind === 'hovertank' && u.alive && Math.abs(u.x - c.x) < 200 && Math.abs(u.z - c.z) < 200 && isWater(u.x, u.z)) sim.point(u.x, 0, u.z, 14, 0.8, 0, 0, 2.5);
    if (ctx.extra) ctx.extra(sim);
    sim.enabled = L.fishOn; if (!L.fishOn && sim.schools.length) sim.clear();
    sim.update(dt, c);
    let n = 0;
    if (L.camObj) {   // the camera that last rendered: its forward and field of view for the cull
      const cm = L.camObj, e = cm.matrixWorld.elements, fl = Math.hypot(e[8], e[9], e[10]) || 1, fov = (cm.fov || 60) * Math.PI / 180, asp = cm.aspect || 1.6;
      const half = Math.atan(Math.tan(fov / 2) * Math.hypot(1, asp)) + 0.15;
      Object.assign(_view, { x: c.x, y: c.y, z: c.z, fx: -e[8] / fl, fy: -e[9] / fl, fz: -e[10] / fl, cos: Math.cos(Math.min(half, 3)), px: (ctx.heightPx ? ctx.heightPx() : 720) / fov });
      n = sim.write(A.array, B.array, C.array, MAX, _view);
    } else n = sim.write(A.array, B.array, C.array, MAX);
    geo.instanceCount = n; L.fishDrawn = n; L.culled = sim.culled;
    if (n) { A.addUpdateRange(0, n * 4); B.addUpdateRange(0, n * 4); C.addUpdateRange(0, n * 4); A.needsUpdate = B.needsUpdate = C.needsUpdate = true; }
    // the sea bed: kept warm while the camera is low over the water (so a dive finds it built), stepped a little a frame
    if (c.y < 4 && isWater(c.x, c.z)) { bedWant(c.x, c.z, false); bedStep(500); }
    L.ms = performance.now() - t0;
  };
  L.setEnabled = on => { L.enabled = !!on; if (!on) { sim.clear(); geo.instanceCount = 0; setUnder(false); } };
  L.fishMesh = fishMesh; L.bedMesh = bedMesh;
  return L;
}
