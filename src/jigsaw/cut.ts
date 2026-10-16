import { Rng, range } from '../core/rng';
import { Vec } from '../core/geom';

/**
 * Classic jigsaw cut. Each interior edge has a tab that bulges to one side.
 * Shape follows the well-known three-Bézier knob, with per-edge jitter so no
 * two edges look the same.
 */
export interface EdgeSpec {
  /** +1: knob bulges toward +normal (down for horizontal edges, right for vertical). */
  dir: 1 | -1;
  /** Jitter parameters in units of the edge length. */
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  /** Knob size factor. */
  t: number;
}

export interface Cut {
  cols: number;
  rows: number;
  /** Edges below piece (r, c), r in [0, rows-2]. */
  h: EdgeSpec[][];
  /** Edges right of piece (r, c), c in [0, cols-2]. */
  v: EdgeSpec[][];
}

export type PathCmd =
  | { k: 'M'; p: Vec }
  | { k: 'L'; p: Vec }
  | { k: 'C'; c1: Vec; c2: Vec; p: Vec };

function makeEdge(rng: Rng): EdgeSpec {
  const j = 0.035;
  return {
    dir: rng() < 0.5 ? 1 : -1,
    a: range(rng, -j, j),
    b: range(rng, -j, j),
    c: range(rng, -j, j),
    d: range(rng, -j, j),
    e: range(rng, -j, j),
    t: range(rng, 0.085, 0.105),
  };
}

export function generateCut(cols: number, rows: number, rng: Rng): Cut {
  const h: EdgeSpec[][] = [];
  const v: EdgeSpec[][] = [];
  for (let r = 0; r < rows - 1; r++) {
    h.push([]);
    for (let c = 0; c < cols; c++) h[r].push(makeEdge(rng));
  }
  for (let r = 0; r < rows; r++) {
    v.push([]);
    for (let c = 0; c < cols - 1; c++) v[r].push(makeEdge(rng));
  }
  return { cols, rows, h, v };
}

/**
 * Knob control points in the edge's canonical frame: x along the edge (0..L),
 * y along the canonical normal, scaled by `s` (the shorter piece side).
 */
function knob(e: EdgeSpec, L: number, s: number): Vec[] {
  const { a, b, c, d, t } = e;
  const ee = e.e;
  const P = (u: number, hgt: number): Vec => ({ x: u * L, y: hgt * s * e.dir });
  return [
    P(0, 0),
    P(0.2, a),
    P(0.5 + b + d, -t + c),
    P(0.5 - t + b, t + c),
    P(0.5 - 2 * t + b - d, 3 * t + c),
    P(0.5 + 2 * t + b - d, 3 * t + c),
    P(0.5 + t + b, t + c),
    P(0.5 + b + d, -t + c),
    P(0.8, ee),
    P(1, 0),
  ];
}

/** Maximum distance a knob can reach beyond the piece cell, as a fraction of the shorter side. */
export const KNOB_REACH = 0.36;

/**
 * Outline of piece (row, col) in piece-local coordinates, where (0,0) is the
 * top-left corner of its cell and the cell is pw × ph. Clockwise.
 */
export function pieceOutline(cut: Cut, row: number, col: number, pw: number, ph: number): PathCmd[] {
  const s = Math.min(pw, ph);
  const cmds: PathCmd[] = [{ k: 'M', p: { x: 0, y: 0 } }];

  // Add an edge traversed from `from` to `to`. Canonical frame maps (x, y) -> origin + x*axis + y*normal.
  const addEdge = (
    spec: EdgeSpec | null,
    origin: Vec,
    axis: Vec,
    normal: Vec,
    L: number,
    reverse: boolean,
  ) => {
    const end = reverse ? origin : { x: origin.x + axis.x * L, y: origin.y + axis.y * L };
    if (!spec) {
      cmds.push({ k: 'L', p: end });
      return;
    }
    const pts = knob(spec, L, s).map((q) => ({
      x: origin.x + axis.x * q.x + normal.x * q.y,
      y: origin.y + axis.y * q.x + normal.y * q.y,
    }));
    if (reverse) pts.reverse();
    for (let i = 1; i < pts.length; i += 3) {
      cmds.push({ k: 'C', c1: pts[i], c2: pts[i + 1], p: pts[i + 2] });
    }
  };

  const right = { x: 1, y: 0 };
  const down = { x: 0, y: 1 };
  // Top: canonical edge h[row-1][col] goes left→right with normal down.
  addEdge(row > 0 ? cut.h[row - 1][col] : null, { x: 0, y: 0 }, right, down, pw, false);
  // Right: v[row][col] goes top→bottom with normal right.
  addEdge(col < cut.cols - 1 ? cut.v[row][col] : null, { x: pw, y: 0 }, down, right, ph, false);
  // Bottom: h[row][col] canonical left→right; we traverse right→left.
  addEdge(row < cut.rows - 1 ? cut.h[row][col] : null, { x: 0, y: ph }, right, down, pw, true);
  // Left: v[row][col-1] canonical top→bottom; we traverse bottom→top.
  addEdge(col > 0 ? cut.v[row][col - 1] : null, { x: 0, y: 0 }, down, right, ph, true);
  return cmds;
}

export function applyPath(target: CanvasRenderingContext2D | Path2D, cmds: PathCmd[], ox = 0, oy = 0) {
  for (const c of cmds) {
    if (c.k === 'M') target.moveTo(c.p.x + ox, c.p.y + oy);
    else if (c.k === 'L') target.lineTo(c.p.x + ox, c.p.y + oy);
    else target.bezierCurveTo(c.c1.x + ox, c.c1.y + oy, c.c2.x + ox, c.c2.y + oy, c.p.x + ox, c.p.y + oy);
  }
  target.closePath();
}

export function isEdgePiece(cut: Cut, row: number, col: number) {
  return row === 0 || col === 0 || row === cut.rows - 1 || col === cut.cols - 1;
}
