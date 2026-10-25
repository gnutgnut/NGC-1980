export default async function (h) {
  await h.goto('dev/c130.html?start=drop&view=deck&res=0.6');
  await h.waitFor('window.__C && __C.S.tas > 10', 10000);
  await h.wait(2500);
  await h.eval(`import('/js/units/air/c130cockpit.js').then(m => (m.DECK_EYE.set(-0.7, 1.2, -9.3), 1))`);
  await h.eval(`(__C.head.yaw = 1.2, __C.head.pitch = -0.3, 1)`); await h.wait(1500); await h.shot('nav_close');
  await h.eval(`import('/js/units/air/c130cockpit.js').then(m => (m.DECK_EYE.set(0.3, 1.25, -9.5), 1))`);
  await h.eval(`(__C.head.yaw = 1.75, __C.head.pitch = -0.35, 1)`); await h.wait(1500); await h.shot('nav_side');
}
