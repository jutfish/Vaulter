import { beam as beamCfg, body, carry as cfg, pole, run } from '../data/tuning';
import { clearBeam, createBeam, resetBeamHistory, stepBeam, twang, type BeamHand, type BeamState } from './beam';

/**
 * How the vaulter carries the pole between vaults: where the hands are on it
 * (hand-over-hand), how the pole's weight leans the body, the running bob, the
 * aim's inertia, and the flexible pole itself (beam.ts).
 */
export interface Hand {
  /** Position along the pole from the butt (px). */
  s: number;
  /** Where a moving hand started and is going; equal when gripping. */
  from: number;
  to: number;
  /** 0..1 progress of a hand move; 1 = gripping. */
  t: number;
}

export interface CarryState {
  hands: [Hand, Hand];
  /** Time left before the next hand move may start. */
  movePause: number;
  /** Forward lean (rad, positive = toward facing direction) and its rate. */
  lean: number;
  leanVel: number;
  /** Vertical shoulder offset from the running bob (px, negative = up). */
  bob: number;
  /** Angular velocity of the carried pole's aim (rad/s). */
  aimVel: number;
  /** Hand-midpoint position relative to the feet (px), updated every tick. */
  anchorDX: number;
  anchorDY: number;
  beam: BeamState;
  /** Number of completed hand moves (for tests/feedback). */
  handMoves: number;
}

function hand(s: number): Hand {
  return { s, from: s, to: s, t: 1 };
}

export function createCarry(): CarryState {
  const mid = cfg.gripCarry;
  return {
    hands: [hand(mid - cfg.handGap / 2), hand(mid + cfg.handGap / 2)],
    movePause: 0,
    lean: 0,
    leanVel: 0,
    bob: 0,
    aimVel: 0,
    anchorDX: 0,
    anchorDY: -body.gripHeight,
    beam: createBeam(),
    handMoves: 0,
  };
}

export const isGripping = (h: Hand): boolean => h.t >= 1;

/** Midpoint between the hands along the pole (moving hands count at their current position). */
export function handMid(c: CarryState): number {
  return (c.hands[0].s + c.hands[1].s) / 2;
}

/** Grip-to-tip length available for a vault right now. */
export function reachOf(c: CarryState): number {
  return pole.totalLength - handMid(c);
}

function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Is the pole held out near-horizontal (either side)? Then the hands climb back to a vaulting grip. */
export function isPoised(aim: number): boolean {
  const off = Math.min(Math.abs(wrap(aim)), Math.abs(wrap(aim - Math.PI)));
  return off <= cfg.poisedAngle;
}

/** Moment of inertia (per unit mass/length) of the pole about the hands. Grows as more pole sticks out. */
function inertiaAbout(sMid: number): number {
  const L = pole.totalLength;
  return ((L - sMid) ** 3 + sMid ** 3) / 3;
}
const INERTIA_REF = inertiaAbout(cfg.gripCarry);

/**
 * Swings the carried pole toward `target` with a damped spring. More pole
 * sticking out past the hands = more inertia = a slower, heavier swing.
 */
export function stepAim(c: CarryState, aim: number, target: number, dt: number): number {
  const omega = cfg.aimOmega * Math.sqrt(INERTIA_REF / inertiaAbout(handMid(c)));
  const err = wrap(target - aim);
  // Arms can only accelerate a heavy pole so hard: cap the angular acceleration.
  let accel = omega * omega * err - 2 * cfg.aimDamping * omega * c.aimVel;
  accel = Math.max(-cfg.aimMaxAccel, Math.min(cfg.aimMaxAccel, accel));
  c.aimVel += accel * dt;
  c.aimVel = Math.max(-cfg.aimMaxSpeed, Math.min(cfg.aimMaxSpeed, c.aimVel));
  return wrap(aim + c.aimVel * dt);
}

