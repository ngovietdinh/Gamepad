import { PAINTINGS, renderPainting } from '../art/paintings';
import { store } from '../core/store';
import { sfx, unlockAudio } from '../fx/audio';
import { JigsawScene } from '../jigsaw/scene';
import { PUZZLES, TIERS } from '../tangram/puzzles';
import { TangramScene } from '../tangram/scene';
import { confirmLeave, openResult } from './dialogs';
import { formatTime, h } from './dom';
import { IconName, icons } from './icons';
import {
  JIGSAW_LEVELS,
  TANGRAM_PAR,
  jigsawId,
  jigsawPar,
  jigsawSeed,
  jigsawUnlocked,
  starsFor,
  tangramId,
  tangramTierUnlocked,
} from './levels';
import { Router, View } from './router';

function tool(icon: IconName, label: string, onClick: (btn: HTMLButtonElement) => void, pressed?: boolean) {
  const b = h('button', {
    class: 'tool',
    'aria-label': label,
    title: label,
    'aria-pressed': pressed === undefined ? undefined : String(pressed),
  });
  b.innerHTML = icons[icon];
  b.append(h('span', { class: 'lbl' }, label));
  b.addEventListener('click', () => {
    sfx.ui();
    onClick(b);
  });
  return b;
}

function tip(text: string) {
  const el = h('div', { class: 'pen-tip', role: 'status' }, text);
  const hide = () => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 600);
  };
  setTimeout(hide, 5200);
  return { el, hide };
}

function shell(router: Router, title: string, sub: HTMLElement, tools: HTMLElement[], isDirty: () => boolean, back: string) {
  const progress = h('span');
  const host = h('div', { class: 'game' });
  const leave = () => router.go(back);
  const backBtn = h('button', {
    class: 'icon-btn',
    'aria-label': 'Quay lại',
    html: icons.back,
    onclick: () => (isDirty() ? confirmLeave(leave) : leave()),
  });
  const hud = h(
    'header',
    { class: 'hud' },
    backBtn,
    h('div', { class: 'heading' }, h('div', { class: 'name' }, title), sub),
    h('div', { class: 'tools' }, ...tools),
    h('div', { class: 'progress' }, progress),
  );
  const el = h('div', { class: 'game' }, host, hud);
  // Audio must be unlocked by a gesture on iOS.
  el.addEventListener('pointerdown', unlockAudio, { once: true });
  return { el, host, progress };
}

/* ------------------------------------------------------------------ */
/* Jigsaw                                                              */
/* ------------------------------------------------------------------ */

