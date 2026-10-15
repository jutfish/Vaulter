import { buildTraffic, trafficMarks as m } from '../../src/data/levels';
import { run, SIM_DT, TILE } from '../../src/data/tuning';
import type { Action } from '../../src/gameplay/input';
import { moversAt } from '../../src/gameplay/traffic';
import { World } from '../../src/gameplay/world';
import { frameFor } from './sim';

export const ROAD_Y = m.roadRow * TILE;

/** Height of the feet above the road, in tiles. */
export function feetH(w: World): number {
  return (ROAD_Y - w.player.y) / TILE;
}

/** Drives a world with a held-keys function, logging events, until `stop` or the time runs out. */
export class Driver {
  readonly log: string[] = [];
  private prev = new Set<Action>();
  t = 0;

  constructor(readonly w: World = new World(buildTraffic())) {}

  run(secs: number, keys: (w: World, t: number) => Action[], stop?: (w: World, t: number) => boolean): boolean {
    const end = this.t + secs;
    while (this.t < end) {
      const now = new Set(keys(this.w, this.t));
      // A hop is held for a full hop while rising.
      if (this.prev.has('hop') && !this.w.player.grounded && this.w.player.vy < 0) now.add('hop');
      this.w.step(frameFor(now, this.prev), SIM_DT);
      this.prev = now;
      this.t += SIM_DT;
      for (const e of this.w.events) {
        if (e.type === 'step' || e.type === 'poleHit') continue;
        const extra = e.type === 'drop' ? `:${e.reason}` : e.type === 'shoved' ? `:${e.kind}` : '';
        this.log.push(`${e.type}${extra}@${(this.w.player.x / TILE).toFixed(1)},h${feetH(this.w).toFixed(1)}`);
      }
      if (stop?.(this.w, this.t)) return true;
    }
    return false;
  }

  /** Run right (holding `extra` too) and brake so as to stop with the feet at x. */
  stopAt(x: number, extra: Action[] = [], maxSecs = 4): void {
    this.run(
      maxSecs,
      (w) => {
        const p = w.player;
        const brake = (p.vx * p.vx) / (2 * run.groundFriction);
        return p.x + brake < x - 1 ? ['right', ...extra] : extra;
      },
      (w) => Math.abs(w.player.vx) < 1 && w.player.grounded && w.player.x > x - 12,
    );
  }

  /** Hold keys for a while (nothing else). */
  hold(keys: Action[], secs: number): void {
    this.run(secs, () => keys);
  }

  /**
   * Run right (pole poised level), press Down once x passes `atX`, keep it
   * held `hold` s after the plant, then hold right until landing.
   */
  vault(atX: number, hold: number, maxSecs = 4): void {
    let plantT = -1;
    let gone = -1;
    this.run(
      maxSecs,
      (w, t) => {
        // After the launch: no aim, so the pole comes up into the carry instead of swinging down into the roof.
        const k: Action[] = gone < 0 && !w.player.inVaultFlight ? ['right', 'aimRight'] : ['right'];
        if (gone < 0 && w.player.x >= atX && (plantT < 0 || t - plantT < hold)) k.push('aimDown');
        for (const e of w.events) {
          if (e.type === 'plant') plantT = t;
          if (e.type === 'launch' || e.type === 'fellBack' || e.type === 'bonk' || e.type === 'stab') gone = t;
        }
        return k;
      },
      (w, t) => gone > 0 && t - gone > 0.1 && w.player.grounded,
    );
  }
}

/** The world x of the next canopy (left edge) whose right end is at or after x. */
export function nextCanopy(w: World, x: number): number {
  const tr = w.traffic!;
  const xs = moversAt(tr.data, tr.roadY, tr.offset, x - 400, x + tr.data.block * 2)
    .filter((q) => q.kind === 'canopy' && q.x + q.w >= x)
    .map((q) => q.x);
  return Math.min(...xs);
}

export { m as marks };
