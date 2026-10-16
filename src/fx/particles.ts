/**
 * Gold-leaf flakes. Used for small bursts when pieces lock and for the
 * falling-leaf finale when a picture is complete.
 */
interface Flake {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  /** Flip phase: flakes tumble, so their apparent width oscillates. */
  phase: number;
  vphase: number;
  size: number;
  life: number;
  max: number;
  color: string;
  gravity: number;
  drag: number;
}

const GOLDS = ['#f6e2a3', '#e8c56c', '#d9ab4c', '#efd68b', '#c79639', '#fff1c4'];
const MIXED = [...GOLDS, '#b2341f', '#efe6d2', '#d4532f'];

export class Particles {
  private flakes: Flake[] = [];

  get active() {
    return this.flakes.length > 0;
  }

  /** Radial burst of flakes, e.g. when a piece clicks into place. */
  burst(x: number, y: number, count: number, size: number, speed: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      this.flakes.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed * 0.25,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 10,
        phase: Math.random() * Math.PI * 2,
        vphase: 6 + Math.random() * 8,
        size: size * (0.5 + Math.random() * 0.8),
        life: 0,
        max: 0.55 + Math.random() * 0.45,
        color: GOLDS[Math.floor(Math.random() * GOLDS.length)],
        gravity: speed * 1.4,
        drag: 2.2,
      });
    }
  }

  /** Flakes drifting down across a rectangle, for the finale. */
  rain(x: number, y: number, w: number, count: number, size: number) {
    for (let i = 0; i < count; i++) {
      this.flakes.push({
        x: x + Math.random() * w,
        y: y - Math.random() * w * 0.4,
        vx: (Math.random() - 0.5) * size * 4,
        vy: size * (3 + Math.random() * 4),
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 4,
        phase: Math.random() * Math.PI * 2,
        vphase: 3 + Math.random() * 4,
        size: size * (0.6 + Math.random() * 0.9),
        life: 0,
        max: 2.6 + Math.random() * 1.6,
        color: MIXED[Math.floor(Math.random() * MIXED.length)],
        gravity: size * 2,
        drag: 0.9,
      });
    }
  }

  update(dt: number) {
    const keep: Flake[] = [];
    for (const f of this.flakes) {
      f.life += dt;
      if (f.life >= f.max) continue;
      f.vy += f.gravity * dt;
      const k = Math.exp(-f.drag * dt);
      f.vx *= k;
      f.vy *= k;
      f.x += f.vx * dt + Math.sin(f.phase) * f.size * 0.6 * dt * 4;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
      f.phase += f.vphase * dt;
      keep.push(f);
    }
    this.flakes = keep;
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const f of this.flakes) {
      const t = f.life / f.max;
      ctx.save();
      ctx.globalAlpha = t < 0.8 ? 1 : (1 - t) / 0.2;
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.scale(Math.cos(f.phase), 1);
      ctx.fillStyle = f.color;
      ctx.fillRect(-f.size / 2, -f.size / 2, f.size, f.size * 0.8);
      ctx.restore();
    }
  }

  clear() {
    this.flakes = [];
  }
}
