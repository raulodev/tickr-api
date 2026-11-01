import { RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentController } from '../../src/comment/comment.controller.js';
import { CommentService } from '../../src/comment/comment.service.js';
import { AuthGuard } from '../../src/auth/auth.guard.js';
import { RolesGuard } from '../../src/auth/roles.guard.js';
import { ROLES_KEY } from '../../src/auth/roles.decorator.js';
import { Role } from '../../src/generated/prisma/client.js';

// Evita cargar el cliente real de Prisma
vi.mock('../generated/prisma/client', () => ({
  Prisma: {},
  PrismaClient: class {},
  Role: { ADMIN: 'ADMIN', MEMBER: 'MEMBER' },
}));

describe('CommentController', () => {
  let controller: CommentController;

  const comments = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  const user = { sub: 'user-1', tenantId: 'tenant-1', role: Role.MEMBER };
  const comment = { id: 'comment-1', issueId: 'issue-1', body: 'Hola' };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module = await Test.createTestingModule({
      controllers: [CommentController],
      providers: [{ provide: CommentService, useValue: comments }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(CommentController);
  });

  describe('delegación en el servicio', () => {
    it('list pasa el id de la incidencia y la paginación', async () => {
      const response = {
        data: [comment],
        meta: { total: 1, page: 2, limit: 10 },
      };
      comments.list.mockResolvedValue(response);

      const result = await controller.list('issue-1', { page: 2, limit: 10 });

      expect(comments.list).toHaveBeenCalledWith('issue-1', {
        page: 2,
        limit: 10,
      });
      expect(result).toEqual(response);
    });

    it('create pasa el usuario, la incidencia y el DTO', async () => {
      const dto = { body: 'Hola' };
      comments.create.mockResolvedValue(comment);

      const result = await controller.create(user, 'issue-1', dto);

      expect(comments.create).toHaveBeenCalledWith(user, 'issue-1', dto);
      expect(result).toEqual(comment);
    });

    it('update pasa el usuario, el id del comentario y el DTO', async () => {
      const dto = { body: 'Editado' };
      comments.update.mockResolvedValue({ ...comment, body: 'Editado' });

      const result = await controller.update(user, 'comment-1', dto);

      expect(comments.update).toHaveBeenCalledWith(user, 'comment-1', dto);
      expect(result).toEqual({ ...comment, body: 'Editado' });
    });

    it('remove pasa el usuario y el id, y no devuelve contenido', async () => {
      comments.remove.mockResolvedValue(undefined);

      await expect(
        controller.remove(user, 'comment-1'),
      ).resolves.toBeUndefined();
      expect(comments.remove).toHaveBeenCalledWith(user, 'comment-1');
    });

    it('propaga los errores del servicio sin transformarlos', async () => {
      const error = new Error('fallo');
      comments.list.mockRejectedValue(error);

      await expect(
        controller.list('issue-1', { page: 1, limit: 20 }),
      ).rejects.toBe(error);
    });
  });

  describe('rutas y códigos de respuesta', () => {
    const proto = CommentController.prototype;
    // 'path' y 'method' son las claves de metadatos que Nest guarda con @Get, @Post, etc.
    const route = (handler: keyof CommentController) => ({
      path: Reflect.getMetadata('path', proto[handler]),
      method: Reflect.getMetadata('method', proto[handler]),
    });

    it('expone las rutas esperadas', () => {
      expect(route('list')).toEqual({
        path: 'issues/:issueId/comments',
        method: RequestMethod.GET,
      });
      expect(route('create')).toEqual({
        path: 'issues/:issueId/comments',
        method: RequestMethod.POST,
      });
      expect(route('update')).toEqual({
        path: 'comments/:id',
        method: RequestMethod.PATCH,
      });
      expect(route('remove')).toEqual({
        path: 'comments/:id',
        method: RequestMethod.DELETE,
      });
    });

    it('el borrado responde 204', () => {
      expect(Reflect.getMetadata('__httpCode__', proto.remove)).toBe(204);
    });
  });

  describe('permisos declarados', () => {
    // Los permisos dependen de la autoría y los decide el servicio, no @Roles
    it.each(['list', 'create', 'update', 'remove'] as const)(
      '%s no declara roles',
      (handler) => {
        expect(
          Reflect.getMetadata(ROLES_KEY, CommentController.prototype[handler]),
        ).toBeUndefined();
      },
    );
  });
});
