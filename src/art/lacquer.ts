import { Rng, range } from '../core/rng';

/**
 * Drawing helpers that imitate Vietnamese lacquer painting (sơn mài):
 * polished dark grounds, cinnabar, gold and silver leaf, and crushed-eggshell inlay.
 * Paintings are drawn in a 1200×900 design space and scaled to any resolution.
 */
export const W = 1200;
export const H = 900;

export const C = {
  black: '#1a0b08',
  umber: '#3b1a10',
  oxblood: '#5e1a12',
  cinnabar: '#b2341f',
  vermilion: '#d4532f',
  ochre: '#c98a2e',
  gold: '#e0b65a',
  goldPale: '#f3dc98',
  goldDeep: '#8f6522',
  egg: '#efe6d2',
  eggShade: '#cfc2a4',
  silver: '#c9cfcc',
  jade: '#2f5a4a',
  jadeDeep: '#173329',
  teal: '#3d6f6a',
  pearl: '#9cc3bc',
  rose: '#d9826f',
};

export type Ctx = CanvasRenderingContext2D;
export type PathFn = (ctx: Ctx) => void;

export function linear(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

export function radial(ctx: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, string][]) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

export function fill(ctx: Ctx, path: PathFn, style: string | CanvasGradient) {
  ctx.beginPath();
  path(ctx);
  ctx.fillStyle = style;
  ctx.fill();
}

export function clipped(ctx: Ctx, path: PathFn, draw: () => void) {
  ctx.save();
  ctx.beginPath();
  path(ctx);
  ctx.clip();
  draw();
  ctx.restore();
}

/** Lacquer ground: deep gradient plus fine polishing grain. */
export function ground(ctx: Ctx, rng: Rng, top: string, bottom: string) {
  ctx.fillStyle = linear(ctx, 0, 0, 0, H, [
    [0, top],
    [1, bottom],
  ]);
  ctx.fillRect(0, 0, W, H);
  grain(ctx, rng, 0, 0, W, H, 0.05);
}

export function grain(ctx: Ctx, rng: Rng, x: number, y: number, w: number, h: number, alpha: number) {
  const n = Math.floor((w * h) / 900);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const light = rng() > 0.5;
    ctx.fillStyle = light ? `rgba(255,236,200,${alpha * rng()})` : `rgba(0,0,0,${alpha * 1.4 * rng()})`;
    ctx.fillRect(x + rng() * w, y + rng() * h, 1 + rng() * 2.5, 1 + rng() * 2.5);
  }
  ctx.restore();
}

const GOLD_TONES = ['#f6e2a3', '#e8c56c', '#d9ab4c', '#c79639', '#b3842e', '#efd68b'];
const SILVER_TONES = ['#eef1ef', '#d6dcd9', '#bfc7c3', '#a9b2ae', '#e2e6e4'];

/**
 * Scatter of hand-laid metal leaf: small, slightly rotated square flakes.
 * `density` is flakes per 10 000 design-px² inside the bounding box.
 */
export function leaf(
  ctx: Ctx,
  rng: Rng,
  box: { x: number; y: number; w: number; h: number },
  density: number,
  size: [number, number],
  metal: 'gold' | 'silver' = 'gold',
  alpha = 1,
) {
  const tones = metal === 'gold' ? GOLD_TONES : SILVER_TONES;
  const n = Math.floor(((box.w * box.h) / 10000) * density);
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    const s = range(rng, size[0], size[1]);
    const x = box.x + rng() * box.w;
    const y = box.y + rng() * box.h;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(range(rng, -0.5, 0.5));
    ctx.fillStyle = tones[Math.floor(rng() * tones.length)];
    ctx.globalAlpha = alpha * range(rng, 0.55, 1);
    // Torn-edge flake: an irregular quad.
    ctx.beginPath();
    ctx.moveTo(-s / 2 + rng() * s * 0.15, -s / 2);
    ctx.lineTo(s / 2, -s / 2 + rng() * s * 0.15);
    ctx.lineTo(s / 2 - rng() * s * 0.15, s / 2);
    ctx.lineTo(-s / 2, s / 2 - rng() * s * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Crushed-eggshell inlay: a jittered mosaic of small pale fragments with dark seams.
 * Call inside a clip to confine it to a shape.
 */
export function eggshell(
  ctx: Ctx,
  rng: Rng,
  box: { x: number; y: number; w: number; h: number },
  cell: number,
  tones: string[] = [C.egg, '#f6eedc', '#e6dbc1', C.eggShade],
  seam = 'rgba(40,18,10,0.55)',
) {
  const cols = Math.ceil(box.w / cell) + 1;
  const rows = Math.ceil(box.h / cell) + 1;
  const pts: { x: number; y: number }[][] = [];
  for (let r = 0; r <= rows; r++) {
    const row: { x: number; y: number }[] = [];
    for (let c = 0; c <= cols; c++) {
      row.push({
        x: box.x + c * cell + range(rng, -0.38, 0.38) * cell,
        y: box.y + r * cell + range(rng, -0.38, 0.38) * cell,
      });
    }
    pts.push(row);
  }
  ctx.save();
  ctx.fillStyle = seam;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  const gap = Math.max(0.6, cell * 0.07);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const quad = [pts[r][c], pts[r][c + 1], pts[r + 1][c + 1], pts[r + 1][c]];
      const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
      const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
      // Some cells split into two triangles, like real crushed shell.
      const split = rng() < 0.45;
      const polys = split ? [[quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]] : [quad];
      for (const poly of polys) {
        ctx.beginPath();
        poly.forEach((p, i) => {
          const x = p.x + (cx - p.x) * (gap / cell) * 2;
          const y = p.y + (cy - p.y) * (gap / cell) * 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = tones[Math.floor(rng() * tones.length)];
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/** Polished-surface finish: soft top-left sheen and a vignette. */
export function finish(ctx: Ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = radial(ctx, W * 0.28, H * 0.18, 0, W * 0.9, [
    [0, 'rgba(255,240,210,0.35)'],
    [1, 'rgba(255,240,210,0)'],
  ]);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = radial(ctx, W / 2, H / 2, W * 0.35, W * 0.78, [
    [0, 'rgba(10,3,2,0)'],
    [1, 'rgba(10,3,2,0.55)'],
  ]);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Smooth closed path through points (Catmull-Rom to Bézier). */
export function smooth(ctx: Ctx, pts: { x: number; y: number }[], closed = true) {
  const n = pts.length;
  const get = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  ctx.moveTo(pts[0].x, pts[0].y);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    );
  }
  if (closed) ctx.closePath();
}

/** A ridge line from x0 to x1 with random peaks, closed down to `base`. */
export function ridge(rng: Rng, x0: number, x1: number, yBase: number, amp: number, steps: number, base: number) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const env = Math.sin(t * Math.PI);
    pts.push({ x: x0 + (x1 - x0) * t, y: yBase - env * amp * range(rng, 0.55, 1.1) });
  }
  return (ctx: Ctx) => {
    ctx.moveTo(x0, base);
    ctx.lineTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    ctx.lineTo(x1, pts[pts.length - 1].y);
    ctx.lineTo(x1, base);
    ctx.closePath();
  };
}

/** Thin incised gold line, as scratched into lacquer. */
export function incise(ctx: Ctx, path: PathFn, width = 2, color = C.gold, alpha = 0.9) {
  ctx.save();
  ctx.beginPath();
  path(ctx);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.restore();
}

export function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha = 0.6) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = radial(ctx, x, y, 0, r, [
    [0, color],
    [1, 'rgba(0,0,0,0)'],
  ]);
  ctx.globalAlpha = alpha;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
