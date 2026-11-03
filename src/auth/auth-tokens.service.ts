import { BadRequestException, Injectable } from '@nestjs/common';
import { TokenType } from '../generated/prisma/client.js';
import { createHash, randomBytes } from 'node:crypto';
import { t } from '../i18n/t.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class AuthTokensService {
  constructor(private readonly prisma: PrismaService) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Crea un token nuevo e invalida los anteriores sin usar del mismo tipo. */
  async issue(userId: string, type: TokenType, ttlMs: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hash(token);

    await this.prisma.$transaction([
      this.prisma.authToken.deleteMany({
        where: { userId, type, usedAt: null },
      }),
      this.prisma.authToken.create({
        data: {
          userId,
          type,
          tokenHash: tokenHash,
          expiresAt: new Date(Date.now() + ttlMs),
        },
      }),
    ]);
    return token;
  }

  /** Consume el token de forma atómica y devuelve el userId; lanza 400 si no es válido. */
  async consume(token: string, type: TokenType): Promise<string> {
    const tokenHash = this.hash(token);
    const { count } = await this.prisma.authToken.updateMany({
      where: { tokenHash, type, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (count === 0) {
      throw new BadRequestException(t('auth.INVALID_OR_EXPIRED_TOKEN'));
    }
    const row = await this.prisma.authToken.findUniqueOrThrow({
      where: { tokenHash },
    });
    return row.userId;
  }
}
