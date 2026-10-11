import { it } from 'vitest';
import { SIM_DT } from '../../src/data/tuning';
import { handMid } from '../../src/gameplay/carry';
import type { Action } from '../../src/gameplay/input';
import { frameFor, makeWorld } from '../helpers/sim';

// The browser run: rest, poise right, slide left, then Up, then Right. Does the player get flung? npm run probe
it('slide then arc back over the top: player trace', () => {
  const w = makeWorld();
  let prev = new Set<Action>();
  const script: [Action[], number][] = [[[], 0.3], [['aimRight'], 1.0], [['aimLeft'], 1.7], [['aimUp'], 0.2], [['aimRight'], 1.2]];
  const rows: string[] = [];
  let t = 0;
  for (const [held, dur] of script) {
    for (let i = 0; i < dur / SIM_DT; i++) {
      const now = new Set<Action>(held);
      w.step(frameFor(now, prev), SIM_DT);
      prev = now;
      t += SIM_DT;
      const p = w.player;
      const c = p.carry;
      if (i % 12 === 0 || p.y < 220)
        rows.push(
          `t=${t.toFixed(2)} ${held.join('+') || '-'} y=${p.y.toFixed(1)} vy=${p.vy.toFixed(0)} grounded=${p.grounded} lead=${c.lead} aim=${((p.aim * 180) / Math.PI).toFixed(0)} mid=${handMid(c).toFixed(1)} F=${c.hold.fx.toFixed(0)},${c.hold.fy.toFixed(0)} strain=${c.hold.strain.toFixed(2)} stretch=${c.hold.stretch.toFixed(1)}`,
        );
      if (rows.length > 60) break;
    }
  }
  console.log(rows.join('\n'));
});
