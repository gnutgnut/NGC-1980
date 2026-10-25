export default async function (h) {
  await h.goto('dev/c130.html?start=air&view=deck&res=0.5');
  await h.waitFor('window.__C && __C.S.tas > 10', 10000);
  await h.eval(`(__C.head.yaw = -0.35, __C.head.pitch = 0.8, 1)`); await h.wait(800);
  const p = await h.eval(`(() => { const C = __C, hb = C.deck.hitBoxes.find(o => o.userData.sw === "cond0"); const v = new C.THREE.Vector3(); hb.getWorldPosition(v); v.project(C.camera); return { x: Math.round((v.x + 1) / 2 * innerWidth), y: Math.round((1 - v.y) / 2 * innerHeight), w: innerWidth, h: innerHeight }; })()`);
  await h.page.mouse.move(p.x, p.y); await h.wait(500);
  await h.eval(`({ hover: __C.hover, m: __C.mouse.toArray() })`);
}
