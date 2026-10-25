import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(pathToFileURL(new URL('../../game/vendor/three.module.min.js', import.meta.url).pathname).href)}, shortCircuit: true }; return n(s, c); }`));
const { propForces } = await import('../../game/js/units/air/c130fm.js');
const om = 1021 * 2 * Math.PI / 60;
for (const Va of [0, 30, 67, 100, 150, 165]) {
  let line = `Va ${Va}: `;
  for (let b = -6; b <= 70; b += 4) {
    const vi = [10, 10, 10]; let r; for (let i = 0; i < 60; i++) r = propForces(b, Va, om, 1.225, vi, {});
    line += `${b}:${(r.T / 1000).toFixed(0)}k/${(r.Q * om / 745.7).toFixed(0)} `;
  }
  console.log(line);
}
