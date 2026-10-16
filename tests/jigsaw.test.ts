import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import { JigsawEngine } from '../src/jigsaw/engine';
import { generateCut, pieceOutline } from '../src/jigsaw/cut';

const make = (cols = 4, rows = 3, rotation = false) =>
  new JigsawEngine({ cols, rows, boardW: 1200, boardH: 900, rotation, rng: makeRng(7) });

function sampleCurve(cmds: ReturnType<typeof pieceOutline>) {
  const pts: { x: number; y: number }[] = [];
  let cur = { x: 0, y: 0 };
  for (const c of cmds) {
    if (c.k === 'M' || c.k === 'L') {
      cur = c.p;
      pts.push(cur);
    } else {
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const u = 1 - t;
        pts.push({
          x: u * u * u * cur.x + 3 * u * u * t * c.c1.x + 3 * u * t * t * c.c2.x + t * t * t * c.p.x,
          y: u * u * u * cur.y + 3 * u * u * t * c.c1.y + 3 * u * t * t * c.c2.y + t * t * t * c.p.y,
        });
      }
      cur = c.p;
    }
  }
  return pts;
}

describe('cut', () => {
  it('neighbouring pieces share exactly the same edge curve', () => {
    const cut = generateCut(3, 3, makeRng(1));
    const pw = 100;
    const ph = 80;
    // Right edge of (1,0) must equal left edge of (1,1) shifted by pw.
    const a = sampleCurve(pieceOutline(cut, 1, 0, pw, ph));
    const b = sampleCurve(pieceOutline(cut, 1, 1, pw, ph)).map((p) => ({ x: p.x + pw, y: p.y }));
    const onRight = a.filter((p) => Math.abs(p.x - pw) < 30 && p.y > 30 && p.y < 50);
    expect(onRight.length).toBeGreaterThan(3);
    for (const p of onRight) {
      const nearest = Math.min(...b.map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
      expect(nearest).toBeLessThan(6);
    }
  });

  it('border pieces have straight outer edges', () => {
    const cut = generateCut(3, 3, makeRng(2));
    const cmds = pieceOutline(cut, 0, 0, 100, 100);
    // Top and left edges are straight lines.
    expect(cmds.filter((c) => c.k === 'L').length).toBe(2);
  });
});

describe('engine', () => {
  it('starts with every piece in its own group at home', () => {
    const e = make();
    expect(e.groups.length).toBe(12);
    for (const p of e.pieces) expect(e.center(p)).toEqual(p.home);
  });

  it('locks a piece dropped near its home', () => {
    const e = make();
    const p = e.pieces[5];
    e.move(p.group, { x: 10, y: -8 });
    const r = e.drop(p.group);
    expect(r.kind).toBe('lock');
    expect(p.group.locked).toBe(true);
    expect(e.center(p)).toEqual(p.home);
  });

  it('joins neighbours off the board and keeps them aligned', () => {
    const e = make();
    const a = e.pieceAt(0, 0)!;
    const b = e.pieceAt(0, 1)!;
    e.move(a.group, { x: 2000, y: 500 });
    e.move(b.group, { x: 2000 + 12, y: 500 - 9 });
    const r = e.drop(b.group);
    expect(r.kind).toBe('join');
    expect(a.group).toBe(b.group);
    const ca = e.center(a);
    const cb = e.center(b);
    expect(cb.x - ca.x).toBeCloseTo(e.pw);
    expect(cb.y - ca.y).toBeCloseTo(0);
  });

  it('does not join pieces with different rotations', () => {
    const e = make(4, 3, true);
    const a = e.pieceAt(1, 1)!;
    const b = e.pieceAt(1, 2)!;
    e.move(a.group, { x: 2000, y: 0 });
    e.move(b.group, { x: 2000, y: 0 });
    e.rotateGroup(b.group, e.center(b));
    expect(e.drop(b.group).kind).toBe('none');
  });

  it('rotated groups join when both share the rotation', () => {
    const e = make(4, 3, true);
    const a = e.pieceAt(1, 1)!;
    const b = e.pieceAt(1, 2)!;
    e.move(a.group, { x: 2000, y: 0 });
    e.rotateGroup(a.group, e.center(a));
    // Put b exactly where it should be relative to rotated a (below it after a quarter turn).
    e.rotateGroup(b.group, e.center(b));
    const ca = e.center(a);
    const target = { x: ca.x, y: ca.y + e.pw };
    const cb = e.center(b);
    e.move(b.group, { x: target.x - cb.x + 5, y: target.y - cb.y + 5 });
    expect(e.drop(b.group).kind).toBe('join');
  });

  it('a group cannot lock onto the board while rotated', () => {
    const e = make(4, 3, true);
    const p = e.pieces[0];
    e.rotateGroup(p.group, e.center(p));
    expect(e.drop(p.group).kind).toBe('none');
  });

  it('finishes when all pieces are locked', () => {
    const e = make(3, 2);
    for (const p of e.pieces) e.drop(p.group);
    expect(e.complete).toBe(true);
    expect(e.groups.filter((g) => g.locked).length).toBe(1);
  });

  it('scatter places every loose group off the board', () => {
    const e = make(10, 7);
    const pos = e.scatter(makeRng(3), 4 / 3, false);
    expect(pos.size).toBe(70);
    for (const [g, t] of pos) {
      const offset = { x: g.pieces[0].home.x - g.ref.x, y: g.pieces[0].home.y - g.ref.y };
      const c = { x: t.pos.x + offset.x, y: t.pos.y + offset.y };
      const inside = c.x > 0 && c.x < 1200 && c.y > 0 && c.y < 900;
      expect(inside).toBe(false);
    }
  });
});
