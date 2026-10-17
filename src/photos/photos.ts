import manifest from './manifest.json';
import { store } from '../core/store';

export type PhotoGroup = 'thu' | 'chim' | 'bosat' | 'nuoc' | 'contrung';

export interface Photo {
  id: string;
  name: string;
  group: PhotoGroup;
  /** A clean silhouette exists, so the photo can be played in the animal's shape. */
  shape?: boolean;
  credit: { artist: string; license: string; source: string };
}

/** Real wildlife photographs from Wikimedia Commons, bundled with the app. */
export const PHOTOS = manifest as Photo[];

export const GROUPS: { id: PhotoGroup; name: string }[] = [
  { id: 'thu', name: 'Thú' },
  { id: 'chim', name: 'Chim' },
  { id: 'bosat', name: 'Bò sát, lưỡng cư' },
  { id: 'nuoc', name: 'Dưới nước' },
  { id: 'contrung', name: 'Côn trùng' },
];

/** Piece counts the player can pick for any photo (4:3 grids). */
export const PHOTO_SIZES = [
  { cols: 4, rows: 3 },
  { cols: 7, rows: 5 },
  { cols: 10, rows: 7 },
  { cols: 12, rows: 9 },
  { cols: 14, rows: 11 },
];

export type PhotoSize = (typeof PHOTO_SIZES)[number];

export const photoId = (p: Photo, s: PhotoSize, rotation: boolean, shaped = false) =>
  `p:${p.id}:${s.cols * s.rows}:${rotation ? 1 : 0}${shaped ? ':s' : ''}`;

export const photoUrl = (p: Photo) => `${import.meta.env.BASE_URL}photos/${p.id}.webp`;
export const thumbUrl = (p: Photo) => `${import.meta.env.BASE_URL}photos/${p.id}-t.webp`;
/** Sharp crop around the animal, used by shaped puzzles. */
export const cutoutUrl = (p: Photo) => `${import.meta.env.BASE_URL}photos/${p.id}-s.webp`;

export interface PhotoShape {
  /** Silhouette bounding box and crop (with margin) in 1200×900 frame units. */
  bbox: number[];
  crop: number[];
  polys: number[][];
}

const shapeCache = new Map<string, Promise<PhotoShape>>();

export function loadShape(p: Photo): Promise<PhotoShape> {
  let s = shapeCache.get(p.id);
  if (!s) {
    s = fetch(`${import.meta.env.BASE_URL}photos/${p.id}.json`).then((r) => {
      if (!r.ok) throw new Error(`shape ${p.id}: ${r.status}`);
      return r.json() as Promise<PhotoShape>;
    });
    s.catch(() => shapeCache.delete(p.id));
    shapeCache.set(p.id, s);
  }
  return s;
}

/** Silhouette mapped into a board of the crop's aspect, scaled to fit 1200×900. */
export function shapedBoard(shape: PhotoShape) {
  const [cx, cy, cw, ch] = shape.crop;
  const s = Math.min(1200 / cw, 900 / ch);
  return {
    boardW: cw * s,
    boardH: ch * s,
    polys: shape.polys.map((poly) => poly.map((v, i) => (i % 2 ? (v - cy) * s : (v - cx) * s))),
  };
}

/** Best stars across every size and rotation the photo was finished with. */
export function photoBest(p: Photo) {
  let stars = 0;
  let done = 0;
  for (const s of PHOTO_SIZES) {
    for (const r of [false, true]) {
      for (const shaped of [false, true]) {
        const rec = store.record(photoId(p, s, r, shaped));
        if (rec) {
          done++;
          stars = Math.max(stars, rec.stars);
        }
      }
    }
  }
  return { stars, done };
}

export function creditLine(p: Photo) {
  return `Ảnh: ${p.credit.artist}, ${p.credit.license}, Wikimedia Commons`;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
