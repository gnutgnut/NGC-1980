import * as THREE from '../../game/vendor/three.module.min.js';
const arch = (zc, rr, yc, n = 9, ybot = null) => { const a0 = ybot == null ? 0 : Math.asin((ybot - yc) / rr), p = []; for (let i = 0; i <= n; i++) { const a = a0 + (Math.PI - 2 * a0) * i / n; p.push([zc + Math.cos(a) * rr, yc + Math.sin(a) * rr]); } return p; };
const area = pts => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
function test(name, prof) {
  const v = prof.map(([z, y]) => new THREE.Vector2(z, y)), tris = THREE.ShapeUtils.triangulateShape(v, []);
  let a = 0; for (const [i, j, k] of tris) a += Math.abs(area([prof[i], prof[j], prof[k]]));
  console.log(name, 'poly', Math.abs(area(prof)).toFixed(3), 'tris', a.toFixed(3), tris.length);
}
const ZF = -1.2925, FRONT = -2.09, CAB0 = -0.95, HOOD = 1.05;
test('hilux front', [[FRONT + 0.06, 0.53], [FRONT + 0.04, 0.98], [FRONT + 0.12, 1.01], [CAB0 + 0.15, HOOD], [CAB0 + 0.15, 0.53], ...arch(ZF, 0.47, 0.38, 10, 0.53)]);
const LZF = -1.212, LZR = 1.212, LF = -2.02, LR = 2.05, BELT = 0.92;
test('lada', [[LF, 0.36], [LF - 0.01, 0.80], [LF + 0.06, 0.875], [-0.95, BELT], [1.22, BELT], [LR - 0.05, 0.90], [LR, 0.80], [LR, 0.36], ...arch(LZR, 0.36, 0.32, 10, 0.30), ...arch(LZF, 0.36, 0.32, 10, 0.30)]);
