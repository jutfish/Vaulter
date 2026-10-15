/**
 * The podium cutscene: after clearing the competition bar, gold, "now what???",
 * and a look up at the moon. Times in seconds from the start; positions in set
 * px (one set px = `zoom` screen px), with y = 0 the ground the podium stands
 * on and x = 0 the middle of the top step. Short (~9 s) and any key skips.
 */
export const podium = {
  /** Screen px per set px: very zoomed in, still pixel-crisp. */
  zoom: 4,
  /** Each fade: the world to black, black to the podium (and the same back). */
  fade: 0.3,
  /** Total length, including the fade back into the world. */
  end: 9,
  /** The top of each step: 1st in the middle, 2nd to the left, 3rd to the right. */
  steps: { first: { x: 0, y: -22 }, second: { x: -19, y: -14 }, third: { x: 19, y: -10 } },
  /** The little man walks in from the right to just in front of the top step... */
  walkIn: { from: 0.6, to: 2.0, x0: 92, x1: 6 },
  /** ...hops up to hang the medal round the champion's neck (it changes hands at the top)... */
  hop: { from: 2.05, to: 2.5, height: 24 },
  /** ...and walks off again. */
  walkOff: { from: 2.75, to: 3.7, x1: 96 },
  /** Seconds per walking frame. */
  stepTime: 0.12,
  /** The crowd goes wild (camera flashes) from the medal to here. */
  cheerUntil: 4.0,
  /** The speech bubble, typed out at `rate` letters a second. */
  say: { from: 3.8, to: 5.4, text: 'NOW WHAT???', rate: 14 },
  /** He loses his purpose... */
  sad: 4.9,
  /** ...and looks up. Then the camera tilts up to the moon. */
  lookUp: 6.0,
  tilt: { from: 6.2, to: 7.5 },
  /** Camera centre on the podium, and on the moon (the champion's head at the bottom of the shot). */
  camera: { podium: { x: 0, y: -31 }, moon: { x: 16, y: -72 } },
  /** Where the moon hangs in the set (centre); a sliver of it shows at the top right of the podium shot. */
  moon: { x: 46, y: -84 },
} as const;
