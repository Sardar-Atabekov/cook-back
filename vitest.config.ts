import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environmentMatchGlobs: [
      ['src/**/*.{test,spec}.{js,ts,jsx,tsx}', 'jsdom'],
      ['client/**/*.{test,spec}.{js,ts,jsx,tsx}', 'jsdom'],
      ['server/**/*.{test,spec}.{js,ts}', 'node'],
    ],
    coverage: {
      reporter: ['text', 'html'],
    },
    include: [
      'src/**/*.{test,spec}.{js,ts,jsx,tsx}',
      'client/**/*.{test,spec}.{js,ts,jsx,tsx}',
      'server/**/*.{test,spec}.{js,ts}',
    ],
  },
});
