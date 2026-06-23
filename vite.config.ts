import { defineConfig } from 'vite';

// Frontend lives in web/, builds to web/dist (served by Fastify in production).
// In dev, Vite serves on 5173 and proxies /api to the Fastify server on 7331.
export default defineConfig({
  root: 'web',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:7331',
    },
  },
});
