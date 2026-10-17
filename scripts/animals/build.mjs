// Downloads the photos chosen in selection.json (3840px rendition, kept in
// scripts/animals/.cache), crops them to 4:3 and writes:
//   public/photos/<id>.webp     1600×1200 board image
//   public/photos/<id>-t.webp   480×360 thumbnail
//   scripts/animals/frames.json how each board image maps onto its source
//   src/photos/manifest.json    names, groups and credits
// Run: NODE_USE_ENV_PROXY=1 node scripts/animals/build.mjs [--force]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

const UA = 'ManhGhep/1.0 (puzzle game; https://github.com/ngovietdinh/Gamepad)';
const root = new URL('../../', import.meta.url);
const force = process.argv.includes('--force');
const selection = JSON.parse(readFileSync(new URL('./selection.json', import.meta.url), 'utf8'));
const candidates = JSON.parse(readFileSync(new URL('./candidates.json', import.meta.url), 'utf8'));
const byTitle = new Map(Object.values(candidates).flat().map((c) => [c.title, c]));
const picksFile = new URL('./picks.json', import.meta.url);
const picks = existsSync(picksFile) ? JSON.parse(readFileSync(picksFile, 'utf8')) : {};
const framesFile = new URL('./frames.json', import.meta.url);
const frames = existsSync(framesFile) ? JSON.parse(readFileSync(framesFile, 'utf8')) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const d of ['public/photos/', 'src/photos/', 'scripts/animals/.cache/']) mkdirSync(new URL(d, root), { recursive: true });

async function get(url) {
  for (let i = 0; i < 12; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.status === 429) {
      await sleep(Math.min(60000, 5000 * (i + 1)));
      continue;
    }
    return r;
  }
  return new Response(null, { status: 429 });
}

/** Largest available rendition (3840px, else 2560, else 1920), cached on disk. */
export async function source(c, id) {
  // Cache by file title so changing a species' photo never reuses the old download.
  const key = createHash('sha1').update(c.title).digest('hex').slice(0, 16);
  const file = new URL(`scripts/animals/.cache/${id}-${key}.jpg`, root);
  if (existsSync(file)) return readFileSync(file);
  const thumb = c.thumb.replace('thumb.wikimedia.org', 'upload.wikimedia.org').replace(/\?.*/, '');
  for (const w of [3840, 2560, 1920]) {
    if (w >= c.width) continue; // Wikimedia refuses thumbnails larger than the original
    const r = await get(thumb.replace(/\/\d+px-/, `/${w}px-`));
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      writeFileSync(file, buf);
      await sleep(1200);
      return buf;
    }
  }
  // Original file when it is smaller than every rendition.
  const r = await get(c.page.replace('commons.wikimedia.org/wiki/File:', 'commons.wikimedia.org/wiki/Special:FilePath/'));
  if (!r.ok) throw new Error(`${id}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(file, buf);
  return buf;
}

const manifest = [];
for (const s of selection) {
  const c = byTitle.get(s.title);
  if (!c) throw new Error(`Not in candidates: ${s.title}`);
  const out = new URL(`public/photos/${s.id}.webp`, root);
  const thumb = new URL(`public/photos/${s.id}-t.webp`, root);
  if (force || !existsSync(out) || !existsSync(thumb) || !frames[s.id]) {
    const buf = await source(c, s.id);
    const meta = await sharp(buf).rotate().metadata();
    const W = meta.width;
    const H = meta.height;
    // 4:3 window centred on the animal (bbox from pick.mjs), so nothing of it is cut.
    const winW = Math.min(W, Math.round((H * 4) / 3));
    const winH = Math.min(H, Math.round((W * 3) / 4));
    const bb = picks[s.id]?.find((r) => r.title === s.title)?.bbox;
    const cx = bb ? (bb[0] + bb[2] / 2) * W : W / 2;
    const cy = bb ? (bb[1] + bb[3] / 2) * H : H / 2;
    const left = Math.round(Math.min(Math.max(0, cx - winW / 2), W - winW));
    const top = Math.round(Math.min(Math.max(0, cy - winH / 2), H - winH));
    const data = await sharp(buf).rotate().extract({ left, top, width: winW, height: winH }).resize(1600, 1200).toBuffer();
    // Remember the crop so silhouettes can be cut again from the full-size source.
    const scale = 1600 / winW;
    frames[s.id] = { scale, left: left * scale, top: top * scale, width: W, height: H };
    writeFileSync(framesFile, JSON.stringify(frames, null, 1));
    await sharp(data).webp({ quality: 82 }).toFile(out.pathname);
    await sharp(data).resize(480, 360).webp({ quality: 74 }).toFile(thumb.pathname);
    console.log('ok', s.id, `${W}x${H}`);
  }
  manifest.push({
    id: s.id,
    name: s.name,
    group: s.group,
    shape: s.shape !== false,
    credit: { artist: c.artist || 'Không rõ', license: c.license, source: c.page },
  });
}
writeFileSync(framesFile, JSON.stringify(frames, null, 1));
writeFileSync(new URL('src/photos/manifest.json', root), JSON.stringify(manifest, null, 1));
console.log(`${manifest.length} photos`);
