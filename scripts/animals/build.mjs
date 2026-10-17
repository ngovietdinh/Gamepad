// Downloads the photos chosen in selection.json, crops them to 4:3 and writes:
//   public/photos/<id>.webp     1600×1200 board image
//   public/photos/<id>-t.webp   480×360 thumbnail
//   src/photos/manifest.json    names, groups and credits
// Run: node scripts/animals/build.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import sharp from 'sharp';

const UA = 'ManhGhep/1.0 (puzzle game; https://github.com/ngovietdinh/Gamepad)';
const root = new URL('../../', import.meta.url);
const selection = JSON.parse(readFileSync(new URL('./selection.json', import.meta.url), 'utf8'));
const candidates = JSON.parse(readFileSync(new URL('./candidates.json', import.meta.url), 'utf8'));
const byTitle = new Map(Object.values(candidates).flat().map((c) => [c.title, c]));
mkdirSync(new URL('public/photos/', root), { recursive: true });
mkdirSync(new URL('src/photos/', root), { recursive: true });

const manifest = [];
for (const s of selection) {
  const c = byTitle.get(s.title);
  if (!c) throw new Error(`Not in candidates: ${s.title}`);
  const out = new URL(`public/photos/${s.id}.webp`, root);
  const thumb = new URL(`public/photos/${s.id}-t.webp`, root);
  if (!existsSync(out) || !existsSync(thumb)) {
    // Ask for a 2400px rendition so the 4:3 crop still has 1600px of detail.
    const url = c.thumb.replace(/\/\d+px-/, '/2400px-');
    let r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) r = await fetch(c.thumb, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`${s.id}: HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const pos = s.focus ?? 'attention';
    const base = sharp(buf).rotate().resize(1600, 1200, { fit: 'cover', position: pos });
    await base.clone().webp({ quality: 82 }).toFile(out.pathname);
    await base.clone().resize(480, 360).webp({ quality: 74 }).toFile(thumb.pathname);
    console.log('ok', s.id);
  }
  manifest.push({
    id: s.id,
    name: s.name,
    group: s.group,
    credit: { artist: c.artist || 'Không rõ', license: c.license, source: c.page },
  });
}
writeFileSync(new URL('src/photos/manifest.json', root), JSON.stringify(manifest, null, 1));
console.log(`${manifest.length} photos`);
