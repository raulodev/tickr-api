import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL, THROTTLE_DISABLED } from './test/test-env.js';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    hookTimeout: 30000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: 'e2e-test-secret',
      THROTTLE_DISABLED: THROTTLE_DISABLED,
    },
  },
});
