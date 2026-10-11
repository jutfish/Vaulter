import type { Renderer } from 'pixi.js';
import { FixedStepLoop } from '../app/loop';
import type { AudioEngine } from '../audio/AudioEngine';
import { buildFlatLevel, firstWall } from '../data/levels';
import { MAX_FRAME_TIME, run, SIM_DT } from '../data/tuning';
import type { InputState } from '../gameplay/input';
import type { GameEvent } from '../gameplay/player';
import { World } from '../gameplay/world';
import type { PixelStage } from '../rendering/PixelStage';
import type { SpriteSet } from '../rendering/sprites';
import { WorldView } from '../rendering/WorldView';
import type { Progress } from '../saves/schemas';
import type { SaveSlot } from '../saves/storage';
import type { DevOverlay } from '../ui/DevOverlay';
import type { Hud } from '../ui/Hud';

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
  private readonly levelId = 'first-wall';

  constructor(private readonly d: GameSceneDeps) {
    this.world = new World(buildFlatLevel(firstWall));
    this.view = new WorldView(d.renderer, this.world, d.sprites);
    d.stage.world.addChild(this.view.root);
    d.hud.show(true);
    d.hud.setBanner(null);
  }

  frame(realDt: number, paused: boolean): void {
    if (!paused) {
      this.lastSteps = this.loop.advance(realDt);
      for (let i = 0; i < this.lastSteps; i++) {
        this.world.step(this.d.input.consume(), SIM_DT);
        this.view.onStep(SIM_DT, this.world.events);
        this.handleEvents(this.world.events);
      }
    }
    this.view.render(paused ? 1 : this.loop.alpha, paused ? 0 : realDt);
    this.d.stage.renderWorld();
    this.d.hud.update(this.world, this.d.progress.value.bestHeight, realDt);
    this.d.dev.update(performance.now(), this.lastSteps, this.world);
  }

  restart(): void {
    this.world.reset();
    this.view.resetView();
    this.loop.reset();
    this.d.input.consume();
    this.d.hud.setBanner(null);
  }

  /** Drop accumulated time (after a pause or tab switch) so nothing jumps. */
  resetClock(): void {
    this.loop.reset();
  }

  destroy(): void {
    this.view.root.destroy({ children: true });
    this.d.hud.show(false);
  }

  private handleEvents(events: readonly GameEvent[]): void {
    const audio = this.d.audio;
    const p = this.world.player;
    this.poleHitCooldown = Math.max(0, this.poleHitCooldown - SIM_DT);
    for (const e of events) {
      switch (e.type) {
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
