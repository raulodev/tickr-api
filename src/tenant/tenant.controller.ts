import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { type AuthUser, CurrentUser } from '../auth/auth-user.js';
import { Role } from '../generated/prisma/client.js';
import { TenantService } from './tenant.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { AddMemberDto } from './dto/add-member.dto.js';
import { ChangeRoleDto } from './dto/change-role.dto.js';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
@UseGuards(AuthGuard, RolesGuard)
export class TenantController {
  constructor(private tenants: TenantService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTenantDto) {
    return this.tenants.create(user.sub, dto);
  }

  @Get('current/members')
  listMembers(@CurrentUser() user: AuthUser) {
    return this.tenants.listMembers(user.tenantId);
  }

  @Post('current/members')
  @Roles(Role.ADMIN)
  addMember(@CurrentUser() user: AuthUser, @Body() dto: AddMemberDto) {
    return this.tenants.addMember(user.tenantId, dto);
  }

  @Delete('current/members/:userId')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.tenants.removeMember(user.tenantId, userId);
  }

  @Patch('current/members/:userId')
  @Roles(Role.ADMIN)
  changeRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.tenants.changeRole(user.tenantId, userId, dto);
  }
}
