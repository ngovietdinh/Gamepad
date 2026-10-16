import { Camera } from '../core/camera';
import { Vec, add, clamp, dist, easeOutBack, easeOutCubic, lerp, pointInPolygon, rotate, sub } from '../core/geom';
import { InputHandler, InputManager, PointerSample, TwistGesture } from '../core/input';
import { makeRng, Rng, hashString, shuffle } from '../core/rng';
import { store } from '../core/store';
import { C, eggshell, leaf } from '../art/lacquer';
import { sfx } from '../fx/audio';
import { Particles } from '../fx/particles';
import { TPiece, TangramEngine } from './engine';
import { TangramPuzzle, solution } from './puzzles';
import { Placement, boundaryLoops } from './geometry';

export interface TangramCallbacks {
  progress(coverage: number): void;
  complete(stats: { ms: number; hints: number }): void;
  select(piece: TPiece | null): void;
}

const UNIT = 46;
const STEP = Math.PI / 4;
const HANDLE_GAP = 30; // CSS px beyond the piece radius

interface Look {
  base: string;
  light: string;
  dark: string;
  texture: 'leaf' | 'egg' | 'silver' | 'plain';
}

// One lacquer finish per piece: L, L, M, S, S, Q, P.
const LOOKS: Look[] = [
  { base: C.cinnabar, light: C.vermilion, dark: C.oxblood, texture: 'leaf' },
  { base: C.jade, light: '#4f8a6e', dark: C.jadeDeep, texture: 'leaf' },
  { base: C.gold, light: C.goldPale, dark: C.goldDeep, texture: 'leaf' },
  { base: C.egg, light: '#fbf6ea', dark: C.eggShade, texture: 'egg' },
  { base: '#7a2a18', light: '#a4452a', dark: '#3f120a', texture: 'leaf' },
  { base: C.teal, light: C.pearl, dark: '#22403c', texture: 'silver' },
  { base: C.ochre, light: '#e0a64a', dark: '#7d5418', texture: 'plain' },
];

interface Sprite {
  img: HTMLCanvasElement;
  shadow: HTMLCanvasElement;
  r: number; // half size in world units
}

interface Drag {
  piece: TPiece;
  offset: Vec;
  pointer: number;
  kind: PointerSample['kind'];
  pressure: number;
  mode: 'move' | 'rotate';
  rotStart: number;
  angleStart: number;
}

export class TangramScene implements InputHandler {
  readonly engine: TangramEngine;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cam = new Camera();
  private input: InputManager;
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private cssW = 0;
  private cssH = 0;
  private res = 2;
  private sprites: Sprite[] = [];
  private order: TPiece[];
  private table = { x: 0, y: 0, w: 0, h: 0 };
  private silBounds = { x: 0, y: 0, w: 0, h: 0 };
  private silPath = new Path2D();
  private guide: Placement[];

  private drag: Drag | null = null;
  private selected: TPiece | null = null;
  private hoverState: { piece: TPiece | null; handle: boolean; pos: Vec } | null = null;
  private lift = 0;
  private lastTap = { id: -1, time: 0 };
  private spin = new Map<number, { from: number; t: number }>();
  private flipAnim = new Map<number, number>();
  private tweens = new Map<number, { from: Vec; to: Vec; t: number; dur: number; delay: number }>();
  private glints: { piece: TPiece; t: number }[] = [];
  private hintMark: { pl: Placement; piece: TPiece; t: number } | null = null;
  private particles = new Particles();
  private gestureCam: { zoom: number; pan: Vec } | null = null;
  private camGlide: { fromZoom: number; fromPan: Vec; toZoom: number; toPan: Vec } | null = null;
  private twistBase = 0;

  private hints = 0;
  private elapsed = 0;
  private started = false;
  private done = false;
  private finale = -1;
  private raf = 0;
  private last = 0;
  private dirty = true;
  private resizeObs: ResizeObserver;

