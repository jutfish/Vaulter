import { carry as cfg, gravity, pole } from '../data/tuning';

/**
 * The pole as its own rigid body (v3). It has a position, velocity, angle and
 * spin, and gravity acts on it. The vaulter only influences it through the
 * hands:
 *  - a stiff linear spring pulling the pole's hand point to where the hands
 *    are (force capped: a hard enough jolt beats the grip), and
 *  - the arms' couple twisting the pole toward the angle they want (torque
 *    capped: the arms' strength). The couple includes holding the pole's
 *    weight, so a long pole held out level from one end uses most of the
 *    strength, swings slowly and visibly strains; held in the middle it's light.
 *
 * Units: mass 1 (forces are accelerations), px, s, rad. `theta` is the
 * direction of the pole's own axis, from end 0 (s = 0) to end 1
 * (s = totalLength). The centre of mass is at s = totalLength / 2.
 * Screen space: y down, positive torque turns theta clockwise on screen.
 */
export interface PoleBody {
  /** Centre of mass. theta is continuous (not wrapped to ±PI) so turns keep their direction. */
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  theta: number;
  omega: number;
}

export interface Grip {
  /** Where the hands' midpoint wants to be (world), and how fast it's moving. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Hands' midpoint along the pole (px from end 0). */
  sMid: number;
  /** Angle the arms want the pole's axis at (continuous, not wrapped), and how fast that target is moving (rad/s). */
  theta: number;
  omega: number;
  /** Grip strength multiplier: 1 = normal, lower while a hand is moving, higher for the plant. */
  grip: number;
  /** The level to collide with (omit for no collisions). */
  solid?: SolidQuery;
  /** Stretch of the pole (s from..to) that passes through floors (top surfaces), still colliding
   *  with walls and ceilings: the lead side during the plant drop, so the plant check sees the tip
   *  touch down (or the shaft land on something and jam). */
  exempt?: { from: number; to: number };
}

/** What the pole needs to know about the level. */
export interface SolidQuery {
  isSolidAt(x: number, y: number): boolean;
  isSolidTile(tx: number, ty: number): boolean;
  /** Way out of a slope tile for a point below its diagonal (null if not in a slope). */
  slopePush?(x: number, y: number): { nx: number; ny: number; depth: number } | null;
}

export interface HoldResult {
  /** Mean force the hands applied to the pole this tick (the vaulter feels the opposite). */
  fx: number;
  fy: number;
  /** Arm torque demanded ÷ torque available (peak over the tick); > 1 = maxed out. */
  strain: number;
  /** How far the pole's hand point is from the hands (px): large = grip being overpowered. */
  stretch: number;
  /** Total contact impulse from the level this tick (px/s, unit mass), and where the biggest one was. */
  contact: number;
  contactX: number;
  contactY: number;
  /** Most of that contact was the shaft scraping along a floor/ceiling (true) vs. hitting a wall face. */
  contactFloor: boolean;
}

export function emptyHold(): HoldResult {
  return { fx: 0, fy: 0, strain: 0, stretch: 0, contact: 0, contactX: 0, contactY: 0, contactFloor: false };
}

const L = pole.totalLength;
/** Moment of inertia of a uniform rod about its centre (unit mass). */
export const INERTIA = (L * L) / 12;
const SUBSTEPS = 4;

export function createPoleBody(): PoleBody {
  return { cx: 0, cy: 0, vx: 0, vy: 0, theta: 0, omega: 0 };
}

/** World position of the point s px from end 0. */
export function pointAt(b: PoleBody, s: number): { x: number; y: number } {
  const u = s - L / 2;
  return { x: b.cx + Math.cos(b.theta) * u, y: b.cy + Math.sin(b.theta) * u };
}

