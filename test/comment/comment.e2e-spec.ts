import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { I18nValidationExceptionFilter, I18nValidationPipe } from 'nestjs-i18n';

describe('Comments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const me = (token: string) => api().get('/api/auth/me').set(bearer(token));
  const unknownId = '00000000-0000-4000-8000-000000000000';

  const registerUser = async (email: string) =>
    (
      await api()
        .post('/api/auth/register')
        .send({ tenantName: `Org de ${email}`, email, password: '12345678' })
        .expect(201)
    ).body.access_token as string;

  const addComment = (token: string, issueId: string, body: unknown) =>
    api()
      .post(`/api/issues/${issueId}/comments`)
      .set(bearer(token))
      .send({ body });

  /** Org A (admin + Ana como miembro) con una incidencia, y org B (admin) */
  const setup = async () => {
    const adminA = await registerUser('admin-a@test.com');
    const adminB = await registerUser('admin-b@test.com');
    const anaOwn = await registerUser('ana@test.com');

    const { tenantId: tenantA } = (await me(adminA).expect(200)).body;
    const { tenantId: tenantB, sub: adminBId } = (await me(adminB).expect(200))
      .body;
    const { sub: anaId } = (await me(anaOwn).expect(200)).body;

    await api()
      .post('/api/tenants/current/members')
      .set(bearer(adminA))
      .send({ email: 'ana@test.com' })
      .expect(201);
    const memberA = (
      await api()
        .post('/api/auth/switch-tenant')
        .set(bearer(anaOwn))
        .send({ tenantId: tenantA })
        .expect(200)
    ).body.access_token as string;

    const projectId = (
      await api()
        .post('/api/projects')
        .set(bearer(adminA))
        .send({ name: 'Tickr', key: 'TKR' })
        .expect(201)
    ).body.id as string;
    const issueId = (
      await api()
        .post('/api/issues')
        .set(bearer(adminA))
        .send({ projectId, title: 'Bug' })
        .expect(201)
    ).body.id as string;

    return { adminA, adminB, memberA, anaId, tenantB, adminBId, issueId };
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

  it('responde 401 sin token', async () => {
    await api().get(`/api/issues/${unknownId}/comments`).expect(401);
    await api()
      .patch(`/api/comments/${unknownId}`)
      .send({ body: 'x' })
      .expect(401);
  });

  describe('crear y listar', () => {
    it('un miembro comenta y el comentario aparece en el listado con su autor', async () => {
      const { memberA, anaId, issueId } = await setup();

      const created = await addComment(
        memberA,
        issueId,
        'Primer comentario',
      ).expect(201);
      expect(created.body).toMatchObject({
        issueId,
        authorId: anaId,
        body: 'Primer comentario',
        author: { id: anaId, email: 'ana@test.com' },
      });

      const list = await api()
        .get(`/api/issues/${issueId}/comments`)
        .set(bearer(memberA))
        .expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.meta).toEqual({ total: 1, page: 1, limit: 20 });
    });

    it('recorta los espacios del texto', async () => {
      const { adminA, issueId } = await setup();

      const res = await addComment(adminA, issueId, '   hola   ').expect(201);
      expect(res.body.body).toBe('hola');
    });

    it('rechaza comentarios vacíos o demasiado largos y traduce el error', async () => {
      const { adminA, issueId } = await setup();

      await addComment(adminA, issueId, '').expect(400);
      await addComment(adminA, issueId, '    ').expect(400);
      await addComment(adminA, issueId, 'x'.repeat(5001)).expect(400);
      await api()
        .post(`/api/issues/${issueId}/comments`)
        .set(bearer(adminA))
        .send({})
        .expect(400);

      const res = await addComment(adminA, issueId, '')
        .set('Accept-Language', 'es')
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('no puede estar vacío');
    });

    it('lista del más antiguo al más reciente y pagina', async () => {
      const { adminA, issueId } = await setup();
      for (const text of ['uno', 'dos', 'tres']) {
        await addComment(adminA, issueId, text).expect(201);
      }

      const first = await api()
        .get(`/api/issues/${issueId}/comments?limit=2`)
        .set(bearer(adminA))
        .expect(200);
      expect(first.body.data.map((c: { body: string }) => c.body)).toEqual([
        'uno',
        'dos',
      ]);

      const second = await api()
        .get(`/api/issues/${issueId}/comments?page=2&limit=2`)
        .set(bearer(adminA))
        .expect(200);
      expect(second.body.data.map((c: { body: string }) => c.body)).toEqual([
        'tres',
      ]);
      expect(second.body.meta).toEqual({ total: 3, page: 2, limit: 2 });
    });

    it('responde 404 si la incidencia no existe y 400 si el id es inválido', async () => {
      const { adminA } = await setup();

      await api()
        .get(`/api/issues/${unknownId}/comments`)
        .set(bearer(adminA))
        .expect(404);
      await addComment(adminA, unknownId, 'hola').expect(404);
      await api()
        .get('/api/issues/no-es-uuid/comments')
        .set(bearer(adminA))
        .expect(400);
    });
  });

  describe('editar y borrar', () => {
    it('el autor edita su comentario', async () => {
      const { memberA, issueId } = await setup();
      const { id } = (
        await addComment(memberA, issueId, 'Original').expect(201)
      ).body;

      const res = await api()
        .patch(`/api/comments/${id}`)
        .set(bearer(memberA))
        .send({ body: 'Editado' })
        .expect(200);
      expect(res.body.body).toBe('Editado');
    });

    it('nadie más puede editarlo, ni siquiera un admin', async () => {
      const { adminA, memberA, issueId } = await setup();
      const { id } = (await addComment(memberA, issueId, 'De Ana').expect(201))
        .body;

      await api()
        .patch(`/api/comments/${id}`)
        .set(bearer(adminA))
        .send({ body: 'hack' })
        .expect(403);

      const intact = await prisma.comment.findUniqueOrThrow({ where: { id } });
      expect(intact.body).toBe('De Ana');
    });

    it('el autor borra el suyo y un admin borra el de otro', async () => {
      const { adminA, memberA, issueId } = await setup();
      const own = (await addComment(memberA, issueId, 'Mío').expect(201)).body
        .id as string;
      const other = (
        await addComment(memberA, issueId, 'Moderable').expect(201)
      ).body.id as string;

      await api()
        .delete(`/api/comments/${own}`)
        .set(bearer(memberA))
        .expect(204);
      await api()
        .delete(`/api/comments/${other}`)
        .set(bearer(adminA))
        .expect(204);

      expect(await prisma.comment.count()).toBe(0);
    });

    it('un miembro no puede borrar el comentario de otro', async () => {
      const { adminA, memberA, issueId } = await setup();
      const { id } = (
        await addComment(adminA, issueId, 'Del admin').expect(201)
      ).body;

      await api()
        .delete(`/api/comments/${id}`)
        .set(bearer(memberA))
        .expect(403);
      expect(await prisma.comment.count()).toBe(1);
    });

    it('responde 404 si el comentario no existe', async () => {
      const { adminA } = await setup();

      await api()
        .patch(`/api/comments/${unknownId}`)
        .set(bearer(adminA))
        .send({ body: 'x' })
        .expect(404);
      await api()
        .delete(`/api/comments/${unknownId}`)
        .set(bearer(adminA))
        .expect(404);
    });

    it('al borrar la incidencia se borran sus comentarios', async () => {
      const { adminA, issueId } = await setup();
      await addComment(adminA, issueId, 'uno').expect(201);
      await addComment(adminA, issueId, 'dos').expect(201);

      await api()
        .delete(`/api/issues/${issueId}`)
        .set(bearer(adminA))
        .expect(204);

      expect(await prisma.comment.count()).toBe(0);
    });
  });

  describe('aislamiento entre organizaciones', () => {
    it('otra organización no puede ver ni crear comentarios en la incidencia', async () => {
      const { adminA, adminB, issueId } = await setup();
      await addComment(adminA, issueId, 'Privado').expect(201);

      await api()
        .get(`/api/issues/${issueId}/comments`)
        .set(bearer(adminB))
        .expect(404);
      await addComment(adminB, issueId, 'Intrusa').expect(404);
      expect(await prisma.comment.count()).toBe(1);
    });

    it('otra organización no puede editar ni borrar el comentario', async () => {
      const { adminA, adminB, issueId } = await setup();
      const { id } = (await addComment(adminA, issueId, 'Privado').expect(201))
        .body;

      await api()
        .patch(`/api/comments/${id}`)
        .set(bearer(adminB))
        .send({ body: 'hack' })
        .expect(404);
      await api().delete(`/api/comments/${id}`).set(bearer(adminB)).expect(404);

      const intact = await prisma.comment.findUniqueOrThrow({ where: { id } });
      expect(intact.body).toBe('Privado');
    });

    it('la base de datos rechaza un comentario que cruce organizaciones', async () => {
      const { issueId, tenantB, adminBId } = await setup();

      // Escritura directa, sin pasar por la aplicación: la clave compuesta (tenantId, issueId) lo impide
      await expect(
        prisma.comment.create({
          data: {
            tenantId: tenantB,
            issueId,
            authorId: adminBId,
            body: 'Cruzado',
          },
        }),
      ).rejects.toThrow();
    });
  });
});
