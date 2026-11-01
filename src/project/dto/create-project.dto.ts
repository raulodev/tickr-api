import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateProjectDto {
  @ApiProperty()
  @IsString({
    message: i18nValidationMessage('validation.PROJECT_NAME_REQUIRED'),
  })
  @MinLength(2, {
    message: i18nValidationMessage('validation.PROJECT_NAME_MIN_LENGTH'),
  })
  @MaxLength(100, {
    message: i18nValidationMessage('validation.PROJECT_NAME_MAX_LENGTH'),
  })
  name: string;

  @ApiProperty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z][A-Z0-9]{1,9}$/, {
    message: i18nValidationMessage('validation.PROJECT_KEY_INVALID'),
  })
  key: string;
}
