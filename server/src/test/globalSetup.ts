import { execSync } from 'node:child_process';

// Bring the test database up to date with the migrations
export default function setup() {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'mysql://root:root@127.0.0.1:3306/recallr_test' },
    stdio: 'ignore',
  });
}
