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
import { type AuthUser, CurrentUser } from '../auth/auth-user.js';
import { PaginationQueryDto } from '../common/pagination-query.dto.js';
import { CommentService } from './comment.service.js';
import { CommentBodyDto } from './dto/comment-body.dto.js';

@ApiTags('comments')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class CommentController {
  constructor(private comments: CommentService) {}

  @Get('issues/:issueId/comments')
  list(
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.comments.list(issueId, query);
  }

  @Post('issues/:issueId/comments')
  create(
    @CurrentUser() user: AuthUser,
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Body() dto: CommentBodyDto,
  ) {
    return this.comments.create(user, issueId, dto);
  }

  @Patch('comments/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommentBodyDto,
  ) {
    return this.comments.update(user, id, dto);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.comments.remove(user, id);
  }
}
