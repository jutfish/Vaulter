import { it } from 'vitest';
import type { FlatLevelSpec } from '../../src/data/levels';
import { pole } from '../../src/data/tuning';
import { attemptVault } from '../helpers/sim';

// Exploratory sweep, not an assertion. Run with:
//   npm run probe
// Optional: DRIVES=1.5,3 to compare drive values.
//
// Open field (no wall). Down is pressed at x=600 after a full-speed run-up.
// Each cell: the tallest wall (px) that would be cleared if its 32px-wide
// face started D px past where Down was pressed, then launch quality.
const openField: FlatLevelSpec = {
  name: 'probe',
  length: 120,
  rows: 17,
  groundRow: 14,
  startCol: 4,
  walls: [],
  finishCol: 119,
};

it('probe', () => {
  const plantAt = 1000;
  const holds = [0.1, 0.2, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8];
  const dists = [80, 100, 120, 140, 160, 180];
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
  const drives = (env.DRIVES ?? String(pole.drive)).split(',').map(Number);
  const rows: string[] = [];
  for (const drive of drives) {
    pole.drive = drive;
    rows.push(`drive ${drive}  wall at D px:  ` + dists.map((d) => `D${d}`.padStart(5)).join('') + '   quality  events');
    for (const hold of holds) {
      const cells: string[] = [];
      let q = 0;
      let ev = '';
      for (const d of dists) {
        const r = attemptVault({ plantAtX: plantAt, holdAfterPlant: hold, wallFromX: plantAt + d, wallToX: plantAt + d + 32 }, openField);
        cells.push(r.wallClearance.toFixed(0).padStart(5));
        q = r.quality;
        ev = r.events.filter((e) => !['step', 'plantSwing', 'land'].includes(e)).join(',');
      }
      rows.push(`  hold ${hold.toFixed(2)}             ${cells.join('')}   ${q.toFixed(2)}     ${ev}`);
    }
  }
  console.log(rows.join('\n'));
});
