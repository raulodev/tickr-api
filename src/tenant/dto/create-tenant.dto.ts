import { IsString, MinLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateTenantDto {
  @IsString({
    message: i18nValidationMessage('validation.TENANT_NAME_REQUIRED'),
  })
  @MinLength(2, {
    message: i18nValidationMessage('validation.TENANT_NAME_MIN_LENGTH'),
  })
  name: string;
}
