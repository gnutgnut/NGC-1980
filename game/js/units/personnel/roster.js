// PERSONNEL: the task force's people as a roster of persistent individuals. PURE: no THREE, no DOM, no game imports
// (tools/personnelbench.mjs runs it in node). Every person on our side - every Marine in a squad, every pilot, crew
// chief, tank crewman, driver, AA gunner, deck crewman in his coloured shirt, sailor - and every civilian who gets hurt
// is one plain-data RECORD here. Figures in the world (personnel.js binds them) are views of a record, not anonymous.
//
//   const P = createRoster({ seed });
//   P.add({ mos, loc, rank?, name?, side? }) -> rec        P.get(id), P.list(filter), P.at(loc)
//   P.xp(rec, skill) / P.level(rec, skill) / P.perf(rec, skill) -> 0.55 (untrained) .. 1.0 (experienced) .. 1.2
//   P.gain(rec, skill, amount) (experience with use, diminishing; level-up events)
//   P.qualified(rec, job) -> '' | why not;  P.assign(rec, job, { loc, unit, seat }) -> '' | why not
//   squads: P.formSquad(name, recs, loc), P.joinSquad(rec, sq), P.leaveSquad(rec), P.split(sq, recs, name), P.merge(a, b)
//   P.hurt(rec, { amount 0..1 of the body, part, what, by: { side, pid, what } }) -> status   (same path for every
//          source: enemy fire, our own fire - friendly fire is counted, see P.ff - crashes, falls)
//   P.kill(rec, why, by) -> the KIA list (permanent for the session); P.toSickBay(rec); P.step(dt) -> events
//   P.kit(rec) -> his MEDINV inventory root (lazy, kit.js); P.events (drained by the host)
//
// Experience (GAME-level, not a training syllabus): xp per skill grows with use (rounds fired at the enemy, hits,
// minutes at the wheel or the controls, casualties treated, minutes of deck handling). Levels by xp: UNTRAINED < 10,
// BASIC < 30, TRAINED < 70, EXPERIENCED < 150, VETERAN. A job may need a minimum (an aircraft type: TRAINED on that
// type - an untrained man cannot fly the Hornet; a corpsman: TRAINED medical; a squad leader: TRAINED leadership);
// everything else is soft: anyone can take a jeep or an AA gun, and perf() says how well (accuracy, reaction, speed).
import { makeKit } from './kit.js';

