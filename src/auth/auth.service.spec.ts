import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Evita cargar el cliente real de Prisma en los tests
vi.mock('../generated/prisma/client', () => ({
  Role: { ADMIN: 'ADMIN', MEMBER: 'MEMBER' },
  PrismaClient: class {},
}));
vi.mock('bcrypt', () => ({ hash: vi.fn(), compare: vi.fn() }));

describe('AuthService', () => {
  let service: AuthService;

  const tx = {
    tenant: { create: vi.fn() },
    user: { create: vi.fn() },
  };
  const prisma = {
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  const jwt = { signAsync: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((cb) => cb(tx));
    jwt.signAsync.mockResolvedValue('signed-token');

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
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

    it('crea el tenant y el usuario admin y devuelve un token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed' as never);
      tx.tenant.create.mockResolvedValue({ id: 'tenant-1' });
      tx.user.create.mockResolvedValue({
        id: 'user-1',
        tenantId: 'tenant-1',
        role: 'ADMIN',
      });

      const result = await service.register(dto);

      expect(bcrypt.hash).toHaveBeenCalledWith('12345678', 10);
      expect(tx.tenant.create).toHaveBeenCalledWith({
        data: {
          name: 'Mi Empresa',
          slug: expect.stringMatching(/^mi-empresa-[a-f0-9]{6}$/),
        },
      });
      expect(tx.user.create).toHaveBeenCalledWith({
        data: {
          email: 'admin@test.com',
          password: 'hashed',
          name: 'Admin',
          role: 'ADMIN',
          tenantId: 'tenant-1',
        },
      });
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: 'user-1',
        tenantId: 'tenant-1',
        role: 'ADMIN',
      });
      expect(result).toEqual({ access_token: 'signed-token' });
    });

    it('lanza ConflictException si el correo ya existe', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const dto = { email: 'admin@test.com', password: '12345678' };
    const user = {
      id: 'user-1',
      tenantId: 'tenant-1',
      role: 'ADMIN',
      password: 'hashed',
    };

    it('devuelve un token con credenciales válidas', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await service.login(dto);

      expect(bcrypt.compare).toHaveBeenCalledWith('12345678', 'hashed');
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: 'user-1',
        tenantId: 'tenant-1',
        role: 'ADMIN',
      });
      expect(result).toEqual({ access_token: 'signed-token' });
    });

    it('lanza UnauthorizedException si el usuario no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('lanza UnauthorizedException si la contraseña es incorrecta', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });
  });
});
