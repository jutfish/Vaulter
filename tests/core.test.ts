import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../src/app/loop';
import { InputState } from '../src/gameplay/input';
import { Level, moveBox } from '../src/gameplay/level';

describe('FixedStepLoop', () => {
  it('runs whole steps and carries the remainder as alpha', () => {
    const loop = new FixedStepLoop(1 / 120, 0.25);
    expect(loop.advance(1 / 60)).toBe(2);
    expect(loop.advance(1 / 240)).toBe(0);
    expect(loop.alpha).toBeCloseTo(0.5, 5);
  });

  it('clamps huge frames (tab suspension) instead of simulating them all', () => {
    const loop = new FixedStepLoop(1 / 120, 0.25);
    expect(loop.advance(30)).toBe(30); // 0.25 s at 120 Hz
  });

  it('ignores negative time', () => {
    const loop = new FixedStepLoop(1 / 120, 0.25);
    expect(loop.advance(-1)).toBe(0);
  });
});

describe('InputState', () => {
  it('keeps a tap that starts and ends inside one tick', () => {
    const s = new InputState();
    s.press('aimDown');
    s.release('aimDown');
    const f = s.consume();
    expect(f.pressed.aimDown).toBe(true);
    expect(f.released.aimDown).toBe(true);
    expect(f.down.aimDown).toBe(true);
    expect(s.consume().down.aimDown).toBe(false);
  });

  it('holds an action until every key bound to it is released', () => {
    const s = new InputState();
    s.press('hop'); // W
    s.press('hop'); // Space
    s.release('hop');
    expect(s.consume().down.hop).toBe(true);
    s.release('hop');
    expect(s.consume().down.hop).toBe(false);
  });

  it('releaseAll clears held keys (focus loss)', () => {
    const s = new InputState();
    s.press('right');
    s.consume();
    s.releaseAll();
    const f = s.consume();
    expect(f.down.right).toBe(false);
    expect(f.released.right).toBe(true);
  });
});

describe('collision', () => {
  const level = new Level({ name: 't', rows: ['......', '...#..', '######'] });

  it('lands on the ground and reports grounded', () => {
    const box = { x: 4, y: 10, w: 8, h: 10 };
    const r = moveBox(level, box, 0, 20);
    expect(r.grounded).toBe(true);
    expect(box.y + box.h).toBe(32);
  });

  it('stops flush against a wall', () => {
    const box = { x: 30, y: 18, w: 10, h: 10 };
    const r = moveBox(level, box, 12, 0);
    expect(r.hitX).toBe(true);
    expect(box.x + box.w).toBe(48);
  });

  it('treats the level sides as solid and the sky as open', () => {
    expect(level.isSolidTile(-1, 0)).toBe(true);
    expect(level.isSolidTile(0, -5)).toBe(false);
  });
});