  constructor(
    private host: HTMLElement,
    readonly puzzle: TangramPuzzle,
    private cb: TangramCallbacks,
    private insets = { top: 84, right: 20, bottom: 24, left: 20 },
  ) {
    this.engine = new TangramEngine(puzzle, UNIT);
    this.order = [...this.engine.pieces];
    this.guide = solution(puzzle);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.input = new InputManager(this.canvas, this);
    const r = host.getBoundingClientRect();
    this.cssW = r.width;
    this.cssH = r.height;
    this.layout();
    this.bakeAll();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.input.destroy();
    this.resizeObs.disconnect();
    this.canvas.remove();
  }

  /* ---------------------------------------------------------------- */
  /* Layout & baking                                                   */
  /* ---------------------------------------------------------------- */

  private layout() {
    const e = this.engine;
    // Silhouette bounds in world space with the lattice origin at (0,0).
    const pts = e.puzzle.outline.flat().map((p) => e.latticeToWorld(p));
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    // Centre the silhouette on (0,0).
    e.origin = { x: -(minX + maxX) / 2, y: -(minY + maxY) / 2 };
    const w = maxX - minX;
    const h = maxY - minY;
    this.silBounds = { x: -w / 2, y: -h / 2, w, h };
    this.silPath = new Path2D();
    for (const poly of boundaryLoops(e.target)) {
      poly.forEach((p, i) => {
        const q = e.latticeToWorld(p);
        if (i === 0) this.silPath.moveTo(q.x, q.y);
        else this.silPath.lineTo(q.x, q.y);
      });
      this.silPath.closePath();
    }

    // Pieces wait in a tray beside the silhouette: right on landscape, below on portrait.
    const landscape = this.cssW >= this.cssH;
    const rng = makeRng(hashString(e.puzzle.id));
    const area = Math.max(w, h, UNIT * 6);
    const trayCols = landscape ? 2 : 4;
    const cell = UNIT * 3.3;
    const trayW = trayCols * cell;
    const trayH = Math.ceil(7 / trayCols) * cell;
    const tray = landscape
      ? { x: area / 2 + UNIT * 1.6, y: -trayH / 2 }
      : { x: -trayW / 2, y: area / 2 + UNIT * 1.6 };
    const slots: Vec[] = [];
    for (let i = 0; i < 7; i++) {
      const cx = i % trayCols;
      const cy = Math.floor(i / trayCols);
      slots.push({ x: tray.x + cell * (cx + 0.5), y: tray.y + cell * (cy + 0.5) });
    }
    const order = shuffle(rng, [...e.pieces]);
    order.forEach((p, i) => {
      p.pos = { ...slots[i] };
      p.rot = this.startRotation(rng);
      p.flip = e.puzzle.tier === 2 && p.kind === 'P' ? rng() < 0.5 : false;
    });
    const left = Math.min(-area / 2, tray.x) - UNIT;
    const top = Math.min(-area / 2, tray.y) - UNIT;
    const right = Math.max(area / 2, tray.x + trayW) + UNIT;
    const bottom = Math.max(area / 2, tray.y + trayH) + UNIT;
    this.table = { x: left, y: top, w: right - left, h: bottom - top };
  }

  private startRotation(rng: Rng) {
    const f = this.engine.frameRot;
    if (this.puzzle.tier === 0) return f + 2 * Math.floor(rng() * 4);
    return f + Math.floor(rng() * 8);
  }

  private resize() {
    const r = this.host.getBoundingClientRect();
    const wasLandscape = this.cssW >= this.cssH;
    this.cssW = r.width;
    this.cssH = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.canvas.style.width = `${r.width}px`;
    this.canvas.style.height = `${r.height}px`;
    if (!this.started && wasLandscape !== this.cssW >= this.cssH) this.layout();
    this.fit();
  }

  fit() {
    this.cam.fit(this.table, { w: this.cssW, h: this.cssH }, this.insets);
    this.dirty = true;
  }

  private bakeAll() {
    this.res = clamp(this.cam.zoom * this.dpr * 2, 1.5, 3);
    for (const p of this.engine.pieces) this.sprites[p.index] = this.bake(p);
  }

