import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Windows and other local tools may reserve 5173. Start at 5176, then let
// Vite select the next available port if another process already owns it.
const previewPort = Number(process.env.FINCOACH_PORT || 5176);

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: previewPort, strictPort: false, proxy: { '/api': 'http://127.0.0.1:4000' } },
  build: { rollupOptions: { output: { manualChunks: { charts: ['recharts'] } } } },
  test: { environment: 'jsdom', restoreMocks: true, clearMocks: true },
});
