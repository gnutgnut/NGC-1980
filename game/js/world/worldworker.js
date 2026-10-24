// World worker: builds the lived-in world's chunks (towns, roads, farms, harbours) off the main thread, from the same
// seeded generators the main thread uses for physics and traffic (net.js), so they agree.
//   in:  { id, ci, cj }
//   out: { id, ci, cj, near, far, gnear, gfar, detail (each { pos, nrm, col, tris }), wires: Float32Array, dyn, ms }
import { islandH } from '../world.js';
import { buildChunk } from './chunkgen.js';
onmessage = ({ data: q }) => {
  const t0 = performance.now();
  const c = buildChunk(q.ci, q.cj, islandH);
  const bufs = [c.wires.buffer];
  for (const k of ['near', 'far', 'gnear', 'gfar', 'detail']) bufs.push(c[k].pos.buffer, c[k].nrm.buffer, c[k].col.buffer);
  postMessage({ id: q.id, ci: q.ci, cj: q.cj, ...c, ms: performance.now() - t0 }, bufs);
};
