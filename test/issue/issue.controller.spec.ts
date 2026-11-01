import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssueController } from '../../src/issue/issue.controller.js';
import { IssueService } from '../../src/issue/issue.service.js';
import { AuthGuard } from '../../src/auth/auth.guard.js';
import { RolesGuard } from '../../src/auth/roles.guard.js';
import { ROLES_KEY } from '../../src/auth/roles.decorator.js';
import { Role } from '../../src/generated/prisma/client.js';

// Los enums deben estar porque los DTOs los usan en @IsEnum al cargarse el módulo
vi.mock('../generated/prisma/client', () => ({
  Prisma: {},
  PrismaClient: class {},
  Role: { ADMIN: 'ADMIN', MEMBER: 'MEMBER' },
  IssueStatus: { OPEN: 'OPEN', IN_PROGRESS: 'IN_PROGRESS', CLOSED: 'CLOSED' },
  IssuePriority: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    URGENT: 'URGENT',
  },
}));

describe('IssueController', () => {
  let controller: IssueController;

  const issues = {
    list: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  const user = { sub: 'user-1', tenantId: 'tenant-1', role: Role.MEMBER };
  const issue = { id: 'issue-1', key: 'TKR-1', number: 1, title: 'Bug' };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module = await Test.createTestingModule({
      controllers: [IssueController],
      providers: [{ provide: IssueService, useValue: issues }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(IssueController);
  });

  describe('delegación en el servicio', () => {
    it('list pasa la consulta completa y devuelve la respuesta', async () => {
      const query = {
        page: 2,
        limit: 10,
        projectId: 'project-1',
        status: 'OPEN',
      } as never;
      const response = {
        data: [issue],
        meta: { total: 1, page: 2, limit: 10 },
      };
      issues.list.mockResolvedValue(response);

      const result = await controller.list(query);

      expect(issues.list).toHaveBeenCalledWith(query);
      expect(result).toEqual(response);
    });

    it('findOne pasa el id', async () => {
      issues.findOne.mockResolvedValue(issue);

      const result = await controller.findOne('issue-1');

      expect(issues.findOne).toHaveBeenCalledWith('issue-1');
      expect(result).toEqual(issue);
    });

    it('create pasa el usuario autenticado y el DTO', async () => {
      const dto = { projectId: 'project-1', title: 'Bug' } as never;
      issues.create.mockResolvedValue(issue);

      const result = await controller.create(user, dto);

      expect(issues.create).toHaveBeenCalledWith(user, dto);
      expect(result).toEqual(issue);
    });

    it('update pasa el usuario, el id y los datos', async () => {
      const dto = { title: 'Nuevo' } as never;
      issues.update.mockResolvedValue({ ...issue, title: 'Nuevo' });

      const result = await controller.update(user, 'issue-1', dto);

      expect(issues.update).toHaveBeenCalledWith(user, 'issue-1', dto);
      expect(result).toEqual({ ...issue, title: 'Nuevo' });
    });

    it('remove pasa el id y no devuelve contenido', async () => {
      issues.remove.mockResolvedValue(undefined);

      await expect(controller.remove('issue-1')).resolves.toBeUndefined();
      expect(issues.remove).toHaveBeenCalledWith('issue-1');
    });

    it('propaga los errores del servicio sin transformarlos', async () => {
      const error = new Error('fallo');
      issues.findOne.mockRejectedValue(error);

      await expect(controller.findOne('issue-1')).rejects.toBe(error);
    });
  });

  describe('permisos declarados', () => {
    const rolesOf = (handler: keyof IssueController) =>
      Reflect.getMetadata(ROLES_KEY, IssueController.prototype[handler]);

    it('remove exige el rol ADMIN', () => {
      expect(rolesOf('remove')).toEqual([Role.ADMIN]);
    });

    it.each(['list', 'findOne', 'create', 'update'] as const)(
      '%s está abierto a cualquier miembro',
      (handler) => {
        expect(rolesOf(handler)).toBeUndefined();
      },
    );
  });
});
