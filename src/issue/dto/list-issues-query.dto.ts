import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';
import { IssuePriority, IssueStatus } from '../../generated/prisma/client.js';

export class ListIssuesQueryDto extends PaginationQueryDto {
  @ApiProperty()
  @IsOptional()
  @IsUUID('all', { message: i18nValidationMessage('validation.ID_INVALID') })
  projectId?: string;

  @ApiProperty()
  @IsOptional()
  @IsEnum(IssueStatus, {
    message: i18nValidationMessage('validation.ISSUE_STATUS_INVALID'),
  })
  status?: IssueStatus;

  @ApiProperty()
  @IsOptional()
  @IsEnum(IssuePriority, {
    message: i18nValidationMessage('validation.ISSUE_PRIORITY_INVALID'),
  })
  priority?: IssuePriority;

  @ApiProperty()
  @IsOptional()
  @IsUUID('all', { message: i18nValidationMessage('validation.ID_INVALID') })
  assigneeId?: string;
}