/** Hand-over-hand toward the grip the current aim calls for. */
function stepHands(c: CarryState, aim: number, allowMoves: boolean, dt: number): void {
  const [a, b] = c.hands;
  for (const h of c.hands) {
    if (h.t < 1) {
      h.t = Math.min(1, h.t + dt / cfg.handMoveTime);
      const e = h.t * h.t * (3 - 2 * h.t); // smoothstep
      h.s = h.from + (h.to - h.from) * e;
      if (h.t >= 1) {
        c.movePause = cfg.handMovePause;
        c.handMoves++;
      }
    }
  }
  c.movePause = Math.max(0, c.movePause - dt);
  if (!allowMoves || !isGripping(a) || !isGripping(b) || c.movePause > 0) return;

  const target = isPoised(aim) ? cfg.gripVault : cfg.gripCarry;
  const err = target - handMid(c);
  if (Math.abs(err) >= cfg.handGap * 0.75) {
    // Hand over hand: the hand furthest from the target lets go and re-grips past the other one.
    const towardButt = err < 0;
    const [near, far] = (towardButt ? a.s <= b.s : a.s >= b.s) ? [a, b] : [b, a];
    far.from = far.s;
    far.to = Math.max(0.5, Math.min(pole.totalLength - 0.5, near.s + (towardButt ? -cfg.handGap : cfg.handGap)));
    far.t = 0;
  } else if (Math.abs(err) > 0.05) {
    // Close enough: slide the pole through both hands to settle exactly.
    const step = Math.sign(err) * Math.min(Math.abs(err), cfg.slideSpeed * dt);
    for (const h of c.hands) h.s = h.from = h.to = h.s + step;
  }
}

function approachExp(v: number, target: number, rate: number, dt: number): number {
  return v + (target - v) * (1 - Math.exp(-rate * dt));
}

export interface CarryInputs {
  x: number;
  y: number;
  vx: number;
  facing: 1 | -1;
  grounded: boolean;
  aim: number;
  /** Stride phase 0..1 (distance into the current stride). */
  stridePhase: number;
  /** False while the tip is dropping to plant: hands stay put. */
  allowHandMoves: boolean;
}

/**
 * One fixed tick of carrying: hands, lean, bob, then the flexible pole.
 * Call after the player has moved this tick.
 */
export function stepCarry(c: CarryState, p: CarryInputs, dt: number): void {
  stepHands(c, p.aim, p.allowHandMoves, dt);

  // Lean: the pole's weight in front of the hands tips the body, a little more the further it sticks out.
  const half = pole.totalLength / 2;
  const lever = ((half - handMid(c)) / (half - cfg.gripVault)) * Math.cos(p.aim) * p.facing;
  const speedFrac = Math.min(1, Math.abs(p.vx) / run.maxSpeed);
  const target = cfg.leanFromPole * Math.max(-0.4, Math.min(1, lever)) + cfg.leanFromSpeed * speedFrac;
  const w = cfg.leanOmega;
  c.leanVel += (w * w * (target - c.lean) - 2 * cfg.leanDamping * w * c.leanVel) * dt;
  c.lean += c.leanVel * dt;

  // Running bob: shoulders dip at each foot strike and rise in the flight phase.
  let bobTarget = 0;
  if (p.grounded && Math.abs(p.vx) > 8) {
    const amp = cfg.bobAtLowSpeed + (cfg.bobAtMaxSpeed - cfg.bobAtLowSpeed) * speedFrac;
    bobTarget = -amp * Math.abs(Math.sin(Math.PI * p.stridePhase));
  }
  c.bob = approachExp(c.bob, bobTarget, cfg.bobFollowRate, dt);

  // Hands' midpoint relative to the feet: lean rotates the body about the feet.
  const rot = c.lean * p.facing;
  const lx = cfg.handForward * p.facing;
  const ly = -body.gripHeight;
  c.anchorDX = lx * Math.cos(rot) - ly * Math.sin(rot);
  c.anchorDY = lx * Math.sin(rot) + ly * Math.cos(rot) + c.bob;

  for (let i = 0; i < 2; i++) {
    const h = c.hands[i]!;
    beamHands[i]!.s = h.s;
    // A moving hand loosens and slides rather than letting go completely.
    beamHands[i]!.grip = 1 - cfg.handLoosen * Math.sin(Math.PI * h.t);
  }
  stepBeam(c.beam, { anchorX: p.x + c.anchorDX, anchorY: p.y + c.anchorDY, sAnchor: handMid(c), aim: p.aim, hands: beamHands }, dt);
}

/** Reused every tick (no per-tick allocation). */
const beamHands: BeamHand[] = [
  { s: 0, grip: 1 },
  { s: 0, grip: 1 },
];

/** The vaulter took the pole into a vault: the carried beam stops, the body straightens. */
export function onPlanted(c: CarryState): void {
  clearBeam(c.beam);
  c.aimVel = 0;
}

/** The vaulter left the pole: it twangs from the release, the aim starts from rest where it is. */
export function onLeftPole(c: CarryState): void {
  resetBeamHistory(c.beam);
  twang(c.beam, handMid(c), beamCfg.launchTwang);
  c.aimVel = 0;
  c.lean = 0;
  c.leanVel = 0;
}
