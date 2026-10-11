/**
 * Fixed-timestep accumulator. Feed it real elapsed time each animation
 * frame; it says how many simulation steps to run and the interpolation
 * alpha for rendering between the last two simulation states.
 *
 * Real time per frame is clamped (maxFrameTime) so a suspended tab or a
 * debugger pause never produces a huge burst of catch-up steps.
 */
export class FixedStepLoop {
  private accumulator = 0;

  constructor(
    readonly step: number,
    readonly maxFrameTime: number,
  ) {}

  /** Returns the number of fixed steps to simulate for this frame. */
  advance(realDt: number): number {
    const dt = Math.min(Math.max(0, realDt), this.maxFrameTime);
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= this.step) {
      this.accumulator -= this.step;
      steps++;
    }
    return steps;
  }

  /** 0..1: how far real time is between the previous and current sim state. */
  get alpha(): number {
    return this.accumulator / this.step;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
