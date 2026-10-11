import type { LevelData } from '../gameplay/level';

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
      for (let x = w.col; x < w.col + w.width; x++) grid[y]![x] = '#';
    }
  }
  grid[spec.groundRow - 1]![spec.startCol] = 'S';
  if (grid[0]![spec.finishCol] === '.') grid[0]![spec.finishCol] = 'F';
  return { name: spec.name, rows: grid.map((r) => r.join('')) };
}
