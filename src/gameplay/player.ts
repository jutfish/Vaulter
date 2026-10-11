import { body, gravity, hop, pole, run, TILE } from '../data/tuning';
import type { ActionFrame } from './input';
import { Level, moveBox, type Rect } from './level';
import { gripPosition, launchQuality, startVault, stepVault, vaultVelocity, type VaultState } from './vault';

export type GameEvent =
  | { type: 'step' }
  | { type: 'hop' }
  | { type: 'land'; speed: number }
  | { type: 'bump'; speed: number }
  | { type: 'plantSwing' }
  | { type: 'plant'; x: number; y: number }
  | { type: 'stab' }
  /** Down let go: the pole starts to straighten. */
  | { type: 'release' }
  /** Vaulter leaves the pole. tipped = held so long the pole fell over. */
  | { type: 'launch'; quality: number; perfect: boolean; tipped: boolean }
  | { type: 'fellBack' }
  | { type: 'bonk' };

export type PoleMode = 'carry' | 'swing' | 'planted';

export interface Player {
  /** Feet centre. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  coyote: number;
  hopBuffer: number;
  hopHeld: boolean;
  strideDistance: number;
  /** Carried pole angle in screen space (0 = +x, -PI/2 = straight up). */
  aim: number;
  poleMode: PoleMode;
  poleRecover: number;
  vault: VaultState | null;
  /** True from release until landing; used for vault height readout. */
  inVaultFlight: boolean;
  vaultApexY: number;
  vaultStartX: number;
  lastQuality: number;
}

export function createPlayer(x: number, y: number): Player {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: true,
    coyote: 0,
    hopBuffer: 0,
    hopHeld: false,
    strideDistance: 0,
    aim: -pole.carryElevation,
    poleMode: 'carry',
    poleRecover: 0,
    vault: null,
    inVaultFlight: false,
    vaultApexY: y,
    vaultStartX: x,
    lastQuality: 0,
  };
}

export function playerBox(p: Player): Rect {
  return { x: p.x - body.width / 2, y: p.y - body.height, w: body.width, h: body.height };
}

/** While on the pole only hands-to-hips collide; the legs swing free. */
export function vaultBox(gripX: number, gripY: number): Rect {
  return { x: gripX - body.width / 2, y: gripY - body.vaultBoxAbove, w: body.width, h: body.vaultBoxAbove + body.vaultBoxBelow };
}

export function gripOf(p: Player): { x: number; y: number } {
  return { x: p.x, y: p.y - body.gripHeight };
}

export function poleTip(p: Player): { x: number; y: number } {
  const g = gripOf(p);
  return { x: g.x + Math.cos(p.aim) * pole.length, y: g.y + Math.sin(p.aim) * pole.length };
}

