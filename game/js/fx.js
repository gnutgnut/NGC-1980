// Effects that build up over a battle: soft particles (fire, sparks, smoke, spray, dust), burning wrecks that keep
// smoking for minutes, debris that bounces and stays on the ground, scorch marks and craters that never go away, oil
// slicks, wakes and ripples on the sea. Everything is pooled with hard caps (oldest recycled), so a long battle costs
// the same per frame as a short one.
import * as THREE from 'three';

const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}
const softTex = canvasTex(64, (x, s) => {
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.65)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
});
const puffTex = canvasTex(128, (x, s) => {   // lumpy smoke puff: a few overlapping soft blobs
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 9; i++) {
    const cx = s * (0.3 + r() * 0.4), cy = s * (0.3 + r() * 0.4), rr = s * (0.16 + r() * 0.2);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rr); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  }
});

// ------------------------------------------------------------------------------------------- particles
const PVS = `
attribute float aSize; attribute vec4 aCol; varying vec4 vCol; varying float vFog;
uniform float uScale, uFogNear, uFogFar, uFogK;
float wxCurve(float d){ float t=clamp((d-uFogNear)/max(uFogFar-uFogNear,1.),0.,1.); return uFogK>.01?(1.-exp(-uFogK*t))/(1.-exp(-uFogK)):t; }   // WEATHER: the world's fog curve (weather/fogshader.js), radial
void main(){
  vCol=aCol; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
  float z=-mv.z, near=smoothstep(aSize*.6,aSize*.6+5.,z);   // fade out puffs about to swallow the camera
  vCol.a*=near; gl_PointSize=near<.01?0.:min(aSize*uScale/max(z,.1),500.); vFog=wxCurve(length(mv.xyz));
}`;
const PFS_ADD = `uniform sampler2D map; varying vec4 vCol; varying float vFog;
void main(){ float a=texture2D(map,gl_PointCoord).a*vCol.a*(1.-vFog); if(a<.003) discard; gl_FragColor=vec4(vCol.rgb*a,1.); }`;
const PFS_MIX = `uniform sampler2D map; uniform vec3 uFogCol; varying vec4 vCol; varying float vFog;
void main(){ float a=texture2D(map,gl_PointCoord).a*vCol.a; if(a<.004) discard; gl_FragColor=vec4(mix(vCol.rgb,uFogCol,vFog),a*(1.-vFog*.7)); }`;

class Pool {
  constructor(scene, max, additive, tex) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.life = new Float32Array(max); this.L = new Float32Array(max); this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.rgb = new Float32Array(max * 3); this.a = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.wind = new Float32Array(max);
    this.additive = additive;
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uni = { map: { value: tex }, uScale: { value: 600 }, uFogNear: { value: 125 }, uFogFar: { value: 250 }, uFogK: { value: 0 }, uFogCol: { value: new THREE.Color() } };
    this.obj = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.uni, vertexShader: PVS, fragmentShader: additive ? PFS_ADD : PFS_MIX, transparent: true, depthWrite: false,
      blending: additive ? THREE.CustomBlending : THREE.NormalBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    }));
    this.obj.frustumCulled = false; this.obj.renderOrder = additive ? 4 : 3; scene.add(this.obj);
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0, wind = 0) {
    let i = this.n < this.max ? this.n++ : (Math.random() * this.max) | 0;
    const i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z; this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.life[i] = this.L[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.rgb[i3] = r; this.rgb[i3 + 1] = g; this.rgb[i3 + 2] = b;
    this.a[i] = a; this.grav[i] = grav; this.drag[i] = drag; this.wind[i] = wind;
  }
  update(dt, wx, wz) {
    const { p, v } = this;
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      const i3 = i * 3, dr = Math.exp(-this.drag[i] * dt), w = this.wind[i];
      v[i3] = v[i3] * dr + wx * w * dt; v[i3 + 1] = v[i3 + 1] * dr - this.grav[i] * dt; v[i3 + 2] = v[i3 + 2] * dr + wz * w * dt;
      p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
      const t = 1 - this.life[i] / this.L[i], i4 = i * 4;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
      const fade = this.additive ? (1 - t) * (1 - t) : Math.min(1, t * 10) * (1 - t);
      this.col[i4] = this.rgb[i3]; this.col[i4 + 1] = this.rgb[i3 + 1]; this.col[i4 + 2] = this.rgb[i3 + 2]; this.col[i4 + 3] = this.a[i] * fade;
    }
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'aCol', 'aSize']) this.geo.attributes[k].needsUpdate = true;
  }
  kill(i) {   // swap the last live particle into slot i
    const j = --this.n; if (i === j) return;
    const c3 = (A) => { A[i * 3] = A[j * 3]; A[i * 3 + 1] = A[j * 3 + 1]; A[i * 3 + 2] = A[j * 3 + 2]; };
    c3(this.p); c3(this.v); c3(this.rgb);
    for (const A of [this.life, this.L, this.s0, this.s1, this.a, this.grav, this.drag, this.wind, this.size]) A[i] = A[j];
  }
}

