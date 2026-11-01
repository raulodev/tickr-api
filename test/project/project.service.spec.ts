import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectService } from '../../src/project/project.service.js';
import { TENANT_DB } from '../../src/prisma/tenant-db.provider.js';
import { Prisma } from '../../src/generated/prisma/client.js';

// Evita cargar el cliente real de Prisma; el servicio solo necesita esta clase de error
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
  };
});

describe('ProjectService', () => {
  let service: ProjectService;

  const db = {
    project: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  const project = {
    id: 'project-1',
    tenantId: 'tenant-1',
    name: 'Tickr',
    key: 'TKR',
    createdAt: new Date('2026-01-01'),
  };

  const prismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('error', {
      code,
      clientVersion: 'test',
    });

  beforeEach(async () => {
    vi.resetAllMocks();

    const module = await Test.createTestingModule({
      providers: [ProjectService, { provide: TENANT_DB, useValue: db }],
    }).compile();

    service = module.get(ProjectService);
  });

  describe('list', () => {
    it('devuelve la página pedida con su metadata', async () => {
      db.project.findMany.mockResolvedValue([project]);
      db.project.count.mockResolvedValue(25);

      const result = await service.list({ page: 3, limit: 10 });

      expect(db.project.findMany).toHaveBeenCalledWith({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: 20,
        take: 10,
      });
      expect(result).toEqual({
        data: [project],
        meta: { total: 25, page: 3, limit: 10 },
      });
    });

    it('en la primera página no salta ningún registro', async () => {
      db.project.findMany.mockResolvedValue([]);
      db.project.count.mockResolvedValue(0);

      const result = await service.list({ page: 1, limit: 20 });

      expect(db.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
      expect(result).toEqual({
        data: [],
        meta: { total: 0, page: 1, limit: 20 },
      });
    });
  });

  describe('findOne', () => {
    it('devuelve el proyecto', async () => {
      db.project.findUnique.mockResolvedValue(project);

      await expect(service.findOne('project-1')).resolves.toEqual(project);
      expect(db.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'project-1' },
      });
    });

    it('lanza NotFoundException si no existe', async () => {
      db.project.findUnique.mockResolvedValue(null);

      await expect(service.findOne('no-existe')).rejects.toThrow(
        NotFoundException,
      );
      // Fuera de una petición real, la traducción devuelve la clave
      await expect(service.findOne('no-existe')).rejects.toThrow(
        'project.NOT_FOUND',
      );
    });
  });

  describe('create', () => {
    const dto = { name: 'Tickr', key: 'TKR' };

    it('crea el proyecto con el tenantId indicado', async () => {
      db.project.create.mockResolvedValue(project);

      const result = await service.create('tenant-1', dto);

      expect(db.project.create).toHaveBeenCalledWith({
        data: { name: 'Tickr', key: 'TKR', tenantId: 'tenant-1' },
      });
      expect(result).toEqual(project);
    });

    it('lanza ConflictException si la clave ya existe (P2002)', async () => {
      db.project.create.mockRejectedValue(prismaError('P2002'));

      await expect(service.create('tenant-1', dto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.create('tenant-1', dto)).rejects.toThrow(
        'project.KEY_ALREADY_EXISTS',
      );
    });

    it('relanza los demás errores de Prisma sin convertirlos', async () => {
      const error = prismaError('P2003');
      db.project.create.mockRejectedValue(error);

      await expect(service.create('tenant-1', dto)).rejects.toBe(error);
    });

    it('relanza los errores inesperados', async () => {
      const error = new Error('conexión perdida');
      db.project.create.mockRejectedValue(error);

      await expect(service.create('tenant-1', dto)).rejects.toBe(error);
    });
  });

  describe('update', () => {
    it('actualiza solo el nombre', async () => {
      db.project.findUnique.mockResolvedValue(project);
      db.project.update.mockResolvedValue({ ...project, name: 'Renombrado' });

      const result = await service.update('project-1', { name: 'Renombrado' });

      expect(db.project.update).toHaveBeenCalledWith({
        where: { id: 'project-1' },
        data: { name: 'Renombrado' },
      });
      expect(result.name).toBe('Renombrado');
    });

    it('no toca la clave aunque llegue en los datos', async () => {
      db.project.findUnique.mockResolvedValue(project);
      db.project.update.mockResolvedValue(project);

      // Simula un cuerpo que se hubiera colado sin pasar por el DTO
      await service.update('project-1', { name: 'X', key: 'ZZ' } as never);

      expect(db.project.update).toHaveBeenCalledWith({
        where: { id: 'project-1' },
        data: { name: 'X' },
      });
    });

    it('lanza NotFoundException y no actualiza si el proyecto no existe', async () => {
      db.project.findUnique.mockResolvedValue(null);

      await expect(service.update('no-existe', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(db.project.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('elimina el proyecto existente', async () => {
      db.project.findUnique.mockResolvedValue(project);
      db.project.delete.mockResolvedValue(project);

      await expect(service.remove('project-1')).resolves.toBeUndefined();
      expect(db.project.delete).toHaveBeenCalledWith({
        where: { id: 'project-1' },
      });
    });

    it('lanza NotFoundException y no borra si el proyecto no existe', async () => {
      db.project.findUnique.mockResolvedValue(null);

      await expect(service.remove('no-existe')).rejects.toThrow(
        NotFoundException,
      );
      expect(db.project.delete).not.toHaveBeenCalled();
    });
  });
});
