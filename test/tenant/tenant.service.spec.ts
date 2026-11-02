import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../src/auth/auth.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { Role } from '../../src/generated/prisma/client.js';
import { AddMemberDto } from '../../src/tenant/dto/add-member.dto.js';
import { CreateTenantDto } from '../../src/tenant/dto/create-tenant.dto.js';
import { TenantService } from '../../src/tenant/tenant.service.js';

describe('TenantService', () => {
  let service: TenantService;

  const prisma = {
    $transaction: vi.fn(),
    membership: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
    issue: { updateMany: vi.fn(), findMany: vi.fn() },
    issueEvent: { createMany: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  const auth = { issueToken: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    const tx = { ...prisma, $queryRaw: vi.fn() };
    prisma.$transaction.mockImplementation((callback) => callback(tx));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: auth },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
  });

  describe('create', () => {
    it('creates an admin membership, returns the organization and issues a token', async () => {
      const dto: CreateTenantDto = { name: 'Mi Empresa' };
      const membership = {
        tenantId: 'tenant-1',
        role: Role.ADMIN,
        tenant: {
          id: 'tenant-1',
          name: 'Mi Empresa',
          slug: 'mi-empresa-a1b2c3',
        },
      };
      const token = { access_token: 'signed-token' };
      prisma.membership.create.mockResolvedValue(membership);
      auth.issueToken.mockResolvedValue(token);

      const result = await service.create('user-1', dto);

      expect(prisma.membership.create).toHaveBeenCalledWith({
        data: {
          role: Role.ADMIN,
          user: { connect: { id: 'user-1' } },
          tenant: {
            create: {
              name: 'Mi Empresa',
              slug: expect.stringMatching(/^mi-empresa-[a-f0-9]{6}$/),
            },
          },
        },
        include: { tenant: { select: { id: true, name: true, slug: true } } },
      });
      expect(auth.issueToken).toHaveBeenCalledWith('user-1', membership);
      expect(result).toEqual({
        organization: {
          id: 'tenant-1',
          name: 'Mi Empresa',
          slug: 'mi-empresa-a1b2c3',
          role: Role.ADMIN,
        },
        ...token,
      });
    });
  });

  describe('listMembers', () => {
    it('returns member details in membership creation order', async () => {
      prisma.membership.findMany.mockResolvedValue([
        {
          user: { id: 'user-1', email: 'admin@test.com', name: 'Admin' },
          role: Role.ADMIN,
        },
        {
          user: { id: 'user-2', email: 'member@test.com', name: null },
          role: Role.MEMBER,
        },
      ]);

      const result = await service.listMembers('tenant-1');

      expect(prisma.membership.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      expect(result).toEqual([
        {
          userId: 'user-1',
          email: 'admin@test.com',
          name: 'Admin',
          role: Role.ADMIN,
        },
        {
          userId: 'user-2',
          email: 'member@test.com',
          name: null,
          role: Role.MEMBER,
        },
      ]);
    });
  });

  describe('addMember', () => {
    const dto: AddMemberDto = { email: 'member@test.com' };
    const user = {
      id: 'user-2',
      email: 'member@test.com',
      name: 'Member',
    };

    it('adds a registered user with the default MEMBER role', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.membership.findUnique.mockResolvedValue(null);
      prisma.membership.create.mockResolvedValue({ role: Role.MEMBER });

      await expect(service.addMember('tenant-1', dto)).resolves.toEqual({
        userId: 'user-2',
        email: 'member@test.com',
        name: 'Member',
        role: Role.MEMBER,
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'member@test.com' },
      });
      expect(prisma.membership.findUnique).toHaveBeenCalledWith({
        where: {
          userId_tenantId: { userId: 'user-2', tenantId: 'tenant-1' },
        },
      });
      expect(prisma.membership.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-2',
          tenantId: 'tenant-1',
          role: Role.MEMBER,
        },
      });
    });

    it('adds the user with the requested role', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.membership.findUnique.mockResolvedValue(null);
      prisma.membership.create.mockResolvedValue({ role: Role.ADMIN });

      const result = await service.addMember('tenant-1', {
        email: dto.email,
        role: Role.ADMIN,
      });

      expect(prisma.membership.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-2',
          tenantId: 'tenant-1',
          role: Role.ADMIN,
        },
      });
      expect(result.role).toBe(Role.ADMIN);
    });

    it('throws NotFoundException when the email is not registered', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.addMember('tenant-1', dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.membership.findUnique).not.toHaveBeenCalled();
      expect(prisma.membership.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the user is already a member', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.membership.findUnique.mockResolvedValue({ id: 'membership-1' });

      await expect(service.addMember('tenant-1', dto)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.membership.create).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('deletes an existing non-admin membership', async () => {
      prisma.membership.findUnique.mockResolvedValue({
        id: 'membership-1',
        role: Role.MEMBER,
      });
      prisma.issue.findMany.mockResolvedValue([{ id: 'issue-1' }]);

      await expect(
        service.removeMember('tenant-1', 'user-2', 'user-1'),
      ).resolves.toBeUndefined();
      expect(prisma.membership.findUnique).toHaveBeenCalledWith({
        where: {
          userId_tenantId: { userId: 'user-2', tenantId: 'tenant-1' },
        },
      });
      expect(prisma.membership.count).not.toHaveBeenCalled();
      expect(prisma.issueEvent.createMany).toHaveBeenCalledWith({
        data: [
          {
            tenantId: 'tenant-1',
            issueId: 'issue-1',
            actorId: 'user-1',
            type: 'ASSIGNEE_CHANGED',
            oldValue: 'user-2',
            newValue: null,
          },
        ],
      });
      expect(prisma.membership.delete).toHaveBeenCalledWith({
        where: { id: 'membership-1' },
      });
      expect(prisma.issue.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', assigneeId: 'user-2' },
        data: { assigneeId: null },
      });
    });

    it('throws NotFoundException when the user is not a member', async () => {
      prisma.membership.findUnique.mockResolvedValue(null);

      await expect(
        service.removeMember('tenant-1', 'user-2', 'actor-1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.membership.delete).not.toHaveBeenCalled();
    });

    it('deletes an admin membership when another admin remains', async () => {
      prisma.membership.findUnique.mockResolvedValue({
        id: 'membership-1',
        role: Role.ADMIN,
      });
      prisma.membership.count.mockResolvedValue(2);
      prisma.issue.findMany.mockResolvedValue([]);

      await service.removeMember('tenant-1', 'user-2', 'actor-1');

      expect(prisma.membership.count).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', role: Role.ADMIN },
      });
      expect(prisma.membership.delete).toHaveBeenCalledWith({
        where: { id: 'membership-1' },
      });
    });

    it('throws ConflictException instead of deleting the last admin', async () => {
      prisma.membership.findUnique.mockResolvedValue({
        id: 'membership-1',
        role: Role.ADMIN,
      });
      prisma.membership.count.mockResolvedValue(1);

      await expect(
        service.removeMember('tenant-1', 'user-2', 'actor-1'),
      ).rejects.toHaveProperty('status', 409);
      expect(prisma.membership.delete).not.toHaveBeenCalled();
    });
  });
});
