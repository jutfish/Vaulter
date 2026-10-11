import { describe, expect, it } from 'vitest';
import { beam as beamCfg, carry, pole, SIM_DT } from '../src/data/tuning';
import { createBeam, deflectionAt, stepBeam, twang, type BeamFrame } from '../src/gameplay/beam';
import { handMid, reachOf } from '../src/gameplay/carry';
import { createPoleBody, emptyHold, placePole, stepHeldPole } from '../src/gameplay/poleBody';
import type { Action } from '../src/gameplay/input';
import { attemptVault, frameFor, makeWorld, makeWorldAt } from './helpers/sim';

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
  const samples: { t: number; mid: number; lean: number; tip: number; visTip: number; moves: number }[] = [];
  for (let t = 0; t < seconds; t += SIM_DT) {
    const now = new Set<Action>(held(t));
    w.step(frameFor(now, prev), SIM_DT);
    prev = now;
    const c = w.player.carry;
    // What the eye sees at the lead end: the rigid pole's own rocking plus the bend on top.
    const reach = reachOf(c);
    const visTip = reach * Math.sin(w.player.aim) + tipOf(c.beam.y);
    samples.push({ t, mid: handMid(c), lean: c.lean, tip: tipOf(c.beam.y), visTip, moves: c.handMoves });
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
    expect(early.mid).toBeGreaterThanOrEqual(carry.gripCarry - carry.handGap);
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
    const run = range(running.map((s) => s.visTip));
    expect(run).toBeGreaterThan(2);
    expect(range(standing.map((s) => s.visTip))).toBeLessThan(run * 0.15);
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
    const poisedEarly = attemptVault({ plantAtX: WALL_X - 130, holdAfterPlant: 0.5 });
    // Poised ~0.2 s before planting: the pole is level in time, the hands are still climbing.
    const poisedLate = attemptVault({ plantAtX: WALL_X - 130, holdAfterPlant: 0.5, poiseAtX: WALL_X - 185 });
    expect(poisedLate.planted).toBe(true);
    expect(poisedEarly.plantLength).toBeCloseTo(pole.length, 0);
    expect(poisedLate.plantLength).toBeLessThan(pole.length - 1.5);
    expect(poisedLate.apex).toBeLessThan(poisedEarly.apex - 1);
  });
});

describe('the pole as its own object (v3)', () => {
  const leadDeg = (w: ReturnType<typeof makeWorld>) => (w.player.aim * 180) / Math.PI;

  it('Right straight to Left: the hands work along the whole pole and it stays level', () => {
    const w = makeWorldAt(600);
    let prev = new Set<Action>();
    let maxTilt = 0;
    for (let t = 0; t < 3; t += SIM_DT) {
      const now = new Set<Action>(t < 1 ? ['aimRight'] : ['aimLeft']);
      w.step(frameFor(now, prev), SIM_DT);
      prev = now;
      if (t > 0.8) maxTilt = Math.max(maxTilt, Math.abs(Math.sin(w.player.aim)));
    }
    const c = w.player.carry;
    expect(c.lead).toBe(0); // the other end now leads
    expect(reachOf(c)).toBeCloseTo(pole.length, 1);
    expect(Math.abs(Math.abs(leadDeg(w)) - 180)).toBeLessThan(3);
    expect(maxTilt).toBeLessThan(Math.sin((15 * Math.PI) / 180)); // never swung up or down
  });

  it('Right, Up, Left rolled: the pole arcs over the top, same end leading', () => {
    const w = makeWorldAt(600);
    let prev = new Set<Action>();
    let highest = 0;
    let lowest = 0;
    for (let t = 0; t < 3; t += SIM_DT) {
      const now = new Set<Action>(t < 1 ? ['aimRight'] : t < 1.15 ? ['aimUp'] : ['aimLeft']);
      w.step(frameFor(now, prev), SIM_DT);
      prev = now;
      if (t > 1) {
        highest = Math.min(highest, Math.sin(w.player.aim)); // -1 = straight up
        lowest = Math.max(lowest, Math.sin(w.player.aim));
      }
    }
    expect(w.player.carry.lead).toBe(1);
    expect(highest).toBeLessThan(-0.95); // went through vertical-up
    expect(lowest).toBeLessThan(0.5); // never swung through the bottom
    expect(Math.abs(Math.abs(leadDeg(w)) - 180)).toBeLessThan(5);
  });

  it('holding the pole level from one end takes real effort; upright it is easy', () => {
    const level = runWorld(2.5, () => ['aimRight']).w.player.carry.strain;
    const upright = runWorld(2.5, () => ['aimUp']).w.player.carry.strain;
    expect(level).toBeGreaterThan(0.3);
    expect(level).toBeLessThan(0.7);
    expect(upright).toBeLessThan(0.15);
  });

  it('a pole held from the end swings round slower than one held in the middle', () => {
    // Pole level, held still at (0,0); the arms swing it to 60° up. Time until it gets there.
    const riseTime = (sMid: number) => {
      const b = createPoleBody();
      placePole(b, sMid, 0, 0, 0);
      const out = emptyHold();
      for (let t = 0; t < 3; t += SIM_DT) {
        stepHeldPole(b, { x: 0, y: 0, vx: 0, vy: 0, sMid, theta: -Math.PI / 3, omega: 0, grip: 1 }, SIM_DT, out);
        if (b.theta < -Math.PI / 3 + 0.05) return t;
      }
      return 99;
    };
    const fromEnd = riseTime(carry.gripVault);
    const fromMiddle = riseTime(pole.totalLength / 2);
    expect(fromEnd).toBeLessThan(1);
    expect(fromEnd).toBeGreaterThan(fromMiddle * 1.5);
  });
});

describe('the pole against the level (v3)', () => {
  const ground = { isSolidAt: (_x: number, y: number) => y >= 0, isSolidTile: (_tx: number, ty: number) => ty >= 0 };

  /** Hands moving right at 300 px/s, 18 px above the ground, pole held 25° tip-down. Mean hand force. */
  const drag = (withGround: boolean) => {
    const b = createPoleBody();
    const sMid = carry.gripVault;
    const angle = (25 * Math.PI) / 180;
    placePole(b, sMid, 0, -18, angle, 300, 0);
    const out = emptyHold();
    let fx = 0;
    let contact = 0;
    let floor = 0;
    const n = 120;
    for (let i = 0; i < n; i++) {
      const x = 300 * i * SIM_DT;
      stepHeldPole(b, { x, y: -18, vx: 300, vy: 0, sMid, theta: angle, omega: 0, grip: 1, ...(withGround ? { solid: ground } : {}) }, SIM_DT, out);
      fx += out.fx;
      contact += out.contact;
      if (out.contact > 0 && out.contactFloor) floor++;
    }
    return { fx: fx / n, contact, floor, tipY: b.cy + Math.sin(b.theta) * (pole.totalLength / 2) };
  };

  it('a dipped tip scrapes along the ground and the hands have to haul it', () => {
    const free = drag(false);
    const scraping = drag(true);
    expect(free.tipY).toBeGreaterThan(5); // without ground the tip would be below the surface
    expect(scraping.contact).toBeGreaterThan(0);
    expect(scraping.floor).toBeGreaterThan(0);
    expect(scraping.tipY).toBeLessThan(2); // held at the surface (small bounce allowed)
    expect(scraping.fx).toBeGreaterThan(free.fx + 50); // pulling against friction
  });
});
