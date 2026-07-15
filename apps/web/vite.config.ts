import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative asset paths so the build works under any subpath
  // (e.g. served from /voxcomposerapp/demo/). Safe because the app uses
  // hash-based routing — the server only ever serves index.html at the root.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'favicon-32.png'],
      manifest: {
        name: 'Vox Composer',
        short_name: 'VoxComposer',
        description: 'Design and play synchronized animatronic shows for haunted attractions.',
        theme_color: '#0F1117',
        background_color: '#0F1117',
        display: 'standalone',
        // Relative so the installed app resolves correctly under the subpath.
        scope: './',
        start_url: './',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Cache the Google Fonts so the app's typography works fully offline.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    // In the Tauri dev wrapper the window loads this Vite server, but the
    // native "Save As" (/__save) and open-in-browser (/__open) routes are
    // served by the desktop app's in-process Rust server on a fixed dev port
    // (1421). Proxy them there so File→Save works in `tauri dev` too. Harmless
    // in a plain browser (nothing listens on 1421 → the app's browser fallback
    // kicks in).
    proxy: {
      '/__save': 'http://127.0.0.1:1421',
      '/__open': 'http://127.0.0.1:1421',
      '/__drop': 'http://127.0.0.1:1421',
    },
  },
});
