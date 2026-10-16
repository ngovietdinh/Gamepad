import { Vec, pointInPolygon, polygonArea } from '../core/geom';

/**
 * Tangram geometry on a 45° lattice.
 *
 * Unit: the small triangle has hypotenuse 2 (area 1), so the full set covers 16.
 * In "lattice" orientations (multiples of 90°) every vertex lands on an integer
 * point, and every piece is a union of quarter-cells: each unit square split
 * by both diagonals into four triangles. That turns solving and checking a
 * silhouette into an exact-cover problem on those quarter-cells.
 */

export type PieceKind = 'L' | 'M' | 'S' | 'Q' | 'P';

export const BASE: Record<PieceKind, Vec[]> = {
  L: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 2 }],
  M: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }],
  S: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }],
  Q: [{ x: 1, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 1 }],
  P: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 1 }, { x: 1, y: 1 }],
};

/** The seven pieces of a set, in a stable order. */
export const SET: PieceKind[] = ['L', 'L', 'M', 'S', 'S', 'Q', 'P'];

export const AREA: Record<PieceKind, number> = { L: 4, M: 2, S: 1, Q: 2, P: 2 };

/** A quarter-cell: unit square (i, j), triangle q (0 top, 1 right, 2 bottom, 3 left). */
export type Cell = number;
const OFF = 64; // allow negative coordinates
const SPAN = 256;
export const cellId = (i: number, j: number, q: number): Cell => ((j + OFF) * SPAN + (i + OFF)) * 4 + q;
export function cellParts(c: Cell) {
  const q = c % 4;
  const ij = (c - q) / 4;
  const i = (ij % SPAN) - OFF;
  const j = Math.floor(ij / SPAN) - OFF;
  return { i, j, q };
}

export function cellCentroid(i: number, j: number, q: number): Vec {
  switch (q) {
    case 0:
      return { x: i + 0.5, y: j + 1 / 6 };
    case 1:
      return { x: i + 5 / 6, y: j + 0.5 };
    case 2:
      return { x: i + 0.5, y: j + 5 / 6 };
    default:
      return { x: i + 1 / 6, y: j + 0.5 };
  }
}

/** Quarter-cells covered by a polygon whose edges run along lattice lines. */
export function polygonCells(poly: Vec[]): Set<Cell> {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const x0 = Math.floor(Math.min(...xs));
  const x1 = Math.ceil(Math.max(...xs));
  const y0 = Math.floor(Math.min(...ys));
  const y1 = Math.ceil(Math.max(...ys));
  const out = new Set<Cell>();
  for (let j = y0; j < y1; j++) {
    for (let i = x0; i < x1; i++) {
      for (let q = 0; q < 4; q++) {
        if (pointInPolygon(cellCentroid(i, j, q), poly)) out.add(cellId(i, j, q));
      }
    }
  }
  return out;
}

/** Orientation: quarter turns (0..3) and mirror. Applied as mirror-x first, then rotate. */
export interface Orient {
  turns: number;
  flip: boolean;
}

export function orientPoint(p: Vec, o: Orient): Vec {
  let x = o.flip ? -p.x : p.x;
  let y = p.y;
  for (let k = 0; k < o.turns; k++) {
    const nx = -y;
    const ny = x;
    x = nx;
    y = ny;
  }
  return { x, y };
}

export function orientedPolygon(kind: PieceKind, o: Orient, at: Vec = { x: 0, y: 0 }): Vec[] {
  const pts = BASE[kind].map((p) => orientPoint(p, o));
  // Normalise so the bounding box starts at (0,0), then translate.
  const mx = Math.min(...pts.map((p) => p.x));
  const my = Math.min(...pts.map((p) => p.y));
  return pts.map((p) => ({ x: p.x - mx + at.x, y: p.y - my + at.y }));
}

interface Variant {
  orient: Orient;
  poly: Vec[];
  cells: { i: number; j: number; q: number }[];
}

const variantCache = new Map<PieceKind, Variant[]>();

function variants(kind: PieceKind): Variant[] {
  const hit = variantCache.get(kind);
  if (hit) return hit;
  const seen = new Set<string>();
  const out: Variant[] = [];
  for (const flip of [false, true]) {
    for (let turns = 0; turns < 4; turns++) {
      const orient = { turns, flip };
      const poly = orientedPolygon(kind, orient);
      const cells = [...polygonCells(poly)].map(cellParts).sort((a, b) => a.j - b.j || a.i - b.i || a.q - b.q);
      const key = cells.map((c) => `${c.i},${c.j},${c.q}`).join(';');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ orient, poly, cells });
    }
  }
  variantCache.set(kind, out);
  return out;
}

export interface Placement {
  kind: PieceKind;
  orient: Orient;
  poly: Vec[];
}

/**
 * Finds a way to tile the silhouette with the seven pieces, or null if impossible.
 * Classic exact-cover backtracking: always fill the first uncovered cell.
 */
