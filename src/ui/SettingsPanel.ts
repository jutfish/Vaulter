import type { AudioEngine } from '../audio/AudioEngine';
import type { Settings } from '../saves/schemas';
import type { SaveSlot } from '../saves/storage';
import { el } from './dom';

/** Binds the settings screen to the settings save slot and the audio engine. */
export class SettingsPanel {
  private readonly root = el('#screen-settings');
  private readonly notice = el('[data-role="settings-notice"]', this.root);

  constructor(
    private readonly slot: SaveSlot<Settings>,
    private readonly audio: AudioEngine,
    /** Called after any change (e.g. to update the HUD's muted badge). */
    private readonly onChange: (s: Settings) => void = () => {},
  ) {
    for (const input of this.root.querySelectorAll<HTMLInputElement>('input[data-setting]')) {
      input.addEventListener('input', () => this.onInput(input));
    }
    this.sync();
    this.apply();
  }

  /** Copies current values into the form controls. */
  sync(): void {
    const s = this.slot.value;
    for (const input of this.root.querySelectorAll<HTMLInputElement>('input[data-setting]')) {
      const key = input.dataset.setting as keyof Settings;
      if (input.type === 'checkbox') input.checked = s[key] as boolean;
      else input.value = String(Math.round((s[key] as number) * 100));
      const out = this.root.querySelector<HTMLOutputElement>(`output[data-out="${key}"]`);
      if (out) out.value = input.type === 'checkbox' ? '' : input.value;
    }
    this.showSaveState();
  }

  /** Pushes settings into the audio engine. */
  apply(): void {
    const s = this.slot.value;
    this.audio.setVolumes(s.musicVolume, s.sfxVolume);
    this.audio.setMuted(s.muted);
  }

  setMuted(muted: boolean): void {
    this.slot.value = { ...this.slot.value, muted };
    this.commit();
  }

  private onInput(input: HTMLInputElement): void {
    const key = input.dataset.setting as keyof Settings;
    const value = input.type === 'checkbox' ? input.checked : Number(input.value) / 100;
    this.slot.value = { ...this.slot.value, [key]: value };
    this.commit();
  }

  private commit(): void {
    this.apply();
    this.onChange(this.slot.value);
    this.sync();
    const result = this.slot.save();
    this.lastError = result.ok ? null : result.reason;
    this.showSaveState();
  }

  private lastError: string | null = null;

  private showSaveState(): void {
    const msg = !this.slot.available ? 'Settings will not be saved: browser storage is unavailable.' : this.lastError;
    this.notice.hidden = !msg;
    this.notice.textContent = msg ?? '';
  }
}
