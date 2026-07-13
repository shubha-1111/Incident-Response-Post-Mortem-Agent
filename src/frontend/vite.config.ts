import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    cssMinify: true,
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          charts: ['recharts'],
        }
      }
    }
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT || 5000}`,
        changeOrigin: true,
      },
      '/login': {
        target: `http://localhost:${process.env.PORT || 5000}`,
        changeOrigin: true,
      },
      '/dashboard': {
        target: `http://localhost:${process.env.PORT || 5000}`,
        changeOrigin: true,
      },
      '/ingest': {
        target: `http://localhost:${process.env.PORT || 5000}`,
        changeOrigin: true,
      },
      '/approve': {
        target: `http://localhost:${process.env.PORT || 5000}`,
        changeOrigin: true,
      },
      '/reject': {
        target: `http://localhost:${process.env.PORT || 5000}`,
        changeOrigin: true,
      },
      '/incident': {
        target: `http://localhost:${process.env.PORT || 5000}`,
        changeOrigin: true,
      },
      '/health': {
        target: `http://localhost:${process.env.PORT || 5000}`,
        changeOrigin: true,
      },
    }
  }
});
