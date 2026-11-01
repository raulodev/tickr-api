import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '../generated/prisma/client.js';
import { type AuthUser } from '../auth/auth-user.js';
import {
  InjectTenantDb,
  type ScopedPrismaClient,
} from '../prisma/tenant-db.provider.js';
import { PaginationQueryDto } from '../common/pagination-query.dto.js';
import { t } from '../i18n/t.js';
import { CommentBodyDto } from './dto/comment-body.dto.js';

const include = {
  author: { select: { id: true, name: true, email: true } },
} as const;

@Injectable()
export class CommentService {
  constructor(@InjectTenantDb() private db: ScopedPrismaClient) {}

  async list(issueId: string, { page, limit }: PaginationQueryDto) {
    await this.assertIssue(issueId);
    const where = { issueId };

    const [data, total] = await Promise.all([
      this.db.comment.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.comment.count({ where }),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async create(user: AuthUser, issueId: string, dto: CommentBodyDto) {
    await this.assertIssue(issueId);
    try {
      return await this.db.comment.create({
        data: {
          tenantId: user.tenantId,
          issueId,
          authorId: user.sub,
          body: dto.body,
        },
        include,
      });
    } catch (e) {
      // P2003: la incidencia desapareció entre la comprobación y la escritura (la clave compuesta lo detecta)
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new NotFoundException(t('issue.NOT_FOUND'));
      }
      throw e;
    }
  }

  async update(user: AuthUser, id: string, dto: CommentBodyDto) {
    const comment = await this.getOrFail(id);
    if (comment.authorId !== user.sub) {
      throw new ForbiddenException(t('comment.EDIT_NOT_ALLOWED'));
    }
    return this.db.comment.update({
      where: { id },
      data: { body: dto.body },
      include,
    });
  }

  async remove(user: AuthUser, id: string) {
    const comment = await this.getOrFail(id);
    if (comment.authorId !== user.sub && user.role !== Role.ADMIN) {
      throw new ForbiddenException(t('comment.DELETE_NOT_ALLOWED'));
    }
    await this.db.comment.delete({ where: { id } });
  }

  private async getOrFail(id: string) {
    const comment = await this.db.comment.findUnique({
      where: { id },
      include,
    });
    if (!comment) throw new NotFoundException(t('comment.NOT_FOUND'));
    return comment;
  }

  private async assertIssue(issueId: string) {
    const issue = await this.db.issue.findUnique({
      where: { id: issueId },
      select: { id: true },
    });
    if (!issue) throw new NotFoundException(t('issue.NOT_FOUND'));
  }
}
