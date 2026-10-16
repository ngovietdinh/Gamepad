import { Vec, clamp } from './geom';

/** screen = world * zoom + pan (CSS pixels). */
export class Camera {
  zoom = 1;
  pan: Vec = { x: 0, y: 0 };
  minZoom = 0.3;
  maxZoom = 4;
  private fitZoom = 1;

  toWorld(p: Vec): Vec {
    return { x: (p.x - this.pan.x) / this.zoom, y: (p.y - this.pan.y) / this.zoom };
  }

  toScreen(p: Vec): Vec {
    return { x: p.x * this.zoom + this.pan.x, y: p.y * this.zoom + this.pan.y };
  }

  /** Fit the world rectangle into the viewport, leaving `inset` CSS px on each side. */
  fit(world: { x: number; y: number; w: number; h: number }, view: { w: number; h: number }, inset: { top: number; right: number; bottom: number; left: number }) {
    const aw = Math.max(50, view.w - inset.left - inset.right);
    const ah = Math.max(50, view.h - inset.top - inset.bottom);
    this.zoom = Math.min(aw / world.w, ah / world.h);
    this.fitZoom = this.zoom;
    this.minZoom = this.zoom * 0.8;
    this.maxZoom = this.zoom * 4;
    this.pan = {
      x: inset.left + (aw - world.w * this.zoom) / 2 - world.x * this.zoom,
      y: inset.top + (ah - world.h * this.zoom) / 2 - world.y * this.zoom,
    };
  }

  get relativeZoom() {
    return this.zoom / this.fitZoom;
  }

  zoomAt(screen: Vec, factor: number) {
    const before = this.toWorld(screen);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    this.pan = { x: screen.x - before.x * this.zoom, y: screen.y - before.y * this.zoom };
  }

  translate(d: Vec) {
    this.pan = { x: this.pan.x + d.x, y: this.pan.y + d.y };
  }

  apply(ctx: CanvasRenderingContext2D, dpr: number) {
    ctx.setTransform(this.zoom * dpr, 0, 0, this.zoom * dpr, this.pan.x * dpr, this.pan.y * dpr);
  }
}
