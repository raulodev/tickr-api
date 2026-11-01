import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthService } from '../../src/health/health.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

// Evita cargar el cliente real de Prisma
vi.mock('../generated/prisma/client', () => ({ PrismaClient: class {} }));

describe('HealthService', () => {
  let service: HealthService;
  let logError: ReturnType<typeof vi.spyOn>;

  const prisma = { $queryRaw: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    const module = await Test.createTestingModule({
      providers: [HealthService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(HealthService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('informa ok cuando la base de datos responde', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(service.checkReadiness()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it('informa error cuando la consulta falla, la registra y no filtra el detalle', async () => {
    prisma.$queryRaw.mockRejectedValue(
      new Error('password authentication failed for user "raul"'),
    );

    const result = await service.checkReadiness();

    expect(result).toEqual({ status: 'error', checks: { database: 'down' } });
    expect(JSON.stringify(result)).not.toContain('password');
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('informa error si la base de datos no responde antes del timeout', async () => {
    vi.useFakeTimers();
    prisma.$queryRaw.mockReturnValue(new Promise(() => {})); // nunca resuelve

    const pending = service.checkReadiness(2000);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(pending).resolves.toEqual({
      status: 'error',
      checks: { database: 'down' },
    });
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('no deja temporizadores pendientes cuando la consulta responde a tiempo', async () => {
    vi.useFakeTimers();
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await service.checkReadiness(2000);

    expect(vi.getTimerCount()).toBe(0);
  });
});
