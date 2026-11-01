import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IssuePriority, IssueStatus } from '../../generated/prisma/client.js';

export class UpdateIssueDto {
  @ApiProperty()
  @IsOptional()
  @IsString({
    message: i18nValidationMessage('validation.ISSUE_TITLE_REQUIRED'),
  })
  @MinLength(3, {
    message: i18nValidationMessage('validation.ISSUE_TITLE_MIN_LENGTH'),
  })
  @MaxLength(200, {
    message: i18nValidationMessage('validation.ISSUE_TITLE_MAX_LENGTH'),
  })
  title?: string;

  @ApiProperty()
  @IsOptional()
  @IsString({
    message: i18nValidationMessage('validation.ISSUE_DESCRIPTION_INVALID'),
  })
  @MaxLength(10000, {
    message: i18nValidationMessage('validation.ISSUE_DESCRIPTION_MAX_LENGTH'),
  })
  description?: string | null;

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
  assigneeId?: string | null;
}
