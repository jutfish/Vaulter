import { Texture } from 'pixi.js';

// The stadium backdrop (v0.7): a night sky with the moon, the city skyline,
// and the far stand full of people under floodlights. Painted pixel by pixel
// into canvases once at load (seeded, so it looks the same every time).

type RGB = [number, number, number];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Canvas {
  readonly el: HTMLCanvasElement;
  private readonly img: ImageData;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.el = document.createElement('canvas');
    this.el.width = w;
    this.el.height = h;
    this.img = new ImageData(w, h);
  }

  px(x: number, y: number, c: RGB, a = 255): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.img.data[i] = c[0];
    this.img.data[i + 1] = c[1];
    this.img.data[i + 2] = c[2];
    this.img.data[i + 3] = a;
  }

  rect(x: number, y: number, w: number, h: number, c: RGB, a = 255): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c, a);
  }

  texture(): Texture {
    this.el.getContext('2d')!.putImageData(this.img, 0, 0);
    const t = Texture.from(this.el);
    t.source.scaleMode = 'nearest';
    return t;
  }
}

/** Night sky gradient (screen sized), banded and dithered like old hardware. */
export function skyTexture(w: number, h: number): Texture {
  const c = new Canvas(w, h);
  const top: RGB = [10, 14, 38];
  const bottom: RGB = [44, 52, 98];
  const bands = 8;
  for (let y = 0; y < h; y++) {
    const f = y / h;
    const band = Math.min(bands - 1, Math.floor(f * bands));
    // Checkerboard dither between this band and the next across the band's lower half.
    const within = f * bands - band;
    const next = within > 0.5 ? Math.min(bands - 1, band + 1) : band;
    for (let x = 0; x < w; x++) {
      const b = (x + y) % 2 === 0 ? next : band;
      const t = b / (bands - 1);
      c.px(x, y, [top[0] + (bottom[0] - top[0]) * t, top[1] + (bottom[1] - top[1]) * t, top[2] + (bottom[2] - top[2]) * t]);
    }
  }
  return c.texture();
}

/** Stars over a wide strip (scrolls very slowly). */
export function starsTexture(w: number, h: number): Texture {
  const c = new Canvas(w, h);
  const r = rng(7);
  for (let i = 0; i < (w * h) / 420; i++) {
    const x = r() * w;
    const y = r() * h * r();
    const bright = r();
    c.px(x, y, bright > 0.9 ? [255, 255, 230] : [150 + bright * 80, 160 + bright * 80, 200], bright > 0.5 ? 255 : 160);
  }
  return c.texture();
}

/** The moon: big, full and pocked, with a soft glow. Always up there. */
export function moonTexture(): Texture {
  const R = 22;
  const glow = 10;
  const size = (R + glow) * 2;
  const c = new Canvas(size, size);
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= R) {
        // Lit from the upper left: lighter there, a darker rim to the lower right.
        const shade = (x - cx + (y - cy)) / (2 * R);
        const base = 236 - Math.max(0, shade) * 50;
        c.px(x, y, [base, base - 6, base - 22]);
      } else if (d <= R + glow && (x + y) % 2 === 0) {
        c.px(x, y, [200, 210, 240], Math.round(70 * (1 - (d - R) / glow)));
      }
    }
  }
  const craters: [number, number, number][] = [
    [-8, -6, 5],
    [6, -10, 3],
    [9, 4, 6],
    [-4, 9, 4],
    [-12, 6, 2],
    [2, 0, 2],
    [14, -4, 2],
  ];
  for (const [ox, oy, rr] of craters) {
    for (let y = -rr; y <= rr; y++) {
      for (let x = -rr; x <= rr; x++) {
        const d = Math.hypot(x, y);
        if (d > rr) continue;
        const px = cx + ox + x;
        const py = cy + oy + y;
        c.px(px, py, d > rr - 1 && x + y < 0 ? [170, 166, 150] : [200, 196, 178]);
      }
    }
  }
  return c.texture();
}

