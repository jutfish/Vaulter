import { describe, expect, it } from 'vitest';
import { longRunHints, lostPoleHint } from '../src/data/hints';
import { longRunMarks as m } from '../src/data/levels';
import { SIM_DT, TILE } from '../src/data/tuning';
import { dropPole, grabPole } from '../src/gameplay/carry';
import { HintTracker, LOST_POLE_ID } from '../src/gameplay/hints';
import { makeWorld } from './helpers/sim';
import { buildLongRun } from '../src/data/levels';
import { World } from '../src/gameplay/world';
import { glyphCells } from '../src/rendering/pixelFont';

const BASE = 28 * TILE;

function stand(w: World, col: number, h: number): void {
  w.player.x = col * TILE + 8;
  w.player.y = BASE - h * TILE;
}

function tick(t: HintTracker, w: World, seconds: number) {
  const out = [];
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) out.push(...t.update(w.player, w.level, SIM_DT));
  return out;
}

describe('hints carved into the land', () => {
  it('the backwards-vault hint appears after 3 minutes stuck under the ledge, not before', () => {
    const w = new World(buildLongRun());
    const t = new HintTracker(longRunHints, lostPoleHint);
    stand(w, m.cliff - 8, 0);
    expect(tick(t, w, 179).map((h) => h.id)).not.toContain('ledge');
    expect(tick(t, w, 2).map((h) => h.id)).toContain('ledge');
    expect(t.carved.has('ledge2')).toBe(false);
    tick(t, w, 120);
    expect(t.carved.has('ledge2')).toBe(true);
  });

  it('time only counts while at the obstacle, and stops for good once it is solved', () => {
    const w = new World(buildLongRun());
    const t = new HintTracker(longRunHints, lostPoleHint);
    stand(w, m.cliff - 8, 0);
    tick(t, w, 100);
    stand(w, 30, 0); // wandered back to the start
    tick(t, w, 100);
    expect(t.stuckFor('ledge')).toBeCloseTo(100, 0);
    stand(w, m.ledgeTo - 3, m.ledgeHeight); // made it onto the ledge
    tick(t, w, 0.1);
    stand(w, m.cliff - 8, 0); // fell back down
    tick(t, w, 200);
    expect(t.isSolved('ledge')).toBe(true);
    expect(t.carved.has('ledge')).toBe(false);
  });

  it('losing the pole carves the lost-pole hint where you are after a few seconds', () => {
    const w = makeWorld();
    const t = new HintTracker([], lostPoleHint);
    dropPole(w.player.carry);
    expect(tick(t, w, lostPoleHint.after - 0.5)).toHaveLength(0);
    const shown = tick(t, w, 1);
    expect(shown.map((h) => h.id)).toEqual([LOST_POLE_ID]);
    expect(Math.abs(shown[0]!.x - w.player.x)).toBeLessThan(1);
    expect(shown[0]!.y).toBeGreaterThan(w.player.y);
    // Not carved again while you're nearby; picking it up resets the clock.
    expect(tick(t, w, 5)).toHaveLength(0);
    grabPole(w.player.carry, w.player.x, w.player.y, 0, 0);
    tick(t, w, 1);
    expect(t.carved.size).toBe(1);
  });

  it('every hint is written in characters the font has, inside solid ground', () => {
    const w = new World(buildLongRun());
    for (const h of [...longRunHints, { id: 'lost', lines: lostPoleHint.lines, x: 0, y: 0 }]) {
      for (const line of h.lines) for (const ch of line) if (ch !== ' ') expect(glyphCells(ch).length, `'${ch}' in ${h.id}`).toBeGreaterThan(0);
    }
    for (const h of longRunHints) {
      h.lines.forEach((line, i) => {
        const half = (line.length * 4) / 2;
        for (const x of [h.x - half, h.x, h.x + half]) for (const dy of [0, 4]) expect(w.level.isSolidAt(x, h.y + i * 7 + dy), `${h.id} line ${i} at x ${x}`).toBe(true);
      });
    }
  });
});

describe('hint layout', () => {
  it('the lost-pole hint is carved below a hint already there, not on top of it', () => {
    const w = new World(buildLongRun());
    const t = new HintTracker(longRunHints, lostPoleHint);
    stand(w, 38, 0);
    tick(t, w, 46); // stuck at the first wall: its hint is carved here
    const first = t.carved.get('firstVault')!;
    dropPole(w.player.carry);
    tick(t, w, lostPoleHint.after + 0.1);
    const lost = t.carved.get(LOST_POLE_ID)!;
    expect(lost.y).toBeGreaterThanOrEqual(first.y + first.lines.length * 7);
  });
});
