import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on :8080 and Vite proxies /api to it,
// so the browser sees a single origin (cookies and CSRF header work unchanged).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080' },
  },
  build: { outDir: 'dist', sourcemap: false },
});
