import type { Level } from './level';
import type { Player } from './player';

/** World-px box the player's feet must be inside. */
export interface Zone {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** A hint carved into the land once the player has been stuck at an obstacle for a while. */
export interface StuckHint {
  id: string;
  lines: string[];
  /** Centre x and top y (world px) of the text. */
  x: number;
  y: number;
  /** Seconds spent in `zone` (before solving it) until it shows. */
  after: number;
  /** Where the player is while trying this obstacle. */
  zone: Zone;
  /** Once the feet have been in here, the obstacle is solved and the hint is never needed. */
  solved: Zone;
}

export interface CarvedHint {
  id: string;
  lines: string[];
  x: number;
  y: number;
}

export interface LostPoleHint {
  lines: string[];
  /** Seconds without the pole before it shows. */
  after: number;
}

export const LOST_POLE_ID = 'lostPole';
/** The lost-pole hint is carved again where you are if you're this far (px) from the last one. */
const LOST_POLE_MOVE = 240;
/** Text is carved this far (px) below the surface under the player. */
const CARVE_DEPTH = 4;

/** World box a carved hint covers (the font is 4 px a character, 7 px a line). */
function box(h: CarvedHint): Zone {
  const w = Math.max(...h.lines.map((l) => l.length)) * 4;
  return { x0: h.x - w / 2, x1: h.x + w / 2, y0: h.y, y1: h.y + h.lines.length * 7 };
}

function overlaps(a: Zone, b: Zone): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

function inside(z: Zone, x: number, y: number): boolean {
  return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;
}

/**
 * Tracks how long the player has been stuck at each obstacle and which hints
 * are carved into the land. Lives across restarts (R): the time you've spent
 * stuck still counts, and carved hints stay carved. Pure: no rendering.
 */
export class HintTracker {
  readonly carved = new Map<string, CarvedHint>();
  private readonly stuckTime = new Map<string, number>();
  private readonly solved = new Set<string>();
  private poleLostFor = 0;

  constructor(
    private readonly stuck: readonly StuckHint[],
    private readonly lostPole: LostPoleHint,
  ) {}

  /** Advances by dt; returns hints newly carved (or carved again somewhere else) this step. */
  update(player: Player, level: Level, dt: number): CarvedHint[] {
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
      const ground = level.groundBelow(x, y - 1, level.pixelHeight);
      if (ground !== null && (!prev || Math.abs(prev.x - x) > LOST_POLE_MOVE)) {
        out.push(this.carve(this.clearOfOthers({ id: LOST_POLE_ID, lines: this.lostPole.lines, x: Math.round(x), y: Math.round(ground) + CARVE_DEPTH })));
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

  /** Moves a hint down below any other carved hint it would overlap. */
  private clearOfOthers(h: CarvedHint): CarvedHint {
    for (let moved = true, n = 0; moved && n < 8; n++) {
      moved = false;
      for (const o of this.carved.values()) {
        if (o.id === h.id || !overlaps(box(o), box(h))) continue;
        h = { ...h, y: box(o).y1 + 2 };
        moved = true;
      }
    }
    return h;
  }

  private carve(h: CarvedHint): CarvedHint {
    this.carved.set(h.id, h);
    return h;
  }
}