function approach(value: number, target: number, amount: number): number {
  if (value < target) return Math.min(target, value + amount);
  return Math.max(target, value - amount);
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Arrow keys → target pole angle. No arrows → neutral carry angle on the facing side. */
export function aimTarget(input: ActionFrame, facing: 1 | -1): number {
  const ax = (input.down.aimRight ? 1 : 0) - (input.down.aimLeft ? 1 : 0);
  const ay = input.down.aimUp ? -1 : 0;
  if (ax === 0 && ay === 0) return facing > 0 ? -pole.carryElevation : -Math.PI + pole.carryElevation;
  if (ax === 0) return -Math.PI / 2;
  return Math.atan2(ay, ax);
}

/** Is the pole near horizontal (either side) so that Down can plant it? */
function canPlantFromAim(aim: number): boolean {
  const fromRight = Math.abs(wrapAngle(aim));
  const fromLeft = Math.abs(wrapAngle(aim - Math.PI));
  return Math.min(fromRight, fromLeft) <= pole.plantAimTolerance;
}

export function stepPlayer(p: Player, level: Level, input: ActionFrame, dt: number, events: GameEvent[]): void {
  if (p.poleMode === 'planted' && p.vault) {
    stepPlanted(p, level, input, dt, events);
    return;
  }

  p.poleRecover = Math.max(0, p.poleRecover - dt);
  const moveDir = (input.down.right ? 1 : 0) - (input.down.left ? 1 : 0);
  if (moveDir !== 0) p.facing = moveDir > 0 ? 1 : -1;

  // --- Horizontal movement ---
  if (p.grounded) {
    const speed = Math.abs(p.vx);
    if (moveDir !== 0 && (Math.sign(p.vx) === moveDir || p.vx === 0)) {
      if (speed < run.maxSpeed) {
        const t = speed / run.maxSpeed;
        const accel = run.accelFromRest + (run.accelAtMax - run.accelFromRest) * t;
        p.vx = moveDir * Math.min(run.maxSpeed, speed + accel * dt);
      } else {
        p.vx = moveDir * Math.max(run.maxSpeed, speed - run.overspeedDecay * dt);
      }
    } else if (moveDir !== 0) {
      p.vx = approach(p.vx, 0, run.turnDecel * dt);
    } else {
      p.vx = approach(p.vx, 0, run.groundFriction * dt);
    }
  } else if (moveDir !== 0) {
    // Air control can steer but never adds speed beyond run.maxSpeed.
    const target = moveDir * run.maxSpeed;
    if (Math.abs(p.vx) < run.maxSpeed || Math.sign(p.vx) !== moveDir) p.vx = approach(p.vx, target, run.airAccel * dt);
  }

  // --- Hop (coyote time + input buffering + variable height) ---
  p.coyote = p.grounded ? hop.coyoteTime : Math.max(0, p.coyote - dt);
  p.hopBuffer = input.pressed.hop ? hop.bufferTime : Math.max(0, p.hopBuffer - dt);
  if (p.hopBuffer > 0 && p.coyote > 0 && p.poleMode === 'carry') {
    p.vy = -hop.speed;
    p.grounded = false;
    p.coyote = 0;
    p.hopBuffer = 0;
    p.hopHeld = true;
    events.push({ type: 'hop' });
  }
  if (p.hopHeld && (!input.down.hop || p.vy >= 0)) {
    if (!input.down.hop && p.vy < 0) p.vy *= hop.cutMultiplier;
    p.hopHeld = false;
  }

  // --- Pole aim / plant swing ---
  if (p.poleMode === 'carry') {
    const target = aimTarget(input, p.facing);
    const diff = wrapAngle(target - p.aim);
    p.aim = wrapAngle(p.aim + Math.sign(diff) * Math.min(Math.abs(diff), pole.aimSpeed * dt));
    if (input.pressed.aimDown && p.poleRecover <= 0 && canPlantFromAim(p.aim)) {
      p.poleMode = 'swing';
      events.push({ type: 'plantSwing' });
    }
  } else if (p.poleMode === 'swing') {
    stepPlantSwing(p, level, input, dt, events);
    if ((p.poleMode as PoleMode) === 'planted') return;
  }

  // --- Gravity and collision ---
  p.vy = Math.min(gravity.maxFall, p.vy + gravity.g * dt);
  const box = playerBox(p);
  const wasGrounded = p.grounded;
  const fallSpeed = p.vy;
  const res = moveBox(level, box, p.vx * dt, p.vy * dt);
  p.x = box.x + box.w / 2;
  p.y = box.y + box.h;
  if (res.hitX) {
    if (Math.abs(p.vx) > 120) events.push({ type: 'bump', speed: Math.abs(p.vx) });
    p.vx = 0;
  }
  if (res.hitY) p.vy = 0;
  p.grounded = res.grounded && p.vy >= 0;

  if (p.inVaultFlight) p.vaultApexY = Math.min(p.vaultApexY, p.y);
  if (p.grounded && !wasGrounded) {
    events.push({ type: 'land', speed: fallSpeed });
    p.inVaultFlight = false;
  }

  if (p.grounded && moveDir !== 0) {
    p.strideDistance += Math.abs(p.vx) * dt;
    if (p.strideDistance >= run.strideLength) {
      p.strideDistance -= run.strideLength;
      events.push({ type: 'step' });
    }
  }
}

function stepPlantSwing(p: Player, level: Level, input: ActionFrame, dt: number, events: GameEvent[]): void {
  if (!input.down.aimDown) {
    p.poleMode = 'carry';
    return;
  }
  const side = Math.cos(p.aim) >= 0 ? 1 : -1;
  const target = side > 0 ? Math.PI / 2 - 0.15 : Math.PI / 2 + 0.15; // nearly straight down
  const diff = wrapAngle(target - p.aim);
  p.aim = wrapAngle(p.aim + Math.sign(diff) * Math.min(Math.abs(diff), pole.plantSwingSpeed * dt));

  const hit = firstSolidAlongPole(p, level, p.aim);
  if (hit !== null) {
    const grip = gripOf(p);
    const tileTop = Math.floor(hit.y / TILE) * TILE;
    const nearTip = hit.d >= pole.length - PLANT_TIP_ZONE;
    const sin = (tileTop - grip.y) / pole.length;
    if (nearTip && grip.y < tileTop && sin <= 1 && !level.isSolidAt(hit.x, tileTop - 1)) {
      // The tip came down onto a top surface: plant exactly where the tip touches it.
      const exact = side > 0 ? Math.asin(sin) : Math.PI - Math.asin(sin);
      if (firstSolidAlongPole(p, level, exact, pole.length - 1) === null) {
        p.aim = exact;
        const tipX = grip.x + Math.cos(exact) * pole.length;
        p.vault = startVault(tipX, tileTop, grip.x, grip.y, p.vx, p.vy);
        p.poleMode = 'planted';
        p.grounded = false;
        p.hopHeld = false;
        p.vaultStartX = p.x;
        events.push({ type: 'plant', x: tipX, y: tileTop });
        return;
      }
    }
    jam(p, side, events);
    return;
  }
  if (Math.abs(diff) < 1e-3) {
    // Swung all the way down without finding ground (too high in the air).
    p.poleMode = 'carry';
  }
}

/** Jammed the pole into a wall face: small knock back, pole recovers. */
function jam(p: Player, side: number, events: GameEvent[]): void {
  p.poleMode = 'carry';
  p.poleRecover = pole.recoverTime;
  p.vx = -side * Math.min(60, Math.abs(p.vx) * 0.2);
  events.push({ type: 'stab' });
}

/** Contacts this close to the tip count as the tip landing (the tip moves up to ~9 px per tick). */
const PLANT_TIP_ZONE = 14;

/** First solid point along the pole at `angle`, marching out from the grip; null if clear. */
function firstSolidAlongPole(p: Player, level: Level, angle: number, length = pole.length): { x: number; y: number; d: number } | null {
  const g = gripOf(p);
  const cx = Math.cos(angle);
  const cy = Math.sin(angle);
  for (let d = 2; d <= length; d += 2) {
    const x = g.x + cx * d;
    const y = g.y + cy * d;
    if (level.isSolidAt(x, y)) return { x, y, d };
  }
  return null;
}

function stepPlanted(p: Player, level: Level, input: ActionFrame, dt: number, events: GameEvent[]): void {
  const v = p.vault!;
  const wasReleasing = v.releasing;
  const prevX = p.x;
  const prevY = p.y;
  const outcome = stepVault(v, input.down.aimDown, dt);

  if (v.releasing && !wasReleasing) events.push({ type: 'release' });

  const g = gripPosition(v);
  p.x = g.x;
  p.y = g.y + body.gripHeight;
  const vel = vaultVelocity(v);
  p.vx = vel.vx;
  p.vy = vel.vy;
  p.aim = Math.atan2(v.pivotY - g.y, v.pivotX - g.x);

  if (level.overlapsSolid(vaultBox(g.x, g.y))) {
    // Body hit something mid-swing: drop off the pole.
    p.x = prevX;
    p.y = prevY;
    const vel = vaultVelocity(v);
    leavePole(p, 0, Math.max(0, vel.vy) * 0.5);
    events.push({ type: 'bonk' });
    return;
  }

  if (outcome !== 'onPole') {
    const vel = vaultVelocity(v);
    const quality = outcome === 'fellBack' ? 0 : launchQuality(v);
    leavePole(p, vel.vx, vel.vy);
    if (outcome === 'fellBack') {
      events.push({ type: 'fellBack' });
    } else {
      p.lastQuality = quality;
      events.push({ type: 'launch', quality, perfect: quality >= pole.perfectThreshold, tipped: outcome === 'tippedOver' });
    }
  }
}

function leavePole(p: Player, vx: number, vy: number): void {
  p.vx = vx;
  p.vy = vy;
  p.poleMode = 'carry';
  p.poleRecover = pole.recoverTime;
  p.vault = null;
  p.grounded = false;
  p.inVaultFlight = true;
  p.vaultApexY = p.y;
  p.aim = p.facing > 0 ? -pole.carryElevation : -Math.PI + pole.carryElevation;
}
