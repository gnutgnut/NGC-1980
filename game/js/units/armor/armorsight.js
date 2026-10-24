// armorsight.js - the gunner's sight pictures in the GAME (wave 2): the M35E1 day sight and the AN/VSG-2 tank thermal
// sight (TTS) as full-screen views. A 2D overlay draws the eyepiece (vignette, mil reticle, range / round / READY / mode
// read-outs); the thermal view re-renders the game scene in heat greys (every mesh's userData.heat, inherited down the
// tree, else a default; the terrain through its own heat shader: cool sea, sun-warmed slopes) and passes it through a
// green-phosphor shader (scan lines, noise, white-hot / black-hot). Same look as the dev page (game/dev/tank.js).
//
//   const SG = createSight({ canvas (the game's WebGL canvas: the overlay goes right above it, under the HUD) });
//   SG.draw(state)   every frame: state = null (hidden) or { mode: 'day'|'tts'|'chase'|'cupola', fov, V, ... }
//   SG.thermal(renderer, scene, camera, { pol, time, tag(scene) })   render the TTS picture to the screen
import * as THREE from 'three';
import { ROUNDS } from './armorballistics.js';

export function createSight({ canvas }) {
  const ov = document.createElement('canvas'); ov.id = 'armorSight';
  Object.assign(ov.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', visibility: 'hidden' });
  (canvas && canvas.parentNode ? canvas.after(ov) : document.body.appendChild(ov));
  const c = ov.getContext('2d');
  let shown = false;
  const SG = { el: ov };
  function size() { const w = innerWidth, h = innerHeight; if (ov.width !== w || ov.height !== h) { ov.width = w; ov.height = h; } }
  // ------------------------------------------------------------------------------------------------ the overlay
  SG.draw = (s) => {
    if (!s) { if (shown) { ov.style.visibility = 'hidden'; shown = false; } return; }   // (a cleared 2D layer is not always re-composited headless: hide it)
    size(); if (!shown) { ov.style.visibility = 'visible'; shown = true; }
    const W = ov.width, H = ov.height; c.clearRect(0, 0, W, H);
    const pxPerRad = (H / 2) / Math.tan(s.fov * Math.PI / 360), cx = W / 2, cy = H / 2;
    if (s.mode === 'chase' || s.mode === 'cupola') { chaseReticle(s, W, H, pxPerRad); return; }
    if (s.mode === 'binos') {   // the commander's 7x50 binoculars: two overlapping eyepiece circles, the mil reticle (10-mil marks)
      const r = Math.min(W * 0.3, H * 0.47), dx = r * 0.62, cx = W / 2, cy = H / 2;
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);   // black, then cut both eyepieces out of it
      c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(cx - dx, cy, r, 0, Math.PI * 2); c.moveTo(cx + dx + r, cy); c.arc(cx + dx, cy, r, 0, Math.PI * 2); c.fill('nonzero'); c.restore();
      const g = c.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.6); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(12,12,10,0.85)'; c.fillStyle = c.strokeStyle; c.lineWidth = Math.max(1, H / 600); c.font = `${Math.round(H / 60)}px "Courier New", monospace`; c.textAlign = 'center';
      const mil = 1e-3 * pxPerRad, x0 = cx + dx;   // the reticle is in the right eyepiece, as in the M19/M17
      c.beginPath(); c.moveTo(x0 - 50 * mil, cy); c.lineTo(x0 + 50 * mil, cy); c.stroke();
      for (let m = -50; m <= 50; m += 10) { c.beginPath(); c.moveTo(x0 + m * mil, cy - (m ? 5 : 9) * mil * 0.4); c.lineTo(x0 + m * mil, cy); c.stroke(); if (m) c.fillText(String(Math.abs(m / 10)), x0 + m * mil, cy - 5 * mil * 0.4 - 4); }
      for (let m = 5; m <= 20; m += 5) { c.beginPath(); c.moveTo(x0 - 3, cy + m * mil); c.lineTo(x0 + 3, cy + m * mil); c.stroke(); }
      c.beginPath(); c.moveTo(x0, cy); c.lineTo(x0, cy + 20 * mil); c.stroke();
      return;
    }
    const V = s.V, R = Math.min(W, H) * 0.46, tts = s.mode === 'tts', cool = V.ttsCool > 0.95;
    // eyepiece: black outside the circle, a soft dark rim
    c.save(); c.fillStyle = '#000'; c.beginPath(); c.rect(0, 0, W, H); c.arc(cx, cy, R, 0, Math.PI * 2, true); c.fill();
    const g = c.createRadialGradient(cx, cy, R * 0.8, cx, cy, R); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.65)'); c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill(); c.restore();
    const col = tts ? (cool ? 'rgba(170,255,150,0.95)' : 'rgba(170,255,150,0.6)') : 'rgba(18,18,16,0.9)';
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = Math.max(1, H / 500);
    // the aiming cross with a central gap and mil ticks (1 mil = 1/1000 rad)
    const gap = 0.6e-3 * pxPerRad;
    c.beginPath(); c.moveTo(cx - R * 0.9, cy); c.lineTo(cx - gap, cy); c.moveTo(cx + gap, cy); c.lineTo(cx + R * 0.9, cy); c.moveTo(cx, cy + gap); c.lineTo(cx, cy + R * 0.6); c.stroke();
    for (let m = -10; m <= 10; m++) { if (!m) continue; const x = cx + m * 2e-3 * pxPerRad, t = m % 5 ? 4 : 9; if (Math.abs(x - cx) < R * 0.9) { c.beginPath(); c.moveTo(x, cy - t); c.lineTo(x, cy + t); c.stroke(); } }
    for (let m = 2; m <= 8; m += 2) { const y = cy + m * 1e-3 * pxPerRad; if (y - cy < R * 0.6) { c.beginPath(); c.moveTo(cx - 5, y); c.lineTo(cx + 5, y); c.stroke(); } }   // stadia below the centre
    c.beginPath(); c.arc(cx, cy, Math.max(1.5, gap * 0.3), 0, Math.PI * 2); c.fill();
    // read-outs at the bottom of the field: range, round, ready; at the top: sight mode, stab, computer
    c.font = `bold ${Math.round(H / 38)}px "Courier New", monospace`; c.textAlign = 'center';
    const rng = V.laser.range != null ? String(V.laser.range).padStart(4, '0') : '----', gun = V.gun;
    c.fillStyle = tts ? 'rgba(170,255,150,0.95)' : 'rgba(255,90,40,0.95)';
    c.fillText(`${rng}  ${ROUNDS[gun.round || V.next].short}  ${gun.state === 'ready' ? 'READY' : gun.state === 'loading' ? 'LOAD ' : 'EMPTY'}`, cx, cy + R * 0.82);
    c.font = `${Math.round(H / 48)}px "Courier New", monospace`;
    c.fillText(`${tts ? 'TTS ' + V.ttsMag + 'X ' + (V.ttsPolarity === 'wh' ? 'WH' : 'BH') : 'DAY 8X'}   ${V.stabMode === 'STAB RUN-UP' ? 'STAB RUN-UP ' + Math.round(V.gyro * 100) + '%' : V.stabMode || (V.hydP > 0.5 ? (V.stab ? 'STAB' : 'POWER') : 'MANUAL')}${V.fc.solved ? '   COMP ' + V.fc.range : '   BS 1200'}`, cx, cy - R * 0.85);
    if (tts && !cool) c.fillText(`COOLING ${Math.round(V.ttsCool * 100)} %`, cx, cy - R * 0.2);
    if (s.note) { c.font = `${Math.round(H / 52)}px "Courier New", monospace`; c.fillText(s.note, cx, cy - R * 0.74); }   // (under the status line: at the bottom it ran under the HUD hint)
  };
  // chase view / commander's cupola: a light crosshair where the gun (or the .50) points, a ring at the camera's aim
  function chaseReticle(s, W, H, pxPerRad) {
    c.lineWidth = 2;
    if (s.aim) {   // the camera's aim: small open ring
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(W / 2, H / 2, 9, 0, Math.PI * 2); c.stroke();
    }
    if (s.gun) {   // the gun line's point of aim, projected (s.gun = [sx, sy] in pixels or null)
      const [x, y] = s.gun, ok = s.ready;
      c.strokeStyle = ok ? 'rgba(120,255,140,0.95)' : 'rgba(255,190,80,0.9)';
      c.beginPath(); c.moveTo(x - 16, y); c.lineTo(x - 5, y); c.moveTo(x + 5, y); c.lineTo(x + 16, y); c.moveTo(x, y - 16); c.lineTo(x, y - 5); c.moveTo(x, y + 5); c.lineTo(x, y + 16); c.stroke();
      if (s.label) { c.font = `bold ${Math.round(H / 60)}px "Courier New", monospace`; c.fillStyle = c.strokeStyle; c.textAlign = 'left'; c.fillText(s.label, x + 20, y + 18); }
    }
  }

  // ------------------------------------------------------------------------------------------------ the thermal view
  const heatMats = new Map();
  const heatMat = (h, inst) => {
    const k = Math.round(Math.min(1, Math.max(0, h)) * 40) * 2 + (inst ? 1 : 0);
    let m = heatMats.get(k); if (!m) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar((k >> 1) / 40), fog: true }); heatMats.set(k, m); }
    return m;
  };
  // the terrain's heat shader: same vertex shader and uniforms as the game's terrain, a heat fragment
  const terrHeat = new Map();
  function terrainHeat(mat) {
    let m = terrHeat.get(mat); if (m) return m;
    if (!/varying float vRaw/.test(mat.vertexShader || '')) return null;
    m = new THREE.ShaderMaterial({
      uniforms: mat.uniforms, vertexShader: mat.vertexShader, defines: { ...(mat.defines || {}) },
      fragmentShader: `varying vec3 vW; varying float vRaw; uniform vec3 uSun; uniform vec3 uNear; uniform float uFogN, uFogF;
        void main(){
          #ifdef FAR
          if(max(abs(vW.x-uNear.x),abs(vW.z-uNear.y))<uNear.z) discard;
          #endif
          vec3 n=normalize(cross(dFdx(vW),dFdy(vW))); if(n.y<0.) n=-n;
          float h = vRaw <= 0. ? 0.17 + 0.02 * sin(vW.x * .05 + vW.z * .03) : 0.27 + 0.12 * max(dot(n, normalize(uSun)), 0.) + 0.04 * smoothstep(20., 40., vW.y);
          float fd=length((viewMatrix*vec4(vW,1.)).xyz);
          h = mix(h, 0.23, smoothstep(uFogN, uFogF, fd));
          gl_FragColor=vec4(vec3(h),1.);
        }`,
    });
    terrHeat.set(mat, m); return m;
  }
  function heatOf(o) { for (let p = o; p; p = p.parent) if (p.userData && p.userData.heat != null) return p.userData.heat; return null; }
  const swapped = [];
  function swap(scene) {
    scene.traverseVisible(o => {
      if (!(o.isMesh || o.isInstancedMesh)) return;
      const m = o.material; if (Array.isArray(m)) { swapped.push([o, m]); o.material = heatMat(heatOf(o) ?? 0.36, o.isInstancedMesh); return; }
      if (m && m.isShaderMaterial && m.uniforms && m.uniforms.uHM) { const t = terrainHeat(m); if (t) { swapped.push([o, m]); o.material = t; } return; }
      let h = heatOf(o);
      if (h == null) { const r = o.geometry && (o.geometry.boundingSphere || (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere)); h = r && r.radius > 1500 ? 0.1 : m && m.transparent ? 0.22 : 0.36; }   // the sky dome is cold; water / glass cool
      swapped.push([o, m]); o.material = heatMat(h, o.isInstancedMesh);
    });
  }
  function unswap() { for (const [o, m] of swapped) o.material = m; swapped.length = 0; }
  const rt = new THREE.WebGLRenderTarget(16, 16);
  const post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { tex: { value: rt.texture }, time: { value: 0 }, pol: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, gain: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `uniform sampler2D tex; uniform float time; uniform float pol; uniform float gain; uniform vec2 res; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 7.) * 43758.5453); }
      void main(){
        vec2 uv = vUv; float g = texture2D(tex, uv).r;
        g = mix(g, 1. - g, pol);
        float lines = 0.86 + 0.14 * step(0.5, fract(uv.y * res.y / 3.));
        g = clamp((g - 0.16) * 1.65 * gain, 0., 1.) * lines + (h(floor(uv * res / 2.)) - 0.5) * 0.12;
        gl_FragColor = vec4(g * 0.35, g * 1.0, g * 0.32, 1.);
      }`,
    depthTest: false, depthWrite: false,
  }));
  post.frustumCulled = false;
  const postScene = new THREE.Scene(); postScene.add(post); const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const _sz = new THREE.Vector2(), _fog = new THREE.Color(), _bg = { v: null }, _cc = new THREE.Color();
  SG.thermal = (renderer, scene, cam, o = {}) => {
    renderer.getDrawingBufferSize(_sz);
    if (rt.width !== _sz.x || rt.height !== _sz.y) { rt.setSize(_sz.x, _sz.y); post.material.uniforms.res.value.copy(_sz); }
    o.tag?.(scene);
    swap(scene);
    const fog = scene.fog; if (fog) { _fog.copy(fog.color); fog.color.setScalar(0.23); }
    _bg.v = scene.background; scene.background = null;
    renderer.getClearColor(_cc); const ca = renderer.getClearAlpha();
    renderer.setRenderTarget(rt); renderer.setClearColor(0x2e2e2e, 1); renderer.clear(); renderer.render(scene, cam); renderer.setRenderTarget(null); renderer.setClearColor(_cc, ca);
    unswap(); if (fog) fog.color.copy(_fog); scene.background = _bg.v;
    const u = post.material.uniforms; u.time.value = o.time || 0; u.pol.value = o.pol ? 1 : 0; u.gain.value = o.gain ?? 1;
    renderer.render(postScene, postCam);
  };
  SG.dispose = () => { ov.remove(); rt.dispose(); };
  return SG;
}
