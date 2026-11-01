import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { I18nValidationExceptionFilter, I18nValidationPipe } from 'nestjs-i18n';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

describe('Issues (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const me = (token: string) => api().get('/auth/me').set(bearer(token));

  const registerUser = async (email: string) =>
    (
      await api()
        .post('/auth/register')
        .send({ tenantName: `Org de ${email}`, email, password: '12345678' })
        .expect(201)
    ).body.access_token as string;

  const createProject = (token: string, name: string, key: string) =>
    api().post('/projects').set(bearer(token)).send({ name, key });

  const createIssue = (token: string, body: Record<string, unknown>) =>
    api().post('/issues').set(bearer(token)).send(body);

  /** Org A (admin + Ana como miembro) y org B (admin), con un proyecto en cada una */
  const setup = async () => {
    const adminA = await registerUser('admin-a@test.com');
    const adminB = await registerUser('admin-b@test.com');
    const anaOwn = await registerUser('ana@test.com');

    const { tenantId: tenantA } = (await me(adminA).expect(200)).body;
    const { tenantId: tenantB, sub: adminBId } = (await me(adminB).expect(200))
      .body;
    const { sub: anaId } = (await me(anaOwn).expect(200)).body;

    await api()
      .post('/tenants/current/members')
      .set(bearer(adminA))
      .send({ email: 'ana@test.com' })
      .expect(201);
    const memberA = (
      await api()
        .post('/auth/switch-tenant')
        .set(bearer(anaOwn))
        .send({ tenantId: tenantA })
        .expect(200)
    ).body.access_token as string;

    const projectA = (await createProject(adminA, 'Tickr', 'TKR').expect(201))
      .body.id as string;
    const projectB = (await createProject(adminB, 'Otro', 'OTR').expect(201))
      .body.id as string;

    return {
      adminA,
      adminB,
      memberA,
      anaId,
      adminBId,
      tenantA,
      tenantB,
      projectA,
      projectB,
    };
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
    await prisma.issue.deleteMany();
    await prisma.project.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 401 sin token', async () => {
    await api().get('/issues').expect(401);
  });

  describe('creación y numeración', () => {
    it('un miembro crea incidencias con clave secuencial', async () => {
      const { memberA, anaId, projectA } = await setup();

      const first = await createIssue(memberA, {
        projectId: projectA,
        title: 'Primera',
      }).expect(201);
      expect(first.body).toMatchObject({
        key: 'TKR-1',
        number: 1,
        status: 'OPEN',
        priority: 'MEDIUM',
        reporterId: anaId,
        assigneeId: null,
      });

      const second = await createIssue(memberA, {
        projectId: projectA,
        title: 'Segunda',
      }).expect(201);
      expect(second.body).toMatchObject({ key: 'TKR-2', number: 2 });
    });

    it('la numeración es independiente en cada proyecto', async () => {
      const { adminA, projectA } = await setup();
      const web = (await createProject(adminA, 'Web', 'WEB').expect(201)).body
        .id as string;

      await createIssue(adminA, { projectId: projectA, title: 'Una' }).expect(
        201,
      );
      const inWeb = await createIssue(adminA, {
        projectId: web,
        title: 'Otra',
      }).expect(201);

      expect(inWeb.body.key).toBe('WEB-1');
    });

    it('no duplica números cuando se crean varias a la vez', async () => {
      const { adminA, projectA } = await setup();

      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          createIssue(adminA, {
            projectId: projectA,
            title: `Incidencia ${i}`,
          }),
        ),
      );

      results.forEach((r) => expect(r.status).toBe(201));
      const numbers = results
        .map((r) => r.body.number as number)
        .sort((a, b) => a - b);
      expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('responde 404 si el proyecto no existe', async () => {
      const { adminA } = await setup();

      await createIssue(adminA, {
        projectId: '00000000-0000-4000-8000-000000000000',
        title: 'Huérfana',
      }).expect(404);
    });

    it('valida el cuerpo y traduce los errores', async () => {
      const { adminA, projectA } = await setup();

      await createIssue(adminA, { projectId: projectA, title: 'ab' }).expect(
        400,
      );
      await createIssue(adminA, {
        projectId: projectA,
        title: 'Válida',
        priority: 'EXTREME',
      }).expect(400);
      await createIssue(adminA, {
        projectId: 'no-es-uuid',
        title: 'Válida',
      }).expect(400);

      const res = await createIssue(adminA, {
        projectId: projectA,
        title: 'ab',
      })
        .set('Accept-Language', 'es')
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('al menos 3 caracteres');
    });
  });

  describe('responsable', () => {
    it('solo acepta como responsable a miembros de la organización', async () => {
      const { adminA, projectA, anaId, adminBId } = await setup();

      await createIssue(adminA, {
        projectId: projectA,
        title: 'Ajena',
        assigneeId: adminBId,
      }).expect(400);

      const ok = await createIssue(adminA, {
        projectId: projectA,
        title: 'Propia',
        assigneeId: anaId,
      }).expect(201);
      expect(ok.body.assigneeId).toBe(anaId);
    });

    it('al quitar a un miembro se le desasignan sus incidencias', async () => {
      const { adminA, projectA, anaId } = await setup();
      const { id } = (
        await createIssue(adminA, {
          projectId: projectA,
          title: 'Con responsable',
          assigneeId: anaId,
        }).expect(201)
      ).body;

      await api()
        .delete(`/tenants/current/members/${anaId}`)
        .set(bearer(adminA))
        .expect(204);

      const issue = await api()
        .get(`/issues/${id}`)
        .set(bearer(adminA))
        .expect(200);
      expect(issue.body.assigneeId).toBeNull();
    });
  });

  describe('listado', () => {
    it('filtra y pagina', async () => {
      const { adminA, projectA, anaId } = await setup();
      const web = (await createProject(adminA, 'Web', 'WEB').expect(201)).body
        .id as string;

      const one = (
        await createIssue(adminA, {
          projectId: projectA,
          title: 'Uno',
          priority: 'LOW',
        }).expect(201)
      ).body;
      await createIssue(adminA, {
        projectId: projectA,
        title: 'Dos',
        priority: 'HIGH',
      }).expect(201);
      await createIssue(adminA, {
        projectId: projectA,
        title: 'Tres',
        priority: 'HIGH',
        assigneeId: anaId,
      }).expect(201);
      await createIssue(adminA, { projectId: web, title: 'Cuatro' }).expect(
        201,
      );
      await api()
        .patch(`/issues/${one.id}`)
        .set(bearer(adminA))
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      const list = (query: string) =>
        api().get(`/issues?${query}`).set(bearer(adminA)).expect(200);

      expect((await list('')).body.meta.total).toBe(4);
      expect((await list(`projectId=${projectA}`)).body.meta.total).toBe(3);
      expect((await list('status=IN_PROGRESS')).body.meta.total).toBe(1);
      expect((await list('priority=HIGH')).body.meta.total).toBe(2);
      expect((await list(`assigneeId=${anaId}`)).body.meta.total).toBe(1);

      const page = await list(`projectId=${projectA}&page=2&limit=2`);
      expect(page.body.data).toHaveLength(1);
      expect(page.body.meta).toEqual({ total: 3, page: 2, limit: 2 });

      await api().get('/issues?status=NOPE').set(bearer(adminA)).expect(400);
    });
  });

  describe('edición y borrado', () => {
    it('un miembro edita campos; number y key no cambian', async () => {
      const { memberA, projectA, anaId } = await setup();
      const { id } = (
        await createIssue(memberA, {
          projectId: projectA,
          title: 'Original',
        }).expect(201)
      ).body;

      const res = await api()
        .patch(`/issues/${id}`)
        .set(bearer(memberA))
        .send({
          title: 'Nuevo título',
          status: 'CLOSED',
          priority: 'URGENT',
          assigneeId: anaId,
          number: 99,
          key: 'ZZ-9',
        })
        .expect(200);

      expect(res.body).toMatchObject({
        title: 'Nuevo título',
        status: 'CLOSED',
        priority: 'URGENT',
        assigneeId: anaId,
        number: 1,
        key: 'TKR-1',
      });
    });

    it('assigneeId null quita al responsable', async () => {
      const { adminA, projectA, anaId } = await setup();
      const { id } = (
        await createIssue(adminA, {
          projectId: projectA,
          title: 'Asignada',
          assigneeId: anaId,
        }).expect(201)
      ).body;

      const res = await api()
        .patch(`/issues/${id}`)
        .set(bearer(adminA))
        .send({ assigneeId: null })
        .expect(200);
      expect(res.body.assigneeId).toBeNull();
    });

    it('solo un admin puede borrar', async () => {
      const { adminA, memberA, projectA } = await setup();
      const { id } = (
        await createIssue(memberA, {
          projectId: projectA,
          title: 'Borrable',
        }).expect(201)
      ).body;

      await api().delete(`/issues/${id}`).set(bearer(memberA)).expect(403);
      await api().delete(`/issues/${id}`).set(bearer(adminA)).expect(204);
      await api().get(`/issues/${id}`).set(bearer(adminA)).expect(404);
    });
  });

  describe('aislamiento entre organizaciones', () => {
    it('otra organización no ve, edita ni borra la incidencia', async () => {
      const { adminA, adminB, projectA } = await setup();
      const { id } = (
        await createIssue(adminA, {
          projectId: projectA,
          title: 'Privada',
        }).expect(201)
      ).body;

      const list = await api().get('/issues').set(bearer(adminB)).expect(200);
      expect(list.body.data).toEqual([]);
      const byProject = await api()
        .get(`/issues?projectId=${projectA}`)
        .set(bearer(adminB))
        .expect(200);
      expect(byProject.body.data).toEqual([]);

      await api().get(`/issues/${id}`).set(bearer(adminB)).expect(404);
      await api()
        .patch(`/issues/${id}`)
        .set(bearer(adminB))
        .send({ title: 'hack' })
        .expect(404);
      await api().delete(`/issues/${id}`).set(bearer(adminB)).expect(404);

      const intact = await prisma.issue.findUniqueOrThrow({ where: { id } });
      expect(intact.title).toBe('Privada');
    });

    it('no se pueden crear incidencias en un proyecto de otra organización', async () => {
      const { adminB, projectA } = await setup();

      await createIssue(adminB, {
        projectId: projectA,
        title: 'Intrusa',
      }).expect(404);
      expect(await prisma.issue.count()).toBe(0);
    });

    it('la base de datos rechaza una incidencia que cruce organizaciones', async () => {
      const { projectA, tenantB, adminBId } = await setup();

      // Escritura directa, sin pasar por la aplicación: la clave compuesta (tenantId, projectId) lo impide
      await expect(
        prisma.issue.create({
          data: {
            tenantId: tenantB,
            projectId: projectA,
            number: 1,
            title: 'Cruzada',
            reporterId: adminBId,
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('búsqueda de texto (?q=)', () => {
    const search = (
      token: string,
      q: string,
      extra: Record<string, string> = {},
    ) =>
      api()
        .get('/issues')
        .query({ q, ...extra })
        .set(bearer(token));

    const keysOf = (res: { body: { data: { key: string }[] } }) =>
      res.body.data.map((issue) => issue.key).sort();

    /** TKR-1 a TKR-4 */
    const seed = async (token: string, projectId: string) => {
      await createIssue(token, {
        projectId,
        title: 'Error de login en móvil',
        description: 'Falla al iniciar sesión',
      }).expect(201);
      await createIssue(token, {
        projectId,
        title: 'Subida al 100% completada',
      }).expect(201);
      await createIssue(token, {
        projectId,
        title: 'Revisar snake_case en la API',
        description: 'Nombres de campos',
      }).expect(201);
      await createIssue(token, {
        projectId,
        title: 'Diseñar pantalla de inicio',
        description: 'Incluye el LOGIN social',
      }).expect(201);
    };

    it('busca en título y descripción sin distinguir mayúsculas', async () => {
      const { adminA, projectA } = await setup();
      await seed(adminA, projectA);

      const res = await search(adminA, 'login').expect(200);

      expect(keysOf(res)).toEqual(['TKR-1', 'TKR-4']);
      expect(res.body.meta.total).toBe(2);
    });

    it('exige todas las palabras, cada una en el título o en la descripción', async () => {
      const { adminA, projectA } = await setup();
      await seed(adminA, projectA);

      expect(keysOf(await search(adminA, 'login móvil').expect(200))).toEqual([
        'TKR-1',
      ]);
      expect(keysOf(await search(adminA, 'login sesión').expect(200))).toEqual([
        'TKR-1',
      ]);
      expect(
        (await search(adminA, 'login inexistente').expect(200)).body.meta.total,
      ).toBe(0);
    });

    it('encuentra por la clave visible, en cualquier capitalización', async () => {
      const { adminA, projectA } = await setup();
      await seed(adminA, projectA);

      expect(keysOf(await search(adminA, 'tkr-2').expect(200))).toEqual([
        'TKR-2',
      ]);
      expect(keysOf(await search(adminA, 'TKR-3').expect(200))).toEqual([
        'TKR-3',
      ]);
      expect((await search(adminA, 'TKR-99').expect(200)).body.meta.total).toBe(
        0,
      );
    });

    it('trata % y _ como texto literal, no como comodines', async () => {
      const { adminA, projectA } = await setup();
      await seed(adminA, projectA);

      expect(keysOf(await search(adminA, '%').expect(200))).toEqual(['TKR-2']);
      expect(keysOf(await search(adminA, '_').expect(200))).toEqual(['TKR-3']);
      expect(keysOf(await search(adminA, 'snake_').expect(200))).toEqual([
        'TKR-3',
      ]);
      expect((await search(adminA, 'snake%').expect(200)).body.meta.total).toBe(
        0,
      );
    });

    it('se combina con otros filtros y con la paginación', async () => {
      const { adminA, projectA } = await setup();
      await seed(adminA, projectA);
      const first = (await search(adminA, 'tkr-1').expect(200)).body.data[0];
      await api()
        .patch(`/issues/${first.id}`)
        .set(bearer(adminA))
        .send({ status: 'CLOSED' })
        .expect(200);

      const closed = await search(adminA, 'login', { status: 'CLOSED' }).expect(
        200,
      );
      expect(keysOf(closed)).toEqual(['TKR-1']);

      const page = await search(adminA, 'login', {
        limit: '1',
        page: '2',
      }).expect(200);
      expect(page.body.data).toHaveLength(1);
      expect(page.body.meta).toEqual({ total: 2, page: 2, limit: 1 });
    });

    it('un q vacío o con solo espacios no filtra', async () => {
      const { adminA, projectA } = await setup();
      await seed(adminA, projectA);

      expect((await search(adminA, '').expect(200)).body.meta.total).toBe(4);
      expect((await search(adminA, '   ').expect(200)).body.meta.total).toBe(4);
    });

    it('valida el texto de búsqueda y traduce el error', async () => {
      const { adminA } = await setup();

      await search(adminA, 'x'.repeat(101)).expect(400);
      await api().get('/issues?q=a&q=b').set(bearer(adminA)).expect(400);

      const res = await search(adminA, 'x'.repeat(101))
        .set('Accept-Language', 'es')
        .expect(400);
      expect(JSON.stringify(res.body)).toContain(
        'no puede superar los 100 caracteres',
      );
    });

    it('nunca devuelve resultados de otra organización', async () => {
      const { adminA, adminB, projectA, projectB } = await setup();
      await seed(adminA, projectA);
      await createIssue(adminB, {
        projectId: projectB,
        title: 'Error de login en OTR',
      }).expect(201);

      expect(keysOf(await search(adminA, 'login').expect(200))).toEqual([
        'TKR-1',
        'TKR-4',
      ]);
      expect(keysOf(await search(adminB, 'login').expect(200))).toEqual([
        'OTR-1',
      ]);
      expect((await search(adminA, 'OTR-1').expect(200)).body.meta.total).toBe(
        0,
      );
    });
  });
});
