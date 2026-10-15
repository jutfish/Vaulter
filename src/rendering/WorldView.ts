import { Container, Graphics, RenderTexture, Renderer, Sprite, TilingSprite } from 'pixi.js';
import { beam as beamCfg, body, pole, poleTiers, run, TILE, VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import { NODE_SPACING } from '../gameplay/beam';
import { handMid } from '../gameplay/carry';
import { layoutHint, type CarvedHint, type PlacedChar } from '../gameplay/hints';
import { Tile, type Theme } from '../gameplay/level';
import { pointAt } from '../gameplay/poleBody';
import type { GameEvent } from '../gameplay/player';
import type { World } from '../gameplay/world';
import { Camera } from './Camera';
import { ParticlePool } from './effects';
import { glyphCells } from '../data/pixelFont';
import { FRAME_H, FRAME_W, HANG_GRIP, type SpriteSet, type TileFrame, type VaulterFrame } from './sprites';
import { cityTexture, moonTexture, skyTexture, standTexture, starsTexture, FLOODLIGHT_HEIGHT, STAND_HEIGHT } from './stadium';

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

interface Carving {
  hint: CarvedHint;
  chars: PlacedChar[];
  g: Graphics;
  shown: number;
  drawn: number;
  total: number;
}

/** Hint text carved into the land: groove and its lit lower edge (by the look of the land), and letters carved per second. */
const CARVE: Record<Theme, { dark: number; light: number }> = {
  track: { dark: 0x3e3c40, light: 0x8a8682 },
  infield: { dark: 0x3e281a, light: 0xa47452 },
  stand: { dark: 0x3e3c40, light: 0x8a8682 },
  roof: { dark: 0x2a2e38, light: 0x8a94a6 },
  outside: { dark: 0x3e281a, light: 0xa47452 },
};
const CARVE_RATE = 30;
/** Slope fill and surface colours by the look of the land, matching the tiles in tiles.png. */
const SLOPE: Record<Theme, { fill: number; edge: number }> = {
  track: { fill: 0x646264, edge: 0xc4543c },
  infield: { fill: 0x7c5438, edge: 0x5ca848 },
  stand: { fill: 0x646264, edge: 0xa4a09a },
  roof: { fill: 0x464c5a, edge: 0x808c9c },
  outside: { fill: 0x7c5438, edge: 0x3e3e44 },
};
/** Ground tiles (open above / buried) and walls by the look of the land. */
const GROUND_FRAMES: Record<Theme, { top: TileFrame; body: TileFrame; wallTop: TileFrame; wall: TileFrame }> = {
  track: { top: 'track', body: 'concrete', wallTop: 'concreteTop', wall: 'concrete' },
  infield: { top: 'grass', body: 'dirt', wallTop: 'wallTop', wall: 'wall' },
  stand: { top: 'concreteTop', body: 'concrete', wallTop: 'adBoardTop', wall: 'adBoard' },
  roof: { top: 'roofTop', body: 'roof', wallTop: 'roofTop', wall: 'roof' },
  outside: { top: 'tarmac', body: 'dirt', wallTop: 'wallTop', wall: 'wall' },
};
/** Landing mat behind the competition bar (tiles). */
const MAT_TILES = 4;
/** Water in the steeplechase pits on the track: depth below the ground line, colour, opacity. */
const WATER_TOP = 5;
const WATER = 0x3a78c8;
const WATER_ALPHA = 0.7;
/** The competition bar: upright colour, bar stripes, the back upright's offset (side-on oblique), fall. */
const UPRIGHT = 0xd8d8e0;
const BAR_COLORS = [0xf4f4f0, 0xd03c3c];
const BAR_DEPTH = { x: 5, y: -4 };
const BAR_GRAVITY = 700;
/** Scoreboard: size, offset of its centre from the bar, height of its bottom edge above the ground. */
const BOARD = { w: 184, h: 44, dx: 150, lift: 56 };
const LED = { up: 0xffb030, knocked: 0xff4a3c, cleared: 0xffd840 } as const;
const BOARD_TEXT = {
  up: ['OLYMPIC FINAL', 'POLE VAULT'],
  knocked: ['NO JUMP!', 'PRESS R: TRY AGAIN'],
  cleared: ['GOLD MEDAL!', 'OLYMPIC CHAMPION'],
} as const;
/** Parallax factors of the backdrop layers, and where the moon hangs on screen. */
const STARS_PARALLAX = 0.03;
const CITY_PARALLAX = 0.2;
const STAND_PARALLAX = 0.5;
const MOON_AT = { x: 372, y: 14 };
/** Crowd: camera flashes per second (idle / cheering), and how long a cheer lasts. */
const FLASH_RATE = { idle: 1.5, cheer: 40 };
const CHEER_TIME = 3;
const CROWD_TINT = 0x8a8aa4;
const NIGHT_TINT = 0xb8b8d0;
/** Pole colour and its darker tip shade, by poleTiers name. */
const POLE_COLORS: Record<string, { color: number; shade: number }> = {
  gold: { color: 0xf0c838, shade: 0xa07818 },
  silver: { color: 0xd4dbe2, shade: 0x8a949e },
  bronze: { color: 0xc8803c, shade: 0x84501e },
  black: { color: 0x2a2a30, shade: 0x5a5a64 },
};
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
  private readonly far = new Container();
  private readonly near = new Container();
  private readonly worldLayer = new Container();
  /** Stadium extras (null on plain levels). */
  private readonly stars: TilingSprite | null = null;
  private readonly crowd: Sprite | null = null;
  private readonly flashes = new Graphics();
  private readonly scoreboard = new Graphics();
  private readonly barGfx = new Graphics();
  private readonly water = new Graphics();
  private boardState: string | null = null;
  private boardBlink = 0;
  private cheer = 0;
  private barFall: { x: number; y: number; vx: number; vy: number; angle: number; spin: number; groundY: number } | null = null;
  private readonly levelSprite: Sprite;
  private readonly poleGfx = new Graphics();
  private readonly armsBack = new Graphics();
  private readonly armsFront = new Graphics();
  private readonly vaulter: Sprite;
  /** Scratch buffer for the interpolated pole shape (no per-frame allocation). */
  private readonly polePts = new Float64Array(beamCfg.nodes * 2);
  private readonly particles = new ParticlePool();
  private readonly flash = new Graphics();
  /** Hints carved into the land, being carved letter by letter. */
  private readonly hintLayer = new Container();
  private readonly carvings: Carving[] = [];
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

    const stadium = !!level.data.zones;
    const sky = new Container();
    if (stadium) {
      const groundY = level.startY;
      sky.addChild(new Sprite(skyTexture(VIEW_WIDTH, VIEW_HEIGHT)));
      this.stars = new TilingSprite({ texture: starsTexture(VIEW_WIDTH, VIEW_HEIGHT), width: VIEW_WIDTH, height: VIEW_HEIGHT });
      sky.addChild(this.stars);
      const moon = new Sprite(moonTexture());
      moon.position.set(MOON_AT.x, MOON_AT.y);
      sky.addChild(moon);
      const cityW = Math.ceil(level.pixelWidth * CITY_PARALLAX + VIEW_WIDTH);
      const city = new Sprite(cityTexture(cityW, 110));
      city.position.set(0, groundY - 110);
      this.far.addChild(city);
      // The far stand ends about where the near stand (the cliff) does when it's centred on screen.
      const roof = level.data.zones!.find((z) => z.theme === 'roof');
      const roofX = (roof ? roof.from : level.width) * TILE;
      const endX = Math.round(VIEW_WIDTH / 2 + (roofX - VIEW_WIDTH / 2) * STAND_PARALLAX);
      const standW = Math.ceil(level.pixelWidth * STAND_PARALLAX + VIEW_WIDTH);
      this.crowd = new Sprite(standTexture(standW, endX));
      this.crowd.position.set(0, groundY - FLOODLIGHT_HEIGHT - 4);
      // Across the infield, in the dark: pushed back so the track reads first.
      this.crowd.tint = CROWD_TINT;

      this.near.addChild(this.crowd, this.flashes);
    } else {
      const far = new Graphics();
      const near = new Graphics();
      this.drawHills(far, 0x9fb8d8, 70, 0.011, 40);
      this.drawHills(near, 0x7fa87a, 40, 0.023, 22);
      this.far.addChild(far);
      this.near.addChild(near);
    }

    this.levelSprite = new Sprite(this.bakeLevel(renderer));
    if (stadium) {
      // It's night: the land is a little darker and bluer than by day.
      this.levelSprite.tint = NIGHT_TINT;
      this.hintLayer.tint = NIGHT_TINT;
    }
    const flag = new Sprite(sprites.flag);
    flag.position.set(level.finishX, (level.groundBelow(level.finishX + 8, 0, level.pixelHeight) ?? level.startY) - FRAME_H);

    this.vaulter = new Sprite(sprites.vaulter.idle);
    this.flash.visible = false;

    const worldLayer = this.worldLayer;
    worldLayer.label = 'worldLayer';
    // Carried pole sits beside the body: back arm, pole, body, then the front arm reaching across to grip it.
    // Water in the pits is in front of the vaulter (wading).
    worldLayer.addChild(this.scoreboard, this.levelSprite, this.hintLayer, this.markers(), flag, this.barGfx, this.armsBack, this.poleGfx, this.vaulter, this.armsFront, this.water, this.particles.container, this.flash);
    this.root.addChild(sky, this.far, this.near, worldLayer);

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
    this.stepCarvings(dt);
  }

  private poleColor(): { color: number; shade: number } {
    return POLE_COLORS[poleTiers[this.world.poleTier]!.name]!;
  }

  /** Carves text into the land letter by letter (or all at once), replacing any with the same id. */
  carve(hint: CarvedHint, instant = false): void {
    const old = this.carvings.findIndex((c) => c.hint.id === hint.id);
    if (old >= 0) this.carvings.splice(old, 1)[0]!.g.destroy();
    const g = new Graphics();
    this.hintLayer.addChild(g);
    const chars = layoutHint(hint, this.world.level);
    const carving = { hint, chars, g, shown: 0, drawn: 0, total: chars.length };
    this.carvings.push(carving);
    if (instant) {
      carving.shown = carving.drawn = carving.total;
      this.drawCarving(carving, carving.total);
    }
  }

  private stepCarvings(dt: number): void {
    for (const c of this.carvings) {
      if (c.drawn >= c.total) continue;
      c.shown = Math.min(c.total, c.shown + CARVE_RATE * dt);
      const n = Math.floor(c.shown);
      if (n === c.drawn) continue;
      c.drawn = n;
      const at = this.drawCarving(c, n);
      if (at && n % 3 === 0) this.particles.dust(at.x, at.y, 1, 30);
    }
  }

  /** Draws the first n letters of a carving; returns where the last one is. */
  private drawCarving(c: Carving, n: number): { x: number; y: number } | null {
    const g = c.g;
    g.clear();
    const level = this.world.level;
    const k = c.hint.scale ?? 1;
    let last: { x: number; y: number } | null = null;
    for (const ch of c.chars.slice(0, n)) {
      for (const [gx, gy] of glyphCells(ch.ch)) {
        const x = ch.x + gx * k;
        const y = ch.y + gy * k;
        // Carved: a dark groove with a lit lower edge. Only into the land, never the sky.
        if (!level.isSolidAt(x + k / 2, y + k / 2)) continue;
        const carve = CARVE[level.themeAt(Math.floor(x / TILE))];
        g.rect(x, y + 1, k, k).fill(carve.light);
        g.rect(x, y, k, k).fill(carve.dark);
      }
      last = { x: ch.x + k, y: ch.y + 2 * k };
    }
    return last;
  }

  /** Re-sync after a restart (no interpolation from the old state). */
  resetView(): void {
    this.prev = this.curr = snapshot(this.world);
    this.camera.snapTo(this.world.player.x, this.world.player.y);
    this.bodyRotation = 0;
    this.barFall = null;
    this.cheer = 0;
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
      case 'barKnocked': {
        const ground = this.world.level.groundBelow(e.x, e.y, this.world.level.pixelHeight) ?? e.y;
        this.barFall = { x: e.x, y: e.y, vx: p.vx * 0.15, vy: Math.min(0, p.vy) * 0.3, angle: 0, spin: (p.vx >= 0 ? 1 : -1) * 4, groundY: ground - 1 };
        break;
      }
      case 'barCleared':
        this.cheer = CHEER_TIME;
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
    this.worldLayer.position.set(-view.x, -view.y);
    // Parallax: hills (or the city and the far stand) sit on the horizon at the resting camera height and drift less than the world.
    const dy = view.y - this.baseViewY;
    this.far.position.set(-Math.round(view.x * CITY_PARALLAX), -this.baseViewY - Math.round(dy * CITY_PARALLAX));
    this.near.position.set(-Math.round(view.x * STAND_PARALLAX), -this.baseViewY - Math.round(dy * STAND_PARALLAX));
    if (this.stars) this.stars.tilePosition.set(-Math.round(view.x * STARS_PARALLAX), -Math.round(dy * STARS_PARALLAX));
    this.drawStadium(view.x, frameDt);

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

  /** The competition bar (standing or falling), the scoreboard, and the crowd's flashes and cheering. */
  private drawStadium(viewX: number, frameDt: number): void {
    const bar = this.world.level.data.bar;
    if (bar) {
      const level = this.world.level;
      const ground = level.groundBelow(bar.x, bar.y, level.pixelHeight) ?? bar.y;
      const g = this.barGfx.clear();
      // Uprights: the back one offset up and right (side-on oblique), each with a peg the bar rests on.
      for (const k of [1, 0]) {
        const ux = bar.x + BAR_DEPTH.x * k;
        const uy = bar.y + BAR_DEPTH.y * k;
        g.rect(ux - 1, uy - 8, 2, ground + BAR_DEPTH.y * k - (uy - 8)).fill(k ? 0xa8a8b4 : UPRIGHT);
        g.rect(ux - 3, ground + BAR_DEPTH.y * k - 1, 6, 1).fill(k ? 0x8a8a96 : 0xa8a8b4);
        g.rect(ux + 1, uy, 2, 1).fill(0x606070);
      }
      let x0: number;
      let y0: number;
      let angle = Math.atan2(BAR_DEPTH.y, BAR_DEPTH.x);
      if (this.barFall) {
        const f = this.barFall;
        f.vy += BAR_GRAVITY * frameDt;
        f.x += f.vx * frameDt;
        f.y += f.vy * frameDt;
        f.angle += f.spin * frameDt;
        if (f.y >= f.groundY) {
          // Bounce once, then lie flat on the mat.
          f.y = f.groundY;
          f.vy = Math.abs(f.vy) > 60 ? -Math.abs(f.vy) * 0.3 : 0;
          f.vx *= 0.5;
          f.spin = 0;
          if (f.vy === 0) f.angle = 0;
        }
        x0 = f.x;
        y0 = f.y;
        angle += f.angle;
      } else {
        x0 = bar.x + 2;
        y0 = bar.y;
      }
      if (this.world.bar === 'knocked' && !this.barFall) {
        // Knocked while the view wasn't watching (e.g. a dev teleport): lie on the ground.
        y0 = ground - 1;
        angle = 0;
      }
      // The bar: a short striped rod going back into the scene (or lying where it fell).
      const len = 9;
      for (let i = 0; i < len; i++) {
        const t = i - 2;
        g.rect(Math.round(x0 + Math.cos(angle) * t), Math.round(y0 + Math.sin(angle) * t) - 1, 1, 2).fill(BAR_COLORS[Math.floor(i / 2) % 2]!);
      }
      this.drawScoreboard(bar.x, ground, frameDt);
    }

    // The crowd: a camera flash here and there, a storm of them (and everyone jumping) after a clean clearance.
    if (this.crowd) {
      this.cheer = Math.max(0, this.cheer - frameDt);
      const cheering = this.cheer > 0;
      this.crowd.y = Math.round(this.world.level.startY - FLOODLIGHT_HEIGHT - 4) - (cheering && Math.floor(this.cheer / 0.12) % 2 === 0 ? 1 : 0);
      const fl = this.flashes.clear();
      const n = (cheering ? FLASH_RATE.cheer : FLASH_RATE.idle) * frameDt;
      const count = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
      const top = this.world.level.startY - STAND_HEIGHT + 8;
      for (let i = 0; i < count; i++) {
        const fx = Math.round(viewX * STAND_PARALLAX + Math.random() * VIEW_WIDTH);
        const fy = Math.round(top + Math.random() * (STAND_HEIGHT - 22));
        fl.rect(fx, fy, 1, 1).fill(0xffffff);
        fl.rect(fx - 1, fy, 3, 1).fill({ color: 0xffffff, alpha: 0.5 });
        fl.rect(fx, fy - 1, 1, 3).fill({ color: 0xffffff, alpha: 0.5 });
      }
    }
  }

  /** The scoreboard next to the bar: what's happened in the final, in amber LEDs. */
  private drawScoreboard(barX: number, ground: number, frameDt: number): void {
    const state = this.world.bar;
    if (state !== this.boardState) {
      this.boardState = state;
      this.boardBlink = state === 'up' ? 0 : 1.2;
    }
    this.boardBlink = Math.max(0, this.boardBlink - frameDt);
    const g = this.scoreboard.clear();
    const cx = Math.round(barX + BOARD.dx);
    const x = cx - BOARD.w / 2;
    const y = ground - BOARD.lift - BOARD.h;
    g.rect(x + 20, y + BOARD.h, 3, BOARD.lift).fill(0x3a3c4a);
    g.rect(x + BOARD.w - 23, y + BOARD.h, 3, BOARD.lift).fill(0x3a3c4a);
    g.rect(x - 2, y - 2, BOARD.w + 4, BOARD.h + 4).fill(0x2a2c38);
    g.rect(x, y, BOARD.w, BOARD.h).fill(0x0c0c12);
    // Blinking after a change.
    if (this.boardBlink > 0 && Math.floor(this.boardBlink / 0.15) % 2 === 1) return;
    const k = 2;
    const lines = BOARD_TEXT[state];
    const color = LED[state];
    lines.forEach((line, li) => {
      const w = line.length * 4 * k - k;
      let lx = cx - Math.round(w / 2);
      const ly = y + 8 + li * 16;
      for (const ch of line) {
        for (const [gx, gy] of glyphCells(ch)) g.rect(lx + gx * k, ly + gy * k, k - 1, k - 1).fill(color);
        lx += 4 * k;
      }
    });
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
    g.stroke({ width: 2, color: this.poleColor().color, join: 'round' });
    const last = (beamCfg.nodes - 1) * 2;
    g.moveTo(pts[last - 2]! + (pts[last]! - pts[last - 2]!) * 0.6, pts[last - 1]! + (pts[last + 1]! - pts[last - 1]!) * 0.6);
    g.lineTo(pts[last]!, pts[last + 1]!);
    g.stroke({ width: 2, color: this.poleColor().shade });

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
    g.stroke({ width: 2, color: this.poleColor().color });
    g.moveTo(px, py).lineTo(px + (mx - px) * 0.08, py + (my - py) * 0.08);
    g.stroke({ width: 2, color: this.poleColor().shade });
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
          const look = SLOPE[level.themeAt(tx)];
          const tri = up ? [x, y + TILE, x + TILE, y, x + TILE, y + TILE] : [x, y, x + TILE, y + TILE, x, y + TILE];
          slopes.poly(tri).fill(look.fill);
          const grass = up ? [x, y + TILE, x + TILE, y, x + TILE, y + 4, x + 4, y + TILE] : [x, y, x + TILE, y + TILE, x + TILE - 4, y + TILE, x, y + 4];
          slopes.poly(grass).fill(look.edge);
          continue;
        }
        const open = !level.isSolidTile(tx, ty - 1);
        const theme = level.themeAt(tx);
        const look = GROUND_FRAMES[theme];
        let frame: TileFrame = t === Tile.Wall ? (open ? look.wallTop : look.wall) : open ? look.top : look.body;
        // Stands: anything raised above the track (tiers, the lower stand) is rows of seats under a walkway.
        if (theme === 'stand' && t === Tile.Earth && !open && (y < level.startY || !level.isSolidTile(tx, ty + 1))) frame = 'seats';
        if (theme === 'stand' && t === Tile.Earth && open && !level.isSolidTile(tx, ty + 1)) frame = 'seats';
        const bar = level.data.bar;
        if (bar && open && t === Tile.Earth && x >= bar.x && x < bar.x + MAT_TILES * TILE) frame = 'mat';
        // Car park potholes go down through the tarmac to the earth.
        if (theme === 'outside' && open && this.inPit(tx, ty - 1)) frame = 'dirt';
        if (theme === 'track' && open && this.inPit(tx, ty - 1)) {
          this.water.rect(x, y - TILE + WATER_TOP, TILE, TILE - WATER_TOP).fill({ color: WATER, alpha: WATER_ALPHA });
          this.water.rect(x, y - TILE + WATER_TOP, TILE, 1).fill({ color: 0xa8d0f8, alpha: 0.9 });
        }
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

  /** Is the empty tile at (tx, ty) the inside of a pit: ground below it and walls of ground close on both sides? */
  private inPit(tx: number, ty: number): boolean {
    const level = this.world.level;
    if (level.isSolidTile(tx, ty) || !level.isSolidTile(tx, ty + 1)) return false;
    const side = (dir: number) => {
      for (let i = 1; i <= 8; i++) {
        if (level.isSolidTile(tx + i * dir, ty)) return true;
        if (!level.isSolidTile(tx + i * dir, ty + 1)) return false;
      }
      return false;
    };
    return side(-1) && side(1);
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
