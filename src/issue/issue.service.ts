import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { type AuthUser } from '../auth/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  InjectTenantDb,
  type ScopedPrismaClient,
} from '../prisma/tenant-db.provider.js';
import { t } from '../i18n/t.js';
import { CreateIssueDto } from './dto/create-issue.dto.js';
import { UpdateIssueDto } from './dto/update-issue.dto.js';
import { ListIssuesQueryDto } from './dto/list-issues-query.dto.js';

const include = { project: { select: { key: true } } } as const;
type IssueWithProject = Prisma.IssueGetPayload<{ include: typeof include }>;

/** Añade la clave visible (TKR-12) y oculta el objeto project interno */
const toResponse = ({ project, ...issue }: IssueWithProject) => ({
  ...issue,
  key: `${project.key}-${issue.number}`,
});

@Injectable()
export class IssueService {
  constructor(
    @InjectTenantDb() private db: ScopedPrismaClient,
    private prisma: PrismaService, // Membership no tiene tenant scoping: se consulta con tenantId explícito
  ) {}

  async list(query: ListIssuesQueryDto) {
    const { page, limit, projectId, status, priority, assigneeId } = query;
    const where = { projectId, status, priority, assigneeId }; // undefined = sin filtro

    const [issues, total] = await Promise.all([
      this.db.issue.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { number: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.issue.count({ where }),
    ]);
    return { data: issues.map(toResponse), meta: { total, page, limit } };
  }

  async findOne(id: string) {
    return toResponse(await this.getOrFail(id));
  }

  async create(user: AuthUser, dto: CreateIssueDto) {
    if (dto.assigneeId) await this.assertMember(user.tenantId, dto.assigneeId);

    try {
      const issue = await this.db.$transaction(async (tx) => {
        // El UPDATE bloquea la fila del proyecto hasta el commit: los números se asignan de uno en uno
        const { issueCounter } = await tx.project.update({
          where: { id: dto.projectId },
          data: { issueCounter: { increment: 1 } },
          select: { issueCounter: true },
        });

        return tx.issue.create({
          data: {
            tenantId: user.tenantId,
            projectId: dto.projectId,
            number: issueCounter,
            title: dto.title,
            description: dto.description,
            priority: dto.priority,
            assigneeId: dto.assigneeId,
            reporterId: user.sub,
          },
          include,
        });
      });
      return toResponse(issue);
    } catch (e) {
      // P2025: el proyecto no existe (o es de otra organización: el cliente scoped no lo ve)
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException(t('project.NOT_FOUND'));
      }
      throw e;
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateIssueDto) {
    await this.getOrFail(id);
    if (dto.assigneeId) await this.assertMember(user.tenantId, dto.assigneeId);

    const issue = await this.db.issue.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        assigneeId: dto.assigneeId,
      },
      include,
    });
    return toResponse(issue);
  }

  async remove(id: string) {
    await this.getOrFail(id);
    await this.db.issue.delete({ where: { id } });
  }

  private async getOrFail(id: string) {
    const issue = await this.db.issue.findUnique({ where: { id }, include });
    if (!issue) throw new NotFoundException(t('issue.NOT_FOUND'));
    return issue;
  }

  private async assertMember(tenantId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    if (!membership)
      throw new BadRequestException(t('issue.ASSIGNEE_NOT_MEMBER'));
  }
}
