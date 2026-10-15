import { beam as beamCfg, body, carry as cfg, pole, run } from '../data/tuning';
import { clearBeam, createBeam, NODE_SPACING, resetBeamHistory, stepBeam, twang, type BeamHand, type BeamState } from './beam';
import { createPoleBody, emptyHold, nearestOnPole, placePole, pointAt, stepFreePole, stepHeldPole, wrapAngle, type HoldResult, type PoleBody, type SolidQuery } from './poleBody';

/**
 * How the vaulter carries the pole between vaults (v3). The pole is its own
 * rigid body (poleBody.ts) held by two hands that sit at positions along it
 * and move hand over hand. The player's direction input says which way the
 * long ("lead") end should point; the arms twist the pole there within their
 * strength, and the hands work along the pole to make that end long. The
 * pole's weight leans the body, running bobs the shoulders, and the flexible
 * pole (beam.ts) ripples on top.
 */
export interface Hand {
  /** Position along the pole from end 0 (px). */
  s: number;
  /** Where a moving hand started and is going; equal when gripping. */
  from: number;
  to: number;
  /** 0..1 progress of a hand move; 1 = gripping. */
  t: number;
}

/** Why the pole got away from the vaulter. */
/** dragged: planted on the moving road, which took it. */
export type DropReason = 'yanked' | 'slipped' | 'bonk' | 'letGo' | 'dragged';

export interface CarryState {
  /** Is the vaulter holding the pole? When not, it's a free object in the level. */
  held: boolean;
  hands: [Hand, Hand];
  /** Time left before the next hand move may start. */
  movePause: number;
  /** Which end the player wants long: 1 = end at s = totalLength, 0 = end at s = 0. */
  lead: 0 | 1;
  /** Direction the arms want the lead end to point (screen angle, continuous: not wrapped). */
  leadCmd: number;
  /** Forward lean (rad, positive = toward facing direction) and its rate. */
  lean: number;
  leanVel: number;
  /** Vertical shoulder offset from the running bob (px, negative = up). */
  bob: number;
  /** Hands' target position relative to the feet (px), updated every tick. */
  anchorDX: number;
  anchorDY: number;
  pole: PoleBody;
  /** The hands' effect on the pole this tick (force, strain, stretch). */
  hold: HoldResult;
  /** Smoothed arm strain 0..1+ (for visuals/sound). */
  strain: number;
  /** How far (px) the pole slid through the hands this tick when shoved along its length. */
  slipped: number;
  beam: BeamState;
  /** Number of completed hand moves (for tests/feedback). */
  handMoves: number;
  /** A loose pole being carried off by the moving road (traffic.ts moves it; no physics). */
  swept: boolean;
}

const L = pole.totalLength;

function hand(s: number): Hand {
  return { s, from: s, to: s, t: 1 };
}

/** A fresh carry: relaxed grip, lead end (end 1) up and forward on the facing side. */
export function createCarry(feetX = 0, feetY = 0, facing: 1 | -1 = 1): CarryState {
  const c: CarryState = {
    held: true,
    // Lead is end 1, so the relaxed grip sits gripCarry from end 0.
    hands: [hand(cfg.gripCarry - cfg.handGap / 2), hand(cfg.gripCarry + cfg.handGap / 2)],
    movePause: 0,
    lead: 1,
    leadCmd: carryAngle(facing),
    lean: 0,
    leanVel: 0,
    bob: 0,
    anchorDX: cfg.handForward * facing,
    anchorDY: -body.gripHeight,
    pole: createPoleBody(),
    hold: emptyHold(),
    slipped: 0,
    strain: 0,
    beam: createBeam(),
    handMoves: 0,
    swept: false,
  };
  placePole(c.pole, handMid(c), feetX + c.anchorDX, feetY + c.anchorDY, c.leadCmd);
  return c;
}

/** Neutral carry: lead end raised to pole.carryElevation, on the given side. */
function carryAngle(side: number): number {
  return side >= 0 ? -pole.carryElevation : -Math.PI + pole.carryElevation;
}

export const isGripping = (h: Hand): boolean => h.t >= 1;
const allGripping = (c: CarryState): boolean => isGripping(c.hands[0]) && isGripping(c.hands[1]);

/** Midpoint between the hands along the pole (moving hands count at their current position). */
export function handMid(c: CarryState): number {
  return (c.hands[0].s + c.hands[1].s) / 2;
}

