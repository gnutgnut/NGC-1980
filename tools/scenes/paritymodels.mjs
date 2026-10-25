// Parity unit models on dev/paritymodels.html: the E-2C HAWKEYE (props and rotodome turning, gear, surfaces), the
// BGM-109G GLCM (folded on the booster, fins out, wings out, cruise) and the MIM-23 HAWK section (trained / elevated,
// one missile fired, the MPQ-50 radar). Contract checks: Hawkeye wheel bottoms at y -2.3, wingtips at +-12.28, prop
// plane z -4.55; HAWK userData (yaw / pitch / cells / radar / lamp).        node snap.mjs scenes/paritymodels.mjs
//   PM_PART=hawkeye|glcm|hawk  to run one
const PART = process.env.PM_PART || 'all';
const setCam = (h, c) => h.eval(`(() => { const [y, p, d, x, yy, z] = '${c}'.split(',').map(Number); Object.assign(__V.cam, { yaw: y, pitch: p, dist: d }); __V.cam.t.set(x || 0, yy || 0, z || 0); return 1; })()`);
async function views(h, prefix, list) {
  for (const [name, c, st] of list) {
    if (st) await h.eval(`(__V.set(${JSON.stringify(st)}), 1)`);
    await setCam(h, c); await h.wait(400); await h.shot(`${prefix}_${name}`);
  }
}
export default async function (h) {
  if (PART === 'all' || PART === 'hawkeye') {
    await h.goto('dev/paritymodels.html?model=hawkeye&ui=0');
    await h.waitFor('window.__V', 15000);
    await h.eval(`(() => { const V = __V, T = V.THREE, g = V.model.group; V.render(); g.updateMatrixWorld(true); const out = { stats: V.stats }, bb = new T.Box3();
      const ty = []; g.traverse(o => { if (o.name === 'tyre') { bb.setFromObject(o); ty.push(+bb.min.y.toFixed(3)); } }); out.tyres = ty;
      bb.setFromObject(g); out.box = [bb.min.toArray().map(v => +v.toFixed(2)), bb.max.toArray().map(v => +v.toFixed(2))];
      out.tips = V.model.tips.map(t => t.toArray()); out.props = V.model.parts.props.map(p => p.pg.position.toArray()); window.__chk = out; return out; })()`);
    await h.expect(`__chk.tyres.length >= 4 && __chk.tyres.every(y => Math.abs(y + 2.3) < 0.03)`);
    await h.expect(`Math.abs(__chk.box[1][0] - 12.3) < 0.15 && Math.abs(__chk.box[0][0] + 12.3) < 0.15`);
    await h.expect(`Math.abs(__chk.box[1][1] - 3.28) < 0.12 && __chk.box[0][2] > -9.5 && __chk.box[0][2] < -9.2 && Math.abs(__chk.box[1][2] - 8.3) < 0.35`);
    await h.expect(`__chk.props.every(p => Math.abs(p[2] + 4.55) < 0.01 && Math.abs(Math.abs(p[0]) - 3.66) < 0.01)`);
    await views(h, 'hawkeye', [
      ['front34', '2.4,0.25,30', { eng: [{ prop: 1 }, { prop: 1 }] }],
      ['side', '1.5708,0.03,30'],
      ['rear34', '0.6,0.3,30'],
      ['top', '0.01,1.5,34', { gear: 0 }],
      ['below', '2.2,-0.45,28'],
      ['slowprops', '2.75,0.15,16,0,0,-4', { gear: 1, eng: [{ prop: 0.12 }, { prop: 0.12 }] }],
      ['nose', '2.6,0.12,10,0,0,-7'],
      ['tail', '0.9,0.25,12,0,1.5,7'],
      ['dome', '0.4,0.7,14,0,2.9,1.4', { eng: [{ prop: 1 }, { prop: 1 }] }],
      ['surfaces', '0.8,0.45,26', { surf: { stab: 0.3, ail: 0.4, rud: 0.4, flap: 1 } }],
    ]);
  }
  if (PART === 'all' || PART === 'glcm') {
    await h.goto('dev/paritymodels.html?model=glcm&ui=0&s={"ground":false}');
    await h.waitFor('window.__V', 15000);
    await h.eval(`(() => { const V = __V, T = V.THREE, bb = new T.Box3().setFromObject(V.model.group); window.__chk = { stats: V.stats, len: +(bb.max.z - bb.min.z).toFixed(3), d: +(bb.max.y - bb.min.y).toFixed(3) }; return __chk; })()`);
    await h.expect(`Math.abs(__chk.len - 6.25) < 0.05`);
    await views(h, 'glcm', [
      ['folded_side', '1.5708,0.1,8', { t: 0.0 }],
      ['folded_rear34', '0.6,0.25,6', { t: 0.0 }],
      ['boost_finsout', '2.2,0.25,8', { t: 1.2 }],
      ['boost_rear', '0.3,0.15,6', { t: 1.6 }],
      ['wings_half', '2.4,0.5,8', { t: 3.0 }],
      ['cruise_front34', '2.4,0.35,8', { t: 5 }],
      ['cruise_top', '0.01,1.5,8', { t: 5 }],
      ['cruise_below', '1.9,-0.6,7', { t: 5 }],
    ]);
  }
  if (PART === 'all' || PART === 'hawk') {
    await h.goto('dev/paritymodels.html?model=hawk&ui=0');
    await h.waitFor('window.__V', 15000);
    await h.eval(`(() => { const V = __V, ud = V.model.ud, T = V.THREE; const bb = new T.Box3().setFromObject(V.model.group);
      window.__chk = { stats: ud.stats, type: ud.type, cells: ud.cells.length, radar: !!ud.radar, lamp: !!ud.lamp, team: !!ud.team, box: [bb.min.toArray().map(v => +v.toFixed(2)), bb.max.toArray().map(v => +v.toFixed(2))] }; return __chk; })()`);
    await h.expect(`__chk.type === 'hawk' && __chk.cells === 3 && __chk.radar && __chk.lamp && __chk.team`);
    await views(h, 'hawk', [
      ['front34', '2.5,0.3,15,0.5,1.2,0', { yaw: 0.4, pitch: 0.35 }],
      ['side', '-1.5708,0.12,14,0.5,1.2,0', { yaw: 0, pitch: 0.6 }],
      ['rear34', '-0.6,0.35,15,0.5,1.2,0', { yaw: -0.8, pitch: 1.1 }],
      ['top', '0.01,1.5,20,0.5,0,0', { yaw: 2.2, pitch: 0.05 }],
      ['fired', '2.0,0.25,10,-0.8,1.8,0.4', { yaw: 0.3, pitch: 0.45, fired: 1 }],
      ['launcher_close', '2.9,0.15,7,-0.8,1.6,-0.5', { yaw: 0.0, pitch: 0.2, fired: 0 }],
      ['radar_close', '3.6,0.25,7,3.3,1.8,-1.5'],
      ['radar_side', '5.2,0.2,7,3.3,1.8,-1.5'],
    ]);
  }
}
