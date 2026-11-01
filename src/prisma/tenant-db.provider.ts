import { Inject, Provider } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';
import { tenantExtension } from './tenant-extension.js';

export const createScopedClient = (
  prisma: PrismaClient,
  getTenantId: () => string | undefined,
) => prisma.$extends(tenantExtension(getTenantId));

export type ScopedPrismaClient = ReturnType<typeof createScopedClient>;

export const TENANT_DB = Symbol('TENANT_DB');
export const InjectTenantDb = () => Inject(TENANT_DB);

export const tenantDbProvider: Provider = {
  provide: TENANT_DB,
  inject: [PrismaService, ClsService],
  useFactory: (prisma: PrismaService, cls: ClsService) =>
    createScopedClient(prisma, () => cls.get('tenantId')),
};
