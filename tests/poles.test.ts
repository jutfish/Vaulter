import { describe, expect, it } from 'vitest';
import { poleTiers, SIM_DT } from '../src/data/tuning';
import { dropPole, grabPole } from '../src/gameplay/carry';
import { emptyFrame } from '../src/gameplay/input';
import { makeWorld } from './helpers/sim';
import type { World } from '../src/gameplay/world';

const name = (w: World) => poleTiers[w.poleTier]!.name;

/** Steps with no input for `seconds`; returns the events seen. */
function wait(w: World, seconds: number): string[] {
  const seen: string[] = [];
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    w.step(emptyFrame(), SIM_DT);
    seen.push(...w.events.map((e) => e.type));
  }
  return seen;
}

/** Loses the pole and lets the count run out. */
function loseIt(w: World): string[] {
  dropPole(w.player.carry);
  return wait(w, poleTiers[w.poleTier]!.countdown + 0.1);
}

describe('gold, silver, bronze, then black poles', () => {
  it('starts with gold; losing it starts a 9 s count, and getting it back in time keeps gold', () => {
    const w = makeWorld();
    expect(name(w)).toBe('gold');
    dropPole(w.player.carry);
    wait(w, 5);
    expect(w.poleCountdown).toBeGreaterThan(3.5);
    expect(w.poleCountdown).toBeLessThan(4.5);
    const p = w.player;
    expect(grabPole(p.carry, p.x, p.y, 0, 0)).toBe(true);
    wait(w, 0.1);
    expect(w.poleCountdown).toBeNull();
    wait(w, 10);
    expect(name(w)).toBe('gold');
  });

  it('not recovered: silver appears in hand at the end of the count, then bronze, then black forever', () => {
    const w = makeWorld();
    const seq: string[] = [];
    for (let i = 0; i < 5; i++) {
      const events = loseIt(w);
      expect(events).toContain('newPole');
      expect(w.player.carry.held).toBe(true);
      seq.push(name(w));
    }
    expect(seq).toEqual(['silver', 'bronze', 'black', 'black', 'black']);
  });

  it('the black-to-black count is 3 s, not 9', () => {
    const w = makeWorld();
    w.poleTier = poleTiers.length - 1;
    dropPole(w.player.carry);
    expect(wait(w, 2.9)).not.toContain('newPole');
    expect(wait(w, 0.2)).toContain('newPole');
  });

  it('the new pole is the only pole: it is in the hands, the lost one is gone', () => {
    const w = makeWorld();
    const p = w.player;
    dropPole(p.carry);
    p.carry.pole.vx = 400; // flung away
    wait(w, 9.1);
    expect(p.carry.held).toBe(true);
    const c = p.carry.pole;
    expect(Math.hypot(c.cx - p.x, c.cy - p.y)).toBeLessThan(60);
  });

  it('restarting gives you gold again', () => {
    const w = makeWorld();
    loseIt(w);
    expect(name(w)).toBe('silver');
    w.reset();
    expect(name(w)).toBe('gold');
    expect(w.poleCountdown).toBeNull();
  });
});
