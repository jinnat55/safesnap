import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: { input: { main: 'index.html', eval: 'eval.html' } },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
