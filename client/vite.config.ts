import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// PWA config (Issue #117).
//
// `registerType: 'prompt'` — we will NOT auto-activate a new service worker. On
// a new deploy the user sees an "Update available" chip and picks when to
// reload. This avoids yanking the app out from under someone mid-task. The
// service worker precaches the app shell (JS/CSS/fonts) so the page loads
// without network.
//
// We intentionally do NOT runtime-cache API calls via Workbox — IndexedDB is
// the source of truth for offline data (see client/src/offline/*). This lets
// us version-guard writes, invalidate per-opp, and surface staleness clearly,
// which a generic network-first Workbox handler can't do.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/ataccama-symbol.svg'],
      manifest: {
        name: 'SE Pipeline Tracker',
        short_name: 'SE Pipeline',
        description: 'Ataccama SE team pipeline workspace. Works offline for your favorited deals.',
        theme_color: '#6A2CF5',
        background_color: '#1A0C42',
        display: 'standalone',
        orientation: 'landscape-primary',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/ataccama-symbol.svg',           sizes: 'any',       type: 'image/svg+xml', purpose: 'any'      },
          { src: '/icons/ataccama-symbol-maskable.svg',  sizes: 'any',       type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache all build assets but skip the server-rendered index fallback
        // so fresh API tokens always come from the real server (not a stale SW
        // response). API calls go through our own IndexedDB layer.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        // 10 MB is plenty for our bundle; prevents silent drops of large chunks.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
      devOptions: {
        // SW disabled in dev to avoid caching during active development.
        enabled: false,
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    watch: {
      usePolling: true,   // required when Vite runs in WSL watching Windows-side files
      interval: 1000,
      ignored: ['**/node_modules/**', '**/.git/**'],
    },
  },
})
