import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { tenantDbProvider, TENANT_DB } from './tenant-db.provider.js';

@Global()
@Module({
  providers: [PrismaService, tenantDbProvider],
  exports: [PrismaService, TENANT_DB],
})
export class PrismaModule {}
