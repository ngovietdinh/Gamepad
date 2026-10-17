import { CellLayout } from './engine';

/** Silhouette outline: polygons as flat [x0, y0, x1, y1, …] arrays. */
export type Polys = number[][];

export interface ShapedPlan {
  cols: number;
  rows: number;
  layout: CellLayout;
  /** Pieces on the board (the number the HUD counts). */
  pieceCount: number;
  /** Loose groups at the start: glued slivers move with their neighbour. */
  groupCount: number;
}

const EMPTY = 0.004; // below this a cell holds nothing worth a piece
const SLIVER = 0.2; // below this a cell is glued to its fullest neighbour
const FULL = 0.985;

/**
 * Fraction of each grid cell covered by the silhouette, by scanline sampling
 * (even–odd rule) at `samples`×`samples` points per cell.
 */
export function cellCoverage(polys: Polys, w: number, h: number, cols: number, rows: number, samples = 8): number[][] {
  const cov = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  const ch = h / rows;
  const ny = rows * samples;
  const nx = cols * samples;
  for (let j = 0; j < ny; j++) {
    const y = ((j + 0.5) / ny) * h;
    const xs: number[] = [];
    for (const p of polys) {
      const n = p.length / 2;
      for (let i = 0, k = n - 1; i < n; k = i++) {
        const y1 = p[i * 2 + 1];
        const y2 = p[k * 2 + 1];
        if (y1 > y !== y2 > y) {
          const x1 = p[i * 2];
          const x2 = p[k * 2];
          xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
    }
    xs.sort((a, b) => a - b);
    const r = Math.min(rows - 1, Math.floor(y / ch));
    for (let s = 0; s + 1 < xs.length; s += 2) {
      // Sample columns whose centre falls inside [xs[s], xs[s+1]).
      const i0 = Math.max(0, Math.ceil(xs[s] / (w / nx) - 0.5));
      const i1 = Math.min(nx - 1, Math.ceil(xs[s + 1] / (w / nx) - 0.5) - 1);
      for (let i = i0; i <= i1; i++) cov[r][Math.floor(i / samples)]++;
    }
  }
  const total = samples * samples;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cov[r][c] /= total;
  return cov;
}

function layoutFor(cov: number[][]): { layout: CellLayout; pieceCount: number; groupCount: number } {
  const rows = cov.length;
  const cols = cov[0].length;
  const present = cov.map((row) => row.map((v) => v > EMPTY));
  const has = (r: number, c: number) => r >= 0 && c >= 0 && r < rows && c < cols && present[r][c];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
  const edge = cov.map((row, r) => row.map((v, c) => v < FULL || dirs.some(([dr, dc]) => !has(r + dr, c + dc))));
  const joinTo = cov.map((row, r) =>
    row.map((v, c): [number, number] | null => {
      if (!present[r][c] || v >= SLIVER) return null;
      let best: [number, number] | null = null;
      let bestCov = -1;
      for (const [dr, dc] of dirs) {
        const rr = r + dr;
        const cc = c + dc;
        if (has(rr, cc) && cov[rr][cc] > bestCov) {
          bestCov = cov[rr][cc];
          best = [rr, cc];
        }
      }
      return best;
    }),
  );
  // Count groups after gluing (union–find over joinTo links).
  const parent = new Map<number, number>();
  const id = (r: number, c: number) => r * cols + c;
  const find = (x: number): number => {
    while (parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (present[r][c]) parent.set(id(r, c), id(r, c));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const t = joinTo[r][c];
      if (t) parent.set(find(id(r, c)), find(id(t[0], t[1])));
    }
  const roots = new Set([...parent.keys()].map(find));
  return { layout: { present, edge, joinTo }, pieceCount: parent.size, groupCount: roots.size };
}

/**
 * Chooses a grid over the w×h board so that cutting the silhouette gives about
 * `target` pieces with near-square cells.
 */
export function planShaped(polys: Polys, w: number, h: number, target: number): ShapedPlan {
  const aspect = w / h;
  const fullCov = cellCoverage(polys, w, h, 1, 1, 64)[0][0] || 1;
  let total = target / fullCov;
  let best: ShapedPlan | null = null;
  for (let iter = 0; iter < 10; iter++) {
    const cols = Math.max(2, Math.round(Math.sqrt(total * aspect)));
    const rows = Math.max(2, Math.round(cols / aspect));
    const { layout, pieceCount, groupCount } = layoutFor(cellCoverage(polys, w, h, cols, rows));
    const plan = { cols, rows, layout, pieceCount, groupCount };
    if (!best || Math.abs(pieceCount - target) < Math.abs(best.pieceCount - target)) best = plan;
    if (Math.abs(pieceCount - target) <= Math.max(1, target * 0.08)) break;
    total *= target / Math.max(1, pieceCount);
  }
  return best!;
}

/**
 * A 4:3 window around the silhouette with room for some of the photo's
 * background, shifted (not shrunk) to stay inside the frame.
 */
export function shapeWindow(bbox: number[], frameW: number, frameH: number, margin = 0.16) {
  const [x, y, w, h] = bbox;
  const m = Math.max(w, h) * margin;
  let ww = w + m * 2;
  let wh = h + m * 2;
  if (ww / wh > 4 / 3) wh = (ww * 3) / 4;
  else ww = (wh * 4) / 3;
  if (ww > frameW || wh > frameH) {
    ww = Math.min(frameW, (frameH * 4) / 3);
    wh = (ww * 3) / 4;
  }
  const clamp = (v: number, hi: number) => Math.min(Math.max(v, 0), hi);
  return { x: clamp(x + w / 2 - ww / 2, frameW - ww), y: clamp(y + h / 2 - wh / 2, frameH - wh), w: ww, h: wh };
}