/** Length from the hands to the lead end: what a vault would use right now. */
export function reachOf(c: CarryState): number {
  const m = handMid(c);
  return c.lead === 1 ? L - m : m;
}

/** Physical direction the lead end is pointing (screen angle, wrapped to ±PI). */
export function leadAngle(c: CarryState): number {
  return wrapAngle(leadAngleU(c));
}

/** Same, continuous (matches the pole body's unwrapped theta). */
function leadAngleU(c: CarryState): number {
  return c.lead === 1 ? c.pole.theta : c.pole.theta + Math.PI;
}

/** Pole-axis angle (continuous) that puts the lead end along the continuous direction `dir`. */
function axisFor(c: CarryState, dir: number): number {
  return c.lead === 1 ? dir : dir - Math.PI;
}

/** Moves the continuous command to `dir` by the shortest turn from `from`. */
function turnTo(from: number, dir: number): number {
  return from + wrapAngle(dir - from);
}

/**
 * Interprets the player's direction input (null = none held).
 * A direction within leadFlipAngle of the last commanded lead direction
 * rotates the pole to it; further away, the other end becomes the lead (the
 * hands will work along to it) and that end rotates to the direction.
 * No direction: the lead end relaxes up to the carry angle on its side.
 */
export function setIntent(c: CarryState, dir: number | null, facing: 1 | -1): void {
  if (dir === null) {
    const side = Math.cos(leadAngle(c));
    c.leadCmd = turnTo(c.leadCmd, carryAngle(Math.abs(side) < 0.05 ? facing : side));
    return;
  }
  if (Math.abs(wrapAngle(dir - c.leadCmd)) > cfg.leadFlipAngle) {
    // The other end becomes the lead; it turns (at most ~80°) from where it physically is.
    c.lead = c.lead === 1 ? 0 : 1;
    c.leadCmd = turnTo(leadAngleU(c), dir);
  } else {
    c.leadCmd = turnTo(c.leadCmd, dir);
  }
}

/** Plant swing: the arms drive the lead end down toward the ground on its side. */
export function setPlantSwing(c: CarryState, dropSpeed: number, dt: number): void {
  const side = Math.cos(c.leadCmd) >= 0 ? 1 : -1;
  const target = side > 0 ? Math.PI / 2 - 0.15 : Math.PI / 2 + 0.15;
  const d = wrapAngle(target - c.leadCmd);
  c.leadCmd += Math.sign(d) * Math.min(Math.abs(d), dropSpeed * dt);
}

/** Where the hands' midpoint should be along the pole: far from the lead end when a direction is held. */
function gripTarget(c: CarryState, extending: boolean): number {
  const fromFar = extending ? cfg.gripVault : cfg.gripCarry;
  return c.lead === 1 ? fromFar : L - fromFar;
}

