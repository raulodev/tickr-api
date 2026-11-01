import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service.js';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private health: HealthService) {}

  /** Liveness: el proceso responde. No depende de nada externo. */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: la app puede atender peticiones (base de datos disponible). */
  @Get('ready')
  async ready() {
    const result = await this.health.checkReadiness();
    if (result.status !== 'ok') throw new ServiceUnavailableException(result);
    return result;
  }
}
