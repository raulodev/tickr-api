import { Test } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../src/auth/auth.service.js';
import { AuthMailService } from '../../src/auth/auth-mail.service.js';
import { AuthTokensService } from '../../src/auth/auth-tokens.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { hashToken } from '../../src/auth/refresh-token.js';

vi.mock('../generated/prisma/client', () => ({
  Role: { ADMIN: 'ADMIN', MEMBER: 'MEMBER' },
  PrismaClient: class {},
  Prisma: {},
}));
vi.mock('bcrypt', () => ({ hash: vi.fn(), compare: vi.fn() }));

describe('AuthService', () => {
  let service: AuthService;

  const tx = {
    tenant: { create: vi.fn() },
    user: { create: vi.fn() },
    refreshToken: { updateMany: vi.fn(), create: vi.fn() },
  };
  const prisma = {
    user: { findUnique: vi.fn() },
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

  const membership = {
    id: 'm-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    role: 'ADMIN',
  };
  const stored = (overrides: Record<string, unknown> = {}) => ({
    id: 'rt-1',
    userId: 'user-1',
    familyId: 'family-1',
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    ...overrides,
  });
  const familyRevoked = {
    where: { familyId: 'family-1', revokedAt: null },
    data: { revokedAt: expect.any(Date) },
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((cb) => cb(tx));
    jwt.signAsync.mockResolvedValue('access-token');
    prisma.refreshToken.create.mockResolvedValue({});
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
    tx.refreshToken.create.mockResolvedValue({});
    tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: AuthMailService, useValue: { sendVerification: vi.fn() } },
        {
          provide: AuthTokensService,
          useValue: { issue: vi.fn(), consume: vi.fn() },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    const dto = {
      tenantName: 'Mi Empresa',
      email: 'admin@test.com',
      password: '12345678',
      name: 'Admin',
    };

    it('crea la organización y el admin, y abre una sesión', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed' as never);
      tx.tenant.create.mockResolvedValue({ id: 'tenant-1' });
      tx.user.create.mockResolvedValue({
        id: 'user-1',
        memberships: [{ tenantId: 'tenant-1', role: 'ADMIN' }],
      });

      const result = await service.register(dto);

      expect(tx.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'admin@test.com',
            password: 'hashed',
            memberships: { create: { tenantId: 'tenant-1', role: 'ADMIN' } },
          }),
        }),
      );
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: 'user-1',
        tenantId: 'tenant-1',
        role: 'ADMIN',
      });
      expect(result).toEqual({
        access_token: 'access-token',
        refresh_token: expect.any(String),
      });
    });

    it('guarda el refresh token solo como hash y con unos 30 días de vida', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed' as never);
      tx.tenant.create.mockResolvedValue({ id: 'tenant-1' });
      tx.user.create.mockResolvedValue({
        id: 'user-1',
        memberships: [{ tenantId: 'tenant-1', role: 'ADMIN' }],
      });

      const { refresh_token } = await service.register(dto);

      const { data } = prisma.refreshToken.create.mock.calls[0][0];
      expect(data).toEqual({
        userId: 'user-1',
        familyId: expect.any(String),
        tokenHash: hashToken(refresh_token),
        expiresAt: expect.any(Date),
      });
      expect(data.tokenHash).not.toBe(refresh_token);
      expect(data.expiresAt.getTime() - Date.now()).toBeGreaterThan(
        29 * 86_400_000,
      );
    });

    it('lanza ConflictException si el correo ya existe', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const dto = { email: 'admin@test.com', password: '12345678' };
    const user = {
      id: 'user-1',
      password: 'hashed',
      memberships: [
        {
          tenantId: 'tenant-1',
          role: 'ADMIN',
          tenant: { id: 'tenant-1', name: 'Acme', slug: 'acme-1' },
        },
      ],
    };

    it('abre una sesión y devuelve las organizaciones', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await service.login(dto);

      expect(bcrypt.compare).toHaveBeenCalledWith('12345678', 'hashed');
      expect(result).toEqual({
        access_token: 'access-token',
        refresh_token: expect.any(String),
        organizations: [
          { id: 'tenant-1', name: 'Acme', slug: 'acme-1', role: 'ADMIN' },
        ],
      });
    });

    it('limpia los tokens caducados del propio usuario', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await service.login(dto);

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ userId: 'user-1' }),
      });
    });

    it.each([
      ['el usuario no existe', null, true],
      ['la contraseña es incorrecta', user, false],
    ])(
      'lanza UnauthorizedException si %s y no abre sesión',
      async (_caso, found, matches) => {
        prisma.user.findUnique.mockResolvedValue(found);
        vi.mocked(bcrypt.compare).mockResolvedValue(matches as never);

        await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
        expect(prisma.refreshToken.create).not.toHaveBeenCalled();
        expect(jwt.signAsync).not.toHaveBeenCalled();
      },
    );

    it('lanza ForbiddenException si la cuenta no pertenece a ninguna organización', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, memberships: [] });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await expect(service.login(dto)).rejects.toThrow('auth.NO_ORGANIZATION');
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('rota el token: consume el anterior y emite uno nuevo de la misma familia', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(stored());
      prisma.membership.findFirst.mockResolvedValue(membership);

      const result = await service.refresh({ refreshToken: 'old-token' });

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: hashToken('old-token') },
      });
      expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'rt-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(tx.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          familyId: 'family-1',
          tokenHash: hashToken(result.refresh_token),
          expiresAt: expect.any(Date),
        },
      });
      expect(result.refresh_token).not.toBe('old-token');
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: 'user-1',
        tenantId: 'tenant-1',
        role: 'ADMIN',
      });
    });

    it('sin tenantId usa la primera organización del usuario', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(stored());
      prisma.membership.findFirst.mockResolvedValue(membership);

      await service.refresh({ refreshToken: 'old-token' });

      expect(prisma.membership.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('con tenantId usa esa organización', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(stored());
      prisma.membership.findUnique.mockResolvedValue({
        ...membership,
        tenantId: 'tenant-2',
        role: 'MEMBER',
      });

      await service.refresh({
        refreshToken: 'old-token',
        tenantId: 'tenant-2',
      });

      expect(prisma.membership.findUnique).toHaveBeenCalledWith({
        where: { userId_tenantId: { userId: 'user-1', tenantId: 'tenant-2' } },
      });
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: 'user-1',
        tenantId: 'tenant-2',
        role: 'MEMBER',
      });
    });

    it('lanza 403 sin consumir el token si ya no es miembro de esa organización', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(stored());
      prisma.membership.findUnique.mockResolvedValue(null);

      await expect(
        service.refresh({ refreshToken: 'old-token', tenantId: 'tenant-2' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lanza 403 sin consumir el token si el usuario no tiene ninguna organización', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(stored());
      prisma.membership.findFirst.mockResolvedValue(null);

      await expect(
        service.refresh({ refreshToken: 'old-token' }),
      ).rejects.toThrow('auth.NO_ORGANIZATION');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lanza UnauthorizedException con un token desconocido y no revoca nada', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(
        service.refresh({ refreshToken: 'inventado' }),
      ).rejects.toThrow('auth.INVALID_REFRESH_TOKEN');
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('si se reutiliza un token ya revocado, revoca toda la familia', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        stored({ revokedAt: new Date() }),
      );

      await expect(
        service.refresh({ refreshToken: 'old-token' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        familyRevoked,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('rechaza un token caducado sin revocar la familia ni rotar', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        stored({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(
        service.refresh({ refreshToken: 'old-token' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('si otra petición consume el token primero, revoca la familia y no emite nada', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(stored());
      prisma.membership.findFirst.mockResolvedValue(membership);
      tx.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.refresh({ refreshToken: 'old-token' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(tx.refreshToken.create).not.toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        familyRevoked,
      );
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revoca la familia a la que pertenece el token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(stored());

      await expect(service.logout('some-token')).resolves.toBeUndefined();
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        familyRevoked,
      );
    });

    it('con un token desconocido no falla ni revoca nada', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.logout('desconocido')).resolves.toBeUndefined();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('logoutAll', () => {
    it('revoca todos los tokens vigentes del usuario', async () => {
      await service.logoutAll('user-1');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('switchTenant', () => {
    it('emite un access token de la organización si es miembro', async () => {
      prisma.membership.findUnique.mockResolvedValue({
        ...membership,
        tenantId: 'tenant-2',
      });

      await expect(service.switchTenant('user-1', 'tenant-2')).resolves.toEqual(
        {
          access_token: 'access-token',
        },
      );
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: 'user-1',
        tenantId: 'tenant-2',
        role: 'ADMIN',
      });
    });

    it('lanza ForbiddenException si no es miembro', async () => {
      prisma.membership.findUnique.mockResolvedValue(null);

      await expect(service.switchTenant('user-1', 'tenant-2')).rejects.toThrow(
        ForbiddenException,
      );
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });
  });
});
