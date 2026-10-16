import { describe, expect, it } from 'vitest';
import { PUZZLES, solution } from '../src/tangram/puzzles';
import { TangramEngine } from '../src/tangram/engine';
import { polygonCells } from '../src/tangram/geometry';

describe('tangram puzzles', () => {
  it('have unique ids and eight puzzles per tier', () => {
    expect(new Set(PUZZLES.map((p) => p.id)).size).toBe(PUZZLES.length);
    for (const t of [0, 1, 2]) expect(PUZZLES.filter((p) => p.tier === t).length).toBe(8);
  });

  for (const p of PUZZLES) {
    it(`${p.name} covers exactly 64 quarter-cells and is solvable`, () => {
      const cells = new Set<number>();
      for (const poly of p.outline) for (const c of polygonCells(poly)) cells.add(c);
      expect(cells.size).toBe(64);
      expect(solution(p).length).toBe(7);
    });

    it(`${p.name}: placing the solution in the engine solves it (any origin)`, () => {
      const e = new TangramEngine(p, 37);
      e.origin = { x: 123.4, y: -56.7 };
      const sol = solution(p);
      const used = new Set<number>();
      for (const pl of sol) {
        const piece = e.pieces.find((x) => x.kind === pl.kind && !used.has(x.index))!;
        used.add(piece.index);
        e.placeAt(piece, pl);
      }
      expect(e.coverage()).toBeCloseTo(1);
      expect(e.solved()).toBe(true);
    });
  }
});

describe('tangram engine', () => {
  const p = PUZZLES.find((x) => x.id === 'nha')!;

  it('snaps an aligned piece onto the lattice', () => {
    const e = new TangramEngine(p, 50);
    const sol = solution(p);
    const piece = e.pieces.find((x) => x.kind === sol[0].kind)!;
    e.placeAt(piece, sol[0]);
    const exact = { ...piece.pos };
    piece.pos = { x: exact.x + 9, y: exact.y - 7 };
    expect(e.snap(piece)).not.toBeNull();
    expect(piece.pos.x).toBeCloseTo(exact.x);
    expect(piece.pos.y).toBeCloseTo(exact.y);
    expect(e.fits(piece)).toBe(true);
  });

  it('does not snap a piece turned off the lattice', () => {
    const e = new TangramEngine(p, 50);
    const piece = e.pieces[0];
    piece.rot = e.frameRot + 1;
    expect(e.snap(piece)).toBeNull();
    expect(e.cells(piece)).toBeNull();
  });

  it('is not solved with overlapping pieces', () => {
    const e = new TangramEngine(p, 50);
    const sol = solution(p);
    for (const piece of e.pieces) {
      const pl = sol.find((s) => s.kind === piece.kind)!;
      e.placeAt(piece, pl);
    }
    expect(e.solved()).toBe(false);
  });
});
