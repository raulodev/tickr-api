import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../src/auth/auth.service.js';
import { AuthTokensService } from '../../src/auth/auth-tokens.service.js';
import { Role } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { hashToken } from '../../src/auth/refresh-token.js';

const { getProvider, isCredentialsValid } = vi.hoisted(() => {
  const isCredentialsValid = vi.fn();
  return {
    isCredentialsValid,
    getProvider: vi.fn(() => ({ isCredentialsValid })),
  };
});

vi.mock('../../src/auth/providers/auth-provider.factory.js', () => ({
  AuthProviderFactory: { getProvider },
}));

describe('AuthService', () => {
  const transaction = {
    tenant: { create: vi.fn() },
    user: { create: vi.fn() },
    refreshToken: { updateMany: vi.fn(), create: vi.fn() },
  };
  const prisma = {
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    membership: { findUnique: vi.fn(), findFirst: vi.fn() },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const jwt = { signAsync: vi.fn() };
  let service: AuthService;

  const user = {
    id: 'user-1',
    memberships: [
      {
        tenantId: 'tenant-1',
        role: Role.ADMIN,
        tenant: { id: 'tenant-1', name: 'Acme', slug: 'acme' },
      },
    ],
  };
  const membership = {
    id: 'membership-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    role: Role.ADMIN,
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    getProvider.mockReturnValue({ isCredentialsValid });
    isCredentialsValid.mockResolvedValue(true);
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    prisma.user.findUnique.mockResolvedValue({ id: user.id });
    prisma.user.findUniqueOrThrow.mockResolvedValue(user);
    prisma.refreshToken.create.mockResolvedValue({});
    prisma.refreshToken.findUnique.mockResolvedValue(null);
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
    transaction.tenant.create.mockResolvedValue({ id: 'tenant-1' });
    transaction.user.create.mockResolvedValue({});
    transaction.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    transaction.refreshToken.create.mockResolvedValue({});
    prisma.membership.findFirst.mockResolvedValue(membership);
    prisma.membership.findUnique.mockResolvedValue(membership);
    jwt.signAsync.mockResolvedValue('access-token');

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: AuthTokensService, useValue: {} },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('login', () => {
    const dto = {
      email: 'ana@test.com',
      provider: 'GITHUB' as const,
      oAuthToken: 'mock-oauth-token',
      name: 'Ana',
    };

    it('crea una cuenta nueva y devuelve tokens junto con sus organizaciones', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.login(dto);

      expect(getProvider).toHaveBeenCalledWith('GITHUB');
      expect(isCredentialsValid).toHaveBeenCalledWith({
        oAuthToken: dto.oAuthToken,
        email: dto.email,
      });
      expect(transaction.tenant.create).toHaveBeenCalledWith({
        data: {
          name: expect.any(String),
          slug: expect.any(String),
        },
      });
      expect(transaction.user.create).toHaveBeenCalledWith({
        data: {
          email: dto.email,
          name: dto.name,
          memberships: {
            create: { tenantId: 'tenant-1', role: Role.ADMIN },
          },
        },
        include: { memberships: true },
      });
      expect(result).toEqual({
        access_token: 'access-token',
        refresh_token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        organizations: [
          { id: 'tenant-1', name: 'Acme', slug: 'acme', role: Role.ADMIN },
        ],
      });
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ userId: 'user-1' }),
      });
    });

    it('abre otra sesión para una cuenta existente sin crear otra organización', async () => {
      const result = await service.login(dto);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(transaction.tenant.create).not.toHaveBeenCalled();
      expect(result.organizations).toEqual([
        { id: 'tenant-1', name: 'Acme', slug: 'acme', role: Role.ADMIN },
      ]);
      expect(result.refresh_token).toEqual(expect.any(String));
    });

    it('rechaza credenciales inválidas antes de consultar usuarios', async () => {
      isCredentialsValid.mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toThrow(ForbiddenException);

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('rota el token y conserva la familia de la sesión', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'refresh-1',
        userId: 'user-1',
        familyId: 'family-1',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      });

      const result = await service.refresh({ refreshToken: 'old-token' });

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: hashToken('old-token') },
      });
      expect(transaction.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'refresh-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(transaction.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          familyId: 'family-1',
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        },
      });
      expect(result).toEqual({
        access_token: 'access-token',
        refresh_token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      });
    });

    it('rechaza un refresh token desconocido', async () => {
      await expect(
        service.refresh({ refreshToken: 'unknown-token' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.membership.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
