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
  gripHeight: 20,
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
  /** Grip-to-tip vaulting length with the hands fully back (hands at grip.vault). */
  length: 76,
  /** Butt-to-tip length of the whole pole. */
  totalLength: 80,
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

/** How the vaulter holds and carries the pole (v3: the pole is its own body, held by the hands). */
export const carry = {
  // --- Hands: hand-over-hand along the whole pole. Positions are px from end 0. ---
  /** Hands' midpoint, measured from the far end, when extending the pole (a direction held). Lead length = totalLength - this. */
  gripVault: 4,
  /** Hands' midpoint, measured from the far end, in a relaxed carry (no direction held). */
  gripCarry: 20,
  /** Distance between the two hands. */
  handGap: 7,
  /** Seconds for one hand to let go, pass the other hand and re-grip. */
  handMoveTime: 0.09,
  /** Pause between hand moves. */
  handMovePause: 0.02,
  /** Once within a hand-gap of the target, the pole slides through both hands at this speed (px/s). */
  slideSpeed: 40,

  // --- Input: a direction means "point the long (lead) end this way". ---
  /** Directions within this angle of the last commanded lead direction rotate the pole there
   *  (so rolling Right, Up, Left arcs it over the top). Further away, the other end becomes the
   *  lead and the hands work along the pole to it (Right straight to Left). */
  leadFlipAngle: (102 * Math.PI) / 180,

  // --- The hands' hold on the pole body (poleBody.ts). ---
  /** Linear grip spring: natural frequency (rad/s) and damping ratio. */
  handOmega: 40,
  handDampingRatio: 0.9,
  /** Max force the hands can apply (px/s^2 on the pole); jolts beyond it overpower the grip. */
  handForceCap: 30000,
  /** Max torque the arms can apply (px^2/s^2). Holding the pole level from one end needs
   *  (totalLength/2 - gripVault) * g = 25200, ~42% of this; the rest is for swinging it. */
  armTorque: 60000,
  /** Close to the target the arms turn the pole at rotOmega x (angle error) rad/s; further away,
   *  as fast as they can still brake from in time. */
  rotOmega: 14,
  /** How firmly the arms hold the turn speed they want (1/s). */
  rotVelocityGain: 30,
  /** How much a hand mid-move weakens the hold (0..1). */
  moveWeakening: 0.25,
  /** Arms' strength multiplier during the plant drop (a committed, explosive move). */
  plantStrength: 2.5,
  // --- The pole against the level (carry only; the plant drop ignores it). ---
  /** Bounciness of the pole off surfaces (0..1). */
  poleBounce: 0.25,
  /** Friction coefficient of the pole on surfaces: high = the tip digs in and drags. */
  poleFriction: 0.8,
  /** Fraction of a penetration corrected per substep (via velocity). */
  contactBias: 0.3,
  /** Shoved along its length harder than the grip can hold, the pole slides through the hands
   *  once the hands lag the pole by more than this (px). */
  slipStretch: 5,
  /** On the ground, pole pushes on the vaulter smaller than this (px/s^2) are absorbed by the feet. */
  footHold: 120,
  /** Pole mass / vaulter mass: how much the pole pushes the vaulter around (swings, drags, jams). */
  poleMassRatio: 0.06,

  // --- Lean: the pole's weight out front gradually tips the body forward. ---
  /** Max forward lean from the pole's weight (rad) when held horizontal with the hands at the butt. */
  leanFromPole: 0.16,
  /** Forward lean from running at top speed (rad). */
  leanFromSpeed: 0.06,
  /** Lean spring: natural frequency (rad/s) and damping ratio. Low = slow, weighty, a little sway. */
  leanOmega: 3.2,
  leanDamping: 0.55,

  // --- Running bob: the hands rise and fall with each stride, shaking the pole. ---
  /** Vertical bob of the shoulders at top speed (px). */
  bobAtMaxSpeed: 2.6,
  /** Bob when jogging slowly (px); scales up toward bobAtMaxSpeed. */
  bobAtLowSpeed: 1.0,
  /** How quickly the shoulders follow the bob curve (1/s); high = sharp foot-strike jolts. */
  bobFollowRate: 45,
  /** Hand position forward of the body centre (px) and grip height above the feet. */
  handForward: 6,
};

/** The carried pole as a flexible beam (visual + feel; vault physics uses the rigid line). */
export const beam = {
  /** Number of simulated points along the pole. */
  nodes: 17,
  /** Tip wobble frequency (Hz) for the overhang with the hands fully back. Lower = wobblier. */
  tipFrequency: 3.5,
  /** Velocity damping (1/s): how fast the wobble dies down. */
  damping: 3.2,
  /** Extra damping of sharp kinks (s); smooths out jagged high-frequency ripples. */
  kinkDamping: 0.00002,
  /** Hand grip stiffness (1/s^2): hands are strong springs, not rigid pins. */
  handStiffness: 2000000,
  handDamping: 2500,
  /** Caps on frame accelerations fed into the beam (px/s^2, rad/s^2) to avoid one-tick spikes. */
  maxFrameAccel: 9000,
  maxAngularAccel: 110,
  /** Speed (px/s) of the twang the pole gets when the vaulter leaves it. */
  launchTwang: 260,
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
