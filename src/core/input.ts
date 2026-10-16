import { Vec, dist } from './geom';

export type PointerKind = 'pen' | 'touch' | 'mouse';

export interface PointerSample {
  id: number;
  kind: PointerKind;
  /** Position in CSS pixels relative to the canvas. */
  pos: Vec;
  /** 0..1, pens report real pressure; touch and mouse report 0.5 while down. */
  pressure: number;
  /** Pencil tilt from vertical in radians (0 when unknown). */
  tilt: number;
  time: number;
}

export interface TwistGesture {
  center: Vec;
  /** Change since the gesture started. */
  scale: number;
  rotation: number;
  translate: Vec;
}

/** What the scene wants to do with a pointer that went down. */
export type DownResult = 'grab' | 'pan' | 'ignore';

export interface InputHandler {
  down(p: PointerSample): DownResult;
  move(p: PointerSample): void;
  up(p: PointerSample, cancelled: boolean): void;
  tap(p: PointerSample): void;
  /** Pencil hovering above the screen (iPad Pro M2 and later), or null when it leaves. */
  hover(p: PointerSample | null): void;
  pan(delta: Vec): void;
  /** Two fingers. `holding` is true when one of them is already dragging a piece. */
  gestureStart(holding: boolean): void;
  gesture(g: TwistGesture, holding: boolean): void;
  gestureEnd(holding: boolean): void;
}

interface Tracked {
  sample: PointerSample;
  start: PointerSample;
  mode: DownResult;
  moved: boolean;
}

const TAP_MS = 280;
const PALM_SIZE = 44; // CSS px contact size above which a touch is treated as a palm
const PEN_GRACE_MS = 650; // after the pencil was seen, single touches are treated as palm

/**
 * Unifies Apple Pencil, finger and mouse input. Rules:
 * - While the Pencil is down, every touch is ignored (palm rejection).
 * - Shortly after the Pencil was seen (hover or touch), new single touches are ignored too.
 * - Two fingers form a gesture: zoom/pan the table, or twist the held piece.
 */
export class InputManager {
  private tracked = new Map<number, Tracked>();
  private lastPenSeen = -Infinity;
  private gestureIds: [number, number] | null = null;
  private gestureStart0: { a: Vec; b: Vec } | null = null;
  private gestureHolding = false;
  private detach: () => void;

