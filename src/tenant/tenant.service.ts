import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import { Role } from '../generated/prisma/client.js';
import { generateSlug } from '../common/slug.js';
import { t } from '../i18n/t.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { AddMemberDto } from './dto/add-member.dto.js';

@Injectable()
export class TenantService {
  constructor(
    private prisma: PrismaService,
    private auth: AuthService,
  ) {}

  async create(userId: string, dto: CreateTenantDto) {
    const membership = await this.prisma.membership.create({
      data: {
        role: Role.ADMIN,
        user: { connect: { id: userId } },
        tenant: { create: { name: dto.name, slug: generateSlug(dto.name) } },
      },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });

    return {
      organization: { ...membership.tenant, role: membership.role },
      ...(await this.auth.issueToken(userId, membership)),
    };
  }

  async listMembers(tenantId: string) {
    const members = await this.prisma.membership.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return members.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
    }));
  }

  async addMember(tenantId: string, dto: AddMemberDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new NotFoundException(t('tenant.USER_NOT_FOUND'));

    const existing = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
    });
    if (existing) throw new ConflictException(t('tenant.ALREADY_MEMBER'));

    const membership = await this.prisma.membership.create({
      data: { userId: user.id, tenantId, role: dto.role ?? Role.MEMBER },
    });
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: membership.role,
    };
  }

  async removeMember(tenantId: string, userId: string) {
    const target = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    if (!target) throw new NotFoundException(t('tenant.MEMBER_NOT_FOUND'));

    if (target.role === Role.ADMIN) {
      const admins = await this.prisma.membership.count({
        where: { tenantId, role: Role.ADMIN },
      });
      if (admins <= 1) throw new ConflictException(t('tenant.LAST_ADMIN'));
    }

    await this.prisma.membership.delete({ where: { id: target.id } });
  }
}
