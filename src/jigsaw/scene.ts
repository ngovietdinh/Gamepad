import { Camera } from '../core/camera';
import { Vec, add, clamp, easeOutBack, easeOutCubic, lerp, sub } from '../core/geom';
import { InputHandler, InputManager, PointerSample, TwistGesture } from '../core/input';
import { makeRng } from '../core/rng';
import { store } from '../core/store';
import { Painting, renderPainting } from '../art/paintings';
import { sfx } from '../fx/audio';
import { Particles } from '../fx/particles';
import { KNOB_REACH, applyPath, pieceOutline } from './cut';
import { Group, JigsawEngine, Piece } from './engine';

export interface JigsawLevel {
  painting: Painting;
  cols: number;
  rows: number;
  rotation: boolean;
  seed: number;
}

export interface JigsawCallbacks {
  progress(locked: number, total: number): void;
  complete(stats: { ms: number; hints: number }): void;
}

const BOARD_W = 1200;
const BOARD_H = 900;
const QUARTER = Math.PI / 2;

interface Sprite {
  img: HTMLCanvasElement;
  shadow: HTMLCanvasElement;
  path: Path2D;
}

interface Drag {
  group: Group;
  offset: Vec;
  pointer: number;
  kind: PointerSample['kind'];
  pressure: number;
  twistApplied: number;
}

interface Tween {
  from: Vec;
  to: Vec;
  t: number;
  dur: number;
  delay: number;
}

export class JigsawScene implements InputHandler {
  readonly engine: JigsawEngine;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cam = new Camera();
  private input: InputManager;
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private cssW = 0;
  private cssH = 0;
  private res = 1.5; // sprite pixels per world unit
  private image!: HTMLCanvasElement;
  private sprites: Sprite[] = [];
  private pad = 0;
  private shadowPad = 0;
  private boardLayer!: HTMLCanvasElement;
  private boardDirty = true;
  private hitCtx = document.createElement('canvas').getContext('2d')!;

  private drag: Drag | null = null;
  private hoverState: { piece: Piece | null; pos: Vec } | null = null;
  private lift = 0;
  private tweens = new Map<Group, Tween>();
  private spins = new Map<Group, { pivot: Vec; from: number; t: number }>();
  private settle = new Map<number, { from: Vec; t: number }>();
  private shimmers: { pieces: Piece[]; t: number }[] = [];
  private hintMark: { piece: Piece; t: number } | null = null;
  private particles = new Particles();
  private finale = -1;
  private gestureCam: { zoom: number; pan: Vec } | null = null;
  private camGlide: { fromZoom: number; fromPan: Vec; toZoom: number; toPan: Vec } | null = null;

  private edgeOnly = false;
  private ghost = store.settings.ghost;
  private hints = 0;
  private elapsed = 0;
  private started = false;
  private done = false;
  private raf = 0;
  private last = 0;
  private dirty = true;
  private resizeObs: ResizeObserver;
  private intro = 0;

  constructor(
    private host: HTMLElement,
    readonly level: JigsawLevel,
    private cb: JigsawCallbacks,
    private insets = { top: 84, right: 20, bottom: 24, left: 20 },
  ) {
    this.engine = new JigsawEngine({
      cols: level.cols,
      rows: level.rows,
      boardW: BOARD_W,
      boardH: BOARD_H,
      rotation: level.rotation,
      rng: makeRng(level.seed),
    });
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.input = new InputManager(this.canvas, this);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
    this.prepare();
    this.startIntro();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.input.destroy();
    this.resizeObs.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.remove();
  }

  private onVisibility = () => {
    this.last = performance.now();
  };

  /* ---------------------------------------------------------------- */
  /* Setup                                                             */
  /* ---------------------------------------------------------------- */

  private resize() {
    const r = this.host.getBoundingClientRect();
    this.cssW = r.width;
    this.cssH = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.canvas.style.width = `${r.width}px`;
    this.canvas.style.height = `${r.height}px`;
    this.fit();
  }

  /** Aspect ratio of the area left for the table once the HUD is accounted for. */
  private get viewAspect() {
    const w = Math.max(1, this.cssW - this.insets.left - this.insets.right);
    const h = Math.max(1, this.cssH - this.insets.top - this.insets.bottom);
    return w / h;
  }

