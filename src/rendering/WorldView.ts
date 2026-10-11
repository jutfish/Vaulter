import { Container, Graphics, RenderTexture, Renderer, Sprite } from 'pixi.js';
import { beam as beamCfg, body, pole, run, TILE, VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import { NODE_SPACING } from '../gameplay/beam';
import { handMid } from '../gameplay/carry';
import { Tile } from '../gameplay/level';
import { pointAt } from '../gameplay/poleBody';
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
  /** Carry state (v2): hands' midpoint offset from the feet, lean, bob, hands along the pole, beam shape. */
  anchorDX: number;
  anchorDY: number;
  lean: number;
  bob: number;
  sMid: number;
  /** The pole body: end 0 position and axis angle (continuous), arm strain. */
  poleX0: number;
  poleY0: number;
  poleTheta: number;
  strain: number;
  held: boolean;
  handS: [number, number];
  handT: [number, number];
  beamY: Float64Array;
}

/** Slope colours, matching the grass/dirt tiles in tiles.png. */
const DIRT = 0x7c5438;
const GRASS = 0x5ca848;
const POLE_COLOR = 0xf0d060;
const POLE_SHADE = 0xa08030;
const SKIN = 0xf0bc8c;
const SKIN_BACK = 0xc48c62;
const OUTLINE = 0x18141c;
/** Arm strain above which the carried pole visibly trembles. */
const STRAIN_SHAKE = 0.75;

function poleEnd0(b: Parameters<typeof pointAt>[0]): { poleX0: number; poleY0: number } {
  const e = pointAt(b, 0);
  return { poleX0: e.x, poleY0: e.y };
}

