import { defineConfig } from 'vite';

// Two build modes:
//  - default          → server-backed app, web/dist (served by Fastify), base '/', uses httpApi.
//  - --mode static    → client-only GitHub Pages build, web/dist-static, base '/Arsenal/',
//                       uses localApi (IndexedDB + bundled JSON). VITE_STATIC=1 via web/.env.static.
// Separate outDirs so a Pages build never clobbers the local server's dist.
export default defineConfig(({ mode }) => {
  const isStatic = mode === 'static';
  return {
    root: 'web',
    base: isStatic ? '/Arsenal/' : '/',
    build: {
      outDir: isStatic ? 'dist-static' : 'dist',
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      proxy: { '/api': 'http://localhost:7331' },
    },
  };
});
