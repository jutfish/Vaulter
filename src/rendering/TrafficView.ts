import { Container, Graphics, Sprite, TilingSprite, type Texture } from 'pixi.js';
import { glyphCells } from '../data/pixelFont';
import { TILE, traffic as cfg, VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import { VEHICLES, vehicleSize, type VehicleType } from '../data/vehicles';
import type { GameEvent } from '../gameplay/player';
import { instancesOf, type RoadsideThing } from '../gameplay/traffic';
import type { World } from '../gameplay/world';
import type { RoadsideSprite, SpriteSet } from './sprites';
import { cityTexture, moonTexture, skyTexture, starsTexture } from './stadium';

// The traffic level's look (v0.9): night sky and moon, the city rushing past
// in parallax, the vehicles (static: it's their frame) with spinning wheels,
// the moving road with its dashes, and everything fixed to the road sliding
// back: lamp posts, bridges, signs, trees and the tall buildings.

/** Parallax of the skyline and the stars, and where the moon hangs on screen (as the stadium). */
const CITY_PARALLAX = 0.2;
const STARS_PARALLAX = 0.03;
const MOON_AT = { x: 372, y: 14 };
/** Road: asphalt, the kerb line on top, and the lane dashes (length, spacing) that sell the speed. */
const ASPHALT = 0x2e2e36;
const ASPHALT_DEEP = 0x22222a;
const KERB = 0x6a6a74;
const DASH = { len: 14, every: 40, y: 7, color: 0xe8e4d0 };
/** Which sprite each roadside thing uses, and how high its bottom sits above the road (px). */
const ROADSIDE: Record<RoadsideThing['kind'], { sprite: RoadsideSprite; lift: number; dx: number }> = {
  busStop: { sprite: 'busstop', lift: 0, dx: -8 },
  lamp: { sprite: 'lamp', lift: 0, dx: 0 },
  bridge: { sprite: 'bridge', lift: 0, dx: 0 },
  warning: { sprite: 'warning', lift: 0, dx: 0 },
  gantry: { sprite: 'gantry', lift: 0, dx: 0 },
  tree: { sprite: 'tree', lift: 0, dx: 0 },
  building: { sprite: 'building', lift: 0, dx: 0 },
};
/** Text on things, in the 3x5 pixel font. */
const BLIND = { text: 'CITY TOUR', color: 0xffb030 };
const WIDE_LOAD = { text: 'WIDE LOAD', color: 0x1a1a20 };
const GANTRY_TEXT = ['CITY CENTRE', 'AIRPORT  12'];
const WARNING_TEXT = '5.3M';
/** The medal's flight into the fare box (s) and the fare box's offset from the platform's left edge. */
const FARE_FLIGHT = 0.45;
const FAREBOX_DX = 26;

function drawText(g: Graphics, text: string, x: number, y: number, color: number, k = 1): void {
  let cx = x;
  for (const ch of text) {
    for (const [gx, gy] of glyphCells(ch)) g.rect(cx + gx * k, y + gy * k, k, k).fill(color);
    cx += 4 * k;
  }
}

export class TrafficView {
  /** Screen-fixed: sky, stars, moon. */
  readonly sky = new Container();
  /** Parallax: the skyline. */
  readonly far = new Container();
  /** World layers: roadside (behind the vehicles), the vehicles, the road (in front of their wheels), wheels. */
  readonly roadside = new Container();
  readonly vehicles = new Container();
  readonly road = new Graphics();
  readonly wheels = new Graphics();
  /** In front of the vaulter: the medal while it's worn or flying into the fare box. */
  readonly front = new Container();
  private readonly stars: TilingSprite;
  private readonly city: TilingSprite;
  private readonly signText = new Graphics();
  private readonly pool = new Map<RoadsideSprite, Sprite[]>();
  private readonly medal: Sprite;
  private readonly fareBox: Sprite;
  private readonly roadY: number;
  private prevOffset = 0;
  private currOffset = 0;
  private fareT = -1;

  constructor(
    private readonly world: World,
    private readonly sprites: SpriteSet,
  ) {
    const tr = world.traffic!;
    this.roadY = tr.roadY;
    this.sky.addChild(new Sprite(skyTexture(VIEW_WIDTH, VIEW_HEIGHT)));
    this.stars = new TilingSprite({ texture: starsTexture(VIEW_WIDTH, VIEW_HEIGHT), width: VIEW_WIDTH, height: VIEW_HEIGHT });
    const moon = new Sprite(moonTexture());
    moon.position.set(MOON_AT.x, MOON_AT.y);
    this.sky.addChild(this.stars, moon);
    this.city = new TilingSprite({ texture: cityTexture(960, 110), width: VIEW_WIDTH, height: 110 });
    this.far.addChild(this.city);

    // The vehicles, with their writing.
    const text = new Graphics();
    for (const v of tr.data.vehicles) {
      const size = vehicleSize(v.type);
      const sp = new Sprite(sprites.vehicles[v.type]);
      const x = v.col * TILE;
      const y = this.roadY - size.h;
      sp.position.set(x, y);
      this.vehicles.addChild(sp);
      this.writeOn(text, v.type, x, y, size.w);
    }
    this.vehicles.addChild(text);
    const pl = tr.data.platform;
    this.fareBox = new Sprite(sprites.roadside.farebox);
    this.fareBox.position.set(pl.from * TILE + FAREBOX_DX, this.roadY - pl.h * TILE - 16);
    this.vehicles.addChild(this.fareBox);
    this.roadside.addChild(this.signText);
    this.medal = new Sprite(sprites.medal.gold);
    this.front.addChild(this.medal);
    this.currOffset = this.prevOffset = tr.offset;
  }

  /** Lettering painted on the vehicles. */
  private writeOn(g: Graphics, type: VehicleType, x: number, y: number, w: number): void {
    if (type === 'bus') drawText(g, BLIND.text, x + w - 45, y + VEHICLES.bus.above + 19, BLIND.color);
    if (type === 'houseRig') drawText(g, WIDE_LOAD.text, x + 10 * TILE + 7, y + VEHICLES.houseRig.above + 6, WIDE_LOAD.color);
    if (type === 'lorry') drawText(g, 'MOVERS', x + 32, y + 18, 0xf4f4f0, 1);
  }

  resetView(): void {
    this.currOffset = this.prevOffset = this.world.traffic!.offset;
    this.fareT = -1;
  }

  onStep(dt: number, events: readonly GameEvent[]): void {
    this.prevOffset = this.currOffset;
    this.currOffset = this.world.traffic!.offset;
    if (this.fareT >= 0) this.fareT += dt;
    for (const e of events) if (e.type === 'fare') this.fareT = 0;
  }

  /** How far the vehicles have driven on since you got off onto a canopy (px). */
  private driveOff(): number {
    const tr = this.world.traffic!;
    if (tr.frozenAt === null) return 0;
    const t = this.world.time - tr.frozenAt;
    return 0.5 * (cfg.speed / 2) * t * t + cfg.speed * t;
  }

  render(viewX: number, viewY: number, baseViewY: number, alpha: number): void {
    const offset = this.prevOffset + (this.currOffset - this.prevOffset) * alpha;
    const drive = this.driveOff();
    const dy = viewY - baseViewY;
    this.stars.tilePosition.set(-Math.round((viewX + offset) * STARS_PARALLAX), -Math.round(dy * STARS_PARALLAX));
    this.city.tilePosition.x = -Math.round((viewX + offset) * CITY_PARALLAX);
    this.far.position.set(0, this.roadY - 110 - baseViewY - Math.round(dy * CITY_PARALLAX));
    this.vehicles.x = Math.round(drive);
    this.drawRoad(viewX, offset);
    this.drawWheels(offset + drive, drive);
    this.placeRoadside(viewX, offset);
    this.drawMedal();
  }

  /** The road: asphalt, a kerb line, and dashes moving back at the traffic's speed. */
  private drawRoad(viewX: number, offset: number): void {
    const g = this.road.clear();
    const x0 = viewX - 16;
    const y = this.roadY;
    g.rect(x0, y, VIEW_WIDTH + 32, 96).fill(ASPHALT_DEEP);
    g.rect(x0, y, VIEW_WIDTH + 32, 14).fill(ASPHALT);
    g.rect(x0, y, VIEW_WIDTH + 32, 1).fill(KERB);
    const phase = (((offset + x0) % DASH.every) + DASH.every) % DASH.every;
    for (let x = x0 - phase; x < x0 + VIEW_WIDTH + 32; x += DASH.every) g.rect(Math.round(x), y + DASH.y, DASH.len, 2).fill(DASH.color);
  }

  /** Wheels turn as the road goes by under them (and keep turning as the traffic drives off). */
  private drawWheels(travel: number, drive: number): void {
    const g = this.wheels.clear();
    for (const v of this.world.traffic!.data.vehicles) {
      const spec = VEHICLES[v.type];
      const r = spec.wheelRadius;
      for (const wx of spec.wheels) {
        const cx = v.col * TILE + wx + Math.round(drive);
        const cy = this.roadY - r;
        g.circle(cx, cy, r).fill(0x16161c);
        g.circle(cx, cy, r - 2).fill(0x8a8e98);
        const a = travel / r;
        for (const k of [0, Math.PI / 2]) {
          const ax = Math.cos(a + k) * (r - 2);
          const ay = Math.sin(a + k) * (r - 2);
          g.moveTo(cx - ax, cy - ay).lineTo(cx + ax, cy + ay).stroke({ width: 1, color: 0x3a3c46 });
        }
      }
    }
  }

  /** Everything fixed to the road, where it is now (copies come from a pool per sprite). */
  private placeRoadside(viewX: number, offset: number): void {
    const tr = this.world.traffic!;
    const used = new Map<RoadsideSprite, number>();
    const t = this.signText.clear();
    const lo = viewX - 260;
    const hi = viewX + VIEW_WIDTH + 20;
    for (const thing of tr.data.roadside) {
      const look = ROADSIDE[thing.kind];
      for (const x of instancesOf(thing, tr.data.block, offset, lo, hi)) {
        const tex = this.sprites.roadside[look.sprite];
        const sx = Math.round(x + look.dx);
        let sy = this.roadY - look.lift - tex.height;
        if (thing.kind === 'bridge') sy = this.roadY - tr.data.bridge.top;
        this.take(look.sprite, used, tex).position.set(sx, sy);
        if (thing.kind === 'building') {
          const c = tr.data.canopy;
          this.take('canopy', used, this.sprites.roadside.canopy).position.set(Math.round(x + c.dx), this.roadY - c.top);
        }
        if (thing.kind === 'gantry') GANTRY_TEXT.forEach((line, i) => drawText(t, line, sx + 12, sy + 11 + i * 9, 0xf4f4f0));
        if (thing.kind === 'warning') drawText(t, WARNING_TEXT, sx + 6, sy + 22, 0x1a1a20);
      }
    }
    for (const [name, list] of this.pool) {
      const n = used.get(name) ?? 0;
      for (let i = 0; i < list.length; i++) list[i]!.visible = i < n;
    }
  }

  private take(name: RoadsideSprite, used: Map<RoadsideSprite, number>, tex: Texture): Sprite {
    let list = this.pool.get(name);
    if (!list) this.pool.set(name, (list = []));
    const i = used.get(name) ?? 0;
    used.set(name, i + 1);
    if (!list[i]) {
      const sp = new Sprite(tex);
      // Buildings stand furthest back.
      if (name === 'building') this.roadside.addChildAt(sp, 0);
      else this.roadside.addChildAt(sp, this.roadside.children.length - 1);
      list[i] = sp;
    }
    return list[i]!;
  }

  /** The gold medal on the vaulter's chest until it goes into the fare box. */
  private drawMedal(): void {
    const tr = this.world.traffic!;
    const p = this.world.player;
    const chest = { x: p.x + p.facing - 2, y: p.y - 19 };
    const box = { x: this.fareBox.x + 2, y: this.fareBox.y - 2 };
    if (tr.paidAt === null) {
      this.medal.visible = true;
      this.medal.position.set(Math.round(chest.x), Math.round(chest.y));
      return;
    }
    if (this.fareT < 0 || this.fareT > FARE_FLIGHT) {
      this.medal.visible = false;
      return;
    }
    // A little hop through the air into the slot.
    const k = this.fareT / FARE_FLIGHT;
    this.medal.visible = true;
    this.medal.position.set(Math.round(chest.x + (box.x - chest.x) * k), Math.round(chest.y + (box.y - chest.y) * k - 14 * Math.sin(Math.PI * k)));
  }

  /** Is the medal still flying (for the ding at the end)? */
  get fareLanding(): boolean {
    return this.fareT >= FARE_FLIGHT - 1e-9 && this.fareT < FARE_FLIGHT + 0.02;
  }
}
