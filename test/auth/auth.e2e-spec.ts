import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const validUser = {
    tenantName: 'Mi Empresa',
    email: 'admin@test.com',
    password: '12345678',
    name: 'Admin',
  };

  const register = (body: object = validUser) =>
    request(app.getHttpServer()).post('/api/auth/register').send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Debe coincidir con la configuración de main.ts
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.issue.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('crea el tenant y un usuario admin y devuelve un token', async () => {
      const res = await register().expect(201);

      expect(res.body.access_token).toEqual(expect.any(String));

      const user = await prisma.user.findUnique({
        where: { email: validUser.email },
        include: { memberships: { include: { tenant: true } } },
      });
      expect(user).not.toBeNull();
      expect(user!.memberships[0].role).toBe('ADMIN');
      expect(user!.memberships[0].tenant.name).toBe('Mi Empresa');
      expect(user!.password).not.toBe(validUser.password); // guardada con hash
    });

    it('crea un tenant distinto por cada registro', async () => {
      await register().expect(201);
      await register({
        ...validUser,
        tenantName: 'Otra Empresa',
        email: 'otro@test.com',
      }).expect(201);

      const users = await prisma.user.findMany({
        include: { memberships: true },
      });
      expect(users).toHaveLength(2);
      expect(users[0].memberships[0].tenantId).not.toBe(
        users[1].memberships[0].tenantId,
      );
    });

    it('responde 409 si el correo ya está registrado', async () => {
      await register().expect(201);
      await register().expect(409);

      expect(await prisma.tenant.count()).toBe(1); // no deja un tenant huérfano
    });

    it.each([
      ['correo inválido', { ...validUser, email: 'no-es-un-correo' }],
      ['contraseña corta', { ...validUser, password: '123' }],
      ['sin nombre de organización', { ...validUser, tenantName: undefined }],
    ])('responde 400 con %s', async (_caso, body) => {
      await register(body).expect(400);
      expect(await prisma.user.count()).toBe(0);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await register().expect(201);
      await prisma.user.update({
        where: { email: validUser.email },
        data: { emailVerifiedAt: new Date() },
      });
    });

    it('devuelve un token con credenciales válidas', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: validUser.email, password: validUser.password })
        .expect(200);

      expect(res.body.access_token).toEqual(expect.any(String));
    });

    it('responde 401 con contraseña incorrecta', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: validUser.email, password: 'incorrecta' })
        .expect(401);
    });

    it('responde 401 si el usuario no existe', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nadie@test.com', password: '12345678' })
        .expect(401);
    });

    it('responde 400 con un cuerpo inválido', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'no-es-un-correo' })
        .expect(400);
    });
  });

  describe('GET /auth/me', () => {
    it('responde 401 sin token', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });

    it('responde 401 con un token inválido', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer token-falso')
        .expect(401);
    });

    it('devuelve sub, tenantId y role del token', async () => {
      const { body } = await register().expect(201);
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: validUser.email },
        include: { memberships: true },
      });

      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${body.access_token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        sub: user.id,
        tenantId: user.memberships[0].tenantId,
        role: 'ADMIN',
      });
    });
  });
});
