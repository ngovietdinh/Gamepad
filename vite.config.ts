import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/icon.svg'],
      manifest: {
        name: 'Mảnh Ghép',
        short_name: 'Mảnh Ghép',
        description: 'Tranh ghép sơn mài và tangram cho iPad, tối ưu cho Apple Pencil.',
        lang: 'vi',
        display: 'fullscreen',
        orientation: 'any',
        background_color: '#2a100d',
        theme_color: '#2a100d',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell and photo thumbnails only, so updates install in seconds.
        // Full-size photos are cached the first time a puzzle opens them.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}', 'photos/*-t.webp'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/photos/') && url.pathname.endsWith('.webp'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'photos',
              expiration: { maxEntries: 80 },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
