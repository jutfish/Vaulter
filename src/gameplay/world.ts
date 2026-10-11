import { poleTiers, PX_PER_METRE } from '../data/tuning';
import { resetPoleToHands } from './carry';
import type { ActionFrame } from './input';
import { Level, type LevelData } from './level';
import { createPlayer, stepPlayer, type GameEvent, type Player } from './player';

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
  }

  step(input: ActionFrame, dt: number): void {
    this.events = [];
    const p = this.player;
    const wasFlying = p.inVaultFlight;
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

    const finish = this.level.finishX;
    if (!this.cleared && finish >= 0 && p.x >= finish && p.grounded) {
      this.cleared = true;
      this.clearTime = this.time;
    }
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
