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
import { PaginationQueryDto } from '../common/pagination-query.dto.js';
import { ProjectService } from './project.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
@UseGuards(AuthGuard, RolesGuard)
export class ProjectController {
  constructor(private projects: ProjectService) {}

  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.projects.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user.tenantId, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.remove(id);
  }
}
