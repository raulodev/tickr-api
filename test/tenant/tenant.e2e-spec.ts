import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

describe('Tenants y membresías (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const me = (token: string) => api().get('/auth/me').set(bearer(token));

  const registerUser = async (email: string) => {
    const res = await api()
      .post('/auth/register')
      .send({ tenantName: `Org de ${email}`, email, password: '12345678' })
      .expect(201);
    return res.body.access_token as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.membership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  /** Admin con organización + usuario Ana ya añadida como MEMBER y con token de esa organización */
  const setup = async () => {
    const adminToken = await registerUser('admin@test.com');
    const anaOwnToken = await registerUser('ana@test.com');
    const { tenantId } = (await me(adminToken).expect(200)).body;
    const { sub: anaId } = (await me(anaOwnToken).expect(200)).body;

    await api()
      .post('/tenants/current/members')
      .set(bearer(adminToken))
      .send({ email: 'ana@test.com' })
      .expect(201);

    const anaToken = (
      await api()
        .post('/auth/switch-tenant')
        .set(bearer(anaOwnToken))
        .send({ tenantId })
        .expect(200)
    ).body.access_token as string;

    return { adminToken, anaToken, anaOwnToken, anaId, tenantId };
  };

  it('un admin añade a un usuario registrado y este puede cambiar a la organización', async () => {
    const { anaToken, tenantId } = await setup();

    const res = await me(anaToken).expect(200);
    expect(res.body).toMatchObject({ tenantId, role: 'MEMBER' });

    const login = await api()
      .post('/auth/login')
      .send({ email: 'ana@test.com', password: '12345678' })
      .expect(200);
    expect(login.body.organizations).toHaveLength(2);
  });

  it('responde 404 si el correo no está registrado y 409 si ya es miembro', async () => {
    const { adminToken } = await setup();

    await api()
      .post('/tenants/current/members')
      .set(bearer(adminToken))
      .send({ email: 'nadie@test.com' })
      .expect(404);
    await api()
      .post('/tenants/current/members')
      .set(bearer(adminToken))
      .send({ email: 'ana@test.com' })
      .expect(409);
  });

  it('un miembro sin rol admin no puede añadir ni quitar miembros', async () => {
    const { anaToken, anaId } = await setup();

    await api()
      .post('/tenants/current/members')
      .set(bearer(anaToken))
      .send({ email: 'admin@test.com' })
      .expect(403);
    await api()
      .delete(`/tenants/current/members/${anaId}`)
      .set(bearer(anaToken))
      .expect(403);
  });

  it('revocación: al quitar a un miembro, su token deja de funcionar de inmediato', async () => {
    const { adminToken, anaToken, anaId } = await setup();
    await me(anaToken).expect(200);

    await api()
      .delete(`/tenants/current/members/${anaId}`)
      .set(bearer(adminToken))
      .expect(204);

    await me(anaToken).expect(401);
  });

  it('no permite quitar al último administrador', async () => {
    const { adminToken } = await setup();
    const { sub: adminId } = (await me(adminToken).expect(200)).body;

    await api()
      .delete(`/tenants/current/members/${adminId}`)
      .set(bearer(adminToken))
      .expect(409);
  });

  it('un usuario existente crea otra organización y recibe un token de ella', async () => {
    const token = await registerUser('ana@test.com');
    const { tenantId: firstTenant } = (await me(token).expect(200)).body;

    const res = await api()
      .post('/tenants')
      .set(bearer(token))
      .send({ name: 'Segunda Org' })
      .expect(201);

    expect(res.body.organization).toMatchObject({
      name: 'Segunda Org',
      role: 'ADMIN',
    });
    const second = await me(res.body.access_token).expect(200);
    expect(second.body.tenantId).not.toBe(firstTenant);
    expect(second.body.role).toBe('ADMIN');
  });
});
