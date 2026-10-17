// Turns each mask into a smooth silhouette outline for shaped puzzles:
// removes whiskers and specks, fills holes, traces the outline and simplifies it.
// Writes public/photos/<id>.json in board units (1200×900), and a sharp 4:3 crop
// of the animal with some background from the full-size source to public/photos/<id>-s.webp.
// Photos marked "shape": false in selection.json (silhouette not usable) are skipped.
// Run: node scripts/animals/shapes.mjs   (after build.mjs and masks.mjs)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('src/photos/manifest.json', root), 'utf8'));
const selection = JSON.parse(readFileSync(new URL('scripts/animals/selection.json', root), 'utf8'));
const frames = JSON.parse(readFileSync(new URL('scripts/animals/frames.json', root), 'utf8'));
const skip = new Set(selection.filter((s) => s.shape === false).map((s) => s.id));

/** 4:3 window around the silhouette with some background, inside the 1200×900 frame (matches shapeWindow in src/jigsaw/shape.ts). */
function shapeWindow([x, y, w, h], margin = 0.16) {
  const m = Math.max(w, h) * margin;
  let ww = w + m * 2;
  let wh = h + m * 2;
  if (ww / wh > 4 / 3) wh = (ww * 3) / 4;
  else ww = (wh * 4) / 3;
  if (ww > 1200 || wh > 900) {
    ww = 1200;
    wh = 900;
  }
  const clamp = (v, hi) => Math.min(Math.max(v, 0), hi);
  return { x: clamp(x + w / 2 - ww / 2, 1200 - ww), y: clamp(y + h / 2 - wh / 2, 900 - wh), w: ww, h: wh };
}
const W = 480;
const H = 360;
const SCALE = 1200 / W;

async function raw(input) {
  const { data } = await sharp(input, { raw: input.raw }).greyscale().raw().toBuffer({ resolveWithObject: true });
  return data;
}
const asImg = (data) => ({ raw: { width: W, height: H, channels: 1 }, data: Buffer.from(data) });
async function blur(data, sigma) {
  return raw(await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: 1 } }).blur(sigma).png().toBuffer());
}
const threshold = (data, t) => Uint8Array.from(data, (v) => (v >= t ? 255 : 0));