export const SKILLS = {
  rifle: 'RIFLE', mg: 'MACHINE GUN', launcher: 'M203 / LAW', leadership: 'LEADERSHIP', medical: 'MEDICAL',
  drive: 'DRIVING (WHEELED)', track: 'DRIVING (TRACKED)', gunnery: 'TANK GUNNERY', aa: 'AIR DEFENCE GUNNERY',
  crewchief: 'AIRCREW', deck: 'DECK HANDLING', seaman: 'SEAMANSHIP',
  fly_uh1: 'PILOT UH-1H', fly_ch46: 'PILOT CH-46E', fly_fa18: 'PILOT F/A-18A', fly_f14: 'PILOT F-14A', fly_c130: 'PILOT C-130', rio: 'RIO F-14A',
};
export const LEVELS = [[0, 'UNTRAINED'], [10, 'BASIC'], [30, 'TRAINED'], [70, 'EXPERIENCED'], [150, 'VETERAN']];
export const QUAL = 30;   // xp: TRAINED - the qualification line for the hard jobs
// service, rank ladders (enlisted first, then officers; index by seniority)
export const SERVICE = { usmc: 'USMC', usn: 'USN', sov: 'SOVIET ARMY', civ: 'CIVILIAN' };
const RANKS = {
  usmc: ['PVT', 'PFC', 'LCPL', 'CPL', 'SGT', 'SSGT', 'GYSGT'], usmcO: ['2NDLT', '1STLT', 'CAPT', 'MAJ'],
  usn: ['SA', 'SN', 'PO3', 'PO2', 'PO1', 'CPO'], usnO: ['ENS', 'LTJG', 'LT', 'LCDR', 'CDR'],
  hm: ['HA', 'HN', 'HM3', 'HM2', 'HM1'], sov: ['RYADOVOY', 'YEFREYTOR', 'ML SERZHANT', 'SERZHANT'], civ: [''],
};
// MOS / rating -> title, service, rank ladder, starting xp per skill (a new man of that trade), his kit (kit.js), the
// job he holds by default. Codes: USMC MOS (0311 rifleman ...), USN ratings / designators for the ship and air wing.
// (INFERRED: 1980 USMC MOS manual / USN rating titles; the starting numbers are GAME.)
export const MOS = {
  '0311': { title: 'RIFLEMAN', svc: 'usmc', ranks: 'usmc', xp: { rifle: 32, launcher: 8, medical: 4, drive: 4, leadership: 2 }, job: 'rifleman' },
  '0331': { title: 'MACHINE GUNNER', svc: 'usmc', ranks: 'usmc', xp: { mg: 34, rifle: 22, medical: 4, drive: 3 }, job: 'mg' },
  '0351': { title: 'ASSAULTMAN', svc: 'usmc', ranks: 'usmc', xp: { launcher: 34, rifle: 24, medical: 4 }, job: 'grenadier' },
  '0369': { title: 'INFANTRY UNIT LEADER', svc: 'usmc', ranks: 'usmc', xp: { rifle: 55, leadership: 45, launcher: 20, mg: 15, medical: 8, drive: 8 }, job: 'leader', rank0: 4 },
  '8404': { title: 'FIELD MEDICAL SERVICE TECHNICIAN', svc: 'usn', ranks: 'hm', xp: { medical: 48, rifle: 12 }, job: 'corpsman', rank0: 1 },
  '1812': { title: 'M60 TANK CREWMAN', svc: 'usmc', ranks: 'usmc', xp: { track: 36, gunnery: 34, rifle: 12, drive: 10 }, job: 'tank' },
  '1833': { title: 'TRACKED VEHICLE CREWMAN', svc: 'usmc', ranks: 'usmc', xp: { track: 36, mg: 16, rifle: 14, drive: 12 }, job: 'tank' },
  '3531': { title: 'MOTOR VEHICLE OPERATOR', svc: 'usmc', ranks: 'usmc', xp: { drive: 40, rifle: 16, track: 4 }, job: 'driver' },
  '7204': { title: 'LOW ALTITUDE AIR DEFENSE GUNNER', svc: 'usmc', ranks: 'usmc', xp: { aa: 36, rifle: 14, drive: 6 }, job: 'aa' },
  'SOV-AA': { title: 'ZSU-23-4 CREWMAN (CONTINGENT)', svc: 'sov', ranks: 'sov', xp: { aa: 44, track: 18, rifle: 14 }, job: 'aa' },
  '7563': { title: 'UH-1 PILOT', svc: 'usmc', ranks: 'usmcO', xp: { fly_uh1: 60, rifle: 8, drive: 10, leadership: 15 }, job: 'pilot_uh1' },
  '7562': { title: 'CH-46 PILOT', svc: 'usmc', ranks: 'usmcO', xp: { fly_ch46: 60, fly_uh1: 6, rifle: 8, drive: 10, leadership: 15 }, job: 'pilot_ch46' },
  '7557': { title: 'KC-130 PILOT', svc: 'usmc', ranks: 'usmcO', xp: { fly_c130: 60, rifle: 6, drive: 10, leadership: 15 }, job: 'pilot_c130' },
  '6172': { title: 'HELICOPTER CREW CHIEF', svc: 'usmc', ranks: 'usmc', xp: { crewchief: 40, mg: 26, rifle: 12, medical: 6 }, job: 'crewchief' },
  '1310-F18': { title: 'NAVAL AVIATOR (F/A-18A)', svc: 'usn', ranks: 'usnO', xp: { fly_fa18: 62, rifle: 4, drive: 10, leadership: 15 }, job: 'pilot_fa18' },
  '1310-F14': { title: 'NAVAL AVIATOR (F-14A)', svc: 'usn', ranks: 'usnO', xp: { fly_f14: 62, rifle: 4, drive: 10, leadership: 15 }, job: 'pilot_f14' },
  '1320-F14': { title: 'NAVAL FLIGHT OFFICER (RIO)', svc: 'usn', ranks: 'usnO', xp: { rio: 60, rifle: 4, drive: 10 }, job: 'rio' },
  // flight deck ratings by jersey (USN 1980): yellow directors, blue chock / chain and tractor, purple fuel, red
  // ordnance / crash, green catapult and arresting gear, brown plane captains, white safety / LSO / medical
  'ABH-Y': { title: "AVIATION BOATSWAIN'S MATE (DIRECTOR)", svc: 'usn', ranks: 'usn', xp: { deck: 50, seaman: 20, drive: 10 }, job: 'deck', jersey: 'yellow', rank0: 3 },
  'ABH-B': { title: "AVIATION BOATSWAIN'S MATE (HANDLING)", svc: 'usn', ranks: 'usn', xp: { deck: 28, seaman: 16, drive: 14 }, job: 'deck', jersey: 'blue' },
  'ABF': { title: "AVIATION BOATSWAIN'S MATE (FUELS)", svc: 'usn', ranks: 'usn', xp: { deck: 32, seaman: 16 }, job: 'deck', jersey: 'purple' },
  'AO': { title: 'AVIATION ORDNANCEMAN', svc: 'usn', ranks: 'usn', xp: { deck: 32, seaman: 14, mg: 8 }, job: 'deck', jersey: 'red' },
  'ABE': { title: "AVIATION BOATSWAIN'S MATE (LAUNCH / RECOVERY)", svc: 'usn', ranks: 'usn', xp: { deck: 38, seaman: 16 }, job: 'deck', jersey: 'green' },
  'PC': { title: 'PLANE CAPTAIN', svc: 'usn', ranks: 'usn', xp: { deck: 36, crewchief: 14, seaman: 12 }, job: 'deck', jersey: 'brown' },
  'HM-W': { title: 'HOSPITAL CORPSMAN (FLIGHT DECK)', svc: 'usn', ranks: 'hm', xp: { medical: 40, deck: 20, seaman: 14 }, job: 'deck', jersey: 'white' },
  'BM': { title: "BOATSWAIN'S MATE", svc: 'usn', ranks: 'usn', xp: { seaman: 44, deck: 10, drive: 6 }, job: 'sailor', rank0: 2 },
  'SN': { title: 'SEAMAN', svc: 'usn', ranks: 'usn', xp: { seaman: 22, deck: 6 }, job: 'sailor' },
  'CIV': { title: 'CIVILIAN', svc: 'civ', ranks: 'civ', xp: { drive: 20 }, job: 'none', civ: true },
};
// jobs: the skill that does the work, the minimum xp (hard: refused below it), kinds of people allowed
export const JOBS = {
  none: { label: 'NONE' },
  reserve: { label: 'UNASSIGNED (RESERVE)' },
  rifleman: { label: 'RIFLEMAN', skill: 'rifle', min: 0, foot: true },
  mg: { label: 'MACHINE GUNNER', skill: 'mg', min: 10, foot: true },
  grenadier: { label: 'GRENADIER', skill: 'launcher', min: 10, foot: true },
  leader: { label: 'SQUAD LEADER', skill: 'leadership', min: QUAL, foot: true },
  corpsman: { label: 'CORPSMAN', skill: 'medical', min: QUAL, foot: true },
  aa: { label: 'AA GUNNER', skill: 'aa', min: 0 },
  driver: { label: 'DRIVER', skill: 'drive', min: 0 },
  tank: { label: 'ARMOUR CREWMAN', skill: 'track', min: 0 },
  crewchief: { label: 'CREW CHIEF / DOOR GUNNER', skill: 'crewchief', min: 10 },
  pilot_uh1: { label: 'UH-1H PILOT', skill: 'fly_uh1', min: QUAL, air: 'heli' },
  pilot_ch46: { label: 'CH-46E PILOT', skill: 'fly_ch46', min: QUAL, air: 'ch46' },
  pilot_fa18: { label: 'F/A-18A PILOT', skill: 'fly_fa18', min: QUAL, air: 'jet' },
  pilot_f14: { label: 'F-14A PILOT', skill: 'fly_f14', min: QUAL, air: 'tomcat' },
  pilot_c130: { label: 'C-130 PILOT', skill: 'fly_c130', min: QUAL, air: 'c130' },
  rio: { label: 'F-14A RIO', skill: 'rio', min: QUAL },
  deck: { label: 'FLIGHT DECK CREW', skill: 'deck', min: 0, ship: true },
  sailor: { label: "SHIP'S COMPANY", skill: 'seaman', min: 0, ship: true },
};
// which job a craft seat needs (personnel.js: crafts.gate)
export const SEAT_JOB = { heli: ['pilot_uh1', 'pilot_uh1', 'crewchief'], jet: ['pilot_fa18'], tomcat: ['pilot_f14', 'rio'], c130: ['pilot_c130', 'pilot_c130'], m60: ['tank', 'tank', 'tank', 'tank'], m113: ['tank', 'tank'] };
export const STATUS = { fit: 'FIT', wounded: 'WOUNDED', down: 'DOWN (WIA)', evac: 'CASEVAC', sickbay: 'SICK BAY', kia: 'KIA' };