  private bake(p: TPiece): Sprite {
    const look = LOOKS[p.index];
    const pts = p.local.map((v) => ({ x: v.x * UNIT, y: v.y * UNIT }));
    const r = Math.max(...pts.map((v) => Math.hypot(v.x, v.y))) + 6;
    const res = this.res;
    const size = Math.ceil(r * 2 * res);
    const path = new Path2D();
    pts.forEach((v, i) => (i ? path.lineTo(v.x, v.y) : path.moveTo(v.x, v.y)));
    path.closePath();

    const img = document.createElement('canvas');
    img.width = size;
    img.height = size;
    const c = img.getContext('2d')!;
    c.setTransform(res, 0, 0, res, r * res, r * res);
    const rng = makeRng(p.index * 977 + 13);
    const grad = c.createLinearGradient(-r, -r, r, r);
    grad.addColorStop(0, look.light);
    grad.addColorStop(0.45, look.base);
    grad.addColorStop(1, look.dark);
    c.save();
    c.clip(path);
    c.fillStyle = grad;
    c.fillRect(-r, -r, r * 2, r * 2);
    if (look.texture === 'egg') {
      eggshell(c, rng, { x: -r, y: -r, w: r * 2, h: r * 2 }, 7);
    } else if (look.texture === 'leaf') {
      leaf(c, rng, { x: -r, y: -r, w: r * 2, h: r * 2 }, 30, [3, 7], 'gold', 0.5);
    } else if (look.texture === 'silver') {
      leaf(c, rng, { x: -r, y: -r, w: r * 2, h: r * 2 }, 40, [3, 7], 'silver', 0.55);
    }
    // Polished highlight.
    const sheen = c.createLinearGradient(-r, -r, r * 0.3, r * 0.3);
    sheen.addColorStop(0, 'rgba(255,245,220,0.35)');
    sheen.addColorStop(1, 'rgba(255,245,220,0)');
    c.fillStyle = sheen;
    c.fillRect(-r, -r, r * 2, r * 2);
    // Inner bevel.
    c.lineWidth = 4;
    c.translate(1.2, 1.2);
    c.strokeStyle = 'rgba(20,6,3,0.45)';
    c.stroke(path);
    c.translate(-2.4, -2.4);
    c.strokeStyle = 'rgba(255,240,210,0.4)';
    c.stroke(path);
    c.restore();
    // Inlaid gold rim.
    c.lineJoin = 'round';
    c.lineWidth = 1.6;
    c.strokeStyle = 'rgba(243,220,152,0.9)';
    c.stroke(path);

    const shadow = document.createElement('canvas');
    const ss = Math.ceil(r * 2 * res * 0.5);
    shadow.width = ss;
    shadow.height = ss;
    const sc = shadow.getContext('2d')!;
    const sr = res * 0.5;
    const far = 4000;
    sc.setTransform(sr, 0, 0, sr, r * sr - far, r * sr);
    sc.shadowColor = 'rgba(10,2,0,0.65)';
    sc.shadowBlur = 7 * sr;
    sc.shadowOffsetX = far;
    sc.fill(path);
    return { img, shadow, r };
  }

  /* ---------------------------------------------------------------- */
  /* Public actions                                                    */
  /* ---------------------------------------------------------------- */

  flipSelected() {
    const p = this.selected;
    if (!p || this.done) return;
    this.doFlip(p);
  }

  rotateSelected(dir: 1 | -1) {
    const p = this.selected;
    if (!p || this.done) return;
    this.turn(p, dir);
  }

  hint() {
    if (this.done) return;
    const e = this.engine;
    // Find a solution piece no player piece occupies yet.
    const placed = e.pieces.map((p) => e.cells(p));
    const sameCells = (pl: Placement, cells: Set<number> | null) => {
      if (!cells) return false;
      const t = new Set<number>();
      const tmp = { ...e.pieces[0], local: e.pieces.find((x) => x.kind === pl.kind)!.local };
      e.placeAt(tmp, pl);
      for (const c of e.cells(tmp) ?? []) t.add(c);
      if (t.size !== cells.size) return false;
      for (const c of t) if (!cells.has(c)) return false;
      return true;
    };
    const open = this.guide.filter((pl) => !placed.some((c) => sameCells(pl, c)));
    if (!open.length) return;
    const pl = open[0];
    const piece =
      e.pieces.find((p, i) => p.kind === pl.kind && !this.guide.some((g) => sameCells(g, placed[i]))) ??
      e.pieces.find((p) => p.kind === pl.kind)!;
    this.hintMark = { pl, piece, t: 0 };
    this.hints++;
    sfx.hint();
    this.dirty = true;
  }

