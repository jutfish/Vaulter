import { body, carry as carryCfg, gravity, hop, pole, run, TILE } from '../data/tuning';
import { createCarry, dropPole, grabPole, leadAngle, onLeftPole, onPlanted, reachOf, setIntent, setPlantSwing, stepCarry, type CarryState, type DropReason } from './carry';
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
  /** The vaulter lost the pole (it's now a free object in the level). */
  | { type: 'drop'; reason: DropReason }
  /** The vaulter picked the pole up. */
  | { type: 'pickup' }
  /** The carried pole hit or scraped the level (floor = scraping a floor/ceiling, else a wall face). */
  | { type: 'poleHit'; x: number; y: number; strength: number; floor: boolean }
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
  /** Direction the pole's lead (long) end points, screen space (0 = +x, -PI/2 = up). Read-only mirror of the pole body. */
  aim: number;
  poleMode: PoleMode;
  poleRecover: number;
  vault: VaultState | null;
  /** True from release until landing; used for vault height readout. */
  inVaultFlight: boolean;
  vaultApexY: number;
  vaultStartX: number;
  lastQuality: number;
  /** The pole (its own body), the hands on it, lean, bob and the flexible pole (v3). */
  carry: CarryState;
}

export function createPlayer(x: number, y: number): Player {
  const carry = createCarry(x, y, 1);
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
    aim: leadAngle(carry),
    poleMode: 'carry',
    poleRecover: 0,
    vault: null,
    inVaultFlight: false,
    vaultApexY: y,
    vaultStartX: x,
    lastQuality: 0,
    carry,
  };
}

export function playerBox(p: Player): Rect {
  return { x: p.x - body.width / 2, y: p.y - body.height, w: body.width, h: body.height };
}

/** While on the pole only hands-to-hips collide; the legs swing free. */
export function vaultBox(gripX: number, gripY: number): Rect {
  return { x: gripX - body.width / 2, y: gripY - body.vaultBoxAbove, w: body.width, h: body.vaultBoxAbove + body.vaultBoxBelow };
}

/** Where the hands hold the pole (their midpoint): moves with lean and running bob. */
export function gripOf(p: Player): { x: number; y: number } {
  return { x: p.x + p.carry.anchorDX, y: p.y + p.carry.anchorDY };
}

/** Hands-to-lead-end length right now: longer once the hands have worked back to the far end. */
export function reach(p: Player): number {
  return reachOf(p.carry);
}

export function poleTip(p: Player): { x: number; y: number } {
  const g = gripOf(p);
  const L = reach(p);
  return { x: g.x + Math.cos(p.aim) * L, y: g.y + Math.sin(p.aim) * L };
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

/** Arrow keys → the direction the lead end should point, or null if none held. (Down is the plant key.) */
export function inputDirection(input: ActionFrame): number | null {
  const ax = (input.down.aimRight ? 1 : 0) - (input.down.aimLeft ? 1 : 0);
  const ay = input.down.aimUp ? -1 : 0;
  if (ax === 0 && ay === 0) return null;
  return Math.atan2(ay, ax);
}

/** Is the pole near horizontal (either side) so that Down can plant it? (Only checked while holding it.) */
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

  // --- Pole intent / plant swing ---
  const dir = inputDirection(input);
  const held = p.carry.held;
  if (input.pressed.grab && p.poleMode === 'carry') {
    if (held) {
      dropPole(p.carry);
      events.push({ type: 'drop', reason: 'letGo' });
    } else if (grabPole(p.carry, p.x, p.y, p.vx, p.vy)) {
      events.push({ type: 'pickup' });
    }
  }
  if (p.poleMode === 'carry' && p.carry.held) {
    setIntent(p.carry, dir, p.facing);
    if (input.pressed.aimDown && p.poleRecover <= 0 && canPlantFromAim(p.aim)) {
      p.poleMode = 'swing';
      events.push({ type: 'plantSwing' });
    }
  }
  if (p.poleMode === 'swing') {
    if (!input.down.aimDown) p.poleMode = 'carry';
    else setPlantSwing(p.carry, pole.plantSwingSpeed, dt);
  }
  const leadBefore = p.aim;
  const vxBefore = p.vx;
  const vyBefore = p.vy;

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

  const lost = stepCarry(
    p.carry,
    {
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      facing: p.facing,
      grounded: p.grounded,
      extending: dir !== null || p.poleMode === 'swing',
      stridePhase: p.strideDistance / run.strideLength,
      allowHandMoves: p.poleMode === 'carry',
      swingRate: p.poleMode === 'swing' ? pole.plantSwingSpeed : 0,
      level,
      collide: p.poleMode !== 'swing',
    },
    dt,
  );
  p.aim = leadAngle(p.carry);
  if (lost) {
    events.push({ type: 'drop', reason: lost });
    if (p.poleMode === 'swing') p.poleMode = 'carry';
  }

  // The pole pushes back on the vaulter: only the force beyond what it takes to carry it along
  // (so running with it costs nothing, but swings, drags and jams do). Vertical only in the air.
  const h = p.carry.hold;
  if (p.carry.held) applyPolePush(p, h.fx, h.fy, vxBefore, vyBefore, dt);
  if (h.contact > POLE_HIT_EVENT) events.push({ type: 'poleHit', x: h.contact > 0 ? h.contactX : p.x, y: h.contactY, strength: h.contact, floor: h.contactFloor });

  if (p.poleMode === 'swing') checkPlantContact(p, level, leadBefore, events);
}

