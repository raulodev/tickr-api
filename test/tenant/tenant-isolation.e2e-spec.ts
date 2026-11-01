import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  ScopedPrismaClient,
  TENANT_DB,
} from '../../src/prisma/tenant-db.provider.js';

describe('Aislamiento por tenant (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let db: ScopedPrismaClient;
  let cls: ClsService;

  let tenantA: string;
  let tenantB: string;
  let projectA: string;
  let projectB: string;

  // `return await` es importante: las consultas de Prisma son perezosas y deben
  // ejecutarse dentro del contexto, no cuando alguien las espere después.
  const asTenant = <T>(tenantId: string, fn: () => Promise<T>) =>
    cls.runWith({ tenantId }, async () => await fn());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    db = app.get<ScopedPrismaClient>(TENANT_DB);
    cls = app.get(ClsService);
  });

  beforeEach(async () => {
    await prisma.project.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();

    const a = await prisma.tenant.create({
      data: { name: 'A', slug: 'a-test' },
    });
    const b = await prisma.tenant.create({
      data: { name: 'B', slug: 'b-test' },
    });
    tenantA = a.id;
    tenantB = b.id;
    projectA = (
      await prisma.project.create({
        data: { tenantId: a.id, name: 'Proyecto A', key: 'PA' },
      })
    ).id;
    projectB = (
      await prisma.project.create({
        data: { tenantId: b.id, name: 'Proyecto B', key: 'PB' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lista solo los proyectos del tenant activo', async () => {
    const projects = await asTenant(tenantA, () => db.project.findMany());
    expect(projects.map((p) => p.id)).toEqual([projectA]);
    expect(await asTenant(tenantA, () => db.project.count())).toBe(1);
  });

  it('no encuentra por id un proyecto de otro tenant', async () => {
    expect(
      await asTenant(tenantA, () =>
        db.project.findUnique({ where: { id: projectB } }),
      ),
    ).toBeNull();
    expect(
      await asTenant(tenantA, () =>
        db.project.findFirst({ where: { id: projectB } }),
      ),
    ).toBeNull();
  });

  it('no puede modificar ni borrar proyectos de otro tenant', async () => {
    await expect(
      asTenant(tenantA, () =>
        db.project.update({ where: { id: projectB }, data: { name: 'hack' } }),
      ),
    ).rejects.toThrow();
    await expect(
      asTenant(tenantA, () => db.project.delete({ where: { id: projectB } })),
    ).rejects.toThrow();

    const { count } = await asTenant(tenantA, () =>
      db.project.updateMany({
        where: { id: projectB },
        data: { name: 'hack' },
      }),
    );
    expect(count).toBe(0);

    const intact = await prisma.project.findUniqueOrThrow({
      where: { id: projectB },
    });
    expect(intact.name).toBe('Proyecto B');
  });

  it('no permite filtrar por un tenantId ajeno', async () => {
    const result = await asTenant(tenantA, () =>
      db.project.findMany({ where: { tenantId: tenantB } }),
    );
    expect(result.map((p) => p.id)).toEqual([projectA]); // el tenant del contexto manda
  });

  it('rechaza crear un proyecto para otro tenant', async () => {
    await expect(
      asTenant(tenantA, () =>
        db.project.create({ data: { tenantId: tenantB, name: 'X', key: 'X' } }),
      ),
    ).rejects.toThrow(/Tenant mismatch/);
  });

  it('no permite mover un proyecto a otro tenant con update', async () => {
    await asTenant(tenantA, () =>
      db.project.update({
        where: { id: projectA },
        data: { tenantId: tenantB },
      }),
    );
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectA },
    });
    expect(project.tenantId).toBe(tenantA);
  });

  it('falla sin contexto de tenant en lugar de devolver todo', async () => {
    await expect(db.project.findMany()).rejects.toThrow();
  });
});
