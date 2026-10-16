import { PAINTINGS, Painting } from '../art/paintings';
import { hashString } from '../core/rng';
import { store } from '../core/store';
import { PUZZLES, TangramPuzzle } from '../tangram/puzzles';

export interface JigsawLevelDef {
  index: number;
  cols: number;
  rows: number;
  rotation: boolean;
}

/** Six steps per painting, from a gentle 12 pieces to 108 with rotation. */
export const JIGSAW_LEVELS: JigsawLevelDef[] = [
  { index: 0, cols: 4, rows: 3, rotation: false },
  { index: 1, cols: 5, rows: 4, rotation: false },
  { index: 2, cols: 7, rows: 5, rotation: false },
  { index: 3, cols: 8, rows: 6, rotation: false },
  { index: 4, cols: 10, rows: 7, rotation: true },
  { index: 5, cols: 12, rows: 9, rotation: true },
];

export const jigsawId = (p: Painting, level: number) => `j:${p.id}:${level}`;
export const tangramId = (p: TangramPuzzle) => `t:${p.id}`;

export const jigsawSeed = (p: Painting, level: number) => hashString(`${p.id}#${level}`);

export function jigsawUnlocked(p: Painting, level: number) {
  return level === 0 || !!store.record(jigsawId(p, level - 1));
}

/** Target time for three stars. */
export function jigsawPar(def: JigsawLevelDef) {
  return def.cols * def.rows * (def.rotation ? 9 : 6) * 1000;
}

export const TANGRAM_PAR = [90_000, 150_000, 240_000];

export function starsFor(ms: number, hints: number, par: number) {
  if (hints === 0 && ms <= par) return 3;
  if (hints <= 2 && ms <= par * 2) return 2;
  return 1;
}

export function tangramTierUnlocked(tier: number) {
  if (tier === 0) return true;
  const prev = PUZZLES.filter((p) => p.tier === tier - 1);
  return prev.filter((p) => store.record(tangramId(p))).length >= 4;
}

export function jigsawProgress() {
  let done = 0;
  for (const p of PAINTINGS) for (const l of JIGSAW_LEVELS) if (store.record(jigsawId(p, l.index))) done++;
  return { done, total: PAINTINGS.length * JIGSAW_LEVELS.length };
}

export function tangramProgress() {
  return { done: PUZZLES.filter((p) => store.record(tangramId(p))).length, total: PUZZLES.length };
}
