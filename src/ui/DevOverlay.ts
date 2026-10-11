import { bendEnergy, totalEnergy } from '../gameplay/vault';
import type { World } from '../gameplay/world';
import { el } from './dom';

const HISTORY = 180; // frames kept for the graph and the worst-frame stat
const SPIKE_MS = 25;

/**
 * Development-only performance + physics overlay (F3 or ` toggles).
 * Shows FPS, average and worst frame time over the last ~3 s, spike count,
 * sim steps per frame, and a frame-time graph so spikes are visible, not
 * averaged away.
 */
export class DevOverlay {
  private readonly root = el('#dev');
  private readonly text = el<HTMLPreElement>('[data-role="dev-text"]', this.root);
  private readonly graph = el<HTMLCanvasElement>('[data-role="dev-graph"]', this.root);
  private readonly ctx = this.graph.getContext('2d')!;
  private readonly frames = new Float32Array(HISTORY);
  private index = 0;
  private count = 0;
  private spikes = 0;
  private lastTextUpdate = 0;
  visible = false;

  toggle(): void {
    this.visible = !this.visible;
    this.root.hidden = !this.visible;
  }

  /** Record one rendered frame's real duration (ms). Cheap; always on so stats are ready when shown. */
  recordFrame(ms: number): void {
    this.frames[this.index] = ms;
    this.index = (this.index + 1) % HISTORY;
    this.count = Math.min(HISTORY, this.count + 1);
    if (ms > SPIKE_MS) this.spikes++;
  }

  update(now: number, simSteps: number, world: World | null): void {
    if (!this.visible || now - this.lastTextUpdate < 250) return;
    this.lastTextUpdate = now;
    let sum = 0;
    let worst = 0;
    for (let i = 0; i < this.count; i++) {
      const f = this.frames[i]!;
      sum += f;
      worst = Math.max(worst, f);
    }
    const avg = this.count ? sum / this.count : 0;
    const lines = [
      `FPS ${avg > 0 ? (1000 / avg).toFixed(0) : '-'}   avg ${avg.toFixed(2)} ms`,
      `worst ${worst.toFixed(1)} ms (3s)   spikes>${SPIKE_MS}ms ${this.spikes}`,
      `sim steps/frame ${simSteps}`,
    ];
    if (world) {
      const p = world.player;
      lines.push(`pos ${p.x.toFixed(0)},${p.y.toFixed(0)}  v ${p.vx.toFixed(0)},${p.vy.toFixed(0)}  ${p.poleMode}`);
      const v = p.vault;
      if (v) {
        lines.push(
          `phi ${((v.phi * 180) / Math.PI).toFixed(0)}°  r ${v.r.toFixed(1)}  bend ${bendEnergy(v).toFixed(0)}`,
          `E ${totalEnergy(v).toFixed(0)} / ${v.plantEnergy.toFixed(0)}  ${v.releasing ? 'RELEASING' : v.bleeding ? 'BLEEDING' : 'held'}`,
        );
      } else {
        lines.push(`last quality ${(p.lastQuality * 100).toFixed(0)}%`);
      }
    }
    this.text.textContent = lines.join('\n');
    this.drawGraph();
  }

  private drawGraph(): void {
    const { width: w, height: h } = this.graph;
    const c = this.ctx;
    c.clearRect(0, 0, w, h);
    const scale = h / 50; // 50 ms full height
    c.fillStyle = 'rgba(255,255,255,0.15)';
    c.fillRect(0, h - 16.7 * scale, w, 1);
    for (let i = 0; i < Math.min(w, this.count); i++) {
      const idx = (this.index - 1 - i + HISTORY * 2) % HISTORY;
      const ms = this.frames[idx]!;
      c.fillStyle = ms > SPIKE_MS ? '#e06060' : ms > 17.5 ? '#f0d060' : '#70d080';
      const bh = Math.min(h, ms * scale);
      c.fillRect(w - 1 - i, h - bh, 1, bh);
    }
  }
}
