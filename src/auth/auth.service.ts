import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { I18nContext } from 'nestjs-i18n';
import { randomUUID } from 'node:crypto';
import { generateSlug } from '../common/slug.js';
import { Prisma, Role, TokenType, User } from '../generated/prisma/client.js';
import { t } from '../i18n/t.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthMailService } from './auth-mail.service.js';
import { AuthTokensService, HOUR_MS } from './auth-tokens.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import type { ResetPasswordDto } from './dto/reset-password.dto.js';
import {
  generateToken,
  hashToken,
  REFRESH_TOKEN_TTL_MS,
  REVOKED_RETENTION_MS,
} from './refresh-token.js';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private readonly authMail: AuthMailService,
    private readonly tokens: AuthTokensService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw new ConflictException(t('auth.EMAIL_ALREADY_REGISTERED'));

    const password = await bcrypt.hash(dto.password, 10);

    const slug = generateSlug(dto.tenantName);

    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.tenantName, slug },
      });
      return tx.user.create({
        data: {
          email: dto.email,
          password,
          name: dto.name,
          memberships: { create: { tenantId: tenant.id, role: Role.ADMIN } },
        },
        include: { memberships: true },
      });
    });

    return this.startSession(user.id, user.memberships[0]);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        memberships: {
          orderBy: { createdAt: 'asc' },
          include: { tenant: { select: { id: true, name: true, slug: true } } },
        },
      },
    });
    const valid = user && (await bcrypt.compare(dto.password, user.password));
    if (!user || !valid)
      throw new UnauthorizedException(t('auth.INVALID_CREDENTIALS'));

    const [membership] = user.memberships;
    if (!membership) throw new ForbiddenException(t('auth.NO_ORGANIZATION'));

    await this.purgeStaleTokens(user.id);

    return {
      ...(await this.startSession(user.id, membership)),
      organizations: user.memberships.map((m) => ({
        id: m.tenant.id,
        name: m.tenant.name,
        slug: m.tenant.slug,
        role: m.role,
      })),
    };
  }

  async switchTenant(userId: string, tenantId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    if (!membership) throw new ForbiddenException(t('auth.NOT_A_MEMBER'));

    return this.signToken(userId, membership);
  }

  private async signToken(
    userId: string,
    membership: { tenantId: string; role: Role },
  ) {
    const payload = {
      sub: userId,
      tenantId: membership.tenantId,
      role: membership.role,
    };
    return { access_token: await this.jwt.signAsync(payload) };
  }

  async issueToken(
    userId: string,
    membership: { tenantId: string; role: Role },
  ) {
    return this.signToken(userId, membership);
  }

  async refresh(dto: RefreshDto) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(dto.refreshToken) },
    });
    if (!stored)
      throw new UnauthorizedException(t('auth.INVALID_REFRESH_TOKEN'));

    if (stored.revokedAt) {
      // Un token ya usado o revocado que vuelve a presentarse: posible robo. Se cierra toda la sesión.
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException(t('auth.INVALID_REFRESH_TOKEN'));
    }
    if (stored.expiresAt <= new Date()) {
      throw new UnauthorizedException(t('auth.INVALID_REFRESH_TOKEN'));
    }

    // La organización se resuelve antes de consumir el token: si falla, el cliente puede reintentar
    const membership = await this.resolveMembership(
      stored.userId,
      dto.tenantId,
    );

    // Rotación atómica: solo una petición puede consumir este token
    const refresh_token = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0) return null; // otra petición lo consumió primero
      return this.createRefreshToken(tx, stored.userId, stored.familyId);
    });

    if (!refresh_token) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException(t('auth.INVALID_REFRESH_TOKEN'));
    }
    return {
      ...(await this.issueToken(stored.userId, membership)),
      refresh_token,
    };
  }

  /** Cierra la sesión a la que pertenece el token. Idempotente: un token desconocido no es un error. */
  async logout(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async startSession(
    userId: string,
    membership: { tenantId: string; role: Role },
  ) {
    const refresh_token = await this.createRefreshToken(
      this.prisma,
      userId,
      randomUUID(),
    );
    return { ...(await this.issueToken(userId, membership)), refresh_token };
  }

  private async createRefreshToken(
    db: Prisma.TransactionClient,
    userId: string,
    familyId: string,
  ) {
    const token = generateToken();
    await db.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return token;
  }

  private async resolveMembership(userId: string, tenantId?: string) {
    if (tenantId) {
      const membership = await this.prisma.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
      });
      if (!membership) throw new ForbiddenException(t('auth.NOT_A_MEMBER'));
      return membership;
    }
    const first = await this.prisma.membership.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    if (!first) throw new ForbiddenException(t('auth.NO_ORGANIZATION'));
    return first;
  }

  private revokeFamily(familyId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private purgeStaleTokens(userId: string) {
    const now = Date.now();
    return this.prisma.refreshToken.deleteMany({
      where: {
        userId,
        OR: [
          { expiresAt: { lt: new Date(now) } },
          { revokedAt: { lt: new Date(now - REVOKED_RETENTION_MS) } },
        ],
      },
    });
  }

  async verifyEmail(token: string) {
    const userId = await this.tokens.consume(
      token,
      TokenType.EMAIL_VERIFICATION,
    );
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });

    return { message: t('auth.VERIFY_EMAIL_SUCCESS') };
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && !user.emailVerifiedAt) {
      void this.sendVerification(user);
    }

    return { message: t('auth.VERIFICATION_SENT') };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;
    const locale = this.currentLocale();
    const token = await this.tokens.issue(
      user.id,
      TokenType.PASSWORD_RESET,
      HOUR_MS,
    );
    this.authMail.sendPasswordReset(user, token, locale);

    return { message: t('auth.RESET_EMAIL_SENT') };
  }

  async resetPassword({ token, newPassword }: ResetPasswordDto) {
    const userId = await this.tokens.consume(token, TokenType.PASSWORD_RESET);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: now },
      }),
      // completar el reset demuestra que controla el correo
      this.prisma.user.updateMany({
        where: { id: userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      }),
    ]);

    return { message: t('auth.PASSWORD_RESET_SUCCESS') };
  }

  private async sendVerification(user: User) {
    const locale = this.currentLocale();
    const token = await this.tokens.issue(
      user.id,
      TokenType.EMAIL_VERIFICATION,
      24 * HOUR_MS,
    );
    await this.authMail.sendVerification(user, token, locale);
  }

  private assertEmailVerified(user: User): void {
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'EMAIL_NOT_VERIFIED',
        message: t('auth.EMAIL_NOT_VERIFIED'),
      });
    }
  }

  /** Idioma de la petición en curso; se lee antes del envío en segundo plano. */
  private currentLocale(): string {
    return I18nContext.current()?.lang ?? 'en';
  }
}
