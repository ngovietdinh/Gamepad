// Separates each animal from its background with an on-device model and saves
// a small alpha mask (480×360) to scripts/animals/masks/<id>.png.
// Needs @imgly/background-removal-node (≈700 MB with models), kept out of package.json:
//   npm i --no-save @imgly/background-removal-node@1.4.5   (or set SEG_MODULE to its path)
// Run: node scripts/animals/masks.mjs [id ...]
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

const modulePath = process.env.SEG_MODULE ?? new URL('../../node_modules/@imgly/background-removal-node/dist/index.mjs', import.meta.url).pathname;
const { removeBackground } = await import(modulePath);
// The model files live next to the module; point the library at them explicitly.
const publicPath = `file://${modulePath.replace(/[^/]+$/, '')}`;
const root = new URL('../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('src/photos/manifest.json', root), 'utf8'));
const only = process.argv.slice(2);
mkdirSync(new URL('scripts/animals/masks/', root), { recursive: true });

for (const p of manifest) {
  if (only.length && !only.includes(p.id)) continue;
  const out = new URL(`scripts/animals/masks/${p.id}.png`, root);
  if (existsSync(out) && !only.length) continue;
  const png = await sharp(new URL(`public/photos/${p.id}.webp`, root).pathname).png().toBuffer();
  const blob = await removeBackground(new Blob([png], { type: 'image/png' }), { publicPath, model: 'medium', output: { format: 'image/png' } });
  const cut = Buffer.from(await blob.arrayBuffer());
  await sharp(cut).extractChannel('alpha').resize(480, 360, { kernel: 'lanczos3' }).png().toFile(out.pathname);
  console.log('mask', p.id);
}
