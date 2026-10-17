// For each species in species.json, searches Wikimedia Commons featured and
// quality pictures and keeps landscape, high-resolution, freely licensed photos
// in scripts/animals/candidates.json for manual review.
// Run: NODE_USE_ENV_PROXY=1 node scripts/animals/candidates.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'ManhGhep/1.0 (puzzle game; https://github.com/ngovietdinh/Gamepad)';
const FREE = /^(CC0|Public domain|PD|CC BY(-SA)? [0-9.]+|CC-BY(-SA)?-[0-9.]+)/i;
const species = JSON.parse(readFileSync(new URL('./species.json', import.meta.url), 'utf8'));
const outFile = new URL('./candidates.json', import.meta.url);
const result = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html = '') => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function api(params) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`, { headers: { 'User-Agent': UA } });
    if (r.status === 429) {
      await sleep(4000 * (attempt + 1));
      continue;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
  throw new Error('rate limited');
}

async function search(q, cat) {
  const j = await api({
    action: 'query',
    generator: 'search',
    gsrsearch: `${q} incategory:${cat} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '20',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '400',
    iiextmetadatafilter: 'LicenseShortName|Artist',
  });
  return (j.query?.pages ?? [])
    .sort((a, b) => a.index - b.index)
    .map((p) => {
      const ii = p.imageinfo?.[0] ?? {};
      const m = ii.extmetadata ?? {};
      return {
        title: p.title,
        width: ii.width,
        height: ii.height,
        mime: ii.mime,
        thumb: ii.thumburl,
        page: ii.descriptionurl,
        license: strip(m.LicenseShortName?.value),
        artist: strip(m.Artist?.value),
      };
    })
    .filter((x) => {
      const a = x.width / x.height;
      return x.mime === 'image/jpeg' && a >= 1.2 && a <= 1.9 && x.width >= 2000 && FREE.test(x.license);
    });
}

for (const s of species) {
  if (result[s.id]?.length >= 4) continue;
  const seen = new Set();
  const list = [];
  for (const cat of ['Featured_pictures_on_Wikimedia_Commons', 'Quality_images']) {
    try {
      for (const c of await search(s.q, cat)) {
        if (!seen.has(c.title)) {
          seen.add(c.title);
          list.push({ ...c, featured: cat.startsWith('Featured') });
        }
      }
    } catch (e) {
      console.log(s.id, cat, e.message);
    }
    await sleep(1200);
    if (list.length >= 8) break;
  }
  result[s.id] = list.slice(0, 8);
  console.log(`${s.id}: ${result[s.id].length}`);
  writeFileSync(outFile, JSON.stringify(result, null, 1));
}
