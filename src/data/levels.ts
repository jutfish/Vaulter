import type { LevelData } from '../gameplay/level';
import { TILE } from './tuning';

/** Simple editable description of a flat test level. Units are tiles (16 px). */
export interface FlatLevelSpec {
  name: string;
  length: number;
  rows: number;
  groundRow: number;
  startCol: number;
  finishCol: number;
  walls: { col: number; width: number; height: number }[];
}

export const firstWall: FlatLevelSpec = {
  name: 'First wall',
  length: 220,
  rows: 17,
  groundRow: 14,
  startCol: 4,
  // Long run-up (~1500 px) to reach top speed, a 3-tile wall (48 px),
  // then a second run-up to a taller 4-tile wall (64 px).
  walls: [
    { col: 0, width: 1, height: 12 },
    { col: 100, width: 2, height: 3 },
    { col: 160, width: 2, height: 4 },
    { col: 219, width: 1, height: 12 },
  ],
  finishCol: 164,
};

export function buildFlatLevel(spec: FlatLevelSpec): LevelData {
  const grid: string[][] = [];
  for (let y = 0; y < spec.rows; y++) {
    grid.push(Array.from({ length: spec.length }, () => (y >= spec.groundRow ? '#' : '.')));
  }
  for (const w of spec.walls) {
    for (let y = spec.groundRow - w.height; y < spec.groundRow; y++) {
      for (let x = w.col; x < w.col + w.width; x++) grid[y]![x] = 'B';
    }
  }
  grid[spec.groundRow - 1]![spec.startCol] = 'S';
  if (grid[0]![spec.finishCol] === '.') grid[0]![spec.finishCol] = 'F';
  return { name: spec.name, rows: grid.map((r) => r.join('')) };
}

/**
 * Lays a level out left to right like a course: a cursor column and the
 * current ground height (tiles above the base row). Each call adds that many
 * columns. Heights are in tiles; earth fills down to the bottom of the level.
 */
export class CourseBuilder {
  /** Next column to lay down. */
  col = 0;
  /** Ground height (tiles above the base row) at the cursor. */
  h = 0;
  private readonly grid: string[][];

  constructor(
    readonly name: string,
    readonly cols: number,
    readonly rows: number,
    /** Row of the top tile of the ground at height 0. */
    readonly baseRow: number,
  ) {
    this.grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => '.'));
  }

  /** Row index of the top ground tile at height h. */
  topRow(h = this.h): number {
    return this.baseRow - h;
  }

  private set(col: number, row: number, c: string): void {
    if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) this.grid[row]![col] = c;
  }

  private earth(col: number, fromRow: number): void {
    for (let r = fromRow; r < this.rows; r++) this.set(col, r, '#');
  }

  flat(n: number): this {
    for (let i = 0; i < n; i++) this.earth(this.col++, this.topRow());
    return this;
  }

  /** Slope rising n tiles over n columns in the direction of travel. */
  up(n: number): this {
    for (let i = 0; i < n; i++) {
      this.earth(this.col, this.topRow());
      this.set(this.col++, this.topRow() - 1, '/');
      this.h++;
    }
    return this;
  }

  /** Slope dropping n tiles over n columns. */
  down(n: number): this {
    for (let i = 0; i < n; i++) {
      this.set(this.col, this.topRow(), '\\');
      this.h--;
      this.earth(this.col++, this.topRow());
    }
    return this;
  }

  /** Changes the ground height in one step: a cliff face (up) or a drop (down). */
  cliff(dh: number): this {
    this.h += dh;
    return this;
  }

  /** A hole n wide and `depth` tiles deep. */
  pit(n: number, depth: number): this {
    for (let i = 0; i < n; i++) this.earth(this.col++, this.topRow() + depth);
    return this;
  }

  /** A brick wall n wide and `height` tiles tall standing on the ground. */
  wall(n: number, height: number): this {
    for (let i = 0; i < n; i++) {
      for (let r = this.topRow() - height; r < this.topRow(); r++) this.set(this.col, r, 'B');
      this.earth(this.col++, this.topRow());
    }
    return this;
  }

  /** A floating slab over columns [from, to) whose top is `height` tiles above the base row. */
  slab(from: number, to: number, height: number, thickness = 1, c = '#'): this {
    for (let col = from; col < to; col++) for (let r = 0; r < thickness; r++) this.set(col, this.topRow(height) + r, c);
    return this;
  }

  /** A brick post `height` tiles tall standing on a surface whose top is `onHeight` tiles above the base row. */
  post(col: number, onHeight: number, height: number): this {
    for (let r = 1; r <= height; r++) this.set(col, this.topRow(onHeight) - r, 'B');
    return this;
  }

  /** Player start at the cursor (feet on the ground). */
  start(): this {
    this.set(this.col, this.topRow() - 1, 'S');
    return this;
  }

  /** Finish line at the cursor. */
  finish(): this {
    this.set(this.col, 0, 'F');
    return this;
  }

  build(): LevelData {
    return { name: this.name, rows: this.grid.map((r) => r.join('')) };
  }
}

