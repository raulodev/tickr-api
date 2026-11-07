import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { setupApp } from '../../src/setup-app.js';
import { overrideAuthMail } from '../e2e-test-helpers.js';

describe('Tenants y membresías (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const me = (token: string) => api().get('/api/auth/me').set(bearer(token));

  const registerUser = async (email: string) => {
    await api()
      .post('/api/auth/register')
      .send({ tenantName: `Org de ${email}`, email, password: '12345678' })
      .expect(201);
    await prisma.user.update({
      where: { email },
      data: { emailVerifiedAt: new Date() },
    });
    const login = await api()
      .post('/api/auth/login')
      .send({ email, password: '12345678' })
      .expect(200);
    return login.body.access_token as string;
  };

  beforeAll(async () => {
    const moduleRef = await overrideAuthMail(
      Test.createTestingModule({
        imports: [AppModule],
      }),
    ).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.issue.deleteMany();
    await prisma.project.deleteMany();
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
      .post('/api/tenants/current/members')
      .set(bearer(adminToken))
      .send({ email: 'ana@test.com' })
      .expect(201);

    const anaToken = (
      await api()
        .post('/api/auth/switch-tenant')
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

    await prisma.user.update({
      where: { email: 'ana@test.com' },
      data: { emailVerifiedAt: new Date() },
    });
    const login = await api()
      .post('/api/auth/login')
      .send({ email: 'ana@test.com', password: '12345678' })
      .expect(200);
    expect(login.body.organizations).toHaveLength(2);
  });

  it('responde 404 si el correo no está registrado y 409 si ya es miembro', async () => {
    const { adminToken } = await setup();

    await api()
      .post('/api/tenants/current/members')
      .set(bearer(adminToken))
      .send({ email: 'nadie@test.com' })
      .expect(404);
    await api()
      .post('/api/tenants/current/members')
      .set(bearer(adminToken))
      .send({ email: 'ana@test.com' })
      .expect(409);
  });

  it('un miembro sin rol admin no puede añadir ni quitar miembros', async () => {
    const { anaToken, anaId } = await setup();

    await api()
      .post('/api/tenants/current/members')
      .set(bearer(anaToken))
      .send({ email: 'admin@test.com' })
      .expect(403);
    await api()
      .delete(`/api/tenants/current/members/${anaId}`)
      .set(bearer(anaToken))
      .expect(403);
  });

  it('revocación: al quitar a un miembro, su token deja de funcionar de inmediato', async () => {
    const { adminToken, anaToken, anaId } = await setup();
    await me(anaToken).expect(200);

    await api()
      .delete(`/api/tenants/current/members/${anaId}`)
      .set(bearer(adminToken))
      .expect(204);

    await me(anaToken).expect(401);
  });

  it('no permite quitar al último administrador', async () => {
    const { adminToken } = await setup();
    const { sub: adminId } = (await me(adminToken).expect(200)).body;

    await api()
      .delete(`/api/tenants/current/members/${adminId}`)
      .set(bearer(adminToken))
      .expect(409);
  });

  it('un usuario existente crea otra organización y recibe un token de ella', async () => {
    const token = await registerUser('ana@test.com');
    const { tenantId: firstTenant } = (await me(token).expect(200)).body;

    const res = await api()
      .post('/api/tenants')
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

  describe('PATCH /tenants/current/members/:userId (cambio de rol)', () => {
    const changeRole = (token: string, userId: string, role?: unknown) =>
      api()
        .patch(`/api/tenants/current/members/${userId}`)
        .set(bearer(token))
        .send(role === undefined ? {} : { role });

    const addMember = (token: string) =>
      api()
        .post('/api/tenants/current/members')
        .set(bearer(token))
        .send({ email: 'nadie@test.com' });

    const adminIdOf = async (token: string) =>
      (await me(token).expect(200)).body.sub as string;

    it('un admin promueve a un miembro y este obtiene permisos de inmediato', async () => {
      const { adminToken, anaToken, anaId } = await setup();
      await addMember(anaToken).expect(403); // como MEMBER no puede añadir miembros

      const res = await changeRole(adminToken, anaId, 'ADMIN').expect(200);
      expect(res.body).toMatchObject({
        userId: anaId,
        email: 'ana@test.com',
        role: 'ADMIN',
      });

      // El mismo token ahora pasa el control de rol: llega al servicio, que no encuentra el correo (404)
      await addMember(anaToken).expect(404);
    });

    it('degradar a un admin le quita los permisos de inmediato', async () => {
      const { adminToken, anaToken, anaId } = await setup();
      await changeRole(adminToken, anaId, 'ADMIN').expect(200);
      await addMember(anaToken).expect(404);

      const res = await changeRole(adminToken, anaId, 'MEMBER').expect(200);
      expect(res.body.role).toBe('MEMBER');

      await addMember(anaToken).expect(403);
    });

    it('no permite degradar al último administrador', async () => {
      const { adminToken, tenantId } = await setup();
      const adminId = await adminIdOf(adminToken);

      await changeRole(adminToken, adminId, 'MEMBER').expect(409);

      const membership = await prisma.membership.findFirstOrThrow({
        where: { userId: adminId, tenantId },
      });
      expect(membership.role).toBe('ADMIN');
    });

    it('es idempotente: pedir el rol actual responde 200 sin cambios', async () => {
      const { adminToken, anaId } = await setup();

      const res = await changeRole(adminToken, anaId, 'MEMBER').expect(200);
      expect(res.body.role).toBe('MEMBER');
    });

    it('un miembro sin rol admin no puede cambiar roles, ni siquiera el suyo', async () => {
      const { anaToken, anaId, tenantId } = await setup();

      await changeRole(anaToken, anaId, 'ADMIN').expect(403);

      const membership = await prisma.membership.findFirstOrThrow({
        where: { userId: anaId, tenantId },
      });
      expect(membership.role).toBe('MEMBER');
    });

    it('responde 404 si el usuario no es miembro de la organización', async () => {
      const { adminToken } = await setup();
      const stranger = await registerUser('otro@test.com'); // existe, pero en otra organización
      const { sub: strangerId } = (await me(stranger).expect(200)).body;

      await changeRole(adminToken, strangerId, 'ADMIN').expect(404);
      await changeRole(
        adminToken,
        '00000000-0000-4000-8000-000000000000',
        'ADMIN',
      ).expect(404);
    });

    it('valida el rol y el identificador', async () => {
      const { adminToken, anaId } = await setup();

      await changeRole(adminToken, anaId, 'SUPERADMIN').expect(400);
      await changeRole(adminToken, anaId).expect(400);
      await changeRole(adminToken, 'no-es-uuid', 'ADMIN').expect(400);
    });

    it('otra organización no puede cambiar los roles de esta', async () => {
      const { anaId } = await setup();
      const adminB = await registerUser('admin-b@test.com');

      await changeRole(adminB, anaId, 'ADMIN').expect(404);
    });

    it('dos admins que se degradan a la vez nunca dejan la organización sin administrador', async () => {
      const { adminToken, anaToken, anaId, tenantId } = await setup();
      const adminId = await adminIdOf(adminToken);
      await changeRole(adminToken, anaId, 'ADMIN').expect(200);

      const results = await Promise.all([
        changeRole(adminToken, anaId, 'MEMBER'),
        changeRole(anaToken, adminId, 'MEMBER'),
      ]);

      // Una prospera; la otra recibe 409 (último admin) o 403 (ya la habían degradado)
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      results
        .filter((r) => r.status !== 200)
        .forEach((r) => expect([403, 409]).toContain(r.status));
      expect(
        await prisma.membership.count({ where: { tenantId, role: 'ADMIN' } }),
      ).toBe(1);
    });

    it('dos admins que se expulsan a la vez nunca dejan la organización sin administrador', async () => {
      const { adminToken, anaToken, anaId, tenantId } = await setup();
      const adminId = await adminIdOf(adminToken);
      await changeRole(adminToken, anaId, 'ADMIN').expect(200);

      const results = await Promise.all([
        api()
          .delete(`/api/tenants/current/members/${anaId}`)
          .set(bearer(adminToken)),
        api()
          .delete(`/api/tenants/current/members/${adminId}`)
          .set(bearer(anaToken)),
      ]);

      expect(results.filter((r) => r.status === 204)).toHaveLength(1);
      expect(
        await prisma.membership.count({ where: { tenantId, role: 'ADMIN' } }),
      ).toBe(1);
    });
  });
});
