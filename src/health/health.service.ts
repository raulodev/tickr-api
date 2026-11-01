import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export type HealthStatus = {
  status: 'ok' | 'error';
  checks: { database: 'up' | 'down' };
};

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private prisma: PrismaService) {}

  async checkReadiness(timeoutMs = 2000): Promise<HealthStatus> {
    const database = await this.pingDatabase(timeoutMs);
    return { status: database === 'up' ? 'ok' : 'error', checks: { database } };
  }

  private async pingDatabase(timeoutMs: number): Promise<'up' | 'down'> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error(`Database ping timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
        }),
      ]);
      return 'up';
    } catch (error) {
      // El detalle va al log, nunca a la respuesta
      this.logger.error(
        'Database health check failed',
        error instanceof Error ? error.stack : String(error),
      );
      return 'down';
    } finally {
      clearTimeout(timer);
    }
  }
}
