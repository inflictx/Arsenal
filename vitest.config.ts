import { defineConfig } from 'vitest/config';

// Tests live next to the code they cover (server/, web/, tests/). This config overrides
// vite.config.ts's `root: 'web'` so vitest discovers server-side tests too.
export default defineConfig({
  test: {
    include: ['server/**/*.test.ts', 'web/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
  },
});
