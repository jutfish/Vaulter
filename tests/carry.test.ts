import { describe, expect, it } from 'vitest';
import { beam as beamCfg, carry, pole, SIM_DT } from '../src/data/tuning';
import { createBeam, deflectionAt, stepBeam, twang, type BeamFrame } from '../src/gameplay/beam';
import { handMid, reachOf } from '../src/gameplay/carry';
import type { Action } from '../src/gameplay/input';
import { attemptVault, frameFor, makeWorld } from './helpers/sim';

const vaultHands = [
  { s: carry.gripVault - carry.handGap / 2, grip: 1 },
  { s: carry.gripVault + carry.handGap / 2, grip: 1 },
];
const still: BeamFrame = { anchorX: 0, anchorY: 0, sAnchor: carry.gripVault, aim: 0, hands: vaultHands };
const tipOf = (y: Float64Array) => deflectionAt(y, pole.totalLength);

describe('flexible pole (beam)', () => {
  it('droops a little under its own weight when held out level', () => {
    const b = createBeam();
    for (let i = 0; i < 600; i++) stepBeam(b, still, SIM_DT);
    const tip = tipOf(b.y);
    expect(tip).toBeGreaterThan(0.5); // +y along the normal = down for a pole pointing right
    expect(tip).toBeLessThan(6);
    expect(Math.abs(b.v[beamCfg.nodes - 1]!)).toBeLessThan(0.5);
  });

  it('rings near its tuned frequency and the wobble dies away', () => {
    const b = createBeam();
    for (let i = 0; i < 600; i++) stepBeam(b, still, SIM_DT);
    const rest = tipOf(b.y);
    twang(b, carry.gripVault, 200);
    let crossings = 0;
    let prev = tipOf(b.y) - rest;
    let firstPeak = 0;
    let lateAmp = 0;
    const seconds = 2;
    for (let i = 0; i < seconds / SIM_DT; i++) {
      stepBeam(b, still, SIM_DT);
      const d = tipOf(b.y) - rest;
      if (i * SIM_DT < 0.4) firstPeak = Math.max(firstPeak, Math.abs(d));
      if (i * SIM_DT > 1.6) lateAmp = Math.max(lateAmp, Math.abs(d));
      if (Math.sign(d) !== Math.sign(prev) && d !== 0) crossings++;
      prev = d;
    }
    const hz = crossings / 2 / seconds;
    expect(hz).toBeGreaterThan(beamCfg.tipFrequency * 0.65);
    expect(hz).toBeLessThan(beamCfg.tipFrequency * 1.5);
    expect(lateAmp).toBeLessThan(firstPeak * 0.35);
  });

  it('a bouncing hand sends a ripple out to the tip', () => {
    const b = createBeam();
    for (let i = 0; i < 600; i++) stepBeam(b, still, SIM_DT);
    const rest = tipOf(b.y);
    let maxDev = 0;
    for (let i = 0; i < 240; i++) {
      const bounce = -2.5 * Math.abs(Math.sin(Math.PI * ((i * SIM_DT * 360) / 22)));
      stepBeam(b, { ...still, anchorY: bounce }, SIM_DT);
      maxDev = Math.max(maxDev, Math.abs(tipOf(b.y) - rest));
    }
    expect(maxDev).toBeGreaterThan(1);
  });
});

function runWorld(seconds: number, held: (t: number) => Action[]) {
  const w = makeWorld();
  let prev = new Set<Action>();
  const samples: { t: number; mid: number; lean: number; tip: number; moves: number }[] = [];
  for (let t = 0; t < seconds; t += SIM_DT) {
    const now = new Set<Action>(held(t));
    w.step(frameFor(now, prev), SIM_DT);
    prev = now;
    const c = w.player.carry;
    samples.push({ t, mid: handMid(c), lean: c.lean, tip: tipOf(c.beam.y), moves: c.handMoves });
  }
  return { w, samples };
}

describe('carrying the pole', () => {
  it('starts in a relaxed mid-pole carry grip', () => {
    const { w } = runWorld(0.5, () => []);
    expect(handMid(w.player.carry)).toBeCloseTo(carry.gripCarry, 3);
  });

  it('poising the pole makes the hands climb back hand over hand, lengthening the vaulting pole', () => {
    const { w, samples } = runWorld(1.2, () => ['aimRight']);
    const c = w.player.carry;
    expect(handMid(c)).toBeCloseTo(carry.gripVault, 1);
    expect(reachOf(c)).toBeCloseTo(pole.length, 1);
    expect(c.handMoves).toBeGreaterThanOrEqual(2);
    // Not instant: after 0.1 s the hands have barely started.
    const early = samples.find((s) => s.t >= 0.1)!;
    expect(early.mid).toBeGreaterThan(carry.gripCarry - carry.handGap);
  });

  it('relaxing the pole moves the hands back to the carry grip', () => {
    const { w } = runWorld(2.5, (t) => (t < 1.2 ? ['aimRight'] : []));
    expect(handMid(w.player.carry)).toBeCloseTo(carry.gripCarry, 1);
  });

  it('holding the pole out leans the body forward gradually', () => {
    const { samples } = runWorld(2.5, () => ['aimRight']);
    const at = (t: number) => samples.find((s) => s.t >= t)!.lean;
    expect(at(2.4)).toBeGreaterThan(carry.leanFromPole * 0.6);
    expect(at(0.15)).toBeLessThan(at(2.4) * 0.4);
  });

  it('an upright carry leans much less than a pole held out level', () => {
    const level = runWorld(2.5, () => ['aimRight']).w.player.carry.lean;
    const upright = runWorld(2.5, () => ['aimUp']).w.player.carry.lean;
    expect(Math.abs(upright)).toBeLessThan(level * 0.3);
  });

  it('running at speed sets the pole wobbling; standing still it settles', () => {
    const running = runWorld(4, () => ['right', 'aimRight']).samples.filter((s) => s.t > 3);
    const standing = runWorld(4, () => ['aimRight']).samples.filter((s) => s.t > 3);
    const range = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    const run = range(running.map((s) => s.tip));
    expect(run).toBeGreaterThan(2);
    expect(range(standing.map((s) => s.tip))).toBeLessThan(run * 0.15);
  });

  it('stays numerically stable through a long, busy run', () => {
    const pattern: Action[][] = [['right', 'aimRight'], ['right', 'aimUp'], ['right'], ['left', 'aimLeft'], ['hop', 'right', 'aimRight']];
    const { w } = runWorld(12, (t) => pattern[Math.floor(t / 0.37) % pattern.length]!);
    for (const y of w.player.carry.beam.y) {
      expect(Number.isFinite(y)).toBe(true);
      expect(Math.abs(y)).toBeLessThan(30);
    }
  });
});

describe('grip affects the vault', () => {
  const WALL_X = 100 * 16;
  it('planting before the hands have climbed back gives a shorter pole and a lower vault', () => {
    const poisedEarly = attemptVault({ plantAtX: WALL_X - 110, holdAfterPlant: 0.5 });
    // Poised ~0.2 s before planting: the pole is level in time, the hands are still climbing.
    const poisedLate = attemptVault({ plantAtX: WALL_X - 110, holdAfterPlant: 0.5, poiseAtX: WALL_X - 185 });
    expect(poisedLate.planted).toBe(true);
    expect(poisedLate.apex).toBeLessThan(poisedEarly.apex - 8);
  });
});
