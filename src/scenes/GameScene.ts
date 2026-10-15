import type { Renderer } from 'pixi.js';
import { FixedStepLoop } from '../app/loop';
import type { AudioEngine } from '../audio/AudioEngine';
import { longRunHints, longRunWritings, lostPoleHint, winWriting } from '../data/hints';
import { buildLongRun } from '../data/levels';
import { MAX_FRAME_TIME, poleTiers, run, SIM_DT } from '../data/tuning';
import { HintTracker } from '../gameplay/hints';
import type { InputState } from '../gameplay/input';
import type { GameEvent } from '../gameplay/player';
import { World } from '../gameplay/world';
import type { PixelStage } from '../rendering/PixelStage';
import { PodiumView } from '../rendering/PodiumView';
import type { SpriteSet } from '../rendering/sprites';
import { WorldView } from '../rendering/WorldView';
import type { Progress } from '../saves/schemas';
import type { SaveSlot } from '../saves/storage';
import type { DevOverlay } from '../ui/DevOverlay';
import type { Hud } from '../ui/Hud';
import { Cutscene, podiumDue, type CutsceneCue } from './cutscene';

export interface GameSceneDeps {
  renderer: Renderer;
  stage: PixelStage;
  sprites: SpriteSet;
  audio: AudioEngine;
  input: InputState;
  progress: SaveSlot<Progress>;
  hud: Hud;
  dev: DevOverlay;
}

/** The playable scene: fixed-step simulation + interpolated rendering + feedback. */
export class GameScene {
  readonly world: World;
  readonly view: WorldView;
  private readonly loop = new FixedStepLoop(SIM_DT, MAX_FRAME_TIME);
  private lastSteps = 0;
  /** Time until the next pole-hit sound may play (scrapes would otherwise fire every tick). */
  private poleHitCooldown = 0;
  private saveWarned = false;
  private lastCount: number | null = null;
  private readonly levelId = 'long-run';
  /** Stuck timers and carved hints: kept across restarts (the land remembers). */
  readonly hints: HintTracker;
  /** The podium cutscene while it plays; it plays once per run (a restart arms it again). */
  private cutscene: Cutscene | null = null;
  private podiumPlayed = false;
  private readonly podium: PodiumView;

  constructor(private readonly d: GameSceneDeps) {
    this.world = new World(buildLongRun());
    this.view = new WorldView(d.renderer, this.world, d.sprites);
    this.hints = new HintTracker(this.world.level, longRunHints, lostPoleHint, [...longRunWritings, winWriting]);
    for (const w of longRunWritings) this.view.carve(w, true);
    this.podium = new PodiumView(d.sprites);
    d.stage.world.addChild(this.view.root, this.podium.root);
    d.hud.show(true);
    d.hud.setBanner(null);
  }

  /** The cutscene has the screen and the world is frozen (any key skips it). */
  get inCutscene(): boolean {
    return this.cutscene !== null && this.cutscene.holdsWorld;
  }

  skipCutscene(): void {
    this.cutscene?.skip();
  }

  /** Dev: where the cutscene is (null when none is playing). */
  cutsceneTime(): number | null {
    return this.cutscene?.t ?? null;
  }

  frame(realDt: number, paused: boolean): void {
    if (!paused && this.cutscene) this.stepCutscene(Math.min(realDt, MAX_FRAME_TIME));
    if (!paused && !this.inCutscene) {
      this.lastSteps = this.loop.advance(realDt);
      for (let i = 0; i < this.lastSteps; i++) {
        this.world.step(this.d.input.consume(), SIM_DT);
        this.view.onStep(SIM_DT, this.world.events);
        if (!this.world.cleared) {
          for (const h of this.hints.update(this.world.player, SIM_DT)) {
            this.view.carve(h);
            this.d.audio.play('plant', { volume: 0.35, rate: 0.6 });
          }
        }
        this.handleEvents(this.world.events);
        if (!this.podiumPlayed && podiumDue(this.world)) {
          this.startCutscene();
          break;
        }
      }
    }
    this.tickCount();
    const frozen = paused || this.inCutscene;
    this.view.render(frozen ? 1 : this.loop.alpha, frozen ? 0 : realDt);
    this.podium.render(this.cutscene?.frame() ?? null, paused ? 0 : realDt);
    this.d.stage.renderWorld();
    this.d.hud.update(this.world, this.d.progress.value.bestHeight, realDt);
    this.d.dev.update(performance.now(), this.lastSteps, this.world);
  }

  /** A knock on each second of the lost-pole count. */
  private tickCount(): void {
    const c = this.world.poleCountdown;
    const n = c === null ? null : Math.max(1, Math.ceil(c));
    if (n !== null && n !== this.lastCount) this.d.audio.play('bonk', { volume: 0.45, rate: n <= 3 ? 1.5 : 1.2 });
    this.lastCount = n;
  }

  private startCutscene(): void {
    this.podiumPlayed = true;
    this.cutscene = new Cutscene(this.d.progress.value.seenPodium);
    this.d.hud.show(false);
  }

  private stepCutscene(dt: number): void {
    const c = this.cutscene!;
    for (const cue of c.update(dt)) this.playCue(cue);
    // Keys pressed during the cutscene don't carry into the game (held ones still do).
    if (c.holdsWorld) this.d.input.consume();
    else this.d.hud.show(true);
    if (c.done) {
      this.cutscene = null;
      if (!this.d.progress.value.seenPodium) {
        this.d.progress.value = { ...this.d.progress.value, seenPodium: true };
        this.save();
      }
    }
  }

