export type View = { el: HTMLElement; destroy?: () => void };
export type Route = (router: Router, params: string[]) => View | HTMLElement;

/** Minimal hash router; each route builds a fresh screen. */
export class Router {
  private current: View | null = null;

  constructor(
    private root: HTMLElement,
    private routes: [RegExp, Route][],
  ) {
    window.addEventListener('hashchange', () => this.render());
  }

  get path() {
    return location.hash.replace(/^#/, '') || '/';
  }

  go(path: string) {
    if (path === this.path) this.render();
    else location.hash = path;
  }

  render() {
    const path = this.path;
    for (const [re, route] of this.routes) {
      const m = path.match(re);
      if (!m) continue;
      this.current?.destroy?.();
      this.root.replaceChildren();
      const out = route(this, m.slice(1));
      this.current = out instanceof HTMLElement ? { el: out } : out;
      this.root.append(this.current.el);
      return;
    }
    this.go('/');
  }
}
