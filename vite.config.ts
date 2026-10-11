import { defineConfig } from 'vitest/config';

// Fixed port + strictPort: if 5180 is taken, Vite fails instead of silently
// picking another port (so there is never a second dev server by accident).
export const DEV_PORT = 5180;
export const PREVIEW_PORT = 5181;

export default defineConfig({
  // Relative asset paths so the build runs from any folder, e.g. GitHub Pages at /Vaulter/.
  base: './',
  server: { host: '127.0.0.1', port: DEV_PORT, strictPort: true },
  preview: { host: '127.0.0.1', port: PREVIEW_PORT, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
