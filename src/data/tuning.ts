// All feel-related numbers live here. Units: pixels, seconds, radians.
// World y points DOWN (screen space). 16 px = 1 m for HUD readouts.
// See docs/vault-physics.md for what each value does to the feel.

export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;
/** Longest real time one frame may feed into the simulation (tab suspension guard). */
export const MAX_FRAME_TIME = 0.25;

export const VIEW_WIDTH = 480;
export const VIEW_HEIGHT = 270;
export const TILE = 16;
export const PX_PER_METRE = 16;

export const body = {
  width: 10,
  height: 26,
  /** Height of the pole grip (hands, roughly head height) above the feet. */
  gripHeight: 22,
  /** Collision box while on the pole, measured from the grip (legs swing free). */
  vaultBoxAbove: 4,
  vaultBoxBelow: 10,
};

export const run = {
  maxSpeed: 360,
  /** Acceleration at standstill; tapers linearly to accelAtMax at top speed (~2.3 s to max). */
  accelFromRest: 300,
  accelAtMax: 70,
  /** Slowing down when no direction is held. */
  groundFriction: 900,
  /** Braking when the held direction opposes current motion. */
  turnDecel: 1600,
  /** Above maxSpeed (e.g. after a vault landing) speed bleeds at this rate. */
  overspeedDecay: 400,
  airAccel: 220,
  airDrag: 0,
  /** Distance travelled per footstep sound. */
  strideLength: 22,
};

export const gravity = {
  g: 700,
  maxFall: 520,
};

export const hop = {
  speed: 160,
  /** Releasing hop early multiplies upward speed by this (variable hop height). */
  cutMultiplier: 0.45,
  coyoteTime: 0.08,
  bufferTime: 0.1,
};

export const pole = {
  length: 76,
  /** How fast the arrow keys swing the carried pole (rad/s). */
  aimSpeed: 10,
  /** Neutral carry angle above horizontal when no arrow is held. */
  carryElevation: Math.PI / 3,
  /** Down only plants if the pole is within this angle of horizontal. */
  plantAimTolerance: (35 * Math.PI) / 180,
  /** How fast the tip drops toward the ground after pressing Down (rad/s). */
  plantSwingSpeed: 14,
  /** Fraction of horizontal run speed converted into swing speed at plant. */
  plantEfficiency: 0.92,
  /** Seconds after leaving the pole before it can be planted again. */
  recoverTime: 0.25,

  // --- Bend (spring along the chord; Down held = latched, can't straighten) ---
  /** Spring constant per unit mass (1/s^2). Higher = stiffer pole, faster bend and recoil. */
  stiffness: 160,
  /** Maximum chord shortening (px) — the bend limit; inward speed beyond it is lost. */
  maxCompression: 30,
  /** While held, the bowed pole unbends at this rate (1/s), turning stored energy into forward swing. */
  drive: 1.5,
  /** Spring is this much stiffer once released: the vaulter's own push-off (>1 adds energy). */
  returnEfficiency: 1.35,

  // --- Over-bend: holding too long bleeds energy instead of breaking the pole ---
  /** Bleeding starts once the chord leans this far past vertical while held... */
  bleedAngle: (12 * Math.PI) / 180,
  /** ...or after the bend has stopped growing for this long. */
  bleedDelay: 0.35,
  /** Stored energy decays as exp(-bleedRate * t) while bleeding. */
  bleedRate: 6,
  /** Past this lean the pole tips over and the vaulter is let go automatically. */
  autoReleaseAngle: (65 * Math.PI) / 180,

  // --- Launch-quality feedback (does not change the physics) ---
  /** Forward speed at launch below which quality is scaled down (an up-and-back launch is not a good vault). */
  qualityForwardSpeed: 90,
  perfectThreshold: 0.8,
};

export const camera = {
  /** Fraction of the gap to the target closed per second (exponential smoothing). */
  followRate: 6,
  /** Look ahead of the player by this many seconds of horizontal speed. */
  lookAheadTime: 0.35,
  lookAheadMax: 110,
  /** Vertical framing: player sits this far below screen centre. */
  verticalOffset: 30,
  verticalFollowRate: 4,
};
