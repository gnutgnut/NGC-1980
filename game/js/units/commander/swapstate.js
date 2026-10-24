// COMMANDER: swap the state of two objects of the same kind in place (two Huey sims, damage models, systems, AI crews).
// main.js keeps one set of Huey objects that the whole game refers to (H, D, SY, heliAI); every other Huey out keeps
// its state in a second set, and the two are exchanged by content - so every reference held elsewhere (H.pos, H.vel,
// D.hp, the cockpit's view of SY) stays valid and simply sees the other aircraft.
//   vectors / quaternions (anything with copy + clone): contents copied both ways
//   arrays, Sets: contents exchanged
//   plain objects: swapped key by key (recursively)
//   numbers, strings, other objects: the values exchanged
//   functions and accessors are left alone (methods are closures over their own object; getters derive from data)
// Pure (no THREE import): tools/commanderbench.mjs checks that a sim swapped in and out every step flies exactly as
// one that never was.
export function swapState(a, b) {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const da = Object.getOwnPropertyDescriptor(a, k), db = Object.getOwnPropertyDescriptor(b, k);
    if ((da && !('value' in da)) || (db && !('value' in db))) continue;
    const va = a[k], vb = b[k];
    if (typeof va === 'function' || typeof vb === 'function') continue;
    if (va && vb && typeof va === 'object' && typeof vb === 'object') {
      if (typeof va.copy === 'function' && typeof va.clone === 'function') { const t = va.clone(); va.copy(vb); vb.copy(t); continue; }
      if (Array.isArray(va) && Array.isArray(vb)) { const t = va.slice(); va.length = 0; va.push(...vb); vb.length = 0; vb.push(...t); continue; }
      if (va instanceof Set && vb instanceof Set) { const t = [...va]; va.clear(); for (const x of vb) va.add(x); vb.clear(); for (const x of t) vb.add(x); continue; }
      if (Object.getPrototypeOf(va) === Object.prototype && Object.getPrototypeOf(vb) === Object.prototype) { swapState(va, vb); continue; }
    }
    a[k] = vb; b[k] = va;
  }
}