/** Column landmarks of the long course (for tests and probes). */
export interface LongRunMarks {
  /** The competition bar: column it stands over (between this column and the next) and its height (px). */
  barCol: number;
  barHeight: number;
  /** First column of each pothole on the base ground. */
  potholes: number[];
  hills: number;
  /** Face of the plateau you vault up onto. */
  plateau: number;
  /** 48 px wall after the plateau. */
  plateauWall: number;
  /** The cliff (too tall to vault) and the switchback up to its top: a ledge over the ground
   *  run-up and an upper tier over the ledge, each reached by a backwards vault. */
  cliff: number;
  cliffHeight: number;
  ledgeFrom: number;
  ledgeTo: number;
  ledgeHeight: number;
  /** The upper tier runs from here to the cliff top, at the cliff's height. */
  tierFrom: number;
  /** Post at the ledge's far end: too tall to vault onto the ledge from the ground. */
  postHeight: number;
  /** 80 px wall at the foot of the long slope down from the cliff top: needs the downhill speed. */
  bigWall: number;
  /** The last wall (64 px), just before the finish. */
  lastWall: number;
}

/**
 * The long course (v0.4; the stadium since v0.7): the competition bar, potholes to hop at a sprint, rolling
 * hills, a vault up onto a plateau, down its slope and over a wall, then a
 * cliff too tall to vault. A backwards vault takes you up onto the ledge you
 * ran under; run back along it and a second backwards vault takes you onto
 * the upper tier over it, which leads to the cliff top. Down the long slope
 * at speed into the big wall, two more potholes and the last wall.
 */
function layLongRun(): { data: LevelData; marks: LongRunMarks } {
  const b = new CourseBuilder('Long run', 420, 34, 28);
  const potholes: number[] = [];
  const pothole = (n: number) => {
    potholes.push(b.col);
    b.pit(n, 1);
  };
  // Left boundary and the run-up.
  b.wall(1, 14).flat(3).start().flat(52);
  // The competition bar (the Olympic final), its landing mat, then room to get back up to speed.
  const barCol = b.col;
  const barHeight = 40;
  b.flat(26);
  // Potholes, widening: hop them at a sprint (too slow or too early a hop and you're in the hole).
  pothole(2);
  b.flat(8);
  pothole(3);
  b.flat(8);
  pothole(4);
  b.flat(9);
  pothole(5);
  b.flat(9);
  pothole(6);
  b.flat(12);
  // Rolling hills.
  const hills = b.col;
  b.up(2).flat(3).down(2).flat(3).up(3).flat(2).down(3).flat(4).up(1).down(1).flat(2).up(1).down(1).flat(6);
  // Run-up, vault onto a plateau (48 px), down its far side and get back up to speed for a 48 px wall.
  b.flat(18);
  const plateau = b.col;
  b.cliff(3).flat(16).down(3).flat(30);
  const plateauWall = b.col;
  b.wall(2, 3);
  // The cliff: too tall to vault from the ground. Switchback up: run right under the ledge,
  // vault backwards onto it; run left along it under the tier, vault backwards onto the tier.
  const cliff = b.col + 70;
  const cliffHeight = 8;
  const ledgeHeight = 4;
  const postHeight = 3;
  const ledgeFrom = cliff - 54;
  const ledgeTo = cliff - 7;
  const tierFrom = cliff - 34;
  b.flat(cliff - b.col).cliff(cliffHeight).flat(10).down(cliffHeight);
  b.slab(ledgeFrom, ledgeTo, ledgeHeight);
  b.post(ledgeFrom, ledgeHeight, postHeight);
  b.slab(tierFrom, cliff, cliffHeight);
  // Down the long slope at speed into the big wall (80 px), then potholes and the last wall (64 px).
  b.flat(8);
  const bigWall = b.col;
  b.wall(2, 5).flat(11);
  pothole(4);
  b.flat(7);
  pothole(5);
  b.flat(16);
  const lastWall = b.col;
  b.wall(2, 4).flat(6).finish().flat(b.cols - 1 - b.col);
  b.wall(1, 14);
  return {
    data: {
      ...b.build(),
      bar: { x: (barCol + 1) * TILE, y: b.topRow(0) * TILE - barHeight },
      // Just past each obstacle (potholes: the far edge plus a stride), in course order.
      checkpoints: [
        { col: barCol + 7, h: 0, facing: 1, from: barCol + 2, to: potholes[0]! },
        ...potholes.slice(0, 5).map((c, i) => ({ col: c + 4 + i, h: 0, facing: 1 as const, from: c + 2 + i, to: i < 4 ? potholes[i + 1]! : plateau })),
        { col: plateau + 3, h: 3, facing: 1, from: plateau, to: plateau + 16 },
        { col: plateauWall + 4, h: 0, facing: 1, from: plateauWall + 2, to: cliff },
        { col: ledgeTo - 3, h: ledgeHeight, facing: -1, from: ledgeFrom + 1, to: ledgeTo },
        { col: tierFrom + 3, h: cliffHeight, facing: 1, from: tierFrom, to: cliff + 10 },
        { col: bigWall + 4, h: 0, facing: 1, from: bigWall + 2, to: potholes[5]! },
        ...potholes.slice(5).map((c, i) => ({ col: c + 6 + i, h: 0, facing: 1 as const, from: c + 4 + i, to: i === 0 ? potholes[6]! : lastWall })),
        { col: lastWall + 4, h: 0, facing: 1, from: lastWall + 2, to: b.cols },
      ],
      zones: [
        { from: 0, theme: 'track' },
        { from: hills - 3, theme: 'infield' },
        { from: plateau, theme: 'stand' },
        { from: cliff, theme: 'roof' },
        { from: cliff + 10 + cliffHeight, theme: 'outside' },
      ],
    },
    marks: { barCol, barHeight, potholes, hills, plateau, plateauWall, cliff, cliffHeight, ledgeFrom, ledgeTo, ledgeHeight, tierFrom, postHeight, bigWall, lastWall },
  };
}

const longRun = layLongRun();
export const longRunMarks: LongRunMarks = longRun.marks;

export function buildLongRun(): LevelData {
  return longRun.data;
}
