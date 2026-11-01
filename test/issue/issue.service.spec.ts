import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssueService } from '../../src/issue/issue.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { TENANT_DB } from '../../src/prisma/tenant-db.provider.js';
import { Prisma, Role } from '../../src/generated/prisma/client.js';

// Evita cargar el cliente real de Prisma. Los enums deben estar porque los DTOs
// los usan en @IsEnum al cargarse el módulo.
vi.mock('../generated/prisma/client', () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(
      message: string,
      opts: { code: string; clientVersion?: string },
    ) {
      super(message);
      this.code = opts.code;
    }
  }
  return {
    Prisma: { PrismaClientKnownRequestError },
    PrismaClient: class {},
    Role: { ADMIN: 'ADMIN', MEMBER: 'MEMBER' },
    IssueStatus: { OPEN: 'OPEN', IN_PROGRESS: 'IN_PROGRESS', CLOSED: 'CLOSED' },
    IssuePriority: {
      LOW: 'LOW',
      MEDIUM: 'MEDIUM',
      HIGH: 'HIGH',
      URGENT: 'URGENT',
    },
  };
});

describe('IssueService', () => {
  let service: IssueService;

  const tx = {
    project: { update: vi.fn() },
    issue: { create: vi.fn() },
  };
  const db = {
    issue: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const prisma = { membership: { findUnique: vi.fn() } };

  const user = { sub: 'user-1', tenantId: 'tenant-1', role: Role.MEMBER };
  const include = { project: { select: { key: true } } };

  // Fila tal como la devuelve Prisma (con el include del proyecto)
  const issueRow = {
    id: 'issue-1',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    number: 12,
    title: 'Bug',
    description: null,
    status: 'OPEN',
    priority: 'MEDIUM',
    reporterId: 'user-1',
    assigneeId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    project: { key: 'TKR' },
  };
  // Respuesta esperada: sin el objeto project y con la clave visible
  const { project: _project, ...issueFields } = issueRow;
  const response = { ...issueFields, key: 'TKR-12' };

  const prismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('error', {
      code,
      clientVersion: 'test',
    });

  beforeEach(async () => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation((cb) => cb(tx));

    const module = await Test.createTestingModule({
      providers: [
        IssueService,
        { provide: TENANT_DB, useValue: db },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(IssueService);
  });

  describe('list', () => {
    it('aplica los filtros y la paginación y añade la clave visible', async () => {
      db.issue.findMany.mockResolvedValue([issueRow]);
      db.issue.count.mockResolvedValue(7);

      const result = await service.list({
        page: 2,
        limit: 5,
        projectId: 'project-1',
        status: 'OPEN',
        priority: 'HIGH',
        assigneeId: 'user-2',
      } as never);

      const where = {
        projectId: 'project-1',
        status: 'OPEN',
        priority: 'HIGH',
        assigneeId: 'user-2',
      };
      expect(db.issue.findMany).toHaveBeenCalledWith({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { number: 'desc' }, { id: 'asc' }],
        skip: 5,
        take: 5,
      });
      expect(db.issue.count).toHaveBeenCalledWith({ where });
      expect(result).toEqual({
        data: [response],
        meta: { total: 7, page: 2, limit: 5 },
      });
      expect(result.data[0]).not.toHaveProperty('project');
    });

    it('sin filtros no restringe la búsqueda', async () => {
      db.issue.findMany.mockResolvedValue([]);
      db.issue.count.mockResolvedValue(0);

      await service.list({ page: 1, limit: 20 } as never);

      expect(db.issue.findMany.mock.calls[0][0].where).toEqual({});
      expect(db.issue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });
  });

  describe('findOne', () => {
    it('devuelve la incidencia con su clave', async () => {
      db.issue.findUnique.mockResolvedValue(issueRow);

      await expect(service.findOne('issue-1')).resolves.toEqual(response);
      expect(db.issue.findUnique).toHaveBeenCalledWith({
        where: { id: 'issue-1' },
        include,
      });
    });

    it('lanza NotFoundException si no existe', async () => {
      db.issue.findUnique.mockResolvedValue(null);

      await expect(service.findOne('no-existe')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne('no-existe')).rejects.toThrow(
        'issue.NOT_FOUND',
      );
    });
  });

  describe('create', () => {
    const dto = {
      projectId: 'project-1',
      title: 'Bug',
      description: 'Detalle',
      priority: 'HIGH',
    } as never;

    it('incrementa el contador del proyecto y usa ese número', async () => {
      tx.project.update.mockResolvedValue({ issueCounter: 12 });
      tx.issue.create.mockResolvedValue(issueRow);

      const result = await service.create(user, dto);

      expect(tx.project.update).toHaveBeenCalledWith({
        where: { id: 'project-1' },
        data: { issueCounter: { increment: 1 } },
        select: { issueCounter: true },
      });
      expect(tx.issue.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          number: 12,
          title: 'Bug',
          description: 'Detalle',
          priority: 'HIGH',
          assigneeId: undefined,
          reporterId: 'user-1',
        },
        include,
      });
      expect(result).toEqual(response);
    });

    it('reserva el número antes de crear la incidencia', async () => {
      tx.project.update.mockResolvedValue({ issueCounter: 1 });
      tx.issue.create.mockResolvedValue(issueRow);

      await service.create(user, dto);

      expect(tx.project.update.mock.invocationCallOrder[0]).toBeLessThan(
        tx.issue.create.mock.invocationCallOrder[0],
      );
    });

    it('registra como autor al usuario y como organización la del token', async () => {
      tx.project.update.mockResolvedValue({ issueCounter: 1 });
      tx.issue.create.mockResolvedValue(issueRow);

      await service.create(
        { ...user, sub: 'otro-user', tenantId: 'otro-tenant' },
        dto,
      );

      expect(tx.issue.create.mock.calls[0][0].data).toMatchObject({
        reporterId: 'otro-user',
        tenantId: 'otro-tenant',
      });
    });

    it('no consulta la membresía si no hay responsable', async () => {
      tx.project.update.mockResolvedValue({ issueCounter: 1 });
      tx.issue.create.mockResolvedValue(issueRow);

      await service.create(user, dto);

      expect(prisma.membership.findUnique).not.toHaveBeenCalled();
    });

    it('acepta como responsable a un miembro de la organización', async () => {
      prisma.membership.findUnique.mockResolvedValue({ id: 'membership-2' });
      tx.project.update.mockResolvedValue({ issueCounter: 1 });
      tx.issue.create.mockResolvedValue({ ...issueRow, assigneeId: 'user-2' });

      await service.create(user, {
        ...(dto as object),
        assigneeId: 'user-2',
      } as never);

      expect(prisma.membership.findUnique).toHaveBeenCalledWith({
        where: { userId_tenantId: { userId: 'user-2', tenantId: 'tenant-1' } },
      });
      expect(tx.issue.create.mock.calls[0][0].data.assigneeId).toBe('user-2');
    });

    it('lanza BadRequestException si el responsable no es miembro y no abre la transacción', async () => {
      prisma.membership.findUnique.mockResolvedValue(null);

      await expect(
        service.create(user, {
          ...(dto as object),
          assigneeId: 'user-2',
        } as never),
      ).rejects.toThrow(BadRequestException);
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el proyecto no existe o es de otra organización (P2025)', async () => {
      db.$transaction.mockRejectedValue(prismaError('P2025'));

      await expect(service.create(user, dto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.create(user, dto)).rejects.toThrow(
        'project.NOT_FOUND',
      );
    });

    it('relanza los demás errores sin convertirlos', async () => {
      const error = prismaError('P2002');
      db.$transaction.mockRejectedValue(error);

      await expect(service.create(user, dto)).rejects.toBe(error);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      db.issue.findUnique.mockResolvedValue(issueRow);
      db.issue.update.mockResolvedValue({
        ...issueRow,
        title: 'Nuevo',
        status: 'CLOSED',
      });
    });

    it('actualiza los campos permitidos y devuelve la incidencia con su clave', async () => {
      const result = await service.update(user, 'issue-1', {
        title: 'Nuevo',
        status: 'CLOSED',
      } as never);

      expect(db.issue.update).toHaveBeenCalledWith({
        where: { id: 'issue-1' },
        data: expect.objectContaining({ title: 'Nuevo', status: 'CLOSED' }),
        include,
      });
      expect(result).toMatchObject({
        key: 'TKR-12',
        title: 'Nuevo',
        status: 'CLOSED',
      });
      expect(result).not.toHaveProperty('project');
    });

    it('ignora number, projectId, reporterId y tenantId aunque lleguen en los datos', async () => {
      await service.update(user, 'issue-1', {
        title: 'Nuevo',
        number: 99,
        projectId: 'otro-proyecto',
        reporterId: 'otro-user',
        tenantId: 'otro-tenant',
      } as never);

      const { data } = db.issue.update.mock.calls[0][0];
      for (const field of ['number', 'projectId', 'reporterId', 'tenantId']) {
        expect(data).not.toHaveProperty(field);
      }
    });

    it('lanza NotFoundException y no actualiza si la incidencia no existe', async () => {
      db.issue.findUnique.mockResolvedValue(null);

      await expect(
        service.update(user, 'no-existe', { title: 'X' } as never),
      ).rejects.toThrow(NotFoundException);
      expect(db.issue.update).not.toHaveBeenCalled();
      expect(prisma.membership.findUnique).not.toHaveBeenCalled();
    });

    it('valida que el nuevo responsable sea miembro', async () => {
      prisma.membership.findUnique.mockResolvedValue(null);

      await expect(
        service.update(user, 'issue-1', { assigneeId: 'user-2' } as never),
      ).rejects.toThrow(BadRequestException);
      expect(db.issue.update).not.toHaveBeenCalled();
    });

    it('asigna a un miembro válido', async () => {
      prisma.membership.findUnique.mockResolvedValue({ id: 'membership-2' });

      await service.update(user, 'issue-1', { assigneeId: 'user-2' } as never);

      expect(prisma.membership.findUnique).toHaveBeenCalledWith({
        where: { userId_tenantId: { userId: 'user-2', tenantId: 'tenant-1' } },
      });
      expect(db.issue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assigneeId: 'user-2' }),
        }),
      );
    });

    it('assigneeId null quita al responsable sin consultar membresías', async () => {
      await service.update(user, 'issue-1', { assigneeId: null } as never);

      expect(prisma.membership.findUnique).not.toHaveBeenCalled();
      expect(db.issue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assigneeId: null }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('elimina la incidencia existente', async () => {
      db.issue.findUnique.mockResolvedValue(issueRow);
      db.issue.delete.mockResolvedValue(issueRow);

      await expect(service.remove('issue-1')).resolves.toBeUndefined();
      expect(db.issue.delete).toHaveBeenCalledWith({
        where: { id: 'issue-1' },
      });
    });

    it('lanza NotFoundException y no borra si no existe', async () => {
      db.issue.findUnique.mockResolvedValue(null);

      await expect(service.remove('no-existe')).rejects.toThrow(
        NotFoundException,
      );
      expect(db.issue.delete).not.toHaveBeenCalled();
    });
  });
});
