import { it } from 'vitest';
import { SIM_DT } from '../../src/data/tuning';
import { deflectionAt } from '../../src/gameplay/beam';
import { handMid } from '../../src/gameplay/carry';
import type { Action } from '../../src/gameplay/input';
import { frameFor, makeWorld } from '../helpers/sim';
import { pole } from '../../src/data/tuning';

// Prints a timeline of the carry state for a scenario. npm run probe
const scenarios: Record<string, Action[]> = {
  'standing, pole poised': ['aimRight'],
  'running, pole poised': ['right', 'aimRight'],
};

for (const [name, held] of Object.entries(scenarios)) it(`carry timeline: ${name}`, () => {
  const w = makeWorld();
  let prev = new Set<Action>();
  const rows: string[] = [name, 't     mid   lean   bob   aim    aimVel  tip'];
  for (let i = 0; i < 4 / SIM_DT; i++) {
    const now = new Set<Action>(held);
    w.step(frameFor(now, prev), SIM_DT);
    prev = now;
    const c = w.player.carry;
    if (i % 24 === 0)
      rows.push(
        [i * SIM_DT, handMid(c), c.lean, c.bob, w.player.aim, c.aimVel, deflectionAt(c.beam.y, pole.totalLength)]
          .map((v) => v.toFixed(3).padStart(7))
          .join(''),
      );
  }
  console.log(rows.join('\n'));
});