/** Hand-over-hand toward `target` (hands' midpoint, px from end 0). */
function stepHands(c: CarryState, target: number, allowMoves: boolean, dt: number): void {
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

  const err = target - handMid(c);
  if (Math.abs(err) >= cfg.handGap * 0.75) {
    // Hand over hand: the hand furthest from the target lets go and re-grips past the other one.
    const toward0 = err < 0;
    const [near, far] = (toward0 ? a.s <= b.s : a.s >= b.s) ? [a, b] : [b, a];
    far.from = far.s;
    far.to = Math.max(0.5, Math.min(L - 0.5, near.s + (toward0 ? -cfg.handGap : cfg.handGap)));
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
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  /** A direction is held (hands extend toward the far end). */
  extending: boolean;
  /** Stride phase 0..1 (distance into the current stride). */
  stridePhase: number;
  /** False while the tip is dropping to plant: hands stay put. */
  allowHandMoves: boolean;
  /** Plant swing: how fast (rad/s) the arms are driving the lead end down; 0 otherwise. */
  swingRate: number;
  /** The level the pole lives in. */
  level: SolidQuery;
}

/**
 * One fixed tick of carrying: hands, lean, bob, then the pole body and the
 * flexible pole on top. Call after the player has moved this tick.
 */
export function stepCarry(c: CarryState, p: CarryInputs, dt: number): DropReason | null {
  if (c.held) stepHands(c, gripTarget(c, p.extending), p.allowHandMoves, dt);

  // Lean: the pole's centre of mass out in front of the hands tips the body.
  const ax = p.x + c.anchorDX;
  const lever = c.held ? ((c.pole.cx - ax) * p.facing) / (L / 2 - cfg.gripVault) : 0;
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

  // Hands' target relative to the feet: lean rotates the body about the feet.
  const rot = c.lean * p.facing;
  const lx = cfg.handForward * p.facing;
  const ly = -body.gripHeight;
  const prevDX = c.anchorDX;
  const prevDY = c.anchorDY;
  c.anchorDX = lx * Math.cos(rot) - ly * Math.sin(rot);
  c.anchorDY = lx * Math.sin(rot) + ly * Math.cos(rot) + c.bob;

  if (!c.held) {
    // Nobody's holding it: it falls, bounces and settles on its own (unless the road has it).
    if (c.swept) c.hold.contact = 0;
    else stepFreePole(c.pole, p.level, dt, c.hold);
    c.strain = approachExp(c.strain, 0, 12, dt);
    return null;
  }

  // The pole body, pulled and twisted by the hands.
  // A hand mid-move weakens the hold a little (the other hand still has it).
  let grip = 1;
  for (const h of c.hands) grip = Math.min(grip, 1 - cfg.moveWeakening * Math.sin(Math.PI * h.t));
  stepHeldPole(
    c.pole,
    {
      x: p.x + c.anchorDX,
      y: p.y + c.anchorDY,
      vx: p.vx + (c.anchorDX - prevDX) / dt,
      vy: p.vy + (c.anchorDY - prevDY) / dt,
      sMid: handMid(c),
      theta: axisFor(c, c.leadCmd),
      // During the plant the arms drive the drop (track its speed, extra strength).
      omega: p.swingRate * swingSign(c),
      grip: p.swingRate > 0 ? grip * cfg.plantStrength : grip,
      solid: p.level,
      // During the plant drop the lead side passes through floors (the plant check finds where it touched).
      ...(p.swingRate > 0 ? { exempt: c.lead === 1 ? { from: handMid(c), to: L } : { from: 0, to: handMid(c) } } : {}),
    },
    dt,
    c.hold,
  );

  // Shoved along its length harder than the grip holds (e.g. into a wall), the pole slides
  // through the hands instead of dragging them with it.
  c.slipped = 0;
  const hp = pointAt(c.pole, handMid(c));
  const along = (p.x + c.anchorDX - hp.x) * Math.cos(c.pole.theta) + (p.y + c.anchorDY - hp.y) * Math.sin(c.pole.theta);
  if (Math.abs(along) > cfg.slipStretch && allGripping(c)) {
    const slide = Math.sign(along) * (Math.abs(along) - cfg.slipStretch);
    const lo = Math.min(c.hands[0].s, c.hands[1].s);
    const hi = Math.max(c.hands[0].s, c.hands[1].s);
    const d = Math.max(0.5 - lo, Math.min(L - 0.5 - hi, slide));
    for (const h of c.hands) h.s = h.from = h.to = h.s + d;
    c.slipped = d;
    // Pushed right out past the end of the pole: it's gone.
    if (Math.abs(slide - d) > cfg.slipStretch) {
      dropPole(c);
      return 'slipped';
    }
  }
  // Dragged sideways out of the hands harder than they can hold (along the pole it slides instead).
  const hp2 = pointAt(c.pole, handMid(c));
  const sideways = Math.abs((p.x + c.anchorDX - hp2.x) * Math.sin(c.pole.theta) - (p.y + c.anchorDY - hp2.y) * Math.cos(c.pole.theta));
  if (sideways > cfg.gripBreakStretch) {
    dropPole(c);
    return 'yanked';
  }
  c.strain = approachExp(c.strain, c.hold.strain, 12, dt);

  // The flexible pole: bending only (the body already does the rigid motion, so both
  // hands always pin it). It's shaken by the hands' own motion, stride jolts and all,
  // and turned with the body.
  for (let i = 0; i < 2; i++) beamHands[i]!.s = c.hands[i]!.s;
  stepBeam(c.beam, { anchorX: p.x + c.anchorDX, anchorY: p.y + c.anchorDY, sAnchor: handMid(c), aim: c.pole.theta, hands: beamHands }, dt);
  keepBeamOutOfGround(c, p.level);
  return null;
}

/**
 * The flexible pole's wobble can't bend it into the ground: a node whose
 * bent position is inside it is pulled back toward the pole's straight line
 * (where the pole body already keeps it out) and stops moving that way.
 */
function keepBeamOutOfGround(c: CarryState, level: SolidQuery): void {
  const nx = -Math.sin(c.pole.theta);
  const ny = Math.cos(c.pole.theta);
  const y = c.beam.y;
  const v = c.beam.v;
  for (let i = 0; i < y.length; i++) {
    const d = y[i]!;
    if (Math.abs(d) < 0.25) continue;
    const base = pointAt(c.pole, i * NODE_SPACING);
    if (!level.isSolidAt(base.x + nx * d, base.y + ny * d)) continue;
    let k = d;
    for (let n = 0; n < 8 && Math.abs(k) > 0.25 && level.isSolidAt(base.x + nx * k, base.y + ny * k); n++) k *= 0.5;
    y[i] = Math.abs(k) > 0.25 ? k : 0;
    if (Math.sign(v[i]!) === Math.sign(d)) v[i] = 0;
  }
}

/** Let go of the pole: it keeps whatever motion it has and becomes a free object. */
export function dropPole(c: CarryState): void {
  c.held = false;
  clearBeam(c.beam);
}

/**
 * Try to pick the pole up: the hands grab wherever they meet it (within
 * grabReach), at any speed. The longer side becomes the lead end; the pole
 * is scooped up to the vaulter's speed. Returns false if it's out of reach.
 */
export function grabPole(c: CarryState, feetX: number, feetY: number, vx: number, vy: number): boolean {
  if (c.held) return false;
  const hx = feetX + c.anchorDX;
  const hy = feetY + c.anchorDY;
  // The vaulter can stoop: anywhere from the hands down to the ankles counts.
  let near = nearestOnPole(c.pole, hx, hy);
  for (const k of [0.5, 1]) {
    const n = nearestOnPole(c.pole, hx, hy + (feetY - 3 - hy) * k);
    if (n.dist < near.dist) near = n;
  }
  if (near.dist > cfg.grabReach) return false;
  const s = Math.max(cfg.handGap / 2 + 0.5, Math.min(L - cfg.handGap / 2 - 0.5, near.s));
  c.hands = [
    { s: s - cfg.handGap / 2, from: s - cfg.handGap / 2, to: s - cfg.handGap / 2, t: 1 },
    { s: s + cfg.handGap / 2, from: s + cfg.handGap / 2, to: s + cfg.handGap / 2, t: 1 },
  ];
  c.lead = s < L / 2 ? 1 : 0;
  c.leadCmd = leadAngleU(c);
  // Snap the grabbed point into the hands and match their speed (the pole is light).
  const theta = c.pole.theta;
  placePole(c.pole, s, hx, hy, theta, vx, vy);
  c.held = true;
  c.swept = false;
  c.movePause = 0;
  resetBeamHistory(c.beam);
  return true;
}

/** Which way the plant swing turns the pole axis (lead end going down on its side). */
function swingSign(c: CarryState): number {
  // Right side: the lead angle increases toward +PI/2; left side it decreases.
  // The axis is the lead direction (or that + PI), so it turns the same way.
  return Math.cos(c.leadCmd) >= 0 ? 1 : -1;
}

/** Reused every tick (no per-tick allocation). */
const beamHands: BeamHand[] = [
  { s: 0, grip: 1 },
  { s: 0, grip: 1 },
];

/** The vaulter took the pole into a vault: the carried beam stops. */
export function onPlanted(c: CarryState): void {
  clearBeam(c.beam);
}

/**
 * The vaulter left the pole at (gripX, gripY) moving at (vx, vy), the pole
 * pointing at `leadDir`: the body is placed there, it twangs, and the arms
 * start from where it is.
 */
export function onLeftPole(c: CarryState, gripX: number, gripY: number, leadDir: number, vx: number, vy: number): void {
  c.leadCmd = leadDir;
  placePole(c.pole, handMid(c), gripX, gripY, axisFor(c, leadDir), vx, vy);
  // (leadDir is wrapped; the body restarts from it, so the continuous angles stay consistent.)
  resetBeamHistory(c.beam);
  twang(c.beam, handMid(c), beamCfg.launchTwang);
  c.lean = 0;
  c.leanVel = 0;
}

/** Restart / teleport: put the pole back in the hands at rest. */
export function resetPoleToHands(c: CarryState, feetX: number, feetY: number): void {
  c.held = true;
  c.swept = false;
  placePole(c.pole, handMid(c), feetX + c.anchorDX, feetY + c.anchorDY, axisFor(c, c.leadCmd));
  clearBeam(c.beam);
}
