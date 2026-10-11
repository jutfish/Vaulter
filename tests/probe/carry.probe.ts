import { it } from 'vitest';
import { pole, SIM_DT } from '../../src/data/tuning';
import { deflectionAt } from '../../src/gameplay/beam';
import { handMid, reachOf } from '../../src/gameplay/carry';
import type { Action } from '../../src/gameplay/input';
import { frameFor, makeWorld } from '../helpers/sim';

// Prints a timeline of the carry state for each scenario. npm run probe
type Script = (t: number) => Action[];
const scenarios: Record<string, Script> = {
  'standing, pole poised right': () => ['aimRight'],
  'running, pole poised': () => ['right', 'aimRight'],
  'right then straight to left (slide)': (t) => (t < 1 ? ['aimRight'] : ['aimLeft']),
  'right, up, left rolled (arc)': (t) => (t < 1 ? ['aimRight'] : t < 1.15 ? ['aimUp'] : ['aimLeft']),
};

for (const [name, script] of Object.entries(scenarios))
  it(`carry timeline: ${name}`, () => {
    const w = makeWorld();
    let prev = new Set<Action>();
    const rows: string[] = [name, '    t    mid  reach  lead  leadDeg  lean  strain  tip'];
    for (let i = 0; i < 3 / SIM_DT; i++) {
      const now = new Set<Action>(script(i * SIM_DT));
      w.step(frameFor(now, prev), SIM_DT);
      prev = now;
      const c = w.player.carry;
      if (i % 18 === 0)
        rows.push(
          [i * SIM_DT, handMid(c), reachOf(c), c.lead, (w.player.aim * 180) / Math.PI, c.lean, c.strain, deflectionAt(c.beam.y, c.lead ? pole.totalLength : 0)]
            .map((v) => v.toFixed(2).padStart(7))
            .join(''),
        );
    }
    console.log(rows.join('\n'));
  });
