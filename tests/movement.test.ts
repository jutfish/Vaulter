import { describe, expect, it } from 'vitest';
import { hop, run, SIM_DT } from '../src/data/tuning';
import type { Action } from '../src/gameplay/input';
import { frameFor, makeWorld } from './helpers/sim';

function runFor(seconds: number, held: Action[], world = makeWorld()) {
  let prev = new Set<Action>();
  const now = new Set<Action>(held);
  for (let t = 0; t < seconds; t += SIM_DT) {
    world.step(frameFor(now, prev), SIM_DT);
    prev = now;
  }
  return world;
}

describe('running', () => {
  it('takes a couple of seconds of holding to reach top speed', () => {
    const w = makeWorld();
    let prev = new Set<Action>();
    const now = new Set<Action>(['right']);
    let t = 0;
    let t95 = -1;
    while (t < 5) {
      w.step(frameFor(now, prev), SIM_DT);
      prev = now;
      t += SIM_DT;
      if (t95 < 0 && w.player.vx >= run.maxSpeed * 0.95) t95 = t;
    }
    expect(t95).toBeGreaterThan(1.5);
    expect(t95).toBeLessThan(3);
    expect(w.player.vx).toBeCloseTo(run.maxSpeed, 5);
  });

  it('stops when no direction is held', () => {
    const w = runFor(1, ['right']);
    runFor(1, [], w);
    expect(w.player.vx).toBe(0);
  });

  it('cannot run through a wall', () => {
    const w = runFor(8, ['right']);
    expect(w.player.x).toBeLessThan(100 * 16);
    expect(w.player.vx).toBe(0);
  });
});

describe('hop', () => {
  it('is a small hop: well under the 3-tile wall', () => {
    const w = makeWorld();
    const groundY = w.player.y;
    let prev = new Set<Action>();
    let apex = 0;
    for (let t = 0; t < 1; t += SIM_DT) {
      const now = new Set<Action>(t < 0.5 ? ['hop'] : []);
      w.step(frameFor(now, prev), SIM_DT);
      prev = now;
      apex = Math.max(apex, groundY - w.player.y);
    }
    expect(apex).toBeGreaterThan(8);
    expect(apex).toBeLessThan(48);
    expect(apex).toBeCloseTo((hop.speed * hop.speed) / (2 * 700), -1);
  });

  it('a tapped hop is lower than a held one', () => {
    const height = (holdTicks: number) => {
      const w = makeWorld();
      const groundY = w.player.y;
      let prev = new Set<Action>();
      let apex = 0;
      for (let i = 0; i < 120; i++) {
        const now = new Set<Action>(i < holdTicks ? ['hop'] : []);
        w.step(frameFor(now, prev), SIM_DT);
        prev = now;
        apex = Math.max(apex, groundY - w.player.y);
      }
      return apex;
    };
    expect(height(2)).toBeLessThan(height(60));
  });

  it('running and hopping alone cannot get over the first wall', () => {
    const w = makeWorld();
    let prev = new Set<Action>();
    for (let t = 0; t < 8; t += SIM_DT) {
      const p = w.player;
      const now = new Set<Action>(['right']);
      if (p.x > 100 * 16 - 60) now.add('hop');
      w.step(frameFor(now, prev), SIM_DT);
      prev = now;
    }
    expect(w.player.x).toBeLessThan(100 * 16);
  });
});
