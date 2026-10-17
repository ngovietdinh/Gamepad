import { Rng, shuffle } from '../core/rng';
import { Vec, add, dist, rotate, sub } from '../core/geom';
import { Cut, generateCut, isEdgePiece } from './cut';

export interface Piece {
  id: number;
  row: number;
  col: number;
  /** Center of the piece's cell on the solved board. */
  home: Vec;
  edge: boolean;
  group: Group;
}

export interface Group {
  id: number;
  pieces: Piece[];
  /** World position of `ref`. A group sits solved when rot = 0 and pos = ref. */
  pos: Vec;
  /** Reference point in board coordinates that `pos` corresponds to. */
  ref: Vec;
  /** Quarter turns clockwise (0..3). */
  rot: number;
  locked: boolean;
}

export type DropResult =
  | { kind: 'none' }
  | { kind: 'join'; group: Group; shift: Vec }
  | { kind: 'lock'; group: Group; shift: Vec };

/** Which cells exist for a shaped (silhouette) puzzle, and which start pre-joined. */
export interface CellLayout {
  present: boolean[][];
  /** Piece sits on the silhouette outline (used by the edge filter). */
  edge: boolean[][];
  /** Tiny slivers start glued to this neighbour so no piece is a speck. */
  joinTo: ([number, number] | null)[][];
}

export interface JigsawOptions {
  cols: number;
  rows: number;
  boardW: number;
  boardH: number;
  rotation: boolean;
  rng: Rng;
  layout?: CellLayout;
}

const QUARTER = Math.PI / 2;

export class JigsawEngine {
  readonly cut: Cut;
  readonly pw: number;
  readonly ph: number;
  readonly pieces: Piece[] = [];
  /** Draw order, back to front. */
  groups: Group[] = [];
  readonly snapDist: number;
  table = { x: 0, y: 0, w: 0, h: 0 };
  private nextGroupId = 0;
  private grid: (Piece | undefined)[] = [];

