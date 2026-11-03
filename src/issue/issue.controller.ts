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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { IssueService } from './issue.service.js';
import { CreateIssueDto } from './dto/create-issue.dto.js';
import { IssueHistoryResponseDto } from './dto/issue-history-response.dto.js';
import { IssueListResponseDto } from './dto/issue-list-response.dto.js';
import { IssueResponseDto } from './dto/issue-response.dto.js';
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
  @ApiOkResponse({ type: IssueListResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  list(@Query() query: ListIssuesQueryDto) {
    return this.issues.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: IssueResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.issues.findOne(id);
  }

  @Post()
  @ApiCreatedResponse({ type: IssueResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateIssueDto) {
    return this.issues.create(user, dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: IssueResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
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
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.issues.remove(id);
  }

  @Get(':id/history')
  @ApiOkResponse({ type: IssueHistoryResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.issues.history(id, query);
  }
}
