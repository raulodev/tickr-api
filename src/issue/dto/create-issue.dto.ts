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
import { IssuePriority } from '../../generated/prisma/client.js';

export class CreateIssueDto {
  @ApiProperty()
  @IsUUID('all', { message: i18nValidationMessage('validation.ID_INVALID') })
  projectId: string;

  @ApiProperty()
  @IsString({
    message: i18nValidationMessage('validation.ISSUE_TITLE_REQUIRED'),
  })
  @MinLength(3, {
    message: i18nValidationMessage('validation.ISSUE_TITLE_MIN_LENGTH'),
  })
  @MaxLength(200, {
    message: i18nValidationMessage('validation.ISSUE_TITLE_MAX_LENGTH'),
  })
  title: string;

  @ApiProperty()
  @IsOptional()
  @IsString({
    message: i18nValidationMessage('validation.ISSUE_DESCRIPTION_INVALID'),
  })
  @MaxLength(10000, {
    message: i18nValidationMessage('validation.ISSUE_DESCRIPTION_MAX_LENGTH'),
  })
  description?: string;

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
