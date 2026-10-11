import type { AudioEngine } from '../audio/AudioEngine';
import { loadSprites, type SpriteSet } from '../rendering/sprites';
import { el, showScreen } from '../ui/dom';

export interface LoadedAssets {
  sprites: SpriteSet;
  /** Sound keys that failed to load (game still runs, silently). */
  missingAudio: string[];
}

/** Preloads everything the gameplay scene needs, with a real progress bar. */
export async function runLoadingScene(base: string, audio: AudioEngine): Promise<LoadedAssets> {
  showScreen('loading');
  const fill = el('[data-role="loading-fill"]');
  const detail = el('[data-role="loading-detail"]');
  let spriteProgress = 0;
  let audioProgress = 0;
  const update = (what: string) => {
    const total = spriteProgress * 0.3 + audioProgress * 0.7;
    fill.style.width = `${(total * 100).toFixed(0)}%`;
    detail.textContent = what;
  };

  update('sprites');
  const [sprites, missingAudio] = await Promise.all([
    loadSprites(base, (f) => {
      spriteProgress = f;
      update('sprites');
    }),
    audio.loadAll((f) => {
      audioProgress = f;
      update('audio');
    }),
  ]);
  update(missingAudio.length ? `audio missing: ${missingAudio.join(', ')}` : 'ready');
  return { sprites, missingAudio };
}
