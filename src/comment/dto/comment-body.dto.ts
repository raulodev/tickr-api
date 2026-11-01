import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CommentBodyDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({
    message: i18nValidationMessage('validation.COMMENT_BODY_REQUIRED'),
  })
  @MinLength(1, {
    message: i18nValidationMessage('validation.COMMENT_BODY_REQUIRED'),
  })
  @MaxLength(5000, {
    message: i18nValidationMessage('validation.COMMENT_BODY_MAX_LENGTH'),
  })
  body: string;
}