  constructor(
    private el: HTMLElement,
    private handler: InputHandler,
  ) {
    const opts = { passive: false } as AddEventListenerOptions;
    const down = (e: PointerEvent) => this.onDown(e);
    const move = (e: PointerEvent) => this.onMove(e);
    const up = (e: PointerEvent) => this.onUp(e, false);
    const cancel = (e: PointerEvent) => this.onUp(e, true);
    const leave = (e: PointerEvent) => {
      if (e.pointerType === 'pen' && !this.tracked.has(e.pointerId)) this.handler.hover(null);
    };
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', down, opts);
    el.addEventListener('pointermove', move, opts);
    el.addEventListener('pointerup', up, opts);
    el.addEventListener('pointercancel', cancel, opts);
    el.addEventListener('pointerleave', leave, opts);
    el.addEventListener('contextmenu', stop);
    // Safari still fires legacy gesture events for pinch; stop page zoom.
    el.addEventListener('gesturestart', stop as EventListener);
    el.addEventListener('touchstart', stop, opts);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const center = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.ctrlKey || !e.shiftKey) {
        const s = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        this.handler.gestureStart(false);
        this.handler.gesture({ center, scale: s, rotation: 0, translate: { x: 0, y: 0 } }, false);
        this.handler.gestureEnd(false);
      } else {
        this.handler.pan({ x: -e.deltaX, y: -e.deltaY });
      }
    };
    el.addEventListener('wheel', wheel, opts);
    this.detach = () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('contextmenu', stop);
      el.removeEventListener('gesturestart', stop as EventListener);
      el.removeEventListener('touchstart', stop);
      el.removeEventListener('wheel', wheel);
    };
  }

  destroy() {
    this.detach();
  }

  private sample(e: PointerEvent): PointerSample {
    const r = this.el.getBoundingClientRect();
    const kind: PointerKind =
      e.pointerType === 'pen' ? 'pen' : e.pointerType === 'touch' ? 'touch' : 'mouse';
    let pressure = e.pressure;
    if (kind !== 'pen' || pressure === 0) pressure = e.buttons ? 0.5 : 0;
    const tilt =
      kind === 'pen' && (e.tiltX || e.tiltY)
        ? Math.min(Math.PI / 2, Math.hypot(e.tiltX, e.tiltY) * (Math.PI / 180))
        : 0;
    return {
      id: e.pointerId,
      kind,
      pos: { x: e.clientX - r.left, y: e.clientY - r.top },
      pressure,
      tilt,
      time: e.timeStamp,
    };
  }

  private penDown() {
    for (const t of this.tracked.values()) if (t.sample.kind === 'pen') return true;
    return false;
  }

  private touches() {
    return [...this.tracked.values()].filter((t) => t.sample.kind === 'touch');
  }

  private onDown(e: PointerEvent) {
    e.preventDefault();
    const s = this.sample(e);

    if (s.kind === 'pen') {
      this.lastPenSeen = s.time;
      // The pencil wins: drop whatever the palm was doing.
      for (const [id, t] of this.tracked) {
        if (t.sample.kind === 'touch') {
          this.tracked.delete(id);
          if (t.mode === 'grab') this.handler.up(t.sample, true);
        }
      }
      this.endGesture();
      this.handler.hover(null);
    } else if (s.kind === 'touch') {
      if (this.penDown()) return;
      const big = Math.max(e.width || 0, e.height || 0) > PALM_SIZE;
      const recentPen = s.time - this.lastPenSeen < PEN_GRACE_MS;
      if (big || (recentPen && this.touches().length === 0)) return;

      const others = this.touches();
      if (others.length >= 1) {
        // Second finger: start a two-finger gesture.
        const first = others[0];
        this.tracked.set(s.id, { sample: s, start: s, mode: 'pan', moved: false });
        this.beginGesture(first, this.tracked.get(s.id)!);
        try {
          this.el.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        return;
      }
    }

    const mode = this.handler.down(s);
    if (mode === 'ignore') return;
    this.tracked.set(s.id, { sample: s, start: s, mode, moved: false });
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  private onMove(e: PointerEvent) {
    const s = this.sample(e);
    if (s.kind === 'pen') this.lastPenSeen = s.time;
    const t = this.tracked.get(s.id);
    if (!t) {
      if (s.kind === 'pen' && e.buttons === 0) this.handler.hover(s);
      return;
    }
    e.preventDefault();
    const prev = t.sample;
    t.sample = s;
    const threshold = s.kind === 'pen' ? 3 : 8;
    if (!t.moved && dist(s.pos, t.start.pos) > threshold) t.moved = true;

    if (this.gestureIds && this.gestureIds.includes(s.id)) {
      this.updateGesture();
      return;
    }
    if (t.mode === 'grab') this.handler.move(s);
    else if (t.mode === 'pan' && t.moved) {
      this.handler.pan({ x: s.pos.x - prev.pos.x, y: s.pos.y - prev.pos.y });
    }
  }

  private onUp(e: PointerEvent, cancelled: boolean) {
    const t = this.tracked.get(e.pointerId);
    if (!t) return;
    e.preventDefault();
    const s = this.sample(e);
    s.pressure = 0;
    this.tracked.delete(e.pointerId);

    if (this.gestureIds && this.gestureIds.includes(e.pointerId)) {
      const holding = this.gestureHolding;
      this.endGesture();
      // If the finger that was holding a piece lifted, release it too.
      if (holding && t.mode === 'grab') this.handler.up(s, cancelled);
      // The remaining finger continues as a plain pan (never re-grabs).
      for (const other of this.tracked.values()) if (other.mode === 'grab' && !holding) other.mode = 'pan';
      return;
    }

    if (t.mode === 'grab') this.handler.up(s, cancelled);
    if (!cancelled && !t.moved && s.time - t.start.time < TAP_MS) this.handler.tap(s);
  }

  private beginGesture(a: Tracked, b: Tracked) {
    this.gestureIds = [a.sample.id, b.sample.id];
    this.gestureStart0 = { a: a.sample.pos, b: b.sample.pos };
    this.gestureHolding = a.mode === 'grab';
    this.handler.gestureStart(this.gestureHolding);
  }

  private updateGesture() {
    if (!this.gestureIds || !this.gestureStart0) return;
    const a = this.tracked.get(this.gestureIds[0]);
    const b = this.tracked.get(this.gestureIds[1]);
    if (!a || !b) return;
    const s0 = this.gestureStart0;
    const d0 = dist(s0.a, s0.b) || 1;
    const d1 = dist(a.sample.pos, b.sample.pos) || 1;
    const ang0 = Math.atan2(s0.b.y - s0.a.y, s0.b.x - s0.a.x);
    const ang1 = Math.atan2(b.sample.pos.y - a.sample.pos.y, b.sample.pos.x - a.sample.pos.x);
    const c0 = { x: (s0.a.x + s0.b.x) / 2, y: (s0.a.y + s0.b.y) / 2 };
    const c1 = { x: (a.sample.pos.x + b.sample.pos.x) / 2, y: (a.sample.pos.y + b.sample.pos.y) / 2 };
    this.handler.gesture(
      { center: c1, scale: d1 / d0, rotation: ang1 - ang0, translate: { x: c1.x - c0.x, y: c1.y - c0.y } },
      this.gestureHolding,
    );
  }

  private endGesture() {
    if (!this.gestureIds) return;
    const holding = this.gestureHolding;
    this.gestureIds = null;
    this.gestureStart0 = null;
    this.gestureHolding = false;
    this.handler.gestureEnd(holding);
  }
}
