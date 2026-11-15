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

describe('Auth login (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const api = () => request(app.getHttpServer());
  const login = (body: object) => api().post('/api/auth/login').send(body);
  const credentials = {
    email: 'ana@test.com',
    provider: 'GITHUB',
    oAuthToken: 'mock-oauth-token',
    name: 'Ana',
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

  it('crea una cuenta y devuelve tokens y la organización inicial', async () => {
    const response = await login(credentials).expect(200);

    expect(getProvider).toHaveBeenCalledWith('GITHUB');
    expect(isCredentialsValid).toHaveBeenCalledWith({
      oAuthToken: credentials.oAuthToken,
      email: credentials.email,
    });
    expect(response.body).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      organizations: [
        {
          id: expect.any(String),
          name: expect.any(String),
          slug: expect.any(String),
          role: 'ADMIN',
        },
      ],
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: credentials.email },
      include: { memberships: { include: { tenant: true } } },
    });
    expect(user.name).toBe('Ana');
    expect(user.memberships).toHaveLength(1);
    expect(user.memberships[0].tenant.id).toBe(
      response.body.organizations[0].id,
    );
  });

  it('crea una sola cuenta al iniciar sesión de nuevo', async () => {
    await login(credentials).expect(200);
    const secondLogin = await login(credentials).expect(200);

    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.tenant.count()).toBe(1);
    expect(secondLogin.body.refresh_token).toEqual(expect.any(String));
  });

  it('rechaza credenciales que el proveedor no valida y no crea una cuenta', async () => {
    isCredentialsValid.mockResolvedValue(false);

    await login(credentials).expect(403);

    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.tenant.count()).toBe(0);
  });

  it('rechaza un cuerpo de login inválido', async () => {
    await login({ email: 'invalid-email' }).expect(400);

    expect(await prisma.user.count()).toBe(0);
  });

  it('el access token permite consultar la identidad y organización de la sesión', async () => {
    const { body } = await login(credentials).expect(200);

    const response = await api()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.access_token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      sub: expect.any(String),
      tenantId: body.organizations[0].id,
      role: 'ADMIN',
    });
  });
});