const FIRST = ['JAMES', 'ROBERT', 'MICHAEL', 'DAVID', 'JOHN', 'WILLIAM', 'RICHARD', 'THOMAS', 'MARK', 'STEVEN', 'GARY', 'LARRY', 'DENNIS', 'KEVIN', 'RANDY', 'TERRY', 'CARLOS', 'LUIS', 'JOSE', 'ANTHONY', 'DANIEL', 'PAUL', 'KENNETH', 'RONALD', 'DONALD', 'GREGORY', 'RAYMOND', 'FRANK', 'ERIC', 'TIMOTHY', 'WAYNE', 'ROGER', 'DARRYL', 'CURTIS', 'TYRONE', 'MANUEL', 'VICTOR', 'EDWARD', 'PATRICK', 'SCOTT'];
const SURN = ['RIVERA', 'KOWALSKI', 'JACKSON', 'NGUYEN', 'MURPHY', 'GARCIA', 'WASHINGTON', 'OLSEN', 'DELGADO', 'BROOKS', 'HARRIS', 'SCHULTZ', 'TAYLOR', 'MARTINEZ', 'COLLINS', 'REYES', 'MORGAN', 'BAKER', 'WILLIAMS', 'NOVAK', 'PRICE', 'HAYES', 'ORTIZ', 'FLETCHER',
  'ANDERSON', 'THOMPSON', 'WHITE', 'LOPEZ', 'CLARK', 'LEWIS', 'WALKER', 'YOUNG', 'ALLEN', 'KING', 'WRIGHT', 'HILL', 'SCOTT', 'GREEN', 'ADAMS', 'NELSON', 'CARTER', 'MITCHELL', 'ROBERTS', 'TURNER', 'PHILLIPS', 'CAMPBELL', 'PARKER', 'EVANS',
  'EDWARDS', 'STEWART', 'SANCHEZ', 'MORRIS', 'ROGERS', 'REED', 'COOK', 'BELL', 'COOPER', 'RICHARDSON', 'COX', 'HOWARD', 'WARD', 'TORRES', 'PETERSON', 'GRAY', 'RAMIREZ', 'JAMES', 'WATSON', 'KELLY', 'SANDERS', 'BENNETT', 'WOOD', 'BARNES',
  'ROSS', 'HENDERSON', 'COLEMAN', 'JENKINS', 'PERRY', 'POWELL', 'LONG', 'PATTERSON', 'HUGHES', 'FLORES', 'BUTLER', 'SIMMONS', 'FOSTER', 'GONZALES', 'BRYANT', 'ALEXANDER', 'RUSSELL', 'GRIFFIN', 'DIAZ', 'MYERS', 'FORD', 'HAMILTON', 'GRAHAM', 'SULLIVAN',
  'WALLACE', 'WOODS', 'COLE', 'WEST', 'JORDAN', 'OWENS', 'REYNOLDS', 'FISHER', 'ELLIS', 'HARRISON', 'GIBSON', 'MCDONALD', 'CRUZ', 'MARSHALL', 'GOMEZ', 'MURRAY', 'FREEMAN', 'WELLS', 'WEBB', 'SIMPSON', 'STEVENS', 'TUCKER', 'PORTER', 'HUNTER'];
