import { describe, expect, it } from 'vitest';
import { buildLongRun, longRunMarks as m } from '../src/data/levels';
import { SIM_DT, TILE } from '../src/data/tuning';
import type { Action } from '../src/gameplay/input';
import { Level, moveBox } from '../src/gameplay/level';
import { World } from '../src/gameplay/world';
import { frameFor } from './helpers/sim';

const data = buildLongRun();
const BASE = 28 * TILE;

type Step =
  /** Run (dir) with the lead end pointed `aim` (or neutral), until x passes `untilX`. */
  | { run: 1 | -1; aim: boolean; untilX: number }
  /** Running as before, press Down at x and hold it `hold` s after the plant; then hold `after` until landing. */
  | { vault: 1 | -1; atX: number; hold: number; after: 'left' | 'right' | 'none'; landHeight?: number };

/**
 * A scripted run through the whole course, in the order a player does it.
 * If tuning changes break this, the level needs re-checking (see the probes).
 */
const script: Step[] = [
  { vault: 1, atX: (m.barCol + 1) * TILE - 120, hold: 0.5, after: 'right' }, // the competition bar
  { run: 1, aim: true, untilX: (m.hills - 4) * TILE }, // potholes (hops are automatic below)
  { run: 1, aim: false, untilX: (m.plateau - 26) * TILE }, // hills, pole carried up out of the slopes
  { vault: 1, atX: m.plateau * TILE - 120, hold: 0.5, after: 'right' }, // up onto the plateau
  { vault: 1, atX: m.plateauWall * TILE - 130, hold: 0.5, after: 'right' },
  // The switchback: backwards onto the ledge, then backwards again onto the upper tier.
  { vault: 1, atX: m.cliff * TILE - 140, hold: 0.3, after: 'left', landHeight: m.ledgeHeight },
  { vault: -1, atX: m.tierFrom * TILE, hold: 0.25, after: 'right', landHeight: m.cliffHeight },
  // Down the long slope: the big wall wants the downhill speed and an early release.
  { vault: 1, atX: m.bigWall * TILE - 130, hold: 0.36, after: 'right' },
  { vault: 1, atX: m.lastWall * TILE - 120, hold: 0.5, after: 'right' },
  { run: 1, aim: true, untilX: (m.lastWall + 8) * TILE },
];

function playScript(): { world: World; log: string[] } {
  const world = new World(data);
  const pits = m.potholes;
  const log: string[] = [];
  let prev = new Set<Action>();
  let t = 0;
  for (const step of script) {
    const dir = 'run' in step ? step.run : step.vault;
    let plantT = -1;
    let launched = -1;
    while (t < 120) {
      const p = world.player;
      const now = new Set<Action>();
      if ('run' in step) {
        if (p.x * dir >= step.untilX * dir) break;
        now.add(dir > 0 ? 'right' : 'left');
        if (step.aim) now.add(dir > 0 ? 'aimRight' : 'aimLeft');
      } else if (launched < 0) {
        now.add(dir > 0 ? 'right' : 'left');
        now.add(dir > 0 ? 'aimRight' : 'aimLeft');
        if (p.x * dir >= step.atX * dir && (plantT < 0 || t - plantT < step.hold)) now.add('aimDown');
      } else {
        if (step.after !== 'none') now.add(step.after);
        if (p.grounded && t - launched > 0.1) break;
      }
      // Hop potholes at a sprint, holding the key for a full hop.
      if (dir > 0 && p.grounded && pits.some((c) => c * TILE - p.x > 0 && c * TILE - p.x < 40)) now.add('hop');
      if (prev.has('hop') && !p.grounded && p.vy < 0) now.add('hop');
      world.step(frameFor(now, prev), SIM_DT);
      prev = now;
      t += SIM_DT;
      for (const e of world.events) {
        if (e.type === 'plant') plantT = t;
        if (e.type === 'launch' || e.type === 'fellBack' || e.type === 'bonk' || e.type === 'stab') launched = t;
        if (e.type !== 'step' && e.type !== 'poleHit') log.push(`${e.type}@${Math.round(world.player.x / TILE)} v${Math.round(world.player.vx)}`);
      }
    }
    if ('vault' in step && step.landHeight !== undefined) {
      expect(Math.round((BASE - world.player.y) / TILE), `landed at height after vault at ${step.atX / TILE}: ${log.slice(-6).join(' ')}`).toBe(step.landHeight);
    }
    expect(world.player.carry.held, `still holding the pole after step ${JSON.stringify(step)}: ${log.slice(-6).join(' ')}`).toBe(true);
  }
  return { world, log };
}

