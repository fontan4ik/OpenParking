import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/frontend'),
    },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx,js,jsx}', 'tests/**/*.spec.{ts,tsx,js,jsx}'],
    exclude: ['node_modules/**', 'Referenss/**'],
  },
});
