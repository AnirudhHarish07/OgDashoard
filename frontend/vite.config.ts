/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, fs: { allow: ['..'] } },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('maplibre-gl')) return 'maplibre';
          if (id.includes('echarts') || id.includes('zrender')) return 'echarts';
          return undefined;
        },
      },
    },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./tests/setup.ts'], css: false, include: ['tests/**/*.test.{ts,tsx}'] },
});
