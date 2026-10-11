import { beam as cfg, carry, gravity, pole } from '../data/tuning';

/**
 * The carried pole as a flexible beam (Euler-Bernoulli, discretised).
 *
 * The pole is a line of `cfg.nodes` points from the butt (s = 0) to the tip
 * (s = totalLength). We simulate only the sideways deflection `y` of each
 * point away from the straight line through the hands, in the frame that
 * moves and turns with the hands. Everything the hands do shows up as an
 * inertial force along the pole: the up-and-down of each running stride, the
 * body leaning, the arms swinging the aim. Those forces start at the hands
 * and travel out to the tip as a ripple.
 *
 * - Bending stiffness: discrete curvature energy, free (unloaded) ends.
 * - Hands: two stiff springs at arbitrary positions along the pole (a hand
 *   that's mid-move lets go, so the pole briefly pivots on the other hand).
 * - Gravity: makes the overhang droop a little.
 * - Damping: plain velocity damping + a little on sharp kinks.
 *
 * The vault physics never reads this: it's for feel and visuals, and it's
 * deterministic (fixed step, no randomness).
 */
export interface BeamState {
  /** Sideways deflection of each node (px), along the pole's normal. */
  y: Float64Array;
  v: Float64Array;
  hasHistory: boolean;
  prevX: number;
  prevY: number;
  prevVx: number;
  prevVy: number;
  prevAim: number;
  prevOmega: number;
}

export interface BeamHand {
  /** Position along the pole from the butt (px). */
  s: number;
  /** Grip strength 0..1 (1 = firm; lower while the hand is moving). */
  grip: number;
}

export interface BeamFrame {
  /** World position of the point on the pole at s = sAnchor (between the hands). */
  anchorX: number;
  anchorY: number;
  sAnchor: number;
  /** Pole direction (screen angle, butt → tip). */
  aim: number;
  hands: readonly BeamHand[];
}

export const NODE_SPACING = pole.totalLength / (cfg.nodes - 1);

/** Bending stiffness per unit mass, chosen so the overhang (hands fully back) rings at cfg.tipFrequency. */
export function bendStiffness(): number {
  // Cantilever first mode: omega = 3.516 * sqrt(EI / rho) / L^2, L = overhang past the front hand.
  const overhang = pole.totalLength - (carry.gripVault + carry.handGap / 2);
  const omega = 2 * Math.PI * cfg.tipFrequency;
  const root = (omega * overhang * overhang) / 3.516;
  return root * root;
}

export function createBeam(): BeamState {
  return {
    y: new Float64Array(cfg.nodes),
    v: new Float64Array(cfg.nodes),
    hasHistory: false,
    prevX: 0,
    prevY: 0,
    prevVx: 0,
    prevVy: 0,
    prevAim: 0,
    prevOmega: 0,
  };
}

/** Forget motion history (after a teleport/restart/vault) so no fake jolt is felt. */
export function resetBeamHistory(b: BeamState): void {
  b.hasHistory = false;
}

export function clearBeam(b: BeamState): void {
  b.y.fill(0);
  b.v.fill(0);
  b.hasHistory = false;
}

function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

const EI = bendStiffness();
const H4 = NODE_SPACING ** 4;
/** Highest natural frequency on this grid (rad/s): bending + hand springs. Sets the substep count. */
const OMEGA_MAX = Math.sqrt((16 * EI) / H4 + cfg.handStiffness * 2);
const DAMP_MAX = cfg.handDamping * 2 + (cfg.kinkDamping * 16 * EI) / H4 + cfg.damping;

/** Substeps so that omega*h <= 1 and damping*h <= 1 (comfortably inside explicit-Euler stability). */
export function substepsFor(dt: number): number {
  return Math.max(1, Math.ceil(dt * Math.max(OMEGA_MAX, DAMP_MAX)));
}

const curv = new Float64Array(cfg.nodes);
const curvV = new Float64Array(cfg.nodes);
const acc = new Float64Array(cfg.nodes);

