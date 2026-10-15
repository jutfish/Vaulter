import { test } from 'vitest';
import { buildTraffic, trafficMarks as m } from '../../src/data/levels';
import { TILE } from '../../src/data/tuning';
import { resetPoleToHands } from '../../src/gameplay/carry';
import type { Action } from '../../src/gameplay/input';
import { World } from '../../src/gameplay/world';
import { Driver, feetH, nextCanopy } from '../helpers/traffic';

// Traffic probes (v0.9): the timing windows of the traffic's vaults. Re-run
// after tuning changes and update docs/level-design.md.

const data = buildTraffic();

/** The fare paid but the bus still at the stop, nothing on the road nearby: a still world at (col, h). */
function still(col: number, h: number, shift: number): Driver {
  const w = new World(data);
  w.skipObstacle();
  w.traffic!.paidAt = null;
  w.traffic!.shift = shift;
  w.traffic!.update(0);
  w.player.x = col * TILE + 8;
  w.player.y = m.roadRow * TILE - h * TILE;
  resetPoleToHands(w.player.carry, w.player.x, w.player.y);
  return new Driver(w);
}

test('bus to lorry: d before the lorry x hold', () => {
  const holds = [0.35, 0.4, 0.45, 0.5, 0.55];
  const lines = ['Bus to lorry (+32 px), running from the back of the first bus, hopping to the second (OK = on the lorry, pole in hand)'];
  lines.push('   d  ' + holds.map((h) => h.toFixed(2).padStart(6)).join(''));
  for (const d of [130, 150, 170, 190, 210]) {
    let row = String(d).padStart(4) + '  ';
    for (const hold of holds) {
      const dr = still(m.busDeck, 2, 450);
      dr.run(4, (w) => {
        const x = w.player.x;
        const k: Action[] = ['right', 'aimRight'];
        if (w.player.grounded && x > m.busFront * TILE - 20 && x < m.busFront * TILE) k.push('hop');
        return k;
      }, (w) => w.player.x > (m.bus2 + 4) * TILE && w.player.grounded);
      dr.vault(m.lorry * TILE - d, hold);
      const ok = Math.abs(feetH(dr.w) - 4) < 0.1 && dr.w.player.carry.held;
      row += (ok ? 'OK' : '.').padStart(6);
    }
    lines.push(row);
  }
  console.log(lines.join('\n'));
});

test('transporter to canopy: when to start the run', () => {
  const lines = ['Onto the canopy: start running from dolly B when the canopy front is L px past the transporter front (Down 120 px before it, held 0.5 s)'];
  const results: string[] = [];
  for (let lead = 380; lead <= 760; lead += 20) {
    const dr = new Driver(new World(data));
    const w = dr.w;
    for (let i = 0; i < 4; i++) w.skipObstacle();
    dr.hold([], 0.3);
    dr.run(30, () => ['aimRight'], (w) => {
      const c = nextCanopy(w, m.deckFront * TILE - 160) - m.deckFront * TILE;
      return c <= lead + 10 && c > lead - 10;
    });
    let plantT = -1;
    dr.run(5, (w, t) => {
      const k: Action[] = ['right', 'aimRight'];
      const x = w.player.x;
      if (w.player.grounded && x > (m.transporter - 2) * TILE - 14 && x < (m.transporter - 2) * TILE) k.push('hop');
      if (x > m.deckFront * TILE - 120 && (plantT < 0 || t - plantT < 0.5)) k.push('aimDown');
      if (w.events.some((e) => e.type === 'plant')) plantT = t;
      return k;
    }, (w) => w.cleared || w.traffic!.swept || (plantT > 0 && w.player.grounded && !w.player.inVaultFlight && w.player.poleMode === 'carry' && w.time > 0 && feetH(w) > 4.9 && dr.log.at(-1)?.startsWith('land') === true));
    const shoved = dr.log.some((e) => e.startsWith('shoved:canopy') || e.startsWith('bonk'));
    results.push(`${String(lead).padStart(4)}  ${w.cleared ? 'ON THE CANOPY' : shoved ? 'hit its edge' : 'missed'}`);
  }
  console.log([...lines, ...results].join('\n'));
});
