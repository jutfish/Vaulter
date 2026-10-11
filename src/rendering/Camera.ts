import { camera as cfg, VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';

/**
 * Follows a target with exponential smoothing and speed-based look-ahead.
 * Updated on the fixed simulation tick (so it's frame-rate independent) and
 * interpolated for rendering. x/y are the world point at the screen centre.
 */
export class Camera {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  private lookAhead = 0;

  constructor(
    private boundsWidth: number,
    private boundsHeight: number,
  ) {}

  snapTo(tx: number, ty: number): void {
    this.lookAhead = 0;
    this.x = this.prevX = this.clampX(tx);
    this.y = this.prevY = this.clampY(ty - cfg.verticalOffset);
  }

  update(tx: number, ty: number, vx: number, dt: number): void {
    this.prevX = this.x;
    this.prevY = this.y;
    const targetAhead = Math.max(-cfg.lookAheadMax, Math.min(cfg.lookAheadMax, vx * cfg.lookAheadTime));
    this.lookAhead += (targetAhead - this.lookAhead) * (1 - Math.exp(-cfg.followRate * 0.5 * dt));
    const goalX = this.clampX(tx + this.lookAhead);
    const goalY = this.clampY(ty - cfg.verticalOffset);
    this.x += (goalX - this.x) * (1 - Math.exp(-cfg.followRate * dt));
    this.y += (goalY - this.y) * (1 - Math.exp(-cfg.verticalFollowRate * dt));
  }

  /** Interpolated top-left of the view, snapped to whole pixels. */
  viewOrigin(alpha: number): { x: number; y: number } {
    const cx = this.prevX + (this.x - this.prevX) * alpha;
    const cy = this.prevY + (this.y - this.prevY) * alpha;
    return { x: Math.round(cx - VIEW_WIDTH / 2), y: Math.round(cy - VIEW_HEIGHT / 2) };
  }

  private clampX(x: number): number {
    return Math.max(VIEW_WIDTH / 2, Math.min(this.boundsWidth - VIEW_WIDTH / 2, x));
  }

  private clampY(y: number): number {
    // Allow looking above the level (open sky) but never below its floor.
    return Math.min(this.boundsHeight - VIEW_HEIGHT / 2, y);
  }
}