  fit() {
    const t = this.engine.table;
    const world = t.w ? t : { x: -150, y: -150, w: BOARD_W + 300, h: BOARD_H + 300 };
    this.cam.fit(world, { w: this.cssW, h: this.cssH }, this.insets);
    this.dirty = true;
  }

  private prepare() {
    const e = this.engine;
    // Scatter first so the table size (and thus the fit zoom) is known.
    const targets = e.scatter(makeRng(this.level.seed + 1), this.viewAspect, this.level.rotation);
    this.fit();
    // Sprite resolution: sharp at 2x zoom on a retina screen, capped for memory.
    this.res = clamp(this.cam.zoom * this.dpr * 1.8, 1, 2400 / BOARD_W);
    this.image = renderPainting(this.level.painting, BOARD_W * this.res);
    const s = Math.min(e.pw, e.ph);
    this.pad = s * KNOB_REACH + 3;
    this.shadowPad = this.pad + s * 0.12;
    for (const p of e.pieces) this.sprites[p.id] = this.bake(p);
    this.boardLayer = document.createElement('canvas');
    this.boardLayer.width = Math.round(BOARD_W * this.res);
    this.boardLayer.height = Math.round(BOARD_H * this.res);
    // Save scatter targets for the intro.
    this.introTargets = targets;
  }

  private introTargets = new Map<Group, { pos: Vec; rot: number }>();

  private bake(p: Piece): Sprite {
    const e = this.engine;
    const res = this.res;
    const cmds = pieceOutline(e.cut, p.row, p.col, e.pw, e.ph);
    const path = new Path2D();
    applyPath(path, cmds);

    const w = e.pw + this.pad * 2;
    const h = e.ph + this.pad * 2;
    const img = document.createElement('canvas');
    img.width = Math.ceil(w * res);
    img.height = Math.ceil(h * res);
    const c = img.getContext('2d')!;
    c.setTransform(res, 0, 0, res, this.pad * res, this.pad * res);
    c.save();
    c.clip(path);
    c.drawImage(this.image, -p.col * e.pw, -p.row * e.ph, BOARD_W, BOARD_H);
    // Bevel: light from top-left, shade bottom-right, drawn inside the clip.
    const bevel = Math.max(1.2, Math.min(e.pw, e.ph) * 0.02);
    c.lineWidth = bevel * 2;
    c.translate(-bevel * 0.6, -bevel * 0.6);
    c.strokeStyle = 'rgba(30,8,4,0.55)';
    c.stroke(path);
    c.translate(bevel * 1.2, bevel * 1.2);
    c.strokeStyle = 'rgba(255,238,200,0.45)';
    c.stroke(path);
    c.restore();
    c.lineWidth = 0.8;
    c.strokeStyle = 'rgba(20,6,3,0.5)';
    c.stroke(path);

    const sw = e.pw + this.shadowPad * 2;
    const sh = e.ph + this.shadowPad * 2;
    const shadow = document.createElement('canvas');
    shadow.width = Math.ceil(sw * res * 0.5);
    shadow.height = Math.ceil(sh * res * 0.5);
    const sc = shadow.getContext('2d')!;
    const sr = res * 0.5;
    const far = 4000;
    sc.setTransform(sr, 0, 0, sr, this.shadowPad * sr - far, this.shadowPad * sr);
    sc.shadowColor = 'rgba(10,2,0,0.6)';
    sc.shadowBlur = Math.min(e.pw, e.ph) * 0.06 * sr;
    sc.shadowOffsetX = far;
    sc.fillStyle = '#000';
    sc.fill(path);
    return { img, shadow, path };
  }

  private startIntro() {
    // The finished painting holds for a beat, then breaks apart onto the table.
    this.intro = 0.0001;
  }

