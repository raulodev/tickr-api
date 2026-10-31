import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGuard } from '../../src/auth/auth.guard.js';
import type { AuthUser } from '../../src/auth/auth-user.js';
import { RolesGuard } from '../../src/auth/roles.guard.js';
import { Role } from '../../src/generated/prisma/client.js';
import { AddMemberDto } from '../../src/tenant/dto/add-member.dto.js';
import { CreateTenantDto } from '../../src/tenant/dto/create-tenant.dto.js';
import { TenantController } from '../../src/tenant/tenant.controller.js';
import { TenantService } from '../../src/tenant/tenant.service.js';

describe('TenantController', () => {
  let controller: TenantController;

  const tenants = {
    create: vi.fn(),
    listMembers: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
  };

  const user: AuthUser = {
    sub: 'user-1',
    tenantId: 'tenant-1',
    role: Role.ADMIN,
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const builder = Test.createTestingModule({
      controllers: [TenantController],
      providers: [{ provide: TenantService, useValue: tenants }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true });
    const module: TestingModule = await builder.compile();

    controller = module.get<TenantController>(TenantController);
  });

  it('creates an organization for the authenticated user', async () => {
    const dto: CreateTenantDto = { name: 'Another organization' };
    const result = { access_token: 'new-token' };
    tenants.create.mockResolvedValue(result);

    await expect(controller.create(user, dto)).resolves.toBe(result);
    expect(tenants.create).toHaveBeenCalledWith(user.sub, dto);
  });

  it('lists members of the authenticated user organization', async () => {
    const members = [{ userId: 'user-2', role: Role.MEMBER }];
    tenants.listMembers.mockResolvedValue(members);

    await expect(controller.listMembers(user)).resolves.toBe(members);
    expect(tenants.listMembers).toHaveBeenCalledWith(user.tenantId);
  });

  it('adds a member to the authenticated user organization', async () => {
    const dto: AddMemberDto = {
      email: 'member@test.com',
      role: Role.MEMBER,
    };
    const member = { userId: 'user-2', role: Role.MEMBER };
    tenants.addMember.mockResolvedValue(member);

    await expect(controller.addMember(user, dto)).resolves.toBe(member);
    expect(tenants.addMember).toHaveBeenCalledWith(user.tenantId, dto);
  });

  it('removes a member from the authenticated user organization', async () => {
    tenants.removeMember.mockResolvedValue(undefined);

    await expect(controller.removeMember(user, 'user-2')).resolves.toBeUndefined();
    expect(tenants.removeMember).toHaveBeenCalledWith(user.tenantId, 'user-2');
  });
});
