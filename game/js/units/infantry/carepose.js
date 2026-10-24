// NGC-1980 ngc/infdepth: where a soldier figure's hands (and back) go when they are not on his rifle - for
// soldiermodel.js poseSkeleton's pose.hands (figure frame: feet at the origin, facing -z, metres) and pose.sling (rifle on
// the back). poseSkeleton blends into and out of these (~0.25 s), so a man lets go of his rifle and takes it up again.
// Pure (no THREE): groundsim.js uses the AI's grenade drill timing from here.
//   careHands('drag', t, ph)   crouched, both hands low in front on the casualty's drag strap / shoulder straps (FM 21-11:
//                              the casualty's head and shoulders lifted off the ground, the soldier backing up; the hands
//                              heave with each step back, ph = the gait phase)
//   careHands('carry', t, ph)  fireman's carry: the right hand round the casualty's leg and on his wrist in front of the
//                              chest, the left steadying his back over the left shoulder; bent forward under the load
//   careHands('treat', t)      kneeling by a man on the ground: bent over him, both hands on the wound, working
//   throwHands(phase, p, under)  the M67 / M18 drill seen from outside (the phases of the viewmodel's throwvm.js; p: 0..1
//                              of the phase, but seconds in 'ready' / 'cook' as marine.js keeps them): the off hand pulls
//                              the pin and points, the body turns the throwing shoulder back, then through (FM 23-30)
// Each returns { L, R, spine?, chest?, dy?, stand? }: hand targets, extra spine / chest rotation (Euler x, y, z rad), pelvis
// drop; stand: the targets are for a standing man (poseSkeleton lowers them with his pelvis when he kneels or crouches).
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lerp = (a, b, t) => a + (b - a) * t;
const ss = t => t * t * (3 - 2 * t);
const cl = t => Math.min(1, Math.max(0, t));
export function careHands(kind, t = 0, ph = 0) {
  if (kind === 'drag') {
    const b = Math.max(0, Math.sin(ph)) * 0.05;   // a heave on each step back
    return { L: [-0.19, 0.42 + b, -0.52 + b * 0.6], R: [0.19, 0.42 + b, -0.52 + b * 0.6], spine: [0.1 + b, 0, 0], chest: [0.05, 0, 0] };
  }
  if (kind === 'carry') {
    const b = Math.sin(ph * 2) * 0.012;
    return { L: [-0.24, 1.5 + b, 0.06], R: [0.13, 1.27 + b, -0.24], spine: [-0.17, 0, 0.05], chest: [-0.06, 0, 0.03], dy: -0.04, stand: true };
  }
  if (kind === 'treat') {
    const w = Math.sin(t * 2.2) * 0.05;
    return { L: [-0.1 + w, 0.2, -0.56], R: [0.12 - w, 0.22 + Math.abs(w), -0.54], spine: [-0.22, 0, 0], chest: [-0.12, 0, 0] };
  }
  return null;
}
const TH = {
  side: [0.2, 1.0, -0.05], pouch: [0.16, 1.02, -0.14], chest: [0.06, 1.3, -0.32], ring: [0.0, 1.32, -0.33], pulled: [-0.3, 1.25, -0.36],
  cocked: [0.3, 1.7, 0.2], point: [-0.18, 1.45, -0.55], over: [0.2, 1.92, -0.15], out: [0.08, 1.45, -0.66], follow: [-0.12, 1.05, -0.38],
  lowBack: [0.24, 0.85, 0.2], lowOut: [0.06, 1.15, -0.6],
};
export function throwHands(phase, p = 0, under = false) {
  const r = throwPose(phase, p, under); if (r) r.stand = true; return r;
}
function throwPose(phase, p, under) {
  const P = ss(cl(p));
  switch (phase) {
    case 'draw': return { R: P < 0.5 ? lerp3(TH.side, TH.pouch, P * 2) : lerp3(TH.pouch, TH.chest, P * 2 - 1), L: TH.chest.map((v, i) => v + [-0.12, -0.02, 0.02][i]), spine: [-0.04 * P, 0, 0] };
    case 'pin': return { R: TH.chest, L: P < 0.55 ? lerp3([-0.12, 1.28, -0.3], TH.ring, P / 0.55) : lerp3(TH.ring, TH.pulled, (P - 0.55) / 0.45), spine: [-0.04, 0, 0], chest: [0, -0.1 * P, 0] };
    case 'ready': case 'cook': {
      const k = phase === 'cook' ? 1 : ss(cl(p * 3)), kl = phase === 'cook' ? 1 : ss(cl(p * 2));   // (cooking: already cocked)
      return { R: lerp3(TH.chest, under ? TH.lowBack : TH.cocked, k), L: lerp3(TH.pulled, TH.point, kl),
        spine: under ? [-0.3 * k, -0.2 * k, 0] : [0.1 * k, -0.42 * k, 0.06 * k], chest: [0, under ? -0.1 * k : -0.18 * k, 0] };
    }
    case 'throw': {
      // the body turns through first and the arm follows (the hand passes over the shoulder at ~45 %)
      const B = ss(cl(p * 1.4));
      if (under) return { R: lerp3(TH.lowBack, TH.lowOut, P), L: TH.point, spine: [lerp(-0.3, -0.1, B), lerp(-0.2, 0.15, B), 0], chest: [0, lerp(-0.1, 0.1, B), 0] };
      return { R: P < 0.45 ? lerp3(TH.cocked, TH.over, P / 0.45) : P < 0.7 ? lerp3(TH.over, TH.out, (P - 0.45) / 0.25) : lerp3(TH.out, TH.follow, (P - 0.7) / 0.3),
        L: lerp3(TH.point, [-0.24, 1.08, -0.18], P), spine: [lerp(0.1, -0.32, B), lerp(-0.42, 0.38, B), lerp(0.06, -0.04, B)], chest: [0, lerp(-0.18, 0.2, B), 0], dy: -0.05 * Math.sin(Math.PI * P) };
    }
    default: return null;
  }
}
// the AI's M67 drill (groundsim.js): seconds per phase (a man who has done it before: clip, pin, a ~1 s cook, throw)
export const AI_DRILL = [['draw', 0.45], ['pin', 0.55], ['ready', 0.35], ['cook', 1.0], ['throw', 0.5], ['recover', 0.4]];
export const AI_RELEASE = 0.55;   // fraction of 'throw' at which the grenade leaves the hand
export const AI_DRILL_S = AI_DRILL.reduce((s, d) => s + d[1], 0);
// t seconds into the drill -> { phase, p } (p in seconds for 'ready' / 'cook', as throwHands takes it), or null when done
export function drillAt(t, out = {}) {
  for (const [ph, d] of AI_DRILL) {
    if (t < d) { out.phase = ph; out.p = ph === 'ready' || ph === 'cook' ? t : t / d; return out; }
    t -= d;
  }
  return null;
}
export const AI_RELEASE_T = AI_DRILL.slice(0, 4).reduce((s, d) => s + d[1], 0) + AI_DRILL[4][1] * AI_RELEASE;
