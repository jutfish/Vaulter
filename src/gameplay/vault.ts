import { gravity, pole } from '../data/tuning';

/**
 * Planted-pole physics: the vaulter is a point mass (at the grip) on the end
 * of a compression spring (the pole's chord) pivoting about the planted tip.
 *
 * Polar coordinates about the pivot: `phi` is the chord angle from straight
 * up, positive in the direction of travel (phi < 0 = still behind the
 * pivot); `r` is the chord length (pole length minus bend).
 *
 * - Momentum into the pole compresses it (bend = stored energy).
 * - While Down is held the pole is "latched": it can bend further but can't
 *   straighten, so the energy waits while the vaulter rotates up and over.
 * - Releasing Down unlatches it; the pole straightens (with the vaulter's
 *   extra drive, returnEfficiency) and fires the vaulter out along the
 *   chord. Release near vertical = up; early = up-and-back; late = forward.
 * - Holding too long bleeds the stored energy away (no pole snapping).
 *
 * Energies are per unit mass (px^2/s^2).
 */
export interface VaultState {
  pivotX: number;
  pivotY: number;
  /** +1 vaulting toward +x, -1 toward -x. */
  dir: 1 | -1;
  phi: number;
  /** Angular velocity (rad/s), positive = rotating forward over the pivot. */
  omega: number;
  r: number;
  /** Radial velocity (px/s), negative = compressing the pole. */
  vr: number;
  held: boolean;
  /** Down has been released: the pole is straightening and will throw the vaulter. */
  releasing: boolean;
  bleeding: boolean;
  timeAtPeak: number;
  peakBend: number;
  /** Bend energy and angle at the moment Down was released (feedback). */
  releaseBend: number;
  releasePhi: number;
  plantPhi: number;
  /** Total energy at plant (relative to the pivot), for launch quality. */
  plantEnergy: number;
  /** Grip-to-tip length of the pole for this vault (depends on where the hands were). */
  length: number;
}

const SUBSTEPS = 4;

export const maxBendEnergy = (): number => 0.5 * pole.stiffness * pole.maxCompression * pole.maxCompression;

export function bendEnergy(v: VaultState): number {
  const c = v.length - v.r;
  return c > 0 ? 0.5 * pole.stiffness * c * c : 0;
}

export function totalEnergy(v: VaultState): number {
  const kin = 0.5 * (v.vr * v.vr + v.r * v.omega * v.r * v.omega);
  return kin + gravity.g * v.r * Math.cos(v.phi) + bendEnergy(v) * (v.releasing ? pole.returnEfficiency : 1);
}

/**
 * Starts a vault with the vaulter's grip at (gripX, gripY) moving at (vx, vy),
 * pole tip planted at (pivotX, pivotY). `length` = grip-to-tip distance
 * (longer when the hands are further back on the pole).
 */
export function startVault(
  pivotX: number,
  pivotY: number,
  gripX: number,
  gripY: number,
  vx: number,
  vy: number,
  length: number = pole.length,
): VaultState {
  const dir: 1 | -1 = pivotX >= gripX ? 1 : -1;
  const dx = (gripX - pivotX) * dir;
  const up = pivotY - gripY;
  const r = Math.min(length, Math.hypot(dx, up));
  const phi = Math.atan2(dx, up);
  // Unit vectors in world space (y down): radial out from pivot, tangential forward.
  const ux = dir * Math.sin(phi);
  const uy = -Math.cos(phi);
  const tx = dir * Math.cos(phi);
  const ty = Math.sin(phi);
  const e = pole.plantEfficiency;
  const vr = (vx * ux + vy * uy) * e;
  const vt = (vx * tx + vy * ty) * e;
  const state: VaultState = {
    pivotX,
    pivotY,
    dir,
    phi,
    omega: vt / r,
    r,
    vr,
    held: true,
    releasing: false,
    bleeding: false,
    timeAtPeak: 0,
    peakBend: 0,
    releaseBend: 0,
    releasePhi: phi,
    plantPhi: phi,
    plantEnergy: 0,
    length,
  };
  state.plantEnergy = totalEnergy(state);
  return state;
}

export type VaultStepOutcome = 'onPole' | 'launched' | 'fellBack' | 'tippedOver';