  get stats() {
    return { ms: this.elapsed * 1000, hints: this.hints };
  }

  /** The assembled figure, rendered on its own for the result card. */
  snapshot(size: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    const dpr = this.dpr;
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    const b = this.silBounds;
    const s = (size * 0.84) / Math.max(b.w, b.h);
    ctx.setTransform(s * dpr, 0, 0, s * dpr, (size / 2 - (b.x + b.w / 2) * s) * dpr, (size / 2 - (b.y + b.h / 2) * s) * dpr);
    this.hoverState = null;
    for (const p of this.order) this.drawPiece(ctx, p, 0);
    c.style.width = `${size}px`;
    c.style.height = `${size}px`;
    return c;
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  private pieceAt(world: Vec): TPiece | null {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const p = this.order[i];
      if (pointInPolygon(world, this.engine.polygon(p))) return p;
    }
    return null;
  }

  private handlePos(p: TPiece): Vec {
    const r = this.sprites[p.index].r + HANDLE_GAP / this.cam.zoom;
    return add(p.pos, rotate({ x: 0, y: -r }, p.rot * STEP));
  }

  private onHandle(screen: Vec): TPiece | null {
    if (!this.selected) return null;
    const h = this.cam.toScreen(this.handlePos(this.selected));
    return dist(h, screen) < 24 ? this.selected : null;
  }

  private select(p: TPiece | null) {
    if (this.selected !== p) {
      this.selected = p;
      this.cb.select(p);
    }
  }

  down(s: PointerSample) {
    if (this.done) return 'pan' as const;
    const world = this.cam.toWorld(s.pos);
    const handlePiece = this.onHandle(s.pos);
    const piece = handlePiece ?? this.pieceAt(world);
    if (!piece) {
      this.select(null);
      this.dirty = true;
      return 'pan' as const;
    }
    this.tweens.delete(piece.index);
    this.order = [...this.order.filter((x) => x !== piece), piece];
    this.select(piece);
    this.started = true;
    this.drag = {
      piece,
      offset: sub(world, piece.pos),
      pointer: s.id,
      kind: s.kind,
      pressure: s.pressure,
      mode: handlePiece ? 'rotate' : 'move',
      rotStart: piece.rot,
      angleStart: Math.atan2(world.y - piece.pos.y, world.x - piece.pos.x),
    };
    this.hoverState = null;
    sfx.pick();
    this.dirty = true;
    return 'grab' as const;
  }

  move(s: PointerSample) {
    const d = this.drag;
    if (!d || d.pointer !== s.id) return;
    const world = this.cam.toWorld(s.pos);
    d.pressure = s.pressure;
    if (d.mode === 'move') {
      d.piece.pos = sub(world, d.offset);
    } else {
      const a = Math.atan2(world.y - d.piece.pos.y, world.x - d.piece.pos.x);
      let delta = a - d.angleStart;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      // Gentle detents near each 45° step.
      const raw = d.rotStart + delta / STEP;
      const near = Math.round(raw);
      d.piece.rot = Math.abs(raw - near) < 0.12 ? near : raw;
    }
    this.dirty = true;
  }

  up(s: PointerSample, cancelled: boolean) {
    const d = this.drag;
    if (!d || d.pointer !== s.id) return;
    this.drag = null;
    if (!cancelled) this.settle(d.piece, d.mode === 'rotate');
    this.dirty = true;
  }

