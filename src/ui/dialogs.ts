import { store, Settings } from '../core/store';
import { sfx } from '../fx/audio';
import { h, formatTime } from './dom';
import { icons } from './icons';
import { Router } from './router';
import { PHOTOS } from '../photos/photos';

function openCredits() {
  const s = scrim(() => s.remove());
  s.style.zIndex = '30';
  s.append(
    h(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-label': 'Nguồn ảnh' },
      h(
        'div',
        { class: 'topbar', style: 'margin-bottom:10px' },
        h('div', { class: 'grow' }, h('h2', { class: 'title', style: 'font-size:30px' }, 'Nguồn ảnh')),
        h('button', { class: 'icon-btn', 'aria-label': 'Đóng', html: icons.close, onclick: () => s.remove() }),
      ),
      h('p', { class: 'muted', style: 'font-size:14px;margin-top:0' }, 'Ảnh động vật lấy từ Wikimedia Commons, dùng theo giấy phép tự do của từng tác giả.'),
      h(
        'ul',
        { class: 'credits-list' },
        ...PHOTOS.map((p) =>
          h('li', {}, h('a', { href: p.credit.source, target: '_blank', rel: 'noopener' }, p.name), ` — ${p.credit.artist}, ${p.credit.license}`),
        ),
      ),
    ),
  );
}

function scrim(onClose?: () => void) {
  const s = h('div', { class: 'scrim' });
  if (onClose) {
    s.addEventListener('click', (e) => {
      if (e.target === s) onClose();
    });
  }
  document.getElementById('app')!.append(s);
  return s;
}

function toggle(label: string, desc: string, key: keyof Settings, after?: (v: boolean) => void) {
  const btn = h('button', {
    class: 'switch',
    role: 'switch',
    'aria-checked': String(store.settings[key]),
    'aria-label': label,
  });
  btn.addEventListener('click', () => {
    const v = !store.settings[key];
    store.set(key, v);
    btn.setAttribute('aria-checked', String(v));
    after?.(v);
    sfx.ui();
  });
  return h('div', { class: 'setting' }, h('div', {}, h('div', { class: 't' }, label), h('div', { class: 'd' }, desc)), btn);
}

export function openSettings(router: Router, onChange?: () => void) {
  const close = () => {
    s.remove();
    onChange?.();
  };
  const s = scrim(close);
  let confirmReset = false;
  const reset = h('button', { class: 'btn quiet danger' }, 'Xoá toàn bộ tiến độ');
  reset.addEventListener('click', () => {
    if (!confirmReset) {
      confirmReset = true;
      reset.textContent = 'Chạm lần nữa để xoá';
      return;
    }
    store.reset();
    close();
    router.go('/');
  });
  s.append(
    h(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-label': 'Cài đặt' },
      h(
        'div',
        { class: 'topbar', style: 'margin-bottom:6px' },
        h('div', { class: 'grow' }, h('h2', { class: 'title' }, 'Cài đặt')),
        h('button', { class: 'icon-btn', 'aria-label': 'Đóng', html: icons.close, onclick: close }),
      ),
      toggle('Âm thanh', 'Tiếng tách khi mảnh khớp, nhạc đàn tranh khi hoàn thành', 'sound'),
      toggle('Ảnh mờ trên khung', 'Hiện bức tranh mờ làm nền khi ghép', 'ghost'),
      toggle('Giảm chuyển động', 'Tắt hiệu ứng bay và lá vàng rơi', 'reduceMotion', (v) =>
        document.documentElement.classList.toggle('reduce-motion', v),
      ),
      h(
        'p',
        { class: 'muted', style: 'font-size:14px;margin:18px 0' },
        'Mẹo: dùng Apple Pencil để cầm mảnh chính xác, nhấn mạnh tay thì mảnh nhấc cao hơn. Hai ngón tay để phóng to hoặc kéo bàn chơi.',
      ),
      h('p', { class: 'muted', style: 'font-size:14px;margin:0 0 18px' }, 'Mảnh Ghép — tạo bởi ', h('b', {}, 'dinhngoviet'), '.'),
      h('div', { class: 'actions' }, PHOTOS.length ? h('button', { class: 'btn quiet', onclick: openCredits }, 'Nguồn ảnh') : null, reset),
    ),
  );
}

export interface ResultInfo {
  title: string;
  subtitle: string;
  art: HTMLElement;
  stars: number;
  ms: number;
  hints: number;
  bestMs: number;
  newBest: boolean;
  next?: () => void;
  replay: () => void;
  menu: () => void;
}

export function openResult(info: ResultInfo) {
  const s = scrim();
  const starEls = [0, 1, 2].map(() => h('i'));
  const close = (fn: () => void) => () => {
    s.remove();
    fn();
  };
  s.append(
    h(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-label': 'Hoàn thành' },
      h('div', { class: 'art' }, info.art),
      h('h2', { class: 'title' }, info.title),
      h('div', { class: 'muted' }, info.subtitle),
      h('div', { class: 'big-stars', 'aria-label': `${info.stars} trên 3 sao` }, ...starEls),
      h(
        'div',
        { class: 'facts' },
        h('div', { class: 'fact' }, h('div', { class: 'k' }, 'Thời gian'), h('div', { class: 'v' }, formatTime(info.ms))),
        h('div', { class: 'fact' }, h('div', { class: 'k' }, 'Gợi ý'), h('div', { class: 'v' }, info.hints)),
        h(
          'div',
          { class: 'fact' },
          h('div', { class: 'k' }, info.newBest ? 'Kỷ lục mới' : 'Kỷ lục'),
          h('div', { class: `v ${info.newBest ? 'gold' : ''}` }, formatTime(info.bestMs)),
        ),
      ),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn quiet', onclick: close(info.menu) }, 'Danh sách'),
        h('button', { class: 'btn quiet', onclick: close(info.replay) }, 'Chơi lại'),
        info.next ? h('button', { class: 'btn primary', onclick: close(info.next) }, 'Màn tiếp theo') : null,
      ),
    ),
  );
  // Stars light up one by one.
  starEls.forEach((el, i) => {
    if (i < info.stars) setTimeout(() => {
      el.classList.add('on');
      sfx.join();
    }, 450 + i * 260);
  });
}

export function confirmLeave(onLeave: () => void) {
  const s = scrim(() => s.remove());
  s.append(
    h(
      'div',
      { class: 'dialog', role: 'alertdialog', style: 'width:min(420px,100%)' },
      h('h2', { class: 'title', style: 'font-size:30px' }, 'Rời màn chơi?'),
      h('p', { class: 'muted' }, 'Các mảnh đã ghép trong màn này sẽ không được lưu.'),
      h(
        'div',
        { class: 'actions', style: 'margin-top:20px' },
        h('button', { class: 'btn quiet', onclick: () => s.remove() }, 'Ở lại'),
        h(
          'button',
          {
            class: 'btn primary',
            onclick: () => {
              s.remove();
              onLeave();
            },
          },
          'Rời đi',
        ),
      ),
    ),
  );
}