/** Places the pole so that point s sits at (x, y) with axis angle theta, moving at (vx, vy), not spinning. */
export function placePole(b: PoleBody, s: number, x: number, y: number, theta: number, vx = 0, vy = 0): void {
  const u = L / 2 - s;
  b.theta = theta;
  b.cx = x + Math.cos(theta) * u;
  b.cy = y + Math.sin(theta) * u;
  b.vx = vx;
  b.vy = vy;
  b.omega = 0;
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Torque gravity puts on the pole about the point sMid (positive = turns theta clockwise on screen). */
export function gravityTorqueAbout(theta: number, sMid: number): number {
  // The weight acts at the centre, (L/2 - sMid) along the axis from the hands.
  return (L / 2 - sMid) * Math.cos(theta) * gravity.g;
}

/** Advances a held pole by dt. */
export function stepHeldPole(b: PoleBody, g: Grip, dt: number, out: HoldResult): void {
  const h = dt / SUBSTEPS;
  const kLin = cfg.handOmega * cfg.handOmega;
  const cLin = 2 * cfg.handDampingRatio * cfg.handOmega;
  const fCap = cfg.handForceCap * g.grip;
  const tCap = cfg.armTorque * g.grip;
  const u = g.sMid - L / 2; // hand point relative to the centre, along the axis
  const inertiaAtHands = INERTIA + u * u;
  let fxSum = 0;
  let fySum = 0;
  let strain = 0;
  let stretch = 0;
  out.contact = 0;
  const tally = { biggest: 0, floor: 0, wall: 0 };
  for (let i = 0; i < SUBSTEPS; i++) {
    const rx = Math.cos(b.theta) * u;
    const ry = Math.sin(b.theta) * u;
    const pvx = b.vx - b.omega * ry; // velocity of the hand point on the pole
    const pvy = b.vy + b.omega * rx;
    const ex = g.x - (b.cx + rx);
    const ey = g.y - (b.cy + ry);
    stretch = Math.max(stretch, Math.hypot(ex, ey));

    // Hands: linear spring, capped.
    let fx = kLin * ex + cLin * (g.vx - pvx);
    let fy = kLin * ey + cLin * (g.vy - pvy);
    const fm = Math.hypot(fx, fy);
    if (fm > fCap) {
      fx *= fCap / fm;
      fy *= fCap / fm;
    }

    // Arms: hold the weight (feed-forward), and turn toward the wanted angle at a
    // speed they can still brake from in time (so a heavy pole doesn't overshoot).
    // Angles are continuous (unwrapped): the pole follows the path the input drew.
    const tg = gravityTorqueAbout(b.theta, g.sMid);
    const err = g.theta - b.theta;
    const brake = Math.max(4, (tCap - Math.abs(tg)) / inertiaAtHands);
    const speed = Math.min(Math.sqrt(2 * brake * Math.abs(err)) * 0.85, cfg.rotOmega * Math.abs(err));
    const omegaWant = g.omega + Math.sign(err) * speed;
    const want = inertiaAtHands * cfg.rotVelocityGain * (omegaWant - b.omega) - tg;
    const couple = Math.abs(want) > tCap ? Math.sign(want) * tCap : want;
    strain = Math.max(strain, tCap > 0 ? Math.abs(want) / tCap : 99);

    // Rigid body about its centre: hand force (and its moment), arms' couple, gravity.
    const pose: Pose = { cx: b.cx, cy: b.cy, theta: b.theta };
    b.vx += fx * h;
    b.vy += (fy + gravity.g) * h;
    b.omega += ((rx * fy - ry * fx + couple) / INERTIA) * h;
    b.cx += b.vx * h;
    b.cy += b.vy * h;
    b.theta += b.omega * h; // unwrapped on purpose
    fxSum += fx;
    fySum += fy;

    if (g.solid) collideAll(b, pose, g.solid, out, tally, g.exempt);
  }
  out.contactFloor = tally.floor >= tally.wall;
  out.fx = fxSum / SUBSTEPS;
  out.fy = fySum / SUBSTEPS;
  out.strain = strain;
  out.stretch = stretch;
}

// --- Contacts with the level ---------------------------------------------------

/** Spacing of the contact points along the pole (px). */
const CONTACT_SPACING = 2;
const TILE_SIZE = 16;
/** Farthest (px) searched for a way out when a point is buried with no open face next to it. */
const EXIT_SEARCH = 40;
/** Most a single contact moves the pole per substep (px): deep ones come out over a few substeps, not in a jump. */
const MAX_CORRECTION = 3;

/** The pole's pose at the start of a substep: contacts push points back out the way they came in. */
interface Pose {
  cx: number;
  cy: number;
  theta: number;
}

interface Contact {
  x: number;
  y: number;
  ny: number;
  impulse: number;
}

/**
 * Which way out of the ground for a point now at (x, y) that was at (qx, qy)
 * a substep ago: the face (or slope diagonal) it crossed on the way in, and
 * how deep past it the point is. A point that was already inside goes out the
 * nearest open face, or the shortest way along an axis if it's buried.
 */
function exitFor(solid: SolidQuery, x: number, y: number, qx: number, qy: number): { nx: number; ny: number; depth: number } {
  const slope = solid.slopePush?.(x, y) ?? null;
  if (!solid.isSolidAt(qx, qy)) {
    // Find where it went in: march from the outside point to the first solid point.
    const steps = Math.max(1, Math.ceil(Math.hypot(x - qx, y - qy) / 0.5));
    let ox = qx;
    let oy = qy;
    for (let i = 1; i <= steps; i++) {
      const ix = qx + ((x - qx) * i) / steps;
      const iy = qy + ((y - qy) * i) / steps;
      if (solid.isSolidAt(ix, iy)) {
        const otx = Math.floor(ox / TILE_SIZE);
        const oty = Math.floor(oy / TILE_SIZE);
        const itx = Math.floor(ix / TILE_SIZE);
        const ity = Math.floor(iy / TILE_SIZE);
        const entered = solid.slopePush?.(ix, iy) ?? null;
        if (entered !== null && otx === itx && oty === ity) {
          // Crossed a slope's diagonal: out along its normal, depth measured for the point now.
          const now = slope ?? entered;
          return { nx: entered.nx, ny: entered.ny, depth: Math.max(0, now.depth) };
        }
        if (ity > oty) return { nx: 0, ny: -1, depth: y - ity * TILE_SIZE };
        if (ity < oty) return { nx: 0, ny: 1, depth: (ity + 1) * TILE_SIZE - y };
        if (itx > otx) return { nx: -1, ny: 0, depth: x - itx * TILE_SIZE };
        if (itx < otx) return { nx: 1, ny: 0, depth: (itx + 1) * TILE_SIZE - x };
        break;
      }
      ox = ix;
      oy = iy;
    }
  }
  if (slope !== null) return slope;
  // Already inside: the nearest face with open space beyond it.
  const tx = Math.floor(x / TILE_SIZE);
  const ty = Math.floor(y / TILE_SIZE);
  const faces: [number, number, number, number, number][] = [
    [y - ty * TILE_SIZE, 0, -1, tx, ty - 1], // up
    [(ty + 1) * TILE_SIZE - y, 0, 1, tx, ty + 1], // down
    [x - tx * TILE_SIZE, -1, 0, tx - 1, ty], // left
    [(tx + 1) * TILE_SIZE - x, 1, 0, tx + 1, ty], // right
  ];
  let best = { nx: 0, ny: -1, depth: Infinity };
  for (const [d, fx, fy, ntx, nty] of faces) {
    if (d < best.depth && !solid.isSolidTile(ntx, nty)) best = { nx: fx, ny: fy, depth: d };
  }
  if (best.depth < Infinity) return best;
  // Buried deep: the shortest way out along an axis.
  for (let d = 1; d <= EXIT_SEARCH; d++) {
    for (const [fx, fy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
      if (!solid.isSolidAt(x + fx * d, y + fy * d)) return { nx: fx, ny: fy, depth: d };
    }
  }
  return { nx: 0, ny: -1, depth: EXIT_SEARCH };
}

/**
 * If the point s on the pole is inside the ground, push it out the way it
 * came in: an impulse that stops it moving inward (with a little bounce),
 * friction along the surface, and a positional correction (most of the
 * depth, at once). The hands only feel this as the pole being moved: jam it
 * and it's dragged out of them.
 */
function contactAt(b: PoleBody, prev: Pose, solid: SolidQuery, s: number, floorsFree: boolean): Contact | null {
  const u = s - L / 2;
  const rx = Math.cos(b.theta) * u;
  const ry = Math.sin(b.theta) * u;
  const x = b.cx + rx;
  const y = b.cy + ry;
  if (!solid.isSolidAt(x, y)) return null;
  const qx = prev.cx + Math.cos(prev.theta) * u;
  const qy = prev.cy + Math.sin(prev.theta) * u;
  const { nx, ny, depth } = exitFor(solid, x, y, qx, qy);
  if (floorsFree && ny < -0.5) return null;

  const rn = rx * ny - ry * nx;
  const kn = 1 + (rn * rn) / INERTIA;
  // Position: move the pole so this point comes most of the way out.
  const corr = Math.min(MAX_CORRECTION, cfg.contactBias * Math.max(0, depth)) / kn;
  b.cx += nx * corr;
  b.cy += ny * corr;
  b.theta += (rn * corr) / INERTIA;

  // Velocity of the contact point: stop it moving inward (a little bounce), with friction.
  const vx = b.vx - b.omega * ry;
  const vy = b.vy + b.omega * rx;
  const vn = vx * nx + vy * ny;
  let jn = (Math.max(-cfg.poleBounce * vn, 0) - vn) / kn;
  if (jn <= 0) return corr > 0.05 ? { x, y, ny, impulse: 0 } : null;
  const tx2 = -ny;
  const ty2 = nx;
  const vt = vx * tx2 + vy * ty2;
  const rt = rx * ty2 - ry * tx2;
  const kt = 1 + (rt * rt) / INERTIA;
  let jt = -vt / kt;
  const maxF = cfg.poleFriction * jn;
  if (jt > maxF) jt = maxF;
  if (jt < -maxF) jt = -maxF;
  const ix = nx * jn + tx2 * jt;
  const iy = ny * jn + ty2 * jt;
  b.vx += ix;
  b.vy += iy;
  b.omega += (rx * iy - ry * ix) / INERTIA;
  jn = Math.hypot(ix, iy);
  return { x, y, ny, impulse: jn };
}

/** Runs every contact point once for a substep, accumulating into out/tally. */
function collideAll(b: PoleBody, prev: Pose, solid: SolidQuery, out: HoldResult, tally: { biggest: number; floor: number; wall: number }, exempt?: { from: number; to: number }): void {
  for (let s = 0; s <= L + 0.01; s += CONTACT_SPACING) {
    const j = contactAt(b, prev, solid, s, exempt !== undefined && s >= exempt.from && s <= exempt.to);
    if (j === null) continue;
    out.contact += j.impulse;
    if (j.ny * j.ny >= 0.49) tally.floor += j.impulse;
    else tally.wall += j.impulse;
    if (j.impulse >= tally.biggest) {
      tally.biggest = j.impulse;
      out.contactX = j.x;
      out.contactY = j.y;
    }
  }
}

/**
 * A pole nobody is holding: gravity, a little air drag on the spin, and the
 * level's contacts. It falls, bounces, slides and settles. `out` reports contacts.
 */
export function stepFreePole(b: PoleBody, solid: SolidQuery, dt: number, out: HoldResult): void {
  const h = dt / SUBSTEPS;
  out.fx = 0;
  out.fy = 0;
  out.strain = 0;
  out.stretch = 0;
  out.contact = 0;
  const tally = { biggest: 0, floor: 0, wall: 0 };
  for (let i = 0; i < SUBSTEPS; i++) {
    const pose: Pose = { cx: b.cx, cy: b.cy, theta: b.theta };
    b.vy += gravity.g * h;
    b.omega *= 1 - cfg.freeSpinDrag * h;
    b.cx += b.vx * h;
    b.cy += b.vy * h;
    b.theta += b.omega * h;
    // Two passes so a pole lying on the ground settles instead of jittering.
    collideAll(b, pose, solid, out, tally);
    collideAll(b, pose, solid, out, tally);
  }
  out.contactFloor = tally.floor >= tally.wall;
}

/** Point on the pole (s, clamped to its length) closest to (x, y), and the distance to it. */
export function nearestOnPole(b: PoleBody, x: number, y: number): { s: number; dist: number } {
  const ax = Math.cos(b.theta);
  const ay = Math.sin(b.theta);
  const e0x = b.cx - ax * (L / 2);
  const e0y = b.cy - ay * (L / 2);
  const s = Math.max(0, Math.min(L, (x - e0x) * ax + (y - e0y) * ay));
  return { s, dist: Math.hypot(e0x + ax * s - x, e0y + ay * s - y) };
}