/** Shoulder position relative to the feet in the upright sprite (see the art script). */
const SHOULDER = { x: 0, y: -21 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function snapshot(world: World): Snapshot {
  const p = world.player;
  const v = p.vault;
  const c = p.carry;
  return {
    anchorDX: c.anchorDX,
    anchorDY: c.anchorDY,
    lean: c.lean,
    bob: c.bob,
    sMid: handMid(c),
    ...poleEnd0(c.pole),
    poleTheta: c.pole.theta,
    strain: c.strain,
    held: c.held,
    handS: [c.hands[0].s, c.hands[1].s],
    handT: [c.hands[0].t, c.hands[1].t],
    beamY: Float64Array.from(c.beam.y),
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
  private readonly armsBack = new Graphics();
  private readonly armsFront = new Graphics();
  private readonly vaulter: Sprite;
  /** Scratch buffer for the interpolated pole shape (no per-frame allocation). */
  private readonly polePts = new Float64Array(beamCfg.nodes * 2);
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
    flag.position.set(level.finishX, (level.groundBelow(level.finishX + 8, 0, level.pixelHeight) ?? level.startY) - FRAME_H);

    this.vaulter = new Sprite(sprites.vaulter.idle);
    this.flash.visible = false;

    const worldLayer = new Container();
    worldLayer.label = 'worldLayer';
    // Carried pole sits beside the body: back arm, pole, body, then the front arm reaching across to grip it.
    worldLayer.addChild(this.levelSprite, this.markers(), flag, this.armsBack, this.poleGfx, this.vaulter, this.armsFront, this.particles.container, this.flash);
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
      case 'drop':
        if (e.reason !== 'letGo') this.shake = 0.1;
        break;
      case 'poleHit':
        if (e.floor) this.particles.dust(e.x, e.y, 1, 50);
        else this.particles.burst(e.x, e.y, 4, 0xfff0c0, 40);
        if (!e.floor && e.strength > 250) this.shake = 0.08;
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
    this.armsBack.clear();
    this.armsFront.clear();
    const a = this.prev;
    const b = this.curr;

    if (planted) {
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

    const facing = p.facing;
    const lean = lerp(a.lean, b.lean, alpha);
    const bob = Math.round(lerp(a.bob, b.bob, alpha));
    let bodyRot = lean * facing;
    let showArms = true;
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
      showArms = this.bodyRotation === 0;
      bodyRot = 0;
    } else {
      this.bodyRotation = 0;
      this.vaulter.rotation = bodyRot;
      this.vaulter.position.set(Math.round(x), Math.round(y) + bob);
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

    // The flexible pole: the pole body's own line plus the simulated sideways deflection.
    // Straining arms make it tremble a little.
    const theta = lerp(a.poleTheta, b.poleTheta, alpha);
    const dx = Math.cos(theta);
    const dy = Math.sin(theta);
    const nx = -dy;
    const ny = dx;
    const shake = b.strain > STRAIN_SHAKE ? Math.min(1.5, (b.strain - STRAIN_SHAKE) * 3) * Math.sin(performance.now() * 0.09) : 0;
    const bx = lerp(a.poleX0, b.poleX0, alpha) + nx * shake;
    const by = lerp(a.poleY0, b.poleY0, alpha) + ny * shake;
    const pts = this.polePts;
    for (let i = 0; i < beamCfg.nodes; i++) {
      const s = i * NODE_SPACING;
      const d = lerp(a.beamY[i]!, b.beamY[i]!, alpha);
      pts[i * 2] = bx + dx * s + nx * d;
      pts[i * 2 + 1] = by + dy * s + ny * d;
    }
    g.moveTo(pts[0]!, pts[1]!);
    for (let i = 1; i < beamCfg.nodes; i++) g.lineTo(pts[i * 2]!, pts[i * 2 + 1]!);
    g.stroke({ width: 2, color: POLE_COLOR, join: 'round' });
    const last = (beamCfg.nodes - 1) * 2;
    g.moveTo(pts[last - 2]! + (pts[last]! - pts[last - 2]!) * 0.6, pts[last - 1]! + (pts[last + 1]! - pts[last - 1]!) * 0.6);
    g.lineTo(pts[last]!, pts[last + 1]!);
    g.stroke({ width: 2, color: POLE_SHADE });

    if (!showArms) return;
    // Arms: from the (leaning, bobbing) shoulder to each hand on the pole. Hand 0 is drawn behind the body.
    const sx = Math.round(x) + SHOULDER.x * facing * Math.cos(bodyRot) - SHOULDER.y * Math.sin(bodyRot);
    const sy = Math.round(y) + bob + SHOULDER.x * facing * Math.sin(bodyRot) + SHOULDER.y * Math.cos(bodyRot);
    if (!b.held) {
      // Empty-handed: arms hang (and swing a little with the run).
      const swing = Math.sin(this.runPhase * Math.PI) * 3 * Math.min(1, Math.abs(p.vx) / 200);
      for (let h = 0; h < 2; h++) {
        const gfx = h === 0 ? this.armsBack : this.armsFront;
        const skin = h === 0 ? SKIN_BACK : SKIN;
        const hx = sx + facing * (h === 0 ? -swing : swing);
        const hy = sy + 9;
        gfx.moveTo(sx, sy).lineTo(hx, hy).stroke({ width: 2, color: OUTLINE });
        gfx.moveTo(sx, sy).lineTo(hx, hy).stroke({ width: 1, color: skin });
      }
      return;
    }
    for (let h = 0; h < 2; h++) {
      const s = lerp(a.handS[h]!, b.handS[h]!, alpha);
      const t = b.handT[h]!;
      const pos = this.pointOnPole(s);
      // A moving hand lifts off the pole as it passes the other one.
      const lift = t < 1 ? 2 * Math.sin(Math.PI * t) : 0;
      const hx = pos.x;
      const hy = pos.y - lift;
      const gfx = h === 0 ? this.armsBack : this.armsFront;
      const skin = h === 0 ? SKIN_BACK : SKIN;
      gfx.moveTo(sx, sy).lineTo(hx, hy).stroke({ width: 2, color: OUTLINE });
      gfx.moveTo(sx, sy).lineTo(hx, hy).stroke({ width: 1, color: skin });
      // Fist: 3x3 with a dark rim so it reads against the pole.
      const fx = Math.round(hx) - 1;
      const fy = Math.round(hy) - 1;
      gfx.rect(fx - 1, fy - 1, 4, 4).fill(OUTLINE);
      gfx.rect(fx, fy, 2, 2).fill(skin);
    }
  }

  /** World point on the drawn (interpolated, deflected) pole at distance s from the butt. */
  private pointOnPole(s: number): { x: number; y: number } {
    const pts = this.polePts;
    const pos = Math.max(0, Math.min(beamCfg.nodes - 1.000001, s / NODE_SPACING));
    const i = Math.floor(pos);
    const w = pos - i;
    return {
      x: pts[i * 2]! * (1 - w) + pts[i * 2 + 2]! * w,
      y: pts[i * 2 + 1]! * (1 - w) + pts[i * 2 + 3]! * w,
    };
  }

  /** Pole as a bowed curve: chord r, arc ≈ pole length, bowing forward. */
  private drawBentPole(g: Graphics, px: number, py: number, gx: number, gy: number, phi: number, dir: number, r: number): void {
    const L = this.world.player.vault?.length ?? pole.length;
    const sag = Math.sqrt(Math.max(0, (3 * r * (L - r)) / 8));
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
    const tmp = new Container();
    const slopes = new Graphics();
    for (let ty = 0; ty < level.height; ty++) {
      for (let tx = 0; tx < level.width; tx++) {
        const t = level.tileAt(tx, ty);
        if (t === Tile.Empty) continue;
        const x = tx * TILE;
        const y = ty * TILE;
        if (t === Tile.SlopeUp || t === Tile.SlopeDown) {
          // Earth below the diagonal with a grass edge along it.
          const up = t === Tile.SlopeUp;
          const tri = up ? [x, y + TILE, x + TILE, y, x + TILE, y + TILE] : [x, y, x + TILE, y + TILE, x, y + TILE];
          slopes.poly(tri).fill(DIRT);
          const grass = up ? [x, y + TILE, x + TILE, y, x + TILE, y + 4, x + 4, y + TILE] : [x, y, x + TILE, y + TILE, x + TILE - 4, y + TILE, x, y + 4];
          slopes.poly(grass).fill(GRASS);
          continue;
        }
        const open = !level.isSolidTile(tx, ty - 1);
        const frame = t === Tile.Wall ? (open ? 'wallTop' : 'wall') : open ? 'grass' : 'dirt';
        const sp = new Sprite(this.sprites.tiles[frame]);
        sp.position.set(x, y);
        tmp.addChild(sp);
      }
    }
    tmp.addChild(slopes);
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
    for (let x = level.startX; x < level.pixelWidth; x += 80) {
      const y = level.groundBelow(x, 0, level.pixelHeight);
      if (y === null) continue;
      g.rect(Math.round(x), Math.round(y) - 6, 1, 6).fill(0xffffff);
      g.rect(Math.round(x), Math.round(y) - 6, 1, 2).fill(0xd04040);
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
