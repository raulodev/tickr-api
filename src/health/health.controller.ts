import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthLiveResponseDto } from './dto/health-live-response.dto.js';
import { HealthReadinessResponseDto } from './dto/health-readiness-response.dto.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@SkipThrottle()
@Controller('api/health')
export class HealthController {
  constructor(private health: HealthService) {}

  /** Liveness: el proceso responde. No depende de nada externo. */
  @Get('live')
  @ApiOkResponse({ type: HealthLiveResponseDto })
  live() {
    return { status: 'ok' };
  }

  /** Readiness: la app puede atender peticiones (base de datos disponible). */
  @Get('ready')
  @ApiOkResponse({ type: HealthReadinessResponseDto })
  @ApiServiceUnavailableResponse({ type: HealthReadinessResponseDto })
  async ready() {
    const result = await this.health.checkReadiness();
    if (result.status !== 'ok') throw new ServiceUnavailableException(result);
    return result;
  }
}
