import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const IS_TAURI = process.env.TAURI_ENV_DEBUG !== undefined;

export default defineConfig({
  plugins: [react()],
  // Tauri expects the dev server on 5173
  server: {
    port: 5173,
    strictPort: true,
    // Allow Tauri to reach the dev server from the webview
    host: IS_TAURI ? '0.0.0.0' : 'localhost',
  },
  // Vite uses ESM by default; Tauri needs a relative base for file:// loading
  base: IS_TAURI ? './' : '/',
  build: {
    // Tauri uses Chromium — no need for broad browser compat
    target: ['es2021', 'chrome105'],
    minify: !IS_TAURI ? 'esbuild' : 'esbuild',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  // Expose env vars to the frontend
  envPrefix: ['VITE_', 'TAURI_ENV_'],
});
