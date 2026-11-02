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
  const authService = {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
  };

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

  it('refresh delega en el servicio con el DTO completo', async () => {
    const dto = { refreshToken: 'token', tenantId: 'tenant-1' };
    authService.refresh.mockResolvedValue({
      access_token: 'a',
      refresh_token: 'r',
    });

    await expect(controller.refresh(dto)).resolves.toEqual({
      access_token: 'a',
      refresh_token: 'r',
    });
    expect(authService.refresh).toHaveBeenCalledWith(dto);
  });

  it('logout pasa solo el refresh token', async () => {
    await controller.logout({ refreshToken: 'token' });

    expect(authService.logout).toHaveBeenCalledWith('token');
  });

  it('logoutAll pasa el id del usuario autenticado, no el de la organización', async () => {
    await controller.logoutAll({
      sub: 'user-1',
      tenantId: 'tenant-1',
      role: 'ADMIN',
    } as never);

    expect(authService.logoutAll).toHaveBeenCalledWith('user-1');
  });

  it('refresh responde 200 y logout y logout-all responden 204', () => {
    const code = (handler: keyof AuthController) =>
      Reflect.getMetadata('__httpCode__', AuthController.prototype[handler]);

    expect(code('refresh')).toBe(200);
    expect(code('logout')).toBe(204);
    expect(code('logoutAll')).toBe(204);
  });
});