/** Advances the planted vault by dt. `held` = Down is held this tick. */
export function stepVault(v: VaultState, held: boolean, dt: number): VaultStepOutcome {
  if (!held && !v.releasing) {
    v.releasing = true;
    v.releaseBend = bendEnergy(v);
    v.releasePhi = v.phi;
  }
  v.held = held && !v.releasing;

  const h = dt / SUBSTEPS;
  const k = pole.stiffness * (v.releasing ? pole.returnEfficiency : 1);
  for (let i = 0; i < SUBSTEPS; i++) {
    const c = Math.max(0, v.length - v.r);
    const spring = c > 0 ? k * c : 0;

    // Semi-implicit Euler in polar coordinates.
    const ar = v.r * v.omega * v.omega - gravity.g * Math.cos(v.phi) + spring;
    const aw = (gravity.g * Math.sin(v.phi) - 2 * v.vr * v.omega) / v.r;
    v.vr += ar * h;
    v.omega += aw * h;

    const latched = v.held && v.vr > 0 && c > 0;
    if (latched) v.vr = 0; // the bend can't straighten on its own
    v.r += v.vr * h;
    v.phi += v.omega * h;

    if (latched && !v.bleeding) driveSwing(v, h);

    // Bend limit: the pole can't fold further, the excess inward speed is lost.
    if (v.r < v.length - pole.maxCompression) {
      v.r = v.length - pole.maxCompression;
      if (v.vr < 0) v.vr = 0;
    }
    // The vaulter holds on: the chord can't extend past the pole length.
    if (v.r >= v.length) {
      v.r = v.length;
      if (v.releasing && v.vr > 0) {
        return 'launched';
      }
      if (v.vr > 0) v.vr = 0;
    }
  }

  // Over-bend bookkeeping (done per tick, outside the substeps).
  const bend = bendEnergy(v);
  v.peakBend = Math.max(v.peakBend, bend);
  if (v.held && bend > 0 && bend >= v.peakBend - 1e-3) v.timeAtPeak += dt;
  if (v.held && bend > 0 && (v.phi > pole.bleedAngle || v.timeAtPeak > pole.bleedDelay)) v.bleeding = true;
  if (v.bleeding && v.held) bleedBend(v, dt);
  if (v.releasing && v.r >= v.length - 1e-6) return 'launched';

  if (v.phi > pole.autoReleaseAngle) return 'tippedOver';
  if (v.omega < 0 && v.phi < v.plantPhi - 0.02) return 'fellBack';
  return 'onPole';
}

/**
 * The latched, bowed pole drives the vaulter forward around the pivot: it
 * unbends a little (rate pole.drive), angular momentum is conserved as the
 * chord lengthens, and every bit of energy freed goes into forward swing
 * speed. Exactly energy-conserving; does nothing if the swing is going
 * backwards or straightening would cost more than it frees.
 */
function driveSwing(v: VaultState, h: number): void {
  if (v.omega < 0) return;
  const k = pole.stiffness;
  const c = v.length - v.r;
  const c2 = c * Math.exp(-pole.drive * h);
  const r2 = v.length - c2;
  const omega2 = (v.omega * v.r * v.r) / (r2 * r2);
  const cos = Math.cos(v.phi);
  const before = 0.5 * (v.r * v.omega) ** 2 + gravity.g * v.r * cos + 0.5 * k * c * c;
  const after = 0.5 * (r2 * omega2) ** 2 + gravity.g * r2 * cos + 0.5 * k * c2 * c2;
  const freed = before - after;
  if (freed <= 0) return;
  const vt = Math.sqrt((r2 * omega2) ** 2 + 2 * freed);
  v.r = r2;
  v.omega = vt / r2;
}

/**
 * Over-held pole: the bend creeps out without pushing the vaulter, and the
 * energy it held is lost. Applied only when it doesn't raise total energy
 * (straightening lifts the vaulter, which must be paid for by the bend).
 */
function bleedBend(v: VaultState, dt: number): void {
  const c = v.length - v.r;
  if (c <= 0) return;
  const c2 = c * Math.exp(-0.5 * pole.bleedRate * dt);
  const r2 = v.length - c2;
  const omega2 = (v.omega * v.r * v.r) / (r2 * r2);
  const cos = Math.cos(v.phi);
  const k = pole.stiffness;
  const before = 0.5 * (v.r * v.omega) ** 2 + gravity.g * v.r * cos + 0.5 * k * c * c;
  const after = 0.5 * (r2 * omega2) ** 2 + gravity.g * r2 * cos + 0.5 * k * c2 * c2;
  if (after > before) return;
  v.r = r2;
  v.omega = omega2;
}

/** World-space grip position. */
export function gripPosition(v: VaultState): { x: number; y: number } {
  return {
    x: v.pivotX + v.dir * v.r * Math.sin(v.phi),
    y: v.pivotY - v.r * Math.cos(v.phi),
  };
}

/** World-space velocity of the grip. */
export function vaultVelocity(v: VaultState): { vx: number; vy: number } {
  const ux = v.dir * Math.sin(v.phi);
  const uy = -Math.cos(v.phi);
  const tx = v.dir * Math.cos(v.phi);
  const ty = Math.sin(v.phi);
  const vt = v.r * v.omega;
  return { vx: ux * v.vr + tx * vt, vy: uy * v.vr + ty * vt };
}

/**
 * 0..1 — how well this vault used its energy, judged at launch: the
 * height the grip will reach (above the pivot) versus the most this
 * vault's energy could ever give, scaled down if the vaulter isn't
 * still moving forward. Feedback only; physics doesn't read it.
 */
export function launchQuality(v: VaultState): number {
  const vel = vaultVelocity(v);
  const height = v.r * Math.cos(v.phi) + (vel.vy < 0 ? (vel.vy * vel.vy) / (2 * gravity.g) : 0);
  const best = (v.plantEnergy * pole.returnEfficiency) / gravity.g;
  const forward = Math.min(1, Math.max(0, (vel.vx * v.dir) / pole.qualityForwardSpeed));
  return Math.min(1, Math.max(0, height / best)) * forward;
}
