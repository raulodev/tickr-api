import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthController } from '../../src/health/health.controller.js';
import { HealthService } from '../../src/health/health.service.js';

describe('HealthController', () => {
  let controller: HealthController;
  const health = { checkReadiness: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: health }],
    }).compile();

    controller = module.get(HealthController);
  });

  it('live responde ok sin consultar ninguna dependencia', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(health.checkReadiness).not.toHaveBeenCalled();
  });

  it('ready devuelve el resultado cuando todo está bien', async () => {
    const ok = { status: 'ok', checks: { database: 'up' } };
    health.checkReadiness.mockResolvedValue(ok);

    await expect(controller.ready()).resolves.toEqual(ok);
  });

  it('ready lanza 503 con el estado cuando falla una comprobación', async () => {
    const down = { status: 'error', checks: { database: 'down' } };
    health.checkReadiness.mockResolvedValue(down);

    const error = await controller.ready().catch((e) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toEqual(down);
  });
});
