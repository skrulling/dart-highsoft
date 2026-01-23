import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Use happy-dom for a lightweight DOM environment
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],

    // Test file patterns
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/types/**',
        'src/**/*.d.ts',
      ],
    },

    // Global test timeout
    testTimeout: 10000,
  },

  resolve: {
    // Match TypeScript path aliases from tsconfig.json
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
