// Lists high-quality animal photos from Wikimedia Commons "Featured pictures"
// categories, with size and licence, into scripts/animals/candidates.json.
// Run: node scripts/animals/candidates.mjs
import { writeFileSync } from 'node:fs';

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'ManhGhep/1.0 (puzzle game; https://github.com/ngovietdinh/Gamepad)';
const GROUPS = {
  thu: ['Category:Featured pictures of mammals'],
  chim: ['Category:Featured pictures of birds'],
  bosat: ['Category:Featured pictures of reptiles', 'Category:Featured pictures of amphibians'],
  nuoc: ['Category:Featured pictures of fish', 'Category:Featured pictures of marine life'],
  contrung: ['Category:Featured pictures of insects', 'Category:Featured pictures of arachnids'],
};
const FREE = /^(CC0|Public domain|PD|CC BY(-SA)? [0-9.]+|CC-BY(-SA)?-[0-9.]+)/i;

const strip = (html = '') => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function members(cat) {
  const out = [];
  let cont = {};
  for (;;) {
    const q = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2',
      generator: 'categorymembers', gcmtitle: cat, gcmtype: 'file', gcmlimit: '200',
      prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1600',
      iiextmetadatafilter: 'LicenseShortName|Artist|ObjectName|ImageDescription',
      ...cont,
    });
    const r = await fetch(`${API}?${q}`, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`${cat}: HTTP ${r.status}`);
    const j = await r.json();
    for (const p of j.query?.pages ?? []) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const m = ii.extmetadata ?? {};
      out.push({
        title: p.title,
        width: ii.width,
        height: ii.height,
        mime: ii.mime,
        thumb: ii.thumburl,
        page: ii.descriptionurl,
        license: strip(m.LicenseShortName?.value),
        artist: strip(m.Artist?.value),
        name: strip(m.ObjectName?.value),
        desc: strip(m.ImageDescription?.value).slice(0, 160),
      });
    }
    if (!j.continue) break;
    cont = j.continue;
  }
  return out;
}

const result = {};
for (const [group, cats] of Object.entries(GROUPS)) {
  const list = [];
  for (const c of cats) {
    try {
      const m = await members(c);
      console.log(`${c}: ${m.length}`);
      list.push(...m);
    } catch (e) {
      console.log(`${c}: ${e.message}`);
    }
  }
  // Landscape photos large enough for 150 pieces on a retina iPad, free licences only.
  result[group] = list.filter((x) => {
    const a = x.width / x.height;
    return x.mime === 'image/jpeg' && a >= 1.2 && a <= 1.85 && x.width >= 2000 && FREE.test(x.license);
  });
  console.log(`  -> ${group}: ${result[group].length} usable`);
}
writeFileSync(new URL('./candidates.json', import.meta.url), JSON.stringify(result, null, 1));
