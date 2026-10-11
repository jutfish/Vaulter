import { Container, Graphics, RenderTexture, Renderer, Sprite } from 'pixi.js';
import { body, pole, run, TILE, VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import type { GameEvent } from '../gameplay/player';
import type { World } from '../gameplay/world';
import { Camera } from './Camera';
import { ParticlePool } from './effects';
import { FRAME_H, FRAME_W, HANG_GRIP, type SpriteSet, type VaulterFrame } from './sprites';

/** Everything the renderer needs from one simulation tick, so it can interpolate between two. */
interface Snapshot {
  x: number;
  y: number;
  aim: number;
  /** Planted-pole state (only meaningful when planted). */
  planted: boolean;
  pivotX: number;
  pivotY: number;
  dir: number;
  phi: number;
  r: number;
  plantPhi: number;
}

const POLE_COLOR = 0xf0d060;
const POLE_SHADE = 0xa08030;
/** Visual offset of the hands from the body centre in carry frames (see the art script). */
const HAND_FORWARD = 3;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

function snapshot(world: World): Snapshot {
  const p = world.player;
  const v = p.vault;
  return {
    x: p.x,
    y: p.y,
    aim: p.aim,
    planted: !!v,
    pivotX: v?.pivotX ?? 0,
    pivotY: v?.pivotY ?? 0,
    dir: v?.dir ?? p.facing,
    phi: v?.phi ?? 0,
    r: v?.r ?? pole.length,
    plantPhi: v?.plantPhi ?? 0,
  };
}

export class WorldView {
  readonly root = new Container();
  readonly camera: Camera;
  private readonly far = new Graphics();
  private readonly near = new Graphics();
  private readonly levelSprite: Sprite;
  private readonly poleGfx = new Graphics();
  private readonly vaulter: Sprite;
  private readonly particles = new ParticlePool();
  private readonly flash = new Graphics();
  private prev: Snapshot;
  private curr: Snapshot;
  private runPhase = 0;
  private bodyRotation = 0;
  private landTimer = 0;
  private flashTimer = 0;
  private shake = 0;
  private baseViewY = 0;

  constructor(
    renderer: Renderer,
    private readonly world: World,
    private readonly sprites: SpriteSet,
  ) {
    const level = world.level;
    this.camera = new Camera(level.pixelWidth, level.pixelHeight);

    this.drawHills(this.far, 0x9fb8d8, 70, 0.011, 40);
    this.drawHills(this.near, 0x7fa87a, 40, 0.023, 22);

    this.levelSprite = new Sprite(this.bakeLevel(renderer));
    const flag = new Sprite(sprites.flag);
    flag.position.set(level.finishX, level.startY - FRAME_H);

    this.vaulter = new Sprite(sprites.vaulter.idle);
    this.flash.visible = false;

    const worldLayer = new Container();
    worldLayer.label = 'worldLayer';
    worldLayer.addChild(this.levelSprite, this.markers(), flag, this.poleGfx, this.vaulter, this.particles.container, this.flash);
    this.root.addChild(this.far, this.near, worldLayer);

    this.prev = this.curr = snapshot(world);
    this.camera.snapTo(world.player.x, world.player.y);
    this.baseViewY = this.camera.viewOrigin(0).y;
  }

  /** Call after each simulation step. */
  onStep(dt: number, events: readonly GameEvent[]): void {
    this.prev = this.curr;
    this.curr = snapshot(this.world);
    const p = this.world.player;
    this.camera.update(p.x, p.y, p.vx, dt);
    for (const e of events) this.react(e);
  }

  /** Re-sync after a restart (no interpolation from the old state). */
  resetView(): void {
    this.prev = this.curr = snapshot(this.world);
    this.camera.snapTo(this.world.player.x, this.world.player.y);
    this.bodyRotation = 0;
  }

  private react(e: GameEvent): void {
    const p = this.world.player;
    switch (e.type) {
      case 'plant':
        this.particles.dust(e.x, e.y, 6, 60);
        break;
      case 'land':
        this.landTimer = 0.09;
        this.bodyRotation = 0;
        if (e.speed > 150) this.particles.dust(p.x, p.y, Math.min(14, Math.floor(e.speed / 30)), 90);
        if (e.speed > 380) this.shake = 0.12;
        break;
      case 'launch':
        if (e.perfect) {
          this.particles.burst(p.x, p.y - body.gripHeight, 12, 0xfff4a0, 90);
          this.flashTimer = 0.18;
        }
        break;
      case 'bonk':
      case 'stab':
        this.shake = 0.15;
        break;
      case 'hop':
        this.particles.dust(p.x, p.y, 3, 40);
        break;
      default:
        break;
    }
  }

  /** Call once per rendered frame. alpha = interpolation between the last two sim states. */
  render(alpha: number, frameDt: number): void {
    const a = this.prev;
    const b = this.curr;
    const p = this.world.player;
    const x = lerp(a.x, b.x, alpha);
    const y = lerp(a.y, b.y, alpha);

    // Camera (and a little shake), snapped to whole pixels.
    const view = this.camera.viewOrigin(alpha);
    if (this.shake > 0) {
      this.shake -= frameDt;
      view.x += Math.round((Math.random() - 0.5) * 4);
      view.y += Math.round((Math.random() - 0.5) * 4);
    }
    const layer = this.root.children[2]!;
    layer.position.set(-view.x, -view.y);
    // Parallax: hills sit on the horizon at the resting camera height and drift less than the world.
    const dy = view.y - this.baseViewY;
    this.far.position.set(-Math.round(view.x * 0.2), -this.baseViewY - Math.round(dy * 0.2));
    this.near.position.set(-Math.round(view.x * 0.5), -this.baseViewY - Math.round(dy * 0.5));

    this.particles.update(frameDt);
    this.drawVaulter(p.poleMode === 'planted' && a.planted && b.planted, x, y, alpha, frameDt);

    if (this.flashTimer > 0) {
      this.flashTimer -= frameDt;
      this.flash.visible = true;
      this.flash.clear().circle(Math.round(x), Math.round(y - body.gripHeight), 10 + (0.18 - this.flashTimer) * 120);
      this.flash.stroke({ width: 1, color: 0xffffff, alpha: Math.max(0, this.flashTimer / 0.18) });
    } else {
      this.flash.visible = false;
    }
  }

  private drawVaulter(planted: boolean, x: number, y: number, alpha: number, frameDt: number): void {
    const p = this.world.player;
    const g = this.poleGfx.clear();

    if (planted) {
      const a = this.prev;
      const b = this.curr;
      const phi = lerp(a.phi, b.phi, alpha);
      const r = lerp(a.r, b.r, alpha);
      const dir = b.dir;
      const gx = b.pivotX + dir * r * Math.sin(phi);
      const gy = b.pivotY - r * Math.cos(phi);
      this.drawBentPole(g, b.pivotX, b.pivotY, gx, gy, phi, dir, r);

      // Body hangs from the hands and rotates feet-up as the chord passes vertical.
      const progress = Math.min(1.25, Math.max(0, (phi - b.plantPhi) / -b.plantPhi));
      this.bodyRotation = dir * progress * Math.PI * 0.85;
      this.setFrame(progress > 0.55 ? 'pike' : 'hang', dir);
      this.vaulter.anchor.set(HANG_GRIP.x / FRAME_W, HANG_GRIP.y / FRAME_H);
      this.vaulter.position.set(Math.round(gx), Math.round(gy));
      this.vaulter.rotation = this.bodyRotation;
      return;
    }

    // Off the pole.
    const facing = p.facing;
    this.vaulter.anchor.set(0.5, 1);
    if (p.inVaultFlight && !p.grounded) {
      // Keep turning over toward feet-first for the landing.
      const target = facing * Math.PI * 2;
      this.bodyRotation = lerp(this.bodyRotation, target, 1 - Math.exp(-5 * frameDt));
      if (Math.abs(target - this.bodyRotation) < 0.3) this.bodyRotation = 0;
      this.vaulter.anchor.set(0.5, 0.6);
      this.vaulter.position.set(Math.round(x), Math.round(y - FRAME_H * 0.4));
      this.vaulter.rotation = this.bodyRotation;
      this.setFrame(this.bodyRotation === 0 ? 'fall' : 'pike', facing);
    } else {
      this.bodyRotation = 0;
      this.vaulter.rotation = 0;
      this.vaulter.position.set(Math.round(x), Math.round(y));
      let frame: VaulterFrame = 'idle';
      if (this.landTimer > 0) {
        this.landTimer -= frameDt;
        frame = 'land';
      } else if (!p.grounded) frame = p.vy < 0 ? 'rise' : 'fall';
      else if (Math.abs(p.vx) > 8) {
        this.runPhase += (Math.abs(p.vx) * frameDt) / run.strideLength;
        frame = (['run1', 'run2', 'run3', 'run4'] as const)[Math.floor(this.runPhase * 2) % 4]!;
      }
      this.setFrame(frame, facing);
    }

    // Carried pole: from just behind the hands out along the aim.
    const aim = lerpAngle(this.prev.aim, this.curr.aim, alpha);
    const hx = Math.round(x) + facing * HAND_FORWARD;
    const hy = Math.round(y) - body.gripHeight;
    const cx = Math.cos(aim);
    const cy = Math.sin(aim);
    g.moveTo(hx - cx * 8, hy - cy * 8).lineTo(hx + cx * pole.length, hy + cy * pole.length);
    g.stroke({ width: 2, color: POLE_COLOR });
    g.moveTo(hx + cx * (pole.length - 2), hy + cy * (pole.length - 2)).lineTo(hx + cx * pole.length, hy + cy * pole.length);
    g.stroke({ width: 2, color: POLE_SHADE });
  }

  /** Pole as a bowed curve: chord r, arc ≈ pole length, bowing forward. */
  private drawBentPole(g: Graphics, px: number, py: number, gx: number, gy: number, phi: number, dir: number, r: number): void {
    const sag = Math.sqrt(Math.max(0, (3 * r * (pole.length - r)) / 8));
    const mx = (px + gx) / 2 + dir * Math.cos(phi) * sag * 2;
    const my = (py + gy) / 2 + Math.sin(phi) * sag * 2;
    g.moveTo(px, py).quadraticCurveTo(mx, my, gx, gy);
    g.stroke({ width: 2, color: POLE_COLOR });
    g.moveTo(px, py).lineTo(px + (mx - px) * 0.08, py + (my - py) * 0.08);
    g.stroke({ width: 2, color: POLE_SHADE });
  }

  private setFrame(frame: VaulterFrame, facing: number): void {
    this.vaulter.texture = this.sprites.vaulter[frame];
    this.vaulter.scale.x = facing;
  }

  /** Bakes all solid tiles into one texture (one sprite, one draw call). */
  private bakeLevel(renderer: Renderer): RenderTexture {
    const level = this.world.level;
    const groundRow = Math.round(level.startY / TILE);
    const tmp = new Container();
    for (let ty = 0; ty < level.height; ty++) {
      for (let tx = 0; tx < level.width; tx++) {
        if (!level.isSolidTile(tx, ty)) continue;
        const open = !level.isSolidTile(tx, ty - 1);
        const frame = ty >= groundRow ? (open ? 'grass' : 'dirt') : open ? 'wallTop' : 'wall';
        const sp = new Sprite(this.sprites.tiles[frame]);
        sp.position.set(tx * TILE, ty * TILE);
        tmp.addChild(sp);
      }
    }
    const rt = RenderTexture.create({ width: level.pixelWidth, height: level.pixelHeight });
    rt.source.scaleMode = 'nearest';
    renderer.render({ container: tmp, target: rt, clear: true, clearColor: [0, 0, 0, 0] });
    tmp.destroy({ children: true });
    return rt;
  }

  /** Distance posts every 5 m along the ground, for a sense of speed. */
  private markers(): Graphics {
    const g = new Graphics();
    const level = this.world.level;
    const y = level.startY;
    for (let x = level.startX; x < level.pixelWidth; x += 80) {
      g.rect(Math.round(x), y - 6, 1, 6).fill(0xffffff);
      g.rect(Math.round(x), y - 6, 1, 2).fill(0xd04040);
    }
    return g;
  }

  private drawHills(g: Graphics, color: number, amp: number, freq: number, base: number): void {
    const width = this.world.level.pixelWidth + VIEW_WIDTH;
    const groundY = this.world.level.startY;
    g.moveTo(0, VIEW_HEIGHT + 400);
    for (let x = 0; x <= width; x += 8) {
      const h = base + amp * (0.5 + 0.35 * Math.sin(x * freq) + 0.15 * Math.sin(x * freq * 2.7 + 1.3));
      g.lineTo(x, Math.round(groundY - h));
    }
    g.lineTo(width, VIEW_HEIGHT + 400).closePath().fill(color);
  }
}
