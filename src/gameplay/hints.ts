import { ADVANCE, GLYPH_H, GLYPH_W, LINE_HEIGHT } from '../data/pixelFont';
import type { Level } from './level';
import type { Player } from './player';

/** World-px box (also used for where the player's feet are). */
export interface Zone {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Text carved into the land. */
export interface CarvedHint {
  id: string;
  lines: string[];
  /** Centre x and top y (world px) of the text. */
  x: number;
  y: number;
  /** Size multiplier of the 3x5 font (default 1). */
  scale?: number;
  /** Each letter sits this far (px) under the surface above it, so the text follows slopes. */
  followSurface?: number;
}

/** A hint carved once the player has been stuck at an obstacle for a while. */
export interface StuckHint extends CarvedHint {
  /** Seconds spent in `zone` (before solving it) until it shows. */
  after: number;
  /** Where the player is while trying this obstacle. */
  zone: Zone;
  /** Once the feet have been in here, the obstacle is solved and the hint is never needed. */
  solved: Zone;
}

export interface LostPoleHint {
  lines: string[];
  /** Seconds without the pole before it shows. */
  after: number;
}

export interface PlacedChar {
  ch: string;
  /** Top-left of the glyph (world px). */
  x: number;
  y: number;
}

export const LOST_POLE_ID = 'lostPole';
/** The lost-pole hint is carved again where you are if you're this far (px) from the last one. */
const LOST_POLE_MOVE = 240;
/** Text is carved this far (px) below the surface under the player. */
const CARVE_DEPTH = 4;
/** Clear space kept around carved text (px). */
const TEXT_MARGIN = 3;

/**
 * Where each letter of a carved text goes. Lines are centred on h.x; with
 * followSurface each letter drops to sit that far under the ground above it.
 */
export function layoutHint(h: CarvedHint, level: Level): PlacedChar[] {
  const k = h.scale ?? 1;
  const out: PlacedChar[] = [];
  h.lines.forEach((line, li) => {
    const x0 = Math.round(h.x - (line.length * ADVANCE * k - k) / 2);
    for (let i = 0; i < line.length; i++) {
      const x = x0 + i * ADVANCE * k;
      let y = h.y + li * LINE_HEIGHT * k;
      if (h.followSurface !== undefined) {
        const cx = x + (GLYPH_W * k) / 2;
        const top = level.groundBelow(cx, h.y - 64, 256);
        if (top !== null) y = Math.round(top) + h.followSurface + li * LINE_HEIGHT * k;
      }
      out.push({ ch: line[i]!, x, y });
    }
  });
  return out;
}

/** The box a carved text covers, with a margin. */
export function hintBox(h: CarvedHint, level: Level): Zone {
  const k = h.scale ?? 1;
  const chars = layoutHint(h, level);
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const c of chars) {
    b.x0 = Math.min(b.x0, c.x);
    b.x1 = Math.max(b.x1, c.x + GLYPH_W * k);
    b.y0 = Math.min(b.y0, c.y);
    b.y1 = Math.max(b.y1, c.y + GLYPH_H * k);
  }
  return { x0: b.x0 - TEXT_MARGIN, x1: b.x1 + TEXT_MARGIN, y0: b.y0 - TEXT_MARGIN, y1: b.y1 + TEXT_MARGIN };
}

function overlaps(a: Zone, b: Zone): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

function inside(z: Zone, x: number, y: number): boolean {
  return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;
}

/**
 * Tracks how long the player has been stuck at each obstacle and which hints
 * are carved into the land. Lives across restarts (R): time stuck still
 * counts, and carved hints stay carved. Never carves text over other text:
 * `reserved` are the writings that are (or will be) in the land anyway.
 * Pure: no rendering.
 */
export class HintTracker {
  readonly carved = new Map<string, CarvedHint>();
  private readonly stuckTime = new Map<string, number>();
  private readonly solved = new Set<string>();
  private poleLostFor = 0;

  constructor(
    private readonly level: Level,
    private readonly stuck: readonly StuckHint[],
    private readonly lostPole: LostPoleHint,
    private readonly reserved: readonly CarvedHint[] = [],
  ) {}

  /** Advances by dt; returns hints newly carved (or carved again somewhere else) this step. */
  update(player: Player, dt: number): CarvedHint[] {
    const out: CarvedHint[] = [];
    const { x, y } = player;
    for (const h of this.stuck) {
      if (this.solved.has(h.id) || this.carved.has(h.id)) continue;
      if (inside(h.solved, x, y)) {
        this.solved.add(h.id);
        continue;
      }
      if (!inside(h.zone, x, y)) continue;
      const t = (this.stuckTime.get(h.id) ?? 0) + dt;
      this.stuckTime.set(h.id, t);
      if (t >= h.after) out.push(this.carve({ id: h.id, lines: h.lines, x: h.x, y: h.y }));
    }

    this.poleLostFor = player.carry.held ? 0 : this.poleLostFor + dt;
    if (this.poleLostFor >= this.lostPole.after) {
      const prev = this.carved.get(LOST_POLE_ID);
      const ground = this.level.groundBelow(x, y - 1, this.level.pixelHeight);
      if (ground !== null && (!prev || Math.abs(prev.x - x) > LOST_POLE_MOVE)) {
        const placed = this.findSpace({ id: LOST_POLE_ID, lines: this.lostPole.lines, x: Math.round(x), y: Math.round(ground) + CARVE_DEPTH });
        if (placed) out.push(this.carve(placed));
      }
    }
    return out;
  }

  /** Seconds stuck so far at an obstacle (for tests and the dev overlay). */
  stuckFor(id: string): number {
    return this.stuckTime.get(id) ?? 0;
  }

  isSolved(id: string): boolean {
    return this.solved.has(id);
  }

  /**
   * A spot for the text near where it wants to be that doesn't touch any other
   * writing and is all in solid ground: the spot itself, else below the text
   * in the way, else to either side of it. Null if there's no room nearby.
   */
  private findSpace(h: CarvedHint): CarvedHint | null {
    const others = [...this.reserved, ...[...this.carved.values()].filter((o) => o.id !== h.id)].map((o) => hintBox(o, this.level));
    const tried: CarvedHint[] = [h];
    for (let i = 0; i < tried.length && i < 24; i++) {
      const c = tried[i]!;
      const box = hintBox(c, this.level);
      const hit = others.find((o) => overlaps(o, box));
      if (!hit) {
        if (this.inGround(c)) return c;
        continue;
      }
      const w = box.x1 - box.x0;
      tried.push({ ...c, y: Math.round(hit.y1 + 1) });
      tried.push({ ...c, x: Math.round(hit.x1 + w / 2 + 1) });
      tried.push({ ...c, x: Math.round(hit.x0 - w / 2 - 1) });
    }
    return null;
  }

  /** Is every letter of the text inside solid ground? */
  private inGround(h: CarvedHint): boolean {
    const k = h.scale ?? 1;
    return layoutHint(h, this.level).every(
      (c) => this.level.isSolidAt(c.x + 0.5, c.y + 0.5) && this.level.isSolidAt(c.x + GLYPH_W * k - 0.5, c.y + GLYPH_H * k - 0.5),
    );
  }

  private carve(h: CarvedHint): CarvedHint {
    this.carved.set(h.id, h);
    return h;
  }
}
