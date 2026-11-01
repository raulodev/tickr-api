import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  InjectTenantDb,
  type ScopedPrismaClient,
} from '../prisma/tenant-db.provider.js';
import { PaginationQueryDto } from '../common/pagination-query.dto.js';
import { t } from '../i18n/t.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';

@Injectable()
export class ProjectService {
  constructor(@InjectTenantDb() private db: ScopedPrismaClient) {}

  async list({ page, limit }: PaginationQueryDto) {
    const [data, total] = await Promise.all([
      this.db.project.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.project.count(),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async findOne(id: string) {
    // Un id de otro tenant tampoco se encuentra: la extensión filtra por el tenant activo
    const project = await this.db.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(t('project.NOT_FOUND'));
    return project;
  }

  async create(tenantId: string, dto: CreateProjectDto) {
    try {
      return await this.db.project.create({
        data: { name: dto.name, key: dto.key, tenantId },
      });
    } catch (e) {
      // La restricción única (tenantId, key) es la garantía real, incluso con peticiones simultáneas
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(t('project.KEY_ALREADY_EXISTS'));
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.findOne(id);
    return this.db.project.update({ where: { id }, data: { name: dto.name } });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.db.project.delete({ where: { id } });
  }
}
