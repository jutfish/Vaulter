import { body, pole, TILE, traffic as cfg } from '../data/tuning';
import type { VehicleType } from '../data/vehicles';
import { resetPoleToHands } from './carry';
import type { Level, Mover, Rect } from './level';
import { placePole, pointAt } from './poleBody';
import { playerBox, type GameEvent, type Player } from './player';

// The traffic level (v0.9), simulated in the traffic's own frame: every
// vehicle goes the same speed, so the vehicles are ordinary static tiles and
// the vault physics is unchanged. Only the road, and everything fixed to it,
// moves: backwards at the traffic speed. Where roadside things are is a pure
// function of time (they repeat every `block` px of road), so restarts and
// the tests are deterministic. Pure: no Pixi, DOM or audio.

/** Something fixed to the road. Bridges and canopies are solid; the rest is scenery. */
export interface RoadsideThing {
  kind: 'bridge' | 'building' | 'lamp' | 'warning' | 'gantry' | 'busStop' | 'tree';
  /** Where it is along the road (world px) before the traffic moves. */
  x: number;
  /** Repeats every `block` px of road (else there's just this one). */
  periodic: boolean;
}

export interface TrafficData {
  /** The bus's rear platform: columns [from, to), top `h` tiles above the road. Board here; the road brings you back here. */
  platform: { from: number; to: number; h: number };
  /** Every vehicle (leftmost column), for drawing; their tiles are in the level's rows. */
  vehicles: { type: VehicleType; col: number }[];
  roadside: RoadsideThing[];
  /** Length of road (px) after which the periodic roadside repeats: one city block. */
  block: number;
  /** A low bridge: deck width (px), and its underside and top (px above the road). */
  bridge: { w: number; bottom: number; top: number };
  /** The entrance canopy of each building (px; top above the road): land on it to get off the traffic. */
  canopy: { dx: number; w: number; top: number; thickness: number };
  /** Where a pole the road carried back is put down: on the bus's top deck at this column and height (tiles). */
  poleDrop: { col: number; h: number };
}

/**
 * Road travel (px) a time after the bus pulls off (negative: still at the
 * stop). It pulls off with constant acceleration over pullOffTime, then
 * holds the traffic speed.
 */
export function roadOffset(since: number): number {
  if (since <= 0) return 0;
  const T = cfg.pullOffTime;
  if (since < T) return (0.5 * cfg.speed * since * since) / T;
  return 0.5 * cfg.speed * T + cfg.speed * (since - T);
}

export function roadSpeedAt(since: number): number {
  if (since <= 0) return 0;
  return cfg.speed * Math.min(1, since / cfg.pullOffTime);
}

/** World x of every copy of a roadside thing that's within [x0, x1] after the road has moved `offset` px. */
export function instancesOf(thing: RoadsideThing, block: number, offset: number, x0: number, x1: number): number[] {
  const base = thing.x - offset;
  if (!thing.periodic) return base >= x0 && base <= x1 ? [base] : [];
  const out: number[] = [];
  for (let k = Math.ceil((x0 - base) / block); base + k * block <= x1; k++) out.push(base + k * block);
  return out;
}

/** The solid roadside (bridge decks, canopies) within [x0, x1] at that road travel. */
export function moversAt(data: TrafficData, roadY: number, offset: number, x0: number, x1: number): Mover[] {
  const out: Mover[] = [];
  for (const t of data.roadside) {
    if (t.kind === 'bridge') {
      const b = data.bridge;
      for (const x of instancesOf(t, data.block, offset, x0 - b.w, x1)) out.push({ kind: 'bridge', x, y: roadY - b.top, w: b.w, h: b.top - b.bottom });
    } else if (t.kind === 'building') {
      const c = data.canopy;
      for (const x of instancesOf(t, data.block, offset, x0 - c.dx - c.w, x1)) out.push({ kind: 'canopy', x: x + c.dx, y: roadY - c.top, w: c.w, h: c.thickness });
    }
  }
  return out;
}

/** The traffic's state for one run: has the fare been paid, where's the road, are you being carried back. */
export class Traffic {
  /** World time the fare went in (null: not boarded yet; the world stands still). */
  paidAt: number | null = null;
  /** Extra road travel (px) put in by the skip cheat. */
  shift = 0;
  /** Off the traffic (on a canopy): the road stops here; the vehicles drive on without you. */
  frozenAt: number | null = null;
  /** Road travel (px) and speed (px/s) this tick. */
  offset = 0;
  speed = 0;
  /** On the road: being carried back to the bus (no control) at this speed. */
  swept = false;
  sweepSpeed = 0;
  poleSweepSpeed = 0;
  readonly roadY: number;

  constructor(
    readonly data: TrafficData,
    private readonly level: Level,
  ) {
    this.roadY = level.startY;
  }

  reset(): void {
    this.paidAt = null;
    this.shift = 0;
    this.frozenAt = null;
    this.swept = false;
    this.sweepSpeed = 0;
    this.poleSweepSpeed = 0;
    this.update(0);
  }

  /** Seconds since the bus pulled off (negative before), at world time t. */
  sinceDepart(t: number): number {
    return this.paidAt === null ? -1 : (this.frozenAt ?? t) - this.paidAt - cfg.departDelay;
  }

  /** Puts the road and the movers where they are at world time t. */
  update(t: number): void {
    const since = this.sinceDepart(t);
    this.offset = roadOffset(since) + this.shift;
    this.speed = this.frozenAt === null ? roadSpeedAt(since) : 0;
    this.level.roadSpeed = this.speed;
    this.level.movers = moversAt(this.data, this.roadY, this.offset, -TILE * 8, this.level.pixelWidth + TILE * 8);
  }

