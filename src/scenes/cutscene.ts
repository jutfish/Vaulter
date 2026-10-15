import { podium } from '../data/cutscene';
import type { World } from '../gameplay/world';

// The podium cutscene's sequencing: what's on screen at time t, and the cues
// (sounds) it passes. Pure (no Pixi, DOM or audio) so it's testable; drawn by
// rendering/PodiumView.ts and run by GameScene.

export type HeroPose = 'stand' | 'wave' | 'sad' | 'lookUp';
export type OfficialFrame = 'stand' | 'walk1' | 'walk2' | 'reach';
export type CutsceneCue = 'medal' | 'letter' | 'lookUp';

export interface PodiumFrame {
  /** Black over everything, 0..1. */
  fade: number;
  /** The podium set is on screen (otherwise the world is). */
  showSet: boolean;
  /** Camera centre in set px. */
  camera: { x: number; y: number };
  hero: HeroPose;
  official: { x: number; y: number; facing: 1 | -1; frame: OfficialFrame };
  /** Who has the gold medal. */
  medal: 'official' | 'hero';
  /** The crowd is cheering (camera flashes everywhere). */
  cheer: boolean;
  /** The speech bubble's text so far (typed out), or null. */
  bubble: string | null;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** When the medal changes hands: the top of the little man's hop. */
export const MEDAL_TIME = (podium.hop.from + podium.hop.to) / 2;

/** The cutscene's fade: world to black, black to set, ..., set to black, black to world. */
function fadeAt(t: number): { fade: number; showSet: boolean } {
  const f = podium.fade;
  const end = podium.end;
  if (t < f) return { fade: clamp01(t / f), showSet: false };
  if (t < 2 * f) return { fade: 1 - (t - f) / f, showSet: true };
  if (t < end - 2 * f) return { fade: 0, showSet: true };
  if (t < end - f) return { fade: (t - (end - 2 * f)) / f, showSet: true };
  return { fade: clamp01(1 - (t - (end - f)) / f), showSet: false };
}

function walkFrame(t: number): OfficialFrame {
  return (['walk1', 'stand', 'walk2', 'stand'] as const)[Math.floor(t / podium.stepTime) % 4]!;
}

function officialAt(t: number): PodiumFrame['official'] {
  const { walkIn, hop, walkOff } = podium;
  if (t < walkIn.to) {
    const k = clamp01((t - walkIn.from) / (walkIn.to - walkIn.from));
    return { x: lerp(walkIn.x0, walkIn.x1, k), y: 0, facing: -1, frame: t < walkIn.from ? 'stand' : walkFrame(t) };
  }
  if (t < hop.from) return { x: walkIn.x1, y: 0, facing: -1, frame: 'stand' };
  if (t < hop.to) {
    const k = (t - hop.from) / (hop.to - hop.from);
    return { x: walkIn.x1, y: -4 * hop.height * k * (1 - k), facing: -1, frame: 'reach' };
  }
  if (t < walkOff.from) return { x: walkIn.x1, y: 0, facing: -1, frame: 'stand' };
  const k = clamp01((t - walkOff.from) / (walkOff.to - walkOff.from));
  return { x: lerp(walkIn.x1, walkOff.x1, k), y: 0, facing: 1, frame: k < 1 ? walkFrame(t) : 'stand' };
}

function heroAt(t: number): HeroPose {
  if (t >= podium.lookUp) return 'lookUp';
  if (t >= podium.sad) return 'sad';
  if (t >= MEDAL_TIME && t < podium.say.from) return 'wave';
  return 'stand';
}

/** Letters of the speech bubble showing at t (0 before and after it). */
function lettersAt(t: number): number {
  const s = podium.say;
  if (t < s.from || t >= s.to) return 0;
  return Math.min(s.text.length, Math.floor((t - s.from) * s.rate) + 1);
}

/** Everything on screen at time t. */
export function samplePodium(t: number): PodiumFrame {
  const { camera, tilt } = podium;
  const k = smooth(clamp01((t - tilt.from) / (tilt.to - tilt.from)));
  const n = lettersAt(t);
  return {
    ...fadeAt(t),
    camera: { x: lerp(camera.podium.x, camera.moon.x, k), y: lerp(camera.podium.y, camera.moon.y, k) },
    hero: heroAt(t),
    official: officialAt(t),
    medal: t < MEDAL_TIME ? 'official' : 'hero',
    cheer: t >= MEDAL_TIME && t < podium.cheerUntil,
    bubble: n > 0 ? podium.say.text.slice(0, n) : null,
  };
}

/** Is it time for the podium? The bar's been cleared and the champion is back on the ground. */
export function podiumDue(world: World): boolean {
  return world.bar === 'cleared' && world.player.grounded && !world.player.vault;
}

/** Plays the podium cutscene: advance it with real time, skip it with any key. */
export class Cutscene {
  t = 0;

  /** @param skippable False the first time it's ever played: it's the story, watch it once. */
  constructor(readonly skippable = true) {}

  /** The world stays frozen until the fade back into it starts (control returns as it fades in). */
  get holdsWorld(): boolean {
    return this.t < podium.end - podium.fade;
  }

  get done(): boolean {
    return this.t >= podium.end;
  }

  /** Advances by dt; returns the cues passed on the way (in order). */
  update(dt: number): CutsceneCue[] {
    const t0 = this.t;
    const t1 = Math.min(podium.end, t0 + dt);
    this.t = t1;
    const cues: CutsceneCue[] = [];
    const passed = (at: number) => at > t0 && at <= t1;
    if (passed(MEDAL_TIME)) cues.push('medal');
    for (let i = lettersAt(t0); i < lettersAt(t1); i++) cues.push('letter');
    if (passed(podium.lookUp)) cues.push('lookUp');
    return cues;
  }

  /** Straight to black, then fade back into the world. Not in the first moments (see `skipAfter`). */
  skip(): boolean {
    if (!this.skippable || this.t < podium.skipAfter) return false;
    this.t = Math.max(this.t, podium.end - podium.fade);
    return true;
  }

  frame(): PodiumFrame {
    return samplePodium(this.t);
  }
}
