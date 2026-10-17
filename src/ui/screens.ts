import { PAINTINGS, renderPainting } from '../art/paintings';
import { C } from '../art/lacquer';
import { easeOutCubic } from '../core/geom';
import { makeRng } from '../core/rng';
import { store } from '../core/store';
import { applyPath, generateCut, pieceOutline } from '../jigsaw/cut';
import { TangramEngine } from '../tangram/engine';
import { PUZZLES, TIERS, solution } from '../tangram/puzzles';
import { renderSilhouette } from '../tangram/scene';
import { h } from './dom';
import { icons } from './icons';
import {
  JIGSAW_LEVELS,
  jigsawId,
  jigsawProgress,
  jigsawUnlocked,
  tangramId,
  tangramProgress,
  tangramTierUnlocked,
} from './levels';
import { Router } from './router';
import { openSettings } from './dialogs';
import { sfx } from '../fx/audio';
import { GROUPS, PHOTOS, PHOTO_SIZES, Photo, PhotoGroup, creditLine, loadImage, loadShape, photoBest, photoId, photoUrl, thumbUrl } from '../photos/photos';

function stars(n: number) {
  return h('span', { class: 'stars', 'aria-label': `${n} trên 3 sao` }, ...[0, 1, 2].map((i) => h('i', { class: i < n ? 'on' : '' })));
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

export function homeScreen(router: Router) {
  const jp = jigsawProgress();
  const tp = tangramProgress();
  const jigsawArt = h('div', { class: 'art' });
  const tangramArt = h('div', { class: 'art tangram-art' });

  const el = h(
    'main',
    { class: 'screen home enter' },
    h('div', { class: 'home-inner' }, h(
      'header',
      { class: 'home-head' },
      h('div', {}, h('h1', { class: 'wordmark' }, 'Mảnh Ghép'), h('p', { class: 'lede' }, 'Ghép ảnh động vật thật theo đúng dáng con vật, tranh sơn mài và tangram, làm riêng cho iPad và Apple Pencil.')),
      h('button', { class: 'icon-btn', 'aria-label': 'Cài đặt', html: icons.settings, onclick: () => openSettings(router) }),
    ),
    h(
      'section',
      { class: 'modes' },
      h(
        'button',
        { class: 'tablet', onclick: () => router.go('/jigsaw') },
        jigsawArt,
        h(
          'div',
          { class: 'meta' },
          h('div', {}, h('div', { class: 'name' }, 'Tranh ghép'), h('div', { class: 'desc' }, PHOTOS.length ? `${PHOTOS.length} ảnh động vật thật, ghép theo dáng con vật, và 5 tranh sơn mài` : '5 bức sơn mài, mỗi bức 6 cấp từ 12 đến 108 mảnh')),
          h('div', { class: 'count' }, PHOTOS.length ? `${PHOTOS.filter((p) => photoBest(p).done).length}/${PHOTOS.length} ảnh` : `${jp.done}/${jp.total} màn`),
        ),
      ),
      h(
        'button',
        { class: 'tablet', onclick: () => router.go('/tangram') },
        tangramArt,
        h(
          'div',
          { class: 'meta' },
          h('div', {}, h('div', { class: 'name' }, 'Tangram'), h('div', { class: 'desc' }, '7 mảnh, 24 hình bóng')),
          h('div', { class: 'count' }, `${tp.done}/${tp.total} hình`),
        ),
      ),
    )),
  );

  requestAnimationFrame(() => {
    // The home teaser shows a real photo: the red panda, a few pieces lifted out.
    const teaser = PHOTOS.find((p) => p.id === 'gau-truc-do') ?? PHOTOS[0];
    if (teaser) loadImage(photoUrl(teaser)).then((img) => mountJigsawTeaser(jigsawArt, img), () => mountJigsawTeaser(jigsawArt));
    else mountJigsawTeaser(jigsawArt);
    mountTangramTeaser(tangramArt);
  });
  return el;
}

/** The finished Hạ Long painting with three pieces lifted out; two glide home on load. */
function mountJigsawTeaser(host: HTMLElement, picture?: HTMLImageElement) {
  const r = host.getBoundingClientRect();
  if (!r.width) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = h('canvas');
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  host.append(canvas);
  const ctx = canvas.getContext('2d')!;
  let img: HTMLCanvasElement;
  if (picture) {
    img = h('canvas');
    img.width = picture.naturalWidth;
    img.height = picture.naturalHeight;
    img.getContext('2d')!.drawImage(picture, 0, 0);
  } else {
    img = renderPainting(PAINTINGS[0], Math.max(r.width, (r.height * 4) / 3) * dpr);
  }
  // Cover-crop the 4:3 picture into the teaser box.
  const W0 = canvas.width;
  const H0 = canvas.height;
  const sc = Math.max(W0 / img.width, H0 / img.height);
  const sw = W0 / sc;
  const sh = H0 / sc;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  const paint = (c: CanvasRenderingContext2D) => c.drawImage(img, sx, sy, sw, sh, 0, 0, W0, H0);
  const cols = 5;
  const rows = 4;
  const cut = generateCut(cols, rows, makeRng(11));
  const W = canvas.width;
  const H = canvas.height;
  const pw = W / cols;
  const ph = H / rows;
  const lifted = [
    { r: 1, c: 1, dx: -0.2, dy: 0.55, rot: -0.12, settle: true },
    { r: 2, c: 3, dx: 0.35, dy: -0.4, rot: 0.1, settle: true },
    { r: 0, c: 3, dx: 0.3, dy: 2.35, rot: 0.24, settle: false },
  ].map((p) => {
    const path = new Path2D();
    applyPath(path, pieceOutline(cut, p.r, p.c, pw, ph), p.c * pw, p.r * ph);
    return { ...p, path };
  });
  const reduce = store.settings.reduceMotion;
  const start = performance.now();
  const frame = (now: number) => {
    const t = reduce ? 10 : (now - start) / 1000;
    ctx.clearRect(0, 0, W, H);
    paint(ctx);
    lifted.forEach((p, i) => {
      const k = p.settle ? easeOutCubic(Math.min(1, Math.max(0, (t - 0.5 - i * 0.22) / 0.7))) : 0;
      if (k < 1) {
        // Empty socket.
        ctx.save();
        ctx.fillStyle = '#140605';
        ctx.fill(p.path);
        ctx.strokeStyle = 'rgba(224,182,90,0.35)';
        ctx.lineWidth = 1.2 * dpr;
        ctx.stroke(p.path);
        ctx.restore();
      }
      const ox = p.dx * pw * (1 - k);
      const oy = p.dy * ph * (1 - k);
      const rot = p.rot * (1 - k);
      const cx = (p.c + 0.5) * pw;
      const cy = (p.r + 0.5) * ph;
      const lift = 1 - k;
      ctx.save();
      ctx.translate(cx + ox, cy + oy);
      ctx.rotate(rot);
      ctx.scale(1 + lift * 0.04, 1 + lift * 0.04);
      ctx.translate(-cx, -cy);
      ctx.shadowColor = `rgba(0,0,0,${0.55 * lift})`;
      ctx.shadowBlur = 18 * dpr * lift;
      ctx.shadowOffsetY = 10 * dpr * lift;
      ctx.fillStyle = '#000';
      ctx.fill(p.path);
      ctx.shadowColor = 'transparent';
      ctx.clip(p.path);
      paint(ctx);
      ctx.restore();
      if (k < 1 || !p.settle) {
        ctx.save();
        ctx.translate(cx + ox, cy + oy);
        ctx.rotate(rot);
        ctx.translate(-cx, -cy);
        ctx.strokeStyle = 'rgba(255,236,190,0.55)';
        ctx.lineWidth = 1.2 * dpr;
        ctx.stroke(p.path);
        ctx.restore();
      }
    });
    if (t < 2.2) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

const TEASER_COLORS = [C.cinnabar, C.jade, C.gold, C.egg, '#7a2a18', C.teal, C.ochre];

/** A sailboat in lacquer tiles, one piece still waiting to be placed. */
function mountTangramTeaser(host: HTMLElement) {
  const r = host.getBoundingClientRect();
  if (!r.width) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = h('canvas');
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  host.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const puzzle = PUZZLES.find((p) => p.id === 'buom')!;
  const sol = solution(puzzle);
  const e = new TangramEngine(puzzle, 1);
  const pts = puzzle.outline.flat().map((p) => e.latticeToWorld(p));
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const s = Math.min((canvas.width * 0.56) / (maxX - minX), (canvas.height * 0.7) / (maxY - minY));
  const ox = canvas.width * 0.42 - ((minX + maxX) / 2) * s;
  const oy = canvas.height / 2 - ((minY + maxY) / 2) * s;
  // Silhouette recess.
  ctx.save();
  ctx.setTransform(s, 0, 0, s, ox, oy);
  ctx.beginPath();
  for (const poly of puzzle.outline) {
    poly.forEach((p, i) => {
      const q = e.latticeToWorld(p);
      if (i) ctx.lineTo(q.x, q.y);
      else ctx.moveTo(q.x, q.y);
    });
    ctx.closePath();
  }
  ctx.fillStyle = '#1a0806';
  ctx.fill();
  ctx.lineWidth = 1.5 / s;
  ctx.strokeStyle = 'rgba(224,182,90,0.7)';
  ctx.stroke();
  ctx.restore();
  sol.forEach((pl, i) => {
    const out = pl.kind === 'P';
    ctx.save();
    ctx.setTransform(s, 0, 0, s, ox, oy);
    if (out) {
      // Lift the piece out beside the figure, tilted, as if waiting to be placed.
      const wpts = pl.poly.map((v) => e.latticeToWorld(v));
      const cx = wpts.reduce((a, v) => a + v.x, 0) / wpts.length;
      const cy = wpts.reduce((a, v) => a + v.y, 0) / wpts.length;
      ctx.translate(maxX + 1.4, (minY + maxY) / 2 + 0.6);
      ctx.rotate(0.45);
      ctx.translate(-cx, -cy);
    }
    ctx.beginPath();
    pl.poly.forEach((v, j) => {
      const q = e.latticeToWorld(v);
      if (j) ctx.lineTo(q.x, q.y);
      else ctx.moveTo(q.x, q.y);
    });
    ctx.closePath();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = (out ? 16 : 4) * dpr;
    ctx.shadowOffsetY = (out ? 8 : 1) * dpr;
    ctx.fillStyle = TEASER_COLORS[i % TEASER_COLORS.length];
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 1.2 / s * dpr;
    ctx.strokeStyle = 'rgba(243,220,152,0.9)';
    ctx.stroke();
    ctx.restore();
  });
}

/* ------------------------------------------------------------------ */
/* Jigsaw menu                                                         */
/* ------------------------------------------------------------------ */

export function jigsawMenu(router: Router) {
  const list = h('div', { class: 'paintings' });
  const el = h(
    'main',
    { class: 'screen enter' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Quay lại', html: icons.back, onclick: () => router.go('/') }),
      h('div', { class: 'grow' }, h('h2', { class: 'title' }, 'Tranh ghép')),
      jigsawTabs(router, 'paint'),
    ),
    list,
  );

  for (const p of PAINTINGS) {
    const art = h('div', { class: 'art' });
    let nextMarked = false;
    const levels = JIGSAW_LEVELS.map((l) => {
      const rec = store.record(jigsawId(p, l.index));
      const open = jigsawUnlocked(p, l.index);
      const isNext = open && !rec && !nextMarked;
      if (isNext) nextMarked = true;
      const n = l.cols * l.rows;
      return h(
        'button',
        {
          class: `level ${rec ? 'done' : ''} ${isNext ? 'next' : ''}`,
          disabled: !open,
          'aria-label': `${n} mảnh${l.rotation ? ', có xoay mảnh' : ''}${open ? '' : ', chưa mở'}`,
          onclick: () => router.go(`/play/jigsaw/${p.id}/${l.index}`),
        },
        l.rotation ? h('span', { class: 'spin', html: icons.spin, title: 'Có xoay mảnh' }) : null,
        h('span', {}, h('div', { class: 'n' }, n), h('div', { class: 'unit' }, 'mảnh')),
        open ? stars(rec?.stars ?? 0) : h('span', { class: 'lock', html: icons.lock }),
      );
    });
    list.append(
      h(
        'article',
        { class: 'painting' },
        art,
        h('div', { class: 'info' }, h('h3', { class: 'section' }, p.title), h('div', { class: 'caption' }, p.caption)),
        h('div', { class: 'levels' }, ...levels),
      ),
    );
    // Paint thumbnails progressively so the list appears instantly.
    requestAnimationFrame(() =>
      setTimeout(() => {
        const w = art.getBoundingClientRect().width || 520;
        const c = renderPainting(p, Math.min(1200, w * Math.min(2, window.devicePixelRatio || 1)));
        const copy = h('canvas');
        copy.width = c.width;
        copy.height = c.height;
        copy.getContext('2d')!.drawImage(c, 0, 0);
        art.append(copy);
      }, 0),
    );
  }
  return el;
}

/* ------------------------------------------------------------------ */
/* Tangram menu                                                        */
/* ------------------------------------------------------------------ */

export function tangramMenu(router: Router) {
  const el = h(
    'main',
    { class: 'screen enter' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Quay lại', html: icons.back, onclick: () => router.go('/') }),
      h('div', { class: 'grow' }, h('h2', { class: 'title' }, 'Tangram')),
    ),
  );
  TIERS.forEach((t, tier) => {
    const open = tangramTierUnlocked(tier);
    const grid = h('div', { class: 'grid' });
    for (const p of PUZZLES.filter((x) => x.tier === tier)) {
      const rec = store.record(tangramId(p));
      const sil = renderSilhouette(p, 88, rec ? C.gold : 'rgba(239,230,210,0.22)');
      grid.append(
        h(
          'button',
          { class: `shape ${rec ? 'done' : ''}`, 'aria-label': p.name, onclick: () => router.go(`/play/tangram/${p.id}`) },
          sil,
          h('span', { class: 'label' }, p.name),
          stars(rec?.stars ?? 0),
        ),
      );
    }
    el.append(
      h(
        'section',
        { class: `tier ${open ? '' : 'locked'}` },
        h(
          'div',
          { class: 'tier-head' },
          h('h3', { class: 'section' }, t.name),
          h('span', { class: 'muted' }, t.caption),
          open ? null : h('span', { class: 'lock-note' }, 'Ghép xong 4 hình ở bậc trước để mở'),
        ),
        grid,
      ),
    );
  });
  return el;
}

/* ------------------------------------------------------------------ */
/* Animal photos                                                       */
/* ------------------------------------------------------------------ */

function jigsawTabs(router: Router, active: 'paint' | 'photo') {
  const tab = (id: 'paint' | 'photo', label: string, path: string) =>
    h('button', { class: 'seg', role: 'tab', 'aria-selected': String(active === id), onclick: () => router.go(path) }, label);
  return h('div', { class: 'segmented', role: 'tablist' }, tab('photo', 'Ảnh động vật', '/jigsaw'), tab('paint', 'Tranh sơn mài', '/jigsaw/lacquer'));
}

let lastGroup: PhotoGroup | 'all' = 'all';

export function photosMenu(router: Router) {
  const grid = h('div', { class: 'photo-grid' });
  const chips = h('div', { class: 'chips', role: 'tablist' });
  const render = () => {
    chips.replaceChildren(
      ...[{ id: 'all' as const, name: 'Tất cả' }, ...GROUPS].map((g) =>
        h(
          'button',
          {
            class: 'chip',
            role: 'tab',
            'aria-selected': String(lastGroup === g.id),
            onclick: () => {
              lastGroup = g.id;
              render();
            },
          },
          g.name,
          h('span', { class: 'n' }, g.id === 'all' ? PHOTOS.length : PHOTOS.filter((p) => p.group === g.id).length),
        ),
      ),
    );
    grid.replaceChildren(
      ...PHOTOS.filter((p) => lastGroup === 'all' || p.group === lastGroup).map((p) => {
        const best = photoBest(p);
        return h(
          'button',
          { class: `photo ${best.done ? 'done' : ''}`, 'aria-label': p.name, onclick: () => openPhotoSheet(router, p) },
          h('img', { src: thumbUrl(p), alt: '', loading: 'lazy', decoding: 'async', width: 480, height: 360 }),
          h('span', { class: 'cap' }, h('span', { class: 'label' }, p.name), best.done ? stars(best.stars) : null),
        );
      }),
    );
  };
  render();
  return h(
    'main',
    { class: 'screen enter' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Quay lại', html: icons.back, onclick: () => router.go('/') }),
      h('div', { class: 'grow' }, h('h2', { class: 'title' }, 'Tranh ghép')),
      jigsawTabs(router, 'photo'),
    ),
    PHOTOS.length ? chips : null,
    PHOTOS.length ? grid : h('p', { class: 'muted' }, 'Chưa có ảnh nào trong bộ sưu tập.'),
  );
}

let lastSize = 1;
let lastRotation = false;
let lastShaped = true;

function openPhotoSheet(router: Router, p: Photo) {
  const close = () => s.remove();
  const s = h('div', { class: 'scrim' });
  s.addEventListener('click', (e) => {
    if (e.target === s) close();
  });
  const sizes = h('div', { class: 'sizes', role: 'radiogroup', 'aria-label': 'Số mảnh' });
  const rot = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(lastRotation), 'aria-label': 'Xoay mảnh' });
  const canShape = !!p.shape;
  const shapedOn = () => canShape && lastShaped;
  const shp = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(shapedOn()), 'aria-label': 'Theo dáng con vật' });
  const preview = h('img', { src: photoUrl(p), alt: p.name, width: 1600, height: 1200 });
  const outline = h('canvas', { class: 'shape-outline' });
  const renderPreview = () => {
    outline.style.opacity = shapedOn() ? '1' : '0';
    if (!shapedOn() || outline.dataset.done) return;
    loadShape(p)
      .then((shape) => {
        outline.width = 1200;
        outline.height = 900;
        const ctx = outline.getContext('2d')!;
        ctx.fillStyle = 'rgba(20,6,4,0.78)';
        ctx.fillRect(0, 0, 1200, 900);
        const path = new Path2D();
        for (const poly of shape.polys) {
          for (let i = 0; i < poly.length; i += 2) (i ? path.lineTo(poly[i], poly[i + 1]) : path.moveTo(poly[i], poly[i + 1]));
          path.closePath();
        }
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fill(path);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#f3dc98';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.stroke(path);
        outline.dataset.done = '1';
      })
      .catch(() => {});
  };
  shp.addEventListener('click', () => {
    lastShaped = !lastShaped;
    shp.setAttribute('aria-checked', String(shapedOn()));
    renderPreview();
    renderSizes();
    sfx.ui();
  });
  const renderSizes = () =>
    sizes.replaceChildren(
      ...PHOTO_SIZES.map((sz, i) => {
        const rec = store.record(photoId(p, sz, lastRotation, shapedOn()));
        return h(
          'button',
          {
            class: `size ${rec ? 'done' : ''}`,
            role: 'radio',
            'aria-checked': String(i === lastSize),
            onclick: () => {
              lastSize = i;
              renderSizes();
              sfx.ui();
            },
          },
          h('span', { class: 'n' }, `${shapedOn() ? '≈' : ''}${sz.cols * sz.rows}`),
          h('span', { class: 'unit' }, 'mảnh'),
          rec ? stars(rec.stars) : null,
        );
      }),
    );
  rot.addEventListener('click', () => {
    lastRotation = !lastRotation;
    rot.setAttribute('aria-checked', String(lastRotation));
    renderSizes();
    sfx.ui();
  });
  renderSizes();
  renderPreview();
  s.append(
    h(
      'div',
      { class: 'dialog photo-sheet', role: 'dialog', 'aria-label': p.name },
      h('div', { class: 'art shape-preview' }, preview, outline),
      h(
        'div',
        { class: 'topbar', style: 'margin-bottom:4px' },
        h('div', { class: 'grow' }, h('h2', { class: 'title' }, p.name)),
        h('button', { class: 'icon-btn', 'aria-label': 'Đóng', html: icons.close, onclick: close }),
      ),
      h('a', { class: 'credit', href: p.credit.source, target: '_blank', rel: 'noopener' }, creditLine(p)),
      sizes,
      canShape
        ? h('div', { class: 'setting' }, h('div', {}, h('div', { class: 't' }, 'Theo dáng con vật'), h('div', { class: 'd' }, 'Chỉ ghép con vật, mép bàn chạy theo đường viền')), shp)
        : null,
      h('div', { class: 'setting' }, h('div', {}, h('div', { class: 't' }, 'Xoay mảnh'), h('div', { class: 'd' }, 'Mảnh bị xoay ngẫu nhiên, chạm để xoay lại')), rot),
      h(
        'div',
        { class: 'actions', style: 'margin-top:20px' },
        h(
          'button',
          {
            class: 'btn primary',
            onclick: () => {
              close();
              const sz = PHOTO_SIZES[lastSize];
              router.go(`/play/photo/${p.id}/${sz.cols * sz.rows}/${lastRotation ? 1 : 0}/${shapedOn() ? 1 : 0}`);
            },
          },
          'Bắt đầu ghép',
        ),
      ),
    ),
  );
  document.getElementById('app')!.append(s);
}
