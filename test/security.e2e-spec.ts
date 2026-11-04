import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';

describe('Seguridad HTTP (e2e)', () => {
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

  const login = () =>
    api()
      .post('/api/auth/login')
      .send({ email: 'nadie@test.com', password: '12345678' });

  afterEach(async () => {
    await app.close();
    delete process.env.CORS_ORIGINS;
    process.env.THROTTLE_DISABLED = 'true';
  });

  describe('cabeceras de seguridad', () => {
    it('añade las cabeceras de helmet y oculta X-Powered-By', async () => {
      await createApp();

      const res = await api().get('/api/auth/me').expect(401);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('CORS', () => {
    const allowed = 'https://app.example.com';
    const other = 'https://admin.example.com';

    it('sin orígenes configurados no emite cabeceras CORS', async () => {
      await createApp();

      const res = await api()
        .get('/api/auth/me')
        .set('Origin', allowed)
        .expect(401);

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('responde al preflight de un origen configurado', async () => {
      process.env.CORS_ORIGINS = `${allowed}, ${other}`;
      await createApp();

      const res = await api()
        .options('/api/projects')
        .set('Origin', other)
        .set('Access-Control-Request-Method', 'POST')
        .set(
          'Access-Control-Request-Headers',
          'authorization,content-type,accept-language',
        )
        .expect(204);

      expect(res.headers['access-control-allow-origin']).toBe(other);
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      expect(res.headers['access-control-allow-headers']).toMatch(
        /authorization/i,
      );
    });

    it('no autoriza orígenes que no están en la lista', async () => {
      process.env.CORS_ORIGINS = allowed;
      await createApp();

      const res = await api()
        .options('/api/projects')
        .set('Origin', 'https://evil.example.com')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('una petición real del origen permitido recibe las cabeceras CORS', async () => {
      process.env.CORS_ORIGINS = allowed;
      await createApp();

      const res = await api()
        .get('/api/auth/me')
        .set('Origin', allowed)
        .expect(401);

      expect(res.headers['access-control-allow-origin']).toBe(allowed);
      expect(res.headers['access-control-expose-headers']).toContain(
        'Retry-After',
      );
    });
  });

  describe('límite de peticiones', () => {
    const exhaustLogin = async () => {
      for (let i = 0; i < 5; i++) await login().expect(401);
    };

    it('bloquea el login tras 5 intentos con 429 y mensaje en inglés', async () => {
      process.env.THROTTLE_DISABLED = 'false';
      await createApp();
      await exhaustLogin();

      const res = await login().expect(429);

      expect(res.body.message).toBe(
        'Too many requests. Please try again later',
      );
      expect(res.headers['retry-after']).toBeDefined();
    });

    it('traduce el mensaje según Accept-Language', async () => {
      process.env.THROTTLE_DISABLED = 'false';
      await createApp();
      await exhaustLogin();

      const res = await login().set('Accept-Language', 'es').expect(429);

      expect(res.body.message).toBe(
        'Demasiadas peticiones. Inténtalo de nuevo más tarde',
      );
    });

    it('el registro también tiene límite', async () => {
      process.env.THROTTLE_DISABLED = 'false';
      await createApp();

      // El guard de límite se ejecuta antes que la validación: un cuerpo vacío también cuenta
      for (let i = 0; i < 5; i++) {
        await api().post('/api/auth/register').send({}).expect(400);
      }
      await api().post('/api/auth/register').send({}).expect(429);
    });

    it('agotar el login no afecta a otras rutas', async () => {
      process.env.THROTTLE_DISABLED = 'false';
      await createApp();
      await exhaustLogin();
      await login().expect(429);

      await api().get('/api/auth/me').expect(401);
    });

    it('con THROTTLE_DISABLED=true no limita', async () => {
      await createApp();

      for (let i = 0; i < 8; i++) await login().expect(401);
    });
  });
});
