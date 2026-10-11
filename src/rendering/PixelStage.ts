import { Application, Container, RenderTexture, Sprite } from 'pixi.js';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';

/** Device pixel ratio cap: beyond 2x the extra pixels cost GPU time and add nothing to pixel art. */
export const MAX_DPR = 2;

/**
 * Renders the game world at a fixed low resolution (VIEW_WIDTH x VIEW_HEIGHT)
 * into a texture, then shows it scaled by the largest whole number that fits
 * the window (nearest-neighbour), letterboxed. Every world pixel is the same
 * size on screen, so pixel art stays crisp and consistent.
 */
export class PixelStage {
  readonly world = new Container();
  readonly target: RenderTexture;
  private readonly screen: Sprite;
  scale = 1;

  constructor(private readonly app: Application) {
    this.target = RenderTexture.create({ width: VIEW_WIDTH, height: VIEW_HEIGHT });
    this.target.source.scaleMode = 'nearest';
    this.screen = new Sprite(this.target);
    app.stage.addChild(this.screen);
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const w = Math.floor(cssW * dpr);
    const h = Math.floor(cssH * dpr);
    this.app.renderer.resize(w, h);
    const canvas = this.app.canvas;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    this.scale = Math.max(1, Math.floor(Math.min(w / VIEW_WIDTH, h / VIEW_HEIGHT)));
    this.screen.scale.set(this.scale);
    this.screen.position.set(Math.floor((w - VIEW_WIDTH * this.scale) / 2), Math.floor((h - VIEW_HEIGHT * this.scale) / 2));
  }

  /** Draws the world into the low-res target. The app then presents app.stage. */
  renderWorld(): void {
    this.app.renderer.render({ container: this.world, target: this.target, clear: true, clearColor: 0x8ec8f0 });
  }
}
