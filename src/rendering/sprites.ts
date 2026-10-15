import { Assets, Rectangle, Texture } from 'pixi.js';

/** Mirrors tools/make_placeholder_art.py. */
export const VAULTER_FRAMES = ['idle', 'run1', 'run2', 'run3', 'run4', 'rise', 'fall', 'hang', 'pike', 'land', 'stand', 'wave', 'sad', 'lookUp'] as const;
export type VaulterFrame = (typeof VAULTER_FRAMES)[number];
export const FRAME_W = 16;
export const FRAME_H = 32;
/** Pixel (in the frame) where the hands grip the pole while hanging. */
export const HANG_GRIP = { x: 8, y: 2 };

/** Mirrors TILES in tools/make_placeholder_art.py. */
export const TILE_FRAMES = [
  'grass',
  'dirt',
  'wall',
  'wallTop',
  'track',
  'concreteTop',
  'concrete',
  'seats',
  'adBoard',
  'adBoardTop',
  'roofTop',
  'roof',
  'tarmac',
  'mat',
] as const;
export type TileFrame = (typeof TILE_FRAMES)[number];

export const SPRITE_FILES = {
  vaulter: 'assets/sprites/vaulter.png',
  tiles: 'assets/sprites/tiles.png',
  flag: 'assets/sprites/flag.png',
  podium: 'assets/sprites/podium.png',
  official: 'assets/sprites/official.png',
  rivals: 'assets/sprites/rivals.png',
  medal: 'assets/sprites/medal.png',
} as const;

/** The podium cutscene's cast (mirrors the art script). Frames are 16x32 with the feet on the bottom row. */
export const OFFICIAL_FRAMES = ['stand', 'walk1', 'walk2', 'reach'] as const;
export type OfficialFrameName = (typeof OFFICIAL_FRAMES)[number];
export const RIVAL_FRAMES = ['silver', 'bronze'] as const;
export const MEDAL_FRAMES = ['gold', 'silver', 'bronze'] as const;
export const MEDAL_W = 5;
export const MEDAL_H = 8;
/** Where the medal's ribbon hangs from, in the medal frame. */
export const MEDAL_TOP = { x: 2, y: 1 };

export interface SpriteSet {
  vaulter: Record<VaulterFrame, Texture>;
  tiles: Record<TileFrame, Texture>;
  flag: Texture;
  podium: Texture;
  official: Record<OfficialFrameName, Texture>;
  rivals: Record<(typeof RIVAL_FRAMES)[number], Texture>;
  medal: Record<(typeof MEDAL_FRAMES)[number], Texture>;
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
    podium: tex(SPRITE_FILES.podium),
    official: slice(tex(SPRITE_FILES.official), OFFICIAL_FRAMES, FRAME_W, FRAME_H),
    rivals: slice(tex(SPRITE_FILES.rivals), RIVAL_FRAMES, FRAME_W, FRAME_H),
    medal: slice(tex(SPRITE_FILES.medal), MEDAL_FRAMES, MEDAL_W, MEDAL_H),
  };
}