  private playCue(cue: CutsceneCue): void {
    const audio = this.d.audio;
    switch (cue) {
      case 'medal':
        audio.play('perfect', { volume: 0.6 });
        audio.play('crowd_cheer', { volume: 0.7 });
        break;
      case 'letter':
        audio.play('step', { volume: 0.3, rate: 2.4 + Math.random() * 0.3 });
        break;
      case 'lookUp':
        audio.play('bend', { volume: 0.35, rate: 0.6 });
        break;
    }
  }

  restart(): void {
    this.cutscene = null;
    this.podiumPlayed = false;
    this.d.hud.show(true);
    this.world.reset();
    this.view.resetView();
    this.loop.reset();
    this.d.input.consume();
    this.d.hud.setBanner(null);
  }

  /** Cheat: on to just past the obstacle you're at. */
  skip(): void {
    if (this.inCutscene) {
      this.skipCutscene();
      return;
    }
    if (!this.world.skipObstacle()) {
      this.d.hud.toast('Nothing left to skip', 0.8);
      return;
    }
    this.view.resetView();
    this.loop.reset();
    this.d.input.consume();
    this.d.audio.play('ui_click', { volume: 0.6 });
    this.d.hud.toast('SKIPPED', 0.6);
  }

  /** Drop accumulated time (after a pause or tab switch) so nothing jumps. */
  resetClock(): void {
    this.loop.reset();
  }

  destroy(): void {
    this.view.root.destroy({ children: true });
    this.podium.destroy();
    this.d.hud.show(false);
  }

  private handleEvents(events: readonly GameEvent[]): void {
    const audio = this.d.audio;
    const p = this.world.player;
    this.poleHitCooldown = Math.max(0, this.poleHitCooldown - SIM_DT);
    for (const e of events) {
      switch (e.type) {
        case 'drop':
          audio.play(e.reason === 'letGo' ? 'ui_click' : 'bonk', { volume: 0.7 });
          if (e.reason !== 'letGo') this.d.hud.toast(e.reason === 'bonk' ? 'Knocked off the pole!' : 'Lost the pole!', 1.0);
          break;
        case 'pickup':
          audio.play('plant', { volume: 0.5, rate: 1.4 });
          break;
        case 'newPole': {
          audio.play('plant', { volume: 0.7, rate: 1.2 });
          this.d.hud.toast(`${poleTiers[e.tier]!.name.toUpperCase()} POLE`, 1.2);
          break;
        }
        case 'poleHit':
          if (this.poleHitCooldown > 0) break;
          this.poleHitCooldown = e.floor ? 0.09 : 0.15;
          if (e.floor) audio.play('step', { volume: Math.min(0.6, e.strength / 400), rate: 1.6 + Math.random() * 0.3 });
          else audio.play('plant', { volume: Math.min(0.8, e.strength / 300), rate: 1.3 });
          break;
        case 'step':
          audio.play('step', { volume: 0.25 + 0.35 * Math.min(1, Math.abs(p.vx) / run.maxSpeed), rate: 0.9 + Math.random() * 0.2 });
          break;
        case 'hop':
          audio.play('hop', { volume: 0.6 });
          break;
        case 'plant':
          audio.play('plant');
          audio.play('bend', { volume: 0.7 });
          break;
        case 'stab':
        case 'bonk':
          audio.play('bonk');
          break;
        case 'release':
          audio.play('release', { volume: 0.9 });
          break;
        case 'launch':
          if (e.perfect) {
            audio.play('perfect', { volume: 0.7 });
            this.d.hud.toast('PERFECT!');
          } else if (e.tipped) {
            this.d.hud.toast('Held too long', 0.8);
          } else if (e.quality > 0.5) {
            this.d.hud.toast('Good', 0.6);
          }
          break;
        case 'barKnocked':
          audio.play('bonk', { volume: 0.4, rate: 1.6 });
          audio.play('crowd_ahh', { volume: 0.9 });
          break;
        case 'barCleared':
          audio.play('crowd_cheer', { volume: 0.9 });
          break;
        case 'fellBack':
          this.d.hud.toast('Not enough speed', 0.8);
          break;
        case 'land':
          audio.play('land', { volume: Math.min(1, 0.3 + e.speed / 500) });
          this.recordVault();
          break;
        default:
          break;
      }
    }
    if (this.world.cleared && this.world.clearTime === this.world.time) this.onCleared();
  }

  private recordVault(): void {
    const v = this.world.lastVault;
    const prog = this.d.progress;
    if (!v || v.height <= prog.value.bestHeight) return;
    prog.value = { ...prog.value, bestHeight: v.height };
    this.save();
  }

  private onCleared(): void {
    this.view.carve(winWriting);
    const t = this.world.clearTime;
    const prog = this.d.progress;
    const prev = prog.value.levels[this.levelId];
    const best = prev?.bestTime == null ? t : Math.min(prev.bestTime, t);
    prog.value = { ...prog.value, levels: { ...prog.value.levels, [this.levelId]: { cleared: true, bestTime: best } } };
    const saved = this.save();
    this.d.hud.setBanner(`CLEARED in ${t.toFixed(2)} s  (best ${best.toFixed(2)} s)${saved ? '' : ' - not saved'}  ·  R to retry`);
  }

  private save(): boolean {
    const result = this.d.progress.save();
    if (!result.ok && !this.saveWarned) {
      this.saveWarned = true;
      this.d.hud.toast('Progress not saved', 1.5);
      console.warn('[save]', result.reason);
    }
    return result.ok;
  }
}
