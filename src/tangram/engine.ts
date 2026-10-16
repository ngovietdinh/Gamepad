import { Vec, add, centroid, rotate, sub } from '../core/geom';
import { BASE, Cell, PieceKind, Placement, SET, polygonCells } from './geometry';
import { TangramPuzzle } from './puzzles';

const STEP = Math.PI / 4;

export interface TPiece {
  index: number;
  kind: PieceKind;
  /** Base polygon centred on its centroid, in lattice units. */
  local: Vec[];
  /** World position of the centroid. */
  pos: Vec;
  /** Rotation in 45° steps; may be fractional while the player twists. */
  rot: number;
  flip: boolean;
}

/**
 * Puzzle state in world space. The silhouette sits on a lattice with spacing
 * `unit`, turned by `frameRot` (0 for frame A, −45° for frame B).
 */
export class TangramEngine {
  readonly pieces: TPiece[];
  readonly target: Set<Cell>;
  readonly frameRot: number;
  /** World position of lattice point (0,0). */
  origin: Vec = { x: 0, y: 0 };

  constructor(
    readonly puzzle: TangramPuzzle,
    readonly unit: number,
  ) {
    this.frameRot = puzzle.frame === 'B' ? -1 : 0;
    this.target = new Set<Cell>();
    for (const poly of puzzle.outline) for (const c of polygonCells(poly)) this.target.add(c);
    this.pieces = SET.map((kind, index) => {
      const c = centroid(BASE[kind]);
      return { index, kind, local: BASE[kind].map((p) => sub(p, c)), pos: { x: 0, y: 0 }, rot: 0, flip: false };
    });
  }

  latticeToWorld(p: Vec): Vec {
    return add(this.origin, rotate({ x: p.x * this.unit, y: p.y * this.unit }, this.frameRot * STEP));
  }

  worldToLattice(p: Vec): Vec {
    const r = rotate(sub(p, this.origin), -this.frameRot * STEP);
    return { x: r.x / this.unit, y: r.y / this.unit };
  }

  /** Piece vertices in world space. */
  polygon(p: TPiece): Vec[] {
    return p.local.map((v) => {
      const m = p.flip ? { x: -v.x, y: v.y } : v;
      return add(p.pos, rotate({ x: m.x * this.unit, y: m.y * this.unit }, p.rot * STEP));
    });
  }

  /** True when the piece is turned so its edges can line up with the silhouette lattice. */
  aligned(p: TPiece) {
    const rel = Math.round(p.rot) - this.frameRot;
    return Math.abs(p.rot - Math.round(p.rot)) < 1e-6 && ((rel % 2) + 2) % 2 === 0;
  }

  /**
   * Pulls an aligned piece onto the nearest lattice position when it is close.
   * Returns the world shift applied, or null.
   */
  snap(p: TPiece, maxDist = 0.42): Vec | null {
    p.rot = Math.round(p.rot);
    if (!this.aligned(p)) return null;
    const v0 = this.worldToLattice(this.polygon(p)[0]);
    const r = { x: Math.round(v0.x), y: Math.round(v0.y) };
    const d = Math.hypot(r.x - v0.x, r.y - v0.y);
    if (d > maxDist) return null;
    const shift = sub(this.latticeToWorld(r), this.latticeToWorld(v0));
    p.pos = add(p.pos, shift);
    return shift;
  }

  /** Quarter-cells covered by a piece, or null when it is off the lattice. */
  cells(p: TPiece): Set<Cell> | null {
    if (!this.aligned(p)) return null;
    const poly = this.polygon(p).map((v) => this.worldToLattice(v));
    for (const v of poly) if (Math.abs(v.x - Math.round(v.x)) > 0.02 || Math.abs(v.y - Math.round(v.y)) > 0.02) return null;
    return polygonCells(poly.map((v) => ({ x: Math.round(v.x), y: Math.round(v.y) })));
  }

  /** Piece sits fully inside the silhouette on the lattice. */
  fits(p: TPiece): boolean {
    const c = this.cells(p);
    if (!c) return false;
    for (const id of c) if (!this.target.has(id)) return false;
    return true;
  }

  /** Fraction of the silhouette covered by well-placed, non-overlapping pieces. */
  coverage(): number {
    const seen = new Set<Cell>();
    for (const p of this.pieces) {
      const c = this.cells(p);
      if (!c) continue;
      for (const id of c) if (this.target.has(id)) seen.add(id);
    }
    return seen.size / this.target.size;
  }

  /** Puts a piece exactly where a solution placement says. */
  placeAt(p: TPiece, pl: Placement) {
    p.flip = pl.orient.flip;
    p.rot = pl.orient.turns * 2 + this.frameRot;
    p.pos = this.latticeToWorld(centroid(pl.poly));
  }

  solved(): boolean {
    const seen = new Set<Cell>();
    for (const p of this.pieces) {
      const c = this.cells(p);
      if (!c) return false;
      for (const id of c) {
        if (!this.target.has(id) || seen.has(id)) return false;
        seen.add(id);
      }
    }
    return seen.size === this.target.size;
  }
}
