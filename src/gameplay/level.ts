import { TILE } from '../data/tuning';

export interface LevelData {
  name: string;
  /**
   * Rows of characters: '#' solid earth, 'B' solid wall (same physics, drawn as brick),
   * '/' 45-degree slope rising to the right, '\' slope rising to the left (both solid
   * below the diagonal), '.' empty, 'S' player start (feet), 'F' finish column.
   */
  rows: string[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export enum Tile {
  Empty = 0,
  Earth = 1,
  Wall = 2,
  /** '/': rises to the right, solid below the line from bottom-left to top-right. */
  SlopeUp = 3,
  /** '\': rises to the left, solid below the line from top-left to bottom-right. */
  SlopeDown = 4,
}

const TILE_CHARS: Record<string, Tile> = { '#': Tile.Earth, B: Tile.Wall, '/': Tile.SlopeUp, '\\': Tile.SlopeDown };

export function isSlope(t: Tile): boolean {
  return t === Tile.SlopeUp || t === Tile.SlopeDown;
}

/** Surface of a slope tile (px down from the tile's top) at local x (0..TILE). */
function slopeLocalY(t: Tile, lx: number): number {
  return t === Tile.SlopeUp ? TILE - lx : lx;
}

export class Level {
  readonly width: number;
  readonly height: number;
  readonly startX: number;
  readonly startY: number;
  /** World x past which the level counts as cleared (-1 if none). */
  readonly finishX: number;
  private readonly tiles: Uint8Array;

  constructor(readonly data: LevelData) {
    this.height = data.rows.length;
    this.width = Math.max(...data.rows.map((r) => r.length));
    this.tiles = new Uint8Array(this.width * this.height);
    let sx = TILE * 2;
    let sy = 0;
    let fx = -1;
    data.rows.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        const c = row[tx]!;
        const kind = TILE_CHARS[c];
        if (kind !== undefined) this.tiles[ty * this.width + tx] = kind;
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

  /** Out-of-bounds is solid at the sides and bottom, open above. */
  tileAt(tx: number, ty: number): Tile {
    if (tx < 0 || tx >= this.width || ty >= this.height) return Tile.Earth;
    if (ty < 0) return Tile.Empty;
    return this.tiles[ty * this.width + tx] as Tile;
  }

  /** Is the tile anything but empty (slopes included)? */
  isSolidTile(tx: number, ty: number): boolean {
    return this.tileAt(tx, ty) !== Tile.Empty;
  }

  /** Is the point inside the ground (in a slope tile, only below its diagonal)? */
  isSolidAt(x: number, y: number): boolean {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const t = this.tileAt(tx, ty);
    if (!isSlope(t)) return t !== Tile.Empty;
    return y - ty * TILE > slopeLocalY(t, x - tx * TILE);
  }

  /** Top of the ground at x, for a point (x, y) inside a tile: a slope's diagonal, else the tile's top edge. */
  surfaceAt(x: number, y: number): number {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const t = this.tileAt(tx, ty);
    return isSlope(t) ? ty * TILE + slopeLocalY(t, x - tx * TILE) : ty * TILE;
  }

  /**
   * For a point inside a slope tile below its diagonal: the way out (unit
   * normal) and how deep it is. Null anywhere else (square tiles push out
   * through their faces).
   */
  slopePush(x: number, y: number): { nx: number; ny: number; depth: number } | null {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const t = this.tileAt(tx, ty);
    if (!isSlope(t)) return null;
    const lx = x - tx * TILE;
    const ly = y - ty * TILE;
    const below = ly - slopeLocalY(t, lx);
    if (below <= 0) return null;
    const n = Math.SQRT1_2;
    return { nx: t === Tile.SlopeUp ? -n : n, ny: -n, depth: below * n };
  }

  /**
   * Does the box overlap the ground? Slopes count only where the box reaches
   * below their diagonal. With `includeSlopes` false (the running body, whose
   * feet walk the slopes) slopes are ignored, and so is the earth tucked
   * under them, which the body's uphill corner always dips into.
   */
  overlapsSolid(r: Rect, includeSlopes = true): boolean {
    const x0 = Math.floor(r.x / TILE);
    const x1 = Math.floor((r.x + r.w - 1e-6) / TILE);
    const y0 = Math.floor(r.y / TILE);
    const y1 = Math.floor((r.y + r.h - 1e-6) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = this.tileAt(tx, ty);
        if (t === Tile.Empty) continue;
        if (!isSlope(t)) {
          if (includeSlopes || !isSlope(this.tileAt(tx, ty - 1))) return true;
          continue;
        }
        if (!includeSlopes) continue;
        // The box corner deepest into the slope (bottom-right for '/', bottom-left for '\'), clipped to the tile.
        const lx = t === Tile.SlopeUp ? Math.min(TILE, r.x + r.w - tx * TILE) : Math.max(0, r.x - tx * TILE);
        const ly = Math.min(TILE, r.y + r.h - ty * TILE);
        if (ly > slopeLocalY(t, lx) + 1e-6) return true;
      }
    }
    return false;
  }

  /**
   * The slope under a foot at (x, feetY): its surface height and which way it
   * rises (+1 to the right, -1 to the left). Looks in the tile at the feet and
   * the ones above and below: running uphill fast the foot crosses into the
   * next column under its slope, and a fast fall can sink through one.
   */
  slopeUnder(x: number, feetY: number): { y: number; rise: number } | null {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor((feetY - 1e-3) / TILE);
    for (const row of [ty - 1, ty, ty + 1]) {
      const t = this.tileAt(tx, row);
      if (isSlope(t)) return { y: row * TILE + slopeLocalY(t, x - tx * TILE), rise: t === Tile.SlopeUp ? 1 : -1 };
    }
    return null;
  }

  /** Ground height directly below (x, y) within `maxDrop` px, or null if none. */
  groundBelow(x: number, y: number, maxDrop: number): number | null {
    for (let d = 0; d <= maxDrop; d += 1) {
      if (this.isSolidAt(x, y + d + 0.01)) return this.surfaceAt(x, y + d + 0.01);
    }
    return null;
  }
}

export interface MoveResult {
  hitX: boolean;
  hitY: boolean;
  grounded: boolean;
  ceiling: boolean;
  /** Slope under the feet: +1 rising to the right, -1 rising to the left, 0 flat or airborne. */
  slope: number;
}

export interface MoveOptions {
  /** Feet were on the ground last tick: step up small lips, stick to the ground going down slopes. */
  grounded?: boolean;
  /** Tallest lip (px) stepped up while grounded. */
  stepUp?: number;
}

/**
 * Moves an axis-aligned body (feet at its bottom centre) by (dx, dy), x first
 * then y, snapping flush to any square tile it hits. Slopes are walked on by
 * the feet point; the box itself ignores them. Mutates the box.
 */
export function moveBox(level: Level, box: Rect, dx: number, dy: number, opts: MoveOptions = {}): MoveResult {
  const result: MoveResult = { hitX: false, hitY: false, grounded: false, ceiling: false, slope: 0 };
  const stepUp = opts.grounded ? (opts.stepUp ?? 0) : 0;

  if (dx !== 0) {
    box.x += dx;
    // The box minus a step height at the bottom decides walls; anything lower is a lip to step onto.
    if (level.overlapsSolid({ x: box.x, y: box.y, w: box.w, h: box.h - stepUp }, false)) {
      result.hitX = true;
      if (dx > 0) box.x = Math.floor((box.x + box.w) / TILE) * TILE - box.w;
      else box.x = (Math.floor(box.x / TILE) + 1) * TILE;
    } else if (stepUp > 0 && level.overlapsSolid(box, false)) {
      box.y = Math.floor((box.y + box.h) / TILE) * TILE - box.h;
    }
  }

  if (dy !== 0) {
    box.y += dy;
    if (level.overlapsSolid(box, false)) {
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

  // Slopes: the feet stand on the diagonal.
  const fx = box.x + box.w / 2;
  const slope = level.slopeUnder(fx, box.y + box.h);
  if (slope !== null && box.y + box.h > slope.y - 1e-6 && dy >= 0) {
    box.y = slope.y - box.h;
    result.hitY = true;
    result.grounded = true;
  } else if (opts.grounded && dy >= 0 && !result.grounded) {
    // Running down a slope (or off its foot onto the flat): keep the feet on the ground. While the
    // box still overhangs the edge at the top of a slope the feet are held up, so reach half a body further.
    const g = level.groundBelow(fx, box.y + box.h, Math.abs(dx) + box.w / 2 + 2);
    if (g !== null && !level.overlapsSolid({ ...box, y: g - box.h }, false)) {
      box.y = g - box.h;
      result.hitY = true;
      result.grounded = true;
    }
  }
  const on = level.slopeUnder(fx, box.y + box.h);
  if (on !== null && Math.abs(on.y - (box.y + box.h)) < 0.5) result.slope = on.rise;

  if (!result.grounded) {
    // Standing exactly on a surface counts as grounded.
    const probe = { x: box.x, y: box.y + box.h, w: box.w, h: 0.5 };
    result.grounded = level.overlapsSolid(probe, false) || level.isSolidAt(fx, box.y + box.h + 0.25);
  }
  return result;
}
