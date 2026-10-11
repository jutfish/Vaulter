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
  /** The level to collide with (omit for no collisions, e.g. during the committed plant drop). */
  solid?: SolidQuery;
}

/** What the pole needs to know about the level. */
export interface SolidQuery {
  isSolidAt(x: number, y: number): boolean;
  isSolidTile(tx: number, ty: number): boolean;
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
  let biggest = 0;
  let floorImpulse = 0;
  let wallImpulse = 0;
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
    b.vx += fx * h;
    b.vy += (fy + gravity.g) * h;
    b.omega += ((rx * fy - ry * fx + couple) / INERTIA) * h;
    b.cx += b.vx * h;
    b.cy += b.vy * h;
    b.theta += b.omega * h; // unwrapped on purpose
    fxSum += fx;
    fySum += fy;

    if (g.solid) {
      for (let s = 0; s <= L + 0.01; s += CONTACT_SPACING) {
        const j = contactAt(b, g.solid, s, h);
        if (j === null) continue;
        out.contact += j.impulse;
        if (j.ny * j.ny > 0.5) floorImpulse += j.impulse;
        else wallImpulse += j.impulse;
        if (j.impulse > biggest) {
          biggest = j.impulse;
          out.contactX = j.x;
          out.contactY = j.y;
        }
      }
    }
  }
  out.contactFloor = floorImpulse >= wallImpulse;
  out.fx = fxSum / SUBSTEPS;
  out.fy = fySum / SUBSTEPS;
  out.strain = strain;
  out.stretch = stretch;
}

// --- Contacts with the level ---------------------------------------------------

/** Spacing of the contact points along the pole (px). */
const CONTACT_SPACING = 4;
const TILE_SIZE = 16;

interface Contact {
  x: number;
  y: number;
  ny: number;
  impulse: number;
}

/**
 * If the point s on the pole is inside a solid tile, push it out through the
 * nearest open face: an impulse that stops it moving inward (with a little
 * bounce), friction along the surface, and a positional correction.
 */
function contactAt(b: PoleBody, solid: SolidQuery, s: number, h: number): Contact | null {
  const u = s - L / 2;
  const rx = Math.cos(b.theta) * u;
  const ry = Math.sin(b.theta) * u;
  const x = b.cx + rx;
  const y = b.cy + ry;
  if (!solid.isSolidAt(x, y)) return null;

  // Nearest open face of the tile the point is in.
  const tx = Math.floor(x / TILE_SIZE);
  const ty = Math.floor(y / TILE_SIZE);
  let depth = Infinity;
  let nx = 0;
  let ny = -1;
  const faces: [number, number, number, number, number][] = [
    [y - ty * TILE_SIZE, 0, -1, tx, ty - 1], // up
    [(ty + 1) * TILE_SIZE - y, 0, 1, tx, ty + 1], // down
    [x - tx * TILE_SIZE, -1, 0, tx - 1, ty], // left
    [(tx + 1) * TILE_SIZE - x, 1, 0, tx + 1, ty], // right
  ];
  for (const [d, fx, fy, ntx, nty] of faces) {
    if (d < depth && !solid.isSolidTile(ntx, nty)) {
      depth = d;
      nx = fx;
      ny = fy;
    }
  }
  if (depth === Infinity) depth = y - ty * TILE_SIZE; // buried: push up

  // Velocity of the contact point and the effective mass along the normal.
  const vx = b.vx - b.omega * ry;
  const vy = b.vy + b.omega * rx;
  const vn = vx * nx + vy * ny;
  const rn = rx * ny - ry * nx;
  const kn = 1 + (rn * rn) / INERTIA;
  // Want to be separating at least as fast as the penetration needs (bias), with a little bounce.
  const target = Math.max(-cfg.poleBounce * vn, (cfg.contactBias * depth) / h);
  let jn = (target - vn) / kn;
  if (jn <= 0) return null;
  // Friction along the surface, limited by the normal impulse.
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
