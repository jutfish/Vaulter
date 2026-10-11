import { MUSIC_FILES, SOUND_FILES, type MusicKey, type SoundKey } from './sounds';

export interface PlayOptions {
  volume?: number;
  /** Playback rate (pitch). */
  rate?: number;
}

/**
 * Web Audio mixer: master → (music bus, sfx bus). The AudioContext is
 * created up front (decoding works while suspended) and resumed from the
 * first user gesture via unlock().
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly musicBus: GainNode;
  private readonly sfxBus: GainNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private music: AudioBufferSourceNode | null = null;
  private musicKey: MusicKey | null = null;
  private muted = false;
  private suspendedByFocus = false;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  get unlocked(): boolean {
    return this.ctx.state === 'running';
  }

  /** Call from a user gesture (click / key press). */
  async unlock(): Promise<void> {
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* stays locked; next gesture retries */
      }
    }
  }

  /** Loads every sound and music file; reports progress 0..1. Missing files are skipped, not fatal. */
  async loadAll(onProgress?: (fraction: number) => void): Promise<string[]> {
    const entries = [...Object.entries(SOUND_FILES), ...Object.entries(MUSIC_FILES).map(([k, v]) => [`music:${k}`, v])];
    const failed: string[] = [];
    let done = 0;
    await Promise.all(
      entries.map(async ([key, url]) => {
        try {
          const res = await fetch(import.meta.env.BASE_URL + url!);
          if (!res.ok) throw new Error(String(res.status));
          const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(key!, buf);
        } catch {
          failed.push(key!);
        }
        done++;
        onProgress?.(done / entries.length);
      }),
    );
    return failed;
  }

  setVolumes(music: number, sfx: number): void {
    this.musicBus.gain.value = music;
    this.sfxBus.gain.value = sfx;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  play(key: SoundKey, opts: PlayOptions = {}): void {
    const buf = this.buffers.get(key);
    if (!buf || this.ctx.state !== 'running') return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const gain = this.ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    src.connect(gain).connect(this.sfxBus);
    src.start();
  }

  playMusic(key: MusicKey): void {
    if (this.musicKey === key && this.music) return;
    this.stopMusic();
    const buf = this.buffers.get(`music:${key}`);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.musicBus);
    src.start();
    this.music = src;
    this.musicKey = key;
  }

  stopMusic(): void {
    this.music?.stop();
    this.music?.disconnect();
    this.music = null;
    this.musicKey = null;
  }

  /** Focus loss: suspend the whole context (music and sfx stop advancing). */
  async suspendForFocus(): Promise<void> {
    if (this.ctx.state === 'running') {
      this.suspendedByFocus = true;
      await this.ctx.suspend();
    }
  }

  async resumeFromFocus(): Promise<void> {
    if (this.suspendedByFocus) {
      this.suspendedByFocus = false;
      await this.unlock();
    }
  }
}
