import type { CarvedHint, LostPoleHint, StuckHint } from '../gameplay/hints';
import { buildLongRun, longRunMarks as m } from './levels';
import { TILE } from './tuning';

// Words in the land. The game is about discovering what the pole can do, so
// there's almost no instruction: a few permanent lines, the win line, and the
// note when you lose your pole. Stuck-timer hints are supported (HintTracker)
// but none are used for now.

/** Ground top at height 0 (world px). */
const BASE = 28 * TILE;
const col = (c: number) => c * TILE;
const finishX = buildLongRun()
  .rows[0]!.split('')
  .indexOf('F');

/** Carved into the land from the start and always there. */
export const longRunWritings: CarvedHint[] = [
  {
    id: 'intro',
    lines: ['THIS GAME IS ABOUT DISCOVERING SKILLS YOU ALREADY HAVE.'],
    x: col(16),
    y: BASE + 14,
    scale: 2,
  },
  {
    id: 'hopToIt',
    lines: ['HOP TO IT.'],
    x: col(m.cliff - 14),
    y: BASE + 14,
    scale: 3,
  },
  {
    // Down the long slope from the cliff top, just under the surface.
    id: 'slip',
    lines: ["DON'T LET THIS OPPORTUNITY SLIP AWAY."],
    x: col(m.cliff + 10 + m.cliffHeight / 2),
    y: BASE - m.cliffHeight * TILE,
    followSurface: 4,
  },
];

/** Carved after you win. */
export const winWriting: CarvedHint = {
  id: 'win',
  lines: ["THAT'S IT FOR NOW. THANKS!"],
  x: col(finishX + 5),
  y: BASE + 14,
  scale: 2,
};

/** Stuck-at-an-obstacle hints: none for now. */
export const longRunHints: StuckHint[] = [];

export const lostPoleHint: LostPoleHint = {
  lines: ['OOPS, BE CAREFUL NOT TO LOSE YOUR POLE!', "IF YOU CAN'T FIND IT, PRESS R TO RESTART."],
  after: 3,
};