// ------------------------------------------------------------------------------------------- flat decals
// One instanced quad layer per blend mode. Each decal: position, yaw, size (can grow), opacity (can fade), tile in a
// 2x2 atlas: 0 scorch, 1 ring, 2 foam, 3 oil.
const decalAtlas = canvasTex(256, (x, s) => {
  const h = s / 2;
  let seed = 3; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  {   // scorch: dark blotch with ragged edge and a burnt core
    const g = x.createRadialGradient(h / 2, h / 2, 0, h / 2, h / 2, h / 2); g.addColorStop(0, 'rgba(10,8,6,.95)'); g.addColorStop(.55, 'rgba(25,20,15,.75)'); g.addColorStop(1, 'rgba(30,25,20,0)');
    x.fillStyle = g; x.fillRect(0, 0, h, h);
    for (let i = 0; i < 26; i++) { const a = r() * 6.283, d = h * (0.18 + r() * 0.25), rr = h * (0.03 + r() * 0.07); x.fillStyle = `rgba(15,12,9,${0.3 + r() * 0.4})`; x.beginPath(); x.arc(h / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, rr, 0, 6.283); x.fill(); }
  }
  {   // ring (shockwave / ripple)
    const g = x.createRadialGradient(h * 1.5, h / 2, h * 0.3, h * 1.5, h / 2, h / 2); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.7, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(h, 0, h, h);
  }
  {   // foam: speckled white blob
    for (let i = 0; i < 60; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * h * 0.42, rr = h * (0.02 + r() * 0.05); x.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.5})`; x.beginPath(); x.arc(h / 2 + Math.cos(a) * d, h * 1.5 + Math.sin(a) * d, rr, 0, 6.283); x.fill(); }
  }
  {   // oil: dark sheen with a rainbow edge
    const g = x.createRadialGradient(h * 1.5, h * 1.5, 0, h * 1.5, h * 1.5, h / 2); g.addColorStop(0, 'rgba(8,8,12,.85)'); g.addColorStop(.6, 'rgba(20,15,35,.6)'); g.addColorStop(.8, 'rgba(60,40,90,.35)'); g.addColorStop(.9, 'rgba(40,90,70,.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(h, h, h, h);
  }
});
const DVS = `attribute vec4 aD; varying vec2 vUv; varying float vA; varying float vFog; uniform float uFogNear, uFogFar, uFogK;
float wxCurve(float d){ float t=clamp((d-uFogNear)/max(uFogFar-uFogNear,1.),0.,1.); return uFogK>.01?(1.-exp(-uFogK*t))/(1.-exp(-uFogK)):t; }
void main(){ vA=aD.z; float tx=mod(aD.w,2.), ty=floor(aD.w/2.); vUv=vec2((uv.x+tx)*.5,(uv.y+1.-ty)*.5);   // tile 0,1 top row of the canvas
  vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; vFog=wxCurve(length(mv.xyz)); }`;
const DFS = `uniform sampler2D map; uniform vec3 uTint; varying vec2 vUv; varying float vA; varying float vFog;
void main(){ vec4 c=texture2D(map,vUv); float a=c.a*vA*(1.-vFog); if(a<.004) discard; gl_FragColor=vec4(c.rgb*uTint,a); }`;
class Decals {
  constructor(scene, max, renderOrder) {
    this.max = max; this.n = 0; this.next = 0; this.items = [];
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.ad = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); this.ad.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aD', this.ad);
    this.uni = { map: { value: decalAtlas }, uTint: { value: new THREE.Color(1, 1, 1) }, uFogNear: { value: 125 }, uFogFar: { value: 250 }, uFogK: { value: 0 } };
    this.mesh = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ uniforms: this.uni, vertexShader: DVS, fragmentShader: DFS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), max);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = renderOrder; scene.add(this.mesh);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.pv = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0); this.nrm = new THREE.Vector3(); this.qy = new THREE.Quaternion();
  }
  // d: { x, y, z, size, grow, a, life (Infinity = permanent), tile, yaw, n (surface normal, optional) }
  add(d) {
    const i = this.next; this.next = (this.next + 1) % this.max; this.n = Math.min(this.max, this.n + 1); this.mesh.count = this.n;
    d.t = 0; d.yaw ??= rnd(6.283); d.grow ??= 0; d.life ??= Infinity; d.a0 = d.a ?? 1; this.items[i] = d; this.write(i, d);
  }
  write(i, d) {
    const k = d.life === Infinity ? 1 : 1 - d.t / d.life, sz = d.size + d.grow * d.t;
    this.qy.setFromAxisAngle(this.up, d.yaw);
    if (d.n) this.q.setFromUnitVectors(this.up, this.nrm.copy(d.n)).multiply(this.qy); else this.q.copy(this.qy);
    this.m.compose(this.pv.set(d.x, d.y, d.z), this.q, this.s.set(sz, 1, sz)); this.mesh.setMatrixAt(i, this.m);
    this.ad.setXYZW(i, 0, 0, d.a0 * (d.fadeIn ? Math.min(1, d.t / d.fadeIn) : 1) * (d.life === Infinity ? 1 : Math.pow(Math.max(0, k), d.pow ?? 1)), d.tile);
    this.dirty = true;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      const d = this.items[i]; if (!d || d.life === Infinity) continue;
      d.t += dt; if (d.follow) { d.x += d.follow.vx * dt; d.z += d.follow.vz * dt; }
      if (d.t >= d.life) { this.ad.setZ(i, 0); this.items[i] = null; this.dirty = true; continue; }
      this.write(i, d);
    }
    if (this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.ad.needsUpdate = true; this.dirty = false; }
  }
}

// ------------------------------------------------------------------------------------------- debris
class Debris {
  constructor(scene, max) {
    this.max = max; this.next = 0; this.items = [];
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.count = 0; this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new THREE.Vector3(); this.pv = new THREE.Vector3(); this.c = new THREE.Color();
  }
  add(x, y, z, vx, vy, vz, size, color, smoky) {
    const i = this.next; this.next = (this.next + 1) % this.max; this.mesh.count = Math.max(this.mesh.count, i + 1);
    this.items[i] = { x, y, z, vx, vy, vz, rx: rnd(6), ry: rnd(6), rz: rnd(6), wx: rnd(-9, 9), wy: rnd(-9, 9), wz: rnd(-9, 9), sx: size * rnd(0.5, 1.4), sy: size * rnd(0.3, 0.9), sz: size * rnd(0.5, 1.4), moving: true, sink: 0, smoky };
    this.c.set(color).multiplyScalar(rnd(0.6, 1.1)); this.mesh.setColorAt(i, this.c); this.mesh.instanceColor.needsUpdate = true;
    this.write(i);
  }
  write(i) {
    const d = this.items[i]; this.q.setFromEuler(this.e.set(d.rx, d.ry, d.rz));
    this.m.compose(this.pv.set(d.x, d.y - d.sink, d.z), this.q, this.s.set(d.sx, d.sy, d.sz)); this.mesh.setMatrixAt(i, this.m);
  }
  update(dt, fx) {
    let any = false;
    for (let i = 0; i < this.items.length; i++) {
      const d = this.items[i]; if (!d || !d.moving) continue; any = true;
      d.vy -= 18 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += d.wx * dt; d.ry += d.wy * dt; d.rz += d.wz * dt;
      if (d.smoky && Math.random() < 0.5) fx.mix.spawn(d.x, d.y, d.z, 0, 0.5, 0, rnd(1, 2), 0.6, 2.2, .15, .14, .13, 0.45, -0.4, 1, 0.5);
      const gy = fx.groundY(d.x, d.z);
      if (d.y < gy + d.sy * 0.5) {
        if (fx.isWater(d.x, d.z)) {   // splash and sink
          if (!d.sinking) { d.sinking = true; fx.splash(d.x, d.z, 0.4); }
          d.vx *= 0.9; d.vz *= 0.9; d.vy = Math.max(d.vy, -1); d.sink += dt * 1.5; if (d.sink > 3) { d.moving = false; d.sink = 50; }
        } else if (Math.abs(d.vy) < 2.5) { d.y = gy + d.sy * 0.45; d.moving = false; d.rx = Math.round(d.rx / 1.571) * 1.571; d.rz = Math.round(d.rz / 1.571) * 1.571; }   // comes to rest, flat
        else { d.y = gy + d.sy * 0.5; d.vy *= -0.35; d.vx *= 0.55; d.vz *= 0.55; d.wx *= 0.5; d.wz *= 0.5; }
      }
      this.write(i);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------------------------------- the effects system
export function createFx(scene, { groundY, isWater, normalAt }) {
  const fx = {
    add: new Pool(scene, 5000, true, softTex), mix: new Pool(scene, 6000, false, puffTex),
    scorch: new Decals(scene, 450, 1), water: new Decals(scene, 900, 2), debris: new Debris(scene, 700),
    emitters: [], wind: new THREE.Vector2(1.2, 0.5), shake: 0, groundY, isWater, time: 0, ear: new THREE.Vector3(),
    setView(cam, heightPx, fog) {
      const sc = heightPx / (2 * Math.tan(cam.fov * Math.PI / 360));
      for (const p of [fx.add, fx.mix]) { p.uni.uScale.value = sc; p.uni.uFogNear.value = fog.near; p.uni.uFogFar.value = fog.far; p.uni.uFogK.value = fog.k || 0; p.uni.uFogCol.value.copy(fog.color).convertLinearToSRGB(); }   // WEATHER: fog.k = the curve; colour in display space (the shader writes it raw)
      for (const d of [fx.scorch, fx.water]) { d.uni.uFogNear.value = fog.near; d.uni.uFogFar.value = fog.far; d.uni.uFogK.value = fog.k || 0; }
    },
    // ---- recipes
    flash(x, y, z, s) { fx.add.spawn(x, y, z, 0, 0, 0, 0.16, 5 * s, 10 * s, 1, .85, .55, 1); },
    explode(x, y, z, s = 1, o = {}) {
      const gy = groundY(x, z), wet = isWater(x, z), low = y - gy < 2.5 + 2 * s;
      fx.flash(x, y, z, s);
      for (let i = 0; i < 6 + 8 * s; i++) {   // fireball
        const a = rnd(6.283), e = rnd(-0.3, 1), sp = rnd(1.5, 6) * Math.sqrt(s), h = Math.sqrt(1 - e * e);
        fx.add.spawn(x + rnd(-.5, .5) * s, y + rnd(-.3, .5) * s, z + rnd(-.5, .5) * s, Math.cos(a) * h * sp, e * sp + 1, Math.sin(a) * h * sp, rnd(0.35, 0.8), 1.6 * s, 4.2 * s, 1, rnd(.45, .7), rnd(.1, .25), 0.85, -2, 2.5);
      }
      for (let i = 0; i < 8 + 10 * s; i++) {   // sparks / burning bits
        const a = rnd(6.283), e = rnd(-0.2, 1), sp = rnd(12, 30), h = Math.sqrt(1 - e * e);
        fx.add.spawn(x, y, z, Math.cos(a) * h * sp, e * sp, Math.sin(a) * h * sp, rnd(0.5, 1.3), 0.35, 0.2, 1, rnd(.6, .9), .3, 1, 16, 0.6);
      }
      for (let i = 0; i < 5 + 6 * s; i++) {   // smoke left hanging over the spot
        const sh = rnd(.08, .2);
        fx.mix.spawn(x + rnd(-1, 1) * s, y + rnd(0, 1) * s, z + rnd(-1, 1) * s, rnd(-1.5, 1.5), rnd(1, 4), rnd(-1.5, 1.5), rnd(3, 7), 1.5 * s, 7 * s + 4, sh, sh * .95, sh * .9, 0.55, -0.5, 1.2, 1);
      }
      if (wet && low) {
        fx.splash(x, z, s);
        if (o.oil) fx.water.add({ x, y: 0.12, z, size: 6 * s, grow: 0.15, a: 0.8, life: 150, tile: 3, fadeIn: 1 });
      } else if (low) {
        for (let i = 0; i < 10 + 6 * s; i++) {   // dust kicked out along the ground
          const a = rnd(6.283), sp = rnd(6, 14) * Math.sqrt(s);
          fx.mix.spawn(x, gy + 0.6, z, Math.cos(a) * sp, rnd(0.3, 2), Math.sin(a) * sp, rnd(1.2, 2.6), s, 4 * s, .45, .38, .28, 0.5, 0.5, 2, 0.6);
        }
        fx.scorch.add({ x, y: gy + 0.08, z, size: (o.crater ?? 3.2) * s, a: 0.9, tile: 0, n: normalAt(x, z) });
        fx.water.add({ x, y: gy + 0.25, z, size: 2 * s, grow: 40 * s, a: 0.5, life: 0.45, tile: 1, n: normalAt(x, z), pow: 2 });
      }
      const nd = o.debris ?? Math.round(4 * s);
      for (let i = 0; i < nd; i++) { const a = rnd(6.283), sp = rnd(5, 14) * Math.sqrt(s); fx.debris.add(x, y + 0.5, z, Math.cos(a) * sp, rnd(6, 16) * Math.sqrt(s), Math.sin(a) * sp, rnd(0.25, 0.6) * Math.sqrt(s), o.color ?? 0x3a3530, i < nd / 3); }
      if (o.fire) fx.burn(x, low ? gy : y, z, o.fire, s);
      const near = Math.max(0, 1 - Math.hypot(x - fx.ear.x, y - fx.ear.y, z - fx.ear.z) / (50 * Math.sqrt(s)));
      fx.shake = Math.min(1.5, fx.shake + 0.35 * s * near * (o.shake ?? 1));
    },
    // a fire that burns for `secs`, then smoulders as long again (wrecks, hit fuel tanks)
    burn(x, y, z, secs, s = 1, follow = null) {
      if (fx.emitters.length > 70) fx.emitters.shift();
      const e = { x, y, z, t: secs, smoulder: secs * 1.5 + 30, s, acc: 0, follow }; fx.emitters.push(e); return e;
    },
    chimney(x, y, z, s = 1) { const e = { x, y, z, t: Infinity, s, acc: 0, kind: 'chimney' }; fx.emitters.push(e); return e; },
    splash(x, z, s = 1) {
      for (let i = 0; i < 10 + 14 * s; i++) {
        const a = rnd(6.283), r = rnd(0, 1) * s, up = rnd(6, 16) * Math.sqrt(s);
        fx.mix.spawn(x + Math.cos(a) * r, 0.3, z + Math.sin(a) * r, Math.cos(a) * rnd(1, 4), up, Math.sin(a) * rnd(1, 4), rnd(0.9, 1.9), 0.6 * s + 0.4, 2.4 * s + 1, .85, .92, .97, 0.75, 15, 0.8);
      }
      fx.water.add({ x, y: 0.1, z, size: 2 * s, grow: 7 * s, a: 0.7, life: 2.2, tile: 1, pow: 1.5 });
      fx.water.add({ x, y: 0.11, z, size: 3 * s, grow: 1.2, a: 0.8, life: 9, tile: 2 });
    },
    impact(x, y, z, kind) {   // a bullet hitting something: 'ground' | 'water' | 'metal'
      if (kind === 'water') { for (let i = 0; i < 5; i++) fx.mix.spawn(x, 0.2, z, rnd(-1, 1), rnd(3, 7), rnd(-1, 1), rnd(0.5, 0.9), 0.4, 1.1, .85, .92, .97, 0.7, 14, 0.5); fx.water.add({ x, y: 0.1, z, size: 0.6, grow: 3, a: 0.6, life: 1.2, tile: 1 }); return; }
      for (let i = 0; i < 5; i++) fx.add.spawn(x, y, z, rnd(-6, 6), rnd(2, 8), rnd(-6, 6), rnd(0.15, 0.4), 0.3, 0.15, 1, .8, .4, 1, 14, 0.5);
      if (kind === 'ground') { for (let i = 0; i < 3; i++) fx.mix.spawn(x, y + 0.2, z, rnd(-1, 1), rnd(1, 3), rnd(-1, 1), rnd(0.8, 1.6), 0.5, 2, .45, .38, .28, 0.5, 1, 1.5, 0.5); if (Math.random() < 0.15) fx.scorch.add({ x, y: y + 0.06, z, size: 0.7, a: 0.6, tile: 0, n: normalAt(x, z) }); }
      else fx.mix.spawn(x, y, z, 0, 1, 0, 0.8, 0.4, 1.6, .2, .2, .2, 0.4, -0.5, 1);
    },
    flak(x, y, z) {   // anti-aircraft burst: a flash and a hanging black puff
      fx.add.spawn(x, y, z, 0, 0, 0, 0.12, 3, 5, 1, .8, .5, 1);
      for (let i = 0; i < 5; i++) fx.mix.spawn(x + rnd(-.6, .6), y + rnd(-.6, .6), z + rnd(-.6, .6), rnd(-1, 1), rnd(-1, 1), rnd(-1, 1), rnd(2.5, 4.5), 1.4, 4.5, .07, .07, .07, 0.75, -0.2, 1.5, 0.7);
      for (let i = 0; i < 6; i++) fx.add.spawn(x, y, z, rnd(-14, 14), rnd(-14, 14), rnd(-14, 14), rnd(0.2, 0.4), 0.3, 0.2, 1, .7, .3, 1, 8, 0.5);
    },
    // a ship's wake: foam patches left on the water behind the stern
    wake(x, z, s = 1) { fx.water.add({ x: x + rnd(-1, 1) * s, y: 0.1, z: z + rnd(-1, 1) * s, size: 3 * s, grow: 0.9 * s, a: 0.55, life: 22, tile: 2, pow: 1.3 }); },
    trail(x, y, z, k = 1) { fx.mix.spawn(x, y, z, rnd(-.3, .3), rnd(0.2, 0.8), rnd(-.3, .3), rnd(1.5, 3) * k, 0.6, 2.6 * k, .3, .3, .3, 0.5, -0.3, 1, 0.6); },
    update(dt) {
      fx.time += dt;
      if (!fx.windHold) fx.wind.set(1.4 * Math.cos(fx.time * 0.013) + 0.6, 1.4 * Math.sin(fx.time * 0.011));   // WEATHER: weather/index.js sets fx.wind from the weather (windHold)
      for (let i = fx.emitters.length - 1; i >= 0; i--) {
        const e = fx.emitters[i];
        if (e.follow) { e.x = e.follow.x + (e.ox || 0); e.y = e.follow.y + (e.oy || 0); e.z = e.follow.z + (e.oz || 0); if (e.follow.gone) e.follow = null; }
        if (e.kind === 'chimney') {
          if (e.off) continue;
          e.acc += dt * 7 * e.s; while (e.acc > 1) { e.acc--; const g = rnd(.62, .78); fx.mix.spawn(e.x + rnd(-.3, .3), e.y, e.z + rnd(-.3, .3), rnd(-.3, .3), rnd(2, 3), rnd(-.3, .3), rnd(6, 10), 1.2, 7 * e.s, g, g, g * 1.03, 0.32, -0.12, 0.6, 1.3); }
          continue;
        }
        const burning = e.t > 0; e.t -= dt; if (!burning) e.smoulder -= dt;
        if (!burning && e.smoulder <= 0) { fx.emitters.splice(i, 1); continue; }
        e.acc += dt * (burning ? 14 : 4) * Math.sqrt(e.s);
        while (e.acc > 1) {
          e.acc--;
          if (burning) {
            fx.add.spawn(e.x + rnd(-.7, .7) * e.s, e.y + rnd(0, .4), e.z + rnd(-.7, .7) * e.s, rnd(-.5, .5), rnd(2, 4.5), rnd(-.5, .5), rnd(0.35, 0.8), 1.3 * e.s, 0.4 * e.s, 1, rnd(.4, .65), .12, 0.8, -1.5, 1, 0.3);
            if (Math.random() < 0.6) { const d = rnd(.05, .13); fx.mix.spawn(e.x, e.y + 1.2 * e.s, e.z, rnd(-.4, .4), rnd(3, 5), rnd(-.4, .4), rnd(6, 11), 1.4 * e.s, 9 * e.s + 3, d, d, d, 0.6, -0.25, 0.4, 1.4); }
          } else { const g = rnd(.2, .3); fx.mix.spawn(e.x + rnd(-.5, .5), e.y + 0.3, e.z + rnd(-.5, .5), rnd(-.2, .2), rnd(1.2, 2.2), rnd(-.2, .2), rnd(5, 9), 0.8 * e.s, 5 * e.s + 2, g, g, g, 0.35, -0.15, 0.5, 1.4); }
        }
      }
      fx.add.update(dt, fx.wind.x, fx.wind.y); fx.mix.update(dt, fx.wind.x, fx.wind.y);
      fx.scorch.update(dt); fx.water.update(dt); fx.debris.update(dt, fx);
      fx.shake *= Math.exp(-4 * dt);
    },
    clear() {
      fx.add.n = fx.mix.n = 0; fx.emitters = fx.emitters.filter(e => e.kind === 'chimney');
      for (const d of [fx.scorch, fx.water]) { d.n = 0; d.next = 0; d.items = []; d.mesh.count = 0; }
      fx.debris.items = []; fx.debris.next = 0; fx.debris.mesh.count = 0;
    },
  };
  return fx;
}
