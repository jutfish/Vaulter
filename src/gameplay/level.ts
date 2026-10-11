import { TILE } from '../data/tuning';

export interface LevelData {
  name: string;
  /** Rows of characters: '#' solid, '.' empty, 'S' player start (feet), 'F' finish column. */
  rows: string[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Level {
  readonly width: number;
  readonly height: number;
  readonly startX: number;
  readonly startY: number;
  /** World x past which the level counts as cleared (-1 if none). */
  readonly finishX: number;
  private readonly solid: Uint8Array;

  constructor(readonly data: LevelData) {
    this.height = data.rows.length;
    this.width = Math.max(...data.rows.map((r) => r.length));
    this.solid = new Uint8Array(this.width * this.height);
    let sx = TILE * 2;
    let sy = 0;
    let fx = -1;
    data.rows.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        const c = row[tx];
        if (c === '#') this.solid[ty * this.width + tx] = 1;
        else if (c === 'S') {
          sx = tx * TILE + TILE / 2;
          sy = (ty + 1) * TILE;
        } else if (c === 'F' && fx < 0) fx = tx * TILE;
      }
    });
    this.startX = sx;
    this.startY = sy;
    this.finishX = fx;
  }

  get pixelWidth(): number {
    return this.width * TILE;
  }

  get pixelHeight(): number {
    return this.height * TILE;
  }

  /** Out-of-bounds counts as solid at the sides and bottom, open above. */
  isSolidTile(tx: number, ty: number): boolean {
    if (tx < 0 || tx >= this.width || ty >= this.height) return true;
    if (ty < 0) return false;
    return this.solid[ty * this.width + tx] === 1;
  }

  isSolidAt(x: number, y: number): boolean {
    return this.isSolidTile(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  overlapsSolid(r: Rect): boolean {
    const x0 = Math.floor(r.x / TILE);
    const x1 = Math.floor((r.x + r.w - 1e-6) / TILE);
    const y0 = Math.floor(r.y / TILE);
    const y1 = Math.floor((r.y + r.h - 1e-6) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.isSolidTile(tx, ty)) return true;
    return false;
  }
}

export interface MoveResult {
  hitX: boolean;
  hitY: boolean;
  grounded: boolean;
  ceiling: boolean;
}

/**
 * Moves an axis-aligned box by (dx, dy) against solid tiles, x first then y,
 * snapping flush to any tile it hits. Mutates and returns the box.
 */
export function moveBox(level: Level, box: Rect, dx: number, dy: number): MoveResult {
  const result: MoveResult = { hitX: false, hitY: false, grounded: false, ceiling: false };

  if (dx !== 0) {
    box.x += dx;
    if (level.overlapsSolid(box)) {
      result.hitX = true;
      if (dx > 0) box.x = Math.floor((box.x + box.w) / TILE) * TILE - box.w;
      else box.x = (Math.floor(box.x / TILE) + 1) * TILE;
    }
  }

  if (dy !== 0) {
    box.y += dy;
    if (level.overlapsSolid(box)) {
      result.hitY = true;
      if (dy > 0) {
        box.y = Math.floor((box.y + box.h) / TILE) * TILE - box.h;
        result.grounded = true;
      } else {
        box.y = (Math.floor(box.y / TILE) + 1) * TILE;
        result.ceiling = true;
      }
    }
  }

  if (!result.grounded) {
    // Standing exactly on a surface counts as grounded.
    const probe = { x: box.x, y: box.y + box.h, w: box.w, h: 0.5 };
    result.grounded = level.overlapsSolid(probe);
  }
  return result;
}
