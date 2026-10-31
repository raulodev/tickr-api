import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { Role } from '../generated/prisma/client.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { t } from '../i18n/t.js';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw new ConflictException(t('auth.EMAIL_ALREADY_REGISTERED'));

    const password = await bcrypt.hash(dto.password, 10);

    const slug =
      dto.tenantName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      randomBytes(3).toString('hex');

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

    return this.signToken(user.id, user.memberships[0]);
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

    return {
      ...(await this.signToken(user.id, membership)),
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
}