const SOV_F = ['SERGEI', 'ALEKSANDR', 'NIKOLAI', 'VIKTOR', 'YURI', 'ANDREI', 'IGOR', 'OLEG', 'DMITRI', 'PAVEL'];
const SOV_S = ['IVANOV', 'PETROV', 'SMIRNOV', 'KUZNETSOV', 'POPOV', 'SOKOLOV', 'LEBEDEV', 'KOZLOV', 'NOVIKOV', 'MOROZOV', 'VOLKOV', 'ZAITSEV', 'PAVLOV', 'SEMYONOV'];
const CIV_F = ['ANNA', 'MARIA', 'ELSA', 'INGRID', 'MARGARET', 'JOHAN', 'PETER', 'ERIK', 'HANS', 'KARIN', 'BRIDGET', 'SEAN', 'MARTA', 'TOMAS', 'LENA', 'OSKAR'];
const CIV_S = ['LARSEN', 'MACLEOD', 'HANSEN', 'BRANDT', 'OLAFSSON', 'MURRAY', 'QUINN', 'DAHL', 'BERG', 'FINLAY', 'MOEN', 'STRAND', 'TULLOCH', 'VIK'];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const levelOf = xp => { let k = 0; for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i][0]) k = i; return k; };
export const levelName = xp => LEVELS[levelOf(xp)][1];
// how well he does a task: 0.55 untrained, 0.74 trained, 1.0 experienced, up to 1.2 for a long-serving veteran (GAME)
export const perfOf = xp => 0.55 + 0.45 * Math.min(1, xp / 70) + 0.2 * clamp((xp - 70) / 130, 0, 1);

