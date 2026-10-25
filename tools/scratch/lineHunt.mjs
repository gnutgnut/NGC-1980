export default async function (h) {
  await h.goto('dev/vehicle.html?debug&ui=0&hud=0&v=m151&zone=road&cam=cockpit&paused');
  await h.waitFor('window.__V && __V.sim', 15000);
  await h.wait(800);
  await h.eval(`(__V.cam('cockpit', { headYaw: 0, headPitch: 0 }), 1)`); await h.wait(300);
  await h.shot('base');
  await h.eval(`(() => { let n = 0; __V.scene.traverse(o => { if (o.isMesh && o.geometry.parameters && o.geometry.parameters.depth > 400) { o.visible = false; n++; } }); return n; })()`);
  await h.wait(300); await h.shot('noEdgeLines');
  await h.eval(`(() => { const r = __V.renderer, gl = r.getContext(); return { depthBits: gl.getParameter(gl.DEPTH_BITS), near: __V.camera.near, far: __V.camera.far }; })()`);
}