  tap(s: PointerSample) {
    if (this.done) return;
    const world = this.cam.toWorld(s.pos);
    const piece = this.pieceAt(world);
    if (!piece) return;
    const now = s.time;
    if (this.lastTap.id === piece.index && now - this.lastTap.time < 320) {
      // Double tap: undo the rotation from the first tap, then flip.
      this.turn(piece, -1, false);
      this.doFlip(piece);
      this.lastTap = { id: -1, time: 0 };
      return;
    }
    this.lastTap = { id: piece.index, time: now };
    this.turn(piece, 1);
  }

  hover(s: PointerSample | null) {
    if (!s) {
      if (this.hoverState) this.dirty = true;
      this.hoverState = null;
      return;
    }
    const handle = !!this.onHandle(s.pos);
    const piece = handle ? this.selected : this.pieceAt(this.cam.toWorld(s.pos));
    this.hoverState = { piece, handle, pos: s.pos };
    this.dirty = true;
  }

  pan(d: Vec) {
    this.cam.translate(d);
    this.dirty = true;
  }

  gestureStart(holding: boolean) {
    if (holding && this.drag) {
      this.twistBase = this.drag.piece.rot;
      return;
    }
    this.gestureCam = { zoom: this.cam.zoom, pan: { ...this.cam.pan } };
  }

  gesture(g: TwistGesture, holding: boolean) {
    if (holding && this.drag) {
      this.drag.piece.rot = this.twistBase + g.rotation / STEP;
      this.dirty = true;
      return;
    }
    if (!this.gestureCam) return;
    const start = this.gestureCam;
    const c0 = sub(g.center, g.translate);
    const w0 = { x: (c0.x - start.pan.x) / start.zoom, y: (c0.y - start.pan.y) / start.zoom };
    this.cam.zoom = clamp(start.zoom * g.scale, this.cam.minZoom, this.cam.maxZoom);
    this.cam.pan = { x: g.center.x - w0.x * this.cam.zoom, y: g.center.y - w0.y * this.cam.zoom };
    this.dirty = true;
  }

