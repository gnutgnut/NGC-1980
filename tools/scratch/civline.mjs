// find what the white dashed line in the civ cockpit views is
export default async function (h) {
  await h.goto('dev/vehicle.html?debug&ui=0&hud=0&v=lada&zone=start&cam=cockpit&paused');
  await h.waitFor('window.__V && __V.sim', 15000);
  await h.wait(1200);
  await h.eval(`(__V.cam('cockpit', { headYaw: 0.12, headPitch: -0.42 }), 1)`); await h.wait(400); await h.shot('a-base');
  // hide the road markings (white boxes, not part of the vehicle)
  await h.eval(`(() => { let n = 0; __V.scene.children.forEach(o => { if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === 0xe8e6da) { o.visible = false; n++; } }); return n; })()`);
  await h.wait(300); await h.shot('b-noroadlines');
  await h.eval(`(() => { __V.scene.children.forEach(o => { if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === 0xe8e6da) o.visible = true; }); __V.scene.background.setHex(0xff00ff); return 1; })()`);
  // which side of the car: swap terrain colour to magenta too, keep road lines
  await h.eval(`(() => { const t = __V.scene.children.find(o => o.isMesh && o.geometry.attributes.color && o.geometry.attributes.position.count > 40000); t.visible = false; return 1; })()`);
  await h.wait(300); await h.shot('c-noterrain');
}
