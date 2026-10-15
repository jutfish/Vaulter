import { Application, Rectangle } from 'pixi.js';
import { AudioEngine } from '../audio/AudioEngine';
import { SIM_DT, TILE, VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import { longRunHints, winWriting } from '../data/hints';
import { resetPoleToHands } from '../gameplay/carry';
import { InputState, type Action } from '../gameplay/input';
import { PixelStage } from '../rendering/PixelStage';
import { GameScene } from '../scenes/GameScene';
import { runLoadingScene, type LoadedAssets } from '../scenes/LoadingScene';
import { progressSchema, settingsSchema } from '../saves/schemas';
import { probeLocalStorage, SaveSlot } from '../saves/storage';
import { DevOverlay } from '../ui/DevOverlay';
import { bindActions, el, showScreen, type ScreenId } from '../ui/dom';
import { Hud } from '../ui/Hud';
import { SettingsPanel } from '../ui/SettingsPanel';
import { COMMAND_KEYS, Keyboard, type Command } from './keyboard';

/** Keys that keep their usual job during a cutscene (every other key skips it). */
const CUTSCENE_PASS: ReadonlySet<Command> = new Set(['pause', 'restart', 'mute', 'devOverlay']);

type Mode = 'menu' | 'loading' | 'playing' | 'paused';

/** Startup, scene transitions, focus handling and the per-frame driver. */
export class App {
  private readonly pixi = new Application();
  private stage!: PixelStage;
  private readonly audio = new AudioEngine();
  private readonly input = new InputState();
  private readonly store = probeLocalStorage();
  private readonly settings = new SaveSlot(settingsSchema, this.store);
  private readonly progress = new SaveSlot(progressSchema, this.store);
  private readonly hud = new Hud();
  private readonly dev = new DevOverlay();
  private readonly settingsPanel = new SettingsPanel(this.settings, this.audio, (s) => this.hud.setMuted(s.muted));
  private readonly base = import.meta.env.BASE_URL;
  private mode: Mode = 'menu';
  /** Screen to return to when leaving the settings screen. */
  private settingsReturn: ScreenId | null = 'menu';
  private assets: LoadedAssets | null = null;
  private game: GameScene | null = null;
  private lastFrame = performance.now();
  /** Dev hook in control: animation frames render but don't simulate. */
  private devManual = false;

  async start(): Promise<void> {
    await this.pixi.init({
      antialias: false,
      resolution: 1,
      autoDensity: false,
      background: 0x101018,
      preference: 'webgl',
    });
    el('#game').appendChild(this.pixi.canvas);
    this.stage = new PixelStage(this.pixi);
    window.addEventListener('resize', () => this.stage.resize());

    new Keyboard(
      this.input,
      (c) => this.onCommand(c),
      (code) => this.skipCutsceneKey(code),
    );
    this.bindScreens();
    this.watchFocus();
    this.hud.setMuted(this.settings.value.muted);
    if (!this.store) {
      const n = el('[data-role="storage-notice"]');
      n.hidden = false;
      n.textContent = 'Browser storage is unavailable: settings and progress will not be saved this session.';
    }
    // Any first key press also unlocks audio (browsers require a gesture).
    window.addEventListener('keydown', () => void this.audio.unlock(), { once: true });

    this.pixi.ticker.add(() => this.frame());
    this.toMenu();
    if (import.meta.env.DEV) this.installDevHook();
  }

  /**
   * Dev-only: window.__vaulter lets tooling drive the game deterministically,
   * independent of requestAnimationFrame (which hidden tabs throttle).
   *   await __vaulter.play()
   *   __vaulter.hold(['right','aimRight'], 2.5)   // hold actions for 2.5 s of game time
   *   __vaulter.state()
   *   __vaulter.teleport(col, facing, groundLevel) // feet on the top surface (or ground level) at that column, pole in hand
   *   __vaulter.carveHints()                      // carve every stuck hint and the win line now (to look at them)
   *   __vaulter.cutscene()                        // seconds into the podium cutscene (null if none); hold([], s) plays it on
   *   __vaulter.skipCutscene()                    // as any key does
   */
  private installDevHook(): void {
    const app = this;
    const hook = {
      /** While true, animation frames only render; the simulation advances only via hold(). */
      set manual(on: boolean) {
        app.devManual = on;
      },
      play: async () => {
        await this.play();
        this.devManual = true;
      },
      hold: (actions: Action[], seconds: number) => {
        if (!this.game) return 'no game';
        this.devManual = true;
        const steps = Math.round(seconds / SIM_DT);
        for (const a of actions) this.input.press(a);
        for (let i = 0; i < steps; i++) this.game.frame(SIM_DT, false);
        for (const a of actions) this.input.release(a);
        this.game.frame(0, false);
        this.pixi.render();
        return hook.state();
      },
      teleport: (col: number, facing: 1 | -1 = 1, groundLevel = false) => {
        if (!this.game) return 'no game';
        const w = this.game.world;
        const p = w.player;
        p.x = col * TILE + TILE / 2;
        // The top surface there, or (groundLevel) the ground at the start's height, under any ledges.
        p.y = (groundLevel ? w.level.groundBelow(p.x, w.level.startY - 8, 64) : w.level.groundBelow(p.x, 0, w.level.pixelHeight)) ?? p.y;
        p.vx = 0;
        p.vy = 0;
        p.facing = facing;
        p.poleMode = 'carry';
        p.vault = null;
        resetPoleToHands(p.carry, p.x, p.y);
        this.game.view.resetView();
        return hook.hold([], 0.3);
      },
      carveHints: () => {
        if (!this.game) return 'no game';
        for (const h of [...longRunHints, winWriting]) this.game.view.carve(h);
        return hook.hold([], 3);
      },
      cutscene: () => this.game?.cutsceneTime() ?? null,
      skipCutscene: () => this.game?.skipCutscene(),
      state: () => {
        const w = this.game?.world;
        if (!w) return null;
        const p = w.player;
        const cam = this.game!.view.camera;
        const pb = p.carry.pole;
        return {
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
          pole: p.poleMode,
          held: p.carry.held,
          poleBody: { cx: pb.cx, cy: pb.cy, vx: pb.vx, vy: pb.vy, theta: pb.theta, omega: pb.omega },
          cleared: w.cleared,
          lastVault: w.lastVault,
          camera: { x: cam.x, y: cam.y },
        };
      },
      /**
       * PNG data URL of a crop of the 480x270 game image, upscaled with nearest
       * neighbour. Default: 160x90 around the player at 6x. For visual checks.
       */
      snapshot: (w = 160, h = 90, scale = 6) => {
        // Render a separate copy of the view (reading the live render texture back disturbs it).
        const src = this.pixi.renderer.extract.canvas({
          target: this.stage.world,
          frame: new Rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT),
          resolution: 1,
          clearColor: 0x8ec8f0,
        }) as HTMLCanvasElement;
        const view = this.game!.view.camera.viewOrigin(1);
        const p = this.game!.world.player;
        // During a cutscene: around the middle of the screen instead of the player.
        const cut = this.game!.cutsceneTime() !== null;
        const x0 = cut ? Math.round((VIEW_WIDTH - w) / 2) : Math.round(p.x - view.x - w / 2);
        const y0 = cut ? Math.round((VIEW_HEIGHT - h) / 2) : Math.round(p.y - view.y - h * 0.7);
        const out = document.createElement('canvas');
        out.width = w * scale;
        out.height = h * scale;
        const ctx = out.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(src, x0, y0, w, h, 0, 0, w * scale, h * scale);
        return out.toDataURL('image/png');
      },
    };
    (window as unknown as { __vaulter: typeof hook }).__vaulter = hook;
  }

  private frame(): void {
    const now = performance.now();
    const realDt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    this.dev.recordFrame(realDt * 1000);
    if (this.game) this.game.frame(realDt, this.mode !== 'playing' || this.devManual);
    else this.dev.update(now, 0, null);
  }

  private bindScreens(): void {
    bindActions(el('#screen-menu'), {
      play: () => void this.play(),
      settings: () => this.openSettings('menu'),
    });
    bindActions(el('#screen-pause'), {
      resume: () => this.resume(),
      restart: () => {
        this.game?.restart();
        this.resume();
      },
      settings: () => this.openSettings('pause'),
      quit: () => this.toMenu(),
    });
    bindActions(el('#screen-settings'), {
      back: () => this.closeSettings(),
    });
    // UI click sound on every button.
    el('#ui').addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.audio.play('ui_click', { volume: 0.5 });
    });
  }

  private async play(): Promise<void> {
    await this.audio.unlock();
    if (!this.assets) {
      this.mode = 'loading';
      this.assets = await runLoadingScene(this.base, this.audio);
    }
    this.game?.destroy();
    this.game = new GameScene({
      renderer: this.pixi.renderer,
      stage: this.stage,
      sprites: this.assets.sprites,
      audio: this.audio,
      input: this.input,
      progress: this.progress,
      hud: this.hud,
      dev: this.dev,
    });
    this.input.releaseAll();
    this.input.consume();
    this.audio.playMusic('main');
    this.mode = 'playing';
    showScreen(null);
    (document.activeElement as HTMLElement | null)?.blur();
  }

  private toMenu(): void {
    this.game?.destroy();
    this.game = null;
    this.audio.stopMusic();
    this.mode = 'menu';
    showScreen('menu');
  }

  private pause(): void {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.input.releaseAll();
    showScreen('pause');
  }

  private resume(): void {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    this.input.releaseAll();
    this.input.consume();
    this.game?.resetClock();
    showScreen(null);
    (document.activeElement as HTMLElement | null)?.blur();
  }

  private openSettings(from: ScreenId): void {
    this.settingsReturn = from;
    this.settingsPanel.sync();
    showScreen('settings');
  }

  private closeSettings(): void {
    showScreen(this.settingsReturn);
  }

  /** Any key (bar pause, restart, mute and the dev overlay) skips the cutscene, and does nothing else. */
  private skipCutsceneKey(code: string): boolean {
    if (this.mode !== 'playing' || !this.game?.inCutscene) return false;
    const c = COMMAND_KEYS[code];
    if (c && CUTSCENE_PASS.has(c)) return false;
    this.game.skipCutscene();
    return true;
  }

  private onCommand(c: Command): void {
    switch (c) {
      case 'pause':
        if (this.mode === 'playing') this.pause();
        else if (this.mode === 'paused') {
          if (!el('#screen-settings').hidden) this.closeSettings();
          else this.resume();
        } else if (this.mode === 'menu' && !el('#screen-settings').hidden) this.closeSettings();
        break;
      case 'skip':
        if (this.mode === 'playing') this.game?.skip();
        break;
      case 'restart':
        if (this.mode === 'playing') this.game?.restart();
        break;
      case 'mute': {
        this.settingsPanel.setMuted(!this.settings.value.muted);
        break;
      }
      case 'devOverlay':
        if (import.meta.env.DEV) this.dev.toggle();
        break;
    }
  }

  /** Pause on focus loss (if enabled) and always stop audio while the tab is hidden. */
  private watchFocus(): void {
    window.addEventListener('blur', () => {
      if (this.settings.value.pauseOnBlur) this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
        void this.audio.suspendForFocus();
      } else {
        void this.audio.resumeFromFocus();
        this.game?.resetClock();
        this.lastFrame = performance.now();
      }
    });
  }
}
