// Naval models on the preview page (dev/ships.html): every ship from several angles, motion frozen, plus draw-call
// and triangle counts. node snap.mjs scenes/shipsdev.mjs [--name x]   (SHIPS=albatross,kraken to pick)
const ALL = {
  albatross: [['a-34', '0.9,0.32,150,0,8,0'], ['a-bowhigh', '-0.5,0.55,110,0,8,-20'], ['a-island', '1.6,0.18,46,10,16,6'], ['a-deck', '2.6,0.5,70,0,8,10'], ['a-stern', '0.15,0.12,95,0,6,40'], ['a-crew', '1.3,0.45,30,6,9,-30'], ['a-side', '1.5708,0.04,150,0,6,0'], ['a-top', '0,1.45,150,0,0,0']],
  kraken: [['k-34', '0.9,0.32,160,0,8,0'], ['k-island', '1.4,0.2,50,10,14,28'], ['k-deck', '2.4,0.55,80,0,8,0'], ['k-side', '-1.5708,0.04,160,0,6,0'], ['k-top', '0,1.45,160,0,0,0']],
  leviathan: [['l-34', '0.8,0.25,110,0,4,0'], ['l-turret', '1.2,0.25,40,0,8,-24'], ['l-side', '1.5708,0.04,110,0,4,0'], ['l-top', '0,1.45,110,0,0,0']],
  container: [['c-34', '0.8,0.28,90,0,6,0'], ['c-bridge', '2.4,0.25,40,0,10,28'], ['c-side', '1.5708,0.04,95,0,5,0'], ['c-top', '0,1.45,95,0,0,0']],
  // PARITY: the task force's MSC freighter and battleship, the KRAKEN's RUNAWAY lift fans (and the ALBATROSS's, to compare)
  msc: [['m-34', '0.8,0.28,90,0,6,0'], ['m-bow', '-0.6,0.22,60,0,6,-20'], ['m-house', '2.3,0.3,36,0,9,8'], ['m-poop', '2.8,0.4,24,0,6,36'], ['m-cargo', '1.2,0.55,34,0,6,-14'], ['m-side', '1.5708,0.04,95,0,5,0'], ['m-portq', '-2.3,0.25,80,0,6,0'], ['m-top', '0,1.45,95,0,0,0'], ['m-stern', '0.25,0.15,45,0,5,38'], ['m-anchor', '-0.9,0.1,26,4,4,-36']],
  iowa: [['i-34', '0.8,0.25,120,0,6,0'], ['i-bow', '-0.55,0.2,70,0,6,-24'], ['i-tower', '1.0,0.2,40,0,9,-10'], ['i-turrets', '0.5,0.35,30,0,5,-24'], ['i-aft', '2.4,0.3,45,0,5,20'], ['i-side', '1.5708,0.04,120,0,5,0'], ['i-top', '0,1.45,120,0,0,0'],
    ['i-train', '0.9,0.2,70,0,6,-6', "for (const t of __S.cur.parts.turrets) { t.rotation.y = (t.userData.aft ? Math.PI : 0) + 0.7; t.userData.barrels.rotation.x = 0.55; } const t3 = __S.cur.parts.turrets[2]; t3.userData.fire(); t3.userData.tick = () => {}; t3.userData.barrels.children[1].scale.set(1.1, 1.1, 1.1);"]],
  krakensky: [['ks-34', '0.9,0.3,170,0,6,0'], ['ks-fan', '1.2,0.25,46,22,6,-38'], ['ks-low', '0.5,0.04,70,20,4,-30'], ['ks-aftport', '-2.2,0.2,60,-24,6,36'], ['ks-top', '0,1.45,170,0,0,0']],
  albsky: [['as-34', '0.9,0.3,170,0,6,0'], ['as-fan', '1.2,0.25,46,22,6,-38']],
};
export default async function (h) {
  const pick = (process.env.SHIPS || Object.keys(ALL).join(',')).split(',');
  for (const ship of pick) {
    await h.goto(`dev/ships.html?ui=0&freeze=1&ship=${ship}`);
    await h.waitFor('window.__S && window.__S.cur', 15000);
    await h.wait(800);
    for (const [name, cam, js] of ALL[ship]) {
      if (js) await h.eval(`(() => { ${js} return true; })()`);
      await h.eval(`(() => { const S = __S, [y, p, d, x, yy, z] = '${cam}'.split(',').map(Number); Object.assign(S.cam, { yaw: y, pitch: p, dist: d }); S.cam.t.set(x || 0, yy || 0, z || 0); return true; })()`);
      await h.wait(700);
      await h.shot(name);
    }
    await h.eval(`(() => { const S = __S; S.render(); const i = S.renderer.info.render; let meshes = 0; S.cur.parts.group.traverse(o => { if (o.isMesh) meshes++; }); return { ship: '${ship}', calls: i.calls, tris: i.triangles, meshes }; })()`);
  }
}
