import { it } from 'vitest';
import { SIM_DT } from '../../src/data/tuning';
import { handMid } from '../../src/gameplay/carry';
import type { Action } from '../../src/gameplay/input';
import { frameFor, makeWorld } from '../helpers/sim';

// Where does the busy-run test blow up? npm run probe
it('busy run trace', () => {
  const pattern: Action[][] = [['right', 'aimRight'], ['right', 'aimUp'], ['right'], ['left', 'aimLeft'], ['hop', 'right', 'aimRight']];
  const w = makeWorld();
  let prev = new Set<Action>();
  const rows: string[] = [];
  let reported = 0;
  for (let i = 0; i < 12 / SIM_DT; i++) {
    const t = i * SIM_DT;
    const now = new Set<Action>(pattern[Math.floor(t / 0.37) % pattern.length]!);
    w.step(frameFor(now, prev), SIM_DT);
    prev = now;
    const c = w.player.carry;
    const maxY = Math.max(...Array.from(c.beam.y, Math.abs));
    if ((maxY > 60 || !Number.isFinite(maxY)) && reported < 8) {
      reported++;
      rows.push(
        `t=${t.toFixed(3)} mode=${w.player.poleMode} maxY=${maxY.toFixed(1)} mid=${handMid(c).toFixed(1)} lead=${c.lead} theta=${c.pole.theta.toFixed(2)} omega=${c.pole.omega.toFixed(1)} v=${c.pole.vx.toFixed(0)},${c.pole.vy.toFixed(0)} stretch=${c.hold.stretch.toFixed(1)} hands=${c.hands.map((h) => h.s.toFixed(1) + '/' + h.t.toFixed(2)).join(' ')}`,
      );
    }
  }
  console.log(rows.join('\n') || 'no blow-up');
});
