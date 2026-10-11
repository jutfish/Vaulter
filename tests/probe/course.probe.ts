import { test } from 'vitest';
import { buildLongRun, longRunMarks as m } from '../../src/data/levels';
import { SIM_DT, TILE } from '../../src/data/tuning';
import { resetPoleToHands } from '../../src/gameplay/carry';
import type { Action } from '../../src/gameplay/input';
import { World } from '../../src/gameplay/world';
import { frameFor } from '../helpers/sim';

// Long-course probes: the timing windows of its vaults. Rows = how far before the
// obstacle Down is pressed (px), columns = how long it's held after the plant (s).
// Re-run after tuning changes and update docs/level-design.md.

const data = buildLongRun();
const BASE = 28 * TILE;

interface Attempt {
  /** Start column and ground height (tiles), speed (px/s) and direction. */
  col: number;
  h: number;
  vx: number;
  dir: 1 | -1;
  pressX: number;
  hold: number;
  /** Held after leaving the pole until landing. */
  after: Action | null;
}

/** Runs one vault; returns the landing column and height (tiles), and whether the pole is still held. */
function vault(a: Attempt): { col: number; h: number; held: boolean } {
  const w = new World(data);
  const p = w.player;
  p.x = a.col * TILE + 8;
  p.y = BASE - a.h * TILE;
  p.vx = a.vx * a.dir;
  p.facing = a.dir;
  p.carry.leadCmd = a.dir > 0 ? 0 : Math.PI; // arriving poised, pole level
  resetPoleToHands(p.carry, p.x, p.y);
  let prev = new Set<Action>();
  let t = 0;
  let plantT = -1;
  let launched = -1;
  while (t < 12) {
    const now = new Set<Action>();
    if (launched < 0) {
      now.add(a.dir > 0 ? 'right' : 'left');
      now.add(a.dir > 0 ? 'aimRight' : 'aimLeft');
      if (p.x * a.dir >= a.pressX * a.dir && (plantT < 0 || t - plantT < a.hold)) now.add('aimDown');
    } else if (a.after) now.add(a.after);
    w.step(frameFor(now, prev), SIM_DT);
    prev = now;
    t += SIM_DT;
    for (const e of w.events) {
      if (e.type === 'plant') plantT = t;
      if (e.type === 'launch' || e.type === 'fellBack' || e.type === 'bonk' || e.type === 'stab') launched = t;
    }
    if (launched >= 0 && p.grounded && t - launched > 0.1) break;
  }
  return { col: Math.floor(p.x / TILE), h: Math.round((BASE - p.y) / TILE), held: p.carry.held };
}

function table(title: string, ds: number[], holds: number[], cell: (d: number, hold: number) => string): void {
  const lines = [title, `   d  ${holds.map((h) => h.toFixed(2).padStart(6)).join('')}`];
  for (const d of ds) lines.push(`${String(d).padStart(4)}  ${holds.map((h) => cell(d, h).padStart(6)).join('')}`);
  console.log(lines.join('\n'));
}

const HOLDS = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6];
const DS = [80, 100, 120, 140, 160, 180];

test('long course vault windows', () => {
  // Landed at height h at or past column pastCol (on top of a wall counts: you walk off it).
  const ok = (r: { col: number; h: number; held: boolean }, h: number, pastCol: number) => ((r.h === h || (pastCol > 0 && r.col < pastCol + 2)) && r.col >= pastCol ? (r.held ? 'OK' : 'drop') : '.');

  table(`Backwards onto the ledge (running right at full speed; d = before the cliff face; Left after release)`, [100, 120, 140, 160, 180, 200], HOLDS, (d, hold) =>
    ok(vault({ col: m.ledgeFrom - 10, h: 0, vx: 360, dir: 1, pressX: m.cliff * TILE - d, hold, after: 'left' }), m.ledgeHeight, 0),
  );
  table(`Backwards onto the tier (running left along the ledge; d = past the tier's left end; Right after release)`, [-40, -20, 0, 20, 40, 60, 80], HOLDS, (d, hold) =>
    ok(vault({ col: m.ledgeTo - 4, h: m.ledgeHeight, vx: 200, dir: -1, pressX: m.tierFrom * TILE - d, hold, after: 'right' }), m.cliffHeight, 0),
  );
  table(`Plateau wall (48 px), from the plateau's foot at 200 px/s`, DS, HOLDS, (d, hold) =>
    ok(vault({ col: m.plateauWall - 28, h: 0, vx: 200, dir: 1, pressX: m.plateauWall * TILE - d, hold, after: 'right' }), 0, m.plateauWall),
  );
  table(`Big wall (80 px), running down the long slope from the cliff top`, DS, HOLDS, (d, hold) =>
    ok(vault({ col: m.cliff + 2, h: m.cliffHeight, vx: 300, dir: 1, pressX: m.bigWall * TILE - d, hold, after: 'right' }), 0, m.bigWall),
  );
  table(`Last wall (64 px), from after the last pothole at full speed`, DS, HOLDS, (d, hold) =>
    ok(vault({ col: m.potholes[m.potholes.length - 1]! + 6, h: 0, vx: 360, dir: 1, pressX: m.lastWall * TILE - d, hold, after: 'right' }), 0, m.lastWall),
  );
}, 120000);
