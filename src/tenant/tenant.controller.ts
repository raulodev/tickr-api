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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { type AuthUser, CurrentUser } from '../auth/auth-user.js';
import { ApiErrorResponseDto } from '../common/dto/api-error-response.dto.js';
import { Role } from '../generated/prisma/client.js';
import { TenantService } from './tenant.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { CreateTenantResponseDto } from './dto/create-tenant-response.dto.js';
import { AddMemberDto } from './dto/add-member.dto.js';
import { ChangeRoleDto } from './dto/change-role.dto.js';
import { TenantMemberResponseDto } from './dto/tenant-member-response.dto.js';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
@UseGuards(AuthGuard, RolesGuard)
export class TenantController {
  constructor(private tenants: TenantService) {}

  @Post()
  @ApiCreatedResponse({ type: CreateTenantResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTenantDto) {
    return this.tenants.create(user.sub, dto);
  }

  @Get('current/members')
  @ApiOkResponse({ type: TenantMemberResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  listMembers(@CurrentUser() user: AuthUser) {
    return this.tenants.listMembers(user.tenantId);
  }

  @Post('current/members')
  @Roles(Role.ADMIN)
  @ApiCreatedResponse({ type: TenantMemberResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  addMember(@CurrentUser() user: AuthUser, @Body() dto: AddMemberDto) {
    return this.tenants.addMember(user.tenantId, dto);
  }

  @Delete('current/members/:userId')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.tenants.removeMember(user.tenantId, userId, user.sub);
  }

  @Patch('current/members/:userId')
  @Roles(Role.ADMIN)
  @ApiOkResponse({ type: TenantMemberResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  changeRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.tenants.changeRole(user.tenantId, userId, dto);
  }
}
