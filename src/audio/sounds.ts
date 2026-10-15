/** Sound manifest: key → file under public/assets/audio. Swap files here when real assets arrive. */
export const SOUND_FILES = {
  step: 'assets/audio/step.wav',
  hop: 'assets/audio/hop.wav',
  plant: 'assets/audio/plant.wav',
  bend: 'assets/audio/bend.wav',
  release: 'assets/audio/release.wav',
  perfect: 'assets/audio/perfect.wav',
  land: 'assets/audio/land.wav',
  bonk: 'assets/audio/bonk.wav',
  ui_click: 'assets/audio/ui_click.wav',
  crowd_ahh: 'assets/audio/crowd_ahh.wav',
  crowd_cheer: 'assets/audio/crowd_cheer.wav',
  engine: 'assets/audio/engine.wav',
  ding: 'assets/audio/ding.wav',
  whoosh: 'assets/audio/whoosh.wav',
} as const;

export const MUSIC_FILES = {
  main: 'assets/audio/music_loop.wav',
} as const;

export type SoundKey = keyof typeof SOUND_FILES;
export type MusicKey = keyof typeof MUSIC_FILES;
