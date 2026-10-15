import { Container, Graphics, Sprite } from 'pixi.js';
import { podium } from '../data/cutscene';
import { ADVANCE, glyphCells, GLYPH_H, textWidth } from '../data/pixelFont';
import { TILE, VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import type { HeroPose, PodiumFrame } from '../scenes/cutscene';
import { FRAME_H, FRAME_W, MEDAL_TOP, type OfficialFrameName, type SpriteSet } from './sprites';
import { FLOODLIGHT_HEIGHT, moonTexture, skyTexture, STAND_HEIGHT, standTexture, starsTexture } from './stadium';

/** The set's backdrop: where the sky starts (top left) and its size, in set px. */
const SKY = { x: -112, y: -150, w: 240, h: 200 };
/** The far stand: its canopy this high above the ground, the strip's left end and width. */
const STAND = { canopyY: -50, x: -190, w: 400 };
/** The podium sprite's top-left (its 1st step's middle is x = 0, its bottom row the ground). */
const PODIUM_AT = { x: -28, y: -22 };
/** Ground tiles either side of the podium. */
const GROUND = { from: -128, to: 128 };
/** Where the medal ribbon goes round the neck, in the vaulter's frame, by pose. */
const NECK: Record<HeroPose, { x: number; y: number }> = {
  stand: { x: 9, y: 11 },
  wave: { x: 9, y: 11 },
  sad: { x: 9, y: 13 },
  lookUp: { x: 9, y: 11 },
};
/** The little man's hand (the medal hangs from it), in his frame. */
const HAND: Record<OfficialFrameName, { x: number; y: number }> = {
  stand: { x: 8, y: 23 },
  walk1: { x: 8, y: 23 },
  walk2: { x: 8, y: 23 },
  reach: { x: 12, y: 11 },
};
const CAST_TINT = 0xe0e0f0;
const CROWD_TINT = 0x8a8aa4;
/** Crowd camera flashes per second (idle / cheering), and the rows they show in (set px). */
const FLASH_RATE = { idle: 3, cheer: 45 };
const FLASH_ROWS = { top: STAND.canopyY + 8, bottom: -4 };
const BUBBLE = { pad: 2, ink: 0x18141c, paper: 0xf4f4f0, gapAboveHead: 2, tail: 3 };

/**
 * Draws the podium cutscene (scenes/cutscene.ts says what's where): a little
 * set seen very zoomed in (every set px is podium.zoom screen px), with the
 * stadium's night sky, the moon and the far crowd behind it, and a fade to
 * black over everything.
 */
export class PodiumView {
  readonly root = new Container();
  private readonly set = new Container();
  private readonly fade = new Graphics();
  private readonly flashes = new Graphics();
  private readonly bubble = new Graphics();
  private readonly hero: Sprite;
  private readonly heroMedal: Sprite;
  private readonly official: Sprite;
  private readonly officialMedal: Sprite;

  constructor(private readonly sprites: SpriteSet) {
    const set = this.set;
    set.scale.set(podium.zoom);

    const sky = new Sprite(skyTexture(SKY.w, SKY.h));
    sky.position.set(SKY.x, SKY.y);
    const stars = new Sprite(starsTexture(SKY.w, SKY.h / 2));
    stars.position.set(SKY.x, SKY.y);
    const moon = new Sprite(moonTexture());
    moon.anchor.set(0.5);
    moon.position.set(podium.moon.x, podium.moon.y);
    const stand = new Sprite(standTexture(STAND.w, STAND.w));
    // The texture's canopy is STAND_HEIGHT above its foot, which is FLOODLIGHT_HEIGHT + 4 down from its top.
    stand.position.set(STAND.x, STAND.canopyY - (FLOODLIGHT_HEIGHT + 4 - STAND_HEIGHT));
    stand.tint = CROWD_TINT;

    const cast = new Container();
    cast.tint = CAST_TINT;
    for (let x = GROUND.from; x < GROUND.to; x += TILE) {
      const top = new Sprite(sprites.tiles.track);
      top.position.set(x, 0);
      const below = new Sprite(sprites.tiles.concrete);
      below.position.set(x, TILE);
      cast.addChild(top, below);
    }
    const stage = new Sprite(sprites.podium);
    stage.position.set(PODIUM_AT.x, PODIUM_AT.y);
    cast.addChild(stage);

    const { first, second, third } = podium.steps;
    const silver = this.person(sprites.rivals.silver, second.x, second.y, 1);
    const bronze = this.person(sprites.rivals.bronze, third.x, third.y, -1);
    cast.addChild(silver, this.medalOn(sprites.medal.silver, second.x, second.y, 1, NECK.stand));
    cast.addChild(bronze, this.medalOn(sprites.medal.bronze, third.x, third.y, -1, NECK.stand));
    this.hero = this.person(sprites.vaulter.stand, first.x, first.y, 1);
    this.heroMedal = new Sprite(sprites.medal.gold);
    this.official = this.person(sprites.official.stand, 0, 0, -1);
    this.officialMedal = new Sprite(sprites.medal.gold);
    cast.addChild(this.hero, this.heroMedal, this.official, this.officialMedal);

    set.addChild(sky, stars, moon, stand, this.flashes, cast, this.bubble);
    this.root.addChild(set, this.fade);
    this.root.visible = false;
  }

  private person(texture: Sprite['texture'], x: number, y: number, facing: 1 | -1): Sprite {
    const s = new Sprite(texture);
    s.anchor.set(0.5, 1);
    s.position.set(x, y);
    s.scale.x = facing;
    return s;
  }

  /** A medal sprite hung round the neck of someone standing at (x, y). */
  private medalOn(texture: Sprite['texture'], x: number, y: number, facing: 1 | -1, neck: { x: number; y: number }): Sprite {
    const s = new Sprite(texture);
    this.hang(s, frameX(x, facing, neck.x), y + neck.y - FRAME_H);
    return s;
  }

  /** Places a medal so its ribbon's top is at (x, y). */
  private hang(medal: Sprite, x: number, y: number): void {
    medal.position.set(x - MEDAL_TOP.x, y - MEDAL_TOP.y);
  }

  render(f: PodiumFrame | null, frameDt: number): void {
    this.root.visible = f !== null;
    if (!f) return;
    this.fade.clear();
    if (f.fade > 0) this.fade.rect(0, 0, VIEW_WIDTH, VIEW_HEIGHT).fill({ color: 0x000000, alpha: f.fade });
    this.set.visible = f.showSet;
    if (!f.showSet) return;

    const z = podium.zoom;
    this.set.position.set(Math.round(VIEW_WIDTH / 2 - f.camera.x * z), Math.round(VIEW_HEIGHT / 2 - f.camera.y * z));

    const { first } = podium.steps;
    this.hero.texture = this.sprites.vaulter[f.hero];
    this.heroMedal.visible = f.medal === 'hero';
    this.hang(this.heroMedal, frameX(first.x, 1, NECK[f.hero].x), first.y + NECK[f.hero].y - FRAME_H);

    const o = f.official;
    const ox = Math.round(o.x);
    const oy = Math.round(o.y);
    this.official.texture = this.sprites.official[o.frame];
    this.official.position.set(ox, oy);
    this.official.scale.x = o.facing;
    this.officialMedal.visible = f.medal === 'official';
    const hand = HAND[o.frame];
    this.hang(this.officialMedal, frameX(ox, o.facing, hand.x), oy + hand.y - FRAME_H + 1);

    this.drawFlashes(f, frameDt);
    this.drawBubble(f.bubble);
  }

  /** Camera flashes in the far crowd: a few, or a storm while they cheer. */
  private drawFlashes(f: PodiumFrame, frameDt: number): void {
    const g = this.flashes.clear();
    const n = (f.cheer ? FLASH_RATE.cheer : FLASH_RATE.idle) * frameDt;
    const count = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    const halfW = VIEW_WIDTH / podium.zoom / 2;
    for (let i = 0; i < count; i++) {
      const x = Math.round(f.camera.x - halfW + Math.random() * halfW * 2);
      const y = Math.round(FLASH_ROWS.top + Math.random() * (FLASH_ROWS.bottom - FLASH_ROWS.top));
      g.rect(x, y, 1, 1).fill(0xffffff);
    }
  }

  /** "NOW WHAT???": a speech bubble over the champion's head, its text typed out letter by letter. */
  private drawBubble(text: string | null): void {
    const g = this.bubble.clear();
    if (text === null) return;
    const full = podium.say.text;
    const b = BUBBLE;
    const w = textWidth(full) + b.pad * 2;
    const h = GLYPH_H + b.pad * 2;
    const { first } = podium.steps;
    // The head's top is the sprite's first opaque row (6) in the standing frames.
    const headTop = first.y - FRAME_H + 6;
    const tailX = first.x + 1;
    const bottom = headTop - b.gapAboveHead - b.tail;
    const left = Math.round(tailX - w / 2);
    const top = bottom - h;
    g.rect(left - 1, top - 1, w + 2, h + 2).fill(b.ink);
    g.rect(left, top, w, h).fill(b.paper);
    g.rect(tailX - 1, bottom, 3, b.tail).fill(b.ink);
    g.rect(tailX, bottom - 1, 1, b.tail).fill(b.paper);
    let x = left + b.pad;
    for (const ch of text) {
      for (const [gx, gy] of glyphCells(ch)) g.rect(x + gx, top + b.pad + gy, 1, 1).fill(b.ink);
      x += ADVANCE;
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** Set x of the left edge of column `col` of a 16-wide frame anchored at its bottom middle (x), facing either way. */
function frameX(x: number, facing: 1 | -1, col: number): number {
  return facing > 0 ? x + col - FRAME_W / 2 : x - (col - FRAME_W / 2) - 1;
}