/** The city beyond the stadium: dark towers with a few lit windows. Bottom row = the horizon. */
export function cityTexture(w: number, h: number): Texture {
  const c = new Canvas(w, h + BELOW_HORIZON);
  c.rect(0, h, w, BELOW_HORIZON, [26, 32, 62]);
  const r = rng(11);
  const body: RGB = [26, 32, 62];
  const lit: RGB = [236, 206, 120];
  let x = 0;
  while (x < w) {
    const bw = 14 + Math.floor(r() * 26);
    const bh = 20 + Math.floor(r() * r() * (h - 24));
    c.rect(x, h - bh, bw, bh, body);
    if (r() > 0.7) c.rect(x + Math.floor(bw / 2), h - bh - 6, 1, 6, body); // antenna
    for (let wy = h - bh + 3; wy < h - 2; wy += 4) {
      for (let wx = x + 2; wx < x + bw - 2; wx += 3) if (r() > 0.78) c.px(wx, wy, lit, 200);
    }
    x += bw + Math.floor(r() * 4);
  }
  return c.texture();
}

/** How far the backdrops reach below the horizon (the camera rises, so the far layers sink). */
export const BELOW_HORIZON = 160;

/** Height of the far stand above its foot, and of the floodlight towers. */
export const STAND_HEIGHT = 92;
export const FLOODLIGHT_HEIGHT = 150;

const SHIRTS: RGB[] = [
  [214, 52, 64],
  [52, 96, 196],
  [240, 200, 60],
  [240, 240, 236],
  [60, 160, 90],
  [230, 120, 40],
  [150, 70, 170],
];
const SKINS: RGB[] = [
  [240, 188, 140],
  [196, 140, 98],
  [140, 92, 60],
  [96, 62, 42],
];

/**
 * The far stand (width w), seen across the infield: an advertising wall, rows
 * of people stepping back and up, the roof canopy, floodlight towers. The
 * stand ends `w - endX` px before the strip does (open sky past it).
 */
export function standTexture(w: number, endX: number): Texture {
  const h = FLOODLIGHT_HEIGHT + 4;
  const c = new Canvas(w, h + BELOW_HORIZON);
  c.rect(0, h, endX, BELOW_HORIZON, [30, 32, 44]);
  for (let y = h; y < h + BELOW_HORIZON; y++) c.rect(endX, y, Math.round((y - (h - STAND_HEIGHT)) * 0.25), 1, [34, 36, 48]);
  const r = rng(3);
  const foot = h;
  const wallTop = foot - 12;
  const canopy = foot - STAND_HEIGHT;
  // Stand structure.
  c.rect(0, canopy, endX, foot - canopy, [40, 42, 56]);
  // Advertising wall along the front: lit panels.
  for (let x = 0; x < endX; x += 24) {
    const col = SHIRTS[Math.floor(r() * SHIRTS.length)]!;
    c.rect(x, wallTop + 2, 22, 7, [228, 228, 222]);
    c.rect(x + 3, wallTop + 4, 8, 3, col);
    c.rect(x + 13, wallTop + 4, 6, 3, [60, 60, 70]);
  }
  // The crowd: rows 4 px apart, a person every 2 px (head over shirt), some empty seats.
  for (let row = 0; ; row++) {
    const y = wallTop - 4 - row * 4;
    if (y < canopy + 8) break;
    c.rect(0, y + 3, endX, 1, [30, 30, 40]); // tread
    for (let x = (row % 2) * 1; x < endX - 1; x += 2) {
      if (r() < 0.06) {
        c.px(x, y + 1, [52, 96, 196]); // an empty blue seat
        continue;
      }
      c.px(x, y, SKINS[Math.floor(r() * SKINS.length)]!);
      c.px(x, y + 1, SHIRTS[Math.floor(r() * SHIRTS.length)]!);
      c.px(x, y + 2, SHIRTS[Math.floor(r() * SHIRTS.length)]!, 200);
    }
  }
  // Roof canopy with lights along its underside, and the stand's open end.
  c.rect(0, canopy, endX + 6, 6, [24, 26, 36]);
  for (let x = 4; x < endX; x += 10) c.px(x, canopy + 6, [255, 244, 200]);
  for (let y = canopy; y < foot; y++) c.rect(endX, y, Math.max(0, Math.round((y - canopy) * 0.25)), 1, [34, 36, 48]);
  // Floodlight towers on the roof.
  for (let x = 120; x < endX - 20; x += 360) {
    c.rect(x, 4, 2, canopy - 4, [70, 72, 86]);
    c.rect(x - 6, 0, 14, 7, [70, 72, 86]);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) c.rect(x - 5 + i * 3, 1 + j * 3, 2, 2, [255, 252, 220]);
  }
  return c.texture();
}