  private launchScatter() {
    let i = 0;
    const reduce = store.settings.reduceMotion;
    for (const [g, t] of this.introTargets) {
      if (t.rot !== g.rot) {
        g.rot = t.rot;
        if (!reduce) this.spins.set(g, { pivot: t.pos, from: -QUARTER * t.rot, t: 0 });
      }
      if (reduce) g.pos = t.pos;
      else this.tweens.set(g, { from: { ...g.pos }, to: t.pos, t: 0, dur: 0.75, delay: (i++ % 40) * 0.012 });
    }
    sfx.rotate();
  }

  /* ---------------------------------------------------------------- */
  /* Public actions                                                    */
  /* ---------------------------------------------------------------- */

  setEdgeOnly(on: boolean) {
    this.edgeOnly = on;
    this.dirty = true;
  }

  setGhost(on: boolean) {
    this.ghost = on;
    this.dirty = true;
  }

  rescatter() {
    const targets = this.engine.scatter(makeRng(Math.floor(Math.random() * 1e9)), this.viewAspect, false);
    for (const [g, t] of targets) this.tweens.set(g, { from: { ...g.pos }, to: t.pos, t: 0, dur: 0.55, delay: 0 });
    this.fit();
    sfx.rotate();
  }

  hint() {
    const e = this.engine;
    const loose = e.pieces.filter((p) => !p.group.locked);
    if (!loose.length) return;
    const touchesLocked = (p: Piece) =>
      [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => e.pieceAt(p.row + dr, p.col + dc)?.group.locked);
    const pick =
      loose.find((p) => touchesLocked(p) && p.group.pieces.length === 1) ??
      loose.find((p) => p.edge) ??
      loose[Math.floor(Math.random() * loose.length)];
    this.hintMark = { piece: pick, t: 0 };
    this.hints++;
    sfx.hint();
    this.dirty = true;
  }

