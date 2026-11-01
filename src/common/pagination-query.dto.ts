import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class PaginationQueryDto {
  @ApiProperty()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.PAGE_INVALID') })
  @Min(1, { message: i18nValidationMessage('validation.PAGE_INVALID') })
  page: number = 1;

  @ApiProperty()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.LIMIT_INVALID') })
  @Min(1, { message: i18nValidationMessage('validation.LIMIT_INVALID') })
  @Max(100, { message: i18nValidationMessage('validation.LIMIT_INVALID') })
  limit: number = 20;
}
