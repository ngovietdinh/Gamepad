import { Vec } from '../core/geom';
import { Placement, solve } from './geometry';

/**
 * Silhouettes are drawn on the 45° lattice. Frame "A" uses the lattice as is;
 * frame "B" is drawn in a lattice where the large triangle's legs run along
 * the axes, then converted (x−y, x+y) and displayed turned 45° back, so both
 * families of shapes appear upright on screen.
 */
export interface TangramPuzzle {
  id: string;
  name: string;
  tier: 0 | 1 | 2;
  frame: 'A' | 'B';
  outline: Vec[][];
}

export const TIERS = [
  { name: 'Nhập môn', caption: 'Hiện sẵn đường chia mảnh' },
  { name: 'Thành thạo', caption: 'Chỉ còn đường viền' },
  { name: 'Bậc thầy', caption: 'Chỉ còn hình bóng' },
] as const;

const parse = (frame: 'A' | 'B', polys: string[]): Vec[][] =>
  polys.map((s) =>
    s
      .trim()
      .split(/\s+/)
      .map((t) => {
        const [x, y] = t.split(',').map(Number);
        return frame === 'B' ? { x: x - y, y: x + y } : { x, y };
      }),
  );

const def = (id: string, name: string, tier: 0 | 1 | 2, frame: 'A' | 'B', ...polys: string[]): TangramPuzzle => ({
  id,
  name,
  tier,
  frame,
  outline: parse(frame, polys),
});

export const PUZZLES: TangramPuzzle[] = [
  // Nhập môn
  def('vuong', 'Hình vuông', 0, 'A', '0,0 4,0 4,4 0,4'),
  def('nha', 'Ngôi nhà', 0, 'B', '2,0 4,2 3,2 3,4 1,4 1,2 0,2'),
  def('chu-nhat', 'Phong thư', 0, 'B', '0,0 4,0 4,2 0,2'),
  def('mui-ten', 'Mũi tên', 0, 'B', '0,1 2,1 2,0 4,2 2,4 2,3 0,3'),
  def('tam-giac', 'Kim tự tháp', 0, 'A', '0,4 8,4 4,0'),
  def('ten-lua', 'Tên lửa', 0, 'B', '2,0 3,1 3,3 4,4 0,4 1,3 1,1'),
  def('buom', 'Thuyền buồm', 0, 'B', '2,0 4,2 5,2 4,3 1,3 0,2'),
  def('luc-giac', 'Lục giác', 0, 'A', '2,0 4,0 6,2 4,4 2,4 0,2'),
  // Thành thạo
  def('thuyen', 'Con thuyền', 1, 'A', '4,0 6,2 8,2 6,4 2,4 0,2 2,2'),
  def('ca', 'Cá vàng', 1, 'A', '0,2 2,0 4,2 2,4', '3,1 5,-1 5,5 3,3', '0,0 2,0 1,1'),
  def('vit', 'Vịt bơi', 1, 'B', '0,0 2,0 2,2 4,2 5,1 5,2 4,3 1,3 0,2 0,1 1,1'),
  def('mai-dinh', 'Mái đình', 1, 'B', '1,0 3,0 4,1 3,1 3,2 4,3 0,3 1,2 1,1 0,1'),
  def('hinh-thang', 'Hình thang', 1, 'B', '2,0 4,0 6,2 0,2'),
  def('binh-hanh', 'Bình hành', 1, 'B', '2,0 6,0 4,2 0,2'),
  def('chu-t', 'Chữ T', 1, 'B', '0,0 4,0 4,1 3,1 3,3 1,3 1,1 0,1'),
  def('thuoc-tho', 'Thước thợ', 1, 'B', '0,4 4,4 0,0'),
  // Bậc thầy
  def('meo', 'Mèo ngồi', 2, 'A', '0,0 4,0 3,1 4,2 5,1 5,3 4,4 0,4 0,2 1,1'),
  def(
    'ga',
    'Ngỗng',
    2,
    'B',
    '1,1 3,1 3,3 1,3',
    '0,0 1,0 2,1 1,1',
    '0,-1 1,-1 1,0 0,0',
    '3,1 4,2 3,3',
    '1,3 2,3 1,4',
    '2,3 3,3 3,4',
  ),
  def(
    'nguoi',
    'Người múa',
    2,
    'B',
    '1,0 2,0 2,1 1,1',
    '1,1 2,1 4,3 -1,3',
    '0,3 1,3 1,4',
    '2,3 3,3 2,4',
  ),
  def('tia-chop', 'Tia chớp', 2, 'A', '0,0 4,0 6,2 4,2 6,4 2,4 0,2 2,2'),
  def('ngoc', 'Viên ngọc', 2, 'B', '2,0 3,1 4,1 4,2 3,3 1,3 0,2 0,1 1,1'),
  def('chu-l', 'Chữ L', 2, 'B', '0,0 2,0 2,2 4,2 4,3 0,3'),
  def('thang-vuong', 'Bậc thềm', 2, 'A', '0,0 4,4 4,6 0,6'),
  def('cot-co', 'Lá cờ nghiêng', 2, 'A', '2,0 6,4 6,8 2,4'),
];

const solutions = new Map<string, Placement[]>();

/** One known solution, used for the "Nhập môn" guide lines and for hints. */
export function solution(p: TangramPuzzle): Placement[] {
  let s = solutions.get(p.id);
  if (!s) {
    s = solve(p.outline) ?? [];
    solutions.set(p.id, s);
  }
  return s;
}
