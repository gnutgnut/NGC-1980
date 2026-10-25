// Model check: infantry weapons and the 1980 Marine in his postures (dev/infantry.html?view=model).
// marines stand at x = i * 1.6: stand, aim, walk, sprint, kneel (M203), prone (M60), lean, down
const F = Math.PI - 0.6;   // front three-quarter (they face -z)
const VIEWS = [
  ['weapons', 0, 0.05, 3.0, -3, 1.2, 0], ['m16_q', 0.8, 0.3, 1.3, -3, 1.8, 0], ['m60_q', 0.7, 0.3, 1.6, -3, 1.2, 0],
  ['line_front', Math.PI - 0.2, 0.12, 13, 8.4, 0.8, 0], ['line_back', 0.3, 0.2, 12, 8.4, 0.8, 0],
  ['stand', F, 0.1, 2.6, 0.0, 1.0, 0], ['aim', F, 0.1, 2.4, 2.4, 1.3, 0], ['aim_side', Math.PI / 2, 0.05, 2.2, 2.4, 1.3, 0], ['walk', Math.PI / 2 + 0.3, 0.1, 2.8, 4.8, 1.0, 0],
  ['sprint', F, 0.1, 2.8, 7.2, 1.0, 0], ['kneel', F, 0.15, 2.4, 9.6, 0.8, 0], ['prone', F, 0.35, 3.0, 12.0, 0.3, 0.4], ['prone_side', Math.PI / 2, 0.15, 3.2, 12.0, 0.3, 0.4],
  ['lean', Math.PI, 0.05, 2.6, 14.4, 1.1, 0], ['down', 0.9, 0.5, 3.0, 16.8, 0.2, -0.4],
  // ngc/marine-polish: the kit close up (M67s on the pouches, the bayonet, the e-tool, the ALICE pack), seated, ladder, swim, self aid
  ['kit_front_hip', Math.PI + 0.75, 0.12, 1.5, 0.0, 0.95, 0], ['kit_back', 0.45, 0.2, 1.9, 4.8, 1.15, 0], ['kit_left', -Math.PI / 2, 0.08, 1.6, 0.0, 1.0, 0],
  ['seated', F, 0.15, 2.4, 19.2, 0.6, 0], ['climb', 0.7, 0.1, 2.6, 21.6, 1.3, 0], ['swim', F, 0.35, 3.0, 24.0, 1.0, 0], ['selfaid', F, 0.25, 2.2, 26.4, 0.6, 0],
];
export default async function (h) {
  await h.goto('dev/infantry.html?view=model' + (process.env.HB ? '&hitboxes' : ''));
  await h.waitFor('window.__I', 10000);
  for (const [n, y, p, d, x, yy, z] of VIEWS) {
    await h.eval(`(() => { Object.assign(__I.cam, { yaw: ${y}, pitch: ${p}, dist: ${d} }); __I.cam.t.set(${x}, ${yy}, ${z}); return true; })()`);
    await h.wait(250); await h.shot(n);
  }
}
