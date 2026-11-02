import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, the rooms Worker runs under `wrangler dev` on :8787 and Vite proxies
// the room socket to it, so the browser always talks to its own origin, the
// same as production where a Pages Function forwards /room/* to the Worker.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/room': { target: `ws://127.0.0.1:${process.env.ROOMS_PORT ?? 8787}`, ws: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1600,
  },
});
