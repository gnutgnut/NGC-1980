// COMMANDER: the AI pilot who takes a jet the commander leaves (switches away from) - the escorts' own pilot
// (units/air/pilot.js: flight director through stick, pedals and throttles, carrier pattern, LSO glideslope, wires)
// on the player's HORNET or TOMCAT airframe. Off the deck or in the air it climbs out and holds a CAP orbit over the
// ALBATROSS, comes home at bingo fuel (or when ordered with recall()), flies the pattern and traps. It does not fight:
// the player's jets carry their own stores layout and the AI's weapon logic belongs to the escorts (war.js targets
// only the player's active unit anyway). Pure (three.js maths): the airframe sims run in node.
import { createPilot, PILOTS } from '../air/pilot.js';

const D2R = Math.PI / 180;
// game-level numbers on top of the TOMCAT pilot (tuned for the 4x-dense game air, EAS in m/s like pilot.js)
export const WINGMAN = {
  HORNET: { ...PILOTS.TOMCAT, weapons: [], gun: null, radar: 0, bingo: 800, aoaApp: 8.1 * D2R, capAlt: 210, capR: 480, landX: undefined, catX: undefined },
  TOMCAT: { ...PILOTS.TOMCAT, weapons: [], gun: null, radar: 0, bingo: 1900, capAlt: 240, capR: 520 },
};

// the world as the pilot sees it, from the game's: terrain(x, z) (sea = 0), carrier() -> the war.js ship or null,
// deckAt(c, x, z) (the deck moving with the sea), CARRIER_DECK (deck height over the hull origin)
export function wingmanEnv({ terrain, carrier, deckAt, DECK }) {
  const none = function* () {};
  return {
    terrain,
    carrier: () => {
      const c = carrier(); if (!c) return null;
      return { x: c.p.x, z: c.p.z, yaw: c.yaw, deck: DECK + c.p.y, deckAt: deckAt ? (x, z) => deckAt(c, x, z) : null, vx: c.v ? c.v.x : 0, vz: c.v ? c.v.z : 0, speed: c.speed || 0, w: c.w || 0 };
    },
    anchor: () => { const c = carrier(); return c ? { x: c.p.x, y: DECK + c.p.y, z: c.p.z } : null; },
    foes: none, missiles: none, inFlight: () => 0, fire: () => {},
  };
}

// A: the airframe sim (jetplay's J, tomcatplay's A); kind 'HORNET' | 'TOMCAT'. Picks the state from what the jet is doing.
export function createWingman(A, kind, name) {
  const T = WINGMAN[kind] || WINGMAN.TOMCAT;
  const PL = createPilot(A, { ...T, side: 1, name });
  const agl = A.pos.y - (A.groundH ?? 0);
  if (A.cat) { PL.set('cat'); PL.FD.reset(); }
  else if (A.onGround) { PL.set('trapped'); PL.FD.reset(); PL.FD.thr = 0; }
  else if (A.hookCmd && A.gearCmd) { PL.spawnAir('rtb'); }
  else if (A.gearCmd || agl < 120) { PL.spawnAir('climb'); }
  else PL.spawnAir('cap');
  PL.recall = () => { if (['climb', 'cap', 'patrol', 'fight'].includes(PL.state)) PL.set('rtb', 'RECALLED'); };
  return PL;
}
