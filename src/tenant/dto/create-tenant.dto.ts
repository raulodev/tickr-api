import { IsString, MinLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiProperty()
  @IsString({
    message: i18nValidationMessage('validation.TENANT_NAME_REQUIRED'),
  })
  @ApiProperty()
  @MinLength(2, {
    message: i18nValidationMessage('validation.TENANT_NAME_MIN_LENGTH'),
  })
  name: string;
}