export function solve(outline: Vec[][]): Placement[] | null {
  const target = new Set<Cell>();
  for (const poly of outline) for (const c of polygonCells(poly)) target.add(c);
  if (target.size !== 64) return null;
  const order = [...target].sort((a, b) => {
    const A = cellParts(a);
    const B = cellParts(b);
    return A.j - B.j || A.i - B.i || A.q - B.q;
  });
  const covered = new Set<Cell>();
  const remaining: Record<PieceKind, number> = { L: 2, M: 1, S: 2, Q: 1, P: 1 };
  const result: Placement[] = [];
  const kinds: PieceKind[] = ['L', 'P', 'Q', 'M', 'S'];

  const step = (): boolean => {
    const first = order.find((c) => !covered.has(c));
    if (first === undefined) return true;
    const f = cellParts(first);
    for (const kind of kinds) {
      if (!remaining[kind]) continue;
      for (const v of variants(kind)) {
        // The first cell of the variant (in scan order) must land on `first`.
        const a = v.cells[0];
        if (a.q !== f.q) continue;
        const di = f.i - a.i;
        const dj = f.j - a.j;
        const ids = v.cells.map((c) => cellId(c.i + di, c.j + dj, c.q));
        if (!ids.every((id) => target.has(id) && !covered.has(id))) continue;
        ids.forEach((id) => covered.add(id));
        remaining[kind]--;
        result.push({ kind, orient: v.orient, poly: v.poly.map((p) => ({ x: p.x + di, y: p.y + dj })) });
        if (step()) return true;
        result.pop();
        remaining[kind]++;
        ids.forEach((id) => covered.delete(id));
      }
    }
    return false;
  };
  return step() ? result : null;
}

export function outlineArea(outline: Vec[][]) {
  return outline.reduce((s, p) => s + Math.abs(polygonArea(p)), 0);
}

/**
 * Boundary of a set of quarter-cells as closed loops (lattice coordinates).
 * Used to draw composite silhouettes as one shape with no inner seams.
 */
export function boundaryLoops(cells: Set<Cell>): Vec[][] {
  // Work in doubled coordinates so cell centres are integers.
  const key = (x: number, y: number) => `${x},${y}`;
  const count = new Map<string, { a: [number, number]; b: [number, number]; n: number }>();
  for (const c of cells) {
    const { i, j, q } = cellParts(c);
    const X = i * 2;
    const Y = j * 2;
    const corners: [number, number][] = [
      [X, Y],
      [X + 2, Y],
      [X + 2, Y + 2],
      [X, Y + 2],
    ];
    const a = corners[q];
    const b = corners[(q + 1) % 4];
    const m: [number, number] = [X + 1, Y + 1];
    for (const [p, r] of [[a, b], [b, m], [m, a]] as [number, number][][]) {
      const k = p[0] < r[0] || (p[0] === r[0] && p[1] < r[1]) ? `${key(p[0], p[1])}|${key(r[0], r[1])}` : `${key(r[0], r[1])}|${key(p[0], p[1])}`;
      const e = count.get(k);
      if (e) e.n++;
      else count.set(k, { a: p, b: r, n: 1 });
    }
  }
  const adj = new Map<string, [number, number][]>();
  for (const e of count.values()) {
    if (e.n !== 1) continue;
    const ka = key(e.a[0], e.a[1]);
    const kb = key(e.b[0], e.b[1]);
    (adj.get(ka) ?? adj.set(ka, []).get(ka)!).push(e.b);
    (adj.get(kb) ?? adj.set(kb, []).get(kb)!).push(e.a);
  }
  const loops: Vec[][] = [];
  const used = new Set<string>();
  const ekey = (p: [number, number], r: [number, number]) => `${key(p[0], p[1])}>${key(r[0], r[1])}`;
  for (const [start, nbrs] of adj) {
    for (const first of nbrs) {
      const s = start.split(',').map(Number) as [number, number];
      if (used.has(ekey(s, first)) || used.has(ekey(first, s))) continue;
      const loop: [number, number][] = [s];
      let prev = s;
      let cur = first;
      used.add(ekey(s, first));
      while (key(cur[0], cur[1]) !== start) {
        loop.push(cur);
        const next = adj.get(key(cur[0], cur[1]))!.find((n) => !(n[0] === prev[0] && n[1] === prev[1]) && !used.has(ekey(cur, n)) && !used.has(ekey(n, cur)));
        if (!next) break;
        used.add(ekey(cur, next));
        prev = cur;
        cur = next;
      }
      // Drop collinear points for clean joins.
      const pts = loop.map(([x, y]) => ({ x: x / 2, y: y / 2 }));
      const clean = pts.filter((p, i) => {
        const a = pts[(i - 1 + pts.length) % pts.length];
        const b = pts[(i + 1) % pts.length];
        return Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > 1e-9;
      });
      loops.push(clean);
    }
  }
  return loops;
}
