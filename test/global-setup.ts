import { execSync } from 'node:child_process';
import { TEST_DATABASE_URL } from './test-env.js';

export default function setup() {
  // Protección: estos tests borran datos, nunca deben apuntar a la base de desarrollo
  if (!TEST_DATABASE_URL.includes('test')) {
    throw new Error(
      'DATABASE_URL_TEST debe apuntar a una base de datos de pruebas',
    );
  }
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
