import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { hashToken } from '../../src/auth/refresh-token.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { setupApp } from '../../src/setup-app.js';

describe('Refresh tokens (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const me = (token: string) => api().get('/auth/me').set(bearer(token));
  const refresh = (refreshToken: string, tenantId?: string) =>
    api().post('/auth/refresh').send({ refreshToken, tenantId });

  const registerUser = async (email: string) =>
    (
      await api()
        .post('/auth/register')
        .send({ tenantName: `Org de ${email}`, email, password: '12345678' })
        .expect(201)
    ).body as { access_token: string; refresh_token: string };

  const login = async (email: string) => {
    await prisma.user.update({
      where: { email },
      data: { emailVerifiedAt: new Date() },
    });
    return (
      await api()
        .post('/auth/login')
        .send({ email, password: '12345678' })
        .expect(200)
    ).body;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.issueEvent.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.issue.deleteMany();
    await prisma.project.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.user.deleteMany(); // los refresh tokens se borran en cascada
    await prisma.tenant.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('emisión', () => {
    it('register y login devuelven access token y refresh token', async () => {
      const registered = await registerUser('ana@test.com');
      expect(registered.access_token).toEqual(expect.any(String));
      expect(registered.refresh_token).toEqual(expect.any(String));

      const logged = await login('ana@test.com');
      expect(logged.refresh_token).toEqual(expect.any(String));
      expect(logged.refresh_token).not.toBe(registered.refresh_token);
      expect(logged.organizations).toHaveLength(1);
    });

    it('el refresh token no se guarda en claro', async () => {
      const { refresh_token } = await registerUser('ana@test.com');

      expect(
        await prisma.refreshToken.findFirst({
          where: { tokenHash: refresh_token },
        }),
      ).toBeNull();
      expect(
        await prisma.refreshToken.findUnique({
          where: { tokenHash: hashToken(refresh_token) },
        }),
      ).not.toBeNull();
    });
  });

  describe('POST /auth/refresh', () => {
    it('devuelve un par nuevo y el access token nuevo funciona', async () => {
      const { refresh_token } = await registerUser('ana@test.com');

      const res = await refresh(refresh_token).expect(200);

      expect(res.body.refresh_token).not.toBe(refresh_token);
      await me(res.body.access_token).expect(200);
    });

    it('un refresh token solo sirve una vez: reutilizarlo cierra toda la sesión', async () => {
      const first = (await registerUser('ana@test.com')).refresh_token;
      const second = (await refresh(first).expect(200)).body.refresh_token;

      await refresh(first).expect(401); // reutilización
      await refresh(second).expect(401); // misma familia: también queda revocado
    });

    it('dos refresh simultáneos con el mismo token: solo uno prospera y la sesión se cierra', async () => {
      const { refresh_token } = await registerUser('ana@test.com');

      const results = await Promise.all([
        refresh(refresh_token),
        refresh(refresh_token),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
      const winner = results.find((r) => r.status === 200)!;
      await refresh(winner.body.refresh_token).expect(401);
    });

    it('rechaza tokens desconocidos, caducados y cuerpos inválidos', async () => {
      const { refresh_token } = await registerUser('ana@test.com');

      await refresh('token-inventado').expect(401);
      await api().post('/auth/refresh').send({}).expect(400);
      await refresh(refresh_token, 'no-es-uuid').expect(400);

      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(refresh_token) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await refresh(refresh_token).expect(401);
    });

    it('traduce el error según Accept-Language', async () => {
      const res = await refresh('token-inventado')
        .set('Accept-Language', 'es')
        .expect(401);

      expect(res.body.message).toBe(
        'La sesión ya no es válida. Inicia sesión de nuevo',
      );
    });

    it('sin tenantId usa la primera organización; con tenantId, la indicada', async () => {
      const { access_token, refresh_token } =
        await registerUser('ana@test.com');
      const { tenantId: firstTenant } = (await me(access_token).expect(200))
        .body;
      const second = (
        await api()
          .post('/tenants')
          .set(bearer(access_token))
          .send({ name: 'Segunda Org' })
          .expect(201)
      ).body.organization.id as string;

      const withTenant = await refresh(refresh_token, second).expect(200);
      expect(
        (await me(withTenant.body.access_token).expect(200)).body.tenantId,
      ).toBe(second);

      const withoutTenant = await refresh(withTenant.body.refresh_token).expect(
        200,
      );
      expect(
        (await me(withoutTenant.body.access_token).expect(200)).body.tenantId,
      ).toBe(firstTenant);
    });

    it('responde 403 con una organización ajena sin consumir el refresh token', async () => {
      const ana = await registerUser('ana@test.com');
      const other = await registerUser('otro@test.com');
      const { tenantId: foreignTenant } = (
        await me(other.access_token).expect(200)
      ).body;

      await refresh(ana.refresh_token, foreignTenant).expect(403);
      await refresh(ana.refresh_token).expect(200); // sigue siendo válido
    });
  });

  describe('logout', () => {
    it('POST /auth/logout revoca la sesión y es idempotente', async () => {
      const { refresh_token } = await registerUser('ana@test.com');

      await api()
        .post('/auth/logout')
        .send({ refreshToken: refresh_token })
        .expect(204);
      await refresh(refresh_token).expect(401);

      await api()
        .post('/auth/logout')
        .send({ refreshToken: refresh_token })
        .expect(204);
      await api()
        .post('/auth/logout')
        .send({ refreshToken: 'desconocido' })
        .expect(204);
      await api().post('/auth/logout').send({}).expect(400);
    });

    it('logout cierra solo esa sesión; logout-all cierra todas', async () => {
      await registerUser('ana@test.com');
      const a = await login('ana@test.com');
      const b = await login('ana@test.com');

      await api()
        .post('/auth/logout')
        .send({ refreshToken: a.refresh_token })
        .expect(204);
      await refresh(a.refresh_token).expect(401);
      const b2 = (await refresh(b.refresh_token).expect(200)).body; // la otra sesión sigue viva

      await api().post('/auth/logout-all').expect(401);
      await api()
        .post('/auth/logout-all')
        .set(bearer(b2.access_token))
        .expect(204);
      await refresh(b2.refresh_token).expect(401);
    });
  });
});
