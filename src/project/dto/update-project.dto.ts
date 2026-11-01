import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProjectDto {
  @ApiProperty()
  @IsOptional()
  @IsString({
    message: i18nValidationMessage('validation.PROJECT_NAME_REQUIRED'),
  })
  @MinLength(2, {
    message: i18nValidationMessage('validation.PROJECT_NAME_MIN_LENGTH'),
  })
  @MaxLength(100, {
    message: i18nValidationMessage('validation.PROJECT_NAME_MAX_LENGTH'),
  })
  name?: string;
}