  constructor(readonly opts: JigsawOptions) {
    const { cols, rows, boardW, boardH, rng, layout } = opts;
    const present = (r: number, c: number) =>
      r >= 0 && c >= 0 && r < rows && c < cols && (!layout || layout.present[r][c]);
    this.cut = generateCut(cols, rows, rng, present);
    this.pw = boardW / cols;
    this.ph = boardH / rows;
    this.snapDist = Math.min(this.pw, this.ph) * 0.28;
    let id = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!present(r, c)) continue;
        const home = { x: (c + 0.5) * this.pw, y: (r + 0.5) * this.ph };
        const edge = layout ? layout.edge[r][c] : isEdgePiece(this.cut, r, c);
        const piece: Piece = { id: id++, row: r, col: c, home, edge, group: null! };
        const g: Group = { id: this.nextGroupId++, pieces: [piece], pos: { ...home }, ref: { ...home }, rot: 0, locked: false };
        piece.group = g;
        this.pieces.push(piece);
        this.groups.push(g);
        this.grid[r * cols + c] = piece;
      }
    }
    // Glue slivers to their neighbour; everything still sits at home, so groups align.
    if (layout) {
      for (const p of this.pieces) {
        const t = layout.joinTo[p.row][p.col];
        const q = t && this.pieceAt(t[0], t[1]);
        if (q && q.group !== p.group) this.merge(q.group, p.group);
      }
    }
  }

  pieceAt(row: number, col: number): Piece | undefined {
    if (row < 0 || col < 0 || row >= this.opts.rows || col >= this.opts.cols) return undefined;
    return this.grid[row * this.opts.cols + col];
  }

  /** World center of a piece given its group's transform. */
  center(p: Piece): Vec {
    const g = p.group;
    return add(g.pos, rotate(sub(p.home, g.ref), g.rot * QUARTER));
  }

  /** Converts a world point into the piece's local cell frame (0..pw, 0..ph when inside the cell). */
  toLocal(p: Piece, world: Vec): Vec {
    const c = this.center(p);
    const l = rotate(sub(world, c), -p.group.rot * QUARTER);
    return { x: l.x + this.pw / 2, y: l.y + this.ph / 2 };
  }

  get looseGroups() {
    return this.groups.filter((g) => !g.locked);
  }

  get lockedCount() {
    let n = 0;
    for (const p of this.pieces) if (p.group.locked) n++;
    return n;
  }

  get complete() {
    return this.pieces.every((p) => p.group.locked);
  }

  bringToFront(g: Group) {
    const i = this.groups.indexOf(g);
    if (i >= 0) {
      this.groups.splice(i, 1);
      this.groups.push(g);
    }
  }

  /**
   * Topmost loose group under the world point. `hit` tests a local point against
   * the real (knobbed) outline of a piece.
   */
  hitTest(world: Vec, hit: (p: Piece, local: Vec) => boolean, filter?: (g: Group) => boolean): Piece | null {
    for (let i = this.groups.length - 1; i >= 0; i--) {
      const g = this.groups[i];
      if (g.locked || (filter && !filter(g))) continue;
      for (const p of g.pieces) {
        if (hit(p, this.toLocal(p, world))) return p;
      }
    }
    return null;
  }

  move(g: Group, delta: Vec) {
    g.pos = add(g.pos, delta);
  }

  /** Rotates a group a quarter turn clockwise around a world pivot. */
  rotateGroup(g: Group, pivot: Vec, turns = 1) {
    const ang = turns * QUARTER;
    g.pos = add(pivot, rotate(sub(g.pos, pivot), ang));
    g.rot = (((g.rot + turns) % 4) + 4) % 4;
  }

  /**
   * After a drop: lock to the board when close to the solved spot, otherwise
   * join any neighbour within snapping distance. Positions are corrected exactly.
   */
  drop(g: Group): DropResult {
    if (g.locked) return { kind: 'none' };
    if (g.rot === 0 && dist(g.pos, g.ref) < this.snapDist) {
      const shift = sub(g.ref, g.pos);
      g.pos = { ...g.ref };
      g.locked = true;
      const merged = this.mergeLocked(g);
      return { kind: 'lock', group: merged, shift };
    }
    for (const p of g.pieces) {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const n = this.pieceAt(p.row + dr, p.col + dc);
        if (!n || n.group === g || n.group.rot !== g.rot) continue;
        const expected = add(this.center(p), rotate(sub(n.home, p.home), g.rot * QUARTER));
        const actual = this.center(n);
        if (dist(expected, actual) < this.snapDist) {
          const shift = sub(actual, expected);
          g.pos = add(g.pos, shift);
          const target = n.group;
          this.merge(target, g);
          if (target.locked) return { kind: 'lock', group: this.mergeLocked(target), shift };
          // Another neighbour may now line up too.
          const again = this.drop(target);
          if (again.kind === 'lock') return { kind: 'lock', group: again.group, shift };
          return { kind: 'join', group: again.kind === 'join' ? again.group : target, shift };
        }
      }
    }
    return { kind: 'none' };
  }

  /** Moves all pieces of `from` into `into`; `from` must already be aligned with `into`. */
  private merge(into: Group, from: Group) {
    for (const p of from.pieces) {
      p.group = into;
      into.pieces.push(p);
    }
    from.pieces = [];
    this.groups = this.groups.filter((x) => x !== from);
  }

  /** All locked groups form one board group, so the renderer can cache them together. */
  private mergeLocked(g: Group): Group {
    const others = this.groups.filter((x) => x.locked && x !== g);
    if (!others.length) return g;
    const base = others[0];
    this.merge(base, g);
    for (const o of others.slice(1)) this.merge(base, o);
    // Keep the board group at the back of the draw order.
    this.groups = [base, ...this.groups.filter((x) => x !== base)];
    return base;
  }

  /** Bounding radius of a group around a world point, for overlap-free scattering. */
  private slotSize() {
    return Math.max(this.pw, this.ph) * 1.32;
  }

  /**
   * Spreads loose groups around the board, in a ring of slots on the table.
   * Returns target positions so the caller can animate. Grows the table if needed.
   */
  scatter(rng: Rng, viewAspect: number, randomRotation: boolean): Map<Group, { pos: Vec; rot: number }> {
    const { boardW, boardH } = this.opts;
    const loose = this.looseGroups;
    const slot = this.slotSize();
    const gap = slot * 0.2;
    // Grow margins until enough slots fit around the board; the table takes the view's shape.
    let m = slot * 1.1;
    let slots: Vec[] = [];
    for (let iter = 0; iter < 40; iter++) {
      let tableW = boardW + m * 2;
      let tableH = boardH + m * 2;
      if (tableW / tableH < viewAspect) tableW = tableH * viewAspect;
      else tableH = tableW / viewAspect;
      const mx = (tableW - boardW) / 2;
      const my = (tableH - boardH) / 2;
      slots = [];
      for (let y = -my + slot / 2; y < boardH + my - slot / 2 + 1; y += slot) {
        for (let x = -mx + slot / 2; x < boardW + mx - slot / 2 + 1; x += slot) {
          const inBoard = x > -slot / 2 - gap && x < boardW + slot / 2 + gap && y > -slot / 2 - gap && y < boardH + slot / 2 + gap;
          if (!inBoard) slots.push({ x, y });
        }
      }
      this.table = { x: -mx, y: -my, w: tableW, h: tableH };
      if (slots.length >= loose.length) break;
      m += slot * 0.35;
    }
    shuffle(rng, slots);
    // Prefer slots near the board so pieces stay within easy reach.
    const cx = boardW / 2;
    const cy = boardH / 2;
    const used = slots
      .slice(0, Math.max(loose.length, Math.min(slots.length, Math.ceil(loose.length * 1.15))))
      .sort((a, b) => dist(a, { x: cx, y: cy }) - dist(b, { x: cx, y: cy }))
      .slice(0, loose.length);
    shuffle(rng, used);
    const out = new Map<Group, { pos: Vec; rot: number }>();
    loose.forEach((g, i) => {
      const s = used[i % used.length];
      const jitter = { x: (rng() - 0.5) * slot * 0.18, y: (rng() - 0.5) * slot * 0.18 };
      // Place the group's first piece on the slot.
      const rot = randomRotation && g.pieces.length === 1 ? Math.floor(rng() * 4) : g.rot;
      const p = g.pieces[0];
      const offset = rotate(sub(p.home, g.ref), rot * QUARTER);
      out.set(g, { pos: sub(add(s, jitter), offset), rot });
    });
    return out;
  }
}
