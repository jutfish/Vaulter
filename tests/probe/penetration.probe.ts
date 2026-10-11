import { test } from 'vitest';
import { beam as beamCfg, SIM_DT, TILE } from '../../src/data/tuning';
import { buildLongRun, longRunMarks as m } from '../../src/data/levels';
import { NODE_SPACING } from '../../src/gameplay/beam';
import { resetPoleToHands } from '../../src/gameplay/carry';
import type { Action } from '../../src/gameplay/input';
import type { Level } from '../../src/gameplay/level';
import { pointAt } from '../../src/gameplay/poleBody';
import { World } from '../../src/gameplay/world';
import { frameFor } from '../helpers/sim';

// How far the pole gets into the ground. Fuzzed play (random held inputs) from
// starts along the long course; reports the worst penetration of the pole body's
// line and of the drawn (flexible) pole, by what the vaulter was doing.

const data = buildLongRun();

/** Depth of a point inside the ground: shortest way out along axes and diagonals (px), 0 if outside. */
function depth(level: Level, x: number, y: number): number {
  if (!level.isSolidAt(x, y)) return 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];
  for (let d = 0.5; d <= 16; d += 0.5) for (const [ux, uy] of dirs) if (!level.isSolidAt(x + ux! * d, y + uy! * d)) return d;
  return 16;
}

/** Tiny deterministic RNG. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ACTIONS: Action[][] = [
  ['right'],
  ['right', 'aimRight'],
  ['right', 'aimUp'],
  ['left', 'aimLeft'],
  ['left'],
  ['right', 'aimRight', 'aimDown'],
  ['right', 'hop'],
  ['aimLeft'],
  ['aimUp', 'aimLeft'],
  [],
];

test('pole penetration under fuzzed play', () => {
  type Worst = { body: number; drawn: number; where: string };
  const worst: Record<string, Worst> = {};
  const hist: Record<string, number[]> = {};
  const starts = [70, 140, 150, 195, 245, m.ledgeFrom + 5, m.cliff - 10, m.cliff + 12, m.bigWall - 8, m.lastWall - 10];
  for (let seed = 1; seed <= 12; seed++) {
    for (const col of starts) {
      const w = new World(data);
      const p = w.player;
      p.x = col * TILE + 8;
      p.y = w.level.groundBelow(p.x, (28 - 9) * TILE, 400) ?? p.y;
      resetPoleToHands(p.carry, p.x, p.y);
      const r = rng(seed * 977 + col);
      let prev = new Set<Action>();
      let now = new Set<Action>();
      let left = 0;
      for (let i = 0; i < 6 / SIM_DT; i++) {
        if (left <= 0) {
          now = new Set(ACTIONS[Math.floor(r() * ACTIONS.length)]!);
          if (r() < 0.05) now.add('grab');
          left = 0.1 + r() * 0.8;
        }
        left -= SIM_DT;
        w.step(frameFor(now, prev), SIM_DT);
        prev = now;
        const c = p.carry;
        const mode = !c.held ? 'free' : p.poleMode;
        if (mode === 'planted') continue; // the planted pole is the chord; checked separately by eye
        let body = 0;
        let drawn = 0;
        const b = c.pole;
        const e0 = pointAt(b, 0);
        const dx = Math.cos(b.theta);
        const dy = Math.sin(b.theta);
        for (let s = 0; s <= 80; s += 1) body = Math.max(body, depth(w.level, e0.x + dx * s, e0.y + dy * s));
        for (let n = 0; n < beamCfg.nodes; n++) {
          const s = n * NODE_SPACING;
          const d = c.held ? c.beam.y[n]! : 0;
          drawn = Math.max(drawn, depth(w.level, e0.x + dx * s - dy * d, e0.y + dy * s + dx * d));
        }
        const k = mode;
        (hist[k] ??= []).push(body);
        const cur = (worst[k] ??= { body: 0, drawn: 0, where: '' });
        if (body > cur.body) cur.where = `seed ${seed} col ${col} t=${(i * SIM_DT).toFixed(2)} at ${(p.x / TILE).toFixed(1)}`;
        cur.body = Math.max(cur.body, body);
        cur.drawn = Math.max(cur.drawn, drawn);
      }
    }
  }
  const lines = ['mode    ticks  >1px%  >3px%  worst body  worst drawn  where'];
  for (const [k, v] of Object.entries(worst)) {
    const h = hist[k]!;
    const pct = (t: number) => ((100 * h.filter((d) => d > t).length) / h.length).toFixed(2).padStart(6);
    lines.push(`${k.padEnd(7)} ${String(h.length).padStart(6)} ${pct(1)} ${pct(3)}  ${v.body.toFixed(1).padStart(9)}  ${v.drawn.toFixed(1).padStart(10)}   ${v.where}`);
  }
  console.log(lines.join('\n'));
}, 300000);