/** Advances the beam by dt given where the hands are holding it this tick. */
export function stepBeam(b: BeamState, f: BeamFrame, dt: number): void {
  // Frame acceleration from the hands' motion (finite differences, capped).
  let ax = 0;
  let ay = 0;
  let alpha = 0;
  let vx = 0;
  let vy = 0;
  let omega = 0;
  if (b.hasHistory) {
    vx = (f.anchorX - b.prevX) / dt;
    vy = (f.anchorY - b.prevY) / dt;
    omega = wrap(f.aim - b.prevAim) / dt;
    ax = (vx - b.prevVx) / dt;
    ay = (vy - b.prevVy) / dt;
    alpha = (omega - b.prevOmega) / dt;
    const mag = Math.hypot(ax, ay);
    if (mag > cfg.maxFrameAccel) {
      ax *= cfg.maxFrameAccel / mag;
      ay *= cfg.maxFrameAccel / mag;
    }
    alpha = Math.max(-cfg.maxAngularAccel, Math.min(cfg.maxAngularAccel, alpha));
  }
  b.hasHistory = true;
  b.prevX = f.anchorX;
  b.prevY = f.anchorY;
  b.prevVx = vx;
  b.prevVy = vy;
  b.prevAim = f.aim;
  b.prevOmega = omega;

  // Normal to the pole (screen space): rotating the direction +90°.
  const nx = -Math.sin(f.aim);
  const ny = Math.cos(f.aim);
  // Uniform sideways load: gravity minus the frame's own acceleration.
  const load = gravity.g * ny - (ax * nx + ay * ny);

  const n = cfg.nodes;
  const steps = substepsFor(dt);
  const h = dt / steps;
  const k = EI / H4;
  const kink = cfg.kinkDamping * k;
  for (let step = 0; step < steps; step++) {
    // Curvature (second difference) of position and velocity; free ends carry no moment.
    curv[0] = curv[n - 1] = 0;
    curvV[0] = curvV[n - 1] = 0;
    for (let i = 1; i < n - 1; i++) {
      curv[i] = b.y[i - 1]! - 2 * b.y[i]! + b.y[i + 1]!;
      curvV[i] = b.v[i - 1]! - 2 * b.v[i]! + b.v[i + 1]!;
    }
    for (let i = 0; i < n; i++) {
      const cm = i > 0 ? curv[i - 1]! : 0;
      const cp = i < n - 1 ? curv[i + 1]! : 0;
      const vm = i > 0 ? curvV[i - 1]! : 0;
      const vp = i < n - 1 ? curvV[i + 1]! : 0;
      const bend = -k * (cm - 2 * curv[i]! + cp) - kink * (vm - 2 * curvV[i]! + vp);
      const s = i * NODE_SPACING;
      acc[i] = bend + load - alpha * (s - f.sAnchor) - cfg.damping * b.v[i]!;
    }
    // Hands: springs pulling the pole's centre line back through each gripping hand.
    for (const hand of f.hands) {
      if (hand.grip <= 0) continue;
      const pos = Math.max(0, Math.min(n - 1.000001, hand.s / NODE_SPACING));
      const i0 = Math.floor(pos);
      const w1 = pos - i0;
      const w0 = 1 - w1;
      const c = w0 * b.y[i0]! + w1 * b.y[i0 + 1]!;
      const cv = w0 * b.v[i0]! + w1 * b.v[i0 + 1]!;
      const force = hand.grip * (-cfg.handStiffness * c - cfg.handDamping * cv);
      acc[i0] = acc[i0]! + force * w0;
      acc[i0 + 1] = acc[i0 + 1]! + force * w1;
    }
    for (let i = 0; i < n; i++) {
      b.v[i] = b.v[i]! + acc[i]! * h;
      b.y[i] = b.y[i]! + b.v[i]! * h;
    }
  }
}

/** Kicks the pole into a ringing twang (e.g. when the vaulter leaves a bent pole). */
export function twang(b: BeamState, sAnchor: number, speed: number): void {
  const reach = pole.totalLength - sAnchor;
  for (let i = 0; i < cfg.nodes; i++) {
    const u = (i * NODE_SPACING - sAnchor) / reach;
    if (u > 0) b.v[i] = b.v[i]! + speed * u * u;
  }
}

/** Deflection at an arbitrary point along the pole (linear between nodes). */
export function deflectionAt(y: ArrayLike<number>, s: number): number {
  const pos = Math.max(0, Math.min(cfg.nodes - 1.000001, s / NODE_SPACING));
  const i0 = Math.floor(pos);
  const w = pos - i0;
  return y[i0]! * (1 - w) + y[i0 + 1]! * w;
}