  gestureEnd(holding: boolean) {
    this.gestureCam = null;
    if (holding && this.drag) {
      const p = this.drag.piece;
      const from = p.rot;
      p.rot = Math.round(p.rot);
      this.spin.set(p.index, { from: from - p.rot, t: 0 });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Moves                                                             */
  /* ---------------------------------------------------------------- */

  private turn(p: TPiece, dir: 1 | -1, settle = true) {
    const prev = this.spin.get(p.index);
    const carry = prev ? prev.from * (1 - easeOutCubic(Math.min(1, prev.t / 0.2))) : 0;
    p.rot = Math.round(p.rot) + dir;
    if (!store.settings.reduceMotion) this.spin.set(p.index, { from: -dir + carry, t: 0 });
    sfx.rotate();
    if (settle) this.settle(p, true);
    this.dirty = true;
  }

  private doFlip(p: TPiece) {
    p.flip = !p.flip;
    if (!store.settings.reduceMotion) this.flipAnim.set(p.index, 0);
    sfx.rotate();
    this.settle(p, true);
    this.dirty = true;
  }

  private settle(p: TPiece, fromRotation: boolean) {
    const before = p.rot;
    p.rot = Math.round(p.rot);
    if (Math.abs(before - p.rot) > 1e-6 && !store.settings.reduceMotion) {
      this.spin.set(p.index, { from: before - p.rot, t: 0 });
    }
    const shift = this.engine.snap(p);
    if (shift && (shift.x || shift.y) && !store.settings.reduceMotion) {
      this.tweens.set(p.index, { from: sub(p.pos, shift), to: { ...p.pos }, t: 0, dur: 0.12, delay: 0 });
    }
    const fits = this.engine.fits(p);
    if (fits) {
      this.glints.push({ piece: p, t: 0 });
      const cov = this.engine.coverage();
      sfx.snap(Math.round(cov * 9));
      const poly = this.engine.polygon(p);
      const c = poly.reduce((a, v) => add(a, v), { x: 0, y: 0 });
      this.particles.burst(c.x / poly.length, c.y / poly.length, 12, 6, 140);
      if (this.hintMark?.piece === p) this.hintMark = null;
    } else if (!fromRotation) {
      sfx.drop();
    }
    this.cb.progress(this.engine.coverage());
    if (this.engine.solved()) this.beginFinale();
  }

  private beginFinale() {
    this.done = true;
    this.finale = 0;
    this.hintMark = null;
    this.select(null);
    const b = this.silBounds;
    const target = new Camera();
    const pad = UNIT * 2.2;
    target.fit({ x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }, { w: this.cssW, h: this.cssH }, this.insets);
    this.camGlide = { fromZoom: this.cam.zoom, fromPan: { ...this.cam.pan }, toZoom: target.zoom, toPan: target.pan };
    sfx.complete();
    if (!store.settings.reduceMotion) {
      const b = this.silBounds;
      this.particles.rain(b.x - 100, b.y - 140, b.w + 200, 110, 9);
    }
    setTimeout(() => this.cb.complete({ ms: this.elapsed * 1000, hints: this.hints }), 1900);
  }

  /* ---------------------------------------------------------------- */
  /* Loop & draw                                                       */
  /* ---------------------------------------------------------------- */

  private loop(now: number) {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0.016;
    this.last = now;
    const busy = this.update(dt);
    if (busy || this.dirty) {
      this.draw();
      this.dirty = false;
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  private update(dt: number) {
    let busy = false;
    if (this.started && !this.done && document.visibilityState === 'visible') this.elapsed += dt;
    for (const [id, s] of this.spin) {
      busy = true;
      s.t += dt;
      if (s.t >= 0.2) this.spin.delete(id);
    }
    for (const [id, t] of this.flipAnim) {
      busy = true;
      if (t + dt >= 0.28) this.flipAnim.delete(id);
      else this.flipAnim.set(id, t + dt);
    }
    for (const [id, tw] of this.tweens) {
      busy = true;
      tw.t += dt;
      if (tw.t >= tw.dur) this.tweens.delete(id);
    }
    this.glints = this.glints.filter((g) => (g.t += dt) < 0.8);
    if (this.glints.length) busy = true;
    if (this.hintMark) {
      busy = true;
      this.hintMark.t += dt;
      if (this.hintMark.t > 3.4) this.hintMark = null;
    }
    if (this.particles.active) {
      this.particles.update(dt);
      busy = true;
    }
    if (this.finale >= 0 && this.finale < 2.2) {
      this.finale += dt;
      busy = true;
      if (this.camGlide) {
        const g = this.camGlide;
        const k = easeOutCubic(clamp(this.finale / 0.9, 0, 1));
        this.cam.zoom = lerp(g.fromZoom, g.toZoom, k);
        this.cam.pan = { x: lerp(g.fromPan.x, g.toPan.x, k), y: lerp(g.fromPan.y, g.toPan.y, k) };
        if (k >= 1) this.camGlide = null;
      }
    }
    const target = this.drag ? (this.drag.kind === 'pen' ? 0.35 + this.drag.pressure * 0.9 : 0.8) : 0;
    if (Math.abs(this.lift - target) > 0.01) {
      this.lift += (target - this.lift) * Math.min(1, dt * 14);
      busy = true;
    }
    return busy;
  }

  private visualPos(p: TPiece): Vec {
    const tw = this.tweens.get(p.index);
    if (!tw) return p.pos;
    const k = easeOutBack(Math.min(1, tw.t / tw.dur));
    return { x: lerp(tw.from.x, tw.to.x, k), y: lerp(tw.from.y, tw.to.y, k) };
  }

  private visualRot(p: TPiece): number {
    const s = this.spin.get(p.index);
    if (!s) return p.rot;
    return p.rot + s.from * (1 - easeOutBack(Math.min(1, s.t / 0.2)));
  }

  private draw() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.cam.apply(ctx, this.dpr);
    this.drawSilhouette(ctx);

    if (this.hintMark) this.drawHintTarget(ctx);

    for (const p of this.order) {
      const isDrag = this.drag?.piece === p;
      this.drawPiece(ctx, p, isDrag ? this.lift : 0);
    }

    for (const g of this.glints) this.drawGlint(ctx, g.piece, g.t);
    if (this.selected && !this.done) this.drawSelection(ctx, this.selected);
    if (this.hintMark) this.drawHintPiece(ctx);

    this.particles.draw(ctx);

    if (this.hoverState && !this.drag) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.beginPath();
      ctx.arc(this.hoverState.pos.x, this.hoverState.pos.y, this.hoverState.piece ? 9 : 5, 0, Math.PI * 2);
      ctx.strokeStyle = this.hoverState.piece ? 'rgba(156,195,188,0.95)' : 'rgba(239,230,210,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  private drawSilhouette(ctx: CanvasRenderingContext2D) {
    const tier = this.puzzle.tier;
    const fin = this.finale >= 0 ? easeOutCubic(clamp(this.finale / 1.2, 0, 1)) : 0;
    ctx.save();
    ctx.fillStyle = tier === 2 ? '#3a1610' : '#1a0806';
    ctx.fill(this.silPath);
    // Inner shadow to read as a recess carved in the lacquer.
    ctx.clip(this.silPath);
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 14 * this.cam.zoom * this.dpr;
    ctx.shadowOffsetY = 4 * this.cam.zoom * this.dpr;
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.stroke(this.silPath);
    ctx.restore();

    if (tier === 0) {
      ctx.save();
      ctx.setLineDash([5, 6]);
      ctx.strokeStyle = 'rgba(224,182,90,0.45)';
      ctx.lineWidth = 1.4;
      for (const pl of this.guide) {
        ctx.beginPath();
        pl.poly.forEach((v, i) => {
          const q = this.engine.latticeToWorld(v);
          if (i) ctx.lineTo(q.x, q.y);
          else ctx.moveTo(q.x, q.y);
        });
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }
    if (tier < 2) {
      ctx.save();
      ctx.strokeStyle = 'rgba(224,182,90,0.85)';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke(this.silPath);
      ctx.restore();
    }
    if (fin > 0) {
      ctx.save();
      ctx.globalAlpha = Math.sin(fin * Math.PI) * 0.9;
      ctx.strokeStyle = C.goldPale;
      ctx.lineWidth = 3 + fin * 8;
      ctx.lineJoin = 'round';
      ctx.stroke(this.silPath);
      ctx.restore();
    }
  }

  private drawPiece(ctx: CanvasRenderingContext2D, p: TPiece, lift: number) {
    const sp = this.sprites[p.index];
    const pos = this.visualPos(p);
    const rot = this.visualRot(p) * STEP;
    const fa = this.flipAnim.get(p.index);
    // Flip animates as a squash through zero width.
    let sx = p.flip ? -1 : 1;
    if (fa !== undefined) sx *= -Math.cos((fa / 0.28) * Math.PI);
    const scale = 1 + lift * 0.05;
    const off = 2 + lift * 9;
    ctx.save();
    ctx.translate(pos.x + off * 0.6, pos.y + off);
    ctx.rotate(rot);
    ctx.scale(sx * scale, scale);
    ctx.globalAlpha = 0.6 + lift * 0.25;
    ctx.drawImage(sp.shadow, -sp.r, -sp.r, sp.r * 2, sp.r * 2);
    ctx.restore();
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(rot);
    ctx.scale(sx * scale, scale);
    ctx.drawImage(sp.img, -sp.r, -sp.r, sp.r * 2, sp.r * 2);
    ctx.restore();
    if (this.hoverState?.piece === p && !this.hoverState.handle && this.drag?.piece !== p) {
      this.strokePoly(ctx, this.engine.polygon(p), 'rgba(156,195,188,0.95)', 2.2 / this.cam.zoom);
    }
  }

  private strokePoly(ctx: CanvasRenderingContext2D, poly: Vec[], color: string, width: number) {
    ctx.save();
    ctx.beginPath();
    poly.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  private drawSelection(ctx: CanvasRenderingContext2D, p: TPiece) {
    if (this.drag && this.drag.mode === 'move') return;
    const h = this.handlePos(p);
    const z = this.cam.zoom;
    ctx.save();
    ctx.strokeStyle = 'rgba(243,220,152,0.7)';
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([3 / z, 4 / z]);
    ctx.beginPath();
    ctx.moveTo(p.pos.x, p.pos.y);
    ctx.lineTo(h.x, h.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const active = this.hoverState?.handle || this.drag?.mode === 'rotate';
    ctx.beginPath();
    ctx.arc(h.x, h.y, (active ? 12 : 10) / z, 0, Math.PI * 2);
    ctx.fillStyle = active ? C.goldPale : C.gold;
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,12,6,0.9)';
    ctx.lineWidth = 1.5 / z;
    ctx.stroke();
    // Curved arrow glyph inside the knob.
    ctx.beginPath();
    ctx.arc(h.x, h.y, 5 / z, -Math.PI * 0.9, Math.PI * 0.4);
    ctx.strokeStyle = '#3b1a10';
    ctx.lineWidth = 1.6 / z;
    ctx.stroke();
    ctx.restore();
  }

  private drawGlint(ctx: CanvasRenderingContext2D, p: TPiece, t: number) {
    const k = t / 0.8;
    const poly = this.engine.polygon(p);
    ctx.save();
    ctx.beginPath();
    poly.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
    ctx.closePath();
    ctx.setLineDash([UNIT * 0.6, UNIT * 2.4]);
    ctx.lineDashOffset = -k * UNIT * 6;
    ctx.strokeStyle = `rgba(255,236,170,${1 - k})`;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }

  private drawHintTarget(ctx: CanvasRenderingContext2D) {
    const m = this.hintMark!;
    const a = Math.min(1, m.t * 3) * Math.min(1, (3.4 - m.t) * 2);
    ctx.save();
    ctx.beginPath();
    m.pl.poly.forEach((v, i) => {
      const q = this.engine.latticeToWorld(v);
      if (i) ctx.lineTo(q.x, q.y);
      else ctx.moveTo(q.x, q.y);
    });
    ctx.closePath();
    ctx.fillStyle = `rgba(243,220,152,${0.22 * a})`;
    ctx.fill();
    ctx.setLineDash([7, 5]);
    ctx.lineDashOffset = -m.t * 30;
    ctx.strokeStyle = `rgba(243,220,152,${a})`;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.restore();
  }

  private drawHintPiece(ctx: CanvasRenderingContext2D) {
    const m = this.hintMark!;
    const a = Math.min(1, (3.4 - m.t) * 2);
    const r = this.sprites[m.piece.index].r;
    for (let i = 0; i < 2; i++) {
      const ph = (m.t * 1.2 + i * 0.5) % 1;
      ctx.beginPath();
      ctx.arc(m.piece.pos.x, m.piece.pos.y, r * (0.8 + ph * 0.6), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(243,220,152,${(1 - ph) * 0.8 * a})`;
      ctx.lineWidth = 2.5 / this.cam.zoom;
      ctx.stroke();
    }
  }
}

/** Small silhouette preview for level cards. */
export function renderSilhouette(puzzle: TangramPuzzle, size: number, color: string): HTMLCanvasElement {
  const e = new TangramEngine(puzzle, 1);
  const pts = puzzle.outline.map((poly) => poly.map((p) => e.latticeToWorld(p)));
  const flat = pts.flat();
  const minX = Math.min(...flat.map((p) => p.x));
  const maxX = Math.max(...flat.map((p) => p.x));
  const minY = Math.min(...flat.map((p) => p.y));
  const maxY = Math.max(...flat.map((p) => p.y));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = size * dpr;
  c.height = size * dpr;
  const ctx = c.getContext('2d')!;
  const s = (size * 0.78) / Math.max(maxX - minX, maxY - minY);
  ctx.setTransform(s * dpr, 0, 0, s * dpr, (size / 2 - ((minX + maxX) / 2) * s) * dpr, (size / 2 - ((minY + maxY) / 2) * s) * dpr);
  ctx.beginPath();
  for (const poly of pts) {
    poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  }
  ctx.fillStyle = color;
  ctx.fill();
  return c;
}
