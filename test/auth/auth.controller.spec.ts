import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '../../src/auth/auth.controller.js';
import { AuthService } from '../../src/auth/auth.service.js';
import { AuthGuard } from '../../src/auth/auth.guard.js';

vi.mock('../generated/prisma/client', () => ({
  Role: { ADMIN: 'ADMIN', MEMBER: 'MEMBER' },
  PrismaClient: class {},
}));

describe('AuthController', () => {
  let controller: AuthController;
  const authService = { register: vi.fn(), login: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AuthController);
  });

  it('register delega en el servicio y devuelve su resultado', async () => {
    const dto = {
      tenantName: 'Mi Empresa',
      email: 'admin@test.com',
      password: '12345678',
    };
    authService.register.mockResolvedValue({ access_token: 'token' });

    const result = await controller.register(dto);

    expect(authService.register).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ access_token: 'token' });
  });

  it('login delega en el servicio y devuelve su resultado', async () => {
    const dto = { email: 'admin@test.com', password: '12345678' };
    authService.login.mockResolvedValue({ access_token: 'token' });

    const result = await controller.login(dto);

    expect(authService.login).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ access_token: 'token' });
  });

  it('me devuelve el usuario del token', () => {
    const user = { sub: 'user-1', tenantId: 'tenant-1', role: 'ADMIN' };

    expect(controller.me({ user })).toEqual(user);
  });
});
