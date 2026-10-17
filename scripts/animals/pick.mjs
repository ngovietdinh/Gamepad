// Chooses, for every species, the candidate photo that shows the whole animal:
// segments a 640px thumbnail of each candidate and rejects any whose animal
// touches the frame (cut off). Among full-body photos it prefers a large, sharp
// subject that fits a 4:3 board. Writes scripts/animals/picks.json and updates
// selection.json (keeping names; manual overrides go in "pin": "<File title>").
// Candidates whose title matches a species' "exclude" words (species.json) are skipped.
// Run: NODE_USE_ENV_PROXY=1 SEG_MODULE=<path to imgly dist/index.mjs> node scripts/animals/pick.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const UA = 'ManhGhep/1.0 (puzzle game; https://github.com/ngovietdinh/Gamepad)';
const root = new URL('../../', import.meta.url);
const modulePath = process.env.SEG_MODULE ?? new URL('../../node_modules/@imgly/background-removal-node/dist/index.mjs', import.meta.url).pathname;
const { removeBackground } = await import(modulePath);
const publicPath = `file://${modulePath.replace(/[^/]+$/, '')}`;
const candidates = JSON.parse(readFileSync(new URL('./candidates.json', import.meta.url), 'utf8'));
const selection = JSON.parse(readFileSync(new URL('./selection.json', import.meta.url), 'utf8'));
const species = Object.fromEntries(JSON.parse(readFileSync(new URL('./species.json', import.meta.url), 'utf8')).map((s) => [s.id, s]));
const picksFile = new URL('./picks.json', import.meta.url);
const picks = existsSync(picksFile) ? JSON.parse(readFileSync(picksFile, 'utf8')) : {};
const cache = new URL('scripts/animals/.cache/thumbs/', root);
mkdirSync(cache, { recursive: true });
const only = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  for (let i = 0; i < 10; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.status === 429) {
      await sleep(4000 * (i + 1));
      continue;
    }
    return r;
  }
  throw new Error('rate limited');
}

async function thumb(c) {
  const key = createHash('sha1').update(c.title).digest('hex').slice(0, 16);
  const file = new URL(`${key}.jpg`, cache);
  if (existsSync(file)) return { key, buf: readFileSync(file) };
  const url = c.thumb.replace('thumb.wikimedia.org', 'upload.wikimedia.org').replace(/\?.*/, '').replace(/\/\d+px-/, '/500px-'); // a standard Wikimedia size
  const r = await get(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(file, buf);
  await sleep(400);
  return { key, buf };
}

/** Mask statistics: area, bounding box and how much of each frame edge the animal touches. */
async function analyse(buf, key) {
  const maskFile = new URL(`${key}-m.png`, cache);
  let mask;
  if (existsSync(maskFile)) mask = readFileSync(maskFile);
  else {
    const png = await sharp(buf).rotate().png().toBuffer();
    const blob = await removeBackground(new Blob([png], { type: 'image/png' }), { publicPath, model: 'medium', output: { format: 'image/png' } });
    mask = await sharp(Buffer.from(await blob.arrayBuffer())).extractChannel('alpha').png().toBuffer();
    writeFileSync(maskFile, mask);
  }
  // Opening drops whiskers and specks so thin hairs at the frame edge don't count as contact.
  const { data: raw, info } = await sharp(mask).blur(2).threshold(200).blur(2).threshold(60).raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const ch = info.channels;
  const at = (x, y) => raw[(y * W + x) * ch] > 127;
  let area = 0;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (at(x, y)) {
        area++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const m = Math.max(2, Math.round(Math.min(W, H) * 0.012));
  const edge = (fn, len) => {
    let n = 0;
    for (let i = 0; i < len; i++) if (fn(i)) n++;
    return n / len;
  };
  const touch = {
    top: edge((x) => { for (let y = 0; y < m; y++) if (at(x, y)) return true; return false; }, W),
    bottom: edge((x) => { for (let y = H - m; y < H; y++) if (at(x, y)) return true; return false; }, W),
    left: edge((y) => { for (let x = 0; x < m; x++) if (at(x, y)) return true; return false; }, H),
    right: edge((y) => { for (let x = W - m; x < W; x++) if (at(x, y)) return true; return false; }, H),
  };
  return { W, H, area: area / (W * H), bbox: [x0 / W, y0 / H, (x1 - x0 + 1) / W, (y1 - y0 + 1) / H], touch };
}

function score(c, s) {
  const maxTouch = Math.max(s.touch.top, s.touch.bottom, s.touch.left, s.touch.right);
  const full = maxTouch < 0.015;
  // Does the animal fit a 4:3 window of this photo (with a little margin)?
  const aspect = s.W / s.H;
  const winW = Math.min(1, (4 / 3) / aspect);
  const winH = Math.min(1, aspect / (4 / 3));
  const fits = s.bbox[2] <= winW * 0.96 && s.bbox[3] <= winH * 0.96;
  // Pixels across the animal in the original file.
  const px = c.width * s.bbox[2];
  return {
    full,
    fits,
    maxTouch: Math.round(maxTouch * 1000) / 1000,
    value:
      (full ? 100 : 0) +
      (fits ? 30 : 0) +
      (c.featured ? 8 : 0) +
      Math.min(Math.max(s.area, 0.04), 0.45) * 70 +
      Math.min(px, 1800) / 1800 * 20 -
      maxTouch * 40,
  };
}

for (const sel of selection) {
  if (only.length && !only.includes(sel.id)) continue;
  const exclude = (species[sel.id]?.exclude ?? []).map((w) => w.toLowerCase());
  const list = (candidates[sel.id] ?? []).filter((c) => !exclude.some((w) => c.title.toLowerCase().includes(w)));
  const rows = [];
  for (const c of list) {
    try {
      const { key, buf } = await thumb(c);
      const st = await analyse(buf, key);
      rows.push({ title: c.title, key, ...st, ...score(c, st) });
    } catch (e) {
      console.log(sel.id, c.title, e.message);
    }
    // Downloads are throttled: three good full-body photos are enough to choose from.
    if (rows.filter((r) => r.full && r.fits && r.area >= 0.12).length >= 3) break;
  }
  rows.sort((a, b) => b.value - a.value);
  picks[sel.id] = rows;
  const best = sel.pin ? rows.find((r) => r.title === sel.pin) ?? rows[0] : rows[0];
  if (best) {
    if (best.title !== sel.title) sel.previous = sel.title;
    sel.title = best.title;
  }
  console.log(sel.id.padEnd(14), rows.length, best ? `${best.full ? 'FULL' : 'cut '} ${best.fits ? 'fits' : '    '} area ${best.area.toFixed(2)}  ${best.title.slice(5, 60)}` : 'none');
  writeFileSync(picksFile, JSON.stringify(picks, null, 1));
  writeFileSync(new URL('./selection.json', import.meta.url), JSON.stringify(selection, null, 1));
}
