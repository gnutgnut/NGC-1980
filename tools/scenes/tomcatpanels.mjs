// TOMCAT cockpit close-ups on the preview page (game/dev/tomcat.html): pilot's view, panel, consoles, the HUD in
// LDG and A/A, the RIO's TID / DDD, and the outside. Quick to run: no war, no world.
export default async function (h) {
  const go = async (q, name, wait = 900) => { await h.goto('dev/tomcat.html?ui=0&' + q); await h.waitFor('window.__T', 15000); await h.wait(wait); await h.shot(name); };
  await go('look=0,-0.14', 'pilot-cruise');
  await go('look=0,-0.62', 'pilot-panel');
  await go('look=0.95,-0.7', 'pilot-left-console');
  await go('look=-0.95,-0.7', 'pilot-right-console');
  await go('look=0,0.02&s=' + encodeURIComponent(JSON.stringify({ mode: 'LDG', kias: 135, aoa: 10.5, pitch: 7, gear: 1, flap: 1, hook: 1, alt: 120, rpm: 86, thr: 0.62, cautions: 'HOOK', mc: false })), 'pilot-hud-ldg');
  await go('look=0,0.02&s=' + encodeURIComponent(JSON.stringify({ mode: 'A/A', wpn: 'PH', kias: 420, aoa: 4, pitch: 2, roll: 25, rpm: 98, ab: 0.6, thr: 0.95, sweep: -1, nz: 2.5, launch: true, cautions: '', mc: false })), 'pilot-hud-aa');
  await go('seat=1&look=0,-0.2', 'rio');
  await go('seat=1&look=0,-0.45', 'rio-tid');
  await go('view=orbit&s=' + encodeURIComponent(JSON.stringify({ kias: 600, sweep: 68, ab: 1, rpm: 102 })), 'outside-swept');
}
