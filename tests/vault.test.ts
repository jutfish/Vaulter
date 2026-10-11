import { describe, expect, it } from 'vitest';
import { body, pole, run } from '../src/data/tuning';
import { bendEnergy, startVault, stepVault, totalEnergy } from '../src/gameplay/vault';
import { attemptVault } from './helpers/sim';

const WALL_X = 100 * 16; // firstWall: 3-tile (48 px) wall at column 100
// Press Down this far before the wall (the plant drop takes ~0.07 s, so the pole lands ~20 px later).
const PLANT_AT = WALL_X - 130;

describe('vault physics', () => {
  it('conserves energy while held (before any bleed)', () => {
    const v = startVault(76, 0, 0, -body.gripHeight, run.maxSpeed, 0);
    const e0 = totalEnergy(v);
    for (let i = 0; i < 30; i++) stepVault(v, true, 1 / 120);
    expect(v.bleeding).toBe(false);
    expect(bendEnergy(v)).toBeGreaterThan(0);
    // Latching discards only tiny bits of outward radial speed.
    expect(Math.abs(totalEnergy(v) - e0) / e0).toBeLessThan(0.02);
  });

  it('bends the pole more when planting at higher speed', () => {
    const peak = (speed: number) => {
      const v = startVault(76, 0, 0, -body.gripHeight, speed, 0);
      for (let i = 0; i < 20; i++) stepVault(v, true, 1 / 120);
      return v.peakBend;
    };
    expect(peak(run.maxSpeed)).toBeGreaterThan(peak(run.maxSpeed * 0.5) * 2);
  });

  it('bleeds energy away when Down is held far too long, without breaking anything', () => {
    const v = startVault(76, 0, 0, -body.gripHeight, run.maxSpeed, 0);
    let outcome = 'onPole';
    for (let i = 0; i < 400 && outcome === 'onPole'; i++) outcome = stepVault(v, true, 1 / 120);
    expect(v.bleeding).toBe(true);
    expect(Number.isFinite(v.phi) && Number.isFinite(v.r)).toBe(true);
    expect(totalEnergy(v)).toBeLessThan(v.plantEnergy);
  });

  it('falls back when planted with almost no speed', () => {
    const v = startVault(76, 0, 0, -body.gripHeight, 20, 0);
    let outcome = 'onPole';
    for (let i = 0; i < 600 && outcome === 'onPole'; i++) outcome = stepVault(v, true, 1 / 120);
    expect(outcome).toBe('fellBack');
  });
});

describe('the sweet spot (full run-up into the first wall)', () => {
  const tryHold = (hold: number) => attemptVault({ plantAtX: PLANT_AT, holdAfterPlant: hold });

  it('a well-timed release clears the wall', () => {
    const r = tryHold(0.5);
    expect(r.planted).toBe(true);
    expect(r.world.player.x).toBeGreaterThan(WALL_X + 32);
    expect(r.quality).toBeGreaterThan(0.6);
  });

  it('releasing too early does not clear the wall', () => {
    const r = tryHold(0.15);
    expect(r.world.player.x).toBeLessThan(WALL_X);
  });

  it('holding far too long does not clear the wall', () => {
    const r = tryHold(1.2);
    // May roll over onto the wall top, but never past its far side.
    expect(r.world.player.x).toBeLessThan(WALL_X + 32);
    expect(r.quality).toBeLessThan(0.3);
  });

  it('the best release beats early and late ones on quality', () => {
    const q = [0.15, 0.5, 1.0].map((h) => tryHold(h).quality);
    expect(q[1]).toBeGreaterThan(q[0]!);
    expect(q[1]).toBeGreaterThan(q[2]!);
  });

  it('planting right at the wall jams the pole instead of vaulting', () => {
    const r = attemptVault({ plantAtX: WALL_X - 40, holdAfterPlant: 0.5 });
    expect(r.events).toContain('stab');
    expect(r.planted).toBe(false);
  });

  it('is deterministic: same inputs, same result', () => {
    const a = tryHold(0.5);
    const b = tryHold(0.5);
    expect(a.world.player.x).toBe(b.world.player.x);
    expect(a.apex).toBe(b.apex);
  });

  it('keeps pole length and bend limits sane', () => {
    expect(pole.maxCompression).toBeLessThan(pole.length / 2);
  });
});
