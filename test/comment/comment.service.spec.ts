import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentService } from '../../src/comment/comment.service.js';
import { TENANT_DB } from '../../src/prisma/tenant-db.provider.js';
import { Prisma, Role } from '../../src/generated/prisma/client.js';

// Evita cargar el cliente real de Prisma; el servicio necesita la clase de error y el enum Role
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

describe('CommentService', () => {
  let service: CommentService;

  const db = {
    comment: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    issue: { findUnique: vi.fn() },
  };

  const author = { sub: 'user-1', tenantId: 'tenant-1', role: Role.MEMBER };
  const admin = { sub: 'admin-1', tenantId: 'tenant-1', role: Role.ADMIN };
  const stranger = { sub: 'user-2', tenantId: 'tenant-1', role: Role.MEMBER };

  const include = { author: { select: { id: true, name: true, email: true } } };
  const commentRow = {
    id: 'comment-1',
    tenantId: 'tenant-1',
    issueId: 'issue-1',
    authorId: 'user-1',
    body: 'Hola',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    author: { id: 'user-1', name: 'Ana', email: 'ana@test.com' },
  };

  const prismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('error', {
      code,
      clientVersion: 'test',
    });

  beforeEach(async () => {
    vi.resetAllMocks();

    const module = await Test.createTestingModule({
      providers: [CommentService, { provide: TENANT_DB, useValue: db }],
    }).compile();

    service = module.get(CommentService);
  });

  describe('list', () => {
    it('devuelve la página en orden cronológico con su metadata', async () => {
      db.issue.findUnique.mockResolvedValue({ id: 'issue-1' });
      db.comment.findMany.mockResolvedValue([commentRow]);
      db.comment.count.mockResolvedValue(25);

      const result = await service.list('issue-1', { page: 2, limit: 10 });

      expect(db.comment.findMany).toHaveBeenCalledWith({
        where: { issueId: 'issue-1' },
        include,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: 10,
        take: 10,
      });
      expect(db.comment.count).toHaveBeenCalledWith({
        where: { issueId: 'issue-1' },
      });
      expect(result).toEqual({
        data: [commentRow],
        meta: { total: 25, page: 2, limit: 10 },
      });
    });

    it('comprueba antes que la incidencia exista', async () => {
      db.issue.findUnique.mockResolvedValue({ id: 'issue-1' });
      db.comment.findMany.mockResolvedValue([]);
      db.comment.count.mockResolvedValue(0);

      await service.list('issue-1', { page: 1, limit: 20 });

      expect(db.issue.findUnique).toHaveBeenCalledWith({
        where: { id: 'issue-1' },
        select: { id: true },
      });
    });

    it('lanza NotFoundException y no consulta comentarios si la incidencia no existe', async () => {
      db.issue.findUnique.mockResolvedValue(null);

      await expect(
        service.list('no-existe', { page: 1, limit: 20 }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.list('no-existe', { page: 1, limit: 20 }),
      ).rejects.toThrow('issue.NOT_FOUND');
      expect(db.comment.findMany).not.toHaveBeenCalled();
      expect(db.comment.count).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    const dto = { body: 'Hola' };

    it('crea el comentario con el autor y la organización del usuario autenticado', async () => {
      db.issue.findUnique.mockResolvedValue({ id: 'issue-1' });
      db.comment.create.mockResolvedValue(commentRow);

      const result = await service.create(author, 'issue-1', dto);

      expect(db.comment.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          issueId: 'issue-1',
          authorId: 'user-1',
          body: 'Hola',
        },
        include,
      });
      expect(result).toEqual(commentRow);
    });

    it('usa sub como autor y tenantId como organización, no al revés', async () => {
      db.issue.findUnique.mockResolvedValue({ id: 'issue-1' });
      db.comment.create.mockResolvedValue(commentRow);

      await service.create(
        { ...author, sub: 'otro-user', tenantId: 'otro-tenant' },
        'issue-1',
        dto,
      );

      expect(db.comment.create.mock.calls[0][0].data).toMatchObject({
        authorId: 'otro-user',
        tenantId: 'otro-tenant',
      });
    });

    it('comprueba la incidencia antes de escribir', async () => {
      db.issue.findUnique.mockResolvedValue({ id: 'issue-1' });
      db.comment.create.mockResolvedValue(commentRow);

      await service.create(author, 'issue-1', dto);

      expect(db.issue.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
        db.comment.create.mock.invocationCallOrder[0],
      );
    });

    it('lanza NotFoundException y no crea nada si la incidencia no existe', async () => {
      db.issue.findUnique.mockResolvedValue(null);

      await expect(service.create(author, 'no-existe', dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(db.comment.create).not.toHaveBeenCalled();
    });

    it('convierte P2003 (la incidencia desapareció durante la escritura) en 404', async () => {
      db.issue.findUnique.mockResolvedValue({ id: 'issue-1' });
      db.comment.create.mockRejectedValue(prismaError('P2003'));

      await expect(service.create(author, 'issue-1', dto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.create(author, 'issue-1', dto)).rejects.toThrow(
        'issue.NOT_FOUND',
      );
    });

    it('relanza los demás errores sin convertirlos', async () => {
      const error = prismaError('P2002');
      db.issue.findUnique.mockResolvedValue({ id: 'issue-1' });
      db.comment.create.mockRejectedValue(error);

      await expect(service.create(author, 'issue-1', dto)).rejects.toBe(error);
    });
  });

  describe('update', () => {
    it('el autor edita el texto de su comentario', async () => {
      db.comment.findUnique.mockResolvedValue(commentRow);
      db.comment.update.mockResolvedValue({ ...commentRow, body: 'Editado' });

      const result = await service.update(author, 'comment-1', {
        body: 'Editado',
      });

      expect(db.comment.update).toHaveBeenCalledWith({
        where: { id: 'comment-1' },
        data: { body: 'Editado' },
        include,
      });
      expect(result.body).toBe('Editado');
    });

    it('solo escribe el texto, aunque lleguen otros campos', async () => {
      db.comment.findUnique.mockResolvedValue(commentRow);
      db.comment.update.mockResolvedValue(commentRow);

      await service.update(author, 'comment-1', {
        body: 'Editado',
        authorId: 'otro-user',
        issueId: 'otra-incidencia',
        tenantId: 'otro-tenant',
      } as never);

      expect(db.comment.update.mock.calls[0][0].data).toEqual({
        body: 'Editado',
      });
    });

    it('lanza ForbiddenException si lo edita otro miembro y no escribe', async () => {
      db.comment.findUnique.mockResolvedValue(commentRow);

      await expect(
        service.update(stranger, 'comment-1', { body: 'hack' }),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update(stranger, 'comment-1', { body: 'hack' }),
      ).rejects.toThrow('comment.EDIT_NOT_ALLOWED');
      expect(db.comment.update).not.toHaveBeenCalled();
    });

    it('ni siquiera un admin puede editar el comentario de otro', async () => {
      db.comment.findUnique.mockResolvedValue(commentRow);

      await expect(
        service.update(admin, 'comment-1', { body: 'hack' }),
      ).rejects.toThrow(ForbiddenException);
      expect(db.comment.update).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException y no escribe si el comentario no existe', async () => {
      db.comment.findUnique.mockResolvedValue(null);

      await expect(
        service.update(author, 'no-existe', { body: 'x' }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.update(author, 'no-existe', { body: 'x' }),
      ).rejects.toThrow('comment.NOT_FOUND');
      expect(db.comment.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('el autor borra su comentario', async () => {
      db.comment.findUnique.mockResolvedValue(commentRow);
      db.comment.delete.mockResolvedValue(commentRow);

      await expect(
        service.remove(author, 'comment-1'),
      ).resolves.toBeUndefined();
      expect(db.comment.delete).toHaveBeenCalledWith({
        where: { id: 'comment-1' },
      });
    });

    it('un admin puede borrar el comentario de otro (moderación)', async () => {
      db.comment.findUnique.mockResolvedValue(commentRow);
      db.comment.delete.mockResolvedValue(commentRow);

      await expect(service.remove(admin, 'comment-1')).resolves.toBeUndefined();
      expect(db.comment.delete).toHaveBeenCalledWith({
        where: { id: 'comment-1' },
      });
    });

    it('lanza ForbiddenException si otro miembro intenta borrarlo y no borra', async () => {
      db.comment.findUnique.mockResolvedValue(commentRow);

      await expect(service.remove(stranger, 'comment-1')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.remove(stranger, 'comment-1')).rejects.toThrow(
        'comment.DELETE_NOT_ALLOWED',
      );
      expect(db.comment.delete).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException y no borra si el comentario no existe', async () => {
      db.comment.findUnique.mockResolvedValue(null);

      await expect(service.remove(admin, 'no-existe')).rejects.toThrow(
        NotFoundException,
      );
      expect(db.comment.delete).not.toHaveBeenCalled();
    });
  });
});
