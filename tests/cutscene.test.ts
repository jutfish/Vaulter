import { describe, expect, it } from 'vitest';
import { podium } from '../src/data/cutscene';
import { buildLongRun, longRunMarks as m } from '../src/data/levels';
import { SIM_DT, TILE } from '../src/data/tuning';
import type { Action } from '../src/gameplay/input';
import { World } from '../src/gameplay/world';
import { Cutscene, MEDAL_TIME, podiumDue, samplePodium, type CutsceneCue } from '../src/scenes/cutscene';
import { frameFor } from './helpers/sim';

/** Plays the whole cutscene in 1/60 s frames, collecting what it shows and the cues it fires. */
function playThrough(): { frames: ReturnType<typeof samplePodium>[]; cues: CutsceneCue[]; seconds: number } {
  const c = new Cutscene();
  const frames = [c.frame()];
  const cues: CutsceneCue[] = [];
  let seconds = 0;
  while (!c.done) {
    cues.push(...c.update(1 / 60));
    frames.push(c.frame());
    seconds += 1 / 60;
  }
  return { frames, cues, seconds };
}

describe('the podium cutscene', () => {
  it('is short: about 8-10 s', () => {
    const { seconds } = playThrough();
    expect(seconds).toBeGreaterThanOrEqual(8);
    expect(seconds).toBeLessThanOrEqual(10);
  });

  it('fades out of the world, onto the podium, and back into the world', () => {
    expect(samplePodium(0)).toMatchObject({ fade: 0, showSet: false });
    expect(samplePodium(podium.fade - 0.001).fade).toBeGreaterThan(0.99);
    expect(samplePodium(podium.fade + 0.001)).toMatchObject({ showSet: true });
    expect(samplePodium(3)).toMatchObject({ fade: 0, showSet: true });
    expect(samplePodium(podium.end - podium.fade + 0.001)).toMatchObject({ showSet: false });
    expect(samplePodium(podium.end).fade).toBe(0);
  });

  it('plays the beats in order: medal, wave, "now what???", sad, look up, tilt to the moon', () => {
    const { frames, cues } = playThrough();
    const poses = frames.map((f) => f.hero).filter((p, i, a) => i === 0 || a[i - 1] !== p);
    expect(poses).toEqual(['stand', 'wave', 'stand', 'sad', 'lookUp']);
    expect(cues.filter((c) => c === 'medal')).toHaveLength(1);
    expect(cues.filter((c) => c === 'letter')).toHaveLength(podium.say.text.length);
    expect(cues.indexOf('medal')).toBeLessThan(cues.indexOf('letter'));
    expect(cues[cues.length - 1]).toBe('lookUp');
    expect(frames.some((f) => f.bubble === 'NOW WHAT???')).toBe(true);
    // The bubble's gone before he looks up; the camera only tilts after he does.
    const lookUp = frames.find((f) => f.hero === 'lookUp')!;
    expect(lookUp.bubble).toBeNull();
    expect(lookUp.camera).toEqual(podium.camera.podium);
    expect(frames[frames.length - 1]!.camera).toEqual(podium.camera.moon);
  });

  it('the little man walks to his mark, hops to hand over the medal at the top, and walks off', () => {
    const before = samplePodium(podium.walkIn.from - 0.01).official;
    const there = samplePodium(podium.walkIn.to + 0.01).official;
    const top = samplePodium(MEDAL_TIME).official;
    const gone = samplePodium(podium.walkOff.to + 0.1).official;
    expect(before.x).toBe(podium.walkIn.x0);
    expect(there).toMatchObject({ x: podium.walkIn.x1, y: 0, facing: -1 });
    expect(top.y).toBeCloseTo(-podium.hop.height);
    expect(top.frame).toBe('reach');
    expect(samplePodium(MEDAL_TIME - 0.01).medal).toBe('official');
    expect(samplePodium(MEDAL_TIME + 0.01).medal).toBe('hero');
    expect(gone).toMatchObject({ x: podium.walkOff.x1, facing: 1, frame: 'stand' });
    // Off screen at both ends (half the view's width, plus a frame).
    expect(Math.abs(before.x - podium.camera.podium.x)).toBeGreaterThan(480 / podium.zoom / 2 + 8);
    expect(Math.abs(gone.x - podium.camera.podium.x)).toBeGreaterThan(480 / podium.zoom / 2 + 8);
  });

  it('a skip goes straight to black, hands the world back and finishes with a fade', () => {
    const c = new Cutscene();
    c.update(2);
    expect(c.holdsWorld).toBe(true);
    c.skip();
    expect(c.holdsWorld).toBe(false);
    expect(c.done).toBe(false);
    expect(c.frame()).toMatchObject({ fade: 1, showSet: false });
    // Nothing skipped fires its cue.
    const cues = c.update(1);
    expect(cues).toEqual([]);
    expect(c.done).toBe(true);
  });

  it('the first time it plays it cannot be skipped at all', () => {
    const c = new Cutscene(false);
    c.update(podium.skipAfter + 1);
    expect(c.skip()).toBe(false);
    c.update(podium.end);
    expect(c.done).toBe(true);
  });

  it("keys still pressed from the landing can't skip it before it's been seen", () => {
    const c = new Cutscene();
    c.update(0.05);
    expect(c.skip()).toBe(false);
    c.update(podium.skipAfter - 0.1);
    expect(c.skip()).toBe(false);
    expect(c.holdsWorld).toBe(true);
    c.update(0.1);
    expect(c.skip()).toBe(true);
    expect(c.holdsWorld).toBe(false);
  });

  it('is due when the champion lands after clearing the bar, not before', () => {
    const world = new World(buildLongRun());
    const atX = (m.barCol + 1) * TILE - 120;
    let prev = new Set<Action>();
    let plantT = -1;
    let dueWhileUp = false;
    let dueAt: number | null = null;
    for (let t = 0; t < 10 && dueAt === null; t += SIM_DT) {
      const p = world.player;
      const now = new Set<Action>(['right', 'aimRight']);
      if (p.x >= atX && (plantT < 0 || t - plantT < 0.5)) now.add('aimDown');
      world.step(frameFor(now, prev), SIM_DT);
      prev = now;
      if (world.events.some((e) => e.type === 'plant')) plantT = t;
      if (world.bar !== 'cleared' && podiumDue(world)) dueWhileUp = true;
      if (podiumDue(world)) dueAt = t;
    }
    expect(dueWhileUp).toBe(false);
    expect(world.bar).toBe('cleared');
    expect(dueAt).not.toBeNull();
    expect(world.player.grounded).toBe(true);
    expect(world.player.x).toBeGreaterThan(m.barCol * TILE);
  });
});