  /** The platform's middle (feet x) and top (feet y). */
  platformSpot(): { x: number; y: number } {
    const pl = this.data.platform;
    return { x: ((pl.from + pl.to) / 2) * TILE, y: this.roadY - pl.h * TILE };
  }

  /** Standing on the bus's platform for the first time: the medal goes in the fare box. */
  checkFare(p: Player, time: number, events: GameEvent[]): void {
    if (this.paidAt !== null || !p.grounded) return;
    const pl = this.data.platform;
    const col = Math.floor(p.x / TILE);
    if (col >= pl.from && col < pl.to && Math.abs(p.y - (this.roadY - pl.h * TILE)) < 1) this.pay(time, events);
  }

  pay(time: number, events: GameEvent[]): void {
    this.paidAt = time;
    events.push({ type: 'fare' });
  }

  /** Standing on the moving road: it takes you (you've fallen into the traffic). */
  checkRoad(p: Player, events: GameEvent[]): void {
    if (this.swept || !p.grounded || p.vault) return;
    if (this.level.surfaceDrag(p.x, p.y) === 0) return;
    this.swept = true;
    this.sweepSpeed = this.speed;
    p.poleMode = 'carry';
    events.push({ type: 'swept' });
  }

  /**
   * Carried back along the road, under and past the traffic (you're in the
   * near lane: no collisions), speeding up, then put back on the bus.
   */
  stepSwept(p: Player, dt: number, events: GameEvent[]): void {
    this.sweepSpeed = Math.min(cfg.sweepMax, this.sweepSpeed + cfg.sweepAccel * dt);
    p.x -= this.sweepSpeed * dt;
    p.y = this.roadY;
    p.vx = -this.sweepSpeed;
    p.vy = 0;
    p.grounded = true;
    p.inVaultFlight = false;
    if (p.carry.held) resetPoleToHands(p.carry, p.x, p.y);
    const spot = this.platformSpot();
    if (p.x <= this.data.platform.to * TILE) {
      this.swept = false;
      p.x = spot.x;
      p.y = spot.y;
      p.vx = 0;
      p.facing = 1;
      p.coyote = 0;
      p.hopBuffer = 0;
      if (p.carry.held) resetPoleToHands(p.carry, p.x, p.y);
      events.push({ type: 'delivered' });
    }
  }

  /**
   * A pole nobody holds that touches the moving road is carried back too
   * (lying flat, no collisions) and put down on the bus's top deck.
   */
  stepLoosePole(p: Player, dt: number): void {
    const c = p.carry;
    if (c.held) {
      c.swept = false;
      return;
    }
    const b = c.pole;
    if (!c.swept) {
      if (this.speed === 0) return;
      let onRoad = false;
      for (let s = 0; s <= pole.totalLength && !onRoad; s += 4) {
        const q = pointAt(b, s);
        onRoad = this.level.surfaceDrag(q.x, q.y - 1.5) > 0 || this.level.surfaceDrag(q.x, q.y) > 0;
      }
      if (!onRoad) return;
      c.swept = true;
      this.poleSweepSpeed = this.speed;
    }
    this.poleSweepSpeed = Math.min(cfg.sweepMax, this.poleSweepSpeed + cfg.sweepAccel * dt);
    const flat = Math.cos(b.theta) >= 0 ? 0 : Math.PI;
    placePole(b, pole.totalLength / 2, b.cx - this.poleSweepSpeed * dt, this.roadY - 1, flat, -this.poleSweepSpeed, 0);
    if (b.cx <= this.data.platform.to * TILE) {
      c.swept = false;
      const d = this.data.poleDrop;
      placePole(b, pole.totalLength / 2, d.col * TILE, this.roadY - d.h * TILE - 1, flat);
    }
  }

  /**
   * The vaulter against the movers. Coming down onto a canopy: off the
   * traffic, level done. Onto a bridge's top: the road takes you back.
   * Otherwise they shove you out of their front or underside.
   */
  resolveMovers(p: Player, prevFeetY: number, events: GameEvent[]): 'canopy' | null {
    if (p.vault || this.swept) return null;
    const box = playerBox(p);
    const m = this.level.overlapsMover(box);
    if (!m) return null;
    if (prevFeetY <= m.y + 0.5 && p.vy >= 0) {
      p.y = m.y;
      p.vy = 0;
      if (m.kind === 'canopy') return 'canopy';
      this.swept = true;
      this.sweepSpeed = this.speed;
      events.push({ type: 'swept' });
      return null;
    }
    shove(p, box, m, this.speed);
    events.push({ type: 'shoved', kind: m.kind });
    return null;
  }

  /** The skip cheat's last obstacle: wind the road on until a canopy is right under you, and you're on it. */
  skipToCanopy(p: Player, time: number): void {
    const c = this.data.canopy;
    const ms = moversAt(this.data, this.roadY, this.offset, p.x, p.x + this.data.block * 2).filter((m) => m.kind === 'canopy');
    const next = ms.reduce((a, b) => (b.x < a.x ? b : a));
    this.shift += next.x + c.w / 2 - p.x;
    this.update(time);
    p.y = this.roadY - c.top;
    p.vx = 0;
    p.vy = 0;
  }
}

/** Pushed out of a mover's front (backwards with the road) or underside (head bumped). */
function shove(p: Player, box: Rect, m: Mover, roadSpeed: number): void {
  const front = box.x + box.w - m.x;
  const under = m.y + m.h - box.y;
  if (under < front) {
    p.y = m.y + m.h + body.height;
    p.vy = Math.max(0, p.vy);
  } else {
    p.x = m.x - box.w / 2 - 0.01;
    p.vx = Math.min(p.vx, -roadSpeed);
  }
}
