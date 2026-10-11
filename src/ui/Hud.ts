import { run } from '../data/tuning';
import type { World } from '../gameplay/world';
import { el } from './dom';

/** In-game HTML overlay: speed meter, last vault readout, toasts, level banner. */
export class Hud {
  private readonly root = el('#hud');
  private readonly speedFill = el('[data-role="speed-fill"]', this.root);
  private readonly vault = el('[data-role="vault-readout"]', this.root);
  private readonly toastEl = el('[data-role="toast"]', this.root);
  private readonly banner = el('[data-role="banner"]', this.root);
  private readonly mutedBadge = el('[data-role="muted-badge"]', this.root);
  private readonly countEl = el('[data-role="count"]', this.root);
  private shownCount: number | null = null;
  private toastTimer = 0;
  private lastVaultText = '';

  show(visible: boolean): void {
    this.root.hidden = !visible;
  }

  toast(text: string, seconds = 0.9): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastTimer = seconds;
  }

  setBanner(text: string | null): void {
    this.banner.hidden = !text;
    this.banner.textContent = text ?? '';
  }

  /** The lost-pole count: each new number pops in and flashes; null hides it. */
  private showCount(n: number | null): void {
    if (n === this.shownCount) return;
    this.shownCount = n;
    this.countEl.hidden = n === null;
    if (n === null) return;
    this.countEl.textContent = String(n);
    this.countEl.classList.toggle('last', n <= 3);
    this.countEl.classList.remove('tick');
    void this.countEl.offsetWidth; // restart the animation
    this.countEl.classList.add('tick');
  }

  setMuted(muted: boolean): void {
    this.mutedBadge.hidden = !muted;
  }

  update(world: World, bestHeight: number, frameDt: number): void {
    const speed = Math.abs(world.player.vx);
    this.speedFill.style.width = `${Math.min(100, (speed / run.maxSpeed) * 100).toFixed(1)}%`;

    const v = world.lastVault;
    const text = v
      ? `LAST  ${v.height.toFixed(2)} m  ${(v.quality * 100).toFixed(0)}%\nBEST  ${bestHeight.toFixed(2)} m`
      : `BEST  ${bestHeight.toFixed(2)} m`;
    if (text !== this.lastVaultText) {
      this.vault.textContent = text;
      this.lastVaultText = text;
    }

    this.showCount(world.poleCountdown === null ? null : Math.max(1, Math.ceil(world.poleCountdown)));

    if (this.toastTimer > 0) {
      this.toastTimer -= frameDt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
  }
}
