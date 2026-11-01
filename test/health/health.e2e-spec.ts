import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { setupApp } from '../../src/setup-app.js';

describe('Health (e2e)', () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());

  const createApp = async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  };

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
    delete process.env.THROTTLE_LIMIT;
    process.env.THROTTLE_DISABLED = 'true';
  });

  it('GET /health/live responde 200 sin autenticación', async () => {
    await createApp();

    const res = await api().get('/health/live').expect(200);

    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready responde 200 con la base de datos disponible', async () => {
    await createApp();

    const res = await api().get('/health/ready').expect(200);

    expect(res.body).toEqual({ status: 'ok', checks: { database: 'up' } });
  });

  it('GET /health/ready responde 503 si la base de datos falla y no filtra el error', async () => {
    await createApp();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    vi.spyOn(app.get(PrismaService), '$queryRaw').mockRejectedValue(
      new Error('password authentication failed for user "raul"'),
    );

    const res = await api().get('/health/ready').expect(503);

    expect(res.body).toMatchObject({
      status: 'error',
      checks: { database: 'down' },
    });
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('no está sujeto al límite de peticiones', async () => {
    process.env.THROTTLE_DISABLED = 'false';
    process.env.THROTTLE_LIMIT = '3';
    await createApp();

    for (let i = 0; i < 6; i++) {
      await api().get('/health/live').expect(200);
    }
    // Comprobación de que el límite sí está activo en otras rutas
    for (let i = 0; i < 3; i++) await api().get('/auth/me').expect(401);
    await api().get('/auth/me').expect(429);
  });
});
