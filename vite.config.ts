import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves the app from /<repo>/, so the asset base must match.
  // Locally the dev server stays at the root.
  base: process.env.GITHUB_PAGES ? '/Receipt-counter/' : '/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 12000,
    strictPort: false,
    allowedHosts: true,
    // Convenience for local development: requests to /api go to the backend,
    // so the frontend can use the same origin (http://localhost:12000).
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 12000,
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          tesseract: ['tesseract.js'],
          charts: ['recharts'],
        },
      },
    },
  },
});
