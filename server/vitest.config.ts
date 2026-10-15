import { defineConfig } from 'vitest/config';

// Tests run against their own MySQL database, rebuilt from the migrations before the run
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['src/test/globalSetup.ts'],
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'mysql://root:root@127.0.0.1:3306/recallr_test',
      JWT_SECRET: 'test-secret-0123456789abcdef0123456789abcdef',
      ADMIN_EMAIL: 'admin@example.com',
      OFFLINE_PAYMENT_INFO: 'UPI: test@okbank',
    },
  },
});
