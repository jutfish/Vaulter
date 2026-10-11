import { it } from 'vitest';
import { carry, SIM_DT, pole } from '../../src/data/tuning';
import { deflectionAt } from '../../src/gameplay/beam';
import type { Action } from '../../src/gameplay/input';
import { frameFor, makeWorld } from '../helpers/sim';

// Which part of "poise the pole" causes the tip whip? npm run probe
it('whip sources', () => {
  const base = { gripCarry: carry.gripCarry };
  const rows: string[] = [];
  for (const [name, setup] of [
    ['everything', () => {}],
    ['no hand moves', () => (carry.gripCarry = carry.gripVault)],
  ] as const) {
    setup();
    const w = makeWorld();
    let prev = new Set<Action>();
    let peak = 0;
    for (let i = 0; i < 0.8 / SIM_DT; i++) {
      const now = new Set<Action>(['aimRight']);
      w.step(frameFor(now, prev), SIM_DT);
      prev = now;
      peak = Math.max(peak, Math.abs(deflectionAt(w.player.carry.beam.y, pole.totalLength) - 3.9));
    }
    rows.push(`${name.padEnd(16)} peak tip deviation ${peak.toFixed(1)} px`);
    carry.gripCarry = base.gripCarry;
  }
  console.log(rows.join('\n'));
});
