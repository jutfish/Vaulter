import { Assets, Rectangle, Texture } from 'pixi.js';

/** Mirrors tools/make_placeholder_art.py. */
export const VAULTER_FRAMES = ['idle', 'run1', 'run2', 'run3', 'run4', 'rise', 'fall', 'hang', 'pike', 'land'] as const;
export type VaulterFrame = (typeof VAULTER_FRAMES)[number];
export const FRAME_W = 16;
export const FRAME_H = 32;
/** Pixel (in the frame) where the hands grip the pole while hanging. */
export const HANG_GRIP = { x: 8, y: 2 };

export const TILE_FRAMES = ['grass', 'dirt', 'wall', 'wallTop'] as const;
export type TileFrame = (typeof TILE_FRAMES)[number];

export const SPRITE_FILES = {
  vaulter: 'assets/sprites/vaulter.png',
  tiles: 'assets/sprites/tiles.png',
  flag: 'assets/sprites/flag.png',
} as const;

export interface SpriteSet {
  vaulter: Record<VaulterFrame, Texture>;
  tiles: Record<TileFrame, Texture>;
  flag: Texture;
}

function slice<K extends string>(base: Texture, names: readonly K[], w: number, h: number): Record<K, Texture> {
  const out = {} as Record<K, Texture>;
  names.forEach((name, i) => {
    out[name] = new Texture({ source: base.source, frame: new Rectangle(i * w, 0, w, h) });
  });
  return out;
}

/** Loads all sprite sheets (with progress) and cuts them into frames once. */
export async function loadSprites(base: string, onProgress?: (f: number) => void): Promise<SpriteSet> {
  const urls = Object.values(SPRITE_FILES).map((p) => base + p);
  const loaded = await Assets.load<Texture>(urls, onProgress);
  const tex = (p: string) => {
    const t = loaded[base + p]!;
    t.source.scaleMode = 'nearest';
    return t;
  };
  return {
    vaulter: slice(tex(SPRITE_FILES.vaulter), VAULTER_FRAMES, FRAME_W, FRAME_H),
    tiles: slice(tex(SPRITE_FILES.tiles), TILE_FRAMES, 16, 16),
    flag: tex(SPRITE_FILES.flag),
  };
}
