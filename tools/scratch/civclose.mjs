export default async function (h) {
  await h.goto('dev/vehicle.html?debug&ui=0&hud=0&v=beetle&zone=start&cam=orbit&paused');
  await h.waitFor('window.__V && __V.sim', 15000);
  await h.wait(800);
  // isolate: which mesh is the black wedge? colour each material differently
  for (const [n, y, p, d] of [['a', 1.9, 0.15, 3.2], ['b', 1.3, 0.35, 2.6]]) {
    await h.eval(`(__V.cam('orbit', { yaw: ${y}, pitch: ${p}, dist: ${d} }), 1)`); await h.wait(300); await h.shot('beetle-' + n);
  }
  await h.eval(`(__V.model.group.traverse(o => { if (o.isMesh && !/beetleBody|tyre|rim|^$/.test(o.name)) o.visible = false; }), 1)`);
  await h.eval(`(__V.cam('orbit', { yaw: 1.9, pitch: 0.15, dist: 3.2 }), 1)`); await h.wait(300); await h.shot('beetle-bodyonly');
  await h.eval(`(__V.model.group.traverse(o => { if (o.isMesh && o.name === '') o.visible = false; }), 1)`); await h.wait(300); await h.shot('beetle-body-noextras');
  await h.eval(`(() => { const out = []; let tris = 0; __V.model.group.traverse(o => { if (o.isMesh) { const t = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; tris += t; out.push(o.name + ':' + t); } }); return { tris, out }; })()`);
  for (const id of ['landrover', 'hilux', 'lada']) { await h.eval(`__V.setVehicle('${id}', {}, 'start').then(() => { let t = 0; __V.model.group.traverse(o => { if (o.isMesh) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return t; })`); }
}
