import { describe, expect, it } from 'vitest';
import { cellCoverage, planShaped, shapeWindow } from '../src/jigsaw/shape';
import { JigsawEngine } from '../src/jigsaw/engine';
import { makeRng } from '../src/core/rng';

function circle(cx: number, cy: number, r: number, n = 120) {
  const p: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return p;
}

describe('shaped puzzles', () => {
  it('measures cell coverage', () => {
    const square = [[0, 0, 50, 0, 50, 100, 0, 100]];
    const cov = cellCoverage(square, 100, 100, 2, 2);
    expect(cov[0][0]).toBeCloseTo(1);
    expect(cov[0][1]).toBeCloseTo(0);
    const total = cellCoverage([circle(50, 50, 40)], 100, 100, 1, 1, 64)[0][0];
    expect(total).toBeCloseTo((Math.PI * 40 * 40) / 10000, 1);
  });

  it('plans about the requested number of pieces and drops empty cells', () => {
    const polys = [circle(400, 300, 280)];
    for (const target of [12, 35, 70, 108]) {
      const plan = planShaped(polys, 800, 600, target);
      expect(Math.abs(plan.pieceCount - target)).toBeLessThanOrEqual(Math.max(3, target * 0.2));
      // On finer grids the corner cells of a circle hold nothing and are dropped.
      if (target >= 35) expect(plan.layout.present[0][0]).toBe(false);
    }
  });

  it('engine builds pieces only for present cells and glues slivers', () => {
    const polys = [circle(400, 300, 280)];
    const plan = planShaped(polys, 800, 600, 35);
    const e = new JigsawEngine({ cols: plan.cols, rows: plan.rows, boardW: 800, boardH: 600, rotation: false, rng: makeRng(1), layout: plan.layout });
    const present = plan.layout.present.flat().filter(Boolean).length;
    expect(e.pieces.length).toBe(present);
    expect(e.groups.length).toBe(plan.groupCount);
    expect(e.pieces.length).toBe(plan.pieceCount);
    // Glued pieces sit exactly at home inside their group.
    for (const p of e.pieces) {
      expect(e.center(p).x).toBeCloseTo(p.home.x);
      expect(e.center(p).y).toBeCloseTo(p.home.y);
    }
    // Edges toward empty cells are straight.
    for (let r = 0; r < plan.rows - 1; r++)
      for (let c = 0; c < plan.cols; c++)
        if (plan.layout.present[r][c] !== plan.layout.present[r + 1][c]) expect(e.cut.h[r][c]).toBeNull();
    // Solving every group finishes the puzzle.
    for (const g of [...e.groups]) e.drop(g);
    expect(e.complete).toBe(true);
  });
});

describe('shapeWindow', () => {
  const inside = (w: { x: number; y: number; w: number; h: number }, b: number[]) =>
    w.x >= 0 && w.y >= 0 && w.x + w.w <= 1200 + 1e-6 && w.y + w.h <= 900 + 1e-6 && w.x <= b[0] && w.y <= b[1] && w.x + w.w >= b[0] + b[2] && w.y + w.h >= b[1] + b[3];

  it('keeps 4:3 and contains the animal', () => {
    for (const b of [[546, 340, 372, 190], [40, 205, 903, 608], [0, 250, 1125, 530], [540, 126, 563, 484], [353, 158, 600, 279]]) {
      const w = shapeWindow(b, 1200, 900);
      expect(w.w / w.h).toBeCloseTo(4 / 3, 5);
      expect(inside(w, b)).toBe(true);
    }
  });

  it('uses the whole frame when the animal fills it', () => {
    expect(shapeWindow([20, 10, 1160, 880], 1200, 900)).toEqual({ x: 0, y: 0, w: 1200, h: 900 });
  });
});