  get stats() {
    return { ms: this.elapsed * 1000, hints: this.hints, locked: this.engine.lockedCount, total: this.engine.pieces.length };
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  private hitPiece = (p: Piece, local: Vec) => {
    const e = this.engine;
    if (local.x < -this.pad || local.y < -this.pad || local.x > e.pw + this.pad || local.y > e.ph + this.pad) return false;
    return this.hitCtx.isPointInPath(this.sprites[p.id].path, local.x, local.y);
  };

  private grabFilter = (g: Group) => !this.edgeOnly || g.pieces.some((p) => p.edge);

  private pieceUnder(screen: Vec): Piece | null {
    const world = this.cam.toWorld(screen);
    // Fingers are less precise than the Pencil: fall back to a slightly larger target.
    return this.engine.hitTest(world, this.hitPiece, this.grabFilter);
  }

  down(p: PointerSample) {
    if (this.done || this.intro > 0) return 'pan' as const;
    const piece = this.pieceUnder(p.pos);
    if (!piece) return 'pan' as const;
    const g = piece.group;
    this.tweens.delete(g);
    this.engine.bringToFront(g);
    const world = this.cam.toWorld(p.pos);
    this.drag = { group: g, offset: sub(world, g.pos), pointer: p.id, kind: p.kind, pressure: p.pressure, twistApplied: 0 };
    this.started = true;
    this.hoverState = null;
    sfx.pick();
    this.dirty = true;
    return 'grab' as const;
  }

  move(p: PointerSample) {
    if (!this.drag || p.id !== this.drag.pointer) return;
    const world = this.cam.toWorld(p.pos);
    this.drag.group.pos = sub(world, this.drag.offset);
    this.drag.pressure = p.pressure;
    this.dirty = true;
  }

  up(p: PointerSample, cancelled: boolean) {
    if (!this.drag || p.id !== this.drag.pointer) return;
    const g = this.drag.group;
    this.drag = null;
    if (!cancelled) this.dropGroup(g);
    this.dirty = true;
  }

  tap(p: PointerSample) {
    if (this.done || this.intro > 0 || !this.level.rotation) return;
    const piece = this.pieceUnder(p.pos);
    if (!piece) return;
    this.rotate(piece.group, this.cam.toWorld(p.pos), 1);
  }

  private rotate(g: Group, pivot: Vec, turns: number) {
    this.engine.rotateGroup(g, pivot, turns);
    if (!store.settings.reduceMotion) {
      const prev = this.spins.get(g);
      const carry = prev ? prev.from * (1 - easeOutCubic(Math.min(1, prev.t / 0.22))) : 0;
      this.spins.set(g, { pivot, from: -turns * QUARTER + carry, t: 0 });
    }
    sfx.rotate();
    this.dropGroup(g);
    this.dirty = true;
  }

  hover(p: PointerSample | null) {
    if (!p) {
      if (this.hoverState) this.dirty = true;
      this.hoverState = null;
      return;
    }
    const piece = this.drag ? null : this.pieceUnder(p.pos);
    this.hoverState = { piece, pos: p.pos };
    this.dirty = true;
  }

  pan(d: Vec) {
    this.cam.translate(d);
    this.dirty = true;
  }

  gestureStart(holding: boolean) {
    if (holding && this.drag) {
      this.drag.twistApplied = 0;
      return;
    }
    this.gestureCam = { zoom: this.cam.zoom, pan: { ...this.cam.pan } };
  }

  gesture(g: TwistGesture, holding: boolean) {
    if (holding && this.drag) {
      if (!this.level.rotation) return;
      const steps = Math.round(g.rotation / (QUARTER * 0.7));
      if (steps !== this.drag.twistApplied) {
        const turns = steps - this.drag.twistApplied;
        this.drag.twistApplied = steps;
        const grp = this.drag.group;
        const pivot = add(grp.pos, this.drag.offset);
        this.engine.rotateGroup(grp, pivot, turns);
        this.drag.offset = sub(pivot, grp.pos);
        this.spins.set(grp, { pivot, from: -turns * QUARTER, t: 0 });
        sfx.rotate();
      }
      return;
    }
    if (!this.gestureCam) return;
    const start = this.gestureCam;
    const c0 = sub(g.center, g.translate);
    const worldAtC0 = { x: (c0.x - start.pan.x) / start.zoom, y: (c0.y - start.pan.y) / start.zoom };
    this.cam.zoom = clamp(start.zoom * g.scale, this.cam.minZoom, this.cam.maxZoom);
    this.cam.pan = { x: g.center.x - worldAtC0.x * this.cam.zoom, y: g.center.y - worldAtC0.y * this.cam.zoom };
    this.dirty = true;
  }

  gestureEnd() {
    this.gestureCam = null;
  }

  /* ---------------------------------------------------------------- */
  /* Snapping & effects                                                */
  /* ---------------------------------------------------------------- */

  private dropGroup(g: Group) {
    const moved = [...g.pieces];
    const before = new Map(moved.map((p) => [p.id, this.engine.center(p)]));
    const r = this.engine.drop(g);
    if (r.kind === 'none') {
      sfx.drop();
      return;
    }
    if (!store.settings.reduceMotion) {
      for (const p of moved) {
        const now = this.engine.center(p);
        const b = before.get(p.id)!;
        this.settle.set(p.id, { from: sub(b, now), t: 0 });
      }
    }
    const c = moved.reduce((acc, p) => add(acc, this.engine.center(p)), { x: 0, y: 0 });
    const center = { x: c.x / moved.length, y: c.y / moved.length };
    if (r.kind === 'lock') {
      this.boardDirty = true;
      this.shimmers.push({ pieces: moved, t: 0 });
      const s = Math.min(this.engine.pw, this.engine.ph);
      this.particles.burst(center.x, center.y, 14 + Math.min(30, moved.length * 3), s * 0.09, s * 3.2);
      sfx.snap(Math.floor((this.engine.lockedCount / this.engine.pieces.length) * 9));
      if (this.hintMark && moved.includes(this.hintMark.piece)) this.hintMark = null;
      this.cb.progress(this.engine.lockedCount, this.engine.pieces.length);
      if (this.engine.complete) this.beginFinale();
    } else {
      this.shimmers.push({ pieces: moved, t: 0 });
      sfx.join();
      // A full picture assembled off the board glides home on its own.
      const loose = this.engine.looseGroups;
      if (loose.length === 1 && loose[0].pieces.length === this.engine.pieces.length) {
        const all = loose[0];
        if (all.rot !== 0) this.rotate(all, all.pos, 4 - all.rot);
        this.tweens.set(all, { from: { ...all.pos }, to: { ...all.ref }, t: 0, dur: 0.6, delay: 0.15 });
      }
    }
  }

  private beginFinale() {
    this.done = true;
    this.finale = 0;
    // Glide the camera in so the finished painting fills the screen.
    const target = new Camera();
    target.fit({ x: -30, y: -30, w: BOARD_W + 60, h: BOARD_H + 60 }, { w: this.cssW, h: this.cssH }, this.insets);
    this.camGlide = { fromZoom: this.cam.zoom, fromPan: { ...this.cam.pan }, toZoom: target.zoom, toPan: target.pan };
    this.hintMark = null;
    sfx.complete();
    if (!store.settings.reduceMotion) this.particles.rain(-100, -200, BOARD_W + 200, 140, 14);
    setTimeout(() => this.cb.complete({ ms: this.elapsed * 1000, hints: this.hints }), 1900);
  }

  /* ---------------------------------------------------------------- */
  /* Loop                                                              */
  /* ---------------------------------------------------------------- */

  private loop(now: number) {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0.016;
    this.last = now;
    const animating = this.update(dt);
    if (animating || this.dirty) {
      this.draw();
      this.dirty = false;
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  private update(dt: number): boolean {
    let busy = false;
    if (this.started && !this.done && document.visibilityState === 'visible') this.elapsed += dt;

    if (this.intro > 0) {
      this.intro += dt;
      busy = true;
      if (this.intro > 0.9) {
        this.intro = 0;
        this.launchScatter();
      }
    }

    for (const [g, tw] of this.tweens) {
      busy = true;
      if (tw.delay > 0) {
        tw.delay -= dt;
        continue;
      }
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      const e = easeOutCubic(k);
      g.pos = { x: lerp(tw.from.x, tw.to.x, e), y: lerp(tw.from.y, tw.to.y, e) };
      if (k >= 1) {
        this.tweens.delete(g);
        // A glide home ends with a drop so the picture locks.
        if (g.pieces.length === this.engine.pieces.length && !g.locked) this.dropGroup(g);
      }
    }
    for (const [g, s] of this.spins) {
      busy = true;
      s.t += dt;
      if (s.t >= 0.22) this.spins.delete(g);
    }
    for (const [id, s] of this.settle) {
      busy = true;
      s.t += dt;
      if (s.t >= 0.18) this.settle.delete(id);
    }
    this.shimmers = this.shimmers.filter((s) => (s.t += dt) < 0.9);
    if (this.shimmers.length) busy = true;
    if (this.hintMark) {
      this.hintMark.t += dt;
      busy = true;
      if (this.hintMark.t > 3.2) this.hintMark = null;
    }
    if (this.particles.active) {
      this.particles.update(dt);
      busy = true;
    }
    if (this.finale >= 0 && this.finale < 2) {
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
    const liftTarget = this.drag ? (this.drag.kind === 'pen' ? 0.35 + this.drag.pressure * 0.9 : 0.8) : 0;
    if (Math.abs(this.lift - liftTarget) > 0.01) {
      this.lift += (liftTarget - this.lift) * Math.min(1, dt * 14);
      busy = true;
    }
    return busy;
  }

  private redrawBoardLayer() {
    const c = this.boardLayer.getContext('2d')!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.boardLayer.width, this.boardLayer.height);
    c.setTransform(this.res, 0, 0, this.res, 0, 0);
    const e = this.engine;
    for (const p of e.pieces) {
      if (!p.group.locked || this.settle.has(p.id)) continue;
      const sp = this.sprites[p.id];
      c.drawImage(sp.img, p.col * e.pw - this.pad, p.row * e.ph - this.pad, sp.img.width / this.res, sp.img.height / this.res);
    }
    this.boardDirty = false;
  }

  private draw() {
    const ctx = this.ctx;
    const e = this.engine;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.cam.apply(ctx, this.dpr);

    this.drawBoard(ctx);

    if (this.boardDirty || this.settle.size) this.redrawBoardLayer();
    if (this.settle.size) this.boardDirty = true;
    ctx.drawImage(this.boardLayer, 0, 0, BOARD_W, BOARD_H);

    // Locked pieces still settling are drawn on top of the cached layer.
    for (const p of e.pieces) if (p.group.locked && this.settle.has(p.id)) this.drawPiece(ctx, p, false);

    if (this.intro > 0) {
      ctx.drawImage(this.image, 0, 0, BOARD_W, BOARD_H);
    }

    if (this.hintMark) this.drawHintTarget(ctx, this.hintMark.piece, this.hintMark.t);

    for (const g of e.groups) {
      if (g.locked || this.intro > 0) continue;
      const dim = this.edgeOnly && !g.pieces.some((p) => p.edge);
      const isDrag = this.drag?.group === g;
      ctx.save();
      if (dim) ctx.globalAlpha = 0.16;
      this.applySpin(ctx, g);
      if (isDrag) {
        const pivot = add(g.pos, this.drag!.offset);
        const s = 1 + this.lift * 0.045;
        ctx.translate(pivot.x, pivot.y);
        ctx.scale(s, s);
        ctx.translate(-pivot.x, -pivot.y);
      }
      const lift = isDrag ? this.lift : 0;
      for (const p of g.pieces) this.drawShadow(ctx, p, lift);
      for (const p of g.pieces) this.drawPiece(ctx, p, true);
      if (this.hoverState?.piece && this.hoverState.piece.group === g) {
        for (const p of g.pieces) this.strokePiece(ctx, p, 'rgba(156,195,188,0.95)', 2.2 / this.cam.zoom);
      }
      ctx.restore();
    }

    for (const s of this.shimmers) this.drawShimmer(ctx, s.pieces, s.t);
    if (this.hintMark) this.drawHintPiece(ctx, this.hintMark.piece, this.hintMark.t);

    if (this.finale >= 0) {
      const k = clamp((this.finale - 0.3) / 1.1, 0, 1);
      ctx.save();
      ctx.globalAlpha = easeOutCubic(k);
      ctx.drawImage(this.image, 0, 0, BOARD_W, BOARD_H);
      ctx.restore();
      const glowK = Math.sin(clamp(this.finale / 1.6, 0, 1) * Math.PI);
      ctx.save();
      ctx.strokeStyle = `rgba(243,220,152,${glowK})`;
      ctx.lineWidth = 6 / this.cam.zoom + glowK * 6;
      ctx.strokeRect(-2, -2, BOARD_W + 4, BOARD_H + 4);
      ctx.restore();
    }

    this.particles.draw(ctx);

    // Pencil hover reticle in screen space.
    if (this.hoverState && !this.drag) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.beginPath();
      ctx.arc(this.hoverState.pos.x, this.hoverState.pos.y, this.hoverState.piece ? 9 : 5, 0, Math.PI * 2);
      ctx.strokeStyle = this.hoverState.piece ? 'rgba(156,195,188,0.95)' : 'rgba(239,230,210,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  private drawBoard(ctx: CanvasRenderingContext2D) {
    const frame = 14;
    // Lacquer tray with a soft drop shadow.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 40 * this.cam.zoom * this.dpr;
    ctx.shadowOffsetY = 12 * this.cam.zoom * this.dpr;
    ctx.fillStyle = '#1c0907';
    ctx.fillRect(-frame, -frame, BOARD_W + frame * 2, BOARD_H + frame * 2);
    ctx.restore();
    const g = ctx.createLinearGradient(-frame, -frame, BOARD_W + frame, BOARD_H + frame);
    g.addColorStop(0, '#f0d58a');
    g.addColorStop(0.5, '#a87a2c');
    g.addColorStop(1, '#e2bb63');
    ctx.strokeStyle = g;
    ctx.lineWidth = 3;
    ctx.strokeRect(-frame / 2, -frame / 2, BOARD_W + frame, BOARD_H + frame);
    ctx.fillStyle = '#140605';
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    if (this.ghost) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.drawImage(this.image, 0, 0, BOARD_W, BOARD_H);
      ctx.restore();
    }
  }

  private applySpin(ctx: CanvasRenderingContext2D, g: Group) {
    const s = this.spins.get(g);
    if (!s) return;
    const k = easeOutBack(Math.min(1, s.t / 0.22));
    const a = s.from * (1 - k);
    ctx.translate(s.pivot.x, s.pivot.y);
    ctx.rotate(a);
    ctx.translate(-s.pivot.x, -s.pivot.y);
  }

  private pieceTransform(ctx: CanvasRenderingContext2D, p: Piece) {
    let c = this.engine.center(p);
    const st = this.settle.get(p.id);
    if (st) {
      const k = 1 - easeOutBack(Math.min(1, st.t / 0.18));
      c = add(c, { x: st.from.x * k, y: st.from.y * k });
    }
    ctx.translate(c.x, c.y);
    ctx.rotate(p.group.rot * QUARTER);
    ctx.translate(-this.engine.pw / 2, -this.engine.ph / 2);
  }

  private drawPiece(ctx: CanvasRenderingContext2D, p: Piece, _loose: boolean) {
    const sp = this.sprites[p.id];
    ctx.save();
    this.pieceTransform(ctx, p);
    ctx.drawImage(sp.img, -this.pad, -this.pad, sp.img.width / this.res, sp.img.height / this.res);
    ctx.restore();
  }

  private drawShadow(ctx: CanvasRenderingContext2D, p: Piece, lift: number) {
    const sp = this.sprites[p.id];
    const s = Math.min(this.engine.pw, this.engine.ph);
    const off = s * (0.02 + lift * 0.09);
    ctx.save();
    ctx.translate(off * 0.6, off);
    this.pieceTransform(ctx, p);
    ctx.globalAlpha *= 0.55 + lift * 0.25;
    ctx.drawImage(sp.shadow, -this.shadowPad, -this.shadowPad, sp.shadow.width / (this.res * 0.5), sp.shadow.height / (this.res * 0.5));
    ctx.restore();
  }

  private strokePiece(ctx: CanvasRenderingContext2D, p: Piece, color: string, width: number) {
    ctx.save();
    this.pieceTransform(ctx, p);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke(this.sprites[p.id].path);
    ctx.restore();
  }

  private drawShimmer(ctx: CanvasRenderingContext2D, pieces: Piece[], t: number) {
    const k = t / 0.9;
    const s = Math.min(this.engine.pw, this.engine.ph);
    for (const p of pieces) {
      ctx.save();
      this.pieceTransform(ctx, p);
      ctx.setLineDash([s * 0.5, s * 2.5]);
      ctx.lineDashOffset = -k * s * 6;
      ctx.strokeStyle = `rgba(255,236,170,${1 - k})`;
      ctx.lineWidth = Math.max(2 / this.cam.zoom, s * 0.035);
      ctx.lineCap = 'round';
      ctx.stroke(this.sprites[p.id].path);
      ctx.restore();
    }
  }

  private drawHintTarget(ctx: CanvasRenderingContext2D, p: Piece, t: number) {
    const e = this.engine;
    const a = Math.min(1, t * 3) * Math.min(1, (3.2 - t) * 2);
    ctx.save();
    ctx.translate(p.col * e.pw, p.row * e.ph);
    ctx.fillStyle = `rgba(243,220,152,${0.18 * a})`;
    ctx.fill(this.sprites[p.id].path);
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -t * 30;
    ctx.strokeStyle = `rgba(243,220,152,${0.9 * a})`;
    ctx.lineWidth = 2.5 / this.cam.zoom;
    ctx.stroke(this.sprites[p.id].path);
    ctx.restore();
  }

  private drawHintPiece(ctx: CanvasRenderingContext2D, p: Piece, t: number) {
    const c = this.engine.center(p);
    const s = Math.max(this.engine.pw, this.engine.ph);
    const a = Math.min(1, (3.2 - t) * 2);
    for (let i = 0; i < 2; i++) {
      const ph = ((t * 1.2 + i * 0.5) % 1);
      ctx.beginPath();
      ctx.arc(c.x, c.y, s * (0.55 + ph * 0.6), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(243,220,152,${(1 - ph) * 0.8 * a})`;
      ctx.lineWidth = 3 / this.cam.zoom;
      ctx.stroke();
    }
  }
}
