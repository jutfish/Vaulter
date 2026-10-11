import { buildFlatLevel, firstWall, type FlatLevelSpec } from '../../src/data/levels';
import { SIM_DT } from '../../src/data/tuning';
import { emptyFrame, type Action, type ActionFrame } from '../../src/gameplay/input';
import { resetPoleToHands } from '../../src/gameplay/carry';
import { World } from '../../src/gameplay/world';

/** Builds an ActionFrame from the set of actions held this tick and last tick. */
export function frameFor(now: Set<Action>, before: Set<Action>): ActionFrame {
  const f = emptyFrame();
  for (const a of now) {
    f.down[a] = true;
    if (!before.has(a)) f.pressed[a] = true;
  }
  for (const a of before) if (!now.has(a)) f.released[a] = true;
  return f;
}

export interface VaultAttempt {
  /** Press Down when the player's x reaches this. */
  plantAtX: number;
  /** Seconds to keep Down held after the pole is planted. */
  holdAfterPlant: number;
  /** Hold the aimRight key from the start (pole poised forward). */
  runSeconds?: number;
  /** Only start holding aimRight (pole poised forward) from this x; default: from the start. */
  poiseAtX?: number;
  /** Optional span to measure clearance over (e.g. the wall). */
  wallFromX?: number;
  wallToX?: number;
}

export interface AttemptResult {
  world: World;
  planted: boolean;
  released: boolean;
  quality: number;
  /** Highest feet height above ground during the attempt (px). */
  apex: number;
  /** Hands-to-tip pole length the vault used (0 if no plant). */
  plantLength: number;
  /** Lowest feet height (px above ground) while passing over [wallFromX, wallToX]. */
  wallClearance: number;
  cleared: boolean;
  events: string[];
}

export function makeWorld(spec: FlatLevelSpec = firstWall): World {
  return new World(buildFlatLevel(spec));
}

/** A world with the player moved to x (open ground), pole back in the hands. */
export function makeWorldAt(x: number, spec: FlatLevelSpec = firstWall): World {
  const w = makeWorld(spec);
  w.player.x = x;
  resetPoleToHands(w.player.carry, w.player.x, w.player.y);
  return w;
}

/** Scripted run-up: hold Right + aimRight, Down at plantAtX, release after holdAfterPlant. */
export function attemptVault(a: VaultAttempt, spec: FlatLevelSpec = firstWall, maxTime = 12): AttemptResult {
  const world = makeWorld(spec);
  const groundY = world.level.startY;
  let prev = new Set<Action>();
  let plantedAt = -1;
  let downPressed = false;
  let released = false;
  let quality = 0;
  let apex = 0;
  let wallClearance = Infinity;
  let plantLength = 0;
  const events: string[] = [];
  let t = 0;
  let afterRelease = 0;
  while (t < maxTime) {
    const p = world.player;
    const now = new Set<Action>(['right']);
    if (a.poiseAtX === undefined || p.x >= a.poiseAtX) now.add('aimRight');
    if (!downPressed && p.x >= a.plantAtX) downPressed = true;
    if (downPressed && !released) {
      if (plantedAt < 0 || t - plantedAt < a.holdAfterPlant) now.add('aimDown');
    }
    world.step(frameFor(now, prev), SIM_DT);
    prev = now;
    t += SIM_DT;
    for (const e of world.events) {
      events.push(e.type);
      if (e.type === 'plant') {
        plantedAt = t;
        plantLength = world.player.vault?.length ?? 0;
      }
      if (e.type === 'release') released = true;
      if (e.type === 'launch') {
        released = true;
        quality = e.quality;
      }
      if (e.type === 'fellBack' || e.type === 'bonk' || e.type === 'stab') released = true;
    }
    apex = Math.max(apex, groundY - world.player.y);
    if (a.wallFromX !== undefined && world.player.x >= a.wallFromX && world.player.x <= a.wallToX!) {
      wallClearance = Math.min(wallClearance, groundY - world.player.y);
    }
    if (released) afterRelease += SIM_DT;
    if (released && world.player.grounded && afterRelease > 0.1) break;
  }
  return {
    world,
    planted: plantedAt >= 0,
    released,
    quality,
    apex,
    wallClearance: wallClearance === Infinity ? 0 : wallClearance,
    plantLength,
    cleared: world.cleared,
    events,
  };
}
