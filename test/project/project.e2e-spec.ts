import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { I18nValidationExceptionFilter, I18nValidationPipe } from 'nestjs-i18n';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

describe('Projects (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  const registerUser = async (email: string) =>
    (
      await api()
        .post('/api/auth/register')
        .send({ tenantName: `Org de ${email}`, email, password: '12345678' })
        .expect(201)
    ).body.access_token as string;

  const createProject = (token: string, name = 'Tickr', key = 'TKR') =>
    api().post('/api/projects').set(bearer(token)).send({ name, key });

  /** Dos organizaciones, y un miembro sin rol admin en la A */
  const setup = async () => {
    const adminA = await registerUser('admin-a@test.com');
    const adminB = await registerUser('admin-b@test.com');
    const anaOwn = await registerUser('ana@test.com');

    const { tenantId } = (
      await api().get('/api/auth/me').set(bearer(adminA)).expect(200)
    ).body;
    await api()
      .post('/api/tenants/current/members')
      .set(bearer(adminA))
      .send({ email: 'ana@test.com' })
      .expect(201);
    const memberA = (
      await api()
        .post('/api/auth/switch-tenant')
        .set(bearer(anaOwn))
        .send({ tenantId })
        .expect(200)
    ).body.access_token as string;

    return { adminA, adminB, memberA };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new I18nValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new I18nValidationExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.project.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 401 sin token', async () => {
    await api().get('/api/projects').expect(401);
  });

  it('un admin crea un proyecto y la clave se normaliza a mayúsculas', async () => {
    const { adminA } = await setup();

    const res = await createProject(adminA, 'Tickr', 'tkr').expect(201);
    expect(res.body).toMatchObject({ name: 'Tickr', key: 'TKR' });

    const list = await api()
      .get('/api/projects')
      .set(bearer(adminA))
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta).toEqual({ total: 1, page: 1, limit: 20 });
  });

  it('rechaza claves duplicadas en la misma organización, pero no en otra', async () => {
    const { adminA, adminB } = await setup();

    await createProject(adminA).expect(201);
    await createProject(adminA, 'Otro', 'TKR').expect(409);
    await createProject(adminB).expect(201);
  });

  it('valida el cuerpo y traduce los errores', async () => {
    const { adminA } = await setup();

    const res = await createProject(adminA, 'Tickr', 'a b')
      .set('Accept-Language', 'es')
      .expect(400);
    expect(JSON.stringify(res.body)).toContain('letras mayúsculas');
  });

  it('un miembro puede ver proyectos, pero no crear, editar ni borrar', async () => {
    const { adminA, memberA } = await setup();
    const { id } = (await createProject(adminA).expect(201)).body;

    await api().get('/api/projects').set(bearer(memberA)).expect(200);
    await api().get(`/api/projects/${id}`).set(bearer(memberA)).expect(200);
    await createProject(memberA, 'X', 'XX').expect(403);
    await api()
      .patch(`/api/projects/${id}`)
      .set(bearer(memberA))
      .send({ name: 'Nuevo' })
      .expect(403);
    await api().delete(`/api/projects/${id}`).set(bearer(memberA)).expect(403);
  });

  it('actualiza el nombre pero nunca la clave', async () => {
    const { adminA } = await setup();
    const { id } = (await createProject(adminA).expect(201)).body;

    const res = await api()
      .patch(`/api/projects/${id}`)
      .set(bearer(adminA))
      .send({ name: 'Renombrado', key: 'ZZ' })
      .expect(200);

    expect(res.body).toMatchObject({ name: 'Renombrado', key: 'TKR' });
  });

  it('elimina un proyecto', async () => {
    const { adminA } = await setup();
    const { id } = (await createProject(adminA).expect(201)).body;

    await api().delete(`/api/projects/${id}`).set(bearer(adminA)).expect(204);
    await api().get(`/api/projects/${id}`).set(bearer(adminA)).expect(404);
  });

  it('pagina los resultados', async () => {
    const { adminA } = await setup();
    for (const key of ['AA', 'BB', 'CC']) {
      await createProject(adminA, `Proyecto ${key}`, key).expect(201);
    }

    const res = await api()
      .get('/api/projects?page=2&limit=2')
      .set(bearer(adminA))
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toEqual({ total: 3, page: 2, limit: 2 });

    await api().get('/api/projects?limit=1000').set(bearer(adminA)).expect(400);
  });

  describe('aislamiento entre organizaciones', () => {
    it('otra organización no ve, edita ni borra el proyecto', async () => {
      const { adminA, adminB } = await setup();
      const { id } = (await createProject(adminA).expect(201)).body;

      const list = await api()
        .get('/api/projects')
        .set(bearer(adminB))
        .expect(200);
      expect(list.body.data).toEqual([]);

      await api().get(`/api/projects/${id}`).set(bearer(adminB)).expect(404);
      await api()
        .patch(`/api/projects/${id}`)
        .set(bearer(adminB))
        .send({ name: 'hack' })
        .expect(404);
      await api().delete(`/api/projects/${id}`).set(bearer(adminB)).expect(404);

      const intact = await prisma.project.findUniqueOrThrow({ where: { id } });
      expect(intact.name).toBe('Tickr');
    });

    it('un id ajeno responde igual que uno inexistente (no revela que existe)', async () => {
      const { adminA, adminB } = await setup();
      const { id } = (await createProject(adminA).expect(201)).body;

      const foreign = await api()
        .get(`/api/projects/${id}`)
        .set(bearer(adminB))
        .expect(404);
      const missing = await api()
        .get('/api/projects/00000000-0000-4000-8000-000000000000')
        .set(bearer(adminB))
        .expect(404);
      expect(foreign.body).toEqual(missing.body);
    });
  });
});
