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
import { type AuthUser, CurrentUser } from '../auth/auth-user.js';
import { ApiErrorResponseDto } from '../common/dto/api-error-response.dto.js';
import { PaginationQueryDto } from '../common/pagination-query.dto.js';
import { CommentService } from './comment.service.js';
import { CommentBodyDto } from './dto/comment-body.dto.js';
import { CommentListResponseDto } from './dto/comment-list-response.dto.js';
import { CommentResponseDto } from './dto/comment-response.dto.js';

@ApiTags('comments')
@ApiBearerAuth()
@Controller('api/')
@UseGuards(AuthGuard, RolesGuard)
export class CommentController {
  constructor(private comments: CommentService) {}

  @Get('issues/:issueId/comments')
  @ApiOkResponse({ type: CommentListResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  list(
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.comments.list(issueId, query);
  }

  @Post('issues/:issueId/comments')
  @ApiCreatedResponse({ type: CommentResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  create(
    @CurrentUser() user: AuthUser,
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Body() dto: CommentBodyDto,
  ) {
    return this.comments.create(user, issueId, dto);
  }

  @Patch('comments/:id')
  @ApiOkResponse({ type: CommentResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommentBodyDto,
  ) {
    return this.comments.update(user, id, dto);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.comments.remove(user, id);
  }
}
