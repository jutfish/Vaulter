// Abstract game actions. Keyboard (and later gamepad) feed into an InputState;
// the simulation only ever sees ActionFrame snapshots, one per fixed tick.

export type Action =
  | 'left'
  | 'right'
  | 'hop'
  | 'aimUp'
  | 'aimDown'
  | 'aimLeft'
  | 'aimRight'
  /** Let go of the pole, or pick it up. */
  | 'grab';

export const ACTIONS: readonly Action[] = ['left', 'right', 'hop', 'aimUp', 'aimDown', 'aimLeft', 'aimRight', 'grab'];

export interface ActionFrame {
  down: Record<Action, boolean>;
  pressed: Record<Action, boolean>;
  released: Record<Action, boolean>;
}

function emptyRecord(): Record<Action, boolean> {
  return { left: false, right: false, hop: false, aimUp: false, aimDown: false, aimLeft: false, aimRight: false, grab: false };
}

export function emptyFrame(): ActionFrame {
  return { down: emptyRecord(), pressed: emptyRecord(), released: emptyRecord() };
}

/**
 * Collects press/release edges between ticks so a tap shorter than one tick
 * is never lost: a press and release inside the same tick still reports
 * pressed=true and released=true on that tick.
 */
export class InputState {
  private held = emptyRecord();
  private pendingPress = emptyRecord();
  private pendingRelease = emptyRecord();
  /** Number of sources holding each action (two keys can map to one action). */
  private holdCount = new Map<Action, number>();

  press(action: Action): void {
    const n = (this.holdCount.get(action) ?? 0) + 1;
    this.holdCount.set(action, n);
    if (n === 1) {
      this.held[action] = true;
      this.pendingPress[action] = true;
    }
  }

  release(action: Action): void {
    const n = Math.max(0, (this.holdCount.get(action) ?? 0) - 1);
    this.holdCount.set(action, n);
    if (n === 0 && this.held[action]) {
      this.held[action] = false;
      this.pendingRelease[action] = true;
    }
  }

  releaseAll(): void {
    for (const a of ACTIONS) {
      if (this.held[a]) this.pendingRelease[a] = true;
      this.held[a] = false;
      this.holdCount.set(a, 0);
    }
  }

  /** Snapshot for one simulation tick; clears the edge flags. */
  consume(): ActionFrame {
    const frame: ActionFrame = {
      down: { ...this.held },
      pressed: { ...this.pendingPress },
      released: { ...this.pendingRelease },
    };
    // A tap that started and ended within the tick still counts as held for that tick.
    for (const a of ACTIONS) if (frame.pressed[a]) frame.down[a] = true;
    this.pendingPress = emptyRecord();
    this.pendingRelease = emptyRecord();
    return frame;
  }
}
