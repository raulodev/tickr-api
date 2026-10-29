import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service.js';
import { TenantController } from './tenant.controller.js';

@Module({
  controllers: [TenantController],
  providers: [TenantService],
})
export class TenantModule {}
