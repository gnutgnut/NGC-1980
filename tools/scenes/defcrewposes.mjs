// Close-up of the air defence crew poses (crew.js) in a row: sit, hatch, stand, walk, carry, load, kneel, kneel + ears,
// stand + point, stand + ears, and the RUNAWAY TICK idle / walk / work.   node snap.mjs scenes/defcrewposes.mjs
export default async function (h) {
  await h.goto('dev/defence.html?mode=view&unit=lance&drones=0&ui=0&hill=0');
  await h.waitFor('window.__D && __D.unit', 15000);
  await h.eval(`(async () => { __D.pause(); __D.unit.mesh.visible = false; const C = await import('../js/units/defence/crew.js');
    const P = [['sit'], ['hatch'], ['stand'], ['walk', { phase: 1 }], ['carry', { phase: 2 }], ['load', { lift: 0.8 }], ['kneel'], ['kneel', { ears: true }], ['stand', { point: [0, 0.4] }], ['stand', { ears: true }]];
    P.forEach(([st, o], i) => { const c = C.makeCrew(['us', 'sov', 'tank'][i % 3]); c.g.position.set((i - 4.5) * 1.1, st === 'sit' ? 0.5 : 0, 0); c.g.rotation.y = 0.5; c.pose(st, 1, o || {}); __D.scene.add(c.g); });
    ['idle', 'walk', 'work'].forEach((st, i) => { const t = C.makeTick(); t.g.position.set((i - 1) * 1.8, 0, 3); t.pose(st, 1.3); __D.scene.add(t.g); });
    Object.assign(__D.cam, { yaw: 0.25, pitch: 0.12, dist: 9 }); __D.cam.t.set(0, 0.9, 1); return 1; })()`);
  await h.wait(500); await h.shot('poses-front');
  await h.eval(`(Object.assign(__D.cam, { yaw: 1.9, pitch: 0.15, dist: 9 }), 1)`);
  await h.wait(400); await h.shot('poses-side');
}
