import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { store } from './core/store';
import { Router } from './ui/router';
import { homeScreen, jigsawMenu, tangramMenu } from './ui/screens';
import { jigsawPlay, tangramPlay } from './ui/play';

document.documentElement.classList.toggle('reduce-motion', store.settings.reduceMotion);

const router = new Router(document.getElementById('app')!, [
  [/^\/$/, (r) => homeScreen(r)],
  [/^\/jigsaw$/, (r) => jigsawMenu(r)],
  [/^\/tangram$/, (r) => tangramMenu(r)],
  [/^\/play\/jigsaw\/([\w-]+)\/(\d)$/, (r, p) => jigsawPlay(r, p)],
  [/^\/play\/tangram\/([\w-]+)$/, (r, p) => tangramPlay(r, p)],
]);
router.render();

// Offline support: the service worker caches the whole app.
if (import.meta.env.PROD) registerSW({ immediate: true });

// iOS Safari: stop double-tap zoom and pinch zoom on UI chrome.
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
