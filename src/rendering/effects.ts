import { Container, Graphics } from 'pixi.js';

interface Particle {
  g: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
}

/**
 * Pooled square particles (dust, sparks). Graphics objects are created once
 * and recycled; nothing is allocated per spawn after warm-up.
 */
export class ParticlePool {
  readonly container = new Container();
  private readonly free: Particle[] = [];
  private readonly live: Particle[] = [];

  constructor(size = 96) {
    for (let i = 0; i < size; i++) {
      const g = new Graphics().rect(0, 0, 1, 1).fill(0xffffff);
      g.visible = false;
      this.container.addChild(g);
      this.free.push({ g, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, gravity: 0 });
    }
  }

  spawn(x: number, y: number, vx: number, vy: number, life: number, color: number, size = 1, gravity = 200): void {
    const p = this.free.pop() ?? this.live.shift();
    if (!p) return;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = p.maxLife = life;
    p.gravity = gravity;
    p.g.tint = color;
    p.g.scale.set(size);
    p.g.visible = true;
    p.g.alpha = 1;
    this.live.push(p);
  }

  /** Puff of dust, spreading away from (x, y). */
  dust(x: number, y: number, count: number, spread: number, dir = 0): void {
    for (let i = 0; i < count; i++) {
      const vx = (Math.random() - 0.5) * spread + dir * spread * 0.5;
      const vy = -Math.random() * spread * 0.4;
      this.spawn(x + (Math.random() - 0.5) * 6, y - 1, vx, vy, 0.25 + Math.random() * 0.25, 0xd8c8a8, Math.random() < 0.3 ? 2 : 1, 120);
    }
  }

  burst(x: number, y: number, count: number, color: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.spawn(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 0.35, color, 1, 0);
    }
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        p.g.visible = false;
        this.live.splice(i, 1);
        this.free.push(p);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.g.position.set(Math.round(p.x), Math.round(p.y));
      p.g.alpha = Math.min(1, (p.life / p.maxLife) * 2);
    }
  }
}