describe('long course', () => {
  it('lays out start, finish and the switchback', () => {
    const level = new Level(data);
    expect(level.finishX).toBeGreaterThan(m.bigWall * TILE);
    expect(level.isSolidAt(m.ledgeFrom * TILE + 8, BASE - m.ledgeHeight * TILE + 4)).toBe(true);
    expect(level.isSolidAt(m.tierFrom * TILE + 8, BASE - m.cliffHeight * TILE + 4)).toBe(true);
  });

  it('can be completed start to finish, including both backwards vaults', () => {
    const { world, log } = playScript();
    expect(world.cleared, log.join(' ')).toBe(true);
    expect(log.some((e) => e.startsWith('barCleared')), log.join(' ')).toBe(true);
    expect(log.some((e) => e.startsWith('barKnocked')), log.join(' ')).toBe(false);
  });

  it('a real run reaches every checkpoint, in order', () => {
    const { world } = playScript();
    expect(world.checkpoint).toBe(data.checkpoints!.length - 1);
  });

  it('the skip cheat puts you just past each obstacle in turn, standing, pole in hand', () => {
    const world = new World(data);
    const cps = data.checkpoints!;
    for (let i = 0; i < cps.length; i++) {
      expect(world.skipObstacle()).toBe(true);
      for (let t = 0; t < 0.5; t += SIM_DT) world.step(frameFor(new Set(), new Set()), SIM_DT);
      const p = world.player;
      expect(p.grounded, `checkpoint ${i}`).toBe(true);
      expect(Math.round((BASE - p.y) / TILE), `checkpoint ${i} height`).toBe(cps[i]!.h);
      expect(p.carry.held, `checkpoint ${i} pole`).toBe(true);
      expect(world.checkpoint, `checkpoint ${i} tracked`).toBe(i);
    }
    expect(world.skipObstacle()).toBe(false);
  });

  it('running under the bar knocks it down; a restart puts it back', () => {
    const world = new World(data);
    let prev = new Set<Action>();
    const knocked: string[] = [];
    for (let t = 0; t < 8 && world.player.x < (m.barCol + 4) * TILE; t += SIM_DT) {
      const now = new Set<Action>(['right', 'aimRight']);
      world.step(frameFor(now, prev), SIM_DT);
      prev = now;
      for (const e of world.events) if (e.type === 'barKnocked' || e.type === 'barCleared') knocked.push(e.type);
    }
    expect(knocked).toEqual(['barKnocked']);
    expect(world.bar).toBe('knocked');
    world.reset();
    expect(world.bar).toBe('up');
  });

  it('the cliff is too tall to vault from the ground', () => {
    // Best ground vault apex is well under the cliff (8 tiles).
    expect(m.cliffHeight * TILE).toBeGreaterThan(110);
  });
});

describe('slopes', () => {
  const hill = new Level({
    name: 'hill',
    rows: ['..........', '..........', '.../##\\...', '##########'],
  });

  it('a body runs up and over a slope without catching on the tiles', () => {
    const box = { x: 4, y: 3 * TILE - 26, w: 10, h: 26 };
    let grounded = true;
    let maxRise = 0;
    for (let i = 0; i < 50; i++) {
      const r = moveBox(hill, box, 2.5, 0.5, { grounded, stepUp: 10 });
      grounded = r.grounded;
      expect(r.hitX, `x=${box.x.toFixed(1)} feet=${(box.y + box.h).toFixed(1)}`).toBe(false);
      maxRise = Math.max(maxRise, 3 * TILE - (box.y + box.h));
    }
    expect(maxRise).toBeGreaterThan(TILE * 0.9);
    expect(box.x).toBeGreaterThan(7 * TILE);
  });

  it('points are solid only below the diagonal', () => {
    // '/' at column 3, row 2: solid below the line from bottom-left to top-right.
    expect(hill.isSolidAt(3 * TILE + 12, 2 * TILE + 2)).toBe(false);
    expect(hill.isSolidAt(3 * TILE + 12, 2 * TILE + 8)).toBe(true);
    expect(hill.slopePush(3 * TILE + 12, 2 * TILE + 8)!.ny).toBeLessThan(0);
  });
});
