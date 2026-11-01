import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectController } from '../../src/project/project.controller.js';
import { ProjectService } from '../../src/project/project.service.js';
import { AuthGuard } from '../../src/auth/auth.guard.js';
import { RolesGuard } from '../../src/auth/roles.guard.js';
import { ROLES_KEY } from '../../src/auth/roles.decorator.js';
import { Role } from '../../src/generated/prisma/client.js';

// Evita cargar el cliente real de Prisma
vi.mock('../generated/prisma/client', () => ({
  Role: { ADMIN: 'ADMIN', MEMBER: 'MEMBER' },
  PrismaClient: class {},
  Prisma: {},
}));

describe('ProjectController', () => {
  let controller: ProjectController;

  const projects = {
    list: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  const user = { sub: 'user-1', tenantId: 'tenant-1', role: Role.ADMIN };
  const project = {
    id: 'project-1',
    tenantId: 'tenant-1',
    name: 'Tickr',
    key: 'TKR',
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module = await Test.createTestingModule({
      controllers: [ProjectController],
      providers: [{ provide: ProjectService, useValue: projects }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ProjectController);
  });

  describe('delegación en el servicio', () => {
    it('list pasa la paginación y devuelve la respuesta del servicio', async () => {
      const response = {
        data: [project],
        meta: { total: 1, page: 2, limit: 10 },
      };
      projects.list.mockResolvedValue(response);

      const result = await controller.list({ page: 2, limit: 10 });

      expect(projects.list).toHaveBeenCalledWith({ page: 2, limit: 10 });
      expect(result).toEqual(response);
    });

    it('findOne pasa el id y devuelve el proyecto', async () => {
      projects.findOne.mockResolvedValue(project);

      const result = await controller.findOne('project-1');

      expect(projects.findOne).toHaveBeenCalledWith('project-1');
      expect(result).toEqual(project);
    });

    it('create usa el tenantId del usuario autenticado, no su id', async () => {
      const dto = { name: 'Tickr', key: 'TKR' };
      projects.create.mockResolvedValue(project);

      const result = await controller.create(user, dto);

      expect(projects.create).toHaveBeenCalledWith('tenant-1', dto);
      expect(result).toEqual(project);
    });

    it('update pasa el id y los datos', async () => {
      const dto = { name: 'Renombrado' };
      projects.update.mockResolvedValue({ ...project, ...dto });

      const result = await controller.update('project-1', dto);

      expect(projects.update).toHaveBeenCalledWith('project-1', dto);
      expect(result).toEqual({ ...project, name: 'Renombrado' });
    });

    it('remove pasa el id y no devuelve contenido', async () => {
      projects.remove.mockResolvedValue(undefined);

      await expect(controller.remove('project-1')).resolves.toBeUndefined();
      expect(projects.remove).toHaveBeenCalledWith('project-1');
    });

    it('propaga los errores del servicio sin transformarlos', async () => {
      const error = new Error('fallo');
      projects.findOne.mockRejectedValue(error);

      await expect(controller.findOne('project-1')).rejects.toBe(error);
    });
  });

  describe('permisos declarados', () => {
    const rolesOf = (handler: keyof ProjectController) =>
      Reflect.getMetadata(ROLES_KEY, ProjectController.prototype[handler]);

    it.each(['create', 'update', 'remove'] as const)(
      '%s exige el rol ADMIN',
      (handler) => {
        expect(rolesOf(handler)).toEqual([Role.ADMIN]);
      },
    );

    it.each(['list', 'findOne'] as const)(
      '%s está abierto a cualquier miembro',
      (handler) => {
        expect(rolesOf(handler)).toBeUndefined();
      },
    );
  });
});