/**
 * The pole pushes back on the vaulter: only the force beyond what it takes to carry it along
 * (so running with it costs nothing, but swings, drags and jams do). Vertical only in the air.
 */
function applyPolePush(p: Player, fx: number, fy: number, vxBefore: number, vyBefore: number, dt: number): void {
  const ex = fx - (p.vx - vxBefore) / dt;
  const ey = fy + gravity.g - (p.vy - vyBefore) / dt;
  let push = -ex * carryCfg.poleMassRatio;
  if (p.grounded) {
    // Feet on the ground soak up small pushes; only real hits (drags, jams, big swings) move you.
    push = Math.sign(push) * Math.max(0, Math.abs(push) - carryCfg.footHold);
  } else {
    p.vy -= ey * carryCfg.poleMassRatio * dt;
  }
  p.vx += push * dt;
}

/**
 * During the plant swing: did the lead end come down onto something this tick?
 * The drop is swept from last tick's angle in small steps so the first contact
 * is found where it really happens. Near the end, on a top surface = plant;
 * anywhere else along the shaft = jam.
 */
function checkPlantContact(p: Player, level: Level, leadBefore: number, events: GameEvent[]): void {
  const side = Math.cos(p.aim) >= 0 ? 1 : -1;
  const turn = wrapAngle(p.aim - leadBefore);
  const steps = Math.max(1, Math.ceil(Math.abs(turn) / PLANT_SWEEP_STEP));
  let hit: { x: number; y: number; d: number } | null = null;
  for (let i = 1; i <= steps && hit === null; i++) hit = firstSolidAlongPole(p, level, wrapAngle(leadBefore + (turn * i) / steps));
  if (hit === null) return;

  const grip = gripOf(p);
  const L = reach(p);
  const tileTop = Math.floor(hit.y / TILE) * TILE;
  const nearTip = hit.d >= L - PLANT_TIP_ZONE;
  const sin = (tileTop - grip.y) / L;
  if (nearTip && grip.y < tileTop && sin <= 1 && !level.isSolidAt(hit.x, tileTop - 1)) {
    // The lead end came down onto a top surface: plant exactly where it touches.
    const exact = side > 0 ? Math.asin(sin) : Math.PI - Math.asin(sin);
    if (firstSolidAlongPole(p, level, exact, L - 1) === null) {
      p.aim = exact;
      const tipX = grip.x + Math.cos(exact) * L;
      p.vault = startVault(tipX, tileTop, grip.x, grip.y, p.vx, p.vy, L);
      onPlanted(p.carry);
      p.poleMode = 'planted';
      p.grounded = false;
      p.hopHeld = false;
      p.vaultStartX = p.x;
      events.push({ type: 'plant', x: tipX, y: tileTop });
      return;
    }
  }
  jam(p, side, events);
}

/** Jammed the pole into a wall face: small knock back, pole recovers. */
function jam(p: Player, side: number, events: GameEvent[]): void {
  p.poleMode = 'carry';
  p.poleRecover = pole.recoverTime;
  p.vx = -side * Math.min(60, Math.abs(p.vx) * 0.2);
  // The pole kicks back out of the jam.
  p.carry.pole.omega *= -0.3;
  p.carry.leadCmd = side > 0 ? 0 : Math.PI;
  events.push({ type: 'stab' });
}

/** Contact impulse (px/s) above which the pole hitting the level is an event (sound, dust). */
const POLE_HIT_EVENT = 60;

/** Contacts this close to the tip count as the tip landing; anything further up the shaft jams. */
const PLANT_TIP_ZONE = 6;
/** Angle step (rad) for sweeping the tip drop: the tip moves < 1 px per step. */
const PLANT_SWEEP_STEP = 0.01;

/** First solid point along the pole at `angle`, marching out from the grip; null if clear. */
function firstSolidAlongPole(p: Player, level: Level, angle: number, length = reach(p)): { x: number; y: number; d: number } | null {
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
    const dir = v.dir;
    leavePole(p, 0, Math.max(0, vel.vy) * 0.5);
    events.push({ type: 'bonk' });
    // Knocked off the pole: it's left standing in its plant and topples over.
    dropPole(p.carry);
    p.carry.pole.vx = 0;
    p.carry.pole.vy = 0;
    p.carry.pole.omega = dir * 1.2;
    events.push({ type: 'drop', reason: 'bonk' });
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
  // The pole is back in the hands where it was, pointing at the plant; the arms swing it from there.
  const g = gripOf(p);
  onLeftPole(p.carry, g.x, g.y, p.aim, vx, vy);
}
