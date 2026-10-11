import { PX_PER_METRE } from '../data/tuning';
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

    const finish = this.level.finishX;
    if (!this.cleared && finish >= 0 && p.x >= finish && p.grounded) {
      this.cleared = true;
      this.clearTime = this.time;
    }
  }
}