function components(bin) {
  const label = new Int32Array(W * H).fill(-1);
  const sizes = [];
  for (let i = 0; i < W * H; i++) {
    if (!bin[i] || label[i] >= 0) continue;
    const id = sizes.length;
    let n = 0;
    const stack = [i];
    label[i] = id;
    while (stack.length) {
      const k = stack.pop();
      n++;
      const x = k % W;
      const y = (k - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (bin[j] && label[j] < 0) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
    sizes.push(n);
  }
  return { label, sizes };
}

function fillHoles(bin) {
  const out = Uint8Array.from(bin);
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const k = stack.pop();
    if (seen[k] || bin[k]) continue;
    seen[k] = 1;
    const x = k % W;
    const y = (k - x) / W;
    if (x > 0) stack.push(k - 1);
    if (x < W - 1) stack.push(k + 1);
    if (y > 0) stack.push(k - W);
    if (y < H - 1) stack.push(k + W);
  }
  for (let i = 0; i < W * H; i++) if (!bin[i] && !seen[i]) out[i] = 255;
  return out;
}

/** Pixel-edge boundary loops, clockwise around filled pixels. */
function trace(bin) {
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && bin[y * W + x];
  const edges = new Map();
  const add = (x0, y0, x1, y1) => {
    const k = `${x0},${y0}`;
    (edges.get(k) ?? edges.set(k, []).get(k)).push([x1, y1]);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!at(x, y)) continue;
      if (!at(x, y - 1)) add(x, y, x + 1, y);
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!at(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  const loops = [];
  for (const [start, list] of edges) {
    while (list.length) {
      const [sx, sy] = start.split(',').map(Number);
      const loop = [[sx, sy]];
      let cur = list.pop();
      while (!(cur[0] === sx && cur[1] === sy)) {
        loop.push(cur);
        const nexts = edges.get(`${cur[0]},${cur[1]}`);
        if (!nexts?.length) break;
        cur = nexts.pop();
      }
      if (loop.length > 8) loops.push(loop);
    }
  }
  return loops;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let idx = -1;
  let max = 0;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

function chaikin(pts, iterations) {
  let p = pts;
  for (let k = 0; k < iterations; k++) {
    const q = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = q;
  }
  return p;
}

/** RDP for a closed loop: split at the point farthest from the start, simplify both halves. */
function simplifyLoop(l, eps) {
  let k = 0;
  let best = -1;
  for (let i = 1; i < l.length; i++) {
    const d = Math.hypot(l[i][0] - l[0][0], l[i][1] - l[0][1]);
    if (d > best) {
      best = d;
      k = i;
    }
  }
  const a = rdp(l.slice(0, k + 1), eps);
  const b = rdp([...l.slice(k), l[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

const area = (p) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;

for (const p of manifest) {
  if (skip.has(p.id)) {
    console.log('skip', p.id);
    continue;
  }
  const file = new URL(`scripts/animals/masks/${p.id}.png`, root);
  if (!existsSync(file)) {
    console.log('no mask', p.id);
    continue;
  }
  let m = threshold(await raw(file.pathname), 128);
  // Opening removes whiskers, antennae and stray specks; closing seals small gaps.
  m = threshold(await blur(m, 2.2), 215);
  m = threshold(await blur(m, 2.2), 40);
  m = threshold(await blur(m, 2.5), 60);
  m = threshold(await blur(m, 2.5), 195);
  const { label, sizes } = components(m);
  const biggest = Math.max(...sizes, 0);
  const keep = new Set(sizes.map((s, i) => (s >= Math.max(biggest * 0.12, W * H * 0.004) ? i : -1)).filter((i) => i >= 0));
  m = Uint8Array.from(m, (v, i) => (v && keep.has(label[i]) ? 255 : 0));
  m = fillHoles(m);
  m = threshold(await blur(m, 1.2), 128);
  const loops = trace(m)
    .map((l) => chaikin(simplifyLoop(l, 0.9), 2))
    .filter((l) => area(l) > 60);
  const polys = loops.map((l) => l.flatMap(([x, y]) => [Math.round(x * SCALE * 10) / 10, Math.round(y * SCALE * 10) / 10]));
  const xs = polys.flatMap((q) => q.filter((_, i) => i % 2 === 0));
  const ys = polys.flatMap((q) => q.filter((_, i) => i % 2 === 1));
  const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)].map((v) => Math.round(v));
  const filled = loops.reduce((s, l) => s + area(l), 0) * SCALE * SCALE;
  // Sharp crop of the animal and some background straight from the full-size source.
  const crop = shapeWindow(bbox);
  const f = frames[p.id];
  const px = 1600 / 1200;
  const left = Math.max(0, Math.round((crop.x * px + f.left) / f.scale));
  const top = Math.max(0, Math.round((crop.y * px + f.top) / f.scale));
  const width = Math.min(f.width - left, Math.round((crop.w * px) / f.scale));
  const height = Math.min(f.height - top, Math.round((crop.h * px) / f.scale));
  const long = Math.min(1600, Math.max(width, height));
  const title = selection.find((x) => x.id === p.id).title;
  const key = createHash('sha1').update(title).digest('hex').slice(0, 16);
  const src = readFileSync(new URL(`scripts/animals/.cache/${p.id}-${key}.jpg`, root));
  await sharp(src)
    .rotate()
    .extract({ left, top, width, height })
    .resize(width >= height ? long : null, width >= height ? null : long, { withoutEnlargement: true })
    .webp({ quality: 84 })
    .toFile(new URL(`public/photos/${p.id}-s.webp`, root).pathname);
  const r1 = (v) => Math.round(v * 10) / 10;
  writeFileSync(
    new URL(`public/photos/${p.id}.json`, root),
    JSON.stringify({ bbox, crop: [r1(crop.x), r1(crop.y), r1(crop.w), r1(crop.h)], sourcePx: [width, height], coverage: Math.round((filled / (bbox[2] * bbox[3])) * 1000) / 1000, polys }),
  );
  console.log(p.id.padEnd(14), 'loops', polys.length, 'pts', polys.reduce((s, q) => s + q.length / 2, 0), 'bbox', bbox.join(','), 'fill', (filled / (bbox[2] * bbox[3])).toFixed(2));
}
