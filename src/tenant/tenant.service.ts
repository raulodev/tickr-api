import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { generateSlug } from '../common/slug.js';
import { Prisma, Role } from '../generated/prisma/client.js';
import { t } from '../i18n/t.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AddMemberDto } from './dto/add-member.dto.js';
import { ChangeRoleDto } from './dto/change-role.dto.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';

const memberInclude = {
  user: { select: { id: true, email: true, name: true } },
} as const;

const toMember = (m: {
  role: Role;
  user: { id: string; email: string; name: string | null };
}) => ({
  userId: m.user.id,
  email: m.user.email,
  name: m.user.name,
  role: m.role,
});

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
    return members.map((m) => toMember(m));
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
    await this.prisma.$transaction(async (tx) => {
      await this.lockTenant(tx, tenantId);

      const target = await tx.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
      });
      if (!target) throw new NotFoundException(t('tenant.MEMBER_NOT_FOUND'));

      if (target.role === Role.ADMIN) {
        const admins = await tx.membership.count({
          where: { tenantId, role: Role.ADMIN },
        });
        if (admins <= 1) throw new ConflictException(t('tenant.LAST_ADMIN'));
      }

      // Se le desasignan sus incidencias; las que reportó se conservan
      await tx.issue.updateMany({
        where: { tenantId, assigneeId: userId },
        data: { assigneeId: null },
      });
      await tx.membership.delete({ where: { id: target.id } });
    });
  }

  async changeRole(tenantId: string, userId: string, dto: ChangeRoleDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockTenant(tx, tenantId);

      const target = await tx.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
        include: memberInclude,
      });
      if (!target) throw new NotFoundException(t('tenant.MEMBER_NOT_FOUND'));

      if (target.role === dto.role) return toMember(target); // sin cambios

      if (target.role === Role.ADMIN) {
        const admins = await tx.membership.count({
          where: { tenantId, role: Role.ADMIN },
        });
        if (admins <= 1) throw new ConflictException(t('tenant.LAST_ADMIN'));
      }

      const updated = await tx.membership.update({
        where: { id: target.id },
        data: { role: dto.role },
        include: memberInclude,
      });
      return toMember(updated);
    });
  }

  /** Serializa los cambios de miembros de una organización:
   * evita dejarla sin administradores por concurrencia */
  private lockTenant(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${tenantId} FOR UPDATE`;
  }
}