export function createRoster(o = {}) {
  const rng = mulberry(o.seed ?? 1980);
  const pick = a => a[Math.floor(rng() * a.length)];
  const P = { recs: [], byId: new Map(), squads: [], kiaList: [], events: [], nextId: 1, nextSquad: 1, time: 0,
    ff: { incidents: 0, wounded: 0, killed: 0, civWounded: 0, civKilled: 0, log: [] } };
  const ev = (e, x) => { P.events.push(Object.assign({ e, t: P.time }, x)); if (P.events.length > 400) P.events.splice(0, 100); };
  const used = new Set();
  function nameFor(m) {
    const [F, S] = m.svc === 'sov' ? [SOV_F, SOV_S] : m.civ ? [CIV_F, CIV_S] : [FIRST, SURN];
    for (let k = 0; k < 40; k++) { const f = pick(F), s = pick(S), n = f + ' ' + s; if (!used.has(n) || k === 39) { used.add(n); return [f, s]; } }
  }
  // ------------------------------------------------------------------------------------------------- records
  P.add = (a = {}) => {
    const code = MOS[a.mos] ? a.mos : '0311', m = MOS[code];
    const [first, last] = a.name ? (a.name.includes(' ') ? a.name.split(' ') : ['', a.name]) : nameFor(m);
    const years = a.years ?? (m.civ ? 0 : Math.floor(rng() * rng() * 9) + (a.green ? 0 : 1));   // most men are young in the service
    const xp = {};
    for (const k in SKILLS) xp[k] = 0;
    for (const [k, v] of Object.entries(m.xp)) xp[k] = Math.max(0, v * (a.green ? 0.75 : 0.85 + 0.3 * rng()) + years * v * 0.08);
    if (a.xp) Object.assign(xp, a.xp);
    const ladder = RANKS[m.ranks], ri = clamp((m.rank0 || 0) + Math.floor(years / 2.5) + (a.rankUp || 0), 0, ladder.length - 1);
    const rec = {
      id: P.nextId++, first, last, rank: a.rank || ladder[ri], svc: m.svc, mos: code, side: a.side ?? (m.civ ? 0 : 1), civ: !!m.civ,
      years, xp, job: a.job || m.job, jersey: a.jersey || m.jersey || null, loc: a.loc || 'ALBATROSS', unit: a.unit || null, seat: a.seat ?? null,
      squad: null, status: 'fit', hp: 1, wounds: [], body: null, kitRoot: null, sickT: 0,
      stats: { shots: 0, hits: 0, kills: 0, treated: 0, ffBy: 0, ffOn: 0, driveS: 0, flyS: 0, deckS: 0 }, log: [],
    };
    P.recs.push(rec); P.byId.set(rec.id, rec);
    ev('add', { id: rec.id });
    return rec;
  };
  P.get = id => P.byId.get(id) || null;
  P.label = r => r ? `${r.rank ? r.rank + ' ' : ''}${r.last}` : '';
  P.fullName = r => r ? `${r.rank ? r.rank + ' ' : ''}${r.first} ${r.last}` : '';
  P.title = r => MOS[r.mos].title;
  P.alive = r => r && r.status !== 'kia';
  P.able = r => r && (r.status === 'fit' || r.status === 'wounded');
  P.list = (f = () => true) => P.recs.filter(f);
  P.at = (loc, f = () => true) => P.recs.filter(r => r.loc === loc && r.status !== 'kia' && f(r));
  P.note = (r, text) => { r.log.push({ t: P.time, text }); if (r.log.length > 24) r.log.shift(); };
  // filters the PERSONNEL page offers
  P.FILTERS = {
    all: r => !r.civ && r.status !== 'kia', marines: r => !r.civ && r.status !== 'kia' && (r.svc === 'usmc' && JOBS[r.job]?.foot || r.mos === '8404'),
    air: r => r.status !== 'kia' && (/^pilot|^rio|^crewchief/.test(r.job)), armour: r => r.status !== 'kia' && (r.job === 'tank' || r.job === 'driver'),
    deck: r => r.status !== 'kia' && (r.job === 'deck' || r.job === 'sailor'), aa: r => r.status !== 'kia' && r.job === 'aa',
    wounded: r => !r.civ && (r.status === 'wounded' || r.status === 'down' || r.status === 'evac' || r.status === 'sickbay'),
    kia: r => r.status === 'kia' && !r.civ, civilians: r => r.civ,
  };
  // ------------------------------------------------------------------------------------------------- experience
  P.xp = (r, s) => r.xp[s] || 0;
  P.level = (r, s) => levelOf(P.xp(r, s));
  P.levelName = (r, s) => levelName(P.xp(r, s));
  // perf: skill at the task x what his wounds leave him (a hurt man is slower and shakier)
  P.perf = (r, s) => perfOf(P.xp(r, s)) * (r.status === 'wounded' ? 0.6 + 0.4 * r.hp : 1);
  P.gain = (r, s, a) => {
    if (!r || r.civ || !(s in r.xp) || !(a > 0)) return 0;
    const x0 = r.xp[s], d = a * 70 / (70 + x0 * 0.6);   // diminishing returns: a veteran learns slowly
    r.xp[s] = x0 + d;
    const l0 = levelOf(x0), l1 = levelOf(r.xp[s]);
    if (l1 > l0) { ev('level', { id: r.id, skill: s, level: LEVELS[l1][1] }); P.note(r, `${SKILLS[s]}: ${LEVELS[l1][1]}`); }
    return d;
  };
  // the best skill he has (the card's headline)
  P.best = r => { let b = null, bx = -1; for (const k in r.xp) if (r.xp[k] > bx) { bx = r.xp[k]; b = k; } return b; };
  // ------------------------------------------------------------------------------------------------- jobs
  P.qualified = (r, job) => {
    const J = JOBS[job]; if (!J) return 'NO SUCH JOB';
    if (!r) return 'NOBODY';
    if (r.civ) return `${P.label(r)} IS A CIVILIAN`;
    if (r.status === 'kia') return `${P.label(r)} IS DEAD`;
    if (!J.skill) return '';
    const x = P.xp(r, J.skill);
    if (x < (J.min || 0)) return `${P.label(r)} IS NOT QUALIFIED AS ${J.label} (${SKILLS[J.skill]}: ${levelName(x)}, NEEDS ${levelName(J.min)})`;
    return '';
  };
  // to a job (and optionally a place / unit / seat): '' or why not. Only able men take a job.
  P.assign = (r, job, o = {}) => {
    const w = P.qualified(r, job); if (w) return w;
    if (job !== 'reserve' && job !== 'none' && !P.able(r)) return `${P.label(r)} IS ${STATUS[r.status]}`;
    const was = r.job; r.job = job;
    if (o.loc !== undefined) r.loc = o.loc;
    if (o.unit !== undefined) r.unit = o.unit;
    if (o.seat !== undefined) r.seat = o.seat;
    if (job === 'deck' && o.jersey) r.jersey = o.jersey;
    if (was !== job) { P.note(r, `NEW JOB: ${JOBS[job].label}`); ev('job', { id: r.id, job, was }); }
    return '';
  };
  // the best able man for a job at a place (none: '' -> null); skip: ids to leave out; free: not bound to a body / unit
  P.bestFor = (job, loc = null, o = {}) => {
    const J = JOBS[job]; let best = null, bx = -1;
    for (const r of P.recs) {
      if (!P.able(r) || r.civ || (loc && r.loc !== loc) || (o.skip && o.skip.has(r.id))) continue;
      if (o.free && (r.body || r.unit)) continue;
      if (P.qualified(r, job)) continue;
      const x = (J.skill ? P.xp(r, J.skill) : 0) + (r.job === job ? 25 : 0) + (r.job === 'reserve' ? 5 : 0);
      if (x > bx) { bx = x; best = r; }
    }
    return best;
  };
  // ------------------------------------------------------------------------------------------------- squads
  const ORD = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH', '9TH'];
  P.squadName = () => `${ORD[(P.nextSquad - 1) % ORD.length]} SQUAD${P.nextSquad > ORD.length ? ' ' + Math.ceil(P.nextSquad / ORD.length) : ''}`;
  P.squad = id => P.squads.find(s => s.id === id) || null;
  P.members = sq => sq ? sq.members.map(P.get).filter(r => r && r.status !== 'kia') : [];
  P.formSquad = (name, recs = [], loc = null) => {
    const sq = { id: P.nextSquad, name: name || P.squadName(), members: [], loc: loc || (recs[0] && recs[0].loc) || 'ALBATROSS', gs: null };
    P.nextSquad++; P.squads.push(sq);
    for (const r of recs) P.joinSquad(r, sq);
    ev('squad', { sq: sq.id, what: 'form' });
    return sq;
  };
  P.leaveSquad = r => {
    const sq = P.squad(r.squad); r.squad = null; if (!sq) return null;
    const i = sq.members.indexOf(r.id); if (i >= 0) sq.members.splice(i, 1);
    ev('squad', { sq: sq.id, id: r.id, what: 'leave' });
    if (!sq.members.length) P.squads.splice(P.squads.indexOf(sq), 1);
    return sq;
  };
  P.joinSquad = (r, sq) => {
    if (!r || !sq || r.civ) return 'NO';
    if (r.squad === sq.id) return '';
    if (r.squad) P.leaveSquad(r);
    sq.members.push(r.id); r.squad = sq.id;
    ev('squad', { sq: sq.id, id: r.id, what: 'join' });
    return '';
  };
  // a fire team or a detail taken out of a squad as a squad of its own
  P.split = (sq, recs, name) => { if (!sq || !recs.length) return null; const n = P.formSquad(name, [], sq.loc); for (const r of recs) if (r.squad === sq.id) P.joinSquad(r, n); return n; };
  // two squads become one (b into a)
  P.merge = (a, b) => { if (!a || !b || a === b) return a; for (const r of P.members(b)) P.joinSquad(r, a); const i = P.squads.indexOf(b); if (i >= 0) P.squads.splice(i, 1); return a; };
  P.leaderOf = sq => { let best = null, bx = -1; for (const r of P.members(sq)) if (P.able(r)) { const x = P.xp(r, 'leadership') + (r.job === 'leader' ? 40 : 0); if (x > bx) { bx = x; best = r; } } return best; };
  // ------------------------------------------------------------------------------------------------- wounds
  // amount: 0..1 of the body (the host scales its own damage to this); for a record whose body is a live sim
  // (o.simDecides), the sim's verdict comes in o.status and the record follows it
  P.hurt = (r, o = {}) => {
    if (!r || r.status === 'kia') return r ? r.status : null;
    const amt = clamp(o.amount ?? 0.2, 0, 2), by = o.by || null;
    const ff = !!(by && by.side !== undefined && by.side === 1 && (r.side === 1 || r.side === 0));
    r.wounds.push({ part: o.part || 'body', sev: amt, what: o.what || 'HIT', t: P.time, ff });
    if (r.wounds.length > 12) r.wounds.shift();
    if (o.hp !== undefined) r.hp = clamp(o.hp, 0, 1); else r.hp = clamp(r.hp - amt, 0, 1);
    let st = o.status;
    if (!st) st = r.hp <= 0 ? 'kia' : r.hp < 0.45 ? 'down' : 'wounded';
    if (ff) {
      if (by.pid && by.pid !== r.id) { const s = P.get(by.pid); if (s) s.stats.ffBy++; }
      r.stats.ffOn++;
      P.ff.incidents++;
      if (r.civ) { if (st === 'kia') P.ff.civKilled++; else P.ff.civWounded++; }
      else if (st === 'kia') P.ff.killed++; else P.ff.wounded++;
      P.ff.log.push({ t: P.time, id: r.id, what: by.what || o.what || 'OUR FIRE', st }); if (P.ff.log.length > 60) P.ff.log.shift();
      ev('ff', { id: r.id, what: by.what || o.what || 'OUR FIRE', st, civ: r.civ });
    }
    if (st === 'kia') P.kill(r, o.what || 'KILLED', by);
    else { r.status = st === 'down' && r.status === 'sickbay' ? 'sickbay' : st; P.note(r, `WOUNDED: ${o.part ? o.part.toUpperCase() + ', ' : ''}${o.what || 'HIT'}${ff ? ' (BLUE ON BLUE)' : ''}`); ev('wia', { id: r.id, st }); }
    return r.status;
  };
  // the sim's own wound state for a bound body (no new wound): keep the record's summary current
  P.health = (r, hp, status) => {
    if (!r || r.status === 'kia') return;
    r.hp = clamp(hp, 0, 1);
    if (status === 'kia') { P.kill(r, 'DIED OF WOUNDS'); return; }
    if (status && status !== r.status && r.status !== 'sickbay' && r.status !== 'evac') { r.status = status; ev('state', { id: r.id, status }); }
  };
  P.kill = (r, why = 'KILLED', by = null) => {
    if (!r || r.status === 'kia') return;
    r.status = 'kia'; r.hp = 0; r.why = why; r.diedT = P.time; r.diedAt = r.loc;
    if (r.squad) { const sq = P.squad(r.squad); if (sq) { const i = sq.members.indexOf(r.id); if (i >= 0) sq.members.splice(i, 1); if (!sq.members.length) P.squads.splice(P.squads.indexOf(sq), 1); } }
    if (!r.civ) P.kiaList.push(r.id);
    P.note(r, `KIA: ${why}`); ev('kia', { id: r.id, why, civ: r.civ });
  };
  // the carrier's sick bay: wounded men recover there and go back to duty (GAME: 2 min + 6 min x how badly)
  P.SICKBAY = { base: 120, perSev: 360 };
  P.toSickBay = r => {
    if (!r || r.status === 'kia' || r.civ) return 'NO';
    const sev = clamp(1 - r.hp, 0.05, 1);
    r.status = 'sickbay'; r.loc = 'ALBATROSS'; r.unit = null; r.seat = null; r.sickT = P.SICKBAY.base + P.SICKBAY.perSev * sev;
    if (r.squad) P.leaveSquad(r);
    P.note(r, 'ADMITTED TO THE SICK BAY'); ev('sickbay', { id: r.id });
    return '';
  };
  P.step = dt => {
    P.time += dt;
    for (const r of P.recs) {
      if (r.status !== 'sickbay') continue;
      r.sickT -= dt; r.hp = Math.min(1, r.hp + dt / Math.max(60, r.sickT + 60) * (1 - r.hp));
      if (r.sickT <= 0) { r.status = 'fit'; r.hp = 1; r.wounds.length = 0; r.job = r.job === 'none' ? MOS[r.mos].job : r.job; P.note(r, 'RETURNED TO DUTY'); ev('rtd', { id: r.id }); }
    }
  };
  // ------------------------------------------------------------------------------------------------- kit
  P.kit = r => r ? (r.kitRoot || (r.kitRoot = makeKit(r))) : null;
  P.counts = () => {
    const c = { total: 0, fit: 0, wounded: 0, sickbay: 0, kia: P.kiaList.length, civ: 0 };
    for (const r of P.recs) { if (r.civ) { c.civ++; continue; } if (r.status === 'kia') continue; c.total++; if (r.status === 'fit') c.fit++; else if (r.status === 'sickbay') c.sickbay++; else c.wounded++; }
    return c;
  };
  return P;
}
