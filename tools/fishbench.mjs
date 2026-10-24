// SEALIFE (ngc/waterfish): the fish simulation (game/js/units/naval/fishsim.js) in node, no browser.
//   node tools/fishbench.mjs
// The sea bed is a test beach (a 1 in 12 slope from the shore at x = 0 out to a 14 m floor, like the zone's sea floor)
// plus a run on the real archipelago heights (world.js islandH).
import { createFishSim, SPECIES, SPECIES_INDEX, FISH, tailBeatHz } from '../game/js/units/naval/fishsim.js';
import { islandH, ISLANDS } from '../game/js/world.js';

let pass = 0, fail = 0;
const check = (ok, name, got, want) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(70)} ${got}${want ? `   (want ${want})` : ''}`); };
const beach = (x, z) => Math.max(-14, Math.min(6, -x / 12));   // land for x < 0, 14 m deep from x = 168
const run = (S, secs, cam, dt = 1 / 30, each) => { for (let t = 0; t < secs; t += dt) { if (each) each(t); S.update(dt, cam); } };
const fishOf = (S, key) => S.fish().filter(f => f.sp === key);
const mean = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);

// 1. Bainbridge 1958: U = L (3 f - 4) / 4
{
  const f = tailBeatHz(0.4, 0.2), back = 0.2 * (3 * f - 4) / 4;
  check(Math.abs(f - 4) < 1e-9 && Math.abs(back - 0.4) < 1e-9, 'tail beat: Bainbridge U = L(3f-4)/4 (0.2 m fish at 2 BL/s = 4 Hz)', `${f.toFixed(2)} Hz`, '4.00');
}

// 2. spawning round the camera, each species in its own water
{
  const S = createFishSim({ depthAt: beach, seed: 3 });
  run(S, 6, { x: 60, y: 8, z: 0 });
  const fs = S.fish(), kinds = new Set(fs.map(f => f.sp));
  check(S.schools.length >= 4 && fs.length > 100, 'schools spawn round a camera over a beach', `${S.schools.length} schools, ${fs.length} fish, kinds ${[...kinds].join(' ')}`);
  check(fs.length <= FISH.MAX_FISH, 'never more than the fish budget', `${fs.length}`, `<= ${FISH.MAX_FISH}`);
  const bad = S.schools.filter(sc => { const sp = SPECIES[sc.sp], d = -beach(sc.cx, sc.cz); return d < sp.water[0] - 1.5 || d > sp.water[1] + 1.5; });
  check(bad.length === 0, 'every school is over water that suits its species', `${bad.length} misplaced`);
  const mul = S.schools.filter(sc => SPECIES[sc.sp].key === 'mullet'), amb = S.schools.filter(sc => SPECIES[sc.sp].key === 'amberjack');
  check(mul.every(sc => -beach(sc.cx, sc.cz) < 6) && amb.every(sc => -beach(sc.cx, sc.cz) > 6), 'mullet in the shallows, amberjack out deep', `mullet at ${mul.map(s => (-beach(s.cx, s.cz)).toFixed(1)).join(',') || '-'} m, amberjack at ${amb.map(s => (-beach(s.cx, s.cz)).toFixed(1)).join(',') || '-'} m`);
}

// 3. schooling and swimming: a sardine school and a mackerel school left alone for 40 s
{
  const S = createFishSim({ depthAt: beach, seed: 5 }); S.enabled = true;
  const cam = { x: 120, y: 2, z: 0 };
  FISH.MAX_SCHOOLS_SAVE = FISH.MAX_SCHOOLS; FISH.MAX_SCHOOLS = 2;
  const sar = S.spawnSchool('sardine', 120, 0), mac = S.spawnSchool('mackerel', 140, 30);
  let inWater = true, maxY = -1e9, belowBed = 0;
  run(S, 40, cam, 1 / 30, () => { for (const f of S.fish()) { maxY = Math.max(maxY, f.y); if (f.y < beach(f.x, f.z) + 0.1) belowBed++; } });
  FISH.MAX_SCHOOLS = FISH.MAX_SCHOOLS_SAVE;
  inWater = maxY <= -0.18 + 1e-6;
  check(inWater && belowBed === 0, 'fish stay in the water: under the surface, over the bed', `top ${maxY.toFixed(2)} m, under the bed ${belowBed}`);
  for (const sc of [sar, mac]) {
    const sp = SPECIES[sc.sp], fs = S.fish().filter(f => f.school === sc);
    // nearest-neighbour distance in body lengths, polarisation (how aligned the school is), speed in BL/s
    const nnd = mean(fs.map(f => Math.min(...fs.filter(g => g !== f).map(g => Math.hypot(g.x - f.x, g.y - f.y, g.z - f.z))) / f.len));
    let px = 0, pz = 0; for (const f of fs) { const v = Math.hypot(f.vx, f.vz) || 1; px += f.vx / v; pz += f.vz / v; }
    const pol = Math.hypot(px, pz) / fs.length, bls = mean(fs.map(f => Math.hypot(f.vx, f.vy, f.vz) / f.len));
    check(nnd > 0.5 && nnd < 2.6, `${sp.name}: nearest neighbour ~1 BL (Pitcher & Partridge 1979)`, `${nnd.toFixed(2)} BL`, '0.5-2.6');
    check(pol > 0.6, `${sp.name}: a school, not a swarm (polarisation)`, pol.toFixed(2), '> 0.6');
    check(bls > sp.cruise * 0.6 && bls < sp.cruise * 1.6, `${sp.name}: cruising ~${sp.cruise} BL/s (Videler 1993)`, `${bls.toFixed(2)} BL/s`);
  }
}

// 4. a ship comes through: the fish get out of the way (aside and down) and none is left inside the hull
{
  const S = createFishSim({ depthAt: beach, seed: 7 });
  const cam = { x: 150, y: 2, z: 0 }; FISH.MAX_SCHOOLS_SAVE = FISH.MAX_SCHOOLS; FISH.MAX_SCHOOLS = 0;
  const sc = S.spawnSchool('mackerel', 150, 0); FISH.MAX_SCHOOLS = FISH.MAX_SCHOOLS_SAVE;
  run(S, 5, cam);
  const y0 = mean(S.fish().map(f => f.y));
  // a 60 m ship, 4 m draft, 6 m/s, heading +z (yaw = PI: forward = (-sin, -cos) = (0, +1)), passing over the school
  let z = -90, inside = 0, maxFear = 0; const hl = 30, hw = 6, dr = 4;
  for (let t = 0; t < 30; t += 1 / 30) {
    z += 6 / 30; S.clearThreats(); S.hull(150, z, Math.PI, hl, hw, dr, 6); S.update(1 / 30, cam);
    for (const f of S.fish()) { maxFear = Math.max(maxFear, f.fear); if (Math.abs(f.x - 150) < hw - 0.5 && Math.abs(f.z - z) < hl - 1 && f.y > -dr + 0.5) inside++; }
  }
  check(maxFear > 0.7 && S.stats.fled >= 1, 'a ship under way frightens the school', `fear ${maxFear.toFixed(2)}, schools fled ${S.stats.fled}`);
  check(inside < 3, 'no fish rides inside the hull (fish x frames)', `${inside}`, '< 3');
  const fs = S.fish(), y1 = mean(fs.map(f => f.y)), off = mean(fs.map(f => Math.abs(f.x - 150)));
  check(off > hw + 1, 'they went aside (mean distance off the keel line after it passed)', `${off.toFixed(1)} m`, `> ${hw + 1}`);
  check(y1 < y0 + 0.5, 'and down, not up', `mean depth ${(-y0).toFixed(1)} -> ${(-y1).toFixed(1)} m`);
  S.clearThreats(); run(S, 20, cam); const calm = Math.max(...S.fish().map(f => f.fear));
  check(calm < 0.15, 'and calm down again once it is gone', calm.toFixed(2), '< 0.15');
}

// 5. rotor downwash on the surface: shallow fish under a hovering helicopter scatter
{
  const S = createFishSim({ depthAt: beach, seed: 9 }); FISH.MAX_SCHOOLS_SAVE = FISH.MAX_SCHOOLS; FISH.MAX_SCHOOLS = 0;
  const sc = S.spawnSchool('sardine', 100, 0); FISH.MAX_SCHOOLS = FISH.MAX_SCHOOLS_SAVE; const cam = { x: 100, y: 15, z: 0 };
  run(S, 4, cam);
  const mine = () => S.fish().filter(f => f.school === sc);
  const cx = sc.cx, cz = sc.cz, d0 = mean(mine().map(f => Math.hypot(f.x - cx, f.z - cz)));
  run(S, 4, cam, 1 / 30, () => { S.clearThreats(); S.point(cx, 0, cz, 16, 1, 0, 0, 3); });
  const d1 = mean(mine().map(f => Math.hypot(f.x - cx, f.z - cz)));
  check(d1 > d0 + 4, 'downwash: the school opens out from under the rotor', `${d0.toFixed(1)} -> ${d1.toFixed(1)} m from the wash`);
}

// 6. a swimmer: fish keep their distance (a few metres), do not bolt across the bay
{
  const S = createFishSim({ depthAt: beach, seed: 11 }); FISH.MAX_SCHOOLS_SAVE = FISH.MAX_SCHOOLS; FISH.MAX_SCHOOLS = 0;
  const sc = S.spawnSchool('mullet', 30, 0); FISH.MAX_SCHOOLS = FISH.MAX_SCHOOLS_SAVE; const cam = { x: 30, y: 1, z: 0 };
  run(S, 3, cam); let minD = 1e9; const sx = sc.cx, sz = sc.cz;
  run(S, 6, cam, 1 / 30, t => { S.clearThreats(); S.point(sx, -0.5, sz, 5, 0.7, 0, 0, 3); if (t > 2) for (const f of S.fish().filter(f => f.school === sc)) minD = Math.min(minD, Math.hypot(f.x - sx, f.z - sz)); });
  check(minD > 1.2, 'a swimmer: the mullet keep clear of him', `closest ${minD.toFixed(1)} m`, '> 1.2');
}

// 7. a blast in the water: fish near it stunned or killed, float up belly-up; the stunned ones recover; nothing far off
{
  const S = createFishSim({ depthAt: beach, seed: 13 }); FISH.MAX_SCHOOLS_SAVE = FISH.MAX_SCHOOLS; FISH.MAX_SCHOOLS = 0;
  const a = S.spawnSchool('mackerel', 150, 0), b = S.spawnSchool('sardine', 150, 60); FISH.MAX_SCHOOLS = FISH.MAX_SCHOOLS_SAVE; const cam = { x: 150, y: 3, z: 30 };
  run(S, 3, cam);
  const hit = S.blast(a.cx, -1, a.cz, 1.5);
  const far = S.fish().filter(f => f.school === b && (f.stun > 0 || f.dead)).length;
  check(hit > 5 && S.stats.killed > 0, 'a shell in the water stuns and kills fish near it', `${hit} hit, ${S.stats.killed} killed`);
  check(far === 0, 'none 60 m away', `${far}`);
  run(S, 6, cam);
  const st = S.fish().filter(f => f.school === a && f.stun > 0 && !f.dead), up = mean(st.map(f => f.y)), roll = mean(st.map(f => f.roll));
  check(st.length > 0 && up > -1.2 && roll > 2, 'stunned fish float up belly-up', `${st.length} stunned at ${up.toFixed(2)} m, roll ${roll.toFixed(2)} rad`);
  run(S, 25, cam);
  const still = S.fish().filter(f => f.school === a && f.stun > 0 && !f.dead).length, dead = S.fish().filter(f => f.dead).length;
  check(still === 0 && dead > 0, 'the stunned recover and swim off; the dead stay dead', `${still} still stunned, ${dead} dead`);
  // an airburst high over the water does next to nothing
  const S2 = createFishSim({ depthAt: beach, seed: 14 }); FISH.MAX_SCHOOLS = 0; const c = S2.spawnSchool('mackerel', 150, 0); FISH.MAX_SCHOOLS = FISH.MAX_SCHOOLS_SAVE;
  run(S2, 2, cam); const h2 = S2.blast(c.cx, 12, c.cz, 1.5);
  check(h2 === 0, 'a flak burst 12 m up stuns nothing in the water', `${h2}`);
}

// 8. only near the camera: the schools go when it leaves, none at altitude
{
  const S = createFishSim({ depthAt: beach, seed: 17 });
  run(S, 4, { x: 100, y: 5, z: 0 }); const n0 = S.schools.length;
  run(S, 2, { x: 100, y: 5, z: 2000 }); const near = S.schools.every(sc => Math.hypot(sc.cx - 100, sc.cz - 2000) < S.radius + 45);
  check(n0 > 0 && near, 'schools are dropped when the camera moves on and spawn where it is', `${n0} -> ${S.schools.length} (all near the new spot: ${near})`);
  run(S, 2, { x: 100, y: 400, z: 2000 });
  check(S.schools.length === 0, 'nothing simulated from 400 m up', `${S.schools.length}`);
}

// 9. the real archipelago: round HOME ISLAND, no fish on land, cost of a full load
{
  const I = ISLANDS[0], S = createFishSim({ depthAt: islandH, seed: 21 });
  const cam = { x: I.x + 150, y: 20, z: I.z };
  let land = 0, deep = 0, worst = 0, sum = 0, n = 0, cnt = 0;
  run(S, 30, cam, 1 / 30, t => { if (t > 2) { for (const f of S.fish()) { cnt++; if (S.bed(f.x, f.z) > f.y) land++; if (islandH(f.x, f.z) > f.y + 1) deep++; } worst = Math.max(worst, S.ms); sum += S.ms; n++; } });
  check(S.fish().length > 80 && land === 0, 'HOME ISLAND: fish round the island, none under the (drawn, 2 m) sea bed', `${S.fish().length} fish in ${S.schools.length} schools, ${land} under the bed`);
  check(deep / cnt < 0.01, '... and under 1 % more than 1 m into the exact terrain (2 m cells on cliffs)', `${(100 * deep / cnt).toFixed(2)} %`);
  // cost: the full budget of fish
  const S3 = createFishSim({ depthAt: beach, seed: 23 }); let t3 = 0, n3 = 0;
  run(S3, 3, { x: 150, y: 3, z: 0 });
  while (S3.nFish < FISH.MAX_FISH - 100) { if (!S3.spawnSchool(['sardine', 'mackerel'][n3++ % 2], 150 + (n3 % 5) * 12, (n3 % 7) * 12)) break; }
  run(S3, 4, { x: 150, y: 3, z: 0 }, 1 / 60, () => {});
  for (let i = 0; i < 120; i++) { S3.update(1 / 60, { x: 150, y: 3, z: 0 }); t3 += S3.ms; }
  check(t3 / 120 < 3, `cost of ${S3.nFish} fish per 60 Hz frame (node)`, `${(t3 / 120).toFixed(2)} ms`, '< 3 ms');
  console.log(`      (HOME ISLAND run: ${(sum / n).toFixed(2)} ms average, ${worst.toFixed(2)} ms worst incl. spawning)`);
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
