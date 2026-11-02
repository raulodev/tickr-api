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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { type AuthUser, CurrentUser } from '../auth/auth-user.js';
import { Role } from '../generated/prisma/client.js';
import { IssueService } from './issue.service.js';
import { CreateIssueDto } from './dto/create-issue.dto.js';
import { UpdateIssueDto } from './dto/update-issue.dto.js';
import { ListIssuesQueryDto } from './dto/list-issues-query.dto.js';
import { PaginationQueryDto } from '../common/pagination-query.dto.js';

@ApiTags('issues')
@ApiBearerAuth()
@Controller('issues')
@UseGuards(AuthGuard, RolesGuard)
export class IssueController {
  constructor(private issues: IssueService) {}

  @Get()
  list(@Query() query: ListIssuesQueryDto) {
    return this.issues.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.issues.findOne(id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateIssueDto) {
    return this.issues.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIssueDto,
  ) {
    return this.issues.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.issues.remove(id);
  }

  @Get(':id/history')
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.issues.history(id, query);
  }
}
