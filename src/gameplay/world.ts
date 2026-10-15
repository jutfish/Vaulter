import { body, poleTiers, PX_PER_METRE, TILE } from '../data/tuning';
import { resetPoleToHands } from './carry';
import type { ActionFrame } from './input';
import { Level, type LevelData } from './level';
import { createPlayer, playerBox, stepPlayer, vaultBox, type GameEvent, type Player } from './player';

/** The competition bar: up until the vaulter goes over it clean or knocks it off. */
export type BarState = 'up' | 'cleared' | 'knocked';

export interface VaultStats {
  /** Peak height of the feet above the ground they took off from, in metres. */
  height: number;
  quality: number;
}

/** The whole simulation for one level. Pure: no rendering, audio or DOM. */
export class World {
  readonly level: Level;
  player: Player;
  time = 0;
  cleared = false;
  clearTime = 0;
  lastVault: VaultStats | null = null;
  /** Events produced by the most recent step. */
  events: GameEvent[] = [];
  /** Which pole the vaulter has (index into poleTiers): gold, then silver, bronze, black... */
  poleTier = 0;
  /** Seconds left on the count while the pole is lost; null while it's in hand. */
  poleCountdown: number | null = null;
  bar: BarState = 'up';
  /** Furthest checkpoint reached (index into level.data.checkpoints; -1 = none yet). */
  checkpoint = -1;
  private groundY: number;

  constructor(data: LevelData) {
    this.level = new Level(data);
    this.player = createPlayer(this.level.startX, this.level.startY);
    this.groundY = this.level.startY;
  }

  reset(): void {
    this.player = createPlayer(this.level.startX, this.level.startY);
    this.time = 0;
    this.cleared = false;
    this.clearTime = 0;
    this.lastVault = null;
    this.events = [];
    this.poleTier = 0;
    this.poleCountdown = null;
    this.bar = 'up';
    this.checkpoint = -1;
  }

  step(input: ActionFrame, dt: number): void {
    this.events = [];
    const p = this.player;
    const wasFlying = p.inVaultFlight;
    const prevX = p.x;
    stepPlayer(p, this.level, input, dt, this.events);
    this.time += dt;

    for (const e of this.events) {
      if (e.type === 'plant') this.groundY = e.y;
      if (e.type === 'launch') this.lastVault = { height: 0, quality: e.quality };
    }
    if (p.inVaultFlight && this.lastVault) {
      this.lastVault.height = Math.max(this.lastVault.height, (this.groundY - p.vaultApexY) / PX_PER_METRE);
    }
    if (wasFlying && !p.inVaultFlight) this.groundY = p.y;
    this.countPoleLoss(dt);
    this.checkBar(prevX);
    this.trackCheckpoint();

    const finish = this.level.finishX;
    if (!this.cleared && finish >= 0 && p.x >= finish && p.grounded) {
      this.cleared = true;
      this.clearTime = this.time;
    }
  }

  /**
   * The bar falls if the body touches it, or if the vaulter passes it with
   * their feet below it (ran under it or through the uprights). Over it with
   * the feet above: cleared.
   */
  private checkBar(prevX: number): void {
    const bar = this.level.data.bar;
    if (!bar || this.bar !== 'up') return;
    const p = this.player;
    const box = p.vault ? vaultBox(p.x, p.y - body.gripHeight) : playerBox(p);
    const touching = box.x <= bar.x && box.x + box.w >= bar.x && box.y <= bar.y + 1 && box.y + box.h >= bar.y;
    const crossed = (prevX < bar.x) !== (p.x < bar.x);
    if (touching || (crossed && p.y > bar.y)) {
      this.bar = 'knocked';
      this.events.push({ type: 'barKnocked', x: bar.x, y: bar.y });
    } else if (crossed) {
      this.bar = 'cleared';
      this.events.push({ type: 'barCleared' });
    }
  }

  /** On the ground just past an obstacle: that obstacle's done. */
  private trackCheckpoint(): void {
    const cps = this.level.data.checkpoints;
    const p = this.player;
    if (!cps || !p.grounded) return;
    const col = Math.floor(p.x / TILE);
    const h = Math.round((this.level.startY - p.y) / TILE);
    for (let i = cps.length - 1; i > this.checkpoint; i--) {
      const c = cps[i]!;
      if (h === c.h && col >= c.from && col < c.to) {
        this.checkpoint = i;
        return;
      }
    }
  }

  /**
   * The skip cheat: puts the vaulter just past the obstacle they're at (the
   * next checkpoint), standing, pole in hand. False if there's none left.
   */
  skipObstacle(): boolean {
    const c = this.level.data.checkpoints?.[this.checkpoint + 1];
    if (!c) return false;
    this.checkpoint++;
    const p = this.player;
    p.x = c.col * TILE + TILE / 2;
    p.y = this.level.groundBelow(p.x, this.level.startY - c.h * TILE - 8, 32) ?? this.level.startY - c.h * TILE;
    p.vx = 0;
    p.vy = 0;
    p.facing = c.facing;
    p.poleMode = 'carry';
    p.vault = null;
    p.inVaultFlight = false;
    p.carry.leadCmd = c.facing > 0 ? 0 : Math.PI;
    resetPoleToHands(p.carry, p.x, p.y);
    this.poleCountdown = null;
    return true;
  }

  /** Lost the pole? Count. Get it back in time and all's well; otherwise the next pole appears in hand. */
  private countPoleLoss(dt: number): void {
    const p = this.player;
    if (p.carry.held) {
      this.poleCountdown = null;
      return;
    }
    if (this.poleCountdown === null) {
      this.poleCountdown = poleTiers[this.poleTier]!.countdown;
      return;
    }
    this.poleCountdown -= dt;
    if (this.poleCountdown > 0) return;
    this.poleCountdown = null;
    this.poleTier = Math.min(this.poleTier + 1, poleTiers.length - 1);
    // The new pole replaces the old one: the same body, back in the hands.
    resetPoleToHands(p.carry, p.x, p.y);
    this.events.push({ type: 'newPole', tier: this.poleTier });
  }
}
