import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { hashToken } from '../../src/auth/refresh-token.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { setupApp } from '../../src/setup-app.js';

const { getProvider, isCredentialsValid } = vi.hoisted(() => {
  const isCredentialsValid = vi.fn();
  return {
    isCredentialsValid,
    getProvider: vi.fn(() => ({ isCredentialsValid })),
  };
});

vi.mock('../../src/auth/providers/auth-provider.factory.js', () => ({
  AuthProviderFactory: { getProvider },
}));

describe('Refresh tokens (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const api = () => request(app.getHttpServer());
  const refresh = (refreshToken: string, tenantId?: string) =>
    api().post('/api/auth/refresh').send({ refreshToken, tenantId });
  const login = async (email: string) =>
    (
      await api()
        .post('/api/auth/login')
        .send({
          email,
          provider: 'GITHUB',
          oAuthToken: 'mock-oauth-token',
          name: 'Test User',
        })
        .expect(200)
    ).body;

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
    vi.resetAllMocks();
    getProvider.mockReturnValue({ isCredentialsValid });
    isCredentialsValid.mockResolvedValue(true);
    await prisma.issueEvent.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.issue.deleteMany();
    await prisma.project.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('guarda el refresh token como hash y lo rota por un token nuevo', async () => {
    const session = await login('ana@test.com');

    expect(
      await prisma.refreshToken.findUnique({
        where: { tokenHash: session.refresh_token },
      }),
    ).toBeNull();
    expect(
      await prisma.refreshToken.findUnique({
        where: { tokenHash: hashToken(session.refresh_token) },
      }),
    ).not.toBeNull();

    const refreshed = await refresh(session.refresh_token).expect(200);

    expect(refreshed.body.access_token).toEqual(expect.any(String));
    expect(refreshed.body.refresh_token).toEqual(expect.any(String));
    expect(refreshed.body.refresh_token).not.toBe(session.refresh_token);
    await refresh(refreshed.body.refresh_token).expect(200);
  });

  it('al reutilizar un token revoca todos los tokens de su familia', async () => {
    const session = await login('ana@test.com');
    const firstRefresh = await refresh(session.refresh_token).expect(200);

    await refresh(session.refresh_token).expect(401);
    await refresh(firstRefresh.body.refresh_token).expect(401);
  });

  it('rechaza tokens desconocidos, expirados y cuerpos inválidos', async () => {
    await refresh('unknown-token').expect(401);
    await api().post('/api/auth/refresh').send({}).expect(400);

    const session = await login('ana@test.com');
    await refresh(session.refresh_token, 'not-a-uuid').expect(400);
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(session.refresh_token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await refresh(session.refresh_token).expect(401);
  });

  it('permite renovar la sesión si la organización indicada pertenece al usuario', async () => {
    const session = await login('ana@test.com');
    const tenantId = session.organizations[0].id as string;

    const refreshed = await refresh(session.refresh_token, tenantId).expect(
      200,
    );
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'ana@test.com' },
      include: { memberships: true },
    });
    expect(user.memberships[0].tenantId).toBe(tenantId);
    expect(refreshed.body.access_token).toEqual(expect.any(String));
  });
});
