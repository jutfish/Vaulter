import type { LostPoleHint, StuckHint, Zone } from '../gameplay/hints';
import { longRunMarks as m } from './levels';
import { TILE } from './tuning';

// Hints carved into the land when a player is stuck. The game is about
// discovering what the pole can do: hints nudge, they don't solve, and only
// appear after a real struggle. Times are seconds spent at that obstacle
// (counted across restarts) before the hint is carved.

/** Ground top at height 0 (world px). */
const BASE = 28 * TILE;
const col = (c: number) => c * TILE;
/** Feet on the surface at height h (tiles), give or take. */
const at = (fromCol: number, toCol: number, h: number, slack = 8): Zone => ({
  x0: col(fromCol),
  x1: col(toCol),
  y0: BASE - h * TILE - slack,
  y1: BASE - h * TILE + slack,
});
/** Anywhere between two columns at any height. */
const span = (fromCol: number, toCol: number): Zone => ({ x0: col(fromCol), x1: col(toCol), y0: -1e9, y1: 1e9 });
/** Carved into the ground at height 0, this far (px) below the surface. */
const inGround = (c: number, below = 6) => ({ x: col(c), y: BASE + below });

const lastPothole = m.potholes[m.potholes.length - 1]!;

export const longRunHints: StuckHint[] = [
  {
    id: 'firstVault',
    lines: ['HOLD -> TO POINT THE POLE. PRESS DOWN TO PLANT IT,', 'KEEP HOLDING TO BEND IT, LET GO TO FLY.'],
    ...inGround(38),
    after: 45,
    zone: at(1, 56, 0),
    solved: span(58, 400),
  },
  {
    id: 'potholes',
    lines: ['SPRINT, THEN HOP JUST BEFORE THE EDGE.', 'HOLD THE HOP KEY FOR A LONGER HOP.'],
    ...inGround(m.potholes[1]! + 4, 22),
    after: 60,
    zone: { ...span(m.potholes[0]! - 6, lastPothole + 8), y0: -1e9, y1: 1e9 },
    solved: span(m.hills + 2, 400),
  },
  {
    id: 'plateau',
    lines: ["THE POLE DOESN'T ONLY TAKE YOU OVER THINGS.", 'IT CAN TAKE YOU UP ONTO THEM.'],
    ...inGround(m.plateau - 14),
    after: 90,
    zone: at(m.plateau - 40, m.plateau, 0),
    solved: at(m.plateau, m.plateau + 18, 3),
  },
  {
    id: 'ledge',
    lines: ['NOT EVERY VAULT HAS TO GO FORWARDS.'],
    x: col(m.cliff) + 80,
    y: BASE - 6 * TILE,
    after: 180,
    zone: at(m.ledgeFrom - 10, m.cliff, 0),
    solved: at(m.ledgeFrom, m.ledgeTo, m.ledgeHeight),
  },
  {
    id: 'ledge2',
    lines: ['LET GO OF DOWN EARLY,', 'AND HOLD THE WAY YOU CAME.'],
    x: col(m.cliff) + 80,
    y: BASE - 4 * TILE,
    after: 300,
    zone: at(m.ledgeFrom - 10, m.cliff, 0),
    solved: at(m.ledgeFrom, m.ledgeTo, m.ledgeHeight),
  },
  {
    id: 'tier',
    lines: ['ONCE MORE, THE OTHER WAY.'],
    x: col(m.tierFrom - 6),
    y: BASE - m.ledgeHeight * TILE + 5,
    after: 120,
    zone: at(m.ledgeFrom, m.ledgeTo, m.ledgeHeight),
    solved: at(m.tierFrom, m.cliff + 10, m.cliffHeight),
  },
  {
    id: 'bigWall',
    lines: ['TOO HIGH? BRING MORE SPEED DOWN THE SLOPE,', 'PLANT ON THE FLAT AND LET GO A LITTLE SOONER.'],
    ...inGround(m.bigWall - 6),
    after: 120,
    zone: { x0: col(m.cliff + 10), x1: col(m.bigWall), y0: BASE - m.cliffHeight * TILE - 8, y1: BASE + 8 },
    solved: span(m.bigWall + 2, 400),
  },
  {
    id: 'lastWall',
    lines: ['PLANT ABOUT TWO POLE LENGTHS OUT.', 'LET GO AS THE POLE STANDS UP.'],
    ...inGround(m.lastWall - 7),
    after: 120,
    zone: at(lastPothole + 5, m.lastWall, 0),
    solved: span(m.lastWall + 2, 420),
  },
];

export const lostPoleHint: LostPoleHint = {
  lines: ['OOPS, BE CAREFUL NOT TO LOSE YOUR POLE!', "IF YOU CAN'T FIND IT, PRESS R TO RESTART."],
  after: 3,
};
