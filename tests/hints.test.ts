import { describe, expect, it } from 'vitest';
import { longRunWritings, lostPoleHint, winWriting } from '../src/data/hints';
import { buildLongRun, longRunMarks as m } from '../src/data/levels';
import { glyphCells } from '../src/data/pixelFont';
import { SIM_DT, TILE } from '../src/data/tuning';
import { dropPole, grabPole } from '../src/gameplay/carry';
import { hintBox, HintTracker, layoutHint, LOST_POLE_ID, type CarvedHint, type StuckHint } from '../src/gameplay/hints';
import { World } from '../src/gameplay/world';

const BASE = 28 * TILE;
const ALL: CarvedHint[] = [...longRunWritings, winWriting];

function world(): World {
  return new World(buildLongRun());
}

function stand(w: World, col: number, h: number): void {
  w.player.x = col * TILE + 8;
  w.player.y = BASE - h * TILE;
}

function tick(t: HintTracker, w: World, seconds: number) {
  const out = [];
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) out.push(...t.update(w.player, SIM_DT));
  return out;
}

function overlaps(a: ReturnType<typeof hintBox>, b: ReturnType<typeof hintBox>): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

describe('words in the land', () => {
  it('every writing uses letters the font has and sits wholly inside solid ground', () => {
    const w = world();
    for (const h of [...ALL, { id: 'lost', lines: lostPoleHint.lines, x: 0, y: 0 }]) {
      for (const line of h.lines) for (const ch of line) if (ch !== ' ') expect(glyphCells(ch).length, `'${ch}' in ${h.id}`).toBeGreaterThan(0);
    }
    for (const h of ALL) {
      const k = h.scale ?? 1;
      for (const c of layoutHint(h, w.level)) {
        if (c.ch === ' ') continue;
        for (const [gx, gy] of glyphCells(c.ch)) {
          expect(w.level.isSolidAt(c.x + gx * k + k / 2, c.y + gy * k + k / 2), `${h.id} '${c.ch}' at ${c.x},${c.y}`).toBe(true);
        }
      }
    }
  });

  it('no two writings overlap', () => {
    const w = world();
    const boxes = ALL.map((h) => ({ id: h.id, b: hintBox(h, w.level) }));
    for (const a of boxes) for (const b of boxes) if (a.id < b.id) expect(overlaps(a.b, b.b), `${a.id} / ${b.id}`).toBe(false);
  });

  it('the slope line runs diagonally down the long slope, just under the surface', () => {
    const w = world();
    const slip = longRunWritings.find((h) => h.id === 'slip')!;
    const chars = layoutHint(slip, w.level).filter((c) => c.x > (m.cliff + 10) * TILE && c.x < (m.cliff + 10 + m.cliffHeight) * TILE - 4);
    expect(chars.length).toBeGreaterThan(20);
    for (let i = 1; i < chars.length; i++) expect(chars[i]!.y - chars[i - 1]!.y).toBeCloseTo(4, 0); // 45 degrees: 4 across, 4 down
    for (const c of chars) {
      const top = w.level.groundBelow(c.x + 1.5, c.y - 40, 60)!;
      expect(c.y - top).toBeGreaterThanOrEqual(2);
      expect(c.y - top).toBeLessThanOrEqual(6);
    }
  });
});

describe('the lost-pole hint', () => {
  it('appears where you are a few seconds after losing the pole', () => {
    const w = world();
    const t = new HintTracker(w.level, [], lostPoleHint, ALL);
    stand(w, 60, 0);
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

  it('never lands on other writing: losing the pole right over the intro or "hop to it" puts it clear of them', () => {
    for (const id of ['intro', 'hopToIt']) {
      const w = world();
      const t = new HintTracker(w.level, [], lostPoleHint, ALL);
      const target = longRunWritings.find((h) => h.id === id)!;
      w.player.x = target.x;
      w.player.y = BASE;
      dropPole(w.player.carry);
      const [lost] = tick(t, w, lostPoleHint.after + 0.1);
      expect(lost, id).toBeDefined();
      for (const h of ALL) expect(overlaps(hintBox(lost!, w.level), hintBox(h, w.level)), `${id}: over ${h.id}`).toBe(false);
    }
  });

  it('carved again elsewhere, it never overlaps its own earlier spot or other writing', () => {
    const w = world();
    const t = new HintTracker(w.level, [], lostPoleHint, ALL);
    for (const c of [40, 70, 110, 200]) {
      stand(w, c, 0);
      dropPole(w.player.carry);
      tick(t, w, lostPoleHint.after + 0.1);
      grabPole(w.player.carry, w.player.x, w.player.y, 0, 0);
      tick(t, w, 0.1);
      const lost = t.carved.get(LOST_POLE_ID)!;
      for (const h of ALL) expect(overlaps(hintBox(lost, w.level), hintBox(h, w.level))).toBe(false);
    }
  });
});

describe('stuck-at-an-obstacle hints (mechanism; none used yet)', () => {
  const hint: StuckHint = {
    id: 'test',
    lines: ['TRY SOMETHING ELSE.'],
    x: 100 * TILE,
    y: BASE + 30,
    after: 60,
    zone: { x0: 90 * TILE, x1: 110 * TILE, y0: BASE - 8, y1: BASE + 8 },
    solved: { x0: 120 * TILE, x1: 130 * TILE, y0: -1e9, y1: 1e9 },
  };

  it('counts only time spent in the zone, across visits, and stops for good once solved', () => {
    const w = world();
    const t = new HintTracker(w.level, [hint], lostPoleHint);
    stand(w, 100, 0);
    tick(t, w, 30);
    stand(w, 50, 0);
    tick(t, w, 100);
    expect(t.stuckFor('test')).toBeCloseTo(30, 0);
    stand(w, 100, 0);
    expect(tick(t, w, 31).map((h) => h.id)).toContain('test');

    const t2 = new HintTracker(w.level, [hint], lostPoleHint);
    stand(w, 125, 0);
    tick(t2, w, 0.1);
    stand(w, 100, 0);
    tick(t2, w, 100);
    expect(t2.isSolved('test')).toBe(true);
    expect(t2.carved.has('test')).toBe(false);
  });
});
