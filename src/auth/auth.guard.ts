import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { t } from '../i18n/t.js';
import { AuthUser } from './auth-user.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private cls: ClsService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const [type, token] = req.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException(t('auth.UNAUTHORIZED'));
    }

    let payload: { sub: string; tenantId: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException(t('auth.UNAUTHORIZED'));
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_tenantId: { userId: payload.sub, tenantId: payload.tenantId },
      },
      select: { role: true },
    });
    if (!membership) throw new UnauthorizedException(t('auth.UNAUTHORIZED'));

    this.cls.set('tenantId', payload.tenantId);

    req.user = {
      sub: payload.sub,
      tenantId: payload.tenantId,
      role: membership.role,
    } satisfies AuthUser;
    return true;
  }
}