export function jigsawPlay(router: Router, params: string[]): View | HTMLElement {
  const painting = PAINTINGS.find((p) => p.id === params[0]);
  const def = JIGSAW_LEVELS[Number(params[1])];
  if (!painting || !def || !jigsawUnlocked(painting, def.index)) {
    router.go('/jigsaw');
    return h('div');
  }
  const total = def.cols * def.rows;
  const timeEl = h('b', {}, '00:00');
  const countEl = h('b', {}, `0/${total}`);
  const sub = h('div', { class: 'sub' }, h('span', {}, timeEl), h('span', {}, countEl, ' mảnh'), def.rotation ? h('span', {}, 'Chạm để xoay') : null);

  let scene: JigsawScene | null = null;
  let finished = false;
  const tools = [
    tool('hint', 'Gợi ý', () => scene?.hint()),
    tool('edges', 'Mảnh viền', (b) => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      scene?.setEdgeOnly(on);
    }, false),
    tool('ghost', 'Ảnh mờ', (b) => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      store.set('ghost', on);
      scene?.setGhost(on);
    }, store.settings.ghost),
    tool('scatter', 'Dồn mảnh', () => scene?.rescatter()),
    tool('fit', 'Vừa khung', () => scene?.fit()),
  ];

  const ui = shell(router, painting.title, sub, tools, () => !!scene && scene.stats.locked > 0 && !finished, '/jigsaw');
  const t = tip(def.rotation ? 'Chạm vào mảnh để xoay 90°, hoặc vặn hai ngón tay khi đang giữ mảnh' : 'Kéo mảnh bằng Apple Pencil hoặc ngón tay. Hai ngón để phóng to.');
  ui.el.append(t.el);
  ui.el.addEventListener('pointerdown', () => t.hide(), { once: true });

  const timer = setInterval(() => {
    if (scene) timeEl.textContent = formatTime(scene.stats.ms);
  }, 250);

  requestAnimationFrame(() => {
    scene = new JigsawScene(
      ui.host,
      { painting, cols: def.cols, rows: def.rows, rotation: def.rotation, seed: jigsawSeed(painting, def.index) },
      {
        progress(locked, n) {
          countEl.textContent = `${locked}/${n}`;
          ui.progress.style.width = `${(locked / n) * 100}%`;
        },
        complete({ ms, hints }) {
          finished = true;
          const id = jigsawId(painting, def.index);
          const stars = starsFor(ms, hints, jigsawPar(def));
          const newBest = store.complete(id, stars, ms);
          const art = renderPainting(painting, 936);
          const copy = h('canvas');
          copy.width = art.width;
          copy.height = art.height;
          copy.getContext('2d')!.drawImage(art, 0, 0);
          const nextDef = JIGSAW_LEVELS[def.index + 1];
          const nextPainting = PAINTINGS[PAINTINGS.indexOf(painting) + 1];
          openResult({
            title: painting.title,
            subtitle: `Hoàn thành ${total} mảnh${def.rotation ? ' có xoay' : ''}`,
            art: copy,
            stars,
            ms,
            hints,
            bestMs: store.record(id)!.bestMs,
            newBest,
            next: nextDef
              ? () => router.go(`/play/jigsaw/${painting.id}/${nextDef.index}`)
              : nextPainting
                ? () => router.go(`/play/jigsaw/${nextPainting.id}/0`)
                : undefined,
            replay: () => router.go(`/play/jigsaw/${painting.id}/${def.index}`),
            menu: () => router.go('/jigsaw'),
          });
        },
      },
    );
    if (import.meta.env.DEV) (window as unknown as { __scene: unknown }).__scene = scene;
  });

  return {
    el: ui.el,
    destroy() {
      clearInterval(timer);
      scene?.destroy();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Tangram                                                             */
/* ------------------------------------------------------------------ */

export function tangramPlay(router: Router, params: string[]): View | HTMLElement {
  const puzzle = PUZZLES.find((p) => p.id === params[0]);
  if (!puzzle || !tangramTierUnlocked(puzzle.tier)) {
    router.go('/tangram');
    return h('div');
  }
  const timeEl = h('b', {}, '00:00');
  const covEl = h('b', {}, '0%');
  const sub = h('div', { class: 'sub' }, h('span', {}, timeEl), h('span', {}, 'Lấp đầy ', covEl), h('span', {}, TIERS[puzzle.tier].name));

  let scene: TangramScene | null = null;
  let finished = false;
  let moved = false;
  const rotL = tool('rotateCcw', 'Xoay trái', () => scene?.rotateSelected(-1));
  const rotR = tool('rotateCw', 'Xoay phải', () => scene?.rotateSelected(1));
  const flip = tool('flip', 'Lật', () => scene?.flipSelected());
  const pieceTools = [rotL, rotR, flip];
  pieceTools.forEach((b) => (b.disabled = true));
  const tools = [...pieceTools, tool('hint', 'Gợi ý', () => scene?.hint()), tool('fit', 'Vừa khung', () => scene?.fit())];
  const ui = shell(router, puzzle.name, sub, tools, () => moved && !finished, '/tangram');
  const t = tip('Chạm mảnh để xoay 45°, chạm đúp để lật. Kéo núm vàng để xoay tự do.');
  ui.el.append(t.el);
  ui.el.addEventListener('pointerdown', () => t.hide(), { once: true });

  const timer = setInterval(() => {
    if (scene) timeEl.textContent = formatTime(scene.stats.ms);
  }, 250);

  requestAnimationFrame(() => {
    scene = new TangramScene(ui.host, puzzle, {
      select(p) {
        pieceTools.forEach((b) => (b.disabled = !p));
        if (p) moved = true;
      },
      progress(c) {
        covEl.textContent = `${Math.round(c * 100)}%`;
        ui.progress.style.width = `${c * 100}%`;
      },
      complete({ ms, hints }) {
        finished = true;
        const id = tangramId(puzzle);
        const stars = starsFor(ms, hints, TANGRAM_PAR[puzzle.tier]);
        const newBest = store.complete(id, stars, ms);
        const art = h('div', { style: 'padding:22px;display:grid;place-items:center' });
        art.append(scene!.snapshot(220));
        const idx = PUZZLES.indexOf(puzzle);
        const next = PUZZLES[idx + 1];
        openResult({
          title: puzzle.name,
          subtitle: `Tangram, bậc ${TIERS[puzzle.tier].name.toLowerCase()}`,
          art,
          stars,
          ms,
          hints,
          bestMs: store.record(id)!.bestMs,
          newBest,
          next: next && tangramTierUnlocked(next.tier) ? () => router.go(`/play/tangram/${next.id}`) : undefined,
          replay: () => router.go(`/play/tangram/${puzzle.id}`),
          menu: () => router.go('/tangram'),
        });
      },
    });
    if (import.meta.env.DEV) (window as unknown as { __scene: unknown }).__scene = scene;
  });

  return {
    el: ui.el,
    destroy() {
      clearInterval(timer);
      scene?.destroy();
    },
  };
}
