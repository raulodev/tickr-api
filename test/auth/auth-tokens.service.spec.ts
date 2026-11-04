import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthTokensService } from '../../src/auth/auth-tokens.service.js';
import { TokenType } from '../../src/generated/prisma/client.js';

describe('AuthTokensService', () => {
  const prisma = {
    authToken: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  let service: AuthTokensService;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.authToken.deleteMany.mockResolvedValue({ count: 1 });
    prisma.authToken.create.mockResolvedValue({});
    prisma.authToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.authToken.findUniqueOrThrow.mockResolvedValue({ userId: 'user-1' });
    prisma.$transaction.mockResolvedValue([]);
    service = new AuthTokensService(prisma as never);
  });

  it('emite un token aleatorio, guarda su hash e invalida otros tokens sin usar', async () => {
    const ttlMs = 15 * 60 * 1000;
    const expiresAfter = Date.now() + ttlMs;

    const token = await service.issue(
      'user-1',
      TokenType.PASSWORD_RESET,
      ttlMs,
    );

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(prisma.authToken.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        type: TokenType.PASSWORD_RESET,
        usedAt: null,
      },
    });
    expect(prisma.authToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        type: TokenType.PASSWORD_RESET,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: expect.any(Date),
      },
    });
    const { tokenHash, expiresAt } =
      prisma.authToken.create.mock.calls[0][0].data;
    expect(tokenHash).not.toBe(token);
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expiresAfter);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + ttlMs);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('consume marca el token como usado y devuelve el usuario asociado', async () => {
    const token = 'verification-token';

    await expect(
      service.consume(token, TokenType.EMAIL_VERIFICATION),
    ).resolves.toBe('user-1');

    const tokenHash = createHash('sha256').update(token).digest('hex');
    expect(prisma.authToken.updateMany).toHaveBeenCalledWith({
      where: {
        tokenHash,
        type: TokenType.EMAIL_VERIFICATION,
        usedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { usedAt: expect.any(Date) },
    });
    expect(prisma.authToken.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { tokenHash },
    });
  });

  it('rechaza un token inválido o caducado sin buscar su usuario', async () => {
    prisma.authToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.consume('expired-token', TokenType.PASSWORD_RESET),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.authToken.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
