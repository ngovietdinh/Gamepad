import manifest from './manifest.json';
import { store } from '../core/store';

export type PhotoGroup = 'thu' | 'chim' | 'bosat' | 'nuoc' | 'contrung';

export interface Photo {
  id: string;
  name: string;
  group: PhotoGroup;
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

export const photoId = (p: Photo, s: PhotoSize, rotation: boolean) => `p:${p.id}:${s.cols * s.rows}:${rotation ? 1 : 0}`;

export const photoUrl = (p: Photo) => `${import.meta.env.BASE_URL}photos/${p.id}.webp`;
export const thumbUrl = (p: Photo) => `${import.meta.env.BASE_URL}photos/${p.id}-t.webp`;

/** Best stars across every size and rotation the photo was finished with. */
export function photoBest(p: Photo) {
  let stars = 0;
  let done = 0;
  for (const s of PHOTO_SIZES) {
    for (const r of [false, true]) {
      const rec = store.record(photoId(p, s, r));
      if (rec) {
        done++;
        stars = Math.max(stars, rec.stars);
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
