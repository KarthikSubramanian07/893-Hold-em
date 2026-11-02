import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts', 'site/**/*.test.ts'],
    environment: 'node',
  },
});
